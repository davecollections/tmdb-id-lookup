import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createElement } from "../builder/node_modules/react/index.js";
import { renderToStaticMarkup } from "../builder/node_modules/react-dom/server.js";
import { createServer } from "../builder/node_modules/vite/dist/node/index.js";
import { INITIAL_ASYNC_REQUEST_STATE } from "../builder/src/source-add/index.js";
import {
	completeNetworkSearchRestore,
	createNetworkSourceNavigationState,
	enterNetworkConfigure,
	NETWORK_SOURCE_STEPS,
	returnNetworkToSearch,
} from "../builder/src/ui/network-source-navigation-state.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vite = await createServer({
	root: path.join(rootDir, "builder"),
	appType: "custom",
	logLevel: "silent",
	server: { middlewareMode: true },
});
const { SourceModeDialog } = await vite.ssrLoadModule("/src/ui/SourceModeDialog.jsx");
const {
	NetworkConfigureActions,
	NetworkConfigureStep,
	NetworkSearchStep,
	NetworkSourceFlow,
} = await vite.ssrLoadModule("/src/ui/NetworkSourceFlow.jsx");
const { NetworkEditorFields } = await vite.ssrLoadModule("/src/ui/SourceEditorDialog.jsx");
after(() => vite.close());

function read(relativePath) {
	return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function network(overrides = {}) {
	return {
		id: 2,
		name: "ABC",
		country: "US",
		headquarters: "New York City, New York",
		location: "US · New York City, New York",
		logoPath: "/abc.png",
		...overrides,
	};
}

function renderSearch(results, { input = "abc", browsing = false, page = 1, totalPages = 1 } = {}) {
	const data = { results, page, totalPages, totalResults: results.length };
	return renderToStaticMarkup(createElement(NetworkSearchStep, {
		input,
		inputRef: null,
		parsedInput: input ? { kind: "search", query: input, eligible: true, message: null } : { kind: "empty", message: null },
		lookupState: { ...INITIAL_ASYNC_REQUEST_STATE, status: "success", data },
		searchData: data,
		browsing,
		onInputChange() {},
		onRetry() {},
		onSelect() {},
		onChangePage() {},
	}));
}

function renderConfigure({
	count = { status: "ready", count: 1616, error: null },
	duplicateReview = { destination: [], elsewhere: [] },
} = {}) {
	return renderToStaticMarkup(createElement(NetworkConfigureStep, {
		network: network(),
		count,
		duplicateReview,
		applyDiagnostic: null,
		sortOptionId: "popular",
		onSortChange() {},
	}));
}

test("Add Source picker exposes Networks with product wording and no internal source enum", () => {
	const markup = renderToStaticMarkup(createElement(SourceModeDialog, {
		folderName: "Television",
		onCancel() {},
		onSelectMode() {},
	}));
	assert.ok(markup.includes('data-source-mode-option="tmdb-networks"'));
	assert.ok(markup.includes("<strong>Networks</strong>"));
	assert.ok(markup.includes("Add one Series source for a TV Network."));
	assert.equal(markup.includes("NETWORK"), false);
	assert.equal((markup.match(/class="source-mode-option"/g) ?? []).length, 7);
});

test("Network result cards show only logo, identity, location, and quiet TMDB ID", () => {
	const markup = renderSearch([
		network({ legacyCount: 987654 }),
		network({ id: 7, name: "Sparse Network", country: "", headquarters: "", location: "", logoPath: null }),
	]);
	assert.ok(markup.includes("ABC"));
	assert.ok(markup.includes("US · New York City, New York"));
	assert.ok(markup.includes("TMDB 2"));
	assert.ok(markup.includes("Sparse Network logo unavailable"));
	assert.ok(markup.includes(">No logo<"));
	assert.equal(markup.includes("Series Count"), false);
	assert.equal(markup.includes("987654"), false);
	assert.equal(markup.includes("Most series"), false);
	assert.equal(markup.includes("legacyCount"), false);
});

test("Network search auto-browses A–Z and keeps typed Best Match implicit", () => {
	const browse = renderSearch([], { input: "", browsing: true });
	const typed = renderSearch([network()]);
	for (const markup of [browse, typed]) {
		assert.equal(markup.includes("Browse all Networks"), false);
		assert.equal(markup.includes("Best Match"), false);
		assert.equal(markup.includes("Most series"), false);
		assert.equal(markup.includes("Hide Networks"), false);
		assert.equal(markup.includes("<select"), false);
	}
	assert.ok(browse.includes("No Networks are available."));
	assert.ok(typed.includes("Search by Network name, country, location or TMDB ID."));
	assert.ok(typed.includes("Choose a Network"));
	const flow = read("builder/src/ui/NetworkSourceFlow.jsx");
	const searchStep = flow.slice(flow.indexOf("export function NetworkSearchStep"), flow.indexOf("function networkCountText"));
	assert.doesNotMatch(searchStep, /getNetworkCount|discover\/tv|with_networks/);
});

test("Network Configure presents fixed Series identity, live count, TMDB link, and four semantic sorts", () => {
	const markup = renderConfigure();
	assert.ok(markup.includes("Selected Network"));
	assert.ok(markup.includes("<strong>Series</strong>"));
	assert.ok(markup.includes("Series Count: 1,616"));
	assert.ok(markup.includes('href="https://www.themoviedb.org/network/2"'));
	assert.ok(markup.includes('target="_blank"'));
	assert.ok(markup.includes('rel="noopener noreferrer"'));
	assert.ok(markup.includes("Open ABC on TMDB"));
	for (const label of ["Popular", "Recent", "Top rated", "Most voted"]) assert.ok(markup.includes(`>${label}<`), label);
	assert.equal((markup.match(/type="radio"/g) ?? []).length, 4);
	assert.equal(markup.includes('type="checkbox"'), false);
	assert.equal(markup.includes("Movies"), false);
	assert.equal(markup.includes("Refresh"), false);
	assert.equal(markup.includes("Retry"), false);
	assert.equal(markup.includes("Movie Count"), false);
	assert.equal(markup.includes("<select"), false);
});

test("Network count zero and failure remain informative and never block Add", () => {
	const notice = "TMDB currently returns no series for this network. You can still add it.";
	assert.equal(renderConfigure().includes(notice), false);
	const zero = renderConfigure({ count: { status: "ready", count: 0 } });
	assert.ok(zero.includes("Series Count: 0"));
	assert.ok(zero.includes(notice));
	const checking = renderConfigure({ count: { status: "checking", count: null } });
	assert.ok(checking.includes("Checking Series Count…"));
	assert.equal(checking.includes(notice), false);
	const unavailable = renderConfigure({ count: { status: "unavailable", count: null } });
	assert.ok(unavailable.includes("Count unavailable"));
	assert.equal(unavailable.includes(notice), false);
	assert.equal(unavailable.includes("Retry"), false);
	const actions = renderToStaticMarkup(createElement(NetworkConfigureActions, { duplicate: false, onAddAnyway() {} }));
	assert.ok(actions.includes(">Add source</button>"));
	assert.equal(actions.includes("disabled"), false);
});

test("Network duplicate preflight distinguishes destination warnings and informational elsewhere occurrences", () => {
	const markup = renderConfigure({
		duplicateReview: {
			destination: [{ identity: "tmdb|NETWORK|2|TV" }],
			elsewhere: [{ collectionInternalId: "collection", collectionTitle: "TV", folderInternalId: "folder-other", folderTitle: "Broadcast" }],
		},
	});
	assert.ok(markup.includes("Series already exists in this folder."));
	assert.ok(markup.includes("This source exists elsewhere"));
	assert.ok(markup.includes("Broadcast · in TV"));
	const actions = renderToStaticMarkup(createElement(NetworkConfigureActions, { duplicate: true, onAddAnyway() {} }));
	assert.ok(actions.includes("No new sources to add"));
	assert.ok(actions.includes(">Add anyway</button>"));
	assert.equal(actions.includes("editor-apply"), false);
});

test("Network navigation restores selected result, scroll position, and search focus intent", () => {
	const initial = createNetworkSourceNavigationState();
	const configure = enterNetworkConfigure(initial, 2, 384.5);
	assert.deepEqual(configure, {
		step: NETWORK_SOURCE_STEPS.CONFIGURE,
		selectedId: 2,
		searchScrollTop: 384.5,
		restoreSearchFocusId: null,
	});
	const search = returnNetworkToSearch(configure);
	assert.equal(search.step, NETWORK_SOURCE_STEPS.SEARCH);
	assert.equal(search.restoreSearchFocusId, 2);
	assert.equal(completeNetworkSearchRestore(search).restoreSearchFocusId, null);
	assert.throws(() => enterNetworkConfigure(initial, 0), /positive safe TMDB Network ID/i);
});

test("Network Source Edit renders fixed linked identity, count, and editable semantic sort", () => {
	const markup = renderToStaticMarkup(createElement(NetworkEditorFields, {
		draft: { sortBy: "popularity.desc", originalSortBy: "popularity.desc", sortOptionId: "popular" },
		network: network(),
		countState: { status: "ready", count: 42 },
		sortRef: null,
		titleField: createElement("div", { "data-network-title-field": "true" }, "Source name"),
		onSortChange() {},
	}));
	assert.ok(markup.includes("Network Series source"));
	assert.ok(markup.includes("US · New York City, New York"));
	assert.ok(markup.includes("Series Count: 42"));
	assert.ok(markup.includes('href="https://www.themoviedb.org/network/2"'));
	assert.equal(markup.includes('data-entity-logo="network"'), false);
	assert.equal(markup.includes("ABC logo"), false);
	assert.equal((markup.match(/type="radio"/g) ?? []).length, 4);
	assert.equal(markup.includes('type="checkbox"'), false);
	assert.ok(markup.indexOf("Open ABC on TMDB") < markup.indexOf("Source name"));
	assert.ok(markup.indexOf("Source name") < markup.indexOf("Sort Series by"));
	const zeroNotice = "TMDB currently returns no series for this network.";
	const zero = renderToStaticMarkup(createElement(NetworkEditorFields, {
		draft: { sortBy: "popularity.desc", originalSortBy: "popularity.desc", sortOptionId: "popular" },
		network: network(), countState: { status: "ready", count: 0 }, onSortChange() {},
	}));
	assert.ok(zero.includes("Series Count: 0"));
	assert.ok(zero.includes(zeroNotice));
	for (const countState of [{ status: "ready", count: 42 }, { status: "unavailable", count: null }]) {
		const stateMarkup = renderToStaticMarkup(createElement(NetworkEditorFields, {
			draft: { sortBy: "popularity.desc", originalSortBy: "popularity.desc", sortOptionId: "popular" },
			network: network(), countState, onSortChange() {},
		}));
		assert.equal(stateMarkup.includes(zeroNotice), false);
	}
	const dialog = read("builder/src/ui/SourceEditorDialog.jsx");
	assert.match(dialog, /session\.adapterId === NETWORK_SOURCE_EDITOR_ID[\s\S]*<NetworkEditorFields/);
	assert.match(dialog, /networkCountProvider\?\.getNetworkCount/);
});

test("Network flow reuses proven mobile dialog controls at every required width", () => {
	const styles = read("builder/src/styles.css");
	for (const width of [360, 384, 393, 402, 412]) assert.ok(width <= 520);
	assert.match(styles, /@media \(max-width: 899\.98px\)[\s\S]*\.studio-source-dialog[\s\S]*max-height:\s*100dvh/);
	assert.match(styles, /@media \(max-width: 520px\)[\s\S]*\.studio-result\s*\{[^}]*grid-template-columns:\s*64px minmax\(0, 1fr\)/);
	assert.match(styles, /@media \(max-width: 520px\)[\s\S]*\.studio-configure-identity\s*\{[^}]*grid-template-columns:\s*64px minmax\(0, 1fr\) auto/);
	assert.match(styles, /\.studio-configure-actions \.studio-add-all\s*\{[^}]*min-height:\s*44px/);
	assert.match(styles, /\.add-source-scroll\s*\{[^}]*overflow-y:\s*auto/);
	assert.match(styles, /\.add-source-actions\s*\{[^}]*safe-area-inset-bottom/);
});

test("Workspace routes Network providers through one atomic Add path and Source Edit", () => {
	const source = read("builder/src/ui/BuilderWorkspace.jsx");
	assert.match(source, /NETWORK_SOURCE_MODE_ID/);
	assert.match(source, /\[MOVIE_FRANCHISE_SOURCE_MODE_ID, PEOPLE_SOURCE_MODE_ID, STUDIO_SOURCE_MODE_ID, NETWORK_SOURCE_MODE_ID, STREAMING_SOURCE_MODE_ID, GENRE_SOURCE_MODE_ID, DECADE_SOURCE_MODE_ID\]\.includes\(modeId\)/);
	assert.match(source, /<NetworkSourceFlow/);
	assert.match(source, /catalogueProvider=\{networkCatalogueProviderRef\.current\}/);
	assert.match(source, /countProvider=\{networkCountProviderRef\.current\}/);
	assert.match(source, /createNetworkSource\(controller/);
	assert.match(source, /setPendingCreatedSourceFocus\(result\.createdSourceInternalIds\[0\]\)/);
	assert.match(source, /networkCatalogueProvider=\{networkCatalogueProviderRef\.current\}/);
	assert.match(source, /networkCountProvider=\{networkCountProviderRef\.current\}/);
});

test("Network flow performs no uncontrolled catalogue or count request during server rendering", () => {
	let catalogueCalls = 0;
	let countCalls = 0;
	renderToStaticMarkup(createElement(NetworkSourceFlow, {
		catalogueProvider: { searchNetworks() { catalogueCalls += 1; } },
		countProvider: { getNetworkCount() { countCalls += 1; } },
		project: { collections: [] },
		folder: { internalId: "folder", editable: { title: "Networks" } },
		onBack() {},
		onCancel() {},
		onApply() {},
	}));
	assert.equal(catalogueCalls, 0);
	assert.equal(countCalls, 0);
});
