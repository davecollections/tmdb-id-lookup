import { parseCanonicalHttpsOrigin } from "../../worker-origin.js";
import { createTmdbLocalPreviewFetch } from "./tmdb-local-preview-proxy.js";
import { cloneResponseData, createBoundedResponseCache } from "./bounded-response-cache.js";

export function tmdbRequestFailure(kind, message, {
	status = 0,
	retryable = true,
} = {}) {
	return {
		ok: false,
		error: {
			kind,
			message,
			status,
			retryable,
		},
	};
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

function contentTypeIsJson(response) {
	const contentType = response?.headers?.get?.("content-type");
	return !contentType || contentType.toLowerCase().includes("application/json");
}

function configuredBaseUrl(value) {
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new TypeError("A TMDB Worker base URL is required.");
	}
	let url;
	try {
		url = parseCanonicalHttpsOrigin(value);
	} catch {
		throw new TypeError("The TMDB Worker base URL must be an absolute HTTPS origin.");
	}
	if (url === null) {
		throw new TypeError("The TMDB Worker base URL must be an absolute HTTPS origin.");
	}
	return url;
}

// Shared transport extracted from the collection provider; family normalization stays with callers.
export function createTmdbJsonRequester({ fetchImpl, baseUrl, timeoutMs = 12_000, cacheTtlMs = 300_000, cacheMaxEntries = 40, now = Date.now } = {}) {
	if (fetchImpl !== undefined && typeof fetchImpl !== "function") {
		throw new TypeError("A fetch implementation is required.");
	}
	if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
		throw new TypeError("The TMDB request timeout must be positive.");
	}
	if (!Number.isFinite(cacheTtlMs) || cacheTtlMs < 0) {
		throw new TypeError("The TMDB response cache lifetime cannot be negative.");
	}
	if (!Number.isInteger(cacheMaxEntries) || cacheMaxEntries <= 0) {
		throw new TypeError("The TMDB response cache size must be a positive integer.");
	}
	if (typeof now !== "function") {
		throw new TypeError("The TMDB response clock must be a function.");
	}

	const workerBaseUrl = configuredBaseUrl(baseUrl);
	const requestFetch = fetchImpl === undefined
		? createTmdbLocalPreviewFetch({ workerBaseUrl: workerBaseUrl.origin })
		: fetchImpl;
	const cache = createBoundedResponseCache({
		ttlMs: cacheTtlMs,
		maxEntries: cacheMaxEntries,
		now,
	});

	async function request(path, searchParams, {
		signal,
		cacheKey,
		normalize,
		notFoundMessage,
	}) {
		const cached = cache.get(cacheKey);
		if (cached !== null) {
			return {
				ok: true,
				data: cached,
				fromCache: true,
			};
		}

		const url = new URL(path, workerBaseUrl);
		for (const [key, value] of Object.entries(searchParams)) {
			url.searchParams.set(key, String(value));
		}

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
			if (signal?.aborted) {
				return tmdbRequestFailure(
					"aborted",
					"The superseded TMDB request was cancelled.",
					{ retryable: false },
				);
			}
			if (timeoutTriggered) {
				return tmdbRequestFailure(
					"timeout",
					"TMDB took too long to respond. Try again.",
				);
			}
			return tmdbRequestFailure(
				"network",
				"TMDB could not be reached. Check your connection and try again.",
			);
		}

		if (response.status === 429) {
			clearTimeout(timeout);
			unlink();
			return tmdbRequestFailure(
				"rate-limit",
				"TMDB is receiving too many requests. Wait a moment and try again.",
				{ status: 429 },
			);
		}
		if (response.status === 404 && notFoundMessage) {
			clearTimeout(timeout);
			unlink();
			return tmdbRequestFailure(
				"not-found",
				notFoundMessage,
				{ status: 404, retryable: false },
			);
		}
		if (!response.ok) {
			clearTimeout(timeout);
			unlink();
			return tmdbRequestFailure(
				"provider",
				"TMDB could not complete this request. Try again.",
				{ status: response.status },
			);
		}
		if (!contentTypeIsJson(response)) {
			clearTimeout(timeout);
			unlink();
			return tmdbRequestFailure(
				"invalid-response",
				"TMDB returned an unexpected response. Try again.",
			);
		}

		let value;
		try {
			value = await response.json();
		} catch {
			clearTimeout(timeout);
			unlink();
			if (signal?.aborted) {
				return tmdbRequestFailure(
					"aborted",
					"The superseded TMDB request was cancelled.",
					{ retryable: false },
				);
			}
			if (timeoutTriggered) {
				return tmdbRequestFailure(
					"timeout",
					"TMDB took too long to respond. Try again.",
				);
			}
			return tmdbRequestFailure(
				"invalid-response",
				"TMDB returned an unexpected response. Try again.",
			);
		}
		clearTimeout(timeout);
		unlink();
		if (controller.signal.aborted) {
			return tmdbRequestFailure(
				"aborted",
				"The superseded TMDB request was cancelled.",
				{ retryable: false },
			);
		}

		const data = normalize(value);
		if (data === null) {
			return tmdbRequestFailure(
				"invalid-response",
				"TMDB returned an unexpected response. Try again.",
			);
		}

		cache.set(cacheKey, data);
		return {
			ok: true,
			data: cloneResponseData(data),
			fromCache: false,
		};
	}

	return request;
}
