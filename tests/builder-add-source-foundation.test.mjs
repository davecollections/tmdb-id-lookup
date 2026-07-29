import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createBuilderController } from "../builder/src/application/index.js";
import { extractTmdbProxyBaseUrl } from "../builder/build-config.js";
import {
	buildTmdbPosterUrl,
	buildMovieFranchiseSourceDraft,
	collectionMatchesWholeWordQuery,
	containsClearlyExplicitSexualText,
	createAsyncRequestCoordinator,
	createMovieFranchiseSource,
	createSourceSubmissionGate,
	createTmdbCollectionProvider,
	findMovieFranchiseDuplicate,
	movieFranchiseDuplicateIdentity,
	normalizeTmdbCollectionDetailsResponse,
	normalizeTmdbCollectionSearchResponse,
	normalizeTmdbPosterPath,
	parseTmdbCollectionInput,
	TMDB_COLLECTION_UNAVAILABLE_MESSAGE,
	TMDB_PROXY_BASE_URL,
	validateMovieFranchiseSourceDraft,
} from "../builder/src/source-add/index.js";
import { validateNuvioContract } from "./helpers/nuvio-contract-validator.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const v1Config = fs.readFileSync(path.join(rootDir, "js", "config.js"), "utf8");
const configuredWorkerBaseUrl = extractTmdbProxyBaseUrl(v1Config);

assert.ok(configuredWorkerBaseUrl, "The stable v1 Worker endpoint must be configured.");

function countingIdFactory(prefix = "internal") {
	let count = 0;
	return () => `${prefix}-${++count}`;
}

function sequenceIdFactory(...ids) {
	let index = 0;
	return () => ids[index++];
}

function createController(options = {}) {
	return createBuilderController({
		idFactory: countingIdFactory(),
		nuvioIdFactory: countingIdFactory("nuvio"),
		initialProjectTitle: "Add source",
		...options,
	});
}

function createProvider(options = {}) {
	return createTmdbCollectionProvider({
		baseUrl: configuredWorkerBaseUrl,
		...options,
	});
}

function jsonResponse(value, {
	status = 200,
	contentType = "application/json; charset=utf-8",
} = {}) {
	return new Response(JSON.stringify(value), {
		status,
		headers: contentType ? { "Content-Type": contentType } : {},
	});
}

function validDetails(id = 123, name = "Example Collection") {
	return {
		id,
		name,
		overview: "A movie franchise.",
		poster_path: "/poster.jpg",
		adult: false,
		parts: [
			{
				id: 1,
				title: "First Movie",
				release_date: "2001-11-16",
				adult: false,
			},
			{
				id: 2,
				title: "Second Movie",
				release_date: "",
				adult: false,
			},
		],
	};
}

function canonicalDraft(id = 123, title = "Example Collection") {
	const result = buildMovieFranchiseSourceDraft({ id, name: "Official name" }, title);
	assert.equal(result.ok, true);
	return result.draft;
}

function buildSelectedFolder(controller, {
	sources = [],
	catalogSources = [],
} = {}) {
	const imported = controller.importValue([{
		id: "collection",
		title: "Collection",
		folders: [{
			id: "folder",
			title: "Folder",
			sources,
			catalogSources,
		}],
	}]);
	assert.equal(imported.ok, true);
	const folder = controller.getState().project.collections[0].folders[0];
	assert.equal(controller.selectNode(folder.internalId).ok, true);
	return folder;
}

test("strict input parser accepts positive IDs with surrounding whitespace", () => {
	assert.deepEqual(parseTmdbCollectionInput("123"), {
		kind: "exact",
		inputType: "id",
		id: 123,
	});
	assert.deepEqual(parseTmdbCollectionInput(" \t123 \n"), {
		kind: "exact",
		inputType: "id",
		id: 123,
	});
});

test("strict input parser rejects zero, negative, fractional, unsafe, and malformed numbers", () => {
	for (const value of [
		"0",
		"-1",
		"1.5",
		"1e3",
		"+12",
		"9007199254740992",
	]) {
		const result = parseTmdbCollectionInput(value);
		assert.equal(result.kind, "invalid", value);
		assert.equal(result.code, "INVALID_TMDB_COLLECTION_ID", value);
	}
});

test("strict input parser accepts supported HTTPS collection URLs and ignores query and fragment", () => {
	for (const [value, id] of [
		["https://www.themoviedb.org/collection/1241", 1241],
		["https://themoviedb.org/collection/1241-harry-potter-collection", 1241],
		["https://www.themoviedb.org/collection/1241-harry-potter?language=en-AU#posters", 1241],
	]) {
		assert.deepEqual(parseTmdbCollectionInput(value), {
			kind: "exact",
			inputType: "url",
			id,
		}, value);
	}
});

test("strict input parser rejects non-HTTPS, lookalike hosts, wrong entities, query-only IDs, and embedded URLs", () => {
	const invalidUrls = [
		"http://www.themoviedb.org/collection/123",
		"https://themoviedb.org.evil.example/collection/123",
		"https://example.com/collection/123",
		"https://www.themoviedb.org/movie/123",
		"https://www.themoviedb.org/tv/123",
		"https://www.themoviedb.org/list/123",
		"https://www.themoviedb.org/person/123",
		"https://www.themoviedb.org/company/123",
		"https://www.themoviedb.org/collection?id=123",
		"https://www.themoviedb.org/collection/123/",
		"https://user:pass@www.themoviedb.org/collection/123",
		"https://www.themoviedb.org:444/collection/123",
		"https://www.themoviedb.org./collection/123",
		"https://www.themoviedb.org/collection/%31%32%33",
		"https://www.themoviedb.org/collection/123%2fmovie",
		"Open https://www.themoviedb.org/collection/123",
		"www.themoviedb.org/collection/123",
	];
	for (const value of invalidUrls) {
		assert.equal(parseTmdbCollectionInput(value).kind, "invalid", value);
	}
});

test("title search starts only after two trimmed characters and retains the trimmed query", () => {
	assert.deepEqual(parseTmdbCollectionInput(""), {
		kind: "empty",
		message: "Enter a movie franchise title, TMDB collection ID, or collection URL.",
	});
	assert.deepEqual(parseTmdbCollectionInput(" h "), {
		kind: "search",
		query: "h",
		eligible: false,
		message: "Enter at least two characters to search.",
	});
	assert.deepEqual(parseTmdbCollectionInput("  Harry Potter  "), {
		kind: "search",
		query: "Harry Potter",
		eligible: true,
		message: null,
	});
});

test("provider normalization exposes only bounded collection result fields", () => {
	const normalized = normalizeTmdbCollectionSearchResponse({
		page: 2,
		total_pages: 4,
		total_results: 21,
		results: [
			{
				id: 123,
				name: " Example Collection ",
				overview: " Overview ",
				poster_path: "/poster.jpg",
				unknown: "DO_NOT_EXPOSE",
			},
			{ id: 0, name: "Invalid" },
			{ id: 456, name: "" },
		],
	});
	assert.deepEqual(normalized, {
		results: [{
			id: 123,
			name: "Example Collection",
			overview: "Overview",
			posterPath: "/poster.jpg",
			movieCount: null,
			containedTitles: null,
		}],
		page: 2,
		totalPages: 4,
		totalResults: 21,
	});
	assert.equal(JSON.stringify(normalized).includes("DO_NOT_EXPOSE"), false);
	assert.equal(normalizeTmdbCollectionSearchResponse({ results: null }), null);
	assert.equal(normalizeTmdbCollectionSearchResponse(null), null);
});

test("provider normalization bounds long safe overviews before they reach UI code", () => {
	const overview = "A".repeat(900);
	const normalized = normalizeTmdbCollectionSearchResponse({
		page: 1,
		total_pages: 1,
		total_results: 1,
		results: [{
			id: 123,
			name: "Example Collection",
			overview,
			adult: false,
		}],
	});
	assert.equal(normalized.results[0].overview.length, 600);
	assert.ok(normalized.results[0].overview.endsWith("…"));
	assert.equal(normalized.results[0].overview.includes(overview), false);
});

test("exact detail normalization validates identity and derives movie count", () => {
	assert.deepEqual(
		normalizeTmdbCollectionDetailsResponse(validDetails(), 123),
		{
			id: 123,
			name: "Example Collection",
			overview: "A movie franchise.",
			posterPath: "/poster.jpg",
			movieCount: 2,
			containedTitles: [
				{ title: "First Movie", releaseYear: 2001 },
				{ title: "Second Movie", releaseYear: null },
			],
		},
	);
	assert.equal(normalizeTmdbCollectionDetailsResponse(validDetails(124), 123), null);
	assert.equal(normalizeTmdbCollectionDetailsResponse({ id: 123, name: "" }, 123), null);
});

test("content safety uses exact words and whole-word query relevance", () => {
	assert.equal(
		containsClearlyExplicitSexualText("A Bondage Collection", "Description"),
		true,
	);
	assert.equal(
		containsClearlyExplicitSexualText("A Pornographic Collection", "Description"),
		true,
	);
	assert.equal(
		containsClearlyExplicitSexualText("Hardcore sex collection", "Description"),
		true,
	);
	assert.equal(
		containsClearlyExplicitSexualText("Bond Collection", "A spy anthology"),
		false,
	);
	assert.equal(
		containsClearlyExplicitSexualText("The Adult Filmmaker Collection", "A documentary"),
		false,
		"phrase checks must not turn filmmaker into the whole word film",
	);
	assert.equal(
		collectionMatchesWholeWordQuery({ name: "James Bond Collection" }, "bond"),
		true,
	);
	assert.equal(
		collectionMatchesWholeWordQuery({ name: "Bondage Collection" }, "bond"),
		false,
	);
	assert.equal(
		collectionMatchesWholeWordQuery({ name: "Harry Potter Collection" }, "harry potter"),
		true,
	);
});

test("search normalization filters adult, malformed-adult, explicit, and incidental substring results before UI data exists", () => {
	const normalized = normalizeTmdbCollectionSearchResponse({
		page: 1,
		total_pages: 1,
		total_results: 6,
		results: [
			{ id: 1, name: "James Bond Collection", overview: "Spy films", adult: false, poster_path: "/bond.jpg" },
			{ id: 2, name: "Bondage Collection", overview: "Explicit", adult: false, poster_path: "/blocked.jpg" },
			{ id: 3, name: "Bond Archive", overview: "Adult", adult: true, poster_path: "/adult.jpg" },
			{ id: 4, name: "Bond Stories", overview: "Malformed", adult: "false", poster_path: "/malformed.jpg" },
			{ id: 5, name: "Bond Retrospective", overview: "No flag", poster_path: "/safe.jpg" },
			{ id: 6, name: "Unrelated Collection", overview: "Safe", adult: false, poster_path: "/other.jpg" },
		],
	}, "bond");

	assert.deepEqual(
		normalized.results.map((result) => result.name),
		["James Bond Collection", "Bond Retrospective"],
	);
	assert.equal(JSON.stringify(normalized).includes("blocked.jpg"), false);
	assert.equal(JSON.stringify(normalized).includes("Explicit"), false);
});

test("details reject an adult or malformed-adult contained title and never expose collection metadata", () => {
	for (const adult of [true, "false", 0, null]) {
		const details = validDetails();
		details.parts[1].adult = adult;
		assert.equal(
			normalizeTmdbCollectionDetailsResponse(details, details.id),
			null,
			`adult=${String(adult)}`,
		);
	}

	const explicit = validDetails();
	explicit.name = "Bondage Collection";
	explicit.poster_path = "/must-not-render.jpg";
	assert.equal(normalizeTmdbCollectionDetailsResponse(explicit, explicit.id), null);
});

test("details reject malformed collection adult flags while accepting an omitted provider flag", () => {
	for (const adult of [true, "false", 0, null]) {
		const details = validDetails();
		details.adult = adult;
		assert.equal(
			normalizeTmdbCollectionDetailsResponse(details, details.id),
			null,
			`adult=${String(adult)}`,
		);
	}
	const omitted = validDetails();
	delete omitted.adult;
	assert.equal(normalizeTmdbCollectionDetailsResponse(omitted, omitted.id).id, omitted.id);
});

test("details preserve contained-title order with title and year fallbacks", () => {
	const details = validDetails();
	details.parts = [
		{ adult: false, title: "First", release_date: "1999-01-02" },
		{ adult: false, original_title: "Original fallback", release_date: "unknown" },
		{ adult: false, release_date: "" },
	];
	const normalized = normalizeTmdbCollectionDetailsResponse(details, details.id);
	assert.deepEqual(normalized.containedTitles, [
		{ title: "First", releaseYear: 1999 },
		{ title: "Original fallback", releaseYear: null },
		{ title: "Untitled movie", releaseYear: null },
	]);
	assert.equal(normalized.movieCount, 3);
});

test("poster helper accepts only normalized TMDB paths and supported display sizes", () => {
	assert.equal(normalizeTmdbPosterPath("/poster_1.jpg"), "/poster_1.jpg");
	for (const invalid of ["poster.jpg", "//evil.example/x.jpg", "/a/b.jpg", "/a%2fb.jpg", "", null]) {
		assert.equal(normalizeTmdbPosterPath(invalid), null, String(invalid));
	}
	assert.equal(
		buildTmdbPosterUrl("/poster_1.jpg", "w185"),
		"https://image.tmdb.org/t/p/w185/poster_1.jpg",
	);
	assert.equal(buildTmdbPosterUrl("/poster.jpg", "original"), null);
});

test("provider adapter uses only the current Worker collection routes, explicit pagination, and adult exclusion", async () => {
	const calls = [];
	const provider = createProvider({
		fetchImpl: async (url, options) => {
			calls.push({ url: new URL(url), options });
			return url.includes("/search/collection")
				? jsonResponse({
					page: 3,
					total_pages: 5,
					total_results: 50,
					results: [validDetails()],
				})
				: jsonResponse(validDetails());
		},
	});

	const search = await provider.searchCollections(" Harry Potter ", { page: 3 });
	const details = await provider.getCollection(123);
	assert.equal(search.ok, true);
	assert.equal(search.data.page, 3);
	assert.equal(search.data.totalPages, 5);
	assert.equal(details.ok, true);
	assert.equal(calls.length, 2);
	assert.equal(calls[0].url.origin, new URL(configuredWorkerBaseUrl).origin);
	assert.equal(calls[0].url.pathname, "/3/search/collection");
	assert.equal(calls[0].url.searchParams.get("query"), "Harry Potter");
	assert.equal(calls[0].url.searchParams.get("page"), "3");
	assert.equal(calls[0].url.searchParams.get("include_adult"), "false");
	assert.equal(calls[1].url.pathname, "/3/collection/123");
	assert.equal(calls[1].url.search, "");
	assert.equal(calls.every(({ options }) => options.method === "GET"), true);
});

test("build configuration extracts exactly one validated HTTPS Worker origin", () => {
	assert.equal(extractTmdbProxyBaseUrl(v1Config), configuredWorkerBaseUrl);
	for (const [source, message] of [
		["", "found 0"],
		[
			`${v1Config}\nconst TMDB_PROXY_BASE_URL = "https://duplicate.example";`,
			"found 2",
		],
		['const TMDB_PROXY_BASE_URL = "http://worker.example";', "HTTPS origin"],
		['const TMDB_PROXY_BASE_URL = "https://worker.example/path";', "HTTPS origin"],
		['const TMDB_PROXY_BASE_URL = "not a URL";', "absolute HTTPS URL"],
	]) {
		assert.throws(
			() => extractTmdbProxyBaseUrl(source),
			(error) => error.message.includes(message),
		);
	}

	const viteConfig = fs.readFileSync(path.join(rootDir, "builder", "vite.config.js"), "utf8");
	const providerSource = fs.readFileSync(
		path.join(rootDir, "builder", "src", "source-add", "tmdb-collection-provider.js"),
		"utf8",
	);
	assert.equal(viteConfig.includes("eval("), false);
	assert.equal(viteConfig.includes("new Function"), false);
	assert.equal(viteConfig.includes(configuredWorkerBaseUrl), false);
	assert.equal(providerSource.includes(configuredWorkerBaseUrl), false);
	assert.equal(TMDB_PROXY_BASE_URL, null);
});

test("provider rejects malformed or non-HTTPS base URLs before constructing any route", () => {
	for (const baseUrl of [
		"http://worker.example",
		"https://user:pass@worker.example",
		"https://worker.example:444",
		"https://worker.example/path",
		"https://worker.example?query=1",
		"not a URL",
	]) {
		assert.throws(
			() => createTmdbCollectionProvider({
				baseUrl,
				fetchImpl: async () => jsonResponse({}),
			}),
			/The TMDB Worker base URL must be an absolute HTTPS origin/,
			baseUrl,
		);
	}
});

test("provider adapter returns sanitized rate-limit, provider, malformed, and network failures without caching errors", async () => {
	const cases = [
		{
			response: () => jsonResponse({}, { status: 429 }),
			kind: "rate-limit",
		},
		{
			response: () => jsonResponse({}, { status: 503 }),
			kind: "provider",
		},
		{
			response: () => jsonResponse({ results: null }),
			kind: "invalid-response",
		},
		{
			response: () => jsonResponse({}, { contentType: "text/html" }),
			kind: "invalid-response",
		},
	];
	for (const { response, kind } of cases) {
		let calls = 0;
		const provider = createProvider({
			fetchImpl: async () => {
				calls += 1;
				return response();
			},
		});
		const first = await provider.searchCollections("test");
		const second = await provider.searchCollections("test");
		assert.equal(first.ok, false, kind);
		assert.equal(first.error.kind, kind);
		assert.equal(typeof first.error.message, "string");
		assert.equal(first.error.message.includes("503"), false);
		assert.equal(second.ok, false);
		assert.equal(calls, 2, `${kind} was incorrectly cached`);
	}

	const networkProvider = createProvider({
		fetchImpl: async () => {
			throw new Error("private network details");
		},
	});
	const network = await networkProvider.getCollection(123);
	assert.equal(network.ok, false);
	assert.equal(network.error.kind, "network");
	assert.equal(network.error.message.includes("private network details"), false);
});

test("exact validation returns a neutral unavailable error for unsafe details and does not cache it", async () => {
	let calls = 0;
	const unsafeDetails = validDetails();
	unsafeDetails.parts[0].adult = true;
	unsafeDetails.name = "Private unsafe provider title";
	const provider = createProvider({
		fetchImpl: async () => {
			calls += 1;
			return jsonResponse(unsafeDetails);
		},
	});

	for (let attempt = 0; attempt < 2; attempt += 1) {
		const result = await provider.getCollection(unsafeDetails.id);
		assert.equal(result.ok, false);
		assert.equal(result.error.kind, "invalid-response");
		assert.equal(result.error.message, TMDB_COLLECTION_UNAVAILABLE_MESSAGE);
		assert.equal(result.error.retryable, false);
		assert.equal(JSON.stringify(result).includes(unsafeDetails.name), false);
	}
	assert.equal(calls, 2);
});

test("provider adapter distinguishes details not-found, timeout, and caller abort", async () => {
	const notFoundProvider = createProvider({
		fetchImpl: async () => jsonResponse({}, { status: 404 }),
	});
	const notFound = await notFoundProvider.getCollection(123);
	assert.equal(notFound.error.kind, "not-found");
	assert.equal(notFound.error.retryable, false);

	const hangingFetch = async (_url, { signal }) => new Promise((resolve, reject) => {
		if (signal.aborted) {
			reject(new DOMException("Aborted", "AbortError"));
			return;
		}
		signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
	});
	const timeoutProvider = createProvider({
		fetchImpl: hangingFetch,
		timeoutMs: 5,
	});
	const timeout = await timeoutProvider.getCollection(123);
	assert.equal(timeout.error.kind, "timeout");

	const bodyTimeoutProvider = createProvider({
		fetchImpl: async (_url, { signal }) => ({
			status: 200,
			ok: true,
			headers: new Headers({ "Content-Type": "application/json" }),
			json: () => new Promise((_resolve, reject) => {
				signal.addEventListener(
					"abort",
					() => reject(new DOMException("Aborted", "AbortError")),
					{ once: true },
				);
			}),
		}),
		timeoutMs: 5,
	});
	const bodyTimeout = await bodyTimeoutProvider.getCollection(123);
	assert.equal(bodyTimeout.error.kind, "timeout");

	const abortProvider = createProvider({
		fetchImpl: hangingFetch,
		timeoutMs: 1_000,
	});
	const controller = new AbortController();
	const pending = abortProvider.getCollection(123, { signal: controller.signal });
	controller.abort();
	const aborted = await pending;
	assert.equal(aborted.error.kind, "aborted");
	assert.equal(aborted.error.retryable, false);
});

test("successful provider responses use a bounded expiring in-memory cache", async () => {
	let now = 1_000;
	let calls = 0;
	const provider = createProvider({
		fetchImpl: async () => {
			calls += 1;
			return jsonResponse({
				page: 1,
				total_pages: 1,
				total_results: 1,
				results: [validDetails()],
			});
		},
		cacheTtlMs: 100,
		cacheMaxEntries: 2,
		now: () => now,
	});

	const first = await provider.searchCollections("example");
	const second = await provider.searchCollections("example");
	assert.equal(first.fromCache, false);
	assert.equal(second.fromCache, true);
	assert.equal(calls, 1);
	second.data.results[0].name = "Caller mutation";
	assert.equal((await provider.searchCollections("example")).data.results[0].name, "Example Collection");
	now += 101;
	assert.equal((await provider.searchCollections("example")).fromCache, false);
	assert.equal(calls, 2);

	await provider.searchCollections("second");
	await provider.searchCollections("third");
	await provider.searchCollections("example");
	assert.equal(calls, 5, "the least-recent bounded entry should be evicted");
});

test("request coordinator publishes loading and suppresses stale completions monotonically", async () => {
	const states = [];
	const coordinator = createAsyncRequestCoordinator({
		onStateChange: (state) => states.push(state),
	});
	let resolveFirst;
	const first = coordinator.run(
		() => new Promise((resolve) => {
			resolveFirst = resolve;
		}),
		{ query: "first" },
	);
	const second = coordinator.run(
		async () => ({ ok: true, data: { value: "newest" } }),
		{ query: "second" },
	);
	const secondOutcome = await second;
	resolveFirst({ ok: true, data: { value: "stale" } });
	const firstOutcome = await first;

	assert.equal(firstOutcome.accepted, false);
	assert.equal(secondOutcome.accepted, true);
	assert.deepEqual(coordinator.getState().data, { value: "newest" });
	assert.deepEqual(states.map((state) => state.status), [
		"loading",
		"loading",
		"success",
	]);
	assert.deepEqual(states.at(-1).context, { query: "second" });
});

test("request coordinator sanitizes thrown failures and resets caller-aborted current work", async () => {
	const coordinator = createAsyncRequestCoordinator();
	const thrown = await coordinator.run(async () => {
		throw new Error("private implementation detail");
	});
	assert.equal(thrown.result.error.kind, "request");
	assert.equal(thrown.result.error.message.includes("private implementation detail"), false);

	const aborted = await coordinator.run(async () => ({
		ok: false,
		error: {
			kind: "aborted",
			message: "Cancelled",
			retryable: false,
		},
	}));
	assert.equal(aborted.accepted, true);
	assert.equal(coordinator.getState().status, "idle");
});

test("source draft constructor emits the exact canonical recipe and trims edited titles", () => {
	const defaultTitle = buildMovieFranchiseSourceDraft({
		id: 123,
		name: "Official Collection",
	});
	assert.equal(defaultTitle.ok, true);
	assert.deepEqual(defaultTitle.draft, {
		category: "native-tmdb",
		editable: {
			title: "Official Collection",
			sortBy: "original",
			tmdbId: 123,
			filters: {},
			provider: "tmdb",
			mediaType: "MOVIE",
			tmdbSourceType: "COLLECTION",
		},
	});

	const edited = buildMovieFranchiseSourceDraft({
		id: 123,
		name: "Official Collection",
	}, "  My franchise  ");
	assert.equal(edited.ok, true);
	assert.equal(edited.draft.editable.title, "My franchise");
	assert.deepEqual(Object.keys(edited.draft.editable), [
		"title",
		"sortBy",
		"tmdbId",
		"filters",
		"provider",
		"mediaType",
		"tmdbSourceType",
	]);
});

test("source semantic validation rejects empty titles, unsafe IDs, changed constants, and extra fields", () => {
	for (const [patch, code] of [
		[{ title: "" }, "SOURCE_TITLE_REQUIRED"],
		[{ tmdbId: 0 }, "INVALID_SOURCE_TMDB_ID"],
		[{ tmdbId: Number.MAX_SAFE_INTEGER + 1 }, "INVALID_SOURCE_TMDB_ID"],
		[{ provider: "addon" }, "INVALID_SOURCE_PROVIDER"],
		[{ mediaType: "TV" }, "INVALID_SOURCE_MEDIA_TYPE"],
		[{ tmdbSourceType: "LIST" }, "INVALID_SOURCE_TYPE"],
		[{ sortBy: "popularity.desc" }, "INVALID_SOURCE_SORT"],
		[{ filters: { withGenres: "28" } }, "INVALID_SOURCE_FILTERS"],
	]) {
		const draft = canonicalDraft();
		Object.assign(draft.editable, patch);
		const result = validateMovieFranchiseSourceDraft(draft);
		assert.equal(result.ok, false, code);
		assert.equal(result.errors.some((entry) => entry.code === code), true, code);
	}

	const extra = canonicalDraft();
	extra.editable.uiMetadata = true;
	assert.equal(
		validateMovieFranchiseSourceDraft(extra).errors[0].code,
		"INVALID_SOURCE_DRAFT_FIELDS",
	);
	const raw = { ...canonicalDraft(), rawImported: {} };
	assert.equal(validateMovieFranchiseSourceDraft(raw).errors[0].code, "INVALID_SOURCE_DRAFT");
});

test("duplicate identity is title-independent and accepts imported numeric string IDs", () => {
	const first = {
		provider: "tmdb",
		tmdbSourceType: "COLLECTION",
		tmdbId: 123,
		mediaType: "MOVIE",
		title: "First title",
	};
	const second = {
		...first,
		provider: "TMDB",
		tmdbSourceType: "collection",
		tmdbId: "123",
		mediaType: "movie",
		title: "Other title",
	};
	assert.equal(movieFranchiseDuplicateIdentity(first), "tmdb|COLLECTION|123|MOVIE");
	assert.equal(movieFranchiseDuplicateIdentity(second), "tmdb|COLLECTION|123|MOVIE");
	assert.equal(movieFranchiseDuplicateIdentity({ ...first, mediaType: "TV" }), null);

	const folder = {
		sources: [{
			internalId: "existing",
			editable: second,
		}],
	};
	assert.deepEqual(findMovieFranchiseDuplicate(folder, canonicalDraft()), {
		internalId: "existing",
		identity: "tmdb|COLLECTION|123|MOVIE",
		title: "Other title",
	});
});

test("submission gate permits one activation until an explicit recoverable reset", () => {
	const gate = createSourceSubmissionGate();
	assert.equal(gate.isActive(), false);
	assert.equal(gate.begin(), true);
	assert.equal(gate.isActive(), true);
	assert.equal(gate.begin(), false, "a rapid repeated activation must be ignored");
	gate.reset();
	assert.equal(gate.isActive(), false);
	assert.equal(gate.begin(), true, "a recoverable failure may permit one retry");
});

test("one guarded Apply appends one source, advances content once, selects without another revision, and serializes canonically", () => {
	const controller = createController();
	const folder = buildSelectedFolder(controller, {
		sources: [{
			provider: "addon",
			title: "Existing addon",
			addonId: "example.addon",
			type: "movie",
			catalogId: "existing",
		}],
		catalogSources: [{
			addonId: "example.addon",
			type: "movie",
			catalogId: "existing",
			unknownProjection: "keep",
		}],
	});
	const beforeState = controller.getState();
	const beforeOutput = controller.serializeProject().value[0].folders[0];
	const notifications = [];
	controller.subscribe(() => notifications.push(controller.getState()));

	const result = createMovieFranchiseSource(controller, {
		folderInternalId: folder.internalId,
		draft: canonicalDraft(123, "Edited franchise"),
	});
	assert.equal(result.ok, true);
	assert.equal(result.selectionOk, true);
	const state = controller.getState();
	const output = controller.serializeProject().value[0].folders[0];

	assert.equal(state.revision, beforeState.revision + 1);
	assert.equal(state.selection.sourceInternalId, result.createdInternalId);
	assert.deepEqual(state.project.collections[0].folders[0].sources.map((source) => source.editable.title), [
		"Existing addon",
		"Edited franchise",
	]);
	assert.deepEqual(output.sources[1], canonicalDraft(123, "Edited franchise").editable);
	assert.deepEqual(output.catalogSources, beforeOutput.catalogSources);
	assert.equal(output.sources[1].id, undefined);
	assert.equal(JSON.stringify(output.sources[1]).includes("internalId"), false);
	assert.equal(JSON.stringify(output.sources[1]).includes("rawImported"), false);
	assert.equal(JSON.stringify(output.sources[1]).includes("sortHow"), false);
	assert.equal(JSON.stringify(output.sources[1]).includes("trakt"), false);
	assert.equal(JSON.stringify(output.sources[1]).includes("addon"), false);
	assert.equal(JSON.stringify(output.sources[1]).includes("poster"), false);
	assert.equal(validateNuvioContract(controller.serializeProject().value, {
		mode: "canonical-builder-output",
	}).valid, true);
	assert.equal(notifications.length, 2);
	assert.equal(notifications.filter((snapshot, index) => (
		index === 0
			? snapshot.revision !== beforeState.revision
			: snapshot.revision !== notifications[index - 1].revision
	)).length, 1);
});

test("new native source preserves canonical second-cycle output and existing addon projections", () => {
	const controller = createController();
	const folder = buildSelectedFolder(controller, {
		sources: [{
			provider: "addon",
			title: "Addon",
			addonId: "example.addon",
			type: "series",
			catalogId: "series",
			unknownSource: "keep",
		}],
		catalogSources: [{
			addonId: "example.addon",
			type: "series",
			catalogId: "series",
			unknownProjection: "keep",
		}],
	});
	assert.equal(createMovieFranchiseSource(controller, {
		folderInternalId: folder.internalId,
		draft: canonicalDraft(),
	}).ok, true);
	const first = controller.stringifyProject();
	assert.equal(first.ok, true);

	const cycled = createController();
	assert.equal(cycled.importValue(first.value).ok, true);
	const second = cycled.stringifyProject();
	assert.equal(second.ok, true);
	assert.deepEqual(second.value, first.value);
	assert.equal(second.json, first.json);
	assert.equal(second.value[0].folders[0].catalogSources[0].unknownProjection, "keep");
});

test("duplicate warning is non-destructive until explicit Add anyway and preserves the imported duplicate", () => {
	const controller = createController();
	const folder = buildSelectedFolder(controller, {
		sources: [{
			provider: "tmdb",
			title: "Imported duplicate",
			sortBy: "original",
			tmdbId: "123",
			filters: {},
			mediaType: "MOVIE",
			tmdbSourceType: "COLLECTION",
			unknownImported: "keep",
		}],
	});
	const before = controller.getState();
	const blocked = createMovieFranchiseSource(controller, {
		folderInternalId: folder.internalId,
		draft: canonicalDraft(123, "Different title"),
	});
	assert.equal(blocked.ok, false);
	assert.equal(blocked.requiresDuplicateConfirmation, true);
	assert.equal(blocked.duplicate.title, "Imported duplicate");
	assert.equal(controller.getState(), before);

	const staleApproval = createMovieFranchiseSource(controller, {
		folderInternalId: folder.internalId,
		draft: canonicalDraft(123, "Different title"),
		duplicateApprovalIdentity: "tmdb|COLLECTION|999|MOVIE",
	});
	assert.equal(staleApproval.requiresDuplicateConfirmation, true);
	assert.equal(controller.getState(), before);

	const added = createMovieFranchiseSource(controller, {
		folderInternalId: folder.internalId,
		draft: canonicalDraft(123, "Different title"),
		duplicateApprovalIdentity: blocked.duplicate.identity,
	});
	assert.equal(added.ok, true);
	assert.equal(controller.getState().revision, before.revision + 1);
	const output = controller.serializeProject().value[0].folders[0];
	assert.equal(output.sources.length, 2);
	assert.equal(output.sources[0].unknownImported, "keep");
	assert.equal(output.sources[0].title, "Imported duplicate");
	assert.equal(output.sources[1].title, "Different title");
});

test("cancel, interaction lock, missing selection, and removed-folder paths make no source mutation", () => {
	const controller = createController();
	let folder = buildSelectedFolder(controller);
	const beforeCancel = controller.getState();
	// Cancel is represented by deliberately not invoking the creation service.
	assert.equal(controller.getState(), beforeCancel);

	const locked = createMovieFranchiseSource(controller, {
		folderInternalId: folder.internalId,
		draft: canonicalDraft(),
		interactionLocked: true,
	});
	assert.equal(locked.ok, false);
	assert.equal(locked.errors[0].code, "SOURCE_CREATION_INTERACTION_LOCKED");
	assert.equal(controller.getState(), beforeCancel);

	controller.selectNode(controller.getState().project.collections[0].internalId);
	const selectionBefore = controller.getState();
	const unavailableSelection = createMovieFranchiseSource(controller, {
		folderInternalId: folder.internalId,
		draft: canonicalDraft(),
	});
	assert.equal(unavailableSelection.errors[0].code, "SOURCE_CREATION_FOLDER_UNAVAILABLE");
	assert.equal(controller.getState(), selectionBefore);

	controller.selectNode(folder.internalId);
	assert.equal(controller.removeNode(folder.internalId).ok, true);
	const afterRemoval = controller.getState();
	const removed = createMovieFranchiseSource(controller, {
		folderInternalId: folder.internalId,
		draft: canonicalDraft(),
	});
	assert.equal(removed.errors[0].code, "SOURCE_CREATION_FOLDER_UNAVAILABLE");
	assert.equal(controller.getState(), afterRemoval);
});

test("controller insertion failure is atomic and does not attempt selection", () => {
	const controller = createBuilderController({
		idFactory: sequenceIdFactory("project", "collection", "folder", "project"),
		nuvioIdFactory: countingIdFactory("nuvio"),
	});
	const collection = controller.createCollection({ editable: { title: "Collection" } });
	const folder = controller.createFolder(collection.createdInternalId, { editable: { title: "Folder" } });
	controller.selectNode(folder.createdInternalId);
	const before = controller.getState();
	const result = createMovieFranchiseSource(controller, {
		folderInternalId: folder.createdInternalId,
		draft: canonicalDraft(),
	});
	assert.equal(result.ok, false);
	assert.equal(result.errors[0].code, "INTERNAL_ID_COLLISION");
	assert.equal(controller.getState().project, before.project);
	assert.equal(controller.getState().selection.folderInternalId, folder.createdInternalId);
	assert.equal(controller.getState().selection.sourceInternalId, null);
	assert.equal(controller.getState().revision, before.revision + 1);
	assert.equal(controller.getState().diagnostics.operation.errors[0].code, "INTERNAL_ID_COLLISION");
});

test("created sources continue to support existing reorder and Delete controller paths", () => {
	const controller = createController();
	const folder = buildSelectedFolder(controller, {
		sources: [{
			provider: "tmdb",
			title: "Existing",
			sortBy: "original",
			tmdbId: 456,
			filters: {},
			mediaType: "MOVIE",
			tmdbSourceType: "COLLECTION",
		}],
	});
	const created = createMovieFranchiseSource(controller, {
		folderInternalId: folder.internalId,
		draft: canonicalDraft(),
	});
	assert.equal(created.ok, true);
	assert.equal(controller.moveNode(created.createdInternalId, 0).ok, true);
	assert.deepEqual(
		controller.getState().project.collections[0].folders[0].sources.map((source) => source.editable.title),
		["Example Collection", "Existing"],
	);
	assert.equal(controller.removeNode(created.createdInternalId).ok, true);
	assert.deepEqual(
		controller.getState().project.collections[0].folders[0].sources.map((source) => source.editable.title),
		["Existing"],
	);
});

test("tracked Worker already permits exactly the required collection routes", () => {
	const worker = fs.readFileSync(path.join(rootDir, "cloudflare-worker", "tmdb-proxy.js"), "utf8");
	assert.ok(worker.includes("/^\\/3\\/search\\/collection$/"));
	assert.ok(worker.includes("/^\\/3\\/collection\\/\\d+$/"));
});
