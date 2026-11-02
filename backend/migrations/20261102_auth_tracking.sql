-- Bhumisetu authentication migration (executed transactionally on 2026-11-02).
-- Existing account, property, deed, application, audit, and OTP-related data is untouched.

BEGIN;

-- Add optional account update metadata without rewriting any existing user row.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS updated_at TEXT;

-- Persist account-specific login failures independently from both recovery features.
CREATE TABLE IF NOT EXISTS login_attempt_lockouts (
    user_id INTEGER PRIMARY KEY,
    failed_attempt_count INTEGER NOT NULL DEFAULT 0
        CHECK (failed_attempt_count >= 0),
    locked_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT login_attempt_lockouts_user_fk
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_login_attempt_lockouts_locked_until
    ON login_attempt_lockouts (locked_until)
    WHERE locked_until IS NOT NULL;

-- Registration already normalizes new email addresses, but the existing unique
-- email constraint is case-sensitive. Preflight found no case-insensitive duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower_unique
    ON users (LOWER(BTRIM(email)));

-- The existing NID index does not translate Bengali/Arabic numerals. Add a
-- canonical digits-only index; preflight found no normalized duplicate groups.
-- One legacy NID has 12 digits; it is preserved and is not format-constrained here.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_nid_canonical_digits_unique
    ON users ((regexp_replace(
        translate(COALESCE(nid, ''),
            '০১২৩৪৫৬৭৮৯٠١٢٣٤٥٦٧٨٩',
            '01234567890123456789'),
        '[^0-9]', '', 'g')))
    WHERE NULLIF(regexp_replace(
        translate(COALESCE(nid, ''),
            '০১২৩৪৫৬৭৮৯٠١٢٣٤٥٦٧٨٩',
            '01234567890123456789'),
        '[^0-9]', '', 'g'), '') IS NOT NULL;

COMMIT;
