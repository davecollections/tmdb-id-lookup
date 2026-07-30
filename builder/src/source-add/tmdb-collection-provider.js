import { parseCanonicalHttpsOrigin } from "../../worker-origin.js";
import { isPositiveSafeTmdbId } from "./tmdb-collection-input.js";
import { normalizeTmdbPosterPath } from "./tmdb-image.js";

// Vite injects this from the stable root lookup's current js/config.js value.
// The typeof guard keeps the pure adapter importable in direct Node tests,
// where callers inject a base URL explicitly.
export const TMDB_PROXY_BASE_URL = typeof __TMDB_PROXY_BASE_URL__ === "string"
	? __TMDB_PROXY_BASE_URL__
	: null;
export const TMDB_COLLECTION_CACHE_TTL_MS = 5 * 60 * 1000;
export const TMDB_COLLECTION_CACHE_MAX_ENTRIES = 40;
export const TMDB_COLLECTION_REQUEST_TIMEOUT_MS = 12_000;
const TMDB_COLLECTION_OVERVIEW_MAX_LENGTH = 600;

function plainObject(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cloneData(value) {
	if (Array.isArray(value)) return value.map((entry) => cloneData(entry));
	if (!plainObject(value)) return value;
	return Object.fromEntries(
		Object.entries(value).map(([key, entry]) => [key, cloneData(entry)]),
	);
}

function providerError(kind, message, {
	status = 0,
	retryable = true,
} = {}) {
	return {
		ok: false,
		error: {
			kind,
			message,
			status,
			retryable,
		},
	};
}

function validPositiveInteger(value, fallback = null) {
	return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function normalizedText(value) {
	return typeof value === "string" ? value.trim() : "";
}

function boundedOverview(value) {
	return value.length > TMDB_COLLECTION_OVERVIEW_MAX_LENGTH
		? `${value.slice(0, TMDB_COLLECTION_OVERVIEW_MAX_LENGTH - 1).trimEnd()}…`
		: value;
}

function normalizedReleaseYear(value) {
	if (typeof value !== "string") return null;
	const match = value.match(/^(\d{4})(?:-\d{2}-\d{2})?$/);
	if (!match) return null;
	const year = Number(match[1]);
	return Number.isSafeInteger(year) && year > 0 ? year : null;
}

function normalizeContainedTitles(parts) {
	if (!Array.isArray(parts)) return null;
	const titles = [];
	for (const part of parts) {
		if (!plainObject(part)) return null;
		titles.push({
			title: normalizedText(part.title)
				|| normalizedText(part.original_title)
				|| "Untitled movie",
			releaseYear: normalizedReleaseYear(part.release_date),
		});
	}
	return titles;
}

function normalizeCollection(value, { includeContainedTitles = false } = {}) {
	if (
		!plainObject(value)
		|| !isPositiveSafeTmdbId(value.id)
	) return null;
	const name = normalizedText(value.name);
	const overview = normalizedText(value.overview);
	if (!name) return null;

	const collection = {
		id: value.id,
		name,
		overview: boundedOverview(overview),
		posterPath: normalizeTmdbPosterPath(value.poster_path),
		movieCount: null,
		containedTitles: null,
	};
	if (!includeContainedTitles) return collection;

	const containedTitles = normalizeContainedTitles(value.parts);
	if (containedTitles === null) return null;
	return {
		...collection,
		movieCount: containedTitles.length,
		containedTitles,
	};
}

export function normalizeTmdbCollectionSearchResponse(value) {
	if (!plainObject(value) || !Array.isArray(value.results)) return null;
	const page = validPositiveInteger(value.page, 1);
	const totalPages = Math.max(
		page,
		validPositiveInteger(value.total_pages, page),
	);
	const results = value.results
		.filter((entry) => !plainObject(entry) || entry.adult !== true)
		.map((entry) => normalizeCollection(entry))
		.filter((entry) => entry !== null);
	return {
		results,
		page,
		totalPages,
		totalResults: Number.isSafeInteger(value.total_results) && value.total_results >= 0
			? value.total_results
			: results.length,
	};
}

export function normalizeTmdbCollectionDetailsResponse(value, expectedId = null) {
	const collection = normalizeCollection(value, { includeContainedTitles: true });
	if (
		collection === null
		|| (expectedId !== null && collection.id !== expectedId)
	) {
		return null;
	}
	return collection;
}

function linkAbortSignal(signal, controller) {
	if (!signal) return () => {};
	const abort = () => controller.abort();
	if (signal.aborted) {
		abort();
		return () => {};
	}
	signal.addEventListener("abort", abort, { once: true });
	return () => signal.removeEventListener("abort", abort);
}

function contentTypeIsJson(response) {
	const contentType = response?.headers?.get?.("content-type");
	return !contentType || contentType.toLowerCase().includes("application/json");
}

function createBoundedResponseCache({
	ttlMs,
	maxEntries,
	now,
}) {
	const entries = new Map();

	function get(key) {
		const entry = entries.get(key);
		if (!entry) return null;
		if (now() - entry.createdAt > ttlMs) {
			entries.delete(key);
			return null;
		}
		entries.delete(key);
		entries.set(key, entry);
		return cloneData(entry.data);
	}

	function set(key, data) {
		entries.delete(key);
		entries.set(key, {
			createdAt: now(),
			data: cloneData(data),
		});
		while (entries.size > maxEntries) {
			entries.delete(entries.keys().next().value);
		}
	}

	return { get, set };
}

function configuredBaseUrl(value) {
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new TypeError("A TMDB Worker base URL is required.");
	}
	let url;
	try {
		url = parseCanonicalHttpsOrigin(value);
	} catch {
		throw new TypeError("The TMDB Worker base URL must be an absolute HTTPS origin.");
	}
	if (url === null) {
		throw new TypeError("The TMDB Worker base URL must be an absolute HTTPS origin.");
	}
	return url;
}

export function createTmdbCollectionProvider({
	fetchImpl = globalThis.fetch,
	baseUrl = TMDB_PROXY_BASE_URL,
	timeoutMs = TMDB_COLLECTION_REQUEST_TIMEOUT_MS,
	cacheTtlMs = TMDB_COLLECTION_CACHE_TTL_MS,
	cacheMaxEntries = TMDB_COLLECTION_CACHE_MAX_ENTRIES,
	now = Date.now,
} = {}) {
	if (typeof fetchImpl !== "function") {
		throw new TypeError("A fetch implementation is required.");
	}
	if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
		throw new TypeError("The TMDB request timeout must be positive.");
	}
	if (!Number.isFinite(cacheTtlMs) || cacheTtlMs < 0) {
		throw new TypeError("The TMDB response cache lifetime cannot be negative.");
	}
	if (!Number.isInteger(cacheMaxEntries) || cacheMaxEntries <= 0) {
		throw new TypeError("The TMDB response cache size must be a positive integer.");
	}
	if (typeof now !== "function") {
		throw new TypeError("The TMDB response clock must be a function.");
	}

	const workerBaseUrl = configuredBaseUrl(baseUrl);
	const cache = createBoundedResponseCache({
		ttlMs: cacheTtlMs,
		maxEntries: cacheMaxEntries,
		now,
	});

	async function request(path, searchParams, {
		signal,
		cacheKey,
		normalize,
		notFoundMessage,
	}) {
		const cached = cache.get(cacheKey);
		if (cached !== null) {
			return {
				ok: true,
				data: cached,
				fromCache: true,
			};
		}

		const url = new URL(path, workerBaseUrl);
		for (const [key, value] of Object.entries(searchParams)) {
			url.searchParams.set(key, String(value));
		}

		const controller = new AbortController();
		const unlink = linkAbortSignal(signal, controller);
		let timeoutTriggered = false;
		const timeout = setTimeout(() => {
			timeoutTriggered = true;
			controller.abort();
		}, timeoutMs);

		let response;
		try {
			response = await fetchImpl(url.toString(), {
				method: "GET",
				headers: { Accept: "application/json" },
				signal: controller.signal,
			});
		} catch {
			clearTimeout(timeout);
			unlink();
			if (signal?.aborted) {
				return providerError(
					"aborted",
					"The superseded TMDB request was cancelled.",
					{ retryable: false },
				);
			}
			if (timeoutTriggered) {
				return providerError(
					"timeout",
					"TMDB took too long to respond. Try again.",
				);
			}
			return providerError(
				"network",
				"TMDB could not be reached. Check your connection and try again.",
			);
		}

		if (response.status === 429) {
			clearTimeout(timeout);
			unlink();
			return providerError(
				"rate-limit",
				"TMDB is receiving too many requests. Wait a moment and try again.",
				{ status: 429 },
			);
		}
		if (response.status === 404 && notFoundMessage) {
			clearTimeout(timeout);
			unlink();
			return providerError(
				"not-found",
				notFoundMessage,
				{ status: 404, retryable: false },
			);
		}
		if (!response.ok) {
			clearTimeout(timeout);
			unlink();
			return providerError(
				"provider",
				"TMDB could not complete this request. Try again.",
				{ status: response.status },
			);
		}
		if (!contentTypeIsJson(response)) {
			clearTimeout(timeout);
			unlink();
			return providerError(
				"invalid-response",
				"TMDB returned an unexpected response. Try again.",
			);
		}

		let value;
		try {
			value = await response.json();
		} catch {
			clearTimeout(timeout);
			unlink();
			if (signal?.aborted) {
				return providerError(
					"aborted",
					"The superseded TMDB request was cancelled.",
					{ retryable: false },
				);
			}
			if (timeoutTriggered) {
				return providerError(
					"timeout",
					"TMDB took too long to respond. Try again.",
				);
			}
			return providerError(
				"invalid-response",
				"TMDB returned an unexpected response. Try again.",
			);
		}
		clearTimeout(timeout);
		unlink();
		if (controller.signal.aborted) {
			return providerError(
				"aborted",
				"The superseded TMDB request was cancelled.",
				{ retryable: false },
			);
		}

		const data = normalize(value);
		if (data === null) {
			return providerError(
				"invalid-response",
				"TMDB returned an unexpected response. Try again.",
			);
		}

		cache.set(cacheKey, data);
		return {
			ok: true,
			data: cloneData(data),
			fromCache: false,
		};
	}

	function searchCollections(query, {
		page = 1,
		signal,
	} = {}) {
		const trimmedQuery = typeof query === "string" ? query.trim() : "";
		if (trimmedQuery.length < 2 || !Number.isSafeInteger(page) || page <= 0) {
			return Promise.resolve(providerError(
				"invalid-request",
				"Enter at least two characters and a valid results page.",
				{ retryable: false },
			));
		}
		const requestParameters = {
			query: trimmedQuery,
			page,
			include_adult: false,
		};
		return request("/3/search/collection", requestParameters, {
			signal,
			cacheKey: `search:${trimmedQuery.toLocaleLowerCase("en")}:${page}:include_adult=false`,
			normalize: normalizeTmdbCollectionSearchResponse,
		});
	}

	function getCollection(id, { signal } = {}) {
		if (!isPositiveSafeTmdbId(id)) {
			return Promise.resolve(providerError(
				"invalid-request",
				"TMDB collection IDs must be positive safe integers.",
				{ retryable: false },
			));
		}
		return request(`/3/collection/${id}`, {}, {
			signal,
			cacheKey: `details:${id}`,
			normalize: (value) => normalizeTmdbCollectionDetailsResponse(value, id),
			notFoundMessage: "This TMDB movie franchise could not be found or accessed.",
		});
	}

	return Object.freeze({
		getCollection,
		searchCollections,
	});
}
