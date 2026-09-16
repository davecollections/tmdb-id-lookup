import { nativeEntityPreviewQuery } from "./native-entity-preview-query.js";
import { MINIMUM_VOTES_FIELDS, validateMinimumVotesFilters, minimumVotesComparisonFilters } from "./minimum-votes.js";
import { RATING_BOUNDS_FIELDS, validateRatingBounds, ratingBoundsComparisonFilters } from "./rating-bounds.js";
export { inspectMinimumVotes as inspectStudioMinimumVotes } from "./minimum-votes.js";

export const STUDIO_ADVANCED_FIELDS = Object.freeze([...MINIMUM_VOTES_FIELDS, ...RATING_BOUNDS_FIELDS]);

export function validateStudioAdvancedFilters(filters = {}, mediaType = "MOVIE") {
 if (!filters || typeof filters !== "object" || Array.isArray(filters)) return { ok: false, filters: {}, errors: [{ code: "INVALID_STUDIO_FILTERS", path: "$studio.filters", message: "Studio filters must be an object containing supported Advanced settings." }] };
 const minimum = validateMinimumVotesFilters(Object.fromEntries(Object.entries(filters).filter(([field]) => !RATING_BOUNDS_FIELDS.includes(field))), mediaType);
 const ratings = validateRatingBounds(filters, mediaType);
 return { ok: minimum.ok && ratings.ok, filters: { ...minimum.filters, ...ratings.filters }, errors: [...minimum.errors, ...ratings.errors] };
}

export function studioComparisonFilters(filters, value) {
 return ratingBoundsComparisonFilters(minimumVotesComparisonFilters(filters, value), value);
}

export function studioPreviewQuery(studioId, options) {
 return nativeEntityPreviewQuery(studioId, "withCompanies", options);
}
