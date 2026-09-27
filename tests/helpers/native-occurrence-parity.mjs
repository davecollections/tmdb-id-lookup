// Synthetic pure-domain cases; no external response or owner data.
export function nativeOccurrenceFamilies(api) {
 const entity = { id: 101, name: "Example entity" };
 const sorts = ["popular", "recent"];
 return [
  {
   name: "People", entity, key: api.peopleSourceVariantKey, structural: api.peopleSourceIdentity,
   inspect: api.inspectPeopleHierarchyPlacement, plan: api.createPeopleHierarchyPlan,
   apply: api.applyPeopleHierarchyPlan, validate: api.validatePeopleHierarchyPlan,
   build: (person = entity, options = {}) => api.buildPeopleSourceDrafts(person, { combinations: api.PEOPLE_SOURCE_COMBINATIONS.map(x => x.id), sortOptionIds: sorts, ...options }),
   configuration: (person = entity, options = {}) => ({ people: [{ person, drafts: api.buildPeopleSourceDrafts(person, { combinations: api.PEOPLE_SOURCE_COMBINATIONS.map(x => x.id), sortOptionIds: sorts, ...options }).drafts, folderEditable: { title: person.name, tileShape: "POSTER" } }] }),
  },
  {
   name: "Studio", entity, key: api.studioSourceVariantKey, structural: api.studioSourceIdentity,
   inspect: api.inspectStudioHierarchyPlacement, plan: api.createStudioHierarchyPlan,
   apply: api.applyStudioHierarchyPlan, validate: api.validateStudioHierarchyPlan,
   build: (studio = entity, options = {}) => api.buildStudioSourceDrafts(studio, { choices: ["studio-movies", "studio-series"], sortOptionIds: sorts, ...options }),
   configuration: (studio = entity, options = {}) => ({ mediaMode: "both", sortOptionIds: sorts, ...options, studios: [{ studio, artwork: { studioId: studio.id, tileShape: "LANDSCAPE", source: "emoji", folderEditable: { coverImageUrl: "", coverEmoji: "🎬" } } }] }),
  },
  {
   name: "Network", entity, key: api.networkSourceVariantKey, structural: api.networkSourceIdentity,
   inspect: api.inspectNetworkHierarchyPlacement, plan: api.createNetworkHierarchyPlan,
   apply: api.applyNetworkHierarchyPlan, validate: api.validateNetworkHierarchyPlan,
   build: (network = entity, options = {}) => api.buildNetworkSourceDrafts(network, { sortOptionIds: sorts, ...options }),
   configuration: (network = entity, options = {}) => ({ sortOptionIds: sorts, ...options, networks: [{ network, artwork: { networkId: network.id, orientation: "POSTER", tileShape: "POSTER", source: "emoji", folderEditable: { coverImageUrl: "", coverEmoji: "📺" } } }] }),
  },
 ];
}

export function nativeOccurrenceParityCases(api, createController, deepFreeze) {
 const cases = [];
 const families = nativeOccurrenceFamilies(api);
 for (const family of families) {
  const drafts = family.build().drafts;
  for (const scenario of ["empty", "partial", "complete", "split", "elsewhere", "mixed", "raw-only-id", "raw-only-provider", "raw-only-type", "raw-only-media", "edited-overlay", "advanced"]) {
   let serial = 0;
   const app = createController({ idFactory: () => "i-" + ++serial, nuvioIdFactory: () => "n-" + ++serial });
   const values = drafts.map(x => ({ ...x.editable }));
   let first = scenario === "empty" || scenario === "elsewhere" ? [] : scenario === "complete" ? values : values.slice(0, 1);
   const second = scenario === "split" ? values.slice(1, 2) : [];
   if (scenario === "mixed") first = [
    ...first, ...first, { ...values[0], sortBy: "unusual.imported" },
    { ...values[0], filters: { voteCountGte: null }, addonId: null, traktListId: null },
    { ...values[0], filters: { custom: [false, null, { keep: 1 }] }, future: { raw: true } },
    { ...values[0], filters: [] }, { ...values[0], mediaType: "INVALID" },
    ...families.filter(x => x !== family).flatMap(x => x.build().drafts.slice(0, 1).map(d => d.editable)),
    { title: "Addon", addonId: "example", catalogId: "catalog", type: "movie" },
    { title: "Trakt", provider: "trakt", traktListId: "42" },
    { title: "Opaque", provider: "community", unsupported: true },
   ];
   if (scenario === "advanced") first = family.build(family.entity, { filters: { voteCountGte: 100, withGenres: family.name === "Network" ? "18" : "35" } }).drafts.map(d => d.editable);
   const imported = app.importValue([
    { title: "  Destination  ", folders: [{ title: "\u200e", sources: first }, { title: " same ", sources: second }] },
    { title: "\u200e", folders: [{ title: " same ", sources: scenario === "empty" ? [] : values }, { title: "again", sources: scenario === "mixed" ? values.slice(0, 1) : [] }] },
   ]);
   if (!imported.ok) throw Error(JSON.stringify(imported.errors));
   let project = app.getState().project;
   if (scenario.startsWith("raw-only") || scenario === "edited-overlay") {
    const mutable = structuredClone(project);
    const source = mutable.collections[0].folders[0].sources[0];
    if (scenario.startsWith("raw-only")) delete source.editable[{ "raw-only-id": "tmdbId", "raw-only-provider": "provider", "raw-only-type": "tmdbSourceType", "raw-only-media": "mediaType" }[scenario]];
    else {
     source.editable.title = "  Edited title  ";
     source.editable.sortBy = "vote_count.desc";
     source.rawImported.filters = { future: { preserved: true } };
    }
    project = deepFreeze(mutable);
   }
   const destination = project.collections[0].internalId;
   for (const destinationCollectionInternalId of [null, destination]) {
    const scope = destinationCollectionInternalId ? "new-folder" : "new-collection";
    const name = family.name + "/" + scenario + "/" + scope;
    cases.push({ name: name + "/placement", result: family.inspect(project, drafts, { destinationCollectionInternalId }) });
    const options = { ...family.configuration(), scope, projectRevision: app.getState().revision, ...(destinationCollectionInternalId ? { destinationCollectionInternalId } : { collectionTitle: "Created" }) };
    cases.push({ name: name + "/plan", result: family.plan(project, options) });
    if (scenario === "split" && destinationCollectionInternalId) {
     cases.push({ name: name + "/chosen-folder", result: family.plan(project, { ...options, folderDestinations: { [family.entity.id]: project.collections[0].folders[1].internalId } }) });
    }
    if (scenario === "advanced" && family.name !== "People") {
     cases.push({ name: name + "/genre-override", result: family.plan(project, { ...options, filters: { voteCountGte: 100, withGenres: "35" }, genreOverrides: { [family.entity.id]: { withGenres: "18" } } }) });
    }
   }
  }
 }
 return cases;
}
