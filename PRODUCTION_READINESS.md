# Production Readiness Notes

## Required configuration

- Set `APP_ENV=production`, `DATABASE_URL`, and a randomly generated `JWT_SECRET` of at least 32 bytes in the deployment secret store. Do not put real secrets in `.env`, source control, `VITE_*` variables, or logs.
- Set `CORS_ORIGINS` to comma-separated HTTPS frontend origins. Production startup rejects wildcard or non-HTTPS origins.
- Put the API behind an HTTPS reverse proxy. `/health` is liveness; `/ready` checks PostgreSQL. `/docs`, `/redoc`, and OpenAPI are disabled in production.
- Password recovery is disabled in production until a verified out-of-band delivery provider is implemented. Development recovery returns a reset token directly and must not be exposed as a production flow.
- OCR and profile-image uploads require authentication and have per-process request limits; deed files are capped at 10 MB and profile images at 5 MB. OCR runs in the worker thread pool.
- Pool size is 10 connections per backend process. Choose worker count so `workers × 10` remains below the database connection budget, leaving capacity for migrations, monitoring, and administration.

## Backup, restore, and migration procedure

No production database backup, restore, or migration is performed by this repository change. Before any approved production migration:

1. Inspect the live schema and migration target; record the current database and relation sizes without printing connection strings or data rows.
2. Take a custom-format PostgreSQL backup to encrypted storage outside the repository, using credentials supplied by the deployment secret store:

   ```powershell
   pg_dump --format=custom --no-owner --no-privileges --file="$BackupPath" --dbname="$env:DATABASE_URL"
   pg_restore --list "$BackupPath" | Out-File -FilePath "$BackupPath.list"
   ```

3. Restore that backup into a separate, empty staging database with `pg_restore` (do not use `--clean` on production). Check table counts and run the migration there first.
4. Obtain explicit approval before applying `backend/migrations/20261105_cpp_graph_analysis_results.sql` or `backend/migrations/20261112_deed_digitization_support.sql` to production. Apply only the reviewed migration with `psql --set ON_ERROR_STOP=1` after staging restore and verification.
5. Verify the column, application readiness, and representative reports after deploy. Record backup location, restore result, migration ID, and deployment version without recording credentials or report contents.

The current migration is additive and leaves old reports `NULL`; it does not backfill or overwrite records. Its rollback is an application rollback while retaining the extra nullable column. Dropping the column is intentionally not part of rollback because it would destroy persisted analysis.

The deed-digitization migration adds application, status-history, private-document, and approved-deed metadata tables. It does not alter or backfill existing deed rows. New applications remain outside `deeds`; a staff approval creates one canonical deed row and metadata link in the same PostgreSQL transaction. Roll back the application by disabling the digitization routes and retaining the tables and files. Do not drop these tables after applications/documents have been saved: they contain status, ownership/access metadata, audit history, and links to private scans. If removal is ever required, first export and restore-verify all workflow tables and the persistent document volume, then obtain separate explicit approval for the destructive drop.

## Scaling limits and deployment notes

- PostgreSQL is the source of truth. The current connection pool and request rate limits are process-local; they are not a distributed rate limiter. Add Redis or a worker queue only after measured multi-instance load demonstrates the need.
- No read replica, Kafka, OpenSearch, Kubernetes, database sharding, or CDN is configured or justified by the available measurements.
- The database was not reachable for this turn's read-only latency/index audit, so no query/index performance claim is made. The C++ Windows DLL is optional; other platforms use the Python fallback.
- Define provider-specific backup retention, RPO, RTO, restore drills, and alert thresholds before production launch; those values depend on the selected PostgreSQL and hosting provider.
