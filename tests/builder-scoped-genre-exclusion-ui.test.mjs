import assert from "node:assert/strict";
import test, { after } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "../builder/node_modules/react/index.js";
import { renderToStaticMarkup } from "../builder/node_modules/react-dom/server.js";
import { createServer } from "../builder/node_modules/vite/dist/node/index.js";
import { createBuilderController } from "../builder/src/application/index.js";
import { scopedGenreTargetIndex, scopedGenreSelection, selectScopedGenreTarget, searchScopedGenreTargets, scopedGenreReviewGroups, scopedSourceCount, scopedGenreSourceSummary, scopedGenreInapplicableLabel, scopedGenreExclusionLabel, bindGlobalSettingsHistory } from "../builder/src/ui/scoped-genre-exclusion-ui.js";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vite = await createServer({ root: path.join(root, "builder"), appType: "custom", logLevel: "silent", server: { middlewareMode: true } });
after(() => vite.close());
const { ScopedGenreExclusionDialog } = await vite.ssrLoadModule("/src/ui/ScopedGenreExclusionDialog.jsx");
function controller() {
	const value = createBuilderController();
	assert.equal(value.importValue([1, 2].map((id) => ({ id: `c${id}`, title: "Same Collection", folders: [1, 2].map((f) => ({ id: `f${id}-${f}`, title: "Same Folder", sources: [{ provider: "tmdb", tmdbSourceType: "COMPANY", tmdbId: id, mediaType: "MOVIE", sortBy: "popularity.desc" }] })) }))).ok, true);
	return value;
}
test("target index preserves human labels, empty leaves, physical ranges and duplicate context", () => {
	const c = controller(), p = c.getState().project, index = scopedGenreTargetIndex(p);
	assert.equal(index.entries.size, 10);
	assert.equal(index.leaves.length, 4);
	assert.equal(index.roots[0].sourceCount, 2);
	assert.notEqual(index.roots[0].context, index.roots[1].context);
	assert.notEqual(index.roots[0].children[0].context, index.roots[0].children[1].context);
	assert.equal(searchScopedGenreTargets(index, "same folder").roots.length, 2);
	assert.equal(searchScopedGenreTargets(index, "missing").roots.length, 0);
	assert.equal(scopedSourceCount(1), "1 Source");
	assert.equal(scopedSourceCount(108), "108 Sources");
});

test("initial surface mounts only collapsed Collections with unselected native checkboxes", () => {
	const c = controller();
	const html = renderToStaticMarkup(createElement(ScopedGenreExclusionDialog, { controller: c, project: c.getState().project, onClose() {} }));
	assert.equal((html.match(/type="checkbox"/g) ?? []).length, 2);
	assert.doesNotMatch(html, /checked=""|autoFocus|autofocus|type="radio"|role="tree/);
	assert.match(html, /disabled=""[^>]*>Continue/);
	assert.match(html, /data-selection-mode="multiple"/);
	assert.match(html, /Search Collections, Folders and Sources/);
	assert.equal((html.match(/aria-expanded="false"/g) ?? []).length, 2);
	assert.match(html, /0 Sources selected/);
	assert.match(html, /scoped-genre-exclusion-target-row[^>]*data-selection-mode="multiple"/);
	assert.match(html, /<path d="m5 7 5 5 5-5"/);
	assert.match(html, /<\/label><button[^>]*scoped-genre-chevron/);
	assert.match(html, /<header[\s\S]*data-action="scoped-genres-back"[\s\S]*data-action="scoped-genres-close"[\s\S]*<\/header>/);
	const footer = html.match(/<footer[\s\S]*?<\/footer>/)[0];
	assert.equal((footer.match(/<button/g) ?? []).length, 1);
	assert.doesNotMatch(footer, /Back|Cancel|Close/);
});

test("physical membership supports overlap, subtraction, mixed reselect and checked clear without parent tokens", () => {
	const index = scopedGenreTargetIndex(controller().getState().project), collection = index.roots[0], folder = collection.children[0], leaf = folder.children[0];
	let selection = { sources: new Set(), empty: new Set() };
	const choose = (entry) => { const state = scopedGenreSelection(index, selection).states.get(entry.internalId); selection = selectScopedGenreTarget(index, selection, entry, !state.checked); };
	choose(collection);
	assert.equal(selection.sources.size, 2);
	selection = selectScopedGenreTarget(index, selection, folder, true);
	assert.equal(selection.sources.size, 2);
	choose(leaf);
	assert.equal(selection.sources.size, 1);
	assert.equal(scopedGenreSelection(index, selection).states.get(collection.internalId).mixed, true);
	assert.equal(scopedGenreSelection(index, selection).states.get(folder.internalId).checked, false);
	choose(collection);
	assert.equal(selection.sources.size, 2);
	choose(collection);
	assert.equal(selection.sources.size, 0);
	choose(folder);
	assert.deepEqual([...selection.sources], [leaf.internalId]);
	assert.equal(selection.sources.has(folder.internalId), false);
});

test("empty terminal leaves participate in mixed state but never increase Source counts", () => {
	const c = createBuilderController();
	assert.equal(c.importValue([{ id: "c", title: "Mixed", folders: [{ id: "f", title: "One", sources: [{ provider: "tmdb", tmdbSourceType: "LIST", tmdbId: 1, mediaType: "MOVIE", sortBy: "original" }] }, { id: "e", title: "Empty", sources: [] }] }, { id: "z", title: "Empty Collection", folders: [] }]).ok, true);
	const index = scopedGenreTargetIndex(c.getState().project), parent = index.roots[0], emptyFolder = parent.children[1];
	assert.equal(index.leaves.length, 3);
	assert.equal(index.roots[1].emptyCount, 1);
	let selection = selectScopedGenreTarget(index, { sources: new Set(), empty: new Set() }, parent.children[0], true);
	assert.equal(scopedGenreSelection(index, selection).states.get(parent.internalId).mixed, true);
	assert.equal(selection.sources.size, 1);
	selection = selectScopedGenreTarget(index, selection, emptyFolder, true);
	assert.equal(scopedGenreSelection(index, selection).states.get(parent.internalId).checked, true);
	selection = selectScopedGenreTarget(index, selection, parent.children[0], false);
	assert.equal(selection.sources.size, 0); assert.equal(selection.empty.size, 1);
	assert.equal(scopedGenreSelection(index, selection).sources, 0);
	selection = selectScopedGenreTarget(index, selection, null, true);
	assert.equal(selection.sources.size, 1); assert.equal(selection.empty.size, 2);
	selection = selectScopedGenreTarget(index, selection, null, false);
	assert.equal(selection.sources.size + selection.empty.size, 0);
});

test("search uses Source and parent labels but cannot restrict complete branch or Select all membership", () => {
	const c = controller(), p = c.getState().project;
	c.updateNode(p.collections[0].folders[0].sources[0].internalId, { title: "Needle" });
	const index = scopedGenreTargetIndex(c.getState().project), filtered = searchScopedGenreTargets(index, "needle");
	assert.equal(filtered.roots.length, 1);
	assert.equal(filtered.children.get(filtered.roots[0].internalId).length, 1);
	const selected = selectScopedGenreTarget(index, { sources: new Set(), empty: new Set() }, filtered.roots[0], true);
	assert.equal(selected.sources.size, 2);
	assert.equal(selectScopedGenreTarget(index, selected, null, true).sources.size, 4);
	assert.equal(searchScopedGenreTargets(index, "needle same collection").roots.length, 1);
	assert.equal(searchScopedGenreTargets(index, "").roots, index.roots);
});

test("large index membership is uncapped and includes unrendered Collections, Folders and Sources", () => {
	const source = (id) => ({ nodeType: "source", internalId: "s" + id, editable: { title: "Source " + id } });
	const project = { collections: Array.from({ length: 60 }, (_, c) => ({ nodeType: "collection", internalId: "c" + c, editable: { title: "Collection " + c },
		folders: Array.from({ length: 60 }, (_, f) => ({ nodeType: "folder", internalId: "f" + c + "-" + f, editable: { title: "Folder " + f }, sources: [source(c * 60 + f)] })) })) };
	const index = scopedGenreTargetIndex(project);
	assert.equal(index.leaves.length, 3600);
	const all = selectScopedGenreTarget(index, { sources: new Set(), empty: new Set() }, null, true);
	assert.equal(all.sources.size, 3600); assert.equal(scopedGenreSelection(index, all).sources, 3600);
	for (const root of index.roots) assert.equal(scopedGenreSelection(index, all).states.get(root.internalId).checked, true);
	assert.equal(searchScopedGenreTargets(index, "Source 3599").roots[0], index.roots[59]);
});

test("visible imported names are verbatim and blank/invisible labels use existing presentation fallbacks", () => {
	const c = controller(), p = c.getState().project;
	c.updateNode(p.collections[0].internalId, { title: "  Discover  " });
	c.updateNode(p.collections[0].folders[0].internalId, { title: "\u200e" });
	c.updateNode(p.collections[0].folders[1].internalId, { title: "" });
	const index = scopedGenreTargetIndex(c.getState().project);
	assert.equal(index.roots[0].title, "  Discover  ");
	assert.equal(index.roots[0].children[0].title, "Hidden title");
	assert.match(index.roots[0].children[0].context, /Invisible in Nuvio/);
	assert.equal(index.roots[0].children[1].title, "Untitled folder");
	assert.ok(index.leaves.every((entry) => entry.title && !entry.title.includes(entry.internalId)));
});

test("one combined authenticated review groups selected outcomes and marks only supporting unselected collision evidence", () => {
	const c = createBuilderController(), source = (title, id, filters = {}) => ({ title, provider: "tmdb", tmdbSourceType: "COMPANY", tmdbId: id, mediaType: "MOVIE", sortBy: "popularity.desc", filters });
	c.importValue([{ id: "a", title: "One", folders: [{ id: "f", title: "Popular", sources: [source("Popular", 1), source("Popular", 1, { withoutGenres: "27" })] }] }, { id: "b", title: "Two", folders: [{ id: "g", title: "Popular", sources: [source("Popular", 2)] }] }]);
	const index = scopedGenreTargetIndex(c.getState().project), ids = [index.leaves[2].internalId, index.leaves[0].internalId];
	const { review } = c.reviewScopedGenreExclusions({ sourceInternalIds: ids, genreNames: ["Horror"] });
	const before = JSON.stringify(review), groups = scopedGenreReviewGroups(review, index);
	assert.equal(groups.length, 2); assert.equal(groups[0].selectedCount, 1);
	assert.deepEqual(groups[0].totals, { changed: 0, unchanged: 0, skipped: 1 });
	assert.deepEqual(groups[1].totals, { changed: 1, unchanged: 0, skipped: 0 });
	assert.match(groups[0].folders[0].rows[0].label.context, /Source 1 of 2 named Popular/);
	assert.equal(groups[0].folders[0].rows[0].unselectedBlocker, true);
	assert.equal(groups.flatMap((g) => g.folders.flatMap((f) => f.rows)).length, 2);
	assert.equal(JSON.stringify(review), before);
	assert.equal(c.applyScopedGenreExclusions(review).ok, true);
});

test("index refresh never enrolls new leaves or silently removes missing selected IDs", () => {
	const c = controller(), old = scopedGenreTargetIndex(c.getState().project);
	const selection = selectScopedGenreTarget(old, { sources: new Set(), empty: new Set() }, null, true);
	const project = c.getState().project;
	const changed = { ...project, collections: project.collections.slice(1) }, index = scopedGenreTargetIndex(changed);
	assert.equal(scopedGenreSelection(index, selection).missingSources, 2);
	assert.equal(selection.sources.size, 4);
	const fresh = selectScopedGenreTarget(index, { sources: new Set(), empty: new Set() }, null, true);
	assert.equal(fresh.sources.size, 2);
});

test("exclusion labels retain stored order, IDs and unavailable evidence without media substitution", () => {
	assert.equal(scopedGenreExclusionLabel("27,16", "MOVIE"), "Horror (27), Animation (16)");
	assert.equal(scopedGenreExclusionLabel("27,16", "TV"), "27, Animation (16)");
	assert.equal(scopedGenreExclusionLabel(null, "TV"), "None");
	assert.equal(scopedGenreExclusionLabel(null, null), "Preserved; not safely interpreted");
});
test("settings history consumes local Back and cleans up before immediate reopen", async () => {
	let state = { preserved: "yes" }, position = 0;
	const entries = [state], listeners = new Set();
	const view = {
		history: { get state() { return state; }, pushState(next) { entries.splice(++position); entries.push(next); state = next; }, back() { queueMicrotask(() => { state = entries[--position]; for (const listener of [...listeners]) listener({ state }); }); } },
		addEventListener(type, listener) { listeners.add(listener); }, removeEventListener(type, listener) { listeners.delete(listener); },
	};
	let steps = 0;
	const release = bindGlobalSettingsHistory(view, () => { steps += 1; return true; });
	await new Promise(queueMicrotask);
	view.history.back(); await new Promise(queueMicrotask);
	assert.equal(steps, 1); assert.equal(position, 1); assert.equal(view.history.state.preserved, "yes");
	release();
	const releaseAgain = bindGlobalSettingsHistory(view, () => { throw new Error("old Back reached new session"); });
	await new Promise((resolve) => setTimeout(resolve, 0));
	assert.equal(position, 1); assert.equal(listeners.size, 1);
	releaseAgain(); await new Promise((resolve) => setTimeout(resolve, 0));
	assert.equal(position, 0); assert.deepEqual(view.history.state, { preserved: "yes" }); assert.equal(listeners.size, 0);
});


test("compact summaries format every real outcome without changing authenticated evidence", () => {
	const c = createBuilderController();
	const source = (id, mediaType = "MOVIE", filters = {}) => ({ provider: "tmdb", tmdbSourceType: "COMPANY", tmdbId: id, mediaType, sortBy: "popularity.desc", filters });
	c.importValue([{ id: "c", title: "Discover", folders: [{ id: "f", title: "Movies", sources: [
		source(1, "MOVIE", { withoutGenres: "18" }),
		source(2, "TV"),
		source(3, "MOVIE", { withoutGenres: "16,27" }),
		source(4, "MOVIE", { withGenres: "27" }),
		{ provider: "tmdb", tmdbSourceType: "LIST", tmdbId: 5, mediaType: "MOVIE", sortBy: "original" },
		source(6, "MOVIE", { withoutGenres: "27|18" }),
		source(7), source(7, "MOVIE", { withoutGenres: "16,27" }),
	] }] }]);
	const request = { scope: { nodeType: "collection", internalId: c.getState().project.collections[0].internalId }, genreNames: ["Animation", "Horror"] };
	const { review } = c.reviewScopedGenreExclusions(request), before = JSON.stringify(review);
	assert.equal(scopedGenreSourceSummary(review.outcomes[0]), "Will change — add Animation and Horror to exclusions.");
	assert.equal(scopedGenreSourceSummary(review.outcomes[1]), "Will change — add Animation to exclusions.");
	assert.equal(scopedGenreInapplicableLabel(review.outcomes[1]), "Horror has no Series mapping.");
	assert.equal(scopedGenreSourceSummary(review.outcomes[2]), "Unchanged — Animation and Horror already excluded.");
	assert.match(scopedGenreSourceSummary(review.outcomes[3]), /Horror is already included/);
	assert.match(scopedGenreSourceSummary(review.outcomes[4]), /aren’t supported/);
	assert.match(scopedGenreSourceSummary(review.outcomes[5]), /settings need to be preserved/);
	assert.match(scopedGenreSourceSummary(review.outcomes[6]), /duplicate another Source/);
	const movieOnly = c.reviewScopedGenreExclusions({ ...request, genreNames: ["Horror"] }).review.outcomes[1];
	assert.equal(movieOnly.status, "unchanged");
	assert.match(scopedGenreSourceSummary(movieOnly), /do not apply/);
	assert.equal(JSON.stringify(review), before);
	assert.equal(c.applyScopedGenreExclusions(review).ok, true);
});

test("report status groups retain saved order, reconcile totals and preserve exact authenticated outcomes", () => {
	const c = createBuilderController();
	const sources = Array.from({ length: 6 }, (_, i) => ({
		title: "Authored " + i, provider: "tmdb", tmdbSourceType: i % 3 === 1 ? "LIST" : "COMPANY",
		tmdbId: 100 + i, mediaType: "MOVIE", sortBy: i % 3 === 1 ? "original" : "popularity.desc",
		...(i % 3 === 2 ? { filters: { withoutGenres: "27" } } : {}),
	}));
	assert.equal(c.importValue([{ title: "Collection", folders: [{ title: "Folder", sources }] }]).ok, true);
	const index = scopedGenreTargetIndex(c.getState().project), ids = index.leaves.map(row => row.internalId);
	const { review } = c.reviewScopedGenreExclusions({ sourceInternalIds: [...ids].reverse(), genreNames: ["Horror"] });
	const before = JSON.stringify(review), group = scopedGenreReviewGroups(review, index)[0], folder = group.folders[0];
	assert.deepEqual(folder.rows.map(row => row.outcome.sourceInternalId), ids);
	for (const [status, positions] of [["changed", [0, 3]], ["skipped", [1, 4]], ["unchanged", [2, 5]]]) {
		assert.deepEqual(folder[status + "Rows"].map(row => row.outcome.sourceInternalId), positions.map(i => ids[i]));
		assert.equal(folder[status + "Rows"].length, folder.totals[status]);
		assert.equal(group.totals[status], review.totals[status]);
		for (const row of folder[status + "Rows"]) {
			assert.equal(row, folder.rows.find(item => item.outcome.sourceInternalId === row.outcome.sourceInternalId));
			assert.equal(row.outcome, review.outcomes.find(item => item.sourceInternalId === row.outcome.sourceInternalId));
		}
	}
	assert.equal(JSON.stringify(review), before);
	assert.equal(Object.isFrozen(review), true);
	assert.equal(c.applyScopedGenreExclusions(review).ok, true);
});
