import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createElement } from "../builder/node_modules/react/index.js";
import { renderToStaticMarkup } from "../builder/node_modules/react-dom/server.js";
import { createServer } from "../builder/node_modules/vite/dist/node/index.js";
import { createBuilderController } from "../builder/src/application/index.js";
import {
	buildDecadeSourceBundleDrafts,
	DEFAULT_DECADES_SORT_OPTION_ID,
	DEFAULT_DECADE_SOURCE_ADVANCED,
	DEFAULT_DECADE_SOURCE_PERIOD_ID,
} from "../builder/src/source-add/index.js";

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

function countingFactory(prefix) {
	let count = 0;
	return () => `${prefix}-${++count}`;
}

function renderFlow(existingDraftCount = 0) {
	const controller = createBuilderController({ idFactory: countingFactory("internal"), nuvioIdFactory: countingFactory("nuvio") });
	const collection = controller.createCollection({ editable: { title: "Collection" } });
	const folderResult = controller.createFolder(collection.createdInternalId, { editable: { title: "Decade picks" } });
	const built = buildDecadeSourceBundleDrafts({
		periodIds: [DEFAULT_DECADE_SOURCE_PERIOD_ID],
		mediaMode: "both",
		genreNames: [],
		sortOptionId: DEFAULT_DECADES_SORT_OPTION_ID,
		advanced: DEFAULT_DECADE_SOURCE_ADVANCED,
	});
	if (!built.ok) throw new Error("Default Decade Add Source drafts did not build.");
	for (const draft of built.drafts.slice(0, existingDraftCount)) controller.createSource(folderResult.createdInternalId, draft);
	const project = controller.getState().project;
	const folder = project.collections[0].folders[0];
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
	assert.equal((markup.match(/class="visually-hidden choice-card-input" type="checkbox"/g) ?? []).length, 8);
	assert.doesNotMatch(markup, /selection-indicator|selectable-card-indicator|✓/);
	assert.match(markup, />Select all<\/button>/);
	assert.match(markup, />Clear<\/button>/);
	assert.match(markup, /2 sources configured/);
	assert.match(markup, /All 2020s Movies/);
	assert.match(markup, /All 2020s Series/);
	assert.match(markup, /Add 2 sources/);
	assert.doesNotMatch(markup, />Cancel<\/button>/);
	for (const forbidden of ["Decade sample", "Period sample", "custom date", "Artwork", "Source name"]) assert.equal(markup.includes(forbidden), false);
});

test("Decade Add Source keeps normal and duplicate footer actions minimal and ordered", () => {
	const footer = (markup) => markup.match(/<footer class="([^"]*decade-source-actions[^"]*)"[\s\S]*?<\/footer>/)?.[0] ?? "";
	const buttonLabels = (markup) => [...footer(markup).matchAll(/<button[^>]*>([^<]+)<\/button>/g)].map((match) => match[1]);
	const normal = renderFlow();
	const partialOverlap = renderFlow(1);
	const completeOverlap = renderFlow(2);

	assert.deepEqual(buttonLabels(normal), ["Add 2 sources"]);
	assert.deepEqual(buttonLabels(partialOverlap), ["Add 1 source", "Add all anyway"]);
	assert.deepEqual(buttonLabels(completeOverlap), ["Add 0 sources", "Add all anyway"]);
	assert.match(footer(completeOverlap), /class="editor-apply" type="submit" disabled=""/);
	assert.doesNotMatch(normal + partialOverlap + completeOverlap, />Cancel<\/button>/);
	assert.doesNotMatch(footer(normal), /add-source-override-actions/);
	assert.match(footer(partialOverlap), /add-source-override-actions/);
	assert.match(footer(completeOverlap), /add-source-override-actions/);
	for (const markup of [normal, partialOverlap, completeOverlap]) {
		assert.ok(markup.indexOf("Back</button>") < markup.indexOf("decade-source-actions"));
		assert.ok(markup.indexOf("Close</button>") < markup.indexOf("decade-source-actions"));
	}
});

test("Decade Add Source directly reuses shared sort, Advanced, Preview, duplicate, and atomic workspace seams", () => {
	const flow = read("builder/src/ui/DecadeSourceFlow.jsx");
	const workspace = read("builder/src/ui/BuilderWorkspace.jsx");
	assert.match(flow, /<SemanticSortChoices options=\{DECADES_MEDIA_MODES\}/);
	assert.match(flow, /<SemanticSortChoices options=\{DECADES_SORT_OPTIONS\}/);
	assert.match(flow, /<SemanticSortChoices options=\{decadeOptions\}/);
	assert.match(flow, /<DecadePeriodChoices options=\{yearOptions\}/);
	assert.match(flow, /<GenreCatalogueList[^>]*selectionControl="checkbox"/);
	assert.doesNotMatch(flow, /showSelectionIndicator/);
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
