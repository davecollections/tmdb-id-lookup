# Shared artwork runtime lookup

Status: shared foundation implemented; v1 company/network integration implemented

Last reviewed: 2026-07-21

## Evidence and scope

This contract is based on the final `davecollections/nuvio-assets` publication handover and the current published files:

- [runtime lookup](https://github.com/davecollections/nuvio-assets/blob/main/assets/collection_covers/runtime-lookup.json)
- [runtime lookup schema](https://github.com/davecollections/nuvio-assets/blob/main/schemas/artwork-runtime-lookup.schema.json)

The shared consumer implementation is [`js/artwork-runtime.mjs`](../../js/artwork-runtime.mjs). It deliberately validates only the application-facing safety and resolution contract rather than duplicating the complete publication schema. Publication generation, counts, fingerprints, source-manifest metadata, and review workflows remain owned by `nuvio-assets`.

Issue [#45](https://github.com/davecollections/tmdb-id-lookup/issues/45) added the shared read-only foundation. Issue [#46](https://github.com/davecollections/tmdb-id-lookup/issues/46) adds the first consumer: v1 company and network exports resolve published landscape artwork through a thin module adapter. V1 people exports and the v2 builder still do not consume the runtime.

## Published location

- Default base URL: `https://raw.githubusercontent.com/davecollections/nuvio-assets/main/`
- Runtime lookup path: `assets/collection_covers/runtime-lookup.json`
- Publication schema path: `schemas/artwork-runtime-lookup.schema.json`
- Required runtime state: `schemaVersion: 1` and `status: "published"`

The base URL and lookup path are configurable when creating a client so tests, mirrors, a future CDN, or a future proxy can use the same resolver rules. The application does not embed the current runtime fingerprint, file SHA, entity counts, or representative IDs as runtime rules.

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

| Entity | Landscape | Poster |
| --- | --- | --- |
| Company | 1200×675 WebP | unsupported |
| Network | 1200×675 WebP | unsupported |
| Person | 1200×675 WebP | 1000×1500 WebP |

The resolver uses only the requested orientation. It does not crop, stretch, or substitute another orientation. Company and network poster requests return `unsupported-orientation` even when landscape artwork exists.

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
- contain every orientation required for their type;
- contain safe repository-relative paths and valid lowercase SHA-256 values;
- use one or two unique `actor` and/or `director` categories for people.

`fallbackUsed: true` is not a failure or a request for client-side substitution. It means the publication pipeline used its reviewed fallback process and still approved the record for automatic public use. The ready result propagates the flag for future display or diagnostics.

Malformed lookup data throws `ArtworkRuntimeError` with a stable `code`. Loader, HTTP, JSON, contract, and unsafe-review failures therefore remain distinguishable from the legitimate `missing` and `unsupported-orientation` states.

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
{ status: "unsupported-orientation", entityType: "network", tmdbId: 123, orientation: "poster" }
```

`categories` is included for ready person results. Missing and unsupported results intentionally contain no path or URL.

## Loader and cache lifecycle

`createArtworkRuntimeClient` accepts `baseUrl`, `runtimeLookupPath`, and an injectable `fetchImpl`. Its `load()` method:

- checks that fetch returned a response object and that the HTTP response is successful;
- parses JSON and validates the minimum complete consumer contract;
- deduplicates simultaneous loads within that client;
- caches only a successful validated lookup in memory for that client’s lifetime;
- clears a failed in-flight load so a later call can retry.

Its async `resolve()` method loads once and applies the same typed resolver. Tests inject deterministic fetch implementations and synthetic fixtures; repository tests never request the live runtime.

There is no localStorage, IndexedDB, Cache API, or service-worker persistence. Persistent caching, refresh intervals, explicit refresh controls, and multi-tab behaviour remain separate product decisions for a later integration issue.

## V1 company and network integration

The classic v1 page loads [`js/artwork-runtime-v1.mjs`](../../js/artwork-runtime-v1.mjs) as a module. The adapter creates one shared client per page and exposes only batch landscape resolution for explicit `company` or `network` requests. Loading the adapter does not call `load()` or fetch the runtime; the request begins only when a company or network export modal prepares an export with **Use curated artwork** enabled.

The classic export code treats `ready` as published folder artwork, including `fallbackUsed: true`, and treats `missing` as a valid visible-title plus 🎬/📺 fallback with an empty cover URL. It does not construct paths, scan maps, use hard-coded cover mappings, or substitute TMDB logo thumbnails. Lookup-table logo thumbnails remain a separate display-only TMDB path.

Prepared company and network payloads are async and keyed by selection plus relevant settings. Simultaneous actions share one pending preparation, unchanged Copy/Download actions reuse the same JSON and generated IDs, and changes invalidate the prepared payload. A runtime load or validation error leaves Copy and Download disabled, remains retryable, and can be bypassed only by turning curated artwork off. Failures are not replaced with legacy or guessed artwork.

The borrowed v1 network focus-animation option and URL mappings were removed. Company and network folder JSON still emits `focusGifUrl: ""` and `focusGifEnabled: false`; `focusGlowEnabled` remains unchanged. Optional user-supplied or first-party subtle focus animation remains only a possible future v2 feature.

## Browser and integration boundaries

The runtime is a public read-only asset. Loading it requires no login, API key, bearer token, personal data, GitHub write permission, or publication credential. The browser consumer performs public reads only. Any future on-demand artwork request and approval workflow remains deferred and must not place GitHub write credentials in v1 or builder code.

The `.mjs` location under `js/` is intentional:

- Node built-in tests can import it without a root package;
- the existing Pages allowlist already publishes the `js/` tree;
- v1 uses a thin `type="module"` adapter without duplicating resolution rules;
- a later builder issue can import the pure module through Vite.

Issue #46 changes only v1 company/network export artwork preparation and related UI/documentation. People exports, builder output and UI, Worker routes, ordinary lookup thumbnails, and other export families remain unchanged.
