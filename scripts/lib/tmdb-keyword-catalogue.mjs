import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { gunzipSync } from "node:zlib";
import { validateKeywordCatalogue } from "../../builder/src/source-add/keyword-catalogue.js";
export const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
export function keywordExportDate(now = new Date()) {
 const date = new Date(now);
 if (date.getUTCHours() < 8) date.setUTCDate(date.getUTCDate() - 1);
 return date.toISOString().slice(0, 10);
}
export function catalogueFromExport(bytes, sourceDate) {
 if (bytes.length > 4000000) throw new Error("Keyword download exceeds the safety bound.");
 const text = gunzipSync(bytes, { maxOutputLength: 8000000 }).toString("utf8");
 const keywords = text.trim().split(/\r?\n/).map((line) => { const value = JSON.parse(line); return [value.id, value.name]; });
 return validateKeywordCatalogue({ schemaVersion: 1, sourceDate, keywords });
}
export function keywordCatalogueDelta(previous, next) {
 const before = new Map(previous.keywords), after = new Map(next.keywords);
 const added = [...after.keys()].filter((id) => !before.has(id));
 const removed = [...before.keys()].filter((id) => !after.has(id));
 const renamed = [...after.keys()].filter((id) => before.has(id) && before.get(id) !== after.get(id));
 return { added: added.length, removed: removed.length, renamed: renamed.length, changedFraction: (added.length + removed.length + renamed.length) / before.size };
}
export function validateKeywordManifest(manifest) {
 if (!manifest || manifest.schemaVersion !== 1 || !/^[a-f0-9]{64}$/.test(manifest.sha256) || manifest.file !== "keywords-" + manifest.sha256 + ".json") throw new Error("Invalid catalogue manifest.");
 return manifest;
}
export async function readKeywordBundle(directory, { optional = false } = {}) {
 let manifest;
 try { manifest = JSON.parse(await fs.readFile(path.join(directory, "manifest.json"), "utf8")); }
 catch (error) {
  if (optional && error.code === "ENOENT") {
   const entries = await fs.readdir(directory).catch((readError) => { if (readError.code === "ENOENT") return []; throw readError; });
   if (!entries.length) return null;
  }
  throw error;
 }
 validateKeywordManifest(manifest);
 const bytes = await fs.readFile(path.join(directory, manifest.file));
 if (bytes.length !== manifest.bytes || sha256(bytes) !== manifest.sha256) throw new Error("Catalogue checksum/size mismatch.");
 const catalogue = validateKeywordCatalogue(JSON.parse(bytes));
 if (catalogue.sourceDate !== manifest.sourceDate || catalogue.keywords.length !== manifest.rowCount) throw new Error("Catalogue manifest and payload differ.");
 if (Date.now() - new Date(catalogue.sourceDate + "T00:00:00Z").getTime() > 180 * 86400000) throw new Error("Catalogue is too old to publish.");
 return { manifest, catalogue, bytes };
}
// A clean code-review checkout has no generated catalogue. Publication remains
// strict; even code-only validation rejects a present but incomplete bundle.
export async function readBuildKeywordBundle(directory, { codeOnly = false } = {}) {
 if (codeOnly) {
  try { await fs.access(directory); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
 }
 return readKeywordBundle(directory);
}
export async function writeKeywordBundle(directory, catalogue) {
 validateKeywordCatalogue(catalogue);
 const previous = await readKeywordBundle(directory, { optional: true });
 if (previous && catalogue.sourceDate < previous.catalogue.sourceDate) throw new Error("A keyword refresh cannot replace a newer snapshot.");
 const delta = previous ? keywordCatalogueDelta(previous.catalogue, catalogue) : null;
 if (delta && delta.changedFraction > 0.05) throw new Error("Keyword change exceeds 5%; keep the last good copy for review.");
 const bytes = Buffer.from(JSON.stringify(catalogue));
 const hash = sha256(bytes), file = "keywords-" + hash + ".json";
 const manifest = { schemaVersion: 1, sourceDate: catalogue.sourceDate, rowCount: catalogue.keywords.length, bytes: bytes.length, sha256: hash, file };
 await fs.mkdir(directory, { recursive: true });
 await fs.writeFile(path.join(directory, file), bytes);
 const temporary = path.join(directory, "manifest-" + crypto.randomUUID() + ".tmp");
 await fs.writeFile(temporary, JSON.stringify(manifest));
 await fs.rename(temporary, path.join(directory, "manifest.json"));
 // Only generated payload names in this dedicated directory may be retired.
 for (const name of await fs.readdir(directory)) if (/^keywords-[a-f0-9]{64}\.json$/.test(name) && name !== file) await fs.unlink(path.join(directory, name));
 return { manifest, delta };
}
