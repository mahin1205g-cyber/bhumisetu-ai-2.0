-- DGHS GeoCodes supplies canonical English district labels. Bengali labels may
-- be added from an authoritative translation source when one is available.
BEGIN;

ALTER TABLE districts
    ALTER COLUMN name_bn DROP NOT NULL;

COMMIT;
