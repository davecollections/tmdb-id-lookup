import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { CREATION_SCOPES, guidedCreateActionLabel } from "../builder/src/ui/creation-options.js";

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
		["Decades", "builder/src/ui/CreationDialog.jsx", "guidedCreateActionLabel(scope)"],
		["People", "builder/src/ui/PeopleSourceFlow.jsx", "guidedCreateActionLabel(hierarchyScope)"],
		["Franchises", "builder/src/ui/FranchiseSourceFlow.jsx", "guidedCreateActionLabel(scope)"],
		["TMDB Lists", "builder/src/ui/TmdbListSourceFlow.jsx", "guidedCreateActionLabel(scope)"],
		["Studios", "builder/src/ui/StudioHierarchyFlow.jsx", "guidedCreateActionLabel(scope)"],
		["Networks", "builder/src/ui/NetworkHierarchyFlow.jsx", "guidedCreateActionLabel(scope)"],
		["Genres", "builder/src/ui/GenreHierarchyFlow.jsx", "guidedCreateActionLabel(scope)"],
		["Streaming", "builder/src/ui/StreamingHierarchyFlow.jsx", "guidedCreateActionLabel(activeScope)"],
	]) {
		assert.ok(read(relativePath).includes(call), `${family} lost its guided completion label`);
	}
});

test("Streaming keeps explicit labels for updated, unchanged, and duplicate outcomes", () => {
	const flow = read("builder/src/ui/StreamingHierarchyFlow.jsx");
	assert.match(flow, /changesOnlyNewFolders[\s\S]*existingFolderAdditionCount/);
	assert.match(flow, /changesOnlyNewFolders \? guidedCreateActionLabel\(activeScope\) : "Apply changes"/);
	assert.match(flow, /routedExistingNoChanges \? "Close"/);
	assert.match(flow, /"Create duplicate collection"/);
});

test("single and count-aware Add Source families use Add language", () => {
	for (const [family, relativePath, label] of [
		["Movie franchise", "builder/src/ui/AddSourceDialog.jsx", '"Add 1 source"'],
		["People", "builder/src/ui/PeopleSourceFlow.jsx", '`Add ${primaryCount} source${primaryCount === 1 ? "" : "s"}`'],
		["Network", "builder/src/ui/NetworkSourceFlow.jsx", '"Add 1 source"'],
		["Decade", "builder/src/ui/DecadeSourceFlow.jsx", '`Add ${saveCount} sources`'],
	]) {
		assert.ok(read(relativePath).includes(label), `${family} lost its Add Source label`);
	}
});
