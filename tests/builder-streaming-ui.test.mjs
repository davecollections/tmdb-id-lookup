import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createElement } from "../builder/node_modules/react/index.js";
import { renderToStaticMarkup } from "../builder/node_modules/react-dom/server.js";
import { createServer } from "../builder/node_modules/vite/dist/node/index.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vite = await createServer({
	root: path.join(rootDir, "builder"),
	appType: "custom",
	logLevel: "silent",
	server: { middlewareMode: true },
});
const { SourceModeDialog } = await vite.ssrLoadModule("/src/ui/SourceModeDialog.jsx");
const {
	completeStreamingNavigationRestore,
	createStreamingSourceNavigationState,
	enterStreamingConfigureStep,
	enterStreamingProviderStep,
	returnStreamingNavigation,
	StreamingConfigureActions,
	StreamingConfigureStep,
	StreamingProviderStep,
	StreamingRegionActions,
	StreamingRegionStep,
	StreamingSourceFlow,
	STREAMING_SOURCE_STEPS,
	toggleStreamingRegionSelection,
} = await vite.ssrLoadModule("/src/ui/StreamingSourceFlow.jsx");
const {
	browseStreamingRegions,
	buildStreamingSourceDrafts,
	STREAMING_PROVIDER_BROWSE_MODES,
	STREAMING_REGION_BROWSE_MODES,
} = await vite.ssrLoadModule("/src/source-add/index.js");
const { discoverSourceIdentity } = await vite.ssrLoadModule("/src/nuvio/discover.js");
after(() => vite.close());

function read(relativePath) {
	return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function provider(overrides = {}) {
	return {
		id: 8,
		name: "Netflix",
		searchName: "netflix",
		logoPath: "/netflix.png",
		moviePriorities: { AU: 3, US: 1 },
		tvPriorities: { AU: 4, US: 2 },
		...overrides,
	};
}

const au = { code: "AU", name: "Australia" };
const us = { code: "US", name: "United States" };
const gb = { code: "GB", name: "United Kingdom" };

test("Add Source retains Streaming fifth with the owner-approved launcher copy", () => {
	const markup = renderToStaticMarkup(createElement(SourceModeDialog, {
		folderName: "Streaming",
		onCancel() {},
		onSelectMode() {},
	}));
	assert.ok(markup.includes('data-source-mode-option="tmdb-streaming-services"'));
	assert.ok(markup.includes("<strong>Streaming</strong>"));
	assert.ok(markup.includes("Add a streaming service."));
	assert.equal((markup.match(/class="source-mode-option"/g) ?? []).length, 8);
});

test("Add Source Streaming opens with a grammatically complete immediate heading", () => {
	const markup = renderToStaticMarkup(createElement(StreamingSourceFlow, {
		catalogueProvider: {},
		folder: { editable: { title: "Selected folder" } },
		onApply() {},
		onBack() {},
		onCancel() {},
		project: { collections: [] },
	}));
	assert.ok(markup.includes('<h2 id="streaming-source-title">Add a streaming service</h2>'));
	assert.ok(markup.includes('aria-label="Close Add a streaming service"'));
});

test("Region opens first as an accessible natural multi-select with known alphabetical rows", () => {
	const markup = renderToStaticMarkup(createElement(StreamingRegionStep, {
		browseMode: STREAMING_REGION_BROWSE_MODES.COMMON,
		query: "",
		regions: [au, gb, us],
		selectedRegions: [us],
		onQueryChange() {},
		onBrowseModeChange() {},
		onSelect() {},
	}));
	assert.ok(markup.includes("Choose regions"));
	assert.ok(markup.includes("Select one or more regions, then choose a provider available across them."));
	assert.ok(markup.includes("Search regions"));
	assert.match(markup, /aria-label="Region browse mode"/);
	assert.match(markup, /aria-pressed="true">Common<\/button>/);
	assert.match(markup, /aria-pressed="false">A–Z<\/button>/);
	assert.ok(markup.includes("Common regions"));
	assert.match(markup, /data-streaming-region="US"[^>]*data-selected="true"[^>]*aria-pressed="true"/);
	assert.match(markup, /data-streaming-region="AU"[^>]*aria-pressed="false"/);
	assert.equal(markup.includes('type="checkbox"'), false);
	assert.equal(markup.includes("Select multiple"), false);
	assert.equal(markup.includes("Region name unavailable"), false);
	assert.equal(markup.includes("JustWatch"), false);
});

test("Region browse/search views retain selected rows and never alter user selection order", () => {
	const ireland = { code: "IE", name: "Ireland" };
	const singapore = { code: "SG", name: "Singapore" };
	let selected = toggleStreamingRegionSelection([], au);
	selected = toggleStreamingRegionSelection(selected, ireland);
	selected = toggleStreamingRegionSelection(selected, us);
	assert.deepEqual(selected.map((region) => region.code), ["AU", "IE", "US"]);

	for (const { browseMode, query, regions } of [
		{ browseMode: STREAMING_REGION_BROWSE_MODES.COMMON, query: "", regions: browseStreamingRegions([singapore, ireland, us, au], { mode: STREAMING_REGION_BROWSE_MODES.COMMON }) },
		{ browseMode: STREAMING_REGION_BROWSE_MODES.ALL, query: "", regions: browseStreamingRegions([singapore, ireland, us, au], { mode: STREAMING_REGION_BROWSE_MODES.ALL }) },
		{ browseMode: STREAMING_REGION_BROWSE_MODES.COMMON, query: "Singapore", regions: browseStreamingRegions([singapore, ireland, us, au], { mode: STREAMING_REGION_BROWSE_MODES.COMMON, query: "Singapore" }) },
	]) {
		const markup = renderToStaticMarkup(createElement(StreamingRegionStep, {
			browseMode,
			query,
			regions,
			selectedRegions: selected,
			onBrowseModeChange() {},
			onQueryChange() {},
			onSelect() {},
		}));
		for (const region of regions.filter((entry) => selected.some((selection) => selection.code === entry.code))) {
			assert.match(markup, new RegExp(`data-streaming-region="${region.code}"[^>]*aria-pressed="true"`));
		}
	}
	assert.deepEqual(selected.map((region) => region.code), ["AU", "IE", "US"]);
	selected = toggleStreamingRegionSelection(selected, ireland);
	selected = toggleStreamingRegionSelection(selected, ireland);
	assert.deepEqual(selected.map((region) => region.code), ["AU", "US", "IE"]);
});

test("Region selection preserves click order, deselection and reselect-at-end behavior", () => {
	let selected = toggleStreamingRegionSelection([], us);
	selected = toggleStreamingRegionSelection(selected, au);
	assert.deepEqual(selected.map((region) => region.code), ["US", "AU"]);
	selected = toggleStreamingRegionSelection(selected, us);
	assert.deepEqual(selected.map((region) => region.code), ["AU"]);
	selected = toggleStreamingRegionSelection(selected, us);
	assert.deepEqual(selected.map((region) => region.code), ["AU", "US"]);
	assert.throws(() => toggleStreamingRegionSelection(selected, { code: "GG", name: "" }), /known normalized/i);
});

test("Region footer reports singular/plural count and keeps Next disabled until selection", () => {
	const zero = renderToStaticMarkup(createElement(StreamingRegionActions, { selectedCount: 0, onNext() {} }));
	assert.ok(zero.includes("0 regions selected"));
	assert.match(zero, /<button[^>]*disabled=""[^>]*>Next<\/button>/);
	const one = renderToStaticMarkup(createElement(StreamingRegionActions, { selectedCount: 1, onNext() {} }));
	assert.ok(one.includes("1 region selected"));
	assert.doesNotMatch(one, /<button[^>]*disabled=""/);
	const many = renderToStaticMarkup(createElement(StreamingRegionActions, { selectedCount: 2, onNext() {} }));
	assert.ok(many.includes("2 regions selected"));
});

test("one-region Provider shows regional Top providers, A–Z and common availability", () => {
	const markup = renderToStaticMarkup(createElement(StreamingProviderStep, {
		browseMode: STREAMING_PROVIDER_BROWSE_MODES.TOP,
		query: "",
		providers: [provider(), provider({ id: 11, name: "Movie Only", logoPath: null, tvPriorities: {} })],
		selectedRegions: [au],
		onBrowseModeChange() {},
		onQueryChange() {},
		onSelect() {},
	}));
	assert.ok(markup.includes("Streaming service · Provider"));
	assert.ok(markup.includes("Australia · AU"));
	assert.ok(markup.includes("Top providers"));
	assert.ok(markup.includes("A–Z"));
	assert.ok(markup.includes("TMDB region order"));
	assert.ok(markup.includes("Movies · Series"));
	assert.ok(markup.includes("Movie Only logo unavailable"));
	assert.equal(markup.includes("complete catalogue"), false);
});

test("multi-region Provider exposes A–Z/search only and shows strict common media context", () => {
	const markup = renderToStaticMarkup(createElement(StreamingProviderStep, {
		browseMode: STREAMING_PROVIDER_BROWSE_MODES.ALL,
		query: "",
		providers: [provider({ tvPriorities: { AU: 4 } })],
		selectedRegions: [us, au],
		onBrowseModeChange() {},
		onQueryChange() {},
		onSelect() {},
	}));
	assert.ok(markup.includes("2 regions selected · US · AU"));
	assert.ok(markup.includes("Eligible providers A–Z"));
	assert.equal(markup.includes("Top providers"), false);
	assert.equal(markup.includes('aria-label="Provider browse mode"'), false);
	assert.ok(markup.includes("Movies"));
	assert.equal(markup.includes("Movies · Series"), false);
});

test("Configure uses the shared strict-common result and includes generated duplicate review", () => {
	const selectedProvider = provider();
	const drafts = buildStreamingSourceDrafts(selectedProvider, { regionCodes: ["US", "AU"], mediaChoice: "both" }).drafts;
	const movieIdentity = discoverSourceIdentity(drafts[0].editable).key;
	const markup = renderToStaticMarkup(createElement(StreamingConfigureStep, {
		provider: selectedProvider,
		regions: [us, au],
		mediaChoice: "both",
		sortOptionId: "popular",
		drafts,
		duplicateReview: {
			destination: [{ identity: movieIdentity, mediaType: "MOVIE", regionCode: "US" }],
			elsewhere: [{ collectionInternalId: "collection", collectionTitle: "Elsewhere", folderInternalId: "folder", folderTitle: "Other Streaming" }],
		},
		applyDiagnostic: null,
		onMediaChange() {},
		onSortChange() {},
	}));
	for (const label of ["Movies", "Series", "Both", "Popular", "Recent", "Top Rated", "Most Votes"]) assert.ok(markup.includes(`>${label}<`), label);
	assert.ok(markup.includes("2 regions · US · AU"));
	assert.ok(markup.includes("4 sources configured"));
	assert.ok(markup.includes("3 to add"));
	assert.ok(markup.includes("US · Movies"));
	assert.ok(markup.includes("US · Series"));
	assert.ok(markup.includes("AU · Movies"));
	assert.ok(markup.includes("AU · Series"));
	assert.ok(markup.includes("Already exists"));
	assert.ok(markup.includes("This source exists elsewhere"));
	assert.equal(markup.includes("JustWatch"), false);
});

test("Configure exposes compact independent source-name editing with defaults and inline validation", () => {
	const selectedProvider = provider();
	const drafts = buildStreamingSourceDrafts(selectedProvider, { regionCodes: ["AU"], mediaChoice: "both" }).drafts;
	const markup = renderToStaticMarkup(createElement(StreamingConfigureStep, {
		provider: selectedProvider,
		regions: [au],
		mediaChoice: "both",
		sortOptionId: "popular",
		drafts,
		duplicateReview: { destination: [], elsewhere: [] },
		expandedCandidateKey: "AU|MOVIE",
		sourceTitles: { "AU|MOVIE": "Cinema shelf", "AU|TV": "Series shelf" },
		titleErrors: new Map([["AU|MOVIE", { message: "Enter a name for this source before adding it." }]]),
		onMediaChange() {},
		onSortChange() {},
		onEditName() {},
		onTitleChange() {},
		onTitleInputMount() {},
		onUseDefaultName() {},
	}));
	assert.ok(markup.includes("Cinema shelf"));
	assert.ok(markup.includes("Series shelf"));
	assert.equal((markup.match(/>Edit name<\/button>/g) ?? []).length, 1);
	assert.ok(markup.includes(">Done</button>"));
	assert.ok(markup.includes("Use default name"));
	assert.ok(markup.includes('aria-invalid="true"'));
	assert.ok(markup.includes("Enter a name for this source before adding it."));
});

test("Configure fails safely if runtime availability changes after Provider eligibility", () => {
	const incompatibleProvider = provider({ moviePriorities: { AU: 0 }, tvPriorities: { US: 0 } });
	const markup = renderToStaticMarkup(createElement(StreamingConfigureStep, {
		provider: incompatibleProvider,
		regions: [au, us],
		mediaChoice: null,
		sortOptionId: "popular",
		drafts: [],
		duplicateReview: { destination: [], elsewhere: [] },
		applyDiagnostic: null,
		onMediaChange() {},
		onSortChange() {},
	}));
	assert.ok(markup.includes("Availability differs across these regions"));
	for (const value of ["movies", "series", "both"]) assert.match(markup, new RegExp(`(?:value="${value}"[^>]*disabled=""|disabled=""[^>]*value="${value}")`));
});

test("Streaming action hierarchy retains partial-add and exact duplicate override behavior", () => {
	const partial = renderToStaticMarkup(createElement(StreamingConfigureActions, { hasDestinationDuplicates: true, primaryCount: 2, configuredCount: 4, onAddAll() {} }));
	assert.ok(partial.includes(">Add 2 sources</button>"));
	assert.ok(partial.includes(">Add all anyway</button>"));
	const full = renderToStaticMarkup(createElement(StreamingConfigureActions, { hasDestinationDuplicates: true, primaryCount: 0, configuredCount: 4, onAddAll() {} }));
	assert.ok(full.includes("No new sources to add"));
	assert.ok(full.includes(">Add all anyway</button>"));
});

test("Region → Provider → Configure navigation restores selection and provider context", () => {
	const initial = createStreamingSourceNavigationState();
	assert.equal(initial.step, STREAMING_SOURCE_STEPS.REGION);
	const providers = enterStreamingProviderStep(initial, ["US", "AU"], 120.5);
	assert.equal(providers.step, STREAMING_SOURCE_STEPS.PROVIDER);
	assert.deepEqual(providers.regionCodes, ["US", "AU"]);
	assert.equal(providers.regionScrollTop, 120.5);
	const configure = enterStreamingConfigureStep(providers, 8, 360);
	assert.equal(configure.step, STREAMING_SOURCE_STEPS.CONFIGURE);
	assert.equal(configure.providerId, 8);
	const providerReturn = returnStreamingNavigation(configure);
	assert.equal(providerReturn.step, STREAMING_SOURCE_STEPS.PROVIDER);
	assert.equal(providerReturn.restoreProviderId, 8);
	const regionReturn = returnStreamingNavigation(providerReturn);
	assert.equal(regionReturn.step, STREAMING_SOURCE_STEPS.REGION);
	assert.equal(regionReturn.restoreRegionCode, "AU");
	assert.equal(completeStreamingNavigationRestore(regionReturn).restoreRegionCode, null);
	assert.throws(() => enterStreamingProviderStep(initial, []), /one or more/i);
	assert.throws(() => enterStreamingProviderStep(initial, ["au"]), /normalized/i);
	assert.throws(() => enterStreamingConfigureStep(providers, 0), /positive safe/i);
});

test("flow derives eligible providers while retaining provider-keyed title drafts across reversible navigation", () => {
	const source = read("builder/src/ui/StreamingSourceFlow.jsx");
	assert.match(source, /useState\(STREAMING_REGION_BROWSE_MODES\.COMMON\)/);
	assert.match(source, /browseStreamingRegions\(catalogue\?\.regions \?\? \[\], \{ mode: regionBrowseMode, query: regionQuery \}\)/);
	assert.match(source, /searchStreamingProviders\(catalogue\?\.providers \?\? \[\], providerQuery, \{ regionCodes: selectedCodes \}\)/);
	assert.match(source, /browseStreamingProviders\(catalogue\?\.providers \?\? \[\], \{ mode: effectiveProviderBrowseMode, regionCodes: selectedCodes \}\)/);
	assert.match(source, /regionCodes\.length === 1[\s\S]*STREAMING_PROVIDER_BROWSE_MODES\.ALL/);
	assert.match(source, /setProviderBrowseMode\(selectedRegions\.length === 1 \? STREAMING_PROVIDER_BROWSE_MODES\.TOP : STREAMING_PROVIDER_BROWSE_MODES\.ALL\)/);
	assert.match(source, /setSelectedProvider\(null\);[\s\S]*setProviderQuery\(""\)/);
	assert.match(source, /const \[sourceTitleDrafts, setSourceTitleDrafts\] = useState\(\{\}\)/);
	assert.match(source, /streamingSourceTitlesForProvider\(sourceTitleDrafts, selectedProvider\?\.id\)/);
	assert.doesNotMatch(source, /setSourceTitles\(\{\}\)/);
	assert.match(source, /streamingSourceTitleDraftKey\(selectedProvider\?\.id, regionCode, mediaType\)/);
	assert.match(source, /onUseDefaultName=\{\(candidateKey\) => \{[\s\S]*delete next\[draftKey\]/);
	assert.doesNotMatch(source, /streamingProviderSupportedRegions/);
	assert.doesNotMatch(source, /multiSelect|Select multiple|proceedToConfigure\(\[region\]\)/);
});

test("Streaming transient states and workspace retain cached loading and one atomic bundle path", () => {
	let calls = 0;
	const markup = renderToStaticMarkup(createElement(StreamingSourceFlow, {
		catalogueProvider: { loadCatalogue() { calls += 1; } },
		project: { collections: [] },
		folder: { internalId: "folder", editable: { title: "Streaming" } },
		onBack() {},
		onCancel() {},
		onApply() {},
	}));
	assert.equal(calls, 0);
	assert.ok(markup.includes("Loading Streaming regions and providers…"));
	const source = read("builder/src/ui/StreamingSourceFlow.jsx");
	assert.ok(source.includes("Streaming services could not be loaded. Try again."));
	assert.ok(source.includes("No Streaming regions are available."));
	assert.ok(source.includes("No provider supports a common media type"));
	assert.equal(source.includes("JustWatch"), false);
	const workspace = read("builder/src/ui/BuilderWorkspace.jsx");
	assert.match(workspace, /catalogueProvider=\{streamingCatalogueProviderRef\.current\}/);
	assert.match(workspace, /createStreamingSourceBundle\(controller/);
	assert.match(workspace, /regions: bundle\.regions/);
	assert.match(workspace, /catalogueRegions: bundle\.catalogueRegions/);
	assert.match(workspace, /setPendingCreatedSourceFocus\(result\.createdSourceInternalIds\[0\]\)/);
});

test("Streaming keeps responsive modal scrolling, selected-row accessibility and reachable footer actions", () => {
	const styles = read("builder/src/styles.css");
	assert.match(styles, /\.streaming-region-result\s*\{[^}]*min-height:\s*58px/);
	assert.match(styles, /\.streaming-region-result\[data-selected="true"\]/);
	assert.doesNotMatch(styles, /streaming-region-selected-mark/);
	assert.match(styles, /\.streaming-region-actions\s*\{/);
	assert.match(styles, /@media \(max-width: 520px\)[\s\S]*\.streaming-media-choices > div\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
	assert.match(styles, /\.add-source-scroll\s*\{[^}]*overflow-y:\s*auto/);
	assert.doesNotMatch(styles, /streaming-region-selection|streaming-multi-region-actions|streaming-attribution/);
});
