import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createElement } from "../builder/node_modules/react/index.js";
import { renderToStaticMarkup } from "../builder/node_modules/react-dom/server.js";
import { createServer } from "../builder/node_modules/vite/dist/node/index.js";
import { createBuilderController } from "../builder/src/application/index.js";
import { discoverSourceIdentity } from "../builder/src/nuvio/discover.js";
import { NUVIO_INVISIBLE_TITLE } from "../builder/src/nuvio/titles.js";
import {
	applyDecadesHierarchyPlan,
	DECADE_PRESETS,
	inspectCanonicalDecadeSourceNode,
} from "../builder/src/source-add/index.js";
import {
	createSourceEditSession,
	decadeEditSortValue,
	DECADE_SOURCE_EDITOR_ID,
	inspectEditableGenreSource,
	saveSourceEdit,
	sourceEditorFor,
	updateDecadeSourceAdvanced,
	updateDecadeSourceSort,
	updateSourceEditTitle,
} from "../builder/src/source-edit/index.js";
import {
	CREATION_OPTIONS,
	CREATION_OPTION_IDS,
} from "../builder/src/ui/creation-options.js";
import {
	buildDecadesCreationPlan,
	clearAllDecadePresets,
	createDecadesCreationState,
	DECADES_DISPLAY_ORDERS,
	DEFAULT_DECADES_DISPLAY_ORDER_ID,
	decadesGenreConfigurationValid,
	decadesGenreExclusionsForContext,
	decadesGenreSelectionForContext,
	decadesOrdinaryExclusionsForContext,
	DECADES_CREATION_STEPS,
	selectAllDecadePresets,
	setDecadesGenresForContext,
	setDecadesGenreExclusionsForContext,
	setDecadesOrdinaryExclusionsForContext,
	prepareDecadesReview,
	selectedDecadesDisplayOrderId,
	selectedCurrentDecade,
	toggleDecadePreset,
	toggleDecadesGenre,
	updateDecadesDisplayOrder,
	updateDecadesCreationMedia,
} from "../builder/src/ui/decades-creation-state.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vite = await createServer({
	root: path.join(rootDir, "builder"),
	appType: "custom",
	logLevel: "silent",
	server: { middlewareMode: true },
});
const {
	CreationDialog,
	DecadePresetStep,
	DecadesGenreConfigurationSubview,
	DecadesOptionsStep,
	DecadesReviewStep,
} = await vite.ssrLoadModule("/src/ui/CreationDialog.jsx");
const { SourceEditorDialog } = await vite.ssrLoadModule("/src/ui/SourceEditorDialog.jsx");
const { BuilderWorkspace } = await vite.ssrLoadModule("/src/ui/BuilderWorkspace.jsx");
after(() => vite.close());

function countingFactory(prefix) {
	let count = 0;
	return () => `${prefix}-${++count}`;
}

function controller() {
	return createBuilderController({
		idFactory: countingFactory("internal"),
		nuvioIdFactory: countingFactory("nuvio"),
	});
}

function canonicalSource(overrides = {}) {
	return {
		title: "1980s Movies",
		provider: "tmdb",
		tmdbSourceType: "DISCOVER",
		tmdbId: null,
		mediaType: "MOVIE",
		sortBy: "popularity.desc",
		filters: { releaseDateGte: "1980-01-01", releaseDateLte: "1989-12-31" },
		...overrides,
	};
}

function addSource(current, editable = canonicalSource()) {
	const collection = current.createCollection({ editable: { title: "Collection" } });
	const folder = current.createFolder(collection.createdInternalId, { editable: { title: "Folder" } });
	const source = current.createSource(folder.createdInternalId, { category: "native-tmdb", editable });
	return { collection, folder, source };
}

test("the shared creation registry keeps Blank first and leaves a stable future-option seam", () => {
	assert.deepEqual(CREATION_OPTIONS.map((option) => option.id), [
		CREATION_OPTION_IDS.BLANK,
		CREATION_OPTION_IDS.DECADES,
		CREATION_OPTION_IDS.PEOPLE,
		CREATION_OPTION_IDS.FRANCHISES,
		CREATION_OPTION_IDS.STUDIOS,
		CREATION_OPTION_IDS.NETWORKS,
		CREATION_OPTION_IDS.GENRES,
	]);
	assert.equal(Object.isFrozen(CREATION_OPTIONS), true);
	assert.equal(CREATION_OPTIONS[0].label, "Blank");
	assert.deepEqual(CREATION_OPTIONS.map((option) => option.icon), ["blank", "decades", "people", "franchises", "studios", "networks", "genres"]);
	assert.equal(CREATION_OPTIONS[0].supportingText, "Start manually");
	assert.equal(CREATION_OPTIONS.slice(1).every((option) => option.supportingText === undefined), true);
	assert.equal(CREATION_OPTIONS.every((option) => option.description === undefined), true);
});

test("Decade selection is multi-select, catalogue ordered, and the visible flow uses the approved composition defaults", () => {
	let state = createDecadesCreationState({ scope: "new-collection", currentYear: 2026 });
	state = toggleDecadePreset(state, "2020s");
	state = toggleDecadePreset(state, "1980s");
	assert.deepEqual(state.selectedDecadeIds, ["1980s", "2020s"]);
	assert.equal(selectedCurrentDecade(state).id, "2020s");
	assert.deepEqual(state.content, { wholeDecade: false, individualYears: true, genreBreakdown: false });
	assert.equal(state.mediaMode, "both");
	assert.equal(state.layout, "separate-media-collections");
	assert.equal(state.decadeOrder, "newest-first");
	assert.equal(state.yearOrder, "oldest-first");
	assert.equal(selectedDecadesDisplayOrderId(state), DEFAULT_DECADES_DISPLAY_ORDER_ID);
	assert.equal(state.sortOptionId, "popular");
	assert.equal(state.viewMode, "TABBED_GRID");
	assert.equal(state.currentYearMode, "full-decade");
	assert.equal(state.showAllTab, true);
	assert.equal(state.pinToTop, false);
	assert.equal(state.hideCollectionTitle, false);
	assert.equal(state.folderTileShape, "POSTER");
	assert.equal(state.folderTitleVisibility, "SHOW_EVERYWHERE");
});

test("the #113 adapter expands 2020s individual years through 2029 while lower-level modes remain separate", () => {
	const current = controller();
	let state = toggleDecadePreset(createDecadesCreationState({ scope: "new-collection", currentYear: 2026 }), "2020s");
	state = {
		...state,
		mediaMode: "movies",
		content: { wholeDecade: true, individualYears: true, genreBreakdown: false },
		currentYearMode: "current-year-only",
		decadeOrder: "oldest-first",
		yearOrder: "oldest-first",
	};
	const result = buildDecadesCreationPlan(current.getState().project, current.getState().revision, state);
	assert.equal(result.ok, true);
	assert.equal(result.plan.configuration.source.currentYearMode, "full-decade");
	assert.equal(result.plan.counts.sourceCount, 11);
	const sources = result.plan.collections[0].folders[0].sources;
	assert.deepEqual(sources.map((entry) => entry.draft.editable.title), ["All 2020s", ...Array.from({ length: 10 }, (_, index) => String(2020 + index))]);
	assert.deepEqual(sources[0].draft.editable.filters, { releaseDateGte: "2020-01-01", releaseDateLte: "2029-12-31" });
	assert.deepEqual(sources.at(-1).draft.editable.filters, { releaseDateGte: "2029-01-01", releaseDateLte: "2029-12-31" });
});

test("the three Display order presets map exactly without changing counts, identities, or applied order", () => {
	let base = createDecadesCreationState({ scope: "new-collection", currentYear: 2026 });
	base = toggleDecadePreset(toggleDecadePreset(base, "1950s-and-earlier"), "2000s");
	base = updateDecadesCreationMedia(base, "movies");
	base = { ...base, content: { wholeDecade: true, individualYears: true, genreBreakdown: false } };
	assert.deepEqual(DECADES_DISPLAY_ORDERS.map(({ id, decadeOrder, yearOrder }) => ({ id, decadeOrder, yearOrder })), [
		{ id: "newest-decades-oldest-years", decadeOrder: "newest-first", yearOrder: "oldest-first" },
		{ id: "newest-throughout", decadeOrder: "newest-first", yearOrder: "newest-first" },
		{ id: "oldest-throughout", decadeOrder: "oldest-first", yearOrder: "oldest-first" },
	]);

	const expected = {
		"newest-decades-oldest-years": {
			folders: ["2000s", "1950s-and-earlier"],
			years2000: ["All 2000s", "2000", "2001", "2002", "2003", "2004", "2005", "2006", "2007", "2008", "2009"],
			years1950: ["All 1950s & Earlier", "Before 1950", "1950", "1951", "1952", "1953", "1954", "1955", "1956", "1957", "1958", "1959"],
		},
		"newest-throughout": {
			folders: ["2000s", "1950s-and-earlier"],
			years2000: ["All 2000s", "2009", "2008", "2007", "2006", "2005", "2004", "2003", "2002", "2001", "2000"],
			years1950: ["All 1950s & Earlier", "1959", "1958", "1957", "1956", "1955", "1954", "1953", "1952", "1951", "1950", "Before 1950"],
		},
		"oldest-throughout": {
			folders: ["1950s-and-earlier", "2000s"],
			years2000: ["All 2000s", "2000", "2001", "2002", "2003", "2004", "2005", "2006", "2007", "2008", "2009"],
			years1950: ["All 1950s & Earlier", "Before 1950", "1950", "1951", "1952", "1953", "1954", "1955", "1956", "1957", "1958", "1959"],
		},
	};
	const plans = new Map();
	const identities = (plan) => plan.collections[0].folders.flatMap((folder) => folder.sources.map((entry) => discoverSourceIdentity(entry.draft.editable).key)).sort();
	for (const option of DECADES_DISPLAY_ORDERS) {
		const state = updateDecadesDisplayOrder(base, option.id);
		assert.equal(selectedDecadesDisplayOrderId(state), option.id);
		const current = controller();
		const result = buildDecadesCreationPlan(current.getState().project, current.getState().revision, state);
		assert.equal(result.ok, true);
		assert.deepEqual(result.plan.configuration.source, {
			...result.plan.configuration.source,
			decadeOrder: option.decadeOrder,
			yearOrder: option.yearOrder,
		});
		assert.deepEqual(result.plan.collections[0].folders.map((folder) => folder.decadeId), expected[option.id].folders);
		const folders = Object.fromEntries(result.plan.collections[0].folders.map((folder) => [folder.decadeId, folder]));
		assert.deepEqual(folders["2000s"].sources.map((entry) => entry.draft.editable.title), expected[option.id].years2000);
		assert.deepEqual(folders["1950s-and-earlier"].sources.map((entry) => entry.draft.editable.title), expected[option.id].years1950);
		assert.equal(applyDecadesHierarchyPlan(current, result.plan).ok, true);
		assert.deepEqual(current.getState().project.collections[0].folders.map((folder) => folder.editable.title), expected[option.id].folders.map((id) => id === "1950s-and-earlier" ? "1950s & Earlier" : "2000s"));
		assert.deepEqual(current.getState().project.collections[0].folders.map((folder) => folder.sources.map((source) => source.editable.title)), result.plan.collections[0].folders.map((folder) => folder.sources.map((source) => source.draft.editable.title)));
		plans.set(option.id, result.plan);
	}
	const baseline = plans.get(DEFAULT_DECADES_DISPLAY_ORDER_ID);
	for (const plan of plans.values()) {
		assert.deepEqual(plan.counts, baseline.counts);
		assert.deepEqual(identities(plan), identities(baseline));
	}
});

test("Display order and mixed-media Source grouping compose independently across all three presets", () => {
	let base = createDecadesCreationState({ scope: "new-collection", currentYear: 2026 });
	base = toggleDecadePreset(toggleDecadePreset(base, "1950s-and-earlier"), "2000s");
	base = {
		...base,
		layout: "mixed-collection",
		content: { wholeDecade: true, individualYears: true, genreBreakdown: false },
	};
	const planFor = (state) => {
		const current = controller();
		const result = buildDecadesCreationPlan(current.getState().project, current.getState().revision, state);
		assert.equal(result.ok, true);
		return { current, plan: result.plan };
	};
	const defaultPaired = planFor({ ...updateDecadesDisplayOrder(base, "newest-decades-oldest-years"), sourceGrouping: "paired" });
	assert.equal(defaultPaired.plan.configuration.source.decadeOrder, "newest-first");
	assert.equal(defaultPaired.plan.configuration.source.yearOrder, "oldest-first");
	assert.equal(defaultPaired.plan.configuration.source.sourceGrouping, "paired");
	assert.deepEqual(defaultPaired.plan.collections[0].folders.map((folder) => folder.decadeId), ["2000s", "1950s-and-earlier"]);
	assert.deepEqual(defaultPaired.plan.collections[0].folders[0].sources.slice(0, 6).map((entry) => entry.draft.editable.title), [
		"All 2000s Movies", "All 2000s Series", "2000 Movies", "2000 Series", "2001 Movies", "2001 Series",
	]);

	const newestPaired = planFor({ ...updateDecadesDisplayOrder(base, "newest-throughout"), sourceGrouping: "paired" });
	assert.deepEqual(newestPaired.plan.collections[0].folders[0].sources.slice(0, 6).map((entry) => entry.draft.editable.title), [
		"All 2000s Movies", "All 2000s Series", "2009 Movies", "2009 Series", "2008 Movies", "2008 Series",
	]);
	const oldestPaired = planFor({ ...updateDecadesDisplayOrder(base, "oldest-throughout"), sourceGrouping: "paired" });
	assert.deepEqual(oldestPaired.plan.collections[0].folders.map((folder) => folder.decadeId), ["1950s-and-earlier", "2000s"]);
	assert.deepEqual(oldestPaired.plan.collections[0].folders[1].sources.slice(0, 6).map((entry) => entry.draft.editable.title), [
		"All 2000s Movies", "All 2000s Series", "2000 Movies", "2000 Series", "2001 Movies", "2001 Series",
	]);

	const newestMoviesFirst = planFor({ ...updateDecadesDisplayOrder(base, "newest-throughout"), sourceGrouping: "movies-first" });
	const oldestMoviesFirst = planFor({ ...updateDecadesDisplayOrder(base, "oldest-throughout"), sourceGrouping: "movies-first" });
	assert.deepEqual(newestMoviesFirst.plan.collections[0].folders[0].sources.slice(0, 3).map((entry) => entry.draft.editable.title), ["All 2000s Movies", "2009 Movies", "2008 Movies"]);
	assert.deepEqual(oldestMoviesFirst.plan.collections[0].folders[1].sources.slice(0, 3).map((entry) => entry.draft.editable.title), ["All 2000s Movies", "2000 Movies", "2001 Movies"]);
	const identities = (plan) => plan.collections[0].folders.flatMap((folder) => folder.sources.map((entry) => discoverSourceIdentity(entry.draft.editable).key)).sort();
	for (const candidate of [newestPaired.plan, oldestPaired.plan, newestMoviesFirst.plan, oldestMoviesFirst.plan]) {
		assert.deepEqual(candidate.counts, defaultPaired.plan.counts);
		assert.deepEqual(identities(candidate), identities(defaultPaired.plan));
	}
	assert.equal(applyDecadesHierarchyPlan(defaultPaired.current, defaultPaired.plan).ok, true);
	assert.deepEqual(defaultPaired.current.getState().project.collections[0].folders[0].sources.slice(0, 4).map((source) => source.editable.title), ["All 2000s Movies", "All 2000s Series", "2000 Movies", "2000 Series"]);
	assert.equal(applyDecadesHierarchyPlan(oldestMoviesFirst.current, oldestMoviesFirst.plan).ok, true);
	assert.deepEqual(oldestMoviesFirst.current.getState().project.collections[0].folders.map((folder) => folder.editable.title), ["1950s & Earlier", "2000s"]);
});

test("preset Select all and Clear all derive from the live catalogue", () => {
	let state = createDecadesCreationState({ scope: "new-collection", currentYear: 2026 });
	state = selectAllDecadePresets(state);
	assert.deepEqual(state.selectedDecadeIds, DECADE_PRESETS.map((preset) => preset.id));
	assert.equal(Object.keys(state.genreNamesByDecade).length, DECADE_PRESETS.length);
	state = clearAllDecadePresets(state);
	assert.deepEqual(state.selectedDecadeIds, []);
	assert.deepEqual(state.genreNamesByDecade, {});
});

test("shared and per-Decade Genre contexts preserve independent ordered selections", () => {
	let state = createDecadesCreationState({ scope: "new-collection", currentYear: 2026 });
	state = toggleDecadePreset(toggleDecadePreset(state, "1980s"), "1990s");
	state = updateDecadesCreationMedia(state, "both");
	state = { ...state, content: { wholeDecade: false, individualYears: false, genreBreakdown: true } };
	assert.equal(decadesGenreConfigurationValid(state), false);
	state = toggleDecadesGenre(state, "Action", "all");
	state = toggleDecadesGenre(state, "Horror", "1980s");
	assert.deepEqual(state.genreNamesByDecade, { "1980s": ["Action", "Horror"], "1990s": ["Action"] });
	assert.deepEqual(decadesGenreSelectionForContext(state, "all"), ["Action"]);
	assert.deepEqual(decadesGenreSelectionForContext(state, "1980s"), ["Action", "Horror"]);
	assert.equal(decadesGenreConfigurationValid(state), true);
	state = toggleDecadesGenre(state, "Action", "all");
	assert.deepEqual(state.genreNamesByDecade, { "1980s": ["Horror"], "1990s": [] });
	state = setDecadesGenresForContext(state, ["Comedy"], "1990s");
	assert.deepEqual(state.genreNamesByDecade, { "1980s": ["Horror"], "1990s": ["Comedy"] });
	state = updateDecadesCreationMedia(toggleDecadesGenre(toggleDecadesGenre(state, "Music", "all"), "News", "all"), "movies");
	assert.equal(state.genreNamesByDecade["1980s"].includes("News"), false);
	assert.equal(state.genreNamesByDecade["1980s"].includes("Music"), true);
});

test("shared and individual Decade exclusions remain independent and removing a Decade clears only its keyed state", () => {
	let state = createDecadesCreationState({ scope: "new-collection", currentYear: 2026 });
	state = toggleDecadePreset(toggleDecadePreset(state, "1980s"), "1990s");
	state = { ...state, content: { wholeDecade: false, individualYears: true, genreBreakdown: true } };
	state = toggleDecadesGenre(state, "Action", "all");
	state = toggleDecadesGenre(state, "Horror", "1980s");
	state = setDecadesOrdinaryExclusionsForContext(state, ["Comedy"], "all");
	state = setDecadesOrdinaryExclusionsForContext(state, ["Comedy", "Horror"], "1980s");
	state = setDecadesGenreExclusionsForContext(state, { Action: ["Comedy"] }, "all");
	state = setDecadesGenreExclusionsForContext(state, { Action: ["Horror"], Horror: ["Comedy"] }, "1980s");

	assert.deepEqual(decadesOrdinaryExclusionsForContext(state, "all"), ["Comedy"]);
	assert.deepEqual(decadesOrdinaryExclusionsForContext(state, "1980s"), ["Comedy", "Horror"]);
	assert.deepEqual(decadesGenreExclusionsForContext(state, "1990s"), { Action: ["Comedy"] });
	state = { ...state, genreContextId: "1980s" };
	state = toggleDecadePreset(state, "1980s");
	assert.deepEqual(state.selectedDecadeIds, ["1990s"]);
	assert.deepEqual(Object.keys(state.genreNamesByDecade), ["1990s"]);
	assert.deepEqual(Object.keys(state.advanced.ordinaryExcludedGenresByDecade), ["1990s"]);
	assert.deepEqual(Object.keys(state.advanced.exclusionsByGenreByDecade), ["1990s"]);
	assert.equal(state.genreContextId, "all");
	assert.deepEqual(decadesOrdinaryExclusionsForContext(state, "1990s"), ["Comedy"]);

	state = toggleDecadePreset(state, "1980s");
	assert.deepEqual(state.genreNamesByDecade["1980s"], ["Action"]);
	assert.deepEqual(decadesOrdinaryExclusionsForContext(state, "1980s"), ["Comedy"]);
	assert.deepEqual(decadesGenreExclusionsForContext(state, "1980s"), { Action: ["Comedy"] });
});

test("creation state prunes incompatible Genres and produces the concrete #112 mixed-collection plan", () => {
	const current = controller();
	let state = createDecadesCreationState({ scope: "new-collection", currentYear: 2026 });
	state = toggleDecadePreset(toggleDecadePreset(state, "1980s"), "2020s");
	state = updateDecadesCreationMedia(state, "both");
	state = { ...state, layout: "mixed-collection", content: { wholeDecade: true, individualYears: true, genreBreakdown: true } };
	state = toggleDecadesGenre(state, "Action");
	state = toggleDecadesGenre(state, "Comedy");
	state = prepareDecadesReview(state);
	const result = buildDecadesCreationPlan(current.getState().project, current.getState().revision, state);
	assert.equal(result.ok, true);
	assert.deepEqual(result.plan.counts, { collectionCount: 1, folderCount: 2, sourceCount: 50 });
	assert.equal(result.plan.collections[0].editable.title, "Decades");
	assert.equal(result.plan.collections[0].editable.viewMode, "TABBED_GRID");
	assert.deepEqual(result.plan.collections[0].folders.map((folder) => folder.editable.title), ["2020s", "1980s"]);
	assert.equal(state.step, DECADES_CREATION_STEPS.REVIEW);
});

test("changing media after Review clears hidden collection-name proposals", () => {
	const current = controller();
	let state = createDecadesCreationState({ scope: "new-collection", currentYear: 2026 });
	state = toggleDecadePreset(state, "1980s");
	state = prepareDecadesReview(state);
	state = Object.freeze({
		...state,
		collectionTitles: Object.freeze({ movies: "My Movie Decades" }),
	});
	state = updateDecadesCreationMedia(state, "series");
	assert.deepEqual(state.collectionTitles, {});
	const result = buildDecadesCreationPlan(current.getState().project, current.getState().revision, state);
	assert.equal(result.ok, true);
	assert.equal(result.plan.collections[0].editable.title, "TV Decades");
});

test("launcher renders compact semantic mode controls before the unchanged Decades flow", () => {
	const current = controller();
	const launcherProps = {
		project: current.getState().project,
		projectRevision: current.getState().revision,
		currentYear: 2026,
		onCancel() {},
		onCreateBlank() {},
		onApplyDecades() {},
	};
	const launcher = renderToStaticMarkup(createElement(CreationDialog, { ...launcherProps, scope: "new-collection" }));
	assert.ok(launcher.includes("What collection would you like to create?"));
	assert.equal(launcher.includes("What would you like to create?"), false);
	assert.ok(launcher.includes("Choose Blank or a guided starting point."));
	assert.equal(launcher.includes("New Collection"), false);
	assert.ok(launcher.includes("Start manually"));
	for (const option of CREATION_OPTIONS) assert.ok(launcher.includes(`<strong>${option.label}</strong>`), option.label);
	for (const disallowed of [
		"Start from scratch and build it yourself.",
		"Create movie and series collections organised by decade.",
		"Create one configured folder for each selected person.",
		"Create one folder and native movie source for each TMDB collection.",
		"Create one configured folder for each selected Studio.",
		"Create one Series folder for each selected TV Network.",
		"Create one configured folder for each selected official Genre.",
		"TMDB Discover",
		"reviewed plan",
		"atomically",
	]) assert.equal(launcher.includes(disallowed), false, disallowed);
	assert.deepEqual([...launcher.matchAll(/data-creation-option="([^"]+)"/g)].map((match) => match[1]), CREATION_OPTIONS.map((option) => option.id));
	assert.equal((launcher.match(/<button[^>]+class="creation-option-card"[^>]+type="button"/g) ?? []).length, CREATION_OPTIONS.length);
	assert.equal((launcher.match(/class="creation-option-icon-shell" aria-hidden="true"/g) ?? []).length, CREATION_OPTIONS.length);
	assert.equal((launcher.match(/class="creation-option-icon" viewBox="0 0 24 24" focusable="false"/g) ?? []).length, CREATION_OPTIONS.length);
	assert.equal(launcher.includes("creation-option-arrow"), false);
	assert.equal(launcher.includes("→"), false);
	assert.equal(launcher.includes("autofocus"), false);
	assert.equal(launcher.includes('data-action="back-to-creation-launcher"'), false);
	assert.equal(launcher.includes("decades-creation-actions"), false);

	const folderLauncher = renderToStaticMarkup(createElement(CreationDialog, { ...launcherProps, scope: "new-folder", destinationCollectionTitle: "Destination" }));
	assert.ok(folderLauncher.includes("What folder would you like to create?"));
	assert.ok(folderLauncher.includes("Choose Blank or a guided starting point."));
	assert.equal(folderLauncher.includes("New Folder"), false);
	assert.equal(folderLauncher.includes("New Folder · Destination"), false);
	assert.deepEqual([...folderLauncher.matchAll(/data-creation-option="([^"]+)"/g)].map((match) => match[1]), CREATION_OPTIONS.map((option) => option.id));
	assert.equal((folderLauncher.match(/<button[^>]+class="creation-option-card"[^>]+type="button"/g) ?? []).length, CREATION_OPTIONS.length);

	const firstStage = renderToStaticMarkup(createElement(CreationDialog, {
		...launcherProps,
		scope: "new-collection",
		initialOptionId: CREATION_OPTION_IDS.DECADES,
	}));
	assert.ok(firstStage.includes('data-action="back-to-creation-launcher"'));
	assert.ok(firstStage.includes('data-decades-stage="presets"'));
	const footerMarkup = firstStage.match(/<footer class="add-source-actions decades-creation-actions">([\s\S]*?)<\/footer>/)?.[1] ?? "";
	assert.ok(footerMarkup.includes("Continue"));
	assert.equal(footerMarkup.includes("Back"), false);

	const state = toggleDecadePreset(createDecadesCreationState({ scope: "new-collection", currentYear: 2026 }), "2020s");
	const presets = renderToStaticMarkup(createElement(DecadePresetStep, { state, onToggle() {}, onSelectAll() {}, onClearAll() {} }));
	for (const label of ["1950s &amp; Earlier", "1960s", "1980s", "2020s"]) assert.ok(presets.includes(label));
	assert.ok(presets.includes('data-decade-preset="2020s" data-selected="true"'));
	assert.ok(presets.includes(`1 of ${DECADE_PRESETS.length} selected`));
	assert.ok(presets.includes("Select all"));
	assert.ok(presets.includes("Clear all"));
});

test("both hierarchy entry points share the launcher lock and Blank delegates to the existing draft helpers", () => {
	const current = controller();
	const collection = current.createCollection({ editable: { title: "Destination" } });
	current.selectNode(collection.createdInternalId);
	const state = current.getState();
	const markup = renderToStaticMarkup(createElement(BuilderWorkspace, {
		controller: current,
		state,
		initialCreationSession: {
			scope: "new-folder",
			openingProject: state.project,
			projectRevision: state.revision,
			currentYear: 2026,
			destinationCollectionInternalId: collection.createdInternalId,
			destinationCollectionTitle: "Destination",
		},
	}));
	assert.match(markup, /data-creation-open="true"/);
	assert.match(markup, /class="workspace-underlay"[^>]+inert=""/);
	assert.ok(markup.includes("What folder would you like to create?"));
	assert.ok(markup.includes("Choose Blank or a guided starting point."));
	assert.equal(markup.includes("New Folder · Destination"), false);
	const workspaceSource = fs.readFileSync(path.join(rootDir, "builder", "src", "ui", "BuilderWorkspace.jsx"), "utf8");
	assert.match(workspaceSource, /creationSession\.scope === "new-collection"[\s\S]*createDraftCollection\(controller, \{ selectCreated: desktopViewport \}\)[\s\S]*createDraftFolder\(/);
	assert.match(workspaceSource, /destinationCollectionTitle: view\.selectedCollection\.title/);
	assert.doesNotMatch(workspaceSource, /destinationCollectionTitle: view\.selectedCollection\.editable\.title/);
	assert.match(workspaceSource, /currentYear: new Date\(\)\.getFullYear\(\)/);
});

test("Options keeps selected Decades editable and keeps the Genre catalogue in its reusable subflow", () => {
	let state = createDecadesCreationState({ scope: "new-collection", currentYear: 2026 });
	state = toggleDecadePreset(toggleDecadePreset(state, "1980s"), "1990s");
	state = updateDecadesCreationMedia(state, "both");
	state = { ...state, step: DECADES_CREATION_STEPS.OPTIONS, content: { wholeDecade: false, individualYears: false, genreBreakdown: true } };
	const invalid = renderToStaticMarkup(createElement(DecadesOptionsStep, { state, onStateChange() {}, onRemoveDecade() {}, onOpenSecondary() {} }));
	assert.ok(invalid.includes("Selected Decades"));
	assert.ok(invalid.includes("Remove 1980s"));
	assert.ok(invalid.includes("Remove 1990s"));
	assert.ok(invalid.includes("Configured for 0 of 2 Decades"));
	assert.ok(invalid.includes("Choose at least one Genre for every selected Decade before continuing."));
	assert.equal(invalid.includes("genre-catalogue-list"), false);
	assert.ok(invalid.includes(">Configure</button>"));

	state = toggleDecadesGenre(state, "Action", "all");
	const valid = renderToStaticMarkup(createElement(DecadesOptionsStep, { state, onStateChange() {}, onRemoveDecade() {}, onOpenSecondary() {} }));
	assert.equal(valid.includes("Choose at least one Genre for every selected Decade before continuing."), false);
	assert.ok(valid.includes("1 selected on all Decades"));

	const genreSurface = renderToStaticMarkup(createElement(DecadesGenreConfigurationSubview, { state, onStateChange() {}, onOpenExclusions() {}, onDone() {} }));
	assert.ok(genreSurface.includes("genre-context-catalogue-subview"));
	assert.ok(genreSurface.includes("genre-context-pane"));
	assert.ok(genreSurface.includes("genre-context-choice-pane"));
	assert.ok(genreSurface.includes("All selected Decades"));
	assert.ok(genreSurface.includes("1980s"));
	assert.ok(genreSurface.includes("1990s"));
	assert.equal(genreSurface.includes("decades-genre-contexts"), false);
	assert.equal((genreSurface.match(/class="genre-catalogue-list"/g) ?? []).length, 1);
	assert.ok(genreSurface.includes("Genre source exclusions"));
	assert.ok(genreSurface.includes("Optionally exclude Genres from the Genre sources selected above."));
	assert.equal(genreSurface.includes("Choose Genres in this context first"), false);
	assert.equal(genreSurface.includes("No exclusions configured"), false);

	const largeState = selectAllDecadePresets(state);
	const large = renderToStaticMarkup(createElement(DecadesOptionsStep, { state: largeState, onStateChange() {}, onRemoveDecade() {} }));
	assert.ok(large.includes("removable-selection-disclosure"));
	assert.ok(large.includes(`View selected Decades · ${DECADE_PRESETS.length}`));
	assert.ok(large.includes('aria-label="Remove 1950s &amp; Earlier"'));
});

test("structure, ordering, and shared presentation choices render schematic previews only when applicable", () => {
	const simpleState = toggleDecadePreset(createDecadesCreationState({ scope: "new-collection", currentYear: 2026 }), "1980s");
	const simpleMarkup = renderToStaticMarkup(createElement(DecadesOptionsStep, { state: simpleState, onStateChange() {} }));
	assert.equal(simpleMarkup.includes('data-decades-settings="ordering"'), false);
	assert.ok(simpleMarkup.includes('name="decades-display-order"'));
	assert.equal(simpleMarkup.includes('name="decades-folder-order"'), false);
	assert.equal(simpleMarkup.includes('name="decades-year-order"'), false);
	assert.equal(simpleMarkup.includes('name="decades-source-grouping"'), false);

	const oneDecadeWithoutYears = {
		...simpleState,
		content: { wholeDecade: true, individualYears: false, genreBreakdown: false },
	};
	const oneDecadeWithoutYearsMarkup = renderToStaticMarkup(createElement(DecadesOptionsStep, { state: oneDecadeWithoutYears, onStateChange() {} }));
	assert.equal(oneDecadeWithoutYearsMarkup.includes("Ordering"), false);

	let state = createDecadesCreationState({ scope: "new-collection", currentYear: 2026 });
	state = toggleDecadePreset(toggleDecadePreset(state, "1980s"), "2000s");
	state = updateDecadesCreationMedia(state, "both");
	state = { ...state, layout: "mixed-collection", content: { wholeDecade: true, individualYears: true, genreBreakdown: false } };
	const markup = renderToStaticMarkup(createElement(DecadesOptionsStep, { state, onStateChange() {} }));
	for (const marker of ['data-structure-preview="separate"', 'data-structure-preview="mixed"', "Movie Decades", "TV Decades", "Display order", "Source grouping", "Folders", "Inside"]) assert.ok(markup.includes(marker), marker);
	for (const label of ["Newest Decades, Oldest Years", "Newest throughout", "Oldest throughout"]) assert.ok(markup.includes(`>${label}<`), label);
	assert.equal((markup.match(/name="decades-display-order"/g) ?? []).length, 3);
	assert.match(markup, /name="decades-display-order" checked="" value="newest-decades-oldest-years"/);
	assert.equal(markup.includes("Oldest Decades, Newest Years"), false);
	for (const absent of ['data-layout-preview="tabs"', 'data-layout-preview="rows"', "Collection options", "Decade folder options"]) assert.equal(markup.includes(absent), false, absent);
	for (const redundant of ["Decade folder order", "Individual year order", 'name="decades-folder-order"', 'name="decades-year-order"']) assert.equal(markup.includes(redundant), false, redundant);
	assert.ok(markup.indexOf("Movie Decades") < markup.indexOf("TV Decades"));
	assert.match(markup, /data-structure-preview="separate"[\s\S]*Movie Decades[\s\S]*TV Decades/);
	assert.ok(markup.includes("Controls how Movie and Series sources are arranged inside mixed-media Decade folders."));

	const folderState = updateDecadesCreationMedia(toggleDecadePreset(createDecadesCreationState({ scope: "new-folder", currentYear: 2026, destinationCollectionInternalId: "destination" }), "1980s"), "both");
	const folderMarkup = renderToStaticMarkup(createElement(DecadesOptionsStep, { state: folderState, onStateChange() {} }));
	assert.ok(folderMarkup.includes("Existing collection"));
	assert.ok(folderMarkup.includes('name="decades-source-grouping"'));
	assert.equal(folderMarkup.includes('data-decades-inherited-presentation="true"'), false);
	assert.equal(folderMarkup.includes("Collection options"), false);
	assert.equal(folderMarkup.includes("Decade folder options"), false);

	const nodeEditorSource = fs.readFileSync(path.join(rootDir, "builder", "src", "ui", "NodeEditor.jsx"), "utf8");
	const presentationSource = fs.readFileSync(path.join(rootDir, "builder", "src", "ui", "PresentationControls.jsx"), "utf8");
	const creationSource = fs.readFileSync(path.join(rootDir, "builder", "src", "ui", "CreationDialog.jsx"), "utf8");
	assert.match(nodeEditorSource, /CollectionPresentationChoices/);
	assert.match(creationSource, /HierarchyCollectionPresentationControls/);
	for (const shared of ["FolderShapeChoices", "FolderTitleVisibilityChoices", "PresentationSwitch"]) {
		assert.ok(nodeEditorSource.includes(shared));
		assert.ok(presentationSource.includes(`export function ${shared}`));
	}
	for (const directShared of ["FolderShapeChoices", "PresentationSwitch"]) assert.ok(creationSource.includes(directShared));
	assert.ok(creationSource.includes("TitleOptions"));
	assert.ok(presentationSource.includes("export function TitleOptions"));
});

test("Step 2 owns content configuration while Step 3 owns names, presentation, and folder details", () => {
	const current = controller();
	let collectionState = createDecadesCreationState({ scope: "new-collection", currentYear: 2026 });
	collectionState = toggleDecadePreset(collectionState, "2020s");
	collectionState = updateDecadesCreationMedia(collectionState, "both");
	collectionState = { ...collectionState, step: DECADES_CREATION_STEPS.OPTIONS };
	const options = renderToStaticMarkup(createElement(DecadesOptionsStep, { state: collectionState, onStateChange() {} }));
	for (const text of ["Configure Decades", "Media", "Sort titles by", "Collection structure", "Decade overview", "Individual years", "Genre breakdown", "Ordering", "Display order", "Advanced options"]) assert.ok(options.includes(text), text);
	assert.ok(options.includes("Add one source covering the complete Decade, such as All 2000s."));
	assert.ok(options.includes("Add Genre sources to all selected Decades, or customise each Decade."));
	assert.equal(options.includes("Future-year sources may remain empty"), false);
	assert.equal(options.includes("popular Genre"), false);
	assert.equal((options.match(/class="studio-sort-choices semantic-sort-choices"/g) ?? []).length, 2);
	for (const label of ["Movies", "Series", "Both", "Popular", "Recent", "Top Rated", "Most Votes"]) assert.ok(options.includes(`>${label}<`), label);
	assert.match(options, /type="checkbox" disabled="" checked=""/);
	for (const obsolete of ["All years combined", "Whole decade", "Through current year", "Current year only", "Full decade", "Collection appearance", "Decade folder appearance", "Collection options", "Decade folder options", "Source sorting and filters"]) assert.equal(options.includes(obsolete), false, obsolete);
	assert.ok(options.indexOf('name="decades-media"') < options.indexOf('name="decades-sort"'));
	assert.match(options, /name="decades-media" checked="" value="both"/);
	assert.ok(options.indexOf('name="decades-sort"') < options.indexOf("Collection structure"));
	assert.match(options, /<details class="genre-advanced-options decades-advanced-options" data-decades-advanced="true">/);
	assert.equal(options.includes('data-decades-advanced="true" open'), false);
	const advancedMarkup = options.match(/<details class="genre-advanced-options decades-advanced-options"[\s\S]*?<\/details>/)?.[0] ?? "";
	assert.equal(advancedMarkup.includes("Sort titles by"), false);

	collectionState = prepareDecadesReview(collectionState);
	const planResult = buildDecadesCreationPlan(current.getState().project, current.getState().revision, collectionState);
	const review = renderToStaticMarkup(createElement(DecadesReviewStep, { state: collectionState, planResult, onCollectionTitleChange() {} }));
	assert.ok(review.includes("Plan totals"));
	assert.ok(review.includes("Review &amp; Appearance"));
	assert.ok(review.includes("2</strong><span>Collections"));
	assert.ok(review.includes("2</strong><span>Folders"));
	assert.ok(review.includes("20</strong><span>Sources"));
	assert.ok(review.includes('id="decades-collection-movies"'));
	assert.ok(review.includes('id="decades-collection-series"'));
	assert.ok(review.includes("Title options"));
	assert.ok(review.includes("Hide collection title in Nuvio"));
	assert.ok(review.includes("Folder title visibility"));
	assert.equal(review.includes("Decade folder titles"), false);
	for (const label of ["Show everywhere", "Hide on home screen only", "Hide everywhere"]) assert.ok(review.includes(label), label);
	assert.ok(review.includes('data-decades-settings="layout"'));
	assert.ok(review.includes('data-decades-settings="folder-options"'));
	for (const label of ["Title options", "Layout", "Folder options", "View folder details"]) assert.ok(review.includes(label), label);
	assert.ok(review.indexOf("Title options") < review.indexOf("Layout"));
	assert.ok(review.indexOf("Layout") < review.indexOf("Folder options"));
	assert.ok(review.indexOf("Folder options") < review.indexOf("View folder details"));
	assert.equal(review.includes("Decade folder options"), false);
	const collectionOptions = review.match(/<section class="review-layout-options"[^>]*data-decades-settings="layout"[\s\S]*?<\/section>/)?.[0] ?? "";
	const folderOptions = review.match(/<details class="decades-settings-disclosure" data-decades-settings="folder-options">[\s\S]*?<\/details>/)?.[0] ?? "";
	assert.ok(collectionOptions.includes("How sources appear in each collection"));
	assert.equal(collectionOptions.includes("hideNuvioTitle"), false);
	assert.equal(collectionOptions.includes("Hide collection title"), false);
	assert.equal(folderOptions.includes("folderTitleVisibility"), false);
	assert.equal(folderOptions.includes("Decade folder titles"), false);
	assert.ok(review.includes("View folder details"));
	for (const removed of ["Selected Decades", "data-review-source-preview", "decades-review-configuration", "Individual years ·", "First folder source"]) assert.equal(review.includes(removed), false, removed);
	assert.equal(review.includes("data-decades-source-row"), false);

	const invalidState = { ...collectionState, collectionTitles: { ...collectionState.collectionTitles, movies: "" } };
	const invalidPlan = buildDecadesCreationPlan(current.getState().project, current.getState().revision, invalidState);
	assert.equal(invalidPlan.ok, false);
	const recoverableReview = renderToStaticMarkup(createElement(DecadesReviewStep, { state: invalidState, planResult: invalidPlan, onCollectionTitleChange() {} }));
	assert.ok(recoverableReview.includes("Review needs attention"));
	assert.ok(recoverableReview.includes('id="decades-collection-movies"'));

	const destination = current.createCollection({ editable: { title: "Destination", viewMode: "ROWS", showAllTab: false, pinToTop: true } });
	let folderState = toggleDecadePreset(createDecadesCreationState({ scope: "new-folder", currentYear: 2026, destinationCollectionInternalId: destination.createdInternalId }), "2020s");
	folderState = prepareDecadesReview(folderState);
	const folderPlan = buildDecadesCreationPlan(current.getState().project, current.getState().revision, folderState);
	assert.equal(folderPlan.ok, true);
	const folderReview = renderToStaticMarkup(createElement(DecadesReviewStep, { state: folderState, planResult: folderPlan, onStateChange() {} }));
	assert.equal(folderReview.includes("Collection</span>"), false);
	assert.ok(folderReview.includes("Inherited Collection options"));
	assert.ok(folderReview.includes("Rows · All tab off · title visible · pinned"));
	assert.ok(folderReview.includes("Title options"));
	assert.equal(folderReview.includes("Hide collection title in Nuvio"), false);
	assert.ok(folderReview.includes("Folder title visibility"));
	assert.equal(folderReview.includes("Decade folder titles"), false);
	assert.ok(folderReview.includes('data-decades-settings="folder-options"'));
	for (const forbidden of ['name="decades-view"', 'name="showAllTab"', 'name="pinToTop"', 'name="hideNuvioTitle"']) assert.equal(folderReview.includes(forbidden), false, forbidden);
});

test("hidden Decades collection titles use one shared accessible message and preserve every draft title", () => {
	const hiddenMessage = "Collection titles are intentionally hidden in Nuvio. Turn this off to edit visible titles.";
	const renderHiddenReview = (mediaMode) => {
		const current = controller();
		let state = toggleDecadePreset(createDecadesCreationState({ scope: "new-collection", currentYear: 2026 }), "1980s");
		state = updateDecadesCreationMedia(state, mediaMode);
		state = prepareDecadesReview({ ...state, hideCollectionTitle: true });
		const planResult = buildDecadesCreationPlan(current.getState().project, current.getState().revision, state);
		assert.equal(planResult.ok, true);
		const markup = renderToStaticMarkup(createElement(DecadesReviewStep, { state, planResult, onCollectionTitleChange() {}, onStateChange() {} }));
		return { state, planResult, markup };
	};

	for (const [mediaMode, expectedDrafts] of [
		["movies", { movies: "Movie Decades" }],
		["both", { movies: "Movie Decades", series: "TV Decades" }],
	]) {
		const { state, planResult, markup } = renderHiddenReview(mediaMode);
		assert.equal((markup.match(new RegExp(hiddenMessage.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length, 1);
		assert.equal((markup.match(/id="decades-hidden-collection-titles-help"/g) ?? []).length, 1);
		const titleInputs = [...markup.matchAll(/<input id="decades-collection-[^"]+" type="text"[^>]*>/g)].map((match) => match[0]);
		assert.equal(titleInputs.length, Object.keys(expectedDrafts).length);
		for (const input of titleInputs) {
			assert.ok(input.includes('value=""'));
			assert.ok(input.includes('disabled=""'));
			assert.ok(input.includes('aria-describedby="decades-hidden-collection-titles-help"'));
		}
		assert.deepEqual(state.collectionTitles, expectedDrafts);
		for (const collection of planResult.plan.collections) assert.equal(collection.editable.title, NUVIO_INVISIBLE_TITLE);

		const visibleState = { ...state, hideCollectionTitle: false };
		const visiblePlan = buildDecadesCreationPlan(controller().getState().project, 0, visibleState);
		assert.equal(visiblePlan.ok, true);
		const visibleMarkup = renderToStaticMarkup(createElement(DecadesReviewStep, { state: visibleState, planResult: visiblePlan, onCollectionTitleChange() {}, onStateChange() {} }));
		assert.equal(visibleMarkup.includes(hiddenMessage), false);
		for (const title of Object.values(expectedDrafts)) assert.ok(visibleMarkup.includes(`value="${title}"`), title);
	}
});

test("Review presentation controls reflect state and the overview/All-tab note is strictly conditional", () => {
	let state = createDecadesCreationState({ scope: "new-collection", currentYear: 2026 });
	state = toggleDecadePreset(toggleDecadePreset(state, "1980s"), "2020s");
	state = updateDecadesCreationMedia(state, "both");
	state = {
		...state,
		layout: "mixed-collection",
		viewMode: "ROWS",
		showAllTab: false,
		pinToTop: true,
		hideCollectionTitle: true,
		folderTileShape: "LANDSCAPE",
		folderTitleVisibility: "HIDE_EVERYWHERE",
		content: { wholeDecade: true, individualYears: true, genreBreakdown: false },
		decadeOrder: "newest-first",
		yearOrder: "newest-first",
		sourceGrouping: "paired",
		sortOptionId: "recent",
		advanced: { ...state.advanced, minimumVotes: "250" },
	};
	const current = controller();
	const plan = buildDecadesCreationPlan(current.getState().project, current.getState().revision, state);
	assert.equal(plan.ok, true);
	const serializedPlanBeforeRender = JSON.stringify(plan.plan);
	const review = renderToStaticMarkup(createElement(DecadesReviewStep, { state: prepareDecadesReview(state), planResult: plan, onCollectionTitleChange() {}, onStateChange() {} }));
	assert.equal(JSON.stringify(plan.plan), serializedPlanBeforeRender);
	assert.ok(review.indexOf("Title options") < review.indexOf("Layout"));
	for (const summary of ["Rows · pinned", "Landscape"]) assert.ok(review.includes(summary), summary);
	assert.equal(review.includes("Include an All tab when using Tabs"), false);
	assert.match(review, /id="decades-collection-mixed" type="text" disabled=""[^>]*value=""/);
	assert.equal((review.match(/Collection titles are intentionally hidden in Nuvio\. Turn this off to edit visible titles\./g) ?? []).length, 1);
	assert.match(review, /data-editor-choice="hide-everywhere"[^>]*checked="" value="HIDE_EVERYWHERE"/);
	const restoredState = { ...prepareDecadesReview(state), hideCollectionTitle: false };
	const restoredPlan = buildDecadesCreationPlan(current.getState().project, current.getState().revision, restoredState);
	const restoredReview = renderToStaticMarkup(createElement(DecadesReviewStep, { state: restoredState, planResult: restoredPlan, onCollectionTitleChange() {}, onStateChange() {} }));
	assert.match(restoredReview, /id="decades-collection-mixed" type="text" value="Decades"/);
	assert.equal(restoredReview.includes('id="decades-collection-mixed" type="text" value="Decades" disabled'), false);
	assert.equal(review.includes('data-decades-overview-all-tab-note="true"'), false);

	const noteState = prepareDecadesReview({ ...state, viewMode: "TABBED_GRID", showAllTab: true });
	const notePlan = buildDecadesCreationPlan(current.getState().project, current.getState().revision, noteState);
	const withNote = renderToStaticMarkup(createElement(DecadesReviewStep, { state: noteState, planResult: notePlan, onCollectionTitleChange() {}, onStateChange() {} }));
	assert.ok(withNote.includes('data-decades-overview-all-tab-note="true"'));
	assert.ok(withNote.includes("The All tab combines this folder’s sources"));
	assert.equal(noteState.showAllTab, true);
	assert.equal(noteState.content.wholeDecade, true);
	for (const withoutNoteState of [
		{ ...noteState, content: { ...noteState.content, wholeDecade: false } },
		{ ...noteState, viewMode: "ROWS" },
		{ ...noteState, showAllTab: false },
	]) {
		const result = buildDecadesCreationPlan(current.getState().project, current.getState().revision, withoutNoteState);
		const markup = renderToStaticMarkup(createElement(DecadesReviewStep, { state: withoutNoteState, planResult: result, onCollectionTitleChange() {}, onStateChange() {} }));
		assert.equal(markup.includes('data-decades-overview-all-tab-note="true"'), false);
	}
	assert.deepEqual(plan.plan.collections[0].editable, {
		title: NUVIO_INVISIBLE_TITLE,
		pinToTop: true,
		focusGlowEnabled: true,
		viewMode: "ROWS",
		showAllTab: true,
	});
	assert.equal(plan.plan.configuration.showAllTab, true);
	assert.deepEqual(plan.plan.collections[0].folders[0].editable, { title: NUVIO_INVISIBLE_TITLE, tileShape: "LANDSCAPE", hideTitle: true });
});

test("canonical Decade sources select the Decade editor before Genre and retain fixed structure on save", () => {
	const current = controller();
	const { source } = addSource(current);
	const sessionResult = createSourceEditSession(current.getState().project, source.createdInternalId);
	assert.equal(sessionResult.ok, true);
	assert.equal(sessionResult.session.adapterId, DECADE_SOURCE_EDITOR_ID);
	const sourceNode = current.getState().project.collections[0].folders[0].sources[0];
	assert.equal(sourceEditorFor(sourceNode).id, DECADE_SOURCE_EDITOR_ID);
	assert.equal(inspectEditableGenreSource(sourceNode), null);

	let draft = updateSourceEditTitle(sessionResult.draft, "Classic Eighties");
	draft = updateDecadeSourceSort(draft, decadeEditSortValue("recent", draft.mediaType), "recent");
	draft = updateDecadeSourceAdvanced(draft, {
		...draft.advanced,
		minimumRating: "7",
		ordinaryExcludedGenres: ["Comedy"],
	});
	const saved = saveSourceEdit(current, sessionResult.session, draft);
	assert.equal(saved.ok, true);
	const edited = current.getState().project.collections[0].folders[0].sources[0];
	assert.equal(edited.editable.title, "Classic Eighties");
	assert.equal(edited.editable.sortBy, "primary_release_date.desc");
	assert.deepEqual(edited.editable.filters, {
		releaseDateGte: "1980-01-01",
		releaseDateLte: "1989-12-31",
		voteAverageGte: 7,
		withoutGenres: "35",
	});
	assert.equal(inspectCanonicalDecadeSourceNode(edited).period.id, "1980s");
});

test("Decade source edit rejects structural drift and renders fixed fields with narrow advanced controls", () => {
	const current = controller();
	const { source } = addSource(current, canonicalSource({
		title: "1980s Comedy Movies",
		filters: { releaseDateGte: "1980-01-01", releaseDateLte: "1989-12-31", withGenres: "35" },
	}));
	const opened = createSourceEditSession(current.getState().project, source.createdInternalId);
	const invalid = saveSourceEdit(current, opened.session, { ...opened.draft, periodId: "1990s" });
	assert.equal(invalid.ok, false);
	assert.equal(invalid.validationFailed, true);
	assert.equal(invalid.errors[0].code, "SOURCE_EDIT_DECADE_STRUCTURE_FIXED");

	const markup = renderToStaticMarkup(createElement(SourceEditorDialog, {
		session: opened.session,
		initialDraft: opened.draft,
		onCancel() {},
		onSave() { return { ok: true }; },
	}));
	for (const text of ["Fixed structure", "1980s", "Movies", "Comedy", "Popular", "Recent", "Top Rated", "Most Votes", "Decade dates stay fixed"]) assert.ok(markup.includes(text), text);
	assert.equal(markup.includes("From year"), false);
	assert.equal(markup.includes("To year"), false);
});

test("creation styles keep selected cards restrained and cover required responsive and reduced-motion seams", () => {
	const styles = fs.readFileSync(path.join(rootDir, "builder", "src", "styles.css"), "utf8");
	for (const marker of [
		".creation-dialog",
		".decades-preset-grid button[data-selected=\"true\"]",
		"@media (max-width: 620px)",
		"@media (max-width: 430px)",
		"@media (prefers-reduced-motion: reduce)",
	]) assert.ok(styles.includes(marker), marker);
	assert.match(styles, /\.creation-option-list\s*\{[^}]*minmax\(min\(184px, 100%\), 1fr\)/s);
	assert.match(styles, /\.creation-option-card\s*\{[^}]*min-height:\s*76px;[^}]*grid-template-columns:\s*auto minmax\(0, 1fr\)/s);
	assert.match(styles, /\.creation-option-icon-shell\s*\{[^}]*width:\s*42px;[^}]*height:\s*42px/s);
	assert.match(styles, /@media \(max-width: 620px\)[\s\S]*?\.creation-option-list\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/s);
	assert.match(styles, /@media \(max-width: 620px\)[\s\S]*?\.creation-option-card\s*\{[^}]*gap:\s*8px;[^}]*padding:\s*10px/s);
	assert.match(styles, /@media \(min-width: 900px\)[\s\S]*\.creation-dialog:not\(\[data-creation-option\]\)\s*\{[^}]*height:\s*auto/s);
	assert.equal(styles.includes(".creation-option-arrow"), false);
	assert.match(styles, /\.decades-structure-preview\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
	assert.match(styles, /\.decades-choice-grid\.decades-display-order-choices\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/s);
	assert.match(styles, /@media \(max-width: 620px\)[\s\S]*\.decades-choice-grid\.decades-display-order-choices\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
	assert.ok(styles.includes(".decades-settings-disclosure > summary:focus-visible"));
	assert.match(styles, /\.genre-secondary-surface\s*\{[^}]*border:\s*0;[^}]*border-radius:\s*0;/s);
	assert.match(styles, /\.genre-secondary-surface > \.genre-advanced-subview\s*\{[^}]*border:\s*1px solid/s);
	assert.ok(styles.includes(".review-title-options"));
	assert.ok(styles.includes(".review-layout-options"));
	assert.doesNotMatch(styles, /\.decades-(?:preset|choice|content|genre)[^}]*border-left:/);
});
