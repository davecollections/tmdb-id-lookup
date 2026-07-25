# Builder Collection and Folder Editing

Status: title editing implemented for issue [#42](https://github.com/davecollections/tmdb-id-lookup/issues/42), automatic IDs refined in issue [#43](https://github.com/davecollections/tmdb-id-lookup/issues/43), and presentation settings implemented for issue [#53](https://github.com/davecollections/tmdb-id-lookup/issues/53)

Last reviewed: 2026-07-25

## Scope and sequencing

The existing responsive inline editor now manages collection/folder titles and the contained presentation fields approved in issue #53. Nuvio-facing IDs remain hidden and automatically managed; users do not view, validate, copy, or repair them.

Collection settings are title, Tabs/Rows layout, Include an All tab, and Pin to top. Folder settings are title, Poster/Landscape tile shape, and positively worded Show folder title. Project titles, artwork, sources, export, deletion, reordering, persistence, and migration actions remain outside this workflow.

## Internal identity and Nuvio-facing identity

Every builder node retains its stable builder-only `internalId`. The editor never renders or changes that value. Selection and controller targeting continue to use `internalId`; collection/folder `editable.id` values remain exported implementation details managed by the controller's separate Nuvio ID factory.

## UI-only draft boundary

`node-editor.js` creates a plain JSON-compatible draft containing only:

- the target internal ID and `collection` or `folder` node type;
- the title and the presentation values relevant to that node type;
- bounded original-value presence, support, and preservation status;
- touched flags for each visible field.

Supported imported strings retain their original casing in the draft. Unsupported values are represented only by bounded status flags; objects, arrays, numbers, booleans in string-choice fields, and unsupported raw strings are not copied into UI state. The draft does not copy the complete node, project, child arrays, source data, raw imported snapshots, controller snapshots, callbacks, promises, DOM nodes, or exceptions. The subscribed controller state remains the sole source of committed project data.

`NodeEditor.jsx` renders one responsive inline form. `BuilderWorkspace.jsx` owns the current draft and local validation diagnostics. `node-editor-actions.js` validates and delegates a non-empty patch through the existing public `controller.updateNode(internalId, patch)` method. No controller, domain, importer, migration, serializer, or known-field contract changed.

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

Validation checks trimmed length but never rewrites submitted values. Missing or whitespace-only values return all current field errors with exactly `code`, `path`, and `message`:

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

## Collection presentation behavior

The layout choices are Tabs (`TABBED_GRID`) and Rows (`ROWS`). Tabs enables the Include an All tab switch. Rows disables that switch without changing its draft value, so returning to Tabs restores the previous preference. Pin to top is an independent boolean switch.

Imported `FOLLOW_LAYOUT` is preservation-only. It is not offered as a normal choice, remains untouched when the editor opens or another field changes, and is replaced only when the user deliberately chooses Tabs or Rows.

## Folder presentation behavior

The tile choices are Poster (`POSTER`) and Landscape (`LANDSCAPE`), displayed with simple CSS aspect-ratio previews. Square is not a normal choice.

Show folder title is positive UI wording mapped to Nuvio's inverse `hideTitle` field. Imported `SQUARE` is preservation-only and is replaced only when the user deliberately chooses Poster or Landscape.

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
  "hideTitle": false
}
```

These defaults apply to manual blank creation only. Future Search/Add, template, and recipe generation must choose its own approved defaults.

## Apply lifecycle

1. Validate both fields locally.
2. Keep the editor open and focus the first invalid field when validation fails.
3. Build the minimal patch.
4. Close without a controller call when the patch is empty.
5. Otherwise call `controller.updateNode` once.
6. On success, close the editor, retain selection, and restore focus to the relevant edit trigger.
7. On controller failure, retain form values and allow existing structured operation diagnostics to render.

The controller owns mutation, dirty state, the single revision increment, selection retention, frozen snapshots, operation diagnostics, and migration-preview recomputation.

## Cancel lifecycle

Cancel discards only the UI draft and local field diagnostics. It makes no controller call and does not change revision, dirty state, selection, hierarchy, import warnings, migration notices, or unrelated controller diagnostics. Focus returns to the relevant edit action.

Refreshing or leaving the page discards this uncommitted UI-only draft, just as refresh currently resets the non-persisted builder session. The workflow does not intercept browser navigation or add `beforeunload` handling.

## Navigation lock and defensive targeting

While the editor is open, collection, folder, and source selection buttons; both mobile back controls; New collection; New folder; Edit collection; Edit folder; and Show folder details are natively disabled. The hierarchy remains readable and selected state remains visible. Apply and Cancel stay enabled, and the inline note explains the pause.

Handlers also check the lock so queued or synthetic hierarchy actions cannot change selection. If a later controller snapshot no longer contains the target internal ID and node type, the editor closes without guessing another node or applying to an ID/title match.

## Preservation

Controller and serializer tests prove that title and presentation editing preserve Nuvio and internal identity, node type, raw snapshots, community/unknown collection and folder fields, child arrays, source arrays and order, explicit source categories, source raw snapshots, imported `catalogSources` evidence, compatibility projection behavior, folder artwork fields, and migration eligibility. Serialization overlays only edited values, remains stable across a second import/serialize cycle, and emits no builder wrappers.

## Accessibility and responsive behavior

The inline editor keeps the single page-level `h1` and adds a logical `h2`. Title labels use `htmlFor`; presentation choices use semantic fieldsets, legends, native radio buttons, and native checkboxes with `role="switch"`. Referenced descriptions are unique, Cancel is `type="button"`, Enter may submit the form, and opening focuses Title without a server-render focus attempt. Disabled state is visible without relying only on colour, focus outlines remain strong, and controls exceed the approximately 48px target.

The form is one DOM instance at all widths. It stacks fields, choices, switches, and actions on narrow screens, wraps guidance/errors safely, and remains bounded on wide screens without creating a fourth hierarchy column. The narrow-layout CSS boundary covers the required 360, 384, 393, 402, and 412px widths. The existing mobile drill-down resumes after Apply or Cancel, while the desktop workspace remains three panels.

## Stable DOM markers

- `data-node-editor="collection|folder"`
- `data-editor-field="title"`
- `data-editor-field="viewMode|showAllTab|pinToTop|tileShape|showFolderTitle"`
- `data-editor-choice="tabs|rows|poster|landscape"`
- `data-editor-control="showAllTab|pinToTop|showFolderTitle"`
- `data-action="edit-collection|edit-folder"`
- `data-action="apply-node-edit|cancel-node-edit"`
- `data-editor-lock="true"` while editing

Labels, semantics, and native disabled state remain the primary test surface.

## Deliberate exclusions and later work

This issue does not add project-title editing; emoji, artwork, GIF, video, title-logo, backdrop, or focus controls; source creation/editing/deletion; hierarchy deletion or reordering; drag-and-drop; export/download/copy JSON; persistence/autosave/undo; replacement dialogs; migration controls; TMDB or addon networking; routing; authentication; templates; Quick Setup; recipes; language support; Ultra MAX; AIO Metadata; account-manager conversion; Trakt; v1 or Worker changes; CSP/CORS changes; dependencies; lockfile/workflow/Pages allowlist changes; or unrelated cleanup.

The next gate is independent branch review and Dave's mandatory UI/flow review. Source creation must not begin until review findings are resolved in the same issue workflow.
