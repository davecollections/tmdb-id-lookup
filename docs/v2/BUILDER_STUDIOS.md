# Builder Studio Sources

Status: merged through issue [#92](https://github.com/davecollections/tmdb-id-lookup/issues/92) / PR [#93](https://github.com/davecollections/tmdb-id-lookup/pull/93), with owner review complete

Last reviewed: 2026-08-16

This document records the selected-folder Studio source flow. The interface always says **Studios**; TMDB and Nuvio continue to use the internal entity and source type `COMPANY`.

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

For a non-empty query, hidden **Best match** ordering is deterministic: exact ID, exact name, name prefix, name contains, parent, then country/location. Movie count descending breaks ties only inside a relevance tier; it never lets a large unrelated location match outrank an exact or direct name match. The compact **A–Z** and **Most movies** pills are explicit overrides; selecting the active override again returns a normal search to hidden Best Match. **Hide studios with no movies** removes only known zero legacy counts before paging, so missing counts remain visible and result/page totals reflect the filtered set. Query, override, filter, results, page, scroll, folder context, and focus survive Configure → Back.

When the query is empty, Studio Search automatically browses the same cached catalogue in pages rather than requiring a separate Browse action or rendering every Studio at once. Browse defaults to Most movies because relevance has no meaning without a query, and the **Most movies** pill visibly reflects that effective ordering. A–Z overrides it; deselecting A–Z in Browse visibly returns to Most movies. Typing from Browse without an explicit override naturally returns to hidden Best Match. The standard `type="search"` in-field clear updates ordinary React input state, immediately returns Studio Search to automatic Browse, and resets paging without an adjacent custom clear button.

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

This explicit development-only mode intercepts only the two canonical local Studio Discover paths and returns deterministic fake totals. It is disabled for `npm run build`, does not broaden production routes or authentication, and does not mock any other request. Remove the environment value after review with `Remove-Item Env:TMDB_STUDIO_MOCK_COUNTS`.

The Worker admits only the exact Movie and TV paths above with exactly one canonical positive safe-integer `with_companies` value. Missing, duplicate, zero, signed, fractional, unsafe, malformed, unrelated, and extra query values are rejected before an upstream request. The upstream host remains fixed to TMDB; browser-origin, authentication, CORS, successful response caching, API-key stripping for already-allowed requests, and sanitized failure behavior are retained.

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
