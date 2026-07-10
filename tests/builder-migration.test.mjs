import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { SOURCE_CATEGORIES } from "../builder/src/domain/index.js";
import { importNuvioCollections } from "../builder/src/import/index.js";
import { migrateLegacyAddonProjections } from "../builder/src/migrate/index.js";
import { serializeNuvioProject } from "../builder/src/serialize/index.js";
import { validateNuvioContract } from "./helpers/nuvio-contract-validator.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(rootDir, "tests", "fixtures", "nuvio");

function loadFixture(relativePath) {
	return JSON.parse(fs.readFileSync(path.join(fixtureRoot, relativePath), "utf8"));
}

function countingIdFactory(prefix = "internal") {
	let index = 0;
	return () => `${prefix}-${++index}`;
}

function sequenceIdFactory(...ids) {
	let index = 0;
	return () => {
		if (index >= ids.length) {
			throw new Error("Deterministic ID sequence exhausted");
		}
		return ids[index++];
	};
}

function importValue(value) {
	const result = importNuvioCollections(value, { idFactory: countingIdFactory() });
	assert.equal(result.ok, true, JSON.stringify(result.errors));
	return result.project;
}

function legacyProject(projections = [{ addonId: "example.addon", type: "movie", catalogId: "catalog" }], sourcesShape = {}) {
	return importValue([{
		id: "collection",
		title: "Collection",
		folders: [{
			id: "folder",
			title: "Folder",
			catalogSources: projections,
			...sourcesShape,
		}],
	}]);
}

function assertDiagnosticShape(diagnostic) {
	assert.deepEqual(Object.keys(diagnostic).sort(), ["code", "message", "path"]);
	assert.equal(typeof diagnostic.code, "string");
	assert.equal(typeof diagnostic.path, "string");
	assert.equal(typeof diagnostic.message, "string");
}

function assertAtomicFailure(result, code) {
	assert.equal(result.ok, false);
	assert.equal(result.project, null);
	assert.deepEqual(result.changes, { foldersMigrated: 0, sourcesCreated: 0 });
	assert.ok(result.errors.some((error) => error.code === code), JSON.stringify(result.errors));
	for (const diagnostic of [...result.errors, ...result.warnings]) {
		assertDiagnosticShape(diagnostic);
	}
}

test("valid no-op migration returns a stable detached result", () => {
	const project = importValue([{ id: "collection", title: "Collection", folders: [] }]);
	const result = migrateLegacyAddonProjections(project, { idFactory: () => "unused" });

	assert.deepEqual(result, {
		ok: true,
		project,
		errors: [],
		warnings: [],
		changes: { foldersMigrated: 0, sourcesCreated: 0 },
	});
	assert.notEqual(result.project, project);
	assert.notEqual(result.project.collections, project.collections);
	assert.deepEqual(result.project, project);
});

test("invalid options and ID factory failures are stable and atomic", () => {
	const project = legacyProject();
	const before = structuredClone(project);
	const cases = [
		[migrateLegacyAddonProjections(project, null), "INVALID_MIGRATION_OPTIONS"],
		[migrateLegacyAddonProjections(project, { future: true }), "INVALID_MIGRATION_OPTIONS"],
		[migrateLegacyAddonProjections(project, { idFactory: "invalid" }), "INVALID_ID_FACTORY"],
		[migrateLegacyAddonProjections(project, { idFactory: () => { throw new Error("failed"); } }), "INTERNAL_ID_GENERATION_ERROR"],
		[migrateLegacyAddonProjections(project, { idFactory: () => "" }), "INTERNAL_ID_GENERATION_ERROR"],
	];

	for (const [result, code] of cases) {
		assertAtomicFailure(result, code);
	}
	assert.deepEqual(project, before);
});

test("generated IDs are reserved in projection order and collisions fail atomically", () => {
	const project = legacyProject([
		{ addonId: "a", type: "movie", catalogId: "one" },
		{ addonId: "a", type: "series", catalogId: "two" },
	]);
	const existingCollision = migrateLegacyAddonProjections(project, { idFactory: () => project.internalId });
	const generatedCollision = migrateLegacyAddonProjections(project, {
		idFactory: sequenceIdFactory("new-source", "new-source"),
	});

	assertAtomicFailure(existingCollision, "DUPLICATE_INTERNAL_ID");
	assertAtomicFailure(generatedCollision, "DUPLICATE_INTERNAL_ID");
	assert.deepEqual(project.collections[0].folders[0].sources, []);

	let calls = 0;
	const success = migrateLegacyAddonProjections(project, { idFactory: () => `migrated-${++calls}` });
	assert.equal(calls, 2);
	assert.deepEqual(success.project.collections[0].folders[0].sources.map((source) => source.internalId), [
		"migrated-1",
		"migrated-2",
	]);
});

test("absent and explicitly empty raw sources are eligible in folder order", () => {
	const project = importValue([{
		id: "collection", title: "Collection", folders: [
			{ id: "first", title: "First", catalogSources: [{ addonId: "a", type: "movie", catalogId: "first" }] },
			{ id: "ordinary", title: "Ordinary", sources: [], catalogSources: [] },
			{ id: "second", title: "Second", sources: [], catalogSources: [{ addonId: "a", type: "series", catalogId: "second" }] },
		],
	}]);
	const result = migrateLegacyAddonProjections(project, {
		idFactory: sequenceIdFactory("first-source", "second-source"),
	});

	assert.equal(result.ok, true);
	assert.deepEqual(result.changes, { foldersMigrated: 2, sourcesCreated: 2 });
	assert.deepEqual(result.project.collections[0].folders.map((folder) => folder.sources.length), [1, 0, 1]);
	assert.deepEqual(result.warnings.map((warning) => warning.path), ["$[0].folders[0]", "$[0].folders[2]"]);
	assert.deepEqual(result.warnings.map((warning) => warning.code), [
		"LEGACY_ADDON_PROJECTIONS_MIGRATED",
		"LEGACY_ADDON_PROJECTIONS_MIGRATED",
	]);
	for (const warning of result.warnings) {
		assertDiagnosticShape(warning);
	}
});

test("non-eligible folders remain unchanged without invoking the ID factory", () => {
	const cases = [
		legacyProject([], { sources: [] }),
		importValue([{ id: "c", title: "C", folders: [{ id: "f", title: "F", sources: [] }] }]),
		importValue([{
			id: "c", title: "C", folders: [{
				id: "f", title: "F",
				sources: [{ provider: "addon", addonId: "a", type: "movie", catalogId: "active" }],
				catalogSources: [{ addonId: "a", type: "movie", catalogId: "active" }],
			}],
		}]),
	];
	const deleted = importValue([{
		id: "c", title: "C", folders: [{
			id: "f", title: "F",
			sources: [{ provider: "addon", addonId: "a", type: "movie", catalogId: "deleted" }],
			catalogSources: [{ addonId: "a", type: "movie", catalogId: "deleted" }],
		}],
	}]);
	deleted.collections[0].folders[0].sources = [];
	cases.push(deleted);
	const noRaw = legacyProject();
	delete noRaw.collections[0].folders[0].rawImported;
	cases.push(noRaw);

	for (const project of cases) {
		const before = structuredClone(project);
		const result = migrateLegacyAddonProjections(project, { idFactory: () => { throw new Error("must not run"); } });
		assert.equal(result.ok, true);
		assert.deepEqual(result.project, before);
		assert.deepEqual(result.changes, { foldersMigrated: 0, sourcesCreated: 0 });
	}
});

test("invalid projection arrays and entries return precise diagnostics", () => {
	const nonArray = legacyProject();
	nonArray.collections[0].folders[0].rawImported.catalogSources = {};
	assertAtomicFailure(migrateLegacyAddonProjections(nonArray), "RAW_CATALOG_SOURCES_NOT_ARRAY");

	const sparse = legacyProject();
	sparse.collections[0].folders[0].rawImported.catalogSources = [];
	sparse.collections[0].folders[0].rawImported.catalogSources.length = 2;
	sparse.collections[0].folders[0].rawImported.catalogSources[1] = { addonId: "a", type: "movie", catalogId: "one" };
	assertAtomicFailure(migrateLegacyAddonProjections(sparse), "SPARSE_RAW_CATALOG_SOURCES");

	const nonObject = legacyProject();
	nonObject.collections[0].folders[0].rawImported.catalogSources = [null];
	assertAtomicFailure(migrateLegacyAddonProjections(nonObject), "RAW_CATALOG_SOURCE_NOT_OBJECT");
});

test("missing and blank addon identity fields block migration", () => {
	for (const field of ["addonId", "type", "catalogId"]) {
		for (const value of [undefined, "   "]) {
			const projection = { addonId: "a", type: "movie", catalogId: "catalog" };
			if (value === undefined) {
				delete projection[field];
			} else {
				projection[field] = value;
			}
			assertAtomicFailure(
				migrateLegacyAddonProjections(legacyProject([projection])),
				"INCOMPLETE_LEGACY_ADDON_PROJECTION",
			);
		}
	}
});

test("one invalid projection blocks every sibling and exposes no partial project", () => {
	const project = importValue([{
		id: "c", title: "C", folders: [
			{ id: "valid", title: "Valid", catalogSources: [{ addonId: "a", type: "movie", catalogId: "valid" }] },
			{ id: "invalid", title: "Invalid", sources: [], catalogSources: [{ addonId: "a", type: "series", catalogId: "invalid", genre: 7 }] },
		],
	}]);
	let calls = 0;
	const result = migrateLegacyAddonProjections(project, { idFactory: () => `source-${++calls}` });

	assertAtomicFailure(result, "INVALID_LEGACY_ADDON_GENRE");
	assert.equal(calls, 0);
	assert.deepEqual(project.collections[0].folders.map((folder) => folder.sources), [[], []]);
});

test("migration creates compact addon sources in projection order", () => {
	const project = legacyProject([
		{ addonId: "a", type: "movie", catalogId: "movie" },
		{ addonId: "a", type: "series", catalogId: "series", genre: "Action" },
		{ addonId: "a", type: "anime", catalogId: "anime", genre: "None" },
	]);
	const result = migrateLegacyAddonProjections(project, {
		idFactory: sequenceIdFactory("movie", "series", "anime"),
	});
	const sources = result.project.collections[0].folders[0].sources;

	assert.deepEqual(sources, [
		{
			nodeType: "source", internalId: "movie", category: SOURCE_CATEGORIES.ADDON,
			editable: { provider: "addon", addonId: "a", type: "movie", catalogId: "movie" },
		},
		{
			nodeType: "source", internalId: "series", category: SOURCE_CATEGORIES.ADDON,
			editable: { provider: "addon", addonId: "a", type: "series", catalogId: "series", genre: "Action" },
		},
		{
			nodeType: "source", internalId: "anime", category: SOURCE_CATEGORIES.ADDON,
			editable: { provider: "addon", addonId: "a", type: "anime", catalogId: "anime", genre: null },
		},
	]);
	for (const source of sources) {
		assert.equal(Object.hasOwn(source, "rawImported"), false);
		assert.deepEqual(Object.keys(source.editable).sort(), Object.keys(source.editable).filter((key) => [
			"provider", "addonId", "type", "catalogId", "genre",
		].includes(key)).sort());
	}
});

test("genre migration changes only exact None and preserves property absence", () => {
	const project = legacyProject([
		{ addonId: "a", type: "movie", catalogId: "none", genre: "None" },
		{ addonId: "a", type: "movie", catalogId: "real", genre: "Action" },
		{ addonId: "a", type: "movie", catalogId: "null", genre: null },
		{ addonId: "a", type: "movie", catalogId: "empty", genre: "" },
		{ addonId: "a", type: "movie", catalogId: "missing" },
		{ addonId: "a", type: "movie", catalogId: "lower", genre: "none" },
		{ addonId: "a", type: "movie", catalogId: "spaced", genre: " None " },
	]);
	const result = migrateLegacyAddonProjections(project, { idFactory: countingIdFactory("source") });
	const genres = result.project.collections[0].folders[0].sources.map((source) => (
		Object.hasOwn(source.editable, "genre") ? source.editable.genre : "absent"
	));

	assert.deepEqual(genres, [null, "Action", null, "", "absent", "none", " None "]);
});

test("raw evidence, unknown projection metadata, and presentation fields survive migration and serialization", () => {
	const input = loadFixture("compatibility/legacy-projection-only-input.json");
	const project = importValue(input);
	const before = structuredClone(project);
	const migrated = migrateLegacyAddonProjections(project, { idFactory: countingIdFactory("migrated") });
	const serialized = serializeNuvioProject(migrated.project);

	assert.equal(serialized.ok, true, JSON.stringify(serialized.errors));
	assert.deepEqual(project, before);
	assert.deepEqual(migrated.project.collections[0].folders[0].rawImported, before.collections[0].folders[0].rawImported);
	assert.deepEqual(serialized.value[0].folders[0].catalogSources[0].unknownProjectionSentinel, { preserve: true });
	assert.equal(serialized.value[0].folders[0].coverImageUrl, "https://example.invalid/legacy-movie.jpg");
	assert.equal(serialized.value[0].folders[1].heroBackdropUrl, "https://example.invalid/legacy-series.jpg");
	assert.equal(serialized.value[0].folders[2].titleLogoUrl, "https://example.invalid/legacy-anime-logo.png");
});

test("repeated deterministic migration is cloneable, encodable, deterministic, and dense", () => {
	const project = legacyProject([
		{ addonId: "a", type: "movie", catalogId: "one" },
		{ addonId: "a", type: "series", catalogId: "two" },
	]);
	const first = migrateLegacyAddonProjections(project, { idFactory: sequenceIdFactory("one", "two") });
	const second = migrateLegacyAddonProjections(project, { idFactory: sequenceIdFactory("one", "two") });

	assert.deepEqual(first, second);
	assert.deepEqual(structuredClone(first), first);
	assert.deepEqual(JSON.parse(JSON.stringify(first)), first);
	const sources = first.project.collections[0].folders[0].sources;
	assert.deepEqual(Object.keys(sources), ["0", "1"]);
});

test("project structure, duplicate identity, and JSON errors use stable migration diagnostics", () => {
	assertAtomicFailure(migrateLegacyAddonProjections([]), "INVALID_PROJECT_NODE");

	const childProject = legacyProject();
	childProject.collections[0].folders = {};
	assertAtomicFailure(migrateLegacyAddonProjections(childProject), "CHILD_ARRAY_NOT_ARRAY");

	const editableProject = legacyProject();
	editableProject.collections[0].editable = null;
	assertAtomicFailure(migrateLegacyAddonProjections(editableProject), "INVALID_EDITABLE");

	const rawProject = legacyProject();
	rawProject.collections[0].rawImported = [];
	assertAtomicFailure(migrateLegacyAddonProjections(rawProject), "INVALID_RAW_IMPORTED");

	const duplicateProject = legacyProject();
	duplicateProject.collections[0].internalId = duplicateProject.internalId;
	assertAtomicFailure(migrateLegacyAddonProjections(duplicateProject), "DUPLICATE_INTERNAL_ID");

	const jsonProject = legacyProject();
	jsonProject.editable.future = Number.NaN;
	assertAtomicFailure(migrateLegacyAddonProjections(jsonProject), "INVALID_JSON_VALUE");
});

test("serializer blocks unresolved data and succeeds after explicit None migration", () => {
	const project = legacyProject([{
		addonId: "a", type: "movie", catalogId: "catalog", genre: "None", future: { preserve: true },
	}]);
	const before = serializeNuvioProject(project);
	assert.equal(before.ok, false);
	assert.ok(before.errors.some((error) => error.code === "LEGACY_CATALOG_SOURCES_ONLY_UNRESOLVED"));

	const migrated = migrateLegacyAddonProjections(project, { idFactory: () => "migrated-source" });
	const after = serializeNuvioProject(migrated.project);
	assert.equal(after.ok, true, JSON.stringify(after.errors));
	assert.deepEqual(after.errors, []);
	assert.deepEqual(after.warnings, []);
	assert.equal(after.value[0].folders[0].sources[0].genre, null);
	assert.equal(after.value[0].folders[0].catalogSources[0].genre, null);
	assert.deepEqual(after.value[0].folders[0].catalogSources[0].future, { preserve: true });
});

test("real genres remain distinct and existing unmatched projection warnings remain", () => {
	const project = importValue([{
		id: "c", title: "C", folders: [{
			id: "f", title: "F",
			sources: [{ provider: "addon", addonId: "a", type: "movie", catalogId: "catalog", genre: "Action" }],
			catalogSources: [{ addonId: "a", type: "movie", catalogId: "catalog", genre: "Drama", old: true }],
		}],
	}]);
	const result = serializeNuvioProject(project);

	assert.equal(result.ok, true);
	assert.deepEqual(result.value[0].folders[0].catalogSources, [{
		addonId: "a", type: "movie", catalogId: "catalog", genre: "Action",
	}]);
	assert.deepEqual(result.warnings.map((warning) => warning.code), ["UNMATCHED_CATALOG_SOURCE_REMOVED"]);
});

test("native and opaque behavior remains unchanged by migration", () => {
	for (const relativePath of ["valid/mixed-native-and-addon.json", "valid/opaque-community-import.json"]) {
		const project = importValue(loadFixture(relativePath));
		const migrated = migrateLegacyAddonProjections(project, { idFactory: () => { throw new Error("must not run"); } });
		assert.equal(migrated.ok, true);
		assert.deepEqual(migrated.project, project);
		assert.deepEqual(serializeNuvioProject(migrated.project), serializeNuvioProject(project));
	}
});

test("compact active-addon evidence imports and serializes without migration", () => {
	const project = importValue(loadFixture("compatibility/active-compact-addon-input.json"));
	const migrated = migrateLegacyAddonProjections(project, { idFactory: () => { throw new Error("must not run"); } });
	const serialized = serializeNuvioProject(project);

	assert.equal(migrated.ok, true);
	assert.deepEqual(migrated.changes, { foldersMigrated: 0, sourcesCreated: 0 });
	assert.equal(serialized.ok, true, JSON.stringify(serialized.errors));
	assert.deepEqual(serialized.warnings, []);
	assert.deepEqual(serialized.value[0].folders[0].catalogSources[0].unknownProjectionSentinel, { pair: "active-compact" });
});

test("Nuvio-normalised active-addon evidence preserves explicit null fields", () => {
	const project = importValue(loadFixture("compatibility/active-nuvio-normalised.json"));
	const serialized = serializeNuvioProject(project);

	assert.equal(serialized.ok, true, JSON.stringify(serialized.errors));
	assert.equal(serialized.value[0].backdropImageUrl, null);
	assert.equal(serialized.value[0].folders[0].sources[0].filters, null);
	assert.equal(serialized.value[0].folders[0].sources[1].genre, null);
	assert.equal(serialized.value[0].folders[0].catalogSources[1].genre, null);
	assert.equal(serialized.value[0].folders[0].catalogSources[0].unknownProjectionSentinel.pair, "active-compact");
});

test("projection-only evidence migrates movie, series, and anime in order and validates canonically", () => {
	const project = importValue(loadFixture("compatibility/legacy-projection-only-input.json"));
	assert.deepEqual(project.collections[0].folders.map((folder) => folder.sources.length), [0, 0, 0]);

	const migrated = migrateLegacyAddonProjections(project, {
		idFactory: sequenceIdFactory("movie-source", "series-source", "anime-source"),
	});
	const identities = migrated.project.collections[0].folders.flatMap((folder) => folder.sources).map((source) => ({
		provider: source.editable.provider,
		type: source.editable.type,
		catalogId: source.editable.catalogId,
		genre: source.editable.genre,
	}));
	assert.deepEqual(identities, [
		{ provider: "addon", type: "movie", catalogId: "movie-catalog", genre: null },
		{ provider: "addon", type: "series", catalogId: "series-catalog", genre: "Action" },
		{ provider: "addon", type: "anime", catalogId: "anime-catalog", genre: null },
	]);

	const serialized = serializeNuvioProject(migrated.project);
	assert.equal(serialized.ok, true, JSON.stringify(serialized.errors));
	assert.equal(validateNuvioContract(serialized.value, { mode: "canonical-builder-output" }).valid, true);
});

test("Nuvio-normalised legacy evidence imports and serializes without migration or networking", () => {
	const project = importValue(loadFixture("compatibility/legacy-nuvio-normalised.json"));
	const migrated = migrateLegacyAddonProjections(project, { idFactory: () => { throw new Error("must not run"); } });
	const serialized = serializeNuvioProject(project);

	assert.equal(migrated.ok, true);
	assert.deepEqual(migrated.changes, { foldersMigrated: 0, sourcesCreated: 0 });
	assert.equal(serialized.ok, true, JSON.stringify(serialized.errors));
	assert.deepEqual(serialized.value[0].folders.flatMap((folder) => folder.sources).map((source) => source.type), [
		"movie", "series", "anime",
	]);
	assert.equal(serialized.value[0].folders[0].catalogSources[0].unknownProjectionSentinel.preserve, true);
});
