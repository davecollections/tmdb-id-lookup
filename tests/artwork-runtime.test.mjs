import assert from "node:assert/strict";
import test from "node:test";

import {
	ARTWORK_ENTITY_TYPES,
	ARTWORK_ORIENTATIONS,
	ARTWORK_RESULT_STATUSES,
	ArtworkRuntimeError,
	createArtworkRuntimeClient,
	DEFAULT_ARTWORK_BASE_URL,
	DEFAULT_ARTWORK_RUNTIME_PATH,
	resolveArtworkRuntime,
	validateArtworkRuntimeLookup,
} from "../js/artwork-runtime.mjs";

const COMPANY_SHA = "a".repeat(64);
const NETWORK_SHA = "b".repeat(64);
const PERSON_LANDSCAPE_SHA = "c".repeat(64);
const PERSON_POSTER_SHA = "d".repeat(64);

function companyEntry(id, { fallbackUsed = false, name = `Company ${id}` } = {}) {
	return {
		id,
		name,
		status: "published",
		landscape: {
			path: `assets/collection_covers/companies/${id}.webp`,
			sha256: COMPANY_SHA,
		},
		fallbackUsed,
		reviewRequired: false,
	};
}

function networkEntry(id, { fallbackUsed = false, name = `Network ${id}` } = {}) {
	return {
		id,
		name,
		status: "published",
		landscape: {
			path: `assets/collection_covers/networks/${id}.webp`,
			sha256: NETWORK_SHA,
		},
		fallbackUsed,
		reviewRequired: false,
	};
}

function personEntry(id, { categories = ["actor"], fallbackUsed = false, name = `Person ${id}` } = {}) {
	return {
		id,
		name,
		categories,
		status: "published",
		landscape: {
			path: `assets/collection_covers/people/landscape/${id}.webp`,
			sha256: PERSON_LANDSCAPE_SHA,
		},
		poster: {
			path: `assets/collection_covers/people/poster/${id}.webp`,
			sha256: PERSON_POSTER_SHA,
		},
		fallbackUsed,
		reviewRequired: false,
	};
}

function createLookup() {
	return {
		schemaVersion: 1,
		status: "published",
		companies: {
			"10": companyEntry(10, { name: "Synthetic Studio" }),
			"11": companyEntry(11, { fallbackUsed: true, name: "Fallback Studio" }),
		},
		networks: {
			"20": networkEntry(20, { name: "Synthetic Network" }),
		},
		people: {
			"30": personEntry(30, { categories: ["actor", "director"], name: "Synthetic Person" }),
		},
	};
}

function responseFor(lookup) {
	return {
		ok: true,
		status: 200,
		async json() {
			return lookup;
		},
	};
}

function hasArtworkErrorCode(code) {
	return (error) => {
		assert.ok(error instanceof ArtworkRuntimeError);
		assert.equal(error.code, code);
		return true;
	};
}

test("exposes the published default runtime location", () => {
	assert.equal(DEFAULT_ARTWORK_BASE_URL, "https://raw.githubusercontent.com/davecollections/nuvio-assets/main/");
	assert.equal(DEFAULT_ARTWORK_RUNTIME_PATH, "assets/collection_covers/runtime-lookup.json");
});

test("resolves company landscape artwork with canonical metadata and a 12-character cache version", () => {
	const result = resolveArtworkRuntime({
		lookup: createLookup(),
		entityType: ARTWORK_ENTITY_TYPES.COMPANY,
		tmdbId: 10,
		orientation: ARTWORK_ORIENTATIONS.LANDSCAPE,
		baseUrl: "https://assets.example.test/repository",
	});

	assert.deepEqual(result, {
		status: ARTWORK_RESULT_STATUSES.READY,
		entityType: "company",
		tmdbId: 10,
		orientation: "landscape",
		name: "Synthetic Studio",
		relativePath: "assets/collection_covers/companies/10.webp",
		assetUrl: `https://assets.example.test/repository/assets/collection_covers/companies/10.webp?v=${COMPANY_SHA.slice(0, 12)}`,
		sha256: COMPANY_SHA,
		fallbackUsed: false,
	});
	assert.equal(new URL(result.assetUrl).searchParams.get("v").length, 12);
});

test("resolves network landscape artwork", () => {
	const result = resolveArtworkRuntime({
		lookup: createLookup(),
		entityType: "network",
		tmdbId: 20,
		orientation: "landscape",
		baseUrl: "https://assets.example.test/",
	});

	assert.equal(result.status, "ready");
	assert.equal(result.name, "Synthetic Network");
	assert.equal(result.relativePath, "assets/collection_covers/networks/20.webp");
	assert.equal(result.sha256, NETWORK_SHA);
});

test("resolves both person orientations and preserves actor/director overlap", () => {
	const lookup = createLookup();
	const landscape = resolveArtworkRuntime({
		lookup,
		entityType: "person",
		tmdbId: 30,
		orientation: "landscape",
		baseUrl: "https://assets.example.test",
	});
	const poster = resolveArtworkRuntime({
		lookup,
		entityType: "person",
		tmdbId: 30,
		orientation: "poster",
		baseUrl: "https://assets.example.test/",
	});

	assert.equal(landscape.status, "ready");
	assert.equal(landscape.sha256, PERSON_LANDSCAPE_SHA);
	assert.equal(landscape.relativePath, "assets/collection_covers/people/landscape/30.webp");
	assert.deepEqual(landscape.categories, ["actor", "director"]);
	assert.equal(poster.status, "ready");
	assert.equal(poster.sha256, PERSON_POSTER_SHA);
	assert.equal(poster.relativePath, "assets/collection_covers/people/poster/30.webp");
	assert.deepEqual(poster.categories, ["actor", "director"]);
	assert.notEqual(landscape.categories, lookup.people["30"].categories);
});

test("propagates the published fallbackUsed flag", () => {
	const result = resolveArtworkRuntime({
		lookup: createLookup(),
		entityType: "company",
		tmdbId: 11,
		orientation: "landscape",
	});

	assert.equal(result.status, "ready");
	assert.equal(result.name, "Fallback Studio");
	assert.equal(result.fallbackUsed, true);
});

test("selects only the explicit typed map when the same ID exists in every map", () => {
	const lookup = {
		schemaVersion: 1,
		status: "published",
		companies: { "7": companyEntry(7, { name: "Company Seven" }) },
		networks: { "7": networkEntry(7, { name: "Network Seven" }) },
		people: { "7": personEntry(7, { name: "Person Seven" }) },
	};

	for (const [entityType, expectedName] of [
		["company", "Company Seven"],
		["network", "Network Seven"],
		["person", "Person Seven"],
	]) {
		const result = resolveArtworkRuntime({
			lookup,
			entityType,
			tmdbId: 7,
			orientation: "landscape",
		});

		assert.equal(result.name, expectedName);
	}
});

test("returns a missing result without constructing an artwork path", () => {
	assert.deepEqual(
		resolveArtworkRuntime({
			lookup: createLookup(),
			entityType: "company",
			tmdbId: 999,
			orientation: "landscape",
		}),
		{
			status: "missing",
			entityType: "company",
			tmdbId: 999,
			orientation: "landscape",
		},
	);
});

test("returns expected unsupported-orientation results for company and network posters", () => {
	for (const [entityType, tmdbId] of [
		["company", 10],
		["network", 20],
	]) {
		assert.deepEqual(
			resolveArtworkRuntime({
				lookup: createLookup(),
				entityType,
				tmdbId,
				orientation: "poster",
			}),
			{
				status: "unsupported-orientation",
				entityType,
				tmdbId,
				orientation: "poster",
			},
		);
	}
});

test("rejects invalid, non-positive, non-integer, and non-numeric TMDB IDs", () => {
	for (const tmdbId of [0, -1, 1.5, "10", Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
		assert.throws(
			() => resolveArtworkRuntime({
				lookup: createLookup(),
				entityType: "company",
				tmdbId,
				orientation: "landscape",
			}),
			hasArtworkErrorCode("INVALID_TMDB_ID"),
		);
	}
});

test("rejects unsupported entity types and orientation names", () => {
	assert.throws(
		() => resolveArtworkRuntime({
			lookup: createLookup(),
			entityType: "studio",
			tmdbId: 10,
			orientation: "landscape",
		}),
		hasArtworkErrorCode("INVALID_ENTITY_TYPE"),
	);
	assert.throws(
		() => resolveArtworkRuntime({
			lookup: createLookup(),
			entityType: "company",
			tmdbId: 10,
			orientation: "square",
		}),
		hasArtworkErrorCode("INVALID_ORIENTATION"),
	);
});

test("rejects malformed global lookup roots, maps, and numeric map keys", () => {
	assert.throws(() => validateArtworkRuntimeLookup(null), hasArtworkErrorCode("INVALID_LOOKUP"));

	const invalidMap = createLookup();
	invalidMap.networks = [];
	assert.throws(() => validateArtworkRuntimeLookup(invalidMap), hasArtworkErrorCode("INVALID_ENTITY_MAP"));

	const invalidKey = createLookup();
	invalidKey.companies["01"] = companyEntry(1);
	assert.throws(() => validateArtworkRuntimeLookup(invalidKey), hasArtworkErrorCode("INVALID_MAP_KEY"));
});

test("rejects a key-to-entry-ID mismatch", () => {
	const lookup = createLookup();
	lookup.companies["10"].id = 12;

	assert.throws(() => validateArtworkRuntimeLookup(lookup), hasArtworkErrorCode("ENTRY_ID_MISMATCH"));
});

test("rejects malformed and uppercase SHA-256 values", () => {
	for (const sha256 of ["short", "A".repeat(64)]) {
		const lookup = createLookup();
		lookup.people["30"].poster.sha256 = sha256;
		assert.throws(() => validateArtworkRuntimeLookup(lookup), hasArtworkErrorCode("INVALID_SHA256"));
	}
});

test("rejects malformed paths and missing required orientations", () => {
	const malformedPath = createLookup();
	malformedPath.networks["20"].landscape.path = "../networks/20.webp";
	assert.throws(() => validateArtworkRuntimeLookup(malformedPath), hasArtworkErrorCode("INVALID_PATH"));

	const missingOrientation = createLookup();
	delete missingOrientation.people["30"].poster;
	assert.throws(
		() => validateArtworkRuntimeLookup(missingOrientation),
		hasArtworkErrorCode("INVALID_ORIENTATION_DATA"),
	);
});

test("rejects invalid lookup, entry publication, review, and category states", () => {
	const invalidSchema = createLookup();
	invalidSchema.schemaVersion = 2;
	assert.throws(() => validateArtworkRuntimeLookup(invalidSchema), hasArtworkErrorCode("INVALID_SCHEMA_VERSION"));

	const draftLookup = createLookup();
	draftLookup.status = "draft";
	assert.throws(() => validateArtworkRuntimeLookup(draftLookup), hasArtworkErrorCode("INVALID_LOOKUP_STATUS"));

	const draftEntry = createLookup();
	draftEntry.companies["10"].status = "draft";
	assert.throws(() => validateArtworkRuntimeLookup(draftEntry), hasArtworkErrorCode("INVALID_ENTRY_STATUS"));

	const unsafeEntry = createLookup();
	unsafeEntry.people["30"].reviewRequired = true;
	assert.throws(() => validateArtworkRuntimeLookup(unsafeEntry), hasArtworkErrorCode("UNSAFE_ENTRY"));

	const invalidCategories = createLookup();
	invalidCategories.people["30"].categories = ["actor", "writer"];
	assert.throws(() => validateArtworkRuntimeLookup(invalidCategories), hasArtworkErrorCode("INVALID_CATEGORIES"));
});

test("normalizes configured base URLs with and without a trailing slash", () => {
	const options = {
		lookup: createLookup(),
		entityType: "network",
		tmdbId: 20,
		orientation: "landscape",
	};
	const withoutSlash = resolveArtworkRuntime({ ...options, baseUrl: "https://mirror.example.test/root" });
	const withSlash = resolveArtworkRuntime({ ...options, baseUrl: "https://mirror.example.test/root/" });

	assert.equal(withoutSlash.assetUrl, withSlash.assetUrl);
	assert.equal(
		withSlash.assetUrl,
		`https://mirror.example.test/root/assets/collection_covers/networks/20.webp?v=${NETWORK_SHA.slice(0, 12)}`,
	);
});

test("loads through injected fetch, validates the response, and uses configurable locations", async () => {
	const lookup = createLookup();
	const requestedUrls = [];
	const client = createArtworkRuntimeClient({
		baseUrl: "https://mirror.example.test/catalogue",
		runtimeLookupPath: "runtime/lookup.json",
		fetchImpl: async (url) => {
			requestedUrls.push(url);
			return responseFor(lookup);
		},
	});

	assert.equal(client.baseUrl, "https://mirror.example.test/catalogue/");
	assert.equal(client.runtimeLookupUrl, "https://mirror.example.test/catalogue/runtime/lookup.json");
	assert.equal(await client.load(), lookup);
	assert.deepEqual(requestedUrls, [client.runtimeLookupUrl]);

	const result = await client.resolve({ entityType: "person", tmdbId: 30, orientation: "poster" });
	assert.equal(result.status, "ready");
	assert.equal(
		result.assetUrl,
		`https://mirror.example.test/catalogue/assets/collection_covers/people/poster/30.webp?v=${PERSON_POSTER_SHA.slice(0, 12)}`,
	);
	assert.deepEqual(requestedUrls, [client.runtimeLookupUrl]);
});

test("deduplicates simultaneous loads and caches the successful lookup in memory", async () => {
	const lookup = createLookup();
	let fetchCalls = 0;
	let releaseResponse;
	const responsePromise = new Promise((resolve) => {
		releaseResponse = resolve;
	});
	const client = createArtworkRuntimeClient({
		fetchImpl() {
			fetchCalls += 1;
			return responsePromise;
		},
	});

	const firstLoad = client.load();
	const secondLoad = client.load();
	assert.equal(firstLoad, secondLoad);
	await Promise.resolve();
	assert.equal(fetchCalls, 1);
	releaseResponse(responseFor(lookup));

	assert.equal(await firstLoad, lookup);
	assert.equal(await secondLoad, lookup);
	assert.equal(await client.load(), lookup);
	assert.equal(fetchCalls, 1);
});

test("clears a failed in-flight load so a later call can retry", async () => {
	const lookup = createLookup();
	let fetchCalls = 0;
	const client = createArtworkRuntimeClient({
		fetchImpl: async () => {
			fetchCalls += 1;
			return fetchCalls === 1
				? { ok: false, status: 503, async json() { return lookup; } }
				: responseFor(lookup);
		},
	});

	await assert.rejects(client.load(), hasArtworkErrorCode("HTTP_ERROR"));
	assert.equal(await client.load(), lookup);
	assert.equal(fetchCalls, 2);
});

test("keeps loader failures distinct from legitimate missing artwork", async () => {
	const client = createArtworkRuntimeClient({
		fetchImpl: async () => responseFor({ ...createLookup(), status: "draft" }),
	});

	await assert.rejects(
		client.resolve({ entityType: "company", tmdbId: 999, orientation: "landscape" }),
		hasArtworkErrorCode("INVALID_LOOKUP_STATUS"),
	);
});
