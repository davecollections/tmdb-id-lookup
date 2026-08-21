import assert from "node:assert/strict";
import test from "node:test";

import { buildGenreSourceDrafts } from "../builder/src/source-add/genre-source.js";
import { createGenreAdvancedState } from "../builder/src/source-add/genre-advanced.js";
import {
	createTmdbGenrePreviewProvider,
	genrePreviewQueryFromDraft,
	normalizeTmdbGenrePreviewResponse,
	TMDB_GENRE_PREVIEW_CACHE_MAX_ENTRIES,
	TMDB_GENRE_PREVIEW_CACHE_TTL_MS,
	TMDB_GENRE_PREVIEW_REQUEST_TIMEOUT_MS,
} from "../builder/src/source-add/tmdb-genre-preview-provider.js";

function jsonResponse(value, { status = 200 } = {}) {
	return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

function previewPayload(mediaType = "MOVIE", totalResults = 12) {
	return {
		total_results: totalResults,
		results: mediaType === "MOVIE"
			? [{ id: 20, title: "Movie upstream", release_date: "2020-02-02", poster_path: "/movie.jpg" }]
			: [{ id: 30, name: "Series upstream", first_air_date: "2021-03-03", poster_path: "/series.jpg" }],
	};
}

function sourceDraft(genreName, mediaType, options = {}) {
	const built = buildGenreSourceDrafts([genreName], options);
	assert.equal(built.ok, true);
	const draft = built.drafts.find((entry) => entry.editable.mediaType === mediaType);
	assert.ok(draft);
	return draft;
}

test("Genre Preview shares Discover limits and normalizes Movie and TV payloads", () => {
	assert.equal(TMDB_GENRE_PREVIEW_CACHE_TTL_MS, 5 * 60 * 1000);
	assert.equal(TMDB_GENRE_PREVIEW_CACHE_MAX_ENTRIES, 40);
	assert.equal(TMDB_GENRE_PREVIEW_REQUEST_TIMEOUT_MS, 12_000);
	assert.equal(normalizeTmdbGenrePreviewResponse(previewPayload("MOVIE", 72), "MOVIE").totalResults, 72);
	assert.equal(normalizeTmdbGenrePreviewResponse(previewPayload("TV", 41), "TV").results[0].title, "Series upstream");
	assert.equal(normalizeTmdbGenrePreviewResponse({ total_results: 1, results: [{ id: 1 }] }, "MOVIE"), null);
	assert.equal(normalizeTmdbGenrePreviewResponse({ total_results: -1, results: [] }, "TV"), null);
});

test("Genre Preview derives the exact media-correct TMDB query from the reviewed source draft", async () => {
	const advanced = createGenreAdvancedState({
		yearFrom: "2015",
		yearTo: "2026",
		minimumRating: "6.5",
		maximumRating: "9",
		minimumVotes: "250",
		originalLanguage: "en",
		originCountry: "AU",
		exclusionsByGenre: { Animation: ["Comedy"] },
	});
	const movie = sourceDraft("Animation", "MOVIE", { sortOptionId: "recent", advanced });
	const series = sourceDraft("Animation", "TV", { sortOptionId: "recent", advanced });
	assert.deepEqual(genrePreviewQueryFromDraft(movie), {
		mediaType: "MOVIE",
		queryParameters: {
			include_adult: "false",
			sort_by: "primary_release_date.desc",
			with_genres: "16",
			"primary_release_date.gte": "2015-01-01",
			"primary_release_date.lte": "2026-12-31",
			"vote_average.gte": "6.5",
			"vote_average.lte": "9",
			"vote_count.gte": "250",
			with_original_language: "en",
			with_origin_country: "AU",
			without_genres: "35",
		},
	});
	assert.equal(genrePreviewQueryFromDraft(series).queryParameters["first_air_date.gte"], "2015-01-01");
	assert.equal(genrePreviewQueryFromDraft(series).queryParameters["primary_release_date.gte"], undefined);

	const urls = [];
	const provider = createTmdbGenrePreviewProvider({
		baseUrl: "https://worker.example",
		fetchImpl: async (url) => {
			urls.push(new URL(url));
			return jsonResponse(previewPayload(new URL(url).pathname.endsWith("/tv") ? "TV" : "MOVIE"));
		},
	});
	assert.equal((await provider.getGenrePreview(movie)).ok, true);
	assert.equal((await provider.getGenrePreview(series)).ok, true);
	assert.equal(urls[0].pathname, "/3/discover/movie");
	assert.equal(urls[1].pathname, "/3/discover/tv");
	for (const [key, value] of Object.entries(genrePreviewQueryFromDraft(movie).queryParameters)) assert.equal(urls[0].searchParams.get(key), value);
	for (const [key, value] of Object.entries(genrePreviewQueryFromDraft(series).queryParameters)) assert.equal(urls[1].searchParams.get(key), value);
});

test("Genre Preview validates exact source drafts and all four media-correct sorts before requesting", async () => {
	let calls = 0;
	const provider = createTmdbGenrePreviewProvider({
		baseUrl: "https://worker.example",
		fetchImpl: async (url) => {
			calls += 1;
			return jsonResponse(previewPayload(new URL(url).pathname.endsWith("/tv") ? "TV" : "MOVIE"));
		},
	});
	for (const sortOptionId of ["popular", "recent", "top-rated", "most-votes"]) {
		assert.equal((await provider.getGenrePreview(sourceDraft("Horror", "MOVIE", { sortOptionId }))).ok, true);
		assert.equal((await provider.getGenrePreview(sourceDraft("Action & Adventure", "TV", { sortOptionId }))).ok, true);
	}
	assert.equal(calls, 8);
	for (const invalid of [
		null,
		{ category: "native-tmdb", editable: { ...sourceDraft("Horror", "MOVIE").editable, filters: { withGenres: "27|35" } } },
		{ ...sourceDraft("Horror", "MOVIE"), editable: { ...sourceDraft("Horror", "MOVIE").editable, sortBy: "revenue.desc" } },
	]) {
		const result = await provider.getGenrePreview(invalid);
		assert.equal(result.error.kind, "invalid-request");
		assert.equal(result.error.retryable, false);
	}
	assert.equal(calls, 8);
});

test("Genre Preview cache identity includes every exact filter and caches successful zero only", async () => {
	let calls = 0;
	const provider = createTmdbGenrePreviewProvider({
		baseUrl: "https://worker.example",
		fetchImpl: async () => { calls += 1; return jsonResponse({ total_results: 0, results: [] }); },
	});
	const base = sourceDraft("Horror", "MOVIE");
	const advanced = sourceDraft("Horror", "MOVIE", { advanced: createGenreAdvancedState({ yearFrom: "2015", minimumRating: "6.5", exclusionsByGenre: { Horror: ["Comedy"] } }) });
	assert.equal((await provider.getGenrePreview(base)).fromCache, false);
	assert.equal((await provider.getGenrePreview(base)).fromCache, true);
	assert.equal((await provider.getGenrePreview(advanced)).fromCache, false);
	assert.equal((await provider.getGenrePreview(advanced)).fromCache, true);
	assert.equal(calls, 2);

	let failures = 0;
	const failing = createTmdbGenrePreviewProvider({ baseUrl: "https://worker.example", fetchImpl: async () => { failures += 1; return jsonResponse({}, { status: 500 }); } });
	assert.equal((await failing.getGenrePreview(base)).error.kind, "provider");
	assert.equal((await failing.getGenrePreview(base)).error.kind, "provider");
	assert.equal(failures, 2);
});

test("Genre Preview success cache expires and evicts least-recently-used exact queries", async () => {
	let now = 0;
	let calls = 0;
	const provider = createTmdbGenrePreviewProvider({
		baseUrl: "https://worker.example",
		cacheTtlMs: 10,
		cacheMaxEntries: 2,
		now: () => now,
		fetchImpl: async () => { calls += 1; return jsonResponse(previewPayload()); },
	});
	const popular = sourceDraft("Horror", "MOVIE", { sortOptionId: "popular" });
	const recent = sourceDraft("Horror", "MOVIE", { sortOptionId: "recent" });
	const topRated = sourceDraft("Horror", "MOVIE", { sortOptionId: "top-rated" });
	await provider.getGenrePreview(popular);
	await provider.getGenrePreview(recent);
	assert.equal((await provider.getGenrePreview(popular)).fromCache, true);
	await provider.getGenrePreview(topRated);
	assert.equal((await provider.getGenrePreview(recent)).fromCache, false);
	now = 20;
	assert.equal((await provider.getGenrePreview(popular)).fromCache, false);
	assert.equal(calls, 5);
});

test("malformed, timeout, abort, and stale-after-headers Genre Preview outcomes remain uncached", async () => {
	const draft = sourceDraft("Horror", "MOVIE");
	let malformedCalls = 0;
	const malformed = createTmdbGenrePreviewProvider({
		baseUrl: "https://worker.example",
		fetchImpl: async () => { malformedCalls += 1; return jsonResponse({ total_results: 1, results: [{ id: 1 }] }); },
	});
	assert.equal((await malformed.getGenrePreview(draft)).error.kind, "invalid-response");
	assert.equal((await malformed.getGenrePreview(draft)).error.kind, "invalid-response");
	assert.equal(malformedCalls, 2);

	const timeout = createTmdbGenrePreviewProvider({
		baseUrl: "https://worker.example",
		timeoutMs: 2,
		fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true })),
	});
	assert.equal((await timeout.getGenrePreview(draft)).error.kind, "timeout");

	let abortCalls = 0;
	const aborting = createTmdbGenrePreviewProvider({
		baseUrl: "https://worker.example",
		fetchImpl: async (_url, { signal }) => new Promise((resolve, reject) => {
			abortCalls += 1;
			signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
			setTimeout(() => resolve(jsonResponse(previewPayload())), 50);
		}),
	});
	const controller = new AbortController();
	const pending = aborting.getGenrePreview(draft, { signal: controller.signal });
	controller.abort();
	assert.equal((await pending).error.kind, "aborted");
	assert.equal((await aborting.getGenrePreview(draft)).fromCache, false);
	assert.equal(abortCalls, 2);

	let calls = 0;
	let releaseJson;
	let jsonStarted;
	const started = new Promise((resolve) => { jsonStarted = resolve; });
	const stale = createTmdbGenrePreviewProvider({
		baseUrl: "https://worker.example",
		fetchImpl: async () => {
			calls += 1;
			if (calls > 1) return jsonResponse(previewPayload());
			return { ok: true, status: 200, headers: { get: () => "application/json" }, async json() { jsonStarted(); await new Promise((resolve) => { releaseJson = resolve; }); return previewPayload(); } };
		},
	});
	const staleController = new AbortController();
	const stalePending = stale.getGenrePreview(draft, { signal: staleController.signal });
	await started;
	staleController.abort();
	releaseJson();
	assert.equal((await stalePending).error.kind, "aborted");
	assert.equal((await stale.getGenrePreview(draft)).fromCache, false);
	assert.equal(calls, 2);
});
