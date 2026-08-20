import assert from "node:assert/strict";
import test from "node:test";

import { NETWORK_SORT_OPTIONS } from "../builder/src/source-add/network-source.js";
import {
	createTmdbNetworkPreviewProvider,
	normalizeTmdbNetworkPreviewResponse,
	TMDB_NETWORK_PREVIEW_CACHE_MAX_ENTRIES,
	TMDB_NETWORK_PREVIEW_CACHE_TTL_MS,
	TMDB_NETWORK_PREVIEW_REQUEST_TIMEOUT_MS,
} from "../builder/src/source-add/tmdb-network-preview-provider.js";

function jsonResponse(value, { status = 200 } = {}) {
	return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

function previewPayload(totalResults = 12) {
	return {
		total_results: totalResults,
		results: [
			{ id: 20, name: "Second upstream", first_air_date: "2020-02-02", poster_path: "/second.jpg" },
			{ id: 10, name: "First upstream", first_air_date: "2010-01-01", poster_path: null },
		],
	};
}

test("Network Preview shares the bounded Discover defaults and normalizes fixed-TV results", () => {
	assert.equal(TMDB_NETWORK_PREVIEW_CACHE_TTL_MS, 5 * 60 * 1000);
	assert.equal(TMDB_NETWORK_PREVIEW_CACHE_MAX_ENTRIES, 40);
	assert.equal(TMDB_NETWORK_PREVIEW_REQUEST_TIMEOUT_MS, 12_000);
	const normalized = normalizeTmdbNetworkPreviewResponse(previewPayload(72));
	assert.equal(normalized.totalResults, 72);
	assert.equal(normalized.mediaType, "TV");
	assert.deepEqual(normalized.results.map((entry) => entry.id), [20, 10]);
	assert.deepEqual(normalized.results.map((entry) => entry.title), ["Second upstream", "First upstream"]);
	assert.equal(normalizeTmdbNetworkPreviewResponse({ total_results: 1, results: [{ id: 1, title: "Movie-only" }] }), null);
	assert.equal(normalizeTmdbNetworkPreviewResponse({ total_results: -1, results: [] }), null);
});

test("Network Preview requests fixed TV with exact Network sorts and typed success-cache keys", async () => {
	const urls = [];
	const provider = createTmdbNetworkPreviewProvider({
		baseUrl: "https://worker.example",
		fetchImpl: async (url) => {
			urls.push(new URL(url));
			return jsonResponse(previewPayload(1_742));
		},
	});

	for (const option of NETWORK_SORT_OPTIONS) {
		const result = await provider.getNetworkPreview(17, { sortOptionId: option.id });
		assert.equal(result.ok, true);
		assert.equal(result.data.mediaType, "TV");
	}
	assert.equal((await provider.getNetworkPreview(17, { sortBy: "popularity.desc" })).fromCache, true);
	assert.equal((await provider.getNetworkPreview(18, { sortOptionId: "popular" })).fromCache, false);

	assert.equal(urls.length, 5);
	assert.ok(urls.every((url) => url.pathname === "/3/discover/tv"));
	assert.ok(urls.every((url) => url.searchParams.get("with_companies") === null));
	assert.deepEqual(urls.map((url) => url.searchParams.get("with_networks")), ["17", "17", "17", "17", "18"]);
	assert.deepEqual(urls.map((url) => url.searchParams.get("sort_by")), [
		"popularity.desc",
		"first_air_date.desc",
		"vote_average.desc",
		"vote_count.desc",
		"popularity.desc",
	]);
});

test("Network Preview rejects unsupported identity and sort inputs before requesting", async () => {
	let calls = 0;
	const provider = createTmdbNetworkPreviewProvider({
		baseUrl: "https://worker.example",
		fetchImpl: async () => { calls += 1; return jsonResponse(previewPayload()); },
	});
	const invalidId = await provider.getNetworkPreview(0, { sortOptionId: "popular" });
	const missingSort = await provider.getNetworkPreview(1);
	const movieSort = await provider.getNetworkPreview(1, { sortBy: "primary_release_date.desc" });
	assert.deepEqual([invalidId.error.kind, missingSort.error.kind, movieSort.error.kind], ["invalid-request", "invalid-request", "invalid-request"]);
	assert.equal(invalidId.error.retryable, false);
	assert.equal(calls, 0);
});

test("Network Preview caches successful zero responses while provider failures retry", async () => {
	let zeroCalls = 0;
	const zeroProvider = createTmdbNetworkPreviewProvider({
		baseUrl: "https://worker.example",
		fetchImpl: async () => { zeroCalls += 1; return jsonResponse({ total_results: 0, results: [] }); },
	});
	assert.equal((await zeroProvider.getNetworkPreview(9, { sortOptionId: "popular" })).data.totalResults, 0);
	assert.equal((await zeroProvider.getNetworkPreview(9, { sortOptionId: "popular" })).fromCache, true);
	assert.equal(zeroCalls, 1);

	let failureCalls = 0;
	const failingProvider = createTmdbNetworkPreviewProvider({
		baseUrl: "https://worker.example",
		fetchImpl: async () => { failureCalls += 1; return jsonResponse({}, { status: 500 }); },
	});
	assert.equal((await failingProvider.getNetworkPreview(9, { sortOptionId: "popular" })).error.kind, "provider");
	assert.equal((await failingProvider.getNetworkPreview(9, { sortOptionId: "popular" })).error.kind, "provider");
	assert.equal(failureCalls, 2);
});

test("Network Preview success cache expires and evicts least-recently-used keys", async () => {
	let now = 0;
	let calls = 0;
	const provider = createTmdbNetworkPreviewProvider({
		baseUrl: "https://worker.example",
		cacheTtlMs: 10,
		cacheMaxEntries: 2,
		now: () => now,
		fetchImpl: async () => { calls += 1; return jsonResponse(previewPayload()); },
	});
	await provider.getNetworkPreview(1, { sortOptionId: "popular" });
	await provider.getNetworkPreview(2, { sortOptionId: "popular" });
	assert.equal((await provider.getNetworkPreview(1, { sortOptionId: "popular" })).fromCache, true);
	await provider.getNetworkPreview(3, { sortOptionId: "popular" });
	assert.equal((await provider.getNetworkPreview(2, { sortOptionId: "popular" })).fromCache, false);
	now = 20;
	assert.equal((await provider.getNetworkPreview(1, { sortOptionId: "popular" })).fromCache, false);
	assert.equal(calls, 5);
});

test("malformed and timed-out Network Preview responses remain uncached", async () => {
	let malformedCalls = 0;
	const malformed = createTmdbNetworkPreviewProvider({
		baseUrl: "https://worker.example",
		fetchImpl: async () => { malformedCalls += 1; return jsonResponse({ total_results: 1, results: [{ id: 1 }] }); },
	});
	assert.equal((await malformed.getNetworkPreview(5, { sortOptionId: "popular" })).error.kind, "invalid-response");
	assert.equal((await malformed.getNetworkPreview(5, { sortOptionId: "popular" })).error.kind, "invalid-response");
	assert.equal(malformedCalls, 2);
	const timeout = createTmdbNetworkPreviewProvider({
		baseUrl: "https://worker.example",
		timeoutMs: 2,
		fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true })),
	});
	assert.equal((await timeout.getNetworkPreview(5, { sortOptionId: "popular" })).error.kind, "timeout");
});

test("Network Preview aborts superseded work without caching it", async () => {
	let calls = 0;
	const provider = createTmdbNetworkPreviewProvider({
		baseUrl: "https://worker.example",
		fetchImpl: async (_url, { signal }) => new Promise((resolve, reject) => {
			calls += 1;
			signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
			setTimeout(() => resolve(jsonResponse(previewPayload())), 50);
		}),
	});
	const controller = new AbortController();
	const pending = provider.getNetworkPreview(4, { sortOptionId: "popular", signal: controller.signal });
	controller.abort();
	const aborted = await pending;
	assert.equal(aborted.error.kind, "aborted");
	assert.equal(aborted.error.message, "The superseded Network preview was cancelled.");
	assert.equal((await provider.getNetworkPreview(4, { sortOptionId: "popular" })).fromCache, false);
	assert.equal(calls, 2);
});

test("Network Preview suppresses an abort after headers and before JSON completion", async () => {
	let calls = 0;
	let releaseJson;
	let jsonStarted;
	const started = new Promise((resolve) => { jsonStarted = resolve; });
	const provider = createTmdbNetworkPreviewProvider({
		baseUrl: "https://worker.example",
		fetchImpl: async () => {
			calls += 1;
			if (calls > 1) return jsonResponse(previewPayload());
			return {
				ok: true,
				status: 200,
				headers: { get: () => "application/json" },
				async json() {
					jsonStarted();
					await new Promise((resolve) => { releaseJson = resolve; });
					return previewPayload();
				},
			};
		},
	});
	const controller = new AbortController();
	const pending = provider.getNetworkPreview(6, { sortOptionId: "popular", signal: controller.signal });
	await started;
	controller.abort();
	releaseJson();
	assert.equal((await pending).error.kind, "aborted");
	assert.equal((await provider.getNetworkPreview(6, { sortOptionId: "popular" })).fromCache, false);
	assert.equal(calls, 2);
});
