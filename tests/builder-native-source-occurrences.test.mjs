import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import test from "node:test";
import { createBuilderController } from "../builder/src/application/controller.js";
import { deepFreeze } from "../builder/src/application/state.js";
import { projectSourceSnapshot } from "../builder/src/domain/source-occurrences.js";
import { discoverSourceOccurrences } from "../builder/src/source-add/discover-source-occurrences.js";
import { nativeHierarchySourceOccurrences } from "../builder/src/source-add/native-source-occurrences.js";
import { inspectNativeHierarchyPlacement } from "../builder/src/source-add/native-source-variants.js";
import * as api from "../builder/src/source-add/index.js";
import { nativeOccurrenceFamilies, nativeOccurrenceParityCases } from "./helpers/native-occurrence-parity.mjs";

const families = nativeOccurrenceFamilies(api);
const captured = JSON.parse(fs.readFileSync(new URL("./fixtures/native-occurrence-parity.json", import.meta.url), "utf8"));
const cases = nativeOccurrenceParityCases(api, createBuilderController, deepFreeze);
assert.equal(cases.length, captured.cases.length);
for (const { name, result } of cases) {
 test("native baseline full-output parity: " + name, () => {
  const expected = captured.cases.find(x => x.name === name);
  assert.ok(expected);
  assert.equal(createHash("sha256").update(JSON.stringify(result)).digest("hex"), expected.sha256, name);
 });
}

test("3,636 Sources: lazy separate native families share one snapshot across both inspection batches and DISCOVER", () => {
 let visits = 0;
 const sourceArray = [];
 for (let i = 0; i < 3636; i++) {
  const family = families[i % families.length];
  const source = deepFreeze({ nodeType: "source", internalId: "s-" + i, ...family.build({ id: i % 20 + 1, name: "Example" }).drafts[0] });
  Object.defineProperty(sourceArray, i, { enumerable: true, get() { visits++; return source; } });
 }
 Object.freeze(sourceArray);
 const project = deepFreeze({ internalId: "p", collections: [{ internalId: "c", editable: { title: "C" }, folders: [{ internalId: "f", editable: { title: "F" }, sources: sourceArray }] }] });
 // deepFreeze itself walks the accessor array; measure only the derived work.
 visits = 0;
 const counts = families.map(() => ({ existing: 0, candidates: 0 }));
 const keys = families.map((family, index) => source => {
  counts[index][source.internalId ? "existing" : "candidates"]++;
  return family.key(source);
 });
 const inspect = (index, entityId) => inspectNativeHierarchyPlacement(project, families[index].build({ id: entityId, name: "Example" }).drafts, {
  structuralIdentity: families[index].structural, variantKey: keys[index],
 });
 discoverSourceOccurrences(project, []);
 assert.equal(visits, 3636);
 assert.deepEqual(counts.map(x => x.existing), [0, 0, 0], "DISCOVER builds no native family index");
 for (let index = 0; index < families.length; index++) {
  for (let batch = 0; batch < 2; batch++) for (let id = 1; id <= 20; id++) assert.ok(inspect(index, id));
  assert.deepEqual(counts.map(x => x.existing), families.map((_, i) => i <= index ? 3636 : 0));
  assert.equal(visits, 3636, "All families share the exact Project snapshot");
  assert.ok(counts[index].candidates > 0, "Candidate work remains separate");
 }
 const next = Object.freeze({ ...project });
 for (let index = 0; index < families.length; index++) {
  nativeHierarchySourceOccurrences(next, "1", families[index].structural, keys[index]);
  assert.equal(counts[index].existing, 7272, "B cannot reuse A's family evidence");
 }
 assert.equal(visits, 7272);
});

test("family cache identity includes both stable functions; failures never publish a partially built native index", () => {
 const family = families[0], draft = family.build().drafts[0];
 const source = id => deepFreeze({ nodeType: "source", internalId: id, ...draft });
 const shared = source("same");
 const project = deepFreeze({ collections: [{ internalId: "c", folders: [{ internalId: "f", sources: [shared, source("second")] }, { internalId: "repeat", sources: [shared] }] }] });
 let calls = 0, fail = true;
 const variant = value => { calls++; if (fail && calls === 2) throw Error("native construction failed"); return family.key(value); };
 assert.throws(() => nativeHierarchySourceOccurrences(project, "101", family.structural, variant), /native construction failed/);
 fail = false;
 const result = nativeHierarchySourceOccurrences(project, "101", family.structural, variant);
 assert.equal(calls, 4);
 assert.deepEqual(result.map(x => x.folderInternalId), ["f", "f", "repeat"]);
 assert.equal(nativeHierarchySourceOccurrences(project, "101", family.structural, variant), result);
 assert.equal(calls, 4);
 assert.throws(() => result.push({}), TypeError);
 assert.throws(() => { result[0].sourceTitle = "mutated"; }, TypeError);
 const rejectsEntity = () => null;
 assert.deepEqual(nativeHierarchySourceOccurrences(project, "101", rejectsEntity, variant), []);
 assert.equal(calls, 6, "A different structural function cannot collide with the first index");
});

for (const family of families) {
 test(family.name + " retains the effective variant versus editable structural distinction", () => {
  const draft = family.build().drafts[0];
  const source = { nodeType: "source", internalId: "s", category: "native-tmdb", editable: { ...draft.editable }, rawImported: { ...draft.editable } };
  delete source.editable.tmdbId;
  assert.notEqual(family.key(source), null);
  assert.equal(family.structural(source.editable), null);
  const project = deepFreeze({ collections: [{ internalId: "c", folders: [{ internalId: "f", sources: [source] }] }] });
  assert.equal(family.inspect(project, [draft], { destinationCollectionInternalId: "c" }).occurrences.length, 0);
 });

 test(family.name + " mutable drafts bypass reuse and native B authority preserves apply-time behavior", () => {
  const draft = family.build().drafts[0];
  const mutable = { collections: [{ internalId: "c", folders: [{ internalId: "f", sources: [{ nodeType: "source", internalId: "s", ...structuredClone(draft) }] }] }] };
  assert.equal(family.inspect(mutable, [draft], { destinationCollectionInternalId: "c" }).status, "already-in-this-collection");
  mutable.collections[0].folders[0].sources[0].editable.tmdbId = 999;
  assert.equal(family.inspect(mutable, [draft], { destinationCollectionInternalId: "c" }).status, "ready-to-create");

  const app = createBuilderController();
  assert.equal(app.importValue([{ title: "C", folders: [{ title: "F", sources: [] }] }]).ok, true);
  const a = app.getState(), c = a.project.collections[0], f = c.folders[0];
  const options = { ...family.configuration(), scope: "new-folder", destinationCollectionInternalId: c.internalId, projectRevision: a.revision };
  const planned = family.plan(a.project, options);
  assert.equal(planned.ok, true);
  const snapshot = projectSourceSnapshot(a.project);
  assert.equal(app.selectNode(c.internalId).ok, true);
  assert.equal(app.getState().project, a.project);
  assert.equal(projectSourceSnapshot(app.getState().project), snapshot);
  assert.equal(app.updateNode(f.internalId, { title: "Unrelated empty folder" }).ok, true);
  const unrelated = app.getState();
  assert.equal(family.validate(planned.plan, { project: unrelated.project, projectRevision: unrelated.revision }).ok, true, "Unrelated revisions may remain valid after rebuilding");
  assert.equal(app.createSource(f.internalId, draft).ok, true);
  const b = app.getState();
  assert.notEqual(projectSourceSnapshot(b.project), snapshot);
  assert.equal(family.inspect(b.project, [draft], { destinationCollectionInternalId: c.internalId }).status, "already-in-this-collection");
  assert.equal(family.apply(app, planned.plan).ok, false);
  assert.equal(app.getState(), b);
  const current = family.plan(b.project, { ...options, projectRevision: b.revision });
  const forged = structuredClone(current.plan);
  forged.counts.sourceCount += 1;
  assert.equal(family.apply(app, forged).ok, false);
  assert.equal(app.getState(), b);
 });

 test(family.name + " family index builds independently when queried first", () => {
  const app = createBuilderController();
  const project = app.getState().project;
  let requested = 0;
  const key = value => { requested++; return family.key(value); };
  assert.deepEqual(nativeHierarchySourceOccurrences(project, "101", family.structural, key), []);
  assert.equal(requested, 0);
  assert.equal(family.inspect(project, family.build().drafts).status, "ready-to-create");
 });
}


for (const order of [[0, 1, 2], [1, 2, 0], [2, 0, 1]]) {
 test("native family laziness in activation order " + order.join(","), () => {
  const sources = families.map((family, i) => ({ nodeType: "source", internalId: "s-" + i, ...family.build().drafts[0] }));
  const project = deepFreeze({ collections: [{ internalId: "c", folders: [{ internalId: "f", sources }] }] });
  const calls = [0, 0, 0];
  const keys = families.map((family, i) => source => { calls[i]++; return family.key(source); });
  const active = new Set();
  discoverSourceOccurrences(project, []);
  assert.deepEqual(calls, [0, 0, 0]);
  for (const i of order) {
   active.add(i);
   nativeHierarchySourceOccurrences(project, "101", families[i].structural, keys[i]);
   nativeHierarchySourceOccurrences(project, "101", families[i].structural, keys[i]);
   assert.deepEqual(calls, families.map((_, j) => active.has(j) ? 3 : 0));
  }
 });
}
