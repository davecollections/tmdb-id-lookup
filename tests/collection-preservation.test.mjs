// Pure saved-JSON checks. These do not simulate a Nuvio client or title service.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { compare, comparisonTable, ROUTES } from "../scripts/investigate-shared-advanced.mjs";
import { master, artifacts } from "../manual-tests/collection-preservation/generate-pack.mjs";
import { DISCOVER_FILTER_FIELDS, NATIVE_TMDB_SOURCE_TYPES } from "../builder/src/nuvio/known-fields.js";
import { createBuilderController } from "../builder/src/application/index.js";
import { serializeNuvioProject } from "../builder/src/serialize/index.js";
import { createMasterServer } from "../manual-tests/collection-preservation/serve-master.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = { provider: "tmdb", title: "[P206-S001] Public Studio", tmdbSourceType: "COMPANY", tmdbId: 174, mediaType: "MOVIE", sortBy: "vote_count.desc", filters: { voteCountGte: 100, "vote_count.gte": 100 } };
const tree = (sources = [source]) => [{ id: "c", title: "[P206-C001] Collection", folders: [{ id: "f", title: "[P206-F001] Folder", sources }] }];
const input = (value) => ({ value, filename: "unit.json", bytes: 0, sha256: "pure-unit" });
const diff = (a, b) => compare(input(a), input(b), { full: true });
const row = (report, field, marker = "P206-S001") => report.fieldComparison.find((r) => r.case === marker && r.field === field);
function temp(t) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tmdb-206-preservation-"));
	t.after(() => { assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir())); assert.ok(path.basename(dir).startsWith("tmdb-206-preservation-")); fs.rmSync(dir, { recursive: true, force: true }); });
	return dir;
}

test("object property order is ignored even within arrays; meaningful array order is retained", () => {
	const a = tree(); a[0].folders[0].opaque = [{ a: 1, b: 2 }, { a: 3 }];
	const b = structuredClone(a); b[0].folders[0].opaque = [{ b: 2, a: 1 }, { a: 3 }];
	assert.equal(row(diff(a, b), "/opaque", "P206-F001").label, "Kept");
	b[0].folders[0].opaque.reverse();
	assert.equal(row(diff(a, b), "/opaque", "P206-F001").label, "Changed");
});

test("matching alias removal and canonical decimal IDs are equivalent; sort changes remain visible", () => {
	const a = tree(), b = structuredClone(a), s = b[0].folders[0].sources[0];
	delete s.filters["vote_count.gte"]; s.tmdbId = "174"; s.sortBy = "popularity.desc";
	const report = diff(a, b);
	assert.equal(row(report, "/filters/vote_count.gte").label, "Equivalent change");
	assert.equal(row(report, "/tmdbId").label, "Equivalent change");
	assert.equal(row(report, "/sortBy").label, "Changed");
	assert.equal(report.sortChanges.length, 1);
	assert.equal(report.orderChanges.length, 0);
	s.tmdbId = "0174";
	assert.equal(row(diff(a, b), "/tmdbId").label, "Changed");
});

test("conflicting aliases, canonical deletion and unexpected numeric conversions are never equivalent", () => {
	for (const variant of ["conflict", "canonical-missing", "string-conversion"]) {
		const a = tree(), b = structuredClone(a), old = a[0].folders[0].sources[0], next = b[0].folders[0].sources[0];
		if (variant === "conflict") old.filters["vote_count.gte"] = 101;
		if (variant === "canonical-missing") delete next.filters.voteCountGte;
		if (variant === "string-conversion") next.filters.voteCountGte = "100";
		delete next.filters["vote_count.gte"];
		assert.equal(row(diff(a, b), "/filters/vote_count.gte").label, "Removed", variant);
	}
});

test("absent, null, false, zero, empty string, object and array remain distinct", () => {
	const values = [undefined, null, false, 0, "", {}, []];
	for (const [i, before] of values.entries()) for (const [j, after] of values.entries()) {
		const a = tree(), b = tree();
		if (i) a[0].folders[0].probe = before;
		if (j) b[0].folders[0].probe = after;
		const found = row(diff(a, b), "/probe", "P206-F001");
		if (i || j) assert.equal(found.label === "Kept", i === j, `${i} to ${j}`);
	}
});

test("defaults are separate from explicit toggle changes and unfamiliar added fields", () => {
	const a = tree(), b = structuredClone(a);
	a[0].folders[0].hideTitle = true; b[0].folders[0].hideTitle = false;
	b[0].folders[0].focusGifEnabled = false; b[0].folders[0].unexpected = false;
	const report = diff(a, b);
	assert.equal(row(report, "/hideTitle", "P206-F001").label, "Changed");
	assert.equal(row(report, "/focusGifEnabled", "P206-F001").label, "Added default");
	assert.equal(row(report, "/unexpected", "P206-F001").label, "Changed");
	b[0].folders[0].focusGifEnabled = "false";
	assert.equal(row(diff(a, b), "/focusGifEnabled", "P206-F001").label, "Changed");
	b[0].focusGlowEnabled = false;
	assert.equal(row(diff(a, b), "/focusGlowEnabled", "P206-C001").label, "Added default");
});

test("a field added by one route is still compared as absent in another completed route", () => {
	const a = tree(), b = structuredClone(a);
	b[0].folders[0].newSetting = "new";
	const table = comparisonTable(diff(a, a).fieldComparison, { "nuvio.tv": diff(a, b), Desktop: diff(a, a) });
	const line = table.split("\n").find((r) => r.includes("P206-F001 /newSetting"));
	assert.match(line, /Changed: string: "new" \| Kept \| Not tested/);
});

test("different additions at the same output position remain separate cases across routes", () => {
	const a = tree(), b = structuredClone(a), c = structuredClone(a);
	b[0].folders[0].sources.push({ ...source, title: "[P206-S002] Added A", tmdbId: 3 });
	c[0].folders[0].sources.push({ ...source, title: "[P206-S003] Added B", tmdbId: 2 });
	const table = comparisonTable(diff(a, a).fieldComparison, { "nuvio.tv": diff(a, b), Desktop: diff(a, c) });
	assert.ok(table.includes("P206-S002 /tmdbId")); assert.ok(table.includes("P206-S003 /tmdbId"));
});

test("regenerated IDs match unique case markers and remain visible without false reordering", () => {
	const a = tree([{ ...source, id: "s" }]), b = structuredClone(a);
	b[0].id = "new-c"; b[0].folders[0].id = "new-f"; b[0].folders[0].sources[0].id = "new-s";
	const report = diff(a, b);
	assert.deepEqual([report.matchedCollections, report.matchedFolders, report.matchedSources], [1, 1, 1]);
	for (const marker of ["P206-C001", "P206-F001", "P206-S001"]) assert.equal(row(report, "/id", marker).label, "Changed");
	assert.equal(report.orderChanges.length, 0);
});

test("collection, folder and source reordering is detected at its own level", () => {
	const a = tree([source, { ...source, title: "[P206-S002] Second", tmdbId: 3 }]);
	a[0].folders.push({ id: "f2", title: "[P206-F002] Second folder", sources: [] });
	a.push({ id: "c2", title: "[P206-C002] Second collection", folders: [] });
	const b = structuredClone(a); b[0].folders[0].sources.reverse(); b[0].folders.reverse(); b.reverse();
	assert.equal(diff(a, b).orderChanges.length, 3);
});

test("only fully identical source copies can be cleaned up without content loss", () => {
	const a = tree([source, structuredClone(source)]), b = tree();
	const report = diff(a, b);
	assert.equal(report.duplicateChanges.length, 1);
	assert.equal(report.duplicateChanges[0].label, "Equivalent change");
	assert.equal(report.missing.length, 0);
	assert.equal(report.fieldComparison.find((r) => r.field === "@order" && r.location.endsWith("/sources")).label, "Equivalent change");
	a[0].folders[0].sources[1].filters.voteCountGte = 0;
	const distinct = diff(a, b);
	assert.equal(distinct.duplicateChanges.length, 0);
	assert.equal(distinct.ambiguous.length, 2);
	assert.equal(distinct.matchedSources, 0);
});

test("missing and added nodes keep full fields; added nodes cannot overwrite original table rows", () => {
	const a = tree(), b = tree([{ ...source, title: "[P206-S099] Replacement", tmdbId: 3 }]);
	const report = diff(a, b);
	assert.equal(report.missing.length, 1); assert.equal(report.added.length, 1);
	assert.equal(row(report, "/tmdbId").label, "Removed");
	const table = comparisonTable(diff(a, a).fieldComparison, { Desktop: report });
	assert.match(table, /P206-S001 \/tmdbId/); assert.match(table, /P206-S099 \/tmdbId/);
	assert.match(table, /Removed: absent/); assert.match(table, /Changed: number: 3/);
});

test("ambiguous identities and malformed child arrays stay visible without positional matching", () => {
	const a = tree([source, { ...source, filters: { voteCountGte: 0 } }]);
	assert.equal(diff(a, a).matchedSources, 0);
	assert.equal(diff(a, a).ambiguous.length, 2);
	const b = tree(); b[0].folders[0].sources = null;
	assert.equal(diff(tree(), b).ambiguous.length, 1);
	assert.equal(diff(tree(), b).fieldComparison.find((r) => r.field === "@structure").exported.type, "null");
});

test("People and List filter preservation is independent of client filter application", () => {
	for (const family of ["PERSON", "DIRECTOR", "LIST"]) {
		const a = tree([{ ...source, tmdbSourceType: family }]), b = structuredClone(a);
		assert.equal(row(diff(a, b), "/filters/voteCountGte").label, "Kept");
		delete b[0].folders[0].sources[0].filters.voteCountGte;
		assert.equal(row(diff(a, b), "/filters/voteCountGte").label, "Removed");
	}
});

test("the authored pack covers required fields and survives local import with only known projection additions", () => {
	const files = artifacts();
	for (const [name, content] of files) assert.equal(fs.readFileSync(path.join(root, "manual-tests/collection-preservation", name), "utf8"), content, name);
	const folders = master.flatMap((c) => c.folders), sources = folders.flatMap((f) => f.sources);
	assert.deepEqual(new Set(sources.map((s) => s.tmdbSourceType).filter(Boolean)), new Set(NATIVE_TMDB_SOURCE_TYPES));
	for (const field of DISCOVER_FILTER_FIELDS) assert.ok(sources.some((s) => s.tmdbSourceType === "DISCOVER" && s.filters?.[field] != null && s.filters[field] !== ""), field);
	assert.deepEqual(new Set(folders.map((f) => f.tileShape).filter(Boolean)), new Set(["POSTER", "SQUARE", "LANDSCAPE"]));
	for (const enabled of [true, false]) for (const withUrl of [true, false]) assert.ok(folders.some((f) => f.focusGifEnabled === enabled && Boolean(f.focusGifUrl) === withUrl));
	assert.ok(sources.some((s) => s.sortBy === "original")); assert.ok(sources.some((s) => s.sortBy === "vote_count.desc"));
	assert.ok(sources.some((s) => typeof s.tmdbId === "string"));
	const controller = createBuilderController();
	assert.equal(controller.importValue(master).ok, true);
	const serialized = serializeNuvioProject(controller.getState().project);
	assert.equal(serialized.ok, true);
	const localChanges = diff(master, serialized.value).fieldComparison.filter((r) => r.label !== "Kept");
	assert.equal(localChanges.length, folders.filter((f) => !Object.hasOwn(f, "catalogSources")).length);
	for (const change of localChanges) {
		assert.equal(change.field, "/catalogSources");
		assert.deepEqual(change.original, { type: "absent" });
		assert.deepEqual(change.exported, { type: "array", value: [] });
	}
	assert.equal(diff(master, master).ambiguous.length, 0);
	const manifest = JSON.parse(files.get("case-manifest.json"));
	assert.equal(manifest.input.sha256, crypto.createHash("sha256").update(files.get("206-collection-preservation-master.json")).digest("hex"));
	const table = files.get("comparison.md");
	assert.ok(ROUTES.every((route) => table.includes(route)));
	assert.equal((table.match(/Not tested/g) ?? []).length, manifest.fields.length * 4 + 1);
});

test("matrix CLI retains exact files, checks run metadata and refuses evidence overwrite or repository output", (t) => {
	const dir = temp(t), original = path.join(dir, "master.json"), exported = path.join(dir, "desktop.json");
	fs.writeFileSync(original, "\uFEFF" + JSON.stringify(tree(), null, 2) + "\r\n");
	fs.writeFileSync(exported, JSON.stringify(tree()) + "\n");
	const log = path.join(dir, "runs.json"), out = path.join(dir, "result");
	const run = { status: "Completed", exportFile: "desktop.json", version: "unit-only", startedAt: "2026-09-13T12:00:00+10:00", exportedAt: "2026-09-13T12:01:00+10:00", importMethod: "unit", exportMethod: "unit", syncActivity: "none", isolation: "unit files" };
	const record = { masterSha256: crypto.createHash("sha256").update(fs.readFileSync(original)).digest("hex"), routes: { Desktop: run } };
	fs.writeFileSync(log, JSON.stringify(record));
	const args = [path.join(root, "scripts/investigate-shared-advanced.mjs"), "matrix", original, log, out];
	const invoke = (values = args) => spawnSync(process.execPath, values, { encoding: "utf8" });
	assert.equal(invoke().status, 0);
	assert.deepEqual(fs.readFileSync(path.join(out, "original.json")), fs.readFileSync(original));
	assert.deepEqual(fs.readFileSync(path.join(out, "route-2.json")), fs.readFileSync(exported));
	assert.equal(invoke().status, 1);
	assert.equal(invoke([...args.slice(0, -1), path.join(root, "private-comparison-must-not-exist")]).status, 1);
	assert.equal(fs.existsSync(path.join(root, "private-comparison-must-not-exist")), false);
	record.routes.Desktop.syncActivity = ""; fs.writeFileSync(log, JSON.stringify(record));
	assert.equal(invoke([...args.slice(0, -1), path.join(dir, "missing-metadata")]).status, 1);
});

test("the local URL serves the exact master and exposes no other files or write endpoint", async (t) => {
	const server = createMasterServer();
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	t.after(() => new Promise((resolve) => server.close(resolve)));
	const base = "http://127.0.0.1:" + server.address().port;
	const response = await fetch(base + "/206.json");
	assert.equal(response.status, 200);
	assert.deepEqual(Buffer.from(await response.arrayBuffer()), fs.readFileSync(path.join(root, "manual-tests/collection-preservation/206-collection-preservation-master.json")));
	const compressed = await fetch(base + "/206-gzip.json", { headers: { "Accept-Encoding": "gzip" } });
	assert.equal(compressed.status, 200); assert.equal(compressed.headers.get("content-encoding"), "gzip");
	assert.deepEqual(Buffer.from(await compressed.arrayBuffer()), fs.readFileSync(path.join(root, "manual-tests/collection-preservation/206-collection-preservation-master.json")));
	const plain = await fetch(base + "/206-gzip.json", { headers: { "Accept-Encoding": "identity" } });
	assert.equal(plain.headers.get("content-encoding"), null);
	assert.deepEqual(Buffer.from(await plain.arrayBuffer()), fs.readFileSync(path.join(root, "manual-tests/collection-preservation/206-collection-preservation-master.json")));
	const head = await fetch(base + "/206-gzip.json", { method: "HEAD", headers: { "Accept-Encoding": "gzip" } });
	assert.equal(head.headers.get("content-encoding"), "gzip"); assert.equal((await head.arrayBuffer()).byteLength, 0);
	assert.equal((await fetch(base + "/206-gzip.json", { method: "POST", body: "ignored" })).status, 405);
	for (const route of ["/", "/case-manifest.json", "/../README.md", "/206.json?file=private"]) assert.equal((await fetch(base + route)).status, 404);
	assert.equal((await fetch(base + "/206.json", { method: "POST", body: "ignored" })).status, 405);
});


test("equal-size identical marked copies compare uniform changes without invented matches", () => {
	const a = tree([source, structuredClone(source)]), b = structuredClone(a);
	for (const copy of b[0].folders[0].sources) { copy.addonId = null; copy.filters.voteCountGte = 0; }
	const report = diff(a,b);
	assert.equal(report.matchedSources,2);
	assert.equal(report.ambiguous.length,0); assert.equal(report.added.length,0); assert.equal(report.missing.length,0);
	assert.equal(report.duplicateChanges.length,0);
	assert.equal(report.fieldComparison.filter(r => r.field === "/filters/voteCountGte" && r.label === "Changed").length,2);
	assert.equal(report.fieldComparison.filter(r => r.field === "/addonId" && r.label === "Changed").length,2);
	b[0].folders[0].sources[1].filters.voteCountGte = 10;
	assert.equal(diff(a,b).ambiguous.length,2);
	b[0].folders[0].sources.pop();
	assert.equal(diff(a,b).duplicateChanges.length,0);
	assert.equal(diff(a,b).ambiguous.length,2);
});

test("moving identical copies around a distinct source remains a saved order change", () => {
	const a = tree([source, {...structuredClone(source), title: "[P206-S002] Distinct"}, structuredClone(source)]);
	const b = structuredClone(a); b[0].folders[0].sources = [b[0].folders[0].sources[0],b[0].folders[0].sources[2],b[0].folders[0].sources[1]];
	for (const copy of b[0].folders[0].sources) copy.addonId = null;
	const report = diff(a,b);
	assert.equal(report.ambiguous.length,0); assert.equal(report.orderChanges.length,1);
	assert.equal(report.fieldComparison.find(r => r.field === "@order" && r.location.endsWith("/sources")).label,"Changed");
});

test("observed absent presentation defaults remain distinct from explicit changes", () => {
	for (const shape of ["LANDSCAPE", "poster"]) {
		const a=tree(), b=structuredClone(a); b[0].folders[0].tileShape=shape; b[0].showAllTab=false;
		const report=diff(a,b);
		assert.equal(row(report,"/tileShape","P206-F001").label,"Added default");
		assert.equal(row(report,"/showAllTab","P206-C001").label,"Added default");
		a[0].showAllTab=true;
		assert.equal(row(diff(a,b),"/showAllTab","P206-C001").label,"Changed");
	}
});
