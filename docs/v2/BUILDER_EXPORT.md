# Builder Collection Export

Status: Manual Export was introduced by [#194 / merged PR #195](https://github.com/davecollections/tmdb-id-lookup/pull/195). **Export & Send** and Replace-only Send are implemented on main through closed [#244](https://github.com/davecollections/tmdb-id-lookup/issues/244) / merged [PR #245](https://github.com/davecollections/tmdb-id-lookup/pull/245), merge commit `2dd4652fe23a9ee7d38d5238a3c843504ecca172`. Owner-operated physical-iPhone acceptance, post-merge validation and automatic Pages publication succeeded; see [acceptance and limits](./BUILDER_NUVIO_CONNECTION.md#send-validation-and-owner-acceptance). Download JSON and Copy JSON remain independent manual paths.

The Builder is the editing, arrangement and reordering interface. Export confirms output, reports blocking problems and offers delivery. A visual Nuvio layout preview remains deferred pending demonstrated demand and focused design.

<a id="local-export--send-changes-244-pass-2"></a>
<a id="entry-and-modal-on-main-194"></a>

## Export & Send entry and modal

The workspace action appears when at least one Collection contains a Folder with a Source, independently of export validity. Retained Send history also keeps Export & Send reachable after project replacement or loss of ordinary export eligibility; Welcome offers a quiet history entry. Verified history lives in **Last Send** inside Export & Send, with target, verification text and **View details**. Unfinished/unverified attempts retain compact workspace attention.

The ordinary modal is content-sized, centered and at most 660px wide. Header, summary and feedback footer remain outside one content scroller; the workspace is inert. Close/Escape restores the entry and Builder position, and backdrop clicks do not dismiss. Send uses this same shell, focus trap and body lock with its 640px width and separate active-work dismissal policy. Diagnostic editors suspend Export's modal behavior until return.

Visible content is:

1. **Export & Send** and Close.
2. **Ready to export** for valid output, or **1 problem to fix before exporting** / **N problems to fix before exporting** for blocking problems.
3. Collections, Folders and Sources totals, plus the exact filename.
4. Primary **Send to Nuvio**, with **Replace the Collections on a Nuvio profile.** Retained Last Send appears here when present.
5. **Download JSON** and **Copy JSON**, using quieter neutral surfaces while retaining enabled contrast and tap targets.
6. Blocking problems under **Resolve before exporting**, with supported editor links and no partial output.
7. Collapsed **Need to add or merge Collections instead?** help.

Opening Export performs no Nuvio request. Manual actions require no connection and remain available when a Send attempt is unresolved, subject to ordinary export validation. Success feedback says **JSON copied.** or **Download started.** and expires after 4,000ms. Repeating an action replaces feedback and restarts the timer, which continues during diagnostic editing. Clipboard/download failures remain actionable until retry, another action or Close. Closing clears the session; late clipboard completion cannot update an unmounted session or supersede newer feedback.

<a id="warning-reasons-and-affected-locations"></a>

## Preservation diagnostics

Non-blocking preservation warnings, counts and warning-qualified readiness are not shown in Export & Send or Send Review. Underlying diagnostics and preservation are unchanged: `OPAQUE_SOURCE_PRESERVED` retains unknown Sources, and `UNMATCHED_CATALOG_SOURCE_REMOVED` reports obsolete addon projection removal. Grouping remains an internal helper, not a visible warning-disclosure contract. Genuine errors still block delivery and expose supported diagnostic editing.

## Import into Nuvio

The manual Add/Merge disclosure instructs users to download JSON, sign in to [Nuvio.tv](https://nuvio.tv/), select the target profile, open its Collections import tools, choose Import and the file, select **Add as new** or **Merge**, then review and confirm in Nuvio. It explains that Nuvio's Merge uses its own matching rules and may differ from Dingo's Merge exact matches. Navigation stays general where not authenticated/live-verified.

The nested **TV import and TMDB Enrichment** disclosure retains these owner-supplied steps:

1. Open Nuvio and choose a profile.
2. Go to Settings → Content & Discovery → Addons → Collections → Import.
3. Choose From File or From URL. For a file, select the downloaded JSON from Downloads and confirm; for URL, fetch an already hosted JSON file and confirm. Dingo does not create a hosted URL.

TMDB Enrichment guidance points to Settings → Integrations → TMDB → Enable TMDB Enrichment, with an API-key caveat and the [official TMDB API guide](https://developer.themoviedb.org/docs/getting-started). Both external links open a new tab with matching accessible announcements and `rel="noopener noreferrer"`. Instructions make no requests when expanded. The beta caveat remains; this is not fresh physical-TV acceptance.

Public-only help recheck, 2026-09-24: the [Nuvio account page](https://nuvio.tv/account) publicly served `page-470e4e54407a838f.js`, exposing JSON file import and Add as new/Merge/Overwrite modes. Its Merge description matched Collection IDs, corroborating the difference from Dingo's exact-visible-name merge. No authenticated navigation/import was performed during that check.

## Preparation, counts and delivery

`createCollectionExportPayload` consumes the unchanged controller `stringifyProject({ space: 2 })` result outside React rendering, caching one result per authoritative project object. Diagnostic-only revisions and selection changes reuse it. The payload retains the serializer's prepared `collections` value, exact `json`, errors, warnings, current project and counts. Failed preparation exposes neither partial Collections nor partial JSON.

Valid totals count the prepared Collection array, every nested Folder, and each physical Source in those Folders. Empty arrays count zero; preserved supported/unsupported Sources count normally. Addon compatibility projections are not counted twice. For a blocked export, totals describe the authoritative current draft. Totals never come from DOM elements.

Copy and Download consume the same validated JSON string. No delivery function restructures or reserializes it. The filename is exactly `dingo-nuvio-collections-YYYY-MM-DD.json`, using zero-padded browser/device local calendar components. It is held for the modal session and passed to Download, so the displayed and downloaded names agree even across midnight. Reopening captures the current local date.

Warnings do not block delivery. Errors block Send, Download and Copy; validation is checked again against the current project when activated. Unknown/imported data, source identity, ordering, schema and compatibility output remain governed by the existing serializer. No automatic migration or repair is added.

## Diagnostic editing

Editable Collection/Folder targets and supported physical Source targets use the existing Builder editors. Export retains no copied nodes: it subscribes to the controller and re-resolves targets when activated. Its portal remains mounted but hidden, with modal semantics/focus trapping suspended during editing. Save recalculates validation and counts; Back/Cancel does not mutate the draft. Return restores the originating link and details scroll, or the status heading when a repaired/removed diagnostic no longer has a link.

An editor cannot repair every preserved malformed field. Unsupported shapes have no Source edit link; if a supported editor changes a name while another imported field remains invalid, validation correctly keeps export blocked. Imported filter/addon failures use plain-language messages and identify a real removal path: close Export and delete the affected Source (or containing Folder/Collection when that is the diagnostic target) in the Builder, retaining the original imported file. Existing edit links remain available where supported. No validation contract or editor eligibility is weakened.

Export makes no title, artwork-discovery or TMDB requests. Diagnostic Source editors retain the local-only provider safeguards and omit live title/count requests. Diagnostic Folder settings omit artwork-discovery context. Normal editors opened directly from the Builder retain their existing behavior. Assigned artwork fields belong to the existing editor; the export modal renders no images.

<a id="future-send-to-nuvio"></a>

## Send to Nuvio scope

Send is Replace-only for one selected profile using the complete frozen canonical proposal. Review captures the remote baseline, then **Replace Collections** requires a fresh unchanged-baseline pull and a final synchronous project/identity/PIN-authority guard before at most one push. Changed data or timestamp evidence requires renewed Review. No automatic write retry, resend or restore is permitted. HTTP 204 acknowledges the request; only exact verified readback displays **Sent to Nuvio**. Unknown outcomes retain memory-only evidence and read-only **Check Nuvio again**. An identical reviewed profile completes as **Already up to date**, with Done and no write.

**Download current Nuvio backup** is optional and recommended, never a Replace prerequisite. It contains only the exact reviewed raw Nuvio Collections array; absent data downloads as `[]` while blob absence remains distinct internally. Bytes/filename remain stable for that Review and retries make no request or Send-state change. Feedback reports initiation, not proven file retention. No proposed-replacement recovery download or mandatory recovery-confirmation stage exists; ordinary Download/Copy provides the Dingo output.

Review shows **Nuvio now** and **From Dingo** with Collection/Folder/Source counts. Exact top-level Collection IDs determine removal warnings; unreliable IDs use the conservative generic warning, and zero removals shows no warning/nudge. Positive removals offer **Merge instead**, which opens the existing local Import flow with a fresh safe-read snapshot and valid exact profile/PIN authority. Only explicit local Merge selection/application changes the Builder project; this handoff performs no remote Collection write.

Active work uses centered status and decorative activity dots, blocks ordinary dismissal and retains accessible status independently of motion. Verified/no-op completion has Done only; unverified/unknown results remain distinct and offer read-only checking. The [connection contract](./BUILDER_NUVIO_CONNECTION.md#export--send-ui-244-pass-2) owns detailed state, PIN, modal and history behavior. The accepted final-read → write-commit race remains because no upstream CAS/revision-write primitive is evidenced.

<a id="verification-and-current-files"></a>

## Verification

The [testing guide](../TESTING.md#send-hardening-244-pass-3) owns current commands, responsive/accessibility coverage and historical #244 evidence. Coverage retains exact manual bytes/filename, project-based preparation, warnings versus errors, editor return, deterministic feedback, failed delivery, large projects and independent manual actions, alongside Send/PIN/Merge safety and final UI behavior. Owner live acceptance is bounded to the tested physical-iPhone flow.

<a id="recommended-next-focused-issue-nuvio-round-trip-source-recognition"></a>

## Historical round-trip observation (#194)

During #194, the owner reported that Genre and Decade Sources could become Delete-only after Dingo export → Nuvio import/export → Dingo import. This historical observation did not establish a cause or create a follow-up issue. Diagnosing such a report requires the original Dingo JSON and corresponding Nuvio-exported JSON, complete affected Sources and their parent structure, client/platform/version, Dingo build and reproduction steps; screenshots or warning codes alone cannot establish the field-level cause. The [canonical roadmap](./BUILDER_PRODUCT_PLAN.md#18-roadmap-and-mandatory-gates) owns current priorities.
