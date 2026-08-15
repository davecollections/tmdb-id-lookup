import assert from "node:assert/strict";
import test from "node:test";

import { createBuilderController } from "../builder/src/application/index.js";

function countingFactory(prefix) {
	let count = 0;
	return Object.assign(() => `${prefix}-${++count}`, { calls: () => count });
}

function sequenceFactory(...values) {
	let index = 0;
	return Object.assign(() => {
		if (index >= values.length) throw new Error("Sequence exhausted");
		const value = values[index++];
		if (value instanceof Error) throw value;
		return value;
	}, { calls: () => index });
}

function collectionBundle(title, folderTitle = "1980s", sourceTitle = "1980s Movies") {
	return {
		collection: { editable: { title, viewMode: "TABBED_GRID", showAllTab: true } },
		folders: [{
			folder: { editable: { title: folderTitle, tileShape: "POSTER", hideTitle: true } },
			sources: [{
				category: "native-tmdb",
				editable: {
					title: sourceTitle,
					provider: "tmdb",
					tmdbSourceType: "DISCOVER",
					mediaType: title.startsWith("TV") ? "TV" : "MOVIE",
					sortBy: "popularity.desc",
					tmdbId: null,
					filters: { releaseDateGte: "1980-01-01", releaseDateLte: "1989-12-31" },
				},
			}],
		}],
	};
}

test("atomic multi-collection hierarchy creation commits every bundle in one revision", () => {
	const controller = createBuilderController({
		idFactory: countingFactory("internal"),
		nuvioIdFactory: countingFactory("nuvio"),
	});
	const existing = controller.createCollection({ editable: { title: "Existing" } });
	controller.selectNode(existing.createdInternalId);
	const beforeRevision = controller.getState().revision;
	const result = controller.createCollectionsWithFoldersAndSources({
		bundles: [
			collectionBundle("Movie Decades"),
			collectionBundle("TV Decades", "1980s", "1980s Series"),
		],
	});

	assert.equal(result.ok, true);
	assert.equal(controller.getState().revision, beforeRevision + 1);
	assert.deepEqual(controller.getState().project.collections.map((collection) => collection.editable.title), [
		"Existing", "Movie Decades", "TV Decades",
	]);
	assert.deepEqual(controller.getState().project.collections.slice(1).map((collection) => collection.folders[0].sources[0].editable.title), [
		"1980s Movies", "1980s Series",
	]);
	assert.equal(result.createdCollectionInternalIds.length, 2);
	assert.equal(result.createdFolderInternalIds.length, 2);
	assert.equal(result.createdSourceInternalIds.length, 2);
	assert.deepEqual(controller.getState().selection, {
		collectionInternalId: existing.createdInternalId,
		folderInternalId: null,
		sourceInternalId: null,
	});
});

test("all hierarchy arguments validate before candidate construction", () => {
	const internalIds = countingFactory("internal");
	const nuvioIds = countingFactory("nuvio");
	const controller = createBuilderController({ idFactory: internalIds, nuvioIdFactory: nuvioIds });
	const before = controller.getState();
	const invalid = collectionBundle("Movie Decades");
	invalid.folders[0].sources[0].category = "unsupported";
	const result = controller.createCollectionsWithFoldersAndSources({
		bundles: [collectionBundle("First"), invalid],
	});
	assert.equal(result.ok, false);
	assert.equal(result.errors[0].code, "INVALID_CONTROLLER_ARGUMENT");
	assert.equal(controller.getState().revision, before.revision);
	assert.deepEqual(controller.getState().project, before.project);
	assert.equal(internalIds.calls(), 1);
	assert.equal(nuvioIds.calls(), 0);
});

test("a collection internal-ID collision rolls back without content or revision mutation", () => {
	const controller = createBuilderController({
		idFactory: sequenceFactory("project", "project"),
		nuvioIdFactory: countingFactory("nuvio"),
	});
	const before = controller.getState();
	const result = controller.createCollectionsWithFoldersAndSources({ bundles: [collectionBundle("Movie Decades")] });
	assert.equal(result.ok, false);
	assert.equal(result.errors[0].code, "INTERNAL_ID_COLLISION");
	assert.equal(controller.getState().revision, before.revision);
	assert.deepEqual(controller.getState().project, before.project);
});

test("folder or source candidate collisions produce the same full rollback guarantee", () => {
	for (const sequence of [
		["project", "collection", "collection"],
		["project", "collection", "folder", "folder"],
	]) {
		const controller = createBuilderController({
			idFactory: sequenceFactory(...sequence),
			nuvioIdFactory: countingFactory("nuvio"),
		});
		const before = controller.getState();
		const result = controller.createCollectionsWithFoldersAndSources({ bundles: [collectionBundle("Movie Decades")] });
		assert.equal(result.ok, false);
		assert.equal(result.errors[0].code, "INTERNAL_ID_COLLISION");
		assert.equal(controller.getState().revision, before.revision);
		assert.deepEqual(controller.getState().project, before.project);
	}
});

test("collection Nuvio-ID generation failure leaves the document untouched", () => {
	const controller = createBuilderController({
		idFactory: countingFactory("internal"),
		nuvioIdFactory: () => { throw new Error("no Nuvio ID"); },
	});
	const before = controller.getState();
	const result = controller.createCollectionsWithFoldersAndSources({ bundles: [collectionBundle("Movie Decades")] });
	assert.equal(result.ok, false);
	assert.equal(result.errors[0].code, "NUVIO_ID_GENERATION_FAILED");
	assert.equal(controller.getState().revision, before.revision);
	assert.deepEqual(controller.getState().project, before.project);
});

test("failure after an earlier collection is fully built cannot leave that collection behind", () => {
	const controller = createBuilderController({
		idFactory: countingFactory("internal"),
		nuvioIdFactory: sequenceFactory("collection-1", "folder-1", "collection-2", new Error("later folder ID failure")),
	});
	const before = controller.getState();
	const result = controller.createCollectionsWithFoldersAndSources({
		bundles: [
			collectionBundle("Movie Decades"),
			collectionBundle("TV Decades", "1980s", "1980s Series"),
		],
	});
	assert.equal(result.ok, false);
	assert.equal(result.errors[0].code, "NUVIO_ID_GENERATION_FAILED");
	assert.equal(controller.getState().revision, before.revision);
	assert.deepEqual(controller.getState().project, before.project);
	assert.deepEqual(controller.getState().selection, before.selection);
	assert.equal(controller.getState().diagnostics.operation.errors[0].code, "NUVIO_ID_GENERATION_FAILED");
});
