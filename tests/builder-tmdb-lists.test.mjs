import assert from "node:assert/strict";
import test from "node:test";

import { createBuilderController } from "../builder/src/application/index.js";
import { NUVIO_INVISIBLE_TITLE } from "../builder/src/nuvio/titles.js";
import {
	applyTmdbListHierarchyPlan,
	buildTmdbEntityPageUrl,
	buildTmdbListSourceDraft,
	createTmdbListHierarchyPlan,
	createTmdbListProvider,
	createTmdbListSourceBundle,
	inspectTmdbListSourceDuplicates,
	listSourceTitlePreviewSummary,
	normalizeTmdbListResponse,
	parseTmdbListBatch,
	parseTmdbListInput,
	requestSourceTitlePreview,
	tmdbListDuplicateOverrideIdentity,
	tmdbListPhysicalIdentity,
	tmdbListSelectionIdentity,
	TMDB_LIST_PLACEMENT_STATUSES,
	validateTmdbListHierarchyPlan,
	validateTmdbListSourceDraft,
} from "../builder/src/source-add/index.js";
import {
	createSourceEditSession,
	prepareSourceEditPreview,
	saveSourceEdit,
	TMDB_LIST_SOURCE_EDITOR_ID,
	updateSourceEditTitle,
} from "../builder/src/source-edit/index.js";

function ids(prefix) { let value = 0; return () => `${prefix}-${++value}`; }
function app() { return createBuilderController({ idFactory: ids("node"), nuvioIdFactory: ids("nuvio"), initialProjectTitle: "TMDB Lists test" }); }
function list(id, overrides = {}) {
	return Object.freeze({
		id,
		name: `List ${id}`,
		description: `Description ${id}`,
		itemCount: 2,
		creator: "Dave",
		posterPath: null,
		items: Object.freeze([
			Object.freeze({ id: id * 10, title: `Movie ${id}`, date: "2020-01-02", releaseYear: 2020, posterPath: `/movie-${id}.jpg`, mediaType: "MOVIE", position: 0 }),
			Object.freeze({ id: id * 10 + 1, title: `Series ${id}`, date: "2021-03-04", releaseYear: 2021, posterPath: `/series-${id}.jpg`, mediaType: "TV", position: 1 }),
		]),
		sourceTitle: `List ${id}`,
		...overrides,
	});
}
function responseBody(id = 123) {
	return {
		id,
		name: "Mixed favourites",
		description: "Public picks",
		item_count: 2,
		created_by: { name: "Dave", username: "fallback" },
		poster_path: "/list.jpg",
		items: [
			{ id: 10, media_type: "movie", title: "Movie", release_date: "2020-01-02", poster_path: "/movie.jpg" },
			{ id: 11, media_type: "tv", name: "Series", first_air_date: "2021-03-04", poster_path: "/series.jpg" },
		],
	};
}

test("strict TMDB List input accepts only canonical int32 IDs and exact public list URLs", () => {
	const inputGuidance = "Enter a numeric TMDB List ID or public themoviedb.org/list URL.";
	for (const [input, id] of [
		["1", 1],
		["2147483647", 2_147_483_647],
		["https://themoviedb.org/list/123", 123],
		["https://www.themoviedb.org/list/456-my-list?language=en#top", 456],
	]) assert.deepEqual(parseTmdbListInput(input), { kind: "exact", inputType: input.startsWith("http") ? "url" : "id", id });
	for (const input of ["0", "01", "2147483648", "-1", "1.5", "1e2", "http://themoviedb.org/list/1", "https://evil.example/list/1", "https://themoviedb.org.evil.example/list/1", "https://user@themoviedb.org/list/1", "https://themoviedb.org:443/list/1", "https://themoviedb.org/list/1/edit", "https://themoviedb.org/list/1/../2", "https://themoviedb.org/movie/1", "https://themoviedb.org/list?id=1"]) assert.equal(parseTmdbListInput(input).kind, "invalid", input);
	assert.equal(parseTmdbListInput("not a list").message, inputGuidance);
	assert.equal(parseTmdbListInput(123).message, inputGuidance);
	assert.equal(parseTmdbListInput(" ").message, inputGuidance);
});

test("multiline parser preserves order, reports per-line failures, and de-duplicates submitted and selected IDs", () => {
	const result = parseTmdbListBatch("10\nhttps://www.themoviedb.org/list/11-eleven\n10\nwrong\n12", { selectedIds: [12] });
	assert.deepEqual(result.entries.map((entry) => [entry.line, entry.id]), [[1, 10], [2, 11]]);
	assert.deepEqual(result.duplicates.map((entry) => [entry.line, entry.id, entry.kind]), [[3, 10, "submitted"], [5, 12, "selected"]]);
	assert.deepEqual(result.errors.map((entry) => entry.line), [4]);
	const retained = parseTmdbListBatch("12\nhttps://www.themoviedb.org/list/12", { selectedIds: [12] });
	assert.deepEqual(retained.entries, []);
	assert.deepEqual(retained.duplicates.map((entry) => [entry.line, entry.id, entry.kind]), [[1, 12, "selected"], [2, 12, "submitted"]]);
});

test("TMDB List metadata normalizer preserves mixed item order and rejects malformed or unknown items", () => {
	assert.deepEqual(normalizeTmdbListResponse(responseBody(), 123), {
		id: 123,
		name: "Mixed favourites",
		description: "Public picks",
		itemCount: 2,
		creator: "Dave",
		posterPath: "/list.jpg",
		items: [
			{ id: 10, title: "Movie", date: "2020-01-02", releaseYear: 2020, posterPath: "/movie.jpg", mediaType: "MOVIE", position: 0 },
			{ id: 11, title: "Series", date: "2021-03-04", releaseYear: 2021, posterPath: "/series.jpg", mediaType: "TV", position: 1 },
		],
	});
	assert.equal(normalizeTmdbListResponse({ ...responseBody(), id: 124 }, 123), null);
	assert.equal(normalizeTmdbListResponse({ ...responseBody(), items: [{ id: 1, media_type: "person", name: "No" }] }, 123), null);
	assert.equal(normalizeTmdbListResponse({ ...responseBody(), items: [{ id: 1, media_type: "movie" }] }, 123), null);
	assert.deepEqual(normalizeTmdbListResponse({ ...responseBody(), name: "", item_count: 0, items: [] }, 123), { id: 123, name: "", description: "Public picks", itemCount: 0, creator: "Dave", posterPath: "/list.jpg", items: [] });
});

test("TMDB List Preview summaries distinguish complete, partial, unknown-total, and empty samples truthfully", () => {
	const results = Array.from({ length: 20 }, (_, index) => ({ id: index + 1 }));
	assert.equal(listSourceTitlePreviewSummary({ results: results.slice(0, 1), totalResults: 1 }), "Showing all 1 title");
	assert.equal(listSourceTitlePreviewSummary({ results: results.slice(0, 8), totalResults: 8 }), "Showing all 8 titles");
	assert.equal(listSourceTitlePreviewSummary({ results, totalResults: 124 }), "Showing 20 of 124 titles");
	assert.equal(listSourceTitlePreviewSummary({ results: results.slice(0, 7), totalResults: null }), "Showing 7 titles");
	assert.equal(listSourceTitlePreviewSummary({ results: results.slice(0, 7), totalResults: 3 }), "Showing 7 titles");
	assert.equal(listSourceTitlePreviewSummary({ results: [], totalResults: 0 }), null);
});

test("TMDB List provider uses the exact Worker request, coalesces in-flight work, and caches successful empty lists", async () => {
	let calls = 0;
	let release;
	const fetchImpl = async (url) => {
		calls += 1;
		assert.equal(url, "https://worker.example/3/list/123?language=en-US&page=1");
		await new Promise((resolve) => { release = resolve; });
		return new Response(JSON.stringify({ ...responseBody(), item_count: 0, items: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
	};
	const provider = createTmdbListProvider({ fetchImpl, baseUrl: "https://worker.example", timeoutMs: 1000 });
	const first = provider.getList(123);
	const second = provider.getList(123);
	await Promise.resolve();
	assert.equal(calls, 1);
	release();
	assert.equal((await first).ok, true);
	assert.equal((await second).ok, true);
	assert.equal((await provider.getList(123)).fromCache, true);
	assert.equal(calls, 1);
});

test("TMDB List provider sanitizes inaccessible, rate-limited, malformed, and network failures without caching them", async () => {
	for (const [status, kind] of [[401, "not-found"], [403, "not-found"], [404, "not-found"], [429, "rate-limit"], [500, "provider"]]) {
		let calls = 0;
		const provider = createTmdbListProvider({ baseUrl: "https://worker.example", fetchImpl: async () => { calls += 1; return new Response("{}", { status }); } });
		assert.equal((await provider.getList(1)).error.kind, kind);
		assert.equal((await provider.getList(1)).error.kind, kind);
		assert.equal(calls, 2);
	}
	const malformed = createTmdbListProvider({ baseUrl: "https://worker.example", fetchImpl: async () => new Response(JSON.stringify({ id: 1, item_count: 1, items: [{ media_type: "movie" }] }), { status: 200, headers: { "Content-Type": "application/json" } }) });
	assert.equal((await malformed.getList(1)).error.kind, "invalid-response");
	const offline = createTmdbListProvider({ baseUrl: "https://worker.example", fetchImpl: async () => { throw new Error("secret"); } });
	assert.deepEqual((await offline.getList(1)).error, { kind: "network", message: "TMDB could not be reached. Check your connection and try again.", status: 0, retryable: true });
});

test("TMDB List provider expires and LRU-evicts successes and separates caller abort from shared work", async () => {
	let now = 0;
	let calls = 0;
	const provider = createTmdbListProvider({
		baseUrl: "https://worker.example",
		cacheTtlMs: 10,
		cacheMaxEntries: 2,
		now: () => now,
		fetchImpl: async (url) => {
			calls += 1;
			const id = Number(new URL(url).pathname.split("/").at(-1));
			return new Response(JSON.stringify({ ...responseBody(id), id }), { status: 200, headers: { "Content-Type": "application/json" } });
		},
	});
	await provider.getList(1);
	await provider.getList(2);
	assert.equal((await provider.getList(1)).fromCache, true);
	await provider.getList(3);
	await provider.getList(2);
	assert.equal(calls, 4, "least-recently-used List 2 should have been evicted");
	now = 20;
	await provider.getList(3);
	assert.equal(calls, 5, "List 3 should expire after the bounded TTL");

	let release;
	const shared = createTmdbListProvider({ baseUrl: "https://worker.example", fetchImpl: async () => { await new Promise((resolve) => { release = resolve; }); return new Response(JSON.stringify(responseBody(4)), { status: 200, headers: { "Content-Type": "application/json" } }); } });
	const abortController = new AbortController();
	const aborted = shared.getList(4, { signal: abortController.signal });
	const retained = shared.getList(4);
	abortController.abort();
	assert.equal((await aborted).error.kind, "aborted");
	release();
	assert.equal((await retained).ok, true);
});

test("TMDB List provider reports bounded timeouts when the underlying fetch observes abort", async () => {
	const provider = createTmdbListProvider({
		baseUrl: "https://worker.example",
		timeoutMs: 5,
		fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true })),
	});
	assert.equal((await provider.getList(1)).error.kind, "timeout");
});

test("LIST draft is exact, uses a fallback name, and keeps selection and physical identity title-independent", () => {
	const fallback = buildTmdbListSourceDraft(list(42, { name: "", sourceTitle: undefined }));
	assert.equal(fallback.ok, true);
	assert.deepEqual(fallback.draft, { category: "native-tmdb", editable: { title: "TMDB list 42", sortBy: "original", tmdbId: 42, filters: {}, provider: "tmdb", mediaType: "MOVIE", tmdbSourceType: "LIST" } });
	assert.equal(tmdbListSelectionIdentity("42"), "tmdb|LIST|42");
	assert.equal(tmdbListPhysicalIdentity({ ...fallback.draft.editable, tmdbId: "42", title: "Changed" }), "tmdb|LIST|42|MOVIE");
	assert.equal(validateTmdbListSourceDraft({ ...fallback.draft, extra: true }).ok, false);
});

test("Add Source omits exact folder duplicates, reports elsewhere, and explicit override atomically adds all", () => {
	const controller = app();
	const collection = controller.createCollection({ editable: { title: "Here" } });
	const folder = controller.createFolder(collection.createdInternalId, { editable: { title: "Folder" } });
	const otherCollection = controller.createCollection({ editable: { title: "Elsewhere" } });
	const otherFolder = controller.createFolder(otherCollection.createdInternalId, { editable: { title: "Other" } });
	const drafts = [buildTmdbListSourceDraft(list(1)).draft, buildTmdbListSourceDraft(list(2)).draft];
	controller.createSource(folder.createdInternalId, drafts[0]);
	controller.createSource(otherFolder.createdInternalId, drafts[1]);
	controller.selectNode(folder.createdInternalId);
	const review = inspectTmdbListSourceDuplicates(controller.getState().project, folder.createdInternalId, drafts);
	assert.equal(review.destination.length, 1);
	assert.equal(review.elsewhere.length, 1);
	const before = controller.getState().revision;
	const normal = createTmdbListSourceBundle(controller, { folderInternalId: folder.createdInternalId, drafts });
	assert.equal(normal.ok, true);
	assert.equal(normal.addedSourceCount, 1);
	assert.equal(controller.getState().revision, before + 1);
	const all = createTmdbListSourceBundle(controller, { folderInternalId: folder.createdInternalId, drafts, duplicateOverrideIdentity: tmdbListDuplicateOverrideIdentity(folder.createdInternalId, drafts) });
	assert.equal(all.ok, true);
	assert.equal(all.addedSourceCount, 2);
});

test("guided New Collection creates exactly one collection, one ordinary folder, and ordered native LIST sources in one revision", () => {
	const controller = app();
	const state = controller.getState();
	const planned = createTmdbListHierarchyPlan(state.project, { scope: "new-collection", projectRevision: state.revision, collectionTitle: "My Lists", folderTitle: "Public picks", lists: [list(3), list(4, { sourceTitle: "Custom four" })] });
	assert.equal(planned.ok, true);
	assert.deepEqual(planned.plan.counts, { collectionCount: 1, folderCount: 1, sourceCount: 2 });
	assert.deepEqual(planned.plan.collections[0].editable, { title: "My Lists", pinToTop: false, focusGlowEnabled: true, viewMode: "TABBED_GRID", showAllTab: true });
	assert.deepEqual(planned.plan.collections[0].folders[0].editable, { title: "Public picks", tileShape: "POSTER", hideTitle: true });
	assert.deepEqual(planned.plan.collections[0].folders[0].sources.map((entry) => entry.draft.editable.tmdbId), [3, 4]);
	const applied = applyTmdbListHierarchyPlan(controller, planned.plan);
	assert.equal(applied.ok, true);
	assert.equal(controller.getState().revision, state.revision + 1);
	const output = controller.stringifyProject();
	assert.equal(output.ok, true);
	assert.deepEqual(output.value[0].folders[0].sources.map((source) => [source.tmdbSourceType, source.tmdbId, source.mediaType, source.sortBy]), [["LIST", 3, "MOVIE", "original"], ["LIST", 4, "MOVIE", "original"]]);
	assert.equal((output.value[0].folders[0].catalogSources ?? []).some((source) => source.tmdbSourceType === "LIST"), false);
});

test("guided TMDB Lists maps the shared Collection and Folder presentation choices without exposing a separate system", () => {
	const controller = app();
	const state = controller.getState();
	const planned = createTmdbListHierarchyPlan(state.project, {
		scope: "new-collection",
		projectRevision: state.revision,
		collectionTitle: "Hidden picks",
		hideCollectionTitle: true,
		viewMode: "ROWS",
		showAllTab: false,
		pinToTop: true,
		folderTitle: "Visible folder",
		folderTitleVisibility: "SHOW_EVERYWHERE",
		folderTileShape: "LANDSCAPE",
		lists: [list(31)],
	});
	assert.equal(planned.ok, true);
	assert.deepEqual(planned.plan.configuration, {
		scope: "new-collection",
		collectionTitle: "Hidden picks",
		hideCollectionTitle: true,
		viewMode: "ROWS",
		showAllTab: true,
		pinToTop: true,
		folderTitle: "Visible folder",
		folderTitleVisibility: "SHOW_EVERYWHERE",
		folderTileShape: "LANDSCAPE",
		lists: [list(31)],
	});
	assert.deepEqual(planned.plan.collections[0].editable, { title: NUVIO_INVISIBLE_TITLE, pinToTop: true, focusGlowEnabled: true, viewMode: "ROWS", showAllTab: true });
	assert.deepEqual(planned.plan.collections[0].folders[0].editable, { title: "Visible folder", tileShape: "LANDSCAPE", hideTitle: false });

	const hiddenFolder = createTmdbListHierarchyPlan(state.project, {
		scope: "new-collection",
		projectRevision: state.revision,
		collectionTitle: "Lists",
		folderTitle: "User supplied before hiding",
		folderTitleVisibility: "HIDE_EVERYWHERE",
		folderTileShape: "POSTER",
		lists: [list(32)],
	});
	assert.equal(hiddenFolder.ok, true);
	assert.deepEqual(hiddenFolder.plan.collections[0].folders[0].editable, { title: NUVIO_INVISIBLE_TITLE, tileShape: "POSTER", hideTitle: true });
	for (const invalid of [
		{ viewMode: "FOLLOW_LAYOUT" },
		{ folderTitleVisibility: "HIDDEN" },
		{ folderTileShape: "SQUARE" },
	]) assert.equal(createTmdbListHierarchyPlan(state.project, { scope: "new-collection", projectRevision: state.revision, collectionTitle: "Lists", folderTitle: "Folder", lists: [list(33)], ...invalid }).ok, false);
});

test("guided TMDB Lists has no arbitrary bulk cap and a late atomic failure rolls back all hierarchy nodes", () => {
	const controller = app();
	let state = controller.getState();
	const many = Array.from({ length: 125 }, (_, index) => list(index + 1));
	const planned = createTmdbListHierarchyPlan(state.project, { scope: "new-collection", projectRevision: state.revision, collectionTitle: "Many lists", folderTitle: "All lists", lists: many });
	assert.equal(planned.ok, true);
	assert.deepEqual(planned.plan.counts, { collectionCount: 1, folderCount: 1, sourceCount: 125 });
	assert.deepEqual(planned.plan.collections[0].folders[0].sources.slice(-3).map((entry) => entry.draft.editable.tmdbId), [123, 124, 125]);

	let calls = 0;
	const failing = createBuilderController({
		idFactory: () => { calls += 1; if (calls === 8) throw new Error("late failure"); return `fail-${calls}`; },
		nuvioIdFactory: ids("nuvio"),
		initialProjectTitle: "Rollback",
	});
	state = failing.getState();
	const rollbackPlan = createTmdbListHierarchyPlan(state.project, { scope: "new-collection", projectRevision: state.revision, collectionTitle: "Rollback lists", folderTitle: "Lists", lists: many.slice(0, 10) });
	assert.equal(rollbackPlan.ok, true);
	const before = failing.getState();
	assert.equal(applyTmdbListHierarchyPlan(failing, rollbackPlan.plan).ok, false);
	assert.equal(failing.getState().project, before.project);
	assert.equal(failing.getState().revision, before.revision);
});

test("guided New Folder creates one folder, omits same-collection identities, keeps elsewhere matches, and blocks stale plans", () => {
	const controller = app();
	const destination = controller.createCollection({ editable: { title: "Destination" } });
	const existing = controller.createFolder(destination.createdInternalId, { editable: { title: "Existing" } });
	const elsewhereCollection = controller.createCollection({ editable: { title: "Elsewhere" } });
	const elsewhereFolder = controller.createFolder(elsewhereCollection.createdInternalId, { editable: { title: "Other" } });
	controller.createSource(existing.createdInternalId, buildTmdbListSourceDraft(list(5)).draft);
	controller.createSource(elsewhereFolder.createdInternalId, buildTmdbListSourceDraft(list(6)).draft);
	let state = controller.getState();
	const planned = createTmdbListHierarchyPlan(state.project, { scope: "new-folder", projectRevision: state.revision, destinationCollectionInternalId: destination.createdInternalId, folderTitle: "Imported lists", folderTitleVisibility: "SHOW_EVERYWHERE", folderTileShape: "LANDSCAPE", lists: [list(5), list(6), list(7)] });
	assert.equal(planned.ok, true);
	assert.deepEqual(planned.plan.outcomes.map((outcome) => outcome.status), [TMDB_LIST_PLACEMENT_STATUSES.ALREADY_IN_COLLECTION, TMDB_LIST_PLACEMENT_STATUSES.EXISTS_ELSEWHERE, TMDB_LIST_PLACEMENT_STATUSES.READY]);
	assert.deepEqual(planned.plan.counts, { collectionCount: 0, folderCount: 1, sourceCount: 2 });
	assert.deepEqual(planned.plan.folders[0].editable, { title: "Imported lists", tileShape: "LANDSCAPE", hideTitle: false });
	assert.equal(createTmdbListHierarchyPlan(state.project, { scope: "new-folder", projectRevision: state.revision, destinationCollectionInternalId: destination.createdInternalId, collectionTitle: "Unexpected", folderTitle: "Folder", lists: [list(7)] }).ok, false);
	const applied = applyTmdbListHierarchyPlan(controller, planned.plan);
	assert.equal(applied.ok, true);
	assert.deepEqual(controller.getState().project.collections[0].folders.at(-1).sources.map((source) => source.editable.tmdbId), [6, 7]);

	state = controller.getState();
	const stale = createTmdbListHierarchyPlan(state.project, { scope: "new-folder", projectRevision: state.revision, destinationCollectionInternalId: destination.createdInternalId, folderTitle: "Later", lists: [list(8)] });
	controller.createSource(existing.createdInternalId, buildTmdbListSourceDraft(list(8)).draft);
	const changed = controller.getState();
	assert.equal(validateTmdbListHierarchyPlan(stale.plan, { project: changed.project, projectRevision: changed.revision }).stale, true);
	const before = changed.project;
	assert.equal(applyTmdbListHierarchyPlan(controller, stale.plan).ok, false);
	assert.equal(controller.getState().project, before);
});

test("TMDB List Source Edit changes title only and previews mixed titles through the shared request path", async () => {
	const controller = app();
	const imported = controller.importValue([{ id: "c", title: "Collection", folders: [{ id: "f", title: "Folder", sources: [{ provider: "tmdb", title: "Original", tmdbSourceType: "LIST", tmdbId: "9", mediaType: "MOVIE", sortBy: "original", filters: {}, community: { keep: true } }] }] }]);
	assert.equal(imported.ok, true);
	const source = controller.getState().project.collections[0].folders[0].sources[0];
	const opened = createSourceEditSession(controller.getState().project, source.internalId);
	assert.equal(opened.ok, true);
	assert.equal(opened.session.adapterId, TMDB_LIST_SOURCE_EDITOR_ID);
	assert.equal(opened.draft.tmdbId, 9);
	assert.equal(source.editable.tmdbId, "9");
	assert.equal(buildTmdbEntityPageUrl("list", opened.draft.tmdbId), "https://www.themoviedb.org/list/9");
	const draft = updateSourceEditTitle(opened.draft, "Renamed list");
	const prepared = prepareSourceEditPreview(opened.session, draft);
	assert.equal(prepared.request.kind, "list");
	const preview = await requestSourceTitlePreview(prepared.request, { list: { getList: async () => ({ ok: true, data: list(9) }) } });
	assert.deepEqual(preview.data.results.map((item) => item.mediaType), ["MOVIE", "TV"]);
	const saved = saveSourceEdit(controller, opened.session, draft);
	assert.equal(saved.ok, true);
	const output = controller.stringifyProject().value[0].folders[0].sources[0];
	assert.equal(output.title, "Renamed list");
	assert.equal(output.tmdbId, "9");
	assert.deepEqual(output.community, { keep: true });
});
