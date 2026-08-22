import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createElement } from "../builder/node_modules/react/index.js";
import { renderToStaticMarkup } from "../builder/node_modules/react-dom/server.js";
import { createServer } from "../builder/node_modules/vite/dist/node/index.js";
import { createBuilderController } from "../builder/src/application/index.js";
import { buildBuilderViewModel } from "../builder/src/ui/view-model.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vite = await createServer({
	root: path.join(rootDir, "builder"),
	appType: "custom",
	logLevel: "silent",
	server: { middlewareMode: true },
});
const { BuilderWorkspace } = await vite.ssrLoadModule("/src/ui/BuilderWorkspace.jsx");
after(() => vite.close());

function countingIdFactory(prefix = "builder") {
	let count = 0;
	return () => `${prefix}-${++count}`;
}

function createController() {
	return createBuilderController({
		idFactory: countingIdFactory(),
		nuvioIdFactory: countingIdFactory("nuvio"),
		initialProjectTitle: "Folder artwork test",
	});
}

function importArtworkFolders(controller) {
	const result = controller.importValue([{
		id: "collection",
		title: "Artwork collection",
		folders: [
			{
				id: "poster",
				title: "Custom Poster",
				tileShape: "POSTER",
				coverImageUrl: "https://example.test/custom.webp",
				sources: [],
			},
			{
				id: "landscape",
				title: "TMDB Landscape",
				tileShape: "landscape",
				coverImageUrl: "https://image.tmdb.org/t/p/w500/example.jpg",
				sources: [],
			},
			{
				id: "blank",
				title: "Blank artwork",
				tileShape: "POSTER",
				coverImageUrl: "   ",
				sources: [],
			},
			{
				id: "absent",
				title: "Absent artwork",
				tileShape: "POSTER",
				sources: [],
			},
			{
				id: "null",
				title: "Null artwork",
				tileShape: "POSTER",
				coverImageUrl: null,
				sources: [],
			},
			{
				id: "unsupported-shape",
				title: "Unsupported shape",
				tileShape: "SQUARE",
				coverImageUrl: "https://example.test/unknown-shape.webp",
				sources: [],
			},
			{
				id: "hidden-title",
				title: "\u200E",
				tileShape: "POSTER",
				coverImageUrl: "https://example.test/hidden.webp",
				sources: [],
			},
		],
	}]);
	assert.equal(result.ok, true);
	const collection = controller.getState().project.collections[0];
	controller.selectNode(collection.internalId);
	return collection;
}

function renderWorkspace(controller) {
	return renderToStaticMarkup(createElement(BuilderWorkspace, {
		controller,
		state: controller.getState(),
	}));
}

test("view model exposes only assigned Tile artwork and uses a neutral shape for preserved unsupported values", () => {
	const controller = createController();
	importArtworkFolders(controller);
	const folders = buildBuilderViewModel(controller.getState()).folders;

	assert.deepEqual(folders.map(({ title, tileArtworkUrl, tileArtworkShape }) => ({
		title,
		tileArtworkUrl,
		tileArtworkShape,
	})), [
		{ title: "Custom Poster", tileArtworkUrl: "https://example.test/custom.webp", tileArtworkShape: "poster" },
		{ title: "TMDB Landscape", tileArtworkUrl: "https://image.tmdb.org/t/p/w500/example.jpg", tileArtworkShape: "landscape" },
		{ title: "Blank artwork", tileArtworkUrl: null, tileArtworkShape: null },
		{ title: "Absent artwork", tileArtworkUrl: null, tileArtworkShape: null },
		{ title: "Null artwork", tileArtworkUrl: null, tileArtworkShape: null },
		{ title: "Unsupported shape", tileArtworkUrl: "https://example.test/unknown-shape.webp", tileArtworkShape: "unknown" },
		{ title: "Hidden title", tileArtworkUrl: "https://example.test/hidden.webp", tileArtworkShape: "poster" },
	]);
});

test("Folder cards render assigned custom and TMDB artwork without adding frames for missing artwork", () => {
	const controller = createController();
	const collection = importArtworkFolders(controller);
	const stateBefore = JSON.stringify(controller.getState().project);
	const revisionBefore = controller.getState().revision;
	const markup = renderWorkspace(controller);

	assert.equal((markup.match(/class="folder-card-thumbnail"/g) ?? []).length, 4);
	assert.match(markup, /data-folder-card-artwork="poster"/);
	assert.match(markup, /data-folder-card-artwork="landscape"/);
	assert.match(markup, /data-folder-card-artwork="unknown"/);
	assert.match(markup, /src="https:\/\/example\.test\/custom\.webp" alt="" width="34" height="50" loading="lazy" decoding="async" referrerPolicy="no-referrer" draggable="false"/);
	assert.match(markup, /src="https:\/\/image\.tmdb\.org\/t\/p\/w500\/example\.jpg" alt="" width="60" height="34" loading="lazy" decoding="async" referrerPolicy="no-referrer" draggable="false"/);
	assert.equal(markup.includes('src="   "'), false);
	assert.equal(markup.includes("placeholder poster"), false);
	assert.match(markup, /aria-label="Folder with hidden Nuvio title"/);
	assert.match(markup, /data-card-layout="folder"><div class="hierarchy-card-main[^>]*>[\s\S]*?data-action="reorder-folder"[\s\S]*?<button class="node-button[\s\S]*?folder-card-thumbnail[\s\S]*?<div class="hierarchy-actions"/);

	assert.equal(JSON.stringify(controller.getState().project), stateBefore);
	assert.equal(controller.getState().revision, revisionBefore);
	assert.equal(collection.folders[0].editable.coverImageUrl, "https://example.test/custom.webp");
});

test("import and workspace rendering preserve custom, TMDB, blank, absent, and null artwork states exactly", () => {
	const controller = createController();
	const collection = importArtworkFolders(controller);
	const revisionBefore = controller.getState().revision;
	const serializedBefore = controller.serializeProject().value;

	renderWorkspace(controller);

	const folders = collection.folders;
	assert.equal(folders[0].editable.coverImageUrl, "https://example.test/custom.webp");
	assert.equal(folders[1].editable.coverImageUrl, "https://image.tmdb.org/t/p/w500/example.jpg");
	assert.equal(folders[2].editable.coverImageUrl, "   ");
	assert.equal(Object.hasOwn(folders[3].editable, "coverImageUrl"), false);
	assert.equal(folders[4].editable.coverImageUrl, null);
	assert.deepEqual(controller.serializeProject().value, serializedBefore);
	assert.equal(controller.getState().revision, revisionBefore);
});

test("selected and hidden-title Folder cards retain non-colour selection and accessible naming with artwork", () => {
	const controller = createController();
	const collection = importArtworkFolders(controller);
	const hiddenFolder = collection.folders.at(-1);
	controller.selectNode(hiddenFolder.internalId);
	const markup = renderWorkspace(controller);

	assert.match(markup, /class="hierarchy-card is-selected" data-hierarchy-card="folder"/);
	assert.match(markup, /class="node-button is-selected"[^>]*data-node-type="folder" aria-pressed="true" aria-label="Folder with hidden Nuvio title"/);
	assert.match(markup, /<img class="folder-card-thumbnail"[^>]*alt=""/);
	assert.equal(markup.includes("\u200E"), false);
});

test("Folder thumbnail CSS reserves compact shape-aware dimensions and rebalances responsive workspace columns", () => {
	const styles = fs.readFileSync(path.join(rootDir, "builder", "src", "styles.css"), "utf8");

	assert.match(styles, /\.folder-card-thumbnail-frame\[data-folder-artwork-shape="poster"\]\s*\{[\s\S]*?width:\s*34px;[\s\S]*?height:\s*50px;/);
	assert.match(styles, /\.folder-card-thumbnail-frame\[data-folder-artwork-shape="landscape"\]\s*\{[\s\S]*?width:\s*60px;[\s\S]*?height:\s*34px;/);
	assert.match(styles, /\.folder-card-thumbnail-frame\[data-folder-artwork-shape="unknown"\][\s\S]*?width:\s*44px;[\s\S]*?height:\s*44px;/);
	assert.match(styles, /\.folder-card-thumbnail\s*\{[\s\S]*?pointer-events:\s*none;[\s\S]*?object-fit:\s*cover;/);
	assert.match(styles, /data-folder-artwork-shape="unknown"[^\{]*\.folder-card-thumbnail\s*\{[\s\S]*?object-fit:\s*contain;/);
	assert.match(styles, /@media \(max-width: 1239px\)[\s\S]*?data-folder-artwork-shape="poster"[\s\S]*?width:\s*30px;[\s\S]*?height:\s*44px;[\s\S]*?data-folder-artwork-shape="landscape"[\s\S]*?width:\s*50px;[\s\S]*?height:\s*28px;/);
	assert.match(styles, /@media \(min-width: 900px\)[\s\S]*?grid-template-columns:\s*minmax\(250px, 0\.9fr\) minmax\(310px, 1\.1fr\) minmax\(240px, 0\.95fr\)/);
	assert.match(styles, /@media \(min-width: 1240px\)[\s\S]*?grid-template-columns:\s*minmax\(285px, 1\.05fr\) minmax\(330px, 1\.2fr\) minmax\(330px, 0\.95fr\)/);
	assert.equal(styles.includes(".node-chevron"), false);
});
