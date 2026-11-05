# Bhumisetu Phase 2 — Architecture and Design Proposal

**Status:** Approved to proceed by the user on 5 November 2026. Phase 3 foundation and verification-result safety work have started; this document remains the design record and does not claim full production readiness.

## 1. Verified starting point

The repository is a React 18/Vite frontend, FastAPI/Python backend, PostgreSQL/Neon database, and optional C++ shared library exposed through ctypes with a Python fallback. The frontend uses hash-based routing. The deployed Vercel configuration gives the FastAPI entrypoint a 60-second maximum execution time.

The live PostgreSQL schema was inspected read-only. It contains 27 application tables in public and 9 Neon Auth tables in neon_auth. The deeds table has these location columns:

- division: readable Division label
- division_id: canonical key referencing divisions.id
- union_id: optional key referencing admin_unions.id
- union_ward: optional submitted/readable Union or Ward label

There is no physical public.admin_union column. The extra division and admin_union labels in the Neon grid are relationship displays, not stored columns. No duplicate physical column was found in deeds, so no column was dropped. Exact duplicate public index definitions were also not found.

The live data has 10 deeds with Division label and ID populated; none has Union/Ward values. In deed_verifications, owner_name exists on 62 rows, while buyer_name exists on 4 rows and equals owner_name on those 4. These fields overlap but are not safely removable: older records use owner_name and current code reads/writes both for compatibility. The proposal keeps them during any future schema cleanup.

## 2. Current risks that the design addresses

1. Verification reads the app’s own deeds and properties tables. There is no connected government Balam or ownership registry API in the inspected code, so the app must label this source accurately.
2. The running result page can show green Balam/Clear/Verified labels even when result_status is RECORD_NOT_FOUND. A reference from the current browser showed this state. The redesigned contract must make every visual status derive from field-level API evidence.
3. Current verification weights and eligible fields can make the score look more conclusive than the underlying data. Khatian is only informational in current logic, and seller/owner/source availability is not consistently represented.
4. The result page has no true chart library dependency today. Chart counts must be derived from the same field result list as the status header.
5. The C++ engine’s party-cycle graph ignores parcel identity; rapid transfer uses approximate date conversion; risk weights are constants; fast_search scans serialized JSON linearly while describing itself as O(log N). The Python fallback does not detect rapid transfers.
6. Only a Windows DLL is present in the repository. Linux deployment therefore uses the Python fallback unless a compatible shared library is built.
7. PostgreSQL initialization currently performs schema changes at application startup in addition to standalone migration scripts. The health route checks process response, not database readiness.
8. No load-test evidence supports the 100M MAU objective. Vercel’s 60-second function limit and serverless lifecycle do not support a continuously running worker pool.

## 3. Verification result dashboard proposal

Keep the existing input form and location dropdowns unchanged. Redesign only the result page.

### Header and summary

Show:

- Overall state: VERIFIED, PARTIAL MATCH, MISMATCH, PENDING, or INSUFFICIENT DATA
- Verification reference and timestamp
- Submitted deed number and registration year
- Seller and buyer/recorded-owner shown as separate people
- Division, District, Upazila/Thana, Mouza, Dag, and Khatian
- A match percentage only when the eligible field set and source coverage make it meaningful

Never show a positive title/ownership result when the record is missing. Show “পর্যাপ্ত তথ্য নেই” when mandatory comparisons cannot be made.

### Comparison area

Each field card/table row contains submitted value, recorded value, status, source, evidence reference, and a plain explanation. Seller remains a required visible row. Recorded Owner is a separate row. Union is optional:

- omitted Union: NOT_PROVIDED and excluded from the score
- submitted Union with no source value: UNAVAILABLE
- supplied Union with a real source value: compare it and report the result

### Charts and history

Use Recharts only after confirming it fits the bundle and accessibility needs; otherwise render small CSS/SVG charts without introducing a heavy dependency. All charts must consume the same normalized field result array:

1. Overall counts: matched, partial, mismatched, unavailable, not provided
2. Field comparison status
3. Category comparison: deed, seller, ownership, location, Khatian, Dag, optional Union
4. Ownership history only when actual dated transfers exist

No chart, timeline, QR certificate, or “clear title” label may imply verification unsupported by an actual source record.

## 4. Proposed verification API result model

Preserve existing endpoint and legacy fields while adding a versioned, structured result. Example shape:

~~~json
{
  "schema_version": 2,
  "verification_ref": "LG-VR-...",
  "result_status": "INSUFFICIENT_DATA",
  "match_score": null,
  "coverage": { "required": 10, "evaluated": 4, "unavailable": 6 },
  "fields": [
    {
      "key": "seller_name",
      "label_bn": "বিক্রেতার নাম",
      "label_en": "Seller Name",
      "required": true,
      "submitted": "…",
      "recorded": null,
      "status": "UNAVAILABLE",
      "similarity_score": null,
      "source": "application_database",
      "evidence_ref": null,
      "explanation_bn": "বিক্রেতার রেকর্ড পাওয়া যায়নি।"
    }
  ],
  "ownership_history": { "status": "UNAVAILABLE", "items": [] },
  "anomalies": [],
  "disclaimer": "Automated comparison is not a legal ownership determination."
}
~~~

Status rules:

- MATCHED requires a real comparable source value.
- PARTIAL_MATCH is a similarity signal, never proof of identity or title.
- UNAVAILABLE and PENDING are not matches.
- A missing record cannot be rendered as VERIFIED.
- Union omitted by the user is NOT_PROVIDED, not a mismatch.
- Seller and recorded owner are never silently merged.
- Existing result_status values remain mapped for API compatibility until the frontend and clients migrate.

Score proposal: count only eligible, actually evaluated fields; exclude omitted optional Union; never count unavailable values as matches. If a mandatory source is unavailable, suppress the percentage or show a separate coverage figure so a high score cannot hide missing evidence. Fraud/anomaly observations never affect the match percentage.

## 5. C++ and Python engine improvement plan

Do not rewrite the engine. First build representative, labeled Bengali and English test data and benchmark the current C++ and fallback implementations.

### Name comparison

1. Normalize Unicode and whitespace, punctuation, Bengali digits, and case where appropriate.
2. Compare exact normalized values first.
3. Evaluate Bengali token-order handling and spelling variants.
4. Benchmark Levenshtein and token-aware/Jaro-Winkler candidates.
5. Return exact_match, normalized_match, similarity_score, category, and explanation.
6. Tune thresholds from labeled examples; never use fuzzy similarity as identity proof.

### Ownership graph

1. Partition graph analysis by stable parcel/plot identity.
2. Prefer stable person IDs and deed references when available; names alone can collide.
3. Return evidence references and transfer dates for every anomaly.
4. Parse calendar dates with a real date library.
5. Make rapid-transfer windows configurable and label them as anomaly indicators.
6. Remove arbitrary fixed risk weights until an evidence-backed, tested model exists.
7. Ensure unrelated parcels cannot form a common ownership cycle.

### Search, FFI, and failure safety

1. Benchmark PostgreSQL indexed exact/prefix search against the existing C++ scan.
2. Correct algorithm labels; only add an in-memory index if measurements justify it.
3. Replace fragile hand-built JSON parsing/output with a maintained parser/serializer compatible with the build.
4. Bound input sizes and concurrency.
5. Verify ctypes argtypes/restype, null handling, and string ownership.
6. Preserve and compare the Python fallback output schema.
7. Isolate native crashes from API processes before enabling untrusted or high-volume native workloads.

## 6. C++ worker architecture

### Initial stage

Keep a modular FastAPI monolith and the existing optional C++ bridge. Use C++ only for CPU-heavy operations where a reproducible benchmark shows a benefit. Cap input sizes and execution concurrency. Preserve a Python fallback.

### Growth stage

If CPU profiling and traffic justify independent scaling, run a bounded pool of native worker processes in a long-lived container environment. Submit OCR and other long-running work through an idempotent job queue. The API stores PENDING state and returns a reference; the worker writes results and emits completion state. A worker crash restarts that worker without taking down API instances.

Do not add Kafka or a separate C++ microservice now. Reassess only when queue throughput, CPU isolation, or deployment cadence requires it. The current Vercel function should remain for static delivery or low-volume API use only if measurements and execution limits support it.

## 7. Adjustable capacity scenarios

These are planning assumptions, not measured capacity claims. Model 100M MAU; if “100 million active users” means DAU, this model must be raised substantially.

Assumptions: DAU equals 5%, 10%, or 20% of MAU; peak concurrent users are 0.5%, 1%, or 2% of DAU; each concurrent user averages 0.2 API requests/second. Non-verification traffic is assumed 90% reads and 10% writes. Each verification is modeled as four DB reads plus one DB write. OCR is a share of verification submissions. Numbers are rounded.

| Scenario | DAU | Peak concurrent | API peak RPS | Verification/s | Estimated DB reads/s | Estimated DB writes/s | OCR docs/s | Async jobs/s* |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Low | 5M | 25K | 5K | 50 (1%) | 4,655 | 545 | 2.5 (5%) | 52.5 |
| Base | 10M | 100K | 20K | 600 (3%) | 19,860 | 2,540 | 60 (10%) | 660 |
| High | 20M | 400K | 80K | 4,000 (5%) | 84,400 | 11,600 | 800 (20%) | 4,800 |

*Assumes one background task per verification and one additional task per OCR document. Real traffic mix, session behavior, database query count, and OCR adoption must replace these assumptions before capacity procurement.

## 8. PostgreSQL, pooling, and cache strategy

### PostgreSQL stages

1. Keep PostgreSQL/Neon as source of truth.
2. Measure slow query plans and connection saturation before changing compute or adding replicas.
3. Move schema DDL out of application startup into ordered, versioned migrations.
4. Maintain B-tree indexes for real filter/join patterns; avoid duplicate indexes and avoid indexing every column.
5. Add composite/partial indexes only from measured query plans.
6. Paginate list endpoints; never load all verifications or deeds for search.
7. Consider read replicas only for demonstrably read-heavy workloads and only where replica lag is acceptable.
8. Consider partitioning high-volume audit/verification history after measured growth; keep recent-write and unique-reference semantics intact.

### Cache

- Cache only public, versioned location datasets and non-user-specific reference catalogs.
- Never shared-cache private reports, OCR documents, NID, or profile data.
- Use short TTLs and invalidate on dataset import/version change.
- Add Redis only when multi-instance rate limiting, measured hot reads, or queues need shared state.

### Background work

- OCR documents should be private object storage references, not public URLs.
- Use idempotent job IDs tied to verification reference and document hash.
- Bound queue size and retries; use dead-letter handling and visible PENDING/FAILED statuses.
- Keep text extraction separate from ownership validation; OCR output always requires review.

## 9. Security and high availability

- Preserve backend authentication, role checks, signed tokens, CORS origin allow-list, existing rate limits, and security headers.
- Enforce authorization in API routes; never trust frontend role/user IDs.
- Add structured redacted logs, request IDs, audit events, and metrics without logging NID, passwords, raw deed text, or image bytes.
- Use shared rate-limit state only when horizontal instances make process-local counters insufficient.
- Keep secrets in deployment secret storage; rotate JWT/DB credentials using overlap windows.
- Minimize retention of uploaded deeds and define access/retention rules before object storage is introduced.
- Separate liveness from readiness; readiness should verify the dependencies required to serve a request without exposing credentials.
- Run stateless API replicas across availability zones when moving off serverless; use provider-managed PostgreSQL failover/PITR and test restore procedures.
- Degrade gracefully: if OCR/native workers are down, accept only supported manual submissions or return a clear retryable status; do not fabricate results.

## 10. Migration and rollback approach

No duplicate column was found in the live deeds table, so no column removal migration is proposed. The no-backup instruction was respected; no backup was created for this check.

For future approved schema changes:

1. Use expand/contract: add nullable fields and compatible API reads first.
2. Backfill in bounded, restartable batches and validate counts.
3. Deploy code that can read old and new forms.
4. Switch writes behind a feature flag.
5. Remove old fields only after all callers and stored data are proven migrated and explicit approval is given.
6. Use transactional DDL where PostgreSQL permits; record migration version and duration.
7. Define the recovery path before each production migration. For non-reversible data changes, use the provider’s existing point-in-time recovery rather than assuming a schema rollback can recreate values.

## 11. Test and measurement plan

Do not claim capacity or correctness until these are run in a controlled environment:

- Field contract tests: mandatory fields, missing sources, unknown records, optional Union omitted/provided/unavailable
- Seller and recorded-owner distinction
- Bengali Unicode normalization, token order, transliteration, empty names, punctuation
- Database match, mismatch, and unavailable statuses
- Fraud graph on same parcel and unrelated parcels
- Leap-day/date boundary and invalid dates
- C++/Python structured-output parity
- Native library unavailable, malformed payload, oversized payload, worker crash
- Result charts match the API field counts exactly; no green states on RECORD_NOT_FOUND
- Keyboard/screen-reader access and Bengali/English responsive layouts
- DB query plans, pool exhaustion, restart, failover, backup restore
- Load tests at staged RPS with p50/p95/p99 latency, error rate, DB pool wait, OCR queue depth, and worker CPU/memory

## 12. Cost and rollout roadmap

No provider cost ranges are stated because target region, service tier, retention, OCR rate, and contractual pricing are not established.

1. **Measurement stage:** production-like traffic replay, query plans, and benchmark; minimal new infrastructure.
2. **Reliability stage:** improve migration discipline, observability, readiness, and current API result truthfulness.
3. **Worker stage:** private object storage and a bounded queue only when OCR/CPU work needs isolation.
4. **Scale stage:** increase PostgreSQL compute/pooler and add read replicas only after observed saturation.
5. **National scale stage:** multi-zone API/worker deployment, disaster-recovery drills, and independent load validation.

Track monthly cost by database compute/storage/egress, API instances, OCR CPU, object storage, queue operations, logs/metrics retention, and support tier. Re-estimate each stage from measured volume.

## 13. Approval boundary

The live database was inspected read-only; no duplicate column existed to remove, and no database object was dropped. The user later approved proceeding. Initial application changes are documented in `CONCEPT_NOTE.md`; no live database schema or records were changed in this implementation step. Destructive schema contraction and infrastructure changes still require their own explicit approval.
