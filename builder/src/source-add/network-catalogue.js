import {
	buildTmdbLogoUrl,
	canonicalTmdbCountryCode,
	formatTmdbEntityLocation,
	normalizeTmdbEntitySearchText,
	normalizeTmdbEntityText,
	normalizeTmdbLogoPath,
	tmdbCountrySearchText,
} from "./tmdb-entity-catalogue.js";

export const NETWORK_SEARCH_PAGE_SIZE = 20;
export const NETWORK_CATALOGUE_PATH = "../data/tv-networks.min.json";
export const NETWORK_SERIES_COUNT_FILTERS = Object.freeze({
	ALL: "all",
	EXCLUDE_ZERO: "exclude-zero",
	AT_LEAST_10: "10-plus",
	AT_LEAST_50: "50-plus",
	AT_LEAST_100: "100-plus",
	AT_LEAST_500: "500-plus",
});
export const NETWORK_SERIES_COUNT_FILTER_OPTIONS = Object.freeze([
	Object.freeze({ id: NETWORK_SERIES_COUNT_FILTERS.ALL, label: "All" }),
	Object.freeze({ id: NETWORK_SERIES_COUNT_FILTERS.EXCLUDE_ZERO, label: "Exclude 0" }),
	Object.freeze({ id: NETWORK_SERIES_COUNT_FILTERS.AT_LEAST_10, label: "10+" }),
	Object.freeze({ id: NETWORK_SERIES_COUNT_FILTERS.AT_LEAST_50, label: "50+" }),
	Object.freeze({ id: NETWORK_SERIES_COUNT_FILTERS.AT_LEAST_100, label: "100+" }),
	Object.freeze({ id: NETWORK_SERIES_COUNT_FILTERS.AT_LEAST_500, label: "500+" }),
]);
export const DEFAULT_NETWORK_SERIES_COUNT_FILTER = NETWORK_SERIES_COUNT_FILTERS.ALL;

const decimalIdPattern = /^\d+$/;
const numericLikePattern = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;
const supportedSeriesCountFilters = new Set(Object.values(NETWORK_SERIES_COUNT_FILTERS));
const seriesCountThresholds = new Map([
	[NETWORK_SERIES_COUNT_FILTERS.AT_LEAST_10, 10],
	[NETWORK_SERIES_COUNT_FILTERS.AT_LEAST_50, 50],
	[NETWORK_SERIES_COUNT_FILTERS.AT_LEAST_100, 100],
	[NETWORK_SERIES_COUNT_FILTERS.AT_LEAST_500, 500],
]);

function plainObject(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function positiveSafeInteger(value) {
	if (!decimalIdPattern.test(value)) return null;
	const number = Number(value);
	return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function invalid(code, message) {
	return Object.freeze({ kind: "invalid", code, message });
}

function compareText(left, right) {
	if (left < right) return -1;
	if (left > right) return 1;
	return 0;
}

function compareNetworks(left, right) {
	return compareText(left.searchName, right.searchName) || left.id - right.id || compareText(left.name, right.name);
}

function matchNetwork(network, query, countryCodeQuery) {
	if (network.searchName === query) return 1;
	if (countryCodeQuery) return network.country === countryCodeQuery ? 4 : null;
	if (network.searchName.startsWith(query)) return 2;
	if (network.searchName.includes(query)) return 3;
	if (network.searchCountry.includes(query) || network.searchHeadquarters.includes(query)) return 4;
	return null;
}

function publicNetwork(network, { includeSeriesCount = false } = {}) {
	return Object.freeze({
		id: network.id,
		name: network.name,
		country: network.country,
		headquarters: network.headquarters,
		location: formatNetworkLocation(network),
		logoPath: network.logoPath,
		...(includeSeriesCount ? { seriesCount: network.seriesCount } : {}),
	});
}

export function networkMatchesSeriesCountFilter(network, filterId = DEFAULT_NETWORK_SERIES_COUNT_FILTER) {
	if (!supportedSeriesCountFilters.has(filterId)) throw new TypeError("Choose a supported Network Series Count filter.");
	if (filterId === NETWORK_SERIES_COUNT_FILTERS.ALL) return true;
	if (filterId === NETWORK_SERIES_COUNT_FILTERS.EXCLUDE_ZERO) return network?.seriesCount !== 0;
	const threshold = seriesCountThresholds.get(filterId);
	return Number.isSafeInteger(network?.seriesCount) && network.seriesCount >= threshold;
}

export function formatNetworkLocation(network) {
	return formatTmdbEntityLocation(network);
}

export function parseNetworkSearchInput(input) {
	if (typeof input !== "string") return invalid("NETWORK_SEARCH_REQUIRED", "Enter a Network name or TMDB Network ID.");
	const value = input.trim();
	if (!value) return Object.freeze({ kind: "empty", message: "Browse Networks A–Z or enter a search." });
	if (decimalIdPattern.test(value)) {
		const id = positiveSafeInteger(value);
		return id === null
			? invalid("INVALID_NETWORK_ID", "TMDB Network IDs must be positive safe integers.")
			: Object.freeze({ kind: "exact", id });
	}
	if (numericLikePattern.test(value)) return invalid("INVALID_NETWORK_ID", "TMDB Network IDs must be positive whole numbers.");
	return Object.freeze({
		kind: "search",
		query: value,
		eligible: value.length >= 2,
		message: value.length >= 2 ? null : "Enter at least two characters to search.",
	});
}

export function normalizeNetworkCatalogueRow(value) {
	if (!plainObject(value)) return null;
	const id = typeof value.i === "number" && Number.isSafeInteger(value.i) && value.i > 0 ? value.i : null;
	const name = normalizeTmdbEntityText(value.n);
	if (id === null || !name) return null;
	return Object.freeze({
		id,
		name,
		searchName: normalizeTmdbEntitySearchText(name),
		country: canonicalTmdbCountryCode(value.c),
		searchCountry: tmdbCountrySearchText(value.c),
		headquarters: normalizeTmdbEntityText(value.h),
		searchHeadquarters: normalizeTmdbEntitySearchText(value.h),
		logoPath: normalizeTmdbLogoPath(value.l),
		seriesCount: Object.hasOwn(value, "t") && Number.isSafeInteger(value.t) && value.t >= 0 ? value.t : null,
	});
}

export function normalizeNetworkCatalogue(value) {
	if (!Array.isArray(value)) return null;
	const byId = new Map();
	for (const row of value) {
		const network = normalizeNetworkCatalogueRow(row);
		if (network !== null && !byId.has(network.id)) byId.set(network.id, network);
	}
	const networks = [...byId.values()].sort(compareNetworks);
	return Object.freeze({
		networks: Object.freeze(networks),
		byId,
		countryCodes: new Set(networks.map((network) => network.country).filter(Boolean)),
	});
}

export function searchNetworkCatalogue(catalogue, parsedInput, {
	page = 1,
	pageSize = NETWORK_SEARCH_PAGE_SIZE,
	seriesCountFilter = null,
} = {}) {
	if (
		!plainObject(catalogue)
		|| !Array.isArray(catalogue.networks)
		|| !(catalogue.byId instanceof Map)
		|| !(catalogue.countryCodes instanceof Set)
	) throw new TypeError("A normalized Network catalogue is required.");
	if (!Number.isSafeInteger(page) || page <= 0 || !Number.isSafeInteger(pageSize) || pageSize <= 0) {
		throw new TypeError("Network result pages and page sizes must be positive safe integers.");
	}
	if (seriesCountFilter !== null && !supportedSeriesCountFilters.has(seriesCountFilter)) {
		throw new TypeError("Choose a supported Network Series Count filter.");
	}

	let rankedMatches;
	if (parsedInput?.kind === "exact") {
		const query = normalizeTmdbEntitySearchText(String(parsedInput.id));
		rankedMatches = catalogue.networks.flatMap((network) => {
			const tier = network.id === parsedInput.id ? 0 : matchNetwork(network, query, null);
			return tier === null ? [] : [{ network, tier }];
		});
	} else if (parsedInput?.kind === "search" && parsedInput.eligible) {
		const query = normalizeTmdbEntitySearchText(parsedInput.query);
		const possibleCountryCode = parsedInput.query.trim().toUpperCase();
		const countryCodeQuery = /^[A-Z]{2}$/.test(possibleCountryCode) && catalogue.countryCodes.has(possibleCountryCode)
			? possibleCountryCode
			: null;
		rankedMatches = catalogue.networks.flatMap((network) => {
			const tier = matchNetwork(network, query, countryCodeQuery);
			return tier === null ? [] : [{ network, tier }];
		});
	} else if (parsedInput?.kind === "browse") {
		rankedMatches = catalogue.networks.map((network) => ({ network, tier: 0 }));
	} else {
		rankedMatches = [];
	}

	if (seriesCountFilter !== null) {
		rankedMatches = rankedMatches.filter(({ network }) => networkMatchesSeriesCountFilter(network, seriesCountFilter));
	}
	rankedMatches.sort((left, right) => left.tier - right.tier || compareNetworks(left.network, right.network));
	const matches = rankedMatches.map(({ network }) => network);
	const totalResults = matches.length;
	const totalPages = Math.max(1, Math.ceil(totalResults / pageSize));
	const boundedPage = Math.min(page, totalPages);
	const start = (boundedPage - 1) * pageSize;
	return Object.freeze({
		results: Object.freeze(matches.slice(start, start + pageSize).map((network) => publicNetwork(network, { includeSeriesCount: seriesCountFilter !== null }))),
		page: boundedPage,
		totalPages,
		totalResults,
	});
}

export function buildTmdbNetworkLogoUrl(logoPath, size = "w92") {
	return buildTmdbLogoUrl(logoPath, size);
}

function providerError(kind, message, { retryable = true } = {}) {
	return Object.freeze({ ok: false, error: Object.freeze({ kind, message, retryable }) });
}

function resolveCatalogueUrl(value) {
	if (typeof value === "string" && value.trim()) return value;
	if (typeof document !== "undefined" && typeof document.baseURI === "string") {
		return new URL(NETWORK_CATALOGUE_PATH, document.baseURI).toString();
	}
	return NETWORK_CATALOGUE_PATH;
}

export function createNetworkCatalogueProvider({ fetchImpl = globalThis.fetch, catalogueUrl = null } = {}) {
	if (typeof fetchImpl !== "function") throw new TypeError("A Network catalogue fetch implementation is required.");
	let catalogue = null;
	let pending = null;

	async function loadCatalogue() {
		if (catalogue !== null) return { ok: true, data: catalogue, fromCache: true };
		if (pending !== null) return pending;
		pending = (async () => {
			let response;
			try {
				response = await fetchImpl(resolveCatalogueUrl(catalogueUrl), { method: "GET", headers: { Accept: "application/json" } });
			} catch {
				return providerError("network", "Networks could not be loaded. Try again.");
			}
			if (!response?.ok) return providerError("catalogue", "Networks could not be loaded. Try again.");
			let value;
			try {
				value = await response.json();
			} catch {
				return providerError("invalid-catalogue", "Networks are unavailable. Try again.");
			}
			const normalized = normalizeNetworkCatalogue(value);
			if (normalized === null) return providerError("invalid-catalogue", "Networks are unavailable. Try again.");
			catalogue = normalized;
			return { ok: true, data: catalogue, fromCache: false };
		})();
		const result = await pending;
		pending = null;
		return result;
	}

	async function searchNetworks(input, { page = 1, seriesCountFilter = null } = {}) {
		const parsedInput = typeof input === "string" ? parseNetworkSearchInput(input) : input;
		if (
			!parsedInput
			|| parsedInput.kind === "empty"
			|| parsedInput.kind === "invalid"
			|| (parsedInput.kind === "search" && !parsedInput.eligible)
			|| !["exact", "search", "browse"].includes(parsedInput.kind)
		) return providerError("invalid-request", "Enter a valid Network name or positive TMDB Network ID.", { retryable: false });
		const loaded = await loadCatalogue();
		if (!loaded.ok) return loaded;
		try {
			return { ok: true, data: searchNetworkCatalogue(loaded.data, parsedInput, { page, seriesCountFilter }) };
		} catch {
			return providerError("invalid-request", "Choose a valid Network result page.", { retryable: false });
		}
	}

	return Object.freeze({ loadCatalogue, searchNetworks });
}
