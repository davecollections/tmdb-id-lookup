# Builder Nuvio Serializer

Status: implemented for issue [#36](https://github.com/davecollections/tmdb-id-lookup/issues/36)

Last reviewed: 2026-07-11

## Purpose and boundary

The serializer converts the framework-independent builder project into Nuvio collection data. It supports compact output for new builder nodes and preservation-first output for imported nodes. It does not provide browser download handling, file APIs, React UI, migration, storage, networking, or user-visible diagnostic presentation.

The production implementation lives under `builder/src/serialize/`. Import and serialization share recognised field lists and the confirmed native TMDB type list from `builder/src/nuvio/known-fields.js`; that module is a small Nuvio contract, not a complete schema. The separate explicit addon projection migration is documented in [BUILDER_MIGRATION.md](./BUILDER_MIGRATION.md).

## Public API

`builder/src/serialize/index.js` exports:

- `serializeNuvioProject(project, options)` for detached object output;
- `stringifyNuvioProject(project, options)` for the same value plus JSON text.

Object serialization accepts no option properties. Its result is:

```js
{
  ok: boolean,
  value: JsonValue | null,
  errors: Diagnostic[],
  warnings: Diagnostic[]
}
```

Stringification accepts `{ space?: number }`. Indentation defaults to `2` and must be an integer from `0` through `10`. Its result adds:

```js
{
  json: string | null
}
```

Every diagnostic has exactly:

```js
{
  code: string,
  path: string,
  message: string
}
```

Paths describe intended Nuvio output locations, for example `$[0].folders[1].sources[2]`. Normal validation failures are returned rather than thrown.

## Atomic behavior

The serializer validates the complete builder tree, internal identity, JSON compatibility, required export values, source categories, filters, and compatibility projections before returning output. If any error exists, `ok` is false, `value` is null, and stringification also returns `json: null`. Internally constructed partial values are never exposed.

Warnings can accompany successful output. They describe preservation or deliberate removal decisions that do not make output unsafe.

## Compact new-node output

New nodes without `rawImported` produce only supported recognised fields that are present in editable state, plus required structure:

- collections: `id`, `title`, and `folders`;
- folders: `id`, `title`, `sources`, and `catalogSources`;
- sources: their present recognised fields and category-required identity.

The serializer does not invent explicit-null envelopes, blank presentation fields, display defaults, backdrop or glow defaults, language settings, or v1 exporter defaults. Unknown editable properties are not exported automatically.

## Imported overlay and structural replacement

For an imported collection, folder, or source, serialization begins with a safe deep clone of its plain-object `rawImported` snapshot. Recognised own properties present in `editable` then replace the corresponding raw values. Missing editable keys preserve their raw values. Explicit `false`, zero, `null`, empty string, and empty object values are replacements rather than absence.

Unknown and community collection, folder, source, and nested values survive unrelated edits. Safe own-property definition is used so unusual imported keys do not change object prototypes. The input project, editable objects, and raw snapshots are never mutated.

Current domain children are authoritative:

- project `collections` determines root order;
- collection `folders` always replaces raw `folders`;
- folder `sources` always replaces raw `sources`;
- derived folder `catalogSources` always replaces raw `catalogSources`.

Inserted nodes therefore appear, removed nodes disappear, and moved nodes use current domain order. Builder wrappers such as `nodeType`, `internalId`, `category`, `editable`, and `rawImported` are not copied from domain nodes. Same-named properties nested inside genuine imported community data are not stripped.

This version has no general deletion marker. An imported known top-level value is cleared only by assigning an explicit supported replacement such as `null` or an empty string where valid. Explicit property-removal semantics remain deferred.

## Source categories

### Native TMDB

`native-tmdb` requires:

- provider `tmdb`, case-insensitively;
- one of `LIST`, `COLLECTION`, `COMPANY`, `NETWORK`, `DISCOVER`, `PERSON`, or `DIRECTOR`, case-insensitively;
- media type `MOVIE` or `TV`, case-insensitively;
- a finite numeric or non-empty string `tmdbId` for every non-`DISCOVER` type.

`DISCOVER` may omit `tmdbId` or use `null`. Imported casing is validated without being rewritten. Native sources remain only in authoritative `sources` and never generate compatibility projections.

### Addon

`addon` requires provider `addon`, case-insensitively, plus non-empty string `addonId`, `type`, and `catalogId`. `genre` is optional. Each valid addon remains in `sources` and generates one `catalogSources` compatibility projection.

### Opaque

`opaque` requires a plain-object raw snapshot. Its complete imported object is preserved, recognised editable values are overlaid, and `OPAQUE_SOURCE_PRESERVED` is emitted. Opaque sources are not interpreted as native or addon sources and never generate compatibility projections. A new opaque source without raw evidence fails with `OPAQUE_SOURCE_REQUIRES_RAW`.

## Filter overlay

If editable does not own `filters`, the raw value remains unchanged. If editable owns a plain-object `filters` value, the serializer:

1. clones plain-object raw filters when available;
2. removes all currently recognised Discover keys;
3. adds back only recognised own keys from editable filters;
4. retains every unknown raw filter key.

An explicit empty editable filter object clears recognised imported keys while preserving unknown ones. New sources export only recognised keys; an explicit filters object can therefore serialize as `{}`. A non-object editable filters value fails atomically.

A supported native source cannot emit an unreplaced non-object raw filters value and fails with `INVALID_NATIVE_FILTERS`. An opaque source may preserve such a value without interpretation when editable does not replace it.

## Addon compatibility projections

Projection order is current source order filtered to addon-category sources. A new projection contains `addonId`, `type`, `catalogId`, and optional `genre`; it does not contain `provider`.

Imported raw projections are queued by exact `addonId`, `type`, and `catalogId`, plus an evidence-based no-genre identity. Missing genre, `null`, empty string, and exact `"None"` share that identity only for addon projection matching. Real genre strings remain distinct, and matching never rewrites unrelated imported values. Each current addon first tries the original identity from its source raw snapshot and then its current serialized identity. At most one raw projection is consumed. Duplicate identities consume raw projections in original order.

When matched, unknown projection fields such as `id`, `addonName`, `manifestUrl`, `showInHome`, and future metadata survive while old identity fields are replaced by current source identity. If an imported addon moves to a folder with no matching raw projection, only own `id`, `addonName`, `manifestUrl`, and `showInHome` values are copied from source raw data before current identity is applied.

Unmatched old projections are omitted because current authoritative sources no longer reference them, with one `UNMATCHED_CATALOG_SOURCE_REMOVED` warning per raw entry. A non-array raw `catalogSources` value or non-object raw entry blocks serialization.

Populated legacy `catalogSources` whose original `sources` was missing or empty must be fully resolved by current addon sources. Any unmatched legacy projection blocks serialization with `LEGACY_CATALOG_SOURCES_ONLY_UNRESOLVED`; it is neither dropped silently nor promoted into the domain. Callers may explicitly apply the evidence-based migration first. The serializer never invokes it and this does not define Ultra MAX migration behavior.

## Stable diagnostics

Project and domain errors:

- `INVALID_PROJECT_NODE`
- `INVALID_COLLECTION_NODE`
- `INVALID_FOLDER_NODE`
- `INVALID_SOURCE_NODE`
- `INVALID_INTERNAL_ID`
- `INVALID_EDITABLE`
- `INVALID_RAW_IMPORTED`
- `INVALID_SOURCE_CATEGORY`
- `CHILD_ARRAY_NOT_ARRAY`
- `SPARSE_CHILD_ARRAY`
- `DUPLICATE_INTERNAL_ID`
- `INVALID_JSON_VALUE`

Collection and folder errors:

- `COLLECTION_ID_REQUIRED`
- `COLLECTION_TITLE_REQUIRED`
- `FOLDER_ID_REQUIRED`
- `FOLDER_TITLE_REQUIRED`

Source and filter errors:

- `INVALID_EDITABLE_FILTERS`
- `INVALID_NATIVE_PROVIDER`
- `UNSUPPORTED_NATIVE_TMDB_SOURCE_TYPE`
- `INVALID_NATIVE_MEDIA_TYPE`
- `NATIVE_TMDB_ID_REQUIRED`
- `INVALID_NATIVE_FILTERS`
- `INVALID_ADDON_PROVIDER`
- `INCOMPLETE_ADDON_SOURCE`
- `OPAQUE_SOURCE_REQUIRES_RAW`

Projection errors:

- `RAW_CATALOG_SOURCES_NOT_ARRAY`
- `RAW_CATALOG_SOURCE_NOT_OBJECT`
- `LEGACY_CATALOG_SOURCES_ONLY_UNRESOLVED`

Options and defensive output errors:

- `INVALID_SERIALIZER_OPTIONS`
- `INVALID_INDENTATION`
- `INVALID_SERIALIZED_OUTPUT`
- `JSON_STRINGIFY_FAILED`

Warnings:

- `OPAQUE_SOURCE_PRESERVED`
- `UNMATCHED_CATALOG_SOURCE_REMOVED`

## Immutability and determinism

Repository tests prove that serialization leaves the complete input unchanged, preserves current ordering, emits dense arrays, supports `structuredClone` and JSON encoding, and produces deeply equal values and identical text for unchanged input and options. Raw cloning does not use `JSON.parse(JSON.stringify(...))`.

## Deliberately deferred

This issue does not implement UI, browser file or download handling, project storage, legacy migration, Ultra MAX conversion, explicit property deletion, metadata or artwork language support, translated artwork, direct Nuvio connections, authentication, TMDB/addon requests, routing, Trakt, changes to v1 exporters, or production Worker changes. No visible builder UI calls the serializer yet.
