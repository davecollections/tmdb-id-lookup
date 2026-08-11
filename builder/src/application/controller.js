import {
	checkInternalIdUniqueness,
	cloneJsonValue,
	createCollection,
	createEmptyProject,
	createFolder,
	createSource,
	defaultInternalIdFactory,
	insertChild,
	moveNode as moveDomainNode,
	NODE_TYPES,
	removeNode as removeDomainNode,
	SOURCE_CATEGORIES,
	updateEditableValues,
} from "../domain/index.js";
import { importNuvioCollections, parseNuvioJsonText } from "../import/index.js";
import { migrateLegacyAddonProjections } from "../migrate/index.js";
import {
	defaultNuvioIdFactory,
	NuvioIdGenerationError,
	prepareNewNodeEditable,
	repairProjectNuvioIds,
} from "../nuvio/nuvio-ids.js";
import { serializeNuvioProject, stringifyNuvioProject } from "../serialize/index.js";
import {
	CONTROLLER_DIAGNOSTIC_CODES,
	copyDiagnosticList,
	controllerDiagnostic,
	createEmptyDiagnostics,
	DIAGNOSTIC_SCOPES,
} from "./diagnostics.js";
import { createMigrationPreview } from "./migration-preview.js";
import {
	createEmptySelection,
	createInitialState,
	deepFreeze,
	jsonValuesEqual,
} from "./state.js";

const sourceCategories = new Set(Object.values(SOURCE_CATEGORIES));
const diagnosticScopes = new Set(DIAGNOSTIC_SCOPES);

/**
 * @typedef {{code: string, path: string, message: string}} Diagnostic
 * @typedef {{errors: Diagnostic[], warnings: Diagnostic[]}} DiagnosticScope
 * @typedef {ReturnType<createInitialState>} ControllerState
 */

/**
 * Creates the framework-independent owner of current builder application state.
 *
 * @param {{idFactory?: () => string, nuvioIdFactory?: () => string, initialProjectTitle?: string}} [options]
 */
export function createBuilderController(options = {}) {
	validateControllerOptions(options);
	const idFactory = options.idFactory ?? defaultInternalIdFactory;
	const nuvioIdFactory = options.nuvioIdFactory ?? defaultNuvioIdFactory;
	let initialProject;

	try {
		initialProject = createEmptyProject({
			idFactory,
			editable: { title: options.initialProjectTitle ?? "" },
		});
	} catch {
		throw new TypeError("The builder controller could not create its initial project from the configured ID factory.");
	}

	/** @type {ControllerState} */
	let state = createInitialState(initialProject, createMigrationPreview(initialProject));
	const listeners = new Set();

	function getState() {
		return state;
	}

	function subscribe(listener) {
		if (typeof listener !== "function") {
			throw new TypeError("Builder controller listeners must be functions.");
		}
		listeners.add(listener);
		let active = true;
		return () => {
			if (!active) {
				return;
			}
			active = false;
			listeners.delete(listener);
		};
	}

	function commitPatch(patch, { incrementRevision = true } = {}) {
		const changed = Object.entries(patch).some(([key, value]) => !jsonValuesEqual(state[key], value));
		if (!changed) {
			return false;
		}

		state = deepFreeze({
			...state,
			...patch,
			revision: incrementRevision ? state.revision + 1 : state.revision,
		});

		for (const listener of [...listeners]) {
			try {
				listener();
			} catch {
				// External listener failures do not corrupt controller notification.
			}
		}
		return true;
	}

	function actionResult(ok, errors = [], warnings = [], extra = {}) {
		return {
			ok,
			state,
			errors,
			warnings,
			...extra,
		};
	}

	function failWithControllerDiagnostic(scope, code, path, message, extra = {}, commitOptions = {}) {
		const error = controllerDiagnostic(code, path, message);
		const diagnostics = replaceDiagnosticScope(state.diagnostics, scope, [error], []);
		commitPatch({ diagnostics }, commitOptions);
		return actionResult(false, state.diagnostics[scope].errors, state.diagnostics[scope].warnings, extra);
	}

	function failWithDiagnostics(scope, errors, warnings = [], patch = {}, extra = {}) {
		const diagnostics = replaceDiagnosticScope(state.diagnostics, scope, errors, warnings);
		commitPatch({ ...patch, diagnostics });
		return actionResult(false, state.diagnostics[scope].errors, state.diagnostics[scope].warnings, extra);
	}

	function clearSuccessfulOperationDiagnostics(patch = {}, commitOptions = {}) {
		const diagnostics = replaceDiagnosticScope(state.diagnostics, "operation", [], []);
		commitPatch({ ...patch, diagnostics }, commitOptions);
	}

	function startNewProject(actionOptions = {}) {
		const optionError = validatePlainOptions(
			actionOptions,
			new Set(["title", "discardChanges"]),
			"$controller",
			"New-project options",
		);
		if (optionError) {
			return failWithControllerDiagnostic("operation", optionError.code, optionError.path, optionError.message);
		}
		if (Object.hasOwn(actionOptions, "title") && typeof actionOptions.title !== "string") {
			return failWithControllerDiagnostic(
				"operation",
				CONTROLLER_DIAGNOSTIC_CODES.INVALID_CONTROLLER_ARGUMENT,
				"$controller",
				"A new project title must be a string when supplied.",
			);
		}
		const discardError = validateDiscardOption(actionOptions, "$controller");
		if (discardError) {
			return failWithControllerDiagnostic("operation", discardError.code, discardError.path, discardError.message);
		}
		if (state.dirty && actionOptions.discardChanges !== true) {
			return unsavedChangesFailure("$controller");
		}

		let project;
		try {
			project = createEmptyProject({
				idFactory,
				editable: { title: actionOptions.title ?? "" },
			});
		} catch {
			return failWithControllerDiagnostic(
				"operation",
				CONTROLLER_DIAGNOSTIC_CODES.CONTROLLER_OPERATION_FAILED,
				"$controller",
				"The new project could not be created with the configured internal ID factory.",
			);
		}

		commitPatch({
			project,
			selection: createEmptySelection(),
			dirty: false,
			migrationPreview: createMigrationPreview(project),
			diagnostics: createEmptyDiagnostics(),
		});
		return actionResult(true);
	}

	function importJsonText(text, actionOptions = {}) {
		return importProject(text, actionOptions, parseNuvioJsonText);
	}

	function importValue(value, actionOptions = {}) {
		return importProject(value, actionOptions, importNuvioCollections);
	}

	function importProject(input, actionOptions, importer) {
		const optionError = validatePlainOptions(
			actionOptions,
			new Set(["projectTitle", "discardChanges"]),
			"$controller",
			"Import options",
		);
		if (optionError) {
			return failWithControllerDiagnostic("import", optionError.code, optionError.path, optionError.message);
		}
		const discardError = validateDiscardOption(actionOptions, "$controller");
		if (discardError) {
			return failWithControllerDiagnostic("import", discardError.code, discardError.path, discardError.message);
		}
		if (state.dirty && actionOptions.discardChanges !== true) {
			return unsavedChangesFailure("$controller");
		}

		const importOptions = { idFactory };
		if (Object.hasOwn(actionOptions, "projectTitle")) {
			importOptions.projectTitle = actionOptions.projectTitle;
		}
		const result = importer(input, importOptions);
		if (!result.ok) {
			return failWithDiagnostics("import", result.errors, result.warnings);
		}

		let repairedProject;
		try {
			repairedProject = repairProjectNuvioIds(result.project, nuvioIdFactory);
		} catch {
			return failWithControllerDiagnostic(
				"import",
				CONTROLLER_DIAGNOSTIC_CODES.NUVIO_ID_GENERATION_FAILED,
				"$controller.nuvioIds",
				"A unique Nuvio collection or folder ID could not be generated.",
			);
		}

		const diagnostics = replaceDiagnosticScope(
			createEmptyDiagnostics(),
			"import",
			result.errors,
			result.warnings,
		);
		commitPatch({
			project: repairedProject,
			selection: createEmptySelection(),
			dirty: false,
			migrationPreview: createMigrationPreview(repairedProject),
			diagnostics,
		});
		return actionResult(true, state.diagnostics.import.errors, state.diagnostics.import.warnings);
	}

	function unsavedChangesFailure(path) {
		return failWithControllerDiagnostic(
			"operation",
			CONTROLLER_DIAGNOSTIC_CODES.UNSAVED_CHANGES_CONFIRMATION_REQUIRED,
			path,
			"Current builder edits must be explicitly discarded before replacing the project.",
		);
	}

	function selectNode(internalId) {
		const resolution = resolveTarget(internalId, "$controller.selection");
		if (resolution.error) {
			return failWithControllerDiagnostic(
				"operation",
				resolution.error.code,
				resolution.error.path,
				resolution.error.message,
			);
		}
		if (resolution.location.node.nodeType === NODE_TYPES.PROJECT) {
			return failWithControllerDiagnostic(
				"operation",
				CONTROLLER_DIAGNOSTIC_CODES.PROJECT_ROOT_OPERATION_NOT_ALLOWED,
				"$controller.selection",
				"The project root cannot be selected.",
			);
		}

		clearSuccessfulOperationDiagnostics({
			selection: selectionForLocation(resolution.location),
		}, { incrementRevision: false });
		return actionResult(true);
	}

	function clearSelection() {
		clearSuccessfulOperationDiagnostics(
			{ selection: createEmptySelection() },
			{ incrementRevision: false },
		);
		return actionResult(true);
	}

	function createCollectionNode(actionOptions = {}) {
		return createNode({
			options: actionOptions,
			path: "$controller.createCollection",
			parentInternalId: state.project.internalId,
			expectedParentType: NODE_TYPES.PROJECT,
			childrenKey: "collections",
			factory: (factoryOptions) => createCollection(factoryOptions),
		});
	}

	function createFolderNode(collectionInternalId, actionOptions = {}) {
		return createNode({
			options: actionOptions,
			path: "$controller.createFolder",
			parentInternalId: collectionInternalId,
			expectedParentType: NODE_TYPES.COLLECTION,
			childrenKey: "folders",
			factory: (factoryOptions) => createFolder(factoryOptions),
		});
	}

	function createSourceNode(folderInternalId, actionOptions = {}) {
		return createNode({
			options: actionOptions,
			path: "$controller.createSource",
			parentInternalId: folderInternalId,
			expectedParentType: NODE_TYPES.FOLDER,
			childrenKey: "sources",
			requiresCategory: true,
			factory: (factoryOptions) => createSource(factoryOptions),
		});
	}

	function createFolderWithSources(collectionInternalId, actionOptions = {}) {
		const path = "$controller.createFolderWithSources";
		const optionsValidation = validateSourceBundleOptions(actionOptions, {
			path,
			requireFolder: true,
		});
		if (!optionsValidation.ok) {
			return failWithControllerDiagnostic(
				"operation",
				optionsValidation.error.code,
				optionsValidation.error.path,
				optionsValidation.error.message,
			);
		}
		const resolution = resolveTarget(collectionInternalId, path);
		if (resolution.error) {
			return failWithControllerDiagnostic(
				"operation",
				resolution.error.code,
				resolution.error.path,
				resolution.error.message,
			);
		}
		if (resolution.location.node.nodeType !== NODE_TYPES.COLLECTION) {
			return failWithControllerDiagnostic(
				"operation",
				CONTROLLER_DIAGNOSTIC_CODES.INVALID_PARENT_NODE_TYPE,
				path,
				"The parent for this operation must be a collection node.",
			);
		}

		let folder;
		let sources;
		let project;
		try {
			const folderEditable = prepareNewNodeEditable(
				state.project,
				optionsValidation.folderEditable,
				nuvioIdFactory,
			);
			folder = createFolder({ idFactory, editable: folderEditable });
			sources = optionsValidation.sources.map((sourceOptions) => createSource({
				idFactory,
				category: sourceOptions.category,
				editable: sourceOptions.editable,
			}));
			folder = { ...folder, sources };
			project = insertChild(state.project, collectionInternalId, folder);
		} catch (error) {
			if (error instanceof NuvioIdGenerationError) {
				return failWithControllerDiagnostic(
					"operation",
					CONTROLLER_DIAGNOSTIC_CODES.NUVIO_ID_GENERATION_FAILED,
					"$controller.nuvioIds",
					"A unique Nuvio collection or folder ID could not be generated.",
				);
			}
			return failWithControllerDiagnostic(
				"operation",
				CONTROLLER_DIAGNOSTIC_CODES.CONTROLLER_OPERATION_FAILED,
				path,
				"The folder and source bundle could not be created from the supplied values.",
			);
		}
		if (!checkInternalIdUniqueness(project).unique) {
			return failWithControllerDiagnostic(
				"operation",
				CONTROLLER_DIAGNOSTIC_CODES.INTERNAL_ID_COLLISION,
				path,
				"The configured internal ID factory produced a project-wide collision.",
			);
		}

		commitProjectEdit(project);
		return actionResult(true, [], [], {
			createdFolderInternalId: folder.internalId,
			createdSourceInternalIds: sources.map((source) => source.internalId),
			updatedFolderInternalId: folder.internalId,
		});
	}

	function addSourcesToFolder(folderInternalId, actionOptions = {}) {
		const path = "$controller.addSourcesToFolder";
		const optionsValidation = validateSourceBundleOptions(actionOptions, {
			path,
			requireFolder: false,
			allowFolder: true,
		});
		if (!optionsValidation.ok) {
			return failWithControllerDiagnostic(
				"operation",
				optionsValidation.error.code,
				optionsValidation.error.path,
				optionsValidation.error.message,
			);
		}
		const resolution = resolveTarget(folderInternalId, path);
		if (resolution.error) {
			return failWithControllerDiagnostic(
				"operation",
				resolution.error.code,
				resolution.error.path,
				resolution.error.message,
			);
		}
		if (resolution.location.node.nodeType !== NODE_TYPES.FOLDER) {
			return failWithControllerDiagnostic(
				"operation",
				CONTROLLER_DIAGNOSTIC_CODES.INVALID_PARENT_NODE_TYPE,
				path,
				"The parent for this operation must be a folder node.",
			);
		}

		let sources;
		let project = state.project;
		try {
			if (optionsValidation.folderEditable !== null) {
				project = updateEditableValues(project, folderInternalId, optionsValidation.folderEditable);
			}
			sources = optionsValidation.sources.map((sourceOptions) => createSource({
				idFactory,
				category: sourceOptions.category,
				editable: sourceOptions.editable,
			}));
			for (const source of sources) {
				project = insertChild(project, folderInternalId, source);
			}
		} catch {
			return failWithControllerDiagnostic(
				"operation",
				CONTROLLER_DIAGNOSTIC_CODES.CONTROLLER_OPERATION_FAILED,
				path,
				"The folder update and source bundle could not be created from the supplied values.",
			);
		}
		if (!checkInternalIdUniqueness(project).unique) {
			return failWithControllerDiagnostic(
				"operation",
				CONTROLLER_DIAGNOSTIC_CODES.INTERNAL_ID_COLLISION,
				path,
				"The configured internal ID factory produced a project-wide collision.",
			);
		}

		commitProjectEdit(project);
		return actionResult(true, [], [], {
			createdSourceInternalIds: sources.map((source) => source.internalId),
			updatedFolderInternalId: folderInternalId,
		});
	}

	function createFoldersWithSources(collectionInternalId, actionOptions = {}) {
		const path = "$controller.createFoldersWithSources";
		if (
			!isPlainObject(actionOptions)
			|| Object.keys(actionOptions).some((key) => key !== "bundles")
			|| !Array.isArray(actionOptions.bundles)
			|| actionOptions.bundles.length < 1
			|| actionOptions.bundles.length > 20
		) {
			return failWithControllerDiagnostic(
				"operation",
				CONTROLLER_DIAGNOSTIC_CODES.INVALID_CONTROLLER_ARGUMENT,
				`${path}.bundles`,
				"Folder-source batches must contain between one and 20 bundles.",
			);
		}
		const validatedBundles = [];
		for (let index = 0; index < actionOptions.bundles.length; index += 1) {
			if (!Object.hasOwn(actionOptions.bundles, index)) {
				return failWithControllerDiagnostic(
					"operation",
					CONTROLLER_DIAGNOSTIC_CODES.INVALID_CONTROLLER_ARGUMENT,
					`${path}.bundles`,
					"Folder-source batch arrays must not contain missing entries.",
				);
			}
			const validation = validateSourceBundleOptions(actionOptions.bundles[index], {
				path: `${path}.bundles[${index}]`,
				requireFolder: true,
			});
			if (!validation.ok) {
				return failWithControllerDiagnostic(
					"operation",
					validation.error.code,
					validation.error.path,
					validation.error.message,
				);
			}
			validatedBundles.push(validation);
		}

		const resolution = resolveTarget(collectionInternalId, path);
		if (resolution.error) {
			return failWithControllerDiagnostic(
				"operation",
				resolution.error.code,
				resolution.error.path,
				resolution.error.message,
			);
		}
		if (resolution.location.node.nodeType !== NODE_TYPES.COLLECTION) {
			return failWithControllerDiagnostic(
				"operation",
				CONTROLLER_DIAGNOSTIC_CODES.INVALID_PARENT_NODE_TYPE,
				path,
				"The parent for this operation must be a collection node.",
			);
		}

		let project = state.project;
		const folders = [];
		const sourceGroups = [];
		try {
			for (const bundle of validatedBundles) {
				const folderEditable = prepareNewNodeEditable(
					project,
					bundle.folderEditable,
					nuvioIdFactory,
				);
				const sources = bundle.sources.map((sourceOptions) => createSource({
					idFactory,
					category: sourceOptions.category,
					editable: sourceOptions.editable,
				}));
				const folder = {
					...createFolder({ idFactory, editable: folderEditable }),
					sources,
				};
				project = insertChild(project, collectionInternalId, folder);
				folders.push(folder);
				sourceGroups.push(sources);
			}
		} catch (error) {
			if (error instanceof NuvioIdGenerationError) {
				return failWithControllerDiagnostic(
					"operation",
					CONTROLLER_DIAGNOSTIC_CODES.NUVIO_ID_GENERATION_FAILED,
					"$controller.nuvioIds",
					"Unique Nuvio folder IDs could not be generated for the complete batch.",
				);
			}
			return failWithControllerDiagnostic(
				"operation",
				CONTROLLER_DIAGNOSTIC_CODES.CONTROLLER_OPERATION_FAILED,
				path,
				"The complete folder and source batch could not be created from the supplied values.",
			);
		}
		if (!checkInternalIdUniqueness(project).unique) {
			return failWithControllerDiagnostic(
				"operation",
				CONTROLLER_DIAGNOSTIC_CODES.INTERNAL_ID_COLLISION,
				path,
				"The configured internal ID factory produced a project-wide collision.",
			);
		}

		commitProjectEdit(project);
		return actionResult(true, [], [], {
			createdFolderInternalIds: folders.map((folder) => folder.internalId),
			createdSourceInternalIds: sourceGroups.flatMap((sources) => sources.map((source) => source.internalId)),
		});
	}

	function createNode({
		options: actionOptions,
		path,
		parentInternalId,
		expectedParentType,
		childrenKey,
		requiresCategory = false,
		factory,
	}) {
		const allowedKeys = new Set(["editable", "rawImported", "index"]);
		if (requiresCategory) {
			allowedKeys.add("category");
		}
		const optionError = validatePlainOptions(actionOptions, allowedKeys, path, "Creation options");
		if (optionError) {
			return failWithControllerDiagnostic("operation", optionError.code, optionError.path, optionError.message);
		}

		const resolution = resolveTarget(parentInternalId, path);
		if (resolution.error) {
			return failWithControllerDiagnostic(
				"operation",
				resolution.error.code,
				resolution.error.path,
				resolution.error.message,
			);
		}
		if (resolution.location.node.nodeType !== expectedParentType) {
			return failWithControllerDiagnostic(
				"operation",
				CONTROLLER_DIAGNOSTIC_CODES.INVALID_PARENT_NODE_TYPE,
				path,
				`The parent for this operation must be a ${expectedParentType} node.`,
			);
		}

		const parent = resolution.location.node;
		const indexError = validateInsertionIndex(actionOptions.index, parent[childrenKey].length, path);
		if (indexError) {
			return failWithControllerDiagnostic("operation", indexError.code, indexError.path, indexError.message);
		}
		if (requiresCategory && !sourceCategories.has(actionOptions.category)) {
			return failWithControllerDiagnostic(
				"operation",
				CONTROLLER_DIAGNOSTIC_CODES.INVALID_SOURCE_CATEGORY,
				path,
				"A source category must be native-tmdb, addon, or opaque.",
			);
		}

		let node;
		let project;
		try {
			const editable = requiresCategory
				? actionOptions.editable
				: prepareNewNodeEditable(state.project, actionOptions.editable ?? {}, nuvioIdFactory);
			node = factory({
				idFactory,
				...(requiresCategory ? { category: actionOptions.category } : {}),
				...(requiresCategory
					? (Object.hasOwn(actionOptions, "editable") ? { editable } : {})
					: { editable }),
				...(Object.hasOwn(actionOptions, "rawImported") ? { rawImported: actionOptions.rawImported } : {}),
			});
			project = insertChild(state.project, parentInternalId, node, actionOptions.index);
		} catch (error) {
			if (error instanceof NuvioIdGenerationError) {
				return failWithControllerDiagnostic(
					"operation",
					CONTROLLER_DIAGNOSTIC_CODES.NUVIO_ID_GENERATION_FAILED,
					"$controller.nuvioIds",
					"A unique Nuvio collection or folder ID could not be generated.",
				);
			}
			return failWithControllerDiagnostic(
				"operation",
				CONTROLLER_DIAGNOSTIC_CODES.CONTROLLER_OPERATION_FAILED,
				path,
				"The requested node could not be created from the supplied values.",
			);
		}

		if (!checkInternalIdUniqueness(project).unique) {
			return failWithControllerDiagnostic(
				"operation",
				CONTROLLER_DIAGNOSTIC_CODES.INTERNAL_ID_COLLISION,
				path,
				"The configured internal ID factory produced a project-wide collision.",
			);
		}

		commitProjectEdit(project);
		return actionResult(true, [], [], { createdInternalId: node.internalId });
	}

	function updateNode(internalId, editablePatch) {
		const path = "$controller.updateNode";
		const resolution = resolveTarget(internalId, path);
		if (resolution.error) {
			return failWithControllerDiagnostic(
				"operation",
				resolution.error.code,
				resolution.error.path,
				resolution.error.message,
			);
		}

		let detachedPatch;
		try {
			detachedPatch = cloneJsonValue(editablePatch, "editablePatch");
		} catch {
			return failWithControllerDiagnostic(
				"operation",
				CONTROLLER_DIAGNOSTIC_CODES.INVALID_CONTROLLER_ARGUMENT,
				path,
				"Editable updates must be a JSON-compatible plain object.",
			);
		}
		if (!isPlainObject(detachedPatch)) {
			return failWithControllerDiagnostic(
				"operation",
				CONTROLLER_DIAGNOSTIC_CODES.INVALID_CONTROLLER_ARGUMENT,
				path,
				"Editable updates must be supplied as a plain object.",
			);
		}

		const node = resolution.location.node;
		const isNoOp = Object.entries(detachedPatch).every(([key, value]) => (
			Object.hasOwn(node.editable, key) && jsonValuesEqual(node.editable[key], value)
		));
		if (isNoOp) {
			clearSuccessfulOperationDiagnostics();
			return actionResult(true);
		}

		let project;
		try {
			project = updateEditableValues(state.project, internalId, detachedPatch);
		} catch {
			return failWithControllerDiagnostic(
				"operation",
				CONTROLLER_DIAGNOSTIC_CODES.CONTROLLER_OPERATION_FAILED,
				path,
				"The requested editable update could not be applied.",
			);
		}
		commitProjectEdit(project);
		return actionResult(true);
	}

	function moveNode(internalId, targetIndex) {
		const path = "$controller.moveNode";
		const resolution = resolveTarget(internalId, path);
		if (resolution.error) {
			return failWithControllerDiagnostic(
				"operation",
				resolution.error.code,
				resolution.error.path,
				resolution.error.message,
			);
		}
		const location = resolution.location;
		if (location.node.nodeType === NODE_TYPES.PROJECT) {
			return failWithControllerDiagnostic(
				"operation",
				CONTROLLER_DIAGNOSTIC_CODES.PROJECT_ROOT_OPERATION_NOT_ALLOWED,
				path,
				"The project root cannot be moved.",
			);
		}
		if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= location.siblings.length) {
			return failWithControllerDiagnostic(
				"operation",
				CONTROLLER_DIAGNOSTIC_CODES.INVALID_INSERTION_INDEX,
				path,
				"The target index must identify an existing sibling position.",
				{},
				{ incrementRevision: false },
			);
		}
		if (location.index === targetIndex) {
			clearSuccessfulOperationDiagnostics({}, { incrementRevision: false });
			return actionResult(true);
		}

		let project;
		try {
			project = moveDomainNode(state.project, internalId, targetIndex);
		} catch {
			return failWithControllerDiagnostic(
				"operation",
				CONTROLLER_DIAGNOSTIC_CODES.CONTROLLER_OPERATION_FAILED,
				path,
				"The requested sibling move could not be applied.",
			);
		}
		commitProjectEdit(project);
		return actionResult(true);
	}

	function removeNode(internalId) {
		const path = "$controller.removeNode";
		const resolution = resolveTarget(internalId, path);
		if (resolution.error) {
			return failWithControllerDiagnostic(
				"operation",
				resolution.error.code,
				resolution.error.path,
				resolution.error.message,
			);
		}
		if (resolution.location.node.nodeType === NODE_TYPES.PROJECT) {
			return failWithControllerDiagnostic(
				"operation",
				CONTROLLER_DIAGNOSTIC_CODES.PROJECT_ROOT_OPERATION_NOT_ALLOWED,
				path,
				"The project root cannot be removed.",
			);
		}

		let project;
		try {
			project = removeDomainNode(state.project, internalId);
		} catch {
			return failWithControllerDiagnostic(
				"operation",
				CONTROLLER_DIAGNOSTIC_CODES.CONTROLLER_OPERATION_FAILED,
				path,
				"The requested node could not be removed.",
			);
		}
		commitProjectEdit(project, reconcileSelection(project, state.selection));
		return actionResult(true);
	}

	function commitProjectEdit(project, selection = state.selection) {
		let diagnostics = replaceDiagnosticScope(state.diagnostics, "operation", [], []);
		diagnostics = replaceDiagnosticScope(diagnostics, "export", [], []);
		commitPatch({
			project,
			selection,
			dirty: true,
			migrationPreview: createMigrationPreview(project),
			diagnostics,
		});
	}

	function applyLegacyAddonProjectionMigration() {
		const path = "$controller.migration";
		if (state.migrationPreview.status === "unavailable") {
			const error = controllerDiagnostic(
				CONTROLLER_DIAGNOSTIC_CODES.MIGRATION_NOT_AVAILABLE,
				path,
				"No eligible legacy addon projections are available to migrate.",
			);
			let diagnostics = replaceDiagnosticScope(state.diagnostics, "migration", [error], []);
			diagnostics = replaceDiagnosticScope(diagnostics, "export", [], []);
			diagnostics = replaceDiagnosticScope(diagnostics, "operation", [], []);
			commitPatch({ diagnostics });
			return actionResult(false, state.diagnostics.migration.errors, state.diagnostics.migration.warnings, {
				changes: { foldersMigrated: 0, sourcesCreated: 0 },
			});
		}

		const result = migrateLegacyAddonProjections(state.project, { idFactory });
		let diagnostics = replaceDiagnosticScope(state.diagnostics, "migration", result.errors, result.warnings);
		diagnostics = replaceDiagnosticScope(diagnostics, "export", [], []);
		diagnostics = replaceDiagnosticScope(diagnostics, "operation", [], []);
		if (!result.ok) {
			commitPatch({ diagnostics });
			return actionResult(false, state.diagnostics.migration.errors, state.diagnostics.migration.warnings, {
				changes: result.changes,
			});
		}

		if (result.changes.sourcesCreated === 0) {
			commitPatch({ diagnostics });
			return actionResult(true, state.diagnostics.migration.errors, state.diagnostics.migration.warnings, {
				changes: result.changes,
			});
		}

		commitPatch({
			project: result.project,
			selection: reconcileSelection(result.project, state.selection),
			dirty: true,
			migrationPreview: createMigrationPreview(result.project),
			diagnostics,
		});
		return actionResult(true, state.diagnostics.migration.errors, state.diagnostics.migration.warnings, {
			changes: result.changes,
		});
	}

	function serializeProject() {
		const result = serializeNuvioProject(state.project);
		const diagnostics = replaceDiagnosticScope(state.diagnostics, "export", result.errors, result.warnings);
		commitPatch({ diagnostics });
		return actionResult(
			result.ok,
			state.diagnostics.export.errors,
			state.diagnostics.export.warnings,
			{ value: result.value },
		);
	}

	function stringifyProject(actionOptions = {}) {
		const result = stringifyNuvioProject(state.project, actionOptions);
		const diagnostics = replaceDiagnosticScope(state.diagnostics, "export", result.errors, result.warnings);
		commitPatch({ diagnostics });
		return actionResult(
			result.ok,
			state.diagnostics.export.errors,
			state.diagnostics.export.warnings,
			{ value: result.value, json: result.json },
		);
	}

	function clearDiagnostics(scope) {
		if (scope !== "all" && !diagnosticScopes.has(scope)) {
			return failWithControllerDiagnostic(
				"operation",
				CONTROLLER_DIAGNOSTIC_CODES.INVALID_DIAGNOSTIC_SCOPE,
				"$controller",
				"Diagnostic scope must be all, import, migration, export, or operation.",
			);
		}

		let diagnostics = state.diagnostics;
		for (const name of scope === "all" ? DIAGNOSTIC_SCOPES : [scope]) {
			diagnostics = replaceDiagnosticScope(diagnostics, name, [], []);
		}
		commitPatch({ diagnostics });
		return actionResult(true);
	}

	function resolveTarget(internalId, path) {
		if (typeof internalId !== "string" || internalId.length === 0) {
			return {
				error: controllerDiagnostic(
					CONTROLLER_DIAGNOSTIC_CODES.INVALID_CONTROLLER_ARGUMENT,
					path,
					"A target internal ID must be a non-empty string.",
				),
			};
		}

		const locations = findLocations(state.project, internalId);
		if (locations.length === 0) {
			return {
				error: controllerDiagnostic(
					CONTROLLER_DIAGNOSTIC_CODES.TARGET_NODE_NOT_FOUND,
					path,
					"No builder node matches the supplied internal ID.",
				),
			};
		}
		if (locations.length > 1) {
			return {
				error: controllerDiagnostic(
					CONTROLLER_DIAGNOSTIC_CODES.TARGET_NODE_AMBIGUOUS,
					path,
					"More than one builder node matches the supplied internal ID.",
				),
			};
		}
		return { location: locations[0] };
	}

	return Object.freeze({
		getState,
		subscribe,
		startNewProject,
		importJsonText,
		importValue,
		selectNode,
		clearSelection,
		createCollection: createCollectionNode,
		createFolder: createFolderNode,
		createSource: createSourceNode,
		createFolderWithSources,
		addSourcesToFolder,
		createFoldersWithSources,
		updateNode,
		moveNode,
		removeNode,
		applyLegacyAddonProjectionMigration,
		serializeProject,
		stringifyProject,
		clearDiagnostics,
	});
}

function validateSourceBundleOptions(options, { path, requireFolder, allowFolder = requireFolder }) {
	const allowedTopLevel = allowFolder ? new Set(["folder", "sources"]) : new Set(["sources"]);
	if (!isPlainObject(options) || Object.keys(options).some((key) => !allowedTopLevel.has(key))) {
		return {
			ok: false,
			error: controllerDiagnostic(
				CONTROLLER_DIAGNOSTIC_CODES.INVALID_CONTROLLER_ARGUMENT,
				path,
				"Source-bundle options must contain only the supported folder and sources properties.",
			),
		};
	}

	let folderEditable = null;
	if (requireFolder || options.folder !== undefined) {
		if (
			!isPlainObject(options.folder)
			|| Object.keys(options.folder).some((key) => key !== "editable")
			|| !isPlainObject(options.folder.editable)
		) {
			return {
				ok: false,
				error: controllerDiagnostic(
					CONTROLLER_DIAGNOSTIC_CODES.INVALID_CONTROLLER_ARGUMENT,
					`${path}.folder`,
					"The source bundle folder must contain one plain editable object.",
				),
			};
		}
		try {
			folderEditable = cloneJsonValue(options.folder.editable, "folder editable");
		} catch {
			return {
				ok: false,
				error: controllerDiagnostic(
					CONTROLLER_DIAGNOSTIC_CODES.INVALID_CONTROLLER_ARGUMENT,
					`${path}.folder.editable`,
					"The source bundle folder editable value must be JSON-compatible.",
				),
			};
		}
	}

	if (!Array.isArray(options.sources) || options.sources.length < 1) {
		return {
			ok: false,
			error: controllerDiagnostic(
				CONTROLLER_DIAGNOSTIC_CODES.INVALID_CONTROLLER_ARGUMENT,
				`${path}.sources`,
				"A source bundle must contain at least one source option.",
			),
		};
	}
	const sources = [];
	for (let index = 0; index < options.sources.length; index += 1) {
		if (!Object.hasOwn(options.sources, index)) {
			return {
				ok: false,
				error: controllerDiagnostic(
					CONTROLLER_DIAGNOSTIC_CODES.INVALID_CONTROLLER_ARGUMENT,
					`${path}.sources`,
					"Source bundle arrays must not contain missing entries.",
				),
			};
		}
		const source = options.sources[index];
		if (
			!isPlainObject(source)
			|| Object.keys(source).some((key) => !new Set(["category", "editable"]).has(key))
			|| !sourceCategories.has(source.category)
			|| !isPlainObject(source.editable)
		) {
			return {
				ok: false,
				error: controllerDiagnostic(
					CONTROLLER_DIAGNOSTIC_CODES.INVALID_CONTROLLER_ARGUMENT,
					`${path}.sources[${index}]`,
					"Each bundled source must contain a supported category and one plain editable object.",
				),
			};
		}
		try {
			sources.push({
				category: source.category,
				editable: cloneJsonValue(source.editable, "source editable"),
			});
		} catch {
			return {
				ok: false,
				error: controllerDiagnostic(
					CONTROLLER_DIAGNOSTIC_CODES.INVALID_CONTROLLER_ARGUMENT,
					`${path}.sources[${index}].editable`,
					"Bundled source editable values must be JSON-compatible.",
				),
			};
		}
	}

	return { ok: true, folderEditable, sources };
}

function validateControllerOptions(options) {
	const error = validatePlainOptions(
		options,
		new Set(["idFactory", "nuvioIdFactory", "initialProjectTitle"]),
		"$controller",
		"Controller options",
	);
	if (error) {
		throw new TypeError(`${error.code}: ${error.message}`);
	}
	if (Object.hasOwn(options, "idFactory") && typeof options.idFactory !== "function") {
		throw new TypeError("INVALID_CONTROLLER_ARGUMENT: idFactory must be a function when supplied.");
	}
	if (Object.hasOwn(options, "nuvioIdFactory") && typeof options.nuvioIdFactory !== "function") {
		throw new TypeError("INVALID_CONTROLLER_ARGUMENT: nuvioIdFactory must be a function when supplied.");
	}
	if (Object.hasOwn(options, "initialProjectTitle") && typeof options.initialProjectTitle !== "string") {
		throw new TypeError("INVALID_CONTROLLER_ARGUMENT: initialProjectTitle must be a string when supplied.");
	}
}

function validatePlainOptions(options, allowedKeys, path, label) {
	if (!isPlainObject(options) || Object.keys(options).some((key) => !allowedKeys.has(key))) {
		return controllerDiagnostic(
			CONTROLLER_DIAGNOSTIC_CODES.INVALID_CONTROLLER_ARGUMENT,
			path,
			`${label} must be a plain object containing only supported properties.`,
		);
	}
	return null;
}

function validateDiscardOption(options, path) {
	if (Object.hasOwn(options, "discardChanges") && typeof options.discardChanges !== "boolean") {
		return controllerDiagnostic(
			CONTROLLER_DIAGNOSTIC_CODES.INVALID_CONTROLLER_ARGUMENT,
			path,
			"discardChanges must be a boolean when supplied.",
		);
	}
	return null;
}

function validateInsertionIndex(index, length, path) {
	if (index !== undefined && (!Number.isInteger(index) || index < 0 || index > length)) {
		return controllerDiagnostic(
			CONTROLLER_DIAGNOSTIC_CODES.INVALID_INSERTION_INDEX,
			path,
			"The insertion index must be an integer within the parent child list.",
		);
	}
	return null;
}

function replaceDiagnosticScope(diagnostics, scope, errors, warnings) {
	const nextScope = {
		errors: copyDiagnosticList(errors),
		warnings: copyDiagnosticList(warnings),
	};
	if (jsonValuesEqual(diagnostics[scope], nextScope)) {
		return diagnostics;
	}
	return { ...diagnostics, [scope]: nextScope };
}

function findLocations(project, internalId) {
	const locations = [];
	if (project.internalId === internalId) {
		locations.push({
			node: project,
			parent: null,
			collection: null,
			folder: null,
			siblings: null,
			index: -1,
		});
	}

	project.collections.forEach((collection, collectionIndex) => {
		if (collection.internalId === internalId) {
			locations.push({
				node: collection,
				parent: project,
				collection,
				folder: null,
				siblings: project.collections,
				index: collectionIndex,
			});
		}
		collection.folders.forEach((folder, folderIndex) => {
			if (folder.internalId === internalId) {
				locations.push({
					node: folder,
					parent: collection,
					collection,
					folder,
					siblings: collection.folders,
					index: folderIndex,
				});
			}
			folder.sources.forEach((source, sourceIndex) => {
				if (source.internalId === internalId) {
					locations.push({
						node: source,
						parent: folder,
						collection,
						folder,
						siblings: folder.sources,
						index: sourceIndex,
					});
				}
			});
		});
	});
	return locations;
}

function selectionForLocation(location) {
	if (location.node.nodeType === NODE_TYPES.COLLECTION) {
		return {
			collectionInternalId: location.node.internalId,
			folderInternalId: null,
			sourceInternalId: null,
		};
	}
	if (location.node.nodeType === NODE_TYPES.FOLDER) {
		return {
			collectionInternalId: location.collection.internalId,
			folderInternalId: location.node.internalId,
			sourceInternalId: null,
		};
	}
	return {
		collectionInternalId: location.collection.internalId,
		folderInternalId: location.folder.internalId,
		sourceInternalId: location.node.internalId,
	};
}

function reconcileSelection(project, selection) {
	if (selection.collectionInternalId === null) {
		return createEmptySelection();
	}
	const collections = project.collections.filter((entry) => entry.internalId === selection.collectionInternalId);
	if (collections.length !== 1) {
		return createEmptySelection();
	}
	const collectionSelection = {
		collectionInternalId: collections[0].internalId,
		folderInternalId: null,
		sourceInternalId: null,
	};
	if (selection.folderInternalId === null) {
		return collectionSelection;
	}
	const folders = collections[0].folders.filter((entry) => entry.internalId === selection.folderInternalId);
	if (folders.length !== 1) {
		return collectionSelection;
	}
	const folderSelection = {
		...collectionSelection,
		folderInternalId: folders[0].internalId,
	};
	if (selection.sourceInternalId === null) {
		return folderSelection;
	}
	const sources = folders[0].sources.filter((entry) => entry.internalId === selection.sourceInternalId);
	return sources.length === 1
		? { ...folderSelection, sourceInternalId: sources[0].internalId }
		: folderSelection;
}

function isPlainObject(value) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		return false;
	}
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}
