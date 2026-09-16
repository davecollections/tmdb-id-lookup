import { useState } from "react";
import { NativeExtraAdvancedControls, NativeExtraSummary } from "./NativeExtraAdvancedControls.jsx";
import { DiscoverValueField } from "./DiscoverValueField.jsx";
import { DISCOVER_FIELD_LABELS, touchDiscoverFilters } from "../source-add/advanced-discover.js";
import { validateMinimumVotesFilters } from "../source-add/minimum-votes.js";
import { RATING_BOUNDS_FIELDS, validateRatingBounds } from "../source-add/rating-bounds.js";
import "./advanced-discover.css";

export function MinimumVotesSummary({ filters = {}, family, ...props }) {
 return <>
  <NativeExtraSummary filters={filters} {...props} />
  <p className="editor-field-help" {...{ [`data-${family}-minimum-votes-summary`]: "true" }}>Minimum votes: {filters.voteCountGte ?? "Not set"}</p>
  {RATING_BOUNDS_FIELDS.filter((field) => Object.hasOwn(filters, field)).map((field) => <p key={field} className="editor-field-help" {...{ [`data-${family}-rating-bounds-summary`]: field }}>{DISCOVER_FIELD_LABELS[field]}: {filters[field]}</p>)}
 </>;
}

export function MinimumVotesAdvancedOptions({ draft, onChange, family, entities = [] }) {
 const [expanded, setExpanded] = useState(false);
 const value = { ...draft, filters: draft.filters ?? {} };
 const editable = draft.minimumVotesEditable !== false;
 const validation = validateMinimumVotesFilters({ voteCountGte: draft.filters?.voteCountGte }, draft.mediaType ?? "MOVIE");
 const ratings = validateRatingBounds(value.filters, draft.mediaType ?? "MOVIE");
 return <details onToggle={(event) => setExpanded(event.currentTarget.open)} className="genre-advanced-options" {...{ [`data-${family}-advanced`]: "true" }}>
  <summary>Advanced options</summary>
  <div className="genre-advanced-content">
   <div className="native-threshold-fields">
   {editable ? <DiscoverValueField field="voteCountGte" draft={value} errors={validation.errors} onChange={(next) => onChange(touchDiscoverFilters(value, next))} />
    : <p className="editor-field-help">This imported Minimum votes setting cannot be edited here. Its original values will be preserved.</p>}
   {draft.ratingBoundsEditable !== false ? RATING_BOUNDS_FIELDS.map((field) => <DiscoverValueField key={field} field={field} draft={value} errors={ratings.errors} onChange={(next) => onChange(touchDiscoverFilters(value, next))} />)
    : <p className="editor-field-help">These imported rating settings cannot be edited here. Their original values will be preserved.</p>}
   </div>
   <NativeExtraAdvancedControls draft={value} onChange={(next) => onChange(touchDiscoverFilters(value, next))} entities={entities} expanded={expanded} />
  </div>
 </details>;
}
