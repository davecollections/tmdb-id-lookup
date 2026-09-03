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
const {
	GenreBrowseStep,
	GenreConfigureReviewStep,
	GenreSourceFlow,
	reconcileGenreConfigureState,
	toggleGenreSelection,
} = await vite.ssrLoadModule("/src/ui/GenreSourceFlow.jsx");
const {
	GenreAdvancedHelpSubview,
	GenreAdvancedOptions,
	GenreExclusionSubview,
} = await vite.ssrLoadModule("/src/ui/GenreAdvancedOptions.jsx");
const { GenreEditorFields } = await vite.ssrLoadModule("/src/ui/SourceEditorDialog.jsx");
const {
	buildGenreSourceDrafts,
	createGenreAdvancedState,
	emptyGenreAdvancedState,
	GENRE_CONCEPTS,
	genreExclusionsFor,
	officialGenreConcept,
} = await vite.ssrLoadModule("/src/source-add/index.js");
after(() => vite.close());

function read(relativePath) {
	return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function browseMarkup(overrides = {}) {
	return renderToStaticMarkup(createElement(GenreBrowseStep, {
		query: "",
		selection: [],
		onQueryChange() {},
		onClearSearch() {},
		onChoose() {},
		onSelectAll() {},
		onClearAll() {},
		...overrides,
	}));
}

function emptyFolderPlan() {
	return { groups: [], readyGroups: [], alreadyExistingGroups: [], partialGroups: [], elsewhere: [] };
}

function configureMarkup(overrides = {}) {
	const genres = [officialGenreConcept("Comedy"), officialGenreConcept("Horror"), officialGenreConcept("Action & Adventure")];
	const drafts = buildGenreSourceDrafts(genres).drafts;
	return renderToStaticMarkup(createElement(GenreConfigureReviewStep, {
		genres,
		folderName: "Favourites",
		collectionName: "My Collection",
		destinationMode: "current-folder",
		sharedMediaChoice: "both",
		sortOptionId: "popular",
		advanced: emptyGenreAdvancedState(),
		drafts,
		duplicates: { destination: [], duplicateDrafts: [], missingDrafts: drafts, elsewhere: [] },
		folderPlan: emptyFolderPlan(),
		buildErrors: [],
		applyDiagnostic: null,
		reviewExpanded: false,
		onChangeGenres() {},
		onDestinationChange() {},
		onSharedMediaChange() {},
		onSortChange() {},
		onAdvancedChange() {},
		onRemoveGenre() {},
		onOpenSecondary() {},
		onToggleReview() {},
		...overrides,
	}));
}

test("Add Source keeps Lists second and exposes Genres and Decade after the established modes", () => {
	const markup = renderToStaticMarkup(createElement(SourceModeDialog, {
		folderName: "Genres",
		onCancel() {},
		onSelectMode() {},
	}));
	const modeIds = [...markup.matchAll(/data-source-mode-option="([^"]+)"/g)].map((match) => match[1]);
	assert.deepEqual(modeIds, [
		"tmdb-movie-franchise",
		"tmdb-lists",
		"tmdb-people",
		"tmdb-studios",
		"tmdb-networks",
		"tmdb-streaming-services",
		"tmdb-genres",
		"tmdb-decade",
	]);
	assert.ok(markup.includes("<strong>Genres</strong>"));
	assert.ok(markup.includes("<strong>Decade</strong>"));
});

test("Genre Browse is local, searchable and uses a compact 27-item selection summary", () => {
	const allMarkup = browseMarkup({ selection: ["Comedy", "Horror"] });
	assert.equal((allMarkup.match(/data-genre-name=/g) ?? []).length, 27);
	assert.ok(allMarkup.indexOf('data-genre-name="Action"') < allMarkup.indexOf('data-genre-name="Western"'));
	assert.ok(allMarkup.includes("Movies &amp; Series"));
	assert.ok(allMarkup.includes("2 of 27 selected"));
	assert.ok(allMarkup.includes("Select all"));
	assert.ok(allMarkup.includes("Clear all"));
	assert.ok(allMarkup.includes('class="genre-selection-toolbar"'));
	assert.ok(allMarkup.includes('class="genre-selection-actions"'));
	assert.ok(allMarkup.indexOf("Official TMDB Genres") < allMarkup.indexOf('class="genre-selection-toolbar"'));
	assert.ok(allMarkup.indexOf('class="genre-selection-toolbar"') < allMarkup.indexOf("Search Genres"));
	assert.equal(allMarkup.includes('aria-label="Remove Comedy"'), false);
	const searchMarkup = browseMarkup({ query: "horror", selection: ["Comedy"] });
	assert.equal((searchMarkup.match(/data-genre-name=/g) ?? []).length, 1);
	assert.ok(searchMarkup.includes('data-genre-name="Horror"'));
	assert.ok(searchMarkup.includes("1 of 27 selected"));
	assert.ok(searchMarkup.includes("Clear search"));
	for (const forbidden of ["title count", "titles available", "fetch(", "Loading Genres", "up to 20"]) assert.equal(allMarkup.includes(forbidden), false);
});

test("selection retains click order, reselects at the end and accepts all 27 Genres", () => {
	let selection = [];
	for (const name of ["Western", "Comedy", "Action"]) selection = toggleGenreSelection(selection, name);
	assert.deepEqual(selection, ["Western", "Comedy", "Action"]);
	selection = toggleGenreSelection(selection, "Comedy");
	selection = toggleGenreSelection(selection, "Comedy");
	assert.deepEqual(selection, ["Western", "Action", "Comedy"]);
	selection = [];
	for (const concept of GENRE_CONCEPTS) selection = toggleGenreSelection(selection, concept.name);
	assert.equal(selection.length, 27);
	assert.deepEqual(selection, GENRE_CONCEPTS.map((concept) => concept.name));
});

test("one fixed-media Genre stays in the current folder and hides irrelevant choices", () => {
	for (const name of ["Action", "Action & Adventure"]) {
		const genres = [officialGenreConcept(name)];
		const drafts = buildGenreSourceDrafts(genres).drafts;
		const markup = configureMarkup({ genres, drafts, duplicates: { destination: [], duplicateDrafts: [], missingDrafts: drafts, elsewhere: [] } });
		assert.ok(markup.includes(`${drafts.length} source${drafts.length === 1 ? "" : "s"} will be added to “Favourites”`));
		assert.equal(markup.includes("How would you like these added?"), false);
		assert.equal(markup.includes('name="genre-destination"'), false);
		assert.equal(markup.includes("For genres available as both Movies and Series"), false);
		assert.equal(markup.includes("Remove Action"), false);
		assert.equal(markup.includes("genre-review-summary"), false);
		assert.equal(markup.includes("1 genre selected"), false);
		assert.ok(markup.includes("Configure &amp; review"));
	}
});

test("one shared Genre shows media choice but still stays in the current folder", () => {
	const genres = [officialGenreConcept("Animation")];
	const drafts = buildGenreSourceDrafts(genres).drafts;
	const markup = configureMarkup({ genres, drafts, duplicates: { destination: [], duplicateDrafts: [], missingDrafts: drafts, elsewhere: [] } });
	assert.ok(markup.includes("For genres available in both Movies and Series"));
	assert.equal(markup.includes("This choice only affects genres that are available for both."), false);
	assert.equal(markup.includes('semantic-sort-description"></p>'), false);
	assert.equal((markup.match(/name="genre-shared-media"/g) ?? []).length, 3);
	assert.equal(markup.includes('name="genre-destination"'), false);
});

test("multi-Genre configure offers destination choices, removable summaries and plain wording", () => {
	const drafts = buildGenreSourceDrafts(["Comedy", "Horror", "Action & Adventure"]).drafts;
	const markup = configureMarkup({
		drafts,
		duplicates: { destination: [drafts[0]], duplicateDrafts: [drafts[0]], missingDrafts: drafts.slice(1), elsewhere: [{ identity: "elsewhere" }], elsewhereDrafts: [drafts[1]] },
	});
	for (const label of ["Configure &amp; review", "How would you like these added?", "Add all to this folder", "One folder per genre", "Favourites", "For genres available in both Movies and Series", "Sort titles by", "Advanced options", "What do these options do?", "Sources to add · 3", "Already in this folder", "Exists elsewhere", "A matching source exists elsewhere in this project", "You can still add it here.", "Genre exclusions", "No genre exclusions configured"]) assert.ok(markup.includes(label), label);
	assert.equal(markup.includes("data-attention"), false);
	assert.equal(markup.includes("genre-elsewhere-note"), false);
	assert.ok(markup.includes("source-elsewhere-note"));
	for (const field of ["From year", "To year", "Minimum rating", "Maximum rating", "Minimum votes", "Original language", "Origin country"]) assert.ok(markup.includes(field), field);
	assert.equal((markup.match(/name="genre-destination"/g) ?? []).length, 2);
	assert.match(markup, /name="genre-destination" checked="" value="current-folder"/);
	for (const removed of ["Add every selected Genre source", "Create a separate folder for every selected Genre", "This choice only affects genres that are available for both.", "? What do these options do?"]) assert.equal(markup.includes(removed), false, removed);
	for (const name of ["Comedy", "Horror", "Action &amp; Adventure"]) assert.ok(markup.includes(`Remove ${name}`));
	assert.equal(markup.includes("Change genres"), false);
	assert.equal(markup.includes("physical source"), false);
});

test("several straightforward ready sources use rows without a redundant review summary", () => {
	const genres = [officialGenreConcept("Action"), officialGenreConcept("Action & Adventure")];
	const drafts = buildGenreSourceDrafts(genres).drafts;
	const markup = configureMarkup({ genres, drafts, duplicates: { destination: [], duplicateDrafts: [], missingDrafts: drafts, elsewhere: [] } });
	assert.ok(markup.includes("2 sources will be added to “Favourites”"));
	assert.equal((markup.match(/Ready to add/g) ?? []).length, 2);
	assert.equal(markup.includes("genre-review-summary"), false);
});

test("selection reconciliation prunes per-Genre exclusions and keeps current-folder as the safe default", () => {
	const advanced = createGenreAdvancedState({ exclusionsByGenre: { Comedy: ["Horror"], Horror: ["Comedy"] } });
	const downToOne = reconcileGenreConfigureState({ selection: ["Comedy", "Horror"], genreName: "Horror", advanced, destinationMode: "genre-folders" });
	assert.deepEqual(downToOne.selection, ["Comedy"]);
	assert.equal(downToOne.destinationMode, "current-folder");
	assert.deepEqual(genreExclusionsFor(downToOne.advanced, "Comedy"), ["Horror"]);
	assert.deepEqual(genreExclusionsFor(downToOne.advanced, "Horror"), []);
	const backToMulti = reconcileGenreConfigureState({ selection: downToOne.selection, genreName: "Horror", advanced: downToOne.advanced, destinationMode: downToOne.destinationMode });
	assert.deepEqual(backToMulti.selection, ["Comedy", "Horror"]);
	assert.equal(backToMulti.destinationMode, "current-folder");
	assert.deepEqual(genreExclusionsFor(backToMulti.advanced, "Horror"), []);
});

test("large source review stays compact while duplicate attention remains visible", () => {
	const genres = GENRE_CONCEPTS;
	const drafts = buildGenreSourceDrafts(genres).drafts;
	const duplicateDrafts = [drafts[0]];
	const markup = configureMarkup({
		genres,
		drafts,
		duplicates: { destination: [], duplicateDrafts, missingDrafts: drafts.slice(1), elsewhere: [] },
	});
	assert.ok(markup.includes("27 genres selected"));
	assert.ok(markup.includes("View selected genres"));
	assert.ok(markup.includes('aria-label="Remove Action"'));
	assert.ok(markup.includes("Sources to add · 34"));
	assert.ok(markup.includes("View all 35 sources"));
	assert.ok(markup.includes(drafts[0].editable.title));
	assert.equal(markup.includes("Ready to add"), false);
	const expanded = configureMarkup({
		genres,
		drafts,
		duplicates: { destination: [], duplicateDrafts, missingDrafts: drafts.slice(1), elsewhere: [] },
		reviewExpanded: true,
	});
	assert.ok(expanded.includes("Hide source details"));
	assert.ok(expanded.includes("Ready to add"));
	assert.ok(expanded.includes(drafts.at(-1).editable.title));
});

test("folder review surfaces full and partial groups while compacting ready groups", () => {
	const concepts = GENRE_CONCEPTS.slice(0, 8);
	const groups = concepts.map((concept, index) => ({
		concept,
		drafts: [{ editable: { title: `${concept.name} source` } }],
		status: index === 0 ? "already-exists" : index === 1 ? "partly-exists" : "ready",
		elsewhere: index === 2 ? [{}] : [],
	}));
	const plan = {
		groups,
		readyGroups: groups.slice(2),
		alreadyExistingGroups: [groups[0]],
		partialGroups: [groups[1]],
		elsewhere: [{}],
	};
	const markup = configureMarkup({ destinationMode: "genre-folders", folderPlan: plan });
	assert.ok(markup.includes("Folders to create · 6"));
	assert.ok(markup.includes("Already in this collection"));
	assert.ok(markup.includes("Partly in this collection"));
	assert.ok(markup.includes("View all 8 genres"));
	assert.ok(markup.includes("those Genre folders will not be created"));
	assert.ok(markup.includes("Matching sources exist elsewhere in this project"));
	assert.ok(configureMarkup({ destinationMode: "genre-folders", folderPlan: plan, reviewExpanded: true }).includes("Exists elsewhere"));
	assert.equal(markup.includes("Ready to create"), false);
});

test("advanced controls use compact inputs and separate exclusion and help subviews", () => {
	const genre = officialGenreConcept("Comedy");
	const advanced = createGenreAdvancedState({ exclusionsByGenre: { Comedy: ["Horror"] } });
	const main = renderToStaticMarkup(createElement(GenreAdvancedOptions, {
		value: advanced,
		includedGenres: [genre],
		sharedMediaChoice: "movies",
		onChange() {},
		onOpenSecondary() {},
	}));
	for (const placeholder of ["1980", "1999", "7.0", "250"]) assert.ok(main.includes(`placeholder="${placeholder}"`));
	assert.equal((main.match(/class="genre-number-input"/g) ?? []).length, 5);
	assert.ok(main.includes("Horror"));
	assert.ok(main.includes(">Choose<"));
	assert.ok(main.includes(">What do these options do?</button>"));
	assert.equal(main.includes("? What do these options do?"), false);
	assert.equal(main.includes("genre-exclusion-picker-list"), false);

	const exclusions = renderToStaticMarkup(createElement(GenreExclusionSubview, {
		advanced,
		includedGenres: [genre],
		sharedMediaChoice: "movies",
		onChange() {},
		onDone() {},
	}));
	assert.ok(exclusions.includes("Exclude from Comedy"));
	assert.ok(exclusions.includes("Choose a Genre, then select Genres to exclude from that source."));
	assert.equal(exclusions.includes("Choose what you want left out of this genre’s results."), false);
	assert.ok(exclusions.includes('data-multiple-genres="false"'));
	assert.equal(exclusions.includes("genre-included-genre-pane"), false);
	assert.equal(exclusions.includes("<strong>Comedy</strong>"), false);
	for (const tvOnly of ["Action &amp; Adventure", "Kids", "News", "Reality", "Soap", "Talk", "War &amp; Politics"]) assert.equal(exclusions.includes(`<strong>${tvOnly}</strong>`), false, tvOnly);
	assert.ok(exclusions.includes("<strong>Horror</strong>"));
	assert.equal(exclusions.includes("disabled="), false);
	assert.equal((exclusions.match(/data-selected=/g) ?? []).length, 1);
	assert.equal(exclusions.includes('type="checkbox"'), false);
	assert.equal(exclusions.includes("media-correct"), false);

	const seriesExclusions = renderToStaticMarkup(createElement(GenreExclusionSubview, {
		advanced: emptyGenreAdvancedState(),
		includedGenres: [officialGenreConcept("Action & Adventure")],
		sharedMediaChoice: "series",
		onChange() {},
		onDone() {},
	}));
	assert.equal(seriesExclusions.includes("<strong>Action &amp; Adventure</strong>"), false);
	for (const movieOnly of ["Action", "Adventure", "Fantasy", "Horror", "History", "Music", "Romance", "Thriller", "War"]) assert.equal(seriesExclusions.includes(`<strong>${movieOnly}</strong>`), false, movieOnly);
	assert.ok(seriesExclusions.includes("<strong>News</strong>"));

	const dualExclusions = renderToStaticMarkup(createElement(GenreExclusionSubview, {
		advanced: emptyGenreAdvancedState(),
		includedGenres: [officialGenreConcept("Animation")],
		sharedMediaChoice: "both",
		onChange() {},
		onDone() {},
	}));
	assert.equal(dualExclusions.includes("<strong>Animation</strong>"), false);
	assert.ok(dualExclusions.includes("<strong>Kids</strong>"));
	assert.ok(dualExclusions.includes("<strong>Western</strong>"));

	const multi = renderToStaticMarkup(createElement(GenreExclusionSubview, {
		advanced: createGenreAdvancedState({ exclusionsByGenre: { Comedy: ["Horror"], Horror: ["Comedy"] } }),
		includedGenres: [genre, officialGenreConcept("Horror")],
		sharedMediaChoice: "both",
		onChange() {},
		onDone() {},
	}));
	assert.ok(multi.includes("Choose a Genre, then select Genres to exclude from that source."));
	assert.ok(multi.includes("Then select Genres to exclude from that source."));
	assert.equal(multi.includes("Choose a genre on the left"), false);
	assert.ok(multi.includes("Horror excluded"));
	assert.ok(multi.includes("Comedy excluded"));
	assert.equal(multi.includes("media-correct"), false);
	assert.ok(multi.includes("Done"));
	assert.equal(multi.includes("Back to Genres"), false);

	const help = renderToStaticMarkup(createElement(GenreAdvancedHelpSubview, { onDone() {} }));
	for (const label of ["What do these options do?", "From year", "Original language", "Origin country", "Want even more control?", "Advanced Discover will let you combine extra filters"]) assert.ok(help.includes(label), label);
	assert.equal(help.includes("<a "), false);
});

test("Genre Source Flow starts at Browse inside the normal folder Add Source path", () => {
	const markup = renderToStaticMarkup(createElement(GenreSourceFlow, {
		project: { collections: [] },
		folder: { internalId: "folder", editable: { title: "Favourites" } },
		onBack() {},
		onCancel() {},
		onApply() {},
	}));
	assert.ok(markup.includes('role="dialog"'));
	assert.ok(markup.includes('data-add-source-step="browse"'));
	assert.ok(markup.includes('data-action="back-to-source-types"'));
	assert.ok(markup.includes('aria-label="Close Add Genre sources"'));
	assert.ok(markup.includes("Continue"));
	assert.ok(markup.includes('id="genre-browse-title" tabindex="-1"'));
	assert.equal(markup.includes("autofocus"), false);
	for (const forbidden of ["data-genre-context", "Add genres", "New folder", "Landscape", "Review</button>"]) assert.equal(markup.includes(forbidden), false);
});

test("Genre Source Edit shares the advanced controls while Genre identity and media stay fixed", () => {
	const markup = renderToStaticMarkup(createElement(GenreEditorFields, {
		draft: {
			genreName: "Comedy",
			genreId: 35,
			mediaType: "TV",
			sortOptionId: "recent",
			originalSortBy: "first_air_date.desc",
			advanced: emptyGenreAdvancedState(),
		},
		onDefaultName() {},
		onSortChange() {},
		onAdvancedChange() {},
	}));
	assert.ok(markup.includes("Official TMDB Genre"));
	assert.ok(markup.includes("Genre ID 35 · Series"));
	assert.equal(markup.includes("genre-edit-mark"), false);
	assert.ok(markup.includes("Genre ID and media type stay fixed for this source"));
	assert.ok(markup.includes("Use default name"));
	assert.ok(markup.includes("Advanced options"));
	assert.ok(markup.includes("What do these options do?"));
	assert.equal((markup.match(/class="genre-number-input"/g) ?? []).length, 5);
	assert.equal(markup.includes("? What do these options do?"), false);
	assert.equal(markup.includes("physical source"), false);
	for (const label of ["Popular", "Recent", "Top Rated", "Most Votes"]) assert.ok(markup.includes(`>${label}<`), label);
	assert.doesNotMatch(read("builder/src/styles.css"), /\.genre-edit-mark\s*\{/);
});

test("workspace wiring keeps Genres out of the Folders header and supports responsive subviews", () => {
	const workspace = read("builder/src/ui/BuilderWorkspace.jsx");
	const flow = read("builder/src/ui/GenreSourceFlow.jsx");
	const styles = read("builder/src/styles.css");
	assert.doesNotMatch(workspace, /data-action="add-genres"|openAddGenres|createGenreFolderBatch/);
	assert.match(workspace, /createGenreSourceBundle\(controller/);
	assert.match(workspace, /destinationMode/);
	assert.match(workspace, /const firstFolderInternalId = result\.createdFolderInternalIds\[0\];[\s\S]*controller\.selectNode\(firstFolderInternalId\);[\s\S]*setPendingCreatedFolderFocus\(firstFolderInternalId\);/);
	assert.doesNotMatch(flow, /fetch\(|XMLHttpRequest|<table|createFoldersWithSources|folder artwork/i);
	assert.match(flow, /effectiveDestinationMode === "current-folder" && duplicates\.duplicateDrafts\.length > 0/);
	assert.match(flow, /"No new sources to add"/);
	assert.doesNotMatch(flow, /Add 0 sources/);
	assert.match(styles, /@media \(min-width: 900px\), \(min-width: 621px\) and \(min-height: 601px\)[\s\S]*\.genre-source-dialog\s*\{[\s\S]*height:\s*auto;/);
	assert.match(styles, /\.genre-secondary-surface\s*\{[\s\S]*position:\s*absolute;[\s\S]*backdrop-filter:/);
	assert.match(styles, /data-secondary-surface[\s\S]*filter:\s*blur\(1\.5px\)/);
	assert.match(styles, /\.genre-secondary-surface > \.genre-advanced-subview::\-webkit-scrollbar-thumb[\s\S]*rgb\(70 118 136\)/);
	assert.match(styles, /\.genre-advanced-subview > header\s*\{[\s\S]*position:\s*sticky/);
	assert.match(styles, /\.genre-secondary-done\s*\{[\s\S]*min-width:\s*92px/);
	assert.match(styles, /@media \(max-width: 900px\)[\s\S]*\.genre-secondary-surface\s*\{[\s\S]*inset:\s*0;[\s\S]*safe-area-inset-top/);
	assert.match(styles, /\.genre-exclusion-layout\s*\{[\s\S]*grid-template-columns:/);
	assert.match(styles, /data-multiple-genres="false"[\s\S]*repeat\(3, minmax\(0, 1fr\)\)/);
	assert.match(styles, /data-mobile-view="genres"[\s\S]*data-mobile-view="picker"/);
	assert.match(styles, /data-mobile-detail="true"[\s\S]*genre-exclusion-root-header[\s\S]*display:\s*none/);
	assert.match(styles, /\.genre-exclusion-detail-header\s*\{[\s\S]*position:\s*sticky/);
	assert.match(styles, /\.genre-exclusion-picker-list\s*\{[\s\S]*grid-template-columns:/);
	assert.doesNotMatch(styles, /\.genre-exclusion-picker-list\s*\{[^}]*overflow-y:/);
	assert.match(styles, /\.genre-selection-toolbar\s*\{[\s\S]*display:\s*flex/);
	assert.match(styles, /\.genre-selection-actions\s*\{[\s\S]*display:\s*flex/);
	assert.doesNotMatch(styles, /\.genre-review-list li\[data-attention="true"\]/);
	assert.doesNotMatch(styles, /\.genre-elsewhere-note\s*\{/);
	assert.match(styles, /\.genre-number-input\s*\{[\s\S]*appearance:\s*textfield/);
	assert.match(styles, /\.genre-number-input::\-webkit-inner-spin-button[\s\S]*\-webkit-appearance:\s*none/);
	assert.doesNotMatch(styles, /\.genre-destination-choices label:has\(input:checked\)\s*\{[^}]*box-shadow:\s*none;/);
	assert.match(styles, /\.studio-source-choices label:has\(input:checked\)\s*\{[^}]*box-shadow:\s*inset 0 0 0 1px/);
	assert.match(flow, /genre-destination[^>]*[\s\S]*className="visually-hidden choice-card-input"/);
});
