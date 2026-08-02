import { isPersonCreditCountSet } from "./person-credits.js";

export const PERSON_COUNT_STALE_MS = 5 * 60 * 1000;
export const INITIAL_PERSON_COUNT_STATE = Object.freeze({
	status: "not-checked",
	counts: null,
	error: null,
	checkedAt: null,
});

function freezeState(value) {
	return Object.freeze(value);
}

export function beginPersonCountCheck(state = INITIAL_PERSON_COUNT_STATE) {
	return freezeState({
		status: "checking",
		counts: isPersonCreditCountSet(state?.counts) ? state.counts : null,
		error: null,
		checkedAt: Number.isFinite(state?.checkedAt) ? state.checkedAt : null,
	});
}

export function completePersonCountCheck(counts, checkedAt = Date.now()) {
	if (!isPersonCreditCountSet(counts) || !Number.isFinite(checkedAt)) {
		throw new TypeError("Complete People counts require all four non-negative counts and a finite timestamp.");
	}
	return freezeState({ status: "ready", counts, error: null, checkedAt });
}

export function failPersonCountCheck(state, error) {
	return freezeState({
		status: "failed",
		counts: isPersonCreditCountSet(state?.counts) ? state.counts : null,
		error: {
			message: typeof error?.message === "string" && error.message.trim()
				? error.message.trim()
				: "Title counts could not be checked. You can still add these sources.",
			retryable: error?.retryable !== false,
		},
		checkedAt: Number.isFinite(state?.checkedAt) ? state.checkedAt : null,
	});
}

export function markPersonCountsStale(state, now = Date.now()) {
	if (
		state?.status !== "ready"
		|| !isPersonCreditCountSet(state.counts)
		|| !Number.isFinite(state.checkedAt)
		|| !Number.isFinite(now)
		|| now - state.checkedAt < PERSON_COUNT_STALE_MS
	) return state;
	return freezeState({ ...state, status: "stale" });
}

export function personCountDisplayState(state, key) {
	const value = isPersonCreditCountSet(state?.counts) ? state.counts[key] : null;
	if (state?.status === "checking") return { status: "checking", value };
	if (state?.status === "failed") return { status: "failed", value };
	if (state?.status === "stale") return { status: "stale", value };
	if (state?.status !== "ready" || value === null) return { status: "not-checked", value: null };
	return { status: value === 0 ? "ready-zero" : "ready-positive", value };
}
