// Pure deterministic paging tests. These do not claim live TMDB acceptance.
import assert from "node:assert/strict";
import test from "node:test";
import { accumulateTitlePreviewPages, completeTitlePreview, previewPagination, titlePreviewSummary } from "../builder/src/source-add/title-preview-results.js";
import { createPreviewPageCache, pagedTitlePreview } from "../builder/src/source-add/preview-page-cache.js";
import { createTmdbDiscoverPreviewRequester } from "../builder/src/source-add/tmdb-discover-preview-requester.js";
import { createAdvancedDiscoverPreviewProvider } from "../builder/src/source-add/tmdb-advanced-discover-preview-provider.js";
import { createTmdbStudioPreviewProvider } from "../builder/src/source-add/tmdb-studio-preview-provider.js";
import { createTmdbNetworkPreviewProvider } from "../builder/src/source-add/tmdb-network-preview-provider.js";
import { createTmdbGenrePreviewProvider } from "../builder/src/source-add/tmdb-genre-preview-provider.js";
import { createTmdbStreamingPreviewProvider } from "../builder/src/source-add/tmdb-streaming-preview-provider.js";
import { createTmdbDecadesPreviewProvider } from "../builder/src/source-add/tmdb-decades-preview-provider.js";
import { createTmdbListProvider } from "../builder/src/source-add/tmdb-list-provider.js";
import { requestSourceTitlePreview } from "../builder/src/source-add/source-title-preview.js";
import { normalizePersonCombinedCredits } from "../builder/src/source-add/person-credits.js";

const item = (id) => ({ id, title: `Unit title ${id}`, mediaType: "MOVIE", posterPath: id % 10 ? `/unit-${id}.jpg` : null });
const pageData = (page, totalResults = 124) => ({ page, totalPages: Math.ceil(totalResults / 20), totalResults, mediaType: "MOVIE", results: Array.from({ length: Math.min(20, Math.max(0, totalResults - (page - 1) * 20)) }, (_, i) => item((page - 1) * 20 + i + 1)) });
const response = (value) => new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });
function payload(page, total = 124) {
 const data = pageData(page, total);
 return { page, total_pages: data.totalPages, total_results: total, results: data.results.map((entry) => ({ id: entry.id, title: entry.title, name: entry.title, poster_path: entry.posterPath })) };
}
function deferred() { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; }

test("the first 100 positions precede deduplication and poster filtering; no replacement positions", () => {
 const pages = [1, 2, 3, 4, 5].map((page) => pageData(page));
 pages[1].results[0] = item(1);
 const data = accumulateTitlePreviewPages(pages);
 assert.equal(data.sourcePositions, 100);
 assert.equal(data.results.length, 99);
 assert.equal(data.duplicateCount, 1);
 assert.equal(data.results.filter((entry) => entry.posterPath).length, 89);
 assert.equal(data.canLoadMore, false);
 assert.equal(data.complete, false);
 assert.equal(data.capped, true);
 assert.equal(data.totalResults, 124);
 assert.equal(titlePreviewSummary(data, 89), "124 titles found. Preview is limited to 100.");
 assert.equal(titlePreviewSummary(data, 88), titlePreviewSummary(data, 89));
});

test("completion and conservative totals use structural evidence, independently of the cap", () => {
 for (const total of [0, 1, 18, 20, 40, 100, 124]) {
  const pages = Array.from({ length: Math.min(5, Math.max(1, Math.ceil(total / 20))) }, (_, index) => pageData(index + 1, total));
  const data = accumulateTitlePreviewPages(pages);
  assert.equal(data.totalResults, total);
  assert.equal(data.complete, total <= 100);
 }
 assert.equal(titlePreviewSummary(accumulateTitlePreviewPages([pageData(1, 18)]), 18), "Showing all 18 titles.");
 for (const total of [10_001, 19_997, 20_001, 50_001]) assert.equal(accumulateTitlePreviewPages([pageData(1, total)]).totalResults, null, "beyond TMDB's accessible page range, not a special sentinel");
 for (const pages of [[{ ...pageData(1), totalPages: 9 }], [pageData(1), pageData(2, 125)], [{ ...pageData(1), results: [item(1)] }], [{ results: [item(1)], totalResults: 124 }]]) {
  assert.equal(accumulateTitlePreviewPages(pages).totalResults, null);
  assert.equal(accumulateTitlePreviewPages(pages).complete, false);
 }
 assert.equal(titlePreviewSummary(accumulateTitlePreviewPages([pageData(1)]), 0), "No posters available.");
 assert.equal(accumulateTitlePreviewPages([pageData(1), { ...pageData(2), results: [] }]).canLoadMore, false);
 assert.equal(accumulateTitlePreviewPages([{ results: [], totalResults: 0 }]).complete, true);
 assert.equal(accumulateTitlePreviewPages([{ ...pageData(1, 0), totalPages: 7 }]).totalResults, null);
 assert.equal(completeTitlePreview(Array.from({ length: 120 }, (_, i) => item(i + 1))).results.length, 100);
 for (const value of [{ page: 2, total_pages: 7 }, { page: 1.1, total_pages: 7 }, { page: 1, total_pages: -1 }, { page: 1 }, { total_pages: 7 }]) assert.equal(previewPagination(value, 1), null);
 assert.equal(previewPagination({}, 2), null);
 assert.equal(previewPagination({ page: 2, total_pages: 0 }, 2), null);
});

test("neutral title status is independent of ordinary missing artwork and repeats", () => {
 const first = accumulateTitlePreviewPages([pageData(1)]);
 const second = accumulateTitlePreviewPages([pageData(1), pageData(2)]);
 for (const visible of [1, 14, 19, 20]) assert.equal(titlePreviewSummary(first, visible), "124 titles found. Preview is limited to 100.");
 assert.equal(titlePreviewSummary(second, 35), "124 titles found. Preview is limited to 100.");
 assert.equal(titlePreviewSummary(completeTitlePreview([item(1)]), 1), "Showing the only title.");
 assert.equal(titlePreviewSummary(completeTitlePreview(Array.from({ length: 18 }, (_, i) => item(i + 1))), 14), "Showing all 18 titles.");
 assert.equal(titlePreviewSummary(accumulateTitlePreviewPages([1,2,3,4,5].map((page) => pageData(page, 20001))), 80), "Preview shows up to 100 titles.");
 assert.equal(titlePreviewSummary(completeTitlePreview([]), 0), "No titles to preview.");
 assert.equal(titlePreviewSummary(accumulateTitlePreviewPages([{ results: [] }]), 0), "No titles to preview.");
 assert.equal(titlePreviewSummary(completeTitlePreview([item(1)]), 0), "No posters available.");
 assert.equal(titlePreviewSummary(accumulateTitlePreviewPages([{ results: [item(1)] }]), 1), "Preview shows up to 100 titles.");
});

test("Preview ceiling copy preserves totals and distinguishes completion at exactly 100", () => {
 for (const total of [1, 18, 100, 186]) {
  const completeData = completeTitlePreview(Array.from({ length: total }, (_, i) => item(i + 1)));
  const pagedData = accumulateTitlePreviewPages(Array.from({ length: Math.min(5, Math.ceil(total / 20)) }, (_, i) => pageData(i + 1, total)));
  for (const data of [completeData, pagedData]) {
   const before = structuredClone(data);
   const expected = total <= 100 ? total === 1 ? "Showing the only title." : `Showing all ${total} titles.` : `${total} titles found. Preview is limited to 100.`;
   for (const posters of [1, data.results.length]) assert.equal(titlePreviewSummary(data, posters), expected);
   assert.equal(data.totalResults, total, "the full total remains available internally");
   assert.deepEqual(data, before, "formatting never mutates result state");
   assert.equal(data.canLoadMore, false);
  }
 }
 const unknown = accumulateTitlePreviewPages([1, 2, 3, 4, 5].map((page) => ({ ...pageData(page), totalResults: null })));
 assert.equal(titlePreviewSummary(unknown, 90), "Preview shows up to 100 titles.");
 assert.equal(unknown.totalResults, null);
 assert.equal(unknown.canLoadMore, false);
 for (const totalResults of [0, 186, null]) assert.equal(titlePreviewSummary(accumulateTitlePreviewPages([{ results: [], totalResults }]), 0), "No titles to preview.");
});

test("cache coalesces one sequential flight, retains pages on failure, retries only that page, and reopens", async () => {
 const calls = [], gate = deferred(); let failure = true, now = 0;
 const cache = createPreviewPageCache({ ttlMs: 10, maxEntries: 2, now: () => now });
 const load = async (page) => { calls.push(page); if (page === 2) await gate.promise; if (page === 4 && failure) return { ok: false, error: { kind: "provider" } }; return { ok: true, data: pageData(page) }; };
 const [first, same] = await Promise.all([cache.open("a", load), cache.open("a", load)]);
 assert.deepEqual(calls, [1]);
 let data = pagedTitlePreview(first.chain);
 assert.equal(data.sourcePositions, 20);
 const pending = data.loadMore(), coalesced = pagedTitlePreview(same.chain).loadMore();
 await Promise.resolve(); assert.deepEqual(calls, [1, 2]);
 gate.resolve();
 data = (await pending).data; assert.equal((await coalesced).data.sourcePositions, 40);
 data = (await data.loadMore()).data;
 assert.equal((await data.loadMore()).ok, false);
 assert.equal(data.sourcePositions, 60);
 assert.equal((await cache.open("a", load)).fromCache, true);
 assert.equal(pagedTitlePreview(first.chain).sourcePositions, 60);
 failure = false; data = (await data.loadMore()).data; data = (await data.loadMore()).data;
 assert.equal(data.sourcePositions, 100); assert.equal(data.loadMore, undefined);
 assert.equal((await first.chain.request(6)).error.kind, "invalid-request");
 assert.deepEqual(calls, [1, 2, 3, 4, 4, 5]);
 now = 11;
 assert.equal(pagedTitlePreview((await cache.open("a", load)).chain).sourcePositions, 20);
 assert.deepEqual(calls, [1, 2, 3, 4, 4, 5, 1]);
});

test("cancelling the last consumer discards late results, while another active consumer survives", async () => {
 const cache = createPreviewPageCache({ ttlMs: 100, maxEntries: 2 });
 const gate = deferred(); let signal;
 const load = async (_page, requestSignal) => { signal = requestSignal; await gate.promise; return { ok: true, data: pageData(1) }; };
 const a = new AbortController(), b = new AbortController();
 const first = cache.open("a", load, { signal: a.signal }), second = cache.open("a", load, { signal: b.signal });
 await Promise.resolve(); a.abort();
 assert.equal((await first).error.kind, "aborted"); assert.equal(signal.aborted, false);
 gate.resolve(); assert.equal((await second).ok, true);
 const late = deferred(), cancel = new AbortController();
 const old = cache.open("b", async () => { await late.promise; return { ok: true, data: pageData(1) }; }, { signal: cancel.signal });
 await Promise.resolve(); cancel.abort(); assert.equal((await old).error.kind, "aborted");
 const fresh = await cache.open("b", async () => ({ ok: true, data: pageData(1, 1) }));
 late.resolve(); await Promise.resolve(); await Promise.resolve();
 assert.equal(pagedTitlePreview(fresh.chain).sourcePositions, 1);
 assert.equal(pagedTitlePreview((await cache.open("b", load)).chain).sourcePositions, 1);
});

test("malformed later pages and body timeouts never enter the successful sequence", async () => {
 let mode = "wrong-page", calls = [];
 const requester = createTmdbDiscoverPreviewRequester({ baseUrl: "https://worker.example", previewPaths: { MOVIE: "/builder/discover/movie" }, entityLabel: "Unit", entityType: "UNIT", timeoutMs: 5,
  fetchImpl: async (input, { signal }) => { const page = Number(new URL(input).searchParams.get("page") ?? 1); calls.push(page);
   if (page === 1 || mode === "success") return response(payload(page));
   if (mode === "wrong-page") return response(payload(1));
   return { ok: true, headers: { get: () => "application/json" }, json: () => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("timeout")), { once: true })) };
  } });
 const initial = await requester.getQueryPreview("MOVIE", { include_adult: "false", sort_by: "popularity.desc" });
 assert.equal((await initial.data.loadMore()).error.kind, "invalid-response");
 mode = "timeout"; assert.equal((await initial.data.loadMore()).error.kind, "timeout");
 mode = "success"; assert.equal((await initial.data.loadMore()).data.sourcePositions, 40);
 assert.deepEqual(calls, [1, 2, 2, 2]);
});

const draft = (mediaType, filters = {}) => ({ nodeType: "source", internalId: "unit-preview", category: "native-tmdb", editable: { provider: "tmdb", tmdbSourceType: "DISCOVER", tmdbId: null, title: "Unit query", mediaType, sortBy: mediaType === "TV" ? "first_air_date.desc" : "primary_release_date.desc", filters } });
for (const media of ["MOVIE", "TV"]) for (const family of ["Discover", "Studio", "Genre", "Streaming", "Decade", "Year", "Decade Genre", ...(media === "TV" ? ["Network"] : [])]) {
 test(`${family} ${media} preserves the complete effective query on pages 1–5`, async () => {
  const urls = [], options = { baseUrl: "https://worker.example", fetchImpl: async (input) => { const url = new URL(input); urls.push(url); return response(payload(Number(url.searchParams.get("page") ?? 1))); } };
  const period = { releaseDateGte: "1980-01-01", releaseDateLte: "1989-12-31" };
  const year = { releaseDateGte: "1981-01-01", releaseDateLte: "1981-12-31" };
  const get = family === "Discover" ? () => createAdvancedDiscoverPreviewProvider(options).getAdvancedDiscoverPreview(draft(media, { withKeywords: "15097|9951", voteAverageGte: 7, voteCountGte: 100 }))
   : family === "Studio" ? () => createTmdbStudioPreviewProvider(options).getStudioPreview(3, { mediaType: media, sortOptionId: "recent", filters: { voteCountGte: 100, withoutCompanies: "174" } })
   : family === "Network" ? () => createTmdbNetworkPreviewProvider(options).getNetworkPreview(213, { sortOptionId: "recent", filters: { voteCountGte: 100 } })
   : family === "Genre" ? () => createTmdbGenrePreviewProvider(options).getGenrePreview(draft(media, { withGenres: "35", voteCountGte: 100 }))
   : family === "Streaming" ? () => createTmdbStreamingPreviewProvider(options).getStreamingPreview(draft(media, { watchRegion: "AU", withWatchProviders: "8", voteCountGte: 100 }))
   : () => createTmdbDecadesPreviewProvider(options).getDecadePreview(draft(media, { ...(family === "Year" ? year : period), ...(family === "Decade Genre" ? { withGenres: "35" } : {}), voteCountGte: 100 }));
  let result = await get(); assert.equal(result.ok, true, JSON.stringify(result)); assert.equal(urls.length, 1);
  assert.equal(titlePreviewSummary(result.data, 18), "124 titles found. Preview is limited to 100.");
  for (let page = 2; page <= 5; page++) { result = await result.data.loadMore(); assert.equal(result.ok, true); assert.equal(urls.length, page); }
  assert.equal(result.data.loadMore, undefined);
  assert.equal(titlePreviewSummary(result.data, 90), "124 titles found. Preview is limited to 100.");
  assert.equal(result.data.totalResults, 124);
  const original = urls[0]; assert.equal(original.pathname, `/builder/discover/${media === "TV" ? "tv" : "movie"}`);
  assert.equal(original.searchParams.get("include_adult"), "false");
  assert.equal(original.searchParams.has("page"), false);
  for (let i = 1; i < urls.length; i++) { assert.equal(urls[i].searchParams.get("page"), String(i + 1)); urls[i].searchParams.delete("page"); assert.equal(String(urls[i]), String(original)); }
  if (family === "Streaming") assert.equal(original.searchParams.get("with_watch_monetization_types"), "flatrate|free|ads|rent|buy");
 });
}

test("representative Decade sampling reuses only page one even after exact expansion", async () => {
 const urls = []; const provider = createTmdbDecadesPreviewProvider({ baseUrl: "https://worker.example", fetchImpl: async (input) => { const url = new URL(input); urls.push(url); return response(payload(Number(url.searchParams.get("page") ?? 1))); } });
 const sources = [1980, 1981].map((year) => draft("MOVIE", { releaseDateGte: `${year}-01-01`, releaseDateLte: `${year}-12-31` }));
 const exact = await provider.getDecadePreview(sources[0]); await exact.data.loadMore();
 const sample = await provider.getDecadeSample(sources);
 assert.equal(sample.data.results.length, 2); assert.equal(sample.data.loadMore, undefined);
 assert.deepEqual(urls.map((url) => url.searchParams.get("page")), [null, "2", null]);
});

test("List original and each recognised sort project cached pages independently and append without global sorting", async () => {
 const calls = [];
 const provider = createTmdbListProvider({ baseUrl: "https://worker.example", fetchImpl: async (input) => { const page = Number(new URL(input).searchParams.get("page")); calls.push(page); return response({ id: 9, item_count: 124, page, total_pages: 7, total_results: 124,
  items: Array.from({ length: 20 }, (_, i) => ({ id: (page - 1) * 20 + i + 1, media_type: "movie", title: `Unit ${i}`, release_date: `${2000 + page}-01-${String(i + 1).padStart(2, "0")}`, vote_average: i / 2, vote_count: i + page * 100, poster_path: i === 0 ? null : `/unit-${i}.jpg` })) }); } });
 let original = (await provider.getListPreview(9)).data; original = (await original.loadMore()).data;
 assert.equal(titlePreviewSummary(original, 38), "124 titles found. Preview is limited to 100.");
 assert.deepEqual(original.results.map((entry) => entry.id), Array.from({ length: 40 }, (_, i) => i + 1));
 for (const sortBy of ["primary_release_date.desc", "first_air_date.desc", "vote_average.desc", "vote_count.desc"]) {
  const data = (await provider.getListPreview(9, { sortBy })).data;
  assert.deepEqual(data.results.map((entry) => entry.id), [...Array.from({ length: 20 }, (_, i) => 20 - i), ...Array.from({ length: 20 }, (_, i) => 40 - i)]);
  assert.equal(data.sourcePositions, 40);
 }
 const unknown = (await provider.getListPreview(9, { sortBy: "Owner.Unknown" })).data;
 assert.equal(unknown.sourcePositions, 20); assert.equal(unknown.loadMore, undefined); assert.match(unknown.orderingNote, /can’t reproduce/);
 assert.deepEqual(calls, [1, 2]);
 for (let page = 3; page <= 5; page++) original = (await original.loadMore()).data;
 assert.equal(original.sourcePositions, 100); assert.equal(original.loadMore, undefined); assert.deepEqual(calls, [1, 2, 3, 4, 5]);
 assert.equal(titlePreviewSummary(original, 95), "124 titles found. Preview is limited to 100.");
 assert.equal(original.totalResults, 124);
});

test("complete People credits and Collection parts expand without extra requests; poster gaps stay inside the cap", async () => {
 const cast = Array.from({ length: 120 }, (_, i) => ({ id: i + 1, media_type: "movie", popularity: 120 - i, poster_path: i % 10 ? `/unit-${i}.jpg` : null }));
 const person = { id: 31, combinedCredits: normalizePersonCombinedCredits({ cast: [...cast, cast[0]], crew: [{ ...cast[0], job: "Director" }] }) };
 const people = await requestSourceTitlePreview({ kind: "people", tmdbId: 31, person, combinationId: "acting-movies", sortOptionId: "popular", mediaType: "MOVIE" }, {});
 assert.equal(people.data.results.length, 100); assert.equal(people.data.totalResults, 120); assert.equal(people.data.results.filter((entry) => entry.posterPath).length, 90); assert.equal(people.data.loadMore, undefined);
 let calls = 0; const parts = Array.from({ length: 120 }, (_, i) => item(120 - i));
 const collection = await requestSourceTitlePreview({ kind: "collection", tmdbId: 1 }, { collection: { getCollection: async () => { calls++; return { ok: true, data: { containedTitles: parts, movieCount: 120 } }; } } });
 assert.equal(calls, 1); assert.deepEqual(collection.data.results.map((entry) => entry.id), parts.slice(0, 100).map((entry) => entry.id)); assert.equal(collection.data.loadMore, undefined);
 for (const data of [people.data, collection.data]) {
  assert.equal(titlePreviewSummary(data, 90), "120 titles found. Preview is limited to 100.");
  assert.equal(data.totalResults, 120);
 }
});


test("Preview status uses the supplied cap and never infers a total from loaded rows", () => {
 assert.equal(titlePreviewSummary({ sourcePositions: 10, complete: false, totalResults: null }, 8, 10), "Preview shows up to 10 titles.");
 assert.equal(titlePreviewSummary({ sourcePositions: 10, complete: false, totalResults: 45 }, 8, 10), "45 titles found. Preview is limited to 10.");
 assert.equal(titlePreviewSummary({ sourcePositions: 10, complete: true, totalResults: 10 }, 8, 10), "Showing all 10 titles.");
 assert.equal(titlePreviewSummary({ sourcePositions: 1, complete: true, totalResults: 1 }, 1, 10), "Showing the only title.");
});
