-- Officially grounded deed type options and additive verification fields.
BEGIN;

CREATE TABLE IF NOT EXISTS deed_types (
    code TEXT PRIMARY KEY,
    name_bn TEXT NOT NULL,
    name_en TEXT NOT NULL,
    official_source TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO deed_types (code, name_bn, name_en, official_source, sort_order, is_active) VALUES
    ('sale', 'বিক্রয় / হস্তান্তর দলিল', 'Sale / conveyance deed', 'https://bdlaws.minlaw.gov.bd/act-print-48.html', 10, TRUE),
    ('contract_for_sale', 'বায়নাপত্র / বিক্রয় চুক্তি', 'Contract for sale', 'https://bdlaws.minlaw.gov.bd/act-print-48.html', 20, TRUE),
    ('gift', 'দানপত্র', 'Gift deed', 'https://bdlaws.minlaw.gov.bd/act-print-90.html', 30, TRUE),
    ('heba', 'হেবা / হেবা ঘোষণা', 'Heba declaration', 'https://bdlaws.minlaw.gov.bd/act-print-90.html', 40, TRUE),
    ('mortgage', 'বন্ধক দলিল', 'Mortgage deed', 'https://bdlaws.minlaw.gov.bd/act-print-90.html', 50, TRUE),
    ('partition', 'বণ্টননামা', 'Partition deed', 'https://bdlaws.minlaw.gov.bd/act-print-90.html', 60, TRUE),
    ('lease', 'ইজারা / লিজ দলিল', 'Lease deed', 'https://bdlaws.minlaw.gov.bd/act-print-90.html', 70, TRUE),
    ('power_of_attorney', 'আমমোক্তারনামা', 'Power of attorney', 'https://rd.gov.bd/pages/forms', 80, TRUE),
    ('other', 'অন্যান্য', 'Other', 'https://rd.gov.bd/pages/forms', 90, TRUE)
ON CONFLICT (code) DO UPDATE SET
    name_bn = EXCLUDED.name_bn,
    name_en = EXCLUDED.name_en,
    official_source = EXCLUDED.official_source,
    sort_order = EXCLUDED.sort_order,
    is_active = TRUE;

ALTER TABLE deed_verifications ADD COLUMN IF NOT EXISTS deed_type TEXT;
ALTER TABLE deed_verifications ADD COLUMN IF NOT EXISTS buyer_name TEXT;
ALTER TABLE deed_verifications ADD COLUMN IF NOT EXISTS seller_name TEXT;
CREATE INDEX IF NOT EXISTS idx_deed_verifications_deed_type ON deed_verifications (deed_type);

COMMIT;
