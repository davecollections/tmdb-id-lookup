import { genrePreviewQueryFromDraft } from "../builder/src/source-add/tmdb-genre-preview-provider.js";
import { streamingPreviewQueryFromSource } from "../builder/src/source-add/tmdb-streaming-preview-provider.js";
import { exactDiscoverPreviewQuery } from "../builder/src/source-add/advanced-discover.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createBuilderController } from "../builder/src/application/index.js";
import * as add from "../builder/src/source-add/index.js";
import { resolveSourceNames, sourceNameState } from "../builder/src/source-add/source-names.js";
import { sourcePreviewVariantKey, sourceTitlePreviewRequest } from "../builder/src/source-add/source-title-preview.js";
import { createAdvancedDiscoverDraft, compileAdvancedDiscover, suggestDiscoverName } from "../builder/src/source-add/advanced-discover.js";
import { createAdvancedDiscoverPlan, applyAdvancedDiscoverPlan, inspectDiscoverDuplicates, discoverDuplicateOverrideIdentity } from "../builder/src/source-add/advanced-discover-plan.js";

// Pure contract fixtures; mounted evidence uses actual production providers.
const person = { id: 31, name: "Tom Hanks" }, studio = { id: 3, name: "Pixar" }, network = { id: 213, name: "Netflix" };
const provider = { id: 8, name: "Netflix", moviePriorities: { AU: 0 }, tvPriorities: { AU: 0 } };
const regions = [{ code: "AU", name: "Australia" }];
const genreOptions = { genres: [add.officialGenreConcept("Action"), add.officialGenreConcept("Comedy")], sharedMediaChoice: "both", sortOptionIds: ["popular"] };
const decadeOptions = { periodIds: ["year-1981", "year-1982"], mediaMode: "both", genreNames: [], sortOptionIds: ["popular"], advanced: {} };
const families = [
 { name: "People", build: () => add.buildPeopleSourceDrafts(person, { combinations: add.PEOPLE_SOURCE_COMBINATIONS.map(c => c.id) }).drafts, key: add.peopleSourceVariantKey, create: (app, { folderInternalId, ...o }) => add.createPeopleSourceBundle(app, { ...o, destination: { kind: "existing-folder", folderInternalId } }), options: { person }, duplicates: add.inspectPeopleSourceDuplicates, override: add.peopleDuplicateOverrideIdentity },
 { name: "Studio", build: () => add.buildStudioSourceDrafts(studio, { choices: ["studio-movies", "studio-series"] }).drafts, key: add.studioSourceVariantKey, create: add.createStudioSourceBundle, options: { studio }, duplicates: add.inspectStudioSourceDuplicates, override: add.studioDuplicateOverrideIdentity },
 { name: "Network", build: () => add.buildNetworkSourceDrafts(network).drafts, key: add.networkSourceVariantKey, create: add.createNetworkSource, options: { network }, duplicates: add.inspectNetworkSourceDuplicates, override: add.networkDuplicateOverrideIdentity },
 { name: "Genre", build: () => add.buildGenreSourceDrafts(genreOptions.genres, genreOptions).drafts, key: sourcePreviewVariantKey, create: add.createGenreSourceBundle, options: genreOptions, duplicates: add.inspectGenreSourceDuplicates, override: add.genreDuplicateOverrideIdentity },
 { name: "Decade", build: () => add.buildDecadeSourceBundleDrafts(decadeOptions).drafts, key: sourcePreviewVariantKey, create: add.createDecadeSourceBundle, options: decadeOptions, duplicates: add.inspectDecadeSourceDuplicates, override: add.decadeDuplicateOverrideIdentity },
 { name: "Streaming", build: () => add.buildStreamingSourceDrafts(provider, { regionCodes: ["AU"], mediaChoice: "both" }).drafts, key: sourcePreviewVariantKey, create: add.createStreamingSourceBundle, options: { provider, regions, catalogueRegions: regions, mediaChoice: "both" }, duplicates: add.inspectStreamingSourceDuplicates, override: add.streamingDuplicateOverrideIdentity },
 { name: "List", build: () => [1, 2].map(id => add.buildTmdbListSourceDraft({ id, name: "List " + id }).draft), key: d => add.tmdbListPhysicalIdentity(d.editable), create: add.createTmdbListSourceBundle, options: {}, duplicates: add.inspectTmdbListSourceDuplicates, override: add.tmdbListDuplicateOverrideIdentity },
 { name: "Franchise", build: () => [add.buildMovieFranchiseSourceDraft({ id: 10, name: "Star Wars Collection" }).draft], key: d => add.movieFranchiseDuplicateIdentity(d.editable), create: (app, { drafts, ...options }) => add.createMovieFranchiseSource(app, { ...options, draft: drafts[0] }), options: {} },
];
function appFor(sources = []) {
 let id = 0;
 const app = createBuilderController({ idFactory: () => "node-" + ++id, nuvioIdFactory: () => "nuvio-" + ++id });
 assert.equal(app.importValue([{ id: "c", title: "Collection", folders: [{ id: "f", title: "Folder", sources }] }]).ok, true);
 const folder = app.getState().project.collections[0].folders[0]; app.selectNode(folder.internalId);
 return { app, folder };
}
function saved(family, drafts) {
 const { app, folder } = appFor();
 const result = family.create(app, { ...family.options, folderInternalId: folder.internalId, drafts });
 assert.equal(result.ok, true, JSON.stringify(result.errors));
 return JSON.parse(app.stringifyProject().json)[0].folders[0].sources;
}
function withoutTitle(source) { const { title, ...recipe } = source; return recipe; }

for (const family of families) {
 test(`${family.name}: untouched names retain exact drafts and serialized output; custom changes title only`, () => {
  const drafts = family.build(); assert.ok(drafts.length && drafts.every(Boolean));
  const untouched = resolveSourceNames(drafts, {}, family.key);
  assert.deepEqual(untouched.drafts, drafts);
  assert.equal(untouched.customisedCount, 0);
  untouched.drafts.forEach((d, i) => assert.equal(d, drafts[i]));
  const defaults = saved(family, drafts);
  assert.deepEqual(saved(family, untouched.drafts), defaults);
  const names = { [family.key(drafts[0])]: "  Dave's picks  " };
  const named = resolveSourceNames(drafts, names, family.key);
  assert.equal(named.customisedCount, 1);
  assert.equal(named.drafts[0].editable.title, "Dave's picks");
  assert.deepEqual(named.drafts.map(d => withoutTitle(d.editable)), drafts.map(d => withoutTitle(d.editable)));
  const output = saved(family, named.drafts);
  assert.deepEqual(output, defaults.map((s, i) => i === 0 ? { ...s, title: "Dave's picks" } : s));
  assert.deepEqual(named.drafts.map(family.key), drafts.map(family.key));
  assert.deepEqual(family.build(), drafts, "canonical entity/generator is untouched");
 });
 test(`${family.name}: custom names cannot bypass destination duplicate checks or consent`, () => {
  const drafts = family.build(), named = resolveSourceNames(drafts, { [family.key(drafts[0])]: "Another name" }, family.key).drafts;
  const { app, folder } = appFor(drafts.map((d, i) => ({ ...d.editable, id: "source-" + i })));
  if (family.duplicates) {
   const before = family.duplicates(app.getState().project, folder.internalId, drafts), after = family.duplicates(app.getState().project, folder.internalId, named);
   assert.deepEqual(after.destination, before.destination);
   assert.equal(family.override(folder.internalId, named), family.override(folder.internalId, drafts));
  }
  const before = app.stringifyProject().json;
  const blocked = family.create(app, { ...family.options, folderInternalId: folder.internalId, drafts: named });
  assert.equal(blocked.ok, false, "same recipe remains a duplicate");
  assert.equal(app.stringifyProject().json, before);
 });
}

test("physical identity owns overrides across reorder, dormant selections and genuinely new recipes", () => {
 const originals = families.find(f => f.name === "Genre").build();
 const key = sourcePreviewVariantKey, target = originals[1], names = { [key(target)]: "Same visible title" };
 const reversed = resolveSourceNames([...originals].reverse(), names, key);
 assert.equal(reversed.drafts.find(d => key(d) === key(target)).editable.title, "Same visible title");
 const removed = resolveSourceNames(originals.filter(d => key(d) !== key(target)), names, key);
 assert.equal(removed.customisedCount, 0);
 assert.ok(removed.drafts.every(d => d.editable.title !== "Same visible title"));
 assert.equal(resolveSourceNames(originals, names, key).customisedCount, 1);
 const changed = { ...target, editable: { ...target.editable, sortBy: "vote_count.desc" } };
 assert.notEqual(key(changed), key(target));
 assert.equal(resolveSourceNames([changed], names, key).customisedCount, 0);
 const renamedDefault = { ...target, editable: { ...target.editable, title: "New generated wording" } };
 assert.equal(resolveSourceNames([renamedDefault], {}, key).drafts[0].editable.title, "New generated wording");
 assert.equal(resolveSourceNames([renamedDefault], names, key).drafts[0].editable.title, "Same visible title");
});
test("blank/equivalent names are automatic; invalid nonblank drafts remain recoverable without exporting them", () => {
 for (const value of [undefined, "", "   ", "Default", " Default "]) {
  const state = sourceNameState("Default", value); assert.equal(state.title, "Default"); assert.equal(state.customised, false); assert.equal(state.error, null);
 }
 const blank = sourceNameState("Default", ""); assert.equal(blank.value, "");
 const invalid = sourceNameState("Default", "\u200B"); assert.equal(invalid.value, "\u200B"); assert.ok(invalid.error); assert.equal(invalid.title, "Default"); assert.equal(invalid.resettable, true);
 assert.equal(sourceNameState("Default", "default").customised, true, "no fuzzy/case folding");
});
test("title-only Add validation does not relax canonical recipes or guided generation", () => {
 for (const family of families.filter(f => ["People", "Studio", "Network", "Genre", "Decade"].includes(f.name))) {
  const drafts = family.build(), named = resolveSourceNames(drafts, { [family.key(drafts[0])]: "Custom" }, family.key).drafts;
  const strict = family.name === "People" ? add.validatePeopleSourceDrafts(named, { person }) : family.name === "Studio" ? add.validateStudioSourceDrafts(named, { studio }) : family.name === "Network" ? add.validateNetworkSourceDrafts(named, { network }) : family.name === "Genre" ? add.validateGenreSourceDrafts(named, genreOptions) : add.validateDecadeSourceBundleDrafts(named, decadeOptions);
  assert.equal(strict.ok, false, family.name + " generation still requires canonical names");
  for (const patch of [{ provider: "unapproved" }, { tmdbSourceType: "unsupported" }, { unknownRecipe: "no" }, { title: "\u200B" }]) {
   const invalid = named.map((d, i) => i ? d : { ...d, editable: { ...d.editable, ...patch } });
   const { app, folder } = appFor(); const before = app.stringifyProject().json;
   assert.equal(family.create(app, { ...family.options, folderInternalId: folder.internalId, drafts: invalid }).ok, false, family.name + JSON.stringify(patch));
   assert.equal(app.stringifyProject().json, before);
  }
 }
});
test("Discover retains base-name compilation, output suffixes, duplicate identity and exact saved recipes", () => {
 const configuration = { ...createAdvancedDiscoverDraft(), mediaMode: "both", sortOptionIds: ["popular", "top-rated"] };
 const generated = { ...configuration, name: suggestDiscoverName(configuration) }, custom = { ...configuration, nameMode: "custom", name: "My picks" };
 const a = compileAdvancedDiscover(generated).drafts, b = compileAdvancedDiscover(custom).drafts;
 assert.equal(b.length, 4); assert.ok(b.every(d => d.editable.title.startsWith("My picks · ")));
 assert.deepEqual(b.map(d => withoutTitle(d.editable)), a.map(d => withoutTitle(d.editable)));
 assert.equal(discoverDuplicateOverrideIdentity("f", a), discoverDuplicateOverrideIdentity("f", b));
 const { app, folder } = appFor();
 const plan = createAdvancedDiscoverPlan(app.getState().project, { scope: "add-source", projectRevision: app.getState().revision, collectionInternalId: app.getState().project.collections[0].internalId, folderInternalId: folder.internalId, draft: custom });
 assert.equal(plan.ok, true, JSON.stringify(plan.errors)); assert.equal(applyAdvancedDiscoverPlan(app, plan.plan).ok, true);
 assert.deepEqual(JSON.parse(app.stringifyProject().json)[0].folders[0].sources.map(withoutTitle).map(({ id, ...r }) => r), a.map(d => d.editable).map(withoutTitle));
 assert.equal(inspectDiscoverDuplicates(app.getState().project, folder.internalId, a).duplicateDrafts.length, 4);
});
test("ordinary native Preview request parameters and physical identity ignore custom display names", () => {
 for (const [name, kind] of [["People", "people"], ["Studio", "studio"], ["Network", "network"], ["Franchise", "collection"], ["List", "list"]]) {
  const f = families.find(f => f.name === name), draft = f.build()[0], custom = resolveSourceNames([draft], { [f.key(draft)]: "Preview label" }, f.key).drafts[0];
  const { label: a, ...original } = sourceTitlePreviewRequest(kind, draft), { label: b, ...renamed } = sourceTitlePreviewRequest(kind, custom);
  assert.deepEqual(renamed, original, name);
 }
});

test("DISCOVER family Preview payloads ignore optional display titles", () => {
 for (const [name, query] of [["Genre", genrePreviewQueryFromDraft], ["Decade", add.decadePreviewQueryFromDraft], ["Streaming", d => streamingPreviewQueryFromSource(sourceTitlePreviewRequest("streaming", d).sourceNode)]]) {
  const f = families.find(f => f.name === name), drafts = f.build();
  const named = resolveSourceNames(drafts, { [f.key(drafts[0])]: "Different display only" }, f.key);
  assert.ok(query(drafts[0])); assert.deepEqual(query(named.drafts[0]), query(drafts[0]));
 }
 const draft = createAdvancedDiscoverDraft();
 const a = compileAdvancedDiscover({ ...draft, name: "Discover" }).drafts[0], b = compileAdvancedDiscover({ ...draft, name: "My Base", nameMode: "custom" }).drafts[0];
 assert.ok(exactDiscoverPreviewQuery(a)); assert.deepEqual(exactDiscoverPreviewQuery(b), exactDiscoverPreviewQuery(a));
});
test("different recipes may deliberately share one visible title", () => {
 const f = families.find(f => f.name === "Genre"), drafts = f.build();
 const named = resolveSourceNames(drafts, Object.fromEntries(drafts.map(d => [f.key(d), "Favourites"])), f.key);
 assert.equal(named.customisedCount, drafts.length); assert.equal(named.invalid, false);
 assert.ok(saved(f, named.drafts).every(s => s.title === "Favourites"));
});
