# Builder Studio Sources

Status: selected-folder Add Source merged through issue [#92](https://github.com/davecollections/tmdb-id-lookup/issues/92) / PR [#93](https://github.com/davecollections/tmdb-id-lookup/pull/93); hierarchy creation complete and owner-reviewed through issue [#124](https://github.com/davecollections/tmdb-id-lookup/issues/124), with its narrow Worker contract manually deployed and live validated on 2026-08-19

Last reviewed: 2026-08-20

This document records both the stable selected-folder Studio source flow and the issue #124 guided hierarchy implementation. The interface always says **Studios**; TMDB and Nuvio continue to use the internal entity and source type `COMPANY`.

## Navigation and scope

`Add source` now opens the six-mode source-type picker: Movie franchise, People, Studios, Networks, Streaming service, and Genres. Every screen below that picker has a visible Back action:

- Movie franchise Search returns to the picker.
- People Search returns to the picker, while People Configure continues to return to People Search with its query, results, page, practical scroll position, selection, folder context, and result focus intact.
- Studio Search returns to the picker, while Studio Configure returns to Studio Search with its query, results, page, practical scroll position, folder context, and selected-result focus intact.

The Studio flow remains inside modal state; it does not use browser history. Close and Escape retain the established modal exit contract, and returning to the picker restores practical focus to the source-type option that opened the child flow.

Issue #92 added Studios only; it did not add Networks, Genres, or Advanced Discover, which remained separate milestones.

## Studio search and V1 compatibility

Search reads the existing ordinary `data/companies.min.json` catalogue. Rows are normalized defensively, duplicate IDs are ignored deterministically, malformed rows are skipped, and results use the Builder's 20-result paging convention.

V1 already searches Company ID, name, parent, two-letter country code, full English country name, country aliases, and raw headquarters text. It also uses a centered `object-fit: contain` TMDB logo treatment and opens a safe external TMDB Company link. V2 deliberately adapts those useful concepts without copying V1's dense table, raw address display, ID-default ordering, count-threshold selector, blank missing-logo cell, or sortable-column UI.

V2 Studio Search accepts:

- an exact positive TMDB Studio ID;
- case-insensitive, accent-folded Studio name prefix or substring after two characters;
- parent Studio text;
- country code or full English country name, including deliberate aliases such as `AU`/Australia and `JP`/Japan;
- headquarters/location text such as `California`.

When an entered two-letter value is a country represented in the catalogue, it is treated deliberately as that exact country code rather than as an arbitrary two-letter name fragment. Compact result context includes the Studio name, parent when available, TMDB ID, legacy Movie total, and a shortened `country code · locality/region` location. Street, suite, and postal detail are not shown.

For a non-empty query, hidden **Best match** ordering is deterministic: exact ID, exact name, name prefix, name contains, parent, then country/location. Movie count descending breaks ties only inside a relevance tier; it never lets a large unrelated location match outrank an exact or direct name match. Selected-folder Add Source retains its compact **A–Z** and **Most movies** pills plus **Hide studios with no movies**, which removes only known zero legacy counts before paging, so missing counts remain visible and result/page totals reflect the filtered set. Query, override, filter, results, page, scroll, folder context, and focus survive Configure → Back.

When the query is empty, Studio Search automatically browses the same cached catalogue in pages rather than requiring a separate Browse action or rendering every Studio at once. Browse defaults to Most movies because relevance has no meaning without a query. A–Z overrides it; deselecting A–Z returns to automatic Most-movies Browse. Typing from Browse without the A–Z override naturally returns to hidden Best Match. The standard `type="search"` in-field clear updates ordinary React input state, immediately returns Studio Search to automatic Browse, and resets paging without an adjacent custom clear button.

A valid catalogue value uses exactly `Movie Count: XXX`, including `Movie Count: 0`; an absent or malformed value uses `Movie Count: Unknown`. The legacy compact catalogue encoded known zero by omitting `t`, so the loader recognizes that legacy catalogue-wide encoding. Corrected Company writers retain explicit `t: 0`; once that new encoding is present, a missing `t` remains Unknown. The catalogue value is browsing context only and is never promoted into Configure's current count.

Search and Configure use the same normalized logo frame: a fixed centered box with internal padding, clipped overflow, full inner bounds, and `object-fit: contain`, so wide, square, tall, and transparent-padded assets remain centered without crop or stretch. Missing and failed images use understated **No logo** / **No logo available** text; no initials, generated branding, emoji, or image-processing pipeline is involved. Configure and Edit place the canonical `https://www.themoviedb.org/company/{id}` link at the upper-right of the identity card and open it in a new tab with `noopener noreferrer`.

Browsing and paging make zero live count requests. The catalogue is loaded lazily and cached in memory only after successful normalization; failures remain retryable. No global typed-count sidecar, scan, recovery state, or publication dependency is restored.

## Configure and current counts

Selecting one exact Studio opens `Add studio` and starts exactly two parallel, structured requests through the configured canonical Worker origin:

```text
GET /3/discover/movie?with_companies={positive Studio ID}
GET /3/discover/tv?with_companies={positive Studio ID}
```

Movie and Series states resolve independently to Checking, a positive count, zero, or the quiet `Count unavailable` state. A successful dimension remains visible when the other request fails. Counts are informational: zero and unavailable values do not disable an otherwise supported source. Counts load automatically and expose no manual Retry or permanent Refresh control. Ordinary repeat selection may reuse a successful value for five minutes. The cache is success-only and least-recently-used with a 40-count-entry total bound across both dimensions. Requests have a 12-second timeout, linked abort behavior, sanitized errors, and request-generation protection so leaving Configure or selecting another Studio prevents stale updates.

The final issue #92 acceptance pass exercised bounded Pixar (`3`) and Warner Bros. Pictures (`174`) requests through the desktop and same-network Vite previews after the reviewed Worker route change was deployed manually. Both previews loaded beyond the initial Builder screen and returned Pixar **136 Movies / 15 Series** and Warner Bros. Pictures **3,123 Movies / 8 Series**. Negative route checks also passed. No credential was moved into the browser.

For deterministic local UI review without Worker deployment or live TMDB requests, run from `builder/`:

```powershell
$env:TMDB_STUDIO_MOCK_COUNTS = "1"
npm run dev -- --host 127.0.0.1 --port 4173
```

This explicit development-only mode intercepts only the canonical local Studio Discover paths. No-sort requests return deterministic totals for physical Add Source; approved sort-aware Company requests additionally return a deterministic ordered first page for hierarchy Preview. It is disabled for `npm run build`, does not broaden production routes or authentication, and does not mock another request family. Remove the environment value after review with `Remove-Item Env:TMDB_STUDIO_MOCK_COUNTS`.

The live Worker admits the exact no-sort Movie and TV paths above with exactly one canonical positive safe-integer `with_companies` value, plus the narrow issue #124 Company `sort_by` expansion for accurate explicit hierarchy Preview. The deployed source permits only Popular, media-correct Recent, Top rated, and Most voted; parameter order may vary, but duplicates, wrong-media sorts, arbitrary filters, mixed Company/Network parameters, and every extra value fail closed. The Network route remains no-sort. The upstream host, browser-origin rules, service-token boundary, authentication, CORS, response forwarding, API-key handling for already-allowed requests, and sanitized failures are unchanged.

After separate owner authorization, the exact reviewed issue #124 Worker source was manually deployed and its complete acceptance/rejection matrix was live validated on 2026-08-19. The deterministic local mock remains available for repeatable UI review. Worker deployment is independent of Builder publication; the overall V2 Builder remains governed by its separate release and noindex boundary.

## Guided Studio hierarchy creation — issue #124

Studios is registered in both hierarchy launcher scopes:

- **New Collection → Studios** creates one ordinary editable `Studios` collection with one Studio Folder per eligible selection.
- **New Folder → Studios** adds eligible Studio Folders beneath the captured existing Collection without changing its presentation.
- selected-folder **Add Source → Studios** remains the separate issue #92 physical-source flow described elsewhere in this document.

The hierarchy uses **Select → Configure → Appearance → Create**. Search reuses the exact checked-in Company catalogue, query parsing, automatic Browse, paging, ranking, logo frame, and `Movie Count: XXX` / `Movie Count: Unknown` wording. Hierarchy Search makes the checked-in **Movie count** filter group primary: **All**, **Exclude 0**, **10+**, **50+**, **100+**, and **500+**. It exposes only one quiet **A–Z** ordering override; Most movies remains the hidden automatic Browse order and Best Match remains the hidden automatic text-search order. Toggling A–Z off restores the applicable automatic order. Filtering happens before paging. Unknown counts remain in All and Exclude 0 but do not satisfy a numeric threshold. Changing the filter resets to page 1, and its state survives Configure → Back. The filter makes no API request; selected-folder Add Source remains unchanged with its visible Most-movies and hide-zero controls.

Result cards become full-card native-checkbox targets with the established circular indicator. Selection is insertion-ordered and uncapped; removing and re-adding appends the Studio, and an informational notice begins at 50 without imposing a ceiling. A compact selected disclosure keeps identity, useful count context, and Remove in Select; it has no Preview action because media and sort are not configured yet. Search cards contain no nested Preview action.

Configure applies one shared composition and one shared semantic sort to the batch. **Movies** and **Popular** are the defaults. Composition is Movies, Series, or Movies + Series; sort is Popular, Recent, Top rated, or Most voted using the already-evidenced media-specific values. There is no Automatic mode and no per-Studio override. Beneath those shared controls, every selected Studio is a directly visible row with its logo/fallback, name, checked-in Movie count, any Series total learned from explicit Preview, current placement state, **Preview titles**, and a compact accessible remove action. Placement reacts to composition, sort, destination, and project state without resolving artwork or requesting titles. Removing the last Studio remains in Configure, shows a calm empty state, and disables progression to Appearance. Hierarchy sources are named exactly **Movies** and **Series**, in Movie-then-Series order, while physical Add Source keeps `<Studio>` and `<Studio> Series`.

The final **Appearance** stage contains only applicable presentation controls and useful plan totals. It deliberately has no selected-Studio list, counts, Preview/remove actions, routine per-Studio placement review, artwork section, representative artwork sample, or shape selector. Studio folders still use fixed Landscape artwork from the already-resolved frozen plan; hierarchy creation exposes no artwork/shape decision on Appearance, while individual artwork remains editable later through ordinary Edit Folder. The technical fallback chain remains documented below and is not exposed in this UI.

### Explicit title Preview and transient counts

Preview is user-triggered only from the always-visible action on every Configure Studio row. Movies-only opens Movies, Series-only opens Series, and Movies + Series opens Movies first. The Series tab does not request until it is opened. Closing, switching, and superseding work use the shared request coordinator, linked aborts, and stale-generation suppression. The structural `NestedPreviewDialog` shell is shared with Franchise Preview for the body portal, nested backdrop, dialog/focus semantics, Close, Escape, and containment; Studio and Franchise keep separate provider and result models. Exact trigger focus is restored and the inert outer creation state/scroll is retained. Known exact Discover totals appear with their media label/control; an unopened media remains count-free unless a previous successful Preview already supplied its transient count. The ready grid contains only usable posters, omits posterless results and all individual captions/metadata, renders at most 10 items above 520px or 5 at 520px and below, and uses one modal-level empty state if none remain. No implementation-order, cache, request, or source-mutation prose appears in the ready modal.

One Company Discover response supplies both `total_results` and the ordered first-page results. The Studio provider normalizes title/name, date/year, poster path, and media without locally re-sorting the first page. Its success-only in-memory response cache defaults to five minutes and 40 LRU-style entries. Identity is Company ID + media + concrete sort. Failures and aborts are not cached; a successful zero-result response is cached; viewport slicing is not part of identity.

Search continues to show only the catalogue Movie Count and never mutates it after Preview. A successful explicit Series Preview retains its `total_results` transiently by Company ID + media, so the calm `Series · count` detail may survive sort changes. A later successful Series result replaces the older value, including zero. Until success, Series count is simply omitted outside Preview. Preview responses, counts, errors, cache state, and loading state are never serialized and do not participate in source identity, logical duplicate classification, plan eligibility, stale comparison, or apply.

Browse, select, Configure, Appearance, plan, revalidation, and apply make zero automatic per-Studio Discover title/count requests. One cold media Preview makes one request; the same fresh exact-key Preview makes zero; Movies + Series makes one request when only Movies is opened and two cold requests only after both tabs are explicitly opened.

### Artwork, placement, plan, and presentation

Studio hierarchy Folders are fixed **Landscape** with no shape selector or per-item artwork controls. One workspace-scoped artwork runtime client performs one validated batch load. Resolution is approved Company Landscape runtime artwork, then the checked-in Studio logo through the safe TMDB `w500` helper, then no image plus 🎬. Artwork is resolved before the ephemeral plan; revalidation and apply perform no artwork network work and write nothing to the asset repository.

Folder title visibility defaults to canonical **Show everywhere** and reuses the shared Title options. New Collection also reuses collection title visibility, Tabs/Rows, Tabs-only Show All, and Pin to top. New Folder inherits the captured parent presentation read-only. There is no Studio-specific presentation field.

Logical identity is Company ID; physical identity remains Company ID + media. In New Folder, a destination Company that is complete or partial for the requested composition is omitted with no hierarchy override. Matching identities elsewhere remain informational and addable. The planner creates only ordinary nodes, revalidates immediately against the current revision and placement, and applies through one existing atomic controller batch. Late failure rolls back everything. Order remains selected Studio order, and New Folder preserves parent fields apart from intended ordered Folder insertion.

No current-client Studio hierarchy import/export result is claimed by issue #124. The implementation uses the already-evidenced native `COMPANY/MOVIE` and `COMPANY/TV` source contracts and keeps `catalogSources` empty for native sources.

## Source-contract evidence and decision

Repository evidence now retains both `COMPANY/MOVIE` and `COMPANY/TV`:

- stable V1 Company export emits `provider: "tmdb"`, `tmdbSourceType: "COMPANY"`, `mediaType: "MOVIE"`, `sortBy: "popularity.desc"`, numeric Company ID, empty filters, and the canonical Company name;
- the retained current-client resolver matrix records that a native `COMPANY` source forces its numeric `tmdbId` into `with_companies` and ignores a competing filter value for either selected media endpoint;
- the same matrix records all correct-media TV sort values as raw pass-through-capable in both pinned clients, with `first_air_date.desc`, `popularity.desc`, `vote_average.desc`, and `vote_count.desc` exposed in current client UIs;
- `tests/fixtures/nuvio/valid/all-native-tmdb-source-types.json` now contains Movie and TV `COMPANY` sources sharing Company ID `1003`, with empty filters, authoritative `sources`, empty `catalogSources`, and media-correct Recent sorts;
- the V2 contract, Studio construction, duplicate, serializer, edit, and second-cycle tests retain both physical sources without a compatibility projection.

The enabled Studio Movie draft is exact and deterministic; Studio Series uses the same shape and Company ID with title `<Studio> Series`, `mediaType: "TV"`, and the media-correct sort:

```json
{
  "category": "native-tmdb",
  "editable": {
    "title": "Pixar",
    "sortBy": "popularity.desc",
    "tmdbId": 3,
    "filters": {},
    "provider": "tmdb",
    "mediaType": "MOVIE",
    "tmdbSourceType": "COMPANY"
  }
}
```

Movie starts with the stable V1 Company name and Series starts with `<Studio> Series`. Both append to authoritative native `sources`; `catalogSources` stays empty, and counts, logos, catalogue metadata, UI state, and projection-only fields do not serialize. The existing folder and its presentation/artwork are preserved; the Studio logo or fallback is Configure/search presentation only.

**Sort titles by** uses four compact, no-icon semantic pills with one description below the row for the selected choice. One semantic choice applies to both selected sources while serialization maps media correctly:

| Choice | Movie `sortBy` | TV `sortBy` |
| --- | --- | --- |
| Popular | `popularity.desc` | `popularity.desc` |
| Recent | `primary_release_date.desc` | `first_air_date.desc` |
| Top rated | `vote_average.desc` | `vote_average.desc` |
| Most voted | `vote_count.desc` | `vote_count.desc` |

Popular remains the default and preserves stable V1 Company output. Sort choice never changes either count request. This is retained current-client resolver/UI evidence, not a new direct-TMDB effect claim.

## Existing Studio source editing

The selected-source menu exposes **Edit** for complete native `COMPANY/MOVIE` and `COMPANY/TV` sources. The dialog keeps Studio identity, TMDB ID, source type, media type, and filters fixed; it owns only display `title` and `sortBy`. **Source name** is prepopulated and explains that it changes Nuvio display only. The dialog reuses the same identity/logo treatment, upper-right TMDB Company link, media-correct automatically loaded current count, quiet unavailable state without Retry or Refresh, and compact no-icon sort pills as Configure. User-facing source labels are **Movies** and **Series**; the underlying media-specific contracts remain `MOVIE` and `TV`.

Saving a changed name and/or supported sort applies one difference-only patch to the existing physical source and inserts no source. Rename never changes Company ID/type/media/filters or duplicate identity. Cancel and unchanged Save are non-mutating. An untouched unusual imported sort remains byte-preserved and visible, but once changed it must map to the source media. The session retains the shared stale-state, physical-source, validation, serialization, and folder-local duplicate protections; the edited source excludes itself, but another physical source with the same media-specific Studio identity blocks Save.

## Duplicate, submission, and accessibility behavior

Identity is media-specific: `tmdb|COMPANY|numeric tmdbId|MOVIE` or `tmdb|COMPANY|numeric tmdbId|TV`; display title and sort are not identity. A same-folder match disables only that media choice and marks it inline as **Already added**. One compact sentence explains the outcome: for example, **Movies already exist. Add will only include Series.** The normal, visually dominant primary action adds only selected missing sources. A quieter **Add all anyway** action may intentionally add the complete configured set; its approval token is bound to the exact destination folder and ordered physical identities, so changing Studio/media configuration invalidates it. Full duplicates show **No new sources to add** instead of a misleading normal Add action. The atomic controller service rechecks the selected/existing folder and current duplicates immediately before insertion. Matches elsewhere remain non-blocking and use a distinct teal **This source exists elsewhere** panel with up to three unique `Folder · in Collection` locations, then `+ N more`, followed by **You can still add it to this folder, or close this window to cancel.** Blank or Nuvio-invisible location titles render only as **Hidden folder** / **Hidden collection** without changing stored values. Source Edit remains strict and has no duplicate override.

The dialog reuses the established semantic modal, body/inert lock, focus trap, Escape behavior, live status/alert patterns, Visual Viewport handling, safe-area padding, and one scroll owner. Studio controls retain keyboard semantics and mobile tap targets; source choices collapse to one column at 520px and below, while sort pills wrap naturally. Franchise, People, and Studio retain ordinary `type="search"` inputs and their subtle in-field browser clear affordance; issue #92 adds no adjacent clear control or replacement abstraction. TMDB-backed Configure identity cards place their external entity link consistently at upper-right.

Bounded final browser QA used the real production build at 1280px desktop and the same-network production preview at 360, 384, 390, 393, 402, and 412px widths. Automatic Browse, search/clear return, Pixar selection, live and unavailable count states, source creation, partial/full duplicates, Edit, sticky actions, tap targets, and single-column source cards passed with no horizontal overflow or console warnings/errors. The LAN app loaded beyond the initial Builder screen and the live totals described above were observed.

At desktop width, double-clicking a Collection or Folder primary card opens its existing editor; double-clicking a supported Source primary card opens its registered physical-source editor. Single click remains selection/navigation. The handler runs only at desktop viewport state and accepts the primary card target while rejecting nested buttons, links, form controls, roles, and contenteditable descendants. Drag handles and three-dot menus remain separate sibling controls, and the explicit menu Edit route remains available on desktop and touch.

## Deliberate exclusions

Issue #92 does not create or modify folders, consume the published artwork runtime, edit Studio identity/media/filter fields, alter V1 output, change the checked-in production Company catalogue JSON/CSV, recreate global count pre-caching, change historical request-budget receipts, add dependencies, or begin Networks, Genres, or Advanced Discover. The final zero-filter regression fix changes only the two existing Company compact writers so future refreshes preserve explicit zero values; no catalogue refresh or hosted workflow is dispatched by the issue branch.

Issue #124 does not change that physical flow, add Network or Decades Preview, expose arbitrary Discover forwarding, manually deploy the frontend or bypass the V2 release/noindex boundary, write assets, add dependencies, or claim new Nuvio-client hierarchy evidence. Its only independently deployed production change is the separately owner-authorized exact narrow Worker contract recorded above.
