import { NATIVE_ADVANCED_FIELDS, validateNativeAdvancedFilters, nativeExtraComparisonFilters } from "./native-shared-advanced.js";
import { nativeEntityPreviewQuery } from "./native-entity-preview-query.js";
import { minimumVotesComparisonFilters } from "./minimum-votes.js";
import { ratingBoundsComparisonFilters } from "./rating-bounds.js";
export { inspectMinimumVotes as inspectStudioMinimumVotes } from "./minimum-votes.js";

export const STUDIO_ADVANCED_FIELDS = NATIVE_ADVANCED_FIELDS;

export function validateStudioAdvancedFilters(filters = {}, mediaType = "MOVIE") {
 return validateNativeAdvancedFilters(filters, mediaType);
}

export function studioComparisonFilters(filters, value) {
 return nativeExtraComparisonFilters(ratingBoundsComparisonFilters(minimumVotesComparisonFilters(filters, value), value), value);
}

export function studioPreviewQuery(studioId, options) {
 return nativeEntityPreviewQuery(studioId, "withCompanies", options);
}
