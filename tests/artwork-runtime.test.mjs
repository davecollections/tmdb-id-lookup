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
const NETWORK_POSTER_SHA = "e".repeat(64);
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

function v1NetworkEntry(id, { fallbackUsed = false, name = `Network ${id}` } = {}) {
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

function v2NetworkEntry(id, options = {}) {
	return {
		...v1NetworkEntry(id, options),
		poster: {
			path: `assets/collection_covers/networks/poster/${id}.webp`,
			sha256: NETWORK_POSTER_SHA,
		},
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

function createV1Lookup() {
	return {
		schemaVersion: 1,
		status: "published",
		companies: {
			"10": companyEntry(10, { name: "Synthetic Studio" }),
			"11": companyEntry(11, { fallbackUsed: true, name: "Fallback Studio" }),
		},
		networks: {
			"20": v1NetworkEntry(20, { name: "Synthetic Network" }),
		},
		people: {
			"30": personEntry(30, { categories: ["actor", "director"], name: "Synthetic Person" }),
		},
	};
}

function createV2Lookup() {
	return {
		...createV1Lookup(),
		schemaVersion: 2,
		networks: {
			"20": v2NetworkEntry(20, { name: "Synthetic Network" }),
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

test("accepts exactly numeric artwork runtime schema versions 1 and 2", () => {
	for (const lookup of [createV1Lookup(), createV2Lookup()]) {
		assert.equal(validateArtworkRuntimeLookup(lookup), lookup);
	}
});

test("rejects missing, malformed, coerced, and unsupported schema versions", () => {
	const missingVersion = createV1Lookup();
	delete missingVersion.schemaVersion;
	assert.throws(
		() => validateArtworkRuntimeLookup(missingVersion),
		hasArtworkErrorCode("INVALID_SCHEMA_VERSION"),
	);

	for (const schemaVersion of ["1", "2", 0, -1, 1.5, 3, null, {}, [], true, false]) {
		const lookup = createV1Lookup();
		lookup.schemaVersion = schemaVersion;
		assert.throws(
			() => validateArtworkRuntimeLookup(lookup),
			hasArtworkErrorCode("INVALID_SCHEMA_VERSION"),
		);
	}
});

test("resolves company landscape artwork with canonical metadata and a 12-character cache version", () => {
	const result = resolveArtworkRuntime({
		lookup: createV1Lookup(),
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
		lookup: createV1Lookup(),
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
	const lookup = createV1Lookup();
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
		lookup: createV1Lookup(),
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
		networks: { "7": v1NetworkEntry(7, { name: "Network Seven" }) },
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
			lookup: createV1Lookup(),
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
				lookup: createV1Lookup(),
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

test("preserves the exact schema-v1 compatibility matrix result objects", () => {
	const lookup = createV1Lookup();
	const baseUrl = "https://assets.example.test/repository/";
	const resolve = (entityType, tmdbId, orientation) =>
		resolveArtworkRuntime({ lookup, entityType, tmdbId, orientation, baseUrl });

	assert.deepEqual(
		[
			resolve("company", 10, "landscape"),
			resolve("company", 10, "poster"),
			resolve("network", 20, "landscape"),
			resolve("network", 20, "poster"),
			resolve("person", 30, "landscape"),
			resolve("person", 30, "poster"),
		],
		[
			{
				status: "ready",
				entityType: "company",
				tmdbId: 10,
				orientation: "landscape",
				name: "Synthetic Studio",
				relativePath: "assets/collection_covers/companies/10.webp",
				assetUrl: `${baseUrl}assets/collection_covers/companies/10.webp?v=${COMPANY_SHA.slice(0, 12)}`,
				sha256: COMPANY_SHA,
				fallbackUsed: false,
			},
			{
				status: "unsupported-orientation",
				entityType: "company",
				tmdbId: 10,
				orientation: "poster",
			},
			{
				status: "ready",
				entityType: "network",
				tmdbId: 20,
				orientation: "landscape",
				name: "Synthetic Network",
				relativePath: "assets/collection_covers/networks/20.webp",
				assetUrl: `${baseUrl}assets/collection_covers/networks/20.webp?v=${NETWORK_SHA.slice(0, 12)}`,
				sha256: NETWORK_SHA,
				fallbackUsed: false,
			},
			{
				status: "unsupported-orientation",
				entityType: "network",
				tmdbId: 20,
				orientation: "poster",
			},
			{
				status: "ready",
				entityType: "person",
				tmdbId: 30,
				orientation: "landscape",
				name: "Synthetic Person",
				relativePath: "assets/collection_covers/people/landscape/30.webp",
				assetUrl: `${baseUrl}assets/collection_covers/people/landscape/30.webp?v=${PERSON_LANDSCAPE_SHA.slice(0, 12)}`,
				sha256: PERSON_LANDSCAPE_SHA,
				fallbackUsed: false,
				categories: ["actor", "director"],
			},
			{
				status: "ready",
				entityType: "person",
				tmdbId: 30,
				orientation: "poster",
				name: "Synthetic Person",
				relativePath: "assets/collection_covers/people/poster/30.webp",
				assetUrl: `${baseUrl}assets/collection_covers/people/poster/30.webp?v=${PERSON_POSTER_SHA.slice(0, 12)}`,
				sha256: PERSON_POSTER_SHA,
				fallbackUsed: false,
				categories: ["actor", "director"],
			},
		],
	);
});

test("resolves the schema-v2 matrix with network poster support only where contracted", () => {
	const lookup = createV2Lookup();
	const cases = [
		["company", 10, "landscape", "ready", "assets/collection_covers/companies/10.webp"],
		["company", 10, "poster", "unsupported-orientation", undefined],
		["network", 20, "landscape", "ready", "assets/collection_covers/networks/20.webp"],
		["network", 20, "poster", "ready", "assets/collection_covers/networks/poster/20.webp"],
		["person", 30, "landscape", "ready", "assets/collection_covers/people/landscape/30.webp"],
		["person", 30, "poster", "ready", "assets/collection_covers/people/poster/30.webp"],
	];

	for (const [entityType, tmdbId, orientation, status, relativePath] of cases) {
		const result = resolveArtworkRuntime({
			lookup,
			entityType,
			tmdbId,
			orientation,
			baseUrl: "https://assets.example.test/",
		});
		assert.equal(result.status, status);
		assert.equal(result.relativePath, relativePath);
	}

	const networkPoster = resolveArtworkRuntime({
		lookup,
		entityType: "network",
		tmdbId: 20,
		orientation: "poster",
		baseUrl: "https://assets.example.test/",
	});
	assert.equal(networkPoster.sha256, NETWORK_POSTER_SHA);
	assert.equal(
		networkPoster.assetUrl,
		`https://assets.example.test/assets/collection_covers/networks/poster/20.webp?v=${NETWORK_POSTER_SHA.slice(0, 12)}`,
	);
	assert.equal(new URL(networkPoster.assetUrl).searchParams.get("v").length, 12);
});

test("rejects invalid, non-positive, non-integer, and non-numeric TMDB IDs", () => {
	for (const tmdbId of [0, -1, 1.5, "10", Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
		assert.throws(
			() => resolveArtworkRuntime({
				lookup: createV1Lookup(),
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
			lookup: createV1Lookup(),
			entityType: "studio",
			tmdbId: 10,
			orientation: "landscape",
		}),
		hasArtworkErrorCode("INVALID_ENTITY_TYPE"),
	);
	assert.throws(
		() => resolveArtworkRuntime({
			lookup: createV1Lookup(),
			entityType: "company",
			tmdbId: 10,
			orientation: "square",
		}),
		hasArtworkErrorCode("INVALID_ORIENTATION"),
	);
});

test("rejects malformed global lookup roots, maps, and numeric map keys", () => {
	assert.throws(() => validateArtworkRuntimeLookup(null), hasArtworkErrorCode("INVALID_LOOKUP"));

	const invalidMap = createV1Lookup();
	invalidMap.networks = [];
	assert.throws(() => validateArtworkRuntimeLookup(invalidMap), hasArtworkErrorCode("INVALID_ENTITY_MAP"));

	const invalidKey = createV1Lookup();
	invalidKey.companies["01"] = companyEntry(1);
	assert.throws(() => validateArtworkRuntimeLookup(invalidKey), hasArtworkErrorCode("INVALID_MAP_KEY"));
});

test("rejects a key-to-entry-ID mismatch", () => {
	const lookup = createV1Lookup();
	lookup.companies["10"].id = 12;

	assert.throws(() => validateArtworkRuntimeLookup(lookup), hasArtworkErrorCode("ENTRY_ID_MISMATCH"));
});

test("rejects missing, malformed, and uppercase SHA-256 values", () => {
	const missingSha = createV2Lookup();
	delete missingSha.networks["20"].poster.sha256;
	assert.throws(() => validateArtworkRuntimeLookup(missingSha), hasArtworkErrorCode("INVALID_SHA256"));

	for (const sha256 of ["short", "A".repeat(64)]) {
		const lookup = createV2Lookup();
		lookup.networks["20"].poster.sha256 = sha256;
		assert.throws(() => validateArtworkRuntimeLookup(lookup), hasArtworkErrorCode("INVALID_SHA256"));
	}
});

test("enforces required orientations separately for each schema version", () => {
	const missingV1PersonPoster = createV1Lookup();
	delete missingV1PersonPoster.people["30"].poster;
	assert.throws(
		() => validateArtworkRuntimeLookup(missingV1PersonPoster),
		hasArtworkErrorCode("INVALID_ORIENTATION_DATA"),
	);

	for (const orientation of ["landscape", "poster"]) {
		const lookup = createV2Lookup();
		delete lookup.networks["20"][orientation];
		assert.throws(
			() => validateArtworkRuntimeLookup(lookup),
			hasArtworkErrorCode("INVALID_ORIENTATION_DATA"),
		);
	}
});

test("rejects forbidden company and schema-v1 network poster data", () => {
	const v1NetworkPoster = createV1Lookup();
	v1NetworkPoster.networks["20"].poster = v2NetworkEntry(20).poster;
	assert.throws(
		() => validateArtworkRuntimeLookup(v1NetworkPoster),
		hasArtworkErrorCode("UNSUPPORTED_ORIENTATION_DATA"),
	);

	for (const lookup of [createV1Lookup(), createV2Lookup()]) {
		lookup.companies["10"].poster = {
			path: "assets/collection_covers/companies/poster/10.webp",
			sha256: NETWORK_POSTER_SHA,
		};
		assert.throws(
			() => validateArtworkRuntimeLookup(lookup),
			hasArtworkErrorCode("UNSUPPORTED_ORIENTATION_DATA"),
		);
	}
});

test("rejects wrong IDs, path families, and orientation folders", () => {
	const cases = [
		[
			createV1Lookup,
			(lookup) => {
				lookup.companies["10"].landscape.path = "assets/collection_covers/companies/11.webp";
			},
		],
		[
			createV1Lookup,
			(lookup) => {
				lookup.companies["10"].landscape.path = "assets/collection_covers/networks/10.webp";
			},
		],
		[
			createV1Lookup,
			(lookup) => {
				lookup.networks["20"].landscape.path = "assets/collection_covers/companies/20.webp";
			},
		],
		[
			createV2Lookup,
			(lookup) => {
				lookup.networks["20"].poster.path = "assets/collection_covers/networks/poster/21.webp";
			},
		],
		[
			createV2Lookup,
			(lookup) => {
				lookup.networks["20"].poster.path = "assets/collection_covers/networks/20.webp";
			},
		],
		[
			createV2Lookup,
			(lookup) => {
				lookup.networks["20"].landscape.path = "assets/collection_covers/networks/poster/20.webp";
			},
		],
		[
			createV1Lookup,
			(lookup) => {
				lookup.people["30"].landscape.path = "assets/collection_covers/people/poster/30.webp";
			},
		],
		[
			createV1Lookup,
			(lookup) => {
				lookup.people["30"].poster.path = "assets/collection_covers/people/landscape/30.webp";
			},
		],
	];

	for (const [createLookup, mutate] of cases) {
		const lookup = createLookup();
		mutate(lookup);
		assert.throws(() => validateArtworkRuntimeLookup(lookup), hasArtworkErrorCode("INVALID_PATH"));
	}
});

test("rejects malformed repository-relative paths", () => {
	const malformedPath = createV1Lookup();
	malformedPath.networks["20"].landscape.path = "../networks/20.webp";
	assert.throws(() => validateArtworkRuntimeLookup(malformedPath), hasArtworkErrorCode("INVALID_PATH"));
});

test("rejects invalid lookup, entry publication, review, and category states", () => {
	const draftLookup = createV1Lookup();
	draftLookup.status = "draft";
	assert.throws(() => validateArtworkRuntimeLookup(draftLookup), hasArtworkErrorCode("INVALID_LOOKUP_STATUS"));

	const draftEntry = createV1Lookup();
	draftEntry.companies["10"].status = "draft";
	assert.throws(() => validateArtworkRuntimeLookup(draftEntry), hasArtworkErrorCode("INVALID_ENTRY_STATUS"));

	const unsafeEntry = createV1Lookup();
	unsafeEntry.people["30"].reviewRequired = true;
	assert.throws(() => validateArtworkRuntimeLookup(unsafeEntry), hasArtworkErrorCode("UNSAFE_ENTRY"));

	const invalidCategories = createV1Lookup();
	invalidCategories.people["30"].categories = ["actor", "writer"];
	assert.throws(() => validateArtworkRuntimeLookup(invalidCategories), hasArtworkErrorCode("INVALID_CATEGORIES"));
});

test("normalizes configured base URLs with and without a trailing slash", () => {
	const options = {
		lookup: createV1Lookup(),
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
	const lookup = createV1Lookup();
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

test("loads a test-only schema-v2 lookup through injected fetch and resolves network poster", async () => {
	const lookup = createV2Lookup();
	let fetchCalls = 0;
	const client = createArtworkRuntimeClient({
		baseUrl: "https://assets.example.test/repository/",
		runtimeLookupPath: "test-only/runtime-v2.json",
		fetchImpl: async () => {
			fetchCalls += 1;
			return responseFor(lookup);
		},
	});

	const result = await client.resolve({
		entityType: "network",
		tmdbId: 20,
		orientation: "poster",
	});

	assert.equal(fetchCalls, 1);
	assert.equal(result.status, "ready");
	assert.equal(result.relativePath, "assets/collection_covers/networks/poster/20.webp");
	assert.equal(result.sha256, NETWORK_POSTER_SHA);
	assert.equal(
		result.assetUrl,
		`https://assets.example.test/repository/assets/collection_covers/networks/poster/20.webp?v=${NETWORK_POSTER_SHA.slice(0, 12)}`,
	);
	assert.equal(await client.load(), lookup);
	assert.equal(fetchCalls, 1);
});

test("deduplicates simultaneous loads and caches the successful lookup in memory", async () => {
	const lookup = createV1Lookup();
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
	const lookup = createV1Lookup();
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
		fetchImpl: async () => responseFor({ ...createV1Lookup(), status: "draft" }),
	});

	await assert.rejects(
		client.resolve({ entityType: "company", tmdbId: 999, orientation: "landscape" }),
		hasArtworkErrorCode("INVALID_LOOKUP_STATUS"),
	);
});
