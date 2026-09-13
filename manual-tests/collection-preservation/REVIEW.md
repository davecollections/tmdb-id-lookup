# Preservation investigation final review

Issue [#206](https://github.com/davecollections/tmdb-id-lookup/issues/206), PR [#207](https://github.com/davecollections/tmdb-id-lookup/pull/207). Investigation branch: `work/206-shared-advanced-investigation`; original investigation commit: `ff551b8b04b9adff02466bf52cfb0d29c11a32a2`. That original commit does not identify the later pack. Final PR head and normal merge commit are recorded on the PR and in the preserved closeout receipt.

The investigation and accepted manual evidence are complete. The owner authorized final commit/push, normal merge after passing final-head checks with no blocking reviews/conflicts, synchronized main and cleanup only after proving no unmerged work. No Studio runtime work, upstream workaround, broader Advanced expansion, People/compound-language changes, MDBList work or Worker deployment belongs here.

## Confirmed evidence provenance

The owner confirmed that every method started with a fresh import of the original master. Manage from phone imported and exported through that interface. Direct TV imported through the local network URL, exported on the TV, and the on-device export was retrieved using File Explorer. The compressed transfer decoded to the unchanged master. Exact run times, sync activity, destination isolation and other unrecorded procedural details remain unknown; no internal import/sync/export cause is inferred.

The owner reported the preservation findings in Nuvio Discord; no message link was supplied. Builder creation and export must continue using the correct supported JSON, with no workarounds for upstream sort rewrites, removed exclusions or differing defaults. These findings do not block the approved Studio minimum-votes work.

All four exports retain 6 collections, 24 folders, 68 sources and order. [RESULTS.md](./RESULTS.md) separates website sort changes and phone exclusions from defaults/probes. Historical reconstruction provenance, website preservation and Desktop visual evidence remain separately scoped. No owner compatibility tests repeat at closeout.

## Complete combined PR inventory

**28 files total:** original 14-file investigation plus 14 additional preservation/check files. The 18-file preservation working-tree checkpoint overlapped four investigation files; final provenance and approved issue scope also update existing documents. Each path appears once.

| File | Scoped purpose |
| --- | --- |
| `.gitattributes` | LF attributes for authored preservation artifacts. |
| `docs/v2/BUILDER_KNOWLEDGE.md` | Assessment, product/source-edit checkpoint or approved Studio scope. |
| `docs/v2/BUILDER_PRODUCT_PLAN.md` | Assessment, product/source-edit checkpoint or approved Studio scope. |
| `docs/v2/BUILDER_SOURCE_EDITING.md` | Assessment, product/source-edit checkpoint or approved Studio scope. |
| `docs/v2/SHARED_ADVANCED_ASSESSMENT.md` | Assessment, product/source-edit checkpoint or approved Studio scope. |
| `docs/v2/STUDIO_MINIMUM_VOTES_ISSUE_DRAFT.md` | Assessment, product/source-edit checkpoint or approved Studio scope. |
| `manual-tests/collection-preservation/.gitignore` | Exclude private returned files, images, archives and result folders. |
| `manual-tests/collection-preservation/206-collection-preservation-master.json` | Unchanged authored 6-collection / 24-folder / 68-source master. |
| `manual-tests/collection-preservation/README.md` | Reusable test instructions and confirmed actual routes. |
| `manual-tests/collection-preservation/RESULTS.md` | Authored findings, exact byte identities and provenance limits. |
| `manual-tests/collection-preservation/REVIEW.md` | This combined inventory, retained validation and closeout record. |
| `manual-tests/collection-preservation/case-manifest.json` | Generated original case manifest and typed values/probe scope. |
| `manual-tests/collection-preservation/case-manifest.md` | Generated original case manifest and typed values/probe scope. |
| `manual-tests/collection-preservation/comparison.md` | Generated original-value table with blank result columns. |
| `manual-tests/collection-preservation/generate-pack.mjs` | Reproduce master, manifest, original-value table and blank log. |
| `manual-tests/collection-preservation/run-log-template.json` | Blank route metadata template; actual run logs remain private. |
| `manual-tests/collection-preservation/serve-master.mjs` | Bounded plain/gzip local master transport helper. |
| `manual-tests/shared-advanced/README.md` | Original investigation instructions or opt-in evidence tooling. |
| `manual-tests/shared-advanced/fixtures/01-unchanged-round-trip.json` | Authored original investigation input recipe. |
| `manual-tests/shared-advanced/fixtures/02-native-people-votes.json` | Authored original investigation input recipe. |
| `manual-tests/shared-advanced/fixtures/03-native-studio-network-votes.json` | Authored original investigation input recipe. |
| `manual-tests/shared-advanced/fixtures/04-compound-locale-probes.json` | Authored original investigation input recipe. |
| `manual-tests/shared-advanced/generate-fixtures.mjs` | Original investigation instructions or opt-in evidence tooling. |
| `manual-tests/shared-advanced/probe-production.mjs` | Original investigation instructions or opt-in evidence tooling. |
| `scripts/check-all.mjs` | Include focused investigation checks and generated-pack consistency. |
| `scripts/investigate-shared-advanced.mjs` | Shared import audit and stable-identity typed comparison/matrix. |
| `tests/collection-preservation.test.mjs` | Pure investigation/comparator/generator/helper regression coverage. |
| `tests/shared-advanced-investigation.test.mjs` | Pure investigation/comparator/generator/helper regression coverage. |

No Builder/v1 runtime, production data, Worker, dependency or unrelated files change. Only authored inputs and generated blank templates enter Git; private exports/screenshots, matrices, logs, responses and archives stay outside Git.

## Validation

- `node --test tests/shared-advanced-investigation.test.mjs tests/collection-preservation.test.mjs`: **23 passed** after the duplicate/default comparator corrections, including the original investigation regressions. The required repository run below also validates the final gzip-helper test.
- `node manual-tests/collection-preservation/generate-pack.mjs --check`: **passed**. Master, manifest, original-value table and blank log are reproducible.
- `node --check` for the changed/new comparator, generator, server and focused test: **passed**.
- `scripts/check.cmd`: the first full run stopped at the existing mounted Genre Preview assertion, `tests/builder-source-edit-mounted.test.mjs:2473`: at 900px, `focusRestored` was false while configuration, revision and overflow checks passed. This is a failure of an existing test on unchanged runtime files; no root cause is claimed.
- One rerun of the unchanged full `builder-source-edit-mounted.test.mjs` suite: **49 passed, 0 failed, 7 existing skips**. The focus-restoration failure did not repeat. The original full run is still recorded as a nonzero result, not relabeled as a clean run.
- All eight subsequent checks that the full run had not reached were run separately and **passed**: fixture line endings, Windows validation, Add Source/People/Genre/Source Edit fixture checks, migration regeneration consistency and migration export verification.
- `git diff --check`: **passed**. Inventory reconciliation: **6 modified + 12 added = 18 files**, nothing staged. Returned-export/screenshot/result paths are ignored. No private payloads are in this inventory.
- Local master transport: original and compressed routes return the identical 35,181-byte decoded file with the expected SHA-256. The gzip transfer is 3,187 bytes. The owner confirmed Fire TV beta 0.9.2 import succeeded; its direct exported file is now supplied and compared. The helper exposes only the two named master routes; unrelated paths and write requests are rejected.

Logs are retained outside Git as `tmdb-206-preservation-check.log`, `tmdb-206-preservation-mounted-retry.log`, `tmdb-206-preservation-remaining-checks.log` and `tmdb-206-preservation-focused-checks.log`. Existing live production regressions are separate from the new master's saved-JSON scope. No fabricated external responses or replacement title data were introduced. The pre-publication checkpoint had no new CI run; final-head CI is recorded in PR #207. The fresh complete repository run after the comparator and gzip-helper updates passed with exit code 0. Its log is retained as repository-check.log in the returned-evidence folder; this successful run does not erase the earlier recorded failure.

## Final closeout validation

The final closeout scripts/check.cmd passed completely with exit code 0, including 23 focused investigation/preservation tests, generator consistency and required production-path browser regressions. The log is retained outside Git as closeout-repository-check.log. The combined 28-file staged inventory, credential/private-export audit and whitespace check passed. Final-head CI is verified separately in PR #207 before merge. Earlier runs above retain their original meaning. Final-head checks must pass with no blocking reviews or conflicts before the authorized normal merge. Verify issue closure, main checks and automatic Pages publication before safe cleanup. No Worker deployment occurs.

## Evidence and handoff

The existing private Drive archive `206-shared-advanced-review.zip` remains unchanged: 22,400,702 bytes, modified `2026-09-13T01:25:26.315Z`. Received ZIP, exact exports, full comparisons and prior review packages remain preserved outside Git. The investigation-owned test-file server was already stopped; do not stop unrelated services.

[Published results](https://drive.google.com/file/d/1zXxRIjzTdn0ibai8LWfuk9qCtwyGfcFe/view) and this review remain in the [existing handoff](https://drive.google.com/drive/folders/1UX13DDs1kPqO-Mw1v55HkbTK_ehiPKwi). Prior publication/rejection records remain historical; no private archive is replaced.

The [approved Studio scope](../../docs/v2/STUDIO_MINIMUM_VOTES_ISSUE_DRAFT.md) starts separately: four flows, shared expandable Advanced, optional/unset minimum votes with explicit zero, Discover controls/validation, native identity and untouched imports, current-draft Preview/Review/export/duplicates, no expected Worker change. Broader Advanced, People and compound locale work remains recorded for later scope.
