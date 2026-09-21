import { cloneJsonValue } from "../domain/index.js";
import { collectionCounts } from "../domain/collection-counts.js";
import { importNuvioCollections } from "../import/index.js";
import { countLimitedImportedSources } from "../import/import-notices.js";
import { deepFreeze } from "../application/state.js";
import { NuvioConnectionError } from "./transport.js";

export function captureNuvioCollections(value, profile, capturedAt) {
	if (!Array.isArray(value) || value.length > 1) throw new NuvioConnectionError("PAYLOAD");
	if (value.length === 0) return deepFreeze({ kind: "missing", profile: { ...profile }, capturedAt });
	const row = value[0];
	if (row?.profile_id !== profile.index || !Array.isArray(row.collections_json)) throw new NuvioConnectionError("PAYLOAD");
	let count = 0;
	const preview = importNuvioCollections(row.collections_json, { idFactory: () => `review-${++count}` });
	if (!preview.ok) throw new NuvioConnectionError("PAYLOAD");
	return deepFreeze({
		kind: row.collections_json.length ? "ready" : "empty",
		profile: { ...profile }, capturedAt,
		updatedAt: typeof row.updated_at === "string" && Number.isFinite(Date.parse(row.updated_at)) ? row.updated_at : null,
		collections: cloneJsonValue(row.collections_json),
		counts: collectionCounts(preview.project.collections), warnings: preview.warnings,
		limitedEditing: countLimitedImportedSources(preview.project.collections) > 0,
		limitedSourceCount: countLimitedImportedSources(preview.project.collections),
	});
}
