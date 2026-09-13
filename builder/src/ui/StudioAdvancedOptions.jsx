import { DiscoverValueField } from "./DiscoverValueField.jsx";
import { touchDiscoverFilters } from "../source-add/advanced-discover.js";
import { validateStudioAdvancedFilters } from "../source-add/studio-advanced.js";
import "./advanced-discover.css";

export function StudioMinimumVotesSummary({ filters = {} }) {
 return <p className="editor-field-help" data-studio-minimum-votes-summary="true">Minimum votes: {filters.voteCountGte ?? "Not set"}</p>;
}

export function StudioAdvancedOptions({ draft, onChange }) {
 const value = { ...draft, filters: draft.filters ?? {} };
 const editable = draft.minimumVotesEditable !== false;
 const validation = validateStudioAdvancedFilters(draft.filters, draft.mediaType ?? "MOVIE");
 return <details className="genre-advanced-options" data-studio-advanced="true">
  <summary>Advanced options</summary>
  <div className="genre-advanced-content">
   {editable ? <DiscoverValueField field="voteCountGte" draft={value} errors={validation.errors} onChange={(next) => onChange(touchDiscoverFilters(value, next))} />
    : <p className="editor-field-help">This imported Minimum votes setting cannot be edited here. Its original values will be preserved.</p>}
  </div>
 </details>;
}
