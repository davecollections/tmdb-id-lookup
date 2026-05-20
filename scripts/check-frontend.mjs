import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function listFiles(dir, extension) {
	return fs
		.readdirSync(path.join(rootDir, dir), { withFileTypes: true })
		.filter((entry) => entry.isFile() && entry.name.endsWith(extension))
		.map((entry) => path.join(dir, entry.name));
}

function checkJavaScriptSyntax() {
	for (const file of listFiles("js", ".js")) {
		try {
			execFileSync(process.execPath, ["--check", path.join(rootDir, file)], { stdio: "pipe" });
		} catch (error) {
			failures.push(`${file}: JavaScript syntax check failed\n${error.stderr || error.message}`);
		}
	}
}

function checkDataJson() {
	for (const file of listFiles("data", ".json")) {
		try {
			JSON.parse(fs.readFileSync(path.join(rootDir, file), "utf8"));
		} catch (error) {
			failures.push(`${file}: invalid JSON (${error.message})`);
		}
	}
}

function checkDuplicateHtmlIds() {
	const html = fs.readFileSync(path.join(rootDir, "index.html"), "utf8");
	const ids = [...html.matchAll(/id="([^"]+)"/g)].map((match) => match[1]);
	const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
	const uniqueDuplicateIds = [...new Set(duplicateIds)];

	if (uniqueDuplicateIds.length) {
		failures.push(`index.html: duplicate IDs found: ${uniqueDuplicateIds.join(", ")}`);
	}
}

function checkUnsafeFrontendPatterns() {
	const patterns = [/\.innerHTML\b/, /\.outerHTML\b/, /\.insertAdjacentHTML\b/, /\beval\s*\(/, /\bnew Function\b/];

	for (const file of listFiles("js", ".js")) {
		const source = fs.readFileSync(path.join(rootDir, file), "utf8");

		for (const pattern of patterns) {
			if (pattern.test(source)) {
				failures.push(`${file}: contains ${pattern}`);
			}
		}
	}
}

checkJavaScriptSyntax();
checkDataJson();
checkDuplicateHtmlIds();
checkUnsafeFrontendPatterns();

if (failures.length) {
	console.error(failures.join("\n\n"));
	process.exit(1);
}

console.log("Frontend checks passed.");
