-- Official DGHS GeoCodes publish Upazila/Thana names in English only.
-- Keep the Bengali label nullable rather than inventing transliterations.
BEGIN;

ALTER TABLE upazilas
    ALTER COLUMN name_bn DROP NOT NULL;

ALTER TABLE police_thanas
    ALTER COLUMN name_bn DROP NOT NULL;

COMMIT;
