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
7. Visible secondary **How to import into Nuvio** entry.

Opening Export performs no Nuvio request. Manual actions require no connection and remain available when a Send attempt is unresolved, subject to ordinary export validation. Success feedback says **JSON copied.** or **Download started.** and expires after 4,000ms. Repeating an action replaces feedback and restarts the timer, which continues during diagnostic editing. Clipboard/download failures remain actionable until retry, another action or Close. Closing clears the session; late clipboard completion cannot update an unmounted session or supersede newer feedback.

<a id="warning-reasons-and-affected-locations"></a>

## Preservation diagnostics

Non-blocking preservation warnings, counts and warning-qualified readiness are not shown in Export & Send or Send Review. Underlying diagnostics and preservation are unchanged: `OPAQUE_SOURCE_PRESERVED` retains unknown Sources, and `UNMATCHED_CATALOG_SOURCE_REMOVED` reports obsolete addon projection removal. Grouping remains an internal helper, not a visible warning-disclosure contract. Genuine errors still block delivery and expose supported diagnostic editing.

## Import into Nuvio

Export & Send and About & Credits share the contents-only **How to import into Nuvio** guide. The visible entry reads **Instructions for your Nuvio app or the website.** Each existing host opens a four-row platform chooser, then one platform's instructions. Back returns one level and restores the selected row/help entry and scroll; Close/Escape dismisses the original host. Welcome's About route works without a project.

The original dialog owns its portal, focus trap, body lock and visible viewport observer. Only guide contents change; one content scroller remains visible. Export totals, filename and controls are absent while reading. The Export component, cached payload, session filename, diagnostic state, Send evidence and feedback timers survive navigation. Guide navigation performs no request, preparation, project edit or Send operation.

| Platform | Import route | Consequence |
| --- | --- | --- |
| Nuvio.tv | Download JSON → sign in → intended profile → Collections → Import file → mode → review/confirm | **Add as new** keeps existing Collections and resolves incoming ID collisions. **Merge** matches Collection IDs, appends incoming folders and skips Sources recognised as duplicates; it does not merge folders by name. **Overwrite** replaces the complete profile list; save existing Collections first. |
| Android TV / Google TV | Download → rename exactly `nuvio-collections.json` → TV Downloads → intended profile → Settings → Content & Discovery → Addons → Collections → Import → From File → Load File → review/confirm | New Collection IDs are added; matching IDs replace the entire existing Collection, including folders and Sources. Optional From URL loads an already hosted direct JSON URL; Dingo does not host JSON. |
| Android Mobile | Copy existing Nuvio Collections JSON → paste/save in a safe note or file → Dingo Copy JSON → intended profile → Settings → Appearance → Collections → Import → paste complete JSON → Import | Replaces the complete Collection list. Missing Collections may be lost. Signed-in changes can sync to the account and other devices on that profile. |
| Desktop | Separately maintained desktop wording for the same copy-and-save backup, Dingo Copy JSON and Settings → Appearance → Collections → Import → paste route | Complete-list replacement, with the same backup and signed-in sync warning. Inspected release is alpha software. |

Dingo's ordinary filename remains `dingo-nuvio-collections-YYYY-MM-DD.json`; TV renaming is an explicit user step. Mobile and Desktop offer no evidenced file picker, direct URL input or Add/Merge selector. iOS is intentionally excluded from this accepted guide scope, despite upstream sideload distribution.

Dingo's local exact-name Import/Merge, Nuvio.tv's ID-based Merge and Dingo's complete-profile Send remain separate operations. Send Review and **Merge instead** are unchanged. Selected Collection(s) JSON export remains a separate future capability.

**Missing artwork or title details?** is one compact native disclosure beneath the four platform choices, shared by Export & Send and About & Credits. It starts collapsed, supports native keyboard activation, and retains its open state when returning from a platform page so chooser scroll/focus restoration remains stable. It uses the existing content scroller and modal host; no platform page repeats it.

The advice says TMDB Enrichment **may help** artwork/title details, directs users to **Settings → Integrations → TMDB** in the **Nuvio app**, **where available**, and states that enrichment is optional and is not required to import Collections. The shared wording follows the existing TV source evidence and owner-confirmed Mobile/Desktop setting availability. It does not imply identical settings on the Nuvio.tv account website, guaranteed artwork recovery or a personal API-key requirement. The guide has no technical evidence/version/test-status footers; dated source observations and physical-testing limits remain in the internal evidence below.

Nuvio.tv’s **Import modes** is a compact neutral reference panel with an even subtle border, a distinct background, smaller supporting text and separated mode entries. Mobile and Desktop explicitly direct users to copy their existing Nuvio Collections JSON and paste/save it safely in a note or file before using Dingo’s Copy JSON. Replacement and signed-in sync warnings are unchanged.

### Upstream evidence and limits — 2026-10-11

This guide is independently authored from contract facts, with no upstream implementation copied. The inspected app repositories are GPL-3.0. Current relevant upstream heads and the website account bundle were rechecked and unchanged from the investigation.

- [NuvioTV 1.0.0 import ViewModel](https://github.com/NuvioMedia/NuvioTV/blob/9f17e8bf4abc799dc8c832d2894a8b3b166e4353/app/src/main/java/com/nuvio/tv/ui/screens/collection/CollectionManagementViewModel.kt) establishes ID replacement and the exact Downloads filename; [TV import UI](https://github.com/NuvioMedia/NuvioTV/blob/9f17e8bf4abc799dc8c832d2894a8b3b166e4353/app/src/main/java/com/nuvio/tv/ui/screens/collection/CollectionManagementScreen.kt) exposes File/URL and hides Paste. The same relevant behaviour was checked in 1.1.0-beta.5 (`6adf0251bd93a0600802483d770c015ba9904ed3`) and current dev (`96d311bcb3bebed4656cdc1aee41aa62debcb195`).
- [NuvioMobile 0.5.9-beta import UI](https://github.com/NuvioMedia/NuvioMobile/blob/db0c50b503039863909c86405907462bf1752193/composeApp/src/commonMain/kotlin/com/nuvio/app/features/collection/CollectionManagementScreen.kt) and [repository](https://github.com/NuvioMedia/NuvioMobile/blob/db0c50b503039863909c86405907462bf1752193/composeApp/src/commonMain/kotlin/com/nuvio/app/features/collection/CollectionRepository.kt) establish paste import and full-list replacement; current `cmp-rewrite` head `ee3d915067362651e85dd6c959a92f147a77d110` retains those semantics.
- [NuvioDesktop 0.1.29-alpha import UI](https://github.com/NuvioMedia/NuvioDesktop/blob/80d8ce33d802ca24e162464350b146fcbbdd12a9/composeApp/src/commonMain/kotlin/com/nuvio/app/features/collection/CollectionManagementScreen.kt) and [repository](https://github.com/NuvioMedia/NuvioDesktop/blob/80d8ce33d802ca24e162464350b146fcbbdd12a9/composeApp/src/commonMain/kotlin/com/nuvio/app/features/collection/CollectionRepository.kt) separately establish the desktop paste/replacement contract; current Dev head `cc132db9bda6548ae9ef97aec1a3fff49c815637` retains it.
- The public [Nuvio.tv account bundle](https://nuvio.tv/_next/static/chunks/app/account/page-efe10aad1b57ad07.js) and [Collection helpers](https://nuvio.tv/_next/static/chunks/5986-51dfffd532b4fe6c.js) establish file selection, the three import modes, ID matching and duplicate handling. These are dated public implementation observations, not authenticated account acceptance.

Physical TV Downloads/storage/permission access remains an explicit owner test. Authenticated website import and physical Mobile/Desktop guest/signed-in sync combinations were not exercised. Browser fixture geometry and simulated Visual Viewport checks validate Dingo's presentation only. README/V1 retain adjacent stale beta/help wording; that separate interface is outside this change.

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
