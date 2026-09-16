import { NATIVE_ADVANCED_FIELDS, validateNativeAdvancedFilters, nativeExtraComparisonFilters } from "./native-shared-advanced.js";
import { minimumVotesComparisonFilters } from "./minimum-votes.js";
import { ratingBoundsComparisonFilters } from "./rating-bounds.js";
import { nativeEntityPreviewQuery } from "./native-entity-preview-query.js";

export const NETWORK_ADVANCED_FIELDS = NATIVE_ADVANCED_FIELDS;

export function networkComparisonFilters(filters, value) {
 return nativeExtraComparisonFilters(ratingBoundsComparisonFilters(minimumVotesComparisonFilters(filters, value), value), value);
}

export function networkPreviewQuery(networkId, { mediaType = "TV", ...options } = {}) {
 return mediaType === "TV" ? nativeEntityPreviewQuery(networkId, "withNetworks", { ...options, mediaType }) : null;
}

// Creation accepts only the approved native filter subset, including empty values.
export function validateNetworkAdvancedFilters(filters = {}) {
 return validateNativeAdvancedFilters(filters, "TV");
}
