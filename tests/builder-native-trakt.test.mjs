import { updateTraktSourceSort, updateTraktSourceDirection } from "../builder/src/source-edit/trakt-list-editor.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createBuilderController } from "../builder/src/application/index.js";
import { createSource, SOURCE_CATEGORIES } from "../builder/src/domain/index.js";
import { nativeTraktSourceOccurrences } from "../builder/src/domain/trakt-source-occurrences.js";
import { importNuvioCollections, classifyNuvioSource } from "../builder/src/import/index.js";
import { extractSourceEditable } from "../builder/src/import/editable-fields.js";
import { validateMigrationProject } from "../builder/src/migrate/validation.js";
import { NATIVE_TRAKT_EDITABLE_FIELDS, SOURCE_EDITABLE_FIELDS } from "../builder/src/nuvio/known-fields.js";
import { TRAKT_SORT_VALUES, inspectNativeTraktSource, nativeTraktPhysicalIdentity, nativeTraktConfigurationKey } from "../builder/src/nuvio/trakt.js";
import { buildNativeTraktSourceDraft, validateNativeTraktSourceDraft } from "../builder/src/source-add/trakt-source.js";
import { AVAILABLE_SOURCE_MODES } from "../builder/src/source-add/source-modes.js";
import { CREATION_OPTIONS } from "../builder/src/ui/creation-options.js";
import { createSourceEditSession, saveSourceEdit, sourceEditorFor, updateSourceEditTitle } from "../builder/src/source-edit/index.js";
import { prepareSourceEditPreview } from "../builder/src/source-edit/source-edit-preview.js";
import { serializeNuvioProject, serializeNuvioSource } from "../builder/src/serialize/nuvio-serialize.js";
import { validateProjectTree } from "../builder/src/serialize/validation.js";
import { sourceCardDetails } from "../builder/src/ui/source-details.js";

const raw = (overrides = {}) => ({ title: "Local contract example", provider: "trakt", mediaType: "MOVIE", traktListId: 123, sortBy: "rank", sortHow: "asc", ...overrides });
const wrap = (sources) => [{ id: "trakt-contract", title: "Trakt contract", folders: [{ id: "trakt-folder", title: "Local sources", sources, catalogSources: [] }] }];
function ids() { let id = 0; return () => `b2-${++id}`; }
function node(overrides = {}) { return createSource({ category: "native-trakt", editable: raw(overrides), idFactory: ids() }); }
function imported(sources) { return importNuvioCollections(wrap(sources), { idFactory: ids() }); }
function appFor(sources) {
	const app = createBuilderController({ idFactory: ids() });
	assert.equal(app.importValue(wrap(sources)).ok, true);
	return app;
}
const first = (app) => app.getState().project.collections[0].folders[0].sources[0];
const open = (app) => createSourceEditSession(app.getState().project, first(app).internalId);

test("canonical constructor authors exactly six fields for Movie/TV and safe numeric boundaries", () => {
	assert.equal(SOURCE_CATEGORIES.NATIVE_TRAKT, "native-trakt");
	for (const mediaType of ["MOVIE", "TV"]) for (const traktListId of [1, 123, Number.MAX_SAFE_INTEGER]) {
		const result = buildNativeTraktSourceDraft({ title: "Source", mediaType, traktListId });
		assert.equal(result.ok, true);
		assert.deepEqual(result.draft, { category: "native-trakt", editable: raw({ title: "Source", mediaType, traktListId }) });
		assert.deepEqual(Object.keys(result.draft.editable).sort(), [...NATIVE_TRAKT_EDITABLE_FIELDS].sort());
		assert.equal(validateNativeTraktSourceDraft(result.draft).ok, true);
		assert.deepEqual(serializeNuvioSource(createSource({ ...result.draft, idFactory: ids() })).value, result.draft.editable);
	}
	for (const traktListId of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "123", "9007199254740993", null, undefined, NaN, Infinity]) {
		const result = buildNativeTraktSourceDraft({ title: "Source", mediaType: "MOVIE", traktListId });
		assert.equal(result.ok, false, String(traktListId)); assert.equal(result.draft, null);
	}
	for (const mediaType of ["movie", "SERIES", "BOTH", "", null]) assert.equal(buildNativeTraktSourceDraft({ title: "Source", mediaType, traktListId: 123 }).ok, false);
	for (const title of ["", "  ", "\u200B", null, 123]) assert.equal(buildNativeTraktSourceDraft({ title, mediaType: "MOVIE", traktListId: 123 }).ok, false);
	for (const field of ["filters", "tmdbId", "tmdbSourceType", "addonId", "catalogId", "type", "genre", "sortBy", "sortHow", "rawImported"]) {
		assert.equal(buildNativeTraktSourceDraft({ title: "Source", mediaType: "MOVIE", traktListId: 123, [field]: null }).ok, false);
		assert.equal(validateNativeTraktSourceDraft({ category: "native-trakt", editable: { ...raw(), [field]: null } }).ok, false);
	}
});

test("native Trakt classification requires explicit safe core without normalizing imports", () => {
	for (const sortBy of TRAKT_SORT_VALUES) for (const sortHow of ["asc", "desc"]) {
		const value = raw({ provider: "TrAkT", mediaType: "tv", sortBy, sortHow, future: { flag: false, count: 0, empty: "", nil: null } });
		const result = imported([value]); const source = result.project.collections[0].folders[0].sources[0];
		assert.equal(source.category, "native-trakt"); assert.deepEqual(source.rawImported, value);
		assert.equal(source.editable.provider, "TrAkT"); assert.equal(source.editable.mediaType, "tv");
		assert.equal(Object.hasOwn(source.editable, "future"), false);
		assert.deepEqual(serializeNuvioProject(result.project).value, wrap([value]));
		assert.deepEqual(validateProjectTree(result.project), []); assert.deepEqual(validateMigrationProject(result.project), []);
	}
	for (const changed of [{ traktListId: "123" }, { traktListId: "synthetic-list-42" }, { traktListId: "saved-list" }, { traktListId: 0 }, { traktListId: -1 }, { traktListId: 1.1 }, { traktListId: 9007199254740992 }, { traktListId: null }, { mediaType: null }, { mediaType: "SERIES" }, { sortBy: "future" }, { sortBy: "RANK" }, { sortHow: "DESC" }, { sortHow: null }]) {
		const value = raw(changed), result = imported([value]);
		assert.equal(result.ok, true); assert.equal(result.project.collections[0].folders[0].sources[0].category, "opaque");
		assert.equal(result.warnings[0].code, "UNSUPPORTED_TRAKT_SOURCE_PRESERVED");
		assert.deepEqual(serializeNuvioProject(result.project).value, wrap([value]));
	}
	for (const field of ["traktListId", "mediaType", "sortBy", "sortHow"]) {
		const value = raw(); delete value[field]; assert.equal(classifyNuvioSource(value).category, "opaque");
	}
	assert.equal(classifyNuvioSource({ ...raw(), provider: "community" }).category, "opaque");
	const absent = raw(); delete absent.provider; assert.equal(classifyNuvioSource(absent).category, "opaque");
	assert.equal(classifyNuvioSource({ provider: "addon", addonId: "aio-metadata", type: "movie", catalogId: "trakt.example", traktListId: 123 }).category, "addon");
	const warning = imported([raw({ traktListId: "private-value-not-for-warning", sortBy: "other-private-value" })]).warnings[0];
	assert.doesNotMatch(warning.message, /private-value/);
});

test("category field ownership leaves TMDB/addon/opaque extraction and Additional settings intact", () => {
	assert.equal(SOURCE_EDITABLE_FIELDS.includes("traktListId"), false);
	assert.equal(SOURCE_EDITABLE_FIELDS.includes("sortHow"), false);
	for (const category of ["native-tmdb", "addon", "opaque"]) {
		const result = extractSourceEditable({ ...raw(), filters: { withGenres: "1" }, addonId: "example" }, "$", category);
		assert.equal(Object.hasOwn(result.editable, "traktListId"), false); assert.equal(Object.hasOwn(result.editable, "sortHow"), false);
		assert.equal(result.editable.addonId, "example"); assert.deepEqual(result.editable.filters, { withGenres: "1" });
	}
	const result = extractSourceEditable({ ...raw(), filters: { withGenres: "1" }, addonId: "example" }, "$", "native-trakt");
	assert.deepEqual(result.editable, raw());
	const tmdb = { nodeType: "source", category: "native-tmdb", editable: { provider: "tmdb", title: "TMDB", tmdbSourceType: "LIST", tmdbId: 1, mediaType: "MOVIE", sortBy: "original", filters: {} }, rawImported: { traktListId: 123, sortHow: "asc" } };
	assert.equal(sourceCardDetails(tmdb).metadata.some((entry) => entry.value === "Additional settings"), true);
});

test("new malformed Trakt nodes fail serialization with dedicated diagnostics", () => {
	for (const [change, code] of [[{ provider: "tmdb" }, "INVALID_NATIVE_TRAKT_PROVIDER"], [{ traktListId: "123" }, "NATIVE_TRAKT_LIST_ID_REQUIRED"], [{ mediaType: "tv" }, "INVALID_NATIVE_TRAKT_MEDIA_TYPE"], [{ sortBy: "future" }, "UNSUPPORTED_NATIVE_TRAKT_SORT"], [{ sortHow: "down" }, "UNSUPPORTED_NATIVE_TRAKT_SORT_DIRECTION"], [{ title: "" }, "NATIVE_TRAKT_TITLE_REQUIRED"], [{ filters: {} }, "INVALID_NATIVE_TRAKT_FIELDS"]]) {
		const result = serializeNuvioSource(node(change)); assert.equal(result.ok, false); assert.ok(result.errors.some((entry) => entry.code === code), JSON.stringify(result.errors));
	}
});

test("physical identity ignores name/sort while configured equivalence is bounded and distinct", () => {
	const movie = node(), tv = node({ mediaType: "TV" }), title = node({ title: "Another title" }), sort = node({ sortBy: "added" }), direction = node({ sortHow: "desc" });
	assert.equal(nativeTraktPhysicalIdentity(movie), "trakt|123|MOVIE");
	assert.notEqual(nativeTraktPhysicalIdentity(movie), nativeTraktPhysicalIdentity(tv));
	for (const source of [title, sort, direction]) assert.equal(nativeTraktPhysicalIdentity(source), nativeTraktPhysicalIdentity(movie));
	assert.equal(nativeTraktConfigurationKey(movie), nativeTraktConfigurationKey(title));
	assert.notEqual(nativeTraktConfigurationKey(movie, { includeTitle: true }), nativeTraktConfigurationKey(title, { includeTitle: true }));
	for (const source of [sort, direction]) assert.notEqual(nativeTraktConfigurationKey(movie), nativeTraktConfigurationKey(source));
	const extra = { ...movie, rawImported: { future: { enabled: true } } };
	assert.equal(nativeTraktPhysicalIdentity(extra), "trakt|123|MOVIE"); assert.equal(nativeTraktConfigurationKey(extra), null);
	assert.equal(nativeTraktPhysicalIdentity({ ...movie, category: "opaque" }), null);
	const project = imported([raw(), raw({ mediaType: "TV" }), raw({ title: "Alternate", sortBy: "added" })]).project;
	const original = project.collections[0].folders[0]; project.collections[0].folders.push({ ...original, internalId: "elsewhere", sources: [{ ...original.sources[0], internalId: "elsewhere-source" }] });
	const all = nativeTraktSourceOccurrences(project, movie), sameFolder = nativeTraktSourceOccurrences(project, movie, { folderInternalId: original.internalId });
	assert.equal(all.length, 3); assert.equal(sameFolder.length, 2); assert.equal(all[2].folderInternalId, "elsewhere");
	assert.equal(Object.isFrozen(all), true); assert.equal(Object.isFrozen(all[0]), true);
});

test("title-only changes patch exactly title, preserves raw values, and rejects fixed-field tampering", () => {
	const value = raw({ provider: "TrAkT", mediaType: "tv", sortBy: "added", sortHow: "desc", unknown: { keep: [false, 0, null] }, filters: { future: true }, addonId: null });
	const app = appFor([value, value]); const opened = open(app), revision = app.getState().revision, project = app.getState().project;
	assert.equal(opened.ok, true); assert.equal(opened.session.adapterId, "trakt-list");
	assert.deepEqual(sourceEditorFor(first(app)).ownedFields, ["title", "sortBy", "sortHow"]); assert.equal(opened.draft.title, value.title);
	assert.equal(prepareSourceEditPreview(opened.session, opened.draft).previewable, false);
	assert.equal(saveSourceEdit(app, opened.session, opened.draft).changed, false); assert.equal(app.getState().project, project);
	assert.equal(saveSourceEdit(app, opened.session, updateSourceEditTitle(opened.draft, value.title)).changed, false);
	assert.equal(saveSourceEdit(app, opened.session, updateSourceEditTitle(opened.draft, " ")).validationFailed, true);
	for (const [field, changed] of Object.entries({ provider: "trakt", mediaType: "TV", traktListId: 124 })) {
		assert.equal(saveSourceEdit(app, opened.session, { ...updateSourceEditTitle(opened.draft, "New"), [field]: changed }).validationFailed, true, field);
		assert.equal(app.getState().revision, revision);
	}
	const result = saveSourceEdit(app, opened.session, { ...updateSourceEditTitle(opened.draft, "Renamed"), filters: {}, unknown: "tampered" });
	assert.equal(result.ok, true); assert.deepEqual(result.patch, { title: "Renamed" }); assert.equal(app.getState().revision, revision + 1);
	assert.deepEqual(first(app).rawImported, value); assert.deepEqual(app.serializeProject().value[0].folders[0].sources, [{ ...value, title: "Renamed" }, value]);
	assert.equal(saveSourceEdit(app, opened.session, opened.draft).errors[0].code, "SOURCE_EDIT_PROJECT_STALE");
	const reopened = open(app); assert.equal(saveSourceEdit(app, reopened.session, reopened.draft).changed, false);
	const invalidNameApp = appFor([raw({ title: null })]); assert.equal(open(invalidNameApp).draft.title, "");
});

test("Trakt editor retains shared stale identity, category, reordered, moved and deleted guards", () => {
	for (const kind of ["identity", "category", "reorder", "moved", "deleted", "project"]) {
		const app = appFor([raw(), raw({ mediaType: "TV" })]), opened = open(app);
		const changed = structuredClone(app.getState().project), folder = changed.collections[0].folders[0];
		if (kind === "identity") folder.sources[0].editable.traktListId = 456;
		if (kind === "category") folder.sources[0].category = "opaque";
		if (kind === "reorder") folder.sources.reverse();
		if (kind === "moved") { changed.collections[0].folders.push({ ...folder, internalId: "moved", sources: [folder.sources.shift()] }); }
		if (kind === "deleted") folder.sources.shift();
		// Same reference isolates the in-place guards; controller state itself stays immutable.
		const session = kind === "project" ? opened.session : { ...opened.session, openingProject: changed };
		const result = saveSourceEdit({ getState: () => ({ project: changed }), updateNode() { throw new Error("Must not mutate"); } }, session, updateSourceEditTitle(opened.draft, "New"));
		assert.equal(result.conflict, true, kind);
		assert.equal(result.errors[0].code, { identity: "SOURCE_EDIT_IDENTITY_STALE", category: "SOURCE_EDIT_ADAPTER_STALE", reorder: "SOURCE_EDIT_SOURCE_REORDERED", moved: "SOURCE_EDIT_TARGET_MOVED", deleted: "SOURCE_EDIT_TARGET_DELETED", project: "SOURCE_EDIT_PROJECT_STALE" }[kind]);
	}
});

test("unsupported saved/synthetic fixtures stay opaque and cannot acquire Source Edit", () => {
	for (const traktListId of ["synthetic-list-42", "saved-list", "123"]) {
		const app = appFor([raw({ traktListId })]); assert.equal(first(app).category, "opaque"); assert.equal(sourceEditorFor(first(app)), null); assert.equal(open(app).ok, false);
	}
	const old = JSON.parse(fs.readFileSync(new URL("./fixtures/nuvio/v2-compatibility/preservation/comprehensive-imported-profile.json", import.meta.url), "utf8"));
	const result = importNuvioCollections(old, { idFactory: ids() });
	const saved = result.project.collections.flatMap((c) => c.folders.flatMap((f) => f.sources)).find((s) => s.rawImported.traktListId === "synthetic-list-42");
	assert.equal(saved.category, "opaque"); assert.equal(sourceEditorFor(saved), null);
	assert.equal(AVAILABLE_SOURCE_MODES.some((entry) => entry.id === "trakt-lists"), true);
	assert.equal(CREATION_OPTIONS.some((entry) => entry.id === "trakt-lists"), true);
});

test("canonical authored sorts serialize across all 8 x 2 combinations while creation stays rank/asc", () => {
	assert.equal(TRAKT_SORT_VALUES.length, 8);
	for (const sortBy of TRAKT_SORT_VALUES) for (const sortHow of ["asc", "desc"]) {
		const source = node({ sortBy, sortHow });
		const serialized = serializeNuvioSource(source);
		assert.equal(serialized.ok, true, sortBy + "/" + sortHow);
		assert.deepEqual(serialized.value, raw({ sortBy, sortHow }));
		assert.equal(validateNativeTraktSourceDraft({ category: source.category, editable: source.editable }).ok, sortBy === "rank" && sortHow === "asc");
	}
	for (const invalid of [{ provider: "TrAkT" }, { mediaType: "tv" }, { traktListId: "123" }, { future: true }, { title: "" }]) {
		assert.equal(serializeNuvioSource(node({ sortBy: "title", sortHow: "desc", ...invalid })).ok, false);
	}
});

test("newly created source exports rank/asc then Source Edit title/desc and reimports without identity change", () => {
	const app = createBuilderController({ idFactory: ids() });
	const collection = app.createCollection({ editable: { id: "collection", title: "Collection" } });
	const folder = app.createFolder(collection.createdInternalId, { editable: { id: "folder", title: "Folder" } });
	const created = buildNativeTraktSourceDraft({ title: "Source", mediaType: "MOVIE", traktListId: 123 });
	assert.equal(app.createSource(folder.createdInternalId, created.draft).ok, true);
	assert.deepEqual(app.serializeProject().value[0].folders[0].sources[0], created.draft.editable);
	const originalIdentity = nativeTraktPhysicalIdentity(first(app)), opened = open(app);
	assert.equal(opened.draft.sortBy, "rank"); assert.equal(opened.draft.sortHow, "asc");
	const result = saveSourceEdit(app, opened.session, { ...opened.draft, sortBy: "title", sortHow: "desc" });
	assert.equal(result.ok, true); assert.deepEqual(result.patch, { sortBy: "title", sortHow: "desc" });
	assert.equal(nativeTraktPhysicalIdentity(first(app)), originalIdentity);
	const exported = app.serializeProject(); assert.equal(exported.ok, true);
	assert.deepEqual(exported.value[0].folders[0].sources[0], { ...created.draft.editable, sortBy: "title", sortHow: "desc" });
	const roundTrip = importNuvioCollections(exported.value, { idFactory: ids() });
	assert.equal(roundTrip.ok, true); assert.deepEqual(serializeNuvioProject(roundTrip.project).value, exported.value);
});

test("Trakt UI draft helpers preserve the independent field and immutable identity for every sort/direction", () => {
 const app = appFor([raw({ sortBy: "votes", sortHow: "desc" })]), opened = open(app);
 for (const sortBy of TRAKT_SORT_VALUES) {
  const draft = updateTraktSourceSort(opened.draft, sortBy);
  assert.deepEqual(draft, { ...opened.draft, sortBy });
  for (const sortHow of ["asc", "desc"]) assert.deepEqual(updateTraktSourceDirection(draft, sortHow), { ...draft, sortHow });
 }
 assert.equal(opened.draft.sortBy, "votes"); assert.equal(opened.draft.sortHow, "desc");
 for (const draft of [updateTraktSourceSort(opened.draft, "invalid"), updateTraktSourceDirection(opened.draft, "invalid")]) assert.equal(saveSourceEdit(app, opened.session, draft).validationFailed, true);
});

test("Source Edit emits only changed owned fields, preserves unknown raw data and leaves cancelled/no-op drafts inert", () => {
	for (const change of [{ title: "Renamed" }, { sortBy: "title" }, { sortHow: "desc" }, { title: "Renamed", sortBy: "votes", sortHow: "desc" }]) {
		const original = raw({ future: { keep: [false, 0, null] } });
		const app = appFor([original]), opened = open(app), before = app.getState();
		const draft = { ...opened.draft, ...change, titleTouched: Object.hasOwn(change, "title") };
		assert.equal(app.getState(), before, "editing/cancelling a draft cannot mutate the controller");
		const reverted = { ...draft, ...opened.draft };
		assert.equal(saveSourceEdit(app, opened.session, reverted).changed, false);
		assert.equal(app.getState().project, before.project);
		const result = saveSourceEdit(app, opened.session, draft);
		assert.equal(result.ok, true); assert.deepEqual(result.patch, change);
		assert.deepEqual(first(app).rawImported, original);
		assert.deepEqual(app.serializeProject().value[0].folders[0].sources[0], { ...original, ...change });
	}
	for (const change of [{ sortBy: "future" }, { sortHow: "DESC" }, { sortBy: null }, { sortHow: null }]) {
		const app = appFor([raw()]), opened = open(app), before = app.getState().project;
		assert.equal(saveSourceEdit(app, opened.session, { ...opened.draft, ...change }).validationFailed, true);
		assert.equal(app.getState().project, before);
		const importedApp = appFor([raw(change)]);
		assert.equal(first(importedApp).category, "opaque"); assert.equal(sourceEditorFor(first(importedApp)), null);
		assert.equal(open(importedApp).ok, false);
		assert.deepEqual(importedApp.serializeProject().value, wrap([raw(change)]));
	}
});
