# Builder Domain Model

Status: implemented for issue [#34](https://github.com/davecollections/tmdb-id-lookup/issues/34)

Last reviewed: 2026-07-10

## Purpose and boundary

The builder domain is a framework-independent representation of editor state. It lives under `builder/src/domain/` and does not depend on React, Vite, browser storage, networking, UI components, or a schema/state library.

Domain state contains only plain JSON-compatible objects, ordered arrays, and primitive values. It can be copied with `structuredClone` and encoded with `JSON.stringify`. The domain is editor state, not validated Nuvio export output: incomplete drafts are allowed.

## Hierarchy and exact shapes

Every node has a `nodeType` discriminator and builder-only `internalId`.

```text
project
  nodeType: "project"
  internalId: string
  editable: { title: string, ...known project values }
  collections: collection[]

collection
  nodeType: "collection"
  internalId: string
  editable: { id: string, title: string, ...known collection values }
  rawImported?: JSON value
  folders: folder[]

folder
  nodeType: "folder"
  internalId: string
  editable: { id: string, title: string, ...known folder values }
  rawImported?: JSON value
  sources: source[]

source
  nodeType: "source"
  internalId: string
  category: "native-tmdb" | "addon" | "opaque"
  editable: { ...known source values }
  rawImported?: JSON value
```

`collections`, `folders`, and `sources` retain insertion order. Move operations change only the relevant sibling order. Collection and folder `editable.id` values are Nuvio-facing draft values and are intentionally separate from `internalId`.

## Editable values, raw imports, and metadata

The three concerns are deliberately separate:

- `editable` contains the current known values that builder controls may change. Blank titles and IDs and incomplete source settings are valid editor drafts.
- `rawImported` is an optional deep-cloned snapshot of the original collection, folder, or source JSON. It preserves unknown/community fields and is not changed by domain operations.
- `internalId`, `nodeType`, and source `category` are builder-only metadata. A future exporter must not include them automatically.

Factories deep-clone caller-provided `editable` and `rawImported` data. They reject functions, class instances, maps, sets, dates, circular references, non-finite numbers, and other non-JSON values so project state remains plain data. Immutable operations may structurally share untouched snapshots, but they never mutate them.

The final import parser, editable-over-raw overlay policy, and serializer are deliberately not part of this model.

## Internal identity

`internalId` is stable across renames, edits, and moves. It is never derived from an array index, title, Nuvio ID, TMDB ID, catalog ID, filter, timestamp, random decimal, or content hash.

Factories accept an injectable `idFactory`, which gives tests and future import code deterministic control. The default uses `globalThis.crypto.randomUUID()`. Environments without that API must inject a factory; there is no weak fallback.

`checkInternalIdUniqueness(project)` scans the complete tree and reports duplicate IDs with their counts and node types. Identity-based mutation helpers reject missing or ambiguous targets.

## Source categories

- `native-tmdb` means a caller has explicitly identified a currently supported native TMDB source.
- `addon` means a caller has explicitly identified an addon-backed source.
- `opaque` means the builder preserves a source without interpreting it as a known provider shape.

The source factory requires one of those explicit categories. It does not inspect `provider`, `addonId`, `type`, `catalogId`, `filters`, or similar fields to guess a category. Deciding the category belongs to the future importer or another informed caller.

## `sources` and `catalogSources`

A folder has exactly one active editable source array: `sources`. There is no independently editable `catalogSources` domain array.

When imported folder JSON contains `catalogSources`, it can remain untouched within `folder.rawImported.catalogSources`. A future serializer may derive an addon compatibility projection from authoritative `sources`; this issue does not generate, normalize, or export that projection.

## Public API

`builder/src/domain/index.js` exports:

- identity: `createInternalId`, `defaultInternalIdFactory`;
- constants: `NODE_TYPES`, `SOURCE_CATEGORIES`;
- data handling and factories: `cloneJsonValue`, `createEmptyProject`, `createCollection`, `createFolder`, `createSource`;
- inspection: `traverseProject`, `findNodeByInternalId`, `checkInternalIdUniqueness`;
- immutable editing: `updateEditableValues`, `insertChild`, `moveNode`, `removeNode`.

`insertChild` enforces the project → collection → folder → source hierarchy and accepts an optional insertion index. `moveNode` moves within the existing sibling array. `removeNode` removes a non-root node. Each successful editing operation returns new changed nodes and arrays without modifying its input.

## Deliberately unimplemented

This issue does not implement Nuvio import parsing, export validation, JSON serialization, raw overlay, `catalogSources` projection generation, storage, undo/redo, React state integration, forms, screens, networking, TMDB/addon requests, routing, authentication, or changes to v1 and the Worker.
