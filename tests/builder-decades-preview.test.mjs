import assert from "node:assert/strict";
import test from "node:test";

import {
	buildDecadesPreviewGroups,
	buildDecadesSourceDrafts,
	createTmdbDecadesPreviewProvider,
	decadesRepresentativeItems,
	decadePreviewQueryFromDraft,
	selectEvenlyDistributed,
} from "../builder/src/source-add/index.js";

function configuration(overrides = {}) {
	return {
		selectedDecadeIds: ["1980s"],
		mediaMode: "movies",
		content: { wholeDecade: true, individualYears: false, genreBreakdown: false },
		currentYear: 2026,
		sortOptionId: "popular",
		genreNames: [],
		advanced: {},
		...overrides,
	};
}

function response(value) {
	return new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } });
}

test("Decades Preview groups logical rows from the exact source drafts and preserves configured ordering", () => {
	const result = buildDecadesPreviewGroups(configuration({
		selectedDecadeIds: ["1980s", "2000s"],
		mediaMode: "both",
		content: { wholeDecade: true, individualYears: true, genreBreakdown: true },
		genreNames: ["Comedy"],
		decadeOrder: "newest-first",
		yearOrder: "newest-first",
	}));
	assert.equal(result.ok, true);
	assert.deepEqual(result.groups.map((group) => group.decadeId), ["2000s", "1980s"]);
	assert.deepEqual(result.groups[0].rows.slice(0, 4).map((row) => row.label), ["All 2000s", "2009", "2008", "2007"]);
	assert.equal(result.groups[0].rows.at(-1).label, "2000s · Comedy");
	assert.equal(result.groups[0].logicalSourceCount, 12);
	assert.deepEqual(result.groups[0].choices.slice(0, 4).map((choice) => choice.selectorLabel), ["Decade sample", "All 2000s", "2009", "2008"]);
	assert.equal(result.groups[0].choices.at(-1).selectorLabel, "Comedy");
	assert.ok(result.groups.every((group) => group.rows.every((row) => row.drafts.map((draft) => draft.editable.mediaType).join(",") === "MOVIE,TV")));
});

test("representative samples use canonical year buckets, preserve current filters, and stay preview-only", () => {
	const older = buildDecadesPreviewGroups(configuration({
		selectedDecadeIds: ["2010s"],
		mediaMode: "both",
		content: { wholeDecade: true, individualYears: false, genreBreakdown: true },
		genreNames: ["Action"],
		sortOptionId: "recent",
		advanced: {
			minimumRating: 6.5,
			maximumRating: 9,
			minimumVotes: 100,
			originalLanguage: "en",
			originCountry: "AU",
			ordinaryExcludedGenres: ["Comedy"],
			exclusionsByGenre: { Action: ["Documentary"] },
		},
	}));
	assert.equal(older.ok, true);
	const group = older.groups[0];
	const sample = group.choices[0];
	assert.equal(group.logicalSourceCount, 2);
	assert.deepEqual(group.choices.map((choice) => choice.selectorLabel), ["Decade sample", "All 2010s", "Action"]);
	assert.deepEqual(sample.requests.map((request) => request.mediaType), ["MOVIE", "TV"]);
	for (const request of sample.requests) {
		assert.deepEqual(request.bucketLabels, ["2010", "2011", "2012", "2013", "2014", "2015", "2016", "2017", "2018", "2019"]);
		for (const draft of request.drafts) {
			assert.equal(draft.editable.sortBy, request.mediaType === "MOVIE" ? "primary_release_date.desc" : "first_air_date.desc");
			assert.equal(Object.hasOwn(draft.editable.filters, "withGenres"), false);
			assert.equal(draft.editable.filters.voteAverageGte, 6.5);
			assert.equal(draft.editable.filters.voteAverageLte, 9);
			assert.equal(draft.editable.filters.voteCountGte, 100);
			assert.equal(draft.editable.filters.withOriginalLanguage, "en");
			assert.equal(draft.editable.filters.withOriginCountry, "AU");
			assert.ok(draft.editable.filters.withoutGenres);
		}
	}
	assert.equal(buildDecadesSourceDrafts(configuration({ selectedDecadeIds: ["2010s"], mediaMode: "both", content: { wholeDecade: true, individualYears: false, genreBreakdown: true }, genreNames: ["Action"], sortOptionId: "recent", advanced: { minimumRating: 6.5, maximumRating: 9, minimumVotes: 100, originalLanguage: "en", originCountry: "AU", ordinaryExcludedGenres: ["Comedy"], exclusionsByGenre: { Action: ["Documentary"] } } })).drafts.length, 3);
});

test("current and earlier-period samples use bounded deterministic buckets", () => {
	for (const [currentYear, expectedEndYear] of [[2026, 2026], [2027, 2027], [2029, 2029], [2030, 2029], [2037, 2029]]) {
		const current = buildDecadesPreviewGroups(configuration({
			selectedDecadeIds: ["2020s"],
			content: { wholeDecade: true, individualYears: true, genreBreakdown: false },
			currentYear,
			...(currentYear <= 2029 ? { currentYearMode: "full-decade" } : {}),
		}));
		assert.equal(current.ok, true);
		assert.deepEqual(
			current.groups[0].choices[0].requests[0].bucketLabels,
			Array.from({ length: expectedEndYear - 2019 }, (_, index) => String(2020 + index)),
			`effective year ${currentYear}`,
		);
		assert.deepEqual(
			current.groups[0].rows.filter((row) => row.contentKind === "individual-year").map((row) => row.label),
			["2020", "2021", "2022", "2023", "2024", "2025", "2026", "2027", "2028", "2029"],
			`effective year ${currentYear} keeps the complete configured selector`,
		);
	}

	const earlier = buildDecadesPreviewGroups(configuration({ selectedDecadeIds: ["1950s-and-earlier"] }));
	assert.equal(earlier.ok, true);
	assert.equal(earlier.groups[0].choices[0].selectorLabel, "Period sample");
	assert.deepEqual(earlier.groups[0].choices[0].requests[0].bucketLabels, ["Before 1950", "1950", "1951", "1952", "1953", "1955", "1956", "1957", "1958", "1959"]);

	assert.deepEqual(selectEvenlyDistributed(Array.from({ length: 10 }, (_, index) => index), 5), [0, 2, 5, 7, 9]);
	assert.deepEqual(decadesRepresentativeItems(Array.from({ length: 10 }, (_, index) => index)), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
	assert.deepEqual(decadesRepresentativeItems(Array.from({ length: 7 }, (_, index) => index)), [0, 1, 2, 3, 4, 5, 6]);
	assert.deepEqual(decadesRepresentativeItems(Array.from({ length: 3 }, (_, index) => index)), [0, 1, 2]);
});

test("Decades Preview derives exact Movie and TV Discover queries including approved advanced filters", () => {
	const built = buildDecadesSourceDrafts(configuration({
		mediaMode: "both",
		sortOptionId: "top-rated",
		advanced: { minimumRating: "6.5", maximumRating: "9", minimumVotes: "250", originalLanguage: "en", originCountry: "AU", ordinaryExcludedGenres: ["Comedy"] },
	}));
	assert.equal(built.ok, true);
	for (const draft of built.drafts) {
		const query = decadePreviewQueryFromDraft(draft);
		assert.equal(query.mediaType, draft.editable.mediaType);
		assert.equal(query.queryParameters.include_adult, "false");
		assert.equal(query.queryParameters.sort_by, "vote_average.desc");
		assert.equal(query.queryParameters[query.mediaType === "MOVIE" ? "primary_release_date.gte" : "first_air_date.gte"], "1980-01-01");
		assert.equal(query.queryParameters[query.mediaType === "MOVIE" ? "primary_release_date.lte" : "first_air_date.lte"], "1989-12-31");
		assert.equal(query.queryParameters["vote_average.gte"], "6.5");
		assert.equal(query.queryParameters["vote_average.lte"], "9");
		assert.equal(query.queryParameters["vote_count.gte"], "250");
		assert.equal(query.queryParameters.with_original_language, "en");
		assert.equal(query.queryParameters.with_origin_country, "AU");
	}
});

test("Decades Preview rejects noncanonical periods and caches only successful exact queries", async () => {
	const valid = buildDecadesSourceDrafts(configuration()).drafts[0];
	assert.equal(decadePreviewQueryFromDraft({ ...valid, editable: { ...valid.editable, filters: { releaseDateGte: "1980-02-01", releaseDateLte: "1989-12-31" } } }), null);

	let calls = 0;
	const provider = createTmdbDecadesPreviewProvider({
		baseUrl: "https://worker.example",
		fetchImpl: async () => {
			calls += 1;
			return response({ total_results: 0, results: [] });
		},
	});
	const first = await provider.getDecadePreview(valid);
	const second = await provider.getDecadePreview(valid);
	assert.equal(first.ok, true);
	assert.equal(first.data.totalResults, 0);
	assert.equal(second.fromCache, true);
	assert.equal(calls, 1);

	let malformedCalls = 0;
	const malformed = createTmdbDecadesPreviewProvider({ baseUrl: "https://worker.example", fetchImpl: async () => { malformedCalls += 1; return response({ results: [] }); } });
	assert.equal((await malformed.getDecadePreview(valid)).ok, false);
	assert.equal((await malformed.getDecadePreview(valid)).ok, false);
	assert.equal(malformedCalls, 2);
});

test("Decades Preview cancellation fails closed without issuing a request", async () => {
	const draft = buildDecadesSourceDrafts(configuration()).drafts[0];
	let calls = 0;
	const provider = createTmdbDecadesPreviewProvider({ baseUrl: "https://worker.example", fetchImpl: async () => { calls += 1; return response({ total_results: 0, results: [] }); } });
	const controller = new AbortController();
	controller.abort();
	const result = await provider.getDecadePreview(draft, { signal: controller.signal });
	assert.equal(result.ok, false);
	assert.equal(result.error.kind, "aborted");
	assert.equal(calls, 0);
});

test("representative provider selects one poster-bearing result per bucket and reuses exact-query cache", async () => {
	const sample = buildDecadesPreviewGroups(configuration({ selectedDecadeIds: ["2010s"] })).groups[0].choices[0].requests[0];
	const urls = [];
	const provider = createTmdbDecadesPreviewProvider({
		baseUrl: "https://worker.example",
		fetchImpl: async (url) => {
			urls.push(url);
			const year = Number(new URL(url).searchParams.get("primary_release_date.gte").slice(0, 4));
			return response({
				total_results: 2,
				results: [
					{ id: year * 10, title: `Posterless ${year}`, release_date: `${year}-01-01`, poster_path: null },
					{ id: (year * 10) + 1, title: `Poster ${year}`, release_date: `${year}-02-01`, poster_path: `/poster-${year}.jpg` },
				],
			});
		},
	});
	const first = await provider.getDecadeSample(sample.drafts);
	assert.equal(first.ok, true);
	assert.equal(first.fromCache, false);
	assert.deepEqual(first.data.results.map((item) => item.year), [2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019]);
	assert.ok(first.data.results.every((item) => item.posterPath !== null));
	assert.equal(urls.length, 10);
	const second = await provider.getDecadeSample(sample.drafts);
	assert.equal(second.ok, true);
	assert.equal(second.fromCache, true);
	assert.equal(urls.length, 10);
	const exact = await provider.getDecadePreview(sample.drafts[4]);
	assert.equal(exact.ok, true);
	assert.equal(exact.fromCache, true);
	assert.equal(urls.length, 10);
});

test("representative provider reports bucket failure and cancellation without pretending it is empty", async () => {
	const sample = buildDecadesPreviewGroups(configuration({ selectedDecadeIds: ["2020s"] })).groups[0].choices[0].requests[0];
	let calls = 0;
	const failing = createTmdbDecadesPreviewProvider({
		baseUrl: "https://worker.example",
		fetchImpl: async () => {
			calls += 1;
			return calls === 3 ? new Response("Unavailable", { status: 503 }) : response({ total_results: 0, results: [] });
		},
	});
	const failed = await failing.getDecadeSample(sample.drafts);
	assert.equal(failed.ok, false);
	assert.equal(failed.error.kind, "provider");
	assert.equal(failed.error.retryable, true);

	let abortedCalls = 0;
	const cancelled = createTmdbDecadesPreviewProvider({ baseUrl: "https://worker.example", fetchImpl: async () => { abortedCalls += 1; return response({ total_results: 0, results: [] }); } });
	const controller = new AbortController();
	controller.abort();
	const aborted = await cancelled.getDecadeSample(sample.drafts, { signal: controller.signal });
	assert.equal(aborted.ok, false);
	assert.equal(aborted.error.kind, "aborted");
	assert.equal(abortedCalls, 0);
});
