import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stagingDir = path.join(rootDir, ".pages-site");
const builderDistDir = path.join(rootDir, "builder", "dist");
const builderStageDir = path.join(stagingDir, "builder");
const requiredV1Files = ["index.html", "css/styles.css", "css/mobile-fixes.css", "js/config.js", "js/app.js"];

function assertFile(file, label) {
	if (!fs.statSync(file, { throwIfNoEntry: false })?.isFile()) {
		throw new Error(`${label} is missing: ${path.relative(rootDir, file)}`);
	}
}

for (const file of requiredV1Files) {
	assertFile(path.join(rootDir, file), "Required v1 file");
}

assertFile(path.join(builderDistDir, "index.html"), "Built builder entry");

const trackedFiles = execFileSync("git", ["ls-files", "-z"], {
	cwd: rootDir,
	encoding: "utf8",
})
	.split("\0")
	.filter(Boolean);

fs.rmSync(stagingDir, { recursive: true, force: true });
fs.mkdirSync(stagingDir, { recursive: true });

for (const relativeFile of trackedFiles) {
	const portablePath = relativeFile.replaceAll("\\", "/");

	if (portablePath === ".gitignore" || portablePath.startsWith(".github/") || portablePath.startsWith("builder/")) {
		continue;
	}

	const source = path.join(rootDir, relativeFile);
	const destination = path.join(stagingDir, relativeFile);

	assertFile(source, "Tracked deployment file");
	fs.mkdirSync(path.dirname(destination), { recursive: true });
	fs.copyFileSync(source, destination);
}

fs.cpSync(builderDistDir, builderStageDir, { recursive: true });

execFileSync(process.execPath, [path.join(rootDir, "scripts", "validate-pages-site.mjs")], {
	cwd: rootDir,
	stdio: "inherit",
});

console.log(`Prepared combined Pages artifact at ${path.relative(rootDir, stagingDir)}.`);
