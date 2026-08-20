# Builder Application Controller

Status: implemented for issue [#39](https://github.com/davecollections/tmdb-id-lookup/issues/39), with bounded atomic hierarchy extensions through issue [#112](https://github.com/davecollections/tmdb-id-lookup/issues/112)

Last reviewed: 2026-08-20

## Purpose and boundary

The framework-independent application layer under `builder/src/application/` is the owner of the current Builder project and the active React integration boundary. It coordinates the existing domain, importer, explicit addon projection migration, and serializer without reimplementing their rules.

The controller owns:

- immutable application-state snapshots;
- current project replacement and dirty-state protection;
- builder-only hierarchical selection;
- creation, editable updates, sibling movement, and removal;
- explicit migration preview and application;
- import, migration, operation, and export diagnostics;
- subscriptions consumed through the React external-store adapter.

The domain factories and operations remain authoritative for project shape and immutable editing. The importer remains authoritative for parsing, preservation, and source classification. The migration remains authoritative for eligibility and transformation. The serializer remains authoritative for validation, raw overlay, compatibility projection generation, and output.

## Module layout

```text
builder/src/application/
  index.js
  controller.js
  diagnostics.js
  migration-preview.js
  state.js
```

`index.js` exposes only the supported public factory. The other modules are implementation details.

## Public factory and options

```js
import { createBuilderController } from "./application/index.js";

const controller = createBuilderController({
	idFactory: deterministicIdFactory,
	nuvioIdFactory: deterministicNuvioIdFactory,
	initialProjectTitle: "My project"
});
```

Options are:

```js
{
	idFactory?: () => string,
	nuvioIdFactory?: () => string,
	initialProjectTitle?: string
}
```

`idFactory` remains builder-internal identity and is passed to domain, importer, and migration APIs. `nuvioIdFactory` manages only collection/folder `editable.id` values. Both secure defaults delegate independently to `globalThis.crypto.randomUUID()` and have no weak fallback.

Invalid controller configuration throws `TypeError`. Normal user-action failures return structured results.

## Public methods

The controller exposes:

```js
controller.getState()
controller.subscribe(listener)

controller.startNewProject(options)
controller.importJsonText(text, options)
controller.importValue(value, options)

controller.selectNode(internalId)
controller.clearSelection()

controller.createCollection(options)
controller.createFolder(collectionInternalId, options)
controller.createSource(folderInternalId, options)
controller.createCollectionsWithFoldersAndSources(options)

controller.updateNode(internalId, editablePatch)
controller.moveNode(internalId, targetIndex)
controller.removeNode(internalId)

controller.applyLegacyAddonProjectionMigration()

controller.serializeProject()
controller.stringifyProject(options)

controller.clearDiagnostics(scope)
```

There is no arbitrary state replacement or arbitrary node insertion method.

## State shape

`getState()` returns:

```js
{
  revision: number,

  project: ProjectNode,

  selection: {
    collectionInternalId: string | null,
    folderInternalId: string | null,
    sourceInternalId: string | null
  },

  dirty: boolean,

  migrationPreview: {
    status: "unavailable" | "available" | "blocked",
    changes: {
      foldersMigrated: number,
      sourcesCreated: number
    },
    errors: Diagnostic[]
  },

  diagnostics: {
    import: { errors: Diagnostic[], warnings: Diagnostic[] },
    migration: { errors: Diagnostic[], warnings: Diagnostic[] },
    export: { errors: Diagnostic[], warnings: Diagnostic[] },
    operation: { errors: Diagnostic[], warnings: Diagnostic[] }
  }
}
```

Every diagnostic has exactly:

```js
{ code: string, path: string, message: string }
```

State does not contain output JSON, exported values, external resources, callbacks, promises, timestamps, or subscription records.

## Immutable snapshot contract

- `revision` starts at `0`.
- `getState()` returns the same object identity until public state changes.
- One committed project edit or ordinary diagnostic state change creates one new top-level object and increments `revision` once, except the explicitly non-content-revision diagnostic paths below.
- A successful selection or clear-selection change creates and notifies a new snapshot but does not increment `revision` or change `dirty`.
- An invalid move index may commit an operation diagnostic without advancing project revision. A same-index move may clear stale operation diagnostics without advancing revision.
- A failed atomic `addSourcesToFolder` bundle may commit its operation diagnostic without advancing project revision; its project document remains unchanged.
- True no-ops retain the existing snapshot and revision.
- The complete state, project, raw evidence, selection, preview, and diagnostics are deeply frozen.
- Previous snapshots never change after later actions.
- Caller import, editable, patch, and raw values are detached before they enter owned state.
- Snapshots contain plain cloneable and JSON-compatible data.

Deep equality for update no-ops is structural and does not depend on object property order or JSON text comparison.

## Subscription contract

`subscribe(listener)` requires a function and returns an idempotent unsubscribe function. It does not invoke the listener immediately. Active listeners run once after each committed state change.

Notification iterates a stable listener snapshot. A listener may subscribe or unsubscribe during notification without skipping another listener from the current notification or invoking a new listener early. Listener failures are isolated from controller state and the remaining notification pass.

Selection and diagnostic commits notify. True no-ops do not.

## Initial project and dirty state

Creation produces one empty domain project, empty selection, no diagnostics, an unavailable migration preview, and `dirty: false`.

Dirty changes are:

| Action | Dirty result |
| --- | --- |
| Controller creation | `false` |
| Successful new project | `false` |
| Successful import replacement | `false` |
| Selection or diagnostics | unchanged |
| Committed creation, editable update, move, or removal | `true` |
| Migration that creates sources | `true` |
| Serialization or stringification | unchanged |
| Failed or true no-op action | unchanged |

Serialization never clears dirty state because producing valid output does not prove that a later delivery action completed.

## Replacement guard

New-project options are:

```js
{ title?: string, discardChanges?: boolean }
```

Import options are:

```js
{ projectTitle?: string, discardChanges?: boolean }
```

When current state is dirty and `discardChanges !== true`, replacement returns `UNSAVED_CHANGES_CONFIRMATION_REQUIRED`. It retains project, selection, dirty state, and the real ID-factory position. A caller can repeat the action with explicit discard confirmation.

Successful replacement clears selection. A new project clears all diagnostics. Successful import sets the import scope from importer output and clears migration, export, and operation scopes.

## Import lifecycle

`importJsonText` calls `parseNuvioJsonText`. `importValue` calls `importNuvioCollections`. The controller does not parse, classify, merge, or repair import data itself.

Successful import repairs collection/folder Nuvio-facing IDs after structural import and before the atomic commit. It preserves the first usable unique ID exactly, generates missing/invalid/later-duplicate values, retains imported order and raw evidence, stays clean, clears selection, stores importer diagnostics unchanged, and recomputes migration preview.

Failed import retains current project, selection, dirty state, and migration preview. It stores the returned importer diagnostics and never exposes a partial project.

Import never promotes or migrates `catalogSources` automatically.

## Migration preview

Preview runs `migrateLegacyAddonProjections` against the current project. It uses a disposable deterministic factory whose IDs:

- are non-empty strings;
- avoid every existing project internal ID;
- avoid earlier preview IDs;
- skip existing values that already use the preview prefix;
- never consume the controller's real configured factory.

The preview project and generated source IDs are discarded. State stores only status, folder/source counts, and production migration errors.

- successful zero-change migration: `unavailable`;
- successful non-zero migration: `available`;
- failed migration validation: `blocked`.

Preview warnings are not stored because migration has not occurred. Preview recomputes only when the project changes or is replaced; selection and diagnostic changes reuse the prior preview object.

## Explicit migration application

`applyLegacyAddonProjectionMigration()` is the only controller action that applies migration. It uses the real configured ID factory and the production migration API.

An unavailable preview returns `MIGRATION_NOT_AVAILABLE`. A blocked preview is passed through the real migration so its current production diagnostics are stored. An available migration commits only a successful returned project. Real ID collisions, factory failures, and other migration errors remain atomic.

Actual migration errors and warnings populate the migration scope. Export and operation diagnostics are cleared. Non-zero changes mark dirty and cause preview recomputation. Import and export never invoke migration.

## Selection semantics

Selection uses builder-only internal IDs and represents a valid hierarchy:

- collection selection stores only the collection ID;
- folder selection stores its parent collection and folder IDs;
- source selection stores its collection, folder, and source IDs.

The controller rejects missing, ambiguous, invalid, and project-root targets with structured diagnostics. Selecting the current path is a no-op. Selection changes do not mark the project dirty.

Project replacement clears selection. Updates, moves, creation, and migration retain a still-valid selection. Removal reconciles upward without choosing a sibling:

- removing the selected source retains its folder and collection;
- removing the selected folder retains its collection;
- removing the selected collection clears selection.

## Creation and editing

Collection options are:

```js
{ editable?: object, rawImported?: JsonValue, index?: number }
```

Folder options use the same shape and require one collection parent. Source options add an explicit category and require one folder parent:

```js
{
  category: "native-tmdb" | "addon" | "opaque",
  editable?: object,
  rawImported?: JsonValue,
  index?: number
}
```

Collection/folder creation preserves a supplied usable unique Nuvio ID or generates one before committing. Source creation does not use the Nuvio ID factory. Creation otherwise uses domain factories plus `insertChild`, detaches caller values, supports an optional insertion index, validates full-project internal-ID uniqueness, does not infer source category, and does not auto-select the new node. Success adds `createdInternalId` to the result.

`addSourcesToFolder` validates and constructs a complete ordered source array before one project commit. `createFoldersWithSources` does the same for a nonempty ordered array of folder/source bundles. Neither primitive imposes an arbitrary item-count ceiling; both retain shape, parent, generated-ID uniqueness, deterministic-order, and all-or-nothing validation. Issue #110 directly covers the complete current Genre catalogue as either 35 sources in one folder or 27 folders containing 35 sources, without claiming a generic capacity maximum. Success advances content revision once. Validation, construction, and collision failures retain the original project and content revision while still committing a structured operation diagnostic snapshot. Family services remain responsible for their narrower candidate and duplicate contracts.

`createFoldersWithSources` also accepts optional `replaceEmptyFolderInternalId`. When present, the target must be an empty non-imported folder directly inside the destination collection. All replacement guards and all new folder/source construction complete before one commit; success removes the target and inserts the planned bundles atomically, reports `replacedFolderInternalId`, and reconciles target selection through the existing removal rule. A populated, imported, missing, or cross-collection target fails without changing project content or selection. The controller deliberately does not decide whether a blank folder is a product-owned placeholder: the Genre family applies its stricter exact generated-default predicate before requesting this narrow replacement. This is not a generic folder merge/copy API.

Issue #112 adds `createCollectionsWithFoldersAndSources` for one or more complete new Collection → Folder → Source bundles. It validates the complete argument tree before candidate construction, builds every collection and descendant in one in-memory candidate project, reserves every internal ID across existing and candidate nodes, generates collection/folder Nuvio IDs against that evolving candidate, and commits once. Success reports ordered created collection, folder, and source internal IDs, advances one content revision, and reconciles the existing selection. Invalid shapes, internal-ID collisions, source/folder candidate collisions, Nuvio-ID failures, and later-collection failures retain project content, selection, dirty state, and content revision; only the existing non-revision operation diagnostic snapshot may change. This is the bounded multi-collection counterpart used by Decades, not a generic transaction or hierarchy interpreter.

`updateNode` delegates to `updateEditableValues` and supports project, collection, folder, and source nodes. It changes only editable values. Identity, type, category, raw evidence, and children remain intact. A structurally equal patch is a no-op.

`moveNode` delegates to the domain sibling move. It cannot move the project root or move across parents. A valid changed move advances revision exactly once. A move to the current index does not advance revision, and an invalid or out-of-range target reports its existing structured operation diagnostic without advancing revision. The UI resolves either one keyboard-adjacent sibling or one completed pointer-drop destination and makes exactly one controller move call for a changed movement; hover and cancelled drag state remain UI-only. Collection pin-group boundaries remain a presentation constraint rather than a controller or domain ordering rule.

`removeNode` delegates to domain removal, cannot remove the project root, retains sibling order, and reconciles selection as described above.

Every committed project edit clears stale export and operation diagnostics, preserves useful import and migration history, marks dirty, and recomputes migration preview.

## Serialization lifecycle

`serializeProject()` calls `serializeNuvioProject`. `stringifyProject(options)` calls `stringifyNuvioProject` and supports its existing `{ space?: number }` option.

Success returns detached output. Stringification also returns JSON text. Serializer errors and warnings populate the export scope. Project, selection, dirty state, and migration status remain unchanged. Failed output is atomic, and unresolved legacy data remains blocked until the caller explicitly migrates it.

The controller does not perform a delivery action or retain serialized output in state.

## Operation results

User-action methods return:

```js
{
  ok: boolean,
  state: ControllerState,
  errors: Diagnostic[],
  warnings: Diagnostic[]
}
```

The `state` property is exactly the current frozen snapshot. Depending on the action, a result may also contain:

- `createdInternalId`;
- `changes`;
- `value`;
- `json`.

Expected invalid actions return diagnostics without exception objects, stack traces, or partial projects.

## Diagnostic scopes and codes

Scopes are:

- `import`: importer and import-option results;
- `migration`: explicit migration results;
- `export`: serializer and stringifier results;
- `operation`: replacement guards, selection, creation, edit, move, and removal results.

`clearDiagnostics` accepts `all`, `import`, `migration`, `export`, or `operation`. Clearing an already-empty valid scope is a no-op.

Controller-owned codes are:

- `UNSAVED_CHANGES_CONFIRMATION_REQUIRED`
- `INVALID_CONTROLLER_ARGUMENT`
- `TARGET_NODE_NOT_FOUND`
- `TARGET_NODE_AMBIGUOUS`
- `INVALID_PARENT_NODE_TYPE`
- `PROJECT_ROOT_OPERATION_NOT_ALLOWED`
- `INVALID_INSERTION_INDEX`
- `INVALID_SOURCE_CATEGORY`
- `INTERNAL_ID_COLLISION`
- `NUVIO_ID_GENERATION_FAILED`
- `MIGRATION_NOT_AVAILABLE`
- `CONTROLLER_OPERATION_FAILED`
- `INVALID_DIAGNOSTIC_SCOPE`

Controller paths use `$controller` and action-specific paths such as `$controller.selection`, `$controller.createSource`, `$controller.updateNode`, and `$controller.migration`. Importer, migration, and serializer diagnostic codes and paths pass through unchanged.

## Example

```js
const controller = createBuilderController({
  idFactory: deterministicIdFactory
});

const unsubscribe = controller.subscribe(() => {
  const state = controller.getState();
  // The React external-store adapter reads this snapshot.
});

controller.importJsonText(jsonText);

const state = controller.getState();

if (state.migrationPreview.status === "available") {
  controller.applyLegacyAddonProjectionMigration();
}

const exported = controller.stringifyProject({ space: 2 });

unsubscribe();
```

## Deliberate exclusions

The historical issue #39 controller-foundation scope did not add visible Builder UI, React integration, navigation, forms, cards, dialogs, notifications, browser file reading or delivery, drag-and-drop, storage, persistence, a project-file format, undo/redo, autosave, account connections, authentication, manifests, backend generation, networking, live TMDB requests, artwork search, Ultra MAX conversion, AIO Metadata runtime integration, account-manager transformations, native TMDB conversion, Trakt, language or translated-artwork support, branding, routing, v1 changes, Worker changes, CSP/CORS changes, Pages contract changes, workflow changes, dependencies, lockfile changes, or cached-data changes. Later focused issues added the active UI and integrations without changing this controller boundary.

At the issue #39 checkpoint, the deployed Builder placeholder did not import this controller and the next milestone was the first visible shell. Issue #40 and later work now use this controller in the active Builder; this line records sequencing history, not current deployment state.
