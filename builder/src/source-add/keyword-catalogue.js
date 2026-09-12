import { digestKeywordBytes } from "./keyword-sha256.js";
export const KEYWORD_CATALOGUE_SCHEMA = 1;
export function validateKeywordCatalogue(value, { minimumRows = 80000, maximumRows = 150000 } = {}) {
 if (value?.schemaVersion !== KEYWORD_CATALOGUE_SCHEMA || !/^\d{4}-\d{2}-\d{2}$/.test(value.sourceDate) || !Array.isArray(value.keywords) || value.keywords.length < minimumRows || value.keywords.length > maximumRows) throw new Error("The keyword catalogue is incomplete or unsupported.");
 const date = new Date(value.sourceDate + "T00:00:00Z");
 if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value.sourceDate || date.getTime() > Date.now() + 86400000) throw new Error("The catalogue date is invalid.");
 const seen = new Set();
 for (const row of value.keywords) {
  if (!Array.isArray(row) || row.length !== 2 || !Number.isSafeInteger(row[0]) || row[0] < 1 || row[0] > 2147483647 || seen.has(row[0]) || typeof row[1] !== "string" || !row[1].trim() || row[1].length > 1000) throw new Error("The keyword catalogue contains an invalid entry.");
  seen.add(row[0]);
 }
 return value;
}
export function createKeywordCatalogueLoader({ fetchImpl = fetch, digest = digestKeywordBytes, now = Date.now, validate = validateKeywordCatalogue } = {}) {
 let lastGood = null, inFlight = null, checkedAt = 0, lastWarning = null;
 async function load(baseUrl, { force = false } = {}) {
  if (lastGood && now() - new Date(lastGood.sourceDate + "T00:00:00Z").getTime() > 180 * 86400000) lastGood = null;
  if (lastGood && !force && now() - checkedAt < 86400000) return { ...lastGood, stale: Boolean(lastWarning), ...(lastWarning ? { warning: lastWarning } : {}) };
  if (inFlight) return inFlight;
  inFlight = (async () => {
   try {
    const manifestResponse = await fetchImpl(new URL("manifest.json", baseUrl), { cache: "no-cache", signal: AbortSignal.timeout(20000) });
    if (!manifestResponse.ok) throw new Error("Keyword catalogue is unavailable.");
    const manifest = await manifestResponse.json();
    if (manifest.schemaVersion !== 1 || !/^[a-f0-9]{64}$/.test(manifest.sha256) || manifest.file !== "keywords-" + manifest.sha256 + ".json" || !Number.isSafeInteger(manifest.rowCount)) throw new Error("Keyword catalogue manifest is invalid.");
    if (lastGood?.sha256 === manifest.sha256) {
     if (manifest.sourceDate !== lastGood.sourceDate || manifest.rowCount !== lastGood.catalogue.keywords.length || manifest.bytes !== lastGood.bytes) throw new Error("Keyword catalogue version mismatch.");
     checkedAt = now(); lastWarning = null; return { ...lastGood, stale: false };
    }
    const response = await fetchImpl(new URL(manifest.file, baseUrl), { cache: "default", signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error("Keyword catalogue download failed.");
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > 8000000 || bytes.byteLength !== manifest.bytes || await digest(bytes) !== manifest.sha256) throw new Error("Keyword catalogue integrity check failed.");
    const catalogue = validate(JSON.parse(new TextDecoder().decode(bytes)));
    if (catalogue.sourceDate !== manifest.sourceDate || catalogue.keywords.length !== manifest.rowCount) throw new Error("Keyword catalogue version mismatch.");
    if (now() - new Date(catalogue.sourceDate + "T00:00:00Z").getTime() > 180 * 86400000) throw new Error("The catalogue needs a refresh before it can be used.");
    lastGood = { catalogue, sha256: manifest.sha256, sourceDate: catalogue.sourceDate, bytes: bytes.byteLength };
    checkedAt = now(); lastWarning = null;
    return { ...lastGood, stale: false };
   } catch (error) {
    lastWarning = error.message;
    if (lastGood && now() - new Date(lastGood.sourceDate + "T00:00:00Z").getTime() <= 180 * 86400000) return { ...lastGood, stale: true, warning: error.message };
    throw error;
   } finally { inFlight = null; }
  })();
  return inFlight;
 }
 return { load, peek: () => lastGood };
}
