import "../../builder/src/styles.css";
import { createElement, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { createBuilderController } from "../../builder/src/application/index.js";
import { serializeNuvioProject } from "../../builder/src/serialize/index.js";
import { BuilderWorkspace } from "../../builder/src/ui/BuilderWorkspace.jsx";

const root = createRoot(document.querySelector("#root"));
const tick = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
const pause = () => new Promise((resolve) => setTimeout(resolve, 30));
const check = (condition, message) => { if (!condition) throw new Error(message); };
const query = (selector) => { const element = document.querySelector(selector); check(element, "Missing " + selector); return element; };
let real, proxy, opening, publications, calls, reviews, requests, mode, sequence = 0;
const source = (title, type = "COMPANY", media = "MOVIE", id = 2, filters = {}) => ({ title, provider: "tmdb", tmdbSourceType: type, tmdbId: type === "DISCOVER" ? null : id, mediaType: media, sortBy: "popularity.desc", filters });
function authoredProject(large = false) {
	const rows = [
		source("Studio movies", "COMPANY", "MOVIE", 2, { withoutGenres: "18" }),
		source("Network series", "NETWORK", "TV", 213, { withoutGenres: "16" }),
		source("Horror source", "DISCOVER", "MOVIE", 0, { withGenres: "27" }),
		{ title: "Local imported list", provider: "tmdb", tmdbSourceType: "LIST", tmdbId: 1, mediaType: "MOVIE", sortBy: "original" },
		source("Preserved expression", "DISCOVER", "MOVIE", 0, { withoutGenres: "27|18" }),
	];
	const other = [source("Converging source", "COMPANY", "MOVIE", 3), source("Existing exclusion", "COMPANY", "MOVIE", 3, { withoutGenres: "16,27" }), source("Series discovery", "DISCOVER", "TV", 0, { withGenres: "18" }), source("More movies", "COMPANY", "MOVIE", 4)];
	return [{ id: "c1", title: "Discover", viewMode: "TABBED_GRID", folders: [
		{ id: "f1", title: "New Movies", sources: rows },
		{ id: "f2", title: "New Series", sources: large ? Array.from({ length: 125 }, (_, index) => source("Authored local Source " + (index + 1), "COMPANY", "MOVIE", 100 + index)) : other },
	] }, { id: "c2", title: "Spotlight", folders: [{ id: "f3", title: "The Headliner", sources: [source("Unrelated Source", "COMPANY", "MOVIE", 99)] }] }];
}

function reviewProject(kind, large) {
	if (!kind) return authoredProject(large);
	if (kind === "multi-target") {
		const project = authoredProject();
		project[0].folders.push({ id: "empty-folder", title: "Empty Folder", sources: [] });
		project[1].folders[0].sources.push({ title: "Imported community Source", provider: "community", catalogId: "preserved", extra: { keep: true } });
		project.push({ id: "empty-collection", title: "Empty Collection", folders: [] }, { id: "archive", title: "Archive", folders: [{ id: "archive-folder", title: "Untouched", sources: [source("Unselected archive", "COMPANY", "MOVIE", 300)] }] });
		return project;
	}
	const unsupported = (id) => ({ title: "The Headliner", provider: "tmdb", tmdbSourceType: "LIST", tmdbId: id, mediaType: "MOVIE", sortBy: "original" });
	if (kind === "all-skipped-folder" || kind === "all-skipped-collection") return [{ id: "spotlight", title: "Spotlight", folders: Array.from({ length: kind === "all-skipped-folder" ? 1 : 8 }, (_, i) => ({ id: "f" + i, title: i ? "Spotlight picks " + (i + 1) : "The Headliner", sources: [unsupported(i + 1)] })) }];
	if (kind === "multiple-skipped") return [{ id: "skip", title: "Spotlight", folders: [{ id: "skip-folder", title: "Unsupported choices", sources: [unsupported(1), unsupported(2)] }] }];
	if (kind === "zero-mixed") return [{ id: "zero", title: "Weekend", folders: [{ id: "f", title: "Favourites", sources: [source("Already excluded", "COMPANY", "MOVIE", 2, { withoutGenres: "16,27" }), unsupported(1)] }] }];
	if (kind === "all-changing") return [{ id: "routine", title: "Discover", folders: [{ id: "routine-folder", title: "New Movies", sources: Array.from({ length: 18 }, (_, i) => source("Movie picks " + (i + 1), "COMPANY", "MOVIE", 1000 + i)) }] }];
	if (kind === "large-exceptions") return [{ id: "exceptions", title: "Discover", folders: [{ id: "exceptions-folder", title: "Mixed exceptions", sources: Array.from({ length: 125 }, (_, i) => [source("Existing " + (i + 1), "COMPANY", "MOVIE", 2000 + i, { withoutGenres: "16,27" }), unsupported(1000 + i)]).flat() }] }];
	if (kind === "large-review") return [{ id: "large", title: "Discover", folders: Array.from({ length: 9 }, (_, f) => ({ id: "f" + f, title: ["New Movies", "Popular Movies", "Top Rated", "Family", "Drama", "Comedy", "Documentaries", "Classics", "Weekend picks"][f], sources: Array.from({ length: 12 }, (_, i) => i % 3 === 2 ? unsupported(100 + f * 12 + i) : source("Movie picks " + (i + 1), "COMPANY", "MOVIE", 100 + f * 12 + i, i % 3 === 0 ? { withoutGenres: "16,27" } : {})) })) }];
	throw new Error("Unknown authored review kind");
}

function Workspace({ controller }) {
	const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
	return createElement(BuilderWorkspace, { controller, state });
}
async function mount({ large = false, failure = "", long = false, repeated = false, kind = "" } = {}) {
	flushSync(() => root.render(null)); await pause();
	document.documentElement.style.fontSize = "";
	real = createBuilderController({ idFactory: () => "scoped-mounted-" + (++sequence) });
	check(real.importValue(reviewProject(kind, large)).ok, "Import authored local project");
	if (repeated) for (const collection of real.getState().project.collections) {
		real.updateNode(collection.internalId, { title: "Weekend collection" });
		for (const folder of collection.folders) real.updateNode(folder.internalId, { title: "Favourites" });
	}
	if (long) for (const collection of real.getState().project.collections) {
		real.updateNode(collection.internalId, { title: "A very long Collection name for the weekend with family and friends & more " + "unbroken".repeat(10) });
		for (const folder of collection.folders) real.updateNode(folder.internalId, { title: "A very long Folder title that must remain completely readable " + "unbroken".repeat(10) });
	}
	opening = real.getState(); publications = 0; calls = []; reviews = []; requests = []; mode = failure;
	let previous = opening.project;
	real.subscribe(() => { const next = real.getState().project; if (next !== previous) { publications += 1; previous = next; } });
	proxy = { ...real,
		reviewScopedGenreExclusions(request) { requests.push(request); const result = real.reviewScopedGenreExclusions(request); reviews.push(result.review); return result; },
		applyScopedGenreExclusions(review) {
			calls.push(review); check(review === reviews.at(-1), "UI passes exact authenticated review");
			if (mode === "failure") return { ok: false, errors: [{ message: "Local application failure. Nothing was changed." }] };
			if (mode === "throw") throw new Error("Local test exception");
			return real.applyScopedGenreExclusions(review);
		},
	};
	flushSync(() => root.render(createElement(Workspace, { controller: proxy }))); await tick();
	await click('[data-action="open-bulk-edit"]');
}
async function click(selector) {
	const element = typeof selector === "string" ? query(selector) : selector;
	check(!element.disabled, "Enabled action: " + (element.textContent || selector)); element.click(); await tick();
}
async function button(text) {
	const element = [...query('[role="dialog"]').querySelectorAll("button")].find((entry) => (entry.getAttribute("aria-label") === text || entry.textContent.trim() === text));
	check(element, "Button " + text); await click(element);
}
async function input(selector, value) {
	const element = query(selector); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(element, value);
	element.dispatchEvent(new Event("input", { bubbles: true })); await tick();
}
async function launch() {
	await click("#global-settings-source-tab"); check(!document.querySelector('[data-action="apply-bulk-edit"]'), "No Display Apply in Source management");
	check(query("#global-settings-source-panel").textContent.includes("Choose existing Sources across Collections and Folders, then review the changes before applying them together."), "Approved multi-target launcher copy");
	await click('[data-action="exclude-genres"]');
	check(!document.querySelector('input[name="scoped-genre-target"]:checked'), "No preselected scope");
	check(query('[data-scoped-genre-stage="scope"] .editor-apply').disabled, "Continue requires scope");
	check(document.activeElement.tagName !== "INPUT", "Search does not auto-focus");
}
async function selectScope(index = 0) {
	const collection = real.getState().project.collections[0];
	if (index) await click('.scoped-genre-chevron');
	const id = index ? collection.folders[index - 1].internalId : collection.internalId;
	await click('input[value="' + id + '"]');
	await button("Continue");
}
async function genres() {
	await click('[data-genre-name="Animation"]'); await click('[data-genre-name="Horror"]');
}
async function review() { await launch(); await selectScope(); await genres(); await button("Review changes"); }
function unchanged() { check(real.getState().project === opening.project && publications === 0, "No project mutation before Apply"); }
function sourceReturn() {
	check(query("#global-settings-source-tab").getAttribute("aria-selected") === "true", "Return to Source management");
	check(document.activeElement === query('[data-action="exclude-genres"]'), "Restore exact Exclude genres trigger");
	check(document.querySelectorAll('[role="dialog"]').length === 1, "One dialog after return");
}
function checkReports() {
	const review = reviews.at(-1);
	for (const folder of document.querySelectorAll("[data-scoped-folder]")) {
		const outcomes = review.outcomes.filter(row => row.folderInternalId === folder.dataset.scopedFolder);
		const counts = Object.fromEntries(["skipped", "unchanged", "changed"].map(status => [status, outcomes.filter(row => row.status === status).length]));
		check(folder.querySelector("header").textContent.includes(outcomes.length + " selected · " + counts.changed + " will change · " + counts.unchanged + " unchanged · " + counts.skipped + " skipped"), "Folder totals reconcile to authenticated outcomes");
		const statusOrder = [...folder.querySelectorAll(":scope > [data-scoped-report]")].map(group => group.dataset.scopedReport);
		check(JSON.stringify(statusOrder) === JSON.stringify(["skipped", "unchanged", "changed"].filter(status => counts[status])), "Exceptions precede routine summary");
		for (const status of ["skipped", "unchanged", "changed"]) {
			const expected = status === "changed" ? [] : outcomes.filter(row => row.status === status).slice(0, 50);
			const visible = [...folder.querySelectorAll('[data-outcome="' + status + '"]')];
			check(JSON.stringify(visible.map(row => row.dataset.scopedSource)) === JSON.stringify(expected.map(row => row.sourceInternalId)), "Saved order within status; changed DOM absent by default");
			if (status === "skipped") expected.forEach((row, i) => check(visible[i].textContent.includes(row.reason.message), "Complete authenticated reason inline"));
			if (status === "unchanged") check(visible.every(row => row.textContent.includes("Unchanged")), "Unchanged exception reason inline");
		}
		const changing = folder.querySelector(".scoped-genre-audit-toggle");
		check(Boolean(changing) === (counts.changed > 0), "Audit control only when changes exist");
		if (changing) check(changing.getAttribute("aria-expanded") === "false" && document.getElementById(changing.getAttribute("aria-controls"))?.hidden, "Routine audit initially collapsed with controlled region");
		check(!folder.querySelector("details,summary") && !folder.textContent.includes("View details"), "No Folder or Source disclosure");
	}
}
window.scopedState = () => ({ stage: document.querySelector("[data-scoped-genre-stage]")?.dataset.scopedGenreStage, publications, calls: calls.length, reviews: reviews.length, focus: document.activeElement?.outerHTML, history: history.state });
window.scopedLocalCases = async () => {
	await mount();
	const choices = { layout: "ROWS", showAllTab: "OFF", pinToTop: "ON", collectionTitles: "HIDE", folderTitleVisibility: "HIDE_EVERYWHERE", focusArtwork: "HIDE" };
	for (const [name, value] of Object.entries(choices)) await click('[name="' + name + '"][value="' + value + '"]');
	await click("#global-settings-source-tab");
	check(document.querySelector("[data-global-settings-guard]"), "Dirty guard appears"); unchanged();
	await button("Keep editing");
	for (const [name, value] of Object.entries(choices)) check(query('[name="' + name + '"]:checked').value === value, "Keep exact Display draft " + name);
	await click("#global-settings-source-tab"); await button("Discard & continue"); unchanged();
	await click("#global-settings-display-tab");
	check([...document.querySelectorAll('[data-bulk-edit-field] input:checked')].every((entry) => entry.value === "NO_CHANGE"), "Discard only Display draft");
	await launch(); await selectScope();
	check(document.querySelectorAll(".discover-genre-pills button").length === 27, "All 27 official concepts");
	check(query('[data-genre-name="Horror"]').getAttribute("aria-label").includes("Movies only"), "Movie-only mapping label");
	check(query('[data-genre-name="Kids"]').getAttribute("aria-label").includes("Series only"), "Series-only mapping label");
	check(!query('[data-genre-name="Animation"]').getAttribute("aria-label").includes("only"), "Shared mapping");
	await genres(); await button("Clear selection");
	check(!document.querySelector('[data-genre-name][aria-pressed="true"]'), "Clear removes all selections");
	await genres();
	check(document.querySelectorAll('[data-genre-name][aria-pressed="true"]').length === 2, "Compact pills retain multiple exclusions");
	check(document.querySelectorAll(".scoped-genre-exclusion-search input").length === 0, "Complete short catalogue has no unnecessary search field");
	await button("Review changes"); unchanged();
	check(query('[data-scoped-total="changed"]').textContent === "3", "Three changed");
	check(query('[data-scoped-total="unchanged"]').textContent === "2", "Two unchanged");
	check(query('[data-scoped-total="skipped"]').textContent === "4", "Four skipped");
	check(!document.querySelector("[data-scoped-source]"), "Collapsed Collection mounts no Source rows");
	check(query(".scoped-genre-review-collection > summary").textContent.includes("9 selected · 3 will change · 2 unchanged · 4 skipped"), "Collection summary exact authenticated totals");
	await click(".scoped-genre-review-collection > summary"); check(document.querySelectorAll("[data-scoped-source]").length === 6, "Only skipped and unchanged Sources mount by default"); checkReports();
	check(query(".scoped-genre-exclusion-results dt").textContent === "Will change", "Pending status");
	check(!document.querySelector(".scoped-genre-review-folders details, .scoped-genre-review-folders summary"), "No Folder or Source disclosures");
	const toggle = query(".scoped-genre-audit-toggle");
	check(toggle.textContent.includes("Show 1 changing Source"), "Count-only routine audit invitation");
	await click(toggle);
	const row = query('[data-outcome="changed"]');
	check(!row.textContent.includes("Will change") && !row.textContent.includes("Will add"), "No repeated routine change prose");
	check(row.textContent.includes("Drama (18)") && row.textContent.includes("Horror (27)") && row.textContent.includes("Animation (16)"), "Official names and IDs inline without a disclosure");
	check(row.textContent.includes("Existing:") && row.textContent.includes("After:") && !row.querySelector("details"), "Before/after evidence inline");
	check(toggle.textContent === "Hide changing Sources" && toggle.getAttribute("aria-expanded") === "true", "Expanded routine audit label");
	await click(toggle); check(!document.querySelector('[data-outcome="changed"]'), "Hiding audit unmounts changed rows");
	await button("Back"); check(document.querySelectorAll('[data-genre-name][aria-pressed="true"]').length === 2, "Back retains Genre choices");
	await button("Review changes"); check(reviews[0] !== reviews[1], "Renewed review authority");
	await click('[data-action="apply-scoped-genres"]');
	check(publications === 1 && calls.length === 1, "One atomic publication");
	check(query(".scoped-genre-exclusion-results dt").textContent === "Changed", "Completed wording uses actual results");
	check(!document.querySelector('[data-action="scoped-genres-back"]') && query('[data-action="scoped-genres-close"]') && query("footer").textContent.trim() === "Done", "Success has Close and sole Done, no Back");
	check(document.activeElement === query(".scoped-genre-success-heading") && getComputedStyle(document.activeElement).outlineStyle === "none", "Success heading retains programmatic focus without decorative outline");
	check(real.getState().project.collections[1] === opening.project.collections[1], "Unrelated Collection preserved");
	await button("Done"); sourceReturn();
	await click('[data-action="cancel-bulk-edit"]'); await pause();
	check(!document.querySelector('[role="dialog"]') && document.activeElement === query('[data-action="open-bulk-edit"]'), "Settings trigger restored");
	check(!history.state?.__dingoGlobalSettings && !document.body.classList.contains("settings-modal-open"), "History/body cleanup");
	await click('[data-action="open-bulk-edit"]'); check(query("#global-settings-display-tab").getAttribute("aria-selected") === "true", "Reopen defaults Display");
	await review();
	check(query('[data-scoped-total="changed"]').textContent === "0", "Repeat is no-op");
	await button("Done"); sourceReturn(); check(publications === 1 && calls.length === 1, "No-op does not publish");
	for (const failure of ["stale", "failure", "throw"]) {
		await mount({ failure }); await review();
		if (failure === "stale") real.updateNode(real.getState().project.collections[1].internalId, { title: "External local change" });
		const before = real.getState().project, count = publications;
		await click('[data-action="apply-scoped-genres"]');
		check(document.querySelector('[role="alert"]')?.textContent.includes("Review"), "Useful failure diagnostic");
		check(!document.querySelector('[data-action="apply-scoped-genres"]'), "Old review cannot apply");
		check(real.getState().project === before && publications === count, "Failure leaves current project unchanged");
		mode = ""; await button("Review again"); await click('[data-action="apply-scoped-genres"]');
		check(publications === count + 1, "Fresh review applies once"); await button("Done"); sourceReturn();
	}
	await mount(); await launch(); await button("Back"); sourceReturn(); unchanged();
	const targets = await targetCases();
	for (const kind of ["all-skipped-folder", "all-skipped-collection", "multiple-skipped", "zero-mixed", "large-review", "all-changing", "large-exceptions"]) {
		await window.prepareScopedScreen(kind);
		const text = query('[data-scoped-genre-stage="review"]').textContent;
		check(!document.querySelector("[data-scoped-source], .scoped-genre-exclusion-folder"), "Collapsed Collection has no hidden outcome DOM");
		check(!query(".scoped-genre-review-collection").open, "Review Collections start collapsed");
		const total = reviews.at(-1).totals;
		check(query(".scoped-genre-review-collection > summary").textContent.includes(total.inspected + " selected · " + total.changed + " will change · " + total.unchanged + " unchanged · " + total.skipped + " skipped"), "Review summary reconciles every status");
		if (kind.startsWith("all-skipped")) check(text.includes("All skipped") && text.includes("No selected Sources need changing."), "Accurate all-skipped summary");
		if (kind === "zero-mixed") check(!text.includes("All skipped") && total.unchanged === 1 && total.skipped === 1, "Mixed no-op is not wholly skipped");
		await click(".scoped-genre-review-collection > summary");
		check(!document.querySelector(".scoped-genre-review-folders details,.scoped-genre-review-folders summary"), "One primary Collection disclosure only");
		checkReports();
		check([...document.querySelectorAll('[data-outcome="skipped"]')].every(row => row.textContent.includes("This Source family does not consume native Genre exclusions.")), "Full foundation skip reason inline");
		if (kind === "large-review") check(document.querySelectorAll(".scoped-genre-exclusion-folder > header h4").length === 9, "Nine simple Folder headings");
		if (!total.changed) check(!document.querySelector('[data-scoped-report="changed"],[data-action="apply-scoped-genres"]'), "No empty routine section or Apply for zero-change");
		if (kind === "all-changing") check(!document.querySelector("[data-scoped-source]") && query(".scoped-genre-audit-toggle").textContent.includes("Show 18 changing Sources"), "Routine-only Folder stays compact");
		if (kind === "large-exceptions") for (const status of ["skipped", "unchanged"]) {
			const group = query('[data-scoped-report="' + status + '"]'), more = group.querySelector("button");
			check(group.querySelectorAll("[data-scoped-source]").length === 50 && more.textContent.startsWith("Show next 50 " + status + " Sources"), "First exception batch and status-specific label");
			more.focus({ preventScroll: true }); await click(more); await click(more);
			check(group.querySelectorAll("[data-scoped-source]").length === 125 && document.activeElement === more, "Exception batching uncapped with focus retained");
		}
		await click(".scoped-genre-review-collection > summary");
		check(!document.querySelector("[data-scoped-source]"), "Collapsing unmounts large contents"); unchanged();
	}
	await mount({ large: true }); await launch(); await selectScope(2); await genres(); await button("Review changes");
	check(!document.querySelector("[data-scoped-source]"), "Large Collection lazy while collapsed");
	await click(".scoped-genre-review-collection > summary");
	check(!document.querySelector("[data-scoped-source]"), "125 routine changes summarized without hidden rows");
	await click(".scoped-genre-audit-toggle");
	check(document.querySelectorAll("[data-scoped-source]").length === 50, "Opened audit renders first 50");
	const more = query(".scoped-genre-exclusion-details > button"); more.focus({ preventScroll: true });
	await click(more); check(document.activeElement === more && document.querySelectorAll("[data-scoped-source]").length === 100, "First Review batch retains focus");
	await click(more); check(document.activeElement === more && more.getAttribute("aria-disabled") === "true", "Final Review batch retains focus");
	check(document.querySelectorAll("[data-scoped-source]").length === 125, "No Source evidence cap"); unchanged();
	return { passed: true, targets, changed: 3, unchanged: 2, skipped: 4, largeDetails: 125, skippedBatch: 125, unchangedBatch: 125 };
};
window.prepareScopedScreen = async (screen, enlarged = false, long = false) => {
	const baseScreen = screen.replace(/-expanded$/, "");
	const kind = ["all-skipped-folder", "all-skipped-collection", "multiple-skipped", "zero-mixed", "large-review", "all-changing", "large-exceptions"].includes(baseScreen) ? baseScreen : "";
	await mount({ long, kind }); document.documentElement.style.fontSize = enlarged ? "200%" : ""; await tick();
	if (screen === "display") return measure(screen);
	if (screen === "guard") { await click('[name="layout"][value="ROWS"]'); await click("#global-settings-source-tab"); return measure(screen); }
	await click("#global-settings-source-tab");
	if (screen === "source") return measure(screen);
	await click('[data-action="exclude-genres"]');
	if (screen === "scope") return measure(screen);
	if (screen === "scope-expanded") { await click(".scoped-genre-chevron"); await click('[data-target-kind="folder"] input'); await click('[data-target-kind="folder"] .scoped-genre-chevron'); return measure(screen); }
	if (screen === "scope-search") { await input(".scoped-genre-exclusion-search input", long ? "Folder title" : "New Series"); return measure(screen); }
	await selectScope(screen === "all-skipped-folder" ? 1 : 0); await genres();
	if (screen === "genres") return measure(screen);
	await button("Review changes");
	if (screen === "expanded" || screen === "inline" || (kind && screen.endsWith("-expanded"))) await click(".scoped-genre-review-collection > summary");
	if (screen === "inline") await click(".scoped-genre-audit-toggle");
	if (screen === "inline" || screen === "expanded" || (kind && screen.endsWith("-expanded"))) {
		const body = query(".scoped-genre-exclusion-body"), target = query(screen === "inline" ? '[data-scoped-report="changed"]' : ".scoped-genre-review-collection");
		body.scrollTop += target.getBoundingClientRect().top - body.getBoundingClientRect().top - 8;
	}
	if (screen === "success") await click('[data-action="apply-scoped-genres"]');
	if (screen === "error") { real.updateNode(real.getState().project.collections[1].internalId, { title: "Changed outside review" }); await click('[data-action="apply-scoped-genres"]'); }
	return measure(screen);
};
window.scopedPrepareConfirmation = async () => {
	await mount(); await click('[name="collectionTitles"][value="HIDE"]'); await click('[data-action="apply-bulk-edit"]');
	check(query('[data-bulk-title-confirmation]'), "Title confirmation opens"); unchanged(); return true;
};
function measure(screen) {
	const dialog = query('[role="dialog"]'), body = dialog.querySelector(".global-settings-body,.scoped-genre-exclusion-body"), footer = dialog.querySelector("footer");
	const rect = dialog.getBoundingClientRect(), actions = footer.getBoundingClientRect();
	const owners = [dialog, ...dialog.querySelectorAll("*")].filter((element) => ["auto", "scroll"].includes(getComputedStyle(element).overflowY));
	check(document.querySelectorAll('[role="dialog"]').length === 1, "One dialog");
	check(owners.length === 1 && owners[0] === body, "One intentional body scroll owner");
	check(rect.left >= -1 && rect.right <= innerWidth + 1 && dialog.scrollWidth <= dialog.clientWidth + 1, "No dialog overflow " + screen);
	check(actions.top >= rect.top && actions.bottom <= rect.bottom + 1 && actions.bottom <= innerHeight + 1, "Reachable actions " + screen);
	check([...footer.querySelectorAll("button")].every((el) => el.getBoundingClientRect().height >= 44), "44px actions");
	if (dialog.hasAttribute("data-scoped-genre-stage")) {
		const back = document.querySelector('[data-action="scoped-genres-back"]'), close = query('[data-action="scoped-genres-close"]');
		check(close.closest("header"), "Close remains in header");
		if (dialog.dataset.scopedGenreStage === "success") check(!back && footer.textContent.trim() === "Done", "Success has no Back and only Done in footer");
		else check(back?.closest("header") && back.getBoundingClientRect().left < close.getBoundingClientRect().left, "Steps 1/2/3 retain header Back left");
		check([back, close].filter(Boolean).every(el => el.getBoundingClientRect().height >= 44 && el.getBoundingClientRect().width >= 44), "Header touch targets");
		check(footer.querySelectorAll("button").length === 1 && !/Back|Cancel|Close/.test(footer.textContent), "Footer contains only the primary action");
		const word = document.createRange(), heading = query("#scoped-genre-exclusion-title");
		word.setStart(heading.firstChild, 0); word.setEnd(heading.firstChild, 7);
		check(word.getClientRects().length === 1, "Header title wraps at words, including enlarged text");
	}
	check(document.body.style.position === "fixed" && document.querySelector("[data-workspace-underlay]")?.inert === true, "Body locked");
	const clipped = [...body.querySelectorAll("label,button,summary")].filter((el) => el.getClientRects().length && el.scrollWidth > el.clientWidth + 1);
	check(clipped.length === 0, "No clipped choices " + screen);
	return { screen, width: innerWidth, height: innerHeight, passed: true, scrollOwners: owners.length, dialogWidth: rect.width };
}
window.scopedMeasure = measure;
window.scopedButton = button;
window.scopedInput = input;
window.scopedUnchanged = unchanged;
window.scopedReturn = sourceReturn;
window.scopedClose = async () => { if (document.querySelector("[data-scoped-genre-stage]")) { await button("Close"); sourceReturn(); } await click('[data-action="cancel-bulk-edit"]'); await pause(); check(!history.state?.__dingoGlobalSettings, "Clean history"); return true; };
window.scopedHistoryCase = async () => {
	await mount(); await review(); unchanged();
	for (const stage of ["genres", "scope"]) { history.back(); await pause(); await tick(); check(document.querySelector('[data-scoped-genre-stage="' + stage + '"]'), "Browser Back to " + stage); }
	history.back(); await pause(); await tick(); sourceReturn(); unchanged();
	history.back(); await pause(); await tick(); check(!document.querySelector('[role="dialog"]'), "Browser Back closes settings"); check(!history.state?.__dingoGlobalSettings, "No stale history marker");
	return true;
};
let originalViewport;
window.scopedViewport = async (height, offsetTop) => {
	originalViewport ??= Object.getOwnPropertyDescriptor(window, "visualViewport");
	Object.defineProperty(window, "visualViewport", { configurable: true, value: { width: innerWidth, height, offsetTop, offsetLeft: 0, addEventListener() {}, removeEventListener() {} } });
	dispatchEvent(new Event("resize")); await tick(); const rect = query(".global-settings-backdrop").getBoundingClientRect();
	check(Math.abs(rect.top - offsetTop) <= 1 && Math.abs(rect.height - height) <= 1, "Visual Viewport geometry");
	return measure("viewport");
};
window.scopedRestoreViewport = async () => { if (originalViewport) Object.defineProperty(window, "visualViewport", originalViewport); originalViewport = null; dispatchEvent(new Event("resize")); await tick(); };
async function targetCases() {
	await mount({ kind: "multi-target" }); await launch();
	const [discover, spotlight, emptyCollection, archive] = real.getState().project.collections;
	const [movies, series, emptyFolder] = discover.folders;
	const target = (node) => query('input[value="' + node.internalId + '"]');
	const disclose = (node) => target(node).closest(".scoped-genre-exclusion-target-row").querySelector("button");
	const count = (n) => check(query(".scoped-genre-exclusion-selection [role=status]").textContent === n + (n === 1 ? " Source selected" : " Sources selected"), "Exact global Source count " + n);
	await click(target(emptyCollection)); count(0);
	check(query(".editor-apply").disabled && query("[role=dialog]").textContent.includes("The selected items contain no Sources."), "Empty-only cannot continue");
	check(!disclose(emptyCollection), "No empty Collection chevron");
	await click(target(discover)); count(9);
	await click(disclose(discover));
	check(target(emptyFolder).checked && !disclose(emptyFolder), "Empty Folder selected without disclosure");
	await click(target(emptyFolder)); count(9);
	check(target(discover).indeterminate && target(discover).getAttribute("aria-checked") === "mixed", "All physical Sources plus unselected empty is mixed");
	await click(disclose(movies));
	await click(target(movies.sources[0])); count(8);
	check(target(discover).indeterminate && target(movies).indeterminate, "Child subtraction derives mixed ancestors");
	await click(disclose(discover)); count(8);
	await button("Continue"); await genres(); await button("Back");
	count(8); check(disclose(discover).getAttribute("aria-expanded") === "false", "Back retains ordinary collapse");
	await input(".scoped-genre-exclusion-search input", "Network series");
	check(target(movies.sources[1]).getClientRects().length > 0, "Source match reveals full parent path");
	await click(target(movies)); count(9);
	check(target(movies).checked, "Search-visible parent selects whole branch including hidden Sources");
	await click(disclose(discover));
	check(disclose(discover).getAttribute("aria-expanded") === "false", "Explicit search collapse persists");
	count(9);
	await input(".scoped-genre-exclusion-search input", "no matching title");
	check(query("[role=dialog]").textContent.includes("Your selections are retained"), "No results preserves count and actions");
	await button("Select all"); count(12);
	check([...document.querySelectorAll("button")].find(el => el.textContent === "Select all").disabled, "Global all includes hidden and empty leaves");
	await button("Clear selections"); count(0);
	await input(".scoped-genre-exclusion-search input", "");
	check(disclose(discover).getAttribute("aria-expanded") === "false", "Clearing search restores ordinary collapsed state");
	await click(target(discover)); await click(target(spotlight));
	await click(disclose(discover)); await click(disclose(series)); await click(target(series.sources[1]));
	count(10); check(target(discover).indeterminate, "Unselected blocker makes Collection mixed");
	await button("Continue");
	check(document.querySelectorAll('[data-genre-name][aria-pressed="true"]').length === 2, "Clearing targets retained Genres");
	await button("Review changes"); unchanged();
	check(requests.length === 1 && Object.keys(requests[0]).sort().join() === "genreNames,sourceInternalIds", "One Source-ID-only request across Collections");
	check(requests[0].sourceInternalIds.length === 10 && !requests[0].sourceInternalIds.includes(emptyFolder.internalId), "No empty markers in request");
	check(reviews[0].totals.inspected === 10 && reviews[0].totals.changed === 4 && reviews[0].totals.unchanged === 1 && reviews[0].totals.skipped === 5, "Selected count differs from Apply count");
	check(query('[data-action="apply-scoped-genres"]').textContent === "Apply to 4 Sources", "Apply uses changed total");
	check(document.querySelectorAll(".scoped-genre-review-collection").length === 2, "Only targeted Collections shown");
	for (const summary of [...document.querySelectorAll(".scoped-genre-review-collection > summary")]) await click(summary);
	checkReports();
	check(document.querySelectorAll("[data-scoped-source]").length === 6, "Only six exceptions visible by default");
	for (const toggle of [...document.querySelectorAll(".scoped-genre-audit-toggle")]) await click(toggle);
	check(document.querySelectorAll("[data-scoped-source]").length === 10, "Audit reveals exactly the ten selected outcomes");
	check(!document.querySelector('[data-scoped-source="' + series.sources[1].internalId + '"]'), "Unselected blocker is not an outcome");
	check(query("[role=dialog]").textContent.includes("Matches an unselected Source in this Folder."), "Blocker context is supporting evidence");
	check(query("[role=dialog]").textContent.includes("Horror has no Series mapping."), "TV Horror remains inapplicable");
	check([...document.querySelectorAll('[data-outcome="skipped"],[data-outcome="unchanged"]')].every(el => !el.querySelector("details")), "No nested details for skipped/unchanged rows");
	const before = serializeNuvioProject(opening.project).value, expected = structuredClone(before);
	expected[0].folders[0].sources[0].filters.withoutGenres = "18,16,27";
	expected[0].folders[1].sources[2].filters.withoutGenres = "16";
	expected[0].folders[1].sources[3].filters.withoutGenres = "16,27";
	expected[1].folders[0].sources[0].filters.withoutGenres = "16,27";
	const apply = query('[data-action="apply-scoped-genres"]'); apply.click(); apply.click(); await tick();
	check(calls.length === 1 && publications === 1, "Double activation produces one authenticated Apply and one publication");
	check(JSON.stringify(serializeNuvioProject(real.getState().project).value) === JSON.stringify(expected), "Exact serialized four-Source delta");
	check(JSON.stringify(serializeNuvioProject(opening.project).value) === JSON.stringify(before), "Original snapshot remains byte-identical");
	check(real.getState().project.collections[3] === archive, "Unselected Collection retains exact identity");
	await button("Done"); sourceReturn();

	await mount({ repeated: true }); await launch();
	await input(".scoped-genre-exclusion-search input", "favourites");
	check(document.querySelectorAll('[data-target-kind="folder"]').length === 3, "Folder matches reveal parents and children");
	check(new Set([...document.querySelectorAll('[data-target-kind="folder"] > div > label small:first-of-type')].map(el => el.textContent)).size === 3, "Duplicate Folder contexts unique");
	check(!query("[role=dialog]").textContent.includes("scoped-mounted-"), "No internal ID labels");
	await button("Close"); sourceReturn(); unchanged();

	await mount({ large: true }); await launch();
	const largeCollection = real.getState().project.collections[0], largeFolder = largeCollection.folders[1];
	await click(disclose(largeCollection)); await click(disclose(largeFolder));
	check(document.querySelectorAll('[data-target-kind="source"]').length === 50, "Picker mounts first 50 only");
	await click(target(largeFolder));
	check(query(".scoped-genre-exclusion-selection [role=status]").textContent === "125 Sources selected", "Parent selects all 125 before rendering");
	let more = query(".scoped-genre-show-next"); more.focus({ preventScroll: true });
	const dialogTop = query("[role=dialog]").getBoundingClientRect().top, pageTop = scrollY;
	await click(more); check(document.activeElement === more, "First batch retains focused control");
	await click(more); check(document.activeElement === more && document.querySelectorAll('[data-target-kind="source"]').length === 125, "Final batch preserves focus without cap");
	check(query("[role=dialog]").getBoundingClientRect().top === dialogTop && scrollY === pageTop, "Batch does not move outer modal/document");
	target(largeFolder.sources[0]).focus({ preventScroll: true });
	const parentDisclosure = disclose(largeCollection); await click(parentDisclosure);
	check(document.activeElement === parentDisclosure, "Ancestor collapse restores focus before descendant removal");
	await button("Continue"); await genres(); await button("Review changes");
	check(reviews.at(-1).sourceInternalIds.length === 125, "Unrendered membership reaches one review");
	await button("Close"); unchanged();

	for (const mutation of ["add", "remove"]) {
		await mount(); await review();
		const selected = [...requests[0].sourceInternalIds], collection = real.getState().project.collections[0], folder = collection.folders[0];
		if (mutation === "add") check(real.createSource(folder.internalId, { category: "opaque", editable: { title: "New after selection" } }).ok, "Add current Source");
		else check(real.removeNode(folder.sources[0].internalId).ok, "Remove selected Source");
		await tick(); const beforeApply = real.getState().project;
		await click('[data-action="apply-scoped-genres"]');
		check(real.getState().project === beforeApply && !document.querySelector('[data-action="apply-scoped-genres"]'), "Project mutation invalidates review safely");
		await button("Review again");
		check(JSON.stringify(requests.at(-1).sourceInternalIds) === JSON.stringify(selected), "Re-review retains exact selected IDs without shrink or enrollment");
		if (mutation === "remove") check(document.querySelector('[role="alert"]') && !document.querySelector('[data-action="apply-scoped-genres"]'), "Missing selected ID fails closed");
		await button("Back"); await button("Back");
		if (mutation === "add") {
			check(target(collection).indeterminate, "New child makes previous full parent partial");
			await click(target(collection)); await button("Continue"); await button("Review changes");
			check(requests.at(-1).sourceInternalIds.length === selected.length + 1, "Deliberate mixed parent selects current new child");
		} else check(query("[role=dialog]").textContent.includes("can no longer be found"), "Missing selection has a clear recovery path");
		await button("Close");
	}
	return { selected: 10, changed: 4, publications: 1, pickerBatch: 125, emptyLeaves: 2, sourceIdRequest: true };
}

window.scopedFixtureReady = true;

let clippedState;
window.scopedClippedFocus = async () => {
	await window.prepareScopedScreen("scope");
	const body = query(".scoped-genre-exclusion-body"), search = query(".scoped-genre-exclusion-search input"), card = query(".scoped-genre-exclusion-choices label");
	search.focus({ preventScroll: true });
	body.scrollTop += card.getBoundingClientRect().top - body.getBoundingClientRect().top + 20;
	clippedState = { document: scrollY, dialog: query('[role="dialog"]').getBoundingClientRect().top };
	return true;
};
window.scopedCheckClippedFocus = () => {
	check(document.activeElement.name === "scoped-genre-target", "Native focus reaches checkbox card");
	check(scrollY === clippedState.document && query('[role="dialog"]').getBoundingClientRect().top === clippedState.dialog, "Clipped focus leaves outer dialog/document stable");
	return true;
};
