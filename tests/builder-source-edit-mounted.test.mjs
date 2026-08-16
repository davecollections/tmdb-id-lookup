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
			if (result?.status === "complete") {
				const genreToolbarWidths = [];
				const decadesActionWidths = [];
				const decadesGenreWidths = [];
				const decadesExclusionWidths = [];
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
				return { ...result.results, genreToolbarWidths, decadesActionWidths, decadesGenreDesktop, decadesGenreWidths, decadesExclusionDesktop, decadesExclusionWidths };
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
			sectionLabels: ["Titles & visibility", "Collection options", "Folder options", "View folder details"],
			oldFolderLabelAbsent: true,
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
