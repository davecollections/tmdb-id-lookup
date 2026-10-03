import { isPositiveSafeTmdbId } from "./tmdb-collection-input.js";
import { normalizeTmdbPosterPath } from "./tmdb-image.js";
import { createTmdbJsonRequester, tmdbRequestFailure as providerError } from "./tmdb-json-requester.js";

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
			id: isPositiveSafeTmdbId(part.id) ? part.id : null,
			title: normalizedText(part.title)
				|| normalizedText(part.original_title)
				|| "Untitled movie",
			releaseYear: normalizedReleaseYear(part.release_date),
			posterPath: normalizeTmdbPosterPath(part.poster_path),
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
		backdropPath: normalizeTmdbPosterPath(value.backdrop_path),
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

export function createTmdbCollectionProvider({
	fetchImpl,
	baseUrl = TMDB_PROXY_BASE_URL,
	timeoutMs = TMDB_COLLECTION_REQUEST_TIMEOUT_MS,
	cacheTtlMs = TMDB_COLLECTION_CACHE_TTL_MS,
	cacheMaxEntries = TMDB_COLLECTION_CACHE_MAX_ENTRIES,
	now = Date.now,
} = {}) {
	const request = createTmdbJsonRequester({ fetchImpl, baseUrl, timeoutMs, cacheTtlMs, cacheMaxEntries, now });

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
