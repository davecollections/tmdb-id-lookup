import { validateAdvancedFilters } from "./advanced-discover.js";
import { inspectDiscoverMirrors } from "../nuvio/discover-imported-filters.js";
import { resolveEffectiveDiscoverSource } from "../nuvio/discover.js";

export const MINIMUM_VOTES_FIELDS = Object.freeze(["voteCountGte"]);

export function validateMinimumVotesFilters(filters = {}, mediaType = "MOVIE") {
 const result = validateAdvancedFilters(filters, mediaType, { fields: MINIMUM_VOTES_FIELDS });
 const value = filters?.voteCountGte;
 if (value !== undefined && value !== null && !["number", "string"].includes(typeof value)) {
  return { ...result, ok: false, filters: {}, errors: [...result.errors, { code: "INVALID_DISCOVER_FIELD", path: "$discover.voteCountGte", message: "Review minimum votes." }] };
 }
 return result;
}

export function inspectMinimumVotes(source) {
 const effective = resolveEffectiveDiscoverSource(source);
 if (!effective.ok) return { editable: false, filters: {} };
 return inspectMinimumVotesValue(effective.value);
}

function inspectMinimumVotesValue(value) {
 const filters = Object.hasOwn(value.filters ?? {}, "voteCountGte") ? { voteCountGte: value.filters.voteCountGte } : {};
 const validation = validateMinimumVotesFilters(filters, value.mediaType.trim().toUpperCase());
 const unresolved = inspectDiscoverMirrors(value).unresolved.some((entry) => entry.field === "voteCountGte");
 return { editable: validation.ok && !unresolved, filters: validation.filters };
}

export function minimumVotesComparisonFilters(filters, value) {
 const inspected = inspectMinimumVotesValue({ ...value, filters });
 if (!inspected.editable) return filters;
 const result = { ...filters };
 if (Object.hasOwn(inspected.filters, "voteCountGte")) result.voteCountGte = inspected.filters.voteCountGte;
 if (inspectDiscoverMirrors(value).equivalent.includes("vote_count.gte")) delete result["vote_count.gte"];
 return result;
}
