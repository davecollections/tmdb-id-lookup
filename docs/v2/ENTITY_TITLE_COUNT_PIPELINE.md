# Typed Entity Title Count Pipeline

Status: Issue #71 implementation contract

Last reviewed: 2026-08-01

This pipeline builds strict monthly Company Movie, Company Series, and Network
Series counts without changing Builder source code. It reuses the existing
start-of-month collectors, adds only the missing Company Series full-data pass,
and publishes a combined data sidecar only after all three dimensions are
complete.

## Authoritative collectors and schedules

All schedules are UTC.

| Workflow | Schedule | Authority | API-request change |
| --- | --- | --- | --- |
| Update TMDB Genre Count Cache | `30 7 * * *` | Existing genre cache, unchanged | None; fixed 36-request scheduled commitment |
| Audit TMDB Export Coverage | `15 8 * * *` | Existing Company/Network export coverage audit and repair trigger | Export downloads now use the reservation ledger |
| Monthly TMDB Network Refresh | `45 8 1,2 * *` | Existing Network details and Series counts | Same collection; strict parsing, retry accounting, progress, and resume added |
| Monthly TMDB Company Refresh | `0 9 1-14 * *` | Existing Company details and Movie counts | Same collection; strict parsing, retry accounting, progress, and resume added |
| Monthly TMDB Company Series Counts | `0 9 15-28 * *` | New Company Series counts | The only new full-data API pass |
| Daily Capped Repair Cache From Audit | after a successful audit | Existing capped Company/Network cache repair | Requests and typed patches use the shared ledger |

The Company and Network refreshes continue to maintain their legacy caches and
metadata while also writing typed progress. The audit still identifies export
coverage drift. Manual Company rebuild, Network refresh, and repair entry points
adapt these same implementations; they do not create duplicate full-data jobs.

The genre workflow and `scripts/update-genre-counts.js` remain byte-for-byte
unchanged. The reservation planner always protects its normal scheduled 36
requests. Because the genre job is intentionally uninstrumented, additional
manual genre runs are not represented automatically and must not be casually
triggered on a heavily reserved UTC day.

Automatic typed production collection activates in UTC month `2026-09`.
Scheduled Company Series plans before that month exit in the plan job before a
reservation or target/progress write. The existing scheduled Company and
Network refreshes remain operational in August through reservation-aware
legacy-only mode: they update their established caches/metadata without freezing
typed targets, writing typed progress, retrying earlier typed slices, or
finalizing. The summary states that the legacy pipeline remains authoritative. The only
pre-activation typed collection control is the explicit manual
`network-bootstrap` mode: it can run either of the two normal Network slices
through the reservation ledger, but cannot collect Company data, finalize, or
publish. `sample` is separate, requires an existing frozen target, never creates
one, and never writes progress, legacy caches, or a sidecar.
The daily audit and capped repair continue their legacy August duties through
the same request ledger, but do not create August typed targets or progress;
strict audit-to-target binding becomes mandatory with typed activation.

## Exact job and concurrency graph

Each job holds at most one static GitHub Actions concurrency group.

| Workflow | Job sequence | Concurrency group |
| --- | --- | --- |
| Audit | `plan-audit` | none |
|  | `reserve-export-requests` | `tmdb-request-budget` |
|  | `audit-and-initialize-targets` | `tmdb-count-targets` |
| Company Movie | `plan` | none |
|  | `reserve-requests` | `tmdb-request-budget` |
|  | `ensure-company-target` | `tmdb-count-targets` |
|  | `collect-company-movie` | `tmdb-count-company-movie` |
|  | `finalize` | `tmdb-count-publication` |
| Network Series | `plan` | none |
|  | `reserve-requests` | `tmdb-request-budget` |
|  | `ensure-network-target` | `tmdb-count-targets` |
|  | `collect-network-series` | `tmdb-count-network-series` |
|  | `finalize` | `tmdb-count-publication` |
| Company Series | `plan` | none |
|  | `reserve-requests` | `tmdb-request-budget` |
|  | `validate-company-target` | `tmdb-count-targets` |
|  | `collect-company-series` | `tmdb-count-company-series` |
|  | `finalize` | `tmdb-count-publication` |
| Repair | `plan-repair` | none |
|  | `reserve-repair-requests` | `tmdb-request-budget` |
|  | `validate-targets` | `tmdb-count-targets` |
|  | `repair-company` | `tmdb-count-company-movie` |
|  | `repair-network` | `tmdb-count-network-series` |
|  | `finalize` | `tmdb-count-publication` |

Manual wrapper workflows call the same reusable Company, Network, or repair
graphs. GitHub Actions permits one concurrency group per job; these jobs use
only the single group shown above with `cancel-in-progress: false`, so manual
dispatches cannot bypass the writer locks. No unsupported secondary queue key
or dynamic date concurrency group is used.

The reservation group serializes the short read-plan-commit operation. The job
determines the real UTC date inside the runner, reads every immutable committed
receipt for that date, reserves the complete requested allowance, commits the
receipt, and exposes its ID, path, hash, and UTC date. A collector then checks
that exact committed receipt before any TMDB HTTP attempt. Receipts bind the
workflow, run ID, run attempt, planned month, planned UTC date, request class,
target dimension, and approved allowance. A receipt with a valid hash therefore
cannot be reused by another job, run attempt, dimension, or request class. The dimension group
serializes state reads, immutable patch writes, and commits, preventing one
writer from losing another writer's terminal observation. The publication
group prevents competing finalizers.

The plan job freezes its actual current UTC date and month. If a queued
reservation job does not start until another UTC date, it fails before writing
a receipt. If UTC changes after reservation, the request client stops before
another request and leaves unprocessed IDs pending. It never recomputes the
slice/month or carries an allowance into a later UTC day.
Repair accepts an audit up to 36 hours old, so normal GitHub Actions queueing and
UTC rollover do not block a healthy audit-triggered run. An older audit blocks
before TMDB collection; recovery is to run the audit again, not to silently
repair from stale coverage evidence.

## Total TMDB HTTP request budget

The limits count every HTTP attempt to `api.themoviedb.org` and
`files.tmdb.org`: authenticated or unauthenticated API calls, export downloads,
initial attempts, retries, fallback export dates, audit, repair, and collection.

- Preferred planned ceiling: 90,000 requests per UTC day.
- Absolute ceiling: 100,000 requests per UTC day.
- Fixed genre commitment: 36.
- Protected audit commitment: 14.
- Protected repair commitment: 4,000.

Normal planned maximums are:

| Work | Collection/API allowance | Export allowance | Maximum reserved |
| --- | ---: | ---: | ---: |
| Company Movie day | 55,000 | 7 | 55,007 |
| Network Series day | 15,000 | 7 | 15,007 |
| Company Series day | 70,000 | 0 | 70,000 |
| Audit | 0 | 14 | 14 |
| Repair | up to 4,000 | 0 | 4,000 |
| Genre scheduled commitment | 36 | 0 | 36 |

The central calculation protects the genre, audit, and repair allowances even
before their receipts exist. For example, a normal Company reservation projects
to 59,057 total requests: 55,007 requested plus 36 genre, 14 protected audit,
and 4,000 protected repair. A normal Company and Network overlap projects to
74,064. A Company Series day projects to 74,050. These are worst-case planned
attempts, not expected successful calls.

Retries consume the same finite allocation as first attempts. Current-slice
first attempts run before retry work, so unresolved earlier slices cannot consume
the first-attempt capacity reserved for the current slice. Export fallback
dates also consume one request each. Once an allocation is exhausted, remaining
IDs stay pending; the collector does not manufacture failures for requests it
did not make.

Usage receipts reconcile attempts, retries, host totals, and unused allowance
to the immutable reservation. A job that never starts or terminates early does
not release its allowance: the unused capacity stays conservatively reserved
until that UTC day ends. Reservation and usage receipts are retained as small
auditable records; no automatic deletion is part of this issue. TMDB traffic
outside this repository remains an operational limitation the ledger cannot
observe.

## Terminal push failure and deferred recovery

After collection, each writer uses the shared bounded commit/push action. If all
push attempts fail, the job fails visibly, does not repeat collection in that
job, and does not release or reuse its consumed request reservation. Operator
intervention or a later separately reserved rerun may therefore be required.

Durable commit-only recovery for runner-local output is deliberately deferred to
a separate issue. It must be implemented, security-reviewed, and validated
before the first automatic September typed-production run. That follow-up is not
required for staging or merging issue #71, and this issue contains no recovery
artifact packaging, upload, download, or restore path.

## Frozen targets and typed progress

One Company target and one Network target are frozen per UTC month:

```text
maintenance/entity-title-counts/months/YYYY-MM/
  targets/
    companies.json
    networks.json
  progress/
    company-movie/slice-NN.json
    company-series/slice-NN.json
    network-series/slice-NN.json
  patches/
    company-movie/RUN.json
    company-series/RUN.json
    network-series/RUN.json
```

Company Movie and Company Series reference the same Company target fingerprint,
so the full Company ID list is not duplicated. Primary slices and run/repair
patches are immutable. A rerun writes a patch instead of overwriting the primary
slice. Deterministic reduction first gives every terminal positive, zero, or
confirmed-unavailable observation precedence over every transient failure,
regardless of file order. Timestamp ordering is then applied within the same
precedence class; equal-time semantic conflicts fail, while semantically equal
records use a canonical tie-break. The resulting map is ID-sorted, so path and
patch enumeration cannot change semantic output. Each target, progress document, completion
manifest, and sidecar also carries parser semantic version `1.0.0`, independent
of its document schema version. Duplicate IDs in one document, mixed parser
versions, target-external typed IDs, and conflicting semantic observations at
the same timestamp fail closed.

The daily audit may observe a later export whose ID set differs from the frozen
monthly target. It records both fingerprints and does not replace the target.
Legacy cache repair may still add a newly exported ID, but it writes typed
progress only for IDs inside the frozen target. This preserves daily cache
coverage without changing the population midway through either Company
dimension.

Every audited missing legacy-cache ID still receives a details request. A
positive or zero typed count can safely supply the legacy `titles_count` and
avoid a duplicate Discover request; unavailable, failed, or absent typed
evidence requires normal count collection when details exist. An ID outside the
frozen target can restore its legacy row but cannot enter typed progress. No-op
and capped repairs retain the established missing/extra evidence, timing, cap,
status, and reason metadata without initializing a request client or rewriting
the caches.

The maintenance states are:

- **pending**: target ID has no observation; completion blocker;
- **failed**: transient request or validation failure; retryable completion
  blocker;
- **positive**: strict nonzero `total_results`;
- **zero**: strict successful `total_results: 0`;
- **confirmed unavailable**: two entity-details HTTP 404 observations on
  different UTC dates, or a Company Series result inherited from that confirmed
  Company identity evidence;
- **computed stale**: a published terminal value whose dimension-specific
  `stale_after` time has passed; it is interpretation metadata, not stored
  progress and does not become pending or failed.

Missing, null, string, fractional, negative, or unsafe `total_results` values are
validation failures. Timeouts, 429s, 5xx responses, network failures, malformed
JSON, and a single 404 remain failed/retryable. They never become confirmed
unavailable merely because retries were exhausted.

The HTTP timeout covers both response headers and the full buffered response
body, including export downloads. Each initial attempt and retry is charged
once. `Retry-After` is validated and capped at 60 seconds; malformed or negative
values use a safe default. Before sleeping for a retry, the client rechecks the
abort signal, UTC date, and remaining immutable allowance. It does not sleep
after a final attempt or when no next attempt is allowed.

Progress documents keep dimension and run observation time once at document
level. Per-ID records keep status/count/evidence and a compact exact
first/last-attempt window plus attempt count. Usage receipts keep reconciled
attempt, retry, host, status/outcome, first, and last totals without duplicating
every request event. At the current target volumes, an in-memory full-month
model measured about 57.3 MB raw and 4.84 MB as the sum of independently gzipped
Company target, Company Movie, Company Series, and Network Series state. Git
delta compression across repeated IDs and document shapes is expected to keep
packed monthly history within the approved approximate 2–5 MB range. Primary
slices and sparse patches limit each commit to the state that actually changed.

## Company Series days 15–28

The frozen Company target is split by deterministic floor boundaries into 14
slices. On day 15 the workflow runs slice 0; day 28 runs slice 13. Each scheduled
run:

1. reserves at most 70,000 Company Series API attempts and zero target-export
   attempts;
2. validates the already-frozen Company target;
3. gives every unresolved ID in the day's slice one first attempt;
4. uses only remaining allowance for unresolved earlier slices, then failures
   from the current slice, with up to four attempts in a retry operation;
5. commits only the new primary slice or immutable run patch and usage receipt;
6. runs the finalizer.

Day 28 therefore completes its own first attempts before retrying older
unresolved work. If the 70,000-attempt allowance ends, untouched IDs remain
pending and failed IDs remain retryable. The finalizer reports blockers and
keeps the previous sidecar. A later separately dispatched retry can use the same
safe reservation and writer groups.

## Publication and sidecar contract

Every non-sample authoritative collection and repair run invokes the finalizer.
It publishes as soon as:

- Company Movie, Company Series, and Network Series target fingerprints are
  compatible;
- no target ID is pending;
- no transient failure remains; and
- every target/dimension is positive, zero, or confirmed unavailable.

`data/entity-title-counts.min.json` and
`data/entity-title-counts-completion.json` are generated and committed together.
If validation is incomplete, invalid, or above a guardrail, neither production
file is written. The last-known-good sidecar therefore remains unchanged.
`validate` and `publish` manual controls remain available through the existing
workflow surfaces for diagnostics and controlled publication.

Before replacement, the publisher strictly validates any existing completion
manifest and verifies that it describes the existing sidecar bytes. Malformed
or incomplete existing publication state fails closed. An older requested month
cannot replace a newer one, identical same-month bytes are idempotent, a
different same-month payload is rejected, and only a later fully valid month may
replace the last-known-good pair.

The compact sidecar uses:

- positive integer for a known positive count;
- `0` for a confirmed zero;
- `null` for confirmed unavailable at that dimension only;
- `stale_after` in the completion manifest to interpret a known published value
  as stale after its freshness window.

A Company record always has independent Movie and Series positions, so one
unavailable dimension does not discard the other.

Published observations are deduplicated by the collection run's UTC-second
timestamp and, for unavailable data, the reason. Exact per-request and per-ID
attempt timestamps stay in maintenance progress. For each dimension, contiguous
target positions sharing an observation are encoded as ID ranges. Singletons
and genuinely sparse differences become overrides. A full retry of one or two
contiguous slices can therefore remain ranges rather than consuming thousands
of sparse overrides. Keys, observations, ranges, and overrides use deterministic
ordering, yielding identical semantic output for identical input.

Publication guardrails are:

- at most 512 observation entries;
- at most 25,000 genuinely sparse Company overrides across both Company
  dimensions;
- a proportionate Network sparse-override limit;
- at most 5 MiB raw JSON; and
- at most 1.25 MiB gzip-equivalent.

No threshold is relaxed automatically. The completion manifest records
fingerprints, dimension summaries, sizes, observation/override counts, sidecar
SHA-256, publication time, and stale cutoffs.

The implementation was measured in memory against the current 255,201 Company
and 5,504 Network IDs without writing a production sidecar:

| Scenario | Observations | Company sparse overrides | Network sparse overrides | Raw | Gzip-equivalent |
| --- | ---: | ---: | ---: | ---: | ---: |
| Normal 14 + 14 + 2 scheduled runs | 30 | 0 | 0 | 4,003,675 bytes | 1,002,288 bytes |
| Guarded operating upper model | 128 | 10,000 | 200 | 4,415,809 bytes | 995,365 bytes |

The earlier planning estimate of about 4.86 MB raw / 741 KB gzip was
directionally safe on raw size but understated the measured gzip size. Both
measured scenarios remain below the fixed 5 MiB / 1.25 MiB limits. The upper
model uses genuinely sparse observations; contiguous full-slice retries remain
ranges and are smaller.

## Production-cycle boundary

Old-pipeline Company or Network slices do not contain the strict typed evidence
required for this sidecar. If this implementation reaches `main` after any
August slices have run, August is not automatically backfilled or published.
Without a separately approved catch-up, the first complete cycle begins in
September 2026 and can publish automatically no earlier than September 28 UTC.

A catch-up would require new reservations and approximately two TMDB calls per
missing Company Movie or Network Series ID, plus one per missing Company Series
ID and any retries. It must be split across UTC days below the same 90,000
preferred/100,000 absolute ceilings. This implementation neither triggers nor
pre-approves that operation.

## Regression boundaries

This infrastructure issue does not modify:

- `builder/src/` or define the future Builder consumer;
- the genre workflow or collector;
- Worker routes, dependencies, lockfiles, source JSON, or artwork contracts; or
- `nuvio-assets`.

Real data must exist and be reviewed before Studios or Networks Builder
integration is designed.
