import { studioSortValue, STUDIO_SORT_OPTIONS } from "./studio-source.js";
import { TMDB_PROXY_BASE_URL } from "./tmdb-collection-provider.js";
import {
	createTmdbDiscoverPreviewRequester,
	normalizeTmdbDiscoverPreviewResponse,
	TMDB_DISCOVER_PREVIEW_CACHE_MAX_ENTRIES,
	TMDB_DISCOVER_PREVIEW_CACHE_TTL_MS,
	TMDB_DISCOVER_PREVIEW_REQUEST_TIMEOUT_MS,
} from "./tmdb-discover-preview-requester.js";

export const TMDB_STUDIO_PREVIEW_CACHE_TTL_MS = TMDB_DISCOVER_PREVIEW_CACHE_TTL_MS;
export const TMDB_STUDIO_PREVIEW_CACHE_MAX_ENTRIES = TMDB_DISCOVER_PREVIEW_CACHE_MAX_ENTRIES;
export const TMDB_STUDIO_PREVIEW_REQUEST_TIMEOUT_MS = TMDB_DISCOVER_PREVIEW_REQUEST_TIMEOUT_MS;
export const TMDB_STUDIO_PREVIEW_LOCAL_MOCK = typeof __TMDB_STUDIO_MOCK_COUNTS__ === "boolean"
	? __TMDB_STUDIO_MOCK_COUNTS__
	: false;

function providerError(kind, message, { status = 0, retryable = true } = {}) {
	return Object.freeze({ ok: false, error: Object.freeze({ kind, message, status, retryable }) });
}

export function normalizeTmdbStudioPreviewResponse(value, mediaType) {
	return normalizeTmdbDiscoverPreviewResponse(value, mediaType);
}

export function createTmdbStudioPreviewProvider({
	fetchImpl,
	baseUrl = TMDB_PROXY_BASE_URL,
	timeoutMs = TMDB_STUDIO_PREVIEW_REQUEST_TIMEOUT_MS,
	cacheTtlMs = TMDB_STUDIO_PREVIEW_CACHE_TTL_MS,
	cacheMaxEntries = TMDB_STUDIO_PREVIEW_CACHE_MAX_ENTRIES,
	now = Date.now,
} = {}) {
	const requester = createTmdbDiscoverPreviewRequester({
		fetchImpl,
		baseUrl,
		queryParameter: "with_companies",
		previewPaths: Object.freeze({ MOVIE: "/3/discover/movie", TV: "/3/discover/tv" }),
		entityLabel: "Studio",
		entityType: "COMPANY",
		forceProxy: TMDB_STUDIO_PREVIEW_LOCAL_MOCK,
		timeoutMs,
		cacheTtlMs,
		cacheMaxEntries,
		now,
	});

	async function getStudioPreview(studioId, { mediaType, sortOptionId, sortBy = null, signal } = {}) {
		if (!Number.isSafeInteger(studioId) || studioId < 1 || !["MOVIE", "TV"].includes(mediaType)) {
			return providerError("invalid-request", "Choose a valid Studio and media preview.", { retryable: false });
		}
		const concreteSort = sortBy ?? studioSortValue(sortOptionId, mediaType);
		if (!STUDIO_SORT_OPTIONS.some((option) => option.values[mediaType] === concreteSort)) {
			return providerError("invalid-request", "Choose a supported Studio preview sort.", { retryable: false });
		}
		return requester.getPreview(studioId, mediaType, concreteSort, { signal });
	}

	return Object.freeze({ getStudioPreview });
}
