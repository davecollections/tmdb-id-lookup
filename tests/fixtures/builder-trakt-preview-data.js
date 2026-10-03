import { createTraktClient } from "../../builder/src/source-add/trakt-client.js";
import { createTmdbTitlePosterProvider } from "../../builder/src/source-add/tmdb-title-poster-provider.js";

// Owner-authorized deterministic transport and local artwork; never live evidence.
export const previewJson = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json", ...headers } });
// Deliberately supplied service-order examples, not a client sorting implementation.
export const reviewSourceOrders = { rank: [9, 2, 5, 10], added: [5, 9, 2, 10], title: [2, 5, 9, 10], released: [9, 5, 2, 10], runtime: [5, 2, 9, 10], popularity: [2, 9, 5, 10], percentage: [10, 9, 2, 5], votes: [10, 5, 9, 2] };
export function reviewSample(id, context = null) {
 if (context) {
  const order = [...reviewSourceOrders[context.sortBy]];
  if (context.sortHow === "desc") order.reverse();
  return { apiVersion: 1, id, sample: "first-page", items: order.map(tmdb => ({ type: context.type, title: "Sorted local fixture " + tmdb, year: null, rank: tmdb, season: null, number: null,
   ids: { trakt: null, tmdb, imdb: null, slug: null, show_tmdb: null, show_slug: null } })), pagination: { page: 1, limit: 50, page_count: 3, item_count: 140 } };
 }
 const row = (type, title, extra = {}) => ({ type, title, year: null, rank: null, season: null, number: null,
  ids: { trakt: null, tmdb: null, imdb: null, slug: null, show_tmdb: null, show_slug: null }, ...extra });
 const movie = row("movie", "A deterministic movie", { year: 2024, ids: { tmdb: 1 } });
 const items = [
  movie, row("show", "A deterministic series", { year: 2021, ids: { tmdb: 2 } }),
  row("season", "Series specials", { number: 0, ids: { show_tmdb: 2 } }),
  row("episode", "An episode", { season: 2, number: 5, ids: { show_tmdb: 2 } }),
  { ...movie }, row("movie", "A very long item title about journeys across distant oceans — " + "UnbrokenTitle".repeat(12)),
  row("movie", null), ...Array.from({ length: 43 }, (_, i) => row(i % 2 ? "show" : "movie", "Sample title " + (i + 8), { ids: { tmdb: i + 10 } })),
 ];
 if (id === 107 || id === 117) items.forEach((item, index) => { item.ids = ["season", "episode"].includes(item.type) ? { show_tmdb: index + (id === 117 ? 130 : 30) } : { tmdb: index + (id === 117 ? 130 : 30) }; });
 if (id === 109) items.forEach(item => { item.ids = {}; });
 items.forEach(item => { item.ids = { trakt: null, tmdb: null, imdb: null, slug: null, show_tmdb: null, show_slug: null, ...item.ids }; });
 return { apiVersion: 1, id, sample: "first-page", items: id === 104 ? [] : items,
  pagination: { page: 1, limit: 50, page_count: 3, item_count: 140 } };
}
export function createReviewPreviewProviders(calls = []) {
 const itemRequests = [], posterRequests = [], itemOverrides = new Map(), posterOverrides = new Map();
 const attempts = new Map();
 const client = createTraktClient({ fetchImpl: async (url, init) => {
  const parsed = new URL(url), id = Number(parsed.pathname.split("/").at(-2));
  const request = { kind: "items", id, url, signal: init.signal }; calls.push(request); itemRequests.push(request);
  const reply = () => {
   attempts.set(id, (attempts.get(id) ?? 0) + 1);
   return id === 106 ? previewJson({ apiVersion: 1, error: { code: "LIST_NOT_FOUND" } }, 404)
    : id === 105 && attempts.get(id) === 1 ? previewJson({ apiVersion: 1, error: { code: "UPSTREAM_FAILURE" } }, 502)
    : previewJson(reviewSample(id, parsed.searchParams.has("type") ? { type: parsed.searchParams.get("type"), sortBy: parsed.searchParams.get("sort_by"), sortHow: parsed.searchParams.get("sort_how") } : null));
  };
  if (itemOverrides.has(id)) return itemOverrides.get(id)(init, reply);
  await new Promise(resolve => setTimeout(resolve, 70));
  return reply();
 } });
 const posterProvider = createTmdbTitlePosterProvider({ baseUrl: "https://poster.example.test", fetchImpl: async (url, init) => {
  const request = { url, signal: init.signal }; posterRequests.push(request);
  const id = Number(new URL(url).pathname.split("/").at(-1));
  const reply = () => id === 11 ? previewJson({ error: "Injected poster failure" }, 502) : previewJson({ id, poster_path: id === 10 ? null : "/trakt-c-fixture-" + id + ".svg" });
  if (posterOverrides.has(id)) return posterOverrides.get(id)(init, reply);
  await new Promise(resolve => setTimeout(resolve, 100));
  return reply();
 } });
 const posterUrlForPath = path => "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="84" height="126"><rect width="84" height="126" fill="#184658"/><path d="M0 90L42 40L84 90V126H0" fill="#296a80"/><text x="42" y="110" text-anchor="middle" font-size="12" fill="white">LOCAL ' + path.match(/(\d+)\.svg$/)?.[1] + '</text></svg>');
 return { getItems: client.getItems, getNotBefore: client.getNotBefore, itemRequests, posterRequests, itemOverrides, posterOverrides, posterProvider, posterUrlForPath };
}
