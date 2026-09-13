// Pure local comparison and importer contracts; no external-service stand-ins.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createBuilderController } from "../builder/src/application/index.js";
import { serializeNuvioProject } from "../builder/src/serialize/index.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const command = path.join(root, "scripts/investigate-shared-advanced.mjs");
const source = { provider: "tmdb", title: "Comparison fixture", tmdbSourceType: "COMPANY", mediaType: "MOVIE", tmdbId: "174", sortBy: "vote_count.desc", filters: { voteCountGte: 100, "vote_count.gte": 100 } };
const tree = (sources = [source]) => [{ id: "comparison-collection", folders: [{ id: "comparison-folder", sources }] }];
function comparison(t, before, after) {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), "tmdb-206-comparison-"));
	t.after(() => {
		const resolved = path.resolve(directory);
		assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
		assert.ok(path.basename(resolved).startsWith("tmdb-206-comparison-"));
		fs.rmSync(resolved, { recursive: true, force: true });
	});
	const input = path.join(directory, "input.json"), output = path.join(directory, "output.json"), reportDir = path.join(directory, "report");
	const inputText = JSON.stringify(before), outputText = JSON.stringify(after);
	fs.writeFileSync(input, inputText); fs.writeFileSync(output, outputText);
	const args = [command, "compare", input, output, reportDir];
	const run = spawnSync(process.execPath, args, { cwd: root, encoding: "utf8" });
	assert.equal(run.status, 0, run.stderr);
	assert.equal(fs.readFileSync(input, "utf8"), inputText);
	assert.equal(fs.readFileSync(output, "utf8"), outputText);
	return { report: JSON.parse(fs.readFileSync(path.join(reportDir, "compare.json"), "utf8")), args };
}

test("comparison matches changed sorts/filters and numeric IDs while retaining typed differences", (t) => {
	const before = tree(), after = structuredClone(before);
	after[0].folders[0].sources[0] = { ...source, tmdbId: 174, sortBy: "popularity.desc", filters: { voteCountGte: "100", unknown: null } };
	after[0].folders[0].catalogSources = [];
	const { report, args } = comparison(t, before, after);
	assert.equal(report.matchedSources, 1);
	assert.equal(report.sortChanges.length, 1);
	assert.equal(report.orderChanges.length, 0);
	assert.deepEqual(report.missing, []);
	assert.deepEqual(report.ambiguous, []);
	const changes = new Map(report.sourceChanges[0].changes.map((change) => [change.path, change]));
	assert.deepEqual(changes.get("tmdbId"), { path: "tmdbId", before: { type: "string", value: "174" }, after: { type: "number", value: 174 } });
	assert.equal(changes.get("filters.vote_count.gte").after.type, "absent");
	assert.equal(changes.get("filters.voteCountGte").after.type, "string");
	assert.equal(changes.get("filters.unknown").after.type, "null");
	assert.equal(report.folderChanges[0].changes[0].before.type, "absent");
	assert.equal(report.folderChanges[0].changes[0].after.type, "array");
	const retry = spawnSync(process.execPath, args, { cwd: root, encoding: "utf8" });
	assert.notEqual(retry.status, 0, "Must refuse to overwrite retained evidence.");
});

test("source IDs survive renaming and reordering; duplicates are never paired by position", (t) => {
	const before = tree([{ ...source, id: "a" }, { ...source, id: "b" }]);
	const after = structuredClone(before);
	after[0].folders[0].sources.reverse();
	after[0].folders[0].sources[0].title = "Changed title";
	const { report } = comparison(t, before, after);
	assert.equal(report.matchedSources, 2);
	assert.equal(report.orderChanges.length, 1);
	assert.equal(report.sourceChanges[0].title, source.title);
	const duplicated = comparison(t, tree([source, source]), tree([source, source])).report;
	assert.equal(duplicated.matchedSources, 0);
	assert.equal(duplicated.ambiguous.length, 2);
});

test("duplicate or absent parent IDs and source renaming without ID remain unresolved", (t) => {
	assert.equal(comparison(t, [...tree(), ...tree()], tree()).report.matchedCollections, 0);
	const duplicateFolders = tree();
	duplicateFolders[0].folders.push(structuredClone(duplicateFolders[0].folders[0]));
	assert.equal(comparison(t, duplicateFolders, tree()).report.matchedFolders, 0);
	const noId = tree(); delete noId[0].id;
	assert.equal(comparison(t, noId, noId).report.matchedCollections, 0);
	const renamed = tree([{ ...source, title: "Different title" }]);
	const { report } = comparison(t, tree(), renamed);
	assert.equal(report.matchedSources, 0);
	assert.equal(report.missing.length, 1);
	assert.equal(report.added.length, 1);
});

test("all supplied manual inputs retain exact JSON through two actual Builder cycles", () => {
	const fixtures = new URL("../manual-tests/shared-advanced/fixtures/", import.meta.url);
	let count = 0;
	for (const name of fs.readdirSync(fixtures).filter((name) => name.endsWith(".json"))) {
		const input = JSON.parse(fs.readFileSync(new URL(name, fixtures), "utf8"));
		let value = input;
		for (let cycle = 0; cycle < 2; cycle++) {
			const controller = createBuilderController();
			assert.equal(controller.importValue(value).ok, true);
			const output = serializeNuvioProject(controller.getState().project);
			assert.equal(output.ok, true);
			assert.deepEqual(output.value, input, name);
			value = output.value;
		}
		count += input.reduce((total, collection) => total + collection.folders.reduce((sum, folder) => sum + folder.sources.length, 0), 0);
	}
	assert.equal(count, 36);
});
