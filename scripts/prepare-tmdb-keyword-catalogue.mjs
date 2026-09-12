import fs from "node:fs/promises";
import path from "node:path";
import { catalogueFromExport, keywordExportDate, writeKeywordBundle } from "./lib/tmdb-keyword-catalogue.mjs";
import { createTmdbRequestClient } from "./lib/tmdb-maintenance-request.mjs";
const output = path.resolve("builder/public/data/discover");
const fromExport = process.argv.find((a) => a.startsWith("--from-export="))?.slice(14);
const sourceDate = fromExport ? process.argv.find((a) => a.startsWith("--source-date="))?.slice(14) : keywordExportDate();
if (!/^\d{4}-\d{2}-\d{2}$/.test(sourceDate ?? "")) throw new Error("An actual export source date is required.");
let client, bytes;
try {
 if (fromExport) bytes = await fs.readFile(fromExport);
 else {
  client = await createTmdbRequestClient({ receiptPath: process.env.TMDB_RESERVATION_PATH, reservationId: process.env.TMDB_RESERVATION_ID, reservationSha256: process.env.TMDB_RESERVATION_SHA256, allocationKey: "keyword-export", usagePath: process.env.TMDB_USAGE_PATH, job: "keyword-export", maxAttempts: 1 });
  const [year, month, day] = sourceDate.split("-");
  const { response } = await client.request("https://files.tmdb.org/p/exports/keyword_ids_" + month + "_" + day + "_" + year + ".json.gz", { auth: false, accept: "application/gzip", maxAttempts: 1 });
  if (!response.ok) throw new Error("The daily keyword export is unavailable: " + response.status);
  bytes = Buffer.from(await response.arrayBuffer());
 }
 const result = await writeKeywordBundle(output, catalogueFromExport(bytes, sourceDate));
 console.log(JSON.stringify(result));
} finally { if (client) await client.writeUsage(); }
