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
	chooseMovieCollection,
	createSourceEditSession,
	saveSourceEdit,
} from "../builder/src/source-edit/index.js";
import {
	lockAddSourceDocumentBody,
	observeAddSourceViewport,
	resolveAddSourceViewportStyle,
} from "../builder/src/ui/add-source-modal-lifecycle.js";
import { handleDialogKeyDown } from "../builder/src/ui/modal-focus.js";
import {
	focusSourceEditAlert,
	sourceEditErrorPresentation,
} from "../builder/src/ui/source-edit-error-presentation.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vite = await createServer({
	root: path.join(rootDir, "builder"),
	appType: "custom",
	logLevel: "silent",
	server: { middlewareMode: true },
});
const { BuilderWorkspace } = await vite.ssrLoadModule("/src/ui/BuilderWorkspace.jsx");
const {
	PeopleEditorFields,
	NetworkEditorFields,
	SourceEditErrorPanel,
	SourceEditorDialog,
	StudioEditorFields,
	StreamingEditorFields,
} = await vite.ssrLoadModule("/src/ui/SourceEditorDialog.jsx");
const { MovieCollectionPicker } = await vite.ssrLoadModule("/src/ui/MovieCollectionPicker.jsx");
after(() => vite.close());

function countingIdFactory(prefix = "builder") {
	let count = 0;
	return () => `${prefix}-${++count}`;
}

function createController() {
	return createBuilderController({
		idFactory: countingIdFactory(),
		nuvioIdFactory: countingIdFactory("nuvio"),
		initialProjectTitle: "Source edit UI",
	});
}

function fakeProvider(calls = []) {
	return Object.freeze({
		async searchCollections(query, options) {
			calls.push(["search", query, options]);
			return { ok: true, data: { results: [], page: 1, totalPages: 1, totalResults: 0 } };
		},
		async getCollection(id, options) {
			calls.push(["details", id, options]);
			return {
				ok: true,
				data: {
					id,
					name: "Selected Collection",
					overview: "",
					posterPath: null,
					movieCount: 0,
					containedTitles: [],
				},
			};
		},
	});
}

function fakePeopleProvider(calls = [], result = null) {
	return Object.freeze({
		async getPerson(id, options) {
			calls.push(["person", id, options]);
			return result ?? {
				ok: true,
				data: {
					id,
					counts: { actingMovies: 1, actingSeries: 25, directingMovies: 0, directingSeries: 2 },
				},
			};
		},
	});
}

function fakeStudioCatalogueProvider(calls = []) {
	return Object.freeze({
		async searchStudios(input, options) {
			calls.push(["studio", input, options]);
			return { ok: true, data: { results: [], page: 1, totalPages: 1, totalResults: 0 } };
		},
	});
}

function fakeStudioCountProvider(calls = []) {
	return Object.freeze({
		async getStudioCounts(id, options) {
			calls.push(["counts", id, options]);
			return {
				ok: true,
				data: {
					movie: { status: "ready", count: 42 },
					series: { status: "ready", count: 17 },
				},
			};
		},
		async getStudioCount(id, countKey, options) {
			calls.push(["count", id, countKey, options]);
			return { ok: true, data: { status: "ready", count: countKey === "movie" ? 42 : 17 } };
		},
	});
}

function importSources(controller, sources) {
	const imported = controller.importValue([{
		id: "collection",
		title: "Collection",
		folders: [{
			id: "folder",
			title: "Safe folder title",
			hideTitle: true,
			tileShape: "POSTER",
			sources,
		}],
	}]);
	assert.equal(imported.ok, true);
	const folder = controller.getState().project.collections[0].folders[0];
	controller.selectNode(folder.internalId);
	return folder;
}

function collectionSource(overrides = {}) {
	return {
		provider: "tmdb",
		title: "Existing franchise title",
		tmdbSourceType: "COLLECTION",
		tmdbId: 100,
		mediaType: "MOVIE",
		sortBy: "original",
		filters: {},
		...overrides,
	};
}

function peopleSource(overrides = {}) {
	return {
		provider: "tmdb",
		title: "Movie Credits",
		tmdbSourceType: "PERSON",
		tmdbId: 31,
		mediaType: "MOVIE",
		sortBy: "popularity.desc",
		filters: {},
		...overrides,
	};
}

function studioSource(overrides = {}) {
	return {
		provider: "tmdb",
		title: "Pixar",
		tmdbSourceType: "COMPANY",
		tmdbId: 3,
		mediaType: "MOVIE",
		sortBy: "popularity.desc",
		filters: {},
		...overrides,
	};
}

function networkSource(overrides = {}) {
	return {
		provider: "tmdb",
		title: "ABC",
		tmdbSourceType: "NETWORK",
		tmdbId: 2,
		mediaType: "TV",
		sortBy: "popularity.desc",
		filters: {},
		...overrides,
	};
}

function streamingSource(overrides = {}) {
	return {
		provider: "tmdb",
		title: "Netflix · AU",
		tmdbSourceType: "DISCOVER",
		tmdbId: null,
		mediaType: "MOVIE",
		sortBy: "popularity.desc",
		filters: { watchRegion: "AU", withWatchProviders: "8" },
		...overrides,
	};
}

function read(relativePath) {
	return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function renderWorkspace(controller, props = {}) {
	return renderToStaticMarkup(createElement(BuilderWorkspace, {
		controller,
		state: controller.getState(),
		sourceProvider: fakeProvider(),
		peopleProvider: {},
		artworkClient: {},
		...props,
	}));
}

function openEdit(controller, source) {
	const opened = createSourceEditSession(controller.getState().project, source.internalId);
	assert.equal(opened.ok, true);
	return { session: opened.session, draft: opened.draft };
}

test("supported source menus include simple Streaming and show Edit source immediately before Delete", () => {
	const controller = createController();
	importSources(controller, [collectionSource(), peopleSource(), studioSource(), streamingSource()]);
	const markup = renderWorkspace(controller);
	assert.equal((markup.match(/data-action="edit-source"/g) ?? []).length, 4);
	assert.equal((markup.match(/>Edit source<\/button>/g) ?? []).length, 4);
	assert.equal((markup.match(/data-action="delete-source"/g) ?? []).length, 4);
	for (const menu of markup.match(/<div[^>]+data-actions-menu="source"[\s\S]*?<\/div>/g) ?? []) {
		assert.ok(menu.indexOf('data-action="edit-source"') < menu.indexOf('data-action="delete-source"'));
	}
});

test("unsupported source menus retain Delete only with no disabled Edit action", () => {
	const controller = createController();
	importSources(controller, [
		{ provider: "tmdb", title: "List", tmdbSourceType: "LIST", tmdbId: 1, mediaType: "MOVIE" },
		{ provider: "addon", title: "Addon", addonId: "a", type: "movie", catalogId: "c" },
		{ provider: "community", title: "Opaque", unknown: true },
	]);
	const markup = renderWorkspace(controller);
	assert.equal(markup.includes('data-action="edit-source"'), false);
	assert.equal((markup.match(/data-action="delete-source"/g) ?? []).length, 3);
});

test("Collection editor is prepopulated, offline on open, and exposes explicit identity replacement", () => {
	const controller = createController();
	const folder = importSources(controller, [collectionSource({ tmdbId: "00100" })]);
	const edit = openEdit(controller, folder.sources[0]);
	const calls = [];
	const markup = renderToStaticMarkup(createElement(SourceEditorDialog, {
		provider: fakeProvider(calls),
		session: edit.session,
		initialDraft: edit.draft,
		onCancel() {},
		onSave() { return { ok: true }; },
	}));
	assert.equal(calls.length, 0);
	assert.ok(markup.includes("Edit source"));
	assert.ok(markup.includes("In Safe folder title"));
	assert.ok(markup.includes('value="Existing franchise title"'));
	assert.ok(markup.includes("Source name"));
	assert.ok(markup.includes("This is the name shown in Nuvio. You can customise it."));
	assert.equal(markup.includes("Nuvio source title"), false);
	assert.ok(markup.includes("TMDB · COLLECTION · 100 · MOVIE"));
	assert.ok(markup.indexOf("Existing franchise title") < markup.indexOf("TMDB collection 100"));
	assert.ok(markup.includes("Current source title; no canonical TMDB name was fetched."));
	assert.ok(markup.includes("Choose another franchise"));
	assert.equal(markup.includes("Use selected collection name"), false);
	assert.ok(markup.includes('data-action="save-source-edit"'));
	assert.ok(markup.includes('data-action="cancel-source-edit"'));
});

test("People editor opens immediately with four non-blocking counts, title reset, and verified sort choices", () => {
	const controller = createController();
	const folder = importSources(controller, [peopleSource()]);
	const edit = openEdit(controller, folder.sources[0]);
	const collectionCalls = [];
	const peopleCalls = [];
	const markup = renderToStaticMarkup(createElement(SourceEditorDialog, {
		provider: fakeProvider(collectionCalls),
		peopleProvider: fakePeopleProvider(peopleCalls),
		session: edit.session,
		initialDraft: edit.draft,
		onCancel() {},
		onSave() { return { ok: true }; },
	}));
	assert.equal(collectionCalls.length, 0);
	assert.equal(peopleCalls.length, 0);
	for (const text of [
		"Movie Credits", "Series Credits", "Directed Movies", "Directed Series",
		"PERSON · MOVIE", "PERSON · TV", "DIRECTOR · MOVIE", "DIRECTOR · TV",
		"Use default title", "Sort order", "Popular", "Recent", "Top rated",
		"popularity.desc", "primary_release_date.desc", "vote_average.desc",
	]) assert.ok(markup.includes(text), text);
	assert.equal((markup.match(/name="source-edit-people-combination"/g) ?? []).length, 4);
	assert.equal((markup.match(/Checking titles…/g) ?? []).length, 4);
	assert.ok(markup.includes("TMDB · PERSON · 31 · MOVIE"));
	assert.ok(markup.includes("Source name"));
	assert.ok(markup.includes("This name updates automatically until you customise it."));
	assert.equal(markup.includes("Nuvio source title"), false);
	for (const forbidden of ["profile image", "combined credits", "artwork"]) {
		assert.equal(markup.toLowerCase().includes(forbidden), false, forbidden);
	}
});

test("Studio editor opens the fixed Studio identity with count, TMDB link, sort, Save, and Cancel", () => {
	const controller = createController();
	const folder = importSources(controller, [studioSource({ sortBy: "vote_average.desc" })]);
	const edit = openEdit(controller, folder.sources[0]);
	const catalogueCalls = [];
	const countCalls = [];
	const markup = renderToStaticMarkup(createElement(SourceEditorDialog, {
		provider: fakeProvider(),
		peopleProvider: fakePeopleProvider(),
		studioCatalogueProvider: fakeStudioCatalogueProvider(catalogueCalls),
		studioCountProvider: fakeStudioCountProvider(countCalls),
		session: edit.session,
		initialDraft: edit.draft,
		initialStudioCountState: {
			movie: { status: "ready", count: 42 },
			series: { status: "ready", count: 17 },
		},
		onCancel() {},
		onSave() { return { ok: true }; },
	}));
	assert.equal(catalogueCalls.length, 0);
	assert.equal(countCalls.length, 0);
	assert.ok(markup.includes('data-source-edit-adapter="studio"'));
	assert.ok(markup.includes("Update this Studio source name and title order."));
	assert.ok(markup.includes("Movies source"));
	assert.ok(markup.includes("Pixar"));
	assert.ok(markup.includes('href="https://www.themoviedb.org/company/3"'));
	assert.equal(markup.includes('data-entity-logo="studio"'), false);
	assert.equal(markup.includes("Pixar logo"), false);
	assert.ok(markup.includes("42 movies"));
	assert.ok(markup.includes("Sort titles by"));
	assert.ok(markup.includes('data-selected="true"'));
	assert.ok(markup.includes('value="top-rated"'));
	for (const label of ["Popular", "Recent", "Top rated", "Most voted"]) assert.ok(markup.includes(label), label);
	assert.ok(markup.includes("Highest-rated titles first."));
	for (const hiddenDescription of ["Popular titles first.", "Recently released titles first.", "Titles with the most votes first."]) assert.equal(markup.includes(hiddenDescription), false, hiddenDescription);
	assert.equal(markup.includes("Refresh title count"), false);
	assert.equal(markup.includes(">Retry"), false);
	assert.ok(markup.includes('data-action="save-source-edit"'));
	assert.ok(markup.includes('data-action="cancel-source-edit"'));
	assert.ok(markup.includes("Source name"));
	assert.ok(markup.includes("Changes how this source appears in Nuvio, not which Studio it represents."));
	assert.equal(markup.includes("<select"), false);
});

test("Studio editor preserves an unusual imported sort until a supported option is chosen", () => {
	const controller = createController();
	const folder = importSources(controller, [studioSource({ sortBy: "Owner.MixedCase" })]);
	const edit = openEdit(controller, folder.sources[0]);
	const markup = renderToStaticMarkup(createElement(StudioEditorFields, {
		draft: edit.draft,
		studio: { id: 3, name: "Pixar", logoPath: null, country: "US", headquarters: "Emeryville, California" },
		countState: { movie: { status: "unavailable", count: null, error: { retryable: true } }, series: { status: "unavailable", count: null, error: { retryable: true } } },
		onSortChange() {},
	}));
	assert.ok(markup.includes("US · Emeryville, California"));
	assert.equal(markup.includes('data-entity-logo="studio"'), false);
	assert.ok(markup.includes("Current imported sort is preserved until you choose a supported sort: Owner.MixedCase"));
	assert.equal(markup.includes("checked=\"\""), false);
	assert.ok(markup.includes("Count unavailable"));
	assert.equal(markup.includes("Retry Movie count"), false);
	assert.equal(markup.includes("Retry Series count"), false);
	assert.equal(markup.includes("Refresh title count"), false);
});

test("Streaming editor shows fixed fallback identity, four semantic sorts and no unreliable default-name action", () => {
	const controller = createController();
	const folder = importSources(controller, [streamingSource()]);
	const edit = openEdit(controller, folder.sources[0]);
	const markup = renderToStaticMarkup(createElement(SourceEditorDialog, {
		provider: fakeProvider(),
		streamingCatalogueProvider: { loadCatalogue() { throw new Error("effects do not run during SSR"); } },
		session: edit.session,
		initialDraft: edit.draft,
		onCancel() {},
		onSave() { return { ok: true }; },
	}));
	assert.ok(markup.includes('data-source-edit-adapter="streaming"'));
	assert.ok(markup.includes("Update this Streaming source name and title order."));
	assert.ok(markup.includes("Provider 8"));
	assert.ok(markup.includes("Provider ID 8 · AU · Movies"));
	assert.ok(markup.includes("Provider, region and media type stay fixed"));
	for (const label of ["Popular", "Recent", "Top Rated", "Most Votes"]) assert.ok(markup.includes(label), label);
	assert.equal(markup.includes("Use default name"), false);
	assert.equal(markup.includes("Title count"), false);
	assert.equal(markup.includes('href="https://www.themoviedb.org'), false);
	assert.ok(markup.includes("Source name"));
});

test("resolved Streaming provider presentation enables default naming while imported sort stays untouched", () => {
	const markup = renderToStaticMarkup(createElement(StreamingEditorFields, {
		draft: { providerId: 8, regionCode: "AU", mediaType: "TV", sortBy: "owner.imported", originalSortBy: "owner.imported", sortOptionId: null },
		providerIdentity: { id: 8, name: "Netflix", logoPath: "/netflix.png", resolved: true },
		onDefaultName() {},
		onSortChange() {},
	}));
	assert.ok(markup.includes("Netflix"));
	assert.ok(markup.includes("Provider ID 8 · AU · Series"));
	assert.equal(markup.includes('data-entity-logo="streaming-provider"'), false);
	assert.equal(markup.includes("tmdb-entity-logo-tile--streaming-edit"), false);
	assert.equal(markup.includes("/w92/netflix.png"), false);
	assert.ok(markup.includes("Use default name"));
	assert.ok(markup.includes("Current imported sort is preserved until you choose a supported sort: owner.imported"));
	assert.equal(markup.includes("checked=\"\""), false);
	const styles = fs.readFileSync(path.join(rootDir, "builder", "src", "styles.css"), "utf8");
	assert.doesNotMatch(styles, /\.streaming-edit-identity|\.tmdb-entity-logo-tile--streaming-edit/);
	const dialogSource = fs.readFileSync(path.join(rootDir, "builder", "src", "ui", "SourceEditorDialog.jsx"), "utf8");
	assert.match(dialogSource, /streamingCatalogueProvider\.loadCatalogue\(\)/);
	assert.match(dialogSource, /streamingDefaultSourceName\(streamingProviderIdentity\.name, draft\.regionCode, draft\.mediaType\)/);
});

test("Studio Series editor keeps COMPANY/TV visible and preselects the media-correct Recent card", () => {
	const controller = createController();
	const folder = importSources(controller, [studioSource({ title: "Pixar Series", mediaType: "TV", sortBy: "first_air_date.desc" })]);
	const edit = openEdit(controller, folder.sources[0]);
	const markup = renderToStaticMarkup(createElement(StudioEditorFields, {
		draft: edit.draft,
		studio: { id: 3, name: "Pixar", logoPath: null, country: "US", headquarters: "Emeryville, California" },
		countState: { movie: { status: "ready", count: 42 }, series: { status: "ready", count: 17 } },
		onSortChange() {},
	}));
	assert.ok(markup.includes("Series source"));
	assert.ok(markup.includes("COMPANY · TV"));
	assert.ok(markup.includes("17 series"));
	assert.ok(markup.includes('data-selected="true"'));
	assert.ok(markup.includes('value="recent"'));
	assert.equal(markup.includes("primary_release_date.desc"), false);
});

test("Network and Studio Source Edit show only media-specific known-zero notices and keep Save enabled", () => {
	const networkNotice = "TMDB currently returns no series for this network.";
	const movieNotice = "TMDB currently returns no movies for this studio.";
	const seriesNotice = "TMDB currently returns no series for this studio.";
	const networkFields = (countState) => renderToStaticMarkup(createElement(NetworkEditorFields, {
		draft: { sortBy: "popularity.desc", originalSortBy: "popularity.desc", sortOptionId: "popular" },
		network: { id: 2, name: "ABC", logoPath: null, country: "US", headquarters: "New York City, New York" },
		countState,
		onSortChange() {},
	}));
	assert.ok(networkFields({ status: "ready", count: 0 }).includes(networkNotice));
	assert.equal(networkFields({ status: "ready", count: 42 }).includes(networkNotice), false);
	assert.equal(networkFields({ status: "unavailable", count: null }).includes(networkNotice), false);

	const studioFields = (mediaType, countState) => renderToStaticMarkup(createElement(StudioEditorFields, {
		draft: { mediaType, sortBy: "popularity.desc", originalSortBy: "popularity.desc", sortOptionId: "popular" },
		studio: { id: 3, name: "Pixar", logoPath: null, country: "US", headquarters: "Emeryville, California" },
		countState,
		onSortChange() {},
	}));
	const movieZero = studioFields("MOVIE", { movie: { status: "ready", count: 0 }, series: { status: "ready", count: 17 } });
	assert.ok(movieZero.includes(movieNotice));
	assert.equal(movieZero.includes(seriesNotice), false);
	const seriesZero = studioFields("TV", { movie: { status: "ready", count: 42 }, series: { status: "ready", count: 0 } });
	assert.ok(seriesZero.includes(seriesNotice));
	assert.equal(seriesZero.includes(movieNotice), false);
	const studioUnavailable = studioFields("MOVIE", { movie: { status: "unavailable", count: null }, series: { status: "ready", count: 17 } });
	assert.equal(studioUnavailable.includes(movieNotice), false);
	assert.equal(studioUnavailable.includes(seriesNotice), false);

	const controller = createController();
	const folder = importSources(controller, [studioSource(), studioSource({ title: "Pixar Series", mediaType: "TV" }), networkSource()]);
	const cases = [
		{ source: folder.sources[0], props: { initialStudioCountState: { movie: { status: "ready", count: 0 }, series: { status: "ready", count: 17 } } }, notice: movieNotice },
		{ source: folder.sources[1], props: { initialStudioCountState: { movie: { status: "ready", count: 42 }, series: { status: "ready", count: 0 } } }, notice: seriesNotice },
		{ source: folder.sources[2], props: { initialNetworkCountState: { status: "ready", count: 0 } }, notice: networkNotice },
	];
	for (const entry of cases) {
		const edit = openEdit(controller, entry.source);
		const markup = renderToStaticMarkup(createElement(SourceEditorDialog, {
			provider: fakeProvider(),
			peopleProvider: fakePeopleProvider(),
			studioCatalogueProvider: fakeStudioCatalogueProvider(),
			studioCountProvider: fakeStudioCountProvider(),
			session: edit.session,
			initialDraft: edit.draft,
			onCancel() {},
			onSave() { return { ok: true }; },
			...entry.props,
		}));
		assert.ok(markup.includes(entry.notice));
		const saveButton = markup.match(/<button[^>]*data-action="save-source-edit"[^>]*>/)?.[0] ?? "";
		assert.ok(saveButton);
		assert.equal(saveButton.includes("disabled"), false);
	}
});

test("desktop source editors size to content and scroll only when the viewport maximum is exceeded", () => {
	const styles = read("builder/src/styles.css");
	const desktopRule = styles.match(/@media \(min-width: 900px\)[\s\S]*?\.source-edit-dialog\s*\{([^}]*)\}/)?.[1] ?? "";
	assert.match(desktopRule, /height:\s*auto/);
	assert.match(desktopRule, /max-height:\s*100%/);
	assert.doesNotMatch(desktopRule, /min-height|min\(760px/);
	assert.match(styles, /@media \(min-width: 900px\)[\s\S]*?\.source-edit-dialog \.source-edit-scroll\s*\{[^}]*padding-bottom:\s*20px/);
	assert.match(styles, /@media \(min-width: 900px\)[\s\S]*?\.source-edit-title-field \.editor-field-error:empty\s*\{[^}]*display:\s*none/);
	assert.match(styles, /\.source-edit-scroll,[\s\S]*display:\s*grid[\s\S]*min-width:\s*0/);
	assert.match(styles, /\.add-source-scroll\s*\{[\s\S]*min-height:\s*0[\s\S]*overflow-y:\s*auto/);

	const controller = createController();
	const folder = importSources(controller, [collectionSource(), peopleSource()]);
	for (const source of folder.sources) {
		const edit = openEdit(controller, source);
		const markup = renderToStaticMarkup(createElement(SourceEditorDialog, {
			provider: fakeProvider(),
			peopleProvider: fakePeopleProvider(),
			session: edit.session,
			initialDraft: edit.draft,
			onCancel() {},
			onSave() { return { ok: true }; },
		}));
		assert.match(markup, /<footer class="add-source-actions source-edit-actions">/);
		assert.ok(markup.indexOf('class="add-source-scroll source-edit-scroll"') < markup.indexOf('class="add-source-actions source-edit-actions"'));
		assert.ok(markup.includes('data-action="cancel-source-edit"'));
	}
});

test("desktop People layout keeps Sort order before the attached action footer", () => {
	const controller = createController();
	const folder = importSources(controller, [peopleSource()]);
	const edit = openEdit(controller, folder.sources[0]);
	const markup = renderToStaticMarkup(createElement(SourceEditorDialog, {
		provider: fakeProvider(),
		peopleProvider: fakePeopleProvider(),
		session: edit.session,
		initialDraft: edit.draft,
		onCancel() {},
		onSave() { return { ok: true }; },
	}));
	assert.ok(markup.indexOf("Sort order") < markup.indexOf("Save changes"));
	assert.match(markup, /<footer[^>]*>[\s\S]*data-action="save-source-edit"[\s\S]*data-action="cancel-source-edit"[\s\S]*<\/footer>/);
});

test("selected Collection name is prominent, becomes the draft title, and precedes secondary ID metadata", () => {
	const controller = createController();
	const folder = importSources(controller, [collectionSource()]);
	const edit = openEdit(controller, folder.sources[0]);
	const selectedDraft = chooseMovieCollection(edit.draft, { id: 389767, name: "My Big Fat Greek Wedding Collection" });
	const markup = renderToStaticMarkup(createElement(SourceEditorDialog, {
		provider: fakeProvider(),
		session: edit.session,
		initialDraft: selectedDraft,
		onCancel() {},
		onSave() { return { ok: true }; },
	}));
	assert.ok(markup.includes('value="My Big Fat Greek Wedding Collection"'));
	assert.ok(markup.indexOf("My Big Fat Greek Wedding Collection") < markup.indexOf("TMDB collection 389767"));
	assert.ok(markup.includes("This is the collection that will be saved."));
	assert.ok(markup.includes("Use selected collection name"));
	assert.ok(markup.includes("This name updates automatically until you customise it."));
});

test("absent or null imported title does not receive a serialized UI fallback", () => {
	const controller = createController();
	const folder = importSources(controller, [collectionSource({ title: null })]);
	const edit = openEdit(controller, folder.sources[0]);
	const markup = renderToStaticMarkup(createElement(SourceEditorDialog, {
		provider: fakeProvider(),
		session: edit.session,
		initialDraft: edit.draft,
		onCancel() {},
		onSave() { return { ok: true }; },
	}));
	assert.equal(edit.draft.title, "");
	assert.ok(markup.includes('id="source-edit-title-input"'));
	assert.equal(markup.includes('value="Movie Collection"'), false);
});

test("duplicate Save produces a prominent alert panel, focuses it, preserves the draft, and never updates", () => {
	const controller = createController();
	const folder = importSources(controller, [
		collectionSource({ tmdbId: 100, title: "First" }),
		collectionSource({ tmdbId: 200, title: "Conflicting custom title" }),
	]);
	const edit = openEdit(controller, folder.sources[0]);
	const draft = chooseMovieCollection(edit.draft, { id: 200, name: "Replacement Collection" });
	const draftBefore = structuredClone(draft);
	let updates = 0;
	const result = saveSourceEdit({
		...controller,
		updateNode() {
			updates += 1;
			throw new Error("duplicate Save must not update");
		},
	}, edit.session, draft);
	assert.equal(result.duplicateRejected, true);
	assert.equal(updates, 0);
	assert.deepEqual(draft, draftBefore);

	const presentation = sourceEditErrorPresentation(result);
	assert.equal(presentation.heading, "Source already exists");
	const markup = renderToStaticMarkup(createElement(SourceEditErrorPanel, { result }));
	assert.match(markup, /class="editor-diagnostics source-edit-diagnostics" role="alert" aria-atomic="true" tabindex="-1"/);
	assert.ok(markup.includes("<h3>Source already exists</h3>"));
	assert.ok(markup.includes("This folder already contains that Movie Collection."));
	assert.equal(markup.includes("Conflicting custom title"), false);

	const interactions = [];
	const alert = {
		scrollIntoView(options) { interactions.push(["scroll", options]); },
		focus(options) { interactions.push(["focus", options]); },
	};
	assert.equal(focusSourceEditAlert(alert), true);
	assert.deepEqual(interactions, [
		["scroll", { behavior: "smooth", block: "nearest" }],
		["focus", { preventScroll: true }],
	]);
});

test("People count failure shows friendly Retry while Save remains enabled and no artwork client is requested", () => {
	const controller = createController();
	const folder = importSources(controller, [peopleSource()]);
	const edit = openEdit(controller, folder.sources[0]);
	const markup = renderToStaticMarkup(createElement(SourceEditorDialog, {
		provider: fakeProvider(),
		peopleProvider: fakePeopleProvider(),
		session: edit.session,
		initialDraft: edit.draft,
		initialPeopleCountState: {
			status: "failed",
			counts: null,
			error: { message: "raw provider detail", retryable: true },
			checkedAt: null,
		},
		onCancel() {},
		onSave() { return { ok: true }; },
	}));
	assert.ok(markup.includes("Couldn’t check titles"));
	assert.ok(markup.includes(">Retry</button>"));
	assert.equal(markup.includes("raw provider detail"), false);
	assert.match(markup, /data-action="save-source-edit">Save changes<\/button>/);
	assert.doesNotMatch(markup, /data-action="save-source-edit"[^>]*disabled/);
	assert.equal(read("builder/src/ui/SourceEditorDialog.jsx").includes("artworkClient"), false);
});

test("People sort UI preserves an unusual imported value until the user changes it", () => {
	const controller = createController();
	const folder = importSources(controller, [peopleSource({ sortBy: "Owner.MixedCase" })]);
	const edit = openEdit(controller, folder.sources[0]);
	const markup = renderToStaticMarkup(createElement(PeopleEditorFields, {
		draft: edit.draft,
		countState: { status: "ready", counts: { actingMovies: 0, actingSeries: 1, directingMovies: 2, directingSeries: 3 } },
		onChange() {},
		onDefaultTitle() {},
		onRetryCounts() {},
		onSortChange() {},
	}));
	assert.ok(markup.includes("Current imported value (preserved): Owner.MixedCase"));
	assert.ok(markup.includes('value="__source_edit_imported_sort__" selected=""'));
	for (const value of ["popularity.desc", "primary_release_date.desc", "vote_average.desc"]) {
		assert.ok(markup.includes(`value="${value}"`), value);
	}
	assert.equal(markup.includes("first_air_date.desc"), false);
});

test("an open source editor makes the workspace inert and retains one polite success region", () => {
	const controller = createController();
	const folder = importSources(controller, [collectionSource()]);
	const markup = renderWorkspace(controller, { initialSourceEdit: openEdit(controller, folder.sources[0]) });
	assert.match(markup, /<main[^>]+data-source-edit-open="true"/);
	assert.match(markup, /<div[^>]+data-workspace-underlay="true"[^>]+inert=""[^>]+aria-hidden="true"/);
	assert.equal((markup.match(/data-source-edit-modal="true"/g) ?? []).length, 1);
	assert.match(markup, /data-source-edit-status="true" role="status" aria-live="polite"/);
});

test("the extracted Collection picker retains accepted Search inputs and recoverable controls", () => {
	const markup = renderToStaticMarkup(createElement(MovieCollectionPicker, {
		provider: fakeProvider(),
		onSelect() {},
	}));
	assert.ok(markup.includes('data-source-edit-picker="movie-collection"'));
	assert.ok(markup.includes("Search or enter an exact collection"));
	assert.ok(markup.includes("positive TMDB collection ID or HTTPS collection URL"));
	const source = read("builder/src/ui/MovieCollectionPicker.jsx");
	assert.match(source, /provider\.searchCollections/);
	assert.match(source, /provider\.getCollection/);
	assert.match(source, /<AddSourceSearchStep/);
	assert.match(source, /onRetryLookup/);
	assert.match(source, /onRetrySelection/);
	assert.match(source, /changePage/);
	assert.equal(source.includes("fetch("), false);
});

test("Cancel, Escape, and backdrop behavior are non-mutating modal actions", () => {
	let cancelled = 0;
	const event = {
		key: "Escape",
		preventDefault() {},
	};
	assert.equal(handleDialogKeyDown(event, null, () => { cancelled += 1; }), "cancel");
	assert.equal(cancelled, 1);
	const dialog = read("builder/src/ui/SourceEditorDialog.jsx");
	assert.match(dialog, /data-backdrop-dismiss="false"/);
	assert.match(dialog, /event\.target === event\.currentTarget[\s\S]*focusElementWithoutScroll\(dialogRef\.current\)/);
	assert.match(dialog, /handleDialogKeyDown\(event, dialogRef\.current, cancel\)/);
	assert.doesNotMatch(dialog, /onMouseDown=\{onCancel\}|window\.confirm/);
});

test("focus containment wraps both ends of the dialog", () => {
	const first = { focusCalls: 0, focus() { this.focusCalls += 1; } };
	const last = { focusCalls: 0, focus() { this.focusCalls += 1; } };
	const dialog = { querySelectorAll() { return [first, last]; } };
	let prevented = 0;
	const forward = { key: "Tab", shiftKey: false, target: last, preventDefault() { prevented += 1; } };
	const backward = { key: "Tab", shiftKey: true, target: first, preventDefault() { prevented += 1; } };
	assert.equal(handleDialogKeyDown(forward, dialog, () => {}), "wrapped-forward");
	assert.equal(handleDialogKeyDown(backward, dialog, () => {}), "wrapped-backward");
	assert.equal(first.focusCalls, 1);
	assert.equal(last.focusCalls, 1);
	assert.equal(prevented, 2);
});

test("shared body locking and Visual Viewport observation preserve the accepted lifecycle", () => {
	const body = {
		attributes: new Map([["style", "color: red"], ["class", "before"]]),
		style: {},
		classList: { add() {} },
		getAttribute(name) { return this.attributes.get(name) ?? null; },
		setAttribute(name, value) { this.attributes.set(name, value); },
		removeAttribute(name) { this.attributes.delete(name); },
	};
	const listeners = [];
	const visualViewport = {
		offsetTop: 7,
		offsetLeft: 5,
		width: 393,
		height: 600,
		addEventListener(type) { listeners.push(["add", type]); },
		removeEventListener(type) { listeners.push(["remove", type]); },
	};
	const view = {
		innerWidth: 412,
		innerHeight: 800,
		scrollX: 2,
		scrollY: 9,
		visualViewport,
		addEventListener(type) { listeners.push(["add-window", type]); },
		removeEventListener(type) { listeners.push(["remove-window", type]); },
		scrollTo() {},
	};
	assert.deepEqual(resolveAddSourceViewportStyle(view), { top: "7px", left: "5px", width: "393px", height: "600px" });
	const stop = observeAddSourceViewport(() => {}, view);
	stop();
	const unlock = lockAddSourceDocumentBody({ body }, view);
	unlock();
	assert.equal(body.getAttribute("style"), "color: red");
	assert.equal(body.getAttribute("class"), "before");
	assert.ok(listeners.some(([kind, type]) => kind === "add" && type === "resize"));
	assert.ok(listeners.some(([kind, type]) => kind === "remove" && type === "scroll"));
});

test("conflict, trigger restoration, and updated-card focus lifecycles remain explicitly wired", () => {
	const dialog = read("builder/src/ui/SourceEditorDialog.jsx");
	const workspace = read("builder/src/ui/BuilderWorkspace.jsx");
	assert.match(dialog, /className="editor-diagnostics source-edit-diagnostics" role="alert" aria-atomic="true" tabIndex=\{-1\}/);
	assert.match(dialog, /createPeopleEditCountSession[\s\S]*countSession\.load\(\)/);
	assert.match(dialog, /countSession\.load\(\{ retry: true \}\)/);
	assert.match(dialog, /data-action="back-to-source-edit"[\s\S]*setStage\("edit"\)[\s\S]*focusElementWithoutScroll\(chooseButtonRef\.current\)/);
	assert.match(workspace, /sourceEditRestoreFocusRef\.current = trigger/);
	assert.match(workspace, /restoreSourceEditTriggerFocus[\s\S]*focusElementWithoutScroll\(trigger\)/);
	assert.match(workspace, /setPendingEditedSourceFocus\(result\.updatedInternalId\)/);
	assert.match(workspace, /pendingEditedSourceFocus[\s\S]*primaryControlRefs\.current\.get/);
	assert.match(workspace, /Source changes were not saved/);
	assert.match(workspace, /peopleProvider=\{peopleProviderRef\.current\}/);
});

test("responsive source editor styles are safe-area aware and bounded for every required mobile width", () => {
	const styles = read("builder/src/styles.css");
	for (const inset of ["top", "right", "bottom", "left"]) {
		assert.ok(styles.includes(`safe-area-inset-${inset}`), inset);
	}
	assert.match(styles, /\.source-edit-identity\s*\{[\s\S]*minmax\(0,\s*0\.45fr\) minmax\(0,\s*1fr\)/);
	assert.match(styles, /\.source-edit-combination\s*\{[\s\S]*min-width:\s*0[\s\S]*min-height:\s*58px/);
	assert.match(styles, /\.source-edit-diagnostics\s*\{[\s\S]*border:\s*1px solid rgb\(255 142 134/);
	assert.match(styles, /\.source-edit-sort-field select\s*\{[\s\S]*min-width:\s*0/);
	assert.match(styles, /@media \(max-width: 420px\)[\s\S]*\.source-edit-identity,[\s\S]*\.source-edit-combinations,[\s\S]*\.source-edit-option-actions\s*\{[\s\S]*minmax\(0,\s*1fr\)/);
	assert.match(styles, /\.source-edit-actions\s*\{[\s\S]*minmax\(0,\s*1\.5fr\) minmax\(100px,\s*1fr\)/);
	assert.match(styles, /@media \(max-width: 899px\)[\s\S]*\.source-edit-dialog\s*\{[\s\S]*height:\s*100%[\s\S]*max-height:\s*100%[\s\S]*align-self:\s*stretch/);
	assert.match(styles, /\.add-source-form\s*\{[\s\S]*grid-template-rows:\s*minmax\(0,\s*1fr\) auto[\s\S]*overflow:\s*hidden/);
	for (const width of [360, 384, 393, 402, 412]) assert.ok(width <= 420);
});
