import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { buildNativeTraktSourceDraft } from "../../builder/src/source-add/trakt-source.js";
import { traktFailure } from "../../builder/src/source-add/trakt-client.js";

// Owner-authorized deterministic mechanics/visual evidence. Never live acceptance.
const names = { 101: "Movie-only list", 102: "Series-only list", 103: "Mixed list", 104: "Empty list", 105: "Detection unavailable", 106: "Unavailable list" };
const shortDescription = "Deterministic owner-review metadata. A short description with <plain text>, not markup.";
const longDescription = Array.from({ length: 18 }, (_, index) => "Paragraph " + (index + 1) + ". This complete description is already held in discovery metadata. It should scroll inside the description dialog while the selection and outer page remain unchanged.").join("\n\n") + "\n\n" + "LongUnbrokenDescriptionToken".repeat(18);
export function reviewList(id, titleForId) {
 const metadata = {
  101: { description: shortDescription, itemCount: 12, likeCount: 27, updatedAt: "2026-10-02T12:30:00Z" },
  102: { description: null, itemCount: 8 },
  103: { description: longDescription, itemCount: 20, likeCount: 0, updatedAt: "2026-10-02T12:30:00Z" },
  104: { creator: { username: null }, description: " \n ", itemCount: 0 },
  105: { description: shortDescription, itemCount: 77, likeCount: 17 },
  106: { description: null, likeCount: 0, updatedAt: "2026-10-02T12:30:00Z" },
  107: { description: shortDescription, itemCount: 77, likeCount: 1, updatedAt: "2026-10-02T12:30:00Z" },
  108: { description: null, itemCount: 1, availability: "unavailable" },
  109: { description: null, itemCount: 1, updatedAt: "2026-10-02T12:30:00Z" },
 };
 return { id, name: titleForId?.(id) ?? names[id] ?? `Long public list ${id} — stories from around the world and across generations`, creator: { username: "review-user" }, description: null, itemCount: null, likeCount: null, updatedAt: null, availability: "unverified", ...metadata[id] };
}
export function createReviewClient({ titleForId } = {}) {
 const calls = [], overrides = new Map();
 const list = id => reviewList(id, titleForId);
 const results = page => ({ ok: true, data: { lists: Array.from({ length: page === 1 ? 30 : 12 }, (_, index) => list(101 + (page - 1) * 30 + index)), pagination: { page, limit: 30, pageCount: 2, itemCount: 42 } } });
 const discovery = (kind, query, options) => { calls.push({ kind, query, page: options.page, limit: options.limit }); return Promise.resolve(results(options.page)); };
 return { calls, overrides, getNotBefore: () => 0,
  searchKeyword: (query, options) => discovery("keyword", query, options), searchUser: (query, options) => discovery("user", query, options), browse: (kind, options) => discovery(kind, null, options),
  async resolve(input, options) { calls.push({ kind: "resolve", input, refresh: options?.refresh === true }); const tail = input.split("/").at(-1), id = Number(input) || Number(tail) || ({ "movie-only": 101, "series-only": 102, mixed: 103 })[tail]; return Number.isSafeInteger(id) && id > 0 ? { ok: true, data: { ...list(id), availability: "available" } } : traktFailure("INVALID_REQUEST"); },
  async getMedia(id, options) {
   calls.push({ kind: "media", id }); if (overrides.has(id)) return overrides.get(id)(options);
   if (id === 105) return traktFailure("UPSTREAM_FAILURE"); if (id === 106) return traktFailure("LIST_NOT_FOUND");
   const movieCount = id === 102 || id === 104 ? 0 : 12, showCount = id === 101 || id === 104 ? 0 : 8;
   return { ok: true, data: { id, movieCount, showCount, composition: movieCount ? showCount ? "mixed" : "movie-only" : showCount ? "show-only" : "zero" } };
  },
 };
}

function seed(controller, scope) {
 const c = controller.createCollection({ editable: { title: "Review destination" } }).createdInternalId;
 const f = controller.createFolder(c, { editable: { title: "Existing folder" } }).createdInternalId;
 const add = (folder, id, mediaType = "MOVIE", sortBy = "rank") => { const draft = buildNativeTraktSourceDraft({ title: `Saved ${id}`, traktListId: id, mediaType }).draft; controller.createSource(folder, { ...draft, editable: { ...draft.editable, sortBy }, ...(id === 111 ? { rawImported: { ...draft.editable, futureSetting: true } } : {}) }); };
 add(f, 101); if (scope === "new-folder") add(f, 103);
 const other = controller.createCollection({ editable: { title: "Elsewhere" } }).createdInternalId;
 const otherFolder = controller.createFolder(other, { editable: { title: "Other folder" } }).createdInternalId;
 add(otherFolder, 102, "TV");
 if (scope === "add-source") { add(f, 110, "MOVIE", "added"); add(f, 111); }
 controller.selectNode(scope === "new-folder" ? c : f);
 return { c, f };
}

export async function runTraktCreationScenario(helpers, view) {
 const { createController, MountedWorkspace, clickAndSettle, afterCommittedEffects, setInputValue, setTextareaValue } = helpers;
 const ensure = (condition, message) => { if (!condition) throw new Error(`Trakt creation ${innerWidth}x${innerHeight}: ${message}`); };
 const originalFetch = window.fetch, requests = [];
 window.fetch = (input) => { requests.push(String(input?.url ?? input)); throw new Error("Uninjected request in deterministic Trakt mechanics"); };
 const results = [], presentation = [], density = [], resultCards = [];
 const screenshot = async suffix => { if (window.capture204Preview) await new Promise(resolve => { window.__finish204Capture = resolve; window.capture204Preview(JSON.stringify({ name: `trakt-b3-${view.width}-${view.height}-${view.forcedColors ? "forced-" : ""}${view.largeText ? "large-" : ""}${suffix}` })); }); };
 const settle = () => act(async () => { await afterCommittedEffects(); });
 const textButton = (text, root = document) => [...root.querySelectorAll("button")].find(button => button.textContent.trim() === text);
 const mediaChoice = (id, root = document) => root.querySelector(`.semantic-sort-choices input[value="${id}"]`);
 const click = async text => { const button = textButton(text); ensure(button && !button.disabled, `available button: ${text}`); await clickAndSettle(button); };
 const input = async (selector, value) => { const node = document.querySelector(selector); ensure(node, selector); await act(async () => { (node.tagName === "TEXTAREA" ? setTextareaValue : setInputValue)(node, value); await afterCommittedEffects(); }); };
 const key = async key => act(async () => { await new Promise(resolve => { window.__finish230Key = resolve; window.pressGuidedPresentationKey(JSON.stringify({ key })); }); await afterCommittedEffects(); });
 const headingFocused = () => {
  const heading = document.querySelector('.trakt-list-form .creation-stage-intro h3');
  ensure(document.activeElement === heading, 'stage heading owns initial and Back focus');
  const scroll = heading.closest('.add-source-scroll');
  ensure(scroll.scrollTop === 0, 'stage returns to reliable top inset');
  ensure(heading.getBoundingClientRect().top >= scroll.getBoundingClientRect().top + 12, 'stage intro clears header');
 };
 const keyboardFocus = async target => {
  for (let count = 0; count < 4 && document.activeElement !== target; count++) await key('Tab');
  ensure(document.activeElement === target && target.matches(':focus-visible'), 'native Tab reaches intended control with visible keyboard focus');
  const style = getComputedStyle(target.matches('input[type="radio"]') ? target.closest("label") : target);
  ensure(style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2, 'keyboard focus ring retained');
 };
 const quietChoice = target => {
  const radio = target.matches('input[type="radio"]'), control = radio ? target.closest('label') : target;
  const style = getComputedStyle(control);
  ensure((radio ? target.checked : target.getAttribute('aria-pressed') === 'true') && control.dataset.selectionMode === 'single', 'active mode uses shared single-choice semantics');
  ensure(document.activeElement !== target && style.outlineStyle === 'none', 'active mode has no focus outline on stage entry');
  ensure(parseFloat(style.borderTopWidth) === 1, 'selected border is restrained');
  if (!view.forcedColors) ensure(style.boxShadow.includes('1px inset') && !style.boxShadow.includes('3px'), 'shared one-pixel selected inset');
 };
 const stage = () => document.querySelector("[data-trakt-stage]")?.dataset.traktStage;
 const checkLayout = () => {
  const dialog = document.querySelector('[role="dialog"]'), bounds = dialog.getBoundingClientRect();
  ensure(bounds.left >= -1 && bounds.right <= innerWidth + 1 && bounds.top >= -1 && bounds.bottom <= innerHeight + 1, `dialog bounds ${JSON.stringify(bounds.toJSON())}`);
  ensure(document.documentElement.scrollWidth <= innerWidth + 1, "no document overflow");
  const scroll = document.querySelector(".trakt-list-form .add-source-scroll"); ensure(scroll.scrollWidth <= scroll.clientWidth + 1, "no content overflow");
  const footer = document.querySelector('.trakt-list-form .add-source-actions').getBoundingClientRect();
  ensure(footer.bottom <= bounds.bottom + 1 && footer.top >= bounds.top && footer.height >= 44, 'fixed footer remains reachable');
  for (const label of document.querySelectorAll('.trakt-list-form .semantic-sort-choice-row label')) {
   const size = label.getBoundingClientRect(), style = getComputedStyle(label), font = getComputedStyle(label.querySelector('span'));
   ensure(size.height >= 36 && style.minHeight === '36px' && style.padding === '7px 12px' && style.borderRadius === '999px', 'Media uses the actual shared compact pill geometry');
   ensure(Math.abs(parseFloat(font.fontSize) - parseFloat(getComputedStyle(document.documentElement).fontSize) * .68) < .01 && font.fontWeight === '800' && getComputedStyle(label.parentElement).gap === '7px', 'Media uses shared pill typography and spacing');
  }
  for (const field of document.querySelectorAll('[id^="trakt-folder-"][type="text"]')) ensure(field.getBoundingClientRect().width >= field.parentElement.getBoundingClientRect().width - 2, 'Folder names remain full width');
  for (const button of document.querySelectorAll('.trakt-list-form button')) if (button.getClientRects().length) ensure(button.getBoundingClientRect().height >= 44, 'touch target stays at least 44px');
 };
 if (view.largeText) document.documentElement.style.fontSize = "22px";
 try {
  for (const scope of ["new-collection", "new-folder", "add-source"]) {
   const controller = createController(), destination = seed(controller, scope), client = createReviewClient();
   const initial = controller.getState(), host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
   let mutations = 0, previous = initial.project;
   const unsubscribe = controller.subscribe(() => { const next = controller.getState().project; if (next !== previous) { mutations++; previous = next; } });
   try {
    await act(async () => { root.render(createElement(MountedWorkspace, { controller, traktClient: client, ...(scope === "add-source" ? {} : { initialCreationSession: { scope, destinationCollectionInternalId: destination.c, destinationCollectionTitle: "Review destination" } }) })); await afterCommittedEffects(); });
    if (scope === "add-source") { await clickAndSettle(host.querySelector('[data-action="add-source"]')); }
    if (scope !== 'add-source') {
     const heading = document.querySelector('#creation-title'), blank = document.querySelector('button[data-creation-option="blank"]');
     ensure(document.activeElement === heading && getComputedStyle(blank).outlineStyle === 'none', 'launcher opens on heading with neutral Blank');
     await screenshot(scope + '-launcher');
     await keyboardFocus(blank); await screenshot(scope + '-launcher-keyboard'); heading.focus({ preventScroll: true });
    }
    const launcher = [...document.querySelectorAll('[role="dialog"] button')].find(button => button.textContent.includes("Trakt Lists")); ensure(launcher, "real registered launcher"); await clickAndSettle(launcher);
    ensure(stage() === "select" && client.calls.length === 0, "opening is inert");
    ensure(!["INPUT", "TEXTAREA"].includes(document.activeElement.tagName), "initial browse does not focus keyboard input");
    headingFocused(); quietChoice(textButton('Keyword')); checkLayout(); await screenshot(scope + "-select");
    await keyboardFocus(textButton('Keyword')); await screenshot(scope + '-select-keyboard');
    if (scope !== 'add-source') {
     await clickAndSettle(document.querySelector('[data-action="back-trakt"]'));
     ensure(document.activeElement === document.querySelector('#creation-title'), 'Back restores launcher heading');
     await clickAndSettle([...document.querySelectorAll('[role="dialog"] button')].find(button => button.textContent.includes('Trakt Lists'))); headingFocused();
    }
    await input("#trakt-query", "123"); await click("Search");
    ensure(client.calls[0].kind === "keyword" && client.calls[0].query === "123" && client.calls[0].limit === 30, "numeric keyword stays keyword");
    const select = async id => { const card = [...document.querySelectorAll(".trakt-result")].find(row => row.textContent.includes(`Trakt List ${id}`)); ensure(card, `result ${id}`); await clickAndSettle(card.querySelector("input")); };
    const card = id => document.querySelector('[data-trakt-result-id="' + id + '"]');
    ensure(!/Public access not checked|Public list verified|\bitems?\b/.test(document.querySelector('.trakt-results').textContent), 'cards omit backend state and use titles vocabulary');
    ensure(card(101).querySelector('strong').textContent === 'Movie-only list' && card(101).textContent.includes('@review-user') && card(101).textContent.includes('12 titles'), 'name, username, canonical ID and plural title count visible');
    ensure(card(109).textContent.includes('1 title') && !card(109).textContent.includes('1 titles'), 'singular title');
    ensure(card(101).querySelector('.trakt-result-likes').getAttribute('aria-label') === '27 likes' && card(101).querySelector('.trakt-result-likes [aria-hidden="true"]').textContent === '♥', 'known likes have accessible count and decorative heart');
    ensure(card(103).querySelector('.trakt-result-likes').getAttribute('aria-label') === '0 likes' && !card(102).querySelector('.trakt-result-likes'), 'zero is known; null likes omitted');
    ensure(card(101).querySelector('time').textContent === '2 Oct 2026' && !card(102).querySelector('time') && !card(104).querySelector('.trakt-result-creator'), 'absolute known date and absent date/username');
    ensure(!card(101).textContent.includes(shortDescription) && !card(103).textContent.includes('Paragraph 1.'), 'no inline description or snippet');
    ensure(!card(102).querySelector('button') && !card(104).querySelector('button') && card(108).querySelector('input').disabled && card(108).textContent.includes('Unavailable'), 'null/blank descriptions omitted and unavailable remains disabled');
    ensure(!document.querySelector('.trakt-result label button'), 'description action is a sibling of selectable label');
    ensure(card(101).querySelector('.trakt-result-details').textContent === '12 titles · Last updated 2 Oct 2026' && card(105).querySelector('.trakt-result-details').textContent === '77 titles' && card(106).querySelector('.trakt-result-details').textContent === 'Last updated 2 Oct 2026' && !card(110).querySelector('.trakt-result-details'), 'left metadata combines known values with a conditional middle dot only');
    ensure([...document.querySelectorAll('.trakt-description-action')].every(button => button.textContent === 'Read description') && !document.querySelector('.trakt-results').textContent.includes('Preview'), 'description action text is exact and no Preview placeholder exists');
    for (const id of [101, 104]) {
     const row = card(id), heading = row.querySelector('.trakt-result-heading').getBoundingClientRect(), identity = row.querySelector('.trakt-result-id').getBoundingClientRect(), details = row.querySelector('.trakt-result-details');
     ensure(Math.abs(identity.right - heading.right) < 1, 'List ID stays right-aligned with or without a username');
     ensure(Math.abs(details.getBoundingClientRect().left - heading.left) < 1 && getComputedStyle(details).display === 'block', 'count and date share ordinary left-aligned wrapping text');
    }
    const action = card(101).querySelector('.trakt-description-action').getBoundingClientRect(), choice = card(101).querySelector('label').getBoundingClientRect();
    ensure(action.top >= choice.bottom && action.right < choice.right - 44 && Math.abs(action.left - card(101).querySelector('.trakt-result-heading').getBoundingClientRect().left) < 1, 'description remains bottom-left with bottom-right space unused');
    for (const mode of ['Keyword', 'User', 'URL / ID']) {
     const button = textButton(mode); ensure(button.classList.contains('trakt-mode-choice') && button.dataset.selectionMode === 'single', 'scoped mode class retains exact choice labels');
     if (!view.forcedColors && button.getAttribute('aria-pressed') === 'false') ensure(getComputedStyle(button).color === getComputedStyle(document.querySelector('.creation-stage-intro h3')).color, 'unselected mode text uses the neutral heading token');
    }
    for (const label of ['Popular Lists', 'Trending Lists']) ensure(textButton(label).classList.contains('trakt-browse-action') && !textButton(label).hasAttribute('aria-pressed'), 'secondary browse actions have exact labels and no mode state');
    const dimensions = [101, 102, 103, 104, 105, 106, 107, 108, 109].map(id => ({ id, height: card(id).getBoundingClientRect().height }));
    ensure(Math.abs(dimensions[0].height - dimensions[2].height) < 1, 'short and long descriptions use the same compact card height');
    for (const row of document.querySelectorAll('.trakt-result')) {
     const title = row.querySelector('strong').getBoundingClientRect(), likes = row.querySelector('.trakt-result-likes')?.getBoundingClientRect();
     ensure(row.scrollWidth <= row.clientWidth + 1 && (!likes || title.right <= likes.left), 'long titles wrap without likes collision or horizontal overflow');
     ensure(row.querySelector('label').getBoundingClientRect().height >= 44, 'selection target remains usable');
    }
    const checkDescription = async (id, closeMethod) => {
     const row = card(id), trigger = row.querySelector('button'), checkbox = row.querySelector('input'), checked = checkbox.checked;
     const calls = client.calls.length, project = controller.getState().project, pageTop = window.scrollY, outer = document.querySelector('.trakt-list-form .add-source-scroll'), outerTop = outer.scrollTop;
     trigger.focus({ preventScroll: true }); await key('Enter');
     const dialog = document.querySelector('.trakt-description-modal'), body = dialog?.querySelector('.trakt-description-body'), close = dialog?.querySelector('button');
     ensure(dialog && dialog.getAttribute('role') === 'dialog' && dialog.getAttribute('aria-modal') === 'true' && document.getElementById(dialog.getAttribute('aria-labelledby')).textContent === row.querySelector('strong').textContent, 'named modal opens through native keyboard action');
     ensure(body.textContent === reviewList(id).description && !body.querySelector('*'), 'full description rendered as plain metadata text only inside modal');
     ensure(document.activeElement === close && outer.closest('[role="dialog"]').inert, 'Close receives focus and parent dialog is inert');
     const bounds = dialog.getBoundingClientRect();
     ensure(bounds.left >= 0 && bounds.right <= innerWidth && bounds.top >= 0 && bounds.bottom <= innerHeight && body.scrollWidth <= body.clientWidth + 1, 'description dialog fits viewport without horizontal overflow');
     ensure(close.getBoundingClientRect().height >= 44 && close.getBoundingClientRect().bottom <= bounds.bottom, 'Close target always reachable');
     await key('Tab'); ensure(document.activeElement === body, 'description scroll region is keyboard reachable');
     await key('Tab'); ensure(document.activeElement === close && close.matches(':focus-visible'), 'Tab loops within description dialog with visible focus');
     if (id === 103) { ensure(body.scrollHeight > body.clientHeight, 'long description has its own scroll owner'); body.scrollTop = body.scrollHeight; await settle(); ensure(body.scrollTop > 0, 'long description end is reachable'); }
     await screenshot(scope + '-description-' + id + '-' + closeMethod);
     if (closeMethod === 'Escape') await key('Escape'); else await clickAndSettle(close);
     ensure(!document.querySelector('.trakt-description-modal') && document.activeElement === trigger && !outer.closest('[role="dialog"]').inert, 'close restores exact trigger and parent interaction');
     ensure(checkbox.checked === checked && client.calls.length === calls && controller.getState().project === project && mutations === 0, 'description never toggles selection, requests metadata/media or mutates project');
     ensure(window.scrollY === pageTop && outer.scrollTop === outerTop, 'description keeps outer scroll position stable');
    };
    await screenshot(scope + '-results-unselected');
    await checkDescription(103, 'Escape');
    await select(101);
    await checkDescription(101, 'Close');
    ensure(card(101).dataset.selected === 'true' && card(101).querySelector('input').checked && card(101).dataset.selectionMode === 'multiple', 'retained selection uses shared multiple-choice treatment');
    resultCards.push({ scope, dimensions, description: true, focusReturn: true, selectionUnchanged: true, requestDelta: 0 });
    checkLayout(); await screenshot(scope + '-results-selected');
    const keyboardChoice = document.querySelector('.trakt-result input'); keyboardChoice.focus({ preventScroll: true });
    for (let press = 0; press < 2; press++) await act(async () => { await new Promise(resolve => { window.__finish230Key = resolve; window.pressGuidedPresentationKey(JSON.stringify({ key: " " })); }); await afterCommittedEffects(); });
    ensure(keyboardChoice.checked && document.activeElement === keyboardChoice, "native Space preserves semantic checkbox and focus");
    const resultScroll = document.querySelector('.trakt-list-form .add-source-scroll');
    ensure(![...document.querySelectorAll('.trakt-results-tail button')].some(button => button.textContent.includes('Back to top')), 'no useless top action at initial results position');
    const returnToTop = async () => {
     await act(async () => { resultScroll.scrollTop = resultScroll.scrollHeight; await afterCommittedEffects(); });
     await act(async () => { resultScroll.scrollTop = resultScroll.scrollHeight; await afterCommittedEffects(); });
     const top = [...document.querySelectorAll('.trakt-results-tail button')].find(button => button.textContent.includes('Back to top'));
     ensure(top && top.type === 'button', 'results tail exposes ordinary top action after a viewport of scrolling');
     const callsBeforeTop = client.calls.length, documentTop = window.scrollY;
     await screenshot(scope + '-results-tail'); await clickAndSettle(top);
     if (view.reducedMotion !== false) ensure(resultScroll.scrollTop === 0, 'reduced-motion scroll is immediate');
     await act(async () => { const deadline = performance.now() + 2000; while (resultScroll.scrollTop > 0 && performance.now() < deadline) await new Promise(requestAnimationFrame); await afterCommittedEffects(); });
     headingFocused(); ensure(window.scrollY === documentTop && client.calls.length === callsBeforeTop, 'top action keeps outer scroll and requests unchanged');
     ensure(![...document.querySelectorAll('.trakt-results-tail button')].some(button => button.textContent.includes('Back to top')), 'top action disappears after returning');
    };
    await returnToTop();
    await click("Load more"); ensure(document.querySelectorAll(".trakt-result").length === 42, "explicit page append");
    await returnToTop();
    await click("User"); await input("#trakt-query", "@review-user"); await click("Search"); await select(102);
    await click("Trending Lists"); await select(103); await click("Popular Lists");
    ensure(document.querySelectorAll('.trakt-result input:checked').length === 3, "selection survives modes and pages");
    await click("URL / ID"); await input("#trakt-input", "101\ninvalid\nhttps://app.trakt.tv/users/review-user/lists/103"); await click("Resolve lists");
    ensure(document.querySelector(".trakt-line-results").textContent.includes("Already selected") && document.querySelector(".trakt-line-results").textContent.includes("Line 2"), "per-line outcomes");
    await click("Clear input"); ensure(document.querySelector(".trakt-selected").textContent.includes("Selected · 3"), "Clear input retains selection");
    await click("Continue to Media"); ensure(stage() === "media" && client.calls.filter(call => call.kind === "media").length === 3, "selected-only checks"); headingFocused(); quietChoice(mediaChoice('automatic')); checkLayout(); await screenshot(scope + "-media");
    const mediaHeight = document.querySelector('[data-trakt-media-id="103"]').getBoundingClientRect().height;
    await keyboardFocus(mediaChoice('automatic')); await screenshot(scope + '-media-keyboard');
    const callsBeforeKeys = client.calls.length;
    await key('ArrowRight'); ensure(mediaChoice('movies').checked && document.querySelector('[data-trakt-media-id="101"]').querySelectorAll('input:checked').length === 1, 'native radio arrows retain exclusive choice');
    await key('ArrowLeft'); ensure(mediaChoice('automatic').checked && client.calls.length === callsBeforeKeys, 'radio interaction preserves automatic choice without requests');
    await clickAndSettle(document.querySelector('[data-action="back-trakt"]')); headingFocused(); await click("Continue to Media"); headingFocused();
    ensure(client.calls.filter(call => call.kind === "media").length === 3, "completed results retained on Back");
    await click(`Continue to ${scope === "add-source" ? "Review" : "Names"}`);
    headingFocused(); ensure(mutations === 0, "no pre-final project mutation");
    const expectedSources = scope === "new-collection" ? 4 : scope === "new-folder" ? 2 : 3;
    if (scope === "new-collection") await input("#trakt-collection-title", "Owner Trakt collection");
    if (scope === "new-folder") {
     ensure(!document.querySelector("#trakt-folder-101") && document.querySelector("#trakt-folder-103"), "complete omitted; partial sibling editable");
     ensure(document.querySelector('[data-trakt-review-id="103"]').textContent.includes("Movies already in this Collection · omitted"), "physical partial omission");
     ensure(!document.querySelector('[data-trakt-review-id="101"]') && document.querySelector(".tmdb-list-omitted"), "fully omitted lists stay outside ready Folder cards");
    }
    if (scope === "add-source") ensure(!document.querySelector('[id^="trakt-folder-"]'), "no folder name controls");
    if (scope !== 'add-source') {
     const helper = `These are the ${scope === 'new-collection' ? 'Collection and Folder' : 'Folder'} names shown in Nuvio. You can customise them before creating.`;
     ensure(document.querySelector('[role="dialog"]').textContent.split(helper).length === 2, 'one scope-specific Nuvio naming helper');
    }
    if (scope === 'new-collection') ensure(document.querySelector('.trakt-plan-totals').compareDocumentPosition(document.querySelector('#trakt-collection-title')) & Node.DOCUMENT_POSITION_FOLLOWING, 'TMDB naming order: summary before Collection name');
    if (scope !== 'add-source') ensure(document.querySelector('[data-trakt-review-id="103"]').textContent.includes(scope === 'new-folder' ? 'Ready: Series' : 'Ready: Movies + Series'), 'compact physical ready summary');
    for (const identity of document.querySelectorAll('[data-trakt-review-id] .trakt-list-identity')) ensure(identity.querySelector('small').getBoundingClientRect().top >= identity.querySelector('strong').getBoundingClientRect().bottom, 'List metadata stays below the wrapping title');
    checkLayout(); await screenshot(scope + '-names');
    const mixedCard = document.querySelector('[data-trakt-review-id="103"]');
    mixedCard.scrollIntoView({ block: 'center', behavior: 'instant' }); await settle(); await screenshot(scope + '-names-mixed');
    resultScroll.scrollTop = 0; await settle();
    const namesHeight = document.querySelector('[data-trakt-review-id="103"]').getBoundingClientRect().height;
    const totals = document.querySelector('.trakt-plan-totals');
    if (totals) { const cells = [...totals.children].map(cell => cell.getBoundingClientRect()); ensure(cells.every(cell => Math.abs(cell.top - cells[0].top) < 1), 'count cells stay in one row'); }
    if (view.width === 1280) ensure(mediaHeight < 125 && namesHeight < 220, 'desktop simple cards are substantially compact');
    presentation.push({ scope, mediaHeight, namesHeight, summaryHeight: totals?.getBoundingClientRect().height ?? null });
    const disclosure = document.querySelector(".source-names-disclosure"); ensure(disclosure && !disclosure.open, "optional names collapsed"); ensure(document.querySelectorAll(".source-names-disclosure").length === 1 && !disclosure.closest(".tmdb-list-review-item"), "one shared names disclosure outside Folder cards"); await clickAndSettle(disclosure.querySelector("summary"));
    ensure(disclosure.querySelectorAll('input[type="text"]').length === expectedSources, "ready-only source names");
    await input('.source-names-disclosure input', "Owner source name");
    checkLayout(); await screenshot(scope + "-names-expanded");
    if (scope !== "add-source") { await click("Continue to Appearance"); headingFocused(); ensure(document.querySelector(".trakt-list-form").textContent.includes("No artwork is assigned by this flow."), "shared appearance"); checkLayout(); await screenshot(scope + "-appearance"); }
    const before = controller.getState(); await click(scope === "add-source" ? "Add 3 sources" : scope === "new-folder" ? "Create 2 folders" : "Create collection");
    ensure(!document.querySelector("[data-trakt-stage]"), `final closes: ${document.querySelector(".editor-diagnostics")?.textContent}`);
    ensure(mutations === 1 && controller.getState().revision === before.revision + 1, "one atomic final operation");
    const project = controller.getState().project;
    if (scope === "new-collection") { const created = project.collections.at(-1); ensure(created.folders.length === 3 && created.folders.flatMap(folder => folder.sources).length === 4, "A 3 folders / 4 sources"); }
    if (scope === "new-folder") { const folders = project.collections[0].folders; ensure(folders.length === 3 && folders[2].sources.length === 1 && folders[2].sources[0].editable.mediaType === "TV", "B partial creates sibling TV only"); }
    if (scope === "add-source") ensure(project.collections[0].folders[0].sources.length === 6, "C three new physical sources");
    results.push({ scope, sources: expectedSources, atomic: true });
   } finally { unsubscribe(); await act(async () => root.unmount()); host.remove(); }
  }
  const edges = [];
  {
   const deep = view.width === 1280 || (view.width === 393 && view.height === 852 && !view.forcedColors && !view.largeText);
   for (const scenario of ["density-2", "density-10", "density-20", "remove-long", ...(deep ? ["batch", "manual", "cooldown", "cancel", "stale", "empty", "variants"] : [])]) {
    const scope = ["manual", "variants", "remove-long"].includes(scenario) ? "add-source" : "new-folder";
    const densityCount = scenario.startsWith("density-") ? Number(scenario.slice(8)) : 0;
    const controller = createController(), destination = seed(controller, scope), client = createReviewClient(densityCount ? { titleForId: id => `Selected list ${id - 200}` } : undefined);
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    const before = controller.getState().revision;
    let release;
    if (scenario === "cancel") client.overrides.set(103, () => new Promise(resolve => { release = resolve; }));
    if (scenario === "cooldown") client.overrides.set(103, async () => traktFailure("UPSTREAM_BUDGET", Date.now() + 1200));
    try {
     await act(async () => { root.render(createElement(MountedWorkspace, { controller, traktClient: client, ...(scope === "add-source" ? {} : { initialCreationSession: { scope, optionId: "trakt-lists", destinationCollectionInternalId: destination.c, destinationCollectionTitle: "Review destination" } }) })); await afterCommittedEffects(); });
     if (scope === "add-source") { await clickAndSettle(host.querySelector('[data-action="add-source"]')); await clickAndSettle([...document.querySelectorAll('[role="dialog"] button')].find(button => button.textContent.includes("Trakt Lists"))); }
     if (scenario === "manual") { await click("Popular Lists"); for (const id of [104, 105, 106]) await clickAndSettle([...document.querySelectorAll(".trakt-result")].find(row => row.textContent.includes(`Trakt List ${id}`)).querySelector("input")); }
     else {
      await click("URL / ID"); await input("#trakt-input", densityCount ? Array.from({ length: densityCount }, (_, index) => String(201 + index)).join("\n") : scenario === "batch" ? Array.from({ length: 42 }, (_, index) => String(201 + index)).join("\n") : scenario === "empty" ? "101" : scenario === "variants" ? "110\n111" : scenario === "remove-long" ? "107\n103" : "103");
      await click("Resolve lists"); if (scenario === "batch") { ensure(document.querySelector(".trakt-selected").textContent.includes("25"), "resolve has explicit boundary"); await click("Resume resolving"); }
     }
     await click("Continue to Media");
     if (densityCount) {
      const cards = [...document.querySelectorAll('[data-trakt-media-id]')], scroll = document.querySelector('.trakt-list-form .add-source-scroll');
      ensure(cards.length === densityCount && client.calls.filter(call => call.kind === 'media').length === densityCount, 'density selection is checked exactly once');
      const first = cards[0], info = first.querySelector('.trakt-media-info').getBoundingClientRect(), pills = first.querySelector('.semantic-sort-choices').getBoundingClientRect();
      if (view.width === 1280) ensure(pills.left >= info.right && Math.abs(info.top - pills.top) < 8, 'desktop info and pills share a compact horizontal row');
      else ensure(pills.top >= info.bottom, 'phone info and pills stack without squeezing');
      checkLayout(); await screenshot(scenario + '-media');
      const heights = cards.map(card => card.getBoundingClientRect().height);
      if (view.width === 1280) ensure(Math.max(...heights) < 125, 'ordinary cards stay compact at 2, 10 and 20 selections');
      density.push({ count: densityCount, cardHeight: heights[0], scrollHeight: scroll.scrollHeight, viewportHeight: scroll.clientHeight, pillHeight: first.querySelector('.semantic-sort-choice-row label').getBoundingClientRect().height });
      scroll.scrollTop = scroll.scrollHeight; await settle();
      const documentTop = window.scrollY, dialogTop = document.querySelector('[role="dialog"]').getBoundingClientRect().top;
      const lastPill = mediaChoice('automatic', cards.at(-1)); lastPill.focus(); await settle();
      ensure(window.scrollY === documentTop && document.querySelector('[role="dialog"]').getBoundingClientRect().top === dialogTop, 'last-row focus keeps document and modal stable');
      checkLayout(); await screenshot(scenario + '-media-end');
     } else if (scenario === 'remove-long') {
      const card = document.querySelector('[data-trakt-media-id="107"]'), title = card.querySelector('strong'), remove = card.querySelector('button[aria-label^="Remove "]');
      const titleBounds = title.getBoundingClientRect(), removeBounds = remove.getBoundingClientRect();
      ensure(remove.textContent === '×' && remove.getAttribute('aria-label') === 'Remove ' + title.textContent, 'compact removal keeps descriptive button semantics');
      ensure(removeBounds.width >= 44 && removeBounds.height >= 44 && titleBounds.right <= removeBounds.left - 4, 'wrapped long title never overlaps the touch target');
      ensure(getComputedStyle(title).textOverflow !== 'ellipsis' && title.scrollWidth <= title.clientWidth + 1, 'long title wraps without truncation');
      await keyboardFocus(remove); checkLayout(); await screenshot('long-title-media');
      const callsBeforeRemove = client.calls.length;
      await key('Enter'); ensure(!document.querySelector('[data-trakt-media-id="107"]') && document.querySelector('[data-trakt-media-id="103"]'), 'native keyboard removes only the chosen row');
      ensure(client.calls.length === callsBeforeRemove, 'remove makes no request');
      await click('Continue to Review'); ensure(textButton('Add 2 sources'), 'remaining mixed list retains two outputs');
     } else if (scenario === "batch") {
      ensure(client.calls.filter(call => call.kind === "media").length === 25, "media stops at 25");
      ensure(document.querySelector(".trakt-list-form").textContent.includes("Checked 25 of 42"), "honest continuation count");
      await screenshot("batch-25"); await click("Check remaining 17"); ensure(client.calls.filter(call => call.kind === "media").length === 42, "explicit remaining only");
     } else if (scenario === "manual") {
      ensure(textButton("Continue to Review").disabled, "failure and zero never imply Both");
      for (const id of [104, 105, 106]) {
       const row = document.querySelector(`[data-trakt-media-id="${id}"]`);
       if (id !== 104) { ensure(mediaChoice("both", row).disabled, "manual unavailable before verification"); await clickAndSettle(textButton("Verify list", row)); }
       await clickAndSettle(mediaChoice("both", row));
      }
      ensure(!textButton("Continue to Review").disabled, "deliberate manual recovery");
      await screenshot("manual-recovery"); await clickAndSettle(document.querySelector('[data-action="back-trakt"]')); await click("Continue to Media");
      ensure(client.calls.filter(call => call.kind === "media").length === 3, "manual recovery survives Back without extra checks");
      await click("Continue to Review"); ensure(textButton("Add 6 sources"), "six manual physical outputs");
     } else if (scenario === "cooldown") {
      ensure(textButton("Retry media checks").disabled, "Retry-After gates retry"); const count = client.calls.length;
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 1300)); await afterCommittedEffects(); });
      ensure(client.calls.length === count && !textButton("Retry media checks").disabled, "cooldown ends without autoretry");
     } else if (scenario === "cancel") {
      await clickAndSettle(document.querySelector('[data-action="back-trakt"]'));
      await click("Clear selected lists");
      await act(async () => { release({ ok: true, data: { id: 103, movieCount: 1, showCount: 1, composition: "mixed" } }); await afterCommittedEffects(); });
      ensure(!document.querySelector(".trakt-selected"), "late response cannot restore removed selection");
     } else if (scenario === "stale") {
      await click("Continue to Names"); await click("Continue to Appearance");
      await act(async () => { controller.createCollection({ editable: { title: "Concurrent change" } }); await afterCommittedEffects(); });
      await click("Create folder"); ensure(stage() === "names" && document.querySelector(".editor-diagnostics").textContent.includes("project changed"), "stale final returns current review");
      ensure(controller.getState().revision === before + 1, "stale action creates nothing");
     } else if (scenario === "empty") {
      await click("Continue to Names"); ensure(stage() === "empty" && !document.querySelector('.trakt-list-form button[type="submit"]'), "Nothing to add has no fake Create"); headingFocused();
     } else if (scenario === "variants") {
      await click("Continue to Review"); const content = document.querySelector(".trakt-list-form").textContent;
      ensure(content.includes("different sorting") && content.includes("could not be compared"), "variant and unknown comparison messaging");
      ensure(textButton("Add 4 sources"), "variants remain normally addable");
     }
     if (scenario !== "stale") ensure(controller.getState().revision === before, "edge navigation makes no project changes");
     edges.push(scenario);
    } finally { await act(async () => root.unmount()); host.remove(); }
   }
  }
  ensure(requests.length === 0, "zero uninjected requests"); return { ...view, cases: results, presentation, density, resultCards, edges, requests: requests.length, verified: true };
 } finally { window.fetch = originalFetch; document.documentElement.style.fontSize = ""; }
}

export async function mountTraktOwnerReview({ createController, MountedWorkspace }) {
 globalThis.IS_REACT_ACT_ENVIRONMENT = false;
 window.fetch = () => { throw new Error("External requests disabled in deterministic owner review"); };
 const host = document.getElementById("mounted-test-root"), root = createRoot(host);
 const scope = new URLSearchParams(location.search).get("scope") ?? "new-collection";
 const controller = createController(), destination = seed(controller, scope), client = createReviewClient();
 const instructions = document.createElement("section"); instructions.style.cssText = "padding:16px;max-width:800px;margin:auto;color:#dce8f4";
 instructions.innerHTML = '<h1>Trakt Lists · local owner review</h1><p>Deterministic mechanics only. No live requests. Select lists 101, 102 and 103 for the three review scenarios. Popular Lists shows short/long/no descriptions, known/unknown likes and dates, missing username, a disabled List and long titles. Select any available card to compare selected/unselected states; Keyword and User use the same local examples. Multiline: use 101, 102, 103 or https://app.trakt.tv/users/review-user/lists/mixed.</p><p><a href="/tests/fixtures/builder-source-edit-mounted.html?trakt-creation-review&scope=new-collection">A · New Collection</a> · <a href="/tests/fixtures/builder-source-edit-mounted.html?trakt-creation-review&scope=new-folder">B · New Folder</a> · <a href="/tests/fixtures/builder-source-edit-mounted.html?trakt-creation-review&scope=add-source">C · Add Source</a></p><p>Close the dialog to choose another scenario. Refresh resets this temporary project. For C, select Add Source, then Trakt Lists.</p>';
 host.before(instructions);
 root.render(createElement(MountedWorkspace, { controller, traktClient: client, ...(scope === "add-source" ? {} : { initialCreationSession: { scope, destinationCollectionInternalId: destination.c, destinationCollectionTitle: "Review destination" } }) }));
 window.__traktOwnerReview = { client, controller };
}
