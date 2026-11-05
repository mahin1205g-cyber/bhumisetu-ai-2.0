-- Persist structured parcel-graph observations in due-diligence reports.
-- Existing reports remain NULL; no historical analysis is invented.
BEGIN;

ALTER TABLE due_diligence_reports
    ADD COLUMN IF NOT EXISTS cpp_graph_analysis TEXT;

COMMIT;
