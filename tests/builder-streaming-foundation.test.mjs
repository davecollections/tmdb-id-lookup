import assert from "node:assert/strict";
import test from "node:test";

import { createBuilderController } from "../builder/src/application/index.js";
import { discoverSortValue, discoverSourceIdentity, discoverSourceNodeIdentity } from "../builder/src/nuvio/discover.js";
import {
	browseStreamingRegions,
	browseStreamingProviders,
	buildStreamingSourceDrafts,
	createStreamingCatalogueProvider,
	createStreamingSourceBundle,
	defaultStreamingMediaChoice,
	defaultStreamingSourceName,
	eligibleStreamingProviders,
	inspectStreamingSourceDuplicates,
	normalizeStreamingCatalogue,
	reconcileStreamingSourceTitles,
	searchStreamingProviders,
	searchStreamingRegions,
	streamingDuplicateOverrideIdentity,
	streamingMediaChoiceSupport,
	streamingSourceCandidateKey,
	streamingSourceTitleDraftKey,
	streamingSourceTitlesForProvider,
	streamingProviderAvailability,
	streamingProviderCommonAvailability,
	STREAMING_COMMON_REGION_CODES,
	STREAMING_PROVIDER_BROWSE_MODES,
	STREAMING_REGION_BROWSE_MODES,
	STREAMING_SORT_OPTIONS,
	STREAMING_TOP_PROVIDER_COUNT,
	validateStreamingSourceDrafts,
} from "../builder/src/source-add/index.js";
import { serializeNuvioProject } from "../builder/src/serialize/index.js";

function countingIdFactory(prefix = "builder") {
	let count = 0;
	return () => `${prefix}-${++count}`;
}

function responses() {
	return {
		regions: {
			results: [
				{ iso_3166_1: "US", english_name: "United States", native_name: "United States" },
				{ iso_3166_1: "AU", english_name: "Australia", native_name: "Australia" },
				{ iso_3166_1: "GB", english_name: "United Kingdom" },
				{ iso_3166_1: "bad", english_name: "Invalid" },
			],
		},
		movie: {
			results: [
				{ provider_id: 8, provider_name: "Netflix", logo_path: "/netflix.jpg", display_priority: 0, display_priorities: { AU: 4, US: 1 } },
				{ provider_id: 9, provider_name: "Prime Video", logo_path: null, display_priority: 2, display_priorities: { AU: 1, US: 2 } },
				{ provider_id: 10, provider_name: "Netflix Kids", logo_path: "/kids.png", display_priority: null, display_priorities: { AU: 2 } },
				{ provider_id: 11, provider_name: "Movie Only", logo_path: "bad-path", display_priority: 5, display_priorities: { AU: 0 } },
				{ provider_id: 14, provider_name: "Common Both", logo_path: null, display_priority: 90, display_priorities: { AU: 5, US: 5 } },
				{ provider_id: 15, provider_name: "Split Media", logo_path: null, display_priority: 1, display_priorities: { AU: 0 } },
				{ provider_id: 16, provider_name: "Missing Priority", logo_path: null, display_priority: 1, display_priorities: { AU: "bad" } },
				{ provider_id: 0, provider_name: "Invalid", display_priorities: { AU: 0 } },
			],
		},
		tv: {
			results: [
				{ provider_id: 8, provider_name: "Netflix", logo_path: "/netflix.jpg", display_priority: 999, display_priorities: { AU: 3, US: 2, GB: 1 } },
				{ provider_id: 9, provider_name: "Prime Video", logo_path: "/prime.png", display_priority: 2, display_priorities: { US: 2 } },
				{ provider_id: 12, provider_name: "Series Only", display_priority: 3, display_priorities: { AU: 5 } },
				{ provider_id: 13, provider_name: "Common Series", display_priority: 4, display_priorities: { AU: 4, US: 4 } },
				{ provider_id: 14, provider_name: "Common Both", display_priority: 2, display_priorities: { AU: 6, US: 6 } },
				{ provider_id: 15, provider_name: "Split Media", display_priority: 1, display_priorities: { US: 0 } },
			],
		},
	};
}

function catalogue() {
	const value = responses();
	return normalizeStreamingCatalogue(value.regions, value.movie, value.tv);
}

function provider(id = 8) {
	return catalogue().providers.find((entry) => entry.id === id);
}

function knownRegions(...codes) {
	const names = { AU: "Australia", GB: "United Kingdom", US: "United States" };
	return codes.map((code) => ({ code, name: names[code] ?? "Unknown" }));
}

function jsonResponse(value, { status = 200 } = {}) {
	return {
		ok: status >= 200 && status < 300,
		status,
		headers: { get() { return "application/json"; } },
		async json() { return value; },
	};
}

function selectedFolderController({ sources = [], twoFolders = false, idFactory = countingIdFactory() } = {}) {
	const controller = createBuilderController({
		idFactory,
		nuvioIdFactory: countingIdFactory("nuvio"),
		initialProjectTitle: "Streaming tests",
	});
	const folders = [{ id: "streaming", title: "Streaming", sources, catalogSources: [], keepFolder: true }];
	if (twoFolders) folders.push({ id: "other", title: "Other", sources: [], catalogSources: [] });
	const imported = controller.importValue([{ id: "collection", title: "Movies and TV", folders, keepCollection: true }]);
	assert.equal(imported.ok, true);
	const folder = controller.getState().project.collections[0].folders[0];
	controller.selectNode(folder.internalId);
	return { controller, folder };
}

test("Streaming provider responses ignore global display_priority, preserve regional evidence and keep invalid regional priority as missing", () => {
	const normalized = catalogue();
	assert.deepEqual(normalized.regions, [
		{ code: "AU", name: "Australia" },
		{ code: "GB", name: "United Kingdom" },
		{ code: "US", name: "United States" },
	]);
	assert.equal(normalized.providers.length, 9);
	assert.deepEqual(provider(8), {
		id: 8,
		name: "Netflix",
		searchName: "netflix",
		logoPath: "/netflix.jpg",
		moviePriorities: { AU: 4, US: 1 },
		tvPriorities: { AU: 3, US: 2, GB: 1 },
	});
	assert.equal(Object.hasOwn(provider(8), "displayPriority"), false);
	assert.equal(provider(9).logoPath, "/prime.png");
	assert.equal(provider(11).logoPath, null);
	assert.deepEqual(streamingProviderAvailability(provider(11), "AU"), {
		movies: true, series: false, moviePriority: 0, tvPriority: null, priority: 0,
	});
	assert.deepEqual(streamingProviderAvailability(provider(12), "AU"), {
		movies: false, series: true, moviePriority: null, tvPriority: 5, priority: 5,
	});
	assert.deepEqual(provider(16).moviePriorities, { AU: null });
	assert.deepEqual(streamingProviderAvailability(provider(16), "AU"), {
		movies: true, series: false, moviePriority: null, tvPriority: null, priority: null,
	});
	assert.equal(normalizeStreamingCatalogue({}, responses().movie, responses().tv), null);
});

test("Streaming catalogue loads all three exact Worker paths once, caches only success, and retries failures", async () => {
	const fixture = responses();
	const byPath = new Map([
		["/3/watch/providers/regions", fixture.regions],
		["/3/watch/providers/movie", fixture.movie],
		["/3/watch/providers/tv", fixture.tv],
	]);
	const calls = [];
	const loader = createStreamingCatalogueProvider({
		baseUrl: "https://worker.example",
		fetchImpl: async (url) => {
			calls.push(url);
			return jsonResponse(byPath.get(new URL(url).pathname));
		},
	});
	const first = await loader.loadCatalogue();
	const cached = await loader.loadCatalogue();
	assert.equal(first.ok, true);
	assert.equal(first.fromCache, false);
	assert.equal(cached.fromCache, true);
	assert.equal(calls.length, 3);
	assert.deepEqual(calls.map((url) => new URL(url).pathname).sort(), [...byPath.keys()].sort());
	assert.ok(calls.every((url) => new URL(url).search === "?language=en-US"));

	let requestCount = 0;
	const retrying = createStreamingCatalogueProvider({
		baseUrl: "https://worker.example",
		fetchImpl: async (url) => {
			requestCount += 1;
			if (requestCount <= 3) return jsonResponse({}, { status: 503 });
			return jsonResponse(byPath.get(new URL(url).pathname));
		},
	});
	assert.equal((await retrying.loadCatalogue()).ok, false);
	assert.equal((await retrying.loadCatalogue()).ok, true);
	assert.equal(requestCount, 6);
});

test("a failed catalogue request aborts unfinished sibling signals before Retry starts", async () => {
	const fixture = responses();
	const byPath = new Map([
		["/3/watch/providers/regions", fixture.regions],
		["/3/watch/providers/movie", fixture.movie],
		["/3/watch/providers/tv", fixture.tv],
	]);
	const firstAttemptSignals = [];
	let calls = 0;
	const loader = createStreamingCatalogueProvider({
		baseUrl: "https://worker.example",
		fetchImpl(url, { signal }) {
			calls += 1;
			if (calls <= 3) {
				firstAttemptSignals.push(signal);
				if (calls === 1) return Promise.reject(new Error("first request failed"));
				return new Promise((resolve, reject) => {
					signal.addEventListener("abort", () => reject(new Error("sibling aborted")), { once: true });
				});
			}
			assert.ok(firstAttemptSignals.every((entry) => entry.aborted), "Retry started before every first-attempt signal was aborted");
			return Promise.resolve(jsonResponse(byPath.get(new URL(url).pathname)));
		},
	});
	assert.equal((await loader.loadCatalogue()).error.kind, "network");
	assert.equal(firstAttemptSignals.length, 3);
	assert.ok(firstAttemptSignals.every((signal) => signal.aborted));
	assert.equal((await loader.loadCatalogue()).ok, true);
	assert.equal(calls, 6);
});

test("a failed catalogue body read aborts unfinished sibling body work before Retry starts", async () => {
	const fixture = responses();
	const byPath = new Map([
		["/3/watch/providers/regions", fixture.regions],
		["/3/watch/providers/movie", fixture.movie],
		["/3/watch/providers/tv", fixture.tv],
	]);
	const firstAttemptSignals = [];
	let calls = 0;
	const loader = createStreamingCatalogueProvider({
		baseUrl: "https://worker.example",
		fetchImpl(url, { signal }) {
			calls += 1;
			const pathname = new URL(url).pathname;
			if (calls <= 3) {
				firstAttemptSignals.push(signal);
				const position = calls;
				return Promise.resolve({
					ok: true,
					status: 200,
					headers: { get() { return "application/json"; } },
					json() {
						if (position === 1) return Promise.reject(new Error("first body failed"));
						return new Promise((resolve, reject) => {
							signal.addEventListener("abort", () => reject(new Error("sibling body aborted")), { once: true });
						});
					},
				});
			}
			assert.ok(firstAttemptSignals.every((entry) => entry.aborted), "Retry started before every body-read signal was aborted");
			return Promise.resolve(jsonResponse(byPath.get(pathname)));
		},
	});
	assert.equal((await loader.loadCatalogue()).error.kind, "invalid-response");
	assert.equal(firstAttemptSignals.length, 3);
	assert.ok(firstAttemptSignals.every((signal) => signal.aborted));
	assert.equal((await loader.loadCatalogue()).ok, true);
	assert.equal(calls, 6);
});

test("a superseded shared Streaming catalogue load can be retried by the still-active caller", async () => {
	const fixture = responses();
	const byPath = new Map([
		["/3/watch/providers/regions", fixture.regions],
		["/3/watch/providers/movie", fixture.movie],
		["/3/watch/providers/tv", fixture.tv],
	]);
	let calls = 0;
	const loader = createStreamingCatalogueProvider({
		baseUrl: "https://worker.example",
		fetchImpl: async (url, { signal }) => {
			calls += 1;
			if (calls <= 3) {
				return new Promise((resolve, reject) => {
					signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
				});
			}
			return jsonResponse(byPath.get(new URL(url).pathname));
		},
	});
	const firstController = new AbortController();
	const first = loader.loadCatalogue({ signal: firstController.signal });
	const stillActive = loader.loadCatalogue();
	firstController.abort();
	assert.equal((await first).error.kind, "aborted");
	assert.equal((await stillActive).ok, true);
	assert.equal(calls, 6);
});

test("Streaming Common regions are curated, alphabetical, live-catalogue-backed and safely omit missing codes", () => {
	const regions = [
		{ code: "US", name: "United States" },
		{ code: "SG", name: "Singapore" },
		{ code: "NZ", name: "New Zealand" },
		{ code: "MX", name: "Mexico" },
		{ code: "JP", name: "Japan" },
		{ code: "IN", name: "India" },
		{ code: "DE", name: "Germany" },
		{ code: "FR", name: "France" },
		{ code: "CA", name: "Canada" },
		{ code: "BR", name: "Brazil" },
		{ code: "AU", name: "Australia" },
		{ code: "KR", name: "South Korea" },
		{ code: "GB", name: "United Kingdom" },
	];
	const common = browseStreamingRegions(regions);
	assert.deepEqual(common.map((entry) => entry.code), STREAMING_COMMON_REGION_CODES);
	assert.deepEqual(common.map((entry) => entry.name), [...common.map((entry) => entry.name)].sort());
	assert.equal(common.some((entry) => entry.code === "SG"), false);
	const withoutJapan = browseStreamingRegions(regions.filter((entry) => entry.code !== "JP"));
	assert.equal(withoutJapan.some((entry) => entry.code === "JP"), false);
	assert.equal(withoutJapan.length, STREAMING_COMMON_REGION_CODES.length - 1);
});

test("Streaming A–Z remains complete while search always covers the complete known catalogue", () => {
	const regions = [
		{ code: "SG", name: "Singapore" },
		{ code: "US", name: "United States" },
		{ code: "AU", name: "Australia" },
		{ code: "ZZ", name: "Same name" },
		{ code: "AA", name: "Same name" },
	];
	assert.deepEqual(browseStreamingRegions(regions, { mode: STREAMING_REGION_BROWSE_MODES.ALL }).map((entry) => entry.code), ["AU", "AA", "ZZ", "SG", "US"]);
	assert.deepEqual(browseStreamingRegions(regions, { mode: STREAMING_REGION_BROWSE_MODES.COMMON }).map((entry) => entry.code), ["AU", "US"]);
	assert.deepEqual(browseStreamingRegions(regions, { mode: STREAMING_REGION_BROWSE_MODES.COMMON, query: "Singapore" }).map((entry) => entry.code), ["SG"]);
	assert.deepEqual(browseStreamingRegions(regions, { mode: STREAMING_REGION_BROWSE_MODES.COMMON, query: "sg" }).map((entry) => entry.code), ["SG"]);
	assert.deepEqual(browseStreamingRegions(regions, { mode: STREAMING_REGION_BROWSE_MODES.COMMON, query: "" }).map((entry) => entry.code), ["AU", "US"]);
	assert.deepEqual(browseStreamingRegions(regions, { mode: STREAMING_REGION_BROWSE_MODES.ALL, query: "" }).map((entry) => entry.code), ["AU", "AA", "ZZ", "SG", "US"]);
	assert.throws(() => browseStreamingRegions(regions, { mode: "popular" }), /supported Streaming region browse mode/i);
});

test("Streaming region search matches known catalogue names and codes", () => {
	const regions = catalogue().regions;
	assert.deepEqual(searchStreamingRegions(regions).map((entry) => entry.code), ["AU", "GB", "US"]);
	assert.deepEqual(searchStreamingRegions(regions, "austr").map((entry) => entry.code), ["AU"]);
	assert.deepEqual(searchStreamingRegions(regions, "gb").map((entry) => entry.name), ["United Kingdom"]);
	assert.deepEqual(searchStreamingRegions(regions, "united").map((entry) => entry.code), ["GB", "US"]);
	assert.deepEqual(searchStreamingRegions(regions, "gg"), []);
});

test("provider eligibility uses the same strict common Movies/Series result across selected regions", () => {
	const providers = catalogue().providers;
	assert.deepEqual(streamingProviderCommonAvailability(provider(8), ["AU", "US"]), { movies: true, series: true, both: true, eligible: true });
	assert.deepEqual(streamingProviderCommonAvailability(provider(9), ["AU", "US"]), { movies: true, series: false, both: false, eligible: true });
	assert.deepEqual(streamingProviderCommonAvailability(provider(13), ["AU", "US"]), { movies: false, series: true, both: false, eligible: true });
	assert.deepEqual(streamingProviderCommonAvailability(provider(15), ["AU", "US"]), { movies: false, series: false, both: false, eligible: false });
	assert.deepEqual(eligibleStreamingProviders(providers, ["AU", "US"]).map((entry) => entry.id).sort((left, right) => left - right), [8, 9, 13, 14]);
	assert.equal(eligibleStreamingProviders(providers, ["AU", "GB"]).some((entry) => entry.id === 9), false);
});

test("one-region Top providers uses regional priority, caps at 30 and sorts missing regional priority last", () => {
	const providers = Array.from({ length: 35 }, (_, index) => ({
		id: 1000 + index,
		name: `Service ${String(index).padStart(2, "0")}`,
		searchName: `service ${String(index).padStart(2, "0")}`,
		logoPath: null,
		moviePriorities: { AU: index === 0 || index === 34 ? null : index % 7 },
		tvPriorities: {},
	}));
	const top = browseStreamingProviders(providers, { mode: STREAMING_PROVIDER_BROWSE_MODES.TOP, regionCodes: ["AU"] });
	assert.equal(top.length, STREAMING_TOP_PROVIDER_COUNT);
	assert.ok(top.every((entry) => Number.isSafeInteger(streamingProviderAvailability(entry, "AU").priority)));
	const completeRanking = browseStreamingProviders(providers, { mode: STREAMING_PROVIDER_BROWSE_MODES.TOP, regionCodes: ["AU"], limit: 35 });
	assert.deepEqual(completeRanking.slice(-2).map((entry) => entry.id), [1000, 1034]);
	const tied = top.filter((entry) => streamingProviderAvailability(entry, "AU").priority === 1);
	assert.deepEqual(tied.map((entry) => entry.id), [...tied.map((entry) => entry.id)].sort((left, right) => left - right));
	assert.throws(() => browseStreamingProviders(providers, { mode: STREAMING_PROVIDER_BROWSE_MODES.TOP, regionCodes: ["AU", "US"] }), /exactly one/i);
});

test("A–Z and search include only eligible providers with regional ties for one region and name/ID ties for many", () => {
	const providers = catalogue().providers;
	assert.deepEqual(browseStreamingProviders(providers, { mode: STREAMING_PROVIDER_BROWSE_MODES.ALL, regionCodes: ["AU", "US"] }).map((entry) => entry.id), [14, 13, 8, 9]);
	assert.deepEqual(searchStreamingProviders(providers, "8", { regionCodes: ["AU", "US"] }).map((entry) => entry.id), [8]);
	assert.deepEqual(searchStreamingProviders(providers, "Netflix", { regionCodes: ["AU"] }).map((entry) => entry.id), [8, 10]);
	assert.deepEqual(searchStreamingProviders(providers, "Net", { regionCodes: ["AU"] }).map((entry) => entry.id), [10, 8]);
	assert.deepEqual(searchStreamingProviders(providers, "flix", { regionCodes: ["AU"] }).map((entry) => entry.id), [10, 8]);
	assert.equal(searchStreamingProviders(providers, "Split", { regionCodes: ["AU", "US"] }).length, 0);
	const sameTier = [
		{ id: 31, name: "Stream Alpha", moviePriorities: { AU: 9, US: 1 }, tvPriorities: {} },
		{ id: 30, name: "Stream Beta", moviePriorities: { AU: 1, US: 9 }, tvPriorities: {} },
	];
	assert.deepEqual(searchStreamingProviders(sameTier, "Stream", { regionCodes: ["AU"] }).map((entry) => entry.id), [30, 31]);
	assert.deepEqual(searchStreamingProviders(sameTier, "Stream", { regionCodes: ["AU", "US"] }).map((entry) => entry.id), [31, 30]);
});

test("Streaming media support applies strict common availability across selected regions", () => {
	assert.deepEqual(streamingMediaChoiceSupport(provider(8), ["AU"]), { movies: true, series: true, both: true });
	assert.deepEqual(streamingMediaChoiceSupport(provider(8), ["AU", "US"]), { movies: true, series: true, both: true });
	assert.deepEqual(streamingMediaChoiceSupport(provider(9), ["AU", "US"]), { movies: true, series: false, both: false });
	assert.deepEqual(streamingMediaChoiceSupport(provider(15), ["AU", "US"]), { movies: false, series: false, both: false });
	assert.equal(defaultStreamingMediaChoice(provider(8), ["AU"]), "both");
	assert.equal(defaultStreamingMediaChoice(provider(8), ["AU", "US"]), "both");
	assert.equal(defaultStreamingMediaChoice(provider(9), ["AU", "US"]), "movies");
	assert.equal(defaultStreamingMediaChoice(provider(15), ["AU", "US"]), null);
	assert.equal(defaultStreamingMediaChoice(provider(11), ["AU"]), "movies");
	assert.equal(defaultStreamingMediaChoice(provider(12), ["AU"]), "series");
	assert.equal(buildStreamingSourceDrafts(provider(11), { regionCodes: ["AU"], mediaChoice: "series" }).ok, false);
	assert.equal(buildStreamingSourceDrafts(provider(15), { regionCodes: ["AU", "US"], mediaChoice: "both" }).ok, false);
});

test("Movies, Series and Both use DISCOVER Core for canonical sources and all four semantic sorts", () => {
	assert.equal(defaultStreamingSourceName("Netflix", "AU", "MOVIE"), "Netflix Movies (AU)");
	assert.equal(defaultStreamingSourceName("Netflix", "AU", "TV"), "Netflix Series (AU)");
	assert.equal(defaultStreamingSourceName("Netflix", "AU", "movie"), null);
	for (const choice of ["movies", "series", "both"]) {
		for (const option of STREAMING_SORT_OPTIONS) {
			const built = buildStreamingSourceDrafts(provider(8), { regionCodes: ["AU"], mediaChoice: choice, sortOptionId: option.id });
			assert.equal(built.ok, true, `${choice}:${option.id}`);
			assert.equal(validateStreamingSourceDrafts(built.drafts, {
				provider: provider(8),
				regionCodes: ["AU"],
				mediaChoice: choice,
				sortOptionId: option.id,
			}).ok, true, `validation:${choice}:${option.id}`);
			for (const draft of built.drafts) {
				assert.deepEqual(draft.editable, {
				title: `Netflix ${draft.editable.mediaType === "MOVIE" ? "Movies" : "Series"} (AU)`,
					sortBy: discoverSortValue(option.id, draft.editable.mediaType),
					tmdbId: null,
					filters: { watchRegion: "AU", withWatchProviders: "8" },
					provider: "tmdb",
					mediaType: draft.editable.mediaType,
					tmdbSourceType: "DISCOVER",
				});
				assert.equal(discoverSourceIdentity(draft.editable).comparable, true);
			}
		}
	}
});

test("multi-region construction preserves selected-region order, Movie-before-TV order, titles and exact filters", () => {
	const built = buildStreamingSourceDrafts(provider(8), { regionCodes: ["US", "AU"], mediaChoice: "both", sortOptionId: "recent" });
	assert.equal(built.ok, true);
	assert.deepEqual(built.drafts.map((draft) => ({
		title: draft.editable.title,
		mediaType: draft.editable.mediaType,
		filters: draft.editable.filters,
	})), [
		{ title: "Netflix Movies (US)", mediaType: "MOVIE", filters: { watchRegion: "US", withWatchProviders: "8" } },
		{ title: "Netflix Series (US)", mediaType: "TV", filters: { watchRegion: "US", withWatchProviders: "8" } },
		{ title: "Netflix Movies (AU)", mediaType: "MOVIE", filters: { watchRegion: "AU", withWatchProviders: "8" } },
		{ title: "Netflix Series (AU)", mediaType: "TV", filters: { watchRegion: "AU", withWatchProviders: "8" } },
	]);
	assert.equal(validateStreamingSourceDrafts(built.drafts, {
		provider: provider(8),
		regionCodes: ["US", "AU"],
		mediaChoice: "both",
		sortOptionId: "recent",
	}).ok, true);
	assert.equal(validateStreamingSourceDrafts([...built.drafts].reverse(), {
		provider: provider(8), regionCodes: ["US", "AU"], mediaChoice: "both", sortOptionId: "recent",
	}).ok, false);
	assert.equal(buildStreamingSourceDrafts(provider(8), { regionCodes: ["AU", "AU"], mediaChoice: "both" }).ok, false);
});

test("Streaming creation supports independent valid physical-source names and prunes only disappeared candidates", () => {
	const sourceTitles = {
		[streamingSourceCandidateKey("US", "MOVIE")]: "US movie shelf",
		[streamingSourceCandidateKey("US", "TV")]: "US series shelf",
		[streamingSourceCandidateKey("AU", "MOVIE")]: " AU movies ",
	};
	const built = buildStreamingSourceDrafts(provider(8), {
		regionCodes: ["US", "AU"],
		mediaChoice: "both",
		sortOptionId: "recent",
		sourceTitles,
	});
	assert.equal(built.ok, true);
	assert.deepEqual(built.drafts.map((draft) => draft.editable.title), [
		"US movie shelf",
		"US series shelf",
		" AU movies ",
		"Netflix Series (AU)",
	]);
	const resorted = buildStreamingSourceDrafts(provider(8), {
		regionCodes: ["US", "AU"], mediaChoice: "both", sortOptionId: "most-votes", sourceTitles,
	});
	assert.deepEqual(resorted.drafts.map((draft) => draft.editable.title), built.drafts.map((draft) => draft.editable.title));
	const resetTitles = { ...sourceTitles };
	delete resetTitles[streamingSourceCandidateKey("US", "TV")];
	const reset = buildStreamingSourceDrafts(provider(8), {
		regionCodes: ["US", "AU"], mediaChoice: "both", sortOptionId: "recent", sourceTitles: resetTitles,
	});
	assert.equal(reset.drafts[1].editable.title, "Netflix Series (US)");
	assert.equal(validateStreamingSourceDrafts(built.drafts, {
		provider: provider(8), regionCodes: ["US", "AU"], mediaChoice: "both", sortOptionId: "recent",
	}).ok, true);

	const movieDrafts = buildStreamingSourceDrafts(provider(8), {
		regionCodes: ["US", "AU"], mediaChoice: "movies", sortOptionId: "top-rated",
	}).drafts;
	assert.deepEqual(reconcileStreamingSourceTitles(sourceTitles, movieDrafts), {
		"US|MOVIE": "US movie shelf",
		"AU|MOVIE": " AU movies ",
	});
	assert.equal(buildStreamingSourceDrafts(provider(8), {
		regionCodes: ["AU"], mediaChoice: "movies", sourceTitles: { "AU|MOVIE": " \t " },
	}).errors[0].code, "INVALID_STREAMING_SOURCE_TITLE");
});

test("Streaming title drafts are isolated by provider and restore surviving region/media candidates", () => {
	const titleDrafts = {
		[streamingSourceTitleDraftKey(8, "AU", "MOVIE")]: "Netflix AU cinema",
		[streamingSourceTitleDraftKey(8, "AU", "TV")]: "Netflix AU series",
		[streamingSourceTitleDraftKey(8, "US", "MOVIE")]: "Netflix US cinema",
		[streamingSourceTitleDraftKey(9, "AU", "MOVIE")]: "Prime AU cinema",
	};
	const netflixTitles = streamingSourceTitlesForProvider(titleDrafts, 8);
	const primeTitles = streamingSourceTitlesForProvider(titleDrafts, 9);

	assert.deepEqual(netflixTitles, {
		"AU|MOVIE": "Netflix AU cinema",
		"AU|TV": "Netflix AU series",
		"US|MOVIE": "Netflix US cinema",
	});
	assert.deepEqual(primeTitles, { "AU|MOVIE": "Prime AU cinema" });
	assert.equal(streamingSourceTitleDraftKey(0, "AU", "MOVIE"), null);
	assert.deepEqual(streamingSourceTitlesForProvider({ "8|AU|MOVIE|extra": "No" }, 8), {});

	const unchanged = buildStreamingSourceDrafts(provider(8), {
		regionCodes: ["AU"], mediaChoice: "both", sourceTitles: netflixTitles,
	});
	assert.deepEqual(unchanged.drafts.map((draft) => draft.editable.title), ["Netflix AU cinema", "Netflix AU series"]);
	const changedRegions = buildStreamingSourceDrafts(provider(8), {
		regionCodes: ["AU", "US"], mediaChoice: "both", sourceTitles: netflixTitles,
	});
	assert.deepEqual(changedRegions.drafts.map((draft) => draft.editable.title), [
		"Netflix AU cinema",
		"Netflix AU series",
		"Netflix US cinema",
		"Netflix Series (US)",
	]);
	const returned = buildStreamingSourceDrafts(provider(8), {
		regionCodes: ["AU", "US"], mediaChoice: "movies", sourceTitles: netflixTitles,
	});
	assert.deepEqual(returned.drafts.map((draft) => draft.editable.title), ["Netflix AU cinema", "Netflix US cinema"]);
});

test("Streaming insertion validator permits only valid custom names while retaining the configured source contract", () => {
	const drafts = buildStreamingSourceDrafts(provider(8), {
		regionCodes: ["AU"],
		mediaChoice: "both",
		sourceTitles: { "AU|MOVIE": "Cinema", "AU|TV": "\u200E" },
	}).drafts;
	assert.equal(validateStreamingSourceDrafts(drafts, {
		provider: provider(8), regionCodes: ["AU"], mediaChoice: "both",
	}).ok, true);
	const blank = structuredClone(drafts);
	blank[0].editable.title = "   ";
	assert.equal(validateStreamingSourceDrafts(blank, {
		provider: provider(8), regionCodes: ["AU"], mediaChoice: "both",
	}).ok, false);
	const changedFilter = structuredClone(drafts);
	changedFilter[0].editable.filters.withWatchProviders = "9";
	assert.equal(validateStreamingSourceDrafts(changedFilter, {
		provider: provider(8), regionCodes: ["AU"], mediaChoice: "both",
	}).ok, false);
});

test("Streaming atomically inserts every final custom and default title in a batch larger than four", () => {
	const netflix = {
		...provider(8),
		moviePriorities: { AU: 4, CA: 2, GB: 3, US: 1 },
		tvPriorities: { AU: 3, CA: 2, GB: 1, US: 2 },
	};
	const regions = [
		{ code: "AU", name: "Australia" },
		{ code: "CA", name: "Canada" },
		{ code: "GB", name: "United Kingdom" },
		{ code: "US", name: "United States" },
	];
	const sourceTitles = {
		"AU|MOVIE": "Australia films",
		"CA|TV": "Canada series",
		"US|MOVIE": "US cinema",
	};
	const built = buildStreamingSourceDrafts(netflix, {
		regionCodes: regions.map((region) => region.code),
		mediaChoice: "both",
		sourceTitles,
	});
	assert.equal(built.ok, true);
	assert.equal(built.drafts.length, 8);
	const { controller, folder } = selectedFolderController();
	const beforeRevision = controller.getState().revision;
	const result = createStreamingSourceBundle(controller, {
		folderInternalId: folder.internalId,
		provider: netflix,
		regions,
		catalogueRegions: regions,
		mediaChoice: "both",
		drafts: built.drafts,
	});
	assert.equal(result.ok, true);
	assert.equal(result.addedSourceCount, 8);
	assert.equal(controller.getState().revision, beforeRevision + 1);
	assert.deepEqual(
		serializeNuvioProject(controller.getState().project).value[0].folders[0].sources.map((source) => source.title),
		[
			"Australia films", "Netflix Series (AU)",
			"Netflix Movies (CA)", "Canada series",
			"Netflix Movies (GB)", "Netflix Series (GB)",
			"US cinema", "Netflix Series (US)",
		],
	);
});

test("Streaming insertion rejects crafted bundles that do not match the selected configuration", () => {
	const netflix = provider(8);
	const popularBoth = buildStreamingSourceDrafts(netflix, { regionCodes: ["AU"], mediaChoice: "both", sortOptionId: "popular" }).drafts;
	const recentBoth = buildStreamingSourceDrafts(netflix, { regionCodes: ["AU"], mediaChoice: "both", sortOptionId: "recent" }).drafts;
	const movieOnlyProvider = provider(11);
	const unavailableSeries = {
		category: "native-tmdb",
		editable: {
			...popularBoth[1].editable,
			title: movieOnlyProvider.name,
			filters: { watchRegion: "AU", withWatchProviders: "11" },
		},
	};
	const cases = [
		{ label: "reversed Both order", provider: netflix, regionCodes: ["AU"], mediaChoice: "both", sortOptionId: "popular", drafts: [...popularBoth].reverse() },
		{ label: "duplicate Movie candidates", provider: netflix, regionCodes: ["AU"], mediaChoice: "both", sortOptionId: "popular", drafts: [popularBoth[0], recentBoth[0]] },
		{ label: "mixed semantic sorts", provider: netflix, regionCodes: ["AU"], mediaChoice: "both", sortOptionId: "popular", drafts: [popularBoth[0], recentBoth[1]] },
		{ label: "mixed providers", provider: netflix, regionCodes: ["AU"], mediaChoice: "both", sortOptionId: "popular", drafts: [popularBoth[0], { ...popularBoth[1], editable: { ...popularBoth[1].editable, title: "Prime Video · AU", filters: { watchRegion: "AU", withWatchProviders: "9" } } }] },
		{ label: "mixed regions", provider: netflix, regionCodes: ["AU"], mediaChoice: "both", sortOptionId: "popular", drafts: [popularBoth[0], { ...popularBoth[1], editable: { ...popularBoth[1].editable, title: "Netflix · US", filters: { watchRegion: "US", withWatchProviders: "8" } } }] },
		{ label: "TV for Movie-only provider", provider: movieOnlyProvider, regionCodes: ["AU"], mediaChoice: "series", sortOptionId: "popular", drafts: [unavailableSeries] },
		{ label: "non-normalized provider", provider: { ...netflix, name: " Netflix " }, regionCodes: ["AU"], mediaChoice: "movies", sortOptionId: "popular", drafts: [popularBoth[0]] },
		{ label: "non-normalized region", provider: netflix, regionCodes: ["au"], mediaChoice: "movies", sortOptionId: "popular", drafts: [popularBoth[0]] },
		{ label: "region absent from known catalogue", provider: netflix, regionCodes: ["GG"], mediaChoice: "movies", sortOptionId: "popular", drafts: [popularBoth[0]] },
	];

	for (const candidate of cases) {
		const { controller, folder } = selectedFolderController();
		const before = controller.getState();
		const result = createStreamingSourceBundle(controller, {
			folderInternalId: folder.internalId,
			provider: candidate.provider,
			regions: knownRegions(...candidate.regionCodes),
			catalogueRegions: catalogue().regions,
			mediaChoice: candidate.mediaChoice,
			sortOptionId: candidate.sortOptionId,
			drafts: candidate.drafts,
		});
		assert.equal(result.ok, false, candidate.label);
		assert.equal(controller.getState().project, before.project, candidate.label);
		assert.equal(controller.getState().revision, before.revision, candidate.label);
	}
});

test("Streaming current-folder and elsewhere duplicates use DISCOVER identity, including sort but excluding title", () => {
	const movie = buildStreamingSourceDrafts(provider(8), { regionCodes: ["AU"], mediaChoice: "movies" }).drafts[0].editable;
	const existing = { ...movie, title: "Custom Netflix title" };
	const { controller, folder } = selectedFolderController({ sources: [existing], twoFolders: true });
	const candidates = buildStreamingSourceDrafts(provider(8), { regionCodes: ["AU"], mediaChoice: "both" }).drafts;
	const current = inspectStreamingSourceDuplicates(controller.getState().project, folder.internalId, candidates);
	assert.deepEqual(current.destination.map((entry) => entry.mediaType), ["MOVIE"]);
	const other = controller.getState().project.collections[0].folders[1];
	const elsewhere = inspectStreamingSourceDuplicates(controller.getState().project, other.internalId, candidates);
	assert.equal(elsewhere.destination.length, 0);
	assert.deepEqual(elsewhere.elsewhere.map((entry) => entry.mediaType), ["MOVIE"]);
	const recent = buildStreamingSourceDrafts(provider(8), { regionCodes: ["AU"], mediaChoice: "movies", sortOptionId: "recent" }).drafts;
	assert.equal(inspectStreamingSourceDuplicates(controller.getState().project, folder.internalId, recent).destination.length, 0);
});

test("Both adds only a missing TV candidate by default and serializes native sources without projections", () => {
	const movie = buildStreamingSourceDrafts(provider(8), { regionCodes: ["AU"], mediaChoice: "movies" }).drafts[0].editable;
	const { controller, folder } = selectedFolderController({ sources: [movie] });
	const drafts = buildStreamingSourceDrafts(provider(8), { regionCodes: ["AU"], mediaChoice: "both" }).drafts;
	const before = controller.getState().revision;
	const result = createStreamingSourceBundle(controller, { folderInternalId: folder.internalId, provider: provider(8), regions: knownRegions("AU"), catalogueRegions: catalogue().regions, mediaChoice: "both", sortOptionId: "popular", drafts });
	assert.equal(result.ok, true);
	assert.equal(result.addedSourceCount, 1);
	assert.equal(controller.getState().revision, before + 1);
	const serialized = serializeNuvioProject(controller.getState().project);
	assert.equal(serialized.ok, true);
	assert.deepEqual(serialized.value[0].folders[0].sources.map((source) => source.mediaType), ["MOVIE", "TV"]);
	assert.deepEqual(serialized.value[0].folders[0].catalogSources, []);
});

test("Both adds only a missing Movie candidate when TV already exists", () => {
	const tv = buildStreamingSourceDrafts(provider(8), { regionCodes: ["AU"], mediaChoice: "series" }).drafts[0].editable;
	const { controller, folder } = selectedFolderController({ sources: [tv] });
	const drafts = buildStreamingSourceDrafts(provider(8), { regionCodes: ["AU"], mediaChoice: "both" }).drafts;
	const before = controller.getState().revision;
	const result = createStreamingSourceBundle(controller, {
		folderInternalId: folder.internalId,
		provider: provider(8),
		regions: knownRegions("AU"),
		catalogueRegions: catalogue().regions,
		mediaChoice: "both",
		sortOptionId: "popular",
		drafts,
	});
	assert.equal(result.ok, true);
	assert.equal(result.addedSourceCount, 1);
	assert.equal(controller.getState().revision, before + 1);
	const serialized = serializeNuvioProject(controller.getState().project);
	assert.equal(serialized.ok, true);
	assert.deepEqual(serialized.value[0].folders[0].sources.map((source) => source.mediaType), ["TV", "MOVIE"]);
});

test("multi-region partial duplicates add only missing identities in configured order for both reverse combinations", () => {
	const drafts = buildStreamingSourceDrafts(provider(8), { regionCodes: ["AU", "US"], mediaChoice: "both" }).drafts;
	for (const existingIndexes of [[0, 3], [1, 2]]) {
		const existing = existingIndexes.map((index) => drafts[index].editable);
		const { controller, folder } = selectedFolderController({ sources: existing });
		const before = controller.getState().revision;
		const result = createStreamingSourceBundle(controller, {
			folderInternalId: folder.internalId,
			provider: provider(8),
			regions: knownRegions("AU", "US"),
			catalogueRegions: catalogue().regions,
			mediaChoice: "both",
			sortOptionId: "popular",
			drafts,
		});
		assert.equal(result.ok, true);
		assert.equal(result.addedSourceCount, 2);
		assert.equal(controller.getState().revision, before + 1);
		const inserted = controller.getState().project.collections[0].folders[0].sources.slice(2);
		const expectedMissing = drafts.filter((_, index) => !existingIndexes.includes(index));
		assert.deepEqual(inserted.map((source) => [source.editable.filters.watchRegion, source.editable.mediaType]), expectedMissing.map((draft) => [draft.editable.filters.watchRegion, draft.editable.mediaType]));
	}
});

test("fully duplicate Both requires an exact override and adds the configured pair atomically when approved", () => {
	const drafts = buildStreamingSourceDrafts(provider(8), { regionCodes: ["AU", "US"], mediaChoice: "both" }).drafts;
	const { controller, folder } = selectedFolderController({ sources: drafts.map((draft) => draft.editable) });
	const before = controller.getState().revision;
	const blocked = createStreamingSourceBundle(controller, { folderInternalId: folder.internalId, provider: provider(8), regions: knownRegions("AU", "US"), catalogueRegions: catalogue().regions, mediaChoice: "both", sortOptionId: "popular", drafts });
	assert.equal(blocked.ok, false);
	assert.equal(blocked.requiresDuplicateOverride, true);
	assert.equal(controller.getState().revision, before);
	const approved = createStreamingSourceBundle(controller, {
		folderInternalId: folder.internalId,
		provider: provider(8),
		regions: knownRegions("AU", "US"),
		catalogueRegions: catalogue().regions,
		mediaChoice: "both",
		sortOptionId: "popular",
		drafts,
		duplicateOverrideIdentity: streamingDuplicateOverrideIdentity(folder.internalId, drafts),
	});
	assert.equal(approved.ok, true);
	assert.equal(approved.addedSourceCount, 4);
	assert.equal(approved.duplicateOverrideUsed, true);
	assert.equal(controller.getState().revision, before + 1);
});

test("failed multi-source insertion leaves the project unchanged with no partial source", () => {
	let count = 0;
	let forcedCollision = null;
	const { controller, folder } = selectedFolderController({
		idFactory: () => forcedCollision ?? `node-${++count}`,
	});
	forcedCollision = folder.internalId;
	const drafts = buildStreamingSourceDrafts(provider(8), { regionCodes: ["AU", "US"], mediaChoice: "both" }).drafts;
	const before = controller.getState();
	const result = createStreamingSourceBundle(controller, { folderInternalId: folder.internalId, provider: provider(8), regions: knownRegions("AU", "US"), catalogueRegions: catalogue().regions, mediaChoice: "both", sortOptionId: "popular", drafts });
	assert.equal(result.ok, false);
	assert.equal(controller.getState().project, before.project);
	assert.equal(controller.getState().project.collections[0].folders[0].sources.length, 0);
	assert.deepEqual(controller.getState().project, before.project);
});

test("an opaque community source is not coerced into a Streaming duplicate", () => {
	const opaque = {
		title: "Looks similar",
		sortBy: "popularity.desc",
		tmdbId: null,
		filters: { watchRegion: "AU", withWatchProviders: "8" },
		provider: "community",
		mediaType: "MOVIE",
		tmdbSourceType: "DISCOVER",
	};
	const { controller, folder } = selectedFolderController({ sources: [opaque] });
	const drafts = buildStreamingSourceDrafts(provider(8), { regionCodes: ["AU"], mediaChoice: "movies" }).drafts;
	assert.equal(inspectStreamingSourceDuplicates(controller.getState().project, folder.internalId, drafts).destination.length, 0);
});

test("a native imported non-comparable DISCOVER SourceNode is not a false Streaming duplicate", () => {
	const importedNativeDiscover = {
		title: "Imported Netflix",
		sortBy: "popularity.desc",
		tmdbId: null,
		filters: null,
		provider: "tmdb",
		mediaType: "MOVIE",
		tmdbSourceType: "DISCOVER",
	};
	const { controller, folder } = selectedFolderController({ sources: [importedNativeDiscover] });
	const importedNode = controller.getState().project.collections[0].folders[0].sources[0];
	assert.equal(importedNode.category, "native-tmdb");
	assert.equal(discoverSourceNodeIdentity(importedNode).comparable, false);
	const drafts = buildStreamingSourceDrafts(provider(8), { regionCodes: ["AU"], mediaChoice: "movies" }).drafts;
	assert.equal(inspectStreamingSourceDuplicates(controller.getState().project, folder.internalId, drafts).destination.length, 0);
});
