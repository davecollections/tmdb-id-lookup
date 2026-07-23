import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MATRIX_PATH, serializeCompatibilityMatrix } from "./lib/tmdb-discover-compatibility.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(rootDir, "manual-tests", "tmdb-discover", "fixture-manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const completeAuditFixture = manifest.completeAuditFixture.orderedComponentPaths.flatMap((relativePath) => (
	JSON.parse(fs.readFileSync(path.join(rootDir, "manual-tests", "tmdb-discover", relativePath), "utf8"))
));
const outputs = [
	{
		relativePath: MATRIX_PATH,
		expected: serializeCompatibilityMatrix(),
	},
	{
		relativePath: `manual-tests/tmdb-discover/${manifest.completeAuditFixture.path}`,
		expected: `${JSON.stringify(completeAuditFixture, null, 2)}\n`,
	},
];
const check = process.argv.includes("--check");
const normalizeLineEndings = (value) => value.replaceAll("\r\n", "\n");

if (check) {
	for (const output of outputs) {
		const actual = fs.readFileSync(path.join(rootDir, output.relativePath), "utf8");
		if (normalizeLineEndings(actual) !== normalizeLineEndings(output.expected)) {
			throw new Error(`${output.relativePath} is stale. Run node scripts/generate-tmdb-discover-compatibility.mjs.`);
		}
		console.log(`${output.relativePath} is reproducible.`);
	}
} else {
	for (const output of outputs) {
		const outputPath = path.join(rootDir, output.relativePath);
		fs.mkdirSync(path.dirname(outputPath), { recursive: true });
		fs.writeFileSync(outputPath, output.expected, "utf8");
		console.log(`Wrote ${output.relativePath}.`);
	}
}
