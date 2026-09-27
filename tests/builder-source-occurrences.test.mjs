import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { createBuilderController } from '../builder/src/application/controller.js';
import { deepFreeze } from '../builder/src/application/state.js';
import { createProjectSourceEvidenceCache, projectSourceSnapshot } from '../builder/src/domain/source-occurrences.js';
import { discoverSourceOccurrences } from '../builder/src/source-add/discover-source-occurrences.js';
import { discoverSourceIdentity } from '../builder/src/nuvio/discover.js';
import * as api from '../builder/src/source-add/index.js';
import { occurrenceParityCases } from './helpers/source-occurrence-parity.mjs';

const draft = api.buildGenreSourceDrafts(['Comedy'], { sharedMediaChoice: 'movies' }).drafts[0];
const key = discoverSourceIdentity(draft.editable).key;
const decadeOptions = { selectedDecadeIds: ['1950s-and-earlier','1960s','1970s','1980s','1990s','2000s','2010s','2020s'], mediaMode: 'both', content: { wholeDecade: false, individualYears: true, genreBreakdown: false }, currentYear: 2026, sortOptionId: 'popular', genreNames: [], advanced: {} };
function makeApp() {
 let id = 0;
 const app = createBuilderController({ idFactory: () => `internal-${++id}`, nuvioIdFactory: () => `nuvio-${++id}` });
 const value = [{ title: 'A', folders: [{ title: 'First', sources: [{...draft.editable}, {...draft.editable, sortBy: 'vote_average.desc'}] }, {title:'Second',sources:[]}] }, {title:'B',folders:[]}];
 assert.equal(app.importValue(value).ok,true);
 return {app,value};
}

test('neutral snapshot retains ordered repeated occurrences, opaque Sources and exact references', () => {
 const source = { nodeType:'source', internalId:'shared', ...draft };
 const opaque = { nodeType:'source', internalId:'opaque', category:'opaque', rawImported:{untouched:true} };
 const project = deepFreeze({collections:[{internalId:'c',editable:{title:'  exact  '},folders:[{internalId:'f1',editable:{title:'\u200e'},sources:[source,opaque],catalogSources:[{ignored:true}]},{internalId:'f2',editable:{title:'  exact  '},sources:[source]}]}]});
 const cache=createProjectSourceEvidenceCache(); const snapshot=cache.snapshotFor(project);
 assert.equal(cache.snapshotFor(project),snapshot);assert.equal(snapshot.project,project);
 assert.deepEqual(snapshot.occurrences.map(x=>[x.collectionIndex,x.folderIndex,x.sourceIndex,x.order]),[[0,0,0,0],[0,0,1,1],[0,1,0,2]]);
 assert.equal(snapshot.occurrences[0].source,snapshot.occurrences[2].source);
 assert.notEqual(snapshot.occurrences[0],snapshot.occurrences[2]);
 assert.equal(snapshot.occurrences[1].source,opaque);
 assert.equal(snapshot.occurrences[0].collection,project.collections[0]);
 assert.equal(snapshot.occurrences[0].folder,project.collections[0].folders[0]);
 assert.equal(snapshot.occurrences[0].collection.editable.title,'  exact  ');
 assert.equal(snapshot.occurrences[0].folder.editable.title,'\u200e');
 assert.throws(()=>snapshot.occurrences.push({}),TypeError);
 assert.throws(()=>{snapshot.occurrences[0].order=9;},TypeError);
 assert.deepEqual(discoverSourceOccurrences(project,[key,key]).map(x=>x.order),[0,2]);
});

test('family evidence is lazy, isolated, read-only and construction failures never publish partial values', () => {
 const cache=createProjectSourceEvidenceCache(), project=deepFreeze({collections:[]});
 let attempts=0, unrelated=0;
 const build=()=>{attempts++;if(attempts===1)throw Error('derivation failed');return Object.freeze({complete:true});};
 const other=()=>{unrelated++;return Object.freeze({other:true});};
 const snapshot=cache.snapshotFor(project);
 assert.equal(attempts,0);assert.equal(unrelated,0);
 assert.throws(()=>cache.evidenceFor(project,build),/derivation failed/);
 const result=cache.evidenceFor(project,build);
 assert.equal(cache.evidenceFor(project,build),result);assert.equal(attempts,2);
 assert.equal(cache.snapshotFor(project),snapshot);assert.equal(unrelated,0);
 assert.notEqual(cache.evidenceFor(project,other),result);assert.equal(unrelated,1);
 const next=deepFreeze({...project});
 assert.notEqual(cache.snapshotFor(next),snapshot);assert.notEqual(cache.evidenceFor(next,build),result);assert.equal(attempts,3);
});

test('a failed snapshot traversal can be retried without a partial cached snapshot', () => {
 const cache=createProjectSourceEvidenceCache();let calls=0;
 const project=Object.freeze({get collections(){calls++;if(calls===1)throw Error('traversal failed');return Object.freeze([]);}});
 assert.throws(()=>cache.snapshotFor(project),/traversal failed/);
 const snapshot=cache.snapshotFor(project);assert.equal(snapshot.occurrences.length,0);
 assert.equal(cache.snapshotFor(project),snapshot);assert.equal(calls,2);
});

test('mutable drafts are uncached and changed content cannot retain old DISCOVER evidence', () => {
 const project={collections:[{internalId:'c',folders:[{internalId:'f',sources:[{nodeType:'source',...structuredClone(draft)}]}]}]};
 assert.notEqual(projectSourceSnapshot(project),projectSourceSnapshot(project));
 assert.equal(discoverSourceOccurrences(project,[key]).length,1);
 project.collections[0].folders[0].sources[0].editable.sortBy='vote_average.desc';
 assert.equal(discoverSourceOccurrences(project,[key]).length,0);
});

test('DISCOVER queries preserve project order across keys and retain family-specific title projection', () => {
 const other=structuredClone(draft);other.editable.sortBy='vote_average.desc';
 const otherKey=discoverSourceIdentity(other.editable).key;
 const invalid={nodeType:'source',category:'native-tmdb',editable:{...draft.editable,filters:[]}};
 const project=deepFreeze({collections:[{internalId:'c',editable:{title:'  C  '},folders:[{internalId:'f',editable:{title:'\u200e'},sources:[{nodeType:'source',internalId:'a',...other},{nodeType:'source',internalId:'b',...draft},invalid,{nodeType:'source',internalId:'c',...draft}]}]}]});
 const found=discoverSourceOccurrences(project,[key,otherKey,key]);
 assert.deepEqual(found.map(x=>x.source.internalId),['a','b','c']);
 assert.throws(()=>{found[0].identity='wrong';},TypeError);
 const genre=api.inspectGenreSourceDuplicates(project,'f',[draft]).destination;
 const decades=api.inspectDecadesSourcePlacement(project,[draft],{destinationFolderInternalId:'f'}).occurrences;
 assert.deepEqual(genre.map(x=>x.sourceInternalId),['b','c']);assert.equal(genre[0].collectionTitle,'C');
 assert.equal(decades[0].collectionTitle,'  C  ');assert.equal(decades[0].folderTitle,'\u200e');
});

test('3,636 Sources: one traversal and one existing identity per Source across Genre alternatives and Decades', () => {
 let visits=0,identities=0,folderReads=0;
 const sources=[];
 for(let i=0;i<3636;i++){
  const source=Object.freeze({nodeType:'source',internalId:`s-${i}`,editable:deepFreeze({...draft.editable}),get category(){identities++;return 'native-tmdb';}});
  Object.defineProperty(sources,i,{enumerable:true,get(){visits++;return source;}});
 }
 Object.freeze(sources);
 const folder=Object.freeze({internalId:'f',editable:Object.freeze({title:'F'}),get sources(){folderReads++;return sources;}});
 const collection=Object.freeze({internalId:'c',editable:Object.freeze({title:'C'}),folders:Object.freeze([folder])});
 const project=Object.freeze({nodeType:'project',internalId:'p',collections:Object.freeze([collection])});
 const snapshot=projectSourceSnapshot(project);
 assert.equal(snapshot.occurrences.length,3636);assert.equal(visits,3636);assert.equal(folderReads,1);assert.equal(identities,0,'Snapshot creates no family identities');
 for(let repeat=0;repeat<2;repeat++){
  for(const structure of ['genre-folders','media-folders','separate-media-genre-folders','separate-media-collections']) assert.equal(api.createGenreHierarchyPlan(project,{scope:'new-collection',projectRevision:0,genres:api.GENRE_CONCEPTS.map(x=>x.name),structure}).ok,true);
  assert.equal(api.createDecadesHierarchyPlan(project,{scope:'new-collection',projectRevision:0,source:decadeOptions}).ok,true);
 }
 assert.equal(visits,3636);assert.equal(folderReads,1);assert.equal(identities,3636);
 const next=Object.freeze({...project});
 discoverSourceOccurrences(next,[key]);assert.equal(visits,7272);assert.equal(identities,7272,'Even shared Source references are derived for the new Project');
});

test('navigation retains project/evidence without bypassing current apply-time revalidation', () => {
 const {app}=makeApp();const before=app.getState();const snapshot=projectSourceSnapshot(before.project);
 const planned=api.createGenreHierarchyPlan(before.project,{scope:'new-collection',projectRevision:before.revision,genres:['Comedy']});
 assert.equal(app.selectNode(before.project.collections[0].folders[0].internalId).ok,true);
 assert.equal(app.getState().project,before.project);assert.equal(projectSourceSnapshot(app.getState().project),snapshot);
 const forged=structuredClone(planned.plan);forged.collections[0].folders[0].sources[0].draft.editable.title='Forged';
 const state=app.getState();assert.equal(api.applyGenreHierarchyPlan(app,forged).ok,false);assert.equal(app.getState(),state);
});

const authorityBaseline=JSON.parse(fs.readFileSync(new URL('./fixtures/source-occurrence-authority.json',import.meta.url),'utf8'));
for(const change of ['import','merge','move-folders','add','remove','rename','source-edit','collection-settings','folder-settings','source-order','folder-order','collection-order']){
 test(`current authority replaces evidence after ${change}, including retained Source objects`,()=>{
  const {app,value}=makeApp();const before=app.getState();const [c1,c2]=before.project.collections;const [f1,f2]=c1.folders;const [s1]=f1.sources;
  const oldSnapshot=projectSourceSnapshot(before.project);discoverSourceOccurrences(before.project,[key]);
  const genre=api.createGenreHierarchyPlan(before.project,{scope:'new-collection',projectRevision:before.revision,genres:['Comedy']});
  const decade=api.createDecadesHierarchyPlan(before.project,{scope:'new-collection',projectRevision:before.revision,source:decadeOptions});
  const actions={
   import:()=>app.importValue([...value,{title:'Imported',folders:[]}]),
   merge:()=>app.mergeImportedCollections([{title:'A',folders:[{title:'First',sources:[{...draft.editable,sortBy:'vote_count.desc'}]}]}]),
   'move-folders':()=>app.moveFolders({openingProject:before.project,sourceCollectionInternalId:c1.internalId,folderInternalIds:[f1.internalId],destination:{kind:'existing',internalId:c2.internalId}}),
   add:()=>app.createSource(f1.internalId,draft),remove:()=>app.removeNode(s1.internalId),
   rename:()=>app.updateNode(c1.internalId,{title:'Renamed'}),
   'source-edit':()=>app.updateNode(s1.internalId,{sortBy:'vote_count.desc'}),
   'collection-settings':()=>app.updateNode(c1.internalId,{viewMode:'ROWS'}),
   'folder-settings':()=>app.updateNode(f1.internalId,{hideTitle:true}),
   'source-order':()=>app.moveNode(s1.internalId,1),
   'folder-order':()=>app.reorderFolders(c1.internalId,[f2.internalId,f1.internalId]),
   'collection-order':()=>app.moveNode(c1.internalId,1),
  };
  assert.equal(actions[change]().ok,true);const after=app.getState();assert.notEqual(after.project,before.project);
  const snapshot=projectSourceSnapshot(after.project);assert.notEqual(snapshot,oldSnapshot);assert.equal(snapshot.project,after.project);
  const expected=after.project.collections.flatMap(c=>c.folders.flatMap(f=>f.sources.map(s=>({c,f,s}))));
  assert.equal(snapshot.occurrences.length,expected.length);
  snapshot.occurrences.forEach((x,i)=>{assert.equal(x.collection,expected[i].c);assert.equal(x.folder,expected[i].f);assert.equal(x.source,expected[i].s);});
  const current=discoverSourceOccurrences(after.project,[key]);
  for(const x of current)assert.equal(snapshot.occurrences[x.order].collection,x.collection);
  // Captured baseline validators distinguish relevant placement changes from
  // unrelated revisions; the cache must not broaden or narrow acceptance.
  const context={project:after.project,projectRevision:after.revision};
  const expectedValidation=authorityBaseline.find(x=>x.change===change);
  assert.deepEqual(api.validateGenreHierarchyPlan(genre.plan,context),expectedValidation.genre);
  assert.deepEqual(api.validateDecadesHierarchyPlan(decade.plan,context),expectedValidation.decades);
  if(change==='import'){
   assert.equal(api.applyGenreHierarchyPlan(app,genre.plan).ok,false);
   assert.equal(api.applyDecadesHierarchyPlan(app,decade.plan).ok,false);
  }
  assert.equal(app.getState(),after);
  assert.equal(projectSourceSnapshot(before.project),oldSnapshot,'Old immutable evidence remains valid only for A');
 });
}

const captured=JSON.parse(fs.readFileSync(new URL('./fixtures/source-occurrence-parity.json',import.meta.url),'utf8'));
for(const {name,result} of occurrenceParityCases(api,createBuilderController)){
 test(`baseline full-output parity: ${name}`,()=>{
  const expected=captured.cases.find(x=>x.name===name);assert.ok(expected);
  assert.deepEqual(result.plan?.counts??null,expected.counts);
  assert.equal(createHash('sha256').update(JSON.stringify(result)).digest('hex'),expected.sha256,`Full helper/plan result diverged from ${captured.baseline}: ${name}`);
 });
}

test('relevant placement changes reject warmed plans using B evidence and leave state untouched',()=>{
 const {app}=makeApp();const before=app.getState();const c=before.project.collections[0],f=c.folders[0];
 const genre=api.createGenreHierarchyPlan(before.project,{scope:'new-folder',projectRevision:before.revision,destinationCollectionInternalId:c.internalId,genres:['Horror']});
 const source={...decadeOptions,selectedDecadeIds:['1980s']};
 const decade=api.createDecadesHierarchyPlan(before.project,{scope:'new-folder',projectRevision:before.revision,destinationCollectionInternalId:c.internalId,source});
 assert.equal(genre.ok,true);assert.equal(decade.ok,true);
 assert.equal(app.createSource(f.internalId,api.buildGenreSourceDrafts(['Horror']).drafts[0]).ok,true);
 assert.equal(app.createSource(f.internalId,api.buildDecadesSourceDrafts(source).drafts[0]).ok,true);
 const after=app.getState();assert.notEqual(projectSourceSnapshot(before.project),projectSourceSnapshot(after.project));
 assert.equal(api.applyGenreHierarchyPlan(app,genre.plan).ok,false);assert.equal(app.getState(),after);
 assert.equal(api.applyDecadesHierarchyPlan(app,decade.plan).ok,false);assert.equal(app.getState(),after);
});
