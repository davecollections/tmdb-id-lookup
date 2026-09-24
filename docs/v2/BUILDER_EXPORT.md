# Builder Collection Export

Status: Manual Export is implemented on main through [#194](https://github.com/davecollections/tmdb-id-lookup/issues/194) / [PR #195](https://github.com/davecollections/tmdb-id-lookup/pull/195). [#244](https://github.com/davecollections/tmdb-id-lookup/issues/244) implements the Send foundation and **Export & Send** UI on its feature branch. Owner-operated live acceptance passed; the owner has authorized commit, push and PR review after the final two presentation changes. The approved Pass 3 product revision offers one optional exact current-Nuvio backup and one fresh preflight before guarded replacement. Send is not on main. One owner-operated live replacement passed; no restoration or deployment occurred. Download JSON and Copy JSON remain independent manual paths.

The Builder is the sole editing, arrangement and reordering interface. Export confirms the output, reports problems and delivers a file. A visual Nuvio preview is deferred until shared on-demand title-preview work exists and users demonstrate demand. No follow-up visual-preview issue is created.

## Local Export & Send changes (#244, Pass 2)

Final owner-approved cleanup: Export & Send shows **Ready to export** for valid output, without a non-blocking preservation-warning panel/count or warning-qualified status. Send Review retains Collection details but also omits preservation warnings. These diagnostics remain in the canonical payload and existing Builder diagnostic/editing paths; opaque Sources still serialize unchanged and obsolete addon details retain their existing handling. Genuine blocking errors remain visible and prevent delivery. No replacement prose fills the removed panel. Active progress alone centers its heading, supporting line and approved dots on desktop and phone.

The workspace action and modal are renamed **Export & Send**. Counts, validation, deterministic filename/bytes, canonical warnings, diagnostic editor-return behavior, clipboard failures and four-second feedback retain their existing contracts. The content scroller starts with primary **Send to Nuvio** and its supporting text, **Replace the Collections on a Nuvio profile.**, followed by **Download JSON** and **Copy JSON** with concise delivery guidance. Manual actions use a quieter neutral surface/border and secondary weight, retaining full enabled contrast, hover/focus and tap targets. Manual actions require no connection and opening Export performs no Nuvio request, including when Send is unavailable or unresolved.

**Need to add or merge Collections instead?** is a secondary disclosure. It tells users to download JSON, sign in to Nuvio.tv, select the profile and open its Collections import tools, choose Import/file, select **Add as new** or **Merge**, then review and confirm in Nuvio. It explains: “Nuvio’s Merge uses Nuvio’s own matching rules and may differ from Dingo’s Merge exact matches.” Navigation wording stays general where not publicly verified. Existing TV import and TMDB Enrichment guidance is retained in a nested disclosure, including the beta, hosted-URL and API-key caveats.

Send replaces this modal's contents using the same shell, focus trap and body lock. Its application-owned coordinator retains dispatched status through interruption, disconnect, edits, project replacement and navigation. Verified history has no separate workspace status action: a compact **Last Send** section between Send and manual delivery offers target, verification text and **View details**. Unresolved attempts remain discoverable through a small workspace attention button. See the [connection/UI contract](./BUILDER_NUVIO_CONNECTION.md#export--send-ui-244-pass-2) for summary-tile comparison, optional backup, no-op, remote-change, non-dismissible active progress and Done-only verified success. Current mocked/local screenshots and the affected responsive matrix are described in [testing](../TESTING.md#send-hardening-244-pass-3). Owner-operated physical-iPhone/live acceptance passed for the tested flow, as recorded in the testing guide; this is not broader device/client certification.

The final targeted polish keeps **Nuvio now** neutral and gives **From Dingo** a faint cyan surface/border with explicit labels. Exact top-level Collection IDs determine how many reviewed remote Collections are absent from the frozen replacement. Positive counts show a specific removal warning and quiet **Merge instead**; zero shows neither, while unreliable IDs retain the generic warning without a nudge. Merge instead opens the existing local Import review with a fresh safe-read snapshot, reusing valid exact session/profile/PIN authority. Only explicitly choosing and applying **Merge exact matches** changes the Builder project. Handoff performs zero remote Collection writes and does not alter the local merge algorithm. Send remains Replace-only and optional raw-R0 backup remains independent. The shared protected-profile field now verifies automatically at four valid digits and advances normally; wrong PIN clears/refocuses for fresh entry, retaining lockout and identity rules.

Public-only help recheck, 2026-09-24: the current [Nuvio account page](https://nuvio.tv/account) publicly serves `page-470e4e54407a838f.js`, which exposes a JSON file input, an Import collections JSON dialog, and Add as new/Merge/Overwrite modes. Its Merge description matches Collection IDs, confirming the existing warning that Nuvio's rules can differ from Dingo's exact-visible-name merge. No authenticated navigation or import was exercised; the UI intentionally keeps navigation general. Existing TV/local-address/QR, hosted-URL, beta and TMDB Enrichment guidance is retained without claiming fresh physical-TV acceptance.

## Entry and modal on main (#194)

The following presentation and instruction lists record the published #194 behavior. The local #244 changes above supersede its labels, action order, preservation-warning visibility and help presentation on the feature branch; manual delivery, underlying diagnostics and preservation contracts remain in force.

**Export collections** appears only when at least one Collection contains a Folder with at least one Source. Empty/skeletal drafts show no disabled action. Export errors do not hide the action. Back to builder home and Help remain together on the first header row; Export occupies the second row with a distinct completion style.

The same responsive modal is content-sized, centred and at most 660px wide. The dimmed Builder remains visible and inert. Header, summary and footer remain outside the single scrollable details region; long warnings/errors scroll there. Close/Escape returns focus to the entry and restores Builder position. Backdrop clicks retain the modal.

Visible copy and order:

1. **Export collections** with **Close**.
2. **Ready to export** without warnings/problems, **Ready to export with warnings** for warning-only output, or **1 problem to fix before exporting** / **N problems to fix before exporting** for blocking problems.
3. **Collections**, **Folders**, **Sources** totals and the exact filename.
4. Blocking problems under **Resolve before exporting**, with supported existing-editor links. **No partial file will be exported.**
5. Collapsed **N preservation warning(s)**; opening explains **These warnings do not prevent export.** and shows one cause/consequence summary per structured reason. A further disclosure reveals affected locations.
6. **How to import into Nuvio**, a button with `aria-expanded` and `aria-controls`, collapsed each time Export opens. It expands the owner-supplied Web login and TV app instructions below in the same details region. Both sections stack at every width; no second modal or instructions screen is introduced.
7. Primary **Download JSON**, secondary **Copy JSON**. Success says **JSON copied.** or **Download started.**, announced through a polite live region. Clipboard failure says **Copy failed. Allow clipboard access or use Download JSON.** Download failure says **The download could not start. Try again or use Copy JSON.**

Success feedback expires after exactly **4,000ms**. Repeating either action replaces feedback and restarts one timer. The timer continues while Export is suspended for an editor, so expired success cannot reappear on return. Closing unmounts the session and clears its timer; reopening has no old message or expanded import instructions. A late clipboard completion cannot update an unmounted session or replace a newer action's feedback. Failures have no expiry timer and remain actionable until retry, another action or Close.

### Import into Nuvio

Nuvio is currently in beta, so these import steps may change.

**Web login**

1. Go to [Nuvio.tv](https://nuvio.tv/) and log in.
2. Select the profile you want to update.
3. Open Account.
4. Open Collections.
5. Choose Import.
6. Select the downloaded JSON file.
7. Choose Add as new, Merge, or Overwrite.
8. Choose Add collections.

**TV app**

1. Open Nuvio and choose a profile.
2. Go to Settings → Content & Discovery → Addons.
3. Open Collections.
4. Choose Import.
5. Choose From File or From URL.
6. For From File, select the downloaded JSON file from Downloads, then confirm the import.
7. For From URL, enter the direct URL of a JSON file, fetch it, then confirm the import.

Dingo provides a downloaded JSON file. It does not currently create a hosted URL.

To help Nuvio add artwork and title details, go to Settings → Integrations → TMDB and turn on Enable TMDB Enrichment. A TMDB API key may be required. Follow the [official TMDB API guide](https://developer.themoviedb.org/docs/getting-started) to request one.

Both links are underlined and open in a new tab with `rel="noopener noreferrer"` and an accessible new-tab announcement matching the visible label. The enrichment paragraph uses a restrained Builder callout. The instructions neither load remote content nor make requests when shown. The existing details area scrolls while summary/filename and export actions remain reachable; keyboard focus follows Nuvio link → official TMDB API guide link → Download → Copy. The current instructions are owner-supplied, not a new live-client compatibility claim.

## Warning reasons and affected locations

The current export serializer emits exactly the following two warning codes. These codes remain internal; grouping uses the structured code, never a rendered sentence. Import-only diagnostics such as `AMBIGUOUS_SOURCE_PRESERVED_OPAQUE` are not merged into current export results, and the Workspace import-warning panel is unchanged.

| Structured reason (internal) | Visible reason | Cause and consequence |
| --- | --- | --- |
| `OPAQUE_SOURCE_PRESERVED`, singular | This Source can’t be edited in the Builder | **It will still be included unchanged in the exported file.** |
| `OPAQUE_SOURCE_PRESERVED`, plural | Some Sources can’t be edited in the Builder | **They will still be included unchanged in the exported file.** |
| `UNMATCHED_CATALOG_SOURCE_REMOVED` | Some saved addon details are no longer used | **These unused details won’t be exported. Your current Sources are unaffected.** “Details” describes the saved information even when there is one warning; the count still says **1 warning**. |
| Unknown future code | Some information will be preserved unchanged | **Dingo does not fully recognise this information, so it will be kept unchanged in the exported file.** |

The outer summary counts warnings, including multiple diagnostics about one Source. Within a group, a reliable current Source path resolves to its authoritative internal identity. Deduplication uses that identity, never a title or exported identifier. If every warning in a group resolves to a physical Source, the group labels its distinct count **1 affected Source** / **N affected Sources**; otherwise it labels the raw diagnostic total **1 warning** / **N warnings**. Compatibility entries always count as warnings. Unknown/unresolved locations are acknowledged without pretending they are Sources.

**Show affected Sources** or **Show affected locations** reveals compact Collection → Folder headings, with distinct Sources or **Saved addon details N** beneath. No internal codes or opaque/compatibility terminology appear in normal warning UI. All locations remain reachable, but none are mounted initially. Opening the outer disclosure mounts grouped explanations only; opening a group's disclosure mounts its locations. The single details area owns scrolling, keeping the summary, filename and actions outside long warning lists. Warnings never disable either export action or alter serializer data/severity.

## Preparation, counts and delivery

`createCollectionExportPayload` consumes the unchanged controller `stringifyProject({ space: 2 })` result outside React rendering, caching one result per authoritative project object. Diagnostic-only revisions and selection changes reuse it. The payload retains the serializer's prepared `collections` value, exact `json`, errors, warnings, current project and counts. Failed preparation exposes neither partial Collections nor partial JSON.

Valid totals count the prepared Collection array, every nested Folder, and each physical Source in those Folders. Empty arrays count zero; preserved supported/unsupported Sources count normally. Addon compatibility projections are not counted twice. For a blocked export, totals describe the authoritative current draft. Totals never come from DOM elements.

Copy and Download consume the same validated JSON string. No delivery function restructures or reserializes it. The filename is exactly `dingo-nuvio-collections-YYYY-MM-DD.json`, using zero-padded browser/device local calendar components. It is held for the modal session and passed to Download, so the displayed and downloaded names agree even across midnight. Reopening captures the current local date.

Warnings do not block delivery. Errors disable both actions; validation is checked again against the current project when activated. Unknown/imported data, source identity, ordering, schema and compatibility output remain governed by the existing serializer. No automatic migration or repair is added.

## Diagnostic editing

Editable Collection/Folder targets and supported physical Source targets use the existing Builder editors. Export retains no copied nodes: it subscribes to the controller and re-resolves targets when activated. Its portal remains mounted but hidden, with modal semantics/focus trapping suspended during editing. Save recalculates validation and counts; Back/Cancel does not mutate the draft. Return restores the originating link and details scroll, or the status heading when a repaired/removed diagnostic no longer has a link.

An editor cannot repair every preserved malformed field. Unsupported shapes have no Source edit link; if a supported editor changes a name while another imported field remains invalid, validation correctly keeps export blocked. Imported filter/addon failures use plain-language messages and identify a real removal path: close Export and delete the affected Source (or containing Folder/Collection when that is the diagnostic target) in the Builder, retaining the original imported file. Existing edit links remain available where supported. No validation contract or editor eligibility is weakened.

Export makes no title, artwork-discovery or TMDB requests. Diagnostic Source editors retain the local-only provider safeguards and omit live title/count requests. Diagnostic Folder settings omit artwork-discovery context. Normal editors opened directly from the Builder retain their existing behavior. Assigned artwork fields belong to the existing editor; the export modal renders no images.

<a id="future-send-to-nuvio"></a>

## Send to Nuvio scope

The investigation is complete and the owner approved this product direction. **The foundation and UI are implemented locally in #244; Send is not on main.** Optional account connection/profile import is already implemented through #238 / PR #239; the [connection contract](./BUILDER_NUVIO_CONNECTION.md) owns that behavior and the local Send checkpoint.

The first **Send to Nuvio** slice is Replace-only for one selected profile. Reuse authoritative project → existing validation/canonical preparation → delivery, sending complete frozen canonical P as a whole-profile replacement. Require explicit destructive Review R0, current protected-profile PIN authority, fresh R1 == R0 after **Replace Collections**, and a final synchronous project/identity/authority guard before at most one push. Any baseline change, even R1 == P while R1 != R0, stops and requires fresh Review. No automatic write retry or restore is allowed. Post-write readback alone permits strong **Sent to Nuvio** success. No supported CAS/expected-revision API has been evidenced; the owner accepts the residual final-read → write race with mitigation. Remote Add, Merge and selected-Collection modes remain deferred. This is Send, not Sync.

**Download current Nuvio backup** is optional and recommended, never a Replace prerequisite. It contains exact reviewed raw R0 without canonicalization or an authentication/diagnostic/account envelope; absent data downloads as `[]` while blob presence stays distinct internally. Its descriptor/filename and bytes stay stable for that Review; retries make no request and cannot advance Send. If replacement proceeds, R1 == R0 means the backup represents the immediately preceding observed state. Feedback reports initiation only. There is no proposed-replacement file, possession confirmation, recovery stage or second preflight. Ordinary Download JSON and Copy JSON remain the way to obtain P.

The local **Export & Send** UI offers **Send to Nuvio**, **Download JSON**, **Copy JSON** and manual **Nuvio.tv Add/Merge help**. Unauthenticated Download and Copy remain permanent first-class alternatives. Its concise help supersedes the historical main instruction presentation above only after a separately approved publication.

## Verification and current files

Historical #194 implementation/pass evidence follows. Its owner-review, uncommitted and pre-publication wording records those stages; it is not an outstanding publication gate after merged PR #195. Original counts, observations and acceptance limits are retained.

The final link-only refinement passed **25 UI tests**, **5 focused mounted export tests** and `git diff --check`. Visible labels are **Nuvio.tv** and **official TMDB API guide**, with exact destinations, matching accessible new-tab announcements, underlines, `target="_blank"`, and `rel="noopener noreferrer"`. The mounted checks retain keyboard order, modal geometry, warnings/errors, exact delivery bytes, zero requests and four-second feedback coverage. No production build or full repository check was run for this narrow refinement; the existing production preview was not rebuilt.

The final copy/instructions refinement passed **37 focused export/UI tests**, **13 mounted tests**, the Builder production build and `git diff --check`. Tests assert exact warning headings/explanations, both complete instruction lists, beta/hosted-URL/enrichment copy, external-link attributes, native link/action focus order, forced colours, persistent summary/actions and no overflow at 393/900/1280px. Existing warning/error severity, deduplication, identical delivery bytes, zero-request checks and deterministic four-second feedback coverage also pass. Collapsed and expanded instruction screenshots include both the top and scrolled TV/enrichment content at all three widths. The existing bundle-size advisory remains; no full repository check was repeated.

The initial pivot passed 188 focused tests and 11 mounted tests. The subsequent feedback/disclosure/warning polish pass passed **165 focused tests** across export, Workspace, Node Editor and Welcome/import, plus **13 mounted tests** in the affected Bulk/Export lifecycle. The final export-only rerun passed all 12 tests after the singular-copy refinement. Coverage includes 393/900/1280px headers and modal geometry; native keyboard/forced-colour disclosure operation, focus containment and Escape; local dates in Sydney and Los Angeles across a UTC date boundary; exact bytes/filename; output-matching counts; structured warning groups, deduplication and unknown-code fallback; warnings/errors; Collection/Folder/Source editor return and validation; and absence of export requests. Feedback tests control only the four-second timer, with no real-time expiry waits, and cover replacement, cleanup, suspended editors, persistent failures and late clipboard completion. Local imported test structures and diagnostic-only presentation cases do not replace external-service responses.

A local headless Chrome polish run opened Export for 24 Collections, 600 Folders and 1,200 Sources in **153ms** after import, with accurate totals and zero data requests. It also expanded all 600 affected Sources through one grouped summary and verified one scroll owner with reachable actions. These are local checks, not a physical-device performance guarantee. The Builder production build, `git diff --check`, removal search and final diff inspection passed; the existing large-bundle advisory remains. The full repository check is intentionally deferred during owner review; one clean uninterrupted run is required after final owner approval and before publication.

Physical-phone presentation and current-Nuvio import remain owner checks. No production deployment, Worker, v1, schema or dependency changes are part of this issue.

## Recommended next focused issue: Nuvio round-trip Source recognition

Historical follow-up recorded during #194, not the current task queue; the [Product Plan roadmap](./BUILDER_PRODUCT_PLAN.md#18-roadmap-and-mandatory-gates) owns current priorities.

The owner reports that Genre and Decade Sources created in Dingo can become Delete-only after a Dingo export → Nuvio import/export → Dingo import round trip. This remains a separate compatibility investigation; no cause is asserted and no follow-up issue is created in #194. Source classification, editor eligibility, opaque preservation, the import-warning panel, Genre/Decade schemas and serializer output remain unchanged.

Diagnosis requires both exact files from the same round trip: the original Dingo-downloaded `dingo-nuvio-collections-YYYY-MM-DD.json` and the subsequent Nuvio-exported JSON. Identify at least one affected Genre Source and one affected Decade Source in **each** file with their Collection/Folder/Source locations, retaining complete unmodified Source fields and surrounding Collection/Folder structure. Also record the Nuvio client/platform/version, Dingo build/HEAD, reproduction sequence, and which Sources lost Edit. Screenshots or warning codes alone do not establish the field-level cause.

## Files changed

The final link-only pass changes five existing #194 worktree files: `ExportCollectionsDialog.jsx`, `builder-export-collections-mounted.jsx`, `builder-bulk-edit-mounted.test.mjs`, `builder-ui.test.mjs` and this document. Only the two links, related copy, focused assertions and documentation changed. All earlier intended #194 changes remain as inspected. At that historical #194 checkpoint, the complete issue worktree contained 15 modified tracked files and 8 untracked files, with nothing staged or committed:

| Area | Files (repository-relative) |
| --- | --- |
| UI and export | `builder/src/ui/BuilderWorkspace.jsx`, `builder/src/ui/SourceEditorDialog.jsx`, `builder/src/ui/modal-focus.js`, `builder/src/ui/view-model.js`, `builder/src/ui/ExportCollectionsDialog.jsx`, `builder/src/ui/export-collections.css`, `builder/src/ui/export-collections.js` |
| Documentation | `docs/v2/BUILDER_KNOWLEDGE.md`, `docs/v2/BUILDER_PRODUCT_PLAN.md`, `docs/v2/BUILDER_SERIALIZER.md`, `docs/v2/BUILDER_UI_SHELL.md`, `docs/v2/BUILDER_EXPORT.md` |
| Checks/tests | `scripts/check-all.mjs`, `tests/builder-bulk-edit-mounted.test.mjs`, `tests/builder-folder-card-artwork-mounted.test.mjs`, `tests/builder-node-editing.test.mjs`, `tests/builder-source-edit-mounted.test.mjs`, `tests/builder-ui.test.mjs`, `tests/builder-welcome-import.test.mjs`, `tests/builder-export-collections.test.mjs`, `tests/fixtures/builder-export-collections-mounted.html`, `tests/fixtures/builder-export-collections-mounted.jsx`, `tests/helpers/mounted-react-vite.mjs` |
