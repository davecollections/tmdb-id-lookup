import { MINIMUM_VOTES_FIELDS, validateMinimumVotesFilters, minimumVotesComparisonFilters } from "./minimum-votes.js";
import { RATING_BOUNDS_FIELDS, validateRatingBounds, ratingBoundsComparisonFilters } from "./rating-bounds.js";
import { nativeEntityPreviewQuery } from "./native-entity-preview-query.js";

export const NETWORK_ADVANCED_FIELDS = Object.freeze([...MINIMUM_VOTES_FIELDS, ...RATING_BOUNDS_FIELDS]);

export function networkComparisonFilters(filters, value) {
 return ratingBoundsComparisonFilters(minimumVotesComparisonFilters(filters, value), value);
}

export function networkPreviewQuery(networkId, { mediaType = "TV", ...options } = {}) {
 return mediaType === "TV" ? nativeEntityPreviewQuery(networkId, "withNetworks", { ...options, mediaType }) : null;
}

// Creation accepts only the approved native filter subset, including empty values.
export function validateNetworkAdvancedFilters(filters = {}) {
 if (!filters || typeof filters !== "object" || Array.isArray(filters)) return { ok: false, filters: {}, errors: [{ code: "INVALID_NETWORK_FILTERS", path: "$network.filters", message: "Network filters must be an object containing supported Advanced settings." }] };
 const minimum = validateMinimumVotesFilters(Object.fromEntries(Object.entries(filters).filter(([field]) => !RATING_BOUNDS_FIELDS.includes(field))), "TV");
 const ratings = validateRatingBounds(filters, "TV");
 const result = { ok: minimum.ok && ratings.ok, filters: { ...minimum.filters, ...ratings.filters }, errors: [...minimum.errors, ...ratings.errors] };
 const unsupported = Object.keys(filters).filter((field) => !NETWORK_ADVANCED_FIELDS.includes(field));
 if (!unsupported.length) return result;
 return { ...result, ok: false, errors: [...result.errors, ...unsupported.map((field) => ({
  code: "INVALID_NETWORK_FILTERS", path: "$network.filters." + field, message: "Only Minimum votes and rating bounds can be configured for a new Network source.",
 }))] };
}
