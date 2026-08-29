import { parseCanonicalHttpsOrigin } from "../../worker-origin.js";
import { createTmdbLocalPreviewFetch } from "./tmdb-local-preview-proxy.js";
import {
	normalizeTmdbEntitySearchText,
	normalizeTmdbEntityText,
	normalizeTmdbLogoPath,
} from "./tmdb-entity-catalogue.js";

export const STREAMING_PROVIDER_PATHS = Object.freeze({
	regions: "/3/watch/providers/regions",
	movie: "/3/watch/providers/movie",
	tv: "/3/watch/providers/tv",
});
export const STREAMING_CATALOGUE_LANGUAGE = "en-US";
export const STREAMING_CATALOGUE_REQUEST_TIMEOUT_MS = 12_000;
export const STREAMING_TOP_PROVIDER_COUNT = 30;
export const STREAMING_COMMON_REGION_CODES = Object.freeze([
	"AU",
	"BR",
	"CA",
	"FR",
	"DE",
	"IN",
	"JP",
	"MX",
	"NZ",
	"KR",
	"GB",
	"US",
]);
export const STREAMING_REGION_BROWSE_MODES = Object.freeze({
	COMMON: "common",
	ALL: "all",
});
export const STREAMING_PROVIDER_BROWSE_MODES = Object.freeze({
	TOP: "top",
	ALL: "all",
});
export const STREAMING_CATALOGUE_PROXY_BASE_URL = typeof __TMDB_PROXY_BASE_URL__ === "string"
	? __TMDB_PROXY_BASE_URL__
	: null;

function plainObject(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function canonicalRegionCode(value) {
	const code = normalizeTmdbEntityText(value).toUpperCase();
	return /^[A-Z]{2}$/.test(code) ? code : null;
}

function compareText(left, right) {
	if (left < right) return -1;
	if (left > right) return 1;
	return 0;
}

function compareRegions(left, right) {
	return compareText(left.searchName, right.searchName) || compareText(left.code, right.code);
}

function providerError(kind, message, { status = 0, retryable = true } = {}) {
	return Object.freeze({
		ok: false,
		error: Object.freeze({ kind, message, status, retryable }),
	});
}

function configuredBaseUrl(value) {
	if (typeof value !== "string" || !value.trim()) {
		throw new TypeError("A TMDB Worker base URL is required.");
	}
	let parsed;
	try {
		parsed = parseCanonicalHttpsOrigin(value);
	} catch {
		parsed = null;
	}
	if (parsed === null) {
		throw new TypeError("The TMDB Worker base URL must be an absolute HTTPS origin.");
	}
	return parsed;
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

function normalizedRegions(value) {
	if (!plainObject(value) || !Array.isArray(value.results)) return null;
	const byCode = new Map();
	for (const row of value.results) {
		if (!plainObject(row)) continue;
		const code = canonicalRegionCode(row.iso_3166_1);
		const name = normalizeTmdbEntityText(row.english_name);
		if (code === null || !name || byCode.has(code)) continue;
		byCode.set(code, Object.freeze({
			code,
			name,
			searchName: normalizeTmdbEntitySearchText(name),
		}));
	}
	return [...byCode.values()].sort(compareRegions);
}

function normalizedPriorities(value) {
	if (!plainObject(value)) return Object.freeze({});
	const priorities = {};
	for (const [rawCode, priority] of Object.entries(value)) {
		const code = canonicalRegionCode(rawCode);
		if (code !== null && !Object.hasOwn(priorities, code)) {
			priorities[code] = Number.isSafeInteger(priority) && priority >= 0 ? priority : null;
		}
	}
	return Object.freeze(priorities);
}

function normalizedProviderRows(value) {
	if (!plainObject(value) || !Array.isArray(value.results)) return null;
	const rows = [];
	for (const row of value.results) {
		if (!plainObject(row)) continue;
		const id = Number.isSafeInteger(row.provider_id) && row.provider_id > 0
			? row.provider_id
			: null;
		const name = normalizeTmdbEntityText(row.provider_name);
		if (id === null || !name) continue;
		rows.push(Object.freeze({
			id,
			name,
			searchName: normalizeTmdbEntitySearchText(name),
			logoPath: normalizeTmdbLogoPath(row.logo_path),
			priorities: normalizedPriorities(row.display_priorities),
		}));
	}
	return rows;
}

export function normalizeStreamingCatalogue(regionsResponse, movieResponse, tvResponse) {
	const regions = normalizedRegions(regionsResponse);
	if (regions === null) return null;
	const movieRows = normalizedProviderRows(movieResponse);
	const tvRows = normalizedProviderRows(tvResponse);
	if (movieRows === null || tvRows === null) return null;

	const byId = new Map();
	function merge(rows, priorityField) {
		for (const row of rows) {
			const existing = byId.get(row.id);
			if (existing) {
				byId.set(row.id, {
					...existing,
					logoPath: existing.logoPath ?? row.logoPath,
					[priorityField]: row.priorities,
				});
				continue;
			}
			byId.set(row.id, {
				id: row.id,
				name: row.name,
				searchName: row.searchName,
				logoPath: row.logoPath,
				moviePriorities: Object.freeze({}),
				tvPriorities: Object.freeze({}),
				[priorityField]: row.priorities,
			});
		}
	}
	merge(movieRows, "moviePriorities");
	merge(tvRows, "tvPriorities");

	const providers = [...byId.values()]
		.filter((provider) => (
			Object.keys(provider.moviePriorities).length > 0
			|| Object.keys(provider.tvPriorities).length > 0
		))
		.map((provider) => Object.freeze(provider))
		.sort((left, right) => compareText(left.searchName, right.searchName) || left.id - right.id);

	return Object.freeze({
		regions: Object.freeze(regions.map((region) => Object.freeze({ code: region.code, name: region.name }))),
		providers: Object.freeze(providers),
	});
}

function validProvider(provider) {
	return plainObject(provider)
		&& Number.isSafeInteger(provider.id)
		&& provider.id > 0
		&& Boolean(normalizeTmdbEntitySearchText(provider.name))
		&& (
			Object.keys(provider.moviePriorities ?? {}).length > 0
			|| Object.keys(provider.tvPriorities ?? {}).length > 0
		);
}

function compareProvidersAlphabetically(left, right) {
	return compareText(
		normalizeTmdbEntitySearchText(left?.name),
		normalizeTmdbEntitySearchText(right?.name),
	) || left.id - right.id;
}

function normalizedRegionCodeSelection(value) {
	if (!Array.isArray(value) || value.length === 0) {
		throw new TypeError("One or more normalized Streaming region codes are required.");
	}
	const codes = [];
	const seen = new Set();
	for (const valueCode of value) {
		const code = canonicalRegionCode(valueCode);
		if (code === null || code !== valueCode || seen.has(code)) {
			throw new TypeError("Distinct normalized Streaming region codes are required.");
		}
		seen.add(code);
		codes.push(code);
	}
	return Object.freeze(codes);
}

function compareProviderPriority(left, right, regionCode) {
	const leftPriority = streamingProviderAvailability(left, regionCode).priority;
	const rightPriority = streamingProviderAvailability(right, regionCode).priority;
	const leftValid = Number.isSafeInteger(leftPriority);
	const rightValid = Number.isSafeInteger(rightPriority);
	if (leftValid !== rightValid) return leftValid ? -1 : 1;
	if (leftValid && leftPriority !== rightPriority) return leftPriority - rightPriority;
	return compareProvidersAlphabetically(left, right);
}

export function streamingProviderCommonAvailability(provider, regionCodes) {
	let codes;
	try {
		codes = normalizedRegionCodeSelection(regionCodes);
	} catch {
		return Object.freeze({ movies: false, series: false, both: false, eligible: false });
	}
	const availability = codes.map((code) => streamingProviderAvailability(provider, code));
	const movies = availability.every((entry) => entry.movies);
	const series = availability.every((entry) => entry.series);
	return Object.freeze({
		movies,
		series,
		both: movies && series,
		eligible: movies || series,
	});
}

export function eligibleStreamingProviders(providers, regionCodes, { mediaChoice = null } = {}) {
	if (!Array.isArray(providers)) throw new TypeError("A normalized Streaming provider list is required.");
	const codes = normalizedRegionCodeSelection(regionCodes);
	if (mediaChoice !== null && !["movies", "series", "both"].includes(mediaChoice)) {
		throw new TypeError("A supported Streaming media choice is required.");
	}
	return Object.freeze(providers.filter((provider) => (
		validProvider(provider)
		&& (mediaChoice === null
			? streamingProviderCommonAvailability(provider, codes).eligible
			: streamingProviderCommonAvailability(provider, codes)[mediaChoice])
	)));
}

export function eligibleStreamingProvidersForMedia(providers, regionCodes, mediaChoice) {
	return eligibleStreamingProviders(providers, regionCodes, { mediaChoice });
}

export function browseStreamingProviders(providers, {
	mode = STREAMING_PROVIDER_BROWSE_MODES.TOP,
	regionCodes,
	limit = STREAMING_TOP_PROVIDER_COUNT,
	mediaChoice = null,
} = {}) {
	if (!Object.values(STREAMING_PROVIDER_BROWSE_MODES).includes(mode)) {
		throw new TypeError("A supported Streaming provider browse mode is required.");
	}
	if (!Number.isSafeInteger(limit) || limit <= 0) {
		throw new TypeError("The Streaming provider browse limit must be a positive safe integer.");
	}
	const codes = normalizedRegionCodeSelection(regionCodes);
	if (mode === STREAMING_PROVIDER_BROWSE_MODES.TOP && codes.length !== 1) {
		throw new TypeError("Top Streaming providers require exactly one selected region.");
	}
	const sorted = [...eligibleStreamingProviders(providers, codes, { mediaChoice })].sort((left, right) => {
		if (mode === STREAMING_PROVIDER_BROWSE_MODES.ALL) return compareProvidersAlphabetically(left, right);
		return compareProviderPriority(left, right, codes[0]);
	});
	return Object.freeze(mode === STREAMING_PROVIDER_BROWSE_MODES.TOP ? sorted.slice(0, limit) : sorted);
}

export function streamingProviderAvailability(provider, regionCode) {
	const code = canonicalRegionCode(regionCode);
	if (code === null || !plainObject(provider)) {
		return Object.freeze({ movies: false, series: false, moviePriority: null, tvPriority: null, priority: null });
	}
	const movies = plainObject(provider.moviePriorities) && Object.hasOwn(provider.moviePriorities, code);
	const series = plainObject(provider.tvPriorities) && Object.hasOwn(provider.tvPriorities, code);
	const moviePriority = movies && Number.isSafeInteger(provider.moviePriorities[code])
		? provider.moviePriorities[code]
		: null;
	const tvPriority = series && Number.isSafeInteger(provider.tvPriorities[code])
		? provider.tvPriorities[code]
		: null;
	const priorities = [moviePriority, tvPriority].filter((value) => value !== null);
	return Object.freeze({
		movies,
		series,
		moviePriority,
		tvPriority,
		priority: priorities.length ? Math.min(...priorities) : null,
	});
}

export function searchStreamingRegions(regions, query = "") {
	if (!Array.isArray(regions)) throw new TypeError("A normalized Streaming region list is required.");
	const rawQuery = normalizeTmdbEntityText(query);
	const normalizedQuery = normalizeTmdbEntitySearchText(rawQuery);
	const upperQuery = rawQuery.toUpperCase();
	return Object.freeze(regions
		.map((region) => {
			const name = normalizeTmdbEntityText(region?.name);
			const searchName = normalizeTmdbEntitySearchText(name);
			const code = canonicalRegionCode(region?.code);
			if (code === null) return null;
			let tier = 0;
			if (normalizedQuery) {
				if (code === upperQuery) tier = 0;
				else if (searchName && searchName === normalizedQuery) tier = 1;
				else if ((searchName && searchName.startsWith(normalizedQuery)) || code.startsWith(upperQuery)) tier = 2;
				else if ((searchName && searchName.includes(normalizedQuery)) || code.includes(upperQuery)) tier = 3;
				else return null;
			}
			return {
				region: Object.freeze({
					code,
					name: name || null,
					...(typeof region.movies === "boolean" ? { movies: region.movies } : {}),
					...(typeof region.series === "boolean" ? { series: region.series } : {}),
				}),
				tier,
				searchName: searchName || normalizeTmdbEntitySearchText(code),
			};
		})
		.filter(Boolean)
		.sort((left, right) => left.tier - right.tier || compareText(left.searchName, right.searchName) || compareText(left.region.code, right.region.code))
		.map((entry) => entry.region));
}

export function browseStreamingRegions(regions, {
	mode = STREAMING_REGION_BROWSE_MODES.COMMON,
	query = "",
} = {}) {
	if (!Object.values(STREAMING_REGION_BROWSE_MODES).includes(mode)) {
		throw new TypeError("A supported Streaming region browse mode is required.");
	}
	if (normalizeTmdbEntityText(query)) return searchStreamingRegions(regions, query);
	const alphabetical = searchStreamingRegions(regions);
	if (mode === STREAMING_REGION_BROWSE_MODES.ALL) return alphabetical;
	const commonCodes = new Set(STREAMING_COMMON_REGION_CODES);
	return Object.freeze(alphabetical.filter((region) => commonCodes.has(region.code)));
}

export function searchStreamingProviders(providers, query = "", { regionCodes, mediaChoice = null } = {}) {
	const codes = normalizedRegionCodeSelection(regionCodes);
	const rawQuery = normalizeTmdbEntityText(query);
	const normalizedQuery = normalizeTmdbEntitySearchText(rawQuery);
	const exactNumericId = /^[1-9]\d*$/.test(rawQuery) && Number.isSafeInteger(Number(rawQuery))
		? Number(rawQuery)
		: null;
	return Object.freeze(eligibleStreamingProviders(providers, codes, { mediaChoice })
		.map((provider) => {
			if (!validProvider(provider)) return null;
			const searchName = normalizeTmdbEntitySearchText(provider?.name);
			if (!searchName || !Number.isSafeInteger(provider?.id) || provider.id <= 0) return null;
			let tier = 0;
			if (normalizedQuery) {
				if (provider.id === exactNumericId) tier = 0;
				else if (searchName === normalizedQuery) tier = 1;
				else if (searchName.startsWith(normalizedQuery)) tier = 2;
				else if (searchName.includes(normalizedQuery)) tier = 3;
				else return null;
			}
			return { provider, tier, searchName };
		})
		.filter(Boolean)
		.sort((left, right) => (
			left.tier - right.tier
			|| (codes.length === 1 ? compareProviderPriority(left.provider, right.provider, codes[0]) : 0)
			|| compareText(left.searchName, right.searchName)
			|| left.provider.id - right.provider.id
		))
		.map((entry) => entry.provider));
}

export function createStreamingCatalogueProvider({
	fetchImpl,
	baseUrl = STREAMING_CATALOGUE_PROXY_BASE_URL,
	timeoutMs = STREAMING_CATALOGUE_REQUEST_TIMEOUT_MS,
} = {}) {
	if (fetchImpl !== undefined && typeof fetchImpl !== "function") {
		throw new TypeError("A Streaming catalogue fetch implementation is required.");
	}
	if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
		throw new TypeError("The Streaming catalogue timeout must be positive.");
	}
	const workerBaseUrl = configuredBaseUrl(baseUrl);
	const requestFetch = fetchImpl === undefined
		? createTmdbLocalPreviewFetch({ workerBaseUrl: workerBaseUrl.origin })
		: fetchImpl;
	let catalogue = null;
	let pending = null;

	async function requestCatalogue(signal) {
		const controller = new AbortController();
		const unlink = linkAbortSignal(signal, controller);
		let timeoutTriggered = false;
		const timeout = setTimeout(() => {
			timeoutTriggered = true;
			controller.abort();
		}, timeoutMs);
		const abortInternalWork = () => {
			if (!controller.signal.aborted) controller.abort();
		};
		const cleanup = () => {
			clearTimeout(timeout);
			unlink();
		};
		const urls = Object.values(STREAMING_PROVIDER_PATHS).map((path) => {
			const url = new URL(path, workerBaseUrl);
			url.searchParams.set("language", STREAMING_CATALOGUE_LANGUAGE);
			return url;
		});

		let responses;
		try {
			const requests = urls.map((url) => requestFetch(url.toString(), {
				method: "GET",
				headers: { Accept: "application/json" },
				signal: controller.signal,
			}));
			responses = await Promise.all(requests);
		} catch {
			abortInternalWork();
			cleanup();
			if (signal?.aborted) return providerError("aborted", "The superseded Streaming catalogue request was cancelled.", { retryable: false });
			if (timeoutTriggered) return providerError("timeout", "Streaming services took too long to load. Try again.");
			return providerError("network", "Streaming services could not be reached. Check your connection and try again.");
		}

		const rateLimited = responses.some((response) => response?.status === 429);
		const invalidResponse = responses.some((response) => !response?.ok || !contentTypeIsJson(response));
		if (rateLimited || invalidResponse) {
			abortInternalWork();
			cleanup();
			return rateLimited
				? providerError("rate-limit", "TMDB is receiving too many requests. Wait a moment and try again.", { status: 429 })
				: providerError("provider", "Streaming services could not be loaded. Try again.");
		}

		let values;
		try {
			const bodyRequests = responses.map((response) => response.json());
			values = await Promise.all(bodyRequests);
		} catch {
			abortInternalWork();
			cleanup();
			if (signal?.aborted) return providerError("aborted", "The superseded Streaming catalogue request was cancelled.", { retryable: false });
			if (timeoutTriggered) return providerError("timeout", "Streaming services took too long to load. Try again.");
			return providerError("invalid-response", "TMDB returned unexpected Streaming service data. Try again.");
		}
		cleanup();
		if (controller.signal.aborted) {
			return providerError("aborted", "The superseded Streaming catalogue request was cancelled.", { retryable: false });
		}
		const normalized = normalizeStreamingCatalogue(values[0], values[1], values[2]);
		if (normalized === null) {
			return providerError("invalid-response", "TMDB returned unexpected Streaming service data. Try again.");
		}
		return Object.freeze({ ok: true, data: normalized, fromCache: false });
	}

	async function loadCatalogue({ signal } = {}) {
		if (catalogue !== null) return Object.freeze({ ok: true, data: catalogue, fromCache: true });
		if (pending === null) pending = requestCatalogue(signal);
		const activeRequest = pending;
		const result = await activeRequest;
		if (pending === activeRequest) pending = null;
		if (result?.error?.kind === "aborted" && !signal?.aborted) {
			return loadCatalogue({ signal });
		}
		if (result.ok) catalogue = result.data;
		return result;
	}

	return Object.freeze({ loadCatalogue });
}
