import "../../builder/src/styles.css";
import { useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { createBuilderController } from "../../builder/src/application/index.js";
import { BuilderApp } from "../../builder/src/ui/BuilderApp.jsx";
import { BuilderWorkspace } from "../../builder/src/ui/BuilderWorkspace.jsx";
import { projectFindData } from "./project-find-data.mjs";
import { buildProjectFindIndex, searchProjectFindIndex } from "../../builder/src/ui/project-find.js";
import { createNodeEditorDraft } from "../../builder/src/ui/node-editor.js";

const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
const assert = (value, message) => { if (!value) throw new Error(message); };
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const click = async el => { assert(el, "Missing click target"); el.click(); await frame(); };
let root, controller, facade, opening, expected, stale = null, options = null;
let scrollCalls = [];
let requests = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = (...args) => { requests.push(String(args[0])); return originalFetch(...args); };
const originalScroll = Element.prototype.scrollIntoView;
Element.prototype.scrollIntoView = function (value) { scrollCalls.push({ node: this, value }); return originalScroll.call(this, value); };
function Workspace() {
 const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
 return <BuilderWorkspace controller={facade} state={state} {...options} />;
}
async function mount({ large = false, initial = null, empty = false } = {}) {
 if (root) root.unmount();
 await frame();
 document.documentElement.style.fontSize = "";
 controller = createBuilderController();
 const data = projectFindData(large ? { collections: 20, folders: 20, sources: 10 } : {});
 if (!empty) assert(controller.importValue(data).ok, "Import local authored project");
 stale = null;
 facade = { ...controller, getState: () => stale ?? controller.getState() };
 options = initial?.(controller.getState()) ?? null;
 root = createRoot($("#root"));
 root.render(options ? <Workspace /> : <BuilderApp controller={facade} initialScreen="workspace" />);
 await frame();
 window.scrollTo({ top: 0, behavior: "instant" });
 requests = []; scrollCalls = [];
}
const trigger = () => $('[data-action="open-project-find"]');
const dialog = () => $('[data-find-project-dialog]');
const rows = () => $$(".find-project-result");
const query = async value => {
 const el = $("#find-project-query");
 Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, value);
 el.dispatchEvent(new Event("input", { bubbles: true }));
 await frame();
};
async function open() {
 opening = controller.getState();
 await click(trigger());
 assert(dialog() && document.activeElement === $("#find-project-query"), "Semantic Find autofocuses input");
 assert(dialog().getAttribute("aria-modal") === "true" && dialog().getAttribute("aria-labelledby") === "find-project-title", "Dialog name and semantics");
 assert($(".workspace-underlay").inert && $(".workspace-underlay").getAttribute("aria-hidden") === "true", "Workspace inert and hidden");
 assert(document.body.style.position === "fixed", "Body scroll locked");
 assert(controller.getState() === opening, "Opening preserves exact controller snapshot");
}
function unchanged(before = opening) {
 const after = controller.getState();
 assert(after === before, "Search/cancel retains exact snapshot including project, selection, dirty, revision and diagnostics");
}
function closed() {
 assert(!dialog() && !$(".workspace-underlay").inert && document.body.style.position !== "fixed", "Find closes and releases locks");
}
function measure() {
 const rect = dialog().getBoundingClientRect();
 const input = $("#find-project-query").getBoundingClientRect();
 const close = $(".find-project-heading button").getBoundingClientRect();
 const scroller = $(".find-project-results");
 assert(rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1, "Dialog fits viewport");
 assert(close.top >= 0 && close.bottom <= innerHeight && input.top >= 0 && input.bottom <= innerHeight, "Close and Search reachable");
 assert(dialog().scrollHeight <= dialog().clientHeight + 1, "Dialog is not second scroll owner");
 assert(dialog().scrollWidth <= dialog().clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth + 1, "No horizontal overflow");
 assert(!rows().length || scroller.clientHeight >= 44, "Results retain a usable scroll area");
 assert(close.height >= 44, "Close retains its accessible target");
 const portal = $(".find-project-portal"), backdrop = $(".find-project-backdrop");
 if (innerWidth < 900) {
  assert(rect.width === innerWidth && rect.height === innerHeight, "Phone Find fills the viewport");
  const backgrounds = [portal, dialog()].map(el => getComputedStyle(el).backgroundColor);
  assert(backgrounds.every(color => matchMedia("(forced-colors: active)").matches ? color.startsWith("rgb(") : color === "rgb(7, 24, 33)"), "Phone surfaces stay opaque, including system forced colours");
 } else {
  assert(getComputedStyle(portal).backgroundColor.endsWith(", 0)") && getComputedStyle(backdrop).backgroundColor.endsWith(", 0.68)"), "Desktop retains translucent backdrop, including system forced colours");
  assert(rect.height <= 640 && (!rows().length ? scroller.clientHeight <= 22 : true), "Desktop is content-sized and bounded");
 }
 assert(rows().every(row => row.getBoundingClientRect().height >= 44 && row.scrollWidth <= row.clientWidth + 1), "Full-row targets fit");
 assert(!dialog().querySelector('input[type="checkbox"], input[type="radio"], [aria-pressed]'), "Results are navigation actions");
 return { width: innerWidth, height: innerHeight, dialogHeight: rect.height, rows: rows().length, scrollable: scroller.scrollHeight > scroller.clientHeight, passed: true };
}
window.prepareFindScreen = async (screen, enlarged = false) => {
 await mount({ large: screen === "cap" });
 if (screen === "long") {
  const c = controller.getState().project.collections[0];
  controller.updateNode(c.internalId, { title: "A very long locally named collection ".repeat(4) });
  controller.updateNode(c.folders[0].internalId, { title: "A long parent folder ".repeat(6) });
  controller.updateNode(c.folders[0].sources[0].internalId, { title: "Long source title " + "Unbroken".repeat(30) });
  await frame();
 }
 if (screen === "workspace") return { passed: true };
 if (enlarged) document.documentElement.style.fontSize = "200%";
 await open();
 const queries = { collection: "Same collection", folder: "Same folder", source: "Source 2-3-4", duplicates: "Same source", none: "unmatched phrase", cap: "source", long: "Long source" };
 if (queries[screen]) await query(queries[screen]);
 if (screen === "cap") {
  assert(rows().length === 100 && $(".find-project-status").textContent === "4,000 matches · showing first 100. Refine your search.", "Cap reports real count concisely");
  const scroll = $(".find-project-results"), beforeTop = dialog().getBoundingClientRect().top;
  scroll.scrollTop = scroll.scrollHeight;
  await frame(); unchanged();
  assert(scroll.scrollTop > 0 && dialog().getBoundingClientRect().top === beforeTop && window.scrollY === 0, "Only results scroll; workspace and modal remain stable");
  scroll.scrollTop = 0;
 }
 if (screen === "duplicates") assert(rows()[0].textContent.includes("Position 1 of 8"), "Duplicate context retained");
 if (screen === "none") assert($(".find-project-status").textContent === "No matches in this project.", "Local empty state");
 const result = measure();
 unchanged();
 return result;
};
window.findCancelCheck = async () => { await frame(); closed(); assert(document.activeElement === trigger(), "Cancel restores Find"); unchanged(); return true; };
// Keep the layout viewport intact while delivering the resize/scroll events
// used by the production lifecycle. This simulates keyboard geometry, not iOS.
window.findKeyboardViewport = async (height, top = 0) => {
 const viewport = window.visualViewport;
 Object.defineProperties(viewport, {
  height: { configurable: true, value: height },
  offsetTop: { configurable: true, value: top },
 });
 viewport.dispatchEvent(new Event("resize"));
 viewport.dispatchEvent(new Event("scroll"));
 await frame();
 const portal = $(".find-project-portal"), surface = dialog().getBoundingClientRect();
 const cover = portal.getBoundingClientRect(), input = $("#find-project-query").getBoundingClientRect();
 const heading = $(".find-project-heading").getBoundingClientRect();
 const scroller = $(".find-project-results"), results = scroller.getBoundingClientRect();
 assert(cover.top === 0 && cover.bottom === innerHeight && cover.width === innerWidth, "Opaque portal still covers full layout viewport");
 assert(getComputedStyle(portal).backgroundColor === "rgb(7, 24, 33)" && getComputedStyle(dialog()).backgroundColor === "rgb(7, 24, 33)", "No transparent gap behind keyboard viewport");
 assert($$(".find-project-backdrop").length === 1 && document.body.style.position === "fixed", "One backdrop and existing body lock throughout keyboard transitions");
 assert(Math.abs(surface.top - top) < 1 && Math.abs(surface.height - height) < 1 && surface.width === innerWidth, "Full-screen phone surface follows Visual Viewport");
 assert(heading.top >= top && heading.bottom <= top + height && input.top >= top && input.bottom <= top + height, "Header, Close and Search stay above keyboard");
 assert(results.bottom <= top + height && (!rows().length || scroller.clientHeight >= 44), "Results remain above keyboard");
 assert(dialog().scrollHeight <= dialog().clientHeight + 1 && document.documentElement.scrollWidth <= innerWidth, "One scroll owner and no horizontal overflow");
 if (rows().length > 10) {
  scroller.scrollTop = scroller.scrollHeight;
  await frame();
  assert(scroller.scrollTop > 0 && dialog().getBoundingClientRect().top === surface.top && window.scrollY === 0, "Keyboard result scrolling leaves surface/document stable");
  scroller.scrollTop = 0;
 }
 unchanged();
 return { width: innerWidth, layoutHeight: innerHeight, visualHeight: height, offsetTop: top, resultsHeight: results.height, rows: rows().length, opaque: true, passed: true };
};
window.restoreFindViewport = async () => {
 delete window.visualViewport.height;
 delete window.visualViewport.offsetTop;
 window.visualViewport.dispatchEvent(new Event("resize"));
 window.visualViewport.dispatchEvent(new Event("scroll"));
 await frame();
};
window.closeFind = async () => { await click($(".find-project-heading button")); return window.findCancelCheck(); };
window.findLocalCases = async () => {
 await mount({ empty: true });
 assert(trigger().disabled, "Empty project disables Find");
 await mount();
 assert($$(".workspace-transfer-actions > button").map(el => el.textContent).join("|") === "Find|Import|Export & Send", "Find before Import and Export");
 await open();
 const announcement = dialog().querySelector('[role="status"]');
 await query("Same source");
 assert(announcement.textContent === "Type at least 2 characters to search.", "Status does not announce every immediate keystroke");
 await new Promise(resolve => setTimeout(resolve, 350));
 assert(announcement.textContent === $(".find-project-status").textContent, "Settled status announces after 300ms delay");
 const inputStyle = getComputedStyle($("#find-project-query"));
 assert(inputStyle.outlineStyle !== "none" && parseFloat(inputStyle.outlineWidth) >= 2, "Search keeps its strong focus ring");
 for (const text of ["", "s", "  ", "same", "No matches", ""]) {
  await query(text); unchanged();
  if (text.trim().length < 2) assert(rows().length === 0, "No short query dump");
 }
 await click($(".find-project-heading button")); await window.findCancelCheck();
 // Programmatic underlay actions still encounter the established lock.
 await open();
 const before = controller.getState();
 for (const el of $$('[data-workspace-underlay] button')) el.click();
 await frame();
 assert(dialog() && $$('[role="dialog"]').length === 1 && controller.getState() === before, "Underlay actions cannot open or mutate");
 await click($(".find-project-heading button"));
 // Every duplicate remains independently addressable.
 for (let i = 0; i < 8; i++) {
  await open(); await query("Same source");
  const entry = searchProjectFindIndex(buildProjectFindIndex(controller.getState().project), "Same source").results[i];
  await click(rows()[i]);
  assert(controller.getState().selection.sourceInternalId === entry.internalId, "Duplicate selects exact ID " + i);
  assert(controller.getState().revision === opening.revision && controller.getState().project === opening.project && controller.getState().dirty === opening.dirty, "Duplicate jump selection only");
 }
 // Controlled current-state substitution leaves a rendered hit stale, without
 // weakening any UI lock or changing production subscriptions.
 await open(); await query("Same source");
 const staleHit = searchProjectFindIndex(buildProjectFindIndex(controller.getState().project), "Same source").results[0];
 const current = controller.getState();
 stale = { ...current, project: { ...current.project, collections: current.project.collections.map(c => ({ ...c, folders: c.folders.map(f => ({ ...f, sources: f.sources.filter(s => s.internalId !== staleHit.internalId) })) })) } };
 await click(rows()[0]);
 assert(dialog() && dialog().textContent.includes("That item is no longer available."), "Stale result remains with feedback");
 assert(controller.getState() === current && facade.getState() === stale, "Stale hit causes no selection or diagnostics");
 stale = null;
 await click($(".find-project-heading button"));
 assert(requests.length === 0, "Find makes no remote requests");
 return { passed: true, requests: requests.length, duplicateJumps: 8 };
};
window.prepareFindJump = async (type, large = false, middle = false) => {
 await mount({ large });
 const collections = controller.getState().project.collections;
 const c = collections.at(middle ? Math.floor(collections.length / 2) : -1);
 const f = c.folders.at(middle ? Math.floor(c.folders.length / 2) : -1);
 const s = f.sources.at(middle ? Math.floor(f.sources.length / 2) : -1);
 expected = { type, node: type === "collection" ? c : type === "folder" ? f : s, c, f, middle };
 await open();
 await query(expected.node.editable.title);
 assert(rows().length === 1, "Unique jump target");
 rows()[0].focus();
 scrollCalls = [];
 return true;
};
window.finishFindJump = async (continueNavigation = true) => {
 await frame();
 closed();
 const after = controller.getState();
 const { type, node, c, f } = expected;
 assert(after.selection.collectionInternalId === c.internalId, "Exact parent Collection selected");
 assert(after.selection.folderInternalId === (type === "collection" ? null : f.internalId), "Exact parent Folder selected");
 assert(after.selection.sourceInternalId === (type === "source" ? node.internalId : null), "Exact Source selected");
 assert(after.project === opening.project && after.revision === opening.revision && after.dirty === opening.dirty, "Jump changes selection only");
 assert(JSON.stringify(after.diagnostics) === JSON.stringify(opening.diagnostics), "Jump preserves diagnostic values");
 // Focus is a React effect, so await its outcome rather than assuming two paints
 // imply all passive effects have run during a large-project update.
 let target;
 const focusDeadline = performance.now() + 2500;
 do {
  target = $('[data-node-type="' + type + '"][aria-pressed="true"]');
  if (target && document.activeElement === target) break;
  await frame();
 } while (performance.now() < focusDeadline);
 assert(target && document.activeElement === target, "Exact selected primary card focused: " + JSON.stringify({ type, width: innerWidth, target: target?.outerHTML.slice(0, 220), active: document.activeElement?.outerHTML.slice(0, 220), level: $(".workspace").dataset.mobileLevel }));
 assert($(".workspace").dataset.mobileLevel === type + "s", "Result's own mobile level");
 assert(scrollCalls.some(call => call.node === target && call.value.block === "center" && call.value.behavior === (matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth")), "Find-specific centered scroll retains reduced motion");
 const deadline = performance.now() + 2500;
 let lastTop = null, stableFrames = 0;
 while (performance.now() < deadline) {
  const rect = target.getBoundingClientRect();
  stableFrames = lastTop !== null && Math.abs(rect.top - lastTop) < 0.5 ? stableFrames + 1 : 0;
  lastTop = rect.top;
  if (stableFrames >= 4) break;
  await frame();
 }
 const rect = target.getBoundingClientRect();
 assert(rect.top >= -1 && rect.bottom <= innerHeight + 1 && rect.width > 0 && rect.height > 0, "Exact target scrolled into view");
 let scrollOwner = target.parentElement;
 while (scrollOwner && !(["auto", "scroll"].includes(getComputedStyle(scrollOwner).overflowY) && scrollOwner.scrollHeight > scrollOwner.clientHeight)) scrollOwner = scrollOwner.parentElement;
 scrollOwner ??= document.scrollingElement;
 const atBottom = scrollOwner.scrollHeight - scrollOwner.clientHeight - scrollOwner.scrollTop <= 1;
 const central = Math.abs(rect.top + rect.height / 2 - innerHeight / 2) <= innerHeight / 4;
 assert(central || (!expected.middle && atBottom && rect.bottom <= innerHeight - 64), "Target centers where scroll range permits, otherwise retains lower-edge clearance: " + JSON.stringify({ type, width: innerWidth, top: rect.top, bottom: rect.bottom, height: innerHeight, atBottom }));
 assert(!document.querySelector('[role="dialog"]'), "Jump never opens Edit");
 if (continueNavigation && innerWidth < 900 && type !== "source") {
  await click(target);
  assert($(".workspace").dataset.mobileLevel === (type === "collection" ? "folders" : "sources"), "Ordinary selection clears Find override");
 }
 assert(requests.length === 0, "No remote request during Find jump");
 return { passed: true, type, width: innerWidth, targetTop: rect.top, targetBottom: rect.bottom, central, atBottom, focusAndScroll: true };
};
window.findBusyCases = async () => {
 const modes = [
  state => ({ initialEditorDraft: createNodeEditorDraft(state.project.collections[0]) }),
  () => ({ initialReturnConfirmationOpen: true }),
  () => ({ initialAboutCreditsOpen: true }),
  () => ({ nuvioOpen: true }),
 ];
 for (const initial of modes) {
  await mount({ initial });
  assert(trigger().disabled, "Find disabled while existing workspace interaction is active");
  trigger().click(); await frame(); assert(!dialog(), "Busy Find cannot open");
 }
 await mount();
 for (const action of ["open-workspace-import", "open-export-collections", "open-about-credits", "open-bulk-edit"]) {
  await click($('[data-action="' + action + '"]'));
  assert(trigger().disabled && $(".workspace-underlay").inert, action + " locks Find");
  await mount();
 }
 await click($('[data-action="create-collection"]'));
 assert(trigger().disabled, "Creation flow locks Find");
 await mount();
 const folder = controller.getState().project.collections[0].folders[0];
 controller.selectNode(folder.internalId); await frame();
 await click($('[data-action="add-source"]'));
 assert(trigger().disabled, "Add Source chooser locks Find");
 await mount();
 controller.selectNode(controller.getState().project.collections[0].folders[0].internalId); await frame();
 await click($('[data-action="open-source-actions"]'));
 assert(trigger().disabled, "Action menu blocks Find entry");
 await click($('[data-action="delete-source"]'));
 assert(trigger().disabled, "Deletion confirmation locks Find");
 await mount();
 return { passed: true };
};
window.findPerformance = async () => {
 await mount({ large: true });
 const started = performance.now();
 await open();
 const openMs = performance.now() - started;
 const durations = [];
 for (const value of ["source", "Source 19", "Source 19-19", "unmatched", "source"]) {
  const begin = performance.now(); await query(value); durations.push(performance.now() - begin);
 }
 assert(rows().length === 100 && $(".find-project-status").textContent.startsWith("4,000 matches"), "Large project remains capped");
 unchanged();
 return { indexed: { collections: 20, folders: 400, sources: 4000 }, openMs, maxInputToTwoFramesMs: Math.max(...durations), passed: true };
};
window.findReady = true;
