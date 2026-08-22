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
			const previewRecoveringRequestCount = resources.artworkRequests.filter(({ path: requestPath }) => requestPath === "/preview-recovering.gif").length;
			const collectionRecoveringRequestCount = resources.artworkRequests.filter(({ path: requestPath }) => requestPath === "/collection-recovering.gif").length;
			if (requestUrl.pathname === "/recovering.gif" && recoveringRequestCount === 1) {
				response.writeHead(404).end();
				return;
			}
			if (requestUrl.pathname === "/preview-recovering.gif" && previewRecoveringRequestCount === 1) {
				response.writeHead(404).end();
				return;
			}
			if (requestUrl.pathname === "/collection-recovering.gif" && collectionRecoveringRequestCount === 1) {
				response.writeHead(404).end();
				return;
			}
			if (["/video-a.mp4", "/video-b.mp4"].includes(requestUrl.pathname)) {
				setTimeout(() => response.writeHead(404).end(), 180);
				return;
			}
			if (requestUrl.pathname === "/hotlink-sensitive.gif" && request.headers.referer) {
				response.writeHead(403).end();
				return;
			}
			if ([
				"/hotlink-sensitive.gif",
				"/replacement.gif",
				"/recovering.gif",
				"/settings-tile.gif",
				"/settings-tile-applied.gif",
				"/settings-backdrop.gif",
				"/settings-logo.gif",
				"/settings-focus.gif",
				"/preview-recovering.gif",
				"/preview-replacement.gif",
				"/collection-saved.gif",
				"/collection-static.jpg",
				"/collection-draft.gif",
				"/collection-recovering.gif",
				"/collection-replacement.gif",
				"/collection-long.gif",
				"/collection-applied.gif",
			].includes(requestUrl.pathname)) {
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

		const settingsWidths = [];
		const ordinarySettingsWidths = [];
		for (const width of [360, 384, 393, 402, 412, 899, 900, 901, 1280]) {
			await resources.pageConnection.command("Emulation.setDeviceMetricsOverride", {
				width,
				height: width <= 412 ? 852 : 900,
				deviceScaleFactor: 1,
				mobile: width <= 412,
			});
			await new Promise((resolve) => setTimeout(resolve, 40));
			settingsWidths.push(await evaluate(resources.pageConnection, "window.__measureFolderArtworkSettingsLayout()"));
			ordinarySettingsWidths.push(await evaluate(resources.pageConnection, "window.__measureFolderArtworkSettingsLayout('Settings without video')"));
		}

		await resources.pageConnection.command("Emulation.setDeviceMetricsOverride", {
			width: 393,
			height: 852,
			deviceScaleFactor: 1,
			mobile: true,
		});
		const settingsDraftPreviews = await evaluate(resources.pageConnection, "window.__exerciseFolderArtworkSettingsDraftPreviews()");
		const ordinaryVideoVisibility = await evaluate(resources.pageConnection, "window.__exerciseFolderArtworkOrdinaryVideoVisibility()");
		const videoCancel = await evaluate(resources.pageConnection, "window.__exerciseFolderArtworkVideoCancel()");
		const videoReplacement = await evaluate(resources.pageConnection, "window.__exerciseFolderArtworkVideoReplacement()");

		await resources.pageConnection.command("Emulation.setDeviceMetricsOverride", {
			width: 900,
			height: 900,
			deviceScaleFactor: 1,
			mobile: false,
		});
		const settingsApply = await evaluate(resources.pageConnection, "window.__exerciseFolderArtworkSettingsApply()");

		const collectionSettingsWidths = [];
		for (const width of [360, 384, 393, 402, 412, 899, 900, 901, 1280]) {
			await resources.pageConnection.command("Emulation.setDeviceMetricsOverride", {
				width,
				height: width <= 412 ? 852 : 900,
				deviceScaleFactor: 1,
				mobile: width <= 412,
			});
			await new Promise((resolve) => setTimeout(resolve, 40));
			collectionSettingsWidths.push(await evaluate(resources.pageConnection, "window.__measureCollectionBackdropSettingsLayout()"));
		}

		await resources.pageConnection.command("Emulation.setDeviceMetricsOverride", {
			width: 393,
			height: 852,
			deviceScaleFactor: 1,
			mobile: true,
		});
		const collectionDraftPreviews = await evaluate(resources.pageConnection, "window.__exerciseCollectionBackdropDraftPreviews()");

		await resources.pageConnection.command("Emulation.setDeviceMetricsOverride", {
			width: 900,
			height: 900,
			deviceScaleFactor: 1,
			mobile: false,
		});
		const collectionUnrelatedApply = await evaluate(resources.pageConnection, "window.__exerciseCollectionBackdropUnrelatedApply()");
		const collectionApply = await evaluate(resources.pageConnection, "window.__exerciseCollectionBackdropApply()");

		const suggestionLayouts = [];
		for (const width of [360, 384, 393, 402, 412, 899, 900, 901, 1280]) {
			await resources.pageConnection.command("Emulation.setDeviceMetricsOverride", {
				width,
				height: width <= 412 ? 852 : 900,
				deviceScaleFactor: 1,
				mobile: width <= 412,
			});
			await new Promise((resolve) => setTimeout(resolve, 40));
			suggestionLayouts.push(await evaluate(resources.pageConnection, "window.__measureFolderArtworkSuggestionLayout()"));
		}

		await resources.pageConnection.command("Emulation.setDeviceMetricsOverride", {
			width: 900,
			height: 900,
			deviceScaleFactor: 1,
			mobile: false,
		});
		const suggestionStates = await evaluate(resources.pageConnection, "window.__inspectFolderArtworkSuggestionStates()");
		const suggestionDraftContract = await evaluate(resources.pageConnection, "window.__exerciseFolderArtworkSuggestionDraftContract()");
		const suggestionBlankOnlyTransitions = await evaluate(resources.pageConnection, "window.__exerciseFolderArtworkBlankOnlyTransitions()");
		const suggestionRequestContract = await evaluate(resources.pageConnection, "window.__exerciseFolderArtworkRequestContract()");
		const suggestionStudioOrientationContract = await evaluate(resources.pageConnection, "window.__exerciseFolderArtworkStudioOrientationContract()");
		await new Promise((resolve) => setTimeout(resolve, 100));
		const artworkRequests = resources.artworkRequests.map((request) => ({ ...request }));

		return { widths, dragOverlay, dragAfter, keyboardActive, keyboardAfter, failureReplacement, settingsWidths, ordinarySettingsWidths, settingsDraftPreviews, ordinaryVideoVisibility, videoCancel, videoReplacement, settingsApply, collectionSettingsWidths, collectionDraftPreviews, collectionUnrelatedApply, collectionApply, suggestionLayouts, suggestionStates, suggestionDraftContract, suggestionBlankOnlyTransitions, suggestionRequestContract, suggestionStudioOrientationContract, artworkRequests };
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
		assert.equal(result.imageCount, 111, `${result.width}px image count`);
		assert.equal(result.allImagesLazy, true, `${result.width}px lazy`);
		assert.equal(result.allImagesAsync, true, `${result.width}px async`);
		assert.equal(result.allImagesDecorative, true, `${result.width}px decorative`);
		assert.equal(result.allImagesNonDraggable, true, `${result.width}px non-draggable`);
	}
});

test("mounted Folder settings previews stay grouped, bounded, exact, and single-scroll at every required width", () => {
	assert.deepEqual(mountedResults.settingsWidths.map((result) => result.width), [360, 384, 393, 402, 412, 899, 900, 901, 1280]);
	for (const result of mountedResults.settingsWidths) {
		assert.equal(result.groupCount, 4, `${result.width}px group count`);
		assert.deepEqual(result.groupNames, ["Tile", "Hero / Background", "Branding", "Focus"], `${result.width}px groups`);
		assert.equal(result.imageCount, 4, `${result.width}px image previews`);
		assert.equal(result.noVideoOnOpen, true, `${result.width}px video opt-in`);
		assert.equal(result.videoFieldPresent, true, `${result.width}px compatibility field`);
		assert.equal(result.heroFieldCount, 2, `${result.width}px compatibility Hero fields`);
		assert.equal(result.videoButtonText, "Preview video", `${result.width}px video action`);
		assert.equal(result.videoButtonStyled, true, `${result.width}px video action style`);
		assert.equal(result.coverEmojiEditorAbsent, true, `${result.width}px coverEmoji UI`);
		assert.deepEqual(result.inputValues, {
			coverImageUrl: mountedResults.settingsWidths[0].inputValues.coverImageUrl,
			heroBackdropUrl: mountedResults.settingsWidths[0].inputValues.heroBackdropUrl,
			heroVideoUrl: mountedResults.settingsWidths[0].inputValues.heroVideoUrl,
			titleLogoUrl: mountedResults.settingsWidths[0].inputValues.titleLogoUrl,
			focusGifUrl: mountedResults.settingsWidths[0].inputValues.focusGifUrl,
		}, `${result.width}px exact fields`);
		assert.deepEqual(result.helperTexts, [
			"Artwork used for the folder tile.",
			"Background image for the folder.",
			"Existing video background for this folder.",
			"Transparent title logo.",
			"Artwork shown when the folder is focused.",
		], `${result.width}px helper copy`);
		assert.equal(result.helperLineCounts.every((lineCount) => lineCount <= 2), true, `${result.width}px helper wrapping`);
		assert.equal(result.artworkSectionHeight <= (result.width < 760 ? 1400 : 1100), true, `${result.width}px artwork height`);
		const expectedWidePreviewWidth = result.width < 760 ? 208 : 240;
		assert.deepEqual(result.widePreviewWidths, {
			backdrop: expectedWidePreviewWidth,
			logo: expectedWidePreviewWidth,
		}, `${result.width}px wide preview sizing`);
		assert.deepEqual({
			height: result.focusSwitch.height,
			backgroundColor: result.focusSwitch.backgroundColor,
			borderTopWidth: result.focusSwitch.borderTopWidth,
			controlWidth: result.focusSwitch.controlWidth,
			controlHeight: result.focusSwitch.controlHeight,
			checked: result.focusSwitch.checked,
		}, {
			height: 52,
			backgroundColor: "rgba(0, 0, 0, 0)",
			borderTopWidth: "0px",
			controlWidth: 50,
			controlHeight: 30,
			checked: true,
		}, `${result.width}px compact focus switch`);
		assert.equal(result.focusSwitch.copyDoesNotOverlapControl, true, `${result.width}px focus switch copy/control collision`);
		assert.equal(result.focusSwitch.controlInsideSwitch, true, `${result.width}px focus switch bounds`);
		assert.equal(result.focusSwitch.descriptionLines <= 2, true, `${result.width}px focus switch helper wrapping`);
		if (result.width < 760) {
			assert.equal(result.focusSwitch.fillsAvailableWidth, true, `${result.width}px mobile focus switch comfort`);
			assert.equal(result.focusSwitch.width >= 280, true, `${result.width}px mobile focus switch touch width`);
		} else {
			assert.equal(result.focusSwitch.fillsAvailableWidth, false, `${result.width}px content-sized focus switch`);
			assert.equal(result.focusSwitch.width <= 320, true, `${result.width}px bounded focus switch width`);
			assert.equal(result.focusSwitch.copyControlGap, 16, `${result.width}px focus switch label gap`);
		}
		assert.equal(result.imageAttributesSafe, true, `${result.width}px image behavior`);
		assert.equal(result.previewUrlsExact, true, `${result.width}px exact draft URLs`);
		assert.equal(result.framesInsideViewport, true, `${result.width}px frames`);
		assert.equal(result.fieldsDoNotOverlap, true, `${result.width}px field/preview overlap`);
		assert.equal(result.inputsRemainUsable, true, `${result.width}px input width`);
		assert.equal(Math.abs(result.tileRatio - 0.67) <= 0.02, true, `${result.width}px tile ratio`);
		assert.equal(Math.abs(result.focusRatio - 0.67) <= 0.02, true, `${result.width}px focus ratio`);
		assert.equal(Math.abs(result.backdropRatio - 1.78) <= 0.02, true, `${result.width}px backdrop ratio`);
		assert.equal(result.logoObjectFit, "contain", `${result.width}px logo fit`);
		assert.equal(result.onlyEditorScrolls, true, `${result.width}px scroll owner`);
		assert.equal(result.bodyLocked, true, `${result.width}px body lock`);
		assert.equal(result.noHorizontalOverflow, true, `${result.width}px overflow`);
		assert.equal(result.actionsInsideViewport, true, `${result.width}px actions`);
		assert.equal(result.projectUnchanged, true, `${result.width}px project`);
		assert.equal(result.serializedUnchanged, true, `${result.width}px serialization`);
		assert.equal(result.revisionUnchanged, true, `${result.width}px revision`);
	}
});

test("mounted Collection backdrop settings stay exact, bounded, and single-scroll at every required width", () => {
	const alternateWidths = new Set([384, 402, 412, 900, 1280]);
	assert.deepEqual(mountedResults.collectionSettingsWidths.map((result) => result.width), [360, 384, 393, 402, 412, 899, 900, 901, 1280]);
	for (const result of mountedResults.collectionSettingsWidths) {
		assert.deepEqual(result.sectionNames, ["Basic details", "Display", "Artwork"], `${result.width}px sections`);
		assert.equal(result.label, "Backdrop Image or GIF URL", `${result.width}px label`);
		assert.equal(result.helper, "Used as fallback folder artwork in Modern View.", `${result.width}px helper`);
		assert.match(result.inputValue, /^http:\/\/127\.0\.0\.1:\d+\/collection-saved\.gif$/, `${result.width}px saved URL`);
		assert.equal(result.inputWidth >= 180, true, `${result.width}px input comfort`);
		assert.equal(result.previewWidth, result.width < 760 ? 208 : 240, `${result.width}px preview width`);
		assert.equal(result.previewRatio, 1.78, `${result.width}px preview ratio`);
		assert.equal(result.previewInsideViewport, true, `${result.width}px preview bounds`);
		assert.equal(result.copyAndPreviewDoNotOverlap, true, `${result.width}px copy/preview collision`);
		assert.deepEqual(result.imageAttributes, {
			src: result.inputValue,
			alt: "",
			loading: "lazy",
			decoding: "async",
			referrerPolicy: "no-referrer",
			draggable: "false",
			tabIndex: -1,
		}, `${result.width}px image attributes`);
		const alternate = alternateWidths.has(result.width);
		assert.equal(result.titleHidden, alternate, `${result.width}px title behavior`);
		assert.equal(result.rowsSelected, alternate, `${result.width}px Rows`);
		assert.equal(result.tabsSelected, !alternate, `${result.width}px Tabs`);
		assert.equal(result.focusGlowAbsent, true, `${result.width}px hidden Focus Glow`);
		assert.equal(result.collectionCardThumbnailAbsent, true, `${result.width}px text-only Collection card`);
		assert.equal(result.onlyEditorScrolls, true, `${result.width}px scroll owner`);
		assert.equal(result.bodyLocked, true, `${result.width}px body lock`);
		assert.equal(result.noHorizontalOverflow, true, `${result.width}px overflow`);
		assert.equal(result.actionsInsideViewport, true, `${result.width}px actions`);
		assert.equal(result.projectUnchanged, true, `${result.width}px project`);
		assert.equal(result.serializedUnchanged, true, `${result.width}px serialization`);
		assert.equal(result.revisionUnchanged, true, `${result.width}px revision`);
	}
});

test("mounted Collection backdrop preview handles blank, static, GIF, broken, long, and A to B to A drafts without mutation", () => {
	const result = mountedResults.collectionDraftPreviews;
	assert.match(result.savedUrl, /^http:\/\/127\.0\.0\.1:\d+\/collection-saved\.gif$/);
	assert.deepEqual(result.blank, { input: "", previewAbsent: true, statusAbsent: true, fetchCallCount: 0 });
	assert.match(result.staticImage, /^http:\/\/127\.0\.0\.1:\d+\/collection-static\.jpg$/);
	assert.match(result.gifImage, /^http:\/\/127\.0\.0\.1:\d+\/collection-draft\.gif$/);
	assert.deepEqual(result.broken, {
		input: result.broken.input,
		status: "Preview unavailable",
		previewAbsent: true,
	});
	assert.match(result.broken.input, /^http:\/\/127\.0\.0\.1:\d+\/collection-broken\.gif$/);
	assert.deepEqual(result.firstFailure, {
		input: result.firstFailure.input,
		status: "Preview unavailable",
	});
	assert.match(result.firstFailure.input, /^http:\/\/127\.0\.0\.1:\d+\/collection-recovering\.gif$/);
	assert.deepEqual(result.replacement, {
		src: result.replacement.src,
		statusAbsent: true,
	});
	assert.match(result.replacement.src, /^http:\/\/127\.0\.0\.1:\d+\/collection-replacement\.gif$/);
	assert.deepEqual(result.recovered, { src: result.firstFailure.input, statusAbsent: true });
	assert.deepEqual(result.long, { exact: true, noHorizontalOverflow: true });
	assert.equal(result.cancelRestoredSavedInput, true);
	assert.equal(result.projectUnchanged, true);
	assert.equal(result.serializedUnchanged, true);
	assert.equal(result.revisionUnchanged, true);

	const recoveringRequests = mountedResults.artworkRequests.filter(({ path: requestPath }) => requestPath === "/collection-recovering.gif");
	assert.deepEqual(recoveringRequests, [
		{ path: "/collection-recovering.gif", referer: null },
		{ path: "/collection-recovering.gif", referer: null },
	]);
	for (const request of mountedResults.artworkRequests.filter(({ path: requestPath }) => requestPath.startsWith("/collection-"))) {
		assert.equal(request.referer, null, request.path);
	}
});

test("mounted Collection Apply is touched-only and preserves unknown data", () => {
	assert.deepEqual(mountedResults.collectionUnrelatedApply, {
		oneRevision: true,
		backdropEditableUnchanged: true,
		backdropSerializedUnchanged: true,
		unknownPreserved: true,
	});
	const result = mountedResults.collectionApply;
	assert.equal(result.oneRevision, true);
	assert.match(result.appliedUrl, /^http:\/\/127\.0\.0\.1:\d+\/collection-applied\.gif$/);
	assert.equal(result.editableValue, result.appliedUrl);
	assert.equal(result.serializedValue, result.appliedUrl);
	assert.equal(result.rawValueUnchanged, true);
	assert.equal(result.unknownPreserved, true);
});

test("mounted ordinary Folder settings omit Backdrop Video without leaving a Hero gap at every required width", () => {
	assert.deepEqual(mountedResults.ordinarySettingsWidths.map((result) => result.width), [360, 384, 393, 402, 412, 899, 900, 901, 1280]);
	for (const [index, result] of mountedResults.ordinarySettingsWidths.entries()) {
		const compatible = mountedResults.settingsWidths[index];
		assert.equal(result.groupCount, 4, `${result.width}px group count`);
		assert.deepEqual(result.groupNames, ["Tile", "Hero / Background", "Branding", "Focus"], `${result.width}px groups`);
		assert.equal(result.imageCount, 4, `${result.width}px image previews`);
		assert.equal(result.noVideoOnOpen, true, `${result.width}px no video element`);
		assert.equal(result.videoFieldPresent, false, `${result.width}px no ordinary video field`);
		assert.equal(result.videoButtonText, null, `${result.width}px no ordinary video action`);
		assert.equal(result.videoButtonStyled, false, `${result.width}px no ordinary video action style`);
		assert.equal(result.heroFieldCount, 1, `${result.width}px ordinary Hero fields`);
		assert.equal(result.heroGroupHeight < compatible.heroGroupHeight, true, `${result.width}px no compatibility gap`);
		assert.equal(result.artworkSectionHeight < compatible.artworkSectionHeight, true, `${result.width}px compact ordinary artwork`);
		assert.equal(result.coverEmojiEditorAbsent, true, `${result.width}px coverEmoji UI`);
		assert.deepEqual(result.inputValues, {
			coverImageUrl: mountedResults.ordinarySettingsWidths[0].inputValues.coverImageUrl,
			heroBackdropUrl: mountedResults.ordinarySettingsWidths[0].inputValues.heroBackdropUrl,
			heroVideoUrl: null,
			titleLogoUrl: mountedResults.ordinarySettingsWidths[0].inputValues.titleLogoUrl,
			focusGifUrl: mountedResults.ordinarySettingsWidths[0].inputValues.focusGifUrl,
		}, `${result.width}px ordinary exact fields`);
		assert.deepEqual(result.helperTexts, [
			"Artwork used for the folder tile.",
			"Background image for the folder.",
			"Transparent title logo.",
			"Artwork shown when the folder is focused.",
		], `${result.width}px ordinary helper copy`);
		assert.equal(result.helperLineCounts.every((lineCount) => lineCount <= 2), true, `${result.width}px helper wrapping`);
		assert.equal(result.imageAttributesSafe, true, `${result.width}px image behavior`);
		assert.equal(result.previewUrlsExact, true, `${result.width}px exact draft URLs`);
		assert.equal(result.framesInsideViewport, true, `${result.width}px frames`);
		assert.equal(result.fieldsDoNotOverlap, true, `${result.width}px field/preview overlap`);
		assert.equal(result.inputsRemainUsable, true, `${result.width}px input width`);
		assert.equal(result.onlyEditorScrolls, true, `${result.width}px scroll owner`);
		assert.equal(result.bodyLocked, true, `${result.width}px body lock`);
		assert.equal(result.noHorizontalOverflow, true, `${result.width}px overflow`);
		assert.equal(result.actionsInsideViewport, true, `${result.width}px actions`);
		assert.equal(result.projectUnchanged, true, `${result.width}px project`);
		assert.equal(result.serializedUnchanged, true, `${result.width}px serialization`);
		assert.equal(result.revisionUnchanged, true, `${result.width}px revision`);
	}
});

test("mounted exact draft failures recover by URL and video loads only after its explicit action", () => {
	const result = mountedResults.settingsDraftPreviews;
	assert.deepEqual(result.firstFailure, {
		status: "Preview unavailable",
		input: result.firstFailure.input,
		imageAbsent: true,
	});
	assert.match(result.firstFailure.input, /^http:\/\/127\.0\.0\.1:\d+\/preview-recovering\.gif$/);
	assert.deepEqual(result.replacement, {
		statusAbsent: true,
		src: result.replacement.src,
	});
	assert.match(result.replacement.src, /^http:\/\/127\.0\.0\.1:\d+\/preview-replacement\.gif$/);
	assert.deepEqual(result.recovered, {
		statusAbsent: true,
		src: result.firstFailure.input,
	});
	assert.equal(result.noVideoBeforeClick, true);
	assert.deepEqual(result.videoAttributes, {
		src: result.videoAttributes.src,
		controls: true,
		playsInline: true,
		preload: "metadata",
		referrerPolicy: null,
		autoplay: false,
		paused: true,
	});
	assert.match(result.videoAttributes.src, /^http:\/\/127\.0\.0\.1:\d+\/video-a\.mp4$/);
	assert.deepEqual(result.videoFailure, {
		status: "Preview unavailable",
		input: result.videoAttributes.src,
		videoAbsent: true,
		retryAvailable: true,
	});
	assert.deepEqual(result.videoResetOnUrlChange, { statusAbsent: true, videoAbsent: true });
	assert.equal(result.draftCardStillSaved, true);
	assert.equal(result.cancelRestoredSavedInputs, true);
	assert.equal(result.projectUnchanged, true);
	assert.equal(result.serializedUnchanged, true);
	assert.equal(result.revisionUnchanged, true);

	const previewRecoveringRequests = mountedResults.artworkRequests.filter(({ path: requestPath }) => requestPath === "/preview-recovering.gif");
	const videoRequests = mountedResults.artworkRequests.filter(({ path: requestPath }) => requestPath === "/video-a.mp4");
	assert.deepEqual(previewRecoveringRequests, [
		{ path: "/preview-recovering.gif", referer: null },
		{ path: "/preview-recovering.gif", referer: null },
	]);
	assert.equal(videoRequests.length >= 3, true);
	for (const request of videoRequests) {
		assert.equal(request.path, "/video-a.mp4");
		assert.match(request.referer, /^http:\/\/127\.0\.0\.1:\d+\/$/);
	}
	assert.equal(mountedResults.artworkRequests.some(({ path: requestPath }) => requestPath === "/video-b.mp4"), true);
});

test("mounted absent, blank, and unsupported Backdrop Video values stay hidden and preserve their exact model state", () => {
	assert.deepEqual(mountedResults.ordinaryVideoVisibility, [
		{
			id: "settings-no-video",
			hiddenOnOpen: true,
			oneRevision: true,
			editableHasVideo: false,
			editableVideo: null,
			serializedHasVideo: false,
			serializedVideo: null,
		},
		{
			id: "settings-blank-video",
			hiddenOnOpen: true,
			oneRevision: true,
			editableHasVideo: true,
			editableVideo: "   ",
			serializedHasVideo: true,
			serializedVideo: "   ",
		},
		{
			id: "settings-unsupported-video",
			hiddenOnOpen: true,
			oneRevision: true,
			editableHasVideo: true,
			editableVideo: ["RAW_VIDEO"],
			serializedHasVideo: true,
			serializedVideo: ["RAW_VIDEO"],
		},
	]);
});

test("mounted Cancel restores an existing compatible video and its control on reopen", () => {
	const result = mountedResults.videoCancel;
	assert.equal(result.visibleAfterClear, true);
	assert.deepEqual(result.reopened, {
		visible: true,
		value: result.savedUrl,
		previewAction: "Preview video",
	});
	assert.equal(result.projectUnchanged, true);
	assert.equal(result.serializedUnchanged, true);
	assert.equal(result.revisionUnchanged, true);
});

test("mounted video replacement resets Preview, previews the exact replacement, saves, and stays compatible on reopen", () => {
	const result = mountedResults.videoReplacement;
	assert.match(result.originalPreviewUrl, /^http:\/\/127\.0\.0\.1:\d+\/video-a\.mp4$/);
	assert.match(result.replacementUrl, /^http:\/\/127\.0\.0\.1:\d+\/video-b\.mp4$/);
	assert.deepEqual(result.resetOnReplacement, { fieldVisible: true, videoAbsent: true, statusAbsent: true });
	assert.deepEqual(result.replacementPreviewState, {
		src: result.replacementUrl,
		controls: true,
		playsInline: true,
		preload: "metadata",
		autoplay: false,
	});
	assert.equal(result.oneRevision, true);
	assert.equal(result.serializedVideo, result.replacementUrl);
	assert.deepEqual(result.reopened, { visible: true, value: result.replacementUrl });
});

test("mounted Apply commits only touched Folder visual fields in one revision", () => {
	const result = mountedResults.settingsApply;
	assert.equal(result.oneRevision, true);
	assert.equal(result.videoControlRemainsAfterClear, true);
	assert.equal(result.videoPreviewActionAbsentAfterClear, true);
	assert.equal(result.videoControlHiddenAfterReopen, true);
	assert.match(result.values.coverImageUrl, /^http:\/\/127\.0\.0\.1:\d+\/settings-tile-applied\.gif$/);
	assert.deepEqual(result.values, {
		coverImageUrl: result.values.coverImageUrl,
		coverEmoji: "🛰️",
		heroVideoUrl: "",
		titleLogoUrl: "",
		heroBackdropUrl: result.untouchedBackdrop,
		focusGifUrl: result.untouchedFocus,
	});
	assert.deepEqual(result.serializedValues, result.values);
	assert.equal(result.cardUsesAppliedUrl, true);
});

test("mounted exact-identity blank-only assistance uses live authorities and preserves every saved Folder on open", () => {
	const [peopleBlank, peopleCustom, networkFallback, genreCurated, peopleRequest, studioLandscape, ambiguous] = mountedResults.suggestionStates;
	for (const result of mountedResults.suggestionStates) {
		assert.equal(result.projectUnchanged, true, `${result.title} project preservation`);
		assert.equal(result.serializedUnchanged, true, `${result.title} serialization preservation`);
		assert.equal(result.revisionUnchanged, true, `${result.title} revision preservation`);
		assert.equal(result.suggestionFailureAbsent, true, `${result.title} live preview`);
		for (const action of result.actions) {
			assert.equal(action.buttonType, "button", `${result.title}:${action.field} button type`);
			assert.match(action.ariaLabel, new RegExp(`${action.text} for`, "i"), `${result.title}:${action.field} accessible name`);
		}
		for (const request of result.requests) {
			assert.equal(request.text, "Request artwork ↗", `${result.title}:${request.field} request text`);
			assert.match(request.ariaLabel, /opens in a new tab/i, `${result.title}:${request.field} accessible name`);
			assert.equal(request.target, "_blank", `${result.title}:${request.field} target`);
			assert.equal(request.rel, "noopener noreferrer", `${result.title}:${request.field} rel`);
		}
		for (const preview of result.previewAttributes) {
			assert.match(preview.src, /^https:\/\//, `${result.title} exact HTTPS candidate`);
			assert.deepEqual({
				alt: preview.alt,
				loading: preview.loading,
				decoding: preview.decoding,
				referrerPolicy: preview.referrerPolicy,
				draggable: preview.draggable,
			}, {
				alt: "",
				loading: "lazy",
				decoding: "async",
				referrerPolicy: "no-referrer",
				draggable: "false",
			}, `${result.title} preview attributes`);
		}
	}

	assert.equal(peopleBlank.state, "ready");
	assert.deepEqual(peopleBlank.fields, ["coverImageUrl", "heroBackdropUrl", "titleLogoUrl", "focusGifUrl"]);
	assert.deepEqual(peopleBlank.actions.map((entry) => entry.text), Array(4).fill("Use curated artwork"));
	assert.deepEqual(peopleBlank.requests, []);
	assert.equal(peopleBlank.coverValue, "");
	assert.equal(peopleBlank.focusEnabled, false);

	assert.deepEqual(peopleCustom.fields, ["titleLogoUrl", "focusGifUrl"]);
	assert.deepEqual(peopleCustom.actions.map((entry) => entry.text), Array(2).fill("Use curated artwork"));
	assert.deepEqual(peopleCustom.requests, []);
	assert.match(peopleCustom.coverValue, /^http:\/\/127\.0\.0\.1:\d+\/settings-tile\.gif$/);
	assert.equal(peopleCustom.heroPreservedStatus, "The current imported value is preserved until this field is edited.");

	assert.deepEqual(networkFallback.fields, []);
	assert.deepEqual(networkFallback.requests, []);
	assert.equal(networkFallback.coverValue, "https://image.tmdb.org/t/p/w500/2uy2ZWcplrSObIyt4x0Y9rkG6qO.png");

	assert.equal(genreCurated.state, "ready");
	assert.deepEqual(genreCurated.fields, []);
	assert.match(genreCurated.coverValue, /\/genre\/vertical\/Comedy\.jpg$/);
	assert.deepEqual(genreCurated.requests, []);

	assert.deepEqual(peopleRequest.fields, ["coverImageUrl", "heroBackdropUrl", "titleLogoUrl"]);
	assert.deepEqual(peopleRequest.actions.map((entry) => entry.text), Array(3).fill("Use curated artwork"));
	assert.deepEqual(peopleRequest.requests.map((entry) => entry.field), ["focusGifUrl"]);
	assert.match(peopleRequest.requests[0].href, /^https:\/\/github\.com\/davecollections\/nuvio-people-assets\/issues\/new\?/);

	assert.deepEqual(studioLandscape.fields, ["coverImageUrl"]);
	assert.equal(studioLandscape.actions[0].text, "Use curated artwork");
	assert.deepEqual(studioLandscape.requests, []);
	assert.equal(studioLandscape.coverValue, "");

	assert.equal(ambiguous.state, "none");
	assert.deepEqual(ambiguous.fields, []);
	assert.deepEqual(ambiguous.requests, []);
	assert.equal(ambiguous.coverValue, "");
});

test("mounted suggestion treatment stays compact and single-scroll at every required width", () => {
	assert.deepEqual(mountedResults.suggestionLayouts.map((result) => result.width), [360, 384, 393, 402, 412, 899, 900, 901, 1280]);
	for (const result of mountedResults.suggestionLayouts) {
		assert.equal(result.suggestionCount, 4, `${result.width}px suggestion count`);
		assert.deepEqual(result.compactPreviewWidths, [64, 112, 112, 64], `${result.width}px compact preview widths`);
		assert.equal(result.insideViewport, true, `${result.width}px suggestion bounds`);
		assert.equal(result.actionTapTargets, true, `${result.width}px action tap targets`);
		assert.equal(result.shortCopyOnly, true, `${result.width}px no duplicated long URLs`);
		assert.equal(result.focusSuggestionBeforeSwitch, true, `${result.width}px Focus relationship`);
		assert.equal(result.onlyEditorScrolls, true, `${result.width}px one scroll owner`);
		assert.equal(result.bodyLocked, true, `${result.width}px body lock`);
		assert.equal(result.noHorizontalOverflow, true, `${result.width}px horizontal overflow`);
		assert.equal(result.actionsInsideViewport, true, `${result.width}px sticky actions`);
		assert.equal(result.projectUnchanged, true, `${result.width}px project preservation`);
		assert.equal(result.serializedUnchanged, true, `${result.width}px serialization preservation`);
		assert.equal(result.revisionUnchanged, true, `${result.width}px revision preservation`);
	}
});

test("mounted suggestion acceptance is draft-only, shape-safe, Cancel-safe, and one-revision Apply", () => {
	const result = mountedResults.suggestionDraftContract;
	assert.equal(result.accepted.input, result.posterUrl);
	assert.equal(result.accepted.assistanceAbsent, true);
	assert.equal(result.accepted.normalPreview, result.posterUrl);
	assert.equal(result.accepted.projectUnchanged, true);
	assert.equal(result.accepted.serializedUnchanged, true);
	assert.equal(result.accepted.revisionUnchanged, true);

	assert.deepEqual(result.cleared, {
		inputBlank: true,
		actionText: "Use curated artwork",
		candidateReturned: true,
	});
	assert.equal(result.shapeChange.landscapeSelected, true);
	assert.equal(result.shapeChange.inputStillBlank, true);
	assert.equal(result.shapeChange.candidateChanged, true);
	assert.equal(result.shapeChange.actionText, "Use curated artwork");
	assert.notEqual(result.landscapeUrl, result.posterUrl);

	assert.deepEqual(result.cancel, {
		coverBlank: true,
		posterSelected: true,
		projectUnchanged: true,
		serializedUnchanged: true,
		revisionUnchanged: true,
	});
	assert.equal(result.apply.cover, result.posterUrl);
	assert.equal(result.apply.coverMatchesAccepted, true);
	assert.equal(result.apply.unknownPreserved, true);
	assert.equal(result.apply.titlePreserved, true);
	assert.equal(result.apply.revisionDelta, 1);
	assert.equal(result.apply.cardUpdated, true);
	assert.equal(result.apply.targetInternalIdPreserved, true);
});

test("mounted nonblank artwork stays quiet until deliberately cleared", () => {
	const result = mountedResults.suggestionBlankOnlyTransitions;
	assert.match(result.opening.exactValue, /^http:\/\/127\.0\.0\.1:\d+\/settings-tile\.gif$/);
	assert.equal(result.opening.coverAssistanceAbsent, true);
	assert.deepEqual(result.cleared, { actionText: "Use curated artwork", inputBlank: true });
	assert.deepEqual(result.accepted, { inputNonblank: true, assistanceAbsent: true });
	assert.equal(result.clearedAgain, "Use curated artwork");
	assert.equal(result.projectUnchanged, true);
	assert.equal(result.serializedUnchanged, true);
	assert.equal(result.revisionUnchanged, true);
});

test("mounted Request artwork is safe external navigation and changes no draft or project state", () => {
	const result = mountedResults.suggestionRequestContract;
	assert.equal(result.text, "Request artwork ↗");
	assert.match(result.ariaLabel, /Focus artwork URL \(opens in a new tab\)/);
	assert.match(result.href, /^https:\/\/github\.com\/davecollections\/nuvio-people-assets\/issues\/new\?/);
	const requestUrl = new URL(result.href);
	assert.equal(requestUrl.searchParams.get("title"), "Artwork request: Kátia Lund — Focus (Poster)");
	assert.match(requestUrl.searchParams.get("body"), /TMDB ID: 8559/);
	assert.match(requestUrl.searchParams.get("body"), /Expected repository path: assets\/people\/8559\/focus-poster\.webp/);
	assert.equal(result.target, "_blank");
	assert.equal(result.rel, "noopener noreferrer");
	assert.equal(result.clickObserved, true);
	assert.equal(result.focusBlank, true);
	assert.equal(result.projectUnchanged, true);
	assert.equal(result.serializedUnchanged, true);
	assert.equal(result.revisionUnchanged, true);
});

test("mounted Studio assistance follows only the supported Landscape orientation", () => {
	assert.deepEqual(mountedResults.suggestionStudioOrientationContract, {
		landscapeAction: "Use curated artwork",
		poster: { inputBlank: true, assistanceAbsent: true },
		landscapeReturned: "Use curated artwork",
	});
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
	assert.ok(recoveringRequests.length >= 2);
	assert.ok(recoveringRequests.every((request) => request.referer === null));
});
