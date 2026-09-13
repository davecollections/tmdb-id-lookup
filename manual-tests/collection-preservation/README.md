# Collection import/export preservation

Use `206-collection-preservation-master.json` for each run. This checks what survives in saved JSON. Do not open title results or test filters, ranking, counts or Preview. A People or List filter is kept if its saved value survives.

The master contains **6 collections, 24 folders and 68 physical sources**. The manifest records **2,112 original field/order rows**. The [13 September results](./RESULTS.md) record the completed investigation and confirmed routes. No further compatibility investigation or owner testing is required for #206. The instructions and generated comparison/blank log below remain reusable templates, not claims that every listed procedural detail was recorded.

## Before each run

1. Keep an untouched copy of the master on the PC. Each run starts with this file, never another route's export. Its SHA-256 is in `case-manifest.md` and `case-manifest.json`.
2. Use an empty, isolated test destination. Do not clear a real collection library to make room. Use a separate test profile/account where available. Finish and retain one run before preparing the next empty destination.
3. Close other clients using that test profile. Pause or avoid their sync activity. Record any sync that still happens during the run. Do not use the outdated iOS app.
4. Record the installed app version/build, start and export times with timezone, import interface, export interface, destination isolation and relevant sync activity. For nuvio.tv, record the URL and time; if no website build is shown, say so. Do not record credentials or access tokens.
5. Import and export without editing the cases. If import or export fails, keep the exact file and error privately and stop that run. Do not repair the master or switch routes silently. A case's removal is a preservation finding, not automatic proof that its feature should be supported.

## Four independent runs

| Route | Import | Export | Save the returned file as |
| --- | --- | --- | --- |
| nuvio.tv | Account website, Collections → Import → master file | Collections → Export | `01-nuviotv-collections-export.json` |
| Desktop | Desktop Collections → Import, paste the complete master JSON | Desktop Collections → Copy JSON, save clipboard text as UTF-8 JSON | `02-desktop-direct-export.json` |
| TV normal import | Fire TV Collections → Import → URL, use the compressed local master link | TV Collections → Export File; retrieve the on-device export using File Explorer | `03-tv-url-import-direct-export.json` |
| TV Manage from phone | Local phone page, Collections → Import → File, choose the untouched master | Same local page → Export, after Save Changes, TV confirmation and reload | `04-tv-phone-import-phone-export.json` |

**Confirmed supplied routes:** The owner confirmed that every method started with a fresh import of the original master. Manage from phone imported and exported through that interface. Direct TV imported through the local network URL, exported on the TV, and the on-device export was retrieved using File Explorer. The compressed transfer decoded to the unchanged master. Exact run times, sync activity, destination isolation and other unrecorded procedural details remain unknown; no internal import/sync/export cause is inferred.

### nuvio.tv

Open the account website's Collections page in the isolated destination. Import the master, allow the normal save/sync to finish, then export from Collections. Save the download without opening and resaving it. Record any sync activity. This account website is separate from the TV's local Manage from phone page.

### Desktop

Open Collections in the Desktop app. Use Import and paste the whole master file. After import completes, use the Copy JSON icon. Save the copied text into a new plain UTF-8 file using the filename above. Do not format or edit its contents. Record that export used the clipboard and how the text was saved; the retained file's hash identifies those saved bytes, not unavailable clipboard byte encoding. No website import/export occurs in this run.

### Fire TV normal import using a local link

Keep the PC awake and connected to the same local network as the Fire TV. Start `serve-master.mjs` on the PC LAN address. For this tested Fire TV beta 0.9.2 build, use the link ending in `/206-gzip.json`. It transfers a compressed response that decodes to the exact untouched master. The earlier `/206.json` transfer failed on the Stick; the compressed route succeeded. This is transport evidence, not proof of the internal cause.

On Fire TV, open Collections → Import → URL. Enter the local link, load/validate it and confirm Import. Allow the normal save/sync to finish. Record the TV version and any sync activity.

For direct export, use TV Collections → Export File. Nuvio reports saving `nuvio-collections.json` to system Downloads. Retrieve it using File Explorer and retain the exact bytes as `03-tv-url-import-direct-export.json`. Downloader's empty file list is not proof that no export exists; the owner successfully retrieved this export using File Explorer.

If direct retrieval is unavailable in a future run, the fallback is the TV's **Manage from phone** QR/local address, then Collections → reload → Export. Do not import, edit or press Save Changes on that export-only visit. Save as `03-tv-url-import-phone-export.json` and label the result as TV URL import plus local phone export. That fallback was not used for the supplied direct-TV file. A repeated direct Export File replaces the existing filename.

### Fire TV Manage from phone import

Prepare another empty, isolated test destination. Open the TV's Manage from phone local page, then Collections → Import → File. Select a fresh download/copy of the untouched master. Confirm Import, press Save Changes, approve the request on the TV and wait for confirmation that changes were applied. Reload the local phone page, then use Export. Retain the download as `04-tv-phone-import-phone-export.json`.

The reload matters: the phone Export button serializes the page's current collection state. Exporting immediately after import, before saving and reloading, would test an unsaved browser draft.

## Return and compare

Return each exact export with the run details. Keep returned exports, screenshots, filled run logs and reports outside the repository. Renaming a file does not change its contents. Do not open and resave a downloaded export merely to make it readable.

`comparison.md` contains the initial six-column template. The populated comparison is retained outside Git; [RESULTS.md](./RESULTS.md) gives the findings and provenance. `case-manifest.md` is the short case index. `case-manifest.json` includes every field's original typed value, original location, case purpose and probe status. `@order` rows show case markers in saved array order. Repeated identical sources have separate occurrence paths and the same case marker.

Result labels:

| Label | Meaning |
| --- | --- |
| Kept | The same saved value and type. Object-property order and JSON whitespace do not matter. |
| Changed | A value/type changed or an additional field appeared without an established default. |
| Removed | The field was present in the master and is absent in the export. Review the case's scope before treating this as a bug. |
| Added default | An absent presentation option gained a value. This does not automatically mean equivalent behavior. |
| Equivalent change | A verified equivalent TMDB ID representation, matching alias removal with its canonical value intact, or cleanup of fully identical source copies. The exact change remains visible. |
| Not tested | No export for the route, or a field cannot be compared because matching is ambiguous. The detailed report explains which. |

Unknown fields, conflicting aliases, unexpected conversions, and null/empty removals remain visible. Defaults are not assumed to be the same between clients: the pinned TV folder model defaults Focus GIF to true, while the earlier website exports added false. Meaningful array order is never sorted away. Changed IDs remain reported even when a unique case marker allows matching.

For Codex: copy `run-log-template.json` outside Git, complete one entry per finished run, set its status to `Completed` and `exportFile` to that exact export's path (relative to the run log or absolute). Leave unavailable routes as `Not tested` with a null export path. Use a fresh report directory:

```powershell
node scripts/investigate-shared-advanced.mjs matrix manual-tests/collection-preservation/206-collection-preservation-master.json C:\path-outside-repo\runs.json C:\path-outside-repo\new-comparison
```

The existing comparator writes the complete typed comparison and run metadata to `matrix.json`, the full table to `comparison.md`, and a readable changes-only report to `interpretation.md`. It retains byte-for-byte copies of the master, run log and returned exports. Its hashes identify the exact files. It refuses an existing report directory, incomplete run metadata, a master hash mismatch, or output inside Git. Comparisons belong to the recorded complete route; no internal import, sync or export attribution is inferred.

## Coverage and evidence limits

- Collection ROWS/TABBED_GRID, names, Unicode, backdrop URL/null/empty/absent, pinning, focus glow and Show All true/false/absent.
- Folder POSTER/SQUARE/LANDSCAPE, Hide title, emoji, all six artwork/emoji fields populated/null/empty/absent. Focus GIF On/Off each has a URL and no URL case.
- DISCOVER, COMPANY, NETWORK, PERSON and DIRECTOR use their valid Movie/TV combinations and four family-supported sorts. NETWORK is TV only. LIST uses its Movie wire identity, List order, Recent, Top rated and Most voted; a List's contents can be mixed. COLLECTION uses Movie and List order. Cinemeta Movie/Series sources include their compatibility projections.
- All 18 Discover fields, watch region, providers, exclusions, included AND/OR expressions, matching aliases, typed positive integer/string IDs, explicit zeros, nullable filter fields and empty string probes. Imported People and List filters test saved values only.
- Compound language/country/network expressions, conflicting aliases, unfamiliar imported filter values and addon titles are marked preservation probes. Their retention does not establish client use, endpoint semantics or support. No title retrieval or artwork rendering is part of this test.

The master is authored from public schema and existing sanitized recipes, not from a private library. Local Builder import/serialization checks accept it and retain all source/settings values; the current serializer adds empty `catalogSources` arrays to 22 folders where that field is absent. Those additions are recorded by the comparator. The master retains its deliberate absences and is never replaced by that Builder output. This local validation does not fill any of the four client columns.

## Confirmed interfaces and public references

Inspected 13 September 2026. Pins describe source inspected, not an assertion about the installed Fire TV build.

- TV commit `e54a74904b7ee40e5c748e156a70749f89e8decf` (source 0.9.2-beta, build 1058): [Collections screen](https://github.com/NuvioMedia/NuvioTV/blob/e54a74904b7ee40e5c748e156a70749f89e8decf/app/src/main/java/com/nuvio/tv/ui/screens/collection/CollectionManagementScreen.kt), [file/URL import and export data](https://github.com/NuvioMedia/NuvioTV/blob/e54a74904b7ee40e5c748e156a70749f89e8decf/app/src/main/java/com/nuvio/tv/ui/screens/collection/CollectionManagementViewModel.kt), [local phone Import/Save/Export page](https://github.com/NuvioMedia/NuvioTV/blob/e54a74904b7ee40e5c748e156a70749f89e8decf/app/src/main/java/com/nuvio/tv/core/server/AddonWebPage.kt), [local saved collection endpoint](https://github.com/NuvioMedia/NuvioTV/blob/e54a74904b7ee40e5c748e156a70749f89e8decf/app/src/main/java/com/nuvio/tv/core/server/AddonConfigServer.kt). TV's file import expects a fixed Downloads filename; this pack uses URL import to avoid transferring files onto the Stick.
- Desktop commit `ab579533ece5ecb51294652696cf4928f5d4a73d` (0.1.23-alpha, build 23): [Collections paste Import and Copy JSON](https://github.com/NuvioMedia/NuvioDesktop/blob/ab579533ece5ecb51294652696cf4928f5d4a73d/composeApp/src/commonMain/kotlin/com/nuvio/app/features/collection/CollectionManagementScreen.kt).
- Website Collections import/export is the owner-confirmed route from the earlier investigation. Its earlier outcomes are not copied into this master's results.
- Public URL examples: [Nuvio assets](https://github.com/davecollections/nuvio-assets), [Marvel's rotating Earth GIF](https://commons.wikimedia.org/wiki/File:Rotating_earth_(large).gif) under [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/), [MDN flower video example](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/video), and [Cinemeta manifest](https://v3-cinemeta.strem.io/manifest.json). Media is referenced unchanged by URL; no media is copied into the pack.

## Local helper and checks

From the repository root, replace `PC_LAN_ADDRESS` with the PC's current local address:

```powershell
node manual-tests/collection-preservation/serve-master.mjs PC_LAN_ADDRESS 8766
```

The helper serves only `/206.json` and `/206-gzip.json`, both representing the same master; it has no file listing, upload endpoint or access to returned exports. Keep it running during the imports, then stop that process. If the phone/TV cannot reach the link, record the connection failure before changing the route. Local byte checks remain separate from the owner-confirmed successful compressed import.

```powershell
node manual-tests/collection-preservation/generate-pack.mjs --check
node --test tests/shared-advanced-investigation.test.mjs tests/collection-preservation.test.mjs
.\scripts\check.cmd
git diff --check
git status --short
```

The required repository check includes existing production integration regressions. Those checks do not test this pack's title behavior or supply results for its manual routes.

The preservation investigation is finished and included with the original investigation in PR #207; see [the combined inventory](./REVIEW.md#complete-combined-pr-inventory). The owner reported the preservation findings in Nuvio Discord; no message link was supplied. Builder creation and export must continue using the correct supported JSON, with no workarounds for upstream sort rewrites, removed exclusions or differing defaults. These findings do not block the approved Studio minimum-votes work. The private Drive archive and retained evidence remain unchanged. No runtime implementation or Worker deployment belongs to this investigation.