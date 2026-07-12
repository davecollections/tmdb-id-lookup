# Builder Application Controller

Status: implemented for issue [#39](https://github.com/davecollections/tmdb-id-lookup/issues/39)

Last reviewed: 2026-07-11

## Purpose and boundary

The framework-independent application layer under `builder/src/application/` is the owner of the current builder project and the future React integration boundary. It coordinates the existing domain, importer, explicit addon projection migration, and serializer without reimplementing their rules.

The controller owns:

- immutable application-state snapshots;
- current project replacement and dirty-state protection;
- builder-only hierarchical selection;
- creation, editable updates, sibling movement, and removal;
- explicit migration preview and application;
- import, migration, operation, and export diagnostics;
- subscriptions suitable for a future external-store adapter.

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
- One committed public-state change creates one new top-level object and increments `revision` once.
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

`updateNode` delegates to `updateEditableValues` and supports project, collection, folder, and source nodes. It changes only editable values. Identity, type, category, raw evidence, and children remain intact. A structurally equal patch is a no-op.

`moveNode` delegates to the domain sibling move. It cannot move the project root or move across parents. A move to the current index is a no-op.

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
  // A future React integration reads this snapshot.
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

This issue does not add visible builder UI, React integration, navigation, forms, cards, dialogs, notifications, browser file reading or delivery, drag-and-drop, storage, persistence, a project-file format, undo/redo, autosave, account connections, authentication, manifests, backend generation, networking, live TMDB requests, artwork search, Ultra MAX conversion, AIO Metadata runtime integration, account-manager transformations, native TMDB conversion, Trakt, language or translated-artwork support, branding, routing, v1 changes, Worker changes, CSP/CORS changes, Pages contract changes, workflow changes, dependencies, lockfile changes, or cached-data changes.

The deployed builder placeholder does not import or use this controller yet. The next planned issue is the first visible builder shell/list interface.
