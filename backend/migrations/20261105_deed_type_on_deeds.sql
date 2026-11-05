-- Store the deed-type code on the deed record itself.
-- Existing rows stay NULL until their deed type is sourced and entered.
BEGIN;

ALTER TABLE deeds
    ADD COLUMN IF NOT EXISTS deed_type TEXT;

COMMIT;
