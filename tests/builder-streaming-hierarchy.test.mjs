import assert from "node:assert/strict";
import test from "node:test";

import { createBuilderController } from "../builder/src/application/index.js";
import { NUVIO_INVISIBLE_TITLE } from "../builder/src/nuvio/titles.js";
import {
	applyStreamingHierarchyPlan,
	buildStreamingSourceDrafts,
	createStreamingHierarchyPlan,
	createStreamingSelectionState,
	defaultStreamingFolderName,
	defaultStreamingSourceName,
	eligibleStreamingProvidersForMedia,
	hasStreamingCollectionAffinity,
	inspectSimpleStreamingSourceNode,
	inspectStreamingAffinitySourceNode,
	inspectStreamingHierarchyDestinationCandidates,
	inspectStreamingSourceDuplicates,
	reconcileStreamingSelection,
	removeSelectedStreamingProvider,
	selectedStreamingProviders,
	STREAMING_HIERARCHY_PLACEMENT_STATUSES,
	STREAMING_SOURCE_NAME_CONTEXTS,
	toggleSelectedStreamingProvider,
} from "../builder/src/source-add/index.js";

function countingFactory(prefix) {
	let count = 0;
	return () => `${prefix}-${++count}`;
}

function createController() {
	return createBuilderController({ idFactory: countingFactory("internal"), nuvioIdFactory: countingFactory("nuvio") });
}

const regions = Object.freeze([
	Object.freeze({ code: "AU", name: "Australia" }),
	Object.freeze({ code: "US", name: "United States" }),
]);

function provider(id, name, { movieRegions = ["AU", "US"], tvRegions = ["AU", "US"] } = {}) {
	return Object.freeze({
		id,
		name,
		searchName: name.toLowerCase(),
		logoPath: `/provider-${id}.jpg`,
		moviePriorities: Object.freeze(Object.fromEntries(movieRegions.map((code, index) => [code, index + 1]))),
		tvPriorities: Object.freeze(Object.fromEntries(tvRegions.map((code, index) => [code, index + 2]))),
	});
}

const netflix = provider(8, "Netflix");
const disney = provider(337, "Disney+");
const prime = provider(119, "Prime Video");
const appleTv = provider(2, "Apple TV");
const dekkoo = provider(444, "Dekkoo");
const crunchyroll = provider(283, "Crunchyroll");

function baseOptions(controller, overrides = {}) {
	return {
		scope: "new-collection",
		projectRevision: controller.getState().revision,
		collectionTitle: "Streaming Services",
		hideCollectionTitle: false,
		viewMode: "TABBED_GRID",
		showAllTab: true,
		pinToTop: false,
		folderTitleVisibility: "SHOW_EVERYWHERE",
		groupingMode: "group-by-service",
		regions,
		mediaChoice: "both",
		sortOptionId: "popular",
		providers: [netflix, disney],
		...overrides,
	};
}

function createDestination(controller, title = "Streaming Services") {
	return controller.createCollection({ editable: { title, viewMode: "ROWS", showAllTab: true, pinToTop: false } });
}

function createFolder(controller, collectionInternalId, title, editable = {}) {
	return controller.createFolder(collectionInternalId, { editable: { title, tileShape: "LANDSCAPE", hideTitle: false, ...editable } });
}

function draftsFor(service, regionCodes, mediaChoice, { sortOptionId = "popular", context = STREAMING_SOURCE_NAME_CONTEXTS.GROUPED_BY_SERVICE } = {}) {
	const result = buildStreamingSourceDrafts(service, { regionCodes, mediaChoice, sortOptionId, nameContext: context });
	assert.equal(result.ok, true, result.errors?.[0]?.message);
	return result.drafts;
}

function addDrafts(controller, folderInternalId, drafts) {
	const result = controller.addSourcesToFolder(folderInternalId, { sources: drafts });
	assert.equal(result.ok, true);
	return result;
}

function importOwnerStyleStreamingCollection(title = "Dave's TV") {
	const controller = createController();
	const importedValue = [{
		id: "owner-streaming",
		title,
		backdropImageUrl: "https://image.example/owner-collection-backdrop.jpg",
		pinToTop: true,
		focusGlowEnabled: false,
		viewMode: "TABBED_GRID",
		showAllTab: true,
		ownerCollectionFlag: "preserve-collection",
		folders: [{
			id: "owner-netflix",
			title: "Netflix",
			hideTitle: true,
			tileShape: "LANDSCAPE",
			coverImageUrl: "https://image.example/netflix-cover.jpg",
			heroBackdropUrl: "https://image.example/netflix-hero.jpg",
			titleLogoUrl: "https://image.example/netflix-logo.png",
			focusGifUrl: "https://image.example/netflix-focus.gif",
			focusGifEnabled: true,
			ownerFolderFlag: "preserve-netflix",
			sources: [
				{ provider: "tmdb", title: "Netflix curated list", tmdbSourceType: "LIST", tmdbId: 8115, mediaType: "MOVIE", sortBy: "CUSTOM" },
				{ provider: "trakt", title: "Netflix Trakt list", type: "movie", catalogId: "netflix-owner-list", ownerTraktFlag: true },
				{
					provider: "tmdb",
					title: "Netflix rich Movie Discover",
					tmdbSourceType: "DISCOVER",
					tmdbId: null,
					mediaType: "MOVIE",
					sortBy: "popularity.desc",
					filters: {
						withWatchProviders: "8|1796",
						watchRegion: "US",
						withGenres: "18|35",
						withKeywords: "123|456",
						voteAverageGte: 7,
						voteCountGte: 200,
						releaseDateGte: "2020-01-01",
					},
					ownerSourceFlag: "preserve-rich-discover",
				},
			],
		}, {
			id: "owner-apple",
			title: "Apple TV+",
			hideTitle: false,
			tileShape: "POSTER",
			coverImageUrl: "https://image.example/apple-cover.jpg",
			sources: [
				{
					provider: "tmdb",
					title: "Apple TV+ preserved alias Discover",
					tmdbSourceType: "DISCOVER",
					tmdbId: null,
					mediaType: "MOVIE",
					sortBy: "vote_count.desc",
					filters: { with_watch_providers: "350", watch_region: "US", withGenres: "18" },
				},
				{ provider: "tmdb", title: "Apple TV+ network Series", tmdbSourceType: "DISCOVER", tmdbId: null, mediaType: "TV", sortBy: "popularity.desc", filters: { withNetworks: "2552", voteCountGte: 50 } },
				{ provider: "tmdb", title: "Apple TV+ list", tmdbSourceType: "LIST", tmdbId: 9001, mediaType: "TV", sortBy: "CUSTOM" },
			],
		}],
	}];
	const imported = controller.importValue(importedValue);
	assert.equal(imported.ok, true, imported.errors?.[0]?.message);
	return { controller, importedValue };
}

function existingScopeOptions(controller, collectionInternalId, overrides = {}) {
	return baseOptions(controller, {
		scope: "new-folder",
		destinationCollectionInternalId: collectionInternalId,
		collectionTitle: undefined,
		hideCollectionTitle: undefined,
		viewMode: undefined,
		showAllTab: undefined,
		pinToTop: undefined,
		projectRevision: controller.getState().revision,
		...overrides,
	});
}

test("Streaming names use one explicit context-aware grammar", () => {
	assert.equal(defaultStreamingSourceName("Netflix", "AU", "MOVIE"), "Netflix Movies (AU)");
	assert.equal(defaultStreamingSourceName("Netflix", "AU", "TV"), "Netflix Series (AU)");
	assert.equal(defaultStreamingSourceName("Netflix", "AU", "MOVIE", { context: STREAMING_SOURCE_NAME_CONTEXTS.GROUPED_BY_SERVICE }), "Movies (AU)");
	assert.equal(defaultStreamingSourceName("Netflix", "AU", "TV", { context: STREAMING_SOURCE_NAME_CONTEXTS.SEPARATE_BY_REGION }), "Series");
	assert.equal(defaultStreamingFolderName("Netflix", null, { context: STREAMING_SOURCE_NAME_CONTEXTS.GROUPED_BY_SERVICE }), "Netflix");
	assert.equal(defaultStreamingFolderName("Netflix", "AU", { context: STREAMING_SOURCE_NAME_CONTEXTS.SEPARATE_BY_REGION }), "Netflix (AU)");
});

test("provider eligibility intersects every selected region with the global media choice", () => {
	const movieOnlyEverywhere = provider(1, "Movie Everywhere", { tvRegions: ["AU"] });
	const splitAvailability = provider(2, "Split", { movieRegions: ["AU"], tvRegions: ["US"] });
	assert.deepEqual(eligibleStreamingProvidersForMedia([netflix, movieOnlyEverywhere, splitAvailability], ["AU", "US"], "movies").map((entry) => entry.id), [8, 1]);
	assert.deepEqual(eligibleStreamingProvidersForMedia([netflix, movieOnlyEverywhere, splitAvailability], ["AU", "US"], "series").map((entry) => entry.id), [8]);
	assert.deepEqual(eligibleStreamingProvidersForMedia([netflix, movieOnlyEverywhere, splitAvailability], ["AU", "US"], "both").map((entry) => entry.id), [8]);
});

test("Streaming provider selection preserves click order with no arbitrary cap", () => {
	let selection = createStreamingSelectionState();
	for (let index = 1; index <= 100; index += 1) selection = toggleSelectedStreamingProvider(selection, provider(index, `Provider ${index}`)).state;
	assert.equal(selectedStreamingProviders(selection).length, 100);
	assert.deepEqual(selectedStreamingProviders(selection).slice(0, 3).map((entry) => entry.id), [1, 2, 3]);
	selection = removeSelectedStreamingProvider(selection, 2);
	selection = toggleSelectedStreamingProvider(selection, provider(2, "Provider 2")).state;
	assert.deepEqual(selectedStreamingProviders(selection).slice(-2).map((entry) => entry.id), [100, 2]);
});

function selectionFor(...providers) {
	let selection = createStreamingSelectionState();
	for (const selectedProvider of providers) selection = toggleSelectedStreamingProvider(selection, selectedProvider).state;
	return selection;
}

test("owner Netflix Both to Series and Movies reconciliation retains the exact ordered selection", () => {
	const selection = selectionFor(netflix);
	for (const mediaChoice of ["series", "movies"]) {
		const reconciled = reconcileStreamingSelection(selection, [netflix], ["AU"], mediaChoice);
		assert.equal(reconciled.state, selection, `${mediaChoice} keeps the unchanged selection state`);
		assert.deepEqual(reconciled.removedProviders, []);
		assert.deepEqual(selectedStreamingProviders(reconciled.state).map((entry) => entry.id), [netflix.id]);
		const controller = createController();
		const plan = createStreamingHierarchyPlan(controller.getState().project, baseOptions(controller, { providers: selectedStreamingProviders(reconciled.state), regions: [regions[0]], mediaChoice }));
		assert.equal(plan.ok, true);
		assert.deepEqual(plan.plan.newFolders[0].sources.map((source) => source.draft.editable.mediaType), [mediaChoice === "series" ? "TV" : "MOVIE"]);
	}
});

test("Media reconciliation prunes only ineligible providers and preserves retained order", () => {
	const always = provider(101, "Always");
	const moviesOnly = provider(102, "Movies only", { tvRegions: [] });
	const alsoAlways = provider(103, "Also always");
	const selection = selectionFor(always, moviesOnly, alsoAlways);
	const reconciled = reconcileStreamingSelection(selection, [always, moviesOnly, alsoAlways], ["AU"], "both");
	assert.deepEqual(selectedStreamingProviders(reconciled.state).map((entry) => entry.id), [101, 103]);
	assert.deepEqual(reconciled.removedProviders.map((entry) => entry.id), [102]);

	const unchanged = reconcileStreamingSelection(reconciled.state, [always, moviesOnly, alsoAlways], ["AU"], "series");
	assert.equal(unchanged.state, reconciled.state);
	assert.deepEqual(unchanged.removedProviders, []);
});

test("Region reconciliation uses the catalogue eligibility intersection and keeps less-restrictive selections", () => {
	const bothRegions = provider(201, "Both regions");
	const auOnly = provider(202, "AU only", { movieRegions: ["AU"], tvRegions: ["AU"] });
	const selection = selectionFor(bothRegions, auOnly);
	const restricted = reconcileStreamingSelection(selection, [bothRegions, auOnly], ["AU", "US"], "both");
	assert.deepEqual(selectedStreamingProviders(restricted.state).map((entry) => entry.id), [201]);
	assert.deepEqual(restricted.removedProviders.map((entry) => entry.id), [202]);
	const relaxed = reconcileStreamingSelection(restricted.state, [bothRegions, auOnly], ["AU"], "both");
	assert.equal(relaxed.state, restricted.state);
	assert.deepEqual(relaxed.removedProviders, []);
});

test("reconciliation preserves deliberate order and handles an all-ineligible result without substitutes", () => {
	const c = provider(301, "C");
	const a = provider(302, "A movies only", { tvRegions: [] });
	const b = provider(303, "B");
	const ordered = reconcileStreamingSelection(selectionFor(c, a, b), [a, b, c], ["AU"], "both");
	assert.deepEqual(selectedStreamingProviders(ordered.state).map((entry) => entry.id), [301, 303]);

	const movieOne = provider(304, "Movie one", { tvRegions: [] });
	const movieTwo = provider(305, "Movie two", { tvRegions: [] });
	const none = reconcileStreamingSelection(selectionFor(movieOne, movieTwo), [movieOne, movieTwo], ["AU"], "series");
	assert.deepEqual(selectedStreamingProviders(none.state), []);
	assert.deepEqual(none.removedProviders.map((entry) => entry.id), [304, 305]);
});

test("new grouped hierarchy preserves provider, region and media order with exact P×R×M counts", () => {
	const controller = createController();
	const result = createStreamingHierarchyPlan(controller.getState().project, baseOptions(controller));
	assert.equal(result.ok, true);
	assert.deepEqual(result.plan.counts, {
		collectionCount: 1,
		folderCount: 2,
		sourceCount: 8,
		newFolderCount: 2,
		existingFolderAdditionCount: 0,
		newSourceCount: 8,
		exactSourceCount: 0,
		conflictCount: 0,
	});
	assert.deepEqual(result.plan.collections[0].folders.map((folder) => folder.editable.title), ["Netflix", "Disney+"]);
	assert.deepEqual(result.plan.collections[0].folders[0].sources.map((entry) => entry.draft.editable.title), ["Movies (AU)", "Series (AU)", "Movies (US)", "Series (US)"]);
	assert.deepEqual(Object.keys(result.plan.collections[0].folders[0].editable).sort(), ["hideTitle", "tileShape", "title"]);
	assert.deepEqual(result.plan.elsewhereEvidence, { overlap: "none", proposedSourceCount: 8, matchedSourceCount: 0, providerMatches: [] });
});

test("Streaming collection affinity accepts strong canonical and imported alias Discover evidence without weakening exact identity", () => {
	const { controller } = importOwnerStyleStreamingCollection();
	const collection = controller.getState().project.collections[0];
	const sources = collection.folders.flatMap((folder) => folder.sources);
	const netflixRich = sources.find((source) => source.editable.title === "Netflix rich Movie Discover");
	const appleAlias = sources.find((source) => source.editable.title === "Apple TV+ preserved alias Discover");
	const appleNetwork = sources.find((source) => source.editable.title === "Apple TV+ network Series");

	assert.deepEqual(inspectStreamingAffinitySourceNode(netflixRich), { mediaType: "MOVIE", providerExpression: "8|1796", regionCode: "US" });
	assert.deepEqual(inspectStreamingAffinitySourceNode(appleAlias), { mediaType: "MOVIE", providerExpression: "350", regionCode: "US" });
	assert.equal(inspectStreamingAffinitySourceNode(appleNetwork), null);
	assert.equal(inspectSimpleStreamingSourceNode(netflixRich), null);
	assert.equal(inspectSimpleStreamingSourceNode(appleAlias), null);
	assert.equal(hasStreamingCollectionAffinity(collection), true);
	assert.equal(inspectStreamingSourceDuplicates(controller.getState().project, null, draftsFor(netflix, ["US"], "movies")).elsewhere.length, 0);
	assert.deepEqual(netflixRich.rawImported.filters, {
		withWatchProviders: "8|1796",
		watchRegion: "US",
		withGenres: "18|35",
		withKeywords: "123|456",
		voteAverageGte: 7,
		voteCountGte: 200,
		releaseDateGte: "2020-01-01",
	});
	assert.deepEqual(appleAlias.rawImported.filters, { with_watch_providers: "350", watch_region: "US", withGenres: "18" });
});

test("builder-generated and rich imported Streaming collections qualify at zero overlap regardless of title", () => {
	const generatedController = createController();
	const generatedCollection = createDestination(generatedController, "Watch Now");
	const generatedFolder = createFolder(generatedController, generatedCollection.createdInternalId, "Custom Netflix");
	addDrafts(generatedController, generatedFolder.createdInternalId, draftsFor(netflix, ["US"], "movies"));
	const generated = inspectStreamingHierarchyDestinationCandidates(generatedController.getState().project, baseOptions(generatedController, { providers: [crunchyroll], regions: [regions[0]], mediaChoice: "both" }));
	assert.deepEqual(generated.candidates.map((candidate) => ({ title: candidate.collectionTitle, matching: candidate.matchingSourceCount, affinity: candidate.streamingAffinity, newFolders: candidate.plan.counts.newFolderCount, sources: candidate.plan.counts.newSourceCount })), [
		{ title: "Watch Now", matching: 0, affinity: true, newFolders: 1, sources: 2 },
	]);

	for (const title of ["Streaming Services", "Streaming", "Dave's TV"]) {
		const { controller } = importOwnerStyleStreamingCollection(title);
		const inspected = inspectStreamingHierarchyDestinationCandidates(controller.getState().project, baseOptions(controller, { providers: [crunchyroll], regions: [regions[0]], mediaChoice: "both" }));
		assert.equal(inspected.candidates.length, 1, title);
		assert.deepEqual({ title: inspected.candidates[0].collectionTitle, matching: inspected.candidates[0].matchingSourceCount, affinity: inspected.candidates[0].streamingAffinity }, { title, matching: 0, affinity: true });
		assert.deepEqual({ existingFoldersUpdated: inspected.candidates[0].plan.counts.existingFolderAdditionCount, newFolders: inspected.candidates[0].plan.counts.newFolderCount, sourcesToAdd: inspected.candidates[0].plan.counts.newSourceCount }, { existingFoldersUpdated: 0, newFolders: 1, sourcesToAdd: 2 });
	}
});

test("title-only and provider-named LIST, Trakt, artwork, and Network evidence do not create Streaming affinity", () => {
	const controller = createController();
	createDestination(controller, "Streaming Services");
	const discover = createDestination(controller, "Discover");
	const folder = createFolder(controller, discover.createdInternalId, "Netflix", { coverImageUrl: "https://image.example/streaming-art.jpg" });
	assert.equal(controller.createSource(folder.createdInternalId, { category: "native-tmdb", editable: { provider: "tmdb", title: "Top Streaming Movies", tmdbSourceType: "LIST", tmdbId: 100, mediaType: "MOVIE", sortBy: "CUSTOM" } }).ok, true);
	assert.equal(controller.createSource(folder.createdInternalId, { category: "opaque", editable: { title: "Netflix Trakt list" }, rawImported: { provider: "trakt", title: "Netflix Trakt list", type: "movie", catalogId: "netflix" } }).ok, true);
	assert.equal(controller.createSource(folder.createdInternalId, { category: "native-tmdb", editable: { provider: "tmdb", title: "Apple TV+ Series", tmdbSourceType: "DISCOVER", tmdbId: null, mediaType: "TV", sortBy: "popularity.desc", filters: { withNetworks: "2552" } } }).ok, true);
	assert.equal(hasStreamingCollectionAffinity(controller.getState().project.collections[0]), false);
	assert.equal(hasStreamingCollectionAffinity(controller.getState().project.collections[1]), false);
	const inspected = inspectStreamingHierarchyDestinationCandidates(controller.getState().project, baseOptions(controller, { providers: [crunchyroll], regions: [regions[0]], mediaChoice: "both" }));
	assert.deepEqual(inspected.candidates, []);
});

test("malformed, incomplete, exclusion-only, and conflicting alias filters fail closed for collection affinity", () => {
	const source = (filters) => ({ editable: {
		provider: "tmdb",
		title: "Imported Discover",
		tmdbSourceType: "DISCOVER",
		tmdbId: null,
		mediaType: "MOVIE",
		sortBy: "popularity.desc",
		filters,
	} });
	for (const filters of [
		{ watchRegion: "AU" },
		{ withWatchProviders: "8" },
		{ withWatchProviders: "0", watchRegion: "AU" },
		{ withWatchProviders: "8||1796", watchRegion: "AU" },
		{ withWatchProviders: "8", watchRegion: "au" },
		{ withoutWatchProviders: "8", watchRegion: "AU" },
		{ withWatchProviders: "8", with_watch_providers: "350", watchRegion: "AU" },
		{ withWatchProviders: "8", watchRegion: "AU", watch_region: "US" },
	]) assert.equal(inspectStreamingAffinitySourceNode(source(filters)), null, JSON.stringify(filters));
});

test("exact-overlap destinations rank before zero-overlap affinity destinations and zero-overlap ties keep project order", () => {
	const controller = createController();
	const zeroFirst = createDestination(controller, "Affinity first");
	const zeroFirstFolder = createFolder(controller, zeroFirst.createdInternalId, "Netflix");
	addDrafts(controller, zeroFirstFolder.createdInternalId, draftsFor(netflix, ["US"], "movies"));
	const exact = createDestination(controller, "Exact Crunchyroll");
	const exactFolder = createFolder(controller, exact.createdInternalId, "Crunchyroll");
	addDrafts(controller, exactFolder.createdInternalId, draftsFor(crunchyroll, ["AU"], "movies"));
	const zeroSecond = createDestination(controller, "Affinity second");
	const zeroSecondFolder = createFolder(controller, zeroSecond.createdInternalId, "Disney+");
	addDrafts(controller, zeroSecondFolder.createdInternalId, draftsFor(disney, ["US"], "series"));

	const inspected = inspectStreamingHierarchyDestinationCandidates(controller.getState().project, baseOptions(controller, { providers: [crunchyroll], regions: [regions[0]], mediaChoice: "both" }));
	assert.deepEqual(inspected.candidates.map((candidate) => [candidate.collectionTitle, candidate.matchingSourceCount]), [
		["Exact Crunchyroll", 1],
		["Affinity first", 0],
		["Affinity second", 0],
	]);
});

test("mixed generic affinity folders are never adopted as provider placements", () => {
	const controller = createController();
	const imported = controller.importValue([{ id: "generic-streaming", title: "My Services", folders: [{ id: "generic-folder", title: "My Services", sources: [
		{ provider: "tmdb", title: "Rich Netflix", tmdbSourceType: "DISCOVER", tmdbId: null, mediaType: "MOVIE", sortBy: "popularity.desc", filters: { withWatchProviders: "8|1796", watchRegion: "US", voteCountGte: 100 } },
		{ provider: "tmdb", title: "Rich Apple", tmdbSourceType: "DISCOVER", tmdbId: null, mediaType: "MOVIE", sortBy: "vote_count.desc", filters: { withWatchProviders: "350", watchRegion: "US", withGenres: "18" } },
	] }] }]);
	assert.equal(imported.ok, true);
	const collectionBefore = controller.getState().project.collections[0];
	const genericFolderBefore = JSON.stringify(collectionBefore.folders[0]);
	const inspected = inspectStreamingHierarchyDestinationCandidates(controller.getState().project, baseOptions(controller, { providers: [crunchyroll], regions: [regions[0]], mediaChoice: "both" }));
	assert.equal(inspected.candidates.length, 1);
	assert.equal(inspected.candidates[0].plan.outcomes[0].status, STREAMING_HIERARCHY_PLACEMENT_STATUSES.NEW_FOLDER);
	assert.equal(inspected.candidates[0].plan.counts.existingFolderAdditionCount, 0);
	assert.equal(applyStreamingHierarchyPlan(controller, inspected.candidates[0].plan).ok, true);
	const collectionAfter = controller.getState().project.collections[0];
	assert.equal(JSON.stringify(collectionAfter.folders[0]), genericFolderBefore);
	assert.deepEqual(collectionAfter.folders.map((folder) => folder.editable.title), ["My Services", "Crunchyroll"]);
});

test("owner-style imported collection preserves every existing value while adding one new provider folder atomically", () => {
	const { controller } = importOwnerStyleStreamingCollection("Unrelated custom title");
	const beforeSerializedFolders = structuredClone(controller.serializeProject().value[0].folders);
	const beforeState = controller.getState();
	const beforeCollection = beforeState.project.collections[0];
	const beforeEditable = JSON.stringify(beforeCollection.editable);
	const beforeRaw = JSON.stringify(beforeCollection.rawImported);
	const beforeFolders = new Map(beforeCollection.folders.map((folder) => [folder.internalId, JSON.stringify(folder)]));
	const inspected = inspectStreamingHierarchyDestinationCandidates(beforeState.project, baseOptions(controller, { providers: [crunchyroll], regions: [regions[0]], mediaChoice: "both" }));
	const candidate = inspected.candidates[0];

	assert.equal(candidate.matchingSourceCount, 0);
	assert.equal(candidate.streamingAffinity, true);
	assert.deepEqual({ existingFoldersUpdated: candidate.plan.counts.existingFolderAdditionCount, newFolders: candidate.plan.counts.newFolderCount, sourcesToAdd: candidate.plan.counts.newSourceCount }, { existingFoldersUpdated: 0, newFolders: 1, sourcesToAdd: 2 });
	assert.equal(candidate.plan.outcomes[0].status, STREAMING_HIERARCHY_PLACEMENT_STATUSES.NEW_FOLDER);
	assert.equal(applyStreamingHierarchyPlan(controller, candidate.plan).ok, true);
	const afterState = controller.getState();
	const afterCollection = afterState.project.collections[0];
	assert.equal(afterState.revision, beforeState.revision + 1);
	assert.equal(afterState.project.collections.length, 1);
	assert.equal(JSON.stringify(afterCollection.editable), beforeEditable);
	assert.equal(JSON.stringify(afterCollection.rawImported), beforeRaw);
	for (const [internalId, serialized] of beforeFolders) assert.equal(JSON.stringify(afterCollection.folders.find((folder) => folder.internalId === internalId)), serialized);
	const { id: newFolderId, ...newFolderEditable } = afterCollection.folders.at(-1).editable;
	assert.match(newFolderId, /^nuvio-\d+$/);
	assert.deepEqual(newFolderEditable, { title: "Crunchyroll", tileShape: "POSTER", hideTitle: false });
	assert.deepEqual(afterCollection.folders.at(-1).sources.map((source) => [source.editable.title, source.editable.filters.watchRegion, source.editable.mediaType]), [["Movies (AU)", "AU", "MOVIE"], ["Series (AU)", "AU", "TV"]]);
	assert.deepEqual(controller.serializeProject().value[0].folders.slice(0, beforeSerializedFolders.length), beforeSerializedFolders);
});

test("new collection reports partial project-wide exact matches through ordinary Streaming duplicate identity", () => {
	const controller = createController();
	const existing = createDestination(controller, "Existing Streaming Services");
	const folder = createFolder(controller, existing.createdInternalId, "Imported Apple TV folder");
	const customTitles = draftsFor(appleTv, ["AU"], "both").map((draft, index) => ({ ...draft, editable: { ...draft.editable, title: index === 0 ? "Custom AU films" : "Custom AU shows" } }));
	addDrafts(controller, folder.createdInternalId, customTitles);
	const result = createStreamingHierarchyPlan(controller.getState().project, baseOptions(controller, { providers: [appleTv, dekkoo] }));

	assert.equal(result.ok, true);
	assert.equal(result.plan.elsewhereEvidence.overlap, "partial");
	assert.equal(result.plan.elsewhereEvidence.matchedSourceCount, 2);
	assert.equal(result.plan.elsewhereEvidence.proposedSourceCount, 8);
	assert.equal(result.plan.elsewhereEvidence.providerMatches.length, 1);
	assert.equal(result.plan.elsewhereEvidence.providerMatches[0].provider.name, "Apple TV");
	assert.deepEqual(result.plan.elsewhereEvidence.providerMatches[0].sources.map((source) => source.title), ["Movies (AU)", "Series (AU)"]);
	assert.equal(result.plan.elsewhereEvidence.providerMatches[0].occurrences[0].collectionTitle, "Existing Streaming Services");
	assert.equal(result.plan.counts.sourceCount, 8);
});

test("new collection distinguishes complete overlap from different Sort without claiming identical hierarchy", () => {
	const completeController = createController();
	const existing = createDestination(completeController, "Existing");
	const appleFolder = createFolder(completeController, existing.createdInternalId, "Apple elsewhere");
	const dekkooFolder = createFolder(completeController, existing.createdInternalId, "Dekkoo elsewhere");
	addDrafts(completeController, appleFolder.createdInternalId, draftsFor(appleTv, ["AU", "US"], "both"));
	addDrafts(completeController, dekkooFolder.createdInternalId, draftsFor(dekkoo, ["AU", "US"], "both"));
	const complete = createStreamingHierarchyPlan(completeController.getState().project, baseOptions(completeController, { providers: [appleTv, dekkoo] }));
	assert.equal(complete.ok, true);
	assert.deepEqual({ overlap: complete.plan.elsewhereEvidence.overlap, matched: complete.plan.elsewhereEvidence.matchedSourceCount, proposed: complete.plan.elsewhereEvidence.proposedSourceCount }, { overlap: "complete", matched: 8, proposed: 8 });

	const differentSortController = createController();
	const sortCollection = createDestination(differentSortController, "Different Sort");
	const sortFolder = createFolder(differentSortController, sortCollection.createdInternalId, "Apple TV");
	addDrafts(differentSortController, sortFolder.createdInternalId, draftsFor(appleTv, ["AU", "US"], "both", { sortOptionId: "top-rated" }));
	const differentSort = createStreamingHierarchyPlan(differentSortController.getState().project, baseOptions(differentSortController, { providers: [appleTv] }));
	assert.equal(differentSort.ok, true);
	assert.deepEqual(differentSort.plan.elsewhereEvidence, { overlap: "none", proposedSourceCount: 4, matchedSourceCount: 0, providerMatches: [] });
});

test("new collection duplicate evidence is stale-plan evidence and changes before Apply are rejected", () => {
	const controller = createController();
	const plan = createStreamingHierarchyPlan(controller.getState().project, baseOptions(controller, { providers: [appleTv], regions: [regions[0]], mediaChoice: "movies" }));
	assert.equal(plan.plan.elsewhereEvidence.overlap, "none");
	const existing = createDestination(controller, "Appeared later");
	const folder = createFolder(controller, existing.createdInternalId, "Apple TV elsewhere");
	addDrafts(controller, folder.createdInternalId, draftsFor(appleTv, ["AU"], "movies"));
	const before = controller.getState();
	const applied = applyStreamingHierarchyPlan(controller, plan.plan);
	assert.equal(applied.ok, false);
	assert.equal(applied.stale, true);
	assert.equal(controller.getState().revision, before.revision);
	assert.equal(controller.getState().project, before.project);
});

test("owner Netflix New Collection case offers the safe existing destination and applies only Movies AU", () => {
	const controller = createController();
	const collection = createDestination(controller, "Streaming Services");
	const folder = createFolder(controller, collection.createdInternalId, "Netflix");
	addDrafts(controller, folder.createdInternalId, draftsFor(netflix, ["AU"], "series"));
	const inspected = inspectStreamingHierarchyDestinationCandidates(controller.getState().project, baseOptions(controller, { providers: [netflix], regions: [regions[0]], mediaChoice: "both" }));

	assert.equal(inspected.ok, true);
	assert.equal(inspected.proposedSourceCount, 2);
	assert.equal(inspected.elsewhereEvidence.matchedSourceCount, 1);
	assert.equal(inspected.candidates.length, 1);
	assert.deepEqual({ title: inspected.candidates[0].collectionTitle, matching: inspected.candidates[0].matchingSourceCount, complete: inspected.candidates[0].complete }, { title: "Streaming Services", matching: 1, complete: false });
	assert.deepEqual({ existingFoldersUpdated: inspected.candidates[0].plan.counts.existingFolderAdditionCount, newFolders: inspected.candidates[0].plan.counts.newFolderCount, sourcesToAdd: inspected.candidates[0].plan.counts.newSourceCount }, { existingFoldersUpdated: 1, newFolders: 0, sourcesToAdd: 1 });
	const beforeRevision = controller.getState().revision;
	const beforeCollectionCount = controller.getState().project.collections.length;
	assert.equal(applyStreamingHierarchyPlan(controller, inspected.candidates[0].plan).ok, true);
	assert.equal(controller.getState().revision, beforeRevision + 1);
	assert.equal(controller.getState().project.collections.length, beforeCollectionCount);
	assert.deepEqual(controller.getState().project.collections[0].folders[0].sources.map((source) => source.editable.title), ["Series (AU)", "Movies (AU)"]);
});

test("partial multi-provider destination reuses Netflix AU and atomically plans the full remaining hierarchy", () => {
	const controller = createController();
	const collection = createDestination(controller, "Streaming Services");
	const folder = createFolder(controller, collection.createdInternalId, "Netflix");
	addDrafts(controller, folder.createdInternalId, draftsFor(netflix, ["AU"], "both"));
	const inspected = inspectStreamingHierarchyDestinationCandidates(controller.getState().project, baseOptions(controller));
	const candidate = inspected.candidates[0];

	assert.deepEqual({ matching: candidate.matchingSourceCount, proposed: candidate.proposedSourceCount }, { matching: 2, proposed: 8 });
	assert.deepEqual({ existingFoldersUpdated: candidate.plan.counts.existingFolderAdditionCount, newFolders: candidate.plan.counts.newFolderCount, sourcesToAdd: candidate.plan.counts.newSourceCount }, { existingFoldersUpdated: 1, newFolders: 1, sourcesToAdd: 6 });
	const beforeRevision = controller.getState().revision;
	assert.equal(applyStreamingHierarchyPlan(controller, candidate.plan).ok, true);
	assert.equal(controller.getState().revision, beforeRevision + 1);
	assert.deepEqual(controller.getState().project.collections[0].folders.map((entry) => ({ title: entry.editable.title, sources: entry.sources.map((source) => source.editable.title) })), [
		{ title: "Netflix", sources: ["Movies (AU)", "Series (AU)", "Movies (US)", "Series (US)"] },
		{ title: "Disney+", sources: ["Movies (AU)", "Series (AU)", "Movies (US)", "Series (US)"] },
	]);
});

test("duplicate-title destinations retain overlap ranking and mutate only project-order Collection 2", () => {
	const controller = createController();
	const twoMatch = createDestination(controller, "Streaming Services");
	const twoFolder = createFolder(controller, twoMatch.createdInternalId, "Netflix AU");
	addDrafts(controller, twoFolder.createdInternalId, draftsFor(netflix, ["AU"], "both"));
	const fourMatch = createDestination(controller, "Streaming Services");
	const fourFolder = createFolder(controller, fourMatch.createdInternalId, "Netflix");
	addDrafts(controller, fourFolder.createdInternalId, draftsFor(netflix, ["AU", "US"], "both"));
	const oneMatch = createDestination(controller, "Streaming Services");
	const oneFolder = createFolder(controller, oneMatch.createdInternalId, "Disney+");
	addDrafts(controller, oneFolder.createdInternalId, draftsFor(disney, ["AU"], "movies"));
	const unrelatedFolder = createFolder(controller, oneMatch.createdInternalId, "Prime Video");
	addDrafts(controller, unrelatedFolder.createdInternalId, draftsFor(prime, ["AU"], "movies"));
	const inspected = inspectStreamingHierarchyDestinationCandidates(controller.getState().project, baseOptions(controller));

	assert.deepEqual(inspected.candidates.map((candidate) => [candidate.collectionInternalId, candidate.collectionTitle, candidate.matchingSourceCount]), [
		[fourMatch.createdInternalId, "Streaming Services", 4],
		[twoMatch.createdInternalId, "Streaming Services", 2],
		[oneMatch.createdInternalId, "Streaming Services", 1],
	]);
	const selected = inspected.candidates.find((candidate) => candidate.collectionInternalId === fourMatch.createdInternalId);
	const beforeOther = new Map(controller.getState().project.collections.filter((collectionEntry) => collectionEntry.internalId !== fourMatch.createdInternalId).map((collectionEntry) => [collectionEntry.internalId, JSON.stringify(collectionEntry)]));
	const beforeRevision = controller.getState().revision;
	assert.equal(applyStreamingHierarchyPlan(controller, selected.plan).ok, true);
	assert.equal(controller.getState().revision, beforeRevision + 1);
	assert.equal(controller.getState().project.collections[1].editable.title, "Streaming Services");
	for (const [internalId, serialized] of beforeOther) assert.equal(JSON.stringify(controller.getState().project.collections.find((collectionEntry) => collectionEntry.internalId === internalId)), serialized);
});

test("existing Streaming folder artwork stays exact while new folder artwork remains unassigned", () => {
	const controller = createController();
	const collection = createDestination(controller);
	const artwork = {
		coverImageUrl: "https://image.example/custom-cover.jpg",
		heroBackdropUrl: "https://image.example/custom-hero.jpg",
		titleLogoUrl: "https://image.example/custom-logo.png",
		focusGifUrl: "https://image.example/custom-focus.gif",
		focusGifEnabled: true,
	};
	const netflixFolder = createFolder(controller, collection.createdInternalId, "Custom Netflix", artwork);
	addDrafts(controller, netflixFolder.createdInternalId, draftsFor(netflix, ["AU"], "both"));
	const beforeEditable = structuredClone(controller.getState().project.collections[0].folders[0].editable);
	const planned = createStreamingHierarchyPlan(controller.getState().project, existingScopeOptions(controller, collection.createdInternalId));

	assert.equal(planned.ok, true);
	assert.deepEqual(planned.plan.newFolders.map((folder) => Object.keys(folder.editable).sort()), [["hideTitle", "tileShape", "title"]]);
	assert.equal(applyStreamingHierarchyPlan(controller, planned.plan).ok, true);
	const [existingFolder, newFolder] = controller.getState().project.collections[0].folders;
	assert.deepEqual(existingFolder.editable, beforeEditable);
	for (const [field, value] of Object.entries(artwork)) assert.equal(existingFolder.editable[field], value);
	for (const field of Object.keys(artwork)) assert.equal(Object.hasOwn(newFolder.editable, field), false, `${field} stays unassigned`);
});

test("complete safe destination is a zero-change plan while deliberate duplicate New Collection remains available", () => {
	const controller = createController();
	const collection = createDestination(controller, "Streaming Services");
	const folder = createFolder(controller, collection.createdInternalId, "Netflix");
	addDrafts(controller, folder.createdInternalId, draftsFor(netflix, ["AU"], "both"));
	const options = baseOptions(controller, { providers: [netflix], regions: [regions[0]], mediaChoice: "both" });
	const inspected = inspectStreamingHierarchyDestinationCandidates(controller.getState().project, options);
	const candidate = inspected.candidates[0];

	assert.equal(candidate.complete, true);
	assert.equal(candidate.plan.counts.newSourceCount, 0);
	const beforeRevision = controller.getState().revision;
	const noChangeApply = applyStreamingHierarchyPlan(controller, candidate.plan);
	assert.equal(noChangeApply.ok, false);
	assert.equal(noChangeApply.errors[0].code, "NO_STREAMING_HIERARCHY_CHANGES_READY");
	assert.equal(controller.getState().revision, beforeRevision);
	const duplicatePlan = createStreamingHierarchyPlan(controller.getState().project, { ...options, projectRevision: controller.getState().revision });
	assert.equal(duplicatePlan.plan.elsewhereEvidence.overlap, "complete");
	assert.equal(applyStreamingHierarchyPlan(controller, duplicatePlan.plan).ok, true);
	assert.equal(controller.getState().project.collections.length, 2);
});

test("unsafe matching collection remains raw elsewhere evidence but is not an automatic destination", () => {
	const controller = createController();
	const collection = createDestination(controller, "Mixed Streaming");
	const folder = createFolder(controller, collection.createdInternalId, "Mixed providers");
	addDrafts(controller, folder.createdInternalId, [draftsFor(netflix, ["AU"], "series")[0], draftsFor(disney, ["AU"], "movies")[0]]);
	const inspected = inspectStreamingHierarchyDestinationCandidates(controller.getState().project, baseOptions(controller, { providers: [netflix], regions: [regions[0]], mediaChoice: "both" }));

	assert.equal(inspected.elsewhereEvidence.matchedSourceCount, 1);
	assert.equal(inspected.candidates.length, 0);
});

test("safe candidate retains the existing same-slot different-Sort conflict and blocks mutation", () => {
	const controller = createController();
	const collection = createDestination(controller, "Streaming Services");
	const folder = createFolder(controller, collection.createdInternalId, "Netflix");
	addDrafts(controller, folder.createdInternalId, [draftsFor(netflix, ["AU"], "movies", { sortOptionId: "top-rated" })[0], draftsFor(netflix, ["AU"], "series")[0]]);
	const inspected = inspectStreamingHierarchyDestinationCandidates(controller.getState().project, baseOptions(controller, { providers: [netflix], regions: [regions[0]], mediaChoice: "both" }));
	const candidate = inspected.candidates[0];

	assert.equal(candidate.matchingSourceCount, 1);
	assert.equal(candidate.conflictCount, 1);
	assert.equal(candidate.plan.outcomes[0].status, STREAMING_HIERARCHY_PLACEMENT_STATUSES.SORT_CONFLICT);
	const beforeRevision = controller.getState().revision;
	assert.equal(applyStreamingHierarchyPlan(controller, candidate.plan).configurationConflict, true);
	assert.equal(controller.getState().revision, beforeRevision);
});

test("selected destination plan is stale-rejected if the collection becomes unsafe before Apply", () => {
	const controller = createController();
	const collection = createDestination(controller, "Streaming Services");
	const folder = createFolder(controller, collection.createdInternalId, "Netflix");
	addDrafts(controller, folder.createdInternalId, draftsFor(netflix, ["AU"], "series"));
	const inspected = inspectStreamingHierarchyDestinationCandidates(controller.getState().project, baseOptions(controller, { providers: [netflix], regions: [regions[0]], mediaChoice: "both" }));
	const reviewedPlan = inspected.candidates[0].plan;
	addDrafts(controller, folder.createdInternalId, draftsFor(disney, ["AU"], "movies"));
	const before = controller.getState();
	const applied = applyStreamingHierarchyPlan(controller, reviewedPlan);

	assert.equal(applied.ok, false);
	assert.equal(applied.stale, true);
	assert.equal(controller.getState().revision, before.revision);
	assert.equal(controller.getState().project, before.project);
});

test("destination planning applies custom folder drafts only to logical folders still new", () => {
	const controller = createController();
	const collection = createDestination(controller, "Streaming Services");
	const folder = createFolder(controller, collection.createdInternalId, "Imported Netflix title");
	addDrafts(controller, folder.createdInternalId, draftsFor(netflix, ["AU"], "both"));
	const overrides = { "8": "Custom Netflix", "337": "Custom Disney" };
	const options = baseOptions(controller, { regions: [regions[0]], folderTitleOverrides: overrides });
	const inspected = inspectStreamingHierarchyDestinationCandidates(controller.getState().project, options);
	const existingPlan = inspected.candidates[0].plan;
	const newPlan = createStreamingHierarchyPlan(controller.getState().project, options);

	assert.deepEqual(inspected.logicalFolderKeys, ["8", "337"]);
	assert.deepEqual(existingPlan.configuration.folderTitleOverrides, { "337": "Custom Disney" });
	assert.equal(existingPlan.outcomes[0].folderTitle, "Imported Netflix title");
	assert.equal(existingPlan.newFolders[0].editable.title, "Custom Disney");
	assert.deepEqual(newPlan.plan.configuration.folderTitleOverrides, overrides);
	assert.deepEqual(newPlan.plan.newFolders.map((plannedFolder) => plannedFolder.editable.title), ["Custom Netflix", "Custom Disney"]);
});

test("new separate-by-region hierarchy creates provider-major region folders with local source names", () => {
	const controller = createController();
	const result = createStreamingHierarchyPlan(controller.getState().project, baseOptions(controller, { groupingMode: "separate-by-region" }));
	assert.equal(result.ok, true);
	assert.equal(result.plan.counts.folderCount, 4);
	assert.equal(result.plan.counts.sourceCount, 8);
	assert.deepEqual(result.plan.collections[0].folders.map((folder) => folder.editable.title), ["Netflix (AU)", "Netflix (US)", "Disney+ (AU)", "Disney+ (US)"]);
	assert.deepEqual(result.plan.collections[0].folders.map((folder) => folder.sources.map((entry) => entry.draft.editable.title)), [["Movies", "Series"], ["Movies", "Series"], ["Movies", "Series"], ["Movies", "Series"]]);
});

test("custom grouped and separate-region folder titles change display only and retain deterministic source identity", () => {
	const groupedController = createController();
	const grouped = createStreamingHierarchyPlan(groupedController.getState().project, baseOptions(groupedController, { providers: [netflix], folderTitleOverrides: { "8": "My Netflix" } }));
	assert.equal(grouped.ok, true);
	assert.equal(grouped.plan.newFolders[0].generatedTitle, "Netflix");
	assert.equal(grouped.plan.newFolders[0].editable.title, "My Netflix");
	const groupedSourceBefore = grouped.plan.newFolders[0].sources[0].draft.editable;
	assert.equal(applyStreamingHierarchyPlan(groupedController, grouped.plan).ok, true);
	const groupedFolder = groupedController.getState().project.collections[0].folders[0];
	assert.equal(groupedFolder.editable.title, "My Netflix");
	assert.deepEqual(groupedFolder.sources[0].editable, groupedSourceBefore);

	const separateController = createController();
	const separate = createStreamingHierarchyPlan(separateController.getState().project, baseOptions(separateController, { providers: [netflix], groupingMode: "separate-by-region", folderTitleOverrides: { "8|AU": "Netflix Australia", "8|US": "Netflix USA" } }));
	assert.equal(separate.ok, true);
	assert.deepEqual(separate.plan.newFolders.map((folder) => folder.editable.title), ["Netflix Australia", "Netflix USA"]);
	assert.equal(applyStreamingHierarchyPlan(separateController, separate.plan).ok, true);
	assert.deepEqual(separateController.getState().project.collections[0].folders.map((folder) => ({ title: folder.editable.title, sources: folder.sources.map((source) => source.editable.title) })), [
		{ title: "Netflix Australia", sources: ["Movies", "Series"] },
		{ title: "Netflix USA", sources: ["Movies", "Series"] },
	]);
});

test("folder-name overrides reuse Folder title validation and discard removed logical keys", () => {
	const controller = createController();
	const invalid = createStreamingHierarchyPlan(controller.getState().project, baseOptions(controller, { providers: [netflix], folderTitleOverrides: { "8": "" } }));
	assert.equal(invalid.ok, false);
	assert.equal(invalid.errors[0].code, "INVALID_STREAMING_HIERARCHY_FOLDER_TITLE");
	const removed = createStreamingHierarchyPlan(controller.getState().project, baseOptions(controller, { providers: [netflix], folderTitleOverrides: { "8": "Kept", "337": "Removed with Disney" } }));
	assert.equal(removed.ok, true);
	assert.deepEqual(removed.plan.configuration.folderTitleOverrides, { "8": "Kept" });
	assert.equal(removed.plan.newFolders[0].editable.title, "Kept");
});

test("Streaming hidden collection and keyed folder drafts bypass only final visible-title validation", () => {
	const controller = createController();
	const hidden = createStreamingHierarchyPlan(controller.getState().project, baseOptions(controller, {
		collectionTitle: "",
		hideCollectionTitle: true,
		folderTitleVisibility: "HIDE_EVERYWHERE",
		folderTitleOverrides: { "8": "" },
		providers: [netflix],
	}));
	assert.equal(hidden.ok, true);
	assert.equal(hidden.plan.configuration.collectionTitle, "");
	assert.deepEqual(hidden.plan.configuration.folderTitleOverrides, { "8": "" });
	assert.equal(hidden.plan.collections[0].editable.title, NUVIO_INVISIBLE_TITLE);
	assert.equal(hidden.plan.newFolders[0].editable.title, NUVIO_INVISIBLE_TITLE);
	assert.equal(createStreamingHierarchyPlan(controller.getState().project, baseOptions(controller, { collectionTitle: "", providers: [netflix] })).ok, false);
	assert.equal(createStreamingHierarchyPlan(controller.getState().project, baseOptions(controller, { folderTitleOverrides: { "8": "" }, providers: [netflix] })).ok, false);
});

test("grouped plan atomically extends existing Netflix and creates Disney+", () => {
	const controller = createController();
	const collection = createDestination(controller);
	const netflixFolder = createFolder(controller, collection.createdInternalId, "Custom imported Netflix title");
	addDrafts(controller, netflixFolder.createdInternalId, draftsFor(netflix, ["AU"], "both"));
	const planResult = createStreamingHierarchyPlan(controller.getState().project, existingScopeOptions(controller, collection.createdInternalId));

	assert.equal(planResult.ok, true);
	assert.equal(planResult.plan.conflicts.length, 0);
	assert.equal(planResult.plan.newFolders.length, 1);
	assert.equal(planResult.plan.existingFolderAdditions.length, 1);
	assert.deepEqual(planResult.plan.existingFolderAdditions[0].sources.map((entry) => entry.draft.editable.title), ["Movies (US)", "Series (US)"]);
	const beforeRevision = controller.getState().revision;
	const applied = applyStreamingHierarchyPlan(controller, planResult.plan);
	assert.equal(applied.ok, true);
	assert.equal(controller.getState().revision, beforeRevision + 1);
	assert.deepEqual(controller.getState().project.collections[0].folders.map((folder) => folder.editable.title), ["Custom imported Netflix title", "Disney+"]);
	assert.deepEqual(controller.getState().project.collections[0].folders[0].sources.map((source) => source.editable.title), ["Movies (AU)", "Series (AU)", "Movies (US)", "Series (US)"]);
});

test("owner Apple TV AU to AU plus US and Dekkoo case reports and applies the exact atomic delta", () => {
	const controller = createController();
	const collection = createDestination(controller);
	const appleFolder = createFolder(controller, collection.createdInternalId, "Apple TV");
	addDrafts(controller, appleFolder.createdInternalId, draftsFor(appleTv, ["AU"], "both"));
	const planResult = createStreamingHierarchyPlan(controller.getState().project, existingScopeOptions(controller, collection.createdInternalId, { providers: [appleTv, dekkoo] }));

	assert.equal(planResult.ok, true);
	assert.deepEqual({ existingFoldersUpdated: planResult.plan.counts.existingFolderAdditionCount, newFolders: planResult.plan.counts.newFolderCount, sourcesToAdd: planResult.plan.counts.newSourceCount }, { existingFoldersUpdated: 1, newFolders: 1, sourcesToAdd: 6 });
	assert.deepEqual(planResult.plan.outcomes.map((outcome) => ({ provider: outcome.provider.name, status: outcome.status, complete: outcome.sources.filter((source) => source.status === "complete").length, missing: outcome.sources.filter((source) => source.status === "missing").length })), [
		{ provider: "Apple TV", status: STREAMING_HIERARCHY_PLACEMENT_STATUSES.EXTEND_FOLDER, complete: 2, missing: 2 },
		{ provider: "Dekkoo", status: STREAMING_HIERARCHY_PLACEMENT_STATUSES.NEW_FOLDER, complete: 0, missing: 4 },
	]);
	const beforeRevision = controller.getState().revision;
	assert.equal(applyStreamingHierarchyPlan(controller, planResult.plan).ok, true);
	assert.equal(controller.getState().revision, beforeRevision + 1);
	assert.deepEqual(controller.getState().project.collections[0].folders.map((folder) => ({ title: folder.editable.title, sources: folder.sources.map((source) => source.editable.title) })), [
		{ title: "Apple TV", sources: ["Movies (AU)", "Series (AU)", "Movies (US)", "Series (US)"] },
		{ title: "Dekkoo", sources: ["Movies (AU)", "Series (AU)", "Movies (US)", "Series (US)"] },
	]);
});

test("grouped plan extends multiple partial provider folders through one controller batch", () => {
	const controller = createController();
	const collection = createDestination(controller);
	const netflixFolder = createFolder(controller, collection.createdInternalId, "Netflix custom");
	const disneyFolder = createFolder(controller, collection.createdInternalId, "Disney custom");
	addDrafts(controller, netflixFolder.createdInternalId, draftsFor(netflix, ["AU"], "both"));
	addDrafts(controller, disneyFolder.createdInternalId, draftsFor(disney, ["AU"], "movies"));
	const result = createStreamingHierarchyPlan(controller.getState().project, existingScopeOptions(controller, collection.createdInternalId));

	assert.equal(result.ok, true);
	assert.equal(result.plan.existingFolderAdditions.length, 2);
	assert.deepEqual(result.plan.existingFolderAdditions.map((entry) => entry.sources.length), [2, 3]);
	assert.deepEqual({ existingFoldersUpdated: result.plan.counts.existingFolderAdditionCount, newFolders: result.plan.counts.newFolderCount, sourcesToAdd: result.plan.counts.newSourceCount }, { existingFoldersUpdated: 2, newFolders: 0, sourcesToAdd: 5 });
	const beforeRevision = controller.getState().revision;
	assert.equal(applyStreamingHierarchyPlan(controller, result.plan).ok, true);
	assert.equal(controller.getState().revision, beforeRevision + 1);
	assert.deepEqual(controller.getState().project.collections[0].folders.map((folder) => folder.sources.length), [4, 4]);
});

test("new-folder naming customises only new logical folders and preserves reused imported titles", () => {
	const controller = createController();
	const collection = createDestination(controller);
	const imported = createFolder(controller, collection.createdInternalId, "Imported Apple TV title");
	addDrafts(controller, imported.createdInternalId, draftsFor(appleTv, ["AU"], "both"));
	const result = createStreamingHierarchyPlan(controller.getState().project, existingScopeOptions(controller, collection.createdInternalId, {
		providers: [appleTv, dekkoo],
		folderTitleOverrides: { "2": "Must not rename reused folder", "444": "My Dekkoo" },
	}));
	assert.equal(result.ok, true);
	assert.deepEqual(result.plan.configuration.folderTitleOverrides, { "444": "My Dekkoo" });
	assert.equal(result.plan.newFolders[0].editable.title, "My Dekkoo");
	const beforeRevision = controller.getState().revision;
	assert.equal(applyStreamingHierarchyPlan(controller, result.plan).ok, true);
	assert.equal(controller.getState().revision, beforeRevision + 1);
	assert.deepEqual(controller.getState().project.collections[0].folders.map((folder) => folder.editable.title), ["Imported Apple TV title", "My Dekkoo"]);
});

test("separate-by-region plan mixes one trusted existing folder with three new folders", () => {
	const controller = createController();
	const collection = createDestination(controller);
	const netflixAu = createFolder(controller, collection.createdInternalId, "Do not trust this title");
	addDrafts(controller, netflixAu.createdInternalId, draftsFor(netflix, ["AU"], "movies", { context: STREAMING_SOURCE_NAME_CONTEXTS.SEPARATE_BY_REGION }));
	const result = createStreamingHierarchyPlan(controller.getState().project, existingScopeOptions(controller, collection.createdInternalId, { groupingMode: "separate-by-region" }));

	assert.equal(result.ok, true);
	assert.equal(result.plan.newFolders.length, 3);
	assert.equal(result.plan.existingFolderAdditions.length, 1);
	assert.deepEqual(result.plan.newFolders.map((folder) => folder.editable.title), ["Netflix (US)", "Disney+ (AU)", "Disney+ (US)"]);
	const beforeRevision = controller.getState().revision;
	assert.equal(applyStreamingHierarchyPlan(controller, result.plan).ok, true);
	assert.equal(controller.getState().revision, beforeRevision + 1);
	assert.equal(controller.getState().project.collections[0].folders[0].sources.length, 2);
});

test("folder titles alone never establish Streaming placement identity", () => {
	const controller = createController();
	const collection = createDestination(controller);
	createFolder(controller, collection.createdInternalId, "Netflix");
	const result = createStreamingHierarchyPlan(controller.getState().project, existingScopeOptions(controller, collection.createdInternalId, { providers: [netflix] }));
	assert.equal(result.ok, true);
	assert.equal(result.plan.newFolders.length, 1);
	assert.equal(result.plan.existingFolderAdditions.length, 0);
});

test("mixed provider and opaque Streaming evidence fail closed", () => {
	for (const kind of ["mixed-provider", "opaque-streaming"]) {
		const controller = createController();
		const collection = createDestination(controller);
		const folder = createFolder(controller, collection.createdInternalId, "Ambiguous");
		addDrafts(controller, folder.createdInternalId, draftsFor(netflix, ["AU"], "movies"));
		if (kind === "mixed-provider") addDrafts(controller, folder.createdInternalId, draftsFor(disney, ["AU"], "movies"));
		else controller.createSource(folder.createdInternalId, {
			category: "native-tmdb",
			editable: { title: "Advanced Streaming", provider: "tmdb", tmdbSourceType: "DISCOVER", mediaType: "MOVIE", sortBy: "popularity.desc", tmdbId: null, filters: { watchRegion: "AU", withWatchProviders: "8", withGenres: "28" } },
		});
		const result = createStreamingHierarchyPlan(controller.getState().project, existingScopeOptions(controller, collection.createdInternalId, { providers: [netflix] }));
		assert.equal(result.ok, true, kind);
		assert.equal(result.plan.conflicts[0].code, "AMBIGUOUS_STREAMING_HIERARCHY_PLACEMENT", kind);
		assert.equal(result.plan.outcomes[0].status, STREAMING_HIERARCHY_PLACEMENT_STATUSES.AMBIGUOUS, kind);
		const before = controller.getState().project;
		assert.equal(applyStreamingHierarchyPlan(controller, result.plan).ok, false, kind);
		assert.equal(controller.getState().project, before, kind);
	}
});

test("same provider-region-media slot with a different Sort blocks automatic Apply", () => {
	const controller = createController();
	const collection = createDestination(controller);
	const folder = createFolder(controller, collection.createdInternalId, "Netflix");
	addDrafts(controller, folder.createdInternalId, draftsFor(netflix, ["AU"], "movies", { sortOptionId: "top-rated" }));
	const result = createStreamingHierarchyPlan(controller.getState().project, existingScopeOptions(controller, collection.createdInternalId, { providers: [netflix], regions: [regions[0]], mediaChoice: "movies" }));

	assert.equal(result.ok, true);
	assert.equal(result.plan.conflicts[0].code, "STREAMING_HIERARCHY_SORT_CONFLICT");
	assert.equal(result.plan.outcomes[0].status, STREAMING_HIERARCHY_PLACEMENT_STATUSES.SORT_CONFLICT);
	const beforeRevision = controller.getState().revision;
	assert.equal(applyStreamingHierarchyPlan(controller, result.plan).configurationConflict, true);
	assert.equal(controller.getState().revision, beforeRevision);
});

test("exact matches elsewhere are informational and do not relocate or suppress destination creation", () => {
	const controller = createController();
	const destination = createDestination(controller, "Destination");
	const elsewhereCollection = createDestination(controller, "Elsewhere");
	const elsewhereFolder = createFolder(controller, elsewhereCollection.createdInternalId, "Netflix elsewhere");
	addDrafts(controller, elsewhereFolder.createdInternalId, draftsFor(netflix, ["AU"], "movies"));
	const result = createStreamingHierarchyPlan(controller.getState().project, existingScopeOptions(controller, destination.createdInternalId, { providers: [netflix], regions: [regions[0]], mediaChoice: "movies" }));

	assert.equal(result.ok, true);
	assert.equal(result.plan.newFolders.length, 1);
	assert.equal(result.plan.newFolders[0].sources[0].elsewhere.length, 1);
});

test("stale Streaming plans are rebuilt and rejected before mutation", () => {
	const controller = createController();
	const collection = createDestination(controller);
	const result = createStreamingHierarchyPlan(controller.getState().project, existingScopeOptions(controller, collection.createdInternalId, { providers: [netflix], regions: [regions[0]], mediaChoice: "movies" }));
	assert.equal(result.ok, true);
	const newFolder = createFolder(controller, collection.createdInternalId, "Imported placement");
	addDrafts(controller, newFolder.createdInternalId, draftsFor(netflix, ["AU"], "movies"));
	const before = controller.getState();
	const applied = applyStreamingHierarchyPlan(controller, result.plan);
	assert.equal(applied.ok, false);
	assert.equal(applied.stale, true);
	assert.equal(controller.getState().revision, before.revision);
	assert.equal(controller.getState().project, before.project);
});

test("new collection Streaming plan applies through the existing full-hierarchy controller path", () => {
	const controller = createController();
	const result = createStreamingHierarchyPlan(controller.getState().project, baseOptions(controller, { providers: [netflix], regions: [regions[0]] }));
	const beforeRevision = controller.getState().revision;
	const applied = applyStreamingHierarchyPlan(controller, result.plan);
	assert.equal(applied.ok, true);
	assert.equal(controller.getState().revision, beforeRevision + 1);
	assert.deepEqual(controller.getState().project.collections[0].folders[0].sources.map((source) => source.editable.title), ["Movies (AU)", "Series (AU)"]);
});
