import assert from "node:assert/strict";
import test from "node:test";

import { createBuilderController } from "../builder/src/application/index.js";
import { NUVIO_INVISIBLE_TITLE } from "../builder/src/nuvio/titles.js";
import {
	DEFAULT_NETWORK_SERIES_COUNT_FILTER,
	networkMatchesSeriesCountFilter,
	NETWORK_SERIES_COUNT_FILTERS,
	NETWORK_SERIES_COUNT_FILTER_OPTIONS,
	normalizeNetworkCatalogue,
	searchNetworkCatalogue,
} from "../builder/src/source-add/network-catalogue.js";
import {
	DEFAULT_NETWORK_ARTWORK_ORIENTATION,
	NETWORK_ARTWORK_ORIENTATIONS,
	resolveNetworkFolderArtworkBatch,
} from "../builder/src/source-add/network-folder-artwork.js";
import {
	applyNetworkHierarchyPlan,
	createNetworkHierarchyPlan,
	DEFAULT_NETWORK_FOLDER_TITLE_VISIBILITY,
	inspectNetworkHierarchyPlacement,
	NETWORK_PLACEMENT_STATUSES,
	validateNetworkHierarchyPlan,
} from "../builder/src/source-add/network-plan.js";
import {
	createNetworkSelectionState,
	networkSelectionNotice,
	removeSelectedNetwork,
	selectedNetworks,
	toggleSelectedNetwork,
} from "../builder/src/source-add/network-selection-state.js";
import {
	buildNetworkHierarchySourceDraft,
	buildNetworkSourceDraft,
	NETWORK_SORT_OPTIONS,
	validateNetworkHierarchySourceDraft,
	validateNetworkSourceDraft,
} from "../builder/src/source-add/network-source.js";

function idFactory(prefix = "node") {
	let next = 0;
	return () => `${prefix}-${++next}`;
}

function controller() {
	return createBuilderController({ idFactory: idFactory(), nuvioIdFactory: idFactory("nuvio"), initialProjectTitle: "Network hierarchy" });
}

function network(id, overrides = {}) {
	return Object.freeze({
		id,
		name: `Network ${id}`,
		country: "US",
		headquarters: "New York City, New York",
		location: "US · New York City, New York",
		logoPath: `/network-${id}.png`,
		seriesCount: id * 10,
		...overrides,
	});
}

function artwork(item, orientation = DEFAULT_NETWORK_ARTWORK_ORIENTATION, overrides = {}) {
	return Object.freeze({
		networkId: item.id,
		orientation,
		tileShape: orientation,
		source: "tmdb-logo",
		previewUrl: `https://image.tmdb.org/t/p/w500/network-${item.id}.png`,
		folderEditable: Object.freeze({ coverImageUrl: `https://image.tmdb.org/t/p/w500/network-${item.id}.png` }),
		...overrides,
	});
}

function planEntries(items, orientation = DEFAULT_NETWORK_ARTWORK_ORIENTATION) {
	return items.map((item) => ({ network: item, artwork: artwork(item, orientation) }));
}

test("Network catalogue filters expose nullable counts while retaining the Most-series discovery order", async () => {
	const catalogue = normalizeNetworkCatalogue([
		{ i: 1, n: "Alpha", t: 0 },
		{ i: 2, n: "Beta", t: 10 },
		{ i: 3, n: "Gamma", t: 50 },
		{ i: 4, n: "Delta", t: 100 },
		{ i: 5, n: "Epsilon", t: 500 },
		{ i: 6, n: "Unknown", t: -1 },
	]);
	const ordinary = searchNetworkCatalogue(catalogue, { kind: "browse" });
	assert.deepEqual(ordinary.results.map((entry) => entry.name), ["Epsilon", "Delta", "Gamma", "Beta", "Alpha", "Unknown"]);
	assert.ok(ordinary.results.every((entry) => !Object.hasOwn(entry, "seriesCount")));
	assert.equal(DEFAULT_NETWORK_SERIES_COUNT_FILTER, NETWORK_SERIES_COUNT_FILTERS.ALL);
	assert.deepEqual(NETWORK_SERIES_COUNT_FILTER_OPTIONS.map((entry) => entry.label), ["All", "Exclude 0", "10+", "50+", "100+", "500+"]);
	const all = searchNetworkCatalogue(catalogue, { kind: "browse" }, { seriesCountFilter: NETWORK_SERIES_COUNT_FILTERS.ALL });
	assert.deepEqual(all.results.map((entry) => entry.seriesCount), [500, 100, 50, 10, 0, null]);
	assert.deepEqual(searchNetworkCatalogue(catalogue, { kind: "browse" }, { seriesCountFilter: NETWORK_SERIES_COUNT_FILTERS.EXCLUDE_ZERO }).results.map((entry) => entry.id), [5, 4, 3, 2, 6]);
	assert.deepEqual(searchNetworkCatalogue(catalogue, { kind: "browse" }, { seriesCountFilter: NETWORK_SERIES_COUNT_FILTERS.AT_LEAST_10 }).results.map((entry) => entry.id), [5, 4, 3, 2]);
	assert.deepEqual(searchNetworkCatalogue(catalogue, { kind: "browse" }, { seriesCountFilter: NETWORK_SERIES_COUNT_FILTERS.AT_LEAST_50 }).results.map((entry) => entry.id), [5, 4, 3]);
	assert.deepEqual(searchNetworkCatalogue(catalogue, { kind: "browse" }, { seriesCountFilter: NETWORK_SERIES_COUNT_FILTERS.AT_LEAST_100 }).results.map((entry) => entry.id), [5, 4]);
	assert.deepEqual(searchNetworkCatalogue(catalogue, { kind: "browse" }, { seriesCountFilter: NETWORK_SERIES_COUNT_FILTERS.AT_LEAST_500 }).results.map((entry) => entry.id), [5]);
	assert.equal(networkMatchesSeriesCountFilter(catalogue.byId.get(6), NETWORK_SERIES_COUNT_FILTERS.EXCLUDE_ZERO), true);
	assert.throws(() => searchNetworkCatalogue(catalogue, { kind: "browse" }, { seriesCountFilter: "unsupported" }), /supported Network result sort and Series Count filter/);
});

test("hierarchy source construction uses Series without weakening existing Network draft validation", () => {
	const item = network(2, { name: "ABC" });
	const ordinary = buildNetworkSourceDraft(item, { sortOptionId: "recent" });
	const hierarchy = buildNetworkHierarchySourceDraft(item, { sortOptionId: "recent" });
	assert.equal(ordinary.draft.editable.title, "ABC");
	assert.equal(hierarchy.draft.editable.title, "Series");
	assert.equal(hierarchy.draft.editable.sortBy, "first_air_date.desc");
	assert.equal(validateNetworkHierarchySourceDraft(hierarchy.draft, { network: item }).ok, true);
	assert.equal(validateNetworkSourceDraft(hierarchy.draft, { network: item }).ok, false);
	assert.equal(validateNetworkHierarchySourceDraft(ordinary.draft, { network: item }).ok, false);
});

test("all four shared Network sorts build exact hierarchy Series drafts", () => {
	const item = network(2, { name: "ABC" });
	for (const option of NETWORK_SORT_OPTIONS) {
		const result = buildNetworkHierarchySourceDraft(item, { sortOptionId: option.id });
		assert.equal(result.ok, true);
		assert.deepEqual(result.draft.editable, {
			title: "Series",
			sortBy: option.value,
			tmdbId: 2,
			filters: {},
			provider: "tmdb",
			mediaType: "TV",
			tmdbSourceType: "NETWORK",
		});
	}
});

test("ordered Network selection remains uncapped through 125 and re-adds at the end", () => {
	let state = createNetworkSelectionState();
	for (let id = 1; id <= 125; id += 1) state = toggleSelectedNetwork(state, network(id)).state;
	assert.equal(selectedNetworks(state).length, 125);
	assert.deepEqual(selectedNetworks(state).slice(-3).map((entry) => entry.id), [123, 124, 125]);
	assert.deepEqual(networkSelectionNotice(state), { visible: true, count: 125, threshold: 50 });
	state = removeSelectedNetwork(state, 50);
	state = toggleSelectedNetwork(state, network(50)).state;
	assert.equal(selectedNetworks(state).at(-1).id, 50);
});

test("one runtime load resolves requested Poster and Landscape batches then falls back to logo and television emoji", async () => {
	let loads = 0;
	const requests = [];
	const client = {
		async load() { loads += 1; return {}; },
		async resolve(request) {
			requests.push(request);
			return request.tmdbId === 1
				? { ...request, status: "ready", assetUrl: `https://assets.example/${request.orientation}-1.webp` }
				: { ...request, status: "missing" };
		},
	};
	const items = [network(1), network(2), network(3, { logoPath: null })];
	const poster = await resolveNetworkFolderArtworkBatch(items, client);
	const landscape = await resolveNetworkFolderArtworkBatch(items, client, { orientation: NETWORK_ARTWORK_ORIENTATIONS.LANDSCAPE });
	assert.equal(loads, 2);
	assert.deepEqual(requests.slice(0, 3).map((entry) => entry.orientation), ["poster", "poster", "poster"]);
	assert.deepEqual(requests.slice(3).map((entry) => entry.orientation), ["landscape", "landscape", "landscape"]);
	assert.deepEqual(poster.map((entry) => entry.source), ["runtime", "tmdb-logo", "emoji"]);
	assert.equal(poster[1].folderEditable.coverImageUrl, "https://image.tmdb.org/t/p/w500/network-2.png");
	assert.deepEqual(poster[2].folderEditable, { coverImageUrl: "", coverEmoji: "📺" });
	assert.ok(landscape.every((entry) => entry.tileShape === "LANDSCAPE"));
});

test("malformed or mismatched runtime artwork is nonblocking and uses only the approved fallback chain", async () => {
	const client = {
		async load() { return {}; },
		async resolve(request) {
			if (request.tmdbId === 1) return { ...request, status: "ready", assetUrl: "http://unsafe.example/network.jpg" };
			if (request.tmdbId === 2) return { ...request, tmdbId: 999, status: "ready", assetUrl: "https://assets.example/wrong-network.jpg" };
			return { ...request, orientation: "landscape", status: "ready", assetUrl: "https://assets.example/wrong-orientation.jpg" };
		},
	};
	const resolved = await resolveNetworkFolderArtworkBatch([
		network(1),
		network(2, { logoPath: null }),
		network(3),
	], client, { orientation: NETWORK_ARTWORK_ORIENTATIONS.POSTER });
	assert.deepEqual(resolved.map((entry) => entry.source), ["tmdb-logo", "emoji", "tmdb-logo"]);
	assert.equal(resolved[0].folderEditable.coverImageUrl, "https://image.tmdb.org/t/p/w500/network-1.png");
	assert.deepEqual(resolved[1].folderEditable, { coverImageUrl: "", coverEmoji: "📺" });
	assert.equal(resolved[2].folderEditable.coverImageUrl, "https://image.tmdb.org/t/p/w500/network-3.png");
});

test("Network plans cover 1, 3, 20, 50, 100 and 125 selections and apply 100 atomically", () => {
	for (const count of [1, 3, 20, 50, 100, 125]) {
		const app = controller();
		const before = app.getState();
		const items = Array.from({ length: count }, (_, index) => network(index + 1));
		const result = createNetworkHierarchyPlan(before.project, { scope: "new-collection", projectRevision: before.revision, networks: planEntries(items) });
		assert.equal(result.ok, true);
		assert.deepEqual(result.plan.counts, { collectionCount: 1, folderCount: count, sourceCount: count });
		assert.deepEqual(result.plan.collections[0].folders.map((folder) => folder.networkId), items.map((item) => item.id));
		assert.equal(JSON.stringify(result.plan).includes("seriesCount"), false);
		if (count === 100) {
			const applied = applyNetworkHierarchyPlan(app, result.plan);
			assert.equal(applied.ok, true);
			assert.equal(app.getState().revision, before.revision + 1);
			assert.equal(app.getState().project.collections[0].folders.length, 100);
		}
	}
});

test("Network plan defaults to Networks, Popular, Show everywhere, Poster, canonical folders and Series sources", () => {
	const app = controller();
	const before = app.getState();
	const item = network(2, { name: "ABC" });
	const result = createNetworkHierarchyPlan(before.project, { scope: "new-collection", projectRevision: before.revision, networks: planEntries([item]) });
	assert.equal(result.ok, true);
	assert.equal(result.plan.configuration.collectionTitle, "Networks");
	assert.equal(result.plan.configuration.sortOptionId, "popular");
	assert.equal(result.plan.configuration.folderTitleVisibility, DEFAULT_NETWORK_FOLDER_TITLE_VISIBILITY);
	assert.equal(result.plan.configuration.artworkOrientation, "POSTER");
	const folder = result.plan.collections[0].folders[0];
	assert.equal(folder.editable.title, "ABC");
	assert.equal(folder.editable.hideTitle, false);
	assert.equal(folder.editable.tileShape, "POSTER");
	assert.equal(folder.sources[0].draft.editable.title, "Series");
});

test("Network hidden collection output does not require its remembered visible title draft", () => {
	const app = controller();
	const state = app.getState();
	const hidden = createNetworkHierarchyPlan(state.project, { scope: "new-collection", projectRevision: state.revision, collectionTitle: "", hideCollectionTitle: true, networks: planEntries([network(2)]) });
	assert.equal(hidden.ok, true);
	assert.equal(hidden.plan.configuration.collectionTitle, "");
	assert.equal(hidden.plan.collections[0].editable.title, NUVIO_INVISIBLE_TITLE);
	assert.equal(createNetworkHierarchyPlan(state.project, { scope: "new-collection", projectRevision: state.revision, collectionTitle: "", hideCollectionTitle: false, networks: planEntries([network(2)]) }).ok, false);
});

test("New Folder distinguishes Already, Elsewhere and Ready without a Partial state", () => {
	const app = controller();
	const destination = app.createCollection({ editable: { title: "Destination" } });
	const existing = app.createFolder(destination.createdInternalId, { editable: { title: "Existing" } });
	const elsewhereCollection = app.createCollection({ editable: { title: "Elsewhere" } });
	const elsewhereFolder = app.createFolder(elsewhereCollection.createdInternalId, { editable: { title: "Other" } });
	for (const [folderId, item] of [[existing.createdInternalId, network(1)], [elsewhereFolder.createdInternalId, network(2)]]) {
		assert.equal(app.createSource(folderId, buildNetworkHierarchySourceDraft(item).draft).ok, true);
	}
	const before = app.getState();
	const items = [network(1), network(2), network(3)];
	const result = createNetworkHierarchyPlan(before.project, { scope: "new-folder", projectRevision: before.revision, destinationCollectionInternalId: destination.createdInternalId, networks: planEntries(items) });
	assert.equal(result.ok, true);
	assert.deepEqual(Object.keys(NETWORK_PLACEMENT_STATUSES), ["READY", "ALREADY_IN_COLLECTION", "EXISTS_ELSEWHERE"]);
	assert.deepEqual(result.plan.outcomes.map((outcome) => outcome.status), [NETWORK_PLACEMENT_STATUSES.ALREADY_IN_COLLECTION, NETWORK_PLACEMENT_STATUSES.EXISTS_ELSEWHERE, NETWORK_PLACEMENT_STATUSES.READY]);
	assert.deepEqual(result.plan.folders.map((folder) => folder.networkId), [2, 3]);
	assert.equal(inspectNetworkHierarchyPlacement(before.project, result.plan.folders[0].sources[0].draft, { destinationCollectionInternalId: destination.createdInternalId }).status, NETWORK_PLACEMENT_STATUSES.EXISTS_ELSEWHERE);
});

test("Network apply is one atomic revision and stale destination placement leaves the project unchanged", () => {
	const app = controller();
	const destination = app.createCollection({ editable: { title: "Destination" } });
	let before = app.getState();
	const item = network(8);
	const planned = createNetworkHierarchyPlan(before.project, { scope: "new-folder", projectRevision: before.revision, destinationCollectionInternalId: destination.createdInternalId, networks: planEntries([item]) });
	assert.equal(planned.ok, true);
	const blocker = app.createFolder(destination.createdInternalId, { editable: { title: "Later" } });
	assert.equal(app.createSource(blocker.createdInternalId, buildNetworkHierarchySourceDraft(item).draft).ok, true);
	before = app.getState();
	assert.equal(validateNetworkHierarchyPlan(planned.plan, { project: before.project, projectRevision: before.revision }).ok, false);
	const snapshot = JSON.stringify(before.project);
	const applied = applyNetworkHierarchyPlan(app, planned.plan);
	assert.equal(applied.ok, false);
	assert.equal(JSON.stringify(app.getState().project), snapshot);
	assert.equal(app.getState().revision, before.revision);
});

test("New Folder apply preserves its parent byte-for-byte apart from appended folders", () => {
	const app = controller();
	const destination = app.createCollection({ editable: { title: "Destination", viewMode: "ROWS", showAllTab: true, pinToTop: true, focusGlowEnabled: false } });
	const before = app.getState();
	const parentBefore = before.project.collections.find((entry) => entry.internalId === destination.createdInternalId);
	const parentSnapshot = JSON.stringify({ ...parentBefore, folders: [] });
	const planned = createNetworkHierarchyPlan(before.project, { scope: "new-folder", projectRevision: before.revision, destinationCollectionInternalId: destination.createdInternalId, artworkOrientation: "LANDSCAPE", networks: planEntries([network(31), network(32)], "LANDSCAPE") });
	const applied = applyNetworkHierarchyPlan(app, planned.plan);
	assert.equal(applied.ok, true);
	const parentAfter = app.getState().project.collections.find((entry) => entry.internalId === destination.createdInternalId);
	assert.equal(JSON.stringify({ ...parentAfter, folders: [] }), parentSnapshot);
	assert.deepEqual(parentAfter.folders.map((folder) => folder.sources[0].editable.title), ["Series", "Series"]);
	assert.ok(parentAfter.folders.every((folder) => folder.editable.tileShape === "LANDSCAPE"));
	assert.ok(parentAfter.folders.every((folder) => folder.sources.every((source) => source.catalogSources === undefined)));
});

test("a late Network bundle failure rolls back every node and revision", () => {
	let calls = 0;
	const failingFactory = () => {
		calls += 1;
		if (calls === 5) throw new Error("late Network bundle failure");
		return `failing-${calls}`;
	};
	const app = createBuilderController({ idFactory: failingFactory, nuvioIdFactory: idFactory("nuvio"), initialProjectTitle: "Network rollback" });
	const before = app.getState();
	const planned = createNetworkHierarchyPlan(before.project, { scope: "new-collection", projectRevision: before.revision, networks: planEntries([network(41), network(42)]) });
	assert.equal(planned.ok, true);
	const result = applyNetworkHierarchyPlan(app, planned.plan);
	assert.equal(result.ok, false);
	assert.equal(app.getState().project, before.project);
	assert.equal(app.getState().revision, before.revision);
});
