import { act, createElement, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { createBuilderController } from "../../builder/src/application/index.js";
import { desktopExpandedSource, roundTripSourceCases } from "./nuvio-desktop-round-trip.mjs";
import { createCollectionExportPayload } from "../../builder/src/ui/export-collections.js";
import {
	applyGenreHierarchyPlan,
	applyStreamingHierarchyPlan,
	buildDecadeSourceBundleDrafts,
	buildTmdbPosterUrl,
	createPeopleManifestClient,
	createNetworkCatalogueProvider,
	createStreamingCatalogueProvider,
	createStudioCatalogueProvider,
	createTmdbCollectionProvider,
	createTmdbDecadesPreviewProvider,
	createTmdbGenrePreviewProvider,
	createTmdbListProvider,
	createTmdbLocalPreviewFetch,
	createTmdbNetworkPreviewProvider,
	createTmdbPersonProvider,
	createTmdbStudioPreviewProvider,
	createTmdbStreamingPreviewProvider,
	createPeopleSourceBundle,
	TMDB_PROXY_BASE_URL,
} from "../../builder/src/source-add/index.js";
import {
	chooseMovieCollection,
	createSourceEditSession,
	saveSourceEdit,
} from "../../builder/src/source-edit/index.js";
import { SourceEditorDialog } from "../../builder/src/ui/SourceEditorDialog.jsx";
import { AddSourceDialog } from "../../builder/src/ui/AddSourceDialog.jsx";
import { DecadeSourceFlow } from "../../builder/src/ui/DecadeSourceFlow.jsx";
import { GenreSourceFlow } from "../../builder/src/ui/GenreSourceFlow.jsx";
import { NetworkSourceFlow } from "../../builder/src/ui/NetworkSourceFlow.jsx";
import { PeopleBulkConfigurationList, PeopleSourceFlow } from "../../builder/src/ui/PeopleSourceFlow.jsx";
import { StudioSourceFlow } from "../../builder/src/ui/StudioSourceFlow.jsx";
import { StreamingSourceFlow } from "../../builder/src/ui/StreamingSourceFlow.jsx";
import { TmdbListSourceFlow } from "../../builder/src/ui/TmdbListSourceFlow.jsx";
import { BuilderWorkspace } from "../../builder/src/ui/BuilderWorkspace.jsx";
import { CreationDialog } from "../../builder/src/ui/CreationDialog.jsx";
import { createArtworkRuntimeClient } from "../../js/artwork-runtime.mjs";
import "../../builder/src/styles.css";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const livePeopleManifestClient = createPeopleManifestClient();
const liveNetworkCatalogueProvider = createNetworkCatalogueProvider({ catalogueUrl: "/data/tv-networks.min.json" });
const liveStudioCatalogueProvider = createStudioCatalogueProvider({ catalogueUrl: "/data/companies.min.json" });
const liveStreamingCatalogueProvider = createStreamingCatalogueProvider();
const liveNetworkArtworkRuntimeClient = createArtworkRuntimeClient();
const liveStudioArtworkRuntimeClient = createArtworkRuntimeClient();
const liveTmdbListRequests = [];
const liveTmdbListFetch = createTmdbLocalPreviewFetch({ workerBaseUrl: TMDB_PROXY_BASE_URL });
const liveTmdbListProvider = createTmdbListProvider({
	fetchImpl(input, init) {
		const url = new URL(input instanceof Request ? input.url : input);
		liveTmdbListRequests.push(`${url.pathname}${url.search}`);
		return liveTmdbListFetch(input, init);
	},
});

function countingIdFactory(prefix = "builder") {
	let count = 0;
	return () => `${prefix}-${++count}`;
}

function createController() {
	return createBuilderController({
		idFactory: countingIdFactory(),
		nuvioIdFactory: countingIdFactory("nuvio"),
		initialProjectTitle: "Mounted source edit regression",
	});
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

function genreSource(overrides = {}) {
	return {
		provider: "tmdb",
		title: "Comedy Movies",
		tmdbSourceType: "DISCOVER",
		tmdbId: null,
		mediaType: "MOVIE",
		sortBy: "popularity.desc",
		filters: { withGenres: "35" },
		...overrides,
	};
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
	if (!imported.ok) throw new Error("Mounted fixture import failed.");
	return controller.getState().project.collections[0].folders[0];
}

function openEdit(controller, source) {
	const opened = createSourceEditSession(controller.getState().project, source.internalId);
	if (!opened.ok) throw new Error("Mounted source edit session failed to open.");
	return opened;
}

function serializedValue(controller) {
	return JSON.stringify(controller.serializeProject().value);
}

function setInputValue(input, value) {
	const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
	setter.call(input, value);
	input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward", data: null }));
}

function setTextareaValue(input, value) {
	const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
	setter.call(input, value);
	input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
}

async function afterCommittedEffects() {
	await Promise.resolve();
	await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

async function waitForMountedCondition(resolveCondition, { label, timeoutMs = 2000, pollIntervalMs = 25 } = {}) {
	const deadline = performance.now() + timeoutMs;
	while (performance.now() < deadline) {
		const result = resolveCondition();
		if (result) return result;
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
			await afterCommittedEffects();
		});
	}
	throw new Error(`${label ?? "Mounted condition"} did not become ready within ${timeoutMs} ms.`);
}

function recordingFetch(requests) {
	return async (input, init) => {
		const requestUrl = typeof input === "string" ? input : input?.url;
		const url = new URL(requestUrl);
		requests.push(`${url.pathname}${url.search}`);
		return fetch(input, init);
	};
}

function visibleElement(element) {
	const style = getComputedStyle(element);
	const rect = element.getBoundingClientRect();
	return style.display !== "none"
		&& style.visibility !== "hidden"
		&& style.visibility !== "collapse"
		&& Number.parseFloat(style.opacity) !== 0
		&& element.getClientRects().length > 0
		&& rect.width > 0
		&& rect.height > 0;
}

function titlePreviewGeometry(preview, grid) {
	const viewport = window.visualViewport;
	const viewportBounds = {
		left: viewport?.offsetLeft ?? 0,
		top: viewport?.offsetTop ?? 0,
		right: (viewport?.offsetLeft ?? 0) + (viewport?.width ?? window.innerWidth),
		bottom: (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight),
		width: viewport?.width ?? window.innerWidth,
		height: viewport?.height ?? window.innerHeight,
	};
	const previewRect = preview.getBoundingClientRect();
	const closeRect = preview.querySelector("header button")?.getBoundingClientRect() ?? null;
	const images = [...grid.querySelectorAll(":scope > img")].filter(visibleElement);
	const imageRects = images.map((image) => image.getBoundingClientRect());
	const gridStyle = getComputedStyle(grid);
	const activeScrollOwners = [preview, ...preview.querySelectorAll("*")].filter((element) => {
		const overflowY = getComputedStyle(element).overflowY;
		return (overflowY === "auto" || overflowY === "scroll") && element.scrollHeight > element.clientHeight + 1;
	});
	return {
		viewportHeight: viewportBounds.height,
		centeredHorizontally: Math.abs((previewRect.left + (previewRect.width / 2)) - (viewportBounds.left + (viewportBounds.width / 2))) <= 1,
		centeredVertically: Math.abs((previewRect.top + (previewRect.height / 2)) - (viewportBounds.top + (viewportBounds.height / 2))) <= 1,
		withinViewport: previewRect.left >= viewportBounds.left - 1
			&& previewRect.top >= viewportBounds.top - 1
			&& previewRect.right <= viewportBounds.right + 1
			&& previewRect.bottom <= viewportBounds.bottom + 1,
		closeReachable: closeRect !== null
			&& closeRect.left >= viewportBounds.left - 1
			&& closeRect.top >= viewportBounds.top - 1
			&& closeRect.right <= viewportBounds.right + 1
			&& closeRect.bottom <= viewportBounds.bottom + 1,
		columns: new Set(imageRects.map((rect) => Math.round(rect.left))).size,
		rows: new Set(imageRects.map((rect) => Math.round(rect.top))).size,
		posterWidth: imageRects[0]?.width ?? 0,
		posterHeight: imageRects[0]?.height ?? 0,
		columnGap: Number.parseFloat(gridStyle.columnGap),
		rowGap: Number.parseFloat(gridStyle.rowGap),
		gridNoHorizontalScroll: grid.scrollWidth <= grid.clientWidth + 1 && gridStyle.overflowX !== "scroll",
		pageNoHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth,
		activeScrollOwnerCount: activeScrollOwners.length,
		bodyLocked: document.body.style.position === "fixed",
	};
}

function tmdbListPreviewGeometry(preview, grid) {
	const viewport = window.visualViewport;
	const viewportBounds = {
		left: viewport?.offsetLeft ?? 0,
		top: viewport?.offsetTop ?? 0,
		right: (viewport?.offsetLeft ?? 0) + (viewport?.width ?? window.innerWidth),
		bottom: (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight),
		width: viewport?.width ?? window.innerWidth,
		height: viewport?.height ?? window.innerHeight,
		scale: viewport?.scale ?? 1,
	};
	const previewRect = preview.getBoundingClientRect();
	const gridRect = grid.getBoundingClientRect();
	const backdropRect = preview.closest("[data-nested-modal-backdrop]")?.getBoundingClientRect() ?? null;
	const outerDialogRect = document.querySelector(".tmdb-list-dialog")?.getBoundingClientRect() ?? null;
	const headerRect = preview.querySelector("header")?.getBoundingClientRect() ?? null;
	const closeRect = preview.querySelector("header button")?.getBoundingClientRect() ?? null;
	const images = [...grid.querySelectorAll(":scope > img")];
	const imageRects = images.map((image) => image.getBoundingClientRect());
	const firstPosterRect = imageRects[0] ?? null;
	const lastPosterRect = imageRects.at(-1) ?? null;
	const gridStyle = getComputedStyle(grid);
	const scrollbarThumbStyle = getComputedStyle(grid, "::-webkit-scrollbar-thumb");
	const activeScrollOwners = [preview, ...preview.querySelectorAll("*")].filter((element) => {
		const overflowY = getComputedStyle(element).overflowY;
		return (overflowY === "auto" || overflowY === "scroll") && element.scrollHeight > element.clientHeight + 1;
	});
	return {
		viewportLeft: viewportBounds.left,
		viewportTop: viewportBounds.top,
		viewportWidth: viewportBounds.width,
		viewportHeight: viewportBounds.height,
		viewportScale: viewportBounds.scale,
		modalLeft: previewRect.left,
		modalTop: previewRect.top,
		modalWidth: previewRect.width,
		modalHeight: previewRect.height,
		headerTop: headerRect?.top ?? null,
		headerBottom: headerRect?.bottom ?? null,
		gridClientWidth: grid.clientWidth,
		gridScrollWidth: grid.scrollWidth,
		gridClientHeight: grid.clientHeight,
		gridScrollHeight: grid.scrollHeight,
		gridScrollTop: grid.scrollTop,
		gridScrollLeft: grid.scrollLeft,
		atVerticalScrollEnd: grid.scrollTop + grid.clientHeight >= grid.scrollHeight - 2,
		posterCount: images.length,
		columns: new Set(imageRects.map((rect) => Math.round(rect.left))).size,
		posterWidth: firstPosterRect?.width ?? 0,
		posterHeight: firstPosterRect?.height ?? 0,
		verticalScrollable: grid.scrollHeight > grid.clientHeight + 1 && gridStyle.overflowY === "auto",
		verticalScrollOnly: grid.scrollWidth <= grid.clientWidth + 1 && gridStyle.overflowX === "hidden",
		lastPosterReachable: lastPosterRect !== null
			&& lastPosterRect.bottom >= gridRect.top + 1
			&& lastPosterRect.top <= gridRect.bottom - 1,
		allPosterRectsHaveSize: imageRects.every((rect) => rect.width > 0 && rect.height > 0),
		allPosterRectsInlineContained: imageRects.every((rect) => rect.left >= gridRect.left - 1 && rect.right <= gridRect.right + 1),
		gridInlineContained: gridRect.left >= previewRect.left - 1 && gridRect.right <= previewRect.right + 1
			&& gridRect.left >= viewportBounds.left - 1 && gridRect.right <= viewportBounds.right + 1,
		closeReachable: closeRect !== null
			&& closeRect.left >= viewportBounds.left - 1
			&& closeRect.top >= viewportBounds.top - 1
			&& closeRect.right <= viewportBounds.right + 1
			&& closeRect.bottom <= viewportBounds.bottom + 1,
		backdropMatchesVisualViewport: backdropRect !== null
			&& Math.abs(backdropRect.left - viewportBounds.left) <= 1
			&& Math.abs(backdropRect.top - viewportBounds.top) <= 1
			&& Math.abs(backdropRect.right - viewportBounds.right) <= 1
			&& Math.abs(backdropRect.bottom - viewportBounds.bottom) <= 1,
		outerDialogWithinVisualViewport: outerDialogRect !== null
			&& outerDialogRect.left >= viewportBounds.left - 1
			&& outerDialogRect.top >= viewportBounds.top - 1
			&& outerDialogRect.right <= viewportBounds.right + 1
			&& outerDialogRect.bottom <= viewportBounds.bottom + 1,
		safeHorizontalMargins: previewRect.left - viewportBounds.left >= 15
			&& viewportBounds.right - previewRect.right >= 15,
		oneScrollOwner: activeScrollOwners.length === 1 && activeScrollOwners[0] === grid,
		dingoScrollbarClass: grid.classList.contains("dingo-scrollbar"),
		scrollbarColor: gridStyle.scrollbarColor,
		scrollbarWidth: gridStyle.scrollbarWidth,
		scrollbarThumbBackground: scrollbarThumbStyle.backgroundColor,
		withinViewport: previewRect.left >= viewportBounds.left - 1
			&& previewRect.top >= viewportBounds.top - 1
			&& previewRect.right <= viewportBounds.right + 1
			&& previewRect.bottom <= viewportBounds.bottom + 1,
		pageNoHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth,
	};
}

function genuineTmdbPosterImages(images) {
	return images.length > 0 && images.every((image) => {
		const url = new URL(image.currentSrc || image.src);
		return url.origin === "https://image.tmdb.org" && url.pathname.startsWith("/t/p/");
	});
}

async function waitForReadyPosterGrid({
	preview,
	gridSelector,
	expectedVisibleCount,
	expectedSelectedTab = null,
	label,
	timeoutMs = 20_000,
}) {
	let diagnostic = { preview: false, grid: false, expectedVisibleCount, expectedSelectedTab, images: [] };
	try {
		return await waitForMountedCondition(() => {
			const previewElement = typeof preview === "string" ? document.querySelector(preview) : preview;
			const grid = previewElement?.querySelector(gridSelector) ?? null;
			const selectedTab = previewElement?.querySelector('[role="tab"][aria-selected="true"]') ?? null;
			const images = grid ? [...grid.querySelectorAll(":scope > img")] : [];
			const visibleImages = images.filter(visibleElement);
			diagnostic = {
				preview: Boolean(previewElement),
				previewStatus: previewElement?.dataset.previewStatus ?? "not-exposed",
				grid: Boolean(grid),
				expectedVisibleCount,
				expectedSelectedTab,
				selectedTab: selectedTab?.textContent.trim() ?? null,
				visibleCount: visibleImages.length,
				images: images.map((image) => {
					const rect = image.getBoundingClientRect();
					return {
						src: image.currentSrc || image.src,
						visible: visibleElement(image),
						complete: image.complete,
						naturalWidth: image.naturalWidth,
						naturalHeight: image.naturalHeight,
						width: rect.width,
						height: rect.height,
					};
				}),
			};
			const previewReady = previewElement?.dataset.previewStatus === undefined
				|| previewElement.dataset.previewStatus === "ready";
			if (!previewReady || !grid || visibleImages.length !== expectedVisibleCount) return null;
			if (expectedSelectedTab !== null && selectedTab?.textContent.trim() !== expectedSelectedTab) return null;
			if (visibleImages.some((image) => !image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0)) return null;
			return { preview: previewElement, grid, images, visibleImages };
		}, { label, timeoutMs });
	} catch (error) {
		throw new Error(`${error.message} Poster readiness: ${JSON.stringify(diagnostic)}`);
	}
}

async function clickAndSettle(element) {
	await act(async () => {
		element.click();
		await afterCommittedEffects();
	});
}

async function historyBackAndSettle() {
	await act(async () => {
		window.history.back();
		await new Promise((resolve) => setTimeout(resolve, 0));
		await afterCommittedEffects();
	});
}

function buttonContaining(container, text) {
	return [...container.querySelectorAll("button")].find((button) => button.textContent.includes(text)) ?? null;
}

function inputContaining(container, text) {
	return [...container.querySelectorAll("label")].find((label) => label.textContent.includes(text))?.querySelector("input") ?? null;
}

async function withMountedEditor({ controller, session, draft, run }) {
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	let updateCalls = 0;
	let submittedDraft = null;
	const saveController = {
		getState: () => controller.getState(),
		updateNode(...args) {
			updateCalls += 1;
			return controller.updateNode(...args);
		},
	};
	await act(async () => {
		root.render(createElement(SourceEditorDialog, {
			provider: {},
			peopleProvider: {},
			session,
			initialDraft: draft,
			onCancel() {},
			onSave(nextDraft) {
				submittedDraft = nextDraft;
				return saveSourceEdit(saveController, session, nextDraft);
			},
		}));
		await afterCommittedEffects();
	});
	try {
		return await run({
			getUpdateCalls: () => updateCalls,
			getSubmittedDraft: () => submittedDraft,
		});
	} finally {
		await act(async () => root.unmount());
		host.remove();
	}
}

async function runRequiredNameScenario(source) {
	const controller = createController();
	const folder = importSources(controller, [source]);
	const opened = openEdit(controller, folder.sources[0]);
	const revisionBefore = controller.getState().revision;
	const serializedBefore = serializedValue(controller);
	return withMountedEditor({
		controller,
		session: opened.session,
		draft: opened.draft,
		async run({ getUpdateCalls, getSubmittedDraft }) {
			const input = document.querySelector("#source-edit-title-input");
			await act(async () => {
				setInputValue(input, "");
				await Promise.resolve();
			});
			await act(async () => {
				document.querySelector('[data-action="save-source-edit"]').click();
				await afterCommittedEffects();
			});
			const alert = document.querySelector(".source-edit-diagnostics");
			return {
				activeElementIsInput: document.activeElement === input,
				ariaInvalid: input.getAttribute("aria-invalid"),
				alertRendered: Boolean(alert),
				alertRole: alert?.getAttribute("role") ?? null,
				alertText: alert?.textContent ?? "",
				dialogOpen: Boolean(document.querySelector('[data-source-edit-modal="true"]')),
				blankValuePreserved: input.value === "" && getSubmittedDraft()?.title === "",
				updateCalls: getUpdateCalls(),
				revisionBefore,
				revisionAfter: controller.getState().revision,
				serializedUnchanged: serializedValue(controller) === serializedBefore,
				label: document.querySelector('label[for="source-edit-title-input"]')?.textContent ?? "",
				helper: document.querySelector("#source-edit-title-help")?.textContent ?? "",
			};
		},
	});
}

async function runDuplicateScenario() {
	const controller = createController();
	const folder = importSources(controller, [
		collectionSource({ tmdbId: 100, title: "First" }),
		collectionSource({ tmdbId: 200, title: "Second" }),
	]);
	const opened = openEdit(controller, folder.sources[0]);
	const draft = chooseMovieCollection(opened.draft, { id: 200, name: "Replacement Collection" });
	const revisionBefore = controller.getState().revision;
	const serializedBefore = serializedValue(controller);
	return withMountedEditor({
		controller,
		session: opened.session,
		draft,
		async run({ getUpdateCalls, getSubmittedDraft }) {
			await act(async () => {
				document.querySelector('[data-action="save-source-edit"]').click();
				await afterCommittedEffects();
			});
			const input = document.querySelector("#source-edit-title-input");
			const alert = document.querySelector(".source-edit-diagnostics");
			return {
				activeElementIsAlert: document.activeElement === alert,
				activeElementIsInput: document.activeElement === input,
				alertRendered: Boolean(alert),
				alertRole: alert?.getAttribute("role") ?? null,
				alertText: alert?.textContent ?? "",
				dialogOpen: Boolean(document.querySelector('[data-source-edit-modal="true"]')),
				draftPreserved: input.value === "Replacement Collection"
					&& getSubmittedDraft()?.title === "Replacement Collection",
				updateCalls: getUpdateCalls(),
				revisionBefore,
				revisionAfter: controller.getState().revision,
				serializedUnchanged: serializedValue(controller) === serializedBefore,
			};
		},
	});
}

async function runStreamingCreationRequiredNameScenario() {
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	let applyCalls = 0;
	await act(async () => {
		root.render(createElement(StreamingSourceFlow, {
			catalogueProvider: {
				async loadCatalogue() {
					return {
						ok: true,
						data: {
							regions: [{ code: "AU", name: "Australia" }],
							providers: [{ id: 8, name: "Netflix", logoPath: null, moviePriorities: { AU: 1 }, tvPriorities: { AU: 2 } }],
						},
					};
				},
			},
			project: { collections: [] },
			folder: { internalId: "streaming-folder", editable: { title: "Streaming" } },
			onBack() {},
			onCancel() {},
			onApply() { applyCalls += 1; return { ok: true }; },
		}));
		await afterCommittedEffects();
	});
	try {
		await act(async () => {
			document.querySelector('[data-streaming-region="AU"]').click();
			await afterCommittedEffects();
		});
		await act(async () => {
			document.querySelector(".streaming-region-actions .editor-apply").click();
			await afterCommittedEffects();
		});
		await act(async () => {
			document.querySelector('[data-streaming-provider="8"]').click();
			await afterCommittedEffects();
		});
		await act(async () => {
			document.querySelector(".streaming-generated-source-actions button").click();
			await afterCommittedEffects();
		});
		let input = document.querySelector("#streaming-source-name-AU-movie");
		await act(async () => {
			setInputValue(input, "");
			await afterCommittedEffects();
		});
		await act(async () => {
			document.querySelector(".streaming-generated-source-actions button").click();
			await afterCommittedEffects();
		});
		await act(async () => {
			document.querySelector(".streaming-configure-actions .editor-apply").click();
			await afterCommittedEffects();
		});
		input = document.querySelector("#streaming-source-name-AU-movie");
		return {
			activeElementIsInput: document.activeElement === input,
			ariaInvalid: input?.getAttribute("aria-invalid") ?? null,
			inlineError: document.querySelector("#streaming-source-name-AU-movie-error")?.textContent ?? "",
			alertRendered: Boolean(document.querySelector(".streaming-configure .editor-diagnostics")),
			dialogOpen: Boolean(document.querySelector('[data-source-mode="tmdb-streaming-services"]')),
			applyCalls,
		};
	} finally {
		await act(async () => root.unmount());
		host.remove();
	}
}

async function runGenreEditSecondaryScenario() {
	const controller = createController();
	const folder = importSources(controller, [genreSource()]);
	const opened = openEdit(controller, folder.sources[0]);
	return withMountedEditor({
		controller,
		session: opened.session,
		draft: opened.draft,
		async run({ getSubmittedDraft }) {
			await clickAndSettle(document.querySelector(".source-edit-dialog .genre-advanced-options > summary"));
			const helpTrigger = document.querySelector(".source-edit-dialog .genre-advanced-help-action");
			await clickAndSettle(helpTrigger);
			const helpSurface = document.querySelector('.source-edit-dialog .genre-secondary-surface[data-surface="help"]');
			const helpHeading = document.querySelector("#genre-advanced-help-title");
			const form = document.querySelector(".source-edit-dialog form");
			const helpState = {
				surfaceOpen: Boolean(helpSurface),
				underlyingMounted: Boolean(document.querySelector(".source-edit-dialog .source-edit-scroll")),
				underlyingInert: document.querySelector(".source-edit-dialog .source-edit-scroll")?.hasAttribute("inert") ?? false,
				underlyingHeaderInert: document.querySelector(".source-edit-dialog .add-source-heading")?.hasAttribute("inert") ?? false,
				footerHidden: !document.querySelector(".source-edit-dialog .source-edit-actions"),
				focusOnHeading: document.activeElement === helpHeading,
				doneActive: document.querySelector(".source-edit-dialog .genre-secondary-done")?.disabled === false,
			};
			await act(async () => {
				form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
				await afterCommittedEffects();
			});
			helpState.submitBlocked = getSubmittedDraft() === null;
			await act(async () => {
				document.querySelector(".source-edit-dialog").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
				await afterCommittedEffects();
			});
			helpState.escapeClosed = !document.querySelector('.source-edit-dialog .genre-secondary-surface[data-surface="help"]');
			helpState.focusRestored = document.activeElement === helpTrigger;

			const exclusionTrigger = document.querySelector(".source-edit-dialog .genre-advanced-compact-actions .secondary-action");
			await clickAndSettle(exclusionTrigger);
			const picker = document.querySelector(".source-edit-dialog .genre-exclusion-picker-list");
			const selfButton = buttonContaining(picker, "Comedy");
			const horrorButton = buttonContaining(picker, "Horror");
			const exclusionState = {
				surfaceOpen: Boolean(document.querySelector('.source-edit-dialog .genre-secondary-surface[data-surface="exclusions"]')),
				selfOmitted: selfButton === null,
				tvOnlyOmitted: buttonContaining(picker, "News") === null,
				compatibleGenreAvailable: horrorButton?.disabled === false,
				footerHidden: !document.querySelector(".source-edit-dialog .source-edit-actions"),
				doneActive: document.querySelector(".source-edit-dialog .genre-secondary-done")?.disabled === false,
			};
			await clickAndSettle(horrorButton);
			await clickAndSettle(document.querySelector(".source-edit-dialog .genre-secondary-done"));
			exclusionState.valuePreserved = document.querySelector(".source-edit-dialog .genre-advanced-compact-actions")?.textContent.includes("Horror") ?? false;
			exclusionState.focusRestored = document.activeElement === exclusionTrigger;
			exclusionState.footerReturned = Boolean(document.querySelector(".source-edit-dialog .source-edit-actions"));
			return { help: helpState, exclusions: exclusionState };
		},
	});
}

async function runGenreCreationSecondaryScenario() {
	const controller = createController();
	const collectionResult = controller.createCollection({ editable: { title: "Genres" } });
	const folderResult = controller.createFolder(collectionResult.createdInternalId, { editable: { title: "Untitled Folder", tileShape: "POSTER", hideTitle: true } });
	const folder = controller.getState().project.collections[0].folders[0];
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	let applyCalls = 0;
	await act(async () => {
		root.render(createElement(GenreSourceFlow, {
			project: controller.getState().project,
			folder,
			onBack() {},
			onCancel() {},
			onApply() { applyCalls += 1; return { ok: true }; },
		}));
		await afterCommittedEffects();
	});
	try {
		await clickAndSettle(document.querySelector('[data-genre-name="Comedy"]'));
		await clickAndSettle(document.querySelector('[data-genre-name="Horror"]'));
		await clickAndSettle(document.querySelector(".genre-source-dialog .add-source-actions .editor-apply"));
		await clickAndSettle(document.querySelector(".genre-source-dialog .genre-advanced-options > summary"));
		const helpTrigger = document.querySelector(".genre-source-dialog .genre-advanced-help-action");
		await clickAndSettle(helpTrigger);
		const form = document.querySelector(".genre-source-dialog form");
		const helpHeading = document.querySelector(".genre-source-dialog #genre-advanced-help-title");
		const helpState = {
			surfaceOpen: Boolean(document.querySelector('.genre-source-dialog .genre-secondary-surface[data-surface="help"]')),
			underlyingMounted: Boolean(document.querySelector(".genre-source-dialog .genre-configure-step")),
			underlyingInert: document.querySelector(".genre-source-dialog .add-source-scroll")?.hasAttribute("inert") ?? false,
			underlyingHeaderInert: document.querySelector(".genre-source-dialog .add-source-heading")?.hasAttribute("inert") ?? false,
			footerHidden: !document.querySelector(".genre-source-dialog .genre-review-actions"),
			focusOnHeading: document.activeElement === helpHeading,
			doneActive: document.querySelector(".genre-source-dialog .genre-secondary-done")?.disabled === false,
		};
		await act(async () => {
			form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
			await afterCommittedEffects();
		});
		helpState.submitBlocked = applyCalls === 0;
		await act(async () => {
			document.querySelector(".genre-source-dialog").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
			await afterCommittedEffects();
		});
		helpState.escapeClosed = !document.querySelector('.genre-source-dialog .genre-secondary-surface[data-surface="help"]');
		helpState.focusRestored = document.activeElement === helpTrigger;

		const exclusionTrigger = document.querySelector(".genre-source-dialog .genre-advanced-compact-actions .secondary-action");
		await clickAndSettle(exclusionTrigger);
		const layout = document.querySelector(".genre-source-dialog .genre-exclusion-layout");
		const initialMobileView = layout?.dataset.mobileView ?? null;
		const includedPane = document.querySelector(".genre-source-dialog .genre-included-genre-pane");
		const rootDone = document.querySelector(".genre-source-dialog .genre-secondary-done");
		const rootDoneVisible = rootDone?.getClientRects().length > 0;
		await clickAndSettle(buttonContaining(includedPane, "Horror"));
		const picker = document.querySelector(".genre-source-dialog .genre-exclusion-picker-list");
		const selfButton = buttonContaining(picker, "Horror");
		const comedyButton = buttonContaining(picker, "Comedy");
		const detailHeader = document.querySelector(".genre-source-dialog .genre-exclusion-detail-header");
		const detailBack = document.querySelector(".genre-source-dialog .genre-exclusion-mobile-back");
		const detailScrollOwner = document.querySelector(".genre-source-dialog .genre-secondary-surface > .genre-advanced-subview");
		detailScrollOwner.scrollTop = 120;
		await afterCommittedEffects();
		const pickerState = {
			initialMobileView,
			pickerMobileView: layout?.dataset.mobileView ?? null,
			selfOmitted: selfButton === null,
			otherSelectedGenreAvailable: comedyButton?.disabled === false,
			incompatibleGenreOmitted: buttonContaining(picker, "News") === null,
			footerHidden: !document.querySelector(".genre-source-dialog .genre-review-actions"),
			rootDoneVisible,
			innerDoneHidden: rootDone?.getClientRects().length === 0,
			detailBackVisible: detailBack?.getClientRects().length > 0,
			detailBackLabel: detailBack?.textContent.trim() ?? null,
			detailHeaderSticky: getComputedStyle(detailHeader).position === "sticky",
			detailBackRemainsVisibleAfterScroll: detailBack?.getClientRects().length > 0,
			detailHeadingFocused: document.activeElement === detailHeader?.querySelector("h5"),
			singleScrollOwner: getComputedStyle(picker).overflowY !== "auto" && getComputedStyle(picker).overflowY !== "scroll",
		};
		await historyBackAndSettle();
		pickerState.browserBackReturnedToRoot = layout?.dataset.mobileView === "genres";
		pickerState.rootDoneReturnedAfterBrowserBack = rootDone?.getClientRects().length > 0;
		await clickAndSettle(buttonContaining(includedPane, "Horror"));
		await clickAndSettle(buttonContaining(document.querySelector(".genre-source-dialog .genre-exclusion-picker-list"), "Comedy"));
		await clickAndSettle(document.querySelector(".genre-source-dialog .genre-exclusion-mobile-back"));
		pickerState.backPreservedValue = buttonContaining(includedPane, "Horror")?.textContent.includes("Comedy excluded") ?? false;
		await clickAndSettle(document.querySelector(".genre-source-dialog .genre-secondary-done"));
		pickerState.mainSummaryUpdated = document.querySelector(".genre-source-dialog .genre-advanced-compact-actions")?.textContent.includes("Exclusions configured for 1 genre") ?? false;
		pickerState.focusRestored = document.activeElement === exclusionTrigger;
		pickerState.footerReturned = Boolean(document.querySelector(".genre-source-dialog .genre-review-actions"));
		return { help: helpState, exclusions: pickerState, applyCalls };
	} finally {
		await act(async () => root.unmount());
		host.remove();
	}
}

async function runGenreBrowseFocusScenario() {
	const controller = createController();
	const collectionResult = controller.createCollection({ editable: { title: "Genres" } });
	const folderResult = controller.createFolder(collectionResult.createdInternalId, { editable: { title: "Browse Genres", tileShape: "POSTER", hideTitle: true } });
	const folder = controller.getState().project.collections[0].folders.find((entry) => entry.internalId === folderResult.createdInternalId);
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	await act(async () => {
		root.render(createElement(GenreSourceFlow, { project: controller.getState().project, folder, onBack() {}, onCancel() {}, onApply() { return { ok: true }; } }));
		await afterCommittedEffects();
	});
	try {
		const input = document.querySelector(".genre-source-dialog #genre-source-query");
		const heading = document.querySelector(".genre-source-dialog #genre-browse-title");
		const initial = {
			searchFocused: document.activeElement === input,
			browseHeadingFocused: document.activeElement === heading,
		};
		await clickAndSettle(document.querySelector('[data-genre-name="Comedy"]'));
		await act(async () => {
			input.focus({ preventScroll: true });
			input.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
			input.click();
			await afterCommittedEffects();
		});
		const explicitFocused = document.activeElement === input;
		await act(async () => {
			setInputValue(input, "a");
			await afterCommittedEffects();
		});
		const selectionSurvivedFiltering = document.querySelector(".genre-selection-toolbar")?.textContent.includes("1 of 27 selected")
			&& document.querySelectorAll("[data-genre-name]").length < 27
			&& Boolean(document.querySelector('[data-genre-name="Action"]'));
		await clickAndSettle(document.querySelector('[data-genre-name="Action"]'));
		const scrollOwner = document.querySelector(".genre-source-dialog .add-source-scroll");
		scrollOwner.scrollTop = 173;
		await clickAndSettle(document.querySelector(".genre-source-dialog .add-source-actions .editor-apply"));
		await clickAndSettle(document.querySelector('[data-action="back-to-genre-browse"]'));
		const returnedInput = document.querySelector(".genre-source-dialog #genre-source-query");
		return {
			initial,
			explicitFocused,
			selectionSurvivedFiltering,
			returnSearchFocused: document.activeElement === returnedInput,
			returnHeadingFocused: document.activeElement === document.querySelector(".genre-source-dialog #genre-browse-title"),
			returnQuery: returnedInput?.value ?? null,
			returnSelectionCount: document.querySelector(".genre-selection-toolbar")?.textContent.includes("2 of 27 selected") ?? false,
			returnScrollTop: document.querySelector(".genre-source-dialog .add-source-scroll")?.scrollTop ?? null,
		};
	} finally {
		await act(async () => root.unmount());
		host.remove();
	}
}

async function runGenreToolbarScenario() {
	const controller = createController();
	const collectionResult = controller.createCollection({ editable: { title: "Genres" } });
	const folderResult = controller.createFolder(collectionResult.createdInternalId, { editable: { title: "Toolbar Genres", tileShape: "POSTER", hideTitle: true } });
	const folder = controller.getState().project.collections[0].folders.find((entry) => entry.internalId === folderResult.createdInternalId);
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	await act(async () => {
		root.render(createElement(GenreSourceFlow, { project: controller.getState().project, folder, onBack() {}, onCancel() {}, onApply() { return { ok: true }; } }));
		await afterCommittedEffects();
	});
	try {
		const toolbar = document.querySelector(".genre-selection-toolbar");
		const actions = document.querySelector(".genre-selection-actions");
		const [selectAll, clearAll] = actions.querySelectorAll("button");
		const disabledInitially = clearAll.disabled;
		await clickAndSettle(selectAll);
		const countUpdated = toolbar.textContent.includes("27 of 27 selected");
		const clearEnabledAfterSelection = !clearAll.disabled;
		const selectRect = selectAll.getBoundingClientRect();
		const clearRect = clearAll.getBoundingClientRect();
		const dialog = document.querySelector(".genre-source-dialog");
		const heading = document.querySelector("#genre-browse-title");
		return {
			width: window.innerWidth,
			countPresent: toolbar.textContent.includes("27 of 27 selected"),
			countUpdated,
			actionsGrouped: selectAll.parentElement === clearAll.parentElement && actions.children.length === 2,
			actionsShareRow: Math.abs(selectRect.top - clearRect.top) < 1,
			comfortableTargets: selectRect.height >= 44 && clearRect.height >= 44,
			disabledInitially,
			clearEnabledAfterSelection,
			headingHasWidth: heading.parentElement.clientWidth > 0 && heading.scrollWidth <= heading.parentElement.clientWidth,
			noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth && dialog.scrollWidth <= dialog.clientWidth && toolbar.scrollWidth <= toolbar.clientWidth,
		};
	} finally {
		await act(async () => root.unmount());
		host.remove();
	}
}

function setSelectValue(select, value) {
	const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
	setter.call(select, value);
	select.dispatchEvent(new Event("change", { bubbles: true }));
}

const GENRE_SUMMARY_TEST_NAMES = Object.freeze([
	"Action & Adventure",
	"Science Fiction",
	"Sci-Fi & Fantasy",
	"War & Politics",
	"Action",
	"Adventure",
	"Animation",
]);

function genreCardByName(dialog, name) {
	return [...dialog.querySelectorAll(".genre-catalogue-choice")].find((card) => card.dataset.genreName === name) ?? null;
}

function genreSummaryState(dialog, expectedCount) {
	const tray = dialog.querySelector(".genre-hierarchy-selected-tray");
	const count = tray?.querySelector(".people-selected-summary > strong") ?? null;
	const disclosure = tray?.querySelector(".removable-selection-disclosure") ?? null;
	const countRect = count?.getBoundingClientRect() ?? null;
	const disclosureRect = disclosure?.getBoundingClientRect() ?? null;
	const overlaps = Boolean(countRect && disclosureRect
		&& countRect.left < disclosureRect.right - 0.5
		&& countRect.right > disclosureRect.left + 0.5
		&& countRect.top < disclosureRect.bottom - 0.5
		&& countRect.bottom > disclosureRect.top + 0.5);
	return {
		count: expectedCount,
		trayPresent: Boolean(tray),
		countText: count?.textContent ?? null,
		disclosurePresent: Boolean(disclosure),
		disclosureLabel: disclosure?.querySelector("summary")?.textContent ?? null,
		disclosureCollapsed: disclosure ? !disclosure.open : null,
		inlinePillsPresent: Boolean(tray?.querySelector(".removable-selection-pills")),
		countDisclosureOverlap: overlaps,
		removeControlCount: disclosure?.querySelectorAll('[aria-label^="Remove "]').length ?? 0,
		noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth + 1 && dialog.scrollWidth <= dialog.clientWidth + 1,
	};
}

async function runGenreHierarchyScenario() {
	const controller = createController();
	const revisionBefore = controller.getState().revision;
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	let applyCalls = 0;
	await act(async () => {
		root.render(createElement(CreationDialog, {
			scope: "new-collection",
			project: controller.getState().project,
			projectRevision: controller.getState().revision,
			currentYear: 2026,
			initialOptionId: "genres",
			onCancel() {},
			onCreateBlank() {},
			onApplyDecades() { return { ok: true }; },
			onApplyPeople() { return { ok: true }; },
			onApplyFranchises() { return { ok: true }; },
			onApplyStudios() { return { ok: true }; },
			onApplyNetworks() { return { ok: true }; },
			onApplyGenres(plan) { applyCalls += 1; return applyGenreHierarchyPlan(controller, plan); },
		}));
		await afterCommittedEffects();
	});
	try {
		const dialog = document.querySelector('[data-creation-option="genres"]');
		const scrollOwner = dialog.querySelector(".add-source-scroll");
		const action = dialog.querySelector(".add-source-actions");
		const search = dialog.querySelector("#genre-hierarchy-query");
		const selectHeading = dialog.querySelector("#genre-hierarchy-select-title");
		const cards = [...dialog.querySelectorAll(".genre-catalogue-choice")];
		const initial = {
			searchFocused: document.activeElement === search,
			selectHeadingFocused: document.activeElement === selectHeading,
			cardCount: cards.length,
			nativeCheckboxes: cards.every((card) => card.querySelector('input[type="checkbox"]')),
		};
		const selectionCountStates = [genreSummaryState(dialog, 0)];
		for (const name of GENRE_SUMMARY_TEST_NAMES) {
			await clickAndSettle(genreCardByName(dialog, name));
			selectionCountStates.push(genreSummaryState(dialog, selectionCountStates.length));
		}
		let selectedDisclosure = dialog.querySelector(".genre-hierarchy-selected-tray .removable-selection-disclosure");
		const selectedDisclosureSummary = selectedDisclosure.querySelector("summary");
		const dialogRectBeforeDisclosure = dialog.getBoundingClientRect();
		const actionRectBeforeDisclosure = action.getBoundingClientRect();
		const documentScrollBeforeDisclosure = window.scrollY;
		await clickAndSettle(selectedDisclosureSummary);
		const selectedDisclosureList = selectedDisclosure.querySelector("ul");
		const selectedDisclosureListStyle = getComputedStyle(selectedDisclosureList);
		const openDisclosureState = {
			opened: selectedDisclosure.open,
			removeControlCount: selectedDisclosure.querySelectorAll('[aria-label^="Remove "]').length,
			bounded: selectedDisclosureList.clientHeight <= Math.min(window.innerHeight * 0.36, 340) + 2,
			scrollableWhenNeeded: selectedDisclosureListStyle.overflowY === "auto",
		};
		await clickAndSettle(selectedDisclosureSummary);
		openDisclosureState.closed = !selectedDisclosure.open;
		openDisclosureState.outerStable = Math.abs(dialog.getBoundingClientRect().top - dialogRectBeforeDisclosure.top) <= 1
			&& Math.abs(dialog.getBoundingClientRect().bottom - dialogRectBeforeDisclosure.bottom) <= 1;
		openDisclosureState.documentStable = window.scrollY === documentScrollBeforeDisclosure;
		openDisclosureState.actionStable = Math.abs(action.getBoundingClientRect().top - actionRectBeforeDisclosure.top) <= 1
			&& Math.abs(action.getBoundingClientRect().bottom - actionRectBeforeDisclosure.bottom) <= 1;

		await clickAndSettle(selectedDisclosureSummary);
		await act(async () => {
			setInputValue(search, "Western");
			await afterCommittedEffects();
		});
		const filteredSelectedCardAbsent = genreCardByName(dialog, GENRE_SUMMARY_TEST_NAMES[0]) === null;
		const filteredRemoveAction = dialog.querySelector(`[aria-label="Remove ${GENRE_SUMMARY_TEST_NAMES[0]}"]`);
		await clickAndSettle(filteredRemoveAction);
		const removedWhileFiltered = dialog.querySelector(".people-selected-summary > strong")?.textContent === "6 Genres selected"
			&& dialog.querySelector(`[aria-label="Remove ${GENRE_SUMMARY_TEST_NAMES[0]}"]`) === null;
		await act(async () => {
			setInputValue(search, "");
			await afterCommittedEffects();
		});
		await clickAndSettle(genreCardByName(dialog, GENRE_SUMMARY_TEST_NAMES[0]));
		selectedDisclosure = dialog.querySelector(".genre-hierarchy-selected-tray .removable-selection-disclosure");
		if (!selectedDisclosure.open) await clickAndSettle(selectedDisclosure.querySelector("summary"));
		const selectedOrder = [...selectedDisclosure.querySelectorAll('[aria-label^="Remove "]')].map((button) => button.getAttribute("aria-label").replace(/^Remove /, ""));
		const expectedReselectedOrder = [...GENRE_SUMMARY_TEST_NAMES.slice(1), GENRE_SUMMARY_TEST_NAMES[0]];
		const summaryInteraction = {
			openDisclosureState,
			filteredSelectedCardAbsent,
			filteredRemoveAvailable: Boolean(filteredRemoveAction),
			removedWhileFiltered,
			reselectedCount: dialog.querySelector(".people-selected-summary > strong")?.textContent ?? null,
			selectedOrder,
			reselectedAtEnd: JSON.stringify(selectedOrder) === JSON.stringify(expectedReselectedOrder),
			namedRemoveControls: selectedOrder.length === GENRE_SUMMARY_TEST_NAMES.length,
		};
		await clickAndSettle(selectedDisclosure.querySelector("summary"));
		await clickAndSettle(buttonContaining(dialog.querySelector(".genre-selection-actions"), "Clear all"));
		summaryInteraction.zeroRestored = genreSummaryState(dialog, 0);

		const focusCards = [...dialog.querySelectorAll(".genre-catalogue-choice")];
		const target = focusCards[12];
		const scrollRect = scrollOwner.getBoundingClientRect();
		const cardRect = target.getBoundingClientRect();
		const visibleHeight = Math.min(42, cardRect.height / 3);
		scrollOwner.scrollTop += cardRect.top - (scrollRect.bottom - visibleHeight);
		await afterCommittedEffects();
		const targetInput = target.querySelector('input[type="checkbox"]');
		const ownerRect = scrollOwner.getBoundingClientRect();
		const targetRect = target.getBoundingClientRect();
		const dialogRectBeforeFocus = dialog.getBoundingClientRect();
		const actionTopBeforeFocus = action.getBoundingClientRect().top;
		const documentScrollBeforeFocus = window.scrollY;
		const innerScrollBeforeFocus = scrollOwner.scrollTop;
		await act(async () => {
			targetInput.focus();
			await afterCommittedEffects();
		});
		const focusEvidence = {
			partiallyClipped: targetRect.top < ownerRect.bottom && targetRect.bottom > ownerRect.bottom,
			nativeCheckboxFocused: document.activeElement === targetInput,
			innerScrollDelta: scrollOwner.scrollTop - innerScrollBeforeFocus,
			outerStable: Math.abs(dialog.getBoundingClientRect().top - dialogRectBeforeFocus.top) < 1 && Math.abs(dialog.getBoundingClientRect().bottom - dialogRectBeforeFocus.bottom) < 1,
			documentStable: window.scrollY === documentScrollBeforeFocus,
			actionStable: Math.abs(action.getBoundingClientRect().top - actionTopBeforeFocus) < 1,
			actionReachable: action.getBoundingClientRect().top >= -1
				&& action.getBoundingClientRect().bottom <= window.innerHeight + 1
				&& action.getBoundingClientRect().height >= 44,
		};

		await act(async () => {
			search.focus({ preventScroll: true });
			search.click();
			setInputValue(search, "a");
			await afterCommittedEffects();
		});
		const explicitSearchFocused = document.activeElement === search;
		await clickAndSettle(buttonContaining(dialog.querySelector(".genre-selection-actions"), "Select all"));
		const selectedAll = dialog.querySelector(".genre-selection-toolbar")?.textContent.includes("27 of 27 selected") ?? false;
		selectionCountStates.push(genreSummaryState(dialog, 27));
		const largeDisclosureElement = dialog.querySelector(".genre-hierarchy-selected-tray .removable-selection-disclosure");
		const largeDisclosureDialogRect = dialog.getBoundingClientRect();
		const largeDisclosureActionRect = action.getBoundingClientRect();
		const largeDisclosureDocumentScroll = window.scrollY;
		await clickAndSettle(largeDisclosureElement.querySelector("summary"));
		const largeDisclosureList = largeDisclosureElement.querySelector("ul");
		const largeDisclosure = {
			opened: largeDisclosureElement.open,
			removeControlCount: largeDisclosureElement.querySelectorAll('[aria-label^="Remove "]').length,
			bounded: largeDisclosureList.clientHeight <= Math.min(window.innerHeight * 0.36, 340) + 2,
			scrollable: getComputedStyle(largeDisclosureList).overflowY === "auto" && largeDisclosureList.scrollHeight >= largeDisclosureList.clientHeight,
		};
		await clickAndSettle(largeDisclosureElement.querySelector("summary"));
		largeDisclosure.closed = !largeDisclosureElement.open;
		largeDisclosure.outerStable = Math.abs(dialog.getBoundingClientRect().top - largeDisclosureDialogRect.top) <= 1
			&& Math.abs(dialog.getBoundingClientRect().bottom - largeDisclosureDialogRect.bottom) <= 1;
		largeDisclosure.documentStable = window.scrollY === largeDisclosureDocumentScroll;
		largeDisclosure.actionStable = Math.abs(action.getBoundingClientRect().top - largeDisclosureActionRect.top) <= 1
			&& Math.abs(action.getBoundingClientRect().bottom - largeDisclosureActionRect.bottom) <= 1;
		const selectedChoiceCard = dialog.querySelector('.genre-catalogue-choice[data-selected="true"]');
		const selectedChoiceStyle = selectedChoiceCard ? getComputedStyle(selectedChoiceCard) : null;
		const selectionPresentation = {
			nativeChecked: selectedChoiceCard?.querySelector('input[type="checkbox"]')?.checked === true,
			markerAbsent: selectedChoiceCard?.querySelector('[data-selection-indicator], .selectable-card-indicator') === null,
			surfaceRetained: selectedChoiceStyle?.backgroundColor !== "rgba(0, 0, 0, 0)",
			borderRetained: selectedChoiceStyle?.borderColor !== "rgba(0, 0, 0, 0)",
			structuralInset: selectedChoiceStyle?.boxShadow !== "none",
		};
		await clickAndSettle(dialog.querySelector(".add-source-actions .editor-apply"));
		const mediaPill = dialog.querySelector('.genre-hierarchy-configuration-surface input[name="genre-hierarchy-media"][value="both"]')?.closest("label");
		const noFixedNoteForBoth = !dialog.querySelector(".genre-fixed-media-note");
		await clickAndSettle(dialog.querySelector('.genre-hierarchy-configuration-surface input[name="genre-hierarchy-media"][value="movies"]'));
		const moviesFixedNote = dialog.querySelector(".genre-fixed-media-note")?.textContent ?? "";
		await clickAndSettle(dialog.querySelector('.genre-hierarchy-configuration-surface input[name="genre-hierarchy-media"][value="series"]'));
		const seriesFixedNote = dialog.querySelector(".genre-fixed-media-note")?.textContent ?? "";
		await clickAndSettle(dialog.querySelector('.genre-hierarchy-configuration-surface input[name="genre-hierarchy-media"][value="both"]'));

		const configureState = {
			stage: dialog.querySelector(".genre-hierarchy-form")?.dataset.genreHierarchyStage ?? null,
			headingFocused: document.activeElement === dialog.querySelector("#genre-hierarchy-configure-title"),
			bothDefault: dialog.querySelector('.genre-hierarchy-configuration-surface input[value="both"]')?.checked ?? false,
			selectedCount: dialog.querySelector(".genre-hierarchy-configured-genres")?.textContent.includes("Configured Genres · 27") ?? false,
			allConfiguredRowsVisible: dialog.querySelectorAll(".genre-hierarchy-configure-row").length === 27,
			duplicateDisclosuresAbsent: !dialog.querySelector(".genre-hierarchy-configure .removable-selection-disclosure, .genre-hierarchy-configure .genre-review-toggle"),
			noDestinationChooser: !dialog.querySelector(".genre-destination-choices"),
			noOverride: !dialog.querySelector('[data-action="add-all-genres-anyway"]'),
			contextualSummary: dialog.querySelector(".genre-hierarchy-configuration-summary")?.textContent.includes("27 configured Genres · 35 sources") ?? false,
			mediaPills: dialog.querySelectorAll('.genre-hierarchy-configuration-surface input[name="genre-hierarchy-media"]').length === 3,
			sortPills: dialog.querySelectorAll('.genre-hierarchy-configuration-surface input[name="genre-hierarchy-sort"]').length === 4,
			pillRounded: Number.parseFloat(getComputedStyle(mediaPill).borderRadius) >= 18,
			noFixedNoteForBoth,
			moviesFixedNote,
			seriesFixedNote,
		};
		await clickAndSettle(dialog.querySelector(".genre-advanced-options > summary"));
		const helpTrigger = dialog.querySelector(".genre-advanced-help-action");
		await clickAndSettle(helpTrigger);
		const secondaryState = {
			open: Boolean(dialog.querySelector('.genre-secondary-surface[data-surface="help"]')),
			scrollInert: scrollOwner.hasAttribute("inert"),
			headerInert: dialog.querySelector(".add-source-heading")?.hasAttribute("inert") ?? false,
			footerHidden: !dialog.querySelector(".add-source-actions"),
			focusOnHeading: document.activeElement === dialog.querySelector("#genre-advanced-help-title"),
		};
		await act(async () => {
			dialog.querySelector(".genre-hierarchy-form").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
			await afterCommittedEffects();
		});
		secondaryState.escapeClosed = !dialog.querySelector('.genre-secondary-surface[data-surface="help"]');
		secondaryState.focusRestored = document.activeElement === helpTrigger;

		await clickAndSettle(dialog.querySelector(".add-source-actions .editor-apply"));
		const structureCards = [...dialog.querySelectorAll(".genre-structure-choice-grid [data-choice-id]")];
		const structureCounts = Object.fromEntries(structureCards.map((label) => [label.dataset.choiceId, label.querySelector(".genre-structure-counts")?.textContent ?? ""]));
		const structureGrid = dialog.querySelector(".genre-structure-choice-grid");
		const structureSection = dialog.querySelector(".genre-hierarchy-structure");
		const structureFieldset = structureGrid.closest("fieldset");
		const selectedStructureCard = dialog.querySelector('[data-choice-id="genre-folders"]');
		const unselectedStructureCard = dialog.querySelector('[data-choice-id="media-folders"]');
		const selectedStructureStyle = getComputedStyle(selectedStructureCard);
		const unselectedStructureStyle = getComputedStyle(unselectedStructureCard);
		const structurePreviews = structureCards.map((card) => card.querySelector(".genre-structure-wireframe"));
		const descriptionDiagramGaps = structureCards.map((card) => {
			const descriptionRect = card.querySelector("small").getBoundingClientRect();
			const diagramRect = card.querySelector(".genre-structure-wireframe").getBoundingClientRect();
			return diagramRect.top - descriptionRect.bottom;
		});
		const structureRows = [];
		for (const card of structureCards) {
			const top = Math.round(card.getBoundingClientRect().top);
			const row = structureRows.find((entry) => entry.top === top);
			if (row) row.cards.push(card);
			else structureRows.push({ top, cards: [card] });
		}
		const structureVisualEvidence = {
			previewTypes: structureCards.map((card) => card.querySelector("[data-genre-structure-preview]")?.dataset.genreStructurePreview ?? null),
			visualHierarchyComplete: structurePreviews.every((preview) => preview
				&& preview.querySelector(".genre-structure-wireframe-collection-title")
				&& preview.querySelector(".genre-structure-wireframe-folder-title")
				&& preview.querySelector(".genre-structure-wireframe-sources i")),
			visualPreviewsBounded: structureCards.every((card) => {
				const cardRect = card.getBoundingClientRect();
				const previewRect = card.querySelector(".genre-structure-wireframe").getBoundingClientRect();
				return previewRect.width > 0 && previewRect.height > 0 && previewRect.left >= cardRect.left - 1 && previewRect.right <= cardRect.right + 1;
			}),
			countsReadable: structureCards.every((card) => {
				const counts = card.querySelector(".genre-structure-counts");
				return counts.getBoundingClientRect().height > 0 && counts.scrollWidth <= counts.clientWidth + 1;
			}),
			descriptionDiagramSpacingConsistent: Math.max(...descriptionDiagramGaps) - Math.min(...descriptionDiagramGaps) <= 1,
			rowCountAlignmentPreserved: structureRows.every((row) => {
				const countBottoms = row.cards.map((card) => card.querySelector(".genre-structure-counts").getBoundingClientRect().bottom);
				return Math.max(...countBottoms) - Math.min(...countBottoms) <= 1;
			}),
			selectedStyleClear: selectedStructureCard.dataset.selected === "true"
				&& !unselectedStructureCard.hasAttribute("data-selected")
				&& selectedStructureStyle.borderColor !== unselectedStructureStyle.borderColor
				&& selectedStructureStyle.backgroundColor !== unselectedStructureStyle.backgroundColor,
			nativeRadioSemantics: structureCards.every((card) => card.querySelector('input[type="radio"]'))
				&& dialog.querySelectorAll('.genre-structure-choice-grid input[type="radio"]:checked').length === 1,
			previewsHiddenFromAccessibilityTree: structurePreviews.every((preview) => preview.getAttribute("aria-hidden") === "true"),
		};
		const actionComposite = [...dialog.querySelectorAll(".genre-composite-control")].find((control) => control.querySelector("legend")?.textContent === "Action & Adventure");
		const addToBoth = actionComposite?.querySelector('input[value="both"]');
		const compositeSection = dialog.querySelector(".genre-composite-placement");
		const compositeRect = compositeSection?.getBoundingClientRect();
		const structureGridRect = structureGrid.getBoundingClientRect();
		const structureState = {
			stage: dialog.querySelector(".genre-hierarchy-form")?.dataset.genreHierarchyStage ?? null,
			headingFocused: document.activeElement === dialog.querySelector("#genre-hierarchy-structure-title"),
			introCopy: structureSection.querySelector(":scope > .studio-configure-helper")?.textContent ?? "",
			genreHierarchyHeadingAbsent: !structureSection.textContent.includes("Genre hierarchy"),
			structureLegendHidden: structureFieldset.querySelector("legend")?.classList.contains("visually-hidden") === true,
			choiceCount: dialog.querySelectorAll('[name="genre-hierarchy-structure"]').length,
			defaultGenreFolders: dialog.querySelector('[name="genre-hierarchy-structure"][value="genre-folders"]')?.checked ?? false,
			structureCounts,
			visibleCountsOmitSources: Object.values(structureCounts).every((value) => !value.includes("source")),
			structureCopy: Object.fromEntries(structureCards.map((card) => [card.dataset.choiceId, {
				title: card.querySelector("strong")?.textContent ?? "",
				description: card.querySelector("small")?.textContent ?? "",
			}])),
			structureVisualEvidence,
			compositesBelowCards: Boolean(compositeRect) && compositeRect.top >= structureGridRect.bottom - 1,
			compositeHeading: compositeSection?.querySelector("h4")?.textContent ?? "",
			compositeHelper: compositeSection?.querySelector("h4 + p")?.textContent ?? "",
			optionalPlacementAbsent: !compositeSection?.textContent.includes("Optional placement"),
			compositeControlCount: dialog.querySelectorAll(".genre-composite-control").length,
			actionTargets: [...(actionComposite?.querySelectorAll('input[type="radio"]') ?? [])].map((input) => input.value),
			actionLabels: [...(actionComposite?.querySelectorAll("label") ?? [])].map((label) => label.textContent.trim()),
		};
		await clickAndSettle(addToBoth);
		structureState.addToBothCount = dialog.querySelector('[data-choice-id="genre-folders"] .genre-structure-counts')?.textContent ?? "";
		await clickAndSettle(dialog.querySelector('[name="genre-hierarchy-structure"][value="media-folders"]'));
		structureState.mediaFoldersSelected = dialog.querySelector('[data-choice-id="media-folders"]')?.dataset.selected === "true"
			&& dialog.querySelector('[name="genre-hierarchy-structure"][value="media-folders"]')?.checked === true;
		structureState.compositesHiddenForMedia = !dialog.querySelector(".genre-composite-placement");
		await clickAndSettle(dialog.querySelector('[name="genre-hierarchy-structure"][value="genre-folders"]'));
		structureState.genreFoldersReselected = dialog.querySelector('[data-choice-id="genre-folders"]')?.dataset.selected === "true";
		structureState.addToBothPreserved = actionComposite !== null && [...dialog.querySelectorAll(".genre-composite-control")].find((control) => control.querySelector("legend")?.textContent === "Action & Adventure")?.querySelector('input[value="both"]')?.checked === true;
		const restoredActionComposite = [...dialog.querySelectorAll(".genre-composite-control")].find((control) => control.querySelector("legend")?.textContent === "Action & Adventure");
		await clickAndSettle(restoredActionComposite.querySelector('input[value="standalone"]'));
		await clickAndSettle(dialog.querySelector('[name="genre-hierarchy-structure"][value="separate-media-genre-folders"]'));
		await clickAndSettle(dialog.querySelector(".add-source-actions .editor-apply"));
		structureState.separateFoldersShowTitlesDefault = dialog.querySelector('input[name="genre-hierarchy-folder-title-visibility"][value="SHOW_EVERYWHERE"]')?.checked === true;
		await clickAndSettle(dialog.querySelector('input[name="genre-hierarchy-folder-title-visibility"][value="HIDE_EVERYWHERE"]'));
		await clickAndSettle(dialog.querySelector('[data-action="back-to-genre-hierarchy-structure"]'));
		await clickAndSettle(dialog.querySelector('[name="genre-hierarchy-structure"][value="genre-folders"]'));
		await clickAndSettle(dialog.querySelector('[name="genre-hierarchy-structure"][value="separate-media-genre-folders"]'));
		await clickAndSettle(dialog.querySelector(".add-source-actions .editor-apply"));
		structureState.manualTitleVisibilityPreserved = dialog.querySelector('input[name="genre-hierarchy-folder-title-visibility"][value="HIDE_EVERYWHERE"]')?.checked === true;
		await clickAndSettle(dialog.querySelector('[data-action="back-to-genre-hierarchy-structure"]'));
		await clickAndSettle(dialog.querySelector('[name="genre-hierarchy-structure"][value="genre-folders"]'));
		await clickAndSettle(dialog.querySelector(".add-source-actions .editor-apply"));
		await clickAndSettle(dialog.querySelector('input[name="genre-hierarchy-folder-title-visibility"][value="HIDE_HOME_SCREEN"]'));
		const totals = [...dialog.querySelectorAll(".decades-plan-totals strong")].map((element) => Number(element.textContent));
		const appearanceState = {
			stage: dialog.querySelector(".genre-hierarchy-form")?.dataset.genreHierarchyStage ?? null,
			headingFocused: document.activeElement === dialog.querySelector("#genre-hierarchy-appearance-title"),
			totals,
			hideHomeDefault: dialog.querySelector('input[name="genre-hierarchy-folder-title-visibility"][value="HIDE_HOME_SCREEN"]')?.checked ?? false,
			landscapeDefault: dialog.querySelector('input[name="genre-hierarchy-folder-shape"][value="LANDSCAPE"]')?.checked ?? false,
			posterAvailable: Boolean(dialog.querySelector('input[name="genre-hierarchy-folder-shape"][value="POSTER"]')),
			configureRowsAbsent: dialog.querySelectorAll(".genre-hierarchy-configure-row").length === 0,
		};

		await clickAndSettle(dialog.querySelector('[data-action="back-to-genre-hierarchy-structure"]'));
		const structureRestored = dialog.querySelector(".genre-hierarchy-form")?.dataset.genreHierarchyStage === "structure" && dialog.querySelector('[name="genre-hierarchy-structure"][value="genre-folders"]')?.checked === true;
		await clickAndSettle(dialog.querySelector('[data-action="back-to-genre-hierarchy-configuration"]'));
		const configureRestored = dialog.querySelector(".genre-hierarchy-form")?.dataset.genreHierarchyStage === "configure" && dialog.querySelector(".genre-hierarchy-configuration-summary")?.textContent.includes("27 configured Genres · 35 sources");
		await clickAndSettle(dialog.querySelector('[data-action="back-to-genre-hierarchy-selection"]'));
		const selectRestored = {
			stage: dialog.querySelector(".genre-hierarchy-form")?.dataset.genreHierarchyStage ?? null,
			query: dialog.querySelector("#genre-hierarchy-query")?.value ?? null,
			selectedAll: dialog.querySelector(".genre-selection-toolbar")?.textContent.includes("27 of 27 selected") ?? false,
			headingFocused: document.activeElement === dialog.querySelector("#genre-hierarchy-select-title"),
		};
		await clickAndSettle(dialog.querySelector(".add-source-actions .editor-apply"));
		await clickAndSettle(dialog.querySelector(".add-source-actions .editor-apply"));
		await clickAndSettle(dialog.querySelector(".add-source-actions .editor-apply"));
		await clickAndSettle(dialog.querySelector(".add-source-actions .editor-apply"));
		const state = controller.getState();
		const collection = state.project.collections[0];
		const comedy = collection.folders.find((folder) => folder.editable.title === "Comedy");
		const horror = collection.folders.find((folder) => folder.editable.title === "Horror");
		const actionAdventure = collection.folders.find((folder) => folder.editable.title === "Action & Adventure");
		return {
			width: window.innerWidth,
			initial,
			selectionCountStates,
			summaryInteraction,
			largeDisclosure,
			explicitSearchFocused,
			selectedAll,
			selectionPresentation,
			focusEvidence,
			configureState,
			secondaryState,
			structureState,
			appearanceState,
			structureRestored,
			configureRestored,
			selectRestored,
			applyCalls,
			revisionDelta: state.revision - revisionBefore,
			folderCount: collection.folders.length,
			sourceCount: collection.folders.flatMap((folder) => folder.sources).length,
			contextualTitles: {
				comedy: comedy.sources.map((source) => source.editable.title),
				horror: horror.sources.map((source) => source.editable.title),
				actionAdventure: actionAdventure.sources.map((source) => source.editable.title),
			},
			oneScrollOwner: dialog.querySelectorAll(".add-source-scroll").length === 1,
			noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth && dialog.scrollWidth <= dialog.clientWidth,
		};
	} finally {
		await act(async () => root.unmount());
		host.remove();
	}
}

async function runGenreNewFolderSummaryScenario() {
	const controller = createController();
	const imported = controller.importValue([{ id: "destination", title: "Destination", folders: [] }]);
	if (!imported.ok) throw new Error("Genre New Folder summary fixture could not import its destination collection.");
	const destination = controller.getState().project.collections[0];
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	await act(async () => {
		root.render(createElement(CreationDialog, {
			scope: "new-folder",
			project: controller.getState().project,
			projectRevision: controller.getState().revision,
			currentYear: 2026,
			destinationCollectionInternalId: destination.internalId,
			destinationCollectionTitle: destination.editable.title,
			initialOptionId: "genres",
			onCancel() {},
			onCreateBlank() {},
			onApplyDecades() { return { ok: true }; },
			onApplyPeople() { return { ok: true }; },
			onApplyFranchises() { return { ok: true }; },
			onApplyStudios() { return { ok: true }; },
			onApplyNetworks() { return { ok: true }; },
			onApplyGenres() { return { ok: true }; },
		}));
		await afterCommittedEffects();
	});
	try {
		const dialog = document.querySelector('[data-creation-option="genres"]');
		const zero = genreSummaryState(dialog, 0);
		for (const name of GENRE_SUMMARY_TEST_NAMES.slice(0, 4)) await clickAndSettle(genreCardByName(dialog, name));
		const four = genreSummaryState(dialog, 4);
		const disclosure = dialog.querySelector(".genre-hierarchy-selected-tray .removable-selection-disclosure");
		await clickAndSettle(disclosure.querySelector("summary"));
		const opened = disclosure.open && disclosure.querySelectorAll('[aria-label^="Remove "]').length === 4;
		await clickAndSettle(disclosure.querySelector("summary"));
		return {
			width: window.innerWidth,
			scope: dialog.dataset.creationScope ?? null,
			stage: dialog.querySelector(".genre-hierarchy-form")?.dataset.genreHierarchyStage ?? null,
			zero,
			four,
			opened,
			closed: !disclosure.open,
			oneScrollOwner: dialog.querySelectorAll(".add-source-scroll").length === 1,
		};
	} finally {
		await act(async () => root.unmount());
		host.remove();
	}
}

async function runGenreStatusScenario() {
	const controller = createController();
	const imported = controller.importValue([{
		id: "genres",
		title: "Genres",
		folders: [
			{ id: "destination", title: "Destination", sources: [genreSource()] },
			{ id: "elsewhere", title: "Elsewhere", sources: [genreSource({ title: "Comedy Series", mediaType: "TV" })] },
		],
	}]);
	if (!imported.ok) throw new Error("Mounted Genre status fixture import failed.");
	const folder = controller.getState().project.collections[0].folders[0];
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	await act(async () => {
		root.render(createElement(GenreSourceFlow, { project: controller.getState().project, folder, onBack() {}, onCancel() {}, onApply() { return { ok: true }; } }));
		await afterCommittedEffects();
	});
	try {
		await clickAndSettle(document.querySelector('[data-genre-name="Comedy"]'));
		await clickAndSettle(document.querySelector('[data-genre-name="Horror"]'));
		await clickAndSettle(document.querySelector(".genre-source-dialog .add-source-actions .editor-apply"));
		const rows = [...document.querySelectorAll(".genre-review-list li")];
		const destinationRow = rows.find((row) => row.textContent.includes("Already in this folder"));
		const elsewhereRow = rows.find((row) => row.textContent.includes("Exists elsewhere"));
		const readyRow = rows.find((row) => row.textContent.includes("Ready to add"));
		const destinationStyle = getComputedStyle(destinationRow);
		const elsewhereStyle = getComputedStyle(elsewhereRow);
		const readyStyle = getComputedStyle(readyRow);
		const notice = document.querySelector(".source-elsewhere-note");
		return {
			statuses: rows.map((row) => row.querySelector(":scope > span")?.textContent ?? ""),
			rowsNeutral: destinationStyle.backgroundColor === readyStyle.backgroundColor
				&& destinationStyle.borderColor === readyStyle.borderColor
				&& elsewhereStyle.backgroundColor === readyStyle.backgroundColor
				&& elsewhereStyle.borderColor === readyStyle.borderColor,
			noAttentionAttribute: rows.every((row) => !row.hasAttribute("data-attention")),
			noticeUsesSharedTreatment: notice?.classList.contains("studio-elsewhere-note") ?? false,
			noticeHeading: notice?.querySelector("strong")?.textContent ?? null,
			noticeAction: notice?.querySelector(".studio-elsewhere-action")?.textContent ?? null,
		};
	} finally {
		await act(async () => root.unmount());
		host.remove();
	}
}

async function runGenreOverrideLabelsScenario() {
	const controller = createController();
	const folder = importSources(controller, [genreSource(), genreSource({ title: "Comedy Series", mediaType: "TV" })]);
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	await act(async () => {
		root.render(createElement(GenreSourceFlow, { project: controller.getState().project, folder, onBack() {}, onCancel() {}, onApply() { return { ok: true }; } }));
		await afterCommittedEffects();
	});
	try {
		await clickAndSettle(document.querySelector('[data-genre-name="Comedy"]'));
		await clickAndSettle(document.querySelector(".genre-source-dialog .add-source-actions .editor-apply"));
		const bundleOverride = document.querySelector('[data-action="add-all-genres-anyway"]')?.textContent ?? null;
		const bundleNoNew = document.querySelector(".genre-review-actions .editor-apply")?.textContent ?? null;
		await clickAndSettle(document.querySelector('.genre-shared-media input[value="movies"]'));
		return {
			bundleOverride,
			bundleNoNew,
			singleOverride: document.querySelector('[data-action="add-all-genres-anyway"]')?.textContent ?? null,
			singleNoNew: document.querySelector(".genre-review-actions .editor-apply")?.textContent ?? null,
		};
	} finally {
		await act(async () => root.unmount());
		host.remove();
	}
}

function MountedWorkspace({ controller }) {
	const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
	return createElement(BuilderWorkspace, {
		controller,
		state,
		sourceProvider: {},
		peopleProvider: {},
		networkCatalogueProvider: {},
		networkCountProvider: {},
		studioCatalogueProvider: {},
		studioCountProvider: {},
		studioPreviewProvider: {},
		studioArtworkRuntimeClient: {},
		streamingCatalogueProvider: {},
		peopleManifestClient: { peek() { return null; }, async load() { return { ok: false, error: { message: "Mounted manifest unavailable." } }; } },
		artworkClient: {},
	});
}

// Imported Source-card presentation only; no external catalogue or Preview is exercised.
async function prepareSourceDetailsScenario() {
	const controller = createController();
	const native = (title, tmdbSourceType, tmdbId, mediaType, sortBy, filters = {}) => ({ title, provider: "tmdb", tmdbSourceType, tmdbId, mediaType, sortBy, filters });
	controller.importValue([{ id: "details", title: "Source details review", folders: [{ id: "details-folder", title: "Representative sources", sources: [
		native("My favourites", "PERSON", 31, "MOVIE", "popularity.desc"),
		native("Eighties", "DISCOVER", null, "TV", "popularity.desc", { releaseDateGte: "1980-01-01", releaseDateLte: "1989-12-31", withGenres: "35" }),
		native("", "LIST", 1001, "MOVIE", "original"),
		native("\u200e", "LIST", 123, "MOVIE", "added.desc"),
		{ provider: "addon", title: "Catalog picks", addonId: "movie", type: "movie", catalogId: "catalog", genre: "movie" },
		{ provider: "addon", title: "Long identifiers", addonId: "example.long." + "identifier".repeat(7), type: "series", catalogId: "trending-series-" + "catalog".repeat(7), genre: "Drama" },
		{ provider: "addon", title: "AIO picks", addonId: "aio-metadata", type: "movie", catalogId: "trakt.recommendations.movies", genre: "None" },
		{ provider: "trakt", title: "Imported picks", type: "movie", catalogId: "owner-list" },
	] }] }]);
	controller.selectNode(controller.getState().project.collections[0].folders[0].internalId);
	const before = JSON.stringify(controller.getState());
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	await act(async () => { root.render(createElement(MountedWorkspace, { controller })); await afterCommittedEffects(); });
	window.__finishSourceDetailsScenario = async () => { await act(async () => root.unmount()); host.remove(); };
	const buttons = [...host.querySelectorAll('button[data-node-type="source"]')];
	return {
		width: window.innerWidth,
		unchanged: JSON.stringify(controller.getState()) === before,
		documentOverflow: document.documentElement.scrollWidth > window.innerWidth,
		cards: buttons.map((button) => {
			const meta = button.querySelector(".node-meta");
			const css = getComputedStyle(button);
			const metaCss = getComputedStyle(meta);
			return {
				title: button.querySelector(".node-title").textContent,
				values: [...meta.children].map((entry) => entry.textContent),
				overflow: button.scrollWidth > button.clientWidth + 1 || meta.scrollWidth > meta.clientWidth + 1,
				minHeight: css.minHeight, paddingTop: css.paddingTop, paddingBottom: css.paddingBottom,
				wrap: metaCss.flexWrap, clamp: metaCss.webkitLineClamp,
				description: button.getAttribute("aria-describedby") ? document.getElementById(button.getAttribute("aria-describedby"))?.textContent : null,
			};
		}),
	};
}
window.__prepareSourceDetailsScenario = prepareSourceDetailsScenario;

// Local import/editor behavior only. Record and forward any unexpected fetch; never synthesize a response.
async function runDesktopRoundTripScenario() {
	const controller = createController();
	const folder = importSources(controller, roundTripSourceCases.map(({ source }) => desktopExpandedSource(source)));
	controller.selectNode(folder.internalId);
	const project = controller.getState().project;
	const before = serializedValue(controller);
	const requests = [];
	const originalFetch = window.fetch;
	window.fetch = (...args) => { requests.push(String(args[0])); return originalFetch(...args); };
	const consoleErrors = [];
	const originalConsoleError = console.error;
	console.error = (...args) => { consoleErrors.push(args.map(String).join(" ")); originalConsoleError(...args); };
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	const cases = [];
	try {
		await act(async () => { root.render(createElement(MountedWorkspace, { controller })); await afterCommittedEffects(); });
		for (const [index, entry] of roundTripSourceCases.entries()) {
			const result = { name: entry.name, expectedAdapter: entry.editorId };
			for (const action of ["cancel", "save"]) {
				const trigger = host.querySelectorAll('[data-action="open-source-actions"]')[index];
				await act(async () => { trigger.scrollIntoView({ block: "center" }); await afterCommittedEffects(); });
				await clickAndSettle(trigger);
				const edit = document.querySelector('[data-actions-menu="source"]:not([hidden]) [data-action="edit-source"]');
				if (!edit) throw new Error(`${entry.name} has no Edit source action`);
				result.editBeforeDelete = edit.nextElementSibling?.dataset.action === "delete-source";
				await clickAndSettle(edit);
				const dialog = document.querySelector('[data-source-edit-modal="true"]');
				if (!dialog) throw new Error(`${entry.name} editor did not open`);
				result.adapter = dialog.dataset.sourceEditAdapter;
				result.noNullControls = [...dialog.querySelectorAll("input, select, textarea")].every((input) => input.value !== "null");
				result.emptyNumericControls = [...dialog.querySelectorAll('input[type="number"]')].every((input) => input.value === "");
				result.noOverflow = dialog.scrollWidth <= dialog.clientWidth + 1 && document.documentElement.scrollWidth <= window.innerWidth;
				await clickAndSettle(dialog.querySelector(`[data-action="${action}-source-edit"]`));
				result[`${action}Closed`] = document.querySelector('[data-source-edit-modal="true"]') === null;
				result[`${action}Unchanged`] = controller.getState().project === project && serializedValue(controller) === before;
			}
			cases.push(result);
		}
		const exported = createCollectionExportPayload(controller)();
		return { width: window.innerWidth, cases, requests, consoleErrors, exportOk: exported.ok, exportWarnings: exported.warnings.length, exportUnchanged: JSON.stringify(exported.collections) === before, unchanged: controller.getState().project === project };
	} finally {
		await act(async () => root.unmount());
		host.remove();
		window.fetch = originalFetch;
		console.error = originalConsoleError;
	}
}
window.__runDesktopRoundTripScenario = runDesktopRoundTripScenario;

async function runBlankCreationScenario() {
	const controller = createController();
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	const originalMatchMedia = window.matchMedia.bind(window);
	window.matchMedia = (query) => query.includes("min-width: 900px")
		? { matches: true, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }
		: originalMatchMedia(query);
	await act(async () => {
		root.render(createElement(MountedWorkspace, { controller }));
		await afterCommittedEffects();
	});
	try {
		const initialRevision = controller.getState().revision;
		const createCollection = host.querySelector('[data-action="create-collection"]');
		if (createCollection === null) throw new Error(`Mounted Blank workspace did not render Create collection: ${host.innerHTML.slice(0, 500)}`);
		await clickAndSettle(createCollection);
		const peopleCollectionOption = document.querySelector('[data-creation-option="people"]');
		if (peopleCollectionOption === null) throw new Error("Mounted New Collection did not expose People.");
		await clickAndSettle(peopleCollectionOption);
		const collectionPeopleHeading = document.querySelector("#people-mode-title");
		const collectionPeopleQuery = document.querySelector("#people-source-query");
		await afterCommittedEffects();
		const collectionInitialFocus = document.activeElement === collectionPeopleHeading && document.activeElement !== collectionPeopleQuery;
		collectionPeopleQuery.focus({ preventScroll: true });
		const collectionExplicitSearchFocus = document.activeElement === collectionPeopleQuery;
		await clickAndSettle(document.querySelector('[data-action="back-to-creation-launcher"]'));
		const collectionBackFocus = document.activeElement === document.querySelector('[data-creation-option="blank"]');
		await clickAndSettle(document.querySelector('[data-creation-option="people"]'));
		await afterCommittedEffects();
		const collectionReentryFocus = document.activeElement === document.querySelector("#people-mode-title");
		await clickAndSettle(document.querySelector('[data-creation-dialog="true"] .add-source-close-action'));
		const collectionCancelFocus = document.activeElement === createCollection;
		const collectionFocusRevisionUnchanged = controller.getState().revision === initialRevision;

		await clickAndSettle(createCollection);
		const blankCollection = document.querySelector('[data-creation-option="blank"]');
		if (blankCollection === null) throw new Error(`Mounted Blank collection launcher did not open: ${document.body.innerHTML.slice(-700)}`);
		await clickAndSettle(blankCollection);
		const afterCollection = controller.getState();
		const collection = afterCollection.project.collections[0];
		const newFolder = document.querySelector('[data-action="create-folder"]');
		const collectionResult = {
			dialogClosed: document.querySelector('[data-creation-dialog="true"]') === null,
			revisionDelta: afterCollection.revision - initialRevision,
			selected: afterCollection.selection.collectionInternalId === collection.internalId,
			defaults: collection.editable,
			newFolderEnabled: newFolder !== null && !newFolder.disabled,
		};
		if (newFolder === null) throw new Error(`Mounted Blank collection did not expose New folder: ${host.innerHTML.slice(0, 700)}`);
		await clickAndSettle(newFolder);
		const blankFolder = document.querySelector('[data-creation-option="blank"]');
		if (blankFolder === null) throw new Error(`Mounted Blank folder launcher did not open: ${document.body.innerHTML.slice(-700)}`);
		await clickAndSettle(blankFolder);
		const afterFolder = controller.getState();
		const folder = afterFolder.project.collections[0].folders[0];
		const addSource = document.querySelector('[data-action="add-source"]');
		const backToFolderPanel = document.querySelector('.sources-panel .back-control');
		if (backToFolderPanel === null) throw new Error("Mounted workspace did not expose the mobile folder-panel return control.");
		await clickAndSettle(backToFolderPanel);
		const canonicalNewFolder = document.querySelector('[data-action="create-folder"]');
		if (canonicalNewFolder === null) throw new Error("Mounted workspace did not retain canonical New folder.");
		const legacyPeopleLauncherAbsent = document.querySelector('[data-action="add-people"]') === null;
		await clickAndSettle(canonicalNewFolder);
		const peopleFolderOption = document.querySelector('[data-creation-option="people"]');
		if (peopleFolderOption === null) throw new Error("Mounted New Folder did not expose People.");
		await clickAndSettle(peopleFolderOption);
		const folderPeopleHeading = document.querySelector("#people-mode-title");
		const folderPeopleQuery = document.querySelector("#people-source-query");
		await afterCommittedEffects();
		const folderInitialFocus = document.activeElement === folderPeopleHeading && document.activeElement !== folderPeopleQuery;
		folderPeopleQuery.focus({ preventScroll: true });
		const folderExplicitSearchFocus = document.activeElement === folderPeopleQuery;
		await clickAndSettle(document.querySelector('[data-action="back-to-creation-launcher"]'));
		const folderBackFocus = document.activeElement === document.querySelector('[data-creation-option="blank"]');
		await clickAndSettle(document.querySelector('[data-creation-option="people"]'));
		await afterCommittedEffects();
		const folderReentryFocus = document.activeElement === document.querySelector("#people-mode-title");
		await clickAndSettle(document.querySelector('[data-creation-dialog="true"] .add-source-close-action'));
		const currentCanonicalNewFolder = document.querySelector('[data-action="create-folder"]');
		const folderCancelFocus = document.activeElement === currentCanonicalNewFolder;
		const folderFocusRevisionUnchanged = controller.getState().revision === afterFolder.revision;
		return {
			peopleFocus: {
				newCollection: {
					initialBrowseHeading: collectionInitialFocus,
					explicitSearch: collectionExplicitSearchFocus,
					backToLauncher: collectionBackFocus,
					reentryBrowseHeading: collectionReentryFocus,
					cancelRestoredCanonicalTrigger: collectionCancelFocus,
					revisionUnchanged: collectionFocusRevisionUnchanged,
				},
				newFolder: {
					legacyLauncherAbsent: legacyPeopleLauncherAbsent,
					initialBrowseHeading: folderInitialFocus,
					explicitSearch: folderExplicitSearchFocus,
					backToLauncher: folderBackFocus,
					reentryBrowseHeading: folderReentryFocus,
					cancelRestoredCanonicalTrigger: folderCancelFocus,
					revisionUnchanged: folderFocusRevisionUnchanged,
				},
			},
			collection: collectionResult,
			folder: {
				dialogClosed: document.querySelector('[data-creation-dialog="true"]') === null,
				revisionDelta: afterFolder.revision - afterCollection.revision,
				selected: afterFolder.selection.folderInternalId === folder.internalId,
				parentPreserved: afterFolder.selection.collectionInternalId === collection.internalId,
				defaults: folder.editable,
				addSourceEnabled: addSource !== null && !addSource.disabled,
			},
		};
	} finally {
		await act(async () => root.unmount());
		window.matchMedia = originalMatchMedia;
		host.remove();
	}
}

function mountedPerson({ id, name, department, membership, actingMovies, actingSeries, directingMovies, directingSeries }) {
	const cast = [
		...Array.from({ length: actingMovies }, (_, index) => ({
			id: id * 1000 + index + 1,
			mediaType: "movie",
			posterPath: `/person-${id}-movie-${index}.jpg`,
			popularity: 100 - index,
			voteAverage: 7 + (index % 3) / 10,
			voteCount: 1000 - index,
			releaseDate: `${2025 - index}-01-01`,
		})),
		...Array.from({ length: actingSeries }, (_, index) => ({
			id: id * 2000 + index + 1,
			mediaType: "tv",
			posterPath: `/person-${id}-series-${index}.jpg`,
			popularity: 80 - index,
			voteAverage: 6 + (index % 3) / 10,
			voteCount: 500 - index,
			releaseDate: `${2024 - index}-01-01`,
		})),
	];
	const crew = [
		...Array.from({ length: directingMovies }, (_, index) => ({
			id: id * 3000 + index + 1,
			mediaType: "movie",
			job: "Director",
			posterPath: `/person-${id}-directed-movie-${index}.jpg`,
			popularity: 60 - index,
			voteAverage: 8 + (index % 2) / 10,
			voteCount: 300 - index,
			releaseDate: `${2023 - index}-01-01`,
		})),
		...Array.from({ length: directingSeries }, (_, index) => ({
			id: id * 4000 + index + 1,
			mediaType: "tv",
			job: "Director",
			posterPath: `/person-${id}-directed-series-${index}.jpg`,
			popularity: 40 - index,
			voteAverage: 8,
			voteCount: 200 - index,
			releaseDate: `${2022 - index}-01-01`,
		})),
	];
	return {
		id,
		name,
		knownForDepartment: department,
		categoryMembership: membership,
		profilePath: `/person-${id}.jpg`,
		knownFor: [],
		counts: { actingMovies, actingSeries, directingMovies, directingSeries },
		combinedCredits: { cast, crew },
	};
}

async function runPeopleSelectionScrollScenario() {
	const searchResults = Array.from({ length: 12 }, (_, index) => mountedPerson({
		id: 2000 + index,
		name: `Scroll Person ${index + 1}`,
		department: "Acting",
		membership: ["actor"],
		actingMovies: 10 + index,
		actingSeries: 2,
		directingMovies: 0,
		directingSeries: 0,
	}));
	const people = new Map(searchResults.map((person) => [person.id, person]));
	const provider = {
		async searchPeople() {
			return { ok: true, data: { results: searchResults, page: 1, totalPages: 1, totalResults: searchResults.length } };
		},
		async getPerson(id) {
			const person = people.get(Number(id));
			return person ? { ok: true, data: person, checkedAt: 1 } : { ok: false, error: { message: "Missing fixture person.", retryable: false } };
		},
	};
	const manifestClient = { peek() { return null; }, async load() { return { ok: false, error: { message: "Fixture manifest unavailable." } }; } };
	const controller = createController();
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	await act(async () => {
		root.render(createElement(CreationDialog, {
			scope: "new-collection",
			project: controller.getState().project,
			projectRevision: controller.getState().revision,
			currentYear: 2026,
			initialOptionId: "people",
			peopleProvider: provider,
			peopleManifestClient: manifestClient,
			onCancel() {},
			onCreateBlank() {},
			onApplyDecades() { return { ok: true }; },
			onApplyPeople() { return { ok: true }; },
		}));
		await afterCommittedEffects();
	});

	function required(element, label) {
		if (element === null || element === undefined) throw new Error(`Mounted People scroll ${label} is missing.`);
		return element;
	}
	function capture(dialog, scrollElement, action, card = null, input = null) {
		const dialogRect = dialog.getBoundingClientRect();
		const actionRect = action.getBoundingClientRect();
		const cardRect = card?.getBoundingClientRect() ?? null;
		const inputRect = input?.getBoundingClientRect() ?? null;
		return {
			dialogTop: dialogRect.top,
			dialogBottom: dialogRect.bottom,
			dialogScrollTop: dialog.scrollTop,
			documentScrollX: window.scrollX,
			documentScrollY: window.scrollY,
			innerScrollTop: scrollElement.scrollTop,
			actionTop: actionRect.top,
			actionBottom: actionRect.bottom,
			cardTop: cardRect?.top ?? null,
			cardBottom: cardRect?.bottom ?? null,
			inputTop: inputRect?.top ?? null,
			inputBottom: inputRect?.bottom ?? null,
			inputInsideCard: Boolean(cardRect && inputRect && inputRect.top >= cardRect.top - 1 && inputRect.bottom <= cardRect.bottom + 1),
		};
	}
	async function partiallyClip(scrollElement, card) {
		const scrollRect = scrollElement.getBoundingClientRect();
		const cardRect = card.getBoundingClientRect();
		const visibleHeight = Math.min(42, cardRect.height / 3);
		scrollElement.scrollTop += cardRect.top - (scrollRect.bottom - visibleHeight);
		await afterCommittedEffects();
		const clippedRect = card.getBoundingClientRect();
		return clippedRect.top < scrollRect.bottom - 1 && clippedRect.bottom > scrollRect.bottom + 1;
	}
	function stableOuter(before, after) {
		return Math.abs(before.dialogTop - after.dialogTop) <= 1
			&& Math.abs(before.dialogBottom - after.dialogBottom) <= 1
			&& before.dialogScrollTop === after.dialogScrollTop;
	}
	function stableDocument(before, after) {
		return before.documentScrollX === after.documentScrollX && before.documentScrollY === after.documentScrollY;
	}

	try {
		const query = required(document.querySelector("#people-source-query"), "query");
		const browseHeading = required(document.querySelector("#people-mode-title"), "browse heading");
		await afterCommittedEffects();
		const initialFocus = {
			browseHeadingFocused: document.activeElement === browseHeading,
			searchFocused: document.activeElement === query,
			autoFocusAttributeAbsent: query.autofocus === false && !query.hasAttribute("autofocus"),
			keyboardTargetAbsent: document.activeElement?.tagName !== "INPUT",
		};
		await act(async () => {
			query.focus({ preventScroll: true });
			await afterCommittedEffects();
		});
		const explicitSearchFocused = document.activeElement === query;
		await act(async () => {
			setInputValue(query, "scroll people");
			await new Promise((resolve) => setTimeout(resolve, 360));
			await afterCommittedEffects();
		});
		const dialog = required(document.querySelector('[data-creation-dialog="true"]'), "outer dialog");
		const scrollElement = required(dialog.querySelector(".add-source-scroll"), "inner result scroll owner");
		const action = required(dialog.querySelector(".add-source-actions .editor-apply"), "sticky Configure action");
		const cards = [...dialog.querySelectorAll(".people-result-selectable")];
		if (cards.length !== searchResults.length) throw new Error(`Mounted People scroll expected ${searchResults.length} results, received ${cards.length}.`);

		const pointerCard = cards[5];
		const pointerInput = required(pointerCard.querySelector('input[type="checkbox"]'), "pointer checkbox");
		const pointerPartiallyClipped = await partiallyClip(scrollElement, pointerCard);
		const pointerBefore = capture(dialog, scrollElement, action, pointerCard, pointerInput);
		await clickAndSettle(pointerCard);
		const pointerAfter = capture(dialog, scrollElement, action, pointerCard, pointerInput);

		const disclosure = required(dialog.querySelector(".people-selected-tray details"), "selected disclosure");
		const summary = required(disclosure.querySelector("summary"), "selected disclosure summary");
		const disclosureBefore = capture(dialog, scrollElement, action);
		await clickAndSettle(summary);
		const disclosureOpen = disclosure.open;
		await clickAndSettle(summary);
		const disclosureAfter = capture(dialog, scrollElement, action);

		const keyboardCard = cards[7];
		const keyboardInput = required(keyboardCard.querySelector('input[type="checkbox"]'), "keyboard checkbox");
		const keyboardPartiallyClipped = await partiallyClip(scrollElement, keyboardCard);
		const keyboardBefore = capture(dialog, scrollElement, action, keyboardCard, keyboardInput);
		await act(async () => {
			keyboardInput.focus();
			await afterCommittedEffects();
		});
		const keyboardFocused = capture(dialog, scrollElement, action, keyboardCard, keyboardInput);
		const keyboardActive = document.activeElement === keyboardInput;
		const keyboardFocusOwnedByCard = keyboardActive
			&& keyboardInput.parentElement === keyboardCard;
		await clickAndSettle(keyboardInput);
		const keyboardAfterToggle = capture(dialog, scrollElement, action, keyboardCard, keyboardInput);

		await clickAndSettle(summary);
		const removePointer = required(dialog.querySelector(`[aria-label="Remove ${searchResults[5].name}"]`), "remove selected person action");
		const removalBefore = capture(dialog, scrollElement, action);
		await clickAndSettle(removePointer);
		const removalAfter = capture(dialog, scrollElement, action);
		await clickAndSettle(pointerCard);
		const reselectionAfter = capture(dialog, scrollElement, action);
		const selectedOrder = [...dialog.querySelectorAll('.people-selected-tray [aria-label^="Remove "]')].map((button) => button.getAttribute("aria-label").replace(/^Remove /, ""));

		return {
			width: window.innerWidth,
			focus: { ...initialFocus, explicitSearchFocused },
			resultCount: cards.length,
			pointer: {
				partiallyClipped: pointerPartiallyClipped,
				inputInsideCardBeforeFocus: pointerBefore.inputInsideCard,
				selectedExactlyOnce: pointerInput.checked === true,
				cardSelected: pointerCard.classList.contains("is-selected"),
				markerAbsent: pointerCard.querySelector('[data-selection-indicator], .selectable-card-indicator') === null,
				outerStable: stableOuter(pointerBefore, pointerAfter),
				documentStable: stableDocument(pointerBefore, pointerAfter),
				innerScrollDelta: pointerAfter.innerScrollTop - pointerBefore.innerScrollTop,
				actionStable: Math.abs(pointerBefore.actionTop - pointerAfter.actionTop) <= 1 && Math.abs(pointerBefore.actionBottom - pointerAfter.actionBottom) <= 1,
			},
			keyboard: {
				partiallyClipped: keyboardPartiallyClipped,
				inputInsideCardBeforeFocus: keyboardBefore.inputInsideCard,
				focused: keyboardActive,
				focusOwnedByCard: keyboardFocusOwnedByCard,
				outerStable: stableOuter(keyboardBefore, keyboardFocused) && stableOuter(keyboardFocused, keyboardAfterToggle),
				documentStable: stableDocument(keyboardBefore, keyboardFocused) && stableDocument(keyboardFocused, keyboardAfterToggle),
				innerScrolledToKeepFocusVisible: keyboardFocused.innerScrollTop > keyboardBefore.innerScrollTop,
				selectedExactlyOnce: keyboardInput.checked === true,
				cardSelected: keyboardCard.classList.contains("is-selected"),
				markerAbsent: keyboardCard.querySelector('[data-selection-indicator], .selectable-card-indicator') === null,
				actionStable: Math.abs(keyboardBefore.actionTop - keyboardFocused.actionTop) <= 1 && Math.abs(keyboardBefore.actionBottom - keyboardFocused.actionBottom) <= 1,
				spaceActivationDeferredToOwner: true,
			},
			disclosure: {
				opened: disclosureOpen,
				outerStable: stableOuter(disclosureBefore, disclosureAfter),
				documentStable: stableDocument(disclosureBefore, disclosureAfter),
				actionStable: Math.abs(disclosureBefore.actionTop - disclosureAfter.actionTop) <= 1 && Math.abs(disclosureBefore.actionBottom - disclosureAfter.actionBottom) <= 1,
			},
			removalReselection: {
				outerStable: stableOuter(removalBefore, removalAfter) && stableOuter(removalAfter, reselectionAfter),
				documentStable: stableDocument(removalBefore, removalAfter) && stableDocument(removalAfter, reselectionAfter),
				selectedOrder,
			},
			outerDialogScrollTop: dialog.scrollTop,
			noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth && dialog.scrollWidth <= dialog.clientWidth,
		};
	} finally {
		await act(async () => {
			root.unmount();
			await afterCommittedEffects();
		});
		host.remove();
	}
}

function measureHierarchyShowAllSpacing(root) {
	const controls = root.querySelector(".hierarchy-collection-presentation-controls");
	const choices = controls?.querySelector(":scope > .editor-choice-grid");
	const showAll = controls?.querySelector(":scope > .hierarchy-show-all-control");
	if (!controls || !choices || !showAll) return null;
	const choicesRect = choices.getBoundingClientRect();
	const showAllRect = showAll.getBoundingClientRect();
	return {
		separateSiblings: choices.parentElement === controls && showAll.parentElement === controls,
		cssGap: Number.parseFloat(getComputedStyle(controls).rowGap),
		actualGap: Number((showAllRect.top - choicesRect.bottom).toFixed(2)),
		noOverlap: showAllRect.top >= choicesRect.bottom,
	};
}

async function runFranchiseReviewScenario() {
	const franchiseIds = [645, 1241];
	const requests = [];
	const provider = createTmdbCollectionProvider({ fetchImpl: recordingFetch(requests) });
	const controller = createController();
	importSources(controller, [collectionSource({ title: "Existing franchise source", tmdbId: franchiseIds[0] })]);
	const initialProject = controller.getState().project;
	const initialRevision = controller.getState().revision;
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	await act(async () => {
		root.render(createElement(CreationDialog, {
			scope: "new-collection",
			project: initialProject,
			projectRevision: initialRevision,
			currentYear: 2026,
			initialOptionId: "franchises",
			collectionProvider: provider,
			onCancel() {},
			onCreateBlank() {},
			onApplyDecades() { return { ok: true }; },
			onApplyPeople() { return { ok: true }; },
			onApplyFranchises() { return { ok: true }; },
		}));
		await afterCommittedEffects();
	});
	function required(element, label) {
		if (element === null || element === undefined) throw new Error(`Mounted Franchise ${label} is missing.`);
		return element;
	}
	const expectedPosterCount = 10;
	const selectedNames = new Map();
	async function selectExactCollection(dialog, query, id, expectedSelectionCount) {
		await act(async () => {
			setInputValue(query, String(id));
			await afterCommittedEffects();
		});
		const card = await waitForMountedCondition(
			() => dialog.querySelector(`[data-tmdb-franchise-result="${id}"]`),
			{ label: `Live TMDB Collection ${id} result`, timeoutMs: 15_000 },
		);
		selectedNames.set(id, card.querySelector("strong")?.textContent.trim() ?? "");
		await clickAndSettle(card);
		await waitForMountedCondition(
			() => dialog.querySelectorAll(".franchise-selected-disclosure li").length === expectedSelectionCount,
			{ label: `Live TMDB Collection ${id} selection`, timeoutMs: 15_000 },
		);
		return card;
	}
	function outerPosition(dialog, scrollElement) {
		const rect = dialog.getBoundingClientRect();
		return { top: rect.top, bottom: rect.bottom, dialogScrollTop: dialog.scrollTop, innerScrollTop: scrollElement.scrollTop, x: window.scrollX, y: window.scrollY };
	}
	function positionStable(before, after) {
		return Math.abs(before.top - after.top) <= 1 && Math.abs(before.bottom - after.bottom) <= 1 && before.dialogScrollTop === after.dialogScrollTop && before.innerScrollTop === after.innerScrollTop && before.x === after.x && before.y === after.y;
	}
	function previewLayerState() {
		const preview = required(document.querySelector(".franchise-preview-modal"), "Preview titles modal");
		const backdrop = required(preview.closest(".nested-modal-backdrop"), "shared nested backdrop");
		const creationPortal = required(document.querySelector(".add-source-portal"), "creation portal");
		return {
			preview,
			backdrop,
			aboveCreationModal: Number.parseInt(getComputedStyle(backdrop).zIndex, 10) > Number.parseInt(getComputedStyle(creationPortal).zIndex, 10),
			sharedNestedLayer: backdrop.dataset.nestedModalBackdrop === "true",
			modalSurface: preview.getAttribute("role") === "dialog" && preview.getAttribute("aria-modal") === "true",
			noHorizontalOverflow: preview.scrollWidth <= preview.clientWidth && document.documentElement.scrollWidth <= window.innerWidth,
		};
	}
	try {
		const dialog = required(document.querySelector('[data-creation-dialog="true"]'), "creation dialog");
		const scrollElement = required(dialog.querySelector(".add-source-scroll"), "inner scroll owner");
		const query = required(dialog.querySelector("#franchise-source-query"), "search query");
		await selectExactCollection(dialog, query, franchiseIds[0], 1);
		await selectExactCollection(dialog, query, franchiseIds[1], 2);
		let disclosure = required(dialog.querySelector(".franchise-selected-disclosure"), "selected disclosure");
		await clickAndSettle(required(disclosure.querySelector("summary"), "selected disclosure summary"));
		let selectedRows = [...disclosure.querySelectorAll("li")];
		const longRow = selectedRows[0];
		const longRowRect = longRow.getBoundingClientRect();
		const actionGroup = required(longRow.querySelector(".franchise-selected-actions"), "compact actions");
		const previewTrigger = required(actionGroup.querySelector(".franchise-selected-preview"), "Select Preview action");
		const removeAction = required(actionGroup.querySelector(".franchise-selected-remove"), "Select remove action");
		const previewRect = previewTrigger.getBoundingClientRect();
		const removeRect = removeAction.getBoundingClientRect();
		const selectedActions = {
			visiblePreviewLabel: previewTrigger.textContent.trim(),
			previewAccessibleLabel: previewTrigger.getAttribute("aria-label"),
			removeAccessibleLabel: removeAction.getAttribute("aria-label"),
			previewTouchSafe: previewRect.height >= 40,
			removeTouchSafe: removeRect.width >= 40 && removeRect.height >= 40,
			adequateGap: Number.parseFloat(getComputedStyle(actionGroup).gap) >= 8,
			longRowFits: longRow.scrollWidth <= longRow.clientWidth + 1 && previewRect.right <= longRowRect.right + 1 && removeRect.right <= longRowRect.right + 1,
		};

		const selectBefore = outerPosition(dialog, scrollElement);
		await clickAndSettle(previewTrigger);
		const selectLayer = previewLayerState();
		const selectReadyPosters = await waitForReadyPosterGrid({
			preview: selectLayer.preview,
			gridSelector: ".franchise-preview-grid",
			expectedVisibleCount: expectedPosterCount,
			label: `Live Franchise Select Preview at ${window.innerWidth}px`,
		});
		const selectClose = required(selectLayer.preview.querySelector("header button"), "Select preview Close action");
		const selectFocusEntered = document.activeElement === selectClose;
		await act(async () => {
			selectClose.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
			await afterCommittedEffects();
		});
		const selectFocusContained = selectLayer.preview.contains(document.activeElement);
		const selectOpenPosition = outerPosition(dialog, scrollElement);
		const selectPosterState = {
			posterCount: selectReadyPosters.visibleImages.length,
			postersReady: selectReadyPosters.visibleImages.every((image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0 && visibleElement(image)),
			genuineTmdbSources: genuineTmdbPosterImages(selectReadyPosters.visibleImages),
			geometry: titlePreviewGeometry(selectLayer.preview, selectReadyPosters.grid),
			posterOnly: [...selectLayer.preview.querySelectorAll(".franchise-preview-grid > *")].every((item) => item.tagName === "IMG"),
			captionsAbsent: selectLayer.preview.querySelector(".franchise-preview-grid figcaption, .franchise-preview-grid article, .franchise-preview-grid small") === null,
			missingCardsAbsent: !selectLayer.preview.textContent.includes("No poster"),
		};
		await act(async () => {
			document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
			await afterCommittedEffects();
		});
		const selectPreview = {
			...selectLayer,
			preview: undefined,
			backdrop: undefined,
			focusEntered: selectFocusEntered,
			focusContained: selectFocusContained,
			escapeClosed: document.querySelector(".franchise-preview-modal") === null,
			exactFocusRestored: document.activeElement === previewTrigger,
			outerStable: positionStable(selectBefore, selectOpenPosition) && positionStable(selectBefore, outerPosition(dialog, scrollElement)),
			selectionPreserved: dialog.querySelectorAll(".franchise-selected-disclosure li").length === 2,
			...selectPosterState,
		};

		disclosure = required(dialog.querySelector(".franchise-selected-disclosure"), "selected disclosure after preview");
		await clickAndSettle(required(disclosure.querySelector("li .franchise-selected-remove"), "remove first franchise"));
		const removalWorked = dialog.querySelectorAll(".franchise-selected-disclosure li").length === 1;
		await selectExactCollection(dialog, query, franchiseIds[0], 2);
		disclosure = required(dialog.querySelector(".franchise-selected-disclosure"), "selected disclosure after reselection");
		if (!disclosure.open) await clickAndSettle(required(disclosure.querySelector("summary"), "reopened selected disclosure"));
		selectedRows = [...disclosure.querySelectorAll("li")];
		const selectedOrder = selectedRows.map((row) => row.querySelector("strong")?.textContent ?? "");
		const reselectionOrderPreserved = JSON.stringify(selectedOrder) === JSON.stringify([
			selectedNames.get(franchiseIds[1]),
			selectedNames.get(franchiseIds[0]),
		]);

		await clickAndSettle(required(buttonContaining(dialog, "Review 2 franchises"), "Review action"));
		const review = required(dialog.querySelector(".franchise-review"), "Review surface");
		const showAll = required(review.querySelector('[data-editor-control="franchiseShowAllTab"]'), "Tabs Show All control");
		const tabsInitiallyEnabled = showAll.checked === true;
		const showAllSpacing = measureHierarchyShowAllSpacing(review);
		await clickAndSettle(showAll);
		const rowsChoice = required(review.querySelector('input[name="franchise-collection-layout"][value="ROWS"]'), "Rows choice");
		await clickAndSettle(rowsChoice);
		const rowsHidesShowAll = review.querySelector('[data-editor-control="franchiseShowAllTab"]') === null;
		const tabsChoice = required(review.querySelector('input[name="franchise-collection-layout"][value="TABBED_GRID"]'), "Tabs choice");
		await clickAndSettle(tabsChoice);
		const rowsToTabsRestoresEnabled = review.querySelector('[data-editor-control="franchiseShowAllTab"]')?.checked === true;
		const reviewDetails = required([...review.querySelectorAll(".franchise-review-list details")].find((details) => details.querySelector("small")?.textContent.includes(`TMDB ${franchiseIds[0]} ·`)), "Review franchise detail");
		const reviewSummary = required(reviewDetails.querySelector("summary"), "Review detail summary");
		const reviewPreviewTrigger = required(reviewSummary.querySelector('button[aria-haspopup="dialog"]'), "Review Preview titles action");
		const reviewRowActions = required(reviewSummary.querySelector(".franchise-review-row-actions"), "Review row actions");
		const reviewName = required(reviewSummary.querySelector("strong"), "Review franchise name");
		const reviewSummaryRect = reviewSummary.getBoundingClientRect();
		const reviewActionRect = reviewRowActions.getBoundingClientRect();
		const reviewPreviewRect = reviewPreviewTrigger.getBoundingClientRect();
		const collapsedRow = {
			previewDirectlyVisible: reviewDetails.open === false && reviewPreviewRect.width > 0 && reviewPreviewRect.height >= 40,
			previewInsideSummary: reviewPreviewTrigger.closest("summary") === reviewSummary,
			longNameReadable: getComputedStyle(reviewName).overflowWrap === "anywhere" && reviewName.scrollWidth <= reviewName.clientWidth + 1,
			statusAndPreviewFit: reviewSummary.scrollWidth <= reviewSummary.clientWidth + 1
				&& reviewRowActions.scrollWidth <= reviewRowActions.clientWidth + 1
				&& reviewActionRect.left >= reviewSummaryRect.left - 1
				&& reviewActionRect.right <= reviewSummaryRect.right + 1
				&& reviewPreviewRect.right <= reviewSummaryRect.right + 1,
		};
		const reviewBefore = outerPosition(dialog, scrollElement);
		await clickAndSettle(reviewPreviewTrigger);
		const previewOpenedWithoutExpanding = reviewDetails.open === false;
		const reviewLayer = previewLayerState();
		const reviewReadyPosters = await waitForReadyPosterGrid({
			preview: reviewLayer.preview,
			gridSelector: ".franchise-preview-grid",
			expectedVisibleCount: expectedPosterCount,
			label: `Live Franchise Review Preview at ${window.innerWidth}px`,
		});
		const reviewClose = required(reviewLayer.preview.querySelector("header button"), "Review preview Close action");
		const reviewPosterState = {
			posterCount: reviewReadyPosters.visibleImages.length,
			postersReady: reviewReadyPosters.visibleImages.every((image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0 && visibleElement(image)),
			genuineTmdbSources: genuineTmdbPosterImages(reviewReadyPosters.visibleImages),
			geometry: titlePreviewGeometry(reviewLayer.preview, reviewReadyPosters.grid),
			posterOnly: [...reviewLayer.preview.querySelectorAll(".franchise-preview-grid > *")].every((item) => item.tagName === "IMG"),
			captionsAbsent: reviewLayer.preview.querySelector(".franchise-preview-grid figcaption, .franchise-preview-grid article, .franchise-preview-grid small") === null,
			missingCardsAbsent: !reviewLayer.preview.textContent.includes("No poster"),
		};
		await clickAndSettle(reviewClose);
		const remainedCollapsedAfterPreview = reviewDetails.open === false;
		const reviewPreview = {
			aboveCreationModal: reviewLayer.aboveCreationModal,
			sharedNestedLayer: reviewLayer.sharedNestedLayer,
			modalSurface: reviewLayer.modalSurface,
			noHorizontalOverflow: reviewLayer.noHorizontalOverflow,
			closeClosed: document.querySelector(".franchise-preview-modal") === null,
			exactFocusRestored: document.activeElement === reviewPreviewTrigger,
			outerStable: positionStable(reviewBefore, outerPosition(dialog, scrollElement)),
			previewOpenedWithoutExpanding,
			remainedCollapsedAfterPreview,
			...reviewPosterState,
		};
		await clickAndSettle(reviewSummary);
		const detailDisclosure = {
			independentlyExpandable: reviewDetails.open === true && document.querySelector(".franchise-preview-modal") === null,
			metadataPresent: reviewDetails.querySelector(".franchise-review-details > small")?.textContent.includes(`TMDB ${franchiseIds[0]} · Movie · Collection · TMDB order`) === true,
			duplicateExplanationPresent: reviewDetails.querySelector(".source-elsewhere-note")?.textContent.includes("This franchise source exists elsewhere") === true,
		};
		const createButton = required(buttonContaining(dialog, "Create collection"), "Create action");
		const createRect = createButton.getBoundingClientRect();
		return {
			width: window.innerWidth,
			selectedActions,
			selectPreview,
			reviewPreview,
			selection: { removalWorked, reselectionOrderPreserved },
			liveRequests: {
				collectionDetailsOnly: requests.length === franchiseIds.length
					&& franchiseIds.every((id) => requests.includes(`/3/collection/${id}`)),
			},
			review: {
				artworkGuidance: review.querySelector('[data-franchise-artwork-rule="poster-only"]')?.textContent.trim() ?? "",
				technicalArtworkCopyAbsent: !/\bPOSTER\b/.test(review.querySelector('[data-franchise-artwork-rule="poster-only"]')?.textContent ?? "")
					&& !/(?:tileShape|coverImageUrl|emoji|w\d+|fallback|mechanic)/i.test(review.querySelector('[data-franchise-artwork-rule="poster-only"]')?.textContent ?? ""),
				shapeSelectorAbsent: review.querySelector('input[name="franchise-folder-shape"]') === null && !review.textContent.includes("Folder artwork shape"),
				collapsedRow,
				detailDisclosure,
				tabsInitiallyEnabled,
				rowsHidesShowAll,
				rowsToTabsRestoresEnabled,
				showAllSpacing,
				createReachable: createRect.top >= -1 && createRect.bottom <= window.innerHeight + 1 && createRect.height >= 44,
			},
			oneScrollOwner: dialog.querySelectorAll(".add-source-scroll").length === 1 && dialog.scrollTop === 0,
			noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth && dialog.scrollWidth <= dialog.clientWidth,
			revisionUnchanged: controller.getState().revision === initialRevision && controller.getState().project === initialProject,
		};
	} finally {
		await act(async () => {
			root.unmount();
			await afterCommittedEffects();
		});
		host.remove();
	}
}

function mountedStudio(id, name = `Studio ${id}`) {
	return {
		id,
		name,
		parent: id % 3 === 0 ? "Parent Company" : "",
		country: "US",
		headquarters: "Los Angeles, California",
		location: "US · Los Angeles, California",
		logoPath: `/studio-${id}.png`,
		movieCount: 1000 + id,
	};
}

function studioCatalogueProvider(studios) {
	return {
		async searchStudios(_input, { page = 1 } = {}) {
			return { ok: true, data: { results: studios, page, totalPages: 1, totalResults: studios.length } };
		},
	};
}

async function runStudioHierarchyScenario() {
	const studioIds = [3, 174];
	const requests = [];
	const previewProvider = createTmdbStudioPreviewProvider({ fetchImpl: recordingFetch(requests) });
	let artworkLoads = 0;
	let artworkResolves = 0;
	let artworkLoadSucceeded = false;
	const artworkRuntimeClient = {
		async load() {
			artworkLoads += 1;
			const result = await liveStudioArtworkRuntimeClient.load();
			artworkLoadSucceeded = true;
			return result;
		},
		async resolve(input) { artworkResolves += 1; return liveStudioArtworkRuntimeClient.resolve(input); },
	};
	const controller = createController();
	const initialProject = controller.getState().project;
	const initialRevision = controller.getState().revision;
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	await act(async () => {
		root.render(createElement(CreationDialog, {
			scope: "new-collection",
			project: initialProject,
			projectRevision: initialRevision,
			currentYear: 2026,
			initialOptionId: "studios",
			studioCatalogueProvider: liveStudioCatalogueProvider,
			studioPreviewProvider: previewProvider,
			studioArtworkRuntimeClient: artworkRuntimeClient,
			onCancel() {},
			onCreateBlank() {},
			onApplyStudios() { return { ok: true }; },
		}));
		await afterCommittedEffects();
	});
	function required(element, label) {
		if (element === null || element === undefined) throw new Error(`Mounted Studio ${label} is missing.`);
		return element;
	}
	const expectedPosterCount = 10;
	const selectedCards = [];
	async function selectExactStudio(dialog, id, expectedSelectionCount) {
		const query = required(dialog.querySelector("#studio-source-query"), "Studio search query");
		await act(async () => {
			setInputValue(query, String(id));
			await afterCommittedEffects();
		});
		const card = await waitForMountedCondition(
			() => dialog.querySelector(`[data-tmdb-studio-result="${id}"]`),
			{ label: `Checked-in Studio catalogue result ${id}`, timeoutMs: 10_000 },
		);
		selectedCards.push(card);
		await clickAndSettle(card);
		await waitForMountedCondition(
			() => dialog.querySelectorAll(".studio-selected-disclosure li").length === expectedSelectionCount,
			{ label: `Studio ${id} selection`, timeoutMs: 10_000 },
		);
		return card;
	}
	function outerPosition(dialog, scrollElement) {
		const rect = dialog.getBoundingClientRect();
		return { top: rect.top, bottom: rect.bottom, dialogScrollTop: dialog.scrollTop, innerScrollTop: scrollElement.scrollTop, x: window.scrollX, y: window.scrollY };
	}
	function positionStable(before, after) {
		return Math.abs(before.top - after.top) <= 1 && Math.abs(before.bottom - after.bottom) <= 1 && before.dialogScrollTop === after.dialogScrollTop && before.innerScrollTop === after.innerScrollTop && before.x === after.x && before.y === after.y;
	}
	try {
		const dialog = required(document.querySelector('[data-creation-dialog="true"]'), "creation dialog");
		const scrollElement = required(dialog.querySelector(".add-source-scroll"), "inner scroll owner");
		const filterGroup = await waitForMountedCondition(
			() => dialog.querySelector('[role="group"][aria-label="Movie Count filter"]'),
			{ label: "Checked-in Studio catalogue controls", timeoutMs: 10_000 },
		);
		const countFilter = required(buttonContaining(filterGroup, "100+"), "100+ Movie Count filter");
		await clickAndSettle(countFilter);
		await waitForMountedCondition(
			() => countFilter.getAttribute("aria-pressed") === "true",
			{ label: "100+ Studio Movie Count filter" },
		);
		for (const [index, id] of studioIds.entries()) await selectExactStudio(dialog, id, index + 1);
		const search = {
			realIdentitiesFound: studioIds.every((id) => selectedCards.some((card) => Number(card.dataset.tmdbStudioResult) === id)),
			numericMovieCounts: selectedCards.every((card) => /Movie Count: [\d,]+/.test(card.textContent)),
			previewAbsent: selectedCards.every((card) => !card.textContent.includes("Preview") && card.querySelector('button[aria-haspopup="dialog"]') === null),
			movieCountFilter: buttonContaining(dialog.querySelector('[role="group"][aria-label="Movie Count filter"]'), "100+")?.getAttribute("aria-pressed") === "true",
			hideZeroAbsent: buttonContaining(dialog, "Hide studios with no movies") === null,
			mostMoviesPresent: dialog.querySelector('button[aria-label="Order Studios by most movies"]') !== null,
			alphaOverridePresent: dialog.querySelector('button[aria-label="Order Studios A–Z"]') !== null,
			requestsBeforeSelection: requests.length,
		};
		const disclosure = required(dialog.querySelector(".studio-selected-disclosure"), "selected disclosure");
		await clickAndSettle(required(disclosure.querySelector("summary"), "selected disclosure summary"));
		const selectPreviewState = {
			absent: disclosure.querySelector('button[aria-haspopup="dialog"]') === null && !disclosure.textContent.includes("Preview"),
			removePresent: disclosure.querySelectorAll(".studio-selected-remove").length === 2,
			requests: requests.length,
		};

		await clickAndSettle(required(buttonContaining(dialog, "Configure 2 Studios"), "Configure action"));
		let configure = required(dialog.querySelector(".studio-hierarchy-configure"), "Configure stage");
		const configureInitialRequests = requests.length;
		const defaults = {
			movies: configure.querySelector('input[name="studio-hierarchy-media"][value="movies"]')?.checked === true,
			popular: configure.querySelector('input[name="studio-hierarchy-sort"][value="popular"]')?.checked === true,
			requestFree: configureInitialRequests === 0,
			helperCopy: configure.querySelector(".studio-configure-helper")?.textContent.trim(),
			oldDefaultsCopyAbsent: !configure.textContent.includes("Movies and Popular are selected by default"),
		};
		const initialConfigureRows = [...configure.querySelectorAll(".studio-configure-row")];
		const configureRows = {
			initialCount: initialConfigureRows.length,
			order: initialConfigureRows.map((row) => Number(row.dataset.studioId)),
			countsPresent: initialConfigureRows.every((row) => row.textContent.includes("Movies ·")),
			placementPresent: initialConfigureRows.every((row) => row.querySelector(".studio-configure-placement")?.textContent.includes("Ready to create")),
			previewActions: initialConfigureRows.filter((row) => row.querySelector('button[aria-haspopup="dialog"]')).length,
			removeLabelsAccessible: initialConfigureRows.every((row) => /^Remove .+/.test(row.querySelector(".studio-configure-remove")?.getAttribute("aria-label") ?? "")),
			disclosureAbsent: configure.querySelector(".studio-selected-disclosure") === null,
		};
		await clickAndSettle(required(initialConfigureRows[0].querySelector(".studio-configure-remove"), "first Configure remove action"));
		configureRows.afterFirstRemoval = configure.querySelectorAll(".studio-configure-row").length;
		await clickAndSettle(required(configure.querySelector(".studio-configure-remove"), "last Configure remove action"));
		configureRows.lastRemovalStayedConfigure = dialog.querySelector('[data-studio-hierarchy-stage="configure"]') !== null;
		configureRows.emptyState = configure.textContent.includes("No Studios selected. Go Back to Select");
		configureRows.appearanceDisabled = buttonContaining(dialog, "Continue to Appearance")?.disabled === true;
		await clickAndSettle(required(dialog.querySelector('[data-action="back-to-studio-selection"]'), "Back to Select after removals"));
		configureRows.filterPreserved = buttonContaining(dialog.querySelector('[role="group"][aria-label="Movie Count filter"]'), "100+")?.getAttribute("aria-pressed") === "true";
		for (const [index, id] of studioIds.entries()) await selectExactStudio(dialog, id, index + 1);
		await clickAndSettle(required(buttonContaining(dialog, "Configure 2 Studios"), "Configure after reselection"));
		configure = required(dialog.querySelector(".studio-hierarchy-configure"), "restored Configure stage");
		configureRows.reselectedOrder = [...configure.querySelectorAll(".studio-configure-row")].map((row) => Number(row.dataset.studioId));
		let configurePreviewTrigger = required(configure.querySelector('.studio-configure-row button[aria-haspopup="dialog"]'), "Configure Preview action");
		const beforeConfigurePreview = outerPosition(dialog, scrollElement);
		await clickAndSettle(configurePreviewTrigger);
		const configurePreviewModal = required(document.querySelector(".studio-preview-modal"), "Configure Preview modal");
		const readyPopularMoviePosters = await waitForReadyPosterGrid({
			preview: configurePreviewModal,
			gridSelector: ".studio-preview-grid",
			expectedVisibleCount: expectedPosterCount,
			label: `Live Studio Popular Movies Preview at ${window.innerWidth}px`,
		});
		const configureMoviePreview = {
			requests: requests.length,
			moviePopularRequest: requests[0]?.includes("with_companies=3") === true && requests[0]?.includes("sort_by=popularity.desc") === true,
			visiblePosters: readyPopularMoviePosters.visibleImages.length,
			postersReady: readyPopularMoviePosters.visibleImages.every((image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0 && visibleElement(image)),
			genuineTmdbSources: genuineTmdbPosterImages(readyPopularMoviePosters.visibleImages),
			posterOnly: [...configurePreviewModal.querySelectorAll(".studio-preview-grid > *")].every((item) => item.tagName === "IMG"),
			captionsAbsent: configurePreviewModal.querySelector(".studio-preview-grid figcaption, .studio-preview-grid article, .studio-preview-grid small") === null,
			missingCardsAbsent: !configurePreviewModal.textContent.includes("No poster"),
			countWithMedia: /Movies · [\d,]+/.test(configurePreviewModal.textContent),
			focusEntered: document.activeElement === configurePreviewModal.querySelector("header button"),
			sharedLayer: configurePreviewModal.closest(".nested-modal-backdrop")?.dataset.nestedModalBackdrop === "true",
			modalSemantics: configurePreviewModal.getAttribute("role") === "dialog" && configurePreviewModal.getAttribute("aria-modal") === "true",
			technicalCopyAbsent: !/first-page|Preview does not change|request|cache/i.test(configurePreviewModal.textContent),
		};
		await clickAndSettle(required(document.querySelector(".studio-preview-modal header button"), "cached Preview close"));
		configureMoviePreview.exactFocusRestored = document.activeElement === configurePreviewTrigger;
		configureMoviePreview.outerStable = positionStable(beforeConfigurePreview, outerPosition(dialog, scrollElement));

		await clickAndSettle(required(configure.querySelector('input[name="studio-hierarchy-media"][value="both"]'), "Movies plus Series choice"));
		configurePreviewTrigger = required(configure.querySelector('.studio-configure-row button[aria-haspopup="dialog"]'), "Both Preview action");
		await clickAndSettle(configurePreviewTrigger);
		await waitForReadyPosterGrid({
			preview: ".studio-preview-modal",
			gridSelector: ".studio-preview-grid",
			expectedVisibleCount: expectedPosterCount,
			label: `Cached live Studio Movies Preview at ${window.innerWidth}px`,
		});
		const bothMovieRequests = requests.length;
		const seriesTab = required(buttonContaining(document.querySelector(".studio-preview-tabs"), "Series"), "Series tab");
		await clickAndSettle(seriesTab);
		const readyPopularSeriesPosters = await waitForReadyPosterGrid({
			preview: ".studio-preview-modal",
			gridSelector: ".studio-preview-grid",
			expectedVisibleCount: expectedPosterCount,
			label: `Live Studio Popular Series Preview at ${window.innerWidth}px`,
		});
		const lazySeries = {
			unopenedMadeNoRequest: bothMovieRequests === configureMoviePreview.requests,
			explicitTabAddedOne: requests.length === bothMovieRequests + 1,
			countInPreview: /Series · [\d,]+/.test(document.querySelector(".studio-preview-modal")?.textContent ?? ""),
			postersReady: readyPopularSeriesPosters.visibleImages.every((image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0 && visibleElement(image)),
			genuineTmdbSources: genuineTmdbPosterImages(readyPopularSeriesPosters.visibleImages),
		};
		await clickAndSettle(required(document.querySelector(".studio-preview-modal header button"), "Series Preview close"));
		lazySeries.countRetained = /Series · [\d,]+/.test(configure.textContent);

		await clickAndSettle(required(configure.querySelector('input[name="studio-hierarchy-sort"][value="recent"]'), "Recent sort"));
		const countSurvivesSort = /Series · [\d,]+/.test(configure.textContent);
		configurePreviewTrigger = required(configure.querySelector('.studio-configure-row button[aria-haspopup="dialog"]'), "Recent Preview action");
		await clickAndSettle(configurePreviewTrigger);
		await waitForReadyPosterGrid({
			preview: ".studio-preview-modal",
			gridSelector: ".studio-preview-grid",
			expectedVisibleCount: expectedPosterCount,
			label: `Live Studio Recent Movies Preview at ${window.innerWidth}px`,
		});
		const recentMovieAddedOne = requests.length === 3 && requests.at(-1)?.includes("sort_by=primary_release_date.desc") === true;
		await clickAndSettle(required(buttonContaining(document.querySelector(".studio-preview-tabs"), "Series"), "Recent Series tab"));
		const readyRecentSeriesPosters = await waitForReadyPosterGrid({
			preview: ".studio-preview-modal",
			gridSelector: ".studio-preview-grid",
			expectedVisibleCount: expectedPosterCount,
			label: `Live Studio Recent Series Preview at ${window.innerWidth}px`,
		});
		const recentSeriesAddedOne = requests.length === 4
			&& requests.at(-1)?.includes("sort_by=first_air_date.desc") === true
			&& /Series · [\d,]+/.test(document.querySelector(".studio-preview-modal")?.textContent ?? "")
			&& readyRecentSeriesPosters.visibleImages.length === expectedPosterCount;
		await clickAndSettle(required(document.querySelector(".studio-preview-modal header button"), "Recent Preview close"));
		const recentSeriesCountRetained = /Series · [\d,]+/.test(configure.textContent);
		await clickAndSettle(required(configure.querySelector('input[name="studio-hierarchy-sort"][value="popular"]'), "Popular sort"));
		configurePreviewTrigger = required(configure.querySelector('.studio-configure-row button[aria-haspopup="dialog"]'), "restored Popular Preview action");
		await clickAndSettle(configurePreviewTrigger);
		const restoredPopularMoviePosters = await waitForReadyPosterGrid({
			preview: ".studio-preview-modal",
			gridSelector: ".studio-preview-grid",
			expectedVisibleCount: expectedPosterCount,
			label: `Restored live Studio Popular Movies Preview at ${window.innerWidth}px`,
		});
		const previousSortCacheHit = requests.length === 4
			&& /Movies · [\d,]+/.test(document.querySelector(".studio-preview-modal")?.textContent ?? "")
			&& restoredPopularMoviePosters.visibleImages.length === expectedPosterCount;
		await clickAndSettle(required(document.querySelector(".studio-preview-modal header button"), "restored Preview close"));

		await clickAndSettle(required(buttonContaining(dialog, "Continue to Appearance"), "Appearance action"));
		const appearance = await waitForMountedCondition(
			() => dialog.querySelector(".studio-hierarchy-appearance"),
			{ label: "Live Studio artwork preparation", timeoutMs: 20_000 },
		);
		const appearanceState = {
			requestFree: requests.length === 4,
			heading: appearance.querySelector("h3")?.textContent.trim(),
			studioRowsAbsent: appearance.querySelector(".studio-configure-row, .studio-review-list") === null,
			previewAbsent: appearance.querySelector('button[aria-haspopup="dialog"]') === null && !appearance.textContent.includes("Preview titles"),
			countsAbsent: !appearance.textContent.includes("Movies ·") && !appearance.textContent.includes("Series ·"),
			artworkSectionAbsent: appearance.querySelector(".studio-appearance-artwork, [data-studio-artwork-rule]") === null && ![...appearance.querySelectorAll("h4")].some((heading) => heading.textContent.trim() === "Artwork"),
			representativeAbsent: appearance.querySelector(".studio-appearance-artwork-preview, img[alt^='Representative Landscape artwork']") === null,
			artworkCopyAbsent: !/artwork|landscape|Edit Folder/i.test(appearance.textContent),
			shapeSelectorAbsent: appearance.querySelector('input[name="studio-folder-shape"]') === null && !appearance.textContent.includes("Folder artwork shape"),
			presentationControlsPresent: appearance.querySelector("#studio-collection-name") !== null
				&& appearance.querySelector('input[data-editor-control="studioHideNuvioTitle"]') !== null
				&& appearance.querySelector('input[name="studio-folder-title-visibility"]') !== null
				&& appearance.querySelector('input[name="studio-collection-layout"]') !== null
				&& appearance.querySelector('input[data-editor-control="studioShowAllTab"]') !== null
				&& appearance.querySelector('input[data-editor-control="studioPinToTop"]') !== null,
			createAction: buttonContaining(dialog, "Create collection")?.textContent.trim(),
		};
		const scrollOwners = [...dialog.querySelectorAll("*")].filter((element) => {
			const overflowY = getComputedStyle(element).overflowY;
			return (overflowY === "auto" || overflowY === "scroll") && element.scrollHeight > element.clientHeight + 1;
		}).length;
		return {
			width: window.innerWidth,
			search,
			selection: {
				selectedCount: 2,
				checkboxesNative: selectedCards.every((card) => card.querySelector('input[type="checkbox"]') !== null),
			},
			selectPreview: selectPreviewState,
			configure: { defaults, rows: configureRows, configureMoviePreview, lazySeries, countSurvivesSort, recentMovieAddedOne, recentSeriesAddedOne, recentSeriesCountRetained, previousSortCacheHit },
			appearance: appearanceState,
			artwork: { loads: artworkLoads, resolves: artworkResolves, loadSucceeded: artworkLoadSucceeded, shapeSelectorAbsent: appearance.querySelector('input[name="studio-folder-shape"]') === null },
			oneScrollOwner: scrollOwners <= 1 && dialog.querySelectorAll(".add-source-scroll").length === 1,
			noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth && dialog.scrollWidth <= dialog.clientWidth,
			revisionUnchanged: controller.getState().revision === initialRevision && controller.getState().project === initialProject,
		};
	} finally {
		await act(async () => { root.unmount(); await afterCommittedEffects(); });
		host.remove();
	}
}

function recordingNetworkPreviewFetch(requests) {
	return async (input, init) => {
		const requestUrl = typeof input === "string" ? input : input?.url;
		const url = new URL(requestUrl);
		const response = await fetch(input, init);
		const responseClone = response.clone();
		let value = null;
		let cloneError = null;
		try {
			value = await responseClone.json();
		} catch (error) {
			cloneError = error instanceof Error ? error.message : String(error);
		}
		requests.push({
			url: url.toString(),
			origin: url.origin,
			pathname: url.pathname,
			search: url.search,
			queryEntries: [...url.searchParams.entries()],
			status: response.status,
			ok: response.ok,
			contentType: response.headers.get("content-type"),
			cloneInspected: cloneError === null,
			cloneError,
			originalBodyUnusedBeforeReturn: response.bodyUsed === false,
			totalResults: value?.total_results ?? null,
			results: Array.isArray(value?.results) ? value.results.map((item) => ({
				id: item?.id ?? null,
				posterPath: typeof item?.poster_path === "string" ? item.poster_path : null,
			})) : null,
		});
		return response;
	};
}

async function runNetworkLivePreviewScenario() {
	const networkId = 213;
	const requests = [];
	const failedImageSources = new Set();
	const previewProvider = createTmdbNetworkPreviewProvider({ fetchImpl: recordingNetworkPreviewFetch(requests) });
	const controller = createController();
	const initialProject = controller.getState().project;
	const initialRevision = controller.getState().revision;
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	await act(async () => {
		root.render(createElement(CreationDialog, {
			scope: "new-collection",
			project: initialProject,
			projectRevision: initialRevision,
			currentYear: 2026,
			initialOptionId: "networks",
			networkCatalogueProvider: liveNetworkCatalogueProvider,
			networkPreviewProvider: previewProvider,
			networkArtworkRuntimeClient: liveNetworkArtworkRuntimeClient,
			onCancel() {},
			onCreateBlank() {},
			onApplyNetworks() { return { ok: true }; },
		}));
		await afterCommittedEffects();
	});
	function required(element, label) {
		if (element === null || element === undefined) throw new Error(`Mounted live Network ${label} is missing.`);
		return element;
	}
	function outerPosition(dialog, scrollElement) {
		const rect = dialog.getBoundingClientRect();
		return { top: rect.top, bottom: rect.bottom, dialogScrollTop: dialog.scrollTop, innerScrollTop: scrollElement.scrollTop, x: window.scrollX, y: window.scrollY };
	}
	function positionStable(before, after) {
		return Math.abs(before.top - after.top) <= 1
			&& Math.abs(before.bottom - after.bottom) <= 1
			&& before.dialogScrollTop === after.dialogScrollTop
			&& before.innerScrollTop === after.innerScrollTop
			&& before.x === after.x
			&& before.y === after.y;
	}
	function countLines(row) {
		const copy = required(row.querySelector(".studio-configure-row-copy"), "Configure row copy");
		return [...copy.children]
			.filter((element) => element.tagName === "SPAN" && element.textContent.includes("Series Count:"))
			.map((element) => element.textContent.trim());
	}
	function formattedCount(value) {
		return Number.isSafeInteger(value) && value >= 0 ? value.toLocaleString("en") : "Unknown";
	}
	function safePosterPaths(request) {
		return Array.isArray(request?.results)
			? request.results.map((item) => item.posterPath).filter((posterPath) => typeof posterPath === "string" && /^\/[A-Za-z0-9._-]+$/.test(posterPath))
			: [];
	}
	function imagePosterPath(image) {
		const url = new URL(image.currentSrc || image.src);
		const prefix = "/t/p/w342";
		return url.origin === "https://image.tmdb.org" && url.pathname.startsWith(prefix)
			? url.pathname.slice(prefix.length)
			: null;
	}
	function orderedSubsequence(values, source) {
		let cursor = -1;
		return values.every((value) => {
			cursor = source.indexOf(value, cursor + 1);
			return cursor >= 0;
		});
	}
	function previewEvidence(modal, readyPosters, request) {
		const visibleImages = readyPosters.visibleImages;
		const posterPaths = visibleImages.map(imagePosterPath);
		const responsePosterPaths = safePosterPaths(request);
		const responseCandidateSources = responsePosterPaths.map((posterPath) => buildTmdbPosterUrl(posterPath, "w342")).filter(Boolean);
		const failedPosterSources = responseCandidateSources.filter((source) => failedImageSources.has(source));
		return {
			visiblePosterCount: visibleImages.length,
			renderedPosterCount: readyPosters.images.length,
			responsePosterCount: responsePosterPaths.length,
			failedPosterSources,
			availablePosterCount: responseCandidateSources.length - failedPosterSources.length,
			posterSources: visibleImages.map((image) => image.currentSrc || image.src),
			expectedPosterSources: readyPosters.expectedSources,
			posterPaths,
			exactResponseOrder: JSON.stringify(visibleImages.map((image) => image.currentSrc || image.src)) === JSON.stringify(readyPosters.expectedSources),
			orderedResponseCorrespondence: posterPaths.every(Boolean) && orderedSubsequence(posterPaths, responsePosterPaths),
			postersReady: visibleImages.every((image) => {
				const rect = image.getBoundingClientRect();
				return image.complete
					&& image.naturalWidth > 0
					&& image.naturalHeight > 0
					&& image.clientWidth > 0
					&& image.clientHeight > 0
					&& rect.width > 0
					&& rect.height > 0
					&& visibleElement(image);
			}),
			readiness: visibleImages.map((image) => {
				const rect = image.getBoundingClientRect();
				return {
					src: image.currentSrc || image.src,
					complete: image.complete,
					naturalWidth: image.naturalWidth,
					naturalHeight: image.naturalHeight,
					clientWidth: image.clientWidth,
					clientHeight: image.clientHeight,
					width: rect.width,
					height: rect.height,
				};
			}),
			genuineTmdbSources: genuineTmdbPosterImages(visibleImages),
			posterOnly: readyPosters.grid.children.length > 0 && [...readyPosters.grid.children].every((child) => child.tagName === "IMG"),
			captionsAbsent: readyPosters.grid.querySelector("figcaption, article, small, p, span") === null && readyPosters.grid.textContent.trim() === "",
			missingPosterCardsAbsent: !modal.textContent.includes("No poster") && modal.querySelector("[data-preview-empty-state='true']") === null,
		};
	}
	function requestEvidence(request, expectedSort) {
		const url = new URL(request.url);
		return {
			url: request.url,
			origin: url.origin,
			pathname: url.pathname,
			queryKeys: [...url.searchParams.keys()],
			networkValues: url.searchParams.getAll("with_networks"),
			sortValues: url.searchParams.getAll("sort_by"),
			pageValues: url.searchParams.getAll("page"),
			exactRequest: url.pathname === "/3/discover/tv"
				&& url.searchParams.getAll("with_networks").length === 1
				&& url.searchParams.get("with_networks") === String(networkId)
				&& url.searchParams.getAll("sort_by").length === 1
				&& url.searchParams.get("sort_by") === expectedSort
				&& url.searchParams.has("page") === false
				&& [...url.searchParams.keys()].every((key) => key === "with_networks" || key === "sort_by")
				&& [...url.searchParams.keys()].length === 2,
			status: request.status,
			ok: request.ok,
			contentType: request.contentType,
			cloneInspected: request.cloneInspected,
			originalBodyUnusedBeforeReturn: request.originalBodyUnusedBeforeReturn,
			totalResults: request.totalResults,
		};
	}
	async function waitForRequest(index, label) {
		return waitForMountedCondition(
			() => requests[index] ?? null,
			{ label, timeoutMs: 20_000 },
		);
	}
	async function waitForLivePosterGrid(modal, request, label) {
		const maxVisibleCount = 10;
		const candidateSources = safePosterPaths(request)
			.map((posterPath) => buildTmdbPosterUrl(posterPath, "w342"))
			.filter(Boolean);
		let diagnostic = { maxVisibleCount, candidateSources, failedImageSources: [], grid: false, images: [] };
		try {
			return await waitForMountedCondition(() => {
				const expectedSources = candidateSources.filter((source) => !failedImageSources.has(source)).slice(0, maxVisibleCount);
				const grid = modal.querySelector(".network-preview-grid");
				const images = grid ? [...grid.querySelectorAll(":scope > img")] : [];
				const visibleImages = images.filter(visibleElement);
				const visibleSources = visibleImages.map((image) => image.currentSrc || image.src);
				diagnostic = {
					maxVisibleCount,
					candidateSources,
					expectedSources,
					failedImageSources: [...failedImageSources],
					grid: Boolean(grid),
					visibleSources,
					images: images.map((image) => {
						const rect = image.getBoundingClientRect();
						return {
							src: image.currentSrc || image.src,
							visible: visibleElement(image),
							complete: image.complete,
							naturalWidth: image.naturalWidth,
							naturalHeight: image.naturalHeight,
							clientWidth: image.clientWidth,
							clientHeight: image.clientHeight,
							width: rect.width,
							height: rect.height,
						};
					}),
				};
				if (!grid || expectedSources.length === 0 || visibleSources.length !== expectedSources.length) return null;
				if (visibleSources.some((source, index) => source !== expectedSources[index])) return null;
				if (visibleImages.some((image) => {
					const rect = image.getBoundingClientRect();
					return !image.complete
						|| image.naturalWidth <= 0
						|| image.naturalHeight <= 0
						|| image.clientWidth <= 0
						|| image.clientHeight <= 0
						|| rect.width <= 0
						|| rect.height <= 0;
				})) return null;
				return { grid, images, visibleImages, expectedVisibleCount: expectedSources.length, expectedSources };
			}, { label, timeoutMs: 30_000 });
		} catch (error) {
			throw new Error(`${error.message} Live Network poster readiness: ${JSON.stringify(diagnostic)}`);
		}
	}
	async function waitForPreview(request, label) {
		if (!request.ok || !request.cloneInspected || !Number.isSafeInteger(request.totalResults) || request.totalResults < 0) {
			throw new Error(`${label} received an unusable live Worker response: ${JSON.stringify(request)}`);
		}
		const responsePosterPaths = safePosterPaths(request);
		if (responsePosterPaths.length === 0) throw new Error(`${label} returned no usable real TMDB poster_path values: ${JSON.stringify(request)}`);
		const modal = await waitForMountedCondition(
			() => document.querySelector(".network-preview-modal"),
			{ label: `${label} modal`, timeoutMs: 20_000 },
		);
		const readyPosters = await waitForLivePosterGrid(modal, request, label);
		return { modal, readyPosters, expectedVisibleCount: readyPosters.expectedVisibleCount, evidence: previewEvidence(modal, readyPosters, request) };
	}
	async function closeWithEscape(modal) {
		await act(async () => {
			(document.activeElement ?? modal).dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
			await afterCommittedEffects();
		});
	}
	function recordFailedPoster(event) {
		if (!(event.target instanceof HTMLImageElement)) return;
		const source = event.target.currentSrc || event.target.src;
		try {
			const url = new URL(source);
			if (url.origin === "https://image.tmdb.org" && url.pathname.startsWith("/t/p/w342/")) failedImageSources.add(url.toString());
		} catch {}
	}
	document.addEventListener("error", recordFailedPoster, true);
	try {
		const dialog = required(document.querySelector('[data-creation-dialog="true"]'), "creation dialog");
		const outerPortal = required(dialog.closest(".add-source-portal"), "outer portal");
		const scrollElement = required(dialog.querySelector(".add-source-scroll"), "inner scroll owner");
		const query = required(dialog.querySelector("#network-source-query"), "Search input");
		await act(async () => {
			setInputValue(query, String(networkId));
			await afterCommittedEffects();
		});
		const card = await waitForMountedCondition(
			() => dialog.querySelector(`[data-tmdb-network-result="${networkId}"]`),
			{ label: `Checked-in Network ${networkId} result`, timeoutMs: 10_000 },
		);
		const catalogueCountLine = required(card.querySelector(".network-result-count"), "catalogue Series Count").textContent.trim();
		await clickAndSettle(card);
		await waitForMountedCondition(
			() => dialog.querySelectorAll(".network-selected-disclosure li").length === 1,
			{ label: `Network ${networkId} selection`, timeoutMs: 10_000 },
		);
		await clickAndSettle(required(buttonContaining(dialog, "Configure 1 Network"), "Configure action"));
		const configure = required(dialog.querySelector(".network-hierarchy-configure"), "Configure stage");
		const row = required(configure.querySelector(`[data-network-id="${networkId}"]`), "Network Configure row");
		const initialCountLines = countLines(row);
		const popularSort = required(configure.querySelector('input[name="network-hierarchy-sort"][value="popular"]'), "Popular sort");
		let previewTrigger = required(row.querySelector('button[aria-haspopup="dialog"]'), "Popular Preview trigger");
		previewTrigger.focus({ preventScroll: true });
		const requestsBeforeExplicitPreview = requests.length;
		const beforePopular = outerPosition(dialog, scrollElement);
		failedImageSources.clear();
		await clickAndSettle(previewTrigger);
		const popularRequest = await waitForRequest(0, "Live Network Popular Worker request");
		const popularReady = await waitForPreview(popularRequest, `Live Network Popular Preview at ${window.innerWidth}px`);
		const requestsAfterPopular = requests.length;
		const nestedBackdrop = required(popularReady.modal.closest(".nested-modal-backdrop"), "nested Preview backdrop");
		const popularLayer = {
			focusEntered: document.activeElement === popularReady.modal.querySelector("header button"),
			sharedLayer: nestedBackdrop.dataset.nestedModalBackdrop === "true",
			modalSemantics: popularReady.modal.getAttribute("role") === "dialog" && popularReady.modal.getAttribute("aria-modal") === "true",
			nestedAboveOuter: Number.parseInt(getComputedStyle(nestedBackdrop).zIndex, 10) > Number.parseInt(getComputedStyle(outerPortal).zIndex, 10),
			outerInert: scrollElement.hasAttribute("inert") && scrollElement.getAttribute("aria-hidden") === "true",
			noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth
				&& dialog.scrollWidth <= dialog.clientWidth
				&& popularReady.modal.scrollWidth <= popularReady.modal.clientWidth,
		};
		const popularModalCount = popularReady.modal.querySelector(".network-preview-count")?.textContent.trim() ?? null;
		await clickAndSettle(required(popularReady.modal.querySelector("header button"), "Popular Preview Close action"));
		const popularCountLines = countLines(row);
		const popularClose = {
			closed: document.querySelector(".network-preview-modal") === null,
			exactFocusRestored: document.activeElement === previewTrigger,
			outerStable: positionStable(beforePopular, outerPosition(dialog, scrollElement)),
			configureIntact: dialog.querySelector('[data-network-hierarchy-stage="configure"]') !== null
				&& dialog.querySelector(`[data-network-id="${networkId}"]`) === row
				&& popularSort.checked === true,
			countLines: popularCountLines,
		};

		const beforeCachedPopular = outerPosition(dialog, scrollElement);
		failedImageSources.clear();
		await clickAndSettle(previewTrigger);
		const cachedPopularReady = await waitForPreview(popularRequest, `Cached live Network Popular Preview at ${window.innerWidth}px`);
		const requestsAfterCachedPopular = requests.length;
		await closeWithEscape(cachedPopularReady.modal);
		const cachedPopular = {
			requestCount: requestsAfterCachedPopular,
			cacheHit: requestsAfterCachedPopular === 1,
			preview: cachedPopularReady.evidence,
			escapeClosed: document.querySelector(".network-preview-modal") === null,
			exactFocusRestored: document.activeElement === previewTrigger,
			outerStable: positionStable(beforeCachedPopular, outerPosition(dialog, scrollElement)),
		};

		const recentSort = required(configure.querySelector('input[name="network-hierarchy-sort"][value="recent"]'), "Recent sort");
		await clickAndSettle(recentSort);
		const countAfterSortBeforePreview = countLines(row);
		previewTrigger = required(row.querySelector('button[aria-haspopup="dialog"]'), "Recent Preview trigger");
		const beforeRecent = outerPosition(dialog, scrollElement);
		failedImageSources.clear();
		await clickAndSettle(previewTrigger);
		const recentRequest = await waitForRequest(1, "Live Network Recent Worker request");
		const recentReady = await waitForPreview(recentRequest, `Live Network Recent Preview at ${window.innerWidth}px`);
		const recentModalCount = recentReady.modal.querySelector(".network-preview-count")?.textContent.trim() ?? null;
		const responseSequencesDiffer = JSON.stringify(safePosterPaths(popularRequest)) !== JSON.stringify(safePosterPaths(recentRequest));
		const previousSortNotShown = recentReady.evidence.exactResponseOrder;
		await clickAndSettle(required(recentReady.modal.querySelector("header button"), "Recent Preview Close action"));
		const recentCountLines = countLines(row);
		const recentClose = {
			closed: document.querySelector(".network-preview-modal") === null,
			exactFocusRestored: document.activeElement === previewTrigger,
			outerStable: positionStable(beforeRecent, outerPosition(dialog, scrollElement)),
		};

		await clickAndSettle(popularSort);
		const countAfterReturnToPopularBeforePreview = countLines(row);
		previewTrigger = required(row.querySelector('button[aria-haspopup="dialog"]'), "restored Popular Preview trigger");
		failedImageSources.clear();
		await clickAndSettle(previewTrigger);
		const restoredPopularReady = await waitForPreview(popularRequest, `Restored cached Network Popular Preview at ${window.innerWidth}px`);
		const restoredPopularRequestCount = requests.length;
		await clickAndSettle(required(restoredPopularReady.modal.querySelector("header button"), "restored Popular Preview Close action"));
		const finalCountLines = countLines(row);

		return {
			width: window.innerWidth,
			networkId,
			catalogueCountLine,
			initialCountLines,
			requestsBeforeExplicitPreview,
			popular: {
				requestCount: requestsAfterPopular,
				request: requestEvidence(popularRequest, "popularity.desc"),
				expectedVisibleCount: popularReady.expectedVisibleCount,
				preview: popularReady.evidence,
				modalCountLine: popularModalCount,
				configureCountLines: popularCountLines,
				layer: popularLayer,
				close: popularClose,
			},
			cachedPopular,
			recent: {
				requestCount: requests.length,
				request: requestEvidence(recentRequest, "first_air_date.desc"),
				expectedVisibleCount: recentReady.expectedVisibleCount,
				preview: recentReady.evidence,
				modalCountLine: recentModalCount,
				countAfterSortBeforePreview,
				configureCountLines: recentCountLines,
				previousSortNotShown,
				responseSequencesDiffer,
				close: recentClose,
			},
			restoredPopular: {
				requestCount: restoredPopularRequestCount,
				cacheHit: restoredPopularRequestCount === 2,
				preview: restoredPopularReady.evidence,
				matchesOriginalResponse: restoredPopularReady.evidence.orderedResponseCorrespondence && restoredPopularReady.evidence.exactResponseOrder,
				countAfterReturnToPopularBeforePreview,
				finalCountLines,
				closed: document.querySelector(".network-preview-modal") === null,
				exactFocusRestored: document.activeElement === previewTrigger,
			},
			instrumentation: {
				requestCount: requests.length,
				allResponsesCloned: requests.every((request) => request.cloneInspected),
				originalResponsesUntouched: requests.every((request) => request.originalBodyUnusedBeforeReturn),
				allSuccessfulJson: requests.every((request) => request.ok && request.contentType?.toLowerCase().includes("application/json")),
			},
			final: {
				oneSeriesCountLine: finalCountLines.length === 1 && !row.textContent.includes("Exact Series Count") && !row.textContent.includes("Live Series Count"),
				configureIntact: dialog.querySelector('[data-network-hierarchy-stage="configure"]') !== null && popularSort.checked === true,
				noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth && dialog.scrollWidth <= dialog.clientWidth,
				revisionUnchanged: controller.getState().revision === initialRevision && controller.getState().project === initialProject,
			},
		};
	} finally {
		document.removeEventListener("error", recordFailedPoster, true);
		await act(async () => { root.unmount(); await afterCommittedEffects(); });
		host.remove();
	}
}

async function runGenreLivePreviewScenario() {
	const requests = [];
	const failedImageSources = new Set();
	const previewProvider = createTmdbGenrePreviewProvider({ fetchImpl: recordingNetworkPreviewFetch(requests) });
	const controller = createController();
	const initialProject = controller.getState().project;
	const initialRevision = controller.getState().revision;
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	await act(async () => {
		root.render(createElement(CreationDialog, {
			scope: "new-collection",
			project: initialProject,
			projectRevision: initialRevision,
			currentYear: 2026,
			initialOptionId: "genres",
			genrePreviewProvider: previewProvider,
			onCancel() {},
			onCreateBlank() {},
			onApplyGenres() { return { ok: true }; },
		}));
		await afterCommittedEffects();
	});

	function required(element, label) {
		if (element === null || element === undefined) throw new Error(`Mounted live Genre ${label} is missing.`);
		return element;
	}
	function safePosterPaths(request) {
		return Array.isArray(request?.results)
			? request.results.map((item) => item.posterPath).filter((posterPath) => typeof posterPath === "string" && /^\/[A-Za-z0-9._-]+$/.test(posterPath))
			: [];
	}
	function requestEvidence(request) {
		const url = new URL(request.url);
		return {
			url: request.url,
			origin: url.origin,
			pathname: url.pathname,
			queryEntries: [...url.searchParams.entries()],
			queryKeys: [...url.searchParams.keys()],
			status: request.status,
			ok: request.ok,
			contentType: request.contentType,
			cloneInspected: request.cloneInspected,
			originalBodyUnusedBeforeReturn: request.originalBodyUnusedBeforeReturn,
			totalResults: request.totalResults,
		};
	}
	function serializablePreview(preview) {
		const { modal: _modal, ...evidence } = preview;
		return evidence;
	}
	async function waitForRequest(index, label) {
		return waitForMountedCondition(() => requests[index] ?? null, { label, timeoutMs: 20_000 });
	}
	async function waitForPreview(request, label) {
		if (!request.ok || !request.cloneInspected || !Number.isSafeInteger(request.totalResults) || request.totalResults < 0) {
			throw new Error(`${label} received an unusable live Worker response: ${JSON.stringify(request)}`);
		}
		const responsePosterPaths = safePosterPaths(request);
		if (responsePosterPaths.length === 0) throw new Error(`${label} returned no usable real TMDB poster_path values: ${JSON.stringify(request)}`);
		const candidateSources = responsePosterPaths.map((posterPath) => buildTmdbPosterUrl(posterPath, "w342")).filter(Boolean);
		const maximumVisibleCount = 10;
		let diagnostic = null;
		try {
			return await waitForMountedCondition(() => {
				const modal = document.querySelector(".genre-preview-modal");
				const grid = modal?.querySelector(".genre-preview-grid");
				const images = grid ? [...grid.querySelectorAll(":scope > img")] : [];
				const visibleImages = images.filter(visibleElement);
				const expectedSources = candidateSources.filter((source) => !failedImageSources.has(source)).slice(0, maximumVisibleCount);
				const visibleSources = visibleImages.map((image) => image.currentSrc || image.src);
				diagnostic = {
					modal: Boolean(modal),
					grid: Boolean(grid),
					maximumVisibleCount,
					expectedSources,
					visibleSources,
					failedImageSources: [...failedImageSources],
				};
				if (!modal || !grid || expectedSources.length === 0 || visibleSources.length !== expectedSources.length) return null;
				if (visibleSources.some((source, index) => source !== expectedSources[index])) return null;
				if (visibleImages.some((image) => {
					const rect = image.getBoundingClientRect();
					return !image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0 || image.clientWidth <= 0 || image.clientHeight <= 0 || rect.width <= 0 || rect.height <= 0;
				})) return null;
				return {
					modal,
					maximumVisibleCount,
					visiblePosterCount: visibleImages.length,
					renderedPosterCount: images.length,
					geometry: titlePreviewGeometry(modal, grid),
					responsePosterCount: responsePosterPaths.length,
					posterSources: visibleSources,
					expectedSources,
					postersReady: true,
					genuineTmdbSources: genuineTmdbPosterImages(visibleImages),
					posterOnly: [...grid.children].every((child) => child.tagName === "IMG"),
					captionsAbsent: grid.querySelector("figcaption, article, small, p, span") === null && grid.textContent.trim() === "",
					countLine: modal.querySelector(".genre-preview-tabs [aria-selected='true'], .studio-preview-single-media")?.textContent.trim() ?? null,
				};
			}, { label, timeoutMs: 30_000 });
		} catch (error) {
			throw new Error(`${error.message} Live Genre poster readiness: ${JSON.stringify(diagnostic)}`);
		}
	}
	async function updateInput(input, value) {
		await act(async () => {
			setInputValue(required(input, `Advanced input ${value}`), value);
			await afterCommittedEffects();
		});
	}
	async function updateSelect(select, value) {
		await act(async () => {
			setSelectValue(required(select, `Advanced select ${value}`), value);
			await afterCommittedEffects();
		});
	}
	function recordFailedPoster(event) {
		if (!(event.target instanceof HTMLImageElement)) return;
		const source = event.target.currentSrc || event.target.src;
		try {
			const url = new URL(source);
			if (url.origin === "https://image.tmdb.org" && url.pathname.startsWith("/t/p/w342/")) failedImageSources.add(url.toString());
		} catch {}
	}

	document.addEventListener("error", recordFailedPoster, true);
	try {
		const dialog = required(document.querySelector('[data-creation-option="genres"]'), "creation dialog");
		await clickAndSettle(required(dialog.querySelector('[data-genre-name="Animation"]'), "Animation choice"));
		await clickAndSettle(required(buttonContaining(dialog, "Configure 1 Genre"), "Configure action"));
		const row = required(dialog.querySelector('.genre-hierarchy-configure-row[data-genre-name="Animation"]'), "Animation Configure row");
		let previewTrigger = required(row.querySelector('button[aria-haspopup="dialog"]'), "Animation Preview trigger");
		const requestsBeforeExplicitPreview = requests.length;

		failedImageSources.clear();
		await clickAndSettle(previewTrigger);
		const movieRequest = await waitForRequest(0, "Live Genre Movie Worker request");
		const movieReady = await waitForPreview(movieRequest, `Live Genre Movie Preview at ${window.innerWidth}px`);
		const tabs = [...movieReady.modal.querySelectorAll('.genre-preview-tabs [role="tab"]')];
		const movieTab = required(tabs[0], "Movies tab");
		const seriesTab = required(tabs[1], "Series tab");
		const sharedBeforeSwitch = {
			requestCount: requests.length,
			movieSelected: movieTab.getAttribute("aria-selected") === "true",
			movieCountShown: movieTab.textContent.includes(Number(movieRequest.totalResults).toLocaleString("en")),
			seriesDeferred: seriesTab.textContent.trim() === "Series",
		};

		failedImageSources.clear();
		await clickAndSettle(seriesTab);
		const seriesRequest = await waitForRequest(1, "Live Genre TV Worker request");
		const seriesReady = await waitForPreview(seriesRequest, `Live Genre TV Preview at ${window.innerWidth}px`);
		const sharedAfterSwitch = {
			requestCount: requests.length,
			seriesSelected: seriesTab.getAttribute("aria-selected") === "true",
			seriesCountShown: seriesTab.textContent.includes(Number(seriesRequest.totalResults).toLocaleString("en")),
		};
		await clickAndSettle(required(seriesReady.modal.querySelector("header button"), "shared Preview Close action"));
		const sharedClose = {
			closed: document.querySelector(".genre-preview-modal") === null,
			exactFocusRestored: document.activeElement === previewTrigger,
		};

		await clickAndSettle(required(dialog.querySelector('input[name="genre-hierarchy-media"][value="movies"]'), "Movies media choice"));
		await clickAndSettle(required(dialog.querySelector('input[name="genre-hierarchy-sort"][value="recent"]'), "Recent sort choice"));
		await clickAndSettle(required(dialog.querySelector(".genre-advanced-options > summary"), "Advanced options summary"));
		await updateInput(dialog.querySelector("#genre-hierarchy-advanced-year-from"), "2020");
		await updateInput(dialog.querySelector("#genre-hierarchy-advanced-year-to"), "2026");
		await updateInput(dialog.querySelector("#genre-hierarchy-advanced-rating-min"), "6");
		await updateInput(dialog.querySelector("#genre-hierarchy-advanced-rating-max"), "9");
		await updateInput(dialog.querySelector("#genre-hierarchy-advanced-votes-min"), "100");
		await updateSelect(dialog.querySelector("#genre-hierarchy-advanced-language"), "en");
		await updateSelect(dialog.querySelector("#genre-hierarchy-advanced-country"), "US");
		await clickAndSettle(required(buttonContaining(dialog.querySelector(".genre-advanced-compact-actions"), "Choose"), "exclusion picker action"));
		await clickAndSettle(required(buttonContaining(dialog.querySelector(".genre-exclusion-picker-list"), "Family"), "Family exclusion"));
		await clickAndSettle(required(dialog.querySelector(".genre-secondary-done"), "exclusion Done action"));

		previewTrigger = required(row.querySelector('button[aria-haspopup="dialog"]'), "filtered Animation Preview trigger");
		failedImageSources.clear();
		await clickAndSettle(previewTrigger);
		const filteredRequest = await waitForRequest(2, "Live filtered Genre Movie Worker request");
		const filteredReady = await waitForPreview(filteredRequest, `Live filtered Genre Movie Preview at ${window.innerWidth}px`);
		const singleMedia = {
			tabsAbsent: filteredReady.modal.querySelector(".genre-preview-tabs") === null,
			countShown: filteredReady.countLine?.includes(Number(filteredRequest.totalResults).toLocaleString("en")) ?? false,
		};
		await clickAndSettle(required(filteredReady.modal.querySelector("header button"), "filtered Preview Close action"));

		failedImageSources.clear();
		await clickAndSettle(previewTrigger);
		const cachedReady = await waitForPreview(filteredRequest, `Cached filtered Genre Movie Preview at ${window.innerWidth}px`);
		const filteredCacheHit = requests.length === 3;
		await clickAndSettle(required(cachedReady.modal.querySelector("header button"), "cached filtered Preview Close action"));

		return {
			width: window.innerWidth,
			requestsBeforeExplicitPreview,
			movie: { request: requestEvidence(movieRequest), preview: serializablePreview(movieReady), sharedBeforeSwitch },
			series: { request: requestEvidence(seriesRequest), preview: serializablePreview(seriesReady), sharedAfterSwitch },
			sharedClose,
			filtered: { request: requestEvidence(filteredRequest), preview: serializablePreview(filteredReady), singleMedia, cacheHit: filteredCacheHit },
			instrumentation: {
				requestCount: requests.length,
				allResponsesCloned: requests.every((request) => request.cloneInspected),
				originalResponsesUntouched: requests.every((request) => request.originalBodyUnusedBeforeReturn),
				allSuccessfulJson: requests.every((request) => request.ok && request.contentType?.toLowerCase().includes("application/json")),
			},
			final: {
				focusRestored: document.activeElement === previewTrigger,
				configureIntact: dialog.querySelector('[data-genre-hierarchy-stage="configure"]') !== null,
				noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth && dialog.scrollWidth <= dialog.clientWidth,
				revisionUnchanged: controller.getState().revision === initialRevision && controller.getState().project === initialProject,
			},
		};
	} finally {
		document.removeEventListener("error", recordFailedPoster, true);
		await act(async () => { root.unmount(); await afterCommittedEffects(); });
		host.remove();
	}
}

async function runStreamingHierarchyScenario(runLivePreview = false) {
	const providerIds = [2, 444];
	const requests = [];
	const failedImageSources = new Set();
	let applyCalls = 0;
	const previewProvider = createTmdbStreamingPreviewProvider({ fetchImpl: recordingNetworkPreviewFetch(requests) });
	const controller = createController();
	const collectionResult = controller.createCollection({ editable: { title: "Streaming Services", viewMode: "ROWS", showAllTab: true, pinToTop: false } });
	const existingAppleArtwork = {
		coverImageUrl: "https://image.example/apple-cover.jpg",
		heroBackdropUrl: "https://image.example/apple-hero.jpg",
		titleLogoUrl: "https://image.example/apple-logo.png",
		focusGifUrl: "https://image.example/apple-focus.gif",
		focusGifEnabled: true,
	};
	const appleFolderResult = controller.createFolder(collectionResult.createdInternalId, { editable: { title: "Apple TV", tileShape: "POSTER", hideTitle: false, ...existingAppleArtwork } });
	const initialAppleSources = [
		{ category: "native-tmdb", editable: streamingSource({ title: "Movies (AU)", mediaType: "MOVIE", filters: { watchRegion: "AU", withWatchProviders: "2" } }) },
		{ category: "native-tmdb", editable: streamingSource({ title: "Series (AU)", mediaType: "TV", filters: { watchRegion: "AU", withWatchProviders: "2" } }) },
	];
	if (!controller.addSourcesToFolder(appleFolderResult.createdInternalId, { sources: initialAppleSources }).ok) throw new Error("Mounted Streaming hierarchy setup failed.");
	const secondaryCollectionResult = controller.createCollection({ editable: { title: "Streaming Services", viewMode: "TABBED_GRID", showAllTab: true, pinToTop: false } });
	const secondaryFolderResult = controller.createFolder(secondaryCollectionResult.createdInternalId, { editable: { title: "Apple movies", tileShape: "POSTER", hideTitle: false } });
	if (!controller.addSourcesToFolder(secondaryFolderResult.createdInternalId, { sources: [initialAppleSources[0]] }).ok) throw new Error("Mounted Streaming secondary destination setup failed.");
	const tertiaryCollectionResult = controller.createCollection({ editable: { title: "Streaming Services", viewMode: "ROWS", showAllTab: false, pinToTop: true } });
	const tertiaryFolderResult = controller.createFolder(tertiaryCollectionResult.createdInternalId, { editable: { title: "Dekkoo movies", tileShape: "LANDSCAPE", hideTitle: true } });
	const tertiaryDekkooSource = { category: "native-tmdb", editable: streamingSource({ title: "Movies (AU)", mediaType: "MOVIE", filters: { watchRegion: "AU", withWatchProviders: "444" } }) };
	if (!controller.addSourcesToFolder(tertiaryFolderResult.createdInternalId, { sources: [tertiaryDekkooSource] }).ok) throw new Error("Mounted Streaming tertiary destination setup failed.");
	const initialProject = controller.getState().project;
	const initialRevision = controller.getState().revision;
	const secondaryCollectionBefore = JSON.stringify(initialProject.collections.find((collection) => collection.internalId === secondaryCollectionResult.createdInternalId));
	const tertiaryCollectionBefore = JSON.stringify(initialProject.collections.find((collection) => collection.internalId === tertiaryCollectionResult.createdInternalId));
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	await act(async () => {
		root.render(createElement(CreationDialog, {
			scope: "new-collection",
			project: initialProject,
			projectRevision: initialRevision,
			currentYear: 2026,
			initialOptionId: "streaming-services",
			streamingCatalogueProvider: liveStreamingCatalogueProvider,
			streamingPreviewProvider: previewProvider,
			onCancel() {},
			onCreateBlank() {},
			onApplyStreaming(plan) { applyCalls += 1; return applyStreamingHierarchyPlan(controller, plan); },
		}));
		await afterCommittedEffects();
	});
	function required(element, label) {
		if (element === null || element === undefined) throw new Error(`Mounted Streaming hierarchy ${label} is missing.`);
		return element;
	}
	function stageLayout(dialog) {
		const scroll = required(dialog.querySelector(".add-source-scroll"), "scroll owner");
		const primary = required(dialog.querySelector(".add-source-actions .editor-apply"), "primary action");
		const primaryRect = primary.getBoundingClientRect();
		const activeScrollOwners = [...dialog.querySelectorAll("*")].filter((element) => {
			const overflowY = getComputedStyle(element).overflowY;
			return (overflowY === "auto" || overflowY === "scroll") && element.scrollHeight > element.clientHeight + 1;
		});
		return {
			singleInnerScroll: dialog.querySelectorAll(".add-source-scroll").length === 1 && ["auto", "scroll"].includes(getComputedStyle(scroll).overflowY),
			oneActiveScrollOwner: activeScrollOwners.length <= 1,
			noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth && dialog.scrollWidth <= dialog.clientWidth && scroll.scrollWidth <= scroll.clientWidth,
			primaryReachable: visibleElement(primary) && primaryRect.height >= 44 && primaryRect.left >= -1 && primaryRect.right <= window.innerWidth + 1,
		};
	}
	function recordFailedPoster(event) {
		if (!(event.target instanceof HTMLImageElement)) return;
		const source = event.target.currentSrc || event.target.src;
		try {
			const url = new URL(source);
			if (url.origin === "https://image.tmdb.org" && url.pathname.startsWith("/t/p/w342/")) failedImageSources.add(url.toString());
		} catch {}
	}
	function responsePosterSources(request) {
		return (request?.results ?? [])
			.map((item) => buildTmdbPosterUrl(item.posterPath, "w342"))
			.filter(Boolean)
			.slice(0, 10);
	}
	async function waitForRequest(index, label) {
		return waitForMountedCondition(() => requests[index] ?? null, { label, timeoutMs: 20_000 });
	}
	async function waitForPreview(index, label) {
		const request = await waitForRequest(index, `${label} request`);
		if (!request.ok || !request.cloneInspected || !Number.isSafeInteger(request.totalResults) || request.totalResults < 0) {
			throw new Error(`${label} received an unusable live Worker response: ${JSON.stringify(request)}`);
		}
		const candidateSources = responsePosterSources(request);
		if (candidateSources.length === 0) throw new Error(`${label} returned no usable real TMDB poster paths.`);
		const modal = await waitForMountedCondition(() => document.querySelector(".streaming-hierarchy-preview-modal"), { label: `${label} modal`, timeoutMs: 20_000 });
		const ready = await waitForMountedCondition(() => {
			const grid = modal.querySelector(".streaming-hierarchy-preview-grid");
			const images = grid ? [...grid.querySelectorAll(":scope > img")] : [];
			if (!grid || images.length === 0 || images.some((image) => !image.complete)) return null;
			const visibleImages = images.filter(visibleElement);
			if (visibleImages.length === 0 || visibleImages.some((image) => image.naturalWidth <= 0 || image.naturalHeight <= 0)) return null;
			return { grid, images, visibleImages };
		}, { label: `${label} poster grid`, timeoutMs: 30_000 });
		const visibleSources = ready.visibleImages.map((image) => image.currentSrc || image.src);
		const expectedSources = candidateSources.filter((source) => !failedImageSources.has(source));
		return {
			request,
			modal,
			evidence: {
				visiblePosterCount: ready.visibleImages.length,
				renderedPosterCount: ready.images.length,
				posterSources: visibleSources,
				expectedSources,
				exactResponseOrder: JSON.stringify(visibleSources) === JSON.stringify(expectedSources),
				postersReady: ready.visibleImages.every((image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0),
				genuineTmdbSources: genuineTmdbPosterImages(ready.visibleImages),
				posterOnly: [...ready.grid.children].every((child) => child.tagName === "IMG"),
				geometry: titlePreviewGeometry(modal, ready.grid),
			},
		};
	}
	function requestEvidence(request) {
		const url = new URL(request.url);
		return {
			origin: url.origin,
			pathname: url.pathname,
			queryEntries: [...url.searchParams.entries()],
			status: request.status,
			ok: request.ok,
			contentType: request.contentType,
			totalResults: request.totalResults,
		};
	}
	document.addEventListener("error", recordFailedPoster, true);
	try {
		const dialog = required(document.querySelector('[data-creation-dialog="true"]'), "creation dialog");
		const regionQuery = await waitForMountedCondition(
			() => dialog.querySelector("#streaming-region-query"),
			{ label: "live Streaming catalogue and region Search", timeoutMs: 20_000 },
		);
		const regionFocus = {
			searchFocused: document.activeElement === regionQuery,
			autoFocusAttributeAbsent: regionQuery.autofocus === false && !regionQuery.hasAttribute("autofocus"),
			keyboardTargetAbsent: !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName),
		};
		const au = await waitForMountedCondition(() => dialog.querySelector('[data-streaming-region="AU"]'), { label: "live AU region", timeoutMs: 20_000 });
		const us = await waitForMountedCondition(() => dialog.querySelector('[data-streaming-region="US"]'), { label: "live US region", timeoutMs: 20_000 });
		await clickAndSettle(au);
		await clickAndSettle(us);
		const selectedRegionStyle = getComputedStyle(au);
		const regionSelectionVisual = {
			selected: au.dataset.selected === "true" && au.getAttribute("aria-pressed") === "true",
			borderRetained: selectedRegionStyle.borderColor !== "rgba(0, 0, 0, 0)",
			surfaceRetained: selectedRegionStyle.backgroundColor !== "rgba(0, 0, 0, 0)",
			markerAbsent: au.querySelector(".streaming-region-selected-mark, [data-selection-indicator]") === null,
			structuralInset: selectedRegionStyle.boxShadow !== "none",
			leftRailAbsent: !selectedRegionStyle.boxShadow.includes("3px 0px"),
		};
		const regionLayout = stageLayout(dialog);
		await clickAndSettle(required(buttonContaining(dialog, "Choose services for 2 regions"), "Choose services action"));

		const providerQuery = required(dialog.querySelector("#streaming-hierarchy-provider-query"), "provider Search");
		const providerFocus = {
			searchFocused: document.activeElement === providerQuery,
			autoFocusAttributeAbsent: providerQuery.autofocus === false && !providerQuery.hasAttribute("autofocus"),
			keyboardTargetAbsent: !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName),
		};
		await act(async () => {
			setInputValue(providerQuery, String(providerIds[0]));
			await afterCommittedEffects();
		});
		let providerCard = await waitForMountedCondition(() => dialog.querySelector(`[data-streaming-provider="${providerIds[0]}"]`), { label: `live Streaming provider ${providerIds[0]}`, timeoutMs: 20_000 });
		const providerNames = [required(providerCard.querySelector("strong"), "provider name").textContent.trim()];
		await clickAndSettle(providerCard);
		const movies = required(dialog.querySelector('input[name="streaming-hierarchy-media"][value="movies"]'), "Movies media choice");
		await clickAndSettle(movies);
		const moviesRetained = dialog.querySelectorAll(".streaming-selected-disclosure li").length === 1 && dialog.querySelector(`[data-streaming-provider="${providerIds[0]}"] input`)?.checked === true;
		const series = required(dialog.querySelector('input[name="streaming-hierarchy-media"][value="series"]'), "Series media choice");
		await clickAndSettle(series);
		const seriesRetained = dialog.querySelectorAll(".streaming-selected-disclosure li").length === 1 && dialog.querySelector(`[data-streaming-provider="${providerIds[0]}"] input`)?.checked === true;
		const both = required(dialog.querySelector('input[name="streaming-hierarchy-media"][value="both"]'), "Both media choice");
		await clickAndSettle(both);
		const mediaSelectionRetention = {
			moviesRetained,
			seriesRetained,
			bothRetained: dialog.querySelectorAll(".streaming-selected-disclosure li").length === 1 && dialog.querySelector(`[data-streaming-provider="${providerIds[0]}"] input`)?.checked === true,
			searchPreserved: providerQuery.value === String(providerIds[0]),
			noPruneNotice: dialog.querySelector("[data-streaming-selection-reconciliation]") === null,
		};
		await act(async () => {
			setInputValue(providerQuery, String(providerIds[1]));
			await afterCommittedEffects();
		});
		providerCard = await waitForMountedCondition(() => dialog.querySelector(`[data-streaming-provider="${providerIds[1]}"]`), { label: `live Streaming provider ${providerIds[1]}`, timeoutMs: 20_000 });
		providerNames.push(required(providerCard.querySelector("strong"), "second provider name").textContent.trim());
		await clickAndSettle(providerCard);
		const providerLayout = stageLayout(dialog);
		await clickAndSettle(required(buttonContaining(dialog, "Configure 2 services"), "Configure action"));

		const configure = required(dialog.querySelector(".streaming-hierarchy-configure"), "Configure stage");
		const configureRow = required(configure.querySelector(`[data-streaming-provider="${providerIds[0]}"]`), "Configure provider row");
		const previewTrigger = required(configureRow.querySelector('button[aria-haspopup="dialog"]'), "Preview trigger");
		const configureState = {
			focusEntered: document.activeElement === configure.querySelector("#streaming-hierarchy-configure-title"),
			popularDefault: configure.querySelector('input[name="streaming-hierarchy-sort"][value="popular"]')?.checked === true,
			groupedDefault: configure.querySelector('input[name="streaming-hierarchy-grouping"][value="group-by-service"]')?.checked === true,
			groupingChoices: [...configure.querySelectorAll('input[name="streaming-hierarchy-grouping"]')].map((input) => input.value),
			runSummary: required(configure.querySelector('[aria-label="Streaming run context"]'), "Configure run summary").textContent.replace(/\s+/g, " ").trim(),
			requestsBeforeExplicitPreview: requests.length,
		};
		const configureLayout = stageLayout(dialog);
		let livePreview = null;
		if (runLivePreview) {
			previewTrigger.focus({ preventScroll: true });
			failedImageSources.clear();
			await clickAndSettle(previewTrigger);
			const movieAu = await waitForPreview(0, `Live Streaming Movies AU at ${window.innerWidth}px`);
			const regionTabs = required(movieAu.modal.querySelector('[role="tablist"][aria-label="Preview region"]'), "Preview region tabs");
			const mediaTabs = required(movieAu.modal.querySelector('[role="tablist"][aria-label="Preview media"]'), "Preview media tabs");
			await clickAndSettle(required(buttonContaining(regionTabs, "US"), "US Preview tab"));
			const movieUs = await waitForPreview(1, `Live Streaming Movies US at ${window.innerWidth}px`);
			await clickAndSettle(required(buttonContaining(mediaTabs, "Series"), "Series Preview tab"));
			const seriesUs = await waitForPreview(2, `Live Streaming Series US at ${window.innerWidth}px`);
			await clickAndSettle(required(seriesUs.modal.querySelector("header button"), "Preview Close action"));
			livePreview = {
				movieAu: { request: requestEvidence(movieAu.request), preview: movieAu.evidence },
				movieUs: { request: requestEvidence(movieUs.request), preview: movieUs.evidence },
				seriesUs: { request: requestEvidence(seriesUs.request), preview: seriesUs.evidence },
				requestCount: requests.length,
				closed: document.querySelector(".streaming-hierarchy-preview-modal") === null,
				exactFocusRestored: document.activeElement === previewTrigger,
			};
		}

		await clickAndSettle(required(buttonContaining(dialog, "Continue to Review"), "Review action"));
		let review = required(dialog.querySelector(".streaming-hierarchy-review"), "Review stage");
		const reviewFocusEntered = document.activeElement === review.querySelector("#streaming-hierarchy-review-title");
		const initialDestinationRadios = [...review.querySelectorAll('input[name="streaming-hierarchy-destination"]')];
		const initialNewDestination = required(review.querySelector("[data-streaming-destination-new]"), "New Collection destination card");
		const initialDestination = {
			stageKicker: review.querySelector(".add-source-section-heading .panel-kicker")?.textContent.trim() ?? null,
			heading: review.querySelector("#streaming-hierarchy-review-title")?.textContent.trim() ?? null,
			headerDescription: dialog.querySelector(".add-source-heading-description")?.textContent.trim() ?? null,
			candidateCards: [...review.querySelectorAll("[data-streaming-destination-candidate]")].map((label) => ({
				label: label.querySelector("strong")?.textContent.trim() ?? null,
				delta: label.querySelector("small")?.textContent.trim() ?? null,
				contents: label.querySelector(".streaming-destination-contents")?.textContent.trim() ?? null,
			})),
			helper: review.querySelector(".streaming-destination-choice > div > p")?.textContent.trim() ?? null,
			newOption: {
				label: initialNewDestination.querySelector("strong")?.textContent.trim() ?? null,
				count: initialNewDestination.querySelector("small")?.textContent.trim() ?? null,
				description: initialNewDestination.querySelector(":scope > span > span")?.textContent.trim() ?? null,
			},
			noneSelected: initialDestinationRadios.every((input) => !input.checked),
			primaryDisabled: required(dialog.querySelector(".add-source-actions .editor-apply"), "destination-required action").disabled,
			primaryLabel: dialog.querySelector(".add-source-actions .editor-apply").textContent.trim(),
			overlapText: required(review.querySelector('[data-streaming-overlap="partial"]'), "partial overlap evidence").textContent.replace(/\s+/g, " ").trim(),
		};
		await clickAndSettle(required(review.querySelector('input[name="streaming-hierarchy-destination"][value="new"]'), "New Collection destination"));
		review = required(dialog.querySelector(".streaming-hierarchy-review"), "New Collection Review");
		let newFolderNames = required(review.querySelector(".streaming-folder-names"), "New Collection folder names");
		await clickAndSettle(required(newFolderNames.querySelector("summary"), "New Collection Folder names summary"));
		let newCollectionName = required(review.querySelector("#streaming-collection-name"), "new Collection name");
		let newAppleName = required(review.querySelector("#streaming-folder-name-2"), "new Apple folder name");
		let newDekkooName = required(review.querySelector("#streaming-folder-name-444"), "new Dekkoo folder name");
		await act(async () => {
			setInputValue(newCollectionName, "Custom Collection");
			setInputValue(newAppleName, "Curated Apple New");
			setInputValue(newDekkooName, "Curated Dekkoo");
			await afterCommittedEffects();
		});
		const hideCollectionTitle = required(review.querySelector('[data-editor-control="streamingHideNuvioTitle"]'), "Hide Collection title switch");
		await clickAndSettle(hideCollectionTitle);
		review = required(dialog.querySelector(".streaming-hierarchy-review"), "hidden Collection Review");
		newCollectionName = required(review.querySelector("#streaming-collection-name"), "hidden Collection name");
		const collectionHidden = newCollectionName.value === "" && newCollectionName.disabled;
		const collectionHiddenHelp = review.querySelector("#streaming-collection-title-hidden-help")?.textContent.trim() === "The collection title is intentionally invisible in Nuvio. Turn off the setting below to enter a visible title.";
		await clickAndSettle(required(review.querySelector('[data-editor-control="streamingHideNuvioTitle"]'), "Show Collection title switch"));
		review = required(dialog.querySelector(".streaming-hierarchy-review"), "restored Collection Review");
		newCollectionName = required(review.querySelector("#streaming-collection-name"), "restored Collection name");
		const collectionRestored = newCollectionName.value === "Custom Collection" && !newCollectionName.disabled;
		const collectionHiddenHelpRemoved = review.querySelector("#streaming-collection-title-hidden-help") === null;
		await act(async () => { setInputValue(newCollectionName, "Custom Collection 2"); await afterCommittedEffects(); });
		await clickAndSettle(required(review.querySelector('[data-editor-control="streamingHideNuvioTitle"]'), "rehide Collection title switch"));
		review = required(dialog.querySelector(".streaming-hierarchy-review"), "rehidden Collection Review");
		await clickAndSettle(required(review.querySelector('[data-editor-control="streamingHideNuvioTitle"]'), "reshow Collection title switch"));
		review = required(dialog.querySelector(".streaming-hierarchy-review"), "second restored Collection Review");
		newCollectionName = required(review.querySelector("#streaming-collection-name"), "second restored Collection name");
		const latestCollectionRestored = newCollectionName.value === "Custom Collection 2" && !newCollectionName.disabled;
		await clickAndSettle(required(review.querySelector('input[name="streaming-folder-title-visibility"][value="HIDE_EVERYWHERE"]'), "Hide Folder titles everywhere option"));
		review = required(dialog.querySelector(".streaming-hierarchy-review"), "hidden Folder-title Review");
		newAppleName = required(review.querySelector("#streaming-folder-name-2"), "hidden Apple folder name");
		newDekkooName = required(review.querySelector("#streaming-folder-name-444"), "hidden Dekkoo folder name");
		const folderHidden = [newAppleName, newDekkooName].every((input) => input.value === "" && input.disabled);
		const folderHiddenHelp = review.querySelector("#streaming-folder-titles-hidden-help")?.textContent.trim() === "Folder titles are intentionally invisible everywhere in Nuvio. Choose a visible option below to enter visible titles.";
		const planningLabelsRetained = [...review.querySelectorAll(".streaming-folder-name-field > label")].map((label) => label.textContent.trim()).join("|") === providerNames.join("|");
		await clickAndSettle(required(review.querySelector('input[name="streaming-folder-title-visibility"][value="HIDE_HOME_SCREEN"]'), "Hide Folder titles on home only option"));
		review = required(dialog.querySelector(".streaming-hierarchy-review"), "home-only Folder-title Review");
		newAppleName = required(review.querySelector("#streaming-folder-name-2"), "home-only Apple folder name");
		newDekkooName = required(review.querySelector("#streaming-folder-name-444"), "home-only Dekkoo folder name");
		const folderHomeOnlyRestored = newAppleName.value === "Curated Apple New" && !newAppleName.disabled && newDekkooName.value === "Curated Dekkoo" && !newDekkooName.disabled;
		const folderHiddenHelpRemovedOnHomeOnly = review.querySelector("#streaming-folder-titles-hidden-help") === null;
		const titleVisibility = { collectionHidden, collectionHiddenHelp, collectionRestored, collectionHiddenHelpRemoved, latestCollectionRestored, folderHidden, folderHiddenHelp, folderHomeOnlyRestored, folderHiddenHelpRemovedOnHomeOnly, planningLabelsRetained };
		const newCollectionDraftState = {
			stageKicker: review.querySelector(".add-source-section-heading .panel-kicker")?.textContent.trim() ?? null,
			heading: review.querySelector("#streaming-hierarchy-review-title")?.textContent.trim() ?? null,
			headerDescription: dialog.querySelector(".add-source-heading-description")?.textContent.trim() ?? null,
			collectionNameVisible: review.querySelector("#streaming-collection-name") !== null,
			folderNameCount: Number(review.querySelector(".streaming-folder-names")?.dataset.streamingFolderNameCount),
			apple: newAppleName.value,
			dekkoo: newDekkooName.value,
		};
		await clickAndSettle(required(review.querySelector(`input[name="streaming-hierarchy-destination"][value="existing:${collectionResult.createdInternalId}"]`), "primary existing destination"));
		review = required(dialog.querySelector(".streaming-hierarchy-review"), "existing destination Review");
		let folderNames = required(review.querySelector(".streaming-folder-names"), "new-folder names disclosure");
		await clickAndSettle(required(folderNames.querySelector("summary"), "Folder names summary"));
		let dekkooName = required(folderNames.querySelector("#streaming-folder-name-444"), "Dekkoo folder name");
		const existingDestinationState = {
			collectionNameAbsent: review.querySelector("#streaming-collection-name") === null,
			folderNameCount: Number(folderNames.dataset.streamingFolderNameCount),
			appleInputAbsent: review.querySelector("#streaming-folder-name-2") === null,
			dekkooDraftPreserved: dekkooName.value === "Curated Dekkoo",
			destinationSummary: review.querySelector(".franchise-inherited-summary span")?.textContent.replace(/\s+/g, " ").trim() ?? null,
		};
		await clickAndSettle(required(review.querySelector('input[name="streaming-hierarchy-destination"][value="new"]'), "return to New Collection destination"));
		review = required(dialog.querySelector(".streaming-hierarchy-review"), "restored New Collection Review");
		newFolderNames = required(review.querySelector(".streaming-folder-names"), "restored New Collection folder names");
		await clickAndSettle(required(newFolderNames.querySelector("summary"), "restored New Collection Folder names summary"));
		newAppleName = required(review.querySelector("#streaming-folder-name-2"), "restored new Apple folder name");
		newDekkooName = required(review.querySelector("#streaming-folder-name-444"), "restored new Dekkoo folder name");
		const newCollectionDraftsRestored = newAppleName.value === "Curated Apple New" && newDekkooName.value === "Curated Dekkoo" && review.querySelector("#streaming-collection-name") !== null;
		await clickAndSettle(required(review.querySelector(`input[name="streaming-hierarchy-destination"][value="existing:${collectionResult.createdInternalId}"]`), "final existing destination"));
		review = required(dialog.querySelector(".streaming-hierarchy-review"), "final existing destination Review");
		folderNames = required(review.querySelector(".streaming-folder-names"), "final new-folder names disclosure");
		await clickAndSettle(required(folderNames.querySelector("summary"), "Folder names summary"));
		dekkooName = required(folderNames.querySelector("#streaming-folder-name-444"), "Dekkoo folder name");
		await act(async () => { setInputValue(dekkooName, ""); await afterCommittedEffects(); });
		const invalidNameBlocked = required(dialog.querySelector(".add-source-actions .editor-apply"), "invalid-name Apply action").disabled === true && dekkooName.getAttribute("aria-invalid") === "true";
		await act(async () => { setInputValue(dekkooName, "Curated Dekkoo"); await afterCommittedEffects(); });
		const preApplyUnchanged = controller.getState().revision === initialRevision && controller.getState().project === initialProject;
		await clickAndSettle(required(dialog.querySelector('[data-action="back-to-streaming-review"]'), "Review Back action"));
		await clickAndSettle(required(buttonContaining(dialog, "Continue to Review"), "Return to Review action"));
		review = required(dialog.querySelector(".streaming-hierarchy-review"), "returned Review stage");
		await clickAndSettle(required(review.querySelector(".streaming-folder-names summary"), "returned Folder names summary"));
		dekkooName = required(review.querySelector("#streaming-folder-name-444"), "returned Dekkoo folder name");
		const customNamePreservedAfterBack = dekkooName.value === "Curated Dekkoo";
		const outcomeRows = [...review.querySelectorAll(".streaming-review-row")].map((row) => ({ status: row.dataset.placementStatus, text: row.textContent.replace(/\s+/g, " ").trim() }));
		const reviewState = {
			focusEntered: reviewFocusEntered,
			initialDestination,
			newCollectionDraftState,
			titleVisibility,
			existingDestinationState,
			newCollectionDraftsRestored,
			planTotals: [...review.querySelectorAll(".decades-plan-totals strong")].map((node) => Number(node.textContent)),
			runSummary: required(review.querySelector('[aria-label="Streaming configuration summary"]'), "Review run summary").textContent.replace(/\s+/g, " ").trim(),
			changeHeading: review.querySelector("#streaming-change-summary-title")?.textContent.trim() ?? null,
			outcomeRows,
			folderNameCount: Number(review.querySelector(".streaming-folder-names")?.dataset.streamingFolderNameCount),
			invalidNameBlocked,
			customNamePreservedAfterBack,
			textOnlyNoteAbsent: !review.textContent.includes("Generated folders are text-only") && !review.textContent.includes("Provider logos are used only while choosing and reviewing services"),
			providerLogoAbsent: review.querySelector("img") === null,
			createAction: buttonContaining(dialog, "Apply changes")?.textContent.trim() ?? null,
		};
		const reviewLayout = stageLayout(dialog);
		await clickAndSettle(required(buttonContaining(dialog, "Apply changes"), "Apply changes action"));
		const appliedCollection = controller.getState().project.collections.find((collection) => collection.internalId === collectionResult.createdInternalId);
		const secondaryCollectionAfter = controller.getState().project.collections.find((collection) => collection.internalId === secondaryCollectionResult.createdInternalId);
		const tertiaryCollectionAfter = controller.getState().project.collections.find((collection) => collection.internalId === tertiaryCollectionResult.createdInternalId);
		const appliedExistingFolder = appliedCollection.folders[0];
		const appliedNewFolder = appliedCollection.folders[1];
		return {
			width: window.innerWidth,
			providerIds,
			providerNames,
			regionFocus,
			providerFocus,
			regionSelectionVisual,
			mediaSelectionRetention,
			layouts: { regions: regionLayout, providers: providerLayout, configure: configureLayout, review: reviewLayout },
			configure: configureState,
			review: reviewState,
			livePreview,
			applyCalls,
			preApplyUnchanged,
			appliedRevisionDelta: controller.getState().revision - initialRevision,
			appliedFolders: appliedCollection.folders.map((folder) => ({ title: folder.editable.title, sources: folder.sources.map((source) => source.editable.title) })),
			collectionCount: controller.getState().project.collections.length,
			secondaryCollectionUnchanged: JSON.stringify(secondaryCollectionAfter) === secondaryCollectionBefore,
			tertiaryCollectionUnchanged: JSON.stringify(tertiaryCollectionAfter) === tertiaryCollectionBefore,
			existingArtworkPreserved: Object.entries(existingAppleArtwork).every(([field, value]) => appliedExistingFolder.editable[field] === value),
			newArtworkUnassigned: Object.keys(existingAppleArtwork).every((field) => !Object.hasOwn(appliedNewFolder.editable, field)),
		};
	} finally {
		document.removeEventListener("error", recordFailedPoster, true);
		await act(async () => { root.unmount(); await afterCommittedEffects(); });
		host.remove();
	}
}

async function runStreamingAffinityDestinationScenario() {
	const controller = createController();
	const imported = controller.importValue([{
		id: "owner-streaming",
		title: "Streaming Services",
		backdropImageUrl: "https://image.example/owner-collection-backdrop.jpg",
		pinToTop: true,
		focusGlowEnabled: false,
		viewMode: "TABBED_GRID",
		showAllTab: true,
		ownerCollectionFlag: "preserve-collection",
		folders: [{
			id: "owner-netflix",
			title: "Netflix",
			hideTitle: true,
			tileShape: "LANDSCAPE",
			coverImageUrl: "https://image.example/netflix-cover.jpg",
			heroBackdropUrl: "https://image.example/netflix-hero.jpg",
			titleLogoUrl: "https://image.example/netflix-logo.png",
			focusGifUrl: "https://image.example/netflix-focus.gif",
			focusGifEnabled: true,
			ownerFolderFlag: "preserve-netflix",
			sources: [
				{ provider: "tmdb", title: "Netflix curated list", tmdbSourceType: "LIST", tmdbId: 8115, mediaType: "MOVIE", sortBy: "CUSTOM" },
				{ provider: "trakt", title: "Netflix Trakt list", type: "movie", catalogId: "netflix-owner-list", ownerTraktFlag: true },
				{
					provider: "tmdb",
					title: "Netflix rich Movie Discover",
					tmdbSourceType: "DISCOVER",
					tmdbId: null,
					mediaType: "MOVIE",
					sortBy: "popularity.desc",
					filters: { withWatchProviders: "8|1796", watchRegion: "US", withGenres: "18|35", withKeywords: "123|456", voteAverageGte: 7, voteCountGte: 200, releaseDateGte: "2020-01-01" },
					ownerSourceFlag: "preserve-rich-discover",
				},
			],
		}, {
			id: "owner-apple",
			title: "Apple TV+",
			hideTitle: false,
			tileShape: "POSTER",
			coverImageUrl: "https://image.example/apple-cover.jpg",
			sources: [
				{ provider: "tmdb", title: "Apple TV+ preserved alias Discover", tmdbSourceType: "DISCOVER", tmdbId: null, mediaType: "MOVIE", sortBy: "vote_count.desc", filters: { with_watch_providers: "350", watch_region: "US", withGenres: "18" } },
				{ provider: "tmdb", title: "Apple TV+ network Series", tmdbSourceType: "DISCOVER", tmdbId: null, mediaType: "TV", sortBy: "popularity.desc", filters: { withNetworks: "2552", voteCountGte: 50 } },
				{ provider: "tmdb", title: "Apple TV+ list", tmdbSourceType: "LIST", tmdbId: 9001, mediaType: "TV", sortBy: "CUSTOM" },
			],
		}],
	}]);
	if (!imported.ok) throw new Error(`Mounted Streaming affinity import failed: ${imported.errors?.[0]?.message ?? "unknown import error"}`);
	const initialProject = controller.getState().project;
	const initialCollection = initialProject.collections[0];
	const initialCollectionEditable = JSON.stringify(initialCollection.editable);
	const initialCollectionRaw = JSON.stringify(initialCollection.raw);
	const initialFolders = new Map(initialCollection.folders.map((folder) => [folder.internalId, JSON.stringify(folder)]));
	const initialSerializedValue = serializedValue(controller);
	const initialSerializedFolders = JSON.stringify(controller.serializeProject().value[0].folders);
	const initialRevision = controller.getState().revision;
	const catalogueProvider = {
		async loadCatalogue() {
			return Object.freeze({ ok: true, data: Object.freeze({
				regions: Object.freeze([{ code: "AU", name: "Australia" }]),
				providers: Object.freeze([{ id: 283, name: "Crunchyroll", searchName: "crunchyroll", logoPath: null, moviePriorities: Object.freeze({ AU: 1 }), tvPriorities: Object.freeze({ AU: 1 }) }]),
			}) });
		},
	};
	let applyCalls = 0;
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	await act(async () => {
		root.render(createElement(CreationDialog, {
			scope: "new-collection",
			project: initialProject,
			projectRevision: initialRevision,
			currentYear: 2026,
			initialOptionId: "streaming-services",
			streamingCatalogueProvider: catalogueProvider,
			streamingPreviewProvider: { getStreamingPreview() { throw new Error("Affinity destination scenario must not request Preview."); } },
			onCancel() {},
			onCreateBlank() {},
			onApplyStreaming(plan) { applyCalls += 1; return applyStreamingHierarchyPlan(controller, plan); },
		}));
		await afterCommittedEffects();
	});
	function required(element, label) {
		if (!element) throw new Error(`Mounted Streaming affinity ${label} is missing.`);
		return element;
	}
	function stageLayout(dialog) {
		const scroll = required(dialog.querySelector(".add-source-scroll"), "scroll owner");
		const primary = required(dialog.querySelector(".add-source-actions .editor-apply"), "primary action");
		const primaryRect = primary.getBoundingClientRect();
		const activeScrollOwners = [...dialog.querySelectorAll("*")].filter((element) => {
			const overflowY = getComputedStyle(element).overflowY;
			return ["auto", "scroll"].includes(overflowY) && element.scrollHeight > element.clientHeight + 1;
		}).length;
		return {
			singleInnerScroll: dialog.querySelectorAll(".add-source-scroll").length === 1 && ["auto", "scroll"].includes(getComputedStyle(scroll).overflowY),
			oneActiveScrollOwner: activeScrollOwners <= 1,
			noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth && dialog.scrollWidth <= dialog.clientWidth && scroll.scrollWidth <= scroll.clientWidth,
			primaryReachable: visibleElement(primary) && primaryRect.height >= 44 && primaryRect.left >= -1 && primaryRect.right <= window.innerWidth + 1,
		};
	}
	try {
		const dialog = required(document.querySelector('[data-creation-dialog="true"]'), "dialog");
		await clickAndSettle(await waitForMountedCondition(() => dialog.querySelector('[data-streaming-region="AU"]'), { label: "Streaming affinity AU Region", timeoutMs: 10_000 }));
		await clickAndSettle(required(buttonContaining(dialog, "Choose services for 1 region"), "Region action"));
		await clickAndSettle(await waitForMountedCondition(() => dialog.querySelector('[data-streaming-provider="283"]'), { label: "Streaming affinity Crunchyroll provider", timeoutMs: 10_000 }));
		await clickAndSettle(required(buttonContaining(dialog, "Configure 1 service"), "Configure action"));
		await clickAndSettle(required(buttonContaining(dialog, "Continue to Review"), "Review action"));

		let review = required(dialog.querySelector(".streaming-hierarchy-review"), "destination Review");
		const candidate = required(review.querySelector("[data-streaming-destination-candidate]"), "affinity destination card");
		const newDestination = required(review.querySelector("[data-streaming-destination-new]"), "New Collection card");
		const initialChoice = {
			candidateCount: review.querySelectorAll("[data-streaming-destination-candidate]").length,
			label: candidate.querySelector("strong")?.textContent.trim() ?? null,
			kind: candidate.querySelector(".streaming-destination-affinity")?.textContent.trim() ?? null,
			delta: candidate.querySelector("small")?.textContent.trim() ?? null,
			contents: candidate.querySelector(".streaming-destination-contents")?.textContent.trim() ?? null,
			newOption: {
				label: newDestination.querySelector("strong")?.textContent.trim() ?? null,
				count: newDestination.querySelector("small")?.textContent.trim() ?? null,
				description: newDestination.querySelector(":scope > span > span")?.textContent.trim() ?? null,
			},
			noneSelected: [...review.querySelectorAll('input[name="streaming-hierarchy-destination"]')].every((input) => !input.checked),
			primaryDisabled: required(dialog.querySelector(".add-source-actions .editor-apply"), "destination-required action").disabled,
		};
		await clickAndSettle(required(candidate.querySelector('input[name="streaming-hierarchy-destination"]'), "affinity destination choice"));
		review = required(dialog.querySelector(".streaming-hierarchy-review"), "selected Review");
		const reviewState = {
			heading: review.querySelector("#streaming-change-summary-title")?.textContent.trim() ?? null,
			planTotals: [...review.querySelectorAll(".decades-plan-totals strong")].map((node) => Number(node.textContent)),
			outcomes: [...review.querySelectorAll(".streaming-review-row")].map((row) => ({ status: row.dataset.placementStatus, text: row.textContent.replace(/\s+/g, " ").trim() })),
			collectionSettings: review.querySelector(".franchise-inherited-summary")?.textContent.replace(/\s+/g, " ").trim() ?? null,
			applyLabel: buttonContaining(dialog, "Create folder")?.textContent.trim() ?? null,
		};
		const layout = stageLayout(dialog);
		const preApply = {
			revisionDelta: controller.getState().revision - initialRevision,
			serializedUnchanged: serializedValue(controller) === initialSerializedValue,
			applyCalls,
		};
		await clickAndSettle(required(buttonContaining(dialog, "Create folder"), "Create folder action"));

		const appliedRevisionDelta = controller.getState().revision - initialRevision;
		const appliedCollection = controller.getState().project.collections[0];
		const existingFoldersPreserved = appliedCollection.folders.slice(0, initialCollection.folders.length).every((folder) => initialFolders.get(folder.internalId) === JSON.stringify(folder));
		const newFolder = appliedCollection.folders.at(-1);
		const serializedFolders = controller.serializeProject().value[0].folders;
		return {
			width: window.innerWidth,
			initialChoice,
			review: reviewState,
			layout,
			preApply,
			applyCalls,
			revisionDelta: appliedRevisionDelta,
			collectionCount: controller.getState().project.collections.length,
			collectionIdentityRetained: appliedCollection.internalId === initialCollection.internalId,
			collectionEditablePreserved: JSON.stringify(appliedCollection.editable) === initialCollectionEditable,
			collectionRawPreserved: JSON.stringify(appliedCollection.raw) === initialCollectionRaw,
			existingFoldersPreserved,
			serializedExistingFoldersPreserved: JSON.stringify(serializedFolders.slice(0, initialCollection.folders.length)) === initialSerializedFolders,
			newFolder: {
				title: newFolder?.editable.title ?? null,
				sources: newFolder?.sources.map((source) => [source.editable.title, source.editable.filters.watchRegion, source.editable.mediaType]) ?? [],
				artworkUnassigned: ["coverImageUrl", "heroBackdropUrl", "titleLogoUrl", "focusGifUrl", "focusGifEnabled"].every((field) => !Object.hasOwn(newFolder?.editable ?? {}, field)),
			},
		};
	} finally {
		await act(async () => { root.unmount(); await afterCommittedEffects(); });
		host.remove();
	}
}

async function runStreamingSelectionReconciliationScenario() {
	const provider = (id, name, movieRegions, tvRegions) => Object.freeze({
		id,
		name,
		searchName: name.toLowerCase(),
		logoPath: null,
		moviePriorities: Object.freeze(Object.fromEntries(movieRegions.map((code, index) => [code, id + index]))),
		tvPriorities: Object.freeze(Object.fromEntries(tvRegions.map((code, index) => [code, id + index]))),
	});
	const netflix = provider(8, "Netflix", ["AU", "US"], ["AU", "US"]);
	const c = provider(30, "C Both", ["AU", "US"], ["AU", "US"]);
	const a = provider(31, "A Movies AU", ["AU"], []);
	const b = provider(32, "B Both", ["AU", "US"], ["AU", "US"]);
	const auOnly = provider(33, "AU Only Both", ["AU"], ["AU"]);
	const movieOne = provider(34, "Movie One", ["AU"], []);
	const movieTwo = provider(35, "Movie Two", ["AU"], []);
	const providers = Object.freeze([netflix, c, a, b, auOnly, movieOne, movieTwo]);
	const catalogueProvider = {
		async loadCatalogue() {
			return Object.freeze({ ok: true, data: Object.freeze({
				regions: Object.freeze([{ code: "AU", name: "Australia" }, { code: "US", name: "United States" }]),
				providers,
			}) });
		},
	};
	const controller = createController();
	const initialProject = controller.getState().project;
	const initialRevision = controller.getState().revision;
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	await act(async () => {
		root.render(createElement(CreationDialog, {
			scope: "new-collection",
			project: initialProject,
			projectRevision: initialRevision,
			currentYear: 2026,
			initialOptionId: "streaming-services",
			streamingCatalogueProvider: catalogueProvider,
			streamingPreviewProvider: { getStreamingPreview() { throw new Error("Selection reconciliation must not request Preview."); } },
			onCancel() {},
			onCreateBlank() {},
			onApplyStreaming() { throw new Error("Selection reconciliation must not apply a project change."); },
		}));
		await afterCommittedEffects();
	});
	function required(element, label) {
		if (!element) throw new Error(`Mounted Streaming reconciliation ${label} is missing.`);
		return element;
	}
	const selectedNames = (dialog) => [...dialog.querySelectorAll(".streaming-selected-disclosure li strong")].map((node) => node.textContent.trim());
	const selectedCount = (dialog) => Number((dialog.querySelector(".streaming-selected-tray .people-selected-summary > strong")?.textContent.match(/^\d+/) ?? ["0"])[0]);
	const noticeText = (dialog) => dialog.querySelector("[data-streaming-selection-reconciliation]")?.textContent.trim() ?? null;
	const card = async (dialog, id) => waitForMountedCondition(() => dialog.querySelector(`[data-streaming-provider="${id}"]`), { label: `Streaming reconciliation provider ${id}`, timeoutMs: 10_000 });
	function stageLayout(dialog) {
		const scroll = required(dialog.querySelector(".add-source-scroll"), "scroll owner");
		const primary = required(dialog.querySelector(".add-source-actions .editor-apply"), "primary action");
		const primaryRect = primary.getBoundingClientRect();
		const activeScrollOwners = [...dialog.querySelectorAll("*")].filter((element) => {
			const overflowY = getComputedStyle(element).overflowY;
			return ["auto", "scroll"].includes(overflowY) && element.scrollHeight > element.clientHeight + 1;
		}).length;
		return {
			singleInnerScroll: ["auto", "scroll"].includes(getComputedStyle(scroll).overflowY),
			oneActiveScrollOwner: activeScrollOwners <= 1,
			noHorizontalOverflow: dialog.scrollWidth <= dialog.clientWidth && scroll.scrollWidth <= scroll.clientWidth,
			primaryReachable: visibleElement(primary) && primaryRect.height >= 44 && primaryRect.left >= 0 && primaryRect.right <= window.innerWidth,
		};
	}
	try {
		const dialog = required(document.querySelector('[data-creation-dialog="true"]'), "dialog");
		await clickAndSettle(await waitForMountedCondition(() => dialog.querySelector('[data-streaming-region="AU"]'), { label: "Streaming reconciliation AU Region", timeoutMs: 10_000 }));
		await clickAndSettle(required(buttonContaining(dialog, "Choose services for 1 region"), "Region action"));

		await clickAndSettle(await card(dialog, netflix.id));
		await clickAndSettle(required(dialog.querySelector('input[name="streaming-hierarchy-media"][value="series"]'), "Series Media"));
		const ownerSeries = {
			selectedNames: selectedNames(dialog),
			selectedCount: selectedCount(dialog),
			cardSelected: dialog.querySelector(`[data-streaming-provider="${netflix.id}"] input`)?.checked === true,
			notice: noticeText(dialog),
			continueEnabled: required(dialog.querySelector(".add-source-actions .editor-apply"), "Configure action").disabled === false,
		};
		await clickAndSettle(required(buttonContaining(dialog, "Configure 1 service"), "Netflix Series Configure action"));
		const configure = required(dialog.querySelector(".streaming-hierarchy-configure"), "Netflix Series Configure");
		ownerSeries.configureSeriesOnly = configure.textContent.includes("AU · Series") && required(configure.querySelector('[aria-label="Streaming run context"]'), "Series run summary").textContent.includes("MediaSeries");
		await clickAndSettle(required(dialog.querySelector('[data-action="back-to-streaming-configure"]'), "Configure Back"));
		await clickAndSettle(required(dialog.querySelector('input[name="streaming-hierarchy-media"][value="both"]'), "Both Media"));
		await clickAndSettle(required(dialog.querySelector('input[name="streaming-hierarchy-media"][value="movies"]'), "Movies Media"));
		const ownerMovies = {
			selectedNames: selectedNames(dialog),
			selectedCount: selectedCount(dialog),
			cardSelected: dialog.querySelector(`[data-streaming-provider="${netflix.id}"] input`)?.checked === true,
			notice: noticeText(dialog),
			continueEnabled: required(dialog.querySelector(".add-source-actions .editor-apply"), "Movies Configure action").disabled === false,
		};

		await clickAndSettle(await card(dialog, netflix.id));
		for (const selectedProvider of [c, a, b]) await clickAndSettle(await card(dialog, selectedProvider.id));
		await clickAndSettle(required(dialog.querySelector('input[name="streaming-hierarchy-media"][value="both"]'), "Both pruning Media"));
		const somePruned = {
			selectedNames: selectedNames(dialog),
			selectedCount: selectedCount(dialog),
			notice: noticeText(dialog),
			retainedCardsSelected: [c, b].every((selectedProvider) => dialog.querySelector(`[data-streaming-provider="${selectedProvider.id}"] input`)?.checked === true),
			removedCardAbsent: dialog.querySelector(`[data-streaming-provider="${a.id}"]`) === null,
		};

		await clickAndSettle(required(dialog.querySelector('input[name="streaming-hierarchy-media"][value="movies"]'), "Movies all-pruned setup"));
		for (const selectedProvider of [c, b]) await clickAndSettle(await card(dialog, selectedProvider.id));
		for (const selectedProvider of [movieOne, movieTwo]) await clickAndSettle(await card(dialog, selectedProvider.id));
		await clickAndSettle(required(dialog.querySelector('input[name="streaming-hierarchy-media"][value="series"]'), "Series all-pruned Media"));
		const allPruned = {
			selectedNames: selectedNames(dialog),
			selectedCount: selectedCount(dialog),
			notice: noticeText(dialog),
			disclosureAbsent: dialog.querySelector(".streaming-selected-disclosure") === null,
			continueDisabled: required(dialog.querySelector(".add-source-actions .editor-apply"), "disabled Configure action").disabled === true,
		};

		await clickAndSettle(required(dialog.querySelector('input[name="streaming-hierarchy-media"][value="both"]'), "Both Region setup Media"));
		for (const selectedProvider of [c, auOnly]) await clickAndSettle(await card(dialog, selectedProvider.id));
		await clickAndSettle(required(dialog.querySelector('[data-action="back-to-streaming-providers"]'), "Provider Back"));
		await clickAndSettle(required(dialog.querySelector('[data-streaming-region="US"]'), "add US Region"));
		const restrictedNotice = noticeText(dialog);
		await clickAndSettle(required(buttonContaining(dialog, "Choose services for 2 regions"), "two-Region action"));
		const regionRestricted = {
			selectedNames: selectedNames(dialog),
			selectedCount: selectedCount(dialog),
			notice: noticeText(dialog) ?? restrictedNotice,
			retainedCardSelected: dialog.querySelector(`[data-streaming-provider="${c.id}"] input`)?.checked === true,
			removedCardAbsent: dialog.querySelector(`[data-streaming-provider="${auOnly.id}"]`) === null,
		};
		await clickAndSettle(required(dialog.querySelector('[data-action="back-to-streaming-providers"]'), "two-Region Provider Back"));
		await clickAndSettle(required(dialog.querySelector('[data-streaming-region="US"]'), "remove US Region"));
		const relaxedNoticeAbsent = noticeText(dialog) === null;
		await clickAndSettle(required(buttonContaining(dialog, "Choose services for 1 region"), "relaxed Region action"));
		const regionRelaxed = {
			selectedNames: selectedNames(dialog),
			selectedCount: selectedCount(dialog),
			notice: noticeText(dialog),
			retainedCardSelected: dialog.querySelector(`[data-streaming-provider="${c.id}"] input`)?.checked === true,
			relaxedNoticeAbsent,
		};

		for (const selectedProvider of [b, netflix]) await clickAndSettle(await card(dialog, selectedProvider.id));
		await clickAndSettle(required(buttonContaining(dialog, "Configure 3 services"), "three-service Configure action"));
		await clickAndSettle(required(buttonContaining(dialog, "Continue to Review"), "three-service Review action"));
		const review = required(dialog.querySelector(".streaming-hierarchy-review"), "three-folder Review");
		const folderNames = required(review.querySelector(".streaming-folder-names"), "Folder names section");
		await clickAndSettle(required(folderNames.querySelector("summary"), "Folder names summary"));
		const folderInputs = [...folderNames.querySelectorAll(".streaming-folder-name-field input")];
		const scroll = required(dialog.querySelector(".add-source-scroll"), "scroll surface");
		await act(async () => { scroll.scrollTop = scroll.scrollHeight; await afterCommittedEffects(); });
		const finalInput = required(folderInputs.at(-1), "final Folder input");
		const footer = required(dialog.querySelector(".add-source-actions"), "fixed action footer");
		const folderNameCleanup = {
			summary: folderNames.querySelector("summary")?.textContent.trim() ?? null,
			sectionHelper: folderNames.querySelector(":scope > .studio-configure-helper")?.textContent.trim() ?? null,
			inputCount: folderInputs.length,
			perFolderHelperCount: folderNames.querySelectorAll(".streaming-folder-name-field .editor-field-help").length,
			finalInputAboveFooter: finalInput.getBoundingClientRect().bottom <= footer.getBoundingClientRect().top + 1,
		};
		return {
			width: window.innerWidth,
			ownerSeries,
			ownerMovies,
			somePruned,
			allPruned,
			regionRestricted,
			regionRelaxed,
			folderNameCleanup,
			layout: stageLayout(dialog),
			noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth,
			projectUnchanged: controller.getState().project === initialProject && controller.getState().revision === initialRevision,
		};
	} finally {
		await act(async () => { root.unmount(); await afterCommittedEffects(); });
		host.remove();
	}
}

async function runStreamingDuplicateConfirmationScenario() {
	const controller = createController();
	const existing = controller.createCollection({ editable: { title: "Existing Streaming", viewMode: "ROWS", showAllTab: true, pinToTop: false } });
	const folder = controller.createFolder(existing.createdInternalId, { editable: { title: "Custom Netflix folder", tileShape: "POSTER", hideTitle: false } });
	const sources = [
		{ category: "native-tmdb", editable: streamingSource({ title: "Custom Netflix films", mediaType: "MOVIE" }) },
		{ category: "native-tmdb", editable: streamingSource({ title: "Custom Netflix shows", mediaType: "TV" }) },
	];
	if (!controller.addSourcesToFolder(folder.createdInternalId, { sources }).ok) throw new Error("Mounted Streaming duplicate setup failed.");
	const initialProject = controller.getState().project;
	const initialRevision = controller.getState().revision;
	let applyCalls = 0;
	const catalogueProvider = {
		async loadCatalogue() {
			return Object.freeze({ ok: true, data: Object.freeze({
				regions: Object.freeze([{ code: "AU", name: "Australia" }]),
				providers: Object.freeze([{ id: 8, name: "Netflix", searchName: "netflix", logoPath: null, moviePriorities: Object.freeze({ AU: 1 }), tvPriorities: Object.freeze({ AU: 1 }) }]),
			}) });
		},
	};
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	await act(async () => {
		root.render(createElement(CreationDialog, {
			scope: "new-collection",
			project: initialProject,
			projectRevision: initialRevision,
			currentYear: 2026,
			initialOptionId: "streaming-services",
			streamingCatalogueProvider: catalogueProvider,
			streamingPreviewProvider: { getStreamingPreview() { throw new Error("Preview must remain lazy."); } },
			onCancel() {},
			onCreateBlank() {},
			onApplyStreaming(plan) { applyCalls += 1; return applyStreamingHierarchyPlan(controller, plan); },
		}));
		await afterCommittedEffects();
	});
	function required(element, label) {
		if (!element) throw new Error(`Mounted Streaming duplicate ${label} is missing.`);
		return element;
	}
	try {
		const dialog = required(document.querySelector('[data-creation-dialog="true"]'), "dialog");
		const au = await waitForMountedCondition(() => dialog.querySelector('[data-streaming-region="AU"]'), { label: "duplicate AU region", timeoutMs: 10_000 });
		await clickAndSettle(au);
		await clickAndSettle(required(buttonContaining(dialog, "Choose services for 1 region"), "region action"));
		const provider = await waitForMountedCondition(() => dialog.querySelector('[data-streaming-provider="8"]'), { label: "duplicate Netflix provider", timeoutMs: 10_000 });
		await clickAndSettle(provider);
		await clickAndSettle(required(buttonContaining(dialog, "Configure 1 service"), "Configure action"));
		await clickAndSettle(required(buttonContaining(dialog, "Continue to Review"), "Review action"));
		let review = required(dialog.querySelector(".streaming-hierarchy-review"), "Review");
		const evidence = required(review.querySelector('[data-streaming-overlap="complete"]'), "complete overlap evidence");
		const initialPrimary = required(buttonContaining(dialog, "Choose a destination"), "destination-required action");
		const initialNewDestination = required(review.querySelector("[data-streaming-destination-new]"), "New Collection destination card");
		const initialChoice = {
			candidateCount: review.querySelectorAll("[data-streaming-destination-candidate]").length,
			candidateLabel: review.querySelector("[data-streaming-destination-candidate] strong")?.textContent.trim() ?? null,
			candidateDelta: review.querySelector("[data-streaming-destination-candidate] small")?.textContent.trim() ?? null,
			newOption: {
				label: initialNewDestination.querySelector("strong")?.textContent.trim() ?? null,
				count: initialNewDestination.querySelector("small")?.textContent.trim() ?? null,
				description: initialNewDestination.querySelector(":scope > span > span")?.textContent.trim() ?? null,
			},
			noneSelected: [...review.querySelectorAll('input[name="streaming-hierarchy-destination"]')].every((input) => !input.checked),
			primaryDisabled: initialPrimary.disabled,
		};
		await clickAndSettle(required(review.querySelector(`input[name="streaming-hierarchy-destination"][value="existing:${existing.createdInternalId}"]`), "complete existing destination"));
		review = required(dialog.querySelector(".streaming-hierarchy-review"), "zero-change Review");
		const zeroPrimary = required(buttonContaining(dialog, "Close"), "zero-change Close action");
		const zeroChange = {
			message: required(review.querySelector(".streaming-nothing-to-add"), "Nothing to add state").textContent.replace(/\s+/g, " ").trim(),
			primaryLabel: zeroPrimary.textContent.trim(),
			primaryEnabled: !zeroPrimary.disabled,
			applyCalls,
			revisionUnchanged: controller.getState().revision === initialRevision,
			sameProject: controller.getState().project === initialProject,
			collectionNameAbsent: review.querySelector("#streaming-collection-name") === null,
		};
		await clickAndSettle(required(review.querySelector('input[name="streaming-hierarchy-destination"][value="new"]'), "duplicate New Collection destination"));
		review = required(dialog.querySelector(".streaming-hierarchy-review"), "duplicate New Collection Review");
		const primary = required(buttonContaining(dialog, "Create duplicate collection"), "duplicate Create action");
		const duplicateChoice = {
			collectionNameVisible: review.querySelector("#streaming-collection-name") !== null,
			primaryLabel: primary.textContent.trim(),
		};
		await clickAndSettle(primary);
		let confirmation = await waitForMountedCondition(() => document.querySelector(".streaming-duplicate-confirmation"), { label: "duplicate confirmation", timeoutMs: 10_000 });
		const beforeConfirmation = { applyCalls, revision: controller.getState().revision, sameProject: controller.getState().project === initialProject };
		await clickAndSettle(required(buttonContaining(confirmation, "Cancel"), "confirmation Cancel"));
		const cancelRestoredFocus = document.activeElement === primary;
		await clickAndSettle(primary);
		confirmation = await waitForMountedCondition(() => document.querySelector(".streaming-duplicate-confirmation"), { label: "second duplicate confirmation", timeoutMs: 10_000 });
		await clickAndSettle(required(confirmation.querySelector('[data-action="create-duplicate-streaming-collection"]'), "duplicate Create action"));
		return {
			evidenceText: evidence.textContent.replace(/\s+/g, " ").trim(),
			initialChoice,
			zeroChange,
			duplicateChoice,
			beforeConfirmation,
			cancelRestoredFocus,
			applyCalls,
			revisionDelta: controller.getState().revision - initialRevision,
			collectionCount: controller.getState().project.collections.length,
		};
	} finally {
		await act(async () => { root.unmount(); await afterCommittedEffects(); });
		host.remove();
	}
}

async function runNetworkHierarchyScenario() {
	let previewCalls = 0;
	let artworkLoads = 0;
	let artworkResolves = 0;
	let artworkLoadSucceeded = false;
	let applyCalls = 0;
	const resolvedArtwork = [];
	const previewProvider = {
		getNetworkPreview() {
			previewCalls += 1;
			return new Promise(() => {});
		},
	};
	const artworkRuntimeClient = {
		async load() {
			artworkLoads += 1;
			const result = await liveNetworkArtworkRuntimeClient.load();
			artworkLoadSucceeded = true;
			return result;
		},
		async resolve(input) {
			artworkResolves += 1;
			const result = await liveNetworkArtworkRuntimeClient.resolve(input);
			resolvedArtwork.push({
				entityType: input.entityType,
				tmdbId: input.tmdbId,
				orientation: input.orientation,
				status: result.status,
				assetUrl: result.assetUrl ?? null,
			});
			return result;
		},
	};
	const controller = createController();
	const initialProject = controller.getState().project;
	const initialRevision = controller.getState().revision;
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	await act(async () => {
		root.render(createElement(CreationDialog, {
			scope: "new-collection",
			project: initialProject,
			projectRevision: initialRevision,
			currentYear: 2026,
			initialOptionId: "networks",
			networkCatalogueProvider: liveNetworkCatalogueProvider,
			networkPreviewProvider: previewProvider,
			networkArtworkRuntimeClient: artworkRuntimeClient,
			onCancel() {},
			onCreateBlank() {},
			onApplyNetworks() { applyCalls += 1; return { ok: true }; },
		}));
		await afterCommittedEffects();
	});
	function required(element, label) {
		if (element === null || element === undefined) throw new Error(`Mounted Network ${label} is missing.`);
		return element;
	}
	function seriesCount(card) {
		const text = card.querySelector(".network-result-count")?.textContent ?? "";
		const match = /^Series Count: ([\d,]+)$/.exec(text.trim());
		return match ? Number(match[1].replaceAll(",", "")) : null;
	}
	function stageLayout(dialog) {
		const scrollElements = [...dialog.querySelectorAll(".add-source-scroll")];
		const verticalScrollOwners = [...dialog.querySelectorAll("*")].filter((element) => {
			const overflowY = getComputedStyle(element).overflowY;
			return (overflowY === "auto" || overflowY === "scroll") && element.scrollHeight > element.clientHeight + 1;
		}).length;
		const primary = required(dialog.querySelector(".add-source-actions .editor-apply"), "primary action");
		const primaryRect = primary.getBoundingClientRect();
		return {
			singleInnerScroll: scrollElements.length === 1 && ["auto", "scroll"].includes(getComputedStyle(scrollElements[0]).overflowY),
			oneActiveScrollOwner: verticalScrollOwners <= 1,
			noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth && dialog.scrollWidth <= dialog.clientWidth && scrollElements[0].scrollWidth <= scrollElements[0].clientWidth,
			primaryReachable: visibleElement(primary) && primaryRect.height >= 44 && primaryRect.left >= 0 && primaryRect.right <= window.innerWidth,
		};
	}
	try {
		const dialog = required(document.querySelector('[data-creation-dialog="true"]'), "creation dialog");
		const query = required(dialog.querySelector("#network-source-query"), "Search input");
		const initialSearchFocus = {
			searchFocused: document.activeElement === query,
			autoFocusAttributeAbsent: query.autofocus === false && !query.hasAttribute("autofocus"),
			keyboardTargetAbsent: document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA",
		};
		const initialCards = await waitForMountedCondition(
			() => {
				const cards = [...dialog.querySelectorAll("[data-tmdb-network-result]")];
				return cards.length === 20 ? cards : null;
			},
			{ label: "checked-in Network catalogue browse results", timeoutMs: 10_000 },
		);
		const filterGroup = required(dialog.querySelector('[role="group"][aria-label="Series Count filter"]'), "Series Count filters");
		const filterButtons = [...filterGroup.querySelectorAll("button")];
		const orderGroup = required(dialog.querySelector('[role="group"][aria-label="Network result order"]'), "result order controls");
		const orderButtons = [...orderGroup.querySelectorAll("button")];
		const alphabetical = required(buttonContaining(orderGroup, "A–Z"), "A–Z result order");
		const mostSeries = required(buttonContaining(orderGroup, "Most series"), "Most series result order");
		const allCounts = initialCards.map(seriesCount);
		const search = {
			focus: initialSearchFocus,
			filterLabels: filterButtons.map((button) => button.textContent.trim()),
			orderLabels: orderButtons.map((button) => button.textContent.trim()),
			allDefault: filterButtons[0]?.getAttribute("aria-pressed") === "true",
			mostSeriesDefault: mostSeries.getAttribute("aria-pressed") === "true" && alphabetical.getAttribute("aria-pressed") === "false",
			pageSize: initialCards.length,
			countsShown: allCounts.every((count) => Number.isSafeInteger(count) && count >= 0),
			countsDescending: allCounts.every((count, index) => index === 0 || allCounts[index - 1] >= count),
			knownZeroShownByAll: allCounts.includes(0),
			previewAbsent: dialog.querySelector('[data-network-preview-backdrop="true"]') === null,
			previewCalls,
		};
		const nextPage = required(buttonContaining(dialog.querySelector('[aria-label="Network search result pages"]'), "Next page"), "Next page action");
		await clickAndSettle(nextPage);
		await waitForMountedCondition(
			() => dialog.querySelector("#network-results-title")?.parentElement?.parentElement?.textContent.includes("Page 2 of"),
			{ label: "Network browse page 2" },
		);
		await clickAndSettle(alphabetical);
		await waitForMountedCondition(
			() => alphabetical.getAttribute("aria-pressed") === "true"
				&& dialog.querySelector("#network-results-title")?.parentElement?.parentElement?.textContent.includes("Page 1 of"),
			{ label: "A–Z Network order and page reset" },
		);
		search.knownZeroShownByAll = [...dialog.querySelectorAll("[data-tmdb-network-result]")].map(seriesCount).includes(0);
		const fiveHundred = required(buttonContaining(filterGroup, "500+"), "500+ Series Count filter");
		await clickAndSettle(fiveHundred);
		const thresholdCards = await waitForMountedCondition(
			() => {
				const cards = [...dialog.querySelectorAll("[data-tmdb-network-result]")];
				const counts = cards.map(seriesCount);
				const pageReset = dialog.querySelector("#network-results-title")?.parentElement?.parentElement?.textContent.includes("Page 1 of");
				return fiveHundred.getAttribute("aria-pressed") === "true" && pageReset && cards.length === 20 && counts.every((count) => count >= 500) ? cards : null;
			},
			{ label: "500+ checked-in Network results and page reset", timeoutMs: 10_000 },
		);
		const firstSelectedCard = required(thresholdCards.find((card) => card.dataset.tmdbNetworkResult === "2"), "TMDB Network 2 result");
		await clickAndSettle(firstSelectedCard);
		await waitForMountedCondition(
			() => dialog.querySelectorAll(".network-selected-disclosure li").length === 1,
			{ label: "first native Network selection" },
		);
		const excludeZero = required(buttonContaining(filterGroup, "Exclude 0"), "Exclude 0 Series Count filter");
		await clickAndSettle(excludeZero);
		await waitForMountedCondition(
			() => {
				const cards = [...dialog.querySelectorAll("[data-tmdb-network-result]")];
				const counts = cards.map(seriesCount);
				return excludeZero.getAttribute("aria-pressed") === "true" && cards.length === 20 && counts.every((count) => count !== 0) && counts.some((count) => count < 500) ? cards : null;
			},
			{ label: "Exclude 0 checked-in Network results" },
		);
		const selectionPreservedAcrossFilter = dialog.querySelectorAll(".network-selected-disclosure li").length === 1;
		await act(async () => {
			setInputValue(query, "18");
			await afterCommittedEffects();
		});
		const secondSelectedCard = await waitForMountedCondition(
			() => dialog.querySelector('[data-tmdb-network-result="18"]'),
			{ label: "checked-in TMDB Network 18 result", timeoutMs: 10_000 },
		);
		await clickAndSettle(secondSelectedCard);
		await waitForMountedCondition(
			() => dialog.querySelectorAll(".network-selected-disclosure li").length === 2,
			{ label: "second native Network selection" },
		);
		await act(async () => {
			setInputValue(query, "");
			await afterCommittedEffects();
		});
		await waitForMountedCondition(
			() => dialog.querySelectorAll("[data-tmdb-network-result]").length === 20
				&& alphabetical.getAttribute("aria-pressed") === "true"
				&& excludeZero.getAttribute("aria-pressed") === "true",
			{ label: "restored A–Z filtered Network browse" },
		);
		await clickAndSettle(required(buttonContaining(dialog.querySelector('[aria-label="Network search result pages"]'), "Next page"), "restoration Next page action"));
		await waitForMountedCondition(
			() => dialog.querySelector("#network-results-title")?.parentElement?.parentElement?.textContent.includes("Page 2 of"),
			{ label: "Network restoration page 2" },
		);
		const selectScroll = required(dialog.querySelector(".add-source-scroll"), "Select scroll owner");
		selectScroll.scrollTop = Math.min(180, selectScroll.scrollHeight - selectScroll.clientHeight);
		const expectedSearchScrollTop = selectScroll.scrollTop;
		const selectLayout = stageLayout(dialog);
		const selection = {
			selectedCount: dialog.querySelectorAll(".network-selected-disclosure li").length,
			nativeCheckboxes: [firstSelectedCard, secondSelectedCard].every((card) => card.tagName === "LABEL" && card.querySelector('input[type="checkbox"]')?.checked === true),
			selectedSurfaces: [firstSelectedCard, secondSelectedCard].every((card) => card.classList.contains("is-selected") && getComputedStyle(card).boxShadow !== "none"),
			markersAbsent: [firstSelectedCard, secondSelectedCard].every((card) => card.querySelector('[data-selection-indicator], .selectable-card-indicator') === null),
			selectionPreservedAcrossFilter,
			filterPreserved: excludeZero.getAttribute("aria-pressed") === "true",
		};

		await clickAndSettle(required(buttonContaining(dialog, "Configure 2 Networks"), "Configure action"));
		let configure = required(dialog.querySelector(".network-hierarchy-configure"), "Configure stage");
		await clickAndSettle(required(dialog.querySelector('[data-action="back-to-network-selection"]'), "Back to Network selection"));
		const restoration = await waitForMountedCondition(() => {
			const restoredQuery = dialog.querySelector("#network-source-query");
			const restoredFilterGroup = dialog.querySelector('[role="group"][aria-label="Series Count filter"]');
			const restoredOrderGroup = dialog.querySelector('[role="group"][aria-label="Network result order"]');
			const restoredScroll = dialog.querySelector(".add-source-scroll");
			const state = {
				query: restoredQuery?.value,
				pageTwo: dialog.querySelector("#network-results-title")?.parentElement?.parentElement?.textContent.includes("Page 2 of") === true,
				filter: buttonContaining(restoredFilterGroup, "Exclude 0")?.getAttribute("aria-pressed") === "true",
				order: buttonContaining(restoredOrderGroup, "A–Z")?.getAttribute("aria-pressed") === "true",
				selectedCount: dialog.querySelectorAll(".network-selected-disclosure li").length,
				scroll: restoredScroll !== null && Math.abs(restoredScroll.scrollTop - expectedSearchScrollTop) <= 1,
			};
			return state.query === ""
				&& state.pageTwo
				&& state.filter
				&& state.order
				&& state.selectedCount === 2
				&& state.scroll
				? state
				: null;
		}, { label: "restored Network Search state" });
		await clickAndSettle(required(buttonContaining(dialog, "Configure 2 Networks"), "restored Configure action"));
		configure = required(dialog.querySelector(".network-hierarchy-configure"), "restored Configure stage");
		const configureRows = [...configure.querySelectorAll(".network-configure-row")];
		const configureLayout = stageLayout(dialog);
		const configureState = {
			rowIds: configureRows.map((row) => Number(row.dataset.networkId)),
			focusEntered: document.activeElement === configure.querySelector("#network-hierarchy-configure-title"),
			catalogueCountsPresent: configureRows.every((row) => /Series Count: [\d,]+/.test(row.textContent)),
			exactCountsAbsent: configureRows.every((row) => !row.textContent.includes("Exact Series Count:")),
			previewActions: configureRows.filter((row) => row.querySelector('button[aria-haspopup="dialog"]')).length,
			previewModalAbsent: document.querySelector('[data-network-preview-backdrop="true"]') === null,
			previewCalls,
			popularDefault: configure.querySelector('input[name="network-hierarchy-sort"][value="popular"]')?.checked === true,
			sortLabels: [...configure.querySelectorAll('input[name="network-hierarchy-sort"]')].map((input) => input.closest("label")?.querySelector("span")?.textContent.trim()),
		};
		await clickAndSettle(required(configure.querySelector('input[name="network-hierarchy-sort"][value="recent"]'), "Recent sort"));
		configureState.sortChangeRequestFree = previewCalls === 0;
		await clickAndSettle(required(buttonContaining(dialog, "Continue to Appearance"), "Appearance action"));
		const appearance = await waitForMountedCondition(
			() => {
				const stage = dialog.querySelector(".network-hierarchy-appearance");
				const action = buttonContaining(dialog, "Create collection");
				return stage && action && !action.disabled && !stage.textContent.includes("Preparing folder artwork") ? stage : null;
			},
			{ label: "production Network Poster artwork preparation", timeoutMs: 20_000 },
		);
		const poster = required(appearance.querySelector('input[name="network-folder-artwork"][value="POSTER"]'), "Poster artwork choice");
		const landscape = required(appearance.querySelector('input[name="network-folder-artwork"][value="LANDSCAPE"]'), "Landscape artwork choice");
		const posterDefault = poster.checked === true && landscape.checked === false;
		const posterBatch = {
			loads: artworkLoads,
			resolves: artworkResolves,
			orientations: resolvedArtwork.map((result) => result.orientation),
			loadSucceeded: artworkLoadSucceeded,
		};
		await clickAndSettle(landscape);
		await waitForMountedCondition(
			() => landscape.checked === true
				&& !appearance.textContent.includes("Preparing folder artwork")
				&& buttonContaining(dialog, "Create collection")?.disabled === false
				&& artworkResolves === 4,
			{ label: "production Network Landscape artwork preparation", timeoutMs: 20_000 },
		);
		const appearanceLayout = stageLayout(dialog);
		const appearanceState = {
			heading: appearance.querySelector("h3")?.textContent.trim(),
			planTotals: [...appearance.querySelectorAll(".decades-plan-totals strong")].map((node) => Number(node.textContent)),
			posterDefault,
			landscapeSelected: landscape.checked === true && poster.checked === false,
			previewAbsent: appearance.querySelector('button[aria-haspopup="dialog"]') === null && document.querySelector('[data-network-preview-backdrop="true"]') === null,
			previewCalls,
		};
		return {
			width: window.innerWidth,
			search,
			filters: {
				pageReset: true,
				orderPageReset: true,
				fiveHundredCounts: thresholdCards.map(seriesCount),
				excludeZeroActive: selection.filterPreserved,
			},
			selection,
			restoration,
			configure: configureState,
			appearance: appearanceState,
			artwork: {
				posterBatch,
				loads: artworkLoads,
				resolves: artworkResolves,
				orientations: resolvedArtwork.map((result) => result.orientation),
				entityTypes: [...new Set(resolvedArtwork.map((result) => result.entityType))],
				ids: [...new Set(resolvedArtwork.map((result) => result.tmdbId))],
				productionAssetUrls: resolvedArtwork.filter((result) => result.assetUrl !== null).every((result) => result.assetUrl.startsWith("https://raw.githubusercontent.com/davecollections/nuvio-assets/")),
				loadSucceeded: artworkLoadSucceeded,
			},
			layout: { select: selectLayout, configure: configureLayout, appearance: appearanceLayout },
			previewCalls,
			applyCalls,
			revisionUnchanged: controller.getState().revision === initialRevision && controller.getState().project === initialProject,
		};
	} finally {
		await act(async () => { root.unmount(); await afterCommittedEffects(); });
		host.remove();
	}
}

async function runNetworkDeferredArtworkScenario() {
	let previewCalls = 0;
	let applyCalls = 0;
	let artworkLoads = 0;
	let artworkResolves = 0;
	let releaseArtwork;
	let markArtworkStarted;
	const artworkGate = new Promise((resolve) => { releaseArtwork = resolve; });
	const artworkStarted = new Promise((resolve) => { markArtworkStarted = resolve; });
	const previewProvider = {
		getNetworkPreview() {
			previewCalls += 1;
			return new Promise(() => {});
		},
	};
	const artworkRuntimeClient = {
		async load() {
			artworkLoads += 1;
			markArtworkStarted();
			await artworkGate;
			return liveNetworkArtworkRuntimeClient.load();
		},
		async resolve(input) {
			artworkResolves += 1;
			return liveNetworkArtworkRuntimeClient.resolve(input);
		},
	};
	const controller = createController();
	const initialProject = controller.getState().project;
	const initialRevision = controller.getState().revision;
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	await act(async () => {
		root.render(createElement(CreationDialog, {
			scope: "new-collection",
			project: initialProject,
			projectRevision: initialRevision,
			currentYear: 2026,
			initialOptionId: "networks",
			networkCatalogueProvider: liveNetworkCatalogueProvider,
			networkPreviewProvider: previewProvider,
			networkArtworkRuntimeClient: artworkRuntimeClient,
			onCancel() {},
			onCreateBlank() {},
			onApplyNetworks() { applyCalls += 1; return { ok: true }; },
		}));
		await afterCommittedEffects();
	});
	const required = (element, label) => {
		if (!element) throw new Error(`Mounted deferred Network ${label} is missing.`);
		return element;
	};
	try {
		const dialog = required(document.querySelector('[data-creation-dialog="true"]'), "creation dialog");
		const query = required(dialog.querySelector("#network-source-query"), "Search input");
		await act(async () => {
			setInputValue(query, "2");
			await afterCommittedEffects();
		});
		const card = await waitForMountedCondition(
			() => dialog.querySelector('[data-tmdb-network-result="2"]'),
			{ label: "checked-in deferred Network selection", timeoutMs: 10_000 },
		);
		await clickAndSettle(card);
		await clickAndSettle(required(buttonContaining(dialog, "Configure 1 Network"), "Configure action"));
		const configure = required(dialog.querySelector(".network-hierarchy-configure"), "Configure stage");
		const configureShell = required(configure.parentElement, "Configure interaction shell");
		const popular = required(configure.querySelector('input[name="network-hierarchy-sort"][value="popular"]'), "Popular sort");
		const recent = required(configure.querySelector('input[name="network-hierarchy-sort"][value="recent"]'), "Recent sort");
		const preview = required(configure.querySelector('button[aria-haspopup="dialog"]'), "Preview action");
		const remove = required(configure.querySelector(".network-configure-row .studio-configure-remove"), "Remove action");
		const back = required(dialog.querySelector('[data-action="back-to-network-selection"]'), "Back action");
		const continueAction = required(buttonContaining(dialog, "Continue to Appearance"), "Appearance action");
		preview.focus({ preventScroll: true });
		const focusBeforePreparation = document.activeElement === preview;
		await act(async () => {
			continueAction.click();
			await artworkStarted;
			await afterCommittedEffects();
		});
		const preparing = {
			stageStayedConfigure: dialog.querySelector('[data-network-hierarchy-stage="configure"]') !== null,
			ariaBusy: configureShell.getAttribute("aria-busy") === "true",
			inert: configureShell.hasAttribute("inert"),
			primaryDisabled: continueAction.disabled === true,
			primaryLabel: continueAction.textContent.trim(),
			backDisabled: back.disabled === true,
			focusBeforePreparation,
		};
		await clickAndSettle(recent);
		await clickAndSettle(preview);
		await clickAndSettle(remove);
		await clickAndSettle(back);
		const locked = {
			popularPreserved: popular.checked === true && recent.checked === false,
			previewCalls,
			previewModalAbsent: document.querySelector('[data-network-preview-backdrop="true"]') === null,
			selectionPreserved: configure.querySelectorAll(".network-configure-row").length === 1,
			stageStayedConfigure: dialog.querySelector('[data-network-hierarchy-stage="configure"]') !== null,
		};
		await act(async () => {
			releaseArtwork();
			await afterCommittedEffects();
		});
		const appearance = await waitForMountedCondition(
			() => {
				const stage = dialog.querySelector(".network-hierarchy-appearance");
				return stage && buttonContaining(dialog, "Create collection")?.disabled === false ? stage : null;
			},
			{ label: "unchanged deferred Network snapshot", timeoutMs: 20_000 },
		);
		return {
			preparing,
			locked,
			completion: {
				unchangedSnapshotAdvanced: dialog.querySelector('[data-network-hierarchy-stage="appearance"]') !== null,
				planTotals: [...appearance.querySelectorAll(".decades-plan-totals strong")].map((node) => Number(node.textContent)),
				posterPreserved: appearance.querySelector('input[name="network-folder-artwork"][value="POSTER"]')?.checked === true,
				focusEnteredAppearance: document.activeElement === appearance.querySelector("#network-hierarchy-appearance-title"),
				previewModalAbsent: document.querySelector('[data-network-preview-backdrop="true"]') === null,
			},
			artworkLoads,
			artworkResolves,
			previewCalls,
			applyCalls,
			revisionUnchanged: controller.getState().revision === initialRevision && controller.getState().project === initialProject,
		};
	} finally {
		releaseArtwork();
		await act(async () => { root.unmount(); await afterCommittedEffects(); });
		host.remove();
	}
}

async function runStudioScaleScenario() {
	const studios = Array.from({ length: 100 }, (_, index) => mountedStudio(index + 1));
	let previewRequests = 0;
	let applyCalls = 0;
	let artworkLoads = 0;
	let artworkResolves = 0;
	const controller = createController();
	const initialRevision = controller.getState().revision;
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	await act(async () => {
		root.render(createElement(CreationDialog, {
			scope: "new-collection",
			project: controller.getState().project,
			projectRevision: initialRevision,
			currentYear: 2026,
			initialOptionId: "studios",
			studioCatalogueProvider: studioCatalogueProvider(studios),
			studioPreviewProvider: { async getStudioPreview() { previewRequests += 1; throw new Error("Scale Preview must stay explicit."); } },
			studioArtworkRuntimeClient: {
				async load() { artworkLoads += 1; },
				async resolve() { artworkResolves += 1; return { status: "missing" }; },
			},
			onCancel() {},
			onCreateBlank() {},
			onApplyStudios() { applyCalls += 1; return { ok: false, errors: [{ message: "Mounted rollback-free apply probe." }] }; },
		}));
		await afterCommittedEffects();
	});
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 320));
		await afterCommittedEffects();
	});
	try {
		const dialog = document.querySelector('[data-creation-dialog="true"]');
		const required = (element, label) => {
			if (!element) throw new Error(`Mounted Studio scale ${label} is missing.`);
			return element;
		};
		const cards = [...dialog.querySelectorAll(".studio-result-selectable")];
		const afterBrowse = previewRequests;
		for (const card of cards) await clickAndSettle(card);
		const afterSelection = previewRequests;
		const selectedCount = Number.parseInt(dialog.querySelector(".people-selected-summary > strong")?.textContent ?? "0", 10);
		const noticeAt100 = dialog.querySelector('[data-large-selection-notice="true"]')?.textContent.includes("100 Studios") === true;
		await clickAndSettle(required(buttonContaining(dialog, "Configure 100 Studios"), `Configure action after ${selectedCount} selections`));
		const afterConfigure = previewRequests;
		await clickAndSettle(required(dialog.querySelector('input[name="studio-hierarchy-media"][value="both"]'), "Movies plus Series choice"));
		const configureRows = dialog.querySelectorAll(".studio-configure-row").length;
		await clickAndSettle(required(buttonContaining(dialog, "Continue to Appearance"), "Appearance action"));
		const afterAppearance = previewRequests;
		const totals = [...dialog.querySelectorAll(".decades-plan-totals strong")].map((element) => Number(element.textContent));
		const appearanceRows = dialog.querySelectorAll(".studio-configure-row, .studio-review-list details").length;
		await clickAndSettle(required(buttonContaining(dialog, "Create collection"), `Create action with totals ${totals.join("/")}`));
		return {
			cards: cards.length,
			selectedCount,
			noticeAt100,
			requests: { afterBrowse, afterSelection, afterConfigure, afterAppearance, afterApply: previewRequests },
			artworkLoads,
			artworkResolves,
			totals,
			configureRows,
			appearanceRows,
			applyCalls,
			revisionUnchanged: controller.getState().revision === initialRevision,
			oneScrollOwner: dialog.querySelectorAll(".add-source-scroll").length === 1,
			noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth && dialog.scrollWidth <= dialog.clientWidth,
		};
	} finally {
		await act(async () => { root.unmount(); await afterCommittedEffects(); });
		host.remove();
	}
}

async function runPeopleConfigureLayoutScenario() {
	const personIds = [31, 40];
	const requests = [];
	const provider = createTmdbPersonProvider({ fetchImpl: recordingFetch(requests) });
	const controller = createController();
	const initialProject = controller.getState().project;
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	await act(async () => {
		root.render(createElement(PeopleSourceFlow, {
			context: "hierarchy",
			hierarchyScope: "new-collection",
			provider,
			manifestClient: livePeopleManifestClient,
			project: initialProject,
			projectRevision: controller.getState().revision,
			collection: null,
			onBack() {},
			onCancel() {},
			onApply() { return { ok: true }; },
		}));
		await afterCommittedEffects();
	});
	function selectedCombinationIds(row) {
		return [...row.querySelectorAll('.people-source-pill input:checked')].map((input) => input.closest("label")?.textContent.trim().replace(/^✓/, "").replace(/\d+$/, "").trim());
	}
	function required(element, label) {
		if (element === null || element === undefined) throw new Error(`Mounted People ${label} is missing.`);
		return element;
	}
	try {
		const query = document.querySelector("#people-source-query");
		let selectionAffordance = null;
		for (const [index, personId] of personIds.entries()) {
			await act(async () => {
				setInputValue(query, String(personId));
				await afterCommittedEffects();
			});
			const resultInput = await waitForMountedCondition(
				() => document.querySelector(`[data-tmdb-person-result="${personId}"] input[type="checkbox"]`),
				{ label: `Live TMDB Person ${personId} result`, timeoutMs: 15_000 },
			);
			if (personId === 31) {
				const card = required(resultInput.closest("label"), "selectable result card");
				const markerAbsent = card.querySelector('[data-selection-indicator], .selectable-card-indicator') === null;
				resultInput.focus();
				const keyboardFocusable = document.activeElement === resultInput && resultInput.tabIndex === 0;
				const focusOwnedByCard = keyboardFocusable
					&& resultInput.parentElement === card;
				const inputRect = resultInput.getBoundingClientRect();
				const inputVisuallyHidden = resultInput.classList.contains("choice-card-input") && inputRect.width <= 1 && inputRect.height <= 1;
				await clickAndSettle(card);
				const selectedStyle = getComputedStyle(card);
				selectionAffordance = {
					nativeCheckbox: resultInput.type === "checkbox",
					keyboardFocusable,
					inputVisuallyHidden,
					focusOwnedByCard,
					markerAbsent,
					cardClickToggled: resultInput.checked === true,
					accessibleChecked: resultInput.checked === true,
					selectedCard: card.classList.contains("is-selected"),
					borderRetained: selectedStyle.borderColor !== "rgba(0, 0, 0, 0)",
					structuralInset: selectedStyle.boxShadow !== "none",
				};
			} else await clickAndSettle(resultInput);
			await waitForMountedCondition(
				() => document.querySelectorAll(".people-selected-summary .removable-selection-disclosure li").length === index + 1,
				{ label: `Live TMDB Person ${personId} selection`, timeoutMs: 15_000 },
			);
		}
		const configureButton = buttonContaining(document, "Configure 2 people");
		if (configureButton === null) throw new Error("Mounted People Configure action did not render.");
		await clickAndSettle(configureButton);
		const dialog = await waitForMountedCondition(() => {
			const candidate = document.querySelector('[data-people-context="hierarchy"][data-add-source-step="configure"]');
			return candidate?.querySelectorAll(".people-bulk-row").length === 2 ? candidate : null;
		}, { label: "Mounted People Configure stage with two selected rows" });
		const rows = [...dialog.querySelectorAll(".people-bulk-row")];
		const firstRow = rows[0];
		const secondRow = rows[1];
		const firstDirectedMovies = [...firstRow.querySelectorAll("label")].find((label) => label.textContent.includes("Directed Movies"))?.querySelector("input");
		await clickAndSettle(required(firstDirectedMovies, "first Directed Movies choice"));
		const automaticOverride = {
			automaticActive: inputContaining(dialog, "Automatic")?.checked === true,
			customAbsent: inputContaining(dialog, "Custom per person") === null,
			notificationAbsent: dialog.querySelector(".people-mode-transition") === null,
			firstSelections: selectedCombinationIds(firstRow),
			secondSelections: selectedCombinationIds(secondRow),
		};

		await clickAndSettle(required(inputContaining(dialog, "Same for all"), "Same for all mode"));
		const sharedVisible = dialog.querySelectorAll(".people-bulk-controls > .people-combination-group .people-source-pill").length === 4;
		const sharedGroup = required(dialog.querySelector(".people-bulk-controls > .people-combination-group"), "shared source choices");
		const sharedDirectedMovies = [...sharedGroup.querySelectorAll("label")].find((label) => label.textContent.includes("Directed Movies"))?.querySelector("input");
		const sharedDirectedSeries = [...sharedGroup.querySelectorAll("label")].find((label) => label.textContent.includes("Directed Series"))?.querySelector("input");
		await clickAndSettle(required(sharedDirectedMovies, "shared Directed Movies choice"));
		await clickAndSettle(required(sharedDirectedSeries, "shared Directed Series choice"));
		const afterSharedChanges = rows.map(selectedCombinationIds);
		const secondDirectedSeries = [...secondRow.querySelectorAll("label")].find((label) => label.textContent.includes("Directed Series"))?.querySelector("input");
		await clickAndSettle(required(secondDirectedSeries, "second Directed Series override"));
		const sharedOverride = {
			sharedVisible,
			sharedModeActive: inputContaining(dialog, "Same for all")?.checked === true,
			customAbsent: inputContaining(dialog, "Custom per person") === null,
			notificationAbsent: dialog.querySelector(".people-mode-transition") === null,
			existingOverridePreserved: JSON.stringify(afterSharedChanges[0]) === JSON.stringify(["Acting Movies", "Acting Series", "Directed Movies"]),
			sharedChangesReachedUnmodified: JSON.stringify(afterSharedChanges[1]) === JSON.stringify(["Acting Movies", "Acting Series", "Directed Movies", "Directed Series"]),
			firstSelections: selectedCombinationIds(firstRow),
			secondSelections: selectedCombinationIds(secondRow),
		};

		const recentSort = dialog.querySelector('input[name="people-hierarchy-sort"][value="recent"]');
		if (recentSort === null) throw new Error(`Mounted People Recent sort missing at ${dialog.dataset.addSourceStep}: ${dialog.innerHTML.slice(-1200)}`);
		await clickAndSettle(required(recentSort, "Recent sort"));
		const pillGroups = [...dialog.querySelectorAll(".people-bulk-row .people-combination-group > div")];
		const firstGroupStyle = getComputedStyle(pillGroups[0]);
		const pillColumns = firstGroupStyle.gridTemplateColumns.split(" ").filter(Boolean).length;
		const pillsFit = pillGroups.every((group) => {
			const groupRect = group.getBoundingClientRect();
			return [...group.querySelectorAll(".people-source-pill")].every((pill) => {
				const rect = pill.getBoundingClientRect();
				return rect.left >= groupRect.left - 1 && rect.right <= groupRect.right + 1;
			});
		});
		const peopleList = dialog.querySelector(".people-bulk-list");
		const continueButton = buttonContaining(dialog, "Continue");
		const continueRect = continueButton.getBoundingClientRect();
		const scrollOwners = [...dialog.querySelectorAll("*")].filter((element) => {
			const overflowY = getComputedStyle(element).overflowY;
			return (overflowY === "auto" || overflowY === "scroll") && element.scrollHeight > element.clientHeight + 1;
		}).length;
		const layout = {
			width: window.innerWidth,
			modeChoices: dialog.querySelectorAll('input[name="people-configuration-mode"]').length,
			helperCopyAbsent: dialog.querySelector(".people-bulk-guidance, .add-source-heading-description") === null,
			rowCount: rows.length,
			pillCount: dialog.querySelectorAll(".people-bulk-row .people-source-pill").length,
			pillColumns,
			pillsFit,
			sortChoices: dialog.querySelectorAll('input[name="people-hierarchy-sort"]').length,
			previewActions: dialog.querySelectorAll(".people-bulk-actions button:first-child").length,
			listBounded: getComputedStyle(peopleList).overflowY === "auto" && peopleList.clientHeight >= 92 && peopleList.clientHeight < dialog.clientHeight,
			continueReachable: continueRect.top >= -1 && continueRect.bottom <= window.innerHeight + 1 && continueRect.height >= 44,
			noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth && dialog.scrollWidth <= dialog.clientWidth,
			noNestedScrollTrap: scrollOwners <= 1,
		};

		const previewTrigger = firstRow.querySelector(".people-bulk-actions button:first-child");
		const requestsBeforePreview = requests.length;
		await clickAndSettle(required(previewTrigger, "first Preview titles action"));
		const expectedPosterCount = 10;
		const readyMoviePosters = await waitForReadyPosterGrid({
			preview: ".people-title-preview",
			gridSelector: ".people-title-preview-grid",
			expectedVisibleCount: expectedPosterCount,
			expectedSelectedTab: "Movies",
			label: `Live People Movies Preview at ${window.innerWidth}px`,
		});
		let preview = readyMoviePosters.preview;
		let previewGrid = readyMoviePosters.grid;
		const previewBackdrop = preview.closest(".nested-modal-backdrop");
		const creationPortal = document.querySelector(".add-source-portal");
		const previewTabs = required(preview.querySelector(".people-preview-tabs"), "People Preview media tabs");
		const movieTab = required(buttonContaining(previewTabs, "Movies"), "People Movies Preview tab");
		const seriesTab = required(buttonContaining(previewTabs, "Series"), "People Series Preview tab");
		const moviesInitiallyActive = movieTab.getAttribute("aria-selected") === "true" && seriesTab.getAttribute("aria-selected") === "false";
		const moviePosterCount = readyMoviePosters.visibleImages.length;
		await clickAndSettle(seriesTab);
		const readySeriesPosters = await waitForReadyPosterGrid({
			preview: ".people-title-preview",
			gridSelector: ".people-title-preview-grid",
			expectedVisibleCount: expectedPosterCount,
			expectedSelectedTab: "Series",
			label: `Live People Series Preview at ${window.innerWidth}px`,
		});
		preview = readySeriesPosters.preview;
		previewGrid = readySeriesPosters.grid;
		const seriesPreviewTabs = required(preview.querySelector(".people-preview-tabs"), "current People Preview media tabs");
		const seriesMovieTab = required(buttonContaining(seriesPreviewTabs, "Movies"), "current People Movies Preview tab");
		const currentSeriesTab = required(buttonContaining(seriesPreviewTabs, "Series"), "current People Series Preview tab");
		const mediaSeparation = {
			tabCount: seriesPreviewTabs.querySelectorAll('[role="tab"]').length,
			moviesInitiallyActive,
			seriesActive: seriesMovieTab.getAttribute("aria-selected") === "false" && currentSeriesTab.getAttribute("aria-selected") === "true",
			moviePosterCount,
			seriesPosterCount: readySeriesPosters.visibleImages.length,
			seriesCount: /Series · [\d,]+/.test(preview.textContent),
			seriesPostersReady: readySeriesPosters.visibleImages.every((image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0 && visibleElement(image)),
			seriesGenuineTmdbSources: genuineTmdbPosterImages(readySeriesPosters.visibleImages),
			noCombinedTotal: !preview.textContent.includes("Movies + Series") && !preview.textContent.includes("Combined"),
			noAdditionalRequests: requests.length === requestsBeforePreview,
		};
		await clickAndSettle(seriesMovieTab);
		const restoredMoviePosters = await waitForReadyPosterGrid({
			preview: ".people-title-preview",
			gridSelector: ".people-title-preview-grid",
			expectedVisibleCount: expectedPosterCount,
			expectedSelectedTab: "Movies",
			label: `Restored live People Movies Preview at ${window.innerWidth}px`,
		});
		preview = restoredMoviePosters.preview;
		previewGrid = restoredMoviePosters.grid;
		const previewState = {
			modalSurface: preview.dataset.previewSurface === "modal" && preview.getAttribute("role") === "dialog" && preview.getAttribute("aria-modal") === "true",
			outsidePeopleRow: preview.closest(".people-bulk-row") === null,
			posterCount: restoredMoviePosters.visibleImages.length,
			postersReady: restoredMoviePosters.visibleImages.every((image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0 && visibleElement(image)),
			genuineTmdbSources: genuineTmdbPosterImages(restoredMoviePosters.visibleImages),
			gridColumns: getComputedStyle(previewGrid).gridTemplateColumns.split(" ").filter(Boolean).length,
			geometry: titlePreviewGeometry(preview, previewGrid),
			posterOnly: previewGrid.children.length > 0 && [...previewGrid.children].every((child) => child.tagName === "IMG"),
			noHorizontalOverflow: preview.scrollWidth <= preview.clientWidth && document.documentElement.scrollWidth <= window.innerWidth,
			headingFocused: document.activeElement === preview.querySelector("strong"),
			sharedNestedLayer: previewBackdrop?.dataset.nestedModalBackdrop === "true",
			aboveCreationModal: Number.parseInt(getComputedStyle(previewBackdrop).zIndex, 10) > Number.parseInt(getComputedStyle(creationPortal).zIndex, 10),
			mediaSeparation,
		};
		await act(async () => {
			document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
			await afterCommittedEffects();
		});
		previewState.escapeClosed = document.querySelector(".people-title-preview") === null;
		previewState.escapeRestoredFocus = document.activeElement === previewTrigger;
		await clickAndSettle(required(previewTrigger, "reopened Preview titles action"));
		preview = await waitForMountedCondition(() => {
			const candidate = document.querySelector(".people-title-preview");
			if (!candidate) return null;
			return buttonContaining(candidate, "Close") ? candidate : null;
		}, { label: `Reopened People Preview at ${window.innerWidth}px`, timeoutMs: 20_000 });
		await clickAndSettle(required(buttonContaining(preview, "Close"), "preview Close action"));
		previewState.closeRestoredFocus = document.activeElement === previewTrigger;

		await clickAndSettle(required(continueButton, "Continue action"));
		const reviewReached = dialog.querySelector(".people-review-step") !== null;
		const posterShape = dialog.querySelector('input[name="people-folder-shape"][value="POSTER"]');
		const landscapeShape = dialog.querySelector('input[name="people-folder-shape"][value="LANDSCAPE"]');
		const appearance = {
			posterDefault: posterShape?.checked === true,
			shapeChoices: dialog.querySelectorAll('input[name="people-folder-shape"]').length,
			titleOptionsPresent: dialog.querySelector('[data-review-title-options="true"]') !== null,
			collectionTitleVisibilityPresent: dialog.querySelector('[data-editor-control="hideNuvioTitle"]') !== null,
			folderTitleChoices: dialog.querySelectorAll('input[name="people-folder-title-visibility"]').length,
			folderTitleDefault: dialog.querySelector('input[name="people-folder-title-visibility"][value="HIDE_HOME_SCREEN"]')?.checked === true,
			titleOptionsBeforeLayout: dialog.querySelector('[data-review-title-options="true"]')?.compareDocumentPosition(dialog.querySelector('[data-review-layout="true"]')) === Node.DOCUMENT_POSITION_FOLLOWING,
			layoutControlsVisible: dialog.querySelector('[data-review-layout="true"]') !== null,
			personSelectorAbsent: dialog.querySelector("#people-folder-artwork-person") === null,
			artworkFields: dialog.querySelectorAll('.people-folder-appearance input[type="url"]').length,
			focusOverrideAbsent: dialog.querySelector('.people-folder-appearance [data-editor-control="focusGifEnabled"]') === null,
			guidance: dialog.querySelector(".people-folder-artwork-note")?.textContent.trim() ?? "",
			personDetailsPresent: dialog.querySelector(".decades-review-details > summary")?.textContent.includes("View person details · 2") === true,
			showAllSpacing: measureHierarchyShowAllSpacing(dialog),
		};
		const peopleShowAll = required(dialog.querySelector('[data-editor-control="peopleShowAllTab"]'), "People Tabs Show All control");
		appearance.tabsShowAllVisibleEnabled = peopleShowAll.checked === true;
		await clickAndSettle(peopleShowAll);
		await clickAndSettle(required(dialog.querySelector('input[name="people-collection-view"][value="ROWS"]'), "People Rows choice"));
		appearance.rowsHidesShowAll = dialog.querySelector('[data-editor-control="peopleShowAllTab"]') === null;
		await clickAndSettle(required(dialog.querySelector('input[name="people-collection-view"][value="TABBED_GRID"]'), "People Tabs choice"));
		appearance.rowsToTabsRestoresEnabled = dialog.querySelector('[data-editor-control="peopleShowAllTab"]')?.checked === true;
		const hideEverywhere = dialog.querySelector('input[name="people-folder-title-visibility"][value="HIDE_EVERYWHERE"]');
		await clickAndSettle(required(hideEverywhere, "Hide everywhere folder title choice"));
		await clickAndSettle(required(landscapeShape, "Landscape folder shape"));
		await clickAndSettle(required(dialog.querySelector(".add-source-heading-row .add-source-header-action:not(.add-source-close-action)"), "Review Back action"));
		const sortSurvivesReviewBack = dialog.querySelector('input[name="people-hierarchy-sort"][value="recent"]')?.checked === true;
		await clickAndSettle(required(buttonContaining(dialog, "Continue"), "Continue back to Review"));
		appearance.backReviewPreserved = dialog.querySelector('input[name="people-folder-shape"][value="LANDSCAPE"]')?.checked === true;
		appearance.folderTitleBackReviewPreserved = dialog.querySelector('input[name="people-folder-title-visibility"][value="HIDE_EVERYWHERE"]')?.checked === true;
		const createButton = buttonContaining(dialog, "Create collection");
		const createRect = createButton?.getBoundingClientRect();
		appearance.createReachable = Boolean(createRect && createRect.top >= -1 && createRect.bottom <= window.innerHeight + 1 && createRect.height >= 44);
		appearance.noDeadEditor = dialog.querySelector(".people-folder-artwork-editor") === null;
		appearance.noHorizontalOverflow = document.documentElement.scrollWidth <= window.innerWidth && dialog.scrollWidth <= dialog.clientWidth;
		return {
			selectionAffordance,
			automaticOverride,
			sharedOverride,
			layout,
			preview: previewState,
			appearance,
			reviewReached,
			sortSurvivesReviewBack,
			liveRequests: {
				personDetailsOnly: requests.length === personIds.length
					&& personIds.every((id) => requests.some((request) => request.startsWith(`/3/person/${id}?`) && request.includes("append_to_response=combined_credits"))),
			},
			revisionUnchanged: controller.getState().project === initialProject,
		};
	} finally {
		await act(async () => {
			root.unmount();
			await afterCommittedEffects();
		});
		host.remove();
	}
}

function mountedPeopleBulkEntry(index) {
	const person = mountedPerson({
		id: 5000 + index,
		name: index === 0 ? "A Deliberately Long Person Name That Must Remain Readable" : `Layout Person ${index + 1}`,
		department: index % 3 === 0 ? "Directing" : "Acting",
		membership: index % 3 === 0 ? ["actor", "director"] : ["actor"],
		actingMovies: 12 + index,
		actingSeries: 3 + (index % 4),
		directingMovies: 2 + (index % 3),
		directingSeries: 1 + (index % 2),
	});
	person.profilePath = null;
	return {
		result: person,
		person,
		detail: { status: "ready", person },
		configuration: { combinations: index % 2 === 0 ? ["acting-movies", "directing-movies"] : ["acting-series", "directing-series"] },
		artworkState: { status: "ready", artwork: { previewUrl: "" } },
	};
}

async function runPeoplePillStabilityScenario() {
	const allEntries = Array.from({ length: 20 }, (_, index) => mountedPeopleBulkEntry(index));
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	const snapshots = [];
	try {
		for (const count of [1, 2, 5, 20]) {
			await act(async () => {
				root.render(createElement("section", {
					className: "people-source-dialog",
					"data-people-context": "hierarchy",
					"data-add-source-step": "configure",
				}, createElement("section", {
					className: "people-configure",
					style: { height: "520px", width: "min(960px, calc(100vw - 24px))" },
				}, createElement(PeopleBulkConfigurationList, {
					entries: allEntries.slice(0, count),
					mode: "automatic",
					onToggleCombination() {},
					onRetry() {},
					onRemove() {},
					onPreview() {},
					previewState: null,
					previewItems: [],
					previewLimit: 10,
					onClosePreview() {},
					onRetryPreview() {},
				}))));
				await afterCommittedEffects();
			});
			const list = host.querySelector(".people-bulk-list");
			const rows = [...list.querySelectorAll(".people-bulk-row")];
			const firstRow = rows[0];
			const listRect = list.getBoundingClientRect();
			const firstRowRect = firstRow.getBoundingClientRect();
			const lastRowRect = rows.at(-1).getBoundingClientRect();
			const pills = [...list.querySelectorAll(".people-source-pill")];
			const firstRowPills = [...firstRow.querySelectorAll(".people-source-pill")];
			const inputs = [...list.querySelectorAll('.people-source-pill input[type="checkbox"]')];
			const countLabels = [...list.querySelectorAll(".people-source-pill em")];
			const previewRect = firstRow.querySelector(".people-bulk-actions button:first-child").getBoundingClientRect();
			const removeRect = firstRow.querySelector(".people-bulk-actions button:last-child").getBoundingClientRect();
			snapshots.push({
				count,
				rowCount: rows.length,
				pillCount: pills.length,
				pillHeights: firstRowPills.map((pill) => Number(pill.getBoundingClientRect().height.toFixed(2))),
				allPillsCompact: pills.every((pill) => pill.getBoundingClientRect().height <= 42.5),
				firstRowTopOffset: Number((firstRowRect.top - listRect.top).toFixed(2)),
				unusedSpaceBelow: Number((listRect.bottom - lastRowRect.bottom).toFixed(2)),
				rowsIntrinsic: rows.every((row) => row.getBoundingClientRect().height < listRect.height - 8),
				listScrollable: list.scrollHeight > list.clientHeight + 1,
				listOverflowAuto: getComputedStyle(list).overflowY === "auto",
				inputsAccessible: inputs.length === count * 4 && inputs.every((input) => !input.disabled && input.getAttribute("aria-label")),
				selectedAndUnselectedPresent: inputs.some((input) => input.checked) && inputs.some((input) => !input.checked),
				countsReadable: countLabels.length === count * 4 && countLabels.every((label) => label.textContent.trim().length > 0),
				actionsAligned: Math.abs(previewRect.top - removeRect.top) <= 1 && Math.abs(previewRect.height - removeRect.height) <= 1,
				noHorizontalOverflow: list.scrollWidth <= list.clientWidth && document.documentElement.scrollWidth <= window.innerWidth,
			});
		}
		return { width: window.innerWidth, snapshots };
	} finally {
		await act(async () => {
			root.unmount();
			await afterCommittedEffects();
		});
		host.remove();
	}
}

async function runDecadesNavigationScenario() {
	const controller = createController();
	const initialRevision = controller.getState().revision;
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	await act(async () => {
		root.render(createElement(CreationDialog, {
			scope: "new-collection",
			project: controller.getState().project,
			projectRevision: initialRevision,
			currentYear: 2026,
			onCancel() {},
			onCreateBlank() {},
			onApplyDecades() { return { ok: true }; },
		}));
		await afterCommittedEffects();
	});
	try {
		const dialog = () => document.querySelector('[data-creation-dialog="true"]');
		const stage = () => document.querySelector("[data-decades-stage]")?.dataset.decadesStage ?? null;
		const headerBack = () => dialog()?.querySelector("header [data-action^=\"back-to-\"]") ?? null;
		const footerButtons = () => [...(dialog()?.querySelectorAll(".decades-creation-actions button") ?? [])];
		const rootState = {
			backAbsent: headerBack() === null,
			closePresent: dialog()?.querySelector('[aria-label="Close creation flow"]') !== null,
			footerAbsent: dialog()?.querySelector(".decades-creation-actions") === null,
		};

		await clickAndSettle(dialog().querySelector('[data-creation-option="decades"]'));
		const firstStage = {
			stage: stage(),
			backAction: headerBack()?.dataset.action ?? null,
			backInHeader: headerBack()?.closest("header") !== null,
			footerLabels: footerButtons().map((button) => button.textContent.trim()),
			headingFocused: document.activeElement?.id === "decades-preset-title",
		};
		await clickAndSettle(dialog().querySelector('[data-decade-preset="1980s"]'));
		await clickAndSettle(dialog().querySelector('[data-decade-preset="2000s"]'));
		await clickAndSettle(footerButtons()[0]);
		const optionsEntered = {
			stage: stage(),
			backAction: headerBack()?.dataset.action ?? null,
			footerLabels: footerButtons().map((button) => button.textContent.trim()),
			headingFocused: document.activeElement?.id === "decades-options-title",
			defaultDisplayOrder: dialog().querySelector('input[name="decades-display-order"][value="newest-decades-oldest-years"]')?.checked === true,
		};
		await clickAndSettle(dialog().querySelector('input[name="decades-media"][value="both"]'));
		await clickAndSettle(dialog().querySelector('input[name="decades-display-order"][value="newest-throughout"]'));
		await clickAndSettle(dialog().querySelector('input[name="decades-sort"][value="recent"]'));
		await clickAndSettle(inputContaining(dialog(), "Genre breakdown"));
		const genreConfigureTrigger = dialog().querySelector(".decades-genre-summary .secondary-action");
		await clickAndSettle(genreConfigureTrigger);
		const genreSecondary = {
			surfaceOpen: dialog().querySelector('[data-surface="genres"]') !== null,
			underlyingInert: dialog().querySelector(".add-source-scroll")?.inert === true,
			headerInert: dialog().querySelector(".add-source-heading")?.inert === true,
			footerHidden: dialog().querySelector(".decades-creation-actions") === null,
			headingFocused: document.activeElement?.id === "decades-genre-configuration-title",
		};
		await clickAndSettle(buttonContaining(dialog().querySelector('[data-surface="genres"]'), "Action"));
		await clickAndSettle(dialog().querySelector('[data-surface="genres"] .genre-advanced-compact-actions .secondary-action'));
		const exclusionSurface = dialog().querySelector('[data-surface="genre-exclusions"]');
		const exclusionPanel = exclusionSurface.querySelector(".genre-advanced-subview");
		const exclusionSurfaceRect = exclusionSurface.getBoundingClientRect();
		const exclusionPanelRect = exclusionPanel.getBoundingClientRect();
		const exclusionDone = exclusionSurface.querySelector(".genre-secondary-done");
		const exclusionDoneRect = exclusionDone.getBoundingClientRect();
		const exclusionScrollOwners = [...exclusionSurface.querySelectorAll("*")].filter((element) => {
			const overflowY = getComputedStyle(element).overflowY;
			return (overflowY === "auto" || overflowY === "scroll") && element.scrollHeight > element.clientHeight + 1;
		}).length;
		genreSecondary.exclusionBackdropBorderless = getComputedStyle(exclusionSurface).borderTopWidth === "0px";
		genreSecondary.exclusionPanelBounded = getComputedStyle(exclusionPanel).borderTopWidth !== "0px" && exclusionPanelRect.width < exclusionSurfaceRect.width;
		genreSecondary.exclusionHeadingFocused = document.activeElement?.id === "genre-exclusion-picker-title";
		genreSecondary.exclusionDoneReachable = exclusionDoneRect.width > 0 && exclusionDoneRect.height >= 44;
		genreSecondary.exclusionSingleScrollOwner = exclusionScrollOwners <= 1;
		await clickAndSettle(exclusionDone);
		await clickAndSettle(dialog().querySelector('[data-surface="genres"] .genre-secondary-done'));
		genreSecondary.summaryUpdated = dialog().querySelector(".decades-genre-summary")?.textContent.includes("1 selected on all Decades") ?? false;
		genreSecondary.focusRestored = document.activeElement === genreConfigureTrigger;
		genreSecondary.footerReturned = dialog().querySelector(".decades-creation-actions") !== null;
		await clickAndSettle(headerBack());
		const returnedToPresets = {
			stage: stage(),
			selected1980s: dialog().querySelector('[data-decade-preset="1980s"]')?.dataset.selected === "true",
			selected2000s: dialog().querySelector('[data-decade-preset="2000s"]')?.dataset.selected === "true",
			headingFocused: document.activeElement?.id === "decades-preset-title",
		};
		await clickAndSettle(footerButtons()[0]);
		const optionsDraftPreserved = {
			mediaBoth: dialog().querySelector('input[name="decades-media"][value="both"]')?.checked === true,
			individualYears: inputContaining(dialog(), "Individual years")?.checked === true,
			newestThroughoutDisplayOrder: dialog().querySelector('input[name="decades-display-order"][value="newest-throughout"]')?.checked === true,
			redundantChronologyAbsent: dialog().querySelector('input[name="decades-folder-order"], input[name="decades-year-order"]') === null,
			recentSort: dialog().querySelector('input[name="decades-sort"][value="recent"]')?.checked === true,
			appearanceAbsent: dialog().querySelector('input[name="decades-view"]') === null && dialog().querySelector('input[name="decades-folder-shape"]') === null,
			orderingVisible: dialog().querySelector(".decades-ordering") !== null && dialog().querySelector('details[data-decades-settings="ordering"]') === null,
			advancedCollapsed: dialog().querySelector(".decades-advanced-options")?.open === false,
			genreConfigured: dialog().querySelector(".decades-genre-summary")?.textContent.includes("1 selected on all Decades") ?? false,
		};
		await clickAndSettle(footerButtons()[0]);
		const reviewEntered = {
			stage: stage(),
			backAction: headerBack()?.dataset.action ?? null,
			footerLabels: footerButtons().map((button) => button.textContent.trim()),
			headingFocused: document.activeElement?.id === "decades-review-title",
			countCards: dialog().querySelectorAll(".decades-plan-totals > div").length,
			removedSummariesAbsent: dialog().querySelector(".decades-review-configuration") === null,
			sectionLabels: [
				dialog().querySelector(".review-title-options h4")?.textContent.trim(),
				dialog().querySelector('[data-decades-settings="layout"] h4')?.textContent.trim(),
				dialog().querySelector('details[data-decades-settings="folder-options"] > summary strong')?.textContent.trim(),
				dialog().querySelector(".decades-review-details > summary")?.textContent.split(" · ")[0].trim(),
			],
			oldFolderLabelAbsent: !dialog().textContent.includes("Decade folder options"),
			showAllSpacing: measureHierarchyShowAllSpacing(dialog()),
		};
		const collectionName = dialog().querySelector('input[id="decades-collection-movies"]');
		await act(async () => {
			setInputValue(collectionName, "My Movie Decades");
			await afterCommittedEffects();
		});
		await clickAndSettle(dialog().querySelector('input[data-editor-control="showAllTab"]'));
		await clickAndSettle(dialog().querySelector('input[name="decades-view"][value="ROWS"]'));
		const rowsHidShowAll = dialog().querySelector('input[data-editor-control="showAllTab"]') === null;
		await clickAndSettle(dialog().querySelector('input[data-editor-control="pinToTop"]'));
		await clickAndSettle(dialog().querySelector('input[data-editor-control="hideNuvioTitle"]'));
		const hiddenTitleFields = [...dialog().querySelectorAll('input[id^="decades-collection-"]')];
		const hiddenCollectionTitles = {
			messageCount: dialog().querySelectorAll("#decades-hidden-collection-titles-help").length,
			messageText: dialog().querySelector("#decades-hidden-collection-titles-help")?.textContent.trim() ?? null,
			fieldCount: hiddenTitleFields.length,
			allBlankAndDisabled: hiddenTitleFields.every((field) => field.value === "" && field.disabled),
			allShareDescription: hiddenTitleFields.every((field) => field.getAttribute("aria-describedby")?.split(/\s+/).includes("decades-hidden-collection-titles-help")),
		};
		await clickAndSettle(dialog().querySelector('details[data-decades-settings="folder-options"] > summary'));
		await clickAndSettle(dialog().querySelector('input[name="decades-folder-shape"][value="LANDSCAPE"]'));
		await clickAndSettle(dialog().querySelector('input[name="decades-folder-title-visibility"][value="HIDE_EVERYWHERE"]'));
		await clickAndSettle(headerBack());
		const reviewBack = {
			stage: stage(),
			mediaBoth: dialog().querySelector('input[name="decades-media"][value="both"]')?.checked === true,
			individualYears: inputContaining(dialog(), "Individual years")?.checked === true,
			newestThroughoutDisplayOrder: dialog().querySelector('input[name="decades-display-order"][value="newest-throughout"]')?.checked === true,
			recentSort: dialog().querySelector('input[name="decades-sort"][value="recent"]')?.checked === true,
			appearanceAbsent: dialog().querySelector('input[name="decades-view"]') === null && dialog().querySelector('input[name="decades-folder-shape"]') === null,
			headingFocused: document.activeElement?.id === "decades-options-title",
		};
		await clickAndSettle(footerButtons()[0]);
		const restoredHiddenName = dialog().querySelector('input[id="decades-collection-movies"]');
		const hiddenNamePreserved = restoredHiddenName?.value === "" && restoredHiddenName?.disabled === true;
		await clickAndSettle(dialog().querySelector('input[data-editor-control="hideNuvioTitle"]'));
		const rowsPreservedWithoutShowAll = dialog().querySelector('input[name="decades-view"][value="ROWS"]')?.checked === true
			&& dialog().querySelector('input[data-editor-control="showAllTab"]') === null;
		await clickAndSettle(dialog().querySelector('input[name="decades-view"][value="TABBED_GRID"]'));
		const rowsToTabsRestoredEnabled = dialog().querySelector('input[data-editor-control="showAllTab"]')?.checked === true;
		await clickAndSettle(dialog().querySelector('input[name="decades-view"][value="ROWS"]'));
		const reviewNamePreserved = hiddenNamePreserved
			&& dialog().querySelector('input[id="decades-collection-movies"]')?.value === "My Movie Decades"
			&& dialog().querySelector('input[id="decades-collection-movies"]')?.disabled === false
			&& dialog().querySelector('input[name="decades-view"][value="ROWS"]')?.checked === true
			&& dialog().querySelector('input[data-editor-control="showAllTab"]') === null
			&& dialog().querySelector('input[data-editor-control="pinToTop"]')?.checked === true
			&& dialog().querySelector('input[data-editor-control="hideNuvioTitle"]')?.checked === false
			&& dialog().querySelector('input[name="decades-folder-shape"][value="LANDSCAPE"]')?.checked === true
			&& dialog().querySelector('input[name="decades-folder-title-visibility"][value="HIDE_EVERYWHERE"]')?.checked === true;
		await clickAndSettle(headerBack());
		await clickAndSettle(headerBack());
		await clickAndSettle(headerBack());
		return {
			root: rootState,
			firstStage,
			optionsEntered,
			returnedToPresets,
			optionsDraftPreserved,
			genreSecondary,
			reviewEntered,
			reviewBack,
			hiddenCollectionTitles,
			sharedLayout: { rowsHidShowAll, rowsPreservedWithoutShowAll, rowsToTabsRestoredEnabled },
			reviewNamePreserved,
			launcherReturn: {
				backAbsent: headerBack() === null,
				footerAbsent: dialog()?.querySelector(".decades-creation-actions") === null,
				firstOptionFocused: document.activeElement === dialog()?.querySelector('[data-creation-option="blank"]'),
			},
			revisionUnchanged: controller.getState().revision === initialRevision,
		};
	} finally {
		await act(async () => root.unmount());
		host.remove();
	}
}

async function runDecadesActionLayoutScenario() {
	function required(element, label) {
		if (!element) throw new Error(`${label} was not rendered.`);
		return element;
	}
	function footerLayout(dialog) {
		const footer = required(dialog.querySelector(".decades-creation-actions"), "Decades action footer");
		const primary = required(footer.querySelector(".editor-apply"), "Decades primary action");
		const footerRect = footer.getBoundingClientRect();
		const primaryRect = primary.getBoundingClientRect();
		const footerStyle = getComputedStyle(footer);
		const contentLeft = footerRect.left + Number.parseFloat(footerStyle.paddingLeft);
		const contentRight = footerRect.right - Number.parseFloat(footerStyle.paddingRight);
		return {
			leftAligned: Math.abs(primaryRect.left - contentLeft) <= 1,
			widthPreserved: window.innerWidth <= 620
				? Math.abs(primaryRect.right - contentRight) <= 1
				: primaryRect.width >= 180 && primaryRect.width <= 321,
		};
	}
	const controller = createController();
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	await act(async () => {
		root.render(createElement(CreationDialog, {
			scope: "new-collection",
			project: controller.getState().project,
			projectRevision: controller.getState().revision,
			currentYear: 2026,
			initialOptionId: "decades",
			onCancel() {},
			onCreateBlank() {},
			onApplyDecades() { return { ok: true }; },
		}));
		await afterCommittedEffects();
	});
	try {
		const dialog = document.querySelector('[data-creation-dialog="true"]');
		const selectFooter = footerLayout(dialog);
		await clickAndSettle(dialog.querySelector('[data-decade-preset="1980s"]'));
		await clickAndSettle(dialog.querySelector('[data-decade-preset="2000s"]'));
		await clickAndSettle(dialog.querySelector(".decades-creation-actions .editor-apply"));
		const configureFooter = footerLayout(dialog);
		await clickAndSettle(dialog.querySelector(".decades-creation-actions .editor-apply"));
		const reviewFooter = footerLayout(dialog);
		await clickAndSettle(required(dialog.querySelector('header [data-action="back-to-decades-options"]'), "Back to Configure Decades"));
		const back = dialog.querySelector('header [data-action="back-to-decades-presets"]');
		const footer = dialog.querySelector(".decades-creation-actions");
		const primary = footer.querySelector(".editor-apply");
		const primaryRect = primary.getBoundingClientRect();
		const backRect = back.getBoundingClientRect();
		const headingFocused = document.activeElement?.id === "decades-options-title";
		const contentInputs = [...dialog.querySelectorAll('.decades-content-grid input[type="checkbox"]')];
		const selectedContentCard = contentInputs.find((input) => input.checked)?.closest("label");
		const unselectedContentInput = contentInputs.find((input) => !input.checked);
		const unselectedContentCard = unselectedContentInput?.closest("label");
		const selectedContentStyle = selectedContentCard ? getComputedStyle(selectedContentCard) : null;
		const unselectedContentStyle = unselectedContentCard ? getComputedStyle(unselectedContentCard) : null;
		unselectedContentInput.focus({ preventScroll: true });
		await afterCommittedEffects();
		const unselectedContentFocusable = document.activeElement === unselectedContentInput;
		await clickAndSettle(unselectedContentInput);
		const contentToggleSelected = unselectedContentInput.checked === true;
		await clickAndSettle(unselectedContentInput);
		const contentToggleRestored = unselectedContentInput.checked === false;
		const wholeDecadeInput = required(inputContaining(dialog, "Decade overview"), "Decade overview content choice");
		const individualYearsInput = required(inputContaining(dialog, "Individual years"), "Individual years content choice");
		if (!wholeDecadeInput.checked) await clickAndSettle(wholeDecadeInput);
		if (!individualYearsInput.checked) await clickAndSettle(individualYearsInput);
		const previewCatalogue = required(dialog.querySelector(".decades-preview-catalogue"), "Decades Preview catalogue");
		const previewRowsDeferred = previewCatalogue.querySelector(".decades-preview-group") === null;
		await clickAndSettle(required(previewCatalogue.querySelector(":scope > summary"), "Decades Preview catalogue summary"));
		const previewGroups = [...previewCatalogue.querySelectorAll(".decades-preview-group")];
		const previewRows = previewGroups.map((group) => group.querySelector(".decades-preview-row"));
		const previewButtons = previewGroups.map((group) => group.querySelector('button[aria-haspopup="dialog"]'));
		const previewGroupEvidence = {
			deferredUntilCatalogueOpen: previewRowsDeferred,
			groupCount: previewGroups.length,
			oneRowPerDecade: previewRows.every(Boolean) && previewGroups.every((group) => group.querySelectorAll(".decades-preview-row").length === 1),
			noNestedDetails: previewGroups.every((group) => group.tagName === "ARTICLE" && group.querySelector("details, summary") === null),
			sourceCounts: previewRows.map((row) => row?.querySelector("small")?.textContent.trim() ?? null),
			exactGenreActionClass: previewButtons.every((button) => button?.parentElement?.className === "genre-hierarchy-configure-row-actions"),
			oneActionPerDecade: previewButtons.length === previewGroups.length && previewGroups.every((group) => group.querySelectorAll('button[aria-haspopup="dialog"]').length === 1),
			compactActions: previewButtons.every((button) => {
				const rect = button?.getBoundingClientRect();
				return Boolean(rect && rect.height >= 40 && rect.height <= 48 && rect.width > 0);
			}),
		};
		const disclosures = [...dialog.querySelectorAll("details.decades-advanced-options")];
		const allCollapsed = disclosures.length === 1 && disclosures.every((details) => !details.open);
		const scroll = dialog.querySelector(".add-source-scroll");
		const collapsedContentHeight = scroll.scrollHeight;
		const firstSummary = disclosures[0].querySelector("summary");
		firstSummary.focus();
		await clickAndSettle(firstSummary);
		const accordionFocusRetained = document.activeElement === firstSummary && firstSummary.tabIndex === 0;
		for (const details of disclosures.slice(1)) await clickAndSettle(details.querySelector("summary"));
		const expandedContentHeight = scroll.scrollHeight;
		const verticalScrollOwners = [...dialog.querySelectorAll("*")].filter((element) => {
			const overflowY = getComputedStyle(element).overflowY;
			return (overflowY === "auto" || overflowY === "scroll") && element.scrollHeight > element.clientHeight + 1;
		}).length;
		return {
			width: window.innerWidth,
			stageFooterLayout: { select: selectFooter, configure: configureFooter, review: reviewFooter },
			topBackVisible: backRect.width > 0 && backRect.height >= 44,
			footerOnlyPrimary: footer.querySelectorAll("button").length === 1 && !footer.textContent.includes("Back"),
			primaryReachable: primaryRect.width > 0 && primaryRect.height >= 44 && primaryRect.left >= 0 && primaryRect.right <= window.innerWidth,
			headingFocused,
			noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth && dialog.scrollWidth <= dialog.clientWidth,
			allCollapsed,
			collapsedIsShorter: expandedContentHeight > collapsedContentHeight,
			accordionFocusRetained,
			oneScrollOwner: verticalScrollOwners === 1,
			currentYearSelectorAbsent: dialog.querySelector('input[name="decades-current-year"]') === null,
			mediaPills: dialog.querySelectorAll('input[name="decades-media"]').length,
			sortPills: dialog.querySelectorAll('input[name="decades-sort"]').length,
			genreCatalogueAbsent: dialog.querySelector(".add-source-scroll .genre-catalogue-list") === null,
			orderingVisible: dialog.querySelector(".decades-ordering") !== null,
			bothDefault: dialog.querySelector('input[name="decades-media"][value="both"]')?.checked === true,
			displayOrderChoices: dialog.querySelectorAll('input[name="decades-display-order"]').length,
			defaultDisplayOrder: dialog.querySelector('input[name="decades-display-order"][value="newest-decades-oldest-years"]')?.checked === true,
			contentSelection: {
				nativeCheckboxes: contentInputs.length,
				allVisible: contentInputs.every((input) => !input.classList.contains("visually-hidden") && input.getBoundingClientRect().width >= 16),
				markersAbsent: dialog.querySelector('.decades-content-grid [data-selection-indicator], .decades-content-grid .selectable-card-indicator') === null,
				neutralCardTreatment: selectedContentStyle?.backgroundColor === unselectedContentStyle?.backgroundColor
					&& selectedContentStyle?.borderColor === unselectedContentStyle?.borderColor
					&& selectedContentStyle?.boxShadow === unselectedContentStyle?.boxShadow,
				unselectedFocusable: unselectedContentFocusable,
				toggleSelected: contentToggleSelected,
				toggleRestored: contentToggleRestored,
			},
			previewGroups: previewGroupEvidence,
			oldChronologyAbsent: dialog.querySelector('input[name="decades-folder-order"], input[name="decades-year-order"]') === null,
		};
	} finally {
		await act(async () => root.unmount());
		host.remove();
	}
}

async function runDecadesGenreLayoutScenario() {
	const controller = createController();
	const initialRevision = controller.getState().revision;
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	await act(async () => {
		root.render(createElement(CreationDialog, {
			scope: "new-collection",
			project: controller.getState().project,
			projectRevision: initialRevision,
			currentYear: 2026,
			initialOptionId: "decades",
			onCancel() {},
			onCreateBlank() {},
			onApplyDecades() { return { ok: true }; },
		}));
		await afterCommittedEffects();
	});
	try {
		const dialog = document.querySelector('[data-creation-dialog="true"]');
		await clickAndSettle(buttonContaining(dialog.querySelector(".decades-step"), "Select all"));
		await clickAndSettle(dialog.querySelector(".decades-creation-actions .editor-apply"));
		await clickAndSettle(inputContaining(dialog, "Genre breakdown"));
		const configureTrigger = dialog.querySelector(".decades-genre-summary .secondary-action");
		await clickAndSettle(configureTrigger);
		const surface = dialog.querySelector('[data-surface="genres"]');
		const panel = surface.querySelector(".decades-genre-subview");
		const contextPane = panel.querySelector(".genre-context-pane");
		const choicePane = panel.querySelector(".genre-context-choice-pane");
		const contextButtons = [...contextPane.querySelectorAll("button")];
		const allButton = contextButtons[0];
		const firstDecadeButton = contextButtons[1];
		const lastDecadeButton = contextButtons.at(-1);
		const isMobile = window.innerWidth <= 900;
		const visible = (element) => Boolean(element && element.getClientRects().length > 0);
		const scrollOwners = () => [...surface.querySelectorAll("*")].filter((element) => {
			const overflowY = getComputedStyle(element).overflowY;
			return (overflowY === "auto" || overflowY === "scroll") && element.scrollHeight > element.clientHeight + 1;
		}).length;
		const panelRect = panel.getBoundingClientRect();
		const paneRect = contextPane.getBoundingClientRect();
		const choiceRect = choicePane.getBoundingClientRect();
		const initial = {
			width: window.innerWidth,
			contextCount: contextButtons.length,
			contextLabels: contextButtons.map((button) => button.querySelector("strong")?.textContent.trim()),
			contextPaneVisible: visible(contextPane),
			catalogueVisible: visible(panel.querySelector(".genre-catalogue-list")),
			activeAll: allButton.getAttribute("aria-pressed") === "true",
			rootFocused: document.activeElement?.id === "decades-genre-configuration-title",
			validationVisible: visible(panel.querySelector("#decades-genres-error")) && panel.getAttribute("aria-invalid") === "true",
			noHorizontalStrip: panel.querySelector(".decades-genre-contexts") === null,
			sharedShell: panel.classList.contains("genre-context-catalogue-subview"),
			noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth && surface.scrollWidth <= surface.clientWidth && panel.scrollWidth <= panel.clientWidth,
			contextsFitWidth: contextButtons.every((button) => {
				const rect = button.getBoundingClientRect();
				return rect.left >= paneRect.left - 1 && rect.right <= paneRect.right + 1;
			}),
			twoPane: !isMobile && paneRect.right <= choiceRect.left && panelRect.width < surface.getBoundingClientRect().width,
			boundedBorder: getComputedStyle(surface).borderTopWidth === "0px" && getComputedStyle(panel).borderTopWidth !== "0px" && panelRect.width <= 820,
			mobileRootOnly: isMobile ? visible(contextPane) && !visible(choicePane) : null,
			doneReachable: visible(panel.querySelector(".genre-secondary-done")) && panel.querySelector(".genre-secondary-done").getBoundingClientRect().height >= 44,
			safeAreaPadding: isMobile ? parseFloat(getComputedStyle(surface).paddingBottom) >= 12 : null,
			rootScrollOwners: scrollOwners(),
		};

		if (isMobile) await clickAndSettle(allButton);
		const activeCatalogue = panel.querySelector(".genre-catalogue-list");
		const detail = {
			catalogueVisible: visible(activeCatalogue),
			contextPaneHidden: isMobile ? !visible(contextPane) : null,
			backVisible: isMobile ? visible(panel.querySelector(".genre-exclusion-mobile-back")) : null,
			detailFocused: isMobile ? document.activeElement === panel.querySelector(".genre-exclusion-detail-header h5") : null,
			keyboardAbsent: document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA",
			detailScrollOwners: scrollOwners(),
		};
		await clickAndSettle(activeCatalogue.querySelector('[data-genre-name="Action"]'));
		const validationCleared = panel.querySelector("#decades-genres-error") === null && panel.getAttribute("aria-invalid") === null;
		if (isMobile) await clickAndSettle(panel.querySelector(".genre-exclusion-mobile-back"));
		const sharedCountUpdated = allButton.querySelector("small")?.textContent.trim() === "1 shared";
		const sharedAppliedToEveryDecade = contextButtons.slice(1).every((button) => button.querySelector("small")?.textContent.trim() === "1 selected");
		const backPreservedSharedSelection = isMobile ? document.activeElement?.id === "decades-genre-configuration-title" : true;

		await clickAndSettle(firstDecadeButton);
		const firstCatalogue = panel.querySelector(".genre-catalogue-list");
		const switchedContext = panel.querySelector(".genre-exclusion-detail-header h5")?.textContent.trim() === "Genres for 1950s & Earlier";
		const sharedSelectionPreserved = firstCatalogue.querySelector('[data-genre-name="Action"]')?.getAttribute("aria-pressed") === "true";
		await clickAndSettle(firstCatalogue.querySelector('[data-genre-name="Adventure"]'));
		const individualCountUpdated = firstDecadeButton.querySelector("small")?.textContent.trim() === "2 selected";
		await clickAndSettle(buttonContaining(panel.querySelector(".genre-selection-toolbar"), "Select all"));
		const selectAllWorked = panel.querySelector(".genre-selection-toolbar > span")?.textContent.trim() === "27 of 27 selected";
		await clickAndSettle(buttonContaining(panel.querySelector(".genre-selection-toolbar"), "Clear all"));
		const clearAllWorked = panel.querySelector(".genre-selection-toolbar > span")?.textContent.trim() === "0 of 27 selected";
		const validationReturned = panel.querySelector("#decades-genres-error")?.textContent.includes("1950s & Earlier") === true;
		await clickAndSettle(panel.querySelector('.genre-catalogue-list [data-genre-name="Adventure"]'));
		if (isMobile) await clickAndSettle(panel.querySelector(".genre-exclusion-mobile-back"));

		lastDecadeButton.scrollIntoView({ block: "nearest" });
		lastDecadeButton.focus({ preventScroll: true });
		await afterCommittedEffects();
		const lastContextReachable = document.activeElement === lastDecadeButton
			&& lastDecadeButton.getBoundingClientRect().left >= contextPane.getBoundingClientRect().left - 1
			&& lastDecadeButton.getBoundingClientRect().right <= contextPane.getBoundingClientRect().right + 1;
		await clickAndSettle(lastDecadeButton);
		const lastContextActive = lastDecadeButton.getAttribute("aria-pressed") === "true";
		const lastContextPreserved = panel.querySelector('.genre-catalogue-list [data-genre-name="Action"]')?.getAttribute("aria-pressed") === "true";
		if (isMobile) await clickAndSettle(panel.querySelector(".genre-exclusion-mobile-back"));
		const contextValuesPreserved = firstDecadeButton.querySelector("small")?.textContent.trim() === "1 selected"
			&& lastDecadeButton.querySelector("small")?.textContent.trim() === "1 selected";
		const done = panel.querySelector(".genre-secondary-done");
		await clickAndSettle(done);
		return {
			initial,
			detail,
			validationCleared,
			sharedCountUpdated,
			sharedAppliedToEveryDecade,
			backPreservedSharedSelection,
			switchedContext,
			sharedSelectionPreserved,
			individualCountUpdated,
			selectAllWorked,
			clearAllWorked,
			validationReturned,
			lastContextReachable,
			lastContextActive,
			lastContextPreserved,
			contextValuesPreserved,
			closed: dialog.querySelector('[data-surface="genres"]') === null,
			focusRestored: document.activeElement === configureTrigger,
			revisionUnchanged: controller.getState().revision === initialRevision,
		};
	} finally {
		await act(async () => root.unmount());
		host.remove();
	}
}

async function runDecadesExclusionLayoutScenario() {
	const controller = createController();
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	await act(async () => {
		root.render(createElement(CreationDialog, {
			scope: "new-collection",
			project: controller.getState().project,
			projectRevision: controller.getState().revision,
			currentYear: 2026,
			initialOptionId: "decades",
			onCancel() {},
			onCreateBlank() {},
			onApplyDecades() { return { ok: true }; },
		}));
		await afterCommittedEffects();
	});
	try {
		const dialog = document.querySelector('[data-creation-dialog="true"]');
		await clickAndSettle(buttonContaining(dialog.querySelector(".decades-step"), "Select all"));
		await clickAndSettle(dialog.querySelector(".decades-creation-actions .editor-apply"));
		await clickAndSettle(dialog.querySelector(".decades-advanced-options > summary"));
		const exclusionTrigger = dialog.querySelector(".decades-advanced-options .genre-advanced-compact-actions .secondary-action");
		await clickAndSettle(exclusionTrigger);
		const surface = dialog.querySelector('[data-surface="ordinary-exclusions"]');
		const panel = surface.querySelector(".decades-exclusion-subview");
		const contextPane = panel.querySelector(".genre-context-pane");
		const choicePane = panel.querySelector(".genre-context-choice-pane");
		const contextButtons = [...contextPane.querySelectorAll("button")];
		const allButton = contextButtons[0];
		const firstDecadeButton = contextButtons[1];
		const lastDecadeButton = contextButtons.at(-1);
		const isMobile = window.innerWidth <= 900;
		const visible = (element) => Boolean(element && element.getClientRects().length > 0);
		const scrollOwners = () => [...surface.querySelectorAll("*")].filter((element) => {
			const overflowY = getComputedStyle(element).overflowY;
			return (overflowY === "auto" || overflowY === "scroll") && element.scrollHeight > element.clientHeight + 1;
		}).length;
		const panelRect = panel.getBoundingClientRect();
		const paneRect = contextPane.getBoundingClientRect();
		const choiceRect = choicePane.getBoundingClientRect();
		const initial = {
			width: window.innerWidth,
			contextCount: contextButtons.length,
			contextLabels: contextButtons.map((button) => button.querySelector("strong")?.textContent.trim()),
			contextPaneVisible: visible(contextPane),
			catalogueVisible: visible(panel.querySelector(".genre-catalogue-list")),
			activeAll: allButton.getAttribute("aria-pressed") === "true",
			rootFocused: document.activeElement?.id === "decades-exclusion-title",
			noHorizontalStrip: panel.querySelector(".decades-genre-contexts") === null,
			noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth && surface.scrollWidth <= surface.clientWidth && panel.scrollWidth <= panel.clientWidth,
			contextsFitWidth: contextButtons.every((button) => {
				const rect = button.getBoundingClientRect();
				return rect.left >= paneRect.left - 1 && rect.right <= paneRect.right + 1;
			}),
			twoPane: !isMobile && paneRect.right <= choiceRect.left && panelRect.width < surface.getBoundingClientRect().width,
			boundedBorder: getComputedStyle(surface).borderTopWidth === "0px" && getComputedStyle(panel).borderTopWidth !== "0px" && panelRect.width <= 820,
			mobileRootOnly: isMobile ? visible(contextPane) && !visible(choicePane) : null,
			doneReachable: visible(panel.querySelector(".genre-secondary-done")) && panel.querySelector(".genre-secondary-done").getBoundingClientRect().height >= 44,
			safeAreaPadding: isMobile ? parseFloat(getComputedStyle(surface).paddingBottom) >= 12 : null,
			rootScrollOwners: scrollOwners(),
		};

		if (isMobile) await clickAndSettle(allButton);
		const activeCatalogue = panel.querySelector(".genre-catalogue-list");
		const detail = {
			catalogueVisible: visible(activeCatalogue),
			contextPaneHidden: isMobile ? !visible(contextPane) : null,
			backVisible: isMobile ? visible(panel.querySelector(".genre-exclusion-mobile-back")) : null,
			detailFocused: isMobile ? document.activeElement === panel.querySelector(".genre-exclusion-detail-header h5") : null,
			keyboardAbsent: document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA",
			detailScrollOwners: scrollOwners(),
		};
		await clickAndSettle(activeCatalogue.querySelector('[data-genre-name="Action"]'));
		if (isMobile) await clickAndSettle(panel.querySelector(".genre-exclusion-mobile-back"));
		const sharedCountUpdated = allButton.querySelector("small")?.textContent.trim() === "1 shared exclusion";
		const sharedAppliedToEveryDecade = contextButtons.slice(1).every((button) => button.querySelector("small")?.textContent.trim() === "1 excluded");

		await clickAndSettle(firstDecadeButton);
		const firstCatalogue = panel.querySelector(".genre-catalogue-list");
		const sharedSelectionPreserved = firstCatalogue.querySelector('[data-genre-name="Action"]')?.getAttribute("aria-pressed") === "true";
		await clickAndSettle(firstCatalogue.querySelector('[data-genre-name="Adventure"]'));
		const individualCountUpdated = panel.querySelector(".genre-selection-toolbar > span")?.textContent.trim() === "2 of 27 selected";
		await clickAndSettle(buttonContaining(panel.querySelector(".genre-selection-toolbar"), "Select all"));
		const selectAllWorked = panel.querySelector(".genre-selection-toolbar > span")?.textContent.trim() === "27 of 27 selected";
		await clickAndSettle(buttonContaining(panel.querySelector(".genre-selection-toolbar"), "Clear all"));
		const clearAllWorked = panel.querySelector(".genre-selection-toolbar > span")?.textContent.trim() === "0 of 27 selected";
		await clickAndSettle(panel.querySelector('.genre-catalogue-list [data-genre-name="Adventure"]'));
		if (isMobile) await clickAndSettle(panel.querySelector(".genre-exclusion-mobile-back"));

		lastDecadeButton.scrollIntoView({ block: "nearest" });
		lastDecadeButton.focus({ preventScroll: true });
		await afterCommittedEffects();
		const lastContextReachable = document.activeElement === lastDecadeButton
			&& lastDecadeButton.getBoundingClientRect().left >= contextPane.getBoundingClientRect().left - 1
			&& lastDecadeButton.getBoundingClientRect().right <= contextPane.getBoundingClientRect().right + 1;
		await clickAndSettle(lastDecadeButton);
		const lastContextActive = lastDecadeButton.getAttribute("aria-pressed") === "true";
		const lastContextPreserved = panel.querySelector('.genre-catalogue-list [data-genre-name="Action"]')?.getAttribute("aria-pressed") === "true";
		if (isMobile) await clickAndSettle(panel.querySelector(".genre-exclusion-mobile-back"));
		const contextValuesPreserved = firstDecadeButton.querySelector("small")?.textContent.trim() === "1 excluded"
			&& lastDecadeButton.querySelector("small")?.textContent.trim() === "1 excluded";
		const done = panel.querySelector(".genre-secondary-done");
		await clickAndSettle(done);
		return {
			initial,
			detail,
			sharedCountUpdated,
			sharedAppliedToEveryDecade,
			sharedSelectionPreserved,
			individualCountUpdated,
			selectAllWorked,
			clearAllWorked,
			lastContextReachable,
			lastContextActive,
			lastContextPreserved,
			contextValuesPreserved,
			closed: dialog.querySelector('[data-surface="ordinary-exclusions"]') === null,
			focusRestored: document.activeElement === exclusionTrigger,
		};
	} finally {
		await act(async () => root.unmount());
		host.remove();
	}
}

async function withOrdinaryAddFlow(renderFlow, run, { applyHandler = null } = {}) {
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	const controller = createController();
	const folder = importSources(controller, []);
	if (applyHandler) controller.selectNode(folder.internalId);
	const project = controller.getState().project;
	const serializedBefore = serializedValue(controller);
	let applyCalls = 0;
	await act(async () => {
		root.render(renderFlow({
			project,
			folder,
			onApply(...args) {
				applyCalls += 1;
				if (applyHandler) return applyHandler({ controller, folder }, ...args);
				throw new Error("Preview must not enter Save.");
			},
		}));
		await afterCommittedEffects();
	});
	try {
		return await run({
			controller,
			folder,
			project,
			getApplyCalls: () => applyCalls,
			serializedBefore,
		});
	} finally {
		await act(async () => root.unmount());
		host.remove();
	}
}

async function ordinaryAddPreviewEvidence({ dialog, trigger, requests, selectorLabel = null }) {
	async function waitForBoundedPreview(label, expectedSelectedTab = null) {
		return waitForMountedCondition(() => {
			const preview = document.querySelector(".source-edit-preview-modal");
			const grid = preview?.querySelector(".source-edit-preview-grid") ?? null;
			const images = grid ? [...grid.querySelectorAll(":scope > img")] : [];
			const visibleImages = images.filter(visibleElement);
			const selectedTab = preview?.querySelector('[role="tab"][aria-selected="true"]')?.textContent.trim() ?? null;
			if (!grid || visibleImages.length < 1 || visibleImages.length > 10) return null;
			if (expectedSelectedTab !== null && selectedTab !== expectedSelectedTab) return null;
			if (visibleImages.some((image) => !image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0)) return null;
			return { preview, grid, images, visibleImages };
		}, { label, timeoutMs: 30_000 });
	}
	const requestCountBeforeOpen = requests.length;
	trigger.focus({ preventScroll: true });
	await clickAndSettle(trigger);
	let ready = await waitForBoundedPreview("ordinary Add Source live preview");
	const modal = ready.preview;
	const initialLabel = modal.querySelector("h3")?.textContent.trim() ?? null;
	const selectorGroups = [...modal.querySelectorAll(".source-title-preview-dimensions .decade-add-preview-dimension")].map((group) => ({
		label: group.querySelector(":scope > strong")?.textContent.trim() ?? null,
		options: [...group.querySelectorAll('button[role="tab"]')].map((button) => button.textContent.trim()),
		selected: group.querySelector('button[role="tab"][aria-selected="true"]')?.textContent.trim() ?? null,
	}));
	const requestCountAfterInitial = requests.length;
	let switched = null;
	if (selectorLabel !== null) {
		const selector = [...modal.querySelectorAll('button[role="tab"]')].find((button) => button.textContent.trim() === selectorLabel);
		if (!selector) throw new Error(`Preview selector ${selectorLabel} was not rendered.`);
		await clickAndSettle(selector);
		ready = await waitForBoundedPreview(`ordinary Add Source ${selectorLabel} preview`, selectorLabel);
		switched = {
			label: ready.preview.querySelector("h3")?.textContent.trim() ?? null,
			requestCount: requests.length,
			genuinePosters: genuineTmdbPosterImages(ready.visibleImages),
		};
	}
	const openState = {
		initialLabel,
		posterCount: ready.visibleImages.length,
		genuinePosters: genuineTmdbPosterImages(ready.visibleImages),
		posterOnly: [...ready.grid.children].every((entry) => entry.tagName === "IMG"),
		geometry: titlePreviewGeometry(modal, ready.grid),
		outerInert: dialog.querySelector(".add-source-heading")?.inert === true && dialog.querySelector(".add-source-form")?.inert === true,
		focusContained: modal.contains(document.activeElement),
	};
	const requestCountBeforeClose = requests.length;
	await clickAndSettle(requiredElement(modal.querySelector("header button"), "ordinary Add Source Preview Close"));
	const focusRestored = document.activeElement === trigger;
	await clickAndSettle(trigger);
	await waitForBoundedPreview("cached ordinary Add Source preview");
	const cacheReused = requests.length === requestCountBeforeClose;
	await clickAndSettle(requiredElement(document.querySelector(".source-edit-preview-modal header button"), "cached ordinary Add Source Preview Close"));
	return {
		requestCountBeforeOpen,
		requestCountAfterInitial,
		requestCountFinal: requests.length,
		selectorGroups,
		switched,
		...openState,
		focusRestored,
		cacheReused,
	};
}

function requiredElement(element, label) {
	if (!element) throw new Error(`${label} was not rendered.`);
	return element;
}

async function runAddSourceLivePreviewParityScenario() {
	const results = {};

	{
		const requests = [];
		const provider = createTmdbCollectionProvider({ fetchImpl: recordingFetch(requests) });
		results.collection = await withOrdinaryAddFlow(
			({ folder, onApply }) => createElement(AddSourceDialog, { provider, folderName: folder.editable.title, onBack() {}, onCancel() {}, onApply }),
			async ({ controller, serializedBefore, getApplyCalls }) => {
				const input = requiredElement(document.querySelector("#add-source-query"), "Collection search");
				await act(async () => { setInputValue(input, "645"); await afterCommittedEffects(); });
				const trigger = await waitForMountedCondition(() => document.querySelector('[data-action="preview-add-source"]:not(:disabled)'), { label: "Collection Add Preview action", timeoutMs: 30_000 });
				const dialog = requiredElement(document.querySelector(".add-source-dialog"), "Collection Add dialog");
				const reviewScroll = requiredElement(dialog.querySelector(".add-source-scroll"), "Collection Add review scroll owner");
				const footer = requiredElement(dialog.querySelector(".add-source-actions"), "Collection Add footer");
				const previewAction = trigger.closest(".source-edit-preview-action");
				const reviewScrollOwners = [dialog, ...dialog.querySelectorAll("*")].filter((element) => {
					const overflowY = getComputedStyle(element).overflowY;
					return overflowY === "auto" || overflowY === "scroll";
				});
				const reviewCleanup = {
					countText: dialog.querySelector(".add-source-review-count")?.textContent.trim() ?? null,
					previewActionAvailable: trigger.textContent.trim() === "Preview titles" && !trigger.disabled,
					legacyTextPreviewAbsent: dialog.querySelector('[data-action="toggle-contained-titles"], .add-source-title-list, #add-source-contained-titles, .add-source-review-content ol') === null && !/View \d+ titles? in this collection/.test(dialog.textContent),
					previewFollowsRecipe: dialog.querySelector('[data-source-recipe="tmdb-collection"]')?.nextElementSibling === previewAction,
					oneScrollOwner: reviewScrollOwners.length === 1 && reviewScrollOwners[0] === reviewScroll,
					footerReachable: visibleElement(footer) && footer.getBoundingClientRect().bottom <= dialog.getBoundingClientRect().bottom + 1,
				};
				const evidence = await ordinaryAddPreviewEvidence({ dialog, trigger, requests });
				return { ...evidence, reviewCleanup, requests, noMutation: serializedValue(controller) === serializedBefore, applyCalls: getApplyCalls() };
			},
		);
	}

	{
		const requests = [];
		const provider = createTmdbPersonProvider({ fetchImpl: recordingFetch(requests) });
		results.people = await withOrdinaryAddFlow(
			({ project, folder, onApply }) => createElement(PeopleSourceFlow, { context: "folder", provider, project, folder, onBack() {}, onCancel() {}, onApply }),
			async ({ controller, folder, serializedBefore, getApplyCalls }) => {
				const input = requiredElement(document.querySelector("#people-source-query"), "People search");
				await act(async () => { setInputValue(input, "31"); await afterCommittedEffects(); });
				const result = await waitForMountedCondition(() => document.querySelector('[data-tmdb-person-result="31"]:not(:disabled)'), { label: "People result", timeoutMs: 30_000 });
				await clickAndSettle(result);
				const card = await waitForMountedCondition(() => document.querySelector('.people-configuration-card[data-person-id="31"]'), { label: "People Configure", timeoutMs: 30_000 });
				const sortFieldset = requiredElement(document.querySelector('[data-source-capability="sort"][data-source-capability-context="add"]'), "People Add Sort");
				const sortRadios = [...sortFieldset.querySelectorAll('input[type="radio"][name="people-add-sort"]')];
				const sortLabels = sortRadios.map((radio) => radio.closest("label")?.textContent.trim() ?? "");
				const defaultPopular = sortRadios.find((radio) => radio.value === "popular")?.checked === true;
				const recentRadio = requiredElement(sortRadios.find((radio) => radio.value === "recent"), "People Recent Sort");
				await clickAndSettle(recentRadio);
				for (const inputElement of card.querySelectorAll('.people-combination-group input[type="checkbox"]')) {
					if (!inputElement.checked) await clickAndSettle(inputElement);
				}
				const retainedThroughConfiguration = recentRadio.checked;
				const noHorizontalOverflow = sortFieldset.scrollWidth <= sortFieldset.clientWidth + 1
					&& sortFieldset.getBoundingClientRect().right <= document.querySelector(".people-source-dialog").getBoundingClientRect().right + 1;
				const radioSemantics = sortRadios.length === 3
					&& sortRadios.every((radio) => radio.type === "radio" && radio.name === "people-add-sort")
					&& sortRadios.filter((radio) => radio.checked).length === 1;
				const trigger = requiredElement(document.querySelector('[data-action="preview-add-people"]:not(:disabled)'), "People Add Preview action");
				const dialog = requiredElement(document.querySelector(".people-source-dialog"), "People Add dialog");
				const evidence = await ordinaryAddPreviewEvidence({ dialog, trigger, requests, selectorLabel: "Directing" });
				const noPreviewMutation = serializedValue(controller) === serializedBefore;
				await clickAndSettle(requiredElement(buttonContaining(dialog.querySelector(".add-source-heading"), "Back"), "People Configure Back"));
				const restoredResult = await waitForMountedCondition(() => document.querySelector('[data-tmdb-person-result="31"]:not(:disabled)'), { label: "restored People result" });
				await clickAndSettle(restoredResult);
				await waitForMountedCondition(() => document.querySelector('.people-configuration-card[data-person-id="31"]'), { label: "restored People Configure" });
				const restoredAfterBack = document.querySelector('input[name="people-add-sort"][value="recent"]')?.checked === true;
				const revisionBeforeAdd = controller.getState().revision;
				await clickAndSettle(requiredElement(document.querySelector(".people-configure-actions .editor-apply:not(:disabled)"), "People Add action"));
				const savedSources = await waitForMountedCondition(() => {
					const currentFolder = controller.getState().project.collections.flatMap((collection) => collection.folders).find((entry) => entry.internalId === folder.internalId);
					return currentFolder?.sources.length === 4 ? currentFolder.sources : null;
				}, { label: "four saved People sources" });
				return {
					...evidence,
					requests,
					noMutation: noPreviewMutation,
					applyCalls: getApplyCalls(),
					sort: {
						labels: sortLabels,
						defaultPopular,
						recentSelected: recentRadio.checked,
						retainedThroughConfiguration,
						restoredAfterBack,
						radioSemantics,
						noHorizontalOverflow,
						savedSorts: savedSources.map((source) => source.editable.sortBy),
						oneAtomicRevision: controller.getState().revision === revisionBeforeAdd + 1,
					},
				};
			},
			{
				applyHandler: ({ controller, folder }, payload) => createPeopleSourceBundle(controller, {
					destination: { kind: "existing-folder", folderInternalId: folder.internalId },
					person: payload.person,
					drafts: payload.drafts,
					artwork: payload.artwork,
					duplicateOverrideIdentity: payload.duplicateOverrideIdentity,
				}),
			},
		);
	}

	{
		const requests = [];
		const previewProvider = createTmdbStudioPreviewProvider({ fetchImpl: recordingFetch(requests) });
		const countProvider = { async getStudioCounts() { return { ok: true, data: { movie: { status: "known", count: 100, error: null }, series: { status: "known", count: 100, error: null } } }; } };
		results.studio = await withOrdinaryAddFlow(
			({ project, folder, onApply }) => createElement(StudioSourceFlow, { catalogueProvider: liveStudioCatalogueProvider, countProvider, previewProvider, project, folder, onBack() {}, onCancel() {}, onApply }),
			async ({ controller, serializedBefore, getApplyCalls }) => {
				const input = requiredElement(document.querySelector("#studio-source-query"), "Studio search");
				await act(async () => { setInputValue(input, "3"); await afterCommittedEffects(); });
				const result = await waitForMountedCondition(() => document.querySelector('[data-tmdb-studio-result="3"]'), { label: "Studio result" });
				await clickAndSettle(result);
				const configure = await waitForMountedCondition(() => document.querySelector(".studio-configure-focus-target"), { label: "Studio Configure" });
				const series = inputContaining(configure, "Series");
				if (series && !series.checked) await clickAndSettle(series);
				const trigger = requiredElement(document.querySelector('[data-action="preview-add-studio"]:not(:disabled)'), "Studio Add Preview action");
				const dialog = requiredElement(document.querySelector(".studio-source-dialog"), "Studio Add dialog");
				const evidence = await ordinaryAddPreviewEvidence({ dialog, trigger, requests, selectorLabel: "Series" });
				return { ...evidence, requests, noMutation: serializedValue(controller) === serializedBefore, applyCalls: getApplyCalls() };
			},
		);
	}

	{
		const requests = [];
		const previewProvider = createTmdbNetworkPreviewProvider({ fetchImpl: recordingFetch(requests) });
		const countProvider = { async getNetworkCount() { return { ok: true, data: { status: "known", count: 100, error: null } }; } };
		results.network = await withOrdinaryAddFlow(
			({ project, folder, onApply }) => createElement(NetworkSourceFlow, { catalogueProvider: liveNetworkCatalogueProvider, countProvider, previewProvider, project, folder, onBack() {}, onCancel() {}, onApply }),
			async ({ controller, serializedBefore, getApplyCalls }) => {
				const input = requiredElement(document.querySelector("#network-source-query"), "Network search");
				await act(async () => { setInputValue(input, "2"); await afterCommittedEffects(); });
				const result = await waitForMountedCondition(() => document.querySelector('[data-tmdb-network-result="2"]'), { label: "Network result" });
				await clickAndSettle(result);
				const trigger = await waitForMountedCondition(() => document.querySelector('[data-action="preview-add-network"]:not(:disabled)'), { label: "Network Add Preview action" });
				const dialog = requiredElement(document.querySelector(".network-source-dialog"), "Network Add dialog");
				const evidence = await ordinaryAddPreviewEvidence({ dialog, trigger, requests });
				return { ...evidence, requests, noMutation: serializedValue(controller) === serializedBefore, applyCalls: getApplyCalls() };
			},
		);
	}

	{
		const requests = [];
		const previewProvider = createTmdbStreamingPreviewProvider({ fetchImpl: recordingFetch(requests) });
		results.streaming = await withOrdinaryAddFlow(
			({ project, folder, onApply }) => createElement(StreamingSourceFlow, { catalogueProvider: liveStreamingCatalogueProvider, previewProvider, project, folder, onBack() {}, onCancel() {}, onApply }),
			async ({ controller, serializedBefore, getApplyCalls }) => {
				const au = await waitForMountedCondition(() => document.querySelector('[data-streaming-region="AU"]'), { label: "AU Streaming region", timeoutMs: 30_000 });
				await clickAndSettle(au);
				const us = requiredElement(document.querySelector('[data-streaming-region="US"]'), "US Streaming region");
				await clickAndSettle(us);
				await clickAndSettle(requiredElement(buttonContaining(document.querySelector(".streaming-region-actions"), "Next"), "Streaming region Next"));
				const providerResult = await waitForMountedCondition(() => document.querySelector('[data-streaming-provider="8"]'), { label: "Netflix provider" });
				await clickAndSettle(providerResult);
				const trigger = await waitForMountedCondition(() => document.querySelector('[data-action="preview-add-streaming"]:not(:disabled)'), { label: "Streaming Add Preview action" });
				const dialog = requiredElement(document.querySelector(".streaming-source-dialog"), "Streaming Add dialog");
				const evidence = await ordinaryAddPreviewEvidence({ dialog, trigger, requests, selectorLabel: "United States of America" });
				return { ...evidence, requests, noMutation: serializedValue(controller) === serializedBefore, applyCalls: getApplyCalls() };
			},
		);
	}

	{
		const requests = [];
		const previewProvider = createTmdbGenrePreviewProvider({ fetchImpl: recordingFetch(requests) });
		results.genre = await withOrdinaryAddFlow(
			({ project, folder, onApply }) => createElement(GenreSourceFlow, { previewProvider, project, folder, onBack() {}, onCancel() {}, onApply }),
			async ({ controller, serializedBefore, getApplyCalls }) => {
				await clickAndSettle(requiredElement(document.querySelector('[data-genre-name="Comedy"]'), "Comedy Genre"));
				await clickAndSettle(requiredElement(document.querySelector('[data-genre-name="Horror"]'), "Horror Genre"));
				await clickAndSettle(requiredElement(buttonContaining(document.querySelector(".add-source-actions"), "Continue"), "Genre Continue"));
				const trigger = await waitForMountedCondition(() => document.querySelector('[data-action="preview-add-genre"]:not(:disabled)'), { label: "Genre Add Preview action" });
				const dialog = requiredElement(document.querySelector(".genre-source-dialog"), "Genre Add dialog");
				const evidence = await ordinaryAddPreviewEvidence({ dialog, trigger, requests, selectorLabel: "Horror" });
				return { ...evidence, requests, noMutation: serializedValue(controller) === serializedBefore, applyCalls: getApplyCalls() };
			},
		);
	}

	return { width: window.innerWidth, families: results };
}

async function runSourceEditLivePreviewScenario() {
	function required(element, label) {
		if (!element) throw new Error(`${label} was not rendered.`);
		return element;
	}
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	const controller = createController();
	const folder = importSources(controller, [collectionSource({ tmdbId: 645, title: "James Bond Collection" })]);
	const opened = openEdit(controller, folder.sources[0]);
	const requests = [];
	const provider = createTmdbCollectionProvider({ fetchImpl: recordingFetch(requests) });
	const serializedBefore = serializedValue(controller);
	const revisionBefore = controller.getState().revision;
	await act(async () => {
		root.render(createElement(SourceEditorDialog, {
			provider,
			session: opened.session,
			initialDraft: opened.draft,
			onCancel() {},
			onSave() { throw new Error("Preview must not enter Save."); },
		}));
		await afterCommittedEffects();
	});
	try {
		const dialog = required(document.querySelector('[data-source-edit-modal="true"]'), "Source Edit dialog");
		const input = required(dialog.querySelector("#source-edit-title-input"), "Source Edit title");
		await act(async () => {
			setInputValue(input, "Current Bond draft");
			await afterCommittedEffects();
		});
		const trigger = required(dialog.querySelector('[data-action="preview-source-edit"]'), "Source Edit Preview action");
		const requestFreeBeforeOpen = requests.length === 0;
		trigger.focus({ preventScroll: true });
		await clickAndSettle(trigger);
		const expectedVisibleCount = 10;
		const ready = await waitForReadyPosterGrid({
			preview: ".source-edit-preview-modal",
			gridSelector: ".source-edit-preview-grid",
			expectedVisibleCount,
			label: "Source Edit live Collection preview",
		});
		const modal = ready.preview;
		const firstRequestCount = requests.length;
		const activeScrollOwners = [...document.querySelectorAll("body *")].filter((element) => {
			if (element.closest('[inert]')) return false;
			const style = getComputedStyle(element);
			return ["auto", "scroll"].includes(style.overflowY) && element.scrollHeight > element.clientHeight + 1;
		});
		const openEvidence = {
			width: window.innerWidth,
			requestFreeBeforeOpen,
			requestCount: firstRequestCount,
			requestPath: requests[0] ?? null,
			draftLabel: modal.querySelector("h3")?.textContent.trim() ?? null,
			domPosterCount: ready.images.length,
			visiblePosterCount: ready.visibleImages.length,
			genuinePosters: genuineTmdbPosterImages(ready.visibleImages),
			posterOnly: [...ready.grid.children].every((entry) => entry.tagName === "IMG"),
			geometry: titlePreviewGeometry(modal, ready.grid),
			outerScrollInert: dialog.querySelector(".source-edit-scroll")?.inert === true,
			footerInert: dialog.querySelector(".source-edit-actions")?.inert === true,
			focusContained: modal.contains(document.activeElement),
			activeScrollOwnerCount: activeScrollOwners.length,
			noMutation: serializedValue(controller) === serializedBefore && controller.getState().revision === revisionBefore,
		};

		modal.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
		await afterCommittedEffects();
		const escapeClosed = document.querySelector(".source-edit-preview-modal") === null;
		const exactFocusRestored = document.activeElement === trigger;
		await clickAndSettle(trigger);
		await waitForReadyPosterGrid({ preview: ".source-edit-preview-modal", gridSelector: ".source-edit-preview-grid", expectedVisibleCount, label: "cached Source Edit preview" });
		const cacheReused = requests.length === firstRequestCount;
		await clickAndSettle(required(document.querySelector(".source-edit-preview-modal header button"), "Source Edit Preview close"));
		return {
			...openEvidence,
			escapeClosed,
			exactFocusRestored,
			cacheReused,
			closeRestoredFocus: document.activeElement === trigger,
			bodyLockRetained: document.body.style.position === "fixed",
			finalNoMutation: serializedValue(controller) === serializedBefore,
		};
	} finally {
		await act(async () => root.unmount());
		host.remove();
	}
}

async function runDecadesLivePreviewScenario() {
	function required(element, label) {
		if (!element) throw new Error(`${label} was not rendered.`);
		return element;
	}
	function sourceSelectorEvidence(modal) {
		const selector = required(modal.querySelector('.decades-preview-source-selector[aria-label="Preview source"]'), "Decades Preview source selector");
		const buttons = [...selector.querySelectorAll(':scope > button[role="tab"]')];
		const style = getComputedStyle(selector);
		const tops = buttons.map((button) => Math.round(button.getBoundingClientRect().top));
		return {
			labels: buttons.map((button) => button.textContent.trim()),
			selected: buttons.find((button) => button.getAttribute("aria-selected") === "true")?.textContent.trim() ?? null,
			oneLine: new Set(tops).size === 1 && style.flexWrap === "nowrap",
			horizontalScroll: style.overflowX === "auto" || style.overflowX === "scroll",
			verticalClipping: style.overflowY === "hidden" || style.overflowY === "clip",
			hasOverflowAtMobile: window.innerWidth > 520 || selector.scrollWidth > selector.clientWidth,
		};
	}
	function selectedMedia(modal) {
		return modal.querySelector('[role="tablist"][aria-label="Preview media"] [role="tab"][aria-selected="true"]')?.textContent.trim() ?? null;
	}
	function activeScrollOwnerCount(modal) {
		return [...modal.querySelectorAll("*")].filter((element) => {
			const overflowY = getComputedStyle(element).overflowY;
			return (overflowY === "auto" || overflowY === "scroll") && element.scrollHeight > element.clientHeight + 1;
		}).length;
	}
	async function waitForSettledPosterGrid(preview, label) {
		return waitForMountedCondition(() => {
			const grid = preview.querySelector(".decades-preview-grid");
			const empty = preview.querySelector('[data-preview-empty-state="true"]');
			const state = preview.querySelector(".studio-preview-state");
			if (state !== null || (!grid && !empty)) return null;
			const images = grid ? [...grid.querySelectorAll(":scope > img")].filter(visibleElement) : [];
			if (images.some((image) => !image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0)) return null;
			return { grid, images, empty: empty !== null };
		}, { label, timeoutMs: 30_000 });
	}
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	const controller = createController();
	const requests = [];
	const previewProvider = createTmdbDecadesPreviewProvider({ fetchImpl: recordingFetch(requests) });
	const revisionBefore = controller.getState().revision;
	const serializedBefore = serializedValue(controller);
	await act(async () => {
		root.render(createElement(CreationDialog, {
			scope: "new-collection",
			project: controller.getState().project,
			projectRevision: revisionBefore,
			currentYear: 2026,
			initialOptionId: "decades",
			decadePreviewProvider: previewProvider,
			onCancel() {},
			onCreateBlank() {},
			onApplyDecades() { throw new Error("Preview must not apply the Decades plan."); },
		}));
		await afterCommittedEffects();
	});
	try {
		const dialog = required(document.querySelector('[data-creation-dialog="true"]'), "Decades creation dialog");
		await clickAndSettle(required(dialog.querySelector('[data-decade-preset="1980s"]'), "1980s preset"));
		await clickAndSettle(required(dialog.querySelector(".decades-creation-actions button"), "Decades Continue"));
		const wholeDecadeChoice = required(inputContaining(dialog, "Decade overview"), "Decade overview content choice");
		const individualYearsChoice = required(inputContaining(dialog, "Individual years"), "Individual years content choice");
		if (!wholeDecadeChoice.checked) await clickAndSettle(wholeDecadeChoice);
		if (!individualYearsChoice.checked) await clickAndSettle(individualYearsChoice);
		const catalogue = required(dialog.querySelector(".decades-preview-catalogue"), "Decades Preview catalogue");
		const lightweightClosed = !catalogue.open
			&& catalogue.querySelector(".decades-preview-group") === null
			&& requests.length === 0;
		await clickAndSettle(required(catalogue.querySelector(":scope > summary"), "Preview catalogue summary"));
		const group = required(catalogue.querySelector(".decades-preview-group"), "1980s Preview group");
		const row = required(group.querySelector(".decades-preview-row"), "1980s Decade Preview row");
		const trigger = required(row.querySelector('button[aria-haspopup="dialog"]'), "Decades Preview action");
		const compactOlderGroup = catalogue.querySelectorAll(".decades-preview-group").length === 1
			&& group.tagName === "ARTICLE"
			&& group.querySelectorAll(".decades-preview-row").length === 1
			&& group.querySelector("details, summary") === null
			&& row.querySelector("small")?.textContent.trim() === "11 sources"
			&& trigger.parentElement?.className === "genre-hierarchy-configure-row-actions";
		const requestFreeBeforeExplicitPreview = requests.length === 0;
		trigger.focus({ preventScroll: true });
		await clickAndSettle(trigger);
		const expectedSampleCount = 10;
		const movieReady = await waitForReadyPosterGrid({ preview: ".decades-preview-modal", gridSelector: ".decades-preview-grid", expectedVisibleCount: expectedSampleCount, label: "live 1980s Decade sample Movies Preview" });
		const modal = movieReady.preview;
		const olderMovieSampleRequests = [...requests];
		const olderSelector = sourceSelectorEvidence(modal);
		const sampleHelper = modal.querySelector(".decades-preview-sample-helper")?.textContent.trim() ?? null;
		const moviesInitiallySelected = selectedMedia(modal) === "Movies";
		const seriesTab = required(buttonContaining(modal.querySelector('[role="tablist"][aria-label="Preview media"]'), "Series"), "Decades Series tab");
		await clickAndSettle(seriesTab);
		const seriesReady = await waitForReadyPosterGrid({ preview: ".decades-preview-modal", gridSelector: ".decades-preview-grid", expectedVisibleCount: expectedSampleCount, label: "live 1980s Decade sample Series Preview" });
		const olderSeriesSampleRequests = requests.slice(olderMovieSampleRequests.length);
		const seriesModal = seriesReady.preview;
		const seriesSelected = selectedMedia(seriesModal) === "Series";

		const allChoice = required(buttonContaining(seriesModal.querySelector(".decades-preview-source-selector"), "All 1980s"), `All 1980s source choice (${sourceSelectorEvidence(seriesModal).labels.join(", ")})`);
		const beforeAllSeries = requests.length;
		await clickAndSettle(allChoice);
		const expectedExactCount = 10;
		const allSeriesReady = await waitForReadyPosterGrid({ preview: ".decades-preview-modal", gridSelector: ".decades-preview-grid", expectedVisibleCount: expectedExactCount, label: "live exact All 1980s Series Preview" });
		const allSeriesModal = allSeriesReady.preview;
		const allSeriesRequests = requests.slice(beforeAllSeries);
		const exactHelperAbsent = allSeriesModal.querySelector(".decades-preview-sample-helper") === null;
		const allSeriesSelected = sourceSelectorEvidence(allSeriesModal).selected === "All 1980s" && selectedMedia(allSeriesModal) === "Series";

		const beforeAllMovies = requests.length;
		await clickAndSettle(required(buttonContaining(allSeriesModal.querySelector('[role="tablist"][aria-label="Preview media"]'), "Movies"), "All 1980s Movies tab"));
		const allMoviesReady = await waitForReadyPosterGrid({ preview: ".decades-preview-modal", gridSelector: ".decades-preview-grid", expectedVisibleCount: expectedExactCount, label: "live exact All 1980s Movies Preview" });
		const allMoviesModal = allMoviesReady.preview;
		const allMovieRequests = requests.slice(beforeAllMovies);

		const beforeCachedYear = requests.length;
		await clickAndSettle(required(buttonContaining(allMoviesModal.querySelector(".decades-preview-source-selector"), "1984"), "1984 exact source choice"));
		const exactYearReady = await waitForReadyPosterGrid({ preview: ".decades-preview-modal", gridSelector: ".decades-preview-grid", expectedVisibleCount: expectedExactCount, label: "cached exact 1984 Movies Preview" });
		const exactYearModal = exactYearReady.preview;
		const exactYearReusedSampleCache = requests.length === beforeCachedYear
			&& sourceSelectorEvidence(exactYearModal).selected === "1984"
			&& exactYearModal.querySelector(".decades-preview-sample-helper") === null;

		const beforeReturnToSample = requests.length;
		await clickAndSettle(required(buttonContaining(exactYearModal.querySelector(".decades-preview-source-selector"), "Decade sample"), "Decade sample source choice"));
		const restoredSampleReady = await waitForReadyPosterGrid({ preview: ".decades-preview-modal", gridSelector: ".decades-preview-grid", expectedVisibleCount: expectedSampleCount, label: "cached restored 1980s sample Movies Preview" });
		const restoredSampleModal = restoredSampleReady.preview;
		const sampleCacheReused = requests.length === beforeReturnToSample
			&& sourceSelectorEvidence(restoredSampleModal).selected === "Decade sample"
			&& restoredSampleModal.querySelector(".decades-preview-sample-helper") !== null;
		const openEvidence = {
			width: window.innerWidth,
			lightweightClosed,
			compactOlderGroup,
			requestFreeBeforeExplicitPreview,
			olderMovieSampleRequests,
			olderSeriesSampleRequests,
			allSeriesRequests,
			allMovieRequests,
			olderSelector,
			sampleHelper,
			moviesInitiallySelected,
			seriesSelected,
			exactHelperAbsent,
			allSeriesSelected,
			exactYearReusedSampleCache,
			sampleCacheReused,
			movieSamplePosterCount: movieReady.visibleImages.length,
			seriesSamplePosterCount: seriesReady.visibleImages.length,
			restoredSamplePosterCount: restoredSampleReady.visibleImages.length,
			allSeriesPosterCount: allSeriesReady.visibleImages.length,
			allMoviePosterCount: allMoviesReady.visibleImages.length,
			geometry: titlePreviewGeometry(restoredSampleModal, restoredSampleReady.grid),
			genuineMoviePosters: genuineTmdbPosterImages(movieReady.visibleImages),
			genuineSeriesPosters: genuineTmdbPosterImages(seriesReady.visibleImages),
			genuineAllSeriesPosters: genuineTmdbPosterImages(allSeriesReady.visibleImages),
			genuineAllMoviePosters: genuineTmdbPosterImages(allMoviesReady.visibleImages),
			oneModal: document.querySelectorAll(".decades-preview-modal").length === 1,
			outerScrollInert: dialog.querySelector(".decades-creation-form > .add-source-scroll")?.inert === true,
			footerInert: dialog.querySelector(".decades-creation-actions")?.inert === true,
			focusContained: restoredSampleModal.contains(document.activeElement),
			activeScrollOwnerCount: activeScrollOwnerCount(restoredSampleModal),
			noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth,
			noMutation: serializedValue(controller) === serializedBefore && controller.getState().revision === revisionBefore,
		};
		await clickAndSettle(required(restoredSampleModal.querySelector("header button"), "Decades Preview Close"));
		const exactFocusRestored = document.activeElement === trigger;

		await clickAndSettle(required(dialog.querySelector('header [data-action="back-to-decades-presets"]'), "Back to Decade presets"));
		await clickAndSettle(required(dialog.querySelector('[data-decade-preset="1980s"]'), "selected 1980s preset"));
		await clickAndSettle(required(dialog.querySelector('[data-decade-preset="2020s"]'), "2020s preset"));
		await clickAndSettle(required(dialog.querySelector(".decades-creation-actions button"), "Decades Continue for current decade"));
		const individualYearsPersisted = inputContaining(dialog, "Individual years")?.checked === true;
		const currentCatalogue = required(dialog.querySelector(".decades-preview-catalogue"), "current Decades Preview catalogue");
		await clickAndSettle(required(currentCatalogue.querySelector(":scope > summary"), "current Preview catalogue summary"));
		const currentGroup = required(currentCatalogue.querySelector(".decades-preview-group"), "2020s Preview group");
		const currentRow = required(currentGroup.querySelector(".decades-preview-row"), "2020s Decade Preview row");
		const currentTrigger = required(currentRow.querySelector('button[aria-haspopup="dialog"]'), "2020s Preview action");
		const compactCurrentGroup = currentCatalogue.querySelectorAll(".decades-preview-group").length === 1
			&& currentGroup.querySelectorAll(".decades-preview-row").length === 1
			&& currentRow.querySelector("small")?.textContent.trim() === "11 sources";
		const beforeCurrentSample = requests.length;
		currentTrigger.focus({ preventScroll: true });
		await clickAndSettle(currentTrigger);
		const expectedCurrentSampleCount = 7;
		const currentReady = await waitForReadyPosterGrid({ preview: ".decades-preview-modal", gridSelector: ".decades-preview-grid", expectedVisibleCount: expectedCurrentSampleCount, label: "live current 2020s sample Movies Preview" });
		const currentModal = currentReady.preview;
		const currentSampleRequests = requests.slice(beforeCurrentSample);
		const currentSelector = sourceSelectorEvidence(currentModal);
		const currentHelper = currentModal.querySelector(".decades-preview-sample-helper")?.textContent.trim() ?? null;
		const currentGeometry = titlePreviewGeometry(currentModal, currentReady.grid);
		const currentNoMutation = serializedValue(controller) === serializedBefore && controller.getState().revision === revisionBefore;
		const beforeFutureExact = requests.length;
		await clickAndSettle(required(buttonContaining(currentModal.querySelector(".decades-preview-source-selector"), "2029"), "2029 exact source choice"));
		const futureExact = await waitForSettledPosterGrid(currentModal, "live exact future 2029 Movies Preview");
		const futureExactRequests = requests.slice(beforeFutureExact);
		const futureExactEvidence = {
			requests: futureExactRequests,
			selected: sourceSelectorEvidence(currentModal).selected,
			posterCount: futureExact.images.length,
			empty: futureExact.empty,
			genuinePosters: futureExact.images.length === 0 || genuineTmdbPosterImages(futureExact.images),
			sampleHelperAbsent: currentModal.querySelector(".decades-preview-sample-helper") === null,
			geometry: futureExact.grid ? titlePreviewGeometry(currentModal, futureExact.grid) : null,
			noMutation: serializedValue(controller) === serializedBefore && controller.getState().revision === revisionBefore,
		};
		currentModal.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
		await afterCommittedEffects();
		return {
			...openEvidence,
			exactFocusRestored,
			individualYearsPersisted,
			compactCurrentGroup,
			currentSampleRequests,
			currentSelector,
			currentHelper,
			currentSamplePosterCount: currentReady.visibleImages.length,
			currentGeometry,
			genuineCurrentPosters: genuineTmdbPosterImages(currentReady.visibleImages),
			currentNoMutation,
			futureExact: futureExactEvidence,
			escapeClosed: document.querySelector(".decades-preview-modal") === null,
			escapeFocusRestored: document.activeElement === currentTrigger,
			totalRequestCount: requests.length,
			finalNoMutation: serializedValue(controller) === serializedBefore,
		};
	} finally {
		await act(async () => root.unmount());
		host.remove();
	}
}

async function runDecadeSourceLayoutScenario() {
	function required(element, label) {
		if (!element) throw new Error(`${label} was not rendered.`);
		return element;
	}
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	const controller = createController();
	const folder = importSources(controller, []);
	controller.selectNode(folder.internalId);
	const revisionBefore = controller.getState().revision;
	const serializedBefore = serializedValue(controller);
	let cancelCalls = 0;
	await act(async () => {
		root.render(createElement(DecadeSourceFlow, {
			project: controller.getState().project,
			folder,
			previewProvider: null,
			onBack() {},
			onCancel() { cancelCalls += 1; },
			onApply() { throw new Error("Layout verification must not save."); },
		}));
		await afterCommittedEffects();
	});
	try {
		const dialog = required(document.querySelector('.decade-source-dialog[data-source-mode="tmdb-decade"]'), "Decade Add Source dialog");
		const scroll = required(dialog.querySelector(".add-source-scroll"), "Decade Add Source scroll owner");
		const fieldset = (label) => required([...dialog.querySelectorAll("fieldset")].find((entry) => entry.querySelector(":scope > legend")?.textContent.trim().startsWith(label)), `${label} fieldset`);
		const mediaFieldset = fieldset("Media");
		const sortFieldset = fieldset("Sort titles by");
		const decadeFieldset = fieldset("Decade");
		let yearFieldset = fieldset("Year");
		const genreFieldset = fieldset("Genre sources");
		const initialYearLabels = [...yearFieldset.querySelectorAll("label")].map((entry) => entry.textContent.trim());
		const initialYearSelection = [...yearFieldset.querySelectorAll('input[name="decade-source-year"]:checked')].map((input) => input.value);
		await clickAndSettle(required(decadeFieldset.querySelector('input[value="1980s"]'), "1980s Decade choice"));
		yearFieldset = fieldset("Year");
		const eightiesYearLabels = [...yearFieldset.querySelectorAll("label")].map((entry) => entry.textContent.trim());
		await clickAndSettle(required(yearFieldset.querySelector('input[value="year-1985"]'), "1985 Year choice"));
		const firstIndividualSelection = [...yearFieldset.querySelectorAll('input[name="decade-source-year"]:checked')].map((input) => input.value);
		await clickAndSettle(required(yearFieldset.querySelector('input[value="year-1988"]'), "1988 Year choice"));
		await clickAndSettle(required(yearFieldset.querySelector('input[value="year-1981"]'), "1981 Year choice"));
		const multiYearSelection = [...yearFieldset.querySelectorAll('input[name="decade-source-year"]:checked')].map((input) => input.value);
		await clickAndSettle(required(yearFieldset.querySelector('input[value="year-1985"]'), "toggle 1985 Year choice"));
		const toggledYearSelection = [...yearFieldset.querySelectorAll('input[name="decade-source-year"]:checked')].map((input) => input.value);
		await clickAndSettle(required(yearFieldset.querySelector('input[value="1980s"]'), "All 1980s choice"));
		const allClearsIndividuals = [...yearFieldset.querySelectorAll('input[name="decade-source-year"]:checked')].map((input) => input.value);
		await clickAndSettle(required(yearFieldset.querySelector('input[value="year-1981"]'), "single 1981 Year choice"));
		await clickAndSettle(required(yearFieldset.querySelector('input[value="year-1981"]'), "deselect final 1981 Year choice"));
		const finalIndividualRestoresAll = [...yearFieldset.querySelectorAll('input[name="decade-source-year"]:checked')].map((input) => input.value);
		await clickAndSettle(required(decadeFieldset.querySelector('input[value="1950s-and-earlier"]'), "1950s and Earlier choice"));
		yearFieldset = fieldset("Year");
		const earlierYearLabels = [...yearFieldset.querySelectorAll("label")].map((entry) => entry.textContent.trim());
		const earlierResetSelection = [...yearFieldset.querySelectorAll('input[name="decade-source-year"]:checked')].map((input) => input.value);
		await clickAndSettle(required(yearFieldset.querySelector('input[value="year-1958"]'), "1958 Year choice"));
		await clickAndSettle(required(yearFieldset.querySelector('input[value="before-1950"]'), "Before 1950 choice"));
		await clickAndSettle(required(yearFieldset.querySelector('input[value="year-1951"]'), "1951 Year choice"));
		const earlierMultiSelection = [...yearFieldset.querySelectorAll('input[name="decade-source-year"]:checked')].map((input) => input.value);
		await clickAndSettle(required(decadeFieldset.querySelector('input[value="2020s"]'), "2020s Decade choice"));
		yearFieldset = fieldset("Year");
		const resetYearSelection = [...yearFieldset.querySelectorAll('input[name="decade-source-year"]:checked')].map((input) => input.value);
		const initialReviewSourceCount = dialog.querySelectorAll(".decade-source-review-list li").length;
		await clickAndSettle(required(yearFieldset.querySelector('input[value="year-2028"]'), "2028 future Year choice"));
		await clickAndSettle(required(yearFieldset.querySelector('input[value="year-2021"]'), "2021 Year choice"));
		await clickAndSettle(required(yearFieldset.querySelector('input[value="year-2025"]'), "2025 Year choice"));
		const futureMultiSelection = [...yearFieldset.querySelectorAll('input[name="decade-source-year"]:checked')].map((input) => input.value);
		const genreIndicatorsAbsent = genreFieldset.querySelectorAll(".selectable-card-indicator").length === 0;
		const firstGenreInput = required(genreFieldset.querySelector('input[type="checkbox"]'), "first Genre checkbox");
		const firstGenreLabel = required(firstGenreInput.closest("label"), "first Genre label");
		const unselectedGenreStyle = getComputedStyle(firstGenreLabel);
		const unselectedGenreVisual = { background: unselectedGenreStyle.backgroundColor, border: unselectedGenreStyle.borderColor };
		firstGenreInput.focus({ preventScroll: true });
		const genreFocusVisible = document.activeElement === firstGenreInput && getComputedStyle(firstGenreLabel).outlineStyle !== "none";
		await clickAndSettle(firstGenreInput);
		const selectedGenreStyle = getComputedStyle(firstGenreLabel);
		const selectedGenreVisual = { background: selectedGenreStyle.backgroundColor, border: selectedGenreStyle.borderColor };
		await clickAndSettle(required(buttonContaining(genreFieldset, "Select all"), "Select all Genre sources"));
		const selectedGenreCount = genreFieldset.querySelectorAll('input[type="checkbox"]:checked').length;
		const selectAllDisabled = buttonContaining(genreFieldset, "Select all")?.disabled === true;
		const clearEnabled = buttonContaining(genreFieldset, "Clear")?.disabled === false;
		const footer = required(dialog.querySelector(".decade-source-actions"), "Decade Add Source footer");
		const save = required(buttonContaining(footer, "Add 54 sources"), "Add action");
		const footerLabels = [...footer.querySelectorAll("button")].map((button) => button.textContent.trim());
		const preview = required(buttonContaining(dialog, "Preview titles"), "Preview titles action");
		const viewport = window.visualViewport;
		const viewportBounds = {
			left: viewport?.offsetLeft ?? 0,
			top: viewport?.offsetTop ?? 0,
			right: (viewport?.offsetLeft ?? 0) + (viewport?.width ?? window.innerWidth),
			bottom: (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight),
		};
		const dialogRect = dialog.getBoundingClientRect();
		const footerRect = footer.getBoundingClientRect();
		const intendedScrollOwners = [dialog, ...dialog.querySelectorAll("*")].filter((element) => {
			const style = getComputedStyle(element);
			return style.overflowY === "auto" || style.overflowY === "scroll";
		});
		const reviewRows = [...dialog.querySelectorAll(".decade-source-review-list li")];
		const reviewNoCollisions = reviewRows.every((row) => {
			const [identity, status] = row.children;
			const a = identity.getBoundingClientRect();
			const b = status.getBoundingClientRect();
			return a.right <= b.left + 1 || a.bottom <= b.top + 1 || b.bottom <= a.top + 1;
		});
		const advanced = required(dialog.querySelector(".decades-advanced-options"), "Advanced options");
		await clickAndSettle(required(advanced.querySelector(":scope > summary"), "Advanced options summary"));
		const configure = required(buttonContaining(advanced, "Configure"), "Genre exclusions Configure action");
		configure.focus({ preventScroll: true });
		await clickAndSettle(configure);
		const secondary = required(dialog.querySelector('.genre-secondary-surface[data-surface="ordinary-exclusions"]'), "Decade exclusions surface");
		const secondaryRect = secondary.getBoundingClientRect();
		const secondaryHeading = required(secondary.querySelector("#decade-source-exclusion-title"), "Decade exclusions heading");
		const secondaryEvidence = {
			contained: secondaryRect.left >= dialogRect.left - 1 && secondaryRect.top >= dialogRect.top - 1 && secondaryRect.right <= dialogRect.right + 1 && secondaryRect.bottom <= dialogRect.bottom + 1,
			headingFocused: document.activeElement === secondaryHeading,
			outerInert: scroll.inert === true,
			noHorizontalOverflow: secondary.scrollWidth <= secondary.clientWidth + 1,
		};
		await clickAndSettle(required(buttonContaining(secondary, "Done"), "Decade exclusions Done action"));
		const restoredFooter = await waitForMountedCondition(
			() => dialog.querySelector(".decade-source-actions"),
			{ label: "Decade Add Source footer after closing exclusions" },
		);
		const secondaryFocusRestored = document.activeElement === configure;
		await clickAndSettle(required(buttonContaining(genreFieldset, "Clear"), "Clear Genre sources"));
		const clearedGenreCount = genreFieldset.querySelectorAll('input[type="checkbox"]:checked').length;
		const clearedReviewSourceCount = dialog.querySelectorAll(".decade-source-review-list li").length;
		const restoredFooterLabels = [...restoredFooter.querySelectorAll("button")].map((button) => button.textContent.trim());
		const footerCancelAbsent = buttonContaining(restoredFooter, "Cancel") === null;
		await clickAndSettle(required(dialog.querySelector(".add-source-close-action"), "Close Add Decade source"));
		return {
			width: window.innerWidth,
			modeId: dialog.dataset.sourceMode,
			controlOrder: [...dialog.querySelectorAll('[data-decade-source-control], details[data-decades-advanced], .decade-source-generated, .decade-source-preview-action')].map((entry) => entry.dataset.decadeSourceControl ?? (entry.matches("details") ? "advanced" : entry.matches(".decade-source-generated") ? "generated" : "preview")),
			mediaLabels: [mediaFieldset.querySelector(":scope > legend"), ...mediaFieldset.querySelectorAll("label")].map((element) => element.textContent.trim()).filter(Boolean),
			sortLabels: [sortFieldset.querySelector(":scope > legend"), ...sortFieldset.querySelectorAll("label")].map((element) => element.textContent.trim()).filter(Boolean),
			decadeChoiceCount: decadeFieldset.querySelectorAll('input[type="radio"]').length,
			initialYearLabels,
			eightiesYearLabels,
			earlierYearLabels,
			initialYearSelection,
			firstIndividualSelection,
			multiYearSelection,
			toggledYearSelection,
			allClearsIndividuals,
			finalIndividualRestoresAll,
			earlierResetSelection,
			earlierMultiSelection,
			resetYearSelection,
			futureMultiSelection,
			radioSemantics: [...mediaFieldset.querySelectorAll("input"), ...sortFieldset.querySelectorAll("input"), ...decadeFieldset.querySelectorAll("input")].every((input) => input.type === "radio" && input.getBoundingClientRect().width <= 1),
			yearCheckboxSemantics: [...yearFieldset.querySelectorAll("input")].every((input) => input.type === "checkbox" && input.getBoundingClientRect().width <= 1),
			genreChoiceCount: genreFieldset.querySelectorAll('input[type="checkbox"]').length,
			genreCheckboxSemantics: [...genreFieldset.querySelectorAll('input[type="checkbox"]')].every((input) => input.getBoundingClientRect().width <= 1),
			genreIndicatorsAbsent,
			genreFocusVisible,
			genreVisualStateChanged: unselectedGenreVisual.background !== selectedGenreVisual.background || unselectedGenreVisual.border !== selectedGenreVisual.border,
			selectedGenreCount,
			selectAllDisabled,
			clearEnabled,
			footerLabels,
			restoredFooterLabels,
			footerCancelAbsent,
			clearedGenreCount,
			clearedReviewSourceCount,
			initialReviewSourceCount,
			reviewSourceCount: reviewRows.length,
			reviewNoCollisions,
			intendedScrollOwnerCount: intendedScrollOwners.length,
			intendedScrollOwnerIsInner: intendedScrollOwners.length === 1 && intendedScrollOwners[0] === scroll,
			dialogWithinViewport: dialogRect.left >= viewportBounds.left - 1 && dialogRect.top >= viewportBounds.top - 1 && dialogRect.right <= viewportBounds.right + 1 && dialogRect.bottom <= viewportBounds.bottom + 1,
			footerReachable: footerRect.left >= viewportBounds.left - 1 && footerRect.right <= viewportBounds.right + 1 && footerRect.bottom <= viewportBounds.bottom + 1,
			previewSecondary: preview.classList.contains("secondary-action") === false && !preview.classList.contains("editor-apply") && save.classList.contains("editor-apply"),
			bodyLocked: document.body.style.position === "fixed",
			pageNoHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth,
			secondary: secondaryEvidence,
			secondaryFocusRestored,
			cancelCalls,
			noMutation: controller.getState().revision === revisionBefore && serializedValue(controller) === serializedBefore,
		};
	} finally {
		await act(async () => root.unmount());
		host.remove();
	}
}

async function runDecadeSourceOverlapFooterScenario(existingDraftCount) {
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	const controller = createController();
	const collection = controller.createCollection({ editable: { title: "Collection" } });
	const folderResult = controller.createFolder(collection.createdInternalId, { editable: { title: "Decade picks" } });
	const built = buildDecadeSourceBundleDrafts();
	if (!built.ok) throw new Error("Default Decade Add Source drafts did not build.");
	for (const draft of built.drafts.slice(0, existingDraftCount)) controller.createSource(folderResult.createdInternalId, draft);
	const project = controller.getState().project;
	const folder = project.collections[0].folders[0];
	await act(async () => {
		root.render(createElement(DecadeSourceFlow, {
			project,
			folder,
			previewProvider: null,
			onBack() {},
			onCancel() {},
			onApply() { throw new Error("Overlap footer verification must not save."); },
		}));
		await afterCommittedEffects();
	});
	try {
		const dialog = document.querySelector('.decade-source-dialog[data-source-mode="tmdb-decade"]');
		const footer = dialog?.querySelector(".decade-source-actions");
		if (!dialog || !footer) throw new Error("Decade overlap footer was not rendered.");
		const buttons = [...footer.querySelectorAll("button")];
		const rects = buttons.map((button) => {
			const rect = button.getBoundingClientRect();
			return {
				label: button.textContent.trim(),
				disabled: button.disabled,
				left: rect.left,
				right: rect.right,
				top: rect.top,
				width: rect.width,
			};
		});
		const dialogRect = dialog.getBoundingClientRect();
		const footerRect = footer.getBoundingClientRect();
		return {
			width: window.innerWidth,
			existingDraftCount,
			labels: rects.map((entry) => entry.label),
			disabled: rects.map((entry) => entry.disabled),
			beside: rects.length < 2 || Math.abs(rects[0].top - rects[1].top) < 1,
			buttonWidths: rects.map((entry) => entry.width),
			ordered: rects.every((entry, index) => index === 0 || entry.top > rects[index - 1].top || entry.left >= rects[index - 1].right - 1),
			overrideLayout: footer.classList.contains("add-source-override-actions"),
			headerBeforeFooter: [...dialog.querySelectorAll("button")].indexOf(dialog.querySelector('[data-action="back-to-source-types"]')) < [...dialog.querySelectorAll("button")].indexOf(buttons[0]) && [...dialog.querySelectorAll("button")].indexOf(dialog.querySelector(".add-source-close-action")) < [...dialog.querySelectorAll("button")].indexOf(buttons[0]),
			sticky: Math.abs(dialogRect.bottom - footerRect.bottom) < 2,
			noHorizontalOverflow: dialog.scrollWidth <= dialog.clientWidth + 1 && document.documentElement.scrollWidth <= window.innerWidth,
		};
	} finally {
		await act(async () => root.unmount());
		host.remove();
	}
}

let decadeSourceGenreKeyboardSession = null;

async function prepareDecadeSourceGenreKeyboardScenario() {
	if (decadeSourceGenreKeyboardSession) throw new Error("Decade Genre keyboard scenario is already mounted.");
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	const controller = createController();
	const folder = importSources(controller, []);
	controller.selectNode(folder.internalId);
	const revisionBefore = controller.getState().revision;
	const serializedBefore = serializedValue(controller);
	await act(async () => {
		root.render(createElement(DecadeSourceFlow, {
			project: controller.getState().project,
			folder,
			previewProvider: null,
			onBack() {},
			onCancel() {},
			onApply() { throw new Error("Keyboard verification must not save."); },
		}));
		await afterCommittedEffects();
	});
	const input = document.querySelector('.decade-source-dialog [data-decade-source-control="genres"] input[type="checkbox"]');
	const label = input?.closest("label");
	if (!input || !label) {
		await act(async () => root.unmount());
		host.remove();
		throw new Error("Decade Genre keyboard checkbox was not rendered.");
	}
	const style = getComputedStyle(label);
	const unselectedVisual = { background: style.backgroundColor, border: style.borderColor };
	input.focus({ preventScroll: true });
	decadeSourceGenreKeyboardSession = { host, root, controller, input, label, revisionBefore, serializedBefore, unselectedVisual };
	return {
		checkedBefore: input.checked,
		focused: document.activeElement === input,
		inputType: input.type,
		hiddenNativeControl: input.getBoundingClientRect().width <= 1,
		focusVisible: getComputedStyle(label).outlineStyle !== "none",
	};
}

async function finishDecadeSourceGenreKeyboardScenario() {
	const session = decadeSourceGenreKeyboardSession;
	if (!session) throw new Error("Decade Genre keyboard scenario was not prepared.");
	decadeSourceGenreKeyboardSession = null;
	try {
		await act(async () => afterCommittedEffects());
		const style = getComputedStyle(session.label);
		const selectedVisual = { background: style.backgroundColor, border: style.borderColor };
		return {
			checkedAfterSpace: session.input.checked,
			selectedStateExposed: session.label.dataset.selected === "true",
			selectedVisualChanged: session.unselectedVisual.background !== selectedVisual.background || session.unselectedVisual.border !== selectedVisual.border,
			noMutation: session.controller.getState().revision === session.revisionBefore && serializedValue(session.controller) === session.serializedBefore,
		};
	} finally {
		await act(async () => session.root.unmount());
		session.host.remove();
	}
}

async function runDecadeSourcePreviewErrorScenario() {
	function required(element, label) {
		if (!element) throw new Error(`${label} was not rendered.`);
		return element;
	}
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	const controller = createController();
	const folder = importSources(controller, []);
	controller.selectNode(folder.internalId);
	const serializedBefore = serializedValue(controller);
	const revisionBefore = controller.getState().revision;
	let calls = 0;
	const previewProvider = {
		async getDecadePreview() {
			calls += 1;
			if (calls === 1) return { ok: false, error: { kind: "network", message: "Temporary preview failure.", retryable: true } };
			return { ok: true, data: { totalResults: 0, mediaType: "MOVIE", results: [] }, fromCache: false };
		},
	};
	await act(async () => {
		root.render(createElement(DecadeSourceFlow, {
			project: controller.getState().project,
			folder,
			previewProvider,
			onBack() {},
			onCancel() {},
			onApply() { throw new Error("Preview error verification must not save."); },
		}));
		await afterCommittedEffects();
	});
	try {
		const dialog = required(document.querySelector(".decade-source-dialog"), "Decade Add Source dialog");
		const trigger = required(buttonContaining(dialog, "Preview titles"), "Preview titles action");
		trigger.focus({ preventScroll: true });
		await clickAndSettle(trigger);
		const error = await waitForMountedCondition(() => document.querySelector(".decade-add-preview-modal [role=\"alert\"]"), { label: "Decade Preview recoverable error" });
		const errorMessage = error.textContent.includes("Temporary preview failure.");
		const modal = required(document.querySelector(".decade-add-preview-modal"), "Decade Preview modal");
		const redundantSelectors = {
			yearAbsent: modal.querySelector('[role="tablist"][aria-label="Preview year"]') === null,
			sourceAbsent: modal.querySelector('[role="tablist"][aria-label="Preview source"]') === null,
			mediaLabels: [...modal.querySelectorAll('[role="tablist"][aria-label="Preview media"] > button')].map((button) => button.textContent.trim()),
		};
		await clickAndSettle(required(buttonContaining(error, "Retry"), "Decade Preview Retry"));
		const empty = await waitForMountedCondition(() => document.querySelector('.decade-add-preview-modal [data-preview-empty-state="true"]'), { label: "Decade Preview retry empty state" });
		await clickAndSettle(required(document.querySelector(".decade-add-preview-modal header button"), "Decade Preview Close"));
		return {
			calls,
			errorMessage,
			redundantSelectors,
			retryRecovered: empty.textContent.includes("No posters available."),
			closed: document.querySelector(".decade-add-preview-modal") === null,
			exactFocusRestored: document.activeElement === trigger,
			noMutation: controller.getState().revision === revisionBefore && serializedValue(controller) === serializedBefore,
		};
	} finally {
		await act(async () => root.unmount());
		host.remove();
	}
}

async function runDecadeSourceLivePreviewScenario() {
	function required(element, label) {
		if (!element) throw new Error(`${label} was not rendered.`);
		return element;
	}
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	const controller = createController();
	const folder = importSources(controller, []);
	controller.selectNode(folder.internalId);
	const requests = [];
	const previewProvider = createTmdbDecadesPreviewProvider({
		fetchImpl: async (input, init) => {
			const response = await fetch(input, init);
			let payload = null;
			try { payload = await response.clone().json(); } catch { payload = null; }
			requests.push({ url: typeof input === "string" ? input : input.url, status: response.status, ok: response.ok, contentType: response.headers.get("content-type"), totalResults: payload?.total_results ?? null });
			return response;
		},
	});
	const revisionBefore = controller.getState().revision;
	const serializedBefore = serializedValue(controller);
	await act(async () => {
		root.render(createElement(DecadeSourceFlow, {
			project: controller.getState().project,
			folder,
			previewProvider,
			onBack() {},
			onCancel() {},
			onApply() { throw new Error("Live Preview must not save."); },
		}));
		await afterCommittedEffects();
	});
	try {
		const dialog = required(document.querySelector(".decade-source-dialog"), "Decade Add Source dialog");
		await clickAndSettle(required(dialog.querySelector('input[name="decade-source-decade"][value="1980s"]'), "1980s Decade choice"));
		const yearFieldset = required(dialog.querySelector('[data-decade-source-control="year"]'), "Year fieldset");
		await clickAndSettle(required(yearFieldset.querySelector('input[value="year-1988"]'), "1988 Year choice"));
		await clickAndSettle(required(yearFieldset.querySelector('input[value="year-1981"]'), "1981 Year choice"));
		await clickAndSettle(required(yearFieldset.querySelector('input[value="year-1985"]'), "1985 Year choice"));
		const configuredYearSelection = [...yearFieldset.querySelectorAll('input[name="decade-source-year"]:checked')].map((input) => input.value);
		const genreFieldset = required(dialog.querySelector('[data-decade-source-control="genres"]'), "Genre sources fieldset");
		await clickAndSettle(required(genreFieldset.querySelector('[data-genre-name="Comedy"] input'), "Comedy Genre source"));
		const advanced = required(dialog.querySelector(".decades-advanced-options"), "Advanced options");
		await clickAndSettle(required(advanced.querySelector(":scope > summary"), "Advanced summary"));
		await act(async () => {
			setInputValue(required(dialog.querySelector("#decade-source-advanced-rating-min"), "Minimum rating"), "5");
			await afterCommittedEffects();
		});
		const requestsBeforeExplicitPreview = requests.length;
		const trigger = required(buttonContaining(dialog, "Preview titles"), "multi-Year Preview titles action");
		trigger.focus({ preventScroll: true });
		await clickAndSettle(trigger);
		const initialReady = await waitForReadyPosterGrid({ preview: ".decade-add-preview-modal", gridSelector: ".decade-add-preview-grid", expectedVisibleCount: 10, label: "live exact 1981 general Movie Add Source Preview", timeoutMs: 30_000 });
		const modal = initialReady.preview;
		const yearSelector = required(modal.querySelector('[role="tablist"][aria-label="Preview year"]'), "Year Preview selector");
		const sourceSelector = required(modal.querySelector('[role="tablist"][aria-label="Preview source"]'), "Source Preview selector");
		const mediaSelector = required(modal.querySelector('[role="tablist"][aria-label="Preview media"]'), "Media Preview selector");
		const selectorLabels = {
			year: [...yearSelector.querySelectorAll(":scope > button")].map((button) => button.textContent.trim()),
			source: [...sourceSelector.querySelectorAll(":scope > button")].map((button) => button.textContent.trim()),
			media: [...mediaSelector.querySelectorAll(":scope > button")].map((button) => button.textContent.trim()),
		};
		const initiallySelected = {
			year: yearSelector.querySelector('[aria-selected="true"]')?.textContent.trim() ?? null,
			source: sourceSelector.querySelector('[aria-selected="true"]')?.textContent.trim() ?? null,
			media: mediaSelector.querySelector('[aria-selected="true"]')?.textContent.trim() ?? null,
		};
		const oneInitialRequest = requests.length === 1;
		const noFlattenedCartesianSelector = ![...modal.querySelectorAll('[role="tablist"] button')].some((button) => /1981\s+(Comedy|General)|1985\s+(Comedy|General)|1988\s+(Comedy|General)/.test(button.textContent));
		await clickAndSettle(required(buttonContaining(mediaSelector, "Series"), "Series Preview tab"));
		const seriesReady = await waitForReadyPosterGrid({ preview: ".decade-add-preview-modal", gridSelector: ".decade-add-preview-grid", expectedVisibleCount: 10, label: "live exact 1981 general Series Add Source Preview", timeoutMs: 30_000 });
		const seriesRequestedLazily = requests.length === 2;
		await clickAndSettle(required(buttonContaining(sourceSelector, "Comedy"), "Comedy Source Preview choice"));
		const comedySeriesReady = await waitForReadyPosterGrid({ preview: ".decade-add-preview-modal", gridSelector: ".decade-add-preview-grid", expectedVisibleCount: 10, label: "live exact 1981 Comedy Series Add Source Preview", timeoutMs: 30_000 });
		const sourceRequestedLazily = requests.length === 3;
		await clickAndSettle(required(buttonContaining(yearSelector, "1985"), "1985 Year Preview choice"));
		const secondYearSeriesReady = await waitForReadyPosterGrid({ preview: ".decade-add-preview-modal", gridSelector: ".decade-add-preview-grid", expectedVisibleCount: 10, label: "live exact 1985 Comedy Series Add Source Preview", timeoutMs: 30_000 });
		const yearRequestedLazily = requests.length === 4;
		await clickAndSettle(required(buttonContaining(mediaSelector, "Movies"), "Movies Preview tab"));
		const secondYearMovieReady = await waitForReadyPosterGrid({ preview: ".decade-add-preview-modal", gridSelector: ".decade-add-preview-grid", expectedVisibleCount: 10, label: "live exact 1985 Comedy Movie Add Source Preview", timeoutMs: 30_000 });
		const secondMediaRequestedLazily = requests.length === 5;
		await clickAndSettle(required(buttonContaining(sourceSelector, "General"), "General Source Preview choice"));
		const secondYearGeneralReady = await waitForReadyPosterGrid({ preview: ".decade-add-preview-modal", gridSelector: ".decade-add-preview-grid", expectedVisibleCount: 10, label: "live exact 1985 general Movie Add Source Preview", timeoutMs: 30_000 });
		const generalRequestedLazily = requests.length === 6;
		const beforeCacheRevisit = requests.length;
		await clickAndSettle(required(buttonContaining(yearSelector, "1981"), "cached 1981 Year Preview choice"));
		const cachedReady = await waitForReadyPosterGrid({ preview: ".decade-add-preview-modal", gridSelector: ".decade-add-preview-grid", expectedVisibleCount: 10, label: "cached exact 1981 general Movie Add Source Preview", timeoutMs: 30_000 });
		const cacheReused = requests.length === beforeCacheRevisit;
		const selectors = [yearSelector, sourceSelector, mediaSelector];
		const selectorOneLine = selectors.every((selector) => new Set([...selector.querySelectorAll(":scope > button")].map((button) => Math.round(button.getBoundingClientRect().top))).size === 1);
		const modalRect = cachedReady.preview.getBoundingClientRect();
		const selectorsContained = selectors.every((selector) => {
			const rect = selector.getBoundingClientRect();
			return rect.left >= modalRect.left - 1 && rect.right <= modalRect.right + 1;
		});
		const posterEvidence = [initialReady, seriesReady, comedySeriesReady, secondYearSeriesReady, secondYearMovieReady, secondYearGeneralReady].map((ready) => ({
			count: ready.visibleImages.length,
			genuine: genuineTmdbPosterImages(ready.visibleImages),
		}));
		const geometry = titlePreviewGeometry(cachedReady.preview, cachedReady.grid);
		const outerInert = dialog.querySelector(".add-source-scroll")?.inert === true && dialog.querySelector(".decade-source-actions")?.inert === true;
		const focusContained = cachedReady.preview.contains(document.activeElement);
		const noRepresentativeSample = !cachedReady.preview.textContent.includes("sample");
		const thirdYearDeferred = requests.every((request) => !request.url.includes("1988-01-01"));
		await clickAndSettle(required(cachedReady.preview.querySelector("header button"), "multi-Year Preview Close"));
		const focusRestored = document.activeElement === trigger;
		return {
			width: window.innerWidth,
			requestsBeforeExplicitPreview,
			configuredYearSelection,
			requests,
			selectorLabels,
			initiallySelected,
			oneInitialRequest,
			seriesRequestedLazily,
			sourceRequestedLazily,
			yearRequestedLazily,
			secondMediaRequestedLazily,
			generalRequestedLazily,
			thirdYearDeferred,
			cacheReused,
			noFlattenedCartesianSelector,
			selectorOneLine,
			selectorsContained,
			posterEvidence,
			geometry,
			outerInert,
			focusContained,
			focusRestored,
			noRepresentativeSample,
			noMutation: controller.getState().revision === revisionBefore && serializedValue(controller) === serializedBefore,
			noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth,
		};
	} finally {
		await act(async () => root.unmount());
		host.remove();
	}
}

async function runSourceChooserLayoutScenario({
	fontFamily = null,
	includeClassicScrollbarStress = false,
	includeGrowthStress = false,
	includeOrderStress = false,
} = {}) {
	function required(element, label) {
		if (!element) throw new Error(`${label} was not rendered.`);
		return element;
	}
	function rounded(value) {
		return Math.round(value * 10) / 10;
	}
	function roundedRect(element) {
		const rect = element.getBoundingClientRect();
		return {
			left: rounded(rect.left),
			top: rounded(rect.top),
			right: rounded(rect.right),
			bottom: rounded(rect.bottom),
			width: rounded(rect.width),
			height: rounded(rect.height),
		};
	}
	function renderedLineCount(element) {
		const range = document.createRange();
		range.selectNodeContents(element);
		const lineTops = [];
		for (const rect of range.getClientRects()) {
			if (rect.width <= 0 || rect.height <= 0) continue;
			if (!lineTops.some((top) => Math.abs(top - rect.top) <= 0.5)) lineTops.push(rect.top);
		}
		return lineTops.length;
	}
	function containsRect(outer, inner, tolerance = 1) {
		return inner.left >= outer.left - tolerance
			&& inner.top >= outer.top - tolerance
			&& inner.right <= outer.right + tolerance
			&& inner.bottom <= outer.bottom + tolerance;
	}
	function rectsOverlap(first, second, tolerance = 0.5) {
		return first.left < second.right - tolerance
			&& first.right > second.left + tolerance
			&& first.top < second.bottom - tolerance
			&& first.bottom > second.top + tolerance;
	}
	function contentFits(element) {
		return element.scrollWidth <= element.clientWidth + 1 && element.scrollHeight <= element.clientHeight + 1;
	}
	function launcherContentSafety(dialog, list, cards) {
		const dialogRect = dialog.getBoundingClientRect();
		const listRect = list.getBoundingClientRect();
		const listStyle = getComputedStyle(list);
		const cardMetrics = cards.map((card) => {
			const shell = required(card.querySelector(".creation-option-icon-shell"), "launcher card icon shell");
			const icon = required(shell.querySelector(".creation-option-icon"), "launcher card icon");
			const copy = required(card.querySelector(".creation-option-copy"), "launcher card copy");
			const title = required(card.querySelector("strong"), "launcher card title");
			const helper = required(card.querySelector("small"), "launcher card helper");
			const cardRect = card.getBoundingClientRect();
			const shellRect = shell.getBoundingClientRect();
			const iconRect = icon.getBoundingClientRect();
			const copyRect = copy.getBoundingClientRect();
			const titleRect = title.getBoundingClientRect();
			const helperRect = helper.getBoundingClientRect();
			return {
				id: card.dataset.creationOption ?? card.dataset.sourceModeOption ?? null,
				cardRect,
				positiveDimensions: cardRect.width > 0 && cardRect.height > 0,
				iconContained: containsRect(shellRect, iconRect) && containsRect(cardRect, shellRect),
				titleContained: containsRect(cardRect, titleRect),
				helperContained: containsRect(cardRect, helperRect),
				copyContained: getComputedStyle(copy).display === "contents" || containsRect(cardRect, copyRect),
				textUnclipped: contentFits(title) && contentFits(helper),
				contentOverflowFree: contentFits(card),
				horizontallyContainedByGrid: cardRect.left >= listRect.left - 1 && cardRect.right <= listRect.right + 1,
			};
		});
		const rows = [];
		for (const metric of cardMetrics) {
			const row = rows.find((entry) => Math.abs(entry.top - metric.cardRect.top) <= 1);
			if (row) {
				row.bottom = Math.max(row.bottom, metric.cardRect.bottom);
				row.cards.push(metric);
			} else rows.push({ top: metric.cardRect.top, bottom: metric.cardRect.bottom, cards: [metric] });
		}
		rows.sort((first, second) => first.top - second.top);
		const rowGaps = rows.slice(0, -1).map((row, index) => rounded(rows[index + 1].top - row.bottom));
		const intendedRowGap = Number.parseFloat(listStyle.rowGap) || 0;
		const cardWidths = cardMetrics.map((metric) => metric.cardRect.width);
		return {
			validCardDimensions: cardMetrics.every((metric) => metric.positiveDimensions),
			iconsContained: cardMetrics.every((metric) => metric.iconContained),
			titlesContained: cardMetrics.every((metric) => metric.titleContained),
			helpersContained: cardMetrics.every((metric) => metric.helperContained),
			copiesContained: cardMetrics.every((metric) => metric.copyContained),
			textUnclipped: cardMetrics.every((metric) => metric.textUnclipped),
			cardContentOverflowFree: cardMetrics.every((metric) => metric.contentOverflowFree),
			cardsContainedByGridHorizontally: cardMetrics.every((metric) => metric.horizontallyContainedByGrid),
			noCardOverlap: cardMetrics.every((metric, index) => cardMetrics.slice(index + 1).every((other) => !rectsOverlap(metric.cardRect, other.cardRect))),
			noRowOverlap: rowGaps.every((gap) => gap >= -1),
			rowSpacingValid: rowGaps.every((gap) => gap >= intendedRowGap - 1),
			intendedRowGap: rounded(intendedRowGap),
			rowGaps,
			stableCardWidths: Math.max(...cardWidths) - Math.min(...cardWidths) <= 1,
			cardWidthSpread: rounded(Math.max(...cardWidths) - Math.min(...cardWidths)),
			gridContainedByModal: containsRect(dialogRect, listRect),
			modalContainedByViewport: dialogRect.left >= -1
				&& dialogRect.top >= -1
				&& dialogRect.right <= window.innerWidth + 1
				&& dialogRect.bottom <= window.innerHeight + 1,
		};
	}
	function launcherCardGeometry(card) {
		const label = required(card.querySelector("strong"), "launcher card label");
		const helper = required(card.querySelector("small"), "launcher card helper");
		const icon = required(card.querySelector(".creation-option-icon-shell"), "launcher card icon");
		const copy = required(card.querySelector(".creation-option-copy"), "launcher card copy");
		const cardStyle = getComputedStyle(card);
		const copyStyle = getComputedStyle(copy);
		const labelStyle = getComputedStyle(label);
		const helperStyle = getComputedStyle(helper);
		return {
			id: card.dataset.creationOption ?? card.dataset.sourceModeOption ?? null,
			label: label.textContent.trim(),
			card: roundedRect(card),
			display: cardStyle.display,
			gridTemplateColumns: cardStyle.gridTemplateColumns,
			gap: cardStyle.gap,
			padding: {
				top: cardStyle.paddingTop,
				right: cardStyle.paddingRight,
				bottom: cardStyle.paddingBottom,
				left: cardStyle.paddingLeft,
			},
			iconWidth: rounded(icon.getBoundingClientRect().width),
			copyWidth: rounded(copy.getBoundingClientRect().width),
			copyGridTemplateColumns: copyStyle.gridTemplateColumns,
			title: {
				clientWidth: label.clientWidth,
				lines: renderedLineCount(label),
				fontFamily: labelStyle.fontFamily,
				fontSize: labelStyle.fontSize,
				fontWeight: labelStyle.fontWeight,
				lineHeight: labelStyle.lineHeight,
			},
			helper: {
				clientWidth: helper.clientWidth,
				lines: renderedLineCount(helper),
				fontFamily: helperStyle.fontFamily,
				fontSize: helperStyle.fontSize,
				fontWeight: helperStyle.fontWeight,
				lineHeight: helperStyle.lineHeight,
			},
		};
	}
	const representativeLauncherEntries = [
		["documentaries", "Documentaries", "Add movies or series from documentaries."],
		["countries", "Countries", "Add movies or series from a country."],
		["keywords", "Keywords", "Add movies or series by keyword."],
		["awards", "Awards", "Add award-winning movies or series."],
		["recommendations", "Recommendations", "Add recommendations from a TMDB title."],
		["upcoming", "Upcoming", "Add upcoming movies or series."],
		["languages", "Languages", "Add movies or series by original language."],
		["ratings", "Ratings", "Add movies or series by rating."],
		["certifications", "Certifications", "Add movies or series by certification."],
	];
	function launcherOrderCases(cardAttribute, currentIds) {
		const requested = cardAttribute === "data-source-mode-option"
			? [
				["longest-adjacent", ["tmdb-movie-franchise", "tmdb-lists", "tmdb-people", "tmdb-studios", "tmdb-networks", "tmdb-streaming-services", "tmdb-genres", "tmdb-decade"]],
				["longest-separated", ["tmdb-movie-franchise", "tmdb-networks", "tmdb-studios", "tmdb-people", "tmdb-streaming-services", "tmdb-genres", "tmdb-lists", "tmdb-decade"]],
			]
			: [
				["longest-adjacent", ["people", "streaming-services", "tmdb-lists", "blank", "decades", "franchises", "studios", "networks", "genres"]],
				["longest-separated", ["people", "blank", "decades", "streaming-services", "franchises", "studios", "tmdb-lists", "networks", "genres"]],
			];
		return [
			{ name: "current", ids: [...currentIds] },
			...requested.map(([name, preferredIds]) => ({
				name,
				ids: [...preferredIds.filter((id) => currentIds.includes(id)), ...currentIds.filter((id) => !preferredIds.includes(id))],
			})),
		];
	}
	async function measureLauncherVariant({ dialog, list, cardAttribute, extraCount = 0, forceScrollbar = false, name, orderIds = null }) {
		const originalItems = [...list.children];
		const originalOverflowY = list.style.overflowY;
		const originalScrollTop = list.scrollTop;
		const selector = `[${cardAttribute}]`;
		try {
			const templateItem = required(originalItems[0], `${name} launcher template item`);
			for (const [index, entry] of representativeLauncherEntries.slice(0, extraCount).entries()) {
				const [id, label, helper] = entry;
				const item = templateItem.cloneNode(true);
				const card = required(item.querySelector("button"), `${name} representative launcher card`);
				card.removeAttribute("data-creation-option");
				card.removeAttribute("data-source-mode-option");
				card.setAttribute(cardAttribute, `test-${id}-${index + 1}`);
				required(card.querySelector("strong"), `${name} representative launcher title`).textContent = label;
				required(card.querySelector("small"), `${name} representative launcher helper`).textContent = helper;
				list.append(item);
			}
			if (orderIds) {
				const items = [...list.children];
				const itemById = new Map(items.map((item) => {
					const card = required(item.querySelector(selector), `${name} ordered launcher card`);
					return [card.getAttribute(cardAttribute), item];
				}));
				const orderedItems = orderIds.map((id) => itemById.get(id)).filter(Boolean);
				const orderedSet = new Set(orderedItems);
				list.replaceChildren(...orderedItems, ...items.filter((item) => !orderedSet.has(item)));
			}
			if (forceScrollbar) list.style.overflowY = "scroll";
			await afterCommittedEffects();

			const cards = [...list.querySelectorAll(selector)];
			const rows = [];
			for (const card of cards) {
				const rect = card.getBoundingClientRect();
				const top = Math.round(rect.top);
				const row = rows.find((entry) => Math.abs(entry.top - top) <= 1);
				if (row) {
					row.count += 1;
					row.height = Math.max(row.height, rect.height);
				} else rows.push({ top, count: 1, height: rect.height });
			}
			const rowHeights = rows.map((row) => rounded(row.height));
			const cardGeometry = cards.map(launcherCardGeometry);
			const cardWidths = cardGeometry.map((card) => card.card.width);
			const helperWidths = cardGeometry.map((card) => card.helper.clientWidth);
			const titleWidths = cardGeometry.map((card) => card.title.clientWidth);
			const helperLines = cardGeometry.map((card) => card.helper.lines);
			const fullWidthHelpers = cards.every((card) => {
				const helper = required(card.querySelector("small"), `${name} full-width helper`);
				const style = getComputedStyle(card);
				const expectedWidth = card.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight);
				return Math.abs(helper.getBoundingClientRect().width - expectedWidth) <= 1;
			});
			const topRowsAligned = cards.every((card) => {
				const iconRect = required(card.querySelector(".creation-option-icon-shell"), `${name} icon`).getBoundingClientRect();
				const titleRect = required(card.querySelector("strong"), `${name} title`).getBoundingClientRect();
				const helperRect = required(card.querySelector("small"), `${name} helper`).getBoundingClientRect();
				return titleRect.left >= iconRect.right + 5
					&& titleRect.top >= iconRect.top - 1
					&& titleRect.bottom <= iconRect.bottom + 1
					&& helperRect.top >= Math.max(iconRect.bottom, titleRect.bottom) + 1;
			});
			const scrollOwners = [dialog, ...dialog.querySelectorAll("*")].filter((element) => {
				const overflowY = getComputedStyle(element).overflowY;
				return overflowY === "auto" || overflowY === "scroll";
			});
			const listStyle = getComputedStyle(list);
			const scrollActive = list.scrollHeight > list.clientHeight + 1;
			list.scrollTop = list.scrollHeight;
			await afterCommittedEffects();
			const listRect = list.getBoundingClientRect();
			const finalRect = required(cards.at(-1), `${name} final launcher card`).getBoundingClientRect();
			return {
				name,
				extraCount,
				forceScrollbar,
				cardCount: cards.length,
				orderIds: cards.map((card) => card.getAttribute(cardAttribute)),
				columnCount: Math.max(...rows.map((row) => row.count)),
				rowCounts: rows.map((row) => row.count),
				rowHeightSpread: rounded(Math.max(...rowHeights) - Math.min(...rowHeights)),
				minCardHeight: Math.min(...cardGeometry.map((card) => card.card.height)),
				maxCardHeight: Math.max(...cardGeometry.map((card) => card.card.height)),
				contentSafety: launcherContentSafety(dialog, list, cards),
				cardWidth: cardWidths[0],
				cardWidthSpread: rounded(Math.max(...cardWidths) - Math.min(...cardWidths)),
				titleWidth: titleWidths[0],
				helperWidth: helperWidths[0],
				helperWidthSpread: rounded(Math.max(...helperWidths) - Math.min(...helperWidths)),
				maxHelperLines: Math.max(...helperLines),
				fullWidthHelpers,
				topRowsAligned,
				grid: {
					width: rounded(list.getBoundingClientRect().width),
					clientWidth: list.clientWidth,
					offsetWidth: list.offsetWidth,
					scrollWidth: list.scrollWidth,
					clientHeight: list.clientHeight,
					scrollHeight: list.scrollHeight,
					columns: listStyle.gridTemplateColumns,
					gap: listStyle.gap,
					gutter: list.offsetWidth - list.clientWidth,
					overflowY: listStyle.overflowY,
					scrollActive,
				},
				oneScrollOwner: scrollOwners.length === 1 && scrollOwners[0] === list,
				noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth && dialog.scrollWidth <= dialog.clientWidth && list.scrollWidth <= list.clientWidth,
				finalCardReachable: finalRect.top >= listRect.top - 1 && finalRect.bottom <= listRect.bottom + 1,
			};
		} finally {
			list.replaceChildren(...originalItems);
			list.style.overflowY = originalOverflowY;
			list.scrollTop = originalScrollTop;
			await afterCommittedEffects();
		}
	}
	async function measureLauncherStress(dialog, list, cardAttribute, label) {
		const selector = `[${cardAttribute}]`;
		const currentIds = [...list.querySelectorAll(selector)].map((card) => card.getAttribute(cardAttribute));
		const growth = [];
		if (includeGrowthStress) {
			for (const extraCount of [0, 3, 6]) growth.push(await measureLauncherVariant({
				dialog,
				list,
				cardAttribute,
				extraCount,
				name: `${label} +${extraCount}`,
			}));
		}
		const order = [];
		if (includeOrderStress) {
			for (const orderCase of launcherOrderCases(cardAttribute, currentIds)) order.push(await measureLauncherVariant({
				dialog,
				list,
				cardAttribute,
				name: `${label} ${orderCase.name}`,
				orderIds: orderCase.ids,
			}));
		}
		const classicScrollbar = includeClassicScrollbarStress
			? await measureLauncherVariant({
				dialog,
				list,
				cardAttribute,
				extraCount: 9,
				forceScrollbar: true,
				name: `${label} classic scrollbar`,
			})
			: null;
		return { growth, order, classicScrollbar };
	}
	function launcherModalGeometry(dialog) {
		const backdrop = required(dialog.closest(".add-source-backdrop"), "launcher modal backdrop");
		const viewport = window.visualViewport;
		const viewportBounds = {
			left: viewport?.offsetLeft ?? 0,
			top: viewport?.offsetTop ?? 0,
			width: viewport?.width ?? window.innerWidth,
			height: viewport?.height ?? window.innerHeight,
		};
		const dialogRect = dialog.getBoundingClientRect();
		const backdropRect = backdrop.getBoundingClientRect();
		const dialogStyle = getComputedStyle(dialog);
		const backdropStyle = getComputedStyle(backdrop);
		const horizontalMargin = Math.min(
			dialogRect.left - viewportBounds.left,
			viewportBounds.left + viewportBounds.width - dialogRect.right,
		);
		const verticalMargin = Math.min(
			dialogRect.top - viewportBounds.top,
			viewportBounds.top + viewportBounds.height - dialogRect.bottom,
		);
		const borderWidth = Number.parseFloat(dialogStyle.borderTopWidth);
		const borderRadius = Number.parseFloat(dialogStyle.borderTopLeftRadius);
		return {
			viewport: { ...viewportBounds },
			backdrop: {
				rect: roundedRect(backdrop),
				alignItems: backdropStyle.alignItems,
				justifyItems: backdropStyle.justifyItems,
				padding: backdropStyle.padding,
				background: backdropStyle.backgroundColor,
			},
			dialog: {
				rect: roundedRect(dialog),
				left: rounded(dialogRect.left),
				right: rounded(dialogRect.right),
				borderWidth: rounded(borderWidth),
				borderRadius: rounded(borderRadius),
				boxShadow: dialogStyle.boxShadow,
			},
			horizontalMargin: rounded(horizontalMargin),
			verticalMargin: rounded(verticalMargin),
			backdropTracksVisualViewport:
				Math.abs(backdropRect.left - viewportBounds.left) <= 1
				&& Math.abs(backdropRect.top - viewportBounds.top) <= 1
				&& Math.abs(backdropRect.width - viewportBounds.width) <= 1
				&& Math.abs(backdropRect.height - viewportBounds.height) <= 1,
			presentation: horizontalMargin >= 23 && borderWidth > 0 && borderRadius >= 16 ? "contained" : "phone-fullscreen",
		};
	}
	const originalBodyFontFamily = document.body.style.fontFamily;
	if (typeof fontFamily === "string" && fontFamily.trim()) document.body.style.fontFamily = fontFamily;
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	const controller = createController();
	const folder = importSources(controller, []);
	controller.selectNode(folder.internalId);
	const revisionBefore = controller.getState().revision;
	const serializedBefore = serializedValue(controller);
	async function measureCreationLauncher(scope) {
		const creationHost = document.createElement("div");
		document.body.append(creationHost);
		const creationRoot = createRoot(creationHost);
		const state = controller.getState();
		const destinationCollection = state.project.collections.find((collection) => collection.internalId === state.selection.collectionInternalId) ?? null;
		let metrics;
		await act(async () => {
			creationRoot.render(createElement(CreationDialog, {
				scope,
				project: state.project,
				projectRevision: state.revision,
				currentYear: 2026,
				destinationCollectionInternalId: scope === "new-folder" ? destinationCollection?.internalId ?? null : null,
				destinationCollectionTitle: scope === "new-folder" ? destinationCollection?.editable?.title ?? null : null,
				onCancel() {},
				onCreateBlank() {},
			}));
			await afterCommittedEffects();
		});
		try {
			const dialog = required(document.querySelector(`[data-creation-dialog="true"][data-creation-scope="${scope}"]`), `${scope} Creation chooser`);
			const modal = launcherModalGeometry(dialog);
			const list = required(dialog.querySelector(".creation-option-list"), `${scope} Creation launcher grid`);
			const listStyle = getComputedStyle(list);
			const cards = [...list.querySelectorAll("[data-creation-option]")];
			const firstCard = required(cards[0], `${scope} first Creation card`);
			const finalCard = required(cards.at(-1), `${scope} final Creation card`);
			const iconRects = cards.map((card) => card.querySelector(".creation-option-icon-shell")?.getBoundingClientRect());
			const helperMetrics = cards.map((card) => {
				const helper = required(card.querySelector("small"), `${scope} Creation helper`);
				const style = getComputedStyle(helper);
				const lineHeight = Number.parseFloat(style.lineHeight);
				return {
					lines: lineHeight > 0 ? Math.round((helper.getBoundingClientRect().height / lineHeight) * 10) / 10 : null,
					contained: helper.scrollWidth <= helper.clientWidth + 1 && helper.scrollHeight <= helper.clientHeight + 1,
				};
			});
			const rows = [];
			for (const card of cards) {
				const rect = card.getBoundingClientRect();
				const top = Math.round(rect.top);
				const row = rows.find((entry) => Math.abs(entry.top - top) <= 1);
				if (row) {
					row.count += 1;
					row.height = Math.max(row.height, rect.height);
				} else rows.push({ top, count: 1, height: rect.height });
			}
			const rowHeights = rows.map((row) => Math.round(row.height * 10) / 10);
			const scrollOwners = [dialog, ...dialog.querySelectorAll("*")].filter((element) => {
				const overflowY = getComputedStyle(element).overflowY;
				return overflowY === "auto" || overflowY === "scroll";
			});
			list.scrollTop = list.scrollHeight;
			await act(async () => afterCommittedEffects());
			const listRect = list.getBoundingClientRect();
			const finalRect = finalCard.getBoundingClientRect();
			metrics = {
				scope,
				modal,
				optionIds: cards.map((card) => card.dataset.creationOption),
				labels: cards.map((card) => card.querySelector("strong")?.textContent.trim() ?? null),
				helpers: cards.map((card) => card.querySelector("small")?.textContent.trim() ?? null),
				cardCount: cards.length,
				columnCount: Math.max(...rows.map((row) => row.count)),
				rowCounts: rows.map((row) => row.count),
				rowHeightSpread: Math.round((Math.max(...rowHeights) - Math.min(...rowHeights)) * 10) / 10,
				grid: {
					width: rounded(list.getBoundingClientRect().width),
					gridTemplateColumns: listStyle.gridTemplateColumns,
					gap: listStyle.gap,
				},
				cardGeometry: cards.map(launcherCardGeometry),
				contentSafety: launcherContentSafety(dialog, list, cards),
				firstOptionFocused: document.activeElement === firstCard,
				iconShellsCorrect: iconRects.every((rect) => {
					const expectedSize = window.innerWidth <= 620 ? 36 : 42;
					return rect && Math.abs(rect.width - expectedSize) <= 1 && Math.abs(rect.height - expectedSize) <= 1;
				}),
				comfortableTargets: cards.every((card) => {
					const rect = card.getBoundingClientRect();
					return rect.height >= 76 && rect.width >= 140;
				}),
				cardsContained: cards.every((card) => card.scrollWidth <= card.clientWidth + 1 && card.scrollHeight <= card.clientHeight + 1),
				helpersContained: helperMetrics.every((metric) => metric.contained),
				maxHelperLines: Math.max(...helperMetrics.map((metric) => metric.lines ?? 0)),
				oneScrollOwner: scrollOwners.length === 1 && scrollOwners[0] === list,
				noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth && dialog.scrollWidth <= dialog.clientWidth && list.scrollWidth <= list.clientWidth,
				finalCardReachable: finalRect.top >= listRect.top - 1 && finalRect.bottom <= listRect.bottom + 1,
			};
			metrics.stress = await measureLauncherStress(dialog, list, "data-creation-option", `${scope} Creation`);
		} finally {
			await act(async () => {
				creationRoot.unmount();
				await afterCommittedEffects();
			});
			creationHost.remove();
		}
		return { ...metrics, bodyRestored: document.body.style.position !== "fixed" };
	}
	await act(async () => {
		root.render(createElement(MountedWorkspace, { controller }));
		await afterCommittedEffects();
	});
	try {
		const trigger = required(host.querySelector('[data-action="add-source"]'), "Add Source trigger");
		await clickAndSettle(trigger);
		const dialog = required(document.querySelector('[data-source-mode-chooser="true"]'), "Add Source chooser");
		const description = required(dialog.querySelector("#source-mode-description"), "Add Source chooser introduction");
		const list = required(dialog.querySelector(".source-mode-list"), "Add Source launcher grid");
		const cards = [...list.querySelectorAll("[data-source-mode-option]")];
		const firstCard = required(cards[0], "first Add Source card");
		const finalCard = required(cards.at(-1), "final Add Source card");
		const iconRects = cards.map((card) => card.querySelector(".creation-option-icon-shell")?.getBoundingClientRect());
		const helperMetrics = cards.map((card) => {
			const helper = required(card.querySelector("small"), "Add Source helper");
			const style = getComputedStyle(helper);
			const lineHeight = Number.parseFloat(style.lineHeight);
			return {
				lines: lineHeight > 0 ? Math.round((helper.getBoundingClientRect().height / lineHeight) * 10) / 10 : null,
				contained: helper.scrollWidth <= helper.clientWidth + 1 && helper.scrollHeight <= helper.clientHeight + 1,
			};
		});
		const rows = [];
		for (const card of cards) {
			const rect = card.getBoundingClientRect();
			const top = Math.round(rect.top);
			const row = rows.find((entry) => Math.abs(entry.top - top) <= 1);
			if (row) {
				row.count += 1;
				row.height = Math.max(row.height, rect.height);
			} else rows.push({ top, count: 1, height: rect.height });
		}
		const rowHeights = rows.map((row) => rounded(row.height));
		const scrollOwners = [dialog, ...dialog.querySelectorAll("*")].filter((element) => {
			const overflowY = getComputedStyle(element).overflowY;
			return overflowY === "auto" || overflowY === "scroll";
		});
		const initial = {
			width: window.innerWidth,
			height: window.innerHeight,
			fontFamily,
			modal: launcherModalGeometry(dialog),
			modeIds: cards.map((card) => card.dataset.sourceModeOption),
			cardCount: cards.length,
			columnCount: Math.max(...rows.map((row) => row.count)),
			rowCounts: rows.map((row) => row.count),
			rowHeightSpread: rounded(Math.max(...rowHeights) - Math.min(...rowHeights)),
			cardGeometry: cards.map(launcherCardGeometry),
			contentSafety: launcherContentSafety(dialog, list, cards),
			balancedRows: rows.slice(0, -1).every((row) => row.count === rows[0].count) && rows.at(-1).count >= rows[0].count - 1,
			firstOptionFocused: document.activeElement === firstCard,
			iconShellsMatchCreation: iconRects.every((rect) => {
				const expectedSize = window.innerWidth <= 620 ? 36 : 42;
				return rect && Math.abs(rect.width - expectedSize) <= 1 && Math.abs(rect.height - expectedSize) <= 1;
			}),
			comfortableTargets: cards.every((card) => {
				const rect = card.getBoundingClientRect();
				return rect.height >= 76 && rect.width >= 140;
			}),
			helpersContained: helperMetrics.every((metric) => metric.contained),
			maxHelperLines: Math.max(...helperMetrics.map((metric) => metric.lines ?? 0)),
			oneScrollOwner: scrollOwners.length === 1 && scrollOwners[0] === list,
			introductoryCopy: description.textContent.trim(),
			introductoryAlignment: getComputedStyle(description).textAlign,
			introductoryDisplay: getComputedStyle(description).display,
			blanketProviderDisclosureAbsent: !dialog.textContent.includes("All available source families use TMDB.") && dialog.querySelector(".source-mode-heading-description") === null,
			noEmptyDisclosureWrapper: description.childElementCount === 0,
			noSelectionControls: dialog.querySelector('input[type="radio"], input[type="checkbox"], [role="radio"], [aria-checked]') === null,
			noSearchAutofocus: dialog.querySelector('input[type="search"]') === null,
			noArrowLayout: !dialog.textContent.includes("→"),
			noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth && dialog.scrollWidth <= dialog.clientWidth && list.scrollWidth <= list.clientWidth,
			bodyLocked: document.body.style.position === "fixed",
		};
		initial.stress = await measureLauncherStress(dialog, list, "data-source-mode-option", "Add Source");
		list.scrollTop = list.scrollHeight;
		await act(async () => afterCommittedEffects());
		const listRect = list.getBoundingClientRect();
		const finalRect = finalCard.getBoundingClientRect();
		const finalCardReachable = finalRect.top >= listRect.top - 1 && finalRect.bottom <= listRect.bottom + 1;

		await clickAndSettle(firstCard);
		const immediateDestination = document.querySelector('[data-source-mode="tmdb-movie-franchise"]') !== null;
		await clickAndSettle(required(document.querySelector('[data-action="back-to-source-types"]'), "Movie franchise Back action"));
		const returnedCard = required(document.querySelector('[data-source-mode-option="tmdb-movie-franchise"]'), "returned Movie franchise card");
		const backRestoredFocus = document.activeElement === returnedCard;
		await clickAndSettle(required(document.querySelector('[data-source-mode-chooser="true"] .add-source-close-action'), "Add Source Close action"));
		const closeRestoredTrigger = document.activeElement === trigger;

		await clickAndSettle(trigger);
		const reopened = required(document.querySelector('[data-source-mode-chooser="true"]'), "reopened Add Source chooser");
		await act(async () => {
			reopened.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
			await afterCommittedEffects();
		});
		const escapeClosed = document.querySelector('[data-source-mode-chooser="true"]') === null;
		const escapeRestoredTrigger = document.activeElement === trigger;
		const creationChoosers = [];
		for (const scope of ["new-collection", "new-folder"]) creationChoosers.push(await measureCreationLauncher(scope));
		return {
			...initial,
			creationChoosers,
			finalCardReachable,
			immediateDestination,
			backRestoredFocus,
			closeRestoredTrigger,
			escapeClosed,
			escapeRestoredTrigger,
			bodyRestored: document.body.style.position !== "fixed",
			noMutation: controller.getState().revision === revisionBefore && serializedValue(controller) === serializedBefore,
		};
	} finally {
		await act(async () => root.unmount());
		host.remove();
		document.body.style.fontFamily = originalBodyFontFamily;
	}
}

async function runTmdbListLayoutScenario() {
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	const controller = createController();
	const folder = importSources(controller, []);
	const initialState = controller.getState();
	const serializedBefore = serializedValue(controller);
	const providerCalls = [];
	const provider = {
		async getList(id) {
			providerCalls.push(id);
			if (id === 1001 || id === 1002) return { ok: false, error: { kind: "not-found", message: "This TMDB list could not be found or accessed. Check that it is public." } };
			return {
				ok: true,
				data: {
					id,
					name: `Mounted list ${id}`,
					description: id % 2 === 0 ? "" : `Description ${id}`,
					itemCount: 12,
					creator: "Mounted owner",
					posterPath: null,
					items: Array.from({ length: 12 }, (_, index) => ({
						tmdbId: (id * 100) + index + 1,
						mediaType: index % 2 === 0 ? "MOVIE" : "TV",
						title: `Mounted title ${id}-${index + 1}`,
						year: 2000 + index,
						posterPath: null,
						position: index,
					})),
				},
			};
		},
	};
	let backCalls = 0;
	let cancelCalls = 0;
	let applyCalls = 0;
	await act(async () => {
		root.render(createElement(TmdbListSourceFlow, {
			project: initialState.project,
			projectRevision: initialState.revision,
			folder,
			provider,
			onBack() { backCalls += 1; },
			onCancel() { cancelCalls += 1; },
			onApply() { applyCalls += 1; return { ok: true }; },
		}));
		await afterCommittedEffects();
	});
	try {
		const dialog = requiredElement(document.querySelector(".tmdb-list-dialog"), "TMDB List dialog");
		const textarea = requiredElement(dialog.querySelector("textarea"), "TMDB List multiline input");
		const noSearchAutofocus = dialog.querySelector('input[type="search"]') === null && document.activeElement?.type !== "search";
		const typographySamples = [];
		for (const lineCount of [2, 12, 26]) {
			await act(async () => {
				setTextareaValue(textarea, Array.from({ length: lineCount }, (_, index) => String(index + 1)).join("\n"));
				await afterCommittedEffects();
			});
			const sampleStyle = getComputedStyle(textarea);
			typographySamples.push({
				lineCount,
				fontSize: Number.parseFloat(sampleStyle.fontSize),
				fontWeight: Number.parseInt(sampleStyle.fontWeight, 10),
				lineHeight: Number.parseFloat(sampleStyle.lineHeight),
			});
		}
		const submittedIds = Array.from({ length: 18 }, (_, index) => String(index + 1));
		const longFailedUrl = `https://www.themoviedb.org/list/1002-${"owner-review-list-".repeat(12)}missing`;
		const submittedInput = [...submittedIds, "1", "bad-host", "1001", longFailedUrl].join("\n");
		await act(async () => {
			setTextareaValue(textarea, submittedInput);
			await afterCommittedEffects();
		});
		await clickAndSettle(requiredElement(buttonContaining(dialog, "Resolve lists"), "Resolve lists action"));
		await waitForMountedCondition(
			() => dialog.querySelectorAll(".tmdb-list-selected-items li").length === submittedIds.length,
			{ label: "mounted TMDB List selection" },
		);
		const selectionScroll = requiredElement(dialog.querySelector(".add-source-scroll"), "TMDB List selection scroll owner");
		const selectedRows = [...dialog.querySelectorAll(".tmdb-list-selected-items li")];
		selectionScroll.scrollTop = selectionScroll.scrollHeight;
		await act(async () => afterCommittedEffects());
		const finalSelectedRect = selectedRows.at(-1).getBoundingClientRect();
		const selectionScrollRect = selectionScroll.getBoundingClientRect();
		const initialErrorRows = [...dialog.querySelectorAll(".tmdb-list-input-error")];
		const inputPreservedAfterPartialFailure = textarea.value === submittedInput;
		const longErrorRow = initialErrorRows.find((row) => row.textContent.includes("1002-"));
		const errorIdentification = initialErrorRows.some((row) => row.textContent.includes("Line 20 · bad-host")) && initialErrorRows.some((row) => row.textContent.includes("Line 21 · 1001") && row.textContent.includes("could not be found or accessed")) && Boolean(longErrorRow?.textContent.includes(`Line 22 · ${longFailedUrl}`));
		const longErrorContained = Boolean(longErrorRow && longErrorRow.scrollWidth <= longErrorRow.clientWidth + 1 && longErrorRow.closest(".add-source-request-state").scrollWidth <= longErrorRow.closest(".add-source-request-state").clientWidth + 1);
		const longErrorAccessible = longErrorRow?.querySelector(".tmdb-list-error-value")?.getAttribute("title") === longFailedUrl;
		const resolveButton = requiredElement(buttonContaining(dialog, "Resolve lists"), "Resolve lists action");
		const clearButton = requiredElement(buttonContaining(dialog, "Clear input"), "Clear input action");
		const inputActionsRect = resolveButton.parentElement.getBoundingClientRect();
		const resolveRect = resolveButton.getBoundingClientRect();
		const clearRect = clearButton.getBoundingClientRect();
		const selectionOwners = [dialog, ...dialog.querySelectorAll("*")].filter((element) => {
			if (element.tagName === "TEXTAREA") return false;
			const overflowY = getComputedStyle(element).overflowY;
			return (overflowY === "auto" || overflowY === "scroll") && element.scrollHeight > element.clientHeight + 1;
		});
		textarea.focus({ preventScroll: true });
		await act(async () => afterCommittedEffects());
		const textareaStyle = getComputedStyle(textarea);
		const placeholderStyle = getComputedStyle(textarea, "::placeholder");
		const callsAfterInitialResolve = providerCalls.length;
		await act(async () => {
			setTextareaValue(textarea, "1\n2");
			await afterCommittedEffects();
		});
		const staleErrorsCleared = dialog.querySelector(".tmdb-list-input-errors") === null && dialog.querySelectorAll(".tmdb-list-selected-items li").length === submittedIds.length;
		await clickAndSettle(resolveButton);
		const unchangedNoNetwork = providerCalls.length === callsAfterInitialResolve;
		const unchangedNoWarning = dialog.querySelector(".editor-field-status") === null;
		await act(async () => {
			setTextareaValue(textarea, "1\n1");
			await afterCommittedEffects();
		});
		await clickAndSettle(resolveButton);
		const genuineDuplicateReported = dialog.querySelector(".editor-field-status")?.textContent.includes("1 repeated entry in this batch was ignored.") ?? false;
		const callsBeforeIncrementalResolve = providerCalls.length;
		await act(async () => {
			setTextareaValue(textarea, "1\n19\n20");
			await afterCommittedEffects();
		});
		await clickAndSettle(resolveButton);
		await waitForMountedCondition(() => dialog.querySelectorAll(".tmdb-list-selected-items li").length === 20, { label: "incremental TMDB List selection" });
		const incrementalOnlyNewNetwork = providerCalls.length === callsBeforeIncrementalResolve + 2;
		const incrementalOrder = [...dialog.querySelectorAll(".tmdb-list-selected-items li strong")].map((element) => element.textContent.trim()).join("|") === Array.from({ length: 20 }, (_, index) => `Mounted list ${index + 1}`).join("|");
		await act(async () => {
			setTextareaValue(textarea, "bad-host");
			await afterCommittedEffects();
		});
		await clickAndSettle(resolveButton);
		const clearHadInputError = dialog.querySelector(".tmdb-list-input-errors")?.textContent.includes("Line 1 · bad-host") ?? false;
		await clickAndSettle(clearButton);
		const clearPreservedSelection = dialog.querySelectorAll(".tmdb-list-selected-items li").length === 20;
		const reviewAfterClear = requiredElement(buttonContaining(dialog.querySelector(".add-source-actions"), "Review 20 lists"), "Review after Clear input");
		const selection = {
			count: selectedRows.length,
			inputPreservedAfterPartialFailure: inputPreservedAfterPartialFailure && initialErrorRows.length === 3,
			errorIdentification,
			longErrorContained,
			longErrorAccessible,
			resolveClearContained: resolveRect.left >= inputActionsRect.left - 1 && clearRect.right <= inputActionsRect.right + 1 && resolveButton.scrollWidth <= resolveButton.clientWidth + 1 && clearButton.scrollWidth <= clearButton.clientWidth + 1,
			staleErrorsCleared,
			unchangedNoNetwork,
			unchangedNoWarning,
			genuineDuplicateReported,
			incrementalOnlyNewNetwork,
			incrementalOrder,
			clearHadInputError,
			clearInputCleared: textarea.value === "" && dialog.querySelector(".tmdb-list-input-errors") === null,
			clearPreservedSelection,
			reviewEnabledAfterClear: !reviewAfterClear.disabled,
			multilineInputUsable: textarea.getBoundingClientRect().height >= 120 && textarea.scrollWidth <= textarea.clientWidth + 1,
			rowsContained: selectedRows.every((row) => row.scrollWidth <= row.clientWidth + 1),
			finalItemReachable: finalSelectedRect.bottom > selectionScrollRect.top + 1 && finalSelectedRect.bottom <= selectionScrollRect.bottom + 1,
			oneScrollOwner: selectionOwners.length === 1 && selectionOwners[0] === selectionScroll,
			darkBuilderControl: !/255,\s*255,\s*255/.test(textareaStyle.backgroundColor) && textareaStyle.color !== "rgb(0, 0, 0)",
			builderTypography: textareaStyle.fontFamily.toLowerCase().includes("inter") && !textareaStyle.fontFamily.toLowerCase().includes("monospace"),
			compactRegularTypography: typographySamples.every((sample) => sample.fontSize >= 14 && sample.fontSize <= 15 && sample.fontWeight === 400 && sample.lineHeight >= sample.fontSize * 1.4 && sample.lineHeight <= sample.fontSize * 1.6),
			typographyLineCounts: typographySamples.map((sample) => sample.lineCount),
			mutedPlaceholder: placeholderStyle.color !== textareaStyle.color,
			verticalResize: textareaStyle.resize === "vertical",
			focusReachable: document.activeElement === textarea,
			caretVisible: textareaStyle.caretColor !== "rgba(0, 0, 0, 0)" && textareaStyle.caretColor !== "transparent",
		};
		const previewTrigger = requiredElement(selectedRows[0]?.querySelector("button"), "TMDB List Choose Preview action");
		await clickAndSettle(previewTrigger);
		const preview = await waitForMountedCondition(
			() => document.querySelector('[data-tmdb-list-preview-dialog="true"] [data-preview-empty-state="true"]')?.closest('[data-tmdb-list-preview-dialog="true"]'),
			{ label: "mounted TMDB List Preview" },
		);
		const previewRect = preview.getBoundingClientRect();
		const previewWithinViewport = previewRect.left >= -1 && previewRect.top >= -1 && previewRect.right <= window.innerWidth + 1 && previewRect.bottom <= window.innerHeight + 1;
		const genericTitlesLabel = preview.querySelector(".studio-preview-single-media")?.textContent.trim() === "Titles";
		const nestedBodyLocked = document.body.style.position === "fixed";
		await clickAndSettle(requiredElement(preview.querySelector("header button"), "TMDB List Preview Close"));
		const previewFocusRestored = document.activeElement === previewTrigger;

		await clickAndSettle(reviewAfterClear);
		await waitForMountedCondition(() => dialog.querySelector('[data-tmdb-list-stage="review"]'), { label: "mounted TMDB List review" });
		const reviewScroll = requiredElement(dialog.querySelector(".add-source-scroll"), "TMDB List review scroll owner");
		const reviewRows = [...dialog.querySelectorAll(".tmdb-list-review-item")];
		const reviewCountLabel = dialog.querySelector("#tmdb-list-review-title")?.textContent.trim() ?? null;
		const reviewStageKicker = dialog.querySelector(".tmdb-list-review .panel-kicker")?.textContent.trim() ?? null;
		const reviewHeaderDescription = dialog.querySelector(".add-source-heading-description")?.textContent.trim() ?? null;
		reviewScroll.scrollTop = reviewScroll.scrollHeight;
		await act(async () => afterCommittedEffects());
		const reviewOwners = [dialog, ...dialog.querySelectorAll("*")].filter((element) => {
			const overflowY = getComputedStyle(element).overflowY;
			return (overflowY === "auto" || overflowY === "scroll") && element.scrollHeight > element.clientHeight + 1;
		});
		const footer = requiredElement(dialog.querySelector(".add-source-actions"), "TMDB List footer");
		const submit = requiredElement(footer.querySelector('button[type="submit"]'), "TMDB List submit action");
		const reviewActionCopy = submit.textContent.trim();
		submit.focus({ preventScroll: true });
		await act(async () => {
			dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
			await afterCommittedEffects();
		});
		const focusContained = dialog.contains(document.activeElement) && document.activeElement !== submit;
		await clickAndSettle(requiredElement(dialog.querySelector('[data-action="back-to-tmdb-list-selection"]'), "TMDB List Review Back"));
		const backPreservedSelection = dialog.querySelectorAll(".tmdb-list-selected-items li").length === 20;
		const backPreviewAvailable = Boolean(dialog.querySelector(".tmdb-list-selected-items button"));
		const review = {
			stageKicker: reviewStageKicker,
			headerDescription: reviewHeaderDescription,
			count: reviewRows.length,
			countLabel: reviewCountLabel,
			actionCopy: reviewActionCopy,
			rowsContained: reviewRows.every((row) => row.scrollWidth <= row.clientWidth + 1),
			oneScrollOwner: reviewOwners.length === 1 && reviewOwners[0] === reviewScroll,
			footerReachable: footer.getBoundingClientRect().bottom <= dialog.getBoundingClientRect().bottom + 1,
			noSearchMediaOrSort: !/Search|Media type|Sort titles by/.test(reviewRows.map((row) => row.textContent).join(" ")),
			originalOrder: reviewRows.every((row) => row.textContent.includes("Original order") && !row.textContent.includes("List order")),
			sourceNameHelpers: reviewRows.every((row) => row.querySelector(".editor-field-help")?.textContent.trim() === "This is the name shown in Nuvio. You can customise it."),
			noPreviewActions: reviewRows.every((row) => !buttonContaining(row, "Preview")),
			noContainerPresentation: dialog.querySelector('[data-review-title-options="true"], [data-hierarchy-collection-presentation="true"], [data-editor-field="folderTileShape"]') === null,
		};

		async function measureGuided(scope, ids) {
			await act(async () => {
				root.render(createElement(CreationDialog, {
					key: `guided-${scope}`,
					scope,
					initialOptionId: "tmdb-lists",
					project: initialState.project,
					projectRevision: initialState.revision,
					destinationCollectionInternalId: scope === "new-folder" ? initialState.project.collections[0].internalId : null,
					destinationCollectionTitle: scope === "new-folder" ? initialState.project.collections[0].editable.title : null,
					listProvider: provider,
					onCancel() {},
					onApplyTmdbLists() { throw new Error("Guided TMDB List visual QA must not apply a plan."); },
				}));
				await afterCommittedEffects();
			});
			const surface = requiredElement(document.querySelector('.creation-dialog[data-creation-option="tmdb-lists"] .tmdb-list-form'), `${scope} TMDB List form`);
			const guidedTextarea = requiredElement(surface.querySelector("textarea"), `${scope} TMDB List input`);
			await act(async () => {
				setTextareaValue(guidedTextarea, ids.join("\n"));
				await afterCommittedEffects();
			});
			await clickAndSettle(requiredElement(buttonContaining(surface, "Resolve lists"), `${scope} Resolve lists`));
			await waitForMountedCondition(() => surface.querySelectorAll(".tmdb-list-selected-items li").length === ids.length, { label: `${scope} TMDB List selection` });
			await clickAndSettle(requiredElement(buttonContaining(surface.querySelector(".add-source-actions"), `Review ${ids.length} list`), `${scope} Review lists`));
			await waitForMountedCondition(() => surface.dataset.tmdbListStage === "review", { label: `${scope} TMDB List review` });

			const collectionInput = surface.querySelector("#tmdb-list-collection-title");
			const folderInput = requiredElement(surface.querySelector("#tmdb-list-folder-title"), `${scope} Folder name`);
			const namesInitiallyEmpty = folderInput.value === "" && (scope !== "new-collection" || collectionInput?.value === "");
			const footer = requiredElement(surface.querySelector(".tmdb-list-actions"), `${scope} action footer`);
			const action = requiredElement(footer.querySelector('button[type="submit"]'), `${scope} Create action`);
			await clickAndSettle(action);
			const initialValidationMessage = requiredElement(footer.querySelector(".tmdb-list-footer-validation"), `${scope} required-name message`);
			const initialMessageRect = initialValidationMessage.getBoundingClientRect();
			const initialActionRect = action.getBoundingClientRect();
			const footerRect = footer.getBoundingClientRect();
			const initialRequiredValidation = {
				message: initialValidationMessage.textContent.trim(),
				collectionInvalid: collectionInput?.getAttribute("aria-invalid") === "true",
				folderInvalid: folderInput.getAttribute("aria-invalid") === "true",
				firstMissingFocused: document.activeElement === (collectionInput ?? folderInput),
				messageContained: initialMessageRect.left >= footerRect.left - 1 && initialMessageRect.right <= footerRect.right + 1 && initialMessageRect.bottom <= footerRect.bottom + 1 && initialValidationMessage.scrollWidth <= initialValidationMessage.clientWidth + 1,
				placement: window.innerWidth >= 900 ? initialMessageRect.left >= initialActionRect.right - 1 ? "right" : "incorrect" : initialMessageRect.top >= initialActionRect.bottom - 1 ? "stacked" : "incorrect",
			};
			let folderOnlyValidation = null;
			await act(async () => {
				if (collectionInput) setInputValue(collectionInput, "Owner collection");
				await afterCommittedEffects();
			});
			if (collectionInput) {
				await clickAndSettle(action);
				folderOnlyValidation = {
					message: footer.querySelector(".tmdb-list-footer-validation")?.textContent.trim() ?? null,
					collectionInvalid: collectionInput.getAttribute("aria-invalid") === "true",
					folderInvalid: folderInput.getAttribute("aria-invalid") === "true",
					folderFocused: document.activeElement === folderInput,
				};
			}
			await act(async () => {
				setInputValue(folderInput, "Owner folder");
				await afterCommittedEffects();
			});
			const requiredValidationCleared = footer.querySelector(".tmdb-list-footer-validation") === null && collectionInput?.getAttribute("aria-invalid") !== "true" && folderInput.getAttribute("aria-invalid") !== "true";

			const collectionPresentation = surface.querySelector('[data-hierarchy-collection-presentation="true"]');
			const folderPresentation = surface.querySelector('[data-review-title-options="true"]');
			const folderShape = surface.querySelector('[data-editor-field="folderTileShape"]');
			const reviewRows = [...surface.querySelectorAll(".tmdb-list-review-item")];
			const reviewScroll = requiredElement(surface.querySelector(".add-source-scroll"), `${scope} review scroll owner`);
			reviewScroll.scrollTop = reviewScroll.scrollHeight;
			await act(async () => afterCommittedEffects());
			const scrollOwners = [surface, ...surface.querySelectorAll("*")].filter((element) => {
				if (element.tagName === "TEXTAREA") return false;
				const overflowY = getComputedStyle(element).overflowY;
				return (overflowY === "auto" || overflowY === "scroll") && element.scrollHeight > element.clientHeight + 1;
			});
			const actionStyle = getComputedStyle(action);
			const actionLineHeight = Number.parseFloat(actionStyle.lineHeight) || Number.parseFloat(actionStyle.fontSize) * 1.2;
			const actionContentHeight = action.getBoundingClientRect().height - Number.parseFloat(actionStyle.paddingTop) - Number.parseFloat(actionStyle.paddingBottom);
			const result = {
				scope,
				stageKicker: surface.querySelector(".tmdb-list-review .panel-kicker")?.textContent.trim() ?? null,
				headerDescription: surface.closest(".creation-dialog")?.querySelector(".add-source-heading-description")?.textContent.trim() ?? null,
				selectedCount: ids.length,
				namesInitiallyEmpty,
				collectionNamePresent: Boolean(collectionInput),
				collectionControlsPresent: Boolean(collectionPresentation),
				folderControlsPresent: Boolean(folderPresentation && folderShape),
				defaultTabs: collectionPresentation?.querySelector('[data-editor-choice="tabs"]')?.checked ?? null,
				defaultShowAll: collectionPresentation?.querySelector('[data-editor-control="tmdbListShowAllTab"]')?.checked ?? null,
				defaultCollectionVisible: surface.querySelector('[data-editor-control="tmdbListHideNuvioTitle"]')?.checked === false,
				defaultUnpinned: surface.querySelector('[data-editor-control="tmdbListPinToTop"]')?.checked === false,
				defaultFolderHomeHidden: folderPresentation?.querySelector('[data-editor-choice="hide-home-screen"]')?.checked ?? false,
				defaultPoster: folderShape?.querySelector('[data-editor-choice="poster"]')?.checked ?? false,
				originalOrder: reviewRows.every((row) => row.textContent.includes("Original order")),
				noReviewPreview: reviewRows.every((row) => !buttonContaining(row, "Preview")),
				focusGlowHidden: !surface.textContent.includes("Focus Glow") && !surface.textContent.includes("focusGlowEnabled"),
				sourceNameHelpers: reviewRows.every((row) => row.querySelector(".editor-field-help")?.textContent.trim() === "This is the name shown in Nuvio. You can customise it."),
				initialRequiredValidation,
				folderOnlyValidation,
				requiredValidationCleared,
				validationNoMutation: controller.getState().revision === initialState.revision && serializedValue(controller) === serializedBefore,
				actionCopy: action.textContent.trim(),
				actionLineCount: Math.max(1, Math.round(actionContentHeight / actionLineHeight)),
				oneScrollOwner: scrollOwners.length === 0 || (scrollOwners.length === 1 && scrollOwners[0] === reviewScroll),
				footerReachable: action.closest("footer").getBoundingClientRect().bottom <= window.innerHeight + 1,
				noHorizontalOverflow: surface.scrollWidth <= surface.clientWidth + 1 && reviewRows.every((row) => row.scrollWidth <= row.clientWidth + 1),
			};
			await clickAndSettle(requiredElement(document.querySelector('.creation-dialog[data-creation-option="tmdb-lists"] [data-action="back-to-tmdb-list-selection"]'), `${scope} Review Back`));
			result.backPreservedSelection = surface.querySelectorAll(".tmdb-list-selected-items li").length === ids.length;
			result.backPreviewAvailable = Boolean(surface.querySelector(".tmdb-list-selected-items button"));
			return result;
		}

		const guidedNewCollection = await measureGuided("new-collection", ["101", "102", "103", "104"]);
		const guidedNewFolder = await measureGuided("new-folder", ["105"]);

		const editController = createController();
		const editFolder = importSources(editController, [{ provider: "tmdb", title: "Owner list", tmdbSourceType: "LIST", tmdbId: "5916", mediaType: "MOVIE", sortBy: "original", filters: {} }]);
		const editSource = editFolder.sources[0];
		const openedEdit = createSourceEditSession(editController.getState().project, editSource.internalId);
		if (!openedEdit.ok) throw new Error("Mounted TMDB List Source Edit did not open.");
		const editRevisionBefore = editController.getState().revision;
		const editSerializedBefore = serializedValue(editController);
		await act(async () => {
			root.render(createElement(SourceEditorDialog, {
				key: "tmdb-list-source-edit",
				provider,
				listProvider: provider,
				session: openedEdit.session,
				initialDraft: openedEdit.draft,
				onCancel() {},
				onSave() { throw new Error("Mounted TMDB List Source Edit visual QA must not save."); },
			}));
			await afterCommittedEffects();
		});
		const sourceEditDialog = requiredElement(document.querySelector('.source-edit-dialog[data-source-edit-adapter="tmdb-list"]'), "TMDB List Source Edit dialog");
		const listLink = requiredElement(sourceEditDialog.querySelector('.source-edit-list-identity a[href="https://www.themoviedb.org/list/5916"]'), "TMDB List identity link");
		const listLinkRect = listLink.getBoundingClientRect();
		const listCodeRect = listLink.closest("code").getBoundingClientRect();
		const sourceEdit = {
			linkText: listLink.textContent.replace("↗", "").trim(),
			href: listLink.getAttribute("href"),
			target: listLink.getAttribute("target"),
			rel: listLink.getAttribute("rel"),
			accessibleName: listLink.getAttribute("aria-label"),
			numericLinkOnly: sourceEditDialog.querySelectorAll(".source-edit-list-identity a").length === 1 && listLink.closest("code") !== null && listLink.closest(".source-edit-list-identity") !== listLink,
			linkContained: listLinkRect.left >= listCodeRect.left - 1 && listLinkRect.right <= listCodeRect.right + 1,
			previewAvailable: Boolean(buttonContaining(sourceEditDialog, "Preview titles")),
			sourceNameHelper: sourceEditDialog.querySelector("#source-edit-title-help")?.textContent.trim() ?? null,
			oneScrollOwner: sourceEditDialog.querySelectorAll(".source-edit-scroll").length === 1,
			noHorizontalOverflow: sourceEditDialog.scrollWidth <= sourceEditDialog.clientWidth + 1,
			noMutation: editController.getState().revision === editRevisionBefore && serializedValue(editController) === editSerializedBefore,
		};
		return {
			width: window.innerWidth,
			height: window.innerHeight,
			noSearchAutofocus,
			selection,
			review,
			focusContained,
			genericTitlesLabel,
			previewWithinViewport,
			nestedBodyLocked,
			previewFocusRestored,
			backPreservedSelection,
			backPreviewAvailable,
			guidedNewCollection,
			guidedNewFolder,
			sourceEdit,
			bodyLocked: document.body.style.position === "fixed",
			noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth && dialog.scrollWidth <= dialog.clientWidth + 1,
			noMutation: controller.getState().revision === initialState.revision && serializedValue(controller) === serializedBefore,
			backCalls,
			cancelCalls,
			applyCalls,
		};
	} finally {
		await act(async () => {
			root.unmount();
			await afterCommittedEffects();
		});
		host.remove();
	}
}

async function runTmdbListLivePreviewScenario() {
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	const controller = createController();
	const folder = importSources(controller, []);
	const initialState = controller.getState();
	const serializedBefore = serializedValue(controller);
	await act(async () => {
		root.render(createElement(TmdbListSourceFlow, {
			project: initialState.project,
			projectRevision: initialState.revision,
			folder,
			provider: liveTmdbListProvider,
			onBack() {},
			onCancel() {},
			onApply() { throw new Error("Live TMDB List Preview QA must not apply sources."); },
		}));
		await afterCommittedEffects();
	});
	const required = (element, label) => requiredElement(element, `live TMDB List ${label}`);
	try {
		const dialog = required(document.querySelector(".tmdb-list-dialog"), "dialog");
		const textarea = required(dialog.querySelector("textarea"), "input");
		const requestCountBeforeResolve = liveTmdbListRequests.length;
		await act(async () => {
			setTextareaValue(textarea, "5916\n8679739");
			await afterCommittedEffects();
		});
		await clickAndSettle(required(buttonContaining(dialog, "Resolve lists"), "Resolve action"));
		const selected = await waitForMountedCondition(
			() => {
				const rows = [...dialog.querySelectorAll(".tmdb-list-selected-items li")];
				return rows.length === 2 ? rows : null;
			},
			{ label: "live TMDB List 5916 and 8679739 selection", timeoutMs: 30_000 },
		);
		const requestsAfterResolve = liveTmdbListRequests.length;
		const musicalsRow = required(selected.find((row) => row.querySelector("strong")?.textContent.trim() === "Musicals"), "Musicals row");
		const topTenRow = required(selected.find((row) => row.querySelector("strong")?.textContent.trim() === "Top 10 Netflix Movies"), "Top 10 row");
		const musicalsTrigger = required(musicalsRow.querySelector("button"), "Musicals Preview action");
		await clickAndSettle(musicalsTrigger);
		let preview = await waitForMountedCondition(
			() => {
				const modal = document.querySelector('[data-tmdb-list-preview-dialog="true"]');
				const grid = modal?.querySelector('[data-preview-complete-sample="true"][data-preview-poster-count="20"]');
				return grid ? { modal, grid } : null;
			},
			{ label: "live Musicals complete page-one Preview", timeoutMs: 30_000 },
		);
		const initialGeometry = tmdbListPreviewGeometry(preview.modal, preview.grid);
		const initialMusicals = {
			title: preview.modal.querySelector("h3")?.textContent.trim() ?? null,
			subtitle: preview.modal.querySelector(".source-title-preview-summary")?.textContent.trim() ?? null,
			rendered: Number(preview.grid.dataset.previewPosterCount),
			loaded: Number(preview.grid.dataset.previewLoadedCount),
			completeSample: preview.grid.dataset.previewCompleteSample === "true",
			requests: liveTmdbListRequests.length,
			bodyLocked: document.body.style.position === "fixed",
			noLoadMore: !preview.modal.textContent.includes("Load more"),
			geometry: initialGeometry,
		};
		await act(async () => {
			preview.grid.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: 160 }));
			await afterCommittedEffects();
		});
		const wheelGeometry = tmdbListPreviewGeometry(preview.modal, preview.grid);
		await act(async () => {
			preview.grid.scrollTop = Math.min(80, preview.grid.scrollHeight - preview.grid.clientHeight);
			preview.grid.dispatchEvent(new Event("touchmove", { bubbles: true }));
			preview.grid.dispatchEvent(new Event("scroll", { bubbles: true }));
			await afterCommittedEffects();
		});
		const touchGeometry = tmdbListPreviewGeometry(preview.modal, preview.grid);
		await act(async () => {
			preview.grid.scrollTop = preview.grid.scrollHeight;
			preview.grid.dispatchEvent(new Event("scroll", { bubbles: true }));
			await afterCommittedEffects();
		});
		const bottomGeometry = tmdbListPreviewGeometry(preview.modal, preview.grid);
		const scrolledMusicals = {
			rendered: Number(preview.grid.dataset.previewPosterCount),
			loaded: Number(preview.grid.dataset.previewLoadedCount),
			completeSample: preview.grid.dataset.previewCompleteSample === "true",
			requests: liveTmdbListRequests.length,
			geometry: bottomGeometry,
		};
		await clickAndSettle(required(preview.modal.querySelector("header button"), "Musicals Close action"));
		const focusRestored = document.activeElement === musicalsTrigger;
		await clickAndSettle(musicalsTrigger);
		const reopened = await waitForMountedCondition(
			() => document.querySelector('[data-tmdb-list-preview-dialog="true"] [data-preview-complete-sample="true"][data-preview-poster-count="20"]'),
			{ label: "cached Musicals Preview reopen" },
		);
		const reopenStartsAtTop = reopened.scrollTop === 0;
		const requestsAfterReopen = liveTmdbListRequests.length;
		await clickAndSettle(required(reopened.closest('[data-tmdb-list-preview-dialog="true"]').querySelector("header button"), "reopened Musicals Close action"));

		const topTenTrigger = required(topTenRow.querySelector("button"), "Top 10 Preview action");
		await clickAndSettle(topTenTrigger);
		const smallPreview = await waitForMountedCondition(
			() => {
				const modal = document.querySelector('[data-tmdb-list-preview-dialog="true"]');
				const grid = modal?.querySelector('[data-preview-complete-sample="true"][data-preview-poster-count="10"]');
				return grid ? { modal, grid } : null;
			},
			{ label: "live complete ten-title List Preview", timeoutMs: 30_000 },
		);
		const smallGeometry = tmdbListPreviewGeometry(smallPreview.modal, smallPreview.grid);
		const completeSmallList = {
			title: smallPreview.modal.querySelector("h3")?.textContent.trim() ?? null,
			subtitle: smallPreview.modal.querySelector(".source-title-preview-summary")?.textContent.trim() ?? null,
			rendered: Number(smallPreview.grid.dataset.previewPosterCount),
			loaded: Number(smallPreview.grid.dataset.previewLoadedCount),
			completeSample: smallPreview.grid.dataset.previewCompleteSample === "true",
			geometry: smallGeometry,
		};
		await act(async () => {
			smallPreview.grid.scrollTop = smallPreview.grid.scrollHeight;
			smallPreview.grid.dispatchEvent(new Event("scroll", { bubbles: true }));
			await afterCommittedEffects();
		});
		const requestsAfterSmallScroll = liveTmdbListRequests.length;
		await clickAndSettle(required(smallPreview.modal.querySelector("header button"), "Top 10 Close action"));
		return {
			width: window.innerWidth,
			height: window.innerHeight,
			requestCountBeforeResolve,
			requestsAfterResolve,
			requestPaths: [...liveTmdbListRequests],
			initialMusicals,
			wheelGeometry,
			touchGeometry,
			scrolledMusicals,
			focusRestored,
			reopenStartsAtTop,
			requestsAfterReopen,
			completeSmallList,
			requestsAfterSmallScroll,
			noMutation: controller.getState().revision === initialState.revision && serializedValue(controller) === serializedBefore,
			outerBodyLockPreserved: document.body.style.position === "fixed",
		};
	} finally {
		await act(async () => { root.unmount(); await afterCommittedEffects(); });
		host.remove();
	}
}

let sourceChooserKeyboardSession = null;

async function prepareSourceChooserKeyboardScenario() {
	if (sourceChooserKeyboardSession) throw new Error("Add Source chooser keyboard scenario is already mounted.");
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	const controller = createController();
	const folder = importSources(controller, []);
	controller.selectNode(folder.internalId);
	const revisionBefore = controller.getState().revision;
	const serializedBefore = serializedValue(controller);
	await act(async () => {
		root.render(createElement(MountedWorkspace, { controller }));
		await afterCommittedEffects();
	});
	const trigger = host.querySelector('[data-action="add-source"]');
	if (!trigger) throw new Error("Add Source keyboard trigger was not rendered.");
	await clickAndSettle(trigger);
	const card = document.querySelector('[data-source-mode-option="tmdb-decade"]');
	if (!card) throw new Error("Decade Add Source launcher card was not rendered.");
	card.focus({ preventScroll: true });
	sourceChooserKeyboardSession = { host, root, controller, trigger, card, revisionBefore, serializedBefore };
	return {
		focused: document.activeElement === card,
		nativeButton: card.tagName === "BUTTON" && card.type === "button",
	};
}

async function finishSourceChooserKeyboardScenario() {
	const session = sourceChooserKeyboardSession;
	if (!session) throw new Error("Add Source chooser keyboard scenario was not prepared.");
	sourceChooserKeyboardSession = null;
	try {
		await act(async () => afterCommittedEffects());
		const keyboardDestination = document.querySelector('.decade-source-dialog[data-source-mode="tmdb-decade"]') !== null;
		await clickAndSettle(document.querySelector('.decade-source-dialog [data-action="back-to-source-types"]'));
		const returnedCard = document.querySelector('[data-source-mode-option="tmdb-decade"]');
		const backRestoredFocus = document.activeElement === returnedCard;
		await clickAndSettle(document.querySelector('[data-source-mode-chooser="true"] .add-source-close-action'));
		return {
			keyboardDestination,
			backRestoredFocus,
			closeRestoredTrigger: document.activeElement === session.trigger,
			noMutation: session.controller.getState().revision === session.revisionBefore && serializedValue(session.controller) === session.serializedBefore,
		};
	} finally {
		await act(async () => session.root.unmount());
		session.host.remove();
	}
}

function inspectSourceChooserKeyboardFocus() {
	const session = sourceChooserKeyboardSession;
	if (!session) throw new Error("Add Source chooser keyboard scenario was not prepared.");
	const style = getComputedStyle(session.card);
	return {
		focusVisible: style.outlineStyle !== "none" && style.outlineWidth !== "0px",
		focusBorderVisible: style.borderColor !== "rgba(0, 0, 0, 0)",
	};
}

async function runMountedRegressions() {
	return {
		peopleRequiredName: await runRequiredNameScenario(peopleSource()),
		collectionRequiredName: await runRequiredNameScenario(collectionSource()),
		streamingRequiredName: await runRequiredNameScenario(streamingSource()),
		duplicate: await runDuplicateScenario(),
		streamingCreationRequiredName: await runStreamingCreationRequiredNameScenario(),
		genreBrowseFocus: await runGenreBrowseFocusScenario(),
		genreEditSecondary: await runGenreEditSecondaryScenario(),
		genreCreationSecondary: await runGenreCreationSecondaryScenario(),
		genreStatuses: await runGenreStatusScenario(),
		genreOverrideLabels: await runGenreOverrideLabelsScenario(),
		blankCreation: await runBlankCreationScenario(),
		decadesNavigation: await runDecadesNavigationScenario(),
		decadeSourcePreviewError: await runDecadeSourcePreviewErrorScenario(),
	};
}

window.__builderSourceEditMounted = { status: "running" };
window.__runGenreToolbarScenario = runGenreToolbarScenario;
window.__runGenreHierarchyScenario = runGenreHierarchyScenario;
window.__runGenreNewFolderSummaryScenario = runGenreNewFolderSummaryScenario;
window.__runStreamingHierarchyScenario = runStreamingHierarchyScenario;
window.__runStreamingAffinityDestinationScenario = runStreamingAffinityDestinationScenario;
window.__runStreamingSelectionReconciliationScenario = runStreamingSelectionReconciliationScenario;
window.__runStreamingDuplicateConfirmationScenario = runStreamingDuplicateConfirmationScenario;
window.__runDecadesActionLayoutScenario = runDecadesActionLayoutScenario;
window.__runDecadesGenreLayoutScenario = runDecadesGenreLayoutScenario;
window.__runDecadesExclusionLayoutScenario = runDecadesExclusionLayoutScenario;
window.__runPeopleConfigureLayoutScenario = runPeopleConfigureLayoutScenario;
window.__runPeoplePillStabilityScenario = runPeoplePillStabilityScenario;
window.__runPeopleSelectionScrollScenario = runPeopleSelectionScrollScenario;
window.__runFranchiseReviewScenario = runFranchiseReviewScenario;
window.__runStudioHierarchyScenario = runStudioHierarchyScenario;
window.__runNetworkLivePreviewScenario = runNetworkLivePreviewScenario;
window.__runGenreLivePreviewScenario = runGenreLivePreviewScenario;
window.__runNetworkHierarchyScenario = runNetworkHierarchyScenario;
window.__runNetworkDeferredArtworkScenario = runNetworkDeferredArtworkScenario;
window.__runStudioScaleScenario = runStudioScaleScenario;
window.__runSourceEditLivePreviewScenario = runSourceEditLivePreviewScenario;
window.__runAddSourceLivePreviewParityScenario = runAddSourceLivePreviewParityScenario;
window.__runDecadesLivePreviewScenario = runDecadesLivePreviewScenario;
window.__runDecadeSourceLayoutScenario = runDecadeSourceLayoutScenario;
window.__runDecadeSourceOverlapFooterScenario = runDecadeSourceOverlapFooterScenario;
window.__prepareDecadeSourceGenreKeyboardScenario = prepareDecadeSourceGenreKeyboardScenario;
window.__finishDecadeSourceGenreKeyboardScenario = finishDecadeSourceGenreKeyboardScenario;
window.__runDecadeSourceLivePreviewScenario = runDecadeSourceLivePreviewScenario;
window.__runSourceChooserLayoutScenario = runSourceChooserLayoutScenario;
window.__runTmdbListLayoutScenario = runTmdbListLayoutScenario;
window.__runTmdbListLivePreviewScenario = runTmdbListLivePreviewScenario;
window.__prepareSourceChooserKeyboardScenario = prepareSourceChooserKeyboardScenario;
window.__inspectSourceChooserKeyboardFocus = inspectSourceChooserKeyboardFocus;
window.__finishSourceChooserKeyboardScenario = finishSourceChooserKeyboardScenario;
(["source-details-only", "source-round-trip-only"].some((key) => new URLSearchParams(window.location.search).has(key)) ? Promise.resolve({}) : runMountedRegressions()).then(
	(results) => { window.__builderSourceEditMounted = { status: "complete", results }; },
	(error) => {
		window.__builderSourceEditMounted = {
			status: "error",
			message: error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error),
		};
	},
);
