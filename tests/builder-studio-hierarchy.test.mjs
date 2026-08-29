import assert from "node:assert/strict";
import test from "node:test";

import { createBuilderController } from "../builder/src/application/index.js";
import {
	applyStudioHierarchyPlan,
	buildStudioSourceDrafts,
	createStudioHierarchyPlan,
	createStudioSelectionState,
	createTmdbStudioPreviewProvider,
	DEFAULT_STUDIO_FOLDER_TITLE_VISIBILITY,
	inspectStudioHierarchyPlacement,
	normalizeTmdbStudioPreviewResponse,
	removeSelectedStudio,
	resolveStudioFolderArtworkBatch,
	selectedStudios,
	STUDIO_PLACEMENT_STATUSES,
	STUDIO_SOURCE_TITLE_MODES,
	studioSelectionNotice,
	toggleSelectedStudio,
	validateStudioHierarchyPlan,
} from "../builder/src/source-add/index.js";
import {
	creationOptionSupportsScope,
	creationOptionsForScope,
	CREATION_OPTION_IDS,
} from "../builder/src/ui/creation-options.js";

function idFactory(prefix = "node") {
	let next = 0;
	return () => `${prefix}-${++next}`;
}

function controller() {
	return createBuilderController({ idFactory: idFactory(), nuvioIdFactory: idFactory("nuvio"), initialProjectTitle: "Studio hierarchy" });
}

function studio(id, overrides = {}) {
	return Object.freeze({ id, name: `Studio ${id}`, parentCompany: "", country: "US", headquarters: "", location: "US", logoPath: `/studio-${id}.png`, movieCount: id * 10, ...overrides });
}

function artwork(item, overrides = {}) {
	return Object.freeze({ studioId: item.id, tileShape: "LANDSCAPE", source: "tmdb-logo", previewUrl: `https://image.tmdb.org/t/p/w500/studio-${item.id}.png`, folderEditable: Object.freeze({ coverImageUrl: `https://image.tmdb.org/t/p/w500/studio-${item.id}.png` }), ...overrides });
}

function planEntries(items) {
	return items.map((item) => ({ studio: item, artwork: artwork(item) }));
}

function jsonResponse(value, { status = 200 } = {}) {
	return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

function previewPayload(mediaType, totalResults = 12) {
	return {
		total_results: totalResults,
		results: [
			mediaType === "MOVIE" ? { id: 20, title: "Second upstream", release_date: "2020-02-02", poster_path: "/second.jpg" } : { id: 20, name: "Second upstream", first_air_date: "2020-02-02", poster_path: "/second.jpg" },
			mediaType === "MOVIE" ? { id: 10, title: "First upstream", release_date: "2010-01-01", poster_path: null } : { id: 10, name: "First upstream", first_air_date: "2010-01-01", poster_path: null },
		],
	};
}

test("Studio hierarchy is registered in New Collection and New Folder scopes", () => {
	for (const scope of ["new-collection", "new-folder"]) {
		assert.equal(creationOptionSupportsScope(CREATION_OPTION_IDS.STUDIOS, scope), true);
		assert.deepEqual(creationOptionsForScope(scope).map((option) => option.id), ["blank", "decades", "people", "franchises", "studios", "networks", "genres", "streaming-services"]);
	}
});

test("ordered Studio selection remains uncapped through 100+, preserves insertion order, and re-adds at the end", () => {
	let state = createStudioSelectionState();
	for (let id = 1; id <= 125; id += 1) state = toggleSelectedStudio(state, studio(id)).state;
	assert.equal(selectedStudios(state).length, 125);
	assert.deepEqual(selectedStudios(state).slice(-3).map((entry) => entry.id), [123, 124, 125]);
	assert.deepEqual(studioSelectionNotice(state), { visible: true, count: 125, threshold: 50 });
	state = removeSelectedStudio(state, 50);
	state = toggleSelectedStudio(state, studio(50)).state;
	assert.equal(selectedStudios(state).at(-1).id, 50);
});

test("hierarchy naming is Movies and Series while existing entity Add Source naming remains unchanged", () => {
	const item = studio(3, { name: "Pixar" });
	const physical = buildStudioSourceDrafts(item, { choices: ["studio-movies", "studio-series"], sortOptionId: "popular" });
	const hierarchy = buildStudioSourceDrafts(item, { choices: ["studio-movies", "studio-series"], sortOptionId: "popular", titleMode: STUDIO_SOURCE_TITLE_MODES.HIERARCHY });
	assert.deepEqual(physical.drafts.map((draft) => draft.editable.title), ["Pixar", "Pixar Series"]);
	assert.deepEqual(hierarchy.drafts.map((draft) => draft.editable.title), ["Movies", "Series"]);
	assert.deepEqual(hierarchy.drafts.map((draft) => draft.editable.mediaType), ["MOVIE", "TV"]);
});

test("Studio plans cover 1, 3, 20, 50, 100 and 125 selections without a cap or network dependency", () => {
	for (const count of [1, 3, 20, 50, 100, 125]) {
		const app = controller();
		const before = app.getState();
		const items = Array.from({ length: count }, (_, index) => studio(index + 1));
		const result = createStudioHierarchyPlan(before.project, { scope: "new-collection", projectRevision: before.revision, mediaMode: "both", studios: planEntries(items) });
		assert.equal(result.ok, true);
		assert.deepEqual(result.plan.counts, { collectionCount: 1, folderCount: count, sourceCount: count * 2 });
		assert.deepEqual(result.plan.collections[0].folders.map((folder) => folder.studioId), items.map((item) => item.id));
		if (count === 125) {
			const applied = applyStudioHierarchyPlan(app, result.plan);
			assert.equal(applied.ok, true);
			assert.equal(app.getState().revision, before.revision + 1);
			assert.equal(app.getState().project.collections[0].folders.length, 125);
		}
	}
});

test("Studio plan defaults to Movies, Popular, Show everywhere and fixed Landscape artwork", () => {
	const app = controller();
	const before = app.getState();
	const item = studio(3, { name: "Pixar" });
	const result = createStudioHierarchyPlan(before.project, { scope: "new-collection", projectRevision: before.revision, studios: planEntries([item]) });
	assert.equal(result.ok, true);
	assert.equal(result.plan.configuration.mediaMode, "movies");
	assert.equal(result.plan.configuration.sortOptionId, "popular");
	assert.equal(result.plan.configuration.folderTitleVisibility, DEFAULT_STUDIO_FOLDER_TITLE_VISIBILITY);
	assert.equal(result.plan.configuration.folderTileShape, "LANDSCAPE");
	assert.equal(result.plan.collections[0].folders[0].editable.hideTitle, false);
	assert.equal(result.plan.collections[0].folders[0].sources[0].draft.editable.title, "Movies");
});

test("one artwork runtime load resolves a batch before plan creation and falls back logo then emoji", async () => {
	let loads = 0;
	let resolves = 0;
	const client = {
		async load() { loads += 1; return {}; },
		async resolve({ tmdbId }) {
			resolves += 1;
			return tmdbId === 1 ? { status: "ready", assetUrl: "https://assets.example/company-1.jpg" } : { status: "missing" };
		},
	};
	const items = [studio(1), studio(2), studio(3, { logoPath: null })];
	const resolved = await resolveStudioFolderArtworkBatch(items, client);
	assert.equal(loads, 1);
	assert.equal(resolves, 3);
	assert.deepEqual(resolved.map((entry) => entry.source), ["runtime", "tmdb-logo", "emoji"]);
	assert.equal(resolved[1].folderEditable.coverImageUrl, "https://image.tmdb.org/t/p/w500/studio-2.png");
	assert.deepEqual(resolved[2].folderEditable, { coverImageUrl: "", coverEmoji: "🎬" });
});

test("New Folder omits complete and partial logical Company destinations while elsewhere remains addable", () => {
	const app = controller();
	const destination = app.createCollection({ editable: { title: "Destination" } });
	const existing = app.createFolder(destination.createdInternalId, { editable: { title: "Existing" } });
	const elsewhereCollection = app.createCollection({ editable: { title: "Elsewhere" } });
	const elsewhereFolder = app.createFolder(elsewhereCollection.createdInternalId, { editable: { title: "Other" } });
	for (const [folderId, item, choices] of [
		[existing.createdInternalId, studio(1), ["studio-movies", "studio-series"]],
		[existing.createdInternalId, studio(2), ["studio-movies"]],
		[elsewhereFolder.createdInternalId, studio(3), ["studio-series"]],
	]) {
		const drafts = buildStudioSourceDrafts(item, { choices, sortOptionId: "popular" }).drafts;
		for (const draft of drafts) assert.equal(app.createSource(folderId, draft).ok, true);
	}
	const before = app.getState();
	const items = [studio(1), studio(2), studio(3), studio(4)];
	const result = createStudioHierarchyPlan(before.project, { scope: "new-folder", projectRevision: before.revision, destinationCollectionInternalId: destination.createdInternalId, mediaMode: "both", studios: planEntries(items) });
	assert.equal(result.ok, true);
	assert.deepEqual(result.plan.outcomes.map((outcome) => outcome.status), [STUDIO_PLACEMENT_STATUSES.ALREADY_IN_COLLECTION, STUDIO_PLACEMENT_STATUSES.PARTLY_IN_COLLECTION, STUDIO_PLACEMENT_STATUSES.EXISTS_ELSEWHERE, STUDIO_PLACEMENT_STATUSES.READY]);
	assert.deepEqual(result.plan.folders.map((folder) => folder.studioId), [3, 4]);
	assert.equal(inspectStudioHierarchyPlacement(before.project, result.plan.folders[0].sources.map((entry) => entry.draft), { destinationCollectionInternalId: destination.createdInternalId }).status, STUDIO_PLACEMENT_STATUSES.EXISTS_ELSEWHERE);
});

test("Studio apply is one atomic revision and stale placement leaves the project unchanged", () => {
	const app = controller();
	const destination = app.createCollection({ editable: { title: "Destination" } });
	let before = app.getState();
	const item = studio(8);
	const planned = createStudioHierarchyPlan(before.project, { scope: "new-folder", projectRevision: before.revision, destinationCollectionInternalId: destination.createdInternalId, studios: planEntries([item]) });
	assert.equal(planned.ok, true);
	const blocker = app.createFolder(destination.createdInternalId, { editable: { title: "Later" } });
	assert.equal(app.createSource(blocker.createdInternalId, buildStudioSourceDrafts(item, { choices: ["studio-movies"], sortOptionId: "popular" }).drafts[0]).ok, true);
	before = app.getState();
	assert.equal(validateStudioHierarchyPlan(planned.plan, { project: before.project, projectRevision: before.revision }).ok, false);
	const snapshot = JSON.stringify(before.project);
	const applied = applyStudioHierarchyPlan(app, planned.plan);
	assert.equal(applied.ok, false);
	assert.equal(JSON.stringify(app.getState().project), snapshot);
	assert.equal(app.getState().revision, before.revision);
});

test("New Folder apply preserves parent presentation byte-for-byte apart from intended folder insertion", () => {
	const app = controller();
	const destination = app.createCollection({ editable: { title: "Destination", viewMode: "ROWS", showAllTab: true, pinToTop: true, focusGlowEnabled: false } });
	const before = app.getState();
	const parentBefore = before.project.collections.find((entry) => entry.internalId === destination.createdInternalId);
	const editableSnapshot = JSON.stringify(parentBefore.editable);
	const planned = createStudioHierarchyPlan(before.project, { scope: "new-folder", projectRevision: before.revision, destinationCollectionInternalId: destination.createdInternalId, mediaMode: "both", studios: planEntries([studio(31), studio(32)]) });
	const applied = applyStudioHierarchyPlan(app, planned.plan);
	assert.equal(applied.ok, true);
	const parentAfter = app.getState().project.collections.find((entry) => entry.internalId === destination.createdInternalId);
	assert.equal(JSON.stringify(parentAfter.editable), editableSnapshot);
	assert.deepEqual(parentAfter.folders.map((folder) => folder.sources.map((source) => source.editable.title)), [["Movies", "Series"], ["Movies", "Series"]]);
	assert.ok(parentAfter.folders.every((folder) => folder.sources.every((source) => source.catalogSources === undefined)));
});

test("a late Studio bundle failure rolls back every node and revision", () => {
	let calls = 0;
	const failingFactory = () => {
		calls += 1;
		if (calls === 7) throw new Error("late Studio bundle failure");
		return `failing-${calls}`;
	};
	const app = createBuilderController({ idFactory: failingFactory, nuvioIdFactory: idFactory("nuvio"), initialProjectTitle: "Studio rollback" });
	const before = app.getState();
	const planned = createStudioHierarchyPlan(before.project, { scope: "new-collection", projectRevision: before.revision, mediaMode: "both", studios: planEntries([studio(41), studio(42)]) });
	assert.equal(planned.ok, true);
	const result = applyStudioHierarchyPlan(app, planned.plan);
	assert.equal(result.ok, false);
	assert.equal(app.getState().project, before.project);
	assert.equal(app.getState().revision, before.revision);
});

test("Studio Preview normalization preserves upstream order and rejects malformed results", () => {
	const normalized = normalizeTmdbStudioPreviewResponse(previewPayload("MOVIE"), "MOVIE");
	assert.equal(normalized.totalResults, 12);
	assert.deepEqual(normalized.results.map((entry) => entry.id), [20, 10]);
	assert.deepEqual(normalized.results.map((entry) => entry.title), ["Second upstream", "First upstream"]);
	assert.equal(normalizeTmdbStudioPreviewResponse({ total_results: 1, results: [{ id: 1 }] }, "MOVIE"), null);
	assert.equal(normalizeTmdbStudioPreviewResponse({ total_results: -1, results: [] }, "TV"), null);
});

test("Studio Preview public validation and provider errors remain API-compatible after extraction", async () => {
	let calls = 0;
	const provider = createTmdbStudioPreviewProvider({
		baseUrl: "https://worker.example",
		fetchImpl: async () => { calls += 1; return jsonResponse({}, { status: 429 }); },
	});
	assert.deepEqual(
		await provider.getStudioPreview(0, { mediaType: "MOVIE", sortOptionId: "popular" }),
		{ ok: false, error: { kind: "invalid-request", message: "Choose a valid Studio and media preview.", status: 0, retryable: false } },
	);
	assert.deepEqual(
		await provider.getStudioPreview(1, { mediaType: "MOVIE", sortBy: "first_air_date.desc" }),
		{ ok: false, error: { kind: "invalid-request", message: "Choose a supported Studio preview sort.", status: 0, retryable: false } },
	);
	assert.deepEqual(
		await provider.getStudioPreview(1, { mediaType: "TV", sortOptionId: "popular" }),
		{ ok: false, error: { kind: "rate-limit", message: "TMDB is receiving too many requests. Wait a moment and try again.", status: 429, retryable: true } },
	);
	assert.equal(calls, 1);
});

test("Studio Preview provider uses one response for count and titles with sort-aware success-only caching", async () => {
	const urls = [];
	const provider = createTmdbStudioPreviewProvider({
		baseUrl: "https://worker.example",
		fetchImpl: async (url) => {
			urls.push(new URL(url));
			const mediaType = new URL(url).pathname.endsWith("/movie") ? "MOVIE" : "TV";
			return jsonResponse(previewPayload(mediaType, mediaType === "TV" ? 1_742 : 136));
		},
	});
	const first = await provider.getStudioPreview(3, { mediaType: "MOVIE", sortOptionId: "popular" });
	const cached = await provider.getStudioPreview(3, { mediaType: "MOVIE", sortOptionId: "popular" });
	const recent = await provider.getStudioPreview(3, { mediaType: "MOVIE", sortOptionId: "recent" });
	const previous = await provider.getStudioPreview(3, { mediaType: "MOVIE", sortOptionId: "popular" });
	const series = await provider.getStudioPreview(3, { mediaType: "TV", sortOptionId: "popular" });
	assert.equal(first.data.totalResults, 136);
	assert.equal(first.data.results.length, 2);
	assert.equal(cached.fromCache, true);
	assert.equal(previous.fromCache, true);
	assert.equal(recent.fromCache, false);
	assert.equal(series.data.totalResults, 1_742);
	assert.equal(urls.length, 3);
	assert.deepEqual(urls.map((url) => url.searchParams.get("sort_by")), ["popularity.desc", "primary_release_date.desc", "popularity.desc"]);
});

test("successful zero Preview responses cache while failures remain retryable and uncached", async () => {
	let calls = 0;
	const zeroProvider = createTmdbStudioPreviewProvider({ baseUrl: "https://worker.example", fetchImpl: async () => { calls += 1; return jsonResponse({ total_results: 0, results: [] }); } });
	assert.equal((await zeroProvider.getStudioPreview(9, { mediaType: "TV", sortOptionId: "popular" })).data.totalResults, 0);
	assert.equal((await zeroProvider.getStudioPreview(9, { mediaType: "TV", sortOptionId: "popular" })).fromCache, true);
	assert.equal(calls, 1);
	let failures = 0;
	const failingProvider = createTmdbStudioPreviewProvider({ baseUrl: "https://worker.example", fetchImpl: async () => { failures += 1; return jsonResponse({}, { status: 500 }); } });
	assert.equal((await failingProvider.getStudioPreview(9, { mediaType: "MOVIE", sortOptionId: "popular" })).ok, false);
	assert.equal((await failingProvider.getStudioPreview(9, { mediaType: "MOVIE", sortOptionId: "popular" })).ok, false);
	assert.equal(failures, 2);
});

test("Studio Preview cache expires and evicts least-recently-used successful keys", async () => {
	let now = 0;
	let calls = 0;
	const provider = createTmdbStudioPreviewProvider({ baseUrl: "https://worker.example", cacheTtlMs: 10, cacheMaxEntries: 2, now: () => now, fetchImpl: async () => { calls += 1; return jsonResponse(previewPayload("MOVIE")); } });
	await provider.getStudioPreview(1, { mediaType: "MOVIE", sortOptionId: "popular" });
	await provider.getStudioPreview(2, { mediaType: "MOVIE", sortOptionId: "popular" });
	assert.equal((await provider.getStudioPreview(1, { mediaType: "MOVIE", sortOptionId: "popular" })).fromCache, true);
	await provider.getStudioPreview(3, { mediaType: "MOVIE", sortOptionId: "popular" });
	assert.equal((await provider.getStudioPreview(2, { mediaType: "MOVIE", sortOptionId: "popular" })).fromCache, false, "Studio 2 was least recently used");
	now = 20;
	assert.equal((await provider.getStudioPreview(1, { mediaType: "MOVIE", sortOptionId: "popular" })).fromCache, false, "Studio 1 expired");
	assert.equal(calls, 5);
});

test("malformed and timed-out Studio Preview responses stay retryable and uncached", async () => {
	let malformedCalls = 0;
	const malformed = createTmdbStudioPreviewProvider({ baseUrl: "https://worker.example", fetchImpl: async () => { malformedCalls += 1; return jsonResponse({ total_results: 2, results: [{ id: 1 }] }); } });
	assert.equal((await malformed.getStudioPreview(5, { mediaType: "MOVIE", sortOptionId: "popular" })).error.kind, "invalid-response");
	assert.equal((await malformed.getStudioPreview(5, { mediaType: "MOVIE", sortOptionId: "popular" })).error.kind, "invalid-response");
	assert.equal(malformedCalls, 2);
	const timeout = createTmdbStudioPreviewProvider({ baseUrl: "https://worker.example", timeoutMs: 2, fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true })) });
	assert.equal((await timeout.getStudioPreview(5, { mediaType: "TV", sortOptionId: "popular" })).error.kind, "timeout");
});

test("aborted Preview work is suppressed and never cached", async () => {
	let calls = 0;
	const provider = createTmdbStudioPreviewProvider({
		baseUrl: "https://worker.example",
		fetchImpl: async (_url, { signal }) => new Promise((resolve, reject) => {
			calls += 1;
			signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
			setTimeout(() => resolve(jsonResponse(previewPayload("MOVIE"))), 50);
		}),
	});
	const controller = new AbortController();
	const pending = provider.getStudioPreview(4, { mediaType: "MOVIE", sortOptionId: "popular", signal: controller.signal });
	controller.abort();
	assert.equal((await pending).error.kind, "aborted");
	assert.equal((await provider.getStudioPreview(4, { mediaType: "MOVIE", sortOptionId: "popular" })).fromCache, false);
	assert.equal(calls, 2);
});
