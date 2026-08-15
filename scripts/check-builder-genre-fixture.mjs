import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createBuilderController } from "../builder/src/application/index.js";
import {
	buildGenreSourceDrafts,
	createGenreAdvancedState,
	createGenreSourceBundle,
} from "../builder/src/source-add/index.js";
import { validateNuvioContract } from "../tests/helpers/nuvio-contract-validator.mjs";
import { normalizeTextLineEndings } from "./lib/text-comparison.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDirectory = path.join(rootDir, "manual-tests", "nuvio-clients", "issue-110-builder-genres");
const fixturePath = path.join(evidenceDirectory, "builder-generated-genre-sources.json");
const desktopExportPath = path.join(evidenceDirectory, "results", "nuvio-desktop-immediate-export.json");
const writeMode = process.argv.includes("--write");

function countingFactory(prefix) {
	let count = 0;
	return () => `${prefix}-${++count}`;
}

function fixtureAdvancedOptions() {
	return createGenreAdvancedState({
		yearFrom: "2001",
		yearTo: "2024",
		minimumRating: "6.5",
		maximumRating: "9.2",
		minimumVotes: "250",
		originalLanguage: "en",
		originCountry: "AU",
		exclusionsByGenre: { Comedy: ["Documentary", "Horror", "Kids"] },
	});
}

function generateFixture() {
	const controller = createBuilderController({
		idFactory: countingFactory("issue-110-internal"),
		nuvioIdFactory: countingFactory("issue-110-nuvio"),
		initialProjectTitle: "Issue 110 Genre review",
	});
	const collection = controller.createCollection({ editable: { title: "Issue 110 Genre Review" } });
	assert.equal(collection.ok, true);
	const folder = controller.createFolder(collection.createdInternalId, { editable: { title: "Genre Sources" } });
	assert.equal(folder.ok, true);
	assert.equal(controller.selectNode(folder.createdInternalId).ok, true);
	const genres = ["Comedy", "Action & Adventure"];
	const advanced = fixtureAdvancedOptions();
	const built = buildGenreSourceDrafts(genres, { sortOptionId: "top-rated", advanced });
	assert.equal(built.ok, true);
	const created = createGenreSourceBundle(controller, {
		folderInternalId: folder.createdInternalId,
		genres,
		sortOptionId: "top-rated",
		advanced,
		drafts: built.drafts,
	});
	assert.equal(created.ok, true);
	assert.equal(created.addedSourceCount, 3);
	const serialized = controller.serializeProject();
	assert.equal(serialized.ok, true);
	assert.equal(validateNuvioContract(serialized.value, { mode: "canonical-builder-output" }).valid, true);
	return serialized.value;
}

function materialIdentity(source) {
	return {
		title: source?.title,
		provider: source?.provider,
		tmdbSourceType: source?.tmdbSourceType,
		tmdbId: source?.tmdbId,
		mediaType: source?.mediaType,
		sortBy: source?.sortBy,
		filters: source?.filters,
	};
}

const commonFilters = {
	releaseDateGte: "2001-01-01",
	releaseDateLte: "2024-12-31",
	voteAverageGte: 6.5,
	voteAverageLte: 9.2,
	voteCountGte: 250,
	withOriginalLanguage: "en",
	withOriginCountry: "AU",
};

const expectedIdentities = [
	{ title: "Comedy Movies", provider: "tmdb", tmdbSourceType: "DISCOVER", tmdbId: null, mediaType: "MOVIE", sortBy: "vote_average.desc", filters: { withGenres: "35", ...commonFilters, withoutGenres: "99,27" } },
	{ title: "Comedy Series", provider: "tmdb", tmdbSourceType: "DISCOVER", tmdbId: null, mediaType: "TV", sortBy: "vote_average.desc", filters: { withGenres: "35", ...commonFilters, withoutGenres: "99,10762" } },
	{ title: "Action & Adventure Series", provider: "tmdb", tmdbSourceType: "DISCOVER", tmdbId: null, mediaType: "TV", sortBy: "vote_average.desc", filters: { withGenres: "10759", ...commonFilters } },
];

const fixture = generateFixture();
const fixtureText = `${JSON.stringify(fixture, null, 2)}\n`;
if (writeMode) {
	fs.mkdirSync(evidenceDirectory, { recursive: true });
	fs.writeFileSync(fixturePath, fixtureText, "utf8");
	console.log("Generated the sanitized issue #110 existing-folder Genre fixture through production Builder APIs.");
} else {
	assert.equal(
		normalizeTextLineEndings(fs.readFileSync(fixturePath, "utf8")),
		normalizeTextLineEndings(fixtureText),
		"The issue #110 Genre review fixture is stale. Run this script with --write.",
	);
	console.log("Sanitized issue #110 Genre review fixture matches production Builder output.");
}

const folders = fixture[0].folders;
assert.deepEqual(folders.map((folder) => folder.title), ["Genre Sources"]);
assert.deepEqual(folders[0].sources.map(materialIdentity), expectedIdentities);
assert.equal(folders[0].catalogSources.length, 0);
assert.equal(JSON.stringify(fixture).includes("internalId"), false);
assert.equal(JSON.stringify(fixture).includes('"BOTH"'), false);
assert.equal(JSON.stringify(fixture).includes("Musicals"), false);

if (fs.existsSync(desktopExportPath)) {
	const desktopExport = JSON.parse(fs.readFileSync(desktopExportPath, "utf8"));
	const exportedFolders = desktopExport[0]?.folders;
	assert.equal(Array.isArray(exportedFolders), true, "The Desktop export must contain the expected Genre folder.");
	assert.deepEqual(exportedFolders.map((folder) => folder.title), ["Genre Sources"]);
	assert.deepEqual((exportedFolders[0]?.sources ?? []).map(materialIdentity), expectedIdentities);
	assert.equal((exportedFolders[0]?.catalogSources ?? []).length, 0);
	console.log("Owner-supplied Nuvio Desktop export preserves issue #110 Genre identities, advanced filters, titles, and order.");
} else {
	console.log("Current-Nuvio execution remains owner pending; no client result is claimed.");
}
