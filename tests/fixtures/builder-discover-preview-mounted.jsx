import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import AdvancedDiscoverFlow from "../../builder/src/ui/AdvancedDiscoverFlow.jsx";
import { createAdvancedDiscoverDraft, compileAdvancedDiscover, advancedDiscoverQuery } from "../../builder/src/source-add/advanced-discover.js";
import { createAdvancedDiscoverPlan, applyAdvancedDiscoverPlan } from "../../builder/src/source-add/advanced-discover-plan.js";
import { createSourceEditSession } from "../../builder/src/source-edit/index.js";

const responses = new Map();
let recording = false;
export function recordLiveDiscover() {
	if (recording) return;
	recording = true;
	const realFetch = globalThis.fetch;
	globalThis.fetch = async (input, init) => {
		const response = await realFetch(input, init);
		const url = new URL(input instanceof Request ? input.url : input, location.href);
		if (/\/builder\/discover\/(movie|tv)$/.test(url.pathname) && response.ok) {
			responses.set(url.pathname + url.search, await response.clone().json());
		}
		return response;
	};
}

// All titles, counts and posters come from the shared production-path requester.
// This thin scenario reuses the source-editor mounted browser and lifecycle helpers.
export async function runDiscoverPreviewScenario(helpers, { scope, mediaMode, presentationOnly = false, meaning = false, enlargedText = false }) {
	const { createController, importSources, clickAndSettle, afterCommittedEffects, serializedValue, setInputValue, setSelectValue, titlePreviewGeometry, waitForMountedCondition, streamingProvider } = helpers;
	recordLiveDiscover();
	const controller = createController(), folder = importSources(controller, []);
	if (meaning) {
  controller.updateNode(controller.getState().project.collections[0].internalId, { title: "Movies and Series for the whole family on quiet evenings" });
  controller.updateNode(folder.internalId, { title: "Discover favourites with a long descriptive folder name" });
 }
 const originalFontSize = document.documentElement.style.fontSize;
 if (enlargedText) document.documentElement.style.fontSize = "24px";
 const initial = controller.getState(), collection = initial.project.collections[0];
	const editing = scope.startsWith("edit-");
	let draft = { ...createAdvancedDiscoverDraft(), mediaMode, sortOptionIds: editing ? ["recent"] : ["recent", "top-rated"], filters: { voteCountGte: "100", withGenres: "16", releaseDateGte: "2020-01-01" } };
	if (editing) {
		if (scope === "edit-imported") {
			const value = compileAdvancedDiscover(draft).drafts[0].editable;
			importSources(controller, [{ ...value, id: "imported-discover", filters: { ...value.filters, "vote_count.gte": 100 }, ownerExtra: { keep: [false, 0, ""] } }]);
		} else {
			const plan = createAdvancedDiscoverPlan(initial.project, { scope: "add-source", projectRevision: initial.revision, collectionInternalId: collection.internalId, folderInternalId: folder.internalId, draft });
			if (!plan.ok || !applyAdvancedDiscoverPlan(controller, plan.plan).ok) throw new Error("Builder Discover setup failed.");
		}
		const project = controller.getState().project;
		const opened = createSourceEditSession(project, project.collections[0].folders[0].sources[0].internalId, "advanced-discover");
		if (!opened.ok) throw new Error("Discover editor registry rejected the source.");
		draft = opened.draft;
	}
	const snapshot = serializedValue(controller), openingDraft = JSON.stringify(draft), host = document.createElement("div"), root = createRoot(host);
	document.body.append(host);
	let cancels = 0;
	const forbidden = () => { throw new Error("Preview must not apply or save the draft."); };
	const evidence = { scope, mediaMode, width: innerWidth, height: innerHeight, previews: [] };
	try {
		await act(async () => { root.render(createElement(AdvancedDiscoverFlow, { scope: editing ? "add-source" : scope, ...controller.getState(), projectRevision: controller.getState().revision, collectionInternalId: collection.internalId, folderInternalId: folder.internalId, initialDraft: draft, streamingProvider, onCancel: () => { cancels += 1; }, onApply: forbidden, ...(editing ? { onSave: forbidden } : {}) })); await afterCommittedEffects(); });
		const dialog = document.querySelector(".discover-dialog");
		if (meaning) {
			const inspect = () => {
				if (dialog.querySelector("h2").textContent !== "Add Discover sources") throw new Error("Discover Add claims creation");
				const context = dialog.querySelector(".add-source-heading-row p");
				if (context.textContent !== "To Movies and Series for the whole family on quiet evenings / Discover favourites with a long descriptive folder name") throw new Error("Discover destination path");
				if (document.documentElement.scrollWidth > innerWidth + 1 || dialog.scrollWidth > dialog.clientWidth + 1 || context.scrollWidth > context.clientWidth + 1) throw new Error("Long destination overflows");
				const buttons = [...dialog.querySelectorAll(".add-source-heading-row button, footer button")];
				for (const button of buttons) { const rect = button.getBoundingClientRect(); if (rect.left < -1 || rect.right > innerWidth + 1 || rect.top < -1 || rect.bottom > innerHeight + 1) throw new Error("Discover action clipped"); }
			};
			inspect();
			await clickAndSettle(dialog.querySelector("footer .editor-apply"));
			await afterCommittedEffects(); inspect();
			if (dialog.querySelector("footer .editor-apply").textContent !== "Add sources") throw new Error("Discover Add commit verb");
			await clickAndSettle(dialog.querySelector('[aria-label="Close creation flow"]'));
			if (serializedValue(controller) !== snapshot || cancels !== 1) throw new Error("Discover copy check mutated content");
			return { scope, width: innerWidth, enlargedText, noOverflow: true, noMutation: true, operation: "Add Discover sources" };
		}
		if (presentationOnly) {
			const sort = dialog.querySelector('input[name="discover-sort"]:checked');
			if (sort?.type !== "radio" || sort.parentElement.dataset.selectionMode !== "single") throw new Error("Physical Discover sort lost single-choice semantics.");
			await waitForMountedCondition(() => getComputedStyle(sort.parentElement).backgroundColor === "rgba(1, 180, 228, 0.12)", { label: "scalar Discover sort uses cyan" });
			if (globalThis.capture204Preview) await new Promise(resolve => { window.__finish204Capture = resolve; window.capture204Preview(JSON.stringify({ name: `issue-230-discover-edit-${innerWidth}-sort` })); });
			const region = await waitForMountedCondition(() => dialog.querySelector('#discover-field-watchRegion option[value="AU"]')?.parentElement, { label: "official watch-region option" });
			await act(async () => { setSelectValue(region, "AU"); await afterCommittedEffects(); });
			await waitForMountedCondition(() => getComputedStyle(region).backgroundColor === "rgba(1, 180, 228, 0.12)", { label: "watch region uses cyan" });
			await waitForMountedCondition(() => {
				const providers = dialog.querySelector(".discover-providers");
				const error = providers?.querySelector('.discover-notice[role="alert"]');
				if (error) throw new Error("Live provider catalogue failed: " + error.textContent);
				return providers?.querySelector('.discover-picker-launch:not(:disabled)');
			}, { label: "live provider catalogue ready for AU", timeoutMs: 30000 });
			const picker = dialog.querySelector('[data-picker="withWatchProviders"]');
			if (innerWidth <= 900) await clickAndSettle(picker.querySelector(".discover-picker-launch"));
			else await act(async () => { picker.querySelector('input[type="search"]').focus(); await afterCommittedEffects(); });
			const option = await waitForMountedCondition(() => document.querySelector('[aria-label="Streaming providers suggestions"] [role="option"]'), { label: "actual AU provider result", timeoutMs: 30000 });
			await clickAndSettle(option);
			const panel = document.querySelector(".discover-selection-dialog");
			if (panel) await clickAndSettle(panel.querySelector(".genre-secondary-done"));
			if (dialog.querySelector('.discover-providers [role="alert"]')) throw new Error("Provider selection left an invalid review state.");
			const owner = dialog.querySelector(".add-source-scroll");
			owner.scrollTop += region.getBoundingClientRect().top - owner.getBoundingClientRect().top - 80;
			await afterCommittedEffects();
			if (globalThis.capture204Preview) await new Promise(resolve => { window.__finish204Capture = resolve; window.capture204Preview(JSON.stringify({ name: `issue-230-discover-edit-${innerWidth}-watch-region` })); });
			await clickAndSettle(dialog.querySelector('[aria-label="Close creation flow"]'));
			if (serializedValue(controller) !== snapshot || cancels !== 1) throw new Error("Discover presentation changed saved project.");
			return { width: innerWidth, scalarSortCyan: true, watchRegionCyan: true, liveProviderReady: true, noMutation: true };
		}
		const selected = () => [...dialog.querySelectorAll('input[name="discover-sort"]:checked, input[name="discover-media"]:checked')].map((input) => input.value);
		const fields = () => ["voteCountGte", "voteAverageGte", "releaseDateGte"].map((key) => dialog.querySelector("#discover-field-" + key)?.value);
		async function inspectPreview(expected, changed = false) {
			const before = JSON.stringify([selected(), fields()]);
			await clickAndSettle(dialog.querySelector(".discover-preview-action"));
			const modal = document.querySelector(".source-edit-preview-modal");
			const media = expected.mediaMode === "both" ? ["MOVIE", "TV"] : [expected.mediaMode === "series" ? "TV" : "MOVIE"];
			const orderLabels = expected.sortOptionIds.map((id) => ({ recent: "Recent", "top-rated": "Top rated", "most-votes": "Most voted" })[id]);
			const tabs = (name) => [...modal.querySelectorAll(`[role="tablist"][aria-label="Preview ${name}"] [role="tab"]`)];
			if (JSON.stringify(tabs("media").map((node) => node.textContent)) !== JSON.stringify(media.length > 1 ? ["Movies", "Series"] : [])) throw new Error("Stale or redundant Preview media options.");
			if (JSON.stringify(tabs("show").map((node) => node.textContent)) !== JSON.stringify(orderLabels.length > 1 ? orderLabels : [])) throw new Error("Stale or redundant Preview sort options.");
			for (const mediaType of media) for (const sortId of expected.sortOptionIds) {
				const mediaTab = tabs("media").find((node) => node.textContent === (mediaType === "TV" ? "Series" : "Movies"));
				if (mediaTab && mediaTab.getAttribute("aria-selected") !== "true") await clickAndSettle(mediaTab);
				const sortTab = tabs("show").find((node) => node.textContent === ({ recent: "Recent", "top-rated": "Top rated", "most-votes": "Most voted" })[sortId]);
				if (sortTab && sortTab.getAttribute("aria-selected") !== "true") await clickAndSettle(sortTab);
				await waitForMountedCondition(() => {
					const error = modal.querySelector('[role="alert"]');
					if (error) throw new Error("Live Discover Preview failed: " + error.textContent);
					return !modal.querySelector(".studio-preview-state") && modal.querySelector(".source-edit-preview-grid");
				}, { label: "Live Discover Preview", timeoutMs: 20000 });
				const candidate = compileAdvancedDiscover({ ...expected, mediaMode: mediaType === "TV" ? "series" : "movies", sortOptionIds: [sortId] }).drafts[0];
				const query = advancedDiscoverQuery(candidate), wanted = query.queryParameters;
				const match = [...responses].find(([key]) => {
					const url = new URL(key, location.href);
					return url.pathname.endsWith("/" + (mediaType === "TV" ? "tv" : "movie")) && JSON.stringify([...url.searchParams].sort()) === JSON.stringify(Object.entries(wanted).sort());
				});
				if (!match) throw new Error("No live response matches the current draft: " + JSON.stringify(query));
				const grid = modal.querySelector(".source-edit-preview-grid");
				const expectedPosters = match[1].results.slice(0, 100).filter((row) => row.poster_path).map((row) => row.poster_path);
				const actualPosters = [...grid.querySelectorAll("img")].map((image) => new URL(image.src).pathname.replace(/^\/t\/p\/w\d+/, ""));
				if (JSON.stringify(actualPosters) !== JSON.stringify(expectedPosters)) throw new Error("Preview retained stale titles or ordering.");
				evidence.previews.push({ changed, mediaType, sortId, query: match[0], resultsMatch: true, geometry: titlePreviewGeometry(modal, grid) });
			}
			if (globalThis.capture204Preview && changed) await new Promise((resolve) => { window.__finish204Capture = resolve; window.capture204Preview(JSON.stringify({ name: `discover-${scope}-${innerWidth}` })); });
			await clickAndSettle(modal.querySelector("header button"));
			if (before !== JSON.stringify([selected(), fields()]) || serializedValue(controller) !== snapshot) throw new Error("Preview mutated the draft or source.");
		}
		await inspectPreview(draft);
		const nextMedia = editing ? draft.mediaMode : mediaMode === "series" ? "movies" : "series";
		if (!editing) await clickAndSettle(dialog.querySelector(`input[name="discover-media"][value="${nextMedia}"]`));
		if (!editing) for (const input of [...dialog.querySelectorAll('input[name="discover-sort"]:checked')]) await clickAndSettle(input);
		await clickAndSettle(dialog.querySelector(`input[name="discover-sort"][value="${editing ? "top-rated" : "most-votes"}"]`));
		await act(async () => { setInputValue(dialog.querySelector("#discover-field-voteCountGte"), "500"); setInputValue(dialog.querySelector("#discover-field-voteAverageGte"), "7"); await afterCommittedEffects(); });
		const updated = { ...draft, mediaMode: nextMedia, sortOptionIds: [editing ? "top-rated" : "most-votes"], filters: { ...draft.filters, voteCountGte: "500", voteAverageGte: "7" } };
		await inspectPreview(updated, true);
		await inspectPreview(updated); // same draft: reopening must retain exactly these choices/results
		await clickAndSettle(dialog.querySelector('.add-source-header button[aria-label="Close"]') ?? [...dialog.querySelectorAll("button")].find((button) => button.getAttribute("aria-label")?.startsWith("Close")));
		evidence.preserved = serializedValue(controller) === snapshot && JSON.stringify(draft) === openingDraft;
		evidence.cancelled = cancels === 1;
		return evidence;
	} finally { await act(async () => { root.unmount(); await afterCommittedEffects(); }); host.remove(); document.documentElement.style.fontSize = originalFontSize; }
}
