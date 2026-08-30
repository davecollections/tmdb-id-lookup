import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workerSource = fs.readFileSync(
	path.join(rootDir, "cloudflare-worker", "tmdb-proxy.js"),
	"utf8",
);
const workerModuleUrl = `data:text/javascript;base64,${Buffer.from(workerSource).toString("base64")}`;
const worker = (await import(workerModuleUrl)).default;

const allowedOrigin = "https://davecollections.github.io";
const serviceToken = "service-token-at-least-32-characters";
const defaultEnv = {
	TMDB_BEARER_TOKEN: "mock-tmdb-token",
	NUVIO_PEOPLE_SERVICE_TOKEN: serviceToken,
};

function request(pathname, { method = "GET", origin, token } = {}) {
	const headers = new Headers();
	if (origin !== undefined) headers.set("Origin", origin);
	if (token !== undefined) headers.set("X-Nuvio-Service-Token", token);
	return new Request(`https://worker.example${pathname}`, { method, headers });
}

function withGenreAdult(pathname) {
	return `${pathname}${pathname.includes("?") ? "&" : "?"}include_adult=false`;
}

async function withMockFetch(callback, implementation = async () => new Response(
	JSON.stringify({ ok: true }),
	{ status: 200, headers: { "Content-Type": "application/json" } },
)) {
	const originalFetch = globalThis.fetch;
	const calls = [];
	globalThis.fetch = async (...args) => {
		calls.push(args);
		return implementation(...args);
	};
	try {
		return await callback(calls);
	} finally {
		globalThis.fetch = originalFetch;
	}
}

async function fetchWorker(pathname, options = {}, env = defaultEnv) {
	return worker.fetch(request(pathname, options), env);
}

test("approved browser origins retain access without a service token", async () => {
	await withMockFetch(async (calls) => {
		for (const origin of [
			allowedOrigin,
			"http://localhost:4173",
			"http://127.0.0.1:5173",
		]) {
			const response = await fetchWorker("/3/search/movie?query=Alien", { origin });
			assert.equal(response.status, 200);
			assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin);
		}
		assert.equal(calls.length, 3);
	});
});

test("disallowed or missing origins fail without valid service access", async () => {
	await withMockFetch(async (calls) => {
		for (const [pathname, options] of [
			["/3/person/31", { origin: "https://example.com" }],
			["/3/person/31", {}],
			["/3/person/31", { token: "incorrect-service-token-at-least-32" }],
			["/3/watch/providers/movie?language=en-US", {}],
			["/3/watch/providers/movie?language=en-US", { token: "incorrect-service-token-at-least-32" }],
			["/3/discover/movie?with_companies=3", { token: serviceToken }],
		]) {
			const response = await fetchWorker(pathname, options);
			assert.equal(response.status, 403);
			assert.equal(await response.text(), "Origin not allowed");
			assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
		}
		assert.equal(calls.length, 0);
	});
});

test("OPTIONS, unsupported methods, unsupported paths, and missing TMDB configuration retain existing responses", async () => {
	await withMockFetch(async (calls) => {
		const options = await fetchWorker("/3/search/person", { method: "OPTIONS", origin: allowedOrigin });
		assert.equal(options.status, 204);
		assert.equal(options.headers.get("Access-Control-Allow-Origin"), allowedOrigin);

		const post = await fetchWorker("/3/search/person", { method: "POST", origin: allowedOrigin });
		assert.equal(post.status, 405);
		assert.equal(post.headers.get("Allow"), "GET, OPTIONS");

		const unsupported = await fetchWorker("/3/configuration", { origin: allowedOrigin });
		assert.equal(unsupported.status, 403);
		assert.equal(await unsupported.text(), "TMDB path not allowed");

		const missingTmdb = await fetchWorker(
			"/3/person/31",
			{ origin: allowedOrigin },
			{ NUVIO_PEOPLE_SERVICE_TOKEN: serviceToken },
		);
		assert.equal(missingTmdb.status, 500);
		assert.equal(await missingTmdb.text(), "TMDB token not configured");
		assert.equal(calls.length, 0);
	});
});

test("valid origin-free People service requests forward append_to_response and strip api_key", async () => {
	await withMockFetch(async (calls) => {
		for (const pathname of [
			"/3/person/31",
			"/3/person/31?append_to_response=combined_credits%2Cimages&api_key=browser-secret",
		]) {
			const response = await fetchWorker(pathname, { token: serviceToken });
			assert.equal(response.status, 200);
			assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
		}

		assert.equal(calls.length, 2);
		const [upstreamUrl, upstreamInit] = calls[1];
		assert.equal(
			upstreamUrl.toString(),
			"https://api.themoviedb.org/3/person/31?append_to_response=combined_credits%2Cimages",
		);
		assert.equal(upstreamUrl.searchParams.has("api_key"), false);
		assert.equal(upstreamInit.headers.Authorization, "Bearer mock-tmdb-token");
		assert.equal(Object.keys(upstreamInit.headers).some((name) => name.toLowerCase() === "x-nuvio-service-token"), false);
	});
});

test("valid origin-free Watch Provider service requests use the fixed TMDB host without forwarding the service token", async () => {
	await withMockFetch(async (calls) => {
		for (const pathname of [
			"/3/watch/providers/regions?language=en-US",
			"/3/watch/providers/movie?language=en-US",
			"/3/watch/providers/tv?language=en-US",
		]) {
			const response = await fetchWorker(pathname, { token: serviceToken });
			assert.equal(response.status, 200, pathname);
			assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
		}

		assert.deepEqual(calls.map(([url]) => url.toString()), [
			"https://api.themoviedb.org/3/watch/providers/regions?language=en-US",
			"https://api.themoviedb.org/3/watch/providers/movie?language=en-US",
			"https://api.themoviedb.org/3/watch/providers/tv?language=en-US",
		]);
		for (const [, init] of calls) {
			assert.equal(init.headers.Authorization, "Bearer mock-tmdb-token");
			assert.equal(Object.keys(init.headers).some((name) => name.toLowerCase() === "x-nuvio-service-token"), false);
		}
	});
});

test("TMDB List details forward one canonical int32 ID with exactly language en-US and page 1", async () => {
	await withMockFetch(async (calls) => {
		for (const pathname of [
			"/3/list/1?language=en-US&page=1",
			"/3/list/2147483647?page=1&language=en-US",
		]) {
			const response = await fetchWorker(pathname, { origin: allowedOrigin });
			assert.equal(response.status, 200, pathname);
		}
		assert.deepEqual(calls.map(([url]) => url.toString()), [
			"https://api.themoviedb.org/3/list/1?language=en-US&page=1",
			"https://api.themoviedb.org/3/list/2147483647?page=1&language=en-US",
		]);
		for (const [, init] of calls) assert.equal(init.headers.Authorization, "Bearer mock-tmdb-token");
	});
});

test("TMDB List details reject missing, duplicate, malformed, noncanonical, overflowing, and extra parameters", async () => {
	await withMockFetch(async (calls) => {
		for (const pathname of [
			"/3/list/1",
			"/3/list/1?language=en-US",
			"/3/list/1?page=1",
			"/3/list/0?language=en-US&page=1",
			"/3/list/01?language=en-US&page=1",
			"/3/list/-1?language=en-US&page=1",
			"/3/list/1.0?language=en-US&page=1",
			"/3/list/2147483648?language=en-US&page=1",
			"/3/list/9007199254740992?language=en-US&page=1",
			"/3/list/abc?language=en-US&page=1",
			"/3/list/1/?language=en-US&page=1",
			"/3/list/1/edit?language=en-US&page=1",
			"/3/list/1?language=en&page=1",
			"/3/list/1?language=en-US&page=2",
			"/3/list/1?language=en-US&page=01",
			"/3/list/1?language=en-US&page=1&page=1",
			"/3/list/1?language=en-US&language=en-US&page=1",
			"/3/list/1?language=en-US&page=1&api_key=secret",
			"/3/list/1?language=en-US&page=1&append_to_response=items",
		]) {
			const response = await fetchWorker(pathname, { origin: allowedOrigin });
			assert.equal(response.status, 403, pathname);
			assert.equal(await response.text(), "TMDB path not allowed", pathname);
		}
		const serviceOnly = await fetchWorker("/3/list/1?language=en-US&page=1", { token: serviceToken });
		assert.equal(serviceOnly.status, 403);
		assert.equal(await serviceOnly.text(), "Origin not allowed");
		assert.equal(calls.length, 0);
	});
});

test("Studio Company Discover routes forward only canonical IDs and the exact media sort allowlists", async () => {
	await withMockFetch(async (calls) => {
		const paths = [
			"/3/discover/movie?with_companies=3",
			"/3/discover/tv?with_companies=9007199254740991",
			"/3/discover/movie?with_companies=3&sort_by=popularity.desc",
			"/3/discover/movie?sort_by=primary_release_date.desc&with_companies=3",
			"/3/discover/movie?with_companies=3&sort_by=vote_average.desc",
			"/3/discover/movie?with_companies=3&sort_by=vote_count.desc",
			"/3/discover/tv?with_companies=3&sort_by=popularity.desc",
			"/3/discover/tv?sort_by=first_air_date.desc&with_companies=3",
			"/3/discover/tv?with_companies=3&sort_by=vote_average.desc",
			"/3/discover/tv?with_companies=3&sort_by=vote_count.desc",
		];
		for (const pathname of paths) {
			const response = await fetchWorker(pathname, { origin: allowedOrigin });
			assert.equal(response.status, 200, pathname);
		}

		assert.equal(calls.length, paths.length);
		assert.deepEqual(calls.map(([url]) => url.toString()), paths.map((path) => `https://api.themoviedb.org${path}`));
		for (const [url, init] of calls) {
			assert.equal(url.origin, "https://api.themoviedb.org");
			assert.equal(init.headers.Authorization, "Bearer mock-tmdb-token");
		}
	});
});

test("Studio Company Discover rejects duplicates, wrong-media sorts, unknown sorts, malformed IDs, and every extra filter", async () => {
	await withMockFetch(async (calls) => {
		for (const pathname of [
			"/3/discover/movie",
			"/3/discover/movie?with_companies=3&with_companies=4",
			"/3/discover/movie?with_companies=abc",
			"/3/discover/movie?with_companies=-3",
			"/3/discover/movie?with_companies=3.5",
			"/3/discover/movie?with_companies=0",
			"/3/discover/movie?with_companies=03",
			"/3/discover/movie?with_companies=9007199254740992",
			"/3/discover/movie?with_companies=3&page=1",
			"/3/discover/movie?with_companies=3&language=en-US",
			"/3/discover/movie?with_companies=3&api_key=browser-secret",
			"/3/discover/movie?with_companies=3&with_genres=18",
			"/3/discover/movie?with_companies=3&sort_by=first_air_date.desc",
			"/3/discover/tv?with_companies=3&sort_by=primary_release_date.desc",
			"/3/discover/movie?with_companies=3&sort_by=revenue.desc",
			"/3/discover/movie?with_companies=3&sort_by=popularity.desc&sort_by=vote_count.desc",
			"/3/discover/tv?with_companies=3&with_networks=2",
			"/3/discover/tv?with_companies=3&api_key=browser-secret",
			"/3/discover/person?with_companies=3",
			"/3/discover/movie/3?with_companies=3",
		]) {
			const response = await fetchWorker(pathname, { origin: allowedOrigin });
			assert.equal(response.status, 403, pathname);
			assert.equal(await response.text(), "TMDB path not allowed", pathname);
		}
		assert.equal(calls.length, 0);
	});
});

test("Network TV Discover forwards canonical IDs with no sort or one exact TV sort in either parameter order", async () => {
	await withMockFetch(async (calls) => {
		const paths = [
			"/3/discover/tv?with_networks=2",
			"/3/discover/tv?with_networks=9007199254740991",
			"/3/discover/tv?with_networks=2&sort_by=popularity.desc",
			"/3/discover/tv?sort_by=first_air_date.desc&with_networks=2",
			"/3/discover/tv?with_networks=2&sort_by=vote_average.desc",
			"/3/discover/tv?sort_by=vote_count.desc&with_networks=2",
		];
		for (const pathname of paths) {
			const response = await fetchWorker(pathname, { origin: allowedOrigin });
			assert.equal(response.status, 200, pathname);
		}
		assert.deepEqual(calls.map(([url]) => url.toString()), paths.map((path) => `https://api.themoviedb.org${path}`));
		for (const [url, init] of calls) {
			assert.equal(url.origin, "https://api.themoviedb.org");
			assert.equal(init.headers.Authorization, "Bearer mock-tmdb-token");
		}
	});
});

test("Network TV Discover rejects Movie, missing, mixed, duplicate, malformed, wrong-sort, and extra parameters", async () => {
	await withMockFetch(async (calls) => {
		for (const pathname of [
			"/3/discover/movie?with_networks=2",
			"/3/discover/movie?with_networks=2&sort_by=popularity.desc",
			"/3/discover/tv",
			"/3/discover/tv?sort_by=popularity.desc",
			"/3/discover/tv?with_networks=",
			"/3/discover/tv?with_networks=0",
			"/3/discover/tv?with_networks=-2",
			"/3/discover/tv?with_networks=%2B2",
			"/3/discover/tv?with_networks=02",
			"/3/discover/tv?with_networks=2.5",
			"/3/discover/tv?with_networks=2e1",
			"/3/discover/tv?with_networks=9007199254740992",
			"/3/discover/tv?with_networks=2&with_networks=3",
			"/3/discover/tv?with_networks=2&with_companies=3",
			"/3/discover/tv?with_networks=2&page=1",
			"/3/discover/tv?with_networks=2&language=en-US",
			"/3/discover/tv?with_networks=2&api_key=browser-secret",
			"/3/discover/tv?with_networks=2&with_genres=18",
			"/3/discover/tv?with_networks=2&with_status=0",
			"/3/discover/tv?with_networks=2&sort_by=",
			"/3/discover/tv?with_networks=2&sort_by=primary_release_date.desc",
			"/3/discover/tv?with_networks=2&sort_by=revenue.desc",
			"/3/discover/tv?with_networks=2&sort_by=popularity.asc",
			"/3/discover/tv?with_networks=2&sort_by=Popularity.desc",
			"/3/discover/tv?with_networks=2&sort_by=popularity.desc&sort_by=vote_count.desc",
			"/3/discover/tv?sort_by=popularity.desc&with_networks=2&page=1",
			"/3/discover/tv/?with_networks=2",
			"/3/discover/tv?with_networks=%E0%A4%A",
		]) {
			const response = await fetchWorker(pathname, { origin: allowedOrigin });
			assert.equal(response.status, 403, pathname);
			assert.equal(await response.text(), "TMDB path not allowed", pathname);
		}
		assert.equal(calls.length, 0);
	});
});

test("Genre Discover forwards exact Movie and TV sorts plus the complete approved Advanced shape", async () => {
	await withMockFetch(async (calls) => {
		const paths = [
			"/3/discover/movie?with_genres=27",
			"/3/discover/tv?with_genres=10759",
			...[
				"popularity.desc",
				"primary_release_date.desc",
				"vote_average.desc",
				"vote_count.desc",
			].map((sort) => `/3/discover/movie?with_genres=27&sort_by=${sort}`),
			...[
				"popularity.desc",
				"first_air_date.desc",
				"vote_average.desc",
				"vote_count.desc",
			].map((sort) => `/3/discover/tv?with_genres=10759&sort_by=${sort}`),
			"/3/discover/movie?with_genres=27&primary_release_date.gte=2015-01-01&primary_release_date.lte=2026-12-31&vote_average.gte=6.5&vote_average.lte=9&vote_count.gte=250&with_original_language=en&with_origin_country=AU&without_genres=35%2C99&sort_by=popularity.desc",
			"/3/discover/tv?with_genres=16&first_air_date.gte=2015-01-01&first_air_date.lte=2026-12-31&vote_average.gte=0&vote_average.lte=10&vote_count.gte=0&with_original_language=en&with_origin_country=US&without_genres=35&sort_by=first_air_date.desc",
		].map(withGenreAdult);
		for (const pathname of paths) {
			const response = await fetchWorker(pathname, { origin: allowedOrigin });
			assert.equal(response.status, 200, pathname);
		}
		assert.deepEqual(calls.map(([url]) => url.toString()), paths.map((pathname) => `https://api.themoviedb.org${pathname}`));
		for (const [, init] of calls) assert.equal(init.headers.Authorization, "Bearer mock-tmdb-token");
	});
});

test("Genre Discover rejects noncanonical identity, wrong-media fields, invalid Advanced values, mixtures, and arbitrary Discover", async () => {
	await withMockFetch(async (calls) => {
		for (const pathname of [
			"/3/discover/movie",
			"/3/discover/movie?sort_by=popularity.desc",
			"/3/discover/movie?with_genres=0",
			"/3/discover/movie?with_genres=-27",
			"/3/discover/movie?with_genres=027",
			"/3/discover/movie?with_genres=27.0",
			"/3/discover/movie?with_genres=9007199254740992",
			"/3/discover/movie?with_genres=27%2C35",
			"/3/discover/movie?with_genres=27%7C35",
			"/3/discover/movie?with_genres=27&with_genres=35",
			"/3/discover/movie?with_genres=27&sort_by=first_air_date.desc",
			"/3/discover/tv?with_genres=10759&sort_by=primary_release_date.desc",
			"/3/discover/movie?with_genres=27&first_air_date.gte=2015-01-01",
			"/3/discover/tv?with_genres=10759&primary_release_date.gte=2015-01-01",
			"/3/discover/movie?with_genres=27&primary_release_date.gte=2026-01-01&primary_release_date.lte=2015-12-31",
			"/3/discover/movie?with_genres=27&primary_release_date.gte=2015-02-30",
			"/3/discover/movie?with_genres=27&vote_average.gte=-1",
			"/3/discover/movie?with_genres=27&vote_average.gte=6.50",
			"/3/discover/movie?with_genres=27&vote_average.lte=10.1",
			"/3/discover/movie?with_genres=27&vote_average.gte=8&vote_average.lte=7",
			"/3/discover/movie?with_genres=27&vote_count.gte=-1",
			"/3/discover/movie?with_genres=27&vote_count.gte=01",
			"/3/discover/movie?with_genres=27&with_original_language=EN",
			"/3/discover/movie?with_genres=27&with_original_language=eng",
			"/3/discover/movie?with_genres=27&with_origin_country=au",
			"/3/discover/movie?with_genres=27&without_genres=0",
			"/3/discover/movie?with_genres=27&without_genres=35%2C35",
			"/3/discover/movie?with_genres=27&without_genres=27",
			"/3/discover/movie?with_genres=27&without_genres=35%7C99",
			"/3/discover/movie?with_genres=27&with_companies=3",
			"/3/discover/tv?with_genres=10759&with_networks=2",
			"/3/discover/movie?with_genres=27&with_watch_providers=8",
			"/3/discover/movie?with_genres=27&with_keywords=9715",
			"/3/discover/movie?with_genres=27&page=1",
			"/3/discover/movie?with_genres=27&unknown=value",
		].map(withGenreAdult)) {
			const response = await fetchWorker(pathname, { origin: allowedOrigin });
			assert.equal(response.status, 403, pathname);
			assert.equal(await response.text(), "TMDB path not allowed", pathname);
		}
		assert.equal(calls.length, 0);
	});
});

test("Genre Discover requires exactly one canonical include_adult=false", async () => {
	await withMockFetch(async (calls) => {
		for (const pathname of [
			"/3/discover/movie?with_genres=27",
			"/3/discover/movie?with_genres=27&include_adult=true",
			"/3/discover/movie?with_genres=27&include_adult=0",
			"/3/discover/movie?with_genres=27&include_adult=False",
			"/3/discover/movie?with_genres=27&include_adult=FALSE",
			"/3/discover/movie?with_genres=27&include_adult=false&include_adult=false",
		]) {
			const response = await fetchWorker(pathname, { origin: allowedOrigin });
			assert.equal(response.status, 403, pathname);
			assert.equal(await response.text(), "TMDB path not allowed", pathname);
		}
		assert.equal(calls.length, 0);
	});
});

test("date-only Decade Discover forwards only canonical periods, exact media sorts, and approved Advanced filters", async () => {
	await withMockFetch(async (calls) => {
		const valid = [
			"/3/discover/movie?include_adult=false&sort_by=popularity.desc&primary_release_date.gte=1980-01-01&primary_release_date.lte=1989-12-31",
			"/3/discover/tv?first_air_date.gte=1984-01-01&first_air_date.lte=1984-12-31&without_genres=35%2C10762&vote_average.gte=6.5&vote_average.lte=9&vote_count.gte=0&with_original_language=en&with_origin_country=AU&sort_by=first_air_date.desc&include_adult=false",
			"/3/discover/movie?primary_release_date.lte=1949-12-31&sort_by=vote_count.desc&include_adult=false",
			"/3/discover/tv?first_air_date.lte=1959-12-31&sort_by=vote_average.desc&include_adult=false",
		];
		for (const pathname of valid) {
			const response = await fetchWorker(pathname, { origin: allowedOrigin });
			assert.equal(response.status, 200, pathname);
		}
		assert.equal(calls.length, valid.length);
		assert.deepEqual(calls.map(([url]) => url.pathname), ["/3/discover/movie", "/3/discover/tv", "/3/discover/movie", "/3/discover/tv"]);
	});
});

test("date-only Decade Discover rejects malformed periods, wrong-media fields, duplicates, mixtures, and every extra parameter", async () => {
	await withMockFetch(async (calls) => {
		const invalid = [
			"/3/discover/movie?sort_by=popularity.desc&primary_release_date.gte=1980-01-01&primary_release_date.lte=1989-12-31",
			"/3/discover/movie?include_adult=true&sort_by=popularity.desc&primary_release_date.gte=1980-01-01&primary_release_date.lte=1989-12-31",
			"/3/discover/movie?include_adult=false&include_adult=false&sort_by=popularity.desc&primary_release_date.gte=1980-01-01&primary_release_date.lte=1989-12-31",
			"/3/discover/movie?include_adult=false&primary_release_date.gte=1980-01-01&primary_release_date.lte=1989-12-31",
			"/3/discover/movie?include_adult=false&sort_by=first_air_date.desc&primary_release_date.gte=1980-01-01&primary_release_date.lte=1989-12-31",
			"/3/discover/movie?include_adult=false&sort_by=popularity.desc&first_air_date.gte=1980-01-01&first_air_date.lte=1989-12-31",
			"/3/discover/movie?include_adult=false&sort_by=popularity.desc&primary_release_date.gte=1950-01-01&primary_release_date.lte=1959-12-31",
			"/3/discover/movie?include_adult=false&sort_by=popularity.desc&primary_release_date.gte=1981-01-01&primary_release_date.lte=1989-12-31",
			"/3/discover/movie?include_adult=false&sort_by=popularity.desc&primary_release_date.gte=2030-01-01&primary_release_date.lte=2030-12-31",
			"/3/discover/movie?include_adult=false&sort_by=popularity.desc&primary_release_date.lte=1948-12-31",
			"/3/discover/movie?include_adult=false&sort_by=popularity.desc&primary_release_date.gte=1980-01-01&primary_release_date.lte=1989-12-31&without_genres=35%2C35",
			"/3/discover/movie?include_adult=false&sort_by=popularity.desc&primary_release_date.gte=1980-01-01&primary_release_date.lte=1989-12-31&with_watch_providers=8&watch_region=AU",
			"/3/discover/movie?include_adult=false&sort_by=popularity.desc&primary_release_date.gte=1980-01-01&primary_release_date.lte=1989-12-31&page=2",
		];
		for (const pathname of invalid) {
			const response = await fetchWorker(pathname, { origin: allowedOrigin });
			assert.equal(response.status, 403, pathname);
			assert.equal(await response.text(), "TMDB path not allowed");
		}
		assert.equal(calls.length, 0);
	});
});

test("simple Streaming Discover forwards one canonical provider, region, adult policy, and media-correct sort", async () => {
	await withMockFetch(async (calls) => {
		const valid = [
			"/3/discover/movie?include_adult=false&sort_by=popularity.desc&watch_region=AU&with_watch_providers=8",
			"/3/discover/movie?with_watch_providers=337&watch_region=US&sort_by=primary_release_date.desc&include_adult=false",
			"/3/discover/tv?watch_region=GB&with_watch_providers=9&include_adult=false&sort_by=first_air_date.desc",
			"/3/discover/tv?sort_by=vote_count.desc&include_adult=false&with_watch_providers=10&watch_region=CA",
		];
		for (const pathname of valid) assert.equal((await fetchWorker(pathname, { origin: allowedOrigin })).status, 200, pathname);
		assert.equal(calls.length, valid.length);
	});
});

test("simple Streaming Discover rejects compound IDs, invalid regions, duplicates, wrong sorts, mixtures, and extra filters", async () => {
	await withMockFetch(async (calls) => {
		const invalid = [
			"/3/discover/movie?sort_by=popularity.desc&watch_region=AU&with_watch_providers=8",
			"/3/discover/movie?include_adult=false&sort_by=popularity.desc&watch_region=AU",
			"/3/discover/movie?include_adult=false&sort_by=popularity.desc&with_watch_providers=8",
			"/3/discover/movie?include_adult=false&sort_by=popularity.desc&watch_region=AU&with_watch_providers=8%7C9",
			"/3/discover/movie?include_adult=false&sort_by=popularity.desc&watch_region=AU&with_watch_providers=08",
			"/3/discover/movie?include_adult=false&sort_by=popularity.desc&watch_region=au&with_watch_providers=8",
			"/3/discover/movie?include_adult=false&sort_by=popularity.desc&watch_region=AUS&with_watch_providers=8",
			"/3/discover/movie?include_adult=false&sort_by=first_air_date.desc&watch_region=AU&with_watch_providers=8",
			"/3/discover/tv?include_adult=false&sort_by=primary_release_date.desc&watch_region=AU&with_watch_providers=8",
			"/3/discover/movie?include_adult=false&sort_by=popularity.desc&sort_by=vote_count.desc&watch_region=AU&with_watch_providers=8",
			"/3/discover/movie?include_adult=false&sort_by=popularity.desc&watch_region=AU&watch_region=US&with_watch_providers=8",
			"/3/discover/movie?include_adult=false&sort_by=popularity.desc&watch_region=AU&with_watch_providers=8&with_genres=35",
			"/3/discover/movie?include_adult=false&sort_by=popularity.desc&watch_region=AU&with_watch_providers=8&primary_release_date.gte=1980-01-01&primary_release_date.lte=1989-12-31",
			"/3/discover/movie?include_adult=false&sort_by=popularity.desc&watch_region=AU&with_watch_providers=8&page=2",
		];
		for (const pathname of invalid) {
			const response = await fetchWorker(pathname, { origin: allowedOrigin });
			assert.equal(response.status, 403, pathname);
			assert.equal(await response.text(), "TMDB path not allowed");
		}
		assert.equal(calls.length, 0);
	});
});

test("service-token access does not authorize Decade or Streaming Discover routes", async () => {
	await withMockFetch(async (calls) => {
		for (const pathname of [
			"/3/discover/movie?include_adult=false&sort_by=popularity.desc&primary_release_date.gte=1980-01-01&primary_release_date.lte=1989-12-31",
			"/3/discover/movie?include_adult=false&sort_by=popularity.desc&watch_region=AU&with_watch_providers=8",
		]) {
			const response = await fetchWorker(pathname, { token: serviceToken });
			assert.equal(response.status, 403);
			assert.equal(await response.text(), "Origin not allowed");
		}
		assert.equal(calls.length, 0);
	});
});

test("service-token access does not authorize otherwise valid or generic Genre Discover", async () => {
	await withMockFetch(async (calls) => {
		for (const pathname of [
			"/3/discover/movie?with_genres=27&sort_by=popularity.desc",
			"/3/discover/movie?with_genres=27&with_watch_providers=8",
			"/3/discover/tv?with_genres=10759&unknown=value",
		].map(withGenreAdult)) {
			const response = await fetchWorker(pathname, { token: serviceToken });
			assert.equal(response.status, 403, pathname);
			assert.equal(await response.text(), "Origin not allowed", pathname);
		}
		assert.equal(calls.length, 0);
	});
});

test("Streaming provider catalogue routes forward only exact language requests to the fixed TMDB host", async () => {
	await withMockFetch(async (calls) => {
		for (const pathname of [
			"/3/watch/providers/regions?language=en-US",
			"/3/watch/providers/movie?language=en-US",
			"/3/watch/providers/tv?language=en-US",
		]) {
			const response = await fetchWorker(pathname, { origin: allowedOrigin });
			assert.equal(response.status, 200, pathname);
		}
		assert.deepEqual(calls.map(([url]) => url.toString()), [
			"https://api.themoviedb.org/3/watch/providers/regions?language=en-US",
			"https://api.themoviedb.org/3/watch/providers/movie?language=en-US",
			"https://api.themoviedb.org/3/watch/providers/tv?language=en-US",
		]);
		for (const [, init] of calls) {
			assert.equal(init.headers.Authorization, "Bearer mock-tmdb-token");
		}
	});
});

test("Watch Provider service access keeps exact query validation authoritative", async () => {
	await withMockFetch(async (calls) => {
		for (const [pathname, expectedMessage] of [
			["/3/watch/providers/regions", "TMDB path not allowed"],
			["/3/watch/providers/movie?language=en-us", "TMDB path not allowed"],
			["/3/watch/providers/movie?language=en-GB", "TMDB path not allowed"],
			["/3/watch/providers/tv?language=en-US&language=en-US", "TMDB path not allowed"],
			["/3/watch/providers/tv?language=en-US&page=1", "TMDB path not allowed"],
			["/3/watch/providers/tv?language=en-US&api_key=browser-secret", "TMDB path not allowed"],
			["/3/watch/providers/person?language=en-US", "Origin not allowed"],
			["/3/watch/providers/tv/?language=en-US", "Origin not allowed"],
		]) {
			const response = await fetchWorker(pathname, { token: serviceToken });
			assert.equal(response.status, 403, pathname);
			assert.equal(await response.text(), expectedMessage, pathname);
		}
		assert.equal(calls.length, 0);
	});
});

test("Studio count route failures stay sanitized and never expose request details", async () => {
	const originalConsoleError = console.error;
	console.error = () => {};
	try {
		await withMockFetch(async (calls) => {
			const response = await fetchWorker("/3/discover/movie?with_companies=3", { origin: allowedOrigin });
			assert.equal(response.status, 502);
			assert.equal(await response.text(), "TMDB request failed");
			assert.equal(response.headers.get("Cache-Control"), "no-store");
			assert.equal(calls.length, 1);
		}, async () => { throw new Error("private upstream detail"); });
	} finally {
		console.error = originalConsoleError;
	}
});

test("missing, incorrect, short, and empty configured service tokens fail closed", async () => {
	await withMockFetch(async (calls) => {
		const cases = [
			[{ token: undefined }, defaultEnv],
			[{ token: "wrong-token" }, defaultEnv],
			[{ token: "short" }, { ...defaultEnv, NUVIO_PEOPLE_SERVICE_TOKEN: "short" }],
			[{ token: "" }, { ...defaultEnv, NUVIO_PEOPLE_SERVICE_TOKEN: "" }],
		];
		for (const [options, env] of cases) {
			const response = await fetchWorker("/3/person/31", options, env);
			assert.equal(response.status, 403);
			assert.equal(await response.text(), "Origin not allowed");
		}
		assert.equal(calls.length, 0);
	});
});

test("valid service token is limited to People details and exact Watch Provider pathnames", async () => {
	await withMockFetch(async (calls) => {
		for (const pathname of [
			"/3/person/31/combined_credits",
			"/3/search/person",
			"/3/collection/1241",
			"/3/movie/550",
			"/3/tv/1399",
			"/3/search/keyword",
			"/3/discover/movie?with_companies=3",
			"/3/discover/tv?with_networks=2&sort_by=popularity.desc",
			"/3/watch/providers/person?language=en-US",
			"/3/person/not-a-number",
			"/3/person/31/",
		]) {
			const response = await fetchWorker(pathname, { token: serviceToken });
			assert.equal(response.status, 403, pathname);
			assert.equal(await response.text(), "Origin not allowed", pathname);
		}
		assert.equal(calls.length, 0);
	});
});

test("upstream response, cache, error, and CORS behavior is preserved", async () => {
	await withMockFetch(async () => {
		const response = await fetchWorker("/3/person/31", { origin: allowedOrigin });
		assert.equal(response.status, 201);
		assert.equal(await response.text(), "created");
		assert.equal(response.headers.get("Cache-Control"), "public, max-age=300");
		assert.equal(response.headers.get("Content-Type"), "application/custom");
		assert.equal(response.headers.get("Access-Control-Allow-Origin"), allowedOrigin);
	}, async () => new Response("created", {
		status: 201,
		headers: { "Content-Type": "application/custom" },
	}));

	await withMockFetch(async () => {
		const response = await fetchWorker("/3/person/31", { token: serviceToken });
		assert.equal(response.status, 429);
		assert.equal(await response.text(), "rate limited");
		assert.equal(response.headers.get("Cache-Control"), "no-store");
		assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
	}, async () => new Response("rate limited", { status: 429 }));
});

test("network failures return sanitized 502 responses without leaking the service token", async () => {
	const originalConsoleError = console.error;
	const logged = [];
	console.error = (...args) => logged.push(args.map(String).join(" "));
	try {
		await withMockFetch(async () => {
			const response = await fetchWorker("/3/person/31", { token: serviceToken });
			assert.equal(response.status, 502);
			const responseText = await response.text();
			assert.equal(responseText, "TMDB request failed");
			assert.equal(response.headers.get("Cache-Control"), "no-store");
			assert.doesNotMatch(responseText, new RegExp(serviceToken));
			for (const [name, value] of response.headers) {
				assert.doesNotMatch(`${name}: ${value}`, new RegExp(serviceToken));
			}
		}, async () => { throw new Error("simulated network failure"); });
	} finally {
		console.error = originalConsoleError;
	}
	assert.equal(logged.length, 1);
	assert.doesNotMatch(logged.join("\n"), new RegExp(serviceToken));
});
