import { parseCanonicalHttpsOrigin } from "../../worker-origin.js";
import { createPreviewPageCache, pagedTitlePreview } from "./preview-page-cache.js";
import { previewPagination } from "./title-preview-results.js";
import { buildTmdbListTitlePreview, tmdbListEditSortOptionId } from "./tmdb-list-source.js";
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
	// Optional ordering metadata must not turn a valid List sample into a request error.
	const ordering = {
		voteAverage: Number.isFinite(item.vote_average) && item.vote_average >= 0 && item.vote_average <= 10 ? item.vote_average : null,
		voteCount: Number.isSafeInteger(item.vote_count) && item.vote_count >= 0 ? item.vote_count : null,
	};
	if (item.media_type === "movie") {
		const title = text(item.title) || text(item.original_title);
		return title ? Object.freeze({ id: item.id, title, date: text(item.release_date) || null, releaseYear: year(item.release_date), posterPath: normalizeTmdbPosterPath(item.poster_path), mediaType: "MOVIE", position, ...ordering }) : null;
	}
	if (item.media_type === "tv") {
		const title = text(item.name) || text(item.original_name);
		return title ? Object.freeze({ id: item.id, title, date: text(item.first_air_date) || null, releaseYear: year(item.first_air_date), posterPath: normalizeTmdbPosterPath(item.poster_path), mediaType: "TV", position, ...ordering }) : null;
	}
	return null;
}

export function normalizeTmdbListResponse(value, expectedId = null, expectedPage = 1) {
	if (!plainObject(value) || !isCanonicalTmdbListId(value.id) || (expectedId !== null && value.id !== expectedId) || !Array.isArray(value.items)) return null;
	const itemCount = Number.isSafeInteger(value.item_count) && value.item_count >= 0 ? value.item_count : null;
	if (value.item_count != null && itemCount === null) return null;
	const items = value.items.map(normalizeItem);
	const pagination = previewPagination(value, expectedPage);
	if (pagination === null || items.some((item) => item === null)) return null;
	if (value.total_results != null && (!Number.isSafeInteger(value.total_results) || value.total_results < 0)) return null;
	return Object.freeze({
		id: value.id,
		name: text(value.name),
		description: text(value.description),
		itemCount,
		creator: normalizeCreator(value.created_by),
		posterPath: normalizeTmdbPosterPath(value.poster_path),
		items: Object.freeze(items),
		...pagination,
		...(value.total_results != null ? { reportedTotal: value.total_results } : {}),
	});
}

function configuredBaseUrl(value) {
	let url;
	try { url = parseCanonicalHttpsOrigin(value); } catch { url = null; }
	if (url === null) throw new TypeError("The TMDB Worker base URL must be an absolute HTTPS origin.");
	return url;
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
	const cache = createPreviewPageCache({ ttlMs: cacheTtlMs, maxEntries: cacheMaxEntries, now });

	async function load(id, page, signal) {
		const url = new URL(`/3/list/${id}`, workerBaseUrl);
		url.searchParams.set("language", "en-US");
		url.searchParams.set("page", String(page));
		const controller = new AbortController();
		const abort = () => controller.abort();
		if (signal.aborted) controller.abort();
		else signal.addEventListener("abort", abort, { once: true });
		let timedOut = false;
		const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
		let readingBody = false;
		try {
			const response = await requestFetch(url.toString(), { method: "GET", headers: { Accept: "application/json" }, signal: controller.signal });
			if ([401, 403, 404].includes(response.status)) return failure("not-found", "This TMDB list could not be found or accessed. Check that it is public.", response.status, false);
			if (response.status === 429) return failure("rate-limit", "TMDB is receiving too many requests. Wait a moment and try again.", 429);
			if (!response.ok) return failure("provider", "TMDB could not complete this list request. Try again.", response.status);
			const contentType = response.headers?.get?.("content-type");
			if (contentType && !contentType.toLowerCase().includes("application/json")) return failure("invalid-response", "TMDB returned an unexpected list response. Try again.");
			readingBody = true;
			const value = await response.json();
			if (timedOut) return failure("timeout", "TMDB took too long to respond. Try again.");
			if (signal.aborted) return failure("aborted", "The superseded TMDB request was cancelled.", 0, false);
			const data = normalizeTmdbListResponse(value, id, page);
			if (data === null) return failure("invalid-response", "TMDB returned incomplete or unsupported list metadata. Try again.");
			return Object.freeze({ ok: true, data, fromCache: false });
		} catch {
			if (signal.aborted) return failure("aborted", "The superseded TMDB request was cancelled.", 0, false);
			if (timedOut) return failure("timeout", "TMDB took too long to respond. Try again.");
			return readingBody ? failure("invalid-response", "TMDB returned an unexpected list response. Try again.") : failure("network", "TMDB could not be reached. Check your connection and try again.");
		} finally { clearTimeout(timeout); signal.removeEventListener("abort", abort); }
	}

	function open(id, { signal } = {}) {
		if (!isCanonicalTmdbListId(id)) return Promise.resolve(failure("invalid-request", "TMDB list IDs must be positive 32-bit integers.", 0, false));
		return cache.open(`list:${id}`, (page, requestSignal) => load(id, page, requestSignal), { signal });
	}
	async function getList(id, options) {
		const { chain: _chain, ...result } = await open(id, options);
		return result;
	}
	async function getListPreview(id, { sortBy, signal } = {}) {
		const result = await open(id, { signal });
		if (!result.ok) return result;
		const project = (page) => ({
			...buildTmdbListTitlePreview(page, sortBy), page: page.page, totalPages: page.totalPages,
			totalResults: page.reportedTotal != null && page.reportedTotal !== page.itemCount ? null : page.itemCount,
		});
		return { ok: true, fromCache: result.fromCache, data: pagedTitlePreview(result.chain, project, { paging: tmdbListEditSortOptionId(sortBy ?? "original") !== null }) };
	}
	return Object.freeze({ getList, getListPreview });
}
