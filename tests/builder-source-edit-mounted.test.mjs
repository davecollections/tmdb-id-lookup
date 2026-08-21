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
		resources.pageConnection = await connectDevTools(target.webSocketDebuggerUrl, { commandTimeoutMs: 120000 });
		await resources.pageConnection.command("Page.enable");
		await resources.pageConnection.command("Runtime.enable");
		const address = resources.vite.httpServer.address();
		await resources.pageConnection.command("Page.navigate", {
			url: `http://127.0.0.1:${address.port}/tests/fixtures/builder-source-edit-mounted.html`,
		});
		const deadline = Date.now() + 30000;
		while (Date.now() < deadline) {
			const evaluated = await resources.pageConnection.command("Runtime.evaluate", {
				expression: "window.__builderSourceEditMounted ?? null",
				returnByValue: true,
			});
			const result = evaluated.result?.value;
			if (result?.status === "complete") {
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
				const networkLivePreviewWidths = [];
				const genreLivePreviewWidths = [];
				for (const width of [360, 384, 393, 402, 412, 899, 900, 901, 1280]) {
					await resources.pageConnection.command("Emulation.setDeviceMetricsOverride", { width, height: width <= 412 ? 852 : 900, deviceScaleFactor: 1, mobile: width <= 412 });
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
				}
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
				}
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
				for (const width of [360, 384, 393, 402, 412]) {
					await resources.pageConnection.command("Emulation.setDeviceMetricsOverride", { width, height: 852, deviceScaleFactor: 1, mobile: true });
					const toolbarEvaluation = await resources.pageConnection.command("Runtime.evaluate", {
						expression: "window.__runGenreToolbarScenario()",
						awaitPromise: true,
						returnByValue: true,
					});
					genreToolbarWidths.push(toolbarEvaluation.result?.value);
					const decadesActionEvaluation = await resources.pageConnection.command("Runtime.evaluate", {
						expression: "window.__runDecadesActionLayoutScenario()",
						awaitPromise: true,
						returnByValue: true,
					});
					decadesActionWidths.push(decadesActionEvaluation.result?.value);
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
				return { ...result.results, peopleConfigureWidths, peoplePillStabilityWidths, peopleSelectionScrollWidths, franchiseReviewWidths, studioHierarchyWidths, networkHierarchyWidths, genreHierarchyWidths, networkLivePreviewWidths, genreLivePreviewWidths, networkDeferredArtwork, studioScale: studioScaleEvaluation.result?.value, genreToolbarWidths, decadesActionWidths, decadesGenreDesktop, decadesGenreWidths, decadesExclusionDesktop, decadesExclusionWidths };
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
		assert.equal(result.explicitSearchFocused, true, `${width}px explicit Search focus`);
		assert.equal(result.selectedAll, true, `${width}px Select all`);
		assert.deepEqual({ state: result.selectionState, tick: result.selectionTick }, {
			state: "selected",
			tick: "✓",
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
			introCopy: "Choose how the configured Genres are organised in Nuvio.",
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
				"genre-folders": { title: "Genre folders", description: "One folder for each Genre, with Movies and Series together." },
				"media-folders": { title: "Media folders", description: "One Movies folder and one Series folder, with Genres inside each." },
				"separate-media-genre-folders": { title: "Separate Movie & Series Genre folders", description: "Create a separate folder for every Movie and Series Genre." },
				"separate-media-collections": { title: "Separate Movie & Series collections", description: "Create one collection for Movie Genres and another for Series Genres." },
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
			compositeHelper: "Some Series genres combine categories that Movies keep separate. You can keep them in their own folder or place them with the matching Movie genres.",
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

test("mounted Blank collection and folder creation immediately unlock the next manual action", () => {
	assert.deepEqual(mountedResults.blankCreation, {
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
			unselectedState: "unselected",
			cardClickToggled: true,
			accessibleChecked: true,
			selectedState: "selected",
			selectedTick: "✓",
			circular: true,
			size: width <= 520 ? 20 : 22,
			unselectedRingVisible: true,
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
		assert.equal(result.preview.posterCount, width <= 520 ? 5 : 10, `${width}px preview limit`);
		assert.equal(result.preview.postersReady, true, `${width}px loaded Movie posters`);
		assert.equal(result.preview.genuineTmdbSources, true, `${width}px genuine TMDB Movie poster sources`);
		assert.equal(result.preview.modalSurface, true, `${width}px preview modal`);
		assert.equal(result.preview.outsidePeopleRow, true, `${width}px preview outside row flow`);
		assert.equal(result.preview.gridColumns, width <= 520 ? 5 : 10, `${width}px preview columns`);
		assert.equal(result.preview.posterOnly, true, `${width}px poster-only`);
		assert.equal(result.preview.noHorizontalOverflow, true, `${width}px preview overflow`);
		assert.equal(result.preview.headingFocused, true, `${width}px preview focus`);
		assert.equal(result.preview.sharedNestedLayer, true, `${width}px shared nested preview layer`);
		assert.equal(result.preview.aboveCreationModal, true, `${width}px preview above creation modal`);
		assert.deepEqual(result.preview.mediaSeparation, {
			tabCount: 2,
			moviesInitiallyActive: true,
			seriesActive: true,
			moviePosterCount: width <= 520 ? 5 : 10,
			seriesPosterCount: width <= 520 ? 5 : 10,
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
			assert.equal(preview.posterCount, width <= 520 ? 5 : 10, `${width}px ${origin} full bounded poster grid`);
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
			mostMoviesAbsent: true,
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
			visiblePosters: width <= 520 ? 5 : 10,
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
			createAction: "Create 2 folders",
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
			allDefault: true,
			pageSize: 20,
			countsShown: true,
			knownZeroShownByAll: true,
			previewAbsent: true,
			previewCalls: 0,
		}, `${width}px checked-in Network Search`);
		assert.equal(result.filters.pageReset, true, `${width}px filter resets pagination`);
		assert.equal(result.filters.fiveHundredCounts.length, 20, `${width}px 500+ page size`);
		assert.equal(result.filters.fiveHundredCounts.every((count) => count >= 500), true, `${width}px 500+ catalogue semantics`);
		assert.equal(result.filters.excludeZeroActive, true, `${width}px Exclude 0 remains selected`);
		assert.deepEqual(result.selection, {
			selectedCount: 2,
			nativeCheckboxes: true,
			selectedIndicators: true,
			selectionPreservedAcrossFilter: true,
			filterPreserved: true,
		}, `${width}px native Network selection`);
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
		const maximumPosterCount = width <= 520 ? 5 : 10;
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
		const maximumPosterCount = width <= 520 ? 5 : 10;
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
		assert.equal(result.resultCount, 12, `${width}px result boundary fixture`);
		assert.equal(result.pointer.partiallyClipped, true, `${width}px pointer target clipped`);
		assert.equal(result.pointer.inputInsideCardBeforeFocus, true, `${width}px pointer checkbox belongs to card coordinates`);
		assert.equal(result.pointer.selectedExactlyOnce, true, `${width}px pointer selection`);
		assert.equal(result.pointer.selectedState, "selected", `${width}px pointer selected badge`);
		assert.equal(result.pointer.selectedTick, "✓", `${width}px pointer tick`);
		assert.equal(result.pointer.outerStable, true, `${width}px pointer outer dialog position`);
		assert.equal(result.pointer.documentStable, true, `${width}px pointer document position`);
		assert.ok(Number.isFinite(result.pointer.innerScrollDelta), `${width}px pointer inner scroll measurement`);
		assert.equal(result.pointer.actionStable, true, `${width}px pointer sticky Configure action`);
		assert.equal(result.keyboard.partiallyClipped, true, `${width}px keyboard target clipped`);
		assert.equal(result.keyboard.inputInsideCardBeforeFocus, true, `${width}px keyboard checkbox belongs to card coordinates`);
		assert.equal(result.keyboard.focused, true, `${width}px native checkbox focus`);
		assert.equal(result.keyboard.outerStable, true, `${width}px keyboard outer dialog position`);
		assert.equal(result.keyboard.documentStable, true, `${width}px keyboard document position`);
		assert.equal(result.keyboard.innerScrolledToKeepFocusVisible, true, `${width}px keyboard inner scroll ownership`);
		assert.equal(result.keyboard.selectedExactlyOnce, true, `${width}px keyboard-path selection`);
		assert.equal(result.keyboard.selectedState, "selected", `${width}px keyboard selected badge`);
		assert.equal(result.keyboard.selectedTick, "✓", `${width}px keyboard tick`);
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
			footerLabels: ["Create 4 folders"],
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

test("mounted Decades header Back and primary-only footer remain reachable at every required narrow width", () => {
	assert.deepEqual(mountedResults.decadesActionWidths.map((result) => result.width), [360, 384, 393, 402, 412]);
	for (const result of mountedResults.decadesActionWidths) {
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
