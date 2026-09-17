import { exactDiscoverPreviewQuery } from "./advanced-discover.js";
import { resolveEffectiveDiscoverSource } from "../nuvio/discover.js";
import { TMDB_PROXY_BASE_URL } from "./tmdb-collection-provider.js";
import {
	createTmdbDiscoverPreviewRequester,
	normalizeTmdbDiscoverPreviewResponse,
	TMDB_DISCOVER_PREVIEW_CACHE_MAX_ENTRIES,
	TMDB_DISCOVER_PREVIEW_CACHE_TTL_MS,
	TMDB_DISCOVER_PREVIEW_REQUEST_TIMEOUT_MS,
} from "./tmdb-discover-preview-requester.js";

export const TMDB_STREAMING_PREVIEW_CACHE_TTL_MS = TMDB_DISCOVER_PREVIEW_CACHE_TTL_MS;
export const TMDB_STREAMING_PREVIEW_CACHE_MAX_ENTRIES = TMDB_DISCOVER_PREVIEW_CACHE_MAX_ENTRIES;
export const TMDB_STREAMING_PREVIEW_REQUEST_TIMEOUT_MS = TMDB_DISCOVER_PREVIEW_REQUEST_TIMEOUT_MS;

function providerError(kind, message, { status = 0, retryable = true } = {}) {
	return Object.freeze({ ok: false, error: Object.freeze({ kind, message, status, retryable }) });
}

export function streamingPreviewQueryFromSource(sourceNode) {
 const effective = resolveEffectiveDiscoverSource(sourceNode);
 if (!effective.ok || !/^[1-9]\d*$/.test(effective.value.filters?.withWatchProviders) || !/^[A-Z]{2}$/.test(effective.value.filters?.watchRegion)) return null;
 return exactDiscoverPreviewQuery({ category: sourceNode.category, editable: effective.value });
}

export function normalizeTmdbStreamingPreviewResponse(value, mediaType) {
	return normalizeTmdbDiscoverPreviewResponse(value, mediaType);
}

export function createTmdbStreamingPreviewProvider({
	fetchImpl,
	baseUrl = TMDB_PROXY_BASE_URL,
	timeoutMs = TMDB_STREAMING_PREVIEW_REQUEST_TIMEOUT_MS,
	cacheTtlMs = TMDB_STREAMING_PREVIEW_CACHE_TTL_MS,
	cacheMaxEntries = TMDB_STREAMING_PREVIEW_CACHE_MAX_ENTRIES,
	now = Date.now,
} = {}) {
	const requester = createTmdbDiscoverPreviewRequester({
		fetchImpl,
		baseUrl,
		previewPaths: Object.freeze({ MOVIE: "/builder/discover/movie", TV: "/builder/discover/tv" }),
		entityLabel: "Streaming",
		entityType: "STREAMING",
		timeoutMs,
		cacheTtlMs,
		cacheMaxEntries,
		now,
	});

	async function getStreamingPreview(sourceNode, { signal } = {}) {
		const query = streamingPreviewQueryFromSource(sourceNode);
		if (query === null) return providerError("invalid-request", "Choose a supported Streaming sort to preview titles.", { retryable: false });
		return requester.getQueryPreview(query.mediaType, query.queryParameters, { signal });
	}

	return Object.freeze({ getStreamingPreview });
}
