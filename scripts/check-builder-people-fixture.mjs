import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createBuilderController } from "../builder/src/application/index.js";
import {
	buildPeopleSourceDrafts,
	createPeopleFolderBatch,
	resolvePersonFolderArtwork,
} from "../builder/src/source-add/index.js";
import { validateNuvioContract } from "../tests/helpers/nuvio-contract-validator.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDirectory = path.join(rootDir, "manual-tests", "nuvio-clients", "issue-74-builder-add-people");
const fixturePath = path.join(evidenceDirectory, "builder-generated-people-sources.json");
const desktopExportPath = path.join(evidenceDirectory, "results", "nuvio-desktop-immediate-export.json");
const writeMode = process.argv.includes("--write");
const publishedPosterArtwork = Object.freeze({
	31: Object.freeze({
		status: "ready",
		entityType: "person",
		tmdbId: 31,
		orientation: "poster",
		sha256: "38f6b5d3b64caa6615b6d645855ec37ca9d01ca9e54d1af8104dd67f0ebf098d",
		fallbackUsed: false,
		assetUrl: "https://raw.githubusercontent.com/davecollections/nuvio-assets/main/assets/collection_covers/people/poster/31.webp?v=38f6b5d3b64c",
	}),
	488: Object.freeze({
		status: "ready",
		entityType: "person",
		tmdbId: 488,
		orientation: "poster",
		sha256: "79cfdd4be842cd965314b039817ed3ffe5ae41722bd8c47a70773baaecb4ddf0",
		fallbackUsed: false,
		assetUrl: "https://raw.githubusercontent.com/davecollections/nuvio-assets/main/assets/collection_covers/people/poster/488.webp?v=79cfdd4be842",
	}),
});

function countingFactory(prefix) {
	let count = 0;
	return () => `${prefix}-${++count}`;
}

function generateFixture() {
	const controller = createBuilderController({
		idFactory: countingFactory("issue-74-internal"),
		nuvioIdFactory: countingFactory("issue-74-nuvio"),
		initialProjectTitle: "Issue 74 People review",
	});
	const collection = controller.createCollection({ editable: { title: "Issue 74 People Review" } });
	assert.equal(collection.ok, true);
	assert.equal(controller.selectNode(collection.createdInternalId).ok, true);

	const people = [
		{ id: 31, name: "Tom Hanks", combinations: ["acting-movies", "acting-series"] },
		{ id: 488, name: "Steven Spielberg", combinations: ["directing-movies", "directing-series"] },
	].map((entry) => {
		const draftResult = buildPeopleSourceDrafts(entry, {
			combinations: entry.combinations,
		});
		assert.equal(draftResult.ok, true);
		const artwork = resolvePersonFolderArtwork({
			person: entry,
			tileShape: "POSTER",
			runtimeResult: publishedPosterArtwork[entry.id],
		});
		assert.equal(artwork.source, "runtime");
		return {
			person: entry,
			drafts: draftResult.drafts,
			folderEditable: {
				title: entry.name,
				tileShape: "POSTER",
				...artwork.folderEditable,
			},
		};
	});
	const created = createPeopleFolderBatch(controller, {
		collectionInternalId: collection.createdInternalId,
		people,
	});
	assert.equal(created.ok, true);
	assert.equal(created.addedFolderCount, 2);
	assert.equal(created.addedSourceCount, 4);

	const serialized = controller.serializeProject();
	assert.equal(serialized.ok, true);
	assert.equal(validateNuvioContract(serialized.value, { mode: "canonical-builder-output" }).valid, true);
	return serialized.value;
}

function materialIdentity(source) {
	return {
		provider: source?.provider,
		tmdbSourceType: source?.tmdbSourceType,
		tmdbId: source?.tmdbId,
		mediaType: source?.mediaType,
		sortBy: source?.sortBy,
	};
}

const expectedIdentities = [
	{ provider: "tmdb", tmdbSourceType: "PERSON", tmdbId: 31, mediaType: "MOVIE", sortBy: "popularity.desc" },
	{ provider: "tmdb", tmdbSourceType: "PERSON", tmdbId: 31, mediaType: "TV", sortBy: "popularity.desc" },
	{ provider: "tmdb", tmdbSourceType: "DIRECTOR", tmdbId: 488, mediaType: "MOVIE", sortBy: "popularity.desc" },
	{ provider: "tmdb", tmdbSourceType: "DIRECTOR", tmdbId: 488, mediaType: "TV", sortBy: "popularity.desc" },
];

const fixture = generateFixture();
const fixtureText = `${JSON.stringify(fixture, null, 2)}\n`;
if (writeMode) {
	fs.mkdirSync(evidenceDirectory, { recursive: true });
	fs.writeFileSync(fixturePath, fixtureText, "utf8");
	console.log("Generated the sanitized issue #74 People review fixture through production Builder APIs.");
} else {
	assert.equal(
		fs.readFileSync(fixturePath, "utf8"),
		fixtureText,
		"The issue #74 People review fixture is stale. Run this script with --write.",
	);
	console.log("Sanitized issue #74 People review fixture matches production Builder output.");
}

assert.deepEqual(
	fixture.flatMap((collection) => collection.folders.flatMap((folder) => folder.sources.map(materialIdentity))),
	expectedIdentities,
);
assert.deepEqual(fixture[0].folders.map((folder) => folder.title), ["Tom Hanks", "Steven Spielberg"]);
assert.deepEqual(
	fixture[0].folders.map((folder) => folder.sources.map((source) => source.title)),
	[["Movie Credits", "Series Credits"], ["Directed Movies", "Directed Series"]],
);
assert.deepEqual(
	fixture[0].folders.map((folder) => ({ coverImageUrl: folder.coverImageUrl, hideTitle: folder.hideTitle })),
	[
		{ coverImageUrl: publishedPosterArtwork[31].assetUrl, hideTitle: true },
		{ coverImageUrl: publishedPosterArtwork[488].assetUrl, hideTitle: true },
	],
);
assert.equal(fixture[0].folders.every((folder) => folder.catalogSources.length === 0), true);
assert.equal(JSON.stringify(fixture).includes("internalId"), false);
assert.equal(JSON.stringify(fixture).includes('"BOTH"'), false);

if (fs.existsSync(desktopExportPath)) {
	const desktopExport = JSON.parse(fs.readFileSync(desktopExportPath, "utf8"));
	const folders = desktopExport[0]?.folders;
	assert.equal(Array.isArray(folders), true, "The Desktop export must contain the expected collection folders.");
	assert.deepEqual(folders.map((folder) => folder.title), ["Tom Hanks", "Steven Spielberg"]);
	assert.deepEqual(
		folders.flatMap((folder) => (folder.sources ?? []).map(materialIdentity)),
		expectedIdentities,
	);
	assert.deepEqual(
		folders.map((folder) => (folder.sources ?? []).map((source) => source.title)),
		[["Movie Credits", "Series Credits"], ["Directed Movies", "Directed Series"]],
	);
	assert.deepEqual(
		folders.map((folder) => ({ coverImageUrl: folder.coverImageUrl, hideTitle: folder.hideTitle })),
		[
			{ coverImageUrl: publishedPosterArtwork[31].assetUrl, hideTitle: true },
			{ coverImageUrl: publishedPosterArtwork[488].assetUrl, hideTitle: true },
		],
	);
	assert.equal(folders.every((folder) => (folder.catalogSources ?? []).length === 0), true);
	console.log("Owner-supplied Nuvio Desktop export preserves issue #74 grouping, distinct titles, source identities, and curated artwork.");
} else {
	console.log("Final regenerated fixture remains owner re-import pending; no curated-artwork Desktop result is claimed.");
}
