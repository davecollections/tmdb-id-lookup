import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createBuilderController } from "../builder/src/application/index.js";
import {
	beginPersonCountCheck,
	buildPromotedPeopleFolderEditable,
	buildPeopleSourceDrafts,
	buildTmdbProfileUrl,
	calculatePersonCreditCounts,
	completePersonCountCheck,
	createPeopleConfiguration,
	createPeopleFolderBatch,
	createPeopleSelectionState,
	createPeopleSourceBundle,
	createTmdbPersonProvider,
	failPersonCountCheck,
	hasCustomHttpsFolderArtwork,
	hasDeliberateFolderArtwork,
	INITIAL_PERSON_COUNT_STATE,
	inspectPeopleSourceDuplicates,
	isPromotablePeopleFolder,
	markPersonCountsStale,
	normalizePersonCombinedCredits,
	normalizeTmdbPersonDetailsResponse,
	normalizeTmdbPersonSearchResponse,
	parseTmdbPersonInput,
	PEOPLE_MEDIA,
	PEOPLE_ROLES,
	PEOPLE_SOURCE_COMBINATIONS,
	addSelectedPerson,
	defaultPeopleSourceCombinations,
	peopleDuplicateOverrideIdentity,
	peoplePromotionTileShape,
	personArtworkOrientation,
	personCountDisplayState,
	peopleSourceIdentity,
	peopleSourceTitle,
	requestPersonRuntimeArtwork,
	removeSelectedPerson,
	resolvePersonFolderArtwork,
	selectedPeople,
	updatePeopleConfiguration,
	validatePeopleCombinationSelection,
	validatePeopleRoleMediaSelection,
	validatePeopleSourceDraft,
	validatePeopleSourceDrafts,
} from "../builder/src/source-add/index.js";
import { validateNuvioContract } from "./helpers/nuvio-contract-validator.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const searchFixture = JSON.parse(fs.readFileSync(path.join(rootDir, "tests/fixtures/tmdb/people-search.json"), "utf8"));
const detailsFixture = JSON.parse(fs.readFileSync(path.join(rootDir, "tests/fixtures/tmdb/person-details.json"), "utf8"));

function countingIdFactory(prefix = "internal") {
	let calls = 0;
	return Object.assign(() => `${prefix}-${++calls}`, { calls: () => calls });
}

function sequenceIdFactory(...ids) {
	let index = 0;
	return Object.assign(() => {
		if (index >= ids.length) throw new Error("ID sequence exhausted");
		return ids[index++];
	}, { calls: () => index });
}

function createController(options = {}) {
	return createBuilderController({
		idFactory: countingIdFactory(),
		nuvioIdFactory: countingIdFactory("nuvio"),
		initialProjectTitle: "People",
		...options,
	});
}

function createCollection(controller, title = "People Collection") {
	const result = controller.createCollection({ editable: { title } });
	assert.equal(result.ok, true);
	controller.selectNode(result.createdInternalId);
	return result.createdInternalId;
}

function canonicalDrafts(selection = { combinations: PEOPLE_SOURCE_COMBINATIONS.map((entry) => entry.id) }) {
	const combinations = selection.combinations ?? PEOPLE_SOURCE_COMBINATIONS
		.filter((entry) => selection.roles.includes(entry.role) && selection.media.includes(entry.media))
		.map((entry) => entry.id);
	const result = buildPeopleSourceDrafts({ id: 31, name: "Tom Hanks" }, { combinations });
	assert.equal(result.ok, true);
	return result.drafts;
}

function draftsFor(person, combinations = ["acting-movies", "acting-series"]) {
	const result = buildPeopleSourceDrafts(person, { combinations });
	assert.equal(result.ok, true);
	return result.drafts;
}

function runtimeResult({ orientation = "poster", fallbackUsed = false, tmdbId = 31 } = {}) {
	const sha256 = "a".repeat(64);
	return {
		status: "ready",
		entityType: "person",
		tmdbId,
		orientation,
		sha256,
		fallbackUsed,
		assetUrl: `https://raw.githubusercontent.com/davecollections/nuvio-assets/main/assets/collection_covers/people/${orientation}/${tmdbId}.webp?v=${sha256.slice(0, 12)}`,
	};
}

test("person input accepts names, exact positive IDs, and strict person URLs", () => {
	assert.deepEqual(parseTmdbPersonInput("Tom Hanks"), {
		kind: "search", query: "Tom Hanks", eligible: true, message: null,
	});
	assert.deepEqual(parseTmdbPersonInput(" 31 "), { kind: "exact", inputType: "id", id: 31 });
	assert.deepEqual(parseTmdbPersonInput("https://www.themoviedb.org/person/31?language=en#credits"), {
		kind: "exact", inputType: "url", id: 31,
	});
});

test("person input rejects unsafe, malformed, non-person, and unsupported URLs", () => {
	for (const value of [
		"http://www.themoviedb.org/person/31",
		"https://evil.example/person/31",
		"https://themoviedb.org/movie/31",
		"https://themoviedb.org/person/31-tom-hanks",
		"https://user@themoviedb.org/person/31",
		"https://themoviedb.org:444/person/31",
		"https://themoviedb.org/person/../person/31",
		"themoviedb.org/person/31",
	]) assert.equal(parseTmdbPersonInput(value).kind, "invalid", value);
});

test("person input rejects non-positive, unsafe, fractional, and exponential IDs", () => {
	for (const value of ["0", "-1", "1.5", "1e2", "9007199254740992"]) {
		assert.equal(parseTmdbPersonInput(value).kind, "invalid", value);
	}
});

test("person search normalization preserves TMDB ordering and identical-name disambiguation", () => {
	const normalized = normalizeTmdbPersonSearchResponse(searchFixture);
	assert.deepEqual(normalized.results.map((person) => person.id), [101, 202, 303]);
	assert.deepEqual(normalized.results.slice(0, 2).map((person) => person.name), ["Alex Smith", "Alex Smith"]);
	assert.deepEqual(normalized.results.slice(0, 2).map((person) => person.knownForDepartment), ["Acting", "Directing"]);
});

test("person search normalization retains missing profiles and every valid known-for row in TMDB order", () => {
	const normalized = normalizeTmdbPersonSearchResponse(searchFixture);
	assert.equal(normalized.results[1].profilePath, null);
	assert.deepEqual(normalized.results[0].knownFor, [
		{ title: "First Film", mediaType: "MOVIE", year: 2019 },
		{ title: "First Series", mediaType: "TV", year: 2021 },
		{ title: "Original Third", mediaType: "MOVIE", year: null },
		{ title: "Ignored Fourth", mediaType: "MOVIE", year: 2024 },
	]);
});

test("canonical details normalize one person and keep count failure non-fatal", () => {
	const complete = normalizeTmdbPersonDetailsResponse(detailsFixture, 31);
	assert.equal(complete.name, "Tom Hanks");
	assert.equal(complete.countError, null);
	const withoutCredits = normalizeTmdbPersonDetailsResponse({
		id: 31, name: "Tom Hanks", profile_path: null,
	}, 31);
	assert.equal(withoutCredits.counts, null);
	assert.equal(withoutCredits.countError.retryable, true);
	assert.equal(normalizeTmdbPersonDetailsResponse(detailsFixture, 999), null);
});

test("combined credits count distinct cast titles and Director jobs only", () => {
	assert.deepEqual(calculatePersonCreditCounts(detailsFixture.combined_credits), {
		actingMovies: 1,
		actingSeries: 1,
		directingMovies: 1,
		directingSeries: 1,
	});
});

test("combined-credit normalization excludes malformed entries without changing count semantics", () => {
	const normalized = normalizePersonCombinedCredits(detailsFixture.combined_credits);
	assert.equal(normalized.cast.length, 6);
	assert.equal(normalized.crew.length, 6);
	assert.deepEqual(calculatePersonCreditCounts({ cast: [], crew: [{ id: 10, media_type: "movie", job: "Writer" }] }), {
		actingMovies: 0, actingSeries: 0, directingMovies: 0, directingSeries: 0,
	});
});

test("role and media validation requires explicit supported selections", () => {
	assert.equal(validatePeopleRoleMediaSelection({ roles: ["acting"], media: ["movies"] }).ok, true);
	for (const selection of [
		{ roles: [], media: ["movies"] },
		{ roles: ["acting"], media: [] },
		{ roles: ["writer"], media: ["movies"] },
		{ roles: ["acting"], media: ["both"] },
	]) assert.equal(validatePeopleRoleMediaSelection(selection).ok, false);
});

test("direct source combinations use the stable v1 role-and-media tab titles", () => {
	const cases = [
		[["acting-movies"], ["PERSON:MOVIE"]],
		[["acting-movies", "acting-series"], ["PERSON:MOVIE", "PERSON:TV"]],
		[["acting-movies", "directing-movies"], ["PERSON:MOVIE", "DIRECTOR:MOVIE"]],
		[PEOPLE_SOURCE_COMBINATIONS.map((entry) => entry.id), ["PERSON:MOVIE", "PERSON:TV", "DIRECTOR:MOVIE", "DIRECTOR:TV"]],
	];
	for (const [combinations, expected] of cases) {
		const result = buildPeopleSourceDrafts({ id: 31, name: "Tom Hanks" }, { combinations });
		assert.equal(result.ok, true);
		assert.deepEqual(result.drafts.map((draft) => `${draft.editable.tmdbSourceType}:${draft.editable.mediaType}`), expected);
		assert.deepEqual(
			result.drafts.map((draft) => draft.editable.title),
			combinations.map((id) => PEOPLE_SOURCE_COMBINATIONS.find((entry) => entry.id === id).sourceTitle),
		);
	}
	assert.deepEqual(PEOPLE_SOURCE_COMBINATIONS.map((entry) => entry.sourceTitle), ["Movie Credits", "Series Credits", "Directed Movies", "Directed Series"]);
	assert.equal(peopleSourceTitle("PERSON", "MOVIE"), "Movie Credits");
	assert.equal(peopleSourceTitle("DIRECTOR", "TV"), "Directed Series");
	assert.deepEqual(PEOPLE_ROLES.map((entry) => entry.label), ["Acting", "Directing"]);
	assert.deepEqual(PEOPLE_MEDIA.map((entry) => entry.label), ["Movies", "Series"]);
	assert.deepEqual(PEOPLE_SOURCE_COMBINATIONS.map((entry) => entry.label), ["Acting Movies", "Acting Series", "Directed Movies", "Directed Series"]);
});

test("automatic defaults use department and positive counts, with unsupported departments comparing totals", () => {
	const counts = { actingMovies: 4, actingSeries: 0, directingMovies: 1, directingSeries: 2 };
	assert.deepEqual(defaultPeopleSourceCombinations({ id: 1, knownForDepartment: "Acting", counts }), ["acting-movies"]);
	assert.deepEqual(defaultPeopleSourceCombinations({ id: 1, knownForDepartment: "Directing", counts }), ["directing-movies", "directing-series"]);
	assert.deepEqual(defaultPeopleSourceCombinations({ id: 1, knownForDepartment: "Production", counts }), ["acting-movies"]);
	assert.deepEqual(defaultPeopleSourceCombinations({ id: 1, knownForDepartment: "Production", counts: { ...counts, actingMovies: 3 } }), []);
	assert.deepEqual(defaultPeopleSourceCombinations({ id: 1, knownForDepartment: "Acting", counts: null }), []);
});

test("manual combination choices persist across refreshed person details", () => {
	const first = { id: 31, knownForDepartment: "Acting", counts: { actingMovies: 3, actingSeries: 1, directingMovies: 0, directingSeries: 0 } };
	const configured = updatePeopleConfiguration(createPeopleConfiguration(first), ["directing-series"]);
	const refreshed = { ...first, counts: { actingMovies: 0, actingSeries: 0, directingMovies: 5, directingSeries: 8 } };
	assert.deepEqual(createPeopleConfiguration(refreshed, configured).combinations, ["directing-series"]);
	assert.equal(validatePeopleCombinationSelection([]).ok, false);
});

test("multi-person selection preserves insertion order, blocks duplicates, removes independently, and caps at 20", () => {
	let state = createPeopleSelectionState();
	for (let id = 1; id <= 20; id += 1) state = addSelectedPerson(state, { id, name: `Person ${id}` }).state;
	assert.deepEqual(selectedPeople(state).map((person) => person.id), Array.from({ length: 20 }, (_, index) => index + 1));
	assert.equal(addSelectedPerson(state, { id: 10, name: "Duplicate" }).duplicate, true);
	assert.equal(addSelectedPerson(state, { id: 21, name: "Person 21" }).limitReached, true);
	state = removeSelectedPerson(state, 7);
	assert.equal(state.byId[7], undefined);
	assert.equal(addSelectedPerson(state, { id: 21, name: "Person 21" }).added, true);
});

test("every generated source contains exactly the approved native fields", () => {
	for (const draft of canonicalDrafts()) {
		assert.deepEqual(Object.keys(draft).sort(), ["category", "editable"]);
		assert.deepEqual(Object.keys(draft.editable).sort(), [
			"filters", "mediaType", "provider", "sortBy", "title", "tmdbId", "tmdbSourceType",
		]);
		assert.equal(draft.editable.sortBy, "popularity.desc");
		assert.deepEqual(draft.editable.filters, {});
	}
});

test("People source validation rejects BOTH, generic All credits, extra fields, and unsupported crew roles", () => {
	const base = canonicalDrafts({ roles: ["acting"], media: ["movies"] })[0];
	for (const changed of [
		{ ...base, editable: { ...base.editable, mediaType: "BOTH" } },
		{ ...base, editable: { ...base.editable, title: "All credits" } },
		{ ...base, editable: { ...base.editable, tmdbSourceType: "WRITER" } },
		{ ...base, editable: { ...base.editable, count: 10 } },
	]) assert.equal(validatePeopleSourceDraft(changed).ok, false);
	assert.equal(validatePeopleSourceDrafts([...canonicalDrafts(), canonicalDrafts()[0]]).ok, false);
});

test("canonical duplicate identity normalizes imported numeric strings and casing", () => {
	assert.equal(peopleSourceIdentity({
		provider: "TMDB", tmdbSourceType: "person", tmdbId: "00031", mediaType: "movie",
	}), "tmdb|PERSON|31|MOVIE");
	assert.equal(peopleSourceIdentity({
		provider: "tmdb", tmdbSourceType: "DIRECTOR", tmdbId: 31, mediaType: "TV",
	}), "tmdb|DIRECTOR|31|TV");
	assert.equal(peopleSourceIdentity({ provider: "tmdb", tmdbSourceType: "WRITER", tmdbId: 31, mediaType: "TV" }), null);
});

test("duplicate review separates destination conflicts from informational elsewhere occurrences", () => {
	const controller = createController();
	assert.equal(controller.importValue([{
		id: "collection", title: "People", folders: [
			{ id: "a", title: "A", sources: [{ provider: "TMDB", title: "Existing", tmdbSourceType: "person", tmdbId: "31", mediaType: "movie", sortBy: "popularity.desc", filters: {} }] },
			{ id: "b", title: "B", sources: [{ provider: "tmdb", title: "Elsewhere", tmdbSourceType: "DIRECTOR", tmdbId: 31, mediaType: "TV", sortBy: "popularity.desc", filters: {} }] },
		],
	}]).ok, true);
	const folders = controller.getState().project.collections[0].folders;
	const review = inspectPeopleSourceDuplicates(controller.getState().project, folders[0].internalId, canonicalDrafts());
	assert.deepEqual(review.destination.map((entry) => entry.identity), ["tmdb|PERSON|31|MOVIE"]);
	assert.deepEqual(review.elsewhere.map((entry) => entry.identity), ["tmdb|DIRECTOR|31|TV"]);
	assert.equal(review.missingDrafts.length, 3);
});

test("duplicate override approval changes whenever the reviewed identities change", () => {
	const one = canonicalDrafts({ roles: ["acting"], media: ["movies"] });
	const two = canonicalDrafts({ roles: ["acting"], media: ["movies", "series"] });
	assert.notEqual(peopleDuplicateOverrideIdentity("folder", one), peopleDuplicateOverrideIdentity("folder", two));
});

test("atomic controller creation adds one folder and four sources in one revision", () => {
	const controller = createController();
	const collectionInternalId = createCollection(controller);
	const beforeRevision = controller.getState().revision;
	const result = controller.createFolderWithSources(collectionInternalId, {
		folder: { editable: { title: "Tom Hanks", tileShape: "POSTER", hideTitle: false } },
		sources: canonicalDrafts().map((draft) => ({ category: draft.category, editable: draft.editable })),
	});
	assert.equal(result.ok, true);
	assert.equal(controller.getState().revision, beforeRevision + 1);
	const folder = controller.getState().project.collections[0].folders[0];
	assert.equal(folder.sources.length, 4);
	assert.deepEqual(result.createdSourceInternalIds, folder.sources.map((source) => source.internalId));
});

test("atomic controller insertion appends multiple sources in one revision and preserves existing values", () => {
	const controller = createController();
	const collectionInternalId = createCollection(controller);
	const folder = controller.createFolder(collectionInternalId, {
		editable: { title: "Custom", coverImageUrl: "https://example.test/custom.webp", hideTitle: true },
		rawImported: { id: "raw-folder", title: "Raw", unknown: { keep: true }, sources: [] },
	});
	const beforeRevision = controller.getState().revision;
	const result = controller.addSourcesToFolder(folder.createdInternalId, {
		sources: canonicalDrafts({ roles: ["acting"], media: ["movies", "series"] }).map((draft) => ({ category: draft.category, editable: draft.editable })),
	});
	assert.equal(result.ok, true);
	assert.equal(controller.getState().revision, beforeRevision + 1);
	const updated = controller.getState().project.collections[0].folders[0];
	assert.equal(updated.editable.coverImageUrl, "https://example.test/custom.webp");
	assert.deepEqual(updated.rawImported.unknown, { keep: true });
	assert.deepEqual(updated.sources.map((source) => source.editable.mediaType), ["MOVIE", "TV"]);
});

test("atomic multi-folder controller insertion preserves order and commits one revision", () => {
	const controller = createController();
	const collectionInternalId = createCollection(controller);
	const beforeRevision = controller.getState().revision;
	const people = [{ id: 31, name: "Tom Hanks" }, { id: 202, name: "Alex Smith" }];
	const result = createPeopleFolderBatch(controller, {
		collectionInternalId,
		people: people.map((person) => ({
			person,
			folderEditable: { title: person.name, tileShape: "POSTER", coverImageUrl: "", hideTitle: false },
			drafts: draftsFor(person),
		})),
	});
	assert.equal(result.ok, true);
	assert.equal(controller.getState().revision, beforeRevision + 1);
	assert.equal(result.addedFolderCount, 2);
	assert.equal(result.addedSourceCount, 4);
	assert.deepEqual(controller.getState().project.collections[0].folders.map((folder) => folder.editable.title), people.map((person) => person.name));
	assert.deepEqual(controller.getState().project.collections[0].folders.map((folder) => folder.sources.map((source) => source.editable.title)), [["Movie Credits", "Series Credits"], ["Movie Credits", "Series Credits"]]);
});

test("multi-folder ID failure rolls back every pending folder and source", () => {
	const idFactory = sequenceIdFactory("project", "collection", "source-a", "source-b", "folder-a");
	const controller = createController({ idFactory });
	const collectionInternalId = createCollection(controller);
	const beforeProject = controller.getState().project;
	const result = controller.createFoldersWithSources(collectionInternalId, {
		bundles: [
			{ folder: { editable: { title: "A" } }, sources: draftsFor({ id: 31, name: "A" }) },
			{ folder: { editable: { title: "B" } }, sources: draftsFor({ id: 32, name: "B" }) },
		],
	});
	assert.equal(result.ok, false);
	assert.equal(controller.getState().project, beforeProject);
	assert.equal(controller.getState().project.collections[0].folders.length, 0);
});

test("bundle validation failure leaves the project document unchanged", () => {
	const controller = createController();
	const collectionInternalId = createCollection(controller);
	const beforeProject = controller.getState().project;
	const result = controller.createFolderWithSources(collectionInternalId, {
		folder: { editable: { title: "Person" } },
		sources: [{ category: "native-tmdb", editable: {} }, { category: "future", editable: {} }],
	});
	assert.equal(result.ok, false);
	assert.equal(controller.getState().project, beforeProject);
});

test("ID factory failure during bundle construction rolls back every pending node", () => {
	const idFactory = sequenceIdFactory("project", "collection", "folder", "source-one");
	const controller = createController({ idFactory });
	const collectionInternalId = createCollection(controller);
	const beforeProject = controller.getState().project;
	const result = controller.createFolderWithSources(collectionInternalId, {
		folder: { editable: { title: "Person" } },
		sources: canonicalDrafts({ roles: ["acting"], media: ["movies", "series"] }).map((draft) => ({ category: draft.category, editable: draft.editable })),
	});
	assert.equal(result.ok, false);
	assert.equal(controller.getState().project, beforeProject);
	assert.equal(controller.getState().project.collections[0].folders.length, 0);
});

test("collection People service creates a Poster folder atomically and folder quick add preserves it", () => {
	const controller = createController();
	const collectionInternalId = createCollection(controller);
	const person = { id: 31, name: "Tom Hanks" };
	let result = createPeopleFolderBatch(controller, {
		collectionInternalId,
		people: [{
			person,
			folderEditable: { title: "Tom Hanks", tileShape: "POSTER", hideTitle: false, coverImageUrl: "" },
			drafts: canonicalDrafts({ roles: ["acting"], media: ["movies"] }),
		}],
	});
	assert.equal(result.ok, true);
	assert.equal(result.addedFolderCount, 1);
	const createdFolderInternalId = result.createdFolderInternalIds[0];
	controller.selectNode(createdFolderInternalId);
	result = createPeopleSourceBundle(controller, {
		destination: { kind: "existing-folder", folderInternalId: createdFolderInternalId },
		person,
		drafts: canonicalDrafts({ roles: ["acting"], media: ["movies", "series"] }),
	});
	assert.equal(result.ok, true);
	assert.equal(result.addedSourceCount, 1);
	assert.equal(controller.getState().project.collections[0].folders[0].sources.length, 2);
});

test("untouched default-folder eligibility is exact and preserves deliberate or populated folders", () => {
	const base = {
		nodeType: "folder",
		internalId: "folder",
		editable: { id: "folder-id", title: "Untitled Folder", tileShape: "POSTER", hideTitle: true },
		sources: [],
	};
	assert.equal(isPromotablePeopleFolder(base), true);
	assert.equal(isPromotablePeopleFolder({ ...base, editable: { ...base.editable, title: "Untitled Folder 2" } }), true);
	assert.equal(isPromotablePeopleFolder({ ...base, editable: { ...base.editable, title: "Untitled Folder 100" } }), true);
	assert.equal(isPromotablePeopleFolder({ ...base, editable: { ...base.editable, title: "Named" } }), false);
	assert.equal(isPromotablePeopleFolder({ ...base, sources: [{}] }), false);
	assert.equal(isPromotablePeopleFolder({ ...base, rawImported: {} }), false);
	for (const editable of [
		{ coverImageUrl: "https://example.test/custom.webp" },
		{ coverEmoji: "🎭" },
		{ focusGifUrl: "https://example.test/focus.gif" },
		{ focusGifEnabled: true },
	]) {
		const folder = { ...base, editable: { ...base.editable, ...editable } };
		assert.equal(hasDeliberateFolderArtwork(folder), true);
		assert.equal(isPromotablePeopleFolder(folder), false);
	}
	assert.equal(peoplePromotionTileShape({ editable: { tileShape: "LANDSCAPE" } }), "LANDSCAPE");
});

test("numbered untouched folder promotion applies curated artwork and sources in one revision", () => {
	const controller = createController();
	const collectionInternalId = createCollection(controller);
	const created = controller.createFolder(collectionInternalId, { editable: { title: "Untitled Folder 2", tileShape: "POSTER", hideTitle: true } });
	controller.selectNode(created.createdInternalId);
	const person = { id: 31, name: "Tom Hanks", profilePath: "/profile.jpg" };
	const artwork = resolvePersonFolderArtwork({ person, runtimeResult: runtimeResult() });
	const beforeRevision = controller.getState().revision;
	const result = createPeopleSourceBundle(controller, {
		destination: { kind: "existing-folder", folderInternalId: created.createdInternalId },
		person,
		drafts: draftsFor(person, ["acting-movies", "acting-series"]),
		artwork,
	});
	assert.equal(result.ok, true);
	assert.equal(result.promotedFolder, true);
	assert.equal(controller.getState().revision, beforeRevision + 1);
	const folder = controller.getState().project.collections[0].folders[0];
	assert.equal(folder.editable.title, "Tom Hanks");
	assert.equal(folder.editable.tileShape, "POSTER");
	assert.equal(folder.editable.hideTitle, true);
	assert.equal(folder.editable.coverImageUrl, artwork.previewUrl);
	assert.deepEqual(folder.sources.map((source) => source.editable.title), ["Movie Credits", "Series Credits"]);
});

test("untouched folder promotion uses TMDB then visible-title emoji fallbacks", () => {
	for (const scenario of [
		{ title: "Untitled Folder", person: { id: 31, name: "Tom Hanks", profilePath: "/profile.jpg" }, expectedSource: "tmdb" },
		{ title: "Untitled Folder 3", person: { id: 202, name: "Alex Smith", profilePath: null }, expectedSource: "emoji" },
	]) {
		const controller = createController();
		const collectionInternalId = createCollection(controller);
		const created = controller.createFolder(collectionInternalId, { editable: { title: scenario.title, tileShape: "POSTER", hideTitle: true } });
		controller.selectNode(created.createdInternalId);
		const artwork = resolvePersonFolderArtwork({ person: scenario.person, runtimeResult: null });
		assert.equal(artwork.source, scenario.expectedSource);
		const result = createPeopleSourceBundle(controller, {
			destination: { kind: "existing-folder", folderInternalId: created.createdInternalId },
			person: scenario.person,
			drafts: draftsFor(scenario.person, ["acting-movies"]),
			artwork,
		});
		assert.equal(result.ok, true);
		const folder = controller.getState().project.collections[0].folders[0];
		assert.equal(folder.editable.title, scenario.person.name);
		assert.equal(folder.editable.hideTitle, false);
		if (scenario.expectedSource === "tmdb") assert.equal(folder.editable.coverImageUrl, buildTmdbProfileUrl("/profile.jpg", "w500"));
		else assert.deepEqual({ coverImageUrl: folder.editable.coverImageUrl, coverEmoji: folder.editable.coverEmoji }, { coverImageUrl: "", coverEmoji: "👤" });
	}
});

test("promoted folders preserve an existing non-default tile shape", () => {
	const controller = createController();
	const collectionInternalId = createCollection(controller);
	const created = controller.createFolder(collectionInternalId, { editable: { title: "Untitled Folder", tileShape: "LANDSCAPE", hideTitle: false } });
	controller.selectNode(created.createdInternalId);
	const person = { id: 31, name: "Tom Hanks", profilePath: "/profile.jpg" };
	const artwork = resolvePersonFolderArtwork({ person, tileShape: "LANDSCAPE", runtimeResult: runtimeResult({ orientation: "landscape" }) });
	assert.deepEqual(buildPromotedPeopleFolderEditable(controller.getState().project.collections[0].folders[0], person, artwork), {
		title: "Tom Hanks", tileShape: "LANDSCAPE", coverImageUrl: artwork.previewUrl, hideTitle: true,
	});
	assert.equal(createPeopleSourceBundle(controller, {
		destination: { kind: "existing-folder", folderInternalId: created.createdInternalId }, person, drafts: draftsFor(person, ["acting-movies"]), artwork,
	}).ok, true);
	assert.equal(controller.getState().project.collections[0].folders[0].editable.tileShape, "LANDSCAPE");
});

test("Landscape promotion uses exact curated art, then TMDB profile, then visible-title emoji", () => {
	const scenarios = [
		{
			label: "curated",
			person: { id: 31, name: "Tom Hanks", profilePath: "/profile.jpg" },
			runtimeResult: runtimeResult({ orientation: "landscape" }),
			expectedSource: "runtime",
			expectedHideTitle: true,
		},
		{
			label: "TMDB profile fallback",
			person: { id: 31, name: "Tom Hanks", profilePath: "/profile.jpg" },
			runtimeResult: null,
			expectedSource: "tmdb",
			expectedHideTitle: false,
		},
		{
			label: "emoji fallback",
			person: { id: 202, name: "Alex Smith", profilePath: null },
			runtimeResult: null,
			expectedSource: "emoji",
			expectedHideTitle: false,
		},
	];

	for (const scenario of scenarios) {
		const controller = createController();
		const collectionInternalId = createCollection(controller);
		const created = controller.createFolder(collectionInternalId, { editable: { title: "Untitled Folder", tileShape: "LANDSCAPE", hideTitle: true } });
		controller.selectNode(created.createdInternalId);
		const artwork = resolvePersonFolderArtwork({ person: scenario.person, tileShape: "LANDSCAPE", runtimeResult: scenario.runtimeResult });
		assert.equal(artwork.source, scenario.expectedSource, scenario.label);
		assert.equal(artwork.tileShape, "LANDSCAPE", scenario.label);
		assert.equal(artwork.folderEditable.hideTitle, scenario.expectedHideTitle, scenario.label);
		assert.equal(createPeopleSourceBundle(controller, {
			destination: { kind: "existing-folder", folderInternalId: created.createdInternalId },
			person: scenario.person,
			drafts: draftsFor(scenario.person, ["acting-movies"]),
			artwork,
		}).ok, true, scenario.label);
		const folder = controller.getState().project.collections[0].folders[0];
		assert.equal(folder.editable.tileShape, "LANDSCAPE", scenario.label);
		assert.equal(folder.editable.hideTitle, scenario.expectedHideTitle, scenario.label);
		if (scenario.expectedSource === "emoji") {
			assert.deepEqual({ coverImageUrl: folder.editable.coverImageUrl, coverEmoji: folder.editable.coverEmoji }, { coverImageUrl: "", coverEmoji: "👤" });
		} else {
			assert.equal(folder.editable.coverImageUrl, artwork.previewUrl, scenario.label);
			assert.equal(Object.hasOwn(folder.editable, "coverEmoji"), false, `${scenario.label} clears the emoji`);
		}
	}
});

test("invalid promotion input and source-construction failure leave a default folder byte-identical", () => {
	for (const mutationFailure of [false, true]) {
		const idFactory = mutationFailure ? sequenceIdFactory("project", "collection", "folder") : countingIdFactory();
		const controller = createController({ idFactory });
		const collectionInternalId = createCollection(controller);
		const created = controller.createFolder(collectionInternalId, { editable: { title: "Untitled Folder", tileShape: "LANDSCAPE", hideTitle: true } });
		controller.selectNode(created.createdInternalId);
		const beforeProject = controller.getState().project;
		const beforeBytes = JSON.stringify(beforeProject.collections[0].folders[0]);
		const person = { id: 31, name: "Tom Hanks", profilePath: "/profile.jpg" };
		const result = createPeopleSourceBundle(controller, {
			destination: { kind: "existing-folder", folderInternalId: created.createdInternalId },
			person,
			drafts: draftsFor(person, ["acting-movies"]),
			artwork: mutationFailure ? resolvePersonFolderArtwork({ person, tileShape: "LANDSCAPE", runtimeResult: runtimeResult({ orientation: "landscape" }) }) : null,
		});
		assert.equal(result.ok, false);
		assert.equal(controller.getState().project, beforeProject);
		assert.equal(JSON.stringify(controller.getState().project.collections[0].folders[0]), beforeBytes);
	}
});

test("named, populated, and custom-art Untitled folders are never repurposed", () => {
	const cases = [
		{ title: "Named folder", editable: { coverImageUrl: "https://example.test/named.webp", hideTitle: true } },
		{ title: "Untitled Folder", editable: { coverImageUrl: "https://example.test/custom.webp", coverEmoji: "🎭", tileShape: "LANDSCAPE", hideTitle: true } },
	];
	for (const scenario of cases) {
		const controller = createController();
		const collectionInternalId = createCollection(controller);
		const created = controller.createFolder(collectionInternalId, { editable: { title: scenario.title, ...scenario.editable } });
		controller.selectNode(created.createdInternalId);
		const beforeEditable = structuredClone(controller.getState().project.collections[0].folders[0].editable);
		const person = { id: 31, name: "Tom Hanks" };
		const result = createPeopleSourceBundle(controller, {
			destination: { kind: "existing-folder", folderInternalId: created.createdInternalId }, person, drafts: draftsFor(person, ["acting-movies"]),
		});
		assert.equal(result.ok, true);
		assert.equal(result.promotedFolder, false);
		assert.deepEqual(controller.getState().project.collections[0].folders[0].editable, beforeEditable);
	}

	const controller = createController();
	const collectionInternalId = createCollection(controller);
	const created = controller.createFolder(collectionInternalId, { editable: { title: "Untitled Folder", tileShape: "POSTER", hideTitle: true } });
	assert.equal(controller.createSource(created.createdInternalId, { category: "native-tmdb", editable: canonicalDrafts({ combinations: ["acting-movies"] })[0].editable }).ok, true);
	controller.selectNode(created.createdInternalId);
	const beforeEditable = structuredClone(controller.getState().project.collections[0].folders[0].editable);
	const person = { id: 202, name: "Alex Smith" };
	const result = createPeopleSourceBundle(controller, {
		destination: { kind: "existing-folder", folderInternalId: created.createdInternalId }, person, drafts: draftsFor(person, ["acting-series"]),
	});
	assert.equal(result.ok, true);
	assert.equal(result.promotedFolder, false);
	assert.deepEqual(controller.getState().project.collections[0].folders[0].editable, beforeEditable);
});

test("folder quick add rejects any destination other than the currently selected folder", () => {
	const controller = createController();
	const collectionInternalId = createCollection(controller);
	const selected = controller.createFolder(collectionInternalId, { editable: { title: "Selected" } });
	const other = controller.createFolder(collectionInternalId, { editable: { title: "Other" } });
	controller.selectNode(selected.createdInternalId);
	const beforeProject = controller.getState().project;
	const result = createPeopleSourceBundle(controller, {
		destination: { kind: "existing-folder", folderInternalId: other.createdInternalId },
		person: { id: 31, name: "Tom Hanks" },
		drafts: canonicalDrafts({ combinations: ["acting-movies"] }),
	});
	assert.equal(result.ok, false);
	assert.equal(result.errors[0].code, "PEOPLE_FOLDER_UNAVAILABLE");
	assert.equal(controller.getState().project, beforeProject);
});

test("explicit Add all anyway is identity-bound and configuration changes invalidate approval", () => {
	const controller = createController();
	const collectionInternalId = createCollection(controller);
	const folder = controller.createFolder(collectionInternalId, { editable: { title: "Tom Hanks" } });
	controller.selectNode(folder.createdInternalId);
	const actingMovie = canonicalDrafts({ roles: ["acting"], media: ["movies"] });
	assert.equal(createPeopleSourceBundle(controller, {
		destination: { kind: "existing-folder", folderInternalId: folder.createdInternalId }, person: { id: 31, name: "Tom Hanks" }, drafts: actingMovie,
	}).ok, true);
	const oldApproval = peopleDuplicateOverrideIdentity(folder.createdInternalId, actingMovie);
	const changed = canonicalDrafts({ roles: ["acting"], media: ["movies", "series"] });
	const result = createPeopleSourceBundle(controller, {
		destination: { kind: "existing-folder", folderInternalId: folder.createdInternalId },
		person: { id: 31, name: "Tom Hanks" },
		drafts: changed,
		duplicateOverrideIdentity: oldApproval,
	});
	assert.equal(result.ok, true);
	assert.equal(result.addedSourceCount, 1);
	assert.deepEqual(controller.getState().project.collections[0].folders[0].sources.map((source) => source.editable.mediaType), ["MOVIE", "TV"]);
});

test("runtime artwork resolves exact poster and landscape orientation including approved fallbackUsed", () => {
	for (const tileShape of ["POSTER", "LANDSCAPE"]) {
		const orientation = personArtworkOrientation(tileShape);
		const result = resolvePersonFolderArtwork({
			person: { id: 31, name: "Tom Hanks", profilePath: "/profile.jpg" },
			tileShape,
			runtimeResult: runtimeResult({ orientation, fallbackUsed: true }),
		});
		assert.equal(result.source, "runtime");
		assert.equal(result.fallbackUsed, true);
		assert.equal(result.folderEditable.hideTitle, true);
		assert.match(result.folderEditable.coverImageUrl, new RegExp(`/people/${orientation}/31\\.webp\\?v=${"a".repeat(12)}$`));
	}
});

test("missing runtime record or orientation falls back to TMDB w500 then visible-title emoji", () => {
	for (const tileShape of ["POSTER", "LANDSCAPE"]) {
		const tmdb = resolvePersonFolderArtwork({
			person: { id: 31, profilePath: "/profile.jpg" }, tileShape, runtimeResult: null,
		});
		assert.equal(tmdb.source, "tmdb", tileShape);
		assert.equal(tmdb.tileShape, tileShape);
		assert.equal(tmdb.folderEditable.coverImageUrl, buildTmdbProfileUrl("/profile.jpg", "w500"));
		assert.equal(tmdb.folderEditable.hideTitle, false);
		assert.equal(Object.hasOwn(tmdb.folderEditable, "coverEmoji"), false);
		const emoji = resolvePersonFolderArtwork({
			person: { id: 31, profilePath: null }, tileShape, runtimeResult: null,
		});
		assert.equal(emoji.tileShape, tileShape);
		assert.deepEqual(emoji.folderEditable, { coverImageUrl: "", hideTitle: false, coverEmoji: "👤" });
	}
});

test("sequential, missing, reopened, and bulk artwork resolution remains independent by person ID", () => {
	const personA = { id: 31, name: "Person A", profilePath: "/a.jpg" };
	const personB = { id: 202, name: "Person B", profilePath: "/b.jpg" };
	const artworkA = resolvePersonFolderArtwork({ person: personA, runtimeResult: runtimeResult({ tmdbId: 31 }) });
	const artworkBRuntime = resolvePersonFolderArtwork({ person: personB, runtimeResult: runtimeResult({ tmdbId: 202 }) });
	const artworkBFallback = resolvePersonFolderArtwork({ person: personB, runtimeResult: runtimeResult({ tmdbId: 31 }) });
	const missingA = resolvePersonFolderArtwork({ person: { ...personA, profilePath: null }, runtimeResult: null });
	const reopenedA = resolvePersonFolderArtwork({ person: personA, runtimeResult: runtimeResult({ tmdbId: 202 }) });
	assert.equal(artworkA.source, "runtime");
	assert.equal(artworkBRuntime.source, "runtime");
	assert.match(artworkBRuntime.previewUrl, /\/people\/poster\/202\.webp/);
	assert.equal(artworkBFallback.source, "tmdb");
	assert.equal(artworkBFallback.previewUrl, buildTmdbProfileUrl("/b.jpg", "w500"));
	assert.equal(missingA.source, "emoji");
	assert.equal(reopenedA.source, "tmdb");
	assert.equal(reopenedA.previewUrl, buildTmdbProfileUrl("/a.jpg", "w500"));
	assert.notEqual(artworkA.previewUrl, artworkBRuntime.previewUrl);
});

test("existing custom artwork and presentation are preserved unless replacement is explicit", () => {
	const folder = { editable: { coverImageUrl: "https://example.test/custom.webp", hideTitle: true, tileShape: "LANDSCAPE", coverEmoji: "🎭" } };
	assert.equal(hasCustomHttpsFolderArtwork(folder), true);
	const result = resolvePersonFolderArtwork({
		person: { id: 31, profilePath: "/profile.jpg" },
		tileShape: "LANDSCAPE",
		runtimeResult: runtimeResult({ orientation: "landscape" }),
		existingFolder: folder,
	});
	assert.equal(result.source, "preserved");
	assert.deepEqual(result.folderEditable, {});
	assert.equal(result.previewUrl, "https://example.test/custom.webp");
});

test("runtime artwork requests use person identity and exact orientation only", async () => {
	const calls = [];
	const result = await requestPersonRuntimeArtwork({
		async resolve(options) { calls.push(options); return runtimeResult({ orientation: "poster" }); },
	}, { tmdbId: 31, tileShape: "POSTER" });
	assert.equal(result.status, "ready");
	assert.deepEqual(calls, [{ entityType: "person", tmdbId: 31, orientation: "poster" }]);
	assert.equal(await requestPersonRuntimeArtwork({ resolve() { throw new Error("offline"); } }, { tmdbId: 31, tileShape: "POSTER" }), null);
	assert.equal(await requestPersonRuntimeArtwork({ resolve() {} }, { tmdbId: 31, tileShape: "SQUARE" }), null);
});

test("count state covers loading, ready positive, ready zero, failure, retry, stale, and refresh", () => {
	const checking = beginPersonCountCheck(INITIAL_PERSON_COUNT_STATE);
	assert.equal(personCountDisplayState(checking, "actingMovies").status, "checking");
	const ready = completePersonCountCheck({ actingMovies: 2, actingSeries: 0, directingMovies: 1, directingSeries: 0 }, 1000);
	assert.equal(personCountDisplayState(ready, "actingMovies").status, "ready-positive");
	assert.equal(personCountDisplayState(ready, "actingSeries").status, "ready-zero");
	const stale = markPersonCountsStale(ready, 1000 + 5 * 60 * 1000);
	assert.equal(stale.status, "stale");
	assert.equal(beginPersonCountCheck(stale).counts.actingMovies, 2);
	const failed = failPersonCountCheck(stale, { message: "Offline", retryable: true });
	assert.equal(failed.status, "failed");
	assert.equal(failed.counts.actingMovies, 2);
	assert.equal(completePersonCountCheck(failed.counts, 2000).status, "ready");
});

test("person provider preserves search order, sends include_adult=false, and appends combined credits", async () => {
	const urls = [];
	const provider = createTmdbPersonProvider({
		baseUrl: "https://worker.example",
		fetchImpl: async (url) => {
			urls.push(new URL(url));
			return new Response(JSON.stringify(urls.length === 1 ? searchFixture : detailsFixture), {
				status: 200, headers: { "Content-Type": "application/json" },
			});
		},
	});
	const search = await provider.searchPeople("Alex", { page: 1 });
	const details = await provider.getPerson(31);
	assert.deepEqual(search.data.results.map((person) => person.id), [101, 202, 303]);
	assert.equal(details.data.counts.actingMovies, 1);
	assert.equal(urls[0].pathname, "/3/search/person");
	assert.equal(urls[0].searchParams.get("include_adult"), "false");
	assert.equal(urls[1].pathname, "/3/person/31");
	assert.equal(urls[1].searchParams.get("append_to_response"), "combined_credits");
});

test("serialized People output is canonical, projection-free, and stable through a second cycle", () => {
	const controller = createController();
	const collectionInternalId = createCollection(controller);
	const result = createPeopleFolderBatch(controller, {
		collectionInternalId,
		people: [{
			person: { id: 31, name: "Tom Hanks" },
			folderEditable: { title: "Tom Hanks", tileShape: "POSTER", hideTitle: false, coverImageUrl: "https://image.tmdb.org/t/p/w500/profile.jpg" },
			drafts: canonicalDrafts(),
		}],
	});
	assert.equal(result.ok, true);
	const first = controller.serializeProject();
	assert.equal(first.ok, true);
	assert.equal(validateNuvioContract(first.value, { mode: "canonical-builder-output" }).valid, true);
	assert.deepEqual(first.value[0].folders[0].catalogSources, []);
	assert.equal(JSON.stringify(first.value).includes("internalId"), false);
	assert.equal(JSON.stringify(first.value).includes("count"), false);
	assert.equal(JSON.stringify(first.value).includes('"BOTH"'), false);
	assert.deepEqual(first.value[0].folders[0].sources.map((source) => source.title), ["Movie Credits", "Series Credits", "Directed Movies", "Directed Series"]);
	const secondController = createController();
	assert.equal(secondController.importValue(first.value).ok, true);
	assert.deepEqual(secondController.serializeProject().value, first.value);
});
