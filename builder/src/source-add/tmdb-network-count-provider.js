import {
	createTmdbDiscoverCountRequester,
	normalizeTmdbDiscoverCountResponse,
	TMDB_DISCOVER_COUNT_CACHE_MAX_ENTRIES,
	TMDB_DISCOVER_COUNT_CACHE_TTL_MS,
	TMDB_DISCOVER_COUNT_REQUEST_TIMEOUT_MS,
} from "./tmdb-discover-count-requester.js";

export const TMDB_NETWORK_COUNT_CACHE_TTL_MS = TMDB_DISCOVER_COUNT_CACHE_TTL_MS;
export const TMDB_NETWORK_COUNT_CACHE_MAX_ENTRIES = TMDB_DISCOVER_COUNT_CACHE_MAX_ENTRIES;
export const TMDB_NETWORK_COUNT_REQUEST_TIMEOUT_MS = TMDB_DISCOVER_COUNT_REQUEST_TIMEOUT_MS;
export const TMDB_NETWORK_COUNT_PROXY_BASE_URL = typeof __TMDB_PROXY_BASE_URL__ === "string" ? __TMDB_PROXY_BASE_URL__ : null;
export const TMDB_NETWORK_COUNT_LOCAL_MOCK = typeof __TMDB_NETWORK_MOCK_COUNTS__ === "boolean" ? __TMDB_NETWORK_MOCK_COUNTS__ : false;

function providerError(kind, message, { status = 0, retryable = true } = {}) {
	return { ok: false, error: { kind, message, status, retryable } };
}

function unavailable(error = null) {
	return Object.freeze({
		status: "unavailable",
		count: null,
		error: Object.freeze({ message: "Count unavailable", retryable: error?.retryable !== false }),
	});
}

export const normalizeTmdbNetworkCountResponse = normalizeTmdbDiscoverCountResponse;

export function createTmdbNetworkCountProvider({
	fetchImpl,
	baseUrl = TMDB_NETWORK_COUNT_PROXY_BASE_URL,
	timeoutMs = TMDB_NETWORK_COUNT_REQUEST_TIMEOUT_MS,
	cacheTtlMs = TMDB_NETWORK_COUNT_CACHE_TTL_MS,
	cacheMaxEntries = TMDB_NETWORK_COUNT_CACHE_MAX_ENTRIES,
	now = Date.now,
} = {}) {
	const requester = createTmdbDiscoverCountRequester({
		fetchImpl,
		baseUrl,
		queryParameter: "with_networks",
		countPaths: Object.freeze({ series: "/3/discover/tv" }),
		entityLabel: "Network",
		forceProxy: TMDB_NETWORK_COUNT_LOCAL_MOCK,
		timeoutMs,
		cacheTtlMs,
		cacheMaxEntries,
		now,
	});

	async function getNetworkCount(networkId, { signal, bypassCache = false } = {}) {
		const result = await requester.getCount(networkId, "series", { signal, bypassCache });
		if (result?.error?.kind === "invalid-request") return result;
		if (signal?.aborted || result?.error?.kind === "aborted") {
			return providerError("aborted", "The superseded Network count request was cancelled.", { retryable: false });
		}
		return { ok: true, data: result?.ok ? result.data : unavailable(result?.error), checkedAt: now() };
	}

	return Object.freeze({ getNetworkCount });
}
