import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { CREATION_SCOPES, guidedCreateActionLabel, outputNoun } from "../builder/src/ui/creation-options.js";

import { creationContext, destinationContext, sourceDestinationContext } from "../builder/src/ui/creation-context.js";
import { createBuilderController } from "../builder/src/application/index.js";
import { createGenreHierarchyPlan } from "../builder/src/source-add/index.js";
import { NUVIO_INVISIBLE_TITLE } from "../builder/src/nuvio/titles.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
	return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

test("guided creation actions describe the launched result", () => {
	for (const [scope, label] of [
		[CREATION_SCOPES.NEW_COLLECTION, "Create collection"],
		[CREATION_SCOPES.NEW_FOLDER, "Create folder"],
	]) {
		assert.equal(guidedCreateActionLabel(scope), label);
	}
});

test("all eight guided families use the shared completion language", () => {
	for (const [family, relativePath, call] of [
		["Decades", "builder/src/ui/CreationDialog.jsx", "guidedCreateActionLabel(scope, planResult?.plan?.counts)"],
		["People", "builder/src/ui/PeopleSourceFlow.jsx", "guidedCreateActionLabel(hierarchyScope, hierarchyPlanResult?.plan?.counts)"],
		["Franchises", "builder/src/ui/FranchiseSourceFlow.jsx", "guidedCreateActionLabel(scope, planResult?.plan?.counts)"],
		["TMDB Lists", "builder/src/ui/TmdbListSourceFlow.jsx", "guidedCreateActionLabel(scope, planResult?.plan?.counts)"],
		["Studios", "builder/src/ui/StudioHierarchyFlow.jsx", "guidedCreateActionLabel(scope, planResult?.plan?.counts)"],
		["Networks", "builder/src/ui/NetworkHierarchyFlow.jsx", "guidedCreateActionLabel(scope, planResult?.plan?.counts)"],
		["Genres", "builder/src/ui/GenreHierarchyFlow.jsx", "guidedCreateActionLabel(scope, planResult?.plan?.counts)"],
		["Streaming", "builder/src/ui/StreamingHierarchyFlow.jsx", "guidedCreateActionLabel(activeScope, planResult?.plan?.counts)"],
	]) {
		assert.ok(read(relativePath).includes(call), `${family} lost its guided completion label`);
	}
});

test("Streaming keeps explicit labels for updated, unchanged, and duplicate outcomes", () => {
	const flow = read("builder/src/ui/StreamingHierarchyFlow.jsx");
	assert.match(flow, /changesOnlyNewFolders[\s\S]*existingFolderAdditionCount/);
	assert.match(flow, /changesOnlyNewFolders \? guidedCreateActionLabel\(activeScope, planResult\?\.plan\?\.counts\) : "Apply changes"/);
	assert.match(flow, /routedExistingNoChanges \? "Close"/);
	assert.match(flow, /"Create duplicate collection"/);
});

test("single and count-aware Add Source families use Add language", () => {
	for (const [family, relativePath, label] of [
		["Movie franchise", "builder/src/ui/AddSourceDialog.jsx", '"Add 1 source"'],
		["People", "builder/src/ui/PeopleSourceFlow.jsx", '`Add ${primaryCount} source${primaryCount === 1 ? "" : "s"}`'],
		["Network", "builder/src/ui/NetworkSourceFlow.jsx", '`Add ${primaryCount} source${primaryCount === 1 ? "" : "s"}`'],
		["Decade", "builder/src/ui/DecadeSourceFlow.jsx", '`Add ${saveCount} sources`'],
	]) {
		assert.ok(read(relativePath).includes(label), `${family} lost its Add Source label`);
	}
});


test("creation actions use plan counts, including newly created rather than touched folders", () => {
 for (const noun of ["Collection", "Folder", "Source"]) {
  assert.equal(outputNoun(1, noun), noun);
  assert.equal(outputNoun(2, noun), noun + "s");
 }
 for (const count of [1, 2, 12]) {
  assert.equal(guidedCreateActionLabel("new-collection", { collectionCount: count }), count === 1 ? "Create collection" : `Create ${count} collections`);
  assert.equal(guidedCreateActionLabel("new-folder", { folderCount: count }), count === 1 ? "Create folder" : `Create ${count} folders`);
 }
 assert.equal(guidedCreateActionLabel("new-folder", { folderCount: 5, newFolderCount: 1 }), "Create folder");
 assert.equal(guidedCreateActionLabel("new-folder", { folderCount: 5, newFolderCount: 2 }), "Create 2 folders");
 assert.equal(guidedCreateActionLabel("new-collection", null), "Create collection");
});

test("one Genre can produce one or two Collections according to the actual structure plan", () => {
 const state = createBuilderController().getState();
 for (const [structure, expected] of [["genre-folders", 1], ["separate-media-collections", 2]]) {
  const result = createGenreHierarchyPlan(state.project, { scope: "new-collection", projectRevision: state.revision, genres: ["Comedy"], structure });
  assert.equal(result.ok, true);
  assert.equal(result.plan.counts.collectionCount, expected);
  assert.equal(guidedCreateActionLabel("new-collection", result.plan.counts), expected === 1 ? "Create collection" : "Create 2 collections");
 }
 const app = createBuilderController();
 const parent = app.createCollection({ editable: { title: "Destination" } });
 const result = createGenreHierarchyPlan(app.getState().project, { scope: "new-folder", destinationCollectionInternalId: parent.createdInternalId, projectRevision: app.getState().revision, genres: ["Comedy", "Drama"] });
 assert.equal(result.ok, true);
 assert.equal(result.plan.counts.folderCount, 2);
 assert.equal(guidedCreateActionLabel("new-folder", result.plan.counts), "Create 2 folders");
});

test("destination copy identifies actual hierarchy names with readable hidden-title fallbacks", () => {
 assert.equal(creationContext("new-collection"), "New Collection");
 assert.equal(creationContext("new-folder", "Movies"), "New Folder · To Movies");
 assert.equal(destinationContext(" Movies ", "Genres"), "To Movies / Genres");
 assert.equal(destinationContext(NUVIO_INVISIBLE_TITLE, NUVIO_INVISIBLE_TITLE), "To Collection with hidden Nuvio title / Folder with hidden Nuvio title");
 assert.equal(destinationContext("", ""), "To Untitled collection / Untitled folder");
 const folder = { internalId: "private-folder-id", editable: { title: "Family favourites with a longer descriptive name" } };
 const project = { collections: [{ internalId: "private-collection-id", editable: { title: "Movies for all the family" }, folders: [folder] }] };
 assert.equal(sourceDestinationContext(project, folder), "To Movies for all the family / Family favourites with a longer descriptive name");
});

test("All-tab consumers share source-within-folder meaning and keep the Decades overview distinction", () => {
 const shared = read("builder/src/ui/CollectionPresentationChoices.jsx");
 assert.match(shared, /For each folder with two or more sources[^"\n]*All tab[^"\n]*its sources/);
 for (const file of ["CreationDialog", "PeopleSourceFlow", "FranchiseSourceFlow", "StudioHierarchyFlow", "NetworkHierarchyFlow", "GenreHierarchyFlow", "StreamingHierarchyFlow", "TmdbListSourceFlow", "AdvancedDiscoverFlow"]) {
  const source = read(`builder/src/ui/${file}.jsx`);
  assert.match(source, /HierarchyCollectionPresentationControls/);
  assert.doesNotMatch(source, /showAllDescription=|Combine all (?:person|franchise|studio|network|genre|provider) folders|combines every folder/i);
 }
 assert.match(read("builder/src/ui/CreationDialog.jsx"), /All tab combines this folder’s sources, while Decade overview is one source/);
});

test("normal flow copy avoids the known implementation jargon and uses Add operation context", () => {
 for (const file of ["PeopleSourceFlow", "FranchiseSourceFlow", "GenreHierarchyFlow", "StreamingHierarchyFlow", "StreamingSourceFlow", "TmdbListSourceFlow", "SourceEditorDialog"]) {
  assert.doesNotMatch(read(`builder/src/ui/${file}.jsx`), /atomically|one atomic Apply|physical source|canonical People defaults|no canonical TMDB name was fetched/);
 }
 const discover = read("builder/src/ui/AdvancedDiscoverFlow.jsx");
 assert.match(discover, /hierarchy \? "Create with Discover" : "Add Discover sources"/);
 assert.match(discover, /sourceDestinationContext\(project, destinationFolder\)/);
 const streaming = read("builder/src/ui/StreamingHierarchyFlow.jsx");
 assert.match(streaming, /selectedCandidate \? destinationContext\(collectionDisplayContext/);
});
