import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createElement } from "../builder/node_modules/react/index.js";
import { renderToStaticMarkup } from "../builder/node_modules/react-dom/server.js";
import { createServer } from "../builder/node_modules/vite/dist/node/index.js";
import { INITIAL_ASYNC_REQUEST_STATE } from "../builder/src/source-add/index.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(rootDir, relativePath), "utf8");
const flow = read("builder/src/ui/NetworkHierarchyFlow.jsx");
const networkFlow = read("builder/src/ui/NetworkSourceFlow.jsx");
const catalogue = read("builder/src/source-add/network-catalogue.js");
const searchHook = read("builder/src/ui/use-network-catalogue-search.js");
const previewProvider = read("builder/src/source-add/tmdb-network-preview-provider.js");
const nestedDialog = read("builder/src/ui/NestedPreviewDialog.jsx");
const posterGrid = read("builder/src/ui/PosterOnlyPreviewGrid.jsx");
const creationOptions = read("builder/src/ui/creation-options.js");
const dialog = read("builder/src/ui/CreationDialog.jsx");
const workspace = read("builder/src/ui/BuilderWorkspace.jsx");
const styles = read("builder/src/styles.css");
const viteConfig = read("builder/vite.config.js");

const vite = await createServer({
	root: path.join(rootDir, "builder"),
	appType: "custom",
	logLevel: "silent",
	server: { middlewareMode: true },
});
const { CreationDialog } = await vite.ssrLoadModule("/src/ui/CreationDialog.jsx");
const { NetworkHierarchyFlow } = await vite.ssrLoadModule("/src/ui/NetworkHierarchyFlow.jsx");
const { NetworkResultContent, NetworkSearchStep } = await vite.ssrLoadModule("/src/ui/NetworkSourceFlow.jsx");
after(() => vite.close());

function network(overrides = {}) {
	return {
		id: 2,
		name: "ABC",
		country: "US",
		headquarters: "New York City, New York",
		location: "US · New York City, New York",
		logoPath: "/abc.png",
		seriesCount: 42,
		...overrides,
	};
}

function baseCreationProps(scope) {
	return {
		scope,
		project: { collections: [] },
		projectRevision: 0,
		destinationCollectionInternalId: scope === "new-folder" ? "collection-1" : null,
		destinationCollectionTitle: scope === "new-folder" ? "Television" : null,
		currentYear: 2026,
		onCancel() {},
		onCreateBlank() {},
		onApplyDecades() {},
		onApplyPeople() {},
		onApplyFranchises() {},
		onApplyStudios() {},
		onApplyNetworks() {},
	};
}

function renderSearch({ hierarchy }) {
	const results = [network({ seriesCount: 0 }), network({ id: 7, name: "Unknown Network", seriesCount: null })];
	const data = { results, page: 1, totalPages: 1, totalResults: results.length };
	return renderToStaticMarkup(createElement(NetworkSearchStep, {
		input: "",
		inputRef: null,
		parsedInput: { kind: "empty", message: null },
		lookupState: { ...INITIAL_ASYNC_REQUEST_STATE, status: "success", data },
		searchData: data,
		browsing: true,
		seriesCountFilter: hierarchy ? "all" : null,
		showSeriesCountFilters: hierarchy,
		onInputChange() {},
		onSeriesCountFilterChange() {},
		onRetry() {},
		onSelect() {},
		onChangePage() {},
		...(hierarchy ? {
			resultsHeading: "Select Networks",
			renderResult(result) {
				return createElement("div", { key: result.id }, createElement(NetworkResultContent, { network: result, showSeriesCount: true }));
			},
		} : {}),
	}));
}

test("Networks remains ordered immediately before Genres in both hierarchy scopes", () => {
	const expected = ["blank", "decades", "people", "franchises", "tmdb-lists", "studios", "networks", "genres", "streaming-services"];
	for (const scope of ["new-collection", "new-folder"]) {
		const markup = renderToStaticMarkup(createElement(CreationDialog, baseCreationProps(scope)));
		assert.ok(markup.includes(`data-creation-scope="${scope}"`));
		assert.deepEqual([...markup.matchAll(/data-creation-option="([^"]+)"/g)].map((match) => match[1]), expected);
		assert.ok(markup.includes("<strong>Networks</strong>"));
		assert.equal(markup.includes("Create one Series folder for each selected TV Network."), false);
	}
	assert.match(creationOptions, /NETWORKS:\s*"networks"/);
	assert.match(creationOptions, /id:\s*CREATION_OPTION_IDS\.NETWORKS,[\s\S]*scopes:\s*BOTH_SCOPES/);
});

test("hierarchy Search alone exposes the exact Series Count filters and count wording", () => {
	const hierarchyMarkup = renderSearch({ hierarchy: true });
	assert.deepEqual(
		[...hierarchyMarkup.matchAll(/<button[^>]*aria-label="Series Count ([^"]+)"/g)].map((match) => match[1]),
		["All", "Exclude 0", "10+", "50+", "100+", "500+"],
	);
	assert.ok(hierarchyMarkup.includes("Series Count: 0"));
	assert.ok(hierarchyMarkup.includes("Series Count: Unknown"));
	assert.ok(hierarchyMarkup.includes("Select Networks"));

	const addSourceMarkup = renderSearch({ hierarchy: false });
	assert.equal(addSourceMarkup.includes("Series Count:"), false);
	assert.equal(addSourceMarkup.includes('aria-label="Series Count filter"'), false);
	assert.match(flow, /showSeriesCountFilters/);
	assert.match(flow, /onSeriesCountFilterChange=\{search\.changeSeriesCountFilter\}/);
	assert.match(searchHook, /changeSeriesCountFilter\(filterId\)\s*\{\s*setSeriesCountFilter\(filterId\);\s*setPage\(1\)/);
	const addSourceResult = networkFlow.slice(networkFlow.indexOf("function NetworkResult("), networkFlow.indexOf("export function NetworkSearchStep"));
	assert.match(addSourceResult, /<NetworkResultContent network=\{network\} \/>/);
	assert.doesNotMatch(addSourceResult, /showSeriesCount/);
	for (const label of ["All", "Exclude 0", "10+", "50+", "100+", "500+"]) {
		assert.match(catalogue, new RegExp(`label: "${label.replace("+", "\\+")}"`));
	}
});

test("Network hierarchy follows Select to Configure to Appearance with one shared Series sort", () => {
	assert.match(flow, /useState\("select"\)/);
	assert.match(flow, /setStep\("configure"\)/);
	assert.match(flow, /setStep\("appearance"\)/);
	assert.match(flow, />Configure Networks</);
	assert.match(flow, />Appearance</);
	assert.match(flow, /Continue to Appearance/);
	assert.match(flow, /Choose one shared Series sort and preview when useful\./);
	assert.equal((flow.match(/<NetworkSortChoices/g) ?? []).length, 1);
	assert.doesNotMatch(flow, />Movies?</);
	assert.doesNotMatch(flow, />Media</);
	assert.doesNotMatch(flow, /mediaMode|mediaTypes|role="tablist"|role="tab"/);
	assert.match(flow, /<FolderShapeChoices/);
	assert.match(flow, /collectionTitle:\s*"Networks"/);
	assert.match(flow, /viewMode:\s*"TABBED_GRID"/);
	assert.match(flow, /showAllTab:\s*true/);
	assert.match(flow, /pinToTop:\s*false/);
});

test("poster Preview is explicit, Configure-only, tab-free, and has the exact empty state", () => {
	const configure = flow.slice(flow.indexOf("function NetworkConfigureRow"), flow.indexOf("function ArtworkChoices"));
	const preview = flow.slice(flow.indexOf("function NetworkTitlePreview"), flow.indexOf("function placementLabel"));
	assert.match(configure, /aria-haspopup="dialog"/);
	assert.match(configure, />Preview<\/button>/);
	assert.match(preview, /<PosterOnlyPreviewGrid/);
	assert.match(preview, /limit=\{10\}/);
	assert.match(preview, /ariaLabel="Series poster preview"/);
	assert.match(preview, /emptyMessage="No posters available\."/);
	assert.doesNotMatch(preview, /tablist|role="tab"|Movies|mediaMode|mediaTypes/);
	assert.equal((flow.match(/previewProvider\.getNetworkPreview/g) ?? []).length, 1);
	assert.doesNotMatch(flow, /prefetch|autoplay|Promise\.all\([^)]*getNetworkPreview/i);
	assert.match(previewProvider, /with_networks/);
	assert.match(previewProvider, /requester\.getPreview\(networkId, "TV", concreteSort/);
});

test("Configure shows one Series Count line and a successful Preview supersedes its catalogue value transiently", () => {
	const countLabel = flow.slice(flow.indexOf("function configureCountLabel"), flow.indexOf("function SelectedNetworks"));
	const configureRow = flow.slice(flow.indexOf("function NetworkConfigureRow"), flow.indexOf("function ConfigureStep"));
	const requestPreview = flow.slice(flow.indexOf("async function requestPreview"), flow.indexOf("function closePreview"));
	const planning = flow.slice(flow.indexOf("const planResult"), flow.indexOf("const configureOutcomes"));

	assert.match(countLabel, /exactCount === undefined \? network\?\.seriesCount : exactCount/);
	assert.equal((configureRow.match(/configureCountLabel\(network, exactCount\)/g) ?? []).length, 1);
	assert.doesNotMatch(configureRow, /catalogueCountLabel|Exact Series Count|Live Series Count|network-configure-exact-count/);
	assert.doesNotMatch(flow, /Exact Series Count|Live Series Count/);
	assert.match(requestPreview, /if \(outcome\.result\?\.ok\)[\s\S]*setExactCounts/);
	assert.doesNotMatch(requestPreview.slice(requestPreview.indexOf("else if")), /setExactCounts/);
	assert.doesNotMatch(planning, /exactCounts|totalResults/);
	assert.equal((flow.match(/previewProvider\.getNetworkPreview/g) ?? []).length, 1);
});

test("server rendering starts no catalogue, Preview, artwork, or apply request", () => {
	const calls = { catalogue: 0, preview: 0, artwork: 0, apply: 0 };
	const markup = renderToStaticMarkup(createElement(NetworkHierarchyFlow, {
		scope: "new-collection",
		project: { collections: [] },
		projectRevision: 0,
		catalogueProvider: { searchNetworks() { calls.catalogue += 1; } },
		previewProvider: { getNetworkPreview() { calls.preview += 1; } },
		artworkRuntimeClient: { load() { calls.artwork += 1; }, resolve() { calls.artwork += 1; } },
		onBack() {},
		onCancel() {},
		onApply() { calls.apply += 1; },
	}));
	assert.deepEqual(calls, { catalogue: 0, preview: 0, artwork: 0, apply: 0 });
	assert.ok(markup.includes('data-network-hierarchy-stage="select"'));
	assert.ok(markup.includes("Select Networks in folder order."));
	assert.equal(markup.includes("autofocus"), false);
});

test("Select uses accessible full-card checkboxes, stable focus, and one scroll owner", () => {
	const selectable = flow.slice(flow.indexOf("function SelectableNetworkResult"), flow.indexOf("function NetworkTitlePreview"));
	assert.match(selectable, /<label[^>]+network-result-selectable/);
	assert.match(selectable, /type="checkbox"/);
	assert.match(selectable, /selectable-card-indicator/);
	assert.match(selectable, /<NetworkResultContent[^>]+showSeriesCount/);
	assert.doesNotMatch(selectable, /Preview|aria-haspopup="dialog"/);
	assert.equal((flow.match(/className="add-source-scroll"/g) ?? []).length, 1);
	assert.match(flow, /<footer className="add-source-actions">/);
	assert.match(flow, /focusElementWithoutScroll\(step === "select"/);
	assert.match(flow, /queueMicrotask\(\(\) => focusElementWithoutScroll\(trigger\)\)/);
	assert.match(flow, /inert=\{preview \|\| undefined\}/);
	assert.match(nestedDialog, /createPortal\(content, document\.body\)/);
	assert.match(nestedDialog, /initialFocusRef/);
	assert.match(nestedDialog, /handleDialogKeyDown/);
	assert.doesNotMatch(networkFlow, /autoFocus/);
});

test("required responsive owner widths use the same 10-poster maximum", () => {
	const widths = [360, 384, 393, 402, 412, 899, 900, 901, 1280];
	assert.deepEqual(widths.filter((width) => width <= 520), [360, 384, 393, 402, 412]);
	assert.deepEqual(widths.filter((width) => width >= 900), [900, 901, 1280]);
	assert.match(styles, /@media \(max-width: 620px\), \(max-width: 899\.98px\) and \(max-height: 600px\)[\s\S]*\.add-source-dialog/);
	assert.match(styles, /@media \(min-width: 900px\), \(min-width: 621px\) and \(min-height: 601px\)[\s\S]*\.add-source-dialog/);
	assert.match(styles, /\.add-source-scroll\s*\{[^}]*overflow-y:\s*auto/);
	assert.match(styles, /\.add-source-actions\s*\{[^}]*safe-area-inset-bottom/);
	assert.match(flow, /className="[^\"]*studio-preview-grid network-preview-grid"/);
	assert.doesNotMatch(styles, /\.studio-preview-grid img:nth-child\(n \+ 6\)/);
	assert.match(styles, /@media \(max-width: 620px\)[\s\S]*\.franchise-preview-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(3/);
	assert.match(posterGrid, /slice\(0, limit\)/);
	assert.match(flow, /<PosterOnlyPreviewGrid items=\{items\} limit=\{10\}/);
});

test("workspace owns the Network providers and applies one atomic hierarchy plan", () => {
	assert.match(dialog, /CREATION_OPTION_IDS\.NETWORKS/);
	assert.match(dialog, /<NetworkHierarchyFlow/);
	assert.match(dialog, /catalogueProvider=\{networkCatalogueProvider\}/);
	assert.match(dialog, /previewProvider=\{networkPreviewProvider\}/);
	assert.match(dialog, /artworkRuntimeClient=\{networkArtworkRuntimeClient\}/);
	assert.match(workspace, /createTmdbNetworkPreviewProvider/);
	assert.match(workspace, /networkPreviewProviderRef/);
	assert.match(workspace, /networkArtworkRuntimeClient=\{studioArtworkRuntimeClientRef\.current\}/);
	assert.match(workspace, /applyNetworkHierarchyPlan\(controller, plan\)/);
	assert.match(workspace, /onApplyNetworks=\{applyNetworkPlan\}/);
});

test("Vite has no fabricated Network hierarchy Preview posters or sorted Preview response", () => {
	assert.match(viteConfig, /const networkRequest = networkEnabled[\s\S]*sorts\.length === 0/);
	assert.match(viteConfig, /const results = companyRequest \? Array\.from[\s\S]*:\s*\[\];/);
	assert.doesNotMatch(viteConfig, /TMDB_NETWORK_MOCK_PREVIEW|network-preview|network-\$\{entityId\}[^\n]*\.jpg/i);
	assert.doesNotMatch(viteConfig, /networkRequest\s*\?\s*Array\.from/);
});
