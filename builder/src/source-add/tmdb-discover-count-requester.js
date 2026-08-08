import { parseCanonicalHttpsOrigin } from "../../worker-origin.js";
import { createTmdbLocalPreviewFetch } from "./tmdb-local-preview-proxy.js";

export const TMDB_DISCOVER_COUNT_CACHE_TTL_MS = 5 * 60 * 1000;
export const TMDB_DISCOVER_COUNT_CACHE_MAX_ENTRIES = 40;
export const TMDB_DISCOVER_COUNT_REQUEST_TIMEOUT_MS = 12_000;

function providerError(kind, message, { status = 0, retryable = true } = {}) {
	return { ok: false, error: { kind, message, status, retryable } };
}

function configuredBaseUrl(value) {
	if (typeof value !== "string" || !value.trim()) throw new TypeError("A TMDB Worker base URL is required.");
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

export function normalizeTmdbDiscoverCountResponse(value) {
	if (
		value === null
		|| typeof value !== "object"
		|| Array.isArray(value)
		|| !Number.isSafeInteger(value.total_results)
		|| value.total_results < 0
	) return null;
	return value.total_results;
}

export function createTmdbDiscoverCountRequester({
	fetchImpl,
	baseUrl,
	queryParameter,
	countPaths,
	entityLabel,
	forceProxy = false,
	timeoutMs = TMDB_DISCOVER_COUNT_REQUEST_TIMEOUT_MS,
	cacheTtlMs = TMDB_DISCOVER_COUNT_CACHE_TTL_MS,
	cacheMaxEntries = TMDB_DISCOVER_COUNT_CACHE_MAX_ENTRIES,
	now = Date.now,
} = {}) {
	if (fetchImpl !== undefined && typeof fetchImpl !== "function") throw new TypeError("A fetch implementation is required.");
	if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new TypeError("The TMDB request timeout must be positive.");
	if (!Number.isFinite(cacheTtlMs) || cacheTtlMs < 0) throw new TypeError("The TMDB response cache lifetime cannot be negative.");
	if (!Number.isInteger(cacheMaxEntries) || cacheMaxEntries <= 0) throw new TypeError("The TMDB response cache size must be a positive integer.");
	if (typeof now !== "function") throw new TypeError("The TMDB response clock must be a function.");
	if (!["with_companies", "with_networks"].includes(queryParameter)) throw new TypeError("Choose a supported TMDB Discover entity parameter.");
	if (countPaths === null || typeof countPaths !== "object" || Array.isArray(countPaths)) throw new TypeError("TMDB Discover count paths are required.");
	for (const path of Object.values(countPaths)) {
		if (!["/3/discover/movie", "/3/discover/tv"].includes(path)) throw new TypeError("Choose a supported TMDB Discover count path.");
	}

	const workerBaseUrl = configuredBaseUrl(baseUrl);
	const requestFetch = fetchImpl === undefined
		? createTmdbLocalPreviewFetch({ workerBaseUrl: workerBaseUrl.origin, forceProxy })
		: fetchImpl;
	const cache = new Map();
	const label = typeof entityLabel === "string" && entityLabel.trim() ? entityLabel.trim() : "Entity";

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

	async function getCount(entityId, countKey, { signal, bypassCache = false } = {}) {
		if (typeof entityId !== "number" || !Number.isSafeInteger(entityId) || entityId <= 0) {
			return providerError("invalid-request", `TMDB ${label.toLowerCase()} IDs must be positive safe integers.`, { retryable: false });
		}
		const path = countPaths[countKey];
		if (!path) return providerError("invalid-request", `Choose a supported ${label} count dimension.`, { retryable: false });
		const cacheKey = `${queryParameter}:${path}:${entityId}`;
		const cached = cacheGet(cacheKey, bypassCache);
		if (cached !== null) return { ok: true, data: cached };

		const url = new URL(path, workerBaseUrl);
		url.searchParams.set(queryParameter, String(entityId));
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
			if (signal?.aborted) return providerError("aborted", `The superseded ${label} count request was cancelled.`, { retryable: false });
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
		if (controller.signal.aborted) return providerError("aborted", `The superseded ${label} count request was cancelled.`, { retryable: false });
		const count = normalizeTmdbDiscoverCountResponse(value);
		if (count === null) return providerError("invalid-response", "Current count unavailable");
		const checkedAt = now();
		cacheSet(cacheKey, count, checkedAt);
		return { ok: true, data: Object.freeze({ status: "ready", count, error: null, fromCache: false, checkedAt }) };
	}

	return Object.freeze({ getCount });
}
