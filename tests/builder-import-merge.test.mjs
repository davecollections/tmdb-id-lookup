import assert from "node:assert/strict";
import test from "node:test";
import { createBuilderController } from "../builder/src/application/controller.js";
import { planCollectionMerge } from "../builder/src/import/merge-collections.js";
import { importNuvioCollections } from "../builder/src/import/index.js";
import { serializeNuvioProject } from "../builder/src/serialize/index.js";

const counter = (prefix) => { let n = 0; return () => `${prefix}-${++n}`; };
const source = (patch = {}) => ({ title: "Tom Hanks", provider: "tmdb", tmdbSourceType: "PERSON", tmdbId: 31, mediaType: "MOVIE", sortBy: "popularity.desc", filters: {}, ...patch });
const folder = (title = "Tom Hanks", sources = [source()], patch = {}) => ({ id: `folder-${title}`, title, sources, ...patch });
const collection = (title = "Actors", folders = [folder()], patch = {}) => ({ id: `collection-${title}`, title, folders, ...patch });
function controller(value = [collection()], options = {}) {
	const c = createBuilderController({ idFactory: counter("internal"), nuvioIdFactory: counter("nuvio"), ...options });
	assert.equal(c.importValue(value).ok, true);
	return c;
}
function plan(current, incoming) {
	const c = controller(current);
	const before = c.getState();
	const result = planCollectionMerge(before.project, incoming);
	assert.equal(result.ok, true, JSON.stringify(result.errors));
	assert.equal(c.getState(), before);
	return result;
}

test("exact visible names merge; preview is detached and apply uses identical counts in one revision", () => {
	const c = controller();
	c.selectNode(c.getState().project.collections[0].folders[0].sources[0].internalId);
	const before = c.getState();
	const incoming = [collection("Actors", [folder("Tom Hanks", [source(), source({ tmdbId: 32 })])])];
	const original = structuredClone(incoming);
	const preview = planCollectionMerge(before.project, incoming);
	assert.equal(c.getState(), before);
	assert.deepEqual(incoming, original);
	assert.deepEqual(preview.counts, { collectionsMerged: 1, foldersMerged: 1, duplicateSourcesSkipped: 1, collectionsAdded: 0, foldersAdded: 0, sourcesAdded: 1, idsRepaired: 0 });
	const applied = c.mergeImportedCollections(incoming);
	assert.equal(applied.ok, true);
	assert.deepEqual(applied.counts, preview.counts);
	assert.equal(c.getState().revision, before.revision + 1);
	assert.equal(c.getState().dirty, true);
	assert.deepEqual(c.getState().selection, before.selection);
	assert.deepEqual(c.getState().project.collections[0].folders[0].sources[0], before.project.collections[0].folders[0].sources[0]);
});

for (const title of ["actors", "Actor", "Actors!", "Legendary Actors", " Actors", "Actors ", "\u200e", "\u200e\u200e", "", "  ", "\u200b", null, 12, {}]) {
	test(`Collection title ${JSON.stringify(title)} stays separate without examining children`, () => {
		const result = plan([collection()], [collection(title)]);
		assert.equal(result.counts.collectionsMerged, 0);
		assert.equal(result.counts.foldersMerged, 0);
		assert.equal(result.counts.duplicateSourcesSkipped, 0);
		assert.equal(result.counts.collectionsAdded, 1);
	});
}
test("punctuation difference is not normalized", () => assert.equal(plan([collection("80s Movies")], [collection("80's Movies")]).counts.collectionsMerged, 0));
for (const title of ["\u200e", "\u200e\u200e", "", "  ", "\u200b", null, 4]) {
	test(`identical non-visible Collection titles ${JSON.stringify(title)} never merge`, () => assert.equal(plan([collection(title)], [collection(title)]).counts.collectionsMerged, 0));
}
test("an invisible current parent never matches a visible incoming parent", () => assert.equal(plan([collection("\u200e")], [collection()]).counts.foldersMerged, 0));
for (const side of ["current", "incoming"]) {
	test(`ambiguous ${side} Collection names append all incoming candidates`, () => {
		const result = plan(side === "current" ? [collection(), collection()] : [collection()], side === "incoming" ? [collection(), collection()] : [collection()]);
		assert.equal(result.counts.collectionsMerged, 0);
		assert.equal(result.counts.collectionsAdded, side === "incoming" ? 2 : 1);
	});
	test(`ambiguous ${side} Folder names remain entire separate additions`, () => {
		const result = plan([collection("Actors", side === "current" ? [folder(), folder()] : [folder()])], [collection("Actors", side === "incoming" ? [folder(), folder()] : [folder()])]);
		assert.equal(result.counts.collectionsMerged, 1);
		assert.equal(result.counts.foldersMerged, 0);
		assert.equal(result.counts.duplicateSourcesSkipped, 0);
	});
}
for (const title of ["Tom Hank", "tom hanks", "Tom Hanks!", " Tom Hanks", "\u200e", "\u200e\u200e", " ", null]) {
	test(`Folder ${JSON.stringify(title)} remains separate`, () => {
		const result = plan([collection()], [collection("Actors", [folder(title)])]);
		assert.equal(result.counts.foldersMerged, 0);
		assert.equal(result.counts.duplicateSourcesSkipped, 0);
		assert.equal(result.counts.foldersAdded, 1);
	});
}
test("identical invisible Folder names never merge; home-only title hiding remains eligible", () => {
	assert.equal(plan([collection("Actors", [folder("\u200e")])], [collection("Actors", [folder("\u200e")])]).counts.foldersMerged, 0);
	assert.equal(plan([collection("Actors", [folder("Tom Hanks", [], { hideTitle: true })], { hideTitle: true })], [collection()]).counts.foldersMerged, 1);
});

test("existing settings/raw data win, inserted settings/raw survive, and every level retains order", () => {
	const c = controller([collection("First", []), collection("Actors", [folder("First", []), folder("Tom Hanks", [source()], { coverImageUrl: "current", future: { folder: 1 } })], { pinToTop: true, future: { collection: 1 } })]);
	const before = c.getState().project;
	const newFolder = folder("New folder", [source({ tmdbId: 90 })], { future: { retain: [1, 2] } });
	const newCollection = collection("Last", [], { future: { keep: true } });
	assert.equal(c.mergeImportedCollections([collection("Actors", [folder("Tom Hanks", [source(), source({ tmdbId: 70 }), source({ tmdbId: 80 })], { coverImageUrl: "incoming", future: 2 }), newFolder], { pinToTop: false, future: 2 }), newCollection]).ok, true);
	const result = c.getState().project;
	assert.deepEqual(result.collections.map((n) => n.editable.title), ["First", "Actors", "Last"]);
	assert.deepEqual(result.collections[1].editable, before.collections[1].editable);
	assert.deepEqual(result.collections[1].rawImported, before.collections[1].rawImported);
	assert.deepEqual(result.collections[1].folders.map((n) => n.editable.title), ["First", "Tom Hanks", "New folder"]);
	assert.deepEqual(result.collections[1].folders[1].editable, before.collections[1].folders[1].editable);
	assert.deepEqual(result.collections[1].folders[1].rawImported, before.collections[1].folders[1].rawImported);
	assert.deepEqual(result.collections[1].folders[1].sources.map((n) => n.editable.tmdbId), [31, 70, 80]);
	assert.deepEqual(result.collections[1].folders[2].rawImported, newFolder);
	assert.deepEqual(result.collections[2].rawImported, newCollection);
	assert.equal(serializeNuvioProject(result).ok, true);
});
for (const patch of [{ title: "Thomas Hanks" }, { tmdbId: 32 }, { sortBy: "vote_average.desc" }, { mediaType: "TV" }, { filters: { voteCountGte: 10 } }, { future: 1 }, { filters: { future: [1, 2] } }, { provider: "community" }]) {
	test(`Source difference ${JSON.stringify(patch)} preserves both`, () => {
		const result = plan([collection()], [collection("Actors", [folder("Tom Hanks", [source(patch)])])]);
		assert.equal(result.counts.duplicateSourcesSkipped, 0);
		assert.equal(result.counts.sourcesAdded, 1);
	});
}
test("exact supported preservation fields compare without depending on JSON property order", () => {
	const a = source({ future: { a: 1, b: 2 } });
	const b = source({ future: { b: 2, a: 1 } });
	assert.equal(plan([collection("Actors", [folder("Tom Hanks", [a])])], [collection("Actors", [folder("Tom Hanks", [b])])]).counts.duplicateSourcesSkipped, 1);
});
test("opaque/unsupported Sources require complete preserved equality; malformed native Sources stay separate", () => {
	for (const a of [{ provider: "community", title: "Same", config: { a: 1 } }, { provider: "tmdb", tmdbSourceType: "CUSTOM", title: "Same", config: { a: 1 } }]) {
		assert.equal(plan([collection("Actors", [folder("Tom Hanks", [a])])], [collection("Actors", [folder("Tom Hanks", [{ ...a, config: { a: 2 } }])])]).counts.sourcesAdded, 1);
		assert.equal(plan([collection("Actors", [folder("Tom Hanks", [a])])], [collection("Actors", [folder("Tom Hanks", [a])])]).counts.duplicateSourcesSkipped, 1);
	}
	const malformed = source({ filters: [] });
	assert.equal(plan([collection("Actors", [folder("Tom Hanks", [malformed])])], [collection("Actors", [folder("Tom Hanks", [malformed])])]).counts.sourcesAdded, 1);
});
test("dedupe is confined to matched Folders; incoming order and repeated exact Sources are stable", () => {
	const result = plan([collection()], [collection("Actors", [folder("Tom Hanks", [source(), source({ tmdbId: 32 }), source({ tmdbId: 32 })]), folder("Other", [source(), source()])]), collection("Other", [folder()])]);
	assert.equal(result.counts.duplicateSourcesSkipped, 2);
	assert.equal(result.counts.sourcesAdded, 4);
});
test("ID repair only touches inserted nodes, reserves all current IDs, and previews its repair count", () => {
	const c = controller();
	const before = c.getState().project;
	const incoming = [collection("Actors", [folder("Tom Hanks", [source()]), folder("New", [], { id: "collection-Actors" })]), collection("New", [folder("New", [], { id: "folder-Tom Hanks" })], { id: "collection-Actors" })];
	const preview = planCollectionMerge(before, incoming);
	const result = c.mergeImportedCollections(incoming);
	assert.equal(result.ok, true);
	assert.equal(result.counts.idsRepaired, 3);
	assert.deepEqual(result.counts, preview.counts);
	assert.equal(c.getState().project.collections[0].editable.id, before.collections[0].editable.id);
	assert.equal(c.getState().project.collections[0].folders[0].editable.id, before.collections[0].folders[0].editable.id);
	assert.equal(c.getState().project.collections[1].rawImported.id, "collection-Actors");
});
test("late ID generation failure commits no project, diagnostics, selection or revision", () => {
	let n = 0;
	const c = controller(undefined, { nuvioIdFactory: () => ++n === 1 ? "repaired" : "" });
	const before = c.getState();
	const result = c.mergeImportedCollections([collection("New", [folder()], { id: "collection-Actors" })]);
	assert.equal(result.ok, false);
	assert.equal(c.getState(), before);
});
test("complete incoming validation and late Builder ID collisions both commit nothing", () => {
	let collide = false;
	const ids = counter("internal");
	let calls = 0;
	const c = controller(undefined, { idFactory: () => collide && ++calls === 4 ? "internal-5" : ids() });
	const before = c.getState();
	assert.equal(c.mergeImportedCollections([collection("New"), { folders: false }]).ok, false);
	assert.equal(c.getState(), before);
	collide = true;
	assert.equal(c.mergeImportedCollections([collection("New")]).ok, false);
	assert.equal(c.getState(), before);
});
test("an all-duplicate successful merge still creates exactly one content revision", () => {
	const c = controller();
	c.mergeImportedCollections([collection()]);
	const before = c.getState();
	assert.equal(c.mergeImportedCollections([collection()]).ok, true);
	assert.equal(c.getState().revision, before.revision + 1);
});
test("invalid destination structure fails closed before a preview is built", () => {
	const current = importNuvioCollections([collection()]).project;
	current.collections[0].folders[0].sources[0].internalId = current.internalId;
	assert.equal(planCollectionMerge(current, [collection()]).ok, false);
});
