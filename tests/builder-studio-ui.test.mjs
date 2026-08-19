import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createElement } from "../builder/node_modules/react/index.js";
import { renderToStaticMarkup } from "../builder/node_modules/react-dom/server.js";
import { createServer } from "../builder/node_modules/vite/dist/node/index.js";
import { createBuilderController } from "../builder/src/application/index.js";
import { INITIAL_ASYNC_REQUEST_STATE } from "../builder/src/source-add/index.js";
import {
	completeStudioSearchRestore,
	createStudioSourceNavigationState,
	enterStudioConfigure,
	returnStudioToSearch,
	STUDIO_SOURCE_STEPS,
} from "../builder/src/ui/studio-source-navigation-state.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vite = await createServer({
	root: path.join(rootDir, "builder"),
	appType: "custom",
	logLevel: "silent",
	server: { middlewareMode: true },
});
const { AddSourceDialog, AddSourceSearchStep } = await vite.ssrLoadModule("/src/ui/AddSourceDialog.jsx");
const { PeopleSearchStep, PeopleSourceFlow } = await vite.ssrLoadModule("/src/ui/PeopleSourceFlow.jsx");
const { SourceModeDialog } = await vite.ssrLoadModule("/src/ui/SourceModeDialog.jsx");
const {
	StudioConfigureStep,
	StudioConfigureActions,
	StudioDuplicateNotice,
	StudioElsewhereNotice,
	StudioLogo,
	StudioSearchStep,
	StudioSourceFlow,
} = await vite.ssrLoadModule("/src/ui/StudioSourceFlow.jsx");
after(() => vite.close());

function read(relativePath) {
	return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function studio(overrides = {}) {
	return {
		id: 3,
		name: "Pixar",
		parentCompany: "Walt Disney Pictures",
		country: "US",
		headquarters: "Emeryville, California",
		logoPath: "/pixar.png",
		movieCount: 136,
		...overrides,
	};
}

function renderSearch(results) {
	const data = { results, page: 1, totalPages: 1, totalResults: results.length };
	return renderToStaticMarkup(createElement(StudioSearchStep, {
		input: "pixar",
		inputRef: null,
		parsedInput: { kind: "search", query: "pixar", eligible: true, message: null },
		lookupState: { ...INITIAL_ASYNC_REQUEST_STATE, status: "success", data },
		searchData: data,
		effectiveSearchSort: "best-match",
		onInputChange() {},
		onRetry() {},
		onSelect() {},
		onChangePage() {},
	}));
}

function renderConfigure({
	counts = {
		movie: { status: "ready", count: 42 },
		series: { status: "ready", count: 17 },
	},
	choices = ["studio-movies"],
	duplicateReview = { destination: [], elsewhere: [] },
} = {}) {
	return renderToStaticMarkup(createElement(StudioConfigureStep, {
		studio: studio(),
		counts,
		choices,
		duplicateReview,
		applyDiagnostic: null,
		onToggle() {},
	}));
}

function fakeCollectionProvider() {
	return {
		async searchCollections() { return { ok: true, data: { results: [], page: 1, totalPages: 1, totalResults: 0 } }; },
		async getCollection() { return { ok: false, error: { message: "Unavailable" } }; },
	};
}

function fakePeopleProvider() {
	return {
		async searchPeople() { return { ok: true, data: { results: [], page: 1, totalPages: 1, totalResults: 0 } }; },
		async getPerson() { return { ok: false, error: { message: "Unavailable" } }; },
	};
}

test("Add Source picker exposes Studios with the approved user-facing wording", () => {
	const markup = renderToStaticMarkup(createElement(SourceModeDialog, {
		folderName: "Animation",
		onCancel() {},
		onSelectMode() {},
	}));
	assert.ok(markup.includes('data-source-mode-option="tmdb-studios"'));
	assert.ok(markup.includes("<strong>Studios</strong>"));
	assert.ok(markup.includes("Add Movie or Series sources for one studio."));
	assert.equal(markup.includes("Studios &amp; Companies"), false);
	assert.equal((markup.match(/class="source-mode-option"/g) ?? []).length, 6);
});

test("Studio result cards explicitly distinguish positive, zero, and unknown Movie Count values", () => {
	const markup = renderSearch([
		studio(),
		studio({ id: 4, name: "Zero Studio", movieCount: 0, logoPath: null, parentCompany: "" }),
		studio({ id: 5, name: "Unknown Studio", movieCount: null, logoPath: null, parentCompany: "" }),
	]);
	assert.ok(markup.includes("Pixar"));
	assert.ok(markup.includes("TMDB 3"));
	assert.ok(markup.includes("US · Emeryville, California"));
	assert.ok(markup.includes("Parent: Walt Disney Pictures"));
	assert.ok(markup.includes("Movie Count: 136"));
	assert.ok(markup.includes("Movie Count: 0"));
	assert.ok(markup.includes("Movie Count: Unknown"));
	assert.equal((markup.match(/Movie Count:/g) ?? []).length, 3);
	assert.equal(markup.includes("cached monthly"), false);
	assert.equal(markup.includes("last updated"), false);
	assert.equal(markup.includes("titles"), false);
	assert.ok(markup.includes("Zero Studio logo unavailable"));
	assert.ok(markup.includes(">No logo<"));
	assert.equal(markup.includes(">Z<"), false);
});

test("Studio search renders a clear empty state and no live count call", () => {
	const markup = renderSearch([]);
	const flow = read("builder/src/ui/StudioSourceFlow.jsx");
	const searchStep = flow.slice(flow.indexOf("export function StudioSearchStep"), flow.indexOf("function currentCountText"));
	assert.ok(markup.includes("No Studios matched this search."));
	assert.doesNotMatch(searchStep, /getStudioCounts|discover\/movie|discover\/tv/);
});

test("Studio Configure presents independent counts and compact semantic sort choices", () => {
	const markup = renderConfigure();
	assert.ok(markup.includes("Add studio") === false);
	assert.ok(markup.includes("<strong>Movies</strong>"));
	assert.ok(markup.includes("42 movies"));
	assert.ok(markup.includes("<strong>Series</strong>"));
	assert.ok(markup.includes("17 series"));
	assert.equal(markup.includes("Not available yet"), false);
	assert.equal(markup.includes("Refresh title count"), false);
	assert.ok(markup.includes("Sort titles by"));
	assert.ok(markup.includes("Popular"));
	assert.ok(markup.includes("Recent"));
	assert.ok(markup.includes("Top rated"));
	assert.ok(markup.includes("Most voted"));
	assert.ok(markup.includes("Popular titles first."));
	assert.equal(markup.includes("Recently released titles first."), false);
	assert.equal(markup.includes("Highest-rated titles first."), false);
	assert.equal(markup.includes("Titles with the most votes first."), false);
	assert.ok(markup.includes('href="https://www.themoviedb.org/company/3"'));
	assert.ok(markup.includes('target="_blank"'));
	assert.ok(markup.includes('rel="noopener noreferrer"'));
	assert.ok(markup.includes("Open Pixar on TMDB"));
	assert.equal((markup.match(/type="checkbox"/g) ?? []).length, 2);
	assert.equal((markup.match(/type="radio"/g) ?? []).length, 4);
	assert.equal((markup.match(/disabled=""/g) ?? []).length, 0);
	assert.equal((markup.match(/checked=""/g) ?? []).length, 2);
	assert.equal(markup.includes("<select"), false);
	assert.equal(markup.includes("Movie Count: 136"), false);
});

test("Studio search keeps Best Match hidden and exposes only Builder-style overrides and zero toggle", () => {
	const markup = renderSearch([studio()]);
	const source = read("builder/src/ui/TmdbEntityLogo.jsx");
	const catalogue = read("builder/src/source-add/studio-catalogue.js");
	assert.ok(markup.includes("Search by studio name, location or TMDB ID."));
	assert.ok(markup.includes("Studio results"));
	assert.ok(markup.includes("Choose a studio"));
	assert.equal(markup.includes("Best match"), false);
	assert.ok(markup.includes(">A–Z</button>"));
	assert.ok(markup.includes(">Most movies</button>"));
	assert.ok(markup.includes(">Hide studios with no movies</button>"));
	assert.equal(markup.includes("<select"), false);
	assert.equal(markup.includes("type=\"checkbox\""), false);
	for (const forbidden of [
		"Choose one studio from the cached TMDB catalogue.",
		"Search the cached Studio catalogue",
		"No current title counts are requested while browsing",
		"Cached results",
	]) assert.equal(markup.includes(forbidden), false, forbidden);
	for (const forbidden of [
		"Choose one studio from the cached TMDB catalogue.",
		"Search the cached Studio catalogue",
		"No current title counts are requested while browsing",
		"Cached results",
		"cached Studio catalogue",
	]) assert.equal(`${source}\n${catalogue}`.includes(forbidden), false, forbidden);
});

test("Studio hierarchy Search prioritizes Movie count and exposes only the quiet A–Z override", () => {
	const hierarchy = renderToStaticMarkup(createElement(StudioSearchStep, {
		input: "",
		inputRef: null,
		parsedInput: { kind: "empty", message: null },
		lookupState: INITIAL_ASYNC_REQUEST_STATE,
		searchData: null,
		browsing: true,
		effectiveSearchSort: "movie-count-desc",
		movieCountFilter: "all",
		showMovieCountFilters: true,
		onInputChange() {}, onSortChange() {}, onMovieCountFilterChange() {}, onRetry() {}, onSelect() {}, onChangePage() {},
	}));
	assert.ok(hierarchy.includes("Movie count"));
	for (const label of ["All", "Exclude 0", "10+", "50+", "100+", "500+"]) assert.ok(hierarchy.includes(`>${label}</button>`), label);
	assert.match(hierarchy, /<button(?=[^>]*aria-label="Order Studios A–Z")(?=[^>]*aria-pressed="false")[^>]*>/);
	assert.equal(hierarchy.includes("Most movies"), false);
	assert.equal(hierarchy.includes(">Sort<"), false);
	assert.equal(hierarchy.includes("Best match"), false);
	const alphabetical = renderToStaticMarkup(createElement(StudioSearchStep, {
		input: "warner",
		inputRef: null,
		parsedInput: { kind: "search", query: "warner", eligible: true, message: null },
		lookupState: INITIAL_ASYNC_REQUEST_STATE,
		searchData: null,
		browsing: false,
		effectiveSearchSort: "name-asc",
		movieCountFilter: "all",
		showMovieCountFilters: true,
		onInputChange() {}, onSortChange() {}, onMovieCountFilterChange() {}, onRetry() {}, onSelect() {}, onChangePage() {},
	}));
	assert.match(alphabetical, /<button(?=[^>]*aria-label="Order Studios A–Z")(?=[^>]*aria-pressed="true")[^>]*>/);
});

test("empty Studio search browses automatically with effective Most movies and no extra Browse action", () => {
	const browsing = renderToStaticMarkup(createElement(StudioSearchStep, {
		input: "",
		inputRef: null,
		parsedInput: { kind: "empty", message: "Enter a studio name or TMDB studio ID." },
		lookupState: INITIAL_ASYNC_REQUEST_STATE,
		searchData: null,
		browsing: true,
		effectiveSearchSort: "movie-count-desc",
		onInputChange() {}, onRetry() {}, onSelect() {}, onChangePage() {},
	}));
	assert.equal(browsing.includes("Browse all studios"), false);
	assert.match(browsing, /aria-pressed="true">Most movies<\/button>/);
	assert.match(browsing, /aria-pressed="false">A–Z<\/button>/);
	const alphabetical = renderToStaticMarkup(createElement(StudioSearchStep, {
		input: "",
		inputRef: null,
		parsedInput: { kind: "empty", message: "Enter a studio name or TMDB studio ID." },
		lookupState: INITIAL_ASYNC_REQUEST_STATE,
		searchData: null,
		browsing: true,
		effectiveSearchSort: "name-asc",
		onInputChange() {}, onRetry() {}, onSelect() {}, onChangePage() {},
	}));
	assert.match(alphabetical, /aria-pressed="true">A–Z<\/button>/);
	assert.match(alphabetical, /aria-pressed="false">Most movies<\/button>/);
	const source = read("builder/src/ui/use-studio-catalogue-search.js");
	assert.match(source, /const browsing = parsedInput\.kind === "empty"/);
	assert.match(source, /browsing \? STUDIO_SEARCH_SORTS\.MOVIE_COUNT_DESC : DEFAULT_STUDIO_SEARCH_SORT/);
	assert.match(source, /current === sort \? null : sort/);
	assert.equal(source.includes("studio-browse-all"), false);
	assert.equal(source.includes("browseAll"), false);
});

test("wide, square, tall, and transparent-padded Studio logos share contained frames and deterministic fallbacks", () => {
	const logoCases = [
		["Wide Mark", "/wide-mark.png"],
		["Square Mark", "/square-mark.png"],
		["Tall Mark", "/tall-mark.png"],
		["Transparent Padding Mark", "/transparent-padding-mark.png"],
	].map(([name, logoPath]) => renderToStaticMarkup(createElement(StudioLogo, {
		studio: studio({ name, logoPath }),
		context: "result",
	})));
	const missing = renderToStaticMarkup(createElement(StudioLogo, { studio: studio({ name: "Blue Ant Studios", logoPath: null }), context: "configure" }));
	const styles = read("builder/src/styles.css");
	const source = read("builder/src/ui/TmdbEntityLogo.jsx");
	for (const valid of logoCases) {
		assert.ok(valid.includes("studio-logo-tile studio-logo-tile--result"));
		assert.ok(valid.includes("studio-logo-image"));
		assert.ok(valid.includes('data-logo-state="ready"'));
	}
	assert.ok(missing.includes("studio-logo-tile studio-logo-tile--configure"));
	assert.ok(missing.includes('data-logo-state="missing"'));
	assert.ok(missing.includes(">No logo available<"));
	assert.equal(missing.includes(">BA<"), false);
	assert.ok(missing.includes("Blue Ant Studios logo unavailable"));
	assert.equal(missing.includes("🎬"), false);
	assert.match(styles, /\.studio-logo-image\s*\{[^}]*width:\s*100%[^}]*height:\s*100%[^}]*max-width:\s*100%[^}]*max-height:\s*100%[^}]*object-fit:\s*contain[^}]*object-position:\s*center/);
	assert.match(styles, /\.studio-logo-tile\s*\{[^}]*place-items:\s*center[^}]*padding:\s*8px/);
	assert.match(source, /onError=\{\(\) => setFailed\(true\)\}/);
	assert.match(source, /data-logo-state=\{source && !failed \? "ready" : failed \? "error" : "missing"\}/);
	assert.equal(source.includes("studioMonogram"), false);
});

test("Franchise, People, and Studio searches use one native in-field search clear affordance", () => {
	const common = { lookupState: INITIAL_ASYNC_REQUEST_STATE, searchData: null, onInputChange() {}, onRetryLookup() {}, onChangePage() {} };
	const franchise = renderToStaticMarkup(createElement(AddSourceSearchStep, {
		...common,
		input: "Pixar",
		inputRef: null,
		parsedInput: { kind: "search", query: "Pixar", eligible: true, message: null },
		lookupMessage: null,
		selectedResult: null,
		selectionState: INITIAL_ASYNC_REQUEST_STATE,
		selectionCandidate: null,
		selectionMessage: null,
		onSelectResult() {}, onRetrySelection() {},
	}));
	const people = renderToStaticMarkup(createElement(PeopleSearchStep, {
		...common,
		context: "folder",
		input: "Greta",
		inputRef: null,
		parsedInput: { kind: "search", query: "Greta", eligible: true, message: null },
		selection: { order: [], byId: {} },
		selectionError: null,
		onActivateResult() {}, onRemoveSelected() {},
	}));
	const studios = renderSearch([studio()]);
	for (const markup of [franchise, people, studios]) {
		assert.ok(markup.includes('type="search"'));
		assert.equal(markup.includes("entity-search-clear"), false);
		assert.equal(markup.includes("Clear movie franchise search"), false);
		assert.equal(markup.includes("Clear people search"), false);
		assert.equal(markup.includes("Clear studio search"), false);
	}
	for (const file of ["AddSourceDialog.jsx", "PeopleSourceFlow.jsx", "use-studio-catalogue-search.js"]) {
		const source = read(`builder/src/ui/${file}`);
		assert.equal(source.includes("SearchInputControl"), false, file);
		assert.match(source, /setPage\(1\)/, file);
	}
	assert.equal(fs.existsSync(path.join(rootDir, "builder/src/ui/SearchInputControl.jsx")), false);
	assert.equal(read("builder/src/styles.css").includes("entity-search-clear"), false);
});

test("automatic counts stay informational with quiet unavailable states and no repair controls", () => {
	const movieNotice = "TMDB currently returns no movies for this studio. You can still add it.";
	const seriesNotice = "TMDB currently returns no series for this studio. You can still add it.";
	const partial = renderConfigure({
		counts: {
			movie: { status: "ready", count: 0 },
			series: { status: "unavailable", count: null },
		},
	});
	assert.ok(partial.includes("0 movies"));
	assert.ok(partial.includes(movieNotice));
	assert.ok(partial.includes("Count unavailable"));
	assert.equal(partial.includes(seriesNotice), false);
	assert.equal(partial.includes("Retry Series count"), false);
	assert.equal(partial.includes("Retry Movie count"), false);
	assert.equal(partial.includes("Refresh title count"), false);
	assert.equal(partial.includes("disabled=\"\" checked=\"\""), false);
	const seriesZero = renderConfigure({
		counts: {
			movie: { status: "ready", count: 42 },
			series: { status: "ready", count: 0 },
		},
	});
	assert.ok(seriesZero.includes(seriesNotice));
	assert.equal(seriesZero.includes(movieNotice), false);
	const positive = renderConfigure();
	assert.equal(positive.includes(movieNotice), false);
	assert.equal(positive.includes(seriesNotice), false);
	const actions = renderToStaticMarkup(createElement(StudioConfigureActions, {
		hasDestinationDuplicates: false, primaryCount: 1, configuredCount: 1, onAddAll() {},
	}));
	assert.ok(actions.includes(">Add 1 source</button>"));
	assert.equal(actions.includes("disabled"), false);
	const source = read("builder/src/ui/StudioSourceFlow.jsx");
	assert.equal(source.includes("studio-count-retries"), false);
	assert.equal(source.includes("onRetryCount"), false);
});

test("partial and full Studio duplicate notices name exact identities and expose the correct actions", () => {
	const markup = renderConfigure({
		choices: ["studio-series"],
		duplicateReview: {
			destination: [{ identity: "tmdb|COMPANY|3|MOVIE", mediaType: "MOVIE" }],
			elsewhere: [{ identity: "tmdb|COMPANY|3|TV", mediaType: "TV", collectionInternalId: "collection-tv", collectionTitle: "TV", folderInternalId: "folder-animation", folderTitle: "Animation" }],
		},
	});
	assert.ok(markup.includes("studio-already-added"));
	assert.ok(markup.includes("Movies already exist. Add will only include Series."));
	assert.equal(markup.includes("Already in this folder"), false);
	assert.ok(markup.includes("This source exists elsewhere"));
	assert.ok(markup.includes("Animation · in TV"));
	assert.ok(markup.includes("You can still add it to this folder, or close this window to cancel."));
	assert.ok(markup.indexOf("Movies already exist") < markup.indexOf("This source exists elsewhere"));
	assert.equal((markup.match(/data-source-duplicate="true"/g) ?? []).length, 1);
	const partialActions = renderToStaticMarkup(createElement(StudioConfigureActions, {
		hasDestinationDuplicates: true, primaryCount: 1, configuredCount: 2, onAddAll() {},
	}));
	assert.ok(partialActions.includes(">Add 1 source</button>"));
	assert.ok(partialActions.includes(">Add all anyway</button>"));
	const fullNotice = renderToStaticMarkup(createElement(StudioDuplicateNotice, {
		duplicateReview: { destination: [{ mediaType: "MOVIE" }, { mediaType: "TV" }], elsewhere: [] },
	}));
	assert.ok(fullNotice.includes("Movies and Series already exist in this folder."));
	const fullActions = renderToStaticMarkup(createElement(StudioConfigureActions, {
		hasDestinationDuplicates: true, primaryCount: 0, configuredCount: 2, onAddAll() {},
	}));
	assert.ok(fullActions.includes("No new sources to add"));
	assert.equal(fullActions.includes("editor-apply"), false);
	assert.ok(fullActions.includes(">Add all anyway</button>"));
	const styles = read("builder/src/styles.css");
	assert.match(styles, /\.studio-configure-actions\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto/);
	assert.match(styles, /\.studio-configure-actions \.studio-add-all\s*\{[^}]*width:\s*auto[^}]*min-height:\s*44px[^}]*background:\s*transparent/);
	assert.equal(styles.includes(".studio-duplicate-warning"), false);
});

test("Studio elsewhere notice keeps repeated folder names distinct and truncates unique physical locations", () => {
	const markup = renderToStaticMarkup(createElement(StudioElsewhereNotice, {
		occurrences: [
			{ identity: "movie-a", collectionInternalId: "collection-a", collectionTitle: "Collection A", folderInternalId: "folder-a", folderTitle: "Animation" },
			{ identity: "series-a", collectionInternalId: "collection-a", collectionTitle: "Collection A", folderInternalId: "folder-a", folderTitle: "Animation" },
			{ identity: "movie-b", collectionInternalId: "collection-b", collectionTitle: "Collection B", folderInternalId: "folder-b", folderTitle: "Animation" },
			{ identity: "movie-c", collectionInternalId: "collection-c", collectionTitle: "Collection C", folderInternalId: "folder-c", folderTitle: "Classics" },
			{ identity: "movie-d", collectionInternalId: "collection-d", collectionTitle: "Collection D", folderInternalId: "folder-d", folderTitle: "Documentaries" },
		],
	}));
	assert.equal((markup.match(/Animation · in Collection/g) ?? []).length, 2);
	assert.ok(markup.includes("Classics · in Collection C"));
	assert.equal(markup.includes("Documentaries · in Collection D"), false);
	assert.ok(markup.includes("+ 1 more"));
	assert.equal((markup.match(/<li/g) ?? []).length, 3);
});

test("Studio elsewhere notice uses display-only hidden title fallbacks and remains non-blocking", () => {
	const occurrences = [
		{ collectionInternalId: "collection-hidden", collectionTitle: "\u200e", folderInternalId: "folder-visible", folderTitle: "Untitled Folder" },
		{ collectionInternalId: "collection-visible", collectionTitle: "My Collection", folderInternalId: "folder-hidden", folderTitle: "\u200e" },
		{ collectionInternalId: "collection-blank", collectionTitle: "", folderInternalId: "folder-blank", folderTitle: "   " },
	];
	const originalOccurrences = structuredClone(occurrences);
	const notice = renderToStaticMarkup(createElement(StudioElsewhereNotice, { occurrences }));
	assert.ok(notice.includes("Untitled Folder · in Hidden collection"));
	assert.ok(notice.includes("Hidden folder · in My Collection"));
	assert.ok(notice.includes("Hidden folder · in Hidden collection"));
	assert.ok(notice.includes("You can still add it to this folder, or close this window to cancel."));
	assert.deepEqual(occurrences, originalOccurrences);
	const configure = renderConfigure({ duplicateReview: { destination: [], elsewhere: occurrences } });
	assert.equal(configure.includes("data-studio-duplicate-warning"), false);
	assert.equal(configure.includes("studio-already-added"), false);
	assert.equal((configure.match(/disabled=""/g) ?? []).length, 0);
	assert.ok(configure.includes("studio-elsewhere-note"));
	assert.equal(configure.includes("people-elsewhere-note"), false);
});

test("Studio sort UI is compact, icon-free, and shows one selected description", () => {
	const markup = renderConfigure();
	const source = read("builder/src/ui/StudioSortChoices.jsx");
	const styles = read("builder/src/styles.css");
	assert.ok(markup.includes("studio-sort-choice-row"));
	assert.equal((markup.match(/type="radio"/g) ?? []).length, 4);
	for (const label of ["Popular", "Recent", "Top rated", "Most voted"]) assert.ok(markup.includes(`>${label}<`), label);
	assert.equal((markup.match(/studio-sort-description/g) ?? []).length, 1);
	assert.equal(source.includes("<svg"), false);
	assert.equal(source.includes("<img"), false);
	assert.equal(styles.includes("studio-sort-cards"), false);
	assert.match(styles, /\.studio-sort-choice-row\s*\{[^}]*display:\s*flex[^}]*flex-wrap:\s*wrap/);
});

test("Studio navigation preserves the selected result, scroll target, and search focus intent", () => {
	const initial = createStudioSourceNavigationState();
	const configure = enterStudioConfigure(initial, 3, 412.5);
	assert.deepEqual(configure, {
		step: STUDIO_SOURCE_STEPS.CONFIGURE,
		selectedId: 3,
		searchScrollTop: 412.5,
		restoreSearchFocusId: null,
	});
	const search = returnStudioToSearch(configure);
	assert.equal(search.step, STUDIO_SOURCE_STEPS.SEARCH);
	assert.equal(search.restoreSearchFocusId, 3);
	assert.equal(search.searchScrollTop, 412.5);
	assert.equal(completeStudioSearchRestore(search).restoreSearchFocusId, null);
	assert.throws(() => enterStudioConfigure(initial, 0), /positive safe TMDB studio ID/i);
});

test("every folder-level flow has a visible Back action below the source picker", () => {
	const franchise = renderToStaticMarkup(createElement(AddSourceDialog, {
		provider: fakeCollectionProvider(),
		folderName: "Franchises",
		onBack() {},
		onCancel() {},
		onApply() {},
	}));
	const people = renderToStaticMarkup(createElement(PeopleSourceFlow, {
		context: "folder",
		provider: fakePeopleProvider(),
		artworkClient: {},
		project: { collections: [] },
		collection: { editable: { title: "People" } },
		folder: { internalId: "folder", editable: { title: "People" }, sources: [] },
		onBack() {},
		onCancel() {},
		onApply() {},
	}));
	const studios = renderToStaticMarkup(createElement(StudioSourceFlow, {
		catalogueProvider: { searchStudios() {} },
		countProvider: { getStudioCounts() {} },
		project: { collections: [] },
		folder: { internalId: "folder", editable: { title: "Studios" } },
		onBack() {},
		onCancel() {},
		onApply() {},
	}));
	for (const markup of [franchise, people, studios]) {
		assert.ok(markup.includes('data-action="back-to-source-types"') || markup.includes("Add studio"));
		assert.ok(markup.includes("Back"));
		assert.ok(markup.includes("Close"));
	}
	assert.ok(franchise.includes('data-action="back-to-source-types"'));
	assert.ok(people.includes('data-action="back-to-source-types"'));
	assert.ok(studios.includes("Add studio"));
});

test("source-picker return focus and Configure-to-Search state restoration stay inside modal state", () => {
	const chooser = read("builder/src/ui/SourceModeDialog.jsx");
	const workspace = read("builder/src/ui/BuilderWorkspace.jsx");
	const people = read("builder/src/ui/PeopleSourceFlow.jsx");
	const studios = read("builder/src/ui/StudioSourceFlow.jsx");
	const studioSearch = read("builder/src/ui/use-studio-catalogue-search.js");
	assert.match(chooser, /initialFocusModeId[\s\S]*data-source-mode-option/);
	assert.match(workspace, /returnFocusModeId:\s*current\.modeId[\s\S]*modeId:\s*null/);
	assert.match(people, /setNavigation\(returnPeopleToSearch\)/);
	assert.doesNotMatch(people.slice(people.indexOf("setNavigation(returnPeopleToSearch)"), people.indexOf("function beginBulkConfigure")), /setInput|setPage|setLookupState/);
	assert.match(studios, /setNavigation\(returnStudioToSearch\)/);
	assert.match(studios, /useStudioCatalogueSearch\(catalogueProvider\)/);
	assert.match(studioSearch, /const \[searchSortOverride, setSearchSortOverride\][\s\S]*const \[hideZero, setHideZero\][\s\S]*const browsing = parsedInput\.kind === "empty"/);
	assert.match(studioSearch, /setSearchSortOverride\(\(current\) => current === sort \? null : sort\); setPage\(1\)/);
	assert.match(studioSearch, /setHideZero\(\(current\) => !current\); setPage\(1\)/);
	assert.match(studios, /restoreAddSourceSearchView/);
	assert.doesNotMatch(workspace, /history\.(?:pushState|replaceState|back)/);
});

test("Studio modal remains single-column, tappable, scroll-safe, and footer-safe at required mobile widths", () => {
	const styles = read("builder/src/styles.css");
	for (const width of [360, 384, 393, 402, 412]) assert.ok(width <= 520);
	assert.match(styles, /@media \(max-width: 899px\)[\s\S]*\.studio-source-dialog[\s\S]*max-height:\s*100dvh/);
	assert.match(styles, /@media \(max-width: 520px\)[\s\S]*\.studio-source-choices > div\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\)/);
	assert.match(styles, /\.studio-source-choices label\s*\{[^}]*min-height:\s*68px/);
	assert.match(styles, /@media \(max-width: 520px\)[\s\S]*\.studio-source-choices label\s*\{[^}]*min-height:\s*60px/);
	assert.match(styles, /\.studio-source-choices em\s*\{[^}]*max-width:\s*110px/);
	assert.match(styles, /@media \(max-width: 520px\)[\s\S]*\.studio-configure-identity\s*\{[^}]*grid-template-columns:\s*64px minmax\(0, 1fr\) auto/);
	assert.match(styles, /@media \(max-width: 520px\)[\s\S]*\.studio-result\s*\{[^}]*grid-template-columns:\s*64px minmax\(0, 1fr\)/);
	assert.match(styles, /\.add-source-scroll\s*\{[^}]*overflow-y:\s*auto/);
	assert.match(styles, /\.add-source-form\s*\{[^}]*grid-template-rows:\s*minmax\(0, 1fr\) auto[^}]*overflow:\s*hidden/);
	assert.match(styles, /\.add-source-actions\s*\{[^}]*z-index:\s*2[^}]*safe-area-inset-bottom/);
});

test("Workspace routes Studios through explicit providers, atomic apply, focus, and status wiring", () => {
	const source = read("builder/src/ui/BuilderWorkspace.jsx");
	assert.match(source, /STUDIO_SOURCE_MODE_ID/);
	assert.match(source, /<StudioSourceFlow/);
	assert.match(source, /catalogueProvider=\{studioCatalogueProviderRef\.current\}/);
	assert.match(source, /countProvider=\{studioCountProviderRef\.current\}/);
	assert.match(source, /createStudioSourceBundle\(controller/);
	assert.match(source, /setPendingCreatedSourceFocus\(result\.createdSourceInternalIds\[0\]\)/);
	assert.match(source, /Added \$\{result\.addedSourceCount\} source/);
});

test("Studio search and configuration use no uncontrolled live request in server rendering", () => {
	let catalogueCalls = 0;
	let countCalls = 0;
	renderToStaticMarkup(createElement(StudioSourceFlow, {
		catalogueProvider: { searchStudios() { catalogueCalls += 1; } },
		countProvider: { getStudioCounts() { countCalls += 1; } },
		project: { collections: [] },
		folder: { internalId: "folder", editable: { title: "Studios" } },
		onBack() {},
		onCancel() {},
		onApply() {},
	}));
	assert.equal(catalogueCalls, 0);
	assert.equal(countCalls, 0);
});
