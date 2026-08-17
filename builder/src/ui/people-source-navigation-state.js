export const PEOPLE_SOURCE_STEPS = Object.freeze({
	SEARCH: "search",
	CONFIGURE: "configure",
	REVIEW: "review",
});

function normalizedScrollTop(value) {
	return Math.max(0, Number.isFinite(value) ? value : 0);
}

function assertPersonId(personId) {
	if (!Number.isSafeInteger(personId) || personId <= 0) {
		throw new TypeError("A positive safe TMDB person ID is required.");
	}
}

export function createPeopleSourceNavigationState() {
	return Object.freeze({
		step: PEOPLE_SOURCE_STEPS.SEARCH,
		selectedId: null,
		searchScrollTop: 0,
		restoreSearchFocusId: null,
		selectionScrollId: null,
		selectionScrollTop: null,
	});
}

export function capturePeopleSelectionScroll(state, personId, searchScrollTop) {
	assertPersonId(personId);
	if (state?.selectionScrollId === personId) return state;
	return Object.freeze({
		...state,
		selectionScrollId: personId,
		selectionScrollTop: normalizedScrollTop(searchScrollTop),
	});
}

export function enterPeopleConfigure(state, personId, searchScrollTop = state?.searchScrollTop ?? 0) {
	assertPersonId(personId);
	const captured = state?.selectionScrollId === personId ? state.selectionScrollTop : null;
	return Object.freeze({
		step: PEOPLE_SOURCE_STEPS.CONFIGURE,
		selectedId: personId,
		searchScrollTop: normalizedScrollTop(captured ?? searchScrollTop),
		restoreSearchFocusId: null,
		selectionScrollId: null,
		selectionScrollTop: null,
	});
}

export function returnPeopleToSearch(state) {
	if (state?.step !== PEOPLE_SOURCE_STEPS.CONFIGURE || state.selectedId === null) return state;
	return Object.freeze({
		...state,
		step: PEOPLE_SOURCE_STEPS.SEARCH,
		restoreSearchFocusId: state.selectedId,
	});
}

export function enterPeopleReview(state) {
	if (state?.step !== PEOPLE_SOURCE_STEPS.CONFIGURE) return state;
	return Object.freeze({ ...state, step: PEOPLE_SOURCE_STEPS.REVIEW, restoreSearchFocusId: null });
}

export function returnPeopleToConfigure(state) {
	if (state?.step !== PEOPLE_SOURCE_STEPS.REVIEW) return state;
	return Object.freeze({ ...state, step: PEOPLE_SOURCE_STEPS.CONFIGURE });
}

export function completePeopleSearchRestore(state) {
	if (state?.restoreSearchFocusId === null) return state;
	return Object.freeze({ ...state, restoreSearchFocusId: null });
}
