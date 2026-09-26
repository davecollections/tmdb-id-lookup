import { parseNuvioJsonText } from "./index.js";
import { collectionCounts } from "../domain/collection-counts.js";
import { countLimitedImportedSources } from "./import-notices.js";
import { cloneJsonValue } from "../domain/index.js";
import { deepFreeze } from "../application/state.js";

// Use the preservation-first parser and retain exact input, not serialized
// output (which may add compatibility projections or default fields).
export function reviewLocalJsonText(text, projectTitle, method) {
	let id = 0;
	const result = parseNuvioJsonText(text, { projectTitle, idFactory: () => `local-review-${++id}` });
	if (!result.ok) return result;
	return { ok: true, errors: [], warnings: result.warnings, snapshot: deepFreeze({
		kind: "ready", method, projectTitle,
		collections: result.project.collections.map((collection) => cloneJsonValue(collection.rawImported)),
		counts: collectionCounts(result.project.collections), warnings: result.warnings,
		limitedSourceCount: countLimitedImportedSources(result.project.collections),
	}) };
}
