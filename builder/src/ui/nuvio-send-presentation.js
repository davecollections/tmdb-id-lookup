import { sameRemoteContents } from "../nuvio-send/comparison.js";
import { isUsableNuvioId } from "../nuvio/nuvio-ids.js";

// Count top-level identity membership, never a difference between totals or titles.
// Ambiguous imported identities cannot support an exact removal claim.
export function sendRemovalCount(state) {
	if (state.review?.blobPresent === false) return 0;
	const remote = state.review?.collections;
	const proposed = state.proposal?.intended.collections;
	if (!Array.isArray(remote) || !Array.isArray(proposed)) return null;
	const identities = (collections) => {
		const ids = new Set();
		for (const collection of collections) {
			if (!isUsableNuvioId(collection?.id) || ids.has(collection.id)) return null;
			ids.add(collection.id);
		}
		return ids;
	};
	const before = identities(remote), after = identities(proposed);
	return before && after ? [...before].filter((id) => !after.has(id)).length : null;
}

// Interaction policy only; the coordinator retains its interruption resilience.
export function sendInProgress(state, connectionState) {
	return Boolean(state?.busy || connectionState?.busy);
}

export function sendRemovalWarning(count, profileName) {
	if (count === 0) return null;
	if (count === null) return "Collections not included in this Dingo project will be removed from this profile.";
	return `${count.toLocaleString("en-AU")} ${count === 1 ? "Collection" : "Collections"} from ‘${profileName}’ will be removed.`;
}

export function sendMergeHelp(profileName) {
	return `Want to keep the Collections already on ‘${profileName}’? Import this profile into Dingo and merge it with your project first. Then return to Export & Send to send the merged project.`;
}

export function sendAttentionLabel(state) {
	if (!state?.dispatch.count || state.phase === "VERIFIED") return null;
	return state.busy ? "Send in progress" : state.dispatch.kind === "rejected" ? "Send rejected" : "Check Nuvio Send";
}

// Reuse validated counts and arrays from the exact reviewed/frozen objects.
export function sendReviewGroups(state) {
	return [
		{ label: "Nuvio now", counts: state.review.counts, collections: state.review.collections },
		{ label: "From Dingo", counts: state.proposal.intended.counts, collections: state.proposal.intended.collections },
	];
}

export function reviewedSendIsIdentical(state) {
	return Boolean(state.review && state.proposal && sameRemoteContents(state.review, { blobPresent: true, collections: state.proposal.intended.collections }));
}

export function sendStatusLabel(state) {
	if (state.busy) return "Checking Send…";
	if (state.phase === "VERIFIED") return "Sent to Nuvio";
	if (state.dispatch.kind === "rejected") return "Send rejected";
	if (state.phase === "CONFLICT") return "Send needs review";
	if (state.dispatch.kind === "acknowledged") return "Send accepted — check needed";
	return "Send outcome unknown";
}

export function sendProgress(state, connectionState) {
	if (!state.busy && connectionState?.busy) return connectionState.busy === "login" ? "Connecting to Nuvio…" : connectionState.busy === "pin" ? "Checking PIN…" : "Checking Nuvio…";
	if (state.phase === "PREPARING") return state.target ? "Checking Nuvio…" : "Preparing replacement…";
	if (state.phase === "PREFLIGHT") return "Checking Nuvio…";
	if (state.phase === "DISPATCHING") return "Sending to Nuvio…";
	if (state.phase === "VERIFYING") return "Verifying Collections…";
	return "Loading Collections…";
}

export function sendResult(state) {
	const profile = state.baseline?.profile ?? state.target;
	if (state.phase === "VERIFIED") return { title: "Sent to Nuvio", text: `Your Collections are now on ‘${profile.name}’ (Profile ${profile.index}).`, detail: "Verified with Nuvio.", success: true };
	if (state.dispatch.kind === "rejected") return { title: "Replacement not accepted", text: "Nuvio rejected the replacement. No automatic retry was made." };
	if (state.dispatch.kind === "acknowledged") return {
		title: state.observation?.kind === "different" ? "Different Collections are now visible" : "Replacement accepted; verification incomplete",
		text: state.observation?.kind === "different" ? "Nuvio accepted the replacement request, but this profile now has different Collections. Check the profile before making more changes."
			: "Nuvio accepted the replacement request. Dingo couldn’t confirm the final profile state.",
	};
	return { title: "Send outcome is uncertain", text: "Dingo can’t confirm whether the replacement reached Nuvio. Another Send is blocked until this is resolved.",
		observation: state.observation?.kind === "previous" ? "The previous Collections are visible, but the replacement may still have reached Nuvio."
			: state.observation?.kind === "different" ? "Different Collections are now visible. The Send outcome remains uncertain." : null };
}

export function sendProblem(state) {
	if (state.phase === "REMOTE_CHANGED") return "Nothing was replaced. Review the latest Collections before trying again.";
	if (state.phase === "STALE_LOCAL") return "Your Dingo Collections changed. Return to Export & Send to prepare and review them again.";
	return ({
		VALIDATION: "These Collections cannot be sent yet. Return to Export & Send and resolve the listed problems.",
		PREPARATION: "Dingo could not prepare these Collections safely. Nothing was sent to Nuvio.",
		PROTECTED: "This profile needs current PIN verification. Choose the profile and verify its PIN again.",
		AUTHORITY_CHANGED: "The connection or profile access changed. Review the profile again before sending.",
		IDENTITY: "The Nuvio account or profile changed. Connect again and choose the profile.",
		AUTH: "Your Nuvio connection expired. Connect again before reviewing the profile.",
		CANCELLED: "Nothing was sent to Nuvio.",
	})[state.error] ?? "Dingo could not check Nuvio. Nothing was sent. Try reviewing the profile again.";
}
