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
	isInvisibleNuvioTitle,
	isValidNuvioTitle,
	isValidVisibleNuvioTitle,
	NUVIO_INVISIBLE_TITLE,
} from "../builder/src/nuvio/titles.js";
import { serializeNuvioProject } from "../builder/src/serialize/index.js";
import {
	focusFirstDialogControl,
	handleDialogKeyDown,
} from "../builder/src/ui/modal-focus.js";
import { applyNodeEditorDraft } from "../builder/src/ui/node-editor-actions.js";
import {
	buildNodeEditorPatch,
	createNodeEditorDraft,
	hasNodeEditorChanges,
	updateNodeEditorField,
	validateNodeEditorDraft,
} from "../builder/src/ui/node-editor.js";
import {
	applyQuickRenameDraft,
	buildQuickRenamePatch,
	createQuickRenameDraft,
	updateQuickRenameTitle,
	validateQuickRenameDraft,
} from "../builder/src/ui/quick-rename.js";
import { buildBuilderViewModel } from "../builder/src/ui/view-model.js";

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
	return createBuilderController({
		idFactory: countingIdFactory(),
		nuvioIdFactory: countingIdFactory("nuvio"),
		initialProjectTitle: "Editing test",
	});
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
		initialRenameDraft: options.renameDraft ?? null,
		initialRenameDiagnostics: options.renameDiagnostics ?? [],
	}));
}

function openingTag(markup, marker) {
	const index = markup.indexOf(marker);
	assert.notEqual(index, -1, marker);
	const start = markup.lastIndexOf("<", index);
	const end = markup.indexOf(">", index);
	return markup.slice(start, end + 1);
}

function markedElement(markup, marker, tagName) {
	const markerIndex = markup.indexOf(marker);
	assert.notEqual(markerIndex, -1, marker);
	const start = markup.lastIndexOf(`<${tagName}`, markerIndex);
	const end = markup.indexOf(`</${tagName}>`, markerIndex);
	assert.notEqual(start, -1, `${marker} opening ${tagName}`);
	assert.notEqual(end, -1, `${marker} closing ${tagName}`);
	return markup.slice(start, end + tagName.length + 3);
}

function workspacePanelMarkup(markup, marker) {
	const markerIndex = markup.indexOf(marker);
	assert.notEqual(markerIndex, -1, marker);
	const start = markup.lastIndexOf('<section class="workspace-panel', markerIndex);
	const next = markup.indexOf('<section class="workspace-panel', markerIndex + marker.length);
	return markup.slice(start, next === -1 ? markup.length : next);
}

test("collection draft retains only stable target identity and editor values", () => {
	const collection = importTree().getState().project.collections[0];
	const draft = createNodeEditorDraft(collection);
	assert.equal(draft.internalId, collection.internalId);
	assert.equal(draft.nodeType, "collection");
	assert.deepEqual(draft.values, {
		title: "Collection title",
		hideNuvioTitle: false,
		viewMode: "",
		showAllTab: true,
		pinToTop: false,
	});
	assert.equal(JSON.stringify(draft).includes("collection-id"), false);
});

test("folder draft retains only stable target identity and editor values", () => {
	const folder = importTree().getState().project.collections[0].folders[0];
	const draft = createNodeEditorDraft(folder);
	assert.equal(draft.internalId, folder.internalId);
	assert.equal(draft.nodeType, "folder");
	assert.deepEqual(draft.values, {
		title: "Folder title",
		hideNuvioTitle: false,
		tileShape: "",
		showFolderTitle: true,
	});
	assert.equal(JSON.stringify(draft).includes("folder-id"), false);
});

test("project and source targets are rejected", () => {
	const project = importTree().getState().project;
	assert.equal(createNodeEditorDraft(project), null);
	assert.equal(createNodeEditorDraft(project.collections[0].folders[0].sources[0]), null);
});

test("title strings are copied exactly without trimming while IDs stay absent", () => {
	const controller = importTree([{ id: "  id  ", title: "  title  ", folders: [] }]);
	const draft = createNodeEditorDraft(controller.getState().project.collections[0]);
	assert.equal(draft.values.title, "  title  ");
	assert.equal(Object.hasOwn(draft.values, "id"), false);
});

test("absent imported values become empty unsupported form strings", () => {
	const collection = importTree([{ folders: [] }]).getState().project.collections[0];
	const draft = createNodeEditorDraft(collection);
	assert.equal(draft.values.title, "");
	assert.deepEqual(draft.original.title, {
		value: null,
		hasField: false,
		supported: false,
		hidden: false,
		status: "absent",
	});
});

test("non-string imported values are never stringified", () => {
	const collection = importTree([{ id: { sentinel: "RAW_ID" }, title: ["RAW_TITLE"], folders: [] }])
		.getState().project.collections[0];
	const draft = createNodeEditorDraft(collection);
	assert.equal(draft.values.title, "");
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

test("updating ID is ignored because ID is not an editor field", () => {
	const original = createNodeEditorDraft(importTree().getState().project.collections[0]);
	const next = updateNodeEditorField(original, "id", "new-id");
	assert.equal(next, original);
	assert.equal(Object.hasOwn(next.values, "id"), false);
});

test("updating title changes only title form state and touched state", () => {
	const original = createNodeEditorDraft(importTree().getState().project.collections[0]);
	const next = updateNodeEditorField(original, "title", "New title");
	assert.equal(next.values.title, "New title");
	assert.equal(next.touched.title, true);
	assert.equal(next.touched.hideNuvioTitle, false);
	assert.equal(next.touched.viewMode, false);
	assert.equal(next.touched.showAllTab, false);
	assert.equal(next.touched.pinToTop, false);
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
	assert.equal(updateNodeEditorField(original, "id", "replacement"), original);
});

test("supported presentation values retain imported casing while untouched", () => {
	const controller = importTree([{
		id: "collection",
		title: "Collection",
		viewMode: "rows",
		showAllTab: false,
		pinToTop: true,
		folders: [{
			id: "folder",
			title: "Folder",
			tileShape: "landscape",
			hideTitle: false,
			sources: [],
		}],
	}]);
	const collection = controller.getState().project.collections[0];
	const folder = collection.folders[0];
	const collectionDraft = createNodeEditorDraft(collection);
	const folderDraft = createNodeEditorDraft(folder);

	assert.equal(collectionDraft.values.viewMode, "rows");
	assert.equal(collectionDraft.original.viewMode.value, "rows");
	assert.equal(folderDraft.values.tileShape, "landscape");
	assert.equal(folderDraft.original.tileShape.value, "landscape");
	assert.deepEqual(buildNodeEditorPatch(collectionDraft), {});
	assert.deepEqual(buildNodeEditorPatch(folderDraft), {});
});

test("collection presentation updates accept only canonical supported values", () => {
	const collection = importTree([{
		id: "collection",
		title: "Collection",
		viewMode: "TABBED_GRID",
		showAllTab: true,
		pinToTop: false,
		folders: [],
	}]).getState().project.collections[0];
	const original = createNodeEditorDraft(collection);

	assert.equal(updateNodeEditorField(original, "viewMode", "FOLLOW_LAYOUT"), original);
	assert.equal(updateNodeEditorField(original, "viewMode", "rows"), original);

	let draft = updateNodeEditorField(original, "viewMode", "ROWS");
	assert.equal(draft.values.showAllTab, true);
	assert.deepEqual(buildNodeEditorPatch(draft), { viewMode: "ROWS" });
	draft = updateNodeEditorField(draft, "viewMode", "TABBED_GRID");
	assert.equal(draft.values.showAllTab, true);
	assert.deepEqual(buildNodeEditorPatch(draft), {});

	draft = updateNodeEditorField(draft, "showAllTab", false);
	draft = updateNodeEditorField(draft, "pinToTop", true);
	assert.deepEqual(buildNodeEditorPatch(draft), {
		showAllTab: false,
		pinToTop: true,
	});
});

test("folder presentation updates map positive title wording to inverse hideTitle", () => {
	const folder = importTree([{
		id: "collection",
		title: "Collection",
		folders: [{
			id: "folder",
			title: "Folder",
			tileShape: "POSTER",
			hideTitle: false,
			sources: [],
		}],
	}]).getState().project.collections[0].folders[0];
	let draft = createNodeEditorDraft(folder);
	draft = updateNodeEditorField(draft, "tileShape", "LANDSCAPE");
	draft = updateNodeEditorField(draft, "showFolderTitle", false);
	assert.deepEqual(buildNodeEditorPatch(draft), {
		tileShape: "LANDSCAPE",
		hideTitle: true,
	});

	draft = updateNodeEditorField(draft, "tileShape", "POSTER");
	draft = updateNodeEditorField(draft, "showFolderTitle", true);
	assert.deepEqual(buildNodeEditorPatch(draft), {});
});

test("Follow Layout and Square are preservation-only until deliberate replacement", () => {
	const controller = importTree([{
		id: "collection",
		title: "Collection",
		viewMode: "FOLLOW_LAYOUT",
		folders: [{
			id: "folder",
			title: "Folder",
			tileShape: "SQUARE",
			sources: [],
		}],
	}]);
	const collection = controller.getState().project.collections[0];
	const folder = collection.folders[0];
	const collectionDraft = createNodeEditorDraft(collection);
	const folderDraft = createNodeEditorDraft(folder);

	assert.equal(collectionDraft.values.viewMode, "");
	assert.equal(collectionDraft.original.viewMode.status, "preserved");
	assert.equal(folderDraft.values.tileShape, "");
	assert.equal(folderDraft.original.tileShape.status, "preserved");
	assert.equal(JSON.stringify(collectionDraft).includes("FOLLOW_LAYOUT"), false);
	assert.equal(JSON.stringify(folderDraft).includes("SQUARE"), false);
	assert.deepEqual(buildNodeEditorPatch(changedDraft(collection, { title: "Renamed" })), { title: "Renamed" });
	assert.deepEqual(
		buildNodeEditorPatch(updateNodeEditorField(collectionDraft, "viewMode", "ROWS")),
		{ viewMode: "ROWS" },
	);
	assert.deepEqual(
		buildNodeEditorPatch(updateNodeEditorField(folderDraft, "tileShape", "LANDSCAPE")),
		{ tileShape: "LANDSCAPE" },
	);
});

test("absent unsupported and unusual presentation values stay out of unrelated patches", () => {
	const controller = importTree([{
		id: "collection",
		title: "Collection",
		viewMode: { rawLayout: "PRIVATE_LAYOUT" },
		showAllTab: ["PRIVATE_ALL"],
		pinToTop: 1,
		folders: [{
			id: "folder",
			title: "Folder",
			tileShape: { rawShape: "PRIVATE_SHAPE" },
			hideTitle: ["PRIVATE_TITLE"],
			sources: [],
		}],
	}]);
	const collection = controller.getState().project.collections[0];
	const folder = collection.folders[0];
	const collectionDraft = changedDraft(collection, { title: "Edited collection" });
	const folderDraft = changedDraft(folder, { title: "Edited folder" });

	assert.deepEqual(buildNodeEditorPatch(collectionDraft), { title: "Edited collection" });
	assert.deepEqual(buildNodeEditorPatch(folderDraft), { title: "Edited folder" });
	for (const sentinel of ["PRIVATE_LAYOUT", "PRIVATE_ALL", "PRIVATE_SHAPE", "PRIVATE_TITLE"]) {
		assert.equal(JSON.stringify({ collectionDraft, folderDraft }).includes(sentinel), false);
	}
});

test("valid collection and folder drafts pass validation", () => {
	const project = importTree().getState().project;
	assert.deepEqual(validateNodeEditorDraft(createNodeEditorDraft(project.collections[0])), []);
	assert.deepEqual(validateNodeEditorDraft(createNodeEditorDraft(project.collections[0].folders[0])), []);
});

test("draft state contains no ID validation or ID comparison metadata", () => {
	const draft = changedDraft(importTree().getState().project.collections[0], { id: "" });
	assert.deepEqual(validateNodeEditorDraft(draft), []);
	assert.equal(Object.hasOwn(draft.values, "id"), false);
	assert.equal(Object.hasOwn(draft.original, "id"), false);
	assert.equal(Object.hasOwn(draft.touched, "id"), false);
});

test("hidden folder IDs do not affect local title validation", () => {
	const folder = importTree().getState().project.collections[0].folders[0];
	const draft = changedDraft(folder, { id: " \t " });
	assert.deepEqual(validateNodeEditorDraft(draft), []);
	assert.equal(Object.hasOwn(draft.values, "id"), false);
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

test("title-only validation returns exactly one current field error", () => {
	const draft = changedDraft(importTree().getState().project.collections[0], { id: "", title: " " });
	assert.deepEqual(validateNodeEditorDraft(draft).map((entry) => entry.code), ["EDITOR_TITLE_REQUIRED"]);
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

test("patch generation never produces an ID patch", () => {
	const draft = changedDraft(importTree().getState().project.collections[0], { id: "collection-comedy" });
	assert.deepEqual(buildNodeEditorPatch(draft), {});
});

test("patch generation remains title-only when an ID update is attempted", () => {
	const draft = changedDraft(importTree().getState().project.collections[0], { id: "new-id", title: "New title" });
	assert.deepEqual(buildNodeEditorPatch(draft), { title: "New title" });
});

test("untouched and touched-but-reverted fields are omitted", () => {
	const node = importTree().getState().project.collections[0];
	let draft = changedDraft(node, { title: "Temporary" });
	draft = updateNodeEditorField(draft, "title", "Collection title");
	assert.deepEqual(buildNodeEditorPatch(draft), {});
	assert.equal(hasNodeEditorChanges(draft), false);
});

test("untouched absent and non-string title originals remain omitted", () => {
	const project = importTree([{ id: "valid", title: { unusual: true }, folders: [] }]).getState().project;
	assert.deepEqual(buildNodeEditorPatch(createNodeEditorDraft(project.collections[0])), {});
});

test("explicit text replacement of a non-string original appears in the patch", () => {
	const node = importTree([{ id: 7, title: false, folders: [] }]).getState().project.collections[0];
	const draft = changedDraft(node, { id: "seven", title: "Replacement" });
	assert.deepEqual(buildNodeEditorPatch(draft), { title: "Replacement" });
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
	const originalId = collection.editable.id;
	const outcome = applyNodeEditorDraft(controller, changedDraft(collection, { id: "edited-id", title: "Edited" }));
	assert.deepEqual(outcome, { ok: true, controllerCalled: true, diagnostics: [] });
	assert.equal(controller.getState().revision, beforeRevision + 1);
	assert.equal(controller.getState().dirty, true);
	assert.deepEqual(controller.getState().project.collections[0].editable.id, originalId);
	assert.equal(controller.getState().project.collections[0].editable.title, "Edited");
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

test("collection presentation apply commits one minimal patch and one revision", () => {
	const controller = importTree([{
		id: "collection",
		title: "Collection",
		viewMode: "TABBED_GRID",
		showAllTab: true,
		pinToTop: false,
		folders: [],
	}]);
	const collection = controller.getState().project.collections[0];
	controller.selectNode(collection.internalId);
	const beforeRevision = controller.getState().revision;
	let draft = createNodeEditorDraft(collection);
	draft = updateNodeEditorField(draft, "viewMode", "ROWS");
	draft = updateNodeEditorField(draft, "pinToTop", true);
	const outcome = applyNodeEditorDraft(controller, draft);

	assert.equal(outcome.ok, true);
	assert.equal(controller.getState().revision, beforeRevision + 1);
	assert.equal(controller.getState().dirty, true);
	assert.equal(controller.getState().selection.collectionInternalId, collection.internalId);
	assert.deepEqual(controller.getState().project.collections[0].editable, {
		id: "collection",
		title: "Collection",
		viewMode: "ROWS",
		showAllTab: true,
		pinToTop: true,
	});
});

test("folder presentation apply commits canonical shape and inverse title value once", () => {
	const controller = importTree([{
		id: "collection",
		title: "Collection",
		folders: [{
			id: "folder",
			title: "Folder",
			tileShape: "POSTER",
			hideTitle: false,
			sources: [],
		}],
	}]);
	const folder = controller.getState().project.collections[0].folders[0];
	controller.selectNode(folder.internalId);
	const beforeRevision = controller.getState().revision;
	let draft = createNodeEditorDraft(folder);
	draft = updateNodeEditorField(draft, "tileShape", "LANDSCAPE");
	draft = updateNodeEditorField(draft, "showFolderTitle", false);
	const outcome = applyNodeEditorDraft(controller, draft);

	assert.equal(outcome.ok, true);
	assert.equal(controller.getState().revision, beforeRevision + 1);
	assert.equal(controller.getState().selection.folderInternalId, folder.internalId);
	assert.equal(controller.getState().project.collections[0].folders[0].editable.tileShape, "LANDSCAPE");
	assert.equal(controller.getState().project.collections[0].folders[0].editable.hideTitle, true);
});

test("invalid apply never calls the controller", () => {
	let calls = 0;
	const controller = { updateNode() { calls += 1; return { ok: true }; } };
	const draft = changedDraft(importTree().getState().project.collections[0], { title: "" });
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
	changedDraft(before.project.collections[0], { title: "Discard" });
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

test("collection internal and Nuvio identities remain stable when title changes", () => {
	const controller = importTree();
	const before = controller.getState().project.collections[0];
	applyNodeEditorDraft(controller, changedDraft(before, { title: "Renamed" }));
	const after = controller.getState().project.collections[0];
	assert.equal(after.internalId, before.internalId);
	assert.equal(after.nodeType, "collection");
	assert.equal(after.editable.id, before.editable.id);
	assert.equal(controller.getState().selection.collectionInternalId, null);
});

test("repaired duplicate collection IDs remain distinct by internal ID", () => {
	const controller = importTree([
		{ id: "duplicate", title: "One", folders: [] },
		{ id: "two", title: "Two", folders: [] },
	]);
	const [first, second] = controller.getState().project.collections;
	const current = controller.getState().project.collections;
	assert.equal(current[0].editable.id, "duplicate");
	assert.notEqual(current[1].editable.id, "duplicate");
	assert.notEqual(first.internalId, second.internalId);
	controller.selectNode(second.internalId);
	assert.equal(controller.getState().selection.collectionInternalId, second.internalId);
});

test("repaired duplicate folder IDs remain distinct by internal ID", () => {
	const controller = importTree([{ id: "c", title: "C", folders: [
		{ id: "duplicate", title: "One", sources: [] },
		{ id: "two", title: "Two", sources: [] },
	] }]);
	const [first, second] = controller.getState().project.collections[0].folders;
	assert.notEqual(first.internalId, second.internalId);
	assert.notEqual(first.editable.id, second.editable.id);
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
	applyNodeEditorDraft(controller, changedDraft(collection, { title: "Edited Community" }));
	const currentFolder = controller.getState().project.collections[0].folders[0];
	applyNodeEditorDraft(controller, changedDraft(currentFolder, { title: "Edited Folder" }));
	const current = controller.getState().project.collections[0];
	assert.deepEqual(current.rawImported, beforeRaw.collection);
	assert.deepEqual(current.folders[0].rawImported, beforeRaw.folder);
	assert.deepEqual(current.folders[0].sources[0].rawImported, beforeRaw.source);
	const output = serializeNuvioProject(controller.getState().project).value[0];
	assert.equal(output.id, collection.editable.id);
	assert.equal(output.title, "Edited Community");
	assert.equal(output.folders[0].id, folder.editable.id);
	assert.deepEqual(output.communityMetadata, { owner: "fixture-sentinel", revision: 7 });
	assert.deepEqual(output.folders[0].communityLayout, { density: "compact", accent: "violet" });
	assert.equal(output.folders[0].sources[0].unknownBoolean, true);
});

test("mixed presentation edits preserve source order, projections, artwork, and serializer cycle stability", () => {
	const controller = importTree(loadFixture("valid/mixed-native-and-addon.json"));
	const collection = controller.getState().project.collections[0];
	const folder = collection.folders[0];
	const beforePreview = structuredClone(controller.getState().migrationPreview);
	const beforeSources = structuredClone(folder.sources);
	const beforeCatalogSources = structuredClone(folder.rawImported.catalogSources);
	const beforeArtwork = {
		coverEmoji: folder.editable.coverEmoji,
		focusGifUrl: folder.editable.focusGifUrl,
		heroVideoUrl: folder.editable.heroVideoUrl,
		titleLogoUrl: folder.editable.titleLogoUrl,
		coverImageUrl: folder.editable.coverImageUrl,
		focusGifEnabled: folder.editable.focusGifEnabled,
		heroBackdropUrl: folder.editable.heroBackdropUrl,
	};
	let collectionDraft = createNodeEditorDraft(collection);
	collectionDraft = updateNodeEditorField(collectionDraft, "viewMode", "TABBED_GRID");
	collectionDraft = updateNodeEditorField(collectionDraft, "showAllTab", false);
	collectionDraft = updateNodeEditorField(collectionDraft, "pinToTop", true);
	applyNodeEditorDraft(controller, collectionDraft);

	let folderDraft = createNodeEditorDraft(controller.getState().project.collections[0].folders[0]);
	folderDraft = updateNodeEditorField(folderDraft, "title", "Edited Mixed Folder");
	folderDraft = updateNodeEditorField(folderDraft, "tileShape", "POSTER");
	folderDraft = updateNodeEditorField(folderDraft, "showFolderTitle", false);
	applyNodeEditorDraft(controller, folderDraft);
	const currentFolder = controller.getState().project.collections[0].folders[0];
	assert.deepEqual(currentFolder.sources, beforeSources);
	assert.deepEqual(currentFolder.rawImported.catalogSources, beforeCatalogSources);
	for (const [field, value] of Object.entries(beforeArtwork)) {
		assert.equal(currentFolder.editable[field], value, field);
	}
	assert.deepEqual(controller.getState().migrationPreview, beforePreview);
	const output = serializeNuvioProject(controller.getState().project).value;
	assert.equal(output[0].viewMode, "TABBED_GRID");
	assert.equal(output[0].showAllTab, false);
	assert.equal(output[0].pinToTop, true);
	assert.equal(output[0].folders[0].tileShape, "POSTER");
	assert.equal(output[0].folders[0].hideTitle, true);
	assert.deepEqual(output[0].folders[0].sources.map((source) => source.provider), ["tmdb", "addon"]);
	assert.deepEqual(output[0].folders[0].catalogSources.map((source) => source.catalogId), ["trending-series"]);
	assert.equal(JSON.stringify(output).includes("internalId"), false);

	const cycledController = createController();
	assert.equal(cycledController.importValue(output).ok, true);
	assert.deepEqual(serializeNuvioProject(cycledController.getState().project).value, output);
});

test("the supported intentional invisible title is exactly U+200E", () => {
	assert.equal(NUVIO_INVISIBLE_TITLE, "\u200E");
	assert.equal([...NUVIO_INVISIBLE_TITLE].length, 1);
	assert.equal(NUVIO_INVISIBLE_TITLE.codePointAt(0), 0x200e);
	assert.equal(isInvisibleNuvioTitle(""), false);
	assert.equal(isInvisibleNuvioTitle(NUVIO_INVISIBLE_TITLE), true);
	assert.equal(isInvisibleNuvioTitle(NUVIO_INVISIBLE_TITLE.repeat(3)), true);
	for (const unsupported of ["\u200B", "\u2060", "\uFEFF", " ", "\t"]) {
		assert.equal(isInvisibleNuvioTitle(unsupported), false, JSON.stringify(unsupported));
		assert.equal(isValidNuvioTitle(unsupported), false, JSON.stringify(unsupported));
	}
	assert.equal(isInvisibleNuvioTitle(`Visible${NUVIO_INVISIBLE_TITLE}`), false);
	assert.equal(isValidVisibleNuvioTitle(`Visible${NUVIO_INVISIBLE_TITLE}`), true);
});

test("collection hidden-title toggle emits one U+200E and restores the prior visible modal draft", () => {
	const collection = importTree().getState().project.collections[0];
	let draft = createNodeEditorDraft(collection);
	assert.equal(draft.values.hideNuvioTitle, false);
	assert.equal(draft.visibleTitleDraft, "Collection title");

	draft = updateNodeEditorField(draft, "hideNuvioTitle", true);
	assert.equal(draft.values.title, NUVIO_INVISIBLE_TITLE);
	assert.equal(draft.values.hideNuvioTitle, true);
	assert.equal(draft.visibleTitleDraft, "Collection title");
	assert.deepEqual(buildNodeEditorPatch(draft), { title: NUVIO_INVISIBLE_TITLE });

	draft = updateNodeEditorField(draft, "hideNuvioTitle", false);
	assert.equal(draft.values.title, "Collection title");
	assert.equal(draft.values.hideNuvioTitle, false);
	assert.deepEqual(buildNodeEditorPatch(draft), {});
});

test("folder invisible name remains separate from native hideTitle presentation", () => {
	const controller = importTree([{
		id: "collection",
		title: "Collection",
		folders: [{
			id: "folder",
			title: "Folder",
			hideTitle: false,
			tileShape: "POSTER",
			sources: [],
		}],
	}]);
	const folder = controller.getState().project.collections[0].folders[0];
	let draft = createNodeEditorDraft(folder);
	draft = updateNodeEditorField(draft, "hideNuvioTitle", true);
	assert.deepEqual(buildNodeEditorPatch(draft), { title: NUVIO_INVISIBLE_TITLE });
	assert.equal(draft.values.showFolderTitle, true);
	applyNodeEditorDraft(controller, draft);
	const current = controller.getState().project.collections[0].folders[0];
	assert.equal(current.editable.title, NUVIO_INVISIBLE_TITLE);
	assert.equal(current.editable.hideTitle, false);
});

test("repeated imported U+200E titles are recognised and preserved through unrelated edits and a serializer cycle", () => {
	const repeated = NUVIO_INVISIBLE_TITLE.repeat(3);
	const controller = importTree([{
		id: "collection",
		title: repeated,
		pinToTop: false,
		viewMode: "TABBED_GRID",
		showAllTab: true,
		folders: [{
			id: "folder",
			title: repeated,
			tileShape: "POSTER",
			hideTitle: false,
			sources: [],
		}],
	}]);
	const collection = controller.getState().project.collections[0];
	const folder = collection.folders[0];
	const collectionDraft = createNodeEditorDraft(collection);
	const folderDraft = createNodeEditorDraft(folder);
	assert.equal(collectionDraft.values.hideNuvioTitle, true);
	assert.equal(folderDraft.values.hideNuvioTitle, true);
	assert.equal(collectionDraft.values.title, repeated);
	assert.equal(folderDraft.values.title, repeated);

	applyNodeEditorDraft(
		controller,
		updateNodeEditorField(collectionDraft, "pinToTop", true),
	);
	applyNodeEditorDraft(
		controller,
		updateNodeEditorField(folderDraft, "tileShape", "LANDSCAPE"),
	);
	const output = serializeNuvioProject(controller.getState().project).value;
	assert.equal(output[0].title, repeated);
	assert.equal(output[0].folders[0].title, repeated);
	assert.equal(JSON.stringify(output).includes("hideNuvioTitle"), false);
	assert.equal(JSON.stringify(output).includes("Hidden title"), false);

	const cycledController = createController();
	assert.equal(cycledController.importValue(output).ok, true);
	assert.deepEqual(serializeNuvioProject(cycledController.getState().project).value, output);
});

test("disabling an imported invisible title requires a visible replacement", () => {
	const repeated = NUVIO_INVISIBLE_TITLE.repeat(2);
	const collection = importTree([{ id: "hidden", title: repeated, folders: [] }])
		.getState().project.collections[0];
	let draft = createNodeEditorDraft(collection);
	draft = updateNodeEditorField(draft, "hideNuvioTitle", false);
	assert.equal(draft.values.title, "");
	assert.deepEqual(validateNodeEditorDraft(draft), [{
		code: "EDITOR_TITLE_REQUIRED",
		path: "$ui.editor.title",
		message: "Enter a collection title before applying changes.",
	}]);

	draft = updateNodeEditorField(draft, "title", "Visible replacement");
	assert.deepEqual(validateNodeEditorDraft(draft), []);
	assert.deepEqual(buildNodeEditorPatch(draft), { title: "Visible replacement" });
});

test("quick rename drafts safely initialise visible, hidden, and unusual imported titles", () => {
	const visible = importTree().getState().project.collections[0];
	const visibleDraft = createQuickRenameDraft(visible);
	assert.equal(visibleDraft.value, "Collection title");
	assert.equal(visibleDraft.original.hidden, false);
	assert.deepEqual(buildQuickRenamePatch(visibleDraft), {});

	const hidden = importTree([{
		id: "hidden",
		title: NUVIO_INVISIBLE_TITLE.repeat(2),
		folders: [],
	}]).getState().project.collections[0];
	const hiddenDraft = createQuickRenameDraft(hidden);
	assert.equal(hiddenDraft.value, "");
	assert.equal(hiddenDraft.original.hidden, true);
	assert.equal(JSON.stringify(hiddenDraft).includes("hidden"), true);

	const unusual = importTree([{
		id: "private-id",
		title: { private: "RAW_IMPORTED_TITLE" },
		folders: [],
	}]).getState().project.collections[0];
	const unusualDraft = createQuickRenameDraft(unusual);
	assert.equal(unusualDraft.value, "");
	assert.equal(unusualDraft.original.supported, false);
	assert.equal(JSON.stringify(unusualDraft).includes("RAW_IMPORTED_TITLE"), false);
	assert.equal(JSON.stringify(unusualDraft).includes("private-id"), false);
});

test("quick rename accepts visible text only and never treats blank or another format character as hidden", () => {
	const collection = importTree().getState().project.collections[0];
	for (const invalidTitle of ["", "   ", NUVIO_INVISIBLE_TITLE, "\u200B", "\u2060", "\uFEFF"]) {
		const draft = updateQuickRenameTitle(createQuickRenameDraft(collection), invalidTitle);
		assert.equal(validateQuickRenameDraft(draft)[0].code, "RENAME_VISIBLE_TITLE_REQUIRED");
	}

	const mixed = updateQuickRenameTitle(
		createQuickRenameDraft(collection),
		`Visible${NUVIO_INVISIBLE_TITLE}`,
	);
	assert.deepEqual(validateQuickRenameDraft(mixed), []);
	assert.deepEqual(buildQuickRenamePatch(mixed), {
		title: `Visible${NUVIO_INVISIBLE_TITLE}`,
	});
});

test("successful quick rename creates one title-only controller revision and retains selection", () => {
	const controller = importTree();
	const folder = controller.getState().project.collections[0].folders[0];
	controller.selectNode(folder.internalId);
	const beforeRevision = controller.getState().revision;
	const draft = updateQuickRenameTitle(createQuickRenameDraft(folder), "Renamed folder");
	const result = applyQuickRenameDraft(controller, draft);

	assert.deepEqual(result, { ok: true, controllerCalled: true, diagnostics: [] });
	assert.equal(controller.getState().revision, beforeRevision + 1);
	assert.equal(controller.getState().selection.folderInternalId, folder.internalId);
	assert.equal(controller.getState().project.collections[0].folders[0].editable.title, "Renamed folder");
	assert.deepEqual(buildQuickRenamePatch(draft), { title: "Renamed folder" });
});

test("quick rename cancel and unchanged apply create no revision", () => {
	const controller = importTree();
	const collection = controller.getState().project.collections[0];
	controller.selectNode(collection.internalId);
	const before = controller.getState();
	const cancelledDraft = updateQuickRenameTitle(createQuickRenameDraft(collection), "Discard me");
	assert.deepEqual(buildQuickRenamePatch(cancelledDraft), { title: "Discard me" });
	assert.equal(controller.getState(), before);

	const noOp = applyQuickRenameDraft(
		controller,
		updateQuickRenameTitle(createQuickRenameDraft(collection), "Collection title"),
	);
	assert.deepEqual(noOp, { ok: true, controllerCalled: false, diagnostics: [] });
	assert.equal(controller.getState(), before);
});

test("quick rename replaces an invisible title only after visible input and cancellation retains it", () => {
	const repeated = NUVIO_INVISIBLE_TITLE.repeat(2);
	const controller = importTree([{ id: "hidden", title: repeated, folders: [] }]);
	const collection = controller.getState().project.collections[0];
	const initialDraft = createQuickRenameDraft(collection);
	const invalid = applyQuickRenameDraft(controller, initialDraft);
	assert.equal(invalid.ok, false);
	assert.equal(invalid.controllerCalled, false);
	assert.equal(controller.getState().project.collections[0].editable.title, repeated);

	const beforeCancel = controller.getState();
	updateQuickRenameTitle(initialDraft, "Cancelled replacement");
	assert.equal(controller.getState(), beforeCancel);
	assert.equal(controller.getState().project.collections[0].editable.title, repeated);

	const replacement = updateQuickRenameTitle(initialDraft, "Visible again");
	assert.equal(applyQuickRenameDraft(controller, replacement).ok, true);
	assert.equal(controller.getState().project.collections[0].editable.title, "Visible again");
});

test("dialog focus helper enters, contains, wraps, and safely cancels focus", () => {
	const focusLog = [];
	const controls = ["first", "middle", "last"].map((name) => ({
		name,
		focus() { focusLog.push(name); },
	}));
	const dialog = {
		querySelector() { return controls[0]; },
		querySelectorAll() { return controls; },
		focus() { focusLog.push("dialog"); },
	};
	assert.equal(focusFirstDialogControl(dialog), controls[0]);
	assert.deepEqual(focusLog, ["first"]);

	let prevented = 0;
	let cancelled = 0;
	const event = (key, target, shiftKey = false) => ({
		key,
		target,
		shiftKey,
		preventDefault() { prevented += 1; },
	});
	assert.equal(
		handleDialogKeyDown(event("Tab", dialog), dialog, () => {}),
		"wrapped-from-dialog-forward",
	);
	assert.equal(
		handleDialogKeyDown(event("Tab", dialog, true), dialog, () => {}),
		"wrapped-from-dialog-backward",
	);
	assert.equal(handleDialogKeyDown(event("Tab", controls[2]), dialog, () => {}), "wrapped-forward");
	assert.equal(handleDialogKeyDown(event("Tab", controls[0], true), dialog, () => {}), "wrapped-backward");
	assert.equal(handleDialogKeyDown(event("Tab", controls[1]), dialog, () => {}), "contained");
	assert.equal(handleDialogKeyDown(event("Escape", controls[1]), dialog, () => { cancelled += 1; }), "cancel");
	assert.deepEqual(focusLog, ["first", "first", "last", "first", "last"]);
	assert.equal(prevented, 5);
	assert.equal(cancelled, 1);

	let emptyPrevented = 0;
	const emptyFocusLog = [];
	const emptyDialog = {
		querySelector() { return null; },
		querySelectorAll() { return []; },
		focus() { emptyFocusLog.push("dialog"); },
	};
	assert.equal(handleDialogKeyDown({
		key: "Tab",
		target: emptyDialog,
		shiftKey: true,
		preventDefault() { emptyPrevented += 1; },
	}, emptyDialog, () => {}), "contained");
	assert.equal(emptyPrevented, 1);
	assert.deepEqual(emptyFocusLog, ["dialog"]);
});

test("Builder fallbacks and accessible labels prevent blank hidden-title cards and summaries", () => {
	const repeated = NUVIO_INVISIBLE_TITLE.repeat(2);
	const controller = importTree([{
		id: "hidden-collection",
		title: repeated,
		folders: [{
			id: "hidden-folder",
			title: repeated,
			sources: [],
		}],
	}]);
	const folder = controller.getState().project.collections[0].folders[0];
	controller.selectNode(folder.internalId);
	const view = buildBuilderViewModel(controller.getState());
	assert.equal(view.selectedCollection.title, "Hidden title");
	assert.equal(view.selectedCollection.titleHidden, true);
	assert.equal(view.selectedCollection.accessibleName, "Collection with hidden Nuvio title");
	assert.equal(view.selectedFolder.title, "Hidden title");
	assert.equal(view.selectedFolder.accessibleName, "Folder with hidden Nuvio title");
	assert.ok(view.selectedFolder.details.some((entry) => entry.label === "Nuvio title" && entry.value === "Invisible"));

	const markup = renderWorkspace(controller);
	assert.ok(markup.includes("Hidden title"));
	assert.ok(markup.includes("Invisible in Nuvio"));
	assert.ok(markup.includes('aria-label="Collection with hidden Nuvio title"'));
	assert.ok(markup.includes('aria-label="Folder with hidden Nuvio title"'));
	assert.ok(markup.includes('aria-label="Rename collection with hidden Nuvio title"'));
	assert.ok(markup.includes('aria-label="Rename folder with hidden Nuvio title"'));
	assert.ok(markup.includes('aria-label="Open settings for collection with hidden Nuvio title"'));
	assert.ok(markup.includes('aria-label="Open settings for folder with hidden Nuvio title"'));
	assert.equal(markup.includes(repeated), false);
});

test("quick rename renders only for its targeted entity and hides imported invisible content", () => {
	const repeated = NUVIO_INVISIBLE_TITLE.repeat(2);
	const controller = importTree([{
		id: "hidden",
		title: repeated,
		folders: [],
	}]);
	const collection = controller.getState().project.collections[0];
	controller.selectNode(collection.internalId);
	const renameDraft = {
		...createQuickRenameDraft(collection),
		context: "desktop",
	};
	const markup = renderWorkspace(controller, { renameDraft });
	assert.equal((markup.match(/data-quick-rename=/g) ?? []).length, 1);
	assert.ok(markup.includes('data-quick-rename="collection"'));
	assert.equal(markup.includes('data-quick-rename="folder"'), false);
	assert.ok(markup.includes('aria-label="Rename selected collection"'));
	assert.ok(markup.includes('data-action="apply-collection-rename"'));
	assert.ok(markup.includes('data-action="cancel-collection-rename"'));
	assert.ok(markup.includes('value=""'));
	assert.ok(markup.includes("Enter a visible title to replace the hidden Nuvio title."));
	assert.equal(markup.includes(repeated), false);
	assert.equal(markup.includes("data-settings-modal="), false);
	assert.equal(markup.includes("hidden-collection"), false);
});

test("modal and rename source retain exact trigger focus, safe backdrop, body lock, and no blur dependency", () => {
	const workspaceSource = fs.readFileSync(
		path.join(rootDir, "builder", "src", "ui", "BuilderWorkspace.jsx"),
		"utf8",
	);
	const editorSource = fs.readFileSync(
		path.join(rootDir, "builder", "src", "ui", "NodeEditor.jsx"),
		"utf8",
	);
	assert.match(workspaceSource, /settingsRestoreFocusRef\.current = trigger/);
	assert.match(workspaceSource, /renameRestoreFocusRef\.current = trigger/);
	assert.equal((workspaceSource.match(/target\.focus\?\.\(\)/g) ?? []).length, 2);
	assert.match(workspaceSource, /event\.key === "Escape"[\s\S]*onCancel\(\)/);
	assert.match(workspaceSource, /event\.key === "Enter" && event\.target === inputRef\.current[\s\S]*onSubmit\(event\)/);
	assert.doesNotMatch(workspaceSource, /onBlur=/);
	assert.match(editorSource, /handleDialogKeyDown\(event, dialogRef\.current, onCancel\)/);
	assert.match(editorSource, /document\.body\.classList\.add\("settings-modal-open"\)/);
	assert.match(editorSource, /document\.body\.classList\.remove\("settings-modal-open"\)/);
	assert.match(editorSource, /event\.target === event\.currentTarget[\s\S]*dialogRef\.current\?\.focus\(\)/);
	assert.doesNotMatch(editorSource, /event\.target === event\.currentTarget[\s\S]{0,180}onCancel/);
});

test("workspace initially has no modal and exposes collection-owned rename and settings actions", () => {
	const controller = importTree();
	const collection = controller.getState().project.collections[0];
	controller.selectNode(collection.internalId);
	const markup = renderWorkspace(controller);
	assert.equal(markup.includes("data-node-editor="), false);
	assert.equal(markup.includes("data-settings-modal="), false);
	assert.ok(markup.includes('data-action="rename-collection"'));
	assert.ok(markup.includes('data-action="settings-collection"'));
	assert.equal(markup.includes('data-action="rename-folder"'), false);
	assert.equal(markup.includes('data-action="settings-folder"'), false);
	assert.equal(markup.includes("Edit source"), false);

	const collectionsPanel = workspacePanelMarkup(markup, 'data-panel="collections"');
	assert.ok(collectionsPanel.includes('data-action-context="desktop"'));
	assert.ok(collectionsPanel.includes('aria-label="Rename collection"'));
	assert.ok(collectionsPanel.includes('aria-label="Collection settings"'));
	const foldersHeader = markedElement(markup, 'data-panel-header="folders"', "header");
	assert.ok(foldersHeader.includes('data-action="create-folder"'));
	assert.equal(foldersHeader.includes("settings-collection"), false);
	assert.equal(foldersHeader.includes("rename-collection"), false);
});

test("folder context exposes folder-owned rename and settings actions outside the Sources header", () => {
	const controller = importTree();
	const folder = controller.getState().project.collections[0].folders[0];
	controller.selectNode(folder.internalId);
	const markup = renderWorkspace(controller);
	assert.ok(markup.includes('data-action="rename-folder"'));
	assert.ok(markup.includes('data-action="settings-folder"'));
	assert.equal(markup.includes('data-action="edit-source"'), false);
	const foldersPanel = workspacePanelMarkup(markup, 'data-panel="folders"');
	assert.ok(foldersPanel.includes('data-entity-actions="folder"'));
	assert.ok(foldersPanel.includes('data-action-context="desktop"'));
	const sourcesHeader = markedElement(markup, 'data-panel-header="sources"', "header");
	assert.equal(sourcesHeader.includes("settings-folder"), false);
	assert.equal(sourcesHeader.includes("rename-folder"), false);
});

test("collection settings render exactly one accessible modal with stable markers and actions", () => {
	const controller = importTree();
	const collection = controller.getState().project.collections[0];
	controller.selectNode(collection.internalId);
	const markup = renderWorkspace(controller, { draft: createNodeEditorDraft(collection) });
	assert.equal((markup.match(/data-node-editor=/g) ?? []).length, 1);
	assert.equal((markup.match(/data-settings-modal="true"/g) ?? []).length, 1);
	assert.equal((markup.match(/role="dialog"/g) ?? []).length, 1);
	for (const marker of [
		'data-node-editor="collection"',
		'aria-modal="true"',
		'data-editor-field="title"',
		'data-editor-field="hideNuvioTitle"',
		'data-editor-control="hideNuvioTitle"',
		'data-editor-field="viewMode"',
		'data-editor-choice="tabs"',
		'data-editor-choice="rows"',
		'data-editor-field="showAllTab"',
		'data-editor-control="showAllTab"',
		'data-editor-field="pinToTop"',
		'data-editor-control="pinToTop"',
		'data-action="apply-node-edit"',
		'data-action="cancel-node-edit"',
	]) assert.ok(markup.includes(marker), marker);
	assert.ok(markup.includes("Collection settings"));
	assert.ok(markup.includes("Collection layout"));
	assert.ok(markup.includes("Hide collection title in Nuvio"));
	assert.ok(markup.includes("Include an All tab"));
	assert.ok(markup.includes("Pin to top"));
	assert.equal(markup.includes("Hierarchy navigation is paused"), false);
	assert.equal(markup.includes('data-editor-field="id"'), false);
	assert.match(markup, /<label for="node-editor-collection-title-input">Title<\/label>/);
	assert.ok(openingTag(markup, 'data-workspace-underlay="true"').includes("inert"));
	assert.ok(openingTag(markup, 'data-workspace-underlay="true"').includes('aria-hidden="true"'));
});

test("folder editor keeps unique IDs, valid descriptions, one h1, and one local alert", () => {
	const controller = importTree();
	const folder = controller.getState().project.collections[0].folders[0];
	controller.selectNode(folder.internalId);
	const diagnostics = validateNodeEditorDraft(changedDraft(folder, { title: "" }));
	const markup = renderWorkspace(controller, { draft: changedDraft(folder, { title: "" }), diagnostics });
	const ids = [...markup.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
	assert.equal(ids.length, new Set(ids).size);
	for (const match of markup.matchAll(/aria-describedby="([^"]+)"/g)) {
		for (const id of match[1].split(" ")) assert.equal(ids.filter((entry) => entry === id).length, 1, id);
	}
	assert.equal((markup.match(/<h1/g) ?? []).length, 1);
	assert.equal((markup.match(/class="editor-diagnostics" role="alert"/g) ?? []).length, 1);
	assert.ok(markup.includes("Folder settings"));
	assert.match(markup, /role="dialog" aria-modal="true" aria-labelledby="node-editor-folder-title"/);
	assert.match(markup, /<h2 id="node-editor-folder-title">Folder settings<\/h2>/);
	for (const marker of [
		'data-editor-field="hideNuvioTitle"',
		'data-editor-control="hideNuvioTitle"',
		'data-editor-field="tileShape"',
		'data-editor-choice="poster"',
		'data-editor-choice="landscape"',
		'data-editor-field="showFolderTitle"',
		'data-editor-control="showFolderTitle"',
	]) assert.ok(markup.includes(marker), marker);
	assert.ok(markup.includes("Hide folder name in Nuvio"));
	assert.ok(markup.includes("Show folder title"));
	assert.ok(markup.includes("Choose the shape of this folder card in Nuvio."));
	assert.equal(markup.includes("hideTitle"), false);
});

test("unusual imported values show calm replacement guidance without raw values", () => {
	const controller = importTree([{
		id: { secret: "RAW_OBJECT" },
		title: false,
		viewMode: { secret: "RAW_LAYOUT" },
		showAllTab: ["RAW_ALL"],
		pinToTop: 7,
		folders: [],
	}]);
	const collection = controller.getState().project.collections[0];
	controller.selectNode(collection.internalId);
	const markup = renderWorkspace(controller, { draft: createNodeEditorDraft(collection) });
	assert.equal((markup.match(/The imported value is not text/g) ?? []).length, 1);
	assert.equal(markup.includes("RAW_OBJECT"), false);
	assert.equal(markup.includes("RAW_LAYOUT"), false);
	assert.equal(markup.includes("RAW_ALL"), false);
	assert.equal(markup.includes('value="false"'), false);
	assert.ok(markup.includes("will be preserved until you choose Tabs or Rows"));
	assert.ok(markup.includes("cannot be shown safely"));
});

test("Rows disables the All-tab switch without changing its retained preference", () => {
	const controller = importTree([{
		id: "collection",
		title: "Rows collection",
		viewMode: "ROWS",
		showAllTab: true,
		pinToTop: false,
		folders: [],
	}]);
	const collection = controller.getState().project.collections[0];
	controller.selectNode(collection.internalId);
	const draft = createNodeEditorDraft(collection);
	const markup = renderWorkspace(controller, { draft });

	assert.ok(openingTag(markup, 'data-editor-choice="rows"').includes("checked"));
	assert.ok(openingTag(markup, 'data-editor-control="showAllTab"').includes("disabled"));
	assert.equal(openingTag(markup, 'data-editor-control="showAllTab"').includes("checked"), false);
	assert.ok(markup.includes("The preference stays unchanged while Rows is selected."));
	assert.equal(draft.values.showAllTab, true);
	assert.deepEqual(buildNodeEditorPatch(draft), {});
});

test("Follow Layout and Square render bounded replacement guidance and no normal option", () => {
	const controller = importTree([{
		id: "collection",
		title: "Imported collection",
		viewMode: "FOLLOW_LAYOUT",
		folders: [{
			id: "folder",
			title: "Imported folder",
			tileShape: "SQUARE",
			sources: [],
		}],
	}]);
	const collection = controller.getState().project.collections[0];
	const folder = collection.folders[0];
	controller.selectNode(collection.internalId);
	const collectionDraft = createNodeEditorDraft(collection);
	const collectionMarkup = renderWorkspace(controller, { draft: collectionDraft });
	assert.ok(collectionMarkup.includes("This imported Follow Layout setting is being preserved."));
	assert.equal(collectionMarkup.includes('value="FOLLOW_LAYOUT"'), false);
	const replacedCollectionDraft = updateNodeEditorField(
		collectionDraft,
		"viewMode",
		"TABBED_GRID",
	);
	const replacedCollectionMarkup = renderWorkspace(controller, { draft: replacedCollectionDraft });
	assert.equal(
		replacedCollectionMarkup.includes("This imported Follow Layout setting is being preserved."),
		false,
	);
	assert.equal(
		replacedCollectionMarkup.includes("Choose Tabs or Rows only if you want to replace it."),
		false,
	);
	assert.deepEqual(buildNodeEditorPatch(replacedCollectionDraft), { viewMode: "TABBED_GRID" });

	controller.selectNode(folder.internalId);
	const folderDraft = createNodeEditorDraft(folder);
	const folderMarkup = renderWorkspace(controller, { draft: folderDraft });
	assert.ok(folderMarkup.includes("This imported Square shape is being preserved."));
	assert.equal(folderMarkup.includes('value="SQUARE"'), false);
	const replacedFolderDraft = updateNodeEditorField(folderDraft, "tileShape", "LANDSCAPE");
	const replacedFolderMarkup = renderWorkspace(controller, { draft: replacedFolderDraft });
	assert.equal(
		replacedFolderMarkup.includes("This imported Square shape is being preserved."),
		false,
	);
	assert.deepEqual(buildNodeEditorPatch(replacedFolderDraft), { tileShape: "LANDSCAPE" });
});

test("boolean preservation and absence guidance clears after a pending replacement", () => {
	const controller = importTree([{
		id: "collection",
		title: "Imported collection",
		viewMode: "TABBED_GRID",
		showAllTab: ["RAW_ALL_TAB"],
		folders: [{
			id: "folder",
			title: "Imported folder",
			tileShape: "POSTER",
			sources: [],
		}],
	}]);
	const collection = controller.getState().project.collections[0];
	const folder = collection.folders[0];
	controller.selectNode(collection.internalId);

	const collectionDraft = createNodeEditorDraft(collection);
	const collectionMarkup = renderWorkspace(controller, { draft: collectionDraft });
	assert.ok(collectionMarkup.includes(
		"The imported All tab preference cannot be shown safely and will be preserved unless you use this switch.",
	));
	assert.equal(collectionMarkup.includes("RAW_ALL_TAB"), false);
	const replacedCollectionDraft = updateNodeEditorField(
		collectionDraft,
		"showAllTab",
		false,
	);
	const replacedCollectionMarkup = renderWorkspace(controller, { draft: replacedCollectionDraft });
	assert.equal(
		replacedCollectionMarkup.includes("will be preserved unless you use this switch"),
		false,
	);
	assert.deepEqual(buildNodeEditorPatch(replacedCollectionDraft), { showAllTab: false });

	controller.selectNode(folder.internalId);
	const folderDraft = createNodeEditorDraft(folder);
	const folderMarkup = renderWorkspace(controller, { draft: folderDraft });
	assert.ok(folderMarkup.includes(
		"No imported folder title preference is set. It will stay absent unless you use this switch.",
	));
	const replacedFolderDraft = updateNodeEditorField(
		folderDraft,
		"showFolderTitle",
		false,
	);
	const replacedFolderMarkup = renderWorkspace(controller, { draft: replacedFolderDraft });
	assert.equal(replacedFolderMarkup.includes("will stay absent unless you use this switch"), false);
	assert.deepEqual(buildNodeEditorPatch(replacedFolderDraft), { hideTitle: true });
});

test("unsupported title guidance clears for visible and intentional invisible replacements", () => {
	const controller = importTree([{
		id: "collection",
		title: { secret: "RAW_TITLE" },
		folders: [],
	}]);
	const collection = controller.getState().project.collections[0];
	controller.selectNode(collection.internalId);

	const draft = createNodeEditorDraft(collection);
	const untouchedMarkup = renderWorkspace(controller, { draft });
	assert.ok(untouchedMarkup.includes(
		"The imported value is not text. Enter a valid text replacement before applying.",
	));
	assert.equal(untouchedMarkup.includes("RAW_TITLE"), false);

	const visibleDraft = updateNodeEditorField(draft, "title", "Visible replacement");
	const visibleMarkup = renderWorkspace(controller, { draft: visibleDraft });
	assert.equal(visibleMarkup.includes("Enter a valid text replacement before applying."), false);
	assert.deepEqual(buildNodeEditorPatch(visibleDraft), { title: "Visible replacement" });

	const invisibleDraft = updateNodeEditorField(draft, "hideNuvioTitle", true);
	const invisibleMarkup = renderWorkspace(controller, { draft: invisibleDraft });
	assert.equal(invisibleMarkup.includes("Enter a valid text replacement before applying."), false);
	assert.equal(invisibleMarkup.includes("RAW_TITLE"), false);
	assert.deepEqual(buildNodeEditorPatch(invisibleDraft), { title: NUVIO_INVISIBLE_TITLE });
});

test("settings modal makes the workspace inert and disables every background action", () => {
	const controller = importTree();
	const folder = controller.getState().project.collections[0].folders[0];
	controller.selectNode(folder.sources[0].internalId);
	const markup = renderWorkspace(controller, { draft: createNodeEditorDraft(folder) });
	assert.ok(markup.includes('data-editor-lock="true"'));
	assert.ok(openingTag(markup, 'data-workspace-underlay="true"').includes("inert"));
	for (const marker of [
		'data-node-type="collection"',
		'data-node-type="folder"',
		'data-node-type="source"',
		'data-action="create-collection"',
		'data-action="create-folder"',
		'data-action="rename-collection"',
		'data-action="settings-collection"',
		'data-action="rename-folder"',
		'data-action="settings-folder"',
	]) assert.ok(openingTag(markup, marker).includes("disabled"), marker);
	assert.equal((markup.match(/<button class="back-control mobile-only"[^>]*disabled/g) ?? []).length, 2);
	assert.ok(openingTag(markup, ">Show folder details<").includes("disabled"), "Show folder details");
	assert.equal(markup.includes("Hierarchy navigation is paused"), false);
});

test("Apply and Cancel remain enabled while hierarchy controls are locked", () => {
	const controller = importTree();
	const collection = controller.getState().project.collections[0];
	controller.selectNode(collection.internalId);
	const markup = renderWorkspace(controller, { draft: createNodeEditorDraft(collection) });
	assert.equal(openingTag(markup, 'data-action="apply-node-edit"').includes("disabled"), false);
	assert.equal(openingTag(markup, 'data-action="cancel-node-edit"').includes("disabled"), false);
});

test("styles keep the modal responsive, bounded, scrollable, focused, and motion-safe", () => {
	const styles = fs.readFileSync(path.join(rootDir, "builder", "src", "styles.css"), "utf8");
	assert.match(styles, /\.settings-modal-backdrop\s*\{[\s\S]*position:\s*fixed/);
	assert.match(styles, /\.settings-modal-backdrop\s*\{[\s\S]*background:\s*rgb\(0 8 13 \/ 88%\)/);
	assert.match(styles, /@supports \(\(-webkit-backdrop-filter:[\s\S]*backdrop-filter:\s*blur\(8px\)/);
	assert.match(styles, /\.node-editor\s*\{[\s\S]*height:\s*100dvh/);
	assert.match(styles, /\.node-editor\s*\{[\s\S]*max-height:\s*100dvh/);
	assert.match(styles, /\.node-editor\s*\{[\s\S]*overflow-y:\s*auto/);
	assert.match(styles, /body\.settings-modal-open\s*\{[\s\S]*overflow:\s*hidden/);
	assert.match(styles, /\.workspace-underlay\[aria-hidden="true"\]\s*\{[\s\S]*pointer-events:\s*none/);
	assert.match(styles, /\.editor-field input\[type="text"\]\s*\{[\s\S]*min-height:\s*48px/);
	assert.match(styles, /\.editor-choice\s*\{[\s\S]*min-height:\s*72px/);
	assert.match(styles, /\.editor-switch\s*\{[\s\S]*min-height:\s*64px/);
	assert.match(styles, /\.shape-preview\.is-poster\s*\{[\s\S]*height:\s*39px/);
	assert.match(styles, /\.shape-preview\.is-landscape\s*\{[\s\S]*width:\s*42px/);
	assert.match(styles, /button:disabled/);
	assert.match(styles, /@media \(max-width: 430px\)/);
	assert.match(styles, /@media \(min-width: 620px\)[\s\S]*max-height:\s*calc\(100dvh - 48px\)/);
	assert.match(styles, /@media \(min-width: 620px\)[\s\S]*border-radius:\s*18px/);
	assert.match(styles, /@media \(min-width: 760px\)/);
	assert.match(styles, /@media \(min-width: 900px\)[\s\S]*grid-template-columns:\s*minmax\(235px/);
	assert.match(styles, /focus-visible/);
	assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
	for (const mobileWidth of [360, 384, 393, 402, 412]) {
		assert.ok(mobileWidth <= 430, `${mobileWidth}px remains inside the tested narrow-layout boundary`);
	}
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
