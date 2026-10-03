import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { EventEmitter } from "node:events";
import { fileURLToPath } from "node:url";
import { createElement } from "../builder/node_modules/react/index.js";
import { renderToStaticMarkup } from "../builder/node_modules/react-dom/server.js";
import { createServer } from "../builder/node_modules/vite/dist/node/index.js";
import builderViteConfig from "../builder/vite.config.js";
import { createBuilderController } from "../builder/src/application/index.js";
import { TRAKT_API_ORIGIN, TRAKT_LOCAL_PROXY_PREFIX, traktApiBase } from "../builder/src/config/trakt-api.js";
import { createTraktClient, normalizeTraktResponse, traktDiscoveryRequest, traktRetryNotBefore, traktFailure } from "../builder/src/source-add/trakt-client.js";
import { createTraktPreviewMiddleware, localTraktPreviewPlugin } from "../builder/trakt-preview-proxy.js";

// Pure transport/contract examples, not live Trakt data or integration evidence.
const list = (id = 123, extra = {}) => ({ name: "Unit list", description: null, ids: { trakt: id, slug: null }, creator: { username: null, name: null, slug: null }, url: null, item_count: null, like_count: 0, updated_at: null, availability: "unverified", ...extra });
const discovery = (rows = [list()], page = 1, limit = 30) => ({ apiVersion: 1, lists: rows, pagination: { page, limit, page_count: null, item_count: null } });
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...headers } });

test("inert fixed client builds explicit discovery requests, rejects filtered users, and does not automatically fetch samples", async () => {
	const calls = [];
	const client = createTraktClient({ fetchImpl: async (url, init) => { calls.push({ url: new URL(url), init }); const u = new URL(url); return json(discovery([], Number(u.searchParams.get("page")), Number(u.searchParams.get("limit")))); } });
	assert.equal(calls.length, 0); assert.equal(client.getListSample, undefined);
	await client.searchKeyword("123"); await client.searchUser("@some-user", { page: 2, limit: 50 }); await client.browse("popular"); await client.browse("trending");
	assert.equal(calls.length, 4); assert.equal(calls[0].url.pathname, "/v1/trakt/search"); assert.equal(calls[0].url.searchParams.get("mode"), "keyword"); assert.equal(calls[0].url.searchParams.get("q"), "123");
	assert.equal(calls[1].url.searchParams.get("q"), "some-user");
	for (const { url, init } of calls) { assert.equal(url.origin, TRAKT_API_ORIGIN); assert.equal(init.method, "GET"); assert.equal(init.credentials, "omit"); assert.deepEqual(init.headers, { Accept: "application/json" }); assert.ok(init.signal); }
	for (const input of ["me", "@ME", "user filter", "user/name", ""]) assert.equal((await client.searchUser(input)).error.code, "INVALID_REQUEST");
	for (const options of [{ page: 26 }, { page: 0 }, { limit: 51 }, { limit: "30" }]) assert.equal((await client.searchKeyword("a", options)).error.code, "INVALID_REQUEST");
	assert.equal((await client.searchKeyword("a\nb")).ok, false); assert.equal(calls.length, 4);
	assert.throws(() => traktDiscoveryRequest("other", "x"));
});

test("resolve forwards both ordinary hosts and compatibility forms without a second URL grammar", async () => {
	const sent = [];
	const client = createTraktClient({ fetchImpl: async url => { sent.push(new URL(url).searchParams.get("value")); return json({ apiVersion: 1, list: list(123, { availability: "available" }) }); } });
	const forms = ["123", "https://trakt.tv/users/user/lists/list", "https://app.trakt.tv/users/user/lists/list", "https://www.trakt.tv/users/user/lists/list", "https://trakt.tv/lists/123", "https://app.trakt.tv/lists/123", "https://www.trakt.tv/lists/123"];
	for (const value of forms) assert.equal((await client.resolve(` ${value} `)).ok, true);
	assert.deepEqual(sent, forms);
	await client.resolve("https://invalid.example/unsupported"); assert.equal(sent.at(-1), "https://invalid.example/unsupported", "the service, not Builder, rejects unsupported URL grammar");
	assert.equal((await client.resolve(" ")).error.code, "INVALID_REQUEST");
	const wrong = createTraktClient({ fetchImpl: async () => json({ apiVersion: 1, list: list(456, { availability: "available" }) }) });
	assert.equal((await wrong.resolve("123")).error.code, "INVALID_RESPONSE");
});

test("strict response normalization preserves null and zero, rejects incompatible IDs/fields/version/media", () => {
	const data = normalizeTraktResponse(discovery(), "keyword");
	assert.equal(data.lists[0].itemCount, null); assert.equal(data.lists[0].likeCount, 0); assert.equal(data.pagination.pageCount, null);
	for (const id of [0, -1, 1.2, "123", Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => normalizeTraktResponse(discovery([list(id)]), "keyword"));
	for (const payload of [{ ...discovery(), apiVersion: 2 }, { ...discovery(), lists: {} }, { ...discovery(), pagination: {} }, discovery([list(1, { item_count: "0" })]), discovery([list(1, { name: undefined })]), discovery([list(1, { url: "https://evil.example/x" })]), discovery([list(1, { updated_at: "yesterday" })])]) assert.throws(() => normalizeTraktResponse(payload, "keyword"));
	for (const [movie_count, show_count, composition] of [[1, 0, "movie-only"], [0, 1, "show-only"], [1, 2, "mixed"], [0, 0, "zero"]]) {
		const payload = { apiVersion: 1, id: 123, media: { status: "known", movie_count, show_count, composition } };
		assert.equal(normalizeTraktResponse(payload, "media", { id: 123 }).composition, composition);
		assert.throws(() => normalizeTraktResponse(payload, "media", { id: 124 }));
		assert.throws(() => normalizeTraktResponse({ ...payload, media: { ...payload.media, movie_count: null } }, "media", { id: 123 }));
	}
	assert.throws(() => normalizeTraktResponse({ apiVersion: 1, id: 123, media: { status: "known", movie_count: 0, show_count: 0, composition: "mixed" } }, "media", { id: 123 }));
});

test("all supported error codes are sanitized; Retry-After blocks uncached operations without retries", async () => {
	const codes = ["INVALID_REQUEST", "LIST_NOT_FOUND", "INVALID_UPSTREAM_RESPONSE", "UPSTREAM_FAILURE", "UPSTREAM_RATE_LIMIT", "UPSTREAM_BUDGET", "ABUSE_LIMIT", "SERVICE_NOT_CONFIGURED", "BUDGET_UNAVAILABLE", "SERVICE_BUSY", "RESERVATION_EXPIRED"];
	for (const code of codes) {
		const client = createTraktClient({ fetchImpl: async () => json({ apiVersion: 1, error: { code, message: "private raw server detail" } }, 503) });
		const result = await client.getMedia(123); assert.equal(result.error.code, code); assert.ok(!JSON.stringify(result).includes("private raw"));
	}
	let time = 1000, calls = 0;
	const client = createTraktClient({ now: () => time, fetchImpl: async () => { calls++; return json({ apiVersion: 1, error: { code: "UPSTREAM_BUDGET" } }, 429, { "Retry-After": "30" }); } });
	assert.equal((await client.getMedia(123)).error.notBefore, 31000);
	await client.browse("popular"); assert.equal(calls, 1); assert.equal(client.getNotBefore(), 31000);
	time = 31000; await client.getMedia(123); assert.equal(calls, 2);
	assert.equal(traktRetryNotBefore("Thu, 01 Jan 1970 00:00:40 GMT", 1000), 40000);
	for (const value of [null, "", "garbage", "1.5", "-1", "1e6", "999999999999999999999999"]) assert.equal(traktRetryNotBefore(value, 1000), 0);
	assert.equal(traktFailure("PRIVATE_SERVER_CODE").error.code, "INVALID_RESPONSE");
});

test("success cache is bounded, detached, expires and never stores errors", async () => {
	let time = 0, calls = 0, fail = false;
	const client = createTraktClient({ cacheMaxEntries: 1, now: () => time, fetchImpl: async () => { calls++; return fail ? json({ apiVersion: 1, error: { code: "UPSTREAM_FAILURE" } }, 502) : json(discovery()); } });
	await client.searchKeyword("one"); const cached = await client.searchKeyword("one"); cached.data.lists[0].name = "modified";
	assert.equal((await client.searchKeyword("one")).data.lists[0].name, "Unit list"); assert.equal(calls, 1);
	await client.searchKeyword("two"); await client.searchKeyword("one"); assert.equal(calls, 3);
	time = 300001; await client.searchKeyword("one"); assert.equal(calls, 4);
	fail = true; await client.searchKeyword("bad"); await client.searchKeyword("bad"); assert.equal(calls, 6);
});

test("abort, timeout including body read, malformed JSON and transport failures are bounded", async () => {
	const never = () => new Promise(() => {});
	const timeout = createTraktClient({ timeoutMs: 5, fetchImpl: never });
	assert.equal((await timeout.getMedia(1)).error.code, "TIMEOUT");
	const body = createTraktClient({ timeoutMs: 5, fetchImpl: async () => ({ ok: true, headers: new Headers({ "Content-Type": "application/json" }), json: never }) });
	assert.equal((await body.getMedia(1)).error.code, "TIMEOUT");
	const controller = new AbortController(); const pending = timeout.getMedia(2, { signal: controller.signal }); controller.abort();
	assert.equal((await pending).error.kind, "aborted"); assert.equal((await timeout.getMedia(2, { signal: controller.signal })).error.code, "ABORTED");
	for (const fetchImpl of [async () => { throw new Error("private network info"); }, async () => new Response("bad", { headers: { "Content-Type": "application/json" } }), async () => new Response("<html>bad</html>")]) {
		const result = await createTraktClient({ fetchImpl }).getMedia(1); assert.equal(result.ok, false); assert.ok(!JSON.stringify(result).includes("private"));
	}
	assert.equal((await timeout.getMedia("1")).error.code, "INVALID_REQUEST");
});

test("404 discards cached public URL aliases; explicit public verification always refreshes", async () => {
	let calls = 0, missing = false;
	const client = createTraktClient({ fetchImpl: async () => {
		calls++;
		return missing ? json({ apiVersion: 1, error: { code: "LIST_NOT_FOUND" } }, 404)
			: json({ apiVersion: 1, list: list(123, { availability: "available" }) });
	} });
	const url = "https://app.trakt.tv/users/a/lists/b";
	await client.resolve(url); await client.resolve(url); assert.equal(calls, 1);
	await client.resolve(url, { refresh: true }); assert.equal(calls, 2);
	missing = true; assert.equal((await client.getMedia(123)).error.code, "LIST_NOT_FOUND");
	assert.equal((await client.resolve(url)).error.code, "LIST_NOT_FOUND"); assert.equal(calls, 4);
});

async function proxyRequest(url, { method = "GET", headers = {}, fetchImpl = async () => json({ apiVersion: 1 }), enabled = true } = {}) {
	let installs = 0;
	localTraktPreviewPlugin(enabled).configureServer({ middlewares: { use: () => installs++ } });
	const request = Object.assign(new EventEmitter(), { url, method, headers: { host: "192.168.1.2:4173", ...headers } });
	const response = Object.assign(new EventEmitter(), { headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(body) { this.body = body; } });
	let next = false; await createTraktPreviewMiddleware({ fetchImpl })(request, response, () => { next = true; });
	return { response, next, installs };
}

test("fixed opt-in local proxy strips credentials/Origin and rejects arbitrary routes/targets/methods", async () => {
	let calls = 0;
	const fetchImpl = async (url, init) => { calls++; assert.equal(url, TRAKT_API_ORIGIN + "/v1/trakt/resolve?value=123"); assert.deepEqual(init.headers, { Accept: "application/json" }); assert.equal(init.credentials, "omit"); return json({ apiVersion: 1, error: { code: "UPSTREAM_BUDGET" } }, 429, { "Retry-After": "45", "Set-Cookie": "private" }); };
	const result = await proxyRequest(TRAKT_LOCAL_PROXY_PREFIX + "/v1/trakt/resolve?value=123", { fetchImpl, headers: { authorization: "private", cookie: "private", origin: "http://192.168.1.2:4173" } });
	assert.equal(calls, 1); assert.equal(result.response.statusCode, 429); assert.equal(result.response.headers["Retry-After"], "45"); assert.equal(result.response.headers["Set-Cookie"], undefined);
	for (const url of ["/v1/trakt/lists/1/items?page=2", "/v1/trakt/resolve?value=1&target=https://evil.example", "/v1/trakt/resolve?value=1&value=2", "/v1/trakt/../resolve?value=1", "https://evil.example", "/api/trakt"]) {
		const rejected = await proxyRequest(TRAKT_LOCAL_PROXY_PREFIX + url, { fetchImpl }); assert.ok(rejected.response.statusCode >= 400);
	}
	for (const options of [{ method: "POST" }, { headers: { host: "evil.example" } }, { headers: { origin: "https://evil.example" } }]) assert.ok((await proxyRequest(TRAKT_LOCAL_PROXY_PREFIX + "/v1/trakt/resolve?value=1", { ...options, fetchImpl })).response.statusCode >= 400);
	assert.equal(calls, 1); assert.equal((await proxyRequest("/builder/", { enabled: false })).installs, 0);
	assert.equal(traktApiBase(), TRAKT_API_ORIGIN); assert.equal(traktApiBase({ localPreview: true, hostname: "localhost" }), TRAKT_LOCAL_PROXY_PREFIX);
	assert.throws(() => traktApiBase({ localPreview: true, hostname: "dingo.build" }));
});

test("Phase A runtime client has no direct upstream credential or persistent cache", () => {
	const source = fs.readFileSync(new URL("../builder/src/source-add/trakt-client.js", import.meta.url), "utf8");
	for (const forbidden of ["api.trakt.tv", "TRAKT_CLIENT_ID", "localStorage", "indexedDB"]) assert.equal(source.includes(forbidden), false);
});

// Executable wiring checks, using the existing Vite SSR/React test approach.
// Only the factory export is observed; its real implementation and returned
// client remain intact. Both browser and middleware fetches are intercepted.
function observeTraktConstruction() {
 return {
  name: "test-observe-trakt-construction",
  transform(source, id) {
   if (!id.replaceAll("\\", "/").endsWith("/src/source-add/trakt-client.js")) return;
   const factory = "export function createTraktClient(";
   assert.ok(source.includes(factory));
   return source.replace(factory, "function observedCreateTraktClient(") + `
export const constructedClients = [];
export function createTraktClient(options) {
 const entry = { options };
 constructedClients.push(entry);
 entry.client = observedCreateTraktClient(options);
 return entry.client;
}
`;
  },
 };
}

function liveReviewConfig(flag, { command = "serve", isPreview = false } = {}) {
 const previous = process.env.TRAKT_LIVE_REVIEW;
 try {
  if (flag === undefined) delete process.env.TRAKT_LIVE_REVIEW;
  else process.env.TRAKT_LIVE_REVIEW = flag;
  return builderViteConfig({ command, isPreview, mode: command === "build" ? "production" : "development" });
 } finally {
  if (previous === undefined) delete process.env.TRAKT_LIVE_REVIEW;
  else process.env.TRAKT_LIVE_REVIEW = previous;
 }
}

for (const scenario of [
 { name: "ordinary local default", host: "localhost", enabled: false },
 { name: "explicit zero remains off", flag: "0", host: "localhost", enabled: false },
 { name: "only exact flag 1 opts in", flag: "true", host: "localhost", enabled: false },
 { name: "opt-in localhost", flag: "1", host: "localhost", enabled: true },
 { name: "opt-in private LAN", flag: "1", host: "192.168.1.6", enabled: true },
 { name: "public hostname fails closed", flag: "1", host: "dingo.build", enabled: true, rejects: true },
 { name: "public IPv4 fails closed", flag: "1", host: "8.8.8.8", enabled: true, rejects: true },
 { name: "production build ignores inherited opt-in", flag: "1", command: "build", host: "dingo.build", enabled: false },
 { name: "built-asset preview ignores inherited opt-in", flag: "1", isPreview: true, host: "localhost", enabled: false },
]) test("real Builder Trakt wiring: " + scenario.name, async t => {
 const config = liveReviewConfig(scenario.flag, scenario);
 assert.equal(config.define.__TRAKT_LIVE_REVIEW__, JSON.stringify(scenario.enabled));
 const upstream = [], browser = [], installed = [];
 t.mock.method(globalThis, "fetch", async (url, init) => {
  upstream.push({ url, init });
  assert.equal(url, TRAKT_API_ORIGIN + "/v1/trakt/search?mode=keyword&q=wiring&page=1&limit=30");
  assert.deepEqual(init.headers, { Accept: "application/json" });
  assert.equal(init.credentials, "omit");
  assert.equal(init.redirect, "error");
  return json(discovery([]));
 });
 const plugin = config.plugins.find(plugin => plugin.name === "local-trakt-live-review");
 // Exercise both actual installation hooks with an intercepted upstream fetch.
 for (const hook of ["configureServer", "configurePreviewServer"]) {
  const handlers = [];
  plugin[hook]({ middlewares: { use: handler => handlers.push(handler) } });
  assert.equal(handlers.length, Number(scenario.enabled), hook);
  if (hook === "configureServer") installed.push(...handlers);
 }
 t.mock.method(globalThis, "fetch", async (url, init) => {
  browser.push({ url, init });
  if (!scenario.enabled) return json(discovery([]));
  assert.equal(installed.length, 1);
  const request = Object.assign(new EventEmitter(), { url, method: init.method,
   headers: { host: scenario.host + ":4173", origin: "http://" + scenario.host + ":4173" } });
  const response = Object.assign(new EventEmitter(), { headers: {},
   setHeader(key, value) { this.headers[key] = value; }, end(body) { this.body = body; } });
  await installed[0](request, response, () => assert.fail("Expected fixed Trakt route"));
  return new Response(response.body, { status: response.statusCode, headers: response.headers });
 });
 const globals = ["location", "__TRAKT_LIVE_REVIEW__"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
 Object.defineProperty(globalThis, "location", { configurable: true, value: { hostname: scenario.host } });
 // Runtime global mutation must not override the compiled boolean, either way.
 Object.defineProperty(globalThis, "__TRAKT_LIVE_REVIEW__", { configurable: true, value: !scenario.enabled });
 let vite;
 try {
  vite = await createServer({ ...config, root: fileURLToPath(new URL("../builder", import.meta.url)),
   configFile: false, appType: "custom", logLevel: "silent",
   plugins: [...config.plugins, observeTraktConstruction()],
   server: { middlewareMode: true, watch: null, ws: false },
   optimizeDeps: { noDiscovery: true, include: [] },
  });
  const { BuilderApp } = await vite.ssrLoadModule("/src/ui/BuilderApp.jsx");
  const { BuilderWorkspace } = await vite.ssrLoadModule("/src/ui/BuilderWorkspace.jsx");
  const { constructedClients } = await vite.ssrLoadModule("/src/source-add/trakt-client.js");
  const controller = createBuilderController();
  const render = () => renderToStaticMarkup(createElement(BuilderApp, { controller, initialScreen: "workspace" }));
  if (scenario.rejects) assert.throws(render, /Trakt live preview requires a local host/);
  else assert.match(render(), /data-builder-shell/);
  assert.equal(constructedClients.length, 1, "actual Builder constructs one client for the workspace");
  assert.equal(constructedClients[0].options.localPreview, scenario.enabled);
  assert.equal(browser.length, 0, "Builder construction/render is inert");
  assert.equal(upstream.length, 0);
  if (!scenario.rejects) {
   const result = await constructedClients[0].client.searchKeyword("wiring");
   assert.equal(result.ok, true);
   assert.equal(browser.length, 1);
   assert.equal(browser[0].url, (scenario.enabled ? TRAKT_LOCAL_PROXY_PREFIX : TRAKT_API_ORIGIN)
    + "/v1/trakt/search?mode=keyword&q=wiring&page=1&limit=30");
   assert.equal(upstream.length, Number(scenario.enabled));
  }
  const requestCount = browser.length;
  assert.match(renderToStaticMarkup(createElement(BuilderWorkspace, {
   controller, state: controller.getState(), traktClient: Object.freeze({}),
  })), /data-builder-shell/);
  assert.equal(constructedClients.length, 1, "injected fixture client bypasses default construction, including host guard");
  assert.equal(browser.length, requestCount, "injected render remains inert");
 } finally {
  await vite?.close();
  for (const [key, descriptor] of globals) {
   if (descriptor) Object.defineProperty(globalThis, key, descriptor);
   else delete globalThis[key];
  }
 }
});

test("Trakt discovery cards present existing metadata without inline descriptions or backend state", async () => {
 const vite = await createServer({ ...liveReviewConfig(undefined), root: fileURLToPath(new URL("../builder", import.meta.url)),
  configFile: false, appType: "custom", logLevel: "silent",
  server: { middlewareMode: true, watch: null, ws: false }, optimizeDeps: { noDiscovery: true, include: [] },
 });
 try {
  const { TraktResultCard, TraktDescriptionDialog } = await vite.ssrLoadModule("/src/ui/TraktSourceFlow.jsx");
  const metadata = { id: 123, name: "Example list", creator: { username: "owner" }, itemCount: 1, likeCount: 27, updatedAt: "2026-10-02T23:59:59Z", description: "Full <script>description</script>\nSecond paragraph.", availability: "unverified" };
  const render = overrides => renderToStaticMarkup(createElement(TraktResultCard, { list: { ...metadata, ...overrides }, selected: false, onSelect() { assert.fail("Render must be inert"); }, onDescription() { assert.fail("Render must be inert"); } }));
  const html = render();
  assert.match(html, /<strong>Example list<\/strong>/);
  assert.match(html, /@owner/); assert.match(html, /Trakt List 123/); assert.match(html, /1 title · Last updated/);
  assert.match(html, /role="img" aria-label="27 likes"/); assert.match(html, /aria-hidden="true">♥/);
  assert.match(html, /Last updated <time dateTime="2026-10-02T23:59:59Z">2 Oct 2026<\/time>/);
  assert.doesNotMatch(html, /Full|Second paragraph|Public access not checked|Public list verified|\bitems?\b/);
  assert.match(html, /<\/label><button[^>]*aria-haspopup="dialog"[^>]*>Read description<\/button>/);
  assert.doesNotMatch(render({ availability: "available" }), /Public list verified/);
  const absent = render({ creator: { username: null }, itemCount: 77, likeCount: null, updatedAt: null, description: null });
  assert.match(absent, /77 titles/); assert.doesNotMatch(absent, /@owner|trakt-result-creator|trakt-result-likes|Last updated|<time|Read description/);
  assert.match(render({ updatedAt: null }), /class="trakt-result-meta trakt-result-details">1 title<\/span>/);
  assert.match(render({ itemCount: null }), /class="trakt-result-meta trakt-result-details">Last updated <time/);
  assert.match(render({ itemCount: 0 }), /class="trakt-result-meta trakt-result-details">0 titles · Last updated/);
  assert.doesNotMatch(render({ itemCount: null, updatedAt: null }), /trakt-result-details| · /);
  assert.doesNotMatch(html, /Read full description|Preview|\/items/);
  assert.doesNotMatch(render({ description: " \n\t " }), /Read description/);
  assert.match(render({ likeCount: 0 }), /aria-label="0 likes"/); assert.match(render({ likeCount: 1 }), /aria-label="1 like"/);
  const unavailable = render({ availability: "unavailable" }); assert.match(unavailable, /disabled=""/); assert.match(unavailable, />Unavailable</);
  const description = renderToStaticMarkup(createElement(TraktDescriptionDialog, { list: metadata, onClose() {} }));
  assert.match(description, /role="dialog" aria-modal="true" aria-labelledby="trakt-description-title"/);
  assert.match(description, /id="trakt-description-title">Example list/);
  assert.match(description, /Full &lt;script&gt;description&lt;\/script&gt;\nSecond paragraph\./);
  assert.doesNotMatch(description, /<script>/); assert.match(description, />Close<\/button>/);
 } finally { await vite.close(); }
});

// C Phase A: injected service contract cases only, never live external data.
const sampleItem = (type = "movie", extra = {}) => ({ type, title: null, year: null, rank: null,
	season: null, number: null, ids: { trakt: null, tmdb: null, imdb: null, slug: null, show_tmdb: null, show_slug: null }, ...extra });
const sample = (items = [], id = 123, limit = 15) => ({ apiVersion: 1, id, sample: "first-page", items,
	pagination: { page: 1, limit, page_count: null, item_count: null } });

test("items use canonical fixed first-page requests and reject invalid caller identities/options without fetching", async () => {
	const calls = [];
	const client = createTraktClient({ fetchImpl: async (url, init) => {
		calls.push({ url, init }); const parsed = new URL(url); return json(sample([], 123, Number(parsed.searchParams.get("limit"))));
	} });
	assert.equal(calls.length, 0);
	for (const limit of [undefined, 1, 50]) {
		assert.equal((await client.getItems(123, limit === undefined ? {} : { limit })).ok, true);
		assert.equal(calls.at(-1).url, TRAKT_API_ORIGIN + "/v1/trakt/lists/123/items?page=1&limit=" + (limit ?? 15));
		assert.equal(calls.at(-1).init.redirect, "error");
	}
	for (const id of ["123", 0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.equal((await client.getItems(id)).error.code, "INVALID_REQUEST");
	for (const options of [{ limit: 0 }, { limit: 51 }, { limit: 1.5 }, { limit: "15" }, { limit: null }, { page: 1 }, { page: 2 }]) assert.equal((await client.getItems(123, options)).error.code, "INVALID_REQUEST");
	assert.equal(calls.length, 3);
});

test("items preserve all four types, null/zero fields, service order and repeated rows", () => {
	const rows = [sampleItem("episode", { title: "Episode", season: 0, number: 1, rank: 9 }),
		sampleItem("season", { number: 0 }), sampleItem("show", { year: 2026 }), sampleItem(), sampleItem()];
	const result = normalizeTraktResponse(sample(rows), "items", { id: 123, limit: 15 });
	assert.deepEqual(result.items.map(row => row.type), ["episode", "season", "show", "movie", "movie"]);
	assert.equal(result.items.length, 5); assert.equal(result.items[0].season, 0); assert.equal(result.items[1].number, 0);
	assert.equal(result.items[3].title, null); assert.equal(result.items[0].ids.showTmdb, null);
	assert.deepEqual(result.items[3], result.items[4]); assert.equal(Object.isFrozen(result.items[0].ids), true);
	const ids = { trakt: 1, tmdb: 2, imdb: "tt123", slug: "item-slug", show_tmdb: 3, show_slug: "series-slug" };
	assert.deepEqual(normalizeTraktResponse(sample([sampleItem("episode", { ids })]), "items", { id: 123, limit: 15 }).items[0].ids,
		{ trakt: 1, tmdb: 2, imdb: "tt123", slug: "item-slug", showTmdb: 3, showSlug: "series-slug" });
});

test("items fail closed for malformed envelopes, pagination and any malformed row", () => {
	const valid = sample([sampleItem()]);
	for (const changed of [{ apiVersion: 2 }, { id: "123" }, { id: 124 }, { sample: "complete" }, { items: null },
		{ items: Array.from({ length: 16 }, () => sampleItem()) }, { pagination: null }, { pagination: {} },
		{ pagination: { ...valid.pagination, page: 2 } }, { pagination: { ...valid.pagination, limit: 50 } },
		{ pagination: { ...valid.pagination, item_count: -1 } }]) {
		assert.throws(() => normalizeTraktResponse({ ...valid, ...changed }, "items", { id: 123, limit: 15 }));
	}
	for (const changed of [{ type: "person" }, { title: undefined }, { title: "a".repeat(2001) }, { year: -1 }, { rank: "1" },
		{ season: 1.5 }, { number: undefined }, { ids: null }, { ids: { ...sampleItem().ids, tmdb: "1" } },
		{ ids: { ...sampleItem().ids, show_tmdb: 0 } }, { ids: { ...sampleItem().ids, slug: "" } },
		{ ids: { ...sampleItem().ids, slug: "a/b" } }, { ids: { ...sampleItem().ids, show_slug: "a".repeat(122) } },
		{ ids: { ...sampleItem().ids, imdb: "123" } }, { ids: { ...sampleItem().ids, imdb: "tt" + "1".repeat(29) } }]) {
		assert.throws(() => normalizeTraktResponse(sample([sampleItem(), sampleItem("movie", changed)]), "items", { id: 123, limit: 15 }));
	}
	const allNull = { page: null, limit: null, page_count: null, item_count: null };
	assert.equal(normalizeTraktResponse({ ...valid, pagination: allNull }, "items", { id: 123, limit: 15 }).pagination.page, null);
});

test("items share bounded detached success cache, refresh, expiry and authoritative not-found invalidation", async () => {
	let time = 0, calls = 0, missing = false;
	const client = createTraktClient({ now: () => time, cacheMaxEntries: 1, fetchImpl: async url => {
		calls++; const u = new URL(url), id = Number(u.pathname.split("/")[4]);
		return missing ? json({ apiVersion: 1, error: { code: "LIST_NOT_FOUND" } }, 404) : json(sample([sampleItem()], id));
	} });
	await client.getItems(123); const cached = await client.getItems(123); cached.data.items[0].title = "Mutated";
	assert.equal((await client.getItems(123)).data.items[0].title, null); assert.equal(calls, 1);
	await client.getItems(123, { refresh: true }); assert.equal(calls, 2);
	await client.getItems(124); await client.getItems(123); assert.equal(calls, 4);
	time = 300001; await client.getItems(123); assert.equal(calls, 5);
	missing = true; assert.equal((await client.getItems(123, { refresh: true })).error.code, "LIST_NOT_FOUND");
	assert.equal((await client.getItems(123)).error.code, "LIST_NOT_FOUND"); assert.equal(calls, 7);
	missing = false; assert.equal((await client.getItems(123)).ok, true); assert.equal(calls, 8);
});

test("items cancellation, body timeout and late results cannot populate a canceled sample cache", async () => {
	let complete, signal, calls = 0;
	const client = createTraktClient({ fetchImpl: async (url, init) => {
		calls++; signal = init.signal; return { ok: true, headers: new Headers({ "Content-Type": "application/json" }),
			json: () => new Promise(resolve => { complete = resolve; }) };
	} });
	const abort = new AbortController(), pending = client.getItems(123, { signal: abort.signal });
	await new Promise(resolve => setImmediate(resolve));
	abort.abort(); assert.equal((await pending).error.code, "ABORTED"); assert.equal(signal.aborted, true);
	complete(sample());
	await new Promise(resolve => setImmediate(resolve));
	const nextAbort = new AbortController(), next = client.getItems(123, { signal: nextAbort.signal });
	assert.equal(calls, 2); nextAbort.abort(); await next;
	let bodyCalls = 0;
	const timed = createTraktClient({ timeoutMs: 5, fetchImpl: async () => {
		bodyCalls++; return { ok: true, headers: new Headers({ "Content-Type": "application/json" }), json: () => new Promise(() => {}) };
	} });
	assert.equal((await timed.getItems(123)).error.code, "TIMEOUT"); assert.equal(bodyCalls, 1);
});

test("items Retry-After shares cooldown with discovery and never auto-retries", async () => {
	let now = 0, calls = 0;
	const client = createTraktClient({ now: () => now, fetchImpl: async () => {
		calls++; return json({ apiVersion: 1, error: { code: "UPSTREAM_RATE_LIMIT", message: "unsafe detail" } }, 429, { "Retry-After": "30" });
	} });
	const failed = await client.getItems(123); assert.equal(failed.error.notBefore, 30000);
	assert.doesNotMatch(JSON.stringify(failed), /unsafe detail/);
	await client.getItems(124); await client.browse("popular"); assert.equal(calls, 1);
	now = 30000; assert.equal(calls, 1); await client.getItems(123, { refresh: true }); assert.equal(calls, 2);
});

test("items proxy allows only canonical first-page bounds with unchanged transport guards", async () => {
	const calls = [];
	const fetchImpl = async (url, init) => { calls.push({ url, init }); return json(sample()); };
	for (const query of ["", "?page=1&limit=1", "?limit=50&page=1"]) {
		const response = await proxyRequest(TRAKT_LOCAL_PROXY_PREFIX + "/v1/trakt/lists/123/items" + query,
			{ fetchImpl, headers: { authorization: "private", cookie: "private", origin: "http://192.168.1.2:4173" } });
		assert.equal(response.response.statusCode, 200);
		const last = calls.at(-1); assert.equal(last.url, TRAKT_API_ORIGIN + "/v1/trakt/lists/123/items?page=1&limit=" + (query.includes("50") ? 50 : query ? 1 : 15));
		assert.deepEqual(last.init.headers, { Accept: "application/json" }); assert.equal(last.init.credentials, "omit"); assert.equal(last.init.redirect, "error");
	}
	for (const suffix of ["?page=2", "?page=01", "?page=", "?page=1&page=1", "?limit=0", "?limit=51", "?limit=01",
		"?limit=1.5", "?limit=1e1", "?limit=", "?limit=15&limit=15", "?sort=rank", "?target=https://evil.example", "#fragment"]) {
		assert.ok((await proxyRequest(TRAKT_LOCAL_PROXY_PREFIX + "/v1/trakt/lists/123/items" + suffix, { fetchImpl })).response.statusCode >= 400, suffix);
	}
	for (const path of ["/lists/01/items", "/lists/0/items", "/lists/9007199254740992/items", "/lists/%31/items", "/lists/1/items/movie"]) {
		assert.ok((await proxyRequest(TRAKT_LOCAL_PROXY_PREFIX + "/v1/trakt" + path, { fetchImpl })).response.statusCode >= 400);
	}
	assert.equal(calls.length, 3);
	const redirected = await proxyRequest(TRAKT_LOCAL_PROXY_PREFIX + "/v1/trakt/lists/123/items", {
		fetchImpl: async (url, init) => { assert.equal(init.redirect, "error"); throw new TypeError("redirect rejected"); } });
	assert.equal(redirected.response.statusCode, 502);
});
