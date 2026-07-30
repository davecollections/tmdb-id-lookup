export const ADD_SOURCE_STEPS = Object.freeze({
	SEARCH: "search",
	REVIEW: "review",
});

function normalizedScrollTop(value) {
	return Math.max(0, Number.isFinite(value) ? value : 0);
}

function assertSelectedId(selectedId) {
	if (!Number.isSafeInteger(selectedId) || selectedId <= 0) {
		throw new TypeError("A positive safe TMDB collection ID is required.");
	}
}

export function createAddSourceNavigationState() {
	return Object.freeze({
		step: ADD_SOURCE_STEPS.SEARCH,
		selectedId: null,
		searchScrollTop: 0,
		restoreSearchFocusId: null,
		selectionScrollId: null,
		selectionScrollTop: null,
	});
}

export function captureAddSourceSelectionScroll(
	state,
	selectedId,
	searchScrollTop,
) {
	assertSelectedId(selectedId);
	if (state?.selectionScrollId === selectedId) return state;
	return Object.freeze({
		...state,
		selectionScrollId: selectedId,
		selectionScrollTop: normalizedScrollTop(searchScrollTop),
	});
}

export function enterAddSourceReview(
	state,
	selectedId,
	searchScrollTop = state?.searchScrollTop ?? 0,
) {
	assertSelectedId(selectedId);
	const capturedScrollTop = state?.selectionScrollId === selectedId
		? state.selectionScrollTop
		: null;
	return Object.freeze({
		step: ADD_SOURCE_STEPS.REVIEW,
		selectedId,
		searchScrollTop: capturedScrollTop === null
			? normalizedScrollTop(searchScrollTop)
			: normalizedScrollTop(capturedScrollTop),
		restoreSearchFocusId: null,
		selectionScrollId: null,
		selectionScrollTop: null,
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

function elementIsFullyVisible(scrollElement, resultElement) {
	if (
		typeof scrollElement?.getBoundingClientRect !== "function"
		|| typeof resultElement?.getBoundingClientRect !== "function"
	) return null;
	const scrollRect = scrollElement.getBoundingClientRect();
	const resultRect = resultElement.getBoundingClientRect();
	if (
		![scrollRect.top, scrollRect.bottom, resultRect.top, resultRect.bottom]
			.every(Number.isFinite)
	) return null;
	return resultRect.top >= scrollRect.top && resultRect.bottom <= scrollRect.bottom;
}

export function restoreAddSourceSearchView({
	scrollElement,
	resultElement,
	fallbackElement,
	searchScrollTop,
	focusWithoutScroll,
}) {
	if (scrollElement) {
		scrollElement.scrollTop = normalizedScrollTop(searchScrollTop);
	}

	let resultVisible = resultElement
		? elementIsFullyVisible(scrollElement, resultElement)
		: null;
	let visibilityAdjusted = false;
	if (resultVisible === false && typeof resultElement.scrollIntoView === "function") {
		resultElement.scrollIntoView({
			block: "nearest",
			inline: "nearest",
		});
		visibilityAdjusted = true;
		resultVisible = elementIsFullyVisible(scrollElement, resultElement);
	}

	const focusTarget = resultElement ?? fallbackElement ?? null;
	if (typeof focusWithoutScroll === "function") {
		focusWithoutScroll(focusTarget);
	}
	return Object.freeze({
		focusedResult: resultElement !== null && resultElement !== undefined,
		resultVisible,
		visibilityAdjusted,
	});
}
