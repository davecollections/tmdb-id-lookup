import { createRoot } from "react-dom/client";
import { createBuilderController } from "../../builder/src/application/controller.js";
import { BuilderApp } from "../../builder/src/ui/BuilderApp.jsx";
import { stringifyNuvioProject } from "../../builder/src/serialize/index.js";
import { EXPORT_SUCCESS_TIMEOUT_MS } from "../../builder/src/ui/export-collections.js";
import "../../builder/src/styles.css";

const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
const act = async (task) => { await task(); await frame(); };
const assert = (value, message) => { if (!value) throw new Error(message); };
const $ = (selector) => document.querySelector(selector);
const visible = (selector) => [...document.querySelectorAll(selector)].filter((element) => element.getClientRects().length);
const modal = () => $("[data-export-collections]");
let root; let controller; let requests = []; let welcome = false; let preparations = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = (...args) => { requests.push(String(args[0])); return originalFetch(...args); };
function Workspace() {
	return <BuilderApp controller={controller} initialScreen={welcome ? "welcome" : "workspace"} />;
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
async function mount(value, { exportWarnings, fromWelcome = false } = {}) {
	if (root) await act(() => root.unmount());
	controller = createBuilderController();
	welcome = fromWelcome; preparations = 0;
	if (!welcome) assert(controller.importValue(value).ok, "Import succeeds");
	const prepare = controller.stringifyProject;
	controller = { ...controller, stringifyProject: (options) => { preparations++; return prepare(options); } };
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
	assert(entry.textContent === "Export & Send", "Exact entry name");
	const navRects = [...$(".workspace-header-navigation").querySelectorAll("button")].map((button) => button.getBoundingClientRect());
	assert(Math.abs(navRects[0].top - navRects[1].top) < 2, "Back/help remain on first row");
	assert(entry.getBoundingClientRect().top >= Math.max(...navRects.map((rect) => rect.bottom)), "Export occupies second row");
	assert(navRects.every((rect) => rect.right <= innerWidth), "Header controls contained");
	await click(entry);
	assert(modal().querySelector("h2").textContent === "Export & Send", "Exact modal title");
	assert($(".export-collections-summary h3").textContent === "Ready to export", "Non-blocking warnings do not qualify the ready status");
	assert(visible('[aria-modal="true"]').length === 1 && $(".workspace-underlay").inert, "One modal with inert Builder");
	assert(document.body.style.position === "fixed", "Body locked");
	assert(document.activeElement === $(".export-collections-header button"), "Initial Close focus");
	const rect = modal().getBoundingClientRect();
	assert(rect.width <= 661 && rect.left >= 9 && rect.right <= innerWidth - 9 && rect.top > 0 && rect.bottom <= innerHeight, "Compact centred responsive modal");
	assert(rect.height < innerHeight - 50, "Ready modal sizes to content");
	assert(!modal().querySelector('[role=tab], img, video') && !/Back to Workspace|Draft layout preview/.test(modal().textContent), "No removed simulator UI");
	assert(!modal().querySelector(".export-diagnostics.warnings, .export-warning-group, .export-warning-location") && !/preservation warning|affected Sources|can’t be edited/.test(modal().textContent), "Export omits non-blocking warning panel, counts and prose");
	assert(controller.stringifyProject().warnings.length === 4 && controller.getState().diagnostics.export.warnings.length === 4, "Underlying preservation and project diagnostics remain available");
	assert(!/OPAQUE_SOURCE_PRESERVED|AMBIGUOUS_SOURCE_PRESERVED_OPAQUE|UNMATCHED_CATALOG_SOURCE_REMOVED/.test(modal().textContent), "Internal codes hidden");
	const owners = [modal(), ...modal().querySelectorAll("*")].filter((element) => element.getClientRects().length && ["auto", "scroll"].includes(getComputedStyle(element).overflowY) && element.scrollHeight > element.clientHeight + 1);
	assert(owners.length <= 1 && (!owners.length || owners[0] === $(".export-collections-content")), "Only export details can scroll vertically");
	await exerciseGuide("export");
	assert(!$("#root [data-action=download-collections-json]"), "Modal uses existing portal pattern");
	const actions = [...$(".export-collections-actions").querySelectorAll('button:not([data-action="send-to-nuvio"])')];
	assert(actions.map((button) => button.querySelector("strong").textContent).join("|") === "Download JSON|Copy JSON", "Manual Download and Copy retained");
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
	assert($(".export-feedback").textContent === "" && !$(".nuvio-guide-content") && $("[data-action=open-import-guide]"), "Reopening resets feedback and guide view");
	await click($(".export-collections-header button"));
	return { width: innerWidth, passed: true, requests: requests.length, overflow };
};
window.runExportEditorCases = async () => {
	const invalid = profile(); invalid[0].title = ""; invalid[0].folders[0].title = "";
	await mount(invalid); await click($("[data-action=open-export-collections]"));
	assert($(".export-collections-summary h3").textContent === "2 problems to fix before exporting", "Plural blocking status");
	assert([...$(".export-collections-actions").querySelectorAll("button")].every((button) => button.disabled), "Blocking errors prevent both deliveries");
	await exerciseGuide("export");
	assert([...$(".export-collections-actions").querySelectorAll("button")].every((button) => button.disabled), "Guide return retains blocking validation");
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
	assert($(".export-collections-summary h3").textContent === "Ready to export" && controller.stringifyProject().warnings.length > 0, "Repairs restore ready state while preserving underlying warnings");
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
	assert(!$("[data-export-edit=source]") && $(".export-diagnostics.errors").textContent.includes("This item cannot be repaired here. Close Export & Send and delete this Source"), "Unsupported blocking Source has truthful guidance without changing editor eligibility");
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
	assert(!modal().querySelector(".export-diagnostics.warnings, .export-warning-group, .export-warning-location, img"), "Large projects render no preservation warning panel or artwork");
	assert(controller.stringifyProject().warnings.length === 600, "All 600 preservation diagnostics remain in the underlying result");
	const owners = [modal(), ...modal().querySelectorAll("*")].filter((element) => element.getClientRects().length && ["auto", "scroll"].includes(getComputedStyle(element).overflowY) && element.scrollHeight > element.clientHeight + 1);
	assert(owners.length <= 1 && (!owners.length || owners[0] === $(".export-collections-content")), "Large project keeps at most one content scroll owner");
	assert($(".export-collections-footer").getBoundingClientRect().bottom <= innerHeight && modal().scrollWidth <= modal().clientWidth + 1, "Large project retains reachable actions without horizontal overflow");
	assert(elapsedMs < 5000 && requests.length === 0, "Large export opens within bounded local budget without data requests");
	return { passed: true, elapsedMs, counts: counts(), requests: requests.length };
};

window.runExportWarningCases = async () => {
	const value = [{ id: "c", title: "Imported Collection", folders: [{ id: "f", title: "Imported Folder", sources: [{ title: "Imported Source", addonName: "Community" }], catalogSources: [{ addonId: "old", type: "movie", catalogId: "old" }] }] }];
	await mount(value); await click($("[data-action=open-export-collections]"));
	const output = controller.stringifyProject();
	assert(output.warnings.some(warning => warning.code === "OPAQUE_SOURCE_PRESERVED") && output.warnings.some(warning => warning.code === "UNMATCHED_CATALOG_SOURCE_REMOVED"), "Both preservation diagnostics remain in canonical output");
	const exportedFolder = JSON.parse(output.json)[0].folders[0];
	assert(JSON.stringify(exportedFolder.sources) === JSON.stringify(value[0].folders[0].sources) && Array.isArray(exportedFolder.catalogSources) && exportedFolder.catalogSources.length === 0, "Opaque Sources remain exact and unused saved addon details retain their established removal behavior");
	assert(!modal().querySelector(".export-diagnostics.warnings, .export-warning-group") && !/preservation warning|saved addon details|affected Source/.test(modal().textContent), "Both non-blocking warning types remain absent from Export");
	assert(!/AMBIGUOUS_SOURCE_PRESERVED_OPAQUE|OPAQUE_SOURCE_PRESERVED|UNMATCHED_CATALOG_SOURCE_REMOVED/.test(modal().textContent), "Actual warning codes stay internal");
	assert([...$(".export-collections-actions").querySelectorAll("button:not([data-action=send-to-nuvio])")].every((button) => !button.disabled), "Both real warning types permit manual export");
	await mount(value, { exportWarnings: [{ code: "FUTURE_WARNING_INTERNAL", path: "$", message: "INTERNAL_IMPLEMENTATION_DETAIL" }] });
	await click($("[data-action=open-export-collections]"));
	assert(!modal().querySelector(".export-diagnostics.warnings") && !/FUTURE_WARNING_INTERNAL|INTERNAL_IMPLEMENTATION_DETAIL|preservation warning/.test(modal().textContent) && controller.stringifyProject().warnings[0].code === "FUTURE_WARNING_INTERNAL", "Future non-blocking warnings stay available to diagnostics without surfacing in Export");
	assert(requests.length === 0, "Export makes no external requests");
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
		await click($("[data-action=open-import-guide]")); await click($("[data-guide-platform=mobile]"));
		await clock.advance(100000); await guideBack(); await guideBack();
		assert(message().startsWith("Copy failed."), "Persistent clipboard failure survives guide navigation");
		URL.createObjectURL = () => { throw new Error("Download unavailable"); };
		await download(); await clock.advance(100000);
		assert(message() === "The download could not start. Try again or use Copy JSON." && clock.pending === 0, "Download failure remains actionable");
		URL.createObjectURL = originalURL;
		Object.defineProperty(navigator, "clipboard", { configurable: true, value: { async writeText() {} } });
		await copy(); assert(message() === "JSON copied.", "Retry replaces failure");
		await click($("[data-action=open-import-guide]"));
		await clock.advance(4000);
		await click($("[data-action=import-guide-back]"));
		assert(message() === "" && clock.pending === 0, "Success timer continues while reading guide");
		await copy();
		await click($("[data-action=open-import-guide]"));
		await click($("[data-action=import-guide-close]"));
		assert(clock.pending === 0, "Unmount cleans success timer");
		await click($("[data-action=open-export-collections]"));
		assert(message() === "" && !$(".nuvio-guide-content") && $("[data-action=open-import-guide]"), "New modal has no stale feedback or guide view");
		await copy();
		await act(() => controller.updateNode(project.collections[0].internalId, { title: "" }));
		await click($("[data-export-edit=collection]"));
		await clock.advance(4000); await click($("[data-action=cancel-node-edit]"));
		assert(message() === "" && clock.pending === 0, "Expired success does not return after editor suspension");
		await act(() => controller.updateNode(project.collections[0].internalId, { title: "Collection 1" }));
		let resolveCopy;
		Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText() { return new Promise((resolve) => { resolveCopy = resolve; }); } } });
		await copy(); await click($("[data-action=open-import-guide]")); await act(() => resolveCopy());
		assert(clock.pending === 1, "Pending clipboard completion keeps the same session in guide");
		await guideBack(); assert(message() === "JSON copied.", "Clipboard completion while reading is retained on return");
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
	if (state === "warnings") assert(!$(".export-diagnostics.warnings"), "Warning-bearing projects have no Export warning panel");
	if (state === "instructions" || state === "instructions-end") { await click($("[data-action=open-import-guide]")); await click($("[data-guide-platform=tv]")); }
	if (state === "instructions-end") await act(() => { const details = $(".nuvio-guide-content"); details.scrollTop = details.scrollHeight; });
	await frame();
};
window.exportFixtureReady = true;

const guideDialog = () => document.querySelector('[role="dialog"]');
const guideBack = () => click($("[data-action=import-guide-back]"));
const guidePlatforms = ["web", "tv", "mobile", "desktop"];
function checkGuideGeometry() {
	const dialog = guideDialog(); const scroller = $(".nuvio-guide-content");
	assert(dialog && scroller, "Guide is open");
	const rect = dialog.getBoundingClientRect(); const bounds = dialog.parentElement.getBoundingClientRect();
	assert(innerWidth === document.documentElement.clientWidth, "Open guide does not inflate the CSS viewport");
	assert(rect.top >= bounds.top - 1 && rect.bottom <= bounds.bottom + 1 && rect.top >= 0 && rect.bottom <= innerHeight + 1, "Guide fits available viewport");
	assert(document.documentElement.scrollWidth <= innerWidth + 1 && dialog.scrollWidth <= dialog.clientWidth + 1 && scroller.scrollWidth <= scroller.clientWidth + 1, "No horizontal clipping");
	assert(scroller.clientHeight > 40, "Visible content has usable scrolling space");
	const owners = [dialog, ...dialog.querySelectorAll("*")].filter(element => element.getClientRects().length && ["auto", "scroll"].includes(getComputedStyle(element).overflowY) && element.scrollHeight > element.clientHeight + 1);
	assert(owners.length <= 1 && (!owners.length || owners[0] === scroller), "One visible content scroll owner");
	assert([...dialog.querySelectorAll("button")].every(element => element.getBoundingClientRect().height >= 44), "Guide navigation has 44px touch targets");
	assert(document.querySelectorAll('[role="dialog"]').length === 1 && document.querySelectorAll('[aria-modal="true"]').length === 1, "One modal, no stacked host");
	const label = document.getElementById(dialog.getAttribute("aria-labelledby"));
	assert(label === dialog.querySelector("h2") && label.textContent.length, "Dialog labelled by current heading");
	return { width: innerWidth, height: innerHeight, passed: true, contentHeight: scroller.clientHeight, scrollHeight: scroller.scrollHeight };
}
function checkGuideArtwork(expectedOpen) {
	const content = $(".nuvio-guide-content"); const disclosure = content.querySelector("details");
	assert(content.dataset.importPlatform === "chooser" && content.querySelectorAll("details").length === 1, "One shared artwork disclosure on the chooser");
	assert(disclosure === content.lastElementChild && disclosure.previousElementSibling.matches(".nuvio-guide-platforms"), "Artwork help follows all four platform choices in the existing scroller");
	const summary = disclosure.querySelector("summary"); const copy = disclosure.textContent;
	assert(summary.textContent === "Missing artwork or title details?" && summary.tabIndex === 0 && summary.getBoundingClientRect().height >= 44, "Native disclosure has an accessible label and touch target");
	assert(disclosure.open === expectedOpen, expectedOpen ? "Artwork help expands" : "Artwork help is collapsed by default or explicit toggle");
	assert(copy.includes("may help Nuvio display artwork and title details") && copy.includes("In the Nuvio app") && copy.includes("Settings → Integrations → TMDB") && copy.includes("where available") && copy.includes("optional and isn't required to import Collections"), "Shared advice is optional, app-specific and qualified");
	assert(!/Nuvio.tv|API key|Source checked|Checked against|physically tested/.test(copy), "No website-settings promise, key requirement or evidence footer");
	if (!expectedOpen) assert(disclosure.getBoundingClientRect().height <= summary.getBoundingClientRect().height + 1, "Collapsed help occupies only its summary height");
	assert(requests.length === 0, "Artwork disclosure makes no service requests");
	return { open: disclosure.open, ...checkGuideGeometry() };
}
window.checkGuideArtwork = checkGuideArtwork;
function checkPlatformContent(id) {
	const content = $(".nuvio-guide-content"); const copy = content.textContent;
	assert(content.dataset.importPlatform === id, "Correct platform view");
	assert(!content.querySelector("details") && !/Missing artwork or title details|TMDB Enrichment/.test(copy), "No redundant artwork disclosure on any platform page");
	assert(!$(".export-collections-summary") && !$(".export-collections-actions") && !$(".export-filename"), "Export controls and totals do not take guide space");
	assert(content.firstElementChild.matches(".nuvio-guide-consequence") && $(".nuvio-guide-steps li"), "Consequence appears before numbered instructions");
	assert(!/Nuvio is currently in beta|A TMDB API key may be required/.test(copy), "Outdated blanket beta/key advice removed");
	assert(!content.querySelector(".nuvio-guide-note") && !/Source checked|Checked against|physically tested|tested on a physical|0\.1\.29-alpha|inspected TV setting/.test(copy), "Technical evidence stays out of end-user guide content");
	const stepItems = [...content.querySelectorAll(".nuvio-guide-steps li")].map(item => item.textContent);
	const steps = stepItems.join("|");
	if (id === "web") {
		assert(steps.includes("Choose Add as new, Merge or Overwrite.") && copy.includes("Match Collection IDs, append incoming folders") && copy.includes("does not combine folders by name") && copy.includes("Save your existing Collections first") && copy.includes("exact names"), "Distinct website modes, backup and Dingo merge distinction");
		const reference = content.querySelector(".nuvio-guide-reference");
		assert(reference?.querySelector("h3").textContent === "Import modes" && reference.querySelectorAll("dt").length === 3, "All three import modes share a reference panel");
		assert(reference.querySelector("dt").getBoundingClientRect().top - reference.querySelector("h3").getBoundingClientRect().bottom >= 8, "Reference heading stays separated from the first mode in both hosts");
		const referenceStyle = getComputedStyle(reference);
		assert(["Top", "Right", "Bottom", "Left"].every(side => referenceStyle["border" + side + "Style"] === "solid" && referenceStyle["border" + side + "Width"] === "1px"), "Reference has a subtle even border, including forced colours");
		if (!matchMedia("(forced-colors: active)").matches) assert(referenceStyle.backgroundColor !== getComputedStyle(guideDialog()).backgroundColor, "Reference background differs from main panel");
		assert(parseFloat(getComputedStyle(reference.querySelector("dd")).fontSize) < parseFloat(getComputedStyle(content).fontSize), "Reference supporting text is compact and scales with enlarged text");
		const link = content.querySelector("a");
		assert(link.href === "https://nuvio.tv/" && link.target === "_blank" && link.relList.contains("noopener") && link.relList.contains("noreferrer") && link.getAttribute("aria-label") === "Nuvio.tv (opens in a new tab)" && getComputedStyle(link).textDecorationLine.includes("underline"), "Accessible official website link");
	} else if (id === "tv") {
		assert($(".nuvio-guide-consequence p").textContent === "New Collection IDs are added. If an imported Collection has the same ID as an existing Collection, that entire Collection is replaced, including its folders and Sources.", "Exact TV replacement consequence");
		assert(steps.includes("exactly nuvio-collections.json") && steps.includes("TV device’s Downloads folder") && steps.includes("Settings → Content & Discovery → Addons → Collections → Import") && steps.includes("From File → Load File"), "TV exact filename and actual file-loading route");
		assert(copy.includes("direct URL of a hosted JSON file") && copy.includes("Dingo does not generate a hosted JSON URL."), "Hosted URL distinction");
	} else {
		assert($(".nuvio-guide-consequence p").textContent === "Import replaces the complete Collection list in the current profile. Collections not included in the imported JSON may be lost. Save your existing Collections first if needed.", "Exact complete-list replacement warning");
		assert(stepItems[0].includes("In Nuvio, copy your existing Collections JSON") && stepItems[0].includes("paste/save it somewhere safe") && stepItems[0].includes("note or file") && stepItems[1] === "In Dingo, choose Copy JSON.", "Save a durable Nuvio backup before Dingo replaces the clipboard");
		assert(steps.includes("Settings → Appearance → Collections") && steps.includes("Paste the complete JSON"), "Paste import route retained");
		assert(!/From File|From URL|Add as new|Merge|Download JSON|file picker/.test(copy), "No invented mobile/desktop import methods");
		assert(copy.includes("other devices using this profile"), "Signed-in sync consequence");
	}
}
async function exerciseGuide(host) {
	const dialog = guideDialog(); const originalProject = controller.getState().project;
	const revision = controller.getState().revision; const selection = JSON.stringify(controller.getState().selection);
	const prepared = preparations; const requestCount = requests.length;
	const bodyStyle = document.body.getAttribute("style"); const bodyClass = document.body.className;
	const position = [scrollX, scrollY]; let bodyMutations = 0;
	const observer = new MutationObserver(items => { bodyMutations += items.length; });
	observer.observe(document.body, { attributes: true, attributeFilter: ["style", "class"] });
	const hostScroll = $(host === "export" ? ".export-collections-content" : ".about-credits-content");
	await act(() => { hostScroll.scrollTop = hostScroll.scrollHeight; });
	const top = hostScroll.scrollTop;
	const filename = $(".export-filename")?.textContent;
	await click($("[data-action=open-import-guide]"));
	assert(guideDialog() === dialog && document.activeElement === dialog.querySelector("h2"), "Forward heading focus retains existing host");
	assert([...document.querySelectorAll("[data-guide-platform]")].map(item => item.dataset.guidePlatform).join("|") === guidePlatforms.join("|"), "Exactly four platforms, no iOS");
	assert(!dialog.querySelector('input, [role="radio"], [role="checkbox"], [aria-pressed], [aria-selected]'), "Chooser is navigation, not selection controls");
	checkGuideArtwork(false);
	await click($(".nuvio-guide-section summary"));
	checkGuideArtwork(true);
	await window.guideScrollEnd();
	for (const id of guidePlatforms) {
		await act(() => $("[data-guide-platform=" + id + "]").scrollIntoView({ block: "nearest" }));
		const chooserTop = $(".nuvio-guide-content").scrollTop;
		await click($("[data-guide-platform=" + id + "]"));
		assert(document.activeElement === dialog.querySelector("h2") && $(".nuvio-guide-content").scrollTop === 0, "Instruction heading focused without retaining old scroll");
		checkPlatformContent(id); checkGuideGeometry();
		await act(() => { $(".nuvio-guide-content").scrollTop = $(".nuvio-guide-content").scrollHeight; });
		assert($(".nuvio-guide-content").lastElementChild.getBoundingClientRect().bottom <= $(".nuvio-guide-content").getBoundingClientRect().bottom + 1, "Final useful guidance reachable without an evidence footer");
		await guideBack();
		assert(document.activeElement === $("[data-guide-platform=" + id + "]") && Math.abs($(".nuvio-guide-content").scrollTop - chooserTop) <= 1, "Back restores chosen platform and chooser scroll");
		checkGuideArtwork(true);
	}
	await guideBack();
	assert(guideDialog() === dialog && document.activeElement === $("[data-action=open-import-guide]"), "Back restores original help entry inside same host");
	assert(Math.abs($(host === "export" ? ".export-collections-content" : ".about-credits-content").scrollTop - top) <= 1, "Host scroll retained");
	assert(filename === $(".export-filename")?.textContent && preparations === prepared, "Filename and prepared payload retained without reserialization");
	assert(controller.getState().project === originalProject && controller.getState().revision === revision && JSON.stringify(controller.getState().selection) === selection, "Guide does not mutate project, revision or selection");
	assert(requests.length === requestCount, "Guide makes zero service requests");
	assert(scrollX === position[0] && scrollY === position[1], "Guide does not move document");
	assert(document.body.getAttribute("style") === bodyStyle && document.body.className === bodyClass && bodyMutations === 0, "Same uninterrupted body lock throughout guide navigation");
	observer.disconnect();
}
window.runImportGuideScenario = async (host) => {
	await mount(host === "welcome" ? null : profile(), { fromWelcome: host === "welcome" });
	const entry = $(host === "export" ? "[data-action=open-export-collections]" : "[data-action=open-about-credits]");
	await click(entry);
	await exerciseGuide(host);
	await click($("[data-action=open-import-guide]")); await click($("[data-guide-platform=mobile]"));
	const viewport = { width: innerWidth, height: innerHeight };
	await click($("[data-action=import-guide-close]"));
	assert(!guideDialog() && document.activeElement === entry && document.body.style.position !== "fixed", "Guide Close dismisses original host, unlocks and returns focus");
	assert(requests.length === 0, "All guide-only paths have zero requests");
	return { host, ...viewport, passed: true, requests: requests.length };
};
window.prepareGuideScreen = async (host, screen) => {
	await mount(host === "welcome" ? null : profile(), { fromWelcome: host === "welcome" });
	await click($(host === "export" ? "[data-action=open-export-collections]" : "[data-action=open-about-credits]"));
	if (screen === "root") return true;
	await click($("[data-action=open-import-guide]"));
	if (screen !== "chooser") await click($("[data-guide-platform=" + screen + "]"));
	return checkGuideGeometry();
};
window.checkGuideGeometry = checkGuideGeometry;
window.guideScrollEnd = async () => {
	const summary = $(".nuvio-guide-section summary"); if (summary && !summary.parentElement.open) await click(summary);
	await act(() => { $(".nuvio-guide-content").scrollTop = $(".nuvio-guide-content").scrollHeight; });
	const content = $(".nuvio-guide-content");
	assert(content.lastElementChild.getBoundingClientRect().bottom <= content.getBoundingClientRect().bottom + 1, "Final guidance remains reachable after disclosure expansion");
	return checkGuideGeometry();
};
window.checkGuideClosed = () => {
	assert(!guideDialog() && document.body.style.position !== "fixed", "Escape closes original modal and unlocks");
	assert(document.activeElement.matches("[data-action=open-export-collections], [data-action=open-about-credits]"), "Escape restores original trigger");
	return true;
};
