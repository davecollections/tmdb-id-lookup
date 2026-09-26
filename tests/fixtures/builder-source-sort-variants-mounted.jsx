import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { CreationDialog, DecadesReviewStep } from "../../builder/src/ui/CreationDialog.jsx";
import { createDecadesCreationState, prepareDecadesReview, buildDecadesCreationPlan } from "../../builder/src/ui/decades-creation-state.js";
import { GenreSourceFlow } from "../../builder/src/ui/GenreSourceFlow.jsx";
import { StreamingSourceFlow } from "../../builder/src/ui/StreamingSourceFlow.jsx";
import { DecadeSourceFlow } from "../../builder/src/ui/DecadeSourceFlow.jsx";
import {
	createTmdbDecadesPreviewProvider, createTmdbGenrePreviewProvider, createTmdbStreamingPreviewProvider,
	createGenreSourceBundle, createStreamingSourceBundle, createDecadeSourceBundle,
	applyGenreHierarchyPlan, applyStreamingHierarchyPlan, applyDecadesHierarchyPlan,
	buildGenreSourceDrafts, buildStreamingSourceDrafts, buildDecadeSourceBundleDrafts,
	DECADE_PRESETS, completeOfficialGenreNames,
} from "../../builder/src/source-add/index.js";

// Dave explicitly requested controlled responses for #198's interaction matrix.
// This exercises real components/providers/requester/cache with injected transport;
// it is not evidence of live TMDB availability or owner acceptance.
export async function runSourceSortVariantsScenario(helpers, { wordingOnly = false } = {}) {
	const { createController, importSources, clickAndSettle: click, afterCommittedEffects: settle, serializedValue, inputContaining, setInputValue, titlePreviewGeometry } = helpers;
	const check = (condition, message) => { if (!condition) throw new Error(message); };
	const required = (element, label) => { check(element, `${label} missing`); return element; };
	const results = [];
	const editors = [];
	const errors = [];
	const oldConsoleError = console.error;
	console.error = (...args) => { errors.push(args.map(String).join(" ")); oldConsoleError(...args); };
	try {
	for (const family of ["streaming", "genre", "decade"]) for (const scope of wordingOnly ? ["add", "new-collection"] : ["add", "new-collection", "new-folder"]) {
		const guided = scope !== "add";
		const name = `${family}-${scope}`;
		const app = createController();
		const folder = importSources(app, []);
		app.selectNode(folder.internalId);
		const before = serializedValue(app);
		const requests = [];
		let failNext = false;
		let holdNext = false;
		let held = null;
		const fetchImpl = async (input) => {
			const url = new URL(input);
			requests.push(url);
			const fail = failNext; failNext = false;
			if (holdNext) { holdNext = false; await new Promise((resolve) => { held = resolve; }); }
			if (fail) return new Response("{}", { status: 503 });
			const marker = url.pathname.endsWith("tv") ? 200 : 100;
			const sortMarker = url.searchParams.get("sort_by") === "vote_average.desc" ? 20 : 10;
			return new Response(JSON.stringify({ total_results: marker + sortMarker, results: Array.from({ length: 10 }, (_, index) => ({ id: marker + sortMarker + index, title: `Controlled title ${index}`, name: `Controlled series ${index}`, poster_path: `/controlled-${marker}-${sortMarker}-${index}.png` })) }), { headers: { "Content-Type": "application/json" } });
		};
		const previewProvider = family === "streaming" ? createTmdbStreamingPreviewProvider({ fetchImpl }) : family === "genre" ? createTmdbGenrePreviewProvider({ fetchImpl }) : createTmdbDecadesPreviewProvider({ fetchImpl });
		const provider = { id: 2, name: "Apple TV", searchName: "apple tv", logoPath: null, moviePriorities: { AU: 1, US: 1 }, tvPriorities: { AU: 1, US: 1 } };
		const catalogueProvider = {
			async loadCatalogue() {
				return { ok: true, data: { regions: [{ code: "AU", name: "Australia" }, { code: "US", name: "United States" }], providers: [provider] } };
			},
		};
		let output = null;
		let applyCalls = 0;
		const apply = (payload) => {
			applyCalls += 1; output = payload;
			if (guided) return (family === "streaming" ? applyStreamingHierarchyPlan : family === "genre" ? applyGenreHierarchyPlan : applyDecadesHierarchyPlan)(app, payload);
			return (family === "streaming" ? createStreamingSourceBundle : family === "genre" ? createGenreSourceBundle : createDecadeSourceBundle)(app, { ...payload, folderInternalId: folder.internalId });
		};
		const host = document.createElement("div"); document.body.append(host);
		const root = createRoot(host);
		const props = { project: app.getState().project, folder, previewProvider, catalogueProvider, onBack() {}, onCancel() {}, onApply: apply };
		try {
			await act(async () => { root.render(guided ? createElement(CreationDialog, {
				scope, destinationCollectionInternalId: app.getState().project.collections[0].internalId, destinationCollectionTitle: "Destination", project: app.getState().project, projectRevision: app.getState().revision, currentYear: 2026,
				initialOptionId: family === "streaming" ? "streaming-services" : family === "genre" ? "genres" : "decades",
				streamingCatalogueProvider: catalogueProvider, streamingPreviewProvider: previewProvider, genrePreviewProvider: previewProvider, decadePreviewProvider: previewProvider,
				onApplyStreaming: apply, onApplyGenres: apply, onApplyDecades: apply, onCancel() {},
			}) : createElement(family === "streaming" ? StreamingSourceFlow : family === "genre" ? GenreSourceFlow : DecadeSourceFlow, props)); await settle(); });
			const dialog = required(document.querySelector(guided ? '[data-creation-dialog="true"]' : `.${family === "decade" ? "decade" : family}-source-dialog`), `${name} dialog`);
			const submit = () => click(required(dialog.querySelector('button[type="submit"]') ?? [...dialog.querySelectorAll('button')].find((button) => button.textContent.startsWith("Continue to ")), `${name} Continue`));
			if (family === "streaming") {
				await click(required(dialog.querySelector('[data-streaming-region="AU"]'), "AU"));
				await click(required(dialog.querySelector('[data-streaming-region="US"]'), "US"));
				await submit();
				await click(required(dialog.querySelector('[data-streaming-provider="2"]'), "provider"));
				if (guided) await submit();
			} else if (family === "genre") {
				await click(required(dialog.querySelector('[data-genre-name="Comedy"]'), "Comedy"));
				await click(required(dialog.querySelector('[data-genre-name="Drama"]'), "Drama"));
				await submit();
			} else if (guided) {
				await click(required(dialog.querySelector('[data-decade-preset="1980s"]'), "1980s"));
				await submit();
				const years = required(inputContaining(dialog, "Individual years"), "years");
				if (!years.checked) await click(years);
			} else {
				await click(required(dialog.querySelector('input[name="decade-source-decade"][value="1980s"]'), "1980s"));
				await click(required(dialog.querySelector('input[name="decade-source-year"][value="year-1980"]'), "1980"));
				await click(required(dialog.querySelector('input[name="decade-source-year"][value="year-1981"]'), "1981"));
			}
			const sortName = family === "streaming" ? guided ? "streaming-hierarchy-sort" : "streaming-configure-sort" : family === "genre" ? guided ? "genre-hierarchy-sort" : "genre-sort" : guided ? "decades-sort" : "decade-source-sort";
			const sortInput = (value) => required(dialog.querySelector(`input[name="${sortName}"][value="${value}"]`), `${name} ${value}`);
			check(sortInput("popular").checked && sortInput("popular").type === "checkbox", `${name} default/semantics ${sortInput("popular").outerHTML}`);
			const creationGroup = sortInput("popular").closest("fieldset");
			if (wordingOnly) {
				check(creationGroup.querySelector("legend").textContent === "Sources to create", `${name} creation legend`);
				const helper = required(document.getElementById(`${sortName}-help`), `${name} helper`);
				check(helper.textContent === "Choose one or more options. Movies and Series get separate sources.", `${name} helper copy`);
				const range = document.createRange(); range.selectNodeContents(helper);
				check(range.getClientRects().length > 1 && helper.scrollWidth <= helper.clientWidth + 1, `${name} helper wrapping`);
			}
			await click(sortInput("popular"));
			check(dialog.textContent.includes("Choose at least one option."), `${name} empty validation`);
			check(requests.length === 0, `${name} empty selection made requests`);
			if (wordingOnly) {
				check(creationGroup.getAttribute("aria-invalid") === "true", `${name} invalid group`);
				const refs = creationGroup.getAttribute("aria-describedby").split(" ");
				check(refs.includes(`${sortName}-help`) && refs.includes(`${sortName}-error`) && refs.every((id) => document.getElementById(id)), `${name} description references`);
				check(document.getElementById(`${sortName}-error`).textContent === "Choose at least one option.", `${name} error wording`);
			}
			await click(sortInput("top-rated")); await click(sortInput("recent"));
			check(requests.length === 0, `${name} sort changes made title requests`);
			check([...dialog.querySelectorAll(`input[name="${sortName}"]:checked`)].map((input) => input.value).join() === "recent,top-rated", `${name} displayed order`);
			const sortValuesBefore = [...dialog.querySelectorAll(`input[name="${sortName}"]:checked`)].map((input) => input.value);
			let custom = null;
			if (!guided && family === "streaming") {
				await click(required(dialog.querySelector(".source-names-disclosure > summary"), "Edit name"));
				custom = "My exact — title";
				await act(async () => { setInputValue(required(dialog.querySelector('input[data-source-name]'), "custom name"), custom); await settle(); });
			}
			if (guided && family === "decade") await click(required(dialog.querySelector(".decades-preview-catalogue > summary"), "Preview disclosure"));
			const trigger = required([...dialog.querySelectorAll('button[aria-haspopup="dialog"]')].find((button) => button.textContent === "Preview titles"), `${name} Preview`);
			await click(trigger);
			const modal = required(document.querySelector(".franchise-preview-modal"), `${name} open Preview`);
			if (wordingOnly) {
				const show = required(modal.querySelector('[aria-label="Preview show"]'), name + " Show selector");
				check(show.closest(".decade-add-preview-dimension").querySelector("strong").textContent === "Show", name + " Preview label");
				check(show.querySelector('[aria-selected="true"]').textContent === "Recent", name + " active choice");
				check(modal.textContent.includes("Recent Movies"), name + " active results description");
				await click(required([...modal.querySelectorAll("button")].find((button) => button.textContent === "Close"), "Close"));
				check(serializedValue(app) === before && applyCalls === 0, name + " copy check mutated project");
				results.push({ name, creation: "Sources to create", preview: "Show", helperWraps: true, accessible: true });
				continue;
			}
			const firstCount = requests.length;
			check(firstCount === (guided && family === "decade" ? 10 : 1), `${name} initial request count ${firstCount}`);
			const tabs = (label) => required(modal.querySelector(`[role="tablist"][aria-label="Preview ${label}"]`), `${name} ${label} tabs`);
			const tab = (label, text) => required([...tabs(label).querySelectorAll("button")].find((button) => button.textContent.trim() === text), `${name} ${label} ${text}`);
			const selected = (label) => tabs(label).querySelector('[aria-selected="true"]')?.textContent.trim();
			check(tabs("media").children.length === 2 && tabs("show").children.length === 2, `${name} duplicate selector keys`);
			check(selected("show") === "Recent", `${name} first sort`);
			await click(tab("show", "Top rated"));
			check(selected("media") === "Movies", `${name} sort changed media`);
			await click(tab("media", "Series"));
			check(selected("show") === "Top rated", `${name} media changed sort`);
			const visitedCount = requests.length;
			await click(tab("media", "Movies"));
			check(requests.length === visitedCount, `${name} cache miss returning to visited variant`);
			if (family === "decade") {
				const dimension = guided ? "source" : "year";
				await click(tab(dimension, "1980")); await click(tab(dimension, "1981"));
				check(selected("show") === "Top rated" && selected("media") === "Movies", `${name} year did not retain media/sort`);
				if (guided) check(!modal.querySelector(".decades-preview-sample-helper"), "Exact year labelled sample");
			} else if (family === "streaming") {
				await click(tab("region", guided ? "US" : "United States"));
				check(selected("show") === "Top rated" && selected("media") === "Movies", `${name} region retention`);
			} else if (!guided) {
				await click(tab("genre", "Drama"));
				check(selected("show") === "Top rated", `${name} Genre retention`);
			}
			check(document.querySelector(".franchise-preview-modal") === modal, `${name} modal remounted`);
			const grid = required(modal.querySelector(".poster-only-preview-grid"), `${name} grid`);
			const scrollBody = modal.querySelector(".source-sort-preview-content");
			if (scrollBody) scrollBody.scrollTop += grid.getBoundingClientRect().top - scrollBody.getBoundingClientRect().top;
			const geometry = titlePreviewGeometry(modal, grid);
			check(grid.clientHeight > 20 && grid.getBoundingClientRect().top < modal.getBoundingClientRect().bottom - 20, `${name} no visible poster area`);
			check(geometry.pageNoHorizontalOverflow && geometry.closeReachable && geometry.withinViewport, `${name} overflow/Close`);
			check(modal.contains(document.activeElement), `${name} focus escaped`);
			const lastButton = [...modal.querySelectorAll("button:not(:disabled)")].at(-1);
			lastButton.focus({ preventScroll: true });
			modal.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
			check(document.activeElement === modal.querySelector("header button"), `${name} Tab did not stay in Preview`);
			if (window.captureSourceSortPreview && scope === "new-collection" && family === "decade") {
				await new Promise((resolve) => { window.__finishSourceSortCapture = resolve; window.captureSourceSortPreview(JSON.stringify({ width: innerWidth, height: innerHeight, forced: matchMedia("(forced-colors: active)").matches })); });
			}
			check(serializedValue(app) === before && applyCalls === 0, `${name} Preview changed project`);
			await click(required([...modal.querySelectorAll("button")].find((button) => button.textContent === "Close"), "Close"));
			check(!document.querySelector(".franchise-preview-modal"), `${name} close failed`);
			check(document.activeElement === trigger, `${name} focus not restored`);
			check([...dialog.querySelectorAll(`input[name="${sortName}"]:checked`)].map((input) => input.value).join() === sortValuesBefore.join(), `${name} Preview changed creation selection`);
			// A fresh configured sort exercises failure, Retry and late response rejection.
			await click(sortInput("most-votes"));
			const beforeReopen = requests.length;
			await click(trigger);
			const reopened = required(document.querySelector(".franchise-preview-modal"), "reopened");
			check(requests.length === beforeReopen, `${name} reopen did not use cache`);
			const mostVoted = required([...reopened.querySelectorAll('[aria-label="Preview show"] button')].find((button) => button.textContent === "Most voted"), "Most voted");
			const beforeFailure = requests.length; failNext = true; await click(mostVoted);
			check(reopened.querySelector('[role="alert"]'), `${name} active error missing`);
			const failedUrl = requests[beforeFailure].href;
			await click(required([...reopened.querySelectorAll("button")].find((button) => button.textContent === "Retry"), "Retry"));
			check(requests.at(-1).href === failedUrl, `${name} Retry targeted different query`);
			check(!reopened.querySelector('[role="alert"]'), `${name} Retry failed`);
			const series = required([...reopened.querySelectorAll('[aria-label="Preview media"] button')].find((button) => button.textContent === "Series"), "Series");
			holdNext = true; failNext = true; await click(series);
			check(reopened.textContent.includes("Preparing") && !reopened.querySelector(".poster-only-preview-grid"), `${name} old posters during loading`);
			await click(required([...reopened.querySelectorAll('[aria-label="Preview show"] button')].find((button) => button.textContent === "Recent"), "Recent"));
			await act(async () => { held?.(); await settle(); });
			check(reopened.querySelector('[aria-label="Preview show"] [aria-selected="true"]').textContent === "Recent", `${name} late sort overwrite`);
			check(!reopened.querySelector('[role="alert"]'), `${name} late error overwrite`);
			holdNext = true; await click(required([...reopened.querySelectorAll('[aria-label="Preview show"] button')].find((button) => button.textContent === "Most voted"), "Most voted pending close"));
			await click(required([...reopened.querySelectorAll("button")].find((button) => button.textContent === "Close"), "Close"));
			await act(async () => { held?.(); await settle(); });
			check(!document.querySelector(".franchise-preview-modal"), `${name} late response reopened Preview`);
			await click(sortInput("most-votes"));
			check(serializedValue(app) === before, `${name} switching changed project`);
			if (guided) {
				for (let attempts = 0; attempts < 4 && !output; attempts += 1) await submit();
			} else await submit();
			check(output && applyCalls === 1, `${name} failed atomic apply`);
			if (!guided) {
				const direct = family === "genre" ? buildGenreSourceDrafts(output.genres, output) : family === "decade" ? buildDecadeSourceBundleDrafts(output) : buildStreamingSourceDrafts(output.provider, { ...output, regionCodes: output.regions.map((region) => region.code) });
				const stripTitle = (drafts) => drafts.map(({ editable, ...draft }) => ({ ...draft, editable: { ...editable, title: null } }));
				check(JSON.stringify(stripTitle(direct.drafts)) === JSON.stringify(stripTitle(output.drafts)), `${name} Preview changed generated content`);
				if (custom) check(output.drafts[0].editable.title === custom, `${name} custom title lost`);
			}
			results.push({ name, requests: requests.length, geometry, outputSources: guided ? output.counts.newSourceCount ?? output.counts.sourceCount : output.drafts.length });
		} catch (error) { throw new Error(`${name}: ${error.message}`, { cause: error }); }
		finally { held?.(); await act(async () => { root.unmount(); await settle(); }); host.remove(); }
	}
	if (wordingOnly) for (const family of ["streaming", "genre", "decade"]) {
		const app = createController();
		const draft = family === "streaming" ? buildStreamingSourceDrafts({ id: 2, name: "Apple TV", moviePriorities: { AU: 1 }, tvPriorities: { AU: 1 } }, { regionCodes: ["AU"], mediaChoice: "movies" }).drafts[0] : family === "genre" ? buildGenreSourceDrafts(["Comedy"]).drafts[0] : buildDecadeSourceBundleDrafts({ periodIds: ["year-1980"] }).drafts[0];
		const folder = importSources(app, [draft.editable]);
		const opened = helpers.openEdit(app, folder.sources[0]);
		await helpers.withMountedEditor({ controller: app, session: opened.session, draft: opened.draft, async run() {
			const control = required(document.querySelector('input[name="' + family + '-edit-sort"]'), family + " editor sort");
			check(control.type === "radio" && control.closest("fieldset").querySelector("legend").textContent === "Sort titles by", family + " editor wording/semantics");
			check(!control.closest("fieldset").textContent.includes("Movies and Series get separate sources."), family + " creation helper leaked to editor");
			editors.push({ family, heading: "Sort titles by" });
		} });
	}
	} finally { console.error = oldConsoleError; }
	check(errors.length === 0, `React errors: ${errors.join("\n")}`);
	return { width: window.innerWidth, height: window.innerHeight, results, errors, editors };
}

export async function runExpandedDecadesScenario({ createController, afterCommittedEffects: settle }) {
	const app = createController();
	const state = prepareDecadesReview({
		...createDecadesCreationState({ scope: "new-collection", currentYear: new Date().getFullYear() }),
		selectedDecadeIds: DECADE_PRESETS.map((preset) => preset.id),
		content: { wholeDecade: true, individualYears: true, genreBreakdown: true },
		genreNamesByDecade: Object.fromEntries(DECADE_PRESETS.map((preset) => [preset.id, completeOfficialGenreNames()])),
		sortOptionIds: ["popular", "recent", "top-rated", "most-votes"],
	});
	const expected = buildDecadesCreationPlan(app.getState().project, app.getState().revision, { ...state, sortOptionIds: ["popular"] }).plan.counts.sourceCount * state.sortOptionIds.length;
	const start = performance.now();
	const planResult = buildDecadesCreationPlan(app.getState().project, app.getState().revision, state);
	const planned = performance.now();
	const host = document.createElement("div"); document.body.append(host);
	const root = createRoot(host);
	try {
		await act(async () => { root.render(createElement(DecadesReviewStep, { state, planResult, onCollectionTitleChange() {}, onStateChange() {} })); await settle(); });
		host.getBoundingClientRect();
		const rendered = performance.now();
		if (!host.textContent.includes(String(expected))) throw new Error("Expanded review count mismatch");
		const result = applyDecadesHierarchyPlan(app, planResult.plan);
		const applied = performance.now();
		if (!result.ok || app.getState().revision !== 1) throw new Error("Expanded insertion failed");
		return { sources: expected, planningMs: planned - start, reviewRenderMs: rendered - planned, insertionMs: applied - rendered, reviewElements: host.querySelectorAll("*").length };
	} finally { await act(async () => { root.unmount(); await settle(); }); host.remove(); }
}
