import assert from "node:assert/strict";
import test from "node:test";
import { normalizeTraktResponse } from "../builder/src/source-add/trakt-client.js";
import { normalizeTraktPreview, traktPosterIdentity } from "../builder/src/source-add/trakt-preview.js";
import { createTmdbTitlePosterProvider } from "../builder/src/source-add/tmdb-title-poster-provider.js";
import { createTmdbJsonRequester } from "../builder/src/source-add/tmdb-json-requester.js";
import { createTmdbCollectionProvider } from "../builder/src/source-add/tmdb-collection-provider.js";
import { createAsyncRequestCoordinator } from "../builder/src/source-add/async-request-state.js";
import { createTraktSelectionSession } from "../builder/src/source-add/trakt-selection.js";

// Pure injected transport/normalization examples. No external integration evidence.
const baseUrl = "https://tmdb.example.test";
const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json", ...headers } });
const tick = () => new Promise(resolve => setImmediate(resolve));
const identity = (id, mediaType = "movie") => ({ mediaType, id, key: mediaType + ":" + id });
const item = (type = "movie", extra = {}) => ({ type, title: null, year: null, rank: null, season: null, number: null,
	ids: { trakt: null, tmdb: null, imdb: null, slug: null, show_tmdb: null, show_slug: null }, ...extra });
const sample = rows => normalizeTraktResponse({ apiVersion: 1, id: 123, sample: "first-page", items: rows,
	pagination: { page: 1, limit: 15, page_count: null, item_count: null } }, "items", { id: 123, limit: 15 });

test("text adapter preserves sample rows/order/repeats and honest type, title, year and Season 0 details", () => {
	const rows = [item("episode", { title: "Exact episode", season: 0, number: 2, rank: 8, year: 2026 }),
		item("season", { number: 0 }), item("show", { title: "  " }), item("movie", { title: "Movie" }), item("movie", { title: "Movie" })];
	const input = sample(rows), before = JSON.stringify(input), result = normalizeTraktPreview(input);
	assert.deepEqual(result.items.map(row => row.typeLabel), ["Episode", "Season", "Series", "Movie", "Movie"]);
	assert.deepEqual(result.items.map(row => row.position), [0, 1, 2, 3, 4]);
	assert.equal(result.items[0].detail, "Season 0 · Episode 2");
	assert.equal(result.items[1].detail, "Season 0");
	assert.equal(result.items[2].title, "Title unavailable");
	assert.equal(result.items[0].year, 2026); assert.equal(result.items[0].rank, 8);
	assert.equal(result.items[4].title, result.items[3].title);
	assert.equal(JSON.stringify(input), before); assert.equal(Object.isFrozen(result.items[0]), true);
	for (const fields of [{ season: 1 }, { number: 3 }, {}]) {
		const row = normalizeTraktPreview(sample([item("episode", fields)])).items[0];
		assert.equal(row.detail, fields.season ? "Season 1" : fields.number ? "Episode 3" : null);
	}
	assert.throws(() => normalizeTraktPreview({ ...input, sample: "all" }));
});

test("poster identities keep movie/show namespaces separate and use only parent show IDs for seasons/episodes", () => {
	const ids = { trakt: 8, tmdb: 10, imdb: null, slug: "own-title", show_tmdb: 20, show_slug: "never-invent-this-title" };
	const rows = normalizeTraktPreview(sample(["movie", "show", "season", "episode"].map(type => item(type, { ids })))).items;
	assert.deepEqual(rows.map(row => row.posterIdentity), [identity(10), identity(10, "tv"), identity(20, "tv"), identity(20, "tv")]);
	assert.ok(rows.every(row => row.title === "Title unavailable"));
	assert.equal(traktPosterIdentity({ type: "season", ids: { tmdb: 10, showTmdb: null } }), null);
	assert.equal(traktPosterIdentity({ type: "movie", ids: { tmdb: "10" } }), null);
	assert.equal(traktPosterIdentity({ type: "show", ids: { tmdb: 0 } }), null);
});

test("poster provider construction is inert; invalid identities cost nothing and shared identities dedupe", async () => {
	const calls = [];
	const provider = createTmdbTitlePosterProvider({ baseUrl, fetchImpl: async url => {
		calls.push(url); const id = Number(new URL(url).pathname.split("/").at(-1));
		return json({ id, title: "Must not replace Trakt", poster_path: "/poster.jpg" });
	} });
	assert.equal(calls.length, 0);
	assert.deepEqual((await provider.getPosters([null, identity(0), identity("1"), { mediaType: "season", id: 1 }])).map(row => row.status), Array(4).fill("missing"));
	assert.equal(calls.length, 0);
	const result = await provider.getPosters([identity(1), identity(1), identity(1, "tv"), identity(1, "tv")]);
	assert.deepEqual(calls, [baseUrl + "/3/movie/1", baseUrl + "/3/tv/1"]);
	assert.equal(result.length, 4); assert.ok(result.every(row => row.status === "ready" && row.posterPath === "/poster.jpg"));
	assert.equal(result[0], result[1]); assert.equal(Object.isFrozen(result), true);
});

test("poster concurrency never exceeds three, including overlapping calls, and fifteen rows cost at most fifteen details", async () => {
	let active = 0, maximum = 0, calls = 0;
	const waiting = [];
	const provider = createTmdbTitlePosterProvider({ baseUrl, fetchImpl: url => {
		calls++; active++; maximum = Math.max(maximum, active);
		const id = Number(new URL(url).pathname.split("/").at(-1));
		return new Promise(resolve => waiting.push(() => { active--; resolve(json({ id, poster_path: null })); }));
	} });
	const a = provider.getPosters(Array.from({ length: 8 }, (_, i) => identity(i + 1)));
	const b = provider.getPosters(Array.from({ length: 7 }, (_, i) => identity(i + 9)));
	await tick(); assert.equal(calls, 3);
	for (let i = 0; i < 15; i++) { assert.ok(waiting.length); waiting.shift()(); await tick(); }
	assert.equal((await a).length + (await b).length, 15);
	assert.equal(calls, 15); assert.equal(maximum, 3);
});

test("poster success/no-poster cache is bounded and expires, errors are not cached", async () => {
	let now = 0, calls = 0, fail = false;
	const provider = createTmdbTitlePosterProvider({ baseUrl, cacheMaxEntries: 1, now: () => now, fetchImpl: async url => {
		calls++; return fail ? json({}, 503) : json({ id: Number(new URL(url).pathname.split("/").at(-1)), poster_path: null });
	} });
	assert.equal((await provider.getPosters([identity(1)]))[0].status, "missing");
	await provider.getPosters([identity(1)]); assert.equal(calls, 1);
	await provider.getPosters([identity(2)]); await provider.getPosters([identity(1)]); assert.equal(calls, 3);
	now = 300001; await provider.getPosters([identity(1)]); assert.equal(calls, 4);
	now = 600002; fail = true;
	assert.equal((await provider.getPosters([identity(1)]))[0].status, "error");
	await provider.getPosters([identity(1)]); assert.equal(calls, 6);
});

test("all artwork failures leave authoritative Trakt sample rows untouched", async () => {
	const original = sample(Array.from({ length: 6 }, (_, index) => item("movie", {
		title: "Authoritative " + index, ids: { ...item().ids, tmdb: index + 1 },
	})));
	const rows = normalizeTraktPreview(original), before = JSON.stringify(rows);
	const provider = createTmdbTitlePosterProvider({ baseUrl, fetchImpl: async url => {
		const id = Number(new URL(url).pathname.split("/").at(-1));
		if (id === 1) return json({ id, poster_path: null });
		if (id === 2) return json({}, 404);
		if (id === 3) return json({ id: 999, poster_path: "/wrong.jpg" });
		if (id === 4) return json({ id, poster_path: "https://untrusted.example/image.jpg" });
		if (id === 5) return new Response("not json", { headers: { "Content-Type": "text/html" } });
		throw new Error("network failure");
	} });
	const posters = await provider.getPosters(rows.items.map(row => row.posterIdentity));
	assert.equal(posters.length, 6); assert.ok(posters.every(row => row.posterPath === null));
	assert.equal(JSON.stringify(rows), before);
	assert.deepEqual(rows.items.map(row => row.title), original.items.map(row => row.title));
	assert.ok(posters.every(row => !Object.hasOwn(row, "title")), "artwork cannot overwrite text");
});

test("poster rate limit stops undispatched requests without retries or discarding rows", async () => {
	let calls = 0;
	const provider = createTmdbTitlePosterProvider({ baseUrl, fetchImpl: async () => { calls++; return json({}, 429); } });
	const result = await provider.getPosters(Array.from({ length: 15 }, (_, i) => identity(i + 1)));
	assert.equal(calls, 3); assert.equal(result.length, 15);
	assert.ok(result.every(row => row.status === "error" && row.error.status === 429));
});

test("poster abort cancels active and queued work; already aborted batches make zero calls", async () => {
	let calls = 0;
	const provider = createTmdbTitlePosterProvider({ baseUrl, fetchImpl: (url, { signal }) => {
		calls++; return new Promise((resolve, reject) => signal.addEventListener("abort", () => reject(new Error("abort")), { once: true }));
	} });
	const controller = new AbortController();
	const pending = provider.getPosters(Array.from({ length: 15 }, (_, i) => identity(i + 1)), { signal: controller.signal });
	await tick(); controller.abort();
	assert.ok((await pending).every(row => row.status === "aborted")); assert.equal(calls, 3);
	await provider.getPosters([identity(16)], { signal: controller.signal }); assert.equal(calls, 3);
});

test("extracted collection transport retains URLs, normalized results, cache, status errors and content handling", async () => {
	let calls = 0;
	const provider = createTmdbCollectionProvider({ baseUrl, fetchImpl: async (url, init) => {
		calls++; assert.equal(init.method, "GET"); assert.deepEqual(init.headers, { Accept: "application/json" });
		if (new URL(url).pathname === "/3/search/collection") {
			assert.equal(new URL(url).searchParams.get("include_adult"), "false");
			return json({ results: [{ id: 12, name: "Franchise", overview: "", poster_path: "/p.jpg" }], page: 1, total_pages: 1, total_results: 1 });
		}
		assert.equal(url, baseUrl + "/3/collection/12");
		return json({ id: 12, name: "Franchise", overview: "Text", parts: [{ id: 8, title: "Part", release_date: "2020-01-01", poster_path: "/p.jpg" }] });
	} });
	assert.equal((await provider.searchCollections(" Franchise ")).data.results[0].name, "Franchise");
	const result = await provider.getCollection(12);
	assert.equal(result.data.containedTitles[0].title, "Part"); assert.equal(result.data.movieCount, 1);
	assert.equal((await provider.getCollection(12)).fromCache, true); assert.equal(calls, 2);
	for (const [status, kind, retryable] of [[404, "not-found", false], [429, "rate-limit", true], [503, "provider", true]]) {
		const p = createTmdbCollectionProvider({ baseUrl, fetchImpl: async () => json({}, status) });
		const r = await p.getCollection(12);
		assert.deepEqual({ kind: r.error.kind, status: r.error.status, retryable: r.error.retryable }, { kind, status, retryable });
	}
	for (const response of [new Response("broken", { headers: { "Content-Type": "application/json" } }), new Response("<html>", { headers: { "Content-Type": "text/html" } })]) {
		const p = createTmdbCollectionProvider({ baseUrl, fetchImpl: async () => response });
		assert.equal((await p.getCollection(12)).error.kind, "invalid-response");
	}
});

test("shared transport and poster provider honor timeout/abort without caching failures", async () => {
	const fetchImpl = (url, { signal }) => new Promise((resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
	const request = createTmdbJsonRequester({ baseUrl, timeoutMs: 5, fetchImpl });
	assert.equal((await request("/3/movie/1", {}, { cacheKey: "movie:1", normalize: value => value })).error.kind, "timeout");
	const provider = createTmdbTitlePosterProvider({ baseUrl, timeoutMs: 5, fetchImpl });
	assert.equal((await provider.getPosters([identity(1)]))[0].error.kind, "timeout");
});

test("existing coordinator rejects a stale sample after newer Preview or close, even when task ignores abort", async () => {
	let oldComplete;
	const coordinator = createAsyncRequestCoordinator();
	const previous = coordinator.run(() => new Promise(resolve => { oldComplete = resolve; }), 1);
	const current = await coordinator.run(async () => ({ ok: true, data: { id: 2 } }), 2);
	oldComplete({ ok: true, data: { id: 1 } }); assert.equal((await previous).accepted, false);
	assert.equal(current.state.data.id, 2); assert.equal(coordinator.getState().data.id, 2);
	const closing = coordinator.run(() => new Promise(resolve => { oldComplete = resolve; }), 3);
	coordinator.cancel(); oldComplete({ ok: true, data: { id: 3 } });
	assert.equal((await closing).accepted, false); assert.equal(coordinator.getState().status, "idle");
});

test("authoritative unavailable handling cannot add/remove/reorder selected lists or initiate media work", () => {
	let calls = 0;
	const session = createTraktSelectionSession({ client: { resolve() { calls++; }, getMedia() { calls++; } } });
	const list = id => ({ id, availability: "available", creator: null, name: "List " + id });
	session.select(list(1)); session.select(list(2));
	const before = session.getState().selection.order;
	session.select({ ...list(3), availability: "unavailable" });
	assert.deepEqual(session.getState().selection.order, before);
	session.select({ ...list(1), availability: "unavailable" });
	assert.deepEqual(session.getState().selection.order, before);
	assert.equal(session.getState().selection.byId[1].media.publicRead, false);
	assert.equal(session.getState().selection.byId[1].media.status, "unavailable");
	assert.equal(calls, 0);
});
