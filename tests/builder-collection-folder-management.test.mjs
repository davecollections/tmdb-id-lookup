import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import { createBuilderController } from "../builder/src/application/index.js";
import { removeFolders, reorderFolders } from "../builder/src/domain/index.js";
import { applyCollectionFolderShape, collectionFolderShape, folderSortOptions, folderSortText, isPeopleFolderCollection, sortedFolderIds } from "../builder/src/ui/collection-folder-management.js";
import { createNodeEditorDraft, updateNodeEditorField } from "../builder/src/ui/node-editor.js";
import { loadFolderArtworkSuggestions, planCuratedFolderShapePatch } from "../builder/src/folder-artwork-suggestions.js";
import { buildGenreSourceDrafts } from "../builder/src/source-add/index.js";

const native = (id = 31, type = "PERSON") => ({ provider: "tmdb", tmdbSourceType: type, tmdbId: id, mediaType: "MOVIE", title: "Credits", sortBy: "popularity.desc", filters: {} });
const folder = (index, extra = {}) => ({ id: `f-${index}`, title: `Folder ${index}`, tileShape: "POSTER", sources: [native()], unknown: { index }, ...extra });
function setup(folders = Array.from({ length: 5 }, (_, i) => folder(i))) {
	let id = 0;
	const controller = createBuilderController({ idFactory: () => `management-${++id}` });
	assert.equal(controller.importValue([{ id: "c", title: "Collection", folders, keepCollection: { raw: true } }, { id: "other", title: "Other", folders: [folder("other")] }]).ok, true);
	const collection = controller.getState().project.collections[0];
	return { controller, collection, ids: collection.folders.map((f) => f.internalId) };
}
function watch(controller) {
	const before = controller.getState();
	const snapshots = [];
	const unsubscribe = controller.subscribe(() => snapshots.push(controller.getState()));
	return { before, snapshots, unsubscribe };
}

for (const [size, count] of [[5, 1], [5, 5], [70, 15], [200, 135]]) {
	test(`remove ${count} of ${size} in one revision with exact surviving subtrees`, () => {
		const { controller, collection, ids } = setup(Array.from({ length: size }, (_, i) => folder(i, {
			coverImageUrl: `https://saved.example/${i}.webp`,
			sources: [native(), { provider: "community", addonId: "addon", catalogId: `${i}`, type: "movie", extra: { i } }, { provider: "unknown", opaque: [i] }],
			catalogSources: [{ addonId: "preserve", catalogId: `${i}`, type: "movie" }],
		})));
		controller.selectNode(collection.folders.at(-1).sources[0].internalId);
		const { before, snapshots } = watch(controller);
		assert.equal(controller.removeFolders(collection.internalId, ids.slice(0, count)).ok, true);
		const after = controller.getState();
		assert.equal(after.revision, before.revision + 1);
		assert.equal(snapshots.length, 1);
		assert.equal(after.dirty, true);
		assert.equal(after.project.collections[1], before.project.collections[1]);
		assert.equal(after.project.collections[0].rawImported, collection.rawImported);
		const remaining = after.project.collections[0].folders;
		assert.equal(remaining.length, size - count);
		remaining.forEach((item, i) => assert.equal(item, collection.folders[count + i]));
		if (count < size) assert.deepEqual(after.selection, before.selection);
		else assert.deepEqual(after.selection, { collectionInternalId: collection.internalId, folderInternalId: null, sourceInternalId: null });
	});
}

test("batch removal skips all removed siblings during next/previous/parent selection recovery", () => {
	for (const [selected, removed, expected] of [[1, [1, 2, 3], 4], [4, [3, 4], 2], [2, [0, 1, 2, 3, 4], null]]) {
		const { controller, collection, ids } = setup();
		controller.selectNode(collection.folders[selected].sources[0].internalId);
		const { before, snapshots } = watch(controller);
		assert.equal(controller.removeFolders(collection.internalId, removed.map((i) => ids[i])).ok, true);
		assert.equal(controller.getState().selection.folderInternalId, expected === null ? null : ids[expected]);
		assert.equal(controller.getState().selection.sourceInternalId, null);
		assert.equal(controller.getState().revision, before.revision + 1);
		assert.equal(snapshots.length, 1);
	}
});

test("empty removal and unchanged permutation are successful zero-revision no-ops", () => {
	const { controller, collection, ids } = setup();
	const { before, snapshots } = watch(controller);
	assert.equal(controller.removeFolders(collection.internalId, []).ok, true);
	assert.equal(controller.reorderFolders(collection.internalId, ids).ok, true);
	assert.equal(controller.getState(), before);
	assert.equal(snapshots.length, 0);
});

test("empty collection permutation is valid and cannot contain another collection's folder", () => {
	const { controller, collection } = setup([]);
	const before = controller.getState();
	assert.equal(controller.reorderFolders(collection.internalId, []).ok, true);
	assert.equal(controller.getState(), before);
	assert.equal(controller.reorderFolders(collection.internalId, [before.project.collections[1].folders[0].internalId]).ok, false);
	assert.equal(controller.getState().project, before.project);
});

test("one-shot shape leaves new Folder defaults and subsequent ordinary editing independent", async () => {
	const { controller, collection } = setup();
	assert.equal((await applyCollectionFolderShape(controller, createNodeEditorDraft(collection), { project: controller.getState().project, collection }, "LANDSCAPE")).ok, true);
	assert.equal(controller.createFolder(collection.internalId, { editable: { title: "Later folder" } }).ok, true);
	const current = controller.getState().project.collections[0];
	assert.equal(current.folders.at(-1).editable.tileShape, "POSTER");
	assert.equal(controller.updateNode(current.folders[0].internalId, { tileShape: "SQUARE" }).ok, true);
	assert.equal(controller.getState().project.collections[0].folders[1].editable.tileShape, "LANDSCAPE");
	assert.equal(Object.hasOwn(current.editable, "tileShape"), false);
});

test("late invalid presentation target leaves collection and every child unchanged", async () => {
	const { controller, collection } = setup();
	const before = controller.getState();
	const failing = { ...controller, applyPresentationUpdates(updates) { return controller.applyPresentationUpdates([...updates, { nodeType: "folder", internalId: "missing", patch: { tileShape: "SQUARE" } }]); } };
	const result = await applyCollectionFolderShape(failing, updateNodeEditorField(createNodeEditorDraft(collection), "title", "Must not save"), { project: before.project, collection }, "SQUARE");
	assert.equal(result.ok, false);
	assert.equal(controller.getState().project, before.project);
	assert.equal(controller.getState().revision, before.revision);
});

test("every invalid batch, including late targets and sparse slots, rolls back completely", () => {
	for (const method of ["removeFolders", "reorderFolders"]) {
		for (const kind of ["duplicate", "missing", "cross", "source", "sparse", "nonarray", "collection", "ambiguous"]) {
			const { controller, collection, ids } = setup();
			const before = controller.getState();
			const invalid = { duplicate: [...ids, ids[0]], missing: [...ids, "missing"], cross: [...ids, before.project.collections[1].folders[0].internalId], source: [...ids, collection.folders[0].sources[0].internalId], sparse: [...ids, ...Array(1)], nonarray: {}, collection: [...ids, collection.internalId] };
			if (kind === "sparse") delete invalid.sparse[ids.length];
			if (kind === "ambiguous") {
				const project = structuredClone(before.project);
				project.collections[1].folders[0].internalId = ids.at(-1);
				assert.throws(() => (method === "removeFolders" ? removeFolders : reorderFolders)(project, collection.internalId, ids));
				assert.equal(project.collections[0].folders.length, ids.length);
				continue;
			}
			assert.equal(controller[method](collection.internalId, invalid[kind]).ok, false, `${method}: ${kind}`);
			assert.equal(controller.getState().project, before.project);
			assert.equal(controller.getState().revision, before.revision);
			assert.deepEqual(controller.getState().selection, before.selection);
		}
	}
	const { controller, collection, ids } = setup();
	assert.equal(controller.reorderFolders(collection.internalId, ids.slice(1)).ok, false);
	assert.equal(controller.removeFolders(ids[0], []).ok, false);
	assert.equal(controller.removeFolders("missing", []).ok, false);
});

test("permutation retains exact folders, selection and raw snapshots; ordinary drag remains usable", () => {
	const { controller, collection, ids } = setup();
	controller.selectNode(collection.folders[2].sources[0].internalId);
	const { before, snapshots } = watch(controller);
	assert.equal(controller.reorderFolders(collection.internalId, [...ids].reverse()).ok, true);
	controller.getState().project.collections[0].folders.forEach((f, i) => assert.equal(f, collection.folders[4 - i]));
	assert.deepEqual(controller.getState().selection, before.selection);
	assert.equal(snapshots.length, 1);
	assert.equal(controller.moveNode(ids[0], 0).ok, true);
	assert.equal(controller.getState().project.collections[0].folders[0], collection.folders[0]);
});

test("Builder comparison matches V1 name/title and last-word rules exactly", () => {
	const source = fs.readFileSync(new URL("../js/json-combiner.js", import.meta.url), "utf8");
	const names = ["stripLeadingSortArticle", "getFolderSortWords", "getFolderSortText"];
	const comparator = names.map((name) => source.match(new RegExp(`function ${name}\\([^]*?\\n\\}`))[0]).join("\n");
	const context = vm.createContext({});
	vm.runInContext(`${comparator}; this.sortText = getFolderSortText;`, context);
	for (const title of [" The Matrix ", "An Education", "A Life", "Tom Hanks", "Steven Spielberg", "Robert Downey Jr", "Bong Joon Ho", "Wong Kar-Wai", "Cher", "Björk", "Lupita Nyong'o", "!!! One: 2", "Éclair", "  AC/DC  "]) {
		for (const mode of ["az", "za", "first", "last"]) assert.equal(folderSortText(title, mode), context.sortText(title, mode === "last" ? "last" : "first"));
	}
	assert.equal(folderSortText("Robert Downey Jr", "last"), "Jr Robert Downey");
	assert.equal(folderSortText("Bong Joon Ho", "last"), "Ho Bong Joon");
});

test("title sorting is stable in both directions and keeps all unnamed values last", () => {
	const titles = ["The Zebra", "alpha", "Alpha", "\u200e", "", null, "!!!", "An Apple", "Björk"];
	const { collection, ids } = setup(titles.map((title, i) => folder(i, { title })));
	assert.deepEqual(sortedFolderIds(collection, "az"), [1, 2, 7, 8, 0, 3, 4, 5, 6].map((i) => ids[i]));
	assert.deepEqual(sortedFolderIds(collection, "za"), [0, 8, 7, 1, 2, 3, 4, 5, 6].map((i) => ids[i]));
	assert.deepEqual(sortedFolderIds(collection, "first"), sortedFolderIds(collection, "az"));
	assert.deepEqual(collection.folders.map((f) => f.editable.title), titles);
});

test("People eligibility depends on every supported source identity, including paired roles, never names", () => {
	const { collection } = setup([folder(0, { title: "Custom title", sources: [native(31), native("31", "DIRECTOR")] })]);
	assert.equal(isPeopleFolderCollection(collection), true);
	assert.deepEqual(folderSortOptions(collection).map((o) => o.id), ["az", "za", "first", "last"]);
	for (const alteration of [
		(c) => { c.folders = []; },
		(c) => { c.folders[0].sources = []; },
		(c) => { c.folders[0].sources[0].category = "addon"; },
		(c) => { c.folders[0].sources[0].category = "opaque"; },
		(c) => { c.folders[0].sources[0].editable.tmdbId = 32; },
		(c) => { c.folders[0].sources[0].editable.tmdbSourceType = "LIST"; },
		(c) => { c.folders[0].sources[0].editable.tmdbId = 0; },
	]) {
		const changed = structuredClone(collection);
		alteration(changed);
		assert.equal(isPeopleFolderCollection(changed), false);
		assert.deepEqual(folderSortOptions(changed).map((o) => o.id), ["az", "za"]);
		assert.throws(() => sortedFolderIds(changed, "last"));
	}
});

test("imported People eligibility accepts the preserved canonical identity representations", () => {
	for (const provider of ["tmdb", "TMDB", "TmDb"]) {
		for (const tmdbSourceType of ["PERSON", "person", "Director"]) {
			for (const mediaType of ["MOVIE", "movie", "TV", "tv"]) {
				for (const tmdbId of [31, "31", "0031"]) {
					const { controller, collection } = setup([folder(0, { catalogSources: [], sources: [{ ...native(), provider, tmdbSourceType, mediaType, tmdbId }] })]);
					const before = JSON.stringify(controller.getState());
					assert.deepEqual(folderSortOptions(collection).map(({ id }) => id), ["az", "za", "first", "last"], JSON.stringify({ provider, tmdbSourceType, mediaType, tmdbId }));
					assert.equal(JSON.stringify(controller.getState()), before, "Eligibility performs no normalization writes");
				}
			}
		}
	}
});

for (const fixture of [
	"issue-118-people-hierarchy/before-legacy-people-collection.json",
	"issue-118-people-hierarchy/after-canonical-people-collection.json",
	"issue-74-builder-add-people/builder-generated-people-sources.json",
	"issue-74-builder-add-people/results/nuvio-desktop-immediate-export.json",
]) {
	test(`imported People eligibility and export/reopen preserve existing evidence: ${fixture}`, () => {
		const value = JSON.parse(fs.readFileSync(new URL(`../manual-tests/nuvio-clients/${fixture}`, import.meta.url), "utf8"));
		const controller = createBuilderController();
		assert.equal(controller.importValue(value).ok, true);
		const collection = controller.getState().project.collections[0];
		const before = JSON.stringify(controller.getState());
		assert.equal(isPeopleFolderCollection(collection), true);
		assert.deepEqual(folderSortOptions(collection).map(({ id }) => id), ["az", "za", "first", "last"]);
		assert.equal(JSON.stringify(controller.getState()), before);
		const exported = controller.serializeProject();
		assert.equal(exported.ok, true);
		assert.deepEqual(exported.value, value, "Preserved Nuvio null/default values, artwork, sources and empty catalogSources stay exact");
		const reopened = createBuilderController();
		assert.equal(reopened.importValue(exported.value).ok, true);
		assert.equal(isPeopleFolderCollection(reopened.getState().project.collections[0]), true);
	});
}

test("People eligibility accepts Actor-only, Director-only and same-person media/role combinations", () => {
	for (const sources of [
		[native()],
		[native(31, "DIRECTOR")],
		[native(), { ...native("31"), mediaType: "tv" }],
		[native(), native("0031", "DIRECTOR")],
	]) assert.equal(isPeopleFolderCollection(setup([folder(0, { sources })]).collection), true);
});

test("imported Actors title never overrides empty, conflicting, mixed or opaque source identities", () => {
	for (const sources of [
		[], [native(31), native(32)], [native(), native(31, "LIST")],
		[native(8659010, "LIST")],
		[native(8659103, "LIST"), { provider: "trakt", title: "Popular Series", mediaType: "TV", sortBy: "popularity", traktListId: "saved-list" }],
		[native(), { provider: "addon", addonId: "saved", catalogId: "catalog", type: "movie" }],
		[native(), { ...native(), provider: "community" }],
		[{ ...native(), provider: "unknown" }], [{ ...native(), mediaType: null }],
		[native("0")], [native("31.5")], [native(Number.MAX_SAFE_INTEGER + 1)],
	]) {
		const { collection } = setup([folder(0, { title: "Actors", sources })]);
		const actors = { ...collection, editable: { ...collection.editable, title: "Actors" } };
		assert.equal(isPeopleFolderCollection(actors), false);
		assert.deepEqual(folderSortOptions(actors).map(({ id }) => id), ["az", "za"]);
	}
});

test("shape consensus recognizes uniform supported casing and leaves Mixed/absent/unsupported neutral", () => {
	for (const [values, expected] of [[["POSTER", "poster"], "POSTER"], [["SQUARE", "SQUARE"], "SQUARE"], [["LANDSCAPE"], "LANDSCAPE"], [["POSTER", "SQUARE"], null], [["POSTER", null], null], [["FOLLOW_LAYOUT"], null], [[{}], null], [[], null]]) {
		const { collection } = setup(values.map((tileShape, i) => folder(i, { tileShape })));
		assert.equal(collectionFolderShape(collection), expected);
	}
});

test("collection and child shape patches commit atomically, preserve artwork on authority failure and no-op on reapply", async () => {
	const { controller, collection } = setup([folder(0, { coverImageUrl: "https://custom.example/exact.webp", focusGifUrl: "https://custom.example/focus.gif", focusGifEnabled: false }), folder(1, { tileShape: "FOLLOW_LAYOUT" })]);
	const draft = updateNodeEditorField(createNodeEditorDraft(collection), "title", "Updated Collection");
	const { before, snapshots } = watch(controller);
	const result = await applyCollectionFolderShape(controller, draft, { project: before.project, collection }, "SQUARE", { peopleManifestClient: { async load() { throw new Error("unavailable"); } } });
	assert.equal(result.ok, true);
	assert.equal(snapshots.length, 1);
	assert.equal(controller.getState().revision, before.revision + 1);
	const updated = controller.getState().project.collections[0];
	assert.equal(updated.editable.title, "Updated Collection");
	assert.ok(updated.folders.every((f) => f.editable.tileShape === "SQUARE"));
	assert.equal(updated.folders[0].editable.coverImageUrl, collection.folders[0].editable.coverImageUrl);
	assert.equal(updated.folders[0].editable.focusGifUrl, collection.folders[0].editable.focusGifUrl);
	assert.equal(updated.folders[0].editable.focusGifEnabled, false);
	assert.equal(updated.folders[0].sources, collection.folders[0].sources);
	assert.equal(updated.folders[0].rawImported, collection.folders[0].rawImported);
	const noOp = controller.getState();
	assert.equal((await applyCollectionFolderShape(controller, createNodeEditorDraft(updated), { project: noOp.project, collection: updated }, "SQUARE")).ok, true);
	assert.equal(controller.getState(), noOp);
});

test("pending authority work revalidates project, membership and active editor before atomic apply", async () => {
	for (const change of ["edit", "remove", "reorder", "replace", "cancel"]) {
		const { controller, collection, ids } = setup();
		const session = { project: controller.getState().project, collection };
		let finish;
		let active = true;
		let loads = 0;
		const pending = applyCollectionFolderShape(controller, updateNodeEditorField(createNodeEditorDraft(collection), "title", "Stale"), session, "LANDSCAPE", { peopleManifestClient: { load() { loads += 1; return new Promise((resolve) => { finish = resolve; }); } }, isActive: () => active });
		assert.equal(loads, 1, "same authority identity shares one load");
		if (change === "edit") controller.updateNode(ids[0], { title: "Changed" });
		if (change === "remove") controller.removeFolders(collection.internalId, [ids[4]]);
		if (change === "reorder") controller.reorderFolders(collection.internalId, [...ids].reverse());
		if (change === "replace") controller.startNewProject();
		if (change === "cancel") active = false;
		const beforeCompletion = controller.getState();
		finish({ ok: false });
		assert.equal((await pending).ok, false);
		assert.equal(controller.getState(), beforeCompletion);
	}
});

test("exact Tile and Focus transitions remain independent and touch no unrelated field", () => {
	const suggestions = { curated: { coverImageUrl: { POSTER: "https://a.example/p.webp", LANDSCAPE: "https://a.example/l.webp" }, focusGifUrl: { POSTER: "https://a.example/fp.webp", LANDSCAPE: "https://a.example/fl.webp" } } };
	const editable = { tileShape: "POSTER", coverImageUrl: suggestions.curated.coverImageUrl.POSTER, focusGifUrl: suggestions.curated.focusGifUrl.POSTER, focusGifEnabled: false, heroBackdropUrl: "exact", titleLogoUrl: "exact", coverEmoji: "x", title: "Custom" };
	assert.deepEqual(planCuratedFolderShapePatch(editable, "LANDSCAPE", suggestions), { tileShape: "LANDSCAPE", coverImageUrl: suggestions.curated.coverImageUrl.LANDSCAPE, focusGifUrl: suggestions.curated.focusGifUrl.LANDSCAPE });
	assert.deepEqual(planCuratedFolderShapePatch({ ...editable, coverImageUrl: "https://custom.example/a" }, "LANDSCAPE", suggestions), { tileShape: "LANDSCAPE", focusGifUrl: suggestions.curated.focusGifUrl.LANDSCAPE });
	assert.deepEqual(planCuratedFolderShapePatch({ ...editable, focusGifUrl: "https://custom.example/a" }, "LANDSCAPE", suggestions), { tileShape: "LANDSCAPE", coverImageUrl: suggestions.curated.coverImageUrl.LANDSCAPE });
	assert.deepEqual(planCuratedFolderShapePatch(editable, "SQUARE", suggestions), { tileShape: "SQUARE" });
	assert.deepEqual(planCuratedFolderShapePatch(editable, "POSTER", suggestions), {});
});

test("export/reopened recognized Genre artwork uses published counterparts without provenance", async () => {
	const { controller, collection } = setup([folder(0, { sources: buildGenreSourceDrafts(["Action"], { sharedMediaChoice: "movies" }).drafts.map((draft) => draft.editable) })]);
	const suggestions = await loadFolderArtworkSuggestions({ folder: collection.folders[0] });
	assert.ok(suggestions?.curated.coverImageUrl.SQUARE);
	controller.updateNode(collection.folders[0].internalId, { coverImageUrl: suggestions.curated.coverImageUrl.POSTER, focusGifUrl: suggestions.curated.focusGifUrl.POSTER });
	const exported = controller.serializeProject();
	assert.equal(exported.ok, true);
	const reopened = createBuilderController();
	assert.equal(reopened.importValue(exported.value ?? exported.collections).ok, true);
	const c = reopened.getState().project.collections[0];
	assert.equal((await applyCollectionFolderShape(reopened, createNodeEditorDraft(c), { project: reopened.getState().project, collection: c }, "SQUARE")).ok, true);
	assert.equal(reopened.getState().project.collections[0].folders[0].editable.coverImageUrl, suggestions.curated.coverImageUrl.SQUARE);
});
