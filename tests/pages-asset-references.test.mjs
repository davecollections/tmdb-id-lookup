import assert from "node:assert/strict";
import test from "node:test";

import { GENRE_ARTWORK_ROLE_FILES } from "../js/genre-artwork.mjs";
import { collectPagesAssetReferences } from "../scripts/pages-asset-references.mjs";

function references(source) {
	return [...new Set(collectPagesAssetReferences(source))];
}

test("Genre role filename metadata is not a local bundled asset reference", () => {
	const source = `const roles = ${JSON.stringify(GENRE_ARTWORK_ROLE_FILES)};`;
	assert.deepEqual(references(source), []);
});

test("HTML and CSS asset references retain bare, relative, query and fragment paths", () => {
	assert.deepEqual(references('<script src="./assets/index.js"></script><link href="assets/index.css?v=1"><img src="logo.svg#mark">'), [
		"./assets/index.js", "assets/index.css?v=1", "logo.svg#mark",
	]);
	assert.deepEqual(references('a{background:url(cover.webp)}b{src:url("font.woff2?v=1")}'), ["cover.webp", "font.woff2?v=1"]);
});

test("relative module imports and dynamic chunks remain checked", () => {
	assert.deepEqual(references('import "./entry.js"; import(`./lazy.js?v=1`); const path = "../image.png";'), [
		"./entry.js", "./lazy.js?v=1", "../image.png",
	]);
});

test("bare import.meta.url asset references remain checked for every literal quote style", () => {
	assert.deepEqual(references('new URL("mark.svg", import.meta.url); new URL(\'poster.webp?v=1#cover\', import.meta.url); new URL(`worker.js`,import.meta.url)'), [
		"mark.svg", "poster.webp?v=1#cover", "worker.js",
	]);
});

test("nested Vite worker and imported SVG output retain their local asset references", () => {
	assert.deepEqual(references('var mark=``+new URL(`builder-mark-hash.svg`,import.meta.url).href; new Worker(new URL(``+new URL(`keyword-catalogue-worker-hash.js`,import.meta.url).href,``+import.meta.url),{type:`module`})'), [
		"builder-mark-hash.svg", "keyword-catalogue-worker-hash.js",
	]);
});

test("Genre filenames are still validated when actually used as local assets", () => {
	for (const filename of Object.values(GENRE_ARTWORK_ROLE_FILES)) {
		assert.deepEqual(references(`new URL("${filename}", import.meta.url)`), [filename]);
	}
});

test("domain-root and escaping references remain visible to path safety validation", () => {
	assert.deepEqual(references('<img src="/assets/mark.svg"><link href="/theme.css"><script src="../../escape.js"></script>'), [
		"/assets/mark.svg", "/theme.css", "../../escape.js",
	]);
});
