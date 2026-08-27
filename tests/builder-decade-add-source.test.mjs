import assert from "node:assert/strict";
import test from "node:test";

import { createBuilderController } from "../builder/src/application/index.js";
import {
	buildCanonicalDecadePeriodDrafts,
	buildDecadeSourceBundleDrafts,
	buildDecadesSourceDrafts,
	createDecadeSourceBundle,
	createTmdbDecadesPreviewProvider,
	decadeDuplicateOverrideIdentity,
	decadePreviewQueryFromDraft,
	DECADE_SOURCE_PERIOD_GROUPS,
	decadeSourceGenreOptions,
	decadeSourcePeriodChoices,
	inspectCanonicalDecadeSource,
	inspectDecadeSourceDuplicates,
	toggleDecadeSourcePeriodSelection,
	validateCanonicalDecadePeriodDrafts,
	validateDecadeSourceBundleDrafts,
} from "../builder/src/source-add/index.js";
import { sourceEditorFor } from "../builder/src/source-edit/index.js";

function countingIdFactory(prefix = "builder") {
	let count = 0;
	return () => `${prefix}-${++count}`;
}

function selectedFolderController({ sources = [], secondFolderSources = [], elsewhereSources = [], idFactory = countingIdFactory() } = {}) {
	const controller = createBuilderController({ idFactory, nuvioIdFactory: countingIdFactory("nuvio"), initialProjectTitle: "Decade Add Source" });
	const imported = controller.importValue([
		{ id: "destination", title: "Destination", folders: [
			{ id: "folder", title: "Decades", sources, catalogSources: [] },
			{ id: "second", title: "Other folder", sources: secondFolderSources, catalogSources: [] },
		] },
		{ id: "elsewhere", title: "Elsewhere", folders: [{ id: "elsewhere-folder", title: "Elsewhere Decades", sources: elsewhereSources, catalogSources: [] }] },
	]);
	assert.equal(imported.ok, true);
	const folder = controller.getState().project.collections[0].folders[0];
	controller.selectNode(folder.internalId);
	return { controller, folder };
}

function build(overrides = {}) {
	return buildCanonicalDecadePeriodDrafts({ periodId: "1980s", mediaMode: "movies", sortOptionId: "popular", advanced: {}, ...overrides });
}

function bundle(overrides = {}) {
	return buildDecadeSourceBundleDrafts({ periodId: "1980s", mediaMode: "movies", genreNames: [], sortOptionId: "popular", advanced: {}, ...overrides });
}

test("ordinary Decade periods expose only the canonical catalogue and exact 1950-2029 years", () => {
	assert.deepEqual(DECADE_SOURCE_PERIOD_GROUPS.map((group) => group.label), ["Periods", "Exact years"]);
	assert.deepEqual(DECADE_SOURCE_PERIOD_GROUPS[0].periods.map((period) => period.label), [
		"1950s & Earlier", "1960s", "1970s", "1980s", "1990s", "2000s", "2010s", "2020s", "Before 1950",
	]);
	assert.equal(DECADE_SOURCE_PERIOD_GROUPS[1].periods.length, 80);
	assert.equal(DECADE_SOURCE_PERIOD_GROUPS[1].periods[0].label, "1950");
	assert.equal(DECADE_SOURCE_PERIOD_GROUPS[1].periods.at(-1).label, "2029");
});

test("Decade selection exposes only its whole period and complete canonical individual choices", () => {
	assert.deepEqual(decadeSourcePeriodChoices("1980s").map((period) => period.label), ["1980s", ...Array.from({ length: 10 }, (_, index) => String(1980 + index))]);
	assert.deepEqual(decadeSourcePeriodChoices("2020s").map((period) => period.label), ["2020s", ...Array.from({ length: 10 }, (_, index) => String(2020 + index))]);
	assert.deepEqual(decadeSourcePeriodChoices("1950s-and-earlier").map((period) => period.label), ["1950s & Earlier", "Before 1950", ...Array.from({ length: 10 }, (_, index) => String(1950 + index))]);
	assert.deepEqual(decadeSourcePeriodChoices("unknown"), []);
});

test("Year selection is continuously valid whole-period-or-multi-select in canonical order", () => {
	let selected = ["1980s"];
	selected = toggleDecadeSourcePeriodSelection("1980s", selected, "year-1985");
	assert.deepEqual(selected, ["year-1985"]);
	selected = toggleDecadeSourcePeriodSelection("1980s", selected, "year-1988");
	selected = toggleDecadeSourcePeriodSelection("1980s", selected, "year-1981");
	assert.deepEqual(selected, ["year-1981", "year-1985", "year-1988"]);
	selected = toggleDecadeSourcePeriodSelection("1980s", selected, "year-1985");
	assert.deepEqual(selected, ["year-1981", "year-1988"]);
	selected = toggleDecadeSourcePeriodSelection("1980s", selected, "1980s");
	assert.deepEqual(selected, ["1980s"]);
	selected = toggleDecadeSourcePeriodSelection("1980s", selected, "year-1981");
	selected = toggleDecadeSourcePeriodSelection("1980s", selected, "year-1981");
	assert.deepEqual(selected, ["1980s"]);
	assert.deepEqual(toggleDecadeSourcePeriodSelection("2020s", ["2020s"], "year-2029"), ["year-2029"]);

	let earlier = toggleDecadeSourcePeriodSelection("1950s-and-earlier", ["1950s-and-earlier"], "year-1958");
	earlier = toggleDecadeSourcePeriodSelection("1950s-and-earlier", earlier, "before-1950");
	earlier = toggleDecadeSourcePeriodSelection("1950s-and-earlier", earlier, "year-1951");
	assert.deepEqual(earlier, ["before-1950", "year-1951", "year-1958"]);
});

test("ordinary bundle always keeps the general source and adds Genres in canonical order", () => {
	assert.deepEqual(bundle().drafts.map((draft) => draft.editable.title), ["All 1980s Movies"]);
	assert.deepEqual(bundle({ genreNames: ["Comedy"] }).drafts.map((draft) => draft.editable.title), ["All 1980s Movies", "1980s Comedy Movies"]);
	const multiple = bundle({ mediaMode: "both", genreNames: ["Crime", "Comedy"] });
	assert.equal(multiple.ok, true);
	assert.deepEqual(multiple.configuration.genreNames, ["Comedy", "Crime"]);
	assert.deepEqual(multiple.periodGroups.map((group) => group.selectorLabel), ["All 1980s"]);
	assert.deepEqual(multiple.logicalSources.map((source) => source.selectorLabel), ["General", "Comedy", "Crime"]);
	assert.deepEqual(multiple.drafts.map((draft) => draft.editable.title), [
		"All 1980s Movies", "All 1980s Series",
		"1980s Comedy Movies", "1980s Comedy Series",
		"1980s Crime Movies", "1980s Crime Series",
	]);
	assert.deepEqual(multiple.drafts.map((draft) => draft.editable.mediaType), ["MOVIE", "TV", "MOVIE", "TV", "MOVIE", "TV"]);
	assert.deepEqual(bundle({ genreNames: ["Crime", "Comedy"] }).drafts.map((draft) => draft.editable.title), bundle({ genreNames: ["Comedy", "Crime"] }).drafts.map((draft) => draft.editable.title));
});

test("exact-year Genre bundles retain the general source for Movies and Both", () => {
	assert.deepEqual(bundle({ periodId: "year-1994", genreNames: ["Comedy"] }).drafts.map((draft) => draft.editable.title), ["1994 Movies", "1994 Comedy Movies"]);
	assert.deepEqual(bundle({ periodId: "year-1994", mediaMode: "both", genreNames: ["Comedy"] }).drafts.map((draft) => draft.editable.title), [
		"1994 Movies", "1994 Series", "1994 Comedy Movies", "1994 Comedy Series",
	]);
});

test("bundle counts follow media count times general plus selected Genres without a cap", () => {
	assert.equal(bundle().drafts.length, 1);
	assert.equal(bundle({ mediaMode: "both" }).drafts.length, 2);
	assert.equal(bundle({ genreNames: ["Crime", "Comedy"] }).drafts.length, 3);
	assert.equal(bundle({ mediaMode: "both", genreNames: ["Crime", "Comedy"] }).drafts.length, 6);
	for (const mediaMode of ["movies", "series", "both"]) {
		const allEligible = decadeSourceGenreOptions(mediaMode).map((concept) => concept.name);
		const built = bundle({ mediaMode, genreNames: [...allEligible].reverse() });
		assert.equal(built.ok, true);
		assert.equal(built.drafts.length, (mediaMode === "both" ? 2 : 1) * (1 + allEligible.length));
		assert.deepEqual(built.configuration.genreNames, allEligible);
	}
});

test("multi-Year Cartesian bundles use period then canonical Genre then Movie-Series ordering", () => {
	const periodIds = ["year-1988", "year-1981", "year-1985"];
	assert.equal(bundle({ periodIds, mediaMode: "movies" }).drafts.length, 3);
	assert.equal(bundle({ periodIds, mediaMode: "both" }).drafts.length, 6);
	assert.equal(bundle({ periodIds, mediaMode: "movies", genreNames: ["Crime", "Comedy"] }).drafts.length, 9);
	const built = bundle({
		periodIds,
		mediaMode: "both",
		genreNames: ["Crime", "Comedy"],
		sortOptionId: "recent",
		advanced: {
			minimumRating: 6,
			minimumVotes: 100,
			originalLanguage: "en",
			originCountry: "US",
			ordinaryExcludedGenres: ["Horror"],
			exclusionsByGenre: { Comedy: ["Horror"], Crime: ["Comedy"] },
		},
	});
	assert.equal(built.ok, true);
	assert.equal(built.drafts.length, 18);
	assert.deepEqual(built.configuration.periodIds, ["year-1981", "year-1985", "year-1988"]);
	assert.deepEqual(built.configuration.genreNames, ["Comedy", "Crime"]);
	assert.deepEqual(built.periodGroups.map((group) => group.selectorLabel), ["1981", "1985", "1988"]);
	assert.deepEqual(built.periodGroups[0].logicalSources.map((source) => source.selectorLabel), ["General", "Comedy", "Crime"]);
	assert.deepEqual(built.drafts.map((draft) => draft.editable.title), [
		"1981 Movies", "1981 Series", "1981 Comedy Movies", "1981 Comedy Series", "1981 Crime Movies", "1981 Crime Series",
		"1985 Movies", "1985 Series", "1985 Comedy Movies", "1985 Comedy Series", "1985 Crime Movies", "1985 Crime Series",
		"1988 Movies", "1988 Series", "1988 Comedy Movies", "1988 Comedy Series", "1988 Crime Movies", "1988 Crime Series",
	]);
	for (const [index, draft] of built.drafts.entries()) {
		const year = index < 6 ? 1981 : index < 12 ? 1985 : 1988;
		assert.equal(draft.editable.filters.releaseDateGte, `${year}-01-01`);
		assert.equal(draft.editable.filters.releaseDateLte, `${year}-12-31`);
		assert.equal(draft.editable.filters.voteAverageGte, 6);
		assert.equal(draft.editable.filters.voteCountGte, 100);
		assert.equal(draft.editable.filters.withOriginalLanguage, "en");
		assert.equal(draft.editable.filters.withOriginCountry, "US");
		assert.equal(draft.editable.sortBy, draft.editable.mediaType === "MOVIE" ? "primary_release_date.desc" : "first_air_date.desc");
	}
});

test("multi-Year normalization rejects zero, duplicate, mixed-family, and All-plus-individual states", () => {
	for (const periodIds of [
		[],
		["year-1981", "year-1981"],
		["year-1981", "year-1991"],
		["1980s", "year-1985"],
	]) assert.equal(bundle({ periodIds }).ok, false);
	assert.deepEqual(bundle({ periodIds: ["year-1958", "before-1950", "year-1951"] }).configuration.periodIds, ["before-1950", "year-1951", "year-1958"]);
});

test("one canonical helper builds Movie, Series, and deterministic Movie-then-Series Both drafts", () => {
	assert.deepEqual(build().drafts.map((draft) => draft.editable.title), ["All 1980s Movies"]);
	assert.deepEqual(build({ mediaMode: "series" }).drafts.map((draft) => draft.editable.title), ["All 1980s Series"]);
	const both = build({ mediaMode: "both" });
	assert.equal(both.ok, true);
	assert.deepEqual(both.drafts.map((draft) => draft.editable.mediaType), ["MOVIE", "TV"]);
	assert.deepEqual(both.drafts.map((draft) => draft.editable.title), ["All 1980s Movies", "All 1980s Series"]);
	assert.deepEqual(both.drafts.map((draft) => draft.editable.filters), [
		{ releaseDateGte: "1980-01-01", releaseDateLte: "1989-12-31" },
		{ releaseDateGte: "1980-01-01", releaseDateLte: "1989-12-31" },
	]);
});

test("exact year, Before 1950, and 1950s & Earlier titles and filters stay canonical", () => {
	const year = build({ periodId: "year-1987", mediaMode: "both" });
	assert.deepEqual(year.drafts.map((draft) => draft.editable.title), ["1987 Movies", "1987 Series"]);
	assert.deepEqual(year.drafts[0].editable.filters, { releaseDateGte: "1987-01-01", releaseDateLte: "1987-12-31" });
	assert.equal(build({ periodId: "before-1950" }).drafts[0].editable.title, "Before 1950 Movies");
	assert.deepEqual(build({ periodId: "before-1950" }).drafts[0].editable.filters, { releaseDateLte: "1949-12-31" });
	assert.equal(build({ periodId: "1950s-and-earlier" }).drafts[0].editable.title, "All 1950s & Earlier Movies");
	assert.deepEqual(build({ periodId: "1950s-and-earlier" }).drafts[0].editable.filters, { releaseDateLte: "1959-12-31" });
});

test("included Genre uses media-correct IDs and Both accepts only two-media concepts", () => {
	const comedy = build({ mediaMode: "both", genreName: "Comedy" });
	assert.equal(comedy.ok, true);
	assert.deepEqual(comedy.drafts.map((draft) => draft.editable.title), ["1980s Comedy Movies", "1980s Comedy Series"]);
	assert.deepEqual(comedy.drafts.map((draft) => draft.editable.filters.withGenres), ["35", "35"]);
	assert.equal(build({ mediaMode: "both", genreName: "Kids" }).ok, false);
	assert.equal(build({ mediaMode: "series", genreName: "Kids" }).ok, true);
	assert.equal(decadeSourceGenreOptions("both").some((concept) => concept.name === "Kids"), false);
	assert.equal(decadeSourceGenreOptions("series").some((concept) => concept.name === "Kids"), true);
});

test("every approved Advanced family and sort maps through the canonical helper", () => {
	const result = build({
		periodId: "year-1994",
		mediaMode: "both",
		genreName: "Comedy",
		sortOptionId: "recent",
		advanced: {
			minimumRating: "6.5",
			maximumRating: "9.1",
			minimumVotes: "250",
			originalLanguage: "en",
			originCountry: "AU",
			ordinaryExcludedGenres: [],
			exclusionsByGenre: { Comedy: ["Horror", "Kids"] },
		},
	});
	assert.equal(result.ok, true);
	assert.deepEqual(result.drafts.map((draft) => draft.editable.title), ["1994 Comedy Movies", "1994 Comedy Series"]);
	assert.deepEqual(result.drafts.map((draft) => draft.editable.sortBy), ["primary_release_date.desc", "first_air_date.desc"]);
	assert.deepEqual(result.drafts[0].editable.filters, {
		releaseDateGte: "1994-01-01", releaseDateLte: "1994-12-31", withGenres: "35",
		voteAverageGte: 6.5, voteAverageLte: 9.1, voteCountGte: 250,
		withOriginalLanguage: "en", withOriginCountry: "AU", withoutGenres: "27",
	});
	assert.deepEqual(result.drafts[1].editable.filters, {
		releaseDateGte: "1994-01-01", releaseDateLte: "1994-12-31", withGenres: "35",
		voteAverageGte: 6.5, voteAverageLte: 9.1, voteCountGte: 250,
		withOriginalLanguage: "en", withOriginCountry: "AU", withoutGenres: "10762",
	});
});

test("Advanced settings apply to the general and every Genre source with Guided-compatible exclusion ownership", () => {
	const result = bundle({
		periodId: "year-1994",
		mediaMode: "both",
		genreNames: ["Crime", "Comedy"],
		sortOptionId: "most-votes",
		advanced: {
			minimumRating: "6",
			maximumRating: "9",
			minimumVotes: "100",
			originalLanguage: "en",
			originCountry: "US",
			ordinaryExcludedGenres: ["Horror"],
			exclusionsByGenre: { Comedy: ["Horror"], Crime: ["Comedy"] },
		},
	});
	assert.equal(result.ok, true);
	assert.deepEqual(result.drafts.map((draft) => draft.editable.title), [
		"1994 Movies", "1994 Series", "1994 Comedy Movies", "1994 Comedy Series", "1994 Crime Movies", "1994 Crime Series",
	]);
	for (const draft of result.drafts) {
		assert.equal(draft.editable.filters.voteAverageGte, 6);
		assert.equal(draft.editable.filters.voteAverageLte, 9);
		assert.equal(draft.editable.filters.voteCountGte, 100);
		assert.equal(draft.editable.filters.withOriginalLanguage, "en");
		assert.equal(draft.editable.filters.withOriginCountry, "US");
	}
	assert.equal(result.logicalSources[0].drafts[0].editable.filters.withoutGenres, "27");
	assert.equal(result.logicalSources[1].drafts[0].editable.filters.withGenres, "35");
	assert.equal(result.logicalSources[1].drafts[0].editable.filters.withoutGenres, "27");
	assert.equal(result.logicalSources[2].drafts[0].editable.filters.withGenres, "80");
	assert.equal(result.logicalSources[2].drafts[0].editable.filters.withoutGenres, "35");
	assert.equal(bundle({ genreNames: ["Comedy"], advanced: { ordinaryExcludedGenres: [], exclusionsByGenre: { Comedy: ["Comedy"] } } }).ok, false);
});

test("Guided Decades drafts remain byte-equivalent to the canonical one-period helper", () => {
	const guided = buildDecadesSourceDrafts({
		selectedDecadeIds: ["1980s"], mediaMode: "both",
		content: { wholeDecade: true, individualYears: false, genreBreakdown: true },
		currentYear: 2026, sortOptionId: "popular", genreNames: ["Comedy"], advanced: {},
	});
	const overview = build({ mediaMode: "both" });
	const genre = build({ mediaMode: "both", genreName: "Comedy", requireGenreForEveryMedia: false });
	assert.equal(guided.ok, true);
	assert.deepEqual(guided.drafts, [overview.drafts[0], genre.drafts[0], overview.drafts[1], genre.drafts[1]]);
});

test("strict batch validation rejects a silently missing Both candidate", () => {
	const both = build({ mediaMode: "both" });
	assert.equal(validateCanonicalDecadePeriodDrafts(both.drafts, { periodId: "1980s", mediaMode: "both", sortOptionId: "popular", advanced: {} }).ok, true);
	assert.equal(validateCanonicalDecadePeriodDrafts(both.drafts.slice(0, 1), { periodId: "1980s", mediaMode: "both", sortOptionId: "popular", advanced: {} }).ok, false);
});

test("strict bundle validation rejects a silently dropped general or Genre candidate", () => {
	const configuration = { periodId: "1980s", mediaMode: "both", genreNames: ["Comedy", "Crime"], sortOptionId: "popular", advanced: {} };
	const built = bundle(configuration);
	assert.equal(built.drafts.length, 6);
	assert.equal(validateDecadeSourceBundleDrafts(built.drafts, configuration).ok, true);
	assert.equal(validateDecadeSourceBundleDrafts(built.drafts.slice(1), configuration).ok, false);
	assert.equal(validateDecadeSourceBundleDrafts(built.drafts.filter((draft) => !draft.editable.title.includes("Comedy")), configuration).ok, false);
});

test("strict bundle validation covers every selected Year in the reviewed matrix", () => {
	const configuration = { periodIds: ["year-1981", "year-1985", "year-1988"], mediaMode: "both", genreNames: ["Comedy", "Crime"], sortOptionId: "popular", advanced: {} };
	const built = bundle(configuration);
	assert.equal(built.drafts.length, 18);
	assert.equal(validateDecadeSourceBundleDrafts(built.drafts, configuration).ok, true);
	assert.equal(validateDecadeSourceBundleDrafts(built.drafts.slice(0, -1), configuration).ok, false);
});

test("exact Preview queries describe only the would-be saved Movie or Series source", () => {
	const [movie, series] = build({ mediaMode: "both", genreName: "Comedy", advanced: { minimumRating: 6, ordinaryExcludedGenres: [], exclusionsByGenre: {} } }).drafts;
	assert.deepEqual(decadePreviewQueryFromDraft(movie), {
		mediaType: "MOVIE",
		queryParameters: {
			include_adult: "false",
			sort_by: "popularity.desc",
			"primary_release_date.gte": "1980-01-01",
			"primary_release_date.lte": "1989-12-31",
			with_genres: "35",
			"vote_average.gte": "6",
		},
	});
	assert.deepEqual(decadePreviewQueryFromDraft(series), {
		mediaType: "TV",
		queryParameters: {
			include_adult: "false",
			sort_by: "popularity.desc",
			"first_air_date.gte": "1980-01-01",
			"first_air_date.lte": "1989-12-31",
			with_genres: "35",
			"vote_average.gte": "6",
		},
	});
	assert.equal(Object.keys(decadePreviewQueryFromDraft(movie).queryParameters).some((key) => key.includes("sample")), false);
});

test("exact Preview fails malformed candidates closed, retries failures, and caches only success", async () => {
	let malformedCalls = 0;
	const malformedProvider = createTmdbDecadesPreviewProvider({ baseUrl: "https://worker.example", fetchImpl: async () => { malformedCalls += 1; return new Response(); } });
	const malformed = await malformedProvider.getDecadePreview({ category: "native-tmdb", editable: { provider: "tmdb", tmdbSourceType: "DISCOVER", mediaType: "MOVIE", sortBy: "popularity.desc", filters: {} } });
	assert.equal(malformed.ok, false);
	assert.equal(malformed.error.kind, "invalid-request");
	assert.equal(malformedCalls, 0);

	let calls = 0;
	const provider = createTmdbDecadesPreviewProvider({
		baseUrl: "https://worker.example",
		fetchImpl: async () => {
			calls += 1;
			if (calls === 1) return new Response(JSON.stringify({ error: "temporary" }), { status: 503, headers: { "content-type": "application/json" } });
			return new Response(JSON.stringify({ total_results: 1, results: [{ id: 1, poster_path: "/poster.jpg", title: "Example", release_date: "1984-01-01" }] }), { status: 200, headers: { "content-type": "application/json" } });
		},
	});
	const draft = build().drafts[0];
	assert.equal((await provider.getDecadePreview(draft)).ok, false);
	const recovered = await provider.getDecadePreview(draft);
	assert.equal(recovered.ok, true);
	assert.equal(recovered.fromCache, false);
	const cached = await provider.getDecadePreview(draft);
	assert.equal(cached.ok, true);
	assert.equal(cached.fromCache, true);
	assert.equal(calls, 2);
});

test("duplicate review distinguishes destination, elsewhere, and a partial Both set", () => {
	const drafts = build({ mediaMode: "both" }).drafts;
	const { controller, folder } = selectedFolderController({ sources: [drafts[0].editable], elsewhereSources: [drafts[1].editable] });
	const review = inspectDecadeSourceDuplicates(controller.getState().project, folder.internalId, drafts);
	assert.deepEqual(review.duplicateDrafts, [drafts[0]]);
	assert.deepEqual(review.missingDrafts, [drafts[1]]);
	assert.deepEqual(review.elsewhereDrafts, [drafts[1]]);
});

test("multi-Genre duplicate review reports general-only, Genre-only, mixed partial, and elsewhere candidates", () => {
	const built = bundle({ mediaMode: "both", genreNames: ["Crime", "Comedy"] });
	const [generalMovie, generalSeries, comedyMovie, comedySeries, crimeMovie, crimeSeries] = built.drafts;
	const { controller, folder } = selectedFolderController({
		sources: [generalMovie.editable, comedySeries.editable],
		elsewhereSources: [generalSeries.editable, crimeMovie.editable],
	});
	const review = inspectDecadeSourceDuplicates(controller.getState().project, folder.internalId, built.drafts);
	assert.deepEqual(review.duplicateDrafts, [generalMovie, comedySeries]);
	assert.deepEqual(review.missingDrafts, [generalSeries, comedyMovie, crimeMovie, crimeSeries]);
	assert.deepEqual(review.elsewhereDrafts, [generalSeries, crimeMovie]);
});

test("normal Save inserts only the valid missing candidate and exact override inserts the complete batch atomically", () => {
	const drafts = build({ mediaMode: "both" }).drafts;
	const normal = selectedFolderController({ sources: [drafts[0].editable] });
	const beforeNormal = normal.controller.getState().revision;
	const normalResult = createDecadeSourceBundle(normal.controller, { folderInternalId: normal.folder.internalId, periodId: "1980s", mediaMode: "both", sortOptionId: "popular", advanced: {}, drafts });
	assert.equal(normalResult.ok, true);
	assert.equal(normalResult.addedSourceCount, 1);
	assert.equal(normal.controller.getState().revision, beforeNormal + 1);
	assert.deepEqual(normal.controller.getState().project.collections[0].folders[0].sources.map((source) => source.editable.mediaType), ["MOVIE", "TV"]);

	const overridden = selectedFolderController({ sources: [drafts[0].editable] });
	const overriddenResult = createDecadeSourceBundle(overridden.controller, {
		folderInternalId: overridden.folder.internalId, periodId: "1980s", mediaMode: "both", sortOptionId: "popular", advanced: {}, drafts,
		duplicateOverrideIdentity: decadeDuplicateOverrideIdentity(overridden.folder.internalId, drafts),
	});
	assert.equal(overriddenResult.ok, true);
	assert.equal(overriddenResult.addedSourceCount, 2);
	assert.equal(overriddenResult.duplicateOverrideUsed, true);
});

test("normal multi-Genre Save adds only the exact missing subset in one revision", () => {
	const genreNames = ["Crime", "Comedy"];
	const built = bundle({ mediaMode: "both", genreNames });
	const existing = [built.drafts[0], built.drafts[3]];
	const { controller, folder } = selectedFolderController({ sources: existing.map((draft) => draft.editable) });
	const before = controller.getState().revision;
	let batchCalls = 0;
	const instrumented = {
		getState: () => controller.getState(),
		addSourcesToFolder(...args) {
			batchCalls += 1;
			return controller.addSourcesToFolder(...args);
		},
	};
	const result = createDecadeSourceBundle(instrumented, { folderInternalId: folder.internalId, periodId: "1980s", mediaMode: "both", genreNames, sortOptionId: "popular", advanced: {}, drafts: built.drafts });
	assert.equal(result.ok, true);
	assert.equal(result.addedSourceCount, 4);
	assert.equal(result.duplicateReview.duplicateDrafts.length, 2);
	assert.equal(batchCalls, 1);
	assert.equal(controller.getState().revision, before + 1);
});

test("an 18-source multi-Year partial duplicate bundle adds 13 sources in one revision", () => {
	const periodIds = ["year-1981", "year-1985", "year-1988"];
	const genreNames = ["Comedy", "Crime"];
	const built = bundle({ periodIds, mediaMode: "both", genreNames });
	const existing = built.drafts.slice(0, 5);
	const { controller, folder } = selectedFolderController({ sources: existing.map((draft) => draft.editable) });
	const before = controller.getState().revision;
	let batchCalls = 0;
	const instrumented = { getState: () => controller.getState(), addSourcesToFolder(...args) { batchCalls += 1; return controller.addSourcesToFolder(...args); } };
	const result = createDecadeSourceBundle(instrumented, { folderInternalId: folder.internalId, periodIds, mediaMode: "both", genreNames, sortOptionId: "popular", advanced: {}, drafts: built.drafts });
	assert.equal(result.ok, true);
	assert.equal(result.duplicateReview.duplicateDrafts.length, 5);
	assert.equal(result.addedSourceCount, 13);
	assert.equal(batchCalls, 1);
	assert.equal(controller.getState().revision, before + 1);
});

test("valid single and Both Saves each use one existing atomic source-batch operation", () => {
	for (const mediaMode of ["movies", "both"]) {
		const drafts = build({ mediaMode }).drafts;
		const { controller, folder } = selectedFolderController();
		const before = controller.getState().revision;
		let batchCalls = 0;
		const instrumented = {
			getState: () => controller.getState(),
			addSourcesToFolder(...args) {
				batchCalls += 1;
				return controller.addSourcesToFolder(...args);
			},
		};
		const result = createDecadeSourceBundle(instrumented, { folderInternalId: folder.internalId, periodId: "1980s", mediaMode, sortOptionId: "popular", advanced: {}, drafts });
		assert.equal(result.ok, true);
		assert.equal(batchCalls, 1);
		assert.equal(controller.getState().revision, before + 1);
		assert.equal(result.addedSourceCount, drafts.length);
		assert.deepEqual(controller.getState().project.collections[0].folders[0].sources.map((source) => source.editable.mediaType), mediaMode === "both" ? ["MOVIE", "TV"] : ["MOVIE"]);
	}
});

test("a Select-all-sized bundle uses one atomic operation and one revision", () => {
	const genreNames = decadeSourceGenreOptions("both").map((concept) => concept.name);
	const periodIds = ["year-1981", "year-1985", "year-1988"];
	const built = bundle({ periodIds, mediaMode: "both", genreNames });
	const { controller, folder } = selectedFolderController();
	const before = controller.getState().revision;
	let batchCalls = 0;
	const instrumented = {
		getState: () => controller.getState(),
		addSourcesToFolder(...args) {
			batchCalls += 1;
			return controller.addSourcesToFolder(...args);
		},
	};
	const result = createDecadeSourceBundle(instrumented, { folderInternalId: folder.internalId, periodIds, mediaMode: "both", genreNames, sortOptionId: "popular", advanced: {}, drafts: built.drafts });
	assert.equal(result.ok, true);
	assert.equal(result.addedSourceCount, built.drafts.length);
	assert.equal(batchCalls, 1);
	assert.equal(controller.getState().revision, before + 1);
});

test("all destination duplicates block normal Save and stale duplicate approval cannot bypass a rebuilt batch", () => {
	const genreNames = ["Crime", "Comedy"];
	const drafts = bundle({ mediaMode: "both", genreNames }).drafts;
	const { controller, folder } = selectedFolderController({ sources: drafts.map((draft) => draft.editable) });
	const before = controller.getState();
	const blocked = createDecadeSourceBundle(controller, { folderInternalId: folder.internalId, periodId: "1980s", mediaMode: "both", genreNames, sortOptionId: "popular", advanced: {}, drafts });
	assert.equal(blocked.ok, false);
	assert.equal(blocked.requiresDuplicateOverride, true);
	assert.equal(controller.getState().revision, before.revision);
	assert.equal(controller.getState().project, before.project);
	const changed = bundle({ periodId: "1990s", mediaMode: "both", genreNames }).drafts;
	const stale = createDecadeSourceBundle(controller, {
		folderInternalId: folder.internalId, periodId: "1990s", mediaMode: "both", genreNames, sortOptionId: "popular", advanced: {}, drafts: changed,
		duplicateOverrideIdentity: decadeDuplicateOverrideIdentity(folder.internalId, drafts),
	});
	assert.equal(stale.ok, true);
	assert.equal(stale.duplicateOverrideUsed, false);
});

test("a failing large multi-Genre Both insertion leaves zero partial mutation", () => {
	let collide = false;
	let count = 0;
	const idFactory = () => collide ? "collision" : `setup-${++count}`;
	const { controller, folder } = selectedFolderController({ idFactory });
	const genreNames = decadeSourceGenreOptions("both").map((concept) => concept.name);
	const drafts = bundle({ mediaMode: "both", genreNames }).drafts;
	collide = true;
	const before = controller.getState();
	const result = createDecadeSourceBundle(controller, { folderInternalId: folder.internalId, periodId: "1980s", mediaMode: "both", genreNames, sortOptionId: "popular", advanced: {}, drafts });
	assert.equal(result.ok, false);
	assert.equal(controller.getState().revision, before.revision);
	assert.equal(controller.getState().project, before.project);
});

test("new Add Source drafts classify and reopen through the existing Decade Source Edit adapter", () => {
	for (const draft of build({ periodId: "year-1994", mediaMode: "both", genreName: "Comedy", advanced: { minimumRating: 6, ordinaryExcludedGenres: [], exclusionsByGenre: { Comedy: ["Horror"] } } }).drafts) {
		assert.equal(inspectCanonicalDecadeSource(draft.editable)?.period.id, "year-1994");
		const { controller } = selectedFolderController({ sources: [draft.editable] });
		const node = controller.getState().project.collections[0].folders[0].sources[0];
		assert.equal(sourceEditorFor(node)?.id, "decade");
	}
});
