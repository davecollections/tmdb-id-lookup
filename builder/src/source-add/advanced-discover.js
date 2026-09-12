import { buildDiscoverSourceDraft, DISCOVER_FILTER_DESCRIPTORS, DISCOVER_SORT_OPTIONS, discoverSortOptionId, discoverSourceIdentity } from "../nuvio/discover.js";
import { officialGenreReference } from "./genre-catalogue.js";

export const ADVANCED_DISCOVER_ID = "advanced-discover";
export const DISCOVER_MEDIA_OPTIONS = Object.freeze([
 { id: "movies", label: "Movies" }, { id: "series", label: "Series" }, { id: "both", label: "Both" },
]);
export const DISCOVER_EXAMPLES = Object.freeze([
 { id: "sharks", label: "Sharks", name: "shark", keywordId: 15097 },
 { id: "bollywood", label: "Bollywood", name: "bollywood", keywordId: 355622 },
 { id: "anime", label: "Anime", name: "anime", keywordId: 210024 },
 { id: "superheroes", label: "Superheroes", name: "superhero", keywordId: 9715 },
 { id: "disaster", label: "Disaster movies", name: "disaster", keywordId: 10617, mediaMode: "movies" },
]);
export const DISCOVER_FIELD_LABELS = Object.freeze({
 withGenres: "Genres", withoutGenres: "Excluded genres", withKeywords: "Keywords", withoutKeywords: "Excluded keywords",
 withCompanies: "Studios", withoutCompanies: "Excluded studios", withNetworks: "TV networks",
 withWatchProviders: "Providers", withoutWatchProviders: "Excluded providers", watchRegion: "Watch region",
 releaseDateGte: "From date", releaseDateLte: "Through date", year: "Release year",
 voteAverageGte: "Minimum rating", voteAverageLte: "Maximum rating", voteCountGte: "Minimum votes",
 withOriginalLanguage: "Original language", withOriginCountry: "Origin country",
});
const MAX_ID = 2147483647;
const idFields = DISCOVER_FILTER_DESCRIPTORS.filter((d) => ["id-expression", "single-id"].includes(d.semanticType)).map((d) => d.field);
const meaningful = (value) => value !== undefined && value !== null && value !== "";
const error = (field, message) => ({ code: "INVALID_ADVANCED_DISCOVER", path: "$discover." + field, message });
export function createAdvancedDiscoverDraft() {
 return { topic: "", name: "", nameMode: "auto", operators: {}, searches: {}, mediaMode: "movies", sortOptionIds: ["popular"], filters: {}, labels: {}, unresolved: [] };
}
export function discoverMediaTypes(mode) { return mode === "both" ? ["MOVIE", "TV"] : mode === "movies" ? ["MOVIE"] : mode === "series" ? ["TV"] : []; }
export function discoverExpressionIds(value) { return typeof value === "string" && value ? value.split(/[,|]/).map(Number) : []; }
export function validDiscoverExpression(value, single = false) {
 if (typeof value !== "string" || !(single ? /^[1-9]\d*$/ : /^(?:[1-9]\d*)(?:(?:,[1-9]\d*)+|(?:\|[1-9]\d*)+)?$/).test(value)) return false;
 const ids = discoverExpressionIds(value);
 return ids.every((id) => Number.isSafeInteger(id) && id <= MAX_ID) && new Set(ids).size === ids.length;
}
export function discoverGenreAvailability(filters, mediaType) {
 const otherMedia = mediaType === "TV" ? "MOVIE" : "TV";
 const selections = ["withGenres", "withoutGenres"].flatMap((field) => validDiscoverExpression(filters?.[field])
  ? discoverExpressionIds(filters[field]).filter((id) => !officialGenreReference(mediaType, id)).map((id) => ({ field, id, name: officialGenreReference(otherMedia, id)?.name ?? "Genre " + id })) : []);
 if (!selections.length) return { selections, message: "" };
 const names = [...new Set(selections.map((entry) => entry.name))];
 const label = new Intl.ListFormat("en", { style: "long", type: "conjunction" }).format(names);
 const alternative = selections.every(({ id }) => officialGenreReference(otherMedia, id)) ? " or choose " + (otherMedia === "TV" ? "Series" : "Movies") : "";
 return { selections, message: label + (names.length === 1 ? " isn't" : " aren't") + " available for " + (mediaType === "TV" ? "Series" : "Movies") + ". Remove " + (names.length === 1 ? "this selection" : "these selections") + alternative + "." };
}
export function removeUnavailableDiscoverGenres(draft) {
 if (draft.mediaMode === "both") return draft;
 const unavailable = discoverMediaTypes(draft.mediaMode).flatMap((media) => discoverGenreAvailability(draft.filters, media).selections);
 if (!unavailable.length) return draft;
 const filters = { ...draft.filters };
 for (const field of ["withGenres", "withoutGenres"]) {
  const removed = new Set(unavailable.filter((entry) => entry.field === field).map((entry) => entry.id));
  if (!removed.size) continue;
  const remaining = discoverExpressionIds(filters[field]).filter((id) => !removed.has(id));
  if (remaining.length) filters[field] = remaining.join(filters[field].includes("|") ? "|" : ","); else delete filters[field];
 }
 return { ...draft, filters };
}
export function validateAdvancedFilters(filters, mediaType, { allowUnknown = false } = {}) {
 const errors = [], output = {};
 for (const [field, value] of Object.entries(filters ?? {})) {
  if (!meaningful(value)) continue;
  const descriptor = DISCOVER_FILTER_DESCRIPTORS.find((d) => d.field === field);
  if (!descriptor) { if (!allowUnknown) errors.push(error(field, "An imported filter cannot be represented by this editor.")); continue; }
  const label = DISCOVER_FIELD_LABELS[field];
  if (!descriptor.media[mediaType]?.applicable) { errors.push(error(field, label + " applies to Series only. Choose Series or remove this filter.")); continue; }
  let valid = true, parsed = value;
  if (idFields.includes(field)) valid = validDiscoverExpression(value);
  else if (descriptor.semanticType === "date") {
   const d = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(value + "T00:00:00Z") : null;
   valid = Number(value?.slice?.(0, 4)) >= 1000 && d && Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
  } else if (["rating", "vote-count", "year"].includes(descriptor.semanticType)) {
   valid = /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(String(value));
   parsed = Number(value);
   if (descriptor.semanticType === "rating") valid &&= Number.isFinite(parsed) && parsed >= 0 && parsed <= 10;
   else valid &&= Number.isSafeInteger(parsed) && parsed >= (field === "year" ? 1000 : 0) && parsed <= (field === "year" ? 9999 : MAX_ID);
  } else valid = (field === "withOriginalLanguage" ? /^[a-z]{2}$/ : /^[A-Z]{2}$/).test(value);
  if (!valid) errors.push(error(field, "Review " + label.toLowerCase() + "."));
  else output[field] = parsed;
 }
 const availability = discoverGenreAvailability(output, mediaType);
 if (availability.selections.length) errors.push({ ...error(availability.selections[0].field, availability.message), code: "UNAVAILABLE_DISCOVER_GENRES" });
 for (const field of ["Genres", "Keywords", "Companies", "WatchProviders"]) {
  const included = discoverExpressionIds(output["with" + field]), excluded = discoverExpressionIds(output["without" + field]);
  if (included.some((id) => excluded.includes(id))) errors.push(error("without" + field, "The same " + DISCOVER_FIELD_LABELS["with" + field].toLowerCase() + " cannot be included and excluded."));
 }
 if (output.releaseDateGte && output.releaseDateLte && output.releaseDateGte > output.releaseDateLte) errors.push(error("releaseDateGte", "From date must be on or before Through date."));
 if (output.voteAverageGte !== undefined && output.voteAverageLte !== undefined && output.voteAverageGte > output.voteAverageLte) errors.push(error("voteAverageGte", "Minimum rating must not exceed maximum rating."));
 if (output.year && ((output.releaseDateGte && output.releaseDateGte > output.year + "-12-31") || (output.releaseDateLte && output.releaseDateLte < output.year + "-01-01"))) errors.push(error("year", "The year and date range do not overlap."));
 const providers = output.withWatchProviders || output.withoutWatchProviders;
 if (providers && !output.watchRegion) errors.push(error("watchRegion", "Choose a watch region for providers."));
 if (!providers && output.watchRegion) errors.push(error("watchRegion", "Choose a provider or clear the watch region."));
 return { ok: errors.length === 0, filters: output, errors };
}
// Both keeps the original selections. Only verified media-specific choices are
// omitted from a generated Source; malformed expressions and unknown IDs survive
// derivation so the ordinary validator still rejects them.
export function deriveAdvancedDiscoverFilters(draft, mediaType) {
 const filters = { ...draft.filters }, information = [];
 if (draft.mediaMode === "both") {
  const otherMedia = mediaType === "TV" ? "MOVIE" : "TV";
  const mediaLabel = mediaType === "TV" ? "Series" : "Movies";
  const otherLabel = otherMedia === "TV" ? "Series" : "Movies";
  for (const field of ["withGenres", "withoutGenres"]) {
   if (!validDiscoverExpression(filters[field])) continue;
   const ids = discoverExpressionIds(filters[field]);
   const omitted = ids.filter((id) => !officialGenreReference(mediaType, id) && officialGenreReference(otherMedia, id));
   if (!omitted.length) continue;
   const remaining = ids.filter((id) => !omitted.includes(id));
   const names = new Intl.ListFormat("en", { style: "long", type: "conjunction" }).format(omitted.map((id) => officialGenreReference(otherMedia, id).name));
   information.push({ field, kind: "applicability", message: field === "withoutGenres" ? "Excluding " + names + " applies to " + otherLabel + " only." : names + (omitted.length === 1 ? " applies" : " apply") + " to " + otherLabel + " only." });
   if (remaining.length) filters[field] = remaining.join(filters[field].includes("|") ? "|" : ","); else delete filters[field];
  }
  if (mediaType === "MOVIE" && validDiscoverExpression(filters.withNetworks)) {
   delete filters.withNetworks;
   information.push({ field: "withNetworks", kind: "applicability", message: "Networks apply to Series only. Movies have no network restriction." });
  }
  if (validDiscoverExpression(draft.filters.withGenres) && !filters.withGenres) information.push({ field: "withGenres", kind: "unrestricted", message: mediaLabel + (filters.withoutGenres ? ": no included genre restriction; exclusions still apply." : ": no genre restriction.") });
 }
 return { ...validateAdvancedFilters(filters, mediaType), information };
}
export function compileAdvancedDiscover(draft, { preview = false } = {}) {
 const errors = [];
 if (draft?.providerContextReview) errors.push(error("withWatchProviders", "Review retained providers for the new media or region."));
 if (draft?.unresolved?.length) errors.push(error("topic", "Resolve or explicitly remove the remaining wording before continuing."));
 const mediaTypes = discoverMediaTypes(draft?.mediaMode);
 if (!mediaTypes.length) errors.push(error("mediaMode", "Choose Movies, Series or Both."));
 const sortIds = preview ? DISCOVER_SORT_OPTIONS.map((o) => o.id) : draft?.sortOptionIds;
 if (!Array.isArray(sortIds) || !sortIds.length || new Set(sortIds).size !== sortIds.length || sortIds.some((id) => !DISCOVER_SORT_OPTIONS.some((o) => o.id === id))) errors.push(error("sort", "Choose at least one supported Source order."));
 const drafts = [];
 for (const mediaType of mediaTypes) {
  const validated = deriveAdvancedDiscoverFilters(draft, mediaType);
  errors.push(...validated.errors);
  if (!validated.ok) continue;
  for (const option of DISCOVER_SORT_OPTIONS.filter((o) => sortIds?.includes(o.id))) {
   const title = (draft.name?.trim() || "Discover") + " · " + (mediaType === "TV" ? "Series" : "Movies") + " · " + option.label;
   const built = buildDiscoverSourceDraft({ title, mediaType, sortOptionId: option.id, filters: validated.filters });
   if (built.ok) drafts.push(built.draft); else errors.push(...built.errors);
  }
 }
 return { ok: !errors.length, drafts: errors.length ? [] : drafts, errors };
}
export function advancedDiscoverQuery(sourceDraft) {
 const source = sourceDraft?.editable;
 if (sourceDraft?.category !== "native-tmdb" || source?.provider !== "tmdb" || source.tmdbSourceType !== "DISCOVER" || !["MOVIE", "TV"].includes(source.mediaType) || discoverSortOptionId(source.sortBy, source.mediaType) === null) return null;
 const result = validateAdvancedFilters(source.filters, source.mediaType);
 if (!result.ok) return null;
 const queryParameters = { include_adult: "false", sort_by: source.sortBy };
 for (const [field, value] of Object.entries(result.filters)) queryParameters[DISCOVER_FILTER_DESCRIPTORS.find((d) => d.field === field).media[source.mediaType].requestParameter] = String(value);
 if (result.filters.withWatchProviders) queryParameters.with_watch_monetization_types = "flatrate|free|ads|rent|buy";
 return { mediaType: source.mediaType, queryParameters };
}
export function setDiscoverSelection(draft, field, entry, { remove = false, operator } = {}) {
 if (!remove && discoverSelectionConflict(draft, field, entry.id)) return draft;
 const ids = discoverExpressionIds(draft.filters[field]);
 const next = remove ? ids.filter((id) => id !== entry.id) : ids.includes(entry.id) ? ids : [...ids, entry.id];
 const separator = field.startsWith("without") ? "," : operator ?? discoverSelectionOperator(draft, field);
 const filters = { ...draft.filters };
 if (next.length) filters[field] = next.join(separator); else delete filters[field];
 return { ...draft, filters, operators: { ...draft.operators, ...(field.startsWith("without") ? {} : { [field]: separator }) }, labels: { ...draft.labels, [field + ":" + entry.id]: entry.name } };
}
export function discoverDraftIdentity(draft) { return discoverSourceIdentity(draft?.editable).key; }

export function discoverSelectionOperator(draft, field) {
 return draft.operators?.[field] ?? (draft.filters[field]?.includes(",") ? "," : "|");
}
export function setDiscoverOperator(draft, field, operator) {
 if (![",", "|"].includes(operator) || field.startsWith("without")) return draft;
 const ids = discoverExpressionIds(draft.filters[field]);
 return { ...draft, operators: { ...draft.operators, [field]: operator }, filters: { ...draft.filters, ...(ids.length ? { [field]: ids.join(operator) } : {}) } };
}
export function discoverSelectionConflict(draft, field, id) {
 const other = field.startsWith("without") ? field.replace("without", "with") : field.replace("with", "without");
 return discoverExpressionIds(draft.filters[other]).includes(id);
}
export function suggestDiscoverName(draft) {
 if (draft.nameMode === "custom") return draft.name;
 const field = draft.filters.withKeywords ? "withKeywords" : draft.filters.withGenres ? "withGenres" : draft.filters.withCompanies ? "withCompanies" : draft.filters.withNetworks ? "withNetworks" : null;
 if (!field) return "Discover";
 const names = discoverExpressionIds(draft.filters[field]).slice(0, 2).map((id) => draft.labels[field + ":" + id] ?? (field === "withGenres" ? officialGenreReference(discoverMediaTypes(draft.mediaMode)[0], id)?.name : null)).filter(Boolean);
 const title = names.join(discoverSelectionOperator(draft, field) === "|" ? " or " : " + ");
 return title ? title[0].toUpperCase() + title.slice(1) : "Discover";
}

export function changeDiscoverContext(draft, patch) {
 const next = { ...draft, ...patch };
 const changed = draft.mediaMode !== next.mediaMode || draft.filters.watchRegion !== next.filters.watchRegion;
 return { ...next, providerContextReview: Boolean((draft.providerContextReview || changed) && (next.filters.withWatchProviders || next.filters.withoutWatchProviders)) };
}
