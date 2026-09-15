import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import {
	createTmdbPersonProvider, createPeopleManifestClient, createStudioCatalogueProvider, createNetworkCatalogueProvider,
	createTmdbStudioCountProvider, createTmdbNetworkCountProvider, createTmdbStudioPreviewProvider, createTmdbNetworkPreviewProvider,
	parseStudioSearchInput, parseNetworkSearchInput, buildPeopleSourceDrafts, buildStudioSourceDrafts, buildNetworkSourceDrafts,
	createPeopleSourceBundle, createStudioSourceBundle, createNetworkSource,
	applyPeopleHierarchyPlan, applyStudioHierarchyPlan, applyNetworkHierarchyPlan, PEOPLE_SOURCE_COMBINATIONS,
} from "../../builder/src/source-add/index.js";
import { createSourceEditSession, saveSourceEdit } from "../../builder/src/source-edit/index.js";
import { createArtworkRuntimeClient } from "../../js/artwork-runtime.mjs";
import { CreationDialog } from "../../builder/src/ui/CreationDialog.jsx";
import { PeopleSourceFlow } from "../../builder/src/ui/PeopleSourceFlow.jsx";
import { StudioSourceFlow } from "../../builder/src/ui/StudioSourceFlow.jsx";
import { NetworkSourceFlow } from "../../builder/src/ui/NetworkSourceFlow.jsx";
import { SourceEditorDialog } from "../../builder/src/ui/SourceEditorDialog.jsx";

// Real production-path providers only. Shared caches survive responsive cases.
const requests = [];
const warnerResponses = new Map();
const studioResponses = new Map();
const networkResponses = new Map();
let responseGate = null;
async function liveFetch(input, init) {
	const url = new URL(input instanceof Request ? input.url : input);
	requests.push(url.pathname + url.search);
	const gate = responseGate?.matches(url) ? responseGate : null;
	const response = await fetch(input, init);
	if (url.searchParams.has("with_companies") && url.searchParams.has("sort_by") && response.ok) studioResponses.set(url.pathname + url.search, await response.clone().json());
	if (url.searchParams.has("with_networks") && url.searchParams.has("sort_by") && response.ok) networkResponses.set(url.pathname + url.search, await response.clone().json());
	if (url.searchParams.get("with_companies") === "174" && url.searchParams.has("sort_by")) warnerResponses.set(url.pathname + url.search, await response.clone().json());
	if (gate) { gate.received = true; await gate.promise; }
	return response;
}

function holdLiveResponse(matches) {
	let release;
	const promise = new Promise((resolve) => { release = resolve; });
	responseGate = { matches, promise, release, received: false };
	return responseGate;
}
const peopleProvider = createTmdbPersonProvider({ fetchImpl: liveFetch });
const peopleManifestClient = createPeopleManifestClient();
const studioCatalogueProvider = createStudioCatalogueProvider({ catalogueUrl: "/data/companies.min.json" });
const networkCatalogueProvider = createNetworkCatalogueProvider({ catalogueUrl: "/data/tv-networks.min.json" });
const studioCountProvider = createTmdbStudioCountProvider({ fetchImpl: liveFetch });
const networkCountProvider = createTmdbNetworkCountProvider({ fetchImpl: liveFetch });
const studioPreviewProvider = createTmdbStudioPreviewProvider({ fetchImpl: liveFetch });
const networkPreviewProvider = createTmdbNetworkPreviewProvider({ fetchImpl: liveFetch });
const artworkRuntimeClient = createArtworkRuntimeClient();
const providers = { peopleProvider, peopleManifestClient, studioCatalogueProvider, networkCatalogueProvider, studioCountProvider, networkCountProvider, studioPreviewProvider, networkPreviewProvider, studioArtworkRuntimeClient: artworkRuntimeClient, networkArtworkRuntimeClient: artworkRuntimeClient };

async function entity(family, id) {
	const result = family === "people" ? await peopleProvider.getPerson(id)
		: family === "studio" ? await studioCatalogueProvider.searchStudios(parseStudioSearchInput(String(id)))
			: await networkCatalogueProvider.searchNetworks(parseNetworkSearchInput(String(id)));
	if (!result.ok) throw new Error("Live " + family + " identity unavailable: " + result.error?.message);
	const value = family === "people" ? result.data : result.data.results.find((entry) => entry.id === id);
	if (!value) throw new Error("Live catalogue identity missing: " + family + " " + id);
	return value;
}

export function runStudioMinimumVotesScenario(helpers, view) {
 return runNativeMinimumVotesScenario(helpers, { ...view, family: "studio" });
}

export function runNetworkMinimumVotesScenario(helpers, view) {
 return runNativeMinimumVotesScenario(helpers, { ...view, family: "network" });
}

async function runNativeMinimumVotesScenario(helpers, { family = "studio", scope, mediaType = "MOVIE" }) {
 const isNetwork = family === "network", entityId = isNetwork ? 213 : 3;
 if (isNetwork) mediaType = "TV";
 const { createController, importSources, clickAndSettle: click, afterCommittedEffects: settle, serializedValue, setInputValue, titlePreviewGeometry, waitForMountedCondition: wait } = helpers;
 const check = (value, message) => { if (!value) throw new Error(`${family} minimum votes ${scope} ${innerWidth}: ${message}`); return value; };
 const studio = await entity(family, entityId), app = createController(), editing = scope === "edit", guided = scope.startsWith("new-");
 const seed = { ...(isNetwork ? buildNetworkSourceDrafts(studio, { sortOptionIds: ["top-rated"] }) : buildStudioSourceDrafts(studio, { choices: [mediaType === "TV" ? "studio-series" : "studio-movies"], sortOptionIds: ["top-rated"] })).drafts[0].editable, id: "preserved-studio", filters: { voteCountGte: 0, "vote_count.gte": "0", ...(editing ? { withoutCompanies: "174" } : {}) }, ownerExtra: { keep: [false, 0] } };
 const folder = importSources(app, editing || scope === "new-folder" ? [seed] : []);
 app.selectNode(folder.internalId);
 const initial = app.getState(), before = serializedValue(app);
 let applied, applyCalls = 0, cancels = 0;
 const opened = editing ? createSourceEditSession(initial.project, folder.sources[0].internalId) : null;
 const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
 const evidence = { family, scope, width: innerWidth, height: innerHeight, mediaType, previews: [] };
 const apply = (payload) => {
  applyCalls += 1;
  applied = editing ? saveSourceEdit(app, opened.session, payload) : guided ? (isNetwork ? applyNetworkHierarchyPlan : applyStudioHierarchyPlan)(app, payload) : (isNetwork ? createNetworkSource : createStudioSourceBundle)(app, { ...payload, folderInternalId: folder.internalId });
  return applied;
 };
 const titleRequests = () => requests.filter((url) => url.includes("sort_by=")).length;
 const findButton = (parent, label) => [...parent.querySelectorAll("button")].find((button) => button.textContent.trim() === label);
 try {
  await act(async () => {
   root.render(editing ? createElement(SourceEditorDialog, { ...providers, session: opened.session, initialDraft: opened.draft, onSave: apply, onCancel() { cancels++; } })
    : guided ? createElement(CreationDialog, { ...providers, scope, initialOptionId: isNetwork ? "networks" : "studios", project: initial.project, projectRevision: initial.revision, destinationCollectionInternalId: initial.project.collections[0].internalId, destinationCollectionTitle: "Collection", onApplyStudios: apply, onApplyNetworks: apply, onCancel() { cancels++; } })
     : createElement(isNetwork ? NetworkSourceFlow : StudioSourceFlow, { catalogueProvider: isNetwork ? networkCatalogueProvider : studioCatalogueProvider, countProvider: isNetwork ? networkCountProvider : studioCountProvider, previewProvider: isNetwork ? networkPreviewProvider : studioPreviewProvider, project: initial.project, folder, onApply: apply, onBack() {}, onCancel() { cancels++; } }));
   await settle();
  });
  const dialog = check(document.querySelector(editing ? '[data-source-edit-modal="true"]' : guided ? '[data-creation-dialog="true"]' : '[data-add-source-modal="true"]'), "dialog missing");
  if (!editing) {
   check(document.activeElement?.type !== "search", "browse autofocus");
   await act(async () => { setInputValue(dialog.querySelector('input[type="search"]'), String(entityId)); await settle(); });
   await click(await wait(() => dialog.querySelector(`[data-tmdb-${family}-result="${entityId}"]`), { label: "Studio catalogue", timeoutMs: 15000 }));
   if (guided) await click(dialog.querySelector('button[type="submit"]'));
   await wait(() => dialog.querySelector(`[data-${family}-advanced]`), { label: "Studio Configure" });
   if (!isNetwork && guided) await click(dialog.querySelector('input[name="studio-hierarchy-media"][value="both"]'));
   else if (!isNetwork) for (const input of dialog.querySelectorAll('.studio-source-choices input')) if (!input.checked) await click(input);
   const sorts = [...dialog.querySelectorAll("fieldset")].find((field) => field.querySelector("legend")?.textContent === "Sources to create");
   for (const input of sorts.querySelectorAll("input")) if (input.checked !== ["top-rated", "most-votes"].includes(input.value)) await click(input);
  }
  const advanced = dialog.querySelector(`[data-${family}-advanced]`);
  check(advanced && !advanced.open, "Advanced default is expanded");
  const startRequests = titleRequests();
  await click(advanced.querySelector("summary"));
  const input = advanced.querySelector('#discover-field-voteCountGte');
  check(advanced.querySelector('#discover-help-voteCountGte')?.textContent === "Set the minimum number of TMDB votes a title must have. Higher values exclude titles with fewer votes.", "minimum helper copy differs");
  check(input.value === (editing ? "0" : ""), "minimum default changed");
  check(titleRequests() === startRequests && serializedValue(app) === before, "opening Advanced changed data or requested titles");
  const previewButton = () => dialog.querySelector(editing ? '[data-action="preview-source-edit"]' : guided ? '.studio-configure-row-actions button' : `[data-action="preview-add-${family}"]`);
  async function change(value) {
   const count = titleRequests();
   await act(async () => { setInputValue(input, value); await settle(); });
   check(titleRequests() === count, "field change requested titles");
  }
  async function preview(minimum, allVariants = false) {
   const count = titleRequests(), trigger = previewButton(), scroll = dialog.querySelector('.add-source-scroll, .source-edit-scroll');
   trigger.focus({ preventScroll: true });
   const scrollTop = scroll?.scrollTop;
   await click(trigger);
   const modal = document.querySelector('.source-edit-preview-modal');
   check(modal, "Preview missing");
   const tabs = (group) => [...modal.querySelectorAll(`[role="tablist"][aria-label="Preview ${group}"] [role="tab"]`)];
   check(tabs("media").length === (editing || isNetwork ? 0 : 2), "wrong Preview media options");
   check(tabs("show").length === (editing ? 0 : 2), "wrong Preview sort options");
   for (const media of isNetwork ? ["TV"] : allVariants && !editing ? ["MOVIE", "TV"] : [editing ? mediaType : "MOVIE"]) for (const sortBy of allVariants && !editing ? ["vote_average.desc", "vote_count.desc"] : ["vote_average.desc"]) {
    const mediaTab = tabs("media").find((tab) => tab.textContent === (media === "TV" ? "Series" : "Movies"));
    if (mediaTab && mediaTab.getAttribute("aria-selected") !== "true") await click(mediaTab);
    const sortTab = tabs("show").find((tab) => tab.textContent === (sortBy === "vote_count.desc" ? "Most voted" : "Top rated"));
    if (sortTab && sortTab.getAttribute("aria-selected") !== "true") await click(sortTab);
    await wait(() => {
     const error = modal.querySelector('[role="alert"]');
     if (error) throw new Error("Live Studio Preview failed: " + error.textContent);
     return !modal.querySelector('.studio-preview-state');
    }, { label: "Live Studio filtered Preview", timeoutMs: 20000 });
    const response = [...(isNetwork ? networkResponses : studioResponses)].find(([path]) => {
     const url = new URL(path, location.href);
     return url.pathname === '/builder/discover/' + (media === "TV" ? "tv" : "movie") && url.searchParams.get(isNetwork ? 'with_networks' : 'with_companies') === String(entityId) && url.searchParams.get('sort_by') === sortBy && url.searchParams.get('vote_count.gte') === (minimum === undefined ? null : String(minimum)) && url.searchParams.get('without_companies') === (editing ? "174" : null);
    });
    check(response, "no production response for current draft");
    const grid = modal.querySelector('.source-edit-preview-grid');
    check(grid, "real Preview grid missing");
    if (!editing) check(modal.querySelector('.studio-preview-single-media')?.textContent.includes(response[1].total_results.toLocaleString("en") + " titles"), "active response count differs");
    const exactUrl = new URL(response[0], location.href);
    check(exactUrl.searchParams.get("include_adult") === "false", "missing canonical adult exclusion");
    const expected = response[1].results.filter((row) => row.poster_path).slice(0, 10).map((row) => row.poster_path);
    const actual = [...grid.querySelectorAll('img')].map((img) => new URL(img.src).pathname.replace(/^\/t\/p\/w\d+/, ''));
    check(JSON.stringify(actual) === JSON.stringify(expected), "displayed posters differ from real current response");
    await wait(() => [...grid.querySelectorAll('img')].every((img) => img.complete && img.naturalWidth > 0), { label: "real Studio image CDN", timeoutMs: 20000 });
    evidence.previews.push({ query: response[0], resultsMatch: true, geometry: titlePreviewGeometry(modal, grid) });
    if (isNetwork && allVariants && (innerWidth === 393 || innerWidth === 1280) && globalThis.capture204Preview) await new Promise((resolve) => {
     window.__finish204Capture = resolve;
     window.capture204Preview(JSON.stringify({ name: `network-${scope}-${innerWidth}-${innerHeight}-${sortBy.replace(/[._]/g, "-")}-preview` }));
    });
   }
   await click(modal.querySelector('header button'));
   check(document.activeElement === trigger, "Preview focus not restored");
   check(scroll?.scrollTop === scrollTop && window.scrollY === 0, "Preview moved outer scroll owner");
   check(serializedValue(app) === before, "Preview saved data");
   return titleRequests() - count;
  }
  await preview(editing ? 0 : undefined);
  for (const invalid of ["-1", "1.5", "abc", "2147483648"]) {
   await change(invalid);
   check(input.getAttribute('aria-invalid') === "true" && previewButton().disabled, "invalid minimum previewable");
   if (!editing) check(dialog.querySelector('button[type="submit"]').disabled, "invalid minimum can create");
  }
  await change("0"); await preview(0);
  await change("100"); await preview(100, true);
  await change("");
  await click(advanced.querySelector('summary')); await click(advanced.querySelector('summary'));
  check(input.value === "", "closing Advanced revived threshold");
  await preview(undefined);
  check(await preview(undefined) === 0, "reopen missed complete-query cache");
  await change("100");
  check(!dialog.querySelector(`[data-${family}-minimum-votes-summary]`), "configuration repeats the minimum beneath Advanced");
  if (isNetwork && (innerWidth === 393 || innerWidth === 1280) && globalThis.capture204Preview) {
   input.scrollIntoView({ block: "center" });
   await new Promise((resolve) => {
    window.__finish204Capture = resolve;
    window.capture204Preview(JSON.stringify({ name: `network-${scope}-${innerWidth}-${innerHeight}-advanced` }));
   });
  }
  check(dialog.scrollWidth <= dialog.clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth, "horizontal overflow");
  await click(dialog.querySelector('button[type="submit"]'));
  if (guided && !applied) {
   await wait(() => dialog.querySelector('.studio-hierarchy-appearance'), { label: "Studio Appearance", timeoutMs: 20000 });
   check(dialog.querySelector(`[data-${family}-minimum-votes-summary]`)?.textContent === "Minimum votes: 100", "plan review lost threshold");
   await click(dialog.querySelector('button[type="submit"]'));
  }
  check(applied?.ok && applyCalls === 1 && app.getState().revision === initial.revision + 1, "apply was not one atomic revision");
  const output = JSON.parse(serializedValue(app)), outputSources = output.flatMap((collection) => collection.folders.flatMap((folder) => folder.sources));
  const added = editing ? outputSources : outputSources.filter((source) => source.id !== seed.id);
  check(added.length === (editing ? 1 : isNetwork ? 2 : 4), "incorrect media/sort source count");
  check(added.every((source) => source.provider === "tmdb" && source.tmdbSourceType === (isNetwork ? "NETWORK" : "COMPANY") && source.tmdbId === entityId && source.filters.voteCountGte === 100), "export differs from Preview/Review");
  check(output.every((collection) => collection.folders.every((folder) => !(folder.catalogSources?.length))), "native source gained a projection");
  evidence.atomic = true;
  await act(async () => { root.unmount(); await settle(); }); host.remove();
  // Opening, Cancel, unchanged and title-only editing retain imported fields exactly.
  for (const action of ["cancel", "unchanged", "title"]) {
   const preservationApp = createController(); const preservedFolder = importSources(preservationApp, [{ ...seed, filters: { ...seed.filters, ownerFilter: { keep: true } } }]);
   const saved = serializedValue(preservationApp), session = createSourceEditSession(preservationApp.getState().project, preservedFolder.sources[0].internalId);
   const node = document.createElement('div'); document.body.append(node); const editRoot = createRoot(node); let result;
   try {
    await act(async () => { editRoot.render(createElement(SourceEditorDialog, { ...providers, session: session.session, initialDraft: session.draft, onSave: (draft) => { result = saveSourceEdit(preservationApp, session.session, draft); return result; }, onCancel() {} })); await settle(); });
    const edit = document.querySelector('[data-source-edit-modal]');
    await click(edit.querySelector(`[data-${family}-advanced] summary`));
    check(edit.querySelector('[data-action="preview-source-edit"]').disabled, "unknown imported filter Preview not blocked");
    if (action === "cancel") await click(findButton(edit, "Cancel"));
    else {
     if (action === "title") await act(async () => { setInputValue(edit.querySelector('[data-source-edit-field="title"]'), 'Renamed Studio'); await settle(); });
     await click(edit.querySelector('button[type="submit"]')); check(result?.ok, "preservation Save failed");
    }
    const expected = JSON.parse(saved); if (action === "title") expected[0].folders[0].sources[0].title = 'Renamed Studio';
    check(JSON.stringify(JSON.parse(serializedValue(preservationApp))) === JSON.stringify(expected), action + " altered imported settings");
   } finally { await act(async () => { editRoot.unmount(); await settle(); }); node.remove(); }
  }
  evidence.preservation = true;
  return evidence;
 } finally { if (host.isConnected) { await act(async () => { root.unmount(); await settle(); }); host.remove(); } }
}

export async function runNativeSourceVariantsScenario(helpers, view) {
	const { createController, importSources, clickAndSettle: click, afterCommittedEffects: settle, serializedValue, setInputValue, titlePreviewGeometry, waitForMountedCondition: wait } = helpers;
	const { family, scope, width, height, forcedColors = false, sourceLevel = false, representation = "partial", singleEntity = false, warner = false, noticeStyle = false } = view;
	const name = [noticeStyle ? "notices" : sourceLevel ? "source-level" : "variants", family, scope, representation, width, height, forcedColors ? "forced" : "normal"].join("-");
	const check = (value, message) => { if (!value) throw new Error(name + ": " + message); return value; };
	const required = (value, message) => check(value, message + " missing");
	const guided = scope !== "add";
	const primary = await entity(family, family === "people" ? 31 : family === "studio" ? warner ? 174 : 3 : 2);
	const secondary = scope === "new-folder" && !singleEntity ? await entity(family, family === "people" ? 190 : family === "studio" ? 2 : 6) : null;
	const tertiary = sourceLevel && !singleEntity ? await entity(family, family === "people" ? 40 : family === "studio" ? 174 : 19) : null;
	const build = (item, ids = ["popular"]) => family === "people" ? buildPeopleSourceDrafts(item, { combinations: PEOPLE_SOURCE_COMBINATIONS.map((entry) => entry.id), sortOptionIds: ids })
		: family === "studio" ? buildStudioSourceDrafts(item, { choices: ["studio-movies", "studio-series"], sortOptionIds: ids }) : buildNetworkSourceDrafts(item, { sortOptionIds: ids });
	const allSorts = ["popular", "recent", "top-rated", "most-votes"];
	const app = createController();
	const seeds = sourceLevel ? singleEntity ? build(primary).drafts : build(primary, allSorts).drafts.slice(0, 2) : [build(primary).drafts[0]];
	const importedSource = (seed, id) => ({ ...seed.editable, id, title: "My source " + id, addonId: null });
	importSources(app, seeds.slice(0, sourceLevel && !singleEntity ? 1 : seeds.length).map((seed, index) => importedSource(seed, "preserved-native-" + index)));
	if (sourceLevel && !singleEntity) {
		const imported = JSON.parse(serializedValue(app));
		imported[0].folders[0].title = "My renamed favourites";
		imported[0].folders.push(
			{ id: "second-match", title: "Other favourites", tileShape: "LANDSCAPE", ownerNote: "Keep this folder", sources: [importedSource(seeds[1], "split-source")] },
			{ id: "complete-match", title: "Already arranged", sources: build(tertiary, allSorts).drafts.map((draft, index) => importedSource(draft, "complete-" + index)) },
		);
		check(app.importValue(imported).ok, "split imported folders");
	}
	if (noticeStyle && scope === "add") {
		// Local saved-project overlap uses the real catalogue entity and native drafts.
		const imported = JSON.parse(serializedValue(app));
		imported[0].folders.push({ id: "elsewhere", title: "Another folder with a longer user-written title", sources: [importedSource(build(primary, allSorts).drafts[1], "elsewhere-source")] });
		check(app.importValue(imported).ok, "notice overlap import");
	}
	const folder = app.getState().project.collections[0].folders[0];
	app.selectNode(folder.internalId);
	const before = serializedValue(app), revision = app.getState().revision;
	const originalFolders = structuredClone(app.getState().project.collections[0].folders);
	let applied = null, output = null, applyCalls = 0;
	const apply = (payload) => {
		output = payload; applyCalls += 1;
		applied = guided ? (family === "people" ? applyPeopleHierarchyPlan : family === "studio" ? applyStudioHierarchyPlan : applyNetworkHierarchyPlan)(app, payload)
			: (family === "people" ? createPeopleSourceBundle : family === "studio" ? createStudioSourceBundle : createNetworkSource)(app, { ...payload, folderInternalId: folder.internalId, destination: { kind: "existing-folder", folderInternalId: folder.internalId } });
		return applied;
	};
	const host = document.createElement("div"); document.body.append(host);
	const root = createRoot(host), errors = [], oldError = console.error;
	console.error = (...args) => { errors.push(args.map(String).join(" ")); oldError(...args); };
	let geometry, context, cacheReused = false, editorVerified = false, staleResponseRejected = null, placementEvidence = null, warnerEvidence = null;
	const requestStart = requests.length;
	const noticeEvidence = [];
	const findButton = (parent, text) => [...parent.querySelectorAll("button")].find((button) => button.textContent.trim() === text);
	async function capture(captureName) {
		if (!window.captureNativePreview) return;
		await act(async () => {
			await new Promise((resolve) => { window.__finishNativeCapture = resolve; window.captureNativePreview(JSON.stringify({ name: captureName })); });
			await settle();
		});
	}
	async function inspectNotice(surface, selector, label) {
		const notice = required(surface.querySelector(selector), label);
		const style = getComputedStyle(notice), sides = ["Top", "Right", "Bottom", "Left"];
		const borders = sides.map((side) => [style["border" + side + "Width"], style["border" + side + "Style"], style["border" + side + "Color"]]);
		check(borders.every((border) => border[0] === "1px" && border[1] === "solid" && JSON.stringify(border) === JSON.stringify(borders[0])), label + " has an uneven border");
		check(notice.scrollWidth <= notice.clientWidth + 1, label + " text overflows");
		const actions = [...surface.querySelectorAll('.add-source-actions button:not([disabled])')];
		check(actions.length > 0, label + " has no reachable action");
		for (const action of actions) {
			action.focus({ preventScroll: true });
			const rect = action.getBoundingClientRect();
			check(document.activeElement === action && rect.top >= 0 && rect.bottom <= height && rect.left >= 0 && rect.right <= width, label + " action is unreachable");
		}
		const owner = notice.closest(".add-source-scroll");
		if (owner) owner.scrollTop += notice.getBoundingClientRect().top - owner.getBoundingClientRect().top - 12;
		await settle();
		check(document.documentElement.scrollWidth <= width && window.scrollY === 0, label + " outer overflow");
		noticeEvidence.push({ label, borders, background: style.backgroundColor, text: notice.textContent, actionsReachable: true });
		await capture(name + "-" + label);
	}
	async function readyPreview() {
		return wait(() => {
			const preview = document.querySelector(".source-edit-preview-modal");
			if (!preview) return null;
			const failure = preview.querySelector('[role="alert"]');
			if (failure) throw new Error(name + ": live Preview failed: " + failure.textContent);
			return !preview.querySelector(".studio-preview-state") ? preview : null;
		}, { label: name + " live Preview", timeoutMs: 35000 });
	}
	try {
		await act(async () => {
			root.render(guided ? createElement(CreationDialog, {
				...providers, scope, initialOptionId: family === "people" ? "people" : family === "studio" ? "studios" : "networks",
				project: app.getState().project, projectRevision: revision, destinationCollectionInternalId: app.getState().project.collections[0].internalId, destinationCollectionTitle: "Collection",
				onApplyPeople: apply, onApplyStudios: apply, onApplyNetworks: apply, onCancel() {},
			}) : createElement(family === "people" ? PeopleSourceFlow : family === "studio" ? StudioSourceFlow : NetworkSourceFlow, {
				provider: peopleProvider, manifestClient: peopleManifestClient, project: app.getState().project, folder,
				catalogueProvider: family === "studio" ? studioCatalogueProvider : networkCatalogueProvider,
				countProvider: family === "studio" ? studioCountProvider : networkCountProvider,
				previewProvider: family === "studio" ? studioPreviewProvider : networkPreviewProvider,
				onApply: apply, onBack() {}, onCancel() {},
			}));
			await settle();
		});
		const dialog = required(document.querySelector(guided ? '[data-creation-dialog="true"]' : '[data-add-source-modal="true"]'), "creation dialog");
		if (guided || family !== "people") check(document.activeElement?.type !== "search", "browse unexpectedly focused Search");
		const submit = () => click(required(dialog.querySelector('button[type="submit"]'), "primary action"));
		for (const item of [primary, secondary, tertiary].filter(Boolean)) {
			const input = required(dialog.querySelector('input[type="search"]'), "search");
			await act(async () => { setInputValue(input, String(item.id)); await settle(); });
			const card = await wait(() => dialog.querySelector('[data-tmdb-' + (family === "people" ? "person" : family) + '-result="' + item.id + '"]'), { label: name + " catalogue result", timeoutMs: 15000 });
			await click(card);
		}
		if (guided) await submit();
		await wait(() => dialog.querySelector(".semantic-sort-choices"), { label: name + " configure", timeoutMs: 15000 });
		if (family === "people") {
			if (guided) {
				await click(required(dialog.querySelector('.people-configuration-mode input[value="shared"]'), "shared configuration"));
				const shared = required([...dialog.querySelectorAll("fieldset")].find((node) => node.querySelector("legend")?.textContent === "Sources for every selected person"), "shared roles");
				for (const input of [...shared.querySelectorAll("input")]) if (!input.checked) await click(input);
				await wait(() => [...dialog.querySelectorAll(".people-bulk-entry")].every((entry) => !entry.textContent.includes("Loading")), { label: name + " live combined credits", timeoutMs: 35000 });
			} else {
				await wait(() => [...dialog.querySelectorAll(".people-combination-group input")].length > 0 && [...dialog.querySelectorAll(".people-combination-group input")].every((input) => !input.disabled), { label: name + " live combined credits", timeoutMs: 35000 });
				for (const input of [...dialog.querySelectorAll(".people-combination-group input")]) if (!input.checked) await click(input);
			}
		} else if (family === "studio") {
			if (guided) await click(required(dialog.querySelector('input[name="studio-hierarchy-media"][value="both"]'), "both media"));
			else for (const input of [...dialog.querySelectorAll(".studio-source-choices input")]) if (!input.checked) await click(input);
		}
		let sorts = required([...dialog.querySelectorAll("fieldset")].find((fieldset) => fieldset.querySelector("legend")?.textContent === "Sources to create"), "Sources to create");
		check([...sorts.querySelectorAll("input")].map((input) => input.type).every((type) => type === "checkbox"), "creation is not multi-select");
		check(sorts.querySelector('input[value="popular"]').checked, "Popular default");
		if (sourceLevel && singleEntity) {
			await wait(() => dialog.querySelector('[data-native-folder-placement="complete"]'), { label: name + " full Popular coverage", timeoutMs: 35000 });
			check(dialog.querySelector('button[type="submit"]').disabled && dialog.textContent.includes("No new sources to add."), "fully present gate");
			check(!dialog.querySelector(".native-folder-destination"), "complete entity asked for a destination");
			if (family === "people") {
				const present = [...dialog.querySelectorAll(".people-bulk-list .people-combination-group input")];
				check(present.length === 4 && present.every((input) => input.checked && input.disabled && input.getAttribute("aria-label").includes("Already added")), "fully present role choices are not labelled/disabled with intent retained");
				const pill = present[0].closest("label");
				check(getComputedStyle(pill).boxShadow === "none" && getComputedStyle(pill).color === getComputedStyle(pill.querySelector("em")).color, "fully present pill retains selected styling");
				await act(async () => { pill.scrollIntoView({ block: "center" }); await settle(); });
			}
			await capture(name + "-already-added");
		}
		await click(sorts.querySelector('input[value="popular"]'));
		check(dialog.textContent.includes("Choose at least one option."), "empty validation");
		check(dialog.querySelector('button[type="submit"]').disabled, "empty creation allowed");
		const titleRequestsBefore = requests.filter((path) => path.includes("sort_by=")).length;
		for (const input of [...sorts.querySelectorAll("input")]) if (!input.checked) await click(input);
		check(requests.filter((path) => path.includes("sort_by=")).length === titleRequestsBefore, "checkbox issued title request");
		check(dialog.textContent.includes("Selected: Popular, Recent, Top rated, Most voted"), "selected summary");
		const expectedSlots = family === "people" ? 16 : family === "studio" ? 8 : 4;
		if (sourceLevel) {
			await wait(() => dialog.querySelector('[data-native-folder-placement="partial"]'), { label: name + " recalculated missing sources", timeoutMs: 35000 });
			check(dialog.querySelectorAll(".native-folder-duplicate-notice").length === 1, "duplicate notice repeated or missing");
			check(!dialog.textContent.includes("Create a separate folder anyway") && !dialog.textContent.includes("Open existing folder"), "obsolete duplicate action");
			check([...sorts.querySelectorAll("input")].every((input) => !input.disabled), "shared sort disabled");
			if (family === "people") {
				const choices = [...dialog.querySelectorAll(".people-bulk-list .people-combination-group input")].slice(0, 4);
				check(choices.length === 4 && choices.every((input) => input.checked && !input.disabled), "missing sorts did not re-enable existing roles");
			}
			let destination = dialog.querySelector(".native-folder-destination select");
			if (!singleEntity) {
				check(destination && destination.value === "" && dialog.querySelector('button[type="submit"]').disabled, "ambiguous destination guessed");
				check(dialog.querySelectorAll('[data-native-folder-placement="complete"]').length === 1 && dialog.querySelectorAll('[data-native-folder-placement="new"]').length === 1, "mixed complete/new entries");
				await act(async () => { destination.value = originalFolders[1].internalId; destination.dispatchEvent(new Event("change", { bubbles: true })); await settle(); });
				check(!dialog.querySelector('button[type="submit"]').disabled, "resolved mixed batch blocked");
			}
			await click(sorts.querySelector('input[value="recent"]'));
			await click(sorts.querySelector('input[value="recent"]'));
			if (!singleEntity) check(destination.value === originalFolders[1].internalId, "sort change lost valid destination");
			const individualChoice = family === "people" && !singleEntity ? dialog.querySelectorAll(".people-bulk-list .people-combination-group input")[4] : null;
			if (individualChoice) await click(individualChoice);
			await click(required([...dialog.querySelectorAll("button")].find((button) => button.textContent.trim().endsWith("Back")), "Configure Back"));
			await submit();
			sorts = required([...dialog.querySelectorAll("fieldset")].find((node) => node.querySelector("legend")?.textContent === "Sources to create"), "restored sorts");
			check([...sorts.querySelectorAll("input")].every((input) => input.checked), "Back lost sorts");
			if (individualChoice) {
				const restored = dialog.querySelectorAll(".people-bulk-list .people-combination-group input");
				check(!restored[4].checked && [...restored].every((input, index) => index === 4 || input.checked), "Back lost per-person intent or other selections");
				await click(restored[4]);
			}
			destination = dialog.querySelector(".native-folder-destination select");
			if (!singleEntity) check(destination?.value === originalFolders[1].internalId, "Back lost destination");
			check(requests.filter((path) => path.includes("sort_by=")).length === titleRequestsBefore, "recalculation or Back issued title request");
			const target = destination ?? required([...dialog.querySelectorAll("button")].find((button) => button.textContent.trim() === "Preview" || button.textContent.trim() === "Preview titles"), "keyboard target");
			target.focus(); await settle();
			const rect = target.getBoundingClientRect();
			check(document.activeElement === target && rect.top >= 0 && rect.bottom <= height && rect.left >= 0 && rect.right <= width, "keyboard target offscreen");
			const scrollOwners = [...dialog.querySelectorAll("*")].filter((node) => /auto|scroll/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight + 1);
			check(scrollOwners.length <= 1 && dialog.scrollTop === 0 && [...dialog.querySelectorAll("form")].every((node) => node.scrollTop === 0), "nested/outer Configure scrolling");
			check(document.documentElement.scrollWidth <= width && window.scrollY === 0, "Configure page overflow or outer scroll");
			await capture(name + "-configure");
			placementEvidence = { singleEntity, fullGateVerified: singleEntity, resolvedInline: !singleEntity, choicesPreserved: true, keyboardReachable: true, summary: dialog.querySelector(".native-folder-placement-summary").textContent };
		}
		if (noticeStyle) {
			await inspectNotice(dialog, guided ? ".native-folder-duplicate-notice" : ".studio-duplicate-note", "warning");
			if (!guided) await inspectNotice(dialog, ".source-elsewhere-note", "elsewhere");
		}
		const trigger = await wait(() => [...dialog.querySelectorAll("button")].find((button) => ["Preview titles", "Preview"].includes(button.textContent.trim()) && !button.disabled), { label: name + " Preview action", timeoutMs: 20000 });
		const configured = [...sorts.querySelectorAll("input")].map((input) => [input.value, input.checked]);
		if (width === 393 && height === 852) await capture(name + "-configure");
		await click(trigger);
		const preview = await readyPreview();
		if (warner) {
			await click(required(findButton(preview, "Top rated"), "Warner Top rated")); await readyPreview();
			const query = [...warnerResponses.keys()].find((key) => key.includes("/discover/movie?") && new URL("https://example.invalid" + key).searchParams.get("sort_by") === "vote_average.desc");
			const response = required(warnerResponses.get(query), "actual Warner Top rated response");
			check(preview.textContent.includes("Warner Bros. Pictures") && preview.textContent.includes("Top rated Movies"), "Warner candidate/context");
			const displayed = [...preview.querySelectorAll("img")].map((img) => new URL(img.src).pathname.split("/").at(-1));
			const expected = response.results.filter((entry) => entry.poster_path).slice(0, 10).map((entry) => entry.poster_path.slice(1));
			check(JSON.stringify(displayed) === JSON.stringify(expected), "Warner displayed candidate differs from response");
			await wait(() => [...preview.querySelectorAll("img")].every((img) => img.complete && img.naturalWidth > 0), { label: "Warner actual Top rated posters", timeoutMs: 35000 });
			await capture(name + "-warner-top-rated");
			await click(findButton(preview, "Most voted")); await readyPreview();
			const visited = requests.length;
			await click(findButton(preview, "Top rated")); await readyPreview();
			check(requests.length === visited, "Warner Top rated cache not reused");
			warnerEvidence = { query, company: primary.id, media: "MOVIE", sortBy: "vote_average.desc", displayed, cacheReused: true, sample: response.results.slice(0, 10).map(({ id, title, vote_average, vote_count }) => ({ id, title, vote_average, vote_count })) };
		}
		if (family === "studio" && scope === "add" && width === 393 && height === 852) {
			// Delay delivery of one actual production response; never manufacture external data.
			const gate = holdLiveResponse((url) => url.searchParams.get("sort_by") === "primary_release_date.desc");
			await click(required(findButton(preview, "Recent"), "Show Recent"));
			check(preview.querySelectorAll("img").length === 0 && !preview.querySelector(".studio-preview-single-media")?.textContent.includes("titles"), "loading kept old posters/count");
			await wait(() => gate.received, { label: "actual Recent response before delayed delivery", timeoutMs: 35000 });
			await click(required(findButton(preview, "Top rated"), "Show Top rated")); await readyPreview();
			const latest = preview.textContent;
			gate.release(); responseGate = null; await settle();
			staleResponseRejected = preview.textContent === latest && preview.textContent.includes("Top rated Movies");
			check(staleResponseRejected, "late Recent response replaced active Top rated");
		}
		const beforeSwitch = requests.length;
		await click(required(findButton(preview, "Most voted"), "Show Most voted"));
		check(document.querySelector(".source-edit-preview-modal") === preview, "Preview remounted");
		await readyPreview();
		if (family === "people") {
			await click(required(findButton(preview, "Series"), "Series")); await readyPreview();
			await click(required(findButton(preview, "Directing"), "Directing")); await readyPreview();
			check(preview.textContent.includes("Directing · Most voted Series"), "role switch lost media/sort");
		} else if (family === "studio") {
			await click(required(findButton(preview, "Series"), "Series")); await readyPreview();
			check(preview.textContent.includes("Most voted Series"), "media switch lost sort");
		}
		context = preview.querySelector(".studio-preview-single-media")?.textContent;
		check(context?.includes("titles"), "exact active count absent");
		const imageNodes = [...preview.querySelectorAll("img")];
		check(imageNodes.length <= 10 && imageNodes.every((img) => new URL(img.src).hostname === "image.tmdb.org"), "poster contract");
		if (imageNodes.length) await wait(() => imageNodes.every((img) => img.complete && img.naturalWidth > 0), { label: name + " real TMDB posters", timeoutMs: 35000 });
		geometry = titlePreviewGeometry(preview, required(preview.querySelector(".source-edit-preview-grid"), "poster grid"));
		check(geometry.withinViewport && geometry.closeReachable && geometry.pageNoHorizontalOverflow && geometry.gridNoHorizontalScroll && geometry.activeScrollOwnerCount <= 1, "Preview geometry " + JSON.stringify(geometry));
		await capture(name);
		await click(required(findButton(preview, "Close"), "Preview Close"));
		check(document.activeElement === trigger, "Preview did not restore focus");
		const countAfterVisited = requests.length;
		await click(trigger); await readyPreview();
		cacheReused = requests.length === countAfterVisited;
		await click(findButton(document.querySelector(".source-edit-preview-modal"), "Close"));
		check(JSON.stringify(configured) === JSON.stringify([...sorts.querySelectorAll("input")].map((input) => [input.value, input.checked])), "Preview changed creation choices");
		check(serializedValue(app) === before && applyCalls === 0, "Preview mutated project");
		if (family === "people") check(requests.length === beforeSwitch, "People Preview refetched loaded credits");
		const appendOnly = sourceLevel && singleEntity;
		if (guided && !appendOnly) {
			await submit();
			await wait(() => dialog.textContent.includes("Appearance") && !dialog.querySelector('button[type="submit"]').disabled, { label: name + " review", timeoutMs: 35000 });
			if (sourceLevel) {
				check(dialog.textContent.includes("Appearance applies only to new folders.") && dialog.querySelector('button[type="submit"]').textContent === "Apply changes", "mixed appearance/action wording");
				await click(required(dialog.querySelector('input[value="HIDE_EVERYWHERE"]'), "new-folder title visibility"));
				await click(required([...dialog.querySelectorAll("button")].find((button) => button.textContent.trim().endsWith("Back")), "Appearance Back"));
				check(dialog.querySelector(".native-folder-destination select")?.value === originalFolders[1].internalId, "Appearance Back lost destination");
				await submit();
				await wait(() => dialog.querySelector('input[value="HIDE_EVERYWHERE"]')?.checked, { label: name + " retained appearance", timeoutMs: 15000 });
				for (const label of dialog.querySelectorAll(".people-folder-shape-field .editor-shape-choice")) check(label.scrollWidth <= label.clientWidth, "Appearance shape label overflows its card");
				await capture(name + "-appearance");
			}
		} else if (appendOnly) check(dialog.querySelector('button[type="submit"]').textContent === "Add sources", "append-only action wording");
		await submit();
		await wait(() => applied, { label: name + " batch apply", timeoutMs: 15000 });
		check(applied?.ok && applyCalls === 1 && app.getState().revision === revision + 1, "atomic creation " + JSON.stringify(applied));
		if (appendOnly) check(!dialog.querySelector(".people-review-step, .studio-hierarchy-appearance"), "append-only reached Appearance");
		const addedCount = guided ? output.counts.sourceCount : applied.addedSourceCount;
		const expectedCount = scope === "add" ? expectedSlots - 1 : scope === "new-folder" ? sourceLevel ? singleEntity ? expectedSlots - seeds.length : expectedSlots * 2 - 2 : expectedSlots * 2 - 1 : expectedSlots;
		check(addedCount === expectedCount, "source count " + addedCount + " expected " + expectedCount);
		if (scope === "new-folder") {
			const afterFolders = app.getState().project.collections[0].folders;
			check(afterFolders.length === originalFolders.length + (singleEntity ? 0 : 1), "new folder count");
			for (const original of originalFolders) {
				const current = required(afterFolders.find((item) => item.internalId === original.internalId), "preserved folder");
				check(JSON.stringify({ ...current, sources: original.sources }) === JSON.stringify(original), "existing folder settings changed");
				check(JSON.stringify(current.sources.slice(0, original.sources.length)) === JSON.stringify(original.sources), "existing Sources moved or changed");
			}
			if (sourceLevel && !singleEntity) {
				check(afterFolders[0].sources.length === 1 && afterFolders[1].sources.length === expectedSlots - 1 && afterFolders[2].sources.length === expectedSlots, "split exact coverage duplicated/moved");
				check(output.counts.folderCount === 1 && output.counts.existingFolderAdditionCount === 1, "mixed outcome counts");
				check(output.folders[0].editable.title !== secondary.name, "new folder appearance not applied");
			}
		}
		await act(async () => { root.render(null); await settle(); });
		const source = app.getState().project.collections.flatMap((collection) => collection.folders).flatMap((entry) => entry.sources).find((entry) => entry.editable.sortBy === "vote_count.desc");
		const opened = createSourceEditSession(app.getState().project, source.internalId), editBefore = serializedValue(app);
		await act(async () => { root.render(createElement(SourceEditorDialog, { ...providers, session: opened.session, initialDraft: opened.draft, onCancel() {}, onSave: (draft) => saveSourceEdit(app, opened.session, draft) })); await settle(); });
		const edit = required(document.querySelector('[data-source-edit-modal="true"]'), "scalar editor");
		const scalarSort = required([...edit.querySelectorAll("fieldset")].find((fieldset) => fieldset.querySelector("legend")?.textContent === "Sort titles by"), "scalar label");
		check(scalarSort.querySelectorAll('input[type="radio"]').length === 4 && scalarSort.querySelectorAll('input[type="checkbox"]').length === 0, "editor became multi-select");
		check(scalarSort.querySelector('input[value="most-votes"]')?.checked, "Most voted scalar prepopulation");
		const editTrigger = required(edit.querySelector('[data-action="preview-source-edit"]'), "editor Preview");
		await click(editTrigger);
		const editorPreview = await readyPreview();
		check(editorPreview.querySelectorAll('[role="tablist"]').length === 0, "scalar Preview gained variant selectors");
		await click(findButton(editorPreview, "Close"));
		if (noticeStyle) {
			const title = required(edit.querySelector("#source-edit-title-input"), "Source name"), originalTitle = title.value;
			await act(async () => { setInputValue(title, ""); await settle(); });
			await click(required(edit.querySelector('button[type="submit"]'), "invalid Save"));
			await inspectNotice(edit, ".source-edit-diagnostics", "error");
			check(serializedValue(app) === editBefore, "validation error changed saved content");
			await act(async () => { setInputValue(title, originalTitle); await settle(); });
		}
		await click(required(edit.querySelector('button[type="submit"]'), "Save"));
		check(serializedValue(app) === editBefore, "no-op editor changed output");
		editorVerified = true;
		if (sourceLevel && family === "studio" && singleEntity && width === 393) {
			const workspaceApp = createController();
			check(workspaceApp.importValue(JSON.parse(before)).ok, "Workspace import");
			const collection = workspaceApp.getState().project.collections[0];
			workspaceApp.selectNode(collection.internalId);
			const workspaceRevision = workspaceApp.getState().revision;
			await act(async () => { root.render(createElement(helpers.MountedWorkspace, { controller: workspaceApp, ...providers })); await settle(); });
			await click(required(document.querySelector('[data-action="create-folder"]'), "Workspace New Folder"));
			await click(required(document.querySelector('button[data-creation-option="studios"]'), "Studio launcher"));
			await act(async () => { setInputValue(document.querySelector('input[type="search"]'), String(primary.id)); await settle(); });
			await click(await wait(() => document.querySelector('[data-tmdb-studio-result="' + primary.id + '"]'), { label: "Workspace live Studio", timeoutMs: 15000 }));
			await click(document.querySelector('[data-creation-dialog="true"] button[type="submit"]'));
			await click(required(document.querySelector('.semantic-sort-choices input[value="recent"]'), "Workspace Recent"));
			const applyButton = required(document.querySelector('[data-creation-dialog="true"] button[type="submit"]'), "Workspace Add sources");
			check(applyButton.textContent === "Add sources" && !applyButton.disabled, "Workspace append-only primary");
			await click(applyButton);
			await wait(() => !document.querySelector('[data-creation-dialog="true"]'), { label: "Workspace append completed", timeoutMs: 15000 });
			check(workspaceApp.getState().revision === workspaceRevision + 1 && workspaceApp.getState().project.collections[0].folders.length === 1 && workspaceApp.getState().project.collections[0].folders[0].sources.length === seeds.length + 1, "Workspace append result");
			await capture(name + "-workspace-appended");
			check(document.body.textContent.includes("Added 1 source across 1 folder."), "Workspace status: " + document.body.textContent.slice(-1800));
			await wait(() => document.activeElement !== document.body && document.activeElement.getBoundingClientRect().height > 0, { label: "Workspace focus after append", timeoutMs: 3000 });
			placementEvidence.workspaceAppend = true;
		}
		return { ...view, name, created: true, previewIndependent: true, cacheReused, editorVerified, staleResponseRejected, placementEvidence, warnerEvidence, noticeEvidence, context, geometry, addedCount, requests: requests.slice(requestStart), errors };
	} finally {
		responseGate?.release(); responseGate = null;
		await act(async () => root.unmount()); host.remove(); console.error = oldError;
	}
}
