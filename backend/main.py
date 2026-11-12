from contextlib import asynccontextmanager
from datetime import date, datetime, timezone

from pathlib import Path

import os

import re

import io

import json
import logging

import secrets
import base64
import hashlib
import hmac
import time
import httpx
import unicodedata
from typing import Optional, List, Literal
from collections import defaultdict, deque
from threading import Lock



from fastapi import FastAPI, HTTPException, Header, UploadFile, File, Form, Query, status, Request, Response, Cookie

from fastapi.middleware.cors import CORSMiddleware

from fastapi.responses import FileResponse, JSONResponse

from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool

from pydantic import BaseModel, Field
from psycopg import OperationalError
from psycopg.errors import UniqueViolation, UndefinedTable
try:
    from psycopg_pool import PoolTimeout
except ImportError:  # The pool package is optional; direct connections use OperationalError.
    PoolTimeout = None
from PIL import Image, UnidentifiedImageError
import warnings



try:  # optional: load local .env for developer setups (never required in production)

    from dotenv import load_dotenv



    load_dotenv(Path(__file__).parent / ".env")  # backend/.env

    load_dotenv(Path(__file__).parent.parent / ".env")  # repo-root .env (takes precedence)

except ImportError:

    pass



try:

    import engine

except ImportError:

    from backend import engine



try:

    import cpp_bridge

except ImportError:

    try:

        from backend import cpp_bridge

    except ImportError:

        cpp_bridge = None


try:

    import location_service
    import ocr_service
    import deed_digitization_service
    import deed_digitization_api

except ImportError:

    from backend import location_service, ocr_service, deed_digitization_service, deed_digitization_api



try:

    from chat_service import chat_service

except ImportError:

    try:

        from backend.chat_service import chat_service

    except ImportError:

        chat_service = None



try:

    import deed_search

except ImportError:

    from backend import deed_search



@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize the database when reachable without taking down the web app."""
    if os.environ.get("APP_ENV", "development").lower() == "production":
        _auth_secret()
        if not os.environ.get("DATABASE_URL"):
            raise RuntimeError("DATABASE_URL must be configured in production")
        if not os.environ.get("CORS_ORIGINS") or "*" in os.environ["CORS_ORIGINS"].split(","):
            raise RuntimeError("CORS_ORIGINS must contain explicit production origins")
        if any(not origin.strip().lower().startswith("https://") for origin in os.environ["CORS_ORIGINS"].split(",") if origin.strip()):
            raise RuntimeError("Production CORS_ORIGINS must use HTTPS")
    try:
        try:
            await run_in_threadpool(engine.init)
            logging.getLogger(__name__).info("Database initialization successful.")
        except Exception as exc:
            if not _is_database_unavailable(exc):
                raise
            logging.getLogger(__name__).warning(
                "Database unavailable during startup (%s); API requests will retry initialization",
                type(exc).__name__,
            )
        yield
    finally:
        close_pool = getattr(engine, "close_pool", None)
        if close_pool:
            close_pool()


app = FastAPI(
    title="LandGuard AI — Unified Digital Land Security Platform",
    description="Digital Land Security Platform for Bangladesh (P2 + P4 + P5)",
    version="2.0.0",
    lifespan=lifespan,
    docs_url=None if os.environ.get("APP_ENV", "development").lower() == "production" else "/docs",
    redoc_url=None if os.environ.get("APP_ENV", "development").lower() == "production" else "/redoc",
    openapi_url=None if os.environ.get("APP_ENV", "development").lower() == "production" else "/openapi.json",
)


_DATABASE_UNAVAILABLE_TYPES = (OperationalError, TimeoutError) + ((PoolTimeout,) if PoolTimeout else ())


def _is_database_unavailable(exc: Exception) -> bool:
    if isinstance(exc, _DATABASE_UNAVAILABLE_TYPES):
        return True
    return isinstance(exc, RuntimeError) and "DATABASE_URL environment variable is not set" in str(exc)


@app.middleware("http")
async def initialize_database_for_api(request: Request, call_next):
    """Retry schema initialization on DB-backed API calls after an offline cold start."""
    path = request.url.path
    needs_database = path.startswith("/api/") and path not in {"/api/engine/status", "/api/benchmark"}
    try:
        if needs_database:
            await run_in_threadpool(engine.init)
        return await call_next(request)
    except Exception as exc:
        if not _is_database_unavailable(exc):
            raise
        logging.getLogger(__name__).warning(
            "Database unavailable while serving %s (%s)", path, type(exc).__name__
        )
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "detail": "ডেটাবেজ সংযোগে সাময়িক সমস্যা হয়েছে। আবার চেষ্টা করুন। (Database is temporarily unavailable. Please retry.)"
            },
            headers={"Retry-After": "2"},
        )


@app.exception_handler(OperationalError)
async def database_connection_error(request: Request, exc: OperationalError):
    """Report transient PostgreSQL transport failures as retryable responses."""
    logging.getLogger(__name__).warning(
        "PostgreSQL connection failed while handling %s (%s)",
        request.url.path,
        type(exc).__name__,
    )
    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        content={
            "detail": "ডেটাবেজ সংযোগে সাময়িক সমস্যা হয়েছে। আবার চেষ্টা করুন। (Database connection is temporarily unavailable. Please retry.)"
        },
        headers={"Retry-After": "1"},
    )



# Enable CORS — restricted to configured origins (CORS_ORIGINS env var, comma-separated)

_default_origins = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8000,http://127.0.0.1:8000"

cors_origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", _default_origins).split(",") if o.strip()]

app.add_middleware(

    CORSMiddleware,

    allow_origins=cors_origins,

    allow_credentials=True,

    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],

    allow_headers=["Authorization", "Content-Type", "Accept", "X-Request-ID"],

    expose_headers=["X-Request-ID", "Retry-After"],

)


# Store normalized profile photos in PostgreSQL so they survive serverless
# function restarts and deployments.
PROFILE_PICTURE_MAX_BYTES = 5 * 1024 * 1024
PROFILE_PICTURE_MIME_FORMATS = {
    "image/jpeg": "JPEG",
    "image/png": "PNG",
    "image/webp": "WEBP",
}


def _normalize_profile_picture(data: bytes, content_type: str) -> bytes:
    declared_type = (content_type or "").split(";", 1)[0].strip().lower()
    expected_format = PROFILE_PICTURE_MIME_FORMATS.get(declared_type)
    if not expected_format:
        raise HTTPException(status_code=415, detail="Use a JPEG, PNG, or WebP image")

    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data)) as source:
                if source.format != expected_format:
                    raise HTTPException(status_code=415, detail="Image content does not match its file type")
                if source.width < 1 or source.height < 1 or source.width * source.height > 25_000_000:
                    raise HTTPException(status_code=413, detail="Image dimensions are too large")
                source.verify()
            with Image.open(io.BytesIO(data)) as source:
                source.load()
                normalized = source.convert("RGBA" if "A" in source.getbands() else "RGB")
                normalized.thumbnail((512, 512), Image.Resampling.LANCZOS)
                output = io.BytesIO()
                normalized.save(output, format="WEBP", quality=88, method=5)
                normalized_data = output.getvalue()
                if len(normalized_data) > PROFILE_PICTURE_MAX_BYTES:
                    raise HTTPException(status_code=413, detail="Profile picture output is too large")
                return normalized_data
    except HTTPException:
        raise
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise HTTPException(status_code=415, detail="The uploaded file is not a valid image") from exc


@app.middleware("http")
async def security_headers(request: Request, call_next):
    incoming_request_id = request.headers.get("x-request-id", "").strip()
    request_id = (
        incoming_request_id
        if re.fullmatch(r"[A-Za-z0-9._-]{1,64}", incoming_request_id)
        else secrets.token_hex(12)
    )
    request.state.request_id = request_id
    started_at = time.perf_counter()
    logger = logging.getLogger("uvicorn.error")
    try:
        response = await call_next(request)
    except Exception as exc:
        duration_ms = (time.perf_counter() - started_at) * 1000
        logger.error(
            "request_failed request_id=%s method=%s path=%s duration_ms=%.2f exception_type=%s",
            request_id,
            request.method,
            request.url.path,
            duration_ms,
            type(exc).__name__,
        )
        response = JSONResponse(
            status_code=500,
            content={"detail": "Internal server error", "request_id": request_id},
        )

    duration_ms = (time.perf_counter() - started_at) * 1000
    response.headers["X-Request-ID"] = request_id
    logger.info(
        "request_complete request_id=%s method=%s path=%s status=%s duration_ms=%.2f",
        request_id,
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
    )
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    if request.url.path.startswith("/api/"):
        response.headers.setdefault("Cache-Control", "no-store")
    if os.environ.get("APP_ENV", "development").lower() == "production":
        response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        response.headers.setdefault(
            "Content-Security-Policy",
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: blob: https:; font-src 'self' data: https:; connect-src 'self' https:; "
            "object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
        )
    return response



@app.get("/health")
def health_check():
    """Liveness probe: confirms the API process can serve requests."""
    return {"status": "ok", "service": "Bhumisetu API"}


@app.get("/ready")
def readiness_check():
    """Readiness probe: confirms the API can reach PostgreSQL."""
    try:
        engine.ping_database(timeout=1.5)
    except Exception as exc:
        logging.getLogger(__name__).warning(
            "Readiness check failed (%s)", type(exc).__name__
        )
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"status": "unready", "database": "unavailable"},
            headers={"Retry-After": "2"},
        )
    return {"status": "ready", "database": "ok"}





@app.get("/api")

def api_root():

    return {

        "status": "online",

        "service": "BhumiSathi API",

        "version": "2.0.0"

    }





# =====================================================================

# PYDANTIC SCHEMAS

# =====================================================================



class RecordIn(BaseModel):

    deed_no: str = Field(min_length=1)

    plot_id: str = Field(min_length=1)

    seller: str = Field(min_length=1)

    buyer: str = Field(min_length=1)

    sale_date: date

    price: float = Field(gt=0)

    area: float = Field(gt=0)





class LoginRequest(BaseModel):

    identifier: str = Field(min_length=1, max_length=254)

    password: str = Field(min_length=1, max_length=256)





class RegisterRequest(BaseModel):

    name: str = Field(min_length=2)

    username: str = Field(min_length=4, max_length=30)

    email: str = Field(min_length=6, max_length=254)

    password: str = Field(min_length=8, max_length=256)

    phone: Optional[str] = ""

    nid: Optional[str] = ""

    role: Optional[str] = "citizen"

    designation: Optional[str] = ""

    password_confirmation: str = Field(min_length=8, max_length=256)


class OfficerCreateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    username: str = Field(min_length=4, max_length=30)
    email: str = Field(min_length=6, max_length=254)
    password: str = Field(min_length=8, max_length=256)
    password_confirmation: str = Field(min_length=8, max_length=256)
    phone: str = Field(min_length=8, max_length=16)
    nid: str = Field(min_length=10, max_length=17)


class RecoveryIdentityRequest(BaseModel):
    username: str = Field(min_length=4, max_length=30)
    phone: str = Field(min_length=8, max_length=16)
    nid: str = Field(min_length=10, max_length=17)


class ForgotUsernameRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=160)
    phone: str = Field(min_length=8, max_length=16)
    nid: str = Field(min_length=10, max_length=17)


class RecoveryResetRequest(BaseModel):
    reset_token: str = Field(min_length=32, max_length=256)
    password: str = Field(min_length=8, max_length=256)
    password_confirmation: str = Field(min_length=8, max_length=256)





class DeedNumberSearchRequest(BaseModel):

    deed_no: str = Field(default="", max_length=120)



class DeedAdvancedSearchRequest(BaseModel):

    district: Optional[str] = Field(default="", max_length=120)

    upazila: Optional[str] = Field(default="", max_length=120)

    sub_registry_office: Optional[str] = Field(default="", max_length=120)

    reg_year: Optional[str] = Field(default="", max_length=8)

    deed_type: Optional[str] = Field(default="", max_length=80)

    seller_name: Optional[str] = Field(default="", max_length=120)

    buyer_name: Optional[str] = Field(default="", max_length=120)

    mouza: Optional[str] = Field(default="", max_length=120)

    plot_id: Optional[str] = Field(default="", max_length=80)

    khatian_no: Optional[str] = Field(default="", max_length=80)

    page: Optional[int] = 1

    page_size: Optional[int] = 10



class DeedSearchUnlockRequest(BaseModel):

    user_id: Optional[int] = None

    subject_type: Optional[str] = None

    subject_key: Optional[str] = None



class DeedVerifyRequest(BaseModel):

    deed_no: Optional[str] = ""

    selected_deed_id: Optional[int] = Field(default=None, gt=0)

    reg_year: Optional[int] = None

    deed_type: Optional[str] = Field(default="", max_length=60)

    district: Optional[str] = ""

    upazila: Optional[str] = ""

    mouza: Optional[str] = ""

    plot_id: Optional[str] = ""

    khatian_no: Optional[str] = ""

    owner_name: Optional[str] = ""

    buyer_name: Optional[str] = Field(default="", max_length=200)

    seller_name: Optional[str] = Field(default="", max_length=200)

    union_ward: Optional[str] = Field(default="", max_length=200)

    union_id: Optional[int] = Field(default=None, gt=0)

    notes: Optional[str] = ""

    division_id: Optional[int] = Field(default=None, gt=0)

    district_id: Optional[int] = Field(default=None, gt=0)

    location_id: Optional[int] = Field(default=None, gt=0)

    location_type: Optional[Literal["upazila", "police_thana"]] = None

    mouza_id: Optional[int] = Field(default=None, gt=0)

    mouza_input_mode: Optional[Literal["catalog", "manual"]] = None


class MutationApplyRequest(BaseModel):

    applicant_name: str

    applicant_nid: str

    applicant_phone: str

    applicant_address: str

    applicant_relation: Optional[str] = "Self"

    district: str

    upazila: str

    mouza: str

    jl_no: Optional[str] = ""

    khatian_type: str = "BS"

    khatian_no: str

    plot_no: str

    land_area: float

    land_class: Optional[str] = "নাল (Nal)"

    ownership_source: Optional[str] = "ক্রয়সূত্রে (Purchase)"

    deed_no: str

    deed_date: Optional[str] = None

    supporting_docs: Optional[List[str]] = []

    is_draft: Optional[bool] = False

    review_notes: Optional[str] = ""





class MutationActionRequest(BaseModel):

    tracking_no: str

    new_status: str

    changed_by_name: Optional[str] = "কর্মকর্তা"

    changed_by_role: Optional[str] = "officer"

    remarks: Optional[str] = ""

    rejection_reason: Optional[str] = ""

    correction_details: Optional[str] = ""





class MutationAssignmentRequest(BaseModel):
    officer_id: Optional[int] = Field(default=None, gt=0)


class MutationResubmitRequest(BaseModel):

    applicant_name: Optional[str] = None

    applicant_phone: Optional[str] = None

    applicant_address: Optional[str] = None

    plot_no: Optional[str] = None

    khatian_no: Optional[str] = None

    land_area: Optional[float] = None

    deed_no: Optional[str] = None

    supporting_docs: Optional[List[str]] = None

    correction_notes: Optional[str] = ""





class ChatMessageRequest(BaseModel):

    message: str = Field(min_length=1, max_length=4000)

    history: Optional[List[dict]] = []

    tracking_no: Optional[str] = Field(default=None, max_length=80)

    current_page: Optional[str] = Field(default=None, max_length=64)





class DueDiligenceRequest(BaseModel):

    seller_name: str

    seller_nid: Optional[str] = ""

    deed_no: Optional[str] = ""

    reg_year: Optional[int] = 2025

    district: str = "ঢাকা"

    upazila: Optional[str] = ""

    mouza: str

    khatian_no: Optional[str] = ""

    plot_no: str

    recorded_area: Optional[float] = 0.0

    proposed_area: float

    documents_held: Optional[List[str]] = []

    has_court_dispute: Optional[bool] = False





# =====================================================================

# STATIC & FRONTEND SERVING

# =====================================================================



FRONTEND_DIST = Path(__file__).parent.parent / "frontend" / "dist"

LEGACY_INDEX = Path(__file__).parent.parent / "frontend" / "legacy_index.html"

BASE_INDEX = Path(__file__).parent.parent / "frontend" / "index.html"

PUBLIC_INDEX = Path(__file__).parent.parent / "public" / "index.html"



# If built Vite assets exist, mount them

if (FRONTEND_DIST / "assets").exists():

    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="assets")





@app.get("/")

def index():

    if PUBLIC_INDEX.exists():

        return FileResponse(PUBLIC_INDEX)

    if (FRONTEND_DIST / "index.html").exists():

        return FileResponse(FRONTEND_DIST / "index.html")

    if BASE_INDEX.exists():

        return FileResponse(BASE_INDEX)

    if LEGACY_INDEX.exists():

        return FileResponse(LEGACY_INDEX)

    return {"message": "LandGuard AI backend running"}





# =====================================================================

# AUTHENTICATION ROUTES

# =====================================================================



@app.post("/api/auth/login")
def login(
    req: LoginRequest,
    request: Request,
    response: Response = None,
    refresh_cookie: Optional[str] = Cookie(None, alias="bhumisetu_refresh"),
):
    identifier = req.identifier.strip().lower()
    identifier_is_email = "@" in identifier
    client_ip = request.client.host if request.client else "unknown"
    _enforce_login_ip_rate_limit(client_ip, identifier)

    authenticated_user = None
    locked_seconds = 0
    failure_lock_seconds = 0
    with engine.conn() as c:
        if identifier_is_email:
            account = c.execute(
                "SELECT * FROM users WHERE LOWER(BTRIM(email))=%s LIMIT 1",
                (identifier,),
            ).fetchone()
        else:
            account = c.execute(
                "SELECT * FROM users WHERE LOWER(username)=%s LIMIT 1",
                (identifier,),
            ).fetchone()
        if account:
            locked_seconds = _login_lockout_remaining(c, account["id"])
            if not locked_seconds:
                if engine.verify_password(req.password, account["password_hash"], account["salt"]):
                    if engine.password_needs_rehash(account["password_hash"]):
                        password_hash, salt = engine.hash_password(req.password)
                        c.execute(
                            "UPDATE users SET password_hash=%s,salt=%s,updated_at=%s WHERE id=%s",
                            (password_hash, salt, datetime.now().isoformat(), account["id"]),
                        )
                        account["password_hash"], account["salt"] = password_hash, salt
                    _clear_login_failures(c, account["id"])
                    authenticated_user = dict(account)
                    authenticated_user.pop("password_hash", None)
                    authenticated_user.pop("salt", None)
                else:
                    _, failure_lock_seconds = _record_login_failure(c, account["id"])

    if locked_seconds or failure_lock_seconds:
        _raise_login_lockout(locked_seconds or failure_lock_seconds)
    if not authenticated_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="ইমেইল/ব্যবহারকারীর নাম অথবা পাসওয়ার্ড সঠিক নয় (Invalid credentials)",
        )

    authenticated_user["nid_masked"] = _mask_nid(authenticated_user.pop("nid", None))

    engine.log_audit(
        authenticated_user["name"], authenticated_user["role"], "USER_LOGIN", "AUTH",
        f"Successful login for {authenticated_user['email']}",
    )
    token = _issue_login_access_token(authenticated_user, request, response, refresh_cookie)
    return {
        "success": True,
        "token": token,
        "user": _public_user_data(authenticated_user),
        "message": "লগইন সফল হয়েছে (Login successful)",
    }





def _normalize_nid(value: str) -> str:
    nid = str(value or "")
    if not re.fullmatch(r"[0-9]+", nid):
        raise HTTPException(status_code=422, detail="NID must contain numbers only.")
    if not re.fullmatch(r"^(?:[0-9]{10}|[0-9]{13}|[0-9]{17})$", nid):
        raise HTTPException(status_code=422, detail="Invalid NID. Only 10, 13 or 17 digits are accepted.")
    return nid


def _mask_nid(value: Optional[str]) -> Optional[str]:
    text = str(value or "")
    return ("••••••••" + text[-4:]) if text else None


def _public_user_data(user: dict) -> dict:
    allowed = (
        "id", "name", "username", "email", "phone", "role", "designation",
        "profile_picture", "nid_masked", "created_at",
    )
    return {key: user.get(key) for key in allowed if key in user}


def _valid_username(username: str) -> bool:
    return bool(re.fullmatch(r"[A-Za-z0-9_.]{4,30}", username))


def _raise_user_unique_conflict(exc: UniqueViolation):
    constraint = (getattr(getattr(exc, "diag", None), "constraint_name", None) or "").lower()
    if "nid" in constraint:
        detail = "An account with this NID already exists."
    elif "username" in constraint:
        detail = "This username is already taken."
    elif "email" in constraint:
        detail = "This email is already registered."
    else:
        detail = "An account with these details already exists."
    raise HTTPException(status_code=409, detail=detail) from exc


@app.get("/api/auth/username-availability")
def username_availability(username: str = ""):
    candidate = username.strip()
    if not _valid_username(candidate):
        return {"valid": False, "available": False, "message": "Invalid username"}
    with engine.conn() as c:
        taken = c.execute("SELECT 1 FROM users WHERE LOWER(username) = LOWER(%s) LIMIT 1", (candidate,)).fetchone()
    return {"valid": True, "available": not bool(taken), "message": "Already taken" if taken else "Available"}


@app.post("/api/auth/register")
def register(
    req: RegisterRequest,
    request: Request = None,
    response: Response = None,
    refresh_cookie: Optional[str] = Cookie(None, alias="bhumisetu_refresh"),
):
    client_ip = request.client.host if request and request.client else "unit-or-unknown"
    _enforce_login_ip_rate_limit(client_ip, "register")
    email = req.email.strip().lower()
    username = req.username.strip()
    username_key = username.lower()
    if req.password != req.password_confirmation:
        raise HTTPException(status_code=422, detail="Passwords do not match")
    if len(req.password) < 8:
        raise HTTPException(status_code=422, detail="Password must be at least 8 characters")
    if not _valid_username(username):
        raise HTTPException(status_code=422, detail="Username must be 4-30 characters using letters, numbers, underscores, or periods")
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        raise HTTPException(status_code=422, detail="Enter a valid email address")
    phone = (req.phone or "").strip()
    nid = _normalize_nid(req.nid or "")
    if not phone or not re.fullmatch(r"\+?[0-9]{8,15}", phone):
        raise HTTPException(status_code=422, detail="Enter a valid mobile number")

    try:
        with engine.conn() as c:
            c.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", ("nid:" + nid,))
            c.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", ("username:" + username_key,))
            if c.execute("SELECT 1 FROM users WHERE LOWER(email) = %s", (email,)).fetchone():
                raise HTTPException(status_code=409, detail="This email is already registered")
            if c.execute("SELECT 1 FROM users WHERE LOWER(username) = %s", (username_key,)).fetchone():
                raise HTTPException(status_code=409, detail="This username is already taken")
            if c.execute(
                "SELECT 1 FROM users WHERE regexp_replace(translate(COALESCE(nid, ''), '০১২৩৪৫৬৭৮৯٠١٢٣٤٥٦٧٨٩', '01234567890123456789'), '[^0-9]', '', 'g') = %s LIMIT 1",
                (nid,),
            ).fetchone():
                raise HTTPException(status_code=409, detail="An account with this NID already exists.")
            password_hash, salt = engine.hash_password(req.password)
            created = c.execute(
                """INSERT INTO users (name,username,email,phone,role,password_hash,salt,nid,designation,created_at,updated_at)
                   VALUES (%s,%s,%s,%s,'citizen',%s,%s,%s,%s,%s,%s) RETURNING id""",
                (req.name.strip(), username, email, phone, password_hash, salt, nid, "নাগরিক", datetime.now().isoformat(), datetime.now().isoformat()),
            ).fetchone()
    except UniqueViolation as exc:
        _raise_user_unique_conflict(exc)
    user = engine.get_user_by_id(created["id"])
    engine.log_audit(user["name"], "citizen", "USER_REGISTER", "AUTH", "User registered")

    token = _issue_login_access_token(user, request, response, refresh_cookie)

    return {

        "success": True,

        "token": token,

        "user": _public_user_data(user),

        "message": "নিবন্ধন সফল হয়েছে (Registration successful)"

    }





_dev_auth_secret = secrets.token_bytes(32)
_login_ip_attempts = defaultdict(deque)
_login_ip_attempts_lock = Lock()
_recovery_ip_attempts = defaultdict(deque)
_recovery_ip_attempts_lock = Lock()
_upload_attempts = defaultdict(deque)
_upload_attempts_lock = Lock()
_LOGIN_IP_WINDOW_SECONDS = 15 * 60
_LOGIN_IP_MAX_REQUESTS = 30
_LOGIN_MAX_FAILURES = 5
_LOGIN_LOCK_SECONDS = 10 * 60 * 60
_RECOVERY_IP_WINDOW_SECONDS = 60
_RECOVERY_IP_MAX_REQUESTS = 30

AUTH_REFRESH_COOKIE = "bhumisetu_refresh"
AUTH_SESSION_SECONDS = 30 * 24 * 60 * 60
AUTH_ROTATION_GRACE_SECONDS = 20


def _refresh_token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _set_refresh_cookie(response: Response, request: Request, token: str):
    secure = request.url.scheme == "https" or os.environ.get("APP_ENV", "development").lower() == "production"
    response.set_cookie(
        key=AUTH_REFRESH_COOKIE,
        value=token,
        max_age=AUTH_SESSION_SECONDS,
        httponly=True,
        secure=secure,
        samesite="none" if secure else "lax",
        path="/api/auth",
    )


def _clear_refresh_cookie(response: Response, request: Request):
    secure = request.url.scheme == "https" or os.environ.get("APP_ENV", "development").lower() == "production"
    response.delete_cookie(
        key=AUTH_REFRESH_COOKIE,
        httponly=True,
        secure=secure,
        samesite="none" if secure else "lax",
        path="/api/auth",
    )


def _validate_auth_origin(request: Request):
    origin = request.headers.get("origin")
    if origin and origin not in cors_origins:
        raise HTTPException(status_code=403, detail="Authentication request origin is not allowed.")


def _create_auth_session(user_id: int, auth_version: int, prior_refresh_token: Optional[str] = None):
    session_id = secrets.token_urlsafe(24)
    refresh_token = secrets.token_urlsafe(48)
    with engine.conn() as c:
        if prior_refresh_token:
            prior_hash = _refresh_token_hash(prior_refresh_token)
            c.execute(
                """UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,CURRENT_TIMESTAMP)
                   WHERE (refresh_token_hash=%s OR previous_refresh_token_hash=%s)
                     AND revoked_at IS NULL""",
                (prior_hash, prior_hash),
            )
        c.execute(
            """INSERT INTO auth_sessions
                   (session_id,user_id,auth_version,refresh_token_hash,expires_at)
               VALUES (%s,%s,%s,%s,CURRENT_TIMESTAMP + INTERVAL '30 days')""",
            (session_id, int(user_id), int(auth_version), _refresh_token_hash(refresh_token)),
        )
        c.execute(
            """DELETE FROM auth_sessions
               WHERE expires_at < CURRENT_TIMESTAMP - INTERVAL '30 days'
                  OR revoked_at < CURRENT_TIMESTAMP - INTERVAL '30 days'"""
        )
    return session_id, refresh_token


def _issue_login_access_token(
    user: dict,
    request: Optional[Request],
    response: Optional[Response],
    prior_refresh_token: Optional[str] = None,
):
    user_id = int(user["id"])
    auth_version = int(user.get("auth_version", 0))
    # Direct function callers in older tests have no HTTP response object. Real
    # HTTP login and registration requests always get a server-managed cookie.
    if request is None or response is None:
        return issue_access_token(user_id, auth_version)
    if prior_refresh_token:
        session_id, refresh_token = _create_auth_session(user_id, auth_version, prior_refresh_token)
    else:
        session_id, refresh_token = _create_auth_session(user_id, auth_version)
    _set_refresh_cookie(response, request, refresh_token)
    return issue_access_token(user_id, auth_version, session_id=session_id)


def _enforce_upload_rate_limit(ip: str, user_id: int, upload_type: str):
    """Per-process upload guard; authenticated account and source are both scoped."""
    window_seconds = 15 * 60
    request_limit = 10 if upload_type == "deed" else 20
    key = (upload_type, int(user_id), (ip or "unknown")[:128])
    now = time.monotonic()
    with _upload_attempts_lock:
        attempts = _upload_attempts[key]
        while attempts and now - attempts[0] >= window_seconds:
            attempts.popleft()
        if len(attempts) >= request_limit:
            retry_after = max(1, int(window_seconds - (now - attempts[0])))
            raise HTTPException(
                status_code=429,
                detail={"code": "upload_rate_limited", "retry_after_seconds": retry_after},
                headers={"Retry-After": str(retry_after)},
            )
        attempts.append(now)
        if len(_upload_attempts) > 4096:
            expired_before = now - window_seconds
            for stale_key in [key for key, values in _upload_attempts.items() if not values or values[-1] <= expired_before]:
                _upload_attempts.pop(stale_key, None)


def _enforce_login_ip_rate_limit(ip: str, identifier: str):
    """A modest burst limit scoped to both source and identifier; never IP-wide."""
    key = ((ip or "unknown")[:128], (identifier or "")[:254])
    now = time.monotonic()
    with _login_ip_attempts_lock:
        attempts = _login_ip_attempts[key]
        while attempts and now - attempts[0] >= _LOGIN_IP_WINDOW_SECONDS:
            attempts.popleft()
        if len(attempts) >= _LOGIN_IP_MAX_REQUESTS:
            retry_after = max(1, int(_LOGIN_IP_WINDOW_SECONDS - (now - attempts[0])))
            raise HTTPException(
                status_code=429,
                detail={"code": "login_rate_limited", "retry_after_seconds": retry_after},
                headers={"Retry-After": str(retry_after)},
            )
        attempts.append(now)
        if len(_login_ip_attempts) > 4096:
            expired_before = now - _LOGIN_IP_WINDOW_SECONDS
            for stale_key in [key for key, values in _login_ip_attempts.items() if not values or values[-1] <= expired_before]:
                _login_ip_attempts.pop(stale_key, None)


def _login_lockout_remaining(c, user_id: int) -> int:
    row = c.execute(
        """SELECT CEIL(EXTRACT(EPOCH FROM (locked_until-clock_timestamp())))::INTEGER AS remaining_seconds
           FROM login_attempt_lockouts WHERE user_id=%s""",
        (user_id,),
    ).fetchone()
    if not row or row["remaining_seconds"] is None:
        return 0
    return max(0, int(row["remaining_seconds"]))


def _record_login_failure(c, user_id: int) -> tuple[int, int]:
    row = c.execute(
        """INSERT INTO login_attempt_lockouts(user_id,failed_attempt_count,locked_until)
           VALUES(%s,1,NULL)
           ON CONFLICT(user_id) DO UPDATE SET
             failed_attempt_count=CASE
               WHEN login_attempt_lockouts.locked_until > clock_timestamp()
                 THEN login_attempt_lockouts.failed_attempt_count
               WHEN login_attempt_lockouts.locked_until IS NOT NULL
                    AND login_attempt_lockouts.locked_until <= clock_timestamp()
                 THEN 1
               ELSE login_attempt_lockouts.failed_attempt_count + 1
             END,
             locked_until=CASE
               WHEN login_attempt_lockouts.locked_until > clock_timestamp()
                 THEN login_attempt_lockouts.locked_until
               WHEN login_attempt_lockouts.locked_until IS NOT NULL
                    AND login_attempt_lockouts.locked_until <= clock_timestamp()
                 THEN NULL
               WHEN login_attempt_lockouts.failed_attempt_count + 1 >= %s
                 THEN clock_timestamp() + (%s * INTERVAL '1 second')
               ELSE NULL
             END,
             updated_at=clock_timestamp()
           RETURNING failed_attempt_count,
             CASE WHEN locked_until > clock_timestamp()
               THEN CEIL(EXTRACT(EPOCH FROM (locked_until-clock_timestamp())))::INTEGER
               ELSE 0 END AS remaining_seconds""",
        (user_id, _LOGIN_MAX_FAILURES, _LOGIN_LOCK_SECONDS),
    ).fetchone()
    return int(row["failed_attempt_count"]), max(0, int(row["remaining_seconds"]))


def _clear_login_failures(c, user_id: int):
    c.execute(
        """INSERT INTO login_attempt_lockouts(user_id,failed_attempt_count,locked_until)
           VALUES(%s,0,NULL)
           ON CONFLICT(user_id) DO UPDATE SET
             failed_attempt_count=0,locked_until=NULL,updated_at=clock_timestamp()""",
        (user_id,),
    )


def _raise_login_lockout(remaining_seconds: int):
    seconds = max(1, int(remaining_seconds))
    raise HTTPException(
        status_code=429,
        detail={"code": "account_login_locked", "remaining_seconds": seconds},
        headers={"Retry-After": str(seconds)},
    )

def _auth_secret() -> bytes:
    configured = os.environ.get("JWT_SECRET", "").strip()
    if configured:
        if os.environ.get("APP_ENV", "development").lower() == "production" and len(configured.encode("utf-8")) < 32:
            raise RuntimeError("JWT_SECRET must contain at least 32 bytes in production")
        return configured.encode("utf-8")
    if os.environ.get("APP_ENV", "development").lower() == "production":
        raise RuntimeError("JWT_SECRET must be configured in production")
    return _dev_auth_secret


def _recovery_hash(value: str) -> str:
    secret = os.environ.get("JWT_SECRET", "").strip()
    if len(secret) < 32:
        raise HTTPException(status_code=503, detail="Password recovery requires a stable JWT_SECRET of at least 32 characters")
    return hmac.new(secret.encode(), value.encode(), hashlib.sha256).hexdigest()


def _normalize_recovery_phone(value: str) -> tuple[str, str, str]:
    digit_map = str.maketrans("০১২৩৪৫৬৭৮৯٠١٢٣٤٥٦٧٨٩", "01234567890123456789")
    normalized = unicodedata.normalize("NFKC", str(value or "")).translate(digit_map)
    digits = re.sub(r"\D", "", normalized)
    if re.fullmatch(r"01[3-9]\d{8}", digits):
        return digits, "880" + digits[1:], "+880" + digits[1:]
    if re.fullmatch(r"8801[3-9]\d{8}", digits):
        return digits[3:], digits, "+" + digits
    raise HTTPException(status_code=422, detail="Enter a valid Bangladesh mobile number")


def _recovery_identity(feature_type: str, *normalized_parts: str) -> str:
    payload = json.dumps([feature_type, *normalized_parts], ensure_ascii=False, separators=(",", ":"))
    return _recovery_hash("recovery-identity:" + payload)


def _recovery_lockout_remaining(c, feature_type: str, identity_hash: str) -> int:
    row = c.execute(
        """SELECT CEIL(EXTRACT(EPOCH FROM (locked_until - clock_timestamp())))::INTEGER AS remaining_seconds
           FROM recovery_attempt_lockouts
           WHERE feature_type=%s AND identity_hash=%s FOR UPDATE""",
        (feature_type, identity_hash),
    ).fetchone()
    if not row or row["remaining_seconds"] is None:
        return 0
    return max(0, int(row["remaining_seconds"]))


def _enforce_recovery_ip_rate_limit(ip: str, feature_type: str, identity_hash: str):
    """Apply a short burst cap per source + recovery identity, never per IP alone."""
    ip_hash = _recovery_hash("recovery-rate-ip:" + (ip or "unknown"))
    key = (feature_type, identity_hash, ip_hash)
    now = time.monotonic()
    with _recovery_ip_attempts_lock:
        attempts = _recovery_ip_attempts[key]
        while attempts and now - attempts[0] >= _RECOVERY_IP_WINDOW_SECONDS:
            attempts.popleft()
        if len(attempts) >= _RECOVERY_IP_MAX_REQUESTS:
            retry_after = max(1, int(_RECOVERY_IP_WINDOW_SECONDS - (now - attempts[0])))
            raise HTTPException(
                status_code=429,
                detail={"code": "recovery_rate_limited", "retry_after_seconds": retry_after},
                headers={"Retry-After": str(retry_after)},
            )
        attempts.append(now)
        if len(_recovery_ip_attempts) > 4096:
            expired_before = now - _RECOVERY_IP_WINDOW_SECONDS
            for stale_key in [key for key, values in _recovery_ip_attempts.items() if not values or values[-1] <= expired_before]:
                _recovery_ip_attempts.pop(stale_key, None)


def _record_recovery_failure(c, feature_type: str, identity_hash: str) -> tuple[int, int]:
    row = c.execute(
        """INSERT INTO recovery_attempt_lockouts(feature_type,identity_hash,failed_attempt_count,locked_until)
           VALUES(%s,%s,1,NULL)
           ON CONFLICT(feature_type,identity_hash) DO UPDATE SET
             failed_attempt_count = CASE
               WHEN recovery_attempt_lockouts.locked_until > clock_timestamp()
                 THEN recovery_attempt_lockouts.failed_attempt_count
               WHEN recovery_attempt_lockouts.locked_until IS NOT NULL
                    AND recovery_attempt_lockouts.locked_until <= clock_timestamp()
                 THEN 1
               ELSE recovery_attempt_lockouts.failed_attempt_count + 1
             END,
             locked_until = CASE
               WHEN recovery_attempt_lockouts.locked_until > clock_timestamp()
                 THEN recovery_attempt_lockouts.locked_until
               WHEN recovery_attempt_lockouts.locked_until IS NOT NULL
                    AND recovery_attempt_lockouts.locked_until <= clock_timestamp()
                 THEN NULL
               WHEN recovery_attempt_lockouts.failed_attempt_count + 1 >= 5
                 THEN clock_timestamp() + INTERVAL '10 hours'
               ELSE NULL
             END,
             updated_at=clock_timestamp()
           RETURNING failed_attempt_count,
             CASE WHEN locked_until > clock_timestamp()
               THEN CEIL(EXTRACT(EPOCH FROM (locked_until-clock_timestamp())))::INTEGER
               ELSE 0 END AS remaining_seconds""",
        (feature_type, identity_hash),
    ).fetchone()
    return int(row["failed_attempt_count"]), max(0, int(row["remaining_seconds"]))


def _clear_recovery_failures(c, feature_type: str, identity_hash: str):
    c.execute(
        """UPDATE recovery_attempt_lockouts
           SET failed_attempt_count=0,locked_until=NULL,updated_at=clock_timestamp()
           WHERE feature_type=%s AND identity_hash=%s""",
        (feature_type, identity_hash),
    )


def _raise_recovery_lockout(feature_type: str, remaining_seconds: int):
    raise HTTPException(
        status_code=429,
        detail={
            "code": "recovery_locked",
            "feature": feature_type,
            "remaining_seconds": max(1, int(remaining_seconds)),
        },
        headers={"Retry-After": str(max(1, int(remaining_seconds)))},
    )


def _recovery_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _require_recovery_delivery():
    if os.environ.get("APP_ENV", "development").lower() == "production":
        raise HTTPException(
            status_code=503,
            detail="Account recovery is disabled until a verified out-of-band delivery provider is configured.",
        )


@app.post("/api/auth/recovery/start")
def recovery_start(req: RecoveryIdentityRequest, request: Request):
    _require_recovery_delivery()
    username = req.username.strip()
    if not _valid_username(username):
        raise HTTPException(status_code=422, detail="Enter a valid username")
    phone_local, phone_international_digits, _ = _normalize_recovery_phone(req.phone)
    nid = _normalize_nid(req.nid)
    feature = "forgot_password"
    identity_hash = _recovery_identity(feature, username.casefold(), phone_local, nid)
    _enforce_recovery_ip_rate_limit(_recovery_ip(request), feature, identity_hash)
    ip_hash = _recovery_hash("ip:" + _recovery_ip(request))
    now = int(time.time())
    reset_token = secrets.token_urlsafe(32)
    token_hash = _recovery_hash("reset:" + reset_token)
    account = None
    locked_seconds = 0
    failure_lock_seconds = 0
    with engine.conn() as c:
        locked_seconds = _recovery_lockout_remaining(c, feature, identity_hash)
        if not locked_seconds:
            account = c.execute(
                """SELECT id,role FROM users
                   WHERE LOWER(username)=%s
                     AND regexp_replace(COALESCE(phone,''),'[^0-9]','','g') IN (%s,%s)
                     AND regexp_replace(translate(COALESCE(nid,''),'০১২৩৪৫৬৭৮৯٠١٢٣٤٥٦٧٨٩','01234567890123456789'),'[^0-9]','','g')=%s
                   LIMIT 1""",
                (username.casefold(), phone_local, phone_international_digits, nid),
            ).fetchone()
            if not account:
                _, failure_lock_seconds = _record_recovery_failure(c, feature, identity_hash)
            else:
                _clear_recovery_failures(c, feature, identity_hash)
                c.execute(
                    """INSERT INTO password_recovery_sessions
                       (reset_token_hash,user_id,identity_hash,ip_hash,expires_at,consumed,created_at)
                       VALUES(%s,%s,%s,%s,%s,FALSE,%s)""",
                    (token_hash, account["id"], identity_hash, ip_hash, now + 600, now),
                )
    if locked_seconds:
        _raise_recovery_lockout(feature, locked_seconds)
    if not account:
        if failure_lock_seconds:
            _raise_recovery_lockout(feature, failure_lock_seconds)
        raise HTTPException(status_code=400, detail="Username, mobile number, and NID do not match an account")
    return {"success": True, "reset_token": reset_token, "expires_in_seconds": 600}


def _normalize_recovery_name(value: str) -> str:
    # Match PostgreSQL LOWER() used by the account lookup.
    return " ".join(unicodedata.normalize("NFKC", value or "").split()).lower()


@app.post("/api/auth/recovery/username")
def recover_username(req: ForgotUsernameRequest, request: Request):
    _require_recovery_delivery()
    full_name = _normalize_recovery_name(req.full_name)
    if len(full_name) < 2:
        raise HTTPException(status_code=422, detail="Enter the full name on the account")
    phone_local, phone_international_digits, _ = _normalize_recovery_phone(req.phone)
    nid = _normalize_nid(req.nid)
    feature = "forgot_username"
    identity_hash = _recovery_identity(feature, full_name, phone_local, nid)
    _enforce_recovery_ip_rate_limit(_recovery_ip(request), feature, identity_hash)
    account = None
    locked_seconds = 0
    failure_lock_seconds = 0
    with engine.conn() as c:
        locked_seconds = _recovery_lockout_remaining(c, feature, identity_hash)
        if not locked_seconds:
            account = c.execute(
                """SELECT username FROM users
                   WHERE LOWER(regexp_replace(BTRIM(COALESCE(name,'')), '[[:space:]]+', ' ', 'g'))=%s
                     AND regexp_replace(COALESCE(phone,''),'[^0-9]','','g') IN (%s,%s)
                     AND regexp_replace(translate(COALESCE(nid,''),'০১২৩৪৫৬৭৮৯٠١٢٣٤٥٦٧٨٩','01234567890123456789'),'[^0-9]','','g')=%s
                   LIMIT 1""",
                (full_name, phone_local, phone_international_digits, nid),
            ).fetchone()
            if not account:
                _, failure_lock_seconds = _record_recovery_failure(c, feature, identity_hash)
            else:
                _clear_recovery_failures(c, feature, identity_hash)
    if locked_seconds:
        _raise_recovery_lockout(feature, locked_seconds)
    if not account:
        if failure_lock_seconds:
            _raise_recovery_lockout(feature, failure_lock_seconds)
        raise HTTPException(status_code=400, detail="Full name, mobile number, and NID do not match an account")
    return {"success": True, "username": account["username"]}


@app.post("/api/auth/recovery/reset")
def recovery_reset(req: RecoveryResetRequest, request: Request):
    _require_recovery_delivery()
    if req.password != req.password_confirmation:
        raise HTTPException(status_code=422, detail="Passwords do not match")
    ip_hash = _recovery_hash("ip:" + _recovery_ip(request))
    now = int(time.time())
    token_hash = _recovery_hash("reset:" + req.reset_token)
    with engine.conn() as c:
        session = c.execute(
            "SELECT * FROM password_recovery_sessions WHERE reset_token_hash=%s AND ip_hash=%s AND consumed=FALSE FOR UPDATE",
            (token_hash, ip_hash),
        ).fetchone()
        if not session or session["expires_at"] < now:
            raise HTTPException(status_code=400, detail="Reset session is invalid or expired. Start recovery again.")
        account = c.execute("SELECT id,name,role FROM users WHERE id=%s FOR UPDATE", (session["user_id"],)).fetchone()
        if not account:
            raise HTTPException(status_code=400, detail="Reset session is invalid or expired. Start recovery again.")
        password_hash, salt = engine.hash_password(req.password)
        c.execute(
            "UPDATE users SET password_hash=%s,salt=%s,auth_version=auth_version+1,updated_at=%s WHERE id=%s",
            (password_hash, salt, datetime.now().isoformat(), account["id"]),
        )
        c.execute("UPDATE password_recovery_sessions SET consumed=TRUE WHERE reset_token_hash=%s", (token_hash,))
    engine.log_audit(account["name"], account["role"], "PASSWORD_RECOVERY", "AUTH", "Password reset through username, phone, and NID match")
    return {"success": True, "role": account["role"], "message": "Password reset successfully. Sign in with your new password."}

def issue_access_token(user_id: int, auth_version: int = 0, session_id: Optional[str] = None) -> str:
    payload_data = {"sub": int(user_id), "ver": int(auth_version), "exp": int(time.time()) + 900}
    if session_id:
        payload_data["sid"] = str(session_id)
    payload = json.dumps(payload_data, separators=(",", ":")).encode()
    body = base64.urlsafe_b64encode(payload).rstrip(b"=")
    signature = hmac.new(_auth_secret(), body, hashlib.sha256).digest()
    return body.decode() + "." + base64.urlsafe_b64encode(signature).rstrip(b"=").decode()

def _verified_access_payload(authorization: Optional[str]) -> Optional[dict]:
    if not authorization:
        return None
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token or len(token) > 4096:
        return None
    try:
        body, encoded_signature = token.split(".", 1)
        signature = base64.urlsafe_b64decode(encoded_signature + "=" * (-len(encoded_signature) % 4))
        expected = hmac.new(_auth_secret(), body.encode(), hashlib.sha256).digest()
        if not hmac.compare_digest(signature, expected):
            return None
        payload = json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))
        if not isinstance(payload.get("sub"), int) or int(payload.get("exp", 0)) <= int(time.time()):
            return None
        return payload
    except (ValueError, TypeError, json.JSONDecodeError, UnicodeDecodeError):
        return None


def extract_user_from_auth_header(authorization: Optional[str]) -> Optional[dict]:
    payload = _verified_access_payload(authorization)
    if not payload:
        return None
    if payload.get("sid") is not None:
        if not isinstance(payload["sid"], str) or len(payload["sid"]) > 128:
            return None
        user = engine.get_user_by_auth_session(payload["sid"])
    else:
        # Continue accepting already-issued short-lived tokens during rollout.
        user = engine.get_user_by_id(payload["sub"])
    if not user or int(payload.get("sub", 0)) != int(user["id"]):
        return None
    if payload.get("ver") != int(user.get("auth_version", 0)):
        return None
    return user





@app.post("/api/auth/refresh")
def refresh_auth_session(
    request: Request,
    response: Response,
    authorization: Optional[str] = Header(None),
    refresh_cookie: Optional[str] = Cookie(None, alias=AUTH_REFRESH_COOKIE),
):
    _validate_auth_origin(request)
    if not refresh_cookie:
        # One-time upgrade for users who still have a valid pre-cookie token.
        payload = _verified_access_payload(authorization)
        user = extract_user_from_auth_header(authorization) if payload and not payload.get("sid") else None
        if not user:
            _clear_refresh_cookie(response, request)
            raise HTTPException(status_code=401, detail={"code": "invalid_session", "message": "Session expired or invalid."})
        session_id, new_refresh_cookie = _create_auth_session(user["id"], user.get("auth_version", 0))
        _set_refresh_cookie(response, request, new_refresh_cookie)
        return {"success": True, "token": issue_access_token(user["id"], user.get("auth_version", 0), session_id)}

    token_hash = _refresh_token_hash(refresh_cookie)
    next_refresh_cookie = secrets.token_urlsafe(48)
    next_hash = _refresh_token_hash(next_refresh_cookie)
    invalid_session = False
    rotation_in_progress = False
    session = None
    with engine.conn() as c:
        row = c.execute(
            """SELECT s.session_id,s.user_id,s.auth_version,s.refresh_token_hash,
                      s.previous_refresh_token_hash,s.previous_rotated_at,s.revoked_at,
                      (s.expires_at <= CURRENT_TIMESTAMP) AS expired,
                      u.auth_version AS current_auth_version
               FROM auth_sessions s JOIN users u ON u.id=s.user_id
               WHERE s.refresh_token_hash=%s OR s.previous_refresh_token_hash=%s
               FOR UPDATE OF s""",
            (token_hash, token_hash),
        ).fetchone()
        if not row:
            invalid_session = True
        elif row["revoked_at"] or row["expired"] or int(row["auth_version"]) != int(row["current_auth_version"]):
            c.execute(
                "UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,CURRENT_TIMESTAMP) WHERE session_id=%s",
                (row["session_id"],),
            )
            invalid_session = True
        elif row["refresh_token_hash"] != token_hash:
            rotated_at = row.get("previous_rotated_at")
            rotation_in_progress = bool(
                rotated_at and (datetime.now(timezone.utc) - rotated_at).total_seconds() <= AUTH_ROTATION_GRACE_SECONDS
            )
            invalid_session = not rotation_in_progress
        else:
            c.execute(
                """UPDATE auth_sessions
                   SET previous_refresh_token_hash=refresh_token_hash,
                       previous_rotated_at=CURRENT_TIMESTAMP,
                       refresh_token_hash=%s,
                       expires_at=CURRENT_TIMESTAMP + INTERVAL '30 days'
                   WHERE session_id=%s""",
                (next_hash, row["session_id"]),
            )
            session = {
                "id": row["user_id"],
                "auth_version": row["current_auth_version"],
                "session_id": row["session_id"],
            }

    if rotation_in_progress:
        raise HTTPException(status_code=409, detail={"code": "session_rotated", "message": "Session refresh completed in another tab. Retry."})
    if invalid_session or not session:
        _clear_refresh_cookie(response, request)
        raise HTTPException(status_code=401, detail={"code": "invalid_session", "message": "Session expired or invalid."})

    _set_refresh_cookie(response, request, next_refresh_cookie)
    return {
        "success": True,
        "token": issue_access_token(session["id"], session["auth_version"], session["session_id"]),
    }


@app.post("/api/auth/logout")
def logout_auth_session(
    request: Request,
    response: Response,
    refresh_cookie: Optional[str] = Cookie(None, alias=AUTH_REFRESH_COOKIE),
):
    _validate_auth_origin(request)
    if refresh_cookie:
        token_hash = _refresh_token_hash(refresh_cookie)
        with engine.conn() as c:
            c.execute(
                """UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,CURRENT_TIMESTAMP)
                   WHERE (refresh_token_hash=%s OR previous_refresh_token_hash=%s)
                     AND revoked_at IS NULL""",
                (token_hash, token_hash),
            )
    _clear_refresh_cookie(response, request)
    return {"success": True}


@app.get("/api/auth/me")

def get_current_user(authorization: Optional[str] = Header(None)):
    user = extract_user_from_auth_header(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    # Return only the current user's profile fields needed by the frontend.
    # NID, password metadata and auth internals stay out of this response.
    return {
        "id": user["id"],
        "name": user.get("name") or "",
        "username": user.get("username") or "",
        "nid_masked": user.get("nid_masked"),
        "profile_picture": user.get("profile_picture"),
        "email": user.get("email") or "",
        "role": user.get("role") or "",
        "designation": user.get("designation") or "",
    }


@app.put("/api/profile-picture")
async def upload_profile_picture(file: UploadFile = File(...), authorization: Optional[str] = Header(None)):
    user = extract_user_from_auth_header(authorization)
    if not user:
        await file.close()
        raise HTTPException(status_code=401, detail="Authentication required")
    try:
        _enforce_upload_rate_limit("authenticated", user["id"], "profile_picture")
        data = await file.read(PROFILE_PICTURE_MAX_BYTES + 1)
    finally:
        await file.close()
    if not data:
        raise HTTPException(status_code=400, detail="Choose an image to upload")
    if len(data) > PROFILE_PICTURE_MAX_BYTES:
        raise HTTPException(status_code=413, detail="Profile pictures must be 5 MB or smaller")

    normalized = _normalize_profile_picture(data, file.content_type or "")
    picture_version = secrets.token_hex(16)
    updated_at = datetime.now(timezone.utc).isoformat()
    with engine.conn() as c:
        account = c.execute("SELECT id FROM users WHERE id=%s", (user["id"],)).fetchone()
        if not account:
            raise HTTPException(status_code=401, detail="Authenticated account no longer exists")
        c.execute(
            """INSERT INTO profile_pictures(user_id, image_data, updated_at) VALUES (%s, %s, %s)
               ON CONFLICT (user_id) DO UPDATE SET image_data=EXCLUDED.image_data, updated_at=EXCLUDED.updated_at""",
            (user["id"], normalized, updated_at),
        )
        c.execute("UPDATE users SET profile_picture=%s WHERE id=%s", (picture_version, user["id"]))
    return {"profile_picture": picture_version}


@app.delete("/api/profile-picture")
def delete_profile_picture(authorization: Optional[str] = Header(None)):
    user = extract_user_from_auth_header(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    with engine.conn() as c:
        row = c.execute("SELECT id FROM users WHERE id=%s", (user["id"],)).fetchone()
        if not row:
            raise HTTPException(status_code=401, detail="Authenticated account no longer exists")
        c.execute("UPDATE users SET profile_picture=NULL WHERE id=%s", (user["id"],))
        c.execute("DELETE FROM profile_pictures WHERE user_id=%s", (user["id"],))
    return {"profile_picture": None}


@app.get("/api/users/{user_id}/profile-picture")
def get_profile_picture(user_id: int, authorization: Optional[str] = Header(None)):
    viewer = extract_user_from_auth_header(authorization)
    if not viewer:
        raise HTTPException(status_code=401, detail="Authentication required")
    with engine.conn() as c:
        picture = c.execute(
            """SELECT u.profile_picture, p.image_data FROM users u
               JOIN profile_pictures p ON p.user_id=u.id WHERE u.id=%s""",
            (user_id,),
        ).fetchone()
    if not picture or not picture.get("profile_picture"):
        raise HTTPException(status_code=404, detail="Profile picture not found")
    return Response(
        content=bytes(picture["image_data"]),
        media_type="image/webp",
        headers={"Cache-Control": "private, no-store"},
    )





# P2: DEED VERIFICATION ROUTES

# =====================================================================



def _location_db_call(callback):
    try:
        return callback()
    except UndefinedTable as exc:
        raise HTTPException(status_code=503, detail="Location tables are unavailable. Apply the location registry migration first.") from exc
    except OperationalError as exc:
        raise HTTPException(status_code=503, detail="Location database is temporarily unavailable.") from exc


@app.get("/api/locations/districts")
def get_location_districts(
    q: str = Query("", max_length=100),
    limit: int = Query(200, ge=1, le=500),
    division_id: Optional[int] = Query(None, gt=0),
):
    if division_id is not None and not _location_db_call(lambda: location_service.division_exists(division_id)):
        raise HTTPException(status_code=404, detail="Division not found")
    items = _location_db_call(lambda: location_service.list_districts(q, limit, division_id))
    return {"items": items, "coverage": _location_db_call(location_service.coverage_status)}


@app.get("/api/locations/divisions")
def get_location_divisions(q: str = Query("", max_length=100), limit: int = Query(50, ge=1, le=100)):
    items = _location_db_call(lambda: location_service.list_divisions(q, limit))
    return {"items": items, "coverage": _location_db_call(location_service.coverage_status)}


@app.get("/api/locations/upazilas")
def get_location_upazilas(district_id: int = Query(..., gt=0), q: str = Query("", max_length=100), limit: int = Query(300, ge=1, le=500)):
    if not _location_db_call(lambda: location_service.district_exists(district_id)):
        raise HTTPException(status_code=404, detail="District not found")
    items = _location_db_call(lambda: location_service.list_district_children("upazilas", district_id, q, limit))
    return {"items": items, "coverage": _location_db_call(location_service.coverage_status)}


@app.get("/api/locations/thanas")
def get_location_thanas(district_id: int = Query(..., gt=0), q: str = Query("", max_length=100), limit: int = Query(300, ge=1, le=500)):
    if not _location_db_call(lambda: location_service.district_exists(district_id)):
        raise HTTPException(status_code=404, detail="District not found")
    items = _location_db_call(lambda: location_service.list_district_children("police_thanas", district_id, q, limit))
    return {"items": items, "coverage": _location_db_call(location_service.coverage_status)}


@app.get("/api/locations/mouzas")
def get_location_mouzas(
    upazila_id: Optional[int] = Query(None, gt=0),
    thana_id: Optional[int] = Query(None, gt=0),
    q: str = Query("", max_length=100),
    limit: int = Query(500, ge=1, le=1000),
):
    if (upazila_id is None) == (thana_id is None):
        raise HTTPException(status_code=422, detail="Provide exactly one of upazila_id or thana_id")
    parent_type = "upazila" if upazila_id is not None else "police_thana"
    parent_id = upazila_id if upazila_id is not None else thana_id
    if not _location_db_call(lambda: location_service.parent_exists(parent_type, parent_id)):
        raise HTTPException(status_code=404, detail="Selected Upazila/Thana not found")
    items = _location_db_call(lambda: location_service.list_mouzas(parent_type, parent_id, q, limit))
    return {"items": items, "coverage": _location_db_call(location_service.coverage_status)}


@app.get("/api/locations/unions")
def get_location_unions(
    upazila_id: int = Query(..., gt=0),
    q: str = Query("", max_length=100),
    limit: int = Query(100, ge=1, le=500),
):
    if not _location_db_call(lambda: location_service.parent_exists("upazila", upazila_id)):
        raise HTTPException(status_code=404, detail="Selected Upazila not found")
    items = _location_db_call(lambda: location_service.list_upazila_unions(upazila_id, q, limit))
    return {"items": items}


@app.get("/api/locations/districts/{district_id}/hierarchy")
def get_location_hierarchy(district_id: int):
    try:
        district = _location_db_call(lambda: location_service.get_district_hierarchy(district_id))
    except location_service.LocationNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"district": district, "coverage": _location_db_call(location_service.coverage_status)}


def _resolve_location_payload(district_id, location_type, location_id, mouza_id):
    try:
        return _location_db_call(lambda: location_service.resolve_selection(district_id, location_type, location_id, mouza_id))
    except location_service.LocationNotFound as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


app.include_router(deed_digitization_api.build_router(
    engine=engine,
    location_service=location_service,
    ocr_service=ocr_service,
    storage_service=deed_digitization_service,
    get_user=extract_user_from_auth_header,
    enforce_upload_rate_limit=_enforce_upload_rate_limit,
))


def _normalized_location_name(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", str(value or "")).casefold()
    normalized = re.sub(r"[\W_]+", "", normalized, flags=re.UNICODE)
    # DGHS GeoCodes stores Pubail in English, while deed OCR commonly reads
    # the Bengali spelling. Treat those official/source spellings as equal.
    return {"পুবাইল": "pubail", "পূবাইল": "pubail"}.get(normalized, normalized)


@app.post("/api/verification/verify-deed")

def verify_deed_api(req: DeedVerifyRequest, authorization: Optional[str] = Header(None)):
    user = extract_user_from_auth_header(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")

    field_errors = {}
    required_fields = {
        "deed_no": req.deed_no,
        "deed_type": req.deed_type,
        "mouza": req.mouza,
        "plot_id": req.plot_id,
        "khatian_no": req.khatian_no,
        "buyer_name": req.buyer_name,
        "seller_name": req.seller_name,
    }
    for field_name, value in required_fields.items():
        if not str(value or "").strip():
            field_errors[field_name] = "This field is required."
    current_year = datetime.now().year
    if req.reg_year is None or req.reg_year < 1950 or req.reg_year > current_year:
        field_errors["reg_year"] = f"Enter a registration year from 1950 through {current_year}."
    if req.division_id is None:
        field_errors["division_id"] = "Select a division."
    if req.district_id is None:
        field_errors["district_id"] = "Choose a district from the official location list."
    if req.location_id is None or req.location_type is None:
        field_errors["location_id"] = "Choose an Upazila or Thana from the official location list."
    if req.union_id is not None and req.location_type != "upazila":
        field_errors["union_ward"] = "An official Union can only be selected under an Upazila."
    if req.union_ward and req.union_id is None:
        field_errors["union_ward"] = "ইউনিয়ন / ওয়ার্ড হাতে লেখা যাবে না; তালিকা থেকে সরকারি ইউনিয়ন নির্বাচন করুন।"
    mouza_input_mode = req.mouza_input_mode or ("catalog" if req.mouza_id is not None else "manual")
    if mouza_input_mode == "catalog" and req.mouza_id is None:
        field_errors["mouza"] = "তালিকা থেকে মৌজা নির্বাচন করুন, অথবা হাতে লেখার পদ্ধতি বেছে নিন।"
    if mouza_input_mode == "manual" and req.mouza_id is not None:
        field_errors["mouza"] = "হাতে লেখার পদ্ধতিতে তালিকার Mouza ID পাঠানো যাবে না।"
    if req.deed_type and not engine.is_supported_deed_type(req.deed_type):
        field_errors["deed_type"] = "Choose a deed type from the list."
    if field_errors:
        raise HTTPException(status_code=422, detail={"field_errors": field_errors})

    data = req.model_dump()
    data["owner_name"] = req.buyer_name
    data["mouza_input_mode"] = mouza_input_mode
    if not _location_db_call(
        lambda: location_service.district_belongs_to_division(req.district_id, req.division_id)
    ):
        raise HTTPException(status_code=422, detail={
            "field_errors": {
                "district_id": "The selected district does not belong to the selected division."
            }
        })
    try:
        resolved = _resolve_location_payload(req.district_id, req.location_type, req.location_id, req.mouza_id)
    except HTTPException as exc:
        error_field = "mouza" if req.mouza_id is not None and "Mouza" in str(exc.detail) else "location_id"
        raise HTTPException(status_code=422, detail={
            "field_errors": {error_field: str(exc.detail)}
        }) from exc
    data.update(
        division=resolved["division"], division_id=resolved["division_id"],
        district=resolved["district"], upazila=resolved["location"],
        mouza=resolved["mouza"] if req.mouza_id is not None else (req.mouza or "").strip(),
        district_id=resolved["district_id"], upazila_id=resolved["upazila_id"],
        police_thana_id=resolved["police_thana_id"], mouza_id=resolved["mouza_id"],
    )
    data["mouza_source"] = "official_catalog" if mouza_input_mode == "catalog" else "manual_unverified"
    data["union_ward"] = (req.union_ward or "").strip()
    data["union_id"] = None
    if req.union_id is not None:
        try:
            selected_union = _location_db_call(
                lambda: location_service.resolve_upazila_union(req.union_id, req.location_id)
            )
        except location_service.LocationNotFound as exc:
            raise HTTPException(status_code=422, detail={
                "field_errors": {"union_ward": str(exc)}
            }) from exc
        data["union_id"] = selected_union["id"]
        data["union_ward"] = selected_union["name_bn"] or selected_union["name_en"]
    result = engine.verify_deed(data, user_id=user["id"], user_name=user["name"])
    if result.get("lookup_status") == "AMBIGUOUS":
        candidates = deed_search.lookup_by_deed_number(req.deed_no or "")
        result["candidates"] = [
            deed_search.public_deed_fields(candidate, user.get("role"))
            for candidate in candidates
        ]
    elif result.get("lookup_status") == "INVALID_INPUT":
        raise HTTPException(status_code=409, detail={
            "code": "SELECTED_DEED_INVALID",
            "message_bn": result.get("message_bn"),
            "message_en": result.get("message_en"),
        })
    return result





@app.get("/api/verification/deed-types")
def get_verification_deed_types():
    return {"items": engine.list_deed_types()}


@app.post("/api/verification/upload-deed")
async def upload_deed_api(
    request: Request,
    file: UploadFile = File(...),
    selected_district: Optional[str] = Form(None),
    selected_upazila: Optional[str] = Form(None),
    selected_mouza: Optional[str] = Form(None),
    division_id: Optional[int] = Form(None),
    district_id: Optional[int] = Form(None),
    location_id: Optional[int] = Form(None),
    location_type: Optional[str] = Form(None),
    mouza_id: Optional[int] = Form(None),
    authorization: Optional[str] = Header(None),
):
    user = extract_user_from_auth_header(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")

    filename = Path(file.filename or "uploaded_document").name
    resolved = None
    if any(value is not None for value in (division_id, district_id, location_id, location_type, mouza_id)):
        if district_id is None or location_id is None or location_type not in {"upazila", "police_thana"}:
            raise HTTPException(status_code=422, detail="A complete district and Upazila/Thana selection is required")
        if division_id is not None and not _location_db_call(
            lambda: location_service.district_belongs_to_division(district_id, division_id)
        ):
            raise HTTPException(status_code=422, detail="Selected district does not belong to the selected division")
        resolved = _resolve_location_payload(district_id, location_type, location_id, mouza_id)
        selected_district = resolved["district"]
        selected_upazila = resolved["location"]
        if mouza_id is not None:
            selected_mouza = resolved["mouza"]

    try:
        _enforce_upload_rate_limit(request.client.host if request.client else "unknown", user["id"], "deed")
        contents = await file.read(10 * 1024 * 1024 + 1)
        if len(contents) > 10 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="Uploaded file exceeds the 10 MB limit")
        try:
            extraction = await run_in_threadpool(ocr_service.extract_document_text, filename, contents)
        except ocr_service.DocumentProcessingError as exc:
            raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    finally:
        await file.close()

    extracted_fields = await run_in_threadpool(ocr_service.parse_deed_fields, extraction.text)
    selected_locations = {
        "district": selected_district or "",
        "upazila": selected_upazila or "",
        "mouza": selected_mouza or "",
    }
    mismatches = []
    labels = {
        "district": ("জেলা", "District"),
        "upazila": ("উপজেলা / থানা", "Upazila / Thana"),
        "mouza": ("মৌজা", "Mouza"),
    }
    for field, selected_value in selected_locations.items():
        extracted_value = extracted_fields.get(field) or ""
        if selected_value and extracted_value and _normalized_location_name(selected_value) != _normalized_location_name(extracted_value):
            label_bn, label_en = labels[field]
            mismatches.append({
                "field": field,
                "selected": selected_value,
                "extracted": extracted_value,
                "message_bn": f"নির্বাচিত {label_bn} এবং OCR-এ পাওয়া নামের মধ্যে অমিল আছে। যাচাই করে ঠিক করুন।",
                "message_en": f"The selected {label_en} differs from the name read by OCR. Please review it.",
            })

    recognized_count = sum(
        bool(value) for key, value in extracted_fields.items()
        if key not in {"reg_year", "area", "upazila_type"}
    ) + int(extracted_fields.get("reg_year") is not None)
    ocr_warnings = list(extraction.warnings)
    if recognized_count == 0:
        ocr_warnings.append(
            "No required deed fields could be read confidently. Use a clearer scan or enter them from the original document."
        )
        message_bn = "ছবি থেকে কিছু লেখা পাওয়া গেছে, তবে প্রয়োজনীয় দলিলের তথ্য নিশ্চিতভাবে শনাক্ত হয়নি। পরিষ্কার স্ক্যান দিন বা মূল দলিল দেখে ফর্ম পূরণ করুন।"
        message_en = "Some text was read, but required deed fields could not be identified confidently. Upload a clearer scan or enter them from the original document."
    else:
        message_bn = "OCR থেকে পাওয়া তথ্য যাচাই করে ফর্মে ব্যবহার করুন। OCR একা মালিকানা প্রমাণ করে না।"
        message_en = "Review the OCR fields before using them. OCR alone does not prove ownership."
    return {
        "filename": filename,
        "extracted_fields": extracted_fields,
        "selected_locations": selected_locations,
        "location_mismatches": mismatches,
        "ocr_warnings": ocr_warnings,
        "raw_text_preview": extraction.text[:1600],
        "recognized_field_count": recognized_count,
        "review_required": True,
        "verification_status": "not_run",
        "message_bn": message_bn,
        "message_en": message_en,
    }


@app.get("/api/verification/reports")

def list_verifications(authorization: Optional[str] = Header(None)):
    user = extract_user_from_auth_header(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    if user["role"] == "admin":
        return engine.list_deed_verifications()
    return engine.list_deed_verifications(user_id=user["id"])





@app.get("/api/verification/report/{ref}")

def get_verification_report(ref: str, authorization: Optional[str] = Header(None)):

    user = extract_user_from_auth_header(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")

    rep = engine.get_deed_verification_by_ref(ref)

    if not rep:

        raise HTTPException(status_code=404, detail="ভেরিফিকেশন রিপোর্ট পাওয়া যায়নি (Report not found)")

    if user["role"] != "admin" and rep.get("user_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Cannot access another user's report")

    return rep





def _deed_search_identity(authorization: Optional[str], cookie_token: Optional[str], response: Response):

    user = extract_user_from_auth_header(authorization)

    user_id = user.get("id") if user else None

    role = user.get("role") if user else None

    session_token = deed_search.issue_session_token(cookie_token)

    deed_search.set_session_cookie(response, session_token)

    return user, user_id, role, session_token



def _lock_response(payload: dict, status_code: int = 429):

    headers = {}

    remaining = payload.get("remaining_seconds")

    if remaining:
        headers["Retry-After"] = str(int(remaining))

    return JSONResponse(status_code=status_code, content=payload, headers=headers)





@app.post("/api/deeds/search-by-number")

def search_deed_by_number(

    req: DeedNumberSearchRequest,

    request: Request,

    response: Response,

    authorization: Optional[str] = Header(None),

    bs_deed_search_sid: Optional[str] = Cookie(None),

):

    user, user_id, role, session_token = _deed_search_identity(authorization, bs_deed_search_sid, response)

    ip = deed_search.client_ip(request)

    rate = deed_search.check_rate_limit(ip)

    if rate:

        return _lock_response(rate)

    lock = deed_search.check_lock(user_id, session_token, ip)

    if lock:

        return _lock_response(lock)

    deed_no = (req.deed_no or "").strip()

    if not deed_no:

        raise HTTPException(

            status_code=400,

            detail="অনুগ্রহ করে দলিল নম্বর লিখুন। / Please enter a deed number.",

        )

    records = deed_search.lookup_by_deed_number(deed_no)

    if not records:

        miss = deed_search.record_failure(user_id, session_token, ip, deed_no)

        payload = {

            "found": False,

            "lookup_status": "DEED_NOT_FOUND",

            "count": 0,

            "results": [],

            "message_bn": deed_search.NOT_FOUND_MESSAGE_BN,

            "scope_note_bn": deed_search.SCOPE_NOTE_BN,

            "scope_note_en": deed_search.SCOPE_NOTE_EN,

            "data_source": "application_database",

            "is_official_registry": False,

            "consecutive_failures": miss.get("consecutive_failures", 0),

            "remaining_attempts": miss.get("remaining_attempts", 0),

            "locked": bool(miss.get("locked")),

        }

        if miss.get("locked"):

            payload.update(miss)

            payload["found"] = False

            payload["message_bn"] = deed_search.LOCK_MESSAGE_BN

            return _lock_response(payload)

        return payload

    deed_search.record_success(user_id, session_token, ip, deed_no)

    return {

        "found": True,

        "lookup_status": "AMBIGUOUS" if len(records) > 1 else "DEED_FOUND",

        "count": len(records),

        "results": [deed_search.public_deed_fields(row, role) for row in records],

        "scope_note_bn": deed_search.SCOPE_NOTE_BN,

        "scope_note_en": deed_search.SCOPE_NOTE_EN,

        "data_source": "application_database",

        "is_official_registry": False,

        "is_synthetic_demo_record": all(deed_search.is_demo_record(row) for row in records),

        "locked": False,

        "consecutive_failures": 0,

    }





@app.post("/api/deeds/advanced-search")

def advanced_deed_search(

    req: DeedAdvancedSearchRequest,

    request: Request,

    response: Response,

    authorization: Optional[str] = Header(None),

    bs_deed_search_sid: Optional[str] = Cookie(None),

):

    user, user_id, role, session_token = _deed_search_identity(authorization, bs_deed_search_sid, response)

    filters = req.model_dump()

    usable = {
        k: v for k, v in filters.items()
        if k not in ("page", "page_size") and str(v or "").strip()
    }
    unsupported = []

    if not usable:

        raise HTTPException(

            status_code=400,

            detail="অনুগ্রহ করে অন্তত একটি অনুসন্ধান তথ্য দিন। / Provide at least one search field.",

        )

    result = deed_search.search_deeds(filters, page=req.page or 1, page_size=req.page_size or 10)

    rows = result["records"]

    return {

        "found": bool(rows),

        "total": result["total"],

        "page": result["page"],

        "page_size": result["page_size"],

        "pages": result["pages"],

        "results": [deed_search.public_deed_fields(row, role) for row in rows],

        "message_bn": None if rows else "প্রদত্ত তথ্যের সাথে মিলিয়ে উপলব্ধ ডেটাবেজে কোনো দলিল পাওয়া যায়নি।",

        "scope_note_bn": deed_search.SCOPE_NOTE_BN,

        "scope_note_en": deed_search.SCOPE_NOTE_EN,

        "data_source": "application_database",

        "is_official_registry": False,

        "is_synthetic_demo_record": all(deed_search.is_demo_record(row) for row in rows),

        "unmatched_fields": result.get("unmatched_fields", []),

        "filter_conflict": bool(result.get("filter_conflict")),

        "unsupported_fields": unsupported,

    }





@app.get("/api/deeds/search-protection/status")

def deed_search_protection_status(

    request: Request,

    response: Response,

    authorization: Optional[str] = Header(None),

    bs_deed_search_sid: Optional[str] = Cookie(None),

):

    user, user_id, role, session_token = _deed_search_identity(authorization, bs_deed_search_sid, response)

    status_payload = deed_search.protection_status(user_id, session_token, deed_search.client_ip(request))

    return status_payload





@app.get("/api/deeds/{deed_id}")

def get_deed_detail(

    deed_id: int,

    request: Request,

    response: Response,

    authorization: Optional[str] = Header(None),

    bs_deed_search_sid: Optional[str] = Cookie(None),

):

    user, user_id, role, session_token = _deed_search_identity(authorization, bs_deed_search_sid, response)

    row = deed_search.get_deed_by_id(deed_id)

    if not row:

        raise HTTPException(status_code=404, detail="দলিলটি উপলব্ধ ডেটাবেজে পাওয়া যায়নি।")

    return {

        "found": True,

        "result": deed_search.public_deed_fields(row, role),

        "scope_note_bn": deed_search.SCOPE_NOTE_BN,

        "scope_note_en": deed_search.SCOPE_NOTE_EN,

        "data_source": "application_database",

        "is_official_registry": False,

        "is_synthetic_demo_record": deed_search.is_demo_record(row),

    }





@app.get("/api/admin/deed-search/locks")

def admin_list_deed_search_locks(

    authorization: Optional[str] = Header(None),

    limit: int = 50,

):

    user = extract_user_from_auth_header(authorization)

    if not user or user.get("role") != "admin":

        raise HTTPException(status_code=403, detail="শুধুমাত্র প্রশাসক এই তথ্য দেখতে পারেন।")

    return {"locks": deed_search.list_locks(limit=limit)}


@app.get("/api/admin/users")
def admin_list_users(
    authorization: Optional[str] = Header(None),
    q: str = "",
    role: str = "all",
    limit: int = 25,
    offset: int = 0,
):
    user = extract_user_from_auth_header(authorization)
    if not user or user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    limit = max(1, min(limit, 100))
    offset = max(0, offset)
    if role not in {"all", "citizen", "officer", "admin"}:
        raise HTTPException(status_code=422, detail="Invalid role filter")
    term = f"%{q.strip()}%"
    role_clause = "" if role == "all" else "AND role = %s"
    params = [term, term, term] + ([] if role == "all" else [role])
    with engine.conn() as c:
        total = c.execute(
            f"SELECT COUNT(*) AS total FROM users WHERE (name ILIKE %s OR email ILIKE %s OR username ILIKE %s) {role_clause}", params
        ).fetchone()["total"]
        rows = c.execute(
            f"""SELECT id,name,username,email,phone,role,
                       CASE WHEN COALESCE(nid,'')='' THEN NULL ELSE '••••••••' || RIGHT(nid,4) END AS nid_masked,
                       designation,created_at,profile_picture FROM users
                WHERE (name ILIKE %s OR email ILIKE %s OR username ILIKE %s) {role_clause}
                ORDER BY id DESC LIMIT %s OFFSET %s""",
            params + [limit, offset],
        ).fetchall()
    return {"items": rows, "total": total, "limit": limit, "offset": offset}


@app.post("/api/admin/officers", status_code=201)
def admin_create_officer(req: OfficerCreateRequest, authorization: Optional[str] = Header(None)):
    admin = extract_user_from_auth_header(authorization)
    if not admin or admin.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    if req.password != req.password_confirmation:
        raise HTTPException(status_code=422, detail="Passwords do not match")
    email = req.email.strip().lower()
    username = req.username.strip()
    username_key = username.lower()
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        raise HTTPException(status_code=422, detail="Enter a valid email address")
    if not _valid_username(username):
        raise HTTPException(status_code=422, detail="Username must be 4-30 characters using letters, numbers, underscores, or periods")
    phone = req.phone.strip()
    nid = _normalize_nid(req.nid)
    if not re.fullmatch(r"\+?[0-9]{8,15}", phone):
        raise HTTPException(status_code=422, detail="Enter a valid phone number and NID")
    try:
        with engine.conn() as c:
            c.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", ("nid:" + nid,))
            c.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", ("username:" + username_key,))
            if c.execute("SELECT 1 FROM users WHERE LOWER(email)=%s", (email,)).fetchone():
                raise HTTPException(status_code=409, detail="This email is already registered")
            if c.execute("SELECT 1 FROM users WHERE LOWER(username)=%s", (username_key,)).fetchone():
                raise HTTPException(status_code=409, detail="This username is already taken")
            if c.execute("SELECT 1 FROM users WHERE regexp_replace(translate(COALESCE(nid,''),'০১২৩৪৫৬৭৮৯٠١٢٣٤٥٦٧٨٩','01234567890123456789'),'[^0-9]','','g')=%s", (nid,)).fetchone():
                raise HTTPException(status_code=409, detail="An account with this NID already exists.")
            pw_hash, salt = engine.hash_password(req.password)
            inserted = c.execute(
                """INSERT INTO users(name,username,email,phone,role,password_hash,salt,nid,designation,created_at,updated_at)
                   VALUES(%s,%s,%s,%s,'officer',%s,%s,%s,%s,%s,%s) RETURNING id""",
                (req.name.strip(), username, email, phone, pw_hash, salt, nid, "Land Service Officer", datetime.now().isoformat(), datetime.now().isoformat()),
            ).fetchone()
    except UniqueViolation as exc:
        _raise_user_unique_conflict(exc)
    created = engine.get_user_by_id(inserted["id"])
    engine.log_audit(admin["name"], "admin", "USER_CREATE_OFFICER", "USER_MANAGEMENT", f"Created officer account {email}")
    return _public_user_data(created)


@app.get("/api/admin/data/{dataset}")
def admin_list_data(
    dataset: str,
    authorization: Optional[str] = Header(None),
    q: str = "",
    limit: int = 25,
    offset: int = 0,
):
    admin = extract_user_from_auth_header(authorization)
    if not admin or admin.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    tables = {
        "applications": ("mutation_applications", "id,tracking_no,applicant_name,CASE WHEN COALESCE(applicant_nid,'')='' THEN NULL ELSE '••••••••' || RIGHT(applicant_nid,4) END AS applicant_nid,district,upazila,plot_no,status,created_at", "tracking_no ILIKE %s OR applicant_name ILIKE %s OR plot_no ILIKE %s"),
        "properties": ("properties", "id,plot_id,district,upazila,mouza,khatian_no,area,current_owner,status,created_at", "plot_id ILIKE %s OR current_owner ILIKE %s"),
        "deeds": ("deeds", "id,deed_no,reg_year,district,upazila,plot_id,khatian_no,seller_name,buyer_name,area,price,reg_date", "deed_no ILIKE %s OR plot_id ILIKE %s OR buyer_name ILIKE %s OR seller_name ILIKE %s"),
        "verifications": ("deed_verifications", "id,verification_ref,user_id,deed_no,result_status,match_score,created_at", "verification_ref ILIKE %s OR deed_no ILIKE %s"),
        "due-diligence": ("due_diligence_reports", "id,report_ref,user_id,seller_name,district,plot_no,risk_score,risk_level,created_at", "report_ref ILIKE %s OR seller_name ILIKE %s OR plot_no ILIKE %s"),
        "notifications": ("notifications", "id,user_id,user_role,title_en,type,is_read,created_at", "title_en ILIKE %s OR user_role ILIKE %s"),
        "audit-logs": ("audit_logs", "id,user_name,user_role,action,module,details,created_at", "user_name ILIKE %s OR action ILIKE %s OR module ILIKE %s"),
        "records": ("records", "id,deed_no,plot_id,seller,buyer,sale_date,risk_score,risk_level", "deed_no ILIKE %s OR plot_id ILIKE %s OR buyer ILIKE %s OR seller ILIKE %s"),
    }
    if dataset not in tables:
        raise HTTPException(status_code=404, detail="Unknown data collection")
    table, columns, search_clause = tables[dataset]
    limit, offset = max(1, min(limit, 100)), max(0, offset)
    search_terms = search_clause.count("%s")
    params = [f"%{q.strip()}%"] * search_terms if q.strip() else []
    where = f"WHERE ({search_clause})" if params else ""
    with engine.conn() as c:
        total = c.execute(f"SELECT COUNT(*) AS total FROM {table} {where}", params).fetchone()["total"]
        rows = c.execute(f"SELECT {columns} FROM {table} {where} ORDER BY id DESC LIMIT %s OFFSET %s", params + [limit, offset]).fetchall()
    return {"items": rows, "total": total, "limit": limit, "offset": offset}





@app.post("/api/admin/deed-search/unlock")

def admin_unlock_deed_search(

    req: DeedSearchUnlockRequest,

    authorization: Optional[str] = Header(None),

):

    user = extract_user_from_auth_header(authorization)

    if not user or user.get("role") != "admin":

        raise HTTPException(status_code=403, detail="শুধুমাত্র প্রশাসক লক অগ্রাহ্য করতে পারেন।")

    return deed_search.admin_unlock(req.subject_type, req.subject_key, req.user_id)





# =====================================================================

# P4: SMART E-NAMJARI ROUTES

# =====================================================================



@app.post("/api/mutation/apply")

def apply_mutation(req: MutationApplyRequest, user_id: Optional[int] = None, authorization: Optional[str] = Header(None)):
    auth_user = extract_user_from_auth_header(authorization)
    if not auth_user:
        raise HTTPException(status_code=401, detail="Authentication required")
    req.applicant_nid = _normalize_nid(req.applicant_nid)
    uid = auth_user["id"]
    uname = auth_user["name"]

    app_data = req.model_dump()

    res = engine.create_mutation_application(app_data, user_id=uid, user_name=uname)

    return res





@app.put("/api/mutation/update/{tracking_no}")

def update_mutation(tracking_no: str, data: dict, authorization: Optional[str] = Header(None)):

    auth_user = extract_user_from_auth_header(authorization)
    if not auth_user:
        raise HTTPException(status_code=401, detail="Authentication required")
    if "applicant_nid" in data:
        data["applicant_nid"] = _normalize_nid(data["applicant_nid"])
    existing = engine.get_mutation_application(tracking_no)
    if not existing:
        raise HTTPException(status_code=404, detail="Application not found")
    if auth_user["role"] not in ("citizen", "officer", "admin"):
        raise HTTPException(status_code=403, detail="Application update is not allowed for this role.")
    if auth_user["role"] == "officer":
        raise HTTPException(status_code=403, detail="Officers cannot edit applicant-submitted fields.")
    if auth_user["role"] != "admin" and existing.get("user_id") != auth_user["id"]:
        raise HTTPException(status_code=403, detail="Cannot modify another user's application")

    res = engine.update_mutation_application(tracking_no, data)

    if not res:

        raise HTTPException(status_code=404, detail="আবেদন পাওয়া যায়নি (Application not found)")

    return res





@app.get("/api/mutation/track/{tracking_no}")

def track_mutation(tracking_no: str, authorization: Optional[str] = Header(None)):

    auth_user = extract_user_from_auth_header(authorization)
    if not auth_user:
        raise HTTPException(status_code=401, detail="Authentication required")

    res = engine.get_mutation_application(tracking_no)

    if not res:

        raise HTTPException(status_code=404, detail="উক্ত ট্র্যাকিং নম্বরে কোনো আবেদন পাওয়া যায়নি (Application not found)")

    if auth_user["role"] == "officer":
        try:
            with engine.conn() as connection:
                _require_officer_assignment(connection, "mutation_applications", "tracking_no", tracking_no, int(auth_user["id"]))
        except UndefinedTable as exc:
            raise HTTPException(status_code=503, detail="Application schema is unavailable.") from exc
    elif auth_user["role"] != "admin" and res.get("user_id") != auth_user["id"]:
        # Keep unknown IDs and another user's IDs indistinguishable in tracking search.
        raise HTTPException(status_code=404, detail="এই Tracking ID-এর কোনো আবেদন আপনার অ্যাকাউন্টে পাওয়া যায়নি।")

    return res





@app.get("/api/mutation/my-applications")

def my_mutations(user_id: Optional[int] = None, authorization: Optional[str] = Header(None)):
    auth_user = extract_user_from_auth_header(authorization)
    if not auth_user:
        raise HTTPException(status_code=401, detail="Authentication required")
    if user_id is not None and user_id != auth_user["id"]:
        raise HTTPException(status_code=403, detail="Cannot access another user's applications")
    uid = auth_user["id"]
    return engine.list_mutation_applications(user_id=uid, role="citizen")


def _database_has_column(connection, table_name: str, column_name: str) -> bool:
    """Check optional assignment support without requiring a schema migration."""
    return bool(connection.execute(
        """SELECT EXISTS (
               SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name=%s AND column_name=%s
           ) AS available""",
        (table_name, column_name),
    ).fetchone()["available"])


def _require_officer_assignment(connection, table_name: str, key_column: str, key_value, officer_id: int):
    """Fail closed for officers until an application is explicitly assigned."""
    if table_name not in {"mutation_applications", "deed_digitization_applications"} or key_column not in {"id", "tracking_no"}:
        raise HTTPException(status_code=403, detail="Officer assignment is unavailable.")
    if not _database_has_column(connection, table_name, "assigned_officer_id"):
        raise HTTPException(status_code=403, detail="Officer application assignments are not configured.")
    row = connection.execute(
        f"SELECT 1 FROM {table_name} WHERE {key_column}=%s AND assigned_officer_id=%s LIMIT 1",
        (key_value, int(officer_id)),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Application not found in this officer's assigned scope.")


def _unified_application_query(
    user_id: Optional[int],
    include_deed_digitization: bool,
    officer_id: Optional[int] = None,
    mutation_has_assignment: bool = False,
    deed_has_assignment: bool = False,
):
    """Build an owner- or assignment-scoped union over the existing workflows."""
    mutation_assignment_select = (
        "m.assigned_officer_id, assigned.name AS assigned_officer_name, assigned.username AS assigned_officer_username"
        if mutation_has_assignment else
        "NULL::integer AS assigned_officer_id, NULL::text AS assigned_officer_name, NULL::text AS assigned_officer_username"
    )
    deed_assignment_select = (
        "a.assigned_officer_id, assigned.name AS assigned_officer_name, assigned.username AS assigned_officer_username"
        if deed_has_assignment else
        "NULL::integer AS assigned_officer_id, NULL::text AS assigned_officer_name, NULL::text AS assigned_officer_username"
    )
    mutation_assignment_join = "LEFT JOIN users assigned ON assigned.id=m.assigned_officer_id" if mutation_has_assignment else ""
    deed_assignment_join = "LEFT JOIN users assigned ON assigned.id=a.assigned_officer_id" if deed_has_assignment else ""
    mutation = """
        SELECT 'mutation'::text AS application_type,
               m.id::text AS application_id,
               m.tracking_no AS tracking_id,
               u.name AS applicant_name, u.username AS applicant_username,
               m.status AS source_status,
               CASE
                 WHEN LOWER(REPLACE(m.status, ' ', '_')) IN ('additional_information_required','correction_required') THEN 'correction_required'
                 WHEN LOWER(REPLACE(m.status, ' ', '_')) IN ('initial_review','document_verification') THEN 'under_review'
                 ELSE LOWER(REPLACE(m.status, ' ', '_'))
               END AS status,
               m.created_at::timestamptz AS submitted_at,
               m.updated_at::timestamptz AS updated_at,
               m.deed_no AS reference,
               m.district, m.upazila, m.mouza, m.plot_no,
               {mutation_assignment_select},
               h.remarks AS latest_progress
        FROM mutation_applications m
        LEFT JOIN users u ON u.id=m.user_id
        {mutation_assignment_join}
        LEFT JOIN LATERAL (
            SELECT remarks FROM mutation_status_history
            WHERE application_id = m.id OR tracking_no = m.tracking_no
            ORDER BY id DESC LIMIT 1
        ) h ON TRUE
        WHERE LOWER(m.status) <> 'draft'
    """.format(mutation_assignment_select=mutation_assignment_select, mutation_assignment_join=mutation_assignment_join)
    parameters = []
    if user_id is not None:
        mutation += " AND m.user_id = %s"
        parameters.append(int(user_id))
    if officer_id is not None:
        if mutation_has_assignment:
            mutation += " AND m.assigned_officer_id = %s"
            parameters.append(int(officer_id))
        else:
            mutation += " AND FALSE"
    if include_deed_digitization:
        mutation += """
        UNION ALL
        SELECT 'deed_digitization'::text AS application_type,
               a.id::text AS application_id,
               a.tracking_id,
               u.name AS applicant_name, u.username AS applicant_username,
               a.status AS source_status,
               CASE WHEN a.status = 'digitization_processing' THEN 'processing' ELSE a.status END AS status,
               a.submitted_at, a.updated_at,
               a.deed_data->>'deed_no' AS reference,
               a.deed_data->>'district' AS district,
               a.deed_data->>'upazila' AS upazila,
               a.deed_data->>'mouza' AS mouza,
               a.deed_data->>'plot_id' AS plot_no,
               {deed_assignment_select},
               h.note AS latest_progress
        FROM deed_digitization_applications a
        LEFT JOIN users u ON u.id=a.owner_user_id
        {deed_assignment_join}
        LEFT JOIN LATERAL (
            SELECT note FROM deed_digitization_status_history
            WHERE application_id = a.id ORDER BY id DESC LIMIT 1
        ) h ON TRUE
        WHERE TRUE
        """.format(deed_assignment_select=deed_assignment_select, deed_assignment_join=deed_assignment_join)
        if user_id is not None:
            mutation += " AND a.owner_user_id = %s"
            parameters.append(int(user_id))
        if officer_id is not None:
            if deed_has_assignment:
                mutation += " AND a.assigned_officer_id = %s"
                parameters.append(int(officer_id))
            else:
                mutation += " AND FALSE"
    return mutation, parameters


@app.get("/api/applications/my")
@app.get("/api/applications/my/history")
def get_my_unified_application_history(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    application_type: str = Query("all", pattern="^(all|mutation|deed_digitization)$"),
    application_status: Optional[str] = Query(None, alias="status"),
    date_field: str = Query("submitted", pattern="^(submitted|updated)$"),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    sort: str = Query("latest", pattern="^(latest|oldest|recently_updated)$"),
    authorization: Optional[str] = Header(None),
):
    auth_user = extract_user_from_auth_header(authorization)
    if not auth_user:
        raise HTTPException(status_code=401, detail="Authentication required")
    if auth_user.get("role") != "citizen":
        raise HTTPException(status_code=403, detail="Citizen application history is limited to citizen accounts.")
    if date_from and date_to and date_from > date_to:
        raise HTTPException(status_code=422, detail="Invalid date range.")
    allowed_statuses = {"submitted", "under_review", "correction_required", "resubmitted", "approved", "processing", "completed", "rejected", "cancelled"}
    if application_status and application_status not in allowed_statuses:
        raise HTTPException(status_code=422, detail="Unknown application status.")

    try:
        with engine.conn() as connection:
            deed_schema_available = bool(connection.execute(
                "SELECT to_regclass('public.deed_digitization_applications') IS NOT NULL AS available"
            ).fetchone()["available"])
            union_sql, union_params = _unified_application_query(int(auth_user["id"]), deed_schema_available)
            summary = connection.execute(
                """SELECT COUNT(*) AS total,
                          COUNT(*) FILTER (WHERE status IN ('submitted','resubmitted','correction_required')) AS pending,
                          COUNT(*) FILTER (WHERE status='under_review') AS under_review,
                          COUNT(*) FILTER (WHERE status='completed' OR (application_type='mutation' AND status='approved')) AS completed,
                          COUNT(*) FILTER (WHERE status IN ('rejected','cancelled')) AS closed
                   FROM (""" + union_sql + ") apps", union_params,
            ).fetchone()
            filters = []
            params = list(union_params)
            if application_type != "all":
                filters.append("application_type=%s")
                params.append(application_type)
            if application_status:
                filters.append("status=%s")
                params.append(application_status)
            timestamp_column = "submitted_at" if date_field == "submitted" else "updated_at"
            if date_from:
                filters.append(f"{timestamp_column}::date >= %s")
                params.append(date_from)
            if date_to:
                filters.append(f"{timestamp_column}::date <= %s")
                params.append(date_to)
            where_sql = " WHERE " + " AND ".join(filters) if filters else ""
            order_sql = "updated_at DESC, submitted_at DESC" if sort == "recently_updated" else ("submitted_at ASC, application_id ASC" if sort == "oldest" else "submitted_at DESC, application_id DESC")
            count = connection.execute("SELECT COUNT(*) AS total FROM (" + union_sql + ") apps" + where_sql, [*params]).fetchone()["total"]
            rows = connection.execute(
                "SELECT * FROM (" + union_sql + ") apps" + where_sql + f" ORDER BY {order_sql} LIMIT %s OFFSET %s",
                [*params, page_size, (page - 1) * page_size],
            ).fetchall()
    except UndefinedTable as exc:
        raise HTTPException(status_code=503, detail="Application history schema is unavailable.") from exc

    return {
        "items": [dict(row) for row in rows],
        "total": int(count),
        "page": page,
        "page_size": page_size,
        "summary": {key: int(summary[key] or 0) for key in ("total", "pending", "under_review", "completed", "closed")},
        "available_types": ["mutation"] + (["deed_digitization"] if deed_schema_available else []),
    }


@app.get("/api/applications/admin")
def get_unified_application_admin_queue(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    application_type: str = Query("all", pattern="^(all|mutation|deed_digitization)$"),
    application_status: Optional[str] = Query(None, alias="status"),
    q: str = Query("", max_length=160),
    date_field: str = Query("submitted", pattern="^(submitted|updated)$"),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    sort: str = Query("latest", pattern="^(latest|oldest|recently_updated)$"),
    authorization: Optional[str] = Header(None),
):
    auth_user = extract_user_from_auth_header(authorization)
    if not auth_user:
        raise HTTPException(status_code=401, detail="Authentication required")
    if auth_user.get("role") not in ("officer", "admin"):
        raise HTTPException(status_code=403, detail="Officer or admin access required")
    if date_from and date_to and date_from > date_to:
        raise HTTPException(status_code=422, detail="Invalid date range.")
    allowed_statuses = {"pending", "submitted", "under_review", "correction_required", "resubmitted", "approved", "processing", "completed", "rejected", "cancelled"}
    if application_status and application_status not in allowed_statuses:
        raise HTTPException(status_code=422, detail="Unknown application status.")
    try:
        with engine.conn() as connection:
            deed_schema_available = bool(connection.execute(
                "SELECT to_regclass('public.deed_digitization_applications') IS NOT NULL AS available"
            ).fetchone()["available"])
            is_officer = auth_user.get("role") == "officer"
            mutation_has_assignment = _database_has_column(connection, "mutation_applications", "assigned_officer_id")
            deed_has_assignment = (
                _database_has_column(connection, "deed_digitization_applications", "assigned_officer_id")
                if deed_schema_available else False
            )
            union_sql, union_params = _unified_application_query(
                None, deed_schema_available,
                officer_id=int(auth_user["id"]) if is_officer else None,
                mutation_has_assignment=mutation_has_assignment,
                deed_has_assignment=deed_has_assignment,
            )
            filters = []
            params = list(union_params)
            if application_type != "all":
                filters.append("application_type=%s")
                params.append(application_type)
            if application_status == "pending":
                filters.append("status IN ('submitted','resubmitted','correction_required')")
            elif application_status == "approved":
                filters.append("(status='approved' OR (application_type='deed_digitization' AND status='completed'))")
            elif application_status:
                filters.append("status=%s")
                params.append(application_status)
            if q.strip():
                filters.append("(tracking_id ILIKE %s OR COALESCE(applicant_name,'') ILIKE %s OR COALESCE(applicant_username,'') ILIKE %s)")
                search_value = f"%{q.strip()}%"
                params.extend((search_value, search_value, search_value))
            timestamp_column = "submitted_at" if date_field == "submitted" else "updated_at"
            if date_from:
                filters.append(f"{timestamp_column}::date >= %s")
                params.append(date_from)
            if date_to:
                filters.append(f"{timestamp_column}::date <= %s")
                params.append(date_to)
            where_sql = " WHERE " + " AND ".join(filters) if filters else ""
            order_sql = "updated_at DESC, submitted_at DESC" if sort == "recently_updated" else ("submitted_at ASC, application_id ASC" if sort == "oldest" else "submitted_at DESC, application_id DESC")
            total = connection.execute("SELECT COUNT(*) AS total FROM (" + union_sql + ") apps" + where_sql, params).fetchone()["total"]
            rows = connection.execute(
                "SELECT * FROM (" + union_sql + ") apps" + where_sql + f" ORDER BY {order_sql} LIMIT %s OFFSET %s",
                [*params, page_size, (page - 1) * page_size],
            ).fetchall()
            summary = connection.execute(
                """SELECT COUNT(*) AS total,
                          COUNT(*) FILTER (WHERE status IN ('submitted','resubmitted','correction_required')) AS pending,
                          COUNT(*) FILTER (WHERE status='under_review') AS under_review,
                          COUNT(*) FILTER (WHERE status IN ('approved','processing','completed')) AS completed,
                          COUNT(*) FILTER (WHERE status IN ('rejected','cancelled')) AS closed
                   FROM (""" + union_sql + ") apps", union_params,
            ).fetchone()
    except UndefinedTable as exc:
        raise HTTPException(status_code=503, detail="Application history schema is unavailable.") from exc
    return {
        "items": [dict(row) for row in rows], "total": int(total), "page": page, "page_size": page_size,
        "available_types": ["mutation"] + (["deed_digitization"] if deed_schema_available else []),
        "summary": {key: int(summary[key] or 0) for key in ("total", "pending", "under_review", "completed", "closed")},
        "assignment_scope_configured": None if auth_user.get("role") == "admin" else (
            mutation_has_assignment and (not deed_schema_available or deed_has_assignment)
        ),
    }


@app.get("/api/applications/staff-history")
def get_staff_application_history(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    application_type: str = Query("all", pattern="^(all|mutation|deed_digitization)$"),
    application_status: Optional[str] = Query(None, alias="status"),
    q: str = Query("", max_length=160),
    date_field: str = Query("submitted", pattern="^(submitted|updated)$"),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    sort: str = Query("latest", pattern="^(latest|oldest|recently_updated)$"),
    authorization: Optional[str] = Header(None),
):
    """System-wide read-only history for staff; does not grant review/action rights."""
    auth_user = extract_user_from_auth_header(authorization)
    if not auth_user:
        raise HTTPException(status_code=401, detail="Authentication required")
    if auth_user.get("role") not in ("officer", "admin"):
        raise HTTPException(status_code=403, detail="Officer or admin access required")
    if date_from and date_to and date_from > date_to:
        raise HTTPException(status_code=422, detail="Invalid date range.")
    allowed_statuses = {
        "submitted", "under_review", "correction_required", "resubmitted", "approved",
        "processing", "completed", "rejected", "cancelled",
    }
    if application_status and application_status not in allowed_statuses:
        raise HTTPException(status_code=422, detail="Unknown application status.")

    try:
        with engine.conn() as connection:
            deed_schema_available = bool(connection.execute(
                "SELECT to_regclass('public.deed_digitization_applications') IS NOT NULL AS available"
            ).fetchone()["available"])
            mutation_has_assignment = _database_has_column(connection, "mutation_applications", "assigned_officer_id")
            deed_has_assignment = (
                _database_has_column(connection, "deed_digitization_applications", "assigned_officer_id")
                if deed_schema_available else False
            )
            # No officer_id is supplied here by design: this read-only history
            # feature is system-wide for both staff roles. Review endpoints keep
            # their stricter assignment checks independently.
            union_sql, union_params = _unified_application_query(
                None, deed_schema_available,
                mutation_has_assignment=mutation_has_assignment,
                deed_has_assignment=deed_has_assignment,
            )
            filters = ["LOWER(status) <> 'draft'"]
            params = list(union_params)
            if application_type != "all":
                filters.append("application_type=%s")
                params.append(application_type)
            if application_status:
                if application_status == "approved":
                    filters.append("(status='approved' OR (application_type='deed_digitization' AND status='completed'))")
                else:
                    filters.append("status=%s")
                    params.append(application_status)
            if q.strip():
                filters.append("(tracking_id ILIKE %s OR COALESCE(applicant_name,'') ILIKE %s OR COALESCE(applicant_username,'') ILIKE %s)")
                value = f"%{q.strip()}%"
                params.extend((value, value, value))
            timestamp_column = "submitted_at" if date_field == "submitted" else "updated_at"
            if date_from:
                filters.append(f"{timestamp_column}::date >= %s")
                params.append(date_from)
            if date_to:
                filters.append(f"{timestamp_column}::date <= %s")
                params.append(date_to)
            where_sql = " WHERE " + " AND ".join(filters) if filters else ""
            order_sql = "updated_at DESC, submitted_at DESC" if sort == "recently_updated" else (
                "submitted_at ASC, application_id ASC" if sort == "oldest" else "submitted_at DESC, application_id DESC"
            )
            total = connection.execute(
                "SELECT COUNT(*) AS total FROM (" + union_sql + ") apps" + where_sql, params,
            ).fetchone()["total"]
            rows = connection.execute(
                "SELECT * FROM (" + union_sql + ") apps" + where_sql +
                f" ORDER BY {order_sql} LIMIT %s OFFSET %s",
                [*params, page_size, (page - 1) * page_size],
            ).fetchall()
            summary = connection.execute(
                """SELECT COUNT(*) AS total,
                          COUNT(*) FILTER (WHERE status IN ('submitted','resubmitted','correction_required')) AS pending,
                          COUNT(*) FILTER (WHERE status='under_review') AS under_review,
                          COUNT(*) FILTER (WHERE status='completed' OR (application_type='mutation' AND status='approved')) AS completed,
                          COUNT(*) FILTER (WHERE status IN ('rejected','cancelled')) AS closed
                   FROM (""" + union_sql + ") apps WHERE LOWER(status) <> 'draft'", union_params,
            ).fetchone()
    except UndefinedTable as exc:
        raise HTTPException(status_code=503, detail="Application history schema is unavailable.") from exc
    return {
        "items": [dict(row) for row in rows], "total": int(total), "page": page, "page_size": page_size,
        "available_types": ["mutation"] + (["deed_digitization"] if deed_schema_available else []),
        "summary": {key: int(summary[key] or 0) for key in ("total", "pending", "under_review", "completed", "closed")},
    }


@app.get("/api/applications/staff-history/track/{tracking_id}")
def get_staff_application_history_detail(tracking_id: str, authorization: Optional[str] = Header(None)):
    """Read a full application and timeline for authenticated Admin/Officer history."""
    auth_user = extract_user_from_auth_header(authorization)
    if not auth_user:
        raise HTTPException(status_code=401, detail="Authentication required")
    if auth_user.get("role") not in ("officer", "admin"):
        raise HTTPException(status_code=403, detail="Officer or admin access required")
    if not tracking_id or len(tracking_id) > 100:
        raise HTTPException(status_code=404, detail="Application not found.")
    try:
        with engine.conn() as connection:
            mutation = connection.execute(
                """SELECT m.*, u.username AS account_username
                   FROM mutation_applications m LEFT JOIN users u ON u.id=m.user_id
                   WHERE UPPER(m.tracking_no)=UPPER(%s)""",
                (tracking_id.strip(),),
            ).fetchone()
            if mutation:
                details = dict(mutation)
                details["applicant_name"] = details.get("applicant_name") or details.get("name")
                details.pop("applicant_nid", None)
                raw_docs = details.get("supporting_docs")
                try:
                    details["supporting_docs"] = json.loads(raw_docs) if raw_docs else []
                except (TypeError, ValueError):
                    details["supporting_docs"] = []
                history = connection.execute(
                    """SELECT to_status AS status,changed_by_name AS actor_name,changed_by_role AS actor_role,
                              remarks AS note,created_at
                       FROM mutation_status_history
                       WHERE application_id=%s OR tracking_no=%s ORDER BY id""",
                    (mutation["id"], mutation["tracking_no"]),
                ).fetchall()
                return {
                    "application_type": "mutation", "tracking_id": details["tracking_no"],
                    "status": details["status"], "submitted_at": details["created_at"],
                    "updated_at": details["updated_at"], "applicant_name": details.get("applicant_name"),
                    "applicant_username": details.get("account_username"), "details": details,
                    "timeline": [dict(item) for item in history], "documents": [],
                }

            deed_table_available = bool(connection.execute(
                "SELECT to_regclass('public.deed_digitization_applications') IS NOT NULL AS available"
            ).fetchone()["available"])
            if deed_table_available:
                deed = connection.execute(
                    """SELECT a.*, u.name AS applicant_name, u.username AS applicant_username
                       FROM deed_digitization_applications a JOIN users u ON u.id=a.owner_user_id
                       WHERE UPPER(a.tracking_id)=UPPER(%s)""",
                    (tracking_id.strip(),),
                ).fetchone()
                if deed:
                    history = connection.execute(
                        """SELECT h.to_status AS status,h.actor_role,u.name AS actor_name,h.note,h.created_at
                           FROM deed_digitization_status_history h LEFT JOIN users u ON u.id=h.actor_user_id
                           WHERE h.application_id=%s ORDER BY h.id""",
                        (deed["id"],),
                    ).fetchall()
                    documents = connection.execute(
                        """SELECT id,original_filename,content_type,byte_length,created_at
                           FROM deed_digitization_documents WHERE application_id=%s ORDER BY id""",
                        (deed["id"],),
                    ).fetchall()
                    digital_deed = None
                    if deed.get("finalized_deed_id") and connection.execute(
                        "SELECT to_regclass('public.deed_digitization_metadata') IS NOT NULL AS available"
                    ).fetchone()["available"]:
                        digital_deed = connection.execute(
                            """SELECT deed_id,digital_deed_id,record_status FROM deed_digitization_metadata
                               WHERE deed_id=%s AND owner_user_id=%s""",
                            (deed["finalized_deed_id"], deed["owner_user_id"]),
                        ).fetchone()
                    return {
                        "application_type": "deed_digitization", "tracking_id": deed["tracking_id"],
                        "status": deed["status"], "submitted_at": deed["submitted_at"],
                        "updated_at": deed["updated_at"], "applicant_name": deed["applicant_name"],
                        "applicant_username": deed["applicant_username"],
                        "details": {"id": int(deed["id"]), "entry_method": deed["entry_method"],
                                    "deed_data": deed["deed_data"], "ocr_text": deed["ocr_text"]},
                        "timeline": [dict(item) for item in history], "documents": [dict(item) for item in documents],
                        "digital_deed": dict(digital_deed) if digital_deed else None,
                    }
    except UndefinedTable as exc:
        raise HTTPException(status_code=503, detail="Application history schema is unavailable.") from exc
    raise HTTPException(status_code=404, detail="Application not found.")


@app.get("/api/applications/my/track/{tracking_id}")
def get_my_application_by_tracking_id(tracking_id: str, authorization: Optional[str] = Header(None)):
    """Exact tracking lookup. A missing and another user's ID are indistinguishable."""
    auth_user = extract_user_from_auth_header(authorization)
    if not auth_user:
        raise HTTPException(status_code=401, detail="Authentication required")
    if auth_user.get("role") != "citizen":
        raise HTTPException(status_code=403, detail="Citizen tracking is limited to citizen accounts.")
    if not tracking_id or len(tracking_id) > 100:
        raise HTTPException(status_code=404, detail="এই Tracking ID-এর কোনো আবেদন আপনার অ্যাকাউন্টে পাওয়া যায়নি।")
    try:
        with engine.conn() as connection:
            mutation = connection.execute(
                "SELECT * FROM mutation_applications WHERE user_id=%s AND UPPER(tracking_no)=UPPER(%s)",
                (int(auth_user["id"]), tracking_id.strip()),
            ).fetchone()
            if mutation:
                history = connection.execute(
                    """SELECT to_status AS status,changed_by_name AS actor_name,changed_by_role AS actor_role,remarks AS note,created_at
                       FROM mutation_status_history WHERE application_id=%s OR tracking_no=%s ORDER BY id""",
                    (mutation["id"], mutation["tracking_no"]),
                ).fetchall()
                details = dict(mutation)
                raw_docs = details.get("supporting_docs")
                try:
                    details["supporting_docs"] = json.loads(raw_docs) if raw_docs else []
                except (TypeError, ValueError):
                    details["supporting_docs"] = []
                details.pop("applicant_nid", None)
                return {"application_type": "mutation", "tracking_id": details["tracking_no"], "status": details["status"],
                        "submitted_at": details["created_at"], "updated_at": details["updated_at"], "details": details,
                        "timeline": [dict(item) for item in history], "digital_deed": None}

            deed_table_available = bool(connection.execute(
                "SELECT to_regclass('public.deed_digitization_applications') IS NOT NULL AS available"
            ).fetchone()["available"])
            if deed_table_available:
                deed = connection.execute(
                    "SELECT * FROM deed_digitization_applications WHERE owner_user_id=%s AND UPPER(tracking_id)=UPPER(%s)",
                    (int(auth_user["id"]), tracking_id.strip()),
                ).fetchone()
                if deed:
                    history = connection.execute(
                        """SELECT h.to_status AS status,h.actor_role,u.name AS actor_name,h.note,h.created_at
                           FROM deed_digitization_status_history h LEFT JOIN users u ON u.id=h.actor_user_id
                           WHERE h.application_id=%s ORDER BY h.id""",
                        (deed["id"],),
                    ).fetchall()
                    documents = connection.execute(
                        "SELECT id,original_filename,content_type,byte_length,created_at FROM deed_digitization_documents WHERE application_id=%s ORDER BY id",
                        (deed["id"],),
                    ).fetchall()
                    digital_deed = None
                    if deed.get("finalized_deed_id") and connection.execute(
                        "SELECT to_regclass('public.deed_digitization_metadata') IS NOT NULL AS available"
                    ).fetchone()["available"]:
                        digital_deed = connection.execute(
                            "SELECT deed_id,digital_deed_id,record_status FROM deed_digitization_metadata WHERE deed_id=%s AND owner_user_id=%s",
                            (deed["finalized_deed_id"], int(auth_user["id"])),
                        ).fetchone()
                    return {"application_type": "deed_digitization", "tracking_id": deed["tracking_id"], "status": deed["status"],
                            "submitted_at": deed["submitted_at"], "updated_at": deed["updated_at"],
                            "details": {"id": int(deed["id"]), "entry_method": deed["entry_method"], "deed_data": deed["deed_data"], "ocr_text": deed["ocr_text"]},
                            "timeline": [dict(item) for item in history], "documents": [dict(item) for item in documents],
                            "digital_deed": dict(digital_deed) if digital_deed else None}
    except UndefinedTable as exc:
        raise HTTPException(status_code=503, detail="Application history schema is unavailable.") from exc
    raise HTTPException(status_code=404, detail="এই Tracking ID-এর কোনো আবেদন আপনার অ্যাকাউন্টে পাওয়া যায়নি।")





@app.get("/api/mutation/all-applications")

def all_mutations(status_filter: Optional[str] = None, authorization: Optional[str] = Header(None)):
    auth_user = extract_user_from_auth_header(authorization)
    if not auth_user:
        raise HTTPException(status_code=401, detail="Authentication required")
    if auth_user.get("role") not in ("officer", "admin"):
        raise HTTPException(status_code=403, detail="Officer or admin access required")
    if auth_user.get("role") == "admin":
        return engine.list_mutation_applications(status_filter=status_filter, exclude_drafts=True)
    return engine.list_mutation_applications(
        status_filter=status_filter, assigned_officer_id=int(auth_user["id"]), exclude_drafts=True,
    )





@app.post("/api/mutation/assign/{tracking_no}")
def assign_mutation_application(
    tracking_no: str,
    assignment: MutationAssignmentRequest,
    authorization: Optional[str] = Header(None),
):
    auth_user = extract_user_from_auth_header(authorization)
    if not auth_user:
        raise HTTPException(status_code=401, detail="Authentication required")
    if auth_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only admins can assign applications.")

    officer = None
    next_officer_id = None
    with engine.conn() as connection:
        application = connection.execute(
            "SELECT id,tracking_no,status,assigned_officer_id FROM mutation_applications WHERE UPPER(tracking_no)=UPPER(%s) FOR UPDATE",
            (tracking_no.strip(),),
        ).fetchone()
        if not application:
            raise HTTPException(status_code=404, detail="Application not found.")
        assignable_statuses = {
            "submitted", "under review", "initial review", "document verification",
            "decision pending", "correction required", "additional information required", "resubmitted",
        }
        if str(application["status"]).strip().lower() not in assignable_statuses:
            raise HTTPException(status_code=409, detail="Only applications awaiting review can be assigned.")
        if assignment.officer_id is not None:
            officer = connection.execute(
                "SELECT id,name,username FROM users WHERE id=%s AND role='officer'",
                (int(assignment.officer_id),),
            ).fetchone()
            if not officer:
                raise HTTPException(status_code=422, detail="Select a valid officer account.")
            next_officer_id = int(officer["id"])
        if application.get("assigned_officer_id") == next_officer_id:
            return {"tracking_id": application["tracking_no"], "assigned_officer_id": next_officer_id,
                    "assigned_officer_name": officer["name"] if officer else None, "unchanged": True}
        connection.execute(
            "UPDATE mutation_applications SET assigned_officer_id=%s,updated_at=%s WHERE id=%s",
            (next_officer_id, datetime.now().isoformat(), int(application["id"])),
        )
        audit_details = f"tracking_id={application['tracking_no']}; officer_id={next_officer_id}"

    engine.log_audit(auth_user.get("name", ""), "admin", "MUTATION_ASSIGNED" if officer else "MUTATION_UNASSIGNED",
                     "mutation_applications", audit_details)
    if officer:
        engine.add_notification(
            int(officer["id"]), "officer",
            "নতুন নামজারি আবেদন দায়িত্ব দেওয়া হয়েছে", "A mutation application was assigned to you",
            "ট্র্যাকিং নম্বর: " + application["tracking_no"], "Tracking ID: " + application["tracking_no"],
            "info", f"/officer/review/{application['tracking_no']}",
        )
    return {"tracking_id": application["tracking_no"], "assigned_officer_id": next_officer_id,
            "assigned_officer_name": officer["name"] if officer else None, "unchanged": False}


@app.post("/api/mutation/start-review/{tracking_no}")

def start_review_endpoint(tracking_no: str, authorization: Optional[str] = Header(None)):

    """Transitions an application to 'Under Review' when an authorized officer begins review."""

    auth_user = extract_user_from_auth_header(authorization)

    if not auth_user:
        raise HTTPException(status_code=401, detail="Authentication required")
    if auth_user.get("role") not in ("officer", "admin"):

        raise HTTPException(status_code=403, detail="শুধুমাত্র দায়িত্বপ্রাপ্ত কর্মকর্তা নথি পর্যালোচনা শুরু করতে পারেন।")



    officer_name = auth_user["name"]

    officer_role = auth_user["role"]



    app_record = engine.get_mutation_application(tracking_no)

    if not app_record:

        raise HTTPException(status_code=404, detail="আবেদন পাওয়া যায়নি (Application not found)")

    if officer_role == "officer":
        try:
            with engine.conn() as connection:
                _require_officer_assignment(connection, "mutation_applications", "tracking_no", tracking_no, int(auth_user["id"]))
        except UndefinedTable as exc:
            raise HTTPException(status_code=503, detail="Application schema is unavailable.") from exc



    cur_status = app_record.get("status")

    if cur_status == "Under Review":

        return app_record



    try:

        return engine.update_mutation_status(

            tracking_no=tracking_no,

            new_status="Under Review",

            changed_by_name=officer_name,

            changed_by_role=officer_role,

            remarks="নথি পর্যালোচনা শুরু হয়েছে" if officer_role == "officer" else "প্রশাসক নথি পর্যালোচনা শুরু করেছেন",
            changed_by_id=int(auth_user["id"]),
            assigned_officer_id=int(auth_user["id"]) if officer_role == "officer" else None

        )

    except PermissionError as e:
        raise HTTPException(status_code=404, detail="Application not found in this officer's assigned scope.") from e

    except ValueError as e:

        raise HTTPException(status_code=400, detail=str(e))





@app.post("/api/mutation/{tracking_no}/resubmit")

def resubmit_mutation_endpoint(

    tracking_no: str,

    req: MutationResubmitRequest,

    authorization: Optional[str] = Header(None)

):

    """Allows applicant to resubmit corrections when an application is in 'Correction Required' status."""

    auth_user = extract_user_from_auth_header(authorization)
    if not auth_user:
        raise HTTPException(status_code=401, detail="Authentication required")
    app_record = engine.get_mutation_application(tracking_no)
    if not app_record:
        raise HTTPException(status_code=404, detail="Application not found")
    if auth_user["role"] != "admin" and app_record.get("user_id") != auth_user["id"]:
        raise HTTPException(status_code=403, detail="Cannot resubmit another user's application")
    uid = auth_user["id"]
    uname = auth_user["name"]



    try:

        res = engine.resubmit_mutation_application(

            tracking_no=tracking_no,

            user_id=uid,

            user_name=uname,

            corrected_data=req.model_dump(exclude_unset=True)

        )

        return res

    except ValueError as e:

        raise HTTPException(status_code=400, detail=str(e))





@app.post("/api/mutation/action")

def mutation_action(req: MutationActionRequest, authorization: Optional[str] = Header(None)):

    """Role-protected officer action endpoint to transition mutation application status."""

    auth_user = extract_user_from_auth_header(authorization)
    if not auth_user:
        raise HTTPException(status_code=401, detail="Authentication required")
    if auth_user:
        if auth_user.get("role") not in ("officer", "admin"):

            raise HTTPException(

                status_code=403,

                detail="অননুমোদিত: শুধুমাত্র কর্মকর্তা বা অ্যাডমিন আবেদন পর্যালোচনা ও সিদ্ধান্ত নিতে পারেন।"

            )

        officer_name = auth_user.get("name") or "Reviewer"

        officer_role = auth_user["role"]

        if officer_role == "officer":
            try:
                with engine.conn() as connection:
                    _require_officer_assignment(connection, "mutation_applications", "tracking_no", req.tracking_no, int(auth_user["id"]))
            except UndefinedTable as exc:
                raise HTTPException(status_code=503, detail="Application schema is unavailable.") from exc




    try:

        updated = engine.update_mutation_status(

            tracking_no=req.tracking_no,

            new_status=req.new_status,

            changed_by_name=officer_name,

            changed_by_role=officer_role,

            remarks=req.remarks or "",

            rejection_reason=req.rejection_reason or "",

            correction_details=req.correction_details or "",

            changed_by_id=int(auth_user["id"]),

            assigned_officer_id=int(auth_user["id"]) if officer_role == "officer" else None

        )

        return updated

    except PermissionError as e:

        raise HTTPException(status_code=404, detail="Application not found in this officer's assigned scope.") from e

    except ValueError as e:

        raise HTTPException(status_code=400, detail=str(e))





# =====================================================================

# AI LIVE CHAT CONVERSATIONAL ASSISTANT ROUTES

# =====================================================================



@app.post("/api/chat/message")

async def chat_message_api(req: ChatMessageRequest, authorization: Optional[str] = Header(None)):

    """Conversational AI chat handler (Bengali / Banglish / English) with authorised DB tools."""

    if not req.message.strip():

        raise HTTPException(status_code=422, detail="Empty message: please type a question.")



    auth_user = extract_user_from_auth_header(authorization)



    if chat_service:

        return await chat_service.generate_response(

            message=req.message,

            history=req.history or [],

            user=auth_user,

            tracking_no=req.tracking_no,

            current_page=req.current_page,

        )



    return {

        "reply": "ভূমিসেতু চ্যাট সার্ভিস বর্তমানে উপলব্ধ নয়। অনুগ্রহ করে কিছুক্ষণ পর চেষ্টা করুন। / The Bhumisetu chat service is unavailable right now.",

        "ai_configured": False,

        "provider": "Unavailable",

        "model": None,

        "context_used": False,

        "referenced_application": None,

        "error": {"code": "service_unavailable", "message": "Chat service failed to load.", "retryable": True},

    }





@app.get("/api/chat/status")

def chat_status_api():

    """Returns AI chat service health, provider, model, and configuration state (no secrets)."""

    if chat_service:

        configured = chat_service.is_ai_configured()

        return {

            "status": "online",

            "ai_configured": configured,

            "provider_availability": chat_service.get_provider_availability(),

            "provider": chat_service.get_provider_name(),

            "model": chat_service.get_model_name(),

            "supported_languages": ["bn (বাংলা)", "bn-Latn (Banglish)", "en (English)"],

            "features": [

                "Natural multi-turn conversation with intent understanding",

                "Authorised lookup of the signed-in user's e-Namjari status",

                "Bangladesh land records, khatian and deed guidance",

                "Due diligence, fraud-prevention and feature navigation help",

            ],

            "setup_hint": None if configured else (

                "Set GEMINI_API_KEY or OPENAI_API_KEY in the backend environment. "

                "See README → AI Assistant Configuration."

            ),

        }

    return {"status": "offline", "ai_configured": False, "provider": "Unavailable", "model": None}





@app.get("/api/mutation/stats")

def get_mutation_stats(authorization: Optional[str] = Header(None)):
    user = extract_user_from_auth_header(authorization)
    if not user or user["role"] not in ("admin", "officer"):
        raise HTTPException(status_code=403, detail="Officer or admin access required")
    if user["role"] == "admin":
        return engine.mutation_stats()
    with engine.conn() as connection:
        has_assignment = _database_has_column(connection, "mutation_applications", "assigned_officer_id")
        counts = {status: 0 for status in engine.VALID_MUTATION_STATUSES}
        if has_assignment:
            rows = connection.execute(
                "SELECT status,COUNT(*) AS n FROM mutation_applications WHERE assigned_officer_id=%s GROUP BY status",
                (int(user["id"]),),
            ).fetchall()
            for row in rows:
                counts[row["status"]] = int(row["n"])
    counts["total"] = sum(counts.values())
    counts["pending"] = sum(counts.get(status, 0) for status in ["Submitted", "Initial Review", "Document Verification", "Additional Information Required", "Decision Pending"])
    return counts





# =====================================================================

# P5: PRE-PURCHASE DUE DILIGENCE ROUTES

# =====================================================================



@app.post("/api/due-diligence/assess")

def assess_due_diligence_api(req: DueDiligenceRequest, authorization: Optional[str] = Header(None)):
    user = extract_user_from_auth_header(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    payload = req.model_dump()
    if payload.get("seller_nid"):
        payload["seller_nid"] = _normalize_nid(payload["seller_nid"])
    res = engine.assess_due_diligence(payload, user_id=user["id"], user_name=user["name"])

    return res





@app.get("/api/due-diligence/reports")

def list_due_diligence(authorization: Optional[str] = Header(None)):
    user = extract_user_from_auth_header(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    if user["role"] == "admin":
        return engine.list_due_diligence_reports()
    return engine.list_due_diligence_reports(user_id=user["id"])





@app.get("/api/due-diligence/report/{ref}")

def get_due_diligence_report_api(ref: str, authorization: Optional[str] = Header(None)):

    user = extract_user_from_auth_header(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")

    rep = engine.get_due_diligence_report(ref)

    if not rep:

        raise HTTPException(status_code=404, detail="যাচাই রিপোর্ট পাওয়া যায়নি (Due diligence report not found)")

    if user["role"] != "admin" and rep.get("user_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Cannot access another user's report")

    return rep





# =====================================================================

# PROPERTIES & PARCELS

# =====================================================================



@app.get("/api/properties")

def list_properties():

    return engine.get_all_properties()





@app.get("/api/properties/{plot_id}")

def get_property(plot_id: str):

    prop = engine.get_property_by_plot(plot_id)

    if not prop:

        raise HTTPException(status_code=404, detail="প্লট পাওয়া যায়নি (Property parcel not found)")

    return prop





# =====================================================================

# AUDIT LOGS & NOTIFICATIONS

# =====================================================================



@app.get("/api/audit-logs")

def list_audit_logs(limit: int = 50, authorization: Optional[str] = Header(None)):
    user = extract_user_from_auth_header(authorization)
    if not user or user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return engine.get_audit_logs(limit=max(1, min(limit, 100)))





@app.get("/api/notifications")

def get_notifications_api(user_id: Optional[int] = None, role: Optional[str] = None, authorization: Optional[str] = Header(None)):
    user = extract_user_from_auth_header(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    if user_id is not None and user_id != user["id"] and user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Cannot access another user's notifications")
    return engine.get_notifications(user_id=user["id"] if user["role"] != "admin" else user_id, role=user["role"] if user["role"] != "admin" else role)





@app.post("/api/notifications/{nid}/read")

def mark_read(nid: int, authorization: Optional[str] = Header(None)):
    user = extract_user_from_auth_header(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    with engine.conn() as c:
        row = c.execute("SELECT user_id,user_role FROM notifications WHERE id=%s", (nid,)).fetchone()
    if not row or (user["role"] != "admin" and row["user_id"] != user["id"] and row["user_role"] not in (user["role"], "all")):
        raise HTTPException(status_code=404, detail="Notification not found")
    return engine.mark_notification_read(nid)





# =====================================================================

# UNIFIED DASHBOARD STATS

# =====================================================================



@app.get("/api/dashboard/stats")

def get_dashboard_stats(authorization: Optional[str] = Header(None)):
    auth_user = extract_user_from_auth_header(authorization)
    if not auth_user:
        raise HTTPException(status_code=401, detail="Authentication required")
    if auth_user["role"] == "admin":
        return engine.dashboard_stats()
    if auth_user["role"] == "officer":
        with engine.conn() as c:
            has_assignment = _database_has_column(c, "mutation_applications", "assigned_officer_id")
            mutations = c.execute(
                "SELECT status,COUNT(*) AS total FROM mutation_applications WHERE assigned_officer_id=%s GROUP BY status" if has_assignment else
                "SELECT status,COUNT(*) AS total FROM mutation_applications WHERE FALSE GROUP BY status",
                (int(auth_user["id"]),) if has_assignment else (),
            ).fetchall()
        mutation_stats = {row["status"].lower().replace(" ", "_"): int(row["total"]) for row in mutations}
        mutation_stats["total"] = sum(mutation_stats.values())
        return {
            "mutation_stats": mutation_stats,
            "record_risk_stats": {"high": 0, "medium": 0, "low": 0},
            "due_diligence_stats": {"total": 0, "high": 0},
            "personal_stats": {"verifications": 0, "reports": 0},
            "assignment_scope_configured": has_assignment,
        }
    with engine.conn() as c:
        mutations = c.execute(
            "SELECT status, COUNT(*) AS total FROM mutation_applications WHERE user_id=%s GROUP BY status",
            (auth_user["id"],),
        ).fetchall()
        verifications = c.execute(
            "SELECT COUNT(*) AS total FROM deed_verifications WHERE user_id=%s", (auth_user["id"],)
        ).fetchone()["total"]
        reports = c.execute(
            "SELECT COUNT(*) AS total FROM due_diligence_reports WHERE user_id=%s", (auth_user["id"],)
        ).fetchone()["total"]
    mutation_stats = {row["status"].lower().replace(" ", "_"): row["total"] for row in mutations}
    mutation_stats["total"] = sum(mutation_stats.values())
    return {
        "mutation_stats": mutation_stats,
        "record_risk_stats": {"high": 0, "medium": 0, "low": 0},
        "due_diligence_stats": {"total": reports, "high": 0},
        "personal_stats": {"verifications": verifications, "reports": reports},
    }





@app.get("/api/search/binary")

def search_binary(
    q: str = "",
    category: str = "all",
    limit: int = 25,
    authorization: Optional[str] = Header(None),
):

    """
    Search land records through PostgreSQL queries and available indexes.
    Actual latency depends on data size, indexes, query pattern, and database resources.

    """

    auth_user = extract_user_from_auth_header(authorization)
    return engine.binary_search_land_records(
        query=q,
        category=category,
        limit=limit,
        mutation_owner_id=int(auth_user["id"]) if auth_user else None,
    )





# =====================================================================

# C++ HIGH-PERFORMANCE ENGINE & BENCHMARK SUITE

# =====================================================================



@app.get("/api/engine/status")

def engine_status():

    """Returns runtime telemetry for the C++ Native Acceleration Engine."""

    if cpp_bridge:

        return {

            "status": "online",

            "service": "BhumiSathi C++ Accelerated Engine",

            **cpp_bridge.get_engine_info()

        }

    return {

        "status": "online",

        "service": "BhumiSathi Fallback Engine",

        "cpp_accelerated": False

    }





@app.get("/api/benchmark")

def benchmark(operations: int = 20000):

    """Runs a live side-by-side benchmark comparing Python vs C++ Native Engine.

    Evaluates fuzzy string matches and graph cycle traversals.

    """

    if cpp_bridge:

        return cpp_bridge.run_benchmark(operations)

    return {"status": "error", "message": "C++ Bridge not loaded"}





@app.post("/api/fraud/detect-graph")

def detect_fraud_graph_api(transfers: List[dict]):

    """Analyzes ownership transfer chains for circular cartel loops (A -> B -> C -> A),

    double-sales, and rapid flips using C++ graph traversal.

    """

    if cpp_bridge:

        return cpp_bridge.detect_fraud_graph(transfers)

    return {"status": "error", "message": "C++ Bridge not loaded"}







# =====================================================================

# LEGACY ENDPOINTS (PRESERVED 100% FOR COMPATIBILITY)

# =====================================================================



@app.post("/api/records")

def create(r: RecordIn, authorization: Optional[str] = Header(None)):
    user = extract_user_from_auth_header(authorization)
    if not user or user["role"] not in ("admin", "officer"):
        raise HTTPException(status_code=403, detail="Officer or admin access required")
    result = engine.save(r.model_dump())
    engine.log_audit(user["name"], user["role"], "RECORD_CREATE", "RECORDS", f"Created record for plot {r.plot_id}")
    return result





@app.get("/api/records")

def records(authorization: Optional[str] = Header(None)):
    user = extract_user_from_auth_header(authorization)
    if not user or user["role"] not in ("admin", "officer"):
        raise HTTPException(status_code=403, detail="Officer or admin access required")
    return engine.listing()





@app.get("/api/records/{rid}")

def one(rid: int, authorization: Optional[str] = Header(None)):

    user = extract_user_from_auth_header(authorization)
    if not user or user["role"] not in ("admin", "officer"):
        raise HTTPException(status_code=403, detail="Officer or admin access required")

    with engine.conn() as c:

        x = engine.get(c, rid)

    if not x:

        raise HTTPException(404, "রেকর্ড পাওয়া যায়নি")

    return x





@app.get("/api/plots/{plot_id}/history")

def plot_history(plot_id: str, authorization: Optional[str] = Header(None)):
    user = extract_user_from_auth_header(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    return engine.history(plot_id)





@app.get("/api/stats")

def stats(authorization: Optional[str] = Header(None)):
    user = extract_user_from_auth_header(authorization)
    if not user or user["role"] not in ("admin", "officer"):
        raise HTTPException(status_code=403, detail="Officer or admin access required")
    return engine.stats()
