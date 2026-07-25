# Builder UI Shell and Hierarchy Navigator

Status: shell implemented for issue [#40](https://github.com/davecollections/tmdb-id-lookup/issues/40), with welcome/import, editing, automatic-ID, and presentation milestones through issue [#53](https://github.com/davecollections/tmdb-id-lookup/issues/53)

Last reviewed: 2026-07-25

## Purpose and scope

The first visible workspace replaced the deployment placeholder under `/builder/`. Issue [#41](https://github.com/davecollections/tmdb-id-lookup/issues/41) now places a welcome/import screen in front of this contained hierarchy workspace. The visible product name is **TMDB Collection Builder**, with **Built for Nuvio collections** as its supporting line.

The workspace displays ordered collections, the selected collection's ordered folders, the selected folder's ordered sources, and a read-only summary of the selected node. It can create draft collections and folders through existing controller actions. Issue [#43](https://github.com/davecollections/tmdb-id-lookup/issues/43) makes collection/folder Nuvio-facing IDs automatic and hidden. Issue [#53](https://github.com/davecollections/tmdb-id-lookup/issues/53) now uses one entity-owned Edit action and one responsive settings modal for titles and contained presentation fields, documented in [BUILDER_NODE_EDITING.md](./BUILDER_NODE_EDITING.md). Import is documented separately in [BUILDER_WELCOME_IMPORT.md](./BUILDER_WELCOME_IMPORT.md). Source creation/editing, deletion, reordering, bulk settings, export, persistence, and migration application remain deferred.

The v1 TMDB ID Lookup remains unchanged at the site root. The builder keeps its relative backlink, remains unlinked from v1, and retains `noindex, nofollow` while it is a development preview.

## Controller integration and lifetime

`builder/src/main.jsx` creates exactly one production controller at module scope:

```js
const controller = createBuilderController({
  initialProjectTitle: "Untitled project"
});
```

The controller exists before React rendering and is passed to `BuilderApp` as a prop. React StrictMode can therefore render the component more than once without creating another controller. Welcome/workspace transitions reuse this instance. Tests inject controlled controller instances through the same prop.

React imports `createBuilderController` only from the supported `builder/src/application/index.js` entry point. UI modules do not import controller implementation details or domain, importer, migration, or serializer modules.

## External-store boundary

`useBuilderControllerState` is the only React subscription adapter. It calls `useSyncExternalStore` with `controller.subscribe`, `controller.getState`, and the same `getState` function as the server/static snapshot reader.

The project, revision, hierarchical selection, dirty flag, migration preview, and diagnostics remain controller-owned. React does not mirror the project into `useState`, copy the project into component-local state, or mutate a frozen snapshot. Only welcome/workspace presentation, browser import transport values, return confirmation, responsive viewport and card-scroll targeting, and the uncommitted settings draft and diagnostics use local React state.

## UI module structure

```text
builder/src/ui/
  BuilderApp.jsx              subscribed welcome/workspace presentation boundary
  BuilderWelcome.jsx          welcome, file selection, pasted text and diagnostics
  BuilderWorkspace.jsx        semantic hierarchy workspace rendering
  NodeEditor.jsx              single responsive collection/folder settings modal
  node-editor.js              pure title/presentation draft, validation, and minimal-patch helpers
  node-editor-actions.js      public controller update delegation
  modal-focus.js              dialog entry, containment, Escape, and focus-wrap helpers
  import-actions.js           public-controller-only browser transport helpers
  responsive-viewport.js      shared 900px viewport hook and reduced-motion scroll helper
  use-builder-controller.js   external-store subscription adapter
  view-model.js               pure safe display derivation
  draft-actions.js            deterministic collection/folder title conveniences
  workspace-return-actions.js guarded controller reset helpers
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

Creation is viewport-aware only at this UI layer. At the established 900px desktop breakpoint and above, creating a collection still selects it and exposes Folders, while creating a folder still selects it and exposes Sources. Below 900px, collection creation leaves the user on Collections without selecting the new card, and folder creation retains the selected parent collection while leaving the user on Folders. Repeated mobile creation therefore needs no back-navigation. Ordinary card selection and Edit continue to target each created node normally.

## Selection semantics

Collection, folder, and source list entries are real buttons inside ordinary semantic lists. Selection calls `controller.selectNode(internalId)`. React keys use builder-only `internalId`, but internal IDs are not displayed as user content.

Selected buttons use `aria-pressed`, visible accent treatment, and hidden selected text so selection is not communicated by colour alone. The source list preserves the exact authoritative source order and labels each row from the source's explicit `native-tmdb`, `addon`, or `opaque` category.

## Draft creation

`createDraftCollection(controller)` chooses the next unique `Untitled Collection` title, supplies the explicit manual defaults Tabs, All enabled, Pin off, and focus glow on, then delegates automatic Nuvio ID creation to the controller.

`createDraftFolder(controller, collectionInternalId)` chooses the next unique `Untitled Folder` title, supplies Poster and `hideTitle: true` as the explicit manual defaults, then delegates automatic Nuvio ID creation to the controller. The positive Show folder title on home screen switch is therefore off for a newly created blank folder; the actual folder title remains visible unless the separate everywhere-hidden intent is enabled.

Both helpers use only `getState()` and public controller actions. They never derive an internal ID or alter imported IDs. Their UI-only `selectCreated` option defaults to the established desktop behavior and selects only after creation succeeds; mobile callers disable that convenience without changing the controller creation contract. They return the controller's structured result with the successful `createdInternalId`. Collection creation does not create a folder, and folder creation does not create a source.

After successful mobile creation, the new card is scrolled into view when practical. The scroll uses smooth behavior unless `prefers-reduced-motion: reduce` is active, in which case it uses immediate behavior. Scrolling and hierarchy-level suppression are local presentation state and add no project revision.

## Read-only source and selection display

Native TMDB sources prefer an editable title, then the TMDB source type, then `TMDB source`. Addon sources prefer an editable title, catalog ID, addon ID, then `Addon source`. Opaque sources use an editable title when available and otherwise `Preserved source`.

The selected-node summary includes only relevant known editable fields. Collection summaries use friendly supported labels for Tabs/Rows, Pinned to top, All source tab enabled, and Focus glow enabled. Focus glow appears only for supported boolean values; absent, unsupported, and unusual raw values receive no fallback display. Folder summaries use Poster/Landscape and positive Home-screen title shown wording plus an artwork-presence count. Titles made only of the confirmed U+200E character display `Hidden title` with an `Invisible in Nuvio` badge and meaningful accessible names instead of producing blank cards or headings. Unsupported presentation values are not exposed. Source summaries include the explicit category and relevant known provider, TMDB, media, addon, catalog, and genre values. Opaque sources receive a calm `Preserved imported source` note.

The UI never renders full raw JSON, arbitrary unknown/community fields, serializer output, migration projections, exception objects, stack traces, or builder internal IDs.

## Collection and folder editing

Every collection and folder card has one compact, always-visible Edit text button beside its selectable card body. The two buttons are siblings inside a non-interactive wrapper. Edit directly selects and targets its exact collection or folder, including when another node was selected, without advancing project revision or dirty state. Folders and Sources headers contain no actions for their parent entity; panel headers own only title, count, and their relevant creation action. Source cards have no Edit action.

Edit opens one modal dialog shared by collections and folders. The ordinary rename path is its initially focused Title field when Title is enabled. It edits title plus the approved presentation fields, including explicit U+200E collection/folder title hiding and collection-level `focusGlowEnabled`. The folder setting Hide folder title everywhere in Nuvio is separate from Show folder title on home screen, the positive inverse mapping for native `hideTitle`; everywhere-hidden intent temporarily overrides the latter while preserving its prior modal preference. The modal keeps Nuvio IDs and builder `internalId` hidden and stable, validates title intent, and creates a minimal changed-field patch for `controller.updateNode`.

Collection layout wording is source-level: each folder remains separate, while Tabs presents each source as a tab and Rows presents each source as a streaming-style row after that folder is opened. With Tabs and Include an All tab enabled, folders containing two or more sources gain an All tab combining their sources; one-source folders do not show it. Rows shows no All tab but retains the preference for a later return to Tabs.

Opening and cancelling are UI-only. Applying an unchanged form is also a controller-free no-op. Actual edits retain selection and rely on the controller for the dirty flag and one revision increment. While settings are open, the workspace underlay is visibly dimmed, conditionally blurred, `inert`, and inaccessible to pointer and keyboard actions. Focus enters the Title field, remains contained in the dialog, and returns to the exact Edit trigger; Escape safely cancels, backdrop clicks do not discard, and body scrolling is locked. Imported absent, unsupported, Follow Layout, Square, repeated U+200E, focus-glow, and unusual presentation values remain untouched until deliberate canonical replacement.

## Diagnostics and migration status

The first current operation error appears in one inline `role="alert"` area with its stable message and optional code. Successful-import warnings appear separately in a collapsed, bounded native details element. The workspace does not render raw imported JSON or historical diagnostic dumps.

Migration remains non-interactive. The shell shows a small notice only when preview status is `available` or `blocked`. There is no migration action, automatic migration, or raw migration diagnostic display. The settings modal contains only bounded known fields and local diagnostics.

## Accessibility

- one page-level `h1` and logical panel/detail headings;
- ordinary semantic lists with real selection buttons;
- semantic presentation fieldsets with native radio buttons and labelled switches;
- one named modal dialog with contained focus, safe Escape cancellation, inert background, and exact trigger focus restoration;
- one always-visible entity-owned Edit action with hidden-title-specific accessible labels;
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

The default layout is mobile-first and has been designed for the required 360, 384, 393, 402, and 412px widths. A wider single-panel drill-down remains active at 768px. The three-panel layout starts at 900px and is intended for the required 1024px and 1280px desktop checks. The responsive creation hook uses that same 900px media query rather than adding viewport logic to the controller or domain.

The palette uses deep blue-black page and panel surfaces with restrained cyan and green accents, quiet separators, limited gradients, and compact elevation. It deliberately avoids a marketing hero, warm styling, excessive pills, dense dashboard decoration, external fonts, and copied third-party layouts.

## Stable DOM markers

Deployment and focused source tests use a small stable surface:

- `data-builder-root="true"`
- `data-builder-welcome="true"`
- `data-builder-shell="true"`
- `data-root-link="true"`
- `data-panel="collections|folders|sources"`
- `data-panel-header="collections|folders|sources"`
- `data-action="start-new-project|import-file|import-pasted-json|create-collection|create-folder|return-builder-home"`
- `data-action="edit-collection|edit-folder"`
- `data-action="apply-node-edit|cancel-node-edit"`
- `data-import-control="file|pasted-json"`
- `data-node-type="collection|folder|source"`
- `data-node-editor="collection|folder"`
- `data-settings-modal="true"`
- `data-settings-modal-backdrop="true"`
- `data-workspace-underlay="true"`
- `data-editor-field="title|hideNuvioTitle|hideFolderTitleEverywhere|viewMode|showAllTab|pinToTop|focusGlowEnabled|tileShape|showFolderTitle"`
- `data-editor-choice="tabs|rows|poster|landscape"`
- `data-editor-control="hideNuvioTitle|hideFolderTitleEverywhere|showAllTab|pinToTop|focusGlowEnabled|showFolderTitle"`
- `data-return-confirmation="true"`
- `data-action="stay-in-workspace|discard-and-return|create-collection-empty|create-folder-empty"`
- `data-editor-lock="true"` while editing

Accessible text, semantic roles, and button state remain the primary testing surface.

The Pages deployment workflow, workflow triggers, permissions, deployment environment, dependencies, and lockfile remain unchanged. The Nuvio validation workflow only moved its existing builder dependency installation ahead of `check-all.mjs`, because the UI tests load the existing React and Vite packages. Publishing behaviour is unchanged.

## Deliberate exclusions

The current presentation milestone does not add project-title editing, source creation/editing, export, save/download, copy JSON, persistence, storage, routing, browser history, migration actions, deletion, reordering, bulk settings, drag-and-drop, context menus, undo/redo, network import, TMDB search, addon loading, artwork, focus GIF, cover, logo, backdrop, or hero controls, accounts, authentication, templates, recipes, language support, Ultra MAX, AIO Metadata, Trakt, v1 runtime changes, Worker changes, Pages allowlist changes, Pages deployment workflow changes, or dependencies. Future focus-GIF support defaults off unless deliberately enabled.

## Next mandatory gate

Dave's mandatory final UI/flow review must assess Edit placement, direct unselected targeting, settings-modal behavior, U+200E hiding, focus glow, Tabs/Rows and All-tab behavior, Poster/Landscape selection, unusual-value guidance, mobile drill-down, desktop three-panel layout, accessibility, and visual polish. Bulk presentation settings remain deferred to a focused issue. Reordering remains a separate focused milestone before Search/Add. No pull request or source creation begins before the current review gate.
