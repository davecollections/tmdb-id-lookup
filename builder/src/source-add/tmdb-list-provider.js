import { parseCanonicalHttpsOrigin } from "../../worker-origin.js";
import { cloneResponseData, createBoundedResponseCache } from "./bounded-response-cache.js";
import { createTmdbLocalPreviewFetch } from "./tmdb-local-preview-proxy.js";
import { normalizeTmdbPosterPath } from "./tmdb-image.js";
import { isCanonicalTmdbListId } from "./tmdb-list-input.js";

export const TMDB_LIST_CACHE_TTL_MS = 5 * 60 * 1000;
export const TMDB_LIST_CACHE_MAX_ENTRIES = 40;
export const TMDB_LIST_REQUEST_TIMEOUT_MS = 12_000;
export const TMDB_LIST_PROXY_BASE_URL = typeof __TMDB_PROXY_BASE_URL__ === "string" ? __TMDB_PROXY_BASE_URL__ : null;

function plainObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function text(value) { return typeof value === "string" ? value.trim() : ""; }
function year(value) {
	const match = typeof value === "string" ? /^(\d{4})(?:-\d{2}-\d{2})?$/.exec(value) : null;
	return match ? Number(match[1]) : null;
}
function failure(kind, message, status = 0, retryable = true) {
	return Object.freeze({ ok: false, error: Object.freeze({ kind, message, status, retryable }) });
}
function normalizeCreator(value) {
	if (typeof value === "string") return text(value) || null;
	if (!plainObject(value)) return null;
	return text(value.name) || text(value.username) || null;
}
function normalizeItem(item, position) {
	if (!plainObject(item) || !Number.isSafeInteger(item.id) || item.id <= 0) return null;
	if (item.media_type === "movie") {
		const title = text(item.title) || text(item.original_title);
		return title ? Object.freeze({ id: item.id, title, date: text(item.release_date) || null, releaseYear: year(item.release_date), posterPath: normalizeTmdbPosterPath(item.poster_path), mediaType: "MOVIE", position }) : null;
	}
	if (item.media_type === "tv") {
		const title = text(item.name) || text(item.original_name);
		return title ? Object.freeze({ id: item.id, title, date: text(item.first_air_date) || null, releaseYear: year(item.first_air_date), posterPath: normalizeTmdbPosterPath(item.poster_path), mediaType: "TV", position }) : null;
	}
	return null;
}

export function normalizeTmdbListResponse(value, expectedId = null) {
	if (!plainObject(value) || !isCanonicalTmdbListId(value.id) || (expectedId !== null && value.id !== expectedId) || !Array.isArray(value.items)) return null;
	const itemCount = Number.isSafeInteger(value.item_count) && value.item_count >= 0 ? value.item_count : null;
	if (itemCount === null) return null;
	const items = value.items.map(normalizeItem);
	if (items.some((item) => item === null)) return null;
	return Object.freeze({
		id: value.id,
		name: text(value.name),
		description: text(value.description),
		itemCount,
		creator: normalizeCreator(value.created_by),
		posterPath: normalizeTmdbPosterPath(value.poster_path),
		items: Object.freeze(items),
	});
}

function configuredBaseUrl(value) {
	let url;
	try { url = parseCanonicalHttpsOrigin(value); } catch { url = null; }
	if (url === null) throw new TypeError("The TMDB Worker base URL must be an absolute HTTPS origin.");
	return url;
}

function waitForShared(promise, signal) {
	if (!signal) return promise;
	if (signal.aborted) return Promise.resolve(failure("aborted", "The superseded TMDB request was cancelled.", 0, false));
	return new Promise((resolve) => {
		const abort = () => resolve(failure("aborted", "The superseded TMDB request was cancelled.", 0, false));
		signal.addEventListener("abort", abort, { once: true });
		promise.then((result) => { signal.removeEventListener("abort", abort); resolve(result); });
	});
}

export function createTmdbListProvider({
	fetchImpl,
	baseUrl = TMDB_LIST_PROXY_BASE_URL,
	timeoutMs = TMDB_LIST_REQUEST_TIMEOUT_MS,
	cacheTtlMs = TMDB_LIST_CACHE_TTL_MS,
	cacheMaxEntries = TMDB_LIST_CACHE_MAX_ENTRIES,
	now = Date.now,
} = {}) {
	if (fetchImpl !== undefined && typeof fetchImpl !== "function") throw new TypeError("A fetch implementation is required.");
	if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new TypeError("The TMDB List request timeout must be positive.");
	if (!Number.isFinite(cacheTtlMs) || cacheTtlMs < 0) throw new TypeError("The TMDB List cache lifetime cannot be negative.");
	if (!Number.isInteger(cacheMaxEntries) || cacheMaxEntries <= 0) throw new TypeError("The TMDB List cache size must be a positive integer.");
	if (typeof now !== "function") throw new TypeError("The TMDB List cache clock must be a function.");
	const workerBaseUrl = configuredBaseUrl(baseUrl);
	const requestFetch = fetchImpl ?? createTmdbLocalPreviewFetch({ workerBaseUrl: workerBaseUrl.origin });
	const cache = createBoundedResponseCache({ ttlMs: cacheTtlMs, maxEntries: cacheMaxEntries, now });
	const inFlight = new Map();

	async function load(id) {
		const url = new URL(`/3/list/${id}`, workerBaseUrl);
		url.searchParams.set("language", "en-US");
		url.searchParams.set("page", "1");
		const controller = new AbortController();
		let timedOut = false;
		const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
		let response;
		try { response = await requestFetch(url.toString(), { method: "GET", headers: { Accept: "application/json" }, signal: controller.signal }); }
		catch { clearTimeout(timeout); return timedOut ? failure("timeout", "TMDB took too long to respond. Try again.") : failure("network", "TMDB could not be reached. Check your connection and try again."); }
		clearTimeout(timeout);
		if ([401, 403, 404].includes(response.status)) return failure("not-found", "This TMDB list could not be found or accessed. Check that it is public.", response.status, false);
		if (response.status === 429) return failure("rate-limit", "TMDB is receiving too many requests. Wait a moment and try again.", 429);
		if (!response.ok) return failure("provider", "TMDB could not complete this list request. Try again.", response.status);
		const contentType = response.headers?.get?.("content-type");
		if (contentType && !contentType.toLowerCase().includes("application/json")) return failure("invalid-response", "TMDB returned an unexpected list response. Try again.");
		let value;
		try { value = await response.json(); } catch { return failure("invalid-response", "TMDB returned an unexpected list response. Try again."); }
		const data = normalizeTmdbListResponse(value, id);
		if (data === null) return failure("invalid-response", "TMDB returned incomplete or unsupported list metadata. Try again.");
		cache.set(`list:${id}`, data);
		return Object.freeze({ ok: true, data: cloneResponseData(data), fromCache: false });
	}

	function getList(id, { signal } = {}) {
		if (!isCanonicalTmdbListId(id)) return Promise.resolve(failure("invalid-request", "TMDB list IDs must be positive 32-bit integers.", 0, false));
		const key = `list:${id}`;
		const cached = cache.get(key);
		if (cached !== null) return Promise.resolve(Object.freeze({ ok: true, data: cached, fromCache: true }));
		let shared = inFlight.get(key);
		if (!shared) {
			shared = load(id).finally(() => inFlight.delete(key));
			inFlight.set(key, shared);
		}
		const consumer = shared.then((result) => result.ok ? Object.freeze({ ...result, data: cloneResponseData(result.data) }) : result);
		return waitForShared(consumer, signal);
	}
	return Object.freeze({ getList });
}
