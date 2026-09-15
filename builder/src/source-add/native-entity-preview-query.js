import { DISCOVER_FILTER_DESCRIPTORS } from "../nuvio/discover.js";
import { advancedDiscoverQuery } from "./advanced-discover.js";
import { inspectDiscoverMirrors } from "../nuvio/discover-imported-filters.js";

// Detached query preparation only; stored native sources remain unchanged.
export function nativeEntityPreviewQuery(entityId, inclusionField, { mediaType, sortBy, filters = {} } = {}) {
 if (!Number.isSafeInteger(entityId) || entityId < 1 || !["MOVIE", "TV"].includes(mediaType) || !filters || typeof filters !== "object" || Array.isArray(filters)) return null;
 // Imported JSON must have a supported scalar shape before authored validation
 // can coerce it, or native identity replacement can hide an unsafe value.
 for (const { field, valueType } of DISCOVER_FILTER_DESCRIPTORS) {
  const value = filters[field];
  if (value === undefined || value === null || value === "") continue;
  const validType = valueType === "string" ? typeof value === "string"
   : ["number", "integer"].includes(valueType) && ["number", "string"].includes(typeof value);
  if (!validType) return null;
 }
 const mirrors = inspectDiscoverMirrors({ mediaType, sortBy, filters });
 if (mirrors.unresolved.length) return null;
 const effective = { ...filters };
 for (const alias of mirrors.equivalent) delete effective[alias];
 // Inspect aliases before replacing the inclusion fixed by the native identity.
 effective[inclusionField] = String(entityId);
 return advancedDiscoverQuery({ category: "native-tmdb", editable: {
  provider: "tmdb", tmdbSourceType: "DISCOVER", mediaType, sortBy, filters: effective,
 } });
}
