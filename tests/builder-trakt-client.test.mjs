import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { EventEmitter } from "node:events";
import { TRAKT_API_ORIGIN, TRAKT_LOCAL_PROXY_PREFIX, traktApiBase } from "../builder/src/config/trakt-api.js";
import { createTraktClient, normalizeTraktResponse, traktDiscoveryRequest, traktRetryNotBefore, traktFailure } from "../builder/src/source-add/trakt-client.js";
import { createTraktPreviewMiddleware, localTraktPreviewPlugin } from "../builder/trakt-preview-proxy.js";

// Pure transport/contract examples, not live Trakt data or integration evidence.
const list = (id = 123, extra = {}) => ({ name: "Unit list", description: null, ids: { trakt: id, slug: null }, creator: { username: null, name: null, slug: null }, url: null, item_count: null, like_count: 0, updated_at: null, availability: "unverified", ...extra });
const discovery = (rows = [list()], page = 1, limit = 30) => ({ apiVersion: 1, lists: rows, pagination: { page, limit, page_count: null, item_count: null } });
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...headers } });

test("inert fixed client builds explicit discovery requests, rejects filtered users, and exposes no sample", async () => {
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
	for (const url of ["/v1/trakt/lists/1/items", "/v1/trakt/resolve?value=1&target=https://evil.example", "/v1/trakt/resolve?value=1&value=2", "/v1/trakt/../resolve?value=1", "https://evil.example", "/api/trakt"]) {
		const rejected = await proxyRequest(TRAKT_LOCAL_PROXY_PREFIX + url, { fetchImpl }); assert.ok(rejected.response.statusCode >= 400);
	}
	for (const options of [{ method: "POST" }, { headers: { host: "evil.example" } }, { headers: { origin: "https://evil.example" } }]) assert.ok((await proxyRequest(TRAKT_LOCAL_PROXY_PREFIX + "/v1/trakt/resolve?value=1", { ...options, fetchImpl })).response.statusCode >= 400);
	assert.equal(calls, 1); assert.equal((await proxyRequest("/builder/", { enabled: false })).installs, 0);
	assert.equal(traktApiBase(), TRAKT_API_ORIGIN); assert.equal(traktApiBase({ localPreview: true, hostname: "localhost" }), TRAKT_LOCAL_PROXY_PREFIX);
	assert.throws(() => traktApiBase({ localPreview: true, hostname: "dingo.build" }));
});

test("Phase A runtime client has no direct upstream credential or sample integration", () => {
	const source = fs.readFileSync(new URL("../builder/src/source-add/trakt-client.js", import.meta.url), "utf8");
	for (const forbidden of ["api.trakt.tv", "TRAKT_CLIENT_ID", "/items", "localStorage", "indexedDB"]) assert.equal(source.includes(forbidden), false);
});
