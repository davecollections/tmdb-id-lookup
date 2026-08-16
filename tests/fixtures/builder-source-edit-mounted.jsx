import { act, createElement, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { createBuilderController } from "../../builder/src/application/index.js";
import {
	chooseMovieCollection,
	createSourceEditSession,
	saveSourceEdit,
} from "../../builder/src/source-edit/index.js";
import { SourceEditorDialog } from "../../builder/src/ui/SourceEditorDialog.jsx";
import { GenreSourceFlow } from "../../builder/src/ui/GenreSourceFlow.jsx";
import { StreamingSourceFlow } from "../../builder/src/ui/StreamingSourceFlow.jsx";
import { BuilderWorkspace } from "../../builder/src/ui/BuilderWorkspace.jsx";
import { CreationDialog } from "../../builder/src/ui/CreationDialog.jsx";
import "../../builder/src/styles.css";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

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
				dialog().querySelector(".decades-titles-visibility h4")?.textContent.trim(),
				dialog().querySelector('details[data-decades-settings="collection-options"] > summary strong')?.textContent.trim(),
				dialog().querySelector('details[data-decades-settings="folder-options"] > summary strong')?.textContent.trim(),
				dialog().querySelector(".decades-review-details > summary")?.textContent.split(" · ")[0].trim(),
			],
			oldFolderLabelAbsent: !dialog().textContent.includes("Decade folder options"),
		};
		const collectionName = dialog().querySelector('input[id="decades-collection-movies"]');
		await act(async () => {
			setInputValue(collectionName, "My Movie Decades");
			await afterCommittedEffects();
		});
		await clickAndSettle(dialog().querySelector('details[data-decades-settings="collection-options"] > summary'));
		await clickAndSettle(dialog().querySelector('input[name="decades-view"][value="ROWS"]'));
		await clickAndSettle(dialog().querySelector('input[data-editor-control="showAllTab"]'));
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
		const reviewNamePreserved = hiddenNamePreserved
			&& dialog().querySelector('input[id="decades-collection-movies"]')?.value === "My Movie Decades"
			&& dialog().querySelector('input[id="decades-collection-movies"]')?.disabled === false
			&& dialog().querySelector('input[name="decades-view"][value="ROWS"]')?.checked === true
			&& dialog().querySelector('input[data-editor-control="showAllTab"]')?.checked === false
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
runMountedRegressions().then(
	(results) => { window.__builderSourceEditMounted = { status: "complete", results }; },
	(error) => {
		window.__builderSourceEditMounted = {
			status: "error",
			message: error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error),
		};
	},
);
