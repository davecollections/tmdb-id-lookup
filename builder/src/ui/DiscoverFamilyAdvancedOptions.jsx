import { useEffect, useRef, useState } from "react";
import { NativeExtraAdvancedControls } from "./NativeExtraAdvancedControls.jsx";
import { changeDiscoverContext } from "../source-add/advanced-discover.js";
import { discoverFilterRows } from "../source-add/discover-selection-labels.js";

const legacyFields = Object.freeze({ minimumVotes: "voteCountGte", minimumRating: "voteAverageGte", maximumRating: "voteAverageLte", originalLanguage: "withOriginalLanguage", originCountry: "withOriginCountry" });

// Thin adapter for the pre-existing Genre/Decades scalar state. The controls,
// catalogue lifecycle, fields and nested panels are all the Discover components.
export function DiscoverFamilyAdvancedOptions({ value = { filters: {} }, onChange, mediaMode, legacy = false, dates = true, genreControls, fixedFilters = {}, fixedProviderContext = null, extraEditable, children, className = "" }) {
 const [expanded, setExpanded] = useState(false);
 const providerContext = [mediaMode, fixedFilters.watchRegion ?? value.filters?.watchRegion ?? ""].join("|");
 const previousContext = useRef(providerContext);
 useEffect(() => {
  const changed = previousContext.current !== providerContext;
  previousContext.current = providerContext;
  if (changed && (value.filters?.withWatchProviders || value.filters?.withoutWatchProviders)) onChange({ ...value, ui: { ...value.ui, providerContextReview: true } });
 }, [providerContext]);
 const filters = { ...value.filters };
 if (legacy) {
  for (const [key, field] of Object.entries(legacyFields)) if (value[key] !== undefined && value[key] !== null && value[key] !== "") filters[field] = value[key];
  if (value.yearFrom && !Object.hasOwn(filters, "releaseDateGte")) filters.releaseDateGte = value.yearFrom + "-01-01";
  if (value.yearTo && !Object.hasOwn(filters, "releaseDateLte")) filters.releaseDateLte = value.yearTo + "-12-31";
 }
 const draft = { ...value.ui, mediaMode, filters: { ...filters, ...fixedFilters }, labels: value.ui?.labels ?? {}, extraEditable };
 function change(next) {
  const context = draft.filters.watchRegion !== next.filters.watchRegion ? changeDiscoverContext(draft, next) : next;
  const nextFilters = { ...context.filters };
  for (const field of Object.keys(fixedFilters)) delete nextFilters[field];
  const state = { ...value, filters: nextFilters, ui: { ...context, filters: undefined, extraEditable: undefined } };
  if (legacy) {
   for (const [key, field] of Object.entries(legacyFields)) { state[key] = nextFilters[field] ?? ""; delete nextFilters[field]; }
   for (const [key, field] of [["yearFrom", "releaseDateGte"], ["yearTo", "releaseDateLte"]]) {
    if (JSON.stringify(filters[field]) !== JSON.stringify(nextFilters[field])) state[key] = "";
    else if (value[key]) delete nextFilters[field];
   }
  }
  onChange(state);
 }
 return <details className={["genre-advanced-options", className].filter(Boolean).join(" ")} data-decades-advanced={className.includes("decades-advanced-options") ? "true" : undefined} onToggle={(event) => { if (event.target === event.currentTarget) setExpanded(event.currentTarget.open); }}>
  <summary>Advanced options</summary>
  <div className="genre-advanced-content">
   <p className="editor-field-help">Leave an option blank if it should not affect results.</p>
   <NativeExtraAdvancedControls draft={draft} onChange={change} expanded={expanded} thresholds dateControls={dates} genreControls={genreControls} catalogueControls fixedProviderContext={fixedProviderContext} />
   {children}
  </div>
 </details>;
}

export function DiscoverFamilyAdvancedSummary({ value = {}, mediaMode, legacy = false, ui = value.ui }) {
 const filters = { ...value.filters };
 if (legacy) {
  for (const [key, field] of Object.entries(legacyFields)) if (value[key] !== "" && value[key] != null) filters[field] = value[key];
  if (value.yearFrom) filters.releaseDateGte = value.yearFrom + "-01-01";
  if (value.yearTo) filters.releaseDateLte = value.yearTo + "-12-31";
 }
 const rows = discoverFilterRows({ ...ui, labels: ui?.labels ?? {}, filters, mediaMode });
 return rows.length ? <details className="native-advanced-summary"><summary>Review Advanced filters</summary>{rows.map((row) => <p key={row.label} className="editor-field-help">{row.label}: {row.value}</p>)}</details> : null;
}
