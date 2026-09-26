import assert from "node:assert/strict";
import test from "node:test";
import { createBuilderController } from "../builder/src/application/index.js";
import { buildProjectFindIndex, searchProjectFindIndex } from "../builder/src/ui/project-find.js";
import { buildBuilderViewModel } from "../builder/src/ui/view-model.js";
import { locateProjectNode } from "../builder/src/ui/hierarchy-deletion.js";
import { projectFindData } from "./fixtures/project-find-data.mjs";

function imported(value = projectFindData()) {
 let id = 0;
 const controller = createBuilderController({ idFactory: () => "private-id-" + ++id });
 assert.equal(controller.importValue(value).ok, true);
 return controller;
}
const search = (controller, query) => searchProjectFindIndex(buildProjectFindIndex(controller.getState().project), query);

test("Find indexes only hierarchy display names and retains exact parents and project order", () => {
 const controller = imported();
 const before = controller.getState();
 const index = buildProjectFindIndex(before.project);
 assert.deepEqual(index.reduce((counts, entry) => ({ ...counts, [entry.nodeType]: counts[entry.nodeType] + 1 }), { collection: 0, folder: 0, source: 0 }), { collection: 3, folder: 12, source: 60 });
 const [collection, folder, source] = index;
 assert.equal(folder.collectionInternalId, collection.internalId);
 assert.equal(source.collectionInternalId, collection.internalId);
 assert.equal(source.folderInternalId, folder.internalId);
 assert.equal(folder.displayPath, "Same collection");
 assert.equal(source.displayPath, "Same collection / Same folder");
 assert.deepEqual(index.map(entry => entry.projectOrder), index.map((_, i) => i));
 for (const query of ["private-id", "community", "localPreservation", "Untitled project", "collection-0", "Same collection / Same folder"]) assert.equal(search(controller, query).total, 0, query);
 assert.equal(controller.getState(), before);
});

test("Find trims only query, uses literal case-insensitive substring and ranks exact/prefix/substring stably", () => {
 const controller = imported([{ id: "c", title: "The Hanks", folders: [
  { id: "f1", title: "Hanks movies", sources: [{ provider: "community", title: "HANKS" }, { provider: "community", title: "Tom Hanks" }] },
  { id: "f2", title: "hanks", sources: [{ provider: "community", title: "Hanks [.*]" }] },
 ] }]);
 assert.deepEqual(search(controller, "  HaNkS ").results.map(e => e.displayTitle), ["HANKS", "hanks", "Hanks movies", "Hanks [.*]", "The Hanks", "Tom Hanks"]);
 assert.equal(search(controller, "[.*]").results[0].displayTitle, "Hanks [.*]");
 for (const query of ["", " ", " h ", "hnaks", "hankss", "no match"]) assert.equal(search(controller, query).total, 0);
 assert.equal(search(controller, " h ").ready, false);
 for (const query of ["İ", "😀"]) assert.equal(search(controller, query).ready, false);
 assert.equal(search(controller, "no match").ready, true);
});

test("Find follows visible pinned Collection order with saved Folder and Source order", () => {
 const controller = imported([{ id: "a", title: "Match ordinary", folders: [] }, { id: "b", title: "Match pinned", pinToTop: true, folders: [] }]);
 assert.deepEqual(search(controller, "match").results.map(e => e.displayTitle), ["Match pinned", "Match ordinary"]);
});

test("Find excludes hidden and invalid Collection/Folder fallback labels but retains safe descendant paths", () => {
 const controller = imported([
  { id: "hidden", title: "\u200e\u200e", folders: [{ id: "hidden-folder", title: "\u200e", sources: [{ provider: "community", title: "Visible descendant" }, { provider: "community", title: "\u200e" }] }] },
  { id: "blank", title: " ", folders: [{ id: "blank-folder", title: "\u200b", sources: [{ provider: "community", title: "Another descendant" }] }] },
 ]);
 const index = buildProjectFindIndex(controller.getState().project);
 assert.equal(index.length, 2);
 assert.equal(searchProjectFindIndex(index, "Hidden title").total, 0);
 assert.equal(searchProjectFindIndex(index, "Untitled").total, 0);
 assert.equal(index[0].displayPath, "Hidden title / Hidden title");
 assert.equal(index[1].displayPath, "Untitled collection / Untitled folder");
 assert.doesNotMatch(JSON.stringify(index), /[\u200e\u200b]/u);
});

test("Find reuses Source-card custom names and native/addon/preserved fallbacks, without metadata search", () => {
 const controller = imported([{ id: "c", title: "Parent", folders: [{ id: "f", title: "Folder", sources: [
  { provider: "tmdb", tmdbSourceType: "PERSON", tmdbId: 31, mediaType: "MOVIE" },
  { provider: "tmdb", tmdbSourceType: "LIST", tmdbId: 123, title: "My custom list" },
  { provider: "addon", addonId: "test-addon", catalogId: "Local catalogue", type: "movie" },
  { provider: "community" },
 ] }] }]);
 const folder = controller.getState().project.collections[0].folders[0];
 controller.selectNode(folder.internalId);
 const cards = buildBuilderViewModel(controller.getState()).sources;
 const indexed = buildProjectFindIndex(controller.getState().project).filter(e => e.nodeType === "source");
 assert.deepEqual(indexed.map(e => e.displayTitle), cards.map(card => card.title));
 for (const entry of indexed) assert.ok(search(controller, entry.displayTitle).results.some(e => e.internalId === entry.internalId));
 assert.equal(search(controller, "123").total, 0);
 assert.equal(search(controller, "test-addon").total, 0);
});

test("Find distinguishes identical presentations and exact-ID selection preserves project, revision and dirty state", () => {
 const controller = imported();
 const results = search(controller, "Same source").results;
 assert.equal(results.length, 24);
 const collisions = results.filter(e => e.displayPath === "Same collection / Same folder");
 assert.deepEqual(collisions.map(e => e.position), [1,2,3,4,5,6,7,8]);
 assert.ok(collisions.every(e => e.positions === 8));
 assert.equal(new Set(collisions.map(e => e.internalId)).size, 8);
 const before = controller.getState();
 for (const entry of collisions) {
  assert.equal(locateProjectNode(controller.getState().project, entry.internalId).node.internalId, entry.internalId);
  assert.equal(controller.selectNode(entry.internalId).ok, true);
  const after = controller.getState();
  assert.deepEqual(after.selection, { collectionInternalId: entry.collectionInternalId, folderInternalId: entry.folderInternalId, sourceInternalId: entry.internalId });
  assert.equal(after.project, before.project);
  assert.equal(after.revision, before.revision);
  assert.equal(after.dirty, before.dirty);
  assert.deepEqual(after.diagnostics, before.diagnostics);
 }
 assert.equal(locateProjectNode(before.project, "missing"), null);
});

test("Find caps results at 100 while counting all matches and preserving later exact-match priority", () => {
 const data = projectFindData({ collections: 20, folders: 20, sources: 10 });
 data[19].folders[19].sources[9].title = "Source";
 const controller = imported(data);
 const start = performance.now();
 const index = buildProjectFindIndex(controller.getState().project);
 const buildMs = performance.now() - start;
 const durations = [];
 for (let i = 0; i < 100; i++) {
  const begin = performance.now(); searchProjectFindIndex(index, i % 2 ? "source" : "Source 19"); durations.push(performance.now() - begin);
 }
 const result = searchProjectFindIndex(index, "source");
 assert.equal(index.length, 4420);
 assert.equal(result.total, 4000);
 assert.equal(result.results.length, 100);
 assert.equal(result.results[0].displayTitle, "Source");
 assert.equal(result.results[0].projectOrder, 4419);
 console.log("Find pure scale:", JSON.stringify({ collections: 20, folders: 400, sources: 4000, buildMs, maxSearchMs: Math.max(...durations) }));
});
