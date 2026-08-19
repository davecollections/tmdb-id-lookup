import { act, createElement, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { createBuilderController } from "../../builder/src/application/index.js";
import {
	createPeopleManifestClient,
	createStudioCatalogueProvider,
	createTmdbCollectionProvider,
	createTmdbPersonProvider,
	createTmdbStudioPreviewProvider,
} from "../../builder/src/source-add/index.js";
import {
	chooseMovieCollection,
	createSourceEditSession,
	saveSourceEdit,
} from "../../builder/src/source-edit/index.js";
import { SourceEditorDialog } from "../../builder/src/ui/SourceEditorDialog.jsx";
import { GenreSourceFlow } from "../../builder/src/ui/GenreSourceFlow.jsx";
import { PeopleBulkConfigurationList, PeopleSourceFlow } from "../../builder/src/ui/PeopleSourceFlow.jsx";
import { StreamingSourceFlow } from "../../builder/src/ui/StreamingSourceFlow.jsx";
import { BuilderWorkspace } from "../../builder/src/ui/BuilderWorkspace.jsx";
import { CreationDialog } from "../../builder/src/ui/CreationDialog.jsx";
import { createArtworkRuntimeClient } from "../../js/artwork-runtime.mjs";
import "../../builder/src/styles.css";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const livePeopleManifestClient = createPeopleManifestClient();
const liveStudioCatalogueProvider = createStudioCatalogueProvider({ catalogueUrl: "/data/companies.min.json" });
const liveStudioArtworkRuntimeClient = createArtworkRuntimeClient();

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
	label,
	timeoutMs = 20_000,
}) {
	let diagnostic = { preview: false, grid: false, expectedVisibleCount, images: [] };
	try {
		return await waitForMountedCondition(() => {
			const previewElement = typeof preview === "string" ? document.querySelector(preview) : preview;
			const grid = previewElement?.querySelector(gridSelector) ?? null;
			const images = grid ? [...grid.querySelectorAll(":scope > img")] : [];
			const visibleImages = images.filter(visibleElement);
			diagnostic = {
				preview: Boolean(previewElement),
				previewStatus: previewElement?.dataset.previewStatus ?? "not-exposed",
				grid: Boolean(grid),
				expectedVisibleCount,
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
			if (visibleImages.some((image) => !image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0)) return null;
			return { grid, images, visibleImages };
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
		artworkClient: {},
	});
}

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
		return {
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
		const pointerIndicator = required(pointerCard.querySelector('[data-selection-indicator="true"]'), "pointer selection indicator");

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
		await clickAndSettle(keyboardInput);
		const keyboardAfterToggle = capture(dialog, scrollElement, action, keyboardCard, keyboardInput);
		const keyboardIndicator = required(keyboardCard.querySelector('[data-selection-indicator="true"]'), "keyboard selection indicator");

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
			resultCount: cards.length,
			pointer: {
				partiallyClipped: pointerPartiallyClipped,
				inputInsideCardBeforeFocus: pointerBefore.inputInsideCard,
				selectedExactlyOnce: pointerInput.checked === true,
				selectedState: pointerIndicator.dataset.selectionState,
				selectedTick: pointerIndicator.textContent.trim(),
				outerStable: stableOuter(pointerBefore, pointerAfter),
				documentStable: stableDocument(pointerBefore, pointerAfter),
				innerScrollDelta: pointerAfter.innerScrollTop - pointerBefore.innerScrollTop,
				actionStable: Math.abs(pointerBefore.actionTop - pointerAfter.actionTop) <= 1 && Math.abs(pointerBefore.actionBottom - pointerAfter.actionBottom) <= 1,
			},
			keyboard: {
				partiallyClipped: keyboardPartiallyClipped,
				inputInsideCardBeforeFocus: keyboardBefore.inputInsideCard,
				focused: keyboardActive,
				outerStable: stableOuter(keyboardBefore, keyboardFocused) && stableOuter(keyboardFocused, keyboardAfterToggle),
				documentStable: stableDocument(keyboardBefore, keyboardFocused) && stableDocument(keyboardFocused, keyboardAfterToggle),
				innerScrolledToKeepFocusVisible: keyboardFocused.innerScrollTop > keyboardBefore.innerScrollTop,
				selectedExactlyOnce: keyboardInput.checked === true,
				selectedState: keyboardIndicator.dataset.selectionState,
				selectedTick: keyboardIndicator.textContent.trim(),
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
	const expectedPosterCount = window.innerWidth <= 520 ? 5 : 10;
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
		const createButton = required(buttonContaining(dialog, "Create 2 folders"), "Create action");
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
	const expectedPosterCount = window.innerWidth <= 520 ? 5 : 10;
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
			mostMoviesAbsent: buttonContaining(dialog, "Most movies") === null,
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
			createAction: buttonContaining(dialog, "Create 2 folders")?.textContent.trim(),
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
		await clickAndSettle(required(buttonContaining(dialog, "Create 100 folders"), `Create action with totals ${totals.join("/")}`));
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
				const indicator = required(card.querySelector('[data-selection-indicator="true"]'), "circular selection indicator");
				const indicatorBefore = getComputedStyle(indicator);
				const unselectedState = indicator.dataset.selectionState;
				resultInput.focus();
				const keyboardFocusable = document.activeElement === resultInput && resultInput.tabIndex === 0;
				await clickAndSettle(card);
				const indicatorAfter = getComputedStyle(indicator);
				selectionAffordance = {
					nativeCheckbox: resultInput.type === "checkbox",
					keyboardFocusable,
					unselectedState,
					cardClickToggled: resultInput.checked === true,
					accessibleChecked: resultInput.checked === true,
					selectedState: indicator.dataset.selectionState,
					selectedTick: indicator.textContent.trim(),
					circular: indicatorAfter.borderRadius === "50%" || indicatorAfter.borderRadius === `${indicator.getBoundingClientRect().width / 2}px`,
					size: Math.round(indicator.getBoundingClientRect().width),
					unselectedRingVisible: indicatorBefore.borderTopWidth !== "0px",
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
		let preview = document.querySelector(".people-title-preview");
		let previewGrid = preview.querySelector(".people-title-preview-grid");
		const expectedPosterCount = window.innerWidth <= 520 ? 5 : 10;
		const readyMoviePosters = await waitForReadyPosterGrid({
			preview,
			gridSelector: ".people-title-preview-grid",
			expectedVisibleCount: expectedPosterCount,
			label: `Live People Movies Preview at ${window.innerWidth}px`,
		});
		const previewBackdrop = preview.closest(".nested-modal-backdrop");
		const creationPortal = document.querySelector(".add-source-portal");
		const previewTabs = required(preview.querySelector(".people-preview-tabs"), "People Preview media tabs");
		const movieTab = required(buttonContaining(previewTabs, "Movies"), "People Movies Preview tab");
		const seriesTab = required(buttonContaining(previewTabs, "Series"), "People Series Preview tab");
		const moviesInitiallyActive = movieTab.getAttribute("aria-selected") === "true" && seriesTab.getAttribute("aria-selected") === "false";
		const moviePosterCount = readyMoviePosters.visibleImages.length;
		await clickAndSettle(seriesTab);
		preview = document.querySelector(".people-title-preview");
		previewGrid = preview.querySelector(".people-title-preview-grid");
		const readySeriesPosters = await waitForReadyPosterGrid({
			preview,
			gridSelector: ".people-title-preview-grid",
			expectedVisibleCount: expectedPosterCount,
			label: `Live People Series Preview at ${window.innerWidth}px`,
		});
		const mediaSeparation = {
			tabCount: previewTabs.querySelectorAll('[role="tab"]').length,
			moviesInitiallyActive,
			seriesActive: movieTab.getAttribute("aria-selected") === "false" && seriesTab.getAttribute("aria-selected") === "true",
			moviePosterCount,
			seriesPosterCount: readySeriesPosters.visibleImages.length,
			seriesCount: /Series · [\d,]+/.test(preview.textContent),
			seriesPostersReady: readySeriesPosters.visibleImages.every((image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0 && visibleElement(image)),
			seriesGenuineTmdbSources: genuineTmdbPosterImages(readySeriesPosters.visibleImages),
			noCombinedTotal: !preview.textContent.includes("Movies + Series") && !preview.textContent.includes("Combined"),
			noAdditionalRequests: requests.length === requestsBeforePreview,
		};
		await clickAndSettle(movieTab);
		preview = document.querySelector(".people-title-preview");
		previewGrid = preview.querySelector(".people-title-preview-grid");
		const restoredMoviePosters = await waitForReadyPosterGrid({
			preview,
			gridSelector: ".people-title-preview-grid",
			expectedVisibleCount: expectedPosterCount,
			label: `Restored live People Movies Preview at ${window.innerWidth}px`,
		});
		const previewState = {
			modalSurface: preview.dataset.previewSurface === "modal" && preview.getAttribute("role") === "dialog" && preview.getAttribute("aria-modal") === "true",
			outsidePeopleRow: preview.closest(".people-bulk-row") === null,
			posterCount: restoredMoviePosters.visibleImages.length,
			postersReady: restoredMoviePosters.visibleImages.every((image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0 && visibleElement(image)),
			genuineTmdbSources: genuineTmdbPosterImages(restoredMoviePosters.visibleImages),
			gridColumns: getComputedStyle(previewGrid).gridTemplateColumns.split(" ").filter(Boolean).length,
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
		preview = document.querySelector(".people-title-preview");
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
		const createButton = buttonContaining(dialog, "Create 2 folders");
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
		await clickAndSettle(dialog.querySelector('[data-decade-preset="1980s"]'));
		await clickAndSettle(dialog.querySelector('[data-decade-preset="2000s"]'));
		await clickAndSettle(dialog.querySelector(".decades-creation-actions .editor-apply"));
		const back = dialog.querySelector('header [data-action="back-to-decades-presets"]');
		const footer = dialog.querySelector(".decades-creation-actions");
		const primary = footer.querySelector(".editor-apply");
		const primaryRect = primary.getBoundingClientRect();
		const backRect = back.getBoundingClientRect();
		const headingFocused = document.activeElement?.id === "decades-options-title";
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
	};
}

window.__builderSourceEditMounted = { status: "running" };
window.__runGenreToolbarScenario = runGenreToolbarScenario;
window.__runDecadesActionLayoutScenario = runDecadesActionLayoutScenario;
window.__runDecadesGenreLayoutScenario = runDecadesGenreLayoutScenario;
window.__runDecadesExclusionLayoutScenario = runDecadesExclusionLayoutScenario;
window.__runPeopleConfigureLayoutScenario = runPeopleConfigureLayoutScenario;
window.__runPeoplePillStabilityScenario = runPeoplePillStabilityScenario;
window.__runPeopleSelectionScrollScenario = runPeopleSelectionScrollScenario;
window.__runFranchiseReviewScenario = runFranchiseReviewScenario;
window.__runStudioHierarchyScenario = runStudioHierarchyScenario;
window.__runStudioScaleScenario = runStudioScaleScenario;
runMountedRegressions().then(
	(results) => { window.__builderSourceEditMounted = { status: "complete", results }; },
	(error) => {
		window.__builderSourceEditMounted = {
			status: "error",
			message: error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error),
		};
	},
);
