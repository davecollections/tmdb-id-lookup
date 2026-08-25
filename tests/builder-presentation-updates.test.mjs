import assert from "node:assert/strict";
import test from "node:test";

import { createBuilderController } from "../builder/src/application/index.js";
import { updateEditableValuesMany } from "../builder/src/domain/index.js";

function countingIdFactory(prefix = "presentation") {
	let calls = 0;
	return () => `${prefix}-${++calls}`;
}

function createPresentationController() {
	const controller = createBuilderController({ idFactory: countingIdFactory() });
	const imported = controller.importValue([
		{
			id: "collection-a",
			title: "Collection A",
			viewMode: "FOLLOW_LAYOUT",
			showAllTab: true,
			pinToTop: true,
			backdropImageUrl: "https://saved.example/collection-a.webp",
			focusGlowEnabled: true,
			unknownCollectionData: { keep: "collection-a" },
			folders: [
				{
					id: "folder-a",
					title: "Folder A",
					hideTitle: false,
					tileShape: "POSTER",
					coverImageUrl: "https://saved.example/folder-a-cover.webp",
					heroBackdropUrl: "https://saved.example/folder-a-hero.webp",
					titleLogoUrl: "https://saved.example/folder-a-logo.webp",
					focusGifUrl: "https://saved.example/folder-a-focus.webp",
					focusGifEnabled: true,
					heroVideoUrl: "https://saved.example/folder-a-video.mp4",
					coverEmoji: "A",
					unknownFolderData: { keep: "folder-a" },
					sources: [
						{
							provider: "community",
							addonId: "community.example",
							type: "movie",
							catalogId: "first",
							unknownSourceData: { keep: 1 },
						},
						{
							provider: "community",
							addonId: "community.example",
							type: "series",
							catalogId: "second",
							unknownSourceData: { keep: 2 },
						},
					],
				},
				{
					id: "folder-b",
					title: "Folder B",
					hideTitle: true,
					tileShape: "LANDSCAPE",
					coverImageUrl: "https://saved.example/folder-b-cover.webp",
					heroBackdropUrl: "https://saved.example/folder-b-hero.webp",
					titleLogoUrl: "https://saved.example/folder-b-logo.webp",
					focusGifUrl: "https://saved.example/folder-b-focus.webp",
					focusGifEnabled: false,
					sources: [],
				},
			],
		},
		{
			id: "collection-b",
			title: "Collection B",
			viewMode: "ROWS",
			showAllTab: false,
			pinToTop: false,
			backdropImageUrl: "https://saved.example/collection-b.webp",
			folders: [
				{
					id: "folder-c",
					title: "Folder C",
					hideTitle: false,
					tileShape: "SQUARE",
					coverImageUrl: "https://saved.example/folder-c-cover.webp",
					heroBackdropUrl: "",
					titleLogoUrl: "",
					focusGifUrl: "",
					focusGifEnabled: false,
					sources: [],
				},
			],
		},
	]);
	assert.equal(imported.ok, true);

	const [collectionA, collectionB] = controller.getState().project.collections;
	const [folderA, folderB] = collectionA.folders;
	const [folderC] = collectionB.folders;
	return { controller, collectionA, collectionB, folderA, folderB, folderC };
}

function update(nodeType, node, patch) {
	return { nodeType, internalId: node.internalId, patch };
}

function assertAtomicFailure(controller, updates, { code = "INVALID_CONTROLLER_ARGUMENT", path } = {}) {
	const before = controller.getState();
	const result = controller.applyPresentationUpdates(updates);

	assert.equal(result.ok, false);
	assert.equal(result.errors[0].code, code);
	if (path !== undefined) {
		assert.equal(result.errors[0].path, path);
	}
	assert.equal(controller.getState().project, before.project);
	assert.equal(controller.getState().revision, before.revision);
	return result;
}

test("two Collection presentation patches commit once and notify subscribers once", () => {
	const { controller, collectionA, collectionB } = createPresentationController();
	const before = controller.getState();
	const notifications = [];
	controller.subscribe(() => notifications.push(controller.getState()));

	const result = controller.applyPresentationUpdates([
		update("collection", collectionA, {
			title: "Updated Collection A",
			viewMode: "TABBED_GRID",
			showAllTab: false,
			backdropImageUrl: "",
		}),
		update("collection", collectionB, {
			title: "Updated Collection B",
			viewMode: "ROWS",
			pinToTop: true,
		}),
	]);

	assert.equal(result.ok, true);
	assert.deepEqual(result.changedTargets, [
		{ nodeType: "collection", internalId: collectionA.internalId },
		{ nodeType: "collection", internalId: collectionB.internalId },
	]);
	assert.equal(controller.getState().revision, before.revision + 1);
	assert.equal(notifications.length, 1);
	assert.equal(notifications[0], controller.getState());
	const [updatedA, updatedB] = controller.getState().project.collections;
	assert.equal(updatedA.editable.title, "Updated Collection A");
	assert.equal(updatedA.editable.viewMode, "TABBED_GRID");
	assert.equal(updatedA.editable.showAllTab, false);
	assert.equal(updatedA.editable.backdropImageUrl, "");
	assert.equal(updatedA.editable.pinToTop, true);
	assert.equal(updatedA.editable.focusGlowEnabled, true);
	assert.equal(updatedB.editable.title, "Updated Collection B");
	assert.equal(updatedB.editable.viewMode, "ROWS");
	assert.equal(updatedB.editable.pinToTop, true);
});

test("two Folder patches pass resolved artwork through exactly and preserve structure and imported data", () => {
	const { controller, collectionA, folderA, folderB } = createPresentationController();
	const before = controller.getState();
	const beforeFolderIds = collectionA.folders.map((folder) => folder.internalId);
	const beforeSourceIds = folderA.sources.map((source) => source.internalId);
	const beforeSources = folderA.sources;
	const beforeRawFolder = folderA.rawImported;
	const beforeRawSource = folderA.sources[0].rawImported;

	const result = controller.applyPresentationUpdates([
		update("folder", folderA, {
			title: "Updated Folder A",
			hideTitle: true,
			tileShape: "LANDSCAPE",
			coverImageUrl: "custom-scheme://resolved cover",
			heroBackdropUrl: "resolved backdrop value",
			titleLogoUrl: "",
			focusGifUrl: "custom-scheme://resolved focus",
			focusGifEnabled: false,
		}),
		update("folder", folderB, {
			title: "Updated Folder B",
			hideTitle: false,
			tileShape: "POSTER",
			coverImageUrl: "",
		}),
	]);

	assert.equal(result.ok, true);
	assert.equal(controller.getState().revision, before.revision + 1);
	const updatedCollection = controller.getState().project.collections[0];
	const [updatedA, updatedB] = updatedCollection.folders;
	assert.deepEqual(updatedCollection.folders.map((folder) => folder.internalId), beforeFolderIds);
	assert.deepEqual(updatedA.sources.map((source) => source.internalId), beforeSourceIds);
	assert.equal(updatedA.sources, beforeSources);
	assert.equal(updatedA.rawImported, beforeRawFolder);
	assert.equal(updatedA.sources[0].rawImported, beforeRawSource);
	assert.equal(updatedA.rawImported.unknownFolderData.keep, "folder-a");
	assert.equal(updatedA.sources[0].rawImported.unknownSourceData.keep, 1);
	assert.equal(updatedA.editable.tileShape, "LANDSCAPE");
	assert.equal(updatedA.editable.coverImageUrl, "custom-scheme://resolved cover");
	assert.equal(updatedA.editable.heroBackdropUrl, "resolved backdrop value");
	assert.equal(updatedA.editable.titleLogoUrl, "");
	assert.equal(updatedA.editable.focusGifUrl, "custom-scheme://resolved focus");
	assert.equal(updatedA.editable.focusGifEnabled, false);
	assert.equal(updatedA.editable.heroVideoUrl, "https://saved.example/folder-a-video.mp4");
	assert.equal(updatedA.editable.coverEmoji, "A");
	assert.equal(updatedB.editable.tileShape, "POSTER");
	assert.equal(updatedB.editable.coverImageUrl, "");
	assert.deepEqual(
		controller.getState().project.collections.map((collection) => collection.internalId),
		before.project.collections.map((collection) => collection.internalId),
	);
});

test("mixed Collection and Folder updates share one commit and report changed targets in request order", () => {
	const { controller, collectionA, folderA, folderC } = createPresentationController();
	const before = controller.getState();
	const savedCover = folderA.editable.coverImageUrl;
	const request = [
		update("folder", folderC, { title: "Mixed Folder C" }),
		update("collection", collectionA, { title: "Mixed Collection A" }),
		update("folder", folderA, { tileShape: "LANDSCAPE" }),
	];

	const result = controller.applyPresentationUpdates(request);

	assert.equal(result.ok, true);
	assert.equal(controller.getState().revision, before.revision + 1);
	assert.deepEqual(result.changedTargets, request.map(({ nodeType, internalId }) => ({ nodeType, internalId })));
	const [updatedCollectionA, updatedCollectionB] = controller.getState().project.collections;
	assert.equal(updatedCollectionA.editable.title, "Mixed Collection A");
	assert.equal(updatedCollectionA.editable.viewMode, "FOLLOW_LAYOUT");
	assert.equal(updatedCollectionA.folders[0].editable.tileShape, "LANDSCAPE");
	assert.equal(updatedCollectionA.folders[0].editable.coverImageUrl, savedCover);
	assert.equal(updatedCollectionB.folders[0].editable.title, "Mixed Folder C");
	assert.equal(updatedCollectionB.folders[0].editable.tileShape, "SQUARE");
});

test("stale, duplicate, and wrong-type targets fail atomically without content revisions", () => {
	const { controller, collectionA, collectionB, folderA } = createPresentationController();

	assertAtomicFailure(controller, [
		update("collection", collectionA, { title: "Must not apply" }),
		{ nodeType: "folder", internalId: "stale-folder", patch: { title: "Stale" } },
	], {
		code: "TARGET_NODE_NOT_FOUND",
		path: "$controller.applyPresentationUpdates[1].internalId",
	});
	assert.equal(controller.getState().project.collections[0].editable.title, "Collection A");

	assertAtomicFailure(controller, [
		update("collection", collectionB, { title: "First" }),
		update("collection", collectionB, { title: "Duplicate" }),
	], { path: "$controller.applyPresentationUpdates[1].internalId" });

	assertAtomicFailure(controller, [
		update("folder", collectionA, { title: "Wrong type" }),
	], { path: "$controller.applyPresentationUpdates[0].nodeType" });

	assertAtomicFailure(controller, [
		update("collection", folderA, { title: "Wrong type again" }),
	], { path: "$controller.applyPresentationUpdates[0].nodeType" });
});

test("hidden, compatibility, structural, child, and unknown fields are rejected", () => {
	const { controller, collectionA, folderA } = createPresentationController();
	const unsupported = [
		["collection", collectionA, "focusGlowEnabled", false],
		["collection", collectionA, "id", "replacement"],
		["collection", collectionA, "folders", []],
		["collection", collectionA, "unknown", "value"],
		["folder", folderA, "heroVideoUrl", "replacement"],
		["folder", folderA, "coverEmoji", "replacement"],
		["folder", folderA, "id", "replacement"],
		["folder", folderA, "sources", []],
		["folder", folderA, "unknown", "value"],
	];

	for (const [nodeType, node, field, value] of unsupported) {
		assertAtomicFailure(controller, [update(nodeType, node, { [field]: value })], {
			path: `$controller.applyPresentationUpdates[0].patch.${field}`,
		});
	}
});

test("presentation values are strict while the intentional invisible title remains valid", () => {
	const { controller, collectionA, folderA } = createPresentationController();
	const invalidValues = [
		["collection", collectionA, "title", ""],
		["collection", collectionA, "title", " \t "],
		["collection", collectionA, "viewMode", "FOLLOW_LAYOUT"],
		["collection", collectionA, "viewMode", "rows"],
		["collection", collectionA, "showAllTab", "false"],
		["collection", collectionA, "pinToTop", null],
		["collection", collectionA, "backdropImageUrl", undefined],
		["folder", folderA, "tileShape", "SQUARE"],
		["folder", folderA, "hideTitle", 0],
		["folder", folderA, "focusGifEnabled", null],
		["folder", folderA, "coverImageUrl", false],
	];

	for (const [nodeType, node, field, value] of invalidValues) {
		assertAtomicFailure(controller, [update(nodeType, node, { [field]: value })], {
			path: `$controller.applyPresentationUpdates[0].patch.${field}`,
		});
	}

	const beforeRevision = controller.getState().revision;
	const accepted = controller.applyPresentationUpdates([
		update("folder", folderA, { title: "\u200E" }),
	]);
	assert.equal(accepted.ok, true);
	assert.equal(controller.getState().revision, beforeRevision + 1);
	assert.equal(controller.getState().project.collections[0].folders[0].editable.title, "\u200E");
});

test("omission, explicit blank, explicit false, partial no-op, total no-op, and empty input stay distinct", () => {
	const { controller, collectionA, collectionB, folderA } = createPresentationController();
	const notifications = [];
	controller.subscribe(() => notifications.push(controller.getState()));
	const initial = controller.getState();

	const empty = controller.applyPresentationUpdates([]);
	assert.equal(empty.ok, true);
	assert.deepEqual(empty.changedTargets, []);
	assert.equal(controller.getState(), initial);

	const totalNoOp = controller.applyPresentationUpdates([
		update("collection", collectionA, { title: "Collection A", pinToTop: true }),
		update("folder", folderA, {}),
	]);
	assert.deepEqual(totalNoOp.changedTargets, []);
	assert.equal(controller.getState(), initial);
	assert.equal(notifications.length, 0);

	const explicit = controller.applyPresentationUpdates([
		update("collection", collectionA, { backdropImageUrl: "", pinToTop: false }),
		update("folder", folderA, { titleLogoUrl: "", focusGifEnabled: false }),
	]);
	assert.deepEqual(explicit.changedTargets, [
		{ nodeType: "collection", internalId: collectionA.internalId },
		{ nodeType: "folder", internalId: folderA.internalId },
	]);
	assert.equal(controller.getState().revision, initial.revision + 1);
	assert.equal(notifications.length, 1);
	const afterExplicit = controller.getState();
	const updatedA = afterExplicit.project.collections[0];
	const updatedFolderA = updatedA.folders[0];
	assert.equal(updatedA.editable.backdropImageUrl, "");
	assert.equal(updatedA.editable.pinToTop, false);
	assert.equal(updatedA.editable.showAllTab, true);
	assert.equal(updatedFolderA.editable.titleLogoUrl, "");
	assert.equal(updatedFolderA.editable.focusGifEnabled, false);
	assert.equal(updatedFolderA.editable.heroBackdropUrl, "https://saved.example/folder-a-hero.webp");

	const partial = controller.applyPresentationUpdates([
		update("collection", collectionA, { backdropImageUrl: "", pinToTop: false }),
		update("collection", collectionB, { title: "Only real change" }),
	]);
	assert.equal(controller.getState().revision, afterExplicit.revision + 1);
	assert.equal(notifications.length, 2);
	assert.deepEqual(partial.changedTargets, [
		{ nodeType: "collection", internalId: collectionB.internalId },
	]);

	const afterPartial = controller.getState();
	const repeated = controller.applyPresentationUpdates([
		update("collection", collectionB, { title: "Only real change" }),
	]);
	assert.deepEqual(repeated.changedTargets, []);
	assert.equal(controller.getState(), afterPartial);
	assert.equal(notifications.length, 2);
});

test("the domain multi-update operation rebuilds affected branches once and rejects unresolved targets", () => {
	const { controller, collectionA, folderA } = createPresentationController();
	const original = controller.getState().project;
	const originalSources = folderA.sources;
	const originalRawCollection = collectionA.rawImported;
	const originalRawFolder = folderA.rawImported;

	const updated = updateEditableValuesMany(original, [
		{ internalId: collectionA.internalId, editablePatch: { title: "Domain Collection" } },
		{ internalId: folderA.internalId, editablePatch: { title: "Domain Folder" } },
	]);

	assert.notEqual(updated, original);
	assert.equal(original.collections[0].editable.title, "Collection A");
	assert.equal(original.collections[0].folders[0].editable.title, "Folder A");
	assert.equal(updated.collections[0].editable.title, "Domain Collection");
	assert.equal(updated.collections[0].folders[0].editable.title, "Domain Folder");
	assert.equal(updated.collections[0].rawImported, originalRawCollection);
	assert.equal(updated.collections[0].folders[0].rawImported, originalRawFolder);
	assert.equal(updated.collections[0].folders[0].sources, originalSources);
	assert.deepEqual(
		updated.collections[0].folders[0].sources.map((source) => source.internalId),
		originalSources.map((source) => source.internalId),
	);
	assert.throws(
		() => updateEditableValuesMany(original, [
			{ internalId: collectionA.internalId, editablePatch: { title: "First" } },
			{ internalId: collectionA.internalId, editablePatch: { title: "Second" } },
		]),
		/Duplicate update target/,
	);
	assert.throws(
		() => updateEditableValuesMany(original, [
			{ internalId: "missing", editablePatch: { title: "Missing" } },
		]),
		/Expected exactly one node/,
	);
	assert.equal(updateEditableValuesMany(original, []), original);
});
