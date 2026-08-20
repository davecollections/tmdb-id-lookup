import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createBuilderController } from "../builder/src/application/index.js";
import {
	buildNetworkSourceDraft,
	createNetworkCatalogueProvider,
	createNetworkSource,
	createTmdbNetworkCountProvider,
	DEFAULT_NETWORK_SORT_OPTION_ID,
	formatNetworkLocation,
	inspectNetworkSourceDuplicates,
	networkDuplicateOverrideIdentity,
	networkSortValue,
	networkSourceIdentity,
	NETWORK_SORT_OPTIONS,
	normalizeNetworkCatalogue,
	normalizeNetworkCatalogueRow,
	normalizeTmdbNetworkCountResponse,
	parseNetworkSearchInput,
	searchNetworkCatalogue,
	validateNetworkSourceDraft,
} from "../builder/src/source-add/index.js";
import {
	createNetworkEditCountSession,
	createSourceEditSession,
	NETWORK_SOURCE_EDITOR_ID,
	saveSourceEdit,
	sourceEditorFor,
	updateNetworkSourceSort,
	updateSourceEditTitle,
} from "../builder/src/source-edit/index.js";
import { serializeNuvioProject } from "../builder/src/serialize/index.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function countingIdFactory(prefix = "builder") {
	let count = 0;
	return () => `${prefix}-${++count}`;
}

function network(overrides = {}) {
	return Object.freeze({
		id: 2,
		name: "ABC",
		country: "US",
		headquarters: "New York City, New York",
		location: "US · New York City, New York",
		logoPath: "/abc.png",
		...overrides,
	});
}

function compactRows() {
	return [
		{ i: 20, n: "Beta Network", c: "CA", h: "Toronto", t: 999999 },
		{ i: 2, n: "ABC", c: "US", h: "New York City, New York", l: "/abc.png", t: 1 },
		{ i: 4, n: "Alpha Network", c: "GB", h: "London", t: 0 },
		{ i: 3, n: "ABC Family", c: "US", h: "Burbank, California", t: 5000 },
		{ i: 8, n: "Us TV", c: "JP", h: "Tokyo", t: 9000 },
		{ i: 7, n: "Sparse Network" },
		{ i: 0, n: "Invalid zero" },
		{ i: 2, n: "Duplicate ignored" },
		null,
	];
}

function jsonResponse(value, { status = 200 } = {}) {
	return { ok: status >= 200 && status < 300, status, async json() { return value; } };
}

function createSelectedFolderController({ sources = [], twoFolders = false } = {}) {
	const controller = createBuilderController({
		idFactory: countingIdFactory(),
		nuvioIdFactory: countingIdFactory("nuvio"),
		initialProjectTitle: "Network tests",
	});
	const folders = [{ id: "folder", title: "Networks", sources, catalogSources: [], unknownFolderValue: "preserve" }];
	if (twoFolders) folders.push({ id: "other", title: "Other Networks", sources: [], catalogSources: [] });
	const imported = controller.importValue([{ id: "collection", title: "Series", folders, unknownCollectionValue: true }]);
	assert.equal(imported.ok, true);
	const folder = controller.getState().project.collections[0].folders[0];
	controller.selectNode(folder.internalId);
	return { controller, folder };
}

test("Network input distinguishes browse, typed search, exact positive IDs, and invalid numeric IDs", () => {
	assert.equal(parseNetworkSearchInput("").kind, "empty");
	assert.deepEqual(parseNetworkSearchInput("2"), { kind: "exact", id: 2 });
	assert.equal(parseNetworkSearchInput("A").eligible, false);
	assert.equal(parseNetworkSearchInput("ABC").eligible, true);
	for (const value of ["0", "-2", "+2", "2.5", "2e1", "9007199254740992"]) {
		assert.equal(parseNetworkSearchInput(value).kind, "invalid", value);
	}
});

test("cached Network rows retain a validated internal Series Count while public Add Source results omit it", () => {
	const row = normalizeNetworkCatalogueRow({ i: 2, n: " ABC ", c: "us", h: "New York City, New York", l: "/abc.png", t: 1616 });
	assert.deepEqual(row, {
		id: 2,
		name: "ABC",
		searchName: "abc",
		country: "US",
		searchCountry: row.searchCountry,
		headquarters: "New York City, New York",
		searchHeadquarters: "new york city, new york",
		logoPath: "/abc.png",
		seriesCount: 1616,
	});
	assert.equal(Object.hasOwn(row, "t"), false);
	assert.equal(normalizeNetworkCatalogueRow({ i: 3, n: "Invalid Count", t: -1 }).seriesCount, null);
	assert.equal(normalizeNetworkCatalogueRow({ i: 7, n: "Sparse" }).logoPath, null);
	assert.equal(formatNetworkLocation({ country: "US", headquarters: "123 Main Street, Suite 9, New York City, New York 10001" }), "US · New York City, New York");
});

test("empty Network query browses A–Z with deterministic paging and safe clamping", () => {
	const catalogue = normalizeNetworkCatalogue(compactRows());
	const page1 = searchNetworkCatalogue(catalogue, { kind: "browse" }, { page: 1, pageSize: 2 });
	const page99 = searchNetworkCatalogue(catalogue, { kind: "browse" }, { page: 99, pageSize: 2 });
	assert.deepEqual(page1.results.map((entry) => [entry.name, entry.id]), [["ABC", 2], ["ABC Family", 3]]);
	assert.equal(page1.totalResults, 6);
	assert.equal(page99.page, page99.totalPages);
	assert.deepEqual(page99.results.map((entry) => entry.name), ["Sparse Network", "Us TV"]);
});

test("typed Network Best Match covers exact name, prefix, contains, country aliases, and location", () => {
	const catalogue = normalizeNetworkCatalogue(compactRows());
	const names = (query) => searchNetworkCatalogue(catalogue, parseNetworkSearchInput(query)).results.map((entry) => entry.name);
	assert.deepEqual(names("ABC"), ["ABC", "ABC Family"]);
	assert.deepEqual(names("family"), ["ABC Family"]);
	assert.deepEqual(names("US"), ["ABC", "ABC Family"]);
	assert.deepEqual(names("United States"), ["ABC", "ABC Family"]);
	assert.deepEqual(names("USA"), ["ABC", "ABC Family"]);
	assert.deepEqual(names("California"), ["ABC Family"]);
	assert.deepEqual(names("2"), ["ABC"]);
	assert.equal(names("US").includes("Us TV"), false);
});

test("canonical numeric Network search ranks exact ID before exact and partial numeric names without duplicates", () => {
	const catalogue = normalizeNetworkCatalogue([
		{ i: 10, n: "10 Digital" },
		{ i: 38, n: "10" },
		{ i: 39, n: "101 Network" },
		{ i: 40, n: "Channel 10" },
	]);
	const results = searchNetworkCatalogue(catalogue, parseNetworkSearchInput("10")).results;
	assert.deepEqual(results.map((entry) => [entry.id, entry.name]), [
		[10, "10 Digital"],
		[38, "10"],
		[39, "101 Network"],
		[40, "Channel 10"],
	]);
	assert.equal(new Set(results.map((entry) => entry.id)).size, results.length);
});

test("legacy t never changes Network browse or relevance ordering", () => {
	const first = normalizeNetworkCatalogue([
		{ i: 1, n: "Alpha", t: 1 },
		{ i: 2, n: "Alpine", t: 999999 },
	]);
	const second = normalizeNetworkCatalogue([
		{ i: 1, n: "Alpha", t: 999999 },
		{ i: 2, n: "Alpine", t: 0 },
	]);
	for (const parsed of [{ kind: "browse" }, parseNetworkSearchInput("Al")]) {
		assert.deepEqual(
			searchNetworkCatalogue(first, parsed).results.map((entry) => entry.id),
			searchNetworkCatalogue(second, parsed).results.map((entry) => entry.id),
		);
	}
});

test("Network catalogue provider caches successful data, retries failure, and never calls Discover", async () => {
	const calls = [];
	const provider = createNetworkCatalogueProvider({
		catalogueUrl: "https://static.example/data/tv-networks.min.json",
		fetchImpl: async (url) => { calls.push(url); return jsonResponse(compactRows()); },
	});
	assert.equal((await provider.searchNetworks({ kind: "browse" })).ok, true);
	assert.equal((await provider.searchNetworks(parseNetworkSearchInput("ABC"))).ok, true);
	assert.equal(calls.length, 1);
	assert.match(calls[0], /tv-networks\.min\.json$/);
	assert.equal(calls.some((url) => String(url).includes("discover")), false);

	let attempts = 0;
	const retrying = createNetworkCatalogueProvider({ fetchImpl: async () => { attempts += 1; return attempts === 1 ? jsonResponse({}, { status: 500 }) : jsonResponse(compactRows()); } });
	assert.equal((await retrying.searchNetworks({ kind: "browse" })).ok, false);
	assert.equal((await retrying.searchNetworks({ kind: "browse" })).ok, true);
	assert.equal(attempts, 2);
});

test("checked-in Network catalogue remains searchable without exposing t in normalized results", () => {
	const rows = JSON.parse(fs.readFileSync(path.join(rootDir, "data", "tv-networks.min.json"), "utf8"));
	const catalogue = normalizeNetworkCatalogue(rows);
	const abc = searchNetworkCatalogue(catalogue, parseNetworkSearchInput("2")).results[0];
	assert.equal(abc.name, "ABC");
	assert.equal(abc.id, 2);
	assert.equal(Object.hasOwn(abc, "t"), false);
	assert.equal(Object.hasOwn(abc, "movieCount"), false);
	assert.equal(Object.hasOwn(abc, "seriesCount"), false);
});

test("Network Series Count uses one structured request, preserves zero, caches success, and sanitizes failure", async () => {
	assert.equal(normalizeTmdbNetworkCountResponse({ total_results: 0 }), 0);
	for (const value of [{}, { total_results: -1 }, { total_results: 1.5 }, { total_results: "2" }, null]) {
		assert.equal(normalizeTmdbNetworkCountResponse(value), null);
	}
	const calls = [];
	const provider = createTmdbNetworkCountProvider({
		baseUrl: "https://worker.example",
		fetchImpl: async (url) => { calls.push(url); return jsonResponse({ total_results: 0 }); },
	});
	const first = await provider.getNetworkCount(2);
	const cached = await provider.getNetworkCount(2);
	const invalid = await provider.getNetworkCount(0);
	assert.equal(first.data.count, 0);
	assert.equal(cached.data.fromCache, true);
	assert.equal(invalid.ok, false);
	assert.equal(invalid.error.kind, "invalid-request");
	assert.equal(calls.length, 1);
	assert.equal(calls[0], "https://worker.example/3/discover/tv?with_networks=2");

	const failed = createTmdbNetworkCountProvider({ baseUrl: "https://worker.example", fetchImpl: async () => jsonResponse({}, { status: 503 }) });
	const unavailable = await failed.getNetworkCount(2);
	assert.equal(unavailable.ok, true);
	assert.equal(unavailable.data.status, "unavailable");
	assert.equal(unavailable.data.count, null);
});

test("Network Series Count edit session cancels stale work and exposes no retry API", async () => {
	let capturedSignal;
	const session = createNetworkEditCountSession({
		networkId: 2,
		provider: {
			async getNetworkCount(id, { signal }) {
				assert.equal(id, 2);
				capturedSignal = signal;
				return { ok: true, data: { status: "ready", count: 10 } };
			},
		},
	});
	assert.deepEqual(await session.load(), { status: "ready", count: 10 });
	assert.equal("retry" in session, false);
	session.cancel();
	assert.equal(capturedSignal.aborted, true);
});

test("all four Network sorts build the exact canonical NETWORK/TV source and serialize without a projection", () => {
	for (const option of NETWORK_SORT_OPTIONS) {
		const built = buildNetworkSourceDraft(network(), { sortOptionId: option.id });
		assert.equal(built.ok, true, option.id);
		assert.deepEqual(built.draft.editable, {
			title: "ABC",
			sortBy: networkSortValue(option.id),
			tmdbId: 2,
			filters: {},
			provider: "tmdb",
			mediaType: "TV",
			tmdbSourceType: "NETWORK",
		});
		assert.equal(validateNetworkSourceDraft(built.draft, { network: network() }).ok, true);
	}
	const { controller, folder } = createSelectedFolderController();
	const draft = buildNetworkSourceDraft(network(), { sortOptionId: DEFAULT_NETWORK_SORT_OPTION_ID }).draft;
	assert.equal(createNetworkSource(controller, { folderInternalId: folder.internalId, network: network(), draft }).ok, true);
	const serialized = serializeNuvioProject(controller.getState().project);
	assert.equal(serialized.ok, true);
	assert.deepEqual(serialized.value[0].folders[0].sources, [draft.editable]);
	assert.deepEqual(serialized.value[0].folders[0].catalogSources, []);
	assert.equal(JSON.stringify(serialized.value).includes("count"), false);
});

test("Network duplicate identity ignores title and sort while distinguishing current-folder and elsewhere occurrences", () => {
	assert.equal(networkSourceIdentity({ provider: "TMDB", tmdbSourceType: "network", tmdbId: "02", mediaType: "tv" }), "tmdb|NETWORK|2|TV");
	const existing = { title: "Custom", sortBy: "vote_count.desc", tmdbId: 2, filters: {}, provider: "tmdb", mediaType: "TV", tmdbSourceType: "NETWORK" };
	const { controller, folder } = createSelectedFolderController({ sources: [existing], twoFolders: true });
	const review = inspectNetworkSourceDuplicates(controller.getState().project, folder.internalId, 2);
	assert.equal(review.destination.length, 1);
	assert.equal(review.elsewhere.length, 0);
	const otherFolder = controller.getState().project.collections[0].folders[1];
	const elsewhere = inspectNetworkSourceDuplicates(controller.getState().project, otherFolder.internalId, 2);
	assert.equal(elsewhere.destination.length, 0);
	assert.equal(elsewhere.elsewhere.length, 1);
});

test("same-folder Network duplicates require exact Add-anyway approval and recheck immediately before one atomic insertion", () => {
	const existing = { title: "ABC", sortBy: "vote_count.desc", tmdbId: 2, filters: {}, provider: "tmdb", mediaType: "TV", tmdbSourceType: "NETWORK" };
	const { controller, folder } = createSelectedFolderController({ sources: [existing] });
	const draft = buildNetworkSourceDraft(network()).draft;
	const before = controller.getState().revision;
	const blocked = createNetworkSource(controller, { folderInternalId: folder.internalId, network: network(), draft });
	assert.equal(blocked.ok, false);
	assert.equal(blocked.requiresDuplicateOverride, true);
	assert.equal(controller.getState().revision, before);
	const wrong = createNetworkSource(controller, { folderInternalId: folder.internalId, network: network(), draft, duplicateOverrideIdentity: "generic" });
	assert.equal(wrong.ok, false);
	const approved = createNetworkSource(controller, {
		folderInternalId: folder.internalId,
		network: network(),
		draft,
		duplicateOverrideIdentity: networkDuplicateOverrideIdentity(folder.internalId, draft),
	});
	assert.equal(approved.ok, true);
	assert.equal(approved.duplicateOverrideUsed, true);
	assert.equal(controller.getState().revision, before + 1);
	assert.equal(controller.getState().project.collections[0].folders[0].sources.length, 2);
});

test("Network physical Source Edit changes only title and sort, preserves identity, and keeps no-op/cancel paths mutation-free", () => {
	const existing = { title: "ABC", sortBy: "popularity.desc", tmdbId: 2, filters: {}, provider: "tmdb", mediaType: "TV", tmdbSourceType: "NETWORK", unknownSource: { keep: true } };
	const { controller } = createSelectedFolderController({ sources: [existing] });
	const source = controller.getState().project.collections[0].folders[0].sources[0];
	assert.equal(sourceEditorFor(source).id, NETWORK_SOURCE_EDITOR_ID);
	const opened = createSourceEditSession(controller.getState().project, source.internalId);
	assert.equal(opened.ok, true);
	const before = controller.getState().revision;
	assert.equal(saveSourceEdit(controller, opened.session, opened.draft).ok, true);
	assert.equal(controller.getState().revision, before);
	let changed = updateSourceEditTitle(opened.draft, "ABC Series");
	changed = updateNetworkSourceSort(changed, "first_air_date.desc", "recent");
	const saved = saveSourceEdit(controller, opened.session, changed);
	assert.equal(saved.ok, true);
	assert.deepEqual(saved.patch, { title: "ABC Series", sortBy: "first_air_date.desc" });
	const serialized = serializeNuvioProject(controller.getState().project).value[0].folders[0].sources[0];
	assert.equal(serialized.tmdbId, 2);
	assert.equal(serialized.tmdbSourceType, "NETWORK");
	assert.equal(serialized.mediaType, "TV");
	assert.deepEqual(serialized.filters, {});
	assert.deepEqual(serialized.unknownSource, { keep: true });
});
