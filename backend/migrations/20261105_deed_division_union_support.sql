-- Store verified Division and optional Union/Ward on deed records and submissions.
-- Additive and idempotent: existing deed data is retained; only missing Division
-- references are backfilled from the already stored district name.
BEGIN;

ALTER TABLE deeds
    ADD COLUMN IF NOT EXISTS division TEXT,
    ADD COLUMN IF NOT EXISTS division_id BIGINT,
    ADD COLUMN IF NOT EXISTS union_id BIGINT,
    ADD COLUMN IF NOT EXISTS union_ward TEXT;

ALTER TABLE deed_verifications
    ADD COLUMN IF NOT EXISTS division TEXT,
    ADD COLUMN IF NOT EXISTS division_id BIGINT,
    ADD COLUMN IF NOT EXISTS union_id BIGINT,
    ADD COLUMN IF NOT EXISTS union_ward TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'deeds_division_id_fk' AND conrelid = 'deeds'::regclass
    ) THEN
        ALTER TABLE deeds ADD CONSTRAINT deeds_division_id_fk
            FOREIGN KEY (division_id) REFERENCES divisions(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'deeds_union_id_fk' AND conrelid = 'deeds'::regclass
    ) THEN
        ALTER TABLE deeds ADD CONSTRAINT deeds_union_id_fk
            FOREIGN KEY (union_id) REFERENCES admin_unions(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'deed_verifications_division_id_fk' AND conrelid = 'deed_verifications'::regclass
    ) THEN
        ALTER TABLE deed_verifications ADD CONSTRAINT deed_verifications_division_id_fk
            FOREIGN KEY (division_id) REFERENCES divisions(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'deed_verifications_union_id_fkey' AND conrelid = 'deed_verifications'::regclass
    ) THEN
        ALTER TABLE deed_verifications ADD CONSTRAINT deed_verifications_union_id_fkey
            FOREIGN KEY (union_id) REFERENCES admin_unions(id) ON DELETE SET NULL;
    END IF;
END $$;

UPDATE deeds AS deed
SET division_id = district.division_id,
    division = COALESCE(NULLIF(BTRIM(deed.division), ''), division.name_bn, division.name_en)
FROM districts AS district
JOIN divisions AS division ON division.id = district.division_id
WHERE deed.division_id IS NULL
  AND (
      LOWER(BTRIM(deed.district)) = LOWER(BTRIM(COALESCE(district.name_bn, '')))
      OR LOWER(BTRIM(deed.district)) = LOWER(BTRIM(COALESCE(district.name_en, '')))
      OR LOWER(BTRIM(district.name_en)) = LOWER(BTRIM(CASE BTRIM(deed.district)
          WHEN 'ঢাকা' THEN 'Dhaka'
          WHEN 'চট্টগ্রাম' THEN 'Chattogram'
          WHEN 'রাজশাহী' THEN 'Rajshahi'
          WHEN 'সিলেট' THEN 'Sylhet'
          ELSE ''
      END))
  );

UPDATE deed_verifications AS verification
SET division_id = district.division_id,
    division = COALESCE(NULLIF(BTRIM(verification.division), ''), division.name_bn, division.name_en)
FROM districts AS district
JOIN divisions AS division ON division.id = district.division_id
WHERE verification.division_id IS NULL
  AND (
      LOWER(BTRIM(verification.district)) = LOWER(BTRIM(COALESCE(district.name_bn, '')))
      OR LOWER(BTRIM(verification.district)) = LOWER(BTRIM(COALESCE(district.name_en, '')))
      OR LOWER(BTRIM(district.name_en)) = LOWER(BTRIM(CASE BTRIM(verification.district)
          WHEN 'ঢাকা' THEN 'Dhaka'
          WHEN 'চট্টগ্রাম' THEN 'Chattogram'
          WHEN 'রাজশাহী' THEN 'Rajshahi'
          WHEN 'সিলেট' THEN 'Sylhet'
          ELSE ''
      END))
  );

CREATE INDEX IF NOT EXISTS idx_deeds_division_id ON deeds (division_id);
CREATE INDEX IF NOT EXISTS idx_deeds_union_id ON deeds (union_id);
CREATE INDEX IF NOT EXISTS idx_deed_verifications_division_id ON deed_verifications (division_id);
CREATE INDEX IF NOT EXISTS idx_deed_verifications_union_id ON deed_verifications (union_id);

COMMIT;
