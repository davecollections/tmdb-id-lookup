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

function multiSetup(options) {
	const s = setup(options);
	s.request = { sourceInternalIds: s.folder.sources.map((source) => source.internalId), genreNames: ["Horror"] };
	return s;
}

test("new review owns detached canonical arrays and remains unaffected by caller mutations", () => {
	const s = multiSetup(), ids = s.request.sourceInternalIds;
	s.request.sourceInternalIds = [ids[2], ids[0], ids[2]];
	const review = assertNoPublication(s.controller, () => s.controller.reviewScopedGenreExclusions(s.request)).review;
	assert.deepEqual(review.sourceInternalIds, [ids[0], ids[2]]);
	assert.equal(Object.hasOwn(review, "scope"), false);
	for (const value of [review, review.sourceInternalIds, review.genreNames, review.outcomes, review.outcomes[0],
		review.outcomes[0].patch.filters, review.totals, review.duplicateGroups]) assert.equal(Object.isFrozen(value), true);
	assert.throws(() => { review.sourceInternalIds.push(ids[1]); }, TypeError);
	assert.throws(() => { review.outcomes[0].status = "unchanged"; }, TypeError);
	s.request.sourceInternalIds.splice(0, 3, s.collection.folders[1].sources[0].internalId);
	s.request.genreNames[0] = "Comedy";
	s.request.sourceInternalIds = [];
	const result = s.controller.applyScopedGenreExclusions(review);
	assert.equal(result.ok, true);
	assert.deepEqual(result.changedTargets.map((target) => target.internalId), [ids[0], ids[2]]);
	const sources = s.controller.getState().project.collections[0].folders[0].sources;
	assert.equal(sources[0].editable.filters.withoutGenres, "27");
	assert.equal(sources[1], s.folder.sources[1]);
	assert.equal(sources[2].editable.filters.withoutGenres, "27");
	assert.equal(s.controller.getState().project.collections[0].folders[1], s.collection.folders[1]);
});

test("one Source-ID review publishes all selected branches together with exact serialization", () => {
	const s = setup();
	assert.equal(s.controller.appendImportedCollections([{ id: "second", title: "Second", folders: [{
		id: "second-folder", title: "Folder", sources: [
			{ provider: "tmdb", tmdbSourceType: "NETWORK", tmdbId: 12, mediaType: "TV", sortBy: "popularity.desc", filters: {} },
			{ provider: "tmdb", tmdbSourceType: "COMPANY", tmdbId: 42, mediaType: "MOVIE", sortBy: "popularity.desc", filters: {} },
		],
	}] }]).ok, true);
	const project = s.controller.getState().project, a = project.collections[0], b = project.collections[1];
	const chosen = [a.folders[0].sources[1], a.folders[1].sources[0], ...b.folders[0].sources];
	s.request = { sourceInternalIds: [...chosen].reverse().map((source) => source.internalId), genreNames: ["Horror"] };
	s.controller.selectNode(a.folders[0].sources[0].internalId);
	const before = s.controller.getState(), expected = structuredClone(serializeNuvioProject(before.project).value);
	const review = reviewFor(s), publications = [];
	assert.deepEqual(review.sourceInternalIds, chosen.map((source) => source.internalId));
	assert.deepEqual(review.totals, { inspected: 4, changed: 3, unchanged: 1, skipped: 0 });
	s.controller.subscribe(() => publications.push(s.controller.getState()));
	const result = s.controller.applyScopedGenreExclusions(review), after = s.controller.getState();
	assert.equal(result.ok, true);
	assert.deepEqual(publications, [after]);
	assert.equal(after.revision, before.revision + 1);
	assert.equal(after.selection, before.selection);
	expected[0].folders[0].sources[1].filters.withoutGenres = "27";
	expected[0].folders[1].sources[0].filters.withoutGenres = "27";
	expected[1].folders[0].sources[1].filters.withoutGenres = "27";
	assert.deepEqual(serializeNuvioProject(after.project).value, expected);
	assert.equal(after.project.collections[0].editable, a.editable);
	assert.equal(after.project.collections[1].editable, b.editable);
	assert.equal(after.project.collections[0].folders[0].sources[0], a.folders[0].sources[0]);
	assert.equal(after.project.collections[1].folders[0].sources[0], b.folders[0].sources[0]);
	assert.equal(result.changedTargets.length, 3);
});

test("Source-ID review rejects every non-issued capability without consuming the issued one", () => {
	const s = multiSetup(), review = reviewFor(s), other = multiSetup(), otherReview = reviewFor(other);
	const patched = structuredClone(review); patched.outcomes[0].patch.filters.withoutGenres = "35";
	const retargeted = structuredClone(review); retargeted.sourceInternalIds = [s.collection.folders[1].sources[0].internalId];
	for (const invalid of [null, undefined, 3, "review", {}, [], new Proxy(review, {}), { ...review },
		structuredClone(review), JSON.parse(JSON.stringify(review)), patched, retargeted, otherReview,
		planScopedGenreExclusions(s.opening.project, s.request)]) {
		const result = assertNoPublication(s.controller, () => s.controller.applyScopedGenreExclusions(invalid));
		assert.equal(result.ok, false);
		assert.equal(result.errors[0].code, "INVALID_SCOPED_GENRE_REVIEW");
	}
	assert.equal(s.controller.applyScopedGenreExclusions(review).ok, true);
	assert.equal(assertNoPublication(s.controller, () => s.controller.applyScopedGenreExclusions(review)).ok, false);
});

test("invalid Source-ID requests publish neither a partial review nor diagnostics", () => {
	const s = multiSetup(), valid = s.request;
	for (const request of [
		{ ...valid, scope: { nodeType: "folder", internalId: s.folder.internalId } },
		{ ...valid, unknown: true }, { ...valid, sourceInternalIds: null },
		{ ...valid, sourceInternalIds: Array(2) }, { ...valid, genreNames: Array(1) },
		{ ...valid, sourceInternalIds: [valid.sourceInternalIds[0], "missing"] },
		{ ...valid, sourceInternalIds: [valid.sourceInternalIds[0], s.folder.internalId] },
	]) {
		const result = assertNoPublication(s.controller, () => s.controller.reviewScopedGenreExclusions(request));
		assert.equal(result.ok, false);
		assert.equal(result.review, undefined);
	}
});

for (const [label, change] of Object.entries(changes)) test("Source-ID review retains project-wide freshness for " + label, () => {
	const s = multiSetup(), review = reviewFor(s);
	assert.equal(change(s).ok, true);
	const result = assertNoPublication(s.controller, () => s.controller.applyScopedGenreExclusions(review));
	assert.equal(result.ok, false);
	assert.equal(result.errors[0].code, "STALE_SCOPED_GENRE_REVIEW");
	assert.equal(assertNoPublication(s.controller, () => s.controller.applyScopedGenreExclusions(review)).errors[0].code, "INVALID_SCOPED_GENRE_REVIEW");
	if (label === "sourceAdd") {
		const currentSources = s.controller.getState().project.collections[0].folders[0].sources;
		const newSource = currentSources.at(-1);
		assert.equal(review.sourceInternalIds.includes(newSource.internalId), false);
		assert.equal(newSource.editable.filters?.withoutGenres, undefined);
		const refreshed = reviewFor(s);
		assert.equal(refreshed.sourceInternalIds.includes(newSource.internalId), false, "reusing explicit IDs never enrolls additions");
	}
});

test("editing an unselected sibling invalidates the combined review", () => {
	const s = multiSetup();
	s.request.sourceInternalIds = [s.folder.sources[0].internalId];
	const review = reviewFor(s);
	assert.equal(s.controller.updateNode(s.folder.sources[1].internalId, { filters: { withoutGenres: "27" } }).ok, true);
	const result = assertNoPublication(s.controller, () => s.controller.applyScopedGenreExclusions(review));
	assert.equal(result.errors[0].code, "STALE_SCOPED_GENRE_REVIEW");
});

test("new-form selection and diagnostic-only changes keep authority while retaining selection", () => {
	const s = multiSetup(), review = reviewFor(s);
	s.controller.selectNode(s.collection.folders[1].internalId);
	s.controller.selectNode("missing");
	const before = s.controller.getState();
	assert.equal(before.project, s.opening.project);
	assert.equal(s.controller.applyScopedGenreExclusions(review).ok, true);
	assert.equal(s.controller.getState().selection, before.selection);
});

for (const mode of ["zero selected", "already excluded", "all skipped"]) for (const dirty of [false, true]) {
	test("new-form no-op preserves complete clean/dirty state and consumes authority: " + mode + dirty, () => {
		const s = multiSetup({ excluded: mode === "already excluded" ? "27" : mode === "all skipped" ? "27|35" : null });
		if (mode === "zero selected") s.request.sourceInternalIds = [];
		if (dirty) s.controller.updateNode(s.collection.internalId, { title: "Changed locally" });
		s.controller.selectNode("missing");
		const review = reviewFor(s);
		assert.equal(review.totals.changed, 0);
		assert.equal(review.totals.inspected, mode === "zero selected" ? 0 : 3);
		if (mode === "zero selected") {
			assert.deepEqual(review.outcomes, []);
			assert.deepEqual(review.totals, { inspected: 0, changed: 0, unchanged: 0, skipped: 0 });
		}
		const result = assertNoPublication(s.controller, () => s.controller.applyScopedGenreExclusions(review));
		assert.equal(result.ok, true);
		assert.deepEqual(result.changedTargets, []);
		assert.equal(assertNoPublication(s.controller, () => s.controller.applyScopedGenreExclusions(review)).ok, false);
	});
}

test("unselected collision blockers remain immutable while a safe selected Source publishes once", () => {
	const s = multiSetup({ count: 3 });
	const imported = structuredClone(serializeNuvioProject(s.opening.project).value);
	const first = imported[0].folders[0].sources[0];
	// Unknown metadata participates in exact identity. The blocker must retain
	// the same metadata as the candidate, not the setup helper's per-entity data.
	imported[0].folders[0].sources[1] = { ...first, id: "raw-blocker", title: "Blocker",
		filters: { ...first.filters, withoutGenres: "27" } };
	assert.equal(s.controller.importValue(imported).ok, true);
	s.folder = s.controller.getState().project.collections[0].folders[0];
	s.request.sourceInternalIds = [s.folder.sources[0].internalId, s.folder.sources[2].internalId];
	const before = s.controller.getState(), review = reviewFor(s), expected = structuredClone(serializeNuvioProject(before.project).value);
	assert.deepEqual(review.totals, { inspected: 2, changed: 1, unchanged: 0, skipped: 1 });
	assert.equal(review.outcomes[0].reason.code, "DUPLICATE_CONVERGENCE");
	assert.ok(review.duplicateGroups[0].sourceInternalIds.includes(s.folder.sources[1].internalId));
	assert.equal(review.sourceInternalIds.includes(s.folder.sources[1].internalId), false);
	let publications = 0; s.controller.subscribe(() => { publications += 1; });
	assert.equal(s.controller.applyScopedGenreExclusions(review).ok, true);
	assert.equal(publications, 1);
	const after = s.controller.getState();
	assert.equal(after.revision, before.revision + 1);
	expected[0].folders[0].sources[2].filters.withoutGenres = "27";
	assert.deepEqual(serializeNuvioProject(after.project).value, expected);
	for (const i of [0, 1]) assert.equal(after.project.collections[0].folders[0].sources[i], before.project.collections[0].folders[0].sources[i]);
});

for (const multi of [false, true]) test("complete rebuild compares non-patch review evidence for variant " + (multi ? "Source IDs" : "scope"), () => {
	const s = multi ? multiSetup() : setup(), freeze = Object.freeze;
	let review, injected = false;
	try {
		// Fault the detached row just before issuance is frozen. This tests the
		// complete rebuilt comparison without an exposed production test hook.
		Object.freeze = (value) => {
			if (value?.sourceInternalId && Object.hasOwn(value, "afterExclusions")) {
				value.sourceTitle = "Corrupted detached evidence"; injected = true;
			}
			return freeze(value);
		};
		review = reviewFor(s);
	} finally { Object.freeze = freeze; }
	assert.equal(injected, true);
	const result = assertNoPublication(s.controller, () => s.controller.applyScopedGenreExclusions(review));
	assert.equal(result.errors[0].code, "INVALID_SCOPED_GENRE_REVIEW");
	assert.equal(assertNoPublication(s.controller, () => s.controller.applyScopedGenreExclusions(review)).ok, false);
});

test("new authority is consumed before subscriber reentry and invalidates competing reviews", () => {
	const s = multiSetup(), review = reviewFor(s), otherReview = reviewFor(s);
	let publications = 0, reentry;
	s.controller.subscribe(() => { publications += 1; reentry = s.controller.applyScopedGenreExclusions(review); throw new Error("listener failure"); });
	assert.equal(s.controller.applyScopedGenreExclusions(review).ok, true);
	assert.equal(publications, 1);
	assert.equal(reentry.ok, false);
	assert.equal(assertNoPublication(s.controller, () => s.controller.applyScopedGenreExclusions(otherReview)).errors[0].code, "STALE_SCOPED_GENRE_REVIEW");
	assert.equal(publications, 1);
});

test("new-form preparation failure leaves no partial project and consumes its authority", () => {
	const s = multiSetup(), review = reviewFor(s), before = s.controller.getState(), freeze = Object.freeze;
	let injected = false, result;
	try {
		Object.freeze = (value) => {
			if (value?.nodeType === "project" && value !== before.project) { injected = true; throw new Error("publication preparation failed"); }
			return freeze(value);
		};
		result = assertNoPublication(s.controller, () => s.controller.applyScopedGenreExclusions(review));
	} finally { Object.freeze = freeze; }
	assert.equal(injected, true);
	assert.equal(result.errors[0].code, "SCOPED_GENRE_APPLY_FAILED");
	assert.equal(assertNoPublication(s.controller, () => s.controller.applyScopedGenreExclusions(review)).ok, false);
});

test("large partial selection publishes once without touching the unselected half", () => {
	const s = multiSetup({ count: 2400 });
	const chosen = s.folder.sources.filter((_, i) => i % 2 === 0);
	s.request.sourceInternalIds = chosen.map((source) => source.internalId).reverse();
	const before = s.controller.getState(), review = reviewFor(s);
	assert.equal(review.totals.changed, 1200);
	let publications = 0; s.controller.subscribe(() => { publications += 1; });
	assert.equal(s.controller.applyScopedGenreExclusions(review).ok, true);
	assert.equal(publications, 1);
	assert.equal(s.controller.getState().revision, before.revision + 1);
	s.controller.getState().project.collections[0].folders[0].sources.forEach((source, i) => {
		if (i % 2) assert.equal(source, s.folder.sources[i]);
		else assert.equal(source.editable.filters.withoutGenres, "27");
	});
});
