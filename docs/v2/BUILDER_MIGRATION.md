# Builder Addon Projection Migration

Status: implemented for issue [#37](https://github.com/davecollections/tmdb-id-lookup/issues/37)

Last reviewed: 2026-07-11

## Purpose and evidence boundary

The framework-independent migration under `builder/src/migrate/` explicitly promotes one confirmed legacy shape: addon `catalogSources` projections in a folder with no original or current authoritative sources. It is opt-in and is never called by the importer or serializer automatically.

The contract is based on two real Nuvio Desktop import/export pairs reviewed by the project owner:

- an active-addon pair retained 8 collections, 129 folders, 201 compact addon sources, 201 matching projections, order, and identity while Nuvio expanded defaults and allowed source `genre: ""` to correspond to projection `genre: null`;
- a projection-only pair retained 8 collections, 83 folders, and all 174 projections while Nuvio created 174 authoritative addon sources in projection order. Of those projections, 140 exact `"None"` genres became `null`; real genres remained unchanged and `anime` remained a valid addon type.

The private third-party files and unique configuration URLs are not stored in the repository. The fixtures under `tests/fixtures/nuvio/compatibility/` are small, sanitised structural reproductions using synthetic addon identities and `https://example.invalid/` artwork.

## Public API

`builder/src/migrate/index.js` exports:

```js
migrateLegacyAddonProjections(project, options)
```

Options support only an optional ID factory:

```js
{ idFactory?: () => string }
```

The result is always:

```js
{
  ok: boolean,
  project: ProjectNode | null,
  errors: Diagnostic[],
  warnings: Diagnostic[],
  changes: {
    foldersMigrated: number,
    sourcesCreated: number
  }
}
```

Each diagnostic has exactly:

```js
{ code: string, path: string, message: string }
```

Normal validation failures are returned. Failure returns `project: null`, zero change counts, and no partial migrated value. Success returns a detached project. A successful no-op is detached and deeply equal to its input.

## Eligibility

A folder is migrated only when every condition is true:

1. The complete project hierarchy and the folder are valid builder nodes.
2. Current `folder.sources` is an empty dense array.
3. `folder.rawImported` is a plain object.
4. Raw `sources` is absent or an empty array.
5. The raw folder owns `catalogSources`.
6. Raw `catalogSources` is a non-empty dense array.
7. Every projection is a plain object.
8. Every projection has non-empty string `addonId`, `type`, and `catalogId` values.
9. Every present `genre` is a string or `null`.

The migration is a no-op for missing or empty projections, folders without raw evidence, folders with current sources, and folders whose original raw sources were non-empty. This prevents a deliberate current-source deletion from being repopulated. It never merges, appends, repairs mixed current state, selects folders, or interprets catalog names.

An invalid entry inside an otherwise eligible projection-only folder is an error, not a skipped entry. One invalid eligible folder blocks migration across the whole project.

## Created source contract

Each projection creates one compact source in collection, folder, then projection order:

```js
{
  nodeType: "source",
  internalId: "builder-only-id",
  category: "addon",
  editable: {
    provider: "addon",
    addonId,
    type,
    catalogId,
    // genre only when present on the projection
  }
}
```

No source `rawImported` snapshot is fabricated because the authoritative source did not exist in the original file. Projection-only metadata is not copied into the source. The original raw folder and projections remain untouched so the serializer can preserve matched projection metadata.

The migration does not invent `tmdbSourceType`, `title`, `tmdbId`, `traktListId`, `mediaType`, `sortBy`, `sortHow`, `filters`, or Nuvio's expanded null/default envelope. Addon types are copied exactly, including confirmed `movie`, `series`, and `anime` values.

## Genre rules and projection matching

Source creation uses exactly one value transformation:

- exact `"None"` becomes `null`;
- actual strings such as `"Action"` stay unchanged;
- `null` stays `null`;
- empty string stays empty string;
- absent genre stays absent.

`"none"`, `"NONE"`, `" None "`, and other variants are not aliases.

For addon projection identity matching only, missing genre, `null`, empty string, and exact `"None"` share one no-genre identity. This narrow compatibility alias lets a migrated `genre: null` source consume its original `genre: "None"` projection. Matched unknown projection metadata survives, while the current source identity is overlaid, so both exported source and projection use `genre: null`. Real genres remain distinct. The alias does not rewrite unrelated imported source or projection values.

## Atomicity, IDs, and diagnostics

Before creating output, migration validates the hierarchy, editable objects, raw snapshot types, child arrays, source categories, existing internal-ID uniqueness, projection eligibility data, and complete JSON compatibility. It then reserves every new ID before cloning and building output.

The default ID factory is the domain's secure `crypto.randomUUID()` factory. An injected factory supports deterministic tests. Exactly one ID is generated per migrated source. IDs are checked against every existing project ID and all previously generated migration IDs.

Stable errors include:

- `INVALID_MIGRATION_OPTIONS`
- `INVALID_ID_FACTORY`
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
- `INVALID_JSON_VALUE`
- `DUPLICATE_INTERNAL_ID`
- `INTERNAL_ID_GENERATION_ERROR`
- `RAW_CATALOG_SOURCES_NOT_ARRAY`
- `SPARSE_RAW_CATALOG_SOURCES`
- `RAW_CATALOG_SOURCE_NOT_OBJECT`
- `INCOMPLETE_LEGACY_ADDON_PROJECTION`
- `INVALID_LEGACY_ADDON_GENRE`

Each migrated folder emits one `LEGACY_ADDON_PROJECTIONS_MIGRATED` warning that states its created-source count. Change counts are returned separately for folders and sources.

## Importer and serializer boundaries

`importNuvioCollections` remains preservation-first. It imports no active source from `catalogSources`, keeps the raw folder unchanged, and retains its existing legacy warning. A caller may deliberately pass the successful imported project to this migration afterward.

The serializer remains preservation-first and atomic. It blocks unresolved projection-only data, derives projections only from addon-category authoritative sources, never projects native or opaque sources, preserves matched raw projection metadata, and warns for genuinely unmatched old projections. It does not invoke migration.

The migration and tests use no manifests, networking, browser APIs, React, file APIs, schema libraries, validation libraries, state libraries, or new dependencies.

## Sanitised fixtures

The compatibility fixture pair for active sources contains compact movie and series sources, matching projections, a no-genre empty-string/null variation, `showInHome: false`, presentation artwork, and an unknown projection sentinel. Its Nuvio-normalised counterpart records explicit null/default fields and stable order and identity. It is valid without migration.

The projection-only pair contains movie, series, and anime folders; absent and explicit-empty raw source arrays; exact `"None"`; real `"Action"`; presentation artwork; `showInHome: false`; and an unknown projection sentinel. Its Nuvio-normalised counterpart records the source promotion, null normalization, expanded defaults, retained projections, and unchanged order.

## Manual Nuvio Desktop verification

The migration evidence is deliberately separated into three levels:

- **Automated repository evidence:** issue #37 tests prove importer preservation, explicit migration, serializer matching, canonical validation, ordering, genre normalization, and unknown-field retention against sanitised fixtures.
- **Owner-reviewed private pair evidence:** the private active-addon and AIO Metadata projection-only pairs establish the real-client behavior summarized above without committing third-party files or unique configuration URLs.
- **Pending builder-generated round trip:** issue [#38](https://github.com/davecollections/tmdb-id-lookup/issues/38) generates the exact sanitised input through the production importer → migration → serializer path and prepares it for a controlled Nuvio Desktop import/export.

The reproducible input, generation report, and owner procedure are in [`manual-tests/nuvio-desktop/addon-projection-migration/`](../../manual-tests/nuvio-desktop/addon-projection-migration/). The builder-generated Nuvio Desktop round trip is not manual-client evidence until the owner returns the untouched export and client details.

Stage B must record the Nuvio Desktop version/build and operating system, preserve the returned `nuvio-desktop-export.json`, compare the collection/folder/source/projection counts and order, verify movie/series/anime and `null`/`"Action"`/`null` genres, and document retained sentinels, presentation fields, Nuvio-added defaults/nulls, and any dropped or normalized fields before changing the evidence status.

## Deferred work

Visible UI, automatic import migration, selective migration, browser file/download handling, controller state, storage, undo/redo, manifests, live validation, networking, authentication, native TMDB conversion, Ultra MAX conversion, AIO Metadata runtime integration, catalog-name interpretation, language support, translated artwork, routing, v1 changes, and Worker changes remain outside this issue.
