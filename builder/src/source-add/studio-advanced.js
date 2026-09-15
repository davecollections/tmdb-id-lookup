import { nativeEntityPreviewQuery } from "./native-entity-preview-query.js";
export {
 MINIMUM_VOTES_FIELDS as STUDIO_ADVANCED_FIELDS,
 validateMinimumVotesFilters as validateStudioAdvancedFilters,
 inspectMinimumVotes as inspectStudioMinimumVotes,
 minimumVotesComparisonFilters as studioComparisonFilters,
} from "./minimum-votes.js";

export function studioPreviewQuery(studioId, options) {
 return nativeEntityPreviewQuery(studioId, "withCompanies", options);
}
