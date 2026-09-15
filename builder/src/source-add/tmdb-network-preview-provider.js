import { networkPreviewQuery } from "./network-advanced.js";
import { NETWORK_SORT_OPTIONS, networkSortValue } from "./network-source.js";
import { TMDB_PROXY_BASE_URL } from "./tmdb-collection-provider.js";
import {
	createTmdbDiscoverPreviewRequester,
	normalizeTmdbDiscoverPreviewResponse,
	TMDB_DISCOVER_PREVIEW_CACHE_MAX_ENTRIES,
	TMDB_DISCOVER_PREVIEW_CACHE_TTL_MS,
	TMDB_DISCOVER_PREVIEW_REQUEST_TIMEOUT_MS,
} from "./tmdb-discover-preview-requester.js";

export const TMDB_NETWORK_PREVIEW_CACHE_TTL_MS = TMDB_DISCOVER_PREVIEW_CACHE_TTL_MS;
export const TMDB_NETWORK_PREVIEW_CACHE_MAX_ENTRIES = TMDB_DISCOVER_PREVIEW_CACHE_MAX_ENTRIES;
export const TMDB_NETWORK_PREVIEW_REQUEST_TIMEOUT_MS = TMDB_DISCOVER_PREVIEW_REQUEST_TIMEOUT_MS;
export const TMDB_NETWORK_PREVIEW_LOCAL_MOCK = typeof __TMDB_NETWORK_MOCK_COUNTS__ === "boolean"
	? __TMDB_NETWORK_MOCK_COUNTS__
	: false;

function providerError(kind, message, { status = 0, retryable = true } = {}) {
	return Object.freeze({ ok: false, error: Object.freeze({ kind, message, status, retryable }) });
}

export function normalizeTmdbNetworkPreviewResponse(value) {
	return normalizeTmdbDiscoverPreviewResponse(value, "TV");
}

export function createTmdbNetworkPreviewProvider({
	fetchImpl,
	baseUrl = TMDB_PROXY_BASE_URL,
	timeoutMs = TMDB_NETWORK_PREVIEW_REQUEST_TIMEOUT_MS,
	cacheTtlMs = TMDB_NETWORK_PREVIEW_CACHE_TTL_MS,
	cacheMaxEntries = TMDB_NETWORK_PREVIEW_CACHE_MAX_ENTRIES,
	now = Date.now,
} = {}) {
	const requester = createTmdbDiscoverPreviewRequester({
		fetchImpl,
		baseUrl,
		queryParameter: "with_networks",
		previewPaths: Object.freeze({ TV: "/builder/discover/tv" }),
		entityLabel: "Network",
		entityType: "NETWORK",
		forceProxy: TMDB_NETWORK_PREVIEW_LOCAL_MOCK,
		timeoutMs,
		cacheTtlMs,
		cacheMaxEntries,
		now,
	});

	async function getNetworkPreview(networkId, { mediaType = "TV", sortOptionId, sortBy = null, filters = {}, signal } = {}) {
		if (!Number.isSafeInteger(networkId) || networkId < 1 || mediaType !== "TV") {
			return providerError("invalid-request", "Choose a valid Network and media preview.", { retryable: false });
		}
		const concreteSort = sortBy ?? networkSortValue(sortOptionId);
		if (!NETWORK_SORT_OPTIONS.some((option) => option.value === concreteSort)) {
			return providerError("invalid-request", "Choose a supported Network preview sort.", { retryable: false });
		}
		const query = networkPreviewQuery(networkId, { mediaType, sortBy: concreteSort, filters });
		return query ? requester.getQueryPreview(query.mediaType, query.queryParameters, { signal })
			: providerError("invalid-request", "These imported Network filters cannot be previewed exactly.", { retryable: false });
	}

	return Object.freeze({ getNetworkPreview });
}
