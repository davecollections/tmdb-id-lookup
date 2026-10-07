export const COLLECTION_VIEW_MODES = Object.freeze(["TABBED_GRID", "ROWS", "FOLLOW_LAYOUT"]);

const labels = Object.freeze({
	TABBED_GRID: "Tabbed Grid",
	ROWS: "Rows",
	FOLLOW_LAYOUT: "Follow Home Layout",
});

export function collectionViewModeLabel(value) {
	return typeof value === "string" && Object.hasOwn(labels, value.toUpperCase())
		? labels[value.toUpperCase()]
		: null;
}

export function collectionLayoutSummary(viewMode, showAllTab, { includeStoredPreference = false } = {}) {
	const label = collectionViewModeLabel(viewMode);
	// Read-only inherited summaries retain the parent's saved preference even for Rows.
	if (!includeStoredPreference && label !== "Tabbed Grid" && label !== "Follow Home Layout") return label ?? "Imported layout";
	const preference = typeof showAllTab === "boolean" ? (showAllTab ? "on" : "off") : "inherited";
	return `${label ?? "Imported layout"} · All tab ${preference}${label === "Follow Home Layout" ? " when using tabs" : ""}`;
}
