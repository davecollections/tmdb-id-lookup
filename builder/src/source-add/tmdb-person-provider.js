import { parseCanonicalHttpsOrigin } from "../../worker-origin.js";
import { calculatePersonCreditCounts, normalizePersonCombinedCredits } from "./person-credits.js";
import { isPositiveSafePersonId } from "./tmdb-person-input.js";
import { createTmdbLocalPreviewFetch } from "./tmdb-local-preview-proxy.js";

export const TMDB_PERSON_CACHE_TTL_MS = 5 * 60 * 1000;
export const TMDB_PERSON_CACHE_MAX_ENTRIES = 40;
export const TMDB_PERSON_REQUEST_TIMEOUT_MS = 12_000;
export const TMDB_PERSON_PROXY_BASE_URL = typeof __TMDB_PROXY_BASE_URL__ === "string"
	? __TMDB_PROXY_BASE_URL__
	: null;

const safeProfilePathPattern = /^\/[A-Za-z0-9._-]+$/;
const supportedProfileSizes = new Set(["w185", "w500"]);
const TMDB_IMAGE_ORIGIN = "https://image.tmdb.org";

function plainObject(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cloneData(value) {
	if (Array.isArray(value)) return value.map((entry) => cloneData(entry));
	if (!plainObject(value)) return value;
	return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneData(entry)]));
}

function normalizedText(value) {
	return typeof value === "string" ? value.trim() : "";
}

function normalizedYear(value) {
	if (typeof value !== "string") return null;
	const match = value.match(/^(\d{4})(?:-\d{2}-\d{2})?$/);
	if (!match) return null;
	const year = Number(match[1]);
	return Number.isSafeInteger(year) && year > 0 ? year : null;
}

export function normalizeTmdbProfilePath(value) {
	return typeof value === "string" && safeProfilePathPattern.test(value) ? value : null;
}

export function buildTmdbProfileUrl(profilePath, size = "w185") {
	const path = normalizeTmdbProfilePath(profilePath);
	if (path === null || !supportedProfileSizes.has(size)) return null;
	return new URL(`/t/p/${size}${path}`, TMDB_IMAGE_ORIGIN).toString();
}

function normalizeKnownForEntry(value) {
	if (!plainObject(value)) return null;
	if (value.media_type === "movie") {
		const title = normalizedText(value.title) || normalizedText(value.original_title);
		return title ? { title, mediaType: "MOVIE", year: normalizedYear(value.release_date) } : null;
	}
	if (value.media_type === "tv") {
		const title = normalizedText(value.name) || normalizedText(value.original_name);
		return title ? { title, mediaType: "TV", year: normalizedYear(value.first_air_date) } : null;
	}
	return null;
}

function normalizeKnownFor(value) {
	if (!Array.isArray(value)) return [];
	const rows = [];
	for (const entry of value) {
		const normalized = normalizeKnownForEntry(entry);
		if (normalized !== null) rows.push(normalized);
	}
	return rows;
}

function normalizePerson(value, { includeCredits = false } = {}) {
	if (!plainObject(value) || !isPositiveSafePersonId(value.id)) return null;
	const name = normalizedText(value.name);
	if (!name) return null;
	const person = {
		id: value.id,
		name,
		knownForDepartment: normalizedText(value.known_for_department),
		profilePath: normalizeTmdbProfilePath(value.profile_path),
		knownFor: normalizeKnownFor(value.known_for),
	};
	if (!includeCredits) return person;

	const combinedCredits = normalizePersonCombinedCredits(value.combined_credits);
	const counts = calculatePersonCreditCounts(value.combined_credits);
	return {
		...person,
		combinedCredits,
		counts,
		countError: counts === null ? {
			kind: "count",
			message: "Title counts could not be checked. You can still add these sources.",
			retryable: true,
		} : null,
	};
}

export function normalizeTmdbPersonSearchResponse(value) {
	if (!plainObject(value) || !Array.isArray(value.results)) return null;
	const page = Number.isSafeInteger(value.page) && value.page > 0 ? value.page : 1;
	const totalPages = Math.max(
		page,
		Number.isSafeInteger(value.total_pages) && value.total_pages > 0 ? value.total_pages : page,
	);
	const results = value.results.map((entry) => normalizePerson(entry)).filter(Boolean);
	return {
		results,
		page,
		totalPages,
		totalResults: Number.isSafeInteger(value.total_results) && value.total_results >= 0
			? value.total_results
			: results.length,
	};
}

export function normalizeTmdbPersonDetailsResponse(value, expectedId = null) {
	const person = normalizePerson(value, { includeCredits: true });
	if (person === null || (expectedId !== null && person.id !== expectedId)) return null;
	return person;
}

function providerError(kind, message, { status = 0, retryable = true } = {}) {
	return { ok: false, error: { kind, message, status, retryable } };
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

export function createTmdbPersonProvider({
	fetchImpl,
	baseUrl = TMDB_PERSON_PROXY_BASE_URL,
	timeoutMs = TMDB_PERSON_REQUEST_TIMEOUT_MS,
	cacheTtlMs = TMDB_PERSON_CACHE_TTL_MS,
	cacheMaxEntries = TMDB_PERSON_CACHE_MAX_ENTRIES,
	now = Date.now,
} = {}) {
	if (fetchImpl !== undefined && typeof fetchImpl !== "function") throw new TypeError("A fetch implementation is required.");
	if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new TypeError("The TMDB request timeout must be positive.");
	if (!Number.isFinite(cacheTtlMs) || cacheTtlMs < 0) throw new TypeError("The TMDB response cache lifetime cannot be negative.");
	if (!Number.isInteger(cacheMaxEntries) || cacheMaxEntries <= 0) throw new TypeError("The TMDB response cache size must be a positive integer.");
	if (typeof now !== "function") throw new TypeError("The TMDB response clock must be a function.");

	const workerBaseUrl = configuredBaseUrl(baseUrl);
	const requestFetch = fetchImpl === undefined
		? createTmdbLocalPreviewFetch({ workerBaseUrl: workerBaseUrl.origin })
		: fetchImpl;
	const cache = new Map();

	function cacheGet(key, bypassCache) {
		if (bypassCache) return null;
		const entry = cache.get(key);
		if (!entry) return null;
		if (now() - entry.createdAt > cacheTtlMs) {
			cache.delete(key);
			return null;
		}
		cache.delete(key);
		cache.set(key, entry);
		return cloneData(entry.data);
	}

	function cacheSet(key, data) {
		cache.delete(key);
		cache.set(key, { createdAt: now(), data: cloneData(data) });
		while (cache.size > cacheMaxEntries) cache.delete(cache.keys().next().value);
	}

	async function request(path, searchParams, {
		signal,
		cacheKey,
		bypassCache = false,
		normalize,
		notFoundMessage,
		shouldCache = () => true,
	}) {
		const cached = cacheGet(cacheKey, bypassCache);
		if (cached !== null) return { ok: true, data: cached, fromCache: true, checkedAt: now() };

		const url = new URL(path, workerBaseUrl);
		for (const [key, value] of Object.entries(searchParams)) url.searchParams.set(key, String(value));
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
			if (signal?.aborted) return providerError("aborted", "The superseded TMDB request was cancelled.", { retryable: false });
			if (timeoutTriggered) return providerError("timeout", "TMDB took too long to respond. Try again.");
			return providerError("network", "TMDB could not be reached. Check your connection and try again.");
		}

		if (response.status === 429) {
			clearTimeout(timeout);
			unlink();
			return providerError("rate-limit", "TMDB is receiving too many requests. Wait a moment and try again.", { status: 429 });
		}
		if (response.status === 404 && notFoundMessage) {
			clearTimeout(timeout);
			unlink();
			return providerError("not-found", notFoundMessage, { status: 404, retryable: false });
		}
		if (!response.ok) {
			clearTimeout(timeout);
			unlink();
			return providerError("provider", "TMDB could not complete this request. Try again.", { status: response.status });
		}

		let value;
		try {
			value = await response.json();
		} catch {
			clearTimeout(timeout);
			unlink();
			if (timeoutTriggered) return providerError("timeout", "TMDB took too long to respond. Try again.");
			return providerError("invalid-response", "TMDB returned an unexpected response. Try again.");
		}
		clearTimeout(timeout);
		unlink();
		if (controller.signal.aborted) return providerError("aborted", "The superseded TMDB request was cancelled.", { retryable: false });

		const data = normalize(value);
		if (data === null) return providerError("invalid-response", "TMDB returned an unexpected response. Try again.");
		if (shouldCache(data)) cacheSet(cacheKey, data);
		return { ok: true, data: cloneData(data), fromCache: false, checkedAt: now() };
	}

	function searchPeople(query, { page = 1, signal } = {}) {
		const trimmedQuery = typeof query === "string" ? query.trim() : "";
		if (trimmedQuery.length < 2 || !Number.isSafeInteger(page) || page <= 0) {
			return Promise.resolve(providerError(
				"invalid-request",
				"Enter at least two characters and a valid results page.",
				{ retryable: false },
			));
		}
		return request("/3/search/person", {
			query: trimmedQuery,
			page,
			include_adult: false,
		}, {
			signal,
			cacheKey: `search:${trimmedQuery.toLocaleLowerCase("en")}:${page}:include_adult=false`,
			normalize: normalizeTmdbPersonSearchResponse,
		});
	}

	function getPerson(id, { signal, bypassCache = false } = {}) {
		if (!isPositiveSafePersonId(id)) {
			return Promise.resolve(providerError(
				"invalid-request",
				"TMDB person IDs must be positive safe integers.",
				{ retryable: false },
			));
		}
		return request(`/3/person/${id}`, { append_to_response: "combined_credits" }, {
			signal,
			bypassCache,
			cacheKey: `person:${id}:combined_credits`,
			normalize: (value) => normalizeTmdbPersonDetailsResponse(value, id),
			notFoundMessage: "This TMDB person could not be found or accessed.",
			shouldCache: (person) => person.counts !== null,
		});
	}

	return Object.freeze({ getPerson, searchPeople });
}
