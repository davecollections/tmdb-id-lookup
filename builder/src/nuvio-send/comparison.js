import { deepFreeze, jsonValuesEqual } from "../application/state.js";
import { sameProtection } from "../nuvio-connection/profiles.js";

export function sameSendTarget(left, right) {
	return Boolean(left && right && left.accountId === right.accountId && left.id === right.id && left.index === right.index);
}

export function createSendBaseline({ snapshot, authority }) {
	return deepFreeze({
		authority, profile: snapshot.profile, blobPresent: snapshot.kind !== "missing",
		collections: snapshot.kind === "missing" ? null : snapshot.collections,
		updatedAtEvidence: snapshot.updatedAtEvidence,
		capturedAt: snapshot.capturedAt,
		counts: snapshot.counts ?? { collections: 0, folders: 0, sources: 0 },
		warnings: snapshot.warnings ?? [],
	});
}

export function sameRemoteContents(left, right) {
	return left.blobPresent === right.blobPresent && jsonValuesEqual(left.collections, right.collections);
}

export function sameSendBaseline(reviewed, fresh) {
	return sameSendTarget(reviewed.profile, fresh.profile)
		&& sameProtection(reviewed.profile, fresh.profile)
		&& jsonValuesEqual(reviewed.authority, fresh.authority)
		&& jsonValuesEqual(reviewed.updatedAtEvidence, fresh.updatedAtEvidence)
		&& sameRemoteContents(reviewed, fresh);
}

export function observeSendResult(fresh, proposed, backup) {
	if (!sameSendTarget(fresh.profile, backup.profile)) return "identity-changed";
	if (fresh.blobPresent && jsonValuesEqual(fresh.collections, proposed.intended.collections)) return "intended";
	return sameRemoteContents(fresh, backup) ? "previous" : "different";
}
