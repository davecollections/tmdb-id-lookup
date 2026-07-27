# Builder UI Shell and Hierarchy Navigator

Status: shell implemented for issue [#40](https://github.com/davecollections/tmdb-id-lookup/issues/40), with welcome/import, editing, automatic-ID, presentation, and hierarchy-reordering milestones through issue [#59](https://github.com/davecollections/tmdb-id-lookup/issues/59)

Last reviewed: 2026-07-27

## Purpose and scope

The first visible workspace replaced the deployment placeholder under `/builder/`. Issue [#41](https://github.com/davecollections/tmdb-id-lookup/issues/41) now places a welcome/import screen in front of this contained hierarchy workspace. The visible product name is **TMDB Collection Builder**, with **Built for Nuvio collections** as its supporting line.

The workspace displays ordered collections, the selected collection's ordered folders, and the selected folder's ordered sources. It can create draft collections and folders through existing controller actions. Issue [#43](https://github.com/davecollections/tmdb-id-lookup/issues/43) makes collection/folder Nuvio-facing IDs automatic and hidden. Issue [#53](https://github.com/davecollections/tmdb-id-lookup/issues/53) uses one entity-owned Edit action and one responsive settings modal for titles and contained presentation fields, documented in [BUILDER_NODE_EDITING.md](./BUILDER_NODE_EDITING.md). Issue [#59](https://github.com/davecollections/tmdb-id-lookup/issues/59) adds compact pointer/touch and keyboard reordering to every existing collection, folder, and source card and removes the deferred Selection details summary. Import is documented separately in [BUILDER_WELCOME_IMPORT.md](./BUILDER_WELCOME_IMPORT.md). Source creation/editing, deletion, bulk settings, export, persistence, and migration application remain deferred.

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
  hierarchy-reordering.js     visible sibling mapping, labels, and controller delegation
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
3. Sources

At 900px and wider, all three panels remain visible. Collections and folders use compact list panels, while the final panel gives the source cards the available width. The former Selection details split and its mobile duplicate are absent at every breakpoint.

Below 900px, the shell is a drill-down driven only by controller selection:

- no selected collection shows Collections;
- a selected collection with no folder shows Folders;
- a selected folder, with or without a selected source, shows Sources.

`All collections` calls `clearSelection()`. The source-level back control selects the parent collection. Selecting `Show folder details` selects the current folder and clears only source selection. The shell does not add URL routes or browser-history state.

Creation is viewport-aware only at this UI layer. At the established 900px desktop breakpoint and above, creating a collection still selects it and exposes Folders, while creating a folder still selects it and exposes Sources. Below 900px, collection creation leaves the user on Collections without selecting the new card, and folder creation retains the selected parent collection while leaving the user on Folders. Repeated mobile creation therefore needs no back-navigation. Ordinary card selection and Edit continue to target each created node normally.

## Selection semantics

Collection, folder, and source list entries are real buttons inside ordinary semantic lists. Selection calls `controller.selectNode(internalId)`. React keys use builder-only `internalId`, but internal IDs are not displayed as user content.

Selected buttons use `aria-pressed`, visible accent treatment, and hidden selected text so selection is not communicated by colour alone. The source list preserves the exact authoritative source order and labels each row from the source's explicit `native-tmdb`, `addon`, or `opaque` category.

Every collection and folder uses one compact horizontal row containing a main visual card and one compact Edit action. Inside that main card, a 46px touch target containing an 18px six-dot grip precedes the flexible selectable title/details/chevron body by 12px. Sources use the same internally contained grip and flexible identity body without an Edit action. The grip alone begins dragging, the card body remains the navigation target, and Edit remains outside the main card and independent of both. Single-item handles stay internally aligned but disabled. Long titles use the existing safe display fallbacks and a bounded two-line treatment so controls remain inside the viewport.

Folder and source visible order is their authoritative array order. Collections display the stable `pinToTop: true` group before the stable ordinary group; absent, false, and unusual preserved pin values remain in the ordinary group. Each view item retains both its group-relative movement position and its overall zero-based visible-list position. Pointer destinations clamp to the current sibling/pin group, so crossing the pin boundary never suggests or changes pin state. The pure movement helper maps either the adjacent keyboard destination or final pointer destination back to the authoritative raw-array index before calling `controller.moveNode(internalId, targetIndex)` once, while successful pointer announcements use the overall one-based visible-list position. This covers interleaved imported collection arrays where visible and raw neighbours differ without adding ordering metadata, exposing raw indexes, or adding a second movement implementation. Stable internal IDs preserve selection and keyed card identity.

Pointer Events start only from the handle and use a 6px vertical threshold. Before creating a pointer session, the handle must successfully establish Pointer Capture and confirm it where the API supports confirmation. Capture failure declines that gesture without creating an overlay, changing data, or disabling later keyboard operation; no handle-local drag is allowed to continue without reliable move/up/cancel delivery. Crossing the threshold creates a fixed-position, pointer-inert clone of the complete measured hierarchy row—including Edit where present—above panel clipping. It retains the original pointer-grab offset and exact row width/height while following vertical movement. The source row becomes a same-sized provisional placeholder that moves to the proposed position, and crossed siblings shift into the opened space with a restrained 150ms FLIP-style transform. A full-row insertion line remains secondary emphasis rather than the only feedback.

Hover geometry and provisional transforms never call the controller. A changed pointer-up settles the overlay toward the measured placeholder and then performs one authoritative move. Same-position drop settles back without a move. While the pointer session exists—including its 150ms settle—selection/mobile back, Edit, creation, workspace return, root navigation, another reorder start, and keyboard-mode entry are ignored. The active handle is not disabled during capture. Escape remains able to cancel an active non-settling gesture; pointer cancellation, lost capture, or Escape removes the fixed overlay, placeholder, sibling transforms, and body grabbing state without changing data or revision. Completion or cancellation clears the session before normal interaction resumes. Under reduced motion, the overlay and placeholder remain complete while sibling and settle transitions are effectively removed. Auto-scroll applies a bounded vertical window step near the viewport edges and target calculation uses document-space measurements so scrolling does not corrupt the destination; normal page scrolling remains available everywhere outside the handle because `touch-action: none` is scoped to the handle only.

The same focusable handle supports keyboard reordering without permanent arrow controls. Enter or Space starts or ends keyboard mode, Arrow Up and Arrow Down each perform at most one valid adjacent movement, and Escape exits. A hidden instruction is associated with every handle, the live region announces successful movement, and focus returns to the moved item's handle.

## Draft creation

`createDraftCollection(controller)` chooses the next unique `Untitled Collection` title, supplies the explicit manual defaults Tabs, All enabled, Pin off, and focus glow on, then delegates automatic Nuvio ID creation to the controller.

`createDraftFolder(controller, collectionInternalId)` chooses the next unique `Untitled Folder` title, supplies Poster and `hideTitle: true` as the explicit manual defaults, then delegates automatic Nuvio ID creation to the controller. Hide on home screen only is therefore selected for a newly created blank folder; the actual folder title remains visible when the folder is opened.

Both helpers use only `getState()` and public controller actions. They never derive an internal ID or alter imported IDs. Their UI-only `selectCreated` option defaults to the established desktop behavior and selects only after creation succeeds; mobile callers disable that convenience without changing the controller creation contract. They return the controller's structured result with the successful `createdInternalId`. Collection creation does not create a folder, and folder creation does not create a source.

After successful mobile creation, the new card is scrolled into view when practical. The scroll uses smooth behavior unless `prefers-reduced-motion: reduce` is active, in which case it uses immediate behavior. Scrolling and hierarchy-level suppression are local presentation state and add no project revision.

## Read-only source display

Native TMDB sources prefer an editable title, then the TMDB source type, then `TMDB source`. Addon sources prefer an editable title, catalog ID, addon ID, then `Addon source`. Opaque sources use an editable title when available and otherwise `Preserved source`. Source cards retain the known identity metadata needed to distinguish them without exposing raw imported objects.

Titles made only of the confirmed U+200E character display `Hidden title` with an `Invisible in Nuvio` badge and meaningful selection, Edit, and movement names instead of producing blank cards or labels. Unusual source-title values fall back to the existing source identity labels rather than being stringified. The hierarchy no longer renders a selected-node detail panel; detailed review remains deferred to the future Create JSON/review workflow.

The UI never renders full raw JSON, arbitrary unknown/community fields, serializer output, migration projections, exception objects, stack traces, or builder internal IDs.

## Collection and folder editing

Every collection and folder card has one compact, always-visible Edit text button beside its selectable card body. The two buttons are siblings inside a non-interactive wrapper. Edit directly selects and targets its exact collection or folder, including when another node was selected, without advancing project revision or dirty state. Folders and Sources headers contain no actions for their parent entity; panel headers own only title, count, and their relevant creation action. Source cards have no Edit action.

Edit opens one modal dialog shared by collections and folders. The ordinary rename path is its initially focused Title field when Title is enabled; supported non-empty visible text is selected once on opening so immediate typing replaces it, without later rerenders or validation refocus selecting it again. It edits title plus the approved presentation fields, including explicit U+200E collection/folder title hiding and collection-level `focusGlowEnabled`. Immediately below a folder's Title field, one Folder title visibility radio-card group offers Show everywhere (visible title plus `hideTitle: false`), Hide on home screen only (visible title plus `hideTitle: true`), and Hide everywhere (exactly one U+200E plus `hideTitle: true`), followed by Tile shape. The modal keeps Nuvio IDs and builder `internalId` hidden and stable, validates title intent, and creates a minimal changed-field patch for `controller.updateNode`.

The How sources appear inside folders field is source-level: each folder remains separate, while Tabs switches between source views and Rows presents every source as its own stacked content row after that folder is opened. Compact CSS-only decorative previews show a selected All/Source tab bar with one poster grid for Tabs and two labelled poster rows without a tab bar for Rows. The title and helper text remain authoritative. With Tabs and Include an All tab when using Tabs enabled, folders containing two or more sources gain an All tab combining their sources; one-source folders do not show it. Rows shows no tabs, but the same enabled switch remains editable as the saved preference for a later return to Tabs.

Opening and cancelling are UI-only. Applying an unchanged form is also a controller-free no-op. Actual edits retain selection and rely on the controller for the dirty flag and one revision increment. While settings are open, the workspace underlay is visibly dimmed, conditionally blurred, `inert`, and inaccessible to pointer and keyboard actions, including movement. Focus enters the Title field, remains contained in the dialog, and returns to the exact Edit trigger; Escape safely cancels, backdrop clicks do not discard, and body scrolling is locked. Hide everywhere blanks and disables Title while retaining valid visible text only in modal state; returning to the original visible choice is a no-op. Imported absent, unsupported, Follow Layout, Square, repeated U+200E, focus-glow, and unusual presentation values remain untouched until deliberate canonical replacement.

## Diagnostics and migration status

The first current operation error appears in one inline `role="alert"` area with its stable message and optional code. Successful-import warnings appear separately in a collapsed, bounded native details element. The workspace does not render raw imported JSON or historical diagnostic dumps.

Migration remains non-interactive. The shell shows a small notice only when preview status is `available` or `blocked`. There is no migration action, automatic migration, or raw migration diagnostic display. The settings modal contains only bounded known fields and local diagnostics.

## Accessibility

- one page-level `h1` and logical panel/detail headings;
- ordinary semantic lists with real selection buttons;
- semantic presentation fieldsets with native radio buttons and labelled switches;
- one named modal dialog with contained focus, safe Escape cancellation, inert background, and exact trigger focus restoration;
- one always-visible entity-owned Edit action with hidden-title-specific accessible labels;
- entity-specific `Reorder …` labels plus a hidden keyboard instruction;
- one aligned disabled handle when the current sibling or pin group has no valid movement;
- focus retained on the moved card's handle;
- one visually hidden polite status region for concise successful movement announcements;
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
- `data-action="reorder-collection|reorder-folder|reorder-source"`
- `data-hierarchy-card="source"`
- `data-card-layout="collection|folder|source"`
- `data-reorder-main-card="collection|folder|source"`
- `data-reorder-drag-overlay="true"`
- `data-drag-placeholder="true"`
- `data-movement-status="true"`
- `data-action="apply-node-edit|cancel-node-edit"`
- `data-import-control="file|pasted-json"`
- `data-node-type="collection|folder|source"`
- `data-node-editor="collection|folder"`
- `data-settings-modal="true"`
- `data-settings-modal-backdrop="true"`
- `data-workspace-underlay="true"`
- `data-editor-field="title|hideNuvioTitle|folderTitleVisibility|viewMode|showAllTab|pinToTop|focusGlowEnabled|tileShape"`
- `data-editor-choice="tabs|rows|show-everywhere|hide-home-screen|hide-everywhere|poster|landscape"`
- `data-editor-control="hideNuvioTitle|showAllTab|pinToTop|focusGlowEnabled"`
- `data-return-confirmation="true"`
- `data-action="stay-in-workspace|discard-and-return|create-collection-empty|create-folder-empty"`
- `data-editor-lock="true"` while editing

Accessible text, semantic roles, and button state remain the primary testing surface.

The Pages deployment workflow, workflow triggers, permissions, deployment environment, dependencies, and lockfile remain unchanged. The Nuvio validation workflow only moved its existing builder dependency installation ahead of `check-all.mjs`, because the UI tests load the existing React and Vite packages. Publishing behaviour is unchanged.

## Deliberate exclusions

The current hierarchy milestone does not add project-title editing, source creation/editing, export, save/download, copy JSON, persistence, storage, routing, browser history, migration actions, deletion, bulk movement, context menus, undo/redo, network import, TMDB search, addon loading, artwork, focus GIF, cover, logo, backdrop, or hero controls, accounts, authentication, templates, recipes, language support, Ultra MAX, AIO Metadata, Trakt, v1 runtime changes, Worker changes, Pages allowlist changes, Pages deployment workflow changes, or dependencies. Future focus-GIF support defaults off unless deliberately enabled.

## Next mandatory gate

Issue #59's implementation is committed and pushed at `326efe0bf78ee095f1d9efd5420b18d509d5c14f`. Dave's local UI/flow review and the bounded Nuvio Desktop, web, mobile, and TV ordering evidence gate are complete; the deterministic repository evidence is under [`manual-tests/nuvio-clients/issue-59-builder-reordering/`](../../manual-tests/nuvio-clients/issue-59-builder-reordering/). This evidence-only follow-up changes no Builder UI/controller code or production behavior. No pull request exists, and PR creation still requires Dave's separate approval. Search/Add is the recommended next focused product issue after issue #59 is reviewed and integrated; source creation has not begun here.
