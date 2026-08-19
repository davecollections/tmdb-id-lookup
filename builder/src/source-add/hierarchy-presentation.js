export function normalizeHierarchyShowAllTab(viewMode, showAllTab) {
	return typeof viewMode === "string" && viewMode.toUpperCase() === "ROWS" ? true : showAllTab;
}
