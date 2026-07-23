import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MATRIX_PATH, serializeCompatibilityMatrix } from "./lib/tmdb-discover-compatibility.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(rootDir, MATRIX_PATH);
const expected = serializeCompatibilityMatrix();
const check = process.argv.includes("--check");

if (check) {
	const actual = fs.readFileSync(outputPath, "utf8");
	if (actual !== expected) {
		throw new Error(`${MATRIX_PATH} is stale. Run node scripts/generate-tmdb-discover-compatibility.mjs.`);
	}
	console.log(`${MATRIX_PATH} is reproducible.`);
} else {
	fs.mkdirSync(path.dirname(outputPath), { recursive: true });
	fs.writeFileSync(outputPath, expected, "utf8");
	console.log(`Wrote ${MATRIX_PATH}.`);
}
