import { useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { createBuilderController } from "../../builder/src/application/controller.js";
import { BuilderWorkspace } from "../../builder/src/ui/BuilderWorkspace.jsx";
import { stringifyNuvioProject } from "../../builder/src/serialize/index.js";
import { EXPORT_SUCCESS_TIMEOUT_MS } from "../../builder/src/ui/export-collections.js";
import "../../builder/src/styles.css";

const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
const act = async (task) => { await task(); await frame(); };
const assert = (value, message) => { if (!value) throw new Error(message); };
const $ = (selector) => document.querySelector(selector);
const visible = (selector) => [...document.querySelectorAll(selector)].filter((element) => element.getClientRects().length);
const modal = () => $("[data-export-collections]");
let root; let controller; let requests = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = (...args) => { requests.push(String(args[0])); return originalFetch(...args); };
function Workspace() {
	const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
	return <BuilderWorkspace controller={controller} state={state} />;
}
// Local imported project structures; no external-service responses are fabricated.
const source = () => ({ provider: "tmdb", title: "Action", tmdbSourceType: "DISCOVER", mediaType: "MOVIE", sortBy: "popularity.desc", filters: { withGenres: "28" } });
function profile({ large = false } = {}) {
	return Array.from({ length: large ? 24 : 2 }, (_, c) => ({
		id: `c-${c}`, title: `Collection ${c + 1}`,
		folders: Array.from({ length: large ? 25 : 2 }, (_, f) => ({
			id: `f-${c}-${f}`, title: `Folder ${f + 1}`,
			sources: [source(), { provider: "community", title: "Preserved source", custom: { keep: true } }],
		})),
	}));
}
async function click(element) {
	assert(element, "Missing click target");
	await act(async () => { element.focus({ preventScroll: true }); element.click(); await frame(); });
}
async function input(element, value) {
	assert(element, "Missing input target");
	await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(element, value); element.dispatchEvent(new Event("input", { bubbles: true })); await frame(); });
}
async function mount(value, { exportWarnings } = {}) {
	if (root) await act(() => root.unmount());
	controller = createBuilderController();
	assert(controller.importValue(value).ok, "Import succeeds");
	if (exportWarnings) {
		// Local diagnostic presentation boundary only; no external response is replaced.
		const stringify = controller.stringifyProject;
		controller = { ...controller, stringifyProject: (options) => ({ ...stringify(options), warnings: exportWarnings }) };
	}
	const project = controller.getState().project;
	const selected = project.collections[0]?.folders[0] ?? project.collections[0];
	if (selected) controller.selectNode(selected.internalId);
	requests = [];
	root = createRoot($("#root"));
	await act(() => { root.render(<Workspace />); });
	return project;
}
function counts() { return Object.fromEntries([...document.querySelectorAll("[data-export-count]")].map((element) => [element.dataset.exportCount, Number(element.textContent)])); }
function assertCountsMatchJson(json) {
	const value = JSON.parse(json); const displayed = counts();
	assert(displayed.collections === value.length, "Collection count equals output");
	assert(displayed.folders === value.reduce((sum, c) => sum + c.folders.length, 0), "Folder count equals output");
	assert(displayed.sources === value.reduce((sum, c) => sum + c.folders.reduce((n, f) => n + f.sources.length, 0), 0), "Source count equals output, including preserved sources");
}
window.runExportScenario = async () => {
	for (const value of [[], [{ id: "c", title: "Empty", folders: [] }], [{ id: "c", title: "Collection", folders: [{ id: "f", title: "Empty", sources: [] }] }]]) {
		await mount(value); assert(!$("[data-action=open-export-collections]"), "No action for a skeletal draft");
	}
	const clean = profile(); clean.forEach((collection) => collection.folders.forEach((folder) => { folder.sources = [source()]; }));
	await mount(clean); await click($("[data-action=open-export-collections]"));
	assert($(".export-collections-summary h3").textContent === "Ready to export" && !$(".export-diagnostics.warnings"), "Warning-free ready status");
	const project = await mount(profile()); const selection = JSON.stringify(controller.getState().selection);
	const entry = $("[data-action=open-export-collections]");
	assert(entry.textContent === "Export collections", "Exact entry name");
	const navRects = [...$(".workspace-header-navigation").querySelectorAll("button")].map((button) => button.getBoundingClientRect());
	assert(Math.abs(navRects[0].top - navRects[1].top) < 2, "Back/help remain on first row");
	assert(entry.getBoundingClientRect().top >= Math.max(...navRects.map((rect) => rect.bottom)), "Export occupies second row");
	assert(navRects.every((rect) => rect.right <= innerWidth), "Header controls contained");
	await click(entry);
	assert(modal().querySelector("h2").textContent === "Export collections", "Exact modal title");
	assert($(".export-collections-summary h3").textContent === "Ready to export with warnings", "Warning-only ready status");
	assert(visible('[aria-modal="true"]').length === 1 && $(".workspace-underlay").inert, "One modal with inert Builder");
	assert(document.body.style.position === "fixed", "Body locked");
	assert(document.activeElement === $(".export-collections-header button"), "Initial Close focus");
	const rect = modal().getBoundingClientRect();
	assert(rect.width <= 661 && rect.left >= 9 && rect.right <= innerWidth - 9 && rect.top > 0 && rect.bottom <= innerHeight, "Compact centred responsive modal");
	assert(rect.height < innerHeight - 50, "Ready modal sizes to content");
	assert(!modal().querySelector('[role=tab], img, video') && !/Back to Workspace|Draft layout preview/.test(modal().textContent), "No removed simulator UI");
	assert($(".export-diagnostics.warnings") && !$(".export-diagnostics.warnings").open, "Warnings initially collapsed");
	assert(!$(".export-warning-group"), "Collapsed warnings do not render repeated contents");
	await click($(".export-diagnostics.warnings summary"));
	assert($(".export-diagnostics.warnings").open, "Warnings expand");
	assert(modal().querySelectorAll(".export-warning-group").length === 1, "Same structured reason forms one group");
	assert($(".export-warning-group").textContent.includes("4 affected Sources") && $(".export-warning-group h4").textContent === "Some Sources can’t be edited in the Builder", "Grouped plain-language cause and accurate Source count");
	assert($(".export-warning-group").textContent.includes("They will still be included unchanged in the exported file."), "Exact plural preservation explanation");
	assert(!$(".export-warning-location"), "Affected locations are lazy");
	await click($(".export-warning-group button"));
	assert($(".export-warning-group button").getAttribute("aria-expanded") === "true" && modal().querySelectorAll(".export-warning-location").length === 4, "Locations group by Collection and Folder");
	assert(!/OPAQUE_SOURCE_PRESERVED|AMBIGUOUS_SOURCE_PRESERVED_OPAQUE|UNMATCHED_CATALOG_SOURCE_REMOVED/.test(modal().textContent), "Internal codes hidden");
	const owners = [modal(), ...modal().querySelectorAll("*")].filter((element) => element.getClientRects().length && ["auto", "scroll"].includes(getComputedStyle(element).overflowY) && element.scrollHeight > element.clientHeight + 1);
	assert(owners.length <= 1 && (!owners.length || owners[0] === $(".export-collections-content")), "Only export details can scroll vertically");
	await click($(".export-diagnostics.warnings summary"));
	const instructions = $(".export-import-instructions button");
	assert(instructions.textContent === "How to import into Nuvio" && instructions.getAttribute("aria-expanded") === "false", "Import disclosure initially collapsed");
	assert(document.getElementById(instructions.getAttribute("aria-controls")).hidden, "Disclosure controls hidden instructions");
	await click(instructions);
	assert(instructions.getAttribute("aria-expanded") === "true" && document.activeElement === instructions, "Import disclosure retains focus and expands");
	assert($(".export-import-guide h4").textContent === "Import into Nuvio" && $(".export-import-guide .export-muted").textContent === "Nuvio is currently in beta, so these import steps may change.", "Exact import heading and beta note");
	const web = $('.export-import-section[aria-label="Web login"]');
	const tv = $('.export-import-section[aria-label="TV app"]');
	assert([...web.querySelectorAll("li")].map((item) => item.textContent).join("|") === [
		"Go to Nuvio.tv and log in.", "Select the profile you want to update.", "Open Account.", "Open Collections.", "Choose Import.", "Select the downloaded JSON file.", "Choose Add as new, Merge, or Overwrite.", "Choose Add collections.",
	].join("|"), "Exact Web login steps");
	assert([...tv.querySelectorAll("li")].map((item) => item.textContent).join("|") === [
		"Open Nuvio and choose a profile.", "Go to Settings → Content & Discovery → Addons.", "Open Collections.", "Choose Import.", "Choose From File or From URL.", "For From File, select the downloaded JSON file from Downloads, then confirm the import.", "For From URL, enter the direct URL of a JSON file, fetch it, then confirm the import.",
	].join("|"), "Exact TV app steps");
	assert($(".export-import-clarification").textContent === "Dingo provides a downloaded JSON file. It does not currently create a hosted URL.", "Hosted URL clarification");
	assert($(".export-import-enrichment").textContent === "To help Nuvio add artwork and title details, go to Settings → Integrations → TMDB and turn on Enable TMDB Enrichment. A TMDB API key may be required. Follow the official TMDB API guide to request one.", "Exact TMDB enrichment callout");
	const links = [...$(".export-import-guide").querySelectorAll("a")];
	assert(links.map((link) => link.href).join("|") === "https://nuvio.tv/|https://developer.themoviedb.org/docs/getting-started", "Exact external destinations");
	assert(links[0].textContent === "Nuvio.tv" && links[1].textContent === "official TMDB API guide", "Meaningful link text");
	assert(links.every((link) => link.target === "_blank" && link.relList.contains("noopener") && link.relList.contains("noreferrer") && link.getAttribute("aria-label") === `${link.textContent} (opens in a new tab)` && getComputedStyle(link).textDecorationLine.includes("underline")), "Accessible external links retain the Builder tab");
	assert(visible('[aria-modal="true"]').length === 1, "Instructions stay inside the existing modal");
	const webRect = web.getBoundingClientRect(); const tvRect = tv.getBoundingClientRect();
	assert(tvRect.top >= webRect.bottom && Math.abs(webRect.left - tvRect.left) < 1 && Math.abs(webRect.width - tvRect.width) < 1, "Web and TV sections stack at every width");
	const expandedRect = modal().getBoundingClientRect(); const content = $(".export-collections-content");
	assert(expandedRect.top >= 0 && expandedRect.bottom <= innerHeight && content.scrollHeight > content.clientHeight, "Expanded instructions stay in the viewport with scrolling details");
	const pinnedTop = $(".export-collections-summary").getBoundingClientRect().top; const pinnedBottom = $(".export-collections-footer").getBoundingClientRect().bottom;
	await act(() => { content.scrollTop = content.scrollHeight; });
	assert($(".export-collections-summary").getBoundingClientRect().top === pinnedTop && $(".export-collections-footer").getBoundingClientRect().bottom === pinnedBottom && pinnedBottom <= innerHeight, "Instruction scrolling keeps summary and actions pinned");
	assert($(".export-import-enrichment").getBoundingClientRect().bottom <= content.getBoundingClientRect().bottom + 1, "Final callout is reachable through details scrolling");
	assert(!$("#root [data-action=download-collections-json]"), "Modal uses existing portal pattern");
	const actions = [...$(".export-collections-actions").querySelectorAll("button")];
	assert(actions.map((button) => button.textContent).join("|") === "Download JSON|Copy JSON", "Primary Download, secondary Copy");
	assert(actions.every((button) => !button.disabled), "Warnings leave both actions enabled");
	let copied; let blob; let filename;
	Object.defineProperty(navigator, "clipboard", { configurable: true, value: { async writeText(value) { copied = value; } } });
	await click(actions[1]);
	assert($(".export-feedback").textContent === "JSON copied." && $(".export-feedback").getAttribute("role") === "status", "Copy success announced");
	assert(copied === stringifyNuvioProject(project).json, "Exact serializer bytes");
	assertCountsMatchJson(copied);
	const originalURL = URL.createObjectURL;
	URL.createObjectURL = (value) => { blob = value; return originalURL(value); };
	const preventDownload = (event) => { if (event.target instanceof HTMLAnchorElement && event.target.download) { filename = event.target.download; event.preventDefault(); } };
	document.addEventListener("click", preventDownload, true);
	await click(actions[0]);
	assert($(".export-feedback").textContent === "Download started.", "Exact download feedback");
	URL.createObjectURL = originalURL; document.removeEventListener("click", preventDownload, true);
	assert(await blob.text() === copied, "Copy and Download byte identity");
	assert(filename === $(".export-filename").textContent && /^dingo-nuvio-collections-\d{4}-\d{2}-\d{2}\.json$/.test(filename), "Displayed filename exactly matches Download");
	Object.defineProperty(navigator, "clipboard", { configurable: true, value: { async writeText() { throw new Error("permission denied"); } } });
	await click(actions[1]);
	assert($(".export-feedback").getAttribute("role") === "alert" && $(".export-feedback").textContent.includes("Copy failed"), "Clipboard failure announced");
	assert(!actions[0].disabled, "Download remains available");
	assert(controller.getState().project === project, "Export does not mutate project");
	assert(requests.length === 0 && !modal().querySelector("img"), "Export has no artwork or data requests");
	const overflow = document.documentElement.scrollWidth > innerWidth + 1 || modal().scrollWidth > modal().clientWidth + 1;
	assert(!overflow, "No document/modal horizontal overflow");
	await click($(".export-collections-header button"));
	assert(!modal() && document.activeElement === entry && document.body.style.position !== "fixed", "Close releases lock and restores entry focus");
	assert(JSON.stringify(controller.getState().selection) === selection, "Builder selection retained");
	await click(entry);
	assert($(".export-feedback").textContent === "" && $(".export-import-instructions button").getAttribute("aria-expanded") === "false", "Reopening resets feedback and instructions");
	await click($(".export-collections-header button"));
	return { width: innerWidth, passed: true, requests: requests.length, overflow };
};
window.runExportEditorCases = async () => {
	const invalid = profile(); invalid[0].title = ""; invalid[0].folders[0].title = "";
	await mount(invalid); await click($("[data-action=open-export-collections]"));
	assert($(".export-collections-summary h3").textContent === "2 problems to fix before exporting", "Plural blocking status");
	assert([...$(".export-collections-actions").querySelectorAll("button")].every((button) => button.disabled), "Blocking errors prevent both deliveries");
	const project = controller.getState().project;
	for (const kind of ["collection", "folder"]) {
		const trigger = $(`[data-export-edit=${kind}]`); const before = controller.getState().project;
		await click(trigger);
		assert(!modal().getClientRects().length && visible('[aria-modal="true"]').length === 1, "Export suspended for editor");
		await input($("[data-editor-field=title]"), "Cancelled");
		await click($("[data-action=cancel-node-edit]"));
		assert(controller.getState().project === before && document.activeElement === trigger, "Cancel leaves draft and returns focus");
		await click(trigger); await input($("[data-editor-field=title]"), `Repaired ${kind}`);
		await click($("[data-action=apply-node-edit]"));
		assert(!$(`[data-export-edit=${kind}]`), "Saved title refreshes validation");
		assert(document.activeElement === $(".export-collections-summary h3"), "Removed diagnostic returns focus to status");
		if (kind === "collection") assert($(".export-collections-summary h3").textContent === "1 problem to fix before exporting", "Singular blocking status");
	}
	assert($(".export-collections-summary h3").textContent === "Ready to export with warnings", "Repairs return warning-only ready state");
	assertCountsMatchJson(controller.stringifyProject().json);
	// Exercise authoritative count changes while the existing diagnostic editor is suspended.
	await act(() => controller.updateNode(project.collections[0].internalId, { title: "" }));
	await click($("[data-export-edit=collection]"));
	await act(() => controller.removeNode(project.collections[1].internalId));
	await input($("[data-editor-field=title]"), "Collection repaired");
	await click($("[data-action=apply-node-edit]"));
	assert(counts().collections === 1 && counts().folders === 2 && counts().sources === 4, "Return derives fresh counts from current output");
	assertCountsMatchJson(controller.stringifyProject().json);
	// A supported editor may inspect a preserved invalid field it cannot repair;
	// saving a name must not falsely clear that serializer error.
	const sourceInvalid = [{ id: "c", title: "Collection", folders: [{ id: "f", title: "Folder", sources: [{ provider: "tmdb", title: "Franchise", tmdbSourceType: "COLLECTION", mediaType: "MOVIE", tmdbId: 10, filters: null }] }] }];
	await mount(sourceInvalid); await click($("[data-action=open-export-collections]"));
	const trigger = $("[data-export-edit=source]"); const beforeSource = controller.getState().project;
	await click(trigger);
	assert($("[data-source-edit-modal]") && !modal().getClientRects().length, "Supported Source uses existing editor");
	assert(!$("[data-action=preview-source-edit]"), "Diagnostic editor does not offer live requests");
	await input($("[data-source-edit-field=title]"), "Cancelled source"); await click($("[data-action=cancel-source-edit]"));
	assert(controller.getState().project === beforeSource && document.activeElement === trigger, "Source Cancel preserves project/focus");
	await click(trigger); await input($("[data-source-edit-field=title]"), "Saved source"); await click($("[data-action=save-source-edit]"));
	assert($(".export-diagnostics.errors").textContent.includes("Saved source"), "Source Save refreshes diagnostic context");
	assert($("[data-action=download-collections-json]").disabled, "Unrepairable preserved error stays blocked");
	assert($(".export-diagnostics.errors").textContent.includes("delete this Source in the Builder"), "Unrepairable imported field has a real removal path");
	await mount([{ id: "c", title: "Collection", folders: [{ id: "f", title: "Folder", sources: [{ provider: "addon", title: "Incomplete addon" }] }] }]);
	await click($("[data-action=open-export-collections]"));
	assert(!$("[data-export-edit=source]") && $(".export-diagnostics.errors").textContent.includes("This item cannot be repaired here. Close Export collections and delete this Source"), "Unsupported blocking Source has truthful guidance without changing editor eligibility");
	assert([...$(".export-collections-actions").querySelectorAll("button")].every((button) => button.disabled), "Unrepairable Source blocks both actions");
	assert(requests.length === 0, "Diagnostic editing adds no data requests");
	return { passed: true, requests: requests.length };
};
window.runExportLargeCase = async () => {
	await mount(profile({ large: true })); const start = performance.now();
	await click($("[data-action=open-export-collections]"));
	const elapsedMs = Math.round(performance.now() - start);
	assert(counts().collections === 24 && counts().folders === 600 && counts().sources === 1200, "Large totals");
	assertCountsMatchJson(controller.stringifyProject().json);
	assert(!$(".export-diagnostics.warnings").open && modal().querySelectorAll("img").length === 0, "Large warnings collapsed without artwork");
	assert(!$(".export-warning-group") && !$(".export-warning-location"), "Large closed warning set does not render repeated items");
	await click($(".export-diagnostics.warnings summary"));
	assert(modal().querySelectorAll(".export-warning-group").length === 1 && !$(".export-warning-location"), "600 warnings expand to one summary, with locations still deferred");
	assert($(".export-warning-group").textContent.includes("600 affected Sources"), "Large distinct Source count");
	await click($(".export-warning-group button"));
	assert(modal().querySelectorAll(".export-warning-location li").length === 600, "All affected Sources remain reachable");
	const owners = [modal(), ...modal().querySelectorAll("*")].filter((element) => element.getClientRects().length && ["auto", "scroll"].includes(getComputedStyle(element).overflowY) && element.scrollHeight > element.clientHeight + 1);
	assert(owners.length === 1 && owners[0] === $(".export-collections-content"), "Large expanded locations keep one scroll owner");
	assert($(".export-collections-footer").getBoundingClientRect().bottom <= innerHeight && modal().scrollWidth <= modal().clientWidth + 1, "Large warning details retain actions without horizontal overflow");
	assert(elapsedMs < 5000 && requests.length === 0, "Large export opens within bounded local budget without data requests");
	return { passed: true, elapsedMs, counts: counts(), requests: requests.length };
};

window.runExportWarningCases = async () => {
	const value = [{ id: "c", title: "Imported Collection", folders: [{ id: "f", title: "Imported Folder", sources: [{ title: "Imported Source", addonName: "Community" }], catalogSources: [{ addonId: "old", type: "movie", catalogId: "old" }] }] }];
	await mount(value); await click($("[data-action=open-export-collections]"));
	await click($(".export-diagnostics.warnings summary"));
	const groups = [...modal().querySelectorAll(".export-warning-group")];
	assert(groups.length === 2 && groups[0].textContent.includes("1 affected Source") && groups[0].querySelector("h4").textContent === "This Source can’t be edited in the Builder" && groups[0].textContent.includes("It will still be included unchanged in the exported file."), "Exact singular preservation copy");
	assert(groups[1].textContent.includes("1 warning") && groups[1].querySelector("h4").textContent === "Some saved addon details are no longer used" && groups[1].textContent.includes("These unused details won’t be exported. Your current Sources are unaffected."), "Exact saved addon details copy with warning count");
	assert(!/AMBIGUOUS_SOURCE_PRESERVED_OPAQUE|OPAQUE_SOURCE_PRESERVED|UNMATCHED_CATALOG_SOURCE_REMOVED/.test(modal().textContent), "Actual warning codes stay internal");
	assert([...$(".export-collections-actions").querySelectorAll("button")].every((button) => !button.disabled), "Both real warning types permit export");
	await click(groups[1].querySelector("button"));
	assert(groups[1].textContent.includes("Imported Collection → Imported Folder") && groups[1].textContent.includes("Saved addon details 1"), "Saved addon details location stays reachable without a false Source count");
	await mount(value, { exportWarnings: [{ code: "FUTURE_WARNING_INTERNAL", path: "$", message: "INTERNAL_IMPLEMENTATION_DETAIL" }] });
	await click($("[data-action=open-export-collections]")); await click($(".export-diagnostics.warnings summary"));
	assert($(".export-warning-group h4").textContent === "Some information will be preserved unchanged" && $(".export-warning-group").textContent.includes("Dingo does not fully recognise this information, so it will be kept unchanged in the exported file.") && !/FUTURE_WARNING_INTERNAL|INTERNAL_IMPLEMENTATION_DETAIL/.test(modal().textContent), "Unknown warning renders exact fallback without internal code/message");
	assert(requests.length === 0, "Warning disclosures make no external requests");
	return { passed: true, requests: requests.length };
};

// Control only the feedback timeout; browser frames and delivery cleanup retain
// their normal scheduling. No assertion waits four seconds of wall-clock time.
function feedbackClock() {
	const originalSet = globalThis.setTimeout; const originalClear = globalThis.clearTimeout;
	let now = 0; let nextId = 0; const timers = new Map();
	globalThis.setTimeout = (callback, delay, ...args) => {
		if (delay !== EXPORT_SUCCESS_TIMEOUT_MS) return originalSet(callback, delay, ...args);
		const id = --nextId; timers.set(id, { at: now + delay, callback: () => callback(...args) }); return id;
	};
	globalThis.clearTimeout = (id) => { if (timers.has(id)) timers.delete(id); else originalClear(id); };
	return {
		async advance(milliseconds) { await act(() => { now += milliseconds; for (const [id, timer] of timers) if (timer.at <= now) { timers.delete(id); timer.callback(); } }); },
		get pending() { return timers.size; },
		restore() { globalThis.setTimeout = originalSet; globalThis.clearTimeout = originalClear; },
	};
}
window.runExportFeedbackCases = async () => {
	const clock = feedbackClock(); const originalURL = URL.createObjectURL;
	const preventDownload = (event) => { if (event.target instanceof HTMLAnchorElement && event.target.download) event.preventDefault(); };
	document.addEventListener("click", preventDownload, true);
	const message = () => $(".export-feedback").textContent;
	const copy = () => click($("[data-action=copy-collections-json]"));
	const download = () => click($("[data-action=download-collections-json]"));
	try {
		assert(EXPORT_SUCCESS_TIMEOUT_MS === 4000, "Configured four-second timeout");
		const project = await mount(profile()); await click($("[data-action=open-export-collections]"));
		Object.defineProperty(navigator, "clipboard", { configurable: true, value: { async writeText() {} } });
		await copy(); await clock.advance(3999);
		assert(message() === "JSON copied." && $(".export-feedback").getAttribute("aria-live") === "polite", "Copy stays politely announced until timeout");
		await clock.advance(1); assert(message() === "" && clock.pending === 0, "Copy clears at four seconds");
		await download(); await clock.advance(3999); assert(message() === "Download started.", "Download stays until timeout");
		await clock.advance(1); assert(message() === "", "Download clears at four seconds");
		await copy(); await clock.advance(3000); await copy(); await clock.advance(1000);
		assert(message() === "JSON copied." && clock.pending === 1, "Same action replaces and restarts one timer");
		await clock.advance(2999); assert(message() === "JSON copied.", "Repeated copy keeps its full timeout");
		await clock.advance(1); assert(message() === "", "Repeated copy expires");
		await copy(); await clock.advance(3000); await download(); await clock.advance(1000);
		assert(message() === "Download started." && clock.pending === 1, "Different action replaces feedback and timer");
		await clock.advance(3000); assert(message() === "", "Replacement download expires");
		await download(); await clock.advance(3000); await download(); await clock.advance(1000);
		assert(message() === "Download started.", "Repeated download restarts timer");
		Object.defineProperty(navigator, "clipboard", { configurable: true, value: { async writeText() { throw new Error("denied"); } } });
		await copy(); await clock.advance(100000);
		assert(message().startsWith("Copy failed.") && clock.pending === 0 && $(".export-feedback").getAttribute("role") === "alert", "Clipboard failure remains actionable without a success timer");
		URL.createObjectURL = () => { throw new Error("Download unavailable"); };
		await download(); await clock.advance(100000);
		assert(message() === "The download could not start. Try again or use Copy JSON." && clock.pending === 0, "Download failure remains actionable");
		URL.createObjectURL = originalURL;
		Object.defineProperty(navigator, "clipboard", { configurable: true, value: { async writeText() {} } });
		await copy(); assert(message() === "JSON copied.", "Retry replaces failure");
		await click($(".export-import-instructions button"));
		await click($(".export-collections-header button"));
		assert(clock.pending === 0, "Unmount cleans success timer");
		await click($("[data-action=open-export-collections]"));
		assert(message() === "" && $(".export-import-instructions button").getAttribute("aria-expanded") === "false", "New modal has no stale feedback or disclosure");
		await copy();
		await act(() => controller.updateNode(project.collections[0].internalId, { title: "" }));
		await click($("[data-export-edit=collection]"));
		await clock.advance(4000); await click($("[data-action=cancel-node-edit]"));
		assert(message() === "" && clock.pending === 0, "Expired success does not return after editor suspension");
		await act(() => controller.updateNode(project.collections[0].internalId, { title: "Collection 1" }));
		let resolveCopy;
		Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText() { return new Promise((resolve) => { resolveCopy = resolve; }); } } });
		await copy(); await download(); await act(() => resolveCopy());
		assert(message() === "Download started.", "Older clipboard completion cannot replace newer action feedback");
		await copy(); await click($(".export-collections-header button"));
		await click($("[data-action=open-export-collections]")); await act(() => resolveCopy());
		assert(message() === "" && clock.pending === 0, "Late clipboard completion cannot revive an unmounted session");
		assert(requests.length === 0, "Feedback and instructions make no data requests");
		return { passed: true, timeoutMs: EXPORT_SUCCESS_TIMEOUT_MS, requests: requests.length };
	} finally {
		URL.createObjectURL = originalURL; document.removeEventListener("click", preventDownload, true); clock.restore();
	}
};
window.prepareExportCase = async () => { await mount(profile()); await click($("[data-action=open-export-collections]")); return true; };
window.prepareExportScreenshot = async (state) => {
	await window.prepareExportCase();
	if (state === "workspace") await click($(".export-collections-header button"));
	if (state === "errors") { const p = controller.getState().project; await act(() => controller.updateNode(p.collections[0].internalId, { title: "" })); }
	if (state === "warnings") await click($(".export-diagnostics.warnings summary"));
	if (state === "instructions" || state === "instructions-end") await click($(".export-import-instructions button"));
	if (state === "instructions-end") await act(() => { const details = $(".export-collections-content"); details.scrollTop = details.scrollHeight; });
	await frame();
};
window.exportFixtureReady = true;
