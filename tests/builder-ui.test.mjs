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
		initialProjectTitle: "Untitled project",
		...options,
	});
}

function render(controller) {
	return renderToStaticMarkup(createElement(BuilderApp, { controller, initialScreen: "workspace" }));
}

function assertUniqueSelectionSummaryHeadings(markup) {
	const ids = [...markup.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
	assert.equal(ids.length, new Set(ids).size, `Rendered IDs must be unique: ${ids.join(", ")}`);

	const summaryTargets = [
		...markup.matchAll(/<section class="selection-summary" aria-labelledby="([^"]+)"/g),
	].map((match) => match[1]);
	for (const target of summaryTargets) {
		assert.equal(ids.filter((id) => id === target).length, 1, `${target} must reference one unique heading`);
	}
	return summaryTargets;
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

test("empty shell renders the product header, clean state, backlink, and start action", () => {
	const markup = render(createController());
	for (const text of [
		"TMDB Collection Builder",
		"Built for Nuvio collections",
		"Development preview",
		"Untitled project",
		"Clean draft",
		"Back to TMDB ID Lookup",
		"Start your first collection",
		"New collection",
	]) {
		assert.ok(markup.includes(text), text);
	}
	assert.match(markup, /<main[^>]+data-builder-shell="true"/);
	assert.match(markup, /data-panel="collections"/);
	assert.match(markup, /data-root-link="true" href="\.\.\/"/);
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
	assert.equal(view.projectTitle, "Untitled project");
	assert.equal(view.dirty, false);
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
	assert.deepEqual(view.collections.map((item) => item.id), ["first", "second"]);
	assert.equal(view.collections[0].title, "Untitled collection");
	assert.equal(view.collections[0].folderCount, 2);
	assert.equal(view.collections[0].sourceCount, 1);
	assert.deepEqual(view.folders.map((item) => item.id), ["folder-a", "folder-b"]);
	assert.equal(view.folders[0].title, "Untitled folder");
	assert.equal(view.selectedCollection.internalId, firstCollection.internalId);
	assert.equal(view.selectedFolder.internalId, firstCollection.folders[0].internalId);
	assert.equal(view.activeMobileLevel, "sources");
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

test("selection summaries use unique stable heading IDs with valid associations", () => {
	const controller = createController();
	controller.importValue([{ id: "collection", title: "Collection", folders: [{
		id: "folder", title: "Folder", sources: [{
			provider: "tmdb", title: "Source", tmdbSourceType: "DISCOVER", mediaType: "MOVIE",
		}],
	}] }]);
	const collection = controller.getState().project.collections[0];
	controller.selectNode(collection.internalId);

	const collectionMarkup = render(controller);
	assert.deepEqual(assertUniqueSelectionSummaryHeadings(collectionMarkup), [
		"mobile-selection-summary-title",
		"selection-summary-title",
	]);
	assert.match(collectionMarkup, /<h3 id="mobile-selection-summary-title">Collection<\/h3>/);
	assert.match(collectionMarkup, /<h3 id="selection-summary-title">Collection<\/h3>/);

	controller.selectNode(collection.folders[0].sources[0].internalId);
	const sourceMarkup = render(controller);
	assert.deepEqual(assertUniqueSelectionSummaryHeadings(sourceMarkup), ["selection-summary-title"]);
	assert.match(sourceMarkup, /<h3 id="selection-summary-title">Source<\/h3>/);
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

test("first draft collection uses the requested identity and becomes selected", () => {
	const controller = createController();
	const result = createDraftCollection(controller);
	const collection = controller.getState().project.collections[0];
	assert.equal(result.ok, true);
	assert.equal(result.createdInternalId, collection.internalId);
	assert.deepEqual(collection.editable, { id: "collection-1", title: "Untitled Collection" });
	assert.equal(controller.getState().selection.collectionInternalId, collection.internalId);
	assert.equal(controller.getState().dirty, true);
	assert.deepEqual(collection.folders, []);
});

test("later draft collections use the smallest free imported or existing ID", () => {
	const controller = createController();
	controller.importValue([
		{ id: "collection-1", title: "Imported one", folders: [] },
		{ id: "collection-3", title: "Imported three", folders: [] },
	]);
	createDraftCollection(controller);
	const created = controller.getState().project.collections[2];
	assert.equal(created.editable.id, "collection-2");
	assert.equal(created.editable.title, "Untitled Collection 2");
	assert.deepEqual(controller.getState().project.collections.slice(0, 2).map((item) => item.editable.id), ["collection-1", "collection-3"]);
});

test("draft folder IDs are unique across the whole project and no source is created", () => {
	const controller = createController();
	controller.importValue([
		{ id: "c1", title: "One", folders: [{ id: "folder-1", title: "Existing", sources: [] }] },
		{ id: "c2", title: "Two", folders: [] },
	]);
	const secondCollection = controller.getState().project.collections[1];
	const result = createDraftFolder(controller, secondCollection.internalId);
	const created = controller.getState().project.collections[1].folders[0];
	assert.equal(result.ok, true);
	assert.deepEqual(created.editable, { id: "folder-2", title: "Untitled Folder 2" });
	assert.equal(controller.getState().selection.folderInternalId, created.internalId);
	assert.deepEqual(created.sources, []);
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
	assert.ok(markup.includes("Addon ID"));
	assert.ok(markup.includes("example.addon"));
	assert.equal(markup.includes("DO_NOT_RENDER"), false);
	assert.equal(markup.includes("builder-only-"), false);
});

test("dirty status changes after creation while an imported project remains clean", () => {
	const controller = createController();
	controller.importValue([{ id: "c", title: "C", folders: [] }]);
	assert.ok(render(controller).includes("Clean draft"));
	createDraftCollection(controller);
	const markup = render(controller);
	assert.ok(markup.includes("Unsaved changes"));
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

test("production UI keeps one local SVG and excludes deferred browser and rendering APIs", () => {
	const source = `${read("builder/src/main.jsx")}\n${uiSource()}`;
	const assets = fs.readdirSync(path.join(builderSrcDir, "assets")).filter((name) => name.endsWith(".svg"));
	assert.deepEqual(assets, ["builder-mark.svg"]);
	assert.match(source, /builder-mark\.svg/);
	assert.doesNotMatch(source, /from\s+["']node:/);
	assert.doesNotMatch(source, /\b(?:localStorage|indexedDB|fetch|showOpenFilePicker|showSaveFilePicker|Blob|File|createObjectURL)\b/);
	assert.doesNotMatch(source, /dangerouslySetInnerHTML/);
	assert.doesNotMatch(source, /react-router|ReactRouter/i);
	assert.doesNotMatch(source, /https?:\/\//);
});

test("styles provide mobile protection, touch sizing, focus, desktop panels, and reduced motion", () => {
	const styles = read("builder/src/styles.css");
	assert.match(styles, /:root\s*\{[\s\S]*--cyan:/);
	assert.match(styles, /overflow-x:\s*hidden/);
	assert.match(styles, /focus-visible/);
	assert.match(styles, /min-height:\s*(?:46|48)px/);
	assert.match(styles, /@media \(max-width: 430px\)/);
	assert.match(styles, /@media \(min-width: 900px\)/);
	assert.match(styles, /grid-template-columns:\s*minmax\(235px/);
	assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});
