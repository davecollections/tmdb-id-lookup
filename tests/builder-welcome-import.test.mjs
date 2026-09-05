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
	importJsonFile,
	importPastedJson,
	MAX_IMPORT_FILE_BYTES,
	projectTitleFromFilename,
	startNewBuilderProject,
	validateImportFile,
} from "../builder/src/ui/import-actions.js";
import {
	createWelcomeActionGate,
	runWelcomeAction,
} from "../builder/src/ui/welcome-action-coordinator.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(rootDir, "tests", "fixtures", "nuvio");
const vite = await createServer({
	root: path.join(rootDir, "builder"),
	appType: "custom",
	logLevel: "silent",
	server: { middlewareMode: true },
});
const { BuilderApp } = await vite.ssrLoadModule("/src/ui/BuilderApp.jsx");
after(() => vite.close());

function countingIdFactory(prefix = "welcome") {
	let count = 0;
	return () => `${prefix}-${++count}`;
}

function createController(options = {}) {
	return createBuilderController({
		idFactory: countingIdFactory(),
		initialProjectTitle: "Untitled project",
		...options,
	});
}

function loadFixture(relativePath) {
	return JSON.parse(fs.readFileSync(path.join(fixtureRoot, relativePath), "utf8"));
}

function read(relativePath) {
	return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function render(controller, props = {}) {
	return renderToStaticMarkup(createElement(BuilderApp, { controller, ...props }));
}

function fakeFile({ name = "collection.json", type = "application/json", size = 2, text = "[]" } = {}) {
	return {
		name,
		type,
		size,
		text: async () => text,
	};
}

function deferred() {
	let resolve;
	const promise = new Promise((resolvePromise) => {
		resolve = resolvePromise;
	});
	return { promise, resolve };
}

function assertDiagnostic(result, code, message) {
	assert.equal(result.ok, false);
	assert.deepEqual(result.errors, [{ code, path: "$ui.import", message }]);
	assert.deepEqual(result.warnings, []);
	assert.deepEqual(Object.keys(result.errors[0]).sort(), ["code", "message", "path"]);
}

function renderedIds(markup) {
	return [...markup.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
}

test("production welcome uses collection-focused startup copy and retains literal file-picker terms", () => {
	const markup = render(createController());
	for (const text of [
		"Development preview",
		"Dingo",
		"Collection Builder",
		"Built for Nuvio collections",
		"Create, import and organise Nuvio collections.",
		"Start a new collection",
		"Open a clean workspace and build your Nuvio collection.",
		"Create new collection",
		"Open an existing collection",
		"Choose a JSON file or paste its contents to continue.",
		"Choose a JSON file",
		"Collection JSON file",
		"Import selected file",
		"No file selected",
		"Import pasted JSON",
		"processed locally in this browser and is not uploaded",
	]) {
		assert.ok(markup.includes(text), text);
	}
	for (const oldText of [
		"Create, import and organise collection files using TMDB-powered sources and Nuvio-compatible structures.",
		"Begin with a clean collection file",
		"Open an empty workspace for a new Nuvio collection file.",
		"Start a new collection file",
		"Open an existing collection JSON",
		"Choose a local file or paste its JSON text. Import begins only when you confirm an action.",
	]) {
		assert.equal(markup.includes(oldText), false, oldText);
	}
	assert.match(markup, /<main[^>]+data-builder-welcome="true"/);
	assert.equal((markup.match(/<h1/g) ?? []).length, 1);
	assert.match(markup, /<h1 class="builder-product-title"><span>Dingo(?:'|&#x27;)s<\/span><span>Collection Builder<\/span><\/h1>/);
	assert.equal(markup.includes("TMDB Collection Builder"), false);
	assert.equal(markup.includes("data-panel=\"collections\""), false);
	assert.equal(markup.includes("Nuvio Collection Builder"), false);
});

test("welcome renders stable actions, import markers, and the About control", () => {
	const markup = render(createController());
	for (const marker of [
		'data-action="start-new-project"',
		'data-action="import-file"',
		'data-action="import-pasted-json"',
		'data-import-control="file"',
		'data-import-control="pasted-json"',
	]) {
		assert.ok(markup.includes(marker), marker);
	}
	assert.match(markup, /<button[^>]+data-action="open-about-credits"/);
	assert.match(markup, />About<\/button>/);
	assert.equal(markup.includes("Back to TMDB ID Lookup"), false);
});

test("welcome forms are labelled, described, semantic, and ID-safe", () => {
	const markup = render(createController());
	assert.match(markup, /<label[^>]+for="builder-import-file"/);
	assert.match(markup, /<input[^>]+accept="\.json,application\/json"/);
	assert.match(markup, /aria-describedby="file-import-guidance selected-file-name"/);
	assert.match(markup, /<label[^>]+for="builder-import-text"/);
	assert.match(markup, /<textarea[^>]+aria-describedby="pasted-import-guidance"/);
	assert.ok(markup.includes("No file selected"));
	assert.ok(markup.includes('aria-busy="false"'));
	const ids = renderedIds(markup);
	assert.equal(ids.length, new Set(ids).size);
	for (const target of ["file-import-guidance", "selected-file-name", "pasted-import-guidance"]) {
		assert.equal(ids.filter((id) => id === target).length, 1);
	}
});

test("explicit workspace rendering retains the shell with corrected branding", () => {
	const markup = render(createController(), { initialScreen: "workspace" });
	assert.match(markup, /<main[^>]+data-builder-shell="true"/);
	assert.match(markup, /<h1 class="builder-product-title"><span>Dingo(?:'|&#x27;)s<\/span><span>Collection Builder<\/span><\/h1>/);
	assert.equal(markup.includes("TMDB Collection Builder"), false);
	assert.ok(markup.includes("Built for Nuvio collections"));
	assert.ok(markup.includes("New collection"));
	assert.equal(markup.includes("data-builder-welcome"), false);
	assert.equal((markup.match(/<h1/g) ?? []).length, 1);
});

test("start-new helper creates one clean empty project through the controller", () => {
	const controller = createController();
	controller.createCollection({ editable: { id: "old", title: "Old" } });
	const result = controller.startNewProject({ title: "Temporary", discardChanges: true });
	assert.equal(result.ok, true);
	const started = startNewBuilderProject(controller);
	assert.equal(started.ok, true);
	assert.equal(controller.getState().project.editable.title, "Untitled project");
	assert.deepEqual(controller.getState().project.collections, []);
	assert.equal(controller.getState().dirty, false);
	assert.deepEqual(controller.getState().selection, {
		collectionInternalId: null,
		folderInternalId: null,
		sourceInternalId: null,
	});
});

test("start-new helper returns structured controller failure without partial creation", () => {
	let call = 0;
	const controller = createBuilderController({ idFactory: () => (call++ === 0 ? "initial" : "") });
	const before = controller.getState().project;
	const result = startNewBuilderProject(controller);
	assert.equal(result.ok, false);
	assert.equal(result.errors[0].code, "CONTROLLER_OPERATION_FAILED");
	assert.equal(controller.getState().project, before);
	assert.deepEqual(controller.getState().project.collections, []);
});

test("welcome action gate synchronously rejects overlap and permits a later action after release", () => {
	const gate = createWelcomeActionGate();
	assert.equal(gate.isActive(), false);
	assert.equal(gate.tryAcquire(), true);
	assert.equal(gate.isActive(), true);
	assert.equal(gate.tryAcquire(), false);
	gate.release();
	assert.equal(gate.isActive(), false);
	assert.equal(gate.tryAcquire(), true);
	gate.release();
	assert.equal(gate.isActive(), false);
});

test("welcome action runner releases structured and unexpected failures for retry", async () => {
	const gate = createWelcomeActionGate();
	const busyStates = [];
	const failures = [];
	let transitions = 0;
	const base = {
		gate,
		setBusyAction: (value) => busyStates.push(value),
		onFailure: (result) => failures.push(result.errors[0].code),
		onEnterWorkspace: () => { transitions += 1; },
	};

	const structured = await runWelcomeAction({
		...base,
		actionName: "file",
		action: () => ({ ok: false, errors: [{ code: "EXPECTED" }], warnings: [] }),
	});
	assert.equal(structured.started, true);
	assert.equal(structured.ok, false);
	assert.deepEqual(failures, ["EXPECTED"]);
	assert.equal(gate.isActive(), false);

	const rejected = await runWelcomeAction({
		...base,
		actionName: "file",
		action: async () => { throw new Error("PRIVATE_FAILURE"); },
	});
	assert.deepEqual(rejected, { started: true, ok: false });
	assert.equal(JSON.stringify(rejected).includes("PRIVATE_FAILURE"), false);
	assert.equal(gate.isActive(), false);

	const retry = await runWelcomeAction({
		...base,
		actionName: "pasted",
		action: () => ({ ok: true, errors: [], warnings: [] }),
	});
	assert.equal(retry.ok, true);
	assert.equal(transitions, 1);
	assert.equal(gate.isActive(), false);
	assert.deepEqual(busyStates, ["file", null, "file", null, "pasted", null]);
});

test("delayed file import keeps the gate active and is the only controller mutation", async () => {
	const gate = createWelcomeActionGate();
	const delayedRead = deferred();
	const mutations = [];
	let transitions = 0;
	const controller = {
		importJsonText(text, options) {
			mutations.push({ action: "file", text, options });
			return { ok: true, errors: [], warnings: [] };
		},
	};
	const file = fakeFile({ name: "delayed-project.json" });
	file.text = () => delayedRead.promise;

	const fileRun = runWelcomeAction({
		gate,
		actionName: "file",
		setBusyAction: () => {},
		action: () => importJsonFile(controller, file),
		onEnterWorkspace: () => { transitions += 1; },
	});
	assert.equal(gate.isActive(), true);

	const rivalRun = await runWelcomeAction({
		gate,
		actionName: "start",
		setBusyAction: () => {},
		action: () => {
			mutations.push({ action: "start" });
			return { ok: true, errors: [], warnings: [] };
		},
		onEnterWorkspace: () => { transitions += 1; },
	});
	assert.deepEqual(rivalRun, { started: false, ok: false });
	assert.deepEqual(mutations, []);

	delayedRead.resolve('[{"id":"one","title":"One","folders":[]}]');
	const fileResult = await fileRun;
	assert.equal(fileResult.ok, true);
	assert.deepEqual(mutations, [{
		action: "file",
		text: '[{"id":"one","title":"One","folders":[]}]',
		options: { projectTitle: "delayed-project" },
	}]);
	assert.equal(transitions, 1);
	assert.equal(gate.isActive(), false);
});

test("pasted import sequencing paints busy before parsing and transitions after release", async () => {
	const sequence = [];
	const innerGate = createWelcomeActionGate();
	const gate = {
		tryAcquire() {
			const acquired = innerGate.tryAcquire();
			if (acquired) sequence.push("gate acquired");
			return acquired;
		},
		release() {
			innerGate.release();
			sequence.push("gate released");
		},
	};

	const result = await runWelcomeAction({
		gate,
		actionName: "pasted",
		setBusyAction: (value) => sequence.push(value ? `busy ${value}` : "busy cleared"),
		beforeAction: async () => { sequence.push("browser task yielded"); },
		action: () => {
			sequence.push("controller pasted import");
			return { ok: true, errors: [], warnings: [] };
		},
		onSuccess: () => sequence.push("local input cleared"),
		onEnterWorkspace: () => sequence.push("workspace entered"),
	});

	assert.equal(result.ok, true);
	assert.deepEqual(sequence, [
		"gate acquired",
		"busy pasted",
		"browser task yielded",
		"controller pasted import",
		"local input cleared",
		"gate released",
		"busy cleared",
		"workspace entered",
	]);
});

test("pasted import passes original text and builder-only title to the controller", () => {
	const calls = [];
	const controller = {
		importJsonText(text, options) {
			calls.push({ text, options });
			return { ok: true, errors: [], warnings: [] };
		},
	};
	const text = "  [ ]  \n";
	const result = importPastedJson(controller, text);
	assert.equal(result.ok, true);
	assert.deepEqual(calls, [{ text, options: { projectTitle: "Imported project" } }]);
});

test("valid pasted mixed-source import remains clean and preserves hierarchy evidence", () => {
	const controller = createController();
	const fixture = loadFixture("valid/mixed-native-and-addon.json");
	const result = importPastedJson(controller, JSON.stringify(fixture));
	assert.equal(result.ok, true);
	assert.equal(controller.getState().dirty, false);
	const folder = controller.getState().project.collections[0].folders[0];
	assert.deepEqual(folder.sources.map((source) => source.category), ["native-tmdb", "addon"]);
	assert.deepEqual(
		folder.sources.map((source) => source.editable.title),
		fixture[0].folders[0].sources.map((source) => source.title),
	);
	assert.deepEqual(folder.rawImported.sources, fixture[0].folders[0].sources);
	assert.notEqual(controller.getState().migrationPreview.status, "available");
});

test("empty pasted input returns the stable UI diagnostic without calling the controller", () => {
	let calls = 0;
	const result = importPastedJson({ importJsonText: () => { calls += 1; } }, " \n\t ");
	assertDiagnostic(
		result,
		"IMPORT_TEXT_REQUIRED",
		"Paste a Nuvio collection JSON document before importing.",
	);
	assert.equal(calls, 0);
});

test("malformed pasted JSON returns the controller error and keeps the prior project atomically", () => {
	const controller = createController();
	controller.importValue([{ id: "kept", title: "Kept", folders: [] }]);
	const before = controller.getState().project;
	const result = importPastedJson(controller, "[{]");
	assert.equal(result.ok, false);
	assert.equal(result.errors[0].code, "JSON_PARSE_ERROR");
	assert.equal(result.errors[0].message, "The input is not valid JSON.");
	assert.equal(controller.getState().project, before);
	assert.equal(JSON.stringify(result).includes("SyntaxError"), false);
});

test("filename title derivation is deterministic", () => {
	assert.deepEqual([
		projectTitleFromFilename("collections.json"),
		projectTitleFromFilename("COLLECTIONS.JSON"),
		projectTitleFromFilename(" my collections.json "),
		projectTitleFromFilename(".json"),
		projectTitleFromFilename(""),
		projectTitleFromFilename(null),
	], [
		"collections",
		"COLLECTIONS",
		"my collections",
		"Imported project",
		"Imported project",
		"Imported project",
	]);
});

test("file validation accepts supported extension and MIME combinations", () => {
	for (const file of [
		fakeFile({ name: "collection.json", type: "" }),
		fakeFile({ name: "collection.txt", type: "application/json" }),
		fakeFile({ name: "COLLECTION.JSON", type: "text/plain" }),
		fakeFile({ name: "limit.json", size: MAX_IMPORT_FILE_BYTES }),
	]) {
		assert.deepEqual(validateImportFile(file), { ok: true, errors: [], warnings: [] });
	}
});

test("file validation rejects a missing file with a stable diagnostic", () => {
	assertDiagnostic(
		validateImportFile(null),
		"IMPORT_FILE_REQUIRED",
		"Choose a JSON file before importing.",
	);
});

test("file validation rejects unsupported files with a stable diagnostic", () => {
	for (const file of [
		fakeFile({ name: "collection.txt", type: "text/plain" }),
		fakeFile({ name: "collection", type: "" }),
	]) {
		assertDiagnostic(
			validateImportFile(file),
			"UNSUPPORTED_IMPORT_FILE",
			"Choose a JSON file to import.",
		);
	}
});

test("file validation enforces the 10 MiB maximum", () => {
	assert.equal(MAX_IMPORT_FILE_BYTES, 10 * 1024 * 1024);
	assertDiagnostic(
		validateImportFile(fakeFile({ size: MAX_IMPORT_FILE_BYTES + 1 })),
		"IMPORT_FILE_TOO_LARGE",
		"Choose a JSON file smaller than 10 MiB.",
	);
});

test("file import reads text once and passes its filename-derived project title", async () => {
	const calls = [];
	let reads = 0;
	const controller = {
		importJsonText(text, options) {
			calls.push({ text, options });
			return { ok: true, errors: [], warnings: [] };
		},
	};
	const file = fakeFile({ name: " my collections.JSON ", text: "[ ]" });
	file.text = async () => { reads += 1; return "[ ]"; };
	const result = await importJsonFile(controller, file);
	assert.equal(result.ok, true);
	assert.equal(reads, 1);
	assert.deepEqual(calls, [{ text: "[ ]", options: { projectTitle: "my collections" } }]);
});

test("successful file import preserves collection titles and leaves the project clean", async () => {
	const controller = createController();
	const fixture = loadFixture("valid/mixed-native-and-addon.json");
	const result = await importJsonFile(controller, fakeFile({
		name: "local-project.json",
		text: JSON.stringify(fixture),
	}));
	assert.equal(result.ok, true);
	assert.equal(controller.getState().project.editable.title, "local-project");
	assert.equal(controller.getState().project.collections[0].editable.title, fixture[0].title);
	assert.equal(controller.getState().dirty, false);
});

test("file read rejection returns a stable diagnostic without raw exception data", async () => {
	const file = fakeFile();
	file.text = async () => { throw new Error("PRIVATE_BROWSER_DETAIL"); };
	const result = await importJsonFile(createController(), file);
	assertDiagnostic(
		result,
		"IMPORT_FILE_READ_FAILED",
		"The selected JSON file could not be read.",
	);
	assert.equal(JSON.stringify(result).includes("PRIVATE_BROWSER_DETAIL"), false);
});

test("non-string file reads return the same stable read diagnostic", async () => {
	const result = await importJsonFile(createController(), fakeFile({ text: { raw: true } }));
	assertDiagnostic(
		result,
		"IMPORT_FILE_READ_FAILED",
		"The selected JSON file could not be read.",
	);
});

test("controller file-import failure retains the prior project and returns no raw exception", async () => {
	const controller = createController();
	controller.importValue([{ id: "kept", title: "Kept", folders: [] }]);
	const before = controller.getState().project;
	const result = await importJsonFile(controller, fakeFile({ text: "not json" }));
	assert.equal(result.ok, false);
	assert.equal(result.errors[0].code, "JSON_PARSE_ERROR");
	assert.equal(controller.getState().project, before);
	assert.deepEqual(Object.keys(result.errors[0]).sort(), ["code", "message", "path"]);
});

test("successful importer warnings enter workspace as collapsed bounded details", () => {
	const controller = createController();
	const result = importPastedJson(controller, '[{"id":"one","title":"One"}]');
	assert.equal(result.ok, true);
	assert.equal(result.warnings[0].code, "MISSING_FOLDERS");
	const markup = render(controller, { initialScreen: "workspace" });
	assert.match(markup, /<details class="import-warning-summary">/);
	assert.ok(markup.includes("Imported with 1 warning"));
	assert.ok(markup.includes("MISSING_FOLDERS"));
	assert.equal(markup.includes("<details class=\"import-warning-summary\" open"), false);
	assert.match(read("builder/src/styles.css"), /\.import-warning-summary ul[\s\S]*max-height:[\s\S]*overflow:\s*auto/);
});

test("workspace omits the warning panel when import warnings are absent", () => {
	const controller = createController();
	importPastedJson(controller, "[]");
	const markup = render(controller, { initialScreen: "workspace" });
	assert.equal(markup.includes("import-warning-summary"), false);
	assert.equal(markup.includes("Imported with"), false);
});

test("welcome renders controller diagnostics safely without imported JSON or parser internals", () => {
	const controller = createController();
	const rawText = "PRIVATE_IMPORTED_JSON_[{]";
	controller.importJsonText(rawText);
	const markup = render(controller);
	assert.match(markup, /role="alert"/);
	assert.ok(markup.includes("The input is not valid JSON."));
	assert.ok(markup.includes("JSON_PARSE_ERROR"));
	assert.equal(markup.includes(rawText), false);
	assert.equal(markup.includes("SyntaxError"), false);
});

test("screen state remains UI-only while the controller subscription stays above both screens", () => {
	const app = read("builder/src/ui/BuilderApp.jsx");
	const hookCall = app.indexOf("useBuilderControllerState(controller)");
	const screenState = app.indexOf("useState(initialScreen");
	assert.ok(hookCall >= 0 && hookCall < screenState);
	assert.match(app, /screen === "workspace"/);
	assert.doesNotMatch(app, /createBuilderController|history\.|pushState|replaceState/);
	const welcome = read("builder/src/ui/BuilderWelcome.jsx");
	assert.equal((welcome.match(/useState\(/g) ?? []).length, 5);
	assert.doesNotMatch(welcome, /setProject|setCollections|setFolders|setSources|setSnapshot/);
});

test("production keeps one module-scope controller and passes no test screen override", () => {
	const main = read("builder/src/main.jsx");
	assert.equal((main.match(/createBuilderController\(\{/g) ?? []).length, 1);
	assert.ok(main.indexOf("const controller") < main.indexOf("createRoot("));
	assert.match(main, /<BuilderApp controller=\{controller\} \/>/);
	assert.doesNotMatch(main, /initialScreen/);
});

test("welcome/import production code stays local-only and browser-safe", () => {
	const source = [
		read("builder/src/ui/BuilderApp.jsx"),
		read("builder/src/ui/BuilderWelcome.jsx"),
		read("builder/src/ui/import-actions.js"),
		read("builder/src/ui/welcome-action-coordinator.js"),
	].join("\n");
	for (const forbidden of [
		/from\s+["']node:/,
		/\bfetch\b/,
		/XMLHttpRequest/,
		/WebSocket/,
		/sendBeacon/,
		/localStorage/,
		/IndexedDB|indexedDB/,
		/showOpenFilePicker/,
		/drag(?:start|over|enter|leave|drop)/i,
		/createObjectURL/,
		/dangerouslySetInnerHTML/,
		/https?:\/\//,
		/console\.(?:log|info|warn|error)/,
		/JSON\.parse/,
		/FormData/,
	]) {
		assert.doesNotMatch(source, forbidden);
	}
});

test("welcome styles protect mobile widths, file wrapping, touch targets, and desktop balance", () => {
	const styles = read("builder/src/styles.css");
	assert.match(styles, /\.builder-welcome[\s\S]*width:\s*min\(100%,\s*1120px\)/);
	assert.match(styles, /\.file-input[\s\S]*width:\s*100%[\s\S]*min-width:\s*0/);
	assert.match(styles, /\.selected-file strong[\s\S]*overflow-wrap:\s*anywhere/);
	assert.match(styles, /\.welcome-primary-action,[\s\S]*\.import-action[\s\S]*min-height:\s*48px/);
	assert.match(styles, /@media \(min-width: 760px\)/);
	assert.match(styles, /@media \(min-width: 900px\)[\s\S]*\.import-grid[\s\S]*grid-template-columns/);
	assert.match(styles, /input:focus-visible/);
	assert.match(styles, /textarea:focus-visible/);
});

test("branding metadata, README naming, and Pages markers are corrected narrowly", () => {
	const html = read("builder/index.html");
	assert.match(html, /<title>Dingo's Collection Builder<\/title>/);
	assert.ok(html.includes("Loading Dingo's Collection Builder…"));
	assert.equal(html.includes("TMDB Collection Builder"), false);
	assert.match(html, /noindex, nofollow/);
	const readme = read("README.md");
	assert.match(readme, /## Dingo's Collection Builder/);
	assert.equal(readme.includes("## TMDB Collection Builder"), false);
	assert.equal(readme.includes("## Nuvio Collection Builder"), false);
	assert.equal(readme.includes("development placeholder"), false);
	assert.ok(readme.includes("development-preview welcome and collection-building interface"));
	const validator = read("scripts/validate-pages-site.mjs");
	assert.ok(validator.includes('builderJavaScript.includes("Dingo\'s Collection Builder")'));
	assert.ok(validator.includes('builderJavaScript.includes("data-builder-welcome")'));
});

test("welcome source contains busy and disabled behavior without routes or deferred controls", () => {
	const welcomeSource = read("builder/src/ui/BuilderWelcome.jsx");
	const source = `${welcomeSource}\n${read("builder/src/ui/BuilderWorkspace.jsx")}`;
	assert.doesNotMatch(welcomeSource, /ExportCollectionsDialog|Copy JSON|Download JSON/);
	assert.match(source, /aria-busy=\{isBusy\}/);
	assert.match(source, /aria-busy=\{busyAction === "file"\}/);
	assert.match(source, /aria-busy=\{busyAction === "pasted"\}/);
	assert.equal((source.match(/disabled=\{isBusy\}/g) ?? []).length, 6);
	for (const controlPattern of [
		/data-action="start-new-project"[\s\S]{0,120}disabled=\{isBusy\}/,
		/data-import-control="file"[\s\S]{0,160}disabled=\{isBusy\}/,
		/data-action="import-file"[\s\S]{0,100}disabled=\{isBusy\}/,
		/data-import-control="pasted-json"[\s\S]{0,140}disabled=\{isBusy\}/,
		/data-action="import-pasted-json"[\s\S]{0,100}disabled=\{isBusy\}/,
		/data-action="open-about-credits"[\s\S]{0,160}disabled=\{isBusy\}/,
	]) {
		assert.match(source, controlPattern);
	}
	assert.equal((source.match(/actionGateRef\.current\.isActive\(\)/g) ?? []).length, 2);
	assert.doesNotMatch(source, /disabled=\{busyAction ===/);
	assert.match(source, /beforeAction:\s*yieldToBrowser/);
	for (const deferred of [
		"Download",
		"Copy JSON",
		"Apply Migration",
		"Create source",
		"Delete collection",
		"Open another file",
	]) {
		assert.equal(source.includes(deferred), false, deferred);
	}
	assert.doesNotMatch(source, /react-router|ReactRouter|pushState|replaceState/);
});
