// Pure local parity cases. No external provider or private owner data is used.
export function occurrenceParityCases(api, createController) {
 const cases = [];
 const genres = ['Action', 'Adventure', 'Action & Adventure', 'Comedy', 'Horror'];
 const genreDrafts = api.buildGenreSourceDrafts(genres, { titleMode: 'hierarchy' }).drafts;
 const decadeSource = { selectedDecadeIds: ['1950s-and-earlier', '1980s'], mediaMode: 'both', content: { wholeDecade: true, individualYears: true, genreBreakdown: false }, currentYear: 2026, sortOptionId: 'popular', genreNames: [], advanced: {} };
 const decadeDrafts = api.buildDecadesSourceDrafts(decadeSource).drafts;
 const source = (draft, patch = {}) => ({ ...draft.editable, ...patch });
 for (const kind of ['empty', 'small', 'mixed']) {
  let sequence = 0;
  const app = createController({ idFactory: () => `p-${++sequence}`, nuvioIdFactory: () => `n-${++sequence}` });
  if (kind !== 'empty') {
   const comedy = genreDrafts.find(d => d.editable.filters.withGenres === '35' && d.editable.mediaType === 'MOVIE');
   const sources = kind === 'small' ? [source(comedy)] : [source(comedy, { title: '  duplicate  ' }), source(comedy), source(comedy, { sortBy: 'vote_average.desc' }), source(comedy, { filters: { ...comedy.editable.filters, unknown: { nested: [1, null] } } }), source(comedy, { filters: [] }), { title: 'Opaque', provider: 'community', custom: { keep: true } }, source(decadeDrafts[0])];
   const result = app.importValue([
    { title: '  Destination  ', folders: [{ title: '\u200e', sources }, { title: 'same display name', sources: [source(genreDrafts[0]), source(decadeDrafts[1])] }] },
    { title: '\u200e', folders: [{ title: 'same display name', sources: [...genreDrafts.map(d=>source(d)), source(decadeDrafts[0]), source(decadeDrafts.at(-1))] }] },
   ]);
   if (!result.ok) throw Error(JSON.stringify(result.errors));
  }
  const {project,revision} = app.getState();
  const destination = project.collections[0]?.internalId;
  for (const scope of ['new-collection', ...(destination ? ['new-folder'] : [])]) {
   for (const structure of ['genre-folders','media-folders','separate-media-genre-folders','separate-media-collections']) {
    if (scope === 'new-folder' && structure === 'separate-media-collections') continue;
    const options = {scope, projectRevision:revision, genres, structure, ...(destination && scope === 'new-folder' ? {destinationCollectionInternalId:destination} : {})};
    cases.push({name:`${kind}/genre/${scope}/${structure}`,result:api.createGenreHierarchyPlan(project,options)});
    if (structure === 'genre-folders') cases.push({name:`${kind}/genre/${scope}/composite-both`,result:api.createGenreHierarchyPlan(project,{...options, compositePlacements:{'Action & Adventure':'both'}})});
   }
   for (const mediaMode of ['movies','series','both']) {
    for (const layout of mediaMode === 'both' && scope === 'new-collection' ? ['separate-media-collections','mixed-collection'] : [null]) {
     cases.push({name:`${kind}/decades/${scope}/${mediaMode}/${layout}`,result:api.createDecadesHierarchyPlan(project,{scope,projectRevision:revision,source:{...decadeSource,mediaMode},...(scope==='new-folder'?{destinationCollectionInternalId:destination}:{}),...(layout?{layout}:{})})});
    }
   }
  }
  cases.push({name:`${kind}/genre/duplicates`,result:api.inspectGenreSourceDuplicates(project,project.collections[0]?.folders[0].internalId,genreDrafts)});
  cases.push({name:`${kind}/genre/folders`,result:api.inspectGenreFolderPlan(project,destination,genres,genreDrafts)});
  cases.push({name:`${kind}/decades/placement`,result:api.inspectDecadesSourcePlacement(project,decadeDrafts,{destinationCollectionInternalId:destination})});
 }
 return cases;
}
