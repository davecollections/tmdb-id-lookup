import { genreAdvancedMediaMode } from "../builder/src/source-add/genre-advanced.js";
import assert from "node:assert/strict";
import test from "node:test";
import { buildGenreSourceDrafts } from "../builder/src/source-add/genre-source.js";
import { buildCanonicalDecadePeriodDrafts, buildDecadesSourceDrafts } from "../builder/src/source-add/decades-source.js";
import { buildStreamingSourceDrafts, validateStreamingSourceDrafts } from "../builder/src/source-add/streaming-source.js";
import { createStreamingHierarchyPlan, applyStreamingHierarchyPlan } from "../builder/src/source-add/streaming-plan.js";
import { validateAdvancedFilters, exactDiscoverPreviewQuery } from "../builder/src/source-add/advanced-discover.js";
import { createBuilderController } from "../builder/src/application/index.js";
import { sourceEditorFor } from "../builder/src/source-edit/source-editors.js";
import { updateGenreSourceAdvanced, updateDecadeSourceAdvanced, updateStreamingSourceAdvanced } from "../builder/src/source-edit/source-edit-actions.js";
import { createDecadesCreationState, toggleDecadePreset, setDecadesGenresForContext, setDecadesOrdinaryExclusionsForContext, setDecadesGenreExclusionsForContext, setDecadesExclusionInheritance, decadesOrdinaryExclusionsForContext, decadesGenreExclusionsForContext, buildDecadesCreationPlan } from "../builder/src/ui/decades-creation-state.js";
import { buildDecadesPreviewGroups } from "../builder/src/source-add/decades-preview.js";
import { discoverSourceIdentity } from "../builder/src/nuvio/discover.js";

const catalogueFilters = { withKeywords: "15097|9715", withoutKeywords: "210024", withCompanies: "3|174", withoutCompanies: "2", withNetworks: "213", watchRegion: "AU", withWatchProviders: "8", withoutWatchProviders: "9" };
const scalar = { minimumVotes: "0", minimumRating: "0", maximumRating: "8.25", originalLanguage: "en", originCountry: "AU" };
const provider = { id: 8, name: "Service eight", moviePriorities: { AU: 1, US: 1 }, tvPriorities: { AU: 1, US: 1 } };
const node = (filters, mediaType = "MOVIE") => ({ category: "native-tmdb", nodeType: "source", editable: { provider: "tmdb", tmdbSourceType: "DISCOVER", tmdbId: null, title: "Recipe", sortBy: "popularity.desc", mediaType, filters } });

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
 for (const filters of [{ withKeywords: "1|2,3" }, { withKeywords: "2147483648" }, { withoutKeywords: "1|2" }, { year: 2000, releaseDateGte: "2001-01-01" }, { releaseDateGte: "2001-02-29" }, { withCompanies: "3", withoutCompanies: "3" }, { withWatchProviders: "8" }, { watchRegion: "AU" }, { withGenres: "18" }]) assert.equal(buildGenreSourceDrafts(["Comedy"], { advanced: { filters } }).ok, false, JSON.stringify(filters));
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
