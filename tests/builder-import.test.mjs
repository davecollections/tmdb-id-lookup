import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { updateEditableValues } from "../builder/src/domain/index.js";
import {
	classifyNuvioSource,
	importNuvioCollections,
	parseNuvioJsonText,
} from "../builder/src/import/index.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(rootDir, "tests", "fixtures", "nuvio");

function loadFixture(relativePath) {
	return JSON.parse(fs.readFileSync(path.join(fixtureRoot, relativePath), "utf8"));
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

function countingIdFactory() {
	let index = 0;
	return () => `internal-${++index}`;
}

function importOneSource(source, options = {}) {
	return importNuvioCollections([{
		id: "collection",
		title: "Collection",
		folders: [{ id: "folder", title: "Folder", sources: [source] }],
	}], { idFactory: countingIdFactory(), ...options });
}

function warningCodes(result) {
	return result.warnings.map((warning) => warning.code);
}

function assertStructuredFailure(result, code) {
	assert.equal(result.ok, false);
	assert.equal(result.project, null);
	assert.equal(result.errors.length, 1);
	assert.equal(result.errors[0].code, code);
	assert.equal(result.errors[0].path, "$");
	assert.equal(typeof result.errors[0].message, "string");
	assert.deepEqual(Object.keys(result.errors[0]).sort(), ["code", "message", "path"]);
	assert.deepEqual(result.warnings, []);
}

test("imports a valid empty collection array as an empty project", () => {
	const result = importNuvioCollections([], {
		idFactory: () => "project-1",
	});

	assert.equal(result.ok, true);
	assert.deepEqual(result.errors, []);
	assert.deepEqual(result.warnings, []);
	assert.equal(result.project.internalId, "project-1");
	assert.equal(result.project.editable.title, "");
	assert.deepEqual(result.project.collections, []);
});

test("parses JSON text through the same structured importer API", () => {
	const result = parseNuvioJsonText('[{"id":"one","title":"One","folders":[]}]', {
		idFactory: sequenceIdFactory("project", "collection"),
		projectTitle: "Imported file",
	});

	assert.equal(result.ok, true);
	assert.equal(result.project.editable.title, "Imported file");
	assert.equal(result.project.collections[0].editable.id, "one");
});

test("reports invalid JSON syntax without exposing engine parser details", () => {
	const result = parseNuvioJsonText("[{]");

	assert.deepEqual(result, {
		ok: false,
		project: null,
		errors: [{ code: "JSON_PARSE_ERROR", path: "$", message: "The input is not valid JSON." }],
		warnings: [],
	});
});

test("returns the documented public diagnostics with only stable fields", () => {
	const cases = [
		{ result: parseNuvioJsonText(7), code: "JSON_TEXT_REQUIRED" },
		{ result: importNuvioCollections([], null), code: "INVALID_IMPORT_OPTIONS" },
		{ result: importNuvioCollections([], { idFactory: "invalid" }), code: "INVALID_ID_FACTORY" },
		{ result: importNuvioCollections([], { projectTitle: 7 }), code: "INVALID_PROJECT_TITLE" },
	];

	for (const { result, code } of cases) {
		assertStructuredFailure(result, code);
	}
});

test("rejects a non-array root atomically", () => {
	const result = importNuvioCollections({ collections: [] });

	assert.equal(result.ok, false);
	assert.equal(result.project, null);
	assert.equal(result.errors[0].code, "ROOT_NOT_ARRAY");
	assert.equal(result.errors[0].path, "$");
});

test("uses one deterministic ID sequence across the complete hierarchy", () => {
	const result = importNuvioCollections([{
		id: "nuvio-collection",
		folders: [
			{ id: "nuvio-folder-a", sources: [{ provider: "addon" }] },
			{ id: "nuvio-folder-b", sources: [{ provider: "community" }] },
		],
	}], {
		idFactory: sequenceIdFactory("project", "collection", "folder-a", "source-a", "folder-b", "source-b"),
	});

	assert.equal(result.ok, true);
	assert.equal(result.project.internalId, "project");
	assert.equal(result.project.collections[0].internalId, "collection");
	assert.deepEqual(
		result.project.collections[0].folders.map((folder) => folder.internalId),
		["folder-a", "folder-b"],
	);
	assert.deepEqual(
		result.project.collections[0].folders.map((folder) => folder.sources[0].internalId),
		["source-a", "source-b"],
	);
});

test("classifies all seven confirmed native TMDB source types", () => {
	const fixture = loadFixture("valid/all-native-tmdb-source-types.json");
	const result = importNuvioCollections(fixture, { idFactory: countingIdFactory() });

	assert.equal(result.ok, true);
	assert.deepEqual(
		result.project.collections[0].folders.map((folder) => folder.sources[0].category),
		Array(7).fill("native-tmdb"),
	);
	assert.deepEqual(result.warnings, []);
});

test("retains mixed fixture folder and source order with explicit categories", () => {
	const nativeFixture = loadFixture("valid/all-native-tmdb-source-types.json");
	const mixedFixture = loadFixture("valid/mixed-native-and-addon.json");
	const result = importNuvioCollections([...mixedFixture, ...nativeFixture], { idFactory: countingIdFactory() });

	assert.equal(result.ok, true);
	assert.deepEqual(
		result.project.collections.map((collection) => collection.editable.id),
		["collection-mixed", "collection-native-types"],
	);
	assert.deepEqual(
		result.project.collections[1].folders.map((folder) => folder.editable.id),
		["folder-list", "folder-collection", "folder-company", "folder-network", "folder-discover", "folder-person", "folder-director"],
	);
	assert.deepEqual(
		result.project.collections[0].folders[0].sources.map((source) => source.category),
		["native-tmdb", "addon"],
	);
});

test("keeps community fixture sources opaque and preserves sentinel fields", () => {
	const fixture = loadFixture("valid/opaque-community-import.json");
	const result = importNuvioCollections(fixture, { idFactory: countingIdFactory() });
	const collection = result.project.collections[0];
	const folder = collection.folders[0];
	const source = folder.sources[0];

	assert.equal(result.ok, true);
	assert.equal(source.category, "opaque");
	assert.deepEqual(collection.rawImported.communityMetadata, { owner: "fixture-sentinel", revision: 7 });
	assert.deepEqual(folder.rawImported.communityLayout, { density: "compact", accent: "violet" });
	assert.deepEqual(source.rawImported.communityOptions, { quality: "curated", includeUnreleased: false });
	assert.equal(source.rawImported.unknownBoolean, true);
	assert.ok(warningCodes(result).includes("AMBIGUOUS_SOURCE_PRESERVED_OPAQUE"));
});

test("compares providers and TMDB types case-insensitively without rewriting values", () => {
	const source = { provider: "TmDb", tmdbSourceType: "dIsCoVeR", title: "Mixed case" };
	const result = importOneSource(source);
	const imported = result.project.collections[0].folders[0].sources[0];

	assert.equal(imported.category, "native-tmdb");
	assert.equal(imported.editable.provider, "TmDb");
	assert.equal(imported.editable.tmdbSourceType, "dIsCoVeR");
	assert.equal(imported.rawImported.provider, "TmDb");
	assert.deepEqual(source, { provider: "TmDb", tmdbSourceType: "dIsCoVeR", title: "Mixed case" });
});

test("preserves an unsupported TMDB source as opaque with a warning", () => {
	const fixture = loadFixture("invalid/unsupported-direct-movie-source.json");
	const result = importNuvioCollections(fixture, { idFactory: countingIdFactory() });
	const source = result.project.collections[0].folders[0].sources[0];

	assert.equal(result.ok, true);
	assert.equal(source.category, "opaque");
	assert.equal(source.rawImported.tmdbSourceType, "DIRECT_MOVIE");
	assert.ok(warningCodes(result).includes("UNSUPPORTED_TMDB_SOURCE_PRESERVED"));
});

test("does not guess addon category from fields when provider is missing or unknown", () => {
	for (const source of [
		{ addonId: "example", type: "movie", catalogId: "catalog" },
		{ provider: "unknown", addonId: "example", type: "movie", catalogId: "catalog" },
	]) {
		const result = importOneSource(source);
		assert.equal(result.project.collections[0].folders[0].sources[0].category, "opaque");
		assert.ok(warningCodes(result).includes("AMBIGUOUS_SOURCE_PRESERVED_OPAQUE"));
	}

	assert.equal(classifyNuvioSource({ provider: "community" }).category, "opaque");
});

test("imports explicit addon providers as addon drafts even when incomplete", () => {
	const result = importOneSource({ provider: "AdDoN", addonId: "example" });
	const source = result.project.collections[0].folders[0].sources[0];

	assert.equal(result.ok, true);
	assert.equal(source.category, "addon");
	assert.deepEqual(source.editable, { provider: "AdDoN", addonId: "example" });
	assert.ok(warningCodes(result).includes("INCOMPLETE_ADDON_SOURCE"));
});

test("copies only recognised collection fields into editable", () => {
	const input = [{
		id: "collection",
		title: "Title",
		pinToTop: true,
		viewMode: "ROWS",
		showAllTab: false,
		unknownCollection: { keep: true },
		folders: [],
	}];
	const result = importNuvioCollections(input, { idFactory: countingIdFactory() });

	assert.deepEqual(result.project.collections[0].editable, {
		id: "collection",
		title: "Title",
		pinToTop: true,
		viewMode: "ROWS",
		showAllTab: false,
	});
	assert.deepEqual(result.project.collections[0].rawImported.unknownCollection, { keep: true });
});

test("copies only recognised folder presentation fields into editable", () => {
	const folder = {
		id: "folder", title: "Folder", hideTitle: true, tileShape: "POSTER", coverEmoji: "🎬",
		focusGifUrl: "focus", heroVideoUrl: "video", titleLogoUrl: "logo", coverImageUrl: "cover",
		focusGifEnabled: true, heroBackdropUrl: "backdrop", unknownFolder: 7, sources: [],
	};
	const result = importNuvioCollections([{ folders: [folder] }], { idFactory: countingIdFactory() });
	const imported = result.project.collections[0].folders[0];

	assert.deepEqual(imported.editable, {
		id: "folder", title: "Folder", hideTitle: true, tileShape: "POSTER", coverEmoji: "🎬",
		focusGifUrl: "focus", heroVideoUrl: "video", titleLogoUrl: "logo", coverImageUrl: "cover",
		focusGifEnabled: true, heroBackdropUrl: "backdrop",
	});
	assert.equal(imported.rawImported.unknownFolder, 7);
});

test("copies only recognised source fields and keeps future fields raw-only", () => {
	const source = {
		provider: "addon", title: "Addon", tmdbSourceType: null, tmdbId: null, mediaType: "MOVIE",
		sortBy: "original", addonId: "example", type: "movie", catalogId: "catalog", genre: "Drama",
		addonName: "Future name", manifestUrl: "https://example.invalid/manifest.json", showInHome: true,
	};
	const result = importOneSource(source);
	const imported = result.project.collections[0].folders[0].sources[0];

	assert.deepEqual(imported.editable, {
		provider: "addon", title: "Addon", tmdbSourceType: null, tmdbId: null, mediaType: "MOVIE",
		sortBy: "original", addonId: "example", type: "movie", catalogId: "catalog", genre: "Drama",
	});
	assert.equal(imported.editable.addonName, undefined);
	assert.equal(imported.rawImported.addonName, "Future name");
	assert.equal(imported.rawImported.manifestUrl, "https://example.invalid/manifest.json");
	assert.equal(imported.rawImported.showInHome, true);
});

test("extracts only recognised Discover filter fields", () => {
	const recognisedFilters = {
		withGenres: "28", releaseDateGte: "2020-01-01", releaseDateLte: "2026-12-31",
		voteAverageGte: 6, voteAverageLte: 10, voteCountGte: 100,
		withOriginalLanguage: "en", withOriginCountry: "AU", withKeywords: "15097",
		withCompanies: "1", withNetworks: "2", year: 2026, watchRegion: "AU", withWatchProviders: "8",
	};
	const result = importOneSource({
		provider: "tmdb",
		tmdbSourceType: "DISCOVER",
		filters: { ...recognisedFilters, search: "experimental", futureFilter: { keep: true } },
	});
	const imported = result.project.collections[0].folders[0].sources[0];

	assert.deepEqual(imported.editable.filters, recognisedFilters);
	assert.equal(imported.editable.filters.search, undefined);
	assert.equal(imported.editable.filters.futureFilter, undefined);
	assert.equal(imported.rawImported.filters.search, "experimental");
	assert.deepEqual(imported.rawImported.filters.futureFilter, { keep: true });
});

test("preserves non-object filters raw-only and warns", () => {
	const result = importOneSource({ provider: "tmdb", tmdbSourceType: "DISCOVER", filters: ["future"] });
	const source = result.project.collections[0].folders[0].sources[0];

	assert.equal(source.editable.filters, undefined);
	assert.deepEqual(source.rawImported.filters, ["future"]);
	assert.ok(warningCodes(result).includes("INVALID_FILTERS_PRESERVED"));
});

test("fails atomically for non-object collection, folder, and source entries", () => {
	const cases = [
		{ input: ["collection"], code: "COLLECTION_NOT_OBJECT", path: "$[0]" },
		{ input: [{ folders: [[]] }], code: "FOLDER_NOT_OBJECT", path: "$[0].folders[0]" },
		{ input: [{ folders: [{ sources: [null] }] }], code: "SOURCE_NOT_OBJECT", path: "$[0].folders[0].sources[0]" },
	];

	for (const { input, code, path: errorPath } of cases) {
		const result = importNuvioCollections(input, { idFactory: countingIdFactory() });
		assert.equal(result.ok, false);
		assert.equal(result.project, null);
		assert.deepEqual(result.errors.map((error) => [error.code, error.path]), [[code, errorPath]]);
	}
});

test("rejects non-array folders and sources as structural errors", () => {
	const foldersResult = importNuvioCollections([{ folders: {} }]);
	const sourcesResult = importNuvioCollections([{ folders: [{ sources: {} }] }]);

	assert.equal(foldersResult.errors[0].code, "FOLDERS_NOT_ARRAY");
	assert.equal(foldersResult.project, null);
	assert.equal(sourcesResult.errors[0].code, "SOURCES_NOT_ARRAY");
	assert.equal(sourcesResult.project, null);
});

test("defaults missing folders to an empty list with a warning", () => {
	const result = importNuvioCollections([{ id: "collection" }], { idFactory: countingIdFactory() });

	assert.equal(result.ok, true);
	assert.deepEqual(result.project.collections[0].folders, []);
	assert.deepEqual(warningCodes(result), ["MISSING_FOLDERS"]);
});

test("defaults missing sources to an empty list with a warning", () => {
	const result = importNuvioCollections([{ folders: [{ id: "folder" }] }], { idFactory: countingIdFactory() });

	assert.equal(result.ok, true);
	assert.deepEqual(result.project.collections[0].folders[0].sources, []);
	assert.deepEqual(warningCodes(result), ["MISSING_SOURCES"]);
});

test("detects catalogSources-only data without promoting it", () => {
	for (const sourcesShape of [{}, { sources: [] }]) {
		const folder = {
			id: "legacy",
			catalogSources: [{ addonId: "example", type: "movie", catalogId: "catalog" }],
			...sourcesShape,
		};
		const result = importNuvioCollections([{ folders: [folder] }], { idFactory: countingIdFactory() });
		const imported = result.project.collections[0].folders[0];

		assert.equal(result.ok, true);
		assert.deepEqual(imported.sources, []);
		assert.deepEqual(imported.rawImported.catalogSources, folder.catalogSources);
		assert.ok(warningCodes(result).includes("LEGACY_CATALOG_SOURCES_ONLY"));
		assert.equal(Object.hasOwn(imported, "catalogSources"), false);
		assert.equal(Object.hasOwn(imported.editable, "catalogSources"), false);
	}
});

test("preserves a non-array catalogSources value with a warning", () => {
	const result = importNuvioCollections([{
		folders: [{ sources: [], catalogSources: { future: true } }],
	}], { idFactory: countingIdFactory() });
	const folder = result.project.collections[0].folders[0];

	assert.equal(result.ok, true);
	assert.deepEqual(folder.rawImported.catalogSources, { future: true });
	assert.ok(warningCodes(result).includes("CATALOG_SOURCES_NOT_ARRAY_PRESERVED"));
});

test("never exposes catalogSources as a second domain source array", () => {
	const fixture = loadFixture("valid/nuvio-catalog-addon.json");
	const result = importNuvioCollections(fixture, { idFactory: countingIdFactory() });
	const folder = result.project.collections[0].folders[0];

	assert.equal(folder.sources.length, 1);
	assert.equal(Object.hasOwn(folder, "catalogSources"), false);
	assert.equal(Object.hasOwn(folder.editable, "catalogSources"), false);
	assert.equal(folder.rawImported.catalogSources.length, 1);
});

test("deeply detaches caller input, raw snapshots, and later domain edits", () => {
	const input = [{
		id: "collection",
		unknown: { collection: [1, 2] },
		folders: [{
			id: "folder",
			unknown: { folder: true },
			sources: [{
				provider: "tmdb",
				tmdbSourceType: "DISCOVER",
				filters: { withKeywords: "15097", future: { nested: true } },
				unknown: { source: true },
			}],
		}],
	}];
	const original = structuredClone(input);
	const result = importNuvioCollections(input, { idFactory: countingIdFactory() });
	const project = result.project;
	const collection = project.collections[0];
	const folder = collection.folders[0];
	const source = folder.sources[0];

	assert.deepEqual(input, original);
	input[0].unknown.collection.push(3);
	input[0].folders[0].unknown.folder = false;
	input[0].folders[0].sources[0].filters.future.nested = false;
	assert.deepEqual(collection.rawImported.unknown, { collection: [1, 2] });
	assert.deepEqual(folder.rawImported.unknown, { folder: true });
	assert.deepEqual(source.rawImported.filters.future, { nested: true });

	const edited = updateEditableValues(project, source.internalId, { title: "Edited" });
	assert.deepEqual(edited.collections[0].folders[0].sources[0].rawImported, source.rawImported);
	assert.equal(source.rawImported.title, undefined);
});

test("allows duplicate Nuvio-facing IDs while keeping internal IDs distinct", () => {
	const result = importNuvioCollections([
		{ id: "duplicate", folders: [{ id: "duplicate", sources: [] }] },
		{ id: "duplicate", folders: [{ id: "duplicate", sources: [] }] },
	], { idFactory: countingIdFactory() });

	assert.equal(result.ok, true);
	assert.deepEqual(result.project.collections.map((collection) => collection.editable.id), ["duplicate", "duplicate"]);
	assert.notEqual(result.project.collections[0].internalId, result.project.collections[1].internalId);
	assert.notEqual(result.project.collections[0].folders[0].internalId, result.project.collections[1].folders[0].internalId);
});

test("detects injected internal-ID collisions and returns no partial project", () => {
	const result = importNuvioCollections([{ folders: [] }], { idFactory: () => "collision" });

	assert.equal(result.ok, false);
	assert.equal(result.project, null);
	assert.equal(result.errors[0].code, "INTERNAL_ID_COLLISION");
	assert.equal(result.errors[0].path, "$");
});

test("returns a stable error when the ID factory fails", () => {
	const result = importNuvioCollections([], { idFactory: () => "" });

	assert.equal(result.ok, false);
	assert.equal(result.project, null);
	assert.equal(result.errors[0].code, "INTERNAL_ID_GENERATION_ERROR");
});

test("rejects non-JSON-compatible parsed values without mutation", () => {
	const input = [{ folders: [], unknown: Number.NaN }];
	const result = importNuvioCollections(input, { idFactory: countingIdFactory() });

	assert.equal(result.ok, false);
	assert.equal(result.project, null);
	assert.equal(result.errors[0].code, "INVALID_JSON_VALUE");
	assert.equal(Number.isNaN(input[0].unknown), true);
});

test("rejects sparse parsed arrays at every import depth without throwing", () => {
	const sparseRoot = [];
	sparseRoot.length = 1;

	const sparseFolders = [];
	sparseFolders.length = 1;

	const sparseSources = [];
	sparseSources.length = 1;

	const sparseUnknown = [];
	sparseUnknown.length = 2;
	sparseUnknown[1] = { preserved: true };

	const cases = [
		sparseRoot,
		[{ folders: sparseFolders }],
		[{ folders: [{ sources: sparseSources }] }],
		[{ folders: [], unknown: { nested: sparseUnknown } }],
	];

	for (const input of cases) {
		let result;
		assert.doesNotThrow(() => {
			result = importNuvioCollections(input, { idFactory: countingIdFactory() });
		});
		assertStructuredFailure(result, "INVALID_JSON_VALUE");
	}
});

test("produces projects compatible with structuredClone and JSON encoding", () => {
	const fixture = loadFixture("valid/mixed-native-and-addon.json");
	const result = importNuvioCollections(fixture, { idFactory: countingIdFactory() });

	assert.equal(result.ok, true);
	assert.deepEqual(structuredClone(result.project), result.project);
	assert.deepEqual(JSON.parse(JSON.stringify(result.project)), result.project);
});
