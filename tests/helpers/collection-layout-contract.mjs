import assert from "node:assert/strict";
import { serializeNuvioProject } from "../../builder/src/serialize/index.js";

// Reuse each family's existing pure fixtures and real plan/apply functions.
// This checks local JSON authoring and preservation, never external-service results.
export function assertCollectionLayoutPlanContract({ controller, plan, apply }) {
	for (const viewMode of ["TABBED_GRID", "ROWS", "FOLLOW_LAYOUT"]) {
		for (const showAllTab of [false, true]) {
			const app = controller();
			const before = app.getState();
			const result = plan(app, { scope: "new-collection", viewMode, showAllTab });
			assert.equal(result.ok, true, JSON.stringify(result.errors));
			assert.equal(app.getState(), before, "planning is not a project mutation");
			assert.equal(apply(app, result.plan).ok, true, `${viewMode}/${showAllTab} applies through revalidation`);
			const created = serializeNuvioProject(app.getState().project).value.slice(before.project.collections.length);
			assert.ok(created.length > 0);
			for (const collection of created) {
				assert.equal(collection.viewMode, viewMode);
				assert.equal(collection.showAllTab, viewMode === "ROWS" ? true : showAllTab);
			}
			assert.equal(app.getState().revision, before.revision + 1);
		}
	}
	for (const viewMode of ["FUTURE_LAYOUT", "follow_layout", {}, ["FOLLOW_LAYOUT"]]) {
		const app = controller(), before = app.getState();
		assert.equal(plan(app, { scope: "new-collection", viewMode }).ok, false);
		assert.equal(app.getState(), before);
	}
	for (const showAll of [{ showAllTab: false }, { showAllTab: true }, {}, { showAllTab: { community: true } }]) {
		const app = controller();
		assert.equal(app.importValue([{ id: "parent", title: "Existing", viewMode: "FOLLOW_LAYOUT", ...showAll,
			community: { preserve: true }, folders: [{ id: "existing", title: "Existing folder", sources: [] }] }], { discardChanges: true }).ok, true);
		const before = app.getState(), original = serializeNuvioProject(before.project).value[0];
		const result = plan(app, { scope: "new-folder", destinationCollectionInternalId: before.project.collections[0].internalId });
		assert.equal(result.ok, true, JSON.stringify(result.errors));
		assert.equal(app.getState(), before);
		assert.equal(apply(app, result.plan).ok, true);
		const after = serializeNuvioProject(app.getState().project).value[0];
		assert.deepEqual({ ...after, folders: [] }, { ...original, folders: [] }, "New Folder preserves parent presentation and raw data");
		assert.deepEqual(after.folders.slice(0, original.folders.length), original.folders);
	}
}
