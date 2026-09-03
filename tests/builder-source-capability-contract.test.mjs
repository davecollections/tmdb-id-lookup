import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { AVAILABLE_SOURCE_MODES } from "../builder/src/source-add/index.js";
import { SOURCE_EDITORS } from "../builder/src/source-edit/index.js";
import { CREATION_OPTION_IDS, CREATION_OPTIONS } from "../builder/src/ui/creation-options.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const C = "configurable";
const F = "fixed";
const U = "unsupported";
const N = "not-applicable";
const CONTEXTS = Object.freeze(["add", "guided", "edit"]);
const CAPABILITIES = Object.freeze(["media", "sort", "filtersAdvanced", "roleCredit", "preview", "sourceName", "physicalIdentity"]);

function context(file, statuses, evidence) {
	return Object.freeze({ file, statuses: Object.freeze(statuses), evidence: Object.freeze(evidence) });
}

function assertSemanticEvidence(source, token, label) {
	assert.ok(source.includes(token), `${label} lost UI evidence ${token}`);
}

// This is deliberately a test-owned contract, not a second production registry. "Fixed" source names
// record today's generated-name behavior; whether those names should become editable remains a product decision.
const FAMILY_CAPABILITIES = Object.freeze({
	franchise: Object.freeze({
		ids: Object.freeze({ add: "tmdb-movie-franchise", guided: "franchises", edit: "movie-collection" }),
		add: context("builder/src/ui/AddSourceDialog.jsx", { media: F, sort: F, filtersAdvanced: U, roleCredit: N, preview: C, sourceName: C, physicalIdentity: C }, {
			preview: "<SourceTitlePreviewDialog", sourceName: 'id="add-source-title-input"', physicalIdentity: "selectedCollectionDetailsFromOutcome",
		}),
		guided: context("builder/src/ui/FranchiseSourceFlow.jsx", { media: F, sort: F, filtersAdvanced: U, roleCredit: N, preview: C, sourceName: F, physicalIdentity: C }, {
			preview: "<TitlesPreview", physicalIdentity: "data-tmdb-franchise-result",
		}),
		edit: context("builder/src/ui/SourceEditorDialog.jsx", { media: F, sort: F, filtersAdvanced: U, roleCredit: N, preview: C, sourceName: C, physicalIdentity: C }, {
			preview: "<SourceTitlePreviewDialog", sourceName: 'id="source-edit-title-input"', physicalIdentity: 'setStage("picker")',
		}),
	}),
	lists: Object.freeze({
		ids: Object.freeze({ add: "tmdb-lists", guided: "tmdb-lists", edit: "tmdb-list" }),
		add: context("builder/src/ui/TmdbListSourceFlow.jsx", { media: F, sort: F, filtersAdvanced: U, roleCredit: N, preview: C, sourceName: C, physicalIdentity: C }, {
			preview: "<SourceTitlePreviewDialog", sourceName: "tmdb-list-source-title", physicalIdentity: "parseTmdbListBatch",
		}),
		guided: context("builder/src/ui/TmdbListSourceFlow.jsx", { media: F, sort: F, filtersAdvanced: U, roleCredit: N, preview: C, sourceName: C, physicalIdentity: C }, {
			preview: "<SourceTitlePreviewDialog", sourceName: "tmdb-list-source-title", physicalIdentity: "parseTmdbListBatch",
		}),
		edit: context("builder/src/ui/SourceEditorDialog.jsx", { media: F, sort: F, filtersAdvanced: U, roleCredit: N, preview: C, sourceName: C, physicalIdentity: F }, {
			preview: "<SourceTitlePreviewDialog", sourceName: 'id="source-edit-title-input"',
		}),
	}),
	people: Object.freeze({
		ids: Object.freeze({ add: "tmdb-people", guided: "people", edit: "people" }),
		add: context("builder/src/ui/PeopleSourceFlow.jsx", { media: C, sort: C, filtersAdvanced: U, roleCredit: C, preview: C, sourceName: F, physicalIdentity: C }, {
			media: "<CombinationControls", sort: '<PeopleSourceSortChoices context={hierarchy ? "guided" : "add"}', roleCredit: "PEOPLE_SOURCE_COMBINATIONS", preview: "<SourceTitlePreviewDialog", physicalIdentity: "data-tmdb-person-result",
		}),
		guided: context("builder/src/ui/PeopleSourceFlow.jsx", { media: C, sort: C, filtersAdvanced: U, roleCredit: C, preview: C, sourceName: F, physicalIdentity: C }, {
			media: "<CombinationControls", sort: '<PeopleSourceSortChoices context={hierarchy ? "guided" : "add"}', roleCredit: "PEOPLE_SOURCE_COMBINATIONS", preview: "<PeopleTitlePreviewSurface", physicalIdentity: "data-tmdb-person-result",
		}),
		edit: context("builder/src/ui/SourceEditorDialog.jsx", { media: C, sort: C, filtersAdvanced: U, roleCredit: C, preview: C, sourceName: C, physicalIdentity: C }, {
			media: "<PeopleEditorFields", sort: 'name="people-edit-sort"', roleCredit: "<PeopleEditorFields", preview: "<SourceTitlePreviewDialog", sourceName: 'id="source-edit-title-input"', physicalIdentity: "choosePeopleSourceCombination",
		}),
	}),
	studio: Object.freeze({
		ids: Object.freeze({ add: "tmdb-studios", guided: "studios", edit: "studio" }),
		add: context("builder/src/ui/StudioSourceFlow.jsx", { media: C, sort: C, filtersAdvanced: U, roleCredit: N, preview: C, sourceName: F, physicalIdentity: C }, {
			media: "STUDIO_SOURCE_OPTIONS", sort: "<StudioSortChoices", preview: "<SourceTitlePreviewDialog", physicalIdentity: "data-tmdb-studio-result",
		}),
		guided: context("builder/src/ui/StudioHierarchyFlow.jsx", { media: C, sort: C, filtersAdvanced: U, roleCredit: N, preview: C, sourceName: F, physicalIdentity: C }, {
			media: "STUDIO_HIERARCHY_MEDIA_MODES", sort: "<StudioSortChoices", preview: "<NestedPreviewDialog", physicalIdentity: "data-tmdb-studio-result",
		}),
		edit: context("builder/src/ui/SourceEditorDialog.jsx", { media: F, sort: C, filtersAdvanced: U, roleCredit: N, preview: C, sourceName: C, physicalIdentity: F }, {
			sort: "<StudioSortChoices", preview: "<SourceTitlePreviewDialog", sourceName: 'id="source-edit-title-input"',
		}),
	}),
	network: Object.freeze({
		ids: Object.freeze({ add: "tmdb-networks", guided: "networks", edit: "network" }),
		add: context("builder/src/ui/NetworkSourceFlow.jsx", { media: F, sort: C, filtersAdvanced: U, roleCredit: N, preview: C, sourceName: F, physicalIdentity: C }, {
			sort: "<NetworkSortChoices", preview: "<SourceTitlePreviewDialog", physicalIdentity: "data-tmdb-network-result",
		}),
		guided: context("builder/src/ui/NetworkHierarchyFlow.jsx", { media: F, sort: C, filtersAdvanced: U, roleCredit: N, preview: C, sourceName: F, physicalIdentity: C }, {
			sort: "<NetworkSortChoices", preview: "<NestedPreviewDialog", physicalIdentity: "data-tmdb-network-result",
		}),
		edit: context("builder/src/ui/SourceEditorDialog.jsx", { media: F, sort: C, filtersAdvanced: U, roleCredit: N, preview: C, sourceName: C, physicalIdentity: F }, {
			sort: "<NetworkSortChoices", preview: "<SourceTitlePreviewDialog", sourceName: 'id="source-edit-title-input"',
		}),
	}),
	streaming: Object.freeze({
		ids: Object.freeze({ add: "tmdb-streaming-services", guided: "streaming-services", edit: "streaming" }),
		add: context("builder/src/ui/StreamingSourceFlow.jsx", { media: C, sort: C, filtersAdvanced: C, roleCredit: N, preview: C, sourceName: C, physicalIdentity: C }, {
			media: "STREAMING_MEDIA_CHOICES", sort: "STREAMING_SORT_OPTIONS", filtersAdvanced: "<StreamingRegionStep", preview: "<SourceTitlePreviewDialog", sourceName: ">Source name</", physicalIdentity: "data-streaming-provider",
		}),
		guided: context("builder/src/ui/StreamingHierarchyFlow.jsx", { media: C, sort: C, filtersAdvanced: C, roleCredit: N, preview: C, sourceName: F, physicalIdentity: C }, {
			media: "STREAMING_MEDIA_CHOICES", sort: "STREAMING_SORT_OPTIONS", filtersAdvanced: "<StreamingRegionStep", preview: "<StreamingTitlePreview", physicalIdentity: "data-streaming-provider",
		}),
		edit: context("builder/src/ui/SourceEditorDialog.jsx", { media: F, sort: C, filtersAdvanced: F, roleCredit: N, preview: C, sourceName: C, physicalIdentity: F }, {
			sort: 'name="streaming-edit-sort"', preview: "<SourceTitlePreviewDialog", sourceName: 'id="source-edit-title-input"',
		}),
	}),
	genre: Object.freeze({
		ids: Object.freeze({ add: "tmdb-genres", guided: "genres", edit: "genre" }),
		add: context("builder/src/ui/GenreSourceFlow.jsx", { media: C, sort: C, filtersAdvanced: C, roleCredit: N, preview: C, sourceName: F, physicalIdentity: C }, {
			media: "GENRE_MEDIA_CHOICES", sort: "GENRE_SORT_OPTIONS", filtersAdvanced: "<GenreAdvancedOptions", preview: "<SourceTitlePreviewDialog", physicalIdentity: "<GenreBrowseStep",
		}),
		guided: context("builder/src/ui/GenreHierarchyFlow.jsx", { media: C, sort: C, filtersAdvanced: C, roleCredit: N, preview: C, sourceName: F, physicalIdentity: C }, {
			media: "GENRE_MEDIA_CHOICES", sort: "GENRE_SORT_OPTIONS", filtersAdvanced: "<GenreAdvancedOptions", preview: "<NestedPreviewDialog", physicalIdentity: "data-genre-name",
		}),
		edit: context("builder/src/ui/SourceEditorDialog.jsx", { media: F, sort: C, filtersAdvanced: C, roleCredit: N, preview: C, sourceName: C, physicalIdentity: F }, {
			sort: 'name="genre-edit-sort"', filtersAdvanced: "<GenreAdvancedOptions", preview: "<SourceTitlePreviewDialog", sourceName: 'id="source-edit-title-input"',
		}),
	}),
	decade: Object.freeze({
		ids: Object.freeze({ add: "tmdb-decade", guided: "decades", edit: "decade" }),
		add: context("builder/src/ui/DecadeSourceFlow.jsx", { media: C, sort: C, filtersAdvanced: C, roleCredit: N, preview: C, sourceName: F, physicalIdentity: C }, {
			media: 'data-decade-source-control": "media"', sort: 'data-decade-source-control": "sort"', filtersAdvanced: "<DecadesAdvancedOptions", preview: "<NestedPreviewDialog", physicalIdentity: 'data-decade-source-control": "decade"',
		}),
		guided: context("builder/src/ui/CreationDialog.jsx", { media: C, sort: C, filtersAdvanced: C, roleCredit: N, preview: C, sourceName: F, physicalIdentity: C }, {
			media: "DECADES_MEDIA_MODES", sort: "DECADES_SORT_OPTIONS", filtersAdvanced: "<DecadesAdvancedOptions", preview: "<NestedPreviewDialog", physicalIdentity: "data-decade-preset",
		}),
		edit: context("builder/src/ui/SourceEditorDialog.jsx", { media: F, sort: C, filtersAdvanced: C, roleCredit: N, preview: C, sourceName: C, physicalIdentity: F }, {
			sort: 'name="decade-edit-sort"', filtersAdvanced: "<DecadesAdvancedOptions", preview: "<SourceTitlePreviewDialog", sourceName: 'id="source-edit-title-input"',
		}),
	}),
});

test("all eight native source families have a complete cross-context capability contract backed by semantic UI evidence", () => {
	assert.deepEqual(Object.keys(FAMILY_CAPABILITIES), ["franchise", "lists", "people", "studio", "network", "streaming", "genre", "decade"]);
	const usedStatuses = new Set();
	for (const [family, definition] of Object.entries(FAMILY_CAPABILITIES)) {
		for (const contextId of CONTEXTS) {
			const entry = definition[contextId];
			assert.ok(entry, `${family}.${contextId}`);
			assert.deepEqual(Object.keys(entry.statuses), CAPABILITIES, `${family}.${contextId} capability order/completeness`);
			const source = fs.readFileSync(path.join(rootDir, entry.file), "utf8");
			for (const capability of CAPABILITIES) {
				const status = entry.statuses[capability];
				usedStatuses.add(status);
				assert.ok([C, F, U, N].includes(status), `${family}.${contextId}.${capability} status`);
				if (status === C) {
					const token = entry.evidence[capability];
					assert.equal(typeof token, "string", `${family}.${contextId}.${capability} needs semantic evidence`);
					assertSemanticEvidence(source, token, `${family}.${contextId}.${capability}`);
				} else {
					assert.equal(entry.evidence[capability], undefined, `${family}.${contextId}.${capability} must not claim a configurable control`);
				}
			}
		}
	}
	assert.deepEqual([...usedStatuses].sort(), [C, F, N, U].sort());
});

test("Add, guided creation, and Source Edit registries cover exactly the contracted native families", () => {
	const expectedAdd = Object.values(FAMILY_CAPABILITIES).map((family) => family.ids.add).sort();
	const expectedGuided = Object.values(FAMILY_CAPABILITIES).map((family) => family.ids.guided).sort();
	const expectedEdit = Object.values(FAMILY_CAPABILITIES).map((family) => family.ids.edit).sort();
	assert.deepEqual(AVAILABLE_SOURCE_MODES.map((mode) => mode.id).sort(), expectedAdd);
	assert.deepEqual(CREATION_OPTIONS.filter((option) => option.id !== CREATION_OPTION_IDS.BLANK).map((option) => option.id).sort(), expectedGuided);
	assert.deepEqual(SOURCE_EDITORS.map((editor) => editor.id).sort(), expectedEdit);
});

test("People Sort is configurable in all three contexts and Add cannot regress to a hierarchy-only gate", () => {
	assert.equal(FAMILY_CAPABILITIES.people.add.statuses.sort, C);
	assert.equal(FAMILY_CAPABILITIES.people.guided.statuses.sort, C);
	assert.equal(FAMILY_CAPABILITIES.people.edit.statuses.sort, C);
	const source = fs.readFileSync(path.join(rootDir, FAMILY_CAPABILITIES.people.add.file), "utf8");
	assert.match(source, /\{hierarchy \|\| context === "folder" \? <PeopleSourceSortChoices context=\{hierarchy \? "guided" : "add"\}/);
	assert.doesNotMatch(source, /\{hierarchy \? <PeopleSourceSortChoices/);
});

test("the capability evidence guard fails when a supported control is omitted", () => {
	const entry = FAMILY_CAPABILITIES.people.add;
	const token = entry.evidence.sort;
	const source = fs.readFileSync(path.join(rootDir, entry.file), "utf8");
	assert.throws(
		() => assertSemanticEvidence(source.replace(token, ""), token, "people.add.sort"),
		/lost UI evidence/,
	);
});
