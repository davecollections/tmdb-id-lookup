import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test, { before } from "node:test";
import { fileURLToPath } from "node:url";

import react from "../builder/node_modules/@vitejs/plugin-react/dist/index.js";
import { createServer } from "../builder/node_modules/vite/dist/node/index.js";
import { extractTmdbProxyBaseUrl } from "../builder/build-config.js";
import {
	cleanupMountedBrowser,
	connectDevTools,
	createBrowserProcessTree,
	runWithLifecycleCleanup,
	waitForDevToolsEndpoint,
} from "./helpers/mounted-browser-lifecycle.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const builderModules = path.join(rootDir, "builder", "node_modules");
const tmdbProxyBaseUrl = extractTmdbProxyBaseUrl(fs.readFileSync(path.join(rootDir, "js", "config.js"), "utf8"));

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
	if (!executable) throw new Error("Chrome or Chromium is required for mounted Folder artwork regressions.");
	return executable;
}

async function waitForJson(url, timeoutMs = 10000) {
	const deadline = Date.now() + timeoutMs;
	let lastError = null;
	while (Date.now() < deadline) {
		try {
			const remainingMs = Math.max(1, deadline - Date.now());
			const response = await fetch(url, { signal: AbortSignal.timeout(Math.min(1000, remainingMs)) });
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
		artworkRequests: [],
		artworkServer: null,
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
	const execution = await runWithLifecycleCleanup(async () => {
		const artworkBytes = Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64");
		resources.artworkServer = http.createServer((request, response) => {
			const requestUrl = new URL(request.url, "http://127.0.0.1");
			resources.artworkRequests.push({
				path: requestUrl.pathname,
				referer: request.headers.referer ?? null,
			});
			response.setHeader("Cache-Control", "no-store");

			const recoveringRequestCount = resources.artworkRequests.filter(({ path: requestPath }) => requestPath === "/recovering.gif").length;
			if (requestUrl.pathname === "/recovering.gif" && recoveringRequestCount === 1) {
				response.writeHead(404).end();
				return;
			}
			if (requestUrl.pathname === "/hotlink-sensitive.gif" && request.headers.referer) {
				response.writeHead(403).end();
				return;
			}
			if (["/hotlink-sensitive.gif", "/replacement.gif", "/recovering.gif"].includes(requestUrl.pathname)) {
				response.writeHead(200, { "Content-Type": "image/gif", "Content-Length": artworkBytes.length });
				response.end(artworkBytes);
				return;
			}
			response.writeHead(404).end();
		});
		await new Promise((resolve, reject) => {
			resources.artworkServer.once("error", reject);
			resources.artworkServer.listen(0, "127.0.0.1", resolve);
		});
		const artworkAddress = resources.artworkServer.address();
		const artworkBaseUrl = `http://127.0.0.1:${artworkAddress.port}`;

		resources.viteCacheDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "builder-folder-artwork-vite-"));
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

		resources.profileDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "builder-folder-artwork-mounted-"));
		resources.browserExecutable = chromeExecutable();
		resources.browserProcess = spawn(resources.browserExecutable, [
			"--headless=new",
			"--disable-background-networking",
			"--disable-component-update",
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
			stdio: "ignore",
			windowsHide: true,
		});
		await new Promise((resolve, reject) => {
			resources.browserProcess.once("spawn", resolve);
			resources.browserProcess.once("error", reject);
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
		resources.pageConnection = await connectDevTools(target.webSocketDebuggerUrl, { commandTimeoutMs: 30000 });
		await resources.pageConnection.command("Page.enable");
		await resources.pageConnection.command("Runtime.enable");
		const address = resources.vite.httpServer.address();
		await resources.pageConnection.command("Page.navigate", {
			url: `http://127.0.0.1:${address.port}/tests/fixtures/builder-folder-card-artwork-mounted.html?artworkBaseUrl=${encodeURIComponent(artworkBaseUrl)}`,
		});

		const deadline = Date.now() + 30000;
		while (Date.now() < deadline) {
			const status = await evaluate(resources.pageConnection, "window.__builderFolderArtworkMounted ?? null");
			if (status?.status === "error") throw new Error(status.message);
			if (status?.status === "complete") break;
			await new Promise((resolve) => setTimeout(resolve, 50));
		}
		const ready = await evaluate(resources.pageConnection, "window.__builderFolderArtworkMounted ?? null");
		if (ready?.status !== "complete") throw new Error("Mounted Folder artwork regressions timed out.");

		const widths = [];
		for (const width of [360, 384, 393, 402, 412, 899, 900, 901, 1280]) {
			await resources.pageConnection.command("Emulation.setDeviceMetricsOverride", {
				width,
				height: width <= 412 ? 852 : 900,
				deviceScaleFactor: 1,
				mobile: width <= 412,
			});
			await new Promise((resolve) => setTimeout(resolve, 40));
			widths.push(await evaluate(resources.pageConnection, "window.__measureFolderArtworkLayout()"));
		}

		await resources.pageConnection.command("Emulation.setDeviceMetricsOverride", {
			width: 1280,
			height: 900,
			deviceScaleFactor: 1,
			mobile: false,
		});
		await evaluate(resources.pageConnection, "window.__measureFolderArtworkLayout()");
		const handle = await evaluate(resources.pageConnection, `(() => {
			const card = [...document.querySelectorAll('[data-hierarchy-card="folder"]')]
				.find((entry) => entry.querySelector('.node-title')?.textContent.trim() === 'Poster artwork');
			const rect = card.querySelector('[data-action="reorder-folder"]').getBoundingClientRect();
			return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
		})()`);
		await resources.pageConnection.command("Input.dispatchMouseEvent", {
			type: "mousePressed", x: handle.x, y: handle.y, button: "left", buttons: 1, clickCount: 1,
		});
		await resources.pageConnection.command("Input.dispatchMouseEvent", {
			type: "mouseMoved", x: handle.x, y: handle.y + 12, button: "left", buttons: 1,
		});
		await new Promise((resolve) => setTimeout(resolve, 60));
		const dragOverlay = await evaluate(resources.pageConnection, `(() => {
			const overlay = document.querySelector('[data-reorder-drag-overlay="true"]');
			const source = [...document.querySelectorAll('[data-hierarchy-card="folder"]')]
				.find((entry) => entry.querySelector('.node-title')?.textContent.trim() === 'Poster artwork');
			if (!overlay) return { present: false };
			const sourceRect = source.getBoundingClientRect();
			return {
				present: true,
				ariaHidden: overlay.getAttribute('aria-hidden'),
				inert: overlay.inert,
				thumbnailPresent: overlay.querySelector('.folder-card-thumbnail') !== null,
				widthMatches: Math.abs(Number.parseFloat(overlay.style.width) - sourceRect.width) < 1,
				heightMatches: Math.abs(Number.parseFloat(overlay.style.height) - sourceRect.height) < 1,
				buttonsOutOfTabOrder: [...overlay.querySelectorAll('button')].every((button) => button.tabIndex === -1),
			};
		})()`);
		await resources.pageConnection.command("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
		await resources.pageConnection.command("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape" });
		await resources.pageConnection.command("Input.dispatchMouseEvent", {
			type: "mouseReleased", x: handle.x, y: handle.y + 12, button: "left", buttons: 0, clickCount: 1,
		});
		await new Promise((resolve) => setTimeout(resolve, 240));
		const dragAfter = await evaluate(resources.pageConnection, `({
			overlayRemoved: document.querySelector('[data-reorder-drag-overlay="true"]') === null,
			...window.__folderArtworkPreservationState(),
		})`);

		await evaluate(resources.pageConnection, `(() => {
			const card = [...document.querySelectorAll('[data-hierarchy-card="folder"]')]
				.find((entry) => entry.querySelector('.node-title')?.textContent.trim() === 'Poster artwork');
			card.querySelector('[data-action="reorder-folder"]').focus();
		})()`);
		await resources.pageConnection.command("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter" });
		await resources.pageConnection.command("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter" });
		await new Promise((resolve) => setTimeout(resolve, 30));
		const keyboardActive = await evaluate(resources.pageConnection, `(() => {
			const card = [...document.querySelectorAll('[data-hierarchy-card="folder"]')]
				.find((entry) => entry.querySelector('.node-title')?.textContent.trim() === 'Poster artwork');
			const handle = card.querySelector('[data-action="reorder-folder"]');
			return { pressed: handle.getAttribute('aria-pressed'), thumbnailPresent: card.querySelector('.folder-card-thumbnail') !== null };
		})()`);
		await resources.pageConnection.command("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
		await resources.pageConnection.command("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape" });
		await new Promise((resolve) => setTimeout(resolve, 30));
		const keyboardAfter = await evaluate(resources.pageConnection, `(() => {
			const card = [...document.querySelectorAll('[data-hierarchy-card="folder"]')]
				.find((entry) => entry.querySelector('.node-title')?.textContent.trim() === 'Poster artwork');
			return {
				pressed: card.querySelector('[data-action="reorder-folder"]').getAttribute('aria-pressed'),
				...window.__folderArtworkPreservationState(),
			};
		})()`);

		const failureReplacement = await evaluate(resources.pageConnection, "window.__exerciseFolderArtworkFailureReplacement()");
		await new Promise((resolve) => setTimeout(resolve, 100));
		const artworkRequests = resources.artworkRequests.map((request) => ({ ...request }));

		return { widths, dragOverlay, dragAfter, keyboardActive, keyboardAfter, failureReplacement, artworkRequests };
	}, async () => {
		const cleanupReport = await cleanupMountedBrowser(resources);
		if (resources.artworkServer?.listening) {
			await new Promise((resolve, reject) => resources.artworkServer.close((error) => (error ? reject(error) : resolve())));
		}
		return cleanupReport;
	});

	if (execution.cleanupReport.browser.fallback === "succeeded") {
		console.warn(`Mounted Folder artwork browser required process-tree fallback: ${execution.cleanupReport.browser.gracefulError?.message ?? "unknown error"}`);
	}
	return execution.value;
}

let mountedResults;
before(async () => {
	mountedResults = await runMountedPage();
});

test("mounted assigned artwork remains compact, decorative, lazy, and overflow-free at every required width", () => {
	assert.deepEqual(mountedResults.widths.map((result) => result.width), [360, 384, 393, 402, 412, 899, 900, 901, 1280]);
	for (const result of mountedResults.widths) {
		const compact = result.width < 1240;
		assert.equal(result.folderPanelVisible, true, `${result.width}px Folder panel`);
		assert.deepEqual(result.poster.attributes, { alt: "", loading: "lazy", decoding: "async", referrerPolicy: "no-referrer", draggable: "false" }, `${result.width}px browser image behavior`);
		assert.equal(result.poster.frame.width, compact ? 30 : 34, `${result.width}px Poster width`);
		assert.equal(result.poster.frame.height, compact ? 44 : 50, `${result.width}px Poster height`);
		assert.equal(result.landscape.frame.width, compact ? 50 : 60, `${result.width}px Landscape width`);
		assert.equal(result.landscape.frame.height, compact ? 28 : 34, `${result.width}px Landscape height`);
		assert.equal(result.unknown.frame.width, compact ? 36 : 44, `${result.width}px unknown width`);
		assert.equal(result.unknown.frame.height, compact ? 36 : 44, `${result.width}px unknown height`);
		assert.equal(result.unknown.objectFit, "contain", `${result.width}px unknown shape treatment`);
		assert.equal(result.cardHeightGrowth <= 10, true, `${result.width}px compact card height (${JSON.stringify(result.cardHeights)})`);
		assert.equal(result.longTitleHeight <= 90, true, `${result.width}px long-title card height`);
		assert.equal(result.longTitleWidth >= 60, true, `${result.width}px title width`);
		assert.equal(result.noHorizontalOverflow, true, `${result.width}px overflow`);
		assert.equal(result.fetchCallCount, 0, `${result.width}px no artwork resolver or TMDB fetch`);
		if (result.width >= 1240) {
			assert.equal(result.panelWidths.collections > result.panelWidths.sources, true, `${result.width}px Collection width`);
			assert.equal(result.panelWidths.folders > result.panelWidths.sources, true, `${result.width}px Folder width`);
		}
	}
});

test("mounted blank, absent, and broken artwork use the exact text-only card without mutating preserved state", () => {
	for (const result of mountedResults.widths) {
		assert.deepEqual(result.textFallbacks, {
			noArtworkHasFrame: false,
			blankHasFrame: false,
			brokenHasFrame: false,
			brokenTextDirect: true,
		}, `${result.width}px text-only fallback`);
		assert.equal(result.projectUnchanged, true, `${result.width}px project`);
		assert.equal(result.serializedUnchanged, true, `${result.width}px serialization`);
		assert.equal(result.revisionUnchanged, true, `${result.width}px revision`);
	}
	assert.deepEqual(mountedResults.dragAfter, {
		overlayRemoved: true,
		brokenUrl: "/tests/fixtures/missing-folder-card-artwork.webp",
		blankUrl: "   ",
		absentHasField: false,
		unsupportedShape: "SQUARE",
		projectUnchanged: true,
		serializedUnchanged: true,
		revisionUnchanged: true,
	});
});

test("mounted selected and hidden-title Folder cards retain accessible non-colour state with artwork", () => {
	for (const result of mountedResults.widths) {
		assert.deepEqual(result.selectedState, { cardSelected: true, buttonPressed: "true" }, `${result.width}px selection`);
		assert.equal(result.hiddenAccessibleName, "Folder with hidden Nuvio title", `${result.width}px hidden-title name`);
	}
});

test("mounted 100-plus Folder list uses native lazy/async images without workspace fetches", () => {
	for (const result of mountedResults.widths) {
		assert.equal(result.imageCount, 106, `${result.width}px image count`);
		assert.equal(result.allImagesLazy, true, `${result.width}px lazy`);
		assert.equal(result.allImagesAsync, true, `${result.width}px async`);
		assert.equal(result.allImagesDecorative, true, `${result.width}px decorative`);
		assert.equal(result.allImagesNonDraggable, true, `${result.width}px non-draggable`);
	}
});

test("mounted pointer overlay and keyboard reorder mode retain the assigned thumbnail without data mutation", () => {
	assert.deepEqual(mountedResults.dragOverlay, {
		present: true,
		ariaHidden: "true",
		inert: true,
		thumbnailPresent: true,
		widthMatches: true,
		heightMatches: true,
		buttonsOutOfTabOrder: true,
	});
	assert.deepEqual(mountedResults.keyboardActive, { pressed: "true", thumbnailPresent: true });
	assert.equal(mountedResults.keyboardAfter.pressed, "false");
	assert.equal(mountedResults.keyboardAfter.projectUnchanged, true);
	assert.equal(mountedResults.keyboardAfter.serializedUnchanged, true);
	assert.equal(mountedResults.keyboardAfter.revisionUnchanged, true);
});

test("mounted arbitrary-origin artwork omits the Builder referrer and a failed URL cannot poison its replacement", () => {
	assert.deepEqual(mountedResults.failureReplacement, {
		initialUrl: mountedResults.failureReplacement.initialUrl,
		initialFailureUsedTextFallback: true,
		failureDidNotMutateProject: true,
		failureDidNotMutateSerialization: true,
		failureDidNotChangeRevision: true,
		updateAccepted: true,
		replacementUrl: mountedResults.failureReplacement.replacementUrl,
		replacementAttempted: true,
		replacementRendered: true,
		replacementReferrerPolicy: "no-referrer",
		reassignedOriginalUrl: mountedResults.failureReplacement.reassignedOriginalUrl,
		reassignedOriginalAttempted: true,
		reassignedOriginalRendered: true,
		reassignedOriginalReferrerPolicy: "no-referrer",
		folderCardRemainedMounted: true,
	});
	assert.match(mountedResults.failureReplacement.initialUrl, /^http:\/\/127\.0\.0\.1:\d+\/recovering\.gif$/);
	assert.match(mountedResults.failureReplacement.replacementUrl, /^http:\/\/127\.0\.0\.1:\d+\/replacement\.gif$/);
	assert.equal(mountedResults.failureReplacement.reassignedOriginalUrl, mountedResults.failureReplacement.initialUrl);

	const hotlinkRequest = mountedResults.artworkRequests.find((request) => request.path === "/hotlink-sensitive.gif");
	const replacementRequest = mountedResults.artworkRequests.find((request) => request.path === "/replacement.gif");
	const recoveringRequests = mountedResults.artworkRequests.filter((request) => request.path === "/recovering.gif");
	assert.deepEqual(hotlinkRequest, { path: "/hotlink-sensitive.gif", referer: null });
	assert.deepEqual(replacementRequest, { path: "/replacement.gif", referer: null });
	assert.deepEqual(recoveringRequests, [
		{ path: "/recovering.gif", referer: null },
		{ path: "/recovering.gif", referer: null },
	]);
});
