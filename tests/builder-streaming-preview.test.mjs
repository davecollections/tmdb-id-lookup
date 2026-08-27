import assert from "node:assert/strict";
import test from "node:test";

import {
	createTmdbStreamingPreviewProvider,
	streamingPreviewQueryFromSource,
} from "../builder/src/source-add/index.js";

function source(overrides = {}) {
	return {
		nodeType: "source",
		category: "native-tmdb",
		internalId: "source-1",
		editable: {
			provider: "tmdb",
			title: "Netflix · AU",
			tmdbSourceType: "DISCOVER",
			tmdbId: null,
			mediaType: "MOVIE",
			sortBy: "popularity.desc",
			filters: { watchRegion: "AU", withWatchProviders: "8" },
			...overrides,
		},
	};
}

function response(value) {
	return new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } });
}

test("Streaming Preview derives only the exact simple provider, region, media and sort query", () => {
	assert.deepEqual(streamingPreviewQueryFromSource(source()), {
		mediaType: "MOVIE",
		queryParameters: {
			include_adult: "false",
			sort_by: "popularity.desc",
			watch_region: "AU",
			with_watch_providers: "8",
		},
	});
	assert.deepEqual(streamingPreviewQueryFromSource(source({ mediaType: "TV", sortBy: "first_air_date.desc" })), {
		mediaType: "TV",
		queryParameters: { include_adult: "false", sort_by: "first_air_date.desc", watch_region: "AU", with_watch_providers: "8" },
	});
	for (const invalid of [
		source({ sortBy: "community.special" }),
		source({ filters: { watchRegion: "AU", withWatchProviders: "8|9" } }),
		source({ filters: { watchRegion: "AU", withWatchProviders: "8", withGenres: "35" } }),
		source({ filters: { watchRegion: "au", withWatchProviders: "8" } }),
	]) assert.equal(streamingPreviewQueryFromSource(invalid), null);
});

test("Streaming Preview respects raw imported effective values and current editable sort", () => {
	const candidate = source();
	candidate.rawImported = { ...candidate.editable, sortBy: "community.old", legacyNull: null };
	candidate.editable = { sortBy: "vote_count.desc" };
	const query = streamingPreviewQueryFromSource(candidate);
	assert.equal(query.queryParameters.sort_by, "vote_count.desc");
	assert.equal(query.queryParameters.watch_region, "AU");
	assert.equal(query.queryParameters.with_watch_providers, "8");
});

test("Streaming Preview caches successful zero, normalizes posters, and does not cache malformed responses", async () => {
	let calls = 0;
	const provider = createTmdbStreamingPreviewProvider({
		baseUrl: "https://worker.example",
		fetchImpl: async (url) => {
			calls += 1;
			assert.equal(new URL(url).pathname, "/3/discover/movie");
			return response({ total_results: 1, results: [{ id: 10, title: "Movie", release_date: "2024-01-02", poster_path: "/poster.jpg" }] });
		},
	});
	const first = await provider.getStreamingPreview(source());
	const second = await provider.getStreamingPreview(source());
	assert.equal(first.ok, true);
	assert.equal(first.data.results[0].posterPath, "/poster.jpg");
	assert.equal(second.fromCache, true);
	assert.equal(calls, 1);

	let malformedCalls = 0;
	const malformed = createTmdbStreamingPreviewProvider({ baseUrl: "https://worker.example", fetchImpl: async () => { malformedCalls += 1; return response({ results: [] }); } });
	assert.equal((await malformed.getStreamingPreview(source())).ok, false);
	assert.equal((await malformed.getStreamingPreview(source())).ok, false);
	assert.equal(malformedCalls, 2);
});
