import { act, createElement } from "react";
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
	};
}

window.__builderSourceEditMounted = { status: "running" };
window.__runGenreToolbarScenario = runGenreToolbarScenario;
runMountedRegressions().then(
	(results) => { window.__builderSourceEditMounted = { status: "complete", results }; },
	(error) => {
		window.__builderSourceEditMounted = {
			status: "error",
			message: error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error),
		};
	},
);
