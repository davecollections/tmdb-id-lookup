import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createElement } from "../builder/node_modules/react/index.js";
import { renderToStaticMarkup } from "../builder/node_modules/react-dom/server.js";
import { createServer } from "../builder/node_modules/vite/dist/node/index.js";
import { createBuilderController } from "../builder/src/application/index.js";
import {
	buildDeletionImpact,
	createDeletionSubmissionGate,
	executeDeletion,
} from "../builder/src/ui/hierarchy-deletion.js";
import { createTargetedNodeEditorDraft } from "../builder/src/ui/hierarchy-actions.js";
import { validateNuvioContract } from "./helpers/nuvio-contract-validator.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vite = await createServer({
	root: path.join(rootDir, "builder"),
	appType: "custom",
	logLevel: "silent",
	server: { middlewareMode: true },
});
const { BuilderWorkspace } = await vite.ssrLoadModule("/src/ui/BuilderWorkspace.jsx");
after(() => vite.close());

function countingIdFactory(prefix = "builder") {
	let count = 0;
	return () => `${prefix}-${++count}`;
}

function createController() {
	return createBuilderController({
		idFactory: countingIdFactory(),
		nuvioIdFactory: countingIdFactory("nuvio"),
		initialProjectTitle: "Hierarchy deletion",
	});
}

function renderWorkspace(controller, props = {}) {
	return renderToStaticMarkup(createElement(BuilderWorkspace, {
		controller,
		state: controller.getState(),
		...props,
	}));
}

function read(relativePath) {
	return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function openingTag(markup, marker) {
	const index = markup.indexOf(marker);
	assert.notEqual(index, -1, marker);
	return markup.slice(markup.lastIndexOf("<", index), markup.indexOf(">", index) + 1);
}

function importHierarchy(controller, value) {
	const result = controller.importValue(value);
	assert.equal(result.ok, true);
	return controller.getState().project;
}

test("deletion impact distinguishes empty collections from descendant folders and sources", () => {
	const controller = createController();
	const project = importHierarchy(controller, [
		{ id: "empty", title: "Empty", folders: [] },
		{
			id: "folders",
			title: "Film Collections",
			folders: [{ id: "empty-folder", title: "Empty folder", sources: [] }],
		},
		{
			id: "full",
			title: "Full",
			folders: [
				{
					id: "one",
					title: "One",
					sources: [{
						provider: "tmdb",
						title: "First",
						tmdbSourceType: "DISCOVER",
						mediaType: "MOVIE",
					}],
				},
				{
					id: "two",
					title: "Two",
					sources: [{
						provider: "tmdb",
						title: "Second",
						tmdbSourceType: "LIST",
						tmdbId: 2,
						mediaType: "TV",
					}],
				},
			],
		},
	]);

	const empty = buildDeletionImpact(controller.getState(), project.collections[0].internalId);
	assert.equal(empty.nodeType, "collection");
	assert.equal(empty.displayName, "Empty");
	assert.equal(empty.confirmationRequired, false);
	assert.equal(empty.confirmationBody, null);

	const folders = buildDeletionImpact(controller.getState(), project.collections[1].internalId);
	assert.equal(folders.confirmationRequired, true);
	assert.equal(folders.descendantFolderCount, 1);
	assert.equal(folders.activeSourceCount, 0);
	assert.equal(folders.confirmationTitle, "Delete “Film Collections”?");
	assert.equal(folders.confirmationBody, "This will permanently remove 1 folder.");

	const full = buildDeletionImpact(controller.getState(), project.collections[2].internalId);
	assert.equal(full.directChildCount, 2);
	assert.equal(full.descendantFolderCount, 2);
	assert.equal(full.activeSourceCount, 2);
	assert.equal(full.confirmationBody, "This will permanently remove 2 folders and 2 sources.");
});

test("folder impact confirms active, projection-only, and uncounted imported source content", () => {
	const controller = createController();
	const project = importHierarchy(controller, [{
		id: "collection",
		title: "Collection",
		folders: [
			{ id: "empty", title: "Empty", sources: [] },
			{
				id: "active",
				title: "Action",
				sources: [{
					provider: "tmdb",
					title: "Source",
					tmdbSourceType: "DISCOVER",
					mediaType: "MOVIE",
				}],
			},
			{
				id: "legacy",
				title: "Legacy",
				sources: [],
				catalogSources: [
					{ addonId: "one", type: "movie", catalogId: "one" },
					{ addonId: "two", type: "series", catalogId: "two" },
				],
			},
		],
	}]);
	const [emptyFolder, activeFolder, legacyFolder] = project.collections[0].folders;

	const empty = buildDeletionImpact(controller.getState(), emptyFolder.internalId);
	assert.equal(empty.confirmationRequired, false);

	const active = buildDeletionImpact(controller.getState(), activeFolder.internalId);
	assert.equal(active.confirmationRequired, true);
	assert.equal(active.activeSourceCount, 1);
	assert.equal(active.confirmationBody, "This will permanently remove 1 source.");

	const legacy = buildDeletionImpact(controller.getState(), legacyFolder.internalId);
	assert.equal(legacy.confirmationRequired, true);
	assert.equal(legacy.activeSourceCount, 0);
	assert.equal(legacy.importedProjectionEntryCount, 2);
	assert.equal(legacy.importedEntryCount, 2);
	assert.equal(legacy.confirmationBody, "This will permanently remove 2 imported source entries.");

	const unusualFolder = controller.createFolder(project.collections[0].internalId, {
		editable: { id: "unusual", title: "Unusual" },
		rawImported: { catalogSources: { legacy: true } },
	});
	assert.equal(unusualFolder.ok, true);
	const unusual = buildDeletionImpact(controller.getState(), unusualFolder.createdInternalId);
	assert.equal(unusual.confirmationRequired, true);
	assert.equal(unusual.hasUncountedImportedSourceData, true);
	assert.equal(unusual.confirmationBody, "This will permanently remove imported source data.");
});

test("individual sources always confirm with safe hidden-title names and fixed copy", () => {
	const controller = createController();
	const project = importHierarchy(controller, [{
		id: "collection",
		title: "Collection",
		folders: [{
			id: "folder",
			title: "Folder",
			sources: [{
				provider: "tmdb",
				title: "\u200e",
				tmdbSourceType: "LIST",
				tmdbId: 3,
				mediaType: "MOVIE",
			}],
		}],
	}]);
	const source = project.collections[0].folders[0].sources[0];
	const impact = buildDeletionImpact(controller.getState(), source.internalId);

	assert.equal(impact.nodeType, "source");
	assert.equal(impact.displayName, "Source with hidden Nuvio title");
	assert.equal(impact.confirmationRequired, true);
	assert.equal(impact.confirmationTitle, "Delete “Source with hidden Nuvio title”?");
	assert.equal(
		impact.confirmationBody,
		"This source will be permanently removed from this folder.",
	);
	assert.equal(impact.submitLabel, "Delete source");
});

test("source recovery chooses next, previous, then its parent without extra revisions", () => {
	const controller = createController();
	let project = importHierarchy(controller, [{
		id: "collection",
		title: "Collection",
		folders: [{
			id: "folder",
			title: "Folder",
			sources: [
				{ provider: "tmdb", title: "A", tmdbSourceType: "LIST", tmdbId: 1, mediaType: "MOVIE" },
				{ provider: "tmdb", title: "B", tmdbSourceType: "LIST", tmdbId: 2, mediaType: "MOVIE" },
				{ provider: "tmdb", title: "C", tmdbSourceType: "LIST", tmdbId: 3, mediaType: "MOVIE" },
			],
		}],
	}]);
	let folder = project.collections[0].folders[0];
	let [first, second, third] = folder.sources;

	controller.selectNode(second.internalId);
	let beforeRevision = controller.getState().revision;
	let impact = buildDeletionImpact(controller.getState(), second.internalId);
	assert.equal(impact.recovery.selectionInternalId, third.internalId);
	assert.equal(executeDeletion(controller, impact, createDeletionSubmissionGate()).ok, true);
	assert.equal(controller.getState().selection.sourceInternalId, third.internalId);
	assert.equal(controller.getState().revision, beforeRevision + 1);

	beforeRevision = controller.getState().revision;
	impact = buildDeletionImpact(controller.getState(), third.internalId);
	assert.equal(impact.recovery.selectionInternalId, first.internalId);
	assert.equal(executeDeletion(controller, impact, createDeletionSubmissionGate()).ok, true);
	assert.equal(controller.getState().selection.sourceInternalId, first.internalId);
	assert.equal(controller.getState().revision, beforeRevision + 1);

	project = controller.getState().project;
	folder = project.collections[0].folders[0];
	first = folder.sources[0];
	beforeRevision = controller.getState().revision;
	impact = buildDeletionImpact(controller.getState(), first.internalId);
	assert.equal(impact.recovery.selectionInternalId, folder.internalId);
	assert.equal(impact.recovery.focus.action, "source-parent");
	assert.equal(executeDeletion(controller, impact, createDeletionSubmissionGate()).ok, true);
	assert.equal(controller.getState().selection.folderInternalId, folder.internalId);
	assert.equal(controller.getState().selection.sourceInternalId, null);
	assert.equal(controller.getState().revision, beforeRevision + 1);
});

test("folder recovery chooses next, previous, then its collection", () => {
	const controller = createController();
	let project = importHierarchy(controller, [{
		id: "collection",
		title: "Collection",
		folders: [
			{ id: "a", title: "A", sources: [] },
			{ id: "b", title: "B", sources: [] },
			{ id: "c", title: "C", sources: [] },
		],
	}]);
	const collection = project.collections[0];
	let [first, second, third] = collection.folders;

	controller.selectNode(second.internalId);
	let impact = buildDeletionImpact(controller.getState(), second.internalId);
	assert.equal(impact.recovery.selectionInternalId, third.internalId);
	executeDeletion(controller, impact, createDeletionSubmissionGate());
	assert.equal(controller.getState().selection.folderInternalId, third.internalId);

	impact = buildDeletionImpact(controller.getState(), third.internalId);
	assert.equal(impact.recovery.selectionInternalId, first.internalId);
	executeDeletion(controller, impact, createDeletionSubmissionGate());
	assert.equal(controller.getState().selection.folderInternalId, first.internalId);

	project = controller.getState().project;
	first = project.collections[0].folders[0];
	impact = buildDeletionImpact(controller.getState(), first.internalId);
	assert.equal(impact.recovery.selectionInternalId, collection.internalId);
	assert.equal(impact.recovery.focus.action, "create-folder-empty");
	executeDeletion(controller, impact, createDeletionSubmissionGate());
	assert.equal(controller.getState().selection.collectionInternalId, collection.internalId);
	assert.equal(controller.getState().selection.folderInternalId, null);
});

test("collection recovery follows complete visible pin-group order", () => {
	const controller = createController();
	const project = importHierarchy(controller, [
		{ id: "ordinary-a", title: "Ordinary A", pinToTop: false, folders: [] },
		{ id: "pinned-a", title: "Pinned A", pinToTop: true, folders: [] },
		{ id: "ordinary-b", title: "Ordinary B", pinToTop: false, folders: [] },
		{ id: "pinned-b", title: "Pinned B", pinToTop: true, folders: [] },
	]);
	const [ordinaryA, pinnedA, ordinaryB, pinnedB] = project.collections;

	controller.selectNode(pinnedB.internalId);
	let impact = buildDeletionImpact(controller.getState(), pinnedB.internalId);
	assert.deepEqual(impact.recovery.visibleSiblingInternalIds, [
		pinnedA.internalId,
		pinnedB.internalId,
		ordinaryA.internalId,
		ordinaryB.internalId,
	]);
	assert.equal(impact.recovery.selectionInternalId, ordinaryA.internalId);
	assert.equal(impact.recovery.mobileLevel, "collections");
	executeDeletion(controller, impact, createDeletionSubmissionGate());
	assert.equal(controller.getState().selection.collectionInternalId, ordinaryA.internalId);

	controller.selectNode(ordinaryB.internalId);
	impact = buildDeletionImpact(controller.getState(), ordinaryB.internalId);
	assert.equal(impact.recovery.selectionInternalId, ordinaryA.internalId);
});

test("deleting outside the selected subtree preserves the complete selection", () => {
	const controller = createController();
	const project = importHierarchy(controller, [{
		id: "collection",
		title: "Collection",
		folders: [
			{
				id: "selected",
				title: "Selected",
				sources: [{
					provider: "tmdb",
					title: "Selected source",
					tmdbSourceType: "DISCOVER",
					mediaType: "MOVIE",
				}],
			},
			{ id: "other", title: "Other", sources: [] },
		],
	}]);
	const [selectedFolder, otherFolder] = project.collections[0].folders;
	controller.selectNode(selectedFolder.sources[0].internalId);
	const beforeSelection = controller.getState().selection;
	const impact = buildDeletionImpact(controller.getState(), otherFolder.internalId);
	assert.equal(impact.recovery.selectionAffected, false);

	const result = executeDeletion(controller, impact, createDeletionSubmissionGate());
	assert.equal(result.ok, true);
	assert.equal(result.selectionResult, null);
	assert.deepEqual(controller.getState().selection, beforeSelection);
});

test("submission gate prevents a second remove call and failures retain diagnostics", () => {
	let removeCalls = 0;
	let selectionCalls = 0;
	const controller = {
		removeNode() {
			removeCalls += 1;
			return { ok: true, errors: [] };
		},
		selectNode() {
			selectionCalls += 1;
			return { ok: true, errors: [] };
		},
		clearSelection() {
			selectionCalls += 1;
			return { ok: true, errors: [] };
		},
	};
	const impact = {
		internalId: "target",
		recovery: {
			selectionAffected: true,
			selectionInternalId: "next",
		},
	};
	const gate = createDeletionSubmissionGate();
	assert.equal(executeDeletion(controller, impact, gate).ok, true);
	assert.equal(executeDeletion(controller, impact, gate).started, false);
	assert.equal(removeCalls, 1);
	assert.equal(selectionCalls, 1);

	const diagnostic = {
		code: "CONTROLLER_OPERATION_FAILED",
		path: "$controller.removeNode",
		message: "The requested node could not be removed.",
	};
	const failed = executeDeletion({
		removeNode() {
			return { ok: false, errors: [diagnostic] };
		},
		selectNode() {
			throw new Error("selection must not run after failed removal");
		},
	}, impact, createDeletionSubmissionGate());
	assert.equal(failed.ok, false);
	assert.equal(failed.started, true);
	assert.deepEqual(failed.result.errors, [diagnostic]);
});

test("cancelled confirmation is mutation-free and does not consume a revision", () => {
	const controller = createController();
	const project = importHierarchy(controller, [{
		id: "collection",
		title: "Collection",
		folders: [{ id: "folder", title: "Folder", sources: [] }],
	}]);
	const before = controller.getState();
	const impact = buildDeletionImpact(controller.getState(), project.collections[0].internalId);
	assert.equal(impact.confirmationRequired, true);

	// A UI cancellation deliberately does not call executeDeletion.
	assert.equal(controller.getState(), before);
	assert.equal(controller.getState().revision, before.revision);
	assert.equal(controller.getState().project.collections.length, 1);
});

test("source deletion rebuilds addon projections and preserves unrelated values and order", () => {
	const controller = createController();
	const project = importHierarchy(controller, [{
		id: "collection",
		title: "Collection",
		unknownCollection: { keep: true },
		folders: [{
			id: "folder",
			title: "Folder",
			unknownFolder: ["keep"],
			sources: [
				{
					provider: "addon",
					title: "One",
					addonId: "addon",
					type: "movie",
					catalogId: "one",
					unknownSource: "remove",
				},
				{
					provider: "tmdb",
					title: "Native",
					tmdbSourceType: "DISCOVER",
					mediaType: "MOVIE",
					unknownNative: "keep-native",
				},
				{
					provider: "addon",
					title: "Two",
					addonId: "addon",
					type: "series",
					catalogId: "two",
					unknownSource: "keep-addon",
				},
			],
			catalogSources: [
				{
					addonId: "addon",
					type: "movie",
					catalogId: "one",
					unknownProjection: "remove-projection",
				},
				{
					addonId: "addon",
					type: "series",
					catalogId: "two",
					unknownProjection: "keep-projection",
				},
			],
		}],
	}]);
	const folder = project.collections[0].folders[0];
	controller.selectNode(folder.sources[0].internalId);
	const beforeRevision = controller.getState().revision;
	const impact = buildDeletionImpact(controller.getState(), folder.sources[0].internalId);
	assert.equal(executeDeletion(controller, impact, createDeletionSubmissionGate()).ok, true);
	assert.equal(controller.getState().revision, beforeRevision + 1);

	const first = controller.stringifyProject();
	assert.equal(first.ok, true);
	const outputFolder = first.value[0].folders[0];
	assert.deepEqual(outputFolder.sources.map((source) => source.title), ["Native", "Two"]);
	assert.deepEqual(outputFolder.catalogSources.map((source) => source.catalogId), ["two"]);
	assert.equal(outputFolder.catalogSources[0].unknownProjection, "keep-projection");
	assert.equal(outputFolder.sources[0].unknownNative, "keep-native");
	assert.equal(outputFolder.sources[1].unknownSource, "keep-addon");
	assert.deepEqual(first.value[0].unknownCollection, { keep: true });
	assert.deepEqual(outputFolder.unknownFolder, ["keep"]);
	assert.equal(JSON.stringify(first.value).includes("internalId"), false);
	assert.equal(validateNuvioContract(first.value, { mode: "canonical-builder-output" }).valid, true);

	const cycled = createController();
	assert.equal(cycled.importValue(first.value).ok, true);
	const second = cycled.stringifyProject();
	assert.equal(second.ok, true);
	assert.deepEqual(second.value, first.value);
	assert.equal(second.json, first.json);
});

test("collection and folder deletion remove exactly one subtree", () => {
	const controller = createController();
	let project = importHierarchy(controller, [
		{
			id: "remove",
			title: "Remove",
			folders: [{ id: "remove-folder", title: "Remove folder", sources: [] }],
		},
		{
			id: "keep",
			title: "Keep",
			unknownCollection: "keep-collection",
			folders: [
				{ id: "remove-child", title: "Remove child", sources: [] },
				{
					id: "keep-child",
					title: "Keep child",
					unknownFolder: "keep-folder",
					sources: [{
						provider: "tmdb",
						title: "Keep source",
						tmdbSourceType: "DISCOVER",
						mediaType: "MOVIE",
						unknownSource: "keep-source",
					}],
				},
			],
		},
	]);
	const before = controller.serializeProject();
	assert.equal(before.ok, true);
	const keepBefore = structuredClone(before.value[1]);

	let impact = buildDeletionImpact(controller.getState(), project.collections[0].internalId);
	assert.equal(executeDeletion(controller, impact, createDeletionSubmissionGate()).ok, true);
	assert.deepEqual(controller.serializeProject().value[0], keepBefore);

	project = controller.getState().project;
	const removeChild = project.collections[0].folders[0];
	const keepChildBefore = structuredClone(controller.serializeProject().value[0].folders[1]);
	impact = buildDeletionImpact(controller.getState(), removeChild.internalId);
	assert.equal(executeDeletion(controller, impact, createDeletionSubmissionGate()).ok, true);
	assert.deepEqual(controller.serializeProject().value[0].folders, [keepChildBefore]);
});

test("populated lists keep top actions, append bottom Add rows, and expose no source Add action", () => {
	const controller = createController();
	const project = importHierarchy(controller, [{
		id: "collection",
		title: "Collection",
		folders: [{
			id: "folder",
			title: "Folder",
			sources: [{
				provider: "tmdb",
				title: "Source",
				tmdbSourceType: "DISCOVER",
				mediaType: "MOVIE",
			}],
		}],
	}]);
	controller.selectNode(project.collections[0].folders[0].internalId);
	const markup = renderWorkspace(controller);

	for (const action of [
		"create-collection",
		"create-folder",
		"create-collection-after-list",
		"create-folder-after-list",
	]) {
		assert.equal((markup.match(new RegExp(`data-action="${action}"`, "g")) ?? []).length, 1, action);
	}
	assert.ok(markup.includes("New collection"));
	assert.ok(markup.includes("New folder"));
	assert.ok(markup.includes("Add another collection"));
	assert.ok(markup.includes("Add another folder"));
	assert.equal(markup.includes("create-source-after-list"), false);
	assert.equal(markup.includes("Add another source"), false);

	const workspace = read("builder/src/ui/BuilderWorkspace.jsx");
	assert.match(workspace, /noun="collection"[\s\S]*onClick=\{createCollection\}/);
	assert.match(workspace, /noun="folder"[\s\S]*onClick=\{createFolder\}/);
	assert.match(workspace, /createdCardRef\.current\.scrollIntoView/);
});

test("empty lists retain large Add actions and omit populated-list actions", () => {
	const emptyController = createController();
	let markup = renderWorkspace(emptyController);
	assert.ok(markup.includes('data-action="create-collection-empty"'));
	assert.equal(markup.includes("create-collection-after-list"), false);

	const folderController = createController();
	const project = importHierarchy(folderController, [{
		id: "collection",
		title: "Collection",
		folders: [],
	}]);
	folderController.selectNode(project.collections[0].internalId);
	markup = renderWorkspace(folderController);
	assert.ok(markup.includes('data-action="create-folder-empty"'));
	assert.ok(markup.includes('data-action="create-collection-after-list"'));
	assert.equal(markup.includes("create-folder-after-list"), false);
	assert.equal(markup.includes("create-source"), false);
});

test("every row has one in-card accessible actions menu with the required items", () => {
	const controller = createController();
	const project = importHierarchy(controller, [{
		id: "collection",
		title: "\u200e",
		folders: [{
			id: "folder",
			title: "Action",
			sources: [{
				provider: "community",
				title: "",
				unknown: true,
			}],
		}],
	}]);
	controller.selectNode(project.collections[0].folders[0].internalId);
	const markup = renderWorkspace(controller);
	assert.equal((markup.match(/data-action="delete-collection"/g) ?? []).length, 1);
	assert.equal((markup.match(/data-action="delete-folder"/g) ?? []).length, 1);
	assert.equal((markup.match(/data-action="delete-source"/g) ?? []).length, 1);
	assert.equal((markup.match(/data-action="open-collection-actions"/g) ?? []).length, 1);
	assert.equal((markup.match(/data-action="open-folder-actions"/g) ?? []).length, 1);
	assert.equal((markup.match(/data-action="open-source-actions"/g) ?? []).length, 1);
	assert.ok(markup.includes('aria-label="Actions for collection “Collection with hidden Nuvio title”"'));
	assert.ok(markup.includes('aria-label="Actions for folder “Action”"'));
	assert.ok(markup.includes('aria-label="Actions for source “Preserved source”"'));
	assert.equal((markup.match(/aria-haspopup="menu"/g) ?? []).length, 3);
	assert.match(
		markup,
		/data-card-layout="collection"><div class="hierarchy-card-main[\s\S]*?data-node-type="collection"[\s\S]*?data-hierarchy-actions="collection"[\s\S]*?data-action="edit-collection"[\s\S]*?data-action="delete-collection"[\s\S]*?<\/div><\/div>/,
	);
	assert.match(
		markup,
		/data-card-layout="source"><div class="hierarchy-card-main[\s\S]*?data-node-type="source"[\s\S]*?data-hierarchy-actions="source"[\s\S]*?data-action="delete-source"[\s\S]*?<\/div><\/div>/,
	);
	assert.equal(markup.includes('data-action="edit-source"'), false);
});

test("delete confirmation is semantic, inert, specifically labelled, and initially safe", () => {
	const controller = createController();
	const project = importHierarchy(controller, [{
		id: "collection",
		title: "Collection",
		folders: [{ id: "folder", title: "Folder", sources: [] }],
	}]);
	controller.selectNode(project.collections[0].internalId);
	const impact = buildDeletionImpact(controller.getState(), project.collections[0].internalId);
	const markup = renderWorkspace(controller, { initialDeleteConfirmation: impact });

	assert.ok(openingTag(markup, 'data-workspace-underlay="true"').includes("inert"));
	assert.match(markup, /data-delete-confirmation="collection" role="dialog" aria-modal="true"/);
	assert.ok(markup.includes('aria-labelledby="delete-confirmation-title"'));
	assert.ok(markup.includes('aria-describedby="delete-confirmation-description"'));
	assert.ok(markup.includes("This will permanently remove 1 folder."));
	assert.ok(markup.indexOf('data-action="cancel-delete"') < markup.indexOf('data-action="confirm-delete"'));
	assert.ok(markup.includes(">Delete collection</button>"));
	assert.equal(markup.includes(">OK</button>"), false);

	for (const action of [
		"create-collection",
		"create-folder",
		"create-collection-after-list",
		"create-folder-after-list",
		"edit-collection",
		"edit-folder",
		"delete-collection",
		"delete-folder",
		"reorder-collection",
		"reorder-folder",
	]) {
		assert.ok(openingTag(markup, `data-action="${action}"`).includes("disabled"), action);
	}

	const modal = read("builder/src/ui/DeleteConfirmation.jsx");
	const workspace = read("builder/src/ui/BuilderWorkspace.jsx");
	assert.match(modal, /cancelButtonRef\.current\?\.focus\(\)/);
	assert.match(modal, /handleDialogKeyDown\([\s\S]*onCancel/);
	assert.match(workspace, /deleteTriggerRef\.current[\s\S]*trigger\?\.focus\?\.\(\)/);
	assert.doesNotMatch(`${modal}\n${workspace}`, /\bwindow\.confirm\b|\bconfirm\s*\(/);
});

test("editor, delete, return, and pointer gates cover every new hierarchy action", () => {
	const controller = createController();
	const project = importHierarchy(controller, [{
		id: "collection",
		title: "Collection",
		folders: [{ id: "folder", title: "Folder", sources: [] }],
	}]);
	const collection = project.collections[0];
	controller.selectNode(collection.internalId);
	const editorDraft = createTargetedNodeEditorDraft(controller, collection);
	const editorMarkup = renderWorkspace(controller, { initialEditorDraft: editorDraft });
	for (const action of [
		"create-collection-after-list",
		"create-folder-after-list",
		"delete-collection",
		"delete-folder",
	]) {
		assert.ok(openingTag(editorMarkup, `data-action="${action}"`).includes("disabled"), action);
	}

	const returnMarkup = renderWorkspace(controller, { initialReturnConfirmationOpen: true });
	for (const action of [
		"create-collection-after-list",
		"create-folder-after-list",
		"delete-collection",
		"delete-folder",
	]) {
		assert.ok(openingTag(returnMarkup, `data-action="${action}"`).includes("disabled"), action);
	}

	const workspace = read("builder/src/ui/BuilderWorkspace.jsx");
	const actionsMenu = read("builder/src/ui/HierarchyActionsMenu.jsx");
	assert.match(workspace, /function requestDeletion[\s\S]*navigationLocked \|\| pointerInteractionLocked\(\)/);
	assert.match(workspace, /function createCollection[\s\S]*hierarchyInteractionLocked \|\| pointerInteractionLocked\(\)/);
	assert.match(workspace, /function createFolder[\s\S]*pointerInteractionLocked\(\)/);
	assert.match(workspace, /setKeyboardReorderInternalId\(null\)[\s\S]*setDeleteConfirmation\(impact\)/);
	assert.match(actionsMenu, /onClose\(\{ restoreFocus: false \}\);[\s\S]*action\(node\.internalId, trigger\)/);
	assert.match(actionsMenu, /document\.addEventListener\("pointerdown"/);
	assert.match(actionsMenu, /event\.key === "Escape"/);
	assert.match(actionsMenu, /event\.key !== "ArrowDown" && event\.key !== "ArrowUp"/);
});

test("styles keep Add, actions menus, dialog, and responsive layouts touch-safe and overflow-bounded", () => {
	const styles = read("builder/src/styles.css");
	assert.match(styles, /\.hierarchy-add-action\s*\{[\s\S]*min-height:\s*46px[\s\S]*cursor:\s*pointer/);
	assert.match(styles, /\.hierarchy-actions-trigger\s*\{[\s\S]*width:\s*46px[\s\S]*height:\s*46px/);
	assert.match(styles, /\.hierarchy-actions-icon\s*\{[\s\S]*width:\s*20px[\s\S]*height:\s*20px/);
	assert.match(styles, /\.hierarchy-card-row\s*\{[\s\S]*display:\s*block/);
	assert.match(styles, /\.hierarchy-card-main\s*\{[\s\S]*grid-template-columns:\s*46px minmax\(0,\s*1fr\) 46px/);
	assert.match(styles, /\.hierarchy-actions-menu\s*\{[\s\S]*position:\s*fixed[\s\S]*z-index:\s*900[\s\S]*width:\s*156px/);
	assert.match(styles, /\.delete-confirmation\s*\{[\s\S]*width:\s*min\(100%,\s*520px\)/);
	assert.match(styles, /@media \(max-width: 619px\)[\s\S]*\.delete-confirmation\s*\{[\s\S]*max-height:\s*calc\(100dvh - 24px\)/);
	assert.match(
		styles,
		/@media \(min-width: 900px\)[\s\S]*\.workspace\s*\{[\s\S]*minmax\(265px,\s*0\.8fr\)[\s\S]*minmax\(270px,\s*1\.35fr\)[\s\S]*\.panel-header,[\s\S]*\.panel-body\s*\{[\s\S]*padding-right:\s*12px[\s\S]*padding-left:\s*12px/,
	);
	assert.match(
		styles,
		/@media \(min-width: 900px\) and \(max-width: 1023px\)[\s\S]*\.app-header\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
	);
	assert.match(
		styles,
		/@media \(min-width: 900px\) and \(max-width: 1239px\)[\s\S]*\.panel-header \.primary-action\s*\{[\s\S]*width:\s*46px[\s\S]*font-size:\s*0[\s\S]*\.hierarchy-card-main\s*\{[\s\S]*gap:\s*4px[\s\S]*\.node-title\s*\{[\s\S]*font-size:\s*0\.9rem/,
	);
	assert.match(
		styles,
		/@media \(min-width: 1240px\)[\s\S]*\.panel-header,[\s\S]*\.panel-body\s*\{[\s\S]*padding-right:\s*20px[\s\S]*padding-left:\s*20px/,
	);
	assert.match(styles, /\.hierarchy-actions-menu button:focus-visible/);
	assert.match(styles, /\.hierarchy-add-action:active:not\(:disabled\)/);
	assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
	assert.match(styles, /body\s*\{[\s\S]*overflow-x:\s*hidden/);
});
