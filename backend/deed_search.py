"""Deed lookup against the application's available database records.

This module searches only records stored in Bhumisetu. It does not access
government sub-registry systems and never invents deed data.
"""

from __future__ import annotations

import hashlib
import os
import re
import secrets
import threading
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

try:
    import engine
except ImportError:
    from backend import engine


FAILED_ATTEMPT_LIMIT = 7
LOCK_DURATION = timedelta(hours=5)
MAX_PAGE_SIZE = 20
DEFAULT_PAGE_SIZE = 10
MAX_FIELD_LEN = 120
SESSION_COOKIE = "bs_deed_search_sid"
RATE_WINDOW = timedelta(minutes=10)
RATE_MAX_REQUESTS = 40

BN_DIGIT_MAP = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")

LOCK_MESSAGE_BN = (
    "আপনি পরপর ৭ বার ভুল দলিল নম্বর প্রদান করেছেন। নিরাপত্তার স্বার্থে "
    "আপনার দলিল অনুসন্ধান সুবিধা সাময়িকভাবে ৫ ঘণ্টার জন্য বন্ধ রাখা হয়েছে। "
    "অনুগ্রহ করে পরে আবার চেষ্টা করুন।"
)
NOT_FOUND_MESSAGE_BN = (
    "দুঃখিত! আপনার প্রদত্ত দলিল নম্বরটি আমাদের উপলব্ধ ডেটাবেজে খুঁজে পাওয়া যায়নি। "
    "অনুগ্রহ করে সঠিক দলিল নম্বর প্রদান করুন অথবা নিচের 'দলিল নম্বর খুঁজুন' "
    "অপশন ব্যবহার করে প্রয়োজনীয় তথ্যের মাধ্যমে দলিল অনুসন্ধান করুন।"
)
SCOPE_NOTE_BN = (
    "এই ফলাফল শুধুমাত্র ভূমিসেতুতে উপলব্ধ ডেটাবেজ রেকর্ডের উপর ভিত্তি করে। "
    "ডেটাবেজে না পাওয়া মানে দলিলটি জাল, অবৈধ বা আইনগতভাবে অস্তিত্বহীন নয়।"
)
SCOPE_NOTE_EN = (
    "This result reflects only records available in the Bhumisetu database. "
    "A missing record does not mean the deed is fake, invalid, or legally nonexistent."
)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def to_iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat()


def parse_iso(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except (TypeError, ValueError):
        return None


def normalize_digits(value: str) -> str:
    return (value or "").translate(BN_DIGIT_MAP)


def collapse_space(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip())


def normalize_text(value: str) -> str:
    return collapse_space(normalize_digits(value))


def normalize_deed_number(value: str) -> str:
    text = normalize_digits(value or "")
    text = re.sub(r"[\s\u00a0]+", "", text)
    return text.upper()


def like_pattern(value: str) -> str:
    cleaned = re.sub(r"[%_\\]", "", normalize_text(value))
    return f"%{cleaned}%"


def _secret() -> str:
    return os.environ.get("BHUMISETU_SEARCH_SECRET") or os.environ.get("DATABASE_URL") or "bhumisetu-local"


def hash_ip(ip: str) -> str:
    raw = f"{_secret()}|{ip or '0.0.0.0'}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def client_ip(request) -> str:
    if request is None:
        return "0.0.0.0"
    headers = getattr(request, "headers", None)
    if headers is not None:
        # Vercel terminates TLS and sets these itself; prefer them over the
        # client-supplied X-Forwarded-For first hop.
        for name in ("x-real-ip", "x-vercel-forwarded-for"):
            value = headers.get(name)
            if value and value.strip():
                return value.split(",")[0].strip()
        forwarded = headers.get("x-forwarded-for")
        if forwarded and forwarded.strip():
            return forwarded.split(",")[-1].strip()
    if request.client is None:
        return "0.0.0.0"
    return request.client.host or "0.0.0.0"


def remaining_seconds(locked_until: Optional[datetime]) -> int:
    if not locked_until:
        return 0
    delta = locked_until - utc_now()
    return max(0, int(delta.total_seconds()))


def format_duration_bn(seconds: int) -> str:
    seconds = max(0, int(seconds))
    hours, rem = divmod(seconds, 3600)
    minutes, secs = divmod(rem, 60)
    parts = []
    if hours:
        parts.append(f"{hours} ঘণ্টা")
    if minutes:
        parts.append(f"{minutes} মিনিট")
    if not parts:
        parts.append(f"{secs} সেকেন্ড")
    return " ".join(parts)


def apply_failure(
    failures: Optional[int],
    locked_until: Optional[datetime],
    now: datetime,
) -> tuple[int, Optional[datetime]]:
    """Pure transition for consecutive invalid deed-number searches.

    An active lock is preserved. An expired lock resets the counter before
    counting the new failure. The 7th failure creates a fresh 5-hour lock.
    """
    if locked_until and locked_until > now:
        return int(failures or FAILED_ATTEMPT_LIMIT), locked_until
    if locked_until:
        failures = 0
    failures = int(failures or 0) + 1
    if failures >= FAILED_ATTEMPT_LIMIT:
        return FAILED_ATTEMPT_LIMIT, now + LOCK_DURATION
    return failures, None


def can_view_parties(role: Optional[str]) -> bool:
    return role in ("officer", "admin", "citizen")


def redact_name(name: Optional[str], role: Optional[str]) -> Optional[str]:
    if not name:
        return None
    if role in ("officer", "admin"):
        return name
    if role == "citizen":
        parts = [p for p in str(name).split() if p]
        return " ".join(f"{p[0]}•••" for p in parts) if parts else None
    return None


_demo_keys: Optional[set[tuple[str, int]]] = None


def _demo_deed_keys() -> set[tuple[str, int]]:
    global _demo_keys
    if _demo_keys is None:
        _demo_keys = {
            (str(deed[0]).upper(), int(deed[1]))
            for deed in getattr(engine, "DEMO_DEEDS", [])
            if len(deed) > 1
        }
    return _demo_keys


def is_demo_record(row: dict) -> bool:
    """Whether a row matches a seeded demonstration deed.

    Real imported records keep this flag False so the UI never presents
    sample data as an official record (or vice versa).
    """
    try:
        key = (str(row.get("deed_no") or "").upper(), int(row.get("reg_year")))
    except (TypeError, ValueError):
        return False
    return key in _demo_deed_keys()


def public_deed_fields(row: dict, role: Optional[str], *, include_parties: bool = True) -> dict:
    """Return only stored fields; never invent missing values."""
    data = {
        "id": row.get("id"),
        "deed_no": row.get("deed_no"),
        "deed_type": row.get("deed_type"),
        "reg_year": row.get("reg_year"),
        "district": row.get("district"),
        "upazila": row.get("upazila"),
        "mouza": row.get("mouza"),
        "plot_id": row.get("plot_id"),
        "khatian_no": row.get("khatian_no"),
        "area": row.get("area"),
        "sub_registry_office": row.get("sub_registry_office"),
        "reg_date": row.get("reg_date"),
        "data_source": "application_database",
        "is_synthetic_demo_record": is_demo_record(row),
    }
    if include_parties and can_view_parties(role):
        data["seller_name"] = redact_name(row.get("seller_name"), role)
        data["buyer_name"] = redact_name(row.get("buyer_name"), role)
        if role in ("officer", "admin"):
            data["price"] = row.get("price")
    return {k: v for k, v in data.items() if v is not None and v != ""}


_schema_ready = False
_schema_lock = threading.Lock()


def _create_protection_schema():
    engine.init()
    with engine.conn() as c:
        c.execute(
            """CREATE TABLE IF NOT EXISTS deed_search_locks(
                id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
                subject_type TEXT NOT NULL,
                subject_key TEXT NOT NULL,
                consecutive_failures INTEGER NOT NULL DEFAULT 0,
                locked_until TEXT,
                last_attempt_at TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(subject_type, subject_key)
            )"""
        )
        c.execute(
            """CREATE TABLE IF NOT EXISTS deed_search_attempts(
                id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
                subject_type TEXT NOT NULL,
                subject_key TEXT NOT NULL,
                deed_query TEXT,
                outcome TEXT NOT NULL,
                ip_hash TEXT,
                user_id INTEGER,
                created_at TEXT NOT NULL
            )"""
        )
        c.execute(
            "CREATE INDEX IF NOT EXISTS idx_deed_locks_subject ON deed_search_locks(subject_type, subject_key)"
        )
        c.execute(
            "CREATE INDEX IF NOT EXISTS idx_deed_locks_until ON deed_search_locks(locked_until)"
        )
        c.execute(
            "CREATE INDEX IF NOT EXISTS idx_deed_attempts_created ON deed_search_attempts(created_at)"
        )
        c.execute(
            "CREATE INDEX IF NOT EXISTS idx_deeds_district ON deeds(district)"
        )
        c.execute(
            "CREATE INDEX IF NOT EXISTS idx_deeds_upazila ON deeds(upazila)"
        )
        c.execute(
            "CREATE INDEX IF NOT EXISTS idx_deeds_mouza ON deeds(mouza)"
        )
        c.execute(
            "CREATE INDEX IF NOT EXISTS idx_deeds_seller ON deeds(seller_name)"
        )
        c.execute(
            "CREATE INDEX IF NOT EXISTS idx_deeds_buyer ON deeds(buyer_name)"
        )
        c.execute(
            "CREATE INDEX IF NOT EXISTS idx_deeds_sro ON deeds(sub_registry_office)"
        )


def ensure_protection_schema():
    global _schema_ready
    if _schema_ready:
        return
    with _schema_lock:
        if _schema_ready:
            return
        _create_protection_schema()
        _schema_ready = True


def _subjects(user_id: Optional[int], session_token: str, ip: str) -> list[tuple[str, str]]:
    subjects = [("session", session_token)]
    if user_id:
        subjects.append(("user", str(user_id)))
    else:
        subjects.append(("ip", hash_ip(ip)))
    return subjects


def _lock_payload(locked_until: datetime, consecutive_failures: int) -> dict:
    remaining = remaining_seconds(locked_until)
    return {
        "locked": True,
        "consecutive_failures": consecutive_failures,
        "failed_attempt_limit": FAILED_ATTEMPT_LIMIT,
        "lock_hours": 5,
        "locked_until": to_iso(locked_until),
        "remaining_seconds": remaining,
        "remaining_label_bn": format_duration_bn(remaining),
        "message_bn": LOCK_MESSAGE_BN,
        "message_en": (
            "You submitted 7 consecutive invalid deed numbers. Deed-number search "
            "is temporarily paused for 5 hours. Please try again later."
        ),
        "scope_note_bn": SCOPE_NOTE_BN,
        "advanced_search_allowed": True,
    }


def _active_lock_row(c, subject_type: str, subject_key: str) -> Optional[dict]:
    row = c.execute(
        """SELECT * FROM deed_search_locks
           WHERE subject_type = %s AND subject_key = %s
           FOR UPDATE""",
        (subject_type, subject_key),
    ).fetchone()
    return dict(row) if row else None


def check_lock(user_id: Optional[int], session_token: str, ip: str) -> Optional[dict]:
    ensure_protection_schema()
    now = utc_now()
    with engine.conn() as c:
        for subject_type, subject_key in _subjects(user_id, session_token, ip):
            row = _active_lock_row(c, subject_type, subject_key)
            if not row:
                continue
            locked_until = parse_iso(row.get("locked_until"))
            if locked_until and locked_until > now:
                return _lock_payload(locked_until, row.get("consecutive_failures") or FAILED_ATTEMPT_LIMIT)
    return None


def _touch_lock_row(c, subject_type: str, subject_key: str) -> dict:
    now = to_iso(utc_now())
    row = _active_lock_row(c, subject_type, subject_key)
    if row:
        return row
    c.execute(
        """INSERT INTO deed_search_locks
           (subject_type, subject_key, consecutive_failures, locked_until, last_attempt_at, created_at, updated_at)
           VALUES (%s, %s, 0, NULL, NULL, %s, %s)
           ON CONFLICT (subject_type, subject_key) DO NOTHING""",
        (subject_type, subject_key, now, now),
    )
    return dict(
        c.execute(
            """SELECT * FROM deed_search_locks
               WHERE subject_type = %s AND subject_key = %s
               FOR UPDATE""",
            (subject_type, subject_key),
        ).fetchone()
    )


def record_failure(user_id: Optional[int], session_token: str, ip: str, deed_query: str) -> dict:
    ensure_protection_schema()
    now_dt = utc_now()
    now = to_iso(now_dt)
    strongest = None
    with engine.conn() as c:
        for subject_type, subject_key in _subjects(user_id, session_token, ip):
            row = _touch_lock_row(c, subject_type, subject_key)
            previous_lock = parse_iso(row.get("locked_until"))
            failures, locked_until = apply_failure(
                row.get("consecutive_failures"), previous_lock, now_dt
            )
            if previous_lock and previous_lock > now_dt:
                payload = _lock_payload(previous_lock, failures)
            else:
                c.execute(
                    """UPDATE deed_search_locks
                       SET consecutive_failures = %s, locked_until = %s, last_attempt_at = %s, updated_at = %s
                       WHERE subject_type = %s AND subject_key = %s""",
                    (
                        failures,
                        to_iso(locked_until) if locked_until else None,
                        now,
                        now,
                        subject_type,
                        subject_key,
                    ),
                )
                payload = {
                    "locked": bool(locked_until),
                    "consecutive_failures": failures,
                    "failed_attempt_limit": FAILED_ATTEMPT_LIMIT,
                    "remaining_attempts": max(0, FAILED_ATTEMPT_LIMIT - failures),
                }
                if locked_until:
                    payload.update(_lock_payload(locked_until, failures))
            c.execute(
                """INSERT INTO deed_search_attempts
                   (subject_type, subject_key, deed_query, outcome, ip_hash, user_id, created_at)
                   VALUES (%s, %s, %s, %s, %s, %s, %s)""",
                (
                    subject_type,
                    subject_key,
                    (deed_query or "")[:MAX_FIELD_LEN],
                    "locked" if payload.get("locked") else "miss",
                    hash_ip(ip),
                    user_id,
                    now,
                ),
            )
            if strongest is None or payload.get("locked") or payload.get("consecutive_failures", 0) >= strongest.get("consecutive_failures", 0):
                strongest = payload
        engine.log_audit(
            "system" if not user_id else f"user:{user_id}",
            "citizen" if not user_id else "user",
            "DEED_NUMBER_MISS",
            "DEED_SEARCH",
            "Invalid deed-number search recorded",
            ip_address=ip,
        )
    return strongest or {"locked": False, "consecutive_failures": 1, "remaining_attempts": FAILED_ATTEMPT_LIMIT - 1}


def record_success(user_id: Optional[int], session_token: str, ip: str, deed_query: str) -> None:
    ensure_protection_schema()
    now = to_iso(utc_now())
    with engine.conn() as c:
        for subject_type, subject_key in _subjects(user_id, session_token, ip):
            _touch_lock_row(c, subject_type, subject_key)
            c.execute(
                """UPDATE deed_search_locks
                   SET consecutive_failures = 0, locked_until = NULL, last_attempt_at = %s, updated_at = %s
                   WHERE subject_type = %s AND subject_key = %s""",
                (now, now, subject_type, subject_key),
            )
            c.execute(
                """INSERT INTO deed_search_attempts
                   (subject_type, subject_key, deed_query, outcome, ip_hash, user_id, created_at)
                   VALUES (%s, %s, %s, %s, %s, %s, %s)""",
                (subject_type, subject_key, (deed_query or "")[:MAX_FIELD_LEN], "hit", hash_ip(ip), user_id, now),
            )


def check_rate_limit(ip: str) -> Optional[dict]:
    ensure_protection_schema()
    since = to_iso(utc_now() - RATE_WINDOW)
    ip_key = hash_ip(ip)
    with engine.conn() as c:
        count_row = c.execute(
            """SELECT COUNT(*) AS n FROM deed_search_attempts
               WHERE ip_hash = %s AND created_at >= %s""",
            (ip_key, since),
        ).fetchone()
        n = int(count_row["n"] if count_row else 0)
    if n >= RATE_MAX_REQUESTS:
        return {
            "locked": True,
            "rate_limited": True,
            "remaining_seconds": int(RATE_WINDOW.total_seconds()),
            "remaining_label_bn": format_duration_bn(int(RATE_WINDOW.total_seconds())),
            "message_bn": "অনুসন্ধানের অনুরোধ সাময়িকভাবে সীমিত করা হয়েছে। অনুগ্রহ করে কিছুক্ষণ পর আবার চেষ্টা করুন।",
            "message_en": "Search requests are temporarily rate-limited. Please try again shortly.",
            "advanced_search_allowed": True,
        }
    return None


def issue_session_token(existing: Optional[str]) -> str:
    token = (existing or "").strip()
    if re.fullmatch(r"[a-f0-9]{32,64}", token):
        return token
    return secrets.token_hex(24)


def cookie_secure() -> bool:
    explicit = os.environ.get("COOKIE_SECURE")
    if explicit not in (None, ""):
        return explicit.strip().lower() in ("1", "true", "yes")
    return (
        os.environ.get("APP_ENV", "").strip().lower() == "production"
        or bool(os.environ.get("VERCEL"))
    )


def set_session_cookie(response, token: str) -> None:
    response.set_cookie(
        key=SESSION_COOKIE,
        value=token,
        max_age=60 * 60 * 24 * 30,
        httponly=True,
        samesite="lax",
        secure=cookie_secure(),
        path="/",
    )


def lookup_by_deed_number(deed_no: str) -> list[dict]:
    ensure_protection_schema()
    needle = normalize_deed_number(deed_no)
    if not needle:
        return []
    raw_number = str(deed_no or "").strip()
    with engine.conn() as c:
        # Preserve the indexed exact lookup, then merge normalized spellings
        # so an exact hit cannot hide another record written with Bengali
        # digits, different case, or spacing.
        exact_rows = c.execute(
            """SELECT * FROM deeds
               WHERE deed_no = %s
               ORDER BY reg_year DESC, id DESC""",
            (raw_number,),
        ).fetchall()
        normalized_rows = c.execute(
            """SELECT * FROM deeds
               WHERE REGEXP_REPLACE(TRANSLATE(UPPER(deed_no), '০১২৩৪৫৬৭৮৯', '0123456789'), '[[:space:]]+', '', 'g') = %s
                 AND deed_no IS DISTINCT FROM %s
               ORDER BY reg_year DESC, id DESC""",
            (needle, raw_number),
        ).fetchall()

        unique_rows = {}
        for row in [*exact_rows, *normalized_rows]:
            record = dict(row)
            row_id = record.get("id")
            unique_rows[row_id if row_id is not None else (
                record.get("deed_no"), record.get("reg_year"), record.get("district"),
                record.get("upazila"), record.get("plot_id"),
            )] = record
        return sorted(
            unique_rows.values(),
            key=lambda row: (row.get("reg_year") or 0, row.get("id") or 0),
            reverse=True,
        )


def search_deeds(filters: dict, page: int = 1, page_size: int = DEFAULT_PAGE_SIZE) -> dict:
    ensure_protection_schema()
    page = max(1, int(page or 1))
    page_size = min(MAX_PAGE_SIZE, max(1, int(page_size or DEFAULT_PAGE_SIZE)))

    clauses = []
    params: list[Any] = []
    diagnostic_conditions: list[tuple[str, str, Any]] = []

    deed_no = normalize_deed_number(filters.get("deed_no") or "")
    if deed_no:
        clause = "REPLACE(UPPER(deed_no), ' ', '') = %s"
        clauses.append(clause)
        params.append(deed_no)
        diagnostic_conditions.append(("deed_no", clause, deed_no))

    year = filters.get("reg_year")
    if year not in (None, "", 0, "0"):
        try:
            year_i = int(normalize_digits(str(year)))
        except (TypeError, ValueError):
            year_i = None
        if year_i:
            clause = "reg_year = %s"
            clauses.append(clause)
            params.append(year_i)
            diagnostic_conditions.append(("reg_year", clause, year_i))

    deed_type = normalize_text(filters.get("deed_type") or "")
    if deed_type:
        catalog_rows = [
            {"code": item[0], "name_bn": item[1], "name_en": item[2]}
            for item in engine.DEED_TYPE_CATALOG
        ]
        deed_type_ref = engine.resolve_deed_type_reference(deed_type, catalog_rows)
        if deed_type_ref:
            deed_type_aliases = [
                engine.normalize_deed_type_value(alias)
                for alias in (
                    deed_type_ref.get("code"),
                    deed_type_ref.get("name_bn"),
                    deed_type_ref.get("name_en"),
                )
                if alias
            ]
            clause = "LOWER(BTRIM(deed_type)) = ANY(%s)"
            deed_type = deed_type_aliases
        else:
            clause = "LOWER(BTRIM(deed_type)) = LOWER(BTRIM(%s))"
        clauses.append(clause)
        params.append(deed_type)
        diagnostic_conditions.append(("deed_type", clause, deed_type))

    exactish = (
        ("district", "district"),
        ("upazila", "upazila"),
        ("sub_registry_office", "sub_registry_office"),
        ("khatian_no", "khatian_no"),
        ("plot_id", "plot_id"),
    )
    for key, column in exactish:
        value = normalize_text(filters.get(key) or "")
        if not value:
            continue
        clause = f"LOWER({column}) LIKE LOWER(%s)"
        pattern = like_pattern(value)
        clauses.append(clause)
        params.append(pattern)
        diagnostic_conditions.append((key, clause, pattern))

    partial = (
        ("seller_name", "seller_name"),
        ("buyer_name", "buyer_name"),
        ("mouza", "mouza"),
    )
    for key, column in partial:
        value = normalize_text(filters.get(key) or "")
        if not value:
            continue
        clause = f"LOWER({column}) LIKE LOWER(%s)"
        pattern = like_pattern(value)
        clauses.append(clause)
        params.append(pattern)
        diagnostic_conditions.append((key, clause, pattern))

    where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
    offset = (page - 1) * page_size
    with engine.conn() as c:
        total = c.execute(f"SELECT COUNT(*) AS n FROM deeds{where}", params).fetchone()["n"]
        rows = c.execute(
            f"""SELECT * FROM deeds{where}
                ORDER BY reg_year DESC, id DESC
                LIMIT %s OFFSET %s""",
            (*params, page_size, offset),
        ).fetchall()
        unmatched_fields = []
        filter_conflict = False
        if int(total or 0) == 0 and diagnostic_conditions:
            checks = [
                f"EXISTS(SELECT 1 FROM deeds WHERE {clause}) AS filter_{key}"
                for key, clause, _ in diagnostic_conditions
            ]
            check_params = [value for _, _, value in diagnostic_conditions]
            diagnostic_row = c.execute(
                "SELECT " + ", ".join(checks), check_params
            ).fetchone() or {}
            unmatched_fields = [
                key for key, _, _ in diagnostic_conditions
                if not diagnostic_row.get(f"filter_{key}", False)
            ]
            filter_conflict = not unmatched_fields

    return {
        "total": int(total),
        "page": page,
        "page_size": page_size,
        "pages": max(1, (int(total) + page_size - 1) // page_size) if total else 1,
        "records": [dict(r) for r in rows],
        "unmatched_fields": unmatched_fields,
        "filter_conflict": filter_conflict,
    }


def get_deed_by_id(deed_id: int) -> Optional[dict]:
    ensure_protection_schema()
    with engine.conn() as c:
        row = c.execute("SELECT * FROM deeds WHERE id = %s", (deed_id,)).fetchone()
        return dict(row) if row else None


def list_locks(limit: int = 50) -> list[dict]:
    ensure_protection_schema()
    limit = min(200, max(1, int(limit or 50)))
    with engine.conn() as c:
        rows = c.execute(
            """SELECT * FROM deed_search_locks
               ORDER BY updated_at DESC
               LIMIT %s""",
            (limit,),
        ).fetchall()
    now = utc_now()
    out = []
    for row in rows:
        item = dict(row)
        until = parse_iso(item.get("locked_until"))
        item["is_active"] = bool(until and until > now)
        item["remaining_seconds"] = remaining_seconds(until) if item["is_active"] else 0
        out.append(item)
    return out


def admin_unlock(subject_type: Optional[str] = None, subject_key: Optional[str] = None, user_id: Optional[int] = None) -> dict:
    ensure_protection_schema()
    now = to_iso(utc_now())
    cleared = 0
    with engine.conn() as c:
        if user_id:
            c.execute(
                """UPDATE deed_search_locks
                   SET consecutive_failures = 0, locked_until = NULL, updated_at = %s
                   WHERE subject_type = 'user' AND subject_key = %s""",
                (now, str(user_id)),
            )
            cleared += c.rowcount or 0
        if subject_type and subject_key:
            c.execute(
                """UPDATE deed_search_locks
                   SET consecutive_failures = 0, locked_until = NULL, updated_at = %s
                   WHERE subject_type = %s AND subject_key = %s""",
                (now, subject_type, subject_key),
            )
            cleared += c.rowcount or 0
    engine.log_audit("admin", "admin", "DEED_SEARCH_UNLOCK", "DEED_SEARCH", f"Cleared {cleared} lock row(s)")
    return {"success": True, "cleared": cleared}


def protection_status(user_id: Optional[int], session_token: str, ip: str) -> dict:
    lock = check_lock(user_id, session_token, ip)
    if lock:
        return lock
    ensure_protection_schema()
    failures = 0
    with engine.conn() as c:
        for subject_type, subject_key in _subjects(user_id, session_token, ip):
            row = c.execute(
                """SELECT consecutive_failures, locked_until FROM deed_search_locks
                   WHERE subject_type = %s AND subject_key = %s""",
                (subject_type, subject_key),
            ).fetchone()
            if row and not parse_iso(row.get("locked_until")):
                failures = max(failures, int(row["consecutive_failures"] or 0))
    return {
        "locked": False,
        "consecutive_failures": failures,
        "remaining_attempts": max(0, FAILED_ATTEMPT_LIMIT - failures),
        "failed_attempt_limit": FAILED_ATTEMPT_LIMIT,
        "advanced_search_allowed": True,
    }
