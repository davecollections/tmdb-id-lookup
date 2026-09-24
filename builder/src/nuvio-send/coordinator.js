import { deepFreeze, jsonValuesEqual } from "../application/state.js";
import { NuvioConnectionError, publicConnectionError } from "../nuvio-connection/transport.js";
import { prepareSendProposal, isSendProposalCurrent } from "./proposal.js";
import { createSendBaseline, sameSendBaseline, sameSendTarget, observeSendResult } from "./comparison.js";

const emptyDispatch = () => ({ kind: "not-sent", count: 0, startedAt: null, status: null, code: null });
const initialState = () => ({ phase: "IDLE", busy: false, proposal: null, target: null, review: null, baseline: null,
	dispatch: emptyDispatch(), observation: null, unresolved: false, error: null, errors: [] });

/** Own one instance alongside the application's connection, not inside a dialog.
 * Closing a view does not dispose this store. No state is persisted or logged.
 */
export function createNuvioSendCoordinator({ controller, connection, now = Date.now }) {
	let state = deepFreeze(initialState());
	let dispatch = emptyDispatch();
	let busy = false;
	let disposed = false;
	let pending = null;
	const listeners = new Set();
	function publish(patch) {
		if (disposed) return;
		state = deepFreeze({ ...state, ...patch, busy, dispatch: { ...dispatch } });
		for (const listener of [...listeners]) { try { listener(); } catch { /* Observers do not own the attempt. */ } }
	}
	function notSent(code, phase = "NOT_SENT") {
		if (dispatch.count) return;
		pending?.abort();
		publish({ phase, error: code, review: null, baseline: null });
	}
	function available() { return !disposed && !busy && !state.unresolved; }
	function localCurrent() { return state.proposal && isSendProposalCurrent(state.proposal, controller); }
	function guard(review = state.review) {
		if (disposed || pending?.signal.aborted) throw new NuvioConnectionError("CANCELLED");
		if (!localCurrent()) { notSent("STALE_LOCAL", "STALE_LOCAL"); throw new NuvioConnectionError("CANCELLED"); }
		if (!review || state.review !== review || !connection.isSendAuthorityCurrent(review.authority, review.profile)) throw new NuvioConnectionError("IDENTITY");
	}
	const stopController = controller.subscribe(() => {
		if (!dispatch.count && state.proposal && !localCurrent()) notSent("STALE_LOCAL", "STALE_LOCAL");
	});
	const stopConnection = connection.subscribe(() => {
		if (!dispatch.count && state.review && !connection.isSendAuthorityCurrent(state.review.authority, state.review.profile)) notSent("AUTHORITY_CHANGED");
	});
	function prepare() {
		if (!available()) return false;
		busy = true; dispatch = emptyDispatch(); state = deepFreeze(initialState());
		publish({ phase: "PREPARING" });
		try {
			const result = prepareSendProposal(controller);
			if (!result.ok) { publish({ phase: "NOT_SENT", error: "VALIDATION", errors: result.errors }); return false; }
			publish({ phase: "PREPARED", proposal: result.proposal });
			if (!localCurrent()) { notSent("STALE_LOCAL", "STALE_LOCAL"); return false; }
			return true;
		} catch { publish({ phase: "NOT_SENT", error: "PREPARATION" }); return false; }
		finally { busy = false; publish({}); }
	}
	function selectProfile(profileId) {
		if (!available() || dispatch.count || !localCurrent()) return false;
		const profile = connection.getState().profiles.find((entry) => entry.id === profileId);
		if (!profile) return false;
		// Selection invalidates only Send review. Identity-keyed PIN grants belong
		// to the shared connection and remain reusable for their exact profiles.
		publish({ phase: "PREPARED", target: profile, review: null, baseline: null, error: null });
		return true;
	}
	async function review() {
		if (!available() || dispatch.count || !localCurrent() || !state.target) return false;
		busy = true; pending = new AbortController();
		publish({ phase: "PREPARING", review: null, baseline: null, error: null });
		try {
			// Successful PIN verification may have updated protection metadata since
			// selection. Start a new baseline using current metadata, never a new ID.
			const current = connection.getState().profiles.find((profile) => sameSendTarget(profile, state.target));
			if (!current) throw new NuvioConnectionError("IDENTITY");
			const baseline = createSendBaseline(await connection.readProfileForSend(current, { signal: pending.signal }));
			if (pending.signal.aborted || !localCurrent()) return false;
			if (!connection.isSendAuthorityCurrent(baseline.authority, baseline.profile)) throw new NuvioConnectionError("IDENTITY");
			publish({ phase: "REVIEWED", target: baseline.profile, review: baseline });
			return true;
		} catch (error) {
			if (!pending.signal.aborted) notSent(publicConnectionError(error).code);
			return false;
		} finally { pending = null; busy = false; publish({}); }
	}
	async function verify() {
		publish({ phase: "VERIFYING", error: null });
		try {
			const target = connection.getState().profiles.find((profile) => sameSendTarget(profile, state.baseline.profile));
			if (!target) throw new NuvioConnectionError("IDENTITY");
			const fresh = createSendBaseline(await connection.readProfileForSend(target, { signal: pending.signal }));
			const kind = observeSendResult(fresh, state.proposal, state.baseline);
			publish({ phase: kind === "intended" ? "VERIFIED" : kind === "different" ? "CONFLICT" : "OUTCOME_UNKNOWN",
				observation: { kind, baseline: fresh }, unresolved: dispatch.kind === "unknown" && kind !== "intended" });
			return kind === "intended";
		} catch (error) {
			publish({ phase: dispatch.kind === "acknowledged" ? "ACKNOWLEDGED" : "OUTCOME_UNKNOWN",
				observation: { kind: "unavailable" }, error: publicConnectionError(error).code, unresolved: dispatch.kind === "unknown" });
			return false;
		}
	}
	async function replaceCollections(reviewBaseline) {
		// Bind the action to the exact Review; stale handlers cannot approve a new one.
		if (!available() || dispatch.count || state.phase !== "REVIEWED" || !reviewBaseline || state.review !== reviewBaseline) return false;
		busy = true; pending = new AbortController();
		publish({ phase: "PREFLIGHT", error: null });
		try {
			guard(reviewBaseline);
			const fresh = createSendBaseline(await connection.readProfileForSend(reviewBaseline.profile, { authority: reviewBaseline.authority, signal: pending.signal }));
			guard(reviewBaseline);
			if (!sameSendBaseline(reviewBaseline, fresh)) { notSent("REMOTE_CHANGED", "REMOTE_CHANGED"); return false; }
			if (fresh.blobPresent && jsonValuesEqual(fresh.collections, state.proposal.intended.collections)) {
				publish({ phase: "NO_CHANGE", observation: { kind: "intended", baseline: fresh } }); return true;
			}
			publish({ baseline: fresh });
			const pushed = connection.pushCollectionsForSend(fresh.profile, state.proposal.intended.collections, {
				authority: fresh.authority, signal: pending.signal,
				beforeDispatch() {
					guard(reviewBaseline);
					if (dispatch.count) throw new NuvioConnectionError("CANCELLED");
					dispatch = { kind: "dispatching", count: 1, startedAt: new Date(now()).toISOString(), status: null, code: null };
				},
			});
			if (dispatch.count) publish({ phase: "DISPATCHING" });
			const result = await pushed;
			dispatch = { ...dispatch, kind: result.kind, status: result.status, code: result.code };
			if (!result.dispatched) { notSent(result.code ?? "GUARD"); return false; }
			publish({ phase: result.kind === "acknowledged" ? "ACKNOWLEDGED" : result.kind === "rejected" ? "REJECTED" : "OUTCOME_UNKNOWN",
				unresolved: result.kind === "unknown" });
			return result.kind === "rejected" ? false : await verify();
		} catch (error) {
			if (dispatch.count) {
				dispatch = { ...dispatch, kind: dispatch.kind === "acknowledged" ? "acknowledged" : "unknown" };
				publish({ phase: "OUTCOME_UNKNOWN", unresolved: dispatch.kind === "unknown", error: publicConnectionError(error).code });
				return await verify();
			}
			if (!pending.signal.aborted) notSent(publicConnectionError(error).code);
			return false;
		} finally { pending = null; busy = false; publish({}); }
	}
	async function checkNuvioAgain() {
		if (disposed || busy || !dispatch.count || !["ACKNOWLEDGED", "OUTCOME_UNKNOWN", "CONFLICT"].includes(state.phase)) return false;
		busy = true; pending = new AbortController();
		try { return await verify(); }
		finally { pending = null; busy = false; publish({}); }
	}
	function cancel() {
		if (dispatch.count || disposed) return false;
		notSent("CANCELLED"); return true;
	}
	return Object.freeze({
		getState: () => state,
		subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
		prepare, selectProfile, review, replaceCollections, checkNuvioAgain, cancel,
		dispose() { disposed = true; pending?.abort(); stopController(); stopConnection(); listeners.clear(); },
	});
}
