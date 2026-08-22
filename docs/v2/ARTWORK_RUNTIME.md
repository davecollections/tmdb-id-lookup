# Shared artwork runtime lookup

Status: shared `nuvio-assets` runtime is active for V1 Company/Network and V2 Studio/Network hierarchy; active V2 People resolution moved to `nuvio-people-assets` in issue #118

Last reviewed: 2026-08-22

## Evidence and scope

This contract is based on the final `davecollections/nuvio-assets` schema-v1 publication handover, the current published files, the separately reviewed schema-v2 network-poster contract, and the completed [assets PR #3 publication](https://github.com/davecollections/nuvio-assets/pull/3):

- [runtime lookup](https://github.com/davecollections/nuvio-assets/blob/main/assets/collection_covers/runtime-lookup.json)
- [runtime lookup schema](https://github.com/davecollections/nuvio-assets/blob/main/schemas/artwork-runtime-lookup.schema.json)

The shared consumer implementation is [`js/artwork-runtime.mjs`](../../js/artwork-runtime.mjs). It deliberately validates only the application-facing safety and resolution contract rather than duplicating the complete publication schema. Publication generation, counts, fingerprints, source-manifest metadata, and review workflows remain owned by `nuvio-assets`.

Issue [#45](https://github.com/davecollections/tmdb-id-lookup/issues/45) added the shared read-only foundation. Issue [#46](https://github.com/davecollections/tmdb-id-lookup/issues/46) added the first consumer: v1 company and network exports resolve published landscape artwork through a thin module adapter. Issue [#55](https://github.com/davecollections/tmdb-id-lookup/issues/55) added strict consumer compatibility for schema versions 1 and 2 but did not itself publish runtime v2. Assets PR #3 later completed that publication. V1 Company/Network continue to consume this runtime; V2 Studio hierarchy issue #124 consumes Company Landscape and V2 Network hierarchy issue #126 consumes Network Poster/Landscape. Issue #74 temporarily used its People map in V2; issue [#118](https://github.com/davecollections/tmdb-id-lookup/issues/118) / PR [#119](https://github.com/davecollections/tmdb-id-lookup/pull/119) removed that active V2 dependency in favor of the separate canonical People manifest described below. V1 People migration remains outside #118.

## Active V2 People replacement

Active V2 People creation now loads [`nuvio-people-assets/manifests/people.json`](https://raw.githubusercontent.com/davecollections/nuvio-people-assets/main/manifests/people.json) once per workspace and indexes records by numeric TMDB Person ID. The manifest supplies registered canonical name, actor/director membership, stable asset URLs, and per-asset SHA-256 values. Poster or compatibility Landscape maps to `coverImageUrl`; Hero and Title Logo remain separate; optional focus Poster/Landscape are accepted only as a complete pair. People Review exposes only a shared Poster/Landscape choice. Orientation changes recompute every generated folder's canonical manifest/fallback values; there are no per-person artwork URL, focus, or reset controls in hierarchy creation. The extracted known-field group remains available in the ordinary manual Folder editor for later individual customisation with preservation-first minimal patches. Missing IDs use the existing TMDB profile/emoji fallback and never construct the legacy paths listed later in this document. The historical `focusGifUrl` name is treated as a generic optional string by import/overlay/serialization, so the manifest's static WebP focus counterpart round-trips; no current-client rendering claim is made.

The `nuvio-assets` People paths and tests below remain valid historical/publication and V1 compatibility documentation. They are not an active V2 Builder fallback. Company and Network behavior in this runtime is unchanged. The Builder migration is merged, but no legacy asset may be deleted until generated JSON is accepted in Nuvio, remaining consumers are migrated or retired, and Dave separately approves deletion.

## Assigned Folder artwork in the Builder workspace

Issue [#134](https://github.com/davecollections/tmdb-id-lookup/issues/134) is a presentation-only consumer of the Folder's existing persisted `coverImageUrl`. A nonblank string is displayed exactly as assigned on its Folder card, regardless of whether it came from a curated runtime, TMDB, import, or a custom URL. Poster and Landscape values receive compact orientation-aware thumbnails; an unsupported or legacy `tileShape` receives a neutral contained treatment without rewriting the stored shape.

Blank, absent, null, and non-string values retain the original text-only Folder card. An image load failure also falls back to that text-only presentation for the current render while preserving the exact URL, raw import evidence, revision, and serialized output. Failure state is scoped to the exact attempted URL and resets when the assignment changes, so a failed old URL cannot suppress its replacement. Workspace display performs no artwork-runtime lookup, manifest lookup, TMDB request, URL replacement, migration, or cache refresh. Images are decorative, natively lazy-loaded, asynchronously decoded, requested without sending the Builder page as a referrer, and excluded from drag behavior; this host-agnostic request policy permits arbitrary valid artwork origins without an allowlist, while the existing card remains the sole selection and reorder interaction.

This does not add artwork discovery to import or Folder Settings. A later separately approved Folder Settings issue may preview the currently assigned URLs and offer an explicit suggestion only when authoritative exact identity evidence exists. It must keep imported/custom values visible and unchanged until the user deliberately accepts a replacement; no preview or suggestion UI is part of issue #134.

## Published location

- Default base URL: `https://raw.githubusercontent.com/davecollections/nuvio-assets/main/`
- Runtime lookup path: `assets/collection_covers/runtime-lookup.json`
- Publication schema path: `schemas/artwork-runtime-lookup.schema.json`
- Current live runtime state: `schemaVersion: 2` and `status: "published"`

### Live runtime-v2 publication baseline

| Evidence | Published value |
| --- | --- |
| Assets pull request | [#3 — Publish Network Poster artwork and runtime v2](https://github.com/davecollections/nuvio-assets/pull/3) |
| Publication commit | [`815c0d5ada61c88a8f681cd12edaa8932ea320e4`](https://github.com/davecollections/nuvio-assets/commit/815c0d5ada61c88a8f681cd12edaa8932ea320e4) |
| Merge commit | [`d34560a06469ce13af6fe1a3a5b299ffb3748560`](https://github.com/davecollections/nuvio-assets/commit/d34560a06469ce13af6fe1a3a5b299ffb3748560) |
| Release | `studio-network-posters-v2-2026-07-26` at `2026-07-26T03:19:39.353Z` |
| Entities | 1,820 companies; 572 networks; 817 people; 3,209 total |
| Assets | 3,209 Landscape; 1,389 Poster; 4,598 total |
| Runtime | SHA-256 `3b04e76eec24922c59404712a46245ff9fd8da1c7c1f508c19f6f69d4884f4af`; fingerprint `900b25771f70365218754af18588ed1212e7669903027795d613eb427c143c58` |
| Studio/network manifest | SHA-256 `9c214428194d24653892177919f60d3e070b6f5d9491aac4bd70045bae5c7079`; fingerprint `b1460d79e4ecc73a836676c85a1294bd424af4d58c69014e352073b830d4098c` |

These values are recorded publication evidence, not hardcoded resolver rules. The application continues to validate the consumer contract rather than embedding the current release ID, hashes, fingerprints, counts, or representative IDs.

The shared resolver accepts exactly numeric `schemaVersion` values `1` and `2`; missing, malformed, coerced, decimal, and unsupported values fail with `INVALID_SCHEMA_VERSION`. The base URL and lookup path are configurable when creating a client so tests, mirrors, a future CDN, or a future proxy can use the same resolver rules.

## Typed identity contract

An exact positive TMDB numeric ID is authoritative only inside its explicit entity type:

| Consumer type | Runtime map |
| --- | --- |
| `company` | `companies` |
| `network` | `networks` |
| `person` | `people` |

Company, network, and person ID spaces remain separate. A resolver never searches the other maps when a typed key is absent, even if the same number exists elsewhere. Names are canonical display metadata from the runtime, not identity. Actor/director overlap is one person record whose `categories` contains both values.

An absent key means there is no currently published automatic-use artwork for that exact entity type and ID. It produces a `missing` result without guessing a path, falling through to another type, or substituting a TMDB image.

## Orientation and URL contract

| Entity | Orientation | Schema v1 | Schema v2 |
| --- | --- | --- | --- |
| Company | Landscape | supported | supported |
| Company | Poster | unsupported | unsupported |
| Network | Landscape | supported | supported |
| Network | Poster | unsupported | supported and required |
| Person | Landscape | supported | supported |
| Person | Poster | supported | supported |

The resolver uses only the requested orientation. It does not crop, stretch, or substitute another orientation. Company poster requests return `unsupported-orientation` under both versions, and network poster requests do so under v1. A valid v2 network poster request resolves through the existing `ready` result shape.

Network Poster is publicly live under runtime v2. The classic v1 bridge remains Company/Network Landscape-only; V2 Network hierarchy issue #126 implements the batch-safe Poster/Landscape choice, while per-item/raw Network artwork controls remain deferred.

Valid legacy-runtime consumer paths are exact:

```text
assets/collection_covers/companies/{id}.webp
assets/collection_covers/networks/{id}.webp
assets/collection_covers/networks/poster/{id}.webp
assets/collection_covers/people/landscape/{id}.webp
assets/collection_covers/people/poster/{id}.webp
```

Every orientation supplies a repository-relative `path` and lowercase 64-character SHA-256. The full asset URL is the path resolved beneath the configured base URL with this cache version appended:

```text
<resolved asset URL>?v=<first 12 characters of orientation SHA-256>
```

Published numeric paths are stable identity paths, but their bytes may be replaced. Consumers must retain the SHA prefix so replacement bytes do not remain hidden behind a stale URL cache.

## Published-only automatic-use policy

Automatic resolution accepts only a globally published lookup and entries that:

- have an ID matching their positive numeric object key;
- have `status: "published"`;
- have `reviewRequired: false`;
- have a non-empty canonical name and a boolean `fallbackUsed` value;
- contain every orientation required for their schema version and type;
- contain no forbidden company Poster data or schema-v1 Network Poster data;
- contain the exact entity/ID/orientation path and a valid lowercase SHA-256 for every required orientation;
- use one or two unique `actor` and/or `director` categories for people.

`fallbackUsed: true` is not a failure or a request for client-side substitution. It means the publication pipeline used its reviewed fallback process and still approved the record for automatic public use. The ready result propagates the flag for future display or diagnostics.

Malformed lookup data throws `ArtworkRuntimeError` with a stable `code`. Missing required orientation data fails with `INVALID_ORIENTATION_DATA`; forbidden orientation data fails with `UNSUPPORTED_ORIENTATION_DATA`; exact path mismatches fail with `INVALID_PATH`. Loader, HTTP, JSON, contract, and unsafe-review failures therefore remain distinguishable from the legitimate `missing` and `unsupported-orientation` states.

## Public API

The module exports:

- `DEFAULT_ARTWORK_BASE_URL` and `DEFAULT_ARTWORK_RUNTIME_PATH`;
- frozen entity, orientation, and result-status constants;
- `ArtworkRuntimeError`;
- `validateArtworkRuntimeLookup(lookup)` for the minimum consumer contract;
- `resolveArtworkRuntime(options)` for pure synchronous resolution of supplied lookup data;
- `createArtworkRuntimeClient(options)` for configured loading plus resolution.

The pure resolver accepts `lookup`, `entityType`, numeric `tmdbId`, `orientation`, and an optional `baseUrl`. Expected results have these shapes:

```js
{
  status: "ready",
  entityType: "person",
  tmdbId: 123,
  orientation: "poster",
  name: "Canonical runtime name",
  relativePath: "assets/collection_covers/people/poster/123.webp",
  assetUrl: "https://.../123.webp?v=123456789abc",
  sha256: "...64 lowercase hexadecimal characters...",
  fallbackUsed: false,
  categories: ["actor", "director"]
}
```

```js
{ status: "missing", entityType: "company", tmdbId: 123, orientation: "landscape" }
{ status: "unsupported-orientation", entityType: "company", tmdbId: 123, orientation: "poster" }
```

`categories` is included for ready person results. Missing and unsupported results intentionally contain no path or URL.

## Loader and cache lifecycle

`createArtworkRuntimeClient` accepts `baseUrl`, `runtimeLookupPath`, and an injectable `fetchImpl`. Its `load()` method:

- checks that fetch returned a response object and that the HTTP response is successful;
- parses JSON and validates the minimum complete consumer contract;
- deduplicates simultaneous loads within that client;
- caches only a successful validated lookup in memory for that client’s lifetime;
- clears a failed in-flight load so a later call can retry.

Its async `resolve()` method loads once and applies the same typed resolver. Narrow resolver/cache unit tests inject deterministic fetch implementations and explicit synthetic v1/test-only v2 fixtures. Mounted, integration, owner-review, and live-behaviour checks that exercise the runtime follow [`docs/TESTING.md`](../TESTING.md) and use the approved production path; the canonical Network mounted suite requests the live runtime and real image resources.

There is no localStorage, IndexedDB, Cache API, or service-worker persistence. Persistent caching, refresh intervals, explicit refresh controls, and multi-tab behaviour remain separate product decisions for a later integration issue.

## V1 company and network integration

The classic v1 page loads [`js/artwork-runtime-v1.mjs`](../../js/artwork-runtime-v1.mjs) as a module. The adapter creates one shared client per page and exposes only batch landscape resolution for explicit `company` or `network` requests. It retains that interface when the shared lookup is schema v1 or schema v2 and never exposes Network Poster. Loading the adapter does not call `load()` or fetch the runtime; the request begins only when a company or network export modal prepares an export.

The classic export code automatically chooses published curated artwork, then the selected cached entity's TMDB `logo_path`, then a visible title plus 🎬/📺. A `ready` result wins, including `fallbackUsed: true`, and uses the exact SHA-versioned runtime URL with its title hidden. A missing or unexpected non-ready result uses the established `w500` TMDB logo helper without another API request; because a logo is not necessarily a landscape cover, the title remains visible. When neither image exists, the cover URL stays empty and the title/emoji fallback is used. The shared runtime itself still does not construct or know about TMDB fallback URLs.

Prepared company and network payloads are async and keyed by selection plus collection name/backdrop settings. Simultaneous actions share one pending preparation, unchanged Copy/Download actions reuse the same JSON and generated IDs, and changes invalidate the prepared payload. The buttons show a transient preparing state without a permanent technical status panel. A runtime load or validation failure logs one warning and prepares the same valid TMDB-or-emoji fallback output; it is not cached by the shared client and does not restore legacy, borrowed, guessed, or hard-coded artwork.

The borrowed v1 network focus-animation option and URL mappings were removed. Company and network folder JSON still emits `focusGifUrl: ""` and `focusGifEnabled: false`; `focusGlowEnabled` remains unchanged. Optional user-supplied or first-party subtle focus animation remains only a possible future v2 feature.

## Browser and integration boundaries

The runtime is a public read-only asset. Loading it requires no login, API key, bearer token, personal data, GitHub write permission, or publication credential. The browser consumer performs public reads only. Any future on-demand artwork request and approval workflow remains deferred and must not place GitHub write credentials in v1 or builder code.

The `.mjs` location under `js/` is intentional:

- Node built-in tests can import it without a root package;
- the existing Pages allowlist already publishes the `js/` tree;
- v1 uses a thin `type="module"` adapter without duplicating resolution rules;
- a later builder issue can import the pure module through Vite.

At its historical checkpoint, issue #55 changed only the shared resolver, focused compatibility tests, and contract documentation; it did not publish runtime v2 or add Builder consumption. Assets PR #3 subsequently completed the separately reviewed, pushed, merged, and atomic assets-side publication without a TMDB production-code change. The external v1 adapter interface and cached exporter remain Landscape-only. Later People issue #118 moved active V2 People to its dedicated manifest, Studio issue #124 added V2 Company Landscape consumption, and Network issue #126 added V2 Network Poster/Landscape consumption; Worker routes, ordinary lookup thumbnails, and other export families remain separately governed.
