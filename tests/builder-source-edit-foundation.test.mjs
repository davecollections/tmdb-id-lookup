import assert from "node:assert/strict";
import test from "node:test";

import { createBuilderController } from "../builder/src/application/index.js";
import {
	calculatePersonCreditCounts,
	createTmdbPersonProvider,
	PEOPLE_SOURCE_COMBINATIONS,
	STUDIO_MOVIE_SORT_OPTIONS,
} from "../builder/src/source-add/index.js";
import {
	MOVIE_COLLECTION_SOURCE_EDITOR_ID,
	NETWORK_SOURCE_EDITOR_ID,
	PEOPLE_SOURCE_EDITOR_ID,
	STUDIO_SOURCE_EDITOR_ID,
	STREAMING_SOURCE_EDITOR_ID,
	canEditSource,
	chooseMovieCollection,
	choosePeopleSourceCombination,
	createPeopleEditCountSession,
	createStudioEditCountSession,
	createSourceEditSession,
	peopleEditCountLabel,
	peopleSortOptions,
	saveSourceEdit,
	sourceEditorFor,
	streamingDefaultSourceName,
	updatePeopleSourceSort,
	updateStudioSourceSort,
	updateStreamingSourceSort,
	updateSourceEditTitle,
	usePeopleDefaultTitle,
	useSelectedMovieCollectionName,
} from "../builder/src/source-edit/index.js";

function countingIdFactory(prefix = "builder") {
	let count = 0;
	return () => `${prefix}-${++count}`;
}

function createController() {
	return createBuilderController({
		idFactory: countingIdFactory(),
		nuvioIdFactory: countingIdFactory("nuvio"),
		initialProjectTitle: "Source editing",
	});
}

function collectionSource(overrides = {}) {
	return {
		provider: "tmdb",
		title: "Original collection title",
		tmdbSourceType: "COLLECTION",
		tmdbId: 100,
		mediaType: "MOVIE",
		sortBy: "original",
		filters: {},
		...overrides,
	};
}

function peopleSource(overrides = {}) {
	return {
		provider: "tmdb",
		title: "Movie Credits",
		tmdbSourceType: "PERSON",
		tmdbId: 31,
		mediaType: "MOVIE",
		sortBy: "popularity.desc",
		filters: {},
		...overrides,
	};
}

function studioSource(overrides = {}) {
	return {
		provider: "tmdb",
		title: "Pixar",
		tmdbSourceType: "COMPANY",
		tmdbId: 3,
		mediaType: "MOVIE",
		sortBy: "popularity.desc",
		filters: {},
		...overrides,
	};
}

function streamingSource(overrides = {}) {
	return {
		provider: "tmdb",
		title: "Netflix · AU",
		tmdbSourceType: "DISCOVER",
		tmdbId: null,
		mediaType: "MOVIE",
		sortBy: "popularity.desc",
		filters: { watchRegion: "AU", withWatchProviders: "8" },
		...overrides,
	};
}

function importFolder(controller, sources, folderOverrides = {}, collectionOverrides = {}) {
	const result = controller.importValue([{
		id: "collection-id",
		title: "Collection",
		pinToTop: false,
		focusGlowEnabled: true,
		viewMode: "TABBED_GRID",
		showAllTab: true,
		unknownCollection: { keep: true },
		...collectionOverrides,
		folders: [{
			id: "folder-id",
			title: "Folder",
			hideTitle: true,
			tileShape: "POSTER",
			coverEmoji: "🎬",
			focusGifUrl: "https://example.invalid/focus.gif",
			heroVideoUrl: "https://example.invalid/hero.mp4",
			titleLogoUrl: "https://example.invalid/logo.png",
			coverImageUrl: "https://example.invalid/cover.jpg",
			focusGifEnabled: false,
			heroBackdropUrl: "https://example.invalid/hero.jpg",
			unknownFolder: { nested: [1, null, false] },
			...folderOverrides,
			sources,
			catalogSources: [],
		}],
	}]);
	assert.equal(result.ok, true);
	return controller.getState().project.collections[0].folders[0];
}

function serialize(controller) {
	const result = controller.stringifyProject();
	assert.equal(result.ok, true, result.errors?.[0]?.message);
	return result;
}

function sessionFor(controller, sourceIndex = 0) {
	const source = controller.getState().project.collections[0].folders[0].sources[sourceIndex];
	const opened = createSourceEditSession(controller.getState().project, source.internalId);
	assert.equal(opened.ok, true);
	return { ...opened, source };
}

test("registry discovers complete Movie Collection, People, Studio, Network, and simple Streaming sources", () => {
	const controller = createController();
	const folder = importFolder(controller, [
		collectionSource({ provider: "TMDB", tmdbSourceType: "collection", tmdbId: "0100", mediaType: "movie" }),
		peopleSource({ provider: "TmDb", tmdbSourceType: "director", tmdbId: "31", mediaType: "tv" }),
		peopleSource({ provider: "tmdb", tmdbSourceType: "PERSON", tmdbId: 32, mediaType: "TV" }),
		{ provider: "tmdb", title: "People-like Discover", tmdbSourceType: "DISCOVER", tmdbId: 31, mediaType: "MOVIE", filters: { withPeople: "31" } },
		{ provider: "tmdb", title: "List", tmdbSourceType: "LIST", tmdbId: 1, mediaType: "MOVIE" },
		{ provider: "tmdb", title: "Company", tmdbSourceType: "COMPANY", tmdbId: 2, mediaType: "MOVIE" },
		{ provider: "tmdb", title: "Company Series", tmdbSourceType: "COMPANY", tmdbId: 2, mediaType: "TV" },
		{ provider: "tmdb", title: "Network", tmdbSourceType: "NETWORK", tmdbId: 3, mediaType: "TV" },
		{ provider: "addon", title: "Addon", addonId: "a", type: "movie", catalogId: "c" },
		{ provider: "community", title: "Opaque", unknown: true },
		{ provider: "tmdb", title: "Incomplete", tmdbSourceType: "COLLECTION", mediaType: "MOVIE" },
		streamingSource(),
		streamingSource({ title: "Netflix series · AU", mediaType: "TV" }),
	]);
	assert.equal(sourceEditorFor(folder.sources[0]).id, MOVIE_COLLECTION_SOURCE_EDITOR_ID);
	assert.equal(sourceEditorFor(folder.sources[1]).id, PEOPLE_SOURCE_EDITOR_ID);
	assert.equal(sourceEditorFor(folder.sources[2]).id, PEOPLE_SOURCE_EDITOR_ID);
	assert.equal(sourceEditorFor(folder.sources[5]).id, STUDIO_SOURCE_EDITOR_ID);
	assert.equal(sourceEditorFor(folder.sources[6]).id, STUDIO_SOURCE_EDITOR_ID);
	assert.equal(sourceEditorFor(folder.sources[7]).id, NETWORK_SOURCE_EDITOR_ID);
	assert.equal(sourceEditorFor(folder.sources[11]).id, STREAMING_SOURCE_EDITOR_ID);
	assert.equal(sourceEditorFor(folder.sources[12]).id, STREAMING_SOURCE_EDITOR_ID);
	for (const index of [3, 4, 8, 9, 10]) assert.equal(canEditSource(folder.sources[index]), false);
});

test("Streaming Edit recognition fails closed for compound, filtered, unknown and malformed DISCOVER sources", () => {
	const controller = createController();
	const folder = importFolder(controller, [
		streamingSource(),
		streamingSource({ filters: { watchRegion: "AU", withWatchProviders: "8|9" } }),
		streamingSource({ filters: { watchRegion: "AU", withWatchProviders: "8", withGenres: "18" } }),
		streamingSource({ filters: { watchRegion: "AU", withWatchProviders: "8", releaseDateGte: "2020-01-01" } }),
		streamingSource({ filters: { watchRegion: "AU", withWatchProviders: "8", voteAverageGte: 7 } }),
		streamingSource({ filters: { watchRegion: "AU", withWatchProviders: "8", withoutGenres: "18" } }),
		streamingSource({ filters: { watchRegion: "AU", withWatchProviders: "8", withoutKeywords: "99" } }),
		streamingSource({ filters: { watchRegion: "AU", withWatchProviders: "8", withoutCompanies: "3" } }),
		streamingSource({ filters: { watchRegion: "AU", withWatchProviders: "8", withoutWatchProviders: "9" } }),
		streamingSource({ filters: { watchRegion: "AU", withoutWatchProviders: "9" } }),
		streamingSource({ filters: { watchRegion: "AU", withWatchProviders: "8", withoutGenres: "18", withoutKeywords: "99" } }),
		streamingSource({ filters: { watchRegion: "au", withWatchProviders: "8" } }),
		streamingSource({ filters: { watchRegion: "AU", withWatchProviders: 8 } }),
		streamingSource({ unknownMeaningful: { keep: true } }),
		streamingSource({ sortBy: { unsafe: true } }),
	]);
	assert.equal(sourceEditorFor(folder.sources[0]).id, STREAMING_SOURCE_EDITOR_ID);
	for (let index = 1; index < folder.sources.length; index += 1) assert.equal(canEditSource(folder.sources[index]), false, index);
});

test("Streaming Edit changes only title and semantic sort while fixed identity and raw null evidence survive", () => {
	const controller = createController();
	importFolder(controller, [streamingSource({ legacyNull: null, filters: { watchRegion: "AU", withWatchProviders: "8", withGenres: null } })]);
	const opened = sessionFor(controller);
	assert.equal(opened.session.adapterId, STREAMING_SOURCE_EDITOR_ID);
	assert.equal(opened.draft.providerId, 8);
	assert.equal(opened.draft.regionCode, "AU");
	assert.equal(opened.draft.mediaType, "MOVIE");
	const beforeIdentity = opened.session.originalIdentity;
	let draft = updateSourceEditTitle(opened.draft, "Netflix cinema");
	draft = updateStreamingSourceSort(draft, "vote_average.desc", "top-rated");
	const saved = saveSourceEdit(controller, opened.session, draft);
	assert.equal(saved.ok, true);
	assert.deepEqual(saved.patch, { title: "Netflix cinema", sortBy: "vote_average.desc" });
	const output = serialize(controller).value[0].folders[0].sources[0];
	assert.equal(output.title, "Netflix cinema");
	assert.equal(output.sortBy, "vote_average.desc");
	assert.equal(output.tmdbId, null);
	assert.deepEqual(output.filters, { watchRegion: "AU", withWatchProviders: "8", withGenres: null });
	assert.equal(output.legacyNull, null);
	assert.notEqual(opened.session.originalIdentity, sourceEditorFor(controller.getState().project.collections[0].folders[0].sources[0]).sourceIdentity(controller.getState().project.collections[0].folders[0].sources[0]));
	assert.equal(typeof beforeIdentity, "string");
});

test("Streaming default-name reset is media-qualified for Movie and TV", () => {
	assert.equal(streamingDefaultSourceName("Netflix", "AU", "MOVIE"), "Netflix, AU - Movies");
	assert.equal(streamingDefaultSourceName("Netflix", "AU", "TV"), "Netflix, AU - Series");
	assert.equal(streamingDefaultSourceName("Netflix", "AU", null), null);
});

test("Streaming TV Recent saves a sort-only patch with the DISCOVER-owned media mapping", () => {
	const controller = createController();
	importFolder(controller, [streamingSource({ title: "Netflix series", mediaType: "TV" })]);
	const opened = sessionFor(controller);
	const saved = saveSourceEdit(
		controller,
		opened.session,
		updateStreamingSourceSort(opened.draft, "first_air_date.desc", "recent"),
	);
	assert.equal(saved.ok, true);
	assert.deepEqual(saved.patch, { sortBy: "first_air_date.desc" });
	assert.equal(serialize(controller).value[0].folders[0].sources[0].sortBy, "first_air_date.desc");
});

test("Streaming Edit preserves unsupported imported sort until touched and makes no-op Save mutation-free", () => {
	const controller = createController();
	importFolder(controller, [streamingSource({ sortBy: "owner.custom.order" })]);
	const opened = sessionFor(controller);
	assert.equal(opened.draft.sortOptionId, null);
	const before = serialize(controller);
	let saved = saveSourceEdit(controller, opened.session, opened.draft);
	assert.equal(saved.ok, true);
	assert.equal(saved.changed, false);
	assert.equal(serialize(controller).json, before.json);
	saved = saveSourceEdit(controller, opened.session, updateStreamingSourceSort(opened.draft, "invented.desc", "invented"));
	assert.equal(saved.ok, false);
	assert.equal(saved.validationFailed, true);
	assert.equal(saved.errors[0].code, "SOURCE_EDIT_STREAMING_SORT_UNSUPPORTED");
	assert.equal(serialize(controller).json, before.json);
});

test("Streaming sort change uses full DISCOVER identity for duplicate rejection while title-only edit does not", () => {
	const controller = createController();
	importFolder(controller, [
		streamingSource(),
		streamingSource({ title: "Recent duplicate target", sortBy: "vote_count.desc", filters: { watchRegion: "AU", withWatchProviders: "8", withGenres: null } }),
	]);
	let opened = sessionFor(controller, 0);
	const before = serialize(controller);
	const duplicate = saveSourceEdit(controller, opened.session, updateStreamingSourceSort(opened.draft, "vote_count.desc", "most-votes"));
	assert.equal(duplicate.ok, false);
	assert.equal(duplicate.duplicateRejected, true);
	assert.equal(serialize(controller).json, before.json);
	opened = sessionFor(controller, 0);
	const renamed = saveSourceEdit(controller, opened.session, updateSourceEditTitle(opened.draft, "Custom Netflix"));
	assert.equal(renamed.ok, true);
	assert.deepEqual(renamed.patch, { title: "Custom Netflix" });
});

test("custom-named Streaming source edits remain exact through export and a second import cycle", () => {
	const controller = createController();
	importFolder(controller, [streamingSource({ title: "Imported stream shelf", legacyNull: null })]);
	const opened = sessionFor(controller);
	let draft = updateSourceEditTitle(opened.draft, "My Streaming shelf");
	draft = updateStreamingSourceSort(draft, "primary_release_date.desc", "recent");
	assert.equal(saveSourceEdit(controller, opened.session, draft).ok, true);
	const first = serialize(controller);
	const cycled = createController();
	assert.equal(cycled.importValue(first.value).ok, true);
	const second = serialize(cycled);
	assert.deepEqual(second.value, first.value);
	assert.equal(second.json, first.json);
});

test("opening binds exact physical source context and never uses duplicate titles as a locator", () => {
	const controller = createController();
	const folder = importFolder(controller, [
		collectionSource({ tmdbId: 100, title: "Same" }),
		collectionSource({ tmdbId: 200, title: "Same" }),
	]);
	const opened = createSourceEditSession(controller.getState().project, folder.sources[1].internalId);
	assert.equal(opened.ok, true);
	assert.equal(opened.session.sourceInternalId, folder.sources[1].internalId);
	assert.equal(opened.session.sourceIndex, 1);
	assert.equal(opened.session.folderInternalId, folder.internalId);
	assert.equal(opened.session.openingProject, controller.getState().project);
	assert.equal(opened.session.originalIdentity, "tmdb|COLLECTION|200|MOVIE");
	assert.deepEqual(opened.draft, {
		title: "Same",
		titleTouched: false,
		tmdbId: 200,
		identityTouched: false,
		selectedCollectionName: null,
	});
});

test("no-op Save makes zero update calls and leaves serialized output byte-identical", () => {
	const controller = createController();
	importFolder(controller, [collectionSource()]);
	const opened = sessionFor(controller);
	const before = serialize(controller);
	const originalUpdate = controller.updateNode;
	let calls = 0;
	const spyController = {
		...controller,
		updateNode(...args) {
			calls += 1;
			return originalUpdate(...args);
		},
	};
	const result = saveSourceEdit(spyController, opened.session, opened.draft);
	assert.equal(result.ok, true);
	assert.equal(result.changed, false);
	assert.equal(calls, 0);
	assert.equal(serialize(controller).json, before.json);
});

test("one real title Save makes one updateNode call and one revision", () => {
	const controller = createController();
	importFolder(controller, [collectionSource()]);
	const opened = sessionFor(controller);
	const revision = controller.getState().revision;
	const originalUpdate = controller.updateNode;
	let calls = 0;
	const spyController = {
		...controller,
		updateNode(...args) {
			calls += 1;
			return originalUpdate(...args);
		},
	};
	const draft = updateSourceEditTitle(opened.draft, "Edited title");
	const result = saveSourceEdit(spyController, opened.session, draft);
	assert.equal(result.ok, true);
	assert.equal(result.changed, true);
	assert.deepEqual(result.patch, { title: "Edited title" });
	assert.equal(calls, 1);
	assert.equal(controller.getState().revision, revision + 1);
	assert.equal(controller.getState().project.collections[0].folders[0].sources[0].internalId, opened.source.internalId);
});

test("selecting a Collection immediately adopts its canonical title and Save patches title and identity once", () => {
	const controller = createController();
	importFolder(controller, [collectionSource({ title: null, tmdbId: "00100", rawNested: { keep: true } })]);
	const opened = sessionFor(controller);
	const selected = chooseMovieCollection(opened.draft, { id: 300, name: "Selected franchise" });
	assert.equal(selected.title, "Selected franchise");
	assert.equal(selected.titleTouched, true);
	const originalUpdate = controller.updateNode;
	let calls = 0;
	const result = saveSourceEdit({
		...controller,
		updateNode(...args) {
			calls += 1;
			return originalUpdate(...args);
		},
	}, opened.session, selected);
	assert.equal(result.ok, true);
	assert.deepEqual(result.patch, { title: "Selected franchise", tmdbId: 300 });
	assert.equal(calls, 1);
	const source = serialize(controller).value[0].folders[0].sources[0];
	assert.equal(source.title, "Selected franchise");
	assert.equal(source.tmdbId, 300);
	assert.deepEqual(source.rawNested, { keep: true });
});

test("Collection custom title and selected-name reset stay local until Save", () => {
	const controller = createController();
	importFolder(controller, [collectionSource({ title: "Keep me" })]);
	const opened = sessionFor(controller);
	let draft = chooseMovieCollection(opened.draft, { id: 400, name: "New official name" });
	assert.equal(draft.title, "New official name");
	draft = updateSourceEditTitle(draft, "My custom franchise");
	assert.equal(draft.title, "My custom franchise");
	assert.equal(serialize(controller).value[0].folders[0].sources[0].title, "Keep me");
	assert.equal(serialize(controller).value[0].folders[0].sources[0].tmdbId, 100);
	draft = useSelectedMovieCollectionName(draft);
	assert.equal(draft.title, "New official name");
	const result = saveSourceEdit(controller, opened.session, draft);
	assert.deepEqual(result.patch, { title: "New official name", tmdbId: 400 });
	assert.equal(serialize(controller).value[0].folders[0].sources[0].title, "New official name");
});

test("Cancel-equivalent Collection draft abandonment leaves the original source unchanged", () => {
	const controller = createController();
	importFolder(controller, [collectionSource({ title: "Keep me" })]);
	const before = serialize(controller);
	const opened = sessionFor(controller);
	const draft = chooseMovieCollection(opened.draft, { id: 400, name: "New official name" });
	assert.equal(draft.title, "New official name");
	assert.equal(serialize(controller).json, before.json);
	assert.equal(controller.getState().revision, 1);
});

test("every auto-managed People title follows its role and media combination", () => {
	for (const target of PEOPLE_SOURCE_COMBINATIONS) {
		const controller = createController();
		importFolder(controller, [peopleSource()]);
		const opened = sessionFor(controller);
		assert.equal(opened.draft.titleMode, "auto");
		const draft = choosePeopleSourceCombination(opened.draft, target.id);
		const result = saveSourceEdit(controller, opened.session, draft);
		assert.equal(result.ok, true, target.id);
		const source = serialize(controller).value[0].folders[0].sources[0];
		assert.equal(source.tmdbId, 31, target.id);
		assert.equal(source.tmdbSourceType, target.tmdbSourceType, target.id);
		assert.equal(source.mediaType, target.mediaType, target.id);
		assert.equal(source.title, target.sourceTitle, target.id);
		assert.equal(Object.hasOwn(result.patch, "tmdbId"), false, target.id);
	}
});

test("custom imported and manually typed People titles survive later combination changes", () => {
	const importedController = createController();
	importFolder(importedController, [peopleSource({ title: "Imported custom title" })]);
	let opened = sessionFor(importedController);
	assert.equal(opened.draft.titleMode, "custom");
	let draft = choosePeopleSourceCombination(opened.draft, "directing-series");
	assert.equal(draft.title, "Imported custom title");
	assert.equal(saveSourceEdit(importedController, opened.session, draft).ok, true);
	assert.equal(serialize(importedController).value[0].folders[0].sources[0].title, "Imported custom title");

	const typedController = createController();
	importFolder(typedController, [peopleSource()]);
	opened = sessionFor(typedController);
	draft = updateSourceEditTitle(opened.draft, "My hand-picked credits");
	assert.equal(draft.titleMode, "custom");
	draft = choosePeopleSourceCombination(draft, "directing-series");
	assert.equal(draft.title, "My hand-picked credits");
	const result = saveSourceEdit(typedController, opened.session, draft);
	assert.deepEqual(result.patch, {
		title: "My hand-picked credits",
		tmdbSourceType: "DIRECTOR",
		mediaType: "TV",
	});
});

test("Use default title restores People auto-sync and returning to the original result is a no-op", () => {
	const controller = createController();
	importFolder(controller, [peopleSource({ title: "Custom" })]);
	let opened = sessionFor(controller);
	let draft = choosePeopleSourceCombination(opened.draft, "directing-series");
	draft = usePeopleDefaultTitle(draft);
	assert.equal(draft.titleMode, "auto");
	draft = choosePeopleSourceCombination(draft, "acting-series");
	assert.equal(draft.title, "Series Credits");
	let result = saveSourceEdit(controller, opened.session, draft);
	assert.deepEqual(result.patch, {
		title: "Series Credits",
		mediaType: "TV",
	});
	assert.equal(serialize(controller).value[0].folders[0].sources[0].title, "Series Credits");

	const noOpController = createController();
	importFolder(noOpController, [peopleSource()]);
	opened = sessionFor(noOpController);
	draft = choosePeopleSourceCombination(opened.draft, "directing-series");
	draft = choosePeopleSourceCombination(draft, "acting-movies");
	result = saveSourceEdit(noOpController, opened.session, draft);
	assert.equal(result.changed, false);
});

test("newly touched titles are validated while unusual untouched imported titles remain preserved", () => {
	const controller = createController();
	importFolder(controller, [peopleSource({ title: null })]);
	let opened = sessionFor(controller);
	let result = saveSourceEdit(controller, opened.session, updateSourceEditTitle(opened.draft, " \t "));
	assert.equal(result.ok, false);
	assert.equal(result.validationFailed, true);
	assert.equal(result.errors[0].code, "SOURCE_EDIT_TITLE_REQUIRED");
	assert.equal(result.errors[0].path, "$sourceEdit.title");
	assert.equal(result.errors[0].message, "Enter a name for this source before saving.");
	assert.equal(serialize(controller).value[0].folders[0].sources[0].title, null);

	opened = sessionFor(controller);
	result = saveSourceEdit(controller, opened.session, updateSourceEditTitle(opened.draft, "\u200E"));
	assert.equal(result.ok, true);
	assert.equal(serialize(controller).value[0].folders[0].sources[0].title, "\u200E");

	const untouchedController = createController();
	importFolder(untouchedController, [peopleSource({ title: null })]);
	opened = sessionFor(untouchedController);
	result = saveSourceEdit(untouchedController, opened.session, choosePeopleSourceCombination(opened.draft, "acting-series"));
	assert.equal(result.ok, true);
	assert.equal(serialize(untouchedController).value[0].folders[0].sources[0].title, null);
});

test("People sort inventory is limited to the stable v1 values for each media type", () => {
	assert.deepEqual(peopleSortOptions("MOVIE"), [
		{ id: "popular", label: "Popular", value: "popularity.desc" },
		{ id: "recent", label: "Recent", value: "primary_release_date.desc" },
		{ id: "top-rated", label: "Top rated", value: "vote_average.desc" },
	]);
	assert.deepEqual(peopleSortOptions("TV"), [
		{ id: "popular", label: "Popular", value: "popularity.desc" },
		{ id: "recent", label: "Recent", value: "first_air_date.desc" },
		{ id: "top-rated", label: "Top rated", value: "vote_average.desc" },
	]);
	assert.deepEqual(sourceEditorFor({
		nodeType: "source",
		category: "native-tmdb",
		editable: peopleSource(),
	}).ownedFields, ["title", "tmdbSourceType", "mediaType", "sortBy"]);
});

test("Studio editor locks COMPANY identity/media while exposing title and correct Movie sort values", () => {
	assert.deepEqual(STUDIO_MOVIE_SORT_OPTIONS, [
		{ id: "popular", label: "Popular", value: "popularity.desc" },
		{ id: "recent", label: "Recent", value: "primary_release_date.desc" },
		{ id: "top-rated", label: "Top rated", value: "vote_average.desc" },
		{ id: "most-votes", label: "Most voted", value: "vote_count.desc" },
	]);
	const controller = createController();
	importFolder(controller, [studioSource({ sortBy: "vote_average.desc" })]);
	const opened = sessionFor(controller);
	assert.equal(opened.session.adapterId, STUDIO_SOURCE_EDITOR_ID);
	assert.equal(opened.session.originalIdentity, "tmdb|COMPANY|3|MOVIE");
	assert.deepEqual(opened.draft, {
		title: "Pixar",
		titleTouched: false,
		studioName: "Pixar",
		tmdbId: 3,
		mediaType: "MOVIE",
		sortBy: "vote_average.desc",
		originalSortBy: "vote_average.desc",
		sortOptionId: "top-rated",
		sortTouched: false,
	});
	assert.deepEqual(sourceEditorFor(opened.source).ownedFields, ["title", "sortBy"]);
});

test("Studio Edit saves one title/sort patch and round-trips without changing identity or inserting", () => {
	const controller = createController();
	importFolder(controller, [studioSource({ unknownSource: { keep: true } })]);
	const opened = sessionFor(controller);
	const beforeCount = controller.getState().project.collections[0].folders[0].sources.length;
	let draft = updateSourceEditTitle(opened.draft, "Pixar Movies");
	draft = updateStudioSourceSort(draft, "primary_release_date.desc", "recent");
	const saved = saveSourceEdit(
		controller,
		opened.session,
		draft,
	);
	assert.equal(saved.ok, true);
	assert.deepEqual(saved.patch, { title: "Pixar Movies", sortBy: "primary_release_date.desc" });
	assert.equal(controller.getState().project.collections[0].folders[0].sources.length, beforeCount);
	const first = serialize(controller);
	assert.equal(first.value[0].folders[0].sources[0].sortBy, "primary_release_date.desc");
	assert.equal(first.value[0].folders[0].sources[0].title, "Pixar Movies");
	assert.deepEqual({
		tmdbId: first.value[0].folders[0].sources[0].tmdbId,
		tmdbSourceType: first.value[0].folders[0].sources[0].tmdbSourceType,
		mediaType: first.value[0].folders[0].sources[0].mediaType,
		filters: first.value[0].folders[0].sources[0].filters,
	}, { tmdbId: 3, tmdbSourceType: "COMPANY", mediaType: "MOVIE", filters: {} });
	assert.deepEqual(first.value[0].folders[0].sources[0].unknownSource, { keep: true });
	const cycled = createController();
	assert.equal(cycled.importValue(first.value).ok, true);
	assert.deepEqual(serialize(cycled).value, first.value);
});

test("Studio Series Edit uses COMPANY/TV identity and maps Recent without changing media", () => {
	const controller = createController();
	importFolder(controller, [studioSource({ title: "Pixar Series", mediaType: "TV", sortBy: "popularity.desc" })]);
	const opened = sessionFor(controller);
	assert.equal(opened.session.originalIdentity, "tmdb|COMPANY|3|TV");
	assert.equal(opened.draft.mediaType, "TV");
	const changed = updateStudioSourceSort(opened.draft, "first_air_date.desc", "recent");
	const saved = saveSourceEdit(controller, opened.session, changed);
	assert.equal(saved.ok, true);
	assert.deepEqual(saved.patch, { sortBy: "first_air_date.desc" });
	assert.equal(serialize(controller).value[0].folders[0].sources[0].mediaType, "TV");
});

test("Studio Edit cancel/no-save is non-mutating and unsupported touched sorts fail closed", () => {
	const controller = createController();
	importFolder(controller, [studioSource({ sortBy: "owner.imported.sort" })]);
	const opened = sessionFor(controller);
	const before = serialize(controller);
	assert.equal(serialize(controller).json, before.json);
	const failed = saveSourceEdit(
		controller,
		opened.session,
		updateStudioSourceSort(opened.draft, "invented.desc"),
	);
	assert.equal(failed.ok, false);
	assert.equal(failed.validationFailed, true);
	assert.equal(failed.errors[0].code, "SOURCE_EDIT_STUDIO_SORT_UNSUPPORTED");
	assert.equal(serialize(controller).json, before.json);
});

test("Studio duplicate review ignores self but rejects another conflicting physical source", () => {
	const single = createController();
	importFolder(single, [studioSource()]);
	let opened = sessionFor(single);
	assert.equal(saveSourceEdit(single, opened.session, updateStudioSourceSort(opened.draft, "vote_count.desc")).ok, true);

	const duplicated = createController();
	importFolder(duplicated, [studioSource(), studioSource({ title: "Imported duplicate" })]);
	opened = sessionFor(duplicated, 0);
	const before = serialize(duplicated);
	const rejected = saveSourceEdit(
		duplicated,
		opened.session,
		updateStudioSourceSort(opened.draft, "vote_count.desc"),
	);
	assert.equal(rejected.ok, false);
	assert.equal(rejected.duplicateRejected, true);
	assert.equal(rejected.duplicate.internalId, duplicated.getState().project.collections[0].folders[0].sources[1].internalId);
	assert.equal(serialize(duplicated).json, before.json);
});

test("Studio Edit count session loads automatically without exposing a manual dimension retry", async () => {
	const calls = [];
	const session = createStudioEditCountSession({
		studioId: 3,
		provider: {
			async getStudioCounts(studioId, options) {
				calls.push({ kind: "all", studioId, bypassCache: options.bypassCache, signal: options.signal });
				return {
					ok: true,
					data: {
						movie: { status: "ready", count: 42 },
						series: { status: "ready", count: 17 },
					},
				};
			},
		},
	});
	assert.equal((await session.load()).movie.count, 42);
	assert.equal(typeof session.loadDimension, "undefined");
	assert.deepEqual(calls.map((entry) => [entry.kind, entry.studioId, entry.bypassCache]), [["all", 3, false]]);
	session.cancel();
	assert.equal(calls[0].signal.aborted, true);
});

test("People sort prepopulation and sort-only Save retain exact serialized values", () => {
	const controller = createController();
	importFolder(controller, [peopleSource({ sortBy: "vote_average.desc" })]);
	const opened = sessionFor(controller);
	assert.equal(opened.draft.sortBy, "vote_average.desc");
	assert.equal(opened.draft.originalSortBy, "vote_average.desc");
	assert.equal(opened.draft.sortTouched, false);
	const result = saveSourceEdit(
		controller,
		opened.session,
		updatePeopleSourceSort(opened.draft, "primary_release_date.desc", "recent"),
	);
	assert.deepEqual(result.patch, { sortBy: "primary_release_date.desc" });
	assert.equal(serialize(controller).value[0].folders[0].sources[0].sortBy, "primary_release_date.desc");
});

test("People sort plus role/media Save maps an explicitly selected semantic sort in one update", () => {
	const controller = createController();
	importFolder(controller, [peopleSource()]);
	const opened = sessionFor(controller);
	const originalUpdate = controller.updateNode;
	let calls = 0;
	let draft = updatePeopleSourceSort(opened.draft, "primary_release_date.desc", "recent");
	draft = choosePeopleSourceCombination(draft, "directing-series");
	assert.equal(draft.sortBy, "first_air_date.desc");
	const result = saveSourceEdit({
		...controller,
		updateNode(...args) {
			calls += 1;
			return originalUpdate(...args);
		},
	}, opened.session, draft);
	assert.deepEqual(result.patch, {
		title: "Directed Series",
		tmdbSourceType: "DIRECTOR",
		mediaType: "TV",
		sortBy: "first_air_date.desc",
	});
	assert.equal(calls, 1);
});

test("untouched imported People sort casing and unusual values are never normalized", () => {
	for (const importedSort of ["Popularity.Desc", "owner.custom.order", null]) {
		const controller = createController();
		importFolder(controller, [peopleSource({ title: "Imported custom", sortBy: importedSort })]);
		const opened = sessionFor(controller);
		const result = saveSourceEdit(
			controller,
			opened.session,
			choosePeopleSourceCombination(opened.draft, "directing-series"),
		);
		assert.equal(result.ok, true, String(importedSort));
		assert.equal(Object.hasOwn(result.patch, "sortBy"), false, String(importedSort));
		assert.equal(serialize(controller).value[0].folders[0].sources[0].sortBy, importedSort);
	}
});

test("unsupported touched People sorts are rejected without inventing or mutating values", () => {
	const controller = createController();
	importFolder(controller, [peopleSource({ sortBy: "owner.custom.order" })]);
	const opened = sessionFor(controller);
	const before = serialize(controller);
	const originalUpdate = controller.updateNode;
	let calls = 0;
	const result = saveSourceEdit({
		...controller,
		updateNode(...args) {
			calls += 1;
			return originalUpdate(...args);
		},
	}, opened.session, updatePeopleSourceSort(opened.draft, "invented.desc", "invented"));
	assert.equal(result.ok, false);
	assert.equal(result.validationFailed, true);
	assert.equal(result.errors[0].code, "SOURCE_EDIT_PEOPLE_SORT_UNSUPPORTED");
	assert.equal(calls, 0);
	assert.equal(serialize(controller).json, before.json);
});

test("People count sessions reuse the shared successful cache and exact Add counting semantics", async () => {
	const combinedCredits = {
		cast: [
			{ id: 10, media_type: "movie" },
			{ id: 10, media_type: "movie" },
			{ id: 11, media_type: "tv" },
		],
		crew: [
			{ id: 20, media_type: "movie", job: "Director" },
			{ id: 20, media_type: "movie", job: "director" },
			{ id: 21, media_type: "tv", job: "DIRECTOR" },
			{ id: 22, media_type: "tv", job: "Producer" },
		],
	};
	const expected = calculatePersonCreditCounts(combinedCredits);
	let fetchCalls = 0;
	const provider = createTmdbPersonProvider({
		baseUrl: "https://worker.example.test",
		fetchImpl: async () => {
			fetchCalls += 1;
			return new Response(JSON.stringify({
				id: 31,
				name: "Counted Person",
				known_for_department: "Acting",
				profile_path: null,
				combined_credits: combinedCredits,
			}), { status: 200, headers: { "content-type": "application/json" } });
		},
		now: () => 100,
	});
	const firstSession = createPeopleEditCountSession({ provider, personId: 31 });
	const firstLoad = firstSession.load();
	assert.equal(firstSession.load(), firstLoad);
	const first = await firstLoad;
	assert.equal(fetchCalls, 1);
	assert.deepEqual(first.counts, expected);
	assert.equal(first.fromCache, false);
	assert.deepEqual([
		peopleEditCountLabel(first, "actingMovies"),
		peopleEditCountLabel(first, "actingSeries"),
		peopleEditCountLabel(first, "directingMovies"),
		peopleEditCountLabel(first, "directingSeries"),
	], ["1 title", "1 title", "1 title", "1 title"]);

	const reopenedSession = createPeopleEditCountSession({ provider, personId: 31 });
	const reopened = await reopenedSession.load();
	assert.equal(fetchCalls, 1);
	assert.equal(reopened.fromCache, true);
});

test("People count failure is friendly, non-duplicating, and explicitly retryable", async () => {
	let calls = 0;
	const provider = {
		getPerson() {
			calls += 1;
			return calls === 1
				? Promise.resolve({ ok: false, error: { message: "raw provider secret" } })
				: Promise.resolve({
					ok: true,
					data: { counts: { actingMovies: 0, actingSeries: 25, directingMovies: 1, directingSeries: 0 } },
					checkedAt: 200,
				});
		},
	};
	const countSession = createPeopleEditCountSession({ provider, personId: 31 });
	const firstLoad = countSession.load();
	assert.equal(countSession.load(), firstLoad);
	const failed = await firstLoad;
	assert.equal(calls, 1);
	assert.equal(failed.status, "failed");
	assert.equal(failed.error.message.includes("raw provider secret"), false);
	assert.equal(peopleEditCountLabel(failed, "actingMovies"), "Couldn’t check titles");

	const ready = await countSession.load({ retry: true });
	assert.equal(calls, 2);
	assert.equal(peopleEditCountLabel(ready, "actingMovies"), "No titles found");
	assert.equal(peopleEditCountLabel(ready, "actingSeries"), "25 titles");
	assert.equal(peopleEditCountLabel(ready, "directingMovies"), "1 title");
	assert.equal(peopleEditCountLabel(ready, "directingSeries"), "No titles found");
	assert.equal(peopleEditCountLabel({ status: "checking", counts: null }, "actingMovies"), "Checking titles…");
});

test("identity-changing duplicate Saves are blocked without override or mutation", () => {
	const controller = createController();
	importFolder(controller, [
		collectionSource({ tmdbId: 100, title: "First" }),
		collectionSource({ tmdbId: "200", title: "Second", provider: "TMDB", tmdbSourceType: "collection", mediaType: "movie" }),
	]);
	const opened = sessionFor(controller, 0);
	const before = serialize(controller);
	const draft = chooseMovieCollection(opened.draft, { id: 200, name: "Duplicate" });
	const draftBefore = structuredClone(draft);
	let calls = 0;
	const result = saveSourceEdit(
		{
			...controller,
			updateNode() {
				calls += 1;
				throw new Error("duplicate rejection must not update");
			},
		},
		opened.session,
		draft,
	);
	assert.equal(result.ok, false);
	assert.equal(result.duplicateRejected, true);
	assert.equal(result.errorHeading, "Source already exists");
	assert.equal(result.errors[0].message, "This folder already contains that Movie Collection. Choose another franchise or cancel your changes.");
	assert.equal(result.duplicate.internalId, controller.getState().project.collections[0].folders[0].sources[1].internalId);
	assert.equal(Object.hasOwn(result, "override"), false);
	assert.equal(calls, 0);
	assert.deepEqual(draft, draftBefore);
	assert.equal(serialize(controller).json, before.json);
});

test("People duplicate copy describes identity-derived role/media rather than the conflicting title", () => {
	const controller = createController();
	importFolder(controller, [
		peopleSource(),
		peopleSource({ title: "Misleading custom title", tmdbSourceType: "DIRECTOR", mediaType: "TV" }),
	]);
	const opened = sessionFor(controller, 0);
	const before = serialize(controller);
	const draft = choosePeopleSourceCombination(opened.draft, "directing-series");
	const result = saveSourceEdit(controller, opened.session, draft);
	assert.equal(result.ok, false);
	assert.equal(result.errorHeading, "Source already exists");
	assert.equal(result.errors[0].message, "This folder already contains Directed Series for this person. Choose another source type or cancel your changes.");
	assert.equal(result.errors[0].message.includes("Misleading custom title"), false);
	assert.equal(serialize(controller).json, before.json);
});

test("title-only editing remains allowed for a pre-existing duplicate identity", () => {
	const controller = createController();
	importFolder(controller, [
		peopleSource({ title: "First" }),
		peopleSource({ title: "Second", tmdbId: "31", provider: "TMDB", tmdbSourceType: "person", mediaType: "movie" }),
	]);
	const opened = sessionFor(controller, 0);
	const result = saveSourceEdit(controller, opened.session, updateSourceEditTitle(opened.draft, "Renamed"));
	assert.equal(result.ok, true);
	assert.deepEqual(result.patch, { title: "Renamed" });
});

test("a changed project object rejects the session and leaves the current document unchanged", () => {
	const controller = createController();
	const folder = importFolder(controller, [collectionSource(), peopleSource()]);
	const opened = sessionFor(controller, 0);
	assert.equal(controller.updateNode(folder.sources[1].internalId, { title: "External change" }).ok, true);
	const beforeSave = serialize(controller);
	const result = saveSourceEdit(controller, opened.session, updateSourceEditTitle(opened.draft, "Draft"));
	assert.equal(result.ok, false);
	assert.equal(result.conflict, true);
	assert.equal(result.closeRequired, false);
	assert.equal(result.errors[0].code, "SOURCE_EDIT_PROJECT_STALE");
	assert.equal(serialize(controller).json, beforeSave.json);
});

test("source and folder deletion close safely without an edit mutation", () => {
	for (const target of ["source", "folder"]) {
		const controller = createController();
		const folder = importFolder(controller, [collectionSource()]);
		const opened = sessionFor(controller);
		assert.equal(controller.removeNode(target === "source" ? opened.source.internalId : folder.internalId).ok, true);
		const revision = controller.getState().revision;
		const beforeSave = serialize(controller);
		const result = saveSourceEdit(controller, opened.session, updateSourceEditTitle(opened.draft, "Draft"));
		assert.equal(result.ok, false, target);
		assert.equal(result.closeRequired, true, target);
		assert.equal(controller.getState().revision, revision, target);
		assert.equal(serialize(controller).json, beforeSave.json, target);
	}
});

test("a source moved to another folder is rejected without rebasing", () => {
	const controller = createController();
	importFolder(controller, [collectionSource({ tmdbId: 100 })]);
	const opened = sessionFor(controller);
	const changedProject = structuredClone(opened.session.openingProject);
	const collection = changedProject.collections[0];
	collection.folders.push({
		nodeType: "folder",
		internalId: "moved-folder",
		editable: { id: "moved-folder", title: "Moved" },
		folders: undefined,
		sources: [collection.folders[0].sources.shift()],
	});
	const fakeController = {
		getState() {
			return { project: changedProject };
		},
		updateNode() {
			throw new Error("a moved source must not update");
		},
	};
	const result = saveSourceEdit(fakeController, opened.session, updateSourceEditTitle(opened.draft, "Draft"));
	assert.equal(result.ok, false);
	assert.equal(result.conflict, true);
	assert.equal(result.closeRequired, false);
	assert.equal(result.errors[0].code, "SOURCE_EDIT_TARGET_MOVED");
});

test("source reordering and external identity change conflict without rebasing", () => {
	for (const change of ["reorder", "identity"]) {
		const controller = createController();
		const folder = importFolder(controller, [collectionSource({ tmdbId: 100 }), collectionSource({ tmdbId: 200 })]);
		const opened = sessionFor(controller, 0);
		if (change === "reorder") {
			assert.equal(controller.moveNode(opened.source.internalId, 1).ok, true);
		} else {
			assert.equal(controller.updateNode(opened.source.internalId, { tmdbId: 300 }).ok, true);
		}
		const beforeSave = serialize(controller);
		const result = saveSourceEdit(controller, opened.session, updateSourceEditTitle(opened.draft, "Draft"));
		assert.equal(result.ok, false, change);
		assert.equal(result.conflict, true, change);
		assert.equal(serialize(controller).json, beforeSave.json, change);
		assert.equal(controller.getState().project.collections[0].folders[0].internalId, folder.internalId);
	}
});

test("minimal patches preserve source order, raw IDs, unknown data, nulls, sort, filters, and folder presentation", () => {
	const controller = createController();
	const folder = importFolder(controller, [
		{ provider: "community", title: "Before", unknownOpaque: true },
		collectionSource({
			id: "raw-source-id",
			tmdbId: "100",
			sortBy: null,
			filters: { withGenres: null, unknownFilter: { keep: true } },
			unknownSource: { nested: [null, false, 0, ""] },
			addonId: null,
		}),
		peopleSource({ title: "After" }),
	]);
	const sourceBefore = folder.sources[1];
	const folderBefore = structuredClone(serialize(controller).value[0].folders[0]);
	const opened = sessionFor(controller, 1);
	const result = saveSourceEdit(controller, opened.session, updateSourceEditTitle(opened.draft, "Edited only"));
	assert.deepEqual(result.patch, { title: "Edited only" });

	const project = controller.getState().project;
	const currentFolder = project.collections[0].folders[0];
	assert.deepEqual(currentFolder.sources.map((source) => source.internalId), folder.sources.map((source) => source.internalId));
	assert.equal(currentFolder.sources[1].internalId, sourceBefore.internalId);
	assert.equal(currentFolder.sources[1].category, sourceBefore.category);
	assert.deepEqual(currentFolder.sources[1].rawImported, sourceBefore.rawImported);
	const outputFolder = serialize(controller).value[0].folders[0];
	assert.equal(outputFolder.sources[1].id, "raw-source-id");
	assert.equal(outputFolder.sources[1].sortBy, null);
	assert.deepEqual(outputFolder.sources[1].filters, folderBefore.sources[1].filters);
	assert.deepEqual(outputFolder.sources[1].unknownSource, folderBefore.sources[1].unknownSource);
	for (const field of [
		"title", "hideTitle", "tileShape", "coverEmoji", "focusGifUrl", "heroVideoUrl",
		"titleLogoUrl", "coverImageUrl", "focusGifEnabled", "heroBackdropUrl", "unknownFolder",
	]) assert.deepEqual(outputFolder[field], folderBefore[field], field);
});

test("compact and verbose edited output remain stable through a second import/serialize cycle", () => {
	for (const source of [
		collectionSource({ tmdbId: 123 }),
		collectionSource({
			type: null,
			genre: null,
			addonId: null,
			catalogId: null,
			traktListId: null,
			filters: { withGenres: null, withKeywords: null, unknown: "keep" },
			unknownSource: "verbose",
		}),
		peopleSource({ sortBy: "vote_average.desc", unknownSource: "people-sort-cycle" }),
	]) {
		const controller = createController();
		importFolder(controller, [source]);
		const opened = sessionFor(controller);
		assert.equal(saveSourceEdit(controller, opened.session, updateSourceEditTitle(opened.draft, "Cycle title")).ok, true);
		const first = serialize(controller);
		const cycled = createController();
		assert.equal(cycled.importValue(first.value).ok, true);
		const second = serialize(cycled);
		assert.deepEqual(second.value, first.value);
		assert.equal(second.json, first.json);
	}
});

test("an edited People sort remains exact through export and a second cycle", () => {
	const controller = createController();
	importFolder(controller, [peopleSource({ unknownSource: { keep: "sort-cycle" } })]);
	const opened = sessionFor(controller);
	const saved = saveSourceEdit(
		controller,
		opened.session,
		updatePeopleSourceSort(opened.draft, "primary_release_date.desc", "recent"),
	);
	assert.deepEqual(saved.patch, { sortBy: "primary_release_date.desc" });
	const first = serialize(controller);
	assert.equal(first.value[0].folders[0].sources[0].sortBy, "primary_release_date.desc");
	const cycled = createController();
	assert.equal(cycled.importValue(first.value).ok, true);
	const second = serialize(cycled);
	assert.deepEqual(second.value, first.value);
	assert.equal(second.json, first.json);
});
