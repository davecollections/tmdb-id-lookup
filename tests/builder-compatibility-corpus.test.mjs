import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createBuilderController } from "../builder/src/application/index.js";
import {
	checkInternalIdUniqueness,
	SOURCE_CATEGORIES,
	updateEditableValues,
} from "../builder/src/domain/index.js";
import { importNuvioCollections } from "../builder/src/import/index.js";
import { migrateLegacyAddonProjections } from "../builder/src/migrate/index.js";
import { serializeNuvioProject } from "../builder/src/serialize/index.js";
import { isPagesPublicFilePath } from "../scripts/pages-public-paths.mjs";
import {
	NATIVE_TMDB_SOURCE_TYPES,
	validateNuvioContract,
} from "./helpers/nuvio-contract-validator.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(rootDir, "tests", "fixtures", "nuvio");
const corpusRoot = path.join(fixtureRoot, "v2-compatibility");
const manifestPath = path.join(corpusRoot, "manifest.json");
const manifest = readJson(manifestPath);
const allowedCategories = new Set(["canonical", "preservation", "identity", "migration", "invalid"]);
const allowedPipelines = new Set(["direct-importer", "builder-controller", "migration", "validation-only"]);
const allowedAssertionModes = new Set(["exact-json", "semantic-equality", "targeted"]);
const fieldPolicyKeys = [
	"builderOwnedOverlaid",
	"canonicalizedDefaulted",
	"copiedCanonicalData",
	"rawPreservedOnly",
	"removed",
];
const requiredMediaCombinations = [
	"LIST:MOVIE",
	"LIST:TV",
	"COLLECTION:MOVIE",
	"COMPANY:MOVIE",
	"NETWORK:TV",
	"DISCOVER:MOVIE",
	"DISCOVER:TV",
	"PERSON:MOVIE",
	"PERSON:TV",
	"DIRECTOR:MOVIE",
	"DIRECTOR:TV",
];
const requiredCoverageTags = [
	"all-seven-native-types",
	"evidence-backed-media",
	"addon-basic",
	"addon-genre",
	"addon-multiple",
	"addon-projection",
	"projection-order",
	"addon-metadata",
	"duplicate-projection-identity",
	"mixed-native-addon-opaque",
	"imported-trakt",
	"opaque-community",
	"multiple-collections",
	"multiple-folders",
	"multiple-sources",
	"presentation",
	"folder-artwork",
	"raw-only-collection-fields",
	"raw-only-source-fields",
	"unknown-collection",
	"unknown-folder",
	"unknown-source",
	"unknown-filter",
	"unknown-projection",
	"missing-null-empty-false-zero",
	"editable-over-raw",
	"discover-filter-replacement",
	"direct-import-ids",
	"controller-id-repair",
	"internal-id-uniqueness",
	"serializer-required-text",
	"source-removal",
	"ordering",
	"round-trip",
	"migration",
	"migration-idempotence",
	"invalid",
	"unsupported-direct-media",
	"native-projection-boundary",
	"addon-projection-boundary",
	"discover-reference",
	"migration-reference",
	"source-artwork-boundary",
];

function readJson(file) {
	return JSON.parse(fs.readFileSync(file, "utf8"));
}

function entryById(id) {
	const entry = manifest.entries.find((candidate) => candidate.id === id);
	assert.ok(entry, `Missing manifest entry: ${id}`);
	return entry;
}

function fixturePath(relativePath) {
	const resolved = path.resolve(fixtureRoot, ...relativePath.split("/"));
	assert.ok(
		resolved.startsWith(`${path.resolve(fixtureRoot)}${path.sep}`),
		`Fixture path escapes tests/fixtures/nuvio: ${relativePath}`,
	);
	return resolved;
}

function loadEntry(entry) {
	return readJson(fixturePath(entry.input));
}

function countingIdFactory(prefix = "internal") {
	let index = 0;
	return () => `${prefix}-${++index}`;
}

function sequenceIdFactory(...ids) {
	let index = 0;
	return () => {
		if (index >= ids.length) {
			throw new Error("Deterministic ID sequence exhausted.");
		}
		return ids[index++];
	};
}

function codes(diagnostics) {
	return diagnostics.map((diagnostic) => diagnostic.code);
}

function sourceIdentity(source) {
	const provider = typeof source.provider === "string"
		? source.provider.toLowerCase()
		: (source.addonId ? "addon" : "");
	if (provider === "tmdb") {
		return `tmdb:${source.tmdbSourceType ?? ""}:${source.tmdbId ?? ""}:${source.mediaType ?? ""}`;
	}
	if (provider === "addon") {
		return `addon:${source.addonId ?? ""}:${source.type ?? ""}:${source.catalogId ?? ""}:${source.genre ?? ""}`;
	}
	return `opaque:${source.provider ?? ""}:${source.type ?? ""}:${source.traktListId ?? source.catalogId ?? ""}:${source.title ?? ""}`;
}

function allFolders(collections) {
	return collections.flatMap((collection) => collection.folders);
}

function countsFor(collections) {
	const folders = allFolders(collections);
	return {
		collections: collections.length,
		folders: folders.length,
		sources: folders.reduce((total, folder) => total + (folder.sources ?? []).length, 0),
		projections: folders.reduce((total, folder) => total + (folder.catalogSources ?? []).length, 0),
	};
}

function assertValueContract(collections, entry, expectedCounts = entry.expectedCounts, expectedOrder = entry.expectedOrder) {
	assert.deepEqual(countsFor(collections), expectedCounts, `${entry.id} counts`);
	assert.deepEqual(
		collections.map((collection) => collection.id),
		expectedOrder.collections,
		`${entry.id} collection order`,
	);
	for (const collection of collections) {
		assert.deepEqual(
			collection.folders.map((folder) => folder.id),
			expectedOrder.foldersByCollection[collection.id],
			`${entry.id} folder order for ${collection.id}`,
		);
		for (const folder of collection.folders) {
			assert.deepEqual(
				(folder.sources ?? []).map(sourceIdentity),
				expectedOrder.sourcesByFolder[folder.id],
				`${entry.id} source order for ${folder.id}`,
			);
			assert.deepEqual(
				(folder.catalogSources ?? []).map(sourceIdentity),
				expectedOrder.projectionsByFolder[folder.id],
				`${entry.id} projection order for ${folder.id}`,
			);
		}
	}
}

function assertDiagnosticShape(diagnostic, label) {
	assert.deepEqual(Object.keys(diagnostic).sort(), ["code", "message", "path"], label);
	assert.equal(typeof diagnostic.code, "string", label);
	assert.equal(typeof diagnostic.path, "string", label);
	assert.equal(typeof diagnostic.message, "string", label);
}

function listFiles(directory) {
	return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const entryPath = path.join(directory, entry.name);
		return entry.isDirectory() ? listFiles(entryPath) : [entryPath];
	});
}

function relativeFromRoot(file) {
	return path.relative(rootDir, file).replaceAll("\\", "/");
}

function relativeFromFixtureRoot(file) {
	return path.relative(fixtureRoot, file).replaceAll("\\", "/");
}

test("manifest is deterministic complete and references every corpus fixture exactly once", () => {
	assert.equal(manifest.version, 1);
	assert.equal(manifest.issue, "https://github.com/davecollections/tmdb-id-lookup/issues/49");
	assert.ok(manifest.inventory);
	assert.equal(
		manifest.inventory.deferredBoundaries.sourceArtwork,
		"No confirmed source-artwork field exists in current repository or client evidence; no source artwork field is created or asserted.",
	);
	assert.ok(Array.isArray(manifest.entries));
	assert.ok(manifest.entries.length >= 8);

	const ids = new Set();
	const inputPaths = new Set();
	const referencedFixturePaths = new Set();
	const coverageTags = new Set();
	const representedNativeTypes = new Set();
	const representedMediaCombinations = new Set();
	const categories = new Set();

	for (const entry of manifest.entries) {
		assert.equal(typeof entry.id, "string");
		assert.equal(ids.has(entry.id), false, `Duplicate fixture ID: ${entry.id}`);
		ids.add(entry.id);

		assert.ok(allowedCategories.has(entry.category), `${entry.id} category`);
		assert.ok(allowedPipelines.has(entry.pipeline), `${entry.id} pipeline`);
		assert.ok(allowedAssertionModes.has(entry.assertionMode), `${entry.id} assertion mode`);
		assert.equal(typeof entry.purpose, "string", `${entry.id} purpose`);
		assert.ok(entry.purpose.length > 0, `${entry.id} purpose`);
		categories.add(entry.category);

		assert.equal(typeof entry.input, "string", `${entry.id} input`);
		assert.equal(inputPaths.has(entry.input), false, `Duplicate input path: ${entry.input}`);
		inputPaths.add(entry.input);
		referencedFixturePaths.add(entry.input);
		assert.ok(fs.statSync(fixturePath(entry.input), { throwIfNoEntry: false })?.isFile(), `${entry.id} input`);

		for (const key of ["sourceTypes", "mediaCombinations", "coverageTags", "evidenceReferences"]) {
			assert.ok(Array.isArray(entry[key]), `${entry.id} ${key}`);
		}
		for (const nativeType of entry.sourceTypes.filter((value) => NATIVE_TMDB_SOURCE_TYPES.has(value))) {
			representedNativeTypes.add(nativeType);
		}
		for (const mediaCombination of entry.mediaCombinations) {
			representedMediaCombinations.add(mediaCombination);
		}
		for (const tag of entry.coverageTags) {
			coverageTags.add(tag);
		}

		for (const countKey of ["collections", "folders", "sources", "projections"]) {
			assert.ok(Number.isInteger(entry.expectedCounts[countKey]), `${entry.id} expectedCounts.${countKey}`);
			assert.ok(entry.expectedCounts[countKey] >= 0, `${entry.id} expectedCounts.${countKey}`);
		}
		assert.deepEqual(
			Object.keys(entry.materialFieldPolicy).sort(),
			[...fieldPolicyKeys].sort(),
			`${entry.id} material field policy`,
		);
		for (const key of fieldPolicyKeys) {
			assert.ok(Array.isArray(entry.materialFieldPolicy[key]), `${entry.id} materialFieldPolicy.${key}`);
		}

		for (const key of ["importErrors", "importWarnings", "serializeErrors", "serializeWarnings", "validationErrors"]) {
			assert.ok(Array.isArray(entry.expectedDiagnostics[key]), `${entry.id} expectedDiagnostics.${key}`);
		}

		for (const reference of entry.evidenceReferences) {
			const evidencePath = path.resolve(rootDir, ...reference.split("/"));
			assert.ok(
				evidencePath.startsWith(`${path.resolve(rootDir)}${path.sep}`),
				`${entry.id} evidence escapes the repository`,
			);
			assert.ok(fs.existsSync(evidencePath), `${entry.id} missing evidence: ${reference}`);
		}
	}

	assert.deepEqual([...categories].sort(), [...allowedCategories].sort());
	assert.deepEqual(
		[...representedNativeTypes].sort(),
		[...NATIVE_TMDB_SOURCE_TYPES].sort(),
	);
	for (const requiredCombination of requiredMediaCombinations) {
		assert.ok(
			representedMediaCombinations.has(requiredCombination),
			`Missing evidence-backed media combination: ${requiredCombination}`,
		);
	}
	for (const requiredTag of requiredCoverageTags) {
		assert.ok(coverageTags.has(requiredTag), `Missing coverage tag: ${requiredTag}`);
	}

	const localJsonFiles = listFiles(corpusRoot)
		.filter((file) => file.endsWith(".json") && file !== manifestPath)
		.map(relativeFromFixtureRoot)
		.sort();
	const representedLocalJson = [...referencedFixturePaths]
		.filter((relativePath) => relativePath.startsWith("v2-compatibility/"))
		.sort();
	assert.deepEqual(representedLocalJson, localJsonFiles);
});

test("corpus files are synthetic secret-free offline inputs outside the Pages public contract", () => {
	const localFiles = listFiles(corpusRoot);
	const forbiddenSecretPattern = /\b(?:api[_-]?key|authorization|bearer|password|secret|token)\b/i;
	const windowsAbsolutePathPattern = /(?:^|[\s"'(])[A-Za-z]:[\\/]/m;

	for (const file of localFiles) {
		const repositoryPath = relativeFromRoot(file);
		assert.equal(isPagesPublicFilePath(repositoryPath), false, repositoryPath);
		if (file.endsWith(".json") && file !== manifestPath) {
			const text = fs.readFileSync(file, "utf8");
			assert.equal(forbiddenSecretPattern.test(text), false, repositoryPath);
			assert.equal(windowsAbsolutePathPattern.test(text), false, repositoryPath);
			visitJson(readJson(file), (value) => {
				if (typeof value !== "string" || !/^https?:\/\//i.test(value)) {
					return;
				}
				assert.equal(new URL(value).hostname, "example.invalid", `${repositoryPath}: ${value}`);
			});
		}
	}

	assert.equal(isPagesPublicFilePath("tests/builder-compatibility-corpus.test.mjs"), false);
	assert.equal(isPagesPublicFilePath("manual-tests/tmdb-discover/fixture-manifest.json"), false);
	assert.equal(isPagesPublicFilePath("manual-tests/nuvio-desktop/addon-projection-migration/builder-migrated-input.json"), false);
});

test("canonical profile imports classifies serializes and cycles with exact ordered JSON", () => {
	const entry = entryById("canonical-native-addon-profile");
	const input = loadEntry(entry);
	const imported = importNuvioCollections(input, { idFactory: countingIdFactory() });

	assert.equal(imported.ok, true, JSON.stringify(imported.errors));
	assert.deepEqual(codes(imported.errors), entry.expectedDiagnostics.importErrors);
	assert.deepEqual(codes(imported.warnings), entry.expectedDiagnostics.importWarnings);
	assert.equal(checkInternalIdUniqueness(imported.project).unique, true);

	const categories = imported.project.collections.flatMap((collection) => (
		collection.folders.flatMap((folder) => folder.sources.map((source) => source.category))
	));
	assert.equal(categories.filter((category) => category === SOURCE_CATEGORIES.NATIVE_TMDB).length, 11);
	assert.equal(categories.filter((category) => category === SOURCE_CATEGORIES.ADDON).length, 4);
	assert.equal(categories.includes(SOURCE_CATEGORIES.OPAQUE), false);

	const serializedA = serializeNuvioProject(imported.project);
	assert.equal(serializedA.ok, true, JSON.stringify(serializedA.errors));
	assert.deepEqual(codes(serializedA.errors), entry.expectedDiagnostics.serializeErrors);
	assert.deepEqual(codes(serializedA.warnings), entry.expectedDiagnostics.serializeWarnings);
	assertValueContract(serializedA.value, entry);
	assert.deepEqual(serializedA.value, input);
	assert.equal(validateNuvioContract(serializedA.value, { mode: "canonical-builder-output" }).valid, true);

	const importedAgain = importNuvioCollections(serializedA.value, { idFactory: countingIdFactory("cycle") });
	const serializedB = serializeNuvioProject(importedAgain.project);
	assert.equal(serializedB.ok, true, JSON.stringify(serializedB.errors));
	assert.deepEqual(serializedB.value, serializedA.value);

	const duplicateProjections = serializedA.value[1].folders[0].catalogSources.slice(2);
	assert.deepEqual(duplicateProjections.map((projection) => projection.unknownProjectionOrder), ["first", "second"]);
});

test("preservation profile cycles stably with exact classification counts and ordering", () => {
	const entry = entryById("preservation-comprehensive-profile");
	const input = loadEntry(entry);
	const imported = importNuvioCollections(input, { idFactory: countingIdFactory() });

	assert.equal(imported.ok, true, JSON.stringify(imported.errors));
	assert.deepEqual(codes(imported.errors), entry.expectedDiagnostics.importErrors);
	assert.deepEqual(codes(imported.warnings), entry.expectedDiagnostics.importWarnings);
	assert.deepEqual(
		imported.project.collections[0].folders[0].sources.map((source) => source.category),
		["native-tmdb", "addon", "opaque", "addon", "opaque"],
	);

	const serializedA = serializeNuvioProject(imported.project);
	assert.equal(serializedA.ok, true, JSON.stringify(serializedA.errors));
	assert.deepEqual(codes(serializedA.warnings), entry.expectedDiagnostics.serializeWarnings);
	assertValueContract(serializedA.value, entry);
	assert.equal(validateNuvioContract(serializedA.value, { mode: "import-preservation" }).valid, true);

	const importedAgain = importNuvioCollections(serializedA.value, { idFactory: countingIdFactory("cycle") });
	assert.equal(importedAgain.ok, true, JSON.stringify(importedAgain.errors));
	const serializedB = serializeNuvioProject(importedAgain.project);
	assert.equal(serializedB.ok, true, JSON.stringify(serializedB.errors));
	assert.deepEqual(serializedB.value, serializedA.value);
});

test("preservation overlays retain raw evidence and replace only recognized Discover filters", () => {
	const entry = entryById("preservation-comprehensive-profile");
	const imported = importNuvioCollections(loadEntry(entry), { idFactory: countingIdFactory() });
	let project = imported.project;
	let collection = project.collections[0];
	let folder = collection.folders[0];
	let discover = folder.sources[0];

	project = updateEditableValues(project, collection.internalId, { title: "Edited Imported Profile" });
	project = updateEditableValues(project, folder.internalId, { hideTitle: true });
	project = updateEditableValues(project, discover.internalId, { filters: {} });
	project = structuredClone(project);
	collection = project.collections[0];
	folder = collection.folders[0];
	discover = folder.sources[0];
	const oldAddon = folder.sources[1];

	delete collection.editable.showAllTab;
	delete oldAddon.editable.genre;

	const serialized = serializeNuvioProject(project);
	assert.equal(serialized.ok, true, JSON.stringify(serialized.errors));
	const outputCollection = serialized.value[0];
	const outputFolder = outputCollection.folders[0];
	const outputDiscover = outputFolder.sources[0];
	const outputAddon = outputFolder.sources[1];

	assert.equal(outputCollection.title, "Edited Imported Profile");
	assert.equal(outputCollection.showAllTab, 0);
	assert.equal(outputCollection.backdropImageUrl, null);
	assert.equal(outputCollection.focusGlowEnabled, false);
	assert.deepEqual(outputCollection.unknownCollection, {
		owner: "synthetic-community",
		nested: { keep: true },
	});
	assert.deepEqual(outputCollection.unknownCollectionEmptyObject, {});
	assert.deepEqual(outputCollection.unknownCollectionEmptyArray, []);
	assert.equal(outputCollection.unknownCollectionFalse, false);
	assert.equal(outputCollection.unknownCollectionZero, 0);

	assert.equal(outputFolder.hideTitle, true);
	assert.equal(outputFolder.focusGifUrl, "");
	assert.equal(outputFolder.heroVideoUrl, null);
	assert.equal(outputFolder.focusGifEnabled, false);
	assert.deepEqual(outputFolder.unknownFolder, { layout: "community-grid" });

	assert.deepEqual(outputDiscover.filters, {
		futureFlag: false,
		futureZero: 0,
		futureNull: null,
		futureEmptyObject: {},
		futureEmptyArray: [],
	});
	assert.equal(outputDiscover.sortHow, "descending");
	assert.deepEqual(outputDiscover.unknownSource, { keep: "discover" });
	assert.equal(Object.hasOwn(outputDiscover.filters, "withGenres"), false);
	assert.equal(Object.hasOwn(outputDiscover.filters, "voteAverageGte"), false);
	assert.equal(Object.hasOwn(outputDiscover.filters, "withNetworks"), false);

	assert.equal(outputAddon.genre, null);
	assert.deepEqual(outputAddon.unknownSourceEvidence, { removeWithSource: true });
	assert.deepEqual(outputFolder.catalogSources[0].unknownProjectionEvidence, { removeWithSource: true });
	assert.equal(serialized.value[1].pinToTop, undefined);
	assert.equal(serialized.value[1].folders[0].hideTitle, undefined);

	const sourceArtworkFields = new Set([
		"coverEmoji",
		"coverImageUrl",
		"focusGifEnabled",
		"focusGifUrl",
		"heroBackdropUrl",
		"heroVideoUrl",
		"titleLogoUrl",
	]);
	for (const source of allFolders(serialized.value).flatMap((candidate) => candidate.sources)) {
		assert.equal(
			Object.keys(source).some((key) => sourceArtworkFields.has(key)),
			false,
			`Invented source artwork field in ${sourceIdentity(source)}`,
		);
	}
});

test("controller removal and insertion drop only removed source evidence and preserve sibling order", () => {
	const entry = entryById("preservation-comprehensive-profile");
	const controller = createBuilderController({
		idFactory: countingIdFactory(),
		nuvioIdFactory: countingIdFactory("nuvio"),
	});
	assert.equal(controller.importValue(loadEntry(entry)).ok, true);

	const importedFolder = controller.getState().project.collections[0].folders[0];
	const oldSource = importedFolder.sources.find((source) => source.editable.catalogId === "old-evidence-catalog");
	assert.ok(oldSource);
	assert.equal(controller.removeNode(oldSource.internalId).ok, true);

	const currentFolder = controller.getState().project.collections[0].folders[0];
	const inserted = controller.createSource(currentFolder.internalId, {
		category: SOURCE_CATEGORIES.ADDON,
		index: 1,
		editable: {
			provider: "addon",
			title: "Replacement Addon",
			addonId: "example.synthetic.catalogs",
			type: "movie",
			catalogId: "replacement-catalog",
			genre: null,
		},
	});
	assert.equal(inserted.ok, true, JSON.stringify(inserted.errors));

	const serialized = controller.serializeProject();
	assert.equal(serialized.ok, true, JSON.stringify(serialized.errors));
	assert.deepEqual(codes(serialized.warnings), [
		"OPAQUE_SOURCE_PRESERVED",
		"OPAQUE_SOURCE_PRESERVED",
		"UNMATCHED_CATALOG_SOURCE_REMOVED",
	]);

	const folder = serialized.value[0].folders[0];
	assert.deepEqual(folder.sources.map(sourceIdentity), [
		"tmdb:DISCOVER::MOVIE",
		"addon:example.synthetic.catalogs:movie:replacement-catalog:",
		"opaque:trakt:list:synthetic-list-42:Imported Trakt List",
		"addon:example.synthetic.catalogs:series:retained-catalog:Drama",
		"opaque:community:curated-feed::Community Feed",
	]);
	assert.deepEqual(folder.catalogSources.map(sourceIdentity), [
		"addon:example.synthetic.catalogs:movie:replacement-catalog:",
		"addon:example.synthetic.catalogs:series:retained-catalog:Drama",
	]);
	assert.equal(JSON.stringify(serialized.value).includes("old-evidence-catalog"), false);
	assert.equal(JSON.stringify(serialized.value).includes("removeWithSource"), false);
	assert.equal(folder.sources[1].unknownSourceEvidence, undefined);
	assert.equal(folder.catalogSources[0].unknownProjectionEvidence, undefined);
	assert.deepEqual(folder.sources[3].unknownSourceEvidence, { keepWithSource: true });
	assert.deepEqual(folder.catalogSources[1].unknownProjectionEvidence, { keepWithSource: true });
});

test("file-backed identity evidence separates direct import from controller repair", () => {
	const entry = entryById("identity-direct-import-and-controller-repair");
	const input = loadEntry(entry);
	const direct = importNuvioCollections(input, { idFactory: countingIdFactory() });
	assert.equal(direct.ok, true, JSON.stringify(direct.errors));
	assert.deepEqual(codes(direct.warnings), entry.expectedDiagnostics.importWarnings);
	assert.deepEqual(
		direct.project.collections.map((collection) => collection.editable.id),
		entry.identityExpectations.directCollectionIds,
	);
	assert.deepEqual(
		direct.project.collections.flatMap((collection) => collection.folders.map((folder) => folder.editable.id)),
		entry.identityExpectations.directFolderIds,
	);
	assert.equal(checkInternalIdUniqueness(direct.project).unique, true);

	const directSerialized = serializeNuvioProject(direct.project);
	assert.equal(directSerialized.ok, false);
	assert.deepEqual(codes(directSerialized.errors), entry.expectedDiagnostics.serializeErrors);
	assert.deepEqual(
		directSerialized.errors.map((error) => error.path),
		[
			"$[0].folders[1].id",
			"$[2].id",
			"$[2].folders[0].id",
			"$[3].id",
		],
	);

	const controller = createBuilderController({
		idFactory: countingIdFactory(),
		nuvioIdFactory: countingIdFactory("nuvio"),
	});
	const controlled = controller.importValue(input);
	assert.equal(controlled.ok, true, JSON.stringify(controlled.errors));
	const repairedProject = controller.getState().project;
	assert.deepEqual(
		repairedProject.collections.map((collection) => collection.editable.id),
		entry.identityExpectations.controllerCollectionIds,
	);
	assert.deepEqual(
		repairedProject.collections.flatMap((collection) => collection.folders.map((folder) => folder.editable.id)),
		entry.identityExpectations.controllerFolderIds,
	);
	assert.deepEqual(
		repairedProject.collections.map((collection) => collection.editable.title),
		entry.expectedOrder.collections,
	);
	for (const collection of repairedProject.collections) {
		assert.deepEqual(
			collection.folders.map((folder) => folder.editable.title),
			entry.expectedOrder.foldersByCollection[collection.editable.title],
		);
	}
	assert.equal(repairedProject.collections[1].rawImported.id, " padded ");
	assert.equal(Object.hasOwn(repairedProject.collections[2].rawImported, "id"), false);
	assert.equal(repairedProject.collections[3].rawImported.id, false);
	assert.equal(checkInternalIdUniqueness(repairedProject).unique, true);

	const controllerSerialized = controller.serializeProject();
	assert.equal(controllerSerialized.ok, true, JSON.stringify(controllerSerialized.errors));
	assert.deepEqual(countsFor(controllerSerialized.value), entry.expectedCounts);
	assert.equal(JSON.stringify(controllerSerialized.value).includes("internal-"), false);
});

test("serializer required-text fixture returns exact stable codes and paths", () => {
	const entry = entryById("invalid-serializer-required-text");
	const input = loadEntry(entry);
	const imported = importNuvioCollections(input, { idFactory: countingIdFactory() });
	assert.equal(imported.ok, true, JSON.stringify(imported.errors));
	assert.deepEqual(codes(imported.warnings), entry.expectedDiagnostics.importWarnings);

	const serialized = serializeNuvioProject(imported.project);
	assert.equal(serialized.ok, false);
	assert.deepEqual(codes(serialized.errors), entry.expectedDiagnostics.serializeErrors);
	assert.deepEqual(
		serialized.errors.map((error) => error.path),
		[
			"$[0].id",
			"$[0].title",
			"$[0].folders[0].id",
			"$[0].folders[0].title",
		],
	);
	for (const diagnostic of serialized.errors) {
		assertDiagnosticShape(diagnostic, entry.id);
	}
	assert.deepEqual(
		validateNuvioContract(input, { mode: "canonical-builder-output" }).errors,
		entry.expectedDiagnostics.validationErrors,
	);
});

test("existing migration evidence remains deterministic ordered normalized and idempotent", () => {
	const entry = entryById("migration-existing-addon-projection-evidence");
	const input = loadEntry(entry);
	assertValueContract(input, entry);

	const imported = importNuvioCollections(input, { idFactory: countingIdFactory() });
	assert.equal(imported.ok, true, JSON.stringify(imported.errors));
	assert.deepEqual(codes(imported.warnings), entry.expectedDiagnostics.importWarnings);

	const migrated = migrateLegacyAddonProjections(imported.project, {
		idFactory: sequenceIdFactory("migration-source-1", "migration-source-2", "migration-source-3"),
	});
	assert.equal(migrated.ok, true, JSON.stringify(migrated.errors));
	assert.deepEqual(migrated.changes, { foldersMigrated: 3, sourcesCreated: 3 });
	assert.deepEqual(codes(migrated.warnings), [
		"LEGACY_ADDON_PROJECTIONS_MIGRATED",
		"LEGACY_ADDON_PROJECTIONS_MIGRATED",
		"LEGACY_ADDON_PROJECTIONS_MIGRATED",
	]);
	const repeated = migrateLegacyAddonProjections(imported.project, {
		idFactory: sequenceIdFactory("migration-source-1", "migration-source-2", "migration-source-3"),
	});
	assert.deepEqual(repeated, migrated);

	const serializedA = serializeNuvioProject(migrated.project);
	assert.equal(serializedA.ok, true, JSON.stringify(serializedA.errors));
	assert.deepEqual(codes(serializedA.warnings), entry.expectedDiagnostics.serializeWarnings);
	assertValueContract(
		serializedA.value,
		entry,
		entry.expectedOutputCounts,
		{
			collections: entry.expectedOrder.collections,
			foldersByCollection: entry.expectedOrder.foldersByCollection,
			...entry.expectedOutputOrder,
		},
	);
	assert.equal(validateNuvioContract(serializedA.value, { mode: "canonical-builder-output" }).valid, true);
	assert.deepEqual(
		allFolders(serializedA.value).flatMap((folder) => folder.sources.map((source) => source.genre)),
		[null, "Action", null],
	);
	assert.deepEqual(
		allFolders(serializedA.value).flatMap((folder) => folder.catalogSources.map((source) => source.genre)),
		[null, "Action", null],
	);
	assert.deepEqual(
		serializedA.value[0].folders[0].catalogSources[0].unknownProjectionSentinel,
		{ preserve: true },
	);

	const importedAgain = importNuvioCollections(serializedA.value, { idFactory: countingIdFactory("cycle") });
	const migratedAgain = migrateLegacyAddonProjections(importedAgain.project, {
		idFactory: () => {
			throw new Error("Idempotent migration must not consume IDs.");
		},
	});
	assert.equal(migratedAgain.ok, true, JSON.stringify(migratedAgain.errors));
	assert.deepEqual(migratedAgain.changes, { foldersMigrated: 0, sourcesCreated: 0 });
	const serializedB = serializeNuvioProject(migratedAgain.project);
	assert.equal(serializedB.ok, true, JSON.stringify(serializedB.errors));
	assert.deepEqual(serializedB.value, serializedA.value);

	const desktopInput = readJson(path.join(
		rootDir,
		"manual-tests",
		"nuvio-desktop",
		"addon-projection-migration",
		"builder-migrated-input.json",
	));
	assert.deepEqual(
		allFolders(desktopInput).flatMap((folder) => folder.sources.map(sourceIdentity)),
		allFolders(serializedA.value).flatMap((folder) => folder.sources.map(sourceIdentity)),
	);
});

test("validation-only entries retain exact existing error codes and JSON paths", () => {
	for (const entry of manifest.entries.filter((candidate) => candidate.pipeline === "validation-only")) {
		const input = loadEntry(entry);
		assertValueContract(input, entry);
		const result = validateNuvioContract(input, { mode: "canonical-builder-output" });
		assert.equal(result.valid, false, entry.id);
		assert.deepEqual(result.errors, entry.expectedDiagnostics.validationErrors, entry.id);
	}
});

function visitJson(value, visitor) {
	visitor(value);
	if (Array.isArray(value)) {
		for (const entry of value) {
			visitJson(entry, visitor);
		}
		return;
	}
	if (value !== null && typeof value === "object") {
		for (const entry of Object.values(value)) {
			visitJson(entry, visitor);
		}
	}
}
