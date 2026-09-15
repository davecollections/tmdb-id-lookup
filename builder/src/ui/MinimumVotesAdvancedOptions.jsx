import { DiscoverValueField } from "./DiscoverValueField.jsx";
import { touchDiscoverFilters } from "../source-add/advanced-discover.js";
import { validateMinimumVotesFilters } from "../source-add/minimum-votes.js";
import "./advanced-discover.css";

export function MinimumVotesSummary({ filters = {}, family }) {
 return <p className="editor-field-help" {...{ [`data-${family}-minimum-votes-summary`]: "true" }}>Minimum votes: {filters.voteCountGte ?? "Not set"}</p>;
}

export function MinimumVotesAdvancedOptions({ draft, onChange, family }) {
 const value = { ...draft, filters: draft.filters ?? {} };
 const editable = draft.minimumVotesEditable !== false;
 const validation = validateMinimumVotesFilters(draft.filters, draft.mediaType ?? "MOVIE");
 return <details className="genre-advanced-options" {...{ [`data-${family}-advanced`]: "true" }}>
  <summary>Advanced options</summary>
  <div className="genre-advanced-content">
   {editable ? <DiscoverValueField field="voteCountGte" draft={value} errors={validation.errors} onChange={(next) => onChange(touchDiscoverFilters(value, next))} />
    : <p className="editor-field-help">This imported Minimum votes setting cannot be edited here. Its original values will be preserved.</p>}
  </div>
 </details>;
}
