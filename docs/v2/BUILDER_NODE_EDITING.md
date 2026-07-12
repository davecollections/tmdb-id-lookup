# Builder Collection and Folder Editing

Status: implemented for issue [#42](https://github.com/davecollections/tmdb-id-lookup/issues/42)

Last reviewed: 2026-07-12

## Scope and sequencing

This milestone adds controlled editing for exactly four Nuvio-facing values: collection `id`, collection `title`, folder `id`, and folder `title`. Essential identity and label correction comes before source creation because users must first be able to repair or rename the hierarchy they create or import without exposing broader source and presentation contracts.

Project titles, collection/folder presentation fields, artwork, sources, export, deletion, reordering, persistence, and migration actions remain outside this workflow.

## Internal identity and Nuvio-facing identity

Every builder node retains its stable builder-only `internalId`. The editor never renders or changes that value. The visible `ID` input edits the collection or folder `editable.id` value overlaid into Nuvio output. Duplicate Nuvio-facing IDs remain permitted; selection and controller targeting continue to use `internalId`, so equal exported IDs do not merge or confuse nodes.

## UI-only draft boundary

`node-editor.js` creates a plain JSON-compatible draft containing only:

- the target internal ID and `collection` or `folder` node type;
- two form strings (`id` and `title`);
- supported original strings plus presence/support flags;
- touched flags for the two fields.

It does not copy the complete node, project, child arrays, source data, raw imported snapshots, controller snapshots, callbacks, promises, DOM nodes, or exceptions. The subscribed controller state remains the sole source of committed project data.

`NodeEditor.jsx` renders one responsive inline form. `BuilderWorkspace.jsx` owns the current draft and local validation diagnostics. `node-editor-actions.js` validates and delegates a non-empty patch through the existing public `controller.updateNode(internalId, patch)` method. No controller, domain, importer, migration, or serializer contract changes.

## Imported unusual values and touched preservation

Imported known fields can be absent or contain a non-string JSON value. The draft constructor uses the imported snapshot only to distinguish presence; it never copies that snapshot or unusual raw value into local state.

- Supported strings appear exactly, without trimming.
- Absent or non-string values appear as an empty input with calm replacement guidance.
- Objects, arrays, numbers, and booleans are never rendered or stringified.
- Untouched absent or unsupported values do not enter a patch.
- Cancelling leaves every original value unchanged.
- Applying requires valid text replacements for both fields.

Touched state also prevents a touched-then-reverted supported value from entering the patch.

## Validation and minimal patches

Validation checks trimmed length but never rewrites submitted values. Missing or whitespace-only values return all current field errors with exactly `code`, `path`, and `message`:

- `EDITOR_ID_REQUIRED` at `$ui.editor.id`;
- `EDITOR_TITLE_REQUIRED` at `$ui.editor.title`.

Messages use collection or folder wording. One local `role="alert"` region presents errors, each invalid field references its own error and helper text, and the first invalid field receives focus.

Patch generation includes only touched `id` and/or `title` values that differ effectively from the original. It never includes internal identity, node type, raw data, children, sources, presentation settings, or unknown fields. An empty patch is a clean no-op.

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

Controller and serializer tests prove that editing only ID/title preserves internal identity, node type, raw snapshots, community/unknown collection and folder fields, child arrays, source arrays and order, explicit source categories, source raw snapshots, imported `catalogSources` evidence, compatibility projection behavior, and migration eligibility. Serialization overlays edited known values and emits no builder wrappers.

## Accessibility and responsive behavior

The inline editor keeps the single page-level `h1` and adds a logical `h2`. Labels use `htmlFor`, referenced descriptions are unique, controls are real buttons, Cancel is `type="button"`, Enter may submit the form, and opening focuses ID without a server-render focus attempt. Disabled state is visible without relying only on colour, focus outlines remain strong, and controls retain approximately 48px targets.

The form is one DOM instance at all widths. It stacks fields and actions on narrow screens, wraps guidance/errors safely, and remains bounded on wide screens without creating a fourth hierarchy column. The existing mobile drill-down resumes after Apply or Cancel, while the desktop workspace remains three panels.

## Stable DOM markers

- `data-node-editor="collection|folder"`
- `data-editor-field="id|title"`
- `data-action="edit-collection|edit-folder"`
- `data-action="apply-node-edit|cancel-node-edit"`
- `data-editor-lock="true"` while editing

Labels, semantics, and native disabled state remain the primary test surface.

## Deliberate exclusions and later work

This issue does not add project-title editing; `pinToTop`, `viewMode`, `showAllTab`, `hideTitle`, or `tileShape` editing; emoji, artwork, GIF, or video controls; source creation/editing/deletion; hierarchy deletion or reordering; drag-and-drop; export/download/copy JSON; persistence/autosave/undo; replacement dialogs; migration controls; TMDB or addon networking; routing; authentication; templates; language support; Ultra MAX; AIO Metadata; account-manager conversion; Trakt; v1 or Worker changes; CSP/CORS changes; dependencies; lockfile/workflow/Pages allowlist changes; or unrelated cleanup.

Presentation settings require a later deliberate milestone that defines supported values, defaults, clearing behavior, and property-removal semantics before those controls become editable.
