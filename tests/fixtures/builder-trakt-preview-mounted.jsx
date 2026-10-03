import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { createReviewClient, reviewList, seed } from "./builder-trakt-creation-mounted.jsx";
import { previewJson, reviewSample, reviewSourceOrders } from "./builder-trakt-preview-data.js";
import { createSourceEditSession, saveSourceEdit } from "../../builder/src/source-edit/index.js";
import { SourceEditorDialog } from "../../builder/src/ui/SourceEditorDialog.jsx";

export async function runTraktPreviewScenario(helpers, view) {
 const { createController, MountedWorkspace, clickAndSettle, afterCommittedEffects, setInputValue } = helpers;
 const ensure = (ok, text) => { if (!ok) throw Error("Trakt C " + innerWidth + "x" + innerHeight + ": " + text); };
 const settle = () => act(async () => { await afterCommittedEffects(); });
 const wait = async predicate => { for (let i = 0; i < 150 && !predicate(); i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); await afterCommittedEffects(); }); ensure(predicate(), "timed condition " + predicate.toString() + " — " + modal()?.textContent?.slice(0,300)); };
 const key = key => act(async () => { await new Promise(resolve => { window.__finish230Key = resolve; window.pressGuidedPresentationKey(JSON.stringify({ key })); }); await afterCommittedEffects(); });
 const screenshot = async suffix => { if (window.capture204Preview && [393, 900, 1280].includes(view.width)) await new Promise(resolve => { window.__finish204Capture = resolve; window.capture204Preview(JSON.stringify({ name: "trakt-c-" + view.width + "-" + view.height + (view.largeText ? "-large" : view.forcedColors ? "-forced" : "") + "-" + suffix })); }); };
 const button = (text, root = document) => [...root.querySelectorAll("button")].find(node => node.textContent.trim() === text);
 const click = async text => { const node = button(text); ensure(node && !node.disabled, "button " + text); await clickAndSettle(node); };
 const modal = () => document.querySelector(".source-edit-preview-modal");
 const posters = () => [...modal().querySelectorAll(".poster-only-preview-grid img")];
 const card = id => document.querySelector('[data-trakt-result-id="' + id + '"]');
 const trigger = id => card(id).querySelector(".trakt-preview-action");
 const selected = () => [...document.querySelectorAll(".trakt-result input:checked")].map(input => Number(input.closest("[data-trakt-result-id]").dataset.traktResultId));
 const mediaCalls = client => client.calls.filter(call => call.kind === "media").length;
 const originalFetch = window.fetch, requests = [];
 window.fetch = input => { requests.push(String(input)); throw Error("Uninjected external request"); };
 if (view.largeText) document.documentElement.style.fontSize = "22px";
 const controller = createController(), destination = seed(controller, "new-collection"), client = createReviewClient();
 const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
 const initialProject = controller.getState().project;
 const geometry = dialog => {
  const b = dialog.getBoundingClientRect();
  ensure(b.left >= -1 && b.right <= innerWidth + 1 && b.top >= -1 && b.bottom <= innerHeight + 1, "dialog fits viewport");
  ensure(dialog.scrollWidth <= dialog.clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth + 1, "no horizontal overflow");
  const scrollers = [dialog, ...dialog.querySelectorAll("*")].filter(node => ["auto", "scroll"].includes(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight + 1);
  ensure(scrollers.length <= 1, "one internal scroll owner");
  const grid = dialog.querySelector(".poster-only-preview-grid");
  if (grid) {
   const style = getComputedStyle(grid), image = grid.querySelector("img").getBoundingClientRect();
   ensure(style.gridTemplateColumns.split(" ").length === (innerWidth <= 620 ? 3 : 5), "shared poster column geometry");
   ensure(Math.abs(image.height / image.width - 1.5) < .01, "shared two-by-three poster ratio");
   ensure(grid.scrollWidth <= grid.clientWidth + 1, "grid has no horizontal scrolling");
  }
 };
 const open = async id => { const target = trigger(id); target.focus({ preventScroll: true }); await key("Enter"); ensure(modal(), "explicit Preview opens"); return target; };
 const close = async target => { await key("Escape"); ensure(!modal() && document.activeElement === target, "Escape restores exact Preview trigger"); };
 try {
  await act(async () => { root.render(createElement(MountedWorkspace, { controller, traktClient: client, traktPosterProvider: client.posterProvider, traktPosterUrl: client.posterUrlForPath,
   initialCreationSession: { scope: "new-collection", destinationCollectionInternalId: destination.c } })); await afterCommittedEffects(); });
  await clickAndSettle(document.querySelector('[data-creation-option="trakt-lists"]'));
  await click("Popular Lists");
  ensure(client.itemRequests.length === 0 && client.posterRequests.length === 0 && mediaCalls(client) === 0, "discovery/render makes no sample/media/poster request");
  const outer = document.querySelector(".trakt-list-form .add-source-scroll"), parent = outer.closest('[role="dialog"]');
  for (const id of [101, 102, 110]) {
   const row = card(id), preview = trigger(id), description = row.querySelector(".trakt-description-action");
   ensure(!preview.closest("label") && !preview.disabled && !row.querySelector("input").checked, "Preview available before selection outside label");
   ensure(preview.textContent === "Preview titles" && preview.classList.contains("source-preview-button") && getComputedStyle(preview).borderTopStyle === "solid", "shared outlined Preview titles action");
   ensure(preview.getBoundingClientRect().height >= 44 && preview.type === "button" && preview.getAttribute("aria-haspopup") === "dialog", "practical semantic button");
   const pb = preview.getBoundingClientRect(), footer = preview.parentElement.getBoundingClientRect();
   ensure(Math.abs(pb.right - footer.right) < 1 && row.scrollWidth <= row.clientWidth + 1, "Preview right-aligned without overflow");
   if (description) { const db = description.getBoundingClientRect(); ensure(Math.abs(db.left - footer.left) < 1 && (db.right <= pb.left || db.bottom <= pb.top), "description left without overlap"); }
  }
  ensure(trigger(108).disabled, "explicitly unavailable disables Preview");
  trigger(101).dispatchEvent(new MouseEvent("mouseover", { bubbles: true })); trigger(101).focus({ preventScroll: true }); outer.scrollTop = 30; await settle();
  await clickAndSettle(card(101).querySelector(".trakt-description-action")); await key("Escape");
  ensure(client.itemRequests.length === 0 && client.posterRequests.length === 0, "hover/focus/scroll/description make no requests");
  await screenshot("cards");
  let releaseItems, releasePoster;
  client.itemOverrides.set(101, (init, reply) => new Promise(resolve => { releaseItems = () => resolve(reply()); }));
  client.posterOverrides.set(1, (init, reply) => new Promise(resolve => { releasePoster = () => resolve(reply()); }));
  const firstTrigger = await open(101), scrollTop = outer.scrollTop, pageTop = scrollY;
  ensure(modal().textContent.includes("Preparing preview…") && client.posterRequests.length === 0, "loading precedes enrichment");
  ensure(parent.inert && parent.getAttribute("aria-hidden") === "true", "underlying dialog inert and hidden");
  await act(async () => { releaseItems(); client.itemOverrides.delete(101); await afterCommittedEffects(); });
  await wait(() => typeof releasePoster === "function");
  ensure(modal().textContent.includes("Preparing preview…") && !modal().querySelector("img"), "ordinary loading while artwork resolves; no text rows");
  ensure(modal().querySelector("h3").textContent === "Movie-only list" && modal().querySelector(".panel-kicker").textContent === "Title preview", "shared heading");
  await wait(() => typeof releasePoster === "function"); await act(async () => { releasePoster(); client.posterOverrides.delete(1); await afterCommittedEffects(); });
  await wait(() => modal()?.querySelectorAll("img").length > 0);
  ensure(reviewSample(101).items.length === 50 && posters().length === 43, "50 supplied positions, duplicate/missing/failed posters omitted");
  ensure(posters().every(img => img.loading === "lazy") && modal().querySelector(".poster-only-preview-grid").textContent.trim() === "", "shared lazy posters with no per-item text");
  ensure(!/A deterministic|Sample title|Season 0|Episode|Title unavailable/.test(modal().textContent), "no item metadata or fallback rows");
  ensure(client.posterRequests.length === 45 && client.posterRequests.length <= 50, "one bounded lookup per unique identity");
  const expectedIds = [1, 2, ...Array.from({ length: 41 }, (_, index) => index + 12)];
  ensure(posters().map(img => Number(decodeURIComponent(img.src).match(/LOCAL (\d+)/)?.[1])).join(",") === expectedIds.join(","), "source order after poster identity dedupe");
  ensure(client.posterRequests.filter(r => r.url.endsWith("/movie/1")).length === 1 && client.posterRequests.filter(r => r.url.endsWith("/tv/2")).length === 1, "duplicate artwork identities dedupe");
  const image = modal().querySelector("img"), posterCount = posters().length;
  await act(async () => { image.dispatchEvent(new Event("error")); await afterCommittedEffects(); });
  ensure(!image.isConnected && posters().length === posterCount - 1, "failed image disappears without fallback text");
  geometry(modal());
  const closeButton = button("Close", modal()), body = modal().querySelector(".source-sort-preview-content");
  closeButton.focus({ preventScroll: true }); await key("Tab"); ensure(document.activeElement === body, "Tab reaches scroll body");
  await key("Tab"); ensure(document.activeElement === closeButton, "Tab trapped");
  await key("Shift+Tab"); ensure(document.activeElement === body, "Shift+Tab trapped");
  const beforeScrollRequests = client.itemRequests.length;
  body.dispatchEvent(new WheelEvent("wheel", { deltaY: 300, bubbles: true })); body.scrollTop = body.scrollHeight; body.dispatchEvent(new Event("scroll", { bubbles: true })); await settle();
  ensure(client.itemRequests.length === beforeScrollRequests, "scroll never requests another Trakt page");
  ensure(outer.scrollTop === scrollTop && scrollY === pageTop, "scroll keeps outer modal/document stable");
  ensure(!modal().querySelector('[data-load-more]') && !button("Load more titles", modal()) && !modal().querySelector(".title-preview-more"), "no paging control");
  await screenshot("preview");
  await close(firstTrigger);
  ensure(!parent.inert && !parent.hasAttribute("aria-hidden") && selected().length === 0 && mediaCalls(client) === 0 && controller.getState().project === initialProject, "Preview success makes no selection/media/project mutation");
  const itemCount = client.itemRequests.length;
  await open(101); await wait(() => modal()?.textContent.includes("Preview shows up to 50 titles."));
  ensure(client.itemRequests.length === itemCount, "cache reopen no new transport");
  await clickAndSettle(button("Close", modal())); ensure(document.activeElement === firstTrigger, "Close button restores trigger");

  for (const id of [104, 105, 106, 107, 109, 110]) {
   const t = await open(id);
   await wait(() => !modal()?.textContent.includes("Preparing preview…"));
   if (id === 104) ensure(modal().textContent.includes("No titles to preview."), "empty");
   if (id === 105) { ensure(modal().textContent.includes("This title preview could not be prepared.") && button("Retry", modal()), "retryable error"); await clickAndSettle(button("Retry", modal())); await wait(() => modal()?.textContent.includes("Preview shows up to 50 titles.")); }
   if (id === 106) ensure(modal().textContent.includes("This Trakt List is unavailable.") && selected().length === 0 && !button("Retry", modal()), "unselected unavailable never selects");
   if (id === 107) {
    await wait(() => posters().length === 50); ensure(posters().every(img => img.loading === "lazy"), "all 50 posters lazy");
    geometry(modal()); await screenshot("fifty-posters");
    await act(async () => { posters().forEach(img => img.dispatchEvent(new Event("error"))); await afterCommittedEffects(); });
    ensure(!posters().length && modal().textContent.includes("No posters available."), "all image failures use shared empty-poster state");
   }
   if (id === 109) ensure(!posters().length && modal().textContent.includes("No posters available."), "missing identities use shared empty-poster state");
   if (id === 110) { geometry(modal()); await screenshot("long-name"); }
   await close(t);
  }

  // Readiness revocation uses the existing guarded selected-list path.
  await clickAndSettle(card(112).querySelector("input")); await clickAndSettle(card(101).querySelector("input"));
  ensure(client.itemRequests.length === 8, "selection makes no sample request");
  const beforeSelectedPreview = selected().join(","), mediaBeforeSelectedPreview = mediaCalls(client);
  const selectedTrigger = await open(101); await wait(() => modal()?.textContent.includes("Preview shows up to 50 titles.")); await close(selectedTrigger);
  ensure(selected().join(",") === beforeSelectedPreview && mediaCalls(client) === mediaBeforeSelectedPreview, "successful selected Preview preserves selection and media state");
  const mediaPreviewBefore = client.itemRequests.length;
  await click("Continue to Media");
  ensure(client.itemRequests.length === mediaPreviewBefore, "Media entry does not request Preview");
  const countRow = document.querySelector('[data-trakt-media-id="112"]'), countTrigger = countRow.querySelector(".trakt-count-info");
  ensure(countRow.querySelector(".trakt-list-total").textContent === "215 items in this Trakt List" && countRow.querySelector(".trakt-nuvio-counts p").textContent === "In Nuvio: 46 Movies · 3 Series", "authoritative Trakt and Nuvio counts distinct");
  ensure(countTrigger.type === "button" && countTrigger.getAttribute("aria-label") === "Why can these numbers be different?" && countTrigger.getAttribute("aria-haspopup") === "dialog", "quiet count info semantics");
  const countBounds = countTrigger.getBoundingClientRect(), textBounds = countRow.querySelector(".trakt-nuvio-counts p").getBoundingClientRect();
  ensure(countBounds.width >= 44 && countBounds.height >= 44 && textBounds.right <= countBounds.left && countRow.scrollWidth <= countRow.clientWidth + 1, "count info touch target and no collision/overflow");
  ensure(!document.querySelector('[data-trakt-media-id="101"] .trakt-count-info'), "matching counts omit info");
  const countState = () => JSON.stringify({ calls: client.calls, items: client.itemRequests, posters: client.posterRequests, media: [...document.querySelectorAll('[data-trakt-media-id]')].map(row => [row.dataset.traktMediaId, row.querySelector('input:checked').value]) });
  const beforeCountInfo = countState();
  countTrigger.focus({ preventScroll: true }); await key("Enter");
  let countDialog = document.querySelector(".trakt-count-info-modal");
  ensure(countDialog && !modal() && parent.inert && parent.getAttribute("aria-hidden") === "true", "keyboard opens independent info and makes parent inert");
  ensure(countDialog.querySelector("h3").textContent === "Why can the numbers be different?", "exact count heading");
  ensure([...countDialog.querySelectorAll("li")].map(li => li.textContent).join("|") === "Movies — whole movies|Series — whole TV shows|Seasons — one season from a TV show|Episodes — one episode from a TV show", "exact plain-language definitions");
  ensure(countDialog.textContent.includes("Individual Seasons and Episodes aren't added as separate collection items.") && countDialog.textContent.includes("You can still open a Series in Nuvio and watch its seasons and episodes normally.") && !/166|missing|API|endpoint|enum|resolver/.test(countDialog.textContent), "count explanation invents no remainder or implementation jargon");
  const countClose = button("Close", countDialog), countBody = countDialog.querySelector('[role="region"]');
  ensure(document.activeElement === countClose, "count close receives initial focus");
  await key("Tab"); ensure(document.activeElement === countBody, "count info scroll region reachable");
  await key("Tab"); ensure(document.activeElement === countClose, "count focus trapped");
  await key("Shift+Tab"); ensure(document.activeElement === countBody, "count reverse focus trapped");
  geometry(countDialog); await screenshot("count-info");
  await key("Escape");
  ensure(!document.querySelector(".trakt-count-info-modal") && document.activeElement === countTrigger && !parent.inert && !parent.hasAttribute("aria-hidden"), "count Escape restores exact trigger and parent");
  ensure(countTrigger.matches(":focus-visible") && getComputedStyle(countTrigger).outlineStyle !== "none", "count keyboard focus visible");
  await screenshot("media-counts");
  await clickAndSettle(countTrigger); countDialog = document.querySelector(".trakt-count-info-modal");
  ensure(countDialog, "pointer/touch click opens count info");
  await clickAndSettle(button("Close", countDialog));
  ensure(!document.querySelector(".trakt-count-info-modal") && document.activeElement === countTrigger && !parent.inert, "count Close restores exact trigger");
  ensure(countState() === beforeCountInfo && controller.getState().project === initialProject && requests.length === 0 && !modal(), "count info makes zero requests and no selection/media/project/Preview mutation");
  const note = document.querySelectorAll(".trakt-initial-sort-note");
  ensure(note.length === 1 && note[0].textContent === "New Trakt sources use List order · Ascending. You can change the sorting later by editing the Source.", "one exact quiet default-sort note");
  const mediaRow = document.querySelector('[data-trakt-media-id="101"]'), mediaPreview = mediaRow.querySelector(".trakt-media-preview");
  ensure(mediaPreview.classList.contains("source-preview-button") && mediaPreview.getAttribute("aria-haspopup") === "dialog" && mediaPreview.type === "button", "standard Media Preview action");
  await clickAndSettle(mediaRow.querySelector('input[value="series"]'));
  ensure(client.itemRequests.length === mediaPreviewBefore, "media override does not request Preview");
  const mediaBeforeClick = mediaCalls(client);
  const configBounds = mediaRow.querySelector(".trakt-media-config").getBoundingClientRect(), previewBounds = mediaPreview.getBoundingClientRect();
  ensure(mediaRow.scrollWidth <= mediaRow.clientWidth + 1 && previewBounds.height >= 44, "Media Preview tap target and wrapping");
  if (innerWidth >= 899) {
   const pills = mediaRow.querySelector(".semantic-sort-choices").getBoundingClientRect();
   ensure(previewBounds.left >= pills.right && Math.abs(previewBounds.right - configBounds.right) < 1, "Media Preview occupies the reserved right region");
  }
  geometry(parent); await screenshot("media-preview-action");
  await clickAndSettle(mediaPreview); await wait(() => modal()?.textContent.includes("Preview shows up to 50 titles."));
  ensure(client.itemRequests.length === mediaPreviewBefore && mediaCalls(client) === mediaBeforeClick, "explicit Media Preview reuses combined list cache without media requests");
  await close(mediaPreview);
  ensure(controller.getState().project === initialProject, "Media Preview does not mutate project");
  await clickAndSettle(document.querySelector('[data-action="back-trakt"]'));
  const beforeMedia = mediaCalls(client);
  client.itemOverrides.set(112, () => previewJson({ apiVersion: 1, error: { code: "LIST_NOT_FOUND" } }, 404));
  const unavailableTrigger = await open(112); await wait(() => modal()?.textContent.includes("This Trakt List is unavailable."));
  await close(unavailableTrigger);
  ensure(selected().join(",") === "101,112" && mediaCalls(client) === beforeMedia, "unavailable neither removes/reorders selection nor checks media");
  await click("Continue to Media");
  const mediaRows = [...document.querySelectorAll("[data-trakt-media-id]")];
  ensure(mediaRows.map(row => row.dataset.traktMediaId).join(",") === "112,101", "retained selection order");
  ensure(mediaRows[0].textContent.includes("Unavailable") && mediaRows[0].querySelector('input[value="both"]').disabled && button("Continue to Names").disabled, "stale readiness revoked");
  ensure(mediaCalls(client) === beforeMedia, "unavailable does not restart media detection");
  await clickAndSettle(document.querySelector('[data-action="back-trakt"]'));

  let late; client.itemOverrides.set(113, (init, reply) => new Promise(resolve => { late = () => resolve(reply()); }));
  const lateTrigger = await open(113); const pending = client.itemRequests.at(-1); await close(lateTrigger);
  ensure(pending.signal.aborted, "close aborts sample");
  const otherTrigger = await open(114); await wait(() => modal()?.textContent.includes("Preview shows up to 50 titles."));
  await act(async () => { late(); await afterCommittedEffects(); });
  ensure(modal().querySelector("h3").textContent === reviewList(114).name, "late A cannot replace B");
  await close(otherTrigger);

  let latePoster;
  client.posterOverrides.set(130, (init, reply) => new Promise(resolve => { latePoster = () => resolve(reply()); }));
  const beforePosters = client.posterRequests.length, posterTrigger = await open(117);
  await wait(() => typeof latePoster === "function");
  ensure(!modal().querySelector("img"), "artwork pending without fallback rows");
  await close(posterTrigger);
  const canceledPosters = client.posterRequests.slice(beforePosters);
  ensure(canceledPosters.length <= 3 && canceledPosters.every(request => request.signal.aborted), "close aborts active posters and cancels queued batch");
  await act(async () => { latePoster(); await afterCommittedEffects(); });
  ensure(client.posterRequests.length === beforePosters + canceledPosters.length && !modal(), "late artwork cannot reopen or continue closed Preview");

  client.itemOverrides.set(115, () => previewJson({ apiVersion: 1, error: { code: "UPSTREAM_RATE_LIMIT" } }, 429, { "Retry-After": "3" }));
  const cooldownTrigger = await open(115); await wait(() => modal()?.textContent.includes("Trakt requests are paused."));
  ensure(!button("Retry", modal()), "cooldown hides retry");
  const cooldownRequests = client.itemRequests.length; await close(cooldownTrigger);
  const cachedTrigger = await open(114); await wait(() => modal()?.textContent.includes("Preview shows up to 50 titles."));
  ensure(client.itemRequests.length === cooldownRequests, "cached success usable during cooldown"); await close(cachedTrigger);
  await open(115); await wait(() => modal()?.textContent.includes("Trakt requests are paused."));
  ensure(client.itemRequests.length === cooldownRequests, "new request blocked by cooldown");
  await wait(() => button("Retry", modal())); ensure(client.itemRequests.length === cooldownRequests, "no automatic retry");
  client.itemOverrides.delete(115); await clickAndSettle(button("Retry", modal())); await wait(() => modal()?.textContent.includes("Preview shows up to 50 titles.")); await close(cooldownTrigger);
  ensure(client.itemRequests.every(r => new URL(r.url).search === "?page=1&limit=50"), "only bounded page one");
  ensure(controller.getState().project === initialProject, "all preview mechanics leave project unchanged");
  await clickAndSettle(parent.querySelector('[data-action="close-creation"]') ?? [...parent.querySelectorAll("button")].find(b => b.getAttribute("aria-label")?.startsWith("Close")));

  const openEdit = async () => { await clickAndSettle(host.querySelector('[data-action="open-source-actions"]')); await clickAndSettle(document.querySelector('[data-actions-menu="source"]:not([hidden]) [data-action="edit-source"]')); return document.querySelector('[data-source-edit-modal]'); };
  let editor = await openEdit();
  const value = name => editor.querySelector('input[name="' + name + '"]:checked')?.value;
  ensure([...editor.querySelectorAll('input[name="trakt-edit-sort"]')].map(input => input.value).join(",") === "rank,added,title,released,runtime,popularity,percentage,votes", "eight exact sort values");
  ensure([...editor.querySelectorAll('input[name="trakt-edit-direction"]')].map(input => input.value).join(",") === "asc,desc", "two directions");
  ensure(value("trakt-edit-sort") === "rank" && value("trakt-edit-direction") === "asc", "opens saved values");
  ensure(editor.textContent.includes("Update this Trakt List source name and sorting.") && editor.querySelector('[data-action="preview-source-edit"]') && !button("Reset", editor), "shared Source Edit Preview and no Reset");

  const checkDraftPreview = async (editDialog, mediaType, sortBy, sortHow) => {
   const requestsBefore = client.itemRequests.length, savedBefore = JSON.stringify(controller.serializeProject().value);
   await clickAndSettle(editDialog.querySelector(`input[name="trakt-edit-sort"][value="${sortBy}"]`));
   await clickAndSettle(editDialog.querySelector(`input[name="trakt-edit-direction"][value="${sortHow}"]`));
   ensure(client.itemRequests.length === requestsBefore, "sort/direction changes make zero requests");
   const action = editDialog.querySelector('[data-action="preview-source-edit"]');
   ensure(action.parentElement.classList.contains("source-edit-preview-action") && !action.disabled, "normal shared Source Edit Preview placement");
   await clickAndSettle(action); await wait(() => modal()?.querySelectorAll("img").length > 0);
   const context = new URL(client.itemRequests.at(-1).url).searchParams;
   ensure(context.get("type") === (mediaType === "TV" ? "show" : "movie") && context.get("sort_by") === sortBy && context.get("sort_how") === sortHow && context.get("page") === "1" && context.get("limit") === "50", "request uses exact current unsaved media-fixed draft");
   const expected = [...reviewSourceOrders[sortBy]]; if (sortHow === "desc") expected.reverse();
   ensure(posters().map(img => Number(decodeURIComponent(img.src).match(/LOCAL (\d+)/)?.[1])).join(",") === expected.filter(id => id !== 10).join(","), "posters retain supplied Trakt order; missing omitted");
   ensure(modal().querySelectorAll(".studio-preview-single-media").length === 1 && !button("Load more titles", modal()), "one subtle context and no paging");
   geometry(modal()); await screenshot("source-preview-" + mediaType);
   await close(action);
   ensure(JSON.stringify(controller.serializeProject().value) === savedBefore, "unsaved Preview never changes saved source");
   return action;
  };
  const beforeOpenRequests = client.itemRequests.length;
  ensure(beforeOpenRequests === cooldownRequests + 1, "opening editor makes no request");
  await checkDraftPreview(editor, "MOVIE", "title", "desc");
  const sourceCacheCount = client.itemRequests.length, sourceTrigger = editor.querySelector('[data-action="preview-source-edit"]');
  await clickAndSettle(sourceTrigger); await wait(() => modal()?.querySelectorAll("img").length > 0); await close(sourceTrigger);
  ensure(client.itemRequests.length === sourceCacheCount, "same exact source context reopens from cache");
  if (view.width === 1280 && view.reducedMotion !== false) for (const sortBy of Object.keys(reviewSourceOrders)) for (const sortHow of ["asc", "desc"]) {
   if (sortBy === "title" && sortHow === "desc") continue;
   await checkDraftPreview(editor, "MOVIE", sortBy, sortHow);
  }
  // A new exact context permits cancellation/retry without refreshing cached success.
  await clickAndSettle(editor.querySelector('[data-action="cancel-source-edit"]'));
  editor = await openEdit();
  await clickAndSettle(editor.querySelector('[data-action="save-source-edit"]')); ensure(controller.getState().project === initialProject, "no-op save");
  editor = await openEdit();
  await clickAndSettle(editor.querySelector('input[name="trakt-edit-direction"][value="desc"]')); ensure(value("trakt-edit-sort") === "rank", "direction retains sort");
  await clickAndSettle(editor.querySelector('input[name="trakt-edit-sort"][value="votes"]')); ensure(value("trakt-edit-direction") === "desc", "sort retains direction");
  await act(async () => { setInputValue(editor.querySelector("#source-edit-title-input"), "Owner sorted source"); await afterCommittedEffects(); });
  geometry(editor); await screenshot("source-edit");
  await clickAndSettle(editor.querySelector('[data-action="save-source-edit"]'));
  const saved = controller.serializeProject().value, source = saved[0].folders[0].sources[0];
  ensure(source.title === "Owner sorted source" && source.sortBy === "votes" && source.sortHow === "desc" && source.traktListId === 101 && source.provider === "trakt" && source.mediaType === "MOVIE", "combined save preserves identity");
  const reimport = createController(); ensure(reimport.importValue(saved).ok && JSON.stringify(reimport.serializeProject().value) === JSON.stringify(saved), "export/reimport exact");
  editor = await openEdit(); ensure(value("trakt-edit-sort") === "votes" && value("trakt-edit-direction") === "desc", "reopen saved sort");
  await clickAndSettle(editor.querySelector('input[name="trakt-edit-sort"][value="title"]')); await key("Escape");
  ensure(JSON.stringify(controller.serializeProject().value) === JSON.stringify(saved), "Cancel discards sort");
  await clickAndSettle(host.querySelector('[data-action="open-about-credits"]'));
  const about = document.querySelector("[data-about-credits-dialog]"); geometry(about);
  ensure(about.querySelectorAll(".about-credit-row").length === 3 && about.querySelector('a[href="https://trakt.tv/"]').textContent === "Trakt", "third text-only credit");
  ensure(about.textContent.includes("Public list data is supplied by Trakt. Dingo is not affiliated with or endorsed by Trakt.") && about.querySelector('nav a[href="https://trakt-list-lookup.pages.dev/"]'), "exact credit and separate related link");
  await screenshot("about"); await key("Escape");

  // Same generic editor with a fixed Series identity. Transport remains injected.
  const tvController = createController();
  ensure(tvController.importValue([{ title: "Series", folders: [{ title: "Folder", sources: [{ provider: "trakt", title: "Series draft", traktListId: 123, mediaType: "TV", sortBy: "rank", sortHow: "asc" }] }] }]).ok, "Series seed");
  const tvOpened = createSourceEditSession(tvController.getState().project, tvController.getState().project.collections[0].folders[0].sources[0].internalId);
  const tvBefore = JSON.stringify(tvController.serializeProject().value), tvRequests = client.itemRequests.length;
  await act(async () => { root.render(createElement(SourceEditorDialog, { session: tvOpened.session, initialDraft: tvOpened.draft, traktClient: client, traktPosterProvider: client.posterProvider, traktPosterUrl: client.posterUrlForPath, onCancel() {}, onSave() {} })); await afterCommittedEffects(); });
  editor = document.querySelector('[data-source-edit-modal]');
  ensure(client.itemRequests.length === tvRequests, "Series editor open makes no request");
  for (const sortBy of view.width === 1280 && view.reducedMotion !== false ? Object.keys(reviewSourceOrders) : ["popularity"]) for (const sortHow of ["asc", "desc"]) await checkDraftPreview(editor, "TV", sortBy, sortHow);
  await clickAndSettle(editor.querySelector('input[name="trakt-edit-sort"][value="title"]'));
  await clickAndSettle(editor.querySelector('input[name="trakt-edit-direction"][value="desc"]'));
  // Use fresh providers so the cancellation/error cases cannot hit an earlier success.
  const recovery = createReviewClient();
  let releaseSource;
  recovery.itemOverrides.set(123, (init, reply) => new Promise(resolve => { releaseSource = () => resolve(reply()); }));
  await act(async () => { root.render(createElement(SourceEditorDialog, { key: "recovery", session: tvOpened.session, initialDraft: { ...tvOpened.draft, sortBy: "title", sortHow: "desc" }, traktClient: recovery, traktPosterProvider: recovery.posterProvider, traktPosterUrl: recovery.posterUrlForPath, onCancel() {}, onSave() {} })); await afterCommittedEffects(); });
  editor = document.querySelector('[data-source-edit-modal]');
  const recoveryTrigger = editor.querySelector('[data-action="preview-source-edit"]');
  await clickAndSettle(recoveryTrigger); await wait(() => typeof releaseSource === "function"); await close(recoveryTrigger);
  ensure(recovery.itemRequests[0].signal.aborted, "Source Preview Close aborts current request");
  await act(async () => { releaseSource(); await afterCommittedEffects(); }); ensure(!modal(), "late Source response cannot reopen dialog");
  recovery.itemOverrides.set(123, () => previewJson({ apiVersion: 1, error: { code: "UPSTREAM_FAILURE" } }, 502));
  await clickAndSettle(recoveryTrigger); await wait(() => button("Retry", modal()));
  recovery.itemOverrides.delete(123); await clickAndSettle(button("Retry", modal())); await wait(() => modal()?.querySelectorAll("img").length > 0); await close(recoveryTrigger);
  ensure(recovery.itemRequests.length === 3 && JSON.stringify(tvController.serializeProject().value) === tvBefore, "explicit retry only, fixed draft, no saved mutation");
  await act(async () => { root.render(null); await afterCommittedEffects(); });

  // Exercise visible diagnostic focus with real adapter validation, without corrupting a project.
  for (const [field, name] of [["sortBy", "trakt-edit-sort"], ["sortHow", "trakt-edit-direction"]]) {
   const opened = createSourceEditSession(controller.getState().project, controller.getState().project.collections[0].folders[0].sources[0].internalId);
   await act(async () => { root.render(createElement(SourceEditorDialog, { session: opened.session, initialDraft: { ...opened.draft, [field]: "invalid" }, onCancel() {}, onSave: draft => saveSourceEdit(controller, opened.session, draft) })); await afterCommittedEffects(); });
   await clickAndSettle(document.querySelector('[data-action="save-source-edit"]'));
   ensure(document.activeElement?.name === name, "invalid " + field + " focuses its visible field");
   await act(async () => { root.render(null); await afterCommittedEffects(); });
  }
  ensure(requests.length === 0, "no uninjected external requests");
  return { ...view, verified: true, requests: requests.length, sampleRequests: client.itemRequests.length, posterRequests: client.posterRequests.length, sampleLimit: 50, posterOnly: true, nativeLazy: true, sorting: true, unavailable: true, cacheCancellation: true };
 } finally { await act(async () => root.unmount()); host.remove(); window.fetch = originalFetch; document.documentElement.style.fontSize = ""; }
}
