import assert from "node:assert/strict";
import test from "node:test";

import { createBuilderController } from "../builder/src/application/index.js";

function countingFactory(prefix) {
	let count = 0;
	return () => `${prefix}-${++count}`;
}

function createController() {
	return createBuilderController({
		idFactory: countingFactory("internal"),
		nuvioIdFactory: countingFactory("nuvio"),
	});
}

function source(title, overrides = {}) {
	return {
		category: "native-tmdb",
		editable: {
			title,
			provider: "tmdb",
			tmdbSourceType: "DISCOVER",
			mediaType: "MOVIE",
			...overrides,
		},
	};
}

function folderBundle(title, sourceTitles) {
	return {
		folder: { editable: { title, tileShape: "POSTER", hideTitle: false } },
		sources: sourceTitles.map((sourceTitle) => source(sourceTitle)),
	};
}

function createCollectionWithFolders(controller, folderTitles) {
	const collection = controller.createCollection({ editable: { title: "Streaming Services" } });
	const folders = folderTitles.map((title) => controller.createFolder(collection.createdInternalId, { editable: { title } }));
	return { collection, folders };
}

function assertProjectUnchanged(controller, before) {
	assert.equal(controller.getState().revision, before.revision);
	assert.deepEqual(controller.getState().project, before.project);
}

test("collection extension creates two new ordered folders and their initial sources in one revision", () => {
	const controller = createController();
	const { collection } = createCollectionWithFolders(controller, []);
	const beforeRevision = controller.getState().revision;

	const result = controller.extendCollectionWithFoldersAndSources(collection.createdInternalId, {
		newFolders: [folderBundle("Netflix", ["Movies (AU)", "Series (AU)"]), folderBundle("Disney+", ["Movies (AU)"])],
	});

	assert.equal(result.ok, true);
	assert.equal(controller.getState().revision, beforeRevision + 1);
	assert.deepEqual(controller.getState().project.collections[0].folders.map((folder) => folder.editable.title), ["Netflix", "Disney+"]);
	assert.deepEqual(controller.getState().project.collections[0].folders.map((folder) => folder.sources.map((entry) => entry.editable.title)), [["Movies (AU)", "Series (AU)"], ["Movies (AU)"]]);
	assert.equal(result.createdFolderInternalIds.length, 2);
	assert.equal(result.createdSourceInternalIds.length, 3);
	assert.deepEqual(result.updatedFolderInternalIds, []);
});

test("collection extension appends to one existing folder in one revision", () => {
	const controller = createController();
	const { collection, folders } = createCollectionWithFolders(controller, ["Netflix"]);
	controller.createSource(folders[0].createdInternalId, source("Movies (AU)"));
	const beforeRevision = controller.getState().revision;

	const result = controller.extendCollectionWithFoldersAndSources(collection.createdInternalId, {
		existingFolderAdditions: [{ folderInternalId: folders[0].createdInternalId, sources: [source("Series (AU)"), source("Movies (US)")] }],
	});

	assert.equal(result.ok, true);
	assert.equal(controller.getState().revision, beforeRevision + 1);
	assert.deepEqual(controller.getState().project.collections[0].folders[0].sources.map((entry) => entry.editable.title), ["Movies (AU)", "Series (AU)", "Movies (US)"]);
	assert.deepEqual(result.updatedFolderInternalIds, [folders[0].createdInternalId]);
});

test("collection extension appends to multiple existing folders in one revision", () => {
	const controller = createController();
	const { collection, folders } = createCollectionWithFolders(controller, ["Netflix", "Disney+"]);
	const beforeRevision = controller.getState().revision;

	const result = controller.extendCollectionWithFoldersAndSources(collection.createdInternalId, {
		existingFolderAdditions: [
			{ folderInternalId: folders[0].createdInternalId, sources: [source("Netflix AU")] },
			{ folderInternalId: folders[1].createdInternalId, sources: [source("Disney AU"), source("Disney US")] },
		],
	});

	assert.equal(result.ok, true);
	assert.equal(controller.getState().revision, beforeRevision + 1);
	assert.deepEqual(controller.getState().project.collections[0].folders.map((folder) => folder.sources.length), [1, 2]);
	assert.deepEqual(result.updatedFolderInternalIds, folders.map((folder) => folder.createdInternalId));
});

test("collection extension atomically mixes an existing Netflix addition with a new Disney+ folder", () => {
	const controller = createController();
	const { collection, folders } = createCollectionWithFolders(controller, ["Netflix"]);
	controller.createSource(folders[0].createdInternalId, source("Movies (AU)"));
	const beforeRevision = controller.getState().revision;

	const result = controller.extendCollectionWithFoldersAndSources(collection.createdInternalId, {
		existingFolderAdditions: [{ folderInternalId: folders[0].createdInternalId, sources: [source("Series (AU)")] }],
		newFolders: [folderBundle("Disney+", ["Movies (AU)", "Series (AU)"])],
	});

	assert.equal(result.ok, true);
	assert.equal(controller.getState().revision, beforeRevision + 1);
	assert.deepEqual(controller.getState().project.collections[0].folders.map((folder) => ({
		title: folder.editable.title,
		sources: folder.sources.map((entry) => entry.editable.title),
	})), [
		{ title: "Netflix", sources: ["Movies (AU)", "Series (AU)"] },
		{ title: "Disney+", sources: ["Movies (AU)", "Series (AU)"] },
	]);
});

test("collection extension applies a larger mixed batch in caller order and one revision", () => {
	const controller = createController();
	const { collection, folders } = createCollectionWithFolders(controller, ["Netflix", "Disney+"]);
	controller.createSource(folders[0].createdInternalId, source("Netflix existing"));
	controller.createSource(folders[1].createdInternalId, source("Disney existing"));
	const beforeRevision = controller.getState().revision;

	const result = controller.extendCollectionWithFoldersAndSources(collection.createdInternalId, {
		existingFolderAdditions: [
			{ folderInternalId: folders[0].createdInternalId, sources: [source("Netflix US movie"), source("Netflix US series")] },
			{ folderInternalId: folders[1].createdInternalId, sources: [source("Disney AU series")] },
		],
		newFolders: [folderBundle("Prime Video", ["Prime AU", "Prime US"]), folderBundle("Stan", ["Stan AU"])],
	});

	assert.equal(result.ok, true);
	assert.equal(controller.getState().revision, beforeRevision + 1);
	assert.deepEqual(controller.getState().project.collections[0].folders.map((folder) => folder.editable.title), ["Netflix", "Disney+", "Prime Video", "Stan"]);
	assert.deepEqual(controller.getState().project.collections[0].folders.map((folder) => folder.sources.map((entry) => entry.editable.title)), [
		["Netflix existing", "Netflix US movie", "Netflix US series"],
		["Disney existing", "Disney AU series"],
		["Prime AU", "Prime US"],
		["Stan AU"],
	]);
});

test("late invalid existing-folder additions fail before any project mutation", () => {
	const controller = createController();
	const { collection, folders } = createCollectionWithFolders(controller, ["Netflix"]);
	const before = controller.getState();

	const result = controller.extendCollectionWithFoldersAndSources(collection.createdInternalId, {
		existingFolderAdditions: [
			{ folderInternalId: folders[0].createdInternalId, sources: [source("Valid first")] },
			{ folderInternalId: "missing-folder", sources: [source("Invalid target")] },
		],
	});

	assert.equal(result.ok, false);
	assert.equal(result.errors[0].code, "TARGET_NODE_NOT_FOUND");
	assertProjectUnchanged(controller, before);
});

test("invalid new-folder work leaves valid existing-folder additions unapplied", () => {
	const controller = createController();
	const { collection, folders } = createCollectionWithFolders(controller, ["Netflix"]);
	const before = controller.getState();

	const result = controller.extendCollectionWithFoldersAndSources(collection.createdInternalId, {
		existingFolderAdditions: [{ folderInternalId: folders[0].createdInternalId, sources: [source("Would be valid")] }],
		newFolders: [{ folder: { editable: { title: "Broken" } }, sources: [{ category: "unsupported", editable: {} }] }],
	});

	assert.equal(result.ok, false);
	assert.equal(result.errors[0].path, "$controller.extendCollectionWithFoldersAndSources.newFolders[0].sources[0]");
	assertProjectUnchanged(controller, before);
});

test("collection extension rejects cross-collection folder targets without mutation", () => {
	const controller = createController();
	const first = createCollectionWithFolders(controller, ["Netflix"]);
	const second = createCollectionWithFolders(controller, ["Disney+"]);
	const before = controller.getState();

	const result = controller.extendCollectionWithFoldersAndSources(first.collection.createdInternalId, {
		existingFolderAdditions: [{ folderInternalId: second.folders[0].createdInternalId, sources: [source("Wrong collection")] }],
	});

	assert.equal(result.ok, false);
	assert.equal(result.errors[0].code, "INVALID_CONTROLLER_ARGUMENT");
	assertProjectUnchanged(controller, before);
});

test("collection extension rejects duplicate existing-folder targets without mutation", () => {
	const controller = createController();
	const { collection, folders } = createCollectionWithFolders(controller, ["Netflix"]);
	const before = controller.getState();

	const result = controller.extendCollectionWithFoldersAndSources(collection.createdInternalId, {
		existingFolderAdditions: [
			{ folderInternalId: folders[0].createdInternalId, sources: [source("First")] },
			{ folderInternalId: folders[0].createdInternalId, sources: [source("Second")] },
		],
	});

	assert.equal(result.ok, false);
	assert.match(result.errors[0].message, /only once/);
	assertProjectUnchanged(controller, before);
});

test("empty collection extension is a true zero-revision zero-notification no-op", () => {
	const controller = createController();
	const { collection } = createCollectionWithFolders(controller, []);
	const before = controller.getState();
	let notifications = 0;
	controller.subscribe(() => { notifications += 1; });

	const result = controller.extendCollectionWithFoldersAndSources(collection.createdInternalId, {});

	assert.equal(result.ok, true);
	assert.equal(controller.getState(), before);
	assert.equal(notifications, 0);
	assert.deepEqual(result.createdFolderInternalIds, []);
	assert.deepEqual(result.createdSourceInternalIds, []);
	assert.deepEqual(result.updatedFolderInternalIds, []);
});

test("effective mixed collection extension emits exactly one normal subscriber notification", () => {
	const controller = createController();
	const { collection, folders } = createCollectionWithFolders(controller, ["Netflix"]);
	const beforeRevision = controller.getState().revision;
	let notifications = 0;
	controller.subscribe(() => { notifications += 1; });

	const result = controller.extendCollectionWithFoldersAndSources(collection.createdInternalId, {
		existingFolderAdditions: [{ folderInternalId: folders[0].createdInternalId, sources: [source("Netflix US")] }],
		newFolders: [folderBundle("Disney+", ["Disney AU"])],
	});

	assert.equal(result.ok, true);
	assert.equal(controller.getState().revision, beforeRevision + 1);
	assert.equal(notifications, 1);
});

test("collection extension preserves imported collection and folder overlays while mixing appended and new content", () => {
	const controller = createController();
	const imported = [{
		id: "streaming-services",
		title: "Imported Streaming",
		viewMode: "ROWS",
		showAllTab: false,
		pinToTop: true,
		backdropImageUrl: "https://image.example/collection.jpg",
		communityCollectionValue: { keep: "collection-overlay" },
		folders: [{
			id: "netflix-folder",
			title: "Imported Netflix",
			hideTitle: true,
			tileShape: "LANDSCAPE",
			coverImageUrl: "https://image.example/folder.jpg",
			heroBackdropUrl: "https://image.example/hero.jpg",
			titleLogoUrl: "https://image.example/title-logo.png",
			focusGifUrl: "https://image.example/focus.gif",
			focusGifEnabled: true,
			communityFolderValue: { keep: "folder-overlay" },
			sources: [
				{ provider: "tmdb", tmdbSourceType: "DISCOVER", title: "Existing native", mediaType: "MOVIE", filters: { watch_region: "AU", with_watch_providers: "8" }, sort: "POPULARITY_DESC" },
				{ provider: "community", title: "Opaque sibling", customOpaque: { keep: true } },
			],
		}],
	}];
	assert.equal(controller.importValue(imported).ok, true);
	const beforeProject = controller.getState().project;
	const beforeCollection = beforeProject.collections[0];
	const beforeFolder = beforeCollection.folders[0];
	const beforeExistingSources = structuredClone(beforeFolder.sources);
	const beforeCollectionWithoutFolders = structuredClone({ ...beforeCollection, folders: undefined });
	const beforeFolderWithoutSources = structuredClone({ ...beforeFolder, sources: undefined });
	const beforeRevision = controller.getState().revision;

	const result = controller.extendCollectionWithFoldersAndSources(beforeCollection.internalId, {
		existingFolderAdditions: [{ folderInternalId: beforeFolder.internalId, sources: [source("Series (AU)", { mediaType: "TV" })] }],
		newFolders: [folderBundle("Disney+", ["Movies (AU)"])],
	});
	const afterCollection = controller.getState().project.collections[0];
	const afterFolder = afterCollection.folders[0];

	assert.equal(result.ok, true);
	assert.equal(controller.getState().revision, beforeRevision + 1);
	assert.deepEqual({ ...afterCollection, folders: undefined }, beforeCollectionWithoutFolders);
	assert.deepEqual({ ...afterFolder, sources: undefined }, beforeFolderWithoutSources);
	assert.deepEqual(afterFolder.sources.slice(0, beforeExistingSources.length), beforeExistingSources);
	assert.deepEqual(afterCollection.rawImported, beforeCollection.rawImported);
	assert.deepEqual(afterFolder.rawImported, beforeFolder.rawImported);
	assert.equal(afterFolder.sources[1].category, "opaque");
	assert.deepEqual(afterFolder.sources[1].rawImported.customOpaque, { keep: true });
	assert.deepEqual(afterCollection.folders.map((folder) => folder.editable.title), ["Imported Netflix", "Disney+"]);
});

test("failed new-folder validation leaves an imported existing folder semantically unchanged", () => {
	const controller = createController();
	assert.equal(controller.importValue([{
		id: "c",
		title: "Imported",
		communityCollectionValue: { keep: true },
		folders: [{ id: "f", title: "Imported folder", communityFolderValue: { keep: true }, sources: [{ provider: "community", customOpaque: "keep" }] }],
	}]).ok, true);
	const before = controller.getState();
	const collection = before.project.collections[0];
	const folder = collection.folders[0];

	const result = controller.extendCollectionWithFoldersAndSources(collection.internalId, {
		existingFolderAdditions: [{ folderInternalId: folder.internalId, sources: [source("Valid append")] }],
		newFolders: [{ folder: { editable: { title: "Invalid" } }, sources: [] }],
	});

	assert.equal(result.ok, false);
	assertProjectUnchanged(controller, before);
});

test("a generated internal-ID collision rolls back the complete collection extension", () => {
	const generatedIds = ["project", "collection", "folder", "folder"];
	let idIndex = 0;
	const controller = createBuilderController({
		idFactory: () => generatedIds[idIndex++] ?? `later-${idIndex}`,
		nuvioIdFactory: countingFactory("nuvio"),
	});
	const { collection, folders } = createCollectionWithFolders(controller, ["Netflix"]);
	const before = controller.getState();

	const result = controller.extendCollectionWithFoldersAndSources(collection.createdInternalId, {
		existingFolderAdditions: [{ folderInternalId: folders[0].createdInternalId, sources: [source("Series (AU)")] }],
	});

	assert.equal(result.ok, false);
	assert.equal(result.errors[0].code, "INTERNAL_ID_COLLISION");
	assertProjectUnchanged(controller, before);
});

test("a late factory failure rolls back earlier detached additions and new-folder work", () => {
	let idCount = 0;
	const controller = createBuilderController({
		idFactory() {
			idCount += 1;
			if (idCount === 5) throw new Error("late factory failure");
			return `internal-${idCount}`;
		},
		nuvioIdFactory: countingFactory("nuvio"),
	});
	const { collection, folders } = createCollectionWithFolders(controller, ["Netflix"]);
	const before = controller.getState();

	const result = controller.extendCollectionWithFoldersAndSources(collection.createdInternalId, {
		existingFolderAdditions: [{ folderInternalId: folders[0].createdInternalId, sources: [source("Series (AU)")] }],
		newFolders: [folderBundle("Disney+", ["Movies (AU)"])],
	});

	assert.equal(result.ok, false);
	assert.equal(result.errors[0].code, "CONTROLLER_OPERATION_FAILED");
	assertProjectUnchanged(controller, before);
});
