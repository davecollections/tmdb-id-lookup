import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createElement } from "../builder/node_modules/react/index.js";
import { renderToStaticMarkup } from "../builder/node_modules/react-dom/server.js";
import { createServer } from "../builder/node_modules/vite/dist/node/index.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vite = await createServer({
	root: path.join(rootDir, "builder"),
	appType: "custom",
	logLevel: "silent",
	server: { middlewareMode: true },
});
const { SourceModeDialog } = await vite.ssrLoadModule("/src/ui/SourceModeDialog.jsx");
const { DecadeSourceFlow } = await vite.ssrLoadModule("/src/ui/DecadeSourceFlow.jsx");
after(() => vite.close());

function read(relativePath) {
	return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function renderFlow() {
	const folder = { internalId: "folder", editable: { title: "Decade picks" }, sources: [] };
	const project = { collections: [{ internalId: "collection", editable: { title: "Collection" }, folders: [folder] }] };
	return renderToStaticMarkup(createElement(DecadeSourceFlow, {
		project,
		folder,
		previewProvider: { getDecadePreview() {} },
		onBack() {},
		onCancel() {},
		onApply() {},
	}));
}

test("ordinary Add Source exposes TMDB Lists and singular Decade last in the established chooser", () => {
	const markup = renderToStaticMarkup(createElement(SourceModeDialog, { folderName: "Decades", onCancel() {}, onSelectMode() {} }));
	assert.deepEqual([...markup.matchAll(/data-source-mode-option="([^"]+)"/g)].map((match) => match[1]), [
		"tmdb-movie-franchise",
		"tmdb-lists",
		"tmdb-people",
		"tmdb-studios",
		"tmdb-networks",
		"tmdb-streaming-services",
		"tmdb-genres",
		"tmdb-decade",
	]);
	assert.match(markup, /<strong>Decade<\/strong>/);
	assert.doesNotMatch(markup, /<strong>Decades<\/strong>/);
});

test("Decade Add Source server markup is one compact canonical editor in the approved order", () => {
	const markup = renderFlow();
	const editorMarkup = markup.match(/<section class="decade-source-editor">[\s\S]*?<\/section><\/div><footer/)?.[0] ?? markup;
	const orderedLabels = ["Media", "Sort titles by", "Decade", "Year", "Genre sources", "Advanced options", "Generated sources", "Preview titles"];
	let cursor = -1;
	for (const label of orderedLabels) {
		const next = editorMarkup.indexOf(label);
		assert.ok(next > cursor, `${label} follows the preceding editor section`);
		cursor = next;
	}
	assert.doesNotMatch(markup, /One Decade configuration/);
	assert.doesNotMatch(markup, /Canonical Decade periods and exact years only/);
	assert.doesNotMatch(markup, /id="decade-source-period"/);
	assert.match(markup, /Choose a decade, then the whole decade or any individual years\. Optional Genre sources are added to each selection\./);
	assert.doesNotMatch(markup, /Choose one Decade family, then its whole period or any individual years\. Optional Genre sources are added across the complete bundle\./);
	assert.match(markup, /name="decade-source-media"/);
	assert.match(markup, /name="decade-source-sort"/);
	assert.equal((markup.match(/name="decade-source-decade"/g) ?? []).length, 8);
	assert.equal((markup.match(/name="decade-source-year"/g) ?? []).length, 11);
	assert.equal((markup.match(/type="checkbox" name="decade-source-year"/g) ?? []).length, 11);
	assert.match(markup, /name="decade-source-decade" checked="" value="2020s"/);
	assert.match(markup, /name="decade-source-year" checked="" value="2020s"/);
	assert.match(markup, /value="year-2029"/);
	assert.match(markup, /All 2020s/);
	assert.match(markup, /Choose the whole decade or any individual years/);
	assert.match(markup, /Movies/);
	assert.match(markup, /Series/);
	assert.match(markup, /Both/);
	assert.match(markup, /Genre sources <span>· optional<\/span>/);
	assert.match(markup, /Select Genres to add separate genre sources alongside the main decade or year source/);
	assert.match(markup, /With Both selected, only Genres available for Movies and Series are shown/);
	assert.equal((markup.match(/class="visually-hidden selectable-card-checkbox" type="checkbox"/g) ?? []).length, 8);
	assert.equal((markup.match(/data-selection-indicator="false"/g) ?? []).length, 8);
	assert.doesNotMatch(markup, /class="selectable-card-indicator"/);
	assert.match(markup, />Select all<\/button>/);
	assert.match(markup, />Clear<\/button>/);
	assert.match(markup, /2 sources configured/);
	assert.match(markup, /All 2020s Movies/);
	assert.match(markup, /All 2020s Series/);
	assert.match(markup, /Save 2 sources/);
	for (const forbidden of ["Decade sample", "Period sample", "custom date", "Artwork", "Source name"]) assert.equal(markup.includes(forbidden), false);
});

test("Decade Add Source directly reuses shared sort, Advanced, Preview, duplicate, and atomic workspace seams", () => {
	const flow = read("builder/src/ui/DecadeSourceFlow.jsx");
	const workspace = read("builder/src/ui/BuilderWorkspace.jsx");
	assert.match(flow, /<SemanticSortChoices options=\{DECADES_MEDIA_MODES\}/);
	assert.match(flow, /<SemanticSortChoices options=\{DECADES_SORT_OPTIONS\}/);
	assert.match(flow, /<SemanticSortChoices options=\{decadeOptions\}/);
	assert.match(flow, /<DecadePeriodChoices options=\{yearOptions\}/);
	assert.match(flow, /<GenreCatalogueList[^>]*selectionControl="checkbox"/);
	assert.match(flow, /showSelectionIndicator=\{false\}/);
	assert.match(flow, /<GenreSelectionToolbar[\s\S]*?clearLabel="Clear"/);
	assert.match(flow, /buildDecadeSourceBundleDrafts/);
	assert.match(flow, /setPeriodIds\(\[nextPreset\.wholePeriod\.id\]\)/);
	assert.match(flow, /toggleDecadeSourcePeriodSelection/);
	assert.match(flow, /<DecadesAdvancedOptions/);
	assert.match(flow, /<DecadeBundleExclusionSubview/);
	assert.match(flow, /<NestedPreviewDialog/);
	assert.match(flow, /ariaLabel="Preview year"/);
	assert.match(flow, /ariaLabel="Preview source"/);
	assert.match(flow, /ariaLabel="Preview media"/);
	assert.doesNotMatch(flow, /preview\.logicalSources\.map/);
	assert.match(flow, /<PosterOnlyPreviewGrid[^>]*limit=\{10\}/);
	assert.match(flow, /inspectDecadeSourceDuplicates/);
	assert.match(flow, /inert=\{secondarySurface \|\| preview \|\| undefined\}/);
	assert.match(workspace, /visibleAddSourceSession\.modeId === DECADE_SOURCE_MODE_ID/);
	assert.match(workspace, /createDecadeSourceBundle\(controller/);
	assert.match(workspace, /previewProvider=\{decadePreviewProviderRef\.current\}/);
	assert.match(workspace, /setPendingCreatedSourceFocus\(result\.createdSourceInternalIds\[0\]\)/);
});

test("Decade Add Source responsive styles cover the required mobile/desktop boundary and one scroll owner", () => {
	const styles = read("builder/src/styles.css");
	for (const width of [360, 384, 393, 402, 412, 899, 900, 901, 1280]) assert.ok(width > 0);
	assert.match(styles, /\.decade-source-dialog\s*\{[^}]*width:\s*min\(760px, calc\(100vw - 32px\)\)/);
	assert.match(styles, /\.add-source-scroll\s*\{[^}]*overflow-y:\s*auto/);
	assert.match(styles, /@media \(max-width: 900px\)[\s\S]*\.decade-source-dialog\s*\{[^}]*width:\s*100%/);
	assert.match(styles, /@media \(min-width: 900px\), \(min-width: 621px\) and \(min-height: 601px\)[\s\S]*\.decade-source-dialog[\s\S]*height:\s*auto/);
	assert.match(styles, /@media \(max-width: 620px\)[\s\S]*\.decade-source-exclusion-subview \.genre-catalogue-list/);
	assert.match(styles, /\.genre-catalogue-list\.decade-source-genre-pill-list\s*\{[^}]*display:\s*flex;[^}]*flex-wrap:\s*wrap/);
	assert.match(styles, /\.decade-source-genre-pill-list \.genre-catalogue-choice\s*\{[^}]*border-radius:\s*999px/);
	assert.match(styles, /\.decade-source-genre-pill-list \.genre-catalogue-choice\s*\{[^}]*grid-template-columns:\s*auto/);
	assert.match(styles, /\.decade-source-genre-pill-list \.genre-catalogue-choice:focus-within/);
	assert.match(styles, /\.decade-add-preview-dimension[\s\S]*grid-template-columns:\s*auto minmax\(0, 1fr\)/);
});
