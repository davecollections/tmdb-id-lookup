import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createBuilderController } from "../builder/src/application/index.js";
import {
	buildGenreSourceDrafts,
	buildGenreFolderEditable,
	createGenreAdvancedState,
	createGenreSourceBundle,
	DEFAULT_GENRE_DESTINATION_MODE,
	EXACT_SHARED_GENRE_NAMES,
	GENRE_CATALOGUE_SIZE,
	GENRE_CONCEPTS,
	GENRE_DESTINATION_MODES,
	GENRE_PHYSICAL_SOURCE_LIMIT,
	GENRE_SORT_OPTIONS,
	genreWideArtworkUrl,
	genreDuplicateOverrideIdentity,
	genreExclusionsFor,
	inspectGenreFolderPlan,
	inspectGenreSourceDuplicates,
	isPristineGeneratedUntitledFolder,
	OFFICIAL_GENRE_REFERENCES,
	officialGenreReference,
	readGenreAdvancedFilters,
	validateGenreAdvancedOptions,
	validateGenreSourceDrafts,
} from "../builder/src/source-add/index.js";
import {
	createSourceEditSession,
	genreDefaultSourceName,
	genreEditSortValue,
	GENRE_SOURCE_EDITOR_ID,
	inspectEditableGenreSource,
	saveSourceEdit,
	sourceEditorFor,
	updateGenreSourceAdvanced,
	updateGenreSourceSort,
	updateSourceEditTitle,
} from "../builder/src/source-edit/index.js";
import { importNuvioCollections } from "../builder/src/import/index.js";
import { discoverSourceIdentity } from "../builder/src/nuvio/discover.js";
import { serializeNuvioProject } from "../builder/src/serialize/index.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function countingIdFactory(prefix = "builder") {
	let count = 0;
	return () => `${prefix}-${++count}`;
}

function selectedFolderController({ sources = [], secondFolderSources = [], otherCollectionSources = [], idFactory = countingIdFactory() } = {}) {
	const controller = createBuilderController({
		idFactory,
		nuvioIdFactory: countingIdFactory("nuvio"),
		initialProjectTitle: "Genre tests",
	});
	const imported = controller.importValue([
		{
			id: "destination",
			title: "Destination",
			folders: [
				{ id: "folder", title: "Genres", sources, catalogSources: [] },
				{ id: "second", title: "Other folder", sources: secondFolderSources, catalogSources: [] },
			],
		},
		{
			id: "elsewhere",
			title: "Elsewhere",
			folders: [{ id: "elsewhere-folder", title: "Elsewhere Genres", sources: otherCollectionSources, catalogSources: [] }],
		},
	]);
	assert.equal(imported.ok, true);
	const collection = controller.getState().project.collections[0];
	const folder = collection.folders[0];
	controller.selectNode(folder.internalId);
	return { controller, collection, folder, secondFolder: collection.folders[1] };
}

function officialCsvRows() {
	const text = fs.readFileSync(path.join(rootDir, "data", "genres.csv"), "utf8").trim();
	return text.split(/\r?\n/).slice(1).map((line) => {
		const columns = line.match(/(?:^|,)("(?:[^"]|"")*"|[^,]*)/g).map((value) => value.replace(/^,/, "").replace(/^"|"$/g, "").replace(/""/g, '"'));
		return { name: columns[0], tmdbId: Number(columns[1]), type: columns[2], mediaType: columns[3] === "Movie" ? "MOVIE" : "TV" };
	}).filter((entry) => entry.type === "Official TMDB Genre");
}

function fullAdvanced(overrides = {}) {
	return createGenreAdvancedState({
		yearFrom: "2001",
		yearTo: "2024",
		minimumRating: "6.5",
		maximumRating: "9.2",
		minimumVotes: "250",
		originalLanguage: "en",
		originCountry: "AU",
		exclusionsByGenre: { Comedy: ["Documentary", "Horror", "Kids"] },
		...overrides,
	});
}

function generatedUntitledController(editablePatch = {}) {
	const controller = createBuilderController({ idFactory: countingIdFactory(), nuvioIdFactory: countingIdFactory("nuvio"), initialProjectTitle: "Genre placeholders" });
	const collectionResult = controller.createCollection({ editable: { title: "Collection" } });
	const folderResult = controller.createFolder(collectionResult.createdInternalId, { editable: { title: "Untitled Folder", tileShape: "POSTER", hideTitle: true, ...editablePatch } });
	controller.selectNode(folderResult.createdInternalId);
	const collection = controller.getState().project.collections[0];
	const folder = collection.folders[0];
	return { controller, collection, folder };
}

test("Genre catalogue has deterministic 35 → 27 → 8 parity with data/genres.csv", () => {
	const rows = officialCsvRows();
	assert.equal(rows.length, 35);
	assert.equal(OFFICIAL_GENRE_REFERENCES.length, 35);
	assert.equal(GENRE_CONCEPTS.length, 27);
	assert.equal(EXACT_SHARED_GENRE_NAMES.length, 8);
	assert.deepEqual(EXACT_SHARED_GENRE_NAMES, ["Animation", "Comedy", "Crime", "Documentary", "Drama", "Family", "Mystery", "Western"]);
	assert.deepEqual(
		OFFICIAL_GENRE_REFERENCES.map(({ name, tmdbId, mediaType }) => ({ name, tmdbId, mediaType })),
		rows.map(({ name, tmdbId, mediaType }) => ({ name, tmdbId, mediaType })),
	);
	assert.equal(GENRE_CONCEPTS.some((entry) => entry.name === "Musicals"), false);
});

test("only exact shared names pair and V1 semantic composites remain Series-only", () => {
	for (const [name, id] of [["Action & Adventure", 10759], ["Sci-Fi & Fantasy", 10765], ["War & Politics", 10768]]) {
		const concept = GENRE_CONCEPTS.find((entry) => entry.name === name);
		assert.deepEqual(concept, { name, movieId: null, tvId: id, shared: false });
		assert.equal(officialGenreReference("MOVIE", id), null);
		assert.equal(buildGenreSourceDrafts([name]).drafts[0].editable.mediaType, "TV");
	}
});

test("multi-select construction preserves Genre order and Movie → TV order", () => {
	const built = buildGenreSourceDrafts(["Horror", "Comedy", "Action & Adventure"]);
	assert.equal(built.ok, true);
	assert.deepEqual(built.drafts.map((draft) => draft.editable.title), [
		"Horror Movies",
		"Comedy Movies",
		"Comedy Series",
		"Action & Adventure Series",
	]);
	assert.deepEqual(built.drafts.map((draft) => draft.editable.filters), [
		{ withGenres: "27" },
		{ withGenres: "35" },
		{ withGenres: "35" },
		{ withGenres: "10759" },
	]);
	assert.deepEqual(buildGenreSourceDrafts(["Comedy"], { sharedMediaChoice: "movies" }).drafts.map((draft) => draft.editable.mediaType), ["MOVIE"]);
	assert.deepEqual(buildGenreSourceDrafts(["Comedy"], { sharedMediaChoice: "series" }).drafts.map((draft) => draft.editable.mediaType), ["TV"]);
});

test("all 27 Genre concepts can safely expand to the deterministic maximum of 35 sources", () => {
	assert.equal(GENRE_CATALOGUE_SIZE, 27);
	assert.equal(GENRE_PHYSICAL_SOURCE_LIMIT, 35);
	const built = buildGenreSourceDrafts(GENRE_CONCEPTS);
	assert.equal(built.ok, true);
	assert.equal(built.drafts.length, GENRE_PHYSICAL_SOURCE_LIMIT);
	assert.equal(buildGenreSourceDrafts(GENRE_CONCEPTS.slice().reverse()).ok, true);
});

test("Genre folder artwork reuses the published V1 wide mapping with a deterministic fallback", () => {
	assert.equal(
		genreWideArtworkUrl("Action & Adventure"),
		"https://raw.githubusercontent.com/davecollections/nuvio-assets/main/assets/collection_covers/genre/wide/action_and_adventure%20wide.jpg",
	);
	assert.deepEqual(buildGenreFolderEditable("Comedy"), {
		title: "Comedy",
		tileShape: "LANDSCAPE",
		coverImageUrl: "https://raw.githubusercontent.com/davecollections/nuvio-assets/main/assets/collection_covers/genre/wide/comedy%20wide.jpg",
		hideTitle: true,
		coverEmoji: "",
	});
	assert.deepEqual(buildGenreFolderEditable("Future Genre"), {
		title: "Future Genre",
		tileShape: "LANDSCAPE",
		coverImageUrl: "",
		hideTitle: false,
		coverEmoji: "🎬",
	});
	assert.equal(GENRE_CONCEPTS.every((entry) => genreWideArtworkUrl(entry.name) !== null), true);
});

test("all four semantic sorts map through DISCOVER Core for Movie and TV", () => {
	const expected = {
		popular: ["popularity.desc", "popularity.desc"],
		recent: ["primary_release_date.desc", "first_air_date.desc"],
		"top-rated": ["vote_average.desc", "vote_average.desc"],
		"most-votes": ["vote_count.desc", "vote_count.desc"],
	};
	assert.deepEqual(GENRE_SORT_OPTIONS.map((entry) => entry.label), ["Popular", "Recent", "Top Rated", "Most Votes"]);
	for (const option of GENRE_SORT_OPTIONS) {
		assert.deepEqual(buildGenreSourceDrafts(["Comedy"], { sortOptionId: option.id }).drafts.map((draft) => draft.editable.sortBy), expected[option.id]);
	}
});

test("approved advanced filters compile through Core with media-aware ordered exclusions", () => {
	const advanced = fullAdvanced({ exclusionsByGenre: {
		Comedy: ["Documentary", "Horror", "Kids"],
		"Action & Adventure": ["Comedy", "Kids"],
	} });
	const built = buildGenreSourceDrafts(["Comedy", "Action & Adventure"], { advanced });
	assert.equal(built.ok, true);
	assert.deepEqual(built.drafts.map((draft) => draft.editable.filters), [
		{ withGenres: "35", releaseDateGte: "2001-01-01", releaseDateLte: "2024-12-31", voteAverageGte: 6.5, voteAverageLte: 9.2, voteCountGte: 250, withOriginalLanguage: "en", withOriginCountry: "AU", withoutGenres: "99,27" },
		{ withGenres: "35", releaseDateGte: "2001-01-01", releaseDateLte: "2024-12-31", voteAverageGte: 6.5, voteAverageLte: 9.2, voteCountGte: 250, withOriginalLanguage: "en", withOriginCountry: "AU", withoutGenres: "99,10762" },
		{ withGenres: "10759", releaseDateGte: "2001-01-01", releaseDateLte: "2024-12-31", voteAverageGte: 6.5, voteAverageLte: 9.2, voteCountGte: 250, withOriginalLanguage: "en", withOriginCountry: "AU", withoutGenres: "35,10762" },
	]);
	assert.deepEqual(genreExclusionsFor(advanced, "Comedy"), ["Documentary", "Horror", "Kids"]);
});

test("changing one included Genre's exclusions changes only that Genre's candidate identities", () => {
	const baseline = buildGenreSourceDrafts(["Comedy", "Horror"]).drafts;
	const changed = buildGenreSourceDrafts(["Comedy", "Horror"], {
		advanced: createGenreAdvancedState({ exclusionsByGenre: { Horror: ["Comedy"] } }),
	}).drafts;
	const identities = (drafts) => drafts.map((draft) => discoverSourceIdentity(draft.editable).key);
	const before = identities(baseline);
	const after = identities(changed);
	assert.equal(before[0], after[0]);
	assert.equal(before[1], after[1]);
	assert.notEqual(before[2], after[2]);
	assert.deepEqual(changed[2].editable.filters, { withGenres: "27", withoutGenres: "35" });
});

test("dual-media concept exclusions compile independently and omit media-inapplicable IDs", () => {
	const advanced = createGenreAdvancedState({ exclusionsByGenre: { Animation: ["Kids", "Comedy"] } });
	const drafts = buildGenreSourceDrafts(["Animation"], { advanced }).drafts;
	assert.deepEqual(drafts.map((draft) => draft.editable.filters), [
		{ withGenres: "16", withoutGenres: "35" },
		{ withGenres: "16", withoutGenres: "10762,35" },
	]);
});

test("advanced bounds compile independently and blank options remain omitted", () => {
	const filtersFor = (advanced) => buildGenreSourceDrafts(["Comedy"], { sharedMediaChoice: "movies", advanced }).drafts[0].editable.filters;
	assert.deepEqual(filtersFor({ yearFrom: "2001" }), { withGenres: "35", releaseDateGte: "2001-01-01" });
	assert.deepEqual(filtersFor({ yearTo: "2024" }), { withGenres: "35", releaseDateLte: "2024-12-31" });
	assert.deepEqual(filtersFor({ minimumRating: "6.5" }), { withGenres: "35", voteAverageGte: 6.5 });
	assert.deepEqual(filtersFor({ maximumRating: "9.2" }), { withGenres: "35", voteAverageLte: 9.2 });
	assert.deepEqual(filtersFor({ minimumVotes: "0" }), { withGenres: "35", voteCountGte: 0 });
	assert.deepEqual(filtersFor({}), { withGenres: "35" });
});

test("advanced validation rejects only the configured source's self-exclusion plus invalid global values", () => {
	assert.equal(validateGenreAdvancedOptions(fullAdvanced({ exclusionsByGenre: { Comedy: ["Comedy"] } }), { includedGenres: ["Comedy"] }).ok, false);
	assert.equal(validateGenreAdvancedOptions(fullAdvanced({ exclusionsByGenre: { Comedy: ["Horror"], Horror: ["Comedy"] } }), { includedGenres: ["Comedy", "Horror"] }).ok, true);
	assert.equal(validateGenreAdvancedOptions(fullAdvanced({ yearFrom: "2025", yearTo: "2024" }), { includedGenres: ["Comedy"] }).ok, false);
	assert.equal(validateGenreAdvancedOptions(fullAdvanced({ minimumRating: "11" }), { includedGenres: ["Comedy"] }).ok, false);
	assert.equal(validateGenreAdvancedOptions(fullAdvanced({ minimumVotes: "-1" }), { includedGenres: ["Comedy"] }).ok, false);
	assert.equal(validateGenreAdvancedOptions(fullAdvanced({ exclusionsByGenre: { Comedy: ["Not a Genre"] } }), { includedGenres: ["Comedy"] }).ok, false);
});

test("advanced filter recognition is lossless and fails closed on unsupported shapes", () => {
	const filters = buildGenreSourceDrafts(["Comedy"], { sharedMediaChoice: "movies", advanced: fullAdvanced() }).drafts[0].editable.filters;
	assert.deepEqual(
		readGenreAdvancedFilters(filters, { mediaType: "MOVIE", includedGenre: "Comedy" }),
		fullAdvanced({ exclusionsByGenre: { Comedy: ["Documentary", "Horror"] } }),
	);
	assert.equal(readGenreAdvancedFilters({ ...filters, releaseDateGte: "2001-02-01" }, { mediaType: "MOVIE", includedGenre: "Comedy" }), null);
	assert.equal(readGenreAdvancedFilters({ ...filters, withoutGenres: "99|27" }, { mediaType: "MOVIE", includedGenre: "Comedy" }), null);
	assert.equal(readGenreAdvancedFilters({ ...filters, withKeywords: "42" }, { mediaType: "MOVIE", includedGenre: "Comedy" }), null);
});

test("Genre draft validation rejects reorder, compound identity and unreviewed filter changes", () => {
	const options = { genres: ["Comedy", "Action & Adventure"], advanced: fullAdvanced() };
	const drafts = buildGenreSourceDrafts(options.genres, options).drafts;
	assert.equal(validateGenreSourceDrafts(drafts, options).ok, true);
	assert.equal(validateGenreSourceDrafts([...drafts].reverse(), options).ok, false);
	const compound = structuredClone(drafts);
	compound[0].editable.filters.withGenres = "35,28";
	assert.equal(validateGenreSourceDrafts(compound, options).ok, false);
	const changed = structuredClone(drafts);
	changed[0].editable.filters.voteAverageGte = 7;
	assert.equal(validateGenreSourceDrafts(changed, options).ok, false);
});

test("duplicate review classifies the complete multi-select candidate set in-folder and elsewhere", () => {
	const drafts = buildGenreSourceDrafts(["Comedy", "Horror"]).drafts;
	const { controller, folder } = selectedFolderController({
		sources: [drafts[0].editable],
		secondFolderSources: [drafts[1].editable],
		otherCollectionSources: [drafts[2].editable],
	});
	const review = inspectGenreSourceDuplicates(controller.getState().project, folder.internalId, drafts);
	assert.equal(review.duplicateDrafts.length, 1);
	assert.equal(review.missingDrafts.length, 2);
	assert.equal(review.destination.length, 1);
	assert.equal(review.elsewhere.length, 2);
	assert.equal(review.elsewhereDrafts.length, 2);
});

test("sort, exclusion and date-range variants remain addable exact-identity differences", () => {
	const baseOptions = { genres: ["Comedy"], sharedMediaChoice: "movies", sortOptionId: "popular" };
	const existing = buildGenreSourceDrafts(baseOptions.genres, baseOptions).drafts[0];
	const { controller, folder } = selectedFolderController({ sources: [existing.editable] });
	const variants = [
		buildGenreSourceDrafts(baseOptions.genres, { ...baseOptions, sortOptionId: "recent" }).drafts[0],
		buildGenreSourceDrafts(baseOptions.genres, { ...baseOptions, advanced: createGenreAdvancedState({ exclusionsByGenre: { Comedy: ["Horror"] } }) }).drafts[0],
		buildGenreSourceDrafts(baseOptions.genres, { ...baseOptions, advanced: createGenreAdvancedState({ yearFrom: "1990", yearTo: "1999" }) }).drafts[0],
	];
	for (const variant of variants) {
		const review = inspectGenreSourceDuplicates(controller.getState().project, folder.internalId, [variant]);
		assert.equal(review.duplicateDrafts.length, 0);
		assert.equal(review.missingDrafts.length, 1);
		assert.equal(review.elsewhereDrafts.length, 0);
	}
});

test("one atomic folder add handles the 35-source maximum", () => {
	const selected = GENRE_CONCEPTS;
	const drafts = buildGenreSourceDrafts(selected).drafts;
	const { controller, folder } = selectedFolderController();
	assert.equal(controller.updateNode(folder.internalId, {
		title: "Mixed Genres",
		tileShape: "LANDSCAPE",
		coverImageUrl: "https://example.invalid/preserved.jpg",
		coverEmoji: "⭐",
		hideTitle: false,
	}).ok, true);
	const presentationBefore = controller.getState().project.collections[0].folders[0].editable;
	const before = controller.getState().revision;
	const result = createGenreSourceBundle(controller, { folderInternalId: folder.internalId, genres: selected, drafts });
	assert.equal(result.ok, true);
	assert.equal(result.addedSourceCount, GENRE_PHYSICAL_SOURCE_LIMIT);
	assert.equal(result.createdSourceInternalIds.length, GENRE_PHYSICAL_SOURCE_LIMIT);
	assert.equal(controller.getState().revision, before + 1);
	assert.equal(controller.getState().project.collections[0].folders[0].sources.length, GENRE_PHYSICAL_SOURCE_LIMIT);
	assert.equal(controller.getState().project.collections[0].folders[0].editable, presentationBefore);
});

test("Genre folder planning classifies full, partial and elsewhere matches per collection", () => {
	const genres = ["Comedy", "Horror", "Western"];
	const drafts = buildGenreSourceDrafts(genres).drafts;
	const { controller, collection } = selectedFolderController({
		sources: [drafts[0].editable, drafts[1].editable],
		secondFolderSources: [drafts[3].editable],
		otherCollectionSources: [drafts[2].editable],
	});
	const plan = inspectGenreFolderPlan(controller.getState().project, collection.internalId, genres, drafts);
	assert.deepEqual(plan.groups.map((group) => [group.concept.name, group.status]), [
		["Comedy", "already-exists"],
		["Horror", "ready"],
		["Western", "partly-exists"],
	]);
	assert.equal(plan.alreadyExistingGroups.length, 1);
	assert.equal(plan.partialGroups.length, 1);
	assert.equal(plan.readyGroups.length, 1);
	assert.equal(plan.elsewhere.length, 1);
});

test("one atomic call creates 27 Genre folders containing all 35 sources", () => {
	assert.equal(DEFAULT_GENRE_DESTINATION_MODE, "current-folder");
	assert.deepEqual(GENRE_DESTINATION_MODES.map((entry) => entry.id), ["current-folder", "genre-folders"]);
	const drafts = buildGenreSourceDrafts(GENRE_CONCEPTS).drafts;
	const { controller, folder } = selectedFolderController();
	const before = controller.getState().revision;
	const result = createGenreSourceBundle(controller, {
		folderInternalId: folder.internalId,
		genres: GENRE_CONCEPTS,
		drafts,
		destinationMode: "genre-folders",
	});
	assert.equal(result.ok, true);
	assert.equal(result.addedFolderCount, 27);
	assert.equal(result.addedSourceCount, 35);
	assert.equal(result.createdFolderInternalIds.length, 27);
	assert.equal(controller.getState().revision, before + 1);
	const created = controller.getState().project.collections[0].folders.slice(2);
	assert.equal(created.length, 27);
	assert.equal(created.reduce((count, entry) => count + entry.sources.length, 0), 35);
	assert.equal(created.every((entry) => entry.editable.tileShape === "LANDSCAPE" && entry.editable.hideTitle === true), true);
});

test("one Genre is constrained to the current folder and cannot retain hidden folder mode", () => {
	const { controller, folder } = generatedUntitledController();
	const drafts = buildGenreSourceDrafts(["Horror"]).drafts;
	const before = controller.getState();
	const result = createGenreSourceBundle(controller, { folderInternalId: folder.internalId, genres: ["Horror"], drafts, destinationMode: "genre-folders" });
	assert.equal(result.ok, false);
	assert.equal(result.errors[0].code, "SINGLE_GENRE_DESTINATION");
	assert.equal(controller.getState().revision, before.revision);
	assert.deepEqual(controller.getState().project, before.project);
});

test("Select all atomically replaces a pristine generated Untitled Folder with exactly 27 Genre folders and 35 sources", () => {
	const { controller, folder } = generatedUntitledController();
	assert.equal(isPristineGeneratedUntitledFolder(folder), true);
	const drafts = buildGenreSourceDrafts(GENRE_CONCEPTS).drafts;
	const beforeRevision = controller.getState().revision;
	const result = createGenreSourceBundle(controller, { folderInternalId: folder.internalId, genres: GENRE_CONCEPTS, drafts, destinationMode: "genre-folders" });
	assert.equal(result.ok, true);
	assert.equal(result.replacedFolderInternalId, folder.internalId);
	assert.equal(controller.getState().revision, beforeRevision + 1);
	const folders = controller.getState().project.collections[0].folders;
	assert.equal(folders.length, 27);
	assert.equal(folders.some((entry) => entry.internalId === folder.internalId), false);
	assert.equal(folders.reduce((count, entry) => count + entry.sources.length, 0), 35);
	assert.equal(folders[0].editable.title, GENRE_CONCEPTS[0].name);
	controller.selectNode(result.createdFolderInternalIds[0]);
	assert.equal(controller.getState().selection.folderInternalId, folders[0].internalId);
	assert.equal(folders[0].sources[0].editable.filters.withGenres, String(GENRE_CONCEPTS[0].movieId));
});

test("pristine placeholder replacement follows final duplicate planning and is skipped for a no-op", () => {
	const genres = ["Comedy", "Horror"];
	const drafts = buildGenreSourceDrafts(genres).drafts;
	const partial = generatedUntitledController();
	const existingFolder = partial.controller.createFolder(partial.collection.internalId, { editable: { title: "Existing", tileShape: "POSTER", hideTitle: true } });
	partial.controller.addSourcesToFolder(existingFolder.createdInternalId, { sources: drafts.slice(0, 2).map((draft) => ({ category: draft.category, editable: draft.editable })) });
	partial.controller.selectNode(partial.folder.internalId);
	const partialResult = createGenreSourceBundle(partial.controller, { folderInternalId: partial.folder.internalId, genres, drafts, destinationMode: "genre-folders" });
	assert.equal(partialResult.ok, true);
	assert.equal(partialResult.addedFolderCount, 1);
	assert.equal(partial.controller.getState().project.collections[0].folders.some((entry) => entry.internalId === partial.folder.internalId), false);

	const noOp = generatedUntitledController();
	const allExisting = noOp.controller.createFolder(noOp.collection.internalId, { editable: { title: "Existing", tileShape: "POSTER", hideTitle: true } });
	noOp.controller.addSourcesToFolder(allExisting.createdInternalId, { sources: drafts.map((draft) => ({ category: draft.category, editable: draft.editable })) });
	noOp.controller.selectNode(noOp.folder.internalId);
	const before = noOp.controller.getState();
	const noOpResult = createGenreSourceBundle(noOp.controller, { folderInternalId: noOp.folder.internalId, genres, drafts, destinationMode: "genre-folders" });
	assert.equal(noOpResult.ok, false);
	assert.equal(noOpResult.errors[0].code, "NO_NEW_GENRE_FOLDERS");
	assert.equal(noOp.controller.getState().revision, before.revision);
	assert.equal(noOp.controller.getState().project.collections[0].folders.some((entry) => entry.internalId === noOp.folder.internalId), true);
});

test("renamed, restyled, populated and imported Untitled folders are never auto-replaced", () => {
	for (const patch of [
		{ title: "Renamed folder" },
		{ coverImageUrl: "https://example.test/custom.webp" },
		{ coverEmoji: "🎭" },
		{ tileShape: "LANDSCAPE" },
		{ hideTitle: false },
		{ heroBackdropUrl: "https://example.test/hero.webp" },
	]) {
		const { folder } = generatedUntitledController(patch);
		assert.equal(isPristineGeneratedUntitledFolder(folder), false, JSON.stringify(patch));
	}
	const populated = generatedUntitledController();
	const source = buildGenreSourceDrafts(["Horror"]).drafts[0];
	populated.controller.addSourcesToFolder(populated.folder.internalId, { sources: [{ category: source.category, editable: source.editable }] });
	assert.equal(isPristineGeneratedUntitledFolder(populated.controller.getState().project.collections[0].folders[0]), false);
	const imported = selectedFolderController();
	assert.equal(isPristineGeneratedUntitledFolder(imported.folder), false);
});

test("folder-mode creation preserves customized and imported selected folders in the real operation", () => {
	const drafts = buildGenreSourceDrafts(["Action", "Action & Adventure"]).drafts;
	const customized = generatedUntitledController({ coverEmoji: "🎭" });
	let result = createGenreSourceBundle(customized.controller, { folderInternalId: customized.folder.internalId, genres: ["Action", "Action & Adventure"], drafts, destinationMode: "genre-folders" });
	assert.equal(result.ok, true);
	assert.equal(customized.controller.getState().project.collections[0].folders.some((entry) => entry.internalId === customized.folder.internalId), true);
	assert.equal(customized.controller.getState().project.collections[0].folders.length, 3);

	const imported = selectedFolderController();
	result = createGenreSourceBundle(imported.controller, { folderInternalId: imported.folder.internalId, genres: ["Action", "Action & Adventure"], drafts, destinationMode: "genre-folders" });
	assert.equal(result.ok, true);
	assert.equal(imported.controller.getState().project.collections[0].folders.some((entry) => entry.internalId === imported.folder.internalId), true);
});

test("folder mode omits complete and partial groups without offering a duplicate override", () => {
	const genres = ["Comedy", "Horror", "Western"];
	const drafts = buildGenreSourceDrafts(genres).drafts;
	const { controller, folder } = selectedFolderController({
		sources: [drafts[0].editable, drafts[2].editable],
	});
	const result = createGenreSourceBundle(controller, {
		folderInternalId: folder.internalId,
		genres,
		drafts,
		destinationMode: "genre-folders",
		duplicateOverrideIdentity: genreDuplicateOverrideIdentity(folder.internalId, drafts),
	});
	assert.equal(result.ok, true);
	assert.equal(result.addedFolderCount, 1);
	assert.equal(result.addedSourceCount, 2);
	assert.equal(result.folderPlan.alreadyExistingGroups.length, 1);
	assert.equal(result.folderPlan.partialGroups.length, 1);
	assert.equal("duplicateOverrideUsed" in result, false);
});

test("default submission adds only missing candidates and exact override adds all anyway", () => {
	const drafts = buildGenreSourceDrafts(["Comedy", "Horror"]).drafts;
	const first = selectedFolderController({ sources: [drafts[0].editable] });
	let result = createGenreSourceBundle(first.controller, { folderInternalId: first.folder.internalId, genres: ["Comedy", "Horror"], drafts });
	assert.equal(result.ok, true);
	assert.equal(result.addedSourceCount, 2);
	const second = selectedFolderController({ sources: [drafts[0].editable] });
	result = createGenreSourceBundle(second.controller, {
		folderInternalId: second.folder.internalId,
		genres: ["Comedy", "Horror"],
		drafts,
		duplicateOverrideIdentity: genreDuplicateOverrideIdentity(second.folder.internalId, drafts),
	});
	assert.equal(result.ok, true);
	assert.equal(result.addedSourceCount, 3);
	assert.equal(result.duplicateOverrideUsed, true);
});

test("atomic collision failure preserves project content and content revision", () => {
	let calls = 0;
	const idFactory = () => calls++ < 6 ? `import-${calls}` : "collision";
	const { controller, folder } = selectedFolderController({ idFactory });
	const drafts = buildGenreSourceDrafts(["Comedy", "Horror"]).drafts;
	const before = controller.getState();
	const result = createGenreSourceBundle(controller, { folderInternalId: folder.internalId, genres: ["Comedy", "Horror"], drafts });
	assert.equal(result.ok, false);
	assert.equal(result.errors[0].code, "INTERNAL_ID_COLLISION");
	assert.equal(controller.getState().revision, before.revision);
	assert.deepEqual(controller.getState().project, before.project);
});

test("Genre Source Edit recognizes all approved filters and fails closed on unsupported fields", () => {
	const editable = buildGenreSourceDrafts(["Comedy"], { sharedMediaChoice: "movies", advanced: fullAdvanced() }).drafts[0].editable;
	const { controller, folder } = selectedFolderController({ sources: [editable] });
	const node = controller.getState().project.collections[0].folders[0].sources[0];
	assert.equal(inspectEditableGenreSource(node)?.genreName, "Comedy");
	assert.equal(sourceEditorFor(node)?.id, GENRE_SOURCE_EDITOR_ID);
	for (const mutation of [
		(value) => { value.filters.withGenres = "35,28"; },
		(value) => { value.filters.withKeywords = "42"; },
		(value) => { value.filters.releaseDateGte = "2001-02-01"; },
		(value) => { value.filters.withoutGenres = "99|27"; },
		(value) => { value.sortBy = "revenue.desc"; },
	]) {
		const changed = structuredClone(editable);
		mutation(changed);
		const candidate = selectedFolderController({ sources: [changed] }).controller.getState().project.collections[0].folders[0].sources[0];
		assert.equal(inspectEditableGenreSource(candidate), null);
	}
	assert.equal(folder.sources.length, 1);
});

test("Genre Source Edit changes name, sort and advanced filters while identity media stays fixed", () => {
	const editable = buildGenreSourceDrafts(["Comedy"], { sharedMediaChoice: "movies" }).drafts[0].editable;
	const { controller } = selectedFolderController({ sources: [editable] });
	const node = controller.getState().project.collections[0].folders[0].sources[0];
	const opened = createSourceEditSession(controller.getState().project, node.internalId);
	let draft = updateSourceEditTitle(opened.draft, "My comedies");
	draft = updateGenreSourceSort(draft, genreEditSortValue("recent", "MOVIE"), "recent");
	draft = updateGenreSourceAdvanced(draft, fullAdvanced());
	const before = controller.getState().revision;
	const saved = saveSourceEdit(controller, opened.session, draft);
	assert.equal(saved.ok, true);
	assert.equal(controller.getState().revision, before + 1);
	const edited = controller.getState().project.collections[0].folders[0].sources[0].editable;
	assert.equal(edited.title, "My comedies");
	assert.equal(edited.sortBy, "primary_release_date.desc");
	assert.deepEqual(edited.filters, buildGenreSourceDrafts(["Comedy"], { sharedMediaChoice: "movies", sortOptionId: "recent", advanced: fullAdvanced() }).drafts[0].editable.filters);
	assert.equal(edited.mediaType, "MOVIE");
	const resetSession = createSourceEditSession(controller.getState().project, node.internalId);
	assert.equal(saveSourceEdit(controller, resetSession.session, updateSourceEditTitle(resetSession.draft, genreDefaultSourceName("Comedy", "MOVIE"))).ok, true);
});

test("Genre Source Edit no-op, advanced duplicate and stale paths do not mutate", () => {
	const popular = buildGenreSourceDrafts(["Comedy"], { sharedMediaChoice: "movies" }).drafts[0].editable;
	const filtered = buildGenreSourceDrafts(["Comedy"], { sharedMediaChoice: "movies", advanced: fullAdvanced() }).drafts[0].editable;
	const { controller } = selectedFolderController({ sources: [popular, filtered] });
	const [first] = controller.getState().project.collections[0].folders[0].sources;
	const opened = createSourceEditSession(controller.getState().project, first.internalId);
	const before = controller.getState();
	const noOp = saveSourceEdit(controller, opened.session, opened.draft);
	assert.equal(noOp.ok, true);
	assert.equal(noOp.changed, false);
	assert.equal(controller.getState().revision, before.revision);
	const duplicate = saveSourceEdit(controller, opened.session, updateGenreSourceAdvanced(opened.draft, fullAdvanced()));
	assert.equal(duplicate.ok, false);
	assert.equal(controller.getState().revision, before.revision);
	controller.moveNode(first.internalId, 1);
	const staleRevision = controller.getState().revision;
	const stale = saveSourceEdit(controller, opened.session, updateSourceEditTitle(opened.draft, "Stale"));
	assert.equal(stale.ok, false);
	assert.equal(controller.getState().revision, staleRevision);
});

test("advanced Genre edit survives serialize → import → serialize without projection drift", () => {
	const editable = buildGenreSourceDrafts(["Comedy"], { sharedMediaChoice: "series", sortOptionId: "top-rated", advanced: fullAdvanced() }).drafts[0].editable;
	const { controller } = selectedFolderController({ sources: [editable] });
	const node = controller.getState().project.collections[0].folders[0].sources[0];
	const opened = createSourceEditSession(controller.getState().project, node.internalId);
	assert.equal(saveSourceEdit(controller, opened.session, updateSourceEditTitle(opened.draft, "Comedy on TV")).ok, true);
	const first = serializeNuvioProject(controller.getState().project);
	assert.equal(first.ok, true);
	const imported = importNuvioCollections(first.value, { idFactory: countingIdFactory("cycle") });
	assert.equal(imported.ok, true);
	const second = serializeNuvioProject(imported.project);
	assert.deepEqual(second.value, first.value);
	assert.deepEqual(second.value[0].folders[0].catalogSources, []);
});
