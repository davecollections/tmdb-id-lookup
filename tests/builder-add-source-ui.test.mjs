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
	lockAddSourceDocumentBody,
	observeAddSourceViewport,
	resolveAddSourceViewportStyle,
} from "../builder/src/ui/add-source-modal-lifecycle.js";
import {
	ADD_SOURCE_STEPS,
	completeAddSourceSearchRestore,
	createAddSourceNavigationState,
	enterAddSourceReview,
	returnAddSourceToSearch,
} from "../builder/src/ui/add-source-navigation-state.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vite = await createServer({
	root: path.join(rootDir, "builder"),
	appType: "custom",
	logLevel: "silent",
	server: { middlewareMode: true },
});
const { BuilderWorkspace } = await vite.ssrLoadModule("/src/ui/BuilderWorkspace.jsx");
const {
	AddSourcePrimaryAction,
	AddSourceReviewStep,
	AddSourceSearchStep,
} = await vite.ssrLoadModule("/src/ui/AddSourceDialog.jsx");
after(() => vite.close());

function countingIdFactory(prefix = "builder") {
	let count = 0;
	return () => `${prefix}-${++count}`;
}

function createController() {
	return createBuilderController({
		idFactory: countingIdFactory(),
		nuvioIdFactory: countingIdFactory("nuvio"),
		initialProjectTitle: "Add source UI",
	});
}

function detailsResult(overrides = {}) {
	return {
		id: 123,
		name: "Example Collection",
		overview: "A safe collection overview.",
		posterPath: "/poster.jpg",
		movieCount: 2,
		containedTitles: [
			{ title: "First Movie", releaseYear: 2001 },
			{ title: "Second Movie", releaseYear: null },
		],
		...overrides,
	};
}

function fakeProvider() {
	return Object.freeze({
		async searchCollections() {
			return {
				ok: true,
				data: {
					results: [],
					page: 1,
					totalPages: 1,
					totalResults: 0,
				},
			};
		},
		async getCollection() {
			return {
				ok: true,
				data: detailsResult(),
			};
		},
	});
}

function importFolder(controller, { populated = false } = {}) {
	const result = controller.importValue([{
		id: "collection",
		title: "Collection",
		folders: [{
			id: "folder",
			title: "Franchises",
			sources: populated ? [{
				provider: "tmdb",
				title: "Existing",
				tmdbSourceType: "COLLECTION",
				tmdbId: 456,
				mediaType: "MOVIE",
				sortBy: "original",
				filters: {},
			}] : [],
		}],
	}]);
	assert.equal(result.ok, true);
	const folder = controller.getState().project.collections[0].folders[0];
	controller.selectNode(folder.internalId);
	return folder;
}

function renderWorkspace(controller, props = {}) {
	return renderToStaticMarkup(createElement(BuilderWorkspace, {
		controller,
		state: controller.getState(),
		sourceProvider: fakeProvider(),
		...props,
	}));
}

function read(relativePath) {
	return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function openingTag(markup, marker) {
	const index = markup.indexOf(marker);
	assert.notEqual(index, -1, marker);
	return markup.slice(markup.lastIndexOf("<", index), markup.indexOf(">", index) + 1);
}

function renderSearchStep({
	totalPages = 1,
	page = 1,
	results = [detailsResult({ movieCount: null, containedTitles: null })],
} = {}) {
	const data = {
		results,
		page,
		totalPages,
		totalResults: results.length,
	};
	return renderToStaticMarkup(createElement(AddSourceSearchStep, {
		input: "example",
		inputRef: null,
		parsedInput: {
			kind: "search",
			query: "example",
			eligible: true,
			message: null,
		},
		lookupState: {
			status: "success",
			requestId: 1,
			context: { query: "example", page },
			data,
			error: null,
		},
		lookupMessage: null,
		searchData: data,
		selectedResult: null,
		selectionState: {
			status: "idle",
			requestId: 0,
			context: null,
			data: null,
			error: null,
		},
		selectionCandidate: null,
		selectionMessage: null,
		onInputChange() {},
		onRetryLookup() {},
		onSelectResult() {},
		onRetrySelection() {},
		onChangePage() {},
	}));
}

test("Sources shows no disabled or ambiguous Add action without a selected folder", () => {
	const markup = renderWorkspace(createController());
	assert.equal(markup.includes('data-action="add-source"'), false);
	assert.equal(markup.includes('data-action="add-source-empty"'), false);
	assert.equal(markup.includes('data-action="add-source-after-list"'), false);
	assert.ok(markup.includes("Select a folder to view its sources."));
});

test("selected empty folder exposes shared Add actions and an intentional inline mobile count", () => {
	const controller = createController();
	importFolder(controller);
	const markup = renderWorkspace(controller);
	assert.equal((markup.match(/data-action="add-source"/g) ?? []).length, 1);
	assert.equal((markup.match(/data-action="add-source-empty"/g) ?? []).length, 1);
	assert.equal(markup.includes('data-action="add-source-after-list"'), false);
	assert.ok(markup.includes("Add first source"));
	assert.ok(markup.includes('class="panel-title-inline-count mobile-only"> · 0</span>'));
	assert.ok(markup.includes("panel-count panel-count-desktop-only"));
});

test("selected populated folder exposes header and trailing Add entry points", () => {
	const controller = createController();
	importFolder(controller, { populated: true });
	const markup = renderWorkspace(controller);
	assert.equal((markup.match(/data-action="add-source"/g) ?? []).length, 1);
	assert.equal((markup.match(/data-action="add-source-after-list"/g) ?? []).length, 1);
	assert.equal(markup.includes('data-action="add-source-empty"'), false);
	assert.ok(markup.indexOf("Existing") < markup.indexOf("Add another source"));
	assert.ok(markup.includes('class="panel-title-inline-count mobile-only"> · 1</span>'));
});

test("initial Add Source dialog is a Search task with Close and no reserved action footer", () => {
	const controller = createController();
	importFolder(controller);
	const markup = renderWorkspace(controller, { initialAddSourceOpen: true });

	assert.match(
		markup,
		/data-add-source-modal="true" data-add-source-step="search" data-source-mode="tmdb-movie-franchise" role="dialog" aria-modal="true"/,
	);
	assert.equal((markup.match(/data-add-source-modal="true"/g) ?? []).length, 1);
	assert.ok(openingTag(markup, 'data-add-source-portal="true"').includes('data-mobile-surface="opaque"'));
	assert.ok(markup.includes("Adding to Franchises"));
	assert.ok(markup.includes("Movie franchise"));
	assert.ok(markup.includes("Official TMDB movie collection"));
	assert.ok(markup.includes('data-action="cancel-add-source"'));
	assert.equal(markup.includes('class="add-source-actions"'), false);
	assert.equal(markup.includes('data-action="apply-add-source"'), false);
	assert.equal(markup.includes('data-source-recipe="tmdb-collection"'), false);
});

test("Add Source participates in the inert modal lock and disables hierarchy actions", () => {
	const controller = createController();
	importFolder(controller, { populated: true });
	const markup = renderWorkspace(controller, { initialAddSourceOpen: true });

	assert.ok(openingTag(markup, 'data-workspace-underlay="true"').includes("inert"));
	assert.ok(openingTag(markup, 'data-builder-shell="true"').includes('data-add-source-open="true"'));
	for (const action of [
		"return-builder-home",
		"create-collection",
		"create-folder",
		"add-source",
		"add-source-after-list",
		"reorder-source",
		"open-source-actions",
	]) {
		assert.ok(openingTag(markup, `data-action="${action}"`).includes("disabled"), action);
	}
});

test("Search results render safe poster metadata and omit pagination for one page", () => {
	const markup = renderSearchStep();
	assert.ok(markup.includes("Example Collection"));
	assert.ok(markup.includes("TMDB 123"));
	assert.ok(markup.includes("https://image.tmdb.org/t/p/w185/poster.jpg"));
	assert.ok(markup.includes("No poster available"));
	assert.equal(markup.includes("Previous page"), false);
	assert.equal(markup.includes("Next page"), false);
	assert.equal(markup.includes("Fixed source recipe"), false);
});

test("multi-page Search renders compact labelled navigation with correct boundaries", () => {
	let markup = renderSearchStep({ totalPages: 3, page: 1 });
	assert.ok(markup.includes('aria-label="Search result pages"'));
	assert.ok(openingTag(markup, "Previous page").includes("disabled"));
	assert.equal(openingTag(markup, "Next page").includes("disabled"), false);

	markup = renderSearchStep({ totalPages: 3, page: 3 });
	assert.equal(openingTag(markup, "Previous page").includes("disabled"), false);
	assert.ok(openingTag(markup, "Next page").includes("disabled"));
});

test("Review renders poster, canonical recipe, editable title, and accessible contained-title expansion", () => {
	const markup = renderToStaticMarkup(createElement(AddSourceReviewStep, {
		selectedResult: detailsResult(),
		title: "Edited source title",
		titleInputRef: null,
		titleError: null,
		titlesExpanded: true,
		duplicate: null,
		applyDiagnostic: null,
		onTitleChange() {},
		onToggleTitles() {},
	}));

	assert.ok(markup.includes("https://image.tmdb.org/t/p/w342/poster.jpg"));
	assert.ok(markup.includes('alt="Collection poster artwork"'));
	assert.ok(markup.includes("2 titles in this collection"));
	assert.ok(markup.includes('value="Edited source title"'));
	assert.ok(markup.includes('data-source-recipe="tmdb-collection"'));
	assert.ok(markup.includes("TMDB-provided order"));
	assert.equal(markup.includes("Original order"), false);
	assert.ok(markup.includes('aria-expanded="true"'));
	assert.ok(markup.includes('aria-controls="add-source-contained-titles"'));
	assert.ok(markup.includes("First Movie"));
	assert.ok(markup.includes("2001"));
	assert.ok(markup.includes("Second Movie"));
	assert.ok(markup.includes("Year unavailable"));
});

test("Review uses a stable no-poster placeholder without emitting an image URL", () => {
	const markup = renderToStaticMarkup(createElement(AddSourceReviewStep, {
		selectedResult: detailsResult({ posterPath: null }),
		title: "Example Collection",
		titleInputRef: null,
		titleError: null,
		titlesExpanded: false,
		duplicate: null,
		applyDiagnostic: null,
		onTitleChange() {},
		onToggleTitles() {},
	}));
	assert.ok(markup.includes("No poster available"));
	assert.equal(markup.includes("https://image.tmdb.org"), false);
	assert.ok(markup.includes('aria-expanded="false"'));
	assert.equal(markup.includes('id="add-source-contained-titles"'), false);
});

test("primary action states are visually and semantically distinct", () => {
	const disabled = renderToStaticMarkup(createElement(AddSourcePrimaryAction, {
		disabled: true,
	}));
	assert.ok(openingTag(disabled, 'data-action="apply-add-source"').includes("disabled"));
	assert.ok(openingTag(disabled, 'data-action="apply-add-source"').includes('aria-disabled="true"'));

	const loading = renderToStaticMarkup(createElement(AddSourcePrimaryAction, {
		disabled: true,
		isApplying: true,
	}));
	assert.ok(loading.includes("Adding source…"));

	const duplicate = renderToStaticMarkup(createElement(AddSourcePrimaryAction, {
		duplicate: { identity: "tmdb|COLLECTION|123|MOVIE" },
	}));
	assert.ok(duplicate.includes('data-action="add-source-anyway"'));
	assert.ok(duplicate.includes("Add anyway"));
});

test("Search and Review navigation preserves selected result, scroll position, and focus target", () => {
	const initial = createAddSourceNavigationState();
	assert.equal(initial.step, ADD_SOURCE_STEPS.SEARCH);
	const review = enterAddSourceReview(initial, 123, 428.5);
	assert.deepEqual(review, {
		step: ADD_SOURCE_STEPS.REVIEW,
		selectedId: 123,
		searchScrollTop: 428.5,
		restoreSearchFocusId: null,
	});
	const search = returnAddSourceToSearch(review);
	assert.equal(search.step, ADD_SOURCE_STEPS.SEARCH);
	assert.equal(search.searchScrollTop, 428.5);
	assert.equal(search.restoreSearchFocusId, 123);
	assert.equal(completeAddSourceSearchRestore(search).restoreSearchFocusId, null);
	assert.throws(() => enterAddSourceReview(initial, 0), /positive safe TMDB collection ID/);
});

test("Visual Viewport geometry updates for keyboard and browser-chrome changes and cleans up listeners", () => {
	function eventTarget(properties = {}) {
		const listeners = new Map();
		return {
			...properties,
			addEventListener(type, listener) {
				listeners.set(type, new Set([...(listeners.get(type) ?? []), listener]));
			},
			removeEventListener(type, listener) {
				listeners.get(type)?.delete(listener);
			},
			emit(type) {
				for (const listener of listeners.get(type) ?? []) listener();
			},
			listenerCount(type) {
				return listeners.get(type)?.size ?? 0;
			},
		};
	}

	const visualViewport = eventTarget({
		offsetTop: 52,
		offsetLeft: 3,
		width: 387,
		height: 710,
	});
	const view = eventTarget({
		innerWidth: 393,
		innerHeight: 852,
		visualViewport,
	});
	assert.deepEqual(resolveAddSourceViewportStyle(view), {
		top: "52px",
		left: "3px",
		width: "387px",
		height: "710px",
	});

	const states = [];
	const cleanup = observeAddSourceViewport((style) => states.push(style), view);
	visualViewport.offsetTop = 281;
	visualViewport.height = 390;
	visualViewport.emit("resize");
	assert.deepEqual(states.at(-1), {
		top: "281px",
		left: "3px",
		width: "387px",
		height: "390px",
	});
	visualViewport.offsetTop = 18;
	visualViewport.offsetLeft = 9;
	visualViewport.width = 375;
	visualViewport.height = 734;
	visualViewport.emit("scroll");
	assert.deepEqual(states.at(-1), {
		top: "18px",
		left: "9px",
		width: "375px",
		height: "734px",
	});
	assert.equal(visualViewport.listenerCount("resize"), 1);
	assert.equal(visualViewport.listenerCount("scroll"), 1);
	cleanup();
	assert.equal(visualViewport.listenerCount("resize"), 0);
	assert.equal(visualViewport.listenerCount("scroll"), 0);
	visualViewport.emit("resize");
	assert.equal(states.length, 3);
});

test("initial viewport geometry safely covers the layout viewport before Visual Viewport events", () => {
	const layoutOnly = {
		innerWidth: 412,
		innerHeight: 915,
		visualViewport: null,
	};
	assert.deepEqual(resolveAddSourceViewportStyle(layoutOnly), {
		top: "0px",
		left: "0px",
		width: "412px",
		height: "915px",
	});

	const invalidVisualViewport = {
		innerWidth: 393,
		innerHeight: 852,
		visualViewport: {
			offsetTop: 300,
			offsetLeft: 20,
			width: 0,
			height: Number.NaN,
		},
	};
	assert.deepEqual(resolveAddSourceViewportStyle(invalidVisualViewport), {
		top: "0px",
		left: "0px",
		width: "393px",
		height: "852px",
	});
});

test("body lock prevents page scrolling and restores exact prior styles, class state, and scroll position", () => {
	function createBody({ styleAttribute = null, classAttribute = null } = {}) {
		const classes = new Set(classAttribute?.split(/\s+/).filter(Boolean) ?? []);
		return {
			styleAttribute,
			classAttribute,
			style: {},
			classList: {
				add(value) {
					classes.add(value);
					this.owner.classAttribute = [...classes].join(" ");
				},
				remove(value) {
					classes.delete(value);
					this.owner.classAttribute = classes.size ? [...classes].join(" ") : null;
				},
				contains(value) { return classes.has(value); },
			},
			getAttribute(name) {
				if (name === "style") return this.styleAttribute;
				if (name === "class") return this.classAttribute;
				return null;
			},
			setAttribute(name, value) {
				if (name === "style") this.styleAttribute = value;
				if (name === "class") {
					this.classAttribute = value;
					classes.clear();
					value.split(/\s+/).filter(Boolean).forEach((entry) => classes.add(entry));
				}
			},
			removeAttribute(name) {
				if (name === "style") this.styleAttribute = null;
				if (name === "class") {
					this.classAttribute = null;
					classes.clear();
				}
			},
		};
	}

	const body = createBody({ styleAttribute: "color: red;", classAttribute: "theme-custom density-compact" });
	body.classList.owner = body;
	const scrollCalls = [];
	const view = {
		scrollX: 12,
		scrollY: 345,
		scrollTo(x, y) { scrollCalls.push([x, y]); },
	};
	const unlock = lockAddSourceDocumentBody({ body }, view);
	assert.equal(body.classList.contains("settings-modal-open"), true);
	assert.equal(body.style.position, "fixed");
	assert.equal(body.style.top, "-345px");
	assert.equal(body.style.left, "-12px");
	assert.equal(body.style.overflow, "hidden");
	unlock();
	unlock();
	assert.equal(body.styleAttribute, "color: red;");
	assert.equal(body.classAttribute, "theme-custom density-compact");
	assert.equal(body.classList.contains("settings-modal-open"), false);
	assert.deepEqual(scrollCalls, [[12, 345]]);

	const prelockedBody = createBody({ classAttribute: "settings-modal-open custom-existing" });
	prelockedBody.classList.owner = prelockedBody;
	const unlockPrelocked = lockAddSourceDocumentBody({ body: prelockedBody }, view);
	unlockPrelocked();
	assert.equal(prelockedBody.classList.contains("settings-modal-open"), true);
	assert.equal(prelockedBody.classAttribute, "settings-modal-open custom-existing");
});

test("responsive CSS provides an opaque full Visual Viewport task surface and safe action area below 900px", () => {
	const styles = read("builder/src/styles.css");
	const dialogSource = read("builder/src/ui/AddSourceDialog.jsx");
	assert.match(styles, /\.add-source-portal\s*\{[\s\S]*z-index:\s*3000[\s\S]*isolation:\s*isolate/);
	assert.match(styles, /\.add-source-dialog\s*\{[\s\S]*width:\s*100%[\s\S]*height:\s*100%/);
	assert.match(styles, /\.add-source-scroll\s*\{[\s\S]*overflow-y:\s*auto[\s\S]*overscroll-behavior:\s*contain/);
	assert.match(styles, /@media \(max-width: 899px\)[\s\S]*\.add-source-portal\s*\{[\s\S]*background:\s*rgb\(7 24 33\)/);
	assert.match(styles, /@media \(max-width: 899px\)[\s\S]*\.settings-modal-backdrop\.add-source-backdrop\s*\{[\s\S]*padding:\s*0[\s\S]*background:\s*rgb\(7 24 33\)/);
	assert.match(styles, /@media \(max-width: 899px\)[\s\S]*\.add-source-dialog\s*\{[\s\S]*isolation:\s*isolate[\s\S]*background:\s*rgb\(7 24 33\)[\s\S]*border:\s*0[\s\S]*border-radius:\s*0/);
	assert.match(styles, /@media \(max-width: 899px\)[\s\S]*\.panel-count\.panel-count-desktop-only\s*\{\s*display:\s*none/);
	assert.match(styles, /\.add-source-review-poster-frame\s*\{[\s\S]*width:\s*clamp\(180px,\s*48vw,\s*220px\)/);
	assert.match(styles, /@media \(max-width: 899px\) and \(max-height: 600px\)[\s\S]*width:\s*clamp\(140px,\s*40vw,\s*180px\)/);
	assert.match(styles, /@media \(min-width: 600px\) and \(max-width: 899px\) and \(max-height: 600px\)[\s\S]*grid-template-columns:\s*180px minmax\(0,\s*1fr\)/);
	assert.match(styles, /\.add-source-result-poster,[\s\S]*\.add-source-review-poster\s*\{[\s\S]*object-fit:\s*contain/);
	assert.equal(/\.add-source-review-poster\s*\{[^}]*object-fit:\s*cover/s.test(styles), false);
	assert.match(styles, /\.add-source-recipe dl > div\s*\{[\s\S]*min-width:\s*0/);
	assert.match(styles, /\.add-source-recipe dd\s*\{[\s\S]*overflow-wrap:\s*anywhere/);
	assert.match(dialogSource, /usePrePaintLayoutEffect\(\(\) => \{[\s\S]*lockAddSourceDocumentBody\(\)[\s\S]*observeAddSourceViewport/);
	for (const inset of ["top", "right", "bottom", "left"]) {
		assert.ok(styles.includes(`safe-area-inset-${inset}`), inset);
	}
	assert.match(styles, /\.add-source-actions \.editor-apply:disabled\s*\{[\s\S]*background:\s*rgb\(34 58 69\)/);
	assert.match(styles, /@media \(min-width: 900px\)[\s\S]*width:\s*min\(920px,\s*100%\)/);
});

test("every Add entry point still delegates to one dialog and successful creation retains focus/status wiring", () => {
	const workspace = read("builder/src/ui/BuilderWorkspace.jsx");
	assert.equal((workspace.match(/<AddSourceDialog/g) ?? []).length, 1);
	assert.equal((workspace.match(/openAddSource\(event\.currentTarget\)/g) ?? []).length, 3);
	assert.match(workspace, /setPendingCreatedSourceFocus\(result\.createdInternalId\)/);
	assert.match(workspace, /focusElementWithoutScroll\(target\)/);
	assert.match(workspace, /data-source-creation-status="true"/);
});

test("provider separation and future-work boundaries remain intact", () => {
	const dialog = read("builder/src/ui/AddSourceDialog.jsx");
	assert.match(dialog, /provider\.searchCollections/);
	assert.match(dialog, /provider\.getCollection/);
	assert.equal(dialog.includes("fetch("), false);
	for (const rawField of ["poster_path", "total_pages", "total_results", "backdrop_path"]) {
		assert.equal(dialog.includes(rawField), false, rawField);
	}
	for (const forbidden of [
		"rawImported",
		"catalogSources",
		"trakt",
		'data-action="edit-source"',
		'data-action="create-source',
		"dangerouslySetInnerHTML",
	]) {
		assert.equal(dialog.includes(forbidden), false, forbidden);
	}
});
