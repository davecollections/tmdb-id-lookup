import assert from "node:assert/strict";
import test from "node:test";
import { createBuilderController } from "../builder/src/application/index.js";
import { createCollection, createFolder } from "../builder/src/domain/index.js";
import { NEW_COLLECTION_DEFAULTS, NEW_FOLDER_DEFAULTS } from "../builder/src/domain/node-defaults.js";
import { createDraftCollection, createDraftFolder } from "../builder/src/ui/draft-actions.js";
import { createNodeEditorDraft, updateNodeEditorField, buildNodeEditorPatch } from "../builder/src/ui/node-editor.js";
import { compileAdvancedDiscover, createAdvancedDiscoverDraft } from "../builder/src/source-add/advanced-discover.js";
import { advancedDiscoverFolders, createAdvancedDiscoverPlan, applyAdvancedDiscoverPlan } from "../builder/src/source-add/advanced-discover-plan.js";
import { compileGenreAdvancedFilters } from "../builder/src/source-add/genre-advanced.js";
import { isPristineGeneratedUntitledFolder } from "../builder/src/source-add/genre-source.js";

function createDiscover({ artwork, split = false } = {}) {
 const controller = createBuilderController();
 const draft = { ...createAdvancedDiscoverDraft(), mediaMode: "both", sortOptionIds: ["popular", "recent"], filters: { withGenres: "16|35", withoutGenres: "27|10762", withNetworks: "213,2", voteAverageGte: 0, voteCountGte: 0 } };
 const state = controller.getState();
 const options = { scope: "new-collection", projectRevision: state.revision, collectionTitle: "Defaults", draft, folderArrangement: split ? "split-media" : "one-folder", folderSettings: { combined: { artwork }, movies: { artwork }, series: { artwork: { focusGifEnabled: true } } } };
 const result = createAdvancedDiscoverPlan(state.project, options);
 assert.equal(result.ok, true, JSON.stringify(result.errors));
 assert.equal(applyAdvancedDiscoverPlan(controller, result.plan).ok, true);
 return { controller, options, plan: result.plan, value: controller.serializeProject().value };
}

function roundTrip(value) {
 const reopened = createBuilderController();
 assert.equal(reopened.importValue(value).ok, true);
 assert.deepEqual(reopened.serializeProject().value, value);
 return reopened;
}

test("every new container materializes effective presentation without replacing explicit false or unknown values", () => {
 for (const [factory, defaults] of [[createCollection, NEW_COLLECTION_DEFAULTS], [createFolder, NEW_FOLDER_DEFAULTS]]) {
  const untouched = factory().editable;
  const selected = factory({ editable: defaults }).editable;
  assert.deepEqual(untouched, selected);
  for (const [key, value] of Object.entries(defaults)) assert.equal(untouched[key], value);
  const explicit = Object.fromEntries(Object.keys(defaults).map(key => [key, false]));
  const preserved = factory({ rawImported: { extra: 0 }, editable: { ...explicit, extra: 0 } });
  for (const key of Object.keys(defaults)) assert.equal(preserved.editable[key], false);
  assert.equal(preserved.editable.extra, 0);
  const absent = factory({ rawImported: { title: "Imported" }, editable: { title: "Imported" } });
  for (const key of Object.keys(defaults)) assert.equal(Object.hasOwn(absent.editable, key), false);
 }
});

for (const enabled of [false, true]) for (const focusGifUrl of [undefined, "", "https://example.test/focus.gif"]) {
 test(`Discover Focus GIF ${enabled} exports independently of URL ${String(focusGifUrl)}`, () => {
  const { controller, plan, value } = createDiscover({ artwork: { focusGifEnabled: enabled, focusGifUrl } });
  assert.equal(plan.folders[0].artwork.focusGifEnabled, enabled);
  assert.equal(plan.folders[0].editable.focusGifEnabled, enabled);
  assert.equal(value[0].folders[0].focusGifEnabled, enabled);
  assert.equal(value[0].folders[0].focusGifUrl ?? "", focusGifUrl ?? "");
  assert.equal(value[0].folders[0].sources.length, 4);
  assert.equal(createNodeEditorDraft(controller.getState().project.collections[0].folders[0]).values.focusGifEnabled, enabled);
  const reopened = roundTrip(value);
  assert.equal(createNodeEditorDraft(reopened.getState().project.collections[0].folders[0]).values.focusGifEnabled, enabled);
 });
}

test("untouched Off and explicit Off yield the same semantic plan; split folder states and retained arrangements remain independent", () => {
 const untouched = createDiscover(), explicit = createDiscover({ artwork: { focusGifEnabled: false } });
 assert.deepEqual(untouched.plan.folders.map(f => f.editable), explicit.plan.folders.map(f => f.editable));
 assert.equal(untouched.value[0].folders[0].focusGifEnabled, false);
 const split = createDiscover({ split: true });
 assert.deepEqual(split.value[0].folders.map(f => f.focusGifEnabled), [false, true]);
 assert.deepEqual(split.value[0].folders.map(f => f.sources.length), [2, 2]);
 const drafts = compileAdvancedDiscover(split.options.draft).drafts;
 const combined = advancedDiscoverFolders({ ...split.options, folderArrangement: "one-folder" }, drafts);
 assert.equal(combined[0].artwork.focusGifEnabled, false);
 assert.deepEqual(advancedDiscoverFolders(split.options, drafts).map(f => f.artwork.focusGifEnabled), [false, true]);
 const movie = split.value[0].folders[0].sources[0], tv = split.value[0].folders[1].sources[0];
 assert.equal(movie.filters.withGenres, "16|35"); assert.equal(movie.filters.withoutGenres, "27");
 assert.equal(Object.hasOwn(movie.filters, "withNetworks"), false);
 assert.equal(tv.filters.withGenres, "16|35"); assert.equal(tv.filters.withoutGenres, "10762"); assert.equal(tv.filters.withNetworks, "213,2");
 assert.equal(movie.filters.voteAverageGte, 0); assert.equal(tv.filters.voteCountGte, 0);
 roundTrip(split.value);
});

test("saved edits retain On then Off after clearing a URL, including fields newly added to an imported node", () => {
 const controller = createBuilderController();
 const imported = [{ id: "collection", title: "Imported", custom: { keep: false }, folders: [{ id: "folder", title: "Folder", extra: 0, sources: [], catalogSources: [] }] }];
 assert.equal(controller.importValue(imported).ok, true);
 assert.deepEqual(controller.serializeProject().value, imported);
 for (const enabled of [true, false]) {
  const folder = controller.getState().project.collections[0].folders[0];
  let draft = createNodeEditorDraft(folder);
  draft = updateNodeEditorField(draft, "focusGifEnabled", enabled);
  draft = updateNodeEditorField(draft, "focusGifUrl", "");
  assert.equal(controller.updateNode(folder.internalId, buildNodeEditorPatch(draft)).ok, true);
  const saved = controller.getState().project.collections[0].folders[0];
  const reopened = createNodeEditorDraft(saved);
  assert.equal(reopened.original.focusGifEnabled.supported, true);
  assert.equal(reopened.values.focusGifEnabled, enabled);
  const value = controller.serializeProject().value;
  assert.equal(value[0].folders[0].focusGifEnabled, enabled);
  assert.equal(value[0].folders[0].focusGifUrl, "");
  assert.equal(value[0].folders[0].extra, 0); assert.deepEqual(value[0].custom, { keep: false });
  roundTrip(value);
 }
 for (const [field, value] of [["showAllTab", false], ["pinToTop", true], ["focusGlowEnabled", false]]) {
  const collection = controller.getState().project.collections[0];
  assert.equal(controller.updateNode(collection.internalId, { [field]: value }).ok, true);
  const draft = createNodeEditorDraft(controller.getState().project.collections[0]);
  assert.equal(draft.original[field].supported, true); assert.equal(draft.values[field], value);
 }
});

test("unsupported imported booleans and unrelated JSON remain exact through no-op editing", () => {
 for (const value of [null, 0, "false", { preference: true }]) {
  const controller = createBuilderController();
  const imported = [{ id: "c", title: "Imported", showAllTab: value, pinToTop: value, focusGlowEnabled: value, extra: false, folders: [{ id: "f", title: "Folder", focusGifEnabled: value, hideTitle: value, tileShape: "SQUARE", unknown: { zero: 0 }, sources: [], catalogSources: [] }] }];
  assert.equal(controller.importValue(imported).ok, true);
  for (const node of [controller.getState().project.collections[0], controller.getState().project.collections[0].folders[0]]) assert.deepEqual(buildNodeEditorPatch(createNodeEditorDraft(node)), {});
  assert.deepEqual(controller.serializeProject().value, imported);
 }
});

test("blank/shared creation has explicit defaults and still qualifies as a pristine Genre destination", () => {
 const controller = createBuilderController();
 const collection = createDraftCollection(controller);
 assert.equal(collection.ok, true);
 assert.equal(createDraftFolder(controller, collection.createdInternalId).ok, true);
 const folder = controller.getState().project.collections[0].folders[0];
 assert.equal(isPristineGeneratedUntitledFolder(folder), true);
 assert.equal(isPristineGeneratedUntitledFolder({ ...folder, editable: { ...folder.editable, focusGifEnabled: true } }), false);
 const value = controller.serializeProject().value;
 assert.equal(value[0].folders[0].focusGifEnabled, false);
 assert.equal(value[0].pinToTop, false); assert.equal(value[0].showAllTab, true);
 roundTrip(value);
});

test("neutral filters stay unrestricted and supported zero values are exported in shared Genre and Discover flows", () => {
 const context = { mediaType: "MOVIE", includedGenre: "Drama" };
 assert.deepEqual(compileGenreAdvancedFilters({}, context).filters, {});
 assert.deepEqual(compileGenreAdvancedFilters({ minimumRating: "0", maximumRating: "0", minimumVotes: "0" }, context).filters, { voteAverageGte: 0, voteAverageLte: 0, voteCountGte: 0 });
 const draft = createAdvancedDiscoverDraft();
 const untouched = compileAdvancedDiscover(draft).drafts[0].editable;
 const explicit = compileAdvancedDiscover({ ...draft, sortOptionIds: ["popular"], filters: { withOriginalLanguage: "", withOriginCountry: "", year: "", voteAverageGte: "" } }).drafts[0].editable;
 assert.deepEqual(explicit, untouched);
 assert.deepEqual(untouched.filters, {}); assert.equal(untouched.sortBy, "popularity.desc");
});
