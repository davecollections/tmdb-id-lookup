import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createElement } from "../builder/node_modules/react/index.js";
import { renderToStaticMarkup } from "../builder/node_modules/react-dom/server.js";
import { createServer } from "../builder/node_modules/vite/dist/node/index.js";
import {
	createStreamingSelectionState,
	selectedStreamingProviders,
	streamingSelectionNotice,
	toggleSelectedStreamingProvider,
} from "../builder/src/source-add/index.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(rootDir, relativePath), "utf8");
const flow = read("builder/src/ui/StreamingHierarchyFlow.jsx");
const catalogue = read("builder/src/source-add/streaming-catalogue.js");
const previewProvider = read("builder/src/source-add/tmdb-streaming-preview-provider.js");
const planner = read("builder/src/source-add/streaming-plan.js");
const selectionSource = read("builder/src/source-add/streaming-selection.js");
const sourceNames = read("builder/src/source-add/streaming-source.js");
const sourceFlow = read("builder/src/ui/StreamingSourceFlow.jsx");
const creationOptions = read("builder/src/ui/creation-options.js");
const dialog = read("builder/src/ui/CreationDialog.jsx");
const workspace = read("builder/src/ui/BuilderWorkspace.jsx");
const posterGrid = read("builder/src/ui/PosterOnlyPreviewGrid.jsx");
const styles = read("builder/src/styles.css");

const vite = await createServer({
	root: path.join(rootDir, "builder"),
	appType: "custom",
	logLevel: "silent",
	server: { middlewareMode: true },
});
const { CreationDialog } = await vite.ssrLoadModule("/src/ui/CreationDialog.jsx");
const { buildStreamingCollectionDisplayContext, NewCollectionElsewhereEvidence, StreamingDestinationChooser, StreamingHierarchyFlow, StreamingRunSummary } = await vite.ssrLoadModule("/src/ui/StreamingHierarchyFlow.jsx");
after(() => vite.close());

function baseCreationProps(scope) {
	return {
		scope,
		project: { nodeType: "project", internalId: "project-1", collections: [] },
		projectRevision: 0,
		destinationCollectionInternalId: scope === "new-folder" ? "collection-1" : null,
		destinationCollectionTitle: scope === "new-folder" ? "Television" : null,
		currentYear: 2026,
		onCancel() {},
		onCreateBlank() {},
	};
}

function provider(id) {
	return {
		id,
		name: `Service ${String(id).padStart(3, "0")}`,
		searchName: `service ${String(id).padStart(3, "0")}`,
		logoPath: null,
		moviePriorities: { AU: id },
		tvPriorities: { AU: id },
	};
}

test("Streaming Services is the eighth scope-aware hierarchy family after Genres", () => {
	const expected = ["blank", "decades", "people", "franchises", "studios", "networks", "genres", "streaming-services"];
	for (const scope of ["new-collection", "new-folder"]) {
		const markup = renderToStaticMarkup(createElement(CreationDialog, baseCreationProps(scope)));
		assert.deepEqual([...markup.matchAll(/data-creation-option="([^"]+)"/g)].map((match) => match[1]), expected);
		assert.ok(markup.includes("<strong>Streaming Services</strong>"));
	}
	assert.match(creationOptions, /STREAMING_SERVICES:\s*"streaming-services"/);
	assert.match(creationOptions, /id:\s*CREATION_OPTION_IDS\.STREAMING_SERVICES,[\s\S]*scopes:\s*BOTH_SCOPES/);
	assert.match(dialog, /CREATION_OPTION_IDS\.STREAMING_SERVICES/);
	assert.match(dialog, /<StreamingHierarchyFlow/);
});

test("server rendering is request-free and starts on the unfocused region stage", () => {
	const calls = { catalogue: 0, preview: 0, apply: 0 };
	const markup = renderToStaticMarkup(createElement(StreamingHierarchyFlow, {
		...baseCreationProps("new-collection"),
		catalogueProvider: { loadCatalogue() { calls.catalogue += 1; } },
		previewProvider: { getStreamingPreview() { calls.preview += 1; } },
		onBack() {},
		onApply() { calls.apply += 1; },
	}));
	assert.deepEqual(calls, { catalogue: 0, preview: 0, apply: 0 });
	assert.ok(markup.includes('data-streaming-hierarchy-stage="regions"'));
	assert.ok(markup.includes("Loading Streaming regions and providers"));
	assert.equal(markup.includes("autofocus"), false);
	assert.doesNotMatch(flow, /autoFocus/);
});

test("the flow uses Choose, Configure, and Review & Appearance with one global media and Sort choice", () => {
	assert.match(flow, /Step 1 · Choose/);
	assert.match(flow, /Choose Streaming services/);
	assert.match(flow, /Step 2/);
	assert.match(flow, /Configure Streaming services/);
	assert.match(flow, /Step 3/);
	assert.match(flow, /Review &amp; Appearance/);
	assert.equal((flow.match(/name="streaming-hierarchy-media"/g) ?? []).length, 1);
	assert.equal((flow.match(/name="streaming-hierarchy-sort"/g) ?? []).length, 1);
	assert.match(flow, /regions\.length > 1 \? <SemanticSortChoices[^>]+name="streaming-hierarchy-grouping"/);
	assert.match(flow, /DEFAULT_STREAMING_HIERARCHY_GROUPING_MODE/);
});

test("the Region step uses plain user-facing copy while preserving the shared region browser", () => {
	assert.match(sourceFlow, /heading = "Choose regions"/);
	assert.doesNotMatch(sourceFlow, /Streaming service · Region/);
	assert.match(flow, /heading="Choose regions"/);
	assert.match(flow, /Services shown next must support the media you choose in every region/);
	assert.match(sourceFlow, /Search regions/);
	assert.match(sourceFlow, />Common</);
	assert.match(sourceFlow, />A–Z</);
});

test("Configure and Review carry compact run-level Region, Media, Services, Sort, and Grouping context", () => {
	assert.match(flow, /function StreamingRunSummary/);
	assert.match(flow, /<StreamingRunSummary regions=\{regions\} mediaChoice=\{mediaChoice\}/);
	assert.match(flow, /aria-label=\{review \? "Streaming configuration summary" : "Streaming run context"\}/);
	for (const label of ["Regions", "Media", "Services", "Sort", "Grouping"]) assert.ok(flow.includes(`<strong>${label}</strong>`), label);
	assert.match(flow, /regions\.length <= 3/);
	assert.match(flow, /regions\.length} regions selected/);
	assert.match(flow, /providers\.length <= 5/);
	assert.match(flow, /services selected/);
	assert.match(flow, /disclosureLabel="View selected services"/);
	assert.equal((flow.match(/Selected services · \{providers\.length\}/g) ?? []).length, 1);
});

test("run summaries render direct small context and disclosure-backed large Region and service selections", () => {
	const smallProviders = [provider(1), provider(2)];
	const small = renderToStaticMarkup(createElement(StreamingRunSummary, { regions: [{ code: "AU", name: "Australia" }, { code: "US", name: "United States" }], mediaChoice: "both", providers: smallProviders, sortOptionId: "popular", groupingMode: "group-by-service", review: true }));
	assert.match(small, /Australia \(AU\), United States \(US\)/);
	assert.match(small, /Service 001, Service 002/);
	assert.doesNotMatch(small, /services selected|View selected services/);

	const largeProviders = Array.from({ length: 12 }, (_, index) => provider(index + 1));
	const largeRegions = Array.from({ length: 6 }, (_, index) => ({ code: `A${index}`, name: `Region ${index + 1}` }));
	const large = renderToStaticMarkup(createElement(StreamingRunSummary, { regions: largeRegions, mediaChoice: "movies", providers: largeProviders, sortOptionId: "popular", groupingMode: "separate-by-region", review: true }));
	assert.match(large, /6 regions selected/);
	assert.match(large, /12 services selected/);
	assert.match(large, /View selected services/);
	assert.equal((large.match(/TMDB /g) ?? []).length, 12);
});

test("destination chooser renders ranked existing collections plus the recoverable New Collection choice without auto-selection", () => {
	const candidates = [
		{ collectionInternalId: "collection-high", collectionTitle: "Streaming Services", titleHidden: false, matchingSourceCount: 4, proposedSourceCount: 8, complete: false, conflictCount: 0, plan: { counts: { newSourceCount: 4 } } },
		{ collectionInternalId: "collection-mid", collectionTitle: "My Streaming", titleHidden: false, matchingSourceCount: 2, proposedSourceCount: 8, complete: false, conflictCount: 0, plan: { counts: { newSourceCount: 6 } } },
		{ collectionInternalId: "collection-low", collectionTitle: "Family TV", titleHidden: false, matchingSourceCount: 1, proposedSourceCount: 8, complete: false, conflictCount: 0, plan: { counts: { newSourceCount: 7 } } },
	];
	const initial = renderToStaticMarkup(createElement(StreamingDestinationChooser, { candidates, selectedDestination: null, elsewhereEvidence: { overlap: "partial", proposedSourceCount: 8 }, onChange() {} }));
	assert.ok(initial.indexOf("Streaming Services") < initial.indexOf("My Streaming"));
	assert.ok(initial.indexOf("My Streaming") < initial.indexOf("Family TV"));
	assert.match(initial, /4 of 8 sources already here · 4 will be added/);
	assert.match(initial, /Create new collection instead/);
	assert.match(initial, /Create all 8 sources in a separate collection/);
	assert.doesNotMatch(initial, /checked=""/);
	const selected = renderToStaticMarkup(createElement(StreamingDestinationChooser, { candidates, selectedDestination: "collection-mid", elsewhereEvidence: { overlap: "partial", proposedSourceCount: 8 }, onChange() {} }));
	assert.match(selected, /checked="" value="existing:collection-mid"/);
	assert.equal((selected.match(/checked=""/g) ?? []).length, 1);
});

test("zero-overlap affinity destinations explain why they are offered without claiming an exact match", () => {
	const project = { collections: [
		{ internalId: "collection-exact", editable: { title: "Exact destination" }, folders: [{ sources: [{}] }] },
		{ internalId: "collection-affinity-a", editable: { title: "Dave's TV" }, folders: [{ sources: [{}, {}, {}] }, { sources: [{}] }] },
		{ internalId: "collection-affinity-b", editable: { title: "Watch Now" }, folders: [{ sources: [{}, {}] }] },
	] };
	const candidates = [
		{ collectionInternalId: "collection-exact", collectionTitle: "Exact destination", titleHidden: false, matchingSourceCount: 1, streamingAffinity: true, proposedSourceCount: 2, complete: false, conflictCount: 0, plan: { counts: { newSourceCount: 1 } } },
		{ collectionInternalId: "collection-affinity-a", collectionTitle: "Dave's TV", titleHidden: false, matchingSourceCount: 0, streamingAffinity: true, proposedSourceCount: 2, complete: false, conflictCount: 0, plan: { counts: { newSourceCount: 2 } } },
		{ collectionInternalId: "collection-affinity-b", collectionTitle: "Watch Now", titleHidden: false, matchingSourceCount: 0, streamingAffinity: true, proposedSourceCount: 2, complete: false, conflictCount: 0, plan: { counts: { newSourceCount: 2 } } },
	];
	const markup = renderToStaticMarkup(createElement(StreamingDestinationChooser, { candidates, selectedDestination: null, elsewhereEvidence: { overlap: "partial", proposedSourceCount: 2 }, collectionDisplayContext: buildStreamingCollectionDisplayContext(project), onChange() {} }));
	assert.ok(markup.indexOf("Exact destination") < markup.indexOf("Dave&#x27;s TV"));
	assert.ok(markup.indexOf("Dave&#x27;s TV") < markup.indexOf("Watch Now"));
	assert.equal((markup.match(/Existing Streaming collection/g) ?? []).length, 2);
	assert.equal((markup.match(/None of the selected sources are here yet · all 2 sources will be added/g) ?? []).length, 2);
	assert.match(markup, /1 of 2 sources already here · 1 will be added/);
	assert.match(markup, /Currently: 2 folders · 4 sources/);
	assert.match(markup, /Currently: 1 folder · 2 sources/);
	assert.match(markup, /Create new collection instead/);
	assert.doesNotMatch(markup, /checked=""/);
	assert.match(planner, /hasStreamingCollectionAffinity/);
	assert.match(planner, /\(!hasRelevantPlacement && !streamingAffinity\)/);
});

test("complete destination copy makes use-existing obvious while retaining explicit duplicate-new choice", () => {
	const markup = renderToStaticMarkup(createElement(StreamingDestinationChooser, {
		candidates: [{ collectionInternalId: "collection-complete", collectionTitle: "Streaming Services", titleHidden: false, matchingSourceCount: 2, proposedSourceCount: 2, complete: true, conflictCount: 0, plan: { counts: { newSourceCount: 0 } } }],
		selectedDestination: null,
		elsewhereEvidence: { overlap: "complete", proposedSourceCount: 2 },
		onChange() {},
	}));
	assert.match(markup, /All 2 selected sources already exist here · nothing to add/);
	assert.match(markup, /Create new collection instead/);
	assert.match(markup, /Create all 2 sources in a separate collection/);
});

test("duplicate Collection titles use stable project-order labels, restrained contents, and exact destination deltas", () => {
	const project = {
		collections: [
			{ internalId: "collection-a", editable: { title: "Streaming Services" }, folders: [{ internalId: "a-1", sources: [{}, {}] }, { internalId: "a-2", sources: [{}, {}] }] },
			{ internalId: "collection-b", editable: { title: "Streaming Services" }, folders: [{ internalId: "b-1", sources: [{}] }] },
			{ internalId: "collection-c", editable: { title: "Streaming Services" }, folders: [{ internalId: "c-1", sources: [{}, {}, {}] }] },
		],
	};
	const collectionDisplayContext = buildStreamingCollectionDisplayContext(project);
	assert.deepEqual(Object.fromEntries(Object.entries(collectionDisplayContext).map(([id, context]) => [id, context.label])), {
		"collection-a": "Streaming Services · Collection 1",
		"collection-b": "Streaming Services · Collection 2",
		"collection-c": "Streaming Services · Collection 3",
	});
	const reorderedContext = buildStreamingCollectionDisplayContext({ collections: [project.collections[2], project.collections[0], project.collections[1]] });
	assert.equal(reorderedContext["collection-c"].label, "Streaming Services · Collection 1");
	assert.equal(reorderedContext["collection-a"].label, "Streaming Services · Collection 2");
	assert.equal(reorderedContext["collection-b"].label, "Streaming Services · Collection 3");
	const candidates = [
		{ collectionInternalId: "collection-a", collectionTitle: "Streaming Services", titleHidden: false, matchingSourceCount: 4, proposedSourceCount: 4, complete: true, conflictCount: 0, plan: { counts: { newSourceCount: 0 } } },
		{ collectionInternalId: "collection-b", collectionTitle: "Streaming Services", titleHidden: false, matchingSourceCount: 1, proposedSourceCount: 4, complete: false, conflictCount: 0, plan: { counts: { newSourceCount: 3 } } },
		{ collectionInternalId: "collection-c", collectionTitle: "Streaming Services", titleHidden: false, matchingSourceCount: 2, proposedSourceCount: 4, complete: false, conflictCount: 0, plan: { counts: { newSourceCount: 2 } } },
	];
	const markup = renderToStaticMarkup(createElement(StreamingDestinationChooser, { candidates, selectedDestination: null, elsewhereEvidence: { overlap: "complete", proposedSourceCount: 4 }, collectionDisplayContext, onChange() {} }));
	for (const label of ["Streaming Services · Collection 1", "Streaming Services · Collection 2", "Streaming Services · Collection 3"]) assert.match(markup, new RegExp(label));
	assert.match(markup, /All 4 selected sources already exist here · nothing to add/);
	assert.match(markup, /1 of 4 sources already here · 3 will be added/);
	assert.match(markup, /2 of 4 sources already here · 2 will be added/);
	assert.match(markup, /Currently: 2 folders · 4 sources/);
	assert.match(markup, /Currently: 1 folder · 1 source/);
	assert.match(markup, /Currently: 1 folder · 3 sources/);
});

test("affinity-only destination copy keeps singular source and plural content counts grammatical", () => {
	const project = { collections: [{ internalId: "collection-affinity", editable: { title: "Watch Now" }, folders: [{ sources: [{}, {}] }, { sources: [{}, {}, {}] }, { sources: [{}, {}, {}] }] }] };
	const markup = renderToStaticMarkup(createElement(StreamingDestinationChooser, {
		candidates: [{ collectionInternalId: "collection-affinity", collectionTitle: "Watch Now", titleHidden: false, matchingSourceCount: 0, streamingAffinity: true, proposedSourceCount: 1, complete: false, conflictCount: 0, plan: { counts: { newSourceCount: 1 } } }],
		selectedDestination: null,
		elsewhereEvidence: { overlap: "none", proposedSourceCount: 1 },
		collectionDisplayContext: buildStreamingCollectionDisplayContext(project),
		onChange() {},
	}));
	assert.match(markup, /None of the selected sources are here yet · all 1 source will be added/);
	assert.match(markup, /Currently: 3 folders · 8 sources/);
});

test("unique Collection titles stay clean and matching-source disclosures reuse the exact display label", () => {
	const duplicateProject = { collections: [
		{ internalId: "collection-a", editable: { title: "Streaming Services" }, folders: [] },
		{ internalId: "collection-b", editable: { title: "Streaming Services" }, folders: [] },
	] };
	const duplicateContext = buildStreamingCollectionDisplayContext(duplicateProject);
	const evidence = {
		overlap: "partial",
		matchedSourceCount: 1,
		proposedSourceCount: 4,
		providerMatches: [{
			provider: { id: 8, name: "Netflix" },
			matchedSourceCount: 1,
			sources: [{ title: "Movies (AU)" }],
			occurrences: [{ collectionInternalId: "collection-a", collectionTitle: "Streaming Services", folderInternalId: "folder-a", folderTitle: "Netflix" }],
		}],
	};
	const duplicateMarkup = renderToStaticMarkup(createElement(NewCollectionElsewhereEvidence, { evidence, choicePending: true, collectionDisplayContext: duplicateContext }));
	assert.match(duplicateMarkup, /Netflix · in Streaming Services · Collection 1/);

	const uniqueContext = buildStreamingCollectionDisplayContext({ collections: [duplicateProject.collections[0]] });
	assert.equal(uniqueContext["collection-a"].label, "Streaming Services");
	const uniqueMarkup = renderToStaticMarkup(createElement(NewCollectionElsewhereEvidence, { evidence, choicePending: true, collectionDisplayContext: uniqueContext }));
	assert.match(uniqueMarkup, /Netflix · in Streaming Services/);
	assert.doesNotMatch(uniqueMarkup, /Streaming Services · Collection 1/);
});

test("Review distinguishes full New Collection creation from the actual existing-collection delta", () => {
	assert.match(flow, /existingScope \? "What will change" : "What will be created"/);
	assert.match(flow, /plan\.counts\.existingFolderAdditionCount/);
	assert.match(flow, /Existing folder\{plan\.counts\.existingFolderAdditionCount/);
	assert.match(flow, /plan\.counts\.newFolderCount/);
	assert.match(flow, /plan\.counts\.newSourceCount/);
	assert.match(flow, /sourceCountLabel\(missingCount, "will be added"\)/);
	assert.match(flow, /sourceCountLabel\(missingCount, "will be created"\)/);
	assert.match(flow, /Collection settings stay unchanged/);
	assert.doesNotMatch(flow, /Destination placement|Parent presentation is inherited/);
});

test("New Collection duplicate evidence directly reuses ordinary Streaming matching and requires confirmation only for complete overlap", () => {
	assert.match(planner, /inspectStreamingSourceDuplicates\(project, null, desired\.flatMap/);
	assert.match(planner, /inspectStreamingSourceDuplicates\(project, null, proposedDrafts\)/);
	assert.match(planner, /createStreamingHierarchyPlan\(project, existingDestinationOptions/);
	assert.doesNotMatch(planner, /function occurrencesForIdentity/);
	assert.match(flow, /Some selected sources already exist elsewhere/);
	assert.match(flow, /All selected sources already exist elsewhere/);
	assert.match(flow, /evidence\.matchedSourceCount} of \{evidence\.proposedSourceCount}/);
	assert.match(flow, /evidence\.overlap === "complete"/);
	assert.match(flow, /Create duplicate collection/);
	assert.match(flow, /if \(activeScope === "new-collection" && planResult\.plan\.elsewhereEvidence\?\.overlap === "complete"\)/);
	assert.match(flow, /Streaming matches changed\. Review the refreshed duplicate evidence/);
	assert.doesNotMatch(flow, /This exact hierarchy already exists/);
});

test("New Collection Review requires explicit destination intent and then renders only the active plan contract", () => {
	assert.match(flow, /function StreamingDestinationChooser/);
	assert.match(flow, /Where should this go\?/);
	assert.match(flow, /Choose an existing collection to add only what is missing, or create a new collection instead/);
	assert.match(flow, /name="streaming-hierarchy-destination"/);
	assert.match(flow, /selectedDestination === null/);
	assert.match(flow, /destinationChoiceRequired \? "Choose a destination"/);
	assert.match(flow, /selectedCandidate[\s\S]*activeScope/);
	assert.match(flow, /originalScope=\{scope\} activeScope=\{activeScope\}/);
	assert.match(flow, /activeScope === "new-collection" \?/);
	assert.match(flow, /Nothing to add/);
	assert.match(flow, /No project changes are needed/);
	assert.match(flow, /routedExistingNoChanges \? "Close"/);
	assert.match(flow, /onCancel\(\);[\s\S]*activeScope === "new-folder"/);
	assert.doesNotMatch(flow, /split.*collection|collections\.map\([^)]*onApply/iu);
});

test("Folder naming is collapsed, stable-keyed, validated, and limited to new folders", () => {
	assert.match(flow, /<details className="streaming-folder-names"/);
	assert.match(flow, /Keep the generated names or customise new folders/);
	assert.match(flow, /folders=\{plan\.newFolders\}/g);
	assert.match(flow, /folder\.key\.replaceAll/);
	assert.match(flow, /isValidVisibleNuvioTitle/);
	assert.match(flow, /Use default name/);
	assert.doesNotMatch(flow, /Display title for this new folder/);
	assert.match(flow, /Keep the generated names or customise new folders/);
	assert.match(flow, /aria-describedby=\{`\$\{inputId\}-error`\}/);
	assert.doesNotMatch(flow, /Source names and Streaming identity stay unchanged/);
	assert.match(flow, /setFolderTitleDrafts\(\(current\) => \(\{ \.\.\.current, \[key\]: title \}\)\)/);
	assert.match(flow, /currentKeys\.has\(key\)/);
	assert.match(flow, /activeNewFolderKeys\.has\(key\)/);
	assert.match(flow, /destinationResult\.logicalFolderKeys/);
	assert.match(planner, /folderTitleOverrides/);
	assert.match(planner, /newFolderKeys\.has\(key\)/);
	assert.match(styles, /\.streaming-folder-names/);
	assert.doesNotMatch(styles, /\.streaming-folder-name-list[^}]*overflow-y/);
});

test("Streaming Region cards retain border, surface, tick, and semantics without the redundant left rail", () => {
	assert.match(sourceFlow, /data-selected=\{selected \? "true" : "false"\} aria-pressed=\{selected\}/);
	assert.match(sourceFlow, /streaming-region-selected-mark/);
	assert.match(styles, /\.streaming-region-result\[data-selected="true"\]\s*\{\s*background:/);
	assert.doesNotMatch(styles, /\.streaming-region-result\[data-selected="true"\][^}]*box-shadow:\s*inset/);
	assert.match(styles, /\.streaming-region-result:hover,[\s\S]*border-color:/);
});

test("region and media changes reconcile ordered provider selection through the catalogue eligibility helper", () => {
	const regionHandler = flow.slice(flow.indexOf("function toggleRegion(region)"), flow.indexOf("function changeMedia(mediaChoice)"));
	const mediaHandler = flow.slice(flow.indexOf("function changeMedia(mediaChoice)"), flow.indexOf("function removeProvider(providerId)"));
	for (const handler of [regionHandler, mediaHandler]) {
		assert.match(handler, /reconcileStreamingSelection/);
		assert.doesNotMatch(handler, /createStreamingSelectionState|setProviderQuery/);
	}
	assert.match(selectionSource, /eligibleStreamingProvidersForMedia\(providers, regionCodes, mediaChoice\)/);
	assert.match(selectionSource, /if \(removedProviders\.length === 0\)[\s\S]*\{ state, retainedProviders/);
	assert.match(flow, /data-streaming-selection-reconciliation="true" role="status"/);
	assert.match(flow, /not support \$\{mediaChoiceLabel\(mediaChoice\)\} in every selected region/);
	assert.match(flow, /not available for the selected media in every region/);
	assert.match(flow, /searchStreamingProviders\([^\n]+\{ regionCodes, mediaChoice: options\.mediaChoice \}\)/);
	assert.match(flow, /browseStreamingProviders\([^\n]+\{ mode: effectiveProviderBrowseMode, regionCodes, mediaChoice: options\.mediaChoice \}\)/);
	assert.match(catalogue, /eligibleStreamingProvidersForMedia/);
	assert.match(catalogue, /const availability = codes\.map\(\(code\) => streamingProviderAvailability\(provider, code\)\)/);
	assert.match(catalogue, /const movies = availability\.every\(\(entry\) => entry\.movies\)/);
	assert.match(catalogue, /const series = availability\.every\(\(entry\) => entry\.series\)/);
});

test("ordered provider selection stays uncapped at 20, 50, and 100 services", () => {
	for (const count of [20, 50, 100]) {
		let state = createStreamingSelectionState();
		for (let id = 1; id <= count; id += 1) state = toggleSelectedStreamingProvider(state, provider(id)).state;
		assert.deepEqual(selectedStreamingProviders(state).map((entry) => entry.id), Array.from({ length: count }, (_, index) => index + 1));
		assert.deepEqual(streamingSelectionNotice(state), { visible: count >= 20, count, threshold: 20 });
	}
	assert.doesNotMatch(selectionSource, /maximum|maxSelected|hard.?cap|slice\(0/iu);
	assert.doesNotMatch(flow, /pagination|pageSize|slice\(0/iu);
});

test("Preview is exact, lazy, conditional, bounded, cache-backed, focus-safe, and non-mutating", () => {
	assert.equal((flow.match(/previewProvider\.getStreamingPreview/g) ?? []).length, 1);
	assert.match(flow, /onClick=\{\(event\) => onPreview\(provider, event\.currentTarget\)\}/);
	assert.doesNotMatch(flow, /prefetch|Promise\.all\([^)]*getStreamingPreview/iu);
	assert.match(flow, /regions\.length > 1 \?/);
	assert.match(flow, /mediaTypes\.length > 1 \?/);
	assert.match(flow, /role="tablist" aria-label="Preview region"/);
	assert.match(flow, /role="tablist" aria-label="Preview media"/);
	assert.match(flow, /<PosterOnlyPreviewGrid[^>]+limit=\{10\}/);
	assert.match(flow, /previewCoordinatorRef\.current\.cancel/);
	assert.match(flow, /queueMicrotask\(\(\) => focusElementWithoutScroll\(trigger\)\)/);
	assert.match(previewProvider, /createTmdbDiscoverPreviewRequester/);
	assert.match(previewProvider, /cacheTtlMs = TMDB_STREAMING_PREVIEW_CACHE_TTL_MS/);
	assert.match(previewProvider, /cacheMaxEntries = TMDB_STREAMING_PREVIEW_CACHE_MAX_ENTRIES/);
	assert.match(previewProvider, /include_adult:\s*"false"/);
	assert.match(posterGrid, /slice\(0, limit\)/);
});

test("naming contexts remain family-local while temporary artwork warnings stay out of Review", () => {
	for (const context of ["standalone", "grouped-by-service", "separate-by-region"]) assert.ok(sourceNames.includes(context));
	assert.match(planner, /const nameContext = configuration\.groupingMode === "separate-by-region"[\s\S]*STREAMING_SOURCE_NAME_CONTEXTS\.SEPARATE_BY_REGION[\s\S]*STREAMING_SOURCE_NAME_CONTEXTS\.GROUPED_BY_SERVICE/);
	const folderEditable = planner.slice(planner.indexOf("function folderEditable"), planner.indexOf("function collectionEditable"));
	assert.match(folderEditable, /title:/);
	assert.match(folderEditable, /tileShape:/);
	assert.match(folderEditable, /hideTitle:/);
	assert.doesNotMatch(folderEditable, /coverImageUrl|heroBackdropUrl|focusGifUrl|titleLogoUrl/);
	assert.doesNotMatch(flow, /Generated folders are text-only/);
	assert.doesNotMatch(flow, /Provider logos are used only while choosing and reviewing services/);
	assert.doesNotMatch(flow, /artwork is unavailable|artwork will be added later/iu);
	assert.doesNotMatch(flow, /FolderShapeChoices|folderArtwork|coverImageUrl|heroBackdropUrl|focusGifUrl/);
});

test("destination copy is user-facing and contains no planner-oriented phrases", () => {
	assert.doesNotMatch(flow, /sources remain to be planned|complete hierarchy here|planned sources/iu);
	assert.ok(flow.includes("${candidate.matchingSourceCount} of ${candidate.proposedSourceCount} sources already here"));
	assert.match(flow, /will be added/);
	assert.match(flow, /Create new collection instead/);
});

test("the hierarchy shell owns one scroll surface across every required viewport seam", () => {
	const widths = [360, 384, 393, 402, 412, 899, 900, 901, 1280];
	assert.deepEqual(widths.filter((width) => width <= 412), [360, 384, 393, 402, 412]);
	assert.deepEqual(widths.filter((width) => width >= 900), [900, 901, 1280]);
	assert.equal((flow.match(/className="add-source-scroll"/g) ?? []).length, 1);
	assert.equal((flow.match(/<footer className="add-source-actions"/g) ?? []).length, 1);
	assert.match(styles, /@media \(max-width: 899\.98px\)[\s\S]*\.add-source-dialog/);
	assert.match(styles, /@media \(min-width: 900px\)[\s\S]*\.add-source-dialog/);
	assert.match(styles, /\.add-source-scroll\s*\{[^}]*overflow-y:\s*auto/);
	assert.match(styles, /\.add-source-actions\s*\{[^}]*safe-area-inset-bottom/);
});

test("workspace applies Streaming through its scoped atomic planner and preserves the old physical Add flow", () => {
	assert.match(workspace, /createStreamingCatalogueProvider/);
	assert.match(workspace, /createTmdbStreamingPreviewProvider/);
	assert.match(workspace, /applyStreamingHierarchyPlan\(controller, plan\)/);
	assert.match(workspace, /onApplyStreaming=\{applyStreamingPlan\}/);
	assert.match(workspace, /<StreamingSourceFlow/);
	assert.match(planner, /controller\.extendCollectionWithFoldersAndSources/);
	assert.match(planner, /controller\.createCollectionsWithFoldersAndSources/);
	assert.doesNotMatch(planner, /controller\.moveNode|controller\.removeNode|controller\.updateNodeEditable/);
});
