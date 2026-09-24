import "../../builder/src/styles.css";
import { useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { createBuilderController } from "../../builder/src/application/index.js";
import { BuilderWorkspace } from "../../builder/src/ui/BuilderWorkspace.jsx";
import { buildGenreSourceDrafts } from "../../builder/src/source-add/index.js";
import { loadFolderArtworkSuggestions } from "../../builder/src/folder-artwork-suggestions.js";
import importedPeople from "../../manual-tests/nuvio-clients/issue-74-builder-add-people/results/nuvio-desktop-immediate-export.json";

const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
const assert = (value, message) => { if (!value) throw new Error(message); };
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const click = async (element) => { assert(element, "Missing click target"); element.focus({ preventScroll: true }); element.click(); await frame(); };
const input = async (element, value) => { assert(element, "Missing input target"); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(element, value); element.dispatchEvent(new Event("input", { bubbles: true })); await frame(); };
const button = (text) => $$('[role="dialog"] button').find((element) => element.textContent === text);
const modal = () => $('[data-collection-folders-dialog]');
let root;
let controller;
let artwork;
let preservedUrl;
let beforeDrag;
let ownerActors;
let presentationOpeningState;
let presentationTrigger;
let fetches = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = (...args) => { fetches.push(String(args[0])); return originalFetch(...args); };
function Workspace() {
	const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
	return <BuilderWorkspace controller={controller} state={state} />;
}
// Editable imported projects exercise local management; no external service
// results, catalogue metadata, counts or responses are replaced.
function project(count = 70, people = false) {
	const names = ["Tom Hanks", "Steven Spielberg", "Robert Downey Jr.", "Bong Joon Ho", "Wong Kar-Wai", "Cher", "Björk"];
	const ids = [31, 488, 3223, 21684, 12453, 7835, 6748];
	return [{ id: "review", title: people ? "People collection" : "Collection review", viewMode: "TABBED_GRID", folders: Array.from({ length: count }, (_, i) => ({
		id: `folder-${i}`, title: people ? names[i % names.length] : i < 2 ? "Duplicate title" : i === 2 ? "\u200e" : `Folder ${String(i).padStart(3, "0")}`,
		tileShape: i % 2 ? "LANDSCAPE" : "POSTER", unknownFolder: { keep: i },
		sources: people ? [{ provider: "tmdb", tmdbSourceType: "PERSON", tmdbId: ids[i % ids.length], title: "Movie Credits", mediaType: "MOVIE", filters: {}, sortBy: "popularity.desc" }] : i === 3 ? [] : buildGenreSourceDrafts(["Action"], { sharedMediaChoice: "movies" }).drafts.map((draft) => draft.editable),
	})) }];
}
async function mount(value = project()) {
	if (root) root.unmount();
	await frame();
	controller = createBuilderController();
	assert(controller.importValue(value).ok, "Project imported");
	const collection = controller.getState().project.collections[0];
	controller.selectNode(collection.folders[0]?.internalId ?? collection.internalId);
	root = createRoot(document.getElementById("root"));
	root.render(<Workspace />);
	await frame();
	fetches = [];
	return collection;
}
async function showCollections() {
	// At phone widths use the ordinary level navigation, then the exact menu.
	const foldersBack = $('.sources-panel .back-control');
	if (foldersBack?.getClientRects().length) await click(foldersBack);
	const collectionsBack = $('.folders-panel .back-control');
	if (collectionsBack?.getClientRects().length) await click(collectionsBack);
}
async function open(action) {
	await showCollections();
	const trigger = $('[data-action="open-collection-actions"]');
	await click(trigger);
	assert($$('[data-actions-menu="collection"] [role="menuitem"]').map((el) => el.textContent).join("|") === "Edit|Sort folders|Remove folders|Delete collection", "Collection menu order");
	await click($(`[data-action="${action}"]`));
	return trigger;
}
async function closeEditor() { await click($('[data-action="cancel-node-edit"]')); }
function measure() {
	const dialog = modal();
	const rect = dialog.getBoundingClientRect();
	const actions = $('.collection-folders-actions').getBoundingClientRect();
	const scroll = $('.collection-folders-scroll');
	assert(rect.left >= -1 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1, "Dialog fits viewport");
	assert(actions.bottom <= innerHeight + 1 && actions.top >= 0, "Footer remains reachable");
	assert(dialog.scrollHeight <= dialog.clientHeight + 1, "Modal does not become a second scroll owner");
	assert(dialog.scrollWidth <= dialog.clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth, "No horizontal overflow");
	assert(document.body.style.position === "fixed", "Body scroll locked");
	assert($('.workspace-underlay').inert, "Workspace inert");
	const removing = dialog.dataset.collectionFoldersDialog === "remove";
	const warning = $('.collection-folders-controls .genre-attention-note');
	if (removing) {
		const warningRect = warning.getBoundingClientRect();
		assert(warningRect.top >= rect.top && warningRect.bottom <= actions.top, "Irreversible warning stays visible outside the list");
		assert(warning.textContent === "This can’t be undone. Selected folders and all sources inside them will be permanently deleted.", "Exact irreversible Folder and Source consequence");
		assert(getComputedStyle(warning).color === "rgb(255, 240, 202)" || matchMedia("(forced-colors: active)").matches, "Established amber warning treatment");
	}
	const rowHeights = $$('.collection-folder-list label').map((row) => row.getBoundingClientRect().height);
	if (rowHeights.length) assert(Math.min(...rowHeights) >= 44 && Math.max(...rowHeights) <= 56, "Compact rows retain full-row tap targets");
	if (innerWidth >= 900) assert(rect.width <= (removing ? 560 : 460), "Compact desktop management width");
	return { width: innerWidth, modalWidth: rect.width, modalHeight: rect.height, mode: dialog.dataset.collectionFoldersDialog, rowHeight: rowHeights[0] ?? null, scrollable: scroll.scrollHeight > scroll.clientHeight, footer: true };
}

window.runCollectionFoldersCase = async () => {
	const collection = await mount();
	const before = controller.getState();
	const trigger = await open("remove-folders");
	assert(document.activeElement === modal(), "Dialog receives initial focus");
	assert(!modal().querySelector('input[type="search"], [role="tab"], [aria-label="Show folders"]'), "No Search or All/Selected tabs");
	assert(button("Delete 0 folders").disabled, "Zero selection cannot delete");
	assert($$('.collection-folder-list input').length === 70, "All 70 current rows rendered");
	assert($$('.collection-folder-list strong').filter((el) => el.textContent === "Duplicate title").length === 2, "Duplicate titles remain visible");
	assert($('.collection-folder-list').textContent.includes("Hidden title") && $('.collection-folder-list').textContent.includes("Folder 4 · 0 sources"), "Safe titles and zero-source context");
	const removeLayout = measure();
	assert(removeLayout.scrollable, "Only folder list scrolls at scale");
	for (const checkbox of $$('.collection-folder-list input').slice(0, 5)) await click(checkbox);
	assert(button("Delete 5 folders"), "Several retained selections update destructive count");
	await Promise.all(button("Delete 5 folders").getAnimations().map((animation) => animation.finished));
	assert(getComputedStyle(button("Delete 5 folders")).backgroundColor === "rgb(129, 47, 50)", `Delete remains red: ${getComputedStyle(button("Delete 5 folders")).backgroundColor}`);
	await click(button("Select all"));
	assert($$('.collection-folder-list input:checked').length === 70 && button("Delete 70 folders"), "Select all selects the complete ordered list");
	await click(button("Clear all"));
	assert(button("Delete 0 folders").disabled, "Clear all clears the entire retained set");
	await click(button("Cancel"));
	assert(controller.getState().project === before.project && controller.getState().revision === before.revision, "Cancel mutates nothing");
	assert(document.activeElement === trigger, "Cancel restores exact menu trigger");
	await open("remove-folders");
	for (const checkbox of $$('.collection-folder-list input').slice(0, 15)) await click(checkbox);
	assert($('.genre-selection-toolbar [role="status"]').textContent === "15 of 70 selected", "15 of 70 count");
	assert($$('.collection-folder-list small').every((el, i) => el.textContent.startsWith(`Folder ${i + 1} ·`)), "Selection does not change current Folder order");
	let notifications = 0;
	const stop = controller.subscribe(() => { notifications += 1; });
	await click(button("Delete 15 folders"));
	stop();
	const after = controller.getState();
	assert(!modal() && !$('.delete-confirmation'), "The removal dialog is the only confirmation");
	assert(after.revision === before.revision + 1 && notifications === 1, "One atomic content revision/notification");
	assert(after.project.collections[0].folders.length === 55, "Exactly 15 removed");
	assert(after.project.collections[0].folders[0] === collection.folders[15], "Surviving subtree identity unchanged");
	assert(innerWidth < 900 ? after.selection.folderInternalId === null : after.selection.folderInternalId === collection.folders[15].internalId, "Existing selection is retained or recovers to next surviving sibling");
	if (innerWidth < 900) assert($('.workspace').dataset.mobileLevel === "folders", "Mobile returns to Folder level");
	assert(document.activeElement.dataset.nodeId === collection.folders[15].internalId || document.activeElement.textContent.includes("Folder 015"), "Focus recovers to surviving folder");
	await open("sort-folders");
	assert($$('input[name="collection-folder-sort"]').length === 2, "Mixed non-People collection has only generic sorts");
	const sortLayout = measure();
	const sameOrder = controller.getState();
	await click(button("Sort folders"));
	assert(controller.getState().revision === sameOrder.revision, "Already sorted is zero revision");
	await open("sort-folders");
	await click($('input[value="za"]'));
	await click(button("Sort folders"));
	assert(controller.getState().project.collections[0].folders[0] === collection.folders[69], "Z–A applied");
	assert(controller.getState().selection.folderInternalId === sameOrder.selection.folderInternalId, "Sorting retains active selection");
	assert(fetches.length === 0, "Local removal/sorting makes no external requests");
	return { passed: true, removeLayout, sortLayout };
};

window.runCollectionPeopleCase = async () => {
	const collection = await mount(project(7, true));
	const before = controller.getState();
	await open("sort-folders");
	assert($$('input[name="collection-folder-sort"]').length === 4, "People offers A–Z, Z–A, First name and Last name");
	const layout = measure();
	await click($('input[value="last"]'));
	await click(button("Sort folders"));
	assert(controller.getState().revision === before.revision + 1, "People sort one revision");
	assert(controller.getState().project.collections[0].folders.map((f) => f.editable.title).join("|") === "Björk|Cher|Tom Hanks|Bong Joon Ho|Robert Downey Jr.|Wong Kar-Wai|Steven Spielberg", "Pragmatic final-word order");
	assert(collection.folders.every((folder) => controller.getState().project.collections[0].folders.includes(folder)), "Titles and folders unchanged");
	const handle = $$('[data-action="reorder-folder"]').find((el) => !el.disabled);
	assert(handle, "Folder drag/keyboard handle remains enabled after sorting");
	assert(fetches.length === 0, "People sorting makes no requests");
	return { passed: true, layout, requests: fetches.length };
};

window.runCollectionImportedPeopleCase = async () => {
	const collection = await mount(importedPeople);
	const before = controller.getState();
	const sourceBytes = JSON.stringify(collection.folders.map((folder) => folder.sources));
	await open("sort-folders");
	assert($$('input[name="collection-folder-sort"]').map((el) => el.value).join("|") === "az|za|first|last", "Nuvio-expanded imported People exposes all four choices");
	const layout = measure();
	await click($('input[value="first"]'));
	await click(button("Sort folders"));
	const after = controller.getState();
	assert(after.revision === before.revision + 1, "Imported First name sort commits once");
	assert(after.project.collections[0].folders[0] === collection.folders[1], "First name uses current title");
	assert(JSON.stringify(collection.folders.map((folder) => folder.sources)) === sourceBytes, "Imported casing, null/default fields and source values remain exact");
	await open("sort-folders");
	await click($('input[value="last"]'));
	await click(button("Sort folders"));
	assert(controller.getState().project.collections[0].folders[0] === collection.folders[0], "Imported Last name order unchanged");
	assert(fetches.length === 0, "Imported sort makes no external requests");
	return { passed: true, layout, requests: fetches.length };
};

// Optional local owner evidence is supplied by the runner, never committed as a fixture.
window.setCollectionOwnerImport = (value) => {
	ownerActors = value.find((collection) => collection.title === "Actors");
	assert(ownerActors, "Owner import contains Actors");
};
window.runCollectionOwnerImportCase = async () => {
	await mount([ownerActors]);
	const before = controller.getState();
	await open("sort-folders");
	assert($$('input[name="collection-folder-sort"]').map((el) => el.value).join("|") === "az|za", "Owner's LIST/opaque Actors remains fail-closed");
	const layout = measure();
	await click(button("Cancel"));
	assert(controller.getState().project === before.project && controller.getState().revision === before.revision, "Inspection/Cancel preserves the complete owner import");
	assert(fetches.length === 0, "Owner inspection makes no external requests");
	return { passed: true, layout, requests: fetches.length };
};

window.prepareCollectionPostSortDrag = async () => {
	await click($('[data-node-type="collection"]'));
	const handles = $$('[data-action="reorder-folder"]');
	const first = handles[0].getBoundingClientRect();
	const third = handles[2].getBoundingClientRect();
	beforeDrag = controller.getState();
	return { x: first.x + first.width / 2, y: first.y + first.height / 2, endY: third.y + third.height / 2 };
};
window.verifyCollectionPostSortDrag = () => {
	const after = controller.getState();
	assert(after.revision === beforeDrag.revision + 1, "Native pointer drag after sort commits once");
	assert(after.project.collections[0].folders[0] !== beforeDrag.project.collections[0].folders[0], "Drag changes sorted order");
	assert(JSON.stringify(after.selection) === JSON.stringify(beforeDrag.selection), "Drag keeps selection");
	assert(after.project.collections[0].folders.every((f) => beforeDrag.project.collections[0].folders.includes(f)), "Drag retains every exact subtree");
	return true;
};

window.runCollectionAllRemovalCase = async ({ checkEmptyShape = true } = {}) => {
	const collection = await mount(project(200));
	await open("remove-folders");
	await click(button("Select all"));
	assert(button("Delete 200 folders"), "No arbitrary selection cap");
	await click(button("Delete 200 folders"));
	assert(controller.getState().project.collections[0].folders.length === 0, "All folders removed");
	assert(controller.getState().selection.collectionInternalId === collection.internalId && controller.getState().selection.folderInternalId === null, "Parent selected");
	assert($('[data-action="create-folder-empty"]')?.getClientRects().length, "Normal empty Folder state visible");
	if (checkEmptyShape) {
		await open("edit-collection");
		assert($('[data-editor-field="folderShape"]').textContent.includes("There are no folders"), "Empty shape state");
		assert(!$('[data-editor-field="folderShape"] input'), "No fake default");
		await closeEditor();
	}
	return { passed: true };
};

async function artworkProject() {
	await mount(project(2));
	const folder = controller.getState().project.collections[0].folders[0];
	artwork = await loadFolderArtworkSuggestions({ folder });
	const comedy = { ...folder, sources: buildGenreSourceDrafts(["Comedy"]).drafts.map((draft, i) => ({ ...draft, nodeType: "source", internalId: `comedy-${i}` })) };
	preservedUrl = (await loadFolderArtworkSuggestions({ folder: comedy })).curated.coverImageUrl.POSTER;
	assert(artwork?.curated.coverImageUrl.SQUARE && preservedUrl, "Existing published Genre authority loaded");
	const value = project(2);
	Object.assign(value[0].folders[0], { title: "Action · curated", coverImageUrl: artwork.curated.coverImageUrl.POSTER, focusGifUrl: artwork.curated.focusGifUrl.POSTER, focusGifEnabled: false, heroBackdropUrl: artwork.curated.heroBackdropUrl, titleLogoUrl: artwork.curated.titleLogoUrl });
	Object.assign(value[0].folders[1], { title: "Action · custom artwork", coverImageUrl: preservedUrl, tileShape: "LANDSCAPE" });
	return value;
}

window.runCollectionShapeCase = async () => {
	const collection = await mount(await artworkProject());
	const before = controller.getState();
	await open("edit-collection");
	assert($('[data-editor-field="folderShape"]').textContent.includes("Mixed / not set"), "Mixed shape neutral");
	$('[data-editor-field="folderShape"]').scrollIntoView({ block: "center" });
	await frame();
	const editor = $('[data-node-editor]');
	const footer = $('.node-editor-actions').getBoundingClientRect();
	assert(editor.scrollWidth <= editor.clientWidth + 1 && footer.bottom <= innerHeight + 1 && footer.top >= 0, "Collection shape stays contained with reachable actions");
	assert(!$('[data-editor-field="folderShape"] input:checked'), "Mixed has no selected shape");
	await click($('[data-editor-field="folderShape"] input[value="SQUARE"]'));
	await input($('#node-editor-collection-title-input'), "Updated collection");
	await click($('[data-action="apply-node-edit"]'));
	for (let tries = 0; tries < 50 && $('[data-node-editor]'); tries += 1) await frame();
	assert(!$('[data-node-editor]'), "Atomic save closes editor");
	const updated = controller.getState().project.collections[0];
	assert(controller.getState().revision === before.revision + 1 && updated.editable.title === "Updated collection", "Collection and folders save once");
	assert(updated.folders.every((f) => f.editable.tileShape === "SQUARE"), "Shape applied to every current folder");
	assert(updated.folders[0].editable.coverImageUrl === artwork.curated.coverImageUrl.SQUARE && updated.folders[0].editable.focusGifUrl === artwork.curated.focusGifUrl.SQUARE, "Published Tile and Focus counterparts used");
	assert(updated.folders[0].editable.heroBackdropUrl === collection.folders[0].editable.heroBackdropUrl && updated.folders[0].editable.focusGifEnabled === false, "Unrelated artwork and Focus switch preserved");
	assert(updated.folders[1].editable.coverImageUrl === preservedUrl, "Custom imported URL remains exact");
	await open("edit-collection");
	assert($('[data-editor-field="folderShape"] input[value="SQUARE"]').checked, "Uniform saved consensus selected");
	const noop = controller.getState();
	await click($('[data-action="apply-node-edit"]'));
	assert(controller.getState().revision === noop.revision, "Untouched save no-op");
	await open("edit-collection");
	await click($('[data-editor-field="folderShape"] input[value="LANDSCAPE"]'));
	await closeEditor();
	assert(controller.getState().project === noop.project, "Cancel discards shape intent");
	await open("edit-collection");
	await click($('[data-editor-field="folderShape"] input[value="POSTER"]'));
	controller.updateNode(updated.folders[0].internalId, { title: "Changed externally" });
	await frame();
	const stale = controller.getState();
	await click($('[data-action="apply-node-edit"]'));
	assert($('[data-node-editor]') && $('.editor-diagnostics').textContent.includes("Close and reopen"), "Stale editor stays open with actionable error");
	assert(document.activeElement === $('.editor-diagnostics'), "Stale error is focused and brought into view");
	assert(controller.getState().project === stale.project, "Stale shape did not partially apply");
	await closeEditor();
	return { passed: true };
};

window.prepareCollectionFoldersScreenshot = async (state) => {
	if (state.startsWith("artwork")) {
		await mount(await artworkProject());
		if (state === "artwork-after") {
			await open("edit-collection");
			await click($('[data-editor-field="folderShape"] input[value="SQUARE"]'));
			await click($('[data-action="apply-node-edit"]'));
			for (let tries = 0; tries < 50 && $('[data-node-editor]'); tries += 1) await frame();
		}
		const collectionBack = $('.folders-panel .back-control');
		if (collectionBack?.getClientRects().length) await click(collectionBack);
		await click($('[data-node-type="collection"]'));
		await Promise.all($$('.folders-panel img').map((img) => img.decode().catch(() => null)));
	} else if (state.startsWith("shape")) {
		await mount(await artworkProject());
		await open("edit-collection");
		if (state === "shape-square") await click($('[data-editor-field="folderShape"] input[value="SQUARE"]'));
		$('[data-editor-field="folderShape"]').scrollIntoView({ block: "center" });
	} else {
		await mount(state === "owner-actors-sort" ? [ownerActors] : state === "imported-people-sort" ? importedPeople : project(70, state === "people-sort"));
		await open(state.endsWith("sort") ? "sort-folders" : "remove-folders");
		if (state.endsWith("people-sort")) await click($('input[value="last"]'));
		if (state === "remove-selected") {
			for (const el of $$('.collection-folder-list input').slice(0, 15)) await click(el);
		}
	}
	await frame();
};
window.collectionFoldersFixtureReady = true;
window.measureCollectionFolders = measure;

window.prepareCollectionSortPresentation = async (people) => {
	await mount(project(people ? 7 : 2, people));
	presentationOpeningState = controller.getState();
	presentationTrigger = await open("sort-folders");
	return window.measureCollectionSortPresentation(people);
};
window.measureCollectionSortPresentation = (people) => {
	const layout = measure();
	const dialog = modal();
	const rect = dialog.getBoundingClientRect();
	const viewport = window.visualViewport;
	const left = viewport?.offsetLeft ?? 0;
	const top = viewport?.offsetTop ?? 0;
	const width = viewport?.width ?? innerWidth;
	const height = viewport?.height ?? innerHeight;
	assert(rect.left >= left + 11 && rect.right <= left + width - 11 && rect.top >= top + 11 && rect.bottom <= top + height - 11, "Compact Sort remains inside the Visual Viewport with side margins");
	assert(rect.height < height - 24, "Sort uses natural compact content height");
	assert(Math.abs(rect.top + rect.height / 2 - (top + height / 2)) <= 1, "Sort is centered when its content fits");
	const choices = $$('input[name="collection-folder-sort"]');
	assert(choices.map((el) => el.value).join("|") === (people ? "az|za|first|last" : "az|za"), "Exact ordinary/People choices retained");
	const labels = choices.map((el) => el.closest("label"));
	assert(labels.every((label) => label.getBoundingClientRect().height >= (innerWidth < 900 ? 44 : 36)), "Comfortable sort targets");
	assert(labels.every((label) => label.scrollWidth <= label.clientWidth + 1), "No clipped choice labels");
	const scrollOwners = [...dialog.querySelectorAll("*")].filter((el) => /auto|scroll/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 1);
	assert(scrollOwners.length <= 1, "At most one appropriate inner scroll owner");
	assert(!scrollOwners.length, "These short Sort forms need no vertical scrolling");
	return { ...layout, height: innerHeight, choices: choices.length, left: rect.left, top: rect.top, scrollOwners: scrollOwners.length, minChoiceHeight: Math.min(...labels.map((label) => label.getBoundingClientRect().height)) };
};
window.prepareGlobalDisplayPresentation = async () => {
	await mount(project(2));
	await showCollections();
	presentationOpeningState = controller.getState();
	presentationTrigger = $('[data-action="open-bulk-edit"]');
	assert(presentationTrigger.getAttribute("aria-label") === "Global display settings", "Global trigger accessible name");
	assert(presentationTrigger.title === "Global display settings", "Global trigger tooltip");
	assert(presentationTrigger.getAttribute("aria-haspopup") === "dialog", "Trigger still announces dialog");
	await click(presentationTrigger);
	const dialog = $('[data-bulk-edit-dialog]');
	assert(dialog && dialog.getAttribute("role") === "dialog" && dialog.getAttribute("aria-modal") === "true", "Existing Global dialog semantics");
	assert(document.getElementById(dialog.getAttribute("aria-labelledby")).textContent === "Global display settings", "Visible heading labels the dialog");
	assert(document.getElementById(dialog.getAttribute("aria-describedby")).textContent === "Changes apply across all Collections and Folders.", "Existing helper retained");
	assert(dialog.querySelector(".panel-kicker").textContent === "ALL COLLECTIONS & FOLDERS", "Existing kicker retained");
	assert(!dialog.textContent.includes("Bulk display settings"), "Old visible feature name absent");
	assert(dialog.querySelectorAll('input:checked').length === 6 && $('[data-action="apply-bulk-edit"]').disabled, "Existing initial draft and Apply state retained");
	assert(document.activeElement === dialog && $('.workspace-underlay').inert && document.body.classList.contains("settings-modal-open"), "Existing focus, inert workspace and body lock retained");
	return { width: innerWidth, heading: "Global display settings", triggerLabel: presentationTrigger.getAttribute("aria-label"), triggerTitle: presentationTrigger.title, hasPopup: presentationTrigger.getAttribute("aria-haspopup"), passed: true };
};
window.verifyPresentationClosed = () => {
	assert(!modal() && !$('[data-bulk-edit-dialog]'), "Escape closes the current presentation dialog");
	assert(document.activeElement === presentationTrigger, "Exact trigger receives focus");
	assert(controller.getState().project === presentationOpeningState.project && controller.getState().revision === presentationOpeningState.revision, "Presentation/close does not mutate content");
	assert(!$('.workspace-underlay').inert && !document.body.classList.contains("settings-modal-open"), "Existing modal safety released on close");
	assert(fetches.length === 0, "Presentation makes no data requests");
	return true;
};

// #236 exercises only local imported hierarchy navigation, with no external requests.
let topOpeningState;
let topOpeningLevel;
let topScrollCalls;
let topFocusCalls;
let restoreTopInstrumentation;
const topButton = () => $('button[aria-label="Back to top"]');
async function scrollPage(top) {
	window.scrollTo({ top, behavior: "instant" });
	await frame();
}
function assertTopStatePreserved() {
	assert(controller.getState() === topOpeningState, "Selection, project, revision and all controller state remain identical");
	assert($('.workspace').dataset.mobileLevel === topOpeningLevel, "Mobile level remains unchanged");
	assert(fetches.length === 0, "Workspace navigation makes no external requests");
}
window.prepareBackToTopCase = async (level = "folders") => {
	const value = project(70);
	value[0].title = "Large local library";
	value[0].folders[69].sources = Array.from({ length: 40 }, (_, index) => ({
		...value[0].folders[69].sources[0], title: `Local source ${index + 1}`,
	}));
	value.push(...Array.from({ length: 23 }, (_, index) => ({ id: `local-collection-${index}`, title: `Local collection ${index + 2}`, folders: [] })));
	const collection = await mount(value);
	if (level === "collections") controller.clearSelection();
	else controller.selectNode(level === "folders" ? collection.internalId : collection.folders[69].internalId);
	await frame();
	if (level === "sources") {
		const source = $$('.source-button').at(-1);
		source.scrollIntoView({ block: "center", behavior: "instant" });
		await click(source);
		assert(source.getAttribute("aria-pressed") === "true", "Deep Source is selected before returning to top");
	}
	topOpeningState = controller.getState();
	topOpeningLevel = $('.workspace').dataset.mobileLevel;
	await scrollPage(0);
	assert(!topButton(), "Back to top is absent at page top");
	assert(document.scrollingElement === document.documentElement, "Document/window is the scroll owner");
	assert($$('.workspace-panel, .panel-body, .node-list, .source-list').every((el) => el.scrollTop === 0 && !/auto|scroll/.test(getComputedStyle(el).overflowY)), "No independently scrolling workspace columns");
	await scrollPage(innerHeight - 1);
	assert(!topButton(), "Hidden just below one viewport threshold");
	await scrollPage(innerHeight);
	assert(topButton(), "Visible at one viewport threshold");
	await scrollPage(innerHeight + 160);
	assert($$('button[aria-label="Back to top"]').length === 1, "One workspace control");
	assertTopStatePreserved();
	return window.measureBackToTop();
};
window.measureBackToTop = () => {
	const button = topButton();
	assert(button?.closest('.workspace-underlay'), "Native button is inside the existing underlay");
	assert(button.textContent.trim() === "↑ Top" && button.type === "button", "Exact visible and native-button treatment");
	const rect = button.getBoundingClientRect();
	const css = getComputedStyle(button);
	assert(css.position === "fixed", "Fixed to the window");
	assert(rect.width >= 48 && rect.height >= 48, "Comfortable phone tap target");
	assert(rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth - 15 && rect.bottom <= innerHeight - 15, "Lower-right control stays inside viewport margins");
	assert(Math.abs(innerWidth - rect.right - parseFloat(css.right)) < 1 && Math.abs(innerHeight - rect.bottom - parseFloat(css.bottom)) < 1, "Fixed offsets match viewport geometry");
	assert(document.documentElement.scrollWidth <= innerWidth, "No horizontal overflow");
	return { width: innerWidth, height: innerHeight, level: topOpeningLevel, threshold: innerHeight, buttonWidth: rect.width, buttonHeight: rect.height, right: innerWidth - rect.right, bottom: innerHeight - rect.bottom };
};
window.beginBackToTopActivation = () => {
	const heading = $('.builder-product-title');
	const originalScroll = window.scrollTo;
	const originalFocus = heading.focus;
	topScrollCalls = [];
	topFocusCalls = [];
	window.scrollTo = function (options) {
		originalScroll.call(window, options);
		topScrollCalls.push({ options, yAfterCall: scrollY });
	};
	heading.focus = function (options) {
		const before = scrollY;
		originalFocus.call(heading, options);
		topFocusCalls.push({ options, before, after: scrollY });
	};
	restoreTopInstrumentation = () => { window.scrollTo = originalScroll; heading.focus = originalFocus; };
	const button = topButton();
	button.focus({ preventScroll: true });
	const rect = button.getBoundingClientRect();
	return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
};
window.finishBackToTopActivation = async (reduced) => {
	try {
		const deadline = performance.now() + 4000;
		while (scrollY > 0 && performance.now() < deadline) await frame();
		await frame();
		assert(scrollY === 0 && !topButton(), `Activation returns window to top and hides button: ${JSON.stringify({ width: innerWidth, y: scrollY, visible: Boolean(topButton()), calls: topScrollCalls, focus: topFocusCalls, active: document.activeElement?.outerHTML })}`);
		assert(document.activeElement === $('.builder-product-title'), "Top Builder heading receives focus");
		assert(topFocusCalls.length === 1 && topFocusCalls[0].options.preventScroll && topFocusCalls[0].before === topFocusCalls[0].after, "Focus causes no extra scroll");
		assert(topScrollCalls.length === 1 && topScrollCalls[0].options.top === 0, "Exactly one page scroll request");
		assert(topScrollCalls[0].options.behavior === (reduced ? "auto" : "smooth"), "Respects the current reduced-motion preference");
		assert(reduced ? topScrollCalls[0].yAfterCall === 0 : topScrollCalls[0].yAfterCall > 0, "Reduced motion is immediate; normal mode actually animates");
		assertTopStatePreserved();
		return { passed: true, reduced, level: topOpeningLevel };
	} finally { restoreTopInstrumentation(); }
};
window.openBackToTopModal = async (exporting = false) => {
	await scrollPage(innerHeight + 160);
	const floating = topButton();
	const rect = floating.getBoundingClientRect();
	await click($(exporting ? '[data-action="open-export-collections"]' : '[data-action="open-bulk-edit"]'));
	const underlay = $('.workspace-underlay');
	assert(underlay.inert && underlay.getAttribute("aria-hidden") === "true" && getComputedStyle(underlay).pointerEvents === "none", "Modal makes floating-control underlay inert and hidden from accessibility");
	assert(!topButton() || topButton().disabled, "Any retained floating control is disabled");
	floating.focus({ preventScroll: true });
	assert(document.activeElement !== floating && document.activeElement.closest('[role="dialog"]'), "Floating control cannot steal modal focus");
	assert(!document.elementFromPoint(rect.left + 5, rect.top + 5)?.closest('.workspace-back-to-top'), "Modal layer covers floating-control position");
	assertTopStatePreserved();
	return true;
};
window.closeBackToTopModal = async (exporting = false) => {
	assert(document.activeElement.closest('[role="dialog"]'), "Native Tab stays inside modal");
	await click($(exporting ? '[aria-label="Close Export & Send"]' : '[data-action="cancel-bulk-edit"]'));
	await scrollPage(innerHeight + 160);
	assert(!$('.workspace-underlay').inert && topButton() && !topButton().disabled, "Control works again after modal closes");
	assertTopStatePreserved();
	return true;
};
