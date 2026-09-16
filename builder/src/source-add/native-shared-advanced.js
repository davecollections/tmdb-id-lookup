import { validateAdvancedFilters, deriveAdvancedDiscoverFilters } from "./advanced-discover.js";
import { canonicalizeDiscoverFiltersForComparison, resolveEffectiveDiscoverSource } from "../nuvio/discover.js";
import { discoverImportedMirrors, inspectDiscoverMirrors } from "../nuvio/discover-imported-filters.js";
import { validateMinimumVotesFilters } from "./minimum-votes.js";
import { validateRatingBounds } from "./rating-bounds.js";

export const NATIVE_EXTRA_GROUPS = Object.freeze([
 Object.freeze(["withOriginalLanguage"]), Object.freeze(["withOriginCountry"]),
 Object.freeze(["withGenres", "withoutGenres"]), Object.freeze(["withKeywords", "withoutKeywords"]),
 Object.freeze(["releaseDateGte", "releaseDateLte", "year"]),
]);
export const NATIVE_EXTRA_FIELDS = Object.freeze(NATIVE_EXTRA_GROUPS.flat());
export const NATIVE_ADVANCED_FIELDS = Object.freeze(["voteCountGte", "voteAverageGte", "voteAverageLte", ...NATIVE_EXTRA_FIELDS]);
export const NATIVE_GENRE_FIELDS = NATIVE_EXTRA_GROUPS[2];
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const pick = (value, fields) => Object.fromEntries(fields.filter((field) => Object.hasOwn(value ?? {}, field)).map((field) => [field, value[field]]));
const error = (field, message) => ({ code: "INVALID_NATIVE_ADVANCED", path: "$discover." + field, message });

// The existing Discover validator owns grammar and coupled-field semantics.
function validateGroup(filters, mediaType, fields) {
 const values = pick(filters, fields);
 const errors = Object.entries(values).flatMap(([field, value]) => {
  if (value === undefined || value === null || value === "") return [];
  if (field === "year" ? !["string", "number"].includes(typeof value) : typeof value !== "string") return [error(field, "This setting must use a supported scalar value.")];
  if (field.startsWith("without") && value.includes("|")) return [error(field, "These imported exclusions must be preserved; new exclusions use a comma list.")];
  return [];
 });
 if (errors.length) return { ok: false, filters: {}, errors };
 return validateAdvancedFilters(values, mediaType, { fields });
}

export function validateNativeAdvancedFilters(filters = {}, mediaType = "MOVIE") {
 if (!object(filters)) return { ok: false, filters: {}, errors: [error("filters", "Advanced settings must be an object.")] };
 const results = [validateMinimumVotesFilters(pick(filters, ["voteCountGte"]), mediaType), validateRatingBounds(filters, mediaType),
  ...NATIVE_EXTRA_GROUPS.map((fields) => validateGroup(filters, mediaType, fields))];
 const errors = [...results.flatMap((r) => r.errors), ...Object.keys(filters).filter((field) => !NATIVE_ADVANCED_FIELDS.includes(field)).map((field) => error(field, "This setting is outside native Shared Advanced authoring."))];
 return { ok: !errors.length, filters: Object.assign({}, ...results.map((r) => r.filters)), errors };
}

export function deriveNativeAdvancedFilters(filters = {}, mediaType, mediaMode) {
 if (!object(filters)) return validateNativeAdvancedFilters(filters, mediaType);
 const derived = deriveAdvancedDiscoverFilters({ filters: pick(filters, NATIVE_GENRE_FIELDS), mediaMode }, mediaType);
 // Preserve unsupported entries for the subset/type guards, even when the
 // general Discover compiler omits an empty or invalid entry.
 const effective = { ...filters };
 for (const field of NATIVE_GENRE_FIELDS) {
  if (Object.hasOwn(derived.filters, field)) effective[field] = derived.filters[field];
  else if (mediaMode === "both" && !derived.errors.some((e) => e.path.endsWith("." + field))) delete effective[field];
 }
 const validated = validateNativeAdvancedFilters(effective, mediaType);
 const errors = [...derived.errors, ...validated.errors, ...NATIVE_GENRE_FIELDS.filter((field) => field.startsWith("without") && typeof filters[field] === "string" && filters[field].includes("|")).map((field) => error(field, "New exclusions use a comma list."))];
 return { ...validated, ok: !errors.length, errors, information: derived.information };
}

export function inspectNativeExtraFilters(source) {
 const effective = resolveEffectiveDiscoverSource(source);
 const editable = {}, filters = {};
 for (const fields of NATIVE_EXTRA_GROUPS) {
  const value = effective.ok ? effective.value : null;
  const result = value ? validateGroup(value.filters, value.mediaType.trim().toUpperCase(), fields) : { ok: false, filters: {} };
  const safe = result.ok && !inspectDiscoverMirrors(value).unresolved.some((entry) => fields.includes(entry.field));
  for (const field of fields) editable[field] = safe;
  if (safe) Object.assign(filters, result.filters);
 }
 return { filters, editable };
}

export function validateNativeExtraEdit(source, draft) {
 const effective = resolveEffectiveDiscoverSource(source), inspected = inspectNativeExtraFilters(source);
 const filters = {}, errors = [];
 for (const fields of NATIVE_EXTRA_GROUPS) {
  if (!fields.some((field) => draft.touchedFilters.includes(field))) continue;
  if (!effective.ok || fields.some((field) => !inspected.editable[field])) { errors.push(error(fields[0], "These imported settings must be preserved.")); continue; }
  const values = pick(effective.value.filters, fields);
  for (const field of fields.filter((field) => draft.touchedFilters.includes(field))) {
   if (Object.hasOwn(draft.filters ?? {}, field)) values[field] = draft.filters[field]; else delete values[field];
  }
  const result = validateGroup(values, draft.mediaType, fields);
  Object.assign(filters, result.filters); errors.push(...result.errors);
 }
 return { ok: !errors.length, filters, errors };
}

export function ownedNativeExtraMirrorSource(original) {
 const filters = { ...original.filters }, equivalent = inspectDiscoverMirrors(original).equivalent;
 for (const [alias, field] of Object.entries(discoverImportedMirrors(original.mediaType))) {
  if (NATIVE_EXTRA_FIELDS.includes(field) && !equivalent.includes(alias)) delete filters[alias];
 }
 return { ...original, filters };
}

export function nativeExtraComparisonFilters(filters, value) {
 const source = { category: "native-tmdb", nodeType: "source", editable: { ...value, filters } };
 const inspected = inspectNativeExtraFilters(source), result = { ...filters };
 const comparable = canonicalizeDiscoverFiltersForComparison(inspected.filters);
 for (const field of NATIVE_EXTRA_FIELDS) if (inspected.editable[field] && Object.hasOwn(inspected.filters, field)) result[field] = comparable.value[field];
 const mirrors = discoverImportedMirrors(value.mediaType);
 for (const alias of inspectDiscoverMirrors({ ...value, filters }).equivalent) if (inspected.editable[mirrors[alias]]) delete result[alias];
 return result;
}

// Creation-only state. No override metadata reaches a concrete Source.
export function resolveNativeGenreFilters(filters = {}, overrides = {}, entityId) {
 if (!object(overrides) || Object.values(overrides).some((value) => !object(value) || Object.entries(value).some(([field, setting]) => !NATIVE_GENRE_FIELDS.includes(field) || (setting !== null && typeof setting !== "string")))) return { ok: false, filters, errors: [error("withGenres", "Genre overrides must be an entity map.")] };
 if (!Object.hasOwn(overrides, entityId)) return { ok: true, filters, errors: [] };
 const override = overrides[entityId];
 const result = { ...filters }; for (const field of NATIVE_GENRE_FIELDS) delete result[field];
 return { ok: true, filters: { ...result, ...override }, errors: [] };
}

export function customizeNativeGenres(overrides, entityId) {
 // An own empty object is an intentional unrestricted Custom configuration.
 return { ...overrides, [entityId]: {} };
}
export function useDefaultNativeGenres(overrides, entityId) {
 const next = { ...overrides }; delete next[entityId]; return next;
}
export function freezeNativeGenreOverrides(overrides = {}) {
 return Object.freeze(Object.fromEntries(Object.entries(overrides).map(([id, value]) => [id, Object.freeze({ ...value })])));
}

export function validateNativeAdvancedDraft(filters = {}, mediaMode = "movies") {
 const results = (mediaMode === "both" ? ["MOVIE", "TV"] : [mediaMode === "series" ? "TV" : "MOVIE"]).map((media) => deriveNativeAdvancedFilters(filters, media, mediaMode));
 const errors = results.flatMap((result) => result.errors);
 return { ok: !errors.length, errors, filters: { ...results[0].filters, ...pick(filters, NATIVE_GENRE_FIELDS) } };
}
