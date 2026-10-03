import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import ownerReview from "../../manual-tests/native-trakt-foundation/owner-review.json";

// Actual local project import/edit/export only. No external provider is exercised.
export async function runTraktFoundationScenario({ createController, MountedWorkspace, clickAndSettle, afterCommittedEffects, setInputValue }, view) {
	const ensure = (condition, message) => { if (!condition) throw new Error(`Trakt ${innerWidth}px: ${message}`); };
	const controller = createController();
	const input = structuredClone(ownerReview);
	input[0].folders[0].sources[0].title = "Local Movie source with a longer name for wrapping";
	input[0].folders[0].sources[0].traktListId = Number.MAX_SAFE_INTEGER;
	Object.assign(input[0].folders[0].sources[1], { provider: "TrAkT", mediaType: "tv", sortBy: "added", sortHow: "desc", future: { retained: [null, false, 0, ""] } });
	ensure(controller.importValue(input).ok, "import");
	const folder = controller.getState().project.collections[0].folders[0];
	controller.selectNode(folder.internalId);
	const originalFetch = window.fetch;
	const requests = [];
	window.fetch = (request, init) => { requests.push(String(request?.url ?? request)); return originalFetch(request, init); };
	const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
	const snapshot = () => JSON.stringify(controller.serializeProject().value);
	const initial = snapshot();
	let projectChanges = 0, previousProject = controller.getState().project;
	const unsubscribe = controller.subscribe(() => {
		const project = controller.getState().project;
		if (project !== previousProject) { projectChanges++; previousProject = project; }
	});
	const screenshot = async (suffix) => {
		if (window.capture204Preview) await new Promise((resolve) => { window.__finish204Capture = resolve; window.capture204Preview(JSON.stringify({ name: `trakt-b2-${innerWidth}-${innerHeight}-${view.forcedColors ? "forced-" : ""}${suffix}` })); });
	};
	const key = async (key) => { await act(async () => { await new Promise((resolve) => { window.__finish230Key = resolve; window.pressGuidedPresentationKey(JSON.stringify({ key })); }); await afterCommittedEffects(); }); };
	try {
		await act(async () => { root.render(createElement(MountedWorkspace, { controller })); await afterCommittedEffects(); });
		const cards = () => [...host.querySelectorAll('button[data-node-type="source"]')];
		ensure(cards().length === 3, "three owner-review sources");
		ensure(cards().slice(0, 2).every((card) => card.querySelector(".source-category").textContent === "Native Trakt"), "supported category");
		ensure(cards()[2].querySelector(".source-category").textContent === "Preserved source", "opaque category");
		ensure(cards()[0].textContent.includes("Movies") && cards()[1].textContent.includes("Series"), "physical media");
		ensure(cards().every((card) => card.scrollWidth <= card.clientWidth + 1), "card overflow");
		ensure(document.documentElement.scrollWidth <= innerWidth, "page overflow");
		await screenshot("cards");
		for (let index = 0; index < 3; index++) {
			const trigger = host.querySelectorAll('[data-action="open-source-actions"]')[index];
			await act(async () => { trigger.scrollIntoView({ block: "center" }); await afterCommittedEffects(); });
			await clickAndSettle(trigger);
			const menu = document.querySelector('[data-actions-menu="source"]:not([hidden])');
			ensure(menu?.querySelector('[data-action="delete-source"]'), "Delete remains available");
			const edit = menu.querySelector('[data-action="edit-source"]');
			if (index === 2) { ensure(!edit, "malformed source is Delete only"); await key("Escape"); continue; }
			ensure(edit, "supported source editor available"); await clickAndSettle(edit);
			const dialog = document.querySelector('[data-source-edit-modal="true"]');
			ensure(dialog?.dataset.sourceEditAdapter === "trakt-list", "registered editor");
			const field = dialog.querySelector("#source-edit-title-input");
			ensure(dialog.querySelectorAll("input,select,textarea").length === 11 && field, "name plus eight sort and two direction choices");
			ensure(dialog.querySelector('[data-action="preview-source-edit"]') && !dialog.querySelector("a"), "shared Preview action and no external link");
			ensure(dialog.textContent.includes(index ? "Date added · Descending" : "List order · Ascending"), "fixed sorting context");
			ensure(dialog.textContent.includes(index ? "Trakt · List 123 · Series" : `Trakt · List ${Number.MAX_SAFE_INTEGER} · Movies`), "fixed List/media context");
			ensure(document.querySelector('[data-source-edit-open="true"] [inert]'), "workspace inert");
			ensure(getComputedStyle(document.body).overflow === "hidden", "body locked");
			const bounds = dialog.getBoundingClientRect();
			ensure(bounds.left >= -1 && bounds.right <= innerWidth + 1 && bounds.top >= -1 && bounds.bottom <= innerHeight + 1, "dialog within viewport");
			ensure(dialog.scrollWidth <= dialog.clientWidth + 1, "dialog horizontal overflow");
			const scrollers = [dialog, ...dialog.querySelectorAll("*")].filter((element) => ["auto", "scroll"].includes(getComputedStyle(element).overflowY) && element.scrollHeight > element.clientHeight + 1);
			ensure(scrollers.length <= 1, "one scroll owner");
			const save = dialog.querySelector('[data-action="save-source-edit"]');
			const saveBounds = save.getBoundingClientRect();
			ensure(saveBounds.top >= 0 && saveBounds.bottom <= innerHeight + 1 && saveBounds.height >= 44, "Save reachable tap target");
			const revision = controller.getState().revision;
			await screenshot(index ? "series-editor" : "movie-editor");
			if (index === 0) {
				await clickAndSettle(save);
				ensure(!document.querySelector('[data-source-edit-modal="true"]') && controller.getState().revision === revision && snapshot() === initial, "no-op save");
			} else {
				await act(async () => { setInputValue(field, " "); }); await clickAndSettle(save);
				ensure(field.getAttribute("aria-invalid") === "true" && document.activeElement === field, "invalid-name focus");
				ensure(field.labels[0].textContent === "Source name" && field.getAttribute("aria-describedby"), "label and error associations");
				ensure(controller.getState().revision === revision, "invalid save preserves state");
				await act(async () => { setInputValue(field, "Renamed Series source"); }); await clickAndSettle(save);
				const expected = JSON.parse(initial); expected[0].folders[0].sources[1].title = "Renamed Series source";
				ensure(snapshot() === JSON.stringify(expected), `title-only serialized change: ${snapshot()}`);
				ensure(projectChanges === 1, "one project-content change; card selection has independent state");
			}
			ensure(document.activeElement === cards()[index], "saved Source-card focus");
		}
		const beforeCancel = snapshot();
		await clickAndSettle(host.querySelector('[data-action="open-source-actions"]'));
		await clickAndSettle(document.querySelector('[data-actions-menu="source"]:not([hidden]) [data-action="edit-source"]'));
		const dialog = document.querySelector('[data-source-edit-modal="true"]');
		const cancel = dialog.querySelector('[data-action="cancel-source-edit"]'); cancel.focus({ preventScroll: true });
		await key("Tab"); ensure(dialog.contains(document.activeElement), "native Tab trapped");
		await key("Escape"); ensure(!document.querySelector('[data-source-edit-modal="true"]') && snapshot() === beforeCancel, "native Escape cancels");
		ensure(document.activeElement === host.querySelector('[data-action="open-source-actions"]'), "cancel restores original menu trigger");
		ensure(requests.length === 0, `zero requests (${requests.length})`);
		return { width: innerWidth, height: innerHeight, forcedColors: Boolean(view.forcedColors), requests: requests.length, verified: true };
	} finally {
		await act(async () => root.unmount()); unsubscribe(); host.remove(); window.fetch = originalFetch;
	}
}
