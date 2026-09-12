import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import crypto from "node:crypto";
import { createBuilderController } from "../builder/src/application/index.js";
import { buildDiscoverSourceDraft } from "../builder/src/nuvio/discover.js";
import { advancedDiscoverQuery, compileAdvancedDiscover, createAdvancedDiscoverDraft, deriveAdvancedDiscoverFilters, DISCOVER_EXAMPLES, setDiscoverSelection, validateAdvancedFilters } from "../builder/src/source-add/advanced-discover.js";
import { createAdvancedDiscoverPlan, applyAdvancedDiscoverPlan, discoverDuplicateOverrideIdentity } from "../builder/src/source-add/advanced-discover-plan.js";
import { createSourceEditSession, saveSourceEdit } from "../builder/src/source-edit/source-edit-actions.js";
import { createKeywordIndex, searchKeywordIndex } from "../builder/src/source-add/keyword-matching.js";
import { interpretDiscoverDescription } from "../builder/src/source-add/discover-interpretation.js";
import { sha256Bytes } from "../builder/src/source-add/keyword-sha256.js";
import { discoverFilterRows } from "../builder/src/source-add/discover-selection-labels.js";
import { discoverGenreAvailability, removeUnavailableDiscoverGenres, validDiscoverExpression } from "../builder/src/source-add/advanced-discover.js";
test("Genre compatibility names excluded Movie genres without substituting Series genres", () => {
 const filters = { withoutGenres: "28,12,99", withGenres: "16|35", withKeywords: "818", voteCountGte: 100 };
 const result = discoverGenreAvailability(filters, "TV");
 assert.equal(result.message, "Action and Adventure aren't available for Series. Remove these selections or choose Movies.");
 assert.deepEqual(result.selections, [{ field: "withoutGenres", id: 28, name: "Action" }, { field: "withoutGenres", id: 12, name: "Adventure" }]);
 const validated = validateAdvancedFilters(filters, "TV");
 assert.equal(validated.ok, false); assert.equal(validated.errors.find(e=>e.code==="UNAVAILABLE_DISCOVER_GENRES").message, result.message);
 assert.equal(validated.filters.withoutGenres, filters.withoutGenres);
 assert.equal(discoverGenreAvailability(filters,"MOVIE").selections.length,0);
});
test("Remove unavailable genres changes only incompatible IDs and preserves remaining operators and exclusions", () => {
 const draft = { ...createAdvancedDiscoverDraft(), mediaMode: "series", operators: { withGenres: "|" }, filters: { withGenres: "28|16|35", withoutGenres: "14|12|99", withoutKeywords: "818,9951", releaseDateGte: "2020-01-01" } }, before=structuredClone(draft);
 const next=removeUnavailableDiscoverGenres(draft);
 assert.deepEqual(next,{...draft,filters:{...draft.filters,withGenres:"16|35",withoutGenres:"99"}});
 assert.deepEqual(draft,before);assert.equal(compileAdvancedDiscover(next).ok,true);
 assert.equal(removeUnavailableDiscoverGenres(next),next);
 const empty=removeUnavailableDiscoverGenres({...draft,mediaMode:"series",filters:{withoutGenres:"28,12",withoutKeywords:"818"}});
 assert.deepEqual(empty.filters,{withoutKeywords:"818"});
 const malformed={...draft,filters:{withGenres:"28,12|16,35"}};assert.equal(removeUnavailableDiscoverGenres(malformed),malformed);
 const both={...draft,mediaMode:"both"};assert.equal(removeUnavailableDiscoverGenres(both),both);
});
test("Changing genre matching applies to earlier and later included selections, never exclusions", () => {
 let draft=createAdvancedDiscoverDraft();
 draft=setDiscoverSelection(draft,"withGenres",{id:28,name:"Action"});draft=setDiscoverSelection(draft,"withGenres",{id:12,name:"Adventure"});
 draft=setDiscoverSelection(draft,"withoutGenres",{id:99,name:"Documentary"});
 draft=setDiscoverOperator(draft,"withGenres",",");draft=setDiscoverSelection(draft,"withGenres",{id:16,name:"Animation"});
 assert.equal(draft.filters.withGenres,"28,12,16");assert.equal(draft.filters.withoutGenres,"99");
 draft=setDiscoverOperator(draft,"withGenres","|");assert.equal(draft.filters.withGenres,"28|12|16");assert.equal(draft.filters.withoutGenres,"99");
});
test("Studio Review uses exact stored names while picker labels keep disambiguation", () => {
 const draft={...createAdvancedDiscoverDraft(),filters:{withCompanies:"1",withoutCompanies:"2"},labels:{"withCompanies:1":"BBC · GB · London","withoutCompanies:2":"A · B · US"},selectionNames:{"withCompanies:1":"BBC","withoutCompanies:2":"A · B"}}, before=structuredClone(draft);
 assert.deepEqual(discoverFilterRows(draft),[{label:"Studios",value:"Include BBC; Exclude A · B"}]);assert.deepEqual(draft,before);
});
test("Unverified mixed genre expressions stay preservation-only through import and export", () => {
 for(const expression of ["28,12|16,35","(28,12)|(16,35)","28,(12|16),35"]){
  assert.equal(validDiscoverExpression(expression),false);
  assert.equal(compileAdvancedDiscover({...createAdvancedDiscoverDraft(),filters:{withGenres:expression}}).ok,false);
  const c=controllerWithFolder([{id:"retained",provider:"tmdb",tmdbSourceType:"DISCOVER",mediaType:"MOVIE",title:"Saved mixed expression",filters:{withGenres:expression,withoutGenres:"99"},custom:{keep:true}}]);
  const before=c.stringifyProject().json,node=c.getState().project.collections[0].folders[0].sources[0];
  assert.equal(createSourceEditSession(c.getState().project,node.internalId,"advanced-discover").ok,false);
  assert.equal(c.stringifyProject().json,before);assert.equal(c.serializeProject().value[0].folders[0].sources[0].filters.withGenres,expression);
 }
});
test("Review groups readable filters without changing IDs, exclusions or the draft", () => {
 const draft = { ...createAdvancedDiscoverDraft(), filters: { withKeywords: "1|2", withoutKeywords: "3,4", withGenres: "12,16", withoutGenres: "14", releaseDateGte: "2026-08-31", releaseDateLte: "2026-09-30", year: "2026", voteAverageGte: "0", voteAverageLte: "8", voteCountGte: "100", withOriginalLanguage: "en", withOriginCountry: "GB", withCompanies: "5", withNetworks: "6,7", withWatchProviders: "8|9", withoutWatchProviders: "10,11", watchRegion: "AU" }, labels: { "withKeywords:1": "shark", "withKeywords:2": "sharks", "withoutKeywords:3": "alien", "withoutKeywords:4": "aliens", "withCompanies:5": "BBC", "withNetworks:6": "First network", "withNetworks:7": "Second network", "withWatchProviders:8": "First provider", "withWatchProviders:9": "Second provider", "withoutWatchProviders:10": "Third provider", "withoutWatchProviders:11": "Fourth provider" } };
 const before = structuredClone(draft), rows = Object.fromEntries(discoverFilterRows(draft).map(({ label, value }) => [label, value]));
 assert.deepEqual(rows, { Keywords: "Include shark OR sharks; Exclude alien OR aliens", Genres: "Include Adventure AND Animation; Exclude Fantasy", Dates: "From 31 August 2026; Through 30 September 2026; Exact year 2026", Rating: "At least 0 out of 10; At most 8 out of 10", Votes: "At least 100", "Original language": "English", "Origin country": "United Kingdom", Studios: "BBC", Networks: "First network AND Second network", "Watch providers": "Include First provider OR Second provider; Exclude Third provider OR Fourth provider", "Watch region": "Australia" });
 assert.deepEqual(draft, before);
});
test("Review omits unused filters and preserves unavailable names and extra settings", () => {
 assert.deepEqual(discoverFilterRows({ ...createAdvancedDiscoverDraft(), filters: { year: "", voteCountGte: null } }), []);
 assert.deepEqual(discoverFilterRows({ ...createAdvancedDiscoverDraft(), filters: { withKeywords: "99", custom: { keep: true } } }), [{ label: "Keywords", value: "Unavailable saved selection 99" }, { label: "Saved filter: custom", value: '{"keep":true}' }]);
});
test("New folder defaults are independent of changing Source names and filters", () => {
 for (const name of ["Sharks", "Adventure", "Owner's Source"]) {
  const draft = { ...createAdvancedDiscoverDraft(), name, mediaMode: "both" }, sources = compileAdvancedDiscover(draft).drafts;
  assert.deepEqual(advancedDiscoverFolders({ draft }, sources).map((f) => f.title), ["Discover"]);
  assert.deepEqual(advancedDiscoverFolders({ draft, folderArrangement: "split-media" }, sources).map((f) => f.title), ["Movies", "Series"]);
 }
});
test("Cleared required container names block apply without silently defaulting", () => {
 const c = controllerWithFolder(), config = { ...options(c, "new-collection"), collectionTitle: "Discover", folderSettings: { combined: { title: "Discover" } } };
 for (const field of ["collection", "folder"]) {
  const next = structuredClone(config);
  if (field === "collection") next.collectionTitle = ""; else next.folderSettings.combined.title = "";
  const before = structuredClone(next);
  assert.equal(createAdvancedDiscoverPlan(c.getState().project, next).ok, false);
  assert.deepEqual(next, before);
 }
});
const fixture = JSON.parse(fs.readFileSync(new URL("./fixtures/advanced-discover-matching.json", import.meta.url)));
const index = createKeywordIndex(fixture.keywords);
const search = (q, negative) => searchKeywordIndex(index, q, { negative });
test("Network selections append and preserve one pure operator in one Source and Preview", () => {
 let draft = { ...createAdvancedDiscoverDraft(), mediaMode: "series" };
 draft = setDiscoverSelection(draft, "withNetworks", { id: 213, name: "Netflix" });
 draft = setDiscoverSelection(draft, "withNetworks", { id: 2, name: "ABC" });
 for (const operator of ["|", ","]) {
  draft = setDiscoverOperator(draft, "withNetworks", operator);
  const expression = "213" + operator + "2", built = compileAdvancedDiscover(draft);
  assert.equal(built.ok, true); assert.equal(built.drafts.length, 1);
  assert.equal(built.drafts[0].editable.filters.withNetworks, expression);
  assert.equal(advancedDiscoverQuery(built.drafts[0]).queryParameters.with_networks, expression);
  assert.equal(setDiscoverSelection(draft, "withNetworks", { id: 213, name: "Netflix" }).filters.withNetworks, expression);
  const remaining = setDiscoverSelection(draft, "withNetworks", { id: 213, name: "Netflix" }, { remove: true });
  assert.equal(remaining.filters.withNetworks, "2"); assert.equal(remaining.operators.withNetworks, operator);
 }
});
test("Network identity compares reordered IDs but keeps AND distinct from OR", () => {
 const identity = (expression) => discoverSourceIdentity(buildDiscoverSourceDraft({ title: "Networks", mediaType: "TV", filters: { withNetworks: expression } }).draft.editable).key;
 assert.equal(identity("213|2"), identity("2|213"));
 assert.equal(identity("213,2"), identity("2,213"));
 assert.notEqual(identity("213|2"), identity("213,2"));
});
test("Malformed and unsupported Network expressions fail without changing imported Sources", () => {
 for (const value of ["213|2,49", "(213|2)", "213|", "02", "213,213", "213|2147483648", "213, 2"]) {
  assert.equal(validateAdvancedFilters({ withNetworks: value }, "TV").ok, false, value);
  assert.equal(buildDiscoverSourceDraft({ title: "Network", mediaType: "TV", filters: { withNetworks: value } }).ok, false, value);
  const c = controllerWithFolder([{ provider: "tmdb", tmdbSourceType: "DISCOVER", mediaType: "TV", title: "Preserve", filters: { withNetworks: value } }]);
  const before = c.stringifyProject().json, node = c.getState().project.collections[0].folders[0].sources[0];
  assert.equal(createSourceEditSession(c.getState().project, node.internalId, "advanced-discover").ok, false);
  assert.equal(c.stringifyProject().json, before);
 }
 assert.equal(compileAdvancedDiscover({ ...createAdvancedDiscoverDraft(), mediaMode: "series", filters: { withoutNetworks: "2" } }).ok, false);
 assert.equal(compileAdvancedDiscover({ ...createAdvancedDiscoverDraft(), mediaMode: "both", filters: { withNetworks: "213|2" } }).ok, true);
});
for (const expression of ["213|2", "213,2"]) test("Imported multi-Network editing preserves operators, aliases, nulls and Source identity: " + expression, () => {
 const raw = { id: "network-source", provider: "tmdb", tmdbSourceType: "DISCOVER", mediaType: "TV", title: "Custom network name", sortBy: "popularity.desc", coverEmoji: "N", privateExtra: { retain: true }, filters: { withNetworks: expression, with_networks: expression, voteCountGte: null } };
 const c = controllerWithFolder([raw]), node = c.getState().project.collections[0].folders[0].sources[0];
 const opened = createSourceEditSession(c.getState().project, node.internalId, "advanced-discover");
 assert.equal(opened.ok, true); assert.equal(opened.draft.filters.withNetworks, expression);
 assert.equal(opened.draft.previewBlocked, false);
 const before = c.stringifyProject().json;
 assert.equal(saveSourceEdit(c, opened.session, opened.draft).changed, false); assert.equal(c.stringifyProject().json, before);
 const next = setDiscoverOperator(opened.draft, "withNetworks", expression.includes("|") ? "," : "|"); next.touchedFilters = ["withNetworks"];
 assert.equal(saveSourceEdit(c, opened.session, next).ok, true);
 const saved = c.serializeProject().value[0].folders[0].sources[0];
 assert.equal(saved.filters.withNetworks, next.filters.withNetworks); assert.equal(saved.filters.with_networks, next.filters.withNetworks);
 assert.equal(saved.id, raw.id); assert.equal(saved.title, raw.title); assert.equal(saved.coverEmoji, raw.coverEmoji); assert.deepEqual(saved.privateExtra, raw.privateExtra); assert.equal(saved.filters.voteCountGte, null);
 const reopened = createSourceEditSession(c.getState().project, node.internalId, "advanced-discover");
 assert.equal(reopened.draft.filters.withNetworks, next.filters.withNetworks); assert.equal(c.getState().project.collections[0].folders[0].sources.length, 1);
});
function controllerWithFolder(sources = []) {
 let n = 0;
 const c = createBuilderController({ idFactory: () => "test-" + ++n });
 assert.equal(c.importValue([{ id: "collection", title: "Collection", folders: [{ id: "folder", title: "Folder", tileShape: "POSTER", coverEmoji: "X", sources }] }]).ok, true);
 return c;
}
function options(c, scope, draft = createAdvancedDiscoverDraft()) {
 const state = c.getState(), collection = state.project.collections[0], folder = collection.folders[0];
 return { projectRevision: state.revision, scope, collectionInternalId: collection.internalId, folderInternalId: folder.internalId, folderTitle: "New folder", collectionTitle: "New collection", draft };
}
test("all 18 native fields use the same effective filter values in generated Sources and Preview", () => {
 const draft = { ...createAdvancedDiscoverDraft(), mediaMode: "series", filters: { withGenres: "18|35", withoutGenres: "99", releaseDateGte: "2000-01-01", releaseDateLte: "2020-12-31", voteAverageGte: "0", voteAverageLte: "10", voteCountGte: "0", withOriginalLanguage: "ja", withOriginCountry: "JP", withKeywords: "818,9826", withoutKeywords: "9663", withCompanies: "1957|3268", withoutCompanies: "33", withNetworks: "213", year: "2011", watchRegion: "AU", withWatchProviders: "8|9", withoutWatchProviders: "15" } };
 const built = compileAdvancedDiscover(draft);
 assert.equal(built.ok, true, JSON.stringify(built.errors));
 assert.equal(Object.keys(built.drafts[0].editable.filters).length, 18);
 const query = advancedDiscoverQuery(built.drafts[0]);
 assert.equal(query.queryParameters["first_air_date.gte"], draft.filters.releaseDateGte);
 assert.equal(query.queryParameters.first_air_date_year, "2011");
 assert.equal(query.queryParameters.without_keywords, "9663");
 assert.equal(query.queryParameters.with_watch_monetization_types, "flatrate|free|ads|rent|buy");
 assert.equal(query.queryParameters["vote_count.gte"], "0");
 assert.deepEqual(Object.keys(advancedDiscoverQuery(compileAdvancedDiscover(createAdvancedDiscoverDraft()).drafts[0]).queryParameters).sort(), ["include_adult", "sort_by"]);
});
for (const filters of [{ withKeywords: "1|2,3" }, { withoutKeywords: "(1|2)" }, { withKeywords: "01" }, { withKeywords: "2147483648" }, { withKeywords: "1,1" }, { withKeywords: "1", withoutKeywords: "1" }, { withNetworks: "213" }, { releaseDateGte: "2020-02-30" }, { voteAverageGte: "8", voteAverageLte: "7" }, { voteCountGte: "1e3" }, { withoutWatchProviders: "8" }, { watchRegion: "AU" }]) test("reject unsafe native filters " + JSON.stringify(filters), () => assert.equal(validateAdvancedFilters(filters, "MOVIE").ok, false));
for (const separator of ["|", ","]) for (const [included, movie, tv] of [
 [[16,35], [16,35], [16,35]],
 [[16,35,10759], [16,35], [16,35,10759]],
 [[28,12,16,10759], [28,12,16], [16,10759]],
 [[10759], [], [10759]],
 [[28,12], [28,12], []],
]) test("Both derives verified included/excluded genres with " + separator + ": " + included, () => {
 const draft = { ...createAdvancedDiscoverDraft(), mediaMode: "both", filters: { withGenres: included.join(separator), withoutGenres: "27,10762,99", releaseDateGte: "2020-01-01", withoutKeywords: "818,9951" } }, before = structuredClone(draft);
 const built = compileAdvancedDiscover(draft);
 assert.equal(built.ok, true, JSON.stringify(built.errors));assert.equal(built.drafts.length, 2);
 for (const [media, ids, excluded] of [["MOVIE",movie,"27,99"],["TV",tv,"10762,99"]]) {
  const effective = deriveAdvancedDiscoverFilters(draft, media), source = built.drafts.find((d) => d.editable.mediaType === media);
  assert.deepEqual(source.editable.filters, effective.filters);
  assert.equal(effective.filters.withGenres, ids.length ? ids.join(separator) : undefined);
  assert.equal(effective.filters.withoutGenres, excluded);
  const query = advancedDiscoverQuery(source).queryParameters;
  assert.equal(query.with_genres,effective.filters.withGenres);assert.equal(query.without_genres,excluded);assert.equal(query.without_keywords,"818,9951");
  assert.equal(query[media === "MOVIE" ? "primary_release_date.gte" : "first_air_date.gte"],"2020-01-01");
  assert.equal(effective.information.some((entry)=>entry.kind==="unrestricted"),!ids.length);
  if (!ids.length) assert.match(effective.information.find((entry)=>entry.kind==="unrestricted").message,/exclusions still apply/);
 }
 assert.deepEqual(draft,before);
});
test("Both explains unrestricted media and exclusion applicability without deleting draft choices", () => {
 const draft={...createAdvancedDiscoverDraft(),mediaMode:"both",filters:{withGenres:"10759",withoutGenres:"10762"}};
 const movies=deriveAdvancedDiscoverFilters(draft,"MOVIE");
 assert.deepEqual(movies.filters,{});
 assert.deepEqual(movies.information.map((entry)=>entry.message),["Action & Adventure applies to Series only.","Excluding Kids applies to Series only.","Movies: no genre restriction."]);
 for(const mediaMode of ["movies","series","both"]){const next={...draft,mediaMode},before=structuredClone(next);assert.equal(compileAdvancedDiscover(next).ok,mediaMode!=="movies");assert.deepEqual(next,before);}
});
for(const filters of [{withGenres:"999999|10759"},{withoutGenres:"28,999999"},{withGenres:"0"},{withGenres:"16|35,10759"},{withoutGenres:"(28)"},{withGenres:"10759",withoutGenres:"10759"},{withGenres:"28",withoutGenres:"28"},{withNetworks:"0"},{withNetworks:"213|2,49"},{withoutNetworks:"213"},{custom:"keep"}]) test("Both does not discard invalid input: "+JSON.stringify(filters),()=>{
 const draft={...createAdvancedDiscoverDraft(),mediaMode:"both",filters},before=structuredClone(draft);
 assert.equal(compileAdvancedDiscover(draft).ok,false);assert.deepEqual(compileAdvancedDiscover(draft).drafts,[]);assert.deepEqual(draft,before);
});
for(const expression of ["213","213|2","213,2"]) test("Both applies Networks only to Series: "+expression,()=>{
 const draft={...createAdvancedDiscoverDraft(),mediaMode:"both",filters:{withNetworks:expression,withGenres:"16|10759",withoutCompanies:"33"}};
 const result=compileAdvancedDiscover(draft),[movies,tv]=result.drafts;
 assert.equal(result.ok,true);assert.equal(movies.editable.filters.withNetworks,undefined);assert.equal(tv.editable.filters.withNetworks,expression);
 assert.equal(advancedDiscoverQuery(movies).queryParameters.with_networks,undefined);assert.equal(advancedDiscoverQuery(tv).queryParameters.with_networks,expression);
 assert.match(deriveAdvancedDiscoverFilters(draft,"MOVIE").information.find((entry)=>entry.field==="withNetworks").message,/Series only/);
 assert.equal(compileAdvancedDiscover({...draft,mediaMode:"movies"}).ok,false);
 assert.equal(advancedDiscoverQuery({...movies,editable:{...movies.editable,filters:{...movies.editable.filters,withNetworks:expression}}}),null);
});
for(const scope of ["add-source","new-folder","new-collection"]) for(const folderArrangement of ["one-folder","split-media"]) for(const sortOptionIds of [["popular"],["popular","recent"]]) test("Both effective filters survive creation, export and reopening: "+[scope,folderArrangement,sortOptionIds],()=>{
 const original={id:"preserved",provider:"tmdb",tmdbSourceType:"DISCOVER",mediaType:"MOVIE",title:"Imported",filters:{withGenres:"28",community:{retain:true}},extra:"untouched"};
 const c=controllerWithFolder([original]),draft={...createAdvancedDiscoverDraft(),mediaMode:"both",name:"Custom source",sortOptionIds,filters:{withGenres:"16,35,10759",withoutGenres:"27,10762",withNetworks:"213|2"}};
 const config={...options(c,scope,draft),folderArrangement,folderSettings:{combined:{title:"Together"},movies:{title:"Cinema",artwork:{tileShape:"LANDSCAPE"}},series:{title:"Shows"}}};
 const compiled=compileAdvancedDiscover(draft),plan=createAdvancedDiscoverPlan(c.getState().project,config);
 assert.equal(plan.ok,true);assert.equal(plan.plan.drafts.length,sortOptionIds.length*2);
 if(scope!=="add-source")assert.equal(plan.plan.folders.length,folderArrangement==="one-folder"?1:2);
 assert.equal(applyAdvancedDiscoverPlan(c,plan.plan).ok,true);
 const output=c.serializeProject().value,sources=output.flatMap((collection)=>collection.folders.flatMap((folder)=>folder.sources));
 assert.deepEqual(sources.find((source)=>source.id==="preserved"),original);
 const created=sources.filter((source)=>source.id!=="preserved");assert.equal(created.length,sortOptionIds.length*2);
 for(const source of created){const expected=compiled.drafts.find((d)=>d.editable.mediaType===source.mediaType&&d.editable.sortBy===source.sortBy).editable;assert.deepEqual(source.filters,expected.filters);assert.equal(source.title,expected.title);}
 const reopened=createBuilderController();assert.equal(reopened.importValue(output).ok,true);assert.deepEqual(reopened.serializeProject().value,output);
 for(const node of reopened.getState().project.collections.flatMap((collection)=>collection.folders.flatMap((folder)=>folder.sources)).filter((node)=>node.editable.title!=="Imported")){
  const opened=createSourceEditSession(reopened.getState().project,node.internalId,"advanced-discover");assert.equal(opened.ok,true);assert.deepEqual(opened.draft.filters,node.editable.filters);assert.equal(saveSourceEdit(reopened,opened.session,opened.draft).changed,false);
 }
});
test("creation produces the ordered scalar media/sort product; Preview does not change selections", () => {
 const draft = { ...createAdvancedDiscoverDraft(), mediaMode: "both", sortOptionIds: ["popular", "recent", "top-rated", "most-votes"] };
 assert.equal(compileAdvancedDiscover(draft).drafts.length, 8);
 const one = { ...draft, sortOptionIds: ["recent"] }, before = structuredClone(one);
 assert.equal(compileAdvancedDiscover(one, { preview: true }).drafts.length, 8);
 assert.deepEqual(one, before);
});
for (const scope of ["add-source", "new-folder", "new-collection"]) test("atomic creation in " + scope + " and stale plan protection", () => {
 const c = controllerWithFolder();
 const built = createAdvancedDiscoverPlan(c.getState().project, options(c, scope, { ...createAdvancedDiscoverDraft(), mediaMode: "both" }));
 assert.equal(built.ok, true);
 const before = c.getState().revision;
 const result = applyAdvancedDiscoverPlan(c, built.plan);
 assert.equal(result.ok, true, JSON.stringify(result.errors));
 assert.equal(c.getState().revision, before + 1);
 assert.equal(applyAdvancedDiscoverPlan(c, built.plan).ok, false);
 assert.equal(c.getState().revision, before + 1);
});
test("exact duplicate identity is shared with Genre Sources; tampered plans cannot apply", () => {
 const c = controllerWithFolder([buildDiscoverSourceDraft({ title: "Different name", mediaType: "MOVIE", filters: { withGenres: "99" } }).draft.editable]);
 const draft = { ...createAdvancedDiscoverDraft(), filters: { withGenres: "99" } };
 const planned = createAdvancedDiscoverPlan(c.getState().project, options(c, "add-source", draft));
 assert.equal(planned.plan.drafts.length, 0);
 assert.equal(applyAdvancedDiscoverPlan(c, planned.plan).ok, false);
 const next = createAdvancedDiscoverPlan(c.getState().project, options(c, "new-folder", draft));
 next.plan.folders[0].editable.title = "Unreviewed change";
 assert.equal(applyAdvancedDiscoverPlan(c, next.plan).ok, false);
});
test("editing preserves raw IDs, custom name, presentation, nulls and unknown fields; only touched filters change", () => {
 const raw = { id: "physical-source", provider: "tmdb", tmdbSourceType: "DISCOVER", tmdbId: null, mediaType: "MOVIE", title: "My custom name", sortBy: "popularity.desc", customSource: { keep: true }, filters: { withKeywords: "15097", voteCountGte: null, customFilter: "retain" } };
 const c = controllerWithFolder([raw]);
 const node = c.getState().project.collections[0].folders[0].sources[0];
 const opened = createSourceEditSession(c.getState().project, node.internalId, "advanced-discover");
 assert.equal(opened.ok, true);
 assert.equal(opened.draft.previewBlocked, true);
 const original = c.stringifyProject().json;
 const before = c.getState().revision;
 assert.equal(saveSourceEdit(c, opened.session, opened.draft).changed, false);
 assert.equal(c.getState().revision, before);
 assert.equal(c.stringifyProject().json, original);
 const draft = { ...opened.draft, filters: { ...opened.draft.filters, withoutKeywords: "9951" }, touchedFilters: ["withoutKeywords"] };
 assert.equal(saveSourceEdit(c, opened.session, draft).ok, true);
 const serialized = c.serializeProject();
 assert.equal(serialized.ok, true);
 const saved = serialized.value[0].folders[0].sources[0];
 assert.equal(saved.id, "physical-source"); assert.equal(saved.title, raw.title);
 assert.equal(saved.filters.voteCountGte, null); assert.equal(saved.filters.customFilter, "retain");
 assert.equal(saved.filters.withoutKeywords, "9951"); assert.deepEqual(saved.customSource, { keep: true });
 assert.equal(serialized.value[0].folders[0].coverEmoji, "X");
});
test("explicit Advanced editor can edit a genre-shaped Source without replacing its specialized default", () => {
 const c = controllerWithFolder([buildDiscoverSourceDraft({ title: "Documentary", mediaType: "MOVIE", filters: { withGenres: "99" } }).draft.editable]);
 const node = c.getState().project.collections[0].folders[0].sources[0];
 assert.equal(createSourceEditSession(c.getState().project, node.internalId).session.adapterId, "genre");
 const opened = createSourceEditSession(c.getState().project, node.internalId, "advanced-discover");
 assert.equal(saveSourceEdit(c, opened.session, { ...opened.draft, title: "Custom", titleTouched: true }).ok, true);
});
test("distinct plural IDs and AI labels remain explicit choices; negative typos never match", () => {
 assert.deepEqual(new Set(search("sharks").candidates.map((r) => r.id)), new Set([15097, 275172]));
 assert.equal(search("sharks").status, "choice");
 assert.equal(search("shraks", true).candidates.length, 0);
 assert.equal(search("ai").candidates.length, 3);
 assert.equal(search("christmas horror").status, "choice");
});
for (const example of DISCOVER_EXAMPLES) test("reference keyword resolves to its reviewed exact ID/name: " + example.label, () => {
 const actual = index.byId.get(example.keywordId);
 assert.equal(actual?.name, example.name);
 const draft = setDiscoverSelection(createAdvancedDiscoverDraft(), "withKeywords", actual);
 assert.equal(compileAdvancedDiscover(draft).ok, true);
 assert.equal(advancedDiscoverQuery(compileAdvancedDiscover(draft).drafts[0]).queryParameters.with_keywords, String(example.keywordId));
});
for (const row of fixture.examples) test("matching safety example " + row.id + ": " + row.input, async () => {
 const draft = await interpretDiscoverDescription(createAdvancedDiscoverDraft(), row.input, search);
 if (row.expectedStatus !== "exact named interpretation") assert.ok(draft.unresolved.length > 0, "A previously unresolved/suggestion request must still require a choice.");
 if (row.expectedStatus === "exact named interpretation") assert.equal(draft.unresolved.length, 0);
 if (row.expectedStatus === "failed interpretation") assert.ok(draft.unresolved.length > 0);
 assert.equal(draft.topic, row.input);
});
test("LAN SHA-256 fallback matches the platform implementation", () => {
 for (const text of ["", "abc", "x".repeat(1000000)]) {
  const bytes = Buffer.from(text);
  assert.equal(sha256Bytes(bytes), crypto.createHash("sha256").update(bytes).digest("hex"));
 }
});

test("another topic search retains unresolved exclusions until explicit removal", async () => {
 const first = await interpretDiscoverDescription(createAdvancedDiscoverDraft(), "Christmas movies without animal harm", search);
 const unresolved = structuredClone(first.unresolved);
 assert.equal(unresolved.length, 1);
 const next = await interpretDiscoverDescription(first, "anime", search);
 assert.deepEqual(next.unresolved, unresolved);
 assert.equal(compileAdvancedDiscover(next).ok, false);
 assert.deepEqual((await interpretDiscoverDescription(next, "", search)).unresolved, unresolved);
});
test("a later description cannot silently change the applied All/Any rule", async () => {
 const draft = { ...createAdvancedDiscoverDraft(), filters: { withKeywords: "15097|9951" } };
 const result = await interpretDiscoverDescription(draft, "christmas", search);
 assert.deepEqual(result.filters, draft.filters);
 assert.equal(result.unresolved.length, 1);
 assert.match(result.unresolved[0].reason, /All\/Any/);
});
test("saved names resolve only within their field and retain prior choices", async () => {
 const { discoverSelectionLabel, mergeDiscoverSelectionLabels, resolveDiscoverEntityLabels } = await import("../builder/src/source-add/discover-selection-labels.js");
 const draft = { ...createAdvancedDiscoverDraft(), filters: { withGenres: "18", withKeywords: "18", withCompanies: "33", withoutCompanies: "20" }, labels: { "withCompanies:33": "My retained label" } };
 assert.equal(discoverSelectionLabel(draft, "withGenres", 18), "Drama");
 assert.match(discoverSelectionLabel(draft, "withKeywords", 18), /Unavailable/);
 let calls = 0;
 const loaded = await resolveDiscoverEntityLabels(draft, { studioProvider: { loadCatalogue: async () => { calls++; return { ok: true, data: { studios: [{ id: 33, name: "Universal" }, { id: 20, name: "20th Century" }] } }; } } });
 const merged = mergeDiscoverSelectionLabels(draft, loaded.labels);
 assert.equal(calls, 1);
 assert.equal(merged.labels["withCompanies:33"], "My retained label");
 assert.equal(merged.labels["withoutCompanies:20"], "20th Century");
 assert.deepEqual(merged.filters, draft.filters);
 const removed = { ...draft, filters: {} };
 assert.deepEqual(mergeDiscoverSelectionLabels(removed, loaded.labels).labels, draft.labels);
});

import { discoverSourceIdentity } from "../builder/src/nuvio/discover.js";
import { DISCOVER_IMPORTED_MIRRORS } from "../builder/src/nuvio/discover-imported-filters.js";
import { changeDiscoverContext, discoverSelectionOperator, setDiscoverOperator, suggestDiscoverName } from "../builder/src/source-add/advanced-discover.js";
import { autocompleteKeywordIndex } from "../builder/src/source-add/keyword-matching.js";
const mirroredSource = () => ({ id: "saved-source", provider: "tmdb", tmdbSourceType: "DISCOVER", tmdbId: null, mediaType: "MOVIE", title: "Saved source", sortBy: "primary_release_date.desc",
 filters: { withWatchProviders: "8|1796", with_watch_providers: "8|1796", watchRegion: "US", watch_region: "US", withoutGenres: "99", without_genres: "99", withoutKeywords: "9716", without_keywords: "9716", sortBy: "primary_release_date.desc" } });
function openAdvanced(c) { const node = c.getState().project.collections[0].folders[0].sources[0]; return createSourceEditSession(c.getState().project, node.internalId, "advanced-discover"); }
test("equivalent imported mirrors populate one control and allow exact Preview; no-op is unchanged", () => {
 const c = controllerWithFolder([mirroredSource()]), before = c.stringifyProject().json, opened = openAdvanced(c);
 assert.equal(opened.ok, true); assert.equal(opened.draft.previewBlocked, false);
 assert.deepEqual(opened.draft.filters, { withWatchProviders: "8|1796", watchRegion: "US", withoutGenres: "99", withoutKeywords: "9716" });
 const query = advancedDiscoverQuery(compileAdvancedDiscover(opened.draft).drafts[0]).queryParameters;
 assert.equal(query.with_watch_providers, "8|1796"); assert.equal(query.sort_by, "primary_release_date.desc"); assert.equal(query.without_keywords, "9716");
 assert.equal(saveSourceEdit(c, opened.session, opened.draft).changed, false); assert.equal(c.stringifyProject().json, before);
});
test("edited/removed native filters synchronize every existing mirror and mirrored sort", () => {
 const c = controllerWithFolder([mirroredSource()]), opened = openAdvanced(c);
 const draft = { ...opened.draft, filters: { ...opened.draft.filters, withWatchProviders: "9", withoutGenres: "", withoutKeywords: "" }, touchedFilters: ["withWatchProviders", "withoutGenres", "withoutKeywords"], sortTouched: true, sortOptionIds: ["most-votes"] };
 assert.equal(saveSourceEdit(c, opened.session, draft).ok, true);
 const out = c.serializeProject().value[0].folders[0].sources[0];
 assert.equal(out.id, "saved-source"); assert.equal(out.filters.with_watch_providers, "9");
 assert.equal(Object.hasOwn(out.filters, "without_genres"), false); assert.equal(Object.hasOwn(out.filters, "without_keywords"), false);
 assert.equal(out.filters.sortBy, "vote_count.desc"); assert.equal(out.sortBy, "vote_count.desc");
 const round = controllerWithFolder([out]).serializeProject().value[0].folders[0].sources[0]; assert.deepEqual(round, out);
});
test("all supplied alias forms are recognised as equal mirrors, not independent active filters", () => {
 const fields = { withGenres: "18|35", withoutGenres: "99", withKeywords: "818|9826", withoutKeywords: "9716", withCompanies: "33|174", withoutCompanies: "9", withNetworks: "213", withWatchProviders: "8", withoutWatchProviders: "9", watchRegion: "US", withOriginalLanguage: "en", withOriginCountry: "US", voteCountGte: 100, voteAverageGte: 1, voteAverageLte: 9 };
 const raw = { ...mirroredSource(), mediaType: "TV", sortBy: "popularity.desc", filters: { ...fields } };
 for (const [alias, field] of Object.entries(DISCOVER_IMPORTED_MIRRORS)) raw.filters[alias] = fields[field];
 const c = controllerWithFolder([raw]), opened = openAdvanced(c); assert.equal(opened.ok, true); assert.equal(opened.draft.previewBlocked, false);
 assert.deepEqual(opened.draft.filters, fields);
 for (const [alias, field] of Object.entries(DISCOVER_IMPORTED_MIRRORS)) {
  const single = { ...mirroredSource(), filters: { [alias]: fields[field] }, mediaType: "TV", sortBy: "popularity.desc" };
  const o = openAdvanced(controllerWithFolder([single])); assert.equal(o.ok, true, alias); assert.equal(o.draft.previewBlocked, true, alias); assert.equal(Object.hasOwn(o.draft.filters, field), false, alias);
 }
});
test("conflicts and genuine extras block exact Preview and survive unrelated edits", () => {
 for (const extra of [{ without_keywords: "818" }, { futureSetting: "keep" }]) {
  const raw = mirroredSource(); raw.filters = { ...raw.filters, ...extra };
  const c = controllerWithFolder([raw]), opened = openAdvanced(c); assert.equal(opened.draft.previewBlocked, true);
  assert.equal(saveSourceEdit(c, opened.session, { ...opened.draft, title: "Renamed", titleTouched: true }).ok, true);
  assert.deepEqual(c.serializeProject().value[0].folders[0].sources[0].filters, raw.filters);
 }
});
test("exact duplicates use equal mirrors and detect a duplicate after an edit", () => {
 const mirrored = mirroredSource(), canonical = { ...mirrored, title: "Other title", filters: { withWatchProviders: "9", watchRegion: "US", withoutGenres: "99", withoutKeywords: "9716" } };
 const same = { ...canonical, filters: { ...canonical.filters, withWatchProviders: "8|1796" } };
 assert.equal(discoverSourceIdentity(mirrored).key, discoverSourceIdentity(same).key);
 const c = controllerWithFolder([mirrored, canonical]), opened = openAdvanced(c);
 const result = saveSourceEdit(c, opened.session, { ...opened.draft, filters: { ...opened.draft.filters, withWatchProviders: "9" }, touchedFilters: ["withWatchProviders"] });
 assert.equal(result.ok, false); assert.match(JSON.stringify(result), /duplicate/i);
});
test("Any defaults and deliberate/imported All survive down to one or zero selections", () => {
 let draft = createAdvancedDiscoverDraft(); const a = { id: 818, name: "novel" }, b = { id: 9826, name: "murder" };
 draft = setDiscoverSelection(setDiscoverSelection(draft, "withKeywords", a), "withKeywords", b); assert.equal(draft.filters.withKeywords, "818|9826");
 draft = setDiscoverOperator(draft, "withKeywords", ","); draft = setDiscoverSelection(draft, "withKeywords", b, { remove: true });
 assert.equal(discoverSelectionOperator(draft, "withKeywords"), ","); draft = setDiscoverSelection(draft, "withKeywords", b); assert.equal(draft.filters.withKeywords, "818,9826");
 draft = setDiscoverSelection(setDiscoverSelection(draft, "withKeywords", a, { remove: true }), "withKeywords", b, { remove: true });
 assert.equal(discoverSelectionOperator(draft, "withKeywords"), ",");
 const raw = { ...mirroredSource(), filters: { withKeywords: "818,9826" } }; assert.equal(discoverSelectionOperator(openAdvanced(controllerWithFolder([raw])).draft, "withKeywords"), ",");
 assert.strictEqual(setDiscoverSelection(draft = { ...draft, filters: { withoutKeywords: "818" } }, "withKeywords", a), draft);
});
test("autocomplete finds partial names and preserves distinct IDs; exclusions are not fuzzy", () => {
 const rows = autocompleteKeywordIndex(index, "shar"); assert.ok(rows.some((r) => r.id === 15097)); assert.ok(rows.some((r) => r.id === 275172));
 assert.equal(autocompleteKeywordIndex(index, "shraks", { negative: true }).length, 0);
 assert.ok(autocompleteKeywordIndex(index, "shraks").length > 0);
});
test("changing media/region retains providers until reviewed; incompatible genres remain errors", () => {
 const draft = { ...createAdvancedDiscoverDraft(), filters: { withGenres: "27", withWatchProviders: "8", withoutWatchProviders: "9", watchRegion: "US" } };
 const next = changeDiscoverContext(draft, { mediaMode: "series", filters: { ...draft.filters, watchRegion: "AU" } });
 assert.equal(next.providerContextReview, true); assert.equal(next.filters.withoutWatchProviders, "9"); assert.equal(next.filters.withGenres, "27"); assert.equal(compileAdvancedDiscover(next).ok, false);
});

import { discoverEditorPreviewBlocked } from "../builder/src/source-edit/advanced-discover-editor.js";
test("a mirror corrected by editing never reappears after later reverting the native value", () => {
 const raw = mirroredSource(); raw.filters.without_keywords = "818";
 const c = controllerWithFolder([raw]); let opened = openAdvanced(c);
 let draft = { ...opened.draft, filters: { ...opened.draft.filters, withoutKeywords: "9663" }, touchedFilters: ["withoutKeywords"] };
 assert.equal(discoverEditorPreviewBlocked(draft), false);
 assert.equal(saveSourceEdit(c, opened.session, draft).ok, true);
 opened = openAdvanced(c); draft = { ...opened.draft, filters: { ...opened.draft.filters, withoutKeywords: "9716" }, touchedFilters: ["withoutKeywords"] };
 assert.equal(saveSourceEdit(c, opened.session, draft).ok, true);
 assert.equal(c.serializeProject().value[0].folders[0].sources[0].filters.without_keywords, "9716");
 opened = openAdvanced(c); assert.equal(opened.draft.previewBlocked, false);
 assert.equal(saveSourceEdit(c, opened.session, opened.draft).changed, false);
});
test("mirrored sort stays corrected through repeated saves back to the original native sort", () => {
 const raw = mirroredSource(); raw.filters.sortBy = "vote_count.desc";
 const c = controllerWithFolder([raw]); let opened = openAdvanced(c);
 assert.equal(saveSourceEdit(c, opened.session, { ...opened.draft, sortTouched: true, sortOptionIds: ["popular"] }).ok, true);
 opened = openAdvanced(c);
 assert.equal(saveSourceEdit(c, opened.session, { ...opened.draft, sortTouched: true, sortOptionIds: ["recent"] }).ok, true);
 assert.equal(c.serializeProject().value[0].folders[0].sources[0].filters.sortBy, "primary_release_date.desc");
});

import { advancedDiscoverFolders } from "../builder/src/source-add/advanced-discover-plan.js";
import { advancedDiscoverArtworkSuggestions, changeAdvancedDiscoverArtworkShape } from "../builder/src/source-add/advanced-discover-artwork.js";
const bothDraft = () => ({ ...createAdvancedDiscoverDraft(), name: "Sharks", mediaMode: "both", sortOptionIds: ["popular", "recent"], filters: { withKeywords: "15097|275172" } });
for (const scope of ["new-collection", "new-folder"]) for (const folderArrangement of ["one-folder", "split-media"]) test(scope + " " + folderArrangement + " applies exactly the reviewed four Sources atomically", () => {
 const c = controllerWithFolder([buildDiscoverSourceDraft({ title: "Preserved", mediaType: "MOVIE", filters: { withGenres: "99" } }).draft.editable]);
 const before = c.serializeProject().value, revision = c.getState().revision;
 const config = { ...options(c, scope, bothDraft()), folderArrangement, folderSettings: { combined: { title: "All sharks" }, movies: { title: "Movie sharks", artwork: { tileShape: "LANDSCAPE", coverImageUrl: "https://example.test/custom.jpg", heroBackdropUrl: "https://example.test/bg.jpg", titleLogoUrl: "https://example.test/logo.png", focusGifUrl: "https://example.test/focus.gif", focusGifEnabled: false } }, series: { title: "Series sharks" } } };
 const made = createAdvancedDiscoverPlan(c.getState().project, config); assert.equal(made.ok, true);
 assert.equal(c.getState().revision, revision); assert.deepEqual(c.serializeProject().value, before);
 assert.equal(made.plan.folders.length, folderArrangement === "one-folder" ? 1 : 2);
 assert.equal(made.plan.folders.flatMap((f) => f.drafts).length, 4);
 if (folderArrangement === "split-media") assert.deepEqual(made.plan.folders.map((f) => f.drafts.map((d) => d.editable.mediaType)), [["MOVIE", "MOVIE"], ["TV", "TV"]]);
 assert.equal(applyAdvancedDiscoverPlan(c, made.plan).ok, true); assert.equal(c.getState().revision, revision + 1);
 const after = c.serializeProject().value;
 if (scope === "new-collection") assert.deepEqual(after[0], before[0]);
 else { assert.deepEqual(after[0].folders[0], before[0].folders[0]); const { folders, ...rest } = after[0], { folders: old, ...original } = before[0]; assert.deepEqual(rest, original); }
 const actual = scope === "new-collection" ? after.at(-1).folders : after[0].folders.slice(1);
 assert.deepEqual(actual.map((f) => f.title), made.plan.folders.map((f) => f.title));
 for (const [i, folder] of actual.entries()) {
  assert.deepEqual(folder.sources.map(({ id, ...source }) => source), made.plan.folders[i].drafts.map((d) => d.editable));
  for (const [field, value] of Object.entries(made.plan.folders[i].editable)) assert.deepEqual(folder[field], value);
 }
});
test("arrangement and media changes retain dormant per-folder drafts without empty or repeated groups", () => {
 const draft = bothDraft(), settings = { combined: { title: "Together", artwork: { coverImageUrl: "custom-one" } }, movies: { title: "Cinema", artwork: { coverImageUrl: "custom-movie" } }, series: { title: "Shows", artwork: { coverImageUrl: "custom-series" } } };
 const config = { draft, folderArrangement: "split-media", folderSettings: settings }, before = structuredClone(config);
 for (const mediaMode of ["movies", "series", "both"]) {
  const next = { ...draft, mediaMode }, groups = advancedDiscoverFolders({ ...config, draft: next }, compileAdvancedDiscover(next).drafts);
  assert.equal(groups.length, mediaMode === "both" ? 2 : 1); assert.ok(groups.every((g) => g.drafts.length === 2));
  assert.equal(new Set(groups.map((g) => g.key)).size, groups.length);
  for (const g of groups) assert.equal(g.artwork.coverImageUrl, settings[g.key].artwork.coverImageUrl);
 }
 const single = advancedDiscoverFolders({ ...config, folderArrangement: "one-folder" }, compileAdvancedDiscover(draft).drafts);
 assert.equal(single[0].title, "Together"); assert.equal(single[0].drafts.length, 4); assert.deepEqual(config, before);
});
test("each blank artwork folder stays unset and custom artwork survives shape and filter changes", () => {
 const c = controllerWithFolder(), config = { ...options(c, "new-folder", bothDraft()), folderArrangement: "split-media" };
 const made = createAdvancedDiscoverPlan(c.getState().project, config); assert.equal(made.ok, true);
 assert.ok(made.plan.folders.every((f) => !Object.hasOwn(f.editable, "coverImageUrl")));
 const art = { coverImageUrl: "https://example.test/personal.jpg", focusGifUrl: "https://example.test/focus.gif", focusGifEnabled: true, tileShape: "POSTER" };
 const suggestions = advancedDiscoverArtworkSuggestions({ ...createAdvancedDiscoverDraft(), filters: { withGenres: "27" } });
 const next = changeAdvancedDiscoverArtworkShape(art, "LANDSCAPE", suggestions);
 assert.deepEqual(next, { ...art, tileShape: "LANDSCAPE" });
 const curated = { ...art, coverImageUrl: suggestions.curated.coverImageUrl.POSTER };
 assert.equal(changeAdvancedDiscoverArtworkShape(curated, "LANDSCAPE", suggestions).coverImageUrl, suggestions.curated.coverImageUrl.LANDSCAPE);
});
test("invalid second folder or tampered second bundle creates nothing", () => {
 const c = controllerWithFolder(), before = c.stringifyProject().json, revision = c.getState().revision;
 const config = { ...options(c, "new-folder", bothDraft()), folderArrangement: "split-media", folderSettings: { series: { title: "" } } };
 assert.equal(createAdvancedDiscoverPlan(c.getState().project, config).ok, false);
 config.folderSettings.series.title = "Shows";
 const made = createAdvancedDiscoverPlan(c.getState().project, config); made.plan.folders[1].drafts[0].editable.filters.withKeywords = "818";
 assert.equal(applyAdvancedDiscoverPlan(c, made.plan).ok, false);
 assert.equal(c.getState().revision, revision); assert.equal(c.stringifyProject().json, before);
});
test("a late ID failure rolls back all split folders and Sources", () => {
 let n = 0, failNow = false, failedCalls = 0;
 const c = createBuilderController({ idFactory: () => { if (failNow && ++failedCalls === 4) throw Error("late factory failure"); return "late-" + ++n; } });
 c.importValue([{ id: "collection", title: "Collection", folders: [{ id: "folder", title: "Folder", sources: [] }] }]);
 const made = createAdvancedDiscoverPlan(c.getState().project, { ...options(c, "new-folder", bothDraft()), folderArrangement: "split-media" });
 const before = c.stringifyProject().json, revision = c.getState().revision; failNow = true;
 assert.equal(applyAdvancedDiscoverPlan(c, made.plan).ok, false); assert.equal(c.stringifyProject().json, before); assert.equal(c.getState().revision, revision);
});
test("Add Source ignores container settings and keeps exact duplicate consent tied to its identity", () => {
 const raw = compileAdvancedDiscover(bothDraft()).drafts.map((d) => d.editable), c = controllerWithFolder(raw);
 const config = { ...options(c, "add-source", bothDraft()), folderArrangement: "split-media", folderSettings: { movies: { artwork: { coverImageUrl: "must-not-apply" } } } };
 const made = createAdvancedDiscoverPlan(c.getState().project, config); assert.deepEqual(made.plan.folders, []); assert.equal(made.plan.drafts.length, 0);
 const { folderInternalId } = config;
 const consent = discoverDuplicateOverrideIdentity(folderInternalId, compileAdvancedDiscover(config.draft).drafts);
 const included = createAdvancedDiscoverPlan(c.getState().project, { ...config, duplicateOverrideIdentity: consent });
 assert.equal(included.plan.drafts.length, 4);
 const before = c.serializeProject().value[0].folders[0];
 assert.equal(applyAdvancedDiscoverPlan(c, included.plan).ok, true);
 const after = c.serializeProject().value[0].folders[0]; const { sources, ...appearance } = after, { sources: old, ...oldAppearance } = before;
 assert.deepEqual(appearance, oldAppearance); assert.equal(sources.length, 8);
});

for (const mediaType of ["MOVIE", "TV"]) for (const field of ["releaseDateGte", "releaseDateLte", "year"]) test(mediaType + " clears " + field + " through compile, save and export without reviving imported date copies", () => {
 const prefix = mediaType === "TV" ? "first_air_date" : "primary_release_date";
 const filters = { withKeywords: "15097", releaseDateGte: "1990-01-01", releaseDateLte: "1999-12-31", year: 1995,
  [prefix + ".gte"]: "1990-01-01", [prefix + ".lte"]: "1999-12-31", ...(mediaType === "TV" ? { first_air_date_year: "1995" } : {}) };
 const raw = { ...mirroredSource(), mediaType, sortBy: "popularity.desc", filters, ownerField: { keep: ["untouched"] } };
 const c = controllerWithFolder([raw]), opened = openAdvanced(c);
 assert.equal(opened.draft.previewBlocked, false);
 assert.equal(saveSourceEdit(c, opened.session, opened.draft).changed, false);
 const draft = { ...opened.draft, filters: { ...opened.draft.filters, [field]: "" }, touchedFilters: [field] };
 const compiled = compileAdvancedDiscover(draft); assert.equal(compiled.ok, true);
 const query = advancedDiscoverQuery(compiled.drafts[0]).queryParameters;
 const queryField = field === "year" ? mediaType === "TV" ? "first_air_date_year" : "year" : prefix + (field === "releaseDateGte" ? ".gte" : ".lte");
 assert.equal(Object.hasOwn(query, queryField), false);
 assert.equal(saveSourceEdit(c, opened.session, draft).ok, true);
 const out = c.serializeProject().value[0].folders[0].sources[0];
 assert.equal(Object.hasOwn(out.filters, field), false);
 assert.equal(Object.hasOwn(out.filters, queryField), false);
 for (const [key, value] of Object.entries(raw.filters)) if (key !== field && key !== queryField) assert.deepEqual(out.filters[key], value);
 assert.deepEqual(out.ownerField, raw.ownerField); assert.equal(out.id, raw.id);
 const reopened = openAdvanced(controllerWithFolder([out])); assert.equal(reopened.draft.filters[field], undefined);
 assert.equal(reopened.draft.previewBlocked, false);
});
test("clearing either date bound repairs range validation; clearing year repairs exact-year conflict", () => {
 for (const field of ["releaseDateGte", "releaseDateLte"]) {
  const draft = { ...createAdvancedDiscoverDraft(), filters: { releaseDateGte: "2021-01-01", releaseDateLte: "2020-12-31" } };
  assert.equal(compileAdvancedDiscover(draft).ok, false);
  const cleared = { ...draft, filters: { ...draft.filters, [field]: "" } };
  assert.equal(compileAdvancedDiscover(cleared).ok, true);
  assert.equal(Object.hasOwn(compileAdvancedDiscover(cleared).drafts[0].editable.filters, field), false);
 }
 const draft = { ...createAdvancedDiscoverDraft(), filters: { releaseDateGte: "2020-01-01", year: "1990" } };
 assert.equal(compileAdvancedDiscover(draft).ok, false);
 assert.equal(compileAdvancedDiscover({ ...draft, filters: { ...draft.filters, year: "" } }).ok, true);
});
test("date edits retain unrelated and opposite-media imported settings", () => {
 const raw = { ...mirroredSource(), filters: { releaseDateGte: "2020-01-01", "primary_release_date.gte": "2010-01-01", "first_air_date.gte": "2005-01-01", futureSetting: { preserve: true } } };
 const c = controllerWithFolder([raw]), opened = openAdvanced(c);
 assert.equal(opened.draft.previewBlocked, true);
 assert.equal(saveSourceEdit(c, opened.session, { ...opened.draft, filters: {}, touchedFilters: ["releaseDateGte"] }).ok, true);
 const filters = c.serializeProject().value[0].folders[0].sources[0].filters;
 assert.deepEqual(filters, { "first_air_date.gte": "2005-01-01", futureSetting: { preserve: true } });
});
