import {
	buildTmdbLogoUrl,
	canonicalTmdbCountryCode as canonicalCountryCode,
	formatTmdbEntityLocation,
	normalizeTmdbEntitySearchText as normalizedSearchText,
	normalizeTmdbEntityText as normalizedText,
	normalizeTmdbLogoPath,
	tmdbCountrySearchText,
} from "./tmdb-entity-catalogue.js";

export const STUDIO_SEARCH_PAGE_SIZE = 20;
export const STUDIO_CATALOGUE_PATH = "../data/companies.min.json";
export const STUDIO_SEARCH_SORTS = Object.freeze({
	BEST_MATCH: "best-match",
	MOVIE_COUNT_DESC: "movie-count-desc",
	NAME_ASC: "name-asc",
});
export const DEFAULT_STUDIO_SEARCH_SORT = STUDIO_SEARCH_SORTS.BEST_MATCH;

const decimalIdPattern = /^\d+$/;
const numericLikePattern = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;
const supportedSearchSorts = new Set(Object.values(STUDIO_SEARCH_SORTS));

function plainObject(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function studioCountrySearchText(value) {
	return tmdbCountrySearchText(value);
}

export function formatStudioLocation(studio) {
	return formatTmdbEntityLocation(studio);
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

function compareStudios(left, right) {
	return (
		compareText(left.searchName, right.searchName)
		|| left.id - right.id
		|| compareText(left.name, right.name)
	);
}

function compareMovieCounts(left, right) {
	const leftValid = left.movieCount !== null;
	const rightValid = right.movieCount !== null;
	if (leftValid !== rightValid) return leftValid ? -1 : 1;
	if (leftValid && left.movieCount !== right.movieCount) return right.movieCount - left.movieCount;
	return compareStudios(left, right);
}

function matchStudio(studio, query, countryCodeQuery) {
	if (studio.searchName === query) return 1;
	if (countryCodeQuery) return studio.country === countryCodeQuery ? 5 : null;
	if (studio.searchName.startsWith(query)) return 2;
	if (studio.searchName.includes(query)) return 3;
	if (studio.searchParentCompany.includes(query)) return 4;
	if (studio.searchCountry.includes(query) || studio.searchHeadquarters.includes(query)) return 5;
	return null;
}

function publicStudio(studio) {
	return Object.freeze({
		id: studio.id,
		name: studio.name,
		parentCompany: studio.parentCompany,
		country: studio.country,
		headquarters: studio.headquarters,
		location: formatStudioLocation(studio),
		logoPath: studio.logoPath,
		movieCount: studio.movieCount,
	});
}

export function parseStudioSearchInput(input) {
	if (typeof input !== "string") {
		return invalid("STUDIO_SEARCH_REQUIRED", "Enter a studio name or TMDB studio ID.");
	}
	const value = input.trim();
	if (!value) {
		return Object.freeze({
			kind: "empty",
			message: "Enter a studio name or TMDB studio ID.",
		});
	}
	if (decimalIdPattern.test(value)) {
		const id = positiveSafeInteger(value);
		return id === null
			? invalid("INVALID_STUDIO_ID", "TMDB studio IDs must be positive safe integers.")
			: Object.freeze({ kind: "exact", id });
	}
	if (numericLikePattern.test(value)) {
		return invalid("INVALID_STUDIO_ID", "TMDB studio IDs must be positive whole numbers.");
	}
	return Object.freeze({
		kind: "search",
		query: value,
		eligible: value.length >= 2,
		message: value.length >= 2 ? null : "Enter at least two characters to search.",
	});
}

export function normalizeStudioCatalogueRow(value, { legacyImplicitZeroCount = false } = {}) {
	if (!plainObject(value)) return null;
	const id = typeof value.i === "number" && Number.isSafeInteger(value.i) && value.i > 0
		? value.i
		: null;
	const name = normalizedText(value.n);
	if (id === null || !name) return null;
	return Object.freeze({
		id,
		name,
		searchName: normalizedSearchText(name),
		parentCompany: normalizedText(value.p),
		searchParentCompany: normalizedSearchText(value.p),
		country: canonicalCountryCode(value.c),
		searchCountry: studioCountrySearchText(value.c),
		headquarters: normalizedText(value.h),
		searchHeadquarters: normalizedSearchText(value.h),
		logoPath: normalizeTmdbLogoPath(value.l),
		movieCount: Object.hasOwn(value, "t")
			? Number.isSafeInteger(value.t) && value.t >= 0 ? value.t : null
			: legacyImplicitZeroCount ? 0 : null,
	});
}

export function normalizeStudioCatalogue(value, { legacyImplicitZeroCounts = false } = {}) {
	if (!Array.isArray(value)) return null;
	const byId = new Map();
	for (const row of value) {
		const studio = normalizeStudioCatalogueRow(row, { legacyImplicitZeroCount: legacyImplicitZeroCounts });
		if (studio !== null && !byId.has(studio.id)) byId.set(studio.id, studio);
	}
	const studios = [...byId.values()].sort(compareStudios);
	return Object.freeze({
		studios: Object.freeze(studios),
		byId,
		countryCodes: new Set(studios.map((studio) => studio.country).filter(Boolean)),
	});
}

export function searchStudioCatalogue(catalogue, parsedInput, {
	page = 1,
	pageSize = STUDIO_SEARCH_PAGE_SIZE,
	sort = DEFAULT_STUDIO_SEARCH_SORT,
	hideZero = false,
} = {}) {
	if (
		!plainObject(catalogue)
		|| !Array.isArray(catalogue.studios)
		|| !(catalogue.byId instanceof Map)
		|| !(catalogue.countryCodes instanceof Set)
	) throw new TypeError("A normalized Studio catalogue is required.");
	if (!Number.isSafeInteger(page) || page <= 0 || !Number.isSafeInteger(pageSize) || pageSize <= 0) {
		throw new TypeError("Studio result pages and page sizes must be positive safe integers.");
	}
	if (!supportedSearchSorts.has(sort) || typeof hideZero !== "boolean") {
		throw new TypeError("Choose a supported Studio result sort and zero-count filter state.");
	}

	let rankedMatches;
	if (parsedInput?.kind === "exact") {
		const exact = catalogue.byId.get(parsedInput.id);
		rankedMatches = exact ? [{ studio: exact, tier: 0 }] : [];
	} else if (parsedInput?.kind === "search" && parsedInput.eligible) {
		const query = normalizedSearchText(parsedInput.query);
		const possibleCountryCode = parsedInput.query.trim().toUpperCase();
		const countryCodeQuery = /^[A-Z]{2}$/.test(possibleCountryCode)
			&& catalogue.countryCodes.has(possibleCountryCode)
			? possibleCountryCode
			: null;
		rankedMatches = catalogue.studios.flatMap((studio) => {
			const tier = matchStudio(studio, query, countryCodeQuery);
			return tier === null ? [] : [{ studio, tier }];
		});
	} else if (parsedInput?.kind === "browse") {
		rankedMatches = catalogue.studios.map((studio) => ({ studio, tier: 0 }));
	} else {
		rankedMatches = [];
	}

	rankedMatches = rankedMatches.filter(({ studio }) => !hideZero || studio.movieCount !== 0);
	rankedMatches.sort((left, right) => {
		if (sort === STUDIO_SEARCH_SORTS.BEST_MATCH) {
			return left.tier - right.tier || compareMovieCounts(left.studio, right.studio);
		}
		if (sort === STUDIO_SEARCH_SORTS.MOVIE_COUNT_DESC) {
			return compareMovieCounts(left.studio, right.studio);
		}
		return compareStudios(left.studio, right.studio);
	});
	const matches = rankedMatches.map(({ studio }) => studio);

	const totalResults = matches.length;
	const totalPages = Math.max(1, Math.ceil(totalResults / pageSize));
	const boundedPage = Math.min(page, totalPages);
	const start = (boundedPage - 1) * pageSize;
	return Object.freeze({
		results: Object.freeze(matches.slice(start, start + pageSize).map(publicStudio)),
		page: boundedPage,
		totalPages,
		totalResults,
	});
}

export function buildTmdbStudioLogoUrl(logoPath, size = "w92") {
	return buildTmdbLogoUrl(logoPath, size);
}

function providerError(kind, message, { retryable = true } = {}) {
	return Object.freeze({ ok: false, error: Object.freeze({ kind, message, retryable }) });
}

function resolveCatalogueUrl(value) {
	if (typeof value === "string" && value.trim()) return value;
	if (typeof document !== "undefined" && typeof document.baseURI === "string") {
		return new URL(STUDIO_CATALOGUE_PATH, document.baseURI).toString();
	}
	return STUDIO_CATALOGUE_PATH;
}

export function createStudioCatalogueProvider({
	fetchImpl = globalThis.fetch,
	catalogueUrl = null,
} = {}) {
	if (typeof fetchImpl !== "function") throw new TypeError("A Studio catalogue fetch implementation is required.");
	let catalogue = null;
	let pending = null;

	async function loadCatalogue() {
		if (catalogue !== null) return { ok: true, data: catalogue, fromCache: true };
		if (pending !== null) return pending;
		pending = (async () => {
			let response;
			try {
				response = await fetchImpl(resolveCatalogueUrl(catalogueUrl), {
					method: "GET",
					headers: { Accept: "application/json" },
				});
			} catch {
				return providerError("network", "Studios could not be loaded. Try again.");
			}
			if (!response?.ok) {
				return providerError("catalogue", "Studios could not be loaded. Try again.");
			}
			let value;
			try {
				value = await response.json();
			} catch {
				return providerError("invalid-catalogue", "Studios are unavailable. Try again.");
			}
			const hasExplicitZeroCount = Array.isArray(value) && value.some((row) => (
				plainObject(row)
				&& Object.hasOwn(row, "t")
				&& row.t === 0
			));
			const normalized = normalizeStudioCatalogue(value, {
				legacyImplicitZeroCounts: !hasExplicitZeroCount,
			});
			if (normalized === null) {
				return providerError("invalid-catalogue", "Studios are unavailable. Try again.");
			}
			catalogue = normalized;
			return { ok: true, data: catalogue, fromCache: false };
		})();
		const result = await pending;
		pending = null;
		return result;
	}

	async function searchStudios(input, {
		page = 1,
		sort = DEFAULT_STUDIO_SEARCH_SORT,
		hideZero = false,
	} = {}) {
		const parsedInput = typeof input === "string" ? parseStudioSearchInput(input) : input;
		if (
			!parsedInput
			|| parsedInput.kind === "empty"
			|| parsedInput.kind === "invalid"
			|| (parsedInput.kind === "search" && !parsedInput.eligible)
			|| !["exact", "search", "browse"].includes(parsedInput.kind)
		) {
			return providerError("invalid-request", "Enter a valid Studio name or positive TMDB studio ID.", { retryable: false });
		}
		const loaded = await loadCatalogue();
		if (!loaded.ok) return loaded;
		try {
			return { ok: true, data: searchStudioCatalogue(loaded.data, parsedInput, { page, sort, hideZero }) };
		} catch {
			return providerError("invalid-request", "Choose a valid Studio result page.", { retryable: false });
		}
	}

	return Object.freeze({ loadCatalogue, searchStudios });
}
