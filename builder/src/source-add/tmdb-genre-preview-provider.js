import {
	DISCOVER_CLASSIFICATIONS,
	discoverFilterDescriptor,
	discoverSortOptionId,
	inspectDiscoverSource,
} from "../nuvio/discover.js";
import { GENRE_ADVANCED_FILTER_FIELDS } from "./genre-advanced.js";
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

const ALLOWED_GENRE_FILTERS = new Set(["withGenres", ...GENRE_ADVANCED_FILTER_FIELDS]);

function providerError(kind, message, { status = 0, retryable = true } = {}) {
	return Object.freeze({ ok: false, error: Object.freeze({ kind, message, status, retryable }) });
}

function plainObject(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function canonicalPositiveSafeIntegerText(value) {
	if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return false;
	const number = Number(value);
	return Number.isSafeInteger(number) && String(number) === value;
}

function canonicalIdList(value) {
	if (typeof value !== "string" || !value) return false;
	const ids = value.split(",");
	return ids.every(canonicalPositiveSafeIntegerText) && new Set(ids).size === ids.length;
}

function canonicalDate(value) {
	if (typeof value !== "string") return false;
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!match || Number(match[1]) < 1000) return false;
	const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
	return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validGenreFilter(field, value) {
	if (field === "withGenres") return canonicalPositiveSafeIntegerText(value);
	if (field === "withoutGenres") return canonicalIdList(value);
	if (field === "releaseDateGte" || field === "releaseDateLte") return canonicalDate(value);
	if (field === "voteAverageGte" || field === "voteAverageLte") return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 10;
	if (field === "voteCountGte") return Number.isSafeInteger(value) && value >= 0;
	if (field === "withOriginalLanguage") return typeof value === "string" && /^[a-z]{2}$/.test(value);
	if (field === "withOriginCountry") return typeof value === "string" && /^[A-Z]{2}$/.test(value);
	return false;
}

export function genrePreviewQueryFromDraft(draft) {
	const source = draft?.editable;
	const inspected = inspectDiscoverSource(source);
	if (
		draft?.category !== "native-tmdb"
		|| inspected.classification !== DISCOVER_CLASSIFICATIONS.CANONICAL
		|| !plainObject(source?.filters)
		|| !canonicalPositiveSafeIntegerText(source.filters.withGenres)
		|| discoverSortOptionId(source.sortBy, source.mediaType) === null
	) return null;
	const entries = Object.entries(source.filters);
	if (entries.some(([field, value]) => !ALLOWED_GENRE_FILTERS.has(field) || !validGenreFilter(field, value))) return null;
	if (source.filters.withoutGenres?.split(",").includes(source.filters.withGenres)) return null;
	if (source.filters.releaseDateGte && source.filters.releaseDateLte && source.filters.releaseDateGte > source.filters.releaseDateLte) return null;
	if (source.filters.voteAverageGte !== undefined && source.filters.voteAverageLte !== undefined && source.filters.voteAverageGte > source.filters.voteAverageLte) return null;

	const queryParameters = { include_adult: "false", sort_by: source.sortBy };
	for (const [field, value] of entries) {
		const descriptor = discoverFilterDescriptor(field);
		const media = descriptor?.media?.[source.mediaType];
		if (!media?.applicable || !media.portable || typeof media.requestParameter !== "string") return null;
		queryParameters[media.requestParameter] = String(value);
	}
	return Object.freeze({
		mediaType: source.mediaType,
		queryParameters: Object.freeze(queryParameters),
	});
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
		previewPaths: Object.freeze({ MOVIE: "/3/discover/movie", TV: "/3/discover/tv" }),
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
