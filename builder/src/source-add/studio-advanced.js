import { advancedDiscoverQuery, validateAdvancedFilters } from "./advanced-discover.js";
import { inspectDiscoverMirrors } from "../nuvio/discover-imported-filters.js";
import { resolveEffectiveDiscoverSource } from "../nuvio/discover.js";

export const STUDIO_ADVANCED_FIELDS = Object.freeze(["voteCountGte"]);

export function validateStudioAdvancedFilters(filters = {}, mediaType = "MOVIE") {
 return validateAdvancedFilters(filters, mediaType, { fields: STUDIO_ADVANCED_FIELDS });
}

export function inspectStudioMinimumVotes(source) {
 const effective = resolveEffectiveDiscoverSource(source);
 if (!effective.ok) return { editable: false, filters: {} };
 return inspectMinimumVotesValue(effective.value);
}

function inspectMinimumVotesValue(value) {
 const filters = Object.hasOwn(value.filters ?? {}, "voteCountGte") ? { voteCountGte: value.filters.voteCountGte } : {};
 const validation = validateStudioAdvancedFilters(filters, value.mediaType.trim().toUpperCase());
 const unresolved = inspectDiscoverMirrors(value).unresolved.some((entry) => entry.field === "voteCountGte");
 return { editable: validation.ok && !unresolved, filters: validation.filters };
}

export function studioComparisonFilters(filters, value) {
 const inspected = inspectMinimumVotesValue({ ...value, filters });
 if (!inspected.editable) return filters;
 const result = { ...filters };
 if (Object.hasOwn(inspected.filters, "voteCountGte")) result.voteCountGte = inspected.filters.voteCountGte;
 if (inspectDiscoverMirrors(value).equivalent.includes("vote_count.gte")) delete result["vote_count.gte"];
 return result;
}

// This detached request adapter fixes the native Studio constraint. It never
// changes the stored COMPANY source or activates request-style aliases alone.
export function studioPreviewQuery(studioId, { mediaType, sortBy, filters = {} } = {}) {
 if (!Number.isSafeInteger(studioId) || studioId < 1 || !["MOVIE", "TV"].includes(mediaType) || !filters || typeof filters !== "object" || Array.isArray(filters)) return null;
 const mirrors = inspectDiscoverMirrors({ mediaType, sortBy, filters });
 if (mirrors.unresolved.length) return null;
 const effective = { ...filters };
 for (const alias of mirrors.equivalent) delete effective[alias];
 // Native Nuvio fixes with_companies from tmdbId, even on imported sources.
 effective.withCompanies = String(studioId);
 return advancedDiscoverQuery({ category: "native-tmdb", editable: {
  provider: "tmdb", tmdbSourceType: "DISCOVER", mediaType, sortBy, filters: effective,
 } });
}
