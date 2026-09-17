import { exactDiscoverPreviewQuery } from "./advanced-discover.js";
import { TMDB_PROXY_BASE_URL } from "./tmdb-collection-provider.js";
import {
	createTmdbDiscoverPreviewRequester,
	normalizeTmdbDiscoverPreviewResponse,
	TMDB_DISCOVER_PREVIEW_CACHE_MAX_ENTRIES,
	TMDB_DISCOVER_PREVIEW_CACHE_TTL_MS,
	TMDB_DISCOVER_PREVIEW_REQUEST_TIMEOUT_MS,
} from "./tmdb-discover-preview-requester.js";

export const TMDB_GENRE_PREVIEW_CACHE_TTL_MS = TMDB_DISCOVER_PREVIEW_CACHE_TTL_MS;
export const TMDB_GENRE_PREVIEW_CACHE_MAX_ENTRIES = TMDB_DISCOVER_PREVIEW_CACHE_MAX_ENTRIES;
export const TMDB_GENRE_PREVIEW_REQUEST_TIMEOUT_MS = TMDB_DISCOVER_PREVIEW_REQUEST_TIMEOUT_MS;

function providerError(kind, message, { status = 0, retryable = true } = {}) {
	return Object.freeze({ ok: false, error: Object.freeze({ kind, message, status, retryable }) });
}

function canonicalPositiveSafeIntegerText(value) {
	if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return false;
	const number = Number(value);
	return Number.isSafeInteger(number) && String(number) === value;
}

export function genrePreviewQueryFromDraft(draft) {
 const source = draft?.editable;
 if (!canonicalPositiveSafeIntegerText(source?.filters?.withGenres)) return null;
 return exactDiscoverPreviewQuery(draft);
}

export function normalizeTmdbGenrePreviewResponse(value, mediaType) {
	return normalizeTmdbDiscoverPreviewResponse(value, mediaType);
}

export function createTmdbGenrePreviewProvider({
	fetchImpl,
	baseUrl = TMDB_PROXY_BASE_URL,
	timeoutMs = TMDB_GENRE_PREVIEW_REQUEST_TIMEOUT_MS,
	cacheTtlMs = TMDB_GENRE_PREVIEW_CACHE_TTL_MS,
	cacheMaxEntries = TMDB_GENRE_PREVIEW_CACHE_MAX_ENTRIES,
	now = Date.now,
} = {}) {
	const requester = createTmdbDiscoverPreviewRequester({
		fetchImpl,
		baseUrl,
		queryParameter: "with_genres",
		previewPaths: Object.freeze({ MOVIE: "/builder/discover/movie", TV: "/builder/discover/tv" }),
		entityLabel: "Genre",
		entityType: "GENRE",
		timeoutMs,
		cacheTtlMs,
		cacheMaxEntries,
		now,
	});

	async function getGenrePreview(sourceDraft, { signal } = {}) {
		const query = genrePreviewQueryFromDraft(sourceDraft);
		if (query === null) return providerError("invalid-request", "Review the current Genre configuration before previewing titles.", { retryable: false });
		return requester.getQueryPreview(query.mediaType, query.queryParameters, { signal });
	}

	return Object.freeze({ getGenrePreview });
}
