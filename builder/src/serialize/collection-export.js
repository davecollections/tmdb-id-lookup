import { collectionCounts } from "../domain/collection-counts.js";
import { deepFreeze } from "../application/state.js";

// One canonical preparation per authoritative project, shared by delivery paths.
// Diagnostic revisions do not invalidate it. Preparation stays outside rendering.
const preparations = new WeakMap();
export function createCollectionExportPayload(controller) {
	if (preparations.has(controller)) return preparations.get(controller);
	let project = null;
	let payload = null;
	const prepare = () => {
		const current = controller.getState().project;
		if (project !== current) {
			const result = controller.stringifyProject({ space: 2 });
			project = current;
			payload = deepFreeze({
				ok: result.ok, collections: result.value, json: result.json,
				errors: result.errors, warnings: result.warnings, project,
				counts: collectionCounts(result.ok ? result.value : project.collections),
			});
		}
		return payload;
	};
	preparations.set(controller, prepare);
	return prepare;
}
