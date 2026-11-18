# Cache maintenance and recovery

The daily export audit is scheduled at 08:15 UTC. A successful audit triggers
Daily Capped Repair Cache From Audit. Company monthly refresh runs on days 1–14;
Network monthly refresh runs on days 1–2. Keep daily repair enabled during these
windows: monthly refresh walks ascending-ID slices, so the newest entities are
usually in the final slice. Monthly refresh adds/updates rows but does not prune
obsolete IDs.

## Bounded daily repair

Each dataset selects at most 200 structural changes per daily run. Larger
backlogs are processed in batches, not rejected. Audit candidates are reconciled
against the current cache first: already-added missing IDs and already-removed
obsolete IDs consume neither requests nor slots. This also allows a repeat run
against the same still-valid audit to make progress.

Selection walks pending IDs in ascending order after the previous batch's last
selected ID, then wraps. The cursor is stored in the existing repair metadata;
unresolved IDs, including 404s, are revisited without blocking later IDs. There
is no new persistent queue or automatic unbounded recovery loop. Network count
retries use only slots left after structural repair, as before.

The two repair metadata files and Actions step summaries report audit changes,
pending/selected/deferred counts, actual additions/removals, failed/not-found
requests, remaining audit changes and request usage. `backlog_remaining` means
the selected batch completed but coverage still needs work. `partial_failure`
indicates a non-404 request failure; a 404 remains pending rather than being
invented as a row or silently dropped. `batch_disabled` means a zero batch size.
Remaining counts describe the inspected audit, not subsequent TMDB changes.
The legacy `cap.exceeded` field describes audit size versus batch size; it no
longer means the whole run was refused.

Daily capacity remains finite: persistent incoming changes above 200 per day
require a reviewed recovery run or a separately reviewed capacity change.

## Request safeguards

- Every collection run reserves requests through the existing committed ledger.
- Each selected missing entity needs details and a discover count. Allowances
  reserve ten attempts per configured ID, covering five attempts per request.
  Removals consume a batch slot but no TMDB request; count-only retries use fewer.
- Daily defaults remain 200 Company and 200 Network IDs: 2,000 attempts each.
- Manual Company batches accept 0–5,000 IDs; Network batches remain 0–200.
  Increasing the batch also increases its reservation. It never bypasses the
  90,000 preferred or 100,000 absolute daily ceiling, protected commitments,
  receipt hashes, workflow/run/attempt identity, or UTC date/month bindings.
- Previous reservations remain charged for that UTC day, including unused
  allowances. Check reservations, not just actual request usage, before recovery.
- Allocation/date exhaustion aborts before either catalogue JSON or CSV is
  written. Individual unsuccessful responses retain their established handling.
- Audit freshness remains 36 hours and the current UTC month. Use a fresh audit
  when crossing a month boundary. A fresh dispatch creates new reservations;
  rerunning only failed jobs can retain an incompatible run-attempt receipt.

## Company recovery procedure

Repository code changes require the normal reviewed PR and owner-approved merge
before production recovery uses them. Recovery requests use real TMDB through
the existing maintenance workflows; never manufacture rows or edit receipts.

1. Read the latest Company audit and repair result on `main`. Run **Audit TMDB
   Export Coverage**, dataset `all`, if the audit is stale or predates a material
   refresh. Wait for its automatic repair to finish before planning recovery.
2. Inspect today's `maintenance/tmdb-request-budget/<UTC date>/reservations`.
   Choose a finite Company batch sufficient for the remaining changes (at most
   5,000), set Network size to `0` for Company-only recovery, and allow for other
   scheduled jobs. Never change or delete receipts to make room.
3. Run **Repair Cache From Audit** on `main`, mode `plan`, with those sizes.
   This checks inputs, audit freshness and current-cache selection without TMDB
   requests, reservations or catalogue writes. The collection reservation remains
   the authoritative check against concurrent work and the day's budget.
4. Dispatch mode `collect` with the reviewed sizes. Inspect both workflow
   conclusion and Company step summary/metadata. Remaining or failed work is not
   a clean cache even if the workflow is green. Reassess before each extra run;
   do not automatically drain an unlimited backlog.
5. Run a fresh audit to confirm coverage, inspect its triggered daily repair,
   and verify automatic Pages publication. New TMDB exports may legitimately add
   new differences. Record run URLs, actual requests and unresolved IDs in the
   recovery issue.

For the 18 November UTC snapshot investigated in #311, 2,512 additions and 174
removals fit a Company batch of 3,000, reserving 30,000 attempts. The base request
estimate is 5,024 before retries. These are dated planning figures, not an
instruction to reuse an obsolete audit or assume today's budget is available.

## Validation boundary

Pure unit tests exercise selection, reconciliation, progress, metadata and
budget math with small ID sets. They do not simulate external TMDB behaviour.
Read-only `plan`/`validate` checks can inspect actual checked-in audits/catalogues
without external calls. Live recovery acceptance uses the existing production
workflow and real TMDB, with the before/after audit and receipts retained as
evidence. Historical mocked collector fixtures are not live acceptance evidence.
