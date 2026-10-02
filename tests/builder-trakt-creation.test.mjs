import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createBuilderController } from "../builder/src/application/index.js";
import { serializeNuvioProject } from "../builder/src/serialize/nuvio-serialize.js";
import { initialTraktMedia, settleTraktMedia, chooseTraktMedia, effectiveTraktMedia, parseTraktListBatch, createTraktSelectionSession } from "../builder/src/source-add/trakt-selection.js";
import { traktFailure } from "../builder/src/source-add/trakt-client.js";
import { createTraktCreationPlan, validateTraktCreationPlan, applyTraktCreationPlan } from "../builder/src/source-add/trakt-creation-plan.js";
import { buildNativeTraktSourceDraft } from "../builder/src/source-add/trakt-source.js";
import { CREATION_OPTIONS } from "../builder/src/ui/creation-options.js";
import { AVAILABLE_SOURCE_MODES } from "../builder/src/source-add/source-modes.js";

// Deterministic domain examples only. No live service or installed-client claim.
const list = (id, availability = "unverified") => ({ id, name: `List ${id}`, availability });
const media = (id, movieCount = 1, showCount = 1) => ({ ok: true, data: { id, movieCount, showCount, composition: movieCount ? showCount ? "mixed" : "movie-only" : showCount ? "show-only" : "zero" } });
const selected = (id, movies = 1, shows = 1) => ({ id, list: list(id), media: settleTraktMedia(initialTraktMedia(), media(id, movies, shows)) });
function app(idFactory) { let next = 0; return createBuilderController({ idFactory: idFactory ?? (() => `trakt-${++next}`) }); }
const planFor = (controller, lists, extra = {}) => { const s = controller.getState(); return createTraktCreationPlan(s.project, { scope: "new-collection", projectRevision: s.revision, collectionTitle: "Trakt lists", lists, ...extra }); };
function destinations(controller) { const c = controller.createCollection({ editable: { title: "Destination" } }).createdInternalId; const f = controller.createFolder(c, { editable: { title: "Existing folder" } }).createdInternalId; return { c, f }; }
function source(controller, f, id, mediaType = "MOVIE") { controller.createSource(f, buildNativeTraktSourceDraft({ title: "Saved", traktListId: id, mediaType }).draft); }
const tick = () => new Promise(resolve => setImmediate(resolve));

test("Automatic maps only known composition; zero/failure require an explicit verified manual choice", () => {
	for (const [movies, shows, expected] of [[1, 0, ["MOVIE"]], [0, 1, ["TV"]], [1, 1, ["MOVIE", "TV"]], [0, 0, []]]) assert.deepEqual(effectiveTraktMedia(settleTraktMedia(initialTraktMedia(), media(1, movies, shows))), expected);
	for (const publicRead of [false, true]) {
		const failed = settleTraktMedia(initialTraktMedia(publicRead), traktFailure("UPSTREAM_FAILURE"));
		assert.deepEqual(effectiveTraktMedia(failed), []);
		assert.deepEqual(effectiveTraktMedia(chooseTraktMedia(failed, "both")), publicRead ? ["MOVIE", "TV"] : []);
		const unavailable = settleTraktMedia(failed, traktFailure("LIST_NOT_FOUND"));
		assert.equal(unavailable.publicRead, false); assert.deepEqual(effectiveTraktMedia(chooseTraktMedia(unavailable, "both")), []);
	}
	const zero = settleTraktMedia(initialTraktMedia(), media(1, 0, 0));
	assert.deepEqual(effectiveTraktMedia(chooseTraktMedia(zero, "movies")), ["MOVIE"]);
	assert.deepEqual(effectiveTraktMedia({ ...zero, publicRead: "true", override: "both" }), []);
	assert.deepEqual(effectiveTraktMedia({ ...zero, composition: { ...zero.composition, composition: "mixed" } }), []);
	assert.throws(() => chooseTraktMedia(zero, "unknown"));
});

test("multiline keeps original lines/order, dedupes safe identical inputs and canonical selected IDs only", () => {
	const result = parseTraktListBatch("\n 123 \nhttps://app.trakt.tv/users/a/lists/b\r\n123\nhttps://app.trakt.tv/users/a/lists/b\n01\n456", [456]);
	assert.deepEqual(result.entries.map(e => [e.line, e.value]), [[2, "123"], [3, "https://app.trakt.tv/users/a/lists/b"], [6, "01"]]);
	assert.deepEqual(result.duplicates.map(e => e.line), [4, 5, 7]); assert.equal(result.entries[2].id, null);
	assert.equal(parseTraktListBatch(" \n ").errors.length, 1);
});

test("selection is uncapped, canonical, first-selected; refresh preserves choices and reselection appends", () => {
	let calls = 0;
	const session = createTraktSelectionSession({ client: { resolve: () => calls++, getMedia: () => calls++ } });
	for (let id = 1; id <= 100; id++) session.select(list(id));
	session.chooseMedia(2, "series"); session.select({ ...list(2, "available"), name: "Updated" });
	assert.equal(session.getState().selection.byId[2].media.override, "series");
	assert.equal(session.getState().selection.order.length, 100);
	session.remove(1); session.select(list(1)); assert.equal(session.getState().selection.order.at(-1), 1);
	assert.equal(session.select(list(1001, "unavailable")), false); assert.equal(calls, 0);
	assert.throws(() => session.select(list("123")));
});

test("multiline resume retains successes, skips non-retryable errors and continues retryable/pending rows in order", async () => {
	let refused = true;
	const calls = [], client = { getMedia: async id => media(id), resolve: async input => {
		calls.push(input);
		if (input === "bad" || input === "missing") return traktFailure(input === "bad" ? "INVALID_REQUEST" : "LIST_NOT_FOUND");
		if (input === "retry" && refused) { refused = false; return traktFailure("UPSTREAM_BUDGET"); }
		return { ok: true, data: list(input === "retry" ? 456 : input === "last" ? 789 : 123, "available") };
	} };
	const session = createTraktSelectionSession({ client });
	session.setInput("url-one\nurl-two\nbad\nmissing\nretry\nlast"); await session.resolveInput();
	assert.deepEqual(session.getState().selection.order, [123]); assert.deepEqual(session.getState().lines.map(l => l.status), ["resolved", "resolved", "failed", "failed", "failed", "pending"]);
	await session.resumeResolve(); await session.resumeResolve();
	assert.deepEqual(calls, ["url-one", "url-two", "bad", "missing", "retry", "retry", "last"]);
	assert.deepEqual(session.getState().selection.order, [123, 456, 789]); assert.deepEqual(session.getState().lines.map(l => l.status), ["resolved", "resolved", "failed", "failed", "resolved", "resolved"]);
	session.clearInput(); assert.equal(session.getState().lines.length, 0); assert.equal(session.getState().selection.order.length, 3);
	session.setInput("kept"); session.clearSelection(); assert.equal(session.getState().input, "kept"); assert.equal(session.getState().selection.order.length, 0);
});

test("media scheduler never exceeds two concurrent checks or drains beyond 25; success is retained", async () => {
	let active = 0, max = 0, calls = 0;
	const session = createTraktSelectionSession({ client: { resolve: async () => { throw Error("must not resolve before media"); }, getMedia: async id => { active++; max = Math.max(max, active); calls++; await tick(); active--; return media(id); } } });
	for (let id = 1; id <= 50; id++) session.select(list(id));
	const first = session.checkMediaBatch(); await session.checkMediaBatch(); await first;
	assert.equal(max, 2); assert.equal(calls, 25); assert.equal(session.getState().pending, 25);
	session.cancel(); await session.checkMediaBatch(); assert.equal(calls, 50); assert.equal(session.getState().pending, 0);
	await session.checkMediaBatch(); assert.equal(calls, 50);
});

test("shared refusal stops new dispatch, honors cooldown and resumes only failed/pending rows", async () => {
	let now = 0, refused = true; const calls = [];
	const session = createTraktSelectionSession({ now: () => now, client: { resolve: async () => {}, getMedia: async id => { calls.push(id); if (id === 1 && refused) return traktFailure("UPSTREAM_BUDGET", 30000); await tick(); return media(id); } } });
	for (let id = 1; id <= 30; id++) session.select(list(id));
	await session.checkMediaBatch(); assert.deepEqual(calls, [1, 2]); assert.equal(session.getState().selection.byId[2].media.status, "known");
	await session.checkMediaBatch(); assert.equal(calls.length, 2);
	now = 30000; refused = false; await session.checkMediaBatch(); assert.equal(calls.length, 27); assert.equal(calls.filter(id => id === 2).length, 1);
});

test("Back/remove/clear suppress late responses, restore choices and do not resurrect selections", async () => {
	const completions = [];
	const session = createTraktSelectionSession({ client: { resolve: async () => {}, getMedia: id => new Promise(resolve => completions.push(() => resolve(media(id)))) } });
	session.select(list(1, "available")); session.select(list(2));
	const first = session.checkMediaBatch(); session.chooseMedia(1, "series"); session.cancel(); session.remove(2);
	completions.splice(0).forEach(done => done()); await first;
	assert.deepEqual(session.getState().selection.order, [1]); assert.equal(session.getState().selection.byId[1].media.status, "not-checked"); assert.equal(session.getState().selection.byId[1].media.override, "series");
	const second = session.checkMediaBatch(); session.clearSelection(); completions.splice(0).forEach(done => done()); await second; assert.equal(session.getState().selection.order.length, 0);
});

test("manual recovery resolves only explicitly; unavailable blocks until successful verification", async () => {
	let available = true, resolves = 0;
	const session = createTraktSelectionSession({ client: { getMedia: async () => traktFailure("UPSTREAM_FAILURE"), resolve: async input => { resolves++; return available ? { ok: true, data: list(Number(input), "available") } : traktFailure("LIST_NOT_FOUND"); } } });
	session.select(list(1)); await session.checkMediaBatch(); session.chooseMedia(1, "both");
	assert.equal(resolves, 0); assert.deepEqual(effectiveTraktMedia(session.getState().selection.byId[1].media), []);
	await session.verifyPublic(1); assert.deepEqual(effectiveTraktMedia(session.getState().selection.byId[1].media), ["MOVIE", "TV"]);
	available = false; await session.verifyPublic(1); assert.deepEqual(effectiveTraktMedia(session.getState().selection.byId[1].media), []);
	available = true; await session.verifyPublic(1); assert.deepEqual(effectiveTraktMedia(session.getState().selection.byId[1].media), ["MOVIE", "TV"]);
	session.select(list(1, "unavailable")); assert.deepEqual(effectiveTraktMedia(session.getState().selection.byId[1].media), []);
	await session.verifyPublic(1); assert.deepEqual(effectiveTraktMedia(session.getState().selection.byId[1].media), ["MOVIE", "TV"]);
});

test("New Collection uses B2 drafts and approved names; elsewhere matches remain informational; one atomic apply", () => {
	const controller = app(), { f } = destinations(controller); source(controller, f, 1);
	const before = controller.getState(), planned = planFor(controller, [selected(1, 1, 0), selected(2, 0, 1), selected(3)]);
	assert.equal(planned.ok, true); assert.deepEqual(planned.plan.counts, { collectionCount: 1, folderCount: 3, sourceCount: 4, omittedCount: 0 });
	assert.equal(planned.plan.outcomes[0].ready[0].elsewhere.length, 1);
	assert.deepEqual(planned.plan.folders.map(b => b.sources.map(s => s.editable.title)), [["Movies"], ["Series"], ["Movies", "Series"]]);
	assert.equal(applyTraktCreationPlan(controller, planned.plan).ok, true); assert.equal(controller.getState().revision, before.revision + 1);
	const output = serializeNuvioProject(controller.getState().project).value.at(-1);
	assert.equal(output.folders.length, 3);
	for (const saved of output.folders.flatMap(f => f.sources)) { assert.equal(saved.provider, "trakt"); assert.equal(typeof saved.traktListId, "number"); assert.equal(saved.sortBy, "rank"); assert.equal(saved.sortHow, "asc"); assert.deepEqual(Object.keys(saved).sort(), ["title", "provider", "traktListId", "mediaType", "sortBy", "sortHow"].sort()); }
});

test("metadata refresh retains custom names; removal clears derived names and media", () => {
	const session = createTraktSelectionSession({ client: { resolve: async () => {}, getMedia: async () => {} } });
	session.select(list(1)); const names = { MOVIE: "My movies" };
	session.setNames(1, { folderTitle: "My folder", sourceTitles: names }); names.MOVIE = "Changed outside";
	session.chooseMedia(1, "movies"); session.select({ ...list(1, "available"), name: "New metadata" });
	const row = session.getState().selection.byId[1];
	assert.equal(row.folderTitle, "My folder"); assert.equal(row.sourceTitles.MOVIE, "My movies"); assert.equal(row.media.override, "movies");
	assert.equal(planFor(app(), [row]).plan.folders[0].sources[0].editable.title, "My movies");
	session.remove(1); session.select(list(1)); assert.equal(session.getState().selection.byId[1].folderTitle, undefined);
	assert.equal(session.getState().selection.byId[1].media.override, "automatic");
});

test("resolve replacement is stale-safe and repeated submit/resume does not duplicate active work", async () => {
	let calls = 0; const pending = [];
	const session = createTraktSelectionSession({ client: { getMedia: async () => {}, resolve: input => {
		calls++; return new Promise(done => pending.push(() => done({ ok: true, data: list(Number(input), "available") })));
	} } });
	session.setInput("1"); const first = session.resolveInput();
	await session.resumeResolve(); await session.resolveInput(); assert.equal(calls, 1); assert.equal(session.getState().resolving, true);
	session.setInput("2"); const second = session.resolveInput(); pending.shift()(); await first;
	assert.deepEqual(session.getState().selection.order, []); assert.equal(session.getState().resolving, true);
	pending.shift()(); await second; assert.deepEqual(session.getState().selection.order, [2]); assert.equal(session.getState().resolving, false);
	session.setInput("3"); const third = session.resolveInput(); session.clearInput(); pending.shift()(); await third;
	assert.deepEqual(session.getState().selection.order, [2]); assert.equal(session.getState().input, "");
});

test("public recovery publishes cooldown and cannot be bypassed with old available metadata", async () => {
	const observed = [];
	const session = createTraktSelectionSession({ now: () => 1000, onChange: state => observed.push(state), client: {
		getMedia: async () => traktFailure("LIST_NOT_FOUND"), resolve: async (_id, options) => {
			assert.equal(options.refresh, true); return traktFailure("UPSTREAM_BUDGET", 4000);
		},
	} });
	session.select(list(1, "available")); await session.checkMediaBatch(); session.chooseMedia(1, "both");
	session.select(list(1, "available")); assert.deepEqual(effectiveTraktMedia(session.getState().selection.byId[1].media), []);
	await session.verifyPublic(1); assert.equal(observed.at(-1).notBefore, 4000);
	session.select(list(1, "available")); assert.equal(session.getState().selection.byId[1].media.status, "unavailable");
	assert.deepEqual(effectiveTraktMedia(session.getState().selection.byId[1].media), []);
	assert.equal(planFor(app(), [{ ...selected(1), media: selected(2).media }]).ok, false);
});

test("New Folder creates only missing-media sibling folders and no empty folders or affinity", () => {
	const controller = app(), { c, f } = destinations(controller); source(controller, f, 1); source(controller, f, 2);
	const oldFolder = controller.getState().project.collections[0].folders[0];
	const planned = planFor(controller, [selected(1, 1, 0), selected(2), selected(3, 0, 1)], { scope: "new-folder", collectionTitle: undefined, destinationCollectionInternalId: c });
	// cloneJsonValue rejects explicit undefined, matching other domain plain-data boundaries.
	assert.equal(planned.ok, false);
	const state = controller.getState();
	const options = { scope: "new-folder", projectRevision: state.revision, destinationCollectionInternalId: c, lists: [selected(1, 1, 0), selected(2), selected(3, 0, 1)] };
	const ready = createTraktCreationPlan(state.project, options); assert.equal(ready.ok, true);
	assert.deepEqual(ready.plan.counts, { collectionCount: 0, folderCount: 2, sourceCount: 2, omittedCount: 2 });
	assert.deepEqual(ready.plan.folders.map(f => f.sources.map(s => s.editable.mediaType)), [["TV"], ["TV"]]);
	assert.equal(applyTraktCreationPlan(controller, ready.plan).ok, true); assert.deepEqual(controller.getState().project.collections[0].folders[0], oldFolder);
	const complete = createTraktCreationPlan(controller.getState().project, { ...options, projectRevision: controller.getState().revision });
	assert.equal(complete.plan.counts.folderCount, 0); const revision = controller.getState().revision;
	assert.equal(applyTraktCreationPlan(controller, complete.plan).ok, false); assert.equal(controller.getState().revision, revision);
});

test("Add Source omits only proven equivalents and permits known variants and unknown semantics", () => {
	const controller = app();
	const raw = (id, extra = {}) => ({ title: "Imported", provider: "trakt", mediaType: "MOVIE", traktListId: id, sortBy: "rank", sortHow: "asc", ...extra });
	controller.importValue([{ title: "C", folders: [{ title: "F", sources: [raw(1), raw(2, { sortBy: "title" }), raw(3, { future: true }), raw("4")], catalogSources: [] }, { title: "Elsewhere", sources: [raw(5)], catalogSources: [] }] }]);
	const state = controller.getState(), folder = state.project.collections[0].folders[0];
	const planned = createTraktCreationPlan(state.project, { scope: "add-source", projectRevision: state.revision, destinationFolderInternalId: folder.internalId, lists: [1, 2, 3, 4, 5].map(id => selected(id, 1, 0)) });
	assert.equal(planned.ok, true); assert.deepEqual(planned.plan.counts, { collectionCount: 0, folderCount: 0, sourceCount: 4, omittedCount: 1 });
	assert.equal(planned.plan.outcomes[1].ready[0].destination[0].comparison, "known-variant"); assert.equal(planned.plan.outcomes[2].ready[0].destination[0].comparison, "unknown-comparison");
	assert.equal(planned.plan.outcomes[3].ready[0].destination.length, 0); assert.equal(planned.plan.outcomes[4].ready[0].elsewhere.length, 1);
	assert.deepEqual(planned.plan.sources.map(s => s.editable.title), [2, 3, 4, 5].map(id => `List ${id} · Movies`));
	assert.equal(applyTraktCreationPlan(controller, planned.plan).ok, true); assert.equal(controller.getState().project.collections[0].folders.length, 2);
	assert.deepEqual(controller.getState().project.collections[0].folders[0].sources.slice(0, 4), folder.sources);
});

test("names affect ready output only, stable physical keys and hidden-title presentation", () => {
	const controller = app(); const row = { ...selected(1), list: { ...list(1), name: null }, sourceTitles: { MOVIE: "Custom" } };
	const result = planFor(controller, [row]); assert.equal(result.plan.folders[0].folder.editable.title, "Trakt List 1"); assert.deepEqual(result.plan.folders[0].sources.map(s => s.editable.title), ["Custom", "Series"]);
	assert.equal(planFor(controller, [{ ...row, folderTitle: "" }]).ok, false);
	const hidden = planFor(controller, [{ ...row, folderTitle: "" }], { folderTitleVisibility: "HIDE_EVERYWHERE", hideCollectionTitle: true, collectionTitle: "", viewMode: "ROWS", showAllTab: false }); assert.equal(hidden.ok, true); assert.equal(hidden.plan.collections[0].collection.editable.showAllTab, true);
	assert.equal(planFor(controller, [{ ...row, sourceTitles: { MOVIE: "" } }]).ok, false);
	const { c, f } = destinations(controller); source(controller, f, 1);
	const omitted = createTraktCreationPlan(controller.getState().project, { scope: "new-folder", projectRevision: controller.getState().revision, destinationCollectionInternalId: c, lists: [{ ...row, sourceTitles: { MOVIE: "" } }] });
	assert.equal(omitted.ok, true); assert.equal(omitted.plan.folders[0].sources[0].editable.title, "Series");
});

test("plan captures immutable configuration, rejects stale selection/media/destination/project and tampering", () => {
	const controller = app(), state = controller.getState(); const rows = [selected(1)]; const p = planFor(controller, rows).plan;
	rows[0].list.name = "Changed outside"; assert.equal(p.configuration.lists[0].list.name, "List 1");
	assert.equal(validateTraktCreationPlan(p, { project: state.project, projectRevision: state.revision }).ok, true);
	for (const configuration of [{ ...p.configuration, lists: [selected(2)] }, { ...p.configuration, lists: [{ ...selected(1), media: chooseTraktMedia(selected(1).media, "movies") }] }, { ...p.configuration, scope: "add-source", destinationFolderInternalId: "missing" }]) assert.equal(validateTraktCreationPlan(p, { project: state.project, projectRevision: state.revision, options: configuration }).ok, false);
	assert.equal(validateTraktCreationPlan({ ...p, counts: { ...p.counts, sourceCount: 99 } }, { project: state.project, projectRevision: state.revision }).ok, false);
	controller.createCollection({ editable: { title: "Other" } }); assert.equal(applyTraktCreationPlan(controller, p).stale, true);
	assert.equal(planFor(controller, [{ ...selected(1), media: initialTraktMedia() }]).ok, false);
	assert.equal(planFor(controller, [selected(1), selected(1)]).ok, false);
});

test("late controller ID failure rolls the whole planned operation back", () => {
	let count = 0; const controller = app(() => ++count < 4 ? `id-${count}` : "collision");
	const before = controller.getState(), p = planFor(controller, [selected(1), selected(2)]);
	assert.equal(p.ok, true); assert.equal(applyTraktCreationPlan(controller, p.plan).ok, false); assert.equal(controller.getState().revision, before.revision); assert.deepEqual(controller.getState().project, before.project);
});

test("foundation remains absent from visible menus and B2 editor still owns title only", () => {
	assert.equal(CREATION_OPTIONS.some(option => /trakt/i.test(option.id + option.label)), false);
	assert.equal(AVAILABLE_SOURCE_MODES.some(option => /trakt/i.test(option.id + option.label)), false);
	const editor = fs.readFileSync(new URL("../builder/src/source-edit/trakt-list-editor.js", import.meta.url), "utf8");
	assert.match(editor, /ownedFields: Object\.freeze\(\["title"\]\)/);
});
