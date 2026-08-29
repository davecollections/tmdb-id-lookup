# Builder UI Shell and Hierarchy Navigator

Status: current Builder shell includes hierarchy creation through closed issue [#126](https://github.com/davecollections/tmdb-id-lookup/issues/126) / merged [PR #127](https://github.com/davecollections/tmdb-id-lookup/pull/127) at `10a76aeffd351341321ab56658e69858fb85d39c`, after owner Worker deployment, live sorted-Preview validation, and owner review

Last reviewed: 2026-08-20

## Purpose and scope

The first visible workspace replaced the deployment placeholder under `/builder/`. Issue [#41](https://github.com/davecollections/tmdb-id-lookup/issues/41) now places a welcome/import screen in front of this contained hierarchy workspace. The visible product name is **TMDB Collection Builder**, with **Built for Nuvio collections** as its supporting line.

The shared architecture and interaction rules for current and future New Collection/New Folder families are in [`BUILDER_HIERARCHY_CREATION.md`](./BUILDER_HIERARCHY_CREATION.md). This document records how those flows fit into the workspace shell.

The workspace displays ordered collections, the selected collection's ordered folders, and the selected folder's ordered sources. It can create draft collections and folders through existing controller actions. Issue [#43](https://github.com/davecollections/tmdb-id-lookup/issues/43) makes collection/folder Nuvio-facing IDs automatic and hidden. Issue [#53](https://github.com/davecollections/tmdb-id-lookup/issues/53) uses one entity-owned Edit action and one responsive settings modal for titles and contained presentation fields, documented in [BUILDER_NODE_EDITING.md](./BUILDER_NODE_EDITING.md). Issue [#59](https://github.com/davecollections/tmdb-id-lookup/issues/59) adds compact pointer/touch and keyboard reordering to every existing collection, folder, and source card and removes the deferred Selection details summary. Issue [#63](https://github.com/davecollections/tmdb-id-lookup/issues/63) adds persistent bottom Add actions for populated collection/folder lists plus safe collection, folder, and source deletion. Issues #65, #74, #92, #98, #104, and #110 provide the six ordered selected-folder Add Source modes: Movie franchise, People, Studios, Networks, Streaming service, and Genres. Issue #113 adds the contextual Blank/Decades New Collection/New Folder flow; issues #118, #122, and #124 add People, Franchises, and Studios to both scopes while retaining their separate Add Source behavior, and issue #126 applies the same separation to Networks. Issue #78 established preservation-safe physical-source editing for Movie Collection and People; the current fail-closed registry also supports Studio, Network, Decade, Genre, and simple Streaming sources. Unsupported shapes remain Delete-only. Import is documented separately in [BUILDER_WELCOME_IMPORT.md](./BUILDER_WELCOME_IMPORT.md). Logical multi-source editing, bulk settings, export, persistence, and migration application remain deferred.

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

The project, revision, hierarchical selection, dirty flag, migration preview, and diagnostics remain controller-owned. React does not mirror the project into `useState`, copy the project into component-local state, or mutate a frozen snapshot. Only screen/modal presentation, browser import transport, interaction lifecycles, and uncommitted settings, contextual-creation, Add Source, source-edit, and diagnostic state use local React state.

## UI module structure

```text
builder/src/ui/
  BuilderApp.jsx              subscribed welcome/workspace presentation boundary
  BuilderWelcome.jsx          welcome, file selection, pasted text and diagnostics
  BuilderWorkspace.jsx        semantic hierarchy workspace rendering
  AddSourceDialog.jsx         shared responsive TMDB movie-franchise Search/Add modal
  MovieCollectionPicker.jsx   reusable collection search/details picker for Add/Edit flows
  SourceEditorDialog.jsx      dedicated preservation-safe physical-source editor
  add-source-modal-lifecycle.js exact Visual Viewport geometry and reversible body lock
  add-source-navigation-state.js pure Search/Review return-state preservation
  HierarchyActionsMenu.jsx    reusable in-card Edit/Delete overflow menu
  DeleteConfirmation.jsx      focused hierarchy deletion dialog
  NodeEditor.jsx              single responsive collection/folder settings modal
  node-editor.js              pure title/presentation draft, validation, and minimal-patch helpers
  node-editor-actions.js      public controller update delegation
  modal-focus.js              dialog entry, containment, Escape, and focus-wrap helpers
  import-actions.js           public-controller-only browser transport helpers
  responsive-viewport.js      shared 900px viewport hook and reduced-motion scroll helper
  hierarchy-reordering.js     visible sibling mapping, labels, and controller delegation
  hierarchy-deletion.js       pure impact, confirmation, recovery, and one-shot delegation
  hierarchy-menu-placement.js visible-viewport resolution and anchored-menu geometry
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

`All collections` calls `clearSelection()`. The source-level back control selects the parent collection. Selecting `Show folder details` selects the current folder and clears only source selection. The hierarchy shell itself does not add URL routes or browser-history state; scoped mobile Genre context/catalogue subflows use browser history only within their task surface.

Creation is viewport-aware only at this UI layer. At the established 900px desktop breakpoint and above, creating a collection still selects it and exposes Folders, while creating a folder still selects it and exposes Sources. Below 900px, collection creation leaves the user on Collections without selecting the new card, and folder creation retains the selected parent collection while leaving the user on Folders. Repeated mobile creation therefore needs no back-navigation. Ordinary card selection and Edit continue to target each created node normally.

## Selection semantics

Collection, folder, and source list entries are real buttons inside ordinary semantic lists. Selection calls `controller.selectNode(internalId)`. React keys use builder-only `internalId`, but internal IDs are not displayed as user content.

Selected buttons use `aria-pressed`, visible accent treatment, and hidden selected text so selection is not communicated by colour alone. The source list preserves the exact authoritative source order and labels each row from the source's explicit `native-tmdb`, `addon`, or `opaque` category.

Every collection and folder uses one shared visual card ordered as a 46px six-dot grip, flexible selectable title/details/navigation body with chevron, and a 46px vertical-dots overflow trigger. Sources use grip, flexible identity body, and the same overflow trigger without a chevron. Collection/folder menus contain Edit and Delete. A source resolved by the fail-closed editor registry contains Edit source then Delete; every unsupported native, addon, or opaque source menu contains Delete only. The former external Edit/Delete rail is absent. The grip alone begins dragging, the card body remains navigation, and the trigger is an independent sibling control inside the same visual background. Single-item handles stay internally aligned but disabled. Long titles use safe display fallbacks and a bounded two-line treatment.

Folder and source visible order is their authoritative array order. Collections display the stable `pinToTop: true` group before the stable ordinary group; absent, false, and unusual preserved pin values remain in the ordinary group. Each view item retains both its group-relative movement position and its overall zero-based visible-list position. Pointer destinations clamp to the current sibling/pin group, so crossing the pin boundary never suggests or changes pin state. The pure movement helper maps either the adjacent keyboard destination or final pointer destination back to the authoritative raw-array index before calling `controller.moveNode(internalId, targetIndex)` once, while successful pointer announcements use the overall one-based visible-list position. This covers interleaved imported collection arrays where visible and raw neighbours differ without adding ordering metadata, exposing raw indexes, or adding a second movement implementation. Stable internal IDs preserve selection and keyed card identity.

Pointer Events start only from the handle and use a 6px vertical threshold. Before creating a pointer session, the handle must successfully establish Pointer Capture and confirm it where the API supports confirmation. Capture failure declines that gesture without creating an overlay, changing data, or disabling later keyboard operation; no handle-local drag is allowed to continue without reliable move/up/cancel delivery. Crossing the threshold creates a fixed-position, pointer-inert clone of the complete measured hierarchy row above panel clipping. Menu panels are removed from the clone and every cloned control is inert and untabbable. The clone retains the original pointer-grab offset and exact row width/height while following vertical movement. The source row becomes a same-sized provisional placeholder that moves to the proposed position, and crossed siblings shift into the opened space with a restrained 150ms FLIP-style transform. A full-row insertion line remains secondary emphasis rather than the only feedback.

Hover geometry and provisional transforms never call the controller. A changed pointer-up settles the overlay toward the measured placeholder and then performs one authoritative move. Same-position drop settles back without a move. While the pointer session exists—including its 150ms settle—selection/mobile back, Edit, creation, workspace return, root navigation, another reorder start, and keyboard-mode entry are ignored. The active handle is not disabled during capture. Escape remains able to cancel an active non-settling gesture; pointer cancellation, lost capture, or Escape removes the fixed overlay, placeholder, sibling transforms, and body grabbing state without changing data or revision. Completion or cancellation clears the session before normal interaction resumes. Under reduced motion, the overlay and placeholder remain complete while sibling and settle transitions are effectively removed. Auto-scroll applies a bounded vertical window step near the viewport edges and target calculation uses document-space measurements so scrolling does not corrupt the destination; normal page scrolling remains available everywhere outside the handle because `touch-action: none` is scoped to the handle only.

The same focusable handle supports keyboard reordering without permanent arrow controls. Enter or Space starts or ends keyboard mode, Arrow Up and Arrow Down each perform at most one valid adjacent movement, and Escape exits. A hidden instruction is associated with every handle, the live region announces successful movement, and focus returns to the moved item's handle.

## Draft creation

`createDraftCollection(controller)` chooses the next unique `Untitled Collection` title, supplies the explicit manual defaults Tabs, All enabled, Pin off, and focus glow on, then delegates automatic Nuvio ID creation to the controller.

`createDraftFolder(controller, collectionInternalId)` chooses the next unique `Untitled Folder` title, supplies Poster and `hideTitle: true` as the explicit manual defaults, then delegates automatic Nuvio ID creation to the controller. Hide on home screen only is therefore selected for a newly created blank folder; the actual folder title remains visible when the folder is opened.

Both helpers use only `getState()` and public controller actions. They never derive an internal ID or alter imported IDs. Their UI-only `selectCreated` option defaults to the established desktop behavior and selects only after creation succeeds; mobile callers disable that convenience without changing the controller creation contract. They return the controller's structured result with the successful `createdInternalId`. Collection creation does not create a folder, and folder creation does not create a source.

Issue #113 routes every existing `New collection` and `New folder` entry point through one contextual **What would you like to create?** dialog. The small ordered registry exposes **Blank**, **Decades**, **People**, **Franchises**, **Studios**, then **Networks**, with explicit per-scope support and fail-closed unknown-family handling. Blank immediately delegates to the exact existing draft helper and therefore preserves the defaults, naming, desktop selection, mobile level, and card-scrolling behavior above without adding a naming or review step.

Decades uses one responsive three-stage task surface: initial catalogue-ordered preset multi-select with dynamic Select all/Clear all, progressively disclosed configuration, and exact hierarchy review. Configure and Review retain a bounded selected-Decades summary. New Collection alone can choose separate/mixed Both layout and edit proposed collection names at Review; New Folder captures the current collection and inherits its presentation. Review composes one shared always-visible **Title options** section immediately above direct **Layout** controls, followed by **Folder options** and collapsed details. The existing collection-title switch, three folder-title outcomes, Tabs/Rows, pin, defaults, duplicate behavior, and atomic application remain; the cross-family owner correction hides Show All for Rows and normalizes Rows hierarchy output to `showAllTab: true`. The visible current-Decade mode chooser is absent; when current-Decade Individual years are selected, the visible adapter supplies full-Decade generation. Genre controls appear only with Genre breakdown, and Advanced remains collapsed by default. Genre configuration reuses one official catalogue with All-selected plus per-Decade contexts and an inline required-state error. The Ordering section exposes one three-preset Display order control when relevant, plus independent Source grouping only when Movies and Series physically share a folder; each choice has a small schematic preview. Review mounts collection/folder summaries rather than hundreds of source rows, while all totals and status outcomes come from the concrete #112 plan. Apply revalidates and commits that exact plan once. Cancel and Back are mutation-free, focus stays contained, no browse/configure text field auto-focuses, the workspace is inert, and the shared body/Visual Viewport lock applies at the existing 900px boundary.

People reuses that same modal lifecycle but keeps its People-specific search/provider/result cards and source controls. Search may receive focus only after the user explicitly chooses People (including the compatibility shortcut). Ordered selection has no hard maximum; each full result card remains clickable and contains a focusable native checkbox represented by a circular empty/filled-tick indicator, one compact count/action summary opens a collapsed bounded removable list, and at 50 it shows a nonblocking informational notice. Configure loads details only for selected people, exposes only Automatic and Same for all, and keeps every selected person visible in one ordered bounded compact list that consumes the available vertical space. All four source pills stay visible in the shared control and in every person row; an individual edit records an internal override without changing the visible strategy, while later shared changes affect unmodified people and preserve explicit overrides. The shared three-option People sort drives all generated sources; Most votes remains absent because it has no retained `PERSON`/`DIRECTOR` contract evidence. Each row may open one centred body-portalled poster-only title-preview modal on the shared nested layer above creation, bounded to 10 posters at every viewport with phone 5×2 layout, focus containment, Close/Escape/exact-trigger restoration and loading/empty/retry states. No dropdown or expanded person editor is mounted. Review shows ordinary hierarchy counts, then one shared **Title options** section followed by direct **Layout** controls for New Collection. Title options contain collection title visibility plus the three existing generated-folder outcomes with **Hide on Home screen only** selected by default; Layout contains Tabs/Rows, Tabs-specific Show All, and Pin. Rows hides Show All and retains `showAllTab: true`. New Folder exposes only the same generated-folder title outcomes, shows captured inherited presentation with `parent unchanged`, and never patches the parent. Both scopes expose one shared Poster/Landscape control for generated folders and concise guidance that all remaining artwork uses canonical defaults and can be customised later through ordinary Folder editing; only the potentially large person detail remains collapsed. Neutral status rows distinguish ready, destination complete/partial, and elsewhere outcomes. Create applies one revalidated atomic family plan. Add Source → People continues using its Search → Configure path without Review or hierarchy duplicate policy.

The visually hidden native checkbox is positioned within its result-card label rather than the outer creation shell. A partially clipped result can therefore receive pointer or keyboard focus without moving the fixed dialog, document, or sticky Configure action; browser-native focus visibility belongs to the inner result scroll owner. Selection, disclosure open/close, removal, and reselection retain the same ordered semantics.

Franchises reuses the existing TMDB Collection provider and exact ID/URL parser without creating another client. Its two-stage **Select → Review & Appearance** flow intentionally does not auto-focus Search. Ordered full-card checkbox selection has no cap, uses a compact count and bounded removable disclosure, and shows a nonblocking notice at 50. Each selected canonical TMDB Collection creates one folder and one fixed `COLLECTION`/`MOVIE` source; Collection, Saga, Trilogy, and leading-The wording remains unchanged. Optional contained-title previews use the shared centred body-portalled nested layer and are bounded to 10 posters at every viewport, including the phone 5×2 layout. Review reuses shared title/layout/folder presentation controls, fixes generated folders to Poster with the TMDB Collection poster or safe emoji fallback, exposes no shape selector, shows New Folder parent presentation read-only, omits exact destination Collection IDs, keeps elsewhere matches addable, and commits one revalidated atomic plan. Add Source → Movie franchise remains separate.

Studios and Networks both use **Select → Configure → Appearance** so their directly visible selected-entity rows, shared sort, placement, Preview, and remove actions stay in Configure while Appearance remains presentation-only. Both use ordered uncapped catalogue selection, explicit-only Discover Preview, transient learned totals, pre-resolved artwork, logical destination omission, and one stale-revalidated atomic batch. Their family contracts remain distinct: Studios may create Movie and/or Series sources with fixed Landscape Company artwork, while Networks creates one generic Series source per folder and exposes a batch Poster/Landscape choice with exact-orientation Network artwork. Selected-folder Add Source remains a separate single-entity operation for both. See [`BUILDER_STUDIOS.md`](./BUILDER_STUDIOS.md) and [`BUILDER_NETWORKS.md`](./BUILDER_NETWORKS.md).

After successful mobile creation, the new card is scrolled into view when practical. The scroll uses smooth behavior unless `prefers-reduced-motion: reduce` is active, in which case it uses immediate behavior. Scrolling and hierarchy-level suppression are local presentation state and add no project revision.

The existing panel-header `New collection` and `New folder` controls remain. An otherwise distinct real button appears below the final populated collection or folder card as `+ Add another collection` or `+ Add another folder`. These buttons open the same contextual launcher as their header and empty-state counterparts. Choosing Blank then uses the exact existing defaults, automatic naming, viewport-aware selection, and card scrolling. They are not list items, cards, reorder siblings, or drag targets. Empty panels retain their larger first-item Add control.

When a folder is selected, Sources exposes `Add source` in the header, `Add first source` in the empty state, or `+ Add another source` after a populated list. On mobile, the count is part of the `Sources · N` heading so Add source retains room; desktop retains the separate count badge. No disabled or ambiguous Add action appears without a selected folder. All three entry points open the same responsive mode picker for seven ordered modes: Movie franchise, People, Studios, Networks, Streaming, Genres, and singular Decade. The picker shares the Creation launcher's narrow card/icon presentation seam, responsive grid, and focus-visible language while retaining immediate-action buttons with no Blank option or selection state. One compact heading disclosure covers the common TMDB provider. Each child flow has visible Back navigation and preserves its own reviewed state; returning restores focus to the family card that launched it. The shared mobile Genre context/catalogue shell uses scoped browser history so browser Back returns from detail to context. Family-specific construction, duplicate, request, and review contracts remain in their focused Builder documents.

## Safe hierarchy deletion

Every rendered collection, folder, and source row exposes Delete through its in-card menu. The trigger is named `Actions for <type> “<safe name>”`, has menu semantics and expanded state, opens with pointer or Enter/Space, focuses its first item, supports Arrow keys, and closes on Escape/outside press with exact trigger restoration. Only one menu can be open. It closes on action, selection change, target removal, modal opening, and completed deletion. Opening it exits keyboard reorder; background hierarchy controls lock while it is open.

The open menu is portalled to `document.body` and fixed below the modal layer so card/panel overflow and transformed hierarchy rows cannot clip it. After mount, the trigger rectangle and full rendered menu dimensions are measured against `window.visualViewport` bounds, including `offsetTop` and `offsetLeft`; `innerWidth`/`innerHeight` at origin zero are the fallback. The pure placement helper opens down only when the complete menu fits, otherwise flips up when possible, chooses the roomier direction when neither is ideal, and clamps both axes to a 10px visible-viewport margin. Placement is applied before first-item `focus({ preventScroll: true })`, so opening a final or second-last visible card does not scroll the page merely to reveal Edit or Delete. Window/visual-viewport resize or scroll safely closes the menu, while Escape and outside press retain exact trigger focus restoration.

`buildDeletionImpact(state, internalId)` is the pure UI boundary for destructive decisions. It resolves the target type/name, parent and visible siblings, descendant folders, active sources, imported `sources` evidence, legacy `catalogSources`/projection evidence, honest confirmation copy, and intended recovery before mutation. Empty collections and folders without active/imported source evidence delete immediately. Collections containing any folder and folders containing active/imported/legacy source data require confirmation. Every source deletion confirms with `This source will be permanently removed from this folder.` Projection-only imported folders are never presented as empty.

The confirmation is one semantic modal dialog over the same inert/dimmed workspace pattern as settings. Cancel receives initial focus, Escape cancels, backdrop clicks do not discard, and Cancel restores the exact overflow trigger without controller activity or revision. The destructive submit is specifically labelled `Delete collection`, `Delete folder`, or `Delete source`; there is no “Do not ask again” bypass, and a one-shot gate prevents repeated submission.

Successful deletion calls only `controller.removeNode(internalId)` for project mutation. The existing controller/domain removal path removes exactly that subtree and advances project revision once. If current selection was inside the deleted subtree, a selection-only controller call then chooses the next visible same-level sibling, previous sibling, or parent; final collection deletion clears selection. Collection recovery uses the complete pinned-then-ordinary visible order. When selection was outside the deleted subtree it is retained. Selection recovery never advances project revision.

Mobile stays at the deleted level when a sibling survives and returns to the appropriate parent/empty level only when none does. Focus goes to the nearest surviving sibling's primary card control, then the relevant populated/empty Add action, or the parent/back control for a final source. A separate polite live region announces the successful entity deletion. Serializer output is rebuilt from the surviving hierarchy: deleting an addon source removes its matching compatibility projection, unrelated projections retain values/order, unknown/community evidence outside the removed subtree is preserved, and no deletion metadata enters Nuvio JSON.

Contextual creation, menus, quick rename, deletion, Add Source, and source editing share the existing navigation/pointer gate. They are disabled or ignored while settings, contextual creation, Add Source, source editing, delete confirmation, return confirmation, another menu, or a pointer reorder session—including its 150ms settle—exists. Opening Add Source or Edit source closes the active menu and exits keyboard reorder mode.

## Read-only source display

Native TMDB sources prefer an editable title, then the TMDB source type, then `TMDB source`. Addon sources prefer an editable title, catalog ID, addon ID, then `Addon source`. Opaque sources use an editable title when available and otherwise `Preserved source`. Source cards retain the known identity metadata needed to distinguish them without exposing raw imported objects.

Titles made only of the confirmed U+200E character display `Hidden title` with an `Invisible in Nuvio` badge and meaningful selection, Edit, and movement names instead of producing blank cards or labels. Unusual source-title values fall back to the existing source identity labels rather than being stringified. The hierarchy no longer renders a selected-node detail panel; detailed review remains deferred to the future Create JSON/review workflow.

The UI never renders full raw JSON, arbitrary unknown/community fields, serializer output, migration projections, exception objects, stack traces, or builder internal IDs.

## Native source editing

Issue #78 makes the first two proven native source families editable without changing the source card or controller model. `Edit source` opens a dedicated body-portalled modal for the exact physical source selected by builder-only `internalId`. The heading, folder context, and identity summary distinguish the target without exposing raw imported data.

Movie Collection editing prepopulates title and current TMDB collection ID offline. Only `Choose another franchise` mounts the reusable collection search/details picker. Selecting a result changes only the draft, immediately uses its canonical TMDB name as Title, displays the readable name before secondary ID metadata, and enables a reset after custom typing. Provider, `COLLECTION`, `MOVIE`, sort, and filters remain fixed. People editing opens immediately with a fixed person ID and four Acting/Directing × Movie/Series choices. Approved default titles auto-follow until typing makes them custom; **Use default title** restores syncing. The editor also exposes the stable-v1 Popular/Recent/Top-rated sort values and preserves untouched imports, while a shared bounded non-blocking count request/cache supplies all four title counts with sanitized Retry and no artwork request.

The dedicated source editor uses natural content height on desktop/tablet, capped against the viewport so its attached action footer remains visible and only the content region scrolls when necessary. Mobile remains an intentional full-height task surface below 900px with the established sticky header/footer, single scroll owner, body lock, safe-area padding, Visual Viewport tracking, and virtual-keyboard handling. Short Collection editors therefore avoid inherited Add Source empty space without changing the reviewed 360–412px mobile shell.

Title and sort patches are difference-only, so opening/saving does not coerce imported null, absent, invisible, mixed-case, or unusual values. An identity change that would duplicate another source in the same folder is rejected; title-only and sort-only edits remain possible in a folder that already contains duplicate imported identities. Duplicate, validation, and stale errors use a prominent bordered alert that is scrolled/focused after failed Save while the draft remains intact. Cancel, an unchanged save, validation failure, duplicate rejection, and stale-session conflict perform no controller mutation. A real save delegates one minimal patch through `controller.updateNode`, advances one revision, retains source order and selection, closes the modal, focuses the exact source card, and announces the result politely.

Issue #92 adds desktop-only double-click convenience to primary hierarchy cards. Collection and Folder cards open their existing settings editor, while an editable Source opens its registered physical-source editor. Single click remains selection/navigation; drag handles, actions-menu controls and descendants matching button/link/form/contenteditable semantics are excluded. The three-dot Edit action remains the explicit and touch-safe route.

Issue #113 adds a fail-closed Decade adapter before Genre ownership. Canonical supported periods expose Source name, the four semantic sorts, and only rating/vote/language/country/media-compatible exclusion controls. Period, media, and included Genre are visible fixed context; no From/To year controls appear. Saving retains the existing exact-source binding, duplicate/stale checks, minimal patch, focus restoration, and one-revision controller behavior.

Opening binds the immutable project reference, collection/folder/source IDs, source index/category, adapter, and original identity. Save refuses to merge if that source was deleted, moved, reordered, reclassified, changed externally, or the project changed. The editor never edits logical bundles or addon projections. The full architecture, preservation contract, and evidence boundary are in [BUILDER_SOURCE_EDITING.md](./BUILDER_SOURCE_EDITING.md).

## Collection and folder editing

Every collection and folder card exposes Edit as the first item in its in-card overflow menu. Edit directly targets its exact collection or folder, including when another node was selected, without advancing project revision or dirty state. Folders and Sources headers contain no desktop parent-edit duplication; panel headers own only title, count, and their relevant creation action. Registered editable source menus expose Edit source; unsupported sources remain Delete-only.

Below 900px, the selected collection context above Folders and the selected folder context above Sources each include one 44px pencil action named from the same safe fallback. It opens the same NodeEditor in rename-only mode: Title, collection `Hide collection title in Nuvio` or folder `Hide folder title everywhere in Nuvio`, diagnostics, Apply, and Cancel. It omits layout, pin, focus glow, shape, and full visibility radio cards. Turning the folder switch off restores the draft's original supported `SHOW_EVERYWHERE` or `HIDE_HOME_SCREEN` state. The pencil is hidden at desktop widths and locked with menus, modals, return confirmation, and pointer reordering.

Edit opens one modal dialog shared by collections and folders. The ordinary rename path is its initially focused Title field when Title is enabled; supported non-empty visible text is selected once on opening so immediate typing replaces it, without later rerenders or validation refocus selecting it again. It edits title plus the approved visible presentation fields, including explicit U+200E collection/folder title hiding. Collection-level `focusGlowEnabled` remains recognised, defaults to true for manual blank collections, and preserves imported missing/true/false/unusual values, but issue #69 removes its user-facing control. Folder settings place Title in **Basic details**, then place one compact Folder title visibility radio group and Tile shape visual cards in **Display**. The visibility options remain Show everywhere (visible title plus `hideTitle: false`), Hide on home screen only (visible title plus `hideTitle: true`), and Hide everywhere (exactly one U+200E plus `hideTitle: true`). The modal keeps Nuvio IDs and builder `internalId` hidden and stable, validates title intent, and creates a minimal changed-field patch for `controller.updateNode`.

The **How sources appear in this collection** field is source-level: each folder remains separate, while **Tabs (recommended)** switches between source views and Rows presents every source as its own stacked content row after that folder is opened. Compact CSS-only decorative previews show a selected All/Source tab bar with one poster grid for Tabs and two labelled poster rows without a tab bar for Rows. The title and helper text remain authoritative. With Tabs and Include an All tab when using Tabs enabled, folders containing two or more sources gain an All tab combining their sources; one-source folders do not show it. For shared hierarchy creation, Rows hides the irrelevant Show All control and keeps the saved preference enabled for a later return to Tabs. The visible label does not change the stored `TABBED_GRID` value. Ordinary manual editing retains its own preservation-first semantics.

Opening and cancelling are UI-only. Applying an unchanged form is also a controller-free no-op. Actual edits retain selection and rely on the controller for the dirty flag and one revision increment. While settings are open, the workspace underlay is visibly dimmed, conditionally blurred, `inert`, and inaccessible to pointer and keyboard actions, including movement. Focus enters the Title field, remains contained in the dialog, and returns to the exact Edit trigger; Escape safely cancels, backdrop clicks do not discard, and body scrolling is locked. Hide everywhere blanks and disables Title while retaining valid visible text only in modal state for restoration; returning to the original visible choice is a no-op. Imported absent, unsupported, Follow Layout, Square, repeated U+200E, focus-glow, and unusual presentation values remain untouched by unrelated edits. Ordinary Folder settings organize visible controls into **Tile**, **Hero / Background**, **Branding**, and **Focus**: Tile artwork; Backdrop Image; Title Logo; and Focus artwork plus its switch. Known `coverEmoji` stays hidden and preserved. `heroVideoUrl` is also hidden for ordinary absent, blank, or unusual unsupported values and appears only as fixed-for-the-session compatibility UI when a supported nonblank value exists at opening. Image/GIF previews render the exact current draft URL with native no-referrer loading and shape-appropriate frames; compatible video creates no element or request until explicitly previewed and never autoplays. Exact-URL failures are nonblocking and retryable, previews never mutate the draft or project, and Cancel/Apply retain preservation-first semantics. This adds no ordinary video action, media picker, runtime lookup, suggestion, identity inference, proxy, download, or schema field and leaves untouched unusual values intact.

## Diagnostics and migration status

The first current operation error appears in one inline `role="alert"` area with its stable message and optional code. Successful-import warnings appear separately in a collapsed, bounded native details element. The workspace does not render raw imported JSON or historical diagnostic dumps.

Migration remains non-interactive. The shell shows a small notice only when preview status is `available` or `blocked`. There is no migration action, automatic migration, or raw migration diagnostic display. The settings modal contains only bounded known fields and local diagnostics.

## Accessibility

- one page-level `h1` and logical panel/detail headings;
- ordinary semantic lists with real selection buttons;
- semantic presentation fieldsets with native radio buttons and labelled switches, including a compact named Folder visibility group and checked visual tile-shape cards;
- named modal dialogs with contained focus, safe Escape cancellation, inert background, and exact trigger focus restoration;
- one responsive Add Source mode chooser plus six family-specific, focus-contained staged flows with visible Back navigation and family-specific validation and duplicate handling;
- one safe-name in-card overflow trigger on every hierarchy row;
- one Edit/Delete menu for collections/folders, Edit source/Delete for supported source families, and Delete-only menus for unsupported sources;
- one dedicated source-edit dialog with fixed identity context, labelled controls, first-error focus, exact-trigger restoration, and a polite save status;
- one mobile-only safe-name selected-context rename pencil for collections/folders;
- one safe non-empty deletion dialog with Cancel-first focus and exact trigger restoration;
- entity-specific `Reorder …` labels plus a hidden keyboard instruction;
- one aligned disabled handle when the current sibling or pin group has no valid movement;
- focus retained on the moved card's handle;
- one visually hidden polite status region for concise successful movement announcements;
- one visually hidden polite status region for successful deletion announcements;
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

The default layout is mobile-first and has been designed for the required 360, 384, 393, 402, and 412px widths. A wider single-panel drill-down remains active at 768px. The three-panel layout starts at 900px and is intended for the required 1024px and 1280px desktop checks. Below 900px, Add Source and Edit source use isolated top-level portals with an opaque layout-viewport guard plus an opaque four-safe-edge task surface sized to the Visual Viewport; critical body lock, geometry, listeners, and focus are established in a pre-paint layout effect. They track Visual Viewport offsets and dimensions through keyboard resize/scroll changes and restore the exact prior body style, class, and scroll state when closed. The mobile Add Source poster has a responsive 180–220px maximum, can shrink further in short keyboard-height viewports, moves beside the editable content when short landscape width permits, preserves aspect ratio, and is not cropped. Source-edit fields and actions collapse to one column at 420px and below. From 900px, both flows retain intentional centered bounded desktop dialogs. The responsive creation hook uses that same 900px media query rather than adding viewport logic to the controller or domain.

The palette uses deep blue-black page and panel surfaces with restrained cyan and green accents, quiet separators, limited gradients, and compact elevation. It deliberately avoids a marketing hero, warm styling, excessive pills, dense dashboard decoration, external fonts, and copied third-party layouts.

## Stable DOM markers

Deployment and focused source tests use a small stable surface:

- `data-builder-root="true"`
- `data-builder-welcome="true"`
- `data-builder-shell="true"`
- `data-panel="collections|folders|sources"`
- `data-panel-header="collections|folders|sources"`
- `data-action="start-new-project|import-file|import-pasted-json|create-collection|create-folder|return-builder-home|open-about-credits"`
- `data-action="edit-collection|edit-folder"`
- `data-action="open-collection-actions|open-folder-actions|open-source-actions"`
- `data-action="delete-collection|delete-folder|delete-source"`
- `data-action="edit-source|save-source-edit|cancel-source-edit|back-to-source-edit"`
- `data-action="create-collection-after-list|create-folder-after-list"`
- `data-action="add-source|add-source-empty|add-source-after-list"`
- `data-action="apply-add-source|add-source-anyway|cancel-add-source"`
- `data-action="back-to-source-search|toggle-contained-titles"`
- `data-action="reorder-collection|reorder-folder|reorder-source"`
- `data-hierarchy-card="source"`
- `data-card-layout="collection|folder|source"`
- `data-reorder-main-card="collection|folder|source"`
- `data-reorder-drag-overlay="true"`
- `data-drag-placeholder="true"`
- `data-movement-status="true"`
- `data-deletion-status="true"`
- `data-action="apply-node-edit|cancel-node-edit"`
- `data-import-control="file|pasted-json"`
- `data-node-type="collection|folder|source"`
- `data-node-editor="collection|folder"`
- `data-editor-mode="settings|rename"`
- `data-quick-rename="collection|folder"`
- `data-settings-modal="true"`
- `data-settings-modal-backdrop="true"`
- `data-delete-confirmation="collection|folder|source"`
- `data-delete-modal-backdrop="true"`
- `data-add-source-modal="true"`
- `data-add-source-modal-backdrop="true"`
- `data-source-edit-modal="true"`
- `data-source-edit-backdrop="true"`
- `data-source-edit-adapter="movie-collection|people|studio|network|decade|genre|streaming"`
- `data-source-edit-picker="movie-collection"`
- `data-source-edit-status="true"`
- `data-add-source-step="search|review|configure|region|provider|browse|configure-review"`
- `data-source-mode="tmdb-movie-franchise|tmdb-people|tmdb-studios|tmdb-networks|tmdb-streaming-services|tmdb-genres|tmdb-decade"`
- `data-creation-dialog="true"`
- `data-creation-scope="new-collection|new-folder"`
- `data-creation-option="blank|decades|people|franchises|studios|networks"`
- `data-source-creation-status="true"`
- `data-workspace-underlay="true"`
- `data-editor-field="title|hideNuvioTitle|folderTitleVisibility|viewMode|showAllTab|pinToTop|tileShape|coverImageUrl|heroBackdropUrl|heroVideoUrl|titleLogoUrl|focusGifUrl|focusGifEnabled"` (`heroVideoUrl` appears only for a supported nonblank opening value)
- `data-editor-choice="tabs|rows|show-everywhere|hide-home-screen|hide-everywhere|poster|landscape"`
- `data-editor-control="hideNuvioTitle|showAllTab|pinToTop"`
- `data-return-confirmation="true"`
- `data-action="stay-in-workspace|discard-and-return|create-collection-empty|create-folder-empty"`
- `data-editor-lock="true"` while editing
- `data-delete-open="true"` while confirming destructive deletion
- `data-add-source-open="true"` while Search/Add is open
- `data-creation-open="true"` while contextual hierarchy creation is open
- `data-source-edit-open="true"` while Edit source is open

Accessible text, semantic roles, and button state remain the primary testing surface.

The Pages deployment workflow, triggers, permissions, deployment environment, dependencies, and lockfile were not changed by issue #126. Merging PR #127 nevertheless exercised the existing main-triggered workflow successfully in automatic Pages run [32326423777](https://github.com/davecollections/tmdb-id-lookup/actions/runs/32326423777); that was automatic publication, not a manual frontend deployment. The Nuvio validation workflow had previously moved its existing builder dependency installation ahead of `check-all.mjs`, because the UI tests load the existing React and Vite packages.

## Deliberate exclusions

The current workspace does not add project-title editing, logical multi-source/bundle editing, person or Studio identity replacement, Movie Collection sort/filter controls, generic Discover editing, export, save/download, copy JSON, persistence, storage, general workspace routing or history, migration actions, bulk deletion/movement, hierarchy-card multi-select, reparenting, undo/redo, network import, addon loading, global cross-family generated-folder artwork rules, accounts, authentication, templates, recipes, language support, Ultra MAX, AIO Metadata, Trakt, V1 People migration, production Worker deployment, Pages allowlist changes, Pages deployment workflow changes, or dependencies. Issue #118 maps canonical People assets into the existing cover/focus/logo/hero fields without adding schema fields. Hierarchy Review does not expose per-person artwork overrides; the extracted controls separately make those known fields editable in the ordinary manual Folder editor. The fail-closed editor registry currently supports Movie Collection, People, Studio, Network, Decade, Genre, and simple Streaming sources; unsupported shapes remain Delete-only. Scoped mobile Genre context/catalogue views use browser history, while hierarchy navigation remains route-free. Flow-level multi-select exists for People, Franchises, Studios, Networks, Streaming regions, Genres, and Decades; hierarchy cards remain single-select. The only context menu is the bounded issue #63 hierarchy overflow menu.

## Current evidence boundary

Issue [#113](https://github.com/davecollections/tmdb-id-lookup/issues/113) / PR [#115](https://github.com/davecollections/tmdb-id-lookup/pull/115) added the Blank/Decades hierarchy flow and canonical Decade editor after focused automated and owner UI review. Issue [#118](https://github.com/davecollections/tmdb-id-lookup/issues/118) / PR [#119](https://github.com/davecollections/tmdb-id-lookup/pull/119) then added People to both launcher scopes, including the final selectable-card focus/scroll and shared Title-options corrections. Issue [#122](https://github.com/davecollections/tmdb-id-lookup/issues/122) / PR [#123](https://github.com/davecollections/tmdb-id-lookup/pull/123) added owner-reviewed Franchise hierarchy creation, and issue [#124](https://github.com/davecollections/tmdb-id-lookup/issues/124) / PR [#125](https://github.com/davecollections/tmdb-id-lookup/pull/125) added owner-reviewed Studio hierarchy creation. Closed issue [#126](https://github.com/davecollections/tmdb-id-lookup/issues/126) / merged [PR #127](https://github.com/davecollections/tmdb-id-lookup/pull/127) completed Network hierarchy at `10a76aeffd351341321ab56658e69858fb85d39c` after manual owner deployment of its reviewed Worker and live sorted-Preview validation through the production integration path. Post-merge Nuvio Contract Validation run [32326423651](https://github.com/davecollections/tmdb-id-lookup/actions/runs/32326423651) and automatic Pages run [32326423777](https://github.com/davecollections/tmdb-id-lookup/actions/runs/32326423777) both succeeded; merge did not redeploy the Worker. The deterministic and live hierarchy evidence is not a Nuvio client result. No Decades, People, Franchise, Studio, or Network hierarchy client import/export result is claimed. A complete current-client V2 edit/export round trip remains deferred until V2 exposes export.
