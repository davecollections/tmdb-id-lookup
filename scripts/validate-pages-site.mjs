import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { extractTmdbProxyBaseUrl } from "../builder/build-config.js";
import { isPagesPublicFilePath, normalizePagesPublicPath, pagesPublicPathContract } from "./pages-public-paths.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stagingDir = path.join(rootDir, ".pages-site");
const stagedBuilderDir = path.join(stagingDir, "builder");
const requiredFiles = [
	...pagesPublicPathContract.v1RootFiles,
	"css/styles.css",
	"css/mobile-fixes.css",
	"js/config.js",
	"js/app.js",
	"js/artwork-runtime.mjs",
	"js/artwork-runtime-v1.mjs",
	"builder/index.html",
];
const assetExtension = /\.(?:avif|css|gif|ico|jpe?g|js|png|svg|webp|woff2?)(?:[?#].*)?$/i;
const repositoryOnlyPrefixes = [
	".github/",
	"builder/src/",
	"cloudflare-worker/",
	"docs/",
	"manual-tests/",
	"scripts/",
	"tests/",
];
const repositoryOnlyFiles = new Set([
	".gitattributes",
	".gitignore",
	"AGENTS.md",
	"README.md",
	"builder/package-lock.json",
	"builder/package.json",
	"builder/vite.config.js",
]);
const issue38EvidenceFiles = [
	"manual-tests/nuvio-desktop/addon-projection-migration/builder-migrated-input.json",
	"manual-tests/nuvio-desktop/addon-projection-migration/generation-report.json",
	"manual-tests/nuvio-desktop/addon-projection-migration/nuvio-desktop-export.json",
	"manual-tests/nuvio-desktop/addon-projection-migration/round-trip-report.json",
];
const issue38OwnerExportSha256 = "6390428217959af42572038fdd818def5fc9136a98285b6e879504826a0aa7bc";
const configuredTmdbProxyOrigin = extractTmdbProxyBaseUrl(fs.readFileSync(path.join(rootDir, "js", "config.js"), "utf8"));
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

function stagedRelative(file) {
	return path.relative(stagingDir, file).replaceAll("\\", "/");
}

function assertFile(file) {
	if (!fs.statSync(file, { throwIfNoEntry: false })?.isFile()) {
		failures.push(`Missing required Pages artifact file: ${relative(file)}`);
	}
}

function getHtmlAttribute(tag, attribute) {
	const match = tag.match(new RegExp(`\\b${attribute}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
	return match?.[1] ?? match?.[2] ?? match?.[3] ?? "";
}

for (const file of requiredFiles) {
	assertFile(path.join(stagingDir, file));
}

const stagedFiles = fs.statSync(stagingDir, { throwIfNoEntry: false })?.isDirectory() ? listFiles(stagingDir) : [];

for (const file of stagedFiles) {
	const artifactPath = stagedRelative(file);
	let normalizedPath;

	try {
		normalizedPath = normalizePagesPublicPath(artifactPath);
	} catch (error) {
		failures.push(`Invalid Pages artifact path ${artifactPath}: ${error.message}`);
		continue;
	}

	if (!isPagesPublicFilePath(normalizedPath)) {
		failures.push(`Unexpected file outside the Pages public-path contract: ${normalizedPath}`);
	}

	if (
		repositoryOnlyFiles.has(normalizedPath) ||
		repositoryOnlyPrefixes.some((prefix) => normalizedPath.startsWith(prefix))
	) {
		failures.push(`Repository-only file is present in the Pages artifact: ${normalizedPath}`);
	}

	if (/\.(?:md|mjs)$/i.test(normalizedPath) && !isPagesPublicFilePath(normalizedPath)) {
		failures.push(`Repository documentation or source is present in the Pages artifact: ${normalizedPath}`);
	}

	const contents = fs.readFileSync(file);
	const digest = crypto.createHash("sha256").update(contents).digest("hex");

	if (digest === issue38OwnerExportSha256) {
		failures.push(`Issue #38 owner export bytes are present in the Pages artifact as: ${normalizedPath}`);
	}

	if (contents.length <= 2_000_000 && contents.toString("utf8").toLowerCase().includes(issue38OwnerExportSha256)) {
		failures.push(`Issue #38 owner export hash is present in the Pages artifact as: ${normalizedPath}`);
	}
}

for (const evidenceFile of issue38EvidenceFiles) {
	if (fs.existsSync(path.join(stagingDir, ...evidenceFile.split("/")))) {
		failures.push(`Issue #38 manual evidence must not be deployed: ${evidenceFile}`);
	}
}

if (fs.existsSync(path.join(stagedBuilderDir, "dist"))) {
	failures.push("Builder output is nested at .pages-site/builder/dist instead of .pages-site/builder.");
}

const stagedBuilderEntry = path.join(stagedBuilderDir, "index.html");

if (fs.statSync(stagedBuilderEntry, { throwIfNoEntry: false })?.isFile()) {
	const builderHtml = fs.readFileSync(stagedBuilderEntry, "utf8");
	const robotsDirectives = [...builderHtml.matchAll(/<meta\b[^>]*>/gi)]
		.filter((match) => getHtmlAttribute(match[0], "name").toLowerCase() === "robots")
		.flatMap((match) => getHtmlAttribute(match[0], "content").toLowerCase().split(/[\s,]+/))
		.filter(Boolean);

	if (!robotsDirectives.includes("noindex") || !robotsDirectives.includes("nofollow")) {
		failures.push("The staged builder entry must contain a robots directive equivalent to: noindex, nofollow.");
	}
}

if (fs.statSync(stagedBuilderDir, { throwIfNoEntry: false })?.isDirectory()) {
	const builderFiles = stagedFiles.filter((file) => file.startsWith(`${stagedBuilderDir}${path.sep}`));
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

	if (!builderJavaScript.includes("Dingo's Collection Builder")) {
		failures.push("The generated builder JavaScript does not contain the builder product marker.");
	}

	if (!builderJavaScript.includes("data-builder-welcome")) {
		failures.push("The generated builder JavaScript does not contain the builder welcome marker.");
	}

	if (!builderJavaScript.includes("data-builder-shell")) {
		failures.push("The generated builder JavaScript does not contain the builder shell marker.");
	}

	if (!builderJavaScript.includes("data-node-editor")) {
		failures.push("The generated builder JavaScript does not contain the node editor marker.");
	}

	if (!builderJavaScript.includes(configuredTmdbProxyOrigin)) {
		failures.push("The generated builder JavaScript does not contain the configured TMDB proxy origin.");
	}

	if (builderJavaScript.includes("TMDB_BEARER_TOKEN")) {
		failures.push("The generated builder JavaScript contains a TMDB bearer-token identifier.");
	}

	const repositoryPaths = [rootDir, rootDir.replaceAll("\\", "/")];
	if (repositoryPaths.some((repositoryPath) => builderJavaScript.includes(repositoryPath))) {
		failures.push("The generated builder JavaScript contains a local repository path.");
	}

	for (const marker of ["data-action", "return-builder-home", "create-collection-empty", "create-folder-empty"]) {
		if (!builderJavaScript.includes(marker)) {
			failures.push(`The generated builder JavaScript is missing the required workspace marker: ${marker}.`);
		}
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
