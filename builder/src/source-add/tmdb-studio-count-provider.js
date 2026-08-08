import {
	createTmdbDiscoverCountRequester,
	normalizeTmdbDiscoverCountResponse,
	TMDB_DISCOVER_COUNT_CACHE_MAX_ENTRIES,
	TMDB_DISCOVER_COUNT_CACHE_TTL_MS,
	TMDB_DISCOVER_COUNT_REQUEST_TIMEOUT_MS,
} from "./tmdb-discover-count-requester.js";

export const TMDB_STUDIO_COUNT_CACHE_TTL_MS = TMDB_DISCOVER_COUNT_CACHE_TTL_MS;
export const TMDB_STUDIO_COUNT_CACHE_MAX_ENTRIES = TMDB_DISCOVER_COUNT_CACHE_MAX_ENTRIES;
export const TMDB_STUDIO_COUNT_REQUEST_TIMEOUT_MS = TMDB_DISCOVER_COUNT_REQUEST_TIMEOUT_MS;
export const TMDB_STUDIO_COUNT_PROXY_BASE_URL = typeof __TMDB_PROXY_BASE_URL__ === "string"
	? __TMDB_PROXY_BASE_URL__
	: null;
export const TMDB_STUDIO_COUNT_LOCAL_MOCK = typeof __TMDB_STUDIO_MOCK_COUNTS__ === "boolean"
	? __TMDB_STUDIO_MOCK_COUNTS__
	: false;

function providerError(kind, message, { status = 0, retryable = true } = {}) {
	return { ok: false, error: { kind, message, status, retryable } };
}

function unavailable(error = null) {
	return Object.freeze({
		status: "unavailable",
		count: null,
		error: Object.freeze({
			message: "Current count unavailable",
			retryable: error?.retryable !== false,
		}),
	});
}

export const normalizeTmdbStudioCountResponse = normalizeTmdbDiscoverCountResponse;

export function createTmdbStudioCountProvider({
	fetchImpl,
	baseUrl = TMDB_STUDIO_COUNT_PROXY_BASE_URL,
	timeoutMs = TMDB_STUDIO_COUNT_REQUEST_TIMEOUT_MS,
	cacheTtlMs = TMDB_STUDIO_COUNT_CACHE_TTL_MS,
	cacheMaxEntries = TMDB_STUDIO_COUNT_CACHE_MAX_ENTRIES,
	now = Date.now,
} = {}) {
	const requester = createTmdbDiscoverCountRequester({
		fetchImpl,
		baseUrl,
		queryParameter: "with_companies",
		countPaths: Object.freeze({ movie: "/3/discover/movie", series: "/3/discover/tv" }),
		entityLabel: "Studio",
		forceProxy: TMDB_STUDIO_COUNT_LOCAL_MOCK,
		timeoutMs,
		cacheTtlMs,
		cacheMaxEntries,
		now,
	});

	async function getStudioCount(studioId, countKey, options = {}) {
		const result = await requester.getCount(studioId, countKey, options);
		if (result?.error?.kind === "invalid-request") return result;
		if (options.signal?.aborted || result?.error?.kind === "aborted") {
			return providerError("aborted", "The superseded Studio count request was cancelled.", { retryable: false });
		}
		return {
			ok: true,
			data: result?.ok ? result.data : unavailable(result?.error),
			checkedAt: now(),
		};
	}

	async function getStudioCounts(studioId, { signal, bypassCache = false } = {}) {
		if (typeof studioId !== "number" || !Number.isSafeInteger(studioId) || studioId <= 0) {
			return providerError("invalid-request", "TMDB studio IDs must be positive safe integers.", { retryable: false });
		}
		const [movieResult, seriesResult] = await Promise.all([
			getStudioCount(studioId, "movie", { signal, bypassCache }),
			getStudioCount(studioId, "series", { signal, bypassCache }),
		]);
		if (signal?.aborted) return providerError("aborted", "The superseded Studio count request was cancelled.", { retryable: false });
		return {
			ok: true,
			data: Object.freeze({
				movie: movieResult?.ok ? movieResult.data : unavailable(movieResult?.error),
				series: seriesResult?.ok ? seriesResult.data : unavailable(seriesResult?.error),
			}),
			checkedAt: now(),
		};
	}

	return Object.freeze({ getStudioCount, getStudioCounts });
}
