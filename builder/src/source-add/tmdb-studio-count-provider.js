import { parseCanonicalHttpsOrigin } from "../../worker-origin.js";
import { createTmdbLocalPreviewFetch } from "./tmdb-local-preview-proxy.js";

export const TMDB_STUDIO_COUNT_CACHE_TTL_MS = 5 * 60 * 1000;
export const TMDB_STUDIO_COUNT_CACHE_MAX_ENTRIES = 40;
export const TMDB_STUDIO_COUNT_REQUEST_TIMEOUT_MS = 12_000;
export const TMDB_STUDIO_COUNT_PROXY_BASE_URL = typeof __TMDB_PROXY_BASE_URL__ === "string"
	? __TMDB_PROXY_BASE_URL__
	: null;
export const TMDB_STUDIO_COUNT_LOCAL_MOCK = typeof __TMDB_STUDIO_MOCK_COUNTS__ === "boolean"
	? __TMDB_STUDIO_MOCK_COUNTS__
	: false;

function positiveStudioId(value) {
	return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function providerError(kind, message, { status = 0, retryable = true } = {}) {
	return { ok: false, error: { kind, message, status, retryable } };
}

function unavailable(error = null) {
	return Object.freeze({
		status: "unavailable",
		count: null,
		error: Object.freeze({
			message: "Current count unavailable",
			retryable: error?.retryable !== false,
		}),
	});
}

function configuredBaseUrl(value) {
	if (typeof value !== "string" || !value.trim()) {
		throw new TypeError("A TMDB Worker base URL is required.");
	}
	let url;
	try {
		url = parseCanonicalHttpsOrigin(value);
	} catch {
		throw new TypeError("The TMDB Worker base URL must be an absolute HTTPS origin.");
	}
	if (url === null) throw new TypeError("The TMDB Worker base URL must be an absolute HTTPS origin.");
	return url;
}

function linkAbortSignal(signal, controller) {
	if (!signal) return () => {};
	const abort = () => controller.abort();
	if (signal.aborted) {
		abort();
		return () => {};
	}
	signal.addEventListener("abort", abort, { once: true });
	return () => signal.removeEventListener("abort", abort);
}

export function normalizeTmdbStudioCountResponse(value) {
	if (
		value === null
		|| typeof value !== "object"
		|| Array.isArray(value)
		|| !Number.isSafeInteger(value.total_results)
		|| value.total_results < 0
	) return null;
	return value.total_results;
}

export function createTmdbStudioCountProvider({
	fetchImpl,
	baseUrl = TMDB_STUDIO_COUNT_PROXY_BASE_URL,
	timeoutMs = TMDB_STUDIO_COUNT_REQUEST_TIMEOUT_MS,
	cacheTtlMs = TMDB_STUDIO_COUNT_CACHE_TTL_MS,
	cacheMaxEntries = TMDB_STUDIO_COUNT_CACHE_MAX_ENTRIES,
	now = Date.now,
} = {}) {
	if (fetchImpl !== undefined && typeof fetchImpl !== "function") throw new TypeError("A fetch implementation is required.");
	if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new TypeError("The TMDB request timeout must be positive.");
	if (!Number.isFinite(cacheTtlMs) || cacheTtlMs < 0) throw new TypeError("The TMDB response cache lifetime cannot be negative.");
	if (!Number.isInteger(cacheMaxEntries) || cacheMaxEntries <= 0) throw new TypeError("The TMDB response cache size must be a positive integer.");
	if (typeof now !== "function") throw new TypeError("The TMDB response clock must be a function.");

	const workerBaseUrl = configuredBaseUrl(baseUrl);
	const requestFetch = fetchImpl === undefined
		? createTmdbLocalPreviewFetch({
			workerBaseUrl: workerBaseUrl.origin,
			forceProxy: TMDB_STUDIO_COUNT_LOCAL_MOCK,
		})
		: fetchImpl;
	const cache = new Map();
	const countPaths = Object.freeze({
		movie: "/3/discover/movie",
		series: "/3/discover/tv",
	});

	function cacheGet(key, bypassCache) {
		if (bypassCache) return null;
		const entry = cache.get(key);
		if (!entry) return null;
		if (now() - entry.checkedAt > cacheTtlMs) {
			cache.delete(key);
			return null;
		}
		cache.delete(key);
		cache.set(key, entry);
		return Object.freeze({ status: "ready", count: entry.count, error: null, fromCache: true, checkedAt: entry.checkedAt });
	}

	function cacheSet(key, count, checkedAt) {
		cache.delete(key);
		cache.set(key, { count, checkedAt });
		while (cache.size > cacheMaxEntries) cache.delete(cache.keys().next().value);
	}

	async function requestCount(path, studioId, { signal, bypassCache }) {
		const cacheKey = `${path}:${studioId}`;
		const cached = cacheGet(cacheKey, bypassCache);
		if (cached !== null) return cached;
		const url = new URL(path, workerBaseUrl);
		url.searchParams.set("with_companies", String(studioId));
		const controller = new AbortController();
		const unlink = linkAbortSignal(signal, controller);
		let timeoutTriggered = false;
		const timeout = setTimeout(() => {
			timeoutTriggered = true;
			controller.abort();
		}, timeoutMs);

		let response;
		try {
			response = await requestFetch(url.toString(), {
				method: "GET",
				headers: { Accept: "application/json" },
				signal: controller.signal,
			});
		} catch {
			clearTimeout(timeout);
			unlink();
			if (signal?.aborted) return providerError("aborted", "The superseded Studio count request was cancelled.", { retryable: false });
			if (timeoutTriggered) return providerError("timeout", "Current count unavailable");
			return providerError("network", "Current count unavailable");
		}
		if (!response.ok) {
			clearTimeout(timeout);
			unlink();
			return providerError(response.status === 429 ? "rate-limit" : "provider", "Current count unavailable", { status: response.status });
		}
		let value;
		try {
			value = await response.json();
		} catch {
			clearTimeout(timeout);
			unlink();
			if (timeoutTriggered) return providerError("timeout", "Current count unavailable");
			return providerError("invalid-response", "Current count unavailable");
		}
		clearTimeout(timeout);
		unlink();
		if (controller.signal.aborted) return providerError("aborted", "The superseded Studio count request was cancelled.", { retryable: false });
		const count = normalizeTmdbStudioCountResponse(value);
		if (count === null) return providerError("invalid-response", "Current count unavailable");
		const checkedAt = now();
		cacheSet(cacheKey, count, checkedAt);
		return Object.freeze({ status: "ready", count, error: null, fromCache: false, checkedAt });
	}

	async function getStudioCount(studioId, countKey, { signal, bypassCache = false } = {}) {
		if (!positiveStudioId(studioId)) {
			return providerError("invalid-request", "TMDB studio IDs must be positive safe integers.", { retryable: false });
		}
		const path = countPaths[countKey];
		if (!path) return providerError("invalid-request", "Choose a supported Studio count dimension.", { retryable: false });
		const result = await requestCount(path, studioId, { signal, bypassCache });
		if (signal?.aborted || result?.error?.kind === "aborted") {
			return providerError("aborted", "The superseded Studio count request was cancelled.", { retryable: false });
		}
		return {
			ok: true,
			data: result?.status === "ready" ? result : unavailable(result?.error),
			checkedAt: now(),
		};
	}

	async function getStudioCounts(studioId, { signal, bypassCache = false } = {}) {
		if (!positiveStudioId(studioId)) {
			return providerError("invalid-request", "TMDB studio IDs must be positive safe integers.", { retryable: false });
		}
		const [movieResult, seriesResult] = await Promise.all([
			getStudioCount(studioId, "movie", { signal, bypassCache }),
			getStudioCount(studioId, "series", { signal, bypassCache }),
		]);
		if (signal?.aborted) {
			return providerError("aborted", "The superseded Studio count request was cancelled.", { retryable: false });
		}
		return {
			ok: true,
			data: Object.freeze({
				movie: movieResult?.ok ? movieResult.data : unavailable(movieResult?.error),
				series: seriesResult?.ok ? seriesResult.data : unavailable(seriesResult?.error),
			}),
			checkedAt: now(),
		};
	}

	return Object.freeze({ getStudioCount, getStudioCounts });
}
