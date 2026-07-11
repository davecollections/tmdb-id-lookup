# Builder UI Shell and Hierarchy Navigator

Status: implemented for issue [#40](https://github.com/davecollections/tmdb-id-lookup/issues/40)

Last reviewed: 2026-07-11

## Purpose and scope

The first visible builder interface replaces the deployment placeholder under `/builder/`. It is a contained navigation shell for the current project hierarchy, not a complete collection editor.

The shell displays the current project, ordered collections, the selected collection's ordered folders, the selected folder's ordered sources, and a read-only summary of the selected node. It can create draft collections and draft folders through existing controller actions. Source creation, editing, deletion, reordering, import, export, persistence, and migration application remain deferred.

The v1 TMDB ID Lookup remains unchanged at the site root. The builder keeps its relative backlink, remains unlinked from v1, and retains `noindex, nofollow` while it is a development preview.

## Controller integration and lifetime

`builder/src/main.jsx` creates exactly one production controller at module scope:

```js
const controller = createBuilderController({
  initialProjectTitle: "Untitled project"
});
```

The controller exists before React rendering and is passed to `BuilderApp` as a prop. React StrictMode can therefore render the component more than once without creating another controller. Tests inject controlled controller instances through the same prop.

React imports `createBuilderController` only from the supported `builder/src/application/index.js` entry point. UI modules do not import controller implementation details or domain, importer, migration, or serializer modules.

## External-store boundary

`useBuilderControllerState` is the only React subscription adapter. It calls `useSyncExternalStore` with `controller.subscribe`, `controller.getState`, and the same `getState` function as the server/static snapshot reader.

The project, revision, hierarchical selection, dirty flag, migration preview, and diagnostics remain controller-owned. React does not mirror the project into `useState`, copy the project into component-local state, or mutate a frozen snapshot.

## UI module structure

```text
builder/src/ui/
  BuilderApp.jsx              application shell and semantic hierarchy rendering
  use-builder-controller.js   external-store subscription adapter
  view-model.js               pure safe display derivation
  draft-actions.js            deterministic collection/folder draft conveniences
  index.js                    UI exports
```

`buildBuilderViewModel(state)` resolves selection by builder-only internal identity, retains child ordering, derives counts, chooses safe fallback labels, and exposes only known display fields. It never exposes raw imported objects or converts an opaque source into a known category.

## Hierarchy layout

The workspace has three conceptual panels:

1. Collections
2. Folders
3. Sources and selection details

At 900px and wider, all three panels remain visible. Collections and folders use compact list panels, while the final panel has more space for source rows and the current read-only summary. At 1240px and wider, source rows and selection details can use a balanced split inside the third panel.

Below 900px, the shell is a drill-down driven only by controller selection:

- no selected collection shows Collections;
- a selected collection with no folder shows Folders;
- a selected folder, with or without a selected source, shows Sources.

`All collections` calls `clearSelection()`. The source-level back control selects the parent collection. Selecting `Show folder details` selects the current folder and clears only source selection. The shell does not add URL routes or browser-history state.

## Selection semantics

Collection, folder, and source list entries are real buttons inside ordinary semantic lists. Selection calls `controller.selectNode(internalId)`. React keys use builder-only `internalId`, but internal IDs are not displayed as user content.

Selected buttons use `aria-pressed`, visible accent treatment, and hidden selected text so selection is not communicated by colour alone. The source list preserves the exact authoritative source order and labels each row from the source's explicit `native-tmdb`, `addon`, or `opaque` category.

## Draft creation

`createDraftCollection(controller)` scans current editable collection IDs and chooses the smallest free positive `collection-N` value. Its titles are `Untitled Collection`, then `Untitled Collection 2`, and so on.

`createDraftFolder(controller, collectionInternalId)` scans editable folder IDs across the complete project and chooses the smallest free positive `folder-N` value. Its titles follow the matching `Untitled Folder` pattern.

Both helpers use only `getState()` and public controller actions. They never derive an internal ID, never alter imported IDs, and select a created node only after creation succeeds. They return the controller's structured result with the successful `createdInternalId`. Collection creation does not create a folder, and folder creation does not create a source.

## Read-only source and selection display

Native TMDB sources prefer an editable title, then the TMDB source type, then `TMDB source`. Addon sources prefer an editable title, catalog ID, addon ID, then `Addon source`. Opaque sources use an editable title when available and otherwise `Preserved source`.

The selected-node summary includes only relevant known editable fields. Collection summaries include known identity, counts, pinning, and view mode. Folder summaries include known identity, count, tile shape, hide-title state, and an artwork-presence count. Source summaries include the explicit category and relevant known provider, TMDB, media, addon, catalog, and genre values. Opaque sources receive a calm `Preserved imported source` note.

The UI never renders full raw JSON, arbitrary unknown/community fields, serializer output, migration projections, exception objects, stack traces, or builder internal IDs.

## Diagnostics and migration status

The first current operation error appears in one inline `role="alert"` area with its stable message and optional code. It does not render historical diagnostic lists or use modal dialogs.

Migration remains non-interactive. The shell shows a small notice only when preview status is `available` or `blocked`. There is no migration action, automatic migration, or raw migration diagnostic display.

## Accessibility

- one page-level `h1` and logical panel/detail headings;
- ordinary semantic lists with real selection buttons;
- a real anchor for the v1 backlink;
- `aria-pressed` plus visible and screen-reader selected state;
- approximately 46–48px minimum action targets and larger hierarchy rows;
- strong visible `:focus-visible` outlines;
- restrained high-contrast cool surfaces;
- `role="alert"` for current operation failures;
- decorative builder mark with an empty image alternative;
- no hover-only behavior;
- overflow wrapping for long titles, IDs, and known values;
- reduced-motion handling through `prefers-reduced-motion`.

## Responsive and visual direction

The default layout is mobile-first and has been designed for the required 360, 384, 393, 402, and 412px widths. A wider single-panel drill-down remains active at 768px. The three-panel layout starts at 900px and is intended for the required 1024px and 1280px desktop checks.

The palette uses deep blue-black page and panel surfaces with restrained cyan and green accents, quiet separators, limited gradients, and compact elevation. It deliberately avoids a marketing hero, warm styling, excessive pills, dense dashboard decoration, external fonts, and copied third-party layouts.

## Stable DOM markers

Deployment and focused source tests use a small stable surface:

- `data-builder-root="true"`
- `data-builder-shell="true"`
- `data-root-link="true"`
- `data-panel="collections|folders|sources"`
- `data-action="create-collection|create-folder"`
- `data-node-type="collection|folder|source"`

Accessible text, semantic roles, and button state remain the primary testing surface.

The Pages deployment workflow, workflow triggers, permissions, deployment environment, dependencies, and lockfile remain unchanged. The Nuvio validation workflow only moved its existing builder dependency installation ahead of `check-all.mjs`, because the UI tests load the existing React and Vite packages. Publishing behaviour is unchanged.

## Deliberate exclusions

This milestone does not add import/export, browser file handling, save/download, copy JSON, persistence, storage, routing, browser history, migration actions, forms, edit controls, source creation, deletion, reordering, drag-and-drop, context menus, dialogs, undo/redo, networking, TMDB search, addon loading, artwork tools, accounts, authentication, language support, Ultra MAX, AIO Metadata, Trakt, v1 changes, Worker changes, Pages allowlist changes, Pages deployment workflow changes, or dependencies.

## Next likely UI milestone

The next separately approved issue can introduce one deliberately scoped editing or import/export workflow on top of this controller-connected shell. It should retain the current external-store boundary and must not broaden supported Nuvio source assumptions without new evidence.
