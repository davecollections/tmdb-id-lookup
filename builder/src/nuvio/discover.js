import { SOURCE_CATEGORIES } from "../domain/index.js";
import {
	cloneRawObject,
	overlayFilters,
	overlayKnownFields,
} from "./source-overlay.js";
import {
	DISCOVER_FILTER_FIELDS,
	SOURCE_EDITABLE_FIELDS,
} from "./known-fields.js";

export const DISCOVER_CLASSIFICATIONS = Object.freeze({
	CANONICAL: "CANONICAL",
	PRESERVABLE: "PRESERVABLE",
	NOT_NATIVE: "NOT_NATIVE",
});

export const DISCOVER_EDIT_READINESS = Object.freeze({
	FULLY_UNDERSTOOD: "FULLY_UNDERSTOOD",
	UNDERSTOOD_WITH_PRESERVED_EXTRAS: "UNDERSTOOD_WITH_PRESERVED_EXTRAS",
	PRESERVE_ONLY: "PRESERVE_ONLY",
});

export const DISCOVER_SORT_OPTIONS = Object.freeze([
	Object.freeze({ id: "popular", label: "Popular", values: Object.freeze({ MOVIE: "popularity.desc", TV: "popularity.desc" }) }),
	Object.freeze({ id: "recent", label: "Recent", values: Object.freeze({ MOVIE: "primary_release_date.desc", TV: "first_air_date.desc" }) }),
	Object.freeze({ id: "top-rated", label: "Top rated", values: Object.freeze({ MOVIE: "vote_average.desc", TV: "vote_average.desc" }) }),
	Object.freeze({ id: "most-votes", label: "Most voted", values: Object.freeze({ MOVIE: "vote_count.desc", TV: "vote_count.desc" }) }),
]);

export const DEFAULT_DISCOVER_SORT_OPTION_ID = DISCOVER_SORT_OPTIONS[0].id;
export const DEFAULT_DISCOVER_SORT = DISCOVER_SORT_OPTIONS[0].values.MOVIE;

const bothMedia = (requestParameter, tvRequestParameter = requestParameter) => Object.freeze({
	MOVIE: Object.freeze({ applicable: true, portable: true, requestParameter }),
	TV: Object.freeze({ applicable: true, portable: true, requestParameter: tvRequestParameter }),
});

const descriptor = (field, valueType, semanticType, media, {
	multiValue = null,
	conditionalOn = null,
	clientDivergence = null,
} = {}) => Object.freeze({
	field,
	valueType,
	semanticType,
	media,
	multiValue,
	conditionalOn,
	clientDivergence,
});

export const DISCOVER_FILTER_DESCRIPTORS = Object.freeze([
	descriptor("withGenres", "string", "id-expression", bothMedia("with_genres"), { multiValue: "comma-AND-or-pipe-OR" }),
	descriptor("releaseDateGte", "string", "date", bothMedia("primary_release_date.gte", "first_air_date.gte")),
	descriptor("releaseDateLte", "string", "date", bothMedia("primary_release_date.lte", "first_air_date.lte")),
	descriptor("voteAverageGte", "number", "rating", bothMedia("vote_average.gte")),
	descriptor("voteAverageLte", "number", "rating", bothMedia("vote_average.lte")),
	descriptor("voteCountGte", "integer", "vote-count", bothMedia("vote_count.gte")),
	descriptor("withOriginalLanguage", "string", "language-code", bothMedia("with_original_language")),
	descriptor("withOriginCountry", "string", "country-code", bothMedia("with_origin_country")),
	descriptor("withKeywords", "string", "id-expression", bothMedia("with_keywords"), { multiValue: "comma-AND-or-pipe-OR" }),
	descriptor("withCompanies", "string", "id-expression", bothMedia("with_companies"), { multiValue: "comma-AND-or-pipe-OR" }),
	descriptor("withNetworks", "string", "single-id", Object.freeze({
		MOVIE: Object.freeze({ applicable: false, portable: false, requestParameter: null }),
		TV: Object.freeze({ applicable: true, portable: true, requestParameter: "with_networks" }),
	}), {
		clientDivergence: "Desktop/Mobile forward an undocumented Movie parameter; TV/Web omit it.",
	}),
	descriptor("year", "integer", "year", bothMedia("year", "first_air_date_year")),
	descriptor("watchRegion", "string", "region-code", bothMedia("watch_region"), { conditionalOn: "withWatchProviders" }),
	descriptor("withWatchProviders", "string", "id-expression", bothMedia("with_watch_providers"), {
		multiValue: "comma-AND-or-pipe-OR",
		clientDivergence: "Active providers default a missing region to US and inject all supported monetization types.",
	}),
]);

const descriptorByField = new Map(DISCOVER_FILTER_DESCRIPTORS.map((entry) => [entry.field, entry]));
const expressionFields = new Set(DISCOVER_FILTER_DESCRIPTORS
	.filter((entry) => entry.multiValue !== null)
	.map((entry) => entry.field));
const canonicalSourceFields = Object.freeze(["filters", "mediaType", "provider", "sortBy", "title", "tmdbId", "tmdbSourceType"]);

if (DISCOVER_FILTER_FIELDS.join("\u0000") !== DISCOVER_FILTER_DESCRIPTORS.map((entry) => entry.field).join("\u0000")) {
	throw new Error("DISCOVER filter descriptors must match the authoritative recognized field list.");
}

export function discoverFilterDescriptor(field) {
	return descriptorByField.get(field) ?? null;
}

export function discoverSortValue(sortOptionId, mediaType) {
	const option = DISCOVER_SORT_OPTIONS.find((entry) => entry.id === sortOptionId);
	return option?.values?.[normaliseCase(mediaType, "upper")] ?? null;
}

export function discoverSortOptionId(sortBy, mediaType) {
	const canonicalMediaType = normaliseCase(mediaType, "upper");
	return DISCOVER_SORT_OPTIONS.find((entry) => entry.values[canonicalMediaType] === sortBy)?.id ?? null;
}

export function effectiveDiscoverSort(sortBy) {
	if (sortBy === undefined || sortBy === null || sortBy === "") return DEFAULT_DISCOVER_SORT;
	return typeof sortBy === "string" ? sortBy : null;
}

export function buildDiscoverSourceDraft({
	title,
	mediaType,
	sortOptionId = DEFAULT_DISCOVER_SORT_OPTION_ID,
	filters = {},
} = {}) {
	const errors = [];
	const canonicalTitle = canonicalText(title);
	if (!canonicalTitle || title !== canonicalTitle) {
		errors.push(diagnostic("INVALID_DISCOVER_TITLE", "$discover.title", "A canonical DISCOVER title must be non-empty and trimmed."));
	}
	if (!["MOVIE", "TV"].includes(mediaType)) {
		errors.push(diagnostic("INVALID_DISCOVER_MEDIA_TYPE", "$discover.mediaType", "A canonical DISCOVER source must use MOVIE or TV."));
	}
	const sortBy = discoverSortValue(sortOptionId, mediaType);
	if (sortBy === null) {
		errors.push(diagnostic("INVALID_DISCOVER_SORT", "$discover.sortOptionId", "Choose a supported semantic sort for the selected media type."));
	}
	const filterResult = canonicalBuilderFilters(filters, mediaType);
	errors.push(...filterResult.errors);
	if (errors.length > 0) return { ok: false, draft: null, errors };

	return {
		ok: true,
		errors: [],
		draft: {
			category: SOURCE_CATEGORIES.NATIVE_TMDB,
			editable: {
				title: canonicalTitle,
				sortBy,
				tmdbId: null,
				filters: filterResult.filters,
				provider: "tmdb",
				mediaType,
				tmdbSourceType: "DISCOVER",
			},
		},
	};
}

export function canonicalizeDiscoverFiltersForComparison(filters) {
	if (filters === undefined) return comparableFilters({});
	if (!plainObject(filters)) {
		return nonComparable("NON_OBJECT_DISCOVER_FILTERS", "DISCOVER filters must be a plain object before they can be compared.");
	}

	const canonicalEntries = [];
	for (const field of Object.keys(filters).sort()) {
		const value = filters[field];
		const known = descriptorByField.has(field);
		if (known && (value === null || value === undefined)) continue;
		if (known && typeof value === "string" && value.trim().length === 0) continue;
		if (known && expressionFields.has(field) && typeof value === "string") {
			canonicalEntries.push([field, canonicalIdExpression(value)]);
			continue;
		}
		const canonicalValue = canonicalJsonValue(value);
		if (!canonicalValue.ok) return nonComparable(canonicalValue.code, canonicalValue.message);
		canonicalEntries.push([field, canonicalValue.value]);
	}

	const activeProviders = canonicalEntries.find(([field]) => field === "withWatchProviders")?.[1];
	const providerIsActive = typeof activeProviders === "string" && activeProviders.trim().length > 0;
	const withoutRegion = canonicalEntries.filter(([field]) => field !== "watchRegion");
	if (providerIsActive) {
		const region = canonicalEntries.find(([field]) => field === "watchRegion");
		withoutRegion.push(["watchRegion", region ? region[1] : "US"]);
	}
	withoutRegion.sort(([left], [right]) => left.localeCompare(right));
	return comparableFilters(objectFromEntries(withoutRegion));
}

export function resolveEffectiveDiscoverSource(sourceNode) {
	if (!plainObject(sourceNode) || sourceNode.nodeType !== "source") {
		return effectiveSourceFailure("INVALID_DISCOVER_SOURCE_NODE", "An effective DISCOVER source requires a Builder SourceNode.");
	}
	if (sourceNode.category !== SOURCE_CATEGORIES.NATIVE_TMDB) {
		return effectiveSourceFailure("NOT_NATIVE_DISCOVER_NODE", "The SourceNode is not categorized as a native TMDB source.");
	}
	if (!plainObject(sourceNode.editable)) {
		return effectiveSourceFailure("INVALID_DISCOVER_NODE_EDITABLE", "The SourceNode editable value must be a plain object.");
	}
	if (Object.hasOwn(sourceNode, "rawImported") && !plainObject(sourceNode.rawImported)) {
		return effectiveSourceFailure("INVALID_DISCOVER_NODE_RAW", "The SourceNode rawImported value must be a plain object when present.");
	}
	if (Object.hasOwn(sourceNode.editable, "filters") && !plainObject(sourceNode.editable.filters)) {
		return effectiveSourceFailure("INVALID_DISCOVER_NODE_FILTERS", "The SourceNode editable filters value must be a plain object when present.");
	}

	try {
		const effective = overlayKnownFields(
			cloneRawObject(sourceNode.rawImported),
			sourceNode.editable,
			SOURCE_EDITABLE_FIELDS,
		);
		if (Object.hasOwn(sourceNode.editable, "filters")) {
			overlayFilters(effective, sourceNode.editable, sourceNode.rawImported);
		}
		return Object.freeze({ ok: true, value: effective, reasons: Object.freeze([]) });
	} catch {
		return effectiveSourceFailure("INVALID_DISCOVER_NODE_DATA", "The SourceNode contains data that cannot be materialized as detached JSON.");
	}
}

export function discoverSourceNodeIdentity(sourceNode) {
	const effective = resolveEffectiveDiscoverSource(sourceNode);
	if (!effective.ok) {
		return Object.freeze({ comparable: false, key: null, value: null, reasons: effective.reasons });
	}
	return discoverSourceIdentity(effective.value);
}

export function inspectDiscoverSourceNode(sourceNode) {
	const effective = resolveEffectiveDiscoverSource(sourceNode);
	if (!effective.ok) {
		return inspection(
			DISCOVER_CLASSIFICATIONS.NOT_NATIVE,
			false,
			false,
			effective.reasons.map((reason) => reason.code),
		);
	}
	return inspectDiscoverSource(effective.value);
}

export function discoverSourceIdentity(source) {
	if (!plainObject(source)) return nonComparableIdentity("NON_OBJECT_DISCOVER_SOURCE", "A DISCOVER identity requires a plain source object.");
	const provider = normaliseCase(source.provider, "lower");
	const sourceType = normaliseCase(source.tmdbSourceType, "upper");
	const mediaType = normaliseCase(source.mediaType, "upper");
	if (provider !== "tmdb" || sourceType !== "DISCOVER" || !["MOVIE", "TV"].includes(mediaType)) {
		return nonComparableIdentity("NOT_NATIVE_DISCOVER", "The source is not a recognized native TMDB DISCOVER source.");
	}
	const sortBy = effectiveDiscoverSort(source.sortBy);
	if (sortBy === null) return nonComparableIdentity("NON_STRING_DISCOVER_SORT", "A DISCOVER sort must be a string, null, or absent.");
	const filters = canonicalizeDiscoverFiltersForComparison(Object.hasOwn(source, "filters") ? source.filters : undefined);
	if (!filters.comparable) return { comparable: false, key: null, value: null, reasons: filters.reasons };

	const identity = {
		provider: "tmdb",
		tmdbSourceType: "DISCOVER",
		mediaType,
		sortBy,
		filters: filters.value,
	};
	if (source.tmdbId !== undefined && source.tmdbId !== null) {
		const customId = canonicalJsonValue(source.tmdbId);
		if (!customId.ok) return nonComparableIdentity(customId.code, customId.message);
		identity.customTmdbId = customId.value;
	}
	const stableIdentity = canonicalJsonValue(identity);
	if (!stableIdentity.ok) return nonComparableIdentity(stableIdentity.code, stableIdentity.message);
	return Object.freeze({ comparable: true, key: JSON.stringify(stableIdentity.value), value: stableIdentity.value, reasons: Object.freeze([]) });
}

export function inspectDiscoverSource(source) {
	const reasons = [];
	if (!plainObject(source)) return inspection(DISCOVER_CLASSIFICATIONS.NOT_NATIVE, false, false, ["NON_OBJECT_DISCOVER_SOURCE"]);
	const provider = normaliseCase(source.provider, "lower");
	const sourceType = normaliseCase(source.tmdbSourceType, "upper");
	const mediaType = normaliseCase(source.mediaType, "upper");
	if (provider !== "tmdb" || sourceType !== "DISCOVER" || !["MOVIE", "TV"].includes(mediaType)) {
		return inspection(DISCOVER_CLASSIFICATIONS.NOT_NATIVE, false, false, ["NOT_NATIVE_DISCOVER"]);
	}

	if (source.provider !== "tmdb") reasons.push("NONCANONICAL_PROVIDER");
	if (source.tmdbSourceType !== "DISCOVER") reasons.push("NONCANONICAL_SOURCE_TYPE");
	if (source.mediaType !== mediaType) reasons.push("NONCANONICAL_MEDIA_TYPE");
	if (source.title !== canonicalText(source.title) || !canonicalText(source.title)) reasons.push("NONCANONICAL_TITLE");
	if (!Object.hasOwn(source, "tmdbId") || source.tmdbId !== null) reasons.push("NONCANONICAL_TMDB_ID");
	if (discoverSortOptionId(source.sortBy, mediaType) === null) reasons.push("NONCANONICAL_SORT");
	if (!sameKeys(source, canonicalSourceFields)) reasons.push("NONCANONICAL_SOURCE_FIELDS");

	let knownFieldEditingSafe = true;
	const editableKnownFields = [];
	const preservedUnknownFields = [];
	const unsafeKnownFields = [];
	const preservedSourceFields = Object.keys(source).filter((field) => !canonicalSourceFields.includes(field));
	if (!plainObject(source.filters)) {
		reasons.push("NON_OBJECT_DISCOVER_FILTERS");
		knownFieldEditingSafe = false;
	} else {
		for (const [field, value] of Object.entries(source.filters)) {
			const known = descriptorByField.get(field);
			if (!known) {
				reasons.push("UNKNOWN_DISCOVER_FILTER");
				preservedUnknownFields.push(field);
				continue;
			}
			if (value === null || (typeof value === "string" && value.trim().length === 0)) {
				reasons.push("NONCANONICAL_DISCOVER_FILTER");
				continue;
			}
			const valueIsCanonical = canonicalFilterValue(value, known);
			if (!valueIsCanonical) {
				reasons.push("NONCANONICAL_DISCOVER_FILTER");
				knownFieldEditingSafe = false;
				unsafeKnownFields.push(field);
			}
			if (field === "withNetworks" && mediaType === "MOVIE") {
				reasons.push("NONPORTABLE_MOVIE_NETWORKS");
				knownFieldEditingSafe = false;
				unsafeKnownFields.push(field);
			} else if (valueIsCanonical) {
				editableKnownFields.push(field);
			}
		}
		if (Object.hasOwn(source.filters, "watchRegion") && !activeWatchProviders(source.filters)) {
			reasons.push("INACTIVE_WATCH_REGION");
		}
		if (hasContradictoryFullDateRange(source.filters)) {
			reasons.push("CONTRADICTORY_DISCOVER_DATE_RANGE");
		}
	}

	const identity = discoverSourceIdentity(source);
	const classification = reasons.length === 0 ? DISCOVER_CLASSIFICATIONS.CANONICAL : DISCOVER_CLASSIFICATIONS.PRESERVABLE;
	const effectiveSort = effectiveDiscoverSort(source.sortBy);
	const hasUnusualSort = effectiveSort === null || discoverSortOptionId(effectiveSort, mediaType) === null;
	const hasPreservedExtras = preservedUnknownFields.length > 0
		|| preservedSourceFields.length > 0
		|| (Object.hasOwn(source, "tmdbId") && source.tmdbId !== null)
		|| hasUnusualSort;
	const editReadiness = !identity.comparable || !knownFieldEditingSafe
		? DISCOVER_EDIT_READINESS.PRESERVE_ONLY
		: hasPreservedExtras
			? DISCOVER_EDIT_READINESS.UNDERSTOOD_WITH_PRESERVED_EXTRAS
			: DISCOVER_EDIT_READINESS.FULLY_UNDERSTOOD;
	return inspection(classification, identity.comparable, knownFieldEditingSafe, reasons, {
		editReadiness,
		editableKnownFields,
		preservedUnknownFields,
		unsafeKnownFields,
		preservedSourceFields,
	});
}

function canonicalBuilderFilters(filters, mediaType) {
	if (!plainObject(filters)) {
		return { filters: null, errors: [diagnostic("INVALID_DISCOVER_FILTERS", "$discover.filters", "Canonical DISCOVER filters must be a plain object.")] };
	}
	const output = {};
	const errors = [];
	for (const [field, value] of Object.entries(filters)) {
		const known = descriptorByField.get(field);
		if (!known) {
			errors.push(diagnostic("UNKNOWN_DISCOVER_FILTER", `$discover.filters.${field}`, "Builder-created DISCOVER sources may contain only recognized filters."));
			continue;
		}
		if (value === null || value === undefined || (typeof value === "string" && value.trim().length === 0)) continue;
		if (field === "withNetworks" && mediaType === "MOVIE") {
			errors.push(diagnostic("NONPORTABLE_MOVIE_NETWORKS", "$discover.filters.withNetworks", "Movie withNetworks is client-divergent and cannot be canonical Builder-created DISCOVER behavior."));
			continue;
		}
		if (!canonicalFilterValue(value, known)) {
			errors.push(diagnostic("INVALID_DISCOVER_FILTER_VALUE", `$discover.filters.${field}`, `The ${field} filter must use its canonical ${known.valueType} representation.`));
			continue;
		}
		setOwn(output, field, value);
	}
	if (Object.hasOwn(output, "watchRegion") && !activeWatchProviders(output)) {
		errors.push(diagnostic("DISCOVER_REGION_REQUIRES_PROVIDERS", "$discover.filters.watchRegion", "A canonical watch region requires an active watch-provider filter."));
	}
	if (hasContradictoryFullDateRange(output)) {
		errors.push(diagnostic(
			"CONTRADICTORY_DISCOVER_DATE_RANGE",
			"$discover.filters",
			"The release date start must not be after the release date end.",
		));
	}
	return { filters: output, errors };
}

function canonicalFilterValue(value, known) {
	if (known.valueType === "number") return typeof value === "number" && Number.isFinite(value);
	if (known.valueType === "integer") return Number.isSafeInteger(value);
	if (typeof value !== "string" || !value || value !== value.trim()) return false;
	if (known.semanticType === "id-expression") return strictIdExpression(value);
	if (known.semanticType === "single-id") return /^[1-9]\d*$/.test(value);
	return true;
}

function hasContradictoryFullDateRange(filters) {
	const lower = filters.releaseDateGte;
	const upper = filters.releaseDateLte;
	return isStrictValidCalendarDate(lower)
		&& isStrictValidCalendarDate(upper)
		&& lower > upper;
}

function isStrictValidCalendarDate(value) {
	if (typeof value !== "string") return false;
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!match) return false;
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	if (year < 1 || month < 1 || month > 12 || day < 1) return false;
	const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
	const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
	return day <= daysInMonth[month - 1];
}

function activeWatchProviders(filters) {
	return typeof filters.withWatchProviders === "string" && filters.withWatchProviders.trim().length > 0;
}

function strictIdExpression(value) {
	if (/^[1-9]\d*$/.test(value)) return true;
	return /^[1-9]\d*(,[1-9]\d*)+$/.test(value) || /^[1-9]\d*(\|[1-9]\d*)+$/.test(value);
}

function canonicalIdExpression(value) {
	if (!strictIdExpression(value) || (!value.includes(",") && !value.includes("|"))) return value;
	const delimiter = value.includes(",") ? "," : "|";
	return value.split(delimiter).sort(compareDecimalTokens).join(delimiter);
}

function compareDecimalTokens(left, right) {
	const leftNumber = BigInt(left);
	const rightNumber = BigInt(right);
	return leftNumber < rightNumber ? -1 : leftNumber > rightNumber ? 1 : 0;
}

function canonicalJsonValue(value, ancestors = new WeakSet()) {
	if (value === null || typeof value === "string" || typeof value === "boolean") return { ok: true, value };
	if (typeof value === "number") {
		return Number.isFinite(value)
			? { ok: true, value: Object.is(value, -0) ? 0 : value }
			: { ok: false, code: "NON_FINITE_DISCOVER_VALUE", message: "DISCOVER comparison data must contain only finite numbers." };
	}
	if (typeof value !== "object") return { ok: false, code: "NON_JSON_DISCOVER_VALUE", message: "DISCOVER comparison data must be JSON-compatible." };
	if (ancestors.has(value)) return { ok: false, code: "CIRCULAR_DISCOVER_VALUE", message: "DISCOVER comparison data must not contain circular references." };
	ancestors.add(value);
	if (Array.isArray(value)) {
		const output = [];
		for (let index = 0; index < value.length; index += 1) {
			if (!Object.hasOwn(value, index)) return { ok: false, code: "SPARSE_DISCOVER_ARRAY", message: "DISCOVER comparison arrays must not be sparse." };
			const entry = canonicalJsonValue(value[index], ancestors);
			if (!entry.ok) return entry;
			output.push(entry.value);
		}
		ancestors.delete(value);
		return { ok: true, value: output };
	}
	if (!plainObject(value)) return { ok: false, code: "NON_PLAIN_DISCOVER_OBJECT", message: "DISCOVER comparison data must contain only plain objects and arrays." };
	const entries = [];
	for (const key of Object.keys(value).sort()) {
		const entry = canonicalJsonValue(value[key], ancestors);
		if (!entry.ok) return entry;
		entries.push([key, entry.value]);
	}
	ancestors.delete(value);
	return { ok: true, value: objectFromEntries(entries) };
}

function objectFromEntries(entries) {
	const output = {};
	for (const [key, value] of entries) setOwn(output, key, value);
	return output;
}

function setOwn(target, key, value) {
	Object.defineProperty(target, key, { configurable: true, enumerable: true, value, writable: true });
}

function comparableFilters(value) {
	return Object.freeze({ comparable: true, value, reasons: Object.freeze([]) });
}

function effectiveSourceFailure(code, message) {
	return Object.freeze({
		ok: false,
		value: null,
		reasons: Object.freeze([Object.freeze({ code, message })]),
	});
}

function nonComparable(code, message) {
	return Object.freeze({ comparable: false, value: null, reasons: Object.freeze([Object.freeze({ code, message })]) });
}

function nonComparableIdentity(code, message) {
	return Object.freeze({ comparable: false, key: null, value: null, reasons: Object.freeze([Object.freeze({ code, message })]) });
}

function inspection(classification, comparisonSafe, knownFieldEditingSafe, reasons, {
	editReadiness = null,
	editableKnownFields = [],
	preservedUnknownFields = [],
	unsafeKnownFields = [],
	preservedSourceFields = [],
} = {}) {
	return Object.freeze({
		classification,
		capabilities: Object.freeze({
			comparisonSafe,
			knownFieldEditingSafe,
			editReadiness,
			editableKnownFields: Object.freeze([...new Set(editableKnownFields)]),
			preservedUnknownFields: Object.freeze([...new Set(preservedUnknownFields)]),
			unsafeKnownFields: Object.freeze([...new Set(unsafeKnownFields)]),
			preservedSourceFields: Object.freeze([...new Set(preservedSourceFields)]),
		}),
		reasons: Object.freeze([...new Set(reasons)]),
	});
}

function normaliseCase(value, direction) {
	if (typeof value !== "string") return "";
	return direction === "lower" ? value.toLowerCase() : value.toUpperCase();
}

function canonicalText(value) {
	return typeof value === "string" ? value.trim() : "";
}

function plainObject(value) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

function sameKeys(value, expected) {
	return plainObject(value) && Object.keys(value).sort().join("\u0000") === [...expected].sort().join("\u0000");
}

function diagnostic(code, path, message) {
	return { code, path, message };
}
