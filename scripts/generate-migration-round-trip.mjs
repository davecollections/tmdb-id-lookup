import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { importNuvioCollections } from "../builder/src/import/index.js";
import { migrateLegacyAddonProjections } from "../builder/src/migrate/index.js";
import { serializeNuvioProject } from "../builder/src/serialize/index.js";
import { validateNuvioContract } from "../tests/helpers/nuvio-contract-validator.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceFixturePath = "tests/fixtures/nuvio/compatibility/legacy-projection-only-input.json";
const generatorPath = "scripts/generate-migration-round-trip.mjs";
const outputDirectory = path.join(
	rootDir,
	"manual-tests",
	"nuvio-desktop",
	"addon-projection-migration",
);
const inputOutputPath = path.join(outputDirectory, "builder-migrated-input.json");
const reportOutputPath = path.join(outputDirectory, "generation-report.json");
const checkMode = process.argv.slice(2).includes("--check");

if (process.argv.slice(2).some((argument) => argument !== "--check")) {
	throw new Error("Usage: node scripts/generate-migration-round-trip.mjs [--check]");
}

function sequenceIdFactory(prefix) {
	let index = 0;
	return () => `${prefix}-${++index}`;
}

function jsonText(value) {
	return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(text) {
	return createHash("sha256").update(text, "utf8").digest("hex");
}

function flattenSources(collection) {
	return collection.folders.flatMap((folder) => folder.sources);
}

function flattenProjections(collection) {
	return collection.folders.flatMap((folder) => folder.catalogSources);
}

function collectHttpUrls(value, urls = []) {
	if (typeof value === "string" && /^https?:\/\//u.test(value)) {
		urls.push(value);
		return urls;
	}
	if (Array.isArray(value)) {
		for (const entry of value) {
			collectHttpUrls(entry, urls);
		}
		return urls;
	}
	if (value !== null && typeof value === "object") {
		for (const entry of Object.values(value)) {
			collectHttpUrls(entry, urls);
		}
	}
	return urls;
}

function buildArtifacts() {
	const fixture = JSON.parse(fs.readFileSync(path.join(rootDir, sourceFixturePath), "utf8"));
	const imported = importNuvioCollections(fixture, {
		idFactory: sequenceIdFactory("round-trip-import"),
	});
	assert.equal(imported.ok, true, JSON.stringify(imported.errors));
	assert.equal(imported.project.collections.length, 1);
	assert.equal(imported.project.collections[0].folders.length, 3);
	assert.equal(flattenSources(imported.project.collections[0]).length, 0);

	const beforeMigration = serializeNuvioProject(imported.project);
	assert.equal(beforeMigration.ok, false);
	assert.ok(beforeMigration.errors.length > 0);
	assert.ok(beforeMigration.errors.every((error) => (
		error.code === "LEGACY_CATALOG_SOURCES_ONLY_UNRESOLVED"
	)));

	const migrated = migrateLegacyAddonProjections(imported.project, {
		idFactory: sequenceIdFactory("round-trip-migrated-source"),
	});
	assert.equal(migrated.ok, true, JSON.stringify(migrated.errors));
	assert.deepEqual(migrated.changes, { foldersMigrated: 3, sourcesCreated: 3 });
	assert.equal(migrated.warnings.length, 3);
	assert.ok(migrated.warnings.every((warning) => (
		warning.code === "LEGACY_ADDON_PROJECTIONS_MIGRATED"
	)));
	assert.deepEqual(migrated.warnings.map((warning) => warning.path), [
		"$[0].folders[0]",
		"$[0].folders[1]",
		"$[0].folders[2]",
	]);

	const migratedCollection = migrated.project.collections[0];
	const migratedSources = flattenSources(migratedCollection);
	assert.equal(migratedCollection.folders.length, 3);
	assert.deepEqual(migratedCollection.folders.map((folder) => folder.sources.length), [1, 1, 1]);
	assert.equal(migratedSources.length, 3);
	assert.deepEqual(migratedSources.map((source) => source.editable.type), ["movie", "series", "anime"]);
	assert.deepEqual(migratedSources.map((source) => source.editable.genre), [null, "Action", null]);

	for (const source of migratedSources) {
		assert.equal(source.category, "addon");
		assert.equal(source.editable.provider, "addon");
		assert.equal(Object.hasOwn(source, "rawImported"), false);
		assert.deepEqual(Object.keys(source).sort(), ["category", "editable", "internalId", "nodeType"]);
		assert.deepEqual(
			Object.keys(source.editable).sort(),
			["addonId", "catalogId", "genre", "provider", "type"],
		);
	}

	const serialized = serializeNuvioProject(migrated.project);
	assert.equal(serialized.ok, true, JSON.stringify(serialized.errors));
	assert.deepEqual(serialized.errors, []);
	assert.ok(serialized.warnings.every((warning) => (
		warning.code !== "UNMATCHED_CATALOG_SOURCE_REMOVED"
	)));

	assert.equal(serialized.value.length, 1);
	const collection = serialized.value[0];
	const sources = flattenSources(collection);
	const projections = flattenProjections(collection);
	assert.equal(collection.folders.length, 3);
	assert.equal(sources.length, 3);
	assert.equal(projections.length, 3);
	assert.deepEqual(sources.map((source) => source.type), ["movie", "series", "anime"]);
	assert.deepEqual(projections.map((projection) => projection.type), ["movie", "series", "anime"]);
	assert.deepEqual(sources.map((source) => source.genre), [null, "Action", null]);
	assert.deepEqual(projections.map((projection) => projection.genre), [null, "Action", null]);
	assert.deepEqual(
		sources.map(({ addonId, type, catalogId, genre }) => ({ addonId, type, catalogId, genre })),
		projections.map(({ addonId, type, catalogId, genre }) => ({ addonId, type, catalogId, genre })),
	);
	assert.deepEqual(projections[0].unknownProjectionSentinel, { preserve: true });
	assert.equal(collection.folders[0].coverImageUrl, "https://example.invalid/legacy-movie.jpg");
	assert.equal(collection.folders[1].heroBackdropUrl, "https://example.invalid/legacy-series.jpg");
	assert.equal(collection.folders[2].titleLogoUrl, "https://example.invalid/legacy-anime-logo.png");
	assert.ok(collectHttpUrls(serialized.value).every((url) => url.startsWith("https://example.invalid/")));

	const canonicalValidation = validateNuvioContract(serialized.value, {
		mode: "canonical-builder-output",
	});
	assert.equal(canonicalValidation.valid, true, JSON.stringify(canonicalValidation.errors));

	const inputText = jsonText(serialized.value);
	const report = {
		schemaVersion: 1,
		purpose: "Provide a reproducible sanitised builder-generated input for a controlled Nuvio Desktop migration round trip.",
		sourceFixture: sourceFixturePath,
		generator: generatorPath,
		productionApisUsed: [
			"importNuvioCollections",
			"migrateLegacyAddonProjections",
			"serializeNuvioProject",
		],
		counts: {
			collections: 1,
			folders: 3,
			sources: 3,
			catalogSources: 3,
		},
		sourceTypes: ["movie", "series", "anime"],
		genres: [null, "Action", null],
		migrationChanges: {
			foldersMigrated: 3,
			sourcesCreated: 3,
		},
		canonicalValidation: true,
		networkRequired: false,
		builderMigratedInputSha256: sha256(inputText),
	};

	return { inputText, reportText: jsonText(report) };
}

function assertCommittedFileMatches(filePath, expectedText) {
	let actualText;
	try {
		actualText = fs.readFileSync(filePath, "utf8");
	} catch {
		throw new Error(`Missing generated file: ${path.relative(rootDir, filePath)}`);
	}
	assert.equal(actualText, expectedText, `Generated file is stale: ${path.relative(rootDir, filePath)}`);
}

const artifacts = buildArtifacts();
if (checkMode) {
	assertCommittedFileMatches(inputOutputPath, artifacts.inputText);
	assertCommittedFileMatches(reportOutputPath, artifacts.reportText);
	console.log("Migration round-trip artifacts are reproducible and current.");
} else {
	fs.mkdirSync(outputDirectory, { recursive: true });
	fs.writeFileSync(inputOutputPath, artifacts.inputText, "utf8");
	fs.writeFileSync(reportOutputPath, artifacts.reportText, "utf8");
	console.log("Generated sanitised Nuvio Desktop migration round-trip artifacts.");
}
