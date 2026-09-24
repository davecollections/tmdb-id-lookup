import { deepFreeze, jsonValuesEqual } from "../application/state.js";

export function backupProfileSlug(name) {
	const slug = String(name).normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
		.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48).replace(/-+$/g, "");
	return slug || "profile";
}

// A Review utility only. The reviewed capture time makes retries deterministic;
// preparing or downloading this file never participates in the write operation.
export function prepareCurrentNuvioBackup(baseline) {
	const date = new Date(baseline.capturedAt);
	if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() < 0 || date.getUTCFullYear() > 9999) throw new TypeError("A valid review date is required.");
	const timestamp = date.toISOString().replace(/[-:.]/g, "");
	const current = baseline.blobPresent ? baseline.collections : [];
	const json = JSON.stringify(current, null, 2);
	if (!jsonValuesEqual(JSON.parse(json), current)) throw new TypeError("The backup JSON cannot exactly represent the current Collections.");
	return deepFreeze({
		filename: `nuvio-profile-${baseline.profile.index}-${backupProfileSlug(baseline.profile.name)}-current-before-dingo-${timestamp}.json`,
		json,
	});
}
