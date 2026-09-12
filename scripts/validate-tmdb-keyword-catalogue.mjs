import { readKeywordBundle } from "./lib/tmdb-keyword-catalogue.mjs";
const directory = process.argv[2] ?? "builder/public/data/discover";
const result = await readKeywordBundle(directory);
console.log("Validated " + result.manifest.rowCount + " keyword names from " + result.manifest.sourceDate + ".");
