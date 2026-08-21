import assert from "node:assert/strict";
import test from "node:test";

import { createBuilderController } from "../builder/src/application/index.js";
import { discoverSourceIdentity } from "../builder/src/nuvio/discover.js";
import { NUVIO_INVISIBLE_TITLE } from "../builder/src/nuvio/titles.js";
import {
	applyGenreHierarchyPlan,
	buildGenreFolderEditable,
	buildGenreSourceDrafts,
	createGenreAdvancedState,
	createGenreHierarchyPlan,
	DEFAULT_GENRE_HIERARCHY_FOLDER_TITLE_VISIBILITY,
	GENRE_CONCEPTS,
	GENRE_HIERARCHY_PLACEMENT_STATUSES,
	genreCompositePlacementChoices,
	GENRE_SOURCE_TITLE_MODES,
	genreArtworkUrl,
	validateGenreHierarchyPlan,
} from "../builder/src/source-add/index.js";

function idFactory(prefix = "node") {
	let next = 0;
	return () => `${prefix}-${++next}`;
}

function sequenceFactory(...values) {
	let index = 0;
	return () => {
		const value = values[index++];
		if (value instanceof Error) throw value;
		return value;
	};
}

function controller(options = {}) {
	return createBuilderController({
		idFactory: options.idFactory ?? idFactory(),
		nuvioIdFactory: options.nuvioIdFactory ?? idFactory("nuvio"),
		initialProjectTitle: "Genre hierarchy test",
	});
}

function createDestination(app, editable = {}) {
	const result = app.createCollection({ editable: { title: "Destination", viewMode: "ROWS", showAllTab: false, pinToTop: true, ...editable } });
	assert.equal(result.ok, true);
	return result.createdInternalId;
}

function createFolderSource(app, collectionInternalId, genreName, options = {}) {
	const folder = app.createFolder(collectionInternalId, { editable: { title: `${genreName} existing` } });
	assert.equal(folder.ok, true);
	const built = buildGenreSourceDrafts([genreName], options);
	assert.equal(built.ok, true);
	for (const draft of built.drafts) assert.equal(app.createSource(folder.createdInternalId, draft).ok, true);
	return folder.createdInternalId;
}

test("Genre hierarchy source naming is contextual while Add Source naming remains self-describing", () => {
	const hierarchy = buildGenreSourceDrafts(["Comedy", "Horror", "Action & Adventure"], { titleMode: GENRE_SOURCE_TITLE_MODES.HIERARCHY });
	assert.equal(hierarchy.ok, true);
	assert.deepEqual(hierarchy.drafts.map((draft) => draft.editable.title), ["Movies", "Series", "Movies", "Series"]);
	const addSource = buildGenreSourceDrafts(["Comedy", "Horror", "Action & Adventure"]);
	assert.equal(addSource.ok, true);
	assert.deepEqual(addSource.drafts.map((draft) => draft.editable.title), ["Comedy Movies", "Comedy Series", "Horror Movies", "Action & Adventure Series"]);
	assert.deepEqual(
		hierarchy.drafts.map((draft) => discoverSourceIdentity(draft.editable).key),
		addSource.drafts.map((draft) => discoverSourceIdentity(draft.editable).key),
	);
});

test("New Collection defaults create exact Genre folders and contextual sources with current Advanced semantics", () => {
	const app = controller();
	const state = app.getState();
	const advanced = createGenreAdvancedState({
		yearFrom: "2001",
		yearTo: "2024",
		minimumRating: "6.5",
		maximumRating: "9.2",
		minimumVotes: "250",
		originalLanguage: "en",
		originCountry: "AU",
		exclusionsByGenre: { Comedy: ["Documentary", "Horror", "Kids"] },
	});
	const result = createGenreHierarchyPlan(state.project, {
		scope: "new-collection",
		projectRevision: state.revision,
		genres: ["Comedy", "Horror", "Action & Adventure"],
		sortOptionId: "top-rated",
		advanced,
	});
	assert.equal(result.ok, true);
	assert.equal(result.plan.collections[0].editable.title, "Genres");
	assert.deepEqual(result.plan.counts, { collectionCount: 1, folderCount: 3, sourceCount: 4 });
	assert.equal(result.plan.configuration.folderTileShape, "LANDSCAPE");
	assert.equal(result.plan.configuration.folderTitleVisibility, DEFAULT_GENRE_HIERARCHY_FOLDER_TITLE_VISIBILITY);
	assert.deepEqual(result.plan.collections[0].folders.map((folder) => folder.genreName), ["Comedy", "Horror", "Action & Adventure"]);
	assert.deepEqual(result.plan.collections[0].folders.map((folder) => folder.sources.map((source) => source.draft.editable.title)), [["Movies", "Series"], ["Movies"], ["Series"]]);
	const comedy = result.plan.collections[0].folders[0];
	assert.equal(comedy.editable.tileShape, "LANDSCAPE");
	assert.equal(comedy.editable.hideTitle, true);
	assert.equal(comedy.editable.title, "Comedy");
	assert.deepEqual(comedy.sources[0].draft.editable.filters, {
		withGenres: "35",
		releaseDateGte: "2001-01-01",
		releaseDateLte: "2024-12-31",
		voteAverageGte: 6.5,
		voteAverageLte: 9.2,
		voteCountGte: 250,
		withOriginalLanguage: "en",
		withOriginCountry: "AU",
		withoutGenres: "99,27",
	});
	assert.equal(comedy.sources[0].draft.editable.tmdbId, null);
	assert.equal(comedy.sources[0].draft.editable.tmdbSourceType, "DISCOVER");
});

test("Genre hierarchy applies every canonical Folder title outcome independently from artwork shape", () => {
	const app = controller();
	const state = app.getState();
	for (const [folderTitleVisibility, title, hideTitle] of [
		["SHOW_EVERYWHERE", "Comedy", false],
		["HIDE_HOME_SCREEN", "Comedy", true],
		["HIDE_EVERYWHERE", NUVIO_INVISIBLE_TITLE, true],
	]) {
		const result = createGenreHierarchyPlan(state.project, { scope: "new-collection", projectRevision: state.revision, genres: ["Comedy"], folderTitleVisibility });
		assert.equal(result.ok, true);
		const editable = result.plan.collections[0].folders[0].editable;
		assert.equal(editable.title, title);
		assert.equal(editable.hideTitle, hideTitle);
		assert.equal(editable.tileShape, "LANDSCAPE");
		assert.match(editable.coverImageUrl, /genre\/wide\/comedy%20wide\.jpg$/);
	}
});

test("all 27 official Genre concepts have explicit published Landscape and Poster mappings", () => {
	assert.equal(GENRE_CONCEPTS.length, 27);
	for (const concept of GENRE_CONCEPTS) {
		const landscapeUrl = genreArtworkUrl(concept.name, "LANDSCAPE");
		const posterUrl = genreArtworkUrl(concept.name, "POSTER");
		assert.match(landscapeUrl, /\/genre\/wide\/.+\.jpg$/i, `${concept.name} Landscape`);
		assert.match(posterUrl, /\/genre\/vertical\/.+\.jpg$/i, `${concept.name} Poster`);
		assert.equal(buildGenreFolderEditable(concept.name).tileShape, "LANDSCAPE", `${concept.name} Add Source default`);
	}
	assert.match(genreArtworkUrl("Action & Adventure", "POSTER"), /\/action_and_adventure\.jpg$/);
	assert.match(genreArtworkUrl("Sci-Fi & Fantasy", "POSTER"), /\/sci-fi_and_fantasy\.jpg$/);
	assert.match(genreArtworkUrl("Science Fiction", "POSTER"), /\/Sci-Fi\.jpg$/);
	assert.equal(genreArtworkUrl("Musicals", "POSTER"), null, "asset-only concepts do not expand the official catalogue");
});

test("Poster is one batch-safe hierarchy choice while Add Source remains Landscape", () => {
	const app = controller();
	const state = app.getState();
	const result = createGenreHierarchyPlan(state.project, {
		scope: "new-collection",
		projectRevision: state.revision,
		genres: ["Action & Adventure", "Science Fiction"],
		folderTileShape: "POSTER",
	});
	assert.equal(result.ok, true);
	assert.equal(result.plan.configuration.folderTileShape, "POSTER");
	for (const folder of result.plan.collections[0].folders) {
		assert.equal(folder.editable.tileShape, "POSTER");
		assert.match(folder.editable.coverImageUrl, /\/genre\/vertical\/.+\.jpg$/i);
	}
	assert.equal(buildGenreFolderEditable("Science Fiction").tileShape, "LANDSCAPE");
	assert.match(buildGenreFolderEditable("Science Fiction").coverImageUrl, /\/genre\/wide\/science%20fiction%20wide\.jpg$/);
	assert.equal(createGenreHierarchyPlan(state.project, { scope: "new-collection", projectRevision: state.revision, genres: ["Horror"], folderTileShape: "SQUARE" }).ok, false);
});

test("Rows preserves the compatibility All-tab value while Tabs retains its explicit choice", () => {
	const app = controller();
	const state = app.getState();
	for (const [viewMode, requested, expected] of [["ROWS", false, true], ["TABBED_GRID", false, false], ["TABBED_GRID", true, true]]) {
		const result = createGenreHierarchyPlan(state.project, { scope: "new-collection", projectRevision: state.revision, genres: ["Horror"], viewMode, showAllTab: requested });
		assert.equal(result.ok, true);
		assert.equal(result.plan.configuration.showAllTab, expected);
		assert.equal(result.plan.collections[0].editable.showAllTab, expected);
	}
});

test("New Folder distinguishes complete, partial, elsewhere and configured variants without title identity", () => {
	const app = controller();
	const destinationId = createDestination(app);
	createFolderSource(app, destinationId, "Horror");
	createFolderSource(app, destinationId, "Comedy", { sharedMediaChoice: "movies" });
	const elsewhereId = app.createCollection({ editable: { title: "Elsewhere" } }).createdInternalId;
	createFolderSource(app, elsewhereId, "Action & Adventure");
	const state = app.getState();
	const result = createGenreHierarchyPlan(state.project, {
		scope: "new-folder",
		projectRevision: state.revision,
		destinationCollectionInternalId: destinationId,
		genres: ["Horror", "Drama", "Comedy", "Action & Adventure", "Western"],
	});
	assert.equal(result.ok, true);
	assert.deepEqual(result.plan.outcomes.map((outcome) => outcome.status), [
		GENRE_HIERARCHY_PLACEMENT_STATUSES.ALREADY_IN_COLLECTION,
		GENRE_HIERARCHY_PLACEMENT_STATUSES.READY,
		GENRE_HIERARCHY_PLACEMENT_STATUSES.PARTLY_IN_COLLECTION,
		GENRE_HIERARCHY_PLACEMENT_STATUSES.EXISTS_ELSEWHERE,
		GENRE_HIERARCHY_PLACEMENT_STATUSES.READY,
	]);
	assert.deepEqual(result.plan.folders.map((folder) => folder.genreName), ["Drama", "Action & Adventure", "Western"]);
	assert.deepEqual(result.plan.destination, { collectionInternalId: destinationId, collectionTitle: "Destination", viewMode: "ROWS", showAllTab: false, pinToTop: true, titleHidden: false });

	for (const variant of [
		{ sortOptionId: "recent" },
		{ advanced: createGenreAdvancedState({ yearFrom: "2002" }) },
		{ advanced: createGenreAdvancedState({ exclusionsByGenre: { Horror: ["Comedy"] } }) },
	]) {
		const variantPlan = createGenreHierarchyPlan(state.project, { scope: "new-folder", projectRevision: state.revision, destinationCollectionInternalId: destinationId, genres: ["Horror"], ...variant });
		assert.equal(variantPlan.ok, true);
		assert.equal(variantPlan.plan.outcomes[0].status, GENRE_HIERARCHY_PLACEMENT_STATUSES.READY);
		assert.equal(variantPlan.plan.folders.length, 1);
	}
});

test("New Collection treats existing exact sources as informational and addable", () => {
	const app = controller();
	const existing = createDestination(app);
	createFolderSource(app, existing, "Comedy");
	const state = app.getState();
	const result = createGenreHierarchyPlan(state.project, { scope: "new-collection", projectRevision: state.revision, genres: ["Comedy"] });
	assert.equal(result.ok, true);
	assert.equal(result.plan.outcomes[0].status, GENRE_HIERARCHY_PLACEMENT_STATUSES.EXISTS_ELSEWHERE);
	assert.equal(result.plan.collections[0].folders.length, 1);
});

test("Select all plans and applies exactly 27 folders and 35 contextual sources in one revision", () => {
	const app = controller();
	const before = app.getState();
	const genres = GENRE_CONCEPTS.map((concept) => concept.name);
	const result = createGenreHierarchyPlan(before.project, { scope: "new-collection", projectRevision: before.revision, genres });
	assert.equal(result.ok, true);
	assert.deepEqual(result.plan.counts, { collectionCount: 1, folderCount: 27, sourceCount: 35 });
	const applied = applyGenreHierarchyPlan(app, result.plan);
	assert.equal(applied.ok, true);
	assert.equal(app.getState().revision, before.revision + 1);
	assert.equal(app.getState().project.collections[0].folders.length, 27);
	assert.equal(app.getState().project.collections[0].folders.flatMap((folder) => folder.sources).length, 35);
	assert.equal(JSON.stringify(app.getState().project).includes("genre-hierarchy-plan"), false);
	assert.equal(JSON.stringify(app.getState().project).includes("Untitled Folder"), false);
});

test("all four structures derive the full 27/35 catalogue totals and structure-specific naming", () => {
	const app = controller();
	const state = app.getState();
	const genres = GENRE_CONCEPTS.map((concept) => concept.name);
	const plans = Object.fromEntries(["genre-folders", "media-folders", "separate-media-genre-folders", "separate-media-collections"].map((structure) => {
		const result = createGenreHierarchyPlan(state.project, { scope: "new-collection", projectRevision: state.revision, genres, structure });
		assert.equal(result.ok, true, structure);
		return [structure, result.plan];
	}));
	assert.deepEqual(plans["genre-folders"].counts, { collectionCount: 1, folderCount: 27, sourceCount: 35 });
	assert.deepEqual(plans["media-folders"].counts, { collectionCount: 1, folderCount: 2, sourceCount: 35 });
	assert.deepEqual(plans["separate-media-genre-folders"].counts, { collectionCount: 1, folderCount: 35, sourceCount: 35 });
	assert.deepEqual(plans["separate-media-collections"].counts, { collectionCount: 2, folderCount: 35, sourceCount: 35 });

	const mediaFolders = plans["media-folders"].collections[0].folders;
	assert.deepEqual(mediaFolders.map((folder) => folder.editable.title), ["Movies", "Series"]);
	assert.equal(mediaFolders.every((folder) => folder.editable.coverImageUrl === "" && folder.editable.hideTitle === false), true);
	assert.deepEqual(mediaFolders[0].sources.slice(0, 3).map((entry) => entry.draft.editable.title), ["Action", "Adventure", "Animation"]);
	assert.deepEqual(mediaFolders[1].sources.slice(0, 3).map((entry) => entry.draft.editable.title), ["Action & Adventure", "Animation", "Comedy"]);

	const separateFolders = plans["separate-media-genre-folders"].collections[0].folders;
	assert.deepEqual(separateFolders.filter((folder) => folder.genreName === "Animation").map((folder) => folder.editable.title), ["Animation Movies", "Animation Series"]);
	assert.deepEqual(separateFolders.filter((folder) => folder.genreName === "Animation").map((folder) => folder.sources[0].draft.editable.title), ["Movies", "Series"]);
	assert.equal(plans["separate-media-genre-folders"].configuration.folderTitleVisibility, "SHOW_EVERYWHERE");

	const separateCollections = plans["separate-media-collections"].collections;
	assert.deepEqual(separateCollections.map((collection) => [collection.role, collection.editable.title]), [["movies", "Movie Genres"], ["series", "Series Genres"]]);
	assert.deepEqual(separateCollections.map((collection) => collection.folders.length), [19, 16]);
	assert.equal(separateCollections[0].folders.every((folder) => folder.sources[0].draft.editable.title === "Movies"), true);
	assert.equal(separateCollections[1].folders.every((folder) => folder.sources[0].draft.editable.title === "Series"), true);
});

test("single-media structures omit empty media folders and separate collections is unavailable", () => {
	const app = controller();
	const state = app.getState();
	for (const [genres, expectedFolder] of [["Horror", "Movies"], ["Action & Adventure", "Series"]]) {
		const result = createGenreHierarchyPlan(state.project, { scope: "new-collection", projectRevision: state.revision, genres: [genres], structure: "media-folders" });
		assert.equal(result.ok, true);
		assert.deepEqual(result.plan.collections[0].folders.map((folder) => folder.editable.title), [expectedFolder]);
		assert.equal(createGenreHierarchyPlan(state.project, { scope: "new-collection", projectRevision: state.revision, genres: [genres], structure: "separate-media-collections" }).ok, false);
	}
});

test("composite placement is conditional, self-describing, deterministic, and preserves Add to both nodes", () => {
	const app = controller();
	const state = app.getState();
	const genres = ["Action", "Adventure", "Action & Adventure"];
	const built = buildGenreSourceDrafts(genres, { titleMode: GENRE_SOURCE_TITLE_MODES.HIERARCHY });
	const choices = genreCompositePlacementChoices(state.project, { scope: "new-collection", genres, drafts: built.drafts, sharedMediaChoice: "both" });
	assert.deepEqual(choices[0].choices.map((choice) => choice.id), ["standalone", "Action", "Adventure", "both"]);

	const one = createGenreHierarchyPlan(state.project, { scope: "new-collection", projectRevision: state.revision, genres, compositePlacements: { "Action & Adventure": "Action" } });
	assert.deepEqual(one.plan.collections[0].folders.map((folder) => folder.genreName), ["Action", "Adventure"]);
	assert.deepEqual(one.plan.collections[0].folders[0].sources.map((entry) => entry.draft.editable.title), ["Movies", "Action & Adventure Series"]);

	const both = createGenreHierarchyPlan(state.project, { scope: "new-collection", projectRevision: state.revision, genres, compositePlacements: { "Action & Adventure": "both" } });
	assert.deepEqual(both.plan.counts, { collectionCount: 1, folderCount: 2, sourceCount: 4 });
	const repeated = both.plan.collections[0].folders.map((folder) => folder.sources[1].draft);
	assert.deepEqual(repeated.map((draft) => draft.editable.title), ["Action & Adventure Series", "Action & Adventure Series"]);
	assert.equal(discoverSourceIdentity(repeated[0].editable).key, discoverSourceIdentity(repeated[1].editable).key);
	assert.equal(applyGenreHierarchyPlan(app, both.plan).ok, true);
	const nodes = app.getState().project.collections[0].folders.map((folder) => folder.sources[1]);
	assert.notEqual(nodes[0].internalId, nodes[1].internalId);
	assert.equal(discoverSourceIdentity(nodes[0].editable).key, discoverSourceIdentity(nodes[1].editable).key);
});

test("multiple composite rules can be placed together without changing unrelated order", () => {
	const app = controller();
	const state = app.getState();
	const genres = ["Action", "Action & Adventure", "Science Fiction", "Fantasy", "Sci-Fi & Fantasy", "War", "War & Politics", "Comedy"];
	const result = createGenreHierarchyPlan(state.project, {
		scope: "new-collection",
		projectRevision: state.revision,
		genres,
		compositePlacements: { "Action & Adventure": "Action", "Sci-Fi & Fantasy": "both", "War & Politics": "War" },
	});
	assert.equal(result.ok, true);
	assert.deepEqual(result.plan.collections[0].folders.map((folder) => folder.genreName), ["Action", "Science Fiction", "Fantasy", "War", "Comedy"]);
	assert.deepEqual(result.plan.collections[0].folders.map((folder) => folder.sources.map((entry) => entry.draft.editable.title)), [
		["Movies", "Action & Adventure Series"],
		["Movies", "Sci-Fi & Fantasy Series"],
		["Movies", "Sci-Fi & Fantasy Series"],
		["Movies", "War & Politics Series"],
		["Movies", "Series"],
	]);
});

test("New Folder uses exact source-level omissions for aggregate and separate-media structures", () => {
	const app = controller();
	const destinationId = createDestination(app);
	createFolderSource(app, destinationId, "Comedy", { sharedMediaChoice: "movies" });
	const state = app.getState();
	const media = createGenreHierarchyPlan(state.project, { scope: "new-folder", projectRevision: state.revision, destinationCollectionInternalId: destinationId, genres: ["Comedy", "Horror"], structure: "media-folders" });
	assert.equal(media.ok, true);
	assert.deepEqual(media.plan.counts, { collectionCount: 0, folderCount: 2, sourceCount: 2 });
	assert.deepEqual(media.plan.folders.map((folder) => [folder.editable.title, folder.sources.map((entry) => entry.draft.editable.title)]), [["Movies", ["Horror"]], ["Series", ["Comedy"]]]);
	assert.equal(media.plan.outcomes.filter((outcome) => outcome.status === GENRE_HIERARCHY_PLACEMENT_STATUSES.ALREADY_IN_COLLECTION).length, 1);

	const separate = createGenreHierarchyPlan(state.project, { scope: "new-folder", projectRevision: state.revision, destinationCollectionInternalId: destinationId, genres: ["Comedy", "Horror"], structure: "separate-media-genre-folders" });
	assert.deepEqual(separate.plan.folders.map((folder) => folder.editable.title), ["Comedy Series", "Horror Movies"]);
});

test("New Folder blocks a composite target omitted by destination evidence and keeps standalone safe", () => {
	const app = controller();
	const destinationId = createDestination(app);
	createFolderSource(app, destinationId, "Action");
	const state = app.getState();
	const genres = ["Action", "Action & Adventure"];
	const built = buildGenreSourceDrafts(genres, { titleMode: GENRE_SOURCE_TITLE_MODES.HIERARCHY });
	const choices = genreCompositePlacementChoices(state.project, { scope: "new-folder", destinationCollectionInternalId: destinationId, genres, drafts: built.drafts, sharedMediaChoice: "both" });
	assert.deepEqual(choices[0].choices.map((choice) => choice.id), ["standalone"]);
	assert.deepEqual(choices[0].blockedTargets, ["Action"]);
	assert.equal(createGenreHierarchyPlan(state.project, { scope: "new-folder", projectRevision: state.revision, destinationCollectionInternalId: destinationId, genres, compositePlacements: { "Action & Adventure": "Action" } }).ok, false);
	const standalone = createGenreHierarchyPlan(state.project, { scope: "new-folder", projectRevision: state.revision, destinationCollectionInternalId: destinationId, genres });
	assert.equal(standalone.ok, true);
	assert.deepEqual(standalone.plan.folders.map((folder) => folder.genreName), ["Action & Adventure"]);
});

test("separate Movie and Series collections apply atomically and a late second-collection collision rolls back", () => {
	const app = controller();
	const before = app.getState();
	const result = createGenreHierarchyPlan(before.project, { scope: "new-collection", projectRevision: before.revision, genres: ["Comedy"], structure: "separate-media-collections", collectionTitles: { movies: "My Movies", series: "My Series" } });
	assert.equal(result.ok, true);
	assert.equal(applyGenreHierarchyPlan(app, result.plan).ok, true);
	assert.equal(app.getState().revision, before.revision + 1);
	assert.deepEqual(app.getState().project.collections.map((collection) => collection.editable.title), ["My Movies", "My Series"]);

	const failing = controller({ idFactory: sequenceFactory("project", "collection-one", "folder-one", "source-one", "collection-one") });
	const failingBefore = failing.getState();
	const failingPlan = createGenreHierarchyPlan(failingBefore.project, { scope: "new-collection", projectRevision: failingBefore.revision, genres: ["Comedy"], structure: "separate-media-collections" });
	assert.equal(failingPlan.ok, true);
	assert.equal(applyGenreHierarchyPlan(failing, failingPlan.plan).ok, false);
	assert.equal(failing.getState().project, failingBefore.project);
	assert.equal(failing.getState().revision, failingBefore.revision);
});

test("New Folder apply preserves parent presentation byte-for-byte apart from appended folders", () => {
	const app = controller();
	const destinationId = createDestination(app, { focusGlowEnabled: false });
	const placeholder = app.createFolder(destinationId, {
		editable: { id: "placeholder", title: "Untitled Folder", tileShape: "POSTER", hideTitle: true },
	});
	assert.equal(placeholder.ok, true);
	const before = app.getState();
	const parentBefore = before.project.collections.find((collection) => collection.internalId === destinationId);
	const result = createGenreHierarchyPlan(before.project, { scope: "new-folder", projectRevision: before.revision, destinationCollectionInternalId: destinationId, genres: ["Comedy", "Horror"] });
	assert.equal(result.ok, true);
	assert.equal(applyGenreHierarchyPlan(app, result.plan).ok, true);
	const parentAfter = app.getState().project.collections.find((collection) => collection.internalId === destinationId);
	assert.deepEqual(parentAfter.editable, parentBefore.editable);
	assert.deepEqual(parentAfter.folders.slice(0, parentBefore.folders.length), parentBefore.folders);
	assert.equal(parentAfter.folders.length, parentBefore.folders.length + 2);
	assert.equal(parentAfter.folders[0].internalId, placeholder.createdInternalId);
	assert.equal(parentAfter.folders[0].editable.title, "Untitled Folder");
});

test("generated ID collision rolls the complete Genre hierarchy operation back", () => {
	const app = controller({
		idFactory: sequenceFactory("project", "project"),
		nuvioIdFactory: idFactory("nuvio"),
	});
	const before = app.getState();
	const planned = createGenreHierarchyPlan(before.project, {
		scope: "new-collection",
		projectRevision: before.revision,
		genres: ["Comedy"],
	});
	assert.equal(planned.ok, true);
	const result = applyGenreHierarchyPlan(app, planned.plan);
	assert.equal(result.ok, false);
	assert.equal(result.errors[0].code, "INTERNAL_ID_COLLISION");
	assert.equal(app.getState().project, before.project);
	assert.equal(app.getState().revision, before.revision);
});

test("stale placement and late bundle failure leave project content and revision unchanged", () => {
	const staleApp = controller();
	const destinationId = createDestination(staleApp);
	let state = staleApp.getState();
	const planned = createGenreHierarchyPlan(state.project, { scope: "new-folder", projectRevision: state.revision, destinationCollectionInternalId: destinationId, genres: ["Horror"] });
	assert.equal(planned.ok, true);
	createFolderSource(staleApp, destinationId, "Horror");
	state = staleApp.getState();
	assert.equal(validateGenreHierarchyPlan(planned.plan, { project: state.project, projectRevision: state.revision }).stale, true);
	const staleProject = state.project;
	assert.equal(applyGenreHierarchyPlan(staleApp, planned.plan).ok, false);
	assert.equal(staleApp.getState().project, staleProject);

	let calls = 0;
	const failingApp = controller({ idFactory: () => {
		calls += 1;
		if (calls === 6) throw new Error("representative late Genre hierarchy failure");
		return `failing-${calls}`;
	} });
	const before = failingApp.getState();
	const failingPlan = createGenreHierarchyPlan(before.project, { scope: "new-collection", projectRevision: before.revision, genres: ["Comedy", "Horror"] });
	assert.equal(failingPlan.ok, true);
	const failed = applyGenreHierarchyPlan(failingApp, failingPlan.plan);
	assert.equal(failed.ok, false);
	assert.equal(failingApp.getState().project, before.project);
	assert.equal(failingApp.getState().revision, before.revision);
});
