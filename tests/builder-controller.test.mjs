import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createBuilderController } from "../builder/src/application/index.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(rootDir, "tests", "fixtures", "nuvio");

function loadFixture(relativePath) {
	return JSON.parse(fs.readFileSync(path.join(fixtureRoot, relativePath), "utf8"));
}

function countingIdFactory(prefix = "internal") {
	let calls = 0;
	return Object.assign(() => `${prefix}-${++calls}`, { calls: () => calls });
}

function sequenceIdFactory(...ids) {
	let index = 0;
	return Object.assign(() => {
		if (index >= ids.length) {
			throw new Error("Deterministic ID sequence exhausted");
		}
		return ids[index++];
	}, { calls: () => index });
}

function assertDeepFrozen(value, seen = new WeakSet()) {
	if (value === null || typeof value !== "object" || seen.has(value)) {
		return;
	}
	seen.add(value);
	assert.equal(Object.isFrozen(value), true);
	for (const entry of Object.values(value)) {
		assertDeepFrozen(entry, seen);
	}
}

function assertDiagnosticShape(diagnostic) {
	assert.deepEqual(Object.keys(diagnostic).sort(), ["code", "message", "path"]);
	assert.equal(typeof diagnostic.code, "string");
	assert.equal(typeof diagnostic.path, "string");
	assert.equal(typeof diagnostic.message, "string");
}

function buildEditableController() {
	const controller = createBuilderController({ idFactory: countingIdFactory() });
	const collection = controller.createCollection({ editable: { id: "collection", title: "Collection" } });
	const folder = controller.createFolder(collection.createdInternalId, {
		editable: { id: "folder", title: "Folder" },
	});
	const source = controller.createSource(folder.createdInternalId, {
		category: "native-tmdb",
		editable: { provider: "tmdb", tmdbSourceType: "DISCOVER", mediaType: "MOVIE" },
	});
	return { controller, collection, folder, source };
}

test("initial state matches the public contract and is deeply frozen", () => {
	const controller = createBuilderController({
		idFactory: () => "project-1",
		initialProjectTitle: "Draft project",
	});
	const state = controller.getState();

	assert.equal(state.revision, 0);
	assert.equal(state.project.nodeType, "project");
	assert.equal(state.project.internalId, "project-1");
	assert.equal(state.project.editable.title, "Draft project");
	assert.deepEqual(state.project.collections, []);
	assert.deepEqual(state.selection, {
		collectionInternalId: null,
		folderInternalId: null,
		sourceInternalId: null,
	});
	assert.equal(state.dirty, false);
	assert.deepEqual(state.migrationPreview, {
		status: "unavailable",
		changes: { foldersMigrated: 0, sourcesCreated: 0 },
		errors: [],
	});
	assert.deepEqual(state.diagnostics, {
		import: { errors: [], warnings: [] },
		migration: { errors: [], warnings: [] },
		export: { errors: [], warnings: [] },
		operation: { errors: [], warnings: [] },
	});
	assert.equal(controller.getState(), state);
	assertDeepFrozen(state);
	assert.deepEqual(structuredClone(state), state);
	assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
});

test("controller configuration and listener arguments fail with stable TypeErrors", () => {
	for (const options of [null, [], { idFactory: "invalid" }, { initialProjectTitle: 7 }, { future: true }]) {
		assert.throws(() => createBuilderController(options), TypeError);
	}
	assert.throws(
		() => createBuilderController({ idFactory: () => "" }),
		/The builder controller could not create its initial project/,
	);
	const controller = createBuilderController({ idFactory: () => "project" });
	assert.throws(() => controller.subscribe(null), TypeError);
});

test("the controller exposes only the documented public method surface", () => {
	const controller = createBuilderController({ idFactory: () => "project" });
	assert.deepEqual(Object.keys(controller).sort(), [
		"addSourcesToFolder",
		"applyLegacyAddonProjectionMigration",
		"clearDiagnostics",
		"clearSelection",
		"createCollection",
		"createFolder",
		"createFolderWithSources",
		"createFoldersWithSources",
		"createSource",
		"getState",
		"importJsonText",
		"importValue",
		"moveNode",
		"removeNode",
		"selectNode",
		"serializeProject",
		"startNewProject",
		"stringifyProject",
		"subscribe",
		"updateNode",
	].sort());
	assert.equal(Object.isFrozen(controller), true);
});

test("subscriptions notify once per commit and true no-ops retain snapshot identity", () => {
	const controller = createBuilderController({ idFactory: countingIdFactory() });
	const snapshots = [];
	const unsubscribe = controller.subscribe(() => snapshots.push(controller.getState()));
	const created = controller.createCollection({ editable: { id: "c", title: "C" } });
	const afterCreate = controller.getState();

	assert.equal(snapshots.length, 1);
	assert.equal(snapshots[0], afterCreate);
	controller.updateNode(created.createdInternalId, { title: "C" });
	assert.equal(controller.getState(), afterCreate);
	assert.equal(snapshots.length, 1);
	unsubscribe();
	unsubscribe();
	controller.selectNode(created.createdInternalId);
	assert.equal(snapshots.length, 1);
});

test("listener iteration is stable while listeners subscribe and unsubscribe", () => {
	const controller = createBuilderController({ idFactory: countingIdFactory() });
	const calls = [];
	let unsubscribeSecond;
	const third = () => calls.push("third");
	controller.subscribe(() => {
		calls.push("first");
		unsubscribeSecond();
		controller.subscribe(third);
	});
	unsubscribeSecond = controller.subscribe(() => calls.push("second"));

	controller.createCollection({ editable: { id: "one", title: "One" } });
	assert.deepEqual(calls, ["first", "second"]);
	controller.createCollection({ editable: { id: "two", title: "Two" } });
	assert.deepEqual(calls, ["first", "second", "first", "third"]);
});

test("previous snapshots remain unchanged and selection commits do not advance project revision", () => {
	const controller = createBuilderController({ idFactory: countingIdFactory() });
	const initial = controller.getState();
	const created = controller.createCollection({ editable: { id: "c", title: "C" } });
	const afterCreate = controller.getState();
	controller.selectNode(created.createdInternalId);
	const afterSelection = controller.getState();

	assert.equal(initial.revision, 0);
	assert.deepEqual(initial.project.collections, []);
	assert.equal(afterCreate.revision, 1);
	assert.equal(afterCreate.dirty, true);
	assert.deepEqual(afterCreate.selection, initial.selection);
	assert.equal(afterSelection.revision, 1);
	assert.equal(afterSelection.dirty, true);
	assert.equal(afterSelection.project, afterCreate.project);
	assert.equal(afterSelection.migrationPreview, afterCreate.migrationPreview);
	assert.notEqual(afterSelection, afterCreate);
});

test("dirty new-project replacement is guarded without consuming an ID", () => {
	const idFactory = countingIdFactory();
	const controller = createBuilderController({ idFactory });
	const collection = controller.createCollection({ editable: { id: "c", title: "C" } });
	controller.selectNode(collection.createdInternalId);
	const before = controller.getState();
	const callsBefore = idFactory.calls();
	const blocked = controller.startNewProject({ title: "Replacement" });

	assert.equal(blocked.ok, false);
	assert.equal(blocked.errors[0].code, "UNSAVED_CHANGES_CONFIRMATION_REQUIRED");
	assert.equal(controller.getState().project, before.project);
	assert.equal(controller.getState().dirty, true);
	assert.equal(idFactory.calls(), callsBefore);
	const replaced = controller.startNewProject({ title: "Replacement", discardChanges: true });
	assert.equal(replaced.ok, true);
	assert.equal(controller.getState().project.editable.title, "Replacement");
	assert.equal(controller.getState().dirty, false);
	assert.deepEqual(controller.getState().selection, {
		collectionInternalId: null, folderInternalId: null, sourceInternalId: null,
	});
});

test("dirty imports are guarded without parsing or consuming project IDs", () => {
	const idFactory = countingIdFactory();
	const controller = createBuilderController({ idFactory });
	const collection = controller.createCollection({ editable: { id: "c", title: "C" } });
	controller.selectNode(collection.createdInternalId);
	const before = controller.getState().project;
	const callsBefore = idFactory.calls();

	for (const action of [
		() => controller.importJsonText("[]"),
		() => controller.importValue([]),
	]) {
		const result = action();
		assert.equal(result.ok, false);
		assert.equal(result.errors[0].code, "UNSAVED_CHANGES_CONFIRMATION_REQUIRED");
		assert.equal(controller.getState().project, before);
		assert.equal(idFactory.calls(), callsBefore);
	}
	assert.equal(controller.importJsonText("[]", { discardChanges: true }).ok, true);
	assert.equal(controller.getState().dirty, false);
	assert.deepEqual(controller.getState().selection, {
		collectionInternalId: null, folderInternalId: null, sourceInternalId: null,
	});
});

test("JSON text and parsed-value imports replace atomically and retain order and raw evidence", () => {
	const controller = createBuilderController({ idFactory: countingIdFactory() });
	const fixture = loadFixture("valid/mixed-native-and-addon.json");
	const textResult = controller.importJsonText(JSON.stringify(fixture), { projectTitle: "Text import" });
	assert.equal(textResult.ok, true);
	assert.equal(controller.getState().project.editable.title, "Text import");
	assert.deepEqual(
		controller.getState().project.collections[0].folders[0].sources.map((source) => source.category),
		["native-tmdb", "addon"],
	);
	assert.equal(controller.getState().dirty, false);

	const opaque = loadFixture("valid/opaque-community-import.json");
	const valueResult = controller.importValue(opaque);
	assert.equal(valueResult.ok, true);
	const source = controller.getState().project.collections[0].folders[0].sources[0];
	assert.equal(source.category, "opaque");
	assert.deepEqual(source.rawImported.communityOptions, { quality: "curated", includeUnreleased: false });
	assert.ok(controller.getState().diagnostics.import.warnings.length > 0);
});

test("caller-owned import and creation input cannot mutate controller state", () => {
	const controller = createBuilderController({ idFactory: countingIdFactory() });
	const imported = [{
		id: "c", title: "C", unknown: { keep: true },
		folders: [{ id: "f", title: "F", sources: [] }],
	}];
	controller.importValue(imported);
	imported[0].unknown.keep = false;
	assert.equal(controller.getState().project.collections[0].rawImported.unknown.keep, true);

	const editable = { id: "new", title: "New", future: { keep: true } };
	const rawImported = { id: "new", title: "New", sentinel: { keep: true } };
	controller.createCollection({ editable, rawImported });
	editable.future.keep = false;
	rawImported.sentinel.keep = false;
	const created = controller.getState().project.collections[1];
	assert.equal(created.editable.future.keep, true);
	assert.equal(created.rawImported.sentinel.keep, true);
});

test("failed import retains project selection dirty state and migration preview", () => {
	const { controller, collection } = buildEditableController();
	controller.selectNode(collection.createdInternalId);
	const before = controller.getState();
	const result = controller.importJsonText("[{]", { discardChanges: true });
	const after = controller.getState();

	assert.equal(result.ok, false);
	assert.equal(result.errors[0].code, "JSON_PARSE_ERROR");
	assert.equal(after.project, before.project);
	assert.equal(after.selection, before.selection);
	assert.equal(after.dirty, before.dirty);
	assert.equal(after.migrationPreview, before.migrationPreview);
	assert.equal(after.revision, before.revision + 1);
	assertDiagnosticShape(after.diagnostics.import.errors[0]);
});

test("legacy migration preview uses production rules without consuming real IDs", () => {
	const idFactory = countingIdFactory();
	const controller = createBuilderController({ idFactory });
	const fixture = loadFixture("compatibility/legacy-projection-only-input.json");
	const result = controller.importValue(fixture);
	const state = controller.getState();

	assert.equal(result.ok, true);
	assert.equal(idFactory.calls(), 6);
	assert.deepEqual(state.migrationPreview, {
		status: "available",
		changes: { foldersMigrated: 3, sourcesCreated: 3 },
		errors: [],
	});
	assert.deepEqual(state.project.collections[0].folders.map((folder) => folder.sources.length), [0, 0, 0]);
	assert.equal(state.dirty, false);
	assert.equal(idFactory.calls(), 6);
});

test("preview IDs skip existing prefix collisions deterministically", () => {
	const idFactory = sequenceIdFactory(
		"initial-project",
		"__builder_migration_preview__1",
		"collection",
		"folder-one",
		"folder-two",
		"folder-three",
		"real-one",
		"real-two",
		"real-three",
	);
	const controller = createBuilderController({ idFactory });
	const result = controller.importValue(loadFixture("compatibility/legacy-projection-only-input.json"));
	assert.equal(result.ok, true);
	assert.equal(controller.getState().migrationPreview.status, "available");
	assert.equal(idFactory.calls(), 6);
});

test("malformed eligible legacy evidence produces a blocked preview", () => {
	const controller = createBuilderController({ idFactory: countingIdFactory() });
	const result = controller.importValue([{
		id: "c", title: "C", folders: [{
			id: "f", title: "F", sources: [],
			catalogSources: [{ addonId: "a", type: "movie", catalogId: "catalog", genre: 7 }],
		}],
	}]);

	assert.equal(result.ok, true);
	assert.equal(controller.getState().migrationPreview.status, "blocked");
	assert.deepEqual(controller.getState().migrationPreview.changes, { foldersMigrated: 0, sourcesCreated: 0 });
	assert.equal(controller.getState().migrationPreview.errors[0].code, "INVALID_LEGACY_ADDON_GENRE");
});

test("selection and diagnostic-only commits reuse the migration preview object", () => {
	const controller = createBuilderController({ idFactory: countingIdFactory() });
	controller.importValue(loadFixture("compatibility/legacy-projection-only-input.json"));
	const collectionId = controller.getState().project.collections[0].internalId;
	const preview = controller.getState().migrationPreview;
	controller.selectNode(collectionId);
	assert.equal(controller.getState().migrationPreview, preview);
	controller.selectNode("missing");
	assert.equal(controller.getState().migrationPreview, preview);
});

test("unavailable migration returns a controller diagnostic without changing the project", () => {
	const controller = createBuilderController({ idFactory: countingIdFactory() });
	const before = controller.getState();
	const result = controller.applyLegacyAddonProjectionMigration();

	assert.equal(result.ok, false);
	assert.equal(result.errors[0].code, "MIGRATION_NOT_AVAILABLE");
	assert.deepEqual(result.changes, { foldersMigrated: 0, sourcesCreated: 0 });
	assert.equal(controller.getState().project, before.project);
	assert.equal(controller.getState().dirty, false);
});

test("explicit migration commits production changes warnings and dirty state", () => {
	const controller = createBuilderController({ idFactory: countingIdFactory() });
	controller.importValue(loadFixture("compatibility/legacy-projection-only-input.json"));
	const before = controller.getState().project;
	const result = controller.applyLegacyAddonProjectionMigration();

	assert.equal(result.ok, true);
	assert.deepEqual(result.changes, { foldersMigrated: 3, sourcesCreated: 3 });
	assert.equal(result.warnings.length, 3);
	assert.ok(result.warnings.every((warning) => warning.code === "LEGACY_ADDON_PROJECTIONS_MIGRATED"));
	assert.notEqual(controller.getState().project, before);
	assert.equal(controller.getState().dirty, true);
	assert.equal(controller.getState().migrationPreview.status, "unavailable");
	assert.deepEqual(
		controller.getState().project.collections[0].folders.flatMap((folder) => folder.sources).map((source) => source.editable.genre),
		[null, "Action", null],
	);
});

test("real migration ID collisions and factory failures are atomic after an available preview", () => {
	const collisionFactory = sequenceIdFactory(
		"initial",
		"import-project",
		"collection",
		"folder-one",
		"folder-two",
		"folder-three",
		"import-project",
	);
	const collisionController = createBuilderController({ idFactory: collisionFactory });
	collisionController.importValue(loadFixture("compatibility/legacy-projection-only-input.json"));
	const beforeCollision = collisionController.getState();
	const collision = collisionController.applyLegacyAddonProjectionMigration();
	assert.equal(collision.ok, false);
	assert.equal(collision.errors[0].code, "DUPLICATE_INTERNAL_ID");
	assert.equal(collisionController.getState().project, beforeCollision.project);
	assert.equal(collisionController.getState().dirty, false);

	let fail = false;
	let sequence = 0;
	const idFactory = () => {
		if (fail) throw new Error("configured failure");
		return `real-${++sequence}`;
	};
	const controller = createBuilderController({ idFactory });
	controller.importValue(loadFixture("compatibility/legacy-projection-only-input.json"));
	const before = controller.getState();
	fail = true;
	const result = controller.applyLegacyAddonProjectionMigration();

	assert.equal(result.ok, false);
	assert.equal(result.errors[0].code, "INTERNAL_ID_GENERATION_ERROR");
	assert.equal(controller.getState().project, before.project);
	assert.equal(controller.getState().dirty, false);
	assert.equal(controller.getState().migrationPreview.status, "available");
});

test("selection resolves collection folder and source ancestry and same selection is a no-op", () => {
	const { controller, collection, folder, source } = buildEditableController();
	controller.selectNode(collection.createdInternalId);
	assert.deepEqual(controller.getState().selection, {
		collectionInternalId: collection.createdInternalId,
		folderInternalId: null,
		sourceInternalId: null,
	});
	controller.selectNode(folder.createdInternalId);
	assert.deepEqual(controller.getState().selection, {
		collectionInternalId: collection.createdInternalId,
		folderInternalId: folder.createdInternalId,
		sourceInternalId: null,
	});
	controller.selectNode(source.createdInternalId);
	const selected = controller.getState();
	assert.deepEqual(selected.selection, {
		collectionInternalId: collection.createdInternalId,
		folderInternalId: folder.createdInternalId,
		sourceInternalId: source.createdInternalId,
	});
	assert.equal(selected.dirty, true);
	controller.selectNode(source.createdInternalId);
	assert.equal(controller.getState(), selected);
	controller.clearSelection();
	assert.deepEqual(controller.getState().selection, {
		collectionInternalId: null, folderInternalId: null, sourceInternalId: null,
	});
});

test("selection failures are structured and successful selection clears stale operation errors", () => {
	const { controller, collection } = buildEditableController();
	for (const [target, code] of [["missing", "TARGET_NODE_NOT_FOUND"], ["", "INVALID_CONTROLLER_ARGUMENT"]]) {
		const result = controller.selectNode(target);
		assert.equal(result.ok, false);
		assert.equal(result.errors[0].code, code);
		assertDiagnosticShape(result.errors[0]);
	}
	const rootResult = controller.selectNode(controller.getState().project.internalId);
	assert.equal(rootResult.errors[0].code, "PROJECT_ROOT_OPERATION_NOT_ALLOWED");
	assert.equal(controller.selectNode(collection.createdInternalId).ok, true);
	assert.deepEqual(controller.getState().diagnostics.operation.errors, []);
});

test("removal reconciles source folder and collection selection without choosing siblings", () => {
	const first = buildEditableController();
	first.controller.selectNode(first.source.createdInternalId);
	first.controller.removeNode(first.source.createdInternalId);
	assert.deepEqual(first.controller.getState().selection, {
		collectionInternalId: first.collection.createdInternalId,
		folderInternalId: first.folder.createdInternalId,
		sourceInternalId: null,
	});

	const second = buildEditableController();
	second.controller.selectNode(second.source.createdInternalId);
	second.controller.removeNode(second.folder.createdInternalId);
	assert.deepEqual(second.controller.getState().selection, {
		collectionInternalId: second.collection.createdInternalId,
		folderInternalId: null,
		sourceInternalId: null,
	});

	const third = buildEditableController();
	third.controller.selectNode(third.source.createdInternalId);
	third.controller.removeNode(third.collection.createdInternalId);
	assert.deepEqual(third.controller.getState().selection, {
		collectionInternalId: null, folderInternalId: null, sourceInternalId: null,
	});
});

test("creation uses domain defaults supports indexed insertion and never auto-selects", () => {
	const controller = createBuilderController({ idFactory: countingIdFactory() });
	const first = controller.createCollection({ editable: { id: "first", title: "First" } });
	const second = controller.createCollection({ editable: { id: "second", title: "Second" }, index: 0 });
	const folder = controller.createFolder(first.createdInternalId, { editable: { id: "folder", title: "Folder" } });
	const native = controller.createSource(folder.createdInternalId, {
		category: "native-tmdb",
		editable: { provider: "tmdb", tmdbSourceType: "DISCOVER", mediaType: "MOVIE" },
	});
	const addon = controller.createSource(folder.createdInternalId, {
		category: "addon",
		editable: { provider: "addon", addonId: "a", type: "movie", catalogId: "catalog" },
		index: 0,
	});
	const opaque = controller.createSource(folder.createdInternalId, { category: "opaque" });

	assert.deepEqual(controller.getState().project.collections.map((entry) => entry.internalId), [
		second.createdInternalId, first.createdInternalId,
	]);
	const sources = controller.getState().project.collections[1].folders[0].sources;
	assert.deepEqual(sources.map((entry) => entry.internalId), [addon.createdInternalId, native.createdInternalId, opaque.createdInternalId]);
	assert.deepEqual(sources.map((entry) => entry.category), ["addon", "native-tmdb", "opaque"]);
	assert.deepEqual(controller.getState().selection, {
		collectionInternalId: null, folderInternalId: null, sourceInternalId: null,
	});
	assert.equal(controller.getState().dirty, true);
});

test("generic source batches accept six ordered sources in one content revision", () => {
	const controller = createBuilderController({ idFactory: countingIdFactory() });
	const collection = controller.createCollection({ editable: { id: "collection", title: "Collection" } });
	const folder = controller.createFolder(collection.createdInternalId, { editable: { id: "folder", title: "Folder" } });
	const sources = Array.from({ length: 6 }, (_, index) => ({
		category: "native-tmdb",
		editable: { title: `Source ${index + 1}` },
	}));
	const beforeRevision = controller.getState().revision;

	const result = controller.addSourcesToFolder(folder.createdInternalId, { sources });
	const inserted = controller.getState().project.collections[0].folders[0].sources;

	assert.equal(result.ok, true);
	assert.equal(controller.getState().revision, beforeRevision + 1);
	assert.equal(inserted.length, 6);
	assert.deepEqual(inserted.map((source) => source.editable.title), sources.map((source) => source.editable.title));
	assert.deepEqual(inserted.map((source) => source.internalId), result.createdSourceInternalIds);
	assert.equal(new Set(result.createdSourceInternalIds).size, 6);
});

test("generic source batches reject an invalid fifth source without partial insertion", () => {
	const controller = createBuilderController({ idFactory: countingIdFactory() });
	const collection = controller.createCollection({ editable: { id: "collection", title: "Collection" } });
	const folder = controller.createFolder(collection.createdInternalId, { editable: { id: "folder", title: "Folder" } });
	const sources = Array.from({ length: 6 }, (_, index) => ({
		category: "native-tmdb",
		editable: { title: `Source ${index + 1}` },
	}));
	sources[4] = { category: "unsupported", editable: { title: "Invalid fifth source" } };
	const beforeProject = controller.getState().project;

	const result = controller.addSourcesToFolder(folder.createdInternalId, { sources });

	assert.equal(result.ok, false);
	assert.equal(result.errors[0].code, "INVALID_CONTROLLER_ARGUMENT");
	assert.equal(result.errors[0].path, "$controller.addSourcesToFolder.sources[4]");
	assert.equal(controller.getState().project, beforeProject);
	assert.equal(controller.getState().project.collections[0].folders[0].sources.length, 0);
});

test("creation rejects wrong parents invalid indices categories and generated collisions atomically", () => {
	const idFactory = sequenceIdFactory("project", "collection", "folder", "project");
	const controller = createBuilderController({ idFactory });
	const collection = controller.createCollection({ editable: { id: "c", title: "C" } });
	const folder = controller.createFolder(collection.createdInternalId, { editable: { id: "f", title: "F" } });
	const before = controller.getState().project;

	assert.equal(controller.createFolder(folder.createdInternalId).errors[0].code, "INVALID_PARENT_NODE_TYPE");
	assert.equal(controller.createCollection({ index: -1 }).errors[0].code, "INVALID_INSERTION_INDEX");
	assert.equal(controller.createSource(folder.createdInternalId, { category: "community" }).errors[0].code, "INVALID_SOURCE_CATEGORY");
	const collision = controller.createSource(folder.createdInternalId, { category: "opaque" });
	assert.equal(collision.ok, false);
	assert.equal(collision.errors[0].code, "INTERNAL_ID_COLLISION");
	assert.equal(controller.getState().project, before);
});

test("editable updates preserve identity category raw data children and selection", () => {
	const controller = createBuilderController({ idFactory: countingIdFactory() });
	controller.importValue([{
		id: "c", title: "C", folders: [{
			id: "f", title: "F", sources: [{
				provider: "addon", addonId: "a", type: "movie", catalogId: "old", unknown: { keep: true },
			}],
		}],
	}]);
	const folder = controller.getState().project.collections[0].folders[0];
	const source = folder.sources[0];
	controller.selectNode(source.internalId);
	const raw = source.rawImported;
	const folderRaw = folder.rawImported;
	const originalSources = folder.sources;
	controller.updateNode(folder.internalId, { title: "Edited folder" });
	const folderAfterFolderUpdate = controller.getState().project.collections[0].folders[0];
	assert.equal(folderAfterFolderUpdate.rawImported, folderRaw);
	assert.equal(folderAfterFolderUpdate.sources, originalSources);
	assert.equal(folderAfterFolderUpdate.editable.title, "Edited folder");
	const result = controller.updateNode(source.internalId, { catalogId: "new", filters: { b: 2, a: 1 } });
	const updatedFolder = controller.getState().project.collections[0].folders[0];
	const updated = updatedFolder.sources[0];

	assert.equal(result.ok, true);
	assert.equal(updatedFolder.rawImported, folderRaw);
	assert.equal(updatedFolder.editable.title, "Edited folder");
	assert.equal(updated.internalId, source.internalId);
	assert.equal(updated.nodeType, source.nodeType);
	assert.equal(updated.category, source.category);
	assert.equal(updated.rawImported, raw);
	assert.equal(updated.editable.catalogId, "new");
	assert.equal(controller.getState().dirty, true);
	assert.equal(controller.getState().selection.sourceInternalId, source.internalId);
	const snapshot = controller.getState();
	controller.updateNode(source.internalId, { filters: { a: 1, b: 2 }, catalogId: "new" });
	assert.equal(controller.getState(), snapshot);
});

test("invalid editable patches are structured and leave the project unchanged", () => {
	const { controller, source } = buildEditableController();
	const before = controller.getState().project;
	for (const patch of [null, [], { invalid: Number.NaN }]) {
		const result = controller.updateNode(source.createdInternalId, patch);
		assert.equal(result.ok, false);
		assert.equal(result.errors[0].code, "INVALID_CONTROLLER_ARGUMENT");
		assert.equal(controller.getState().project, before);
	}
});

test("move changes only sibling order while same-index and root moves are safe", () => {
	const controller = createBuilderController({ idFactory: countingIdFactory() });
	controller.importValue([
		{ id: "first", title: "First", folders: [] },
		{ id: "second", title: "Second", folders: [] },
	]);
	const [first, second] = controller.getState().project.collections;
	controller.selectNode(first.internalId);
	assert.equal(controller.getState().dirty, false);
	const revision = controller.getState().revision;
	const moved = controller.moveNode(second.internalId, 0);
	assert.equal(moved.ok, true);
	assert.deepEqual(controller.getState().project.collections.map((entry) => entry.internalId), [
		second.internalId, first.internalId,
	]);
	assert.equal(controller.getState().selection.collectionInternalId, first.internalId);
	assert.equal(controller.getState().dirty, true);
	assert.equal(controller.getState().revision, revision + 1);
	const afterMove = controller.getState();
	controller.moveNode(second.internalId, 0);
	assert.equal(controller.getState(), afterMove);
	assert.equal(controller.moveNode(controller.getState().project.internalId, 0).errors[0].code, "PROJECT_ROOT_OPERATION_NOT_ALLOWED");
	assert.equal(controller.moveNode(first.internalId, 7).errors[0].code, "INVALID_INSERTION_INDEX");
});

test("root and missing removals fail atomically while successful removal preserves order", () => {
	const controller = createBuilderController({ idFactory: countingIdFactory() });
	controller.importValue([
		{ id: "first", title: "First", folders: [] },
		{ id: "second", title: "Second", folders: [] },
	]);
	const [first, second] = controller.getState().project.collections;
	const before = controller.getState().project;
	assert.equal(controller.removeNode(controller.getState().project.internalId).errors[0].code, "PROJECT_ROOT_OPERATION_NOT_ALLOWED");
	assert.equal(controller.getState().project, before);
	assert.equal(controller.removeNode("missing").errors[0].code, "TARGET_NODE_NOT_FOUND");
	assert.equal(controller.getState().project, before);
	assert.equal(controller.getState().dirty, false);
	assert.equal(controller.removeNode(first.internalId).ok, true);
	assert.deepEqual(controller.getState().project.collections.map((entry) => entry.internalId), [second.internalId]);
	assert.equal(controller.getState().dirty, true);
});

test("object serialization and JSON stringification leave project selection and dirty state unchanged", () => {
	const { controller, source } = buildEditableController();
	controller.selectNode(source.createdInternalId);
	const before = controller.getState();
	const serialized = controller.serializeProject();
	assert.equal(serialized.ok, true);
	assert.equal(serialized.state, controller.getState());
	assert.equal(serialized.value[0].id, "collection");
	assert.equal(controller.getState().project, before.project);
	assert.equal(controller.getState().selection, before.selection);
	assert.equal(controller.getState().dirty, true);

	const stringified = controller.stringifyProject({ space: 4 });
	assert.equal(stringified.ok, true);
	assert.deepEqual(JSON.parse(stringified.json), stringified.value);
	assert.match(stringified.json, /\n    \{/);
	assert.equal(controller.getState().dirty, true);
});

test("serializer errors and warnings are stored without partial project changes", () => {
	const controller = createBuilderController({ idFactory: countingIdFactory() });
	controller.createCollection();
	const collectionId = controller.getState().project.collections[0].internalId;
	controller.updateNode(collectionId, { id: "" });
	const beforeFailure = controller.getState();
	const failed = controller.serializeProject();
	assert.equal(failed.ok, false);
	assert.equal(failed.value, null);
	assert.ok(failed.errors.some((error) => error.code === "COLLECTION_ID_REQUIRED"));
	assert.equal(controller.getState().project, beforeFailure.project);
	assert.equal(controller.getState().dirty, true);
	assert.deepEqual(controller.getState().diagnostics.export.errors, failed.errors);

	controller.importValue(loadFixture("valid/opaque-community-import.json"), { discardChanges: true });
	const warned = controller.serializeProject();
	assert.equal(warned.ok, true);
	assert.equal(warned.warnings[0].code, "OPAQUE_SOURCE_PRESERVED");
	assert.deepEqual(controller.getState().diagnostics.export.warnings, warned.warnings);
});

test("import and export never apply legacy migration automatically", () => {
	const idFactory = countingIdFactory();
	const controller = createBuilderController({ idFactory });
	controller.importValue(loadFixture("compatibility/legacy-projection-only-input.json"));
	const before = controller.getState();
	const exported = controller.stringifyProject();

	assert.equal(exported.ok, false);
	assert.equal(exported.json, null);
	assert.ok(exported.errors.some((error) => error.code === "LEGACY_CATALOG_SOURCES_ONLY_UNRESOLVED"));
	assert.equal(controller.getState().project, before.project);
	assert.equal(controller.getState().dirty, false);
	assert.equal(controller.getState().migrationPreview.status, "available");
	assert.equal(idFactory.calls(), 6);
});

test("diagnostic scopes follow import edit migration export and clear lifecycles", () => {
	const controller = createBuilderController({ idFactory: countingIdFactory() });
	controller.selectNode("missing");
	assert.equal(controller.getState().diagnostics.operation.errors[0].code, "TARGET_NODE_NOT_FOUND");
	controller.importValue([{ id: "c", title: "C" }]);
	assert.deepEqual(controller.getState().diagnostics.operation.errors, []);
	assert.equal(controller.getState().diagnostics.import.warnings[0].code, "MISSING_FOLDERS");
	const collectionId = controller.getState().project.collections[0].internalId;
	controller.updateNode(collectionId, { id: "", title: "Edited" });
	assert.equal(controller.getState().diagnostics.import.warnings[0].code, "MISSING_FOLDERS");
	controller.serializeProject();
	assert.equal(controller.getState().diagnostics.export.errors[0].code, "COLLECTION_ID_REQUIRED");
	controller.clearDiagnostics("export");
	assert.deepEqual(controller.getState().diagnostics.export, { errors: [], warnings: [] });
	controller.clearDiagnostics("all");
	assert.deepEqual(controller.getState().diagnostics, {
		import: { errors: [], warnings: [] }, migration: { errors: [], warnings: [] },
		export: { errors: [], warnings: [] }, operation: { errors: [], warnings: [] },
	});
});

test("diagnostic clearing validates scope and avoids commits when nothing changes", () => {
	const controller = createBuilderController({ idFactory: () => "project" });
	const initial = controller.getState();
	controller.clearDiagnostics("all");
	assert.equal(controller.getState(), initial);
	const invalid = controller.clearDiagnostics("future");
	assert.equal(invalid.ok, false);
	assert.equal(invalid.errors[0].code, "INVALID_DIAGNOSTIC_SCOPE");
	const afterInvalid = controller.getState();
	controller.clearDiagnostics("operation");
	assert.equal(controller.getState().revision, afterInvalid.revision + 1);
	assert.deepEqual(controller.getState().diagnostics.operation, { errors: [], warnings: [] });
});

test("application production modules remain environment-neutral and React uses only the public entry point", () => {
	const applicationDir = path.join(rootDir, "builder", "src", "application");
	const applicationFiles = fs.readdirSync(applicationDir)
		.filter((name) => name.endsWith(".js"))
		.map((name) => path.join(applicationDir, name));
	const applicationSource = applicationFiles.map((file) => fs.readFileSync(file, "utf8")).join("\n");
	assert.doesNotMatch(applicationSource, /from\s+["']node:/);
	assert.doesNotMatch(applicationSource, /\b(?:window|document|localStorage|indexedDB|fetch)\b/);
	assert.doesNotMatch(applicationSource, /\b(?:showOpenFilePicker|showSaveFilePicker|URL\.createObjectURL)\b/);

	const mainSource = fs.readFileSync(path.join(rootDir, "builder", "src", "main.jsx"), "utf8");
	assert.match(mainSource, /from\s+["']\.\/application\/index\.js["']/);
	assert.doesNotMatch(mainSource, /from\s+["']\.\/application\/(?!index\.js)/);
	const uiDir = path.join(rootDir, "builder", "src", "ui");
	const uiSource = fs.readdirSync(uiDir)
		.filter((name) => /\.(?:js|jsx)$/.test(name))
		.map((name) => fs.readFileSync(path.join(uiDir, name), "utf8"))
		.join("\n");
	assert.doesNotMatch(uiSource, /from\s+["'][^"']*application\/|createBuilderController/);
});
