import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createBuilderController } from "../builder/src/application/index.js";
import { importNuvioCollections } from "../builder/src/import/index.js";
import {
	buildStudioSourceDrafts,
	createAsyncRequestCoordinator,
	createStudioCatalogueProvider,
	createStudioSourceBundle,
	createTmdbStudioCountProvider,
	DEFAULT_STUDIO_MOVIE_SORT,
	DEFAULT_STUDIO_SEARCH_SORT,
	DEFAULT_STUDIO_SORT_OPTION_ID,
	formatStudioLocation,
	inspectStudioSourceDuplicates,
	normalizeStudioCatalogue,
	normalizeStudioCatalogueRow,
	normalizeTmdbStudioCountResponse,
	parseStudioSearchInput,
	searchStudioCatalogue,
	studioDuplicateOverrideIdentity,
	STUDIO_MOVIE_SORT_OPTIONS,
	STUDIO_MOVIE_COUNT_FILTERS,
	STUDIO_SEARCH_SORTS,
	STUDIO_SORT_OPTIONS,
	STUDIO_SOURCE_OPTIONS,
	studioSourceIdentity,
	studioMatchesMovieCountFilter,
	studioSortValue,
	validateStudioSourceDraft,
	validateStudioSourceSelection,
} from "../builder/src/source-add/index.js";
import { serializeNuvioProject } from "../builder/src/serialize/index.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function countingIdFactory(prefix = "builder") {
	let count = 0;
	return () => `${prefix}-${++count}`;
}

function studio(overrides = {}) {
	return Object.freeze({
		id: 3,
		name: "Pixar",
		parentCompany: "Walt Disney Pictures",
		country: "US",
		headquarters: "Emeryville, California",
		location: "US · Emeryville, California",
		logoPath: "/pixar.png",
		movieCount: 136,
		...overrides,
	});
}

function compactRows() {
	return [
		{ i: 30, n: "beta Studio", t: 0 },
		{ i: 3, n: "Pixar", p: "Walt Disney Pictures", c: "US", h: "Emeryville", l: "/pixar.png", t: 136 },
		{ i: 20, n: "Alpha Studio", t: 4 },
		{ i: 10, n: "alpha studio", t: 2 },
		{ i: 9, n: "No Count Studio" },
		{ i: 0, n: "Invalid zero" },
		{ i: 7, n: "" },
		null,
		{ i: 3, n: "Duplicate ignored" },
	];
}

function jsonResponse(value, { status = 200 } = {}) {
	return {
		ok: status >= 200 && status < 300,
		status,
		async json() { return value; },
	};
}

function createSelectedFolderController({ sources = [] } = {}) {
	const controller = createBuilderController({
		idFactory: countingIdFactory(),
		nuvioIdFactory: countingIdFactory("nuvio"),
		initialProjectTitle: "Studio tests",
	});
	const imported = controller.importValue([{
		id: "studios",
		title: "Studios",
		folders: [{
			id: "folder",
			title: "Animation Studios",
			sources,
			catalogSources: [],
			unknownFolderValue: "preserve",
		}],
		unknownCollectionValue: true,
	}]);
	assert.equal(imported.ok, true);
	const folder = controller.getState().project.collections[0].folders[0];
	controller.selectNode(folder.internalId);
	return { controller, folder };
}

test("Studio input distinguishes partial names, exact positive IDs, and invalid numeric IDs", () => {
	assert.deepEqual(parseStudioSearchInput("  pix  "), { kind: "search", query: "pix", eligible: true, message: null });
	assert.deepEqual(parseStudioSearchInput("P"), { kind: "search", query: "P", eligible: false, message: "Enter at least two characters to search." });
	assert.deepEqual(parseStudioSearchInput("0003"), { kind: "exact", id: 3 });
	for (const value of ["0", "-1", "1.5", "1e3", "9007199254740992"]) {
		assert.equal(parseStudioSearchInput(value).kind, "invalid", value);
	}
});

test("cached Company rows normalize compact metadata safely and retain valid zero counts", () => {
	assert.deepEqual(normalizeStudioCatalogueRow(compactRows()[1]), {
		id: 3,
		name: "Pixar",
		searchName: "pixar",
		parentCompany: "Walt Disney Pictures",
		searchParentCompany: "walt disney pictures",
		country: "US",
		searchCountry: "us united states usa america",
		headquarters: "Emeryville",
		searchHeadquarters: "emeryville",
		logoPath: "/pixar.png",
		movieCount: 136,
	});
	assert.equal(normalizeStudioCatalogueRow({ i: 2, n: "No count" }).movieCount, null);
	assert.equal(normalizeStudioCatalogueRow({ i: 2, n: "Zero", t: 0 }).movieCount, 0);
	assert.equal(normalizeStudioCatalogueRow({ i: 2, n: "Bad", t: -1 }).movieCount, null);
	assert.equal(normalizeStudioCatalogueRow({ i: 2, n: "Bad", t: 1.5 }).movieCount, null);
	assert.equal(normalizeStudioCatalogueRow({ i: 2, n: "Bad", l: "https://example.com/logo.png" }).logoPath, null);
	for (const row of [{ i: 0, n: "Zero" }, { i: 1, n: "" }, [], null]) assert.equal(normalizeStudioCatalogueRow(row), null);
});

test("Studio catalogue search is case-insensitive, exact-ID aware, paged, and deterministic", () => {
	const catalogue = normalizeStudioCatalogue(compactRows());
	assert.equal(catalogue.studios.length, 5);
	const partial = searchStudioCatalogue(catalogue, parseStudioSearchInput("STUDIO"), { pageSize: 2 });
	assert.deepEqual(partial.results.map((entry) => entry.id), [20, 10]);
	assert.equal(partial.totalResults, 4);
	assert.equal(partial.totalPages, 2);
	assert.deepEqual(searchStudioCatalogue(catalogue, parseStudioSearchInput("studio"), { page: 2, pageSize: 2 }).results.map((entry) => entry.id), [30, 9]);
	assert.deepEqual(searchStudioCatalogue(catalogue, parseStudioSearchInput("3")).results, [studio({ headquarters: "Emeryville", location: "US · Emeryville" })]);
	assert.equal(searchStudioCatalogue(catalogue, parseStudioSearchInput("999")).results.length, 0);
});

test("V1-informed Studio metadata search handles countries, locations, parents, and deliberate short codes", () => {
	const catalogue = normalizeStudioCatalogue([
		{ i: 3, n: "Pixar", p: "Walt Disney Pictures", c: "US", h: "1200 Park Avenue, Emeryville, California 94608", t: 136 },
		{ i: 40, n: "Southern Light", c: "AU", h: "Sydney, New South Wales", t: 12 },
		{ i: 41, n: "Tokyo Works", c: "JP", h: "Shinjuku, Tokyo", t: 7 },
		{ i: 42, n: "Gaumont", c: "FR", h: "Neuilly sur Seine", t: 764 },
		{ i: 43, n: "Aurum Films", c: "GB", h: "London, England", t: 18 },
	]);
	for (const query of ["Australia", "AU"]) {
		assert.deepEqual(searchStudioCatalogue(catalogue, parseStudioSearchInput(query)).results.map((entry) => entry.id), [40], query);
	}
	for (const query of ["Japan", "JP"]) {
		assert.deepEqual(searchStudioCatalogue(catalogue, parseStudioSearchInput(query)).results.map((entry) => entry.id), [41], query);
	}
	assert.deepEqual(searchStudioCatalogue(catalogue, parseStudioSearchInput("California")).results.map((entry) => entry.id), [3]);
	assert.deepEqual(searchStudioCatalogue(catalogue, parseStudioSearchInput("Disney")).results.map((entry) => entry.id), [3]);
	assert.equal(searchStudioCatalogue(catalogue, parseStudioSearchInput("AU")).results.some((entry) => [42, 43].includes(entry.id)), false);
});

test("Best match preserves textual tiers and uses Movie Count only inside a tier", () => {
	const catalogue = normalizeStudioCatalogue([
		{ i: 1, n: "Warner", t: 1 },
		{ i: 2, n: "Warner Bros. Pictures", t: 3_400 },
		{ i: 3, n: "Warner Independent", t: 20 },
		{ i: 4, n: "The Warner Annex", t: 9_000 },
		{ i: 5, n: "Child Studio", p: "Warner Holdings", t: 10_000 },
		{ i: 6, n: "Location House", h: "Warner, Queensland", t: 20_000 },
		{ i: 7, n: "Warner Bros. Animation", t: 900 },
	]);
	const result = searchStudioCatalogue(catalogue, parseStudioSearchInput("Warner"));
	assert.equal(DEFAULT_STUDIO_SEARCH_SORT, STUDIO_SEARCH_SORTS.BEST_MATCH);
	assert.deepEqual(result.results.map((entry) => entry.id), [1, 2, 7, 3, 4, 5, 6]);
	assert.equal(result.results[1].name, "Warner Bros. Pictures");
});

test("Studio zero filtering distinguishes known zero from unknown before typed-search pagination", () => {
	const catalogue = normalizeStudioCatalogue([
		{ i: 1, n: "Alpha Studio", t: 100 },
		{ i: 2, n: "Beta Studio", t: 0 },
		{ i: 3, n: "Gamma Studio" },
		{ i: 4, n: "Delta Studio", t: 12 },
		{ i: 5, n: "Epsilon Studio", t: 0 },
	]);
	const unfiltered = searchStudioCatalogue(catalogue, parseStudioSearchInput("Studio"), {
		sort: STUDIO_SEARCH_SORTS.NAME_ASC,
		pageSize: 2,
	});
	assert.equal(unfiltered.totalResults, 5);
	assert.equal(unfiltered.totalPages, 3);
	assert.deepEqual(unfiltered.results.map((entry) => entry.id), [1, 2]);
	const filtered = searchStudioCatalogue(catalogue, parseStudioSearchInput("Studio"), {
		sort: STUDIO_SEARCH_SORTS.NAME_ASC,
		hideZero: true,
		page: 3,
		pageSize: 2,
	});
	assert.equal(filtered.totalResults, 3);
	assert.equal(filtered.totalPages, 2);
	assert.equal(filtered.page, 2);
	assert.deepEqual(filtered.results.map((entry) => entry.id), [3]);
	assert.equal(filtered.results[0].movieCount, null);
	assert.equal(filtered.results.some((entry) => entry.movieCount === 0), false);
	assert.throws(() => searchStudioCatalogue(catalogue, parseStudioSearchInput("Studio"), { sort: "invented" }), /supported Studio result sort/);
});

test("Studio hierarchy Movie count filters run before pagination and preserve Unknown semantics", () => {
	const catalogue = normalizeStudioCatalogue([
		{ i: 1, n: "Unknown Studio" },
		{ i: 2, n: "Zero Studio", t: 0 },
		{ i: 3, n: "Nine Studio", t: 9 },
		{ i: 4, n: "Ten Studio", t: 10 },
		{ i: 5, n: "Fifty Studio", t: 50 },
		{ i: 6, n: "Hundred Studio", t: 100 },
		{ i: 7, n: "Five Hundred Studio", t: 500 },
	]);
	const all = searchStudioCatalogue(catalogue, { kind: "browse" }, { sort: STUDIO_SEARCH_SORTS.NAME_ASC, movieCountFilter: STUDIO_MOVIE_COUNT_FILTERS.ALL, pageSize: 2 });
	assert.equal(all.totalResults, 7);
	assert.equal(all.totalPages, 4);
	const excludeZero = searchStudioCatalogue(catalogue, { kind: "browse" }, { sort: STUDIO_SEARCH_SORTS.NAME_ASC, movieCountFilter: STUDIO_MOVIE_COUNT_FILTERS.EXCLUDE_ZERO, page: 3, pageSize: 2 });
	assert.equal(excludeZero.totalResults, 6);
	assert.equal(excludeZero.totalPages, 3);
	assert.deepEqual(excludeZero.results.map((entry) => entry.id), [4, 1]);
	assert.equal(studioMatchesMovieCountFilter(catalogue.byId.get(1), STUDIO_MOVIE_COUNT_FILTERS.ALL), true);
	assert.equal(studioMatchesMovieCountFilter(catalogue.byId.get(1), STUDIO_MOVIE_COUNT_FILTERS.EXCLUDE_ZERO), true);
	for (const filter of [STUDIO_MOVIE_COUNT_FILTERS.AT_LEAST_10, STUDIO_MOVIE_COUNT_FILTERS.AT_LEAST_50, STUDIO_MOVIE_COUNT_FILTERS.AT_LEAST_100, STUDIO_MOVIE_COUNT_FILTERS.AT_LEAST_500]) {
		assert.equal(studioMatchesMovieCountFilter(catalogue.byId.get(1), filter), false, filter);
	}
	assert.deepEqual(searchStudioCatalogue(catalogue, { kind: "browse" }, { sort: STUDIO_SEARCH_SORTS.MOVIE_COUNT_DESC, movieCountFilter: STUDIO_MOVIE_COUNT_FILTERS.AT_LEAST_10 }).results.map((entry) => entry.id), [7, 6, 5, 4]);
	assert.deepEqual(searchStudioCatalogue(catalogue, { kind: "browse" }, { sort: STUDIO_SEARCH_SORTS.MOVIE_COUNT_DESC, movieCountFilter: STUDIO_MOVIE_COUNT_FILTERS.AT_LEAST_50 }).results.map((entry) => entry.id), [7, 6, 5]);
	assert.deepEqual(searchStudioCatalogue(catalogue, { kind: "browse" }, { sort: STUDIO_SEARCH_SORTS.MOVIE_COUNT_DESC, movieCountFilter: STUDIO_MOVIE_COUNT_FILTERS.AT_LEAST_100 }).results.map((entry) => entry.id), [7, 6]);
	assert.deepEqual(searchStudioCatalogue(catalogue, { kind: "browse" }, { sort: STUDIO_SEARCH_SORTS.MOVIE_COUNT_DESC, movieCountFilter: STUDIO_MOVIE_COUNT_FILTERS.AT_LEAST_500 }).results.map((entry) => entry.id), [7]);
});

test("Studio Browse all reuses paged catalogue ordering without treating missing counts as zero", () => {
	const catalogue = normalizeStudioCatalogue([
		{ i: 1, n: "Zero", t: 0 },
		{ i: 2, n: "Most", t: 100 },
		{ i: 3, n: "Missing" },
		{ i: 4, n: "Middle", t: 12 },
	]);
	const browse = searchStudioCatalogue(catalogue, { kind: "browse" }, {
		sort: STUDIO_SEARCH_SORTS.MOVIE_COUNT_DESC,
		pageSize: 2,
	});
	assert.deepEqual(browse.results.map((entry) => entry.id), [2, 4]);
	assert.deepEqual(searchStudioCatalogue(catalogue, { kind: "browse" }, {
		sort: STUDIO_SEARCH_SORTS.NAME_ASC,
		hideZero: true,
	}).results.map((entry) => entry.id), [4, 3, 2]);
	const filtered = searchStudioCatalogue(catalogue, { kind: "browse" }, {
		sort: STUDIO_SEARCH_SORTS.MOVIE_COUNT_DESC,
		hideZero: true,
		pageSize: 2,
	});
	assert.equal(filtered.totalResults, 3);
	assert.equal(filtered.totalPages, 2);
	assert.deepEqual(filtered.results.map((entry) => entry.id), [2, 4]);
	assert.deepEqual(searchStudioCatalogue(catalogue, { kind: "browse" }, {
		sort: STUDIO_SEARCH_SORTS.MOVIE_COUNT_DESC,
		hideZero: true,
		page: 2,
		pageSize: 2,
	}).results.map((entry) => entry.id), [3]);
});

test("checked-in Company catalogue retains an explicit known-zero Studio sanity check", () => {
	const compactRows = JSON.parse(fs.readFileSync(path.join(rootDir, "data/companies.min.json"), "utf8"));
	const rawCompany = compactRows.find((entry) => (
		entry !== null
		&& typeof entry === "object"
		&& !Array.isArray(entry)
		&& Number.isSafeInteger(entry.i)
		&& entry.i > 0
		&& typeof entry.n === "string"
		&& entry.n.trim()
		&& Object.hasOwn(entry, "t")
		&& entry.t === 0
	));
	assert.ok(rawCompany, "Expected the current Company catalogue to contain an explicit known-zero row.");
	const catalogue = normalizeStudioCatalogue(compactRows);
	const search = parseStudioSearchInput(String(rawCompany.i));
	const visible = searchStudioCatalogue(catalogue, search);
	assert.equal(visible.totalResults, 1);
	assert.equal(visible.results[0].movieCount, 0);
	const hidden = searchStudioCatalogue(catalogue, search, { hideZero: true });
	assert.equal(hidden.totalResults, 0);
	assert.equal(hidden.results.length, 0);
});

test("Studio location display removes street and postal detail", () => {
	assert.equal(formatStudioLocation({ country: "US", headquarters: "1200 Park Avenue, Emeryville, California 94608" }), "US · Emeryville, California");
	assert.equal(formatStudioLocation({ country: "JP", headquarters: "Tateishi, Katsushika, Tokyo, Japan" }), "JP · Katsushika, Tokyo");
	assert.equal(formatStudioLocation({ country: "AU", headquarters: "" }), "AU");
});

test("Studio catalogue provider caches only a successfully parsed catalogue and never calls count routes", async () => {
	const calls = [];
	const provider = createStudioCatalogueProvider({
		catalogueUrl: "https://static.example/data/companies.min.json",
		fetchImpl: async (url) => {
			calls.push(url);
			return jsonResponse(compactRows());
		},
	});
	const first = await provider.searchStudios("pixar");
	const second = await provider.searchStudios("3");
	const browse = await provider.searchStudios({ kind: "browse" }, { sort: STUDIO_SEARCH_SORTS.MOVIE_COUNT_DESC });
	assert.equal(first.ok, true);
	assert.equal(second.ok, true);
	assert.equal(browse.ok, true);
	assert.equal(calls.length, 1);
	assert.equal(calls[0], "https://static.example/data/companies.min.json");
	assert.equal(calls.some((url) => String(url).includes("/discover/")), false);
});

test("Studio catalogue provider preserves legacy implicit zeroes while current explicit counts distinguish known and unknown values", async () => {
	const legacyProvider = createStudioCatalogueProvider({
		fetchImpl: async () => jsonResponse([
			{ i: 3, n: "Pixar", t: 136 },
			{ i: 10, n: "Highlight" },
		]),
	});
	const legacyZero = await legacyProvider.searchStudios("10");
	assert.equal(legacyZero.ok, true);
	assert.equal(legacyZero.data.results[0].movieCount, 0);
	const newContractProvider = createStudioCatalogueProvider({
		fetchImpl: async () => jsonResponse([
			{ i: 10, n: "Known Zero", t: 0 },
			{ i: 11, n: "Unknown Count" },
			{ i: 12, n: "Known Positive", t: 136 },
			{ i: 13, n: "Malformed Count", t: "0" },
		]),
	});
	const knownZero = await newContractProvider.searchStudios("10");
	const unknown = await newContractProvider.searchStudios("11");
	const knownPositive = await newContractProvider.searchStudios("12");
	const malformed = await newContractProvider.searchStudios("13");
	assert.equal(knownZero.data.results[0].movieCount, 0);
	assert.equal(unknown.data.results[0].movieCount, null);
	assert.equal(knownPositive.data.results[0].movieCount, 136);
	assert.equal(malformed.data.results[0].movieCount, null);
	const filteredUnknown = await newContractProvider.searchStudios("11", { hideZero: true });
	assert.equal(filteredUnknown.data.totalResults, 1);
});

test("malformed or failed catalogue loads are sanitized and remain retryable", async () => {
	let attempts = 0;
	const provider = createStudioCatalogueProvider({
		catalogueUrl: "/data/companies.min.json",
		fetchImpl: async () => {
			attempts += 1;
			return attempts === 1 ? jsonResponse({ rows: [] }) : jsonResponse(compactRows());
		},
	});
	const failed = await provider.searchStudios("pixar");
	const retried = await provider.searchStudios("pixar");
	assert.equal(failed.ok, false);
	assert.equal(failed.error.retryable, true);
	assert.equal(retried.ok, true);
	assert.equal(attempts, 2);
});

test("Studio count normalization accepts only non-negative safe integer total_results", () => {
	for (const [value, expected] of [
		[{ total_results: 42 }, 42],
		[{ total_results: 0 }, 0],
		[{ total_results: -1 }, null],
		[{ total_results: 1.5 }, null],
		[{ total_results: "3" }, null],
		[{}, null],
		[null, null],
	]) assert.equal(normalizeTmdbStudioCountResponse(value), expected);
});

test("Studio selection starts exactly two parallel structured count requests", async () => {
	const calls = [];
	const releases = [];
	const provider = createTmdbStudioCountProvider({
		baseUrl: "https://worker.example",
		fetchImpl: (url, init) => new Promise((resolve) => {
			const callIndex = calls.length;
			calls.push({ url: new URL(url), init });
			releases.push(() => resolve(jsonResponse({ total_results: callIndex === 0 ? 42 : 17 })));
		}),
	});
	const pending = provider.getStudioCounts(3);
	await Promise.resolve();
	assert.equal(calls.length, 2);
	assert.deepEqual(calls.map((entry) => entry.url.pathname).sort(), ["/3/discover/movie", "/3/discover/tv"]);
	for (const call of calls) {
		assert.deepEqual([...call.url.searchParams.entries()], [["with_companies", "3"]]);
		assert.equal(call.init.method, "GET");
	}
	for (const release of releases) release();
	const result = await pending;
	assert.equal(result.ok, true);
	assert.deepEqual([result.data.movie.count, result.data.series.count].sort((a, b) => a - b), [17, 42]);
});

test("a failed Studio count dimension retries alone without disturbing the successful dimension", async () => {
	const calls = [];
	const provider = createTmdbStudioCountProvider({
		baseUrl: "https://worker.example",
		fetchImpl: async (url) => {
			const parsed = new URL(url);
			calls.push(parsed.pathname);
			return jsonResponse({ total_results: parsed.pathname.endsWith("/movie") ? 42 : 17 });
		},
	});
	const initial = await provider.getStudioCounts(3);
	assert.equal(initial.data.movie.count, 42);
	assert.equal(initial.data.series.count, 17);
	const retried = await provider.getStudioCount(3, "series", { bypassCache: true });
	assert.equal(retried.ok, true);
	assert.equal(retried.data.count, 17);
	assert.deepEqual(calls, ["/3/discover/movie", "/3/discover/tv", "/3/discover/tv"]);
	const invalid = await provider.getStudioCount(3, "invented", { bypassCache: true });
	assert.equal(invalid.ok, false);
	assert.equal(calls.length, 3);
});

test("Studio counts preserve zero, partial failure, total failure, and malformed responses independently", async () => {
	for (const scenario of [
		{
			responses: [jsonResponse({ total_results: 0 }), jsonResponse({ total_results: 0 })],
			expected: ["ready", 0, "ready", 0],
		},
		{
			responses: [jsonResponse({ total_results: 12 }), jsonResponse({ error: true }, { status: 503 })],
			expected: ["ready", 12, "unavailable", null],
		},
		{
			responses: [jsonResponse({}, { status: 500 }), jsonResponse({}, { status: 429 })],
			expected: ["unavailable", null, "unavailable", null],
		},
		{
			responses: [jsonResponse({ total_results: "9" }), jsonResponse({ total_results: -1 })],
			expected: ["unavailable", null, "unavailable", null],
		},
	]) {
		let call = 0;
		const provider = createTmdbStudioCountProvider({
			baseUrl: "https://worker.example",
			fetchImpl: async () => scenario.responses[call++],
		});
		const result = await provider.getStudioCounts(3);
		assert.deepEqual([
			result.data.movie.status,
			result.data.movie.count,
			result.data.series.status,
			result.data.series.count,
		], scenario.expected);
		for (const dimension of [result.data.movie, result.data.series]) {
			if (dimension.status === "unavailable") assert.equal(dimension.error.message, "Current count unavailable");
		}
	}
});

test("successful Studio counts reuse bounded fresh cache while refresh, expiry, and eviction bypass it", async () => {
	let calls = 0;
	let now = 1_000;
	const provider = createTmdbStudioCountProvider({
		baseUrl: "https://worker.example",
		cacheTtlMs: 100,
		cacheMaxEntries: 2,
		now: () => now,
		fetchImpl: async () => jsonResponse({ total_results: ++calls }),
	});
	await provider.getStudioCounts(1);
	assert.equal(calls, 2);
	const cached = await provider.getStudioCounts(1);
	assert.equal(calls, 2);
	assert.equal(cached.data.movie.fromCache, true);
	await provider.getStudioCounts(1, { bypassCache: true });
	assert.equal(calls, 4);
	now += 101;
	await provider.getStudioCounts(1);
	assert.equal(calls, 6);
	await provider.getStudioCounts(2);
	assert.equal(calls, 8);
	await provider.getStudioCounts(1);
	assert.equal(calls, 10);
});

test("failed Studio count requests remain retryable and only successes enter cache", async () => {
	let calls = 0;
	const provider = createTmdbStudioCountProvider({
		baseUrl: "https://worker.example",
		fetchImpl: async () => {
			calls += 1;
			return calls <= 2 ? jsonResponse({}, { status: 503 }) : jsonResponse({ total_results: calls });
		},
	});
	const failed = await provider.getStudioCounts(3);
	const retried = await provider.getStudioCounts(3);
	const cached = await provider.getStudioCounts(3);
	assert.equal(failed.data.movie.status, "unavailable");
	assert.equal(retried.data.movie.status, "ready");
	assert.equal(calls, 4);
	assert.equal(cached.data.series.fromCache, true);
});

test("Studio count requests time out and abort without exposing internal response details", async () => {
	const provider = createTmdbStudioCountProvider({
		baseUrl: "https://worker.example",
		timeoutMs: 5,
		fetchImpl: async (_url, init) => new Promise((_resolve, reject) => {
			init.signal.addEventListener("abort", () => reject(new Error("secret upstream detail")), { once: true });
		}),
	});
	const timedOut = await provider.getStudioCounts(3);
	assert.equal(timedOut.data.movie.status, "unavailable");
	assert.equal(timedOut.data.movie.error.message, "Current count unavailable");

	const external = new AbortController();
	const pending = provider.getStudioCounts(4, { signal: external.signal });
	external.abort();
	const aborted = await pending;
	assert.equal(aborted.ok, false);
	assert.equal(aborted.error.kind, "aborted");
});

test("changing Studio aborts the old count pair and stale responses cannot replace the new selection", async () => {
	const calls = [];
	const provider = createTmdbStudioCountProvider({
		baseUrl: "https://worker.example",
		fetchImpl: (url, init) => new Promise((resolve) => {
			calls.push({
				studioId: new URL(url).searchParams.get("with_companies"),
				signal: init.signal,
				resolve,
			});
		}),
	});
	const coordinator = createAsyncRequestCoordinator();
	const first = coordinator.run(
		({ signal }) => provider.getStudioCounts(3, { signal }),
		{ studioId: 3 },
	);
	await Promise.resolve();
	const second = coordinator.run(
		({ signal }) => provider.getStudioCounts(4, { signal }),
		{ studioId: 4 },
	);
	await Promise.resolve();
	assert.equal(calls.length, 4);
	assert.equal(calls.filter((call) => call.studioId === "3").every((call) => call.signal.aborted), true);

	for (const call of calls.filter((entry) => entry.studioId === "4")) {
		call.resolve(jsonResponse({ total_results: 4 }));
	}
	const current = await second;
	assert.equal(current.accepted, true);
	assert.equal(current.result.data.movie.count, 4);

	for (const call of calls.filter((entry) => entry.studioId === "3")) {
		call.resolve(jsonResponse({ total_results: 99 }));
	}
	const stale = await first;
	assert.equal(stale.accepted, false);
	assert.equal(stale.result.error.kind, "aborted");
});

test("Studio count provider rejects unsafe IDs and arbitrary Worker bases before fetching", async () => {
	for (const baseUrl of [
		"http://worker.example",
		"https://worker.example/path",
		"https://user@worker.example",
		"https://worker.example:444",
	]) assert.throws(() => createTmdbStudioCountProvider({ baseUrl, fetchImpl: async () => jsonResponse({}) }), /HTTPS origin/);
	let calls = 0;
	const provider = createTmdbStudioCountProvider({ baseUrl: "https://worker.example", fetchImpl: async () => { calls += 1; return jsonResponse({}); } });
	for (const id of [0, -1, 1.5, "3", Number.MAX_SAFE_INTEGER + 1]) {
		const result = await provider.getStudioCounts(id);
		assert.equal(result.ok, false);
		assert.equal(result.error.retryable, false);
	}
	assert.equal(calls, 0);
});

test("repository-retained COMPANY Movie and TV contracts serialize with media-specific sorts", () => {
	const movie = STUDIO_SOURCE_OPTIONS.find((option) => option.mediaType === "MOVIE");
	const series = STUDIO_SOURCE_OPTIONS.find((option) => option.mediaType === "TV");
	assert.equal(movie.supported, true);
	assert.equal(series.supported, true);
	assert.equal(validateStudioSourceSelection([movie.id]).ok, true);
	assert.equal(validateStudioSourceSelection([series.id]).ok, true);
	const built = buildStudioSourceDrafts(studio(), { choices: [movie.id, series.id], sortOptionId: "recent" });
	assert.equal(built.ok, true);
	assert.equal(DEFAULT_STUDIO_MOVIE_SORT, "popularity.desc");
	assert.equal(DEFAULT_STUDIO_SORT_OPTION_ID, "popular");
	assert.deepEqual(STUDIO_MOVIE_SORT_OPTIONS.map((option) => option.value), [
		"popularity.desc",
		"primary_release_date.desc",
		"vote_average.desc",
		"vote_count.desc",
	]);
	assert.deepEqual(built.drafts, [{
		category: "native-tmdb",
		editable: {
			title: "Pixar",
			sortBy: "primary_release_date.desc",
			tmdbId: 3,
			filters: {},
			provider: "tmdb",
			mediaType: "MOVIE",
			tmdbSourceType: "COMPANY",
		},
	}, {
		category: "native-tmdb",
		editable: {
			title: "Pixar Series",
			sortBy: "first_air_date.desc",
			tmdbId: 3,
			filters: {},
			provider: "tmdb",
			mediaType: "TV",
			tmdbSourceType: "COMPANY",
		},
	}]);
	assert.equal(validateStudioSourceDraft({ ...built.drafts[0], extra: true }, { studio: studio() }).ok, false);
	assert.equal(validateStudioSourceDraft(built.drafts[1], { studio: studio() }).ok, true);
	assert.equal(buildStudioSourceDrafts(studio(), { choices: [movie.id], sortBy: "invented.desc" }).ok, false);
});

test("every Studio sort maps correctly for Movie and TV and survives a project round trip", () => {
	for (const option of STUDIO_SORT_OPTIONS) {
		const { controller, folder } = createSelectedFolderController();
		const drafts = buildStudioSourceDrafts(studio(), { choices: ["studio-movies", "studio-series"], sortOptionId: option.id }).drafts;
		assert.equal(createStudioSourceBundle(controller, { folderInternalId: folder.internalId, studio: studio(), drafts }).ok, true, option.id);
		const first = serializeNuvioProject(controller.getState().project);
		assert.deepEqual(first.value[0].folders[0].sources.map((source) => source.sortBy), [option.values.MOVIE, option.values.TV]);
		assert.equal(studioSortValue(option.id, "MOVIE"), option.values.MOVIE);
		assert.equal(studioSortValue(option.id, "TV"), option.values.TV);
		const imported = importNuvioCollections(first.value, { idFactory: countingIdFactory(`round-${option.id}`) });
		assert.equal(imported.ok, true);
		assert.deepEqual(serializeNuvioProject(imported.project).value, first.value);
	}
});

test("Studio duplicate identity is media-specific and normalizes imported casing and numeric strings", () => {
	assert.equal(studioSourceIdentity({ provider: "TMDB", tmdbSourceType: "company", tmdbId: "3", mediaType: "movie" }), "tmdb|COMPANY|3|MOVIE");
	const { controller, folder } = createSelectedFolderController({ sources: [
		{ provider: "TMDB", title: "Existing movies", tmdbSourceType: "company", tmdbId: "3", mediaType: "movie" },
		{ provider: "tmdb", title: "Existing series", tmdbSourceType: "COMPANY", tmdbId: 3, mediaType: "TV" },
	] });
	const review = inspectStudioSourceDuplicates(controller.getState().project, folder.internalId, 3);
	assert.deepEqual(review.destination.map((entry) => entry.mediaType), ["MOVIE", "TV"]);
	assert.notEqual(review.destination[0].identity, review.destination[1].identity);
	assert.deepEqual(review.destination.map((entry) => [entry.collectionTitle, entry.folderTitle]), [["Studios", "Animation Studios"], ["Studios", "Animation Studios"]]);
});

test("Studio partial duplicates add only missing sources unless the exact configured identity set is approved", () => {
	const existingMovie = {
		provider: "tmdb", title: "Custom display title", tmdbSourceType: "COMPANY", tmdbId: 3,
		mediaType: "MOVIE", sortBy: "popularity.desc", filters: {},
	};
	const configured = buildStudioSourceDrafts(studio(), { choices: ["studio-movies", "studio-series"] }).drafts;
	const normal = createSelectedFolderController({ sources: [existingMovie] });
	const normalResult = createStudioSourceBundle(normal.controller, {
		folderInternalId: normal.folder.internalId,
		studio: studio(),
		drafts: configured,
	});
	assert.equal(normalResult.ok, true);
	assert.equal(normalResult.addedSourceCount, 1);
	assert.equal(normalResult.duplicateOverrideUsed, false);
	assert.deepEqual(normal.controller.getState().project.collections[0].folders[0].sources.map((source) => source.editable.mediaType), ["MOVIE", "TV"]);

	const overridden = createSelectedFolderController({ sources: [existingMovie] });
	const approval = studioDuplicateOverrideIdentity(overridden.folder.internalId, configured);
	const overrideResult = createStudioSourceBundle(overridden.controller, {
		folderInternalId: overridden.folder.internalId,
		studio: studio(),
		drafts: configured,
		duplicateOverrideIdentity: approval,
	});
	assert.equal(overrideResult.ok, true);
	assert.equal(overrideResult.addedSourceCount, 2);
	assert.equal(overrideResult.duplicateOverrideUsed, true);
	assert.deepEqual(overridden.controller.getState().project.collections[0].folders[0].sources.map((source) => source.editable.mediaType), ["MOVIE", "MOVIE", "TV"]);
});

test("Studio duplicate override invalidates when the configured physical identity set changes", () => {
	const existingMovie = {
		provider: "tmdb", title: "Pixar", tmdbSourceType: "COMPANY", tmdbId: 3,
		mediaType: "MOVIE", sortBy: "popularity.desc", filters: {},
	};
	const { controller, folder } = createSelectedFolderController({ sources: [existingMovie] });
	const movieOnly = buildStudioSourceDrafts(studio(), { choices: ["studio-movies"] }).drafts;
	const both = buildStudioSourceDrafts(studio(), { choices: ["studio-movies", "studio-series"] }).drafts;
	const staleApproval = studioDuplicateOverrideIdentity(folder.internalId, movieOnly);
	assert.notEqual(staleApproval, studioDuplicateOverrideIdentity(folder.internalId, both));
	const result = createStudioSourceBundle(controller, {
		folderInternalId: folder.internalId,
		studio: studio(),
		drafts: both,
		duplicateOverrideIdentity: staleApproval,
	});
	assert.equal(result.ok, true);
	assert.equal(result.addedSourceCount, 1);
	assert.equal(result.duplicateOverrideUsed, false);
});

test("Studio full duplicates require the exact Add-all override and recheck immediately before commit", () => {
	const existing = [
		{ provider: "tmdb", title: "Movies renamed", tmdbSourceType: "COMPANY", tmdbId: 3, mediaType: "MOVIE", sortBy: "popularity.desc", filters: {} },
		{ provider: "tmdb", title: "Series renamed", tmdbSourceType: "COMPANY", tmdbId: 3, mediaType: "TV", sortBy: "popularity.desc", filters: {} },
	];
	const configured = buildStudioSourceDrafts(studio(), { choices: ["studio-movies", "studio-series"] }).drafts;
	const { controller, folder } = createSelectedFolderController({ sources: existing });
	const before = JSON.stringify(controller.getState().project);
	const blocked = createStudioSourceBundle(controller, { folderInternalId: folder.internalId, studio: studio(), drafts: configured });
	assert.equal(blocked.ok, false);
	assert.equal(blocked.requiresDuplicateOverride, true);
	assert.equal(JSON.stringify(controller.getState().project), before);
	const approved = createStudioSourceBundle(controller, {
		folderInternalId: folder.internalId,
		studio: studio(),
		drafts: configured,
		duplicateOverrideIdentity: studioDuplicateOverrideIdentity(folder.internalId, configured),
	});
	assert.equal(approved.ok, true);
	assert.equal(approved.addedSourceCount, 2);
	assert.equal(approved.duplicateOverrideUsed, true);
});

test("Studio Movie and Series insertion is atomic, projection-free, Movie-first, and stable through a round trip", () => {
	const { controller, folder } = createSelectedFolderController();
	const drafts = buildStudioSourceDrafts(studio(), { choices: ["studio-series", "studio-movies"] }).drafts;
	const beforeRevision = controller.getState().revision;
	const result = createStudioSourceBundle(controller, { folderInternalId: folder.internalId, studio: studio(), drafts });
	assert.equal(result.ok, true);
	assert.equal(result.addedSourceCount, 2);
	assert.equal(controller.getState().revision, beforeRevision + 1);
	const serialized = serializeNuvioProject(controller.getState().project);
	assert.equal(serialized.ok, true);
	assert.deepEqual(serialized.value[0].folders[0].sources, drafts.map((draft) => draft.editable));
	assert.deepEqual(serialized.value[0].folders[0].sources.map((source) => source.mediaType), ["MOVIE", "TV"]);
	assert.deepEqual(serialized.value[0].folders[0].catalogSources, []);
	assert.equal(serialized.value[0].folders[0].unknownFolderValue, "preserve");
	assert.equal(serialized.value[0].unknownCollectionValue, true);
	assert.equal(JSON.stringify(serialized.value).includes("internalId"), false);

	const imported = importNuvioCollections(serialized.value, { idFactory: countingIdFactory("round") });
	assert.equal(imported.ok, true);
	const second = serializeNuvioProject(imported.project);
	assert.equal(second.ok, true);
	assert.deepEqual(second.value, serialized.value);
});

test("existing Studio Movie prevents only that choice and failure paths do not mutate", () => {
	const existing = {
		provider: "tmdb",
		title: "Pixar",
		tmdbSourceType: "COMPANY",
		tmdbId: 3,
		mediaType: "MOVIE",
		sortBy: "popularity.desc",
		filters: {},
	};
	const { controller, folder } = createSelectedFolderController({ sources: [existing] });
	const before = JSON.stringify(controller.getState().project);
	const drafts = buildStudioSourceDrafts(studio(), { choices: ["studio-movies"] }).drafts;
	const duplicate = createStudioSourceBundle(controller, { folderInternalId: folder.internalId, studio: studio(), drafts });
	assert.equal(duplicate.ok, false);
	assert.equal(duplicate.errors[0].code, "STUDIO_SOURCES_ALREADY_EXIST");
	assert.equal(JSON.stringify(controller.getState().project), before);
	const locked = createStudioSourceBundle(controller, { folderInternalId: folder.internalId, studio: studio({ id: 4, name: "Another" }), drafts: buildStudioSourceDrafts(studio({ id: 4, name: "Another" }), { choices: ["studio-movies"] }).drafts, interactionLocked: true });
	assert.equal(locked.ok, false);
	assert.equal(JSON.stringify(controller.getState().project), before);
});
