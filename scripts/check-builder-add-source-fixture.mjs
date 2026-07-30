import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createBuilderController } from "../builder/src/application/index.js";
import {
	buildMovieFranchiseSourceDraft,
	createMovieFranchiseSource,
} from "../builder/src/source-add/index.js";
import {
	createDraftCollection,
	createDraftFolder,
} from "../builder/src/ui/draft-actions.js";
import { validateNuvioContract } from "../tests/helpers/nuvio-contract-validator.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDirectory = path.join(
	rootDir,
	"manual-tests",
	"nuvio-clients",
	"issue-65-builder-add-source",
);
const fixturePath = path.join(
	evidenceDirectory,
	"builder-generated-tmdb-collection.json",
);
const desktopExportPath = path.join(
	evidenceDirectory,
	"nuvio-desktop-immediate-export.json",
);
const writeMode = process.argv.includes("--write");

function countingFactory(prefix) {
	let count = 0;
	return () => `${prefix}-${++count}`;
}

function generateFixture() {
	const controller = createBuilderController({
		idFactory: countingFactory("issue-65-internal"),
		nuvioIdFactory: countingFactory("issue-65-nuvio"),
		initialProjectTitle: "Issue 65 source review",
	});

	const collection = createDraftCollection(controller);
	assert.equal(collection.ok, true);
	assert.equal(controller.updateNode(collection.createdInternalId, {
		title: "Issue 65 TMDB Franchise Review",
	}).ok, true);

	const folder = createDraftFolder(controller, collection.createdInternalId);
	assert.equal(folder.ok, true);
	assert.equal(controller.updateNode(folder.createdInternalId, {
		title: "Movie Franchises",
	}).ok, true);
	assert.equal(controller.selectNode(folder.createdInternalId).ok, true);

	const draft = buildMovieFranchiseSourceDraft({
		id: 1241,
		name: "Harry Potter Collection",
		overview: "",
		posterPath: null,
		movieCount: null,
	});
	assert.equal(draft.ok, true);

	const created = createMovieFranchiseSource(controller, {
		folderInternalId: folder.createdInternalId,
		draft: draft.draft,
	});
	assert.equal(created.ok, true);

	const serialized = controller.serializeProject();
	assert.equal(serialized.ok, true);
	assert.equal(validateNuvioContract(serialized.value, {
		mode: "canonical-builder-output",
	}).valid, true);
	return serialized.value;
}

const fixture = generateFixture();
const fixtureText = `${JSON.stringify(fixture, null, 2)}\n`;

if (writeMode) {
	fs.mkdirSync(evidenceDirectory, { recursive: true });
	fs.writeFileSync(fixturePath, fixtureText, "utf8");
	console.log(
		"Generated the sanitized issue #65 TMDB COLLECTION review fixture through production Builder APIs.",
	);
} else {
	assert.equal(
		fs.readFileSync(fixturePath, "utf8"),
		fixtureText,
		"The issue #65 review fixture is stale. Run this script with --write.",
	);
	console.log(
		"Sanitized issue #65 TMDB COLLECTION review fixture matches production Builder output.",
	);
}

const outputSource = fixture[0].folders[0].sources[0];
assert.deepEqual(outputSource, {
	title: "Harry Potter Collection",
	sortBy: "original",
	tmdbId: 1241,
	filters: {},
	provider: "tmdb",
	mediaType: "MOVIE",
	tmdbSourceType: "COLLECTION",
});
assert.deepEqual(fixture[0].folders[0].catalogSources, []);
assert.equal(JSON.stringify(fixture).includes("internalId"), false);
assert.equal(JSON.stringify(fixture).includes("rawImported"), false);

const desktopExport = JSON.parse(fs.readFileSync(desktopExportPath, "utf8"));
const desktopFolder = desktopExport[0]?.folders?.[0];
const desktopSource = desktopFolder?.sources?.[0];
assert.deepEqual({
	provider: desktopSource?.provider,
	tmdbSourceType: desktopSource?.tmdbSourceType,
	tmdbId: desktopSource?.tmdbId,
	mediaType: desktopSource?.mediaType,
	sortBy: desktopSource?.sortBy,
	title: desktopSource?.title,
}, {
	provider: "tmdb",
	tmdbSourceType: "COLLECTION",
	tmdbId: 1241,
	mediaType: "MOVIE",
	sortBy: "original",
	title: "Harry Potter Collection",
});
assert.deepEqual(desktopFolder?.catalogSources, []);
assert.equal(desktopSource?.addonId, null);
assert.equal(desktopSource?.catalogId, null);
assert.equal(desktopSource?.type, null);
assert.equal(desktopSource?.genre, null);
assert.equal(
	Object.values(desktopSource?.filters ?? {}).every((value) => value === null),
	true,
);
console.log(
	"Owner-supplied Nuvio Desktop immediate export preserves issue #65 source identity and records null/default expansion.",
);
