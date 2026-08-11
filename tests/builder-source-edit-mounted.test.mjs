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
import {
	cleanupMountedBrowser,
	connectDevTools,
	createBrowserProcessTree,
	runWithLifecycleCleanup,
	waitForDevToolsEndpoint,
} from "./helpers/mounted-browser-lifecycle.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const builderModules = path.join(rootDir, "builder", "node_modules");

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
	if (!executable) throw new Error("Chrome or Chromium is required for mounted Builder UI regressions.");
	return executable;
}

async function waitForJson(url, timeoutMs = 10000) {
	const deadline = Date.now() + timeoutMs;
	let lastError = null;
	while (Date.now() < deadline) {
		try {
			const remainingMs = Math.max(1, deadline - Date.now());
			const response = await fetch(url, {
				signal: AbortSignal.timeout(Math.min(1000, remainingMs)),
			});
			if (response.ok) return response.json();
			lastError = new Error(`HTTP ${response.status}`);
		} catch (error) {
			lastError = error;
		}
		const remainingMs = deadline - Date.now();
		if (remainingMs > 0) {
			await new Promise((resolve) => setTimeout(resolve, Math.min(50, remainingMs)));
		}
	}
	throw new Error(`Chrome DevTools did not become available: ${lastError?.message ?? "timeout"}`);
}

async function runMountedPage() {
	const resources = {
		browserExecutable: null,
		browserProcess: null,
		browserConnection: null,
		debugPort: null,
		pageConnection: null,
		processTree: null,
		profileDir: null,
		vite: null,
		viteCacheDir: null,
	};
	const startedAt = Date.now();
	const execution = await runWithLifecycleCleanup(async () => {
		resources.viteCacheDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "builder-source-edit-vite-"));
		resources.vite = await createServer({
			root: rootDir,
			cacheDir: resources.viteCacheDir,
			configFile: false,
			appType: "spa",
			logLevel: "silent",
			plugins: [react()],
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

		resources.profileDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "builder-source-edit-mounted-"));
		resources.browserExecutable = chromeExecutable();
		resources.browserProcess = spawn(resources.browserExecutable, [
			"--headless=new",
			"--disable-background-networking",
			"--disable-component-update",
			"--disable-gpu",
			"--no-first-run",
			"--no-sandbox",
			"--remote-debugging-address=127.0.0.1",
			"--remote-debugging-port=0",
			`--user-data-dir=${resources.profileDir}`,
			"about:blank",
		], {
			detached: process.platform !== "win32",
			stdio: "ignore",
			windowsHide: true,
		});
		await new Promise((resolve, reject) => {
			const cleanup = () => {
				resources.browserProcess.removeListener("spawn", onSpawn);
				resources.browserProcess.removeListener("error", onError);
			};
			const onSpawn = () => {
				cleanup();
				resolve();
			};
			const onError = (error) => {
				cleanup();
				reject(error);
			};
			resources.browserProcess.once("spawn", onSpawn);
			resources.browserProcess.once("error", onError);
		});
		resources.processTree = createBrowserProcessTree({ rootPid: resources.browserProcess.pid });

		const endpoint = await waitForDevToolsEndpoint({
			profileDir: resources.profileDir,
			browserProcess: resources.browserProcess,
		});
		resources.debugPort = endpoint.port;
		resources.browserConnection = await connectDevTools(endpoint.browserWebSocketUrl);
		const targets = await waitForJson(`http://127.0.0.1:${endpoint.port}/json/list`);
		const target = targets.find((entry) => entry.type === "page");
		if (!target?.webSocketDebuggerUrl) throw new Error("Chrome page target is unavailable.");
		resources.pageConnection = await connectDevTools(target.webSocketDebuggerUrl);
		await resources.pageConnection.command("Page.enable");
		await resources.pageConnection.command("Runtime.enable");
		const address = resources.vite.httpServer.address();
		await resources.pageConnection.command("Page.navigate", {
			url: `http://127.0.0.1:${address.port}/tests/fixtures/builder-source-edit-mounted.html`,
		});
		const deadline = Date.now() + 15000;
		while (Date.now() < deadline) {
			const evaluated = await resources.pageConnection.command("Runtime.evaluate", {
				expression: "window.__builderSourceEditMounted ?? null",
				returnByValue: true,
			});
			const result = evaluated.result?.value;
			if (result?.status === "complete") return result.results;
			if (result?.status === "error") throw new Error(result.message);
			await new Promise((resolve) => setTimeout(resolve, 50));
		}
		throw new Error("Mounted source-edit regressions timed out.");
	}, () => cleanupMountedBrowser(resources));

	if (execution.cleanupReport.browser.fallback === "succeeded") {
		console.warn(
			`Mounted browser required process-tree fallback after graceful shutdown failed: ${execution.cleanupReport.browser.gracefulError?.message ?? "unknown error"}`,
		);
	}
	if (process.env.TMDB_MOUNTED_BROWSER_DIAGNOSTICS === "1") {
		console.log(`MOUNTED_BROWSER_DIAGNOSTICS ${JSON.stringify({
			browserExecutable: execution.cleanupReport.browserExecutable,
			debugPort: resources.debugPort,
			rootPid: execution.cleanupReport.rootPid,
			graceful: execution.cleanupReport.browser.graceful,
			fallback: execution.cleanupReport.browser.fallback,
			remainingPids: execution.cleanupReport.browser.remainingPids,
			profileRetries: execution.cleanupReport.profile.retries,
			viteCacheRetries: execution.cleanupReport.viteCache.retries,
			durationMs: Date.now() - startedAt,
		})}`);
	}
	return execution.value;
}

let mountedResults;
before(async () => {
	mountedResults = await runMountedPage();
});

function assertRequiredNameFailure(result) {
	assert.equal(result.activeElementIsInput, true);
	assert.equal(result.ariaInvalid, "true");
	assert.equal(result.alertRendered, true);
	assert.equal(result.alertRole, "alert");
	assert.match(result.alertText, /Check your changes/);
	assert.match(result.alertText, /Enter a name for this source before saving\./);
	assert.equal(result.dialogOpen, true);
	assert.equal(result.blankValuePreserved, true);
	assert.equal(result.updateCalls, 0);
	assert.equal(result.revisionAfter, result.revisionBefore);
	assert.equal(result.serializedUnchanged, true);
	assert.equal(result.label, "Source name");
}

test("mounted People validation focuses Source name after rendering and performs zero mutation", () => {
	assertRequiredNameFailure(mountedResults.peopleRequiredName);
	assert.equal(
		mountedResults.peopleRequiredName.helper,
		"This is the name shown in Nuvio. You can customise it.",
	);
});

test("mounted Collection validation shares the Source name focus path and performs zero mutation", () => {
	assertRequiredNameFailure(mountedResults.collectionRequiredName);
	assert.equal(
		mountedResults.collectionRequiredName.helper,
		"This is the name shown in Nuvio. You can customise it.",
	);
});

test("mounted Streaming validation focuses Source name and preserves the physical source without mutation", () => {
	assertRequiredNameFailure(mountedResults.streamingRequiredName);
	assert.equal(
		mountedResults.streamingRequiredName.helper,
		"This is the name shown in Nuvio. You can customise it.",
	);
});

test("mounted duplicate failure focuses the diagnostic alert and preserves the draft without mutation", () => {
	const result = mountedResults.duplicate;
	assert.equal(result.activeElementIsAlert, true);
	assert.equal(result.activeElementIsInput, false);
	assert.equal(result.alertRendered, true);
	assert.equal(result.alertRole, "alert");
	assert.match(result.alertText, /Source already exists/);
	assert.equal(result.dialogOpen, true);
	assert.equal(result.draftPreserved, true);
	assert.equal(result.updateCalls, 0);
	assert.equal(result.revisionAfter, result.revisionBefore);
	assert.equal(result.serializedUnchanged, true);
});

test("mounted Streaming creation reopens and focuses the invalid physical-source name without applying", () => {
	const result = mountedResults.streamingCreationRequiredName;
	assert.equal(result.activeElementIsInput, true);
	assert.equal(result.ariaInvalid, "true");
	assert.equal(result.inlineError, "Enter a name for this source before adding it.");
	assert.equal(result.alertRendered, true);
	assert.equal(result.dialogOpen, true);
	assert.equal(result.applyCalls, 0);
});
