import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "../builder/node_modules/react/index.js";
import { renderToStaticMarkup } from "../builder/node_modules/react-dom/server.js";
import { createServer } from "../builder/node_modules/vite/dist/node/index.js";
import { createSecureBrowserId } from "../builder/src/application/browser-id-factory.js";
import { createBuilderController } from "../builder/src/application/index.js";
import {
	createUniqueNuvioId, defaultNuvioIdFactory, isUsableNuvioId,
	NuvioIdGenerationError, prepareNewNodeEditable,
} from "../builder/src/nuvio/nuvio-ids.js";
import { createNodeEditorDraft } from "../builder/src/ui/node-editor.js";
import {
	completeWorkspaceReturn,
	createWorkspaceReturnGate,
	requestWorkspaceReturn,
	resetBuilderWorkspace,
	workspaceNeedsDiscardConfirmation,
} from "../builder/src/ui/workspace-return-actions.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vite = await createServer({ root: path.join(rootDir, "builder"), appType: "custom", logLevel: "silent", server: { middlewareMode: true } });
const { BuilderWorkspace } = await vite.ssrLoadModule("/src/ui/BuilderWorkspace.jsx");
const { BuilderWelcome } = await vite.ssrLoadModule("/src/ui/BuilderWelcome.jsx");
after(() => vite.close());

function sequence(prefix) { let count = 0; return () => `${prefix}-${++count}`; }
function makeController(options = {}) {
	return createBuilderController({ idFactory: sequence("internal"), nuvioIdFactory: sequence("nuvio"), ...options });
}
function renderWorkspace(controller, options = {}) {
	return renderToStaticMarkup(createElement(BuilderWorkspace, { controller, state: controller.getState(), ...options }));
}
function openingTag(markup, marker) {
	const markerIndex = markup.indexOf(marker);
	assert.notEqual(markerIndex, -1, `Missing markup marker: ${marker}`);
	return markup.slice(markup.lastIndexOf("<", markerIndex), markup.indexOf(">", markerIndex) + 1);
}

test("default factory delegates to crypto.randomUUID and has no weak fallback", () => {
	const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
	try {
		Object.defineProperty(globalThis, "crypto", { configurable: true, value: { randomUUID: () => "secure-uuid" } });
		assert.equal(defaultNuvioIdFactory(), "secure-uuid");
		Object.defineProperty(globalThis, "crypto", { configurable: true, value: undefined });
		assert.throws(() => defaultNuvioIdFactory(), NuvioIdGenerationError);
	} finally {
		descriptor ? Object.defineProperty(globalThis, "crypto", descriptor) : delete globalThis.crypto;
	}
});

test("browser factory uses secure UUID APIs on local and LAN origins", () => {
	assert.equal(createSecureBrowserId({ randomUUID: () => "secure-uuid" }), "secure-uuid");

	const values = Array.from({ length: 16 }, (_, index) => index);
	const fallback = createSecureBrowserId({
		getRandomValues(bytes) {
			bytes.set(values);
			return bytes;
		},
	});
	assert.equal(fallback, "00010203-0405-4607-8809-0a0b0c0d0e0f");
	assert.match(fallback, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
	assert.throws(() => createSecureBrowserId({}), /secure browser ID API/);
});

test("usability accepts exact non-empty strings without requiring UUID syntax", () => {
	for (const value of ["7f60871b-ddbc-4006-a6c7-c20885bde3c6", "Community-ID"]) assert.equal(isUsableNuvioId(value), true);
	for (const value of ["", " ", " leading", "trailing ", null, 1, true, [], {}]) assert.equal(isUsableNuvioId(value), false);
});

test("unique generation retries collisions and reserves its result", () => {
	const values = ["taken", "taken", "created"];
	const reserved = new Set(["taken"]);
	assert.equal(createUniqueNuvioId(reserved, () => values.shift()), "created");
	assert.equal(reserved.has("created"), true);
});

test("factory exceptions invalid values and collision exhaustion are contained", () => {
	assert.throws(() => createUniqueNuvioId([], () => { throw new Error("raw"); }), NuvioIdGenerationError);
	for (const value of [null, 7, "", " padded"]) assert.throws(() => createUniqueNuvioId([], () => value), NuvioIdGenerationError);
	let calls = 0;
	assert.throws(() => createUniqueNuvioId(["same"], () => { calls += 1; return "same"; }), NuvioIdGenerationError);
	assert.equal(calls, 100);
});

test("import preserves usable unique collection and folder IDs exactly", () => {
	const controller = makeController();
	assert.equal(controller.importValue([{ id: "C", title: "C", folders: [{ id: "F", title: "F", sources: [] }] }]).ok, true);
	const collection = controller.getState().project.collections[0];
	assert.equal(collection.editable.id, "C");
	assert.equal(collection.folders[0].editable.id, "F");
});

test("import repairs missing invalid whitespace and duplicate IDs in traversal order", () => {
	const controller = makeController();
	controller.importValue([
		{ id: "same", title: "One", folders: [{ id: "same", title: "F1", sources: [] }, { id: 9, title: "F2", sources: [] }] },
		{ id: " padded ", title: "Two", folders: [] },
	]);
	const [first, second] = controller.getState().project.collections;
	assert.equal(first.editable.id, "same");
	assert.deepEqual(first.folders.map((folder) => folder.editable.id), ["nuvio-1", "nuvio-2"]);
	assert.equal(second.editable.id, "nuvio-3");
});

test("generated repair IDs avoid later preserved and earlier generated values", () => {
	const values = ["preserved", "generated", "generated", "second"];
	const controller = makeController({ nuvioIdFactory: () => values.shift() });
	controller.importValue([{ title: "A", folders: [{ title: "B", sources: [] }] }, { id: "preserved", title: "C", folders: [] }]);
	const [first, second] = controller.getState().project.collections;
	assert.equal(first.editable.id, "generated");
	assert.equal(first.folders[0].editable.id, "second");
	assert.equal(second.editable.id, "preserved");
});

test("repair preserves raw imported values ordering warnings and clean state", () => {
	const controller = makeController();
	controller.importValue([{ id: " bad ", title: "One", folders: [] }, { title: "Two" }]);
	const state = controller.getState();
	assert.equal(state.project.collections[0].rawImported.id, " bad ");
	assert.deepEqual(state.project.collections.map((entry) => entry.editable.title), ["One", "Two"]);
	assert.equal(state.dirty, false);
	assert.ok(state.diagnostics.import.warnings.some((entry) => entry.code === "MISSING_FOLDERS"));
});

test("failed repair retains project selection and dirty state atomically", () => {
	const controller = makeController({ nuvioIdFactory: () => { throw new Error("private"); } });
	controller.importValue([{ id: "valid", title: "Old", folders: [] }]);
	const old = controller.getState().project.collections[0];
	controller.selectNode(old.internalId);
	controller.updateNode(old.internalId, { title: "Dirty" });
	const before = controller.getState();
	const result = controller.importValue([{ title: "New", folders: [] }], { discardChanges: true });
	assert.equal(result.ok, false);
	assert.equal(controller.getState().project, before.project);
	assert.deepEqual(controller.getState().selection, before.selection);
	assert.equal(controller.getState().dirty, true);
	assert.deepEqual(result.errors[0], { code: "NUVIO_ID_GENERATION_FAILED", path: "$controller.nuvioIds", message: "A unique Nuvio collection or folder ID could not be generated." });
});

test("collection and folder creation receive automatic IDs", () => {
	const controller = makeController();
	const collection = controller.createCollection({ editable: { title: "C" } });
	controller.createFolder(collection.createdInternalId, { editable: { title: "F" } });
	const current = controller.getState().project.collections[0];
	assert.equal(current.editable.id, "nuvio-1");
	assert.equal(current.folders[0].editable.id, "nuvio-2");
});

test("creation preserves unique supplied IDs and repairs invalid or duplicate IDs", () => {
	const controller = makeController();
	const collection = controller.createCollection({ editable: { id: "caller", title: "C" } });
	controller.createFolder(collection.createdInternalId, { editable: { id: "caller", title: "F" } });
	const current = controller.getState().project.collections[0];
	assert.equal(current.editable.id, "caller");
	assert.equal(current.folders[0].editable.id, "nuvio-1");
});

test("source creation does not consume Nuvio IDs and factories stay independent", () => {
	let nuvioCalls = 0;
	const controller = makeController({ nuvioIdFactory: () => `nuvio-${++nuvioCalls}` });
	const collection = controller.createCollection({ editable: { title: "C" } });
	const folder = controller.createFolder(collection.createdInternalId, { editable: { title: "F" } });
	const before = nuvioCalls;
	controller.createSource(folder.createdInternalId, { category: "addon", editable: { provider: "addon" } });
	assert.equal(nuvioCalls, before);
	assert.equal(controller.getState().project.collections[0].internalId, "internal-2");
});

test("prepared creation values are detached from caller input", () => {
	const controller = makeController();
	const editable = { title: "C" };
	assert.deepEqual(prepareNewNodeEditable(controller.getState().project, editable, () => "generated"), { title: "C", id: "generated" });
	assert.deepEqual(editable, { title: "C" });
});

test("workspace hides imported generated and internal hierarchy IDs", () => {
	const controller = makeController();
	controller.importValue([{ id: "IMPORTED-UUID", title: "C", folders: [{ title: "F", sources: [] }] }]);
	const folder = controller.getState().project.collections[0].folders[0];
	controller.selectNode(folder.internalId);
	const markup = renderWorkspace(controller);
	for (const hidden of ["IMPORTED-UUID", "nuvio-1", folder.internalId]) assert.equal(markup.includes(hidden), false);
});

test("source TMDB metadata remains visible while collection and folder IDs stay hidden", () => {
	const controller = makeController();
	controller.importValue([{ id: "C-ID", title: "C", folders: [{ id: "F-ID", title: "F", sources: [{ provider: "tmdb", tmdbSourceType: "LIST", tmdbId: "777", mediaType: "MOVIE" }] }] }]);
	const source = controller.getState().project.collections[0].folders[0].sources[0];
	controller.selectNode(source.internalId);
	const markup = renderWorkspace(controller);
	assert.ok(markup.includes("777"));
	assert.equal(markup.includes("C-ID"), false);
	assert.equal(markup.includes("F-ID"), false);
});

test("workspace home and About actions are distinct and welcome omits workspace home action", () => {
	const controller = makeController();
	const workspace = renderWorkspace(controller);
	const welcome = renderToStaticMarkup(createElement(BuilderWelcome, { controller, state: controller.getState(), onEnterWorkspace() {} }));
	assert.ok(workspace.includes('data-action="return-builder-home"'));
	assert.equal((workspace.match(/data-action="open-about-credits"/g) ?? []).length, 1);
	assert.equal(workspace.includes("Back to TMDB ID Lookup"), false);
	assert.ok(welcome.includes('data-action="open-about-credits"'));
	assert.equal(welcome.includes('data-action="return-builder-home"'), false);
});

test("clean reset replaces the controller project and dirty state requires confirmation", () => {
	const controller = makeController();
	const before = controller.getState().project;
	assert.equal(workspaceNeedsDiscardConfirmation(controller.getState()), false);
	assert.equal(resetBuilderWorkspace(controller).ok, true);
	assert.notEqual(controller.getState().project, before);
	controller.createCollection({ editable: { title: "C" } });
	assert.equal(workspaceNeedsDiscardConfirmation(controller.getState()), true);
});

test("reset uses explicit discard permission and contains raw exceptions", () => {
	let options;
	assert.equal(resetBuilderWorkspace({ startNewProject(value) { options = value; return { ok: true }; } }).ok, true);
	assert.deepEqual(options, { title: "Untitled project", discardChanges: true });
	assert.equal(resetBuilderWorkspace({ startNewProject() { throw new Error("raw"); } }).errors[0].code, "CONTROLLER_OPERATION_FAILED");
});

test("successful workspace return holds an exact-once gate through unmount", () => {
	const gate = createWorkspaceReturnGate();
	let resetCalls = 0;
	let successCalls = 0;
	const controller = {
		startNewProject() {
			resetCalls += 1;
			return { ok: true, errors: [], warnings: [] };
		},
	};

	assert.equal(gate.isActive(), false);
	const first = completeWorkspaceReturn({ controller, gate, onSuccess() { successCalls += 1; } });
	const immediateSecond = completeWorkspaceReturn({ controller, gate, onSuccess() { successCalls += 1; } });

	assert.equal(first.ok, true);
	assert.equal(first.started, true);
	assert.equal(gate.isActive(), true);
	assert.deepEqual(immediateSecond, { ok: false, started: false, ignored: true, errors: [], warnings: [] });
	assert.equal(resetCalls, 1);
	assert.equal(successCalls, 1);
});

test("structured workspace return failure releases the gate for one successful retry", () => {
	const gate = createWorkspaceReturnGate();
	let resetCalls = 0;
	let successCalls = 0;
	const controller = {
		startNewProject() {
			resetCalls += 1;
			return resetCalls === 1
				? { ok: false, errors: [{ code: "RESET_BLOCKED", path: "$controller", message: "Try again." }], warnings: [] }
				: { ok: true, errors: [], warnings: [] };
		},
	};

	const failure = completeWorkspaceReturn({ controller, gate, onSuccess() { successCalls += 1; } });
	assert.equal(failure.ok, false);
	assert.equal(failure.started, true);
	assert.equal(gate.isActive(), false);
	assert.equal(successCalls, 0);

	const retry = completeWorkspaceReturn({ controller, gate, onSuccess() { successCalls += 1; } });
	assert.equal(retry.ok, true);
	assert.equal(gate.isActive(), true);
	assert.equal(resetCalls, 2);
	assert.equal(successCalls, 1);
});

test("unexpected workspace return failure is contained and permits retry without raw text", () => {
	const gate = createWorkspaceReturnGate();
	let resetCalls = 0;
	let successCalls = 0;
	const controller = {
		startNewProject() {
			resetCalls += 1;
			if (resetCalls === 1) throw new Error("private reset detail");
			return { ok: true, errors: [], warnings: [] };
		},
	};

	const failure = completeWorkspaceReturn({ controller, gate, onSuccess() { successCalls += 1; } });
	assert.equal(failure.ok, false);
	assert.equal(failure.errors[0].code, "CONTROLLER_OPERATION_FAILED");
	assert.equal(JSON.stringify(failure).includes("private reset detail"), false);
	assert.equal(gate.isActive(), false);
	assert.equal(successCalls, 0);

	assert.equal(completeWorkspaceReturn({ controller, gate, onSuccess() { successCalls += 1; } }).ok, true);
	assert.equal(resetCalls, 2);
	assert.equal(successCalls, 1);
});

test("clean and dirty workspace return decisions keep Stay and Discard paths distinct", () => {
	let confirmationCalls = 0;
	let completionCalls = 0;
	assert.deepEqual(requestWorkspaceReturn({
		state: { dirty: false },
		onConfirm() { confirmationCalls += 1; },
		onComplete() { completionCalls += 1; },
	}), { action: "complete" });
	assert.equal(confirmationCalls, 0);
	assert.equal(completionCalls, 1);

	assert.deepEqual(requestWorkspaceReturn({
		state: { dirty: true },
		onConfirm() { confirmationCalls += 1; },
		onComplete() { completionCalls += 1; },
	}), { action: "confirm" });
	assert.equal(confirmationCalls, 1);
	assert.equal(completionCalls, 1);

	const gate = createWorkspaceReturnGate();
	let resetCalls = 0;
	let successCalls = 0;
	const controller = { startNewProject() { resetCalls += 1; return { ok: true, errors: [], warnings: [] }; } };
	completeWorkspaceReturn({ controller, gate, onSuccess() { successCalls += 1; } });
	completeWorkspaceReturn({ controller, gate, onSuccess() { successCalls += 1; } });
	assert.equal(resetCalls, 1);
	assert.equal(successCalls, 1);
});

test("confirmation markup associates its description and locks only workspace controls", () => {
	const controller = makeController();
	const created = controller.createCollection({ editable: { title: "C" } });
	controller.selectNode(created.createdInternalId);
	const collection = controller.getState().project.collections[0];
	const markup = renderWorkspace(controller, { initialReturnConfirmationOpen: true });
	const confirmation = openingTag(markup, "data-return-confirmation");

	assert.equal(markup.match(/data-return-confirmation/g)?.length, 1);
	assert.ok(confirmation.includes('aria-labelledby="return-confirmation-title"'));
	assert.ok(confirmation.includes('aria-describedby="return-confirmation-description"'));
	assert.equal(markup.match(/id="return-confirmation-title"/g)?.length, 1);
	assert.equal(markup.match(/id="return-confirmation-description"/g)?.length, 1);
	assert.equal(openingTag(markup, 'data-action="stay-in-workspace"').includes("disabled"), false);
	assert.equal(openingTag(markup, 'data-action="discard-and-return"').includes("disabled"), false);
	assert.equal(openingTag(markup, 'data-action="return-builder-home"').includes("disabled"), true);
	assert.equal(openingTag(markup, 'data-node-type="collection"').includes("disabled"), true);
	assert.equal(openingTag(markup, 'data-action="create-collection"').includes("disabled"), true);
	assert.equal(confirmation.includes('role="dialog"'), false);

	const editorMarkup = renderWorkspace(controller, { initialEditorDraft: createNodeEditorDraft(collection) });
	assert.equal(openingTag(editorMarkup, 'data-action="return-builder-home"').includes("disabled"), true);
});

test("collection and folder empty states expose real creation buttons", () => {
	const controller = makeController();
	const collectionMarkup = renderWorkspace(controller);
	assert.ok(openingTag(collectionMarkup, 'data-action="create-collection-empty"').includes('aria-label="New collection"'));
	const collection = controller.createCollection({ editable: { title: "C" } });
	controller.selectNode(collection.createdInternalId);
	const folderMarkup = renderWorkspace(controller);
	assert.ok(openingTag(folderMarkup, 'data-action="create-folder-empty"').includes('aria-label="New folder"'));
});

test("source empty state exposes the approved selected-folder Add Source actions", () => {
	const controller = makeController();
	const collection = controller.createCollection({ editable: { title: "C" } });
	const folder = controller.createFolder(collection.createdInternalId, { editable: { title: "F" } });
	controller.selectNode(folder.createdInternalId);
	const markup = renderWorkspace(controller);
	assert.ok(markup.includes("No sources in this folder yet"));
	assert.ok(markup.includes("Add a source to begin."));
	assert.equal(markup.includes("Add a supported TMDB source to begin."), false);
	assert.ok(markup.includes('data-action="add-source"'));
	assert.ok(markup.includes('data-action="add-source-empty"'));
	assert.ok(markup.includes("Add source"));
	assert.equal(markup.includes("empty-state-mark"), false);
	assert.equal(markup.includes('data-action="create-source'), false);
});

test("confirmation contract has stable markers locking and no route or browser confirmation", () => {
	const source = fs.readFileSync(path.join(rootDir, "builder", "src", "ui", "BuilderWorkspace.jsx"), "utf8");
	for (const marker of ["data-return-confirmation", "stay-in-workspace", "discard-and-return", "return-builder-home", "modalLocked || returnConfirmationOpen"]) assert.ok(source.includes(marker));
	for (const forbidden of ["window.confirm", "history.", "location.", "react-router"]) assert.equal(source.includes(forbidden), false);
});

test("welcome uses collection-focused wording while retaining literal file-picker language", () => {
	const controller = makeController();
	const welcome = renderToStaticMarkup(createElement(BuilderWelcome, { controller, state: controller.getState(), onEnterWorkspace() {} }));
	for (const text of [
		"Create, import and organise Nuvio collections.",
		"Start a new collection",
		"Create new collection",
		"Open an existing collection",
		"Choose a JSON file or paste its contents to continue.",
		"Choose a JSON file",
		"Collection JSON file",
		"Import selected file",
		"No file selected",
	]) {
		assert.ok(welcome.includes(text), text);
	}
	const workspace = renderWorkspace(controller);
	for (const hidden of ["Current project", "Untitled project", "Unsaved changes", "Clean draft"]) assert.equal(workspace.includes(hidden), false);
});
