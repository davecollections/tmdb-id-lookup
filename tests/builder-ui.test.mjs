import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createElement } from "../builder/node_modules/react/index.js";
import { renderToStaticMarkup } from "../builder/node_modules/react-dom/server.js";
import { createServer } from "../builder/node_modules/vite/dist/node/index.js";
import { createBuilderController } from "../builder/src/application/index.js";
import { createDraftCollection, createDraftFolder } from "../builder/src/ui/draft-actions.js";
import { createTargetedNodeEditorDraft } from "../builder/src/ui/hierarchy-actions.js";
import {
	builderCardScrollBehavior,
	BUILDER_DESKTOP_BREAKPOINT_PX,
	BUILDER_DESKTOP_MEDIA_QUERY,
	BUILDER_REDUCED_MOTION_MEDIA_QUERY,
	matchesBuilderDesktopViewport,
} from "../builder/src/ui/responsive-viewport.js";
import { buildBuilderViewModel } from "../builder/src/ui/view-model.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const builderSrcDir = path.join(rootDir, "builder", "src");
const fixtureRoot = path.join(rootDir, "tests", "fixtures", "nuvio");
const vite = await createServer({
	root: path.join(rootDir, "builder"),
	appType: "custom",
	logLevel: "silent",
	server: { middlewareMode: true },
});
const { BuilderApp } = await vite.ssrLoadModule("/src/ui/BuilderApp.jsx");
after(() => vite.close());

function countingIdFactory(prefix = "builder-only") {
	let count = 0;
	return () => `${prefix}-${++count}`;
}

function sequenceIdFactory(...ids) {
	let index = 0;
	return () => ids[index++];
}

function createController(options = {}) {
	return createBuilderController({
		idFactory: countingIdFactory(),
		nuvioIdFactory: countingIdFactory("nuvio"),
		initialProjectTitle: "Untitled project",
		...options,
	});
}

function render(controller) {
	return renderToStaticMarkup(createElement(BuilderApp, { controller, initialScreen: "workspace" }));
}

function loadFixture(relativePath) {
	return JSON.parse(fs.readFileSync(path.join(fixtureRoot, relativePath), "utf8"));
}

function read(relativePath) {
	return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function uiSource() {
	return fs.readdirSync(path.join(builderSrcDir, "ui"))
		.filter((name) => /\.(?:js|jsx)$/.test(name))
		.map((name) => fs.readFileSync(path.join(builderSrcDir, "ui", name), "utf8"))
		.join("\n");
}

test("production bootstrap creates one controller outside React rendering", () => {
	const main = read("builder/src/main.jsx");
	assert.match(main, /import \{ createBuilderController \} from "\.\/application\/index\.js"/);
	assert.equal((main.match(/createBuilderController\(\{/g) ?? []).length, 1);
	assert.match(main, /const controller = createBuilderController/);
	assert.match(main, /<BuilderApp controller=\{controller\} \/>/);
	assert.ok(main.indexOf("const controller") < main.indexOf("createRoot("));
});

test("React subscribes through the external-store API without mirrored project state", () => {
	const hook = read("builder/src/ui/use-builder-controller.js");
	const workspaceSource = [
		read("builder/src/ui/view-model.js"),
		read("builder/src/ui/draft-actions.js"),
	].join("\n");
	const editorWorkspaceSource = read("builder/src/ui/BuilderWorkspace.jsx");
	assert.match(hook, /useSyncExternalStore/);
	assert.match(hook, /controller\.subscribe/);
	assert.equal((hook.match(/controller\.getState/g) ?? []).length, 2);
	assert.doesNotMatch(workspaceSource, /\buseState\b/);
	assert.match(editorWorkspaceSource, /useState\(initialEditorDraft\)/);
	assert.match(editorWorkspaceSource, /useState\(initialEditorDiagnostics\)/);
	assert.doesNotMatch(editorWorkspaceSource, /useState\(state\.project|setProject|setCollections|setFolders|setSources/);
	assert.doesNotMatch(uiSource(), /from\s+["'][^"']*application\/|createBuilderController/);
});

test("empty shell renders the product header, navigation, and start action", () => {
	const markup = render(createController());
	for (const text of [
		"TMDB Collection Builder",
		"Built for Nuvio collections",
		"Development preview",
		"Back to builder home",
		"Start your first collection",
		"New collection",
	]) {
		assert.ok(markup.includes(text), text);
	}
	assert.match(markup, /<main[^>]+data-builder-shell="true"/);
	assert.match(markup, /data-panel="collections"/);
	assert.equal(markup.includes("Back to TMDB ID Lookup"), false);
	assert.equal((markup.match(/data-action="open-about-credits"/g) ?? []).length, 1);
	assert.equal((markup.match(/<h1/g) ?? []).length, 1);
});

test("empty shell omits old placeholder and deferred controls", () => {
	const markup = render(createController());
	for (const text of [
		"Deployment coexistence test",
		"No collection-builder functionality exists yet",
		"Import JSON",
		"Export",
		"Apply Migration",
		"Delete",
		"Reorder",
	]) {
		assert.equal(markup.includes(text), false, text);
	}
});

test("empty view model derives fallbacks and the collection mobile level", () => {
	const state = createController({ initialProjectTitle: "" }).getState();
	const view = buildBuilderViewModel(state);
	assert.equal(Object.hasOwn(view, "projectTitle"), false);
	assert.equal(Object.hasOwn(view, "dirty"), false);
	assert.deepEqual(view.collections, []);
	assert.equal(view.selectedNode, null);
	assert.equal(view.activeMobileLevel, "collections");
	assert.equal(view.operationDiagnostic, null);
	assert.equal(view.migrationNotice, null);
});

test("view model resolves hierarchy, preserves order, counts children, and falls back blank titles", () => {
	const controller = createController();
	controller.importValue([
		{ id: "first", title: "", folders: [
			{ id: "folder-a", title: "", sources: [] },
			{ id: "folder-b", title: "Second folder", sources: [{ provider: "addon", addonId: "a", type: "movie", catalogId: "one" }] },
		] },
		{ id: "second", title: "Second collection", folders: [] },
	]);
	const [firstCollection] = controller.getState().project.collections;
	controller.selectNode(firstCollection.folders[0].internalId);
	const view = buildBuilderViewModel(controller.getState());
	assert.equal(view.collections.every((item) => !Object.hasOwn(item, "id")), true);
	assert.equal(view.collections[0].title, "Untitled collection");
	assert.equal(view.collections[0].folderCount, 2);
	assert.equal(view.collections[0].sourceCount, 1);
	assert.equal(view.folders.every((item) => !Object.hasOwn(item, "id")), true);
	assert.equal(view.folders[0].title, "Untitled folder");
	assert.equal(view.selectedCollection.internalId, firstCollection.internalId);
	assert.equal(view.selectedFolder.internalId, firstCollection.folders[0].internalId);
	assert.equal(view.activeMobileLevel, "sources");
});

test("view model presents only supported collection and folder settings with friendly labels", () => {
	const controller = createController();
	controller.importValue([{
		id: "collection",
		title: "Collection",
		pinToTop: true,
		focusGlowEnabled: false,
		viewMode: "rows",
		showAllTab: true,
		folders: [{
			id: "folder",
			title: "Folder",
			tileShape: "landscape",
			hideTitle: false,
			sources: [],
		}],
	}, {
		id: "unsupported",
		title: "Unsupported",
		pinToTop: "RAW_PIN",
		focusGlowEnabled: { raw: true },
		viewMode: "FOLLOW_LAYOUT",
		showAllTab: { raw: true },
		folders: [{
			id: "unsupported-folder",
			title: "Unsupported folder",
			tileShape: "SQUARE",
			hideTitle: "RAW_HIDE",
			sources: [],
		}],
	}]);
	const [collection, unsupported] = controller.getState().project.collections;
	controller.selectNode(collection.folders[0].internalId);
	let view = buildBuilderViewModel(controller.getState());
	assert.ok(view.selectedCollection.details.some((entry) => entry.label === "Layout" && entry.value === "Rows"));
	assert.ok(view.selectedCollection.details.some((entry) => entry.label === "Pinned to top" && entry.value === "Yes"));
	assert.ok(view.selectedCollection.details.some((entry) => entry.label === "Focus glow enabled" && entry.value === "No"));
	assert.ok(view.selectedCollection.details.some((entry) => (
		entry.label === "All tab when using Tabs" && entry.value === "Yes"
	)));
	assert.equal(view.selectedFolder.tileShape, "Landscape");
	assert.ok(view.selectedFolder.details.some((entry) => (
		entry.label === "Folder title visibility" && entry.value === "Show everywhere"
	)));

	controller.selectNode(unsupported.folders[0].internalId);
	view = buildBuilderViewModel(controller.getState());
	assert.equal(JSON.stringify(view).includes("RAW_PIN"), false);
	assert.equal(JSON.stringify(view).includes("RAW_HIDE"), false);
	assert.equal(view.selectedCollection.details.some((entry) => entry.label === "Layout"), false);
	assert.equal(view.selectedCollection.details.some((entry) => entry.label === "Focus glow enabled"), false);
	assert.equal(view.selectedCollection.details.some((entry) => entry.label === "All tab when using Tabs"), false);
	assert.equal(view.selectedFolder.details.some((entry) => entry.label === "Tile shape"), false);
	assert.equal(view.selectedFolder.details.some((entry) => entry.label === "Folder title visibility"), false);
	assert.equal(JSON.stringify(view).includes("Home-screen title shown"), false);
	assert.equal(JSON.stringify(view).includes("All source tab enabled"), false);
});

test("collection and folder summaries use saved preference and final visibility outcomes", () => {
	const invisible = "\u200E\u200E";
	const controller = createController();
	controller.importValue([
		{
			id: "rows-yes",
			title: "Rows yes",
			viewMode: "ROWS",
			showAllTab: true,
			folders: [{
				id: "show-everywhere",
				title: "Visible title",
				hideTitle: false,
				sources: [],
			}],
		},
		{
			id: "tabs-no",
			title: "Tabs no",
			viewMode: "TABBED_GRID",
			showAllTab: false,
			folders: [{
				id: "hide-home",
				title: "Mixed\u200E title",
				hideTitle: true,
				sources: [],
			}],
		},
		{
			id: "absent-all",
			title: "Absent All",
			folders: [{
				id: "hide-everywhere",
				title: invisible,
				hideTitle: false,
				sources: [],
			}],
		},
		{
			id: "unusual-all",
			title: "Unusual All",
			showAllTab: "RAW_ALL",
			folders: [{
				id: "absent-hide",
				title: "Visible without preference",
				sources: [],
			}],
		},
		{
			id: "unusual-hide",
			title: "Unusual hide",
			folders: [{
				id: "unusual-hide-folder",
				title: "Visible with unusual preference",
				hideTitle: { raw: true },
				sources: [],
			}],
		},
	]);
	const collections = controller.getState().project.collections;

	const cases = [
		[0, "Yes", "Show everywhere"],
		[1, "No", "Hide on home screen only"],
		[2, null, "Hide everywhere"],
		[3, null, null],
		[4, null, null],
	];
	for (const [index, allTab, visibility] of cases) {
		controller.selectNode(collections[index].folders[0].internalId);
		const view = buildBuilderViewModel(controller.getState());
		const allDetail = view.selectedCollection.details.find((entry) => (
			entry.label === "All tab when using Tabs"
		));
		const visibilityDetail = view.selectedFolder.details.find((entry) => (
			entry.label === "Folder title visibility"
		));
		assert.equal(allDetail?.value ?? null, allTab);
		assert.equal(visibilityDetail?.value ?? null, visibility);
		assert.equal(view.selectedFolder.details.some((entry) => entry.label === "Home-screen title shown"), false);
		assert.equal(view.selectedFolder.details.some((entry) => entry.label === "Nuvio title"), false);
	}
});

test("view model uses explicit source categories and safe human-readable summaries", () => {
	const controller = createController();
	controller.importValue([{ id: "c", title: "C", folders: [{ id: "f", title: "F", sources: [
		{ provider: "tmdb", title: "", tmdbSourceType: "LIST", tmdbId: 123, mediaType: "MOVIE", sortBy: "added.desc" },
		{ provider: "addon", title: "", addonId: "example.addon", type: "series", catalogId: "catalog", genre: "Drama" },
		{ provider: "community", title: "", unknownRawValue: "RAW_SENTINEL" },
	] }] }]);
	const folder = controller.getState().project.collections[0].folders[0];
	controller.selectNode(folder.sources[2].internalId);
	const view = buildBuilderViewModel(controller.getState());
	assert.deepEqual(view.sources.map((source) => source.category), ["native-tmdb", "addon", "opaque"]);
	assert.deepEqual(view.sources.map((source) => source.title), ["LIST", "catalog", "Preserved source"]);
	assert.equal(view.sources[0].metadata.some((entry) => entry.value === "123"), true);
	assert.equal(view.sources[1].metadata.some((entry) => entry.value === "example.addon"), true);
	assert.equal(view.sources[2].categoryLabel, "Preserved source");
	assert.equal(view.selectedSource.note, "Preserved imported source");
	assert.equal(JSON.stringify(view).includes("RAW_SENTINEL"), false);
});

test("workspace omits the deferred Selection details summary at every hierarchy level", () => {
	const controller = createController();
	controller.importValue([{ id: "collection", title: "Collection", folders: [{
		id: "folder", title: "Folder", sources: [{
			provider: "tmdb", title: "Source", tmdbSourceType: "DISCOVER", mediaType: "MOVIE",
		}],
	}] }]);
	const collection = controller.getState().project.collections[0];
	controller.selectNode(collection.internalId);

	const collectionMarkup = render(controller);
	assert.equal(collectionMarkup.includes("Selection details"), false);
	assert.equal(collectionMarkup.includes("selection-summary"), false);

	controller.selectNode(collection.folders[0].sources[0].internalId);
	const sourceMarkup = render(controller);
	assert.equal(sourceMarkup.includes("Selection details"), false);
	assert.equal(sourceMarkup.includes("selection-summary"), false);
	assert.equal(sourceMarkup.includes("Show folder details"), false);
});

test("repeated source metadata values retain semantic keys without React warnings", () => {
	const controller = createController();
	controller.importValue([{ id: "collection", title: "Collection", folders: [{
		id: "folder", title: "Folder", sources: [
			{
				provider: "addon",
				title: "Repeated metadata",
				addonId: "movie",
				type: "movie",
				catalogId: "catalog",
				genre: "movie",
			},
			{
				provider: "addon",
				title: "Second source",
				addonId: "second.addon",
				type: "series",
				catalogId: "second",
			},
		],
	}] }]);
	const folder = controller.getState().project.collections[0].folders[0];
	controller.selectNode(folder.internalId);
	const view = buildBuilderViewModel(controller.getState());
	assert.deepEqual(view.sources.map((source) => source.title), ["Repeated metadata", "Second source"]);
	assert.deepEqual(view.sources[0].metadata, [
		{ key: "addon-id", value: "movie" },
		{ key: "addon-type", value: "movie" },
		{ key: "genre", value: "movie" },
	]);
	assert.equal(new Set(view.sources[0].metadata.map((entry) => entry.key)).size, 3);

	const originalConsoleError = console.error;
	const reactErrors = [];
	let markup;
	console.error = (...args) => {
		reactErrors.push(args.map(String).join(" "));
		originalConsoleError(...args);
	};
	try {
		markup = render(controller);
	} finally {
		console.error = originalConsoleError;
	}

	assert.equal(
		reactErrors.some((message) => /same key|duplicate key/i.test(message)),
		false,
		reactErrors.join("\n"),
	);
	assert.equal((markup.match(/>movie<\/span>/g) ?? []).length, 3);
	assert.ok(markup.indexOf("Repeated metadata") < markup.indexOf("Second source"));
});

test("desktop draft collection creation uses unchanged defaults, selects, and advances once", () => {
	const controller = createController();
	const beforeRevision = controller.getState().revision;
	const result = createDraftCollection(controller);
	const collection = controller.getState().project.collections[0];
	assert.equal(result.ok, true);
	assert.equal(result.createdInternalId, collection.internalId);
	assert.deepEqual(collection.editable, {
		id: "nuvio-1",
		title: "Untitled Collection",
		pinToTop: false,
		focusGlowEnabled: true,
		viewMode: "TABBED_GRID",
		showAllTab: true,
	});
	assert.equal(controller.getState().selection.collectionInternalId, collection.internalId);
	assert.equal(buildBuilderViewModel(controller.getState()).activeMobileLevel, "folders");
	assert.equal(controller.getState().revision, beforeRevision + 1);
	assert.equal(controller.getState().dirty, true);
	assert.deepEqual(collection.folders, []);
	assert.equal(controller.serializeProject().value[0].focusGlowEnabled, true);
	assert.equal(Object.hasOwn(collection.editable, "backdropImageUrl"), false);
	assert.equal(Object.hasOwn(controller.serializeProject().value[0], "backdropImageUrl"), false);
});

test("mobile collection creation stays on Collections and supports ordered repetition and later targeting", () => {
	const controller = createController();
	const beforeRevision = controller.getState().revision;
	const created = [
		createDraftCollection(controller, { selectCreated: false }),
		createDraftCollection(controller, { selectCreated: false }),
		createDraftCollection(controller, { selectCreated: false }),
	];
	const state = controller.getState();

	assert.equal(created.every((result) => result.ok), true);
	assert.deepEqual(state.project.collections.map((collection) => collection.editable.title), [
		"Untitled Collection",
		"Untitled Collection 2",
		"Untitled Collection 3",
	]);
	assert.deepEqual(state.project.collections.map((collection) => collection.editable.id), [
		"nuvio-1",
		"nuvio-2",
		"nuvio-3",
	]);
	assert.equal(state.selection.collectionInternalId, null);
	assert.equal(buildBuilderViewModel(state).activeMobileLevel, "collections");
	assert.equal(state.revision, beforeRevision + 3);
	assert.equal(state.dirty, true);
	assert.equal(state.project.collections.every((collection) => (
		collection.folders.length === 0
		&& collection.editable.pinToTop === false
		&& collection.editable.focusGlowEnabled === true
		&& collection.editable.viewMode === "TABBED_GRID"
		&& collection.editable.showAllTab === true
		&& !Object.hasOwn(collection.editable, "backdropImageUrl")
	)), true);

	const firstCollection = state.project.collections[0];
	const beforeSelectionRevision = state.revision;
	controller.selectNode(firstCollection.internalId);
	assert.equal(buildBuilderViewModel(controller.getState()).activeMobileLevel, "folders");
	assert.equal(controller.getState().revision, beforeSelectionRevision);

	const thirdCollection = state.project.collections[2];
	const draft = createTargetedNodeEditorDraft(controller, thirdCollection);
	assert.equal(draft.internalId, thirdCollection.internalId);
	assert.equal(draft.values.title, "Untitled Collection 3");
	assert.equal(controller.getState().selection.collectionInternalId, thirdCollection.internalId);
	assert.equal(controller.getState().revision, beforeSelectionRevision);
});

test("later draft collections use the smallest free exact draft title", () => {
	const controller = createController();
	controller.importValue([
		{ id: "collection-1", title: "Untitled Collection", folders: [] },
		{ id: "collection-3", title: "Untitled Collection 3", folders: [] },
	]);
	createDraftCollection(controller);
	const created = controller.getState().project.collections[2];
	assert.equal(created.editable.id, "nuvio-1");
	assert.equal(created.editable.title, "Untitled Collection 2");
	assert.deepEqual(controller.getState().project.collections.slice(0, 2).map((item) => item.editable.id), ["collection-1", "collection-3"]);
});

test("desktop draft folder creation uses unchanged defaults, selects, and advances once", () => {
	const controller = createController();
	controller.importValue([
		{ id: "c1", title: "One", folders: [{ id: "folder-1", title: "Untitled Folder", sources: [] }] },
		{ id: "c2", title: "Two", folders: [] },
	]);
	const secondCollection = controller.getState().project.collections[1];
	const beforeRevision = controller.getState().revision;
	const result = createDraftFolder(controller, secondCollection.internalId);
	const created = controller.getState().project.collections[1].folders[0];
	assert.equal(result.ok, true);
	assert.deepEqual(created.editable, {
		id: "nuvio-1",
		title: "Untitled Folder 2",
		tileShape: "POSTER",
		hideTitle: true,
	});
	assert.equal(controller.getState().selection.folderInternalId, created.internalId);
	assert.equal(buildBuilderViewModel(controller.getState()).activeMobileLevel, "sources");
	assert.equal(controller.getState().revision, beforeRevision + 1);
	assert.deepEqual(created.sources, []);
	const view = buildBuilderViewModel(controller.getState());
	assert.ok(view.selectedFolder.details.some((entry) => (
		entry.label === "Folder title visibility" && entry.value === "Hide on home screen only"
	)));
});

test("mobile folder creation stays on Folders, preserves its parent, and supports ordered repetition", () => {
	const controller = createController();
	const collectionResult = createDraftCollection(controller);
	const parent = controller.getState().project.collections[0];
	assert.equal(controller.getState().selection.collectionInternalId, parent.internalId);
	const beforeRevision = controller.getState().revision;

	const created = [
		createDraftFolder(controller, collectionResult.createdInternalId, { selectCreated: false }),
		createDraftFolder(controller, collectionResult.createdInternalId, { selectCreated: false }),
		createDraftFolder(controller, collectionResult.createdInternalId, { selectCreated: false }),
	];
	const state = controller.getState();
	const folders = state.project.collections[0].folders;

	assert.equal(created.every((result) => result.ok), true);
	assert.deepEqual(folders.map((folder) => folder.editable.title), [
		"Untitled Folder",
		"Untitled Folder 2",
		"Untitled Folder 3",
	]);
	assert.deepEqual(folders.map((folder) => folder.editable.id), ["nuvio-2", "nuvio-3", "nuvio-4"]);
	assert.equal(state.selection.collectionInternalId, parent.internalId);
	assert.equal(state.selection.folderInternalId, null);
	assert.equal(state.selection.sourceInternalId, null);
	assert.equal(buildBuilderViewModel(state).activeMobileLevel, "folders");
	assert.equal(state.revision, beforeRevision + 3);
	assert.equal(state.dirty, true);
	assert.equal(folders.every((folder) => (
		folder.editable.tileShape === "POSTER"
		&& folder.editable.hideTitle === true
		&& folder.sources.length === 0
	)), true);

	const beforeSelectionRevision = state.revision;
	controller.selectNode(folders[1].internalId);
	assert.equal(buildBuilderViewModel(controller.getState()).activeMobileLevel, "sources");
	assert.equal(controller.getState().revision, beforeSelectionRevision);

	controller.selectNode(parent.internalId);
	const draft = createTargetedNodeEditorDraft(controller, folders[2]);
	assert.equal(draft.internalId, folders[2].internalId);
	assert.equal(draft.values.title, "Untitled Folder 3");
	assert.equal(controller.getState().selection.collectionInternalId, parent.internalId);
	assert.equal(controller.getState().selection.folderInternalId, folders[2].internalId);
	assert.equal(controller.getState().revision, beforeSelectionRevision);
});

test("failed draft creation retains selection and does not mutate the prior snapshot", () => {
	const controller = createBuilderController({
		idFactory: sequenceIdFactory("project", "existing", "project"),
	});
	const existing = controller.createCollection({ editable: { id: "collection-1", title: "Existing" } });
	controller.selectNode(existing.createdInternalId);
	const before = controller.getState();
	const result = createDraftCollection(controller);
	assert.equal(result.ok, false);
	assert.equal(result.errors[0].code, "INTERNAL_ID_COLLISION");
	assert.equal(controller.getState().project, before.project);
	assert.equal(controller.getState().selection.collectionInternalId, existing.createdInternalId);
	assert.deepEqual(before.project.collections.map((item) => item.editable.id), ["collection-1"]);
});

test("injected hierarchy renders every level in order with selected state and known details", () => {
	const controller = createController();
	controller.importValue([{ id: "collection", title: "Collection", pinToTop: true, folders: [
		{ id: "first-folder", title: "First folder", tileShape: "POSTER", sources: [
			{ provider: "tmdb", title: "Native first", tmdbSourceType: "DISCOVER", mediaType: "MOVIE" },
			{ provider: "addon", title: "Addon second", addonId: "example.addon", type: "movie", catalogId: "popular" },
			{ provider: "community", title: "Preserved third", hiddenRaw: "DO_NOT_RENDER" },
		] },
		{ id: "second-folder", title: "Second folder", sources: [] },
	] }]);
	const source = controller.getState().project.collections[0].folders[0].sources[1];
	controller.selectNode(source.internalId);
	const markup = render(controller);
	for (const marker of ["data-panel=\"collections\"", "data-panel=\"folders\"", "data-panel=\"sources\""]) {
		assert.ok(markup.includes(marker));
	}
	assert.ok(markup.indexOf("Native first") < markup.indexOf("Addon second"));
	assert.ok(markup.indexOf("Addon second") < markup.indexOf("Preserved third"));
	assert.match(markup, /data-node-type="source"[^>]+aria-pressed="true"/);
	assert.ok(markup.includes("3 sources"));
	assert.ok(markup.includes("example.addon"));
	assert.equal(markup.includes("DO_NOT_RENDER"), false);
	assert.equal(markup.includes("builder-only-"), false);
});

test("dirty status remains internal and is not rendered", () => {
	const controller = createController();
	controller.importValue([{ id: "c", title: "C", folders: [] }]);
	assert.equal(controller.getState().dirty, false);
	assert.equal(render(controller).includes("Clean draft"), false);
	createDraftCollection(controller);
	const markup = render(controller);
	assert.equal(controller.getState().dirty, true);
	assert.equal(markup.includes("Unsaved changes"), false);
	assert.equal(markup.includes("Clean draft"), false);
});

test("current operation diagnostic renders one restrained alert with stable fields", () => {
	const controller = createController();
	controller.selectNode("missing");
	const markup = render(controller);
	assert.match(markup, /role="alert"/);
	assert.ok(markup.includes("No builder node matches the supplied internal ID."));
	assert.ok(markup.includes("TARGET_NODE_NOT_FOUND"));
	assert.equal(markup.includes("Error:"), false);
});

test("migration notices are absent, available, or blocked without adding actions", () => {
	const ordinary = render(createController());
	assert.equal(ordinary.includes("legacy addon sources"), false);

	const availableController = createController();
	availableController.importValue(loadFixture("compatibility/legacy-projection-only-input.json"));
	const available = render(availableController);
	assert.ok(available.includes("legacy addon sources that can be migrated in a later step"));

	const blockedController = createController();
	blockedController.importValue([{ id: "c", title: "C", folders: [{
		id: "f", title: "F", sources: [],
		catalogSources: [{ addonId: "a", type: "movie", catalogId: "catalog", genre: 7 }],
	}] }]);
	const blocked = render(blockedController);
	assert.ok(blocked.includes("legacy source data needs attention"));
	assert.equal(`${available}${blocked}`.includes("Apply Migration"), false);
});

test("builder HTML uses development metadata and retains the private preview boundary", () => {
	const html = read("builder/index.html");
	assert.match(html, /<title>TMDB Collection Builder<\/title>/);
	assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
	assert.match(html, /data-builder-root="true"/);
	assert.ok(html.includes("Loading TMDB Collection Builder…"));
	assert.doesNotMatch(html, /deployment-test|data-deployment-test/i);
});

test("production UI keeps local Builder and approved attribution assets while excluding deferred browser and rendering APIs", () => {
	const source = `${read("builder/src/main.jsx")}\n${uiSource()}`;
	const assets = fs.readdirSync(path.join(builderSrcDir, "assets")).sort();
	assert.deepEqual(assets, ["builder-mark.svg", "justwatch-mark-gold.svg", "tmdb-logo-square.svg"]);
	assert.match(source, /builder-mark\.svg/);
	assert.match(source, /tmdb-logo-square\.svg/);
	assert.match(source, /justwatch-mark-gold\.svg/);
	assert.doesNotMatch(source, /from\s+["']node:/);
	assert.doesNotMatch(source, /\b(?:localStorage|indexedDB|fetch|showOpenFilePicker|showSaveFilePicker|Blob|File|createObjectURL)\b/);
	assert.doesNotMatch(source, /dangerouslySetInnerHTML/);
	assert.doesNotMatch(source, /react-router|ReactRouter/i);
	assert.deepEqual([...source.matchAll(/https?:\/\/[^"']+/g)].map((match) => match[0]), [
		"https://www.themoviedb.org/",
		"https://www.justwatch.com/",
		"https://github.com/davecollections",
		"https://github.com/davecollections/tmdb-id-lookup/issues/new/choose",
	]);
});

test("styles provide mobile protection, touch sizing, focus, desktop panels, and reduced motion", () => {
	const styles = read("builder/src/styles.css");
	const workspace = read("builder/src/ui/BuilderWorkspace.jsx");
	assert.match(styles, /:root\s*\{[\s\S]*--cyan:/);
	assert.match(styles, /overflow-x:\s*hidden/);
	assert.match(styles, /focus-visible/);
	assert.match(styles, /min-height:\s*(?:46|48)px/);
	assert.match(styles, /@media \(max-width: 430px\)/);
	assert.match(styles, /@media \(min-width: 900px\)/);
	assert.match(styles, /grid-template-columns:\s*minmax\(250px/);
	assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
	assert.equal(BUILDER_DESKTOP_BREAKPOINT_PX, 900);
	assert.equal(BUILDER_DESKTOP_MEDIA_QUERY, "(min-width: 900px)");
	assert.ok(styles.includes(`@media ${BUILDER_DESKTOP_MEDIA_QUERY}`));
	assert.match(workspace, /useBuilderDesktopViewport\(\)/);
	assert.match(workspace, /selectCreated:\s*desktopViewport/);
	assert.match(workspace, /desktopViewport \? null : "collections"/);
	assert.match(workspace, /desktopViewport \? null : "folders"/);
});

test("responsive helper matches the established breakpoint and respects reduced motion for card scrolling", () => {
	const queries = [];
	const mobileMatchMedia = (query) => {
		queries.push(query);
		return { matches: false };
	};
	const desktopMatchMedia = (query) => ({ matches: query === BUILDER_DESKTOP_MEDIA_QUERY });
	const reducedMotionMatchMedia = (query) => ({ matches: query === BUILDER_REDUCED_MOTION_MEDIA_QUERY });

	assert.equal(matchesBuilderDesktopViewport(mobileMatchMedia), false);
	assert.equal(matchesBuilderDesktopViewport(desktopMatchMedia), true);
	assert.equal(matchesBuilderDesktopViewport(null), true);
	assert.deepEqual(queries, [BUILDER_DESKTOP_MEDIA_QUERY]);
	assert.equal(builderCardScrollBehavior(mobileMatchMedia), "smooth");
	assert.equal(builderCardScrollBehavior(reducedMotionMatchMedia), "auto");
});
