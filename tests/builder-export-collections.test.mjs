import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { createBuilderController } from "../builder/src/application/controller.js";
import { stringifyNuvioProject } from "../builder/src/serialize/index.js";
import {
	collectionExportCounts, collectionExportFilename, copyCollectionsJson, createCollectionExportPayload,
	downloadCollectionsJson, exportDiagnosticNodes, exportDiagnosticTarget, groupExportWarnings, hasExportableStructure,
} from "../builder/src/ui/export-collections.js";

function imported(value) {
	const controller = createBuilderController();
	assert.equal(controller.importValue(value).ok, true);
	return controller;
}
const preserved = { provider: "community", title: "Preserved", unknown: { keep: [1, false] } };
const native = { provider: "tmdb", title: "Genre", tmdbSourceType: "DISCOVER", mediaType: "MOVIE", filters: { withGenres: "28" }, sortBy: "popularity.desc" };
const profile = [{ id: "c", title: "Collection", folders: [{ id: "f", title: "Folder", sources: [preserved, native] }, { id: "empty", title: "Empty", sources: [] }] }, { id: "empty-c", title: "Empty Collection", folders: [] }];

test("Export entry requires Collection → Folder → Source, independent of validation", () => {
	for (const value of [[], [{ id: "c", title: "Collection", folders: [] }], [{ id: "c", title: "Collection", folders: [{ id: "f", title: "Folder", sources: [] }] }]]) {
		assert.equal(hasExportableStructure(imported(value).getState().project), false);
	}
	assert.equal(hasExportableStructure(imported(profile).getState().project), true);
	const invalid = imported([{ ...profile[0], title: "" }]);
	assert.equal(hasExportableStructure(invalid.getState().project), true);
	assert.equal(createCollectionExportPayload(invalid)().ok, false);
});

test("filename uses actual local calendar dates across a UTC date boundary", () => {
	assert.equal(collectionExportFilename(new Date(2026, 0, 9)), "dingo-nuvio-collections-2026-01-09.json");
	for (const [timezone, day] of [["Australia/Sydney", "05"], ["America/Los_Angeles", "04"]]) {
		const text = execFileSync(process.execPath, ["--input-type=module", "-e", 'import { collectionExportFilename } from "./builder/src/ui/export-collections.js"; console.log(collectionExportFilename(new Date("2026-09-04T14:30:00Z")));'], { cwd: new URL("..", import.meta.url), env: { ...process.env, TZ: timezone }, encoding: "utf8" });
		assert.equal(text.trim(), `dingo-nuvio-collections-2026-09-${day}.json`);
	}
	assert.throws(() => collectionExportFilename(new Date(NaN)), TypeError);
});

test("one canonical result retains prepared Collections, bytes and counts across diagnostic revisions", () => {
	const controller = imported(profile);
	let calls = 0;
	const get = createCollectionExportPayload({ ...controller, stringifyProject(options) { calls++; return controller.stringifyProject(options); } });
	const project = controller.getState().project;
	const payload = get();
	assert.equal(payload.ok, true);
	assert.equal(payload.json, stringifyNuvioProject(project).json);
	assert.deepEqual(payload.collections, JSON.parse(payload.json));
	assert.deepEqual(payload.counts, { collections: 2, folders: 2, sources: 2 });
	assert.deepEqual(payload.counts, collectionExportCounts(JSON.parse(payload.json)));
	assert.deepEqual(payload.collections[0].folders[0].sources[0], preserved);
	assert.deepEqual(collectionExportCounts([]), { collections: 0, folders: 0, sources: 0 });
	controller.selectNode(project.collections[0].internalId);
	assert.equal(get(), payload); assert.equal(calls, 1);
	controller.removeNode(project.collections[0].folders[1].internalId);
	assert.notEqual(get(), payload); assert.equal(calls, 2);
	assert.deepEqual(get().counts, { collections: 2, folders: 1, sources: 2 });
});

test("addon projections are counted once and preserved opaque Sources stay in output", () => {
	const addon = { provider: "addon", title: "Addon", addonId: "saved.addon", type: "movie", catalogId: "saved" };
	const controller = imported([{ id: "c", title: "Collection", folders: [{ id: "f", title: "Folder", sources: [addon, preserved] }] }]);
	const payload = createCollectionExportPayload(controller)();
	assert.equal(payload.ok, true);
	assert.equal(payload.collections[0].folders[0].catalogSources.length, 1);
	assert.equal(payload.counts.sources, 2);
	assert.equal(payload.counts.sources, JSON.parse(payload.json)[0].folders[0].sources.length);
});

test("Copy/Download share exact bytes and use the displayed session filename", async () => {
	const payload = createCollectionExportPayload(imported(profile))();
	let copied; let downloaded; const link = { click() {}, remove() {} };
	assert.equal(await copyCollectionsJson(payload, { async writeText(value) { copied = value; } }), true);
	const filename = collectionExportFilename(new Date(2026, 8, 5));
	assert.equal(downloadCollectionsJson(payload, { filename, document: { body: { append() {} }, createElement() { return link; } }, url: { createObjectURL(blob) { downloaded = blob; return "blob:local-export"; }, revokeObjectURL() {} } }), true);
	assert.equal(await downloaded.text(), copied);
	assert.equal(link.download, filename);
	assert.equal(await copyCollectionsJson(payload, { async writeText() { throw new Error("denied"); } }), false);
	assert.equal(await copyCollectionsJson(payload, {}), false);
});

test("blocking validation exposes neither prepared output nor partial JSON", async () => {
	const controller = imported([{ ...profile[0], title: "" }]);
	const output = createCollectionExportPayload(controller)();
	assert.equal(output.ok, false); assert.equal(output.json, null); assert.equal(output.collections, null);
	assert.deepEqual(output.counts, { collections: 1, folders: 2, sources: 2 });
	assert.equal(await copyCollectionsJson(output, { writeText() { assert.fail("partial copy"); } }), false);
	assert.equal(downloadCollectionsJson(output), false);
	assert.equal(exportDiagnosticTarget(output.project, output.errors[0]).nodeType, "collection");
});

test("legacy addon entries remain blocked without migration or draft mutation", () => {
	const controller = imported([{ id: "c", title: "Legacy", folders: [{ id: "f", title: "Folder", catalogSources: [{ addonId: "legacy", type: "movie", catalogId: "catalog" }] }] }]);
	const before = controller.getState().project;
	const payload = createCollectionExportPayload(controller)();
	assert.equal(payload.ok, false);
	assert.ok(payload.errors.some((error) => error.code === "LEGACY_CATALOG_SOURCES_ONLY_UNRESOLVED"));
	assert.equal(controller.getState().project, before);
});

test("diagnostic links resolve current Collection, Folder and supported Source safely", () => {
	const controller = imported(profile); const project = controller.getState().project;
	assert.equal(exportDiagnosticTarget(project, { path: "$[0].title" }), project.collections[0]);
	assert.equal(exportDiagnosticTarget(project, { path: "$[0].folders[0].title" }), project.collections[0].folders[0]);
	assert.equal(exportDiagnosticTarget(project, { path: "$[0].folders[0].sources[1].filters" }), project.collections[0].folders[0].sources[1]);
	assert.equal(exportDiagnosticTarget(project, { path: "$[0].folders[0].sources[0]" }), null);
	assert.deepEqual(exportDiagnosticNodes(project, { path: "$[99].folders[0].title" }), []);
	assert.deepEqual(exportDiagnosticNodes(project, { path: "$[0].folders[99].title" }), []);
	controller.removeNode(project.collections[0].folders[0].internalId);
	assert.notEqual(exportDiagnosticTarget(controller.getState().project, { path: "$[0].folders[0].title" }), project.collections[0].folders[0]);
});

test("export contains no simulator controls, artwork rendering or data request path", () => {
	const source = fs.readFileSync(new URL("../builder/src/ui/ExportCollectionsDialog.jsx", import.meta.url), "utf8");
	assert.doesNotMatch(source, /role="tab|data-device|<img|<video|onPointer|scrollLeft|Preview titles|Back to Workspace|fetch\(/);
	for (const file of ["ReviewExport.jsx", "review-export.js", "review-export.css", "use-horizontal-rail.js"]) {
		assert.equal(fs.existsSync(new URL(`../builder/src/ui/${file}`, import.meta.url)), false);
	}
});

test("export warning audit groups actual reasons and preserves severity and output", () => {
	const ambiguous = { title: "Imported genre", tmdbSourceType: "DISCOVER", mediaType: "MOVIE", addonName: "Imported", filters: { withGenres: "28" } };
	const controller = imported([{ id: "c", title: "Collection", folders: [{ id: "f", title: "Folder", sources: [ambiguous], catalogSources: [{ addonId: "old", type: "movie", catalogId: "old" }] }] }]);
	const payload = createCollectionExportPayload(controller)();
	assert.equal(payload.ok, true);
	assert.deepEqual(payload.collections[0].folders[0].sources, [ambiguous]);
	const groups = groupExportWarnings(payload.project, payload.warnings);
	assert.deepEqual(groups.map((group) => group.code), ["OPAQUE_SOURCE_PRESERVED", "UNMATCHED_CATALOG_SOURCE_REMOVED"]);
	assert.equal(groups[0].countLabel, "1 affected Source");
	assert.equal(groups[0].reason, "This Source can’t be edited in the Builder");
	assert.equal(groups[0].consequence, "It will still be included unchanged in the exported file.");
	assert.equal(groups[1].countLabel, "1 warning");
	assert.equal(groups[1].reason, "Some saved addon details are no longer used");
	assert.equal(groups[1].consequence, "These unused details won’t be exported. Your current Sources are unaffected.");
	assert.equal(groups[1].locations[0].items[0].text, "Saved addon details 1");
	const addonGroup = groupExportWarnings(payload.project, [payload.warnings[1], { ...payload.warnings[1], path: "$[0].folders[0].catalogSources[1]" }])[0];
	assert.equal(addonGroup.countLabel, "2 warnings");
	assert.equal(addonGroup.reason, groups[1].reason);
	assert.equal(addonGroup.consequence, groups[1].consequence);
});

test("warning groups deduplicate Source identity, not titles or rendered sentences", () => {
	const project = imported([{ id: "c", title: "Same", folders: [{ id: "f", title: "Same", sources: [preserved, preserved] }] }]).getState().project;
	const warnings = [
		{ code: "OPAQUE_SOURCE_PRESERVED", path: "$[0].folders[0].sources[0]", message: "First wording" },
		{ code: "OPAQUE_SOURCE_PRESERVED", path: "$[0].folders[0].sources[0].filters", message: "Different wording" },
		{ code: "OPAQUE_SOURCE_PRESERVED", path: "$[0].folders[0].sources[1]", message: "First wording" },
	];
	const [group] = groupExportWarnings(project, warnings);
	assert.equal(group.warnings.length, 3);
	assert.equal(group.countLabel, "2 affected Sources");
	assert.equal(group.locations.length, 1);
	assert.equal(group.locations[0].items.length, 2);
	assert.equal(group.reason, "Some Sources can’t be edited in the Builder");
	assert.equal(group.consequence, "They will still be included unchanged in the exported file.");
	const mixed = groupExportWarnings(project, [...warnings, { ...warnings[0], path: "$[99]" }])[0];
	assert.equal(mixed.sourceCount, null);
	assert.equal(mixed.countLabel, "4 warnings");
	assert.equal(mixed.unresolved, 1);
});

test("unknown structured warning reasons use safe copy without leaking diagnostics", () => {
	const project = imported(profile).getState().project;
	const groups = groupExportWarnings(project, [
		{ code: "FUTURE_TYPE_A", path: "$", message: "INTERNAL_DETAILS_A" },
		{ code: "FUTURE_TYPE_B", path: "$", message: "INTERNAL_DETAILS_A" },
	]);
	assert.equal(groups.length, 2, "Equal messages do not merge different structured reasons");
	for (const group of groups) {
		assert.equal(group.countLabel, "1 warning");
		assert.equal(group.reason, "Some information will be preserved unchanged");
		assert.equal(group.consequence, "Dingo does not fully recognise this information, so it will be kept unchanged in the exported file.");
		assert.doesNotMatch(group.reason + group.consequence, /FUTURE_TYPE|INTERNAL_DETAILS/);
	}
});
