export const ADD_SOURCE_STEPS = Object.freeze({
	SEARCH: "search",
	REVIEW: "review",
});

export function createAddSourceNavigationState() {
	return Object.freeze({
		step: ADD_SOURCE_STEPS.SEARCH,
		selectedId: null,
		searchScrollTop: 0,
		restoreSearchFocusId: null,
	});
}

export function enterAddSourceReview(
	state,
	selectedId,
	searchScrollTop = state?.searchScrollTop ?? 0,
) {
	if (!Number.isSafeInteger(selectedId) || selectedId <= 0) {
		throw new TypeError("A positive safe TMDB collection ID is required.");
	}
	return Object.freeze({
		step: ADD_SOURCE_STEPS.REVIEW,
		selectedId,
		searchScrollTop: Math.max(0, Number.isFinite(searchScrollTop) ? searchScrollTop : 0),
		restoreSearchFocusId: null,
	});
}

export function returnAddSourceToSearch(state) {
	if (state?.step !== ADD_SOURCE_STEPS.REVIEW || state.selectedId === null) {
		return state;
	}
	return Object.freeze({
		...state,
		step: ADD_SOURCE_STEPS.SEARCH,
		restoreSearchFocusId: state.selectedId,
	});
}

export function completeAddSourceSearchRestore(state) {
	if (state?.restoreSearchFocusId === null) return state;
	return Object.freeze({
		...state,
		restoreSearchFocusId: null,
	});
}
