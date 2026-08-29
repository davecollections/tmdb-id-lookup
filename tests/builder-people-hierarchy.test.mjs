import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createBuilderController } from "../builder/src/application/index.js";
import {
	addSelectedPerson,
	applyPeopleHierarchyPlan,
	applyPeopleManifestAuthority,
	buildPeopleHierarchyFolderEditable,
	buildPeopleSourceDrafts,
	createPeopleHierarchyPlan,
	createPeopleManifestClient,
	createPeopleSelectionState,
	defaultPeopleSourceCombinations,
	inspectPeopleHierarchyPlacement,
	normalizePeopleManifest,
	PEOPLE_PLACEMENT_STATUSES,
	peopleSelectionNotice,
	resolvePersonFolderArtwork,
	selectedPeople,
	toggleSelectedPerson,
	validatePeopleHierarchyPlan,
} from "../builder/src/source-add/index.js";
import { NUVIO_INVISIBLE_TITLE } from "../builder/src/nuvio/titles.js";
import {
	creationOptionById,
	creationOptionSupportsScope,
	creationOptionsForScope,
	CREATION_OPTION_IDS,
} from "../builder/src/ui/creation-options.js";
import { createNodeEditorDraft } from "../builder/src/ui/node-editor.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestFixture = JSON.parse(fs.readFileSync(path.join(rootDir, "tests/fixtures/people-manifest-v2.json"), "utf8"));

function idFactory(prefix = "node") {
	let next = 0;
	return () => `${prefix}-${++next}`;
}

function controller() {
	return createBuilderController({ idFactory: idFactory(), nuvioIdFactory: idFactory("nuvio"), initialProjectTitle: "People test" });
}

function drafts(person, combinations = ["acting-movies", "acting-series"], sortOptionId = "popular") {
	const result = buildPeopleSourceDrafts(person, { combinations, sortOptionId });
	assert.equal(result.ok, true);
	return result.drafts;
}

function planEntry(person, combinations, sortOptionId = "popular") {
	return {
		person,
		drafts: drafts(person, combinations, sortOptionId),
		folderEditable: { title: person.name, tileShape: "POSTER", coverImageUrl: "", hideTitle: false, coverEmoji: "👤" },
	};
}

test("creation family registry supports People in both hierarchy scopes and rejects unknown values", () => {
	assert.equal(creationOptionById(CREATION_OPTION_IDS.PEOPLE).label, "People");
	for (const scope of ["new-collection", "new-folder"]) {
		assert.equal(creationOptionSupportsScope(CREATION_OPTION_IDS.PEOPLE, scope), true);
		assert.deepEqual(creationOptionsForScope(scope).map((option) => option.id), ["blank", "decades", "people", "franchises", "studios", "networks", "genres", "streaming-services"]);
	}
	assert.equal(creationOptionById("future-family"), null);
	assert.equal(creationOptionSupportsScope("future-family", "new-collection"), false);
	assert.deepEqual(creationOptionsForScope("unsupported"), []);
});

test("ordered People selection has no arbitrary cap and exposes only a tunable notice threshold", () => {
	let state = createPeopleSelectionState();
	for (let id = 1; id <= 120; id += 1) state = addSelectedPerson(state, { id, name: `Person ${id}` }).state;
	assert.equal(selectedPeople(state).length, 120);
	assert.deepEqual(selectedPeople(state).slice(-3).map((person) => person.id), [118, 119, 120]);
	assert.deepEqual(peopleSelectionNotice(state), { visible: true, count: 120, threshold: 50 });
	assert.equal(addSelectedPerson(state, { id: 121, name: "Person 121" }).added, true);
});

test("People selection removal and reselection append deterministically without changing checkbox identity", () => {
	let state = createPeopleSelectionState();
	for (const entry of [{ id: 31, name: "Tom Hanks" }, { id: 40, name: "Orson Welles" }, { id: 488, name: "Steven Spielberg" }]) {
		state = toggleSelectedPerson(state, entry).state;
	}
	state = toggleSelectedPerson(state, { id: 40, name: "Orson Welles" }).state;
	assert.deepEqual(selectedPeople(state).map((entry) => entry.id), [31, 488]);
	state = toggleSelectedPerson(state, { id: 40, name: "Orson Welles" }).state;
	assert.deepEqual(selectedPeople(state).map((entry) => entry.id), [31, 488, 40]);
});

test("manifest indexes canonical numeric identity, category membership and all five required verification people", () => {
	const manifest = normalizePeopleManifest(manifestFixture);
	assert.ok(manifest);
	assert.equal(manifest.recordCount, 5);
	assert.deepEqual(manifest.byId[31].categoryMembership, ["actor"]);
	assert.deepEqual(manifest.byId[40].categoryMembership, ["actor", "director"]);
	assert.equal(manifest.byId[8559].assets.focusPoster, undefined);
	assert.equal(manifest.byId[76447].assets.focusLandscape, undefined);
	assert.equal(manifest.byId[532227].canonicalName, "Arturo Ripstein");
	const canonical = applyPeopleManifestAuthority({ id: 31, name: "Outdated Name", profilePath: "/profile.jpg" }, manifest);
	assert.equal(canonical.name, "Tom Hanks");
	assert.equal(canonical.profilePath, "/profile.jpg");
	const orson = applyPeopleManifestAuthority({ id: 40, name: "Orson Welles", knownForDepartment: "Acting", counts: { actingMovies: 2, actingSeries: 1, directingMovies: 3, directingSeries: 1 } }, manifest);
	assert.deepEqual(defaultPeopleSourceCombinations(orson), ["acting-movies", "acting-series", "directing-movies", "directing-series"]);
});

test("manifest client fetches once, shares in-flight work, caches success, and allows retry after failure", async () => {
	let calls = 0;
	const client = createPeopleManifestClient({ fetchImpl: async () => {
		calls += 1;
		return { ok: true, async json() { return manifestFixture; } };
	} });
	const [first, second] = await Promise.all([client.load(), client.load()]);
	assert.equal(first.ok, true);
	assert.equal(second.data, first.data);
	assert.equal(calls, 1);
	assert.equal((await client.load()).cached, true);
	assert.equal(calls, 1);

	let retryCalls = 0;
	const retrying = createPeopleManifestClient({ fetchImpl: async () => {
		retryCalls += 1;
		if (retryCalls === 1) throw new Error("temporary");
		return { ok: true, async json() { return manifestFixture; } };
	} });
	assert.equal((await retrying.load()).ok, false);
	assert.equal((await retrying.load()).ok, true);
	assert.equal(retryCalls, 2);
});

test("People artwork maps poster/landscape, separate hero/title logo, and only a complete focus pair", () => {
	const manifest = normalizePeopleManifest(manifestFixture);
	const tom = applyPeopleManifestAuthority({ id: 31, name: "Tom Hanks", profilePath: null }, manifest);
	const poster = resolvePersonFolderArtwork({ person: tom, manifestRecord: manifest.byId[31], tileShape: "POSTER" });
	assert.equal(poster.source, "manifest");
	assert.match(poster.folderEditable.coverImageUrl, /\/31\/poster\.webp$/);
	assert.match(poster.folderEditable.heroBackdropUrl, /\/31\/hero\.webp$/);
	assert.match(poster.folderEditable.titleLogoUrl, /\/31\/title-logo\.png$/);
	assert.match(poster.folderEditable.focusGifUrl, /\/31\/focus-poster\.webp$/);
	assert.equal(poster.folderEditable.focusGifEnabled, true);
	assert.equal(poster.assetHashes.poster.length, 64);
	const landscape = resolvePersonFolderArtwork({ person: tom, manifestRecord: manifest.byId[31], tileShape: "LANDSCAPE" });
	assert.match(landscape.folderEditable.coverImageUrl, /\/31\/landscape\.webp$/);
	assert.match(landscape.folderEditable.focusGifUrl, /\/31\/focus-landscape\.webp$/);
	for (const personId of [8559, 76447]) {
		const record = manifest.byId[personId];
		const artwork = resolvePersonFolderArtwork({ person: { id: personId, name: record.canonicalName, profilePath: null }, manifestRecord: record });
		assert.match(artwork.folderEditable.heroBackdropUrl, new RegExp(`/${personId}/hero\\.webp$`));
		assert.equal(Object.hasOwn(artwork.folderEditable, "focusGifUrl"), false);
		assert.equal(Object.hasOwn(artwork.folderEditable, "focusGifEnabled"), false);
	}
});

test("missing manifest identity uses safe existing fallback and never constructs a legacy People URL", () => {
	const tmdb = resolvePersonFolderArtwork({ person: { id: 999999, name: "Unregistered", profilePath: "/person.jpg" } });
	assert.equal(tmdb.source, "tmdb");
	assert.match(tmdb.folderEditable.coverImageUrl, /^https:\/\/image\.tmdb\.org\//);
	assert.equal(JSON.stringify(tmdb).includes("assets/collection_covers/people"), false);
	const emoji = resolvePersonFolderArtwork({ person: { id: 999998, name: "No image", profilePath: null } });
	assert.equal(emoji.source, "emoji");
	assert.equal(JSON.stringify(emoji).includes("nuvio-assets"), false);
});

test("owner-review JSON isolates the People artwork migration without changing source identity", () => {
	const evidenceDir = path.join(rootDir, "manual-tests/nuvio-clients/issue-118-people-hierarchy");
	const before = JSON.parse(fs.readFileSync(path.join(evidenceDir, "before-legacy-people-collection.json"), "utf8"));
	const after = JSON.parse(fs.readFileSync(path.join(evidenceDir, "after-canonical-people-collection.json"), "utf8"));
	const beforeFolder = before[0].folders[0];
	const afterFolder = after[0].folders[0];
	assert.deepEqual(afterFolder.sources, beforeFolder.sources);
	assert.deepEqual(afterFolder.catalogSources, beforeFolder.catalogSources);
	assert.deepEqual(
		{ title: afterFolder.title, hideTitle: afterFolder.hideTitle, tileShape: afterFolder.tileShape },
		{ title: beforeFolder.title, hideTitle: beforeFolder.hideTitle, tileShape: beforeFolder.tileShape },
	);
	assert.match(beforeFolder.coverImageUrl, /nuvio-assets\/main\/assets\/collection_covers\/people\/poster\/31\.webp/);
	assert.match(afterFolder.coverImageUrl, /nuvio-people-assets\/main\/assets\/people\/31\/poster\.webp$/);
	assert.match(afterFolder.heroBackdropUrl, /nuvio-people-assets\/main\/assets\/people\/31\/hero\.webp$/);
	assert.match(afterFolder.titleLogoUrl, /nuvio-people-assets\/main\/assets\/people\/31\/title-logo\.png$/);
	assert.match(afterFolder.focusGifUrl, /nuvio-people-assets\/main\/assets\/people\/31\/focus-poster\.webp$/);
	assert.equal(afterFolder.focusGifEnabled, true);
	assert.equal(JSON.stringify(after).includes("company"), false);
	assert.equal(JSON.stringify(after).includes("network"), false);
});

test("People New Collection plan preserves order, canonical naming, source semantics and normal presentation defaults", () => {
	const app = controller();
	const state = app.getState();
	const people = [
		planEntry({ id: 31, name: "Tom Hanks" }, ["acting-movies", "acting-series"]),
		planEntry({ id: 40, name: "Orson Welles" }, ["acting-movies", "directing-movies"]),
	];
	const result = createPeopleHierarchyPlan(state.project, { scope: "new-collection", projectRevision: state.revision, people });
	assert.equal(result.ok, true);
	assert.equal(result.plan.collections[0].editable.title, "People");
	assert.equal(result.plan.collections[0].editable.viewMode, "TABBED_GRID");
	assert.equal(result.plan.configuration.folderTitleVisibility, "HIDE_HOME_SCREEN");
	assert.deepEqual(result.plan.collections[0].folders.map((folder) => folder.personName), ["Tom Hanks", "Orson Welles"]);
	assert.deepEqual(result.plan.collections[0].folders.map((folder) => ({ title: folder.editable.title, hideTitle: folder.editable.hideTitle })), [
		{ title: "Tom Hanks", hideTitle: true },
		{ title: "Orson Welles", hideTitle: true },
	]);
	assert.deepEqual(result.plan.collections[0].folders[1].sources.map((entry) => entry.draft.editable.title), ["Movie Credits", "Directed Movies"]);
	assert.deepEqual(result.plan.counts, { collectionCount: 1, folderCount: 2, sourceCount: 4 });
});

test("People Rows plans force the compatibility All-tab value on while Tabs keeps an explicit choice", () => {
	const app = controller();
	const state = app.getState();
	const selected = planEntry({ id: 31, name: "Tom Hanks", counts: { actingMovies: 1, actingSeries: 0, directingMovies: 0, directingSeries: 0 } }, ["acting-movies"]);
	for (const [viewMode, requestedShowAllTab, expectedShowAllTab] of [
		["ROWS", false, true],
		["TABBED_GRID", false, false],
		["TABBED_GRID", true, true],
	]) {
		const result = createPeopleHierarchyPlan(state.project, { scope: "new-collection", projectRevision: state.revision, viewMode, showAllTab: requestedShowAllTab, people: [selected] });
		assert.equal(result.ok, true);
		assert.equal(result.plan.configuration.showAllTab, expectedShowAllTab);
		assert.equal(result.plan.collections[0].editable.showAllTab, expectedShowAllTab);
	}
});

test("People hierarchy applies each canonical Folder title-visibility outcome and revalidates it", () => {
	const app = controller();
	const state = app.getState();
	for (const [folderTitleVisibility, expected] of [
		["SHOW_EVERYWHERE", { title: "Tom Hanks", hideTitle: false }],
		["HIDE_HOME_SCREEN", { title: "Tom Hanks", hideTitle: true }],
		["HIDE_EVERYWHERE", { title: NUVIO_INVISIBLE_TITLE, hideTitle: true }],
	]) {
		const result = createPeopleHierarchyPlan(state.project, {
			scope: "new-collection",
			projectRevision: state.revision,
			folderTitleVisibility,
			people: [planEntry({ id: 31, name: "Tom Hanks" }, ["acting-movies"])],
		});
		assert.equal(result.ok, true, folderTitleVisibility);
		assert.equal(result.plan.configuration.folderTitleVisibility, folderTitleVisibility);
		assert.deepEqual(
			{ title: result.plan.collections[0].folders[0].editable.title, hideTitle: result.plan.collections[0].folders[0].editable.hideTitle },
			expected,
		);
		assert.equal(validatePeopleHierarchyPlan(result.plan, { project: state.project, projectRevision: state.revision }).ok, true);
	}
});

test("People folder appearance applies canonical Landscape artwork without changing a New Folder parent", () => {
	const app = controller();
	assert.equal(app.importValue([{
		id: "parent",
		title: "Existing parent",
		viewMode: "ROWS",
		showAllTab: false,
		pinToTop: true,
		focusGlowEnabled: false,
		folders: [],
	}]).ok, true);
	const manifest = normalizePeopleManifest(manifestFixture);
	const person = applyPeopleManifestAuthority({ id: 31, name: "Tom Hanks", profilePath: null }, manifest);
	const landscapeArtwork = resolvePersonFolderArtwork({ person, tileShape: "LANDSCAPE" });
	const folderEditable = buildPeopleHierarchyFolderEditable(person, landscapeArtwork, { tileShape: "LANDSCAPE" });
	const state = app.getState();
	const parent = state.project.collections[0];
	const parentBefore = JSON.stringify(parent.editable);
	const result = createPeopleHierarchyPlan(state.project, {
		scope: "new-folder",
		projectRevision: state.revision,
		destinationCollectionInternalId: parent.internalId,
		folderTitleVisibility: "HIDE_EVERYWHERE",
		people: [{ person, drafts: drafts(person, ["acting-movies"]), folderEditable }],
	});
	assert.equal(result.ok, true);
	assert.equal(result.plan.folders[0].editable.tileShape, "LANDSCAPE");
	assert.match(result.plan.folders[0].editable.coverImageUrl, /\/landscape\.webp$/);
	assert.match(result.plan.folders[0].editable.heroBackdropUrl, /\/hero\.webp$/);
	assert.match(result.plan.folders[0].editable.titleLogoUrl, /\/title-logo\.png$/);
	assert.match(result.plan.folders[0].editable.focusGifUrl, /\/focus-landscape\.webp$/);
	assert.equal(validatePeopleHierarchyPlan(result.plan, { project: state.project, projectRevision: state.revision }).ok, true);
	assert.equal(applyPeopleHierarchyPlan(app, result.plan).ok, true);
	const appliedParent = app.getState().project.collections[0];
	assert.equal(JSON.stringify(appliedParent.editable), parentBefore);
	const generatedFolder = appliedParent.folders[0];
	assert.equal(generatedFolder.editable.title, NUVIO_INVISIBLE_TITLE);
	assert.equal(generatedFolder.editable.hideTitle, true);
	for (const field of ["tileShape", "coverImageUrl", "heroBackdropUrl", "titleLogoUrl", "focusGifUrl", "focusGifEnabled"]) {
		assert.deepEqual(generatedFolder.editable[field], folderEditable[field], field);
	}
	const editDraft = createNodeEditorDraft(generatedFolder);
	assert.equal(editDraft.values.tileShape, "LANDSCAPE");
	assert.equal(editDraft.values.coverImageUrl, folderEditable.coverImageUrl);
	assert.equal(editDraft.values.heroBackdropUrl, folderEditable.heroBackdropUrl);
	assert.equal(editDraft.values.titleLogoUrl, folderEditable.titleLogoUrl);
	assert.equal(editDraft.values.focusGifUrl, folderEditable.focusGifUrl);
	assert.equal(editDraft.values.focusGifEnabled, true);
});

test("People hierarchy plans preserve the chosen shared semantic sort without changing duplicate identity", () => {
	const app = controller();
	const state = app.getState();
	const entry = planEntry({ id: 31, name: "Tom Hanks" }, ["acting-movies", "acting-series"], "recent");
	const result = createPeopleHierarchyPlan(state.project, { scope: "new-collection", projectRevision: state.revision, people: [entry] });
	assert.equal(result.ok, true);
	const plannedDrafts = result.plan.collections[0].folders[0].sources.map((source) => source.draft);
	assert.deepEqual(plannedDrafts.map((draft) => draft.editable.sortBy), ["primary_release_date.desc", "first_air_date.desc"]);
	assert.equal(validatePeopleHierarchyPlan(result.plan, { project: state.project, projectRevision: state.revision }).ok, true);
	assert.deepEqual(
		plannedDrafts.map((draft) => inspectPeopleHierarchyPlacement(state.project, [draft]).sourceOutcomes[0].identity),
		drafts({ id: 31, name: "Tom Hanks" }, ["acting-movies", "acting-series"], "popular").map((draft) => inspectPeopleHierarchyPlacement(state.project, [draft]).sourceOutcomes[0].identity),
	);
});

test("New Folder placement distinguishes complete, partial, elsewhere and ready by exact source identity", () => {
	const app = controller();
	assert.equal(app.importValue([
		{ id: "destination", title: "Destination", folders: [{ id: "existing", title: "Tom", sources: [
			{ provider: "tmdb", title: "Movie Credits", tmdbSourceType: "PERSON", tmdbId: 31, mediaType: "MOVIE", sortBy: "popularity.desc", filters: {} },
		] }] },
		{ id: "elsewhere", title: "Elsewhere", folders: [{ id: "orson", title: "Orson", sources: [
			{ provider: "tmdb", title: "Directed Movies", tmdbSourceType: "DIRECTOR", tmdbId: 40, mediaType: "MOVIE", sortBy: "popularity.desc", filters: {} },
		] }] },
	]).ok, true);
	const state = app.getState();
	const destination = state.project.collections[0];
	assert.equal(inspectPeopleHierarchyPlacement(state.project, drafts({ id: 31, name: "Tom Hanks" }, ["acting-movies"]), { destinationCollectionInternalId: destination.internalId }).status, PEOPLE_PLACEMENT_STATUSES.ALREADY_IN_COLLECTION);
	assert.equal(inspectPeopleHierarchyPlacement(state.project, drafts({ id: 31, name: "Tom Hanks" }, ["acting-movies", "acting-series"]), { destinationCollectionInternalId: destination.internalId }).status, PEOPLE_PLACEMENT_STATUSES.PARTLY_IN_COLLECTION);
	assert.equal(inspectPeopleHierarchyPlacement(state.project, drafts({ id: 31, name: "Tom Hanks" }, ["directing-series"]), { destinationCollectionInternalId: destination.internalId }).status, PEOPLE_PLACEMENT_STATUSES.PARTLY_IN_COLLECTION);
	assert.equal(inspectPeopleHierarchyPlacement(state.project, drafts({ id: 40, name: "Orson Welles" }, ["directing-movies"]), { destinationCollectionInternalId: destination.internalId }).status, PEOPLE_PLACEMENT_STATUSES.EXISTS_ELSEWHERE);
	assert.equal(inspectPeopleHierarchyPlacement(state.project, drafts({ id: 8559, name: "Kátia Lund" }, ["directing-movies"]), { destinationCollectionInternalId: destination.internalId }).status, PEOPLE_PLACEMENT_STATUSES.READY);
	const plan = createPeopleHierarchyPlan(state.project, { scope: "new-folder", projectRevision: state.revision, destinationCollectionInternalId: destination.internalId, people: [
		planEntry({ id: 31, name: "Tom Hanks" }, ["acting-movies", "acting-series"]),
		planEntry({ id: 40, name: "Orson Welles" }, ["directing-movies"]),
		planEntry({ id: 8559, name: "Kátia Lund" }, ["directing-movies"]),
	] });
	assert.equal(plan.ok, true);
	assert.deepEqual(plan.plan.outcomes.map((outcome) => outcome.status), ["partly-in-this-collection", "exists-elsewhere", "ready-to-create"]);
	assert.deepEqual(plan.plan.folders.map((folder) => folder.personId), [40, 8559]);
});

test("a 120-person hierarchy plans and applies atomically in one revision with no product ceiling", () => {
	const app = controller();
	const state = app.getState();
	const people = Array.from({ length: 120 }, (_, index) => planEntry({ id: index + 1, name: `Person ${index + 1}` }, ["acting-movies"]));
	const result = createPeopleHierarchyPlan(state.project, { scope: "new-collection", projectRevision: state.revision, people });
	assert.equal(result.ok, true);
	assert.deepEqual(result.plan.counts, { collectionCount: 1, folderCount: 120, sourceCount: 120 });
	const beforeRevision = app.getState().revision;
	const applied = applyPeopleHierarchyPlan(app, result.plan);
	assert.equal(applied.ok, true);
	assert.equal(app.getState().revision, beforeRevision + 1);
	assert.equal(app.getState().project.collections[0].folders.length, 120);
	assert.equal(app.getState().project.collections[0].folders[119].editable.title, "Person 120");
});

test("a later People bundle construction failure rolls back the whole hierarchy and advances no revision", () => {
	let calls = 0;
	const failingFactory = () => {
		calls += 1;
		if (calls === 6) throw new Error("representative later-bundle failure");
		return `failing-${calls}`;
	};
	const app = createBuilderController({ idFactory: failingFactory, nuvioIdFactory: idFactory("nuvio"), initialProjectTitle: "Rollback" });
	const state = app.getState();
	const planned = createPeopleHierarchyPlan(state.project, { scope: "new-collection", projectRevision: state.revision, people: [
		planEntry({ id: 31, name: "Tom Hanks" }, ["acting-movies"]),
		planEntry({ id: 40, name: "Orson Welles" }, ["directing-movies"]),
	] });
	assert.equal(planned.ok, true);
	const beforeProject = app.getState().project;
	const beforeRevision = app.getState().revision;
	const result = applyPeopleHierarchyPlan(app, planned.plan);
	assert.equal(result.ok, false);
	assert.equal(app.getState().project, beforeProject);
	assert.equal(app.getState().revision, beforeRevision);
	assert.equal(app.getState().project.collections.length, 0);
});

test("People plan revalidation rejects materially changed destination evidence before apply", () => {
	const app = controller();
	const created = app.createCollection({ editable: { title: "People" } });
	app.selectNode(created.createdInternalId);
	let state = app.getState();
	const entry = planEntry({ id: 31, name: "Tom Hanks" }, ["acting-movies"]);
	const planned = createPeopleHierarchyPlan(state.project, { scope: "new-folder", projectRevision: state.revision, destinationCollectionInternalId: created.createdInternalId, people: [entry] });
	assert.equal(planned.ok, true);
	assert.equal(planned.plan.counts.folderCount, 1);
	assert.equal(app.createFolderWithSources(created.createdInternalId, { folder: { editable: { title: "Existing" } }, sources: entry.drafts }).ok, true);
	state = app.getState();
	const validation = validatePeopleHierarchyPlan(planned.plan, { project: state.project, projectRevision: state.revision });
	assert.equal(validation.ok, false);
	assert.equal(validation.stale, true);
	const before = state.project;
	assert.equal(applyPeopleHierarchyPlan(app, planned.plan).ok, false);
	assert.equal(app.getState().project, before);
});
