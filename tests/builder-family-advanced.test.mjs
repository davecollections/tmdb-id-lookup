import { genreAdvancedMediaMode } from "../builder/src/source-add/genre-advanced.js";
import assert from "node:assert/strict";
import test from "node:test";
import { buildGenreSourceDrafts } from "../builder/src/source-add/genre-source.js";
import { buildCanonicalDecadePeriodDrafts, buildDecadesSourceDrafts } from "../builder/src/source-add/decades-source.js";
import { buildStreamingSourceDrafts, validateStreamingSourceDrafts } from "../builder/src/source-add/streaming-source.js";
import { createStreamingHierarchyPlan, applyStreamingHierarchyPlan } from "../builder/src/source-add/streaming-plan.js";
import { validateAdvancedFilters, exactDiscoverPreviewQuery, setDiscoverSelection, touchDiscoverFilters } from "../builder/src/source-add/advanced-discover.js";
import { createSourceEditSession, saveSourceEdit } from "../builder/src/source-edit/source-edit-actions.js";
import { prepareSourceEditPreview } from "../builder/src/source-edit/source-edit-preview.js";
import { discoverSelectionLabel, mergeDiscoverSelectionLabels, resolveDiscoverEntityLabels } from "../builder/src/source-add/discover-selection-labels.js";
import { createBuilderController } from "../builder/src/application/index.js";
import { sourceEditorFor } from "../builder/src/source-edit/source-editors.js";
import { updateGenreSourceAdvanced, updateDecadeSourceAdvanced, updateStreamingSourceAdvanced } from "../builder/src/source-edit/source-edit-actions.js";
import { createDecadesCreationState, toggleDecadePreset, setDecadesGenresForContext, setDecadesOrdinaryExclusionsForContext, setDecadesGenreExclusionsForContext, setDecadesExclusionInheritance, decadesOrdinaryExclusionsForContext, decadesGenreExclusionsForContext, buildDecadesCreationPlan } from "../builder/src/ui/decades-creation-state.js";
import { buildDecadesPreviewGroups } from "../builder/src/source-add/decades-preview.js";
import { discoverSourceIdentity } from "../builder/src/nuvio/discover.js";
import { validateNativeAdvancedFilters } from "../builder/src/source-add/native-shared-advanced.js";
import { studioPreviewQuery } from "../builder/src/source-add/studio-advanced.js";
import { networkPreviewQuery } from "../builder/src/source-add/network-advanced.js";

const catalogueFilters = { withKeywords: "15097|9715", withoutKeywords: "210024", withCompanies: "3|174", withoutCompanies: "2", withNetworks: "213", watchRegion: "AU", withWatchProviders: "8", withoutWatchProviders: "9" };
const scalar = { minimumVotes: "0", minimumRating: "0", maximumRating: "8.25", originalLanguage: "en", originCountry: "AU" };
const provider = { id: 8, name: "Service eight", moviePriorities: { AU: 1, US: 1 }, tvPriorities: { AU: 1, US: 1 } };
const node = (filters, mediaType = "MOVIE") => ({ category: "native-tmdb", nodeType: "source", editable: { provider: "tmdb", tmdbSourceType: "DISCOVER", tmdbId: null, title: "Recipe", sortBy: "popularity.desc", mediaType, filters } });

test("imported exclusions retain their separator and order through membership edits", () => {
 for (const field of ["withoutKeywords", "withoutWatchProviders"]) for (const separator of ["|", ","]) {
  const original = { filters: { [field]: [3, 1, 2].join(separator) }, labels: {} }, before = structuredClone(original);
  let draft = setDiscoverSelection(original, field, { id: 1, name: "one" }, { remove: true });
  assert.equal(draft.filters[field], [3, 2].join(separator));
  draft = setDiscoverSelection(draft, field, { id: 3, name: "three" }, { remove: true });
  assert.equal(draft.filters[field], "2");
  draft = setDiscoverSelection(draft, field, { id: 4, name: "four" });
  assert.equal(draft.filters[field], [2, 4].join(separator), "one-member intermediate retains the imported operator");
  assert.deepEqual(original, before);
  assert.equal(setDiscoverSelection(original, field, { id: 4, name: "four" }).filters[field], [3, 1, 2, 4].join(separator));
 }
 const empty = { filters: {}, labels: {} };
 assert.equal(setDiscoverSelection(setDiscoverSelection(empty, "withoutKeywords", { id: 1 }), "withoutKeywords", { id: 2 }).filters.withoutKeywords, "1,2");
 for (const bad of ["1|2,3", "01|2", "0|2", "1|1", "1|2147483648", "1|", [1, 2]]) {
  const draft = { filters: { withoutKeywords: bad }, labels: {} };
  assert.strictEqual(setDiscoverSelection(draft, "withoutKeywords", { id: 4 }), draft, "unsafe imports cannot be normalized by selection");
 }
});

test("native Studio/Network keyword editing and exact queries share the supported pipe contract", () => {
 for (const [mediaType, query] of [["MOVIE", studioPreviewQuery], ["TV", studioPreviewQuery], ["TV", networkPreviewQuery]]) {
  const filters = { withoutKeywords: "9715|818", without_keywords: "9715|818" };
  assert.equal(validateNativeAdvancedFilters({ withoutKeywords: filters.withoutKeywords }, mediaType).ok, true);
  assert.equal(query(3, { mediaType, sortBy: "popularity.desc", filters }).queryParameters.without_keywords, "9715|818");
  for (const unsafe of [{ ...filters, without_keywords: "818|9715" }, { ...filters, future: true }, { withoutKeywords: "9715|818,2" }, { withoutGenres: "16|99" }]) assert.equal(query(3, { mediaType, sortBy: "popularity.desc", filters: unsafe }), null);
 }
});

test("pipe excluded providers use the same touched-only mirror and identity rules", () => {
 const source = node({ withGenres: "28", withoutWatchProviders: "9|337", without_watch_providers: "9|337", watchRegion: "US", watch_region: "US" });
 source.rawImported = structuredClone(source.editable);
 const editor = sourceEditorFor(source), initial = editor.readInitialState(source), before = structuredClone(source);
 const controls = { filters: initial.advanced.filters, labels: {} };
 const next = setDiscoverSelection(setDiscoverSelection(controls, "withoutWatchProviders", { id: 337 }, { remove: true }), "withoutWatchProviders", { id: 2 });
 const draft = updateGenreSourceAdvanced(initial, { ...initial.advanced, filters: next.filters, ui: { operators: next.operators } });
 assert.equal(editor.validateDraft({ source, draft }).ok, true);
 assert.deepEqual(draft.touchedFilters, ["withoutWatchProviders"]);
 const patch = editor.buildPatch({ source, draft });
 assert.deepEqual(patch.filters, { ...source.editable.filters, withoutWatchProviders: "9|2", without_watch_providers: "9|2" });
 const candidate = { ...source, editable: { ...source.editable, ...patch } };
 assert.equal(exactDiscoverPreviewQuery(candidate).queryParameters.without_watch_providers, "9|2");
 assert.notEqual(discoverSourceIdentity(candidate.editable).key, discoverSourceIdentity(source.editable).key);
 assert.notEqual(discoverSourceIdentity(candidate.editable).key, discoverSourceIdentity({ ...candidate.editable, filters: { ...candidate.editable.filters, withoutWatchProviders: "2|9", without_watch_providers: "2|9" } }).key, "exclusion order remains identity-significant");
 assert.deepEqual(source, before);
});

test("shared entity labels preserve names, filters, identities and missing-ID fallbacks", async () => {
 const draft = { filters: { withCompanies: "3", withoutCompanies: "2", withNetworks: "213", withWatchProviders: "8|1796", withoutWatchProviders: "9|999" }, labels: { "withCompanies:3": "Retained studio" }, mediaMode: "series", touchedFilters: [], advancedTouched: false };
 const before = structuredClone(draft), calls = [];
 const provider = (key, rows) => ({ loadCatalogue: async () => { calls.push(key); return { ok: true, data: { [key]: rows } }; } });
 const providers = { studioProvider: provider("studios", [{ id: 3, name: "Studio three" }, { id: 2, name: "Studio two" }]), networkProvider: provider("networks", [{ id: 213, name: "Network" }]), streamingProvider: provider("providers", [{ id: 8, name: "Provider eight" }, { id: 1796, name: "Provider other" }, { id: 9, name: "Provider nine" }]) };
 const loaded = await resolveDiscoverEntityLabels(draft, providers), display = mergeDiscoverSelectionLabels(draft, loaded.labels);
 assert.deepEqual(calls.sort(), ["networks", "providers", "studios"]);
 for (const [field, id, name] of [["withCompanies", 3, "Retained studio"], ["withoutCompanies", 2, "Studio two"], ["withNetworks", 213, "Network"], ["withWatchProviders", 8, "Provider eight"], ["withWatchProviders", 1796, "Provider other"], ["withoutWatchProviders", 9, "Provider nine"]]) assert.equal(discoverSelectionLabel(display, field, id), name);
 assert.equal(discoverSelectionLabel(display, "withoutWatchProviders", 999), "Unavailable saved selection 999");
 assert.deepEqual({ ...display, labels: draft.labels }, before);
 assert.deepEqual(draft, before);
 const failed = await resolveDiscoverEntityLabels(draft, { ...providers, streamingProvider: { loadCatalogue: async () => { throw new Error("offline"); } } });
 assert.equal(failed.warnings.length, 1);
 assert.deepEqual(mergeDiscoverSelectionLabels(draft, failed.labels).filters, before.filters);
 const removed = { ...draft, filters: {} };
 assert.deepEqual(mergeDiscoverSelectionLabels(removed, loaded.labels), removed, "late lookup does not restore removed selections");
});

test("supported pipe exclusions reopen, preview unsaved values, and patch only equivalent mirrors", () => {
 for (const [anchor, expected, update] of [[{ withGenres: "28" }, "genre", updateGenreSourceAdvanced], [{ releaseDateGte: "1980-01-01", releaseDateLte: "1989-12-31" }, "decade", updateDecadeSourceAdvanced], [{ withWatchProviders: "8", watchRegion: "US" }, "streaming", updateStreamingSourceAdvanced], [{ withGenres: "28", withWatchProviders: "8|1796", with_watch_providers: "8|1796", watchRegion: "US", watch_region: "US" }, "genre", updateGenreSourceAdvanced], [{ withWatchProviders: "8|1796", with_watch_providers: "8|1796", watchRegion: "US", watch_region: "US" }, "advanced-discover", null]]) {
  const raw = node({ ...anchor, withoutGenres: "16,99", without_genres: "16,99", withoutKeywords: "210024|222243", without_keywords: "210024|222243", withoutWatchProviders: "9|337", without_watch_providers: "9|337", watchRegion: "US", voteCountGte: 50, "vote_count.gte": 50, voteAverageLte: null, sortBy: "popularity.desc" }).editable;
  const c = createBuilderController();
  assert.equal(c.importValue([{ id: "c", title: "Collection", folders: [{ id: "f", title: "Folder", sources: [{ ...raw, custom: { keep: true } }] }] }]).ok, true);
  const state = c.getState(), source = state.project.collections[0].folders[0].sources[0], opening = createSourceEditSession(state.project, source.internalId), before = c.stringifyProject().json;
  assert.equal(opening.ok, true); assert.equal(opening.session.adapterId, expected);
  assert.equal(opening.draft.extraEditable.withKeywords, true); assert.equal(opening.draft.extraEditable.withoutWatchProviders, true);
  assert.deepEqual(sourceEditorFor(source).buildPatch({ source, draft: opening.draft }), {});
  assert.equal(saveSourceEdit(c, opening.session, opening.draft).changed, false);
  assert.equal(c.stringifyProject().json, before);
  if (expected !== "advanced-discover") {
   const preview = prepareSourceEditPreview(opening.session, opening.draft);
   assert.equal(preview.previewable, true, JSON.stringify(preview));
  }
  assert.equal(exactDiscoverPreviewQuery({ category: "native-tmdb", editable: raw }).queryParameters.without_keywords, "210024|222243");
  const controls = update ? { ...opening.draft.advanced.ui, filters: opening.draft.advanced.filters, labels: {} } : opening.draft;
  const selected = setDiscoverSelection(controls, "withoutKeywords", { id: 222243, name: "removed" }, { remove: true });
  const next = setDiscoverSelection(selected, "withoutKeywords", { id: 818, name: "added" });
  const draft = update ? update(opening.draft, { ...opening.draft.advanced, filters: next.filters, ui: { ...next, filters: undefined } }) : touchDiscoverFilters(opening.draft, next);
  assert.deepEqual(draft.touchedFilters, ["withoutKeywords"]);
  const candidate = { ...source, editable: { ...source.editable, ...sourceEditorFor(source).buildPatch({ source, draft }) } };
  assert.equal(exactDiscoverPreviewQuery(candidate).queryParameters.without_keywords, "210024|818");
  if (expected !== "advanced-discover") assert.equal(prepareSourceEditPreview(opening.session, draft).previewable, true);
  assert.equal(c.getState().project, state.project); assert.equal(c.stringifyProject().json, before, "Preview never saves");
  const saved = saveSourceEdit(c, opening.session, draft); assert.equal(saved.ok, true, JSON.stringify(saved));
  const out = c.serializeProject().value[0].folders[0].sources[0];
  assert.deepEqual(out.filters, { ...raw.filters, withoutKeywords: "210024|818", without_keywords: "210024|818" });
  assert.deepEqual(c.getState().project.collections[0].folders[0].sources[0].rawImported, source.rawImported);
  const round = createBuilderController(); assert.equal(round.importValue(c.serializeProject().value).ok, true); assert.deepEqual(round.serializeProject().value, c.serializeProject().value);
 }
});

test("pipe compatibility keeps unsafe and unevidenced expressions preservation-only", () => {
 for (const filters of [{ withoutKeywords: "1|2,3" }, { withoutKeywords: "1|1" }, { withoutKeywords: "0|2" }, { withoutKeywords: "1|2147483648" }, { withoutKeywords: [1, 2] }, { withoutKeywords: "1|2", without_keywords: "2|1" }, { without_keywords: "1|2" }, { withoutKeywords: "1|2", future: true }, { withoutGenres: "16|99" }, { withoutCompanies: "2|3" }, { withNetworks: "213", withoutKeywords: "1|2" }]) {
  const source = node({ withGenres: "28", ...filters }); source.rawImported = structuredClone(source.editable);
  assert.equal(exactDiscoverPreviewQuery(source), null, JSON.stringify(filters));
  const editor = sourceEditorFor(source); assert.ok(editor);
  const draft = editor.readInitialState(source);
  assert.deepEqual(editor.buildPatch({ source, draft }), {});
  if (filters.withoutKeywords && !filters.future && !filters.withNetworks) assert.equal(draft.extraEditable.withKeywords, false, JSON.stringify(filters));
 }
});

test("Genre combined Advanced derives full Movie/TV candidates with exact dates and fixed Genre", () => {
 const result = buildGenreSourceDrafts(["Comedy"], { sharedMediaChoice: "both", advanced: { ...scalar, filters: { ...catalogueFilters, releaseDateGte: "2001-02-03", releaseDateLte: "2004-05-06", year: "2003" }, exclusionsByGenre: { Comedy: ["Documentary"] } } });
 assert.equal(result.ok, true, JSON.stringify(result.errors)); assert.equal(result.drafts.length, 2);
 for (const draft of result.drafts) {
  const f = draft.editable.filters;
  assert.equal(f.withGenres, "35"); assert.equal(f.withoutGenres, "99"); assert.equal(f.voteCountGte, 0); assert.equal(f.voteAverageGte, 0); assert.equal(f.year, 2003);
  assert.equal(f.releaseDateGte, "2001-02-03"); assert.equal(f.withNetworks, draft.editable.mediaType === "TV" ? "213" : undefined);
  const query = exactDiscoverPreviewQuery(draft).queryParameters;
  assert.equal(query.with_watch_monetization_types, "flatrate|free|ads|rent|buy"); assert.equal(query.without_watch_providers, "9");
  assert.equal(query[draft.editable.mediaType === "TV" ? "first_air_date_year" : "year"], "2003");
 }
});

test("Decade combined Advanced retains exact period and independent general/structural Genre sources", () => {
 for (const genreName of [null, "Comedy"]) {
  const result = buildCanonicalDecadePeriodDrafts({ periodId: "1980s", mediaMode: "both", genreName, advanced: { ...scalar, filters: catalogueFilters, ordinaryExcludedGenres: ["Documentary"], exclusionsByGenre: genreName ? { Comedy: ["Documentary"] } : {} } });
  assert.equal(result.ok, true, JSON.stringify(result.errors)); assert.equal(result.drafts.length, 2);
  for (const draft of result.drafts) { const f = draft.editable.filters; assert.equal(f.releaseDateGte, "1980-01-01"); assert.equal(f.releaseDateLte, "1989-12-31"); assert.equal(f.year, undefined); assert.equal(f.withGenres, genreName ? "35" : undefined); assert.equal(f.withKeywords, catalogueFilters.withKeywords); assert.ok(exactDiscoverPreviewQuery(draft)); }
 }
});

test("Streaming candidates, full configured equality and bundle validation include optional filters", () => {
 const { watchRegion, withWatchProviders, ...optional } = catalogueFilters;
 const advanced = { filters: { ...optional, withGenres: "35|18", withoutGenres: "99", voteCountGte: "0", voteAverageGte: "0", voteAverageLte: "8", withOriginalLanguage: "en", withOriginCountry: "AU", releaseDateGte: "2000-02-29", releaseDateLte: "2025-03-10", year: "2024" } };
 const options = { regionCodes: ["AU", "US"], mediaChoice: "both", advanced };
 const result = buildStreamingSourceDrafts(provider, options);
 assert.equal(result.ok, true, JSON.stringify(result.errors)); assert.equal(result.drafts.length, 4);
 assert.equal(validateStreamingSourceDrafts(result.drafts, { provider, ...options }).ok, true);
 assert.equal(validateStreamingSourceDrafts(result.drafts, { provider, ...options, advanced: {} }).ok, false);
 for (const draft of result.drafts) { assert.equal(draft.editable.filters.withWatchProviders, "8"); assert.equal(draft.editable.filters.voteCountGte, 0); assert.ok(exactDiscoverPreviewQuery(draft)); }
 assert.notEqual(discoverSourceIdentity(result.drafts[0].editable).key, discoverSourceIdentity(buildStreamingSourceDrafts(provider, { ...options, advanced: {} }).drafts[0].editable).key);
});

test("authored optional groups reject containers, booleans, invalid grammar, coupling and fixed writes", () => {
 for (const value of [[], [0], {}, false, true]) for (const field of ["voteCountGte", "voteAverageGte", "year", "withOriginalLanguage", "withKeywords", "releaseDateGte"]) assert.equal(validateAdvancedFilters({ [field]: value }, "TV").ok, false, field + JSON.stringify(value));
 for (const filters of [{ withKeywords: "1|2,3" }, { withKeywords: "2147483648" }, { withoutKeywords: "1|2,3" }, { withoutCompanies: "1|2" }, { year: 2000, releaseDateGte: "2001-01-01" }, { releaseDateGte: "2001-02-29" }, { withCompanies: "3", withoutCompanies: "3" }, { withWatchProviders: "8" }, { watchRegion: "AU" }, { withGenres: "18" }]) assert.equal(buildGenreSourceDrafts(["Comedy"], { advanced: { filters } }).ok, false, JSON.stringify(filters));
 for (const field of ["releaseDateGte", "releaseDateLte", "year", "withGenres"]) assert.equal(buildCanonicalDecadePeriodDrafts({ periodId: "1980s", mediaMode: "movies", advanced: { filters: { [field]: "" } } }).ok, false, field);
 for (const filters of [{ withWatchProviders: "9" }, { watchRegion: "US" }, { withoutWatchProviders: "8,9" }]) assert.equal(buildStreamingSourceDrafts(provider, { regionCodes: ["AU"], mediaChoice: "both", advanced: { filters } }).ok, false);
});

test("Streaming shared exclusion conflicts name every selected service", () => {
 const project = createBuilderController().getState().project;
 const result = createStreamingHierarchyPlan(project, { scope: "new-collection", projectRevision: 0, mediaChoice: "both", regions: [{ code: "AU", name: "Australia" }], providers: [provider, { ...provider, id: 9, name: "Service nine" }], advanced: { filters: { withoutWatchProviders: "8,9" } } });
 assert.equal(result.ok, false); assert.ok(result.errors.some((e) => e.message.includes("Service eight"))); assert.ok(result.errors.some((e) => e.message.includes("Service nine")));
});

test("sparse Decades exclusion inheritance survives blank Custom, shared edits and frozen plans", () => {
 let state = toggleDecadePreset(toggleDecadePreset(createDecadesCreationState({ scope: "new-collection", currentYear: 2026 }), "1980s"), "1990s");
 state = { ...state, content: { wholeDecade: true, individualYears: false, genreBreakdown: true } };
 state = setDecadesGenresForContext(state, ["Comedy", "Drama"], "all");
 state = setDecadesOrdinaryExclusionsForContext(state, ["Documentary"], "all");
 state = setDecadesGenreExclusionsForContext(state, { Comedy: ["Documentary"], Drama: ["Documentary"] }, "all");
 state = setDecadesExclusionInheritance(state, "1980s", "ordinary"); state = setDecadesExclusionInheritance(state, "1980s", "genres");
 assert.deepEqual(decadesOrdinaryExclusionsForContext(state, "1980s"), []); assert.deepEqual(decadesGenreExclusionsForContext(state, "1980s"), {});
 state = setDecadesOrdinaryExclusionsForContext(state, ["Horror"], "all");
 assert.deepEqual(decadesOrdinaryExclusionsForContext(state, "1980s"), []); assert.deepEqual(decadesOrdinaryExclusionsForContext(state, "1990s"), ["Horror"]);
 state = setDecadesGenreExclusionsForContext(state, { Comedy: ["Horror"] }, "1980s");
 assert.equal(decadesGenreExclusionsForContext(state, "1980s").Drama, undefined, "a Custom map has no per-leaf inheritance");
 state = setDecadesExclusionInheritance(state, "1980s", "genres");
 const plan = buildDecadesCreationPlan(createBuilderController().getState().project, 0, state);
 assert.equal(plan.ok, true, JSON.stringify(plan.errors));
 const serialized = JSON.stringify(plan.plan);
 assert.ok(serialized.includes('"ordinaryExcludedGenresByDecade":{"1980s":[]}')); assert.ok(serialized.includes('"exclusionsByGenreByDecade":{"1980s":{}}'));
 state = setDecadesExclusionInheritance(state, "1980s", "ordinary", true); assert.equal(Object.hasOwn(state.advanced.ordinaryExcludedGenresByDecade, "1980s"), false); assert.deepEqual(decadesOrdinaryExclusionsForContext(state, "1980s"), ["Horror"]);
});

test("routing inspects all anchors before and after plain JSON export/reopen", () => {
 const period = { releaseDateGte: "1980-01-01", releaseDateLte: "1989-12-31" }, stream = { withWatchProviders: "8", watchRegion: "AU" }, extras = { withKeywords: "15097", withCompanies: "3", voteCountGte: 0 };
 for (const [filters, expected] of [[{ withGenres: "35", ...extras }, "genre"], [{ ...period, ...extras }, "decade"], [{ ...period, withGenres: "35", ...extras }, "decade"], [{ ...stream, ...extras }, "streaming"], [{ withGenres: "35", ...stream, ...extras }, "advanced-discover"], [{ ...period, ...stream, ...extras }, "advanced-discover"], [{ withWatchProviders: "8|9", watchRegion: "AU" }, "advanced-discover"]]) {
  const original = node(filters); for (const source of [original, JSON.parse(JSON.stringify(original))]) assert.equal(sourceEditorFor(source)?.id, expected, JSON.stringify(filters));
 }
});

test("family touched edits preserve unrelated nulls, opaque values and mirrors; unsafe coupled edits reject", () => {
 for (const [anchor, update] of [[{ withGenres: "35" }, updateGenreSourceAdvanced], [{ releaseDateGte: "1980-01-01", releaseDateLte: "1989-12-31" }, updateDecadeSourceAdvanced], [{ withWatchProviders: "8", watchRegion: "AU" }, updateStreamingSourceAdvanced]]) {
  const source = node({ ...anchor, voteAverageGte: null, voteCountGte: 0, "vote_count.gte": "0", withKeywords: "15097", with_keywords: "15097", future: { keep: [1, false] }, withoutCompanies: null });
  source.rawImported = structuredClone(source.editable);
  const editor = sourceEditorFor(source), initial = editor.readInitialState(source);
  assert.deepEqual(editor.buildPatch({ source, draft: initial }), {});
  const nextAdvanced = editor.id === "streaming" ? { ...initial.advanced, filters: { ...initial.advanced.filters, voteCountGte: "12" } } : { ...initial.advanced, minimumVotes: "12" };
  const draft = update(initial, nextAdvanced); assert.equal(editor.validateDraft({ source, draft }).ok, true);
  const patch = editor.buildPatch({ source, draft });
  assert.deepEqual(patch.filters, { ...source.editable.filters, voteCountGte: 12, "vote_count.gte": 12 });
  assert.equal(exactDiscoverPreviewQuery({ ...source, editable: { ...source.editable, ...patch } }), null, "unknown effective semantics fail closed");
  const unsafe = node({ ...anchor, voteAverageGte: 9, voteAverageLte: 10, "vote_average.lte": 8 });
  unsafe.rawImported = structuredClone(unsafe.editable);
  const unsafeEditor = sourceEditorFor(unsafe), opening = unsafeEditor.readInitialState(unsafe);
  assert.deepEqual(unsafeEditor.buildPatch({ source: unsafe, draft: opening }), {});
  const changed = update(opening, unsafeEditor.id === "streaming" ? { ...opening.advanced, filters: { ...opening.advanced.filters, voteAverageGte: 7 } } : { ...opening.advanced, minimumRating: "7" });
  assert.equal(unsafeEditor.validateDraft({ source: unsafe, draft: changed }).ok, false);
 }
});


test("Decade representative samples retain catalogue filters and resolved blank Custom exclusions", () => {
 const result = buildDecadesPreviewGroups({ selectedDecadeIds: ["1980s", "1990s"], mediaMode: "both", content: { wholeDecade: true, individualYears: false, genreBreakdown: false }, currentYear: 2026, advanced: { filters: catalogueFilters, ordinaryExcludedGenres: ["Documentary"], ordinaryExcludedGenresByDecade: { "1980s": [] } } });
 assert.equal(result.ok, true, JSON.stringify(result.errors));
 for (const group of result.groups) for (const request of group.choices[0].requests) for (const draft of request.drafts) {
  assert.equal(draft.editable.filters.withKeywords, catalogueFilters.withKeywords);
  assert.equal(draft.editable.filters.withoutWatchProviders, "9");
  assert.equal(draft.editable.filters.withoutGenres, group.decadeId === "1980s" ? undefined : "99");
  assert.ok(exactDiscoverPreviewQuery(draft));
 }
});

test("enriched Streaming plans freeze filters, reject tampering/staleness and apply atomically", () => {
 const controller = createBuilderController();
 const options = { scope: "new-collection", projectRevision: controller.getState().revision, mediaChoice: "both", regions: [{ code: "AU", name: "Australia" }], providers: [provider], advanced: { filters: { withKeywords: "6054", voteCountGte: 0, withoutWatchProviders: "9" } } };
 const result = createStreamingHierarchyPlan(controller.getState().project, options);
 assert.equal(result.ok, true, JSON.stringify(result.errors)); assert.ok(Object.isFrozen(result.plan.configuration.advanced.filters));
 options.advanced.filters.withKeywords = "15097"; assert.equal(result.plan.configuration.advanced.filters.withKeywords, "6054");
 const tampered = structuredClone(result.plan); tampered.configuration.advanced.filters.withKeywords = "15097";
 const before = controller.getState(); assert.equal(applyStreamingHierarchyPlan(controller, tampered).ok, false); assert.equal(controller.getState().project, before.project); assert.equal(controller.getState().revision, before.revision);
 assert.equal(applyStreamingHierarchyPlan(controller, result.plan).ok, true); assert.equal(controller.getState().revision, before.revision + 1);
 const saved = controller.getState(); assert.equal(applyStreamingHierarchyPlan(controller, result.plan).ok, false); assert.equal(controller.getState().project, saved.project);
 const exported = controller.serializeProject().value; assert.ok(exported.flatMap(c => c.folders.flatMap(f => f.sources)).every(source => source.filters.withKeywords === "6054"));
});

test("family edits validate touched values against untouched coupled partners", () => {
 for (const [anchor, update] of [[{ withGenres: "35" }, updateGenreSourceAdvanced], [{ releaseDateGte: "1980-01-01", releaseDateLte: "1989-12-31" }, updateDecadeSourceAdvanced], [{ withWatchProviders: "8", watchRegion: "AU" }, updateStreamingSourceAdvanced]]) {
  const source = node({ ...anchor, voteAverageGte: 2, voteAverageLte: 8, withCompanies: "3" });
  const editor = sourceEditorFor(source), opening = editor.readInitialState(source);
  const changed = update(opening, editor.id === "streaming" ? { ...opening.advanced, filters: { ...opening.advanced.filters, voteAverageGte: "9" } } : { ...opening.advanced, minimumRating: "9" });
  assert.equal(editor.validateDraft({ source, draft: changed }).ok, false);
  const company = update(opening, { ...opening.advanced, filters: { ...opening.advanced.filters, withoutCompanies: "3" } });
  assert.equal(editor.validateDraft({ source, draft: company }).ok, false);
 }
});


test("Genre Advanced media includes fixed-media concepts independently of the shared choice", () => {
 assert.equal(genreAdvancedMediaMode(["Comedy", "Action & Adventure"], "movies"), "both");
 assert.equal(genreAdvancedMediaMode(["Action & Adventure"], "movies"), "series");
 const result = buildGenreSourceDrafts(["Comedy", "Action & Adventure"], { sharedMediaChoice: "movies", advanced: { filters: { withNetworks: "213", withKeywords: "6054" } } });
 assert.equal(result.ok, true, JSON.stringify(result.errors));
 assert.deepEqual(result.drafts.map(draft => [draft.editable.mediaType, draft.editable.filters.withNetworks]), [["MOVIE", undefined], ["TV", "213"]]);
});


test("conflicting sort mirrors are preservation-only in every family editor", () => {
 for (const anchor of [{ withGenres: "35" }, { releaseDateGte: "1980-01-01", releaseDateLte: "1989-12-31" }, { withWatchProviders: "8", watchRegion: "AU" }]) {
  const source = node({ ...anchor, sortBy: "vote_count.desc" }); source.rawImported = structuredClone(source.editable);
  const editor = sourceEditorFor(source), draft = editor.readInitialState(source);
  assert.equal(draft.sortEditable, false); assert.deepEqual(editor.buildPatch({ source, draft }), {});
  assert.equal(editor.validateDraft({ source, draft: { ...draft, sortTouched: true, sortBy: "primary_release_date.desc", sortOptionId: "recent" } }).ok, false);
 }
});

// Presentation-only count tests; synthetic filter values do not stand in for live results.
test("Filters applied count groups tokens and ignores defaults, identity, hidden and preserved controls", async () => {
 const { appliedFilterCount, filtersDisclosureSummary } = await import("../builder/src/ui/filter-disclosure.js");
 assert.equal(appliedFilterCount({}), 0);
 assert.equal(appliedFilterCount({ voteCountGte: 0, voteAverageGte: "0", voteAverageLte: "10", withOriginalLanguage: "", watchRegion: "US", ui: { touched: true } }), 0);
 assert.equal(filtersDisclosureSummary(0), "Refine which titles are included.");
 const genres = { withGenres: "28|35", withoutGenres: "27" };
 assert.equal(appliedFilterCount(genres), 1, "one semantic Genres group, not three chips");
 assert.equal(filtersDisclosureSummary(1), "1 applied");
 const filters = { ...genres, voteCountGte: "100", voteAverageGte: "5", voteAverageLte: "8", releaseDateGte: "1990-01-01", releaseDateLte: "1999-12-31", year: "1994" };
 const before = structuredClone(filters);
 assert.equal(appliedFilterCount(filters), 4, "votes, rating range, Genres and Dates");
 assert.equal(filtersDisclosureSummary(4), "4 applied");
 assert.deepEqual(filters, before, "counting does not normalize or mutate filter payloads");
 assert.equal(appliedFilterCount(filters, { hiddenFields: ["releaseDateGte", "releaseDateLte", "year"], editable: { withGenres: false, withoutGenres: false } }), 2);
 assert.equal(appliedFilterCount({ watchRegion: "US", withWatchProviders: "8" }, { hiddenFields: ["watchRegion", "withWatchProviders"] }), 0);
 assert.equal(appliedFilterCount({ withGenres: "28" }, { genreFilters: [{}] }), 0, "all applicable entities can override shared Genres to unrestricted");
 assert.equal(appliedFilterCount({}, { genresApplied: true }), 1, "legacy family exclusions remain one Genres group");
 assert.equal(appliedFilterCount({}, { genresApplied: true, editable: { withGenres: false, withoutGenres: false } }), 0);
 assert.equal(appliedFilterCount({}), 0, "clearing returns to the default helper");
});
