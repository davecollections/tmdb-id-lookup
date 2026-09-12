import { discoverExpressionIds, discoverMediaTypes } from "./advanced-discover.js";
import { OFFICIAL_GENRE_REFERENCES } from "./genre-catalogue.js";

// Display only: keep the exact draft, selected IDs and operators unchanged.
export function discoverFilterRows(draft) {
 const filters = draft.filters, used = new Set(), rows = [];
 const present = (field) => filters[field] !== "" && filters[field] !== null && filters[field] !== undefined;
 const add = (label, fields, format) => {
  fields.forEach((field) => used.add(field));
  const values = fields.filter(present).map(format);
  if (values.length) rows.push({ label, value: values.join("; ") });
 };
 const selection = (field) => {
  const ids = discoverExpressionIds(filters[field]);
  return ids.map((id) => reviewName(field, id)).join(String(filters[field]).includes("|") ? " OR " : " AND ");
 };
 const reviewName = (field, id) => /^(with|without)Companies$/.test(field) ? draft.selectionNames?.[field + ":" + id] ?? discoverSelectionLabel(draft, field, id) : discoverSelectionLabel(draft, field, id);
 for (const [label, include, exclude] of [["Keywords", "withKeywords", "withoutKeywords"], ["Genres", "withGenres", "withoutGenres"]]) {
  add(label, [include, exclude], (field) => field === exclude ? "Exclude " + discoverExpressionIds(filters[field]).map((id) => discoverSelectionLabel(draft, field, id)).join(" OR ") : (present(exclude) ? "Include " : "") + selection(field));
 }
 const date = (value) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(value + "T00:00:00Z"));
 add("Dates", ["releaseDateGte", "releaseDateLte", "year"], (field) => field === "year" ? "Exact year " + filters[field] : (field === "releaseDateGte" ? "From " : "Through ") + date(filters[field]));
 add("Rating", ["voteAverageGte", "voteAverageLte"], (field) => (field === "voteAverageGte" ? "At least " : "At most ") + filters[field] + " out of 10");
 add("Votes", ["voteCountGte"], (field) => "At least " + filters[field]);
 const code = (field) => {
  try { return new Intl.DisplayNames(["en"], { type: field === "withOriginalLanguage" ? "language" : "region" }).of(String(filters[field])); }
  catch { return String(filters[field]); }
 };
 add("Original language", ["withOriginalLanguage"], code);
 add("Origin country", ["withOriginCountry"], code);
 for (const [label, include, exclude] of [["Studios", "withCompanies", "withoutCompanies"], ["Networks", "withNetworks"], ["Watch providers", "withWatchProviders", "withoutWatchProviders"]]) {
  add(label, [include, exclude].filter(Boolean), (field) => field === exclude ? "Exclude " + discoverExpressionIds(filters[field]).map((id) => reviewName(field, id)).join(" OR ") : (exclude && present(exclude) ? "Include " : "") + selection(field));
 }
 add("Watch region", ["watchRegion"], code);
 for (const [field, value] of Object.entries(filters)) if (!used.has(field) && present(field)) rows.push({ label: "Saved filter: " + field, value: typeof value === "object" ? JSON.stringify(value) : String(value) });
 return rows;
}

export function discoverSelectionLabel(draft, field, id) {
 return draft.labels[field + ":" + id]
  ?? (/^(with|without)Genres$/.test(field) ? OFFICIAL_GENRE_REFERENCES.find((g) => g.tmdbId === id && discoverMediaTypes(draft.mediaMode).includes(g.mediaType))?.name : null)
  ?? "Unavailable saved selection " + id;
}
export function mergeDiscoverSelectionLabels(draft, labels) {
 const merged = { ...draft.labels };
 for (const [key, name] of Object.entries(labels)) {
  const [field, id] = key.split(":");
  if (!merged[key] && discoverExpressionIds(draft.filters[field]).includes(Number(id))) merged[key] = name;
 }
 return { ...draft, labels: merged };
}
export async function resolveDiscoverEntityLabels(draft, providers) {
 const groups = [
  { fields: ["withCompanies", "withoutCompanies"], provider: providers.studioProvider, key: "studios" },
  { fields: ["withNetworks"], provider: providers.networkProvider, key: "networks" },
  { fields: ["withWatchProviders", "withoutWatchProviders"], provider: providers.streamingProvider, key: "providers" },
 ];
 const labels = {}, warnings = [];
 await Promise.all(groups.map(async ({ fields, provider, key }) => {
  if (!fields.some((field) => discoverExpressionIds(draft.filters[field]).some((id) => !draft.labels[field + ":" + id]))) return;
  try {
   const result = await provider.loadCatalogue();
   if (!result.ok) throw new Error(result.error.message);
   const names = new Map(result.data[key].map((row) => [row.id, row.name]));
   for (const field of fields) for (const id of discoverExpressionIds(draft.filters[field])) if (names.has(id)) labels[field + ":" + id] = names.get(id);
  } catch { warnings.push("Some saved names are unavailable. Their IDs and filters are retained."); }
 }));
 return { labels, warnings: [...new Set(warnings)] };
}
