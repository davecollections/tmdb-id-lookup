# Typed Entity Count Recovery

Status: merged through issue #73 / PR #80; hosted producer/consumer recovery drill and September readiness gates complete

Last reviewed: 2026-08-06

This recovery path protects a completed, validated typed writer job when its
maintenance-state commit cannot be pushed. It restores the exact writer output
and original request-usage receipt without collecting again.

Recovery is intentionally job-granular. One completed writer job or scheduled
slice is the smallest resumable unit. There are no per-entity or intra-slice
durable checkpoints.

## In-scope writers

| Workload input | Originating writer job | Writer concurrency group |
| --- | --- | --- |
| `company-movie` | `collect-company-movie` | `tmdb-count-company-movie` |
| `company-series` | `collect-company-series` | `tmdb-count-company-series` |
| `network-series` | `collect-network-series` | `tmdb-count-network-series` |
| `company-repair` | `repair-company` when it writes a typed patch | `tmdb-count-company-movie` |
| `network-repair` | `repair-network` when it writes a typed patch | `tmdb-count-network-series` |

Reservation-only jobs, target initialization, audit-only work, genre refresh,
publication-only work, sample/retry modes, zero-consumption output, and August
legacy-only runs do not produce recovery-ready artifacts. Only `collect` mode
may create a manifest whose mode is `collect`. A zero-consumption writer has not
put request capacity at risk and cannot satisfy the positive-consumption gate;
its normal push may still proceed.

## Persistence contract

After an in-scope writer returns successfully, its exact output is validated and
packaged in the runner temporary directory outside the checkout. The package is
uploaded before the existing commit/push action is allowed to run. Upload
failure therefore prevents the first output push attempt.

The immutable artifact name is:

```text
maintenance-recovery-v1-<run-id>-<run-attempt>-<writer-job>
```

The upload declares:

- `retention-days: 90`;
- `if-no-files-found: error`;
- `overwrite: false`;
- hidden-file inclusion disabled.

The package layout is:

```text
manifest.json
payload/<exact repository-relative usage path>
payload/<exact repository-relative typed progress path>
payload/<each exact static legacy path owned by the writer, when applicable>
```

`manifest.json` is canonical JSON using schema version 1 and readiness status
`ready`. It contains the exact workflow file, event, collect-package mode,
main ref/head SHA, origin, reservation, usage, target, progress, base-commit, and workload
identities. `head_sha` is the immutable, API-verifiable workflow trigger commit.
`base_commit` is independently derived from the writer job's later `main` checkout,
after reservation and optional target commits, and must equal or descend from
`head_sha`. The manifest also records
byte length and SHA-256 for every payload, the base SHA-256 for each
mutable legacy path read from the exact `<base_commit>:<path>` blob, and SHA-256
over the sorted payload inventory.

The upload action also records GitHub's artifact archive digest in the workflow
summary. Before download, recovery resolves the completed source run, workflow,
event, repository, main ref, commit, attempt, completed writer job, and exactly
one live artifact through the GitHub API. The exact allowlisted artifact-upload
step must occur exactly once inside that writer job with `status: completed` and
`conclusion: success`; an artifact or similarly named step elsewhere in the run
is insufficient. Only failed or cancelled allowlisted
writer runs are eligible. The API-derived artifact ID, rather than a caller URL
or manifest claim, is passed to the download action. The repository verifier then validates the
canonical manifest, inventory hash, and every payload hash before any file is
restored.

## Operator inputs

Use the manual **Recover Typed Entity Count Output** workflow with exactly:

1. `workload`: one value from the table above;
2. `run_id`: the numeric GitHub Actions run ID that created the artifact;
3. `run_attempt`: the positive originating attempt number, normally `1`;
4. `publish_after_recovery`: whether to invoke the existing zero-request
   publication after recovery, defaulting to true.

Do not download an artifact and copy its files into the repository manually.
Do not rerun collection merely to recreate output that is still inside its
API-reported recovery-retention window.

Before dispatching:

1. Confirm the originating writer completed collection and artifact upload.
2. Confirm the output commit/push did not land, or that the recovery is being
   used as an intentional idempotency check.
3. Copy the run ID and attempt from the original run, not a reservation-only or
   publication run.
4. Confirm the artifact name exactly matches the workload's writer job.
5. Confirm the artifact has not expired or been manually deleted.

## Validation and overwrite rules

Recovery checks out latest `main` with full history and requires a clean
worktree. Before any repository write it validates all of the following:

- the artifact is outside the checkout;
- the package contains only `manifest.json` and its exact declared payload;
- no member is an absolute path, traversal path, normalization alias, link,
  junction, reparse point, non-regular file, duplicate, case collision, missing
  file, or unexpected file;
- every path is in the static allowlist for the chosen workload;
- the canonical manifest and sorted inventory hashes match;
- every payload byte length and SHA-256 match;
- repository, run, attempt, workflow file, event, collect-package
  mode, main ref/head SHA, writer job, workload, month,
  planned UTC date, target, schema, and parser identities match;
- Git proves both commit objects exist, the writer checkout is exactly
  `base_commit` on `main`, and `head_sha` is an ancestor of or equal to it;
- GitHub verifies `base_commit` as an exact commit and its comparison with the
  API-verified `head_sha` is `ahead` or `identical`; `behind`, `diverged`,
  unrelated, missing, or mismatched commits fail closed;
- the original committed reservation still exists on latest `main`, has the
  recorded canonical SHA-256, and exactly matches the workflow/run/attempt/job,
  allocation, request class, dimension, date, month, and approved allowance;
- the exact usage receipt is schema-valid, has positive consumption, reconciles
  allowance/attempt/unused, host, outcome, retry, and timestamp totals, and
  matches the reservation;
- typed progress is nonempty, belongs to the exact frozen target and writer run,
  uses the expected primary-slice or immutable-patch path, contains only target
  IDs, and records the same usage receipt and attempt count;
- the manifest base commit is an ancestor of latest `main`.

Immutable usage and progress paths follow these rules:

- absent on current `main`: restore the exact payload bytes;
- already byte-identical: keep them as an idempotent no-op;
- present with different bytes: fail before any write.

Legacy output is evaluated as one cohort:

- if every owned path still matches the recorded writer base, restore the whole
  exact cohort;
- if every owned path already matches the artifact, keep it as applied;
- if current cache/CSV bytes differ, preserve them only when their structure,
  ID order, row parity, current frozen target, count, month, fingerprint, and a
  strictly newer complete scan/repair marker validate together; every positive
  request receipt must also satisfy `started_at <= first_attempt_at <=
  last_attempt_at <= finished_at` for that producer;
- mixed, incomplete, stale, target-conflicting, or ambiguous current legacy
  state fails before usage or progress is written.

The restore prepares all changed files before replacing any destination and
rolls replacements back if a filesystem operation fails. Recovery then uses a
dedicated compare-and-swap commit path: fetch exact remote `main`, reconcile
again from that clean SHA, stage only restored paths, verify staged Git blobs,
commit, confirm the remote ref has not moved, and push normally. A remote race
discards the unpushed attempt and repeats from the new clean remote state up to
three times. Recovery never pulls, rebases, merges, content-merges, or
force-pushes, so a same-file disjoint change cannot create hybrid output. A
fully already-applied artifact produces no recovery commit. If remote `main`
advances during all three attempts, recovery fails with the bounded-retry
result after resetting the local checkout, index, and worktree to the latest
fetched remote state; no recovery commit remains attached or pushed.

Normal monthly writers continue using the established maintenance commit
action. Only protected writer calls provide its optional integrity manifest.
Those calls verify artifact hashes against the worktree before staging, the
index after staging, the commit tree after commit and after any normal rebase,
and again before push. Unrelated maintenance callers retain their existing
behavior.

## Publication

When `publish_after_recovery` is true, any successful recovery, including an idempotent no-op, starts a separate job
checks out latest `main` under `tmdb-count-publication` and runs the existing:

```text
node scripts/publish-entity-title-counts.mjs
```

It receives the recovered month and `VALIDATION_ONLY=false`. Existing
last-known-good publication rules remain authoritative. Incomplete typed state
leaves production sidecars unchanged; complete state may produce the normal
separate publication commit.

## Zero-request proof

The recovery workflow:

- has no `TMDB_BEARER_TOKEN` secret reference;
- does not import or invoke a collector, reservation creator, target initializer,
  audit writer, repair writer, or TMDB request client;
- downloads only from GitHub Actions, validates local files, restores approved
  repository paths, commits, and runs the file-only publisher.

The production inspection, reconciliation, compare-and-swap retry, conflict,
no-op, exhaustion, and publication-handoff paths run under a test guard that
throws on any TMDB-host request or import of the TMDB maintenance request
client. The tests also verify that the existing reservation bytes and original
usage attempt count are unchanged. The recovery log prints
`zero_tmdb_requests: true`. Operator review should also confirm that the job
graph contains only checkout, Node setup, artifact download, recovery, commit,
and publication steps.

## Fixture-only hosted drill

After PR #80 merged, the manually dispatched fixture producer and automatic
`workflow_run` consumer passed. The consumer resolved and downloaded the real
cross-run artifact by API-derived artifact ID and exercised exact recovery,
repeat no-op, Linux symlink rejection, corrupt/traversal and hybrid-output
rejection, safe remote-advance handling, and legacy-cohort safeguards. The
preload guard recorded zero TMDB/network requests, and the drill wrote no
production data. The retained artifact expires on 2026-11-04. All external
Actions added by issue #73 remain pinned to full reviewed commit SHAs.

## Expiry and safe abandonment

Recovery artifacts request 90-day retention. Repository or organization policy
may cap the actual retention period, so the API-reported expiry is authoritative
and is recorded by the hosted drill. Artifacts may also become unavailable if
the artifact, run, or repository is deleted. Expiry never releases or reuses the
original request reservation.

For the completed post-merge drill, the API recorded artifact `8954448669` as
retained through `2026-11-04T03:11:53Z`.

If recovery data is absent, expired, corrupt, conflicting, or cannot pass every
gate:

1. leave the consumed reservation and any existing current-main state intact;
2. do not copy partial files, edit hashes, weaken a validator, or guess usage;
3. record the failed run, artifact identity, validation error, and current-main
   SHA for review;
4. decide separately whether a new request reservation and full writer rerun is
   safe on a current UTC date.

An old reservation is never released, reused, transferred to another date, or
treated as proof of a later rerun.

## Activation gates

Before the first automatic September 2026 typed production run:

- deterministic recovery and workflow-contract tests must pass;
- the local interruption, exact restore, idempotent retry, corrupt-artifact,
  current-main conflict, and newer-cohort drills must pass;
- complete repository, typed-count, Builder, Pages, and whitespace checks must
  pass;
- a hosted synthetic interruption/recovery drill must demonstrate a real
  immutable artifact with requested 90-day retention and recorded API expiry,
  zero TMDB requests, one exact recovery commit, a second no-op recovery,
  corrupt-package failure, and publication from latest `main` without
  production-state writes;
- Dave must review this runbook.

The post-merge hosted producer/consumer drill completed these September
recovery-readiness gates, and issue #73 is closed. Issue #73 did not change
schedule cron expressions, activation month, allowances, or partitions; later
production activation or observation remains separately reviewed.

## Product boundary

Issue #73 changes durability only. Company retains its existing total title
count plus its separate Movie and Series counts. Network Series collection and
recovery retain their current semantics; this issue makes no decision about
whether a Network total and typed Network Series count are redundant. Stable
v1, downstream fields and interpretation, production schemas/data, schedules,
activation, allowances, and partitions remain unchanged. The bounded Company
Movie/Series live smoke under issue #84 has not run, and the read-only Network
comparison remains separate future work. Neither is part of the completed
issue #73 recovery drill.
