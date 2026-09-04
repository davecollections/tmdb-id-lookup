import { act, createElement, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { createBuilderController } from "../../builder/src/application/index.js";
import { NUVIO_INVISIBLE_TITLE } from "../../builder/src/nuvio/titles.js";
import { BuilderWorkspace } from "../../builder/src/ui/BuilderWorkspace.jsx";
import "../../builder/src/styles.css";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let idSequence = 0;

function createController(value = null) {
	const controller = createBuilderController({ idFactory: () => `bulk-mounted-${++idSequence}` });
	if (value !== null && !controller.importValue(value).ok) {
		throw new Error("Mounted Bulk Edit fixture import failed.");
	}
	return controller;
}

function visibleTree() {
	return [{
		id: "collection",
		title: "Visible Collection",
		viewMode: "TABBED_GRID",
		showAllTab: true,
		pinToTop: false,
		backdropImageUrl: "https://saved.example/backdrop.webp",
		unknownCollection: { keep: "collection" },
		folders: [{
			id: "folder",
			title: "Visible Folder",
			hideTitle: false,
			tileShape: "POSTER",
			coverImageUrl: "https://saved.example/cover.webp",
			heroBackdropUrl: "https://saved.example/hero.webp",
			titleLogoUrl: "https://saved.example/logo.webp",
			focusGifUrl: "https://saved.example/focus.webp",
			focusGifEnabled: true,
			unknownFolder: { keep: "folder" },
			sources: [{ provider: "community", addonId: "example", type: "movie", catalogId: "first", unknownSource: true }],
		}],
	}];
}

function instrumentController(controller, { failure = null } = {}) {
	const requests = [];
	const proxy = {
		...controller,
		applyPresentationUpdates(updates) {
			requests.push(updates);
			return failure ?? controller.applyPresentationUpdates(updates);
		},
	};
	return { controller, proxy, requests };
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
		networkPreviewProvider: {},
		genrePreviewProvider: {},
		studioCatalogueProvider: {},
		studioCountProvider: {},
		studioPreviewProvider: {},
		studioArtworkRuntimeClient: {},
		streamingCatalogueProvider: {},
		peopleManifestClient: {
			peek() { return null; },
			async load() { return { ok: false, error: { message: "Unavailable in mounted Bulk Edit fixture." } }; },
		},
	});
}

function afterCommittedEffects() {
	return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

async function mountWorkspace(controller) {
	const host = document.getElementById("root");
	const root = createRoot(host);
	await act(async () => {
		root.render(createElement(MountedWorkspace, { controller }));
		await afterCommittedEffects();
	});
	return async () => {
		await act(async () => root.unmount());
		host.replaceChildren();
	};
}

async function click(element) {
	if (!element) throw new Error("Mounted Bulk Edit fixture could not find a requested control.");
	await act(async () => {
		element.click();
		await afterCommittedEffects();
	});
}

async function choose(field, value) {
	const input = document.querySelector(`[data-bulk-edit-field="${field}"] input[type="radio"][value="${value}"]`);
	if (!input) throw new Error(`Mounted Bulk Edit fixture could not find ${field}=${value}.`);
	await click(input);
}

async function pressKey(element, key, { shiftKey = false } = {}) {
	await act(async () => {
		element.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey, bubbles: true }));
		await afterCommittedEffects();
	});
}

function selectedValues() {
	return Object.fromEntries([...document.querySelectorAll("[data-bulk-edit-field]")].map((field) => {
		const input = field.querySelector('input[type="radio"]:checked');
		return [
		input?.name,
		input?.value,
		];
	}));
}

async function combinedConfirmationScenario() {
	const tracked = instrumentController(createController(visibleTree()));
	const before = tracked.controller.getState();
	const beforeFolder = before.project.collections[0].folders[0];
	const saved = {
		focusUrl: beforeFolder.editable.focusGifUrl,
		coverUrl: beforeFolder.editable.coverImageUrl,
		sources: beforeFolder.sources,
		rawFolder: beforeFolder.rawImported,
	};
	const unmount = await mountWorkspace(tracked.proxy);
	try {
		const trigger = document.querySelector('[data-action="open-bulk-edit"]');
		await click(trigger);
		const dialog = document.querySelector('[data-bulk-edit-dialog="true"]');
		const initial = {
			values: selectedValues(),
			applyDisabled: document.querySelector('[data-action="apply-bulk-edit"]').disabled,
			headingFocused: document.activeElement === dialog,
			bodyLocked: document.body.classList.contains("settings-modal-open"),
		};

		await choose("layout", "ROWS");
		await choose("showAllTab", "OFF");
		await choose("pinToTop", "ON");
		await choose("collectionTitles", "HIDE");
		await choose("folderTitleVisibility", "HIDE_EVERYWHERE");
		await choose("focusArtwork", "HIDE");

		const apply = document.querySelector('[data-action="apply-bulk-edit"]');
		const cancel = document.querySelector('[data-action="cancel-bulk-edit"]');
		const footerOrder = [...document.querySelectorAll(".bulk-edit-actions button")].map((button) => button.dataset.action);
		cancel.focus();
		await pressKey(cancel, "Tab");
		const tabWrappedToFirst = document.activeElement === document.querySelector('[data-bulk-edit-field="layout"] input[value="NO_CHANGE"]');
		await click(apply);
		const confirmation = document.querySelector('[data-bulk-title-confirmation="true"]');
		const cancelConfirmation = document.querySelector('[data-action="cancel-bulk-title-confirmation"]');
		const continueConfirmation = document.querySelector('[data-action="continue-bulk-title-confirmation"]');
		const confirmationState = {
			present: confirmation !== null,
			bulkDialogAbsent: document.querySelector('[data-bulk-edit-dialog="true"]') === null,
			message: document.querySelector("#bulk-title-confirmation-description")?.textContent,
			cancelFocused: document.activeElement === cancelConfirmation,
			callsBeforeContinue: tracked.requests.length,
		};
		await pressKey(cancelConfirmation, "Tab", { shiftKey: true });
		confirmationState.shiftTabWrapped = document.activeElement === continueConfirmation;
		await click(cancelConfirmation);
		const choicesAfterCancel = selectedValues();
		const revisionAfterCancel = tracked.controller.getState().revision;

		await click(document.querySelector('[data-action="apply-bulk-edit"]'));
		await click(document.querySelector('[data-action="continue-bulk-title-confirmation"]'));
		const after = tracked.controller.getState();
		const collection = after.project.collections[0];
		const folder = collection.folders[0];
		const completed = {
			calls: tracked.requests.length,
			requestLength: tracked.requests[0]?.length,
			revisionDelta: after.revision - before.revision,
			layout: collection.editable.viewMode,
			showAllTab: collection.editable.showAllTab,
			pinToTop: collection.editable.pinToTop,
			collectionTitle: collection.editable.title,
			folderTitle: folder.editable.title,
			folderHideTitle: folder.editable.hideTitle,
			focusEnabled: folder.editable.focusGifEnabled,
			focusUrlPreserved: folder.editable.focusGifUrl === saved.focusUrl,
			coverUrlPreserved: folder.editable.coverImageUrl === saved.coverUrl,
			sourcesPreserved: folder.sources === saved.sources,
			rawFolderPreserved: folder.rawImported === saved.rawFolder,
			dialogClosed: document.querySelector('[data-bulk-edit-dialog="true"]') === null,
			triggerFocusRestored: document.activeElement === trigger,
			bodyUnlocked: !document.body.classList.contains("settings-modal-open"),
		};

		await click(trigger);
		await choose("showAllTab", "ON");
		await pressKey(document.querySelector('[data-bulk-edit-dialog="true"]'), "Escape");
		const escape = {
			callsUnchanged: tracked.requests.length === 1,
			dialogClosed: document.querySelector('[data-bulk-edit-dialog="true"]') === null,
			triggerFocusRestored: document.activeElement === trigger,
		};

		return {
			initial,
			footerOrder,
			tabWrappedToFirst,
			confirmationState,
			choicesAfterCancel,
			cancelPreservedRevision: revisionAfterCancel === before.revision,
			cancelPerformedNoCall: tracked.requests.length === 1,
			completed,
			escape,
		};
	} finally {
		await unmount();
	}
}

async function hiddenNoConfirmationScenario() {
	const repeated = `${NUVIO_INVISIBLE_TITLE}${NUVIO_INVISIBLE_TITLE}`;
	const tracked = instrumentController(createController([{
		title: repeated,
		folders: [{ title: repeated, hideTitle: true, focusGifUrl: "", focusGifEnabled: false, sources: [] }],
	}]));
	const before = tracked.controller.getState();
	const unmount = await mountWorkspace(tracked.proxy);
	try {
		await click(document.querySelector('[data-action="open-bulk-edit"]'));
		await choose("collectionTitles", "HIDE");
		await choose("folderTitleVisibility", "HIDE_EVERYWHERE");
		await click(document.querySelector('[data-action="apply-bulk-edit"]'));
		const after = tracked.controller.getState();
		return {
			confirmationAbsent: document.querySelector('[data-bulk-title-confirmation="true"]') === null,
			dialogClosed: document.querySelector('[data-bulk-edit-dialog="true"]') === null,
			calls: tracked.requests.length,
			revisionDelta: after.revision - before.revision,
			folderTitlePreserved: after.project.collections[0].folders[0].editable.title === repeated,
		};
	} finally {
		await unmount();
	}
}

async function failureScenario() {
	const failure = {
		ok: false,
		errors: [{ code: "MOUNTED_FAILURE", path: "$controller.applyPresentationUpdates", message: "Bulk changes were rejected safely." }],
	};
	const tracked = instrumentController(createController(visibleTree()), { failure });
	const before = tracked.controller.getState();
	const projectBefore = JSON.stringify(before.project);
	const unmount = await mountWorkspace(tracked.proxy);
	try {
		await click(document.querySelector('[data-action="open-bulk-edit"]'));
		await choose("layout", "ROWS");
		await click(document.querySelector('[data-action="apply-bulk-edit"]'));
		const diagnostic = document.querySelector('[data-bulk-edit-diagnostics="true"]');
		return {
			calls: tracked.requests.length,
			dialogOpen: document.querySelector('[data-bulk-edit-dialog="true"]') !== null,
			draftPreserved: document.querySelector('[data-bulk-edit-field="layout"] input[value="ROWS"]')?.checked === true,
			message: diagnostic?.textContent.trim(),
			diagnosticFocused: document.activeElement === diagnostic,
			projectPreserved: JSON.stringify(tracked.controller.getState().project) === projectBefore,
			revisionPreserved: tracked.controller.getState().revision === before.revision,
		};
	} finally {
		await unmount();
	}
}

async function emptyAndAbsentScenario() {
	const emptyController = createController();
	let unmount = await mountWorkspace(emptyController);
	const emptyTriggerDisabled = document.querySelector('[data-action="open-bulk-edit"]')?.disabled === true;
	await unmount();

	const noFolderController = createController([{ title: "Collection only", folders: [] }]);
	unmount = await mountWorkspace(noFolderController);
	try {
		const trigger = document.querySelector('[data-action="open-bulk-edit"]');
		const populatedTriggerEnabled = trigger.disabled === false;
		await click(trigger);
		return {
			emptyTriggerDisabled,
			populatedTriggerEnabled,
			folderSectionDisabled: document.querySelectorAll(".bulk-edit-section")[1]?.disabled === true,
			folderExplanation: document.querySelectorAll(".bulk-edit-section")[1]?.textContent.includes("No Folders to update."),
		};
	} finally {
		await unmount();
	}
}

function measureLayout() {
	const dialog = document.querySelector('[data-bulk-edit-dialog="true"]');
	const actions = document.querySelector(".bulk-edit-actions");
	const dialogRect = dialog.getBoundingClientRect();
	const actionsRect = actions.getBoundingClientRect();
	const controls = [...dialog.querySelectorAll(".semantic-sort-choices label, button")];
	const choiceGroups = [...dialog.querySelectorAll(".semantic-sort-choice-row")];
	const choices = [...dialog.querySelectorAll(".semantic-sort-choices label")];
	const trigger = document.querySelector('[data-action="open-bulk-edit"]');
	const triggerSurfaceStyle = getComputedStyle(trigger, "::before");
	const collectionHeader = document.querySelector('[data-panel-header="collections"]');
	const titleVisibilityChoices = [...dialog.querySelectorAll('[data-bulk-edit-field="folderTitleVisibility"] label')];
	const titleVisibilityRows = new Set(titleVisibilityChoices.map((choice) => Math.round(choice.getBoundingClientRect().top))).size;
	const potentialScrollOwners = [dialog, ...dialog.querySelectorAll("*")].filter((element) => {
		const overflowY = getComputedStyle(element).overflowY;
		return overflowY === "auto" || overflowY === "scroll";
	});
	return {
		width: window.innerWidth,
		documentOverflow: document.documentElement.scrollWidth > window.innerWidth,
		dialogOverflow: dialog.scrollWidth > dialog.clientWidth,
		dialogWithinViewport: dialogRect.left >= -1 && dialogRect.right <= window.innerWidth + 1,
		actionsReachable: actionsRect.top >= -1 && actionsRect.bottom <= window.innerHeight + 1,
		potentialScrollOwners: potentialScrollOwners.length,
		minimumControlHeight: Math.min(...controls.map((control) => control.getBoundingClientRect().height)),
		minimumChoiceHeight: Math.min(...choices.map((choice) => choice.getBoundingClientRect().height)),
		headerOverflow: document.querySelector(".app-header").scrollWidth > document.querySelector(".app-header").clientWidth,
		collectionHeaderOverflow: collectionHeader.scrollWidth > collectionHeader.clientWidth,
		triggerWidth: trigger.getBoundingClientRect().width,
		triggerHeight: trigger.getBoundingClientRect().height,
		triggerSurfaceWidth: Number.parseFloat(triggerSurfaceStyle.width)
			+ Number.parseFloat(triggerSurfaceStyle.borderLeftWidth)
			+ Number.parseFloat(triggerSurfaceStyle.borderRightWidth),
		triggerSurfaceHeight: Number.parseFloat(triggerSurfaceStyle.height)
			+ Number.parseFloat(triggerSurfaceStyle.borderTopWidth)
			+ Number.parseFloat(triggerSurfaceStyle.borderBottomWidth),
		triggerHasPopup: trigger.getAttribute("aria-haspopup"),
		triggerLabel: trigger.getAttribute("aria-label"),
		triggerTitle: trigger.getAttribute("title"),
		triggerInCollectionsHeader: trigger.closest('[data-panel-header="collections"]') !== null,
		triggerInFoldersHeader: trigger.closest('[data-panel-header="folders"]') !== null,
		triggerInMasthead: document.querySelector('.workspace-header-actions [data-action="open-bulk-edit"]') !== null,
		noNativeSelects: dialog.querySelectorAll("select").length === 0,
		choiceGroupsOverflow: choiceGroups.some((group) => group.scrollWidth > group.clientWidth + 1),
		choiceLabelsClipped: choices.some((choice) => choice.scrollWidth > choice.clientWidth + 1),
		selectedStateVisible: [...dialog.querySelectorAll("[data-bulk-edit-field]")].every((field) => {
			const input = field.querySelector('input[type="radio"]:checked');
			const choice = input?.closest("label");
			const inactiveChoice = [...field.querySelectorAll("label")].find((candidate) => candidate !== choice);
			return choice?.dataset.selected === "true"
				&& getComputedStyle(choice).backgroundColor !== getComputedStyle(inactiveChoice).backgroundColor;
		}),
		selectedCheckmarkCount: dialog.querySelectorAll(".people-source-pill-check").length,
		titleVisibilityRows,
	};
}

function measureBrandingLayout() {
	const header = document.querySelector(".app-header");
	const brand = header.querySelector(".brand-lockup");
	const title = brand.querySelector(".builder-product-title");
	const titleLines = [...title.querySelectorAll(":scope > span")];
	const headerRect = header.getBoundingClientRect();
	const brandRect = brand.getBoundingClientRect();
	const lineRects = titleLines.map((line) => line.getBoundingClientRect());
	const headerActions = [...header.querySelectorAll(".workspace-header-actions button")];
	return {
		width: window.innerWidth,
		height: window.innerHeight,
		headingLines: titleLines.map((line) => line.textContent.trim()),
		headingLineRows: new Set(lineRects.map((rect) => Math.round(rect.top))).size,
		headingLineRectCounts: titleLines.map((line) => line.getClientRects().length),
		headingOverflow: titleLines.some((line) => line.scrollWidth > line.clientWidth + 1),
		headingWithinBrand: lineRects.every((rect) => rect.left >= brandRect.left - 1 && rect.right <= brandRect.right + 1),
		headerOverflow: header.scrollWidth > header.clientWidth,
		documentOverflow: document.documentElement.scrollWidth > window.innerWidth,
		subtitle: header.querySelector(".workspace-subtitle")?.textContent.trim(),
		oldProductTitlePresent: header.textContent.includes("TMDB Collection Builder"),
		headerActionLabels: headerActions.map((action) => action.getAttribute("aria-label") ?? action.textContent.trim()),
		headerActionsContained: headerActions.every((action) => {
			const rect = action.getBoundingClientRect();
			return rect.width > 0 && rect.height > 0
				&& rect.left >= headerRect.left - 1 && rect.right <= headerRect.right + 1
				&& rect.top >= headerRect.top - 1 && rect.bottom <= headerRect.bottom + 1;
		}),
	};
}

function measureWorkspaceHeaderState(name) {
	const workspace = document.querySelector(".workspace");
	const rows = [...workspace.querySelectorAll(":scope > .workspace-panel > .panel-header")].map((header) => {
		const rect = header.getBoundingClientRect();
		return {
			panel: header.dataset.panelHeader,
			top: rect.top,
			bottom: rect.bottom,
			height: rect.height,
			visible: rect.width > 0 && rect.height > 0,
			clipped: header.scrollWidth > header.clientWidth + 1 || header.scrollHeight > header.clientHeight + 1,
			actions: [...header.querySelectorAll(".panel-header-actions .primary-action")].map((button) => (button.getAttribute("aria-label") ?? button.textContent.trim()).replace(/^\+/, "")),
		};
	});
	const visibleRows = rows.filter((row) => row.visible);
	const focusableHeaderButtons = [...workspace.querySelectorAll('.panel-header button:not(:disabled)')].filter((button) => {
		const rect = button.getBoundingClientRect();
		return rect.width > 0 && rect.height > 0;
	});
	const focusResults = focusableHeaderButtons.map((button) => {
		button.focus({ preventScroll: true });
		return document.activeElement === button;
	});
	return {
		name,
		width: window.innerWidth,
		rows,
		visiblePanels: visibleRows.map((row) => row.panel),
		bottomSpread: visibleRows.length > 1
			? Math.max(...visibleRows.map((row) => row.bottom)) - Math.min(...visibleRows.map((row) => row.bottom))
			: 0,
		noClipping: visibleRows.every((row) => !row.clipped),
		noHorizontalOverflow: workspace.scrollWidth <= workspace.clientWidth + 1 && document.documentElement.scrollWidth <= window.innerWidth,
		focusableHeaderLabels: focusableHeaderButtons.map((button) => (button.getAttribute("aria-label") ?? button.textContent.trim()).replace(/^\+/, "")),
		focusableHeaderButtonsWork: focusResults.every(Boolean),
	};
}

let activeLayoutUnmount = null;

async function runWorkspaceHeaderGeometryScenario() {
	if (activeLayoutUnmount) {
		await activeLayoutUnmount();
		activeLayoutUnmount = null;
	}
	const controller = createController();
	const unmount = await mountWorkspace(controller);
	try {
		const empty = measureWorkspaceHeaderState("empty");
		let collectionResult;
		await act(async () => {
			collectionResult = controller.createCollection({ editable: { title: "Collection" } });
			controller.selectNode(collectionResult.createdInternalId);
			await afterCommittedEffects();
		});
		const collectionSelected = measureWorkspaceHeaderState("collection-selected");
		await act(async () => {
			const folderResult = controller.createFolder(collectionResult.createdInternalId, { editable: { title: "Folder" } });
			controller.selectNode(folderResult.createdInternalId);
			await afterCommittedEffects();
		});
		const folderSelected = measureWorkspaceHeaderState("folder-selected");
		return { width: window.innerWidth, states: [empty, collectionSelected, folderSelected] };
	} finally {
		await unmount();
	}
}

async function leaveLayoutScenarioMounted() {
	const tracked = instrumentController(createController(visibleTree()));
	activeLayoutUnmount = await mountWorkspace(tracked.proxy);
	await click(document.querySelector('[data-action="open-bulk-edit"]'));
	window.__measureBuilderBulkEditLayout = measureLayout;
	window.__measureBuilderBrandingLayout = measureBrandingLayout;
	window.__runWorkspaceHeaderGeometryScenario = runWorkspaceHeaderGeometryScenario;
}

window.__builderBulkEditMounted = { status: "running" };

try {
	const results = {
		combined: await combinedConfirmationScenario(),
		hidden: await hiddenNoConfirmationScenario(),
		failure: await failureScenario(),
		emptyAndAbsent: await emptyAndAbsentScenario(),
	};
	await leaveLayoutScenarioMounted();
	window.__builderBulkEditMounted = { status: "complete", results };
} catch (error) {
	window.__builderBulkEditMounted = { status: "error", message: error?.stack ?? String(error) };
}
