// Imported request-style copies are mirrors, not native Nuvio filter names.
// Pinned TV/Desktop/Mobile models read camelCase only. Never activate an alias alone.
export const DISCOVER_IMPORTED_MIRRORS = Object.freeze({
 with_genres: "withGenres", without_genres: "withoutGenres",
 with_keywords: "withKeywords", without_keywords: "withoutKeywords",
 with_companies: "withCompanies", without_companies: "withoutCompanies",
 with_networks: "withNetworks", with_watch_providers: "withWatchProviders",
 without_watch_providers: "withoutWatchProviders", watch_region: "watchRegion",
 with_original_language: "withOriginalLanguage", with_origin_country: "withOriginCountry",
 "vote_count.gte": "voteCountGte", "vote_average.gte": "voteAverageGte", "vote_average.lte": "voteAverageLte",
});
// Date copies are owned only for the Source's media and exact query mapping.
// Other date spellings remain preserved unknown data, never active restrictions.
const dateMirrors = Object.freeze({
 MOVIE: Object.freeze({ "primary_release_date.gte": "releaseDateGte", "primary_release_date.lte": "releaseDateLte" }),
 TV: Object.freeze({ "first_air_date.gte": "releaseDateGte", "first_air_date.lte": "releaseDateLte", first_air_date_year: "year" }),
});
export function discoverImportedMirrors(mediaType) {
 return { ...DISCOVER_IMPORTED_MIRRORS, ...dateMirrors[mediaType] };
}
const meaningful = (v) => v !== null && v !== undefined && v !== "";
export function equalDiscoverMirror(native, mirror) {
 return meaningful(native) && (native === mirror || (typeof native === "number" && String(native) === mirror));
}
export function inspectDiscoverMirrors(source) {
 const filters = source.filters ?? {}, equivalent = [], unresolved = [];
 for (const [alias, field] of Object.entries(discoverImportedMirrors(source.mediaType))) {
  if (!meaningful(filters[alias])) continue;
  if (equalDiscoverMirror(filters[field], filters[alias])) equivalent.push(alias);
  else unresolved.push({ alias, field, kind: meaningful(filters[field]) ? "conflict" : "alias-only" });
 }
 if (meaningful(filters.sortBy)) {
  if (equalDiscoverMirror(source.sortBy, filters.sortBy)) equivalent.push("sortBy");
  else unresolved.push({ alias: "sortBy", field: "sortBy", kind: meaningful(source.sortBy) ? "conflict" : "alias-only" });
 }
 return { equivalent, unresolved };
}
// This is used only after a real native value change. Unknown imported data is untouched.
export function synchronizeDiscoverMirrors(filters, rawSource, editable) {
 const raw = rawSource?.filters ?? {};
 for (const [alias, field] of Object.entries(discoverImportedMirrors(editable.mediaType ?? rawSource?.mediaType))) {
  if (!Object.hasOwn(raw, alias) || (!Object.hasOwn(editable.filters ?? {}, alias) && JSON.stringify(raw[field]) === JSON.stringify(editable.filters?.[field]))) continue;
  if (Object.hasOwn(editable.filters ?? {}, field)) filters[alias] = editable.filters[field];
  else delete filters[alias];
 }
 if (Object.hasOwn(raw, "sortBy") && Object.hasOwn(editable, "sortBy") && (Object.hasOwn(editable.filters ?? {}, "sortBy") || rawSource.sortBy !== editable.sortBy)) filters.sortBy = editable.sortBy;
 return filters;
}
