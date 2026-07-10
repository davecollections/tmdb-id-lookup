import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
	checkInternalIdUniqueness,
	cloneJsonValue,
	createCollection,
	createEmptyProject,
	createFolder,
	createSource,
	findNodeByInternalId,
	insertChild,
	moveNode,
	NODE_TYPES,
	removeNode,
	SOURCE_CATEGORIES,
	traverseProject,
	updateEditableValues,
} from "../builder/src/domain/index.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function sequenceIdFactory(...ids) {
	let index = 0;
	return () => {
		if (index >= ids.length) {
			throw new Error("Deterministic ID sequence exhausted");
		}
		return ids[index++];
	};
}

function buildProject() {
	const idFactory = sequenceIdFactory("project-1", "collection-1", "folder-1", "source-1", "source-2");
	let project = createEmptyProject({ idFactory, editable: { title: "Test project" } });
	const collection = createCollection({ idFactory, editable: { id: "collection", title: "Collection" } });
	const folder = createFolder({ idFactory, editable: { id: "folder", title: "Folder" } });
	const sourceOne = createSource({
		category: SOURCE_CATEGORIES.NATIVE_TMDB,
		idFactory,
		editable: { provider: "tmdb", tmdbSourceType: "DISCOVER", filters: { withKeywords: "15097" } },
		rawImported: { communitySourceSentinel: "source-one" },
	});
	const sourceTwo = createSource({
		category: SOURCE_CATEGORIES.ADDON,
		idFactory,
		editable: { addonId: "com.nuvio.tmdb.catalogs", type: "movie", catalogId: "popular-movies" },
	});

	project = insertChild(project, project.internalId, collection);
	project = insertChild(project, collection.internalId, folder);
	project = insertChild(project, folder.internalId, sourceOne);
	project = insertChild(project, folder.internalId, sourceTwo);
	return project;
}

test("creates an empty plain-data project", () => {
	const project = createEmptyProject({ idFactory: () => "project-1" });

	assert.deepEqual(project, {
		nodeType: NODE_TYPES.PROJECT,
		internalId: "project-1",
		editable: { title: "" },
		collections: [],
	});
});

test("uses deterministic injected internal IDs", () => {
	const idFactory = sequenceIdFactory("project-1", "collection-1", "folder-1", "source-1");

	assert.equal(createEmptyProject({ idFactory }).internalId, "project-1");
	assert.equal(createCollection({ idFactory }).internalId, "collection-1");
	assert.equal(createFolder({ idFactory }).internalId, "folder-1");
	assert.equal(createSource({ category: SOURCE_CATEGORIES.OPAQUE, idFactory }).internalId, "source-1");
});

test("keeps builder identity separate from blank or duplicate Nuvio-facing IDs", () => {
	const first = createCollection({ idFactory: () => "collection-a", editable: { id: "" } });
	const second = createCollection({ idFactory: () => "collection-b", editable: { id: "" } });

	assert.equal(first.editable.id, second.editable.id);
	assert.notEqual(first.internalId, second.internalId);
});

test("retains identity after renaming, source edits, and reordering", () => {
	const original = buildProject();
	const renamed = updateEditableValues(original, "collection-1", { title: "Renamed" });
	const edited = updateEditableValues(renamed, "source-1", {
		filters: { withKeywords: "15097", withGenres: "28" },
	});
	const reordered = moveNode(edited, "source-2", 0);

	assert.equal(findNodeByInternalId(renamed, "collection-1").internalId, "collection-1");
	assert.equal(findNodeByInternalId(edited, "source-1").internalId, "source-1");
	assert.deepEqual(
		findNodeByInternalId(reordered, "folder-1").sources.map((source) => source.internalId),
		["source-2", "source-1"],
	);
	assert.deepEqual(findNodeByInternalId(reordered, "source-1").rawImported, {
		communitySourceSentinel: "source-one",
	});
});

test("inserts, moves, and removes ordered children", () => {
	const original = buildProject();
	const third = createSource({ category: SOURCE_CATEGORIES.OPAQUE, idFactory: () => "source-3" });
	const inserted = insertChild(original, "folder-1", third, 1);
	const moved = moveNode(inserted, "source-3", 0);
	const removed = removeNode(moved, "source-1");

	assert.deepEqual(
		findNodeByInternalId(inserted, "folder-1").sources.map((source) => source.internalId),
		["source-1", "source-3", "source-2"],
	);
	assert.deepEqual(
		findNodeByInternalId(moved, "folder-1").sources.map((source) => source.internalId),
		["source-3", "source-1", "source-2"],
	);
	assert.deepEqual(
		findNodeByInternalId(removed, "folder-1").sources.map((source) => source.internalId),
		["source-3", "source-2"],
	);
	assert.deepEqual(
		findNodeByInternalId(original, "folder-1").sources.map((source) => source.internalId),
		["source-1", "source-2"],
	);
});

test("operations are immutable and retain untouched branches", () => {
	const original = buildProject();
	const originalCollections = original.collections;
	const originalSources = findNodeByInternalId(original, "folder-1").sources;
	const updated = updateEditableValues(original, "source-1", { sortBy: "vote_average.desc" });

	assert.notEqual(updated, original);
	assert.notEqual(updated.collections, originalCollections);
	assert.notEqual(findNodeByInternalId(updated, "folder-1").sources, originalSources);
	assert.equal(findNodeByInternalId(original, "source-1").editable.sortBy, undefined);
	assert.equal(findNodeByInternalId(updated, "source-1").editable.sortBy, "vote_average.desc");
	assert.deepEqual(originalSources.map((source) => source.internalId), ["source-1", "source-2"]);
});

test("deep-clones raw imported snapshots and never mutates them during operations", () => {
	const rawImported = { unknown: { nested: ["preserve", { value: 7 }] } };
	const collection = createCollection({
		idFactory: () => "collection-raw",
		editable: { title: "Editable title" },
		rawImported,
	});
	rawImported.unknown.nested[1].value = 99;

	let project = createEmptyProject({ idFactory: () => "project-raw" });
	project = insertChild(project, project.internalId, collection);
	const before = structuredClone(findNodeByInternalId(project, "collection-raw").rawImported);
	const updated = updateEditableValues(project, "collection-raw", { title: "Changed title" });

	assert.equal(findNodeByInternalId(project, "collection-raw").rawImported.unknown.nested[1].value, 7);
	assert.deepEqual(findNodeByInternalId(updated, "collection-raw").rawImported, before);
	assert.deepEqual(rawImported, { unknown: { nested: ["preserve", { value: 99 }] } });
});

test("rejects sparse arrays recursively in editable and raw imported data", () => {
	const sparseArray = [];
	sparseArray.length = 2;
	sparseArray[1] = "present";

	assert.throws(
		() => cloneJsonValue({ nested: sparseArray }, "editable"),
		/editable must not contain sparse arrays/,
	);
	assert.throws(
		() => createCollection({ idFactory: () => "collection-sparse", rawImported: { nested: sparseArray } }),
		/rawImported must not contain sparse arrays/,
	);
});

test("preserves opaque community sentinels in collection, folder, and source raw snapshots", () => {
	const fixturePath = path.join(rootDir, "tests", "fixtures", "nuvio", "valid", "opaque-community-import.json");
	const [rawCollection] = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
	const rawFolder = rawCollection.folders[0];
	const rawSource = rawFolder.sources[0];
	const collection = createCollection({ idFactory: () => "collection-community", rawImported: rawCollection });
	const folder = createFolder({ idFactory: () => "folder-community", rawImported: rawFolder });
	const source = createSource({
		category: SOURCE_CATEGORIES.OPAQUE,
		idFactory: () => "source-community",
		rawImported: rawSource,
	});

	assert.deepEqual(collection.rawImported.communityMetadata, { owner: "fixture-sentinel", revision: 7 });
	assert.deepEqual(folder.rawImported.communityLayout, { density: "compact", accent: "violet" });
	assert.deepEqual(source.rawImported.communityOptions, { quality: "curated", includeUnreleased: false });
	assert.equal(source.rawImported.unknownBoolean, true);
});

test("keeps imported catalogSources only in the raw folder snapshot", () => {
	const rawFolder = {
		id: "folder-addon",
		sources: [{ addonId: "example", type: "movie", catalogId: "catalog" }],
		catalogSources: [{ addonId: "example", type: "movie", catalogId: "catalog" }],
	};
	const folder = createFolder({ idFactory: () => "folder-addon", rawImported: rawFolder });

	assert.deepEqual(folder.sources, []);
	assert.equal(Object.hasOwn(folder, "catalogSources"), false);
	assert.deepEqual(folder.rawImported.catalogSources, rawFolder.catalogSources);
});

test("requires explicit native TMDB, addon, or opaque source categories", () => {
	for (const category of Object.values(SOURCE_CATEGORIES)) {
		assert.equal(createSource({ category, idFactory: () => category }).category, category);
	}

	assert.throws(
		() => createSource({
			idFactory: () => "guessed-source",
			editable: { addonId: "community.example", type: "movie", catalogId: "editor-picks" },
		}),
		/Unknown source category/,
	);
	assert.throws(
		() => createSource({ category: "community", idFactory: () => "invalid-source" }),
		/Unknown source category/,
	);
});

test("detects duplicate internal IDs across the complete project tree", () => {
	let project = createEmptyProject({ idFactory: () => "duplicate" });
	project = insertChild(project, project.internalId, createCollection({ idFactory: () => "collection" }));
	project = insertChild(project, "collection", createFolder({ idFactory: () => "duplicate" }));

	assert.deepEqual(checkInternalIdUniqueness(project), {
		unique: false,
		duplicates: [{ internalId: "duplicate", count: 2, nodeTypes: ["project", "folder"] }],
	});
});

test("traverses the hierarchy in order and locates nodes by internal ID", () => {
	const project = buildProject();

	assert.deepEqual(
		traverseProject(project).map((node) => node.internalId),
		["project-1", "collection-1", "folder-1", "source-1", "source-2"],
	);
	assert.equal(findNodeByInternalId(project, "folder-1").nodeType, NODE_TYPES.FOLDER);
	assert.equal(findNodeByInternalId(project, "missing"), undefined);
});

test("complete projects support structuredClone and JSON.stringify", () => {
	const project = buildProject();
	const clone = structuredClone(project);
	const parsed = JSON.parse(JSON.stringify(project));

	assert.deepEqual(clone, project);
	assert.deepEqual(parsed, project);
});
