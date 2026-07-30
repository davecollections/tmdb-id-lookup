# Builder Collection and Folder Editing

Status: title editing implemented for issue [#42](https://github.com/davecollections/tmdb-id-lookup/issues/42), automatic IDs refined in issue [#43](https://github.com/davecollections/tmdb-id-lookup/issues/43), owner-reviewed presentation workflow corrections implemented for issue [#53](https://github.com/davecollections/tmdb-id-lookup/issues/53), hierarchy-card movement added in issue [#59](https://github.com/davecollections/tmdb-id-lookup/issues/59), and settings presentation polished in issue [#69](https://github.com/davecollections/tmdb-id-lookup/issues/69)

Last reviewed: 2026-07-30

## Scope and sequencing

One responsive settings modal now manages collection/folder titles and the contained presentation fields approved in issue #53. Every collection and folder card owns one compact, always-visible Edit action; the former Rename/Settings pair, quick-rename form, and large selected-entity action blocks are removed. Nuvio-facing IDs remain hidden and automatically managed; users do not view, validate, copy, or repair them.

Visible Collection settings are title, Hide collection title in Nuvio, Tabs/Rows layout, Include an All tab when using Tabs, and Pin to top. The source-presentation field uses the heading **How sources appear in this collection**, the helper **Choose how each folder in this collection displays its sources in Nuvio.**, and the visible label **Tabs (recommended)** for the unchanged `TABBED_GRID` value. `focusGlowEnabled` remains a recognised collection compatibility field but is no longer rendered as a user-facing setting.

Folder settings use two compact semantic groups. **Basic details** contains Title. **Display** contains one compact native-radio Folder title visibility group followed by Poster/Landscape visual selection cards. The three visibility choices present the complete outcome instead of exposing two interacting switches:

- Show everywhere keeps a valid visible title and maps to `hideTitle: false`.
- Hide on home screen only keeps a valid visible title and maps to `hideTitle: true`.
- Hide everywhere maps the title to exactly one U+200E and maps to `hideTitle: true`.

Project titles, artwork, source editing, export, deletion, bulk settings, persistence, and migration actions remain outside this modal workflow. Issue #59 provides collection, folder, and source movement directly on hierarchy cards without adding movement fields to the editor.

## Internal identity and Nuvio-facing identity

Every builder node retains its stable builder-only `internalId`. The editor never renders or changes that value. Selection and controller targeting continue to use `internalId`; collection/folder `editable.id` values remain exported implementation details managed by the controller's separate Nuvio ID factory.

## UI-only draft boundary

`node-editor.js` creates a plain JSON-compatible draft containing only:

- the target internal ID and `collection` or `folder` node type;
- the title and the presentation values relevant to that node type;
- the collection invisible-title toggle, the folder visibility choice, and any prior visible title retained only for the current modal draft;
- preservation status for an imported invisible folder title, without copying its U+200E content into UI state, and a bounded flag for deliberate canonical replacement;
- bounded original-value presence, support, and preservation status;
- touched flags for each visible field.

Supported imported strings retain their original casing in the draft. Unsupported values are represented only by bounded status flags; objects, arrays, numbers, booleans in string-choice fields, and unsupported raw strings are not copied into UI state. The draft does not copy the complete node, project, child arrays, source data, raw imported snapshots, controller snapshots, callbacks, promises, DOM nodes, or exceptions. The subscribed controller state remains the sole source of committed project data.

`NodeEditor.jsx` renders one responsive modal form. `BuilderWorkspace.jsx` owns the current settings draft and local validation diagnostics. `hierarchy-actions.js` targets and selects the exact card node before creating the draft. `node-editor-actions.js` delegates a non-empty patch through the existing public `controller.updateNode(internalId, patch)` method. Selection snapshots notify subscribers without advancing the project revision or dirty state. The importer and serializer share the expanded collection field inventory from `known-fields.js`; folder/source inventories and other domain contracts remain unchanged.

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

Validation never rewrites submitted values. Empty, ordinary whitespace-only, and unsupported format-character-only values are invalid. The deliberate collection control and folder Hide everywhere choice use exactly one U+200E character; imported titles made only of repeated U+200E remain valid preservation cases. Missing or invalid values return all current field errors with exactly `code`, `path`, and `message`:

- `EDITOR_TITLE_REQUIRED` at `$ui.editor.title`.

Messages use collection or folder wording. One local `role="alert"` region presents errors, each invalid field references its own error and helper text, and the first invalid field receives focus.

Patch generation returns only deliberately changed supported values. Visible Collection settings can produce `title`, `viewMode`, `showAllTab`, and `pinToTop`; the compatibility helper continues to recognise `focusGlowEnabled`, but the settings UI cannot touch it because the control is absent. Folder patches may contain `title`, `tileShape`, and inverse-mapped `hideTitle`. Patches never include a Nuvio ID, internal identity, node type, raw data, children, sources, artwork, or unknown fields. An empty patch is a clean no-op.

Canonical new or replacement values are:

```text
viewMode: TABBED_GRID | ROWS
tileShape: POSTER | LANDSCAPE
pinToTop: boolean
showAllTab: boolean
focusGlowEnabled: boolean
hideTitle: boolean
```

No property-deletion or property-removal semantics were introduced.

## Intentional invisible Nuvio titles

The only supported intentional invisible title character is U+200E LEFT-TO-RIGHT MARK. The collection switch explains this neutrally: “Uses an invisible character to hide the collection title in Nuvio.” The folder Hide everywhere choice says, “Uses an invisible title.”

```js
const NUVIO_INVISIBLE_TITLE = "\u200E";
```

Empty text and ordinary whitespace are never converted to U+200E. U+200B, U+2060, U+FEFF, and other format-only alternatives are not recognised as the supported invisible title. Visible text mixed with U+200E remains visible text.

Opening an imported title made only of repeated U+200E recognises it as hidden and preserves the exact repeated value while untouched. A deliberate collection hide action or folder Hide everywhere choice emits exactly one U+200E. Returning to a visible folder choice before Apply restores the prior visible value held only in the current modal draft. An imported invisible collection or folder requires a visible replacement when a visible outcome is chosen.

An invisible folder opens with an empty, disabled title input and Hide everywhere selected. The raw repeated value is absent from the draft and DOM. Unrelated Poster/Landscape edits omit the title patch and therefore preserve the exact imported value. Choosing either visible outcome enables Title and requires a valid visible replacement; returning to Hide everywhere without a replacement restores exact preservation, while deliberately entering a replacement and then choosing Hide everywhere emits canonical one-character U+200E.

A visible-mode → Hide everywhere → original visible-mode cycle is a clean no-op when nothing else changes. A deliberate Hide everywhere operation adds `hideTitle: true` only when needed; imported invisible folders preserve the exact presence and value of `hideTitle` through unrelated edits. Imported absent or unusual `hideTitle` values remain preserved until a visibility choice is deliberately made. The modal-only visibility enum, retained title, and canonicalization flags never enter project data or serialized JSON.

The Builder displays `Hidden title` plus a restrained `Invisible in Nuvio` badge instead of a blank card or movement label. Those fallback words never enter project data or serialized JSON.

## Collection presentation behavior

The **How sources appear in this collection** field offers **Tabs (recommended)** (`TABBED_GRID`) and Rows (`ROWS`). Each folder remains a separate folder; these settings describe how that folder displays its sources after it is opened. Tabs switches between one source view at a time and may add an All tab that combines sources, while Rows displays every source as a separate stacked content row. Each radio card includes a compact CSS-only, `aria-hidden` preview beneath the authoritative title and helper text. Include an All tab when using Tabs remains editable in either layout: for each folder with two or more sources, it adds an All tab combining the folder's sources when Tabs is active; a one-source folder has no visible All tab. Rows does not display tabs, but the saved boolean remains visible and editable as the preference to use if the collection is later changed to Tabs. Switching between Tabs and Rows never changes that preference. The stored `viewMode` and `showAllTab` meanings are unchanged.

Pin to top remains an independent boolean switch. Pinned collections form the group shown before ordinary collections. Builder JSON does not store a separate interactive pin sequence, rank, timestamp, or other pin metadata: pinned collections retain their relative order from the collection array, as do ordinary collections, including imported absent, false, and unusual preserved pin values. Issue #59 movement stays inside the current pin group, maps the adjacent visible sibling back to its authoritative raw-array index, and never changes `pinToTop`.

`focusGlowEnabled` is still a recognised collection-level Nuvio boolean, but issue #69 removes its visible settings control. Manual blank collections continue to own explicit `true`. Imported explicit `true` and `false` remain unchanged, imported absence stays absent, and unusual non-boolean values remain raw-preserved. Opening or cancelling settings makes no controller call; applying another setting omits `focusGlowEnabled` from the touched-only patch. Serialization therefore overlays an owned value or preserves the raw imported value exactly as before. No migration or document-wide rewrite is performed.

Imported `FOLLOW_LAYOUT` is preservation-only. It is not offered as a normal choice, remains untouched when the editor opens or another field changes, and is replaced only when the user deliberately chooses Tabs or Rows.

## Folder presentation behavior

The reusable settings-section composition places Title under **Basic details** and title visibility plus tile shape under **Display**. This is the narrow architectural seam for a future semantic group; no Artwork heading, placeholder, disabled control, preview pane, media picker, or artwork field is added.

Folder title visibility combines the actual title and Nuvio's inverse `hideTitle` field into three user-facing outcomes. The fieldset retains its accessible name and native radio keyboard behavior, while the compact presentation uses shorter supporting text and an explicit checked control instead of tall radio cards. Show everywhere and Hide on home screen only require valid visible text; Hide everywhere disables and blanks the Title input while retaining a valid visible value only in modal state for restoration. An intentional U+200E-only title maps to Hide everywhere regardless of `hideTitle`; a visible title with supported `hideTitle: true` maps to Hide on home screen only; and a visible title with supported `hideTitle: false` maps to Show everywhere. Absent or unusual `hideTitle` values remain untouched until deliberately replaced.

The tile choices are Poster (`POSTER`) and Landscape (`LANDSCAPE`), displayed as two compact visual selection cards with CSS-only aspect-ratio previews, native checked state, a visible selected check, and the existing focus ring. Square is not a normal choice and remains preservation-only until the user deliberately chooses Poster or Landscape.

## Manual creation defaults

The UI draft-creation helpers explicitly create blank collections with:

```json
{
  "pinToTop": false,
  "focusGlowEnabled": true,
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

Hide on home screen only is therefore selected for a new manually created blank folder. Its actual title remains visible when the folder is opened. These defaults apply to manual blank creation only. Future Search/Add, template, and recipe generation must choose its own approved defaults.

## Apply lifecycle

1. Validate the current title intent and any deliberately touched presentation fields locally.
2. Keep the editor open and focus the first invalid field when validation fails.
3. Build the minimal patch.
4. Close without a controller call when the patch is empty.
5. Otherwise call `controller.updateNode` once.
6. On success, close the modal, retain selection, and restore focus to the exact Edit trigger that opened it.
7. On controller failure, retain form values and allow existing structured operation diagnostics to render.

The controller owns mutation, dirty state, the single revision increment, selection retention, frozen snapshots, operation diagnostics, and migration-preview recomputation.

## Cancel lifecycle

Cancel and Escape discard only the UI draft and local field diagnostics. They make no controller call and do not change revision, dirty state, selection, hierarchy, import warnings, migration notices, or unrelated controller diagnostics. Focus returns to the exact Edit trigger.

Refreshing or leaving the page discards this uncommitted UI-only draft, just as refresh currently resets the non-persisted builder session. The workflow does not intercept browser navigation or add `beforeunload` handling.

## Navigation lock and defensive targeting

While the modal is open, the visible workspace underlay is `inert`, hidden from the accessibility tree, and protected by handler guards and native disabled states. Its hierarchy, creation actions, Edit actions, reorder handles, mobile navigation, and root link cannot receive pointer or keyboard interaction. Apply and Cancel stay enabled. The old hierarchy-paused message is removed.

Handlers also check the lock so queued or synthetic hierarchy actions cannot change selection. If a later controller snapshot no longer contains the target internal ID and node type, the editor closes without guessing another node or applying to an ID/title match.

## Preservation

Controller and serializer tests prove that title and presentation editing preserve Nuvio and internal identity, node type, raw snapshots, community/unknown collection and folder fields, child arrays, source arrays and order, explicit source categories, source raw snapshots, imported `catalogSources` evidence, compatibility projection behavior, folder artwork fields, and migration eligibility. Serialization overlays only edited values, remains stable across a second import/serialize cycle, and emits no builder wrappers.

## Per-card Edit action

Every collection and folder card owns one visible text Edit button beside its selectable button inside a non-interactive wrapper. Clicking Edit on an unselected card selects and targets that exact node immediately, then opens the settings modal. Selection alone neither marks the project dirty nor advances revision, and Apply or Cancel retains the target selection. Panel headers retain only their panel title, count, and relevant creation action, and source cards gain no Edit action.

The ordinary rename path is the modal Title field. Initial focus enters that Title field when enabled. A supported, non-empty visible title is fully selected once when Edit opens so typing immediately replaces it; rerenders, other field changes, and validation refocus do not select it again. Empty, unsupported, intentionally invisible, or disabled titles are never selected. An intentionally invisible title instead places focus on the first available setting because Title is disabled until a visible outcome is chosen. Closing the modal restores focus to the exact Edit button that opened it.

## Accessibility and responsive behavior

The modal keeps the single page-level `h1` and adds a logical `h2`; Folder semantic groups add subordinate `h3` headings. It retains `role="dialog"`, `aria-modal="true"`, and a collection/folder-specific accessible name. Title labels use `htmlFor`; presentation choices use semantic fieldsets, legends, native radio buttons, and native checkboxes with `role="switch"`. The Folder visibility group is compact without changing native arrow-key radio behavior. Tile-shape cards expose their labels and checked state through their native radios, and selected styling includes both the radio/check mark and colour treatment. Focus enters the dialog, Tab/Shift+Tab remain contained, Escape safely cancels, and backdrop clicks never discard the draft. Referenced descriptions are unique, Cancel is `type="button"`, Enter may submit the form, disabled state is visible without relying only on colour, focus outlines remain strong, and controls meet the mobile tap-target boundary.

The form is one DOM instance at all widths. It is full or near-full-screen at narrow widths and centred with a sensible maximum width, bounded height, and internal scrolling on desktop. Heading and actions remain reachable, body scrolling is locked while open, the backdrop has a dark non-blur fallback, and supported browsers add restrained blur. Edit actions are always visible on touch, keyboard, and desktop layouts with 46px targets; the selectable card column can shrink without horizontal overflow or obscuring its title/metadata. The narrow-layout CSS boundary covers the required 360, 384, 393, 402, and 412px widths. The targeted hierarchy level remains visible through Apply or Cancel, while the desktop workspace remains three panels. Reduced-motion behavior remains unchanged.

## Stable DOM markers

- `data-node-editor="collection|folder"`
- `data-settings-modal="true"`
- `data-settings-modal-backdrop="true"`
- `data-workspace-underlay="true"`
- `data-editor-field="title"`
- `data-settings-section="basic-details|display"` (full Folder settings only)
- `data-editor-field="hideNuvioTitle|folderTitleVisibility|viewMode|showAllTab|pinToTop|tileShape"` (`hideNuvioTitle` is collection-only; `folderTitleVisibility` is folder-only)
- `data-editor-choice="tabs|rows|show-everywhere|hide-home-screen|hide-everywhere|poster|landscape"`
- `data-editor-control="hideNuvioTitle|showAllTab|pinToTop"`
- `data-control-presentation="compact-radios|visual-cards"`
- `data-hierarchy-card="collection|folder"`
- `data-card-actions="collection|folder"`
- `data-action="edit-collection|edit-folder"`
- `data-action="apply-node-edit|cancel-node-edit"`
- `data-editor-lock="true"` while editing

Labels, semantics, and native disabled state remain the primary test surface.

## Deliberate exclusions and later work

The editing workflow does not add project-title editing; emoji, artwork, focus GIF, video, title-logo, backdrop, hero, or cover controls; source editing; Add Source expansion; bulk settings; export/download/copy JSON; persistence/autosave/undo; migration controls; additional TMDB or addon providers; routing; authentication; templates; Quick Setup; recipes; language support; Ultra MAX; AIO Metadata; account-manager conversion; Trakt; v1 or Worker changes; CSP/CORS changes; dependencies; lockfile/workflow/Pages allowlist changes; or unrelated cleanup. Issue #59 adds bounded pointer/touch dragging and keyboard movement separately through one compact hierarchy-card handle, without bulk movement or editing-form fields. Bulk presentation settings remain a separate focused issue. Artwork remains future work, and future focus-GIF support defaults off unless deliberately enabled.

Issue #69 stops with an unstaged patch for one focused independent review and subsequent owner UI/flow review. No pull request is opened without separate approval.
