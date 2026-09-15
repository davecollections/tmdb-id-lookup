import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { createBuilderController } from "../builder/src/application/index.js";
import {
	buildPeopleSourceDrafts, buildPeopleTitlePreview, buildStudioSourceDrafts, buildNetworkSourceDrafts,
	peopleSourceIdentity, studioSourceIdentity, networkSourceIdentity,
	peopleSourceVariantKey, studioSourceVariantKey, networkSourceVariantKey,
	createPeopleSourceBundle, createStudioSourceBundle, createNetworkSource,
	peopleDuplicateOverrideIdentity, studioDuplicateOverrideIdentity, networkDuplicateOverrideIdentity,
	createPeopleHierarchyPlan, createStudioHierarchyPlan, createNetworkHierarchyPlan,
	applyPeopleHierarchyPlan, applyStudioHierarchyPlan, applyNetworkHierarchyPlan,
	normalizePersonCombinedCredits, PEOPLE_SOURCE_COMBINATIONS,
	STUDIO_HIERARCHY_MEDIA_MODES, GENRE_MEDIA_CHOICES, STREAMING_MEDIA_CHOICES, DECADES_MEDIA_MODES,
} from "../builder/src/source-add/index.js";
import { createSourceEditSession, saveSourceEdit, updateSourceEditTitle, updatePeopleSourceSort, updateStudioSourceSort, updateNetworkSourceSort } from "../builder/src/source-edit/index.js";
import { sourcePreviewVariantKey, resolveSourcePreviewDraft, sourcePreviewVariantGroups, sourceTitlePreviewRequest, requestSourceTitlePreview } from "../builder/src/source-add/source-title-preview.js";
import { desktopExpandedSource } from "./fixtures/nuvio-desktop-round-trip.mjs";
import { reconcileNativeFolderDestinations } from "../builder/src/source-add/native-source-variants.js";

const sortIds = ["popular", "recent", "top-rated", "most-votes"];
const labels = ["Popular", "Recent", "Top rated", "Most voted"];

test("three-choice creation media controls retain enums and consistent labels", () => {
	for (const options of [STUDIO_HIERARCHY_MEDIA_MODES, GENRE_MEDIA_CHOICES, STREAMING_MEDIA_CHOICES, DECADES_MEDIA_MODES]) {
		assert.deepEqual(options.map(({ id, label }) => [id, label]), [["movies", "Movies"], ["series", "Series"], ["both", "Both"]]);
	}
	assert.ok(STUDIO_HIERARCHY_MEDIA_MODES.every((option) => !option.description.includes("one ")));
	assert.ok(STUDIO_HIERARCHY_MEDIA_MODES.every((option) => option.description.includes("sources in every Studio folder")));
	const catalogue = fs.readFileSync(new URL("../builder/src/ui/GenreCatalogueSelector.jsx", import.meta.url), "utf8");
	assert.match(catalogue, /concept.shared \? "Movies \+ Series"/);
});

test("sanitized owner example retains all native Most voted roles and Popular siblings across Builder round trips", () => {
	const value = JSON.parse(fs.readFileSync(new URL("../manual-tests/native-source-variants/people-most-voted.json", import.meta.url), "utf8"));
	const app = createBuilderController();
	assert.equal(app.importValue(value).ok, true);
	const exported = app.stringifyProject();
	assert.equal(exported.ok, true);
	const sources = JSON.parse(exported.json)[0].folders[0].sources;
	assert.deepEqual(sources, value[0].folders[0].sources);
	assert.deepEqual(sources.filter((source) => source.sortBy === "vote_count.desc").map((source) => [source.tmdbSourceType, source.mediaType]), [["PERSON", "MOVIE"], ["PERSON", "TV"], ["DIRECTOR", "MOVIE"], ["DIRECTOR", "TV"]]);
	const again = createBuilderController();
	assert.equal(again.importValue(JSON.parse(exported.json)).ok, true);
	assert.equal(again.stringifyProject().json, exported.json);
});
const people = { id: 31, name: "Tom Hanks" };
const studio = { id: 3, name: "Pixar" };
const network = { id: 2, name: "ABC" };
const combinations = PEOPLE_SOURCE_COMBINATIONS.map((entry) => entry.id);
const families = [
	{ name: "People", entity: people, field: "person", slots: 4, build: (options) => buildPeopleSourceDrafts(people, { combinations, ...options }), key: peopleSourceVariantKey, identity: peopleSourceIdentity, create: createPeopleSourceBundle, override: peopleDuplicateOverrideIdentity, edit: updatePeopleSourceSort },
	{ name: "Studio", entity: studio, field: "studio", slots: 2, build: (options) => buildStudioSourceDrafts(studio, { choices: ["studio-movies", "studio-series"], ...options }), key: studioSourceVariantKey, identity: studioSourceIdentity, create: createStudioSourceBundle, override: studioDuplicateOverrideIdentity, edit: updateStudioSourceSort },
	{ name: "Network", entity: network, field: "network", slots: 1, build: (options) => buildNetworkSourceDrafts(network, options), key: networkSourceVariantKey, identity: networkSourceIdentity, create: createNetworkSource, override: networkDuplicateOverrideIdentity, edit: updateNetworkSourceSort },
];

function refinementConfig(family, entities, sorts) {
	if (family.name === "People") return { people: entities.map((person) => ({ person, drafts: buildPeopleSourceDrafts(person, { combinations, sortOptionIds: sorts }).drafts, folderEditable: { title: person.name, tileShape: "POSTER" } })) };
	if (family.name === "Studio") return { mediaMode: "both", sortOptionIds: sorts, studios: entities.map((studio) => ({ studio, artwork: { studioId: studio.id, tileShape: "LANDSCAPE", source: "emoji", folderEditable: { coverImageUrl: "", coverEmoji: "🎬" } } })) };
	return { sortOptionIds: sorts, networks: entities.map((network) => ({ network, artwork: { networkId: network.id, orientation: "POSTER", tileShape: "POSTER", source: "emoji", folderEditable: { coverImageUrl: "", coverEmoji: "📺" } } })) };
}

function planFunctions(family) {
	return family.name === "People" ? [createPeopleHierarchyPlan, applyPeopleHierarchyPlan] : family.name === "Studio" ? [createStudioHierarchyPlan, applyStudioHierarchyPlan] : [createNetworkHierarchyPlan, applyNetworkHierarchyPlan];
}

function importedFolder(id, sources) {
	return { id, title: "Renamed " + id, hideTitle: true, tileShape: "POSTER", future: { keep: [0, null, false] }, sources: sources.map((draft, index) => ({ ...draft.editable, id: id + "-source-" + index, title: "Custom title " + index, addonId: null })), catalogSources: [] };
}

for (const baseFamily of families) for (const minimum of baseFamily.name === "People" ? [undefined] : [undefined, 0, 100]) {
 const filters = minimum === undefined ? {} : { voteCountGte: minimum };
 const family = { ...baseFamily, build: (options) => baseFamily.build({ ...options, filters }) };
	for (const complete of [false, true]) test(family.name + " minimum " + minimum + " reuses one imported folder for missing Sources and leaves full selections unchanged", () => {
		const app = createBuilderController(), [create, apply] = planFunctions(family);
		const drafts = family.build({ sortOptionIds: sortIds }).drafts;
		app.importValue([{ id: "collection", title: "Destination", future: { preserved: true }, folders: [importedFolder("original", complete ? drafts : drafts.slice(0, 1))] }]);
		const state = app.getState(), collection = state.project.collections[0], original = collection.folders[0];
		const options = { ...(family.name === "People" ? {} : { filters }), ...refinementConfig(family, [family.entity], sortIds), scope: "new-folder", destinationCollectionInternalId: collection.internalId, projectRevision: state.revision };
		const result = create(state.project, options);
		assert.equal(result.ok, true, JSON.stringify(result.errors));
		assert.equal(result.plan.folders.length, 0);
		assert.equal(result.plan.counts.existing, complete ? drafts.length : 1);
		assert.equal(result.plan.counts.sourceCount, complete ? 0 : drafts.length - 1);
		assert.equal(result.plan.counts.unresolvedEntityCount, 0);
		assert.equal(result.plan.outcomes[0].kind, complete ? "complete" : "append");
		assert.equal(apply(app, result.plan).ok, !complete);
		const after = app.getState();
		assert.equal(after.revision, state.revision + (complete ? 0 : 1));
		assert.equal(after.project.collections[0].folders.length, 1);
		const updated = after.project.collections[0].folders[0];
		assert.deepEqual(updated.editable, original.editable);
		assert.deepEqual(updated.rawImported, original.rawImported);
		assert.deepEqual(updated.sources.slice(0, original.sources.length), original.sources);
		assert.deepEqual(updated.sources.slice(original.sources.length).map((source) => family.key(source)), complete ? [] : drafts.slice(1).map(family.key));
		const serialized = JSON.parse(app.stringifyProject().json)[0];
		assert.equal(serialized.folders[0].id, "original");
		assert.deepEqual(serialized.future, { preserved: true });
		assert.equal(new Set(updated.sources.map((source) => source.internalId)).size, updated.sources.length);
	});

	test(family.name + " minimum " + minimum + " resolves split matches inline, deduplicates across the collection and applies a mixed batch atomically", () => {
		const app = createBuilderController(), [create, apply] = planFunctions(family);
		const drafts = family.build({ sortOptionIds: sortIds }).drafts;
		app.importValue([{ id: "collection", title: "Destination", folders: [importedFolder("first", drafts.slice(0, 1)), importedFolder("second", drafts.slice(1, 2))] }]);
		const before = app.getState(), collection = before.project.collections[0];
		const entities = [family.entity, { ...family.entity, id: family.entity.id + 100, name: "Another entity" }];
		const options = { ...(family.name === "People" ? {} : { filters }), ...refinementConfig(family, entities, sortIds), scope: "new-folder", destinationCollectionInternalId: collection.internalId, projectRevision: before.revision };
		const unresolved = create(before.project, options);
		assert.equal(unresolved.ok, true);
		assert.equal(unresolved.plan.counts.unresolvedEntityCount, 1);
		assert.equal(unresolved.plan.counts.folderCount, 1);
		assert.equal(apply(app, unresolved.plan).ok, false);
		assert.equal(app.getState().project, before.project);
		const folderDestinations = { [family.entity.id]: collection.folders[1].internalId };
		const resolved = create(before.project, { ...options, folderDestinations });
		assert.equal(resolved.ok, true, JSON.stringify(resolved.errors));
		assert.equal(resolved.plan.counts.existing, 2);
		assert.equal(resolved.plan.counts.sourceCount, drafts.length * 2 - 2);
		assert.equal(resolved.plan.existingFolderAdditions.length, 1);
		assert.deepEqual(resolved.plan.existingFolderAdditions[0].sources.map(({ draft }) => family.key(draft)), drafts.slice(2).map(family.key));
		assert.equal(create(before.project, { ...options, folderDestinations: { [family.entity.id]: "invalid" } }).ok, false);
		assert.equal(apply(app, { ...resolved.plan, existingFolderAdditions: [] }).ok, false);
		assert.equal(apply(app, resolved.plan).ok, true);
		const after = app.getState(), folders = after.project.collections[0].folders;
		assert.equal(after.revision, before.revision + 1);
		assert.deepEqual(folders[0], collection.folders[0]);
		assert.deepEqual(folders[1].editable, collection.folders[1].editable);
		assert.deepEqual(folders[1].rawImported, collection.folders[1].rawImported);
		assert.deepEqual(folders[1].sources[0], collection.folders[1].sources[0]);
		assert.equal(folders.length, 3);
		assert.equal(new Set(folders.map((folder) => folder.editable.id)).size, 3);
		assert.equal(apply(app, resolved.plan).ok, false);
		const remaining = create(after.project, { ...options, projectRevision: after.revision });
		assert.equal(remaining.ok, true);
		assert.equal(remaining.plan.counts.sourceCount, 0);
		assert.equal(remaining.plan.counts.unresolvedEntityCount, 0, "complete split coverage never asks for a destination");
	});

	test(family.name + " minimum " + minimum + " rolls back prepared appends when later new-folder construction fails", () => {
		let calls = 0, failAt = Infinity;
		const app = createBuilderController({ idFactory: () => { calls += 1; if (calls === failAt) throw new Error("late mixed-batch failure"); return `mixed-${calls}`; } });
		const [create, apply] = planFunctions(family), drafts = family.build({ sortOptionIds: sortIds }).drafts;
		assert.equal(app.importValue([{ id: "collection", title: "Destination", folders: [importedFolder("original", drafts.slice(0, 1))] }]).ok, true);
		const before = app.getState(), json = app.stringifyProject().json;
		const plan = create(before.project, { ...(family.name === "People" ? {} : { filters }), ...refinementConfig(family, [family.entity, { ...family.entity, id: family.entity.id + 100, name: "New entity" }], sortIds), scope: "new-folder", destinationCollectionInternalId: before.project.collections[0].internalId, projectRevision: before.revision }).plan;
		assert.equal(plan.existingFolderAdditions[0].sources.length, drafts.length - 1);
		failAt = calls + drafts.length;
		assert.equal(apply(app, plan).ok, false);
		assert.equal(calls, failAt, "failure follows all prepared append Sources");
		assert.equal(app.getState().project, before.project);
		assert.equal(app.getState().revision, before.revision);
		assert.equal(app.stringifyProject().json, json);
		failAt = Infinity;
		assert.equal(apply(app, plan).ok, true);
		assert.equal(app.getState().revision, before.revision + 1);
	});

	test(family.name + " minimum " + minimum + " keeps meaningful filters distinct and ignores opaque identity claims", () => {
		const app = createBuilderController(), [create] = planFunctions(family), draft = family.build().drafts[0];
		app.importValue([{ id: "collection", title: "Destination", folders: [importedFolder("filtered", [{ editable: { ...draft.editable, filters: { voteCountGte: 10 } } }])] }]);
		const state = app.getState(), collection = state.project.collections[0];
		const options = { ...(family.name === "People" ? {} : { filters }), ...refinementConfig(family, [family.entity], ["popular"]), scope: "new-folder", destinationCollectionInternalId: collection.internalId, projectRevision: state.revision };
		const distinct = create(state.project, options);
		assert.equal(distinct.plan.counts.existing, 0);
		assert.equal(distinct.plan.existingFolderAdditions.length, 1);
		const opaqueProject = structuredClone(state.project);
		opaqueProject.collections[0].folders[0].sources[0].category = "opaque";
		const opaque = create(opaqueProject, options);
		assert.equal(opaque.plan.existingFolderAdditions.length, 0);
		assert.equal(opaque.plan.counts.folderCount, 1);
	});
}

test("a controlled 50-person batch retains every selection and resolves only the ambiguous entry", () => {
	const app = createBuilderController();
	const entries = Array.from({ length: 50 }, (_, index) => {
		const person = { ...people, id: 1000 + index, name: "Unit person " + index };
		return { person, drafts: buildPeopleSourceDrafts(person, { combinations: ["acting-movies"], sortOptionIds: ["popular", "most-votes"] }).drafts, folderEditable: { title: person.name, tileShape: "POSTER" } };
	});
	const folders = entries.slice(0, 20).map((entry, index) => importedFolder("existing-" + index, index < 10 ? entry.drafts : entry.drafts.slice(0, 1)));
	folders.push(importedFolder("second-match", entries[10].drafts.slice(0, 1)));
	app.importValue([{ id: "collection", title: "Destination", folders }]);
	const before = app.getState(), collection = before.project.collections[0], selection = JSON.stringify(entries);
	const options = { scope: "new-folder", projectRevision: before.revision, destinationCollectionInternalId: collection.internalId, people: entries };
	const unresolved = createPeopleHierarchyPlan(before.project, options).plan;
	assert.equal(unresolved.counts.folderCount, 30);
	assert.equal(unresolved.counts.unresolvedSourceCount, 1);
	const choices = { 1010: collection.folders[20].internalId };
	const resolved = createPeopleHierarchyPlan(before.project, { ...options, folderDestinations: choices }).plan;
	assert.equal(resolved.counts.sourceCount, 70);
	assert.equal(resolved.counts.existingFolderAdditionCount, 10);
	assert.equal(resolved.counts.unchangedEntityCount, 10);
	assert.deepEqual(reconcileNativeFolderDestinations(resolved.outcomes.map((outcome) => ({ id: outcome.entityId, outcome })), choices), choices);
	assert.equal(JSON.stringify(entries), selection);
	assert.equal(applyPeopleHierarchyPlan(app, resolved).ok, true);
	const after = app.getState();
	assert.equal(after.revision, before.revision + 1);
	assert.equal(after.project.collections[0].folders.length, 51);
	assert.equal(after.project.collections[0].folders.flatMap((folder) => folder.sources).length, 101);
	for (const [index, folder] of collection.folders.entries()) {
		const updated = after.project.collections[0].folders[index];
		assert.deepEqual(updated.editable, folder.editable);
		assert.deepEqual(updated.rawImported, folder.rawImported);
		assert.deepEqual(updated.sources.slice(0, folder.sources.length), folder.sources);
	}
});

function destination(app) {
	const collectionId = app.createCollection({ editable: { title: "Destination" } }).createdInternalId;
	const folderId = app.createFolder(collectionId, { editable: { title: "Existing" } }).createdInternalId;
	app.selectNode(folderId);
	return { collectionId, folderId };
}

for (const family of families) {
	test(family.name + " expands canonical variants, retains singleton names and rejects empty/invalid selection", () => {
		const all = family.build({ sortOptionIds: [...sortIds].reverse() });
		assert.equal(all.ok, true, JSON.stringify(all.errors));
		assert.equal(all.drafts.length, family.slots * 4);
		assert.equal(new Set(all.drafts.map(family.key)).size, family.slots * 4);
		assert.equal(new Set(all.drafts.map((draft) => family.identity(draft.editable))).size, family.slots);
		const bases = family.build().drafts.map((draft) => draft.editable.title);
		assert.deepEqual(all.drafts.map((draft) => draft.editable.title), bases.flatMap((base) => labels.map((label) => base + " - " + label)));
		for (const id of sortIds) assert.deepEqual(family.build({ sortOptionIds: [id] }), family.build({ sortOptionId: id }));
		for (const invalid of [[], null, ["invalid"], ["recent", "recent"], "recent"]) assert.equal(family.build({ sortOptionIds: invalid }).ok, false);
		assert.equal(family.build({ sortOptionIds: [] }).errors[0].message, "Choose at least one option.");
		assert.ok(all.drafts.every((draft) => draft.category === "native-tmdb" && typeof draft.editable.sortBy === "string" && draft.editable.tmdbSourceType !== "DISCOVER" && !draft.editable.title.includes("—")));
	});

	test(family.name + " comparison uses effective native values and conservatively retains unknown semantics", () => {
		const base = family.build().drafts[0];
		const imported = { ...base, rawImported: { ...desktopExpandedSource(base.editable), id: "retained-id", title: "Imported title" }, editable: { ...base.editable, provider: "TMDB", tmdbSourceType: base.editable.tmdbSourceType.toLowerCase(), mediaType: base.editable.mediaType.toLowerCase(), tmdbId: "00" + base.editable.tmdbId, filters: desktopExpandedSource(base.editable).filters } };
		const before = JSON.stringify(imported);
		assert.equal(family.key(imported), family.key(base));
		assert.equal(JSON.stringify(imported), before);
		for (const sortBy of ["", null]) assert.equal(family.key({ ...base, editable: { ...base.editable, sortBy } }), family.key(base));
		const withoutSort = structuredClone(base); delete withoutSort.editable.sortBy;
		assert.equal(family.key(withoutSort), family.key(base));
		assert.notEqual(family.key({ ...base, editable: { ...base.editable, sortBy: "unknown.desc" } }), family.key(base));
		assert.notEqual(family.key({ ...base, editable: { ...base.editable, filters: { voteCountGte: 0 } } }), family.key(base));
		for (const filters of [{ future: null }, { future: false }]) assert.notEqual(family.key({ ...base, rawImported: { filters } }), family.key(base));
		assert.notEqual(family.key({ ...base, rawImported: { future: { enabled: true } } }), family.key(base));
		assert.equal(family.key({ ...base, category: "opaque" }), null);
		assert.equal(family.key({ ...base, editable: { ...base.editable, filters: null } }), null);
		const recent = family.build({ sortOptionId: "recent" }).drafts[0];
		assert.equal(family.key({ ...recent, rawImported: base.editable }), family.key(recent));
		if (family.name !== "People") assert.equal(family.key({ ...recent, editable: { ...recent.editable, sortBy: recent.editable.mediaType === "TV" ? "primary_release_date.desc" : "first_air_date.desc" } }), family.key(recent));
	});

	test(family.name + " Add appends missing exact variants atomically and binds duplicate approval to the full set", () => {
		const app = createBuilderController(), { folderId } = destination(app);
		const drafts = family.build({ sortOptionIds: ["recent", "popular"] }).drafts;
		app.createSource(folderId, drafts[0]); app.selectNode(folderId);
		const before = app.getState(), original = before.project.collections[0].folders[0].sources[0];
		const payload = { folderInternalId: folderId, destination: { kind: "existing-folder", folderInternalId: folderId }, [family.field]: family.entity, drafts };
		const added = family.create(app, { ...payload, duplicateOverrideIdentity: family.override(folderId, drafts.slice(0, 1)) });
		assert.equal(added.ok, true, JSON.stringify(added.errors));
		assert.equal(added.addedSourceCount, drafts.length - 1);
		assert.equal(app.getState().revision, before.revision + 1);
		assert.deepEqual(app.getState().project.collections[0].folders[0].sources[0], original);
		assert.deepEqual(added.duplicateReview.counts, { configured: drafts.length, existing: 1, omitted: 0, toAdd: drafts.length - 1 });
		assert.equal(family.create(app, payload).requiresDuplicateOverride, true);
		const override = family.override(folderId, drafts);
		assert.notEqual(override, family.override("other-folder", drafts));
		assert.notEqual(override, family.override(folderId, family.build({ sortOptionIds: ["popular", "top-rated"] }).drafts));
		const repeated = family.create(app, { ...payload, duplicateOverrideIdentity: override });
		assert.equal(repeated.ok, true);
		assert.equal(repeated.addedSourceCount, drafts.length);
		assert.equal(family.name === "People" ? repeated.usedDuplicateOverride : repeated.duplicateOverrideUsed, true);
		const serialized = JSON.parse(app.stringifyProject().json)[0].folders[0];
		assert.equal(serialized.sources.length, drafts.length * 2);
		assert.equal(serialized.catalogSources?.length ?? 0, 0);
	});

	test(family.name + " editor rejects exact collisions and preserves no-op/title-only deliberate duplicates", () => {
		const app = createBuilderController(), base = family.build().drafts[0].editable;
		const popular = { ...desktopExpandedSource(base), id: "native-source", future: { keep: [0, null, false] } };
		const recent = { ...popular, id: "sibling", title: "Sibling", sortBy: family.build({ sortOptionId: "recent" }).drafts[0].editable.sortBy };
		const load = (target, sources) => target.importValue([{ id: "collection", title: "Example", folders: [{ id: "folder", title: "Example", sources, catalogSources: [] }] }]);
		assert.equal(load(app, [popular, recent]).ok, true);
		const source = app.getState().project.collections[0].folders[0].sources[0];
		const opened = createSourceEditSession(app.getState().project, source.internalId), before = app.stringifyProject().json;
		assert.equal(saveSourceEdit(app, opened.session, family.edit(opened.draft, recent.sortBy, "recent")).duplicateRejected, true);
		assert.equal(app.stringifyProject().json, before);
		assert.equal(saveSourceEdit(app, opened.session, opened.draft).ok, true);
		assert.equal(saveSourceEdit(app, opened.session, family.edit(opened.draft, "vote_count.desc", "most-votes")).ok, true);
		const after = app.getState().project.collections[0].folders[0].sources[0];
		assert.deepEqual(after.rawImported, source.rawImported);
		assert.equal(after.internalId, source.internalId);
		assert.equal(after.editable.title, source.editable.title);
		assert.equal(JSON.parse(app.stringifyProject().json)[0].folders[0].sources[0].filters.voteCountGte, null);
		const duplicates = createBuilderController();
		load(duplicates, [popular, { ...popular, id: "deliberate" }]);
		const first = duplicates.getState().project.collections[0].folders[0].sources[0];
		const session = createSourceEditSession(duplicates.getState().project, first.internalId), snapshot = duplicates.stringifyProject().json;
		assert.equal(saveSourceEdit(duplicates, session.session, session.draft).ok, true);
		assert.equal(duplicates.stringifyProject().json, snapshot);
		assert.equal(saveSourceEdit(duplicates, session.session, updateSourceEditTitle(session.draft, "Custom title")).ok, true);
	});
}

test("native Preview retains valid axes, hides singleton selectors and keys exact sorts without mutation", () => {
	const drafts = buildPeopleSourceDrafts(people, { combinations, sortOptionIds: sortIds }).drafts, before = JSON.stringify(drafts);
	assert.equal(new Set(drafts.map(sourcePreviewVariantKey)).size, 16);
	let active = resolveSourcePreviewDraft(drafts, { role: "PERSON", mediaType: "TV", sortOptionId: "most-votes" });
	const choose = (draft) => { active = draft; };
	sourcePreviewVariantGroups(drafts, active, choose).find((group) => group.id === "role").options[1].onSelect();
	assert.deepEqual([active.editable.tmdbSourceType, active.editable.mediaType, active.editable.sortBy], ["DIRECTOR", "TV", "vote_count.desc"]);
	sourcePreviewVariantGroups(drafts, active, choose).find((group) => group.id === "media").options[0].onSelect();
	assert.deepEqual([active.editable.tmdbSourceType, active.editable.mediaType, active.editable.sortBy], ["DIRECTOR", "MOVIE", "vote_count.desc"]);
	const networks = buildNetworkSourceDrafts(network, { sortOptionIds: sortIds }).drafts;
	assert.deepEqual(sourcePreviewVariantGroups(networks, networks[0], () => {}).map((group) => group.label), ["Show"]);
	assert.deepEqual(sourcePreviewVariantGroups([drafts[0]], drafts[0], () => {}), []);
	assert.equal(JSON.stringify(drafts), before);
});

test("People Most voted is vote-first for exact roles/media, counts posterless titles and reuses loaded credits", async () => {
	const raw = { cast: [], crew: [] };
	for (const media of ["movie", "tv"]) for (let id = 1; id <= 12; id += 1) {
		const credit = { id, media_type: media, poster_path: id === 12 ? null : "/unit-" + id + ".jpg", vote_count: id, popularity: 100 - id, vote_average: 5 };
		raw.cast.push(credit); raw.crew.push({ ...credit, job: id === 1 ? "Writer" : "Director" });
	}
	const person = { ...people, combinedCredits: normalizePersonCombinedCredits(raw) };
	for (const combination of combinations) {
		const draft = buildPeopleSourceDrafts(person, { combinations: [combination], sortOptionId: "most-votes" }).drafts[0];
		const preview = await requestSourceTitlePreview(sourceTitlePreviewRequest("people", draft, { person }), { people: { getPerson() { throw new Error("Loaded credits should be reused"); } } });
		assert.equal(preview.ok, true);
		assert.equal(preview.data.totalResults, combination.startsWith("acting") ? 12 : 11);
		assert.equal(preview.data.results.length, 10);
		assert.equal(preview.data.results[0].id, 11);
	}
	const empty = buildPeopleTitlePreview({ ...people, combinedCredits: { cast: [], crew: [] } }, { combinations: ["acting-movies"], sortOptionId: "most-votes" });
	assert.equal(empty.totalResults, 0); assert.deepEqual(empty.items, []);
});
