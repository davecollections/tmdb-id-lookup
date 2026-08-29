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
const { AVAILABLE_SOURCE_MODES } = await vite.ssrLoadModule("/src/source-add/source-modes.js");
const { CREATION_OPTIONS } = await vite.ssrLoadModule("/src/ui/creation-options.js");
const { CreationDialog } = await vite.ssrLoadModule("/src/ui/CreationDialog.jsx");
const { SourceModeDialog } = await vite.ssrLoadModule("/src/ui/SourceModeDialog.jsx");
after(() => vite.close());

function read(relativePath) {
	return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function renderSourceChooser() {
	return renderToStaticMarkup(createElement(SourceModeDialog, {
		folderName: "Curated folder",
		onCancel() {},
		onSelectMode() {},
	}));
}

function renderCreationChooser(scope) {
	return renderToStaticMarkup(createElement(CreationDialog, {
		scope,
		project: { collections: [] },
		projectRevision: 0,
		currentYear: 2026,
		destinationCollectionInternalId: scope === "new-folder" ? "collection" : null,
		destinationCollectionTitle: scope === "new-folder" ? "Destination" : null,
		onCancel() {},
		onCreateBlank() {},
		onApplyDecades() {},
	}));
}

const expectedModes = Object.freeze([
	["tmdb-movie-franchise", "Movie franchise", "franchises", "Add a TMDB movie collection."],
	["tmdb-people", "People", "people", "Add movies or series for an actor or director."],
	["tmdb-studios", "Studios", "studios", "Add movies or series from a studio."],
	["tmdb-networks", "Networks", "networks", "Add series from a TV network."],
	["tmdb-streaming-services", "Streaming", "streaming-services", "Add a streaming service."],
	["tmdb-genres", "Genres", "genres", "Add movies or series by genre."],
	["tmdb-decade", "Decade", "decades", "Add movies or series by decade or year."],
]);

const expectedCreationOptions = Object.freeze([
	["blank", "Blank", "blank", "Start manually."],
	["decades", "Decades", "decades", "Build by decade or year."],
	["people", "People", "people", "Build around actors or directors."],
	["franchises", "Franchises", "franchises", "Build from a movie franchise."],
	["studios", "Studios", "studios", "Build from movie or TV studios."],
	["networks", "Networks", "networks", "Build from TV networks."],
	["genres", "Genres", "genres", "Build by genre."],
	["streaming-services", "Streaming", "streaming-services", "Build from streaming services."],
]);

test("Add Source registry remains exactly seven ordered TMDB families with approved compact card metadata", () => {
	assert.deepEqual(AVAILABLE_SOURCE_MODES.map((mode) => [mode.id, mode.label, mode.icon, mode.description]), expectedModes);
	assert.equal(AVAILABLE_SOURCE_MODES.length, 7);
	assert.equal(AVAILABLE_SOURCE_MODES.every((mode) => mode.providerLabel === "TMDB" && mode.category === "native-tmdb"), true);
	assert.equal(new Set(AVAILABLE_SOURCE_MODES.map((mode) => mode.id)).size, 7);
});

test("Add Source renders immediate-action launcher cards with icons, helpers, and one compact provider disclosure", () => {
	const markup = renderSourceChooser();
	assert.deepEqual([...markup.matchAll(/data-source-mode-option="([^"]+)"/g)].map((match) => match[1]), expectedModes.map(([id]) => id));
	assert.equal((markup.match(/<button class="source-mode-option" type="button"/g) ?? []).length, 7);
	assert.equal((markup.match(/class="creation-option-icon-shell" aria-hidden="true"/g) ?? []).length, 7);
	assert.equal((markup.match(/class="creation-option-icon" viewBox="0 0 24 24" focusable="false"/g) ?? []).length, 7);
	assert.match(markup, /<ul class="add-source-scroll source-mode-list" aria-label="Source families">/);
	assert.match(markup, /Choose what you want to add\./);
	assert.match(markup, /All available source families use <strong>TMDB<\/strong>\./);
	for (const [, label, , helper] of expectedModes) {
		assert.match(markup, new RegExp(`<strong>${label}<\\/strong>`));
		assert.ok(markup.includes(`<small>${helper}</small>`), helper);
	}
	for (const removed of [
		"Add an official TMDB movie collection as one Nuvio source.",
		"Add acting and directing Movie or Series sources for one person.",
		"Add Movie or Series sources for one studio.",
		"Add one Series source for a TV Network.",
		"Add Movie or Series sources for one streaming provider across one or more regions.",
		"Add official TMDB Movie or Series Genre sources.",
		"Add one canonical Decade or exact-year Movie, Series, or Both configuration.",
		"→",
	]) assert.equal(markup.includes(removed), false, removed);
	assert.doesNotMatch(markup, /type="(?:radio|checkbox)"|role="radio"|aria-checked|data-selected/);
});

test("every Add Source card retains its exact existing destination flow", () => {
	const workspace = read("builder/src/ui/BuilderWorkspace.jsx");
	const whitelist = workspace.match(/!\[(MOVIE_FRANCHISE_SOURCE_MODE_ID,[\s\S]*?DECADE_SOURCE_MODE_ID)\]\.includes\(modeId\)/)?.[1] ?? "";
	assert.deepEqual([...whitelist.matchAll(/([A-Z_]+SOURCE_MODE_ID)/g)].map((match) => match[1]), [
		"MOVIE_FRANCHISE_SOURCE_MODE_ID",
		"PEOPLE_SOURCE_MODE_ID",
		"STUDIO_SOURCE_MODE_ID",
		"NETWORK_SOURCE_MODE_ID",
		"STREAMING_SOURCE_MODE_ID",
		"GENRE_SOURCE_MODE_ID",
		"DECADE_SOURCE_MODE_ID",
	]);
	for (const [mode, flow] of [
		["PEOPLE_SOURCE_MODE_ID", "PeopleSourceFlow"],
		["STUDIO_SOURCE_MODE_ID", "StudioSourceFlow"],
		["NETWORK_SOURCE_MODE_ID", "NetworkSourceFlow"],
		["STREAMING_SOURCE_MODE_ID", "StreamingSourceFlow"],
		["GENRE_SOURCE_MODE_ID", "GenreSourceFlow"],
		["DECADE_SOURCE_MODE_ID", "DecadeSourceFlow"],
	]) assert.match(workspace, new RegExp(`visibleAddSourceSession\\.modeId === ${mode}[\\s\\S]*?<${flow}`));
	assert.match(workspace, /visibleAddSourceSession\.modeId === null[\s\S]*?<SourceModeDialog/);
	assert.match(workspace, /<AddSourceDialog[\s\S]*?onBack=\{returnToSourceModePicker\}/);
	assert.match(workspace, /returnFocusModeId: current\.modeId,[\s\S]*?modeId: null/);
});

test("Add Source and Creation directly share the narrow launcher card and icon presentation without changing Creation options", () => {
	const sourceDialog = read("builder/src/ui/SourceModeDialog.jsx");
	const creationDialog = read("builder/src/ui/CreationDialog.jsx");
	const sharedCard = read("builder/src/ui/LauncherOptionCard.jsx");
	const styles = read("builder/src/styles.css");
	assert.match(sourceDialog, /import \{ LauncherOptionCard \} from "\.\/LauncherOptionCard\.jsx"/);
	assert.match(creationDialog, /import \{ LauncherOptionCard \} from "\.\/LauncherOptionCard\.jsx"/);
	assert.match(sharedCard, /export function LauncherOptionIcon/);
	assert.match(sharedCard, /export function LauncherOptionCard/);
	assert.doesNotMatch(sharedCard, /wizard|selected|radio|checkbox|flow|scope/i);
	assert.match(styles, /\.creation-option-list,\s*\.source-mode-list\s*\{[^}]*minmax\(min\(184px, 100%\), 1fr\)/s);
	assert.match(styles, /\.creation-option-card,\s*\.source-mode-option\s*\{[^}]*min-height:\s*76px;[^}]*grid-template-columns:\s*auto minmax\(0, 1fr\)/s);
	assert.match(styles, /\.creation-option-card:focus-visible,\s*\.source-mode-option:hover,\s*\.source-mode-option:focus-visible\s*\{[^}]*border-color:/s);
	assert.match(styles, /@media \(max-width: 620px\)[\s\S]*?\.creation-option-list,\s*\.source-mode-list\s*\{[^}]*repeat\(2, minmax\(0, 1fr\)\)/s);
	assert.match(styles, /@media \(min-width: 900px\)[\s\S]*?\.source-mode-dialog\s*\{[^}]*width:\s*min\(920px, 100%\)/s);
	assert.doesNotMatch(styles, /\.source-mode-option\s*>\s*span|\.source-mode-option\s*\{[^}]*min-height:\s*92px/s);
	assert.deepEqual(CREATION_OPTIONS.map((option) => [option.id, option.label, option.icon, option.supportingText]), expectedCreationOptions);

	for (const scope of ["new-collection", "new-folder"]) {
		const markup = renderCreationChooser(scope);
		assert.deepEqual([...markup.matchAll(/data-creation-option="([^"]+)"/g)].map((match) => match[1]), expectedCreationOptions.map(([id]) => id));
		assert.equal((markup.match(/<button class="creation-option-card" type="button"/g) ?? []).length, CREATION_OPTIONS.length);
		assert.equal((markup.match(/class="creation-option-icon-shell" aria-hidden="true"/g) ?? []).length, CREATION_OPTIONS.length);
		for (const [, label, , helper] of expectedCreationOptions) {
			assert.match(markup, new RegExp(`<strong>${label}<\\/strong>`));
			assert.ok(markup.includes(`<small>${helper}</small>`), `${scope}: ${helper}`);
		}
		assert.equal(markup.includes("data-source-mode-option"), false);
	}
});
