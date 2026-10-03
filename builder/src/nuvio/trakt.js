import { SOURCE_CATEGORIES } from "../domain/model.js";
import { NATIVE_TRAKT_EDITABLE_FIELDS } from "./known-fields.js";
import { cloneRawObject, isPlainObject, overlayKnownFields } from "./source-overlay.js";
import { isValidNuvioTitle } from "./titles.js";

// Current client contract and its evidence: docs/v2/BUILDER_TRAKT_SOURCES.md.
export const TRAKT_SORT_VALUES = Object.freeze(["rank", "added", "title", "released", "runtime", "popularity", "percentage", "votes"]);
export const TRAKT_SORT_DIRECTIONS = Object.freeze(["asc", "desc"]);
export const isCanonicalTraktListId = (value) => typeof value === "number" && Number.isSafeInteger(value) && value > 0;

export function validateNativeTraktSource(value, { authored = false, path = "$source" } = {}) {
	const errors = [];
	const add = (code, field, message) => errors.push(Object.freeze({ code, path: `${path}${field ? `.${field}` : ""}`, message }));
	if (!isPlainObject(value)) {
		add("INVALID_NATIVE_TRAKT_SOURCE", "", "A native Trakt source must be a plain object.");
		return Object.freeze({ ok: false, errors: Object.freeze(errors) });
	}
	if (authored && (Object.keys(value).length !== NATIVE_TRAKT_EDITABLE_FIELDS.length || Object.keys(value).some((key) => !NATIVE_TRAKT_EDITABLE_FIELDS.includes(key)))) {
		add("INVALID_NATIVE_TRAKT_FIELDS", "", "A new native Trakt source must contain exactly its six canonical fields.");
	}
	const provider = typeof value.provider === "string" ? value.provider.toLowerCase() : null;
	const mediaType = typeof value.mediaType === "string" ? value.mediaType.toUpperCase() : null;
	if (provider !== "trakt" || (authored && value.provider !== "trakt")) add("INVALID_NATIVE_TRAKT_PROVIDER", "provider", "A native Trakt source provider must be trakt.");
	if (!isCanonicalTraktListId(value.traktListId)) add("NATIVE_TRAKT_LIST_ID_REQUIRED", "traktListId", "A native Trakt List ID must be a positive safe integer number.");
	if (!["MOVIE", "TV"].includes(mediaType) || (authored && value.mediaType !== mediaType)) add("INVALID_NATIVE_TRAKT_MEDIA_TYPE", "mediaType", "A native Trakt source mediaType must be MOVIE or TV.");
	if (!TRAKT_SORT_VALUES.includes(value.sortBy)) add("UNSUPPORTED_NATIVE_TRAKT_SORT", "sortBy", "The Trakt sort is missing or unsupported.");
	if (!TRAKT_SORT_DIRECTIONS.includes(value.sortHow)) add("UNSUPPORTED_NATIVE_TRAKT_SORT_DIRECTION", "sortHow", "The Trakt sort direction is missing or unsupported.");
	if (authored && !isValidNuvioTitle(value.title)) add("NATIVE_TRAKT_TITLE_REQUIRED", "title", "Enter a valid name for this Trakt source.");
	return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors) });
}

// Comparison/presentation view only. Never normalize persisted imported values.
export function inspectNativeTraktSource(source) {
	if (source?.category !== SOURCE_CATEGORIES.NATIVE_TRAKT || !isPlainObject(source.editable)) return null;
	if (Object.hasOwn(source, "rawImported") && !isPlainObject(source.rawImported)) return null;
	try {
		const value = overlayKnownFields(cloneRawObject(source.rawImported), source.editable, NATIVE_TRAKT_EDITABLE_FIELDS);
		if (!validateNativeTraktSource(value).ok) return null;
		return Object.freeze({ value, provider: "trakt", traktListId: value.traktListId, mediaType: value.mediaType.toUpperCase(), sortBy: value.sortBy, sortHow: value.sortHow });
	} catch { return null; }
}

export function nativeTraktPhysicalIdentity(source) {
	const inspected = inspectNativeTraktSource(source);
	return inspected ? `trakt|${inspected.traktListId}|${inspected.mediaType}` : null;
}

// Exact configured equivalence fails closed for unknown extra semantics.
// Physical identity and name-only editing remain available for those imports.
// Title participates only when a caller explicitly needs presentation equality.
export function nativeTraktConfigurationKey(source, { includeTitle = false } = {}) {
	const inspected = inspectNativeTraktSource(source);
	if (!inspected) return null;
	if (Object.keys(inspected.value).some((field) => !NATIVE_TRAKT_EDITABLE_FIELDS.includes(field))) return null;
	return JSON.stringify([`trakt|${inspected.traktListId}|${inspected.mediaType}`, inspected.sortBy, inspected.sortHow, ...(includeTitle ? [inspected.value.title ?? null] : [])]);
}

export function nativeTraktSortLabel(source) {
	const inspected = inspectNativeTraktSource(source);
	if (!inspected) return null;
	const labels = { rank: "List order", added: "Date added", title: "Title", released: "Release date", runtime: "Runtime", popularity: "Popularity", percentage: "Rating", votes: "Votes" };
	return `${labels[inspected.sortBy]} · ${inspected.sortHow === "asc" ? "Ascending" : "Descending"}`;
}
