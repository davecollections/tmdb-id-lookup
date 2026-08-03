import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createBuilderController } from "../builder/src/application/index.js";
import {
	chooseMovieCollection,
	choosePeopleSourceCombination,
	createSourceEditSession,
	saveSourceEdit,
	updatePeopleSourceSort,
	updateSourceEditTitle,
	useSelectedMovieCollectionName,
} from "../builder/src/source-edit/index.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.join(
	rootDir,
	"manual-tests",
	"nuvio-clients",
	"issue-78-source-editing",
	"source-edit-input.json",
);

function countingFactory(prefix) {
	let count = 0;
	return () => `${prefix}-${++count}`;
}

function importFixture() {
	const controller = createBuilderController({
		idFactory: countingFactory("issue-78-internal"),
		nuvioIdFactory: countingFactory("issue-78-nuvio"),
		initialProjectTitle: "Issue 78 source editing",
	});
	const input = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
	const imported = controller.importValue(input);
	assert.equal(imported.ok, true, imported.errors?.[0]?.message);
	return controller;
}

function serialize(controller) {
	const result = controller.stringifyProject();
	assert.equal(result.ok, true, result.errors?.[0]?.message);
	return result;
}

function sourceByRawId(controller, rawId) {
	return controller.getState().project.collections[0].folders[0].sources.find((source) => (
		source.rawImported?.id === rawId
	));
}

function open(controller, rawId) {
	const source = sourceByRawId(controller, rawId);
	assert.ok(source, rawId);
	const result = createSourceEditSession(controller.getState().project, source.internalId);
	assert.equal(result.ok, true, rawId);
	return result;
}

const rawOrder = [
	"issue-78-source-before",
	"issue-78-source-collection-edit",
	"issue-78-source-addon-between",
	"issue-78-source-people-edit",
	"issue-78-source-list-after",
	"issue-78-source-people-custom",
	"issue-78-source-people-duplicate",
];

const baselineController = importFixture();
const baseline = serialize(baselineController);
const baselineFolder = baseline.value[0].folders[0];
assert.deepEqual(baselineFolder.sources.map((source) => source.id), rawOrder);
assert.equal(baselineFolder.title, "Preservation Lab");
assert.equal(baselineFolder.tileShape, "LANDSCAPE");
assert.equal(baselineFolder.hideTitle, false);
assert.equal(baselineFolder.catalogSources.length, 1);
assert.equal(baselineFolder.catalogSources[0].issue78ProjectionSentinel.keep, "projection");

const collectionNoOp = open(baselineController, "issue-78-source-collection-edit");
const noOp = saveSourceEdit(baselineController, collectionNoOp.session, collectionNoOp.draft);
assert.equal(noOp.ok, true);
assert.equal(noOp.changed, false);
assert.equal(serialize(baselineController).json, baseline.json);

const collectionController = importFixture();
const collectionEdit = open(collectionController, "issue-78-source-collection-edit");
const collectionDraft = chooseMovieCollection(collectionEdit.draft, {
	id: 987654,
	name: "Deterministic replacement",
});
const collectionSaved = saveSourceEdit(collectionController, collectionEdit.session, collectionDraft);
assert.equal(collectionSaved.ok, true);
assert.equal(collectionDraft.title, "Deterministic replacement");
assert.deepEqual(collectionSaved.patch, { title: "Deterministic replacement", tmdbId: 987654 });
const collectionOutput = serialize(collectionController).value[0].folders[0];
assert.deepEqual(collectionOutput.sources.map((source) => source.id), rawOrder);
assert.equal(collectionOutput.sources[1].tmdbId, 987654);
assert.equal(collectionOutput.sources[1].title, "Deterministic replacement");
assert.equal(collectionOutput.sources[1].provider, "TMDB");
assert.equal(collectionOutput.sources[1].tmdbSourceType, "collection");
assert.equal(collectionOutput.sources[1].mediaType, "movie");
assert.deepEqual(collectionOutput.sources[1].filters, baselineFolder.sources[1].filters);
assert.deepEqual(collectionOutput.sources[1].issue78SourceSentinel, baselineFolder.sources[1].issue78SourceSentinel);

const peopleController = importFixture();
const peopleEdit = open(peopleController, "issue-78-source-people-edit");
assert.equal(peopleEdit.draft.titleMode, "auto");
let peopleDraft = choosePeopleSourceCombination(peopleEdit.draft, "directing-series");
assert.equal(peopleDraft.title, "Directed Series");
peopleDraft = updatePeopleSourceSort(peopleDraft, "first_air_date.desc", "recent");
const peopleSaved = saveSourceEdit(peopleController, peopleEdit.session, peopleDraft);
assert.equal(peopleSaved.ok, true);
assert.deepEqual(peopleSaved.patch, {
	title: "Directed Series",
	tmdbSourceType: "DIRECTOR",
	mediaType: "TV",
	sortBy: "first_air_date.desc",
});
const peopleOutput = serialize(peopleController).value[0].folders[0];
assert.deepEqual(peopleOutput.sources.map((source) => source.id), rawOrder);
assert.equal(peopleOutput.sources[3].tmdbId, 488);
assert.equal(peopleOutput.sources[3].tmdbSourceType, "DIRECTOR");
assert.equal(peopleOutput.sources[3].mediaType, "TV");
assert.equal(peopleOutput.sources[3].title, "Directed Series");
assert.equal(peopleOutput.sources[3].sortBy, "first_air_date.desc");
assert.deepEqual(peopleOutput.sources[3].filters, baselineFolder.sources[3].filters);
assert.deepEqual(peopleOutput.sources[6], baselineFolder.sources[6]);

const customPeopleController = importFixture();
const customPeopleEdit = open(customPeopleController, "issue-78-source-people-custom");
assert.equal(customPeopleEdit.draft.titleMode, "custom");
const customPeopleDraft = choosePeopleSourceCombination(customPeopleEdit.draft, "directing-movies");
const customPeopleSaved = saveSourceEdit(customPeopleController, customPeopleEdit.session, customPeopleDraft);
assert.equal(customPeopleSaved.ok, true);
assert.deepEqual(customPeopleSaved.patch, { tmdbSourceType: "DIRECTOR", mediaType: "MOVIE" });
const customPeopleOutput = serialize(customPeopleController).value[0].folders[0];
assert.equal(customPeopleOutput.sources[5].title, "Preserve this custom People label");
assert.equal(customPeopleOutput.sources[5].sortBy, "vote_average.desc");
assert.equal(customPeopleOutput.sources[5].tmdbId, 31);
assert.deepEqual(customPeopleOutput.sources[5].filters, baselineFolder.sources[5].filters);

const customCollectionController = importFixture();
const customCollectionEdit = open(customCollectionController, "issue-78-source-collection-edit");
let customCollectionDraft = chooseMovieCollection(customCollectionEdit.draft, {
	id: 987654,
	name: "Deterministic replacement",
});
customCollectionDraft = updateSourceEditTitle(customCollectionDraft, "Custom replacement title");
customCollectionDraft = useSelectedMovieCollectionName(customCollectionDraft);
assert.equal(customCollectionDraft.title, "Deterministic replacement");

const cycledController = createBuilderController({
	idFactory: countingFactory("issue-78-cycle"),
	nuvioIdFactory: countingFactory("issue-78-cycle-nuvio"),
	initialProjectTitle: "Issue 78 cycle",
});
assert.equal(cycledController.importValue(baseline.value).ok, true);
const cycled = serialize(cycledController);
assert.deepEqual(cycled.value, baseline.value);
assert.equal(cycled.json, baseline.json);

console.log("Issue #78 source-edit fixture, automatic/default/custom titles, People sort, no-op, minimal patches, source order, preservation fields, and second cycle passed.");
