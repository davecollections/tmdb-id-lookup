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
