import { parseCanonicalHttpsOrigin } from "../../worker-origin.js";
import { cloneResponseData, createBoundedResponseCache } from "./bounded-response-cache.js";
import { createTmdbLocalPreviewFetch } from "./tmdb-local-preview-proxy.js";
import { normalizeTmdbPosterPath } from "./tmdb-image.js";

export const TMDB_DISCOVER_PREVIEW_CACHE_TTL_MS = 5 * 60 * 1000;
export const TMDB_DISCOVER_PREVIEW_CACHE_MAX_ENTRIES = 40;
export const TMDB_DISCOVER_PREVIEW_REQUEST_TIMEOUT_MS = 12_000;

function plainObject(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function providerError(kind, message, { status = 0, retryable = true } = {}) {
	return Object.freeze({ ok: false, error: Object.freeze({ kind, message, status, retryable }) });
}

function normalizedText(value) {
	return typeof value === "string" ? value.trim() : "";
}

function canonicalQueryEntries(value) {
	if (!plainObject(value) || Object.keys(value).length === 0) return null;
	const entries = [];
	for (const [key, suppliedValue] of Object.entries(value).sort(([left], [right]) => left.localeCompare(right))) {
		if (!/^[a-z][a-z0-9_.]*$/.test(key)) return null;
		if (
			(typeof suppliedValue !== "string" && typeof suppliedValue !== "number")
			|| (typeof suppliedValue === "number" && !Number.isFinite(suppliedValue))
		) return null;
		const normalizedValue = String(suppliedValue);
		if (!normalizedValue || normalizedValue !== normalizedValue.trim()) return null;
		entries.push(Object.freeze([key, normalizedValue]));
	}
	return Object.freeze(entries);
}

function queryIdentity(entries) {
	const parameters = new URLSearchParams();
	for (const [key, value] of entries) parameters.set(key, value);
	return parameters.toString();
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

export function normalizeTmdbDiscoverPreviewResponse(value, mediaType) {
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

export function createTmdbDiscoverPreviewRequester({
	fetchImpl,
	baseUrl,
	queryParameter,
	previewPaths,
	entityLabel,
	entityType,
	forceProxy = false,
	timeoutMs = TMDB_DISCOVER_PREVIEW_REQUEST_TIMEOUT_MS,
	cacheTtlMs = TMDB_DISCOVER_PREVIEW_CACHE_TTL_MS,
	cacheMaxEntries = TMDB_DISCOVER_PREVIEW_CACHE_MAX_ENTRIES,
	now = Date.now,
} = {}) {
	if (fetchImpl !== undefined && typeof fetchImpl !== "function") throw new TypeError("A fetch implementation is required.");
	if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new TypeError("The TMDB request timeout must be positive.");
	if (queryParameter !== undefined && (typeof queryParameter !== "string" || !queryParameter)) throw new TypeError("A TMDB Discover query parameter must be a nonempty string when supplied.");
	if (!plainObject(previewPaths) || Object.keys(previewPaths).length === 0) throw new TypeError("TMDB Discover preview paths are required.");
	if (typeof entityLabel !== "string" || !entityLabel) throw new TypeError("A TMDB preview entity label is required.");
	if (typeof entityType !== "string" || !entityType) throw new TypeError("A TMDB preview entity type is required.");
	const workerBaseUrl = configuredBaseUrl(baseUrl);
	const requestFetch = fetchImpl === undefined
		? createTmdbLocalPreviewFetch({ workerBaseUrl: workerBaseUrl.origin, forceProxy })
		: fetchImpl;
	const cache = createBoundedResponseCache({ ttlMs: cacheTtlMs, maxEntries: cacheMaxEntries, now });

	async function requestPreview(mediaType, queryEntries, cacheKey, { signal } = {}) {
		if (signal?.aborted) return providerError("aborted", `The superseded ${entityLabel} preview was cancelled.`, { retryable: false });
		const cached = cache.get(cacheKey);
		if (cached !== null) return Object.freeze({ ok: true, data: cached, fromCache: true });

		const url = new URL(previewPaths[mediaType], workerBaseUrl);
		for (const [key, value] of queryEntries) url.searchParams.set(key, value);
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
			if (signal?.aborted) return providerError("aborted", `The superseded ${entityLabel} preview was cancelled.`, { retryable: false });
			if (timeoutTriggered) return providerError("timeout", "TMDB took too long to prepare this preview. Try again.");
			return providerError("network", "TMDB could not be reached. Check your connection and try again.");
		}
		clearTimeout(timeout);
		unlink();
		if (controller.signal.aborted) return providerError("aborted", `The superseded ${entityLabel} preview was cancelled.`, { retryable: false });
		if (response.status === 429) return providerError("rate-limit", "TMDB is receiving too many requests. Wait a moment and try again.", { status: 429 });
		if (!response.ok) return providerError("provider", `TMDB could not prepare this ${entityLabel} preview. Try again.`, { status: response.status });
		const contentType = response.headers?.get?.("content-type");
		if (contentType && !contentType.toLowerCase().includes("application/json")) return providerError("invalid-response", `TMDB returned an unexpected ${entityLabel} preview. Try again.`);
		let value;
		try { value = await response.json(); } catch {
			if (signal?.aborted || controller.signal.aborted) return providerError("aborted", `The superseded ${entityLabel} preview was cancelled.`, { retryable: false });
			return providerError("invalid-response", `TMDB returned an unexpected ${entityLabel} preview. Try again.`);
		}
		if (signal?.aborted || controller.signal.aborted) return providerError("aborted", `The superseded ${entityLabel} preview was cancelled.`, { retryable: false });
		const data = normalizeTmdbDiscoverPreviewResponse(value, mediaType);
		if (data === null) return providerError("invalid-response", `TMDB returned an unexpected ${entityLabel} preview. Try again.`);
		cache.set(cacheKey, data);
		return Object.freeze({ ok: true, data: cloneResponseData(data), fromCache: false });
	}

	async function getPreview(entityId, mediaType, sortBy, { signal } = {}) {
		if (
			typeof queryParameter !== "string"
			|| !queryParameter
			|| !Number.isSafeInteger(entityId)
			|| entityId < 1
			|| typeof previewPaths[mediaType] !== "string"
			|| typeof sortBy !== "string"
			|| !sortBy
		) {
			return providerError("invalid-request", `Choose a valid ${entityLabel} and media preview.`, { retryable: false });
		}
		const entries = Object.freeze([
			Object.freeze([queryParameter, String(entityId)]),
			Object.freeze(["sort_by", sortBy]),
		]);
		const cacheKey = `${entityType}:${entityId}:${mediaType}:${sortBy}`;
		return requestPreview(mediaType, entries, cacheKey, { signal });
	}

	async function getQueryPreview(mediaType, queryParameters, { signal } = {}) {
		const entries = canonicalQueryEntries(queryParameters);
		if (typeof previewPaths[mediaType] !== "string" || entries === null) {
			return providerError("invalid-request", `Choose a valid ${entityLabel} and media preview.`, { retryable: false });
		}
		return requestPreview(mediaType, entries, `${entityType}:${mediaType}:${queryIdentity(entries)}`, { signal });
	}

	return Object.freeze({ getPreview, getQueryPreview });
}
