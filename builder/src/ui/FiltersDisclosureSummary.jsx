import { filtersDisclosureSummary } from "./filter-disclosure.js";

export function FiltersDisclosureSummary({ count }) {
	return <summary><span className="filters-disclosure-label"><strong>Filters</strong><small>{filtersDisclosureSummary(count)}</small></span></summary>;
}
