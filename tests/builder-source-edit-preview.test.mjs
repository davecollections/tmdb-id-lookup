import assert from "node:assert/strict";
import test from "node:test";
import { touchDiscoverFilters } from "../builder/src/source-add/advanced-discover.js";
import { studioPreviewQuery } from "../builder/src/source-add/studio-advanced.js";

import { createBuilderController } from "../builder/src/application/index.js";
import {
	choosePeopleSourceCombination,
	createSourceEditSession,
	prepareSourceEditPreview,
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
