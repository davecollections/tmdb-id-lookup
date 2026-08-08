export const NETWORK_SOURCE_STEPS = Object.freeze({ SEARCH: "search", CONFIGURE: "configure" });

function normalizedScrollTop(value) {
	return Math.max(0, Number.isFinite(value) ? value : 0);
}

function assertNetworkId(networkId) {
	if (!Number.isSafeInteger(networkId) || networkId <= 0) throw new TypeError("A positive safe TMDB Network ID is required.");
}

export function createNetworkSourceNavigationState() {
	return Object.freeze({ step: NETWORK_SOURCE_STEPS.SEARCH, selectedId: null, searchScrollTop: 0, restoreSearchFocusId: null });
}

export function enterNetworkConfigure(state, networkId, searchScrollTop = state?.searchScrollTop ?? 0) {
	assertNetworkId(networkId);
	return Object.freeze({
		step: NETWORK_SOURCE_STEPS.CONFIGURE,
		selectedId: networkId,
		searchScrollTop: normalizedScrollTop(searchScrollTop),
		restoreSearchFocusId: null,
	});
}

export function returnNetworkToSearch(state) {
	if (state?.step !== NETWORK_SOURCE_STEPS.CONFIGURE || state.selectedId === null) return state;
	return Object.freeze({ ...state, step: NETWORK_SOURCE_STEPS.SEARCH, restoreSearchFocusId: state.selectedId });
}

export function completeNetworkSearchRestore(state) {
	if (state?.restoreSearchFocusId === null) return state;
	return Object.freeze({ ...state, restoreSearchFocusId: null });
}
