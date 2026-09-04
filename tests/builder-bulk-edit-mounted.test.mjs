import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { before } from "node:test";
import { fileURLToPath } from "node:url";

import react from "../builder/node_modules/@vitejs/plugin-react/dist/index.js";
import { createServer } from "../builder/node_modules/vite/dist/node/index.js";
import { extractTmdbProxyBaseUrl } from "../builder/build-config.js";
import { NUVIO_INVISIBLE_TITLE } from "../builder/src/nuvio/titles.js";
import {
	cleanupMountedBrowser,
	connectDevTools,
	createBoundedStderrCapture,
	createBrowserProcessTree,
	resolveDevToolsStartupTimeout,
	runWithLifecycleCleanup,
	waitForDevToolsEndpoint,
} from "./helpers/mounted-browser-lifecycle.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const builderModules = path.join(rootDir, "builder", "node_modules");
const tmdbProxyBaseUrl = extractTmdbProxyBaseUrl(fs.readFileSync(path.join(rootDir, "js", "config.js"), "utf8"));
const expectedConfirmation = "This will replace the current titles. Make sure you’re happy to lose those names before continuing, as this action cannot be undone.";

function chromeExecutable() {
	const candidates = [
		process.env.CHROME_PATH,
		"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
		"C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
		"/usr/bin/google-chrome",
		"/usr/bin/chromium",
		"/usr/bin/chromium-browser",
		"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
	].filter(Boolean);
	const executable = candidates.find((candidate) => fs.existsSync(candidate));
	if (!executable) throw new Error("Chrome or Chromium is required for mounted Bulk Edit regressions.");
	return executable;
}

async function waitForJson(url, timeoutMs = 10000) {
	const deadline = Date.now() + timeoutMs;
	let lastError = null;
	while (Date.now() < deadline) {
		try {
			const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
			if (response.ok) return response.json();
			lastError = new Error(`HTTP ${response.status}`);
		} catch (error) {
			lastError = error;
		}
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
	throw new Error(`Chrome DevTools did not become available: ${lastError?.message ?? "timeout"}`);
}

async function evaluate(connection, expression) {
	const response = await connection.command("Runtime.evaluate", {
		expression,
		awaitPromise: true,
		returnByValue: true,
	});
	if (response.exceptionDetails) {
		throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
	}
	return response.result?.value;
}

async function runMountedPage() {
	const resources = {
		browserExecutable: null,
		browserProcess: null,
		browserStderrCapture: null,
		browserConnection: null,
		pageConnection: null,
		processTree: null,
		profileDir: null,
		vite: null,
		viteCacheDir: null,
	};
	const execution = await runWithLifecycleCleanup(async () => {
		resources.viteCacheDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "builder-bulk-edit-vite-"));
		resources.vite = await createServer({
			root: rootDir,
			cacheDir: resources.viteCacheDir,
			configFile: false,
			appType: "spa",
			logLevel: "silent",
			plugins: [react()],
			define: {
				__TMDB_PROXY_BASE_URL__: JSON.stringify(tmdbProxyBaseUrl),
				__TMDB_STUDIO_MOCK_COUNTS__: "false",
				__TMDB_NETWORK_MOCK_COUNTS__: "false",
			},
			resolve: {
				alias: [
					{ find: /^react$/, replacement: path.join(builderModules, "react", "index.js") },
					{ find: /^react\/jsx-runtime$/, replacement: path.join(builderModules, "react", "jsx-runtime.js") },
					{ find: /^react-dom$/, replacement: path.join(builderModules, "react-dom", "index.js") },
					{ find: /^react-dom\/client$/, replacement: path.join(builderModules, "react-dom", "client.js") },
				],
			},
			server: { host: "127.0.0.1", port: 0 },
		});
		await resources.vite.listen();

		resources.profileDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "builder-bulk-edit-mounted-"));
		resources.browserExecutable = chromeExecutable();
		resources.browserProcess = spawn(resources.browserExecutable, [
			"--headless=new",
			"--disable-background-networking",
			"--disable-component-update",
			"--disable-dev-shm-usage",
			"--disable-gpu",
			"--hide-scrollbars",
			"--no-first-run",
			"--no-sandbox",
			"--remote-debugging-address=127.0.0.1",
			"--remote-debugging-port=0",
			`--user-data-dir=${resources.profileDir}`,
			"about:blank",
		], {
			detached: process.platform !== "win32",
			stdio: ["ignore", "ignore", "pipe"],
			windowsHide: true,
		});
		resources.browserStderrCapture = createBoundedStderrCapture(resources.browserProcess.stderr);
		await new Promise((resolve, reject) => {
			resources.browserProcess.once("spawn", resolve);
			resources.browserProcess.once("error", reject);
		});
		resources.processTree = createBrowserProcessTree({ rootPid: resources.browserProcess.pid });

		const endpoint = await waitForDevToolsEndpoint({
			profileDir: resources.profileDir,
			browserProcess: resources.browserProcess,
			browserExecutable: resources.browserExecutable,
			stderrCapture: resources.browserStderrCapture,
			timeoutMs: resolveDevToolsStartupTimeout(process.env.DEVTOOLS_STARTUP_MS),
		});
		resources.browserStderrCapture.stop();
		resources.browserStderrCapture = null;
		resources.browserConnection = await connectDevTools(endpoint.browserWebSocketUrl);
		const targets = await waitForJson(`http://127.0.0.1:${endpoint.port}/json/list`);
		const target = targets.find((entry) => entry.type === "page");
		if (!target?.webSocketDebuggerUrl) throw new Error("Chrome page target is unavailable.");
		resources.pageConnection = await connectDevTools(target.webSocketDebuggerUrl, { commandTimeoutMs: 30000 });
		await resources.pageConnection.command("Page.enable");
		await resources.pageConnection.command("Runtime.enable");
		const address = resources.vite.httpServer.address();
		await resources.pageConnection.command("Page.navigate", {
			url: `http://127.0.0.1:${address.port}/tests/fixtures/builder-bulk-edit-mounted.html`,
		});

		const deadline = Date.now() + 30000;
		while (Date.now() < deadline) {
			const status = await evaluate(resources.pageConnection, "window.__builderBulkEditMounted ?? null");
			if (status?.status === "error") throw new Error(status.message);
			if (status?.status === "complete") break;
			await new Promise((resolve) => setTimeout(resolve, 50));
		}
		const mounted = await evaluate(resources.pageConnection, "window.__builderBulkEditMounted ?? null");
		if (mounted?.status !== "complete") throw new Error("Mounted Bulk Edit regressions timed out.");

		await evaluate(resources.pageConnection, `document.querySelector('[data-bulk-edit-field="layout"] input[value="NO_CHANGE"]').focus()`);
		await resources.pageConnection.command("Input.dispatchKeyEvent", {
			type: "keyDown",
			key: "ArrowRight",
			code: "ArrowRight",
			windowsVirtualKeyCode: 39,
			nativeVirtualKeyCode: 39,
		});
		await resources.pageConnection.command("Input.dispatchKeyEvent", {
			type: "keyUp",
			key: "ArrowRight",
			code: "ArrowRight",
			windowsVirtualKeyCode: 39,
			nativeVirtualKeyCode: 39,
		});
		await new Promise((resolve) => setTimeout(resolve, 50));
		const keyboard = await evaluate(resources.pageConnection, `(() => {
			const input = document.querySelector('[data-bulk-edit-field="layout"] input[type="radio"]:checked');
			return {
				value: input?.value,
				focusRemainsInGroup: document.activeElement?.name === "layout",
				selectedState: input?.closest('label')?.dataset.selected,
			};
		})()`);

		const layouts = [];
		for (const width of [360, 384, 393, 402, 412, 899, 900, 901, 1280]) {
			await resources.pageConnection.command("Emulation.setDeviceMetricsOverride", {
				width,
				height: width <= 412 ? 852 : 900,
				deviceScaleFactor: 1,
				mobile: width <= 412,
			});
			await new Promise((resolve) => setTimeout(resolve, 50));
			layouts.push(await evaluate(resources.pageConnection, "window.__measureBuilderBulkEditLayout()"));
		}
		const brandingLayouts = [];
		for (const { width, height } of [
			...[360, 384, 393, 402, 412].map((width) => ({ width, height: 852 })),
			...[899, 900, 901, 1280].map((width) => ({ width, height: 900 })),
			{ width: 393, height: 320 },
		]) {
			await resources.pageConnection.command("Emulation.setDeviceMetricsOverride", {
				width,
				height,
				deviceScaleFactor: 1,
				mobile: width <= 412,
			});
			await new Promise((resolve) => setTimeout(resolve, 50));
			brandingLayouts.push(await evaluate(resources.pageConnection, "window.__measureBuilderBrandingLayout()"));
		}
		const workspaceHeaderLayouts = [];
		for (const width of [393, 900, 1280]) {
			await resources.pageConnection.command("Emulation.setDeviceMetricsOverride", {
				width,
				height: width === 393 ? 852 : 900,
				deviceScaleFactor: 1,
				mobile: width === 393,
			});
			workspaceHeaderLayouts.push(await evaluate(resources.pageConnection, "window.__runWorkspaceHeaderGeometryScenario()"));
		}

		return { results: mounted.results, keyboard, layouts, brandingLayouts, workspaceHeaderLayouts };
	}, () => cleanupMountedBrowser({
		browserExecutable: resources.browserExecutable,
		browserProcess: resources.browserProcess,
		browserConnection: resources.browserConnection,
		pageConnection: resources.pageConnection,
		processTree: resources.processTree,
		profileDir: resources.profileDir,
		vite: resources.vite,
		viteCacheDir: resources.viteCacheDir,
	}));
	return execution.value;
}

let mounted;
before(async () => {
	mounted = await runMountedPage();
});

test("mounted combined Apply confirms once, preserves the draft on Cancel, and commits atomically on Continue", () => {
	const { combined } = mounted.results;
	assert.deepEqual(Object.values(combined.initial.values), Array(6).fill("NO_CHANGE"));
	assert.equal(combined.initial.applyDisabled, true);
	assert.equal(combined.initial.headingFocused, true);
	assert.equal(combined.initial.bodyLocked, true);
	assert.deepEqual(combined.footerOrder, ["apply-bulk-edit", "cancel-bulk-edit"]);
	assert.equal(combined.tabWrappedToFirst, true);
	assert.deepEqual(combined.confirmationState, {
		present: true,
		bulkDialogAbsent: true,
		message: expectedConfirmation,
		cancelFocused: true,
		callsBeforeContinue: 0,
		shiftTabWrapped: true,
	});
	assert.deepEqual(combined.choicesAfterCancel, {
		layout: "ROWS",
		showAllTab: "OFF",
		pinToTop: "ON",
		collectionTitles: "HIDE",
		folderTitleVisibility: "HIDE_EVERYWHERE",
		focusArtwork: "HIDE",
	});
	assert.equal(combined.cancelPreservedRevision, true);
	assert.equal(combined.cancelPerformedNoCall, true);
	assert.deepEqual(combined.completed, {
		calls: 1,
		requestLength: 2,
		revisionDelta: 1,
		layout: "ROWS",
		showAllTab: false,
		pinToTop: true,
		collectionTitle: NUVIO_INVISIBLE_TITLE,
		folderTitle: NUVIO_INVISIBLE_TITLE,
		folderHideTitle: true,
		focusEnabled: false,
		focusUrlPreserved: true,
		coverUrlPreserved: true,
		sourcesPreserved: true,
		rawFolderPreserved: true,
		dialogClosed: true,
		triggerFocusRestored: true,
		bodyUnlocked: true,
	});
	assert.deepEqual(combined.escape, {
		callsUnchanged: true,
		dialogClosed: true,
		triggerFocusRestored: true,
	});
});

test("mounted already-invisible titles skip confirmation and preserve imported Folder title bytes", () => {
	assert.deepEqual(mounted.results.hidden, {
		confirmationAbsent: true,
		dialogClosed: true,
		calls: 1,
		revisionDelta: 1,
		folderTitlePreserved: true,
	});
});

test("mounted atomic failure retains choices, announces the error, and performs zero mutation", () => {
	assert.deepEqual(mounted.results.failure, {
		calls: 1,
		dialogOpen: true,
		draftPreserved: true,
		message: "Bulk changes were rejected safely.",
		diagnosticFocused: true,
		projectPreserved: true,
		revisionPreserved: true,
	});
});

test("mounted empty and Collection-only projects expose the approved availability behavior", () => {
	assert.deepEqual(mounted.results.emptyAndAbsent, {
		emptyTriggerDisabled: true,
		populatedTriggerEnabled: true,
		folderSectionDisabled: true,
		folderExplanation: true,
	});
});

test("mounted pill radios support keyboard navigation with an explicit non-color selected state", () => {
	assert.deepEqual(mounted.keyboard, {
		value: "TABBED_GRID",
		focusRemainsInGroup: true,
		selectedState: "true",
	});
});

test("mounted Bulk display settings stays labelled, single-scroll, wrapped, reachable, and overflow-free at every required width", () => {
	assert.deepEqual(mounted.layouts.map(({ width }) => width), [360, 384, 393, 402, 412, 899, 900, 901, 1280]);
	for (const layout of mounted.layouts) {
		assert.equal(layout.documentOverflow, false, `document overflow at ${layout.width}px`);
		assert.equal(layout.dialogOverflow, false, `dialog overflow at ${layout.width}px`);
		assert.equal(layout.dialogWithinViewport, true, `dialog bounds at ${layout.width}px`);
		assert.equal(layout.actionsReachable, true, `actions at ${layout.width}px`);
		assert.equal(layout.potentialScrollOwners, 1, `scroll owners at ${layout.width}px`);
		assert.ok(layout.minimumControlHeight >= 36, `control target ${layout.minimumControlHeight}px at ${layout.width}px`);
		assert.ok(layout.minimumChoiceHeight >= 36, `choice target ${layout.minimumChoiceHeight}px at ${layout.width}px`);
		assert.equal(layout.headerOverflow, false, `header overflow at ${layout.width}px`);
		assert.equal(layout.collectionHeaderOverflow, false, `Collections header overflow at ${layout.width}px`);
		assert.equal(layout.triggerWidth, 44);
		assert.equal(layout.triggerHeight, 44);
		assert.equal(layout.triggerSurfaceWidth, 34);
		assert.equal(layout.triggerSurfaceHeight, 34);
		assert.equal(layout.triggerHasPopup, "dialog");
		assert.equal(layout.triggerLabel, "Bulk display settings");
		assert.equal(layout.triggerTitle, "Bulk display settings");
		assert.equal(layout.triggerInCollectionsHeader, true);
		assert.equal(layout.triggerInFoldersHeader, false);
		assert.equal(layout.triggerInMasthead, false);
		assert.equal(layout.noNativeSelects, true);
		assert.equal(layout.choiceGroupsOverflow, false, `choice group overflow at ${layout.width}px`);
		assert.equal(layout.choiceLabelsClipped, false, `clipped choice label at ${layout.width}px`);
		assert.equal(layout.selectedStateVisible, true);
		assert.equal(layout.selectedCheckmarkCount, 0);
		if (layout.width <= 412) {
			assert.ok(layout.titleVisibilityRows >= 2, `Folder Title visibility wrapping at ${layout.width}px`);
		}
	}
});

test("mounted product heading stays exact, stacked, contained, and navigation-safe across the required matrix", () => {
	assert.deepEqual(mounted.brandingLayouts.map(({ width, height }) => [width, height]), [
		[360, 852],
		[384, 852],
		[393, 852],
		[402, 852],
		[412, 852],
		[899, 900],
		[900, 900],
		[901, 900],
		[1280, 900],
		[393, 320],
	]);
	for (const layout of mounted.brandingLayouts) {
		const label = `${layout.width}x${layout.height}`;
		assert.deepEqual(layout.headingLines, ["Dingo's", "Collection Builder"], `heading text at ${label}`);
		assert.equal(layout.headingLineRows, 2, `stacked rows at ${label}`);
		assert.deepEqual(layout.headingLineRectCounts, [1, 1], `single-line spans at ${label}`);
		assert.equal(layout.headingOverflow, false, `heading overflow at ${label}`);
		assert.equal(layout.headingWithinBrand, true, `heading containment at ${label}`);
		assert.equal(layout.headerOverflow, false, `header overflow at ${label}`);
		assert.equal(layout.documentOverflow, false, `document overflow at ${label}`);
		assert.equal(layout.subtitle, "Built for Nuvio collections", `subtitle at ${label}`);
		assert.equal(layout.oldProductTitlePresent, false, `old title at ${label}`);
		assert.deepEqual(layout.headerActionLabels, ["Back to builder home", "About & Credits"], `header actions at ${label}`);
		assert.equal(layout.headerActionsContained, true, `header action containment at ${label}`);
	}
});

test("mounted Workspace header dividers stay aligned independently of conditional Add actions", () => {
	assert.deepEqual(mounted.workspaceHeaderLayouts.map(({ width }) => width), [393, 900, 1280]);
	for (const layout of mounted.workspaceHeaderLayouts) {
		assert.deepEqual(layout.states.map(({ name }) => name), ["empty", "collection-selected", "folder-selected"]);
		for (const state of layout.states) {
			assert.equal(state.noClipping, true, `${layout.width}px ${state.name} header clipping`);
			assert.equal(state.noHorizontalOverflow, true, `${layout.width}px ${state.name} horizontal overflow`);
			assert.equal(state.focusableHeaderButtonsWork, true, `${layout.width}px ${state.name} header focus`);
		}
		assert.deepEqual(layout.states.map(({ rows }) => rows.map(({ actions }) => actions)), [
			[["New collection"], [], []],
			[["New collection"], ["New folder"], []],
			[["New collection"], ["New folder"], ["Add source"]],
		], `${layout.width}px conditional Add actions`);
		if (layout.width >= 900) {
			for (const state of layout.states) {
				assert.deepEqual(state.visiblePanels, ["collections", "folders", "sources"], `${layout.width}px ${state.name} desktop columns`);
			}
		} else {
			assert.deepEqual(layout.states.map(({ visiblePanels }) => visiblePanels), [["collections"], ["folders"], ["sources"]], "393px stacked progression");
		}
	}
	assert.deepEqual(mounted.workspaceHeaderLayouts.filter(({ width }) => width >= 900).map((layout) => ({
		width: layout.width,
		spreads: layout.states.map(({ bottomSpread }) => bottomSpread),
	})), [
		{ width: 900, spreads: [0, 0, 0] },
		{ width: 1280, spreads: [0, 0, 0] },
	], "desktop divider alignment for empty, collection-selected, and folder-selected states");
});
