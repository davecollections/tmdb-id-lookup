import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createElement } from "../builder/node_modules/react/index.js";
import { renderToStaticMarkup } from "../builder/node_modules/react-dom/server.js";
import { createServer } from "../builder/node_modules/vite/dist/node/index.js";
import { createBuilderController } from "../builder/src/application/index.js";
import { serializeNuvioProject } from "../builder/src/serialize/index.js";
import { applyNodeEditorDraft } from "../builder/src/ui/node-editor-actions.js";
import {
	buildNodeEditorPatch,
	createNodeEditorDraft,
	hasNodeEditorChanges,
	updateNodeEditorField,
	validateNodeEditorDraft,
} from "../builder/src/ui/node-editor.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(rootDir, "tests", "fixtures", "nuvio");
const vite = await createServer({
	root: path.join(rootDir, "builder"),
	appType: "custom",
	logLevel: "silent",
	server: { middlewareMode: true },
});
const { BuilderWorkspace } = await vite.ssrLoadModule("/src/ui/BuilderWorkspace.jsx");
after(() => vite.close());

function countingIdFactory(prefix = "internal") {
	let count = 0;
	return () => `${prefix}-${++count}`;
}

function createController() {
	return createBuilderController({ idFactory: countingIdFactory(), initialProjectTitle: "Editing test" });
}

function loadFixture(relativePath) {
	return JSON.parse(fs.readFileSync(path.join(fixtureRoot, relativePath), "utf8"));
}

function importTree(value = [{
	id: "collection-id",
	title: "Collection title",
	folders: [{
		id: "folder-id",
		title: "Folder title",
		sources: [{
			provider: "tmdb",
			title: "Source title",
			tmdbSourceType: "LIST",
			tmdbId: "123",
			mediaType: "MOVIE",
		}],
	}],
}]) {
	const controller = createController();
	const result = controller.importValue(value);
	assert.equal(result.ok, true, JSON.stringify(result.errors));
	return controller;
}

function changedDraft(node, values = {}) {
	let draft = createNodeEditorDraft(node);
	for (const [field, value] of Object.entries(values)) {
		draft = updateNodeEditorField(draft, field, value);
	}
	return draft;
}

function renderWorkspace(controller, options = {}) {
	return renderToStaticMarkup(createElement(BuilderWorkspace, {
		controller,
		state: controller.getState(),
		initialEditorDraft: options.draft ?? null,
		initialEditorDiagnostics: options.diagnostics ?? [],
	}));
}

function openingTag(markup, marker) {
	const index = markup.indexOf(marker);
	assert.notEqual(index, -1, marker);
	const start = markup.lastIndexOf("<", index);
	const end = markup.indexOf(">", index);
	return markup.slice(start, end + 1);
}

test("collection draft retains only stable target identity and editor values", () => {
	const collection = importTree().getState().project.collections[0];
	const draft = createNodeEditorDraft(collection);
	assert.equal(draft.internalId, collection.internalId);
	assert.equal(draft.nodeType, "collection");
	assert.deepEqual(draft.values, { id: "collection-id", title: "Collection title" });
});

test("folder draft retains only stable target identity and editor values", () => {
	const folder = importTree().getState().project.collections[0].folders[0];
	const draft = createNodeEditorDraft(folder);
	assert.equal(draft.internalId, folder.internalId);
	assert.equal(draft.nodeType, "folder");
	assert.deepEqual(draft.values, { id: "folder-id", title: "Folder title" });
});

test("project and source targets are rejected", () => {
	const project = importTree().getState().project;
	assert.equal(createNodeEditorDraft(project), null);
	assert.equal(createNodeEditorDraft(project.collections[0].folders[0].sources[0]), null);
});

test("string IDs and titles are copied exactly without trimming", () => {
	const controller = importTree([{ id: "  id  ", title: "  title  ", folders: [] }]);
	const draft = createNodeEditorDraft(controller.getState().project.collections[0]);
	assert.deepEqual(draft.values, { id: "  id  ", title: "  title  " });
});

test("absent imported values become empty unsupported form strings", () => {
	const collection = importTree([{ folders: [] }]).getState().project.collections[0];
	const draft = createNodeEditorDraft(collection);
	assert.deepEqual(draft.values, { id: "", title: "" });
	assert.deepEqual(
		{ hasId: draft.original.hasId, hasTitle: draft.original.hasTitle, idSupported: draft.original.idSupported, titleSupported: draft.original.titleSupported },
		{ hasId: false, hasTitle: false, idSupported: false, titleSupported: false },
	);
});

test("non-string imported values are never stringified", () => {
	const collection = importTree([{ id: { sentinel: "RAW_ID" }, title: ["RAW_TITLE"], folders: [] }])
		.getState().project.collections[0];
	const draft = createNodeEditorDraft(collection);
	assert.deepEqual(draft.values, { id: "", title: "" });
	assert.equal(JSON.stringify(draft).includes("RAW_ID"), false);
	assert.equal(JSON.stringify(draft).includes("RAW_TITLE"), false);
});

test("local draft excludes raw snapshots, children, sources, and complete nodes", () => {
	const collection = importTree().getState().project.collections[0];
	const draft = createNodeEditorDraft(collection);
	for (const key of ["rawImported", "folders", "sources", "editable", "collections", "category"]) {
		assert.equal(Object.hasOwn(draft, key), false, key);
	}
	assert.doesNotThrow(() => JSON.stringify(draft));
});

test("updating ID changes only ID form state and touched state", () => {
	const original = createNodeEditorDraft(importTree().getState().project.collections[0]);
	const next = updateNodeEditorField(original, "id", "new-id");
	assert.deepEqual(next.values, { id: "new-id", title: "Collection title" });
	assert.deepEqual(next.touched, { id: true, title: false });
});

test("updating title changes only title form state and touched state", () => {
	const original = createNodeEditorDraft(importTree().getState().project.collections[0]);
	const next = updateNodeEditorField(original, "title", "New title");
	assert.deepEqual(next.values, { id: "collection-id", title: "New title" });
	assert.deepEqual(next.touched, { id: false, title: true });
});

test("field updates are immutable and retain original comparison data", () => {
	const original = createNodeEditorDraft(importTree().getState().project.collections[0]);
	const before = structuredClone(original);
	const next = updateNodeEditorField(original, "title", "Changed");
	assert.deepEqual(original, before);
	assert.notEqual(next, original);
	assert.deepEqual(next.original, original.original);
});

test("unsupported field updates are ignored without mutation", () => {
	const original = createNodeEditorDraft(importTree().getState().project.collections[0]);
	assert.equal(updateNodeEditorField(original, "presentation", "ROWS"), original);
	assert.equal(updateNodeEditorField(original, "id", 42), original);
});

test("valid collection and folder drafts pass validation", () => {
	const project = importTree().getState().project;
	assert.deepEqual(validateNodeEditorDraft(createNodeEditorDraft(project.collections[0])), []);
	assert.deepEqual(validateNodeEditorDraft(createNodeEditorDraft(project.collections[0].folders[0])), []);
});

test("blank collection ID returns the exact structured diagnostic", () => {
	const draft = changedDraft(importTree().getState().project.collections[0], { id: "" });
	assert.deepEqual(validateNodeEditorDraft(draft), [{
		code: "EDITOR_ID_REQUIRED",
		path: "$ui.editor.id",
		message: "Enter a collection ID before applying changes.",
	}]);
});

test("whitespace-only folder ID is rejected without rewriting its value", () => {
	const folder = importTree().getState().project.collections[0].folders[0];
	const draft = changedDraft(folder, { id: " \t " });
	assert.equal(validateNodeEditorDraft(draft)[0].message, "Enter a folder ID before applying changes.");
	assert.equal(draft.values.id, " \t ");
});

test("blank collection title returns the exact structured diagnostic", () => {
	const draft = changedDraft(importTree().getState().project.collections[0], { title: "" });
	assert.deepEqual(validateNodeEditorDraft(draft), [{
		code: "EDITOR_TITLE_REQUIRED",
		path: "$ui.editor.title",
		message: "Enter a collection title before applying changes.",
	}]);
});

test("whitespace-only folder title is rejected without rewriting its value", () => {
	const folder = importTree().getState().project.collections[0].folders[0];
	const draft = changedDraft(folder, { title: "   " });
	assert.equal(validateNodeEditorDraft(draft)[0].message, "Enter a folder title before applying changes.");
	assert.equal(draft.values.title, "   ");
});

test("both current field errors are returned together in field order", () => {
	const draft = changedDraft(importTree().getState().project.collections[0], { id: "", title: " " });
	assert.deepEqual(validateNodeEditorDraft(draft).map((entry) => entry.code), [
		"EDITOR_ID_REQUIRED",
		"EDITOR_TITLE_REQUIRED",
	]);
});

test("every local diagnostic contains exactly code, path, and message", () => {
	const draft = changedDraft(importTree().getState().project.collections[0], { id: "", title: "" });
	for (const diagnostic of validateNodeEditorDraft(draft)) {
		assert.deepEqual(Object.keys(diagnostic), ["code", "path", "message"]);
	}
});

test("patch generation produces a title-only patch", () => {
	const draft = changedDraft(importTree().getState().project.collections[0], { title: "Comedy" });
	assert.deepEqual(buildNodeEditorPatch(draft), { title: "Comedy" });
});

test("patch generation produces an ID-only patch", () => {
	const draft = changedDraft(importTree().getState().project.collections[0], { id: "collection-comedy" });
	assert.deepEqual(buildNodeEditorPatch(draft), { id: "collection-comedy" });
});

test("patch generation produces a combined minimal patch", () => {
	const draft = changedDraft(importTree().getState().project.collections[0], { id: "new-id", title: "New title" });
	assert.deepEqual(buildNodeEditorPatch(draft), { id: "new-id", title: "New title" });
});

test("untouched and touched-but-reverted fields are omitted", () => {
	const node = importTree().getState().project.collections[0];
	let draft = changedDraft(node, { title: "Temporary" });
	draft = updateNodeEditorField(draft, "title", "Collection title");
	assert.deepEqual(buildNodeEditorPatch(draft), {});
	assert.equal(hasNodeEditorChanges(draft), false);
});

test("untouched absent and non-string originals remain omitted", () => {
	const project = importTree([{ id: { unusual: true }, folders: [] }]).getState().project;
	assert.deepEqual(buildNodeEditorPatch(createNodeEditorDraft(project.collections[0])), {});
});

test("explicit text replacement of a non-string original appears in the patch", () => {
	const node = importTree([{ id: 7, title: false, folders: [] }]).getState().project.collections[0];
	const draft = changedDraft(node, { id: "seven", title: "Replacement" });
	assert.deepEqual(buildNodeEditorPatch(draft), { id: "seven", title: "Replacement" });
});

test("patch never includes target identity, type, raw data, or children", () => {
	const draft = changedDraft(importTree().getState().project.collections[0], { title: "Changed" });
	const patch = buildNodeEditorPatch(draft);
	assert.deepEqual(Object.keys(patch), ["title"]);
	for (const key of ["internalId", "nodeType", "rawImported", "folders", "sources", "pinToTop"]) {
		assert.equal(Object.hasOwn(patch, key), false, key);
	}
});

test("collection apply delegates through updateNode and marks one revision dirty", () => {
	const controller = importTree();
	const collection = controller.getState().project.collections[0];
	const beforeRevision = controller.getState().revision;
	const outcome = applyNodeEditorDraft(controller, changedDraft(collection, { id: "edited-id", title: "Edited" }));
	assert.deepEqual(outcome, { ok: true, controllerCalled: true, diagnostics: [] });
	assert.equal(controller.getState().revision, beforeRevision + 1);
	assert.equal(controller.getState().dirty, true);
	assert.deepEqual(controller.getState().project.collections[0].editable.id, "edited-id");
});

test("folder apply delegates through updateNode and retains selection", () => {
	const controller = importTree();
	const folder = controller.getState().project.collections[0].folders[0];
	controller.selectNode(folder.internalId);
	const beforeRevision = controller.getState().revision;
	const outcome = applyNodeEditorDraft(controller, changedDraft(folder, { title: "Edited folder" }));
	assert.equal(outcome.ok, true);
	assert.equal(controller.getState().revision, beforeRevision + 1);
	assert.equal(controller.getState().selection.folderInternalId, folder.internalId);
});

test("invalid apply never calls the controller", () => {
	let calls = 0;
	const controller = { updateNode() { calls += 1; return { ok: true }; } };
	const draft = changedDraft(importTree().getState().project.collections[0], { id: "" });
	const outcome = applyNodeEditorDraft(controller, draft);
	assert.equal(outcome.ok, false);
	assert.equal(outcome.controllerCalled, false);
	assert.equal(calls, 0);
});

test("no-op apply closes cleanly without controller call or revision", () => {
	const controller = importTree();
	const before = controller.getState();
	const outcome = applyNodeEditorDraft(controller, createNodeEditorDraft(before.project.collections[0]));
	assert.deepEqual(outcome, { ok: true, controllerCalled: false, diagnostics: [] });
	assert.equal(controller.getState(), before);
});

test("cancelled local changes perform no controller action", () => {
	const controller = importTree();
	const before = controller.getState();
	changedDraft(before.project.collections[0], { id: "discard", title: "Discard" });
	assert.equal(controller.getState(), before);
	assert.equal(controller.getState().dirty, false);
});

test("controller failure remains structured and leaves the project atomic", () => {
	const controller = importTree();
	const collection = controller.getState().project.collections[0];
	const beforeProject = controller.getState().project;
	const missingDraft = { ...changedDraft(collection, { title: "No target" }), internalId: "missing" };
	const outcome = applyNodeEditorDraft(controller, missingDraft);
	assert.equal(outcome.ok, false);
	assert.equal(outcome.controllerCalled, true);
	assert.equal(controller.getState().project, beforeProject);
	assert.equal(controller.getState().diagnostics.operation.errors[0].code, "TARGET_NODE_NOT_FOUND");
});

test("collection internal identity remains stable when Nuvio ID and title change", () => {
	const controller = importTree();
	const before = controller.getState().project.collections[0];
	applyNodeEditorDraft(controller, changedDraft(before, { id: "renamed", title: "Renamed" }));
	const after = controller.getState().project.collections[0];
	assert.equal(after.internalId, before.internalId);
	assert.equal(after.nodeType, "collection");
	assert.equal(controller.getState().selection.collectionInternalId, null);
});

test("duplicate Nuvio-facing collection IDs remain distinct by internal ID", () => {
	const controller = importTree([
		{ id: "duplicate", title: "One", folders: [] },
		{ id: "two", title: "Two", folders: [] },
	]);
	const [first, second] = controller.getState().project.collections;
	applyNodeEditorDraft(controller, changedDraft(second, { id: "duplicate" }));
	const current = controller.getState().project.collections;
	assert.deepEqual(current.map((entry) => entry.editable.id), ["duplicate", "duplicate"]);
	assert.notEqual(first.internalId, second.internalId);
	controller.selectNode(second.internalId);
	assert.equal(controller.getState().selection.collectionInternalId, second.internalId);
});

test("duplicate Nuvio-facing folder IDs remain distinct by internal ID", () => {
	const controller = importTree([{ id: "c", title: "C", folders: [
		{ id: "duplicate", title: "One", sources: [] },
		{ id: "two", title: "Two", sources: [] },
	] }]);
	const [first, second] = controller.getState().project.collections[0].folders;
	applyNodeEditorDraft(controller, changedDraft(second, { id: "duplicate" }));
	assert.notEqual(first.internalId, second.internalId);
	controller.selectNode(second.internalId);
	assert.equal(controller.getState().selection.folderInternalId, second.internalId);
});

test("opaque community edits preserve raw snapshots, unknown fields, children, and serializer overlay", () => {
	const controller = importTree(loadFixture("valid/opaque-community-import.json"));
	const collection = controller.getState().project.collections[0];
	const folder = collection.folders[0];
	const beforeRaw = structuredClone({
		collection: collection.rawImported,
		folder: folder.rawImported,
		source: folder.sources[0].rawImported,
	});
	applyNodeEditorDraft(controller, changedDraft(collection, { id: "edited-community", title: "Edited Community" }));
	const currentFolder = controller.getState().project.collections[0].folders[0];
	applyNodeEditorDraft(controller, changedDraft(currentFolder, { id: "edited-folder", title: "Edited Folder" }));
	const current = controller.getState().project.collections[0];
	assert.deepEqual(current.rawImported, beforeRaw.collection);
	assert.deepEqual(current.folders[0].rawImported, beforeRaw.folder);
	assert.deepEqual(current.folders[0].sources[0].rawImported, beforeRaw.source);
	const output = serializeNuvioProject(controller.getState().project).value[0];
	assert.equal(output.id, "edited-community");
	assert.equal(output.title, "Edited Community");
	assert.equal(output.folders[0].id, "edited-folder");
	assert.deepEqual(output.communityMetadata, { owner: "fixture-sentinel", revision: 7 });
	assert.deepEqual(output.folders[0].communityLayout, { density: "compact", accent: "violet" });
	assert.equal(output.folders[0].sources[0].unknownBoolean, true);
});

test("mixed source edits preserve source categories, order, projections, and migration state", () => {
	const controller = importTree(loadFixture("valid/mixed-native-and-addon.json"));
	const collection = controller.getState().project.collections[0];
	const folder = collection.folders[0];
	const beforePreview = structuredClone(controller.getState().migrationPreview);
	const beforeSources = structuredClone(folder.sources);
	const beforeCatalogSources = structuredClone(folder.rawImported.catalogSources);
	applyNodeEditorDraft(controller, changedDraft(folder, { title: "Edited Mixed Folder" }));
	const currentFolder = controller.getState().project.collections[0].folders[0];
	assert.deepEqual(currentFolder.sources, beforeSources);
	assert.deepEqual(currentFolder.rawImported.catalogSources, beforeCatalogSources);
	assert.deepEqual(controller.getState().migrationPreview, beforePreview);
	const output = serializeNuvioProject(controller.getState().project).value[0].folders[0];
	assert.deepEqual(output.sources.map((source) => source.provider), ["tmdb", "addon"]);
	assert.deepEqual(output.catalogSources.map((source) => source.catalogId), ["trending-series"]);
	assert.equal(JSON.stringify(output).includes("internalId"), false);
});

test("workspace initially has no editor and exposes collection edit only in collection context", () => {
	const controller = importTree();
	const collection = controller.getState().project.collections[0];
	controller.selectNode(collection.internalId);
	const markup = renderWorkspace(controller);
	assert.equal(markup.includes("data-node-editor="), false);
	assert.ok(markup.includes('data-action="edit-collection"'));
	assert.equal(markup.includes('data-action="edit-folder"'), false);
	assert.equal(markup.includes("Edit source"), false);
});

test("folder context exposes a folder edit action and no source editor action", () => {
	const controller = importTree();
	const folder = controller.getState().project.collections[0].folders[0];
	controller.selectNode(folder.internalId);
	const markup = renderWorkspace(controller);
	assert.ok(markup.includes('data-action="edit-folder"'));
	assert.equal(markup.includes('data-action="edit-source"'), false);
});

test("collection editor renders exactly one labelled form with stable markers and actions", () => {
	const controller = importTree();
	const collection = controller.getState().project.collections[0];
	controller.selectNode(collection.internalId);
	const markup = renderWorkspace(controller, { draft: createNodeEditorDraft(collection) });
	assert.equal((markup.match(/data-node-editor=/g) ?? []).length, 1);
	for (const marker of [
		'data-node-editor="collection"',
		'data-editor-field="id"',
		'data-editor-field="title"',
		'data-action="apply-node-edit"',
		'data-action="cancel-node-edit"',
	]) assert.ok(markup.includes(marker), marker);
	assert.ok(markup.includes("Collection settings"));
	assert.ok(markup.includes("Edit collection"));
	assert.match(markup, /<label for="node-editor-collection-id">ID<\/label>/);
	assert.match(markup, /<label for="node-editor-collection-title-input">Title<\/label>/);
});

test("folder editor keeps unique IDs, valid descriptions, one h1, and one local alert", () => {
	const controller = importTree();
	const folder = controller.getState().project.collections[0].folders[0];
	controller.selectNode(folder.internalId);
	const diagnostics = validateNodeEditorDraft(changedDraft(folder, { id: "", title: "" }));
	const markup = renderWorkspace(controller, { draft: changedDraft(folder, { id: "", title: "" }), diagnostics });
	const ids = [...markup.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
	assert.equal(ids.length, new Set(ids).size);
	for (const match of markup.matchAll(/aria-describedby="([^"]+)"/g)) {
		for (const id of match[1].split(" ")) assert.equal(ids.filter((entry) => entry === id).length, 1, id);
	}
	assert.equal((markup.match(/<h1/g) ?? []).length, 1);
	assert.equal((markup.match(/class="editor-diagnostics" role="alert"/g) ?? []).length, 1);
	assert.ok(markup.includes("Folder settings"));
});

test("unusual imported values show calm replacement guidance without raw values", () => {
	const controller = importTree([{ id: { secret: "RAW_OBJECT" }, title: false, folders: [] }]);
	const collection = controller.getState().project.collections[0];
	controller.selectNode(collection.internalId);
	const markup = renderWorkspace(controller, { draft: createNodeEditorDraft(collection) });
	assert.equal((markup.match(/The imported value is not text/g) ?? []).length, 2);
	assert.equal(markup.includes("RAW_OBJECT"), false);
	assert.equal(markup.includes('value="false"'), false);
});

test("editor-active workspace disables every hierarchy and mobile navigation button", () => {
	const controller = importTree();
	const folder = controller.getState().project.collections[0].folders[0];
	controller.selectNode(folder.sources[0].internalId);
	const markup = renderWorkspace(controller, { draft: createNodeEditorDraft(folder) });
	assert.ok(markup.includes('data-editor-lock="true"'));
	for (const marker of [
		'data-node-type="collection"',
		'data-node-type="folder"',
		'data-node-type="source"',
		'data-action="create-collection"',
		'data-action="create-folder"',
		'data-action="edit-collection"',
		'data-action="edit-folder"',
	]) assert.ok(openingTag(markup, marker).includes("disabled"), marker);
	assert.equal((markup.match(/<button class="back-control mobile-only"[^>]*disabled/g) ?? []).length, 2);
	assert.ok(openingTag(markup, ">Show folder details<").includes("disabled"), "Show folder details");
	assert.ok(markup.includes("Hierarchy navigation is paused"));
});

test("Apply and Cancel remain enabled while hierarchy controls are locked", () => {
	const controller = importTree();
	const collection = controller.getState().project.collections[0];
	controller.selectNode(collection.internalId);
	const markup = renderWorkspace(controller, { draft: createNodeEditorDraft(collection) });
	assert.equal(openingTag(markup, 'data-action="apply-node-edit"').includes("disabled"), false);
	assert.equal(openingTag(markup, 'data-action="cancel-node-edit"').includes("disabled"), false);
});

test("styles keep the editor responsive, focused, touch-sized, and visibly disabled", () => {
	const styles = fs.readFileSync(path.join(rootDir, "builder", "src", "styles.css"), "utf8");
	assert.match(styles, /\.node-editor\s*\{[\s\S]*max-width:\s*900px/);
	assert.match(styles, /\.editor-field input\s*\{[\s\S]*min-height:\s*48px/);
	assert.match(styles, /button:disabled/);
	assert.match(styles, /@media \(max-width: 430px\)/);
	assert.match(styles, /@media \(min-width: 620px\)/);
	assert.match(styles, /@media \(min-width: 760px\)/);
	assert.match(styles, /focus-visible/);
});

test("UI scope contains no deferred editor, persistence, routing, export, delete, or reorder actions", () => {
	const uiFiles = fs.readdirSync(path.join(rootDir, "builder", "src", "ui"))
		.filter((name) => /\.(?:js|jsx)$/.test(name))
		.map((name) => fs.readFileSync(path.join(rootDir, "builder", "src", "ui", name), "utf8"))
		.join("\n");
	for (const marker of [
		'data-action="edit-source"',
		'data-action="delete-',
		'data-action="reorder-',
		'data-action="export-',
		"localStorage",
		"indexedDB",
		"react-router",
		"showSaveFilePicker",
	]) assert.equal(uiFiles.includes(marker), false, marker);
});
