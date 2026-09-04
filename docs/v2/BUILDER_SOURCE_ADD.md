# Builder Add Source: TMDB Movie Franchises

Status: foundation merged through issue [#65](https://github.com/davecollections/tmdb-id-lookup/issues/65) / PR [#66](https://github.com/davecollections/tmdb-id-lookup/pull/66); owner review of the chooser/Preview checkpoint is complete through issues #164 and #166; eighth family TMDB Lists merged through issue [#170](https://github.com/davecollections/tmdb-id-lookup/issues/170) / PR [#171](https://github.com/davecollections/tmdb-id-lookup/pull/171) after Worker deployment, live acceptance, and owner review

Last reviewed: 2026-09-03

## Scope

At the issue #65 checkpoint, the first end-to-end Builder source-creation flow and one reusable provider boundary exposed only **Movie franchise · TMDB**. That flow adds one native TMDB `COLLECTION` source to the currently selected folder and still does not create collections or folders automatically; later issues added other modes beside it in the shared picker.

The current selected-folder picker order is **Movie franchise**, **TMDB lists**, **People**, **Studios**, **Networks**, **Streaming**, **Genres**, then singular **Decade**. TMDB Lists uses the focused contract in [`BUILDER_TMDB_LISTS.md`](./BUILDER_TMDB_LISTS.md); its narrowly allowlisted List route is deployed and passed live acceptance. Issue [#160](https://github.com/davecollections/tmdb-id-lookup/issues/160) added Decade without changing the original Collection flow documented below. Decade uses compact radio pills for one Decade family, compact all-or-multi-select Year checkbox pills for its complete period or multiple individual years, and the existing Media and Sort radio pills. Every selected period retains its general source; zero or more media-compatible text-only Genre checkbox pills add separate canonical logical sources in catalogue order. Approved Advanced settings apply across the complete period × logical-source × media bundle with general and per-Genre exclusion ownership. Exact title Preview uses optional Year, Source, and media selectors and requests only the active physical combination. Duplicate review remains physical-source exact, and one existing atomic source-batch Save applies every eligible candidate.

Issue #164 aligned the then-seven-family picker with the established New Collection/New Folder launcher-card presentation. Both surfaces share one narrow card/icon rendering seam and the same responsive grid, spacing, typography, surface, hover, and explicit focus-visible language. Add Source retains its own immediate-navigation semantics: no Blank option, selected state, radio/check control, accent rail, or retained chooser choice. Issue #166 later removed the blanket claim that every current or future family uses TMDB; provider context remains source-specific. Initial focus remains on Movie franchise, and Back from a family flow restores focus to the exact originating card.

Context may change container settings, but it must not silently reduce source-level capability. Issue [#176](https://github.com/davecollections/tmdb-id-lookup/issues/176) closes the confirmed People gap: selected-folder People Add now exposes the same Popular/Recent/Top-rated semantic Sort control already used by People hierarchy creation and maps the selection through exact drafts, Preview, duplicate evaluation, and atomic Save. Network Add Source already exposed both Sort and **Preview titles** and is unchanged. An enforceable test-owned matrix now covers Media, Sort, filters/Advanced, role/credit type, Preview, Source name, and safe physical identity across all eight native families in Add, guided creation, and Source Edit. Source-name parity remains an open product decision rather than a requirement for bulk generated inputs.

The flow accepts:

- a title search after two trimmed characters;
- an exact positive decimal TMDB collection ID;
- an exact HTTPS `themoviedb.org` or `www.themoviedb.org` collection URL with `/collection/{positive-id}` or `/collection/{positive-id}-{slug}`.

The strict parser uses the platform `URL` implementation. It ignores query strings and fragments only after the scheme, host, port, credentials, and path have passed validation. Exact IDs and URLs are resolved through collection details before Apply.

## Architecture

Framework-independent code lives under `builder/src/source-add/`:

```text
source-modes.js               visible provider-neutral mode metadata
tmdb-collection-input.js      strict exact-input classification and title-search eligibility
tmdb-image.js                 validated UI-only TMDB poster URL construction
tmdb-collection-provider.js   Worker requests, bounded normalization, errors, timeout, and cache
async-request-state.js        replaceable request generations and stale-result suppression
movie-franchise-source.js     draft recipe, semantic validation, identity, duplicate check, and insertion service
index.js                      public exports
```

`builder/src/ui/AddSourceDialog.jsx` consumes only the normalized provider interface:

```text
searchCollections(query, { page, signal })
getCollection(id, { signal })
```

It does not know TMDB payload field names and does not call `fetch` directly. Vite reads exactly one anchored `TMDB_PROXY_BASE_URL` declaration from the existing stable root `js/config.js` at build/dev startup. After trimming, build-time and runtime validation accept only the parsed HTTPS origin or that exact origin plus one trailing slash; credentials, explicit ports, paths, queries, fragments, empty query/fragment markers, dot-segment or encoded-path normalization, doubled separators, and other raw aliases are rejected. Vite injects the canonical origin into the adapter. This is data extraction only: it does not evaluate or import the classic v1 script, and the Builder source contains no second endpoint literal or v1 DOM globals.

The adapter uses only:

- `/3/search/collection`;
- `/3/collection/{id}`.

Every search explicitly sends `include_adult=false`, including in its cache identity. Search normalization excludes a result only when that result object explicitly reports boolean `adult: true`; a missing flag remains eligible. The Builder otherwise preserves TMDB's returned result set and order. It does not hard-admit results through local whole-word, prefix, singular/plural, accent, spelling, or mature-word matching.

Collection details are accepted when they contain a valid positive collection ID, a usable name, and a structurally valid contained-parts array. Collection names, overviews, contained `title`/`original_title` wording, collection-level adult flags, and contained-part adult flags do not independently block Review or exact ID/URL lookup. The Builder relies on TMDB's collection results and is not an age-classification service; it does not guarantee that every returned collection or contained title is appropriate for every age and implements no age gate or custom word or image classifier.

Normalized responses are reduced to collection ID, name, bounded overview text, a validated relative poster path, pagination, movie count, and ordered contained movie titles with optional release years before reaching React. The UI constructs only `w185` search and `w342` review URLs beneath the already-approved `https://image.tmdb.org` origin; poster URLs and contained-title data remain presentation-only and never enter the source draft or serialized Nuvio JSON. Only successful normalized responses enter a 40-entry, five-minute in-memory cache. Errors are sanitized and never cached. Each request has an `AbortController`, a 12-second timeout covering response parsing, and monotonic request-generation protection.

## Canonical source contract

The official collection name is the initial title. The user may edit it before Apply. Validation requires a trimmed non-empty title, a positive safe numeric ID, and exactly this draft:

```json
{
  "category": "native-tmdb",
  "editable": {
    "title": "<official or edited title>",
    "sortBy": "original",
    "tmdbId": 123,
    "filters": {},
    "provider": "tmdb",
    "mediaType": "MOVIE",
    "tmdbSourceType": "COLLECTION"
  }
}
```

The validator rejects missing, changed, or additional fields. `rawImported`, a Nuvio-facing source `id`, addon fields, Trakt fields, UI metadata, and `catalogSources` projections are not created. Builder `internalId` remains domain-only and is removed by serialization.

The Review recipe describes `sortBy: "original"` as **TMDB-provided order**. This is presentation copy only: the serialized value remains `original`, duplicate identity is unchanged, imported values are not normalized, and no sort option is exposed.

Apply validates again, confirms any selected-folder duplicate, verifies that the same folder still exists and remains selected, and checks the interaction lock before calling `controller.createSource()` exactly once. A synchronous submission gate activates before the async boundary so rapid taps cannot enter twice. The source appends to the folder. A successful selection-only `selectNode(createdInternalId)` follows without another content revision.

## Duplicate policy

Duplicate identity is:

```text
tmdb | COLLECTION | numeric tmdbId | MOVIE
```

Title is deliberately excluded. The selected folder is checked, including compatible imported numeric-string IDs and case variants. The first Apply displays the existing source's safe title without mutation. **Add anyway** performs the same current-state checks and permits the duplicate only when the approval carries the exact duplicate identity currently being reviewed. A stale or generic boolean override cannot bypass a changed duplicate. Existing imported duplicates are never rewritten or removed.

## UI and interaction

Add Source appears only with a selected folder:

- `Add source` in the Sources header;
- `Add source` in an empty Sources panel;
- `+ Add source` after a populated source list.

Every entry calls one session and renders one body-portalled semantic dialog with explicit stages:

1. **Search** contains the query, status, result list, posters or stable placeholders, bounded overview, and pagination only when more than one page exists. Activating a result keeps Search visible, marks and disables only that result while details load, and transitions only after successful normalized details. A failure preserves query, results, page, and the identity-bound selection-time scroll position while placing a persistent focused/scrolled alert before the results with a retry when appropriate. A same-result retry retains that original position for Review → Back restoration, while a different result, query, page, or dialog session discards it. It has no empty fixed action bar.
2. **Review** contains Back and Close, the official title, a canonical external link from the validated positive numeric TMDB collection ID to `https://www.themoviedb.org/collection/<id>`, movie count, an editable **Source name**, the fixed recipe, a poster or placeholder, and the explicit poster-only **Preview titles** action. The Source name uses the canonical collection name until customized, retains the serialized `title` field, and reports an empty value as **Enter a name for this source before saving.** The link opens in a new tab with `noopener noreferrer`, a visible external indicator, meaningful accessible naming, and wrapping that preserves long titles at mobile widths. Unsupported or invalid entity data renders no link. Review has exactly one footer action: Add source, Add anyway after a duplicate warning, or a disabled adding state. The earlier expandable contained-title text list is absent; the non-interactive count remains, and title inspection uses the shared nested poster Preview.

Review Back returns to Search without another request and restores the query, results, page, selected result, scroll position, and practical result focus. Issue #92 adds a separate Search-level Back action that returns to the Add Source type picker without closing the modal or changing the selected folder/project; practical focus returns to Movie franchise. People and Studios follow the same picker-return contract while keeping their own Configure-to-Search state. Browser history is not used. Below 900px an isolated portal root paints an opaque layout-viewport guard behind a second opaque task surface sized to the current Visual Viewport. The guard is present on the initial render, and a pre-paint layout effect establishes the body lock, current geometry, listeners, and focus before the surface is visibly usable. This keeps the Builder and its gradients/decorative layers behind a deterministic higher stacking context while keyboard and browser-chrome geometry is moving. At 900px and above the existing intentional desktop backdrop contains a centered bounded dialog. Search and Review share one internal scroll owner. Safe-area padding and viewport geometry account for all four insets plus `visualViewport.offsetTop`, `offsetLeft`, `width`, and `height`, and update on Visual Viewport resize/scroll as a virtual keyboard opens, closes, or pans.

Issue #92 retains the established `type="search"` field for Movie franchise and the extracted Collection replacement picker. The browser's subtle in-field clear updates the controlled React value through the existing change handler, which resets paging and selection-time lookup state. No separate adjacent clear button or new cross-browser clear abstraction is introduced; People and Studios retain the same ordinary search-input boundary.

The mobile review poster uses a responsive maximum width in the 180–220px range, can shrink further in short keyboard-height viewports, and moves beside the editable content when a short landscape viewport has enough width. It preserves its aspect ratio with `object-fit: contain` and remains UI-only. It is never cropped or persisted.

The document-body scroll lock snapshots and restores the exact prior style attribute, class attribute, and scroll position, including uncommon pre-existing inline values. The dialog participates in the existing inert modal lock, closes open hierarchy menus, exits keyboard reorder mode, and refuses to open during pointer drag or its settle period. It contains focus, supports Escape and explicit Close, avoids automatic page scrolling, restores the exact invoking control after cancellation, and focuses the newly created source's primary control after successful insertion. A dedicated polite live region announces success. On mobile, the Sources header shows its count inline as `Sources · N` to leave space for Add source; desktop keeps the separate count badge.

## Deterministic evidence

- `tests/builder-add-source-foundation.test.mjs` has 41 behavioral tests covering strict parsing, robust build configuration, bounded adapter normalization, TMDB-backed result classification, mature-wording/details admission, provider-ordered partial typeahead, contained titles, poster safety, timeout/abort/cache/stale behavior, exact draft validation, identity-bound duplicate handling, synchronous submission gating, controller insertion, canonical serialization, addon projections, cycles, reorder, Delete, Worker route presence, and the strict Collection/People-only TMDB entity-link allowlist.
- `tests/builder-add-source-ui.test.mjs` has 23 focused UI and contract tests covering staged Search/Review rendering, Source name copy and automatic/custom helper states, validated canonical Collection links and invalid-link omission, long-title/mobile link wrapping, one details-loading live announcement, selected-result loading/deduplication/retry, identity-bound selection-time scroll restoration, nearby persistent selection errors, query/error reset, omitted one-page pagination, poster fallbacks, one review action, duplicate/loading states, Back-state restoration and result visibility, exact body-lock restoration, initial/fallback/changed Visual Viewport geometry and listener cleanup, opaque top-level stacking, responsive uncropped poster sizing, safe-area styling, entry visibility, mobile count placement, and excluded UI boundaries.
- `scripts/check-builder-add-source-fixture.mjs` regenerates or verifies the sanitized review profile at [`manual-tests/nuvio-clients/issue-65-builder-add-source/`](../../manual-tests/nuvio-clients/issue-65-builder-add-source/).

Dave's final physical-iPhone review confirmed the opaque task surface, initial opening, Search/Review transitions, keyboard and Safari address-bar changes, portrait/landscape safe areas, poster layout, contained-title expansion, fixed action, source creation, duplicate handling, and usable mobile interaction. No device model, OS version, or browser build was supplied or inferred.

On 29 July 2026, Dave imported the production-generated fixture into current Nuvio Desktop. The native `COLLECTION` source resolved the Harry Potter franchise and expected movie titles. The exact immediate export is retained beside the input fixture. Nuvio expanded compact absent/empty fields into null/default fields while preserving provider `tmdb`, source type `COLLECTION`, ID `1241`, media `MOVIE`, sort `original`, the source title, and an empty `catalogSources` array.

Owner-observed current Nuvio Desktop sorting for this `COLLECTION` source is bounded: `original` preserves TMDB collection API order, `primary_release_date.desc` works newest-first, and unsupported `primary_release_date.asc` falls back to TMDB-provided order. Issue #65 keeps `original`; it does not add sort controls or an ascending workaround. No second current Nuvio client result is claimed.

## Deliberate exclusions

Issue #65 itself did not implement TMDB lists, companies, networks, people, directors, Discover, genres, decades, direct movies, direct TV shows or seasons, addons, opaque/manual sources, bulk creation, post-creation source editing, source sort controls, source artwork, automatic folder artwork, artwork-runtime integration, Trakt, persistence, export UI, v1 changes, Worker changes, dependencies, workflows, or Pages contract changes. Issue #74 later added People creation, and issue #78 later reused this collection picker boundary for preservation-safe Movie Collection editing without changing the issue #65 creation recipe.

Issue #14 remains the public-list lookup boundary. Issue #24 remains the direct TV show and season boundary.

## Retained future considerations

- Issue #78 implements title correction and preservation-safe TMDB collection-identity replacement for one existing physical Movie Collection source. The picker reuses the search/details/request contract described here but is mounted only after an explicit `Choose another franchise` action; opening or cancelling Edit source stays offline. Additional native editors and logical multi-source editing remain future work.
- A future Quick Add/multi-add flow may keep Search open, mark Added/duplicate results, and add several independent results; atomic behavior belongs only to a future operation that commits multiple sources together.
- Bulk collection lookup may accept bounded one-name-per-line input with controlled concurrency plus ambiguous, unmatched, and duplicate review before multi-source insertion.
- Search may later offer transparent spelling or singular/plural suggestions, but must not blindly add or remove `s`.
- Evidence-based sort controls may later expose proven behavior. Newest-first is currently observed for `primary_release_date.desc`; oldest-first must remain unavailable while `primary_release_date.asc` falls back to TMDB order.

## Completion gate

The issue #65 owner UI and required current Nuvio Desktop evidence gates are complete, and PR #66 is merged. A second current Nuvio client remains desirable but non-blocking unless it later exposes conflicting behavior.
