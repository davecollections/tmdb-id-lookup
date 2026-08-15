import assert from "node:assert/strict";
import test from "node:test";

import { createBuilderController } from "../builder/src/application/index.js";
import {
	BEFORE_1950_PERIOD,
	buildDecadesSourceDrafts,
	classifyCanonicalDecadePeriod,
	completeOfficialGenreNames,
	createDecadesHierarchyPlan,
	DECADE_PRESET_IDS,
	DECADE_PRESETS,
	decadeIndividualPeriods,
	inspectCanonicalDecadeSource,
	normalizeDecadesSourceConfiguration,
	validateDecadesSourceDrafts,
} from "../builder/src/source-add/index.js";
import { inspectEditableGenreSource } from "../builder/src/source-edit/index.js";

function sourceConfiguration(overrides = {}) {
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

function countingFactory(prefix) {
	let count = 0;
	return () => `${prefix}-${++count}`;
}

function reverseObjectKeys(value) {
	if (Array.isArray(value)) return value.map((entry) => reverseObjectKeys(entry));
	if (value === null || typeof value !== "object") return value;
	return Object.fromEntries(Object.entries(value).reverse().map(([key, entry]) => [key, reverseObjectKeys(entry)]));
}

test("the initial Decades catalogue owns eight ordered complete period definitions", () => {
	assert.deepEqual(DECADE_PRESET_IDS, [
		"1950s-and-earlier",
		"1960s",
		"1970s",
		"1980s",
		"1990s",
		"2000s",
		"2010s",
		"2020s",
	]);
	assert.deepEqual(DECADE_PRESETS[0].wholePeriod.filters, { releaseDateLte: "1959-12-31" });
	assert.deepEqual(DECADE_PRESETS.at(-1).wholePeriod.filters, {
		releaseDateGte: "2020-01-01",
		releaseDateLte: "2029-12-31",
	});
	for (const preset of DECADE_PRESETS.slice(1)) {
		assert.deepEqual(preset.wholePeriod.filters, {
			releaseDateGte: `${preset.startYear}-01-01`,
			releaseDateLte: `${preset.endYear}-12-31`,
		});
	}
});

test("1950s and Earlier expands to Before 1950 then the ten exact full years", () => {
	const periods = decadeIndividualPeriods("1950s-and-earlier", { currentYear: 2026 });
	assert.equal(periods.length, 11);
	assert.equal(periods[0], BEFORE_1950_PERIOD);
	assert.deepEqual(periods[0].filters, { releaseDateLte: "1949-12-31" });
	assert.deepEqual(periods.slice(1).map((period) => period.label), Array.from({ length: 10 }, (_, index) => String(1950 + index)));
	assert.deepEqual(periods.at(-1).filters, {
		releaseDateGte: "1959-01-01",
		releaseDateLte: "1959-12-31",
	});
	const sources = buildDecadesSourceDrafts(sourceConfiguration({
		selectedDecadeIds: ["1950s-and-earlier"],
		mediaMode: "both",
		content: { wholeDecade: false, individualYears: true, genreBreakdown: false },
	})).drafts;
	assert.equal(sources[0].editable.title, "Before 1950 Movies");
	assert.equal(sources[11].editable.title, "Before 1950 Series");
});

test("current-decade individual years use injected deterministic modes without truncating the aggregate", () => {
	assert.deepEqual(
		decadeIndividualPeriods("2020s", { currentYear: 2026, currentYearMode: "through-current-year" }).map((period) => period.label),
		["2020", "2021", "2022", "2023", "2024", "2025", "2026"],
	);
	assert.deepEqual(
		decadeIndividualPeriods("2020s", { currentYear: 2024, currentYearMode: "current-year-only" }).map((period) => period.label),
		["2024"],
	);
	assert.deepEqual(
		decadeIndividualPeriods("2020s", { currentYear: 2024, currentYearMode: "full-decade" }).map((period) => period.label),
		Array.from({ length: 10 }, (_, index) => String(2020 + index)),
	);
	assert.deepEqual(DECADE_PRESETS.at(-1).wholePeriod.filters, {
		releaseDateGte: "2020-01-01",
		releaseDateLte: "2029-12-31",
	});
});

test("source planning defaults to one whole-period source and validates bounded configuration", () => {
	const result = buildDecadesSourceDrafts(sourceConfiguration());
	assert.equal(result.ok, true);
	assert.equal(result.drafts.length, 1);
	assert.deepEqual(result.drafts[0].editable, {
		title: "1980s Movies",
		sortBy: "popularity.desc",
		tmdbId: null,
		filters: { releaseDateGte: "1980-01-01", releaseDateLte: "1989-12-31" },
		provider: "tmdb",
		mediaType: "MOVIE",
		tmdbSourceType: "DISCOVER",
	});

	for (const invalid of [
		sourceConfiguration({ content: { wholeDecade: false, individualYears: false, genreBreakdown: false } }),
		sourceConfiguration({ futureField: true }),
		sourceConfiguration({ content: { wholeDecade: true, individualYears: false, genreBreakdown: false }, currentYearMode: "full-decade" }),
		sourceConfiguration({ currentYear: undefined }),
	]) {
		assert.equal(normalizeDecadesSourceConfiguration(invalid).ok, false);
	}
});

test("Movie and Series sources are distinct and ordered by media grouping", () => {
	const result = buildDecadesSourceDrafts(sourceConfiguration({
		mediaMode: "both",
		content: { wholeDecade: true, individualYears: true, genreBreakdown: false },
	}));
	assert.equal(result.ok, true);
	assert.equal(result.drafts.length, 22);
	assert.deepEqual(result.drafts.slice(0, 3).map((draft) => draft.editable.title), ["1980s Movies", "1980 Movies", "1981 Movies"]);
	assert.equal(result.drafts[10].editable.title, "1989 Movies");
	assert.equal(result.drafts[11].editable.title, "1980s Series");
	assert.ok(result.drafts.slice(0, 11).every((draft) => draft.editable.mediaType === "MOVIE"));
	assert.ok(result.drafts.slice(11).every((draft) => draft.editable.mediaType === "TV"));
});

test("whole, years and Genre breakdown are additive without any Year by Genre product", () => {
	const result = buildDecadesSourceDrafts(sourceConfiguration({
		mediaMode: "both",
		content: { wholeDecade: true, individualYears: true, genreBreakdown: true },
		genreNames: ["Action", "Horror", "Action & Adventure"],
	}));
	assert.equal(result.ok, true);
	const entries = result.groups.flatMap((group) => group.sources);
	assert.equal(entries.filter((entry) => entry.contentKind === "whole-decade").length, 2);
	assert.equal(entries.filter((entry) => entry.contentKind === "individual-year").length, 20);
	assert.equal(entries.filter((entry) => entry.contentKind === "genre-breakdown").length, 3);
	assert.deepEqual(entries.filter((entry) => entry.contentKind === "genre-breakdown").map((entry) => entry.draft.editable.title), [
		"1980s Action Movies",
		"1980s Horror Movies",
		"1980s Action & Adventure Series",
	]);
	assert.ok(entries.filter((entry) => entry.contentKind === "genre-breakdown").every((entry) => entry.period.kind === "decade"));
	assert.equal(entries.some((entry) => /^198\d .* (Movies|Series)$/.test(entry.draft.editable.title) && entry.contentKind === "genre-breakdown"), false);
});

test("selected structural Genres must be available for the chosen media without weakening Both", () => {
	const genreOnly = { wholeDecade: false, individualYears: false, genreBreakdown: true };
	for (const [mediaMode, genreName, mediaLabel] of [
		["movies", "News", "Movies"],
		["series", "Music", "Series"],
	]) {
		const configuration = sourceConfiguration({ mediaMode, content: genreOnly, genreNames: [genreName] });
		const result = buildDecadesSourceDrafts(configuration);
		assert.equal(result.ok, false);
		assert.deepEqual(result.drafts, []);
		assert.deepEqual(result.errors.map(({ code, path, message }) => ({ code, path, message })), [{
			code: "DECADES_GENRE_UNAVAILABLE_FOR_MEDIA",
			path: "$decades.genreNames[0]",
			message: `${genreName} is not available for ${mediaLabel}.`,
		}]);
		const current = createBuilderController({ idFactory: countingFactory("internal"), nuvioIdFactory: countingFactory("nuvio") });
		assert.equal(createDecadesHierarchyPlan(current.getState().project, {
			scope: "new-collection",
			projectRevision: current.getState().revision,
			source: configuration,
		}).ok, false);
	}

	for (const [mediaMode, genreName, expectedMedia] of [
		["movies", "Action", ["MOVIE"]],
		["series", "Action & Adventure", ["TV"]],
		["both", "News", ["TV"]],
		["both", "Music", ["MOVIE"]],
		["both", "Drama", ["MOVIE", "TV"]],
	]) {
		const result = buildDecadesSourceDrafts(sourceConfiguration({ mediaMode, content: genreOnly, genreNames: [genreName] }));
		assert.equal(result.ok, true, `${mediaMode} ${genreName}`);
		assert.deepEqual(result.drafts.map((draft) => draft.editable.mediaType), expectedMedia, `${mediaMode} ${genreName}`);
	}

	for (const content of [
		genreOnly,
		{ wholeDecade: true, individualYears: false, genreBreakdown: true },
	]) {
		const result = buildDecadesSourceDrafts(sourceConfiguration({
			content,
			genreNames: ["Action", "News"],
		}));
		assert.equal(result.ok, false);
		assert.deepEqual(result.drafts, []);
		assert.equal(result.errors[0].message, "News is not available for Movies.");
	}
	const multipleInvalid = buildDecadesSourceDrafts(sourceConfiguration({
		content: genreOnly,
		genreNames: ["News", "Kids"],
	}));
	assert.deepEqual(multipleInvalid.errors.map((error) => error.message), [
		"News is not available for Movies.",
		"Kids is not available for Movies.",
	]);
});

test("all four sorts and only approved Advanced settings compile through DISCOVER Core", () => {
	const expected = {
		popular: ["popularity.desc", "popularity.desc"],
		recent: ["primary_release_date.desc", "first_air_date.desc"],
		"top-rated": ["vote_average.desc", "vote_average.desc"],
		"most-votes": ["vote_count.desc", "vote_count.desc"],
	};
	for (const [sortOptionId, sortBy] of Object.entries(expected)) {
		const result = buildDecadesSourceDrafts(sourceConfiguration({ mediaMode: "both", sortOptionId }));
		assert.equal(result.ok, true);
		assert.deepEqual(result.drafts.map((draft) => draft.editable.sortBy), sortBy);
	}
	const advanced = buildDecadesSourceDrafts(sourceConfiguration({
		advanced: {
			minimumRating: 6.5,
			maximumRating: 9,
			minimumVotes: 50,
			originalLanguage: "ja",
			originCountry: "JP",
			ordinaryExcludedGenres: ["Comedy"],
		},
	}));
	assert.deepEqual(advanced.drafts[0].editable.filters, {
		releaseDateGte: "1980-01-01",
		releaseDateLte: "1989-12-31",
		voteAverageGte: 6.5,
		voteAverageLte: 9,
		voteCountGte: 50,
		withOriginalLanguage: "ja",
		withOriginCountry: "JP",
		withoutGenres: "35",
	});
	assert.equal(buildDecadesSourceDrafts(sourceConfiguration({ advanced: { yearFrom: 1980 } })).ok, false);
});

test("ordinary and per-Genre exclusions compile independently per physical media", () => {
	const result = buildDecadesSourceDrafts(sourceConfiguration({
		mediaMode: "both",
		content: { wholeDecade: true, individualYears: false, genreBreakdown: true },
		genreNames: ["Horror", "Comedy"],
		advanced: {
			ordinaryExcludedGenres: ["Kids", "Horror"],
			exclusionsByGenre: { Horror: ["Comedy", "Kids"], Comedy: ["Horror"] },
		},
	}));
	assert.equal(result.ok, true);
	const byTitle = new Map(result.drafts.map((draft) => [draft.editable.title, draft.editable.filters]));
	assert.equal(byTitle.get("1980s Movies").withoutGenres, "27");
	assert.equal(byTitle.get("1980s Series").withoutGenres, "10762");
	assert.equal(byTitle.get("1980s Horror Movies").withoutGenres, "35");
	assert.equal(byTitle.get("1980s Comedy Movies").withoutGenres, "27");
	assert.equal(byTitle.get("1980s Comedy Series").withoutGenres, undefined);
	assert.equal(buildDecadesSourceDrafts(sourceConfiguration({
		content: { wholeDecade: false, individualYears: false, genreBreakdown: true },
		genreNames: ["Horror"],
		advanced: { exclusionsByGenre: { Horror: ["Horror"] } },
	})).ok, false);
});

test("Decades source-draft validation is strict JSON structural equality", () => {
	const configuration = sourceConfiguration({
		mediaMode: "both",
		content: { wholeDecade: true, individualYears: false, genreBreakdown: true },
		genreNames: ["Drama"],
		advanced: { minimumRating: 7, minimumVotes: 100 },
	});
	const drafts = buildDecadesSourceDrafts(configuration).drafts;
	assert.equal(validateDecadesSourceDrafts(drafts, configuration).ok, true);
	assert.equal(validateDecadesSourceDrafts(reverseObjectKeys(drafts), configuration).ok, true);
	const reorderedFilters = drafts.map((draft) => ({
		...draft,
		editable: { ...draft.editable, filters: Object.fromEntries(Object.entries(draft.editable.filters).reverse()) },
	}));
	assert.equal(validateDecadesSourceDrafts(reorderedFilters, configuration).ok, true);
	assert.equal(validateDecadesSourceDrafts([...drafts].reverse(), configuration).ok, false);
	assert.equal(validateDecadesSourceDrafts(drafts.map((draft) => ({ ...draft, extra: true })), configuration).ok, false);
	assert.equal(validateDecadesSourceDrafts(drafts.map((draft) => ({ ...draft, extra: undefined })), configuration).ok, false);
	assert.equal(validateDecadesSourceDrafts(drafts.map((draft) => ({ ...draft, editable: { ...draft.editable, title: undefined } })), configuration).ok, false);
	const missingTitle = drafts.map((draft) => {
		const { title, ...editable } = draft.editable;
		assert.equal(typeof title, "string");
		return { ...draft, editable };
	});
	assert.equal(validateDecadesSourceDrafts(missingTitle, configuration).ok, false);
	const sparse = new Array(drafts.length);
	sparse[0] = drafts[0];
	assert.equal(validateDecadesSourceDrafts(sparse, configuration).ok, false);
	for (const unsupported of [() => {}, Symbol("unsupported"), 1n, Number.POSITIVE_INFINITY, new Date(0)]) {
		assert.equal(validateDecadesSourceDrafts(drafts.map((draft) => ({ ...draft, editable: { ...draft.editable, title: unsupported } })), configuration).ok, false);
	}
});

test("canonical period classification is exact, title-independent and fail-closed", () => {
	assert.equal(classifyCanonicalDecadePeriod({ releaseDateLte: "1949-12-31" }).kind, "before-1950");
	assert.equal(classifyCanonicalDecadePeriod({ releaseDateLte: "1959-12-31" }).kind, "1950s-and-earlier");
	assert.equal(classifyCanonicalDecadePeriod({ releaseDateGte: "1984-01-01", releaseDateLte: "1984-12-31" }).kind, "year");
	assert.equal(classifyCanonicalDecadePeriod({ releaseDateGte: "2010-01-01", releaseDateLte: "2019-12-31" }).kind, "decade");
	assert.equal(classifyCanonicalDecadePeriod({ releaseDateGte: "2010-02-01", releaseDateLte: "2019-12-31" }), null);
	assert.equal(classifyCanonicalDecadePeriod({ releaseDateGte: "1950-01-01", releaseDateLte: "1959-12-31" }), null);

	const rich = buildDecadesSourceDrafts(sourceConfiguration({
		content: { wholeDecade: false, individualYears: false, genreBreakdown: true },
		genreNames: ["Horror"],
		advanced: { minimumRating: 7, minimumVotes: 100, exclusionsByGenre: { Horror: ["Comedy"] } },
	})).drafts[0].editable;
	assert.equal(inspectCanonicalDecadeSource({ ...rich, title: "Completely unrelated display title" }).period.id, "1980s");
	assert.equal(inspectCanonicalDecadeSource({ ...rich, tmdbId: null }).period.id, "1980s");
	const { tmdbId, ...withoutTmdbId } = rich;
	assert.equal(tmdbId, null);
	assert.equal(inspectCanonicalDecadeSource(withoutTmdbId).period.id, "1980s");
	for (const invalidTmdbId of ["", "   ", "123", 0, false, {}, []]) {
		assert.equal(inspectCanonicalDecadeSource({ ...rich, tmdbId: invalidTmdbId }), null);
	}
	assert.equal(inspectCanonicalDecadeSource({ ...rich, filters: { ...rich.filters, withKeywords: "15097" } }), null);
	assert.equal(inspectCanonicalDecadeSource({ ...rich, filters: { ...rich.filters, withGenres: "27,35" } }), null);
});

test("canonical Decade plus Genre sources are reserved for Decade classification, not Genre editing", () => {
	const controller = createBuilderController({
		idFactory: countingFactory("internal"),
		nuvioIdFactory: countingFactory("nuvio"),
	});
	const collection = controller.createCollection({ editable: { title: "Collection" } });
	const folder = controller.createFolder(collection.createdInternalId, { editable: { title: "Folder" } });
	const draft = buildDecadesSourceDrafts(sourceConfiguration({
		content: { wholeDecade: false, individualYears: false, genreBreakdown: true },
		genreNames: ["Horror"],
	})).drafts[0];
	controller.createSource(folder.createdInternalId, draft);
	const source = controller.getState().project.collections[0].folders[0].sources[0];
	assert.equal(inspectCanonicalDecadeSource(source.editable).genre.name, "Horror");
	assert.equal(inspectEditableGenreSource(source), null);

	const arbitrary = controller.createSource(folder.createdInternalId, {
		...draft,
		editable: {
			...draft.editable,
			filters: { ...draft.editable.filters, releaseDateGte: "1984-01-01", releaseDateLte: "1992-12-31" },
		},
	});
	const arbitrarySource = controller.getState().project.collections[0].folders[0].sources
		.find((entry) => entry.internalId === arbitrary.createdInternalId);
	assert.equal(inspectCanonicalDecadeSource(arbitrarySource.editable), null);
	assert.equal(inspectEditableGenreSource(arbitrarySource)?.genreName, "Horror");

	const malformed = controller.createSource(folder.createdInternalId, {
		...draft,
		editable: { ...draft.editable, tmdbId: "" },
	});
	const malformedSource = controller.getState().project.collections[0].folders[0].sources
		.find((entry) => entry.internalId === malformed.createdInternalId);
	assert.equal(inspectCanonicalDecadeSource(malformedSource.editable), null);
	assert.equal(inspectEditableGenreSource(malformedSource), null);
});

test("the complete official Genre selection remains an ordered reusable catalogue", () => {
	const names = completeOfficialGenreNames();
	assert.equal(names.length, 27);
	assert.equal(new Set(names).size, 27);
});
