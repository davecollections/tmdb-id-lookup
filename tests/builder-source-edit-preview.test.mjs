import { networkPreviewQuery } from "../builder/src/source-add/network-advanced.js";
import assert from "node:assert/strict";
import test from "node:test";
import { touchDiscoverFilters } from "../builder/src/source-add/advanced-discover.js";
import { studioPreviewQuery } from "../builder/src/source-add/studio-advanced.js";

import { createBuilderController } from "../builder/src/application/index.js";
import {
	choosePeopleSourceCombination,
	createSourceEditSession,
	prepareSourceEditPreview,
	saveSourceEdit,
	updateDecadeSourceSort,
	updateGenreSourceSort,
	updateNetworkSourceSort,
	updatePeopleSourceSort,
	updateSourceEditTitle,
	updateStreamingSourceSort,
	updateStudioSourceSort,
} from "../builder/src/source-edit/index.js";

function ids(prefix) {
	let value = 0;
	return () => `${prefix}-${++value}`;
}

function createProject(sources) {
	const controller = createBuilderController({ idFactory: ids("node"), nuvioIdFactory: ids("nuvio") });
	const imported = controller.importValue([{ id: "c", title: "Collection", folders: [{ id: "f", title: "Folder", sources }] }]);
	assert.equal(imported.ok, true);
	return controller;
}

const sources = [
	{ provider: "tmdb", title: "Franchise", tmdbSourceType: "COLLECTION", tmdbId: 100, mediaType: "MOVIE", sortBy: "original", filters: {}, unknownCollectionField: { keep: true } },
	{ provider: "tmdb", title: "Movie Credits", tmdbSourceType: "PERSON", tmdbId: 31, mediaType: "MOVIE", sortBy: "popularity.desc", filters: {} },
	{ provider: "tmdb", title: "Pixar", tmdbSourceType: "COMPANY", tmdbId: 3, mediaType: "MOVIE", sortBy: "popularity.desc", filters: {} },
	{ provider: "tmdb", title: "ABC", tmdbSourceType: "NETWORK", tmdbId: 2, mediaType: "TV", sortBy: "popularity.desc", filters: {} },
	{ provider: "tmdb", title: "Netflix · AU", tmdbSourceType: "DISCOVER", tmdbId: null, mediaType: "MOVIE", sortBy: "popularity.desc", filters: { watchRegion: "AU", withWatchProviders: "8" } },
	{ provider: "tmdb", title: "Comedy Movies", tmdbSourceType: "DISCOVER", tmdbId: null, mediaType: "MOVIE", sortBy: "popularity.desc", filters: { withGenres: "35" } },
	{ provider: "tmdb", title: "1980s Movies", tmdbSourceType: "DISCOVER", tmdbId: null, mediaType: "MOVIE", sortBy: "popularity.desc", filters: { releaseDateGte: "1980-01-01", releaseDateLte: "1989-12-31" } },
	{ provider: "tmdb", title: "Public list", tmdbSourceType: "LIST", tmdbId: 9, mediaType: "MOVIE", sortBy: "original", filters: {} },
];

function openedAt(controller, index) {
	const source = controller.getState().project.collections[0].folders[0].sources[index];
	const opened = createSourceEditSession(controller.getState().project, source.internalId);
	assert.equal(opened.ok, true);
	return opened;
}

test("Studio Preview projects the current effective native draft, fixed Studio and supported imported filters without mutation", () => {
 for (const mediaType of ["MOVIE", "TV"]) {
  const source = { ...sources[2], mediaType, filters: { voteCountGte: 100, "vote_count.gte": "100", withoutCompanies: "174", withCompanies: "999", voteAverageGte: 5 } };
  const app = createProject([source]), opened = openedAt(app, 0), before = app.stringifyProject().json;
  for (const value of ["100", "0", "", "200"]) {
   const draft = touchDiscoverFilters(opened.draft, { ...opened.draft, filters: { voteCountGte: value } });
   const result = prepareSourceEditPreview(opened.session, draft);
   assert.equal(result.previewable, true, JSON.stringify(result));
   assert.equal(result.candidateSource.editable.tmdbSourceType, "COMPANY");
   const query = studioPreviewQuery(result.request.tmdbId, result.request);
   assert.equal(query.queryParameters.with_companies, "3");
   assert.equal(query.queryParameters.without_companies, "174");
   assert.equal(query.queryParameters["vote_average.gte"], "5");
   assert.equal(query.queryParameters["vote_count.gte"], value || undefined);
   assert.equal(app.stringifyProject().json, before);
  }
 }
});

test("Source Edit preview materializes the current detached draft for all eight adapters without mutating the project", () => {
	const controller = createProject(sources);
	const before = JSON.stringify(controller.stringifyProject().value);
	const expectedKinds = ["collection", "people", "studio", "network", "streaming", "genre", "decade", "list"];

	for (let index = 0; index < expectedKinds.length; index += 1) {
		const opened = openedAt(controller, index);
		let draft = updateSourceEditTitle(opened.draft, `Current draft ${index}`);
		if (index === 1) {
			draft = choosePeopleSourceCombination(draft, "acting-series");
			draft = updatePeopleSourceSort(draft, "first_air_date.desc", "recent");
		}
		if (index === 2) draft = updateStudioSourceSort(draft, "vote_average.desc", "top-rated");
		if (index === 3) draft = updateNetworkSourceSort(draft, "first_air_date.desc", "recent");
		if (index === 4) draft = updateStreamingSourceSort(draft, "vote_count.desc", "most-votes");
		if (index === 5) draft = updateGenreSourceSort(draft, "vote_average.desc", "top-rated");
		if (index === 6) draft = updateDecadeSourceSort(draft, "primary_release_date.desc", "recent");

		const prepared = prepareSourceEditPreview(opened.session, draft);
		assert.equal(prepared.previewable, true, `${opened.session.adapterId}: ${prepared.guidance}`);
		assert.equal(prepared.request.kind, expectedKinds[index]);
		assert.equal(prepared.candidateSource.editable.title, `Current draft ${index}`);
		assert.notEqual(prepared.candidateSource, opened.session.openingProject.collections[0].folders[0].sources[index]);
	}

	assert.equal(JSON.stringify(controller.stringifyProject().value), before);
});

test("Source Edit preview preserves raw imported evidence and derives exact effective Discover candidates", () => {
	const controller = createProject([{
		provider: "tmdb",
		title: "Comedy Movies",
		tmdbSourceType: "DISCOVER",
		tmdbId: null,
		mediaType: "MOVIE",
		sortBy: "popularity.desc",
		filters: { withGenres: "35", voteCountGte: 25 },
		communityEvidence: null,
	}]);
	const opened = openedAt(controller, 0);
	const prepared = prepareSourceEditPreview(opened.session, updateGenreSourceSort(opened.draft, "vote_count.desc", "most-votes"));
	assert.equal(prepared.previewable, true);
	assert.equal(prepared.request.sourceDraft.editable.sortBy, "vote_count.desc");
	assert.deepEqual(prepared.request.sourceDraft.editable.filters, { withGenres: "35", voteCountGte: 25 });
	assert.equal(prepared.candidateSource.rawImported.communityEvidence, null);
	assert.notEqual(prepared.candidateSource.rawImported, opened.session.openingProject.collections[0].folders[0].sources[0].rawImported);
});

test("Source Edit preview stays visible-but-disabled for invalid drafts and untouched unusual imported sorts", () => {
	const unusual = createProject([{ provider: "tmdb", title: "Credits", tmdbSourceType: "PERSON", tmdbId: 31, mediaType: "MOVIE", sortBy: "community.special", filters: {} }]);
	const untouched = openedAt(unusual, 0);
	const unsupported = prepareSourceEditPreview(untouched.session, untouched.draft);
	assert.equal(unsupported.previewable, false);
	assert.equal(unsupported.guidance, "Choose a supported sort to preview.");

	const invalid = prepareSourceEditPreview(untouched.session, updateSourceEditTitle(untouched.draft, ""));
	assert.equal(invalid.previewable, false);
	assert.equal(invalid.guidance, "Fix the current source fields before previewing.");
	assert.ok(invalid.errors.length > 0);
});

test("Network Preview projects the current effective native draft, fixed Network and supported imported filters without mutation", () => {
 for (const mediaType of ["TV"]) {
  const source = { ...sources[3], mediaType, filters: { voteCountGte: 100, "vote_count.gte": "100", withoutCompanies: "174", withNetworks: "999", voteAverageGte: 5 } };
  const app = createProject([source]), opened = openedAt(app, 0), before = app.stringifyProject().json;
  for (const value of ["100", "0", "", "200"]) {
   const draft = touchDiscoverFilters(opened.draft, { ...opened.draft, filters: { voteCountGte: value } });
   const result = prepareSourceEditPreview(opened.session, draft);
   assert.equal(result.previewable, true, JSON.stringify(result));
   assert.equal(result.candidateSource.editable.tmdbSourceType, "NETWORK");
   const query = networkPreviewQuery(result.request.tmdbId, result.request);
   assert.equal(query.queryParameters.with_networks, "2");
   assert.equal(query.queryParameters.without_companies, "174");
   assert.equal(query.queryParameters["vote_average.gte"], "5");
   assert.equal(query.queryParameters["vote_count.gte"], value || undefined);
   assert.equal(app.stringifyProject().json, before);
  }
 }
});


test("Network imported minimum and fixed-network aliases fail closed before requests", () => {
 for (const filters of [
  { "vote_count.gte": 100 }, { voteCountGte: 100, "vote_count.gte": 0 },
  { voteCountGte: -1 }, { voteCountGte: [100] }, { with_networks: "2" }, { withNetworks: "999", with_networks: "2" },
  { custom: false }, { voteCountGte: 100, withOriginalLanguage: "en|fr" },
 ]) {
  const app = createProject([{ ...sources[3], filters }]), opened = openedAt(app, 0);
  const before = app.stringifyProject().json;
  const result = prepareSourceEditPreview(opened.session, opened.draft);
  assert.equal(result.previewable, false, JSON.stringify(filters));
  assert.match(result.guidance, /cannot be previewed exactly/);
  assert.equal(app.stringifyProject().json, before);
 }
});

for (const [family, original, previewQuery, inclusionField] of [
	["Network TV", sources[3], networkPreviewQuery, "withNetworks"],
	["Studio Movie", sources[2], studioPreviewQuery, "withCompanies"],
	["Studio TV", { ...sources[2], mediaType: "TV" }, studioPreviewQuery, "withCompanies"],
]) {
	for (const [field, value] of [
		["voteAverageGte", [5]], ["voteAverageLte", [9]], ["year", [2020]],
		["withOriginalLanguage", ["en"]], ["withOriginCountry", ["AU"]],
		["releaseDateGte", ["2020-01-01"]], ["withoutCompanies", [174]],
		["voteAverageLte", { value: 9 }], ["voteAverageGte", true], ["year", false],
		["withOriginalLanguage", { value: "en" }], ["withoutCompanies", 174],
		[inclusionField, [999]],
	]) {
		test(`${family} preserves imported ${field}=${JSON.stringify(value)} while exact Preview fails closed`, () => {
			const filters = { voteCountGte: 100, [field]: value };
			const app = createProject([{ ...original, filters }]);
			let opened = openedAt(app, 0);
			const imported = JSON.parse(app.stringifyProject().json);
			assert.deepEqual(imported[0].folders[0].sources[0].filters, filters);
			assert.equal(opened.draft.minimumVotesEditable, true);
			assert.equal(saveSourceEdit(app, opened.session, opened.draft).ok, true);
			assert.deepEqual(JSON.parse(app.stringifyProject().json), imported);
			assert.equal(saveSourceEdit(app, opened.session, updateSourceEditTitle(opened.draft, "Renamed")).ok, true);
			imported[0].folders[0].sources[0].title = "Renamed";
			assert.deepEqual(JSON.parse(app.stringifyProject().json), imported);

			opened = openedAt(app, 0);
			const draft = touchDiscoverFilters(opened.draft, { ...opened.draft, filters: { voteCountGte: "200" } });
			assert.equal(saveSourceEdit(app, opened.session, draft).ok, true);
			imported[0].folders[0].sources[0].filters.voteCountGte = 200;
			assert.deepEqual(JSON.parse(app.stringifyProject().json), imported);

			opened = openedAt(app, 0);
			const before = structuredClone(app.getState());
			const preview = prepareSourceEditPreview(opened.session, opened.draft);
			assert.deepEqual(app.getState(), before, "attempting Preview must not mutate imported source state");
			assert.equal(preview.previewable, false);
			assert.equal(preview.request, null);
			assert.equal(preview.candidateSource, null);
			assert.match(preview.guidance, /cannot be previewed exactly/);
			assert.equal(previewQuery(original.tmdbId, { ...original, filters }), null);
		});
	}
	test(`${family} retains exact valid scalar queries, native identity and inactive imported values`, () => {
		const recentSort = original.mediaType === "TV" ? "first_air_date.desc" : "primary_release_date.desc";
		for (const sortBy of ["popularity.desc", recentSort, "vote_average.desc", "vote_count.desc"]) {
			for (const minimum of [undefined, null, "", 0, "0", 100, "100"]) for (const numericStrings of [false, true]) {
				const filters = {
					...(minimum === undefined ? {} : { voteCountGte: minimum }),
					voteAverageGte: numericStrings ? "5" : 5, voteAverageLte: numericStrings ? "9" : 9,
					year: numericStrings ? "2020" : 2020, withoutCompanies: "174",
					withOriginalLanguage: "en", withOriginCountry: "AU", releaseDateGte: "2020-01-01",
					withKeywords: null, withoutGenres: "", [inclusionField]: "999",
				};
				const app = createProject([{ ...original, sortBy, filters }]), opened = openedAt(app, 0);
				const before = structuredClone(app.getState());
				const preview = prepareSourceEditPreview(opened.session, opened.draft);
				assert.equal(preview.previewable, true, JSON.stringify(preview));
				assert.equal(preview.candidateSource.editable.tmdbSourceType, original.tmdbSourceType);
				assert.equal(preview.candidateSource.editable.tmdbId, original.tmdbId);
				const expected = { mediaType: original.mediaType, queryParameters: {
					include_adult: "false", sort_by: sortBy,
					...(minimum === undefined || minimum === null || minimum === "" ? {} : { "vote_count.gte": String(minimum) }),
					"vote_average.gte": "5", "vote_average.lte": "9", without_companies: "174",
					with_original_language: "en", with_origin_country: "AU",
					[original.mediaType === "TV" ? "first_air_date_year" : "year"]: "2020",
					[original.mediaType === "TV" ? "first_air_date.gte" : "primary_release_date.gte"]: "2020-01-01",
					[inclusionField === "withNetworks" ? "with_networks" : "with_companies"]: String(original.tmdbId),
				} };
				assert.deepEqual(previewQuery(preview.request.tmdbId, preview.request), expected);
				const inactive = { ...filters, withoutKeywords: undefined };
				assert.deepEqual(previewQuery(original.tmdbId, { ...original, sortBy, filters: inactive }), expected);
				assert.equal(Object.hasOwn(inactive, "withoutKeywords"), true);
				assert.equal(saveSourceEdit(app, opened.session, opened.draft).ok, true);
				assert.deepEqual(app.getState(), before);
			}
		}
	});
}
