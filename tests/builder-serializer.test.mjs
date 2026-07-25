import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
	createCollection,
	createEmptyProject,
	createFolder,
	createSource,
	SOURCE_CATEGORIES,
	updateEditableValues,
} from "../builder/src/domain/index.js";
import { importNuvioCollections } from "../builder/src/import/index.js";
import { serializeNuvioProject, stringifyNuvioProject } from "../builder/src/serialize/index.js";
import { validateNuvioContract } from "./helpers/nuvio-contract-validator.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(rootDir, "tests", "fixtures", "nuvio");

function loadFixture(relativePath) {
	return JSON.parse(fs.readFileSync(path.join(fixtureRoot, relativePath), "utf8"));
}

function countingIdFactory() {
	let index = 0;
	return () => `internal-${++index}`;
}

function importValue(value) {
	const result = importNuvioCollections(value, { idFactory: countingIdFactory() });
	assert.equal(result.ok, true);
	return result.project;
}

function importFixture(relativePath) {
	return importValue(loadFixture(relativePath));
}

function newProject({
	collectionEditable = { id: "collection", title: "Collection" },
	folderEditable = { id: "folder", title: "Folder" },
	sourceSpecs = [],
} = {}) {
	const idFactory = countingIdFactory();
	const project = createEmptyProject({ idFactory, editable: { title: "Builder-only project title" } });
	const collection = createCollection({ idFactory, editable: collectionEditable });
	const folder = createFolder({ idFactory, editable: folderEditable });
	folder.sources = sourceSpecs.map((spec) => createSource({ idFactory, ...spec }));
	collection.folders = [folder];
	project.collections = [collection];
	return project;
}

function nativeSpec(overrides = {}) {
	return {
		category: SOURCE_CATEGORIES.NATIVE_TMDB,
		editable: {
			provider: "tmdb",
			tmdbSourceType: "DISCOVER",
			mediaType: "MOVIE",
			...overrides,
		},
	};
}

function addonSpec(overrides = {}, rawImported) {
	return {
		category: SOURCE_CATEGORIES.ADDON,
		editable: {
			provider: "addon",
			addonId: "com.nuvio.tmdb.catalogs",
			type: "movie",
			catalogId: "popular-movies",
			...overrides,
		},
		...(rawImported === undefined ? {} : { rawImported }),
	};
}

function onlyFolder(result) {
	return result.value[0].folders[0];
}

function codes(result) {
	return result.errors.map((error) => error.code);
}

function warningCodes(result) {
	return result.warnings.map((warning) => warning.code);
}

function assertAtomicFailure(result, code) {
	assert.equal(result.ok, false);
	assert.equal(result.value, null);
	if (Object.hasOwn(result, "json")) {
		assert.equal(result.json, null);
	}
	assert.ok(codes(result).includes(code), JSON.stringify(result.errors));
	for (const diagnostic of [...result.errors, ...result.warnings]) {
		assert.deepEqual(Object.keys(diagnostic).sort(), ["code", "message", "path"]);
	}
}

function assertBuilderWrappersAbsent(collections) {
	for (const collection of collections) {
		for (const key of ["nodeType", "internalId", "category", "editable", "rawImported"]) {
			assert.equal(Object.hasOwn(collection, key), false);
		}
		for (const folder of collection.folders) {
			for (const key of ["nodeType", "internalId", "category", "editable", "rawImported"]) {
				assert.equal(Object.hasOwn(folder, key), false);
			}
			for (const source of folder.sources) {
				for (const key of ["nodeType", "internalId", "category", "editable", "rawImported"]) {
					assert.equal(Object.hasOwn(source, key), false);
				}
			}
		}
	}
}

test("serializes an empty project to an empty collection array", () => {
	const project = createEmptyProject({ idFactory: () => "project" });
	assert.deepEqual(serializeNuvioProject(project), { ok: true, value: [], errors: [], warnings: [] });
});

test("stringifies with two-space indentation by default", () => {
	const result = stringifyNuvioProject(createEmptyProject({ idFactory: () => "project" }));
	assert.equal(result.ok, true);
	assert.equal(result.json, "[]");

	const nested = stringifyNuvioProject(newProject());
	assert.match(nested.json, /\n  \{/);
	assert.doesNotMatch(nested.json, /\n\t/);
});

test("accepts every numeric indentation value from zero through ten", () => {
	const project = newProject();
	for (let space = 0; space <= 10; space += 1) {
		const first = stringifyNuvioProject(project, { space });
		const second = stringifyNuvioProject(project, { space });
		assert.equal(first.ok, true, String(space));
		assert.equal(first.json, second.json, String(space));
		assert.deepEqual(JSON.parse(first.json), first.value, String(space));
	}
});

test("rejects invalid serializer options and indentation", () => {
	assertAtomicFailure(serializeNuvioProject({}, null), "INVALID_SERIALIZER_OPTIONS");
	assertAtomicFailure(serializeNuvioProject({}, { future: true }), "INVALID_SERIALIZER_OPTIONS");
	for (const space of [-1, 11, 1.5, "2", null]) {
		assertAtomicFailure(stringifyNuvioProject({}, { space }), "INVALID_INDENTATION");
	}
	assertAtomicFailure(stringifyNuvioProject({}, { future: true }), "INVALID_SERIALIZER_OPTIONS");
});

test("returns only stable public diagnostic fields and no partial output", () => {
	const result = stringifyNuvioProject(newProject({ collectionEditable: { id: "", title: "Collection" } }));
	assertAtomicFailure(result, "COLLECTION_ID_REQUIRED");
});

test("emits compact required structure for new collection and folder nodes", () => {
	const result = serializeNuvioProject(newProject());
	assert.equal(result.ok, true);
	assert.deepEqual(result.value, [{
		id: "collection",
		title: "Collection",
		folders: [{ id: "folder", title: "Folder", sources: [], catalogSources: [] }],
	}]);
});

test("exports present recognised optionals but ignores unknown editable fields", () => {
	const project = newProject({
		collectionEditable: {
			id: "c",
			title: "C",
			pinToTop: false,
			focusGlowEnabled: true,
			future: "ignored",
		},
		folderEditable: { id: "f", title: "F", hideTitle: true, future: "ignored" },
		sourceSpecs: [nativeSpec({ title: "Known", unknownEditable: "ignored" })],
	});
	const result = serializeNuvioProject(project);
	assert.equal(result.value[0].pinToTop, false);
	assert.equal(result.value[0].focusGlowEnabled, true);
	assert.equal(result.value[0].future, undefined);
	assert.equal(onlyFolder(result).hideTitle, true);
	assert.equal(onlyFolder(result).future, undefined);
	assert.equal(onlyFolder(result).sources[0].title, "Known");
	assert.equal(onlyFolder(result).sources[0].unknownEditable, undefined);
});

test("never leaks builder wrappers while preserving similarly named nested community data", () => {
	const project = importValue([{
		id: "c",
		title: "C",
		community: { nodeType: "sentinel", internalId: "sentinel", category: "sentinel", editable: true, rawImported: true },
		folders: [],
	}]);
	const result = serializeNuvioProject(project);
	assertBuilderWrappersAbsent(result.value);
	assert.deepEqual(result.value[0].community, {
		nodeType: "sentinel", internalId: "sentinel", category: "sentinel", editable: true, rawImported: true,
	});
});

test("preserves collection order", () => {
	const project = importValue([
		{ id: "c-2", title: "Second", folders: [] },
		{ id: "c-1", title: "First", folders: [] },
	]);
	assert.deepEqual(serializeNuvioProject(project).value.map((entry) => entry.id), ["c-2", "c-1"]);
});

test("preserves folder and source order", () => {
	const project = importValue([{
		id: "c", title: "C", folders: [
			{ id: "f-2", title: "F2", sources: [{ provider: "addon", addonId: "a", type: "movie", catalogId: "two" }] },
			{ id: "f-1", title: "F1", sources: [
				{ provider: "addon", addonId: "a", type: "movie", catalogId: "b" },
				{ provider: "addon", addonId: "a", type: "movie", catalogId: "a" },
			] },
		],
	}]);
	const value = serializeNuvioProject(project).value;
	assert.deepEqual(value[0].folders.map((folder) => folder.id), ["f-2", "f-1"]);
	assert.deepEqual(value[0].folders[1].sources.map((source) => source.catalogId), ["b", "a"]);
});

test("rebuilds raw structural arrays from reordered, removed, and inserted domain children", () => {
	const project = importValue([{
		id: "c", title: "C", folders: [
			{ id: "old-a", title: "Old A", sources: [{ provider: "addon", addonId: "a", type: "movie", catalogId: "remove" }] },
			{ id: "old-b", title: "Old B", sources: [] },
		],
	}]);
	const collection = project.collections[0];
	const retained = collection.folders[1];
	const inserted = createFolder({ idFactory: () => "inserted-folder", editable: { id: "new", title: "New" } });
	inserted.sources = [createSource({ ...addonSpec({ catalogId: "new-source" }), idFactory: () => "inserted-source" })];
	collection.folders = [inserted, retained];

	const value = serializeNuvioProject(project).value;
	assert.deepEqual(value[0].folders.map((folder) => folder.id), ["new", "old-b"]);
	assert.deepEqual(value[0].folders[0].sources.map((source) => source.catalogId), ["new-source"]);
	assert.equal(JSON.stringify(value).includes("remove"), false);
});

test("round-trips the opaque community fixture with every sentinel intact", () => {
	const fixture = loadFixture("valid/opaque-community-import.json");
	const result = serializeNuvioProject(importValue(fixture));
	assert.equal(result.ok, true);
	assert.deepEqual(result.value, fixture);
	assert.deepEqual(warningCodes(result), ["OPAQUE_SOURCE_PRESERVED"]);
});

test("preserves unknown collection, folder, and source fields through known edits", () => {
	let project = importValue([{
		id: "c", title: "C", unknownCollection: { keep: 1 }, folders: [{
			id: "f", title: "F", unknownFolder: { keep: 2 }, sources: [{
				provider: "addon", addonId: "a", type: "movie", catalogId: "old", unknownSource: { keep: 3 },
			}],
		}],
	}]);
	const collection = project.collections[0];
	const folder = collection.folders[0];
	const source = folder.sources[0];
	project = updateEditableValues(project, collection.internalId, { title: "Edited C" });
	project = updateEditableValues(project, folder.internalId, { title: "Edited F" });
	project = updateEditableValues(project, source.internalId, { catalogId: "new" });
	const value = serializeNuvioProject(project).value;
	assert.deepEqual(value[0].unknownCollection, { keep: 1 });
	assert.deepEqual(value[0].folders[0].unknownFolder, { keep: 2 });
	assert.deepEqual(value[0].folders[0].sources[0].unknownSource, { keep: 3 });
	assert.equal(value[0].title, "Edited C");
	assert.equal(value[0].folders[0].title, "Edited F");
	assert.equal(value[0].folders[0].sources[0].catalogId, "new");
});

test("treats explicit false, zero, null, empty string, and empty object as overlay values", () => {
	const project = importValue([{
		id: "c", title: "C", pinToTop: true, focusGlowEnabled: true, viewMode: "ROWS", showAllTab: true, folders: [{
			id: "f", title: "F", hideTitle: true, sources: [{
				provider: "tmdb", tmdbSourceType: "DISCOVER", mediaType: "MOVIE", title: "Old", tmdbId: 7,
				filters: { withGenres: "28" },
			}],
		}],
	}]);
	const collection = project.collections[0];
	const folder = collection.folders[0];
	const source = folder.sources[0];
	collection.editable.pinToTop = false;
	collection.editable.focusGlowEnabled = false;
	collection.editable.showAllTab = 0;
	collection.editable.viewMode = "";
	folder.editable.hideTitle = false;
	source.editable.title = null;
	source.editable.tmdbId = null;
	source.editable.filters = {};
	const value = serializeNuvioProject(project).value;
	assert.equal(value[0].pinToTop, false);
	assert.equal(value[0].focusGlowEnabled, false);
	assert.equal(value[0].showAllTab, 0);
	assert.equal(value[0].viewMode, "");
	assert.equal(value[0].folders[0].hideTitle, false);
	assert.equal(value[0].folders[0].sources[0].title, null);
	assert.equal(value[0].folders[0].sources[0].tmdbId, null);
	assert.deepEqual(value[0].folders[0].sources[0].filters, {});
});

test("preserves imported known values when their editable keys are absent", () => {
	const project = importFixture("valid/nuvio-catalog-addon.json");
	project.collections[0].rawImported.focusGlowEnabled = { preserved: true };
	project.collections[0].editable.focusGlowEnabled = { preserved: true };
	delete project.collections[0].editable.title;
	delete project.collections[0].editable.focusGlowEnabled;
	delete project.collections[0].folders[0].editable.tileShape;
	delete project.collections[0].folders[0].sources[0].editable.genre;
	const value = serializeNuvioProject(project).value;
	assert.equal(value[0].title, "Addon Horror");
	assert.deepEqual(value[0].focusGlowEnabled, { preserved: true });
	assert.equal(value[0].folders[0].tileShape, "POSTER");
	assert.equal(value[0].folders[0].sources[0].genre, "Horror");
});

test("does not mutate project state, editable values, or raw snapshots", () => {
	const project = importFixture("valid/mixed-native-and-addon.json");
	const before = structuredClone(project);
	serializeNuvioProject(project);
	assert.deepEqual(project, before);
});

test("preserves unknown raw filters while replacing recognised filter keys", () => {
	const project = importValue([{
		id: "c", title: "C", folders: [{ id: "f", title: "F", sources: [{
			provider: "tmdb", tmdbSourceType: "DISCOVER", mediaType: "MOVIE",
			filters: { withGenres: "28", withKeywords: "old", future: { keep: true } },
		}] }],
	}]);
	project.collections[0].folders[0].sources[0].editable.filters = { withKeywords: "new" };
	const filters = onlyFolder(serializeNuvioProject(project)).sources[0].filters;
	assert.deepEqual(filters, { future: { keep: true }, withKeywords: "new" });
});

test("empty editable filters clear recognised imported keys but retain unknown keys", () => {
	const project = importValue([{
		id: "c", title: "C", folders: [{ id: "f", title: "F", sources: [{
			provider: "tmdb", tmdbSourceType: "DISCOVER", mediaType: "MOVIE",
			filters: { withGenres: "28", future: "keep" },
		}] }],
	}]);
	project.collections[0].folders[0].sources[0].editable.filters = {};
	assert.deepEqual(onlyFolder(serializeNuvioProject(project)).sources[0].filters, { future: "keep" });
});

test("new source filters include recognised keys only and retain an explicit empty object", () => {
	const project = newProject({ sourceSpecs: [nativeSpec({ filters: { withGenres: "28", future: "ignored" } })] });
	assert.deepEqual(onlyFolder(serializeNuvioProject(project)).sources[0].filters, { withGenres: "28" });
	project.collections[0].folders[0].sources[0].editable.filters = { future: true };
	assert.deepEqual(onlyFolder(serializeNuvioProject(project)).sources[0].filters, {});
});

test("rejects non-object editable filters atomically", () => {
	const project = newProject({ sourceSpecs: [nativeSpec()] });
	project.collections[0].folders[0].sources[0].editable.filters = ["invalid"];
	assertAtomicFailure(serializeNuvioProject(project), "INVALID_EDITABLE_FILTERS");
});

test("rejects unreplaced invalid raw filters on supported native sources", () => {
	const project = importValue([{
		id: "c", title: "C", folders: [{ id: "f", title: "F", sources: [{
			provider: "tmdb", tmdbSourceType: "DISCOVER", mediaType: "MOVIE", filters: ["future"],
		}] }],
	}]);
	assertAtomicFailure(serializeNuvioProject(project), "INVALID_NATIVE_FILTERS");
});

test("allows an opaque source to preserve an uninterpreted invalid raw filters value", () => {
	const project = importValue([{
		id: "c", title: "C", folders: [{ id: "f", title: "F", sources: [{ provider: "community", filters: ["future"] }] }],
	}]);
	const result = serializeNuvioProject(project);
	assert.equal(result.ok, true);
	assert.deepEqual(onlyFolder(result).sources[0].filters, ["future"]);
});

test("serializes all seven confirmed native TMDB source types", () => {
	const project = importFixture("valid/all-native-tmdb-source-types.json");
	const result = serializeNuvioProject(project);
	assert.equal(result.ok, true);
	assert.deepEqual(result.errors, []);
	assert.equal(validateNuvioContract(result.value, { mode: "canonical-builder-output" }).valid, true);
});

test("never projects native TMDB sources into catalogSources", () => {
	const result = serializeNuvioProject(importFixture("valid/all-native-tmdb-source-types.json"));
	for (const folder of result.value[0].folders) {
		assert.deepEqual(folder.catalogSources, []);
	}
});

test("rejects unsupported types assigned to the native TMDB category", () => {
	assertAtomicFailure(
		serializeNuvioProject(newProject({ sourceSpecs: [nativeSpec({ tmdbSourceType: "DIRECT_MOVIE", tmdbId: 1 })] })),
		"UNSUPPORTED_NATIVE_TMDB_SOURCE_TYPE",
	);
});

test("requires usable IDs for non-Discover native TMDB sources", () => {
	for (const tmdbId of [undefined, null, "", "   "]) {
		const editable = { tmdbSourceType: "LIST", ...(tmdbId === undefined ? {} : { tmdbId }) };
		assertAtomicFailure(serializeNuvioProject(newProject({ sourceSpecs: [nativeSpec(editable)] })), "NATIVE_TMDB_ID_REQUIRED");
	}
});

test("allows Discover to omit or explicitly null its TMDB ID", () => {
	assert.equal(serializeNuvioProject(newProject({ sourceSpecs: [nativeSpec()] })).ok, true);
	assert.equal(serializeNuvioProject(newProject({ sourceSpecs: [nativeSpec({ tmdbId: null })] })).ok, true);
});

test("rejects invalid native providers and media types", () => {
	assertAtomicFailure(serializeNuvioProject(newProject({ sourceSpecs: [nativeSpec({ provider: "addon" })] })), "INVALID_NATIVE_PROVIDER");
	assertAtomicFailure(serializeNuvioProject(newProject({ sourceSpecs: [nativeSpec({ mediaType: "episode" })] })), "INVALID_NATIVE_MEDIA_TYPE");
});

test("validates imported native casing case-insensitively without rewriting it", () => {
	const project = importValue([{
		id: "c", title: "C", folders: [{ id: "f", title: "F", sources: [{
			provider: "TmDb", tmdbSourceType: "dIsCoVeR", mediaType: "mOvIe",
		}] }],
	}]);
	const source = onlyFolder(serializeNuvioProject(project)).sources[0];
	assert.equal(source.provider, "TmDb");
	assert.equal(source.tmdbSourceType, "dIsCoVeR");
	assert.equal(source.mediaType, "mOvIe");
});

test("creates one minimal addon projection in authoritative source order", () => {
	const result = serializeNuvioProject(newProject({ sourceSpecs: [
		addonSpec({ catalogId: "second", genre: "Horror", title: "Source title" }),
		addonSpec({ catalogId: "first" }),
	] }));
	assert.equal(result.ok, true);
	assert.deepEqual(onlyFolder(result).catalogSources, [
		{ addonId: "com.nuvio.tmdb.catalogs", type: "movie", catalogId: "second", genre: "Horror" },
		{ addonId: "com.nuvio.tmdb.catalogs", type: "movie", catalogId: "first" },
	]);
});

test("keeps mixed authoritative order and filters projection order to addons", () => {
	const result = serializeNuvioProject(newProject({ sourceSpecs: [
		addonSpec({ catalogId: "a" }), nativeSpec(), addonSpec({ catalogId: "b" }),
	] }));
	assert.deepEqual(onlyFolder(result).sources.map((source) => source.catalogId ?? source.tmdbSourceType), ["a", "DISCOVER", "b"]);
	assert.deepEqual(onlyFolder(result).catalogSources.map((source) => source.catalogId), ["a", "b"]);
});

test("rejects addon sources with invalid providers or incomplete identity", () => {
	assertAtomicFailure(serializeNuvioProject(newProject({ sourceSpecs: [addonSpec({ provider: "tmdb" })] })), "INVALID_ADDON_PROVIDER");
	assertAtomicFailure(serializeNuvioProject(newProject({ sourceSpecs: [addonSpec({ catalogId: "" })] })), "INCOMPLETE_ADDON_SOURCE");
});

test("preserves matched raw projection metadata and unknown fields", () => {
	const project = importValue([{
		id: "c", title: "C", folders: [{ id: "f", title: "F", sources: [{
			provider: "addon", addonId: "a", type: "movie", catalogId: "catalog",
		}], catalogSources: [{
			addonId: "a", type: "movie", catalogId: "catalog", id: "projection", addonName: "Addon", future: { keep: true },
		}] }],
	}]);
	assert.deepEqual(onlyFolder(serializeNuvioProject(project)).catalogSources[0], {
		addonId: "a", type: "movie", catalogId: "catalog", id: "projection", addonName: "Addon", future: { keep: true },
	});
});

test("matches an edited addon by original identity then overlays its current identity", () => {
	const project = importFixture("valid/nuvio-catalog-addon.json");
	const source = project.collections[0].folders[0].sources[0];
	project.collections[0].folders[0].rawImported.catalogSources[0].future = "keep";
	source.editable.catalogId = "trending-movies";
	source.editable.genre = "Drama";
	assert.deepEqual(onlyFolder(serializeNuvioProject(project)).catalogSources[0], {
		addonId: "com.nuvio.tmdb.catalogs", type: "movie", catalogId: "trending-movies", genre: "Drama", future: "keep",
	});
});

test("matches exact None projections to current null no-genre identities", () => {
	const project = importValue([{
		id: "c", title: "C", folders: [{
			id: "f", title: "F",
			sources: [{ provider: "addon", addonId: "a", type: "movie", catalogId: "catalog", genre: null }],
			catalogSources: [{
				addonId: "a", type: "movie", catalogId: "catalog", genre: "None", future: { keep: true },
			}],
		}],
	}]);
	const result = serializeNuvioProject(project);

	assert.equal(result.ok, true);
	assert.deepEqual(result.warnings, []);
	assert.deepEqual(onlyFolder(result).catalogSources[0], {
		addonId: "a", type: "movie", catalogId: "catalog", genre: null, future: { keep: true },
	});
});

test("identity alias does not rewrite unrelated imported None values", () => {
	const project = importValue([{
		id: "c", title: "C", folders: [{
			id: "f", title: "F",
			sources: [{ provider: "addon", addonId: "a", type: "movie", catalogId: "catalog", genre: "None" }],
			catalogSources: [{ addonId: "a", type: "movie", catalogId: "catalog", genre: "None" }],
		}],
	}]);
	const result = serializeNuvioProject(project);

	assert.equal(onlyFolder(result).sources[0].genre, "None");
	assert.equal(onlyFolder(result).catalogSources[0].genre, "None");
});

test("consumes duplicate matching raw projections deterministically", () => {
	const project = importValue([{
		id: "c", title: "C", folders: [{ id: "f", title: "F", sources: [
			{ provider: "addon", addonId: "a", type: "movie", catalogId: "same" },
			{ provider: "addon", addonId: "a", type: "movie", catalogId: "same" },
		], catalogSources: [
			{ addonId: "a", type: "movie", catalogId: "same", marker: "first" },
			{ addonId: "a", type: "movie", catalogId: "same", marker: "second" },
		] }],
	}]);
	assert.deepEqual(onlyFolder(serializeNuvioProject(project)).catalogSources.map((entry) => entry.marker), ["first", "second"]);
});

test("carries approved compatibility metadata when an imported addon moves folders", () => {
	const project = importValue([{
		id: "c", title: "C", folders: [
			{ id: "from", title: "From", sources: [{
				provider: "addon", addonId: "a", type: "movie", catalogId: "catalog",
				id: "source-id", addonName: "Addon", manifestUrl: "https://example.invalid/manifest.json", showInHome: false, ignored: "no-copy",
			}], catalogSources: [{ addonId: "a", type: "movie", catalogId: "catalog" }] },
			{ id: "to", title: "To", sources: [], catalogSources: [] },
		],
	}]);
	const [from, to] = project.collections[0].folders;
	to.sources = [from.sources[0]];
	from.sources = [];
	const result = serializeNuvioProject(project);
	assert.deepEqual(result.value[0].folders[1].catalogSources[0], {
		id: "source-id", addonName: "Addon", manifestUrl: "https://example.invalid/manifest.json", showInHome: false,
		addonId: "a", type: "movie", catalogId: "catalog",
	});
	assert.equal(result.value[0].folders[1].catalogSources[0].ignored, undefined);
});

test("removes unmatched old projections with stable warnings", () => {
	const project = importFixture("valid/nuvio-catalog-addon.json");
	project.collections[0].folders[0].sources = [];
	const result = serializeNuvioProject(project);
	assert.equal(result.ok, true);
	assert.deepEqual(onlyFolder(result).catalogSources, []);
	assert.deepEqual(warningCodes(result), ["UNMATCHED_CATALOG_SOURCE_REMOVED"]);
	assert.equal(result.warnings[0].path, "$[0].folders[0].catalogSources[0]");
});

test("never projects addon-looking opaque sources", () => {
	const project = importFixture("valid/opaque-community-import.json");
	const result = serializeNuvioProject(project);
	assert.deepEqual(onlyFolder(result).catalogSources, []);
});

test("blocks unresolved legacy catalogSources-only data without promotion", () => {
	const project = importFixture("invalid/addon-only-in-catalog-sources.json");
	const result = serializeNuvioProject(project);
	assertAtomicFailure(result, "LEGACY_CATALOG_SOURCES_ONLY_UNRESOLVED");
	assert.deepEqual(project.collections[0].folders[0].sources, []);
});

test("rejects non-array imported catalogSources", () => {
	const project = importValue([{
		id: "c", title: "C", folders: [{ id: "f", title: "F", sources: [], catalogSources: { future: true } }],
	}]);
	assertAtomicFailure(serializeNuvioProject(project), "RAW_CATALOG_SOURCES_NOT_ARRAY");
});

test("rejects non-object imported catalogSources entries", () => {
	const project = importValue([{
		id: "c", title: "C", folders: [{ id: "f", title: "F", sources: [], catalogSources: ["invalid"] }],
	}]);
	assertAtomicFailure(serializeNuvioProject(project), "RAW_CATALOG_SOURCE_NOT_OBJECT");
});

test("preserves imported opaque sources with a warning", () => {
	const result = serializeNuvioProject(importFixture("valid/opaque-community-import.json"));
	assert.deepEqual(warningCodes(result), ["OPAQUE_SOURCE_PRESERVED"]);
	assert.equal(onlyFolder(result).sources[0].unknownBoolean, true);
});

test("rejects newly invented opaque sources without raw data", () => {
	const project = newProject({ sourceSpecs: [{
		category: SOURCE_CATEGORIES.OPAQUE,
		editable: { provider: "community", addonId: "a", type: "movie", catalogId: "catalog" },
	}] });
	assertAtomicFailure(serializeNuvioProject(project), "OPAQUE_SOURCE_REQUIRES_RAW");
});

test("requires non-blank collection and folder IDs and titles", () => {
	const cases = [
		{ collectionEditable: { id: "", title: "C" }, code: "COLLECTION_ID_REQUIRED" },
		{ collectionEditable: { id: "c", title: "  " }, code: "COLLECTION_TITLE_REQUIRED" },
		{ folderEditable: { id: "", title: "F" }, code: "FOLDER_ID_REQUIRED" },
		{ folderEditable: { id: "f", title: "\t" }, code: "FOLDER_TITLE_REQUIRED" },
	];
	for (const { code, ...options } of cases) {
		assertAtomicFailure(serializeNuvioProject(newProject(options)), code);
	}
});

test("rejects duplicate builder internal IDs", () => {
	const project = newProject();
	project.collections[0].internalId = project.internalId;
	assertAtomicFailure(serializeNuvioProject(project), "DUPLICATE_INTERNAL_ID");
});

test("rejects invalid project nodes, child arrays, editable objects, raw snapshots, and categories", () => {
	assertAtomicFailure(serializeNuvioProject([]), "INVALID_PROJECT_NODE");
	const childProject = newProject();
	childProject.collections[0].folders = {};
	assertAtomicFailure(serializeNuvioProject(childProject), "CHILD_ARRAY_NOT_ARRAY");
	const editableProject = newProject();
	editableProject.collections[0].editable = null;
	assertAtomicFailure(serializeNuvioProject(editableProject), "INVALID_EDITABLE");
	const rawProject = newProject();
	rawProject.collections[0].rawImported = [];
	assertAtomicFailure(serializeNuvioProject(rawProject), "INVALID_RAW_IMPORTED");
	const categoryProject = newProject({ sourceSpecs: [nativeSpec()] });
	categoryProject.collections[0].folders[0].sources[0].category = "future";
	assertAtomicFailure(serializeNuvioProject(categoryProject), "INVALID_SOURCE_CATEGORY");
});

test("rejects sparse domain child arrays", () => {
	const project = newProject();
	project.collections[0].folders[0].sources = [];
	project.collections[0].folders[0].sources.length = 1;
	assertAtomicFailure(serializeNuvioProject(project), "SPARSE_CHILD_ARRAY");
});

test("rejects non-JSON-compatible domain values", () => {
	const project = newProject();
	project.collections[0].editable.future = Number.NaN;
	assertAtomicFailure(serializeNuvioProject(project), "INVALID_JSON_VALUE");
});

test("produces dense deterministic cloneable and JSON-encodable output", () => {
	const project = importFixture("valid/mixed-native-and-addon.json");
	const first = serializeNuvioProject(project);
	const second = serializeNuvioProject(project);
	assert.deepEqual(first, second);
	assert.deepEqual(structuredClone(first.value), first.value);
	assert.deepEqual(JSON.parse(JSON.stringify(first.value)), first.value);
	for (const collection of first.value) {
		assert.deepEqual(Object.keys(collection.folders), collection.folders.map((_, index) => String(index)));
		for (const folder of collection.folders) {
			assert.deepEqual(Object.keys(folder.sources), folder.sources.map((_, index) => String(index)));
			assert.deepEqual(Object.keys(folder.catalogSources), folder.catalogSources.map((_, index) => String(index)));
		}
	}
});

test("copies unusual imported property names without changing object prototypes", () => {
	const fixture = JSON.parse('[{"id":"c","title":"C","__proto__":{"polluted":true},"folders":[]}]');
	const result = serializeNuvioProject(importValue(fixture));
	assert.equal(result.ok, true);
	assert.equal(Object.getPrototypeOf(result.value[0]), Object.prototype);
	assert.equal(Object.hasOwn(result.value[0], "__proto__"), true);
	assert.deepEqual(result.value[0].__proto__, { polluted: true });
	assert.equal({}.polluted, undefined);
});

test("passes canonical validation for newly constructed all-native output", () => {
	const fixtureProject = importFixture("valid/all-native-tmdb-source-types.json");
	for (const collection of fixtureProject.collections) {
		delete collection.rawImported;
		for (const folder of collection.folders) {
			delete folder.rawImported;
			for (const source of folder.sources) {
				delete source.rawImported;
			}
		}
	}
	const result = serializeNuvioProject(fixtureProject);
	assert.equal(validateNuvioContract(result.value, { mode: "canonical-builder-output" }).valid, true);
});

test("passes canonical validation for newly constructed addon and mixed output", () => {
	for (const project of [
		newProject({ sourceSpecs: [addonSpec()] }),
		newProject({ sourceSpecs: [nativeSpec(), addonSpec()] }),
	]) {
		const result = serializeNuvioProject(project);
		assert.equal(validateNuvioContract(result.value, { mode: "canonical-builder-output" }).valid, true);
	}
});

test("passes import-preservation validation for opaque output", () => {
	const result = serializeNuvioProject(importFixture("valid/opaque-community-import.json"));
	assert.equal(validateNuvioContract(result.value, { mode: "import-preservation" }).valid, true);
});

test("matches fixture-backed folder and source order expectations", () => {
	const fixture = loadFixture("valid/mixed-native-and-addon.json");
	const result = serializeNuvioProject(importValue(fixture));
	assert.deepEqual(result.value[0].folders.map((folder) => folder.id), fixture[0].folders.map((folder) => folder.id));
	assert.deepEqual(
		result.value[0].folders[0].sources.map((source) => source.provider),
		fixture[0].folders[0].sources.map((source) => source.provider),
	);
});
