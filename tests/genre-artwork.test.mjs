import { buildBuilderViewModel } from "../builder/src/ui/view-model.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import { GENRE_ARTWORK_SLUGS, GENRE_ARTWORK_SHAPES, genreArtworkRoleUrl, resolveGenreArtwork } from "../js/genre-artwork.mjs";
import { createBuilderController } from "../builder/src/application/index.js";
import { buildGenreSourceDrafts, createGenreHierarchyPlan, applyGenreHierarchyPlan, GENRE_CONCEPTS } from "../builder/src/source-add/index.js";
import { loadFolderArtworkSuggestions, folderArtworkSuggestionForField, resolveFolderArtworkIdentity } from "../builder/src/folder-artwork-suggestions.js";
import { createNodeEditorDraft, updateNodeEditorTileShape, buildNodeEditorPatch } from "../builder/src/ui/node-editor.js";
import { applyNodeEditorDraft } from "../builder/src/ui/node-editor-actions.js";
import { advancedDiscoverArtworkSuggestions } from "../builder/src/source-add/advanced-discover-artwork.js";

import { createSourceEditSession, saveSourceEdit, updateGenreSourceAdvanced, sourceEditorFor } from "../builder/src/source-edit/index.js";
import { createDecadesHierarchyPlan, applyDecadesHierarchyPlan } from "../builder/src/source-add/decades-plan.js";

const contract = JSON.parse(fs.readFileSync(new URL("./fixtures/genre-artwork-contract.json", import.meta.url), "utf8"));
const roles = { POSTER: ["poster", "posterFocus"], SQUARE: ["square", "squareFocus"], LANDSCAPE: ["landscape", "focus"] };
const json = (value) => JSON.parse(JSON.stringify(value));
const app = () => { let id=0; return createBuilderController({ idFactory: () => `internal-${++id}`, nuvioIdFactory: () => `nuvio-${++id}` }); };

test("all 31 pinned manifest identities resolve the exact eight roles and all three shape pairs", () => {
 assert.equal(Object.keys(contract.sets).length, 31);
 assert.deepEqual(Object.keys(GENRE_ARTWORK_SLUGS).sort(), Object.keys(contract.sets).sort());
 let checked=0;
 for (const [name, expected] of Object.entries(contract.sets)) {
  for (const [role,url] of Object.entries(expected)) { assert.equal(genreArtworkRoleUrl(name,role),url,`${name} / ${role}`); assert.match(url,/\.webp$/); checked++; }
  for (const [shape,[cover,focus]] of Object.entries(roles)) assert.deepEqual(resolveGenreArtwork(name,shape), {coverImageUrl:expected[cover],focusGifUrl:expected[focus],heroBackdropUrl:expected.hero,titleLogoUrl:expected.titleLogo},`${name} / ${shape}`);
 }
 assert.equal(checked,248);
 for (const [a,b] of [["Music","Musicals"],["Science Fiction","Sci-Fi & Fantasy"],["Action","Action & Adventure"],["War","War & Politics"]]) assert.notDeepEqual(resolveGenreArtwork(a),resolveGenreArtwork(b));
 for (const name of ["Unknown", "comedy", "Comedy ", "__proto__", "toString"]) assert.equal(resolveGenreArtwork(name),null);
 assert.equal(resolveGenreArtwork("Comedy","FOLLOW_LAYOUT"),null);
 assert.equal(genreArtworkRoleUrl("Comedy","focusPoster"),null);
 assert.equal(GENRE_CONCEPTS.length,27);
 for (const name of ["Disaster","Musicals","Queer","Rom Com"]) assert.equal(GENRE_CONCEPTS.some(g=>g.name===name),false);
});

function v1Harness(shape) {
 const context = vm.createContext({ window: { nuvioGenreArtwork: resolveGenreArtwork } });
 vm.runInContext(fs.readFileSync(new URL("../js/genres.js",import.meta.url),"utf8"),context);
 vm.runInContext(fs.readFileSync(new URL("../js/genre-nuvio-export.js",import.meta.url),"utf8"),context);
 context.shape=shape;
 context.isExportableGenreReference = (genre) => ["Official TMDB Genre", "Curated TMDB List"].includes(genre.type);
 vm.runInContext(`
 const selected = window.tmdbGenreReference.filter(g => ["Action", "Adventure", "Action & Adventure", "Comedy", "Music", "Musicals"].includes(g.name));
 getSelectedGenres = () => selected;
 getSelectedOfficialGenres = () => selected.filter(g => g.type === "Official TMDB Genre");
 createNuvioIdFactory = () => { let n=0; return {create: kind => kind + '-' + ++n}; };
 getGenreNuvioOptions = () => ({collectionName:"Genres",viewMode:"TABBED_GRID",tileShape:shape,dateFrom:"2001-01-01",dateTo:"2020-12-31",minRating:"7",language:"en",country:"AU",actionAdventureMerge:"both",scifiFantasyMerge:"standalone",warPoliticsMerge:"standalone"});
 `,context);
 return json(vm.runInContext("createGenreNuvioJson()",context));
}

test("V1 generated output uses all artwork fields without altering IDs, source/filter payload, merge or envelope", () => {
 const outputs=GENRE_ARTWORK_SHAPES.map(shape=>v1Harness(shape));
 const strip=(output)=>output.map(c=>({...c,folders:c.folders.map(({tileShape,coverImageUrl,focusGifUrl,heroBackdropUrl,titleLogoUrl,...rest})=>rest)}));
 for(const [i,output] of outputs.entries()) {
  assert.deepEqual(strip(output),strip(outputs[0]));
  for(const f of output[0].folders) { const expected=resolveGenreArtwork(f.title,GENRE_ARTWORK_SHAPES[i]); for(const [field,url] of Object.entries(expected)) assert.equal(f[field],url); assert.equal(f.focusGifEnabled,false); assert.equal(f.heroVideoUrl,""); assert.deepEqual(f.catalogSources,[]); }
  assert.doesNotMatch(JSON.stringify(output),/collection_covers\/genre\/[^" ]*\.jpg/);
 }
 const c=outputs[0][0];
 assert.equal(c.backdropImageUrl,"https://raw.githubusercontent.com/davecollections/nuvio-assets/main/assets/backdrops/genre/genre%20hero%20backdrop.jpg");
 assert.equal(c.showAllTab,false); assert.equal(c.focusGlowEnabled,true); assert.equal(c.pinToTop,false);
 assert.deepEqual(c.folders.map(f=>f.title),["Action","Adventure","Comedy","Music","Musicals"]);
 for(const title of ["Action","Adventure"]) {
  const sources=c.folders.find(f=>f.title===title).sources;
  assert.equal(sources.length,2);
  assert.deepEqual(sources[1],{title:"Action & Adventure Series",sortBy:"popularity.desc",tmdbId:null,filters:{withGenres:"10759",releaseDateGte:"2001-01-01",releaseDateLte:"2020-12-31",voteAverageGte:"7",withOriginalLanguage:"en",withOriginCountry:"AU"},provider:"tmdb",mediaType:"TV",tmdbSourceType:"DISCOVER"});
 }
 assert.deepEqual(c.folders.find(f=>f.title==="Musicals").sources,[{title:"Musicals",sortBy:"vote_average.desc",tmdbId:5916,filters:{},provider:"tmdb",mediaType:"MOVIE",tmdbSourceType:"LIST"}]);
});

test("V2 New Collection and New Folder author all three shapes, round-trip and keep source semantics", () => {
 let expectedSources;
 for(const scope of ["new-collection","new-folder"]) for(const shape of GENRE_ARTWORK_SHAPES) {
  const controller=app(); const parent=controller.createCollection({editable:{title:"Existing",viewMode:"ROWS",pinToTop:true}}).createdInternalId;
  const before=json(controller.serializeProject().value[0]);
  const state=controller.getState();
  const result=createGenreHierarchyPlan(state.project,{scope,projectRevision:state.revision,genres:["Comedy","Action & Adventure"],folderTileShape:shape,...(scope==="new-folder"?{destinationCollectionInternalId:parent}:{})});
  assert.equal(result.ok,true,JSON.stringify(result.errors));
  assert.equal(applyGenreHierarchyPlan(controller,result.plan).ok,true);
  const output=json(controller.serializeProject().value); const target=scope==="new-folder"?output[0]:output[1];
  if(scope==="new-collection") assert.deepEqual(output[0],before);
  for(const folder of target.folders) { assert.equal(folder.tileShape,shape); for(const [field,url] of Object.entries(resolveGenreArtwork(folder.title,shape))) assert.equal(folder[field],url); assert.equal(folder.focusGifEnabled,false); }
  const sources=target.folders.map(f=>f.sources.map(({id,...s})=>s)); expectedSources??=sources; assert.deepEqual(sources,expectedSources);
  const reopened=app(); assert.equal(reopened.importValue(output).ok,true); assert.deepEqual(json(reopened.serializeProject().value),output);
 }
});

test("Genre shape transitions own each curated field independently and preserve historical/custom/unknown data", async () => {
 const landscape=resolveGenreArtwork("Comedy","LANDSCAPE");
 const sources=buildGenreSourceDrafts(["Comedy"],{sortOptionIds:["popular","recent"]}).drafts.map(d=>d.editable);
 const cases=[{}, {coverImageUrl:"https://custom.example/tile.webp"}, {focusGifUrl:"https://custom.example/focus.webp"}, {heroBackdropUrl:"https://custom.example/hero.webp"}, {titleLogoUrl:"https://custom.example/logo.webp"}, {coverImageUrl:"https://raw.githubusercontent.com/davecollections/nuvio-assets/main/assets/collection_covers/genre/wide/comedy%20wide.jpg",focusGifUrl:"https://custom.example/unknown.gif"}, {coverImageUrl:{unknown:true},focusGifUrl:null}];
 for(const custom of cases) {
  const controller=app(); const value=[{id:"c",title:"Collection",folders:[{id:"f",title:"Comedy",tileShape:"LANDSCAPE",...landscape,...custom,focusGifEnabled:false,heroVideoUrl:"https://custom.example/video.mp4",unknown:{keep:[1,2]},sources}]}];
  assert.equal(controller.importValue(value).ok,true);
  const folder=controller.getState().project.collections[0].folders[0];
  const before=json(controller.serializeProject().value);
  const suggestionSet=await loadFolderArtworkSuggestions({folder}); assert.ok(suggestionSet,"multiple sort variants retain one Genre artwork identity");
  for(const shape of GENRE_ARTWORK_SHAPES) for(const field of ["coverImageUrl","focusGifUrl","heroBackdropUrl","titleLogoUrl"]) assert.equal(folderArtworkSuggestionForField(suggestionSet,field,shape),resolveGenreArtwork("Comedy",shape)[field]);
  let draft=createNodeEditorDraft(folder);
  for(const shape of ["SQUARE","POSTER"]) { draft=updateNodeEditorTileShape(draft,shape,suggestionSet); for(const field of ["coverImageUrl","focusGifUrl"]) if(!Object.hasOwn(custom,field)) assert.equal(draft.values[field],resolveGenreArtwork("Comedy",shape)[field]); }
  assert.deepEqual(json(controller.serializeProject().value),before,"draft-only until Apply");
  assert.equal(applyNodeEditorDraft(controller,draft).ok,true);
  const output=json(controller.serializeProject().value[0].folders[0]);
  for(const [field,value] of Object.entries(custom)) assert.deepEqual(output[field],value,field);
  assert.equal(output.focusGifEnabled,false); assert.deepEqual(output.unknown,{keep:[1,2]}); assert.equal(output.heroVideoUrl,value[0].folders[0].heroVideoUrl);
  assert.deepEqual(output.sources,sources); assert.equal(output.tileShape,"POSTER");
  assert.equal(output.heroBackdropUrl,custom.heroBackdropUrl??landscape.heroBackdropUrl); assert.equal(output.titleLogoUrl,custom.titleLogoUrl??landscape.titleLogoUrl);
  assert.deepEqual(buildNodeEditorPatch(createNodeEditorDraft(controller.getState().project.collections[0].folders[0])),{});
 }
});

test("generic Square needs no curated asset; unknown shapes preserve until explicit replacement; Discover reuses eight Genre roles", () => {
 const controller=app(); const parent=controller.createCollection({editable:{title:"Manual"}}).createdInternalId;
 assert.equal(controller.createFolder(parent,{editable:{title:"Square",tileShape:"SQUARE"}}).ok,true);
 assert.equal(controller.serializeProject().value[0].folders[0].tileShape,"SQUARE");
 controller.selectNode(parent);
 assert.equal(buildBuilderViewModel(controller.getState()).folders[0].tileShape,"Square");
 assert.equal(controller.serializeProject().value[0].folders[0].coverImageUrl,undefined);
 for(const tileShape of ["FOLLOW_LAYOUT","FUTURE",{raw:true}]) { const draft=createNodeEditorDraft({nodeType:"folder",internalId:"f",editable:{title:"Imported",tileShape},sources:[]}); assert.deepEqual(buildNodeEditorPatch(draft),{}); assert.deepEqual(buildNodeEditorPatch(updateNodeEditorTileShape(draft,"SQUARE",null)),{tileShape:"SQUARE"}); }
 const set=advancedDiscoverArtworkSuggestions({mediaMode:"movies",filters:{withGenres:"35"}});
 for(const shape of GENRE_ARTWORK_SHAPES) assert.equal(folderArtworkSuggestionForField(set,"focusGifUrl",shape),resolveGenreArtwork("Comedy",shape).focusGifUrl);
});


const richGenreFilters = {
 withKeywords: "6054|15097", withoutKeywords: "210024", withCompanies: "3|174", withoutCompanies: "2",
 withNetworks: "213", releaseDateGte: "2001-02-03", releaseDateLte: "2004-05-06", year: "2003",
};

function importGenreFolder(controller, sources, artwork = {}) {
 const result = controller.importValue([{ id: "c", title: "Collection", folders: [{
  id: "f", title: "Renamed folder", tileShape: "LANDSCAPE", ...resolveGenreArtwork("Comedy"),
  focusGifEnabled: false, ...artwork, sources,
 }] }]);
 assert.equal(result.ok, true, JSON.stringify(result.errors));
 return controller.getState().project.collections[0].folders[0];
}

test("rich Genre filters and repeated configured variants retain one canonical artwork identity", async () => {
 for (const providerFilters of [{}, { watchRegion: "AU", withWatchProviders: "8", withoutWatchProviders: "9" }]) {
  const controller = app();
  const built = buildGenreSourceDrafts(["Comedy"], { sharedMediaChoice: "both", sortOptionIds: ["popular", "recent"], advanced: { filters: { ...richGenreFilters, ...providerFilters } } });
  assert.equal(built.ok, true, JSON.stringify(built.errors));
  const folder = importGenreFolder(controller, built.drafts.map(draft => draft.editable));
  const before = json(controller.serializeProject().value);
  assert.equal(folder.sources.length, 4);
  assert.deepEqual(resolveFolderArtworkIdentity(folder), { authority: "genre", genreName: "Comedy", key: "genre:Comedy" });
  for (const source of folder.sources) {
   assert.equal(sourceEditorFor(source)?.id, providerFilters.withWatchProviders ? "advanced-discover" : "genre", "editor routing remains separate from artwork identity");
   assert.equal(source.editable.filters.withNetworks, source.editable.mediaType === "TV" ? "213" : undefined);
  }
  const suggestions = await loadFolderArtworkSuggestions({ folder });
  for (const shape of GENRE_ARTWORK_SHAPES) for (const [field, url] of Object.entries(resolveGenreArtwork("Comedy", shape))) assert.equal(folderArtworkSuggestionForField(suggestions, field, shape), url);
  assert.deepEqual(json(controller.serializeProject().value), before);
 }
});

test("ambiguous Genre anchors and conflicting mirrors never authorize curated artwork replacement", async () => {
 const built = buildGenreSourceDrafts(["Comedy"], { sharedMediaChoice: "both", advanced: { filters: richGenreFilters } });
 assert.equal(built.ok, true, JSON.stringify(built.errors));
 const base = built.drafts.find(draft => draft.editable.mediaType === "MOVIE").editable;
 for (const filters of [
  { ...base.filters, withGenres: "35|18" },
  { ...base.filters, withGenres: "999999" },
  { ...base.filters, withGenres: { preserved: true } },
  { ...base.filters, with_genres: "18" },
 ]) {
  const controller = app();
  const folder = importGenreFolder(controller, [{ ...base, filters }]);
  const before = json(controller.serializeProject().value);
  assert.equal(resolveFolderArtworkIdentity(folder), null);
  const suggestions = await loadFolderArtworkSuggestions({ folder });
  assert.equal(suggestions, null);
  const draft = updateNodeEditorTileShape(createNodeEditorDraft(folder), "SQUARE", suggestions);
  assert.deepEqual(buildNodeEditorPatch(draft), { tileShape: "SQUARE" });
  assert.equal(applyNodeEditorDraft(controller, draft).ok, true);
  const expected = structuredClone(before); expected[0].folders[0].tileShape = "SQUARE";
  assert.deepEqual(json(controller.serializeProject().value), expected);
 }
});

test("rich Genre source editing and all shape transitions independently preserve custom artwork and focus state", async () => {
 const built = buildGenreSourceDrafts(["Comedy"], { sharedMediaChoice: "both", advanced: { filters: richGenreFilters } });
 assert.equal(built.ok, true);
 const artworkFields = ["coverImageUrl", "focusGifUrl", "heroBackdropUrl", "titleLogoUrl"];
 for (const focusGifEnabled of [false, true]) for (const customField of [null, ...artworkFields]) {
  const controller = app();
  const custom = customField ? { [customField]: "https://custom.example/owner-artwork.webp" } : {};
  let folder = importGenreFolder(controller, built.drafts.map(draft => draft.editable), { ...custom, focusGifEnabled, ownerExtra: { keep: [false, 0] } });
  const before = json(controller.serializeProject().value);
  const opened = createSourceEditSession(controller.getState().project, folder.sources[0].internalId);
  assert.equal(opened.ok, true);
  const changed = updateGenreSourceAdvanced(opened.draft, { ...opened.draft.advanced, minimumVotes: "12" });
  assert.equal(saveSourceEdit(controller, opened.session, changed).ok, true);
  const afterEdit = json(controller.serializeProject().value);
  const expected = structuredClone(before); expected[0].folders[0].sources[0].filters.voteCountGte = 12;
  assert.deepEqual(afterEdit, expected, "source editing changes only the touched filter");
  folder = controller.getState().project.collections[0].folders[0];
  const suggestions = await loadFolderArtworkSuggestions({ folder });
  let draft = createNodeEditorDraft(folder);
  for (const shape of ["POSTER", "SQUARE", "LANDSCAPE"]) {
   draft = updateNodeEditorTileShape(draft, shape, suggestions);
   for (const field of artworkFields) assert.equal(draft.values[field], custom[field] ?? resolveGenreArtwork("Comedy", shape)[field]);
   assert.equal(draft.values.focusGifEnabled, focusGifEnabled);
   assert.deepEqual(json(controller.serializeProject().value), afterEdit, "shape changes remain draft-only");
  }
  draft = updateNodeEditorTileShape(draft, "SQUARE", suggestions);
  assert.equal(applyNodeEditorDraft(controller, draft).ok, true);
  const output = json(controller.serializeProject().value);
  const saved = output[0].folders[0];
  for (const field of artworkFields) assert.equal(saved[field], custom[field] ?? resolveGenreArtwork("Comedy", "SQUARE")[field]);
  assert.equal(saved.focusGifEnabled, focusGifEnabled);
  assert.deepEqual(saved.sources, afterEdit[0].folders[0].sources);
  assert.deepEqual(saved.ownerExtra, { keep: [false, 0] });
  const reopened = app(); assert.equal(reopened.importValue(output).ok, true);
  assert.deepEqual(json(reopened.serializeProject().value), output);
 }
});

test("rich Decades Advanced composes with Square without acquiring Genre artwork", async () => {
 for (const scope of ["new-collection", "new-folder"]) {
  const controller = app();
  const parent = controller.createCollection({ editable: { title: "Existing" } }).createdInternalId;
  const result = createDecadesHierarchyPlan(controller.getState().project, {
   scope, projectRevision: controller.getState().revision, folderTileShape: "SQUARE",
   ...(scope === "new-folder" ? { destinationCollectionInternalId: parent } : {}),
   source: { selectedDecadeIds: ["1980s"], mediaMode: "both", content: { wholeDecade: true, individualYears: true, genreBreakdown: true }, currentYear: 2026, genreNames: ["Comedy"],
    advanced: { filters: { withKeywords: "6054", withCompanies: "3", withNetworks: "213", watchRegion: "AU", withWatchProviders: "8" } } },
  });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(applyDecadesHierarchyPlan(controller, result.plan).ok, true);
  const folders = controller.getState().project.collections.flatMap(collection => collection.folders);
  assert.ok(folders.length);
  for (const folder of folders) {
   assert.equal(folder.editable.tileShape, "SQUARE");
   for (const field of ["coverImageUrl", "focusGifUrl", "heroBackdropUrl", "titleLogoUrl"]) assert.ok(!folder.editable[field], field);
   assert.equal(await loadFolderArtworkSuggestions({ folder }), null);
   for (const source of folder.sources) { assert.equal(source.editable.filters.withKeywords, "6054"); assert.equal(source.editable.filters.year, undefined); }
  }
  const output = json(controller.serializeProject().value), reopened = app();
  assert.equal(reopened.importValue(output).ok, true); assert.deepEqual(json(reopened.serializeProject().value), output);
 }
});
