import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createElement } from "../builder/node_modules/react/index.js";
import { renderToStaticMarkup } from "../builder/node_modules/react-dom/server.js";
import { createServer } from "../builder/node_modules/vite/dist/node/index.js";
import { createBuilderController } from "../builder/src/application/index.js";
import { createAsyncRequestCoordinator } from "../builder/src/source-add/index.js";
import {
	lockAddSourceDocumentBody,
	observeAddSourceViewport,
	resolveAddSourceViewportStyle,
} from "../builder/src/ui/add-source-modal-lifecycle.js";
import {
	ADD_SOURCE_STEPS,
	captureAddSourceSelectionScroll,
	completeAddSourceSearchRestore,
	createAddSourceNavigationState,
	enterAddSourceReview,
	restoreAddSourceSearchView,
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
	beginSelectedCollectionDetailsRequest,
	selectedCollectionDetailsFromOutcome,
} = await vite.ssrLoadModule("/src/ui/AddSourceDialog.jsx");
const { TmdbEntityLink } = await vite.ssrLoadModule("/src/ui/TmdbEntityLink.jsx");
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

function populatedLiveStatusTexts(markup) {
	return [...markup.matchAll(
		/<([a-z][\w-]*)\b[^>]*\brole="status"[^>]*>([\s\S]*?)<\/\1>/gi,
	)]
		.map((match) => match[2].replace(/<[^>]*>/g, "").trim())
		.filter(Boolean);
}

function renderSearchStep({
	totalPages = 1,
	page = 1,
	results = [detailsResult({ movieCount: null, containedTitles: null })],
	selectionState = {
		status: "idle",
		requestId: 0,
		context: null,
		data: null,
		error: null,
	},
	selectionCandidate = null,
	selectionMessage = null,
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
		selectionState,
		selectionCandidate,
		selectionMessage,
		selectionErrorRef: null,
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
	assert.equal((markup.match(/class="panel-title-inline-count mobile-only"/g) ?? []).length, 3);
	assert.ok(markup.includes('class="panel-title-inline-count mobile-only"> · 0</span>'));
	assert.equal((markup.match(/panel-count panel-count-desktop-only/g) ?? []).length, 3);
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

test("selected-result loading uses one live status and persistent errors stay before preserved Search results", () => {
	const candidate = detailsResult({ movieCount: null, containedTitles: null });
	const otherResult = detailsResult({
		id: candidate.id + 1,
		name: "Another Collection",
		movieCount: null,
		containedTitles: null,
	});
	const loadingMarkup = renderSearchStep({
		results: [candidate, otherResult],
		selectionCandidate: candidate,
		selectionState: {
			status: "loading",
			requestId: 1,
			context: { id: candidate.id },
			data: null,
			error: null,
		},
	});
	const loadingResult = openingTag(loadingMarkup, `data-tmdb-collection-result="${candidate.id}"`);
	assert.ok(loadingResult.includes("is-loading"));
	assert.ok(loadingResult.includes('aria-busy="true"'));
	assert.ok(loadingResult.includes('data-selection-loading="true"'));
	assert.ok(loadingResult.includes("disabled"));
	assert.equal(
		openingTag(
			loadingMarkup,
			`data-tmdb-collection-result="${otherResult.id}"`,
		).includes("disabled"),
		false,
	);
	assert.ok(loadingMarkup.includes("Loading details…"));
	assert.ok(loadingMarkup.includes("Example Collection"));
	assert.ok(loadingMarkup.includes("Another Collection"));
	assert.equal(
		openingTag(loadingMarkup, 'class="add-source-result-loading"').includes('role="status"'),
		false,
	);
	assert.deepEqual(
		populatedLiveStatusTexts(loadingMarkup),
		["Loading details for “Example Collection”…"],
	);
	assert.equal(loadingMarkup.includes("Fixed source recipe"), false);

	const successMarkup = renderSearchStep({
		selectionCandidate: candidate,
		selectionState: {
			status: "success",
			requestId: 2,
			context: { id: candidate.id },
			data: candidate,
			error: null,
		},
	});
	assert.equal(successMarkup.includes("Loading details"), false);
	assert.deepEqual(populatedLiveStatusTexts(successMarkup), []);

	const cancelledMarkup = renderSearchStep();
	assert.equal(cancelledMarkup.includes("Loading details"), false);
	assert.deepEqual(populatedLiveStatusTexts(cancelledMarkup), []);

	const retryMarkup = renderSearchStep({
		selectionCandidate: candidate,
		selectionState: {
			status: "loading",
			requestId: 3,
			context: { id: candidate.id },
			data: null,
			error: null,
		},
	});
	assert.deepEqual(
		populatedLiveStatusTexts(retryMarkup),
		["Loading details for “Example Collection”…"],
	);

	const errorMessage = "TMDB could not be reached. Check your connection and try again.";
	const errorMarkup = renderSearchStep({
		page: 2,
		totalPages: 3,
		selectionCandidate: candidate,
		selectionMessage: errorMessage,
		selectionState: {
			status: "error",
			requestId: 2,
			context: { id: candidate.id },
			data: null,
			error: {
				kind: "network",
				message: errorMessage,
				retryable: true,
			},
		},
	});
	const errorTag = openingTag(errorMarkup, 'data-selection-error="true"');
	assert.ok(errorTag.includes('role="alert"'));
	assert.ok(errorTag.includes('tabindex="-1"'));
	assert.ok(errorMarkup.includes(errorMessage));
	assert.ok(errorMarkup.includes("Retry selection"));
	assert.ok(errorMarkup.includes('value="example"'));
	assert.ok(errorMarkup.includes("Example Collection"));
	assert.ok(errorMarkup.includes("Page 2 of 3"));
	assert.equal(errorMarkup.includes("Loading details"), false);
	assert.deepEqual(populatedLiveStatusTexts(errorMarkup), []);
	assert.ok(
		errorMarkup.indexOf('data-selection-error="true"')
		< errorMarkup.indexOf('class="add-source-results"'),
	);
	assert.equal(errorMarkup.includes("Fixed source recipe"), false);
});

test("details selection suppresses repeated activation, keeps failures in Search, and permits retry to Review", async () => {
	let calls = 0;
	let settleFirst;
	let nextResult = null;
	const states = [];
	const provider = {
		getCollection() {
			calls += 1;
			if (calls === 1) {
				return new Promise((resolve) => {
					settleFirst = resolve;
				});
			}
			return Promise.resolve(nextResult);
		},
	};
	const coordinator = createAsyncRequestCoordinator({
		onStateChange: (state) => states.push(state),
	});
	const candidate = detailsResult({ movieCount: null, containedTitles: null });
	let navigation = createAddSourceNavigationState();
	let liveScrollTop = 428;

	const firstSelection = beginSelectedCollectionDetailsRequest({
		coordinator,
		provider,
		result: candidate,
		navigationState: navigation,
		searchScrollTop: liveScrollTop,
	});
	navigation = firstSelection.navigationState;
	const first = firstSelection.request;
	assert.equal(coordinator.getState().status, "loading");
	assert.deepEqual(coordinator.getState().context, { id: candidate.id });
	assert.equal(navigation.selectionScrollId, candidate.id);
	assert.equal(navigation.selectionScrollTop, 428);

	const repeated = beginSelectedCollectionDetailsRequest({
		coordinator,
		provider,
		result: candidate,
		navigationState: navigation,
		searchScrollTop: 900,
	});
	assert.equal(repeated.repeated, true);
	assert.equal(repeated.request.accepted, false);
	assert.strictEqual(repeated.navigationState, navigation);
	assert.equal(calls, 1);

	settleFirst({
		ok: false,
		error: {
			kind: "network",
			message: "TMDB could not be reached. Check your connection and try again.",
			retryable: true,
		},
	});
	const failure = await first;
	assert.equal(selectedCollectionDetailsFromOutcome(failure), null);
	assert.equal(coordinator.getState().status, "error");
	assert.equal(navigation.step, ADD_SOURCE_STEPS.SEARCH);
	liveScrollTop = 64;

	nextResult = {
		ok: true,
		data: detailsResult({ name: "Sex Collection" }),
	};
	const retrySelection = beginSelectedCollectionDetailsRequest({
		coordinator,
		provider,
		result: candidate,
		navigationState: navigation,
		searchScrollTop: liveScrollTop,
	});
	navigation = retrySelection.navigationState;
	assert.equal(navigation.selectionScrollTop, 428);
	const retry = await retrySelection.request;
	const acceptedDetails = selectedCollectionDetailsFromOutcome(retry);
	assert.equal(acceptedDetails.name, "Sex Collection");
	navigation = enterAddSourceReview(navigation, acceptedDetails.id, liveScrollTop);
	assert.equal(navigation.step, ADD_SOURCE_STEPS.REVIEW);
	assert.equal(navigation.searchScrollTop, 428);
	assert.equal(calls, 2);
	assert.deepEqual(
		states.map((state) => state.status),
		["loading", "error", "loading", "success"],
	);

	navigation = returnAddSourceToSearch(navigation);
	const scrollElement = {
		scrollTop: liveScrollTop,
		getBoundingClientRect() {
			return { top: 0, bottom: 400 };
		},
	};
	let scrolledIntoView = false;
	const resultElement = {
		getBoundingClientRect() {
			return scrollElement.scrollTop === 428
				? { top: 220, bottom: 340 }
				: { top: 520, bottom: 640 };
		},
		scrollIntoView() {
			scrolledIntoView = true;
		},
	};
	const focused = [];
	const restored = restoreAddSourceSearchView({
		scrollElement,
		resultElement,
		fallbackElement: null,
		searchScrollTop: navigation.searchScrollTop,
		focusWithoutScroll: (element) => focused.push(element),
	});
	assert.equal(scrollElement.scrollTop, 428);
	assert.deepEqual(focused, [resultElement]);
	assert.equal(restored.resultVisible, true);
	assert.equal(restored.visibilityAdjusted, false);
	assert.equal(scrolledIntoView, false);
});

test("Review retains the count and authoritative poster Preview without the legacy contained-title disclosure", () => {
	const markup = renderToStaticMarkup(createElement(AddSourceReviewStep, {
		selectedResult: detailsResult(),
		title: "Edited source title",
		titleInputRef: null,
		titleError: null,
		duplicate: null,
		applyDiagnostic: null,
		previewAvailable: true,
		onTitleChange() {},
		onPreview() {},
	}));

	assert.ok(markup.includes("https://image.tmdb.org/t/p/w342/poster.jpg"));
	assert.ok(markup.includes('alt="Collection poster artwork"'));
	assert.ok(markup.includes("2 titles in this collection"));
	assert.ok(markup.includes('value="Edited source title"'));
	assert.ok(markup.includes("Source name"));
	assert.ok(markup.includes("This is the name shown in Nuvio. You can customise it."));
	assert.equal(markup.includes("Nuvio source title"), false);
	assert.ok(markup.includes('data-source-recipe="tmdb-collection"'));
	assert.ok(markup.includes("TMDB-provided order"));
	assert.ok(markup.includes('href="https://www.themoviedb.org/collection/123"'));
	assert.ok(markup.includes('target="_blank"'));
	assert.ok(markup.includes('rel="noopener noreferrer"'));
	assert.ok(markup.includes('aria-label="Open Example Collection on TMDB (collection 123)"'));
	assert.ok(markup.includes('class="tmdb-entity-link-indicator" aria-hidden="true">↗</span>'));
	assert.equal(markup.includes("Original order"), false);
	assert.ok(markup.includes('data-action="preview-add-source"'));
	assert.equal(/data-action="preview-add-source"[^>]*disabled/.test(markup), false);
	assert.ok(markup.includes("Preview titles"));
	for (const legacy of ["toggle-contained-titles", "add-source-contained-titles", "View 2 titles in this collection", "First Movie", "Second Movie", "Year unavailable"]) assert.equal(markup.includes(legacy), false, legacy);
	assert.ok(markup.includes("add-source-title-input"));
	assert.doesNotMatch(read("builder/src/styles.css"), /\.add-source-title-list/);
});

test("Review identifies the canonical Collection name as auto-managed until customised", () => {
	const selectedResult = detailsResult();
	const markup = renderToStaticMarkup(createElement(AddSourceReviewStep, {
		selectedResult,
		title: selectedResult.name,
		titleInputRef: null,
		titleError: null,
		duplicate: null,
		applyDiagnostic: null,
		onTitleChange() {},
	}));
	assert.ok(markup.includes("Source name"));
	assert.ok(markup.includes("This name updates automatically until you customise it."));
	assert.equal(markup.includes("Nuvio source title"), false);
});

test("TMDB review links fail closed for malformed, missing, or unsupported identities", () => {
	for (const props of [
		{ entityType: "collection", tmdbId: "123", entityName: "Raw input" },
		{ entityType: "person", tmdbId: 0, entityName: "Missing person" },
		{ entityType: "discover", tmdbId: 123, entityName: "Discover recipe" },
		{ entityType: "watch-provider", tmdbId: 8, entityName: "Provider" },
		{ entityType: "builder", tmdbId: 123, entityName: "Internal ID" },
	]) {
		const markup = renderToStaticMarkup(createElement(TmdbEntityLink, props));
		assert.equal(markup.includes("<a"), false, JSON.stringify(props));
	}
});

test("long Collection review titles wrap above a secondary mobile TMDB link", () => {
	const longName = "A Very Long Official TMDB Movie Collection Name That Must Wrap Naturally Instead Of Being Truncated";
	const markup = renderToStaticMarkup(createElement(AddSourceReviewStep, {
		selectedResult: detailsResult({ name: longName }),
		title: longName,
		titleInputRef: null,
		titleError: null,
		duplicate: null,
		applyDiagnostic: null,
		onTitleChange() {},
	}));
	const styles = read("builder/src/styles.css");
	assert.ok(markup.includes(longName));
	assert.ok(markup.includes('href="https://www.themoviedb.org/collection/123"'));
	assert.match(styles, /@media \(max-width: 520px\)[\s\S]*\.add-source-review \.add-source-section-heading\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
	assert.match(styles, /@media \(max-width: 520px\)[\s\S]*\.add-source-review \.tmdb-entity-link\s*\{[\s\S]*justify-self:\s*start/);
	assert.doesNotMatch(styles.match(/\.add-source-review \.add-source-section-heading\s*\{[^}]*\}/)?.[0] ?? "", /text-overflow|white-space:\s*nowrap/);
});

test("Review uses a stable no-poster placeholder without emitting an image URL", () => {
	const markup = renderToStaticMarkup(createElement(AddSourceReviewStep, {
		selectedResult: detailsResult({ posterPath: null }),
		title: "Example Collection",
		titleInputRef: null,
		titleError: null,
		duplicate: null,
		applyDiagnostic: null,
		onTitleChange() {},
	}));
	assert.ok(markup.includes("No poster available"));
	assert.equal(markup.includes("https://image.tmdb.org"), false);
	assert.equal(markup.includes("toggle-contained-titles"), false);
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
	assert.equal(initial.selectionScrollId, null);
	assert.equal(initial.selectionScrollTop, null);

	const captured = captureAddSourceSelectionScroll(initial, 123, 428.5);
	const sameResultRetry = captureAddSourceSelectionScroll(captured, 123, 900);
	assert.strictEqual(sameResultRetry, captured);
	const review = enterAddSourceReview(sameResultRetry, 123, 900);
	assert.deepEqual(review, {
		step: ADD_SOURCE_STEPS.REVIEW,
		selectedId: 123,
		searchScrollTop: 428.5,
		restoreSearchFocusId: null,
		selectionScrollId: null,
		selectionScrollTop: null,
	});
	const search = returnAddSourceToSearch(review);
	assert.equal(search.step, ADD_SOURCE_STEPS.SEARCH);
	assert.equal(search.searchScrollTop, 428.5);
	assert.equal(search.restoreSearchFocusId, 123);
	assert.equal(completeAddSourceSearchRestore(search).restoreSearchFocusId, null);
	const otherResult = captureAddSourceSelectionScroll(search, 456, 712);
	assert.equal(otherResult.selectionScrollId, 456);
	assert.equal(otherResult.selectionScrollTop, 712);
	const queryReset = createAddSourceNavigationState();
	const pageReset = createAddSourceNavigationState();
	const nextDialogSession = createAddSourceNavigationState();
	for (const reset of [queryReset, pageReset, nextDialogSession]) {
		assert.equal(reset.selectionScrollId, null);
		assert.equal(reset.selectionScrollTop, null);
	}
	assert.equal(enterAddSourceReview(initial, 123, 75).searchScrollTop, 75);
	assert.throws(() => enterAddSourceReview(initial, 0), /positive safe TMDB collection ID/);
	assert.throws(
		() => captureAddSourceSelectionScroll(initial, 0, 100),
		/positive safe TMDB collection ID/,
	);

	let adjusted = false;
	const scrollElement = {
		scrollTop: 0,
		getBoundingClientRect() {
			return { top: 0, bottom: 300 };
		},
	};
	const resultElement = {
		getBoundingClientRect() {
			return adjusted
				? { top: 180, bottom: 260 }
				: { top: 340, bottom: 420 };
		},
		scrollIntoView(options) {
			assert.deepEqual(options, { block: "nearest", inline: "nearest" });
			adjusted = true;
		},
	};
	const restore = restoreAddSourceSearchView({
		scrollElement,
		resultElement,
		fallbackElement: null,
		searchScrollTop: 428.5,
		focusWithoutScroll() {},
	});
	assert.equal(scrollElement.scrollTop, 428.5);
	assert.equal(restore.visibilityAdjusted, true);
	assert.equal(restore.resultVisible, true);
});

test("query and page changes clear stale selection state and failed details are focused within Search", () => {
	const dialog = read("builder/src/ui/AddSourceDialog.jsx");
	const inputChange = dialog.slice(
		dialog.indexOf("function handleInputChange"),
		dialog.indexOf("function showReview"),
	);
	for (const reset of [
		"setPage(1)",
		"setNavigationState(createAddSourceNavigationState())",
		"setSelectedResult(null)",
		"setSelectionCandidate(null)",
		"setSelectionState(INITIAL_ASYNC_REQUEST_STATE)",
		"selectionCoordinatorRef.current.cancel",
	]) {
		assert.ok(inputChange.includes(reset), reset);
	}
	const pageChange = dialog.slice(
		dialog.indexOf("function changePage"),
		dialog.indexOf("async function submit"),
	);
	assert.ok(pageChange.includes("setNavigationState(createAddSourceNavigationState())"));
	assert.ok(pageChange.includes("setSelectionCandidate(null)"));
	assert.ok(pageChange.includes("setSelectionState(INITIAL_ASYNC_REQUEST_STATE)"));

	const selectionFlow = dialog.slice(
		dialog.indexOf("async function validateSearchResult"),
		dialog.indexOf("function returnToSearch"),
	);
	assert.ok(
		selectionFlow.indexOf("await selection.request")
		< selectionFlow.indexOf("showReview(details)"),
	);
	assert.match(selectionFlow, /if \(details === null\) return;\s*showReview\(details\)/);
	assert.match(dialog, /selectionErrorRef\.current\?\.scrollIntoView\?\./);
	assert.match(dialog, /focusElementWithoutScroll\(selectionErrorRef\.current\)/);
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

test("responsive CSS keeps phone-sized launchers fullscreen and normal tablet viewports contained", () => {
	const styles = read("builder/src/styles.css");
	const dialogSource = read("builder/src/ui/AddSourceDialog.jsx");
	assert.match(styles, /--layer-add-source:\s*3000/);
	assert.match(styles, /--layer-nested-modal:\s*4000/);
	assert.match(styles, /\.add-source-portal\s*\{[\s\S]*z-index:\s*var\(--layer-add-source\)[\s\S]*isolation:\s*isolate/);
	assert.match(styles, /\.add-source-dialog\s*\{[\s\S]*width:\s*100%[\s\S]*height:\s*100%/);
	assert.match(styles, /\.add-source-scroll\s*\{[\s\S]*overflow-y:\s*auto[\s\S]*overscroll-behavior:\s*contain/);
	assert.match(styles, /@media \(max-width: 620px\), \(max-width: 899\.98px\) and \(max-height: 600px\)[\s\S]*\.add-source-portal\s*\{[\s\S]*background:\s*rgb\(7 24 33\)/);
	assert.match(styles, /@media \(max-width: 620px\), \(max-width: 899\.98px\) and \(max-height: 600px\)[\s\S]*\.settings-modal-backdrop\.add-source-backdrop\s*\{[\s\S]*padding:\s*0[\s\S]*background:\s*rgb\(7 24 33\)/);
	assert.match(styles, /@media \(max-width: 620px\), \(max-width: 899\.98px\) and \(max-height: 600px\)[\s\S]*\.add-source-dialog\s*\{[\s\S]*isolation:\s*isolate[\s\S]*background:\s*rgb\(7 24 33\)[\s\S]*border:\s*0[\s\S]*border-radius:\s*0/);
	assert.match(styles, /@media \(max-width: 620px\), \(max-width: 899\.98px\) and \(max-height: 600px\)[\s\S]*\.panel-count\.panel-count-desktop-only\s*\{\s*display:\s*none/);
	assert.match(styles, /\.add-source-review-poster-frame\s*\{[\s\S]*width:\s*clamp\(180px,\s*48vw,\s*220px\)/);
	assert.match(styles, /@media \(max-width: 899\.98px\) and \(max-height: 600px\)[\s\S]*width:\s*clamp\(140px,\s*40vw,\s*180px\)/);
	assert.match(styles, /@media \(min-width: 600px\) and \(max-width: 899\.98px\) and \(max-height: 600px\)[\s\S]*grid-template-columns:\s*180px minmax\(0,\s*1fr\)/);
	assert.match(styles, /\.add-source-result-poster,[\s\S]*\.add-source-review-poster\s*\{[\s\S]*object-fit:\s*contain/);
	assert.equal(/\.add-source-review-poster\s*\{[^}]*object-fit:\s*cover/s.test(styles), false);
	assert.match(styles, /\.add-source-recipe dl > div\s*\{[\s\S]*min-width:\s*0/);
	assert.match(styles, /\.add-source-recipe dd\s*\{[\s\S]*overflow-wrap:\s*anywhere/);
	assert.match(styles, /\.add-source-result-loading\s*\{[\s\S]*color:\s*var\(--cyan-bright\)/);
	assert.match(dialogSource, /usePrePaintLayoutEffect\(\(\) => \{[\s\S]*lockAddSourceDocumentBody\(\)[\s\S]*observeAddSourceViewport/);
	for (const inset of ["top", "right", "bottom", "left"]) {
		assert.ok(styles.includes(`safe-area-inset-${inset}`), inset);
	}
	assert.match(styles, /\.add-source-actions \.editor-apply:disabled\s*\{[\s\S]*background:\s*rgb\(34 58 69\)/);
	assert.match(styles, /\.tmdb-entity-link\s*\{[\s\S]*min-height:\s*44px[\s\S]*text-decoration:\s*none/);
	assert.match(styles, /\.tmdb-entity-link:hover\s*\{[\s\S]*border-color:/);
	assert.match(styles, /\.tmdb-entity-link:focus-visible\s*\{[\s\S]*outline:/);
	assert.match(styles, /@media \(min-width: 900px\), \(min-width: 621px\) and \(min-height: 601px\)[\s\S]*width:\s*min\(920px,\s*100%\)/);
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
