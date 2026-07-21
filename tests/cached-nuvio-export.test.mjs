import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

import { createV1ArtworkRuntimeBridge } from "../js/artwork-runtime-v1.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const exporterSource = fs.readFileSync(path.join(rootDir, "js", "cached-nuvio-export.js"), "utf8");
const COMPANY_SHA = "a".repeat(64);
const NETWORK_SHA = "b".repeat(64);

function companyEntry(id, { fallbackUsed = false, name = `Company ${id}` } = {}) {
	return {
		id,
		name,
		status: "published",
		landscape: {
			path: `assets/collection_covers/companies/${id}.webp`,
			sha256: COMPANY_SHA,
		},
		fallbackUsed,
		reviewRequired: false,
	};
}

function networkEntry(id, { fallbackUsed = false, name = `Network ${id}` } = {}) {
	return {
		id,
		name,
		status: "published",
		landscape: {
			path: `assets/collection_covers/networks/${id}.webp`,
			sha256: NETWORK_SHA,
		},
		fallbackUsed,
		reviewRequired: false,
	};
}

function createLookup() {
	return {
		schemaVersion: 1,
		status: "published",
		companies: {
			"10": companyEntry(10, { name: "Alpha Studio" }),
			"11": companyEntry(11, { fallbackUsed: true, name: "Runtime Fallback Name" }),
		},
		networks: {
			"20": networkEntry(20, { name: "Alpha Network" }),
			"21": networkEntry(21, { fallbackUsed: true, name: "Runtime Network Fallback" }),
		},
		people: {},
	};
}

function responseFor(lookup) {
	return {
		ok: true,
		status: 200,
		async json() {
			return lookup;
		},
	};
}

function createBridge(fetchImpl) {
	return createV1ArtworkRuntimeBridge({
		baseUrl: "https://assets.example.test/repository/",
		runtimeLookupPath: "runtime-lookup.json",
		fetchImpl,
	});
}

function plain(value) {
	return JSON.parse(JSON.stringify(value));
}

function createElementState(overrides = {}) {
	return {
		checked: false,
		className: "",
		dataset: {},
		disabled: false,
		hidden: false,
		textContent: "",
		value: "",
		attributes: {},
		listeners: {},
		addEventListener(type, listener) {
			this.listeners[type] = listener;
		},
		setAttribute(name, value) {
			this.attributes[name] = String(value);
		},
		classList: {
			toggle() {},
		},
		...overrides,
	};
}

function createExporterHarness({
	bridge,
	companies = [],
	networks = [],
	selectedCompanyIds = companies.map((company) => company.id),
	selectedNetworkIds = networks.map((network) => network.id),
	companyArtworkEnabled = true,
	networkArtworkEnabled = true,
} = {}) {
	const elements = new Map();
	const add = (id, overrides) => elements.set(id, createElementState(overrides));

	add("company-nuvio-collection-name", { value: "Studios" });
	add("company-nuvio-cover-url", { value: "https://example.test/company-backdrop.jpg" });
	add("company-nuvio-use-logos", { checked: companyArtworkEnabled });
	add("company-nuvio-export-summary");
	add("company-nuvio-artwork-status");
	add("retry-company-nuvio-artwork", { hidden: true });
	add("copy-company-nuvio-json", { disabled: true, textContent: "Copy JSON" });
	add("download-company-nuvio-json", { disabled: true, textContent: "Download JSON" });
	add("company-nuvio-export-modal", { hidden: false });
	add("network-nuvio-collection-name", { value: "Networks" });
	add("network-nuvio-cover-url", { value: "https://example.test/network-backdrop.jpg" });
	add("network-nuvio-use-logos", { checked: networkArtworkEnabled });
	add("network-nuvio-export-summary");
	add("network-nuvio-artwork-status");
	add("retry-network-nuvio-artwork", { hidden: true });
	add("copy-network-nuvio-json", { disabled: true, textContent: "Copy JSON" });
	add("download-network-nuvio-json", { disabled: true, textContent: "Download JSON" });
	add("network-nuvio-export-modal", { hidden: false });

	const copied = [];
	const downloads = [];
	const loggedErrors = [];
	let createdIdCount = 0;
	let closedModalCount = 0;
	const context = {
		companies,
		networks,
		selectedCompanyIds: new Set(selectedCompanyIds.map(Number)),
		selectedNetworkIds: new Set(selectedNetworkIds.map(Number)),
		console: {
			log() {},
			error(...args) {
				loggedErrors.push(args);
			},
		},
		document: {
			getElementById(id) {
				const element = elements.get(id);

				if (!element) {
					throw new Error(`Missing test element: ${id}`);
				}

				return element;
			},
			querySelectorAll() {
				return [];
			},
		},
		createNuvioIdFactory() {
			return {
				create(prefix) {
					createdIdCount += 1;
					return `${prefix}-${createdIdCount}`;
				},
			};
		},
		slugifyFilename(value) {
			return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
		},
		async copyTextWithButtonFeedback(value) {
			copied.push(value);
			return true;
		},
		downloadTextFile(filename, value, mimeType) {
			downloads.push({ filename, value, mimeType });
		},
		openAppModal() {},
		closeAppModal() {
			closedModalCount += 1;
		},
		closeNuvioImportHelpModal() {},
		render() {},
		renderNetworks() {},
		getPageItems() {
			return [];
		},
		getNetworkPageItems() {
			return [];
		},
		updateCompanySelectionStatus() {},
		updateNetworkSelectionStatus() {},
	};

	context.getSelectedCompanies = () =>
		context.companies
			.filter((company) => context.selectedCompanyIds.has(Number(company.id)))
			.sort((left, right) => String(left.name || "").localeCompare(String(right.name || "")));
	context.window = context;
	context.window.nuvioArtworkRuntime = bridge;
	vm.createContext(context);
	vm.runInContext(exporterSource, context, { filename: "js/cached-nuvio-export.js" });

	return {
		context,
		elements,
		copied,
		downloads,
		loggedErrors,
		get createdIdCount() {
			return createdIdCount;
		},
		get closedModalCount() {
			return closedModalCount;
		},
	};
}

test("v1 adapter stays lazy and resolves explicit company/network landscape batches through one shared load", async () => {
	let fetchCount = 0;
	const bridge = createBridge(async () => {
		fetchCount += 1;
		return responseFor(createLookup());
	});

	assert.equal(fetchCount, 0);

	const [companies, networks] = await Promise.all([
		bridge.resolveLandscapeBatch({ entityType: "company", tmdbIds: [10, 11, 12] }),
		bridge.resolveLandscapeBatch({ entityType: "network", tmdbIds: [20, 21, 22] }),
	]);

	assert.equal(fetchCount, 1);
	assert.equal(
		companies[0].assetUrl,
		`https://assets.example.test/repository/assets/collection_covers/companies/10.webp?v=${COMPANY_SHA.slice(0, 12)}`,
	);
	assert.equal(new URL(companies[0].assetUrl).searchParams.get("v").length, 12);
	assert.equal(companies[1].status, "ready");
	assert.equal(companies[1].fallbackUsed, true);
	assert.equal(companies[2].status, "missing");
	assert.equal(networks[0].entityType, "network");
	assert.equal(networks[0].orientation, "landscape");
	assert.equal(networks[1].fallbackUsed, true);
	assert.equal(networks[2].status, "missing");
	await assert.rejects(() => bridge.resolveLandscapeBatch({ entityType: "person", tmdbIds: [30] }), TypeError);
});

test("company and network exports use published URLs, accept text fallbacks, and preserve missing/source contracts", async () => {
	let fetchCount = 0;
	const bridge = createBridge(async () => {
		fetchCount += 1;
		return responseFor(createLookup());
	});
	const harness = createExporterHarness({
		bridge,
		companies: [
			{ id: 12, name: "Missing Cached Studio", logo_path: "/must-not-export.png" },
			{ id: 11, name: "Beta Cached Studio", logo_path: "/must-not-export.png" },
			{ id: 10, name: "Alpha Cached Studio", logo_path: "/must-not-export.png" },
		],
		networks: [
			{ id: 22, name: "Missing Cached Network", logo_path: "/must-not-export.png" },
			{ id: 21, name: "Beta Cached Network", logo_path: "/must-not-export.png" },
			{ id: 20, name: "Alpha Cached Network", logo_path: "/must-not-export.png" },
		],
	});

	const [companyPayload, networkPayload] = await Promise.all([
		harness.context.getCompanyNuvioExportPayload(),
		harness.context.getNetworkNuvioExportPayload(),
	]);
	const companyCollection = JSON.parse(companyPayload.json)[0];
	const networkCollection = JSON.parse(networkPayload.json)[0];
	const [readyCompany, fallbackCompany, missingCompany] = companyCollection.folders;
	const [readyNetwork, fallbackNetwork, missingNetwork] = networkCollection.folders;

	assert.equal(fetchCount, 1);
	assert.deepEqual(plain(companyPayload.summary), { enabled: true, readyCount: 2, fallbackCount: 1, missingCount: 1 });
	assert.deepEqual(plain(networkPayload.summary), { enabled: true, readyCount: 2, fallbackCount: 1, missingCount: 1 });
	assert.equal(readyCompany.title, "Alpha Cached Studio");
	assert.match(readyCompany.coverImageUrl, /companies\/10\.webp\?v=a{12}$/);
	assert.equal(readyCompany.hideTitle, true);
	assert.equal(readyCompany.coverEmoji, "");
	assert.equal(fallbackCompany.title, "Beta Cached Studio");
	assert.match(fallbackCompany.coverImageUrl, /companies\/11\.webp\?v=a{12}$/);
	assert.equal(fallbackCompany.hideTitle, true);
	assert.equal(missingCompany.coverImageUrl, "");
	assert.equal(missingCompany.hideTitle, false);
	assert.equal(missingCompany.coverEmoji, "🎬");
	assert.equal(missingCompany.focusGifUrl, "");
	assert.equal(missingCompany.focusGifEnabled, false);
	assert.equal(missingCompany.sources[0].provider, "tmdb");
	assert.equal(missingCompany.sources[0].tmdbSourceType, "COMPANY");
	assert.equal(missingCompany.sources[0].mediaType, "MOVIE");
	assert.equal(readyNetwork.title, "Alpha Cached Network");
	assert.match(readyNetwork.coverImageUrl, /networks\/20\.webp\?v=b{12}$/);
	assert.match(fallbackNetwork.coverImageUrl, /networks\/21\.webp\?v=b{12}$/);
	assert.equal(missingNetwork.coverImageUrl, "");
	assert.equal(missingNetwork.hideTitle, false);
	assert.equal(missingNetwork.coverEmoji, "📺");
	assert.equal(missingNetwork.focusGifUrl, "");
	assert.equal(missingNetwork.focusGifEnabled, false);
	assert.equal(missingNetwork.sources[0].tmdbSourceType, "NETWORK");
	assert.equal(missingNetwork.sources[0].mediaType, "TV");
	assert.deepEqual(missingNetwork.catalogSources, []);
	assert.equal(companyCollection.focusGlowEnabled, true);
	assert.equal(networkCollection.focusGlowEnabled, true);
	assert.equal(companyCollection.backdropImageUrl, "https://example.test/company-backdrop.jpg");
	assert.equal(networkCollection.backdropImageUrl, "https://example.test/network-backdrop.jpg");
	assert.equal(missingCompany.sources[0].sortBy, "popularity.desc");
	assert.equal(missingNetwork.sources[0].sortBy, "popularity.desc");
	assert.equal(companyPayload.json.includes("image.tmdb.org"), false);
	assert.equal(networkPayload.json.includes("image.tmdb.org"), false);
	await harness.context.prepareCompanyNuvioExport();
	await harness.context.prepareNetworkNuvioExport();
	assert.match(harness.elements.get("company-nuvio-artwork-status").textContent, /ready for 2 folders, including 1 approved text fallback/i);
	assert.match(harness.elements.get("company-nuvio-artwork-status").textContent, /1 folder will use visible titles and 🎬/i);
	assert.match(harness.elements.get("network-nuvio-artwork-status").textContent, /1 folder will use visible titles and 📺/i);
});

test("artwork-disabled exports perform no runtime request and use visible title/emoji fallbacks", async () => {
	let fetchCount = 0;
	const bridge = createBridge(async () => {
		fetchCount += 1;
		throw new Error("The runtime must remain lazy when artwork is disabled");
	});
	const harness = createExporterHarness({
		bridge,
		companies: [{ id: 10, name: "Disabled Studio", logo_path: "/must-not-export.png" }],
		networks: [{ id: 20, name: "Disabled Network", logo_path: "/must-not-export.png" }],
		companyArtworkEnabled: false,
		networkArtworkEnabled: false,
	});

	const [companyPayload, networkPayload] = await Promise.all([
		harness.context.getCompanyNuvioExportPayload(),
		harness.context.getNetworkNuvioExportPayload(),
	]);
	const companyFolder = JSON.parse(companyPayload.json)[0].folders[0];
	const networkFolder = JSON.parse(networkPayload.json)[0].folders[0];

	assert.equal(fetchCount, 0);
	assert.deepEqual(plain(companyPayload.summary), { enabled: false, readyCount: 0, fallbackCount: 0, missingCount: 1 });
	assert.equal(companyFolder.coverImageUrl, "");
	assert.equal(companyFolder.hideTitle, false);
	assert.equal(companyFolder.coverEmoji, "🎬");
	assert.equal(networkFolder.coverImageUrl, "");
	assert.equal(networkFolder.hideTitle, false);
	assert.equal(networkFolder.coverEmoji, "📺");
});

test("runtime failure blocks actions, remains retryable, and disabling artwork permits export", async () => {
	let retryFetchCount = 0;
	const retryBridge = createBridge(async () => {
		retryFetchCount += 1;

		if (retryFetchCount === 1) {
			throw new Error("synthetic load failure");
		}

		return responseFor(createLookup());
	});
	const retryHarness = createExporterHarness({
		bridge: retryBridge,
		companies: [{ id: 10, name: "Retry Studio" }],
	});

	assert.equal(await retryHarness.context.prepareCompanyNuvioExport(), null);
	assert.equal(retryFetchCount, 1);
	assert.equal(retryHarness.elements.get("company-nuvio-artwork-status").attributes.role, "alert");
	assert.match(retryHarness.elements.get("company-nuvio-artwork-status").textContent, /turn off curated artwork/i);
	assert.equal(retryHarness.elements.get("copy-company-nuvio-json").disabled, true);
	assert.equal(retryHarness.elements.get("download-company-nuvio-json").disabled, true);
	assert.equal(retryHarness.elements.get("retry-company-nuvio-artwork").hidden, false);
	assert.equal(retryHarness.closedModalCount, 0);
	assert.equal(retryHarness.createdIdCount, 0);

	const retriedPayload = await retryHarness.context.prepareCompanyNuvioExport();

	assert.ok(retriedPayload);
	assert.equal(retryFetchCount, 2);
	assert.equal(retryHarness.elements.get("copy-company-nuvio-json").disabled, false);
	assert.equal(retryHarness.elements.get("download-company-nuvio-json").disabled, false);
	assert.equal(retryHarness.elements.get("retry-company-nuvio-artwork").hidden, true);
	assert.match(JSON.parse(retriedPayload.json)[0].folders[0].coverImageUrl, /companies\/10\.webp\?v=a{12}$/);

	let disableFetchCount = 0;
	const disableHarness = createExporterHarness({
		bridge: createBridge(async () => {
			disableFetchCount += 1;
			throw new Error("synthetic persistent load failure");
		}),
		companies: [{ id: 10, name: "Disable After Failure Studio" }],
	});

	assert.equal(await disableHarness.context.prepareCompanyNuvioExport(), null);
	disableHarness.elements.get("company-nuvio-use-logos").checked = false;
	disableHarness.context.invalidateCompanyNuvioExport();
	const disabledPayload = await disableHarness.context.prepareCompanyNuvioExport();
	const disabledFolder = JSON.parse(disabledPayload.json)[0].folders[0];

	assert.equal(disableFetchCount, 1);
	assert.equal(disabledFolder.coverImageUrl, "");
	assert.equal(disabledFolder.coverEmoji, "🎬");
	assert.equal(disableHarness.elements.get("copy-company-nuvio-json").disabled, false);
});

test("company and network presets retain their toggle order and collection-name defaults", () => {
	const majorCompanyIds = [2, 127928, 127929, 43, 174, 12, 33, 10146, 5, 559, 58, 4];
	const popularNetworkIds = [213, 1024, 3186, 2739, 2552, 4330, 453, 3353, 318, 1112, 2949, 1255, 4, 9, 6, 2, 16, 26, 247];
	const harness = createExporterHarness({
		bridge: {},
		companies: majorCompanyIds.map((id) => ({ id, name: `Company ${id}` })),
		networks: popularNetworkIds.map((id) => ({ id, name: `Network ${id}` })),
		selectedCompanyIds: [],
		selectedNetworkIds: [],
	});

	harness.context.selectCompanyPreset("major");
	assert.deepEqual([...harness.context.selectedCompanyIds], majorCompanyIds);
	assert.equal(harness.context.getCompanyDefaultCollectionName(), "Major Studios");
	harness.context.selectCompanyPreset("major");
	assert.deepEqual([...harness.context.selectedCompanyIds], []);
	assert.equal(harness.context.getCompanyDefaultCollectionName(), "Studios");

	harness.context.selectNetworkPreset("popularServices");
	assert.deepEqual([...harness.context.selectedNetworkIds], popularNetworkIds);
	assert.equal(harness.context.getNetworkDefaultCollectionName(), "Popular Services");
	harness.context.selectNetworkPreset("popularServices");
	assert.deepEqual([...harness.context.selectedNetworkIds], []);
	assert.equal(harness.context.getNetworkDefaultCollectionName(), "Networks");
});

test("concurrent preparation shares output and unchanged Copy/Download reuse IDs while changes invalidate", async () => {
	let fetchCount = 0;
	let releaseFetch;
	const fetchGate = new Promise((resolve) => {
		releaseFetch = resolve;
	});
	const bridge = createBridge(async () => {
		fetchCount += 1;
		await fetchGate;
		return responseFor(createLookup());
	});
	const harness = createExporterHarness({
		bridge,
		companies: [
			{ id: 10, name: "Alpha Studio" },
			{ id: 12, name: "Missing Studio" },
		],
		selectedCompanyIds: [10],
	});
	const firstPending = harness.context.getCompanyNuvioExportPayload();
	const secondPending = harness.context.getCompanyNuvioExportPayload();

	releaseFetch();
	const [firstPayload, secondPayload] = await Promise.all([firstPending, secondPending]);

	assert.equal(fetchCount, 1);
	assert.equal(firstPayload, secondPayload);
	assert.equal(harness.createdIdCount, 2);
	assert.equal(await harness.context.getCompanyNuvioExportPayload(), firstPayload);
	assert.equal(harness.createdIdCount, 2);

	await harness.context.prepareCompanyNuvioExport();
	await harness.context.copyCompanyNuvioJson(harness.elements.get("copy-company-nuvio-json"));
	await harness.context.downloadCompanyNuvioJson();

	assert.equal(harness.copied[0], firstPayload.json);
	assert.equal(harness.downloads[0].value, firstPayload.json);
	assert.equal(harness.downloads[0].filename, firstPayload.filename);
	assert.equal(harness.createdIdCount, 2);

	harness.context.selectedCompanyIds.add(12);
	harness.context.invalidateCompanyNuvioExport();
	const changedPayload = await harness.context.getCompanyNuvioExportPayload();

	assert.notEqual(changedPayload, firstPayload);
	assert.equal(JSON.parse(changedPayload.json)[0].folders.length, 2);
	assert.equal(harness.createdIdCount, 5);
	assert.equal(await harness.context.getCompanyNuvioExportPayload(), changedPayload);
	assert.equal(harness.createdIdCount, 5);

	harness.elements.get("company-nuvio-collection-name").value = "Changed Studios";
	harness.context.invalidateCompanyNuvioExport();
	const changedOptionsPayload = await harness.context.getCompanyNuvioExportPayload();

	assert.notEqual(changedOptionsPayload, changedPayload);
	assert.equal(changedOptionsPayload.filename, "changed-studios.nuvio.json");
	assert.equal(JSON.parse(changedOptionsPayload.json)[0].title, "Changed Studios");
	assert.equal(harness.createdIdCount, 8);
});

test("production markup and exporter contain no borrowed focus animation or legacy company/network cover hosts", () => {
	const html = fs.readFileSync(path.join(rootDir, "index.html"), "utf8");
	const readme = fs.readFileSync(path.join(rootDir, "README.md"), "utf8");
	const adapter = fs.readFileSync(path.join(rootDir, "js", "artwork-runtime-v1.mjs"), "utf8");
	const productionText = [html, readme, exporterSource].join("\n").toLowerCase();

	for (const obsolete of [
		"i.postimg.cc",
		"nuvioapp.space/uploads/covers",
		"upload.wikimedia.org",
		"luckynumb3rs",
		"networkfocusgifurls",
		"getnetworkfocusgifurl",
		"network-nuvio-use-focus-gifs",
	]) {
		assert.equal(productionText.includes(obsolete), false, obsolete);
	}

	assert.equal((html.match(/Use curated artwork/g) || []).length, 2);
	assert.match(html, /type="module" src="\.\/js\/artwork-runtime-v1\.mjs\?v=__APP_ASSET_VERSION__"/);
	assert.match(adapter, /from "\.\/artwork-runtime\.mjs"/);
	assert.match(exporterSource, /focusGifUrl: ""/);
	assert.match(exporterSource, /focusGifEnabled: false/);
	assert.match(exporterSource, /focusGlowEnabled: true/);
	assert.match(readme, /tomato's transparent covers pack/);
	assert.match(readme, /provenance of older self-hosted genre artwork/i);
});
