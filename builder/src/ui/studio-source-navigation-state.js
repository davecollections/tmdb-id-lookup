export const STUDIO_SOURCE_STEPS = Object.freeze({
	SEARCH: "search",
	CONFIGURE: "configure",
});

function normalizedScrollTop(value) {
	return Math.max(0, Number.isFinite(value) ? value : 0);
}

function assertStudioId(studioId) {
	if (!Number.isSafeInteger(studioId) || studioId <= 0) {
		throw new TypeError("A positive safe TMDB studio ID is required.");
	}
}

export function createStudioSourceNavigationState() {
	return Object.freeze({
		step: STUDIO_SOURCE_STEPS.SEARCH,
		selectedId: null,
		searchScrollTop: 0,
		restoreSearchFocusId: null,
	});
}

export function enterStudioConfigure(state, studioId, searchScrollTop = state?.searchScrollTop ?? 0) {
	assertStudioId(studioId);
	return Object.freeze({
		step: STUDIO_SOURCE_STEPS.CONFIGURE,
		selectedId: studioId,
		searchScrollTop: normalizedScrollTop(searchScrollTop),
		restoreSearchFocusId: null,
	});
}

export function returnStudioToSearch(state) {
	if (state?.step !== STUDIO_SOURCE_STEPS.CONFIGURE || state.selectedId === null) return state;
	return Object.freeze({ ...state, step: STUDIO_SOURCE_STEPS.SEARCH, restoreSearchFocusId: state.selectedId });
}

export function completeStudioSearchRestore(state) {
	if (state?.restoreSearchFocusId === null) return state;
	return Object.freeze({ ...state, restoreSearchFocusId: null });
}
