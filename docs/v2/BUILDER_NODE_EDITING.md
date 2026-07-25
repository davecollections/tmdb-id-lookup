# Builder Collection and Folder Editing

Status: title editing implemented for issue [#42](https://github.com/davecollections/tmdb-id-lookup/issues/42), automatic IDs refined in issue [#43](https://github.com/davecollections/tmdb-id-lookup/issues/43), and owner-reviewed presentation workflow corrections implemented for issue [#53](https://github.com/davecollections/tmdb-id-lookup/issues/53)

Last reviewed: 2026-07-25

## Scope and sequencing

One responsive settings modal now manages collection/folder titles and the contained presentation fields approved in issue #53. Every collection and folder card owns compact Rename and Settings actions; the former large selected-entity action blocks are removed. Nuvio-facing IDs remain hidden and automatically managed; users do not view, validate, copy, or repair them.

Collection settings are title, Hide collection title in Nuvio, Tabs/Rows layout, Include an All tab, and Pin to top. Folder settings are title, Poster/Landscape tile shape, and positively worded Show folder title. The Builder does not expose invisible-folder-name creation; imported invisible folder names are recognised and preserved until the user enters a visible replacement. Native `hideTitle` remains the separate control for the title beneath a folder card. Project titles, artwork, sources, export, deletion, reordering, persistence, and migration actions remain outside this workflow.

## Internal identity and Nuvio-facing identity

Every builder node retains its stable builder-only `internalId`. The editor never renders or changes that value. Selection and controller targeting continue to use `internalId`; collection/folder `editable.id` values remain exported implementation details managed by the controller's separate Nuvio ID factory.

## UI-only draft boundary

`node-editor.js` creates a plain JSON-compatible draft containing only:

- the target internal ID and `collection` or `folder` node type;
- the title and the presentation values relevant to that node type;
- the collection-only invisible-title toggle plus any prior visible collection title retained only for the current modal draft;
- preservation status for an imported invisible folder title, without copying its U+200E content into UI state;
- bounded original-value presence, support, and preservation status;
- touched flags for each visible field.

Supported imported strings retain their original casing in the draft. Unsupported values are represented only by bounded status flags; objects, arrays, numbers, booleans in string-choice fields, and unsupported raw strings are not copied into UI state. The draft does not copy the complete node, project, child arrays, source data, raw imported snapshots, controller snapshots, callbacks, promises, DOM nodes, or exceptions. The subscribed controller state remains the sole source of committed project data.

`NodeEditor.jsx` renders one responsive modal form. `BuilderWorkspace.jsx` owns the current settings draft, quick-rename draft, and local validation diagnostics. `hierarchy-actions.js` targets and selects the exact card node before creating either draft. `quick-rename.js` keeps rename rules small and testable. `node-editor-actions.js` and `quick-rename.js` delegate a non-empty patch through the existing public `controller.updateNode(internalId, patch)` method. Selection snapshots notify subscribers without advancing the project revision or dirty state; the domain, importer, migration, serializer, and known-field contracts remain unchanged.

## Imported unusual values and touched preservation

Imported known fields can be absent, supported, unsupported, or contain an unusual JSON-compatible value. The draft constructor uses the imported snapshot only to distinguish presence; it never copies that snapshot or unusual raw value into local state.

- Supported strings appear exactly, without trimming.
- Supported choice values are matched case-insensitively for display without changing their original casing while untouched.
- Absent or non-string titles appear as an empty input with calm replacement guidance.
- Unsupported presentation choices show bounded guidance and no selected supported option.
- Objects, arrays, numbers, booleans, arbitrary unsupported strings, and complete raw snapshots are never rendered or stringified.
- Untouched absent, supported, preservation-only, or unsupported presentation values do not enter a patch.
- Cancelling leaves every original value unchanged.
- Applying an unrelated valid change leaves every untouched field unchanged.

Touched state also prevents a touched-then-reverted supported value from entering the patch.

## Validation and minimal patches

Validation never rewrites submitted values. Empty, ordinary whitespace-only, and unsupported format-character-only values are invalid. One or more U+200E characters are valid only for the collection setting or as an untouched imported folder title. Missing or invalid values return all current field errors with exactly `code`, `path`, and `message`:

- `EDITOR_TITLE_REQUIRED` at `$ui.editor.title`.

Messages use collection or folder wording. One local `role="alert"` region presents errors, each invalid field references its own error and helper text, and the first invalid field receives focus.

Patch generation returns only deliberately changed supported values. Collection patches may contain `title`, `viewMode`, `showAllTab`, and `pinToTop`; folder patches may contain `title`, `tileShape`, and inverse-mapped `hideTitle`. It never includes a Nuvio ID, internal identity, node type, raw data, children, sources, artwork, or unknown fields. An empty patch is a clean no-op.

Canonical new or replacement values are:

```text
viewMode: TABBED_GRID | ROWS
tileShape: POSTER | LANDSCAPE
pinToTop: boolean
showAllTab: boolean
hideTitle: boolean
```

No property-deletion or property-removal semantics were introduced.

## Intentional invisible Nuvio titles

The only supported intentional invisible title character is U+200E LEFT-TO-RIGHT MARK:

```js
const NUVIO_INVISIBLE_TITLE = "\u200E";
```

Empty text and ordinary whitespace are never converted to U+200E. U+200B, U+2060, U+FEFF, and other format-only alternatives are not recognised as the supported invisible title. Visible text mixed with U+200E remains visible text.

Opening an imported title made only of repeated U+200E recognises it as hidden and preserves the exact repeated value while untouched. The collection-only hidden-title switch emits exactly one U+200E; toggling a visible collection title off again before Apply restores the prior visible value held only in the current modal draft. An imported invisible collection requires a visible replacement when that switch is disabled.

An imported invisible folder instead opens with an empty, enabled title input and preservation guidance. The raw repeated value is absent from the draft and DOM. Unrelated Poster/Landscape or Show folder title edits omit the title patch and therefore preserve the exact imported value; only a deliberately entered valid visible title replaces it. There is no folder hidden-title flag, creation control, fallback text, or Builder-only marker in serialized JSON.

The Builder displays `Hidden title` plus a restrained `Invisible in Nuvio` badge instead of a blank card or summary. Those words and the modal-only toggle never enter project data or serialized JSON.

## Collection presentation behavior

The layout choices are Tabs (`TABBED_GRID`) and Rows (`ROWS`). Tabs enables the Include an All tab switch. Rows disables that switch without changing its draft value, so returning to Tabs restores the previous preference. Pin to top is an independent boolean switch.

Imported `FOLLOW_LAYOUT` is preservation-only. It is not offered as a normal choice, remains untouched when the editor opens or another field changes, and is replaced only when the user deliberately chooses Tabs or Rows.

## Folder presentation behavior

The tile choices are Poster (`POSTER`) and Landscape (`LANDSCAPE`), displayed with simple CSS aspect-ratio previews. Square is not a normal choice.

Show folder title is positive UI wording mapped to Nuvio's inverse `hideTitle` field. Imported `SQUARE` is preservation-only and is replaced only when the user deliberately chooses Poster or Landscape.

Folder settings do not offer invisible-name creation. Repeated U+200E folder names remain a preservation-only import case and can be replaced through the ordinary title field or quick Rename.

## Manual creation defaults

The UI draft-creation helpers explicitly create blank collections with:

```json
{
  "pinToTop": false,
  "viewMode": "TABBED_GRID",
  "showAllTab": true
}
```

They explicitly create blank folders with:

```json
{
  "tileShape": "POSTER",
  "hideTitle": true
}
```

The positive Show folder title switch is therefore off for a new manually created blank folder. These defaults apply to manual blank creation only. Future Search/Add, template, and recipe generation must choose its own approved defaults.

## Apply lifecycle

1. Validate the current title intent and any deliberately touched presentation fields locally.
2. Keep the editor open and focus the first invalid field when validation fails.
3. Build the minimal patch.
4. Close without a controller call when the patch is empty.
5. Otherwise call `controller.updateNode` once.
6. On success, close the modal, retain selection, and restore focus to the exact Settings trigger that opened it.
7. On controller failure, retain form values and allow existing structured operation diagnostics to render.

The controller owns mutation, dirty state, the single revision increment, selection retention, frozen snapshots, operation diagnostics, and migration-preview recomputation.

## Cancel lifecycle

Cancel and Escape discard only the UI draft and local field diagnostics. They make no controller call and do not change revision, dirty state, selection, hierarchy, import warnings, migration notices, or unrelated controller diagnostics. Focus returns to the exact Settings trigger.

Refreshing or leaving the page discards this uncommitted UI-only draft, just as refresh currently resets the non-persisted builder session. The workflow does not intercept browser navigation or add `beforeunload` handling.

## Navigation lock and defensive targeting

While the modal is open, the visible workspace underlay is `inert`, hidden from the accessibility tree, and protected by handler guards and native disabled states. Its hierarchy, creation actions, Rename/Settings actions, mobile navigation, folder-summary navigation, and root link cannot receive pointer or keyboard interaction. Apply and Cancel stay enabled. The old hierarchy-paused message is removed.

Handlers also check the lock so queued or synthetic hierarchy actions cannot change selection. If a later controller snapshot no longer contains the target internal ID and node type, the editor closes without guessing another node or applying to an ID/title match.

## Preservation

Controller and serializer tests prove that title and presentation editing preserve Nuvio and internal identity, node type, raw snapshots, community/unknown collection and folder fields, child arrays, source arrays and order, explicit source categories, source raw snapshots, imported `catalogSources` evidence, compatibility projection behavior, folder artwork fields, and migration eligibility. Serialization overlays only edited values, remains stable across a second import/serialize cycle, and emits no builder wrappers.

## Quick inline rename

Every collection and folder card owns sibling Rename and Settings buttons beside its selectable button inside a non-interactive wrapper. Clicking either action on an unselected card selects and targets that exact node immediately; selection alone neither marks the project dirty nor advances revision, and Apply or Cancel retains the target selection. Panel headers retain only their panel title, count, and relevant creation action, and source cards gain no edit actions.

Rename opens one targeted inline title form within the exact card wrapper without opening settings. Only one form exists. Existing visible text appears unchanged; imported invisible titles and unusual non-string titles use an empty input plus bounded replacement guidance. Enter or Apply commits one title-only controller patch. Escape or Cancel discards it. Blur never saves. Blank, whitespace-only, invisible-only, and other format-only replacements are invalid. Successful rename creates one controller revision, retains selection, and restores focus to the exact card Rename trigger; cancel, unchanged Apply, and touched-then-reverted input create no revision.

## Accessibility and responsive behavior

The modal keeps the single page-level `h1` and adds a logical `h2`, `role="dialog"`, `aria-modal="true"`, and a collection/folder-specific accessible name. Title labels use `htmlFor`; presentation choices use semantic fieldsets, legends, native radio buttons, and native checkboxes with `role="switch"`. Focus enters the dialog, Tab/Shift+Tab remain contained, Escape safely cancels, and backdrop clicks never discard the draft. Referenced descriptions are unique, Cancel is `type="button"`, Enter may submit the form, disabled state is visible without relying only on colour, focus outlines remain strong, and controls meet the mobile tap-target boundary.

The form is one DOM instance at all widths. It is full or near-full-screen at narrow widths and centred with a sensible maximum width, bounded height, and internal scrolling on desktop. Heading and actions remain reachable, body scrolling is locked while open, the backdrop has a dark non-blur fallback, and supported browsers add restrained blur. Card actions are always visible on touch layouts with 46px targets; the selectable card column can shrink without horizontal overflow or obscuring its title/metadata. On hover-capable desktop layouts the selected card, hover, and keyboard focus-within reveal the actions, while the buttons remain in the keyboard order. The narrow-layout CSS boundary covers the required 360, 384, 393, 402, and 412px widths. The targeted hierarchy level remains visible through Apply or Cancel, while the desktop workspace remains three panels. Reduced-motion behavior remains unchanged.

## Stable DOM markers

- `data-node-editor="collection|folder"`
- `data-settings-modal="true"`
- `data-settings-modal-backdrop="true"`
- `data-workspace-underlay="true"`
- `data-editor-field="title"`
- `data-editor-field="hideNuvioTitle|viewMode|showAllTab|pinToTop|tileShape|showFolderTitle"` (`hideNuvioTitle` is collection-only)
- `data-editor-choice="tabs|rows|poster|landscape"`
- `data-editor-control="hideNuvioTitle|showAllTab|pinToTop|showFolderTitle"`
- `data-hierarchy-card="collection|folder"`
- `data-card-actions="collection|folder"`
- `data-action="rename-collection|rename-folder|settings-collection|settings-folder"`
- `data-quick-rename="collection|folder"`
- `data-action="apply-node-edit|cancel-node-edit"`
- `data-editor-lock="true"` while editing

Labels, semantics, and native disabled state remain the primary test surface.

## Deliberate exclusions and later work

This issue does not add project-title editing; emoji, artwork, focus glow, focus GIF, video, title-logo, backdrop, hero, or cover controls; source creation/editing/deletion; hierarchy deletion or reordering; drag-and-drop; export/download/copy JSON; persistence/autosave/undo; migration controls; TMDB or addon networking; routing; authentication; templates; Quick Setup; recipes; language support; Ultra MAX; AIO Metadata; account-manager conversion; Trakt; v1 or Worker changes; CSP/CORS changes; dependencies; lockfile/workflow/Pages allowlist changes; or unrelated cleanup. Collection/folder/source reordering is a desired separate focused milestone and should be completed before Search/Add. Future focus-GIF support defaults off unless deliberately enabled.

The next gate is Dave's focused UI/flow review and independent review of this follow-up commit. No pull request, reordering implementation, or source-creation work begins within issue #53.
