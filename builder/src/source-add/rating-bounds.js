import { validateAdvancedFilters } from "./advanced-discover.js";
import { resolveEffectiveDiscoverSource } from "../nuvio/discover.js";
import { discoverImportedMirrors, inspectDiscoverMirrors } from "../nuvio/discover-imported-filters.js";

export const RATING_BOUNDS_FIELDS = Object.freeze(["voteAverageGte", "voteAverageLte"]);

export function ratingBoundsFilters(filters = {}) {
 return Object.fromEntries(RATING_BOUNDS_FIELDS.filter((field) => Object.hasOwn(filters, field)).map((field) => [field, filters[field]]));
}

// Guard JSON shape before the existing authored validator can coerce containers.
// Grammar, range and pair ordering remain owned by Advanced Discover.
export function validateRatingBounds(filters = {}, mediaType = "MOVIE") {
 const pair = ratingBoundsFilters(filters);
 const errors = Object.entries(pair).filter(([, value]) => value !== undefined && value !== null && !["number", "string"].includes(typeof value))
  .map(([field]) => ({ code: "INVALID_DISCOVER_FIELD", path: "$discover." + field, message: "Review " + (field === "voteAverageGte" ? "minimum" : "maximum") + " rating." }));
 if (errors.length) return { ok: false, filters: {}, errors };
 const result = validateAdvancedFilters(pair, mediaType, { fields: RATING_BOUNDS_FIELDS });
 if (!result.ok) return result;
 // Validate the actual canonical wire text, not a fixed decimal-place limit.
 // Number("0.0000001") serializes as "1e-7", outside the Worker rating grammar.
 const request = Object.fromEntries(Object.entries(result.filters).map(([field, value]) => [field, String(value)]));
 const representable = validateAdvancedFilters(request, mediaType, { fields: RATING_BOUNDS_FIELDS });
 return representable.ok ? result : { ...representable, filters: {}, errors: representable.errors.map((error) => ({ ...error, message: error.message + " This value cannot be requested without changing it." })) };
}

function inspectRatingBoundsValue(value) {
 const validation = validateRatingBounds(value.filters ?? {}, value.mediaType.trim().toUpperCase());
 const unresolved = inspectDiscoverMirrors(value).unresolved.some((entry) => RATING_BOUNDS_FIELDS.includes(entry.field));
 return { editable: validation.ok && !unresolved, filters: validation.filters };
}

export function inspectRatingBounds(source) {
 const effective = resolveEffectiveDiscoverSource(source);
 return effective.ok ? inspectRatingBoundsValue(effective.value) : { editable: false, filters: {} };
}

// Untouched bounds come from storage, even if a caller omits them from the draft.
export function validateRatingBoundsEdit(source, draft) {
 const effective = resolveEffectiveDiscoverSource(source);
 if (!effective.ok || !inspectRatingBoundsValue(effective.value).editable) return { ok: false, filters: {}, errors: [{ code: "SOURCE_EDIT_RATING_PRESERVED", path: "$sourceEdit.filters", message: "These imported rating settings must be preserved." }] };
 const pair = ratingBoundsFilters(effective.value.filters ?? {});
 for (const field of draft.touchedFilters.filter((field) => RATING_BOUNDS_FIELDS.includes(field))) {
  if (Object.hasOwn(draft.filters ?? {}, field)) pair[field] = draft.filters[field]; else delete pair[field];
 }
 return validateRatingBounds(pair, draft.mediaType);
}

// Limit touched patch ownership to the established equivalent mirrors. Inactive
// null/empty aliases and conflicting/alias-only data must remain in raw storage.
export function ownedRatingMirrorSource(original) {
 const filters = { ...original.filters }, equivalent = inspectDiscoverMirrors(original).equivalent;
 for (const [alias, field] of Object.entries(discoverImportedMirrors(original.mediaType))) {
  if (RATING_BOUNDS_FIELDS.includes(field) && !equivalent.includes(alias)) delete filters[alias];
 }
 return { ...original, filters };
}

export function ratingBoundsComparisonFilters(filters, value) {
 const inspected = inspectRatingBoundsValue({ ...value, filters });
 if (!inspected.editable) return filters;
 const result = { ...filters };
 for (const field of RATING_BOUNDS_FIELDS) if (Object.hasOwn(inspected.filters, field)) result[field] = inspected.filters[field];
 const mirrors = discoverImportedMirrors(value.mediaType);
 for (const alias of inspectDiscoverMirrors(value).equivalent) if (RATING_BOUNDS_FIELDS.includes(mirrors[alias])) delete result[alias];
 return result;
}
