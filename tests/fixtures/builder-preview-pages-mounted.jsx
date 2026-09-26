import { act } from "react";
import { createTmdbListProvider } from "../../builder/src/source-add/tmdb-list-provider.js";

// Owner-authorized local component mechanics only (#226). Deliberately synthetic
// rows and intercepted unit poster paths; never evidence of live TMDB acceptance.
export async function runPreviewPagesScenario(helpers, { deep = false, posterless = false }) {
 const { createController, importSources, openEdit, withMountedEditor, clickAndSettle, afterCommittedEffects, setInputValue, serializedValue, titlePreviewGeometry, waitForMountedCondition } = helpers;
 const controller = createController();
 const folder = importSources(controller, [{ provider: "tmdb", tmdbSourceType: "LIST", tmdbId: 9, title: "Local paging mechanics", sortBy: "original", mediaType: "MOVIE", filters: {}, ownerExtra: { keep: true } }]);
 const opened = openEdit(controller, folder.sources[0]), before = serializedValue(controller), revision = controller.getState().revision;
 const calls = []; let failedOnce = false, hold = false, release;
 const provider = createTmdbListProvider({ baseUrl: "https://unit.invalid", fetchImpl: async (input, { signal }) => {
  const page = Number(new URL(input).searchParams.get("page")); calls.push(page);
  if (hold) await new Promise((resolve) => { release = resolve; signal.addEventListener("abort", resolve, { once: true }); });
  if (page === 2 && !failedOnce) { failedOnce = true; return new Response("", { status: 500 }); }
  return new Response(JSON.stringify({ id: 9, item_count: 124, page, total_pages: 7, total_results: 124, items: Array.from({ length: 20 }, (_, i) => {
   const id = (page - 1) * 20 + i + 1;
   return { id: i === 1 ? 1 : id, media_type: "movie", title: `Local unit row ${id}`, poster_path: posterless || i === 0 ? null : `/preview-unit-${id}.svg`, vote_average: i / 2, vote_count: i, release_date: "2020-01-01" };
  }) }), { headers: { "content-type": "application/json" } });
 } });
 const check = (value, message) => { if (!value) throw new Error("Local Preview paging: " + message); };
 const settle = async () => act(afterCommittedEffects);
 const evidence = { width: innerWidth, height: innerHeight, deep, posterless, localOnly: true };
 return withMountedEditor({ controller, ...opened, listProvider: provider, run: async ({ getUpdateCalls }) => {
  const editor = document.querySelector(".source-edit-dialog");
  const name = editor.querySelector("#source-edit-title-input");
  await act(async () => { setInputValue(name, "Unsaved local Preview heading"); await afterCommittedEffects(); });
  const trigger = [...editor.querySelectorAll("button")].find((button) => button.textContent === "Preview titles");
  const modal = () => document.querySelector(".source-edit-preview-modal");
  const body = () => modal().querySelector(".source-sort-preview-content");
  const images = () => [...modal().querySelectorAll(".poster-only-preview-grid img")];
  const more = () => modal().querySelector(".title-preview-more button");
  const fallbackVisible = () => more() && getComputedStyle(more()).clip === "auto" && more().getBoundingClientRect().height >= 44;
  async function open() { await clickAndSettle(trigger); await waitForMountedCondition(() => modal()?.querySelector(".source-title-preview-summary"), { label: "local title status" }); }
  const status = () => modal().querySelector(".source-title-preview-summary").textContent;
  const posterIds = () => images().map((image) => Number(image.src.match(/preview-unit-(\d+)/)[1]));
  const expectedIds = (count) => Array.from({ length: count }, (_, i) => i + 1).filter((id) => ![1,2].includes(id % 20));
  function checkOrder(count, failed = []) {
   check(JSON.stringify(posterIds()) === JSON.stringify(expectedIds(count).filter((id) => !failed.includes(id))), "all already-loaded posters compact in source order");
  }
  async function scroll(kind = "wheel") {
   await act(async () => {
    body().scrollTop = 0; body().dispatchEvent(new Event("scroll", { bubbles: true }));
    body().focus({ preventScroll: true });
    if (kind === "key") body().dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    else if (kind === "touch") body().dispatchEvent(new Event("touchmove", { bubbles: true }));
    else body().dispatchEvent(new WheelEvent("wheel", { deltaY: 800, bubbles: true }));
    body().scrollTop = body().scrollHeight; body().dispatchEvent(new Event("scroll", { bubbles: true }));
    await afterCommittedEffects();
   });
  }
  await open();
  check(calls.join() === "1", "only page one on open");
  check(modal().querySelector("h3").textContent === name.value, "current unsaved heading");
  check(["header", ".source-edit-scroll", "footer"].every((selector) => editor.querySelector(selector)?.inert), "underlying editor inert");
  check(document.activeElement === modal().querySelector("header button"), "initial Close focus");
  if (posterless) {
   await settle();
   check(images().length === 0 && status().startsWith("No posters available.") && !modal().querySelector('[role="alert"]'), "ordinary posterless metadata is a neutral empty state");
   check(calls.join() === "1" && more().textContent === "Load more titles", "zero posters do not automatically request another page");
   await waitForMountedCondition(fallbackVisible, { label: "visible fallback for unscrollable posters" });
   await clickAndSettle(more());
   await waitForMountedCondition(() => more()?.textContent === "Retry", { label: "manual fallback page failure" });
   check(fallbackVisible() && calls.join() === "1,2", "unscrollable fallback works and Retry remains visible");
   await clickAndSettle(modal().querySelector("header button"));
   check(serializedValue(controller) === before && getUpdateCalls() === 0, "posterless Preview does not save");
   return { ...evidence, requests: calls, neutralEmpty: true, noMutation: true, focusRestored: document.activeElement === trigger };
  }
  evidence.geometry = titlePreviewGeometry(modal(), modal().querySelector(".poster-only-preview-grid"));
  check(evidence.geometry.withinViewport && evidence.geometry.closeReachable && evidence.geometry.pageNoHorizontalOverflow && evidence.geometry.gridNoHorizontalScroll && evidence.geometry.activeScrollOwnerCount === 1, "one bounded body scroll owner");
  check(status() === "Preview shows up to 100 titles. · List order", "neutral status despite missing metadata and repeat");
  check(!fallbackVisible() && more().tabIndex === 0, "scrollable Preview hides the fallback visually but keeps keyboard access");
  checkOrder(20);
  await act(async () => { images()[0].dispatchEvent(new Event("error")); await afterCommittedEffects(); });
  checkOrder(20, [3]);
  check(calls.join() === "1" && !modal().querySelector('[role="alert"]') && !/unavailable|posters from/.test(status()), "failed image reflows without warning or extra request");
  const initialCount = images().length;
  await act(async () => { body().scrollTop = body().scrollHeight; body().dispatchEvent(new Event("scroll", { bubbles: true })); window.dispatchEvent(new Event("resize")); await afterCommittedEffects(); });
  check(calls.join() === "1", "programmatic scroll and resize must not load");
  if (deep) {
   hold = true; await scroll(); check(calls.join() === "1,2", "wheel starts just page two");
   check(!fallbackVisible(), "auto-paging never reveals a Load more action while pending");
   await scroll(); check(calls.join() === "1,2" && more().getAttribute("aria-disabled") === "true", "synchronous pending guard");
   await act(async () => { hold = false; release(); await afterCommittedEffects(); });
   await waitForMountedCondition(() => more()?.textContent === "Retry", { label: "failed page Retry" });
   check(images().length === initialCount, "failed page retains the prefix");
   check(fallbackVisible(), "Retry is visibly available");
   check(modal().querySelector('[role="alert"]')?.textContent.includes("Couldn’t load more titles"), "genuine next-page failure remains distinct and actionable");
   await scroll("touch"); check(calls.join() === "1,2", "failure requires explicit Retry");
   more().focus({ preventScroll: true }); const top = body().scrollTop;
   await clickAndSettle(more());
   check(calls.join() === "1,2,2" && images().length > initialCount, "Retry fetches just page two");
   checkOrder(40, [3]);
   check(status() === "Preview shows up to 100 titles. · List order", "forty source titles represented despite fewer cards");
   check(document.activeElement === more() && body().scrollTop === top, `append keeps focus and scroll (${document.activeElement?.outerHTML.slice(0, 100)}, ${top} → ${body().scrollTop})`);
   await settle(); check(calls.join() === "1,2,2", "append does not drain");
   hold = true; await scroll("key"); check(calls.at(-1) === 3, "keyboard gesture requests page three");
   await clickAndSettle(modal().querySelector("header button"));
   await act(async () => { hold = false; release(); await afterCommittedEffects(); });
   check(!modal() && document.activeElement === trigger, "close restores focus and discards pending page");
   await open(); check(calls.join() === "1,2,2,3" && body().scrollTop === 0, "reopen cached prefix at top");
   checkOrder(40);
   await scroll("touch"); check(calls.join() === "1,2,2,3,3", "cancelled page three is requested again");
   check(!fallbackVisible(), "successful automatic append keeps Load more visually hidden");
   const keyboardClose = modal().querySelector("header button"); keyboardClose.focus();
   await act(async () => { keyboardClose.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true })); await afterCommittedEffects(); });
   check(document.activeElement === more() && fallbackVisible(), `Tab reaches and reveals the accessible manual fallback (${document.activeElement?.outerHTML.slice(0, 240)}, clip ${getComputedStyle(more()).clip}, height ${more().getBoundingClientRect().height})`);
   await clickAndSettle(more());
   check(document.activeElement === more() && fallbackVisible(), "manual append retains focused fallback");
   await clickAndSettle(more());
   check(calls.join() === "1,2,2,3,3,4,5" && !more(), "first 100 positions, no action or page six");
   const end = modal().querySelector(".title-preview-end");
   check(end?.tagName === "P" && end.textContent === "End of preview" && !end.hasAttribute("tabindex") && end.getAttribute("role") === "status", "end marker is a non-interactive paragraph");
   check(document.activeElement === body(), "terminal manual paging returns focus to the scroll body");
   const endStyle = getComputedStyle(end);
   check(endStyle.borderTopWidth === "0px" && endStyle.backgroundColor === "rgba(0, 0, 0, 0)" && endStyle.cursor !== "pointer" && endStyle.outlineStyle === "none", "end marker has no button or focus styling");
   evidence.endMarker = { tag: end.tagName, text: end.textContent, color: endStyle.color, border: endStyle.borderTopWidth, background: endStyle.backgroundColor, cursor: endStyle.cursor };
   check(images().length < 100 && status() === "Preview shows up to 100 titles. · List order", "poster gaps and duplicates do not cause replacement requests");
   checkOrder(100);
   const cappedCalls = calls.length;
   await act(async () => { images()[0].dispatchEvent(new Event("error")); window.dispatchEvent(new Event("resize")); await afterCommittedEffects(); });
   await scroll(); check(calls.length === cappedCalls, "image failure and later scrolling stay capped");
   checkOrder(100, [3]);
   const close = modal().querySelector("header button"); close.focus();
   await act(async () => { close.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true })); await afterCommittedEffects(); });
   check(modal().contains(document.activeElement), "focus remains contained");
   evidence.posterCount = images().length;
   if (globalThis.capture204Preview) await new Promise((resolve) => { window.__finish204Capture = resolve; capture204Preview(JSON.stringify({ name: `preview-226-end-${innerWidth}-${innerHeight}` })); });
   await act(async () => { for (const image of images()) image.dispatchEvent(new Event("error")); await afterCommittedEffects(); });
   check(images().length === 0 && status().startsWith("No posters available.") && calls.length === cappedCalls, "zero usable images gives one neutral empty state without replacement requests");
  }
  if (globalThis.capture204Preview) await new Promise((resolve) => { window.__finish204Capture = resolve; capture204Preview(JSON.stringify({ name: `preview-226-local-${innerWidth}-${innerHeight}` })); });
  await act(async () => { modal().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await afterCommittedEffects(); });
  check(!modal() && document.activeElement === trigger, "Escape and focus restoration");
  check(serializedValue(controller) === before && controller.getState().revision === revision && getUpdateCalls() === 0, "Preview never saves, migrates or mutates");
  return { ...evidence, requests: calls, noMutation: true, focusRestored: true };
 } });
}
