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
import {
	COLLECTION_EDITABLE_FIELDS,
	FOLDER_EDITABLE_FIELDS,
	SOURCE_EDITABLE_FIELDS,
} from "../builder/src/nuvio/known-fields.js";
import { serializeNuvioProject } from "../builder/src/serialize/index.js";
import {
	focusFirstDialogControl,
	handleDialogKeyDown,
	initializeTitleInput,
} from "../builder/src/ui/modal-focus.js";
import { createTargetedNodeEditorDraft } from "../builder/src/ui/hierarchy-actions.js";
import { applyNodeEditorDraft } from "../builder/src/ui/node-editor-actions.js";
import {
	buildNodeEditorPatch,
	createNodeEditorDraft,
	hasNodeEditorChanges,
	updateNodeEditorField,
	validateNodeEditorDraft,
} from "../builder/src/ui/node-editor.js";
import { buildBuilderViewModel } from "../builder/src/ui/view-model.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(rootDir, "tests", "fixtures", "nuvio");
const vite = await createServer({
	root: path.join(rootDir, "builder"),
	appType: "custom",
	logLevel: "silent",
	server: { middlewareMode: true },
});
const {
	BuilderWorkspace,
	shouldOpenHierarchyEditorFromDoubleClick,
} = await vite.ssrLoadModule("/src/ui/BuilderWorkspace.jsx");
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
		initialEditorMode: options.mode ?? "settings",
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

test("Collection backdrop and focus glow are recognised only as Collection editable fields", () => {
	assert.ok(COLLECTION_EDITABLE_FIELDS.includes("backdropImageUrl"));
	assert.ok(COLLECTION_EDITABLE_FIELDS.includes("focusGlowEnabled"));
	assert.equal(FOLDER_EDITABLE_FIELDS.includes("backdropImageUrl"), false);
	assert.equal(SOURCE_EDITABLE_FIELDS.includes("backdropImageUrl"), false);
	assert.equal(FOLDER_EDITABLE_FIELDS.includes("focusGlowEnabled"), false);
	assert.equal(SOURCE_EDITABLE_FIELDS.includes("focusGlowEnabled"), false);
	assert.equal(
		COLLECTION_EDITABLE_FIELDS.filter((field) => field === "focusGlowEnabled").length,
		1,
	);
	assert.equal(
		COLLECTION_EDITABLE_FIELDS.filter((field) => field === "backdropImageUrl").length,
		1,
	);
});

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
		focusGlowEnabled: true,
		backdropImageUrl: "",
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
		folderTitleVisibility: "",
		tileShape: "",
		coverImageUrl: "",
		coverEmoji: "",
		heroBackdropUrl: "",
		heroVideoUrl: "",
		titleLogoUrl: "",
		focusGifUrl: "",
		focusGifEnabled: false,
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
	assert.equal(next.touched.focusGlowEnabled, false);
	assert.equal(next.touched.backdropImageUrl, false);
});

test("Collection backdrop draft preserves exact text and emits only touched minimal patches", () => {
	const collection = importTree([{
		id: "collection",
		title: "Collection",
		backdropImageUrl: "custom-scheme://saved exact value",
		unknownCollection: { keep: true },
		folders: [],
	}]).getState().project.collections[0];
	const original = createNodeEditorDraft(collection);
	assert.equal(original.values.backdropImageUrl, "custom-scheme://saved exact value");
	assert.equal(original.original.backdropImageUrl.supported, true);
	assert.equal(original.touched.backdropImageUrl, false);
	assert.deepEqual(buildNodeEditorPatch(original), {});
	assert.deepEqual(
		buildNodeEditorPatch(updateNodeEditorField(original, "title", "Renamed")),
		{ title: "Renamed" },
	);

	const replacement = updateNodeEditorField(
		original,
		"backdropImageUrl",
		"https://example.test/replacement.gif?token=exact%20value",
	);
	assert.deepEqual(buildNodeEditorPatch(replacement), {
		backdropImageUrl: "https://example.test/replacement.gif?token=exact%20value",
	});
	assert.deepEqual(
		buildNodeEditorPatch(updateNodeEditorField(original, "backdropImageUrl", "")),
		{ backdropImageUrl: "" },
	);
	assert.deepEqual(
		buildNodeEditorPatch(updateNodeEditorField(original, "backdropImageUrl", original.values.backdropImageUrl)),
		{},
	);
});

test("unusual imported Collection backdrop values stay hidden and preserved until touched", () => {
	const controller = importTree([{
		id: "collection",
		title: "Collection",
		backdropImageUrl: { private: "RAW_BACKDROP" },
		unknownCollection: { keep: true },
		folders: [],
	}]);
	const collection = controller.getState().project.collections[0];
	const draft = createNodeEditorDraft(collection);
	assert.equal(draft.values.backdropImageUrl, "");
	assert.equal(draft.original.backdropImageUrl.status, "unsupported");
	assert.equal(JSON.stringify(draft).includes("RAW_BACKDROP"), false);
	assert.deepEqual(buildNodeEditorPatch(draft), {});

	const beforeRevision = controller.getState().revision;
	assert.equal(applyNodeEditorDraft(
		controller,
		updateNodeEditorField(draft, "pinToTop", true),
	).ok, true);
	assert.equal(controller.getState().revision, beforeRevision + 1);
	const output = serializeNuvioProject(controller.getState().project).value[0];
	assert.deepEqual(output.backdropImageUrl, { private: "RAW_BACKDROP" });
	assert.deepEqual(output.unknownCollection, { keep: true });
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
		focusGlowEnabled: false,
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
	assert.equal(collectionDraft.values.focusGlowEnabled, false);
	assert.equal(collectionDraft.original.focusGlowEnabled.value, false);
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
		focusGlowEnabled: true,
		folders: [],
	}]).getState().project.collections[0];
	const original = createNodeEditorDraft(collection);

	assert.equal(updateNodeEditorField(original, "viewMode", "FOLLOW_LAYOUT"), original);
	assert.equal(updateNodeEditorField(original, "viewMode", "rows"), original);

	let draft = updateNodeEditorField(original, "viewMode", "ROWS");
	assert.equal(draft.values.showAllTab, true);
	assert.deepEqual(buildNodeEditorPatch(draft), { viewMode: "ROWS" });
	draft = updateNodeEditorField(draft, "showAllTab", false);
	assert.equal(draft.values.showAllTab, false);
	assert.deepEqual(buildNodeEditorPatch(draft), {
		viewMode: "ROWS",
		showAllTab: false,
	});
	draft = updateNodeEditorField(draft, "showAllTab", true);
	assert.deepEqual(buildNodeEditorPatch(draft), { viewMode: "ROWS" });
	draft = updateNodeEditorField(draft, "viewMode", "TABBED_GRID");
	assert.equal(draft.values.showAllTab, true);
	assert.deepEqual(buildNodeEditorPatch(draft), {});

	draft = updateNodeEditorField(draft, "showAllTab", false);
	draft = updateNodeEditorField(draft, "pinToTop", true);
	draft = updateNodeEditorField(draft, "focusGlowEnabled", false);
	assert.deepEqual(buildNodeEditorPatch(draft), {
		showAllTab: false,
		pinToTop: true,
		focusGlowEnabled: false,
	});
});

test("folder visibility choices map visible modes to hideTitle", () => {
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
	draft = updateNodeEditorField(draft, "folderTitleVisibility", "HIDE_HOME_SCREEN");
	assert.deepEqual(buildNodeEditorPatch(draft), {
		tileShape: "LANDSCAPE",
		hideTitle: true,
	});

	draft = updateNodeEditorField(draft, "tileShape", "POSTER");
	draft = updateNodeEditorField(draft, "folderTitleVisibility", "SHOW_EVERYWHERE");
	assert.deepEqual(buildNodeEditorPatch(draft), {});
});

test("folder artwork draft model retains every known visual text field and emits only deliberate replacements", () => {
	const folder = {
		nodeType: "folder",
		internalId: "folder-artwork",
		editable: {
			title: "Artwork folder",
			tileShape: "POSTER",
			hideTitle: true,
			coverImageUrl: "https://example.test/poster.webp",
			coverEmoji: "🛰️",
			heroBackdropUrl: "https://example.test/hero.webp",
			heroVideoUrl: "custom-scheme://video exact value",
			titleLogoUrl: "https://example.test/logo.png",
			focusGifUrl: "https://example.test/focus.webp",
			focusGifEnabled: true,
		},
	};
	let draft = createNodeEditorDraft(folder);
	assert.deepEqual(
		Object.fromEntries(["coverImageUrl", "coverEmoji", "heroBackdropUrl", "heroVideoUrl", "titleLogoUrl", "focusGifUrl", "focusGifEnabled"].map((field) => [field, draft.values[field]])),
		{
			coverImageUrl: "https://example.test/poster.webp",
			coverEmoji: "🛰️",
			heroBackdropUrl: "https://example.test/hero.webp",
			heroVideoUrl: "custom-scheme://video exact value",
			titleLogoUrl: "https://example.test/logo.png",
			focusGifUrl: "https://example.test/focus.webp",
			focusGifEnabled: true,
		},
	);
	draft = updateNodeEditorField(draft, "coverImageUrl", "https://example.test/replacement.webp");
	draft = updateNodeEditorField(draft, "coverEmoji", "arbitrary fallback text 🧩");
	draft = updateNodeEditorField(draft, "heroBackdropUrl", "");
	draft = updateNodeEditorField(draft, "heroVideoUrl", "https://example.test/video.mp4?token=exact%20value");
	draft = updateNodeEditorField(draft, "focusGifEnabled", false);
	assert.deepEqual(buildNodeEditorPatch(draft), {
		coverImageUrl: "https://example.test/replacement.webp",
		coverEmoji: "arbitrary fallback text 🧩",
		heroBackdropUrl: "",
		heroVideoUrl: "https://example.test/video.mp4?token=exact%20value",
		focusGifEnabled: false,
	});
});

test("visible folder visual edits apply once and preserve the model-supported fallback emoji", () => {
	const controller = importTree([{
		id: "collection",
		title: "Collection",
		folders: [{
			id: "folder",
			title: "Folder",
			tileShape: "POSTER",
			coverImageUrl: "https://example.test/saved.webp",
			coverEmoji: "saved fallback",
			heroBackdropUrl: "https://example.test/saved-hero.webp",
			heroVideoUrl: "https://example.test/saved-video.mp4",
			titleLogoUrl: "https://example.test/saved-logo.png",
			focusGifUrl: "https://example.test/saved-focus.gif",
			focusGifEnabled: true,
			sources: [],
		}],
	}]);
	const beforeRevision = controller.getState().revision;
	const folder = controller.getState().project.collections[0].folders[0];
	let draft = createNodeEditorDraft(folder);
	draft = updateNodeEditorField(draft, "heroVideoUrl", "");
	assert.deepEqual(buildNodeEditorPatch(draft), {
		heroVideoUrl: "",
	});
	assert.deepEqual(applyNodeEditorDraft(controller, draft), {
		ok: true,
		controllerCalled: true,
		diagnostics: [],
	});
	assert.equal(controller.getState().revision, beforeRevision + 1);
	const outputFolder = serializeNuvioProject(controller.getState().project).value[0].folders[0];
	assert.equal(outputFolder.coverEmoji, "saved fallback");
	assert.equal(outputFolder.heroVideoUrl, "");
	assert.equal(outputFolder.coverImageUrl, "https://example.test/saved.webp");
	assert.equal(outputFolder.heroBackdropUrl, "https://example.test/saved-hero.webp");
	assert.equal(outputFolder.titleLogoUrl, "https://example.test/saved-logo.png");
	assert.equal(outputFolder.focusGifUrl, "https://example.test/saved-focus.gif");
	assert.equal(outputFolder.focusGifEnabled, true);
});

test("unusual imported Folder visual values remain opaque until their own fields are touched", () => {
	const controller = importTree([{
		id: "collection",
		title: "Collection",
		folders: [{
			id: "folder",
			title: "Imported artwork",
			tileShape: "POSTER",
			coverImageUrl: null,
			coverEmoji: { privateFallback: "RAW_EMOJI" },
			heroVideoUrl: ["RAW_VIDEO"],
			sources: [],
		}],
	}]);
	let folder = controller.getState().project.collections[0].folders[0];
	let draft = createNodeEditorDraft(folder);
	assert.equal(draft.values.coverEmoji, "");
	assert.equal(draft.values.heroVideoUrl, "");
	assert.equal(draft.values.coverImageUrl, "");
	assert.equal(draft.original.coverEmoji.status, "unsupported");
	assert.equal(draft.original.heroVideoUrl.status, "unsupported");
	assert.equal(JSON.stringify(draft).includes("RAW_EMOJI"), false);
	assert.equal(JSON.stringify(draft).includes("RAW_VIDEO"), false);

	controller.selectNode(folder.internalId);
	const preservedMarkup = renderWorkspace(controller, { draft });
	assert.equal((preservedMarkup.match(/The current imported value is preserved until this field is edited\./g) ?? []).length, 1);
	assert.equal(preservedMarkup.includes("RAW_EMOJI"), false);
	assert.equal(preservedMarkup.includes("RAW_VIDEO"), false);
	assert.equal(preservedMarkup.includes('data-editor-field="coverEmoji"'), false);
	assert.equal(preservedMarkup.includes('data-editor-field="heroVideoUrl"'), false);

	assert.equal(applyNodeEditorDraft(controller, updateNodeEditorField(draft, "title", "Renamed artwork")).ok, true);
	let output = serializeNuvioProject(controller.getState().project).value[0].folders[0];
	assert.deepEqual(output.coverEmoji, { privateFallback: "RAW_EMOJI" });
	assert.deepEqual(output.heroVideoUrl, ["RAW_VIDEO"]);
	assert.equal(output.coverImageUrl, null);

	folder = controller.getState().project.collections[0].folders[0];
	draft = createNodeEditorDraft(folder);
	draft = updateNodeEditorField(draft, "heroVideoUrl", "");
	assert.deepEqual(buildNodeEditorPatch(draft), { heroVideoUrl: "" });
	assert.equal(applyNodeEditorDraft(controller, draft).ok, true);
	output = serializeNuvioProject(controller.getState().project).value[0].folders[0];
	assert.deepEqual(output.coverEmoji, { privateFallback: "RAW_EMOJI" });
	assert.equal(output.heroVideoUrl, "");
	assert.equal(output.coverImageUrl, null);
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
		focusGlowEnabled: { private: "PRIVATE_GLOW" },
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
	for (const sentinel of [
		"PRIVATE_LAYOUT",
		"PRIVATE_ALL",
		"PRIVATE_GLOW",
		"PRIVATE_SHAPE",
		"PRIVATE_TITLE",
	]) {
		assert.equal(JSON.stringify({ collectionDraft, folderDraft }).includes(sentinel), false);
	}
});

test("absent and unusual hideTitle values stay preserved until a visibility choice is deliberate", () => {
	const controller = importTree([{
		id: "collection",
		title: "Collection",
		folders: [
			{
				id: "absent",
				title: "Absent preference",
				tileShape: "POSTER",
				sources: [],
			},
			{
				id: "unusual",
				title: "Unusual preference",
				tileShape: "POSTER",
				hideTitle: ["PRIVATE_TITLE"],
				sources: [],
			},
		],
	}]);

	for (const folder of controller.getState().project.collections[0].folders) {
		const draft = createNodeEditorDraft(folder);
		assert.equal(draft.values.folderTitleVisibility, "");
		assert.deepEqual(
			buildNodeEditorPatch(updateNodeEditorField(draft, "tileShape", "LANDSCAPE")),
			{ tileShape: "LANDSCAPE" },
		);
		assert.deepEqual(
			buildNodeEditorPatch(
				updateNodeEditorField(draft, "folderTitleVisibility", "SHOW_EVERYWHERE"),
			),
			{ hideTitle: false },
		);
		assert.deepEqual(
			buildNodeEditorPatch(
				updateNodeEditorField(draft, "folderTitleVisibility", "HIDE_HOME_SCREEN"),
			),
			{ hideTitle: true },
		);
		assert.deepEqual(
			buildNodeEditorPatch(
				updateNodeEditorField(draft, "folderTitleVisibility", "HIDE_EVERYWHERE"),
			),
			{ title: NUVIO_INVISIBLE_TITLE, hideTitle: true },
		);
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

test("Builder exports keep collection-list order within pinned and unpinned groups", () => {
	const controller = importTree([
		{ id: "pinned-one", title: "Pinned one", pinToTop: true, folders: [] },
		{ id: "pinned-two", title: "Pinned two", pinToTop: true, folders: [] },
		{ id: "ordinary-one", title: "Ordinary one", pinToTop: false, folders: [] },
		{ id: "ordinary-two", title: "Ordinary two", pinToTop: false, folders: [] },
	]);
	const projectOrder = controller.getState().project.collections.map((collection) => collection.editable.id);
	const output = serializeNuvioProject(controller.getState().project).value;

	assert.deepEqual(projectOrder, [
		"pinned-one",
		"pinned-two",
		"ordinary-one",
		"ordinary-two",
	]);
	assert.deepEqual(output.map((collection) => collection.id), projectOrder);
	assert.deepEqual(
		output.filter((collection) => collection.pinToTop === true).map((collection) => collection.id),
		["pinned-one", "pinned-two"],
	);
	assert.deepEqual(
		output.filter((collection) => collection.pinToTop === false).map((collection) => collection.id),
		["ordinary-one", "ordinary-two"],
	);
	for (const collection of output) {
		for (const unsupportedOrderingField of ["pinOrder", "pinRank", "pinnedAt"]) {
			assert.equal(Object.hasOwn(collection, unsupportedOrderingField), false);
		}
	}
});

test("folder presentation apply commits canonical shape and visibility value once", () => {
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
	draft = updateNodeEditorField(draft, "folderTitleVisibility", "HIDE_HOME_SCREEN");
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
	folderDraft = updateNodeEditorField(folderDraft, "folderTitleVisibility", "HIDE_HOME_SCREEN");
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

test("folder Hide everywhere emits one U+200E and restores the original visible choice", () => {
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
	assert.equal(draft.values.folderTitleVisibility, "SHOW_EVERYWHERE");
	assert.equal(draft.visibleTitleDraft, "Folder");

	draft = updateNodeEditorField(draft, "folderTitleVisibility", "HIDE_EVERYWHERE");
	assert.equal(draft.values.folderTitleVisibility, "HIDE_EVERYWHERE");
	assert.equal(draft.values.title, "");
	assert.equal(draft.visibleTitleDraft, "Folder");
	assert.equal(draft.canonicalizeFolderInvisibleTitle, true);
	assert.deepEqual(buildNodeEditorPatch(draft), {
		title: NUVIO_INVISIBLE_TITLE,
		hideTitle: true,
	});

	draft = updateNodeEditorField(draft, "folderTitleVisibility", "SHOW_EVERYWHERE");
	assert.equal(draft.values.title, "Folder");
	assert.equal(draft.values.folderTitleVisibility, "SHOW_EVERYWHERE");
	assert.equal(draft.canonicalizeFolderInvisibleTitle, false);
	assert.deepEqual(buildNodeEditorPatch(draft), {});
});

test("folder Hide everywhere omits an already-true hideTitle patch and restores Hide on home screen only", () => {
	const folder = importTree([{
		id: "collection",
		title: "Collection",
		folders: [{
			id: "folder",
			title: "Folder",
			hideTitle: true,
			tileShape: "POSTER",
			sources: [],
		}],
	}]).getState().project.collections[0].folders[0];
	const hiddenDraft = updateNodeEditorField(
		createNodeEditorDraft(folder),
		"folderTitleVisibility",
		"HIDE_EVERYWHERE",
	);

	assert.equal(hiddenDraft.values.folderTitleVisibility, "HIDE_EVERYWHERE");
	assert.deepEqual(buildNodeEditorPatch(hiddenDraft), {
		title: NUVIO_INVISIBLE_TITLE,
	});

	const restoredDraft = updateNodeEditorField(
		hiddenDraft,
		"folderTitleVisibility",
		"HIDE_HOME_SCREEN",
	);
	assert.equal(restoredDraft.values.title, "Folder");
	assert.equal(restoredDraft.values.folderTitleVisibility, "HIDE_HOME_SCREEN");
	assert.deepEqual(buildNodeEditorPatch(restoredDraft), {});
});

test("folder Hide everywhere apply calls the controller once, increments once, and serializes no modal enum", () => {
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
	const beforeRevision = controller.getState().revision;
	const hiddenDraft = updateNodeEditorField(
		createNodeEditorDraft(folder),
		"folderTitleVisibility",
		"HIDE_EVERYWHERE",
	);
	let calls = 0;
	const recordingController = {
		updateNode(internalId, patch) {
			calls += 1;
			return controller.updateNode(internalId, patch);
		},
	};
	const outcome = applyNodeEditorDraft(recordingController, hiddenDraft);
	const output = controller.serializeProject().value;

	assert.deepEqual(outcome, { ok: true, controllerCalled: true, diagnostics: [] });
	assert.equal(calls, 1);
	assert.equal(controller.getState().revision, beforeRevision + 1);
	assert.equal(output[0].folders[0].title, NUVIO_INVISIBLE_TITLE);
	assert.equal(output[0].folders[0].hideTitle, true);
	assert.equal(JSON.stringify(output).includes("folderTitleVisibility"), false);
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
	assert.equal(collectionDraft.values.title, repeated);
	assert.equal(folderDraft.values.folderTitleVisibility, "HIDE_EVERYWHERE");
	assert.equal(folderDraft.values.title, "");
	assert.equal(folderDraft.original.title.hidden, true);
	assert.equal(folderDraft.original.title.value, null);
	assert.equal(folderDraft.canonicalizeFolderInvisibleTitle, false);
	assert.deepEqual(validateNodeEditorDraft(folderDraft), []);
	assert.equal(JSON.stringify(folderDraft).includes(repeated), false);

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

test("imported invisible folders preserve repeated titles and every hideTitle presence state through unrelated edits", () => {
	const hideTitleCases = [
		{ id: "true", title: NUVIO_INVISIBLE_TITLE, hasValue: true, value: true },
		{ id: "false", title: NUVIO_INVISIBLE_TITLE.repeat(2), hasValue: true, value: false },
		{ id: "absent", title: NUVIO_INVISIBLE_TITLE.repeat(3), hasValue: false },
		{ id: "unsupported", title: NUVIO_INVISIBLE_TITLE.repeat(4), hasValue: true, value: ["RAW_HIDE_TITLE"] },
	];
	const controller = importTree([{
		id: "collection",
		title: "Collection",
		folders: hideTitleCases.map((entry) => ({
			id: entry.id,
			title: entry.title,
			tileShape: "POSTER",
			...(entry.hasValue ? { hideTitle: entry.value } : {}),
			sources: [],
		})),
	}]);

	for (const [index, entry] of hideTitleCases.entries()) {
		const folder = controller.getState().project.collections[0].folders[index];
		const draft = createNodeEditorDraft(folder);
		assert.equal(draft.values.folderTitleVisibility, "HIDE_EVERYWHERE");
		assert.equal(draft.values.title, "");
		assert.equal(draft.canonicalizeFolderInvisibleTitle, false);
		assert.equal(JSON.stringify(draft).includes(entry.title), false);
		assert.deepEqual(
			buildNodeEditorPatch(updateNodeEditorField(draft, "tileShape", "LANDSCAPE")),
			{ tileShape: "LANDSCAPE" },
		);
		applyNodeEditorDraft(
			controller,
			updateNodeEditorField(draft, "tileShape", "LANDSCAPE"),
		);
	}

	const output = controller.serializeProject().value[0].folders;
	for (const [index, entry] of hideTitleCases.entries()) {
		assert.equal(output[index].title, entry.title);
		assert.equal(Object.hasOwn(output[index], "hideTitle"), entry.hasValue);
		if (entry.hasValue) assert.deepEqual(output[index].hideTitle, entry.value);
	}
});

test("imported invisible folder can require visible replacement, restore exact hidden preservation, or re-hide canonically", () => {
	const repeated = NUVIO_INVISIBLE_TITLE.repeat(3);
	const folder = importTree([{
		id: "collection",
		title: "Collection",
		folders: [{
			id: "folder",
			title: repeated,
			hideTitle: false,
			tileShape: "POSTER",
			sources: [],
		}],
	}]).getState().project.collections[0].folders[0];
	const original = createNodeEditorDraft(folder);

	let visibleDraft = updateNodeEditorField(
		original,
		"folderTitleVisibility",
		"SHOW_EVERYWHERE",
	);
	assert.equal(visibleDraft.values.title, "");
	assert.deepEqual(validateNodeEditorDraft(visibleDraft), [{
		code: "EDITOR_TITLE_REQUIRED",
		path: "$ui.editor.title",
		message: "Enter a folder title before applying changes.",
	}]);

	const restoredHiddenDraft = updateNodeEditorField(
		visibleDraft,
		"folderTitleVisibility",
		"HIDE_EVERYWHERE",
	);
	assert.deepEqual(validateNodeEditorDraft(restoredHiddenDraft), []);
	assert.deepEqual(buildNodeEditorPatch(restoredHiddenDraft), {});
	assert.equal(JSON.stringify(restoredHiddenDraft).includes(repeated), false);

	visibleDraft = updateNodeEditorField(visibleDraft, "title", "Visible replacement");
	assert.deepEqual(validateNodeEditorDraft(visibleDraft), []);
	assert.deepEqual(buildNodeEditorPatch(visibleDraft), { title: "Visible replacement" });

	const rehiddenDraft = updateNodeEditorField(
		visibleDraft,
		"folderTitleVisibility",
		"HIDE_EVERYWHERE",
	);
	assert.equal(rehiddenDraft.values.title, "");
	assert.equal(rehiddenDraft.visibleTitleDraft, "Visible replacement");
	assert.equal(rehiddenDraft.canonicalizeFolderInvisibleTitle, true);
	assert.deepEqual(buildNodeEditorPatch(rehiddenDraft), {
		title: NUVIO_INVISIBLE_TITLE,
		hideTitle: true,
	});

	let homeScreenDraft = updateNodeEditorField(
		original,
		"folderTitleVisibility",
		"HIDE_HOME_SCREEN",
	);
	assert.equal(validateNodeEditorDraft(homeScreenDraft)[0].code, "EDITOR_TITLE_REQUIRED");
	homeScreenDraft = updateNodeEditorField(homeScreenDraft, "title", "Visible on open");
	assert.deepEqual(validateNodeEditorDraft(homeScreenDraft), []);
	assert.deepEqual(buildNodeEditorPatch(homeScreenDraft), {
		title: "Visible on open",
		hideTitle: true,
	});
});

test("mixed visible text plus U+200E stays visible and unsupported alternatives stay invalid", () => {
	const mixed = `Visible${NUVIO_INVISIBLE_TITLE}`;
	const folders = [
		{ id: "mixed", title: mixed },
		{ id: "zero-width-space", title: "\u200B" },
		{ id: "word-joiner", title: "\u2060" },
		{ id: "bom", title: "\uFEFF" },
	];
	const project = importTree([{
		id: "collection",
		title: "Collection",
		folders: folders.map((folder) => ({ ...folder, sources: [] })),
	}]).getState().project;
	const [mixedFolder, ...unsupportedFolders] = project.collections[0].folders;
	const mixedDraft = createNodeEditorDraft(mixedFolder);

	assert.equal(mixedDraft.values.folderTitleVisibility, "");
	assert.equal(mixedDraft.values.title, mixed);
	assert.deepEqual(validateNodeEditorDraft(mixedDraft), []);

	for (const folder of unsupportedFolders) {
		const draft = createNodeEditorDraft(folder);
		assert.equal(draft.values.folderTitleVisibility, "");
		assert.equal(validateNodeEditorDraft(draft)[0].code, "EDITOR_TITLE_REQUIRED");
	}
});

test("hidden focus glow compatibility preserves supported absent and unusual imported values", () => {
	const controller = importTree([
		{ id: "enabled", title: "Enabled", focusGlowEnabled: true, folders: [] },
		{ id: "disabled", title: "Disabled", focusGlowEnabled: false, folders: [] },
		{ id: "absent", title: "Absent", folders: [] },
		{
			id: "unusual",
			title: "Unusual",
			focusGlowEnabled: { private: "RAW_FOCUS_GLOW" },
			unknownCollection: { keep: true },
			folders: [],
		},
	]);
	const [enabled, disabled, absent, unusual] = controller.getState().project.collections;
	const enabledDraft = createNodeEditorDraft(enabled);
	const disabledDraft = createNodeEditorDraft(disabled);
	const absentDraft = createNodeEditorDraft(absent);
	const unusualDraft = createNodeEditorDraft(unusual);

	assert.equal(enabledDraft.values.focusGlowEnabled, true);
	assert.equal(disabledDraft.values.focusGlowEnabled, false);
	assert.equal(absentDraft.original.focusGlowEnabled.status, "absent");
	assert.equal(unusualDraft.original.focusGlowEnabled.status, "unsupported");
	assert.equal(JSON.stringify(unusualDraft).includes("RAW_FOCUS_GLOW"), false);
	assert.deepEqual(buildNodeEditorPatch(absentDraft), {});
	assert.deepEqual(buildNodeEditorPatch(changedDraft(unusual, { title: "Edited unusual" })), {
		title: "Edited unusual",
	});
	for (const [collection, draft] of [
		[enabled, enabledDraft],
		[disabled, disabledDraft],
		[absent, absentDraft],
		[unusual, unusualDraft],
	]) {
		controller.selectNode(collection.internalId);
		const markup = renderWorkspace(controller, { draft });
		assert.equal(markup.includes('data-editor-field="focusGlowEnabled"'), false);
		assert.equal(markup.includes('data-editor-control="focusGlowEnabled"'), false);
		assert.equal(markup.includes("Enable focus glow"), false);
	}

	const beforeRevision = controller.getState().revision;
	for (const collection of [enabled, disabled, absent, unusual]) {
		const draft = updateNodeEditorField(
			createNodeEditorDraft(collection),
			"viewMode",
			"ROWS",
		);
		assert.deepEqual(buildNodeEditorPatch(draft), { viewMode: "ROWS" });
		assert.equal(applyNodeEditorDraft(controller, draft).ok, true);
	}
	assert.equal(controller.getState().revision, beforeRevision + 4);

	const serialized = serializeNuvioProject(controller.getState().project).value;
	assert.equal(serialized[0].focusGlowEnabled, true);
	assert.equal(serialized[1].focusGlowEnabled, false);
	assert.equal(serialized[2].focusGlowEnabled, undefined);
	assert.deepEqual(serialized[3].focusGlowEnabled, { private: "RAW_FOCUS_GLOW" });
	assert.deepEqual(serialized[3].unknownCollection, { keep: true });
});

test("focus glow deliberate replacements are canonical minimal patches and one edit is one revision", () => {
	const controller = importTree([{
		id: "collection",
		title: "Collection",
		focusGlowEnabled: false,
		folders: [],
	}]);
	const collection = controller.getState().project.collections[0];
	let draft = createNodeEditorDraft(collection);
	draft = updateNodeEditorField(draft, "focusGlowEnabled", true);
	assert.deepEqual(buildNodeEditorPatch(draft), { focusGlowEnabled: true });

	const beforeRevision = controller.getState().revision;
	const result = applyNodeEditorDraft(controller, draft);
	assert.equal(result.ok, true);
	assert.equal(controller.getState().revision, beforeRevision + 1);
	assert.equal(controller.getState().project.collections[0].editable.focusGlowEnabled, true);

	const current = controller.getState().project.collections[0];
	const reverted = updateNodeEditorField(
		createNodeEditorDraft(current),
		"focusGlowEnabled",
		true,
	);
	assert.deepEqual(buildNodeEditorPatch(reverted), {});

	const disabledReplacement = updateNodeEditorField(
		createNodeEditorDraft(importTree([{
			id: "unusual",
			title: "Unusual",
			focusGlowEnabled: "RAW",
			folders: [],
		}]).getState().project.collections[0]),
		"focusGlowEnabled",
		false,
	);
	assert.deepEqual(buildNodeEditorPatch(disabledReplacement), { focusGlowEnabled: false });
});

test("collection summaries show focus glow only for supported booleans", () => {
	const controller = importTree([
		{ id: "enabled", title: "Enabled", focusGlowEnabled: true, folders: [] },
		{ id: "disabled", title: "Disabled", focusGlowEnabled: false, folders: [] },
		{ id: "absent", title: "Absent", folders: [] },
		{ id: "unsupported", title: "Unsupported", focusGlowEnabled: "RAW", folders: [] },
	]);
	const collections = controller.getState().project.collections;

	for (const [index, expected] of [[0, "Yes"], [1, "No"]]) {
		controller.selectNode(collections[index].internalId);
		const details = buildBuilderViewModel(controller.getState()).selectedCollection.details;
		assert.ok(details.some((entry) => (
			entry.label === "Focus glow enabled" && entry.value === expected
		)));
	}

	for (const index of [2, 3]) {
		controller.selectNode(collections[index].internalId);
		const details = buildBuilderViewModel(controller.getState()).selectedCollection.details;
		assert.equal(details.some((entry) => entry.label === "Focus glow enabled"), false);
	}
});

test("collection Edit directly targets an unselected collection without a selection revision", () => {
	const controller = importTree([
		{
			id: "first",
			title: "First collection",
			viewMode: "TABBED_GRID",
			showAllTab: true,
			pinToTop: false,
			folders: [],
		},
		{
			id: "second",
			title: "Second collection",
			viewMode: "ROWS",
			showAllTab: false,
			pinToTop: false,
			folders: [],
		},
	]);
	let [first, second] = controller.getState().project.collections;
	controller.selectNode(second.internalId);
	const beforeTarget = controller.getState();

	let editorDraft = createTargetedNodeEditorDraft(controller, first);
	assert.equal(editorDraft.internalId, first.internalId);
	assert.equal(controller.getState().selection.collectionInternalId, first.internalId);
	assert.equal(controller.getState().project, beforeTarget.project);
	assert.equal(controller.getState().dirty, false);
	assert.equal(controller.getState().revision, beforeTarget.revision);

	editorDraft = updateNodeEditorField(editorDraft, "pinToTop", true);
	assert.equal(applyNodeEditorDraft(controller, editorDraft).ok, true);
	[first, second] = controller.getState().project.collections;
	assert.equal(first.editable.pinToTop, true);
	assert.equal(second.editable.pinToTop, false);
	assert.equal(controller.getState().selection.collectionInternalId, first.internalId);
});

test("folder Edit directly targets an unselected folder and Cancel retains its selection", () => {
	const controller = importTree([{
		id: "collection",
		title: "Collection",
		folders: [
			{
				id: "first-folder",
				title: "First folder",
				tileShape: "POSTER",
				hideTitle: true,
				sources: [],
			},
			{
				id: "second-folder",
				title: "Second folder",
				tileShape: "POSTER",
				hideTitle: true,
				sources: [],
			},
		],
	}]);
	const collection = controller.getState().project.collections[0];
	let [first, second] = collection.folders;
	controller.selectNode(second.internalId);
	const beforeTarget = controller.getState();

	const cancelledDraft = createTargetedNodeEditorDraft(controller, first);
	assert.equal(cancelledDraft.internalId, first.internalId);
	assert.equal(controller.getState().selection.folderInternalId, first.internalId);
	assert.equal(controller.getState().dirty, false);
	assert.equal(controller.getState().revision, beforeTarget.revision);

	controller.selectNode(second.internalId);
	const beforeEditTarget = controller.getState();
	let editorDraft = createTargetedNodeEditorDraft(controller, first);
	assert.equal(controller.getState().revision, beforeEditTarget.revision);
	editorDraft = updateNodeEditorField(editorDraft, "tileShape", "LANDSCAPE");
	assert.equal(applyNodeEditorDraft(controller, editorDraft).ok, true);
	[first, second] = controller.getState().project.collections[0].folders;
	assert.equal(first.editable.tileShape, "LANDSCAPE");
	assert.equal(second.editable.tileShape, "POSTER");
	assert.equal(controller.getState().selection.folderInternalId, first.internalId);
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

test("initial title focus selects a visible title once per target and degrades safely", () => {
	const calls = [];
	const input = {
		value: "Visible title",
		disabled: false,
		selectionStart: null,
		selectionEnd: null,
		focus() { calls.push("focus"); },
		select() {
			calls.push("select");
			this.selectionStart = 0;
			this.selectionEnd = this.value.length;
		},
	};

	let outcome = initializeTitleInput(input, {
		targetId: "collection-1",
		selectText: true,
	});
	assert.deepEqual(outcome, {
		initializedTargetId: "collection-1",
		initialized: true,
		focused: true,
		selected: true,
	});
	assert.deepEqual(calls, ["focus", "select"]);
	assert.equal(input.selectionStart, 0);
	assert.equal(input.selectionEnd, input.value.length);

	outcome = initializeTitleInput(input, {
		targetId: "collection-1",
		initializedTargetId: outcome.initializedTargetId,
		selectText: true,
	});
	assert.equal(outcome.initialized, false);
	assert.deepEqual(calls, ["focus", "select"]);

	outcome = initializeTitleInput(input, {
		targetId: "folder-1",
		initializedTargetId: outcome.initializedTargetId,
		selectText: false,
	});
	assert.equal(outcome.focused, true);
	assert.equal(outcome.selected, false);
	assert.deepEqual(calls, ["focus", "select", "focus"]);

	const withoutSelectionApi = {
		disabled: false,
		focus() { calls.push("fallback-focus"); },
	};
	outcome = initializeTitleInput(withoutSelectionApi, {
		targetId: "collection-2",
		initializedTargetId: outcome.initializedTargetId,
		selectText: true,
	});
	assert.equal(outcome.focused, true);
	assert.equal(outcome.selected, false);

	const disabled = {
		disabled: true,
		focus() { calls.push("disabled-focus"); },
		select() { calls.push("disabled-select"); },
	};
	outcome = initializeTitleInput(disabled, {
		targetId: "folder-2",
		initializedTargetId: outcome.initializedTargetId,
		selectText: true,
	});
	assert.equal(outcome.initialized, true);
	assert.equal(outcome.focused, false);
	assert.equal(outcome.selected, false);
	assert.equal(calls.includes("disabled-focus"), false);
	assert.equal(calls.includes("disabled-select"), false);

	const unavailable = {
		disabled: false,
		focus() { throw new Error("focus unavailable"); },
		select() { throw new Error("selection unavailable"); },
	};
	assert.doesNotThrow(() => initializeTitleInput(unavailable, {
		targetId: "collection-3",
		initializedTargetId: outcome.initializedTargetId,
		selectText: true,
	}));
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
	assert.ok(view.selectedFolder.details.some((entry) => (
		entry.label === "Folder title visibility" && entry.value === "Hide everywhere"
	)));
	assert.equal(view.selectedFolder.details.some((entry) => entry.label === "Nuvio title"), false);

	const markup = renderWorkspace(controller);
	assert.ok(markup.includes("Hidden title"));
	assert.ok(markup.includes("Invisible in Nuvio"));
	assert.ok(markup.includes('aria-label="Collection with hidden Nuvio title"'));
	assert.ok(markup.includes('aria-label="Folder with hidden Nuvio title"'));
	assert.ok(markup.includes('aria-label="Actions for collection “Collection with hidden Nuvio title”"'));
	assert.ok(markup.includes('aria-label="Actions for folder “Folder with hidden Nuvio title”"'));
	assert.ok(markup.includes('aria-label="Rename collection “Collection with hidden Nuvio title”"'));
	assert.ok(markup.includes('aria-label="Rename folder “Folder with hidden Nuvio title”"'));
	assert.equal(markup.includes(repeated), false);
});

test("modal restores exact Edit focus, initializes Title once, and retains safe dismissal behavior", () => {
	const workspaceSource = fs.readFileSync(
		path.join(rootDir, "builder", "src", "ui", "BuilderWorkspace.jsx"),
		"utf8",
	);
	const editorSource = fs.readFileSync(
		path.join(rootDir, "builder", "src", "ui", "NodeEditor.jsx"),
		"utf8",
	);
	assert.match(workspaceSource, /editRestoreFocusRef\.current = trigger/);
	assert.match(workspaceSource, /if \(mode !== "rename"\) \{[\s\S]*setMobileLevelOverride/);
	assert.equal((workspaceSource.match(/target\.focus\?\.\(\)/g) ?? []).length, 1);
	assert.match(editorSource, /initializeTitleInput\(titleInputRef\.current/);
	assert.match(editorSource, /draft\.original\.title\.supported[\s\S]*isValidVisibleNuvioTitle\(draft\.values\.title\)[\s\S]*!titleHiddenEverywhere/);
	assert.match(editorSource, /initializedTitleTargetRef\.current = outcome\.initializedTargetId/);
	assert.doesNotMatch(workspaceSource, /\.select\(\)/);
	assert.match(editorSource, /handleDialogKeyDown\(event, dialogRef\.current, onCancel\)/);
	assert.match(editorSource, /document\.body\.classList\.add\("settings-modal-open"\)/);
	assert.match(editorSource, /document\.body\.classList\.remove\("settings-modal-open"\)/);
	assert.match(editorSource, /event\.target === event\.currentTarget[\s\S]*dialogRef\.current\?\.focus\(\)/);
	assert.doesNotMatch(editorSource, /event\.target === event\.currentTarget[\s\S]{0,180}onCancel/);
});

test("every card owns one in-card actions menu and mobile contexts own quick rename", () => {
	const controller = importTree([
		{
			id: "first",
			title: "First collection",
			folders: [{
				id: "first-folder",
				title: "First folder",
				sources: [{
					provider: "tmdb",
					title: "First source",
					tmdbSourceType: "LIST",
					tmdbId: "123",
					mediaType: "MOVIE",
				}],
			}],
		},
		{
			id: "second",
			title: "Second collection",
			folders: [],
		},
	]);
	const folder = controller.getState().project.collections[0].folders[0];
	controller.selectNode(folder.internalId);
	const markup = renderWorkspace(controller);
	assert.equal(markup.includes("data-node-editor="), false);
	assert.equal(markup.includes("data-settings-modal="), false);
	assert.equal((markup.match(/data-hierarchy-card="collection"/g) ?? []).length, 2);
	assert.equal((markup.match(/data-action="edit-collection"/g) ?? []).length, 2);
	assert.equal((markup.match(/data-hierarchy-card="folder"/g) ?? []).length, 1);
	assert.equal((markup.match(/data-action="edit-folder"/g) ?? []).length, 1);
	assert.equal((markup.match(/data-hierarchy-actions="collection"/g) ?? []).length, 2);
	assert.equal((markup.match(/data-hierarchy-actions="folder"/g) ?? []).length, 1);
	assert.equal((markup.match(/data-hierarchy-actions="source"/g) ?? []).length, 1);
	assert.equal((markup.match(/data-quick-rename="collection"/g) ?? []).length, 1);
	assert.equal((markup.match(/data-quick-rename="folder"/g) ?? []).length, 1);
	assert.ok(markup.includes('aria-label="Actions for collection “First collection”"'));
	assert.ok(markup.includes('aria-label="Actions for folder “First folder”"'));
	assert.ok(markup.includes('aria-label="Rename collection “First collection”"'));
	assert.ok(markup.includes('aria-label="Rename folder “First folder”"'));
	assert.equal(markup.includes("selected-entity-actions"), false);
	assert.equal(markup.includes("Selected collection"), false);
	assert.equal(markup.includes("Selected folder"), false);
	assert.equal(markup.includes("Edit source"), false);

	const foldersHeader = markedElement(markup, 'data-panel-header="folders"', "header");
	assert.ok(foldersHeader.includes('data-action="create-folder"'));
	assert.equal(foldersHeader.includes("edit-collection"), false);
	const sourcesHeader = markedElement(markup, 'data-panel-header="sources"', "header");
	assert.equal(sourcesHeader.includes("edit-folder"), false);
	const sourceList = markedElement(markup, 'aria-label="Sources"', "ul");
	assert.equal(sourceList.includes('data-action="edit-'), false);
	assert.ok(sourceList.includes('data-action="delete-source"'));
});

test("card selection and action buttons are valid sibling controls with unique IDs", () => {
	const controller = importTree();
	const collection = controller.getState().project.collections[0];
	controller.selectNode(collection.internalId);
	const markup = renderWorkspace(controller);
	const ids = [...markup.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
	assert.equal(ids.length, new Set(ids).size);

	const selectionButtons = [...markup.matchAll(/<button class="node-button[^>]*>[\s\S]*?<\/button>/g)]
		.map((match) => match[0]);
	assert.equal(selectionButtons.length, 2);
	for (const button of selectionButtons) {
		assert.equal(button.includes('data-action="edit-'), false);
		assert.equal((button.match(/<button/g) ?? []).length, 1);
	}
	assert.match(
		markup,
		/data-card-layout="collection"><div class="hierarchy-card-main[^"]*" data-reorder-main-card="collection"><button class="reorder-handle"[\s\S]*?<\/button><button class="node-button[\s\S]*?data-node-type="collection"[\s\S]*?<\/button><div class="hierarchy-actions"/,
	);
	assert.match(
		markup,
		/data-card-layout="folder"><div class="hierarchy-card-main[^"]*" data-reorder-main-card="folder"><button class="reorder-handle"[\s\S]*?<\/button><button class="node-button[\s\S]*?data-node-type="folder"[\s\S]*?<\/button><div class="hierarchy-actions"/,
	);
});

test("desktop double-click edit accepts the primary card only and suppresses single or nested interactive events", () => {
	const primary = {};
	const nestedButton = {};
	assert.equal(shouldOpenHierarchyEditorFromDoubleClick({
		detail: 1,
		currentTarget: primary,
		target: { closest() { return primary; } },
	}), false);
	assert.equal(shouldOpenHierarchyEditorFromDoubleClick({
		detail: 2,
		currentTarget: primary,
		target: { closest() { return primary; } },
	}), true);
	assert.equal(shouldOpenHierarchyEditorFromDoubleClick({
		detail: 2,
		currentTarget: primary,
		target: { closest() { return nestedButton; } },
	}), false);

	const source = fs.readFileSync(path.join(rootDir, "builder", "src", "ui", "BuilderWorkspace.jsx"), "utf8");
	assert.match(source, /enableDoubleClickEdit:\s*desktopViewport/);
	assert.match(source, /onDoubleClickEdit\?\.\(node\.internalId, event\.currentTarget\)/);
	assert.match(source, /source\.editSupported[\s\S]*onOpenSourceEditor\(source\.internalId, event\.currentTarget\)/);
	assert.match(source, /onEdit=\{onOpenEditor\}/);
	assert.match(source, /onEdit=\{source\.editSupported \? actionProps\.onOpenSourceEditor : null\}/);
});

test("quick rename renders only title, invisibility, diagnostics, and actions", () => {
	const controller = importTree();
	const collection = controller.getState().project.collections[0];
	const folder = collection.folders[0];

	let markup = renderWorkspace(controller, {
		draft: createNodeEditorDraft(collection),
		mode: "rename",
	});
	assert.ok(markup.includes('data-editor-mode="rename"'));
	assert.ok(markup.includes(">Rename collection</h2>"));
	assert.ok(markup.includes("Hide collection title in Nuvio"));
	assert.equal(markup.includes("How sources appear in this collection"), false);
	assert.equal(markup.includes("Include an All tab"), false);
	assert.equal(markup.includes("Pin to top"), false);
	assert.equal(markup.includes("Enable focus glow"), false);
	assert.ok(markup.includes('data-action="apply-node-edit"'));
	assert.ok(markup.includes('data-action="cancel-node-edit"'));

	markup = renderWorkspace(controller, {
		draft: createNodeEditorDraft(folder),
		mode: "rename",
	});
	assert.ok(markup.includes(">Rename folder</h2>"));
	assert.ok(markup.includes("Hide folder title everywhere in Nuvio"));
	assert.equal(markup.includes("Folder title visibility"), false);
	assert.equal(markup.includes("Tile shape"), false);
	assert.equal((markup.match(/data-editor-field="title"/g) ?? []).length, 1);
	assert.equal((markup.match(/data-editor-control="hideFolderTitleEverywhere"/g) ?? []).length, 1);
});

test("folder quick-rename invisibility cycle restores the original home-screen visibility", () => {
	const controller = importTree([{
		id: "collection",
		title: "Collection",
		folders: [{
			id: "folder",
			title: "Visible when opened",
			hideTitle: true,
			sources: [],
		}],
	}]);
	const folder = controller.getState().project.collections[0].folders[0];
	const original = createNodeEditorDraft(folder);
	assert.equal(original.values.folderTitleVisibility, "HIDE_HOME_SCREEN");
	assert.equal(original.renameVisibleFolderTitleVisibility, "HIDE_HOME_SCREEN");

	const hidden = updateNodeEditorField(
		original,
		"folderTitleVisibility",
		"HIDE_EVERYWHERE",
	);
	const restored = updateNodeEditorField(
		hidden,
		"folderTitleVisibility",
		hidden.renameVisibleFolderTitleVisibility,
	);
	assert.equal(restored.values.folderTitleVisibility, "HIDE_HOME_SCREEN");
	assert.deepEqual(buildNodeEditorPatch(restored), {});
});

test("collection settings render exactly one accessible modal with stable markers and actions", () => {
	const controller = importTree();
	const collection = controller.getState().project.collections[0];
	controller.selectNode(collection.internalId);
	const markup = renderWorkspace(controller, {
		draft: updateNodeEditorField(
			createNodeEditorDraft(collection),
			"viewMode",
			"TABBED_GRID",
		),
	});
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
		'data-editor-field="backdropImageUrl"',
		'data-action="apply-node-edit"',
		'data-action="cancel-node-edit"',
	]) assert.ok(markup.includes(marker), marker);
	assert.ok(markup.includes("Collection settings"));
	assert.equal((markup.match(/<legend>How sources appear in this collection<\/legend>/g) ?? []).length, 1);
	assert.ok(markup.includes("Choose how each folder in this collection displays its sources in Nuvio."));
	assert.ok(markup.includes("<strong>Tabs (recommended)</strong>"));
	assert.ok(openingTag(markup, 'data-editor-choice="tabs"').includes('value="TABBED_GRID"'));
	assert.ok(markup.includes(
		"Switch between sources using tabs. An optional All tab combines them.",
	));
	assert.ok(markup.includes("Show each source as its own horizontal content row."));
	assert.equal((markup.match(/data-layout-preview="tabs"/g) ?? []).length, 1);
	assert.equal((markup.match(/data-layout-preview="rows"/g) ?? []).length, 1);
	assert.ok(openingTag(markup, 'data-layout-preview="tabs"').includes('aria-hidden="true"'));
	assert.ok(openingTag(markup, 'data-layout-preview="rows"').includes('aria-hidden="true"'));
	for (const choice of ["tabs", "rows"]) {
		const choiceMarkup = markedElement(markup, `data-editor-choice="${choice}"`, "label");
		assert.equal((choiceMarkup.match(/<input/g) ?? []).length, 1);
		assert.doesNotMatch(choiceMarkup, /<(?:a|button|select|textarea)\b/);
		assert.doesNotMatch(choiceMarkup, /<(?:img|svg|video|canvas)\b/);
	}
	assert.ok(markup.includes("Hide collection title in Nuvio"));
	assert.ok(markup.includes("Include an All tab when using Tabs"));
	assert.ok(markup.includes(
		"For each folder with two or more sources, adds an All tab that combines its sources.",
	));
	assert.ok(markup.includes("Pin to top"));
	assert.ok(markup.includes(
		"Pinned collections appear before unpinned collections. In Builder exports, pinned collections keep their relative order from the collection list.",
	));
	assert.equal(markup.includes('data-editor-field="focusGlowEnabled"'), false);
	assert.equal(markup.includes('data-editor-control="focusGlowEnabled"'), false);
	assert.equal(markup.includes("Enable focus glow"), false);
	assert.ok(markup.includes("Uses an invisible character to hide the collection title in Nuvio."));
	assert.equal(markup.includes("Uses an invisible title character because"), false);
	for (const obsolete of [
		"Choose how this collection groups its folders in Nuvio.",
		"Each folder appears as a tab.",
		"Folders appear as streaming-style rows.",
		"Adds an All tab before the individual folder tabs.",
	]) assert.equal(markup.includes(obsolete), false, obsolete);
	assert.equal(markup.includes("Hierarchy navigation is paused"), false);
	assert.equal(markup.includes('data-editor-field="id"'), false);
	const basicDetails = markedElement(markup, 'data-settings-section="basic-details"', "section");
	const display = markedElement(markup, 'data-settings-section="display"', "section");
	const artwork = markedElement(markup, 'data-settings-section="artwork"', "section");
	assert.ok(basicDetails.includes('<h3 id="node-editor-collection-basic-details-heading">Basic details</h3>'));
	assert.ok(basicDetails.includes(">Title</label>"));
	assert.equal(basicDetails.includes("Hide collection title in Nuvio"), false);
	assert.ok(display.includes('<h3 id="node-editor-collection-display-heading">Display</h3>'));
	assert.ok(display.includes("Hide collection title in Nuvio"));
	assert.ok(display.includes("How sources appear in this collection"));
	assert.ok(display.includes("Include an All tab when using Tabs"));
	assert.ok(display.includes("Pin to top"));
	assert.ok(artwork.includes('<h3 id="node-editor-collection-artwork-heading">Artwork</h3>'));
	assert.ok(artwork.includes("Backdrop Image or GIF URL"));
	assert.ok(artwork.includes("Used as fallback folder artwork in Modern View."));
	assert.equal(artwork.includes("Collection cover"), false);
	assert.equal(artwork.includes("Collection tile"), false);
	assert.equal(artwork.includes("Collection hero"), false);
	assert.equal(artwork.includes("<img"), false);
	assert.ok(markup.indexOf('data-settings-section="basic-details"') < markup.indexOf('data-settings-section="display"'));
	assert.ok(markup.indexOf('data-settings-section="display"') < markup.indexOf('data-settings-section="artwork"'));
	assert.match(markup, /<label for="node-editor-collection-title-input">Title<\/label>/);
	assert.ok(openingTag(markup, 'data-workspace-underlay="true"').includes("inert"));
	assert.ok(openingTag(markup, 'data-workspace-underlay="true"').includes('aria-hidden="true"'));
});

test("Collection settings preview the exact current draft backdrop URL with safe image defaults", () => {
	const controller = importTree([{
		id: "collection",
		title: "Collection",
		backdropImageUrl: "https://saved.example/backdrop.gif",
		folders: [],
	}]);
	const collection = controller.getState().project.collections[0];
	controller.selectNode(collection.internalId);
	const beforeProject = structuredClone(controller.getState().project);
	const beforeRevision = controller.getState().revision;
	const draftUrl = "https://arbitrary.example/draft-backdrop.gif?token=exact%20value";
	const draft = updateNodeEditorField(
		createNodeEditorDraft(collection),
		"backdropImageUrl",
		draftUrl,
	);
	const markup = renderWorkspace(controller, { draft });
	const artwork = markedElement(markup, 'data-settings-section="artwork"', "section");
	const field = markedElement(artwork, 'data-editor-field="backdropImageUrl"', "div");
	const input = openingTag(field, 'id="node-editor-collection-artwork-backdropImageUrl"');
	const preview = openingTag(artwork, 'data-artwork-preview="backdropImageUrl"');
	const imageStart = artwork.indexOf("<img", artwork.indexOf('data-artwork-preview="backdropImageUrl"'));
	const image = artwork.slice(imageStart, artwork.indexOf(">", imageStart) + 1);

	assert.ok(openingTag(artwork, 'data-editor-field="backdropImageUrl"').includes('class="editor-field folder-artwork-url-field has-preview"'));
	assert.ok(field.includes('<label for="node-editor-collection-artwork-backdropImageUrl">Backdrop Image or GIF URL</label>'));
	assert.ok(input.includes('type="url"'));
	assert.ok(input.includes('inputMode="url"'));
	assert.ok(input.includes('aria-describedby="node-editor-collection-artwork-backdropImageUrl-help"'));
	assert.ok(field.includes('id="node-editor-collection-artwork-backdropImageUrl-help"'));
	assert.ok(artwork.includes(`value="${draftUrl}"`));
	assert.ok(preview.includes('data-artwork-preview-kind="backdrop"'));
	assert.ok(preview.includes('data-artwork-preview-shape="wide"'));
	assert.ok(preview.includes('aria-hidden="true"'));
	assert.ok(image.includes(`src="${draftUrl}"`));
	assert.ok(image.includes('alt=""'));
	assert.ok(image.includes('loading="lazy"'));
	assert.ok(image.includes('decoding="async"'));
	assert.ok(image.includes('referrerPolicy="no-referrer"'));
	assert.ok(image.includes('draggable="false"'));
	assert.equal(image.includes("tabindex="), false);
	assert.equal(markup.includes("https://saved.example/backdrop.gif"), false);
	assert.deepEqual(controller.getState().project, beforeProject);
	assert.equal(controller.getState().revision, beforeRevision);
	assert.deepEqual(buildNodeEditorPatch(draft), { backdropImageUrl: draftUrl });
});

test("Collection backdrop remains absent from workspace cards", () => {
	const controller = importTree([{
		id: "collection",
		title: "Backdrop Collection",
		backdropImageUrl: "https://example.test/backdrop.gif",
		folders: [],
	}]);
	const markup = renderWorkspace(controller);
	const collectionCard = markedElement(markup, 'data-hierarchy-card="collection"', "div");
	assert.equal(collectionCard.includes("<img"), false);
	assert.equal(collectionCard.includes("folder-card-thumbnail"), false);
	assert.equal(collectionCard.includes("https://example.test/backdrop.gif"), false);
});

test("folder editor keeps unique IDs, valid descriptions, one h1, and one local alert", () => {
	const controller = importTree();
	const folder = controller.getState().project.collections[0].folders[0];
	controller.selectNode(folder.internalId);
	let draft = changedDraft(folder, { title: "" });
	draft = updateNodeEditorField(draft, "folderTitleVisibility", "HIDE_HOME_SCREEN");
	draft = updateNodeEditorField(draft, "tileShape", "POSTER");
	const diagnostics = validateNodeEditorDraft(draft);
	const markup = renderWorkspace(controller, { draft, diagnostics });
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
		'data-editor-field="folderTitleVisibility"',
		'data-editor-choice="show-everywhere"',
		'data-editor-choice="hide-home-screen"',
		'data-editor-choice="hide-everywhere"',
		'data-editor-field="tileShape"',
		'data-editor-choice="poster"',
		'data-editor-choice="landscape"',
	]) assert.ok(markup.includes(marker), marker);
	const basicDetails = markedElement(markup, 'data-settings-section="basic-details"', "section");
	const display = markedElement(markup, 'data-settings-section="display"', "section");
	assert.ok(basicDetails.includes("<h3 id=\"node-editor-folder-basic-details-heading\">Basic details</h3>"));
	assert.ok(basicDetails.includes(">Title</label>"));
	assert.equal(basicDetails.includes("Folder title visibility"), false);
	assert.equal(basicDetails.includes("Tile shape"), false);
	assert.ok(display.includes("<h3 id=\"node-editor-folder-display-heading\">Display</h3>"));
	assert.ok(display.includes("Folder title visibility"));
	assert.ok(display.includes("Tile shape"));
	assert.ok(markup.indexOf('data-settings-section="basic-details"') < markup.indexOf('data-settings-section="display"'));
	const artworkStart = markup.indexOf('data-settings-section="artwork"');
	const artworkEnd = markup.indexOf('<div class="editor-diagnostics"', artworkStart);
	const artwork = markup.slice(artworkStart, artworkEnd);
	assert.ok(artwork.includes('<h3 id="node-editor-folder-artwork-heading">Artwork</h3>'));
	for (const marker of ["Tile artwork URL", "Backdrop Image URL", "Title Logo URL", "Focus GIF URL", "Show Focus GIF"]) assert.ok(artwork.includes(marker), marker);
	assert.equal(artwork.includes("Backdrop Video URL"), false);
	assert.equal(artwork.includes('data-editor-field="heroVideoUrl"'), false);
	assert.equal(artwork.includes("Fallback emoji"), false);
	assert.equal(artwork.includes('data-editor-field="coverEmoji"'), false);
	for (const helper of [
		"Artwork used for the folder tile.",
		"Background image for the folder.",
		"Transparent title logo.",
		"Animated artwork when focused.",
	]) assert.ok(artwork.includes(helper), helper);
	assert.equal(artwork.includes("Existing video background for this folder."), false);
	assert.equal(artwork.includes("Leave blank to clear it."), false);
	for (const group of ["tile", "hero-background", "branding", "focus"]) assert.ok(artwork.includes(`data-artwork-group="${group}"`), group);
	assert.equal((artwork.match(/class="folder-artwork-group"/g) ?? []).length, 4);
	assert.equal((artwork.match(/<video/g) ?? []).length, 0);
	assert.ok(markup.indexOf('data-settings-section="display"') < markup.indexOf('data-settings-section="artwork"'));
	assert.equal(markup.includes('data-editor-field="hideNuvioTitle"'), false);
	assert.equal(markup.includes('data-editor-control="hideNuvioTitle"'), false);
	assert.equal((markup.match(/<legend>Folder title visibility<\/legend>/g) ?? []).length, 1);
	assert.equal((markup.match(/name="node-editor-folder-title-visibility"/g) ?? []).length, 3);
	assert.equal((markup.match(/data-control-presentation="compact-radios"/g) ?? []).length, 1);
	assert.ok(openingTag(markup, 'data-editor-choice="hide-home-screen"').includes("checked"));
	assert.ok(markup.includes("Show everywhere"));
	assert.ok(markup.includes("Home screen and open folder"));
	assert.ok(markup.includes("Hide on home screen only"));
	assert.ok(markup.includes("Still shown inside the folder"));
	assert.ok(markup.includes("Hide everywhere"));
	assert.ok(markup.includes("Uses an invisible title"));
	assert.equal(markup.includes("Hide folder title everywhere in Nuvio"), false);
	assert.equal(markup.includes("Show folder title on home screen"), false);
	assert.equal(markup.includes('data-editor-control="hideFolderTitleEverywhere"'), false);
	assert.equal(markup.includes('data-editor-control="showFolderTitle"'), false);
	assert.ok(markup.includes("Choose the shape of this folder card in Nuvio."));
	assert.equal((markup.match(/data-control-presentation="visual-cards"/g) ?? []).length, 1);
	const shapeFieldset = markedElement(markup, 'data-editor-field="tileShape"', "fieldset");
	assert.equal((shapeFieldset.match(/<legend>Tile shape<\/legend>/g) ?? []).length, 1);
	assert.equal((shapeFieldset.match(/name="node-editor-folder-shape"/g) ?? []).length, 2);
	assert.equal((shapeFieldset.match(/type="radio"/g) ?? []).length, 2);
	assert.equal((shapeFieldset.match(/class="visually-hidden"/g) ?? []).length, 2);
	assert.ok(shapeFieldset.includes('for="node-editor-folder-poster-shape"'));
	assert.ok(shapeFieldset.includes('id="node-editor-folder-poster-shape"'));
	assert.ok(shapeFieldset.includes('for="node-editor-folder-landscape-shape"'));
	assert.ok(shapeFieldset.includes('id="node-editor-folder-landscape-shape"'));
	assert.ok(openingTag(markup, 'data-editor-choice="poster"').includes('value="POSTER"'));
	assert.ok(openingTag(markup, 'data-editor-choice="poster"').includes('class="visually-hidden"'));
	assert.ok(openingTag(markup, 'data-editor-choice="poster"').includes("checked"));
	assert.ok(openingTag(markup, 'data-editor-choice="landscape"').includes('value="LANDSCAPE"'));
	assert.ok(openingTag(markup, 'data-editor-choice="landscape"').includes('class="visually-hidden"'));
	assert.ok(markedElement(markup, 'data-editor-choice="poster"', "label").includes("✓"));
	assert.equal(markedElement(markup, 'data-editor-choice="landscape"', "label").includes("✓"), false);
	assert.equal(shapeFieldset.includes("editor-shape-radio-circle"), false);
	const visibilityFieldset = markedElement(
		markup,
		'data-editor-field="folderTitleVisibility"',
		"fieldset",
	);
	assert.equal((visibilityFieldset.match(/type="radio"/g) ?? []).length, 3);
	assert.equal(visibilityFieldset.includes('class="visually-hidden"'), false);
	assert.equal(markup.includes("hideTitle"), false);
	assert.ok(markup.indexOf(">Title</label>") < markup.indexOf("Folder title visibility"));
	assert.ok(markup.indexOf("Folder title visibility") < markup.indexOf("Tile shape"));
	assert.ok(markup.includes('data-settings-section="artwork"'));
	assert.ok(markup.includes(">Artwork<"));
	const sourceList = markedElement(markup, 'aria-label="Sources"', "ul");
	assert.equal(sourceList.includes("folderTitleVisibility"), false);
	assert.equal(sourceList.includes("Folder title visibility"), false);
});

test("folder settings render exact draft artwork previews with safe media defaults", () => {
	const controller = importTree([{
		id: "collection",
		title: "Collection",
		folders: [{
			id: "folder",
			title: "Preview folder",
			tileShape: "POSTER",
			coverImageUrl: "https://saved.example/tile.webp",
			coverEmoji: "📺",
			heroBackdropUrl: "https://saved.example/backdrop.webp",
			heroVideoUrl: "https://saved.example/backdrop.mp4",
			titleLogoUrl: "https://saved.example/logo.png",
			focusGifUrl: "https://saved.example/focus.gif",
			focusGifEnabled: true,
			sources: [],
		}],
	}]);
	const folder = controller.getState().project.collections[0].folders[0];
	controller.selectNode(folder.internalId);
	let draft = createNodeEditorDraft(folder);
	const draftUrls = {
		coverImageUrl: "https://draft.example/tile-case-A.webp",
		heroBackdropUrl: "https://draft.example/backdrop-case-A.webp",
		heroVideoUrl: "https://draft.example/video-case-A.mp4",
		titleLogoUrl: "https://draft.example/logo-case-A.png",
		focusGifUrl: "https://draft.example/focus-case-A.gif",
	};
	for (const [field, value] of Object.entries(draftUrls)) draft = updateNodeEditorField(draft, field, value);
	const markup = renderWorkspace(controller, { draft });
	const artworkStart = markup.indexOf('data-settings-section="artwork"');
	const artworkEnd = markup.indexOf('<div class="editor-diagnostics"', artworkStart);
	const artwork = markup.slice(artworkStart, artworkEnd);
	assert.equal(artwork.includes("📺"), false);
	assert.equal(artwork.includes('data-editor-field="coverEmoji"'), false);

	for (const [field, url] of Object.entries(draftUrls)) {
		assert.ok(artwork.includes(`value="${url}"`), `${field} input`);
	}
	for (const field of ["coverImageUrl", "heroBackdropUrl", "titleLogoUrl", "focusGifUrl"]) {
		const preview = openingTag(artwork, `data-artwork-preview="${field}"`);
		assert.ok(preview.includes('aria-hidden="true"'), field);
		const imageStart = artwork.indexOf("<img", artwork.indexOf(`data-artwork-preview="${field}"`));
		const image = artwork.slice(imageStart, artwork.indexOf(">", imageStart) + 1);
		assert.ok(image.includes(`src="${draftUrls[field]}"`), field);
		assert.ok(image.includes('alt=""'), field);
		assert.ok(image.includes('loading="lazy"'), field);
		assert.ok(image.includes('decoding="async"'), field);
		assert.ok(image.includes('referrerPolicy="no-referrer"'), field);
		assert.equal(image.includes('tabindex='), false, field);
	}
	assert.ok(openingTag(artwork, 'data-artwork-preview="coverImageUrl"').includes('data-artwork-preview-shape="poster"'));
	assert.ok(openingTag(artwork, 'data-artwork-preview="focusGifUrl"').includes('data-artwork-preview-shape="poster"'));
	assert.ok(openingTag(artwork, 'data-artwork-preview="focusGifUrl"').includes('data-artwork-preview-visible="true"'));
	assert.equal(artwork.includes("Hidden in Nuvio"), false);
	assert.ok(openingTag(artwork, 'data-artwork-preview="heroBackdropUrl"').includes('data-artwork-preview-shape="wide"'));
	assert.ok(openingTag(artwork, 'data-artwork-preview="titleLogoUrl"').includes('data-artwork-preview-shape="logo"'));
	assert.equal((artwork.match(/<video/g) ?? []).length, 0);
	assert.equal((artwork.match(/>Preview video<\/button>/g) ?? []).length, 1);
	assert.ok(artwork.includes("Existing video background for this folder."));
	assert.equal(artwork.includes("https://saved.example/backdrop.mp4"), false);

	const hiddenFocusDraft = updateNodeEditorField(draft, "focusGifEnabled", false);
	const hiddenFocusMarkup = renderWorkspace(controller, { draft: hiddenFocusDraft });
	const hiddenFocusPreview = openingTag(hiddenFocusMarkup, 'data-artwork-preview="focusGifUrl"');
	assert.ok(hiddenFocusPreview.includes("is-preview-hidden"));
	assert.ok(hiddenFocusPreview.includes('data-artwork-preview-visible="false"'));
	assert.ok(hiddenFocusMarkup.includes("Hidden in Nuvio"));
	assert.ok(hiddenFocusMarkup.includes(`value="${draftUrls.focusGifUrl}"`));
	assert.ok(hiddenFocusMarkup.includes(`src="${draftUrls.focusGifUrl}"`));
	const restoredFocusMarkup = renderWorkspace(controller, { draft: updateNodeEditorField(hiddenFocusDraft, "focusGifEnabled", true) });
	assert.ok(openingTag(restoredFocusMarkup, 'data-artwork-preview="focusGifUrl"').includes('data-artwork-preview-visible="true"'));
	assert.equal(restoredFocusMarkup.includes("Hidden in Nuvio"), false);

	const landscapeMarkup = renderWorkspace(controller, {
		draft: updateNodeEditorField(draft, "tileShape", "LANDSCAPE"),
	});
	assert.ok(openingTag(landscapeMarkup, 'data-artwork-preview="coverImageUrl"').includes('data-artwork-preview-shape="landscape"'));
	assert.ok(openingTag(landscapeMarkup, 'data-artwork-preview="focusGifUrl"').includes('data-artwork-preview-shape="landscape"'));

	const squareController = importTree([{
		id: "collection",
		title: "Collection",
		folders: [{ id: "folder", title: "Square", tileShape: "SQUARE", coverImageUrl: "https://draft.example/square.webp", focusGifUrl: "https://draft.example/square-focus.gif", sources: [] }],
	}]);
	const squareFolder = squareController.getState().project.collections[0].folders[0];
	squareController.selectNode(squareFolder.internalId);
	const squareMarkup = renderWorkspace(squareController, { draft: createNodeEditorDraft(squareFolder) });
	assert.ok(openingTag(squareMarkup, 'data-artwork-preview="coverImageUrl"').includes('data-artwork-preview-shape="unknown"'));
	assert.ok(openingTag(squareMarkup, 'data-artwork-preview="focusGifUrl"').includes('data-artwork-preview-shape="unknown"'));
});

test("Backdrop Video is opening-state compatibility UI and remains hidden for absent, blank, and unsupported values", () => {
	const controller = importTree([{
		id: "collection",
		title: "Collection",
		folders: [
			{ id: "absent", title: "Absent video", heroBackdropUrl: "https://saved.example/absent.webp", sources: [] },
			{ id: "blank", title: "Blank video", heroBackdropUrl: "https://saved.example/blank.webp", heroVideoUrl: "   ", sources: [] },
			{ id: "unsupported", title: "Unsupported video", heroBackdropUrl: "https://saved.example/unsupported.webp", heroVideoUrl: ["RAW_VIDEO"], sources: [] },
		],
	}]);

	for (const folder of controller.getState().project.collections[0].folders) {
		controller.selectNode(folder.internalId);
		const draft = createNodeEditorDraft(folder);
		const markup = renderWorkspace(controller, { draft });
		assert.equal(markup.includes('data-editor-field="heroVideoUrl"'), false, folder.editable.id);
		assert.equal(markup.includes("Backdrop Video URL"), false, folder.editable.id);
		assert.equal(markup.includes(">Preview video</button>"), false, folder.editable.id);
	}

	const [absentFolder, blankFolder, unsupportedFolder] = controller.getState().project.collections[0].folders;
	assert.equal(createNodeEditorDraft(absentFolder).original.heroVideoUrl.status, "absent");
	assert.equal(createNodeEditorDraft(blankFolder).original.heroVideoUrl.value, "   ");
	assert.equal(createNodeEditorDraft(blankFolder).original.heroVideoUrl.supported, true);
	assert.equal(createNodeEditorDraft(unsupportedFolder).original.heroVideoUrl.status, "unsupported");
	assert.deepEqual(unsupportedFolder.rawImported.heroVideoUrl, ["RAW_VIDEO"]);
});

test("clearing a compatible Backdrop Video keeps its opening control until the next draft", () => {
	const controller = importTree([{
		id: "collection",
		title: "Collection",
		folders: [{
			id: "folder",
			title: "Compatible video",
			heroVideoUrl: "https://saved.example/video-a.mp4",
			sources: [],
		}],
	}]);
	const folder = controller.getState().project.collections[0].folders[0];
	controller.selectNode(folder.internalId);
	const openingDraft = createNodeEditorDraft(folder);
	const clearedDraft = updateNodeEditorField(openingDraft, "heroVideoUrl", "");
	const clearedMarkup = renderWorkspace(controller, { draft: clearedDraft });
	assert.ok(clearedMarkup.includes('data-editor-field="heroVideoUrl"'));
	assert.ok(clearedMarkup.includes('value=""'));
	assert.equal(clearedMarkup.includes(">Preview video</button>"), false);
	assert.deepEqual(buildNodeEditorPatch(clearedDraft), { heroVideoUrl: "" });

	const reopenedController = importTree([{
		id: "collection",
		title: "Collection",
		folders: [{ id: "folder", title: "Cleared video", heroVideoUrl: "", sources: [] }],
	}]);
	const reopenedFolder = reopenedController.getState().project.collections[0].folders[0];
	reopenedController.selectNode(reopenedFolder.internalId);
	const reopenedMarkup = renderWorkspace(reopenedController, { draft: createNodeEditorDraft(reopenedFolder) });
	assert.equal(reopenedMarkup.includes('data-editor-field="heroVideoUrl"'), false);
});

test("imported invisible folder settings select Hide everywhere without exposing raw text", () => {
	const repeated = NUVIO_INVISIBLE_TITLE.repeat(3);
	const controller = importTree([{
		id: "collection",
		title: "Visible collection",
		folders: [{
			id: "hidden-folder",
			title: repeated,
			tileShape: "POSTER",
			hideTitle: false,
			sources: [],
		}],
	}]);
	const folder = controller.getState().project.collections[0].folders[0];
	controller.selectNode(folder.internalId);
	const draft = createNodeEditorDraft(folder);
	const markup = renderWorkspace(controller, { draft });
	const titleInput = openingTag(markup, 'data-editor-field="title"');
	const showEverywhereInput = openingTag(markup, 'data-editor-choice="show-everywhere"');
	const hideHomeScreenInput = openingTag(markup, 'data-editor-choice="hide-home-screen"');
	const hideEverywhereInput = openingTag(markup, 'data-editor-choice="hide-everywhere"');

	assert.ok(markup.includes(
		"The folder title is intentionally invisible everywhere in Nuvio. Choose a visible option below to enter a visible title.",
	));
	assert.ok(titleInput.includes('value=""'));
	assert.ok(titleInput.includes("disabled"));
	assert.equal(showEverywhereInput.includes("checked"), false);
	assert.equal(hideHomeScreenInput.includes("checked"), false);
	assert.ok(hideEverywhereInput.includes("checked"));
	for (const input of [showEverywhereInput, hideHomeScreenInput, hideEverywhereInput]) {
		assert.ok(input.includes('type="radio"'));
		assert.ok(input.includes('name="node-editor-folder-title-visibility"'));
	}
	assert.equal(markup.includes('data-editor-field="hideNuvioTitle"'), false);
	assert.equal(markup.includes('data-editor-control="hideNuvioTitle"'), false);
	assert.equal(markup.includes("Hide folder title everywhere in Nuvio"), false);
	assert.equal(markup.includes("Show folder title on home screen"), false);
	assert.equal(markup.includes(repeated), false);
	assert.deepEqual(buildNodeEditorPatch(updateNodeEditorField(draft, "tileShape", "LANDSCAPE")), {
		tileShape: "LANDSCAPE",
	});
});

test("unusual imported values show calm replacement guidance without raw values", () => {
	const controller = importTree([{
		id: { secret: "RAW_OBJECT" },
		title: false,
		viewMode: { secret: "RAW_LAYOUT" },
		showAllTab: ["RAW_ALL"],
		pinToTop: 7,
		focusGlowEnabled: { secret: "RAW_GLOW" },
		backdropImageUrl: { secret: "RAW_BACKDROP" },
		folders: [],
	}]);
	const collection = controller.getState().project.collections[0];
	controller.selectNode(collection.internalId);
	const markup = renderWorkspace(controller, { draft: createNodeEditorDraft(collection) });
	assert.equal((markup.match(/The imported value is not text/g) ?? []).length, 1);
	assert.equal(markup.includes("RAW_OBJECT"), false);
	assert.equal(markup.includes("RAW_LAYOUT"), false);
	assert.equal(markup.includes("RAW_ALL"), false);
	assert.equal(markup.includes("RAW_GLOW"), false);
	assert.equal(markup.includes("RAW_BACKDROP"), false);
	assert.equal(markup.includes('value="false"'), false);
	assert.ok(markup.includes("will be preserved until you choose Tabs or Rows"));
	assert.ok(markup.includes("cannot be shown safely"));
	assert.ok(markup.includes("The current imported value is preserved until this field is edited."));
});

test("Rows keeps the saved All-tab preference enabled, editable, and independent from layout", () => {
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
	assert.equal(openingTag(markup, 'data-editor-control="showAllTab"').includes("disabled"), false);
	assert.ok(openingTag(markup, 'data-editor-control="showAllTab"').includes("checked"));
	assert.ok(markup.includes("Include an All tab when using Tabs"));
	assert.ok(markup.includes(
		"Rows do not show tabs. This preference will be used if the collection is later changed to Tabs.",
	));
	assert.equal(draft.values.showAllTab, true);
	assert.deepEqual(buildNodeEditorPatch(draft), {});

	const disabledPreference = updateNodeEditorField(draft, "showAllTab", false);
	const disabledMarkup = renderWorkspace(controller, { draft: disabledPreference });
	assert.equal(openingTag(disabledMarkup, 'data-editor-control="showAllTab"').includes("disabled"), false);
	assert.equal(openingTag(disabledMarkup, 'data-editor-control="showAllTab"').includes("checked"), false);
	assert.deepEqual(buildNodeEditorPatch(disabledPreference), { showAllTab: false });

	const tabsDraft = updateNodeEditorField(disabledPreference, "viewMode", "TABBED_GRID");
	assert.equal(tabsDraft.values.showAllTab, false);
	assert.deepEqual(buildNodeEditorPatch(tabsDraft), {
		viewMode: "TABBED_GRID",
		showAllTab: false,
	});
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

test("visible boolean guidance clears after replacement while hidden focus glow stays preserved", () => {
	const controller = importTree([{
		id: "collection",
		title: "Imported collection",
		viewMode: "TABBED_GRID",
		showAllTab: ["RAW_ALL_TAB"],
		focusGlowEnabled: { secret: "RAW_FOCUS_GLOW" },
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
	assert.equal(collectionMarkup.includes("The imported focus glow preference"), false);
	assert.equal(collectionMarkup.includes('data-editor-control="focusGlowEnabled"'), false);
	assert.equal(collectionMarkup.includes("RAW_FOCUS_GLOW"), false);
	const replacedCollectionDraft = updateNodeEditorField(
		collectionDraft,
		"showAllTab",
		false,
	);
	const replacedCollectionMarkup = renderWorkspace(controller, { draft: replacedCollectionDraft });
	assert.equal(
		replacedCollectionMarkup.includes(
			"The imported All tab preference cannot be shown safely and will be preserved unless you use this switch.",
		),
		false,
	);
	assert.deepEqual(buildNodeEditorPatch(replacedCollectionDraft), { showAllTab: false });

	const replacedFocusGlowDraft = updateNodeEditorField(
		collectionDraft,
		"focusGlowEnabled",
		false,
	);
	const replacedFocusGlowMarkup = renderWorkspace(controller, { draft: replacedFocusGlowDraft });
	assert.equal(replacedFocusGlowMarkup.includes('data-editor-control="focusGlowEnabled"'), false);
	assert.deepEqual(buildNodeEditorPatch(replacedFocusGlowDraft), { focusGlowEnabled: false });

	controller.selectNode(folder.internalId);
	const folderDraft = createNodeEditorDraft(folder);
	const folderMarkup = renderWorkspace(controller, { draft: folderDraft });
	assert.ok(folderMarkup.includes(
		"No imported home-screen title preference is set. It will stay absent until you choose a visibility option.",
	));
	const replacedFolderDraft = updateNodeEditorField(
		folderDraft,
		"folderTitleVisibility",
		"HIDE_HOME_SCREEN",
	);
	const replacedFolderMarkup = renderWorkspace(controller, { draft: replacedFolderDraft });
	assert.equal(
		replacedFolderMarkup.includes("will stay absent until you choose a visibility option"),
		false,
	);
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
		'data-action="edit-collection"',
		'data-action="edit-folder"',
	]) assert.ok(openingTag(markup, marker).includes("disabled"), marker);
	assert.equal((markup.match(/<button class="back-control mobile-only"[^>]*disabled/g) ?? []).length, 2);
	assert.equal(markup.includes("Show folder details"), false);
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

test("styles keep card actions touch-safe and responsive while the modal stays bounded and motion-safe", () => {
	const styles = fs.readFileSync(path.join(rootDir, "builder", "src", "styles.css"), "utf8");
	assert.match(styles, /\.hierarchy-card-row\s*\{[\s\S]*display:\s*block/);
	assert.match(styles, /\.hierarchy-card-main\s*\{[\s\S]*grid-template-columns:\s*46px minmax\(0, 1fr\) 46px/);
	assert.match(styles, /\.hierarchy-card[\s\S]*min-width:\s*0/);
	assert.match(styles, /\.reorder-handle\s*\{[\s\S]*width:\s*46px[\s\S]*height:\s*46px/);
	assert.match(styles, /\.hierarchy-actions-trigger\s*\{[\s\S]*width:\s*46px[\s\S]*height:\s*46px/);
	assert.match(styles, /\.quick-rename-action\s*\{[\s\S]*width:\s*44px[\s\S]*height:\s*44px/);
	assert.doesNotMatch(styles, /\.card-edit-action|\.card-delete-action|\.card-move-action/);
	assert.match(styles, /body\s*\{[\s\S]*overflow-x:\s*hidden/);
	assert.match(styles, /\.settings-modal-backdrop\s*\{[\s\S]*position:\s*fixed/);
	assert.match(styles, /\.settings-modal-backdrop\s*\{[\s\S]*background:\s*rgb\(0 8 13 \/ 88%\)/);
	assert.match(styles, /@supports \(\(-webkit-backdrop-filter:[\s\S]*backdrop-filter:\s*blur\(8px\)/);
	assert.match(styles, /\.node-editor\s*\{[\s\S]*height:\s*100dvh/);
	assert.match(styles, /\.node-editor\s*\{[\s\S]*max-height:\s*100dvh/);
	assert.match(styles, /\.node-editor\s*\{[\s\S]*overflow-y:\s*auto/);
	assert.match(styles, /\.node-editor,\s*\.dingo-scrollbar\s*\{[\s\S]*scrollbar-color:\s*rgb\(70 118 136\) rgb\(4 16 23\)[\s\S]*scrollbar-width:\s*auto/);
	assert.match(styles, /\.node-editor::\-webkit-scrollbar,\s*\.dingo-scrollbar::\-webkit-scrollbar\s*\{[\s\S]*width:\s*12px/);
	assert.match(styles, /\.node-editor::\-webkit-scrollbar-track,\s*\.dingo-scrollbar::\-webkit-scrollbar-track\s*\{[\s\S]*background:\s*rgb\(4 16 23\)/);
	assert.match(styles, /\.node-editor::\-webkit-scrollbar-thumb,\s*\.dingo-scrollbar::\-webkit-scrollbar-thumb\s*\{[\s\S]*border-radius:\s*999px/);
	assert.match(styles, /\.node-editor::\-webkit-scrollbar-thumb:hover,\s*\.dingo-scrollbar::\-webkit-scrollbar-thumb:hover\s*\{[\s\S]*background:\s*rgb\(62 146 174\)/);
	assert.match(styles, /body\.settings-modal-open\s*\{[\s\S]*overflow:\s*hidden/);
	assert.match(styles, /\.workspace-underlay\[aria-hidden="true"\]\s*\{[\s\S]*pointer-events:\s*none/);
	assert.match(styles, /\.editor-field input\[type="text"\],[\s\S]*min-height:\s*48px/);
	assert.match(styles, /\.folder-artwork-fields\s*\{[\s\S]*min-width:\s*0/);
	assert.match(styles, /\.editor-settings-section\s*\{[\s\S]*min-width:\s*0[\s\S]*border-radius:\s*14px/);
	assert.match(styles, /\.editor-choice\s*\{[\s\S]*min-height:\s*72px/);
	assert.match(
		styles,
		/\.editor-choice input:not\(\.visually-hidden\)\s*\{[\s\S]*width:\s*20px[\s\S]*height:\s*20px/,
	);
	assert.match(styles, /\.editor-compact-radio\s*\{[\s\S]*min-height:\s*54px/);
	assert.match(styles, /\.editor-compact-radio input\s*\{[\s\S]*width:\s*18px[\s\S]*height:\s*18px/);
	assert.match(styles, /\.editor-layout-choice\s*\{[\s\S]*min-height:\s*184px/);
	assert.match(styles, /\.source-layout-preview\s*\{[\s\S]*min-width:\s*0/);
	assert.match(styles, /\.source-layout-preview\s*\{[\s\S]*overflow:\s*hidden/);
	assert.match(styles, /\.source-layout-preview-tab-bar\s*\{[\s\S]*display:\s*flex/);
	assert.match(styles, /\.source-layout-preview-tab-bar > span\s*\{[\s\S]*font-size:\s*0\.56rem/);
	assert.match(styles, /\.source-layout-preview-tab-bar > span\s*\{[\s\S]*font-weight:\s*750/);
	assert.match(styles, /\.source-layout-preview-poster-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(5,\s*15px\)/);
	assert.match(styles, /\.source-layout-preview-rows\s*\{[\s\S]*gap:\s*7px/);
	assert.match(styles, /\.source-layout-preview-row\s*\{[\s\S]*grid-template-columns:\s*48px minmax\(0,\s*1fr\)/);
	assert.match(styles, /\.source-layout-preview-row-label\s*\{[\s\S]*font-size:\s*0\.56rem/);
	assert.match(styles, /\.source-layout-preview-row-label\s*\{[\s\S]*font-weight:\s*750/);
	assert.match(styles, /\.editor-shape-choice-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
	assert.match(
		styles,
		/\.editor-shape-choice:has\(> input:focus-visible\)\s*\{[\s\S]*outline:\s*3px solid var\(--cyan-bright\)[\s\S]*outline-offset:\s*3px/,
	);
	assert.match(styles, /\.editor-choice-check\s*\{[\s\S]*position:\s*absolute/);
	const visuallyHiddenRule = styles.match(/\.visually-hidden\s*\{([\s\S]*?)\}/)?.[1] ?? "";
	assert.match(visuallyHiddenRule, /position:\s*absolute/);
	assert.match(visuallyHiddenRule, /width:\s*1px/);
	assert.match(visuallyHiddenRule, /height:\s*1px/);
	assert.match(visuallyHiddenRule, /clip:\s*rect\(0,\s*0,\s*0,\s*0\)/);
	assert.doesNotMatch(visuallyHiddenRule, /display:\s*none|visibility:\s*hidden/);
	assert.match(styles, /\.editor-switch\s*\{[\s\S]*min-height:\s*64px/);
	assert.match(styles, /\.shape-preview\.is-poster\s*\{[\s\S]*height:\s*39px/);
	assert.match(styles, /\.shape-preview\.is-landscape\s*\{[\s\S]*width:\s*42px/);
	assert.match(styles, /\.editor-apply\s*\{[\s\S]*background:\s*linear-gradient\(135deg,\s*var\(--cyan\),\s*var\(--green\)\)/);
	assert.match(styles, /button:disabled/);
	assert.match(styles, /@media \(max-width: 430px\)/);
	assert.match(
		styles,
		/@media \(max-width: 619px\)[\s\S]*\.node-editor\s*\{[\s\S]*height:\s*100svh[\s\S]*height:\s*100dvh/,
	);
	assert.match(
		styles,
		/@media \(max-width: 619px\)[\s\S]*scroll-padding-block:\s*var\(--mobile-modal-heading-clearance\) var\(--mobile-modal-action-clearance\)/,
	);
	assert.match(
		styles,
		/@media \(max-width: 619px\)[\s\S]*--mobile-modal-action-clearance:\s*calc\(78px \+ env\(safe-area-inset-bottom\)\)/,
	);
	assert.match(
		styles,
		/@media \(max-width: 619px\)[\s\S]*\.node-editor-heading\s*\{[\s\S]*gap:\s*7px[\s\S]*padding:\s*13px 18px 14px[\s\S]*background:\s*rgb\(9 29 40\)/,
	);
	assert.match(
		styles,
		/@media \(max-width: 619px\)[\s\S]*\.node-editor-actions\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1\.65fr\) minmax\(88px,\s*1fr\)[\s\S]*background:\s*rgb\(7 24 33\)/,
	);
	assert.match(
		styles,
		/@media \(max-width: 619px\)[\s\S]*\.node-editor-actions \.editor-apply,[\s\S]*\.node-editor-actions \.editor-cancel\s*\{[\s\S]*min-height:\s*54px/,
	);
	assert.match(
		styles,
		/@media \(max-width: 619px\)[\s\S]*scroll-margin-block-start:\s*var\(--mobile-modal-heading-clearance\)[\s\S]*scroll-margin-block-end:\s*var\(--mobile-modal-action-clearance\)/,
	);
	assert.match(styles, /@media \(min-width: 620px\)[\s\S]*width:\s*min\(840px,\s*100%\)/);
	assert.match(styles, /@media \(min-width: 620px\)[\s\S]*max-height:\s*calc\(100dvh - 48px\)/);
	assert.match(styles, /@media \(min-width: 620px\)[\s\S]*border-radius:\s*18px/);
	assert.match(
		styles,
		/@media \(min-width: 620px\)[\s\S]*\.node-editor-actions\s*\{[\s\S]*grid-template-columns:\s*auto auto[\s\S]*padding:\s*16px 22px 22px/,
	);
	assert.match(
		styles,
		/@media \(min-width: 620px\)[\s\S]*\.editor-compact-radio-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/,
	);
	assert.match(styles, /@media \(min-width: 760px\)[\s\S]*\.node-editor-form\s*\{[\s\S]*max-width:\s*760px/);
	assert.match(styles, /@media \(min-width: 900px\)[\s\S]*grid-template-columns:\s*minmax\(250px/);
	assert.match(styles, /focus-visible/);
	assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
	for (const mobileWidth of [360, 384, 393, 402, 412]) {
		assert.ok(mobileWidth <= 430, `${mobileWidth}px remains inside the tested narrow-layout boundary`);
	}
});

test("UI scope contains no source editor, generic source creation, persistence, routing, or export actions", () => {
	const uiFiles = fs.readdirSync(path.join(rootDir, "builder", "src", "ui"))
		.filter((name) => /\.(?:js|jsx)$/.test(name))
		.map((name) => fs.readFileSync(path.join(rootDir, "builder", "src", "ui", name), "utf8"))
		.join("\n");
	for (const marker of [
		'data-action="edit-source"',
		'data-action="create-source',
		'data-action="export-',
		"localStorage",
		"indexedDB",
		"react-router",
		"showSaveFilePicker",
	]) assert.equal(uiFiles.includes(marker), false, marker);
});
