# Bhumisetu project audit

Audit date: 2026-11-02

## Scope inspected

Reviewed the repository structure, FastAPI routes and request models, PostgreSQL schema and data access in `backend/engine.py`, frontend API client and auth context, Vercel configuration, environment template, dependency manifests, and existing test files. The working tree already contained staged edits in `backend/engine.py` and five frontend components; those edits were present before this audit.

## Findings

### Critical

- Auth tokens are predictable `lg-token-{user_id}-...` strings. Backend parsing trusts the embedded ID and does not verify a signature or expiration.
- `/api/auth/me` accepts a caller supplied `user_id` without authentication and returns a hardcoded citizen when no valid token is provided.
- Public registration accepts `role`, allowing self-registration as officer or admin.
- OTP delivery is simulated by returning `otp_preview` and writing OTP content to a notification. The universal `123456` code bypasses OTP checks; the OTP store is process-local and has no attempt or resend limits.
- Authorization is inconsistent. Several endpoints that return personal records, reports, notifications, or audit data are public. Mutation review has an authentication fallback that permits unauthenticated officer actions.
- Frontend state contains hardcoded demo identities, role switching, and a forgeable demo token; these bypass normal authentication UX.

### High

- `DATABASE_URL` is required, but `.env.example` contains a known demo JWT secret. Authentication does not currently use that secret safely.
- File upload endpoint requires review for size, MIME/content validation, and safe handling.
- CORS allows every method and header for each configured origin; security headers and broad rate limiting are absent.
- PostgreSQL pool is optional-imported but `psycopg_pool` is not listed in requirements, so deployments may silently use one connection per operation.
- Several list/search/statistics routes have no consistent pagination or input bounds.
- API error handling and logging need review to ensure database/provider details do not escape.

### Moderate

- The frontend loads all page modules eagerly; no route/component lazy loading is present.
- API calls periodically poll notifications and swallow errors. Cached user state is trusted as UI state until revalidated.
- Build and deployment instructions/configuration need reconciliation: repository-root `vercel.json` uses shell commands that are not portable to Windows build environments and destructively clears generated `public/` at build time.
- Existing tests primarily cover legacy happy paths and do not exercise authentication, roles, expiry, ownership, or invalid tokens.

## Database and integration notes

- Schema creation uses additive `CREATE TABLE IF NOT EXISTS`; no destructive reset was found in initialization. There is no formal migration framework or declared PostgreSQL index inventory beyond a small set of indexes in `init()`.
- SQL calls inspected use bound parameters for user supplied values.
- C++ integration is optional through `backend/cpp_bridge.py`; a prebuilt DLL is checked into the repository. Runtime platform compatibility and artifact provenance need deployment review.
- Existing tests set `LANDTECH_DB`, but the inspected engine requires `DATABASE_URL`; test/runtime configuration is inconsistent.

## Implementation priority

1. Replace forgeable tokens with signed, expiring credentials and remove user-ID auth fallback.
2. Enforce server-side role and ownership checks; remove public role assignment and demo-role auth.
3. Disable OTP until an actual delivery provider is configured; remove preview and universal codes.
4. Bound uploads, pagination, CORS, and request rates; add safe security headers and production env validation.
5. Reconcile deployment/dependencies and add focused auth/authorization tests, then measure frontend/backend performance.

This is a code audit, not a live infrastructure or production database audit. No production database was connected or modified.
