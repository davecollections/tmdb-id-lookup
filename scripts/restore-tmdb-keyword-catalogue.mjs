import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { readKeywordBundle, validateKeywordManifest, writeKeywordBundle } from "./lib/tmdb-keyword-catalogue.mjs";

// The existing Pages publication is the durable last-good copy. No new service,
// credentials or TMDB requests are needed to recover an expired Actions artifact.
export const publishedCatalogueUrl = "https://davecollections.github.io/tmdb-id-lookup/builder/data/discover/";

async function boundedResponse(response, limit) {
 if (!response.ok) throw new Error("Published catalogue returned HTTP " + response.status + ".");
 const chunks = [];
 let size = 0;
 for await (const chunk of response.body) {
  size += chunk.length;
  if (size > limit) throw new Error("Published catalogue exceeds the download safety bound.");
  chunks.push(chunk);
 }
 return Buffer.concat(chunks);
}

async function readPublishedBundle(directory, fetchImpl) {
 const request = (file) => fetchImpl(new URL(file, publishedCatalogueUrl), {
  redirect: "error", cache: "no-store", signal: AbortSignal.timeout(20000),
 });
 const response = await request("manifest.json");
 // Only a definite absent manifest can qualify a genuine first-run bootstrap.
 if (response.status === 404) { await response.body?.cancel(); return null; }
 const manifestBytes = await boundedResponse(response, 8192);
 const manifest = validateKeywordManifest(JSON.parse(manifestBytes));
 const bytes = await boundedResponse(await request(manifest.file), 8000000);
 await fs.mkdir(directory);
 await fs.writeFile(path.join(directory, "manifest.json"), manifestBytes);
 await fs.writeFile(path.join(directory, manifest.file), bytes);
 return readKeywordBundle(directory);
}

function findLatestRun() {
 const runs = JSON.parse(execFileSync("gh", ["run", "list", "--repo", process.env.GITHUB_REPOSITORY,
  "--workflow", "refresh-tmdb-keywords.yml", "--branch", "main", "--status", "success",
  "--limit", "1", "--json", "databaseId"], { encoding: "utf8" }));
 if (!Array.isArray(runs) || (runs.length && !Number.isSafeInteger(runs[0].databaseId))) throw new Error("Invalid Actions run response.");
 return runs[0]?.databaseId ?? null;
}

function downloadArtifact(runId, directory) {
 execFileSync("gh", ["run", "download", String(runId), "--repo", process.env.GITHUB_REPOSITORY,
  "--name", "tmdb-keyword-catalogue", "--dir", directory], { stdio: "inherit" });
}

// Dependency injection is limited to deterministic maintenance failure tests.
// Both real callers use the same strict restoration and publication validation.
export async function restoreKeywordCatalogue({
 target = path.resolve("builder/public/data/discover"), optional = false,
 latestRun = findLatestRun, artifact = downloadArtifact, fetchImpl = fetch,
} = {}) {
 const local = await readKeywordBundle(target, { optional: true });
 const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "tmdb-keyword-restore-"));
 const warnings = [];
 let runId, candidate, source;
 try {
  try {
   runId = await latestRun();
   if (runId !== null) {
    const directory = path.join(temporary, "artifact");
    await fs.mkdir(directory);
    await artifact(runId, directory);
    candidate = await readKeywordBundle(directory);
    source = "actions-artifact";
   }
  } catch (error) { warnings.push("Actions restore: " + error.message); }
  let publishedAbsent = false;
  if (!candidate) {
   try {
    candidate = await readPublishedBundle(path.join(temporary, "published"), fetchImpl);
    publishedAbsent = candidate === null;
    if (candidate) source = "published-pages";
   } catch (error) { warnings.push("Pages restore: " + error.message); }
  }
  if (!candidate && local) { candidate = local; source = "local-last-good"; }
  if (!candidate) {
   if (optional && runId === null && publishedAbsent) return { source: "first-run-bootstrap", warnings };
   throw new Error("No validated catalogue could be restored. Keep the existing publication. " +
    (runId === null && publishedAbsent ? "Run Refresh TMDB Keyword Catalogue on main to bootstrap it. " : "Restore a validated last-good bundle before retrying. ") + warnings.join(" "));
  }
  // Stage and validate before touching the destination. Reuse the atomic writer,
  // including its newer-date and 5% change guards against any existing local copy.
  const written = await writeKeywordBundle(target, candidate.catalogue);
  return { source, runId, manifest: written.manifest, warnings };
 } finally { await fs.rm(temporary, { recursive: true, force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
 console.log(JSON.stringify(await restoreKeywordCatalogue({ optional: process.argv.includes("--optional") }), null, 2));
}
