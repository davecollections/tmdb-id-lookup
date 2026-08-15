import assert from "node:assert/strict";
import test from "node:test";

import { createBuilderController } from "../builder/src/application/index.js";
import {
	applyDecadesHierarchyPlan,
	buildDecadesSourceDrafts,
	completeOfficialGenreNames,
	createDecadesHierarchyPlan,
	DECADES_PLACEMENT_STATUSES,
	inspectDecadesSourcePlacement,
	validateDecadesHierarchyPlan,
} from "../builder/src/source-add/index.js";

function countingFactory(prefix) {
	let count = 0;
	return () => `${prefix}-${++count}`;
}

function controller() {
	return createBuilderController({
		idFactory: countingFactory("internal"),
		nuvioIdFactory: countingFactory("nuvio"),
	});
}

function sourceConfiguration(overrides = {}) {
	return {
		selectedDecadeIds: ["1980s"],
		mediaMode: "movies",
		content: { wholeDecade: true, individualYears: false, genreBreakdown: false },
		currentYear: 2026,
		sortOptionId: "popular",
		genreNames: [],
		advanced: {},
		...overrides,
	};
}

function reverseObjectKeys(value) {
	if (Array.isArray(value)) return value.map((entry) => reverseObjectKeys(entry));
	if (value === null || typeof value !== "object") return value;
	return Object.fromEntries(Object.entries(value).reverse().map(([key, entry]) => [key, reverseObjectKeys(entry)]));
}

function planFor(current, options = {}) {
	return createDecadesHierarchyPlan(current.getState().project, {
		scope: "new-collection",
		projectRevision: current.getState().revision,
		source: sourceConfiguration(),
		...options,
	});
}

function addExistingDecadeSource(current, collectionInternalId, folderInternalId, mediaMode = "movies") {
	const draft = buildDecadesSourceDrafts(sourceConfiguration({ mediaMode })).drafts[0];
	return current.createSource(folderInternalId, draft);
}

test("New Collection Movies and Series plans use deterministic names, folders, sources and real presentation values", () => {
	for (const [mediaMode, title, sourceTitle] of [
		["movies", "Movie Decades", "1980s Movies"],
		["series", "TV Decades", "1980s Series"],
	]) {
		const current = controller();
		const result = planFor(current, {
			viewMode: "ROWS",
			source: sourceConfiguration({ mediaMode }),
		});
		assert.equal(result.ok, true);
		assert.deepEqual(result.plan.counts, { collectionCount: 1, folderCount: 1, sourceCount: 1 });
		assert.equal(result.plan.collections[0].editable.title, title);
		assert.equal(result.plan.collections[0].editable.viewMode, "ROWS");
		assert.equal(result.plan.collections[0].editable.showAllTab, true);
		assert.deepEqual(result.plan.collections[0].folders[0].editable, { title: "1980s", tileShape: "POSTER", hideTitle: true });
		assert.equal(result.plan.collections[0].folders[0].sources[0].draft.editable.title, sourceTitle);
	}
});

test("Both defaults to separate Movie and TV collections and can use one mixed collection", () => {
	const current = controller();
	const separate = planFor(current, { source: sourceConfiguration({ mediaMode: "both" }) });
	assert.equal(separate.ok, true);
	assert.deepEqual(separate.plan.counts, { collectionCount: 2, folderCount: 2, sourceCount: 2 });
	assert.deepEqual(separate.plan.collections.map((collection) => collection.editable.title), ["Movie Decades", "TV Decades"]);
	assert.deepEqual(separate.plan.collections.map((collection) => collection.folders[0].sources[0].draft.editable.mediaType), ["MOVIE", "TV"]);

	const mixed = planFor(current, {
		layout: "mixed-collection",
		collectionTitles: { mixed: "My Decades" },
		source: sourceConfiguration({ mediaMode: "both" }),
	});
	assert.equal(mixed.ok, true);
	assert.deepEqual(mixed.plan.counts, { collectionCount: 1, folderCount: 1, sourceCount: 2 });
	assert.equal(mixed.plan.collections[0].editable.title, "My Decades");
	assert.deepEqual(mixed.plan.collections[0].folders[0].sources.map((entry) => entry.draft.editable.title), [
		"1980s Movies", "1980s Series",
	]);
});

test("New Folder scope creates sibling decade folders and inherits the captured collection presentation without mutating it", () => {
	const current = controller();
	const collection = current.createCollection({ editable: { title: "Existing", viewMode: "ROWS", showAllTab: false } });
	const beforeEditable = current.getState().project.collections[0].editable;
	const result = createDecadesHierarchyPlan(current.getState().project, {
		scope: "new-folder",
		projectRevision: current.getState().revision,
		destinationCollectionInternalId: collection.createdInternalId,
		source: sourceConfiguration({
			selectedDecadeIds: ["1970s", "1980s"],
			mediaMode: "both",
		}),
	});
	assert.equal(result.ok, true);
	assert.deepEqual(result.plan.counts, { collectionCount: 0, folderCount: 2, sourceCount: 4 });
	assert.equal(result.plan.destination.viewMode, "ROWS");
	assert.deepEqual(result.plan.folders.map((folder) => folder.editable.title), ["1970s", "1980s"]);
	assert.deepEqual(result.plan.folders[0].sources.map((entry) => entry.draft.editable.mediaType), ["MOVIE", "TV"]);
	assert.equal(current.getState().project.collections[0].editable, beforeEditable);

	const applied = applyDecadesHierarchyPlan(current, result.plan);
	assert.equal(applied.ok, true);
	assert.deepEqual(current.getState().project.collections[0].editable, beforeEditable);
	assert.deepEqual(current.getState().project.collections[0].folders.map((folder) => folder.editable.title), ["1970s", "1980s"]);
});

test("duplicate placement distinguishes folder, collection, partial and elsewhere scopes using DISCOVER identity", () => {
	const current = controller();
	const destination = current.createCollection({ editable: { title: "Destination" } });
	const destinationFolder = current.createFolder(destination.createdInternalId, { editable: { title: "Existing" } });
	const elsewhere = current.createCollection({ editable: { title: "Elsewhere" } });
	const elsewhereFolder = current.createFolder(elsewhere.createdInternalId, { editable: { title: "Other" } });
	const movieDraft = buildDecadesSourceDrafts(sourceConfiguration()).drafts[0];
	const bothDrafts = buildDecadesSourceDrafts(sourceConfiguration({ mediaMode: "both" })).drafts;
	current.createSource(destinationFolder.createdInternalId, movieDraft);
	current.createSource(elsewhereFolder.createdInternalId, bothDrafts[1]);

	const inFolder = inspectDecadesSourcePlacement(current.getState().project, [movieDraft], {
		destinationCollectionInternalId: destination.createdInternalId,
		destinationFolderInternalId: destinationFolder.createdInternalId,
	});
	assert.equal(inFolder.status, DECADES_PLACEMENT_STATUSES.ALREADY_IN_FOLDER);

	const partial = inspectDecadesSourcePlacement(current.getState().project, bothDrafts, {
		destinationCollectionInternalId: destination.createdInternalId,
	});
	assert.equal(partial.status, DECADES_PLACEMENT_STATUSES.PARTLY_IN_COLLECTION);
	assert.deepEqual(partial.sourceOutcomes.map((entry) => entry.status), [
		DECADES_PLACEMENT_STATUSES.ALREADY_IN_COLLECTION,
		DECADES_PLACEMENT_STATUSES.EXISTS_ELSEWHERE,
	]);
	assert.equal(inspectDecadesSourcePlacement(current.getState().project, [bothDrafts[1]]).status, DECADES_PLACEMENT_STATUSES.EXISTS_ELSEWHERE);

	for (const distinctDraft of [
		buildDecadesSourceDrafts(sourceConfiguration({ sortOptionId: "recent" })).drafts[0],
		buildDecadesSourceDrafts(sourceConfiguration({ advanced: { minimumRating: 7 } })).drafts[0],
		buildDecadesSourceDrafts(sourceConfiguration({ advanced: { ordinaryExcludedGenres: ["Comedy"] } })).drafts[0],
	]) {
		assert.equal(inspectDecadesSourcePlacement(current.getState().project, [distinctDraft], {
			destinationCollectionInternalId: destination.createdInternalId,
		}).status, DECADES_PLACEMENT_STATUSES.READY);
	}
});

test("New Folder duplicate planning omits complete and partial destination-collection concepts but keeps elsewhere-only matches informational", () => {
	const current = controller();
	const destination = current.createCollection({ editable: { title: "Destination", viewMode: "TABBED_GRID" } });
	const existingFolder = current.createFolder(destination.createdInternalId, { editable: { title: "Existing" } });
	addExistingDecadeSource(current, destination.createdInternalId, existingFolder.createdInternalId);
	const result = createDecadesHierarchyPlan(current.getState().project, {
		scope: "new-folder",
		projectRevision: current.getState().revision,
		destinationCollectionInternalId: destination.createdInternalId,
		source: sourceConfiguration({ mediaMode: "both" }),
	});
	assert.equal(result.ok, true);
	assert.deepEqual(result.plan.counts, { collectionCount: 0, folderCount: 0, sourceCount: 0 });
	assert.equal(result.plan.outcomes[0].status, DECADES_PLACEMENT_STATUSES.PARTLY_IN_COLLECTION);
	current.createSource(existingFolder.createdInternalId, buildDecadesSourceDrafts(sourceConfiguration({ mediaMode: "both" })).drafts[1]);
	const complete = createDecadesHierarchyPlan(current.getState().project, {
		scope: "new-folder",
		projectRevision: current.getState().revision,
		destinationCollectionInternalId: destination.createdInternalId,
		source: sourceConfiguration({ mediaMode: "both" }),
	});
	assert.deepEqual(complete.plan.counts, { collectionCount: 0, folderCount: 0, sourceCount: 0 });
	assert.equal(complete.plan.outcomes[0].status, DECADES_PLACEMENT_STATUSES.ALREADY_IN_COLLECTION);

	const other = controller();
	const otherDestination = other.createCollection({ editable: { title: "Destination", viewMode: "TABBED_GRID" } });
	const elsewhereCollection = other.createCollection({ editable: { title: "Elsewhere" } });
	const elsewhereFolder = other.createFolder(elsewhereCollection.createdInternalId, { editable: { title: "Existing" } });
	addExistingDecadeSource(other, elsewhereCollection.createdInternalId, elsewhereFolder.createdInternalId);
	const informational = createDecadesHierarchyPlan(other.getState().project, {
		scope: "new-folder",
		projectRevision: other.getState().revision,
		destinationCollectionInternalId: otherDestination.createdInternalId,
		source: sourceConfiguration(),
	});
	assert.deepEqual(informational.plan.counts, { collectionCount: 0, folderCount: 1, sourceCount: 1 });
	assert.equal(informational.plan.outcomes[0].status, DECADES_PLACEMENT_STATUSES.EXISTS_ELSEWHERE);
});

test("new collections treat existing identical sources as informational instead of project-global uniqueness", () => {
	const current = controller();
	const collection = current.createCollection({ editable: { title: "Existing" } });
	const folder = current.createFolder(collection.createdInternalId, { editable: { title: "Existing" } });
	addExistingDecadeSource(current, collection.createdInternalId, folder.createdInternalId);
	const result = planFor(current);
	assert.equal(result.ok, true);
	assert.deepEqual(result.plan.counts, { collectionCount: 1, folderCount: 1, sourceCount: 1 });
	assert.equal(result.plan.outcomes[0].status, DECADES_PLACEMENT_STATUSES.EXISTS_ELSEWHERE);
	assert.equal(applyDecadesHierarchyPlan(current, result.plan).ok, true);
	assert.equal(current.getState().project.collections.length, 2);
});

test("plans are rejected when malformed or stale before any controller mutation", () => {
	const current = controller();
	const result = planFor(current);
	const malformed = structuredClone(result.plan);
	malformed.collections[0].folders[0].sources[0].draft.editable.title = "Tampered";
	const invalid = validateDecadesHierarchyPlan(malformed, {
		project: current.getState().project,
		projectRevision: current.getState().revision,
	});
	assert.equal(invalid.ok, false);
	assert.equal(invalid.stale, false);
	const before = current.getState().project;
	assert.equal(applyDecadesHierarchyPlan(current, malformed).ok, false);
	assert.equal(current.getState().project, before);

	current.createCollection({ editable: { title: "Unrelated" } });
	assert.equal(validateDecadesHierarchyPlan(result.plan, {
		project: current.getState().project,
		projectRevision: current.getState().revision,
	}).ok, true);
	current.createCollection({ editable: { title: "Movie Decades" } });
	const stale = validateDecadesHierarchyPlan(result.plan, {
		project: current.getState().project,
		projectRevision: current.getState().revision,
	});
	assert.equal(stale.ok, false);
	assert.equal(stale.stale, true);
	const beforeStaleApply = current.getState().project;
	assert.equal(applyDecadesHierarchyPlan(current, result.plan).stale, true);
	assert.equal(current.getState().project, beforeStaleApply);
});

test("plan validation ignores object-key order but strictly rejects shape and array changes", () => {
	const current = controller();
	const result = planFor(current, {
		source: sourceConfiguration({
			selectedDecadeIds: ["1970s", "1980s"],
			advanced: { minimumRating: 7, minimumVotes: 100 },
		}),
	});
	const validationOptions = {
		project: current.getState().project,
		projectRevision: current.getState().revision,
	};
	assert.equal(result.ok, true);
	assert.equal(Object.hasOwn(result.plan, "planVersion"), false);
	assert.equal(validateDecadesHierarchyPlan(result.plan, validationOptions).ok, true);
	assert.equal(validateDecadesHierarchyPlan(reverseObjectKeys(result.plan), validationOptions).ok, true);

	const reorderedFolders = structuredClone(result.plan);
	reorderedFolders.collections[0].folders.reverse();
	assert.equal(validateDecadesHierarchyPlan(reorderedFolders, validationOptions).ok, false);
	for (const malformed of [
		{ ...result.plan, extra: true },
		{ ...result.plan, extra: undefined },
		{ ...result.plan, planVersion: 1 },
		{ ...result.plan, counts: undefined },
		{ ...result.plan, counts: new Date(0) },
		{ ...result.plan, unsupported: Symbol("unsupported") },
	]) {
		assert.equal(validateDecadesHierarchyPlan(malformed, validationOptions).ok, false);
	}
	const { planType, ...withoutPlanType } = result.plan;
	assert.equal(planType, "decades-hierarchy-plan");
	assert.equal(validateDecadesHierarchyPlan(withoutPlanType, validationOptions).ok, false);
	const sparse = structuredClone(result.plan);
	sparse.collections[0].folders = new Array(2);
	sparse.collections[0].folders[0] = result.plan.collections[0].folders[0];
	assert.equal(validateDecadesHierarchyPlan(sparse, validationOptions).ok, false);
});

test("successful plan application produces ordinary serializable hierarchy with no plan metadata", () => {
	const current = controller();
	const result = planFor(current, {
		source: sourceConfiguration({ selectedDecadeIds: ["1950s-and-earlier", "2020s"] }),
	});
	const beforeRevision = current.getState().revision;
	const applied = applyDecadesHierarchyPlan(current, result.plan);
	assert.equal(applied.ok, true);
	assert.equal(current.getState().revision, beforeRevision + 1);
	const serialized = current.stringifyProject({ space: 0 });
	assert.equal(serialized.ok, true);
	assert.equal(serialized.json.includes("decades-hierarchy-plan"), false);
	assert.equal(serialized.json.includes("planVersion"), false);
	assert.equal(serialized.json.includes("currentYearMode"), false);
	assert.deepEqual(serialized.value[0].folders.map((folder) => folder.title), ["1950s & Earlier", "2020s"]);
});

test("representative plan counts derive from actual hierarchy bundles", () => {
	const cases = [
		[sourceConfiguration(), { collectionCount: 1, folderCount: 1, sourceCount: 1 }],
		[sourceConfiguration({ mediaMode: "both" }), { collectionCount: 2, folderCount: 2, sourceCount: 2 }],
		[sourceConfiguration({ mediaMode: "both", content: { wholeDecade: true, individualYears: true, genreBreakdown: false } }), { collectionCount: 2, folderCount: 2, sourceCount: 22 }],
		[sourceConfiguration({ mediaMode: "both", content: { wholeDecade: true, individualYears: true, genreBreakdown: true }, genreNames: ["Horror", "Comedy"] }), { collectionCount: 2, folderCount: 2, sourceCount: 25 }],
	];
	for (const [source, counts] of cases) {
		const current = controller();
		assert.deepEqual(planFor(current, { source }).plan.counts, counts);
	}
});

test("the accepted bounded maximum creates exactly 452 stable canonical sources without a controller ceiling", () => {
	const current = controller();
	const source = sourceConfiguration({
		selectedDecadeIds: ["1950s-and-earlier", "1960s", "1970s", "1980s", "1990s", "2000s", "2010s", "2020s"],
		mediaMode: "both",
		content: { wholeDecade: true, individualYears: true, genreBreakdown: true },
		currentYearMode: "through-current-year",
		genreNames: completeOfficialGenreNames(),
	});
	const first = planFor(current, { source });
	const second = planFor(current, { source });
	assert.equal(first.ok, true);
	assert.deepEqual(first.plan.counts, { collectionCount: 2, folderCount: 16, sourceCount: 452 });
	assert.equal(JSON.stringify(first.plan), JSON.stringify(second.plan));
	const entries = first.plan.collections.flatMap((collection) => collection.folders.flatMap((folder) => folder.sources));
	assert.equal(entries.length, 452);
	assert.equal(entries.filter((entry) => entry.contentKind === "genre-breakdown").length, 280);
	assert.ok(entries.filter((entry) => entry.contentKind === "genre-breakdown").every((entry) => entry.period.kind !== "year"));
	const beforeRevision = current.getState().revision;
	const applied = applyDecadesHierarchyPlan(current, first.plan);
	assert.equal(applied.ok, true);
	assert.equal(current.getState().revision, beforeRevision + 1);
	assert.equal(current.getState().project.collections.length, 2);
	assert.equal(current.getState().project.collections.reduce((count, collection) => count + collection.folders.length, 0), 16);
	assert.equal(current.getState().project.collections.reduce((count, collection) => count + collection.folders.reduce((subtotal, folder) => subtotal + folder.sources.length, 0), 0), 452);
});
