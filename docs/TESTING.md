# Repository Testing

## Workspace Import and Merge artwork (#259)

Run `node --test tests/builder-import-merge.test.mjs tests/builder-workspace-import.test.mjs tests/builder-nuvio-import.test.mjs tests/builder-welcome-import.test.mjs` for every artwork field under all policies, absence/null/blank/unsupported values, no-deletion, exact text/raw preservation, unchanged matching/dedupe/order, input-source parity, file limits/errors, stale review, complete planner/controller equality and atomic apply. Related importer/controller/serializer/presentation/export/Send suites provide focused regression evidence.

The existing workspace browser lifecycle and import fixture provide a **local-only** scenario using the production app/controller and real unsubmitted Nuvio login:

```powershell
$env:WORKSPACE_IMPORT_ONLY = "1"
$env:WORKSPACE_IMPORT_SCREENSHOT_DIR = "C:\path\outside-repository\import-review"
node --test --test-name-pattern="mounted workspace Import" tests/builder-bulk-edit-mounted.test.mjs
Remove-Item Env:WORKSPACE_IMPORT_ONLY
Remove-Item Env:WORKSPACE_IMPORT_SCREENSHOT_DIR
```

Its 56 layout states cover 360/384/393/402/412/899/900/901/1280px, 393×400, 200% text, forced colours and reduced motion. Assertions cover local errors/warnings, native-file/pasted draft retention, Nuvio handoff without overlapping dialogs, Add/Merge/Replace, policy counts/reset, stale refresh, safe Replace focus, cancellation/late-read rejection, one content scroll owner, no horizontal overflow, reachable actions and native keyboard focus/restoration. Local examples use emoji payloads and no fabricated external media URLs/responses; zero external requests are asserted. These checks make no authenticated live Nuvio review claim. Pure snapshot-adapter parity and connection tests remain separate evidence; historical owner-authorized mock suites are not substitutes for current live service acceptance.

The existing `NUVIO_WELCOME_ONLY=1` / `--test-name-pattern="mounted Nuvio welcome"` check retains 44 local Welcome layouts and four direct-creation cases. Grouped PR CI supplies final-head coverage without repeatedly running full local validation. Retain frontend/four-fixture guards, production build and Git hygiene.

## Optional Source naming (#257)

`tests/builder-source-names.test.mjs` exercises untouched and title-only serialized Add output for all nine families, stable recipe keys, dormant/reordered/new candidates, blank/equivalent/invalid title states, destination duplicate/consent independence, Preview parameter identity and retained strict guided validation. Synthetic inputs here are pure contract fixtures, not external-service evidence. Run this with affected Add, hierarchy, capability, serialization and Preview suites plus frontend/fixture guards and the production build.

Set `TMDB_SOURCE_NAMES_ONLY=1` and run `node --test --test-name-pattern="mounted optional Source naming" tests/builder-source-edit-mounted.test.mjs`. The existing browser lifecycle runs all nine real flows at phone/desktop widths, plus 360/384/402/412/899/900/901, short height, 200% text, forced colours and reduced motion. It checks collapsed/lazy rows, canonical labels, effective output, invalid-field recovery, blank/equivalent/reset, focus and action reachability, and saved title-only output. Live entity resolution and explicit representative Preview use approved production providers. `TMDB_204_SCREENSHOTS` writes compact review evidence outside Git. Normal full Source CI includes these cases; do not repeat the full local suite simply before push or merge.

## Builder Back to top (#236)

Set `BUILDER_BACK_TO_TOP_ONLY=1` and run `node --test --test-name-pattern="mounted Back to top" tests/builder-bulk-edit-mounted.test.mjs`. The existing mounted browser/Collection fixture checks the real workspace at 360/384/393/402/412/1280px, including a 70-Folder Collection and a 40-Source Folder. It covers window scroll ownership, threshold visibility, native pointer/keyboard activation, actual smooth/immediate motion, focus without extra scrolling, unchanged controller state/mobile level, and ordinary/Export modal inert protection. These project-local checks make no external requests. Optional `BUILDER_BACK_TO_TOP_SCREENSHOT_DIR` writes phone/desktop evidence outside Git.

Run `node --test tests/builder-ui.test.mjs tests/builder-hierarchy-menu-placement.test.mjs tests/builder-welcome-import.test.mjs` for the focused shell and reused motion/focus-helper regressions, plus `npm run build --prefix builder` and Git hygiene. A full suite is unnecessary for this bounded workspace-only control.

## Collection Folder management (#232)

`tests/builder-collection-folder-management.test.mjs` owns bounded remove/permutation validation, rollback, one-revision/no-op behavior, selection recovery, surviving-object/raw preservation, 70/200-folder scale, actual-V1 comparator parity, People eligibility, shape consensus, atomic Collection/child settings, authority failure, stale sessions and reopened curated URLs. The ordinary artwork suite additionally verifies the shared patch helper across existing family authorities. Run affected domain/controller/presentation/editor/hierarchy/artwork tests while changing these seams.

The existing `tests/builder-bulk-edit-mounted.test.mjs` browser lifecycle also hosts `builder-collection-folders-mounted.html`: actual Builder UI and controller, local imported project structures, real production artwork authorities/clients, and no fabricated external responses. It covers all nine owner widths (360/384/393/402/412/899/900/901/1280), Mixed/uniform/atomic shape, exact custom preservation, compact ordered retained selection, an always-visible irreversible-action warning, 70/200 rows, generated/imported People and generic sorts, immediate native pointer reorder, focus recovery and forced-colours keyboard checks. `COLLECTION_FOLDERS_SCREENSHOT_DIR` optionally saves phone/desktop review images outside Git, including artwork before/after; screenshots supplement assertions. The new pure suite is included in the documented full runner. One full validation is appropriate at readiness because this issue adds destructive controller/domain operations; repeat only for a new failure or unresolved concern. Set `COLLECTION_FOLDERS_CORRECTION_ONLY=1` to run only Remove/Sort correction scenarios at 393/900/1280px, 200-folder selection, imported People, short-viewport reachability and native keyboard/forced-colours checks; unrelated mounted scenarios are skipped. Set `BUILDER_MANAGEMENT_PRESENTATION_ONLY=1` for the final Sort geometry/Global display settings terminology checks only: ordinary/People Sort at 360/393/899/900/1280 and 393×320, native focus/Escape/restoration, and Global display settings heading/trigger/dialog labels. Existing behavior fixtures and internal BulkEdit names remain unchanged.

## Risk-based validation

Run checks when they answer an unanswered question about the change. Choose validation by scope and regression risk, not merely because implementation, push, review or merge has reached another stage.

- During implementation, run focused checks for the changed area and tests introduced or materially affected by the change.
- Use broader/full validation for code, shared contracts, serialization, runtime, browser behavior or wider changes when it answers a real regression question. For meaningful implementation, the full suite normally runs once around implementation/owner-review readiness when it provides useful evidence; new changes, failures or unresolved concerns may justify more.
- For documentation/copy-only or bounded maintenance changes that cannot affect application/runtime behavior, use targeted Markdown, practical local link/heading checks, stale-wording searches, formatting review and Git hygiene. Do not run the full application suite or mounted/live-service/Worker checks solely because documentation changed; use them only if the documentation change genuinely needs that evidence.
- PR CI provides independent validation of the final pushed head. If the reviewed head is unchanged and PR CI passes, do not automatically rerun the full local suite immediately before merge.
- Keep `git diff --check` and worktree/status checks as lightweight hygiene. Report what was checked and why broader checks were or were not needed.
- Visual/runtime/manual evidence remains required when the change depends on it. A required live integration check cannot be replaced with synthetic data, silently skipped, or downgraded under this policy. The detailed production-integration boundary and retained evidence below still apply.

`scripts\check.cmd` remains the full Windows repository-validation entry point; `node scripts/check-all.mjs` runs the equivalent full sequence on any platform. Neither is automatically required for every documentation or copy correction.

## Local and CI validation groups (#247)

`scripts\check.cmd` and `node scripts/check-all.mjs` still run the complete ordered local inventory. CI runs that same inventory in four independent jobs using `node scripts/check-all.mjs --group <group>`. `--list` prints the selected commands without executing them.

| Group | Coverage |
| --- | --- |
| `core` | Every existing command except the three browser suites below, plus orchestration regressions. CI also retains the production build and combined code-only Pages artifact preparation/validation. |
| `source` | `tests/builder-source-edit-mounted.test.mjs`: source editing, hierarchy and live Preview. |
| `workspace` | `tests/builder-bulk-edit-mounted.test.mjs`: Bulk Edit, Import, Export, Send and Collection management. |
| `artwork` | `tests/builder-folder-card-artwork-mounted.test.mjs`: Folder artwork and settings. |

Each worker has its own checkout, dependency installation, validated keyword restoration, temporary caches, browser profiles and local servers. There is no shared build output. Source/Preview scenarios retain their internal order, production clients and request/cache protections; the other browser groups retain their existing published artwork reads. Keyword restoration reads an existing validated bundle, not a fresh TMDB export. Scheduled maintenance reservations and their daily budget are unchanged.

The existing `validate` check is the final aggregate. It runs after all four workers and succeeds only when each reports `success`; setup/test failures, missing, skipped, cancelled, neutral or unknown worker results cannot produce a green aggregate. PR, main-push and manual triggers remain enabled. Only a newer run for the same PR cancels its predecessor; non-PR runs have unique concurrency groups. There are no path filters or docs-only routes.

`[CI timing]` lines report command and mounted phase elapsed time using a monotonic clock. Repeated phase segments are summed; cleanup reports timings on failure as well as success. These measurements impose no performance thresholds. TAP may still charge the shared `before()` hook to its first test; use the named phase output for diagnosis.

Shared Export regressions live in `tests/helpers/export-mounted.mjs`: the three existing viewport scenarios and Editor/Feedback/Warning/Large cases execute once in full Workspace validation. The existing Send and Export assertions both inspect these results. Export-specific keyboard, forced-colour, disclosure and dismissal checks remain in the enclosing suite. Focused Send (`NUVIO_SEND_ONLY=1` with the existing Send name pattern) invokes the same helper itself; existing Export test name patterns still select the Export assertions. All responsive matrices and Send states remain intact.

## GitHub Actions runtime maintenance (#228)

External JavaScript Actions use Node 24 implementations, independently of the Node version installed for repository scripts. All explicitly configured workflow scripts use Node 22, including the genre-count update; the export-audit planning job continues to use the runner-provided Node. Jobs without package caching explicitly set `package-manager-cache: false`, while Nuvio validation and Pages retain their existing npm caches. Pages uses `upload-pages-artifact@v5` with `include-hidden-files: true` to preserve the previous packaging behavior inside the validated staging boundary.

For Action/runtime-only changes, parse the workflow YAML, compare workflow structure and inputs against the baseline, and run focused maintenance, request-budget, keyword-artifact, Pages-boundary and genre-reference checks. Natural PR CI provides hosted validation; observe Pages and scheduled maintenance through their ordinary runs instead of dispatching collection jobs or consuming extra TMDB budget solely to prove a version update.

Nuvio validation retains its pull-request, main-push and manual triggers. The #247 grouping above supersedes the original monolithic CI execution. Maintenance-validation architecture remains deferred: maintenance commits made with `GITHUB_TOKEN` do not trigger push-based Nuvio validation, and Pages still uses its existing independent push and maintenance-completion triggers. The runtime upgrade does not close that coverage gap.

## Guided creation presentation (#230)

`tests/builder-choice-presentation-contract.test.mjs` owns the shared stage-intro and semantic choice contract. Run it with the affected family UI tests for all nine guided families and the shared Add/Edit controls; these source/static-render checks do not claim live integration evidence.

For focused mounted evidence, set `TMDB_GUIDED_PRESENTATION_ONLY=1` and run `node --test --test-name-pattern="mounted guided presentation" tests/builder-source-edit-mounted.test.mjs`. It reuses the existing browser lifecycle, production providers and optional `TMDB_204_SCREENSHOTS` capture directory outside Git. It visits all nine families at 393px and 1280px, Decades at 360/384/402/412px, Genres and Discover at 899/900/901px, and Decades/People/Discover in forced colours. Decades also covers short height, enlarged text and reduced motion. Current checks retain operation headings and verify Filters helper, one/two semantic groups, clear recovery, native keyboard toggling and boundaries. Two additional physical Discover Edit cases verify cyan scalar sort and watch region with the live provider catalogue loaded. Two launcher cases also check the exact Create/Add family order at phone and desktop widths. The 38 cases check shared stages, cardinality palettes, structural selection, keyboard activation/focus, scroll containment, fixed actions, focus restoration and cancellation without saved project mutation. This opt-in avoids rerunning unrelated historical mounted scenarios; owner desktop and physical-phone review remains separate.

For the #230 owner-review Include/Exclude correction, set `TMDB_SEMANTIC_PRESENTATION_ONLY=1` and run `node --test --test-name-pattern="mounted semantic Include Exclude" tests/builder-source-edit-mounted.test.mjs`. Eight focused runs at 393px/1280px reuse the existing Decades/Genre hierarchy secondary-rule, Discover, Studio shared/custom and Network Source Edit scenarios, including live keyword selection. They assert computed green Include, red Exclude with all four dashed edges, cyan Any/All, neutral inactive modes, retained ordinary multi-selection and no saved mutation. Optional `TMDB_204_SCREENSHOTS` writes the focused review evidence outside Git; the previous 73-image matrix need not be repeated.

The mounted fixture imports `styles.css` before component styles, matching `main.jsx` and lazy-loaded flows. Loading the shared stylesheet last masked a real #230 cascade regression: neutral Advanced pill rules overrode selected colours in the actual preview. Keep neutral component rules less specific than shared selected states, and verify the running application as well as the fixture after presentation changes.

## Live external-service boundary

Mounted-browser, integration, end-to-end, owner-review, and live-behaviour tests that exercise an external service must use the approved live service through the production integration path. Do not substitute fabricated titles, counts, response rows, resource or artwork paths, poster paths, URLs, response bodies, fake image/CDN servers, or fake Preview servers merely for determinism, convenience, request minimisation, offline execution, or a green result. When the approved service is unavailable, classify and report the external-service failure instead of manufacturing replacement behaviour.

Synthetic or injected data remains appropriate for narrow pure unit tests where external integration is not under test, including validators, sorting logic, plan construction, parsers, malformed-input rejection, cache TTL/LRU mechanics, stale-state logic, and abort/error mechanics. Do not rewrite those pure units to call live TMDB. A development-only mock may help inspect isolated presentation mechanics, but it is not mounted/integration/end-to-end, owner-acceptance, or live-behaviour evidence.

The canonical mounted Network Preview validation introduced through issue [#126](https://github.com/davecollections/tmdb-id-lookup/issues/126) deliberately uses the production Worker, real TMDB responses, and real `image.tmdb.org` resources. The normal repository check includes this mounted suite, so an external-service outage may make that check fail for an external reason.

Genre hierarchy issue [#130](https://github.com/davecollections/tmdb-id-lookup/issues/130) adds deterministic pure-unit coverage for exact source-draft query mapping, complete-query cache identity/lifecycle, and the narrow fail-closed Worker validator. Those injected units are not live evidence. After Dave manually deployed Worker version `857c1fa3-e62d-4fd8-9321-9573aedb1906` on 2026-08-21, the mounted Genre Preview scenario became an active required production-path check using the production Worker, real TMDB, and real `image.tmdb.org` posters for Movie, TV, lazy shared-media switching, Advanced filters, and exclusions at mobile and desktop widths. The second issue #130 correction makes exactly one canonical `include_adult=false` mandatory for every Genre Preview request and Worker acceptance. Dave confirmed deployment of the corrected 10,479-byte source on 2026-08-21; no second deployment version identifier was supplied. The production path then passed canonical-false Movie/TV/Advanced/exclusion behavior and rejected missing, true, duplicated, and generic Discover requests. This mounted scenario remains required; if the external path later fails, report it rather than bypassing, skipping, or replacing it with synthetic integrated responses.

Streaming hierarchy issue [#162](https://github.com/davecollections/tmdb-id-lookup/issues/162) extends the same canonical mounted suite across 360, 384, 393, 402, 412, 899, 900, 901, and 1280 pixels using the live three-response provider catalogue. The live matrix enters through New Collection with three same-title overlap candidates, proves overlap-first/project-order ranking, consistent UI-only **Collection 1/2/3** labels, exact partial deltas, reliable Folder/Source context, and no automatic choice. It switches New → existing → New while preserving Collection and logical new-Folder title drafts, selects the Apple TV Store/Dekkoo AU+US Both route, proves its one-existing/one-new/six-source Review delta, validates naming, leaves both unselected Collections byte-for-byte unchanged, preserves existing custom artwork/focus fields, leaves new unknown artwork unassigned, performs zero mutation before Apply, and updates only the selected Collection in one revision without creating a Collection. Responsive assertions cover label wrapping/no horizontal overflow, retain selected Region border/surface/tick while removing the redundant cyan left rail, and verify selected-service reconciliation for retained, partially pruned, and fully pruned Media/Region changes plus the compact three-folder name editor. Its 393px and 900px Preview cases use the production Worker, real TMDB Discover responses, and real `image.tmdb.org` posters for exact provider/Region/media/Sort drafts.

The same nine-width mounted suite has a deterministic owner-style import case for project-local affinity behavior that does not exercise an external service: two richly configured folders and six mixed preserved sources qualify the existing Collection from valid compound/alias Watch Provider plus Watch Region Discover content. A new Crunchyroll AU Movie/TV selection has zero exact overlap, remains unselected by default beside **Create new collection instead**, reports the explicit all-two-will-be-added copy, plans one new sibling Folder with no existing-Folder update, and applies once. It checks unchanged Collection identity/editable/raw data, exact existing Folder/source nodes and serialized output, and unassigned new artwork. Focused deterministic tests separately prove exact-before-affinity/project-order ranking, title/list/artwork/network-only negative cases, strict Collection-versus-Folder trust, unsafe exclusion, conflict visibility, stale rejection, project-order relabeling, artwork preservation, and New Collection no/partial/complete duplicate matching. A mounted deterministic unique-title complete-overlap case proves the unsuffixed label, exact no-project-changes copy, zero-change existing **Close** route, and separately confirmed duplicate-New route. Synthetic 20/50/100 provider data remains limited to deterministic selection/planning/scale mechanics and is not reported as live integration evidence. If the live catalogue, Worker, TMDB, or image CDN is unavailable, report that external failure rather than replacing the mounted response or resource path.

## Direct Nuvio import (#238)

The owner explicitly authorizes mocked/local Nuvio responses for this first connection slice, including mounted checks. Automation uses no live account credentials. The owner separately reported successful live login, profile avatars, PIN verification, profile pull/import, Add/Replace, backup and transient success after pass 2. This is bounded evidence of transport/UI mechanics and local preservation, not a live Nuvio integration claim; the live-service rules for other features remain unchanged.

Run `node --test tests/builder-import-merge.test.mjs tests/builder-import.test.mjs tests/builder-controller.test.mjs` for exact/ambiguous/invisible title matching, parent boundaries, preservation/order, fail-closed Source dedupe, insertion-only ID repair, atomic failures, preview purity and one-revision apply. Run `node --test tests/builder-nuvio-import.test.mjs tests/builder-welcome-import.test.mjs` for security/PIN/identity races, envelope validation, distinct local modes, all modes after expiry with zero requests, grouped notes and Welcome/workspace presentation. Shared serializer/ID/export tests retain regression coverage.

The mounted checks reuse the Bulk Edit/export browser lifecycle and exercise the production Builder application, transport and controller through a local Nuvio fetch adapter:

```powershell
$env:NUVIO_IMPORT_ONLY = "1"
$env:NUVIO_IMPORT_SCREENSHOT_DIR = "C:\path\outside-repository\nuvio-review"
node --test --test-name-pattern="mounted Nuvio" tests/builder-bulk-edit-mounted.test.mjs
Remove-Item Env:NUVIO_IMPORT_ONLY
Remove-Item Env:NUVIO_IMPORT_SCREENSHOT_DIR
```

The avatar fallback regression in [#240](https://github.com/davecollections/tmdb-id-lookup/issues/240) reuses this fixture and a real local repository image. It dispatches errors before mount and URL-change passive effects, then uses React act to settle the actual state transition. It also covers later errors, stable fallback, replacement and returning URLs, stale callbacks, and explicit retry. These are local component/hook checks, not external-service evidence; no fixed sleep is used to hide an error/reset race.

The six optional screenshots are landing desktop/phone, Profile phone, Merge Review desktop/phone and workspace after success. Mounted coverage exercises the unified Import hierarchy, sole native filename display, real local file/paste import, Profile Refresh/footer, shared Back, no backup action, all three modes, pure merge preview/counts, AU timestamp, grouped notes without raw paths, and success-only workspace feedback. It retains login/PIN/error/race/expiry/disconnect coverage, safe avatar fallbacks, compact rows, body/focus restoration, shared selection and forced colours. Selection/scrolling keep success; a content edit clears it. Nine stages (including landing, verified/locked PIN, expired Review and replacement confirmation) run at 360/384/393/402/412px, desktop and short height: 63 layouts. The normal full runner includes these checks alongside existing live-service mounted suites; the Nuvio mock approval does not permit mocks for those services. Select focused, mounted, build and full validation under the risk-based policy above.

### Compact Import and desktop PIN presentation (pass 5)

The bounded follow-up uses the existing harness with `NUVIO_WELCOME_ONLY=1` and `node --test --test-name-pattern="mounted Nuvio" tests/builder-bulk-edit-mounted.test.mjs`. This opt-in uses the production disconnected connection, opens/closes its login dialog without submitting credentials, and exercises only local file/paste import. It sends no external requests and fabricates no service responses. It checks the initial prompt, retained native File and JSON draft, inactive-form submission/focus, busy guard, dialog focus restoration and 44 layouts: initial/file/JSON/disconnected Nuvio dialog at 360, 384, 393, 402, 412, 768, 899, 900, 901, 1024 and 1280px. Checks include stable desktop panel/card heights, compact internally scrolling JSON, icon-free primary/supporting method labels, non-interactive journey labels without underlines, restrained shared selected styling, native Enter/Space activation and visible focus/selection with forced colours and reduced motion. The existing `NUVIO_IMPORT_SCREENSHOT_DIR` captures eight desktop/phone screenshots outside Git.

Pure journey presentation assertions cover all three current/completed stage combinations, accessible current-step semantics and the absence of numbered/clickable navigation. Pure PIN presentation assertions in `builder-welcome-import.test.mjs` cover masked/labelled desktop and mobile fields, incorrect/lockout feedback and verified text. They do not establish live PIN behavior. Profile/PIN browser screenshots and verification must use a live authenticated production connection; the historical mocked lane is not a substitute for that evidence. The unchanged transport retains prior owner live acceptance. This UI-only pass runs focused tests and the production build; the previous full-suite result is reused unless scope expands.

<a id="nuvio-send-foundation-244"></a>

## Nuvio Send (#244 / PR #245)

### Stable commands and evidence boundary

Automated checks use the owner-authorized mocked/local Nuvio mechanics approved for #238/#244, through the production transport, connection, coordinator and UI. An independent fixture tripwire rejects uninjected calls to `api.nuvio.tv`. Automation uses no live credentials and performs no authenticated live writes; its results establish mechanics, not hosted-write acceptance. This exception does not relax the live-service boundary for other integrations.

The focused regression command covers Send, shared Import/PIN, manual Export, controller/project identity, IDs, serializer/defaults and local Merge:

```powershell
node --test tests/builder-nuvio-send.test.mjs tests/builder-nuvio-send-ui.test.mjs tests/builder-nuvio-import.test.mjs tests/builder-export-collections.test.mjs tests/builder-controller.test.mjs tests/builder-auto-ids-workspace-flow.test.mjs tests/builder-serializer.test.mjs tests/builder-export-defaults.test.mjs tests/builder-import.test.mjs tests/builder-import-merge.test.mjs tests/builder-welcome-import.test.mjs tests/builder-ui.test.mjs
npm.cmd --prefix builder run build
git diff --check
git status --short
```

Choose subsets and broader checks under the risk-based policy. The pure suites and complete mounted matrix are registered in `node scripts/check-all.mjs`, also invoked by `scripts\check.cmd` on Windows. Documentation-only edits do not require that full sequence or a production build.

<a id="export--send-ui-244-pass-2"></a>

### Mounted Export & Send

The fixture reuses the Bulk Edit/Export browser lifecycle and production Builder UI through `tests/helpers/nuvio-send-mounted.mjs`, without a parallel launcher.

```powershell
$env:NUVIO_SEND_ONLY='1'
$env:NUVIO_SEND_SCREENSHOT_DIR=Join-Path $env:TEMP 'nuvio-send-review'
node --test --test-name-pattern='mounted Nuvio Send' tests/builder-bulk-edit-mounted.test.mjs
Remove-Item Env:NUVIO_SEND_ONLY
Remove-Item Env:NUVIO_SEND_SCREENSHOT_DIR
$env:NUVIO_IMPORT_ONLY='1'
node --test --test-name-pattern='mounted Nuvio local mock' tests/builder-bulk-edit-mounted.test.mjs
Remove-Item Env:NUVIO_IMPORT_ONLY
```

`NUVIO_SEND_LOCAL_ONLY=1` optionally limits the Send fixture to local interactions/native PIN checks without the layout/Export matrix; retain the documented test-name filter and clear the variable afterward. The normal runner includes the complete matrix. Screenshots are optional evidence outside Git, supplementing assertions.

**Download testing:** the fixture records the normal production adapter's Blob bytes, filename and anchor click while suppressing physical navigation. Optional backup retries assert identical bytes/filename, no requests or state advancement, and no dependency between downloading and Replace. These checks establish initiation mechanics, not physical file retention. The fixture is not a production entry and adds no bypass or fake credentials to production.

<a id="send-hardening-244-pass-3"></a>

### Send safety and UI coverage

Foundation checks cover frozen canonical proposals and usable unique IDs; exact project/account/profile/PIN authority; raw JSON, timestamp and blob-presence comparison; fresh preflight; synchronous final guards; one dispatch; no write retry; 204 versus uncertain outcomes; readback; true no-op; read-only reconciliation; and retained evidence across interruption, disconnect and project replacement. Cancelled/stale reads, uncooperative fetch/body adapters and stale Review handlers cannot authorize a new write. Optional backup is checked independently using the exact raw reviewed array, including missing-row `[]`, without authentication/diagnostic/account metadata.

Shared Import/Send PIN coverage includes zero requests at one/two/three digits, one verification at four digits or valid paste, rejection of mixed/overlong values, immediate clearing, wrong-PIN focus/fresh entry, lockout/cooldown without replay, duplicate events, stale completion and target/account/protection changes. Exact A → B → A grant reuse remains covered. Local Import snapshot expiry and Add/Merge/Replace regression checks remain in their existing suites.

Review assertions use exact frozen/current counts and Collection-ID removal membership, including zero/one/many, equal totals with different IDs and unreliable-ID fallback. Merge instead reuses one modal/body lock and current login/PIN authority, reads a fresh snapshot, changes no project until explicit local mode/application, and performs zero `sync_push_collections` calls.

Responsive coverage includes 360/384/393/402/412/768/899/900/901/1024/1280px widths, phone/desktop short-height cases, enlarged text, forced colours and reduced motion. It covers connection/PIN/read/progress/results/history, long names and large lists; comparison columns from 768px and stacking below; no horizontal overflow; reachable 44px controls; one content scroll owner; and native keyboard/radio operation. These are emulated browser checks, separate from physical-phone acceptance.

Modal assertions retain one focus trap/body lock and inert background. Stable Review allows Back/Close/Escape; active connection, PIN, Review/preflight, dispatch, verification and read-only checking reject ordinary dismissal. Centered active heading/support/dots remain understandable through semantic status; decorative dots are aria-hidden and static under reduced motion. Verified/no-op/rejected completion uses Done only, while unverified/unknown/conflict results retain their distinct read-only checking path. Verified history stays quiet inside Export & Send; unresolved attention remains reachable.

Manual Export coverage retains exact bytes/filename, authoritative counts, blocking diagnostics/editor return, deterministic four-second feedback, clipboard/download failures, large projects and zero Nuvio requests. Non-blocking preservation-warning UI is absent while underlying diagnostics and serialized output remain unchanged.

<a id="244-owner-live-acceptance-and-final-pr-preparation"></a>

### Historical #244 validation and final acceptance

**Earlier local full run, 2026-09-24:** the run failed at the unchanged People Configure 360px Automatic override assertion, which observed `Acting Movies…` / `Acting Series…` while role counts were loading instead of the expected Directed Movies selection. The fixture waited for rows rather than completed counts, while production role controls were disabled during loading. This indicated a pre-existing readiness race, not a demonstrated Send/PIN regression. No People production or harness code was changed by #244. The unchanged focused command `node --test --test-name-pattern='mounted People Configure stays compact' tests/builder-source-edit-mounted.test.mjs` passed across all nine owner widths; unreached tail checks were completed separately. That initial full run remains a failed run and was not retrospectively made green by the focused pass.

The final Export warning-removal and centered-progress cleanup passed focused Export/serializer/Send checks, the affected mounted responsive/accessibility matrix, shared PIN/local Merge interactions, manual Export regressions, production build and Git hygiene. A new mounted expectation initially assumed an emptied `catalogSources` array would be absent; correcting the expectation to the unchanged empty-array contract made the rerun pass without a production logic change. The full local suite was not repeated solely for the final presentation cleanup. The existing bundle-size advisory remained.

**Owner-operated live acceptance:** authenticated Nuvio Send succeeded on a physical iPhone, including protected-profile four-digit PIN auto-verification, Review, fresh preflight, one real replacement and exact readback verification. The owner independently confirmed the expected Collections were present and working in Nuvio, required no restoration, and repeated the complete mobile flow successfully after presentation polish. This is bounded evidence for the tested flow, not broad browser/device/client certification. No private profile/account details or automated authenticated write are recorded. Optional backup-file retention remains unverified.

**Final integration:** [PR #245](https://github.com/davecollections/tmdb-id-lookup/pull/245) passed [final-head validation](https://github.com/davecollections/tmdb-id-lookup/actions/runs/35968179710) and merged as `2dd4652fe23a9ee7d38d5238a3c843504ecca172`, closing #244. [Post-merge Nuvio Contract Validation](https://github.com/davecollections/tmdb-id-lookup/actions/runs/35972599861) and [automatic Pages publication](https://github.com/davecollections/tmdb-id-lookup/actions/runs/35972599829) succeeded. These later green runs are independent evidence and do not erase the earlier local timing failure. No Worker deployment or manual site publication was involved.

## Mounted browser lifecycle

Studio/Network Shared Advanced (#218) reuses the native fixture with combined locale, genres, keywords, date/year and threshold settings. Run `TMDB_NATIVE_SHARED_ADVANCED_ONLY=1` with `node --test --test-name-pattern="mounted native Shared Advanced|mounted Network hierarchy locks" tests/builder-source-edit-mounted.test.mjs`. The focused run covers all eight family/surface types across phone, desktop and short height, plus one 360/384/393/402/412px disclosure sweep. It checks genre default/custom/reset, Studio Both, explicit exact-query Preview/cache and real response/poster or empty-state parity, Review/export, clear/reopen, focus, one scroll owner and atomic application. The fixture serves the actual bundled keyword/code catalogues; production Worker/TMDB/images remain required. The default broader run retains the eight combined cases without repeating the width sweep. Screenshots use the existing `TMDB_204_SCREENSHOTS` binding outside Git.

Studio/Network rating bounds (#216) extend the same #208/#213 scenario and commands below. The default suite covers all eight family/surface combinations at 393px; the two existing opt-in commands each cover 28 cases across the five required phone widths, desktop and short height. Each scenario retains Minimum votes regression coverage and adds default-collapsed single-disclosure/field order, request-free rating interaction, unset/explicit boundaries/decimal pair Preview, inverted/invalid/unrepresentable input, one/both clear and reopen, complete-query cache reuse, real active-response poster parity, configured Review/export, focus restoration, one scroll owner and atomic application. `TMDB_204_SCREENSHOTS` reuses the existing screenshot binding to capture representative Advanced and rating Preview screens outside Git. Production Worker, real TMDB and image-CDN responses remain mandatory.

Pure coverage extends the existing native variants, source-edit foundation/Preview, Network Preview and Worker-contract suites. It covers scalar shapes before coercion, decimal-to-exponent representability using the unchanged Worker validator, effective-pair ordering with an untouched stored bound, original types/nulls/inactive mirrors, alias conflicts, configured equality, sibling rejection, frozen plans, revalidation and mixed-batch rollback. No new browser harness or synthetic live responses are introduced. The pre-fix imported-Preview regression reproduced six exponent-request failures (both bounds across COMPANY Movie/TV and NETWORK TV); container rejection already passed in that existing Preview path.

Studio Minimum votes (#208) extends the existing native-source fixture and mounted harness. The default check runs all four Studio entry points at 393px using the production Discover gateway, real TMDB responses and real poster images. Run the full 28-case matrix with `TMDB_STUDIO_MINIMUM_VOTES_ONLY=1` and `node --test --test-name-pattern="mounted Studio minimum votes" tests/builder-source-edit-mounted.test.mjs`; it covers 360, 384, 393, 402, 412, 1280 and 393×400 across New Collection, New Folder, Add Source and Edit. It verifies unset/0/100, invalid inputs, clearing and disclosure reopening, exact media/sort response and cache parity, Review/export/atomic apply, imported preservation, focus and bounded scroll ownership. Pure tests in the existing Studio, editor and Preview suites cover numeric/string/alias edge cases, unknown-filter safety, exact duplicates, stale sessions and plan revalidation without substituting synthetic live-service evidence.

Network Minimum votes (#213) reuses that fixture, scenario mechanics and browser lifecycle. The default check adds its four entry points at 393px. Run all 28 Network cases with `TMDB_NETWORK_MINIMUM_VOTES_ONLY=1` and `node --test --test-name-pattern="mounted Network minimum votes" tests/builder-source-edit-mounted.test.mjs`. The same five phone widths, desktop and 393×400 boundary validate native Network 213 through the production `/builder/discover/tv` path with real TMDB/image resources. It checks unset/0/100, clear, invalid values, request-free Advanced interaction, active-query posters/visible counts, cache reuse, Review/export, append-only application and imported preservation. Studio uses the retained wrapper around the same scenario mechanics. No synthetic external response is introduced.

Mounted-browser suites register their tests during module loading and start one isolated browser in a `before` hook. Keep browser setup out of top-level module evaluation so launch or cleanup failures are attributed to the suite instead of aborting test discovery. One browser per suite is preferred when the callbacks only assert results collected from the same mounted fixture.

Chrome owns DevTools port selection. Launch it with `--remote-debugging-port=0` and read the fresh profile's `DevToolsActivePort` file; do not reserve and release a port before launch. Browser and page WebSocket opens, fixture execution, cooperative shutdown, and forced shutdown must all remain bounded.

Mounted Chrome startup allows 10,000 ms by default. `DEVTOOLS_STARTUP_MS` may provide a positive integer millisecond override; an unset or blank value keeps the default, surrounding whitespace is ignored, and zero, negative, fractional, malformed, or unsafe integer values fail clearly. Nuvio Contract Validation sets the override to 30,000 ms for GitHub-hosted CI. Exceeding the allowance remains a test failure with bounded process, profile-directory, and Chrome-stderr diagnostics; mounted browser checks are not skipped or converted to success when Chrome starts slowly or cannot become ready.

The normal ownership path is:

1. request `Browser.close` through the browser-level DevTools connection;
2. await the direct Chrome child handle, its captured owned process tree, and browser socket closure;
3. close local DevTools connections and Vite;
4. remove the temporary Chrome profile and Vite cache.

If no browser connection was established, or cooperative close fails, use the bounded process-tree fallback. The fallback waits for the child and test-owned processes, not a potentially wedged client WebSocket. Process-group signaling is a fallback only and must remain limited to the isolated browser launch's process group plus explicitly captured browser PIDs.

Every asynchronous exit wait must be observed before cancellation can reject it. Check synchronous failure branches before creating waits, and wrap commands that may throw synchronously before combining them with other promises. Cleanup for one resource owner is idempotent: concurrent and repeated calls share one cleanup operation, while a failed cleanup may be retried.

Focused checks:

```powershell
node --test tests/mounted-browser-lifecycle.test.mjs
node --test tests/builder-source-edit-mounted.test.mjs
$env:TMDB_MOUNTED_BROWSER_DIAGNOSTICS = "1"
node --test tests/builder-source-edit-mounted.test.mjs
```

### Genre, Decades and Streaming combined Advanced acceptance

Use the existing source-edit mounted harness for the twelve Add/New Collection/New Folder/Edit combinations, plus the phone width sweep and forced colours. This exercises real catalogue files, the production Worker, live TMDB results and real images; it must not intercept or fabricate external responses.

```powershell
$env:TMDB_FAMILY_ADVANCED_ONLY = "1"
node --test --test-name-pattern="mounted family Advanced" tests/builder-source-edit-mounted.test.mjs
Remove-Item Env:TMDB_FAMILY_ADVANCED_ONLY
```

The optional existing `TMDB_204_SCREENSHOTS` setting captures private PNG evidence into a directory outside Git. The default broad runner includes the twelve functional combinations and `builder-family-advanced.test.mjs`; the focused command adds the responsive/forced-colour cases.

## Preview-100 focused validation (#226)

After the owner's reviewed Worker deployment, run `TMDB_PREVIEW_PRESENTATION_ONLY=1` with `node --test --test-name-pattern="mounted live Preview paging hides" tests/builder-source-edit-mounted.test.mjs` for the paging presentation refinement. It reuses the existing live List scenario at 393px and 1280px, traverses genuine production pages 1–5, samples rendered frames for unwanted Load more visibility, and checks the non-interactive end marker and unchanged request count. The local paging scenario below separately verifies focused/manual fallback, short content, failure/Retry and focus restoration. Both opt-ins enable Chrome focus emulation so CSS focus visibility is genuinely exercised in headless runs.

For the owner-review Decades layout correction, use `TMDB_DECADES_BOUNDARY_ONLY=1` with `node --test --test-name-pattern="mounted Decades Preview keeps" tests/builder-source-edit-mounted.test.mjs`. This reuses the live representative/exact Decades scenarios at 393px and 1280px, including Year/Source/Media/Show changes, measured clipping boundaries, body scroll resets and fixed Close. Optional `TMDB_204_SCREENSHOTS` uses the existing screenshot capture hook. It makes no page-two acceptance claim.

The owner explicitly authorized local mocked paging coverage before the original Worker deployment gate. `tests/builder-title-preview-pages.test.mjs` tests the pure query/window/cache contracts. Run the isolated component scenario with `TMDB_PREVIEW_PAGES_ONLY=1` and `node --test --test-name-pattern="mounted local Preview paging" tests/builder-source-edit-mounted.test.mjs`. It reuses the existing browser lifecycle and uses synthetic local rows plus explicitly intercepted unit artwork only in that opt-in scenario. This proves UI mechanics, not TMDB integration. The separate live scenario above now covers production paging after the owner's deployment and production-review acknowledgment.

The existing live Genre Preview scenario can be rerun independently at 393px and 900px with `TMDB_GENRE_PREVIEW_ONLY=1` and `node --test --test-name-pattern="mounted Genre Preview uses" tests/builder-source-edit-mounted.test.mjs`. It retains real Movie/TV/filtered responses and images, lazy switching, cache, focus and preservation assertions, including conservative presentation of totals beyond TMDB's accessible range. This is the same scenario used by the default broad suite, not a substitute integration path.


## Shared Builder interaction checks

The existing source-edit mounted harness covers all nine creation families for name recovery, semantic Appearance order and explicit forward navigation. `TMDB_REQUIRED_NAMES_ONLY=1` with `--test-name-pattern="mounted required Collection names"` retains Pass 0 recovery and checks multiple blank/whitespace names, independent associated messages, first-invalid focus on click/Enter, invalid Back/return, correction, defaults and one valid commit. Phone/desktop, enlarged text, short height and forced-colours cases are included. `TMDB_GUIDED_PRESENTATION_ONLY=1` with `--test-name-pattern="mounted guided presentation"` checks current navigation, control order, supported shapes and the 899/900/901 boundary.

`TMDB_EDITOR_ORDER_ONLY=1` with `--test-name-pattern="mounted ordinary editor order"` checks eight ordinary adapters, real production-path Preview, retained names and minimal local saves, including phone/desktop, breakpoint, short-height and enlarged-text cases. Run these with `node --test tests/builder-source-edit-mounted.test.mjs` and put the test-name option before the file. The default source run retains creation recovery; the targeted editor matrix complements the existing complete editor scenarios.

`COLLECTION_FOLDERS_CORRECTION_ONLY=1` with `node --test --test-name-pattern="collection Folder management|Sort folders stays compact" tests/builder-bulk-edit-mounted.test.mjs` includes single Collection/Folder/Source Delete confirmations, native Enter/Space on safe Cancel, Escape, focus restoration, explicit deletion and existing bulk Folder selection/layout/forced-colours checks. These are local project mutations, not Nuvio mutations. External service responses in integration checks remain live through production providers.

`TMDB_STREAMING_HIERARCHY_ONLY=1` with `--test-name-pattern="mounted Streaming New Collection disambiguates"` runs the existing nine-width live routing matrix in the source-edit harness, including a blank Folder-name correction attempt that focuses the field without applying changes.
