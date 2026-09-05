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
	const launcherOnly = process.env.TMDB_ID_LOOKUP_LAUNCHER_ONLY === "1";
	const sourceDetailsOnly = process.env.TMDB_SOURCE_DETAILS_ONLY === "1";
	const devToolsStartupMs = resolveDevToolsStartupTimeout(process.env.DEVTOOLS_STARTUP_MS);
	const resources = {
		browserExecutable: null,
		browserProcess: null,
		browserStderrCapture: null,
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

		resources.profileDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "builder-source-edit-mounted-"));
		resources.browserExecutable = chromeExecutable();
		resources.browserProcess = spawn(resources.browserExecutable, [
			"--headless=new",
			"--disable-background-networking",
			"--disable-component-update",
			"--disable-dev-shm-usage",
			"--disable-gpu",
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
		try {
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
		} catch (error) {
			resources.browserStderrCapture.stop();
			resources.browserStderrCapture = null;
			throw error;
		}
		resources.processTree = createBrowserProcessTree({ rootPid: resources.browserProcess.pid });

		let endpoint;
		try {
			endpoint = await waitForDevToolsEndpoint({
				profileDir: resources.profileDir,
				browserProcess: resources.browserProcess,
				browserExecutable: resources.browserExecutable,
				stderrCapture: resources.browserStderrCapture,
				timeoutMs: devToolsStartupMs,
			});
		} finally {
			resources.browserStderrCapture.stop();
			resources.browserStderrCapture = null;
		}
		resources.debugPort = endpoint.port;
		resources.browserConnection = await connectDevTools(endpoint.browserWebSocketUrl);
		const targets = await waitForJson(`http://127.0.0.1:${endpoint.port}/json/list`);
		const target = targets.find((entry) => entry.type === "page");
		if (!target?.webSocketDebuggerUrl) throw new Error("Chrome page target is unavailable.");
		resources.pageConnection = await connectDevTools(target.webSocketDebuggerUrl, { commandTimeoutMs: 120000 });
		await resources.pageConnection.command("Page.enable");
		await resources.pageConnection.command("Runtime.enable");
		const address = resources.vite.httpServer.address();
		await resources.pageConnection.command("Page.navigate", {
			url: `http://127.0.0.1:${address.port}/tests/fixtures/builder-source-edit-mounted.html${sourceDetailsOnly ? "?source-details-only" : ""}`,
		});
		const deadline = Date.now() + 30000;
		while (Date.now() < deadline) {
			const evaluated = await resources.pageConnection.command("Runtime.evaluate", {
				expression: "window.__builderSourceEditMounted ?? null",
				returnByValue: true,
			});
			const result = evaluated.result?.value;
			if (result?.status === "complete") {
				// Reuse the mounted Workspace and browser lifecycle for Source-only details.
				for (const width of [393, 900, 1280]) {
					await resources.pageConnection.command("Emulation.setDeviceMetricsOverride", { width, height: 1100, deviceScaleFactor: 1, mobile: width === 393 });
					const evaluatedDetails = await resources.pageConnection.command("Runtime.evaluate", { expression: "window.__prepareSourceDetailsScenario()", awaitPromise: true, returnByValue: true });
					if (evaluatedDetails.exceptionDetails) throw new Error(evaluatedDetails.exceptionDetails.exception?.description ?? evaluatedDetails.exceptionDetails.text);
					const details = evaluatedDetails.result.value;
					assert.equal(details.unchanged, true);
					assert.equal(details.documentOverflow, false, width + "px document overflow");
					assert.equal(details.cards.length, 8);
					for (const card of details.cards) {
						assert.equal(card.overflow, false, width + "px " + card.title);
						assert.equal(card.minHeight, "74px");
						assert.equal(card.paddingTop, "10px");
						assert.equal(card.paddingBottom, "10px");
						assert.equal(card.wrap, "wrap");
						assert.equal(card.clamp, "none");
						assert.ok(card.values.length <= 3);
						assert.equal(/\b(?:31|1001|123)\b/.test(card.values.join(" ")), false);
					}
					assert.deepEqual(details.cards[2].values, ["List", "Original order"]);
					assert.deepEqual(details.cards[4].values, ["movie", "Catalog: catalog", "Movies"]);
					assert.equal(details.cards[3].description, "List, Other sorting");
					assert.deepEqual(details.cards[6].values, ["AIO Metadata", "Trakt", "Movies"]);
					assert.deepEqual(details.cards[7].values, ["Trakt"]);
					const accessibility = await resources.pageConnection.command("Accessibility.getFullAXTree");
					const hidden = accessibility.nodes.find((node) => node.role?.value === "button" && node.name?.value === "Source with hidden Nuvio title");
					assert.equal(hidden?.description?.value, "List, Other sorting");
					const visible = accessibility.nodes.find((node) => node.role?.value === "button" && node.name?.value?.startsWith("My favourites"));
					assert.ok(visible?.name?.value.includes("Acting movies"));
					assert.equal(visible?.name?.value.includes("31"), false);
					assert.equal(visible?.description, undefined);
					if (process.env.TMDB_SOURCE_DETAILS_SCREENSHOTS) {
						await fsPromises.mkdir(process.env.TMDB_SOURCE_DETAILS_SCREENSHOTS, { recursive: true });
						const screenshot = await resources.pageConnection.command("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
						await fsPromises.writeFile(path.join(process.env.TMDB_SOURCE_DETAILS_SCREENSHOTS, "source-details-" + width + ".png"), Buffer.from(screenshot.data, "base64"));
					}
					await resources.pageConnection.command("Runtime.evaluate", { expression: "window.__finishSourceDetailsScenario()", awaitPromise: true });
				}

				result.results.sourceDetailsVerified = true;
				if (sourceDetailsOnly) return result.results;
				const sourceChooserWidths = [];
				const sourceChooserTabletPortraitWidths = [];
				const tmdbListLayoutWidths = [];
				const tmdbListPreviewWidths = [];
				const genreToolbarWidths = [];
				const decadesActionWidths = [];
				const decadesGenreWidths = [];
				const decadesExclusionWidths = [];
				const peopleConfigureWidths = [];
				const peoplePillStabilityWidths = [];
				const peopleSelectionScrollWidths = [];
				const franchiseReviewWidths = [];
				const studioHierarchyWidths = [];
				const networkHierarchyWidths = [];
				const genreHierarchyWidths = [];
				const genreNewFolderSummaryWidths = [];
				const streamingHierarchyWidths = [];
				const streamingAffinityDestinationWidths = [];
				const streamingSelectionReconciliationWidths = [];
				const networkLivePreviewWidths = [];
				const genreLivePreviewWidths = [];
				const sourceEditLivePreviewWidths = [];
				const addSourceLivePreviewParityWidths = [];
				const decadesLivePreviewWidths = [];
				const decadeSourceLayoutWidths = [];
				const decadeSourceOverlapFooterWidths = [];
				const decadeSourceLivePreviewWidths = [];
				let decadeSourceGenreKeyboard = null;
				let sourceChooserKeyboard = null;
				let sourceChooserTabletLandscape = null;
				let wideFontSourceChooser = null;
				let shortHeightSourceChooser = null;
				let shortHeightTmdbListLayout = null;
				let shortHeightTmdbListPreview = null;
				let shortHeightPreviewGeometry = null;
				let streamingDuplicateConfirmation = null;
				for (const width of [360, 384, 393, 402, 412, 899, 900, 901, 1280]) {
					await resources.pageConnection.command("Emulation.setDeviceMetricsOverride", { width, height: width <= 412 ? 852 : 900, deviceScaleFactor: 1, mobile: width <= 412 });
					const sourceChooserEvaluation = await resources.pageConnection.command("Runtime.evaluate", {
						expression: `window.__runSourceChooserLayoutScenario({ includeGrowthStress: ${width <= 412 || width === 1280}, includeOrderStress: ${width === 360 || width === 1280}, includeClassicScrollbarStress: ${width === 360} })`,
						awaitPromise: true,
						returnByValue: true,
					});
					if (sourceChooserEvaluation.exceptionDetails) throw new Error(sourceChooserEvaluation.exceptionDetails.exception?.description ?? sourceChooserEvaluation.exceptionDetails.text);
					sourceChooserWidths.push(sourceChooserEvaluation.result?.value);
					if (launcherOnly) continue;
					const tmdbListLayoutEvaluation = await resources.pageConnection.command("Runtime.evaluate", {
						expression: "window.__runTmdbListLayoutScenario()",
						awaitPromise: true,
						returnByValue: true,
					});
					if (tmdbListLayoutEvaluation.exceptionDetails) throw new Error(tmdbListLayoutEvaluation.exceptionDetails.exception?.description ?? tmdbListLayoutEvaluation.exceptionDetails.text);
					tmdbListLayoutWidths.push(tmdbListLayoutEvaluation.result?.value);
					if (width <= 412) await resources.pageConnection.command("Emulation.setPageScaleFactor", { pageScaleFactor: 1.1 });
					const tmdbListPreviewEvaluation = await resources.pageConnection.command("Runtime.evaluate", {
						expression: "window.__runTmdbListLivePreviewScenario()",
						awaitPromise: true,
						returnByValue: true,
					});
					if (width <= 412) await resources.pageConnection.command("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
					if (tmdbListPreviewEvaluation.exceptionDetails) throw new Error(tmdbListPreviewEvaluation.exceptionDetails.exception?.description ?? tmdbListPreviewEvaluation.exceptionDetails.text);
					tmdbListPreviewWidths.push(tmdbListPreviewEvaluation.result?.value);
					const decadeSourceLayoutEvaluation = await resources.pageConnection.command("Runtime.evaluate", {
						expression: "window.__runDecadeSourceLayoutScenario()",
						awaitPromise: true,
						returnByValue: true,
					});
					if (decadeSourceLayoutEvaluation.exceptionDetails) throw new Error(decadeSourceLayoutEvaluation.exceptionDetails.exception?.description ?? decadeSourceLayoutEvaluation.exceptionDetails.text);
					decadeSourceLayoutWidths.push(decadeSourceLayoutEvaluation.result?.value);
					if ([393, 900, 1280].includes(width)) {
						const decadeSourceOverlapFooterEvaluation = await resources.pageConnection.command("Runtime.evaluate", {
							expression: "(async () => ({ partial: await window.__runDecadeSourceOverlapFooterScenario(1), complete: await window.__runDecadeSourceOverlapFooterScenario(2) }))()",
							awaitPromise: true,
							returnByValue: true,
						});
						if (decadeSourceOverlapFooterEvaluation.exceptionDetails) throw new Error(decadeSourceOverlapFooterEvaluation.exceptionDetails.exception?.description ?? decadeSourceOverlapFooterEvaluation.exceptionDetails.text);
						decadeSourceOverlapFooterWidths.push(decadeSourceOverlapFooterEvaluation.result?.value);
					}
					const peopleEvaluation = await resources.pageConnection.command("Runtime.evaluate", {
						expression: "window.__runPeopleConfigureLayoutScenario()",
						awaitPromise: true,
						returnByValue: true,
					});
					if (peopleEvaluation.exceptionDetails) throw new Error(peopleEvaluation.exceptionDetails.exception?.description ?? peopleEvaluation.exceptionDetails.text);
					peopleConfigureWidths.push(peopleEvaluation.result?.value);
					const peoplePillEvaluation = await resources.pageConnection.command("Runtime.evaluate", {
						expression: "window.__runPeoplePillStabilityScenario()",
						awaitPromise: true,
						returnByValue: true,
					});
					if (peoplePillEvaluation.exceptionDetails) throw new Error(peoplePillEvaluation.exceptionDetails.exception?.description ?? peoplePillEvaluation.exceptionDetails.text);
					peoplePillStabilityWidths.push(peoplePillEvaluation.result?.value);
					const franchiseEvaluation = await resources.pageConnection.command("Runtime.evaluate", {
						expression: "window.__runFranchiseReviewScenario()",
						awaitPromise: true,
						returnByValue: true,
					});
					if (franchiseEvaluation.exceptionDetails) throw new Error(franchiseEvaluation.exceptionDetails.exception?.description ?? franchiseEvaluation.exceptionDetails.text);
					franchiseReviewWidths.push(franchiseEvaluation.result?.value);
					const studioEvaluation = await resources.pageConnection.command("Runtime.evaluate", {
						expression: "window.__runStudioHierarchyScenario()",
						awaitPromise: true,
						returnByValue: true,
					});
					if (studioEvaluation.exceptionDetails) throw new Error(studioEvaluation.exceptionDetails.exception?.description ?? studioEvaluation.exceptionDetails.text);
					studioHierarchyWidths.push(studioEvaluation.result?.value);
					const networkEvaluation = await resources.pageConnection.command("Runtime.evaluate", {
						expression: "window.__runNetworkHierarchyScenario()",
						awaitPromise: true,
						returnByValue: true,
					});
					if (networkEvaluation.exceptionDetails) throw new Error(networkEvaluation.exceptionDetails.exception?.description ?? networkEvaluation.exceptionDetails.text);
					networkHierarchyWidths.push(networkEvaluation.result?.value);
					const genreHierarchyEvaluation = await resources.pageConnection.command("Runtime.evaluate", {
						expression: "window.__runGenreHierarchyScenario()",
						awaitPromise: true,
						returnByValue: true,
					});
					if (genreHierarchyEvaluation.exceptionDetails) throw new Error(genreHierarchyEvaluation.exceptionDetails.exception?.description ?? genreHierarchyEvaluation.exceptionDetails.text);
					genreHierarchyWidths.push(genreHierarchyEvaluation.result?.value);
					const genreNewFolderSummaryEvaluation = await resources.pageConnection.command("Runtime.evaluate", {
						expression: "window.__runGenreNewFolderSummaryScenario()",
						awaitPromise: true,
						returnByValue: true,
					});
					if (genreNewFolderSummaryEvaluation.exceptionDetails) throw new Error(genreNewFolderSummaryEvaluation.exceptionDetails.exception?.description ?? genreNewFolderSummaryEvaluation.exceptionDetails.text);
					genreNewFolderSummaryWidths.push(genreNewFolderSummaryEvaluation.result?.value);
					const streamingHierarchyEvaluation = await resources.pageConnection.command("Runtime.evaluate", {
						expression: `window.__runStreamingHierarchyScenario(${width === 393 || width === 900})`,
						awaitPromise: true,
						returnByValue: true,
					});
					if (streamingHierarchyEvaluation.exceptionDetails) throw new Error(streamingHierarchyEvaluation.exceptionDetails.exception?.description ?? streamingHierarchyEvaluation.exceptionDetails.text);
					streamingHierarchyWidths.push(streamingHierarchyEvaluation.result?.value);
					const streamingAffinityDestinationEvaluation = await resources.pageConnection.command("Runtime.evaluate", {
						expression: "window.__runStreamingAffinityDestinationScenario()",
						awaitPromise: true,
						returnByValue: true,
					});
					if (streamingAffinityDestinationEvaluation.exceptionDetails) throw new Error(streamingAffinityDestinationEvaluation.exceptionDetails.exception?.description ?? streamingAffinityDestinationEvaluation.exceptionDetails.text);
					streamingAffinityDestinationWidths.push(streamingAffinityDestinationEvaluation.result?.value);
					const streamingReconciliationEvaluation = await resources.pageConnection.command("Runtime.evaluate", {
						expression: "window.__runStreamingSelectionReconciliationScenario()",
						awaitPromise: true,
						returnByValue: true,
					});
					if (streamingReconciliationEvaluation.exceptionDetails) throw new Error(streamingReconciliationEvaluation.exceptionDetails.exception?.description ?? streamingReconciliationEvaluation.exceptionDetails.text);
					streamingSelectionReconciliationWidths.push(streamingReconciliationEvaluation.result?.value);
				}
				for (const { width, height } of [
					{ width: 768, height: 1024 },
					{ width: 820, height: 1180 },
					{ width: 834, height: 1194 },
				]) {
					await resources.pageConnection.command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: true });
					const sourceChooserEvaluation = await resources.pageConnection.command("Runtime.evaluate", {
						expression: `window.__runSourceChooserLayoutScenario({ includeGrowthStress: ${width === 768}, includeOrderStress: ${width === 768} })`,
						awaitPromise: true,
						returnByValue: true,
					});
					if (sourceChooserEvaluation.exceptionDetails) throw new Error(sourceChooserEvaluation.exceptionDetails.exception?.description ?? sourceChooserEvaluation.exceptionDetails.text);
					sourceChooserTabletPortraitWidths.push(sourceChooserEvaluation.result?.value);
				}
				await resources.pageConnection.command("Emulation.setDeviceMetricsOverride", { width: 1024, height: 768, deviceScaleFactor: 1, mobile: true });
				const sourceChooserTabletLandscapeEvaluation = await resources.pageConnection.command("Runtime.evaluate", {
					expression: "window.__runSourceChooserLayoutScenario({ includeGrowthStress: true, includeOrderStress: true })",
					awaitPromise: true,
					returnByValue: true,
				});
				if (sourceChooserTabletLandscapeEvaluation.exceptionDetails) throw new Error(sourceChooserTabletLandscapeEvaluation.exceptionDetails.exception?.description ?? sourceChooserTabletLandscapeEvaluation.exceptionDetails.text);
				sourceChooserTabletLandscape = sourceChooserTabletLandscapeEvaluation.result?.value;
				await resources.pageConnection.command("Emulation.setDeviceMetricsOverride", { width: 360, height: 852, deviceScaleFactor: 1, mobile: true });
				const wideFontSourceChooserEvaluation = await resources.pageConnection.command("Runtime.evaluate", {
					expression: `window.__runSourceChooserLayoutScenario({ fontFamily: 'Verdana, sans-serif', includeGrowthStress: true, includeOrderStress: true, includeClassicScrollbarStress: true })`,
					awaitPromise: true,
					returnByValue: true,
				});
				if (wideFontSourceChooserEvaluation.exceptionDetails) throw new Error(wideFontSourceChooserEvaluation.exceptionDetails.exception?.description ?? wideFontSourceChooserEvaluation.exceptionDetails.text);
				wideFontSourceChooser = wideFontSourceChooserEvaluation.result?.value;
				if (launcherOnly) {
					await resources.pageConnection.command("Emulation.setDeviceMetricsOverride", { width: 393, height: 320, deviceScaleFactor: 1, mobile: true });
					const shortSourceChooserEvaluation = await resources.pageConnection.command("Runtime.evaluate", {
						expression: "window.__runSourceChooserLayoutScenario()",
						awaitPromise: true,
						returnByValue: true,
					});
					if (shortSourceChooserEvaluation.exceptionDetails) throw new Error(shortSourceChooserEvaluation.exceptionDetails.exception?.description ?? shortSourceChooserEvaluation.exceptionDetails.text);
					shortHeightSourceChooser = shortSourceChooserEvaluation.result?.value;
					return {
						sourceChooserWidths,
						sourceChooserTabletPortraitWidths,
						sourceChooserTabletLandscape,
						wideFontSourceChooser,
						shortHeightSourceChooser,
					};
				}
				await resources.pageConnection.command("Emulation.setDeviceMetricsOverride", { width: 393, height: 852, deviceScaleFactor: 1, mobile: true });
				const sourceChooserKeyboardBefore = await resources.pageConnection.command("Runtime.evaluate", {
					expression: "window.__prepareSourceChooserKeyboardScenario()",
					awaitPromise: true,
					returnByValue: true,
				});
				if (sourceChooserKeyboardBefore.exceptionDetails) throw new Error(sourceChooserKeyboardBefore.exceptionDetails.exception?.description ?? sourceChooserKeyboardBefore.exceptionDetails.text);
				await resources.pageConnection.command("Input.dispatchKeyEvent", { type: "keyDown", key: "Shift", code: "ShiftLeft", modifiers: 8, windowsVirtualKeyCode: 16, nativeVirtualKeyCode: 16 });
				await resources.pageConnection.command("Input.dispatchKeyEvent", { type: "keyUp", key: "Shift", code: "ShiftLeft", windowsVirtualKeyCode: 16, nativeVirtualKeyCode: 16 });
				const sourceChooserKeyboardFocus = await resources.pageConnection.command("Runtime.evaluate", {
					expression: "window.__inspectSourceChooserKeyboardFocus()",
					returnByValue: true,
				});
				if (sourceChooserKeyboardFocus.exceptionDetails) throw new Error(sourceChooserKeyboardFocus.exceptionDetails.exception?.description ?? sourceChooserKeyboardFocus.exceptionDetails.text);
				await resources.pageConnection.command("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", text: "\r", unmodifiedText: "\r", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
				await resources.pageConnection.command("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
				const sourceChooserKeyboardAfter = await resources.pageConnection.command("Runtime.evaluate", {
					expression: "window.__finishSourceChooserKeyboardScenario()",
					awaitPromise: true,
					returnByValue: true,
				});
				if (sourceChooserKeyboardAfter.exceptionDetails) throw new Error(sourceChooserKeyboardAfter.exceptionDetails.exception?.description ?? sourceChooserKeyboardAfter.exceptionDetails.text);
				sourceChooserKeyboard = { ...sourceChooserKeyboardBefore.result?.value, ...sourceChooserKeyboardFocus.result?.value, ...sourceChooserKeyboardAfter.result?.value };
				const streamingDuplicateEvaluation = await resources.pageConnection.command("Runtime.evaluate", {
					expression: "window.__runStreamingDuplicateConfirmationScenario()",
					awaitPromise: true,
					returnByValue: true,
				});
				if (streamingDuplicateEvaluation.exceptionDetails) throw new Error(streamingDuplicateEvaluation.exceptionDetails.exception?.description ?? streamingDuplicateEvaluation.exceptionDetails.text);
				streamingDuplicateConfirmation = streamingDuplicateEvaluation.result?.value;
				const decadeSourceGenreKeyboardBefore = await resources.pageConnection.command("Runtime.evaluate", {
					expression: "window.__prepareDecadeSourceGenreKeyboardScenario()",
					awaitPromise: true,
					returnByValue: true,
				});
				if (decadeSourceGenreKeyboardBefore.exceptionDetails) throw new Error(decadeSourceGenreKeyboardBefore.exceptionDetails.exception?.description ?? decadeSourceGenreKeyboardBefore.exceptionDetails.text);
				await resources.pageConnection.command("Input.dispatchKeyEvent", { type: "keyDown", key: " ", code: "Space", text: " ", unmodifiedText: " ", windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 });
				await resources.pageConnection.command("Input.dispatchKeyEvent", { type: "keyUp", key: " ", code: "Space", windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 });
				const decadeSourceGenreKeyboardAfter = await resources.pageConnection.command("Runtime.evaluate", {
					expression: "window.__finishDecadeSourceGenreKeyboardScenario()",
					awaitPromise: true,
					returnByValue: true,
				});
				if (decadeSourceGenreKeyboardAfter.exceptionDetails) throw new Error(decadeSourceGenreKeyboardAfter.exceptionDetails.exception?.description ?? decadeSourceGenreKeyboardAfter.exceptionDetails.text);
				decadeSourceGenreKeyboard = { ...decadeSourceGenreKeyboardBefore.result?.value, ...decadeSourceGenreKeyboardAfter.result?.value };
				const networkDeferredArtworkEvaluation = await resources.pageConnection.command("Runtime.evaluate", {
					expression: "window.__runNetworkDeferredArtworkScenario()",
					awaitPromise: true,
					returnByValue: true,
				});
				if (networkDeferredArtworkEvaluation.exceptionDetails) throw new Error(networkDeferredArtworkEvaluation.exceptionDetails.exception?.description ?? networkDeferredArtworkEvaluation.exceptionDetails.text);
				const networkDeferredArtwork = networkDeferredArtworkEvaluation.result?.value;
				for (const width of [393, 900]) {
					await resources.pageConnection.command("Emulation.setDeviceMetricsOverride", { width, height: width <= 520 ? 852 : 900, deviceScaleFactor: 1, mobile: width <= 520 });
					const networkLivePreviewEvaluation = await resources.pageConnection.command("Runtime.evaluate", {
						expression: "window.__runNetworkLivePreviewScenario()",
						awaitPromise: true,
						returnByValue: true,
					});
					if (networkLivePreviewEvaluation.exceptionDetails) throw new Error(networkLivePreviewEvaluation.exceptionDetails.exception?.description ?? networkLivePreviewEvaluation.exceptionDetails.text);
					networkLivePreviewWidths.push(networkLivePreviewEvaluation.result?.value);
					const genreLivePreviewEvaluation = await resources.pageConnection.command("Runtime.evaluate", {
						expression: "window.__runGenreLivePreviewScenario()",
						awaitPromise: true,
						returnByValue: true,
					});
					if (genreLivePreviewEvaluation.exceptionDetails) throw new Error(genreLivePreviewEvaluation.exceptionDetails.exception?.description ?? genreLivePreviewEvaluation.exceptionDetails.text);
					genreLivePreviewWidths.push(genreLivePreviewEvaluation.result?.value);
					const sourceEditLivePreviewEvaluation = await resources.pageConnection.command("Runtime.evaluate", {
						expression: "window.__runSourceEditLivePreviewScenario()",
						awaitPromise: true,
						returnByValue: true,
					});
					if (sourceEditLivePreviewEvaluation.exceptionDetails) throw new Error(sourceEditLivePreviewEvaluation.exceptionDetails.exception?.description ?? sourceEditLivePreviewEvaluation.exceptionDetails.text);
					sourceEditLivePreviewWidths.push(sourceEditLivePreviewEvaluation.result?.value);
					const addSourceLivePreviewParityEvaluation = await resources.pageConnection.command("Runtime.evaluate", {
						expression: "window.__runAddSourceLivePreviewParityScenario()",
						awaitPromise: true,
						returnByValue: true,
					});
					if (addSourceLivePreviewParityEvaluation.exceptionDetails) throw new Error(addSourceLivePreviewParityEvaluation.exceptionDetails.exception?.description ?? addSourceLivePreviewParityEvaluation.exceptionDetails.text);
					addSourceLivePreviewParityWidths.push(addSourceLivePreviewParityEvaluation.result?.value);
					if (process.env.TMDB_DECADES_PREVIEW_DEPLOYED === "1") {
						const decadeSourceLivePreviewEvaluation = await resources.pageConnection.command("Runtime.evaluate", {
							expression: "window.__runDecadeSourceLivePreviewScenario()",
							awaitPromise: true,
							returnByValue: true,
						});
						if (decadeSourceLivePreviewEvaluation.exceptionDetails) throw new Error(decadeSourceLivePreviewEvaluation.exceptionDetails.exception?.description ?? decadeSourceLivePreviewEvaluation.exceptionDetails.text);
						decadeSourceLivePreviewWidths.push(decadeSourceLivePreviewEvaluation.result?.value);
						const decadesLivePreviewEvaluation = await resources.pageConnection.command("Runtime.evaluate", {
							expression: "window.__runDecadesLivePreviewScenario()",
							awaitPromise: true,
							returnByValue: true,
						});
						if (decadesLivePreviewEvaluation.exceptionDetails) throw new Error(decadesLivePreviewEvaluation.exceptionDetails.exception?.description ?? decadesLivePreviewEvaluation.exceptionDetails.text);
						decadesLivePreviewWidths.push(decadesLivePreviewEvaluation.result?.value);
					}
				}
				await resources.pageConnection.command("Emulation.setDeviceMetricsOverride", { width: 393, height: 320, deviceScaleFactor: 1, mobile: true });
				const shortSourceChooserEvaluation = await resources.pageConnection.command("Runtime.evaluate", {
					expression: "window.__runSourceChooserLayoutScenario()",
					awaitPromise: true,
					returnByValue: true,
				});
				if (shortSourceChooserEvaluation.exceptionDetails) throw new Error(shortSourceChooserEvaluation.exceptionDetails.exception?.description ?? shortSourceChooserEvaluation.exceptionDetails.text);
				shortHeightSourceChooser = shortSourceChooserEvaluation.result?.value;
				const shortTmdbListEvaluation = await resources.pageConnection.command("Runtime.evaluate", {
					expression: "window.__runTmdbListLayoutScenario()",
					awaitPromise: true,
					returnByValue: true,
				});
				if (shortTmdbListEvaluation.exceptionDetails) throw new Error(shortTmdbListEvaluation.exceptionDetails.exception?.description ?? shortTmdbListEvaluation.exceptionDetails.text);
				shortHeightTmdbListLayout = shortTmdbListEvaluation.result?.value;
				await resources.pageConnection.command("Emulation.setPageScaleFactor", { pageScaleFactor: 1.1 });
				const shortTmdbListPreviewEvaluation = await resources.pageConnection.command("Runtime.evaluate", {
					expression: "window.__runTmdbListLivePreviewScenario()",
					awaitPromise: true,
					returnByValue: true,
				});
				await resources.pageConnection.command("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
				if (shortTmdbListPreviewEvaluation.exceptionDetails) throw new Error(shortTmdbListPreviewEvaluation.exceptionDetails.exception?.description ?? shortTmdbListPreviewEvaluation.exceptionDetails.text);
				shortHeightTmdbListPreview = shortTmdbListPreviewEvaluation.result?.value;
				const shortPeopleEvaluation = await resources.pageConnection.command("Runtime.evaluate", {
					expression: "window.__runPeopleConfigureLayoutScenario()",
					awaitPromise: true,
					returnByValue: true,
				});
				if (shortPeopleEvaluation.exceptionDetails) throw new Error(shortPeopleEvaluation.exceptionDetails.exception?.description ?? shortPeopleEvaluation.exceptionDetails.text);
				const shortSourceEditEvaluation = await resources.pageConnection.command("Runtime.evaluate", {
					expression: "window.__runSourceEditLivePreviewScenario()",
					awaitPromise: true,
					returnByValue: true,
				});
				if (shortSourceEditEvaluation.exceptionDetails) throw new Error(shortSourceEditEvaluation.exceptionDetails.exception?.description ?? shortSourceEditEvaluation.exceptionDetails.text);
				shortHeightPreviewGeometry = {
					width: 393,
					height: 320,
					people: shortPeopleEvaluation.result?.value?.preview?.geometry,
					sourceEdit: shortSourceEditEvaluation.result?.value?.geometry,
				};
				for (const width of [360, 393, 412, 899, 901, 1280]) {
					await resources.pageConnection.command("Emulation.setDeviceMetricsOverride", { width, height: width <= 412 ? 852 : 900, deviceScaleFactor: 1, mobile: width <= 412 });
					const peopleScrollEvaluation = await resources.pageConnection.command("Runtime.evaluate", {
						expression: "window.__runPeopleSelectionScrollScenario()",
						awaitPromise: true,
						returnByValue: true,
					});
					if (peopleScrollEvaluation.exceptionDetails) throw new Error(peopleScrollEvaluation.exceptionDetails.exception?.description ?? peopleScrollEvaluation.exceptionDetails.text);
					peopleSelectionScrollWidths.push(peopleScrollEvaluation.result?.value);
				}
				await resources.pageConnection.command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
				const decadesGenreDesktopEvaluation = await resources.pageConnection.command("Runtime.evaluate", {
					expression: "window.__runDecadesGenreLayoutScenario()",
					awaitPromise: true,
					returnByValue: true,
				});
				const decadesGenreDesktop = decadesGenreDesktopEvaluation.result?.value;
				const decadesExclusionDesktopEvaluation = await resources.pageConnection.command("Runtime.evaluate", {
					expression: "window.__runDecadesExclusionLayoutScenario()",
					awaitPromise: true,
					returnByValue: true,
				});
				const decadesExclusionDesktop = decadesExclusionDesktopEvaluation.result?.value;
				for (const width of [360, 384, 393, 402, 412, 899, 900, 901, 1280]) {
					await resources.pageConnection.command("Emulation.setDeviceMetricsOverride", { width, height: width <= 412 ? 852 : 900, deviceScaleFactor: 1, mobile: width <= 412 });
					const decadesActionEvaluation = await resources.pageConnection.command("Runtime.evaluate", {
						expression: "window.__runDecadesActionLayoutScenario()",
						awaitPromise: true,
						returnByValue: true,
					});
					if (decadesActionEvaluation.exceptionDetails) throw new Error(decadesActionEvaluation.exceptionDetails.exception?.description ?? decadesActionEvaluation.exceptionDetails.text);
					decadesActionWidths.push(decadesActionEvaluation.result?.value);
				}
				for (const width of [360, 384, 393, 402, 412]) {
					await resources.pageConnection.command("Emulation.setDeviceMetricsOverride", { width, height: 852, deviceScaleFactor: 1, mobile: true });
					const toolbarEvaluation = await resources.pageConnection.command("Runtime.evaluate", {
						expression: "window.__runGenreToolbarScenario()",
						awaitPromise: true,
						returnByValue: true,
					});
					genreToolbarWidths.push(toolbarEvaluation.result?.value);
					const decadesGenreEvaluation = await resources.pageConnection.command("Runtime.evaluate", {
						expression: "window.__runDecadesGenreLayoutScenario()",
						awaitPromise: true,
						returnByValue: true,
					});
					decadesGenreWidths.push(decadesGenreEvaluation.result?.value);
					const decadesExclusionEvaluation = await resources.pageConnection.command("Runtime.evaluate", {
						expression: "window.__runDecadesExclusionLayoutScenario()",
						awaitPromise: true,
						returnByValue: true,
					});
					decadesExclusionWidths.push(decadesExclusionEvaluation.result?.value);
				}
				await resources.pageConnection.command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
				const studioScaleEvaluation = await resources.pageConnection.command("Runtime.evaluate", {
					expression: "window.__runStudioScaleScenario()",
					awaitPromise: true,
					returnByValue: true,
				});
				if (studioScaleEvaluation.exceptionDetails) throw new Error(studioScaleEvaluation.exceptionDetails.exception?.description ?? studioScaleEvaluation.exceptionDetails.text);
				return { ...result.results, sourceChooserWidths, sourceChooserTabletPortraitWidths, sourceChooserTabletLandscape, wideFontSourceChooser, tmdbListLayoutWidths, tmdbListPreviewWidths, sourceChooserKeyboard, shortHeightSourceChooser, shortHeightTmdbListLayout, shortHeightTmdbListPreview, peopleConfigureWidths, peoplePillStabilityWidths, peopleSelectionScrollWidths, franchiseReviewWidths, studioHierarchyWidths, networkHierarchyWidths, genreHierarchyWidths, genreNewFolderSummaryWidths, streamingHierarchyWidths, streamingAffinityDestinationWidths, streamingSelectionReconciliationWidths, streamingDuplicateConfirmation, networkLivePreviewWidths, genreLivePreviewWidths, sourceEditLivePreviewWidths, addSourceLivePreviewParityWidths, decadesLivePreviewWidths, decadeSourceLayoutWidths, decadeSourceOverlapFooterWidths, decadeSourceGenreKeyboard, decadeSourceLivePreviewWidths, shortHeightPreviewGeometry, networkDeferredArtwork, studioScale: studioScaleEvaluation.result?.value, genreToolbarWidths, decadesActionWidths, decadesGenreDesktop, decadesGenreWidths, decadesExclusionDesktop, decadesExclusionWidths };
			}
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
	if (!sourceDetailsOnly && process.env.TMDB_MOUNTED_BROWSER_DIAGNOSTICS === "1") {
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
		console.log(`NETWORK_LIVE_PREVIEW_DIAGNOSTICS ${JSON.stringify(execution.value.networkLivePreviewWidths.map((result) => ({
			width: result.width,
			networkId: result.networkId,
			popular: {
				requestUrl: result.popular.request.url,
				totalResults: result.popular.request.totalResults,
				posterSources: result.popular.preview.posterSources,
				failedPosterSources: result.popular.preview.failedPosterSources,
			},
			recent: {
				requestUrl: result.recent.request.url,
				totalResults: result.recent.request.totalResults,
				posterSources: result.recent.preview.posterSources,
				failedPosterSources: result.recent.preview.failedPosterSources,
			},
			requestCount: result.instrumentation.requestCount,
			cachedPopularRequestCount: result.cachedPopular.requestCount,
			restoredPopularRequestCount: result.restoredPopular.requestCount,
		})))}`);
		console.log(`GENRE_LIVE_PREVIEW_DIAGNOSTICS ${JSON.stringify(execution.value.genreLivePreviewWidths.map((result) => ({
			width: result.width,
			movie: { requestUrl: result.movie.request.url, totalResults: result.movie.request.totalResults, posterSources: result.movie.preview.posterSources },
			series: { requestUrl: result.series.request.url, totalResults: result.series.request.totalResults, posterSources: result.series.preview.posterSources },
			filtered: { requestUrl: result.filtered.request.url, totalResults: result.filtered.request.totalResults, posterSources: result.filtered.preview.posterSources, cacheHit: result.filtered.cacheHit },
			requestCount: result.instrumentation.requestCount,
		})))}`);
		console.log(`STREAMING_HIERARCHY_DIAGNOSTICS ${JSON.stringify(execution.value.streamingHierarchyWidths.map((result) => ({
			width: result.width,
			providerId: result.providerId,
			providerName: result.providerName,
			planTotals: result.review.planTotals,
			livePreview: result.livePreview ? {
				requests: [result.livePreview.movieAu.request, result.livePreview.movieUs.request, result.livePreview.seriesUs.request],
				posters: [result.livePreview.movieAu.preview.visiblePosterCount, result.livePreview.movieUs.preview.visiblePosterCount, result.livePreview.seriesUs.preview.visiblePosterCount],
			} : null,
		})))}`);
		console.log(`PEOPLE_PREVIEW_DIAGNOSTICS ${JSON.stringify(execution.value.peopleConfigureWidths.filter((result) => [393, 900].includes(result.layout.width)).map((result) => ({
			width: result.layout.width,
			posterCount: result.preview.posterCount,
			geometry: result.preview.geometry,
			zeroMutation: result.revisionUnchanged,
		})))}`);
		console.log(`SOURCE_EDIT_PREVIEW_DIAGNOSTICS ${JSON.stringify(execution.value.sourceEditLivePreviewWidths.map((result) => ({
			width: result.width,
			posterCount: result.visiblePosterCount,
			geometry: result.geometry,
			zeroMutation: result.finalNoMutation,
		})))}`);
		console.log(`DECADES_LIVE_PREVIEW_DIAGNOSTICS ${JSON.stringify(execution.value.decadesLivePreviewWidths.map((result) => ({
			width: result.width,
			completedSamplePosterCount: result.movieSamplePosterCount,
			currentSamplePosterCount: result.currentSamplePosterCount,
			futureExactPosterCount: result.futureExact.posterCount,
			futureExactEmpty: result.futureExact.empty,
			futureExactRequests: result.futureExact.requests,
			totalRequestCount: result.totalRequestCount,
			geometry: result.geometry,
			currentGeometry: result.currentGeometry,
			zeroMutation: result.finalNoMutation,
		})))}`);
		console.log(`DECADE_SOURCE_LIVE_PREVIEW_DIAGNOSTICS ${JSON.stringify(execution.value.decadeSourceLivePreviewWidths.map((result) => ({
			width: result.width,
			olderMoviePosterCount: result.firstPreview.moviePosterCount,
			olderSeriesPosterCount: result.firstPreview.seriesPosterCount,
			filteredPosterCount: result.filtered.posterCount,
			requests: [...result.firstPreview.requests, result.filtered.generalRequest, result.filtered.request].map((request) => request.url),
			zeroMutation: result.noMutation,
		})))}`);
		console.log(`SHORT_HEIGHT_PREVIEW_DIAGNOSTICS ${JSON.stringify(execution.value.shortHeightPreviewGeometry)}`);
	}
	return execution.value;
}

let mountedResults;
before(async () => {
	mountedResults = await runMountedPage();
});

function assertTitlePreviewGeometry(geometry, { width, posters = 10, phoneColumns = 3, short = false, label }) {
	const columns = Math.min(width <= 620 ? phoneColumns : 5, posters);
	assert.equal(geometry.centeredHorizontally, true, `${label}: horizontally centred`);
	assert.equal(geometry.centeredVertically, true, `${label}: vertically centred`);
	assert.equal(geometry.withinViewport, true, `${label}: visual viewport bounds`);
	assert.equal(geometry.closeReachable, true, `${label}: Close reachable`);
	assert.equal(geometry.columns, columns, `${label}: poster columns`);
	assert.equal(geometry.rows, Math.ceil(posters / columns), `${label}: poster rows`);
	assert.ok(geometry.posterWidth >= (width <= 520 ? 48 : 80), `${label}: useful poster width ${geometry.posterWidth}`);
	assert.ok(Math.abs((geometry.posterHeight / geometry.posterWidth) - 1.5) <= 0.04, `${label}: poster aspect ratio`);
	assert.ok(geometry.columnGap >= 5 && geometry.columnGap <= 12, `${label}: clean column gap ${geometry.columnGap}`);
	assert.ok(geometry.rowGap >= 5 && geometry.rowGap <= 12, `${label}: clean row gap ${geometry.rowGap}`);
	assert.equal(geometry.gridNoHorizontalScroll, true, `${label}: no poster-grid horizontal scroll`);
	assert.equal(geometry.pageNoHorizontalOverflow, true, `${label}: no page horizontal overflow`);
	assert.equal(geometry.bodyLocked, true, `${label}: underlying body locked`);
	if (short) assert.equal(geometry.activeScrollOwnerCount, 1, `${label}: one overflow scroll owner`);
	else assert.ok(geometry.activeScrollOwnerCount <= 1, `${label}: at most one scroll owner`);
}

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

test("mounted Workspace Source details remain compact, accessible and naturally wrapped", () => {
	assert.equal(mountedResults.sourceDetailsVerified, true);
});

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

test("mounted Genre Browse is browse-first and only focuses Search after explicit interaction", () => {
	const result = mountedResults.genreBrowseFocus;
	assert.deepEqual(result.initial, { searchFocused: false, browseHeadingFocused: true });
	assert.equal(result.explicitFocused, true);
	assert.equal(result.selectionSurvivedFiltering, true);
	assert.equal(result.returnSearchFocused, false);
	assert.equal(result.returnHeadingFocused, true);
	assert.equal(result.returnQuery, "a");
	assert.equal(result.returnSelectionCount, true);
	assert.equal(result.returnScrollTop, 173);
});

test("mounted Genre selection toolbar remains grouped and overflow-free at every required narrow width", () => {
	assert.deepEqual(mountedResults.genreToolbarWidths.map((result) => result.width), [360, 384, 393, 402, 412]);
	for (const result of mountedResults.genreToolbarWidths) {
		assert.equal(result.countPresent, true, `${result.width}px count`);
		assert.equal(result.countUpdated, true, `${result.width}px immediate count`);
		assert.equal(result.actionsGrouped, true, `${result.width}px grouped actions`);
		assert.equal(result.actionsShareRow, true, `${result.width}px action row`);
		assert.equal(result.comfortableTargets, true, `${result.width}px targets`);
		assert.equal(result.disabledInitially, true, `${result.width}px initial Clear all`);
		assert.equal(result.clearEnabledAfterSelection, true, `${result.width}px selected Clear all`);
		assert.equal(result.headingHasWidth, true, `${result.width}px heading width`);
		assert.equal(result.noHorizontalOverflow, true, `${result.width}px overflow`);
	}
});

test("mounted Genre hierarchy preserves browse-first focus, configuration state, atomic apply, and responsive scroll ownership", () => {
	assert.deepEqual(mountedResults.genreHierarchyWidths.map((result) => result.width), [360, 384, 393, 402, 412, 899, 900, 901, 1280]);
	for (const result of mountedResults.genreHierarchyWidths) {
		const width = result.width;
		assert.deepEqual(result.initial, {
			searchFocused: false,
			selectHeadingFocused: true,
			cardCount: 27,
			nativeCheckboxes: true,
		}, `${width}px browse-first selection`);
		assert.deepEqual(result.selectionCountStates.map((state) => state.count), [0, 1, 2, 3, 4, 5, 6, 7, 27], `${width}px selected-summary counts`);
		const zeroSummary = result.selectionCountStates[0];
		assert.equal(zeroSummary.trayPresent, false, `${width}px zero selected tray`);
		assert.equal(zeroSummary.disclosurePresent, false, `${width}px zero selected disclosure`);
		assert.equal(zeroSummary.inlinePillsPresent, false, `${width}px zero selected pills`);
		for (const state of result.selectionCountStates.slice(1)) {
			assert.equal(state.trayPresent, true, `${width}px ${state.count} selected tray`);
			assert.equal(state.countText, `${state.count} Genre${state.count === 1 ? "" : "s"} selected`, `${width}px ${state.count} selected count`);
			assert.equal(state.disclosurePresent, true, `${width}px ${state.count} selected disclosure`);
			assert.equal(state.disclosureLabel, "View selected Genres", `${width}px ${state.count} disclosure label`);
			assert.equal(state.disclosureCollapsed, true, `${width}px ${state.count} collapsed by default`);
			assert.equal(state.inlinePillsPresent, false, `${width}px ${state.count} no inline pills`);
			assert.equal(state.countDisclosureOverlap, false, `${width}px ${state.count} count/disclosure separation`);
			assert.equal(state.removeControlCount, state.count, `${width}px ${state.count} named removal controls`);
			assert.equal(state.noHorizontalOverflow, true, `${width}px ${state.count} selected-summary overflow`);
		}
		assert.deepEqual(result.summaryInteraction.openDisclosureState, {
			opened: true,
			removeControlCount: 7,
			bounded: true,
			scrollableWhenNeeded: true,
			closed: true,
			outerStable: true,
			documentStable: true,
			actionStable: true,
		}, `${width}px selected disclosure interaction`);
		assert.equal(result.summaryInteraction.filteredSelectedCardAbsent, true, `${width}px filtered selected card absent`);
		assert.equal(result.summaryInteraction.filteredRemoveAvailable, true, `${width}px filtered selected removal available`);
		assert.equal(result.summaryInteraction.removedWhileFiltered, true, `${width}px filtered selected removal`);
		assert.equal(result.summaryInteraction.reselectedCount, "7 Genres selected", `${width}px reselected count`);
		assert.deepEqual(result.summaryInteraction.selectedOrder, ["Science Fiction", "Sci-Fi & Fantasy", "War & Politics", "Action", "Adventure", "Animation", "Action & Adventure"], `${width}px selected order`);
		assert.equal(result.summaryInteraction.reselectedAtEnd, true, `${width}px reselect at end`);
		assert.equal(result.summaryInteraction.namedRemoveControls, true, `${width}px named removal controls`);
		assert.equal(result.summaryInteraction.zeroRestored.trayPresent, false, `${width}px clear all restores no summary`);
		assert.deepEqual(result.largeDisclosure, {
			opened: true,
			removeControlCount: 27,
			bounded: true,
			scrollable: true,
			closed: true,
			outerStable: true,
			documentStable: true,
			actionStable: true,
		}, `${width}px 27-Genre disclosure`);
		assert.equal(result.explicitSearchFocused, true, `${width}px explicit Search focus`);
		assert.equal(result.selectedAll, true, `${width}px Select all`);
		assert.deepEqual(result.selectionPresentation, {
			nativeChecked: true,
			markerAbsent: true,
			surfaceRetained: true,
			borderRetained: true,
			structuralInset: true,
		}, `${width}px shared selected-card language`);
		assert.equal(result.focusEvidence.partiallyClipped, true, `${width}px partial-card setup`);
		assert.equal(result.focusEvidence.nativeCheckboxFocused, true, `${width}px native checkbox focus`);
		assert.equal(result.focusEvidence.innerScrollDelta > 0, true, `${width}px inner focus scroll`);
		assert.equal(result.focusEvidence.outerStable, true, `${width}px outer modal stability`);
		assert.equal(result.focusEvidence.documentStable, true, `${width}px document stability`);
		assert.equal(result.focusEvidence.actionStable, true, `${width}px action stability`);
		assert.equal(result.focusEvidence.actionReachable, true, `${width}px reachable sticky action`);
		assert.deepEqual(result.configureState, {
			stage: "configure",
			headingFocused: true,
			bothDefault: true,
			selectedCount: true,
			allConfiguredRowsVisible: true,
			duplicateDisclosuresAbsent: true,
			noDestinationChooser: true,
			noOverride: true,
			contextualSummary: true,
			mediaPills: true,
			sortPills: true,
			pillRounded: true,
			noFixedNoteForBoth: true,
			moviesFixedNote: "8 selected Genres are Series-only and will still create Series sources.",
			seriesFixedNote: "11 selected Genres are Movie-only and will still create Movie sources.",
		}, `${width}px Configure defaults and direct rows`);
		assert.deepEqual(result.secondaryState, {
			open: true,
			scrollInert: true,
			headerInert: true,
			footerHidden: true,
			focusOnHeading: true,
			escapeClosed: true,
			focusRestored: true,
		}, `${width}px Advanced secondary-surface lock`);
		assert.deepEqual(result.structureState, {
			stage: "structure",
			headingFocused: true,
			introCopy: "Choose how Genre folders are arranged within collections on your Nuvio Home screen.",
			genreHierarchyHeadingAbsent: true,
			structureLegendHidden: true,
			choiceCount: 4,
			defaultGenreFolders: true,
			structureCounts: {
				"genre-folders": "1 collection · 27 folders",
				"media-folders": "1 collection · 2 folders",
				"separate-media-genre-folders": "1 collection · 35 folders",
				"separate-media-collections": "2 collections · 35 folders",
			},
			visibleCountsOmitSources: true,
			structureCopy: {
				"genre-folders": { title: "Genre folders", description: "One folder card for each Genre, with its available Movies and Series sources together inside." },
				"media-folders": { title: "Movies & Series folders", description: "Create Movies and Series folder cards as needed, with Genre sources inside each." },
				"separate-media-genre-folders": { title: "Separate Movie & Series Genre folders", description: "Create separate folder cards for each Movie and Series Genre." },
				"separate-media-collections": { title: "Separate Movie & Series collections", description: "Create one Home collection for Movie Genres and another for Series Genres." },
			},
			structureVisualEvidence: {
				previewTypes: ["genre-folders", "media-folders", "separate-media-genre-folders", "separate-media-collections"],
				visualHierarchyComplete: true,
				visualPreviewsBounded: true,
				countsReadable: true,
				descriptionDiagramSpacingConsistent: true,
				rowCountAlignmentPreserved: true,
				selectedStyleClear: true,
				nativeRadioSemantics: true,
				previewsHiddenFromAccessibilityTree: true,
			},
			compositesBelowCards: true,
			compositeHeading: "Where should combined Series genres go?",
			compositeHelper: "TMDB groups some Series genres separately from Movies. Choose whether those Series sources get their own folders or are added to the matching Movie Genre folder(s).",
			optionalPlacementAbsent: true,
			compositeControlCount: 3,
			actionTargets: ["standalone", "Action", "Adventure", "both"],
			actionLabels: ["Keep its own folder", "Add to Action", "Add to Adventure", "Add to both"],
			addToBothCount: "1 collection · 26 folders",
			mediaFoldersSelected: true,
			compositesHiddenForMedia: true,
			genreFoldersReselected: true,
			addToBothPreserved: true,
			separateFoldersShowTitlesDefault: true,
			manualTitleVisibilityPreserved: true,
		}, `${width}px Structure counts and composite lifecycle`);
		assert.deepEqual(result.appearanceState, {
			stage: "appearance",
			headingFocused: true,
			totals: [1, 27, 35],
			hideHomeDefault: true,
			landscapeDefault: true,
			posterAvailable: true,
			configureRowsAbsent: true,
		}, `${width}px Appearance-only final stage`);
		assert.equal(result.structureRestored, true, `${width}px Back restores Structure`);
		assert.equal(result.configureRestored, true, `${width}px Back restores Configure`);
		assert.deepEqual(result.selectRestored, {
			stage: "select",
			query: "a",
			selectedAll: true,
			headingFocused: true,
		}, `${width}px Back restores Select`);
		assert.equal(result.applyCalls, 1, `${width}px apply call count`);
		assert.equal(result.revisionDelta, 1, `${width}px atomic revision`);
		assert.equal(result.folderCount, 27, `${width}px generated folders`);
		assert.equal(result.sourceCount, 35, `${width}px generated sources`);
		assert.deepEqual(result.contextualTitles, {
			comedy: ["Movies", "Series"],
			horror: ["Movies"],
			actionAdventure: ["Series"],
		}, `${width}px contextual hierarchy source titles`);
		assert.equal(result.oneScrollOwner, true, `${width}px one scroll owner`);
		assert.equal(result.noHorizontalOverflow, true, `${width}px horizontal overflow`);
	}
});

test("mounted Genre New Folder uses the same compact selected-items disclosure at every required width", () => {
	assert.deepEqual(mountedResults.genreNewFolderSummaryWidths.map((result) => result.width), [360, 384, 393, 402, 412, 899, 900, 901, 1280]);
	for (const result of mountedResults.genreNewFolderSummaryWidths) {
		const width = result.width;
		assert.equal(result.scope, "new-folder", `${width}px New Folder scope`);
		assert.equal(result.stage, "select", `${width}px New Folder Select stage`);
		assert.equal(result.zero.trayPresent, false, `${width}px New Folder zero summary`);
		assert.equal(result.four.countText, "4 Genres selected", `${width}px New Folder selected count`);
		assert.equal(result.four.disclosurePresent, true, `${width}px New Folder disclosure`);
		assert.equal(result.four.disclosureLabel, "View selected Genres", `${width}px New Folder disclosure label`);
		assert.equal(result.four.disclosureCollapsed, true, `${width}px New Folder disclosure collapsed`);
		assert.equal(result.four.inlinePillsPresent, false, `${width}px New Folder no inline pills`);
		assert.equal(result.four.countDisclosureOverlap, false, `${width}px New Folder count/disclosure separation`);
		assert.equal(result.four.removeControlCount, 4, `${width}px New Folder named removal controls`);
		assert.equal(result.four.noHorizontalOverflow, true, `${width}px New Folder horizontal overflow`);
		assert.equal(result.opened, true, `${width}px New Folder disclosure opens`);
		assert.equal(result.closed, true, `${width}px New Folder disclosure closes`);
		assert.equal(result.oneScrollOwner, true, `${width}px New Folder scroll owner`);
	}
});

test("mounted Genre review rows stay neutral while statuses and elsewhere notice carry meaning", () => {
	const result = mountedResults.genreStatuses;
	assert.deepEqual(result.statuses, ["Already in this folder", "Exists elsewhere", "Ready to add"]);
	assert.equal(result.rowsNeutral, true);
	assert.equal(result.noAttentionAttribute, true);
	assert.equal(result.noticeUsesSharedTreatment, true);
	assert.equal(result.noticeHeading, "A matching source exists elsewhere in this project");
	assert.equal(result.noticeAction, "You can still add it here.");
});

test("mounted Genre exact duplicate overrides use singular and bundle canonical labels", () => {
	assert.deepEqual(mountedResults.genreOverrideLabels, {
		bundleOverride: "Add all anyway",
		bundleNoNew: "No new sources to add",
		singleOverride: "Add anyway",
		singleNoNew: "No new sources to add",
	});
});

test("mounted Add Source chooser uses the responsive Creation launcher language at every required width", () => {
	function assertLauncherModal(modal, expectedPresentation, label) {
		assert.equal(modal.presentation, expectedPresentation, `${label} presentation`);
		assert.equal(modal.backdropTracksVisualViewport, true, `${label} visual viewport tracking`);
		if (expectedPresentation === "contained") {
			assert.ok(modal.horizontalMargin >= 23, `${label} horizontal margin: ${modal.horizontalMargin}`);
			assert.ok(modal.dialog.borderWidth > 0, `${label} dialog border: ${modal.dialog.borderWidth}`);
			assert.ok(modal.dialog.borderRadius >= 16, `${label} dialog radius: ${modal.dialog.borderRadius}`);
			assert.notEqual(modal.dialog.boxShadow, "none", `${label} dialog shadow`);
		} else {
			assert.ok(modal.horizontalMargin <= 1, `${label} fullscreen horizontal edge: ${modal.horizontalMargin}`);
			assert.equal(modal.dialog.borderWidth, 0, `${label} fullscreen border`);
			assert.equal(modal.dialog.borderRadius, 0, `${label} fullscreen radius`);
		}
	}
	function variantEvidence(variant) {
		return `cards=${variant.cardCount} rows=${variant.rowCounts.join("/")} spread=${variant.rowHeightSpread}px card=${variant.cardWidth}px title=${variant.titleWidth}px helper=${variant.helperWidth}px helperLines=${variant.maxHelperLines} scroll=${variant.grid.scrollActive} gutter=${variant.grid.gutter}px grid=${variant.grid.clientWidth}/${variant.grid.offsetWidth}/${variant.grid.scrollWidth}px`;
	}
	function contentSafetyEvidence(result) {
		const safety = result.contentSafety;
		return `cardWidthSpread=${safety.cardWidthSpread}px rowGaps=${safety.rowGaps.join("/")}px intendedGap=${safety.intendedRowGap}px dimensions=${safety.validCardDimensions} icons=${safety.iconsContained} titles=${safety.titlesContained} helpers=${safety.helpersContained} copies=${safety.copiesContained} text=${safety.textUnclipped} cardOverflow=${safety.cardContentOverflowFree} cardOverlap=${safety.noCardOverlap} rowOverlap=${safety.noRowOverlap} grid=${safety.gridContainedByModal} modal=${safety.modalContainedByViewport}`;
	}
	function assertContentSafety(result, label) {
		const safety = result.contentSafety;
		const evidence = contentSafetyEvidence(result);
		assert.equal(safety.validCardDimensions, true, `${label} positive card dimensions; ${evidence}`);
		assert.equal(safety.iconsContained, true, `${label} icon containment; ${evidence}`);
		assert.equal(safety.titlesContained, true, `${label} title containment; ${evidence}`);
		assert.equal(safety.helpersContained, true, `${label} helper containment; ${evidence}`);
		assert.equal(safety.copiesContained, true, `${label} copy containment; ${evidence}`);
		assert.equal(safety.textUnclipped, true, `${label} unclipped text; ${evidence}`);
		assert.equal(safety.cardContentOverflowFree, true, `${label} card content overflow; ${evidence}`);
		assert.equal(safety.cardsContainedByGridHorizontally, true, `${label} card/grid containment; ${evidence}`);
		assert.equal(safety.noCardOverlap, true, `${label} card overlap; ${evidence}`);
		assert.equal(safety.noRowOverlap, true, `${label} row overlap; ${evidence}`);
		assert.equal(safety.rowSpacingValid, true, `${label} rendered row gap; ${evidence}`);
		assert.equal(safety.stableCardWidths, true, `${label} stable card widths; ${evidence}`);
		assert.equal(safety.gridContainedByModal, true, `${label} grid/modal containment; ${evidence}`);
		assert.equal(safety.modalContainedByViewport, true, `${label} modal/viewport containment; ${evidence}`);
		assert.equal(result.oneScrollOwner, true, `${label} one scroll owner; ${evidence}`);
		assert.equal(result.noHorizontalOverflow, true, `${label} horizontal overflow; ${evidence}`);
		assert.equal(result.finalCardReachable, true, `${label} final-card reachability; ${evidence}`);
	}
	function assertIntrinsicVariant(variant, expectedCardCount, expectedColumns, label) {
		assert.equal(variant.cardCount, expectedCardCount, `${label} card count; ${variantEvidence(variant)}`);
		assert.equal(variant.columnCount, expectedColumns, `${label} columns; ${variantEvidence(variant)}`);
		assertContentSafety(variant, label);
	}
	function assertIntrinsicStress(stress, currentCount, expectedColumns, label) {
		assert.deepEqual(stress.growth.map((variant) => variant.extraCount), [0, 3, 6], `${label} growth cases`);
		for (const variant of stress.growth) assertIntrinsicVariant(variant, currentCount + variant.extraCount, expectedColumns, `${label} +${variant.extraCount}`);
		assert.equal(stress.order.length, 3, `${label} order cases`);
		for (const variant of stress.order) assertIntrinsicVariant(variant, currentCount, expectedColumns, variant.name);
		assert.equal(stress.classicScrollbar, null, `${label} no desktop scrollbar override`);
	}
	function assertMobileVariant(variant, expectedCardCount, label) {
		const evidence = variantEvidence(variant);
		assert.equal(variant.cardCount, expectedCardCount, `${label} card count; ${evidence}`);
		assert.equal(variant.columnCount, 2, `${label} columns; ${evidence}`);
		assert.ok(variant.rowHeightSpread <= 14, `${label} balanced row heights; ${evidence}`);
		assert.ok(variant.minCardHeight >= 87, `${label} 87px card floor; ${evidence}`);
		assert.equal(variant.cardWidthSpread, 0, `${label} uniform card widths; ${evidence}`);
		assert.equal(variant.helperWidthSpread, 0, `${label} uniform helper widths; ${evidence}`);
		assert.ok(variant.helperWidth >= variant.titleWidth + 41, `${label} full-width helper gain; ${evidence}`);
		assert.ok(variant.maxHelperLines <= 3, `${label} readable helper wrapping; ${evidence}`);
		assert.equal(variant.fullWidthHelpers, true, `${label} helpers span both card columns; ${evidence}`);
		assert.equal(variant.topRowsAligned, true, `${label} icon/title top-row alignment; ${evidence}`);
		assert.equal(variant.oneScrollOwner, true, `${label} one scroll owner; ${evidence}`);
		assert.equal(variant.noHorizontalOverflow, true, `${label} horizontal overflow; ${evidence}`);
		assert.equal(variant.finalCardReachable, true, `${label} final-card reachability; ${evidence}`);
	}
	function assertGrowthStress(stress, currentCount, label) {
		assert.deepEqual(stress.growth.map((variant) => variant.extraCount), [0, 3, 6], `${label} growth cases`);
		for (const variant of stress.growth) assertMobileVariant(variant, currentCount + variant.extraCount, `${label} +${variant.extraCount}`);
		const [current, plusThree, plusSix] = stress.growth;
		assert.equal(plusThree.cardWidth, current.cardWidth, `${label} +3 stable card width`);
		assert.equal(plusThree.helperWidth, current.helperWidth, `${label} +3 stable helper width`);
		if (!plusSix.grid.scrollActive) {
			assert.equal(plusSix.cardWidth, current.cardWidth, `${label} +6 stable card width before scrolling`);
			assert.equal(plusSix.helperWidth, current.helperWidth, `${label} +6 stable helper width before scrolling`);
		} else {
			assert.ok(plusSix.cardWidth <= current.cardWidth, `${label} +6 scrollbar card width`);
			assert.ok(plusSix.helperWidth <= current.helperWidth, `${label} +6 scrollbar helper width`);
		}
	}
	function assertOrderStress(stress, currentCount, label) {
		assert.deepEqual(stress.order.map((variant) => variant.name.split(" ").at(-1)), ["current", "longest-adjacent", "longest-separated"], `${label} order cases`);
		for (const variant of stress.order) assertMobileVariant(variant, currentCount, variant.name);
	}
	function assertClassicScrollbarStress(stress, currentCount, label) {
		const variant = stress.classicScrollbar;
		assert.ok(variant, `${label} classic-scrollbar case`);
		assertMobileVariant(variant, currentCount + 9, variant.name);
		assert.equal(variant.forceScrollbar, true, `${label} forced scrollbar`);
		assert.equal(variant.grid.overflowY, "scroll", `${label} scrollbar overflow contract`);
		assert.ok(variant.grid.gutter >= 0, `${label} non-negative scrollbar gutter`);
		assert.ok(variant.cardWidth <= stress.growth[0].cardWidth, `${label} scrollbar card width`);
		assert.ok(variant.helperWidth <= stress.growth[0].helperWidth, `${label} scrollbar helper width`);
	}
	const expectedModes = [
		"tmdb-movie-franchise",
		"tmdb-lists",
		"tmdb-people",
		"tmdb-studios",
		"tmdb-networks",
		"tmdb-streaming-services",
		"tmdb-genres",
		"tmdb-decade",
	];
	const expectedCreationIds = ["blank", "decades", "people", "franchises", "tmdb-lists", "studios", "networks", "genres", "streaming-services"];
	const expectedCreationLabels = ["Blank", "Decades", "People", "Franchises", "TMDB Lists", "Studios", "Networks", "Genres", "Streaming"];
	const expectedCreationHelpers = [
		"Start manually.",
		"Build by decade or year.",
		"Build around actors or directors.",
		"Build from a movie franchise.",
		"Build from public TMDB lists.",
		"Build from movie or TV studios.",
		"Build from TV networks.",
		"Build by genre.",
		"Build from streaming services.",
	];
	assert.deepEqual(mountedResults.sourceChooserWidths.map((result) => result.width), [360, 384, 393, 402, 412, 899, 900, 901, 1280]);
	for (const result of mountedResults.sourceChooserWidths) {
		const width = result.width;
		const expectedPresentation = width <= 620 ? "phone-fullscreen" : "contained";
		assertLauncherModal(result.modal, expectedPresentation, `${width}px Add Source`);
		assert.deepEqual(result.modeIds, expectedModes, `${width}px registry order`);
		assert.equal(result.cardCount, 8, `${width}px card count`);
		assert.equal(result.columnCount, width <= 620 ? 2 : 4, `${width}px responsive columns`);
		assert.equal(result.balancedRows, true, `${width}px balanced rows`);
		assert.equal(result.firstOptionFocused, true, `${width}px first-option focus`);
		assert.equal(result.iconShellsMatchCreation, true, `${width}px icon shells`);
		assert.equal(result.comfortableTargets, true, `${width}px hit targets`);
		assert.equal(result.helpersContained, true, `${width}px helper containment`);
		assert.ok(result.maxHelperLines <= 6, `${width}px readable helper wrapping: ${result.maxHelperLines}`);
		const sourceGeometryEvidence = result.cardGeometry.map((card) => (
			`${card.label}: cardTop=${card.card.top}px card=${card.card.width}x${card.card.height}px display=${card.display} grid=${card.gridTemplateColumns} gap=${card.gap} padding=${card.padding.top}/${card.padding.right}/${card.padding.bottom}/${card.padding.left} iconWidth=${card.iconWidth}px copyWidth=${card.copyWidth}px titleLines=${card.title.lines} helperLines=${card.helper.lines}`
		)).join(" | ");
		if (width <= 620) assert.ok(result.rowHeightSpread <= 14, `${width}px Add Source balanced row heights: ${result.rowHeightSpread}; ${sourceGeometryEvidence}`);
		else assertContentSafety(result, `${width}px Add Source`);
		assert.equal(result.oneScrollOwner, true, `${width}px scroll owner`);
		assert.equal(result.introductoryCopy, "Choose what you want to add.", `${width}px introductory copy`);
		assert.equal(result.introductoryAlignment, expectedPresentation === "phone-fullscreen" ? "center" : "left", `${width}px intentional introductory alignment`);
		assert.equal(result.introductoryDisplay, "block", `${width}px ordinary introductory flow`);
		assert.equal(result.blanketProviderDisclosureAbsent, true, `${width}px blanket provider disclosure absent`);
		assert.equal(result.noEmptyDisclosureWrapper, true, `${width}px no empty disclosure wrapper`);
		assert.equal(result.noSelectionControls, true, `${width}px no retained selection semantics`);
		assert.equal(result.noSearchAutofocus, true, `${width}px no Search autofocus`);
		assert.equal(result.noArrowLayout, true, `${width}px no old arrow list`);
		assert.equal(result.noHorizontalOverflow, true, `${width}px horizontal overflow`);
		assert.equal(result.bodyLocked, true, `${width}px body lock`);
		assert.equal(result.finalCardReachable, true, `${width}px final card reachability`);
		assert.equal(result.immediateDestination, true, `${width}px immediate navigation`);
		assert.equal(result.backRestoredFocus, true, `${width}px Back focus restoration`);
		assert.equal(result.closeRestoredTrigger, true, `${width}px Close focus restoration`);
		assert.equal(result.escapeClosed, true, `${width}px Escape close`);
		assert.equal(result.escapeRestoredTrigger, true, `${width}px Escape focus restoration`);
		assert.equal(result.bodyRestored, true, `${width}px body restoration`);
		assert.equal(result.noMutation, true, `${width}px chooser navigation mutation`);
		if (width <= 412) {
			assertGrowthStress(result.stress, 8, `${width}px Add Source`);
			assert.deepEqual(result.stress.growth.map((variant) => variant.grid.scrollActive), [false, false, false], `${width}px Add Source growth scroll behavior`);
			if (width === 360) {
				assertOrderStress(result.stress, 8, "360px Add Source");
				assertClassicScrollbarStress(result.stress, 8, "360px Add Source");
			}
		} else if (width === 1280) assertIntrinsicStress(result.stress, 8, 4, "1280px Add Source");
		else assert.deepEqual(result.stress, { growth: [], order: [], classicScrollbar: null }, `${width}px no launcher stress fixture`);
		assert.deepEqual(result.creationChoosers.map((chooser) => chooser.scope), ["new-collection", "new-folder"], `${width}px Creation scopes`);
		for (const chooser of result.creationChoosers) {
			assertLauncherModal(chooser.modal, expectedPresentation, `${width}px ${chooser.scope}`);
			assert.deepEqual(chooser.optionIds, expectedCreationIds, `${width}px ${chooser.scope} option order`);
			assert.deepEqual(chooser.labels, expectedCreationLabels, `${width}px ${chooser.scope} labels`);
			assert.deepEqual(chooser.helpers, expectedCreationHelpers, `${width}px ${chooser.scope} helpers`);
			assert.equal(chooser.cardCount, 9, `${width}px ${chooser.scope} card count`);
			assert.equal(chooser.columnCount, width <= 620 ? 2 : 4, `${width}px ${chooser.scope} responsive columns`);
			assert.deepEqual(chooser.rowCounts, width <= 620 ? [2, 2, 2, 2, 1] : [4, 4, 1], `${width}px ${chooser.scope} balanced rows`);
			const geometryEvidence = chooser.cardGeometry.map((card) => (
				`${card.label}: cardTop=${card.card.top}px card=${card.card.width}x${card.card.height}px display=${card.display} grid=${card.gridTemplateColumns} gap=${card.gap} padding=${card.padding.top}/${card.padding.right}/${card.padding.bottom}/${card.padding.left} iconWidth=${card.iconWidth}px copyWidth=${card.copyWidth}px copyGrid=${card.copyGridTemplateColumns} titleWidth=${card.title.clientWidth}px titleLines=${card.title.lines} titleFont=${card.title.fontFamily}/${card.title.fontSize}/${card.title.fontWeight}/${card.title.lineHeight} helperWidth=${card.helper.clientWidth}px helperLines=${card.helper.lines} helperFont=${card.helper.fontFamily}/${card.helper.fontSize}/${card.helper.fontWeight}/${card.helper.lineHeight}`
			)).join(" | ");
			if (width <= 620) assert.ok(chooser.rowHeightSpread <= 14, `${width}px ${chooser.scope} balanced row heights: ${chooser.rowHeightSpread}; launcherGrid=${chooser.grid.width}px/${chooser.grid.gridTemplateColumns}/gap ${chooser.grid.gap}; ${geometryEvidence}`);
			else assertContentSafety(chooser, `${width}px ${chooser.scope}`);
			assert.equal(chooser.firstOptionFocused, true, `${width}px ${chooser.scope} first-option focus`);
			assert.equal(chooser.iconShellsCorrect, true, `${width}px ${chooser.scope} icon shells`);
			assert.equal(chooser.comfortableTargets, true, `${width}px ${chooser.scope} tap targets`);
			assert.equal(chooser.cardsContained, true, `${width}px ${chooser.scope} card containment`);
			assert.equal(chooser.helpersContained, true, `${width}px ${chooser.scope} helper containment`);
			assert.ok(chooser.maxHelperLines <= 3, `${width}px ${chooser.scope} helper wrapping: ${chooser.maxHelperLines}`);
			assert.equal(chooser.oneScrollOwner, true, `${width}px ${chooser.scope} scroll owner`);
			assert.equal(chooser.noHorizontalOverflow, true, `${width}px ${chooser.scope} horizontal overflow`);
			assert.equal(chooser.finalCardReachable, true, `${width}px ${chooser.scope} final card reachability`);
			assert.equal(chooser.bodyRestored, true, `${width}px ${chooser.scope} body restoration`);
			if (width <= 412) {
				assertGrowthStress(chooser.stress, 9, `${width}px ${chooser.scope}`);
				assert.deepEqual(chooser.stress.growth.slice(0, 2).map((variant) => variant.grid.scrollActive), [false, false], `${width}px ${chooser.scope} current/+3 scroll behavior`);
				if (width === 360) {
					assertOrderStress(chooser.stress, 9, `360px ${chooser.scope}`);
					assertClassicScrollbarStress(chooser.stress, 9, `360px ${chooser.scope}`);
				}
			} else if (width === 1280) assertIntrinsicStress(chooser.stress, 9, 4, `1280px ${chooser.scope}`);
			else assert.deepEqual(chooser.stress, { growth: [], order: [], classicScrollbar: null }, `${width}px ${chooser.scope} no launcher stress fixture`);
		}
	}
	const tabletResults = [...mountedResults.sourceChooserTabletPortraitWidths, mountedResults.sourceChooserTabletLandscape];
	assert.deepEqual(
		tabletResults.map((result) => ({ width: result.width, height: result.height })),
		[
			{ width: 768, height: 1024 },
			{ width: 820, height: 1180 },
			{ width: 834, height: 1194 },
			{ width: 1024, height: 768 },
		],
	);
	for (const result of tabletResults) {
		const size = `${result.width}x${result.height}`;
		const expectedColumns = result.width < 900 ? 3 : 4;
		assertLauncherModal(result.modal, "contained", `${size} Add Source`);
		assert.equal(result.columnCount, expectedColumns, `${size} Add Source columns`);
		assertContentSafety(result, `${size} Add Source`);
		assert.equal(result.oneScrollOwner, true, `${size} Add Source scroll owner`);
		assert.equal(result.noHorizontalOverflow, true, `${size} Add Source horizontal overflow`);
		assert.equal(result.bodyLocked, true, `${size} Add Source body lock`);
		assert.equal(result.finalCardReachable, true, `${size} Add Source final card reachability`);
		assert.equal(result.closeRestoredTrigger, true, `${size} Add Source focus restoration`);
		if (result.width === 768 || result.width === 1024) assertIntrinsicStress(result.stress, 8, expectedColumns, `${size} Add Source`);
		else assert.deepEqual(result.stress, { growth: [], order: [], classicScrollbar: null }, `${size} Add Source no stress fixture`);
		for (const chooser of result.creationChoosers) {
			assertLauncherModal(chooser.modal, "contained", `${size} ${chooser.scope}`);
			assert.equal(chooser.columnCount, expectedColumns, `${size} ${chooser.scope} columns`);
			assertContentSafety(chooser, `${size} ${chooser.scope}`);
			assert.equal(chooser.oneScrollOwner, true, `${size} ${chooser.scope} scroll owner`);
			assert.equal(chooser.noHorizontalOverflow, true, `${size} ${chooser.scope} horizontal overflow`);
			assert.equal(chooser.finalCardReachable, true, `${size} ${chooser.scope} final card reachability`);
			assert.equal(chooser.bodyRestored, true, `${size} ${chooser.scope} body restoration`);
			if (result.width === 768 || result.width === 1024) assertIntrinsicStress(chooser.stress, 9, expectedColumns, `${size} ${chooser.scope}`);
			else assert.deepEqual(chooser.stress, { growth: [], order: [], classicScrollbar: null }, `${size} ${chooser.scope} no stress fixture`);
		}
	}
	const wideFont = mountedResults.wideFontSourceChooser;
	assert.deepEqual({ width: wideFont.width, height: wideFont.height, fontFamily: wideFont.fontFamily }, { width: 360, height: 852, fontFamily: "Verdana, sans-serif" });
	assertLauncherModal(wideFont.modal, "phone-fullscreen", "360px wide-font Add Source");
	assert.equal(wideFont.iconShellsMatchCreation, true, "360px wide-font Add Source icon shells");
	assert.ok(wideFont.rowHeightSpread <= 14, `360px wide-font Add Source balanced row heights: ${wideFont.rowHeightSpread}`);
	assertGrowthStress(wideFont.stress, 8, "360px wide-font Add Source");
	assertOrderStress(wideFont.stress, 8, "360px wide-font Add Source");
	assertClassicScrollbarStress(wideFont.stress, 8, "360px wide-font Add Source");
	for (const chooser of wideFont.creationChoosers) {
		assertLauncherModal(chooser.modal, "phone-fullscreen", `360px wide-font ${chooser.scope}`);
		assert.equal(chooser.iconShellsCorrect, true, `360px wide-font ${chooser.scope} icon shells`);
		assert.ok(chooser.rowHeightSpread <= 14, `360px wide-font ${chooser.scope} balanced row heights: ${chooser.rowHeightSpread}`);
		assertGrowthStress(chooser.stress, 9, `360px wide-font ${chooser.scope}`);
		assertOrderStress(chooser.stress, 9, `360px wide-font ${chooser.scope}`);
		assertClassicScrollbarStress(chooser.stress, 9, `360px wide-font ${chooser.scope}`);
	}
});

test("mounted Add Source chooser remains reachable in the retained 393 by 320 short-height case", () => {
	const result = mountedResults.shortHeightSourceChooser;
	assert.deepEqual({ width: result.width, height: result.height }, { width: 393, height: 320 });
	assert.equal(result.modal.presentation, "phone-fullscreen");
	assert.equal(result.modal.backdropTracksVisualViewport, true);
	assert.equal(result.columnCount, 2);
	assert.ok(result.rowHeightSpread <= 14, `short-height Add Source balanced row heights: ${result.rowHeightSpread}`);
	assert.ok(result.cardGeometry.every((card) => card.card.height >= 87), "short-height Add Source 87px card floor");
	assert.ok(result.cardGeometry.every((card) => card.helper.clientWidth >= card.title.clientWidth + 41), "short-height Add Source full-width helpers");
	assert.ok(result.cardGeometry.every((card) => card.gridTemplateColumns.startsWith("36px ") && card.gap === "2px 6px"), "short-height Add Source two-row card geometry");
	assert.equal(result.oneScrollOwner, true);
	assert.equal(result.introductoryCopy, "Choose what you want to add.");
	assert.equal(result.introductoryAlignment, "center");
	assert.equal(result.introductoryDisplay, "block");
	assert.equal(result.blanketProviderDisclosureAbsent, true);
	assert.equal(result.noEmptyDisclosureWrapper, true);
	assert.equal(result.noHorizontalOverflow, true);
	assert.equal(result.finalCardReachable, true);
	assert.equal(result.backRestoredFocus, true);
	assert.equal(result.escapeClosed, true);
	assert.equal(result.noMutation, true);
	for (const chooser of result.creationChoosers) {
		assert.equal(chooser.modal.presentation, "phone-fullscreen", `${chooser.scope} short-height presentation`);
		assert.equal(chooser.modal.backdropTracksVisualViewport, true, `${chooser.scope} short-height visual viewport tracking`);
		assert.equal(chooser.columnCount, 2, `${chooser.scope} short-height columns`);
		assert.deepEqual(chooser.rowCounts, [2, 2, 2, 2, 1], `${chooser.scope} short-height rows`);
		assert.ok(chooser.rowHeightSpread <= 14, `${chooser.scope} short-height balanced row heights: ${chooser.rowHeightSpread}`);
		assert.ok(chooser.cardGeometry.every((card) => card.card.height >= 87), `${chooser.scope} short-height 87px card floor`);
		assert.ok(chooser.cardGeometry.every((card) => card.helper.clientWidth >= card.title.clientWidth + 41), `${chooser.scope} short-height full-width helpers`);
		assert.ok(chooser.cardGeometry.every((card) => card.gridTemplateColumns.startsWith("36px ") && card.gap === "2px 6px"), `${chooser.scope} short-height two-row card geometry`);
		assert.equal(chooser.cardsContained, true, `${chooser.scope} short-height card containment`);
		assert.equal(chooser.helpersContained, true, `${chooser.scope} short-height helper containment`);
		assert.equal(chooser.oneScrollOwner, true, `${chooser.scope} short-height scroll owner`);
		assert.equal(chooser.noHorizontalOverflow, true, `${chooser.scope} short-height horizontal overflow`);
		assert.equal(chooser.finalCardReachable, true, `${chooser.scope} short-height final card reachability`);
	}
});

test("mounted TMDB Lists stays incremental, preview-safe, and responsive across the complete pre-deploy matrix", () => {
	assert.deepEqual(mountedResults.tmdbListLayoutWidths.map((result) => result.width), [360, 384, 393, 402, 412, 899, 900, 901, 1280]);
	assert.deepEqual(
		{ width: mountedResults.shortHeightTmdbListLayout.width, height: mountedResults.shortHeightTmdbListLayout.height },
		{ width: 393, height: 320 },
	);
	for (const result of [...mountedResults.tmdbListLayoutWidths, mountedResults.shortHeightTmdbListLayout]) {
		const label = `${result.width}x${result.height}`;
		assert.equal(result.noSearchAutofocus, true, `${label} no Search autofocus`);
		assert.deepEqual(result.selection, {
			count: 18,
			inputPreservedAfterPartialFailure: true,
			errorIdentification: true,
			longErrorContained: true,
			longErrorAccessible: true,
			resolveClearContained: true,
			staleErrorsCleared: true,
			unchangedNoNetwork: true,
			unchangedNoWarning: true,
			genuineDuplicateReported: true,
			incrementalOnlyNewNetwork: true,
			incrementalOrder: true,
			clearHadInputError: true,
			clearInputCleared: true,
			clearPreservedSelection: true,
			reviewEnabledAfterClear: true,
			multilineInputUsable: true,
			rowsContained: true,
			finalItemReachable: true,
			oneScrollOwner: true,
			darkBuilderControl: true,
			builderTypography: true,
			compactRegularTypography: true,
			typographyLineCounts: [2, 12, 26],
			mutedPlaceholder: true,
			verticalResize: true,
			focusReachable: true,
			caretVisible: true,
		}, `${label} selection`);
		assert.deepEqual(result.review, {
			stageKicker: "Review",
			headerDescription: "Review exact List-ID placement before applying everything atomically.",
			count: 20,
			countLabel: "20 sources will be added",
			actionCopy: "Add 20 sources",
			rowsContained: true,
			oneScrollOwner: true,
			footerReachable: true,
			noSearchMediaOrSort: true,
			originalOrder: true,
			sourceNameHelpers: true,
			noPreviewActions: true,
			noContainerPresentation: true,
		}, `${label} review`);
		assert.equal(result.focusContained, true, `${label} focus containment`);
		assert.equal(result.genericTitlesLabel, true, `${label} generic Titles label`);
		assert.equal(result.previewWithinViewport, true, `${label} nested Preview bounds`);
		assert.equal(result.nestedBodyLocked, true, `${label} nested Preview body lock`);
		assert.equal(result.previewFocusRestored, true, `${label} Preview focus restoration`);
		assert.equal(result.backPreservedSelection, true, `${label} Back state preservation`);
		assert.equal(result.backPreviewAvailable, true, `${label} Back restores Choose Preview`);
		assert.deepEqual(result.guidedNewCollection, {
			scope: "new-collection",
			stageKicker: "Review & Appearance",
			headerDescription: "Review names, appearance and exact List-ID placement before creating everything atomically.",
			selectedCount: 4,
			namesInitiallyEmpty: true,
			collectionNamePresent: true,
			collectionControlsPresent: true,
			folderControlsPresent: true,
			defaultTabs: true,
			defaultShowAll: true,
			defaultCollectionVisible: true,
			defaultUnpinned: true,
			defaultFolderHomeHidden: true,
			defaultPoster: true,
			originalOrder: true,
			noReviewPreview: true,
			focusGlowHidden: true,
			sourceNameHelpers: true,
			initialRequiredValidation: {
				message: "Collection and folder names are required.",
				collectionInvalid: true,
				folderInvalid: true,
				firstMissingFocused: true,
				messageContained: true,
				placement: result.width >= 900 ? "right" : "stacked",
			},
			folderOnlyValidation: {
				message: "Folder name is required.",
				collectionInvalid: false,
				folderInvalid: true,
				folderFocused: true,
			},
			requiredValidationCleared: true,
			validationNoMutation: true,
			actionCopy: "Create collection",
			actionLineCount: result.guidedNewCollection.actionLineCount,
			oneScrollOwner: true,
			footerReachable: true,
			noHorizontalOverflow: true,
			backPreservedSelection: true,
			backPreviewAvailable: true,
		}, `${label} guided New Collection`);
		assert.ok(result.guidedNewCollection.actionLineCount <= 2, `${label} New Collection action wrapping`);
		assert.deepEqual(result.guidedNewFolder, {
			scope: "new-folder",
			stageKicker: "Review & Appearance",
			headerDescription: "Review names, appearance and exact List-ID placement before creating everything atomically.",
			selectedCount: 1,
			namesInitiallyEmpty: true,
			collectionNamePresent: false,
			collectionControlsPresent: false,
			folderControlsPresent: true,
			defaultTabs: null,
			defaultShowAll: null,
			defaultCollectionVisible: false,
			defaultUnpinned: false,
			defaultFolderHomeHidden: true,
			defaultPoster: true,
			originalOrder: true,
			noReviewPreview: true,
			focusGlowHidden: true,
			sourceNameHelpers: true,
			initialRequiredValidation: {
				message: "Folder name is required.",
				collectionInvalid: false,
				folderInvalid: true,
				firstMissingFocused: true,
				messageContained: true,
				placement: result.width >= 900 ? "right" : "stacked",
			},
			folderOnlyValidation: null,
			requiredValidationCleared: true,
			validationNoMutation: true,
			actionCopy: "Create folder",
			actionLineCount: result.guidedNewFolder.actionLineCount,
			oneScrollOwner: true,
			footerReachable: true,
			noHorizontalOverflow: true,
			backPreservedSelection: true,
			backPreviewAvailable: true,
		}, `${label} guided New Folder`);
		assert.ok(result.guidedNewFolder.actionLineCount <= 2, `${label} New Folder action wrapping`);
		assert.deepEqual(result.sourceEdit, {
			linkText: "5916",
			href: "https://www.themoviedb.org/list/5916",
			target: "_blank",
			rel: "noopener noreferrer",
			accessibleName: "Open this TMDB list on TMDB (list 5916)",
			numericLinkOnly: true,
			linkContained: true,
			previewAvailable: true,
			sourceNameHelper: "This is the name shown in Nuvio. You can customise it.",
			oneScrollOwner: true,
			noHorizontalOverflow: true,
			noMutation: true,
		}, `${label} Source Edit List link`);
		assert.equal(result.bodyLocked, true, `${label} body lock`);
		assert.equal(result.noHorizontalOverflow, true, `${label} horizontal containment`);
		assert.equal(result.noMutation, true, `${label} non-mutation`);
		assert.deepEqual({ backCalls: result.backCalls, cancelCalls: result.cancelCalls, applyCalls: result.applyCalls }, { backCalls: 0, cancelCalls: 0, applyCalls: 0 }, `${label} no external action`);
	}
});

test("mounted TMDB List Preview keeps fixed geometry while the complete live page-one sample scrolls internally", () => {
	const results = [...mountedResults.tmdbListPreviewWidths, mountedResults.shortHeightTmdbListPreview];
	assert.deepEqual(mountedResults.tmdbListPreviewWidths.map((result) => result.width), [360, 384, 393, 402, 412, 899, 900, 901, 1280]);
	assert.deepEqual(
		{ width: mountedResults.shortHeightTmdbListPreview.width, height: mountedResults.shortHeightTmdbListPreview.height },
		{ width: 393, height: 320 },
	);
	assert.deepEqual(results[0].requestPaths, [
		"/3/list/5916?language=en-US&page=1",
		"/3/list/8679739?language=en-US&page=1",
	]);
	for (const [index, result] of results.entries()) {
		const label = `${result.width}x${result.height}`;
		const initial = result.initialMusicals.geometry;
		const bottom = result.scrolledMusicals.geometry;
		const expectedColumns = result.width <= 620 ? 3 : 5;
		assert.ok([0, 2].includes(result.requestsAfterResolve - result.requestCountBeforeResolve), `${label} resolve uses cache or two exact live requests`);
		assert.equal(result.initialMusicals.title, "Musicals", `${label} live long-list title`);
		assert.equal(result.initialMusicals.subtitle, "Showing 20 of 124 titles", `${label} truthful partial subtitle`);
		assert.equal(result.initialMusicals.rendered, 20, `${label} complete page-one sample rendered at open`);
		assert.equal(result.initialMusicals.loaded, 20, `${label} twenty page-one titles loaded`);
		assert.equal(result.initialMusicals.completeSample, true, `${label} complete-sample presentation`);
		assert.equal(result.initialMusicals.requests, result.requestsAfterResolve, `${label} Preview open uses cache`);
		assert.equal(result.initialMusicals.bodyLocked, true, `${label} background body lock`);
		assert.equal(result.initialMusicals.noLoadMore, true, `${label} no Load more control`);
		assert.equal(initial.posterCount, 20, `${label} all page-one posters exist before scroll`);
		assert.equal(initial.columns, expectedColumns, `${label} responsive poster columns`);
		if (result.width <= 412) {
			assert.ok(initial.viewportScale > 1, `${label} exercises a narrowed live Visual Viewport`);
			assert.ok(initial.viewportWidth < result.width, `${label} Visual Viewport is narrower than layout viewport`);
		} else {
			assert.equal(initial.viewportScale, 1, `${label} unscaled larger-screen Visual Viewport`);
		}
		assert.ok(initial.posterWidth >= (result.width <= 520 ? 48 : 80), `${label} established poster width ${initial.posterWidth}`);
		assert.ok(Math.abs((initial.posterHeight / initial.posterWidth) - 1.5) <= 0.04, `${label} established poster aspect ratio`);
		assert.equal(initial.verticalScrollable, true, `${label} internal vertical overflow at open`);
		assert.equal(initial.verticalScrollOnly, true, `${label} vertical-only Preview scroll`);
		assert.equal(initial.gridScrollWidth <= initial.gridClientWidth + 1, true, `${label} scrollWidth <= clientWidth`);
		assert.equal(initial.gridScrollLeft, 0, `${label} grid starts without horizontal displacement`);
		assert.equal(initial.allPosterRectsHaveSize, true, `${label} every mounted poster has real geometry`);
		assert.equal(initial.allPosterRectsInlineContained, true, `${label} every mounted poster rect is inline-contained`);
		assert.equal(initial.gridInlineContained, true, `${label} grid is inline-contained by modal and Visual Viewport`);
		assert.equal(initial.closeReachable, true, `${label} Close remains inside the Visual Viewport`);
		assert.equal(initial.backdropMatchesVisualViewport, true, `${label} nested backdrop matches the live Visual Viewport`);
		assert.equal(initial.outerDialogWithinVisualViewport, true, `${label} outer dialog remains inside the live Visual Viewport`);
		assert.equal(initial.safeHorizontalMargins, true, `${label} modal keeps safe horizontal margins`);
		assert.equal(initial.oneScrollOwner, true, `${label} one intended internal scroll owner`);
		assert.equal(initial.dingoScrollbarClass, true, `${label} shared Dingo scrollbar class`);
		assert.equal(initial.scrollbarColor, "rgb(70, 118, 136) rgb(4, 16, 23)", `${label} shared Dingo scrollbar colors`);
		assert.equal(initial.scrollbarWidth, "auto", `${label} shared Dingo scrollbar width`);
		assert.equal(initial.scrollbarThumbBackground, "rgb(70, 118, 136)", `${label} shared Dingo scrollbar thumb`);
		assert.equal(initial.withinViewport, true, `${label} fixed modal remains within viewport`);
		assert.equal(initial.pageNoHorizontalOverflow, true, `${label} no page horizontal overflow`);
		for (const [phase, geometry] of [["wheel", result.wheelGeometry], ["touch", result.touchGeometry], ["bottom", bottom]]) {
			assert.equal(geometry.modalLeft, initial.modalLeft, `${label} ${phase} keeps modal left`);
			assert.equal(geometry.modalTop, initial.modalTop, `${label} ${phase} keeps modal top`);
			assert.equal(geometry.modalWidth, initial.modalWidth, `${label} ${phase} keeps modal width`);
			assert.equal(geometry.modalHeight, initial.modalHeight, `${label} ${phase} keeps modal height`);
			assert.equal(geometry.headerTop, initial.headerTop, `${label} ${phase} keeps header top`);
			assert.equal(geometry.headerBottom, initial.headerBottom, `${label} ${phase} keeps header bottom`);
			assert.equal(geometry.gridClientWidth, initial.gridClientWidth, `${label} ${phase} keeps grid width`);
			assert.equal(geometry.gridClientHeight, initial.gridClientHeight, `${label} ${phase} keeps grid height`);
			assert.equal(geometry.gridScrollHeight, initial.gridScrollHeight, `${label} ${phase} appends no layout content`);
			assert.equal(geometry.gridScrollLeft, 0, `${label} ${phase} causes no horizontal movement`);
			assert.equal(geometry.posterCount, 20, `${label} ${phase} keeps complete sample mounted`);
			assert.equal(geometry.allPosterRectsInlineContained, true, `${label} ${phase} keeps every poster rect inline-contained`);
			assert.equal(geometry.closeReachable, true, `${label} ${phase} keeps Close reachable`);
			assert.equal(geometry.backdropMatchesVisualViewport, true, `${label} ${phase} keeps Visual Viewport backdrop bounds`);
			assert.equal(geometry.verticalScrollOnly, true, `${label} ${phase} remains vertical-only`);
		}
		assert.equal(result.scrolledMusicals.rendered, 20, `${label} complete sample remains rendered`);
		assert.equal(result.scrolledMusicals.loaded, 20, `${label} loaded sample remains bounded`);
		assert.equal(result.scrolledMusicals.completeSample, true, `${label} complete sample remains marked`);
		assert.equal(result.scrolledMusicals.requests, result.requestsAfterResolve, `${label} scrolling issues no request`);
		assert.ok(bottom.gridScrollTop > 0, `${label} vertical scrolling advances`);
		assert.equal(bottom.atVerticalScrollEnd, true, `${label} vertical scrolling reaches the loaded sample end`);
		assert.equal(bottom.lastPosterReachable, true, `${label} final loaded page-one poster reachable`);
		assert.equal(result.focusRestored, true, `${label} long Preview focus restoration`);
		assert.equal(result.reopenStartsAtTop, true, `${label} reopen returns to top`);
		assert.equal(result.requestsAfterReopen, result.requestsAfterResolve, `${label} reopen cache`);
		assert.equal(result.completeSmallList.title, "Top 10 Netflix Movies", `${label} complete-list title`);
		assert.equal(result.completeSmallList.subtitle, "Showing all 10 titles", `${label} truthful complete-list subtitle`);
		assert.equal(result.completeSmallList.rendered, 10, `${label} complete ten-title sample`);
		assert.equal(result.completeSmallList.loaded, 10, `${label} complete ten-title loaded count`);
		assert.equal(result.completeSmallList.completeSample, true, `${label} complete ten-title marker`);
		assert.equal(result.completeSmallList.geometry.modalWidth, initial.modalWidth, `${label} long and ten-title modal widths match`);
		assert.equal(result.completeSmallList.geometry.modalHeight, initial.modalHeight, `${label} long and ten-title modal heights match`);
		assert.equal(result.completeSmallList.geometry.columns, expectedColumns, `${label} ten-title responsive columns`);
		assert.equal(result.completeSmallList.geometry.allPosterRectsInlineContained, true, `${label} every ten-title poster rect is inline-contained`);
		assert.equal(result.completeSmallList.geometry.closeReachable, true, `${label} ten-title Close remains reachable`);
		assert.ok(Math.abs(result.completeSmallList.geometry.posterWidth - initial.posterWidth) <= 4, `${label} long-list poster width preserves ten-title sizing`);
		assert.equal(result.completeSmallList.geometry.verticalScrollOnly, true, `${label} ten-title grid has no horizontal overflow`);
		assert.equal(result.requestsAfterSmallScroll, result.requestsAfterResolve, `${label} scrolling issues no request`);
		assert.equal(result.noMutation, true, `${label} Preview non-mutation`);
		assert.equal(result.outerBodyLockPreserved, true, `${label} outer dialog body lock preserved`);
		assert.ok(result.requestPaths.every((path) => path.endsWith("?language=en-US&page=1") && !path.includes("page=2")), `${label} page-one-only requests`);
		if (index > 0) assert.equal(result.requestsAfterResolve, results[0].requestsAfterResolve, `${label} shared bounded success cache`);
	}
});

test("mounted native Add Source card supports trusted keyboard activation and originating-card focus restoration", () => {
	assert.deepEqual(mountedResults.sourceChooserKeyboard, {
		focused: true,
		nativeButton: true,
		focusVisible: true,
		focusBorderVisible: true,
		keyboardDestination: true,
		backRestoredFocus: true,
		closeRestoredTrigger: true,
		noMutation: true,
	});
});

test("mounted Blank collection and folder creation immediately unlock the next manual action", () => {
	assert.deepEqual(mountedResults.blankCreation, {
		peopleFocus: {
			newCollection: {
				initialBrowseHeading: true,
				explicitSearch: true,
				backToLauncher: true,
				reentryBrowseHeading: true,
				cancelRestoredCanonicalTrigger: true,
				revisionUnchanged: true,
			},
			newFolder: {
				legacyLauncherAbsent: true,
				initialBrowseHeading: true,
				explicitSearch: true,
				backToLauncher: true,
				reentryBrowseHeading: true,
				cancelRestoredCanonicalTrigger: true,
				revisionUnchanged: true,
			},
		},
		collection: {
			dialogClosed: true,
			revisionDelta: 1,
			selected: true,
			defaults: {
				id: "nuvio-1",
				title: "Untitled Collection",
				pinToTop: false,
				focusGlowEnabled: true,
				viewMode: "TABBED_GRID",
				showAllTab: true,
			},
			newFolderEnabled: true,
		},
		folder: {
			dialogClosed: true,
			revisionDelta: 1,
			selected: true,
			parentPreserved: true,
			defaults: { id: "nuvio-2", title: "Untitled Folder", tileShape: "POSTER", hideTitle: true },
			addSourceEnabled: true,
		},
	});
});

test("mounted People Configure stays compact, editable, preview-safe, and overflow-free at every owner width", () => {
	assert.deepEqual(mountedResults.peopleConfigureWidths.map((result) => result.layout.width), [360, 384, 393, 402, 412, 899, 900, 901, 1280]);
	for (const result of mountedResults.peopleConfigureWidths) {
		const width = result.layout.width;
		assert.deepEqual(result.selectionAffordance, {
			nativeCheckbox: true,
			keyboardFocusable: true,
			inputVisuallyHidden: true,
			focusOwnedByCard: true,
			markerAbsent: true,
			cardClickToggled: true,
			accessibleChecked: true,
			selectedCard: true,
			borderRetained: true,
			structuralInset: true,
		}, `${width}px selection affordance`);
		assert.deepEqual(result.automaticOverride.firstSelections, ["Acting Movies", "Acting Series", "Directed Movies"], `${width}px Automatic override`);
		assert.deepEqual(result.automaticOverride.secondSelections, ["Acting Movies", "Acting Series", "Directed Movies", "Directed Series"], `${width}px untouched defaults`);
		assert.equal(result.automaticOverride.automaticActive, true, `${width}px Automatic remains selected`);
		assert.equal(result.automaticOverride.customAbsent, true, `${width}px no Custom global mode`);
		assert.equal(result.automaticOverride.notificationAbsent, true, `${width}px no mode-transition status`);
		assert.equal(result.sharedOverride.sharedVisible, true, `${width}px shared pills`);
		assert.equal(result.sharedOverride.sharedModeActive, true, `${width}px Same for all remains selected`);
		assert.equal(result.sharedOverride.customAbsent, true, `${width}px shared has no Custom mode`);
		assert.equal(result.sharedOverride.notificationAbsent, true, `${width}px shared has no transition notice`);
		assert.equal(result.sharedOverride.existingOverridePreserved, true, `${width}px existing override survives shared changes`);
		assert.equal(result.sharedOverride.sharedChangesReachedUnmodified, true, `${width}px shared changes reach unmodified person`);
		assert.deepEqual(result.sharedOverride.firstSelections, ["Acting Movies", "Acting Series", "Directed Movies"], `${width}px shared starting state`);
		assert.deepEqual(result.sharedOverride.secondSelections, ["Acting Movies", "Acting Series", "Directed Movies"], `${width}px individual shared override`);
		assert.equal(result.layout.modeChoices, 2, `${width}px visible modes`);
		assert.equal(result.layout.helperCopyAbsent, true, `${width}px redundant helper removed`);
		assert.equal(result.layout.rowCount, 2, `${width}px rows`);
		assert.equal(result.layout.pillCount, 8, `${width}px row pills`);
		assert.equal(result.layout.pillColumns, width <= 520 ? 2 : 4, `${width}px pill columns`);
		assert.equal(result.layout.pillsFit, true, `${width}px pill fit`);
		assert.equal(result.layout.sortChoices, 3, `${width}px sorts`);
		assert.equal(result.layout.previewActions, 2, `${width}px preview actions`);
		assert.equal(result.layout.listBounded, true, `${width}px bounded list`);
		assert.equal(result.layout.continueReachable, true, `${width}px Continue`);
		assert.equal(result.layout.noHorizontalOverflow, true, `${width}px document overflow`);
		assert.equal(result.layout.noNestedScrollTrap, true, `${width}px scroll ownership`);
		assert.equal(result.preview.posterCount, 10, `${width}px preview limit`);
		assert.equal(result.preview.postersReady, true, `${width}px loaded Movie posters`);
		assert.equal(result.preview.genuineTmdbSources, true, `${width}px genuine TMDB Movie poster sources`);
		assert.equal(result.preview.modalSurface, true, `${width}px preview modal`);
		assert.equal(result.preview.outsidePeopleRow, true, `${width}px preview outside row flow`);
		assert.equal(result.preview.gridColumns, 5, `${width}px preview columns`);
		assertTitlePreviewGeometry(result.preview.geometry, { width, phoneColumns: 5, label: `${width}px People Preview` });
		assert.equal(result.preview.posterOnly, true, `${width}px poster-only`);
		assert.equal(result.preview.noHorizontalOverflow, true, `${width}px preview overflow`);
		assert.equal(result.preview.headingFocused, true, `${width}px preview focus`);
		assert.equal(result.preview.sharedNestedLayer, true, `${width}px shared nested preview layer`);
		assert.equal(result.preview.aboveCreationModal, true, `${width}px preview above creation modal`);
		assert.deepEqual(result.preview.mediaSeparation, {
			tabCount: 2,
			moviesInitiallyActive: true,
			seriesActive: true,
			moviePosterCount: 10,
			seriesPosterCount: 10,
			seriesCount: true,
			seriesPostersReady: true,
			seriesGenuineTmdbSources: true,
			noCombinedTotal: true,
			noAdditionalRequests: true,
		}, `${width}px media-separated People Preview`);
		assert.equal(result.preview.escapeClosed, true, `${width}px Escape`);
		assert.equal(result.preview.escapeRestoredFocus, true, `${width}px Escape restore`);
		assert.equal(result.preview.closeRestoredFocus, true, `${width}px Close restore`);
		assert.equal(result.reviewReached, true, `${width}px Review`);
		assert.equal(result.appearance.posterDefault, true, `${width}px Poster default`);
		assert.equal(result.appearance.shapeChoices, 2, `${width}px folder shape choices`);
		assert.equal(result.appearance.titleOptionsPresent, true, `${width}px Title options`);
		assert.equal(result.appearance.collectionTitleVisibilityPresent, true, `${width}px collection title visibility`);
		assert.equal(result.appearance.folderTitleChoices, 3, `${width}px folder title choices`);
		assert.equal(result.appearance.folderTitleDefault, true, `${width}px accepted folder title default`);
		assert.equal(result.appearance.titleOptionsBeforeLayout, true, `${width}px Title options before Layout`);
		assert.equal(result.appearance.layoutControlsVisible, true, `${width}px Layout controls visible`);
		assert.equal(result.appearance.tabsShowAllVisibleEnabled, true, `${width}px People Tabs Show All default`);
		assert.deepEqual(result.appearance.showAllSpacing, { separateSiblings: true, cssGap: 14, actualGap: 14, noOverlap: true }, `${width}px People Show All separation`);
		assert.equal(result.appearance.rowsHidesShowAll, true, `${width}px People Rows hides Show All`);
		assert.equal(result.appearance.rowsToTabsRestoresEnabled, true, `${width}px People Rows to Tabs restores Show All`);
		assert.equal(result.appearance.personSelectorAbsent, true, `${width}px no person artwork selector`);
		assert.equal(result.appearance.artworkFields, 0, `${width}px no hierarchy artwork URL fields`);
		assert.equal(result.appearance.focusOverrideAbsent, true, `${width}px no hierarchy focus override`);
		assert.equal(result.appearance.guidance, "Each person’s Hero, Title Logo and Focus artwork will use the canonical People defaults. To customise artwork links later, edit that person’s folder.", `${width}px canonical artwork guidance`);
		assert.equal(result.appearance.personDetailsPresent, true, `${width}px person details reachable`);
		assert.equal(result.appearance.backReviewPreserved, true, `${width}px Landscape survives Back and Review`);
		assert.equal(result.appearance.folderTitleBackReviewPreserved, true, `${width}px folder title choice survives Back and Review`);
		assert.equal(result.appearance.createReachable, true, `${width}px Create action`);
		assert.equal(result.appearance.noDeadEditor, true, `${width}px removed editor leaves no dead container`);
		assert.equal(result.appearance.noHorizontalOverflow, true, `${width}px appearance overflow`);
		assert.equal(result.sortSurvivesReviewBack, true, `${width}px sort preservation`);
		assert.equal(result.liveRequests.personDetailsOnly, true, `${width}px production TMDB Person detail requests`);
		assert.equal(result.revisionUnchanged, true, `${width}px preview/configure mutation`);
	}
});

test("mounted People source pills keep intrinsic equivalent height for 1, 2, 5, and 20 people", () => {
	assert.deepEqual(mountedResults.peoplePillStabilityWidths.map((result) => result.width), [360, 384, 393, 402, 412, 899, 900, 901, 1280]);
	for (const result of mountedResults.peoplePillStabilityWidths) {
		const width = result.width;
		assert.deepEqual(result.snapshots.map((snapshot) => snapshot.count), [1, 2, 5, 20], `${width}px fixture counts`);
		const expectedHeights = result.snapshots[0].pillHeights;
		for (const snapshot of result.snapshots) {
			assert.equal(snapshot.rowCount, snapshot.count, `${width}px ${snapshot.count}-person rows`);
			assert.equal(snapshot.pillCount, snapshot.count * 4, `${width}px ${snapshot.count}-person pills`);
			assert.deepEqual(snapshot.pillHeights, expectedHeights, `${width}px ${snapshot.count}-person equivalent pill heights`);
			assert.equal(snapshot.allPillsCompact, true, `${width}px ${snapshot.count}-person compact pills`);
			assert.equal(snapshot.rowsIntrinsic, true, `${width}px ${snapshot.count}-person intrinsic rows`);
			assert.equal(snapshot.listOverflowAuto, true, `${width}px ${snapshot.count}-person bounded list owner`);
			assert.equal(snapshot.inputsAccessible, true, `${width}px ${snapshot.count}-person accessible editable controls`);
			assert.equal(snapshot.selectedAndUnselectedPresent, true, `${width}px ${snapshot.count}-person selected/unselected states`);
			assert.equal(snapshot.countsReadable, true, `${width}px ${snapshot.count}-person counts`);
			assert.equal(snapshot.actionsAligned, true, `${width}px ${snapshot.count}-person Preview/Remove alignment`);
			assert.equal(snapshot.noHorizontalOverflow, true, `${width}px ${snapshot.count}-person overflow`);
		}
		assert.ok(result.snapshots[0].firstRowTopOffset <= 1.5, `${width}px one person stays at list top`);
		assert.ok(result.snapshots[0].unusedSpaceBelow > 40, `${width}px one person leaves unused list space below`);
		assert.equal(result.snapshots.at(-1).listScrollable, true, `${width}px 20-person list scrolls`);
	}
});

test("mounted Franchise review corrections remain layered, compact, state-safe, and responsive at every owner width", () => {
	assert.deepEqual(mountedResults.franchiseReviewWidths.map((result) => result.width), [360, 384, 393, 402, 412, 899, 900, 901, 1280]);
	for (const result of mountedResults.franchiseReviewWidths) {
		const width = result.width;
		assert.equal(result.selectedActions.visiblePreviewLabel, "Preview", `${width}px compact Preview label`);
		assert.match(result.selectedActions.previewAccessibleLabel, /^Preview titles for /, `${width}px Preview accessible label`);
		assert.match(result.selectedActions.removeAccessibleLabel, /^Remove /, `${width}px remove accessible label`);
		assert.equal(result.selectedActions.previewTouchSafe, true, `${width}px Preview touch target`);
		assert.equal(result.selectedActions.removeTouchSafe, true, `${width}px remove touch target`);
		assert.equal(result.selectedActions.adequateGap, true, `${width}px selected action spacing`);
		assert.equal(result.selectedActions.longRowFits, true, `${width}px long selected name fit`);
		for (const [origin, preview] of [["Select", result.selectPreview], ["Review", result.reviewPreview]]) {
			assert.equal(preview.aboveCreationModal, true, `${width}px ${origin} preview layer`);
			assert.equal(preview.sharedNestedLayer, true, `${width}px ${origin} shared layer`);
			assert.equal(preview.modalSurface, true, `${width}px ${origin} modal semantics`);
			assert.equal(preview.noHorizontalOverflow, true, `${width}px ${origin} preview overflow`);
			assert.equal(preview.exactFocusRestored, true, `${width}px ${origin} exact trigger restoration`);
			assert.equal(preview.outerStable, true, `${width}px ${origin} outer scroll position`);
			assert.equal(preview.posterCount, 10, `${width}px ${origin} full bounded poster grid`);
			assertTitlePreviewGeometry(preview.geometry, { width, label: `${width}px Franchise ${origin} Preview` });
			assert.equal(preview.postersReady, true, `${width}px ${origin} loaded posters`);
			assert.equal(preview.genuineTmdbSources, true, `${width}px ${origin} genuine TMDB poster sources`);
			assert.equal(preview.posterOnly, true, `${width}px ${origin} poster-only results`);
			assert.equal(preview.captionsAbsent, true, `${width}px ${origin} result captions absent`);
			assert.equal(preview.missingCardsAbsent, true, `${width}px ${origin} missing-poster cards absent`);
		}
		assert.equal(result.selectPreview.focusEntered, true, `${width}px Select preview focus entry`);
		assert.equal(result.selectPreview.focusContained, true, `${width}px Select preview focus containment`);
		assert.equal(result.selectPreview.escapeClosed, true, `${width}px Select preview Escape`);
		assert.equal(result.selectPreview.selectionPreserved, true, `${width}px Select preview state preservation`);
		assert.equal(result.reviewPreview.closeClosed, true, `${width}px Review preview Close`);
		assert.equal(result.reviewPreview.previewOpenedWithoutExpanding, true, `${width}px collapsed Review preview opens directly`);
		assert.equal(result.reviewPreview.remainedCollapsedAfterPreview, true, `${width}px Review row stays collapsed after preview`);
		assert.equal(result.selection.removalWorked, true, `${width}px selected removal`);
		assert.equal(result.selection.reselectionOrderPreserved, true, `${width}px removal/reselection order`);
		assert.equal(result.liveRequests.collectionDetailsOnly, true, `${width}px production TMDB Collection detail requests`);
		assert.equal(result.review.artworkGuidance, "Franchise folders use the TMDB collection poster by default. You can change the artwork later in Edit Folder.", `${width}px user-facing artwork guidance`);
		assert.equal(result.review.technicalArtworkCopyAbsent, true, `${width}px technical artwork wording absent`);
		assert.equal(result.review.shapeSelectorAbsent, true, `${width}px no Franchise shape selector`);
		assert.equal(result.review.collapsedRow.previewDirectlyVisible, true, `${width}px collapsed Preview titles visibility`);
		assert.equal(result.review.collapsedRow.previewInsideSummary, true, `${width}px Preview belongs to visible summary row`);
		assert.equal(result.review.collapsedRow.longNameReadable, true, `${width}px long Review name readability`);
		assert.equal(result.review.collapsedRow.statusAndPreviewFit, true, `${width}px status and Preview fit`);
		assert.equal(result.review.detailDisclosure.independentlyExpandable, true, `${width}px independent detail disclosure`);
		assert.equal(result.review.detailDisclosure.metadataPresent, true, `${width}px expanded placement metadata`);
		assert.equal(result.review.detailDisclosure.duplicateExplanationPresent, true, `${width}px expanded duplicate explanation`);
		assert.equal(result.review.tabsInitiallyEnabled, true, `${width}px Tabs Show All default`);
		assert.deepEqual(result.review.showAllSpacing, { separateSiblings: true, cssGap: 14, actualGap: 14, noOverlap: true }, `${width}px Franchise Show All separation`);
		assert.equal(result.review.rowsHidesShowAll, true, `${width}px Rows hides Show All`);
		assert.equal(result.review.rowsToTabsRestoresEnabled, true, `${width}px Rows to Tabs restores Show All`);
		assert.equal(result.review.createReachable, true, `${width}px sticky Create action`);
		assert.equal(result.oneScrollOwner, true, `${width}px one scroll owner`);
		assert.equal(result.noHorizontalOverflow, true, `${width}px flow overflow`);
		assert.equal(result.revisionUnchanged, true, `${width}px preview/removal non-mutation`);
	}
});

test("mounted Studio hierarchy keeps Preview explicit, lazy, cached, focus-safe, and responsive at every owner width", () => {
	assert.deepEqual(mountedResults.studioHierarchyWidths.map((result) => result.width), [360, 384, 393, 402, 412, 899, 900, 901, 1280]);
	for (const result of mountedResults.studioHierarchyWidths) {
		const width = result.width;
		assert.deepEqual(result.search, {
			realIdentitiesFound: true,
			numericMovieCounts: true,
			previewAbsent: true,
			movieCountFilter: true,
			hideZeroAbsent: true,
			mostMoviesPresent: true,
			alphaOverridePresent: true,
			requestsBeforeSelection: 0,
		}, `${width}px Search`);
		assert.deepEqual(result.selection, { selectedCount: 2, checkboxesNative: true }, `${width}px selection`);
		assert.deepEqual(result.selectPreview, { absent: true, removePresent: true, requests: 0 }, `${width}px Select disclosure has Remove without Preview`);
		assert.deepEqual(result.configure.defaults, { movies: true, popular: true, requestFree: true, helperCopy: "These choices apply to every selected Studio.", oldDefaultsCopyAbsent: true }, `${width}px defaults and quiet Configure helper`);
		assert.deepEqual(result.configure.rows, {
			initialCount: 2,
			order: [3, 174],
			countsPresent: true,
			placementPresent: true,
			previewActions: 2,
			removeLabelsAccessible: true,
			disclosureAbsent: true,
			afterFirstRemoval: 1,
			lastRemovalStayedConfigure: true,
			emptyState: true,
			appearanceDisabled: true,
			filterPreserved: true,
			reselectedOrder: [3, 174],
		}, `${width}px Configure rows, removal and canonical reselection`);
		assert.deepEqual(result.configure.configureMoviePreview, {
			requests: 1,
			moviePopularRequest: true,
			visiblePosters: 10,
			postersReady: true,
			genuineTmdbSources: true,
			posterOnly: true,
			captionsAbsent: true,
			missingCardsAbsent: true,
			countWithMedia: true,
			focusEntered: true,
			sharedLayer: true,
			modalSemantics: true,
			technicalCopyAbsent: true,
			exactFocusRestored: true,
			outerStable: true,
		}, `${width}px configured poster-only Movies Preview`);
		assert.deepEqual(result.configure.lazySeries, {
			unopenedMadeNoRequest: true,
			explicitTabAddedOne: true,
			countInPreview: true,
			postersReady: true,
			genuineTmdbSources: true,
			countRetained: true,
		}, `${width}px lazy Series`);
		assert.equal(result.configure.countSurvivesSort, true, `${width}px transient Series count survives sort`);
		assert.equal(result.configure.recentMovieAddedOne, true, `${width}px Movie sort-key request`);
		assert.equal(result.configure.recentSeriesAddedOne, true, `${width}px Series sort-key request`);
		assert.equal(result.configure.recentSeriesCountRetained, true, `${width}px recent Series total retained`);
		assert.equal(result.configure.previousSortCacheHit, true, `${width}px previous-sort cache reuse`);
		assert.deepEqual(result.appearance, {
			requestFree: true,
			heading: "Appearance",
			studioRowsAbsent: true,
			previewAbsent: true,
			countsAbsent: true,
			artworkSectionAbsent: true,
			representativeAbsent: true,
			artworkCopyAbsent: true,
			shapeSelectorAbsent: true,
			presentationControlsPresent: true,
			createAction: "Create collection",
		}, `${width}px Appearance-only final stage`);
		assert.deepEqual(result.artwork, { loads: 1, resolves: 2, loadSucceeded: true, shapeSelectorAbsent: true }, `${width}px live artwork batch`);
		assert.equal(result.oneScrollOwner, true, `${width}px scroll ownership`);
		assert.equal(result.noHorizontalOverflow, true, `${width}px dialog overflow`);
		assert.equal(result.revisionUnchanged, true, `${width}px pre-apply mutation`);
	}
});

test("mounted Network hierarchy remains catalogue-backed, request-free before Preview, and responsive through Appearance", () => {
	assert.deepEqual(mountedResults.networkHierarchyWidths.map((result) => result.width), [360, 384, 393, 402, 412, 899, 900, 901, 1280]);
	for (const result of mountedResults.networkHierarchyWidths) {
		const width = result.width;
		assert.deepEqual(result.search, {
			focus: { searchFocused: false, autoFocusAttributeAbsent: true, keyboardTargetAbsent: true },
			filterLabels: ["All", "Exclude 0", "10+", "50+", "100+", "500+"],
			orderLabels: ["A–Z", "Most series"],
			allDefault: true,
			mostSeriesDefault: true,
			pageSize: 20,
			countsShown: true,
			countsDescending: true,
			knownZeroShownByAll: true,
			previewAbsent: true,
			previewCalls: 0,
		}, `${width}px checked-in Network Search`);
		assert.equal(result.filters.pageReset, true, `${width}px filter resets pagination`);
		assert.equal(result.filters.orderPageReset, true, `${width}px order resets pagination`);
		assert.equal(result.filters.fiveHundredCounts.length, 20, `${width}px 500+ page size`);
		assert.equal(result.filters.fiveHundredCounts.every((count) => count >= 500), true, `${width}px 500+ catalogue semantics`);
		assert.equal(result.filters.excludeZeroActive, true, `${width}px Exclude 0 remains selected`);
		assert.deepEqual(result.selection, {
			selectedCount: 2,
			nativeCheckboxes: true,
			selectedSurfaces: true,
			markersAbsent: true,
			selectionPreservedAcrossFilter: true,
			filterPreserved: true,
		}, `${width}px native Network selection`);
		assert.deepEqual(result.restoration, {
			query: "",
			pageTwo: true,
			filter: true,
			order: true,
			selectedCount: 2,
			scroll: true,
		}, `${width}px Network discovery state after Configure Back`);
		assert.deepEqual(result.configure, {
			rowIds: [2, 18],
			focusEntered: true,
			catalogueCountsPresent: true,
			exactCountsAbsent: true,
			previewActions: 2,
			previewModalAbsent: true,
			previewCalls: 0,
			popularDefault: true,
			sortLabels: ["Popular", "Recent", "Top rated", "Most voted"],
			sortChangeRequestFree: true,
		}, `${width}px request-free Configure`);
		assert.deepEqual(result.appearance, {
			heading: "Appearance",
			planTotals: [1, 2, 2],
			posterDefault: true,
			landscapeSelected: true,
			previewAbsent: true,
			previewCalls: 0,
		}, `${width}px production artwork choices`);
		assert.deepEqual(result.artwork.posterBatch, {
			loads: 1,
			resolves: 2,
			orientations: ["poster", "poster"],
			loadSucceeded: true,
		}, `${width}px Poster artwork batch`);
		assert.equal(result.artwork.loads, 2, `${width}px one production artwork load per orientation batch`);
		assert.equal(result.artwork.resolves, 4, `${width}px production artwork resolves`);
		assert.deepEqual(result.artwork.orientations, ["poster", "poster", "landscape", "landscape"], `${width}px exact requested artwork orientations`);
		assert.deepEqual(result.artwork.entityTypes, ["network"], `${width}px Network runtime entity type`);
		assert.deepEqual(result.artwork.ids, [2, 18], `${width}px checked-in Network identities`);
		assert.equal(result.artwork.productionAssetUrls, true, `${width}px production artwork asset base`);
		assert.equal(result.artwork.loadSucceeded, true, `${width}px production artwork runtime load`);
		for (const [stage, layout] of Object.entries(result.layout)) {
			assert.equal(layout.singleInnerScroll, true, `${width}px ${stage} single inner scroll`);
			assert.equal(layout.oneActiveScrollOwner, true, `${width}px ${stage} scroll ownership`);
			assert.equal(layout.noHorizontalOverflow, true, `${width}px ${stage} horizontal overflow`);
			assert.equal(layout.primaryReachable, true, `${width}px ${stage} primary action`);
		}
		assert.equal(result.previewCalls, 0, `${width}px zero Preview calls before explicit Preview`);
		assert.equal(result.applyCalls, 0, `${width}px pre-Create only`);
		assert.equal(result.revisionUnchanged, true, `${width}px pre-Create project immutability`);
	}
});

test("mounted Network hierarchy locks Configure while deferred production artwork resolves", () => {
	assert.deepEqual(mountedResults.networkDeferredArtwork, {
		preparing: {
			stageStayedConfigure: true,
			ariaBusy: true,
			inert: true,
			primaryDisabled: true,
			primaryLabel: "Preparing artwork…",
			backDisabled: true,
			focusBeforePreparation: true,
		},
		locked: {
			popularPreserved: true,
			previewCalls: 0,
			previewModalAbsent: true,
			selectionPreserved: true,
			stageStayedConfigure: true,
		},
		completion: {
			unchangedSnapshotAdvanced: true,
			planTotals: [1, 1, 1],
			posterPreserved: true,
			focusEnteredAppearance: true,
			previewModalAbsent: true,
		},
		artworkLoads: 1,
		artworkResolves: 1,
		previewCalls: 0,
		applyCalls: 0,
		revisionUnchanged: true,
	});
});

test("mounted Network Preview uses the live Worker, TMDB, and image CDN with transient count, cache, sort, and focus safety", () => {
	assert.deepEqual(mountedResults.networkLivePreviewWidths.map((result) => result.width), [393, 900]);
	for (const result of mountedResults.networkLivePreviewWidths) {
		const width = result.width;
		const maximumPosterCount = 10;
		assert.equal(result.networkId, 213, `${width}px real Netflix Network identity`);
		assert.match(result.catalogueCountLine, /^Series Count: (?:[\d,]+|Unknown)$/, `${width}px checked-in catalogue count`);
		assert.deepEqual(result.initialCountLines, [result.catalogueCountLine], `${width}px one pre-Preview catalogue count line`);
		assert.equal(result.requestsBeforeExplicitPreview, 0, `${width}px no automatic Network Preview request`);

		assert.equal(result.popular.requestCount, 1, `${width}px one cold Popular request`);
		assert.equal(result.popular.request.origin, tmdbProxyBaseUrl, `${width}px production Worker origin`);
		assert.equal(result.popular.request.pathname, "/3/discover/tv", `${width}px Network TV Discover path`);
		assert.deepEqual(result.popular.request.networkValues, ["213"], `${width}px one with_networks identity`);
		assert.deepEqual(result.popular.request.sortValues, ["popularity.desc"], `${width}px Popular concrete sort`);
		assert.deepEqual(result.popular.request.pageValues, [], `${width}px no page or page-2 request`);
		assert.deepEqual(result.popular.request.queryKeys.sort(), ["sort_by", "with_networks"], `${width}px no separate count or extra query`);
		assert.equal(result.popular.request.exactRequest, true, `${width}px exact Popular request shape`);
		assert.equal(result.popular.request.status, 200, `${width}px live Popular Worker status`);
		assert.equal(result.popular.request.ok, true, `${width}px live Popular Worker response`);
		assert.match(result.popular.request.contentType, /application\/json/i, `${width}px live Popular JSON response`);
		assert.equal(Number.isSafeInteger(result.popular.request.totalResults) && result.popular.request.totalResults >= 0, true, `${width}px numeric volatile total_results`);
		const popularCountLine = `Series Count: ${result.popular.request.totalResults.toLocaleString("en")}`;
		assert.equal(result.popular.modalCountLine, popularCountLine, `${width}px Preview count corresponds to cloned live response`);
		assert.deepEqual(result.popular.configureCountLines, [popularCountLine], `${width}px live total supersedes the catalogue value on one Configure line`);
		assert.equal(result.popular.expectedVisibleCount, Math.min(maximumPosterCount, result.popular.preview.availablePosterCount), `${width}px dynamic real-resource poster bound`);
		assert.equal(result.popular.preview.visiblePosterCount, result.popular.expectedVisibleCount, `${width}px bounded Popular posters`);
		assert.equal(result.popular.preview.visiblePosterCount > 0 && result.popular.preview.visiblePosterCount <= maximumPosterCount, true, `${width}px usable Popular poster count`);
		assert.equal(result.popular.preview.renderedPosterCount <= 10, true, `${width}px production DOM poster maximum`);
		assert.equal(result.popular.preview.exactResponseOrder, true, `${width}px exact Popular response order after real failures`);
		assert.equal(result.popular.preview.orderedResponseCorrespondence, true, `${width}px Popular poster_path correspondence`);
		assert.deepEqual(result.popular.preview.posterSources, result.popular.preview.expectedPosterSources, `${width}px genuine expected Popular poster URLs`);
		assert.equal(result.popular.preview.postersReady, true, `${width}px Popular images semantically ready`);
		assert.equal(result.popular.preview.genuineTmdbSources, true, `${width}px Popular image.tmdb.org sources`);
		assert.equal(result.popular.preview.posterOnly, true, `${width}px Popular poster-only grid`);
		assert.equal(result.popular.preview.captionsAbsent, true, `${width}px no title/year/rating/description captions`);
		assert.equal(result.popular.preview.missingPosterCardsAbsent, true, `${width}px posterless rows omitted`);
		assert.equal(result.popular.preview.readiness.every((image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0 && image.clientWidth > 0 && image.clientHeight > 0 && image.width > 0 && image.height > 0), true, `${width}px positive natural and rendered dimensions`);
		assert.deepEqual(result.popular.layer, {
			focusEntered: true,
			sharedLayer: true,
			modalSemantics: true,
			nestedAboveOuter: true,
			outerInert: true,
			noHorizontalOverflow: true,
		}, `${width}px nested live Preview layer`);
		assert.deepEqual(result.popular.close, {
			closed: true,
			exactFocusRestored: true,
			outerStable: true,
			configureIntact: true,
			countLines: [popularCountLine],
		}, `${width}px Close restores the exact trigger and stable outer Configure`);

		assert.equal(result.cachedPopular.requestCount, 1, `${width}px repeat Popular adds no request`);
		assert.equal(result.cachedPopular.cacheHit, true, `${width}px repeat Popular cache hit`);
		assert.equal(result.cachedPopular.preview.exactResponseOrder, true, `${width}px cached Popular response order`);
		assert.equal(result.cachedPopular.escapeClosed, true, `${width}px Escape closes cached Preview`);
		assert.equal(result.cachedPopular.exactFocusRestored, true, `${width}px Escape restores exact Preview trigger`);
		assert.equal(result.cachedPopular.outerStable, true, `${width}px Escape preserves outer scroll and position`);

		assert.equal(result.recent.requestCount, 2, `${width}px Recent adds exactly one request`);
		assert.equal(result.recent.request.origin, tmdbProxyBaseUrl, `${width}px Recent production Worker origin`);
		assert.deepEqual(result.recent.request.networkValues, ["213"], `${width}px one Recent Network identity`);
		assert.deepEqual(result.recent.request.sortValues, ["first_air_date.desc"], `${width}px Recent concrete sort`);
		assert.equal(result.recent.request.exactRequest, true, `${width}px exact Recent request shape`);
		assert.equal(Number.isSafeInteger(result.recent.request.totalResults) && result.recent.request.totalResults >= 0, true, `${width}px Recent numeric volatile total_results`);
		assert.deepEqual(result.recent.countAfterSortBeforePreview, [popularCountLine], `${width}px sort does not revert learned count`);
		const recentCountLine = `Series Count: ${result.recent.request.totalResults.toLocaleString("en")}`;
		assert.equal(result.recent.modalCountLine, recentCountLine, `${width}px Recent Preview total correspondence`);
		assert.deepEqual(result.recent.configureCountLines, [recentCountLine], `${width}px one Recent live count line`);
		assert.equal(result.recent.expectedVisibleCount, Math.min(maximumPosterCount, result.recent.preview.availablePosterCount), `${width}px dynamic Recent real-resource bound`);
		assert.equal(result.recent.preview.visiblePosterCount, result.recent.expectedVisibleCount, `${width}px bounded Recent posters`);
		assert.equal(result.recent.preview.exactResponseOrder, true, `${width}px exact Recent response order`);
		assert.equal(result.recent.preview.postersReady, true, `${width}px Recent images semantically ready`);
		assert.equal(result.recent.preview.genuineTmdbSources, true, `${width}px Recent image.tmdb.org sources`);
		assert.equal(result.recent.preview.posterOnly, true, `${width}px Recent poster-only grid`);
		assert.equal(result.recent.previousSortNotShown, true, `${width}px Popular posters are not reused as Recent ready state`);
		assert.deepEqual(result.recent.close, { closed: true, exactFocusRestored: true, outerStable: true }, `${width}px Recent Close lifecycle`);

		assert.equal(result.restoredPopular.requestCount, 2, `${width}px returning to Popular adds no request`);
		assert.equal(result.restoredPopular.cacheHit, true, `${width}px restored Popular cache hit`);
		assert.equal(result.restoredPopular.preview.exactResponseOrder, true, `${width}px restored Popular response order`);
		assert.equal(result.restoredPopular.matchesOriginalResponse, true, `${width}px restored Popular posters match the original real response`);
		assert.deepEqual(result.restoredPopular.countAfterReturnToPopularBeforePreview, [recentCountLine], `${width}px learned count survives return sort change`);
		assert.deepEqual(result.restoredPopular.finalCountLines, [popularCountLine], `${width}px cached successful Preview updates the same count line`);
		assert.equal(result.restoredPopular.closed, true, `${width}px restored Popular Preview closes`);
		assert.equal(result.restoredPopular.exactFocusRestored, true, `${width}px restored Popular trigger focus`);
		assert.deepEqual(result.instrumentation, {
			requestCount: 2,
			allResponsesCloned: true,
			originalResponsesUntouched: true,
			allSuccessfulJson: true,
		}, `${width}px same-response clone instrumentation`);
		assert.deepEqual(result.final, {
			oneSeriesCountLine: true,
			configureIntact: true,
			noHorizontalOverflow: true,
			revisionUnchanged: true,
		}, `${width}px live Preview remains transient and non-mutating`);
	}
});

test("mounted Genre Preview uses the exact live Worker, TMDB, and image CDN configuration", () => {
	assert.deepEqual(mountedResults.genreLivePreviewWidths.map((result) => result.width), [393, 900]);
	for (const result of mountedResults.genreLivePreviewWidths) {
		const width = result.width;
		const maximumPosterCount = 10;
		assert.equal(result.requestsBeforeExplicitPreview, 0, `${width}px no automatic Genre Preview request`);

		assert.equal(result.movie.request.origin, tmdbProxyBaseUrl, `${width}px Movie production Worker origin`);
		assert.equal(result.movie.request.pathname, "/3/discover/movie", `${width}px Movie Discover path`);
		assert.deepEqual(Object.fromEntries(result.movie.request.queryEntries), {
			include_adult: "false",
			sort_by: "popularity.desc",
			with_genres: "16",
		}, `${width}px exact default Movie Genre request`);
		assert.equal(result.movie.request.status, 200, `${width}px live Movie Worker status`);
		assert.equal(result.movie.request.ok, true, `${width}px live Movie Worker response`);
		assert.match(result.movie.request.contentType, /application\/json/i, `${width}px live Movie JSON response`);
		assert.equal(Number.isSafeInteger(result.movie.request.totalResults) && result.movie.request.totalResults >= 0, true, `${width}px Movie total_results`);
		assert.deepEqual(result.movie.sharedBeforeSwitch, {
			requestCount: 1,
			movieSelected: true,
			movieCountShown: true,
			seriesDeferred: true,
		}, `${width}px Movie-first lazy shared Preview`);
		assert.equal(result.movie.preview.visiblePosterCount > 0 && result.movie.preview.visiblePosterCount <= maximumPosterCount, true, `${width}px bounded Movie posters`);
		assert.equal(result.movie.preview.renderedPosterCount <= 10, true, `${width}px Movie DOM poster maximum`);
		assertTitlePreviewGeometry(result.movie.preview.geometry, { width, posters: result.movie.preview.visiblePosterCount, label: `${width}px Genre Movie Preview` });
		assert.deepEqual(result.movie.preview.posterSources, result.movie.preview.expectedSources, `${width}px Movie response poster order`);
		assert.equal(result.movie.preview.postersReady, true, `${width}px Movie posters loaded`);
		assert.equal(result.movie.preview.genuineTmdbSources, true, `${width}px Movie image.tmdb.org sources`);
		assert.equal(result.movie.preview.posterOnly, true, `${width}px Movie poster-only grid`);
		assert.equal(result.movie.preview.captionsAbsent, true, `${width}px Movie captions absent`);

		assert.equal(result.series.request.origin, tmdbProxyBaseUrl, `${width}px TV production Worker origin`);
		assert.equal(result.series.request.pathname, "/3/discover/tv", `${width}px TV Discover path`);
		assert.deepEqual(Object.fromEntries(result.series.request.queryEntries), {
			include_adult: "false",
			sort_by: "popularity.desc",
			with_genres: "16",
		}, `${width}px exact default TV Genre request`);
		assert.equal(result.series.request.status, 200, `${width}px live TV Worker status`);
		assert.deepEqual(result.series.sharedAfterSwitch, {
			requestCount: 2,
			seriesSelected: true,
			seriesCountShown: true,
		}, `${width}px TV requested only after switching`);
		assert.equal(result.series.preview.visiblePosterCount > 0 && result.series.preview.visiblePosterCount <= maximumPosterCount, true, `${width}px bounded TV posters`);
		assertTitlePreviewGeometry(result.series.preview.geometry, { width, posters: result.series.preview.visiblePosterCount, label: `${width}px Genre Series Preview` });
		assert.deepEqual(result.series.preview.posterSources, result.series.preview.expectedSources, `${width}px TV response poster order`);
		assert.equal(result.series.preview.postersReady, true, `${width}px TV posters loaded`);
		assert.equal(result.series.preview.genuineTmdbSources, true, `${width}px TV image.tmdb.org sources`);
		assert.equal(result.series.preview.posterOnly, true, `${width}px TV poster-only grid`);
		assert.deepEqual(result.sharedClose, { closed: true, exactFocusRestored: true }, `${width}px shared Preview Close lifecycle`);

		assert.equal(result.filtered.request.origin, tmdbProxyBaseUrl, `${width}px filtered production Worker origin`);
		assert.equal(result.filtered.request.pathname, "/3/discover/movie", `${width}px filtered Movie path`);
		assert.deepEqual(Object.fromEntries(result.filtered.request.queryEntries), {
			"primary_release_date.gte": "2020-01-01",
			"primary_release_date.lte": "2026-12-31",
			include_adult: "false",
			sort_by: "primary_release_date.desc",
			"vote_average.gte": "6",
			"vote_average.lte": "9",
			"vote_count.gte": "100",
			with_genres: "16",
			with_origin_country: "US",
			with_original_language: "en",
			without_genres: "10751",
		}, `${width}px exact Advanced and exclusion query`);
		assert.equal(result.filtered.request.status, 200, `${width}px filtered Worker status`);
		assert.equal(Number.isSafeInteger(result.filtered.request.totalResults) && result.filtered.request.totalResults >= 0, true, `${width}px filtered total_results`);
		assert.deepEqual(result.filtered.singleMedia, { tabsAbsent: true, countShown: true }, `${width}px single-media Preview shell`);
		assert.equal(result.filtered.preview.visiblePosterCount > 0 && result.filtered.preview.visiblePosterCount <= maximumPosterCount, true, `${width}px bounded filtered posters`);
		assertTitlePreviewGeometry(result.filtered.preview.geometry, { width, posters: result.filtered.preview.visiblePosterCount, label: `${width}px filtered Genre Preview` });
		assert.deepEqual(result.filtered.preview.posterSources, result.filtered.preview.expectedSources, `${width}px filtered response poster order`);
		assert.equal(result.filtered.preview.postersReady, true, `${width}px filtered posters loaded`);
		assert.equal(result.filtered.preview.genuineTmdbSources, true, `${width}px filtered image.tmdb.org sources`);
		assert.equal(result.filtered.cacheHit, true, `${width}px exact-query successful cache reuse`);
		assert.deepEqual(result.instrumentation, {
			requestCount: 3,
			allResponsesCloned: true,
			originalResponsesUntouched: true,
			allSuccessfulJson: true,
		}, `${width}px same-response live Genre instrumentation`);
		assert.deepEqual(result.final, {
			focusRestored: true,
			configureIntact: true,
			noHorizontalOverflow: true,
			revisionUnchanged: true,
		}, `${width}px live Genre Preview remains responsive and non-mutating`);
	}
});

test("mounted Streaming New Collection disambiguates duplicate titles and routes the full owner-reviewed delta at every required width", () => {
	const requiredWidths = [360, 384, 393, 402, 412, 899, 900, 901, 1280];
	assert.deepEqual(mountedResults.streamingHierarchyWidths.map((result) => result.width), requiredWidths);
	for (const result of mountedResults.streamingHierarchyWidths) {
		assert.deepEqual(result.providerIds, [2, 444], `${result.width}px live Apple TV and Dekkoo identities`);
		assert.deepEqual(result.providerNames, ["Apple TV Store", "Dekkoo"], `${result.width}px live provider names`);
		assert.deepEqual(result.regionFocus, {
			searchFocused: false,
			autoFocusAttributeAbsent: true,
			keyboardTargetAbsent: true,
		}, `${result.width}px region Search remains deliberate`);
		assert.deepEqual(result.providerFocus, {
			searchFocused: false,
			autoFocusAttributeAbsent: true,
			keyboardTargetAbsent: true,
		}, `${result.width}px provider Search remains deliberate`);
		assert.deepEqual(result.regionSelectionVisual, {
			selected: true,
			borderRetained: true,
			surfaceRetained: true,
			markerAbsent: true,
			structuralInset: true,
			leftRailAbsent: true,
		}, `${result.width}px Region selection language without left rail`);
		assert.deepEqual(result.mediaSelectionRetention, {
			moviesRetained: true,
			seriesRetained: true,
			bothRetained: true,
			searchPreserved: true,
			noPruneNotice: true,
		}, `${result.width}px live provider remains selected across eligible Media changes`);
		for (const [stage, layout] of Object.entries(result.layouts)) {
			assert.deepEqual(layout, {
				singleInnerScroll: true,
				oneActiveScrollOwner: true,
				noHorizontalOverflow: true,
				primaryReachable: true,
			}, `${result.width}px ${stage} layout`);
		}
		assert.deepEqual(result.configure, {
			focusEntered: true,
			popularDefault: true,
			groupedDefault: true,
			groupingChoices: ["group-by-service", "separate-by-region"],
      runSummary: "RegionsAustralia (AU), United States of America (US)MediaMovies + Series",
			requestsBeforeExplicitPreview: 0,
		}, `${result.width}px shared Configure contract`);
		assert.equal(result.review.focusEntered, true, `${result.width}px Review focus`);
		assert.deepEqual(result.review.initialDestination.candidateCards, [
			{ label: "Streaming Services · Collection 1", delta: "2 of 8 sources already here · 6 will be added", contents: "Currently: 1 folder · 2 sources" },
			{ label: "Streaming Services · Collection 2", delta: "1 of 8 sources already here · 7 will be added", contents: "Currently: 1 folder · 1 source" },
			{ label: "Streaming Services · Collection 3", delta: "1 of 8 sources already here · 7 will be added", contents: "Currently: 1 folder · 1 source" },
		], `${result.width}px candidates ranked by overlap`);
		assert.deepEqual({
			stageKicker: result.review.initialDestination.stageKicker,
			heading: result.review.initialDestination.heading,
			headerDescription: result.review.initialDestination.headerDescription,
		}, {
			stageKicker: "Step 3",
			heading: "Choose destination",
			headerDescription: "Choose where these Streaming sources should go.",
		}, `${result.width}px unresolved destination stage language`);
		assert.equal(result.review.initialDestination.helper, "Choose an existing collection to add only what is missing, or create a new collection instead.", `${result.width}px plain destination helper`);
		assert.deepEqual(result.review.initialDestination.newOption, {
			label: "Create new collection instead",
			count: "8 selected sources",
			description: "Create all 8 sources in a separate collection.",
		}, `${result.width}px clear new-collection alternative`);
		assert.equal(result.review.initialDestination.noneSelected, true, `${result.width}px no destination auto-selected`);
		assert.equal(result.review.initialDestination.primaryDisabled, true, `${result.width}px explicit destination required`);
		assert.equal(result.review.initialDestination.primaryLabel, "Choose a destination", `${result.width}px destination-required footer`);
		assert.match(result.review.initialDestination.overlapText, /Some selected sources already exist elsewhere3 of 8 selected sources/);
		assert.match(result.review.initialDestination.overlapText, /Apple movies · in Streaming Services · Collection 2/);
		assert.match(result.review.initialDestination.overlapText, /Dekkoo movies · in Streaming Services · Collection 3/);
		assert.deepEqual(result.review.newCollectionDraftState, {
			stageKicker: "Step 3",
			heading: "Review & Appearance",
			headerDescription: "Review the exact creation or change summary before one atomic Apply.",
			collectionNameVisible: true,
			folderNameCount: 2,
			apple: "Curated Apple New",
			dekkoo: "Curated Dekkoo",
		}, `${result.width}px New Collection naming state`);
		assert.deepEqual(result.review.titleVisibility, {
			collectionHidden: true,
			collectionHiddenHelp: true,
			collectionRestored: true,
			collectionHiddenHelpRemoved: true,
			latestCollectionRestored: true,
			folderHidden: true,
			folderHiddenHelp: true,
			folderHomeOnlyRestored: true,
			folderHiddenHelpRemovedOnHomeOnly: true,
			planningLabelsRetained: true,
		}, `${result.width}px live reversible Collection and keyed Folder title fields`);
		assert.deepEqual(result.review.existingDestinationState, {
			collectionNameAbsent: true,
			folderNameCount: 1,
			appleInputAbsent: true,
			dekkooDraftPreserved: true,
			destinationSummary: "Streaming Services · Collection 1 · Rows. This operation does not rename or reconfigure the existing collection; appearance choices below apply only to new folders.",
		}, `${result.width}px existing destination naming boundary`);
		assert.equal(result.review.newCollectionDraftsRestored, true, `${result.width}px New Collection drafts restored after switching back`);
		assert.deepEqual(result.review.planTotals, [1, 1, 6], `${result.width}px actual one existing, one new, six-source delta`);
		assert.match(result.review.runSummary, /RegionsAustralia \(AU\), United States of America \(US\)/, `${result.width}px Review Regions`);
		assert.match(result.review.runSummary, /MediaMovies \+ Series/, `${result.width}px Review Media`);
		assert.match(result.review.runSummary, /ServicesApple TV Store, Dekkoo/, `${result.width}px Review Services`);
		assert.match(result.review.runSummary, /SortPopular/, `${result.width}px Review Sort`);
		assert.match(result.review.runSummary, /GroupingGroup regions by service/, `${result.width}px Review Grouping`);
		assert.equal(result.review.changeHeading, "What will change", `${result.width}px change-focused heading`);
		assert.deepEqual(result.review.outcomeRows, [
			{ status: "extend-folder", text: "Apple TVApple TV StoreExisting folder2 sources already exist · 2 sources will be addedView matches elsewhereThese exact sources exist elsewhereApple movies · in Streaming Services · Collection 2They stay there; choosing this destination does not move them." },
			{ status: "new-folder", text: "Curated DekkooDekkooNew folder4 sources will be createdView matches elsewhereThese exact sources exist elsewhereDekkoo movies · in Streaming Services · Collection 3They stay there; choosing this destination does not move them." },
		], `${result.width}px clear existing/new placement rows`);
		assert.equal(result.review.folderNameCount, 1, `${result.width}px only new Dekkoo folder editable`);
		assert.equal(result.review.invalidNameBlocked, true, `${result.width}px Folder validation blocks Apply`);
		assert.equal(result.review.customNamePreservedAfterBack, true, `${result.width}px logical folder custom name survives Back`);
		assert.equal(result.review.textOnlyNoteAbsent, true, `${result.width}px no temporary artwork warning`);
		assert.equal(result.review.providerLogoAbsent, true, `${result.width}px transient logos`);
		assert.equal(result.review.createAction, "Apply changes", `${result.width}px honest Apply label`);
		assert.equal(result.applyCalls, 1, `${result.width}px one atomic Apply`);
		assert.equal(result.preApplyUnchanged, true, `${result.width}px zero mutation before Apply`);
		assert.equal(result.appliedRevisionDelta, 1, `${result.width}px one revision`);
		assert.deepEqual(result.appliedFolders, [
			{ title: "Apple TV", sources: ["Movies (AU)", "Series (AU)", "Movies (US)", "Series (US)"] },
			{ title: "Curated Dekkoo", sources: ["Movies (AU)", "Series (AU)", "Movies (US)", "Series (US)"] },
		], `${result.width}px exact applied hierarchy`);
		assert.equal(result.collectionCount, 3, `${result.width}px no new collection created`);
		assert.equal(result.secondaryCollectionUnchanged, true, `${result.width}px unselected collection unchanged`);
		assert.equal(result.tertiaryCollectionUnchanged, true, `${result.width}px second unselected collection unchanged`);
		assert.equal(result.existingArtworkPreserved, true, `${result.width}px reused folder artwork preserved`);
		assert.equal(result.newArtworkUnassigned, true, `${result.width}px new folder artwork remains unassigned`);
		assert.equal(result.livePreview !== null, result.width === 393 || result.width === 900, `${result.width}px live Preview owner widths only`);
	}
});

test("mounted Streaming New Collection offers a zero-overlap imported collection by content affinity and preserves it at every required width", () => {
	const requiredWidths = [360, 384, 393, 402, 412, 899, 900, 901, 1280];
	assert.deepEqual(mountedResults.streamingAffinityDestinationWidths.map((result) => result.width), requiredWidths);
	for (const result of mountedResults.streamingAffinityDestinationWidths) {
		assert.deepEqual(result.initialChoice, {
			candidateCount: 1,
			label: "Streaming Services",
			kind: "Existing Streaming collection",
			delta: "None of the selected sources are here yet · all 2 sources will be added",
			contents: "Currently: 2 folders · 6 sources",
			newOption: {
				label: "Create new collection instead",
				count: "2 selected sources",
				description: "Create all 2 sources in a separate collection.",
			},
			noneSelected: true,
			primaryDisabled: true,
		}, `${result.width}px explicit zero-overlap destination choice`);
		assert.deepEqual(result.review.planTotals, [0, 1, 2], `${result.width}px new sibling-only delta`);
		assert.equal(result.review.heading, "What will change", `${result.width}px change heading`);
		assert.deepEqual(result.review.outcomes, [{ status: "new-folder", text: "CrunchyrollNew folder2 sources will be created" }], `${result.width}px strict folder trust keeps the provider in a new sibling`);
		assert.equal(result.review.collectionSettings, "Collection settings stay unchanged.Streaming Services · Tabs. This operation does not rename or reconfigure the existing collection; appearance choices below apply only to new folders.", `${result.width}px existing collection settings boundary`);
		assert.equal(result.review.applyLabel, "Create folder", `${result.width}px honest Create action`);
		assert.deepEqual(result.layout, {
			singleInnerScroll: true,
			oneActiveScrollOwner: true,
			noHorizontalOverflow: true,
			primaryReachable: true,
		}, `${result.width}px affinity Review layout`);
		assert.deepEqual(result.preApply, { revisionDelta: 0, serializedUnchanged: true, applyCalls: 0 }, `${result.width}px no mutation before Apply`);
		assert.equal(result.applyCalls, 1, `${result.width}px one atomic Apply`);
		assert.equal(result.revisionDelta, 1, `${result.width}px one revision`);
		assert.equal(result.collectionCount, 1, `${result.width}px no duplicate Collection`);
		assert.equal(result.collectionIdentityRetained, true, `${result.width}px same imported Collection`);
		assert.equal(result.collectionEditablePreserved, true, `${result.width}px imported Collection editable fields preserved`);
		assert.equal(result.collectionRawPreserved, true, `${result.width}px imported Collection raw fields preserved`);
		assert.equal(result.existingFoldersPreserved, true, `${result.width}px imported folders and sources preserved`);
		assert.equal(result.serializedExistingFoldersPreserved, true, `${result.width}px existing serialized folder output preserved`);
		assert.deepEqual(result.newFolder, {
			title: "Crunchyroll",
			sources: [["Movies (AU)", "AU", "MOVIE"], ["Series (AU)", "AU", "TV"]],
			artworkUnassigned: true,
		}, `${result.width}px new sibling folder and sources`);
	}
});

test("mounted Streaming selection reconciliation retains, prunes, orders, and stays responsive at every required width", () => {
	const requiredWidths = [360, 384, 393, 402, 412, 899, 900, 901, 1280];
	assert.deepEqual(mountedResults.streamingSelectionReconciliationWidths.map((result) => result.width), requiredWidths);
	for (const result of mountedResults.streamingSelectionReconciliationWidths) {
		assert.deepEqual(result.ownerSeries, {
			selectedNames: ["Netflix"],
			selectedCount: 1,
			cardSelected: true,
			notice: null,
			continueEnabled: true,
			configureSeriesOnly: true,
		}, `${result.width}px owner Both to Series case`);
		assert.deepEqual(result.ownerMovies, {
			selectedNames: ["Netflix"],
			selectedCount: 1,
			cardSelected: true,
			notice: null,
			continueEnabled: true,
		}, `${result.width}px owner Both to Movies case`);
		assert.deepEqual(result.somePruned, {
			selectedNames: ["C Both", "B Both"],
			selectedCount: 2,
			notice: "1 selected service was removed because it does not support Movies + Series in every selected region.",
			retainedCardsSelected: true,
			removedCardAbsent: true,
		}, `${result.width}px one ineligible service pruned without reordering`);
		assert.deepEqual(result.allPruned, {
			selectedNames: [],
			selectedCount: 0,
			notice: "2 selected services were removed because they do not support Series in every selected region.",
			disclosureAbsent: true,
			continueDisabled: true,
		}, `${result.width}px all ineligible services pruned once`);
		assert.deepEqual(result.regionRestricted, {
			selectedNames: ["C Both"],
			selectedCount: 1,
			notice: "1 selected service was removed because it is not available for the selected media in every region.",
			retainedCardSelected: true,
			removedCardAbsent: true,
		}, `${result.width}px added Region prunes only the AU-only service`);
		assert.deepEqual(result.regionRelaxed, {
			selectedNames: ["C Both"],
			selectedCount: 1,
			notice: null,
			retainedCardSelected: true,
			relaxedNoticeAbsent: true,
		}, `${result.width}px removing Region retains the service without notice`);
		assert.deepEqual(result.folderNameCleanup, {
			summary: "Folder names · 3",
			sectionHelper: "Keep the generated names or customise new folders.",
			inputCount: 3,
			perFolderHelperCount: 0,
			finalInputAboveFooter: true,
		}, `${result.width}px compact three-folder naming section`);
		assert.deepEqual(result.layout, {
			singleInnerScroll: true,
			oneActiveScrollOwner: true,
			noHorizontalOverflow: true,
			primaryReachable: true,
		}, `${result.width}px reconciliation Review layout`);
		assert.equal(result.noHorizontalOverflow, true, `${result.width}px no document overflow`);
		assert.equal(result.projectUnchanged, true, `${result.width}px selection changes never mutate project`);
	}
});

test("mounted complete New Collection overlap requires explicit confirmation before one duplicate creation", () => {
	const result = mountedResults.streamingDuplicateConfirmation;
	assert.match(result.evidenceText, /All selected sources already exist elsewhere/);
	assert.match(result.evidenceText, /2 of 2 selected sources/);
	assert.match(result.evidenceText, /Custom Netflix folder · in Existing Streaming/);
	assert.deepEqual(result.initialChoice, {
		candidateCount: 1,
		candidateLabel: "Existing Streaming",
		candidateDelta: "All 2 selected sources already exist here · nothing to add",
		newOption: {
			label: "Create new collection instead",
			count: "2 selected sources",
			description: "Create all 2 sources in a separate collection.",
		},
		noneSelected: true,
		primaryDisabled: true,
	});
	assert.doesNotMatch(result.initialChoice.candidateLabel, /Collection 1/);
	assert.match(result.zeroChange.message, /Nothing to addAll selected Streaming sources already exist in Existing Streaming\. No project changes are needed\./);
	assert.deepEqual({ primaryLabel: result.zeroChange.primaryLabel, primaryEnabled: result.zeroChange.primaryEnabled, applyCalls: result.zeroChange.applyCalls, revisionUnchanged: result.zeroChange.revisionUnchanged, sameProject: result.zeroChange.sameProject, collectionNameAbsent: result.zeroChange.collectionNameAbsent }, {
		primaryLabel: "Close",
		primaryEnabled: true,
		applyCalls: 0,
		revisionUnchanged: true,
		sameProject: true,
		collectionNameAbsent: true,
	});
	assert.deepEqual(result.duplicateChoice, { collectionNameVisible: true, primaryLabel: "Create duplicate collection" });
	assert.equal(result.beforeConfirmation.applyCalls, 0);
	assert.equal(Number.isSafeInteger(result.beforeConfirmation.revision), true);
	assert.equal(result.beforeConfirmation.sameProject, true);
	assert.equal(result.cancelRestoredFocus, true);
	assert.equal(result.applyCalls, 1);
	assert.equal(result.revisionDelta, 1);
	assert.equal(result.collectionCount, 2);
});

test("mounted Streaming Preview uses exact live Worker queries and real TMDB posters at 393px and 900px", () => {
	const liveResults = mountedResults.streamingHierarchyWidths.filter((result) => result.livePreview !== null);
	assert.deepEqual(liveResults.map((result) => result.width), [393, 900]);
	for (const result of liveResults) {
		const { movieAu, movieUs, seriesUs } = result.livePreview;
		const expectedQueries = [
			[movieAu, "/3/discover/movie", "AU"],
			[movieUs, "/3/discover/movie", "US"],
			[seriesUs, "/3/discover/tv", "US"],
		];
		for (const [entry, pathname, region] of expectedQueries) {
			assert.equal(entry.request.origin, tmdbProxyBaseUrl, `${result.width}px production Worker origin`);
			assert.equal(entry.request.pathname, pathname, `${result.width}px exact Discover media path`);
			assert.deepEqual(Object.fromEntries(entry.request.queryEntries), {
				include_adult: "false",
				sort_by: "popularity.desc",
				watch_region: region,
				with_watch_providers: "2",
			}, `${result.width}px exact ${pathname} ${region} query`);
			assert.equal(entry.request.status, 200, `${result.width}px live Worker status`);
			assert.equal(entry.request.ok, true, `${result.width}px live Worker response`);
			assert.match(entry.request.contentType, /application\/json/i, `${result.width}px live JSON response`);
			assert.equal(Number.isSafeInteger(entry.request.totalResults) && entry.request.totalResults >= 0, true, `${result.width}px volatile total_results`);
			assert.equal(entry.preview.visiblePosterCount > 0 && entry.preview.visiblePosterCount <= 10, true, `${result.width}px bounded real posters`);
			assert.equal(entry.preview.renderedPosterCount <= 10, true, `${result.width}px bounded poster DOM`);
			assert.deepEqual(entry.preview.posterSources, entry.preview.expectedSources, `${result.width}px exact response poster order`);
			assert.equal(entry.preview.exactResponseOrder, true, `${result.width}px exact poster correspondence`);
			assert.equal(entry.preview.postersReady, true, `${result.width}px poster readiness`);
			assert.equal(entry.preview.genuineTmdbSources, true, `${result.width}px image.tmdb.org resources`);
			assert.equal(entry.preview.posterOnly, true, `${result.width}px poster-only grid`);
			assertTitlePreviewGeometry(entry.preview.geometry, { width: result.width, posters: entry.preview.visiblePosterCount, label: `${result.width}px Streaming ${pathname} ${region} Preview` });
		}
		assert.equal(result.livePreview.requestCount, 3, `${result.width}px region and media tabs request only exact sources`);
		assert.equal(result.livePreview.closed, true, `${result.width}px Preview closes`);
		assert.equal(result.livePreview.exactFocusRestored, true, `${result.width}px Preview trigger focus restoration`);
	}
});

test("mounted Source Edit Preview is live, lazy, cached, poster-only, focus-safe, non-mutating, and responsive", () => {
	assert.equal(mountedResults.sourceEditLivePreviewWidths.length, 2);
	for (const result of mountedResults.sourceEditLivePreviewWidths) {
		assert.equal(result.requestFreeBeforeOpen, true, result.width);
		assert.equal(result.requestCount, 1, result.width);
		assert.equal(result.requestPath.startsWith("/3/collection/645"), true, result.requestPath);
		assert.equal(result.draftLabel, "Current Bond draft");
		assert.equal(result.domPosterCount, 10);
		assert.equal(result.visiblePosterCount, 10, result.width);
		assertTitlePreviewGeometry(result.geometry, { width: result.width, label: `${result.width}px Source Edit Preview` });
		assert.equal(result.genuinePosters, true, result.width);
		assert.equal(result.posterOnly, true);
		assert.equal(result.outerScrollInert, true);
		assert.equal(result.footerInert, true);
		assert.equal(result.focusContained, true);
		assert.ok(result.activeScrollOwnerCount <= 1, `${result.width}: ${result.activeScrollOwnerCount}`);
		assert.equal(result.noMutation, true);
		assert.equal(result.escapeClosed, true);
		assert.equal(result.exactFocusRestored, true);
		assert.equal(result.cacheReused, true);
		assert.equal(result.closeRestoredFocus, true);
		assert.equal(result.bodyLockRetained, true);
		assert.equal(result.finalNoMutation, true);
	}
});

test("mounted ordinary Add Source Preview reaches exact live parity for six newly wired families and retains Decade", () => {
	assert.deepEqual(mountedResults.addSourceLivePreviewParityWidths.map((result) => result.width), [393, 900]);
	for (const result of mountedResults.addSourceLivePreviewParityWidths) {
		const families = result.families;
		assert.deepEqual(Object.keys(families), ["collection", "people", "studio", "network", "streaming", "genre"]);
		for (const [family, evidence] of Object.entries(families)) {
			assert.equal(evidence.posterCount > 0 && evidence.posterCount <= 10, true, `${result.width}px ${family} bounded posters`);
			assert.equal(evidence.genuinePosters, true, `${result.width}px ${family} real image CDN posters`);
			assert.equal(evidence.posterOnly, true, `${result.width}px ${family} poster-only grid`);
			assert.equal(evidence.outerInert, true, `${result.width}px ${family} underlying Add flow inert`);
			assert.equal(evidence.focusContained, true, `${result.width}px ${family} contained Preview focus`);
			assert.equal(evidence.focusRestored, true, `${result.width}px ${family} trigger focus restoration`);
			assert.equal(evidence.cacheReused, true, `${result.width}px ${family} successful cache reuse`);
			assert.equal(evidence.noMutation, true, `${result.width}px ${family} zero project mutation`);
			assert.equal(evidence.applyCalls, family === "people" ? 1 : 0, `${result.width}px ${family} expected final-action count`);
			assertTitlePreviewGeometry(evidence.geometry, { width: result.width, posters: evidence.posterCount, label: `${result.width}px ${family} Add Preview` });
		}

		assert.deepEqual({
			label: families.collection.initialLabel,
			selectors: families.collection.selectorGroups,
			counts: [families.collection.requestCountBeforeOpen, families.collection.requestCountAfterInitial, families.collection.requestCountFinal],
		}, { label: "James Bond Collection", selectors: [], counts: [1, 1, 1] }, `${result.width}px Collection cached details parity`);
		assert.match(families.collection.reviewCleanup.countText, /^\d+ titles? in this collection$/, `${result.width}px Collection simple title count`);
		assert.deepEqual({
			previewActionAvailable: families.collection.reviewCleanup.previewActionAvailable,
			legacyTextPreviewAbsent: families.collection.reviewCleanup.legacyTextPreviewAbsent,
			previewFollowsRecipe: families.collection.reviewCleanup.previewFollowsRecipe,
			oneScrollOwner: families.collection.reviewCleanup.oneScrollOwner,
			footerReachable: families.collection.reviewCleanup.footerReachable,
		}, {
			previewActionAvailable: true,
			legacyTextPreviewAbsent: true,
			previewFollowsRecipe: true,
			oneScrollOwner: true,
			footerReachable: true,
		}, `${result.width}px Collection legacy-text cleanup and retained Review layout`);
		assert.match(families.collection.requests[0], /^\/3\/collection\/645(?:\?|$)/);

		assert.deepEqual({
			label: families.people.initialLabel,
			selectors: families.people.selectorGroups,
			counts: [families.people.requestCountBeforeOpen, families.people.requestCountAfterInitial, families.people.requestCountFinal],
		}, {
			label: "Movie Credits",
			selectors: [
				{ label: "Role", options: ["Acting", "Directing"], selected: "Acting" },
				{ label: "Media", options: ["Movies", "Series"], selected: "Movies" },
			],
			counts: [1, 1, 1],
		}, `${result.width}px People one-physical-source parity`);
		assert.equal(families.people.switched.label, "Directed Movies");
		assert.match(families.people.requests[0], /^\/3\/person\/31(?:\?|$)/);
		assert.deepEqual(families.people.sort.labels, ["Popular", "Recent", "Top rated"], `${result.width}px People exact Sort inventory`);
		assert.equal(families.people.sort.defaultPopular, true, `${result.width}px People default Sort`);
		assert.equal(families.people.sort.recentSelected, true, `${result.width}px People changed Sort`);
		assert.equal(families.people.sort.retainedThroughConfiguration, true, `${result.width}px People Sort survives role/media changes`);
		assert.equal(families.people.sort.restoredAfterBack, true, `${result.width}px People Sort survives Back and re-entry`);
		assert.equal(families.people.sort.radioSemantics, true, `${result.width}px People Sort native radio semantics`);
		assert.equal(families.people.sort.noHorizontalOverflow, true, `${result.width}px People Sort stays contained`);
		assert.deepEqual(families.people.sort.savedSorts, [
			"primary_release_date.desc",
			"first_air_date.desc",
			"primary_release_date.desc",
			"first_air_date.desc",
		], `${result.width}px People exact selected Sort persisted to all physical sources`);
		assert.equal(families.people.sort.oneAtomicRevision, true, `${result.width}px People final Add is one atomic revision`);

		assert.deepEqual(families.studio.selectorGroups, [{ label: "Media", options: ["Movies", "Series"], selected: "Movies" }]);
		assert.deepEqual([families.studio.requestCountBeforeOpen, families.studio.requestCountAfterInitial, families.studio.switched.requestCount, families.studio.requestCountFinal], [0, 1, 2, 2]);
		assert.equal(families.studio.requests[0].startsWith("/3/discover/movie?"), true);
		assert.equal(new URLSearchParams(families.studio.requests[0].split("?")[1]).get("with_companies"), "3");
		assert.equal(families.studio.requests[1].startsWith("/3/discover/tv?"), true);

		assert.deepEqual(families.network.selectorGroups, []);
		assert.deepEqual([families.network.requestCountBeforeOpen, families.network.requestCountAfterInitial, families.network.requestCountFinal], [0, 1, 1]);
		assert.equal(families.network.requests[0].startsWith("/3/discover/tv?"), true);
		assert.equal(new URLSearchParams(families.network.requests[0].split("?")[1]).get("with_networks"), "2");

		assert.deepEqual(families.streaming.selectorGroups, [
			{ label: "Region", options: ["Australia", "United States of America"], selected: "Australia" },
			{ label: "Media", options: ["Movies", "Series"], selected: "Movies" },
		]);
		assert.deepEqual([families.streaming.requestCountBeforeOpen, families.streaming.requestCountAfterInitial, families.streaming.switched.requestCount, families.streaming.requestCountFinal], [0, 1, 2, 2]);
		assert.equal(new URLSearchParams(families.streaming.requests[0].split("?")[1]).get("watch_region"), "AU");
		assert.equal(new URLSearchParams(families.streaming.requests[1].split("?")[1]).get("watch_region"), "US");

		assert.deepEqual(families.genre.selectorGroups, [
			{ label: "Genre", options: ["Comedy", "Horror"], selected: "Comedy" },
			{ label: "Media", options: ["Movies", "Series"], selected: "Movies" },
		]);
		assert.deepEqual([families.genre.requestCountBeforeOpen, families.genre.requestCountAfterInitial, families.genre.switched.requestCount, families.genre.requestCountFinal], [0, 1, 2, 2]);
		assert.equal(new URLSearchParams(families.genre.requests[0].split("?")[1]).get("with_genres"), "35");
		assert.equal(new URLSearchParams(families.genre.requests[1].split("?")[1]).get("with_genres"), "27");
		assert.equal(new URLSearchParams(families.genre.requests[0].split("?")[1]).get("include_adult"), "false");
	}
	assert.equal(mountedResults.decadeSourceLayoutWidths.every((entry) => entry.previewSecondary), true, "Decade retains its already-proven exact Add Preview");
});

test("mounted Decade Add Source stays compact, accessible, and contained at every required width", () => {
	assert.deepEqual(mountedResults.decadeSourceLayoutWidths.map((result) => result.width), [360, 384, 393, 402, 412, 899, 900, 901, 1280]);
	for (const result of mountedResults.decadeSourceLayoutWidths) {
		assert.equal(result.modeId, "tmdb-decade", `${result.width}px singular Decade mode`);
		assert.deepEqual(result.controlOrder, ["media", "sort", "decade", "year", "genres", "advanced", "generated", "preview"], `${result.width}px owner-approved control order`);
		assert.deepEqual(result.mediaLabels, ["Media", "Movies", "Series", "Both"], `${result.width}px semantic media controls`);
		assert.deepEqual(result.sortLabels, ["Sort titles by", "Popular", "Recent", "Top Rated", "Most Votes"], `${result.width}px semantic sort controls`);
		assert.equal(result.decadeChoiceCount, 8, `${result.width}px eight Decade radio pills`);
		assert.deepEqual(result.initialYearLabels, ["All 2020s", "2020", "2021", "2022", "2023", "2024", "2025", "2026", "2027", "2028", "2029"], `${result.width}px complete configured 2020s`);
		assert.deepEqual(result.eightiesYearLabels, ["All 1980s", "1980", "1981", "1982", "1983", "1984", "1985", "1986", "1987", "1988", "1989"], `${result.width}px whole 1980s or multiple years`);
		assert.deepEqual(result.earlierYearLabels, ["All 1950s & Earlier", "Before 1950", "1950", "1951", "1952", "1953", "1954", "1955", "1956", "1957", "1958", "1959"], `${result.width}px first-period special choices`);
		assert.deepEqual(result.initialYearSelection, ["2020s"], `${result.width}px default whole-decade selection`);
		assert.deepEqual(result.firstIndividualSelection, ["year-1985"], `${result.width}px first individual clears All`);
		assert.deepEqual(result.multiYearSelection, ["year-1981", "year-1985", "year-1988"], `${result.width}px click order normalizes chronologically`);
		assert.deepEqual(result.toggledYearSelection, ["year-1981", "year-1988"], `${result.width}px individual Year toggles independently`);
		assert.deepEqual(result.allClearsIndividuals, ["1980s"], `${result.width}px All clears individual Years`);
		assert.deepEqual(result.finalIndividualRestoresAll, ["1980s"], `${result.width}px deselecting final Year restores All`);
		assert.deepEqual(result.earlierResetSelection, ["1950s-and-earlier"], `${result.width}px Decade change resets Year to whole period`);
		assert.deepEqual(result.earlierMultiSelection, ["before-1950", "year-1951", "year-1958"], `${result.width}px special period multi-selection order`);
		assert.deepEqual(result.resetYearSelection, ["2020s"], `${result.width}px deterministic 2020s reset`);
		assert.deepEqual(result.futureMultiSelection, ["year-2021", "year-2025", "year-2028"], `${result.width}px future years remain selectable and canonical`);
		assert.equal(result.radioSemantics, true, `${result.width}px compact radio pills hide native duplication`);
		assert.equal(result.yearCheckboxSemantics, true, `${result.width}px Year pills retain hidden native checkbox semantics`);
		assert.equal(result.genreChoiceCount, 8, `${result.width}px Both Genre intersection`);
		assert.equal(result.genreCheckboxSemantics, true, `${result.width}px Genre pills retain real hidden checkboxes`);
		assert.equal(result.genreIndicatorsAbsent, true, `${result.width}px Genre pills render no circle or check glyph`);
		assert.equal(result.genreFocusVisible, true, `${result.width}px hidden Genre checkbox gives the pill a visible focus state`);
		assert.equal(result.genreVisualStateChanged, true, `${result.width}px selected Genre pill changes surface or border`);
		assert.equal(result.selectedGenreCount, 8, `${result.width}px Select all chooses every eligible Genre`);
		assert.equal(result.selectAllDisabled, true, `${result.width}px Select all disables when complete`);
		assert.equal(result.clearEnabled, true, `${result.width}px Clear enabled for nonempty selection`);
		assert.equal(result.clearedGenreCount, 0, `${result.width}px Clear removes every Genre source choice`);
		assert.equal(result.initialReviewSourceCount, 2, `${result.width}px default Both general-source review`);
		assert.equal(result.reviewSourceCount, 54, `${result.width}px three-Year Select-all Cartesian bundle`);
		assert.equal(result.clearedReviewSourceCount, 6, `${result.width}px Clear restores three general Both bundles`);
		assert.equal(result.reviewNoCollisions, true, `${result.width}px review labels and states`);
		assert.equal(result.intendedScrollOwnerCount, 1, `${result.width}px one intended vertical scroll owner`);
		assert.equal(result.intendedScrollOwnerIsInner, true, `${result.width}px inner form owns scrolling`);
		assert.equal(result.dialogWithinViewport, true, `${result.width}px editor viewport containment`);
		assert.equal(result.footerReachable, true, `${result.width}px Add footer reachable`);
		assert.equal(result.previewSecondary, true, `${result.width}px Preview remains secondary to Save`);
		assert.equal(result.bodyLocked, true, `${result.width}px underlying document locked`);
		assert.equal(result.pageNoHorizontalOverflow, true, `${result.width}px no page horizontal overflow`);
		assert.deepEqual(result.secondary, { contained: true, headingFocused: true, outerInert: true, noHorizontalOverflow: true }, `${result.width}px Advanced exclusions surface`);
		assert.equal(result.secondaryFocusRestored, true, `${result.width}px Advanced trigger focus restoration`);
		assert.deepEqual(result.footerLabels, ["Add 54 sources"], `${result.width}px normal footer has only its primary Add action`);
		assert.deepEqual(result.restoredFooterLabels, ["Add 6 sources"], `${result.width}px restored normal footer has only its primary Add action`);
		assert.equal(result.footerCancelAbsent, true, `${result.width}px redundant footer Cancel absent`);
		assert.equal(result.cancelCalls, 1, `${result.width}px header Close retains safe dismissal`);
		assert.equal(result.noMutation, true, `${result.width}px detached editor and Close`);
	}
	assert.deepEqual(mountedResults.decadeSourceGenreKeyboard, {
		checkedBefore: false,
		focused: true,
		inputType: "checkbox",
		hiddenNativeControl: true,
		focusVisible: true,
		checkedAfterSpace: true,
		selectedStateExposed: true,
		selectedVisualChanged: true,
		noMutation: true,
	}, "393px trusted keyboard Space toggles the real hidden Genre checkbox and visible pill state");
	assert.deepEqual(mountedResults.decadeSourceOverlapFooterWidths.map((entry) => entry.partial.width), [393, 900, 1280]);
	for (const { partial, complete } of mountedResults.decadeSourceOverlapFooterWidths) {
		assert.deepEqual(partial.labels, ["Add 1 source", "Add all anyway"], `${partial.width}px partial-overlap actions`);
		assert.deepEqual(partial.disabled, [false, false], `${partial.width}px partial-overlap enablement`);
		assert.deepEqual(complete.labels, ["Add 0 sources", "Add all anyway"], `${complete.width}px complete-overlap actions`);
		assert.deepEqual(complete.disabled, [true, false], `${complete.width}px complete-overlap enablement`);
		for (const evidence of [partial, complete]) {
			assert.equal(evidence.overrideLayout, true, `${evidence.width}px duplicate override layout`);
			assert.equal(evidence.headerBeforeFooter, true, `${evidence.width}px Back and Close precede footer actions`);
			assert.equal(evidence.ordered, true, `${evidence.width}px primary remains before override`);
			assert.equal(evidence.sticky, true, `${evidence.width}px footer remains sticky`);
			assert.equal(evidence.noHorizontalOverflow, true, `${evidence.width}px overlap footer has no horizontal overflow`);
			assert.equal(evidence.beside, evidence.width >= 900, `${evidence.width}px actions stack only at narrow mobile`);
			assert.equal(evidence.buttonWidths.every((buttonWidth) => evidence.width >= 900 ? buttonWidth >= 180 && buttonWidth < 320 : buttonWidth > 300), true, `${evidence.width}px button widths remain usable`);
		}
	}
});

test("mounted Decade Add Source Preview exposes a recoverable error and Retry without mutation", () => {
	assert.deepEqual(mountedResults.decadeSourcePreviewError, {
		calls: 2,
		errorMessage: true,
		redundantSelectors: {
			yearAbsent: true,
			sourceAbsent: true,
			mediaLabels: ["Movies", "Series"],
		},
		retryRecovered: true,
		closed: true,
		exactFocusRestored: true,
		noMutation: true,
	});
});

test("mounted Decade Add Source exact Preview uses the deployed Worker, TMDB, and image CDN", {
	skip: process.env.TMDB_DECADES_PREVIEW_DEPLOYED !== "1" ? "Pending truthful acknowledgement of the already deployed Decades Worker state." : false,
}, () => {
	function requestEvidence(request) {
		const url = new URL(request.url);
		return { url, query: Object.fromEntries(url.searchParams) };
	}
	assert.deepEqual(mountedResults.decadeSourceLivePreviewWidths.map((result) => result.width), [393, 900]);
	for (const result of mountedResults.decadeSourceLivePreviewWidths) {
		assert.equal(result.requestsBeforeExplicitPreview, 0, `${result.width}px no automatic request`);
		assert.deepEqual(result.configuredYearSelection, ["year-1981", "year-1985", "year-1988"], `${result.width}px click-independent canonical Year selection`);
		assert.deepEqual(result.selectorLabels, {
			year: ["1981", "1985", "1988"],
			source: ["General", "Comedy"],
			media: ["Movies", "Series"],
		}, `${result.width}px structured Preview selectors`);
		assert.deepEqual(result.initiallySelected, { year: "1981", source: "General", media: "Movies" }, `${result.width}px canonical initial exact source`);
		assert.equal(result.requests.length, 6, `${result.width}px exactly six visited combinations requested`);
		const expectedRequests = [
			{ path: "/3/discover/movie", dateField: "primary_release_date", year: 1981, genre: false },
			{ path: "/3/discover/tv", dateField: "first_air_date", year: 1981, genre: false },
			{ path: "/3/discover/tv", dateField: "first_air_date", year: 1981, genre: true },
			{ path: "/3/discover/tv", dateField: "first_air_date", year: 1985, genre: true },
			{ path: "/3/discover/movie", dateField: "primary_release_date", year: 1985, genre: true },
			{ path: "/3/discover/movie", dateField: "primary_release_date", year: 1985, genre: false },
		];
		for (const [index, expected] of expectedRequests.entries()) {
			const evidence = requestEvidence(result.requests[index]);
			assert.equal(evidence.url.origin, tmdbProxyBaseUrl, `${result.width}px request ${index + 1} production Worker origin`);
			assert.equal(evidence.url.pathname, expected.path, `${result.width}px request ${index + 1} exact media path`);
			assert.deepEqual(evidence.query, {
				include_adult: "false",
				sort_by: "popularity.desc",
				[`${expected.dateField}.gte`]: `${expected.year}-01-01`,
				[`${expected.dateField}.lte`]: `${expected.year}-12-31`,
				...(expected.genre ? { with_genres: "35" } : {}),
				"vote_average.gte": "5",
			}, `${result.width}px request ${index + 1} exact canonical Advanced query`);
		}
		for (const request of result.requests) {
			assert.equal(request.status, 200, `${result.width}px live Worker response`);
			assert.equal(request.ok, true, `${result.width}px live Worker success`);
			assert.match(request.contentType, /application\/json/i, `${result.width}px live JSON`);
			assert.equal(Number.isSafeInteger(request.totalResults) && request.totalResults > 0, true, `${result.width}px real TMDB results`);
		}
		assert.deepEqual(result.posterEvidence, Array.from({ length: 6 }, () => ({ count: 10, genuine: true })), `${result.width}px bounded real image.tmdb.org posters for every visited combination`);
		assert.deepEqual({
			oneInitialRequest: result.oneInitialRequest,
			seriesRequestedLazily: result.seriesRequestedLazily,
			sourceRequestedLazily: result.sourceRequestedLazily,
			yearRequestedLazily: result.yearRequestedLazily,
			secondMediaRequestedLazily: result.secondMediaRequestedLazily,
			generalRequestedLazily: result.generalRequestedLazily,
			thirdYearDeferred: result.thirdYearDeferred,
			cacheReused: result.cacheReused,
			noFlattenedCartesianSelector: result.noFlattenedCartesianSelector,
			selectorOneLine: result.selectorOneLine,
			selectorsContained: result.selectorsContained,
			outerInert: result.outerInert,
			focusContained: result.focusContained,
			focusRestored: result.focusRestored,
			noRepresentativeSample: result.noRepresentativeSample,
		}, {
			oneInitialRequest: true,
			seriesRequestedLazily: true,
			sourceRequestedLazily: true,
			yearRequestedLazily: true,
			secondMediaRequestedLazily: true,
			generalRequestedLazily: true,
			thirdYearDeferred: true,
			cacheReused: true,
			noFlattenedCartesianSelector: true,
			selectorOneLine: true,
			selectorsContained: true,
			outerInert: true,
			focusContained: true,
			focusRestored: true,
			noRepresentativeSample: true,
		}, `${result.width}px structured lazy matrix behavior`);
		assertTitlePreviewGeometry(result.geometry, { width: result.width, label: `${result.width}px multi-Year Comedy Both Advanced Preview` });
		assert.equal(result.noMutation, true, `${result.width}px Preview zero mutation`);
		assert.equal(result.noHorizontalOverflow, true, `${result.width}px live Preview no horizontal overflow`);
	}
});

test("mounted Title Previews stay centred and use one scroll owner on a deliberately short phone viewport", () => {
	const result = mountedResults.shortHeightPreviewGeometry;
	assert.deepEqual({ width: result.width, height: result.height }, { width: 393, height: 320 });
	assertTitlePreviewGeometry(result.people, { width: 393, phoneColumns: 5, short: true, label: "393x320 People Preview" });
	assertTitlePreviewGeometry(result.sourceEdit, { width: 393, short: true, label: "393x320 Source Edit Preview" });
	const normalPeople = mountedResults.peopleConfigureWidths.find((entry) => entry.layout.width === 393).preview.geometry;
	const normalSourceEdit = mountedResults.sourceEditLivePreviewWidths.find((entry) => entry.width === 393).geometry;
	assert.ok(Math.abs(result.people.posterWidth - normalPeople.posterWidth) <= 1, "People posters do not shrink to fit the short viewport");
	assert.ok(Math.abs(result.sourceEdit.posterWidth - normalSourceEdit.posterWidth) <= 1, "shared posters do not shrink to fit the short viewport");
});

test("mounted Decades Preview uses the deployed Worker for bounded representative samples, exact sources, cache, focus, and responsive poster limits", {
	skip: process.env.TMDB_DECADES_PREVIEW_DEPLOYED !== "1" ? "Pending owner deployment of the reviewed Worker bytes." : false,
}, () => {
	function assertAnnualRequests(requests, mediaType, years) {
		assert.equal(requests.length, years.length);
		for (const [index, request] of requests.entries()) {
			const year = years[index];
			const url = new URL(request, tmdbProxyBaseUrl);
			const dateField = mediaType === "MOVIE" ? "primary_release_date" : "first_air_date";
			assert.equal(url.pathname, mediaType === "MOVIE" ? "/3/discover/movie" : "/3/discover/tv");
			assert.deepEqual(Object.fromEntries(url.searchParams), {
				include_adult: "false",
				sort_by: "popularity.desc",
				[`${dateField}.gte`]: `${year}-01-01`,
				[`${dateField}.lte`]: `${year}-12-31`,
			});
		}
	}
	function assertWholeDecadeRequest(requests, mediaType) {
		assert.equal(requests.length, 1);
		const url = new URL(requests[0], tmdbProxyBaseUrl);
		const dateField = mediaType === "MOVIE" ? "primary_release_date" : "first_air_date";
		assert.equal(url.pathname, mediaType === "MOVIE" ? "/3/discover/movie" : "/3/discover/tv");
		assert.deepEqual(Object.fromEntries(url.searchParams), {
			include_adult: "false",
			sort_by: "popularity.desc",
			[`${dateField}.gte`]: "1980-01-01",
			[`${dateField}.lte`]: "1989-12-31",
		});
	}
	assert.deepEqual(mountedResults.decadesLivePreviewWidths.map((result) => result.width), [393, 900]);
	for (const result of mountedResults.decadesLivePreviewWidths) {
		assert.equal(result.lightweightClosed, true);
		assert.equal(result.compactOlderGroup, true);
		assert.equal(result.requestFreeBeforeExplicitPreview, true);
		assertAnnualRequests(result.olderMovieSampleRequests, "MOVIE", [1980, 1981, 1982, 1983, 1984, 1985, 1986, 1987, 1988, 1989]);
		assertAnnualRequests(result.olderSeriesSampleRequests, "TV", [1980, 1981, 1982, 1983, 1984, 1985, 1986, 1987, 1988, 1989]);
		assertWholeDecadeRequest(result.allSeriesRequests, "TV");
		assertWholeDecadeRequest(result.allMovieRequests, "MOVIE");
		assertAnnualRequests(result.currentSampleRequests, "MOVIE", [2020, 2021, 2022, 2023, 2024, 2025, 2026]);
		assertAnnualRequests(result.futureExact.requests, "MOVIE", [2029]);
		assert.deepEqual(result.olderSelector.labels, ["Decade sample", "All 1980s", "1980", "1981", "1982", "1983", "1984", "1985", "1986", "1987", "1988", "1989"]);
		assert.equal(result.olderSelector.selected, "Decade sample");
		assert.deepEqual(result.currentSelector.labels, ["Decade sample", "All 2020s", "2020", "2021", "2022", "2023", "2024", "2025", "2026", "2027", "2028", "2029"]);
		assert.equal(result.currentSelector.selected, "Decade sample");
		for (const selector of [result.olderSelector, result.currentSelector]) {
			for (const field of ["oneLine", "horizontalScroll", "verticalClipping", "hasOverflowAtMobile"]) assert.equal(selector[field], true, `${result.width}: selector ${field}`);
		}
		assert.equal(result.sampleHelper, "A representative mix across the decade using your current sort and filters.");
		assert.equal(result.currentHelper, result.sampleHelper);
		assert.equal(result.movieSamplePosterCount, 10);
		assert.equal(result.seriesSamplePosterCount, 10);
		assert.equal(result.restoredSamplePosterCount, 10);
		assert.equal(result.currentSamplePosterCount, 7);
		assert.equal(result.allSeriesPosterCount, 10);
		assert.equal(result.allMoviePosterCount, 10);
		assertTitlePreviewGeometry(result.geometry, { width: result.width, label: `${result.width}px completed Decade sample` });
		assertTitlePreviewGeometry(result.currentGeometry, { width: result.width, posters: 7, label: `${result.width}px current Decade sample` });
		assert.equal(result.futureExact.selected, "2029");
		assert.ok(result.futureExact.posterCount >= 0 && result.futureExact.posterCount <= 10);
		assert.equal(result.futureExact.empty, result.futureExact.posterCount === 0);
		assert.equal(result.futureExact.genuinePosters, true);
		assert.equal(result.futureExact.sampleHelperAbsent, true);
		assert.equal(result.futureExact.noMutation, true);
		if (result.futureExact.geometry) assertTitlePreviewGeometry(result.futureExact.geometry, { width: result.width, posters: result.futureExact.posterCount, label: `${result.width}px exact future 2029 Preview` });
		assert.equal(result.totalRequestCount, 30);
		assert.ok(result.activeScrollOwnerCount <= 1, `${result.width}: ${result.activeScrollOwnerCount}`);
		for (const field of ["moviesInitiallySelected", "seriesSelected", "exactHelperAbsent", "allSeriesSelected", "exactYearReusedSampleCache", "sampleCacheReused", "genuineMoviePosters", "genuineSeriesPosters", "genuineAllSeriesPosters", "genuineAllMoviePosters", "oneModal", "outerScrollInert", "footerInert", "focusContained", "noHorizontalOverflow", "noMutation", "exactFocusRestored", "individualYearsPersisted", "compactCurrentGroup", "genuineCurrentPosters", "currentNoMutation", "escapeClosed", "escapeFocusRestored", "finalNoMutation"]) assert.equal(result[field], true, `${result.width}: ${field}`);
	}
});

test("mounted Studio hierarchy scales to 100 ordered Studios and 200 sources with zero automatic Preview requests", () => {
	assert.deepEqual(mountedResults.studioScale, {
		cards: 100,
		selectedCount: 100,
		noticeAt100: true,
		requests: { afterBrowse: 0, afterSelection: 0, afterConfigure: 0, afterAppearance: 0, afterApply: 0 },
		artworkLoads: 1,
		artworkResolves: 100,
		totals: [1, 100, 200],
		configureRows: 100,
		appearanceRows: 0,
		applyCalls: 1,
		revisionUnchanged: true,
		oneScrollOwner: true,
		noHorizontalOverflow: true,
	});
});

test("mounted People selection keeps a partially clipped native checkbox inside the inner result scroller", () => {
	assert.deepEqual(mountedResults.peopleSelectionScrollWidths.map((result) => result.width), [360, 393, 412, 899, 901, 1280]);
	for (const result of mountedResults.peopleSelectionScrollWidths) {
		const width = result.width;
		assert.deepEqual(result.focus, {
			browseHeadingFocused: true,
			searchFocused: false,
			autoFocusAttributeAbsent: true,
			keyboardTargetAbsent: true,
			explicitSearchFocused: true,
		}, `${width}px guided People browse-first focus`);
		assert.equal(result.resultCount, 12, `${width}px result boundary fixture`);
		assert.equal(result.pointer.partiallyClipped, true, `${width}px pointer target clipped`);
		assert.equal(result.pointer.inputInsideCardBeforeFocus, true, `${width}px pointer checkbox belongs to card coordinates`);
		assert.equal(result.pointer.selectedExactlyOnce, true, `${width}px pointer selection`);
		assert.equal(result.pointer.cardSelected, true, `${width}px pointer selected card`);
		assert.equal(result.pointer.markerAbsent, true, `${width}px pointer marker absence`);
		assert.equal(result.pointer.outerStable, true, `${width}px pointer outer dialog position`);
		assert.equal(result.pointer.documentStable, true, `${width}px pointer document position`);
		assert.ok(Number.isFinite(result.pointer.innerScrollDelta), `${width}px pointer inner scroll measurement`);
		assert.equal(result.pointer.actionStable, true, `${width}px pointer sticky Configure action`);
		assert.equal(result.keyboard.partiallyClipped, true, `${width}px keyboard target clipped`);
		assert.equal(result.keyboard.inputInsideCardBeforeFocus, true, `${width}px keyboard checkbox belongs to card coordinates`);
		assert.equal(result.keyboard.focused, true, `${width}px native checkbox focus`);
		assert.equal(result.keyboard.focusOwnedByCard, true, `${width}px focused native checkbox belongs to the full-card focus target`);
		assert.equal(result.keyboard.outerStable, true, `${width}px keyboard outer dialog position`);
		assert.equal(result.keyboard.documentStable, true, `${width}px keyboard document position`);
		assert.equal(result.keyboard.innerScrolledToKeepFocusVisible, true, `${width}px keyboard inner scroll ownership`);
		assert.equal(result.keyboard.selectedExactlyOnce, true, `${width}px keyboard-path selection`);
		assert.equal(result.keyboard.cardSelected, true, `${width}px keyboard selected card`);
		assert.equal(result.keyboard.markerAbsent, true, `${width}px keyboard marker absence`);
		assert.equal(result.keyboard.actionStable, true, `${width}px keyboard sticky Configure action`);
		assert.equal(result.keyboard.spaceActivationDeferredToOwner, true, `${width}px no synthetic Space claim`);
		assert.equal(result.disclosure.opened, true, `${width}px selected disclosure opens`);
		assert.equal(result.disclosure.outerStable, true, `${width}px selected disclosure outer position`);
		assert.equal(result.disclosure.documentStable, true, `${width}px selected disclosure document position`);
		assert.equal(result.disclosure.actionStable, true, `${width}px selected disclosure Configure action`);
		assert.equal(result.removalReselection.outerStable, true, `${width}px removal/reselection outer position`);
		assert.equal(result.removalReselection.documentStable, true, `${width}px removal/reselection document position`);
		assert.deepEqual(result.removalReselection.selectedOrder, ["Scroll Person 8", "Scroll Person 6"], `${width}px removal/reselection order`);
		assert.equal(result.outerDialogScrollTop, 0, `${width}px outer dialog does not scroll`);
		assert.equal(result.noHorizontalOverflow, true, `${width}px horizontal overflow`);
	}
});

test("mounted Decades Back navigation stays in the header, preserves drafts, and never mutates", () => {
	assert.deepEqual(mountedResults.decadesNavigation, {
		root: {
			backAbsent: true,
			closePresent: true,
			footerAbsent: true,
		},
		firstStage: {
			stage: "presets",
			backAction: "back-to-creation-launcher",
			backInHeader: true,
			footerLabels: ["Continue"],
			headingFocused: true,
		},
		optionsEntered: {
			stage: "options",
			backAction: "back-to-decades-presets",
			footerLabels: ["Continue"],
			headingFocused: true,
			defaultDisplayOrder: true,
		},
		returnedToPresets: {
			stage: "presets",
			selected1980s: true,
			selected2000s: true,
			headingFocused: true,
		},
		optionsDraftPreserved: {
			mediaBoth: true,
			individualYears: true,
			newestThroughoutDisplayOrder: true,
			redundantChronologyAbsent: true,
			recentSort: true,
			appearanceAbsent: true,
			orderingVisible: true,
			advancedCollapsed: true,
			genreConfigured: true,
		},
		genreSecondary: {
			surfaceOpen: true,
			underlyingInert: true,
			headerInert: true,
			footerHidden: true,
			headingFocused: true,
			exclusionBackdropBorderless: true,
			exclusionPanelBounded: true,
			exclusionHeadingFocused: true,
			exclusionDoneReachable: true,
			exclusionSingleScrollOwner: true,
			summaryUpdated: true,
			focusRestored: true,
			footerReturned: true,
		},
		reviewEntered: {
			stage: "review",
			backAction: "back-to-decades-options",
			footerLabels: ["Create collection"],
			headingFocused: true,
			countCards: 3,
			removedSummariesAbsent: true,
			sectionLabels: ["Title options", "Layout", "Folder options", "View folder details"],
			oldFolderLabelAbsent: true,
			showAllSpacing: { separateSiblings: true, cssGap: 14, actualGap: 14, noOverlap: true },
		},
		reviewBack: {
			stage: "options",
			mediaBoth: true,
			individualYears: true,
			newestThroughoutDisplayOrder: true,
			recentSort: true,
			appearanceAbsent: true,
			headingFocused: true,
		},
		hiddenCollectionTitles: {
			messageCount: 1,
			messageText: "Collection titles are intentionally hidden in Nuvio. Turn this off to edit visible titles.",
			fieldCount: 2,
			allBlankAndDisabled: true,
			allShareDescription: true,
		},
		sharedLayout: {
			rowsHidShowAll: true,
			rowsPreservedWithoutShowAll: true,
			rowsToTabsRestoredEnabled: true,
		},
		reviewNamePreserved: true,
		launcherReturn: {
			backAbsent: true,
			footerAbsent: true,
			firstOptionFocused: true,
		},
		revisionUnchanged: true,
	});
});

test("mounted Decades options and compact Preview actions remain stable at every required width", () => {
	assert.deepEqual(mountedResults.decadesActionWidths.map((result) => result.width), [360, 384, 393, 402, 412, 899, 900, 901, 1280]);
	for (const result of mountedResults.decadesActionWidths) {
		assert.deepEqual(result.stageFooterLayout, {
			select: { leftAligned: true, widthPreserved: true },
			configure: { leftAligned: true, widthPreserved: true },
			review: { leftAligned: true, widthPreserved: true },
		}, `${result.width}px Decades guided footer alignment`);
		assert.equal(result.topBackVisible, true, `${result.width}px Back`);
		assert.equal(result.footerOnlyPrimary, true, `${result.width}px footer`);
		assert.equal(result.primaryReachable, true, `${result.width}px primary`);
		assert.equal(result.headingFocused, true, `${result.width}px focus`);
		assert.equal(result.noHorizontalOverflow, true, `${result.width}px overflow`);
		assert.equal(result.allCollapsed, true, `${result.width}px defaults collapsed`);
		assert.equal(result.collapsedIsShorter, true, `${result.width}px progressive disclosure`);
		assert.equal(result.accordionFocusRetained, true, `${result.width}px disclosure focus`);
		assert.equal(result.oneScrollOwner, true, `${result.width}px scroll ownership`);
		assert.equal(result.currentYearSelectorAbsent, true, `${result.width}px current-year selector`);
		assert.equal(result.mediaPills, 3, `${result.width}px media pills`);
		assert.equal(result.sortPills, 4, `${result.width}px sort pills`);
		assert.equal(result.genreCatalogueAbsent, true, `${result.width}px compact Genre summary`);
		assert.equal(result.orderingVisible, true, `${result.width}px ordering`);
		assert.equal(result.bothDefault, true, `${result.width}px Both default`);
		assert.equal(result.displayOrderChoices, 3, `${result.width}px Display order choices`);
		assert.equal(result.defaultDisplayOrder, true, `${result.width}px Display order default`);
		assert.deepEqual(result.contentSelection, {
			nativeCheckboxes: 3,
			allVisible: true,
			markersAbsent: true,
			neutralCardTreatment: true,
			unselectedFocusable: true,
			toggleSelected: true,
			toggleRestored: true,
		}, `${result.width}px Decades content selection language`);
		assert.deepEqual(result.previewGroups, {
			deferredUntilCatalogueOpen: true,
			groupCount: 2,
			oneRowPerDecade: true,
			noNestedDetails: true,
			sourceCounts: ["11 sources", "11 sources"],
			exactGenreActionClass: true,
			oneActionPerDecade: true,
			compactActions: true,
		}, `${result.width}px compact Decades Preview actions`);
		assert.equal(result.oldChronologyAbsent, true, `${result.width}px redundant chronology controls`);
	}
});

test("mounted Decades Configure Genres uses the shared desktop context/catalogue layout", () => {
	const result = mountedResults.decadesGenreDesktop;
	assert.deepEqual(result.initial.contextLabels, ["All selected Decades", "1950s & Earlier", "1960s", "1970s", "1980s", "1990s", "2000s", "2010s", "2020s"]);
	assert.equal(result.initial.width, 1280);
	assert.equal(result.initial.contextCount, 9);
	assert.equal(result.initial.contextPaneVisible, true);
	assert.equal(result.initial.catalogueVisible, true);
	assert.equal(result.initial.activeAll, true);
	assert.equal(result.initial.rootFocused, true);
	assert.equal(result.initial.validationVisible, true);
	assert.equal(result.initial.noHorizontalStrip, true);
	assert.equal(result.initial.sharedShell, true);
	assert.equal(result.initial.noHorizontalOverflow, true);
	assert.equal(result.initial.contextsFitWidth, true);
	assert.equal(result.initial.twoPane, true);
	assert.equal(result.initial.boundedBorder, true);
	assert.equal(result.initial.doneReachable, true);
	assert.ok(result.initial.rootScrollOwners <= 1);
	assert.equal(result.detail.catalogueVisible, true);
	assert.equal(result.detail.keyboardAbsent, true);
	assert.ok(result.detail.detailScrollOwners <= 1);
	for (const key of ["validationCleared", "sharedCountUpdated", "sharedAppliedToEveryDecade", "backPreservedSharedSelection", "switchedContext", "sharedSelectionPreserved", "individualCountUpdated", "selectAllWorked", "clearAllWorked", "validationReturned", "lastContextReachable", "lastContextActive", "lastContextPreserved", "contextValuesPreserved", "closed", "focusRestored", "revisionUnchanged"]) assert.equal(result[key], true, key);
});

test("mounted Decades Configure Genres matches the accepted mobile context-detail flow at every required width", () => {
	assert.deepEqual(mountedResults.decadesGenreWidths.map((result) => result.initial.width), [360, 384, 393, 402, 412]);
	for (const result of mountedResults.decadesGenreWidths) {
		const width = result.initial.width;
		assert.equal(result.initial.contextCount, 9, `${width}px contexts`);
		assert.equal(result.initial.contextPaneVisible, true, `${width}px context pane`);
		assert.equal(result.initial.catalogueVisible, false, `${width}px root hides catalogue`);
		assert.equal(result.initial.activeAll, true, `${width}px active context`);
		assert.equal(result.initial.rootFocused, true, `${width}px root focus`);
		assert.equal(result.initial.validationVisible, true, `${width}px required validation`);
		assert.equal(result.initial.noHorizontalStrip, true, `${width}px no context strip`);
		assert.equal(result.initial.sharedShell, true, `${width}px shared shell`);
		assert.equal(result.initial.noHorizontalOverflow, true, `${width}px overflow`);
		assert.equal(result.initial.contextsFitWidth, true, `${width}px context width`);
		assert.equal(result.initial.mobileRootOnly, true, `${width}px mobile root`);
		assert.equal(result.initial.boundedBorder, true, `${width}px bounded border`);
		assert.equal(result.initial.doneReachable, true, `${width}px Done`);
		assert.equal(result.initial.safeAreaPadding, true, `${width}px safe area`);
		assert.ok(result.initial.rootScrollOwners <= 1, `${width}px root scroll ownership`);
		assert.equal(result.detail.catalogueVisible, true, `${width}px catalogue`);
		assert.equal(result.detail.contextPaneHidden, true, `${width}px detail hides contexts`);
		assert.equal(result.detail.backVisible, true, `${width}px context Back`);
		assert.equal(result.detail.detailFocused, true, `${width}px detail focus`);
		assert.equal(result.detail.keyboardAbsent, true, `${width}px no keyboard focus`);
		assert.ok(result.detail.detailScrollOwners <= 1, `${width}px detail scroll ownership`);
		for (const key of ["validationCleared", "sharedCountUpdated", "sharedAppliedToEveryDecade", "backPreservedSharedSelection", "switchedContext", "sharedSelectionPreserved", "individualCountUpdated", "selectAllWorked", "clearAllWorked", "validationReturned", "lastContextReachable", "lastContextActive", "lastContextPreserved", "contextValuesPreserved", "closed", "focusRestored", "revisionUnchanged"]) assert.equal(result[key], true, `${width}px ${key}`);
	}
});

test("mounted Decades Genre exclusions use the bounded shared desktop context/catalogue layout", () => {
	const result = mountedResults.decadesExclusionDesktop;
	assert.deepEqual(result.initial.contextLabels, ["All selected Decades", "1950s & Earlier", "1960s", "1970s", "1980s", "1990s", "2000s", "2010s", "2020s"]);
	assert.equal(result.initial.width, 1280);
	assert.equal(result.initial.contextCount, 9);
	assert.equal(result.initial.contextPaneVisible, true);
	assert.equal(result.initial.catalogueVisible, true);
	assert.equal(result.initial.activeAll, true);
	assert.equal(result.initial.rootFocused, true);
	assert.equal(result.initial.noHorizontalStrip, true);
	assert.equal(result.initial.noHorizontalOverflow, true);
	assert.equal(result.initial.contextsFitWidth, true);
	assert.equal(result.initial.twoPane, true);
	assert.equal(result.initial.boundedBorder, true);
	assert.equal(result.initial.doneReachable, true);
	assert.ok(result.initial.rootScrollOwners <= 1);
	assert.equal(result.detail.catalogueVisible, true);
	assert.equal(result.detail.keyboardAbsent, true);
	assert.ok(result.detail.detailScrollOwners <= 1);
	for (const key of ["sharedCountUpdated", "sharedAppliedToEveryDecade", "sharedSelectionPreserved", "individualCountUpdated", "selectAllWorked", "clearAllWorked", "lastContextReachable", "lastContextActive", "lastContextPreserved", "contextValuesPreserved", "closed", "focusRestored"]) assert.equal(result[key], true, key);
});

test("mounted Decades Genre exclusions match the accepted mobile context-detail flow at every required width", () => {
	assert.deepEqual(mountedResults.decadesExclusionWidths.map((result) => result.initial.width), [360, 384, 393, 402, 412]);
	for (const result of mountedResults.decadesExclusionWidths) {
		const width = result.initial.width;
		assert.equal(result.initial.contextCount, 9, `${width}px contexts`);
		assert.equal(result.initial.contextPaneVisible, true, `${width}px context pane`);
		assert.equal(result.initial.catalogueVisible, false, `${width}px root hides catalogue`);
		assert.equal(result.initial.activeAll, true, `${width}px active context`);
		assert.equal(result.initial.rootFocused, true, `${width}px root focus`);
		assert.equal(result.initial.noHorizontalStrip, true, `${width}px no context strip`);
		assert.equal(result.initial.noHorizontalOverflow, true, `${width}px overflow`);
		assert.equal(result.initial.contextsFitWidth, true, `${width}px context width`);
		assert.equal(result.initial.mobileRootOnly, true, `${width}px mobile root`);
		assert.equal(result.initial.boundedBorder, true, `${width}px bounded border`);
		assert.equal(result.initial.doneReachable, true, `${width}px Done`);
		assert.equal(result.initial.safeAreaPadding, true, `${width}px safe area`);
		assert.ok(result.initial.rootScrollOwners <= 1, `${width}px root scroll ownership`);
		assert.equal(result.detail.catalogueVisible, true, `${width}px catalogue`);
		assert.equal(result.detail.contextPaneHidden, true, `${width}px detail hides contexts`);
		assert.equal(result.detail.backVisible, true, `${width}px context Back`);
		assert.equal(result.detail.detailFocused, true, `${width}px detail focus`);
		assert.equal(result.detail.keyboardAbsent, true, `${width}px no keyboard focus`);
		assert.ok(result.detail.detailScrollOwners <= 1, `${width}px detail scroll ownership`);
		for (const key of ["sharedCountUpdated", "sharedAppliedToEveryDecade", "sharedSelectionPreserved", "individualCountUpdated", "selectAllWorked", "clearAllWorked", "lastContextReachable", "lastContextActive", "lastContextPreserved", "contextValuesPreserved", "closed", "focusRestored"]) assert.equal(result[key], true, `${width}px ${key}`);
	}
});

test("mounted Genre Add secondary surfaces keep the form mounted and block the underlying operation", () => {
	const result = mountedResults.genreCreationSecondary;
	assert.deepEqual(result.help, {
		surfaceOpen: true,
		underlyingMounted: true,
		underlyingInert: true,
		underlyingHeaderInert: true,
		footerHidden: true,
		focusOnHeading: true,
		doneActive: true,
		submitBlocked: true,
		escapeClosed: true,
		focusRestored: true,
	});
	assert.deepEqual(result.exclusions, {
		initialMobileView: "genres",
		pickerMobileView: "picker",
		selfOmitted: true,
		otherSelectedGenreAvailable: true,
		incompatibleGenreOmitted: true,
		footerHidden: true,
		rootDoneVisible: true,
		innerDoneHidden: true,
		detailBackVisible: true,
		detailBackLabel: "← Back to Genres",
		detailHeaderSticky: true,
		detailBackRemainsVisibleAfterScroll: true,
		detailHeadingFocused: true,
		singleScrollOwner: true,
		browserBackReturnedToRoot: true,
		rootDoneReturnedAfterBrowserBack: true,
		backPreservedValue: true,
		mainSummaryUpdated: true,
		focusRestored: true,
		footerReturned: true,
	});
	assert.equal(result.applyCalls, 0);
});

test("mounted Genre Source Edit hides Save during Help/exclusions and restores focus and values", () => {
	const result = mountedResults.genreEditSecondary;
	assert.deepEqual(result.help, {
		surfaceOpen: true,
		underlyingMounted: true,
		underlyingInert: true,
		underlyingHeaderInert: true,
		footerHidden: true,
		focusOnHeading: true,
		doneActive: true,
		submitBlocked: true,
		escapeClosed: true,
		focusRestored: true,
	});
	assert.deepEqual(result.exclusions, {
		surfaceOpen: true,
		selfOmitted: true,
		tvOnlyOmitted: true,
		compatibleGenreAvailable: true,
		footerHidden: true,
		doneActive: true,
		valuePreserved: true,
		focusRestored: true,
		footerReturned: true,
	});
});
