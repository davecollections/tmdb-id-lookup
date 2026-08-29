import assert from "node:assert/strict";
import test from "node:test";

import { createBuilderController } from "../builder/src/application/index.js";
import {
	buildDecadeSourceBundleDrafts,
	buildGenreSourceDrafts,
	buildMovieFranchiseSourceDraft,
	buildNetworkSourceDraft,
	buildPeopleSourceDrafts,
	buildStreamingSourceDrafts,
	buildStudioSourceDrafts,
	createDecadeSourceBundle,
	createGenreSourceBundle,
	createMovieFranchiseSource,
	createNetworkSource,
	createPeopleSourceBundle,
	createStreamingSourceBundle,
	createStudioSourceBundle,
	requestSourceTitlePreview,
	sourceTitlePreviewProviderAvailable,
	sourceTitlePreviewRequest,
} from "../builder/src/source-add/index.js";

function streamingProvider() {
	return {
		id: 8,
		name: "Netflix",
		moviePriorities: { AU: 1, US: 2 },
		tvPriorities: { AU: 1, US: 2 },
	};
}

function countingIdFactory(prefix) {
	let count = 0;
	return () => `${prefix}-${++count}`;
}

function selectedFolderController() {
	const controller = createBuilderController({
		idFactory: countingIdFactory("internal"),
		nuvioIdFactory: countingIdFactory("nuvio"),
		initialProjectTitle: "Preview parity",
	});
	const imported = controller.importValue([{
		id: "collection",
		title: "Collection",
		folders: [{ id: "folder", title: "Named folder", sources: [], catalogSources: [] }],
	}]);
	assert.equal(imported.ok, true);
	const folder = controller.getState().project.collections[0].folders[0];
	assert.equal(controller.selectNode(folder.internalId).ok, true);
	return { controller, folderInternalId: folder.internalId };
}

function previewProviders() {
	const emptyPreview = Object.freeze({ ok: true, data: Object.freeze({ results: Object.freeze([]), totalResults: 0 }) });
	return {
		collection: {
			getCollection: async (id) => ({
				ok: true,
				data: { movieCount: 1, containedTitles: [{ id: id + 1, title: "Contained", posterPath: "/contained.jpg" }] },
			}),
		},
		people: {
			getPerson: async (id) => ({ ok: true, data: { id, combinedCredits: { cast: [], crew: [] } } }),
		},
		studio: { getStudioPreview: async () => emptyPreview },
		network: { getNetworkPreview: async () => emptyPreview },
		streaming: { getStreamingPreview: async () => emptyPreview },
		genre: { getGenrePreview: async () => emptyPreview },
		decade: { getDecadePreview: async () => emptyPreview },
	};
}

test("ordinary Add Source Preview requests are projections of the exact canonical Save drafts in Save order", () => {
	const movie = buildMovieFranchiseSourceDraft({ id: 10, name: "Saga" }, "Custom Saga").draft;
	const people = buildPeopleSourceDrafts(
		{ id: 31, name: "Person" },
		{ combinations: ["acting-movies", "acting-series", "directing-movies", "directing-series"], sortOptionId: "recent" },
	).drafts;
	const studio = buildStudioSourceDrafts(
		{ id: 3, name: "Studio" },
		{ choices: ["studio-movies", "studio-series"], sortOptionId: "top-rated" },
	).drafts;
	const network = buildNetworkSourceDraft({ id: 2, name: "Network" }, { sortOptionId: "recent" }).draft;
	const streaming = buildStreamingSourceDrafts(streamingProvider(), {
		regionCodes: ["US", "AU"],
		mediaChoice: "both",
		sortOptionId: "most-votes",
		sourceTitles: { "US|MOVIE": "Custom US movies" },
	}).drafts;
	const genre = buildGenreSourceDrafts(["Comedy", "Horror"], { sharedMediaChoice: "both", sortOptionId: "top-rated" }).drafts;
	const decade = buildDecadeSourceBundleDrafts({ periodId: "1980s", mediaMode: "both", genreNames: [], sortOptionId: "popular", advanced: {} }).drafts;
	const before = JSON.stringify({ movie, people, studio, network, streaming, genre, decade });

	assert.deepEqual(sourceTitlePreviewRequest("collection", movie), {
		kind: "collection", mediaType: "MOVIE", label: "Custom Saga", tmdbId: 10,
	});
	assert.deepEqual(people.map((draft) => sourceTitlePreviewRequest("people", draft).combinationId), [
		"acting-movies", "acting-series", "directing-movies", "directing-series",
	]);
	assert.deepEqual(studio.map((draft) => sourceTitlePreviewRequest("studio", draft).mediaType), ["MOVIE", "TV"]);
	assert.equal(sourceTitlePreviewRequest("network", network).sortBy, network.editable.sortBy);
	assert.deepEqual(streaming.map((draft) => {
		const request = sourceTitlePreviewRequest("streaming", draft);
		assert.equal(request.sourceNode.editable, draft.editable);
		return [request.sourceNode.editable.filters.watchRegion, request.mediaType, request.label];
	}), [
		["US", "MOVIE", "Custom US movies"],
		["US", "TV", "Netflix Series (US)"],
		["AU", "MOVIE", "Netflix Movies (AU)"],
		["AU", "TV", "Netflix Series (AU)"],
	]);
	for (const draft of genre) assert.equal(sourceTitlePreviewRequest("genre", draft).sourceDraft, draft);
	for (const draft of decade) assert.equal(sourceTitlePreviewRequest("decade", draft).sourceDraft, draft);
	assert.equal(JSON.stringify({ movie, people, studio, network, streaming, genre, decade }), before);
});

test("the shared Preview executor delegates exact detached drafts without mutation", async () => {
	const streamingDraft = buildStreamingSourceDrafts(streamingProvider(), { regionCodes: ["AU"], mediaChoice: "movies" }).drafts[0];
	const genreDraft = buildGenreSourceDrafts(["Comedy"], { sharedMediaChoice: "movies" }).drafts[0];
	const decadeDraft = buildDecadeSourceBundleDrafts({ periodId: "1980s", mediaMode: "movies", genreNames: [], sortOptionId: "popular", advanced: {} }).drafts[0];
	const calls = [];
	const providers = {
		collection: { getCollection: async (id) => ({ ok: true, data: { movieCount: 1, containedTitles: [{ id: id + 1, title: "Contained", posterPath: "/contained.jpg" }] } }) },
		studio: { getStudioPreview: async (id, options) => { calls.push(["studio", id, options.mediaType, options.sortBy]); return { ok: true, data: { results: [] } }; } },
		network: { getNetworkPreview: async (id, options) => { calls.push(["network", id, options.sortBy]); return { ok: true, data: { results: [] } }; } },
		streaming: { getStreamingPreview: async (sourceNode) => { calls.push(["streaming", sourceNode]); return { ok: true, data: { results: [] } }; } },
		genre: { getGenrePreview: async (draft) => { calls.push(["genre", draft]); return { ok: true, data: { results: [] } }; } },
		decade: { getDecadePreview: async (draft) => { calls.push(["decade", draft]); return { ok: true, data: { results: [] } }; } },
	};
	const before = JSON.stringify({ streamingDraft, genreDraft, decadeDraft });
	const collectionDraft = buildMovieFranchiseSourceDraft({ id: 10, name: "Saga" }).draft;
	const collectionResult = await requestSourceTitlePreview(sourceTitlePreviewRequest("collection", collectionDraft), providers);
	assert.equal(collectionResult.data.results[0].title, "Contained");
	await requestSourceTitlePreview(sourceTitlePreviewRequest("streaming", streamingDraft), providers);
	await requestSourceTitlePreview(sourceTitlePreviewRequest("genre", genreDraft), providers);
	await requestSourceTitlePreview(sourceTitlePreviewRequest("decade", decadeDraft), providers);
	assert.equal(calls[0][1].editable, streamingDraft.editable);
	assert.equal(calls[1][1], genreDraft);
	assert.equal(calls[2][1], decadeDraft);
	assert.equal(JSON.stringify({ streamingDraft, genreDraft, decadeDraft }), before);
	assert.equal(sourceTitlePreviewProviderAvailable(sourceTitlePreviewRequest("genre", genreDraft), providers), true);
	assert.equal(sourceTitlePreviewProviderAvailable(sourceTitlePreviewRequest("people", buildPeopleSourceDrafts({ id: 31, name: "Person" }, { combinations: ["acting-movies"] }).drafts[0]), providers), false);
});

test("configure, Preview, close, then Save is semantically identical to direct Save for every ordinary source family", async () => {
	const person = { id: 31, name: "Person" };
	const studio = { id: 3, name: "Studio" };
	const network = { id: 2, name: "Network" };
	const provider = streamingProvider();
	const regions = [{ code: "AU", name: "Australia" }];
	const movieDrafts = [buildMovieFranchiseSourceDraft({ id: 10, name: "Saga" }, "Custom Saga").draft];
	const peopleDrafts = buildPeopleSourceDrafts(person, {
		combinations: ["acting-movies", "acting-series", "directing-movies", "directing-series"],
		sortOptionId: "recent",
	}).drafts;
	const studioDrafts = buildStudioSourceDrafts(studio, {
		choices: ["studio-movies", "studio-series"],
		sortOptionId: "top-rated",
	}).drafts;
	const networkDrafts = [buildNetworkSourceDraft(network, { sortOptionId: "recent" }).draft];
	const streamingDrafts = buildStreamingSourceDrafts(provider, {
		regionCodes: ["AU"],
		mediaChoice: "both",
		sortOptionId: "most-votes",
		sourceTitles: { "AU|MOVIE": "Custom AU movies" },
	}).drafts;
	const genreDrafts = buildGenreSourceDrafts(["Comedy", "Horror"], {
		sharedMediaChoice: "both",
		sortOptionId: "top-rated",
	}).drafts;
	const decadeConfiguration = {
		periodId: "1980s",
		mediaMode: "both",
		genreNames: [],
		sortOptionId: "popular",
		advanced: {},
	};
	const decadeDrafts = buildDecadeSourceBundleDrafts(decadeConfiguration).drafts;
	const scenarios = [
		{
			name: "Movie franchise",
			kind: "collection",
			drafts: movieDrafts,
			save: (controller, folderInternalId) => createMovieFranchiseSource(controller, { folderInternalId, draft: movieDrafts[0] }),
		},
		{
			name: "People",
			kind: "people",
			drafts: peopleDrafts,
			save: (controller, folderInternalId) => createPeopleSourceBundle(controller, {
				destination: { kind: "existing-folder", folderInternalId }, person, drafts: peopleDrafts,
			}),
		},
		{
			name: "Studio",
			kind: "studio",
			drafts: studioDrafts,
			save: (controller, folderInternalId) => createStudioSourceBundle(controller, { folderInternalId, studio, drafts: studioDrafts }),
		},
		{
			name: "Network",
			kind: "network",
			drafts: networkDrafts,
			save: (controller, folderInternalId) => createNetworkSource(controller, {
				folderInternalId, network, draft: networkDrafts[0],
			}),
		},
		{
			name: "Streaming",
			kind: "streaming",
			drafts: streamingDrafts,
			save: (controller, folderInternalId) => createStreamingSourceBundle(controller, {
				folderInternalId,
				provider,
				regions,
				catalogueRegions: regions,
				mediaChoice: "both",
				sortOptionId: "most-votes",
				drafts: streamingDrafts,
			}),
		},
		{
			name: "Genre",
			kind: "genre",
			drafts: genreDrafts,
			save: (controller, folderInternalId) => createGenreSourceBundle(controller, {
				folderInternalId,
				genres: ["Comedy", "Horror"],
				sharedMediaChoice: "both",
				sortOptionId: "top-rated",
				drafts: genreDrafts,
			}),
		},
		{
			name: "Decade",
			kind: "decade",
			drafts: decadeDrafts,
			save: (controller, folderInternalId) => createDecadeSourceBundle(controller, {
				folderInternalId, ...decadeConfiguration, drafts: decadeDrafts,
			}),
		},
	];
	const providers = previewProviders();

	for (const scenario of scenarios) {
		const direct = selectedFolderController();
		const previewThenSave = selectedFolderController();
		const beforePreview = previewThenSave.controller.getState();
		const beforeDrafts = JSON.stringify(scenario.drafts);

		for (const draft of scenario.drafts) {
			const request = sourceTitlePreviewRequest(scenario.kind, draft);
			assert.equal(sourceTitlePreviewProviderAvailable(request, providers), true, scenario.name);
			assert.equal((await requestSourceTitlePreview(request, providers)).ok, true, scenario.name);
		}

		assert.equal(previewThenSave.controller.getState(), beforePreview, `${scenario.name} Preview mutated controller state`);
		assert.equal(JSON.stringify(scenario.drafts), beforeDrafts, `${scenario.name} Preview mutated canonical drafts`);
		assert.equal(scenario.save(direct.controller, direct.folderInternalId).ok, true, `${scenario.name} direct Save`);
		assert.equal(scenario.save(previewThenSave.controller, previewThenSave.folderInternalId).ok, true, `${scenario.name} Save after Preview close`);
		assert.deepEqual(previewThenSave.controller.getState(), direct.controller.getState(), `${scenario.name} persisted state`);
	}
});

test("ordinary Add Source flows expose the shared dialog while Decade remains on its proven Preview implementation", async () => {
	const { readFile } = await import("node:fs/promises");
	const files = {
		movie: await readFile(new URL("../builder/src/ui/AddSourceDialog.jsx", import.meta.url), "utf8"),
		people: await readFile(new URL("../builder/src/ui/PeopleSourceFlow.jsx", import.meta.url), "utf8"),
		studio: await readFile(new URL("../builder/src/ui/StudioSourceFlow.jsx", import.meta.url), "utf8"),
		network: await readFile(new URL("../builder/src/ui/NetworkSourceFlow.jsx", import.meta.url), "utf8"),
		streaming: await readFile(new URL("../builder/src/ui/StreamingSourceFlow.jsx", import.meta.url), "utf8"),
		genre: await readFile(new URL("../builder/src/ui/GenreSourceFlow.jsx", import.meta.url), "utf8"),
		decade: await readFile(new URL("../builder/src/ui/DecadeSourceFlow.jsx", import.meta.url), "utf8"),
	};
	for (const family of ["movie", "people", "studio", "network", "streaming", "genre"]) {
		assert.match(files[family], /SourceTitlePreviewDialog/);
		assert.match(files[family], /Preview titles/);
	}
	assert.match(files.people, /quickEntry\.drafts\.drafts/);
	assert.match(files.studio, /allDraftResult\.drafts/);
	assert.match(files.streaming, /draftResult\.drafts/);
	assert.match(files.genre, /const drafts = built\.ok \? built\.drafts/);
	assert.doesNotMatch(files.decade, /SourceTitlePreviewDialog/);
	assert.match(files.decade, /NestedPreviewDialog/);
	assert.match(files.decade, /PosterOnlyPreviewGrid/);
});
