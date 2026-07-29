# Builder Add Source: TMDB Movie Franchises

Status: owner desktop, final physical-iPhone, and current Nuvio Desktop acceptance complete on issue [#65](https://github.com/davecollections/tmdb-id-lookup/issues/65)'s dedicated branch

Last reviewed: 2026-07-29

## Scope

Issue #65 establishes the first end-to-end Builder source-creation flow and one reusable provider boundary. Only **Movie franchise · TMDB** is visible. It adds one native TMDB `COLLECTION` source to the currently selected folder; it does not create collections or folders automatically.

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
collection-content-safety.js  explicit adult/text safety rules and whole-word relevance
tmdb-image.js                 validated UI-only TMDB poster URL construction
tmdb-collection-provider.js   Worker requests, safe normalization, errors, timeout, and cache
async-request-state.js        replaceable request generations and stale-result suppression
movie-franchise-source.js     draft recipe, semantic validation, identity, duplicate check, and insertion service
index.js                      public exports
```

`builder/src/ui/AddSourceDialog.jsx` consumes only the normalized provider interface:

```text
searchCollections(query, { page, signal })
getCollection(id, { signal })
```

It does not know TMDB payload field names and does not call `fetch` directly. Vite reads exactly one anchored `TMDB_PROXY_BASE_URL` declaration from the existing stable root `js/config.js` at build/dev startup, validates it as an HTTPS origin without credentials, port, path, query, or fragment, and injects it into the adapter. This is data extraction only: it does not evaluate or import the classic v1 script, and the Builder source contains no second endpoint literal or v1 DOM globals.

The adapter uses only:

- `/3/search/collection`;
- `/3/collection/{id}`.

Every search explicitly sends `include_adult=false`, including in its cache identity. The adapter then independently rejects collection results unless `adult` is absent or exactly `false`, rejects adult or malformed detail responses and any detail response containing an adult or malformed movie part, and applies a deliberately narrow normalized whole-word guard before exposing text or poster data. The explicit blocked words are `bondage`, `porn`, `pornographic`, `pornography`, `pornstar`, `pornstars`, and `sexploitation`; blocked phrases are `adult film`, `adult films`, `hardcore porn`, and `hardcore sex`. Substring matches do not count, so a query for `bond` can match a James Bond collection but not `Bondage`. Unsafe or ambiguous collection details receive only `This collection is not available in the Builder.` and are not cached.

Safe responses are reduced to collection ID, name, bounded overview text, a validated relative poster path, pagination, movie count, and ordered contained movie titles with optional release years before reaching React. The UI constructs only `w185` search and `w342` review URLs beneath the already-approved `https://image.tmdb.org` origin; poster URLs and contained-title data remain presentation-only and never enter the source draft or serialized Nuvio JSON. Only successful normalized responses enter a 40-entry, five-minute in-memory cache. Errors are sanitized and never cached. Each request has an `AbortController`, a 12-second timeout covering response parsing, and monotonic request-generation protection.

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
- `Add first source` in an empty Sources panel;
- `+ Add another source` after a populated source list.

Every entry calls one session and renders one body-portalled semantic dialog with explicit stages:

1. **Search** contains the query, status, result list, posters or stable placeholders, bounded overview, and pagination only when more than one page exists. It has no empty fixed action bar.
2. **Review** contains Back and Close, the official title, TMDB ID, movie count, editable Nuvio title, the fixed recipe, a poster or placeholder, and a collapsed ordered contained-title list. It has exactly one footer action: Add source, Add anyway after a duplicate warning, or a disabled adding state.

Back returns to Search without another request and restores the query, results, page, selected result, scroll position, and practical result focus. Below 900px an isolated portal root paints an opaque layout-viewport guard behind a second opaque task surface sized to the current Visual Viewport. The guard is present on the initial render, and a pre-paint layout effect establishes the body lock, current geometry, listeners, and focus before the surface is visibly usable. This keeps the Builder and its gradients/decorative layers behind a deterministic higher stacking context while keyboard and browser-chrome geometry is moving. At 900px and above the existing intentional desktop backdrop contains a centered bounded dialog. Search and Review share one internal scroll owner. Safe-area padding and viewport geometry account for all four insets plus `visualViewport.offsetTop`, `offsetLeft`, `width`, and `height`, and update on Visual Viewport resize/scroll as a virtual keyboard opens, closes, or pans.

The mobile review poster uses a responsive maximum width in the 180–220px range, can shrink further in short keyboard-height viewports, and moves beside the editable content when a short landscape viewport has enough width. It preserves its aspect ratio with `object-fit: contain` and remains UI-only. It is never cropped or persisted.

The document-body scroll lock snapshots and restores the exact prior style attribute, class attribute, and scroll position, including uncommon pre-existing inline values. The dialog participates in the existing inert modal lock, closes open hierarchy menus, exits keyboard reorder mode, and refuses to open during pointer drag or its settle period. It contains focus, supports Escape and explicit Close, avoids automatic page scrolling, restores the exact invoking control after cancellation, and focuses the newly created source's primary control after successful insertion. A dedicated polite live region announces success. On mobile, the Sources header shows its count inline as `Sources · N` to leave space for Add source; desktop keeps the separate count badge.

## Deterministic evidence

- `tests/builder-add-source-foundation.test.mjs` has 34 behavioral tests covering strict parsing, robust build configuration, bounded adapter normalization, exact adult/text filtering, whole-word relevance, contained titles, poster safety, timeout/abort/cache/stale behavior, exact draft validation, identity-bound duplicate handling, synchronous submission gating, controller insertion, canonical serialization, addon projections, cycles, reorder, Delete, and Worker route presence.
- `tests/builder-add-source-ui.test.mjs` has 17 behavioral tests covering staged Search/Review rendering, omitted one-page pagination, poster fallbacks, one review action, duplicate/loading states, Back-state restoration, exact body-lock restoration, initial/fallback/changed Visual Viewport geometry and listener cleanup, opaque top-level stacking, responsive uncropped poster sizing, safe-area styling, entry visibility, mobile count placement, and excluded UI boundaries.
- `scripts/check-builder-add-source-fixture.mjs` regenerates or verifies the sanitized review profile at [`manual-tests/nuvio-clients/issue-65-builder-add-source/`](../../manual-tests/nuvio-clients/issue-65-builder-add-source/).

Dave's final physical-iPhone review confirmed the opaque task surface, initial opening, Search/Review transitions, keyboard and Safari address-bar changes, portrait/landscape safe areas, poster layout, contained-title expansion, fixed action, source creation, duplicate handling, and usable mobile interaction. No device model, OS version, or browser build was supplied or inferred.

On 29 July 2026, Dave imported the production-generated fixture into current Nuvio Desktop. The native `COLLECTION` source resolved the Harry Potter franchise and expected movie titles. The exact immediate export is retained beside the input fixture. Nuvio expanded compact absent/empty fields into null/default fields while preserving provider `tmdb`, source type `COLLECTION`, ID `1241`, media `MOVIE`, sort `original`, the source title, and an empty `catalogSources` array.

Owner-observed current Nuvio Desktop sorting for this `COLLECTION` source is bounded: `original` preserves TMDB collection API order, `primary_release_date.desc` works newest-first, and unsupported `primary_release_date.asc` falls back to TMDB-provided order. Issue #65 keeps `original`; it does not add sort controls or an ascending workaround. No second current Nuvio client result is claimed.

## Deliberate exclusions

This milestone does not implement TMDB lists, companies, networks, people, directors, Discover, genres, decades, direct movies, direct TV shows or seasons, addons, opaque/manual sources, bulk creation, post-creation source editing, source sort controls, source artwork, automatic folder artwork, artwork-runtime integration, Trakt, persistence, export UI, v1 changes, Worker changes, dependencies, workflows, or Pages contract changes.

Issue #14 remains the public-list lookup boundary. Issue #24 remains the direct TV show and season boundary.

## Retained future considerations

- Source editing may later support title correction and preservation-safe changes to imported source fields.
- A future Quick Add/multi-add flow may keep Search open, mark Added/duplicate results, and add several independent results; atomic behavior belongs only to a future operation that commits multiple sources together.
- Bulk collection lookup may accept bounded one-name-per-line input with controlled concurrency plus ambiguous, unmatched, and duplicate review before multi-source insertion.
- Search may later offer transparent spelling or singular/plural suggestions, but must not blindly add or remove `s`.
- Evidence-based sort controls may later expose proven behavior. Newest-first is currently observed for `primary_release_date.desc`; oldest-first must remain unavailable while `primary_release_date.asc` falls back to TMDB order.

## Completion gate

The issue #65 owner UI and required current Nuvio Desktop evidence gates are complete. A second current Nuvio client remains desirable but non-blocking unless it later exposes conflicting behavior. Commit and pull-request actions remain separate owner-authorized workflow gates.
