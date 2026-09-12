import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { validateKeywordCatalogue, createKeywordCatalogueLoader } from "../builder/src/source-add/keyword-catalogue.js";
import { createKeywordIndex, searchKeywordIndex } from "../builder/src/source-add/keyword-matching.js";
import { readKeywordBundle, readBuildKeywordBundle, writeKeywordBundle, keywordCatalogueDelta, keywordExportDate, catalogueFromExport } from "../scripts/lib/tmdb-keyword-catalogue.mjs";
import { restoreKeywordCatalogue, publishedCatalogueUrl } from "../scripts/restore-tmdb-keyword-catalogue.mjs";
const today = new Date().toISOString().slice(0, 10);
const catalogue = (keywords) => ({ schemaVersion: 1, sourceDate: today, keywords });
const validateSmall = (value) => validateKeywordCatalogue(value, { minimumRows: 1 });
function bundle(value) {
 const bytes = Buffer.from(JSON.stringify(value));
 const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
 return { bytes, manifest: { schemaVersion: 1, sha256, file: "keywords-" + sha256 + ".json", rowCount: value.keywords.length, sourceDate: value.sourceDate, bytes: bytes.length } };
}
test("catalogue rejects missing dates, malformed or duplicate IDs, blank names and truncated data", () => {
 for (const value of [{ schemaVersion: 1, keywords: [[1, "name"]] }, catalogue([[1, "name"], [1, "other"]]), catalogue([[0, "name"]]), catalogue([[1, " "]]), catalogue([[2147483648, "name"]])]) assert.throws(() => validateSmall(value));
 assert.throws(() => validateKeywordCatalogue(catalogue([[1, "name"]])));
});
test("shared load, hash revalidation, additions, rename and removal retain the last good version after failure", async () => {
 const original = bundle(catalogue([[1, "shark"], [2, "sharks"]]));
 let version = original, fail = false, calls = 0;
 const loader = createKeywordCatalogueLoader({ validate: validateSmall, fetchImpl: async (url) => {
  calls++; await new Promise((resolve) => setTimeout(resolve, 1));
  if (fail) throw new Error("offline");
  return String(url).endsWith("manifest.json") ? Response.json(version.manifest) : new Response(version.bytes);
 } });
 const [a, b] = await Promise.all([loader.load("https://example.test/data/"), loader.load("https://example.test/data/")]);
 assert.equal(calls, 2); assert.equal(a.sha256, b.sha256);
 await loader.load("https://example.test/data/"); assert.equal(calls, 2);
 await loader.load("https://example.test/data/", { force: true }); assert.equal(calls, 3);
 const selected = { ids: [1, 2], names: ["shark", "sharks"], excludedIds: [2] };
 const retained = structuredClone(selected);
 version = bundle(catalogue([[1, "renamed shark"], [3, "new topic"]]));
 const updated = await loader.load("https://example.test/data/", { force: true });
 assert.deepEqual(keywordCatalogueDelta(a.catalogue, updated.catalogue), { added: 1, removed: 1, renamed: 1, changedFraction: 1.5 });
 assert.deepEqual(selected, retained);
 const index = createKeywordIndex(updated.catalogue.keywords);
 assert.equal(searchKeywordIndex(index, "new topic").status, "exact");
 assert.equal(index.byId.has(2), false);
 fail = true;
 const stale = await loader.load("https://example.test/data/", { force: true });
 assert.equal(stale.stale, true); assert.equal(stale.sourceDate, today); assert.equal(stale.sha256, updated.sha256);
});
test("bad payload checksum cannot replace the valid catalogue", async () => {
 const good = bundle(catalogue([[1, "a"]]));
 let corrupt = false;
 const loader = createKeywordCatalogueLoader({ validate: validateSmall, fetchImpl: async (url) => String(url).endsWith("manifest.json") ? Response.json({ ...good.manifest, ...(corrupt ? { sha256: "a".repeat(64), file: "keywords-" + "a".repeat(64) + ".json" } : {}) }) : new Response(good.bytes) });
 const initial = await loader.load("https://example.test/data/");
 corrupt = true;
 const failed = await loader.load("https://example.test/data/", { force: true });
 assert.equal(failed.stale, true); assert.equal(failed.sha256, initial.sha256);
});
test("first-load failure rejects instead of inventing an empty catalogue", async () => {
 const loader = createKeywordCatalogueLoader({ fetchImpl: async () => new Response("", { status: 503 }) });
 await assert.rejects(loader.load("https://example.test/data/"));
 assert.equal(loader.peek(), null);
});
test("generated bundle is validated atomically and a large unexpected delta leaves it intact", async () => {
 const directory = await fs.mkdtemp(path.join(os.tmpdir(), "discover-catalogue-test-"));
 try {
  const original = catalogue(Array.from({ length: 80000 }, (_, i) => [i + 1, "name " + i]));
  const written = await writeKeywordBundle(directory, original);
  const loaded = await readKeywordBundle(directory);
  assert.equal(loaded.manifest.sha256, written.manifest.sha256);
  const changed = catalogue(original.keywords.map(([id, name]) => [id, id < 6000 ? "renamed " + id : name]));
  await assert.rejects(writeKeywordBundle(directory, changed), /exceeds 5%/);
  assert.equal((await readKeywordBundle(directory)).manifest.sha256, written.manifest.sha256);
 } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
test("export availability window uses yesterday before 08 UTC", () => {
 assert.equal(keywordExportDate(new Date("2026-09-10T07:59:59Z")), "2026-09-09");
 assert.equal(keywordExportDate(new Date("2026-09-10T08:30:00Z")), "2026-09-10");
});

test("only code-review builds allow absent data; partial or invalid bundles still fail", async () => {
 const directory = await fs.mkdtemp(path.join(os.tmpdir(), "discover-build-contract-"));
 const missing = path.join(directory, "missing");
 try {
  assert.equal(await readBuildKeywordBundle(missing, { codeOnly: true }), null);
  await assert.rejects(readBuildKeywordBundle(missing), /ENOENT/);
  await fs.mkdir(missing);
  await assert.rejects(readBuildKeywordBundle(missing, { codeOnly: true }), /ENOENT/);
  await fs.writeFile(path.join(missing, "manifest.json"), "{}");
  await assert.rejects(readBuildKeywordBundle(missing, { codeOnly: true }), /Invalid catalogue manifest/);
  await assert.rejects(readBuildKeywordBundle(missing), /Invalid catalogue manifest/);
 } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test("publication stays strict; Sunday 08:30 UTC and manual refresh share the one-export budget", async () => {
 const deployment = await fs.readFile(new URL("../.github/workflows/deploy-pages.yml", import.meta.url), "utf8");
 const review = await fs.readFile(new URL("../.github/workflows/nuvio-contract-validation.yml", import.meta.url), "utf8");
 const refresh = await fs.readFile(new URL("../.github/workflows/refresh-tmdb-keywords.yml", import.meta.url), "utf8");
 assert.doesNotMatch(deployment, /--code-only/);
 assert.match(deployment, /restore-tmdb-keyword-catalogue\.mjs/);
 assert.match(review, /prepare-pages-site\.mjs --code-only/);
 assert.match(review, /validate-pages-site\.mjs --code-only/);
 assert.match(refresh, /schedule:\s*\n\s*- cron: '30 8 \* \* 0'/);
 assert.equal((refresh.match(/cron:/g) ?? []).length, 1);
 assert.match(refresh, /workflow_dispatch:/);
 assert.match(refresh, /REQUEST_ALLOCATIONS_JSON: '\{"keyword-export":1\}'/);
 assert.match(refresh, /group: tmdb-request-budget/);
 assert.match(refresh, /TMDB_APPROVED_ALLOWANCE: "1"/);
 assert.match(refresh, /TMDB_RESERVATION_SHA256: \$\{\{ needs.reserve.outputs.sha \}\}/);
 assert.match(refresh, /restore-tmdb-keyword-catalogue\.mjs --optional/);
 assert.match(refresh, /retention-days: 30/);
 assert.match(deployment, /- Refresh TMDB Keyword Catalogue/);
 const prepare = await fs.readFile(new URL("../scripts/prepare-tmdb-keyword-catalogue.mjs", import.meta.url), "utf8");
 assert.match(prepare, /maxAttempts: 1/);
});

test("refresh warning remains honest on repeated opening and mismatched metadata cannot replace it", async () => {
 const good = bundle(catalogue([[1, "topic"]]));
 let fail = false, mismatch = false;
 const loader = createKeywordCatalogueLoader({ validate: validateSmall, fetchImpl: async (url) => {
  if (fail) throw new Error("offline");
  return String(url).endsWith("manifest.json") ? Response.json({ ...good.manifest, ...(mismatch ? { rowCount: 99 } : {}) }) : new Response(good.bytes);
 } });
 await loader.load("https://example.test/data/");
 fail = true;
 assert.equal((await loader.load("https://example.test/data/", { force: true })).stale, true);
 assert.equal((await loader.load("https://example.test/data/")).stale, true);
 fail = false; mismatch = true;
 assert.equal((await loader.load("https://example.test/data/", { force: true })).stale, true);
 mismatch = false;
 assert.equal((await loader.load("https://example.test/data/", { force: true })).stale, false);
});
test("an expired in-memory snapshot is unavailable even before the next routine check", async () => {
 const good = bundle(catalogue([[1, "topic"]]));
 let time = Date.now(), fail = false;
 const loader = createKeywordCatalogueLoader({ validate: validateSmall, now: () => time, fetchImpl: async (url) => {
  if (fail) throw new Error("offline");
  return String(url).endsWith("manifest.json") ? Response.json(good.manifest) : new Response(good.bytes);
 } });
 await loader.load("https://example.test/data/");
 time += 181 * 86400000; fail = true;
 await assert.rejects(loader.load("https://example.test/data/"));
 assert.equal(loader.peek(), null);
});

// Synthetic complete catalogues exercise only local maintenance boundaries;
// these fixtures are never used as live service or mounted Builder evidence.
const fullCatalogue = () => catalogue(Array.from({ length: 80000 }, (_, i) => [i + 1, "keyword " + i]));
const unavailableArtifact = async () => { throw new Error("artifact expired or unavailable"); };
const noPublication = async () => new Response("not found", { status: 404 });
const offline = async () => { throw new Error("controlled offline failure"); };
async function inTemporaryDirectory(run) {
 const root = await fs.mkdtemp(path.join(os.tmpdir(), "keyword-maintenance-test-"));
 try { await run(path.join(root, "catalogue")); }
 finally { await fs.rm(root, { recursive: true, force: true }); }
}
function publishedFetch(value, calls = []) {
 return async (url, options) => {
  calls.push({ url: String(url), options });
  if (String(url) === publishedCatalogueUrl + "manifest.json") return Response.json(value.manifest);
  assert.equal(String(url), publishedCatalogueUrl + value.manifest.file);
  return new Response(value.bytes);
 };
}
async function stageArtifact(directory, value) {
 await fs.writeFile(path.join(directory, "manifest.json"), JSON.stringify(value.manifest));
 await fs.writeFile(path.join(directory, value.manifest.file), value.bytes);
}

test("first run requires confirmed absent history and publication; strict publication waits for a complete seed", async () => {
 await inTemporaryDirectory(async (target) => {
  const options = { target, latestRun: async () => null, artifact: unavailableArtifact, fetchImpl: noPublication };
  assert.equal((await restoreKeywordCatalogue({ ...options, optional: true })).source, "first-run-bootstrap");
  await assert.rejects(fs.access(target), /ENOENT/);
  await assert.rejects(restoreKeywordCatalogue(options), /bootstrap/);
  await assert.rejects(readBuildKeywordBundle(target), /ENOENT/);
  const seed = fullCatalogue();
  const exportBytes = gzipSync(seed.keywords.map(([id, name]) => JSON.stringify({ id, name })).join("\n"));
  await writeKeywordBundle(target, catalogueFromExport(exportBytes, today));
  assert.equal((await readBuildKeywordBundle(target)).catalogue.keywords.length, 80000);
 });
});

test("normal refresh restores one artifact, checks additions/removals/renames, and publishes the next complete bundle", async () => {
 await inTemporaryDirectory(async (target) => {
  const previous = fullCatalogue();
  previous.sourceDate = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  let downloads = 0;
  const restored = await restoreKeywordCatalogue({ target, latestRun: async () => 123,
   artifact: async (id, directory) => { assert.equal(id, 123); downloads++; await stageArtifact(directory, bundle(previous)); },
   fetchImpl: async () => assert.fail("A valid artifact needs no Pages requests"),
  });
  assert.equal(restored.source, "actions-artifact"); assert.equal(downloads, 1);
  const next = fullCatalogue();
  next.keywords[0][1] = "renamed"; next.keywords[1] = [80001, "new keyword"];
  const refreshed = await writeKeywordBundle(target, next);
  assert.deepEqual(refreshed.delta, { added: 1, removed: 1, renamed: 1, changedFraction: 3 / 80000 });
  assert.notEqual(refreshed.manifest.sha256, restored.manifest.sha256);
  assert.equal((await readBuildKeywordBundle(target)).manifest.sha256, refreshed.manifest.sha256);
 });
});

test("expired artifact recovers the published last-good copy before applying the same delta guard", async () => {
 await inTemporaryDirectory(async (target) => {
  const original = fullCatalogue(), calls = [];
  const saved = bundle(original);
  const restored = await restoreKeywordCatalogue({ target, latestRun: async () => 456, artifact: unavailableArtifact, fetchImpl: publishedFetch(saved, calls) });
  assert.equal(restored.source, "published-pages"); assert.equal(restored.manifest.sha256, saved.manifest.sha256);
  assert.match(restored.warnings[0], /expired/); assert.equal(calls.length, 2);
  assert.ok(calls.every(({ options }) => options.redirect === "error" && options.cache === "no-store" && options.signal instanceof AbortSignal));
  const changed = fullCatalogue(); changed.keywords[0][1] = "small rename";
  assert.equal((await writeKeywordBundle(target, changed)).delta.renamed, 1);
  const good = (await readKeywordBundle(target)).manifest.sha256;
  const excessive = fullCatalogue(); excessive.keywords.forEach((row) => { row[1] += " changed"; });
  await assert.rejects(writeKeywordBundle(target, excessive), /exceeds 5%/);
  assert.equal((await readBuildKeywordBundle(target)).manifest.sha256, good);
 });
});

test("a partial or corrupt artifact falls back through staging without damaging the published copy", async () => {
 await inTemporaryDirectory(async (target) => {
  const saved = bundle(fullCatalogue());
  const restored = await restoreKeywordCatalogue({ target, latestRun: async () => 1,
   artifact: async (_id, directory) => { await fs.writeFile(path.join(directory, "manifest.json"), "{}"); throw new Error("partial download"); },
   fetchImpl: publishedFetch(saved),
  });
  assert.equal(restored.source, "published-pages");
  assert.equal((await readKeywordBundle(target)).manifest.sha256, saved.manifest.sha256);
  assert.deepEqual((await fs.readdir(target)).sort(), [saved.manifest.file, "manifest.json"].sort());
 });
});

test("Pages recovery also works when Actions history is unavailable or empty", async () => {
 for (const latestRun of [offline, async () => null]) await inTemporaryDirectory(async (target) => {
  const saved = bundle(fullCatalogue());
  const restored = await restoreKeywordCatalogue({ target, latestRun, artifact: unavailableArtifact, fetchImpl: publishedFetch(saved), optional: true });
  assert.equal(restored.source, "published-pages"); assert.equal(restored.manifest.sha256, saved.manifest.sha256);
 });
});

test("known history, unknown history and HTTP failures cannot silently become first-run bootstrap", async () => {
 for (const [latestRun, fetchImpl] of [[async () => 1, noPublication], [offline, noPublication], [async () => null, offline], [async () => null, async () => new Response("error", { status: 503 })]]) {
  await inTemporaryDirectory(async (target) => {
   await assert.rejects(restoreKeywordCatalogue({ target, optional: true, latestRun, artifact: unavailableArtifact, fetchImpl }), /No validated catalogue/);
   await assert.rejects(fs.access(target), /ENOENT/);
  });
 }
});

test("recovered publication rejects bad checksums, metadata, dates, incomplete content and unsafe filenames", async (t) => {
 const good = bundle(fullCatalogue());
 const stale = fullCatalogue(); stale.sourceDate = new Date(Date.now() - 181 * 86400000).toISOString().slice(0, 10);
 const future = fullCatalogue(); future.sourceDate = new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10);
 const cases = {
  checksum: { ...good, bytes: Buffer.alloc(good.bytes.length, 32) },
  size: { ...good, manifest: { ...good.manifest, bytes: good.bytes.length - 1 } },
  rowCount: { ...good, manifest: { ...good.manifest, rowCount: 1 } },
  sourceDate: { ...good, manifest: { ...good.manifest, sourceDate: "2001-01-01" } },
  filename: { ...good, manifest: { ...good.manifest, file: "../../outside.json" } },
  truncated: bundle(catalogue([[1, "incomplete"]])),
  stale: bundle(stale), future: bundle(future),
 };
 for (const [name, value] of Object.entries(cases)) await t.test(name, async () => {
  await inTemporaryDirectory(async (target) => {
   await assert.rejects(restoreKeywordCatalogue({ target, latestRun: async () => 1, artifact: unavailableArtifact, fetchImpl: publishedFetch(value) }), /No validated catalogue/);
   await assert.rejects(readBuildKeywordBundle(target), /ENOENT/);
  });
 });
});

test("missing payload, invalid JSON and oversized responses fail without retries or destination writes", async () => {
 const good = bundle(fullCatalogue());
 for (const type of ["missing-payload", "invalid-json", "large-manifest", "large-payload"]) await inTemporaryDirectory(async (target) => {
  let calls = 0;
  const fetchImpl = async (url) => {
   calls++;
   if (String(url).endsWith("manifest.json")) {
    if (type === "invalid-json") return new Response("not JSON");
    if (type === "large-manifest") return new Response(" ".repeat(8193));
    return Response.json(good.manifest);
   }
   return type === "missing-payload" ? new Response("missing", { status: 404 }) : new Response(new Uint8Array(8000001));
  };
  await assert.rejects(restoreKeywordCatalogue({ target, latestRun: async () => 1, artifact: unavailableArtifact, fetchImpl }), /No validated catalogue/);
  assert.ok(calls <= 2); await assert.rejects(fs.access(target), /ENOENT/);
 });
});

test("failed refresh retains a valid local copy; rollback, stale data and partial local state still fail", async () => {
 await inTemporaryDirectory(async (target) => {
  const original = fullCatalogue();
  const saved = await writeKeywordBundle(target, original);
  const restored = await restoreKeywordCatalogue({ target, latestRun: offline, artifact: unavailableArtifact, fetchImpl: offline });
  assert.equal(restored.source, "local-last-good"); assert.equal(restored.manifest.sha256, saved.manifest.sha256);
  assert.throws(() => catalogueFromExport(gzipSync('{"id":1,"name":"partial"}'), today));
  const old = fullCatalogue(); old.sourceDate = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  await assert.rejects(restoreKeywordCatalogue({ target, latestRun: async () => 1, artifact: async (_id, directory) => stageArtifact(directory, bundle(old)), fetchImpl: offline }), /newer snapshot/);
  assert.equal((await readKeywordBundle(target)).manifest.sha256, saved.manifest.sha256);
  await fs.unlink(path.join(target, "manifest.json"));
  await assert.rejects(readKeywordBundle(target, { optional: true }), /ENOENT/);
  await assert.rejects(writeKeywordBundle(target, original), /ENOENT/);
  await assert.rejects(restoreKeywordCatalogue({ target, optional: true, latestRun: async () => null, fetchImpl: noPublication }), /ENOENT/);
 });
});
