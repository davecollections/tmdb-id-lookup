import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { NATIVE_TMDB_SOURCE_TYPES, validateNuvioContract } from "./helpers/nuvio-contract-validator.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(rootDir, "tests", "fixtures", "nuvio");
const manifest = JSON.parse(fs.readFileSync(path.join(fixtureRoot, "fixture-manifest.json"), "utf8"));

function loadFixture(entry) {
	return JSON.parse(fs.readFileSync(path.join(fixtureRoot, entry.file), "utf8"));
}

function sourceIdentity(source) {
	if (String(source.provider).toLowerCase() === "tmdb") {
		return `tmdb:${source.tmdbSourceType}:${source.tmdbId ?? ""}:${source.mediaType ?? ""}`;
	}
	return `${source.provider ?? "addon"}:${source.addonId ?? ""}:${source.type ?? ""}:${source.catalogId ?? ""}:${source.genre ?? ""}`;
}

function allFolders(collections) {
	return collections.flatMap((collection) => collection.folders);
}

test("fixture manifest records classification and provenance separately from Nuvio JSON", () => {
	assert.equal(manifest.version, 1);
	assert.ok(manifest.fixtures.length >= 8);

	for (const entry of manifest.fixtures) {
		assert.ok(entry.classification);
		assert.ok(entry.evidenceLevel);
		assert.ok(entry.provenance);
		assert.equal(typeof entry.expected.valid, "boolean");

		const fixtureText = fs.readFileSync(path.join(fixtureRoot, entry.file), "utf8");
		for (const metadataKey of ["evidenceLevel", "provenance", "classification", "expectedValidation"]) {
			assert.equal(fixtureText.includes(`"${metadataKey}"`), false, `${entry.file} contains test metadata`);
		}
	}
});

test("canonical and import-preservation fixtures validate without mutation", () => {
	for (const entry of manifest.fixtures.filter((fixture) => fixture.expected.valid)) {
		const fixture = loadFixture(entry);
		const original = structuredClone(fixture);
		const result = validateNuvioContract(fixture, { mode: entry.classification });

		assert.deepEqual(result.errors, [], entry.id);
		assert.equal(result.valid, true, entry.id);
		assert.deepEqual(fixture, original, `${entry.id} was mutated during validation`);
	}
});

test("invalid fixtures fail with their exact stable error codes", () => {
	for (const entry of manifest.fixtures.filter((fixture) => !fixture.expected.valid)) {
		const result = validateNuvioContract(loadFixture(entry), { mode: "canonical-builder-output" });
		assert.equal(result.valid, false, entry.id);
		assert.deepEqual(
			result.errors.map((error) => error.code),
			entry.expected.errorCodes,
			entry.id,
		);
	}
});

test("positive fixtures cover every confirmed native TMDB source type", () => {
	const coveredTypes = new Set();
	for (const entry of manifest.fixtures.filter((fixture) => fixture.expected.valid)) {
		for (const folder of allFolders(loadFixture(entry))) {
			for (const source of folder.sources) {
				if (String(source.provider).toLowerCase() === "tmdb") {
					coveredTypes.add(source.tmdbSourceType);
				}
			}
		}
	}

	assert.deepEqual([...coveredTypes].sort(), [...NATIVE_TMDB_SOURCE_TYPES].sort());
});

test("Shark Movies retains the manually confirmed native Discover values", () => {
	const entry = manifest.fixtures.find((fixture) => fixture.id === "valid-shark-movies-discover");
	const source = loadFixture(entry)[0].folders[0].sources[0];

	assert.equal(source.provider, "tmdb");
	assert.equal(source.tmdbSourceType, "DISCOVER");
	assert.equal(source.mediaType, "MOVIE");
	assert.equal(source.sortBy, "popularity.desc");
	assert.equal(source.filters.withKeywords, "15097");
});

test("addon compatibility projections contain only matching addon-backed sources", () => {
	for (const entry of manifest.fixtures.filter((fixture) => fixture.expected.valid && fixture.coverage.addonBacked)) {
		for (const folder of allFolders(loadFixture(entry))) {
			const addonSourceKeys = new Set(
				folder.sources
					.filter((source) => String(source.provider).toLowerCase() !== "tmdb")
					.map((source) => sourceIdentity(source)),
			);

			for (const projection of folder.catalogSources) {
				const projectionIdentity = sourceIdentity({ provider: "addon", ...projection });
				assert.ok(addonSourceKeys.has(projectionIdentity), `${entry.id} has an unmatched catalog projection`);
			}
		}
	}
});

test("fixture order expectations preserve folder and source order", () => {
	for (const entry of manifest.fixtures.filter((fixture) => fixture.expected.valid)) {
		const folders = allFolders(loadFixture(entry));
		assert.deepEqual(
			folders.map((folder) => folder.id),
			entry.expectedOrder.folderIds,
			`${entry.id} folder order`,
		);

		for (const folder of folders) {
			assert.deepEqual(
				folder.sources.map(sourceIdentity),
				entry.expectedOrder.sourcesByFolder[folder.id],
				`${entry.id} source order in ${folder.id}`,
			);
		}
	}
});

test("opaque imported community data remains recognizably untouched", () => {
	const entry = manifest.fixtures.find((fixture) => fixture.id === "valid-opaque-community-import");
	const fixture = loadFixture(entry);
	const collection = fixture[0];
	const folder = collection.folders[0];
	const source = folder.sources[0];

	assert.deepEqual(collection.communityMetadata, { owner: "fixture-sentinel", revision: 7 });
	assert.deepEqual(folder.communityLayout, { density: "compact", accent: "violet" });
	assert.deepEqual(source.communityOptions, { quality: "curated", includeUnreleased: false });
	assert.equal(source.unknownBoolean, true);
	assert.equal(source.provider, "community");
	assert.equal(source.tmdbSourceType, undefined);
	assert.equal(validateNuvioContract(fixture, { mode: "import-preservation" }).valid, true);
});
