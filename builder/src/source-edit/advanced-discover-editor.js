import { discoverImportedMirrors, inspectDiscoverMirrors } from "../nuvio/discover-imported-filters.js";
import { DISCOVER_EDIT_READINESS, DISCOVER_FILTER_DESCRIPTORS, discoverSortOptionId, discoverSortValue, discoverSourceNodeIdentity, inspectDiscoverSourceNode, resolveEffectiveDiscoverSource, effectiveDiscoverSort } from "../nuvio/discover.js";
import { createAdvancedDiscoverDraft, validateAdvancedFilters } from "../source-add/advanced-discover.js";
import { validateTouchedSourceTitle } from "./source-edit-utils.js";
const known = new Set(DISCOVER_FILTER_DESCRIPTORS.map((d) => d.field));
export function inspectEditableAdvancedDiscover(source) {
 const inspection = inspectDiscoverSourceNode(source);
 if (![DISCOVER_EDIT_READINESS.FULLY_UNDERSTOOD, DISCOVER_EDIT_READINESS.UNDERSTOOD_WITH_PRESERVED_EXTRAS].includes(inspection.capabilities.editReadiness)) return null;
 const effective = resolveEffectiveDiscoverSource(source);
 if (!effective.ok) return null;
 const value = effective.value;
 if (value.tmdbId != null) return null;
 const validated = validateAdvancedFilters(value.filters, value.mediaType, { allowUnknown: true });
 if (!validated.ok) return null;
 const mirrors = inspectDiscoverMirrors(value);
 const unknown = Object.entries(value.filters).filter(([key, v]) => !known.has(key) && !mirrors.equivalent.includes(key) && v !== null);
 return { value, filters: validated.filters, inspection, mirrors, previewBlocked: unknown.length > 0 };
}
function readInitialState(source) {
 const inspected = inspectEditableAdvancedDiscover(source);
 return { ...createAdvancedDiscoverDraft(), mediaMode: inspected.value.mediaType === "TV" ? "series" : "movies", mediaType: inspected.value.mediaType, title: typeof inspected.value.title === "string" ? inspected.value.title : "", titleTouched: false,
 filters: inspected.filters, operators: Object.fromEntries(Object.entries(inspected.filters).filter(([key]) => key.startsWith("with") && !key.startsWith("without")).map(([key, value]) => [key, String(value).includes(",") ? "," : "|"])), touchedFilters: [], sortOptionIds: [discoverSortOptionId(effectiveDiscoverSort(inspected.value.sortBy), inspected.value.mediaType)].filter(Boolean), sortTouched: false, originalSortBy: inspected.value.sortBy,
 previewBlocked: inspected.previewBlocked, previewSource: source, preservedFields: Object.keys(inspected.value.filters).filter((k) => !known.has(k)) };
}
function validateDraft({ draft, source }) {
 const original = inspectEditableAdvancedDiscover(source);
 const errors = [...validateTouchedSourceTitle(draft)];
 if (!original || draft.mediaType !== original.value.mediaType || draft.mediaMode !== (draft.mediaType === "TV" ? "series" : "movies")) errors.push({ message: "The Source media cannot change." });
 if (draft.sortTouched && (draft.sortOptionIds?.length !== 1 || !discoverSortValue(draft.sortOptionIds[0], draft.mediaType))) errors.push({ message: "Choose one supported Source order." });
 if (draft.unresolved?.length) errors.push({ message: "Resolve or remove the remaining wording." });
 errors.push(...validateAdvancedFilters(draft.filters, draft.mediaType).errors);
 if (!Array.isArray(draft.touchedFilters) || draft.touchedFilters.some((k) => !known.has(k))) errors.push({ message: "An imported field cannot be edited here." });
 return { ok: errors.length === 0, errors };
}
function buildPatch({ draft, source }) {
 const original = inspectEditableAdvancedDiscover(source).value;
 const patch = {};
 if (draft.titleTouched && draft.title !== original.title) patch.title = draft.title;
 const sort = discoverSortValue(draft.sortOptionIds[0], draft.mediaType);
 if (draft.sortTouched && sort !== original.sortBy) patch.sortBy = sort;
 const validated = validateAdvancedFilters(draft.filters, draft.mediaType);
 const filters = { ...source.editable.filters };
 if (Object.hasOwn(patch, "sortBy") && Object.hasOwn(original.filters, "sortBy")) filters.sortBy = sort;
 for (const key of draft.touchedFilters) {
  if (JSON.stringify(validated.filters[key]) !== JSON.stringify(original.filters[key])) {
   for (const [alias, native] of Object.entries(discoverImportedMirrors(original.mediaType))) if (native === key && Object.hasOwn(original.filters, alias)) filters[alias] = validated.filters[key] ?? null;
  }
  if (Object.hasOwn(validated.filters, key)) filters[key] = validated.filters[key]; else delete filters[key];
 }
 if (JSON.stringify(filters) !== JSON.stringify(source.editable.filters)) patch.filters = filters;
 return patch;
}
export const advancedDiscoverSourceEditor = Object.freeze({
 id: "advanced-discover", label: "Discover", ownedFields: ["title", "sortBy", "filters"],
 canEdit: (source) => inspectEditableAdvancedDiscover(source) !== null,
 sourceIdentity: (source) => discoverSourceNodeIdentity(source).key,
 duplicateKey: (source) => discoverSourceNodeIdentity(source).key,
 duplicateMessage: () => "This exact media, order and filter combination already exists in the folder. Change the filters or cancel.",
 readInitialState, validateDraft, buildPatch,
 describeIdentity: (draft) => draft.mediaType === "TV" ? "Series Discover" : "Movie Discover",
});

export function discoverEditorPreviewBlocked(draft) {
 if (!draft.previewSource) return Boolean(draft.previewBlocked);
 const patched = { ...draft.previewSource, editable: { ...draft.previewSource.editable, ...buildPatch({ draft, source: draft.previewSource }) } };
 return inspectEditableAdvancedDiscover(patched)?.previewBlocked ?? true;
}
