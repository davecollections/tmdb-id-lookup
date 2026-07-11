import assert from "node:assert/strict";
import test from "node:test";

import {
	isCompiledBuilderFilePath,
	isPagesPublicFilePath,
	isV1PublicFilePath,
	normalizePagesPublicPath,
	pagesPublicPathContract,
} from "../scripts/pages-public-paths.mjs";

test("the v1 contract exposes only the reviewed root files and directories", () => {
	assert.deepEqual(pagesPublicPathContract.v1RootFiles, ["index.html", "robots.txt", "sitemap.xml"]);
	assert.deepEqual(pagesPublicPathContract.v1Directories, ["css", "data", "js"]);
	assert.equal(pagesPublicPathContract.builderDirectory, "builder");
});

test("reviewed v1 root files are public", () => {
	for (const file of ["index.html", "robots.txt", "sitemap.xml"]) {
		assert.equal(isV1PublicFilePath(file), true);
		assert.equal(isPagesPublicFilePath(file), true);
	}
});

test("files beneath reviewed v1 public directories are public", () => {
	for (const file of ["css/styles.css", "data/companies.min.json", "js/app.js"]) {
		assert.equal(isV1PublicFilePath(file), true);
		assert.equal(isPagesPublicFilePath(file), true);
	}
});

test("unrelated root files and similarly prefixed paths are rejected", () => {
	for (const file of ["README.md", ".gitattributes", "index.html.backup", "css-copy/styles.css", "javascript/app.js"]) {
		assert.equal(isV1PublicFilePath(file), false);
		assert.equal(isPagesPublicFilePath(file), false);
	}
});

test("repository-only directories are rejected from the v1 artifact", () => {
	for (const file of [
		".github/workflows/deploy-pages.yml",
		"manual-tests/nuvio-desktop/evidence.json",
		"tests/pages-public-paths.test.mjs",
		"docs/v2/BUILDER_KNOWLEDGE.md",
		"scripts/prepare-pages-site.mjs",
		"cloudflare-worker/tmdb-proxy.js",
	]) {
		assert.equal(isV1PublicFilePath(file), false);
		assert.equal(isPagesPublicFilePath(file), false);
	}
});

test("builder source is rejected by the v1 selector", () => {
	for (const file of ["builder/src/main.jsx", "builder/package.json", "builder/vite.config.js"]) {
		assert.equal(isV1PublicFilePath(file), false);
	}
});

test("compiled builder files are accepted only through the dedicated builder path", () => {
	for (const file of ["builder/index.html", "builder/assets/index-abc123.js", "builder/assets/deployment-mark.svg"]) {
		assert.equal(isCompiledBuilderFilePath(file), true);
		assert.equal(isPagesPublicFilePath(file), true);
		assert.equal(isV1PublicFilePath(file), false);
	}
	assert.equal(isCompiledBuilderFilePath("builder"), false);
	assert.equal(isCompiledBuilderFilePath("builder-output/index.html"), false);
});

test("Windows separators normalize to the same portable paths as POSIX separators", () => {
	assert.equal(normalizePagesPublicPath("css\\styles.css"), "css/styles.css");
	assert.equal(normalizePagesPublicPath("builder\\assets\\index.js"), "builder/assets/index.js");
	assert.equal(isV1PublicFilePath("data\\genres.csv"), true);
	assert.equal(isCompiledBuilderFilePath("builder\\index.html"), true);
});

test("absolute and drive-relative paths are rejected", () => {
	for (const file of ["/css/styles.css", "C:\\site\\index.html", "C:index.html", "\\\\server\\share\\index.html"]) {
		assert.throws(() => normalizePagesPublicPath(file), /must be relative/);
		assert.equal(isPagesPublicFilePath(file), false);
	}
});

test("traversal, current, and empty path segments are rejected", () => {
	for (const file of ["../index.html", "css/../README.md", "./index.html", "css//styles.css", "css/"]) {
		assert.throws(() => normalizePagesPublicPath(file), /must not contain/);
		assert.equal(isPagesPublicFilePath(file), false);
	}
});

test("empty, non-string, and null-byte values are rejected", () => {
	assert.throws(() => normalizePagesPublicPath(""), /non-empty strings/);
	assert.throws(() => normalizePagesPublicPath(null), /non-empty strings/);
	assert.throws(() => normalizePagesPublicPath("js/evil\0.js"), /null bytes/);
	assert.equal(isPagesPublicFilePath(""), false);
});
