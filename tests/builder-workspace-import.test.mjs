import assert from "node:assert/strict";
import test from "node:test";
import { createBuilderController } from "../builder/src/application/controller.js";
import { reviewPastedJson, reviewJsonFile, importCollectionSnapshot, MAX_IMPORT_FILE_BYTES, projectHasImportWork } from "../builder/src/ui/import-actions.js";
import { captureNuvioCollections } from "../builder/src/nuvio-connection/collections.js";
import { importNuvioSnapshot } from "../builder/src/ui/nuvio-import-actions.js";
import { MERGE_ARTWORK_POLICIES, planCollectionMerge } from "../builder/src/import/merge-collections.js";
import { serializeNuvioProject } from "../builder/src/serialize/index.js";

const incoming = [{ id: "collection", title: "Saved", backdropImageUrl: "incoming", future: "incoming", folders: [{ id: "folder", title: "Folder", coverEmoji: "🎞️", sources: [{ provider: "tmdb", tmdbSourceType: "CUSTOM", custom: true }] }] }];
const existing = [{ ...incoming[0], backdropImageUrl: "existing", future: "existing", folders: [{ ...incoming[0].folders[0], coverEmoji: null }] }];
const text = JSON.stringify(incoming);
const file = (patch = {}) => ({ name: "Saved.JSON", type: "application/json", size: text.length, text: async () => text, ...patch });
function controller(value = existing) {
	let i = 0, n = 0;
	const c = createBuilderController({ idFactory: () => `internal-${++i}`, nuvioIdFactory: () => `nuvio-${++n}` });
	if (value) assert.equal(c.importValue(value).ok, true);
	return c;
}

test("local review shares exact parser, warnings, raw shape and no controller mutation", async () => {
	const c = controller(); const before = c.getState();
	for (const result of [reviewPastedJson(text), await reviewJsonFile(file())]) {
		assert.equal(result.ok, true);
		assert.deepEqual(result.snapshot.collections, incoming);
		assert.deepEqual(result.snapshot.counts, { collections: 1, folders: 1, sources: 1 });
		assert.equal(result.snapshot.limitedSourceCount, 1);
		assert.ok(result.snapshot.warnings.length);
		assert.ok(Object.isFrozen(result.snapshot.collections[0].folders[0].sources[0]));
		assert.equal(c.getState(), before);
	}
});

for (const [label, value, code] of [["empty", "", "IMPORT_TEXT_REQUIRED"], ["blank", " \n", "IMPORT_TEXT_REQUIRED"], ["invalid JSON", "[", "JSON_PARSE_ERROR"], ["invalid structure", '{"folders":[]}', "ROOT_NOT_ARRAY"]]) {
	test(`pasted review rejects ${label} without mutation`, () => {
		const c = controller(); const before = c.getState(); const result = reviewPastedJson(value);
		assert.equal(result.ok, false); assert.equal(result.errors[0].code, code); assert.equal(c.getState(), before);
	});
}

test("file review rejects missing, unsupported, oversized, unreadable and invalid documents before apply", async () => {
	const c = controller(); const before = c.getState(); let read = 0;
	for (const [input, code] of [
		[null, "IMPORT_FILE_REQUIRED"],
		[file({ name: "other.txt", type: "text/plain", text: async () => { read++; return text; } }), "UNSUPPORTED_IMPORT_FILE"],
		[file({ size: MAX_IMPORT_FILE_BYTES + 1, text: async () => { read++; return text; } }), "IMPORT_FILE_TOO_LARGE"],
		[file({ text: async () => { throw Error("private exception"); } }), "IMPORT_FILE_READ_FAILED"],
		[file({ text: async () => null }), "IMPORT_FILE_READ_FAILED"],
		[file({ text: async () => "[" }), "JSON_PARSE_ERROR"],
	]) {
		const result = await reviewJsonFile(input); assert.equal(result.ok, false); assert.equal(result.errors[0].code, code);
		assert.doesNotMatch(JSON.stringify(result), /private exception/); assert.equal(c.getState(), before);
	}
	assert.equal(read, 0);
	assert.equal((await reviewJsonFile(file({ size: MAX_IMPORT_FILE_BYTES }))).ok, true);
	assert.equal((await reviewJsonFile(file({ name: "anything", type: "application/json" }))).ok, true);
	assert.equal((await reviewJsonFile(file({ type: "", name: "  Saved.JSON  " }))).snapshot.projectTitle, "Saved");
});

for (const method of ["file", "json"]) for (const mode of ["add", "merge", "replace"]) test(`${method} ${mode} is reviewed, guarded and atomic`, async () => {
	const c = controller(); const before = c.getState();
	const { snapshot } = method === "file" ? await reviewJsonFile(file()) : reviewPastedJson(text);
	const options = { controller: c, snapshot, project: before.project, mode, artworkPolicy: "prefer-incoming" };
	assert.equal(c.getState(), before);
	if (mode === "replace") { assert.equal(importCollectionSnapshot(options).ok, false); assert.equal(c.getState(), before); }
	const result = importCollectionSnapshot({ ...options, replaceConfirmed: mode === "replace" });
	assert.equal(result.ok, true); assert.equal(c.getState().revision, before.revision + 1);
	const output = serializeNuvioProject(c.getState().project).value;
	if (mode === "add") { assert.equal(output.length, 2); assert.equal(output[0].backdropImageUrl, "existing"); assert.equal(output[1].backdropImageUrl, "incoming"); }
	if (mode === "merge") { assert.equal(output[0].backdropImageUrl, "incoming"); assert.equal(output[0].future, "existing"); assert.deepEqual(result.artworkCounts, { kept: 0, filled: 1, replaced: 1 }); }
	if (mode === "replace") { assert.equal(output.length, 1); assert.equal(output[0].future, "incoming"); }
});

for (const mode of ["add", "merge", "replace"]) test(`stale ${mode} is rejected; explicit new review reference can apply`, () => {
	const c = controller(); const project = c.getState().project;
	const { snapshot } = reviewPastedJson(text);
	c.updateNode(project.collections[0].internalId, { pinToTop: true }); const changed = c.getState();
	assert.equal(importCollectionSnapshot({ controller: c, snapshot, project, mode, replaceConfirmed: true }).ok, false);
	assert.equal(c.getState(), changed);
	assert.equal(importCollectionSnapshot({ controller: c, snapshot, project: changed.project, mode, replaceConfirmed: true }).ok, true);
});

test("empty workspace follows the existing collections-or-dirty has-work rule and opens without a destructive confirmation", () => {
	const c = controller(null); assert.equal(projectHasImportWork(c.getState()), false);
	assert.equal(projectHasImportWork({ ...c.getState(), dirty: true }), true);
	const { snapshot } = reviewPastedJson(text);
	assert.equal(importCollectionSnapshot({ controller: c, snapshot, project: c.getState().project, mode: "replace" }).ok, true);
	assert.equal(c.getState().dirty, false);
});

test("invalid Merge policy and late insertion ID failure commit no local state", () => {
	const c = controller(); const before = c.getState(); const { snapshot } = reviewPastedJson(text);
	assert.equal(importCollectionSnapshot({ controller: c, snapshot, project: before.project, mode: "merge", artworkPolicy: "unknown" }).ok, false);
	assert.equal(c.getState(), before);
	let i = 0;
	const broken = createBuilderController({ idFactory: () => `internal-${++i}`, nuvioIdFactory: () => "" });
	assert.equal(broken.importValue(existing).ok, true); const start = broken.getState();
	const extra = { ...incoming[0], title: "New", folders: [] };
	const reviewed = reviewPastedJson(JSON.stringify([...incoming, extra])).snapshot;
	assert.equal(importCollectionSnapshot({ controller: broken, snapshot: reviewed, project: start.project, mode: "merge", artworkPolicy: "prefer-incoming" }).ok, false);
	assert.equal(broken.getState(), start);
});

for (const artworkPolicy of MERGE_ARTWORK_POLICIES) test(`Nuvio/file/JSON review abstractions give identical complete Merge results: ${artworkPolicy}`, async () => {
	// Pure snapshot/controller contract test. No external transport is exercised.
	const remote = captureNuvioCollections([{ profile_id: 1, collections_json: incoming }], { index: 1, name: "Profile" }, 0);
	const snapshots = [remote, (await reviewJsonFile(file())).snapshot, reviewPastedJson(text).snapshot];
	const results = snapshots.map((snapshot, index) => {
		const c = controller(); const project = c.getState().project;
		const args = { controller: c, snapshot, project, mode: "merge", artworkPolicy };
		const applied = index === 0 ? importNuvioSnapshot({ ...args, connection: { getState: () => ({ snapshot }) } }) : importCollectionSnapshot(args);
		assert.equal(applied.ok, true);
		const preview = planCollectionMerge(project, snapshot.collections, { artworkPolicy });
		assert.deepEqual(c.getState().project, preview.project);
		return { project: c.getState().project, counts: applied.counts, artworkCounts: applied.artworkCounts };
	});
	assert.deepEqual(results[0], results[1]); assert.deepEqual(results[1], results[2]);
});
