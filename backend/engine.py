"""LandGuard AI - Unified Digital Land Security Platform Engine
Preserves all legacy functions: conn, init, ml_score, analyze, explain, row, get, save, listing, history, stats, DEMO, seed.
Adds:
- PostgreSQL schema with users, properties, deeds, verifications, mutation applications, status history, due diligence reports, audit logs, notifications.
- Password hashing & RBAC authentication.
- P2: Deed and Ownership Verification engine with discrepancy analysis.
- P4: Smart E-Namjari workflow engine with status timeline and audit tracking.
- P5: Pre-purchase Land Due Diligence rule-based AI risk engine with transparent evidence.
- Full synthetic Bangladesh demo data seeding.
"""

import json
import os
import hashlib
import re
import secrets
import psycopg
import time
import unicodedata

from datetime import datetime, date
from contextlib import contextmanager
from threading import Lock
from typing import Optional, List, Dict, Any
from psycopg.rows import dict_row

try:
    from argon2 import PasswordHasher
    from argon2.exceptions import InvalidHashError, VerificationError
except ImportError:  # requirements install Argon2id; retain PBKDF2 verification for old rows.
    PasswordHasher = None
    InvalidHashError = VerificationError = Exception

try:
    import cpp_bridge
except Exception:
    try:
        from . import cpp_bridge
    except Exception:
        cpp_bridge = None

_schema_initialized = False
_schema_init_lock = Lock()


_pool = None
_pool_lock = Lock()

DEED_TYPE_CATALOG = [
    ("sale", "বিক্রয় / হস্তান্তর দলিল", "Sale / conveyance deed", "https://bdlaws.minlaw.gov.bd/act-print-48.html", 10),
    ("contract_for_sale", "বায়নাপত্র / বিক্রয় চুক্তি", "Contract for sale", "https://bdlaws.minlaw.gov.bd/act-print-48.html", 20),
    ("gift", "দানপত্র", "Gift deed", "https://bdlaws.minlaw.gov.bd/act-print-90.html", 30),
    ("heba", "হেবা / হেবা ঘোষণা", "Heba declaration", "https://bdlaws.minlaw.gov.bd/act-print-90.html", 40),
    ("mortgage", "বন্ধক দলিল", "Mortgage deed", "https://bdlaws.minlaw.gov.bd/act-print-90.html", 50),
    ("partition", "বণ্টননামা", "Partition deed", "https://bdlaws.minlaw.gov.bd/act-print-90.html", 60),
    ("lease", "ইজারা / লিজ দলিল", "Lease deed", "https://bdlaws.minlaw.gov.bd/act-print-90.html", 70),
    ("power_of_attorney", "আমমোক্তারনামা", "Power of attorney", "https://rd.gov.bd/pages/forms", 80),
    ("other", "অন্যান্য", "Other", "https://rd.gov.bd/pages/forms", 90),
]


def normalize_deed_type_value(value):
    """Normalize a deed type code or localized catalog label for exact lookup."""
    return " ".join(unicodedata.normalize("NFKC", str(value or "")).casefold().split())


def resolve_deed_type_reference(value, catalog_rows):
    """Resolve a code or Bengali/English label only when it identifies one active type."""
    normalized = normalize_deed_type_value(value)
    if not normalized:
        return None

    matches = {}
    for row in catalog_rows or []:
        entry = dict(row)
        aliases = (entry.get("code"), entry.get("name_bn"), entry.get("name_en"))
        if any(normalize_deed_type_value(alias) == normalized for alias in aliases if alias):
            matches[str(entry.get("code"))] = entry
    return next(iter(matches.values())) if len(matches) == 1 else None


def _get_pool():
    global _pool
    if _pool is None:
        with _pool_lock:
            if _pool is None:
                database_url = os.environ.get("DATABASE_URL")
                if not database_url:
                    raise RuntimeError(
                        "DATABASE_URL environment variable is not set"
                    )
                try:
                    from psycopg_pool import ConnectionPool
                except ImportError:
                    return None
                _pool = ConnectionPool(
                    database_url,
                    kwargs={"row_factory": dict_row, "connect_timeout": 10},
                    min_size=1,
                    max_size=10,
                    timeout=30,
                    # Serverless PostgreSQL providers may close idle TLS sessions.
                    # Validate pooled connections before handing them to requests
                    # and recycle them before common provider idle/lifetime limits.
                    check=ConnectionPool.check_connection,
                    max_idle=180,
                    max_lifetime=1800,
                    open=False,
                )
                # Let the API process start even when PostgreSQL is temporarily
                # unreachable. Callers apply their own bounded wait when they
                # actually need a database connection.
                _pool.open(wait=False)
    return _pool


def close_pool(timeout: float = 12.0):
    """Close the shared PostgreSQL pool during application shutdown/reload."""
    global _pool
    with _pool_lock:
        pool = _pool
        _pool = None
    if pool is not None:
        # Connection attempts may take up to connect_timeout (10 seconds).
        # Give pool workers time to finish before Uvicorn reloads the process.
        pool.close(timeout=timeout)


@contextmanager
def conn(timeout: float = 30):
    database_url = os.environ.get("DATABASE_URL")

    if not database_url:
        raise RuntimeError(
            "DATABASE_URL environment variable is not set"
        )

    pool = _get_pool()
    if pool is None:
        with psycopg.connect(
            database_url,
            row_factory=dict_row,
            connect_timeout=max(1, int(timeout))
        ) as c:
            yield c
        return

    with pool.connection(timeout=timeout) as c:
        yield c


def ping_database(timeout: float = 1.5) -> bool:
    """Check PostgreSQL readiness with a bounded wait and no schema writes."""
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL environment variable is not set")

    pool = _get_pool()
    if pool is None:
        with psycopg.connect(
            database_url,
            row_factory=dict_row,
            connect_timeout=max(1, int(timeout)),
        ) as connection:
            connection.execute("SELECT 1").fetchone()
        return True

    with pool.connection(timeout=timeout) as connection:
        connection.execute("SELECT 1").fetchone()
    return True

def init():
    global _schema_initialized
    if _schema_initialized:
        return
    with _schema_init_lock:
        if _schema_initialized:
            return
        # Schema initialization runs during startup and on the first API request
        # if startup could not reach PostgreSQL. Keep that attempt bounded so a
        # cold start does not sit behind a long pool wait.
        with conn(timeout=5) as c:

            # 1. Existing records table
            c.execute("""CREATE TABLE IF NOT EXISTS records(
                id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
                deed_no TEXT,
                plot_id TEXT,
                seller TEXT,
                buyer TEXT,
                sale_date TEXT,
                price DOUBLE PRECISION,
                area DOUBLE PRECISION,
                risk_score INTEGER,
                risk_level TEXT,
                flags TEXT,
                explanation TEXT
            )""")

            # 2. Users table (Citizen, Officer, Admin)
            c.execute("""CREATE TABLE IF NOT EXISTS users(
                id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
                name TEXT NOT NULL,
                username TEXT,
                email TEXT UNIQUE NOT NULL,
                phone TEXT,
                role TEXT NOT NULL DEFAULT 'citizen',
                password_hash TEXT NOT NULL,
                salt TEXT NOT NULL,
                nid TEXT,
                designation TEXT,
                created_at TEXT NOT NULL,
                profile_picture TEXT)""")
            # Add a stable login name without replacing any existing account data.
            c.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT")
            c.execute("UPDATE users SET username = 'user_' || id::text WHERE username IS NULL OR BTRIM(username) = ''")
            c.execute("""DO $$ BEGIN
                IF EXISTS (SELECT 1 FROM users GROUP BY LOWER(username) HAVING COUNT(*) > 1) THEN
                    RAISE EXCEPTION 'Username migration stopped: duplicate usernames already exist';
                END IF;
                IF EXISTS (
                    SELECT 1 FROM users
                    WHERE NULLIF(regexp_replace(translate(COALESCE(nid, ''), '০১২৩৪৫৬৭৮৯٠١٢٣٤٥٦٧٨٩', '01234567890123456789'), '[^0-9]', '', 'g'), '') IS NOT NULL
                    GROUP BY regexp_replace(translate(COALESCE(nid, ''), '০১২৩৪৫৬৭৮৯٠١٢٣٤٥٦٧٨٩', '01234567890123456789'), '[^0-9]', '', 'g')
                    HAVING COUNT(*) > 1
                ) THEN
                    RAISE EXCEPTION 'NID migration stopped: duplicate normalized NIDs already exist';
                END IF;
            END $$""")
            c.execute("ALTER TABLE users ALTER COLUMN username SET NOT NULL")
            c.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TEXT")
            c.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_picture TEXT")
            c.execute("""CREATE TABLE IF NOT EXISTS profile_pictures(
                user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                image_data BYTEA NOT NULL,
                updated_at TEXT NOT NULL
            )""")
            c.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower_unique ON users (LOWER(username))")
            c.execute("""CREATE TABLE IF NOT EXISTS login_attempt_lockouts(
                user_id INTEGER PRIMARY KEY,
                failed_attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempt_count >= 0),
                locked_until TIMESTAMPTZ,
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT login_attempt_lockouts_user_fk
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )""")
            c.execute("CREATE INDEX IF NOT EXISTS idx_login_attempt_lockouts_locked_until ON login_attempt_lockouts(locked_until) WHERE locked_until IS NOT NULL")
            c.execute("""CREATE UNIQUE INDEX IF NOT EXISTS idx_users_nid_normalized_unique
                ON users ((regexp_replace(translate(COALESCE(nid, ''), '০১২৩৪৫৬৭৮৯٠١٢٣٤٥٦٧٨٩', '01234567890123456789'), '[^0-9]', '', 'g')))
                WHERE NULLIF(regexp_replace(translate(COALESCE(nid, ''), '০১২৩৪৫৬৭৮৯٠١٢٣٤٥٦٧٨٩', '01234567890123456789'), '[^0-9]', '', 'g'), '') IS NOT NULL""")

            # 3. Properties / Parcels
            c.execute("""CREATE TABLE IF NOT EXISTS properties(
                  id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
                  plot_id TEXT UNIQUE NOT NULL,
                  district TEXT NOT NULL,
                  upazila TEXT NOT NULL,
                  mouza TEXT NOT NULL,
                  jl_no TEXT,
                  khatian_no TEXT NOT NULL,
                  khatian_type TEXT NOT NULL DEFAULT 'BS',
                  area DOUBLE PRECISION NOT NULL,
                  current_owner TEXT NOT NULL,
                  status TEXT NOT NULL DEFAULT 'clear',
                  notes TEXT,
                  created_at TEXT NOT NULL
                   )""")
            # 4. Deeds (Registered demo sub-registry deeds)
            c.execute("""CREATE TABLE IF NOT EXISTS deeds(
                 id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
               deed_no TEXT NOT NULL,
               reg_year INTEGER NOT NULL,
               district TEXT NOT NULL,
               upazila TEXT NOT NULL,
               mouza TEXT NOT NULL,
               plot_id TEXT NOT NULL,
               khatian_no TEXT NOT NULL,
               seller_name TEXT NOT NULL,
               buyer_name TEXT NOT NULL,
               area DOUBLE PRECISION NOT NULL,
               price DOUBLE PRECISION NOT NULL,
               sub_registry_office TEXT NOT NULL,
               reg_date TEXT NOT NULL,
               is_verified INTEGER DEFAULT 1,
               raw_text TEXT,
               created_at TEXT NOT NULL
           )""")
            c.execute("ALTER TABLE deeds ADD COLUMN IF NOT EXISTS division TEXT")
            c.execute("ALTER TABLE deeds ADD COLUMN IF NOT EXISTS division_id BIGINT")
            c.execute("ALTER TABLE deeds ADD COLUMN IF NOT EXISTS union_id BIGINT")
            c.execute("ALTER TABLE deeds ADD COLUMN IF NOT EXISTS union_ward TEXT")
            c.execute("ALTER TABLE deeds ADD COLUMN IF NOT EXISTS deed_type TEXT")

            # 5. Deed Verifications (P2)
         # 5. Deed Verifications (P2)
            c.execute("""CREATE TABLE IF NOT EXISTS deed_types(
                code TEXT PRIMARY KEY,
                name_bn TEXT NOT NULL,
                name_en TEXT NOT NULL,
                official_source TEXT NOT NULL,
                sort_order INTEGER NOT NULL,
                is_active BOOLEAN NOT NULL DEFAULT TRUE
            )""")
            for deed_type in DEED_TYPE_CATALOG:
                c.execute(
                    """INSERT INTO deed_types (code, name_bn, name_en, official_source, sort_order, is_active)
                       VALUES (%s, %s, %s, %s, %s, TRUE)
                       ON CONFLICT (code) DO UPDATE SET name_bn=EXCLUDED.name_bn,
                           name_en=EXCLUDED.name_en, official_source=EXCLUDED.official_source,
                           sort_order=EXCLUDED.sort_order, is_active=TRUE""",
                    deed_type,
                )
            c.execute("""CREATE TABLE IF NOT EXISTS deed_verifications(
        id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        verification_ref TEXT UNIQUE NOT NULL,
        user_id INTEGER,
        deed_no TEXT NOT NULL,
        deed_type TEXT,
        reg_year INTEGER NOT NULL,
        district TEXT NOT NULL,
        upazila TEXT NOT NULL,
        mouza TEXT NOT NULL,
        plot_id TEXT,
        khatian_no TEXT,
        owner_name TEXT,
        buyer_name TEXT,
        seller_name TEXT,
        result_status TEXT NOT NULL,
        match_score INTEGER,
        discrepancies TEXT,
        extracted_data TEXT,
        notes TEXT,
        created_at TEXT NOT NULL
              )""")
            c.execute("ALTER TABLE deed_verifications ADD COLUMN IF NOT EXISTS deed_type TEXT")
            c.execute("ALTER TABLE deed_verifications ADD COLUMN IF NOT EXISTS buyer_name TEXT")
            c.execute("ALTER TABLE deed_verifications ADD COLUMN IF NOT EXISTS seller_name TEXT")
            c.execute("ALTER TABLE deed_verifications ADD COLUMN IF NOT EXISTS division TEXT")
            c.execute("ALTER TABLE deed_verifications ADD COLUMN IF NOT EXISTS division_id BIGINT")
            c.execute("ALTER TABLE deed_verifications ADD COLUMN IF NOT EXISTS union_id BIGINT")
            c.execute("ALTER TABLE deed_verifications ADD COLUMN IF NOT EXISTS union_ward TEXT")
            # 6. Smart E-Namjari Mutation Applications (P4)
          
            c.execute("""CREATE TABLE IF NOT EXISTS mutation_applications(
        id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        tracking_no TEXT UNIQUE NOT NULL,
        user_id INTEGER,
        applicant_name TEXT NOT NULL,
        applicant_nid TEXT NOT NULL,
        applicant_phone TEXT NOT NULL,
        applicant_address TEXT NOT NULL,
        applicant_relation TEXT DEFAULT 'Self',
        district TEXT NOT NULL,
        upazila TEXT NOT NULL,
        mouza TEXT NOT NULL,
        jl_no TEXT,
        khatian_type TEXT NOT NULL,
        khatian_no TEXT NOT NULL,
        plot_no TEXT NOT NULL,
        land_area DOUBLE PRECISION NOT NULL,
        land_class TEXT NOT NULL,
        ownership_source TEXT NOT NULL,
        deed_no TEXT NOT NULL,
        deed_date TEXT NOT NULL,
        supporting_docs TEXT,
        status TEXT NOT NULL DEFAULT 'Draft',
        assigned_officer_id INTEGER REFERENCES users(id) ON DELETE RESTRICT,
        review_notes TEXT,
        rejection_reason TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )""")

           # 7. Mutation Status History (P4 Audit Timeline)
            c.execute("""CREATE TABLE IF NOT EXISTS mutation_status_history(
        id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        application_id INTEGER,
        tracking_no TEXT NOT NULL,
        from_status TEXT,
        to_status TEXT NOT NULL,
        changed_by_name TEXT NOT NULL,
        changed_by_role TEXT NOT NULL,
        changed_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        remarks TEXT,
        created_at TEXT NOT NULL
    )""")

    # 8. Land Due Diligence Reports (P5)
            c.execute("""CREATE TABLE IF NOT EXISTS due_diligence_reports(
        id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        report_ref TEXT UNIQUE NOT NULL,
        user_id INTEGER,
        seller_name TEXT NOT NULL,
        seller_nid TEXT,
        deed_no TEXT,
        reg_year INTEGER,
        district TEXT NOT NULL,
        upazila TEXT NOT NULL,
        mouza TEXT NOT NULL,
        khatian_no TEXT,
        plot_no TEXT NOT NULL,
        recorded_area DOUBLE PRECISION,
        proposed_area DOUBLE PRECISION NOT NULL,
        documents_provided TEXT,
        risk_score INTEGER NOT NULL,
        risk_level TEXT NOT NULL,
        indicators TEXT,
        evidence TEXT,
        recommendations TEXT,
        cpp_graph_analysis TEXT,
        created_at TEXT NOT NULL
    )""")
            if os.environ.get("APP_ENV", "development").lower() != "production":
                c.execute("ALTER TABLE due_diligence_reports ADD COLUMN IF NOT EXISTS cpp_graph_analysis TEXT")

    # 9. Audit Logs
            c.execute("""CREATE TABLE IF NOT EXISTS audit_logs(
        id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        user_name TEXT NOT NULL,
        user_role TEXT NOT NULL,
        action TEXT NOT NULL,
        module TEXT NOT NULL,
        details TEXT,
        ip_address TEXT DEFAULT '127.0.0.1',
        created_at TEXT NOT NULL
    )""")

    # 10. Notifications
            c.execute("""CREATE TABLE IF NOT EXISTS notifications(
        id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        user_id INTEGER,
        user_role TEXT,
        title_bn TEXT NOT NULL,
        title_en TEXT NOT NULL,
        message_bn TEXT NOT NULL,
        message_en TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'info',
        is_read INTEGER DEFAULT 0,
        link TEXT,
        created_at TEXT NOT NULL
    )""")
            # Create indexes for common lookup fields.
            c.execute("CREATE INDEX IF NOT EXISTS idx_records_deed ON records(deed_no)")
            c.execute("CREATE INDEX IF NOT EXISTS idx_records_plot ON records(plot_id)")
            c.execute("CREATE INDEX IF NOT EXISTS idx_deeds_no ON deeds(deed_no)")
            c.execute("CREATE INDEX IF NOT EXISTS idx_deeds_plot ON deeds(plot_id)")
            c.execute("CREATE INDEX IF NOT EXISTS idx_deeds_khatian ON deeds(khatian_no)")
            c.execute("CREATE INDEX IF NOT EXISTS idx_deeds_year ON deeds(reg_year)")
            c.execute("CREATE INDEX IF NOT EXISTS idx_properties_plot ON properties(plot_id)")
            c.execute("CREATE INDEX IF NOT EXISTS idx_properties_khatian ON properties(khatian_no)")
            c.execute("CREATE INDEX IF NOT EXISTS idx_properties_mouza ON properties(mouza)")
            c.execute("CREATE INDEX IF NOT EXISTS idx_mutation_tracking ON mutation_applications(tracking_no)")
            c.execute("CREATE INDEX IF NOT EXISTS idx_mutation_status ON mutation_applications(status)")
            c.execute("CREATE INDEX IF NOT EXISTS idx_mutation_user ON mutation_applications(user_id)")
            c.execute("CREATE INDEX IF NOT EXISTS idx_verif_ref ON deed_verifications(verification_ref)")
            # RECORD_NOT_FOUND results carry no score, so allow NULL for older schemas.
            c.execute("ALTER TABLE deed_verifications ALTER COLUMN match_score DROP NOT NULL")
            c.execute("CREATE INDEX IF NOT EXISTS idx_dd_ref ON due_diligence_reports(report_ref)")
            c.execute("CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at)")
            c.execute("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)")
            c.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_version INTEGER NOT NULL DEFAULT 0")
            c.execute("""CREATE TABLE IF NOT EXISTS auth_sessions(
                session_id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                auth_version INTEGER NOT NULL,
                refresh_token_hash TEXT NOT NULL UNIQUE,
                previous_refresh_token_hash TEXT,
                previous_rotated_at TIMESTAMPTZ,
                expires_at TIMESTAMPTZ NOT NULL,
                revoked_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
            )""")
            c.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_sessions_previous_refresh ON auth_sessions(previous_refresh_token_hash) WHERE previous_refresh_token_hash IS NOT NULL")
            c.execute("CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_expiry ON auth_sessions(user_id, expires_at)")
            c.execute("""CREATE TABLE IF NOT EXISTS password_recovery_attempts(
                scope_type TEXT NOT NULL,
                scope_hash TEXT NOT NULL,
                attempt_count INTEGER NOT NULL DEFAULT 0,
                window_started BIGINT NOT NULL,
                locked_until BIGINT NOT NULL DEFAULT 0,
                PRIMARY KEY(scope_type, scope_hash)
            )""")
            c.execute("""CREATE TABLE IF NOT EXISTS recovery_attempt_lockouts(
                feature_type TEXT NOT NULL CHECK (feature_type IN ('forgot_password', 'forgot_username')),
                identity_hash TEXT NOT NULL,
                failed_attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempt_count >= 0),
                locked_until TIMESTAMPTZ,
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY(feature_type, identity_hash)
            )""")
            c.execute("CREATE INDEX IF NOT EXISTS idx_recovery_attempt_lockouts_until ON recovery_attempt_lockouts(locked_until) WHERE locked_until IS NOT NULL")
            c.execute("""CREATE TABLE IF NOT EXISTS password_recovery_challenges(
                id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                identity_hash TEXT NOT NULL,
                ip_hash TEXT NOT NULL,
                otp_hash TEXT NOT NULL,
                otp_salt TEXT NOT NULL,
                otp_expires_at BIGINT NOT NULL,
                reset_token_hash TEXT,
                reset_expires_at BIGINT,
                verified BOOLEAN NOT NULL DEFAULT FALSE,
                consumed BOOLEAN NOT NULL DEFAULT FALSE,
                created_at BIGINT NOT NULL,
                UNIQUE(identity_hash, ip_hash)
            )""")
            c.execute("CREATE INDEX IF NOT EXISTS idx_password_recovery_challenge_expiry ON password_recovery_challenges(otp_expires_at)")
            c.execute("""CREATE TABLE IF NOT EXISTS password_recovery_sessions(
                reset_token_hash TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                identity_hash TEXT NOT NULL,
                ip_hash TEXT NOT NULL,
                expires_at BIGINT NOT NULL,
                consumed BOOLEAN NOT NULL DEFAULT FALSE,
                created_at BIGINT NOT NULL
            )""")
            c.execute("CREATE INDEX IF NOT EXISTS idx_password_recovery_session_expiry ON password_recovery_sessions(expires_at)")
            c.execute("CREATE INDEX IF NOT EXISTS idx_deeds_district ON deeds(district)")
            c.execute("CREATE INDEX IF NOT EXISTS idx_deeds_upazila ON deeds(upazila)")
            c.execute("CREATE INDEX IF NOT EXISTS idx_deeds_mouza ON deeds(mouza)")
            c.execute("CREATE INDEX IF NOT EXISTS idx_deeds_seller ON deeds(seller_name)")
            c.execute("CREATE INDEX IF NOT EXISTS idx_deeds_buyer ON deeds(buyer_name)")
            c.execute("CREATE INDEX IF NOT EXISTS idx_deeds_sro ON deeds(sub_registry_office)")
            c.execute("""CREATE TABLE IF NOT EXISTS deed_search_locks(
                id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
                subject_type TEXT NOT NULL,
                subject_key TEXT NOT NULL,
                consecutive_failures INTEGER NOT NULL DEFAULT 0,
                locked_until TEXT,
                last_attempt_at TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(subject_type, subject_key)
            )""")
            c.execute("""CREATE TABLE IF NOT EXISTS deed_search_attempts(
                id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
                subject_type TEXT NOT NULL,
                subject_key TEXT NOT NULL,
                deed_query TEXT,
                outcome TEXT NOT NULL,
                ip_hash TEXT,
                user_id INTEGER,
                created_at TEXT NOT NULL
            )""")
            c.execute("CREATE INDEX IF NOT EXISTS idx_deed_locks_subject ON deed_search_locks(subject_type, subject_key)")
            c.execute("CREATE INDEX IF NOT EXISTS idx_deed_locks_until ON deed_search_locks(locked_until)")
            c.execute("CREATE INDEX IF NOT EXISTS idx_deed_attempts_created ON deed_search_attempts(created_at)")


        _schema_initialized = True



def binary_search_land_records(query: str, category: str = "all", limit: int = 25, mutation_owner_id: Optional[int] = None):
    """
    Search land records using PostgreSQL queries and available indexes.
    Actual performance depends on data size, indexes, query patterns, and database resources.
    """
    init()
    start_time = time.perf_counter()
    q = query.strip()
    if not q:
        return {"results": [], "time_ms": 0.0, "count": 0, "algorithm": "PostgreSQL indexed search"}

    results = []
    with conn() as c:
        # 1. Properties / Parcels
        if category in ["all", "plot", "khatian"]:
            props = c.execute(
                "SELECT * FROM properties WHERE plot_id LIKE %s OR khatian_no LIKE %s OR mouza LIKE %s LIMIT %s",
                (f"{q}%", f"{q}%", f"%{q}%", limit)
            ).fetchall()
            for p in props:
                d = dict(p)
                d["_match_type"] = "property"
                d["_title"] = f"প্লট: {d['plot_id']} (খতিয়ান: {d['khatian_no']})"
                d["_subtitle"] = f"{d['mouza']}, {d['district']} | মালিক: {d['current_owner']}"
                results.append(d)

        # 2. Deeds
        if category in ["all", "deed"]:
            deeds = c.execute(
                "SELECT * FROM deeds WHERE COALESCE(is_verified,1)<>0 AND (deed_no LIKE %s OR plot_id LIKE %s) LIMIT %s",
                (f"{q}%", f"{q}%", limit)
            ).fetchall()
            for de in deeds:
                d = dict(de)
                d["_match_type"] = "deed"
                d["_title"] = f"দলিল নম্বর: {d['deed_no']} ({d['reg_year']})"
                d["_subtitle"] = f"প্লট: {d['plot_id']} | বিক্রেতা: {d['seller_name']} -> ক্রেতা: {d['buyer_name']}"
                results.append(d)

        # 3. Mutation Applications
        if category in ["all", "tracking"] and mutation_owner_id is not None:
            muts = c.execute(
                """SELECT id,tracking_no,user_id,applicant_name,district,upazila,mouza,plot_no,khatian_no,
                          status,created_at,updated_at
                   FROM mutation_applications
                   WHERE user_id=%s AND tracking_no ILIKE %s
                   ORDER BY id DESC LIMIT %s""",
                (int(mutation_owner_id), f"{q}%", limit)
            ).fetchall()
            for m in muts:
                d = dict(m)
                d["_match_type"] = "mutation"
                d["_title"] = f"নামজারি: {d['tracking_no']}"
                d["_subtitle"] = f"আবেদনকারী: {d['applicant_name']} | স্ট্যাটাস: {d['status']}"
                results.append(d)

    elapsed_ms = round((time.perf_counter() - start_time) * 1000, 3)
    return {
        "query": q,
        "results": results[:limit],
        "count": len(results[:limit]),
        "time_ms": elapsed_ms,
        "algorithm": "PostgreSQL indexed search (C++ fuzzy matching where available)",
        "cpp_accelerated": cpp_bridge.is_cpp_available() if cpp_bridge else False,
        "scale_capacity": "Performance depends on database size, indexes, query patterns, and Neon compute resources"
    }


# =====================================================================
# AUTHENTICATION & PASSWORD HASHING
# =====================================================================

_password_hasher = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=2, hash_len=32, salt_len=16) if PasswordHasher else None
_LEGACY_PBKDF2_ITERATIONS = 100000


def hash_password(password: str, salt: str = None) -> tuple[str, str]:
    """Create Argon2id hashes; an explicit salt keeps the legacy PBKDF2 helper compatible."""
    if salt is not None:
        digest = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), salt.encode("utf-8"), _LEGACY_PBKDF2_ITERATIONS
        ).hex()
        return digest, salt
    if _password_hasher is None:
        raise RuntimeError("argon2-cffi is required to create password hashes")
    return _password_hasher.hash(password), ""


def verify_password(password: str, pw_hash: str, salt: str) -> bool:
    if (pw_hash or "").startswith("$argon2id$"):
        if _password_hasher is None:
            raise RuntimeError("argon2-cffi is required to verify this password hash")
        try:
            return bool(_password_hasher.verify(pw_hash, password))
        except (InvalidHashError, VerificationError):
            return False
    if not salt:
        return False
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("utf-8"), _LEGACY_PBKDF2_ITERATIONS
    ).hex()
    return secrets.compare_digest(pw_hash or "", digest)


def password_needs_rehash(pw_hash: str) -> bool:
    if not (pw_hash or "").startswith("$argon2id$"):
        return True
    if _password_hasher is None:
        raise RuntimeError("argon2-cffi is required to verify this password hash")
    return _password_hasher.check_needs_rehash(pw_hash)


def create_user(name: str, email: str, password: str, role: str = "citizen", phone: str = "", nid: str = "", designation: str = "", username: str = None):
    init()
    if username is None:
        local_part = email.lower().strip().split("@", 1)[0]
        username = re.sub(r"[^A-Za-z0-9_.]", "", local_part)[:30].strip("._")
        if len(username) < 4:
            username = "user_" + secrets.token_hex(5)
    pw_hash, salt = hash_password(password)
    now = datetime.now().isoformat()
    with conn() as c:
        cur = c.execute(
            """INSERT INTO users (name, username, email, phone, role, password_hash, salt, nid, designation, created_at, updated_at)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
               RETURNING id""",
            (name, username.strip(), email.lower().strip(), phone, role, pw_hash, salt, nid, designation, now, now)
        )
        uid = cur.fetchone()["id"]
    log_audit(name, role, "USER_REGISTER", "AUTH", f"User registered: {email}")
    return get_user_by_id(uid)


def authenticate_user(identifier: str, password: str):
    init()
    ident = identifier.strip().lower()
    with conn() as c:
        u = c.execute(
            "SELECT * FROM users WHERE LOWER(BTRIM(email)) = %s OR LOWER(username) = %s LIMIT 1",
            (ident, ident),
        ).fetchone()
        if not u:
            return None
        if verify_password(password, u["password_hash"], u["salt"]):
            user_dict = dict(u)
            if password_needs_rehash(u["password_hash"]):
                new_hash, new_salt = hash_password(password)
                c.execute(
                    "UPDATE users SET password_hash=%s,salt=%s,updated_at=%s WHERE id=%s",
                    (new_hash, new_salt, datetime.now().isoformat(), u["id"]),
                )
                user_dict["password_hash"] = new_hash
                user_dict["salt"] = new_salt
            del user_dict["password_hash"]
            del user_dict["salt"]
            log_audit(u["name"], u["role"], "USER_LOGIN", "AUTH", f"Successful login for {u['email']}")
            return user_dict
        return None


# =====================================================================
def get_user_by_id(uid: int):
    init()
    with conn() as c:
        u = c.execute(
            """SELECT id,name,username,email,phone,role,designation,created_at,updated_at,
                      profile_picture,auth_version,
                      CASE WHEN COALESCE(nid,'')='' THEN NULL ELSE '••••••••' || RIGHT(nid,4) END AS nid_masked
               FROM users WHERE id = %s""",
            (uid,),
        ).fetchone()
        if not u:
            return None
        d = dict(u)
        return d


def get_user_by_auth_session(session_id: str):
    """Return a current profile only while its server-side auth session is active."""
    init()
    with conn() as c:
        user = c.execute(
            """SELECT u.id,u.name,u.username,u.email,u.phone,u.role,u.designation,
                      u.created_at,u.updated_at,u.profile_picture,u.auth_version,
                      CASE WHEN COALESCE(u.nid,'')='' THEN NULL ELSE '••••••••' || RIGHT(u.nid,4) END AS nid_masked
               FROM auth_sessions s
               JOIN users u ON u.id=s.user_id
               WHERE s.session_id=%s AND s.revoked_at IS NULL
                 AND s.expires_at > CURRENT_TIMESTAMP
                 AND s.auth_version=u.auth_version""",
            (session_id,),
        ).fetchone()
        return dict(user) if user else None


def _mask_nid_value(value):
    text = str(value or "")
    return ("••••••••" + text[-4:]) if text else None


def get_all_users():
    init()
    with conn() as c:
        rows = c.execute(
            """SELECT id,name,username,email,phone,role,designation,created_at,profile_picture,
                      CASE WHEN COALESCE(nid,'')='' THEN NULL ELSE '••••••••' || RIGHT(nid,4) END AS nid_masked
               FROM users ORDER BY id ASC"""
        ).fetchall()
        return [dict(r) for r in rows]


# =====================================================================
# AUDIT LOGGING & NOTIFICATIONS
# =====================================================================

def log_audit(user_name: str, user_role: str, action: str, module: str, details: str = "", ip_address: str = "127.0.0.1"):
    try:
        init()
        with conn() as c:
            c.execute(
                """INSERT INTO audit_logs (user_name, user_role, action, module, details, ip_address, created_at)
                   VALUES (%s, %s, %s, %s, %s, %s, %s)""",
                (user_name, user_role, action, module, details, ip_address, datetime.now().isoformat())
            )
    except Exception:
        pass


def get_audit_logs(limit: int = 50):
    init()
    with conn() as c:
        rows = c.execute("SELECT * FROM audit_logs ORDER BY id DESC LIMIT %s", (limit,)).fetchall()
        return [dict(r) for r in rows]


def add_notification(user_id, user_role, title_bn, title_en, msg_bn, msg_en, ntype="info", link=""):
    try:
        init()
        with conn() as c:
            c.execute(
                """INSERT INTO notifications (user_id, user_role, title_bn, title_en, message_bn, message_en, type, is_read, link, created_at)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, 0, %s, %s)""",
                (user_id, user_role, title_bn, title_en, msg_bn, msg_en, ntype, link, datetime.now().isoformat())
            )
    except Exception:
        pass


def get_notifications(user_id=None, role=None, limit=30):
    init()
    with conn() as c:
        if user_id:
            rows = c.execute(
                "SELECT * FROM notifications WHERE user_id = %s OR user_role = %s OR user_role = 'all' ORDER BY id DESC LIMIT %s",
                (user_id, role or "citizen", limit)
            ).fetchall()
        else:
            rows = c.execute("SELECT * FROM notifications ORDER BY id DESC LIMIT %s", (limit,)).fetchall()
        return [dict(r) for r in rows]


def mark_notification_read(nid: int):
    init()
    with conn() as c:
        c.execute("UPDATE notifications SET is_read = 1 WHERE id = %s", (nid,))
        return {"success": True}


# =====================================================================
# P2: DIGITAL DEED & OWNERSHIP VERIFICATION ENGINE
# =====================================================================

def _normalize_deed_lookup_number(value):
    """Normalize deed-number spelling consistently with the deed search API."""
    text = str(value or "").translate(str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789"))
    return "".join(text.split()).upper()


def _select_deed_candidate(candidates, input_data=None, requested_year=None):
    """Select only a unique deed, optionally narrowed by an exact registration year."""
    rows = list(candidates or [])
    if requested_year:
        exact_year_rows = [
            row for row in rows
            if int(row.get("reg_year") or 0) == int(requested_year)
        ]
        if exact_year_rows:
            rows = exact_year_rows
    if not rows:
        return None, False
    if len(rows) == 1:
        return rows[0], False
    # Supporting fields must not silently pick among two deeds. The user must
    # select the candidate explicitly on the existing Find Deed screen.
    return None, True


def _classify_mouza_check(input_mode, provided, recorded, same_parent, identifier_match):
    """Compare Mouza names independently from whether the name is in the official catalog."""
    if input_mode == "catalog":
        if identifier_match is None:
            return "UNAVAILABLE"
        return "MATCHED" if identifier_match else "MISMATCH"
    if not provided or not recorded:
        return "UNAVAILABLE"
    normalize = lambda value: " ".join(
        unicodedata.normalize("NFC", unicodedata.normalize("NFKC", str(value or "")))
        .casefold()
        .split()
    )
    normalized_provided = normalize(provided)
    normalized_recorded = normalize(recorded)
    if not normalized_provided or not normalized_recorded:
        return "UNAVAILABLE"
    if normalized_provided == normalized_recorded:
        return "MATCHED"
    similarity = cpp_bridge.fuzzy_match(normalized_provided, normalized_recorded) if cpp_bridge else 0.0
    return "PARTIAL_MATCH" if similarity >= 80 else "MISMATCH"


def verify_deed(input_data: dict, user_id=None, user_name="Citizen"):
    init()
    deed_no = str(input_data.get("deed_no", "")).strip()
    deed_type = str(input_data.get("deed_type", "")).strip()
    reg_year = int(input_data.get("reg_year", 0) or 0)
    division = str(input_data.get("division", "")).strip()
    division_id = input_data.get("division_id")
    district = str(input_data.get("district", "")).strip()
    upazila = str(input_data.get("upazila", "")).strip()
    mouza = str(input_data.get("mouza", "")).strip()
    mouza_input_mode = input_data.get("mouza_input_mode") or (
        "catalog" if input_data.get("mouza_id") is not None else "manual"
    )
    mouza_source = "official_catalog" if mouza_input_mode == "catalog" else "manual_unverified"
    plot_id = str(input_data.get("plot_id", "")).strip()
    khatian_no = str(input_data.get("khatian_no", "")).strip()
    buyer_name = str(input_data.get("buyer_name") or input_data.get("owner_name", "")).strip()
    owner_name = buyer_name
    seller_name = str(input_data.get("seller_name", "")).strip()
    union_ward = str(input_data.get("union_ward", "")).strip()
    union_id = input_data.get("union_id")
    notes = str(input_data.get("notes", "")).strip()
    selected_deed_id = input_data.get("selected_deed_id")
    submitted_location_ref = {}
    recorded_location_ref = {}
    submitted_union_ref = None
    recorded_union_ref = None

    with conn() as c:
        deed_record = None
        deed_lookup_ambiguous = False
        deed_candidates = []
        invalid_selected_deed = False
        query = """SELECT d.*,
                          COALESCE(NULLIF(BTRIM(d.division), ''), v.name_bn, v.name_en) AS resolved_division,
                          COALESCE(NULLIF(BTRIM(d.union_ward), ''), u.name_bn, u.name_en) AS resolved_union
                   FROM deeds AS d
                   LEFT JOIN divisions AS v ON v.id=d.division_id
                   LEFT JOIN admin_unions AS u ON u.id=d.union_id"""
        if selected_deed_id:
            selected = c.execute(query + " WHERE d.id = %s AND COALESCE(d.is_verified,1)<>0", (selected_deed_id,)).fetchone()
            if selected and _normalize_deed_lookup_number(selected.get("deed_no")) == _normalize_deed_lookup_number(deed_no):
                deed_record = selected
            else:
                invalid_selected_deed = True
        if deed_no:
            if not deed_record and not selected_deed_id:
                # Use the existing raw deed_no btree for the common exact case.
                exact_candidates = c.execute(
                    query + " WHERE d.deed_no = %s AND COALESCE(d.is_verified,1)<>0 ORDER BY d.reg_year DESC, d.id DESC LIMIT 51",
                    (deed_no,),
                ).fetchall()
                normalized_no = _normalize_deed_lookup_number(deed_no)
                normalized_candidates = []
                if len(exact_candidates) < 51:
                    normalized_candidates = c.execute(
                        query + " WHERE REGEXP_REPLACE(TRANSLATE(UPPER(d.deed_no), '০১২৩৪৫৬৭৮৯', '0123456789'), '[[:space:]]+', '', 'g') = %s AND d.deed_no IS DISTINCT FROM %s AND COALESCE(d.is_verified,1)<>0 ORDER BY d.reg_year DESC, d.id DESC LIMIT 51",
                        (normalized_no, deed_no),
                    ).fetchall()
                unique_candidates = {}
                for candidate in [*exact_candidates, *normalized_candidates]:
                    unique_candidates[candidate["id"]] = candidate
                deed_candidates = sorted(
                    unique_candidates.values(),
                    key=lambda candidate: (candidate.get("reg_year") or 0, candidate.get("id") or 0),
                    reverse=True,
                )[:51]
                deed_record, deed_lookup_ambiguous = _select_deed_candidate(
                    deed_candidates, input_data, reg_year
                )

        if invalid_selected_deed:
            return {
                "lookup_status": "INVALID_INPUT",
                "result_status": "POTENTIAL_INCONSISTENCY",
                "record_found": False,
                "message_bn": "নির্বাচিত দলিলটি আর এই দলিল নম্বরের সঙ্গে মেলে না। আবার দলিল খুঁজুন।",
                "message_en": "The selected deed no longer matches this deed number. Search for the deed again.",
                "data_source": "application_database",
            }
        if deed_lookup_ambiguous:
            return {
                "lookup_status": "AMBIGUOUS",
                "result_status": "POTENTIAL_INCONSISTENCY",
                "overall_category": "INSUFFICIENT_DATA",
                "record_found": False,
                "candidate_count": len(deed_candidates),
                "message_bn": "এই দলিল নম্বরে একাধিক রেকর্ড আছে। যাচাইয়ের আগে সঠিক দলিলটি বেছে নিন।",
                "message_en": "Multiple records share this deed number. Select the correct deed before verification.",
                "data_source": "application_database",
            }
        if not deed_record:
            return {
                "lookup_status": "DEED_NOT_FOUND",
                "result_status": "RECORD_NOT_FOUND",
                "overall_category": "RECORD_NOT_FOUND",
                "record_found": False,
                "verification_ref": None,
                "match_score": None,
                "field_checks": [],
                "fields": [],
                "message_bn": "আপনার দেওয়া দলিল নম্বরটি আমাদের ডেটাবেজে পাওয়া যায়নি। অনুগ্রহ করে সঠিক দলিল নম্বর দিন অথবা আপনার দলিল খুঁজে দেখুন।",
                "message_en": "Your submitted deed number was not found in our database. Please check the number or find your deed.",
                "data_source": "application_database",
                "is_official_registry": False,
            }

        deed_type_catalog_rows = [dict(row) for row in c.execute(
            """SELECT code, name_bn, name_en
               FROM deed_types WHERE is_active=TRUE ORDER BY sort_order, code"""
        ).fetchall()]
        submitted_deed_type_ref = resolve_deed_type_reference(deed_type, deed_type_catalog_rows)
        recorded_deed_type_value = deed_record.get("deed_type")
        recorded_deed_type_ref = resolve_deed_type_reference(recorded_deed_type_value, deed_type_catalog_rows)

        prop_record = None
        if deed_record and deed_record.get("plot_id"):
            prop_record = c.execute(
                """SELECT * FROM properties
                   WHERE LOWER(BTRIM(plot_id)) = LOWER(BTRIM(%s))
                     AND LOWER(BTRIM(district)) = LOWER(BTRIM(%s))
                     AND LOWER(BTRIM(upazila)) = LOWER(BTRIM(%s))
                     AND LOWER(BTRIM(mouza)) = LOWER(BTRIM(%s))
                     AND LOWER(BTRIM(khatian_no)) = LOWER(BTRIM(%s))
                   LIMIT 1""",
                (deed_record["plot_id"], deed_record["district"], deed_record["upazila"], deed_record["mouza"], deed_record["khatian_no"]),
            ).fetchone()

        history_scope = {
            "district": deed_record.get("district"),
            "upazila": deed_record.get("upazila"),
            "mouza": deed_record.get("mouza"),
            "plot_id": deed_record.get("plot_id"),
        }
        history_rows = []
        history_truncated = False
        if all(history_scope.values()):
            rows = c.execute(
                """SELECT id, deed_no, deed_type, reg_year, reg_date,
                          seller_name, buyer_name, division, division_id,
                          district, upazila, mouza, plot_id, khatian_no
                   FROM deeds
                   WHERE LOWER(BTRIM(district)) = LOWER(BTRIM(%s))
                     AND LOWER(BTRIM(upazila)) = LOWER(BTRIM(%s))
                     AND LOWER(BTRIM(mouza)) = LOWER(BTRIM(%s))
                     AND LOWER(BTRIM(plot_id)) = LOWER(BTRIM(%s))
                     AND COALESCE(is_verified,1)<>0
                   ORDER BY reg_year ASC, reg_date ASC, id ASC
                   LIMIT 101""",
                (history_scope["district"], history_scope["upazila"],
                 history_scope["mouza"], history_scope["plot_id"]),
            ).fetchall()
            history_truncated = len(rows) > 100
            history_rows = [dict(row) for row in rows[:100]]

        # Resolve bilingual legacy deed/property labels only when the exact
        # catalog label is unique within its verified parent hierarchy.
        try:
            import location_service
        except ImportError:
            from . import location_service
        submitted_location_ref = location_service.resolve_location_reference(c, input_data)
        source_location_record = deed_record or prop_record or {}
        recorded_location_ref = location_service.resolve_location_reference(c, source_location_record)
        submitted_union_ref = location_service.resolve_union_reference(
            c, submitted_location_ref.get("location_id"), union_ward, union_id
        )
        recorded_union_ref = location_service.resolve_union_reference(
            c, recorded_location_ref.get("location_id"),
            (deed_record.get("resolved_union") or deed_record.get("union_ward")) if deed_record else None,
            deed_record.get("union_id") if deed_record else None,
        )

    discrepancies = []
    if deed_lookup_ambiguous:
        discrepancies.append({
            "field": "দলিল নম্বর",
            "field_en": "Deed Number",
            "severity": "medium",
            "code": "AMBIGUOUS_DEED_NUMBER",
            "message_bn": "এই দলিল নম্বরে একাধিক রেকর্ড আছে; দেওয়া জমির শনাক্তকারী দিয়ে একটিকে নিশ্চিত করা যায়নি।",
            "message_en": "Multiple records share this deed number; the submitted land identifiers did not uniquely identify one.",
            "source": "Application deeds database",
        })

    def add_score(field, similarity, expected=None, provided=None):
        similarity = max(0.0, min(100.0, float(similarity)))

        if similarity < 100:
            discrepancies.append({
                "field": field,
                "expected": expected,
                "provided": provided,
                "similarity_score": round(similarity, 2),
                "severity": "high" if similarity < 60 else "medium",
                "message_bn": f"{field}: প্রদত্ত তথ্যের সঙ্গে রেকর্ডের অমিল পাওয়া গেছে।",
                "source": "ভূমি রেকর্ড যাচাই"
            })

    def text_similarity(provided, expected):
        if not provided or not expected:
            return None
        if str(provided).strip().lower() == str(expected).strip().lower():
            return 100.0
        return cpp_bridge.fuzzy_match(str(provided), str(expected)) if cpp_bridge else 0.0

    def number_similarity(provided, expected):
        if provided is None or expected is None:
            return None
        try:
            p = float(provided)
            e = float(expected)
            if p == e:
                return 100.0
            if max(abs(p), abs(e)) == 0:
                return 100.0
            return max(0.0, 100 - abs(p - e) / max(abs(p), abs(e)) * 100)
        except (ValueError, TypeError):
            return 0.0

    submitted_summary = {
        "deed_no": deed_no or None,
        "deed_type": deed_type or None,
        "deed_type_names": ({
            "bn": submitted_deed_type_ref.get("name_bn"),
            "en": submitted_deed_type_ref.get("name_en"),
            "code": submitted_deed_type_ref.get("code"),
        } if submitted_deed_type_ref else None),
        "reg_year": reg_year or None,
        "division": division or None,
        "division_id": division_id,
        "district": district or None,
        "district_id": input_data.get("district_id"),
        "upazila": upazila or None,
        "location_id": input_data.get("location_id"),
        "location_type": input_data.get("location_type"),
        "mouza": mouza or None,
        "mouza_id": input_data.get("mouza_id"),
        "mouza_input_mode": mouza_input_mode,
        "mouza_source": mouza_source,
        "union_ward": union_ward or None,
        "union_id": union_id,
        "plot_id": plot_id or None,
        "khatian_no": khatian_no or None,
        "owner_name": owner_name or None,
        "buyer_name": buyer_name or None,
        "seller_name": seller_name or None,
    }

    field_checks = []

    def normalize_comparison(value):
        return " ".join(unicodedata.normalize("NFKC", str(value or "")).casefold().split())

    def add_basic_check(
        key, field, field_en, provided, recorded, source_en, source_bn=None,
        required=True, optional=False, reference_only=False, fuzzy=False,
        identifier_match=None, unresolved_location=False,
        submitted_location_id=None, recorded_location_id=None,
        submitted_location_names=None, recorded_location_names=None,
        unresolved_comparison=False, submitted_names=None, recorded_names=None,
        manual_location_input=False, input_source=None, forced_status=None,
    ):
        if forced_status:
            status_value = forced_status
            similarity = None
        elif not provided and optional:
            status_value = "NOT_PROVIDED"
            similarity = None
        elif reference_only:
            status_value = "AVAILABLE" if recorded not in (None, "") else "UNAVAILABLE"
            similarity = None
        elif unresolved_location:
            status_value = "UNAVAILABLE"
            similarity = None
        elif manual_location_input:
            exact_manual_text = bool(provided and recorded) and normalize_comparison(provided) == normalize_comparison(recorded)
            status_value = "PARTIAL_MATCH" if exact_manual_text else "UNAVAILABLE"
            similarity = None
        elif unresolved_comparison:
            status_value = "UNAVAILABLE"
            similarity = None
        elif identifier_match is not None:
            status_value = "MATCHED" if identifier_match else "MISMATCH"
            similarity = None
        elif recorded in (None, ""):
            status_value = "UNAVAILABLE"
            similarity = None
        elif not provided:
            status_value = "NOT_PROVIDED"
            similarity = None
        else:
            exact_match = normalize_comparison(provided) == normalize_comparison(recorded)
            if exact_match:
                similarity = 100.0 if fuzzy else None
                status_value = "MATCHED"
            elif fuzzy:
                similarity = text_similarity(provided, recorded)
                if similarity is None:
                    status_value = "NOT_PROVIDED"
                elif similarity >= 80:
                    # Fuzzy similarity is a review signal; only normalized
                    # exact equality can produce MATCHED for names.
                    status_value = "PARTIAL_MATCH"
                else:
                    status_value = "MISMATCH"
            else:
                similarity = None
                status_value = "MISMATCH"

        messages = {
            "MATCHED": ("ডেটাবেজ রেকর্ডের সঙ্গে মিলেছে।", "Matched the application database record."),
            "PARTIAL_MATCH": ("আংশিক মিল; মূল নথির সঙ্গে হাতে যাচাই করুন।", "Partial similarity; review against the original record."),
            "MISMATCH": ("প্রদত্ত তথ্য ডেটাবেজ রেকর্ডের সঙ্গে মেলেনি।", "The submitted value differs from the application database record."),
            "UNAVAILABLE": ("ডেটাবেজে এই তথ্য পাওয়া যায়নি।", "No database value is available for this field."),
            "NOT_PROVIDED": ("ঐচ্ছিক তথ্য দেওয়া হয়নি।", "Optional information was not provided."),
            "AVAILABLE": ("রেকর্ডে তথ্য আছে; জমাদেয়া নামের সঙ্গে তুলনা করা হয়নি।", "A record value is available; it was not compared with a submitted name."),
        }
        message_bn, message_en = messages[status_value]
        if unresolved_location:
            message_bn = "নামটি নির্দিষ্ট সরকারি অবস্থান ID-তে নিশ্চিতভাবে মেলেনি; তাই ফল অনুপলব্ধ।"
            message_en = "The name could not be linked confidently to one location ID; comparison is unavailable."
        if unresolved_comparison:
            message_bn = "দলিলের ধরনটি সক্রিয় তালিকার সঙ্গে নিশ্চিতভাবে মেলেনি; তাই তুলনা করা যায়নি।"
            message_en = "The deed type could not be resolved uniquely in the active catalog; comparison is unavailable."
        if manual_location_input:
            if status_value == "MATCHED":
                message_bn = "নাম মিলেছে, তবে সরকারি মৌজা তালিকায় যাচাই হয়নি।"
                message_en = "Name matches, but it has not been verified against the official Mouza list."
            elif status_value == "PARTIAL_MATCH":
                message_bn = "নামটি আংশিক মিলেছে; সরকারি মৌজা তালিকায় যাচাই হয়নি। মূল দলিলের সঙ্গে মিলিয়ে দেখুন।"
                message_en = "The name partially matches; it has not been verified against the official Mouza list. Review the original deed."
            elif status_value == "MISMATCH":
                message_bn = "মৌজার নাম ডেটাবেজের নামের সঙ্গে মেলেনি; সরকারি তালিকায়ও যাচাই হয়নি।"
                message_en = "The Mouza name does not match the database value and has not been verified against the official list."
            else:
                message_bn = "হাতে দেওয়া মৌজার নাম সরকারি তালিকায় যাচাই হয়নি; এই রেকর্ডের সঙ্গে নির্ভরযোগ্য তুলনা করা যায়নি।"
                message_en = "The manually entered Mouza is not verified in the official catalog; a reliable comparison is unavailable."
        if key == "seller_name" and status_value == "UNAVAILABLE":
            message_bn = "বিক্রেতার রেকর্ড পাওয়া যায়নি।"
            message_en = "Seller Record Unavailable."
        check = {
            "key": key,
            "field": field,
            "field_en": field_en,
            "required": required,
            "optional": optional,
            "submitted": provided or None,
            "recorded": recorded or None,
            "status": status_value,
            "similarity_score": round(float(similarity), 2) if similarity is not None else None,
            "source": source_en,
            "source_bn": source_bn or source_en,
            "source_en": source_en,
            "evidence_ref": (
                f"deeds:{deed_record.get('id')}"
                if "deeds" in source_en and deed_record and deed_record.get("id") is not None
                else f"properties:{prop_record.get('id')}"
                if "properties" in source_en and prop_record and prop_record.get("id") is not None
                else None
            ),
            "message_bn": message_bn,
            "message_en": message_en,
            "explanation_bn": message_bn,
            "explanation_en": message_en,
        }
        if submitted_location_id is not None or recorded_location_id is not None:
            check["submitted_location_id"] = submitted_location_id
            check["recorded_location_id"] = recorded_location_id
        if submitted_location_names:
            check["submitted_location_names"] = submitted_location_names
        if recorded_location_names:
            check["recorded_location_names"] = recorded_location_names
        if submitted_names:
            check["submitted_names"] = submitted_names
        if recorded_names:
            check["recorded_names"] = recorded_names
        if input_source:
            check["input_source"] = input_source
        if key == "mouza":
            if input_source == "official_catalog" and submitted_location_id is not None:
                check["official_verification_status"] = "VERIFIED"
            elif input_source == "manual_unverified" and provided:
                check["official_verification_status"] = "NOT_VERIFIED"
            else:
                check["official_verification_status"] = "UNAVAILABLE"
        field_checks.append(check)
        return status_value

    def location_name_pair(reference, key):
        row = reference.get(key) if reference else None
        if not row:
            return None
        return {"bn": row.get("name_bn"), "en": row.get("name_en"), "code": row.get("code")}

    recorded_division = None
    recorded_union = None
    if deed_record:
        recorded_division = deed_record.get("resolved_division") or deed_record.get("division")
        recorded_union = deed_record.get("resolved_union") or deed_record.get("union_ward")
        recorded_division_id = recorded_location_ref.get("division_id")
        submitted_division_id = submitted_location_ref.get("division_id")
        if recorded_division_id is not None and submitted_division_id is not None:
            division_similarity = 100.0 if int(recorded_division_id) == int(submitted_division_id) else 0.0
        else:
            division_similarity = None
        if division_similarity is not None:
            add_score("বিভাগ", division_similarity, recorded_division, division)
        if union_id is not None or union_ward:
            recorded_union_id = recorded_union_ref.get("id") if recorded_union_ref else None
            submitted_union_id = submitted_union_ref.get("id") if submitted_union_ref else None
            if recorded_union_id is not None and submitted_union_id is not None:
                union_similarity = 100.0 if int(recorded_union_id) == int(submitted_union_id) else 0.0
                add_score("ইউনিয়ন / ওয়ার্ড", union_similarity, recorded_union, union_ward)
    recorded_owner = prop_record.get("current_owner") if prop_record else None
    property_source = "Application properties record"
    deed_source = "Application deeds record"
    add_basic_check(
        "deed_no", "দলিল নম্বর", "Deed Number", deed_no,
        deed_record.get("deed_no") if deed_record else None, deed_source,
        "অ্যাপের deeds রেকর্ড", required=True,
    )
    add_basic_check(
        "reg_year", "নিবন্ধনের বছর", "Registration Year", reg_year or None,
        deed_record.get("reg_year") if deed_record else None, deed_source,
        "অ্যাপের deeds রেকর্ড", required=True,
    )
    add_basic_check(
        "deed_type", "দলিলের ধরন", "Deed Type", deed_type or None,
        recorded_deed_type_value if deed_record else None, deed_source,
        "অ্যাপের deeds রেকর্ড", required=False, optional=True,
        identifier_match=(
            submitted_deed_type_ref.get("code") == recorded_deed_type_ref.get("code")
            if submitted_deed_type_ref and recorded_deed_type_ref else None
        ),
        unresolved_comparison=bool(deed_type and recorded_deed_type_value)
        and not (submitted_deed_type_ref and recorded_deed_type_ref),
        submitted_names=({
            "bn": submitted_deed_type_ref.get("name_bn"),
            "en": submitted_deed_type_ref.get("name_en"),
            "code": submitted_deed_type_ref.get("code"),
        } if submitted_deed_type_ref else None),
        recorded_names=({
            "bn": recorded_deed_type_ref.get("name_bn"),
            "en": recorded_deed_type_ref.get("name_en"),
            "code": recorded_deed_type_ref.get("code"),
        } if recorded_deed_type_ref else None),
    )
    add_basic_check(
        "seller_name", "বিক্রেতার নাম", "Seller Name", seller_name,
        deed_record.get("seller_name") if deed_record else None, deed_source,
        "অ্যাপের deeds রেকর্ড", required=True, fuzzy=True,
    )
    add_basic_check(
        "buyer_name", "দলিলে ক্রেতার নাম", "Buyer Named in Deed", buyer_name,
        deed_record.get("buyer_name") if deed_record else None, deed_source,
        "অ্যাপের deeds রেকর্ড", required=True, fuzzy=True,
    )
    add_basic_check(
        "recorded_owner", "রেকর্ডভুক্ত বর্তমান মালিক", "Recorded Current Owner", None,
        recorded_owner, property_source, "অ্যাপের properties রেকর্ড",
        required=False, reference_only=True,
    )
    add_basic_check(
        "division", "বিভাগ", "Division", division,
        (recorded_division or (f"ID {deed_record.get('division_id')}" if deed_record and deed_record.get("division_id") is not None else None)), deed_source,
        "অ্যাপের deeds রেকর্ড", required=True,
        identifier_match=(int(submitted_location_ref["division_id"]) == int(recorded_location_ref["division_id"]))
        if submitted_location_ref.get("division_id") is not None and recorded_location_ref.get("division_id") is not None else None,
        unresolved_location=bool(deed_record and recorded_division and (
            submitted_location_ref.get("division_id") is None or recorded_location_ref.get("division_id") is None
        )),
        submitted_location_id=submitted_location_ref.get("division_id"),
        recorded_location_id=recorded_location_ref.get("division_id"),
        submitted_location_names=location_name_pair(submitted_location_ref, "division"),
        recorded_location_names=location_name_pair(recorded_location_ref, "division"),
    )
    for key, field_bn, field_en, provided in (
        ("district", "জেলা", "District", district),
        ("upazila", "উপজেলা / থানা", "Upazila / Thana", upazila),
        ("mouza", "মৌজা", "Mouza", mouza),
        ("plot_id", "দাগ / প্লট নম্বর", "Dag / Plot Number", plot_id),
        ("khatian_no", "খতিয়ান নম্বর", "Khatian Number", khatian_no),
    ):
        recorded_value = None
        if deed_record:
            recorded_value = deed_record.get(key)
        elif prop_record:
            prop_key = "plot_id" if key == "plot_id" else key
            recorded_value = prop_record.get(prop_key)
        source_en = deed_source if deed_record else property_source
        source_bn = "অ্যাপের deeds রেকর্ড" if deed_record else "অ্যাপের properties রেকর্ড"
        if key in {"district", "upazila", "mouza"}:
            ref_key = {"district": "district", "upazila": "location", "mouza": "mouza"}[key]
            submitted_ref_id = {
                "district": submitted_location_ref.get("district_id"),
                "upazila": submitted_location_ref.get("location_id"),
                "mouza": submitted_location_ref.get("mouza_id"),
            }[key]
            recorded_ref_id = {
                "district": recorded_location_ref.get("district_id"),
                "upazila": recorded_location_ref.get("location_id"),
                "mouza": recorded_location_ref.get("mouza_id"),
            }[key]
            manual_mouza_input = key == "mouza" and mouza_input_mode == "manual"
            forced_mouza_status = None
            if key == "mouza":
                identifier_match = (
                    int(submitted_ref_id) == int(recorded_ref_id)
                    if submitted_ref_id is not None and recorded_ref_id is not None else None
                )
                unresolved = bool(recorded_value and (submitted_ref_id is None or recorded_ref_id is None))
                same_parent = (
                    submitted_location_ref.get("location_id") is not None
                    and str(submitted_location_ref.get("location_id")) == str(recorded_location_ref.get("location_id"))
                )
                forced_mouza_status = _classify_mouza_check(
                    mouza_input_mode, provided, recorded_value, same_parent, identifier_match
                )
                if manual_mouza_input:
                    unresolved = False
            else:
                identifier_match = (
                    int(submitted_ref_id) == int(recorded_ref_id)
                    if submitted_ref_id is not None and recorded_ref_id is not None else None
                )
                unresolved = bool(recorded_value and (submitted_ref_id is None or recorded_ref_id is None))
            add_basic_check(
                key, field_bn, field_en, provided, recorded_value,
                source_en, source_bn, required=True,
                identifier_match=identifier_match,
                unresolved_location=unresolved,
                submitted_location_id=submitted_ref_id,
                recorded_location_id=recorded_ref_id,
                submitted_location_names=location_name_pair(submitted_location_ref, ref_key),
                recorded_location_names=location_name_pair(recorded_location_ref, ref_key),
                manual_location_input=manual_mouza_input,
                input_source=mouza_source if key == "mouza" else None,
                forced_status=forced_mouza_status,
            )
        else:
            add_basic_check(
                key, field_bn, field_en, provided, recorded_value,
                source_en, source_bn, required=True,
            )
    if submitted_union_ref and recorded_union_ref:
        union_identifier_match = int(submitted_union_ref["id"]) == int(recorded_union_ref["id"])
        union_unresolved = False
    elif union_ward and recorded_union and normalize_comparison(union_ward) == normalize_comparison(recorded_union) \
            and submitted_location_ref.get("location_id") is not None \
            and str(submitted_location_ref.get("location_id")) == str(recorded_location_ref.get("location_id")):
        union_identifier_match = True
        union_unresolved = False
    else:
        union_identifier_match = None
        union_unresolved = bool((union_ward or recorded_union) and deed_record and (
            not submitted_union_ref or not recorded_union_ref
        ))
    add_basic_check(
        "union_ward", "ইউনিয়ন / ওয়ার্ড", "Union / Ward", union_ward or None,
        (recorded_union or (f"ID {deed_record.get('union_id')}" if deed_record and deed_record.get("union_id") is not None else None)), deed_source,
        "অ্যাপের deeds রেকর্ড", required=False, optional=True,
        identifier_match=union_identifier_match,
        unresolved_location=union_unresolved,
        submitted_location_id=submitted_union_ref.get("id") if submitted_union_ref else None,
        recorded_location_id=recorded_union_ref.get("id") if recorded_union_ref else None,
        submitted_location_names=({"bn": submitted_union_ref.get("name_bn"), "en": submitted_union_ref.get("name_en"), "code": submitted_union_ref.get("code")} if submitted_union_ref else None),
        recorded_location_names=({"bn": recorded_union_ref.get("name_bn"), "en": recorded_union_ref.get("name_en"), "code": recorded_union_ref.get("code")} if recorded_union_ref else None),
    )
    add_basic_check(
        "property_status", "অ্যাপের জমি রেকর্ডের অবস্থা", "Application Property Record Status", None,
        prop_record.get("status") if prop_record else None, property_source,
        "অ্যাপের properties রেকর্ড; আইনি স্বত্ব নয়", required=False, reference_only=True,
    )

    ownership_history = {
        "status": "PARTIAL_SOURCE" if history_rows else "UNAVAILABLE",
        "source": "application_database.deeds",
        "complete": False,
        "truncated": history_truncated,
        "scope": history_scope if all(history_scope.values()) else None,
        "items": [{
            "seller_name": row.get("seller_name"),
            "buyer_name": row.get("buyer_name"),
            "transfer_date": row.get("reg_date"),
            "deed_no": row.get("deed_no"),
            "reg_year": row.get("reg_year"),
            "evidence_ref": f"deeds:{row.get('id')}",
        } for row in history_rows],
    }
    name_engine = cpp_bridge.get_engine_info() if cpp_bridge else {"engine_version": "unavailable"}
    name_comparisons = [{
        "key": check["key"],
        "submitted": check["submitted"],
        "recorded": check["recorded"],
        "status": check["status"],
        "similarity_score": check["similarity_score"],
        "source": check["source"],
        "evidence_ref": check["evidence_ref"],
        "method": name_engine.get("engine_version", "unavailable"),
        "identity_verified": False,
    } for check in field_checks if check["key"] in ("seller_name", "buyer_name")]
    seller_owner_similarity = text_similarity(seller_name, recorded_owner)
    seller_owner_status = (
        "NOT_PROVIDED" if not seller_name else
        "UNAVAILABLE" if not recorded_owner else
        "MATCHED" if normalize_comparison(seller_name) == normalize_comparison(recorded_owner) else
        "PARTIAL_MATCH" if seller_owner_similarity is not None and seller_owner_similarity >= 80 else
        "MISMATCH"
    )
    name_comparisons.append({
        "key": "seller_vs_recorded_owner",
        "submitted": seller_name or None,
        "recorded": recorded_owner,
        "status": seller_owner_status,
        "similarity_score": round(float(seller_owner_similarity), 2) if seller_owner_similarity is not None else None,
        "source": property_source,
        "evidence_ref": f"properties:{prop_record.get('id')}" if prop_record and prop_record.get("id") is not None else None,
        "method": name_engine.get("engine_version", "unavailable"),
        "required": False,
        "identity_verified": False,
    })

    graph_transfers = [{
        "seller": row.get("seller_name") or "",
        "buyer": row.get("buyer_name") or "",
        "district": row.get("district") or history_scope["district"],
        "upazila": row.get("upazila") or history_scope["upazila"],
        "mouza": row.get("mouza") or history_scope["mouza"],
        "plot_id": row.get("plot_id") or history_scope["plot_id"],
        "sale_date": row.get("reg_date") or "",
        "deed_no": row.get("deed_no") or "",
        "transfer_id": f"deeds:{row.get('id')}",
    } for row in history_rows]
    cpp_graph_analysis = cpp_bridge.detect_fraud_graph(graph_transfers) if cpp_bridge else {
        "error": "C++/Python graph bridge unavailable", "anomalies": [],
    }
    graph_anomalies = cpp_graph_analysis.get("anomalies", [])
    for anomaly in graph_anomalies:
        explanation = anomaly.get("explanation", "Parcel history needs review.")
        refs = anomaly.get("evidence_refs", [])
        discrepancies.append({
            "field": "দলিলের ধারাবাহিকতা",
            "field_en": "Recorded Parcel History Observation",
            "severity": "medium",
            "code": anomaly.get("type", "PARCEL_HISTORY_OBSERVATION"),
            "message_bn": "দলিলের রেকর্ডে ধারাবাহিকতা-সংক্রান্ত সংকেত আছে; মূল দলিল হাতে মিলিয়ে দেখুন।",
            "message_en": explanation,
            "explanation_bn": "দলিলের রেকর্ডে ধারাবাহিকতা-সংক্রান্ত সংকেত আছে; মূল দলিল হাতে মিলিয়ে দেখুন।",
            "explanation_en": explanation,
            "evidence_refs": refs,
            "source": "application_database.deeds / parcel graph analysis",
            "risk_points": 0,
        })

    if not deed_record and not prop_record:
        result_status = "RECORD_NOT_FOUND"
        match_score = None
        extracted_summary = None

    else:
        if not deed_record:
            discrepancies.append({
                "field": "দলিল রেকর্ড",
                "field_en": "Deed Record",
                "severity": "high",
                "expected": None,
                "provided": deed_no or None,
                "message_bn": "প্রদত্ত দলিল নম্বর ও নিবন্ধন সালের সঙ্গে মিলে এমন কোনো দলিল রেকর্ড ডেমো ডাটাবেজে পাওয়া যায়নি।",
                "message_en": "No deed record in the demo database matched the submitted deed number and registration year.",
                "source": "ডেমো রেজিস্ট্রি"
            })

        # 1. Deed Number — 8%
        if deed_no and deed_record:
            add_score("দলিল নম্বর", 100, deed_record["deed_no"], deed_no)

        # 2. Mouza + Upazila — 8% (4% each)
        if deed_record:
            if mouza:
                sim = text_similarity(mouza, deed_record["mouza"])
                if sim is not None:
                    add_score("মৌজা", sim, deed_record["mouza"], mouza)

            if upazila:
                sim = text_similarity(upazila, deed_record["upazila"])
                if sim is not None:
                    add_score("উপজেলা", sim, deed_record["upazila"], upazila)

        # 3. Plot / Daag Number — 8%
        if plot_id and deed_record:
            sim = text_similarity(plot_id, deed_record["plot_id"])
            if sim is not None:
                add_score("দাগ / প্লট নম্বর", sim,
                          deed_record["plot_id"], plot_id)

        # 4. Owner Name — 60%
        if owner_name and deed_record:
            rec_owner = deed_record["buyer_name"]
            sim = text_similarity(owner_name, rec_owner)
            if sim is not None:
                add_score("ক্রেতার নাম", sim, rec_owner, owner_name)

        if seller_name and deed_record:
            recorded_seller = deed_record["seller_name"]
            sim = text_similarity(seller_name, recorded_seller)
            if sim is not None:
                add_score("বিক্রেতার নাম", sim, recorded_seller, seller_name)

        # 5. Land Area — 8%
        if deed_record:
            provided_area = input_data.get("area")
            recorded_area = deed_record["area"]

            sim = number_similarity(provided_area, recorded_area)
            if sim is not None:
                add_score("জমির পরিমাণ", sim,
                          recorded_area, provided_area)

        # 6. Land Status — 8%
        if prop_record:
            land_status = str(prop_record["status"]).lower()

            if land_status == "clear":
                add_score("জমির অবস্থা", 100, "clear", land_status)

            else:
                add_score("জমির অবস্থা", 0, "clear", land_status)

                discrepancies.append({
                    "field": "জমির অবস্থা",
                    "field_en": "Land Status",
                    "severity": "high",
                    "message_bn": (
                        "জমিটি বিতর্কিত বা অধিগ্রহণের আওতায় রয়েছে।"
                        if land_status in ("disputed", "acquired")
                        else f"জমির অবস্থা: {land_status}"
                    ),
                    "source": "ভূমি রেকর্ড"
                })

        # Khatian check — informational only; not part of the 100% formula
        if khatian_no and deed_record:
            if str(khatian_no).strip().lower() != str(deed_record["khatian_no"]).strip().lower():
                discrepancies.append({
                    "field": "খতিয়ান নম্বর",
                    "field_en": "Khatian Number",
                    "severity": "medium",
                    "expected": deed_record["khatian_no"],
                    "provided": khatian_no,
                    "message_bn": "খতিয়ান নম্বরে অমিল পাওয়া গেছে।",
                    "source": "ভূমি রেকর্ড"
                })

        extracted_summary = {
            "deed_no": deed_record["deed_no"] if deed_record else None,
            "deed_type": deed_record.get("deed_type") if deed_record else None,
            "deed_type_names": ({
                "bn": recorded_deed_type_ref.get("name_bn"),
                "en": recorded_deed_type_ref.get("name_en"),
                "code": recorded_deed_type_ref.get("code"),
            } if recorded_deed_type_ref else None),
            "reg_year": deed_record["reg_year"] if deed_record else None,
            "division": (deed_record.get("resolved_division") or deed_record.get("division")) if deed_record else None,
            "division_id": recorded_location_ref.get("division_id") if deed_record else None,
            "district": deed_record["district"] if deed_record else (prop_record["district"] if prop_record else None),
            "district_id": recorded_location_ref.get("district_id") if (deed_record or prop_record) else None,
            "upazila": deed_record["upazila"] if deed_record else (prop_record["upazila"] if prop_record else None),
            "location_id": recorded_location_ref.get("location_id") if (deed_record or prop_record) else None,
            "location_type": recorded_location_ref.get("location_type") if (deed_record or prop_record) else None,
            "mouza": deed_record["mouza"] if deed_record else (prop_record["mouza"] if prop_record else None),
            "mouza_id": recorded_location_ref.get("mouza_id") if (deed_record or prop_record) else None,
            "union_ward": (deed_record.get("resolved_union") or deed_record.get("union_ward")) if deed_record else None,
            "union_id": deed_record.get("union_id") if deed_record else None,
            "plot_id": deed_record["plot_id"] if deed_record else (prop_record["plot_id"] if prop_record else None),
            "khatian_no": deed_record["khatian_no"] if deed_record else (prop_record["khatian_no"] if prop_record else None),
            "owner_name": deed_record["buyer_name"] if deed_record else (prop_record["current_owner"] if prop_record else None),
            "buyer_name": deed_record["buyer_name"] if deed_record else (prop_record["current_owner"] if prop_record else None),
            "recorded_owner": recorded_owner,
            "recorded_seller": deed_record["seller_name"] if deed_record else None,
            "recorded_buyer": deed_record["buyer_name"] if deed_record else None,
            "recorded_area": deed_record["area"] if deed_record else (prop_record["area"] if prop_record else None),
            "recorded_price": deed_record["price"] if deed_record else None,
            "property_status": prop_record["status"] if prop_record else None,
            "sub_registry_office": deed_record["sub_registry_office"] if deed_record else None,
            "record_found": bool(deed_record),
            "deed_lookup_ambiguous": deed_lookup_ambiguous,
            "property_found": bool(prop_record),
            "data_source": "application_database",
        }
        extracted_summary["location_names"] = {
            key: location_name_pair(recorded_location_ref, ref_key)
            for key, ref_key in (("division", "division"), ("district", "district"), ("upazila", "location"), ("mouza", "mouza"))
        }
        submitted_summary["location_names"] = {
            key: location_name_pair(submitted_location_ref, ref_key)
            for key, ref_key in (("division", "division"), ("district", "district"), ("upazila", "location"), ("mouza", "mouza"))
        }

    required_checks = [check for check in field_checks if check["required"]]
    evaluated_statuses = {"MATCHED", "PARTIAL_MATCH", "MISMATCH"}
    evaluated_checks = [check for check in required_checks if check["status"] in evaluated_statuses]
    matched_count = sum(check["status"] == "MATCHED" for check in required_checks)
    partial_count = sum(check["status"] == "PARTIAL_MATCH" for check in required_checks)
    mismatch_count = sum(check["status"] == "MISMATCH" for check in required_checks)
    unavailable_count = sum(check["status"] == "UNAVAILABLE" for check in required_checks)
    not_provided_count = sum(check["status"] == "NOT_PROVIDED" for check in required_checks)

    if not deed_record:
        overall_category = "INSUFFICIENT_DATA" if deed_lookup_ambiguous else "RECORD_NOT_FOUND"
        match_score = None
        result_status = "POTENTIAL_INCONSISTENCY" if deed_lookup_ambiguous else "RECORD_NOT_FOUND"
    elif unavailable_count or not_provided_count or len(evaluated_checks) != len(required_checks):
        overall_category = "INSUFFICIENT_DATA"
        match_score = None
        # Keep the established result_status value for existing API consumers.
        result_status = "POTENTIAL_INCONSISTENCY"
    else:
        match_score = round(matched_count / len(evaluated_checks) * 100) if evaluated_checks else None
        if mismatch_count:
            overall_category = "MISMATCH"
            result_status = "POTENTIAL_INCONSISTENCY"
        elif partial_count:
            overall_category = "PARTIAL_MATCH"
            result_status = "POTENTIAL_INCONSISTENCY"
        elif discrepancies:
            # Keep anomaly and consistency warnings separate from the field
            # match percentage, but do not show an unqualified positive state.
            overall_category = "POTENTIAL_INCONSISTENCY"
            result_status = "POTENTIAL_INCONSISTENCY"
        else:
            overall_category = "MATCH"
            result_status = "MATCH"

    coverage = {
        "required": len(required_checks),
        "evaluated": len(evaluated_checks),
        "matched": matched_count,
        "partial": partial_count,
        "mismatched": mismatch_count,
        "unavailable": unavailable_count,
        "not_provided": not_provided_count,
    }
    if extracted_summary is None:
        extracted_summary = {}
    extracted_summary.update({
        "schema_version": 2,
        "record_found": bool(deed_record),
        "property_found": bool(prop_record),
        "data_source": "application_database",
        "submitted_mouza_input_mode": mouza_input_mode,
        "submitted_mouza_source": mouza_source,
        "overall_category": overall_category,
        "coverage": coverage,
        "verification_fields": field_checks,
        "name_comparisons": name_comparisons,
        "ownership_history": ownership_history,
        "cpp_graph_analysis": cpp_graph_analysis,
        "anomalies": graph_anomalies,
    })

    ref_id = f"LG-VR-2026-{secrets.token_hex(3).upper()}"
    now_iso = datetime.now().isoformat()

    with conn() as c:
        location_ids = (
            division_id,
            input_data.get("district_id"),
            input_data.get("upazila_id"),
            input_data.get("police_thana_id"),
            input_data.get("mouza_id"),
            union_id,
        )
        if any(value is not None for value in location_ids):
            c.execute(
                """INSERT INTO deed_verifications (verification_ref, user_id, deed_no, deed_type, reg_year, district, upazila, mouza,
                   plot_id, khatian_no, owner_name, buyer_name, seller_name, result_status, match_score, discrepancies, extracted_data, notes, created_at,
                   division, division_id, district_id, upazila_id, police_thana_id, mouza_id, union_id, union_ward)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                (ref_id, user_id, deed_no, deed_type or None, reg_year, district, upazila, mouza, plot_id, khatian_no, owner_name, buyer_name or None, seller_name or None,
                 result_status, match_score, json.dumps(discrepancies, ensure_ascii=False),
                 json.dumps(extracted_summary, ensure_ascii=False), notes, now_iso, division or None, *location_ids, union_ward or None)
            )
        else:
            c.execute(
                """INSERT INTO deed_verifications (verification_ref, user_id, deed_no, deed_type, reg_year, district, upazila, mouza,
                   plot_id, khatian_no, owner_name, buyer_name, seller_name, result_status, match_score, discrepancies, extracted_data, notes, created_at,
                   division, division_id, union_id, union_ward)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                (ref_id, user_id, deed_no, deed_type or None, reg_year, district, upazila, mouza, plot_id, khatian_no, owner_name, buyer_name or None, seller_name or None,
                 result_status, match_score, json.dumps(discrepancies, ensure_ascii=False),
                 json.dumps(extracted_summary, ensure_ascii=False), notes, now_iso, division or None, division_id, union_id, union_ward or None)
            )

    log_audit(user_name, "citizen" if not user_id else "user", "DEED_VERIFY", "P2_VERIFICATION",
              f"Verified deed {deed_no} (Status: {result_status}, Ref: {ref_id})")

    payload = {
        "lookup_status": "DEED_FOUND",
        "verification_ref": ref_id,
        "result_status": result_status,
        "overall_category": overall_category,
        "schema_version": 2,
        "match_score": match_score,
        "coverage": coverage,
        "discrepancies": discrepancies,
        "extracted_summary": extracted_summary,
        "submitted_summary": submitted_summary,
        "field_checks": field_checks,
        "fields": field_checks,
        "name_comparisons": name_comparisons,
        "ownership_history": ownership_history,
        "cpp_graph_analysis": cpp_graph_analysis,
        "anomalies": graph_anomalies,
        "record_found": bool(deed_record),
        "property_found": bool(prop_record),
        "created_at": now_iso,
        "verification_url": f"/verify-deed/{ref_id}",
        "disclaimer_bn": "সতর্কবার্তা: এটি ডেমো ডেটাবেজভিত্তিক বিশ্লেষণ। এটি সরকারি বালাম বইয়ের চূড়ান্ত বা আইনি স্বত্ব সনদ নয়।",
        "disclaimer_en": "Disclaimer: This is preliminary screening against synthetic demonstration records. It does not replace official Sub-Registry Office verification or legal counsel."
    }

    if result_status == "RECORD_NOT_FOUND":
        payload["message_bn"] = "আপনার দেওয়া দলিল নম্বরটি আমাদের ডেমো ডাটাবেজে খুঁজে পাওয়া যায়নি।"
        payload["message_en"] = "The submitted deed number was not found in our demo database."

    return payload


def get_deed_verification_by_ref(ref: str):
    init()
    with conn() as c:
        row_data = c.execute(
            "SELECT * FROM deed_verifications WHERE verification_ref = %s", (ref,)
        ).fetchone()
        if not row_data:
            return None
        d = dict(row_data)
        d["discrepancies"] = json.loads(d["discrepancies"]) if d["discrepancies"] else []
        d["extracted_data"] = json.loads(d["extracted_data"]) if d["extracted_data"] else {}
        return d


def list_deed_types():
    init()
    with conn() as c:
        rows = c.execute(
            """SELECT code, name_bn, name_en, official_source
               FROM deed_types WHERE is_active=TRUE ORDER BY sort_order, code"""
        ).fetchall()
        return [dict(item) for item in rows]


def is_supported_deed_type(code: str) -> bool:
    init()
    with conn() as c:
        return c.execute(
            "SELECT 1 FROM deed_types WHERE code=%s AND is_active=TRUE", (code,)
        ).fetchone() is not None


def list_deed_verifications(limit=20, user_id=None):
    init()
    with conn() as c:
        if user_id is None:
            rows = c.execute("SELECT * FROM deed_verifications ORDER BY id DESC LIMIT %s", (limit,)).fetchall()
        else:
            rows = c.execute("SELECT * FROM deed_verifications WHERE user_id = %s ORDER BY id DESC LIMIT %s", (user_id, limit)).fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d["discrepancies"] = json.loads(d["discrepancies"]) if d["discrepancies"] else []
            d["extracted_data"] = json.loads(d["extracted_data"]) if d["extracted_data"] else {}
            result.append(d)
        return result


# =====================================================================
# P4: SMART E-NAMJARI & REGISTRATION WORKFLOW ENGINE
# =====================================================================

VALID_MUTATION_STATUSES = [
    "Draft",
    "Submitted",
    "Under Review",
    "Correction Required",
    "Resubmitted",
    "Approved",
    "Rejected",
    # Legacy aliases preserved for backwards compatibility
    "Initial Review",
    "Document Verification",
    "Additional Information Required",
    "Decision Pending"
]

STATUS_CANONICAL_MAP = {
    "draft": "Draft",
    "submitted": "Submitted",
    "under review": "Under Review",
    "under_review": "Under Review",
    "initial review": "Under Review",
    "document verification": "Under Review",
    "correction required": "Correction Required",
    "correction_required": "Correction Required",
    "additional information required": "Correction Required",
    "resubmitted": "Resubmitted",
    "decision pending": "Under Review",
    "approved": "Approved",
    "rejected": "Rejected"
}

ALLOWED_TRANSITIONS = {
    "Draft": ["Submitted"],
    "Submitted": ["Under Review", "Correction Required", "Approved", "Rejected"],
    "Under Review": ["Approved", "Correction Required", "Rejected"],
    "Correction Required": ["Resubmitted", "Rejected"],
    "Resubmitted": ["Under Review", "Approved", "Correction Required", "Rejected"],
    "Approved": [],
    "Rejected": []
}

STATUS_TRANSLATIONS = {
    "Draft": {"bn": "খসড়া সংরক্ষণ", "en": "Draft", "color": "slate"},
    "Submitted": {"bn": "দাখিলকৃত (পেন্ডিং)", "en": "Submitted", "color": "blue"},
    "Under Review": {"bn": "নথি পর্যালোচনা চলছে", "en": "Under Review", "color": "indigo"},
    "Correction Required": {"bn": "সংশোধনের অনুরোধ / তথ্য তলব", "en": "Correction Required", "color": "orange"},
    "Resubmitted": {"bn": "সংশোধিত তথ্য দাখিলকৃত", "en": "Resubmitted", "color": "teal"},
    "Approved": {"bn": "অনুমোদিত", "en": "Approved", "color": "emerald"},
    "Rejected": {"bn": "খারিজ / বাতিল", "en": "Rejected", "color": "rose"},
    # Legacy aliases
    "Initial Review": {"bn": "নথি পর্যালোচনা চলছে", "en": "Under Review", "color": "indigo"},
    "Document Verification": {"bn": "কাগজপত্র যাচাই", "en": "Under Review", "color": "amber"},
    "Additional Information Required": {"bn": "সংশোধনের অনুরোধ / তথ্য তলব", "en": "Correction Required", "color": "orange"},
    "Decision Pending": {"bn": "চূড়ান্ত সিদ্ধান্ত অপেক্ষমাণ", "en": "Under Review", "color": "purple"}
}


def create_mutation_application(data: dict, user_id=None, user_name="Citizen"):
    init()
    is_draft = data.get("is_draft", False)
    status = "Draft" if is_draft else "Submitted"

    district = data.get("district", "ঢাকা")
    dist_code = "DHK" if "ঢা" in district or "Dhaka" in district else "CTG" if "চট্টগ্রাম" in district else "RAJ" if "রাজ" in district else "SYL"
    rand_code = secrets.token_hex(2).upper()
    tracking_no = f"MUT-2026-{dist_code}-{rand_code}"
    now_iso = datetime.now().isoformat()

    docs = data.get("supporting_docs", [])
    if isinstance(docs, str):
        try:
            docs = json.loads(docs)
        except Exception:
            docs = [docs]

    with conn() as c:
        cur = c.execute(
            """INSERT INTO mutation_applications (
                tracking_no, user_id, applicant_name, applicant_nid, applicant_phone, applicant_address,
                applicant_relation, district, upazila, mouza, jl_no, khatian_type, khatian_no,
                plot_no, land_area, land_class, ownership_source, deed_no, deed_date,
                supporting_docs, status, review_notes, rejection_reason, created_at, updated_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
               RETURNING id""",
            (
                tracking_no, user_id,
                data.get("applicant_name", "").strip(),
                data.get("applicant_nid", "").strip(),
                data.get("applicant_phone", "").strip(),
                data.get("applicant_address", "").strip(),
                data.get("applicant_relation", "Self"),
                district,
                data.get("upazila", "").strip(),
                data.get("mouza", "").strip(),
                data.get("jl_no", "").strip(),
                data.get("khatian_type", "BS"),
                data.get("khatian_no", "").strip(),
                data.get("plot_no", "").strip(),
                float(data.get("land_area", 0) or 0),
                data.get("land_class", "নাল (Nal)"),
                data.get("ownership_source", "ক্রয়সূত্রে (Purchase)"),
                data.get("deed_no", "").strip(),
                data.get("deed_date", now_iso[:10]),
                json.dumps(docs, ensure_ascii=False),
                status,
                data.get("review_notes", ""),
                "",
                now_iso,
                now_iso
            )
        )
        app_id = cur.fetchone()["id"]

        # Insert first timeline entry
        c.execute(
            """INSERT INTO mutation_status_history (
                application_id, tracking_no, from_status, to_status, changed_by_name, changed_by_role, changed_by_id, remarks, created_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (
                app_id, tracking_no, None, status,
                user_name, "citizen", user_id,
                "আবেদনটি খসড়া হিসেবে সংরক্ষিত হয়েছে" if is_draft else "নতুন ই-নামজারি আবেদন সফলভাবে দাখিল করা হয়েছে",
                now_iso
            )
        )

    log_audit(user_name, "citizen", "MUTATION_CREATE", "P4_MUTATION", f"Created application {tracking_no} (Status: {status})")

    # New submissions remain visible to admins for explicit assignment. Do not
    # broadcast applicant details to every officer before an assignment exists.
    if not is_draft:
        add_notification(
            None, "admin",
            "নতুন ই-নামজারি আবেদন পর্যালোচনার অপেক্ষায়", "New E-Namjari application awaiting assignment",
            f"ট্র্যাকিং নম্বর: {tracking_no}", f"Tracking ID: {tracking_no}",
            "info", "#application-admin"
        )

    return get_mutation_application(tracking_no)


def update_mutation_application(tracking_no: str, data: dict, user_name="Citizen"):
    init()
    now_iso = datetime.now().isoformat()
    app = get_mutation_application(tracking_no)
    if not app:
        return None

    docs = data.get("supporting_docs", app.get("supporting_docs", []))
    with conn() as c:
        c.execute(
            """UPDATE mutation_applications SET
                applicant_name = COALESCE(%s, applicant_name),
                applicant_phone = COALESCE(%s, applicant_phone),
                applicant_address = COALESCE(%s, applicant_address),
                district = COALESCE(%s, district),
                upazila = COALESCE(%s, upazila),
                mouza = COALESCE(%s, mouza),
                khatian_no = COALESCE(%s, khatian_no),
                plot_no = COALESCE(%s, plot_no),
                land_area = COALESCE(%s, land_area),
                supporting_docs = %s,
                updated_at = %s
            WHERE tracking_no = %s""",
            (
                data.get("applicant_name"),
                data.get("applicant_phone"),
                data.get("applicant_address"),
                data.get("district"),
                data.get("upazila"),
                data.get("mouza"),
                data.get("khatian_no"),
                data.get("plot_no"),
                data.get("land_area"),
                json.dumps(docs, ensure_ascii=False),
                now_iso,
                tracking_no
            )
        )
    return get_mutation_application(tracking_no)


def get_mutation_application(tracking_no_or_id):
    init()
    with conn() as c:
        if str(tracking_no_or_id).isdigit():
            app = c.execute(
                "SELECT m.*, u.username, u.profile_picture FROM mutation_applications m LEFT JOIN users u ON u.id = m.user_id WHERE m.id = %s",
                (int(tracking_no_or_id),),
            ).fetchone()
        else:
            app = c.execute(
                "SELECT m.*, u.username, u.profile_picture FROM mutation_applications m LEFT JOIN users u ON u.id = m.user_id WHERE UPPER(m.tracking_no) = UPPER(%s)",
                (str(tracking_no_or_id),),
            ).fetchone()

        if not app:
            return None

        d = dict(app)
        d["applicant_nid"] = _mask_nid_value(d.get("applicant_nid"))
        d["supporting_docs"] = json.loads(d["supporting_docs"]) if d["supporting_docs"] else []
        d["status_info"] = STATUS_TRANSLATIONS.get(d["status"], {"bn": d["status"], "color": "slate"})

        # Fetch history timeline
        hist_rows = c.execute(
            "SELECT * FROM mutation_status_history WHERE application_id = %s OR tracking_no = %s ORDER BY id ASC",
            (d["id"], d["tracking_no"])
        ).fetchall()
        d["timeline"] = [dict(h) for h in hist_rows]
        return d


def list_mutation_applications(user_id=None, role=None, status_filter=None, limit=50, assigned_officer_id=None, exclude_drafts=False):
    init()
    with conn() as c:
        query = """SELECT m.*, u.username, u.profile_picture,
                          officer.name AS assigned_officer_name,
                          officer.username AS assigned_officer_username
                   FROM mutation_applications m
                   LEFT JOIN users u ON u.id = m.user_id
                   LEFT JOIN users officer ON officer.id = m.assigned_officer_id"""
        params = []
        conditions = []

        if role == "citizen" and user_id:
            conditions.append("m.user_id = %s")
            params.append(user_id)
        if assigned_officer_id is not None:
            assignment_column = c.execute(
                """SELECT EXISTS (
                       SELECT 1 FROM information_schema.columns
                       WHERE table_schema='public' AND table_name='mutation_applications'
                         AND column_name='assigned_officer_id'
                   ) AS available"""
            ).fetchone()["available"]
            if assignment_column:
                conditions.append("m.assigned_officer_id = %s")
                params.append(int(assigned_officer_id))
            else:
                conditions.append("FALSE")
        if status_filter:
            conditions.append("m.status = %s")
            params.append(status_filter)
        if exclude_drafts:
            conditions.append("LOWER(m.status) <> 'draft'")

        if conditions:
            query += " WHERE " + " AND ".join(conditions)

        query += " ORDER BY m.id DESC LIMIT %s"
        params.append(limit)

        rows = c.execute(query, params).fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d["applicant_nid"] = _mask_nid_value(d.get("applicant_nid"))
            d["supporting_docs"] = json.loads(d["supporting_docs"]) if d["supporting_docs"] else []
            d["status_info"] = STATUS_TRANSLATIONS.get(d["status"], {"bn": d["status"], "color": "slate"})
            result.append(d)
        return result


def update_mutation_status(
    tracking_no: str,
    new_status: str,
    changed_by_name: str,
    changed_by_role: str,
    remarks: str = "",
    rejection_reason: str = "",
    correction_details: str = "",
    changed_by_id: Optional[int] = None,
    assigned_officer_id: Optional[int] = None,
):
    init()
    canonical_new = STATUS_CANONICAL_MAP.get(new_status.strip().lower())
    if not canonical_new or canonical_new not in VALID_MUTATION_STATUSES:
        raise ValueError(f"Invalid status: {new_status}")

    with conn() as c:
        app_row = c.execute(
            "SELECT * FROM mutation_applications WHERE UPPER(tracking_no)=UPPER(%s) FOR UPDATE",
            (tracking_no.strip(),),
        ).fetchone()
        if not app_row:
            raise ValueError("Application not found")
        app = dict(app_row)
        if assigned_officer_id is not None and app.get("assigned_officer_id") != int(assigned_officer_id):
            raise PermissionError("Application is not assigned to this officer")

        old_status = app["status"]
        canonical_old = STATUS_CANONICAL_MAP.get(old_status.strip().lower(), old_status)

        # State transition validation runs under the row lock to prevent
        # simultaneous reviewers from applying conflicting final decisions.
        if canonical_old != canonical_new:
            allowed = ALLOWED_TRANSITIONS.get(canonical_old, [])
            if canonical_new not in allowed:
                raise ValueError(f"Invalid status transition from '{old_status}' to '{canonical_new}'")

        final_rejection_reason = rejection_reason.strip() or remarks.strip()
        if canonical_new == "Rejected" and not final_rejection_reason:
            raise ValueError("Rejection reason is required")

        final_correction_details = correction_details.strip() or remarks.strip()
        if canonical_new == "Correction Required" and not final_correction_details:
            raise ValueError("Correction details or notice remarks are required")

        now_iso = datetime.now().isoformat()
        rejection_reason_to_store = final_rejection_reason if canonical_new == "Rejected" else (app.get("rejection_reason") or "")
        review_notes_to_store = final_correction_details if canonical_new == "Correction Required" else (remarks.strip() or app.get("review_notes") or "")
        c.execute(
            """UPDATE mutation_applications SET
                status = %s,
                review_notes = %s,
                rejection_reason = %s,
                updated_at = %s
            WHERE tracking_no = %s""",
            (canonical_new, review_notes_to_store, rejection_reason_to_store, now_iso, tracking_no)
        )

        c.execute(
            """INSERT INTO mutation_status_history (
                application_id, tracking_no, from_status, to_status, changed_by_name, changed_by_role, changed_by_id, remarks, created_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (app["id"], tracking_no, old_status, canonical_new, changed_by_name, changed_by_role, changed_by_id, remarks.strip(), now_iso)
        )

    log_audit(changed_by_name, changed_by_role, "MUTATION_STATUS_CHANGE", "P4_MUTATION",
              f"Changed {tracking_no} status from '{old_status}' to '{canonical_new}' (Remarks: {remarks})")

    # Notify citizen
    st_bn = STATUS_TRANSLATIONS.get(canonical_new, {}).get("bn", canonical_new)
    add_notification(
        app["user_id"], "citizen",
        f"ই-নামজারি আবেদনের অগ্রগতি ({tracking_no})",
        f"E-Namjari Status Update ({tracking_no})",
        f"আপনার আবেদনটির স্ট্যাটাস পরিবর্তিত হয়ে '{st_bn}' হয়েছে। মন্তব্য: {remarks.strip() or 'স্বাভাবিক প্রক্রিয়াধীন'}",
        f"Application status changed to '{canonical_new}'. Remarks: {remarks.strip() or 'Processing normally'}",
        "success" if canonical_new == "Approved" else "warning" if canonical_new in ["Rejected", "Correction Required", "Additional Information Required"] else "info",
        f"/mutation/track?tracking_no={tracking_no}"
    )

    return get_mutation_application(tracking_no)


def resubmit_mutation_application(tracking_no: str, user_id: Optional[int], user_name: str, corrected_data: dict):
    """Allows an applicant to provide corrected documents/information and resubmit an application in Correction Required status."""
    init()
    app = get_mutation_application(tracking_no)
    if not app:
        raise ValueError("Application not found")

    old_status = app["status"]
    canonical_old = STATUS_CANONICAL_MAP.get(old_status.strip().lower(), old_status)

    if canonical_old != "Correction Required":
        raise ValueError(f"Application cannot be resubmitted from current status '{old_status}'. It must be in 'Correction Required' status.")

    applicant_remarks = corrected_data.get("remarks", "").strip() or "সংশোধিত তথ্য ও প্রয়োজনীয় প্রমাণক দাখিল করা হয়েছে।"
    docs = corrected_data.get("supporting_docs")
    if docs is None:
        docs = app.get("supporting_docs", [])
    elif isinstance(docs, str):
        try:
            docs = json.loads(docs)
        except Exception:
            docs = [docs]

    now_iso = datetime.now().isoformat()

    with conn() as c:
        c.execute(
            """UPDATE mutation_applications SET
                applicant_phone = COALESCE(%s, applicant_phone),
                applicant_address = COALESCE(%s, applicant_address),
                khatian_no = COALESCE(%s, khatian_no),
                plot_no = COALESCE(%s, plot_no),
                land_area = COALESCE(%s, land_area),
                supporting_docs = %s,
                status = 'Resubmitted',
                review_notes = %s,
                updated_at = %s
            WHERE tracking_no = %s""",
            (
                corrected_data.get("applicant_phone"),
                corrected_data.get("applicant_address"),
                corrected_data.get("khatian_no"),
                corrected_data.get("plot_no"),
                float(corrected_data.get("land_area")) if corrected_data.get("land_area") else None,
                json.dumps(docs, ensure_ascii=False),
                applicant_remarks,
                now_iso,
                tracking_no
            )
        )

        c.execute(
            """INSERT INTO mutation_status_history (
                application_id, tracking_no, from_status, to_status, changed_by_name, changed_by_role, changed_by_id, remarks, created_at
            ) VALUES (%s, %s, %s, 'Resubmitted', %s, 'citizen', %s, %s, %s)""",
            (app["id"], tracking_no, old_status, user_name, user_id, applicant_remarks, now_iso)
        )

    log_audit(user_name, "citizen", "MUTATION_RESUBMIT", "P4_MUTATION",
              f"Resubmitted corrected application {tracking_no}. Remarks: {applicant_remarks}")

    # Notify admins so they can assign the resubmission to an officer.
    add_notification(
        None, "admin",
        "সংশোধিত নামজারি আবেদন দায়িত্ব দেওয়ার অপেক্ষায়", "Resubmitted mutation application awaiting assignment",
        f"ট্র্যাকিং নম্বর: {tracking_no}", f"Tracking ID: {tracking_no}",
        "info",
        "#application-admin"
    )

    return get_mutation_application(tracking_no)


def mutation_stats():
    init()
    with conn() as c:
        counts = {st: 0 for st in VALID_MUTATION_STATUSES}
        total = 0
        for r in c.execute("SELECT status, COUNT(*) n FROM mutation_applications GROUP BY status"):
            counts[r["status"]] = r["n"]
            total += r["n"]
        counts["total"] = total
        counts["pending"] = sum(counts[s] for s in ["Submitted", "Initial Review", "Document Verification", "Additional Information Required", "Decision Pending"])
        return counts


# =====================================================================
# P5: CITIZEN PRE-PURCHASE LAND DUE DILIGENCE ENGINE
# =====================================================================

def assess_due_diligence(data: dict, user_id=None, user_name="Citizen"):
    init()
    seller_name = str(data.get("seller_name", "")).strip()
    seller_nid = str(data.get("seller_nid", "")).strip()
    deed_no = str(data.get("deed_no", "")).strip()
    reg_year = int(data.get("reg_year", 0) or 0)
    district = str(data.get("district", "ঢাকা")).strip()
    upazila = str(data.get("upazila", "")).strip()
    mouza = str(data.get("mouza", "")).strip()
    khatian_no = str(data.get("khatian_no", "")).strip()
    plot_no = str(data.get("plot_no", "")).strip()
    recorded_area = float(data.get("recorded_area", 0) or 0)
    proposed_area = float(data.get("proposed_area", 0) or 0)
    documents_held = data.get("documents_held", [])
    has_court_dispute = bool(data.get("has_court_dispute", False))

    if isinstance(documents_held, str):
        try:
            documents_held = json.loads(documents_held)
        except Exception:
            documents_held = [d.strip() for d in documents_held.split(",") if d.strip()]

    with conn() as c:
        # Check matching property
        prop = c.execute("SELECT * FROM properties WHERE LOWER(plot_id) = LOWER(%s)", (plot_no,)).fetchone()
        # Only treat deeds with the same complete parcel scope as one history.
        matching_deeds = []
        if all((plot_no, district, upazila, mouza)):
            matching_deeds = c.execute(
                """SELECT * FROM deeds
                   WHERE LOWER(BTRIM(plot_id)) = LOWER(BTRIM(%s))
                     AND LOWER(BTRIM(district)) = LOWER(BTRIM(%s))
                     AND LOWER(BTRIM(upazila)) = LOWER(BTRIM(%s))
                     AND LOWER(BTRIM(mouza)) = LOWER(BTRIM(%s))
                     AND COALESCE(is_verified,1)<>0
                   ORDER BY reg_year ASC, reg_date ASC, id ASC""",
                (plot_no, district, upazila, mouza),
            ).fetchall()
        history_sales = [{
            "seller": row.get("seller_name") or "",
            "buyer": row.get("buyer_name") or "",
            "plot_id": row.get("plot_id") or "",
            "sale_date": row.get("reg_date") or "",
            "deed_no": row.get("deed_no") or "",
        } for row in matching_deeds]

    indicators = []
    evidence = []
    score = 0

    # Rule 1: Seller vs Recorded Owner Conflict (+40 pts)
    if prop:
        if prop["current_owner"].lower() != seller_name.lower():
            pts = 40
            score += pts
            indicators.append({
                "code": "OWNER_NAME_MISMATCH",
                "title_bn": "মালিকানা গরমিল: বিক্রেতার নামে রেকর্ড নেই",
                "title_en": "Owner Mismatch: Seller is not recorded owner",
                "points": pts,
                "severity": "high",
                "explanation_bn": f"রেকর্ড অনুযায়ী প্লটের বর্তমান মালিক '{prop['current_owner']}', কিন্তু প্রস্তাবিত বিক্রেতা '{seller_name}'।",
                "explanation_en": f"Recorded owner is '{prop['current_owner']}', but proposed seller is '{seller_name}'."
            })
            evidence.append(f"খতিয়ান ও ভূমি রেকর্ডে বর্তমান মালিক: {prop['current_owner']}")
    elif history_sales:
        last_buyer = history_sales[-1]["buyer"]
        if last_buyer.lower() != seller_name.lower():
            pts = 40
            score += pts
            indicators.append({
                "code": "CHAIN_OF_TITLE_BROKEN",
                "title_bn": "মালিকানার ধারাবাহিকতা বিচ্ছিন্ন",
                "title_en": "Broken Title Chain",
                "points": pts,
                "severity": "high",
                "explanation_bn": f"সর্বশেষ নিবন্ধিত ক্রেতা ছিলেন '{last_buyer}', কিন্তু বিক্রেতা হিসেবে দাবি করছেন '{seller_name}'।",
                "explanation_en": f"Last recorded buyer was '{last_buyer}', but current seller is '{seller_name}'."
            })
            evidence.append(f"সাব-রেজিস্ট্রি দলিলের সর্বশেষ ক্রেতা: {last_buyer}")

    # Rule 2: Duplicate Sale / Active Conflict (+45 pts)
    if history_sales:
        sold_before = [s for s in history_sales if s["seller"].lower() == seller_name.lower()]
        if sold_before:
            pts = 45
            score += pts
            indicators.append({
                "code": "DUPLICATE_SALE_RECORD",
                "title_bn": "একাধিকবার বিক্রির পূর্ব রেকর্ড বিদ্যমান",
                "title_en": "Prior Duplicate Sale Detected",
                "points": pts,
                "severity": "high",
                "explanation_bn": f"বিক্রেতা {seller_name} এই একই জমি ইতিপূর্বে {sold_before[-1]['buyer']}-এর কাছে বিক্রি করেছেন ({sold_before[-1]['sale_date']})।",
                "explanation_en": f"Seller {seller_name} previously sold this same plot to {sold_before[-1]['buyer']} on {sold_before[-1]['sale_date']}."
            })
            evidence.append(f"পূর্ব বিক্রির দলিল: {sold_before[-1]['deed_no']}, তারিখ: {sold_before[-1]['sale_date']}")

    # Rule 3: Rapid Transfers (<30 days) (+20 pts)
    if len(history_sales) >= 2:
        try:
            d1 = date.fromisoformat(history_sales[-1]["sale_date"])
            d2 = date.fromisoformat(history_sales[-2]["sale_date"])
            gap = abs((d1 - d2).days)
            if gap < 30:
                pts = 20
                score += pts
                indicators.append({
                    "code": "RAPID_TRANSFER_ANOMALY",
                    "title_bn": "সন্দেহজনক দ্রুত মালিকানা বদল",
                    "title_en": "Suspicious Rapid Ownership Transfer",
                    "points": pts,
                    "severity": "medium",
                    "explanation_bn": f"মাত্র {gap} দিনের ব্যবধানে জমিটি একাধিকবার হাতবদল হয়েছে, যা জবরদখল বা বেনামী হস্তান্তরের সম্ভাব্য লক্ষণ।",
                    "explanation_en": f"Land was transferred multiple times within only {gap} days, indicating potential flipping or dispute."
                })
                evidence.append(f"আগের হস্তান্তর ব্যবধান: মাত্র {gap} দিন ({history_sales[-2]['sale_date']} ও {history_sales[-1]['sale_date']})")
        except Exception:
            pass

    # Graph observations use only completed deed rows for this exact parcel.
    transfers_payload = [{
        "seller": row.get("seller_name") or "",
        "buyer": row.get("buyer_name") or "",
        "division": row.get("division") or "",
        "division_id": row.get("division_id"),
        "district": row.get("district") or district,
        "upazila": row.get("upazila") or upazila,
        "mouza": row.get("mouza") or mouza,
        "plot_id": row.get("plot_id") or plot_no,
        "sale_date": row.get("reg_date") or "",
        "deed_no": row.get("deed_no") or "",
        "transfer_id": f"deeds:{row.get('id')}",
    } for row in matching_deeds]
    graph_fraud_res = cpp_bridge.detect_fraud_graph(transfers_payload) if cpp_bridge else {
        "error": "C++/Python graph bridge unavailable", "anomalies": [],
    }
    for anomaly in graph_fraud_res.get("anomalies", []):
        refs = anomaly.get("evidence_refs", [])
        explanation = anomaly.get("explanation", "Recorded deed sequence needs review.")
        indicators.append({
            "code": anomaly.get("type", "PARCEL_HISTORY_OBSERVATION"),
            "title_bn": "দলিলের ধারাবাহিকতা হাতে পর্যালোচনা করুন",
            "title_en": "Review the recorded deed sequence",
            "points": 0,
            "severity": "review",
            "explanation_bn": "দলিলের রেকর্ডে ধারাবাহিকতা-সংক্রান্ত সংকেত আছে; মূল দলিল হাতে মিলিয়ে দেখুন।",
            "explanation_en": explanation,
            "evidence_refs": refs,
            "source": "application_database.deeds",
            "risk_points": 0,
        })
        evidence.extend(ref for ref in refs if ref not in evidence)

    # Rule 4: Proposed Area Exceeds Recorded Area (+30 pts)
    rec_a = prop["area"] if prop else (recorded_area or 0)
    if rec_a > 0 and proposed_area > rec_a:
        pts = 30
        score += pts
        diff = round(proposed_area - rec_a, 2)
        indicators.append({
            "code": "EXCESS_AREA_PROPOSED",
            "title_bn": "অতিরিক্ত জমি বিক্রির চেষ্টা (ঘাটতি)",
            "title_en": "Proposed Area Exceeds Registered Parcel Area",
            "points": pts,
            "severity": "high",
            "explanation_bn": f"রেকর্ড অনুযায়ী জমিতে মোট অংশ {rec_a} শতক, কিন্তু বিক্রির জন্য প্রস্তাব করা হয়েছে {proposed_area} শতক (অতিরিক্ত {diff} শতক)।",
            "explanation_en": f"Recorded area is {rec_a} shotok, but seller is offering {proposed_area} shotok (excess {diff} shotok)."
        })
        evidence.append(f"রেকর্ডকৃত পরিমাণ: {rec_a} শতক | প্রস্তাবিত বিক্রির পরিমাণ: {proposed_area} শতক")

    # Rule 5: Missing Essential Documents (+25 pts)
    required_docs = ["মূল বালাম দলিল", "সর্বশেষ খতিয়ান (RS/BS)", "নামজারি ও জমাভাগ খতিয়ান", "হালনাগাদ দাখিলা/খাজনা রশিদ"]
    missing_docs = [rd for rd in required_docs if not any(rd.lower() in d.lower() for d in documents_held)]
    if len(missing_docs) >= 2:
        pts = 25
        score += pts
        indicators.append({
            "code": "MISSING_ESSENTIAL_DOCS",
            "title_bn": "গুরুত্বপূর্ণ দলিলের ঘাটতি",
            "title_en": "Missing Essential Ownership Documents",
            "points": pts,
            "severity": "medium",
            "explanation_bn": f"বিক্রেতার কাছে অত্যাবশ্যকীয় কাগজপত্র নেই: {', '.join(missing_docs)}।",
            "explanation_en": f"Key supporting documents not provided: {', '.join(missing_docs)}."
        })
        evidence.append(f"অনুপস্থিত দলিলপত্র: {', '.join(missing_docs)}")

    # Rule 6: Government Acquisition or Court Dispute (+50 pts)
    if has_court_dispute or (prop and prop["status"] in ["disputed", "acquired"]):
        pts = 50
        score += pts
        status_text = "সরকারি অধিগ্রহণাধীন জমি" if (prop and prop["status"] == "acquired") else "দেওয়ানি আদালতের স্বত্ব বিরোধ"
        indicators.append({
            "code": "ACQUISITION_OR_COURT_NOTICE",
            "title_bn": f"গুরুতর আইনি নিষেধাজ্ঞা: {status_text}",
            "title_en": "Legal Injunction or Government Acquisition",
            "points": pts,
            "severity": "high",
            "explanation_bn": f"উক্ত দাগে সরকারি নোটিশ বা স্বত্ব মামলার সক্রিয় রেকর্ড চিহ্নিত হয়েছে। জমি কেনা অত্যন্ত ঝুঁকিপূর্ণ।",
            "explanation_en": "Active government acquisition or civil litigation order flagged on this plot."
        })
        evidence.append(f"ভূমি অফিসের স্ট্যাটাস রিপোর্ট: {status_text}")

    # Determine risk level
    score = min(100, score)
    if not prop and not history_sales and not matching_deeds:
        risk_level = "insufficient_data"
        score = max(score, 35)
        indicators.append({
            "code": "INSUFFICIENT_DEMO_DATA",
            "title_bn": "ডেটাবেজে প্লটের তথ্য অপ্রতুল",
            "title_en": "Insufficient Records Found",
            "points": 0,
            "severity": "medium",
            "explanation_bn": f"দাগ নম্বর '{plot_no}' এবং মৌজা '{mouza}'-এর জন্য কোনো পূর্ববর্তী রেকর্ড ডেমো ব্যবস্থায় মেলেনি। সরেজমিন যাচাই অতীব জরুরি।",
            "explanation_en": f"No historical records found for plot '{plot_no}' in mouza '{mouza}'. Ground survey required."
        })
    elif score >= 60:
        risk_level = "high"
    elif score >= 30:
        risk_level = "medium"
    else:
        risk_level = "low"

    recommendations = [
        {"bn": "সহকারী কমিশনার (ভূমি) দপ্তর থেকে আরএস/বিএস খতিয়ান ও সর্বশেষ নামজারি যাচাই করুন।", "en": "Verify RS/BS Khatian and latest mutation order at the AC Land office."},
        {"bn": "সংশ্লিষ্ট সাব-রেজিস্ট্রি অফিসে গিয়ে বিগত ২৫ বছরের তল্লাশ (Search Report) সংগ্রহ করুন।", "en": "Obtain a 25-year title search certificate from the Sub-Registry Office."},
        {"bn": "জমির বাস্তব সীমানা ও দখল (Physical Possession) স্থানীয় প্রতিবেশীদের সাথে সরেজমিন যাচাই করুন।", "en": "Verify actual boundary and physical possession on-site with neighbors."},
        {"bn": "চলতি বাংলা সনের ভূমি উন্নয়ন কর (খাজনা) পরিশোধের দাখিলা ও ডিসিআর রশিদ পরীক্ষা করুন।", "en": "Examine land development tax receipts and DCR for the current fiscal year."},
        {"bn": "রেজিস্ট্রিভুক্ত আইনজীবীর মাধ্যমে চূড়ান্ত স্বত্ব যাচাই ও বায়নানামা সম্পাদন করুন।", "en": "Engage an authorized property lawyer to draft the formal deed contract."}
    ]

    report_ref = f"LG-DD-2026-{secrets.token_hex(3).upper()}"
    now_iso = datetime.now().isoformat()

    with conn() as c:
        c.execute(
            """INSERT INTO due_diligence_reports (
                report_ref, user_id, seller_name, seller_nid, deed_no, reg_year, district, upazila, mouza,
                khatian_no, plot_no, recorded_area, proposed_area, documents_provided,
                risk_score, risk_level, indicators, evidence, recommendations, cpp_graph_analysis, created_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (
                report_ref, user_id, seller_name, seller_nid, deed_no, reg_year, district, upazila, mouza,
                khatian_no, plot_no, rec_a, proposed_area, json.dumps(documents_held, ensure_ascii=False),
                score, risk_level, json.dumps(indicators, ensure_ascii=False),
                json.dumps(evidence, ensure_ascii=False), json.dumps(recommendations, ensure_ascii=False),
                json.dumps(graph_fraud_res, ensure_ascii=False),
                now_iso
            )
        )

    log_audit(user_name, "citizen", "DUE_DILIGENCE_ASSESS", "P5_DUE_DILIGENCE",
              f"Generated due diligence report for Plot {plot_no} (Risk: {risk_level}, Score: {score}, Ref: {report_ref})")

    return {
        "report_ref": report_ref,
        "plot_no": plot_no,
        "mouza": mouza,
        "district": district,
        "seller_name": seller_name,
        "recorded_owner": prop["current_owner"] if prop else (history_sales[-1]["buyer"] if history_sales else "অজানা / অপ্রাপ্ত"),
        "recorded_area": rec_a,
        "proposed_area": proposed_area,
        "risk_score": score,
        "risk_level": risk_level,
        "indicators": indicators,
        "evidence": evidence,
        "recommendations": recommendations,
        "cpp_graph_analysis": graph_fraud_res,
        "anomalies": graph_fraud_res.get("anomalies", []),
        "created_at": now_iso,
        "disclaimer_bn": "গুরুত্বপূর্ণ ঘোষণা: এই মূল্যায়নটি কৃত্রিম ডেমো ডেটাবেজ বিশ্লেষণ করে প্রস্তুত করা হয়েছে। এটি সরকারি ভূমি অফিসের প্রত্যয়ন নয় এবং কোনো চূড়ান্ত আইনি পরামর্শ গঠন করে না।",
        "disclaimer_en": "Important Notice: This assessment is generated against synthetic records for preliminary screening. It does not constitute official legal advice or government title certification."
    }


def get_due_diligence_report(ref: str):
    init()
    with conn() as c:
        row_data = c.execute("SELECT * FROM due_diligence_reports WHERE report_ref = %s", (ref,)).fetchone()
        if not row_data:
            return None
        d = dict(row_data)
        d["seller_nid"] = _mask_nid_value(d.get("seller_nid"))
        d["documents_provided"] = json.loads(d["documents_provided"]) if d["documents_provided"] else []
        d["indicators"] = json.loads(d["indicators"]) if d["indicators"] else []
        d["evidence"] = json.loads(d["evidence"]) if d["evidence"] else []
        d["recommendations"] = json.loads(d["recommendations"]) if d["recommendations"] else []
        d["cpp_graph_analysis"] = json.loads(d["cpp_graph_analysis"]) if d.get("cpp_graph_analysis") else {}
        d["anomalies"] = d["cpp_graph_analysis"].get("anomalies", [])
        return d


def list_due_diligence_reports(limit=20, user_id=None):
    init()
    with conn() as c:
        if user_id is None:
            rows = c.execute("SELECT * FROM due_diligence_reports ORDER BY id DESC LIMIT %s", (limit,)).fetchall()
        else:
            rows = c.execute("SELECT * FROM due_diligence_reports WHERE user_id = %s ORDER BY id DESC LIMIT %s", (user_id, limit)).fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d["seller_nid"] = _mask_nid_value(d.get("seller_nid"))
            d["indicators"] = json.loads(d["indicators"]) if d["indicators"] else []
            result.append(d)
        return result


# =====================================================================
# PROPERTIES & PARCELS
# =====================================================================

def get_all_properties(limit=50):
    init()
    with conn() as c:
        rows = c.execute("SELECT * FROM properties ORDER BY id ASC LIMIT %s", (limit,)).fetchall()
        return [dict(r) for r in rows]


def get_property_by_plot(plot_id: str):
    init()
    with conn() as c:
        p = c.execute("SELECT * FROM properties WHERE LOWER(plot_id) = LOWER(%s)", (plot_id,)).fetchone()
        if not p:
            return None
        d = dict(p)
        # Fetch related deeds & sales
        d["deeds"] = [dict(r) for r in c.execute("SELECT * FROM deeds WHERE COALESCE(is_verified,1)<>0 AND LOWER(plot_id) = LOWER(%s) ORDER BY reg_year DESC", (plot_id,)).fetchall()]
        d["sales"] = [row(r) for r in c.execute("SELECT * FROM records WHERE LOWER(plot_id) = LOWER(%s) ORDER BY sale_date DESC", (plot_id,)).fetchall()]
        return d


# =====================================================================
# UNIFIED DASHBOARD STATS
# =====================================================================

def dashboard_stats():
    init()
    with conn() as c:
        total_props = c.execute("SELECT COUNT(*) n FROM properties").fetchone()["n"]
        total_deeds = c.execute("SELECT COUNT(*) n FROM deeds WHERE COALESCE(is_verified,1)<>0").fetchone()["n"]
        total_verifications = c.execute("SELECT COUNT(*) n FROM deed_verifications").fetchone()["n"]

        m_stats = {status: 0 for status in VALID_MUTATION_STATUSES}
        mutation_total = 0
        for row in c.execute("SELECT status, COUNT(*) n FROM mutation_applications GROUP BY status"):
            m_stats[row["status"]] = row["n"]
            mutation_total += row["n"]
        m_stats["total"] = mutation_total
        m_stats["pending"] = sum(
            m_stats[status]
            for status in [
                "Submitted",
                "Initial Review",
                "Document Verification",
                "Additional Information Required",
                "Decision Pending",
            ]
        )

        r_stats = {"total": 0, "high": 0, "medium": 0, "low": 0}
        for row in c.execute("SELECT risk_level, COUNT(*) n FROM records GROUP BY risk_level"):
            r_stats[row["risk_level"]] = row["n"]
            r_stats["total"] += row["n"]

        dd_high = c.execute("SELECT COUNT(*) n FROM due_diligence_reports WHERE risk_level = 'high'").fetchone()["n"]
        dd_medium = c.execute("SELECT COUNT(*) n FROM due_diligence_reports WHERE risk_level = 'medium'").fetchone()["n"]
        total_dd = c.execute("SELECT COUNT(*) n FROM due_diligence_reports").fetchone()["n"]

        recent_activity = c.execute("SELECT * FROM audit_logs ORDER BY id DESC LIMIT 8").fetchall()

        return {
            "total_properties": total_props,
            "total_deeds": total_deeds,
            "total_verifications": total_verifications,
            "mutation_stats": m_stats,
            "record_risk_stats": r_stats,
            "due_diligence_stats": {
                "total": total_dd,
                "high": dd_high,
                "medium": dd_medium
            },
            "recent_activity": [dict(a) for a in recent_activity]
        }


# =====================================================================
# LEGACY DETECTION ENGINE (PRESERVED 100% FOR COMPATIBILITY)
# =====================================================================

_model = None


def ml_score(ppd, gap_days, n_prev):
    """IsolationForest trained on synthetic 'normal' sales. Returns 0..30."""
    global _model
    try:
        import numpy as np
        from sklearn.ensemble import IsolationForest
    except ImportError:
        return 0
    if _model is None:
        rng = np.random.default_rng(42)
        X = np.c_[rng.normal(500000, 120000, 500), rng.uniform(0, 3000, 500), rng.integers(0, 4, 500)]
        _model = IsolationForest(random_state=42, contamination=0.05).fit(X)
    s = -_model.score_samples([[ppd, gap_days, n_prev]])[0]
    return max(0, min(30, int((s - 0.45) * 150)))


def analyze(c, r):
    prev = c.execute("SELECT * FROM records WHERE plot_id=%s ORDER BY sale_date,id", (r["plot_id"],)).fetchall()
    flags, score = [], 0

    def add(code, pts, msg):
        nonlocal score
        flags.append({"code": code, "points": pts, "msg": msg})
        score += pts

    if c.execute("SELECT 1 FROM records WHERE deed_no=%s", (r["deed_no"],)).fetchone():
        add("DUPLICATE_DEED", 50, f"দলিল নম্বর {r['deed_no']} আগেই নিবন্ধিত হয়েছে")
    gap = 1500
    if prev:
        last = prev[-1]
        if last["buyer"] != r["seller"]:
            add("OWNERSHIP_CONFLICT", 40, f"রেকর্ড অনুযায়ী বর্তমান মালিক {last['buyer']}, কিন্তু বিক্রেতা {r['seller']}")
        sold = [p for p in prev if p["seller"] == r["seller"] and p["buyer"] != r["buyer"]]
        if sold:
            add("DUPLICATE_SALE", 45, f"{r['seller']} এই জমি আগেই {sold[-1]['buyer']}-কে বিক্রি করেছেন ({sold[-1]['sale_date']})")
        gap = max(0, (r["sale_date"] - date.fromisoformat(last["sale_date"])).days)
        if gap < 30:
            add("RAPID_TRANSFER", 15, f"আগের হস্তান্তরের মাত্র {gap} দিনের মধ্যে আবার হস্তান্তর")
    ppd = r["price"] / max(r["area"], 0.01)
    ref = [p["price"] / max(p["area"], 0.01) for p in prev] or [
        x["price"] / max(x["area"], 0.01) for x in c.execute("SELECT price,area FROM records").fetchall()]
    if ref:
        med = sorted(ref)[len(ref) // 2]
        if ppd > 3 * med or ppd < med / 3:
            add("PRICE_ANOMALY", 20, f"শতক প্রতি দাম {ppd:,.0f} টাকা, স্বাভাবিক মানের ({med:,.0f}) তুলনায় অস্বাভাবিক")
    m = ml_score(ppd, gap, len(prev))
    if m >= 15:
        add("ML_ANOMALY", m, "ML মডেল (Isolation Forest) লেনদেনের ধরনটিকে অস্বাভাবিক চিহ্নিত করেছে")
    score = min(100, score)
    level = "high" if score >= 60 else "medium" if score >= 30 else "low"
    return score, level, flags


def explain(level, flags):
    if not flags:
        return "কোনো সন্দেহজনক নমুনা পাওয়া যায়নি। মালিকানার ধারাবাহিকতা ও দাম স্বাভাবিক।"
    head = {"high": "উচ্চ ঝুঁকি: নিবন্ধনের আগে সরেজমিন যাচাই প্রয়োজন।",
            "medium": "মাঝারি ঝুঁকি: অতিরিক্ত কাগজপত্র যাচাই করা উচিত।",
            "low": "নিম্ন ঝুঁকি: সামান্য অসঙ্গতি আছে, তবে বড় সমস্যা নেই।"}[level]
    return head + " কারণ: " + "; ".join(f["msg"] for f in flags) + "।"


def row(x):
    d = dict(x)
    d["flags"] = json.loads(d["flags"])
    return d


def get(c, rid):
    x = c.execute("SELECT * FROM records WHERE id=%s", (rid,)).fetchone()
    return row(x) if x else None


def save(r):
    init()
    with conn() as c:
        score, level, flags = analyze(c, r)
        cur = c.execute(
            "INSERT INTO records(deed_no,plot_id,seller,buyer,sale_date,price,area,risk_score,risk_level,flags,explanation)"
            " VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id",
            (r["deed_no"], r["plot_id"], r["seller"], r["buyer"], r["sale_date"].isoformat(), r["price"], r["area"],
             score, level, json.dumps(flags, ensure_ascii=False), explain(level, flags)))
        return get(c, cur.fetchone()["id"])


def listing():
    init()
    with conn() as c:
        return [row(x) for x in c.execute("SELECT * FROM records ORDER BY id DESC")]


def history(plot_id):
    init()
    with conn() as c:
        return [row(x) for x in c.execute("SELECT * FROM records WHERE plot_id=%s ORDER BY sale_date,id", (plot_id,))]


def stats():
    init()
    with conn() as c:
        out = {"total": 0, "high": 0, "medium": 0, "low": 0}
        for x in c.execute("SELECT risk_level, COUNT(*) n FROM records GROUP BY risk_level"):
            out[x["risk_level"]] = x["n"]
            out["total"] += x["n"]
        return out


# =====================================================================
# SEED DATA & RESET
# =====================================================================

DEMO = [  # (deed, plot, seller, buyer, date, price, area in shotok) - all dummy
    ("D-1001", "DHK-MIR-001", "রহিম উদ্দিন", "করিম হোসেন", "2025-01-10", 2400000, 5),
    ("D-1002", "DHK-MIR-001", "করিম হোসেন", "সালমা বেগম", "2025-08-02", 2900000, 5),
    ("D-1003", "DHK-MIR-001", "করিম হোসেন", "জাহিদ হাসান", "2025-09-15", 3000000, 5),
    ("D-1004", "CTG-PAH-007", "নূর আলম", "আবুল কালাম", "2024-11-05", 1500000, 3),
    ("D-1005", "CTG-PAH-007", "রফিক মিয়া", "শাহিন আলম", "2025-06-20", 1600000, 3),
    ("D-1006", "RAJ-BOA-014", "মিনা খাতুন", "তানভীর আহমেদ", "2025-03-03", 900000, 2),
    ("D-1006", "RAJ-BOA-020", "তানভীর আহমেদ", "ফারুক হোসেন", "2025-03-20", 950000, 2),
    ("D-1008", "RAJ-BOA-014", "তানভীর আহমেদ", "নাজমা আক্তার", "2025-03-12", 90000000, 2),
    ("D-1009", "SYL-ZIN-003", "হাবিবুর রহমান", "রুবেল মিয়া", "2025-02-14", 1200000, 4),
    ("D-1010", "SYL-ZIN-003", "রুবেল মিয়া", "সুমন দাস", "2025-05-30", 1350000, 4),
]

# The former parcel rows were synthetic and have been removed to avoid
# presenting fabricated ownership data as real land records.
DEMO_PROPERTIES = []

DEMO_DEEDS = [
    ("D-1001", 2025, "ঢাকা", "মিরপুর", "পাইকপাড়া", "DHK-MIR-001", "BS-1045", "রহিম উদ্দিন", "করিম হোসেন", 5.0, 2400000, "মিরপুর সাব-রেজিস্ট্রি অফিস", "2025-01-10"),
    ("D-1002", 2025, "ঢাকা", "মিরপুর", "পাইকপাড়া", "DHK-MIR-001", "BS-1045", "করিম হোসেন", "সালমা বেগম", 5.0, 2900000, "মিরপুর সাব-রেজিস্ট্রি অফিস", "2025-08-02"),
    ("D-1003", 2025, "ঢাকা", "মিরপুর", "পাইকপাড়া", "DHK-MIR-001", "BS-1045", "করিম হোসেন", "জাহিদ হাসান", 5.0, 3000000, "মিরপুর সাব-রেজিস্ট্রি অফিস", "2025-09-15"),
    ("D-1004", 2024, "চট্টগ্রাম", "পাহাড়তলী", "পাহাড়তলী", "CTG-PAH-007", "RS-822", "নূর আলম", "আবুল কালাম", 3.0, 1500000, "পাহাড়তলী সাব-রেজিস্ট্রি অফিস", "2024-11-05"),
    ("D-1005", 2025, "চট্টগ্রাম", "পাহাড়তলী", "পাহাড়তলী", "CTG-PAH-007", "RS-822", "রফিক মিয়া", "শাহিন আলম", 3.0, 1600000, "পাহাড়তলী সাব-রেজিস্ট্রি অফিস", "2025-06-20"),
    ("D-1006", 2025, "রাজশাহী", "বোয়ালিয়া", "রামচন্দ্রপুর", "RAJ-BOA-014", "CS-409", "মিনা খাতুন", "তানভীর আহমেদ", 2.0, 900000, "বোয়ালিয়া সাব-রেজিস্ট্রি অফিস", "2025-03-03"),
    ("D-1008", 2025, "রাজশাহী", "বোয়ালিয়া", "রামচন্দ্রপুর", "RAJ-BOA-014", "CS-409", "তানভীর আহমেদ", "নাজমা আক্তার", 2.0, 90000000, "বোয়ালিয়া সাব-রেজিস্ট্রি অফিস", "2025-03-12"),
    ("D-1009", 2025, "সিলেট", "জিন্দাবাজার", "লামাবাজার", "SYL-ZIN-003", "BS-2104", "হাবিবুর রহমান", "রুবেল মিয়া", 4.0, 1200000, "সদর সাব-রেজিস্ট্রি অফিস", "2025-02-14"),
    ("D-1010", 2025, "সিলেট", "জিন্দাবাজার", "লামাবাজার", "SYL-ZIN-003", "BS-2104", "রুবেল মিয়া", "সুমন দাস", 4.0, 1350000, "সদর সাব-রেজিস্ট্রি অফিস", "2025-05-30"),
    ("D-8492", 2023, "ঢাকা", "মিরপুর", "পাইকপাড়া", "DHK-MIR-002", "BS-1046", "মোস্তাফিজুর রহমান", "মোহাম্মদ রফিক", 6.5, 3800000, "মিরপুর সাব-রেজিস্ট্রি অফিস", "2023-04-18"),
]

DEMO_MUTATIONS = [
    {
        "tracking_no": "MUT-2026-DHK-4821",
        "applicant_name": "মোঃ রফিকুল ইসলাম",
        "applicant_nid": "19902692518000123",
        "applicant_phone": "01711002233",
        "applicant_address": "বাড়ি-১২, রোড-৪, মিরপুর-১, ঢাকা",
        "district": "ঢাকা",
        "upazila": "মিরপুর",
        "mouza": "পাইকপাড়া",
        "jl_no": "১০২",
        "khatian_type": "BS",
        "khatian_no": "BS-1046",
        "plot_no": "DHK-MIR-002",
        "land_area": 6.5,
        "land_class": "বাড়ি (Homestead)",
        "ownership_source": "ক্রয়সূত্রে (Purchase)",
        "deed_no": "D-8492",
        "deed_date": "2023-04-18",
        "supporting_docs": ["মূল সাফা কবলা দলিল D-8492", "হালনাগাদ দাখিলা", "জাতীয় পরিচয়পত্র কপি"],
        "status": "Document Verification",
        "review_notes": "কাগজপত্র ও মূল বালাম যাচাই চলছে। সার্ভেয়ার রিপোর্ট সন্তোষজনক।"
    },
    {
        "tracking_no": "MUT-2026-CTG-1904",
        "applicant_name": "শাহিন আলম",
        "applicant_nid": "19821592518000999",
        "applicant_phone": "01815554433",
        "applicant_address": "পাহাড়তলী বাজার রোড, চট্টগ্রাম",
        "district": "চট্টগ্রাম",
        "upazila": "পাহাড়তলী",
        "mouza": "পাহাড়তলী",
        "jl_no": "৪৫",
        "khatian_type": "RS",
        "khatian_no": "RS-822",
        "plot_no": "CTG-PAH-007",
        "land_area": 3.0,
        "land_class": "নাল (Nal)",
        "ownership_source": "ক্রয়সূত্রে (Purchase)",
        "deed_no": "D-1005",
        "deed_date": "2025-06-20",
        "supporting_docs": ["কবলা দলিল D-1005", "ওয়ারিশান সনদ", "ডিসিআর রশিদ"],
        "status": "Approved",
        "review_notes": "সমস্ত কাগজপত্র সঠিক পাওয়া গিয়েছে। ডেমো সিস্টেমে নামজারি ও জমাভাগ মঞ্জুর করা হলো।"
    },
    {
        "tracking_no": "MUT-2026-DHK-9012",
        "applicant_name": "জাহিদ হাসান",
        "applicant_nid": "19942692518000555",
        "applicant_phone": "01612223344",
        "applicant_address": "মিরপুর-২, ঢাকা",
        "district": "ঢাকা",
        "upazila": "মিরপুর",
        "mouza": "পাইকপাড়া",
        "jl_no": "১০২",
        "khatian_type": "BS",
        "khatian_no": "BS-1045",
        "plot_no": "DHK-MIR-001",
        "land_area": 5.0,
        "land_class": "বাণিজ্যিক (Commercial)",
        "ownership_source": "ক্রয়সূত্রে (Purchase)",
        "deed_no": "D-1003",
        "deed_date": "2025-09-15",
        "supporting_docs": ["দলিল D-1003"],
        "status": "Additional Information Required",
        "review_notes": "উক্ত প্লট DHK-MIR-001 ইতিপূর্বে সালমা বেগমের নামে বিক্রির রেকর্ড আছে। মূল বালাম তল্লাশ ও যৌথ শুনানির নোটিশ জারি করা হলো।"
    }
]


def seed():
    init()
    now_iso = datetime.now().isoformat()
    # Never erase existing production data. Seed demo data only in an empty database.
    with conn() as c:
        has_data = c.execute(
            """
            SELECT
                EXISTS (SELECT 1 FROM records)
                OR EXISTS (SELECT 1 FROM users)
                OR EXISTS (SELECT 1 FROM properties)
                OR EXISTS (SELECT 1 FROM deeds)
                OR EXISTS (SELECT 1 FROM deed_verifications)
                OR EXISTS (SELECT 1 FROM mutation_applications)
                OR EXISTS (SELECT 1 FROM due_diligence_reports)
                OR EXISTS (SELECT 1 FROM mutation_status_history)
                OR EXISTS (SELECT 1 FROM audit_logs)
                OR EXISTS (SELECT 1 FROM notifications)
                AS has_data
            """
        ).fetchone()["has_data"]

    if has_data:
        return stats()

    # 1. Seed legacy records
    for d in DEMO:
        save(dict(deed_no=d[0], plot_id=d[1], seller=d[2], buyer=d[3],
                  sale_date=date.fromisoformat(d[4]), price=d[5], area=d[6]))

    # User accounts are provisioned through registration or trusted admin tooling.

    # 3. Seed Properties
    with conn() as c:
        for p in DEMO_PROPERTIES:
            c.execute(
                """INSERT INTO properties (plot_id, district, upazila, mouza, jl_no, khatian_no, khatian_type, area, current_owner, status, notes, created_at)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                (p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7], p[8], p[9], p[10], now_iso)
            )

    # 4. Seed Deeds
    with conn() as c:
        for d in DEMO_DEEDS:
            c.execute(
                """INSERT INTO deeds (deed_no, reg_year, district, upazila, mouza, plot_id, khatian_no, seller_name, buyer_name, area, price, sub_registry_office, reg_date, is_verified, raw_text, created_at)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 1, %s, %s)""",
                (d[0], d[1], d[2], d[3], d[4], d[5], d[6], d[7], d[8], d[9], d[10], d[11], d[12], f"সাব-রেজিস্ট্রি দলিল {d[0]}/{d[1]}", now_iso)
            )

    # 5. Seed Mutation Applications
    cit_id = None
    with conn() as c:
        for m in DEMO_MUTATIONS:
            cur = c.execute(
                """INSERT INTO mutation_applications (
                    tracking_no, user_id, applicant_name, applicant_nid, applicant_phone, applicant_address,
                    applicant_relation, district, upazila, mouza, jl_no, khatian_type, khatian_no,
                    plot_no, land_area, land_class, ownership_source, deed_no, deed_date,
                    supporting_docs, status, review_notes, rejection_reason, created_at, updated_at
                ) VALUES (%s, %s, %s, %s, %s, %s, 'Self', %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, '', %s, %s) RETURNING id""",
                (
                    m["tracking_no"], cit_id, m["applicant_name"], m["applicant_nid"], m["applicant_phone"], m["applicant_address"],
                    m["district"], m["upazila"], m["mouza"], m["jl_no"], m["khatian_type"], m["khatian_no"],
                    m["plot_no"], m["land_area"], m["land_class"], m["ownership_source"], m["deed_no"], m["deed_date"],
                    json.dumps(m["supporting_docs"], ensure_ascii=False), m["status"], m["review_notes"], now_iso, now_iso
                )
            )
            app_id = cur.fetchone()["id"]
            c.execute(
                """INSERT INTO mutation_status_history (
                    application_id, tracking_no, from_status, to_status, changed_by_name, changed_by_role, remarks, created_at
                ) VALUES (%s, %s, 'Submitted', %s, 'বেগম ফরিদা পারভীন, সহকারী কমিশনার (ভূমি)', 'officer', %s, %s)""",
                (app_id, m["tracking_no"], m["status"], m["review_notes"], now_iso)
            )

    # 6. Seed sample Verifications
    verify_deed({
        "deed_no": "D-1001",
        "reg_year": 2025,
        "district": "ঢাকা",
        "upazila": "মিরপুর",
        "mouza": "পাইকপাড়া",
        "plot_id": "DHK-MIR-001",
        "khatian_no": "BS-1045",
        "owner_name": "করিম হোসেন"
    }, user_id=cit_id, user_name="মোঃ রফিকুল ইসলাম")

    verify_deed({
        "deed_no": "D-1002",
        "reg_year": 2025,
        "district": "ঢাকা",
        "upazila": "মিরপুর",
        "mouza": "পাইকপাড়া",
        "plot_id": "DHK-MIR-001",
        "khatian_no": "BS-1045",
        "owner_name": "সালমা বেগম"
    }, user_id=cit_id, user_name="মোঃ রফিকুল ইসলাম")

    # 7. Seed sample Due Diligence
    assess_due_diligence({
        "seller_name": "করিম হোসেন",
        "seller_nid": "19752692518000999",
        "deed_no": "D-1002",
        "reg_year": 2025,
        "district": "ঢাকা",
        "upazila": "মিরপুর",
        "mouza": "পাইকপাড়া",
        "khatian_no": "BS-1045",
        "plot_no": "DHK-MIR-001",
        "recorded_area": 5.0,
        "proposed_area": 5.0,
        "documents_held": ["মূল সাফা কবলা দলিল", "সর্বশেষ খতিয়ান (RS/BS)"],
        "has_court_dispute": True
    }, user_id=cit_id, user_name="মোঃ রফিকুল ইসলাম")

    # 8. Notifications
    add_notification(
        cit_id, "citizen",
        "ল্যান্ডগার্ড এআই-তে স্বাগতম!",
        "Welcome to LandGuard AI!",
        "আপনার জমির দলিল ও মালিকানা যাচাই করতে 'দলিল যাচাই' মেনু ব্যবহার করুন।",
        "Use the 'Verify Deed' menu to verify property deeds and ownership chain.",
        "info", "/verify-deed"
    )

    return stats()
if __name__ == "__main__":
    print("LandGuard Engine Started")

    init()

    print("Database initialized successfully!")
    print(stats())
