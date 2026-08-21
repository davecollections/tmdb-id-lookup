import assert from "node:assert/strict";
import test from "node:test";

import { createBuilderController } from "../builder/src/application/index.js";
import { NUVIO_INVISIBLE_TITLE } from "../builder/src/nuvio/titles.js";
import {
	addSelectedFranchise,
	applyFranchiseHierarchyPlan,
	buildMovieFranchiseSourceDraft,
	createFranchiseHierarchyPlan,
	createFranchiseSelectionState,
	franchiseSelectionNotice,
	FRANCHISE_PLACEMENT_STATUSES,
	removeSelectedFranchise,
	resolveFranchiseFolderArtwork,
	selectedFranchises,
	validateFranchiseHierarchyPlan,
} from "../builder/src/source-add/index.js";
import {
	creationOptionById,
	creationOptionSupportsScope,
	creationOptionsForScope,
	CREATION_OPTION_IDS,
} from "../builder/src/ui/creation-options.js";

function idFactory(prefix = "node") {
	let next = 0;
	return () => `${prefix}-${++next}`;
}

function controller() {
	return createBuilderController({ idFactory: idFactory(), nuvioIdFactory: idFactory("nuvio"), initialProjectTitle: "Franchise test" });
}

function franchise(id, name, overrides = {}) {
	return {
		id,
		name,
		overview: `${name} overview`,
		posterPath: `/poster-${id}.jpg`,
		backdropPath: `/backdrop-${id}.jpg`,
		movieCount: 2,
		containedTitles: [
			{ id: id * 10, title: `${name} One`, releaseYear: 2001, posterPath: `/movie-${id}.jpg` },
			{ id: id * 10 + 1, title: `${name} Two`, releaseYear: 2004, posterPath: null },
		],
		...overrides,
	};
}

test("creation family registry exposes Franchises in both hierarchy scopes", () => {
	assert.equal(creationOptionById(CREATION_OPTION_IDS.FRANCHISES).label, "Franchises");
	for (const scope of ["new-collection", "new-folder"]) {
		assert.equal(creationOptionSupportsScope(CREATION_OPTION_IDS.FRANCHISES, scope), true);
		assert.deepEqual(creationOptionsForScope(scope).map((option) => option.id), ["blank", "decades", "people", "franchises", "studios", "networks", "genres"]);
	}
});

test("ordered franchise selection keeps insertion order through 100+, has no cap, and removes independently", () => {
	let state = createFranchiseSelectionState();
	for (let id = 1; id <= 125; id += 1) state = addSelectedFranchise(state, franchise(id, `Franchise ${id}`)).state;
	assert.equal(selectedFranchises(state).length, 125);
	assert.deepEqual(selectedFranchises(state).slice(-3).map((entry) => entry.id), [123, 124, 125]);
	assert.deepEqual(franchiseSelectionNotice(state), { visible: true, count: 125, threshold: 50 });
	state = removeSelectedFranchise(state, 50);
	assert.equal(selectedFranchises(state).some((entry) => entry.id === 50), false);
	state = addSelectedFranchise(state, franchise(50, "Franchise 50")).state;
	assert.equal(selectedFranchises(state).at(-1).id, 50);
	assert.equal(addSelectedFranchise(state, franchise(126, "Franchise 126")).limitReached, false);
});

test("representative 2, 20, 50, and 100+ selections produce exact uncapped plan totals", () => {
	for (const count of [2, 20, 50, 125]) {
		const app = controller();
		const state = app.getState();
		const franchises = Array.from({ length: count }, (_, index) => franchise(index + 1, `Scale Collection ${index + 1}`));
		const result = createFranchiseHierarchyPlan(state.project, { scope: "new-collection", projectRevision: state.revision, franchises });
		assert.equal(result.ok, true);
		assert.deepEqual(result.plan.counts, { collectionCount: 1, folderCount: count, sourceCount: count });
		assert.deepEqual(result.plan.collections[0].folders.map((folder) => folder.franchiseId), franchises.map((entry) => entry.id));
		if (count === 125) {
			const applied = applyFranchiseHierarchyPlan(app, result.plan);
			assert.equal(applied.ok, true);
			assert.equal(app.getState().revision, state.revision + 1);
			assert.equal(app.getState().project.collections[0].folders.length, 125);
		}
	}
});

test("franchise artwork is Poster-only, maps only the Collection poster to cover, and keeps backdrop out of the tile", () => {
	const item = franchise(10, "The Example Collection");
	const poster = resolveFranchiseFolderArtwork(item);
	assert.equal(poster.tileShape, "POSTER");
	assert.equal(poster.source, "poster");
	assert.equal(poster.folderEditable.coverImageUrl, "https://image.tmdb.org/t/p/w500/poster-10.jpg");
	assert.equal(Object.hasOwn(poster.folderEditable, "heroBackdropUrl"), false);
	const fallback = resolveFranchiseFolderArtwork(franchise(11, "Fallback Saga", { posterPath: null }));
	assert.equal(fallback.source, "emoji");
	assert.deepEqual(fallback.folderEditable, { coverImageUrl: "", coverEmoji: "🎬" });
	assert.equal(JSON.stringify(fallback).includes("backdrop-11"), false);
	const emoji = resolveFranchiseFolderArtwork(franchise(12, "No Art Trilogy", { posterPath: null, backdropPath: null }));
	assert.deepEqual(emoji.folderEditable, { coverImageUrl: "", coverEmoji: "🎬" });
});

test("New Collection plan preserves canonical TMDB wording, selection order, and exact native source contract", () => {
	const app = controller();
	const state = app.getState();
	const selected = [
		franchise(100, "The Example Collection"),
		franchise(101, "Example Saga"),
		franchise(102, "Example Trilogy"),
	];
	const result = createFranchiseHierarchyPlan(state.project, { scope: "new-collection", projectRevision: state.revision, franchises: selected });
	assert.equal(result.ok, true);
	assert.equal(result.plan.collections[0].editable.title, "Franchises");
	assert.equal(result.plan.configuration.folderTileShape, "POSTER");
	assert.equal(result.plan.configuration.folderTitleVisibility, "HIDE_HOME_SCREEN");
	assert.deepEqual(result.plan.collections[0].folders.map((folder) => folder.franchiseName), selected.map((entry) => entry.name));
	assert.deepEqual(result.plan.collections[0].folders.map((folder) => folder.editable.title), selected.map((entry) => entry.name));
	for (const [index, folder] of result.plan.collections[0].folders.entries()) {
		assert.equal(folder.editable.hideTitle, true);
		assert.deepEqual(folder.sources[0].draft, {
			category: "native-tmdb",
			editable: {
				title: selected[index].name,
				sortBy: "original",
				tmdbId: selected[index].id,
				filters: {},
				provider: "tmdb",
				mediaType: "MOVIE",
				tmdbSourceType: "COLLECTION",
			},
		});
	}
	assert.deepEqual(result.plan.counts, { collectionCount: 1, folderCount: 3, sourceCount: 3 });
});

test("folder title visibility remains batch-safe while Franchise tile artwork stays fixed to Poster", () => {
	const app = controller();
	const state = app.getState();
	const result = createFranchiseHierarchyPlan(state.project, { scope: "new-collection", projectRevision: state.revision, folderTitleVisibility: "HIDE_EVERYWHERE", franchises: [franchise(200, "The Hidden Collection")] });
	assert.equal(result.ok, true);
	assert.deepEqual(result.plan.collections[0].folders[0].editable, {
		title: NUVIO_INVISIBLE_TITLE,
		tileShape: "POSTER",
		hideTitle: true,
		coverImageUrl: "https://image.tmdb.org/t/p/w500/poster-200.jpg",
	});
	const unsupported = createFranchiseHierarchyPlan(state.project, { scope: "new-collection", projectRevision: state.revision, folderTileShape: "LANDSCAPE", franchises: [franchise(201, "Unsupported Landscape Collection")] });
	assert.equal(unsupported.ok, false);
	assert.equal(unsupported.errors[0].code, "INVALID_FRANCHISE_PLAN_OPTIONS");
});

test("Franchise Rows plans force the compatibility All-tab value on while Tabs keeps an explicit choice", () => {
	const app = controller();
	const state = app.getState();
	for (const [viewMode, requestedShowAllTab, expectedShowAllTab] of [
		["ROWS", false, true],
		["TABBED_GRID", false, false],
		["TABBED_GRID", true, true],
	]) {
		const result = createFranchiseHierarchyPlan(state.project, { scope: "new-collection", projectRevision: state.revision, viewMode, showAllTab: requestedShowAllTab, franchises: [franchise(210, "Layout Collection")] });
		assert.equal(result.ok, true);
		assert.equal(result.plan.configuration.showAllTab, expectedShowAllTab);
		assert.equal(result.plan.collections[0].editable.showAllTab, expectedShowAllTab);
	}
});

test("New Folder omits exact destination Collection IDs while elsewhere matches remain addable and ordered", () => {
	const app = controller();
	const destination = app.createCollection({ editable: { title: "Destination", viewMode: "ROWS", showAllTab: false, pinToTop: true } });
	const destinationFolder = app.createFolder(destination.createdInternalId, { editable: { title: "Existing" } });
	const elsewhere = app.createCollection({ editable: { title: "Elsewhere" } });
	const elsewhereFolder = app.createFolder(elsewhere.createdInternalId, { editable: { title: "Other" } });
	const first = franchise(300, "Exact Collection");
	const second = franchise(301, "Elsewhere Saga");
	assert.equal(app.createSource(destinationFolder.createdInternalId, buildMovieFranchiseSourceDraft(first).draft).ok, true);
	assert.equal(app.createSource(elsewhereFolder.createdInternalId, buildMovieFranchiseSourceDraft(second).draft).ok, true);
	const state = app.getState();
	const result = createFranchiseHierarchyPlan(state.project, { scope: "new-folder", projectRevision: state.revision, destinationCollectionInternalId: destination.createdInternalId, franchises: [first, second] });
	assert.equal(result.ok, true);
	assert.deepEqual(result.plan.outcomes.map((outcome) => outcome.status), [FRANCHISE_PLACEMENT_STATUSES.ALREADY_IN_COLLECTION, FRANCHISE_PLACEMENT_STATUSES.EXISTS_ELSEWHERE]);
	assert.deepEqual(result.plan.folders.map((folder) => folder.franchiseId), [301]);
	assert.deepEqual(result.plan.destination, { collectionInternalId: destination.createdInternalId, collectionTitle: "Destination", viewMode: "ROWS", showAllTab: false, pinToTop: true, titleHidden: false });
	assert.deepEqual(result.plan.counts, { collectionCount: 0, folderCount: 1, sourceCount: 1 });
});

test("Franchise apply creates all nodes atomically in one revision and uses ordinary controller nodes", () => {
	const app = controller();
	const before = app.getState();
	const planned = createFranchiseHierarchyPlan(before.project, { scope: "new-collection", projectRevision: before.revision, franchises: [franchise(400, "First Collection"), franchise(401, "Second Collection")] });
	const applied = applyFranchiseHierarchyPlan(app, planned.plan);
	assert.equal(applied.ok, true);
	assert.equal(app.getState().revision, before.revision + 1);
	assert.equal(app.getState().project.collections.length, 1);
	assert.deepEqual(app.getState().project.collections[0].folders.map((folder) => folder.sources.length), [1, 1]);
	assert.deepEqual(app.getState().project.collections[0].folders.map((folder) => folder.sources[0].editable.tmdbId), [400, 401]);
});

test("a late Franchise bundle failure rolls back every planned node and revision", () => {
	let calls = 0;
	const failingFactory = () => {
		calls += 1;
		if (calls === 6) throw new Error("representative later-bundle failure");
		return `failing-${calls}`;
	};
	const app = createBuilderController({ idFactory: failingFactory, nuvioIdFactory: idFactory("nuvio"), initialProjectTitle: "Rollback" });
	const before = app.getState();
	const planned = createFranchiseHierarchyPlan(before.project, { scope: "new-collection", projectRevision: before.revision, franchises: [franchise(450, "First Rollback Collection"), franchise(451, "Second Rollback Collection")] });
	assert.equal(planned.ok, true);
	const result = applyFranchiseHierarchyPlan(app, planned.plan);
	assert.equal(result.ok, false);
	assert.equal(app.getState().project, before.project);
	assert.equal(app.getState().revision, before.revision);
});

test("revalidation blocks stale exact-ID placement and leaves the project byte-identical", () => {
	const app = controller();
	const destination = app.createCollection({ editable: { title: "Destination" } });
	let state = app.getState();
	const item = franchise(500, "Changing Collection");
	const planned = createFranchiseHierarchyPlan(state.project, { scope: "new-folder", projectRevision: state.revision, destinationCollectionInternalId: destination.createdInternalId, franchises: [item] });
	assert.equal(planned.ok, true);
	const folder = app.createFolder(destination.createdInternalId, { editable: { title: "Existing" } });
	app.createSource(folder.createdInternalId, buildMovieFranchiseSourceDraft(item).draft);
	state = app.getState();
	assert.equal(validateFranchiseHierarchyPlan(planned.plan, { project: state.project, projectRevision: state.revision }).stale, true);
	const before = state.project;
	assert.equal(applyFranchiseHierarchyPlan(app, planned.plan).ok, false);
	assert.equal(app.getState().project, before);
});
