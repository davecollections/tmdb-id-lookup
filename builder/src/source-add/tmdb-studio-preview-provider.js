import { parseCanonicalHttpsOrigin } from "../../worker-origin.js";
import { cloneResponseData, createBoundedResponseCache } from "./bounded-response-cache.js";
import { studioSortValue, STUDIO_SORT_OPTIONS } from "./studio-source.js";
import { createTmdbLocalPreviewFetch } from "./tmdb-local-preview-proxy.js";
import { normalizeTmdbPosterPath } from "./tmdb-image.js";
import { TMDB_PROXY_BASE_URL } from "./tmdb-collection-provider.js";

export const TMDB_STUDIO_PREVIEW_CACHE_TTL_MS = 5 * 60 * 1000;
export const TMDB_STUDIO_PREVIEW_CACHE_MAX_ENTRIES = 40;
export const TMDB_STUDIO_PREVIEW_REQUEST_TIMEOUT_MS = 12_000;
export const TMDB_STUDIO_PREVIEW_LOCAL_MOCK = typeof __TMDB_STUDIO_MOCK_COUNTS__ === "boolean"
	? __TMDB_STUDIO_MOCK_COUNTS__
	: false;

function plainObject(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function providerError(kind, message, { status = 0, retryable = true } = {}) {
	return Object.freeze({ ok: false, error: Object.freeze({ kind, message, status, retryable }) });
}

function normalizedText(value) {
	return typeof value === "string" ? value.trim() : "";
}

function normalizeDate(value) {
	const date = normalizedText(value);
	return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function normalizePreviewItem(value, mediaType) {
	if (!plainObject(value) || !Number.isSafeInteger(value.id) || value.id < 1) return null;
	const title = mediaType === "MOVIE"
		? normalizedText(value.title) || normalizedText(value.original_title)
		: normalizedText(value.name) || normalizedText(value.original_name);
	if (!title) return null;
	const date = normalizeDate(mediaType === "MOVIE" ? value.release_date : value.first_air_date);
	return Object.freeze({
		id: value.id,
		title,
		date,
		year: date === null ? null : Number(date.slice(0, 4)),
		posterPath: normalizeTmdbPosterPath(value.poster_path),
		mediaType,
	});
}

export function normalizeTmdbStudioPreviewResponse(value, mediaType) {
	if (
		!plainObject(value)
		|| !["MOVIE", "TV"].includes(mediaType)
		|| !Number.isSafeInteger(value.total_results)
		|| value.total_results < 0
		|| !Array.isArray(value.results)
	) return null;
	const results = value.results.map((entry) => normalizePreviewItem(entry, mediaType));
	if (results.some((entry) => entry === null)) return null;
	return Object.freeze({ totalResults: value.total_results, mediaType, results: Object.freeze(results) });
}

function configuredBaseUrl(value) {
	if (typeof value !== "string" || value.trim().length === 0) throw new TypeError("A TMDB Worker base URL is required.");
	let url;
	try { url = parseCanonicalHttpsOrigin(value); } catch { throw new TypeError("The TMDB Worker base URL must be an absolute HTTPS origin."); }
	if (url === null) throw new TypeError("The TMDB Worker base URL must be an absolute HTTPS origin.");
	return url;
}

function linkAbortSignal(signal, controller) {
	if (!signal) return () => {};
	const abort = () => controller.abort();
	if (signal.aborted) abort();
	else signal.addEventListener("abort", abort, { once: true });
	return () => signal.removeEventListener("abort", abort);
}

export function createTmdbStudioPreviewProvider({
	fetchImpl,
	baseUrl = TMDB_PROXY_BASE_URL,
	timeoutMs = TMDB_STUDIO_PREVIEW_REQUEST_TIMEOUT_MS,
	cacheTtlMs = TMDB_STUDIO_PREVIEW_CACHE_TTL_MS,
	cacheMaxEntries = TMDB_STUDIO_PREVIEW_CACHE_MAX_ENTRIES,
	now = Date.now,
} = {}) {
	if (fetchImpl !== undefined && typeof fetchImpl !== "function") throw new TypeError("A fetch implementation is required.");
	if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new TypeError("The TMDB request timeout must be positive.");
	const workerBaseUrl = configuredBaseUrl(baseUrl);
	const requestFetch = fetchImpl === undefined
		? createTmdbLocalPreviewFetch({ workerBaseUrl: workerBaseUrl.origin, forceProxy: TMDB_STUDIO_PREVIEW_LOCAL_MOCK })
		: fetchImpl;
	const cache = createBoundedResponseCache({ ttlMs: cacheTtlMs, maxEntries: cacheMaxEntries, now });

	async function getStudioPreview(studioId, { mediaType, sortOptionId, sortBy = null, signal } = {}) {
		if (!Number.isSafeInteger(studioId) || studioId < 1 || !["MOVIE", "TV"].includes(mediaType)) {
			return providerError("invalid-request", "Choose a valid Studio and media preview.", { retryable: false });
		}
		const concreteSort = sortBy ?? studioSortValue(sortOptionId, mediaType);
		if (!STUDIO_SORT_OPTIONS.some((option) => option.values[mediaType] === concreteSort)) {
			return providerError("invalid-request", "Choose a supported Studio preview sort.", { retryable: false });
		}
		const cacheKey = `company:${studioId}:${mediaType}:${concreteSort}`;
		const cached = cache.get(cacheKey);
		if (cached !== null) return Object.freeze({ ok: true, data: cached, fromCache: true });

		const path = mediaType === "MOVIE" ? "/3/discover/movie" : "/3/discover/tv";
		const url = new URL(path, workerBaseUrl);
		url.searchParams.set("with_companies", String(studioId));
		url.searchParams.set("sort_by", concreteSort);
		const controller = new AbortController();
		const unlink = linkAbortSignal(signal, controller);
		let timeoutTriggered = false;
		const timeout = setTimeout(() => { timeoutTriggered = true; controller.abort(); }, timeoutMs);
		let response;
		try {
			response = await requestFetch(url.toString(), { method: "GET", headers: { Accept: "application/json" }, signal: controller.signal });
		} catch {
			clearTimeout(timeout);
			unlink();
			if (signal?.aborted) return providerError("aborted", "The superseded Studio preview was cancelled.", { retryable: false });
			if (timeoutTriggered) return providerError("timeout", "TMDB took too long to prepare this preview. Try again.");
			return providerError("network", "TMDB could not be reached. Check your connection and try again.");
		}
		clearTimeout(timeout);
		unlink();
		if (controller.signal.aborted) return providerError("aborted", "The superseded Studio preview was cancelled.", { retryable: false });
		if (response.status === 429) return providerError("rate-limit", "TMDB is receiving too many requests. Wait a moment and try again.", { status: 429 });
		if (!response.ok) return providerError("provider", "TMDB could not prepare this Studio preview. Try again.", { status: response.status });
		const contentType = response.headers?.get?.("content-type");
		if (contentType && !contentType.toLowerCase().includes("application/json")) return providerError("invalid-response", "TMDB returned an unexpected Studio preview. Try again.");
		let value;
		try { value = await response.json(); } catch { return providerError("invalid-response", "TMDB returned an unexpected Studio preview. Try again."); }
		const data = normalizeTmdbStudioPreviewResponse(value, mediaType);
		if (data === null) return providerError("invalid-response", "TMDB returned an unexpected Studio preview. Try again.");
		cache.set(cacheKey, data);
		return Object.freeze({ ok: true, data: cloneResponseData(data), fromCache: false });
	}

	return Object.freeze({ getStudioPreview });
}
