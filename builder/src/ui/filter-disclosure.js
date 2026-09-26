import { DISCOVER_ADVANCED_GROUPS } from "../source-add/native-shared-advanced.js";

function meaningful(field, value) {
	if (value == null || String(value).trim() === "") return false;
	if (field === "voteCountGte" || field === "voteAverageGte") return Number(value) > 0;
	if (field === "voteAverageLte") return Number(value) >= 0 && Number(value) < 10;
	// Region alone does not restrict titles; it only supplies provider context.
	return field !== "watchRegion";
}

// Count semantic groups, never selected chips, fixed family identity, metadata,
// preserved uneditable fields or controls absent from this disclosure.
export function appliedFilterCount(filters = {}, { editable = {}, hiddenFields = [], genreFilters = [filters], genresApplied = false } = {}) {
	const active = (field, values = filters) => editable[field] !== false && !hiddenFields.includes(field) && meaningful(field, values?.[field]);
	return DISCOVER_ADVANCED_GROUPS.filter((fields) => {
		if (fields.includes("withGenres")) return fields.some((field) => editable[field] !== false && !hiddenFields.includes(field))
			&& (genresApplied || genreFilters.some((values) => fields.some((field) => active(field, values))));
		return fields.some((field) => active(field));
	}).length;
}

export function filtersDisclosureSummary(count) {
	return count > 0 ? `${count} applied` : "Refine which titles are included.";
}
