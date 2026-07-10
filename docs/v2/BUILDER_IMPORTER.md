# Builder Nuvio Importer

Status: implemented for issue [#35](https://github.com/davecollections/tmdb-id-lookup/issues/35)

Last reviewed: 2026-07-11

## Purpose and boundary

The importer converts Nuvio collection JSON into the framework-independent builder domain model. It preserves complete imported collection, folder, and source objects while exposing only the currently recognised values as editable state.

The implementation lives under `builder/src/import/`. It uses plain JavaScript, JSDoc, the existing builder domain factories, and standard JavaScript APIs. It has no React, browser, state-management, schema-library, validation-library, or networking dependency.

Import establishes safe editor state. It does not define canonical Nuvio output and does not implement migration, editable-over-raw overlay, projection generation, or serialization.

## Public API

`builder/src/import/index.js` exports:

- `parseNuvioJsonText(text, options)` for JSON text;
- `importNuvioCollections(value, options)` for an already-parsed JSON-compatible value;
- `classifyNuvioSource(source, path)` for direct testing of the provider-led classifier;
- `NATIVE_TMDB_SOURCE_TYPES`, the seven currently confirmed native type names.

Both importer entry points return the same shape and do not require callers to interpret `JSON.parse` exceptions:

```js
{
  ok: boolean,
  project: ProjectNode | null,
  errors: Diagnostic[],
  warnings: Diagnostic[]
}
```

Every diagnostic has exactly the stable public fields:

```js
{
  code: string,
  path: string,
  message: string
}
```

Paths use predictable JSONPath-like locations such as `$`, `$[0].folders`, and `$[0].folders[1].sources[2]`. JSON syntax failures use `JSON_PARSE_ERROR` and a stable message rather than engine-specific parser text or a stack trace.

Options are optional:

```js
{
  idFactory?: () => string,
  projectTitle?: string
}
```

One `idFactory` is used for the project and every collection, folder, and source. `projectTitle` is builder-only and defaults to an empty string; it is never inferred from imported collection content.

## Atomic structural import

The supported root is an array of collections. An empty array produces a valid empty project. A non-array root is rejected.

Before creating any domain node, the importer checks every active hierarchy edge:

- each collection entry must be a plain object;
- `folders`, when present, must be an array;
- each folder entry must be a plain object;
- `sources`, when present, must be an array;
- each active source entry must be a plain object.

Any structural error makes the entire result atomic: `ok` is false and `project` is null. Invalid nodes are never dropped to produce a partial project. The importer also rejects non-JSON values, circular references, non-finite numbers, class instances, sparse arrays, and other data that cannot be represented safely in plain domain state.

Already-parsed sparse arrays are rejected recursively at the root or within collection, folder, source, filter, and unknown raw values. They return the existing structured `INVALID_JSON_VALUE` failure and no project; missing slots are never normalised to `null` or `undefined`, and no partial import is returned.

Stable error codes are:

| Code | Meaning |
| --- | --- |
| `JSON_TEXT_REQUIRED` | The text entry point received a non-string. |
| `JSON_PARSE_ERROR` | JSON text could not be parsed. |
| `ROOT_NOT_ARRAY` | The parsed root is not an array. |
| `COLLECTION_NOT_OBJECT` | A collection entry is not a plain object. |
| `FOLDERS_NOT_ARRAY` | A present `folders` value is not an array. |
| `FOLDER_NOT_OBJECT` | A folder entry is not a plain object. |
| `SOURCES_NOT_ARRAY` | A present `sources` value is not an array. |
| `SOURCE_NOT_OBJECT` | An active source entry is not a plain object. |
| `INVALID_JSON_VALUE` | Parsed input cannot be represented as finite, dense plain JSON data, including when it contains sparse arrays. |
| `INVALID_IMPORT_OPTIONS` | Options are not a plain object. |
| `INVALID_ID_FACTORY` | A supplied ID factory is not a function. |
| `INVALID_PROJECT_TITLE` | A supplied project title is not a string. |
| `INTERNAL_ID_GENERATION_ERROR` | The ID factory threw or returned an invalid ID. |
| `INTERNAL_ID_COLLISION` | The ID factory produced a project-wide duplicate. |

Warnings can accompany a successful import. Stable warning codes are:

| Code | Meaning |
| --- | --- |
| `MISSING_FOLDERS` | An absent `folders` property became an empty folder list. |
| `MISSING_SOURCES` | An absent `sources` property became an empty active source list. |
| `CATALOG_SOURCES_NOT_ARRAY_PRESERVED` | A non-array compatibility value remains raw-only. |
| `LEGACY_CATALOG_SOURCES_ONLY` | Populated compatibility data exists without authoritative active sources. |
| `UNSUPPORTED_TMDB_SOURCE_PRESERVED` | A TMDB source type is missing or unsupported and remains opaque. |
| `INCOMPLETE_ADDON_SOURCE` | An explicit addon source is missing a current identity field but remains a draft. |
| `AMBIGUOUS_SOURCE_PRESERVED_OPAQUE` | Addon-looking fields exist without an explicit addon provider. |
| `INVALID_FILTERS_PRESERVED` | A non-object filter value remains raw-only. |

## Recognised editable fields

Absent collection and folder `id` and `title` fields retain the domain factory's empty-string defaults. Imported unknown fields never become editable automatically.

Collection editable fields:

- `id`
- `title`
- `pinToTop`
- `viewMode`
- `showAllTab`

Folder editable fields:

- `id`
- `title`
- `hideTitle`
- `tileShape`
- `coverEmoji`
- `focusGifUrl`
- `heroVideoUrl`
- `titleLogoUrl`
- `coverImageUrl`
- `focusGifEnabled`
- `heroBackdropUrl`

Source editable fields:

- `provider`
- `title`
- `tmdbSourceType`
- `tmdbId`
- `mediaType`
- `sortBy`
- `addonId`
- `type`
- `catalogId`
- `genre`

Fields such as `addonName`, `manifestUrl`, `showInHome`, community metadata, future provider values, and other unknown properties remain available only through `rawImported` in this issue.

## Source classification

Classification is deterministic, case-insensitive, and led only by the explicit `provider` value. Inspection never rewrites the original casing or raw object.

- `native-tmdb`: provider is exactly `tmdb`, ignoring case, and `tmdbSourceType` is exactly one of `LIST`, `COLLECTION`, `COMPANY`, `NETWORK`, `DISCOVER`, `PERSON`, or `DIRECTOR`, ignoring case.
- `addon`: provider is exactly `addon`, ignoring case. Missing `addonId`, `type`, or `catalogId` is permitted as an incomplete editor draft and produces a warning.
- `opaque`: provider is absent, unknown, `community`, otherwise unrecognised, or explicitly TMDB with a missing or unsupported source type.

`addonId`, `type`, `catalogId`, `genre`, `manifestUrl`, `addonName`, and `showInHome` do not prove addon category by themselves. When these addon-looking fields lack an explicit addon provider, the source remains opaque and a warning records the ambiguity.

An unsupported TMDB source does not reject the import. Its complete object remains in `rawImported`, recognised fields remain editable, its category is `opaque`, and `UNSUPPORTED_TMDB_SOURCE_PRESERVED` records the unsupported interpretation.

## Discover filter extraction

When `filters` is a plain object, editable state receives only:

- `withGenres`
- `releaseDateGte`
- `releaseDateLte`
- `voteAverageGte`
- `voteAverageLte`
- `voteCountGte`
- `withOriginalLanguage`
- `withOriginCountry`
- `withKeywords`
- `withCompanies`
- `withNetworks`
- `year`
- `watchRegion`
- `withWatchProviders`

Unknown keys, including experimental `filters.search`, remain in the source raw snapshot but are not promoted. A non-object `filters` value is also preserved raw-only and produces `INVALID_FILTERS_PRESERVED`.

## Ordering, identity, and preservation

Root collection order, folder order, and authoritative `sources` order are copied exactly. Nuvio-facing IDs, titles, source contents, indexes, timestamps, and hashes never become builder internal IDs. Duplicate Nuvio-facing IDs are valid.

The supplied ID factory creates every builder-only identity. After complete hydration, the importer checks project-wide uniqueness. A collision rejects the import with `INTERNAL_ID_COLLISION` and returns no partial project.

Each collection, folder, and source receives a complete deep-cloned `rawImported` snapshot. Nested unknown values and complete nested filters remain intact. Caller mutations after import cannot change the project, and domain edits cannot change raw snapshots. Imported projects remain compatible with `structuredClone` and `JSON.stringify`.

Collection snapshots deliberately retain their original nested folders while folder and source nodes also retain their own detached snapshots. This duplication is preservation evidence, not a serializer decision.

## `catalogSources` boundary

The active domain source list comes only from `folder.sources`. The importer never creates a second editable list and never copies, merges, promotes, or migrates `catalogSources` entries into active sources.

The complete original `catalogSources` value remains in `folder.rawImported`. A populated array with missing or empty authoritative `sources` produces `LEGACY_CATALOG_SOURCES_ONLY` while importing zero active sources. A non-array compatibility value produces `CATALOG_SOURCES_NOT_ARRAY_PRESERVED` and remains raw-only.

This detection does not implement legacy migration or Ultra MAX compatibility. A later controlled compatibility issue needs a real exported Ultra MAX sample before defining transformation or projection behaviour.

## Deliberately deferred

This importer does not implement browser file selection, drag-and-drop, React UI, user-visible diagnostic presentation, export validation, serialization, editable-over-raw overlay, `catalogSources` projection generation, legacy migration, Ultra MAX transformations, a final project-file format, storage, undo/redo, TMDB or addon requests, routing, authentication, branding, Trakt, v1 changes, or Worker changes.
