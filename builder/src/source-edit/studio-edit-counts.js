import { canonicalPositiveId } from "./source-edit-utils.js";

function initialDimension(status = "not-checked") {
	return Object.freeze({ status, count: null, error: null });
}

export const INITIAL_STUDIO_EDIT_COUNT_STATE = Object.freeze({
	movie: initialDimension(),
	series: initialDimension(),
});

export function checkingStudioEditCounts() {
	return Object.freeze({
		movie: initialDimension("checking"),
		series: initialDimension("checking"),
	});
}

export function unavailableStudioEditCounts() {
	const unavailable = Object.freeze({
		status: "unavailable",
		count: null,
		error: Object.freeze({ message: "Count unavailable", retryable: true }),
	});
	return Object.freeze({ movie: unavailable, series: unavailable });
}

export function createStudioEditCountSession({ provider, studioId }) {
	const canonicalStudioId = canonicalPositiveId(studioId);
	if (canonicalStudioId === null || typeof provider?.getStudioCounts !== "function") {
		throw new TypeError("Studio edit counts require a positive Studio ID and count provider.");
	}
	let controller = null;

	async function load({ retry = false } = {}) {
		controller?.abort();
		controller = new AbortController();
		const activeController = controller;
		const result = await provider.getStudioCounts(canonicalStudioId, {
			signal: activeController.signal,
			bypassCache: retry,
		});
		if (activeController.signal.aborted) return null;
		return result?.ok ? result.data : unavailableStudioEditCounts();
	}

	function cancel() {
		controller?.abort();
		controller = null;
	}

	return Object.freeze({ studioId: canonicalStudioId, load, cancel });
}
