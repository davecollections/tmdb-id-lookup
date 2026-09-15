import { validateMinimumVotesFilters } from "./minimum-votes.js";
import { nativeEntityPreviewQuery } from "./native-entity-preview-query.js";

export function networkPreviewQuery(networkId, { mediaType = "TV", ...options } = {}) {
 return mediaType === "TV" ? nativeEntityPreviewQuery(networkId, "withNetworks", { ...options, mediaType }) : null;
}

// Creation accepts only the approved native filter subset, including empty values.
export function validateNetworkAdvancedFilters(filters = {}) {
 if (!filters || typeof filters !== "object" || Array.isArray(filters)) return { ok: false, filters: {}, errors: [{ code: "INVALID_NETWORK_FILTERS", path: "$network.filters", message: "Network filters must be an object containing only Minimum votes." }] };
 const result = validateMinimumVotesFilters(filters, "TV");
 const unsupported = Object.keys(filters ?? {}).filter((field) => field !== "voteCountGte");
 if (!unsupported.length) return result;
 return { ...result, ok: false, errors: [...result.errors, ...unsupported.map((field) => ({
  code: "INVALID_NETWORK_FILTERS", path: "$network.filters." + field, message: "Only Minimum votes can be configured for a new Network source.",
 }))] };
}
