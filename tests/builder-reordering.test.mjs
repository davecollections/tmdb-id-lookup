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
	buildSiblingMovements,
	crossedDragThreshold,
	dragOverlayTop,
	establishPointerCapture,
	insertionIndicatorForDestination,
	moveSiblingNode,
	moveSiblingNodeToPosition,
	movementAnnouncement,
	movementPositionAnnouncement,
	pointerDestinationForY,
	pointerSessionLocksInteraction,
	provisionalDragLayout,
	reorderAutoScrollDelta,
	reorderHandleLabel,
	visiblePositionForGroupDestination,
} from "../builder/src/ui/hierarchy-reordering.js";
import { buildBuilderViewModel } from "../builder/src/ui/view-model.js";

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
		initialProjectTitle: "Reordering test",
	});
}

function renderWorkspace(controller) {
	return renderToStaticMarkup(createElement(BuilderWorkspace, {
		controller,
		state: controller.getState(),
	}));
}

function openingTag(markup, marker) {
	const markerIndex = markup.indexOf(marker);
	assert.notEqual(markerIndex, -1, `Missing marker: ${marker}`);
	const start = markup.lastIndexOf("<button", markerIndex);
	const end = markup.indexOf(">", markerIndex);
	return markup.slice(start, end + 1);
}

function functionBlock(source, name, nextName) {
	const start = source.indexOf(`\tfunction ${name}(`);
	const end = source.indexOf(`\n\tfunction ${nextName}(`, start);
	assert.notEqual(start, -1, `Missing function ${name}`);
	assert.notEqual(end, -1, `Missing function ${nextName} after ${name}`);
	return source.slice(start, end);
}

function loadFixture(relativePath) {
	return JSON.parse(fs.readFileSync(path.join(rootDir, relativePath), "utf8"));
}

function collectionIds(controller) {
	return controller.getState().project.collections.map((collection) => collection.editable.id);
}

test("visible collection movement groups interleaved pinned and ordinary arrays with raw-index targets", () => {
	const nodes = [
		{ internalId: "ordinary-a", editable: { pinToTop: false } },
		{ internalId: "pinned-a", editable: { pinToTop: true } },
		{ internalId: "ordinary-b", editable: { pinToTop: false } },
		{ internalId: "pinned-b", editable: { pinToTop: true } },
		{ internalId: "unusual", editable: { pinToTop: "preserve-raw" } },
	];
	const movement = buildSiblingMovements(nodes, { groupPinnedCollections: true });

	assert.deepEqual(movement.map((entry) => entry.node.internalId), [
		"pinned-a",
		"pinned-b",
		"ordinary-a",
		"ordinary-b",
		"unusual",
	]);
	assert.deepEqual(
		movement.map(({ moveUpTargetIndex, moveDownTargetIndex }) => (
			[moveUpTargetIndex, moveDownTargetIndex]
		)),
		[
			[null, 3],
			[1, null],
			[null, 2],
			[0, 4],
			[2, null],
		],
	);
	assert.deepEqual(
		movement.map((entry) => [
			entry.reorderGroup,
			entry.reorderGroupPosition,
			entry.reorderGroupSize,
			entry.reorderVisiblePosition,
			entry.reorderVisibleSize,
			entry.reorderTargetIndexes,
		]),
		[
			["pinned", 0, 2, 0, 5, [1, 3]],
			["pinned", 1, 2, 1, 5, [1, 3]],
			["ordinary", 0, 3, 2, 5, [0, 2, 4]],
			["ordinary", 1, 3, 3, 5, [0, 2, 4]],
			["ordinary", 2, 3, 4, 5, [0, 2, 4]],
		],
	);
	assert.deepEqual(nodes.map((node) => node.internalId), [
		"ordinary-a",
		"pinned-a",
		"ordinary-b",
		"pinned-b",
		"unusual",
	]);
});

test("boundary movement is controller-free and grip labels use safe entity-specific wording", () => {
	let calls = 0;
	const controller = {
		moveNode(internalId, targetIndex) {
			calls += 1;
			assert.equal(internalId, "node");
			assert.equal(targetIndex, 2);
			return { ok: true, errors: [], warnings: [] };
		},
	};
	const boundary = {
		internalId: "node",
		moveUpTargetIndex: null,
		moveDownTargetIndex: null,
	};

	assert.deepEqual(moveSiblingNode(controller, boundary, "up"), { ok: true, moved: false });
	assert.deepEqual(moveSiblingNode(controller, boundary, "down"), { ok: true, moved: false });
	assert.deepEqual(moveSiblingNode(controller, boundary, "sideways"), { ok: true, moved: false });
	assert.equal(calls, 0);

	const moved = moveSiblingNode(controller, { ...boundary, moveDownTargetIndex: 2 }, "down");
	assert.equal(moved.ok, true);
	assert.equal(moved.moved, true);
	assert.equal(calls, 1);
	assert.equal(
		reorderHandleLabel("folder", "Hidden title"),
		"Reorder folder “Hidden title”",
	);
	assert.equal(
		movementAnnouncement("source", "Preserved source", "down"),
		"Moved source “Preserved source” down",
	);
});

test("pointer sessions require established capture and lock interactions until teardown", () => {
	const captures = [];
	const successfulHandle = {
		setPointerCapture(pointerId) {
			captures.push(pointerId);
		},
		hasPointerCapture(pointerId) {
			return captures.includes(pointerId);
		},
	};
	assert.equal(establishPointerCapture(successfulHandle, 17), true);
	assert.deepEqual(captures, [17]);
	assert.equal(pointerSessionLocksInteraction({ pointerId: 17, settling: false }), true);
	assert.equal(pointerSessionLocksInteraction({ pointerId: 17, settling: true }), true);
	assert.equal(pointerSessionLocksInteraction(null), false);

	assert.equal(establishPointerCapture({
		setPointerCapture() {},
		hasPointerCapture() {
			return false;
		},
	}, 18), false, "failed capture confirmation declines the pointer session");
	assert.equal(establishPointerCapture({
		setPointerCapture() {
			throw new Error("capture unavailable");
		},
	}, 19), false, "capture exceptions decline the pointer session");
	assert.equal(establishPointerCapture({}, 20), false, "missing capture support declines the pointer session");
	assert.equal(establishPointerCapture({
		setPointerCapture() {},
	}, 21), true, "successful capture remains usable when confirmation is unavailable");
});

test("movement destinations retain complete visible-list positions across pin groups and sibling types", () => {
	const collections = buildSiblingMovements([
		{ internalId: "ordinary-a", editable: { pinToTop: false } },
		{ internalId: "pinned-a", editable: { pinToTop: true } },
		{ internalId: "ordinary-b", editable: { pinToTop: false } },
		{ internalId: "pinned-b", editable: { pinToTop: true } },
	], { groupPinnedCollections: true });
	const pinned = collections.filter((item) => item.reorderGroup === "pinned");
	const ordinary = collections.filter((item) => item.reorderGroup === "ordinary");

	assert.equal(visiblePositionForGroupDestination(pinned, 0), 0);
	assert.equal(visiblePositionForGroupDestination(pinned, 1), 1);
	assert.equal(visiblePositionForGroupDestination(ordinary, 0), 2);
	assert.equal(visiblePositionForGroupDestination(ordinary, 1), 3);
	assert.equal(
		movementPositionAnnouncement(
			"collection",
			"Ordinary B",
			visiblePositionForGroupDestination(ordinary, 0) + 1,
		),
		"Moved collection “Ordinary B” to position 3",
	);

	const folders = buildSiblingMovements([
		{ internalId: "folder-a" },
		{ internalId: "folder-b" },
	]);
	const sources = buildSiblingMovements([
		{ internalId: "source-a" },
		{ internalId: "source-b" },
		{ internalId: "source-c" },
	]);
	assert.equal(visiblePositionForGroupDestination(folders, 1), 1);
	assert.equal(visiblePositionForGroupDestination(sources, 2), 2);
	assert.equal(visiblePositionForGroupDestination([], 0), null);

	for (const message of [
		movementPositionAnnouncement("folder", "Folder B", 2),
		movementPositionAnnouncement("source", "Source C", 3),
	]) {
		assert.equal(message.includes("internalId"), false);
		assert.equal(message.includes("raw"), false);
	}
});

test("pointer helpers enforce a vertical threshold, calculate insertion targets, and bound auto-scroll", () => {
	assert.equal(crossedDragThreshold(100, 105), false);
	assert.equal(crossedDragThreshold(100, 106), true);
	assert.equal(crossedDragThreshold(100, 94), true);
	assert.equal(crossedDragThreshold(100, 100, 0), true);
	assert.equal(crossedDragThreshold(100, Number.NaN), false);
	assert.equal(dragOverlayTop(260, 18), 242);
	assert.equal(dragOverlayTop(Number.NaN, 18), null);

	const bounds = [
		{ position: 0, top: 100, bottom: 160 },
		{ position: 1, top: 170, bottom: 230 },
		{ position: 2, top: 240, bottom: 300 },
	];
	assert.equal(pointerDestinationForY(bounds, 90), 0);
	assert.equal(pointerDestinationForY(bounds, 131), 1);
	assert.equal(pointerDestinationForY(bounds, 275), 2);
	assert.equal(pointerDestinationForY(bounds, 400), 2);
	assert.equal(pointerDestinationForY([], 100), null);

	const items = [
		{ internalId: "a", reorderGroupPosition: 0 },
		{ internalId: "b", reorderGroupPosition: 1 },
		{ internalId: "c", reorderGroupPosition: 2 },
	];
	assert.deepEqual(insertionIndicatorForDestination(items, "b", 0), {
		internalId: "a",
		edge: "before",
	});
	assert.equal(insertionIndicatorForDestination(items, "b", 1), null);
	assert.deepEqual(insertionIndicatorForDestination(items, "b", 2), {
		internalId: "c",
		edge: "after",
	});

	assert.equal(reorderAutoScrollDelta(36, 800), -6);
	assert.equal(reorderAutoScrollDelta(400, 800), 0);
	assert.equal(reorderAutoScrollDelta(764, 800), 6);
	assert.equal(reorderAutoScrollDelta(800, 800), 12);
});

test("provisional drag layout moves a measured placeholder and displaces crossed siblings without data mutation", () => {
	const bounds = [
		{ internalId: "a", position: 0, top: 100, bottom: 160 },
		{ internalId: "b", position: 1, top: 170, bottom: 250 },
		{ internalId: "c", position: 2, top: 260, bottom: 310 },
	];
	const snapshot = structuredClone(bounds);

	assert.deepEqual(provisionalDragLayout(bounds, "a", 2), {
		placeholderShiftY: 150,
		displacements: {
			a: 150,
			b: -70,
			c: -70,
		},
	});
	assert.deepEqual(provisionalDragLayout(bounds, "c", 0), {
		placeholderShiftY: -160,
		displacements: {
			a: 60,
			b: 60,
			c: -160,
		},
	});
	assert.deepEqual(provisionalDragLayout(bounds, "b", 1), {
		placeholderShiftY: 0,
		displacements: {
			a: 0,
			b: 0,
			c: 0,
		},
	});
	assert.equal(provisionalDragLayout(bounds, "missing", 1), null);
	assert.deepEqual(bounds, snapshot, "measurement inputs remain unchanged");
});

test("a completed pointer destination delegates once while hover, cancellation, and same-position states do not", () => {
	const calls = [];
	const controller = {
		moveNode(internalId, targetIndex) {
			calls.push([internalId, targetIndex]);
			return { ok: true, errors: [], warnings: [] };
		},
	};
	const item = {
		internalId: "node",
		reorderGroupPosition: 1,
		reorderTargetIndexes: [4, 7, 9],
	};

	pointerDestinationForY([
		{ position: 0, top: 0, bottom: 40 },
		{ position: 1, top: 50, bottom: 90 },
		{ position: 2, top: 100, bottom: 140 },
	], 120);
	assert.equal(calls.length, 0, "hover calculation must not call the controller");
	assert.deepEqual(moveSiblingNodeToPosition(controller, item, 1), { ok: true, moved: false });
	assert.equal(calls.length, 0, "same-position drop must not call the controller");
	assert.equal(calls.length, 0, "a cancelled session makes no commit");

	const result = moveSiblingNodeToPosition(controller, item, 2);
	assert.equal(result.moved, true);
	assert.deepEqual(calls, [["node", 9]]);
});

test("controller invalid and same-index moves do not advance revision while valid moves advance once", () => {
	const controller = createController();
	controller.importValue([
		{ id: "first", title: "First", folders: [] },
		{ id: "second", title: "Second", folders: [] },
	]);
	const [first, second] = controller.getState().project.collections;
	controller.selectNode("missing");
	const beforeNoOps = controller.getState();
	const importDiagnostics = beforeNoOps.diagnostics.import;
	const migrationDiagnostics = beforeNoOps.diagnostics.migration;

	assert.equal(controller.moveNode(first.internalId, 0).ok, true);
	assert.equal(controller.getState().revision, beforeNoOps.revision);
	assert.equal(controller.getState().diagnostics.import, importDiagnostics);
	assert.equal(controller.getState().diagnostics.migration, migrationDiagnostics);

	const beforeInvalidRevision = controller.getState().revision;
	const invalid = controller.moveNode(first.internalId, -1);
	assert.equal(invalid.ok, false);
	assert.equal(invalid.errors[0].code, "INVALID_INSERTION_INDEX");
	assert.equal(controller.getState().revision, beforeInvalidRevision);
	assert.equal(controller.getState().diagnostics.import, importDiagnostics);
	assert.equal(controller.getState().diagnostics.migration, migrationDiagnostics);

	const beforeMoveRevision = controller.getState().revision;
	assert.equal(controller.moveNode(second.internalId, 0).ok, true);
	assert.equal(controller.getState().revision, beforeMoveRevision + 1);
});

test("collection moves follow visible pin groups and preserve identity, pin state, and selection", () => {
	const controller = createController();
	controller.importValue([
		{ id: "ordinary-a", title: "Ordinary A", pinToTop: false, folders: [] },
		{ id: "pinned-a", title: "Pinned A", pinToTop: true, folders: [] },
		{ id: "ordinary-b", title: "Ordinary B", pinToTop: false, folders: [] },
		{ id: "pinned-b", title: "Pinned B", pinToTop: true, folders: [] },
	]);
	const original = Object.fromEntries(
		controller.getState().project.collections.map((collection) => [collection.editable.id, collection]),
	);
	controller.selectNode(original["pinned-a"].internalId);

	let view = buildBuilderViewModel(controller.getState());
	assert.deepEqual(view.collections.map((collection) => collection.title), [
		"Pinned A",
		"Pinned B",
		"Ordinary A",
		"Ordinary B",
	]);
	assert.deepEqual(
		view.collections.map((collection) => [
			collection.reorderVisiblePosition,
			collection.reorderVisibleSize,
		]),
		[[0, 4], [1, 4], [2, 4], [3, 4]],
	);
	const beforeDown = controller.getState().revision;
	assert.equal(moveSiblingNode(
		controller,
		view.collections.find((collection) => collection.title === "Pinned A"),
		"down",
	).moved, true);
	assert.equal(controller.getState().revision, beforeDown + 1);
	assert.deepEqual(collectionIds(controller), [
		"ordinary-a",
		"ordinary-b",
		"pinned-b",
		"pinned-a",
	]);
	assert.equal(controller.getState().selection.collectionInternalId, original["pinned-a"].internalId);

	view = buildBuilderViewModel(controller.getState());
	assert.deepEqual(view.collections.slice(0, 2).map((collection) => collection.title), [
		"Pinned B",
		"Pinned A",
	]);
	const movedPinned = view.collections.find((collection) => collection.title === "Pinned A");
	assert.equal(movedPinned.moveDownTargetIndex, null);
	assert.equal(moveSiblingNode(controller, movedPinned, "up").moved, true);

	view = buildBuilderViewModel(controller.getState());
	const ordinaryA = view.collections.find((collection) => collection.title === "Ordinary A");
	assert.equal(moveSiblingNodeToPosition(controller, ordinaryA, 1).moved, true);
	assert.equal(controller.getState().selection.collectionInternalId, original["pinned-a"].internalId);

	for (const collection of controller.getState().project.collections) {
		const before = original[collection.editable.id];
		assert.equal(collection.internalId, before.internalId);
		assert.equal(collection.editable.pinToTop, before.editable.pinToTop);
	}
});

test("folder moves remain in one collection and preserve selected hierarchy level", () => {
	const controller = createController();
	controller.importValue([
		{
			id: "primary",
			title: "Primary",
			folders: [
				{ id: "folder-a", title: "Folder A", tileShape: "POSTER", sources: [] },
				{ id: "folder-b", title: "Folder B", tileShape: "LANDSCAPE", sources: [] },
				{ id: "folder-c", title: "Folder C", coverImageUrl: "https://example.invalid/c.webp", sources: [] },
			],
		},
		{
			id: "other",
			title: "Other",
			folders: [{ id: "other-folder", title: "Other Folder", sources: [] }],
		},
	]);
	const primary = controller.getState().project.collections[0];
	const selected = primary.folders[1];
	controller.selectNode(selected.internalId);
	let view = buildBuilderViewModel(controller.getState());
	assert.equal(view.activeMobileLevel, "sources");

	assert.equal(moveSiblingNodeToPosition(
		controller,
		view.folders.find((folder) => folder.title === "Folder B"),
		2,
	).moved, true);
	assert.deepEqual(
		controller.getState().project.collections[0].folders.map((folder) => folder.editable.id),
		["folder-a", "folder-c", "folder-b"],
	);
	assert.deepEqual(
		controller.getState().project.collections[1].folders.map((folder) => folder.editable.id),
		["other-folder"],
	);
	assert.equal(controller.getState().selection.folderInternalId, selected.internalId);
	assert.equal(buildBuilderViewModel(controller.getState()).activeMobileLevel, "sources");

	view = buildBuilderViewModel(controller.getState());
	assert.equal(moveSiblingNode(
		controller,
		view.folders.find((folder) => folder.title === "Folder B"),
		"up",
	).moved, true);
	const serialized = controller.serializeProject();
	assert.equal(serialized.ok, true);
	assert.deepEqual(serialized.value[0].folders.map((folder) => folder.id), [
		"folder-a",
		"folder-b",
		"folder-c",
	]);
	assert.equal(serialized.value[0].folders[1].tileShape, "LANDSCAPE");
	assert.equal(serialized.value[0].folders[2].coverImageUrl, "https://example.invalid/c.webp");
});

test("source moves preserve category, opaque evidence, identity, and addon projection order", () => {
	const controller = createController();
	controller.importValue([{
		id: "collection",
		title: "Collection",
		folders: [{
			id: "folder",
			title: "Folder",
			sources: [
				{
					provider: "tmdb",
					title: "Native",
					tmdbSourceType: "DISCOVER",
					mediaType: "MOVIE",
					filters: { withKeywords: "15097", unknownFilter: "keep" },
				},
				{
					provider: "addon",
					title: "Addon One",
					addonId: "example.addon",
					type: "movie",
					catalogId: "one",
					unknownAddon: "keep-one",
				},
				{
					provider: "community",
					title: "Opaque",
					unknownOpaque: { preserve: true },
				},
				{
					provider: "addon",
					title: "Addon Two",
					addonId: "example.addon",
					type: "series",
					catalogId: "two",
					unknownAddon: "keep-two",
				},
			],
			catalogSources: [
				{
					addonId: "example.addon",
					type: "movie",
					catalogId: "one",
					unknownProjection: "projection-one",
				},
				{
					addonId: "example.addon",
					type: "series",
					catalogId: "two",
					unknownProjection: "projection-two",
				},
			],
		}],
	}]);
	const folder = controller.getState().project.collections[0].folders[0];
	const identities = Object.fromEntries(folder.sources.map((source) => [source.editable.title, {
		internalId: source.internalId,
		category: source.category,
		rawImported: structuredClone(source.rawImported),
	}]));
	controller.selectNode(folder.sources[2].internalId);

	let view = buildBuilderViewModel(controller.getState());
	assert.equal(moveSiblingNodeToPosition(
		controller,
		view.sources.find((source) => source.title === "Addon Two"),
		2,
	).moved, true);
	view = buildBuilderViewModel(controller.getState());
	assert.equal(moveSiblingNode(
		controller,
		view.sources.find((source) => source.title === "Addon Two"),
		"up",
	).moved, true);
	assert.equal(controller.getState().selection.sourceInternalId, folder.sources[2].internalId);
	assert.equal(buildBuilderViewModel(controller.getState()).activeMobileLevel, "sources");

	const movedSources = controller.getState().project.collections[0].folders[0].sources;
	assert.deepEqual(movedSources.map((source) => source.editable.title), [
		"Native",
		"Addon Two",
		"Addon One",
		"Opaque",
	]);
	for (const source of movedSources) {
		const before = identities[source.editable.title];
		assert.equal(source.internalId, before.internalId);
		assert.equal(source.category, before.category);
		assert.deepEqual(source.rawImported, before.rawImported);
	}

	const serialized = controller.serializeProject();
	assert.equal(serialized.ok, true);
	const outputFolder = serialized.value[0].folders[0];
	assert.deepEqual(outputFolder.sources.map((source) => source.title), [
		"Native",
		"Addon Two",
		"Addon One",
		"Opaque",
	]);
	assert.deepEqual(outputFolder.catalogSources.map((source) => source.catalogId), ["two", "one"]);
	assert.deepEqual(outputFolder.catalogSources.map((source) => source.unknownProjection), [
		"projection-two",
		"projection-one",
	]);
	assert.deepEqual(outputFolder.sources[3].unknownOpaque, { preserve: true });
	assert.equal(outputFolder.sources[0].filters.unknownFilter, "keep");
});

test("representative imported reorder remains preservation-first through a second serializer cycle", () => {
	const input = loadFixture(
		"tests/fixtures/nuvio/v2-compatibility/preservation/comprehensive-imported-profile.json",
	);
	const controller = createController();
	assert.equal(controller.importValue(input).ok, true);
	const beforeRaw = structuredClone(controller.getState().project);

	let view = buildBuilderViewModel(controller.getState());
	assert.equal(moveSiblingNode(controller, view.collections[1], "up").moved, true);
	const primary = controller.getState().project.collections.find(
		(collection) => collection.editable.id === "preservation-primary",
	);
	controller.selectNode(primary.folders[0].internalId);
	view = buildBuilderViewModel(controller.getState());
	assert.equal(moveSiblingNode(controller, view.folders[1], "up").moved, true);

	const movedPrimary = controller.getState().project.collections.find(
		(collection) => collection.editable.id === "preservation-primary",
	);
	assert.deepEqual(movedPrimary.rawImported, beforeRaw.collections[0].rawImported);
	assert.deepEqual(
		movedPrimary.folders.find((folder) => folder.editable.id === "preservation-mixed").rawImported,
		beforeRaw.collections[0].folders[0].rawImported,
	);

	const first = controller.serializeProject();
	assert.equal(first.ok, true);
	assert.deepEqual(first.value.map((collection) => collection.id), [
		"preservation-secondary",
		"preservation-primary",
	]);
	const serializedPrimary = first.value[1];
	assert.deepEqual(serializedPrimary.unknownCollection, input[0].unknownCollection);
	assert.equal(serializedPrimary.backdropImageUrl, null);
	assert.deepEqual(serializedPrimary.folders.map((folder) => folder.id), [
		"preservation-empty",
		"preservation-mixed",
	]);
	const mixed = serializedPrimary.folders[1];
	assert.equal(mixed.titleLogoUrl, "https://example.invalid/preservation-title-logo.png");
	assert.deepEqual(mixed.unknownFolder, input[0].folders[0].unknownFolder);
	assert.deepEqual(mixed.sources[2].rawOnlyOptions, { preserve: true });
	assert.deepEqual(mixed.sources[4].communityOptions, {
		empty: {},
		items: [],
	});

	const secondController = createController();
	assert.equal(secondController.importValue(first.value).ok, true);
	const second = secondController.serializeProject();
	assert.equal(second.ok, true);
	assert.deepEqual(second.value, first.value);
});

test("every rendered collection, folder, and source card has one accessible stable drag handle", () => {
	const hidden = "\u200E\u200E";
	const controller = createController();
	controller.importValue([
		{
			id: "hidden",
			title: hidden,
			pinToTop: true,
			folders: [
				{
					id: "folder-a",
					title: "Folder A",
					sources: [
						{
							provider: "tmdb",
							title: hidden,
							tmdbSourceType: "LIST",
							tmdbId: "1",
							mediaType: "MOVIE",
						},
						{
							provider: "addon",
							title: { unusual: true },
							addonId: "example.addon",
							type: "movie",
							catalogId: "fallback-catalog",
						},
						{
							provider: "community",
							title: "Opaque",
							unknown: true,
						},
					],
				},
				{ id: "folder-b", title: "Folder B", sources: [] },
			],
		},
		{ id: "second", title: "Second", pinToTop: false, folders: [] },
	]);
	const folder = controller.getState().project.collections[0].folders[0];
	controller.selectNode(folder.internalId);
	const markup = renderWorkspace(controller);

	assert.equal((markup.match(/data-action="reorder-collection"/g) ?? []).length, 2);
	assert.equal((markup.match(/data-action="reorder-folder"/g) ?? []).length, 2);
	assert.equal((markup.match(/data-action="reorder-source"/g) ?? []).length, 3);
	assert.equal(markup.includes('data-action="move-'), false);
	assert.equal((markup.match(/data-action="edit-collection"/g) ?? []).length, 2);
	assert.equal((markup.match(/data-action="edit-folder"/g) ?? []).length, 2);
	assert.equal(markup.includes('data-action="edit-source"'), false);
	assert.equal((markup.match(/data-hierarchy-card="source"/g) ?? []).length, 3);
	assert.equal((markup.match(/data-reorder-main-card="collection"/g) ?? []).length, 2);
	assert.equal((markup.match(/data-reorder-main-card="folder"/g) ?? []).length, 2);
	assert.equal((markup.match(/data-reorder-main-card="source"/g) ?? []).length, 3);
	assert.equal((markup.match(/class="reorder-grip-icon"/g) ?? []).length, 7);
	assert.equal((markup.match(/data-hierarchy-menu-trigger="true"/g) ?? []).length, 7);
	assert.match(
		markup,
		/data-reorder-main-card="collection"><button class="reorder-handle"[\s\S]*?<\/button><button class="node-button[\s\S]*?<\/button><div class="hierarchy-actions"/,
	);
	assert.match(
		markup,
		/data-card-layout="source"><div class="hierarchy-card-main[^"]*" data-reorder-main-card="source"><button class="reorder-handle"[\s\S]*?<\/button><button class="source-button[\s\S]*?<\/button><div class="hierarchy-actions"/,
	);

	for (const label of [
		"Reorder collection “Collection with hidden Nuvio title”",
		"Reorder folder “Folder A”",
		"Reorder source “Source with hidden Nuvio title”",
		"Reorder source “fallback-catalog”",
	]) {
		assert.ok(markup.includes(`aria-label="${label}"`), label);
	}
	assert.equal(markup.includes(hidden), false);
	assert.ok(openingTag(
		markup,
		'aria-label="Reorder collection “Collection with hidden Nuvio title”"',
	).includes("disabled"));
	assert.ok(openingTag(
		markup,
		'aria-label="Reorder collection “Second”"',
	).includes("disabled"));
	assert.equal(openingTag(
		markup,
		'aria-label="Reorder folder “Folder A”"',
	).includes("disabled"), false);
	assert.equal(openingTag(
		markup,
		'aria-label="Reorder source “Source with hidden Nuvio title”"',
	).includes("disabled"), false);

	assert.match(markup, /id="reorder-instructions" class="visually-hidden"/);
	assert.match(markup, /aria-describedby="reorder-instructions"/);
	assert.match(markup, /aria-keyshortcuts="Enter Space ArrowUp ArrowDown Escape"/);
	assert.match(markup, /data-movement-status="true" role="status" aria-live="polite" aria-atomic="true"/);
	assert.equal(markup.includes("Selection details"), false);
	assert.equal(markup.includes("selection-summary"), false);
});

test("in-card grip, full-row overlay, placeholder lifecycle, and keyboard mode remain explicit and motion-safe", () => {
	const workspace = fs.readFileSync(
		path.join(rootDir, "builder", "src", "ui", "BuilderWorkspace.jsx"),
		"utf8",
	);
	const styles = fs.readFileSync(path.join(rootDir, "builder", "src", "styles.css"), "utf8");

	assert.match(workspace, /reorderHandleRefs\.current\.get/);
	assert.match(workspace, /target\?\.focus\(\)/);
	assert.match(workspace, /setMoveFocusTarget\(\{ internalId: node\.internalId \}\)/);
	assert.match(workspace, /moveSiblingNode\(controller, node, direction\)/);
	assert.match(workspace, /moveSiblingNodeToPosition\(/);
	assert.match(workspace, /establishPointerCapture\(event\.currentTarget, event\.pointerId\)/);
	assert.match(workspace, /onPointerCancel=\{onPointerCancel\}/);
	assert.match(workspace, /onLostPointerCapture=\{onLostPointerCapture\}/);
	assert.match(workspace, /crossedDragThreshold\(session\.startY, event\.clientY\)/);
	assert.match(workspace, /createHierarchyDragOverlay\(/);
	assert.match(workspace, /cloneNode\(true\)/);
	assert.match(workspace, /data-reorder-drag-overlay/);
	assert.match(workspace, /overlay\.style\.width = `\$\{rect\.width\}px`/);
	assert.match(workspace, /overlay\.style\.height = `\$\{rect\.height\}px`/);
	assert.match(workspace, /dragOverlayTop\(\s*event\.clientY,\s*session\.grabOffsetY/);
	assert.match(workspace, /pointerDestinationForY\([\s\S]*session\.bounds[\s\S]*event\.clientY \+ window\.scrollY/);
	assert.match(workspace, /provisionalDragLayout\(/);
	assert.match(workspace, /placeholderShiftY/);
	assert.match(workspace, /displacements/);
	assert.match(workspace, /reorderAutoScrollDelta\(event\.clientY, window\.innerHeight\)/);
	assert.match(workspace, /settleHierarchyDragOverlay\(/);
	assert.match(workspace, /removeHierarchyDragOverlay\(/);
	assert.match(workspace, /session\.releasing/);
	assert.match(workspace, /event\.key === "ArrowUp"/);
	assert.match(workspace, /event\.key === "ArrowDown"/);
	assert.match(workspace, /event\.key === "Escape"/);
	assert.match(workspace, /setMovementStatusText\(""\)/);
	assert.match(workspace, /movementAnnouncement\(noun, node\.accessibleName, direction\)/);
	assert.doesNotMatch(workspace, /SelectionSummary|Selection details|Show folder details/);

	assert.match(styles, /\.reorder-handle\s*\{[\s\S]*width:\s*46px/);
	assert.match(styles, /\.reorder-handle\s*\{[\s\S]*height:\s*46px/);
	assert.match(styles, /\.reorder-handle\s*\{[\s\S]*touch-action:\s*none/);
	assert.match(styles, /\.reorder-grip-icon\s*\{[\s\S]*width:\s*18px/);
	assert.match(styles, /\.reorder-grip-icon\s*\{[\s\S]*height:\s*18px/);
	assert.match(styles, /\.hierarchy-actions-trigger\s*\{[\s\S]*min-height:\s*46px/);
	assert.match(styles, /\.hierarchy-card-row\s*\{[\s\S]*display:\s*block/);
	assert.match(styles, /\.hierarchy-card-main\s*\{[\s\S]*grid-template-columns:\s*46px minmax\(0, 1fr\) 46px[\s\S]*gap:\s*8px/);
	assert.match(styles, /\.hierarchy-drag-overlay\s*\{[\s\S]*position:\s*fixed[\s\S]*z-index:\s*2000[\s\S]*pointer-events:\s*none/);
	assert.match(styles, /\.hierarchy-card\.is-drag-placeholder::after/);
	assert.match(styles, /\.hierarchy-card\.is-provisionally-displaced/);
	assert.match(styles, /\.hierarchy-drag-overlay\.is-settling\s*\{[\s\S]*transition:\s*transform 150ms/);
	assert.match(styles, /\.hierarchy-card\[data-drop-position="before"\]::before/);
	assert.match(styles, /\.hierarchy-card\[data-drop-position="after"\]::before/);
	assert.match(styles, /@media \(max-width: 430px\)/);
	assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
	assert.match(styles, /transition-duration:\s*0\.01ms !important/);
	assert.doesNotMatch(styles, /\.card-move-action|\.card-edit-action|\.card-delete-action/);
	assert.doesNotMatch(workspace, /data-action=\{`move-|↑|↓/);
	assert.doesNotMatch(styles, /\.selection-summary|\.mobile-summary|\.detail-grid/);
});

test("capture admission and one pointer-session gate protect active and settling reorder lifecycles", () => {
	const workspace = fs.readFileSync(
		path.join(rootDir, "builder", "src", "ui", "BuilderWorkspace.jsx"),
		"utf8",
	);
	const helpers = fs.readFileSync(
		path.join(rootDir, "builder", "src", "ui", "hierarchy-reordering.js"),
		"utf8",
	);
	const beginPointer = functionBlock(
		workspace,
		"beginPointerReorder",
		"activatePointerReorder",
	);
	const cancelPointer = functionBlock(
		workspace,
		"cancelPointerReorder",
		"beginPointerReorder",
	);
	const completePointer = functionBlock(
		workspace,
		"completePointerReorder",
		"cancelPointerEvent",
	);
	const keyboard = functionBlock(
		workspace,
		"handleReorderKeyDown",
		"handleReorderClick",
	);

	assert.match(helpers, /export function establishPointerCapture/);
	assert.match(helpers, /handle\.setPointerCapture\(pointerId\)/);
	assert.match(helpers, /handle\.hasPointerCapture\(pointerId\) === true/);
	assert.match(beginPointer, /if \(!establishPointerCapture\(event\.currentTarget, event\.pointerId\)\) return/);
	assert.ok(
		beginPointer.indexOf("establishPointerCapture")
			< beginPointer.indexOf("setKeyboardReorderInternalId(null)"),
		"capture failure leaves keyboard reorder state available",
	);
	assert.ok(
		beginPointer.indexOf("establishPointerCapture")
			< beginPointer.indexOf("dragSessionRef.current ="),
		"capture must be established before session creation",
	);
	assert.doesNotMatch(beginPointer, /createHierarchyDragOverlay|moveSiblingNodeToPosition|controller\.moveNode/);
	assert.doesNotMatch(workspace, /window\.addEventListener\([^)]*pointer/i);

	for (const [name, nextName] of [
		["selectNode", "clearSelection"],
		["clearSelection", "openEditor"],
		["openEditor", "closeEditor"],
		["handleReturnHome", "stayInWorkspace"],
		["createCollection", "createFolder"],
		["createFolder", "announceMovement"],
		["moveNodeWithKeyboard", "toggleKeyboardReorder"],
		["toggleKeyboardReorder", "releasePointerCapture"],
	]) {
		assert.match(
			functionBlock(workspace, name, nextName),
			/pointerInteractionLocked\(\)/,
			`${name} is gated by the active pointer session`,
		);
	}
	assert.match(beginPointer, /pointerInteractionLocked\(\)/);
	assert.match(workspace, /function handleReorderClick[\s\S]*pointerInteractionLocked\(\)/);

	assert.match(keyboard, /const pointerSession = dragSessionRef\.current/);
	assert.match(keyboard, /event\.key === "Escape"[\s\S]*!pointerSession\.settling[\s\S]*cancelPointerReorder\(\)/);
	assert.match(keyboard, /if \(pointerSession !== null\)[\s\S]*return/);
	assert.match(cancelPointer, /dragSessionRef\.current = null/);
	assert.match(completePointer, /dragSessionRef\.current = null[\s\S]*moveSiblingNodeToPosition/);
	assert.match(completePointer, /visiblePositionForGroupDestination\(/);
	assert.match(completePointer, /moveSiblingNodeToPosition\([\s\S]*controller/);
	assert.match(workspace, /const disabled = navigationLocked \|\| node\.reorderGroupSize <= 1/);
});
