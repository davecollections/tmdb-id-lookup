import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { createBuilderController } from "../builder/src/application/index.js";
import { moveFolders as domainMove } from "../builder/src/domain/index.js";
import { createMoveCollectionDraft, reviewFolderMove, applyReviewedFolderMove } from "../builder/src/ui/move-folders.js";
import { updateNodeEditorField } from "../builder/src/ui/node-editor.js";
import { NEW_COLLECTION_DEFAULTS } from "../builder/src/domain/node-defaults.js";
import { projectFindData } from "./fixtures/project-find-data.mjs";
import { serializeNuvioProject } from "../builder/src/serialize/index.js";

function setup(options = {}) {
	let id = 0, nuvioId = 0;
	const controller = createBuilderController({ idFactory: () => `internal-${++id}`, nuvioIdFactory: () => `nuvio-${++nuvioId}`, ...options });
	const data = projectFindData();
	data[0].pinToTop = true; data[0].viewMode = "ROWS"; data[0].communitySettings = { keep: true };
	data[0].folders[0].coverImageUrl = "local-preservation-only";
	data[0].folders[0].communitySettings = { sentinel: [1, false, null] };
	data[0].folders[0].sources[0].id = "opaque-persisted-id";
	assert.equal(controller.importValue(data).ok, true);
	const state = controller.getState();
	const [source, destination] = state.project.collections;
	const request = { openingProject: state.project, sourceCollectionInternalId: source.internalId,
		folderInternalIds: [source.folders[0].internalId], destination: { kind: "existing", internalId: destination.internalId } };
	return { controller, state, source, destination, request };
}

for (const indexes of [[0], [3, 1], [3, 0, 2, 1]]) for (const kind of ["existing", "new"]) for (const remove of [false, true]) {
	if (remove && indexes.length !== 4) continue;
	test(`move ${indexes} to ${kind}, delete empty ${remove}: exact subtrees, order, payloads and one notification`, () => {
		const { controller, state, source, destination, request } = setup();
		const serializedBefore = serializeNuvioProject(state.project).value;
		request.folderInternalIds = indexes.map((index) => source.folders[index].internalId);
		request.deleteEmptySource = remove;
		if (kind === "new") request.destination = { kind, editable: { title: "Same collection", viewMode: "ROWS", pinToTop: true, showAllTab: false } };
		const notifications = [];
		controller.subscribe(() => notifications.push(controller.getState()));
		const result = controller.moveFolders(request);
		assert.equal(result.ok, true, JSON.stringify(result.errors));
		const after = controller.getState();
		assert.equal(after.revision, state.revision + 1); assert.equal(after.dirty, true); assert.deepEqual(notifications, [after]);
		const moved = source.folders.filter((_, index) => indexes.includes(index));
		const remaining = source.folders.filter((_, index) => !indexes.includes(index));
		const target = after.project.collections.find((entry) => entry.internalId === result.destinationCollectionInternalId);
		assert.deepEqual(target.folders, kind === "new" ? moved : [...destination.folders, ...moved]);
		for (const [i, folder] of moved.entries()) assert.equal(target.folders[target.folders.length - moved.length + i], folder);
		if (kind === "existing") {
			assert.equal(target.editable, destination.editable); assert.equal(target.rawImported, destination.rawImported);
			destination.folders.forEach((folder, i) => assert.equal(target.folders[i], folder));
		} else {
			assert.equal(target.rawImported, undefined); assert.equal(target.editable.focusGlowEnabled, true);
			assert.equal(target.editable.viewMode, "ROWS"); assert.equal(target.editable.showAllTab, false);
			assert.equal(target, after.project.collections.at(-1), "Ordinary new Collection append order");
		}
		const retained = after.project.collections.find((entry) => entry.internalId === source.internalId);
		if (remove) assert.equal(retained, undefined);
		else { assert.equal(retained.editable, source.editable); assert.equal(retained.rawImported, source.rawImported); assert.deepEqual(retained.folders, remaining); remaining.forEach((folder,i) => assert.equal(retained.folders[i],folder)); }
		assert.deepEqual(after.selection, { collectionInternalId: target.internalId, folderInternalId: moved[0].internalId, sourceInternalId: null });
		const beforePayloads = new Map(serializedBefore.flatMap((collection) => collection.folders).map((folder) => [folder.id, JSON.stringify(folder)]));
		const afterPayloads = serializeNuvioProject(after.project).value.flatMap((collection) => collection.folders);
		for (const folder of afterPayloads) assert.equal(JSON.stringify(folder), beforePayloads.get(folder.id), "Serialized Folder payload exactly preserved");
		assert.equal(state.project.collections[0], source, "Prior snapshot unchanged");
	});
}

const invalidCases = {
	empty: (r) => { r.folderInternalIds = []; },
	duplicate: (r) => { r.folderInternalIds.push(r.folderInternalIds[0]); },
	sparse: (r) => { r.folderInternalIds = new Array(2); },
	missingFolder: (r) => { r.folderInternalIds = ["missing"]; },
	crossCollection: (r, s) => { r.folderInternalIds = [s.destination.folders[0].internalId]; },
	nonFolder: (r, s) => { r.folderInternalIds = [s.source.folders[0].sources[0].internalId]; },
	sameDestination: (r) => { r.destination.internalId = r.sourceCollectionInternalId; },
	missingSource: (r) => { r.sourceCollectionInternalId = "missing"; },
	missingDestination: (r) => { r.destination.internalId = "missing"; },
	nonCollectionDestination: (r) => { r.destination.internalId = r.folderInternalIds[0]; },
	deleteNonempty: (r) => { r.deleteEmptySource = true; },
	invalidDelete: (r) => { r.deleteEmptySource = "yes"; },
	nullDelete: (r) => { r.deleteEmptySource = null; },
	noAuthority: (r) => { delete r.openingProject; },
	emptyTitle: (r) => { r.destination = { kind: "new", editable: { title: " " } }; },
	invalidLayout: (r) => { r.destination = { kind: "new", editable: { title: "New", viewMode: "invented" } }; },
	invalidBoolean: (r) => { r.destination = { kind: "new", editable: { title: "New", pinToTop: "true" } }; },
	rawInheritance: (r) => { r.destination = { kind: "new", editable: { title: "New" }, rawImported: {} }; },
	unknownSettings: (r) => { r.destination = { kind: "new", editable: { title: "New", arbitrary: 1 } }; },
};
for (const [name, change] of Object.entries(invalidCases)) test(`invalid ${name} leaves the exact state and notifications unchanged`, () => {
	const s = setup(); let notifications = 0; s.controller.subscribe(() => notifications++);
	change(s.request, s); assert.equal(s.controller.moveFolders(s.request).ok, false);
	assert.equal(s.controller.getState(), s.state); assert.equal(notifications, 0);
});

for (const mutation of ["source", "destination", "membership", "deleteDestination", "deleteFolder", "reorder", "additionalFolder"]) test(`stale ${mutation} fails closed including explicit empty-source deletion`, () => {
	const { controller, source, destination, request } = setup();
	request.folderInternalIds = source.folders.map((folder) => folder.internalId); request.deleteEmptySource = true;
	if (mutation === "source") controller.updateNode(source.internalId, { title: "Changed" });
	if (mutation === "destination") controller.updateNode(destination.internalId, { title: "Changed" });
	if (mutation === "membership" || mutation === "deleteFolder") controller.removeNode(source.folders[0].internalId);
	if (mutation === "deleteDestination") controller.removeNode(destination.internalId);
	if (mutation === "reorder") controller.reorderFolders(source.internalId, [...request.folderInternalIds].reverse());
	if (mutation === "additionalFolder") controller.createFolder(source.internalId, { editable: { title: "Added" } });
	const before = controller.getState(); assert.equal(controller.moveFolders(request).ok, false); assert.equal(controller.getState(), before);
});

test("new draft uses normal defaults, retains reversible visibility, rejects changed review authority and applies reviewed settings", () => {
	const { controller, source, state } = setup();
	let draft = createMoveCollectionDraft();
	for (const [key,value] of Object.entries(NEW_COLLECTION_DEFAULTS)) assert.equal(draft.values[key],value);
	assert.equal(draft.values.title, ""); assert.equal(draft.values.backdropImageUrl, "");
	assert.equal(reviewFolderMove({project: state.project, collection: source}, [source.folders[0].internalId], {kind:"new"}, draft).ok, false);
	draft = updateNodeEditorField(draft, "title", "Franchises");
	draft = updateNodeEditorField(draft, "hideNuvioTitle", true);
	const review = reviewFolderMove({project: state.project, collection: source}, [source.folders[0].internalId], {kind:"new"}, draft);
	assert.equal(controller.getState(), state, "Configure/review has no mutation");
	assert.equal(applyReviewedFolderMove(controller, review, updateNodeEditorField(draft, "pinToTop", true), false).ok, false);
	assert.equal(controller.getState(), state);
	assert.equal(applyReviewedFolderMove(controller, review, draft, false).ok, true);
	const target = controller.getState().project.collections.at(-1);
	assert.equal(target.editable.title, "\u200e"); assert.equal(target.folders[0], source.folders[0]);
	for (const [key,value] of Object.entries(NEW_COLLECTION_DEFAULTS)) assert.equal(target.editable[key],value);
});

for (const factory of ["internalCollision", "internalThrow", "nuvioCollision", "nuvioThrow"]) test(`${factory} is atomic`, () => {
	let armed = false; let id = 0; let collisionId;
	const s = setup({ idFactory: () => armed && factory.startsWith("internal") ? factory.endsWith("Throw") ? (()=>{throw new Error("failed");})() : collisionId : `i-${++id}`,
		nuvioIdFactory: () => factory.startsWith("nuvio") ? factory.endsWith("Throw") ? (()=>{throw new Error("failed");})() : "collection-0" : "fresh-new-nuvio-id" });
	collisionId = s.state.project.internalId;
	armed = true; s.request.destination = {kind: "new", editable: {title:"New"}};
	assert.equal(s.controller.moveFolders(s.request).ok, false); assert.equal(s.controller.getState(),s.state);
});

test("domain rejects ambiguous source/destination/folder identities without mutation", () => {
	for (const type of ["source", "destination", "folder"]) {
		const { state, source, destination, request } = setup(); const project = structuredClone(state.project);
		if (type === "source") project.collections.push(structuredClone(project.collections[0]));
		if (type === "destination") project.collections.push(structuredClone(project.collections[1]));
		if (type === "folder") project.collections[0].folders.push(structuredClone(project.collections[0].folders[0]));
		const before = structuredClone(project);
		assert.throws(() => domainMove(project, { sourceCollectionInternalId: source.internalId, folderInternalIds: request.folderInternalIds, destinationCollectionInternalId: destination.internalId }));
		assert.deepEqual(project,before);
	}
});

for (const fixture of ["valid/mixed-native-and-addon.json", "valid/opaque-community-import.json", "v2-compatibility/preservation/comprehensive-imported-profile.json"]) test(`relocation retains the complete preserved serialized contract: ${fixture}`, () => {
	const controller = createBuilderController();
	assert.equal(controller.importValue(JSON.parse(fs.readFileSync(new URL(`./fixtures/nuvio/${fixture}`, import.meta.url), "utf8"))).ok, true);
	const before = controller.getState();
	const source = before.project.collections.find((collection) => collection.folders.length);
	const output = serializeNuvioProject(before.project); assert.equal(output.ok,true);
	const expected = output.value.find((collection) => collection.id === source.editable.id).folders;
	const result = controller.moveFolders({openingProject:before.project,sourceCollectionInternalId:source.internalId,
		folderInternalIds:source.folders.map(folder=>folder.internalId),destination:{kind:"new",editable:{title:"Relocated"}}});
	assert.equal(result.ok,true);
	const after = controller.getState().project.collections.at(-1);
	source.folders.forEach((folder,i) => { assert.equal(after.folders[i],folder); assert.equal(after.folders[i].sources,folder.sources); assert.equal(after.folders[i].rawImported,folder.rawImported); });
	const exported = serializeNuvioProject(controller.getState().project); assert.equal(exported.ok,true);
	assert.equal(JSON.stringify(exported.value.find(collection=>collection.id===after.editable.id).folders),JSON.stringify(expected));
});


test("Move into a new Follow Home Layout Collection preserves both Show All choices and Folder payloads", () => {
 for (const showAllTab of [true, false]) {
  const { controller, state, source } = setup();
  let draft = createMoveCollectionDraft();
  for (const [field, value] of Object.entries({ title: "Follow destination", viewMode: "FOLLOW_LAYOUT", showAllTab })) draft = updateNodeEditorField(draft, field, value);
  const review = reviewFolderMove({ project: state.project, collection: source }, [source.folders[0].internalId], { kind: "new" }, draft);
  assert.equal(review.ok, true);
  assert.equal(controller.getState(), state);
  assert.equal(applyReviewedFolderMove(controller, review, draft, false).ok, true);
  const created = controller.getState().project.collections.at(-1);
  assert.equal(created.editable.viewMode, "FOLLOW_LAYOUT");
  assert.equal(created.editable.showAllTab, showAllTab);
  assert.equal(created.folders[0], source.folders[0]);
  assert.equal(controller.getState().revision, state.revision + 1);
 }
});
