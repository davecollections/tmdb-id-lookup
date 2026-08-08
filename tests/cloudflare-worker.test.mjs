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
		for (const options of [
			{ origin: "https://example.com" },
			{},
			{ token: "incorrect-service-token-at-least-32" },
		]) {
			const response = await fetchWorker("/3/person/31", options);
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

test("Studio count routes forward only canonical Company filters to the fixed TMDB host", async () => {
	await withMockFetch(async (calls) => {
		for (const pathname of [
			"/3/discover/movie?with_companies=3",
			"/3/discover/tv?with_companies=9007199254740991",
		]) {
			const response = await fetchWorker(pathname, { origin: allowedOrigin });
			assert.equal(response.status, 200, pathname);
		}

		assert.equal(calls.length, 2);
		assert.deepEqual(calls.map(([url]) => url.toString()), [
			"https://api.themoviedb.org/3/discover/movie?with_companies=3",
			"https://api.themoviedb.org/3/discover/tv?with_companies=9007199254740991",
		]);
		for (const [url, init] of calls) {
			assert.equal(url.origin, "https://api.themoviedb.org");
			assert.equal(init.headers.Authorization, "Bearer mock-tmdb-token");
		}
	});
});

test("Studio count routes reject missing, duplicate, malformed, fractional, negative, and extra filters", async () => {
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
			"/3/discover/tv?with_companies=3&api_key=browser-secret",
			"/3/discover/tv?with_networks=3",
			"/3/discover/tv?with_genres=18",
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

test("valid service token is limited to the exact Person details pathname", async () => {
	await withMockFetch(async (calls) => {
		for (const pathname of [
			"/3/person/31/combined_credits",
			"/3/search/person",
			"/3/collection/1241",
			"/3/movie/550",
			"/3/tv/1399",
			"/3/search/keyword",
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
