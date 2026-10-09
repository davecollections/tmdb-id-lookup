import assert from "node:assert/strict";
import test from "node:test";
import { createBuilderController } from "../builder/src/application/controller.js";
import { serializeNuvioProject } from "../builder/src/serialize/index.js";
import { planScopedGenreExclusions } from "../builder/src/source-edit/scoped-genre-exclusions.js";

function setup({ excluded = null, count = 3, empty = false } = {}) {
	let sequence = 0;
	const controller = createBuilderController({ idFactory: () => "node-" + ++sequence });
	const source = (id) => ({ id: "raw-" + id, title: "Local " + id, provider: "tmdb", tmdbSourceType: "COMPANY",
		tmdbId: id, mediaType: "MOVIE", sortBy: "popularity.desc",
		filters: { voteCountGte: "100", ...(excluded === null ? {} : { withoutGenres: excluded }) },
		metadata: { keep: [true, null, id] } });
	assert.equal(controller.importValue([{ id: "c", title: "Collection", viewMode: "ROWS", showAllTab: false,
		metadata: { keep: "parent" }, folders: [
			{ id: "f", title: "Folder", tileShape: "POSTER", sources: empty ? [] : Array.from({ length: count }, (_, i) => source(i + 1)) },
			{ id: "other", title: "Folder", sources: [source(10001)] },
		] }]).ok, true);
	const opening = controller.getState(), collection = opening.project.collections[0], folder = collection.folders[0];
	const request = { scope: { nodeType: "folder", internalId: folder.internalId }, genreNames: ["Horror"] };
	return { controller, opening, collection, folder, request };
}
function reviewFor(s) {
	const result = s.controller.reviewScopedGenreExclusions(s.request);
	assert.equal(result.ok, true, JSON.stringify(result.errors));
	return result.review;
}
function assertNoPublication(controller, action) {
	const before = controller.getState(), seen = [];
	const unsubscribe = controller.subscribe(() => seen.push(controller.getState()));
	let result;
	try { result = action(); } finally { unsubscribe(); }
	assert.equal(controller.getState(), before, "complete state snapshot is retained");
	assert.deepEqual(seen, []);
	return result;
}

test("review is detached, deeply frozen, controller-owned and side-effect free", () => {
	const s = setup(), review = assertNoPublication(s.controller, () => s.controller.reviewScopedGenreExclusions(s.request)).review;
	assert.equal(review.totals.changed, 3);
	for (const value of [review, review.scope, review.genreNames, review.outcomes, review.outcomes[0],
		review.outcomes[0].patch, review.outcomes[0].patch.filters, review.totals]) assert.equal(Object.isFrozen(value), true);
	assert.throws(() => { review.outcomes[0].patch.filters.voteCountGte = "0"; }, TypeError);
	assert.throws(() => { review.totals.changed = 100; }, TypeError);
	s.request.genreNames[0] = "Comedy";
	s.request.scope.internalId = s.collection.folders[1].internalId;
	const result = s.controller.applyScopedGenreExclusions(review);
	assert.equal(result.ok, true, "mutating the caller request cannot change the authenticated intent");
	assert.equal(s.controller.getState().project.collections[0].folders[0].sources[0].editable.filters.withoutGenres, "27");
	assert.equal(s.controller.getState().project.collections[0].folders[1], s.collection.folders[1]);
});

test("successful batch publishes once, preserves selection/order/raw data and changes only owned serialized fields", () => {
	const s = setup();
	s.controller.selectNode(s.folder.sources[1].internalId);
	const before = s.controller.getState(), beforeOutput = serializeNuvioProject(before.project);
	assert.equal(beforeOutput.ok, true);
	const review = reviewFor(s), states = [];
	s.controller.subscribe(() => states.push(s.controller.getState()));
	const result = s.controller.applyScopedGenreExclusions(review), after = s.controller.getState();
	assert.equal(result.ok, true);
	assert.deepEqual(states, [after]);
	assert.equal(after.revision, before.revision + 1);
	assert.equal(after.dirty, true);
	assert.equal(after.selection, before.selection);
	assert.equal(after.project.collections[0].editable, before.project.collections[0].editable);
	assert.equal(after.project.collections[0].rawImported, before.project.collections[0].rawImported);
	const next = after.project.collections[0].folders[0];
	assert.equal(next.editable, s.folder.editable);
	assert.deepEqual(next.sources.map((source) => source.internalId), s.folder.sources.map((source) => source.internalId));
	next.sources.forEach((source, index) => assert.equal(source.rawImported, s.folder.sources[index].rawImported));
	const expected = structuredClone(beforeOutput.value);
	for (const source of expected[0].folders[0].sources) source.filters.withoutGenres = "27";
	assert.deepEqual(serializeNuvioProject(after.project).value, expected);
	assert.deepEqual(serializeNuvioProject(before.project), beforeOutput);
	assert.equal(result.changedTargets.length, 3);
	const repeated = reviewFor(s);
	assert.equal(repeated.totals.changed, 0);
	assert.equal(assertNoPublication(s.controller, () => s.controller.applyScopedGenreExclusions(repeated)).ok, true);
});

for (const settings of [{ excluded: "27" }, { empty: true }]) for (const dirty of [false, true]) {
	test("no-op preserves clean/dirty state and is consumed: " + JSON.stringify({ settings, dirty }), () => {
		const s = setup(settings);
		if (dirty) s.controller.updateNode(s.collection.internalId, { title: "Changed locally" });
		const review = reviewFor(s);
		assert.equal(review.totals.changed, 0);
		assert.equal(assertNoPublication(s.controller, () => s.controller.applyScopedGenreExclusions(review)).ok, true);
		assert.equal(assertNoPublication(s.controller, () => s.controller.applyScopedGenreExclusions(review)).ok, false);
	});
}
test("no-op preserves existing diagnostics as well as project state", () => {
	const s = setup({ excluded: "27" });
	s.controller.selectNode("missing");
	const review = reviewFor(s);
	assert.equal(assertNoPublication(s.controller, () => s.controller.applyScopedGenreExclusions(review)).ok, true);
	assert.ok(s.controller.getState().diagnostics.operation.errors.length);
});

test("clones, proxies, plain plans, forged patches, cross-controller reviews and invalid values have no authority", () => {
	const s = setup(), review = reviewFor(s);
	const another = setup(), otherReview = reviewFor(another);
	const plainPlan = planScopedGenreExclusions(s.opening.project, s.request);
	const modified = structuredClone(review); modified.outcomes[0].patch.filters = { withoutGenres: "35" };
	for (const invalid of [null, undefined, 5, "review", {}, [], new Proxy(review, {}), { ...review }, structuredClone(review),
		JSON.parse(JSON.stringify(review)), plainPlan, modified, otherReview]) {
		const result = assertNoPublication(s.controller, () => s.controller.applyScopedGenreExclusions(invalid));
		assert.equal(result.ok, false);
		assert.equal(result.errors[0].code, "INVALID_SCOPED_GENRE_REVIEW");
	}
	assert.equal(s.controller.applyScopedGenreExclusions(review).ok, true, "invalid submissions do not consume the real capability");
	assert.equal(assertNoPublication(s.controller, () => s.controller.applyScopedGenreExclusions(review)).ok, false);
});
test("malformed review requests return diagnostics without publication", () => {
	const s = setup();
	for (const request of [null, {}, { ...s.request, genreNames: ["Unknown"] }, { ...s.request, patch: {} },
		{ ...s.request, scope: { nodeType: "folder", internalId: "missing" } }]) {
		assert.equal(assertNoPublication(s.controller, () => s.controller.reviewScopedGenreExclusions(request)).ok, false);
	}
});

const changes = {
	sourceEdit: (s) => s.controller.updateNode(s.folder.sources[0].internalId, { title: "Edited" }),
	parentEdit: (s) => s.controller.updateNode(s.collection.internalId, { title: "Edited" }),
	outsideScopeEdit: (s) => s.controller.updateNode(s.collection.folders[1].sources[0].internalId, { title: "Edited" }),
	sourceDelete: (s) => s.controller.removeNode(s.folder.sources[0].internalId),
	scopeDelete: (s) => s.controller.removeNode(s.folder.internalId),
	sourceReorder: (s) => s.controller.moveNode(s.folder.sources[0].internalId, 2),
	sourceAdd: (s) => s.controller.createSource(s.folder.internalId, { category: "opaque", editable: { title: "New" } }),
	scopeMove: (s) => {
		const result = s.controller.createCollection({ editable: { title: "Destination" } });
		assert.equal(result.ok, true);
		return s.controller.moveFolders({ openingProject: s.controller.getState().project,
			sourceCollectionInternalId: s.collection.internalId, folderInternalIds: [s.folder.internalId],
			destination: { kind: "existing", internalId: result.createdInternalId }, deleteEmptySource: false });
	},
	import: (s) => s.controller.importValue([{ id: "replacement", title: "Replacement", folders: [] }]),
	reset: (s) => s.controller.startNewProject(),
};
for (const [label, change] of Object.entries(changes)) test("stale review rejects " + label + " without partial publication", () => {
	const s = setup(), review = reviewFor(s);
	assert.equal(change(s).ok, true);
	const result = assertNoPublication(s.controller, () => s.controller.applyScopedGenreExclusions(review));
	assert.equal(result.ok, false);
	assert.equal(result.errors[0].code, "STALE_SCOPED_GENRE_REVIEW");
	assert.equal(assertNoPublication(s.controller, () => s.controller.applyScopedGenreExclusions(review)).ok, false);
});
test("selection changes and diagnostics do not invalidate unchanged content", () => {
	const s = setup(), review = reviewFor(s);
	s.controller.selectNode(s.collection.folders[1].internalId);
	s.controller.selectNode("missing");
	const before = s.controller.getState();
	assert.equal(before.project, s.opening.project);
	assert.equal(s.controller.applyScopedGenreExclusions(review).ok, true);
	assert.equal(s.controller.getState().selection, before.selection);
});
test("another committed review invalidates all outstanding reviews from that project", () => {
	const s = setup(), first = reviewFor(s), second = reviewFor(s);
	assert.equal(s.controller.applyScopedGenreExclusions(first).ok, true);
	assert.equal(assertNoPublication(s.controller, () => s.controller.applyScopedGenreExclusions(second)).ok, false);
});
test("review is consumed before subscriber re-entry and listener failures do not prevent one publication", () => {
	const s = setup(), review = reviewFor(s);
	let publications = 0, repeated;
	s.controller.subscribe(() => { publications += 1; repeated = s.controller.applyScopedGenreExclusions(review); throw new Error("listener failure"); });
	assert.equal(s.controller.applyScopedGenreExclusions(review).ok, true);
	assert.equal(publications, 1);
	assert.equal(repeated.ok, false);
});
test("publication preparation failure after candidate construction leaves the entire old snapshot intact", () => {
	const s = setup(), review = reviewFor(s), before = s.controller.getState();
	const freeze = Object.freeze;
	let injected = false, result;
	try {
		// Fault the new Project freeze before commitPatch can assign its completed state.
		// No production injection hook or changes to domain mutation are required.
		Object.freeze = (value) => {
			if (value?.nodeType === "project" && value !== before.project) { injected = true; throw new Error("publication preparation failed"); }
			return freeze(value);
		};
		result = assertNoPublication(s.controller, () => s.controller.applyScopedGenreExclusions(review));
	} finally { Object.freeze = freeze; }
	assert.equal(injected, true);
	assert.equal(result.ok, false);
	assert.equal(result.errors[0].code, "SCOPED_GENRE_APPLY_FAILED");
});
test("mixed safe subset applies once and leaves skipped/unchanged Sources byte-for-byte equivalent", () => {
	const s = setup({ count: 4 });
	s.controller.updateNode(s.folder.sources[1].internalId, { filters: { withGenres: "27" } });
	s.controller.updateNode(s.folder.sources[2].internalId, { filters: { withoutGenres: "27" } });
	s.controller.updateNode(s.folder.sources[3].internalId, { filters: { withoutGenres: "27|35" } });
	const before = s.controller.getState(), review = reviewFor(s);
	assert.deepEqual(review.totals, { inspected: 4, changed: 1, unchanged: 1, skipped: 2 });
	const expected = structuredClone(serializeNuvioProject(before.project).value);
	expected[0].folders[0].sources[0].filters.withoutGenres = "27";
	const seen = []; s.controller.subscribe(() => seen.push(s.controller.getState()));
	assert.equal(s.controller.applyScopedGenreExclusions(review).ok, true);
	assert.equal(seen.length, 1);
	assert.deepEqual(serializeNuvioProject(s.controller.getState().project).value, expected);
	for (let index = 1; index < 4; index++) assert.equal(s.controller.getState().project.collections[0].folders[0].sources[index], before.project.collections[0].folders[0].sources[index]);
});
test("large atomic batch has no Source cap or intermediate publications", () => {
	const s = setup({ count: 1600 }), review = reviewFor(s);
	let publications = 0; s.controller.subscribe(() => { publications += 1; });
	assert.equal(review.totals.changed, 1600);
	assert.equal(s.controller.applyScopedGenreExclusions(review).ok, true);
	assert.equal(publications, 1);
	assert.ok(s.controller.getState().project.collections[0].folders[0].sources.every((source) => source.editable.filters.withoutGenres === "27"));
});
