import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stagingDir = path.join(rootDir, ".pages-site");
const stagedBuilderDir = path.join(stagingDir, "builder");
const requiredFiles = [
	"index.html",
	"css/styles.css",
	"css/mobile-fixes.css",
	"js/config.js",
	"js/app.js",
	"builder/index.html",
];
const assetExtension = /\.(?:avif|css|gif|ico|jpe?g|js|png|svg|webp|woff2?)(?:[?#].*)?$/i;
const failures = [];

function listFiles(directory) {
	return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const entryPath = path.join(directory, entry.name);
		return entry.isDirectory() ? listFiles(entryPath) : [entryPath];
	});
}

function relative(file) {
	return path.relative(rootDir, file).replaceAll("\\", "/");
}

function assertFile(file) {
	if (!fs.statSync(file, { throwIfNoEntry: false })?.isFile()) {
		failures.push(`Missing required Pages artifact file: ${relative(file)}`);
	}
}

for (const file of requiredFiles) {
	assertFile(path.join(stagingDir, file));
}

if (fs.existsSync(path.join(stagedBuilderDir, "dist"))) {
	failures.push("Builder output is nested at .pages-site/builder/dist instead of .pages-site/builder.");
}

if (fs.statSync(stagedBuilderDir, { throwIfNoEntry: false })?.isDirectory()) {
	const builderFiles = listFiles(stagedBuilderDir);
	const builderAssets = builderFiles.filter((file) => path.dirname(file).startsWith(path.join(stagedBuilderDir, "assets")));
	const scripts = builderAssets.filter((file) => file.endsWith(".js"));
	const styles = builderAssets.filter((file) => file.endsWith(".css"));
	const importedAssets = builderAssets.filter((file) => !file.endsWith(".js") && !file.endsWith(".css"));

	if (!scripts.length) failures.push("The staged builder has no generated JavaScript asset.");
	if (!styles.length) failures.push("The staged builder has no generated CSS asset.");
	if (!importedAssets.length) failures.push("The staged builder has no generated imported local asset.");

	const textFiles = builderFiles.filter((file) => /\.(?:css|html|js)$/.test(file));
	const assetReferences = [];

	for (const file of textFiles) {
		const source = fs.readFileSync(file, "utf8");
		const references = [
			...[...source.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map((match) => match[1]),
			...[...source.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map((match) => match[1]),
			...[...source.matchAll(/["'`](\.\.?\/[^"'`\s]+)["'`]/g)].map((match) => match[1]),
			...[...source.matchAll(/["'`]([^"'`:/?#\s]+\.(?:avif|css|gif|ico|jpe?g|js|png|svg|webp|woff2?)(?:[?#][^"'`\s]*)?)["'`]/gi)].map(
				(match) => match[1],
			),
		].filter((reference) => assetExtension.test(reference));

		for (const reference of references) {
			assetReferences.push({ file, reference });
		}
	}

	for (const { file, reference } of assetReferences) {
		const cleanReference = reference.split(/[?#]/, 1)[0];

		if (cleanReference.startsWith("/assets/")) {
			failures.push(`Builder asset incorrectly points to the domain root in ${relative(file)}: ${reference}`);
			continue;
		}

		if (cleanReference.startsWith("/")) {
			failures.push(`Builder asset is not portable beneath /builder/ in ${relative(file)}: ${reference}`);
			continue;
		}

		const resolved = path.resolve(path.dirname(file), cleanReference);
		const builderPrefix = `${path.resolve(stagedBuilderDir)}${path.sep}`;

		if (!resolved.startsWith(builderPrefix)) {
			failures.push(`Builder asset escapes the builder directory in ${relative(file)}: ${reference}`);
			continue;
		}

		if (!fs.statSync(resolved, { throwIfNoEntry: false })?.isFile()) {
			failures.push(`Referenced builder asset is missing in ${relative(file)}: ${reference}`);
		}
	}

	const builderJavaScript = scripts.map((file) => fs.readFileSync(file, "utf8")).join("\n");

	if (!builderJavaScript.includes("Deployment coexistence test")) {
		failures.push("The generated builder JavaScript does not contain the deployment-test marker.");
	}

	if (!/\bhref\s*:\s*(["'`])\.\.\/\1/.test(builderJavaScript) || !builderJavaScript.includes("data-root-link")) {
		failures.push("The generated builder link back to the root application is missing or incorrect.");
	}
}

if (failures.length) {
	console.error(failures.join("\n"));
	process.exit(1);
}

console.log("Combined Pages artifact validation passed.");
