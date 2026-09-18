import { exactDiscoverPreviewQuery } from "./advanced-discover.js";
import { classifyCanonicalDecadePeriod } from "./decades-catalogue.js";
import { TMDB_PROXY_BASE_URL } from "./tmdb-collection-provider.js";
import {
	createTmdbDiscoverPreviewRequester,
	normalizeTmdbDiscoverPreviewResponse,
	TMDB_DISCOVER_PREVIEW_CACHE_MAX_ENTRIES,
	TMDB_DISCOVER_PREVIEW_CACHE_TTL_MS,
	TMDB_DISCOVER_PREVIEW_REQUEST_TIMEOUT_MS,
} from "./tmdb-discover-preview-requester.js";

export const TMDB_DECADES_PREVIEW_CACHE_TTL_MS = TMDB_DISCOVER_PREVIEW_CACHE_TTL_MS;
export const TMDB_DECADES_PREVIEW_CACHE_MAX_ENTRIES = TMDB_DISCOVER_PREVIEW_CACHE_MAX_ENTRIES;
export const TMDB_DECADES_PREVIEW_REQUEST_TIMEOUT_MS = TMDB_DISCOVER_PREVIEW_REQUEST_TIMEOUT_MS;

function providerError(kind, message, { status = 0, retryable = true } = {}) {
	return Object.freeze({ ok: false, error: Object.freeze({ kind, message, status, retryable }) });
}

export function decadePreviewQueryFromDraft(draft) {
 if (!classifyCanonicalDecadePeriod(draft?.editable?.filters ?? {})) return null;
 return exactDiscoverPreviewQuery(draft);
}

export function normalizeTmdbDecadesPreviewResponse(value, mediaType) {
	return normalizeTmdbDiscoverPreviewResponse(value, mediaType);
}

export function createTmdbDecadesPreviewProvider({
	fetchImpl,
	baseUrl = TMDB_PROXY_BASE_URL,
	timeoutMs = TMDB_DECADES_PREVIEW_REQUEST_TIMEOUT_MS,
	cacheTtlMs = TMDB_DECADES_PREVIEW_CACHE_TTL_MS,
	cacheMaxEntries = TMDB_DECADES_PREVIEW_CACHE_MAX_ENTRIES,
	now = Date.now,
} = {}) {
	const requester = createTmdbDiscoverPreviewRequester({
		fetchImpl,
		baseUrl,
		previewPaths: Object.freeze({ MOVIE: "/builder/discover/movie", TV: "/builder/discover/tv" }),
		entityLabel: "Decade",
		entityType: "DECADE",
		timeoutMs,
		cacheTtlMs,
		cacheMaxEntries,
		now,
	});

	async function getDecadePreview(sourceDraft, { signal } = {}) {
		const query = decadePreviewQueryFromDraft(sourceDraft);
		if (query === null) return providerError("invalid-request", "Review the current Decade configuration before previewing titles.", { retryable: false });
		return requester.getQueryPreview(query.mediaType, query.queryParameters, { signal });
	}

	async function getDecadeSample(sourceDrafts, { signal } = {}) {
		if (!Array.isArray(sourceDrafts) || sourceDrafts.length < 1 || sourceDrafts.length > 10) {
			return providerError("invalid-request", "Review the current Decade sample before previewing titles.", { retryable: false });
		}
		const queries = sourceDrafts.map(decadePreviewQueryFromDraft);
		const mediaType = queries[0]?.mediaType;
		if (mediaType === undefined || queries.some((query) => query === null || query.mediaType !== mediaType)) {
			return providerError("invalid-request", "Review the current Decade sample before previewing titles.", { retryable: false });
		}
		const outcomes = await Promise.all(queries.map((query) => requester.getQueryPreview(
			query.mediaType,
			query.queryParameters,
			{ signal, paging: false },
		)));
		const failure = outcomes.find((outcome) => !outcome.ok);
		if (failure) return failure;
		const results = outcomes
			.map((outcome) => outcome.data.results.find((item) => item.posterPath !== null) ?? null)
			.filter((item) => item !== null);
		return Object.freeze({
			ok: true,
			data: Object.freeze({
				totalResults: results.length,
				mediaType,
				results: Object.freeze(results),
			}),
			fromCache: outcomes.every((outcome) => outcome.fromCache === true),
		});
	}

	return Object.freeze({ getDecadePreview, getDecadeSample });
}
