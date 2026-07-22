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
	copyGate = null,
} = {}) {
	const elements = new Map();
	const add = (id, overrides) => elements.set(id, createElementState(overrides));

	add("company-nuvio-collection-name", { value: "Studios" });
	add("company-nuvio-cover-url", { value: "https://example.test/company-backdrop.jpg" });
	add("company-nuvio-export-summary");
	add("copy-company-nuvio-json", { disabled: true, textContent: "Copy JSON" });
	add("download-company-nuvio-json", { disabled: true, textContent: "Download JSON" });
	add("company-nuvio-export-modal", { hidden: false });
	add("network-nuvio-collection-name", { value: "Networks" });
	add("network-nuvio-cover-url", { value: "https://example.test/network-backdrop.jpg" });
	add("network-nuvio-export-summary");
	add("copy-network-nuvio-json", { disabled: true, textContent: "Copy JSON" });
	add("download-network-nuvio-json", { disabled: true, textContent: "Download JSON" });
	add("network-nuvio-export-modal", { hidden: false });

	const copied = [];
	const downloads = [];
	const actionSnapshots = [];
	const loggedErrors = [];
	const loggedWarnings = [];
	const pendingTimers = new Map();
	let createdIdCount = 0;
	let closedModalCount = 0;
	let copySucceeds = true;
	let nextTimerId = 1;
	const setTimeout = (callback, delay) => {
		const id = nextTimerId++;
		pendingTimers.set(id, { callback, delay });
		return id;
	};
	const clearTimeout = (id) => pendingTimers.delete(id);
	const context = {
		companies,
		networks,
		selectedCompanyIds: new Set(selectedCompanyIds.map(Number)),
		selectedNetworkIds: new Set(selectedNetworkIds.map(Number)),
		console: {
			log() {},
			warn(...args) {
				loggedWarnings.push(args);
			},
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
		setTimeout,
		clearTimeout,
		async copyTextWithButtonFeedback(value, button) {
			copied.push(value);
			actionSnapshots.push({
				type: "copy",
				copyDisabled: button.disabled,
				copyBusy: button.attributes["aria-busy"],
			});

			if (!button.copyFeedbackOriginalText) {
				button.copyFeedbackOriginalText = button.textContent;
			}

			const originalText = button.copyFeedbackOriginalText;

			if (copyGate) {
				await copyGate;
			}

			clearTimeout(button.copyFeedbackTimeout);
			button.textContent = copySucceeds ? "Copied!" : "Copy failed";
			button.copyFeedbackTimeout = setTimeout(() => {
				button.textContent = originalText;
				button.copyFeedbackOriginalText = null;
				button.copyFeedbackTimeout = null;
			}, 1800);

			return copySucceeds;
		},
		downloadTextFile(filename, value, mimeType) {
			downloads.push({ filename, value, mimeType });
			const prefix = filename.startsWith("networks") ? "network" : "company";
			const copyButton = elements.get(`copy-${prefix}-nuvio-json`);
			const downloadButton = elements.get(`download-${prefix}-nuvio-json`);
			actionSnapshots.push({
				type: "download",
				copyDisabled: copyButton.disabled,
				downloadDisabled: downloadButton.disabled,
				copyBusy: copyButton.attributes["aria-busy"],
				downloadBusy: downloadButton.attributes["aria-busy"],
			});
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
		getCompanyLogoUrl(company, size = "w500") {
			return company.logo_path ? `https://image.tmdb.org/t/p/${size}${company.logo_path}` : "";
		},
		getNetworkLogoUrl(network, size = "w500") {
			return network.logo_path ? `https://image.tmdb.org/t/p/${size}${network.logo_path}` : "";
		},
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
		actionSnapshots,
		loggedErrors,
		loggedWarnings,
		setCopySucceeds(value) {
			copySucceeds = value;
		},
		runAllTimers() {
			const timers = [...pendingTimers.values()];
			pendingTimers.clear();

			for (const timer of timers) {
				timer.callback();
			}

			return timers.map((timer) => timer.delay);
		},
		get pendingTimerCount() {
			return pendingTimers.size;
		},
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

test("company and network exports prefer curated artwork then cached TMDB logos then title/emoji", async () => {
	let fetchCount = 0;
	const bridge = createBridge(async () => {
		fetchCount += 1;
		return responseFor(createLookup());
	});
	const harness = createExporterHarness({
		bridge,
		companies: [
			{ id: 13, name: "Delta No-Image Studio" },
			{ id: 12, name: "Charlie TMDB Studio", logo_path: "/cached-company.png" },
			{ id: 11, name: "Bravo Published Fallback Studio", logo_path: "/must-not-win-company-11.png" },
			{ id: 10, name: "Alpha Curated Studio", logo_path: "/must-not-win-company-10.png" },
		],
		networks: [
			{ id: 23, name: "Delta No-Image Network" },
			{ id: 22, name: "Charlie TMDB Network", logo_path: "/cached-network.png" },
			{ id: 21, name: "Bravo Published Fallback Network", logo_path: "/must-not-win-network-21.png" },
			{ id: 20, name: "Alpha Curated Network", logo_path: "/must-not-win-network-20.png" },
		],
	});

	const [companyPayload, networkPayload] = await Promise.all([
		harness.context.getCompanyNuvioExportPayload(),
		harness.context.getNetworkNuvioExportPayload(),
	]);
	const companyCollection = JSON.parse(companyPayload.json)[0];
	const networkCollection = JSON.parse(networkPayload.json)[0];
	const [readyCompany, fallbackCompany, tmdbCompany, emojiCompany] = companyCollection.folders;
	const [readyNetwork, fallbackNetwork, tmdbNetwork, emojiNetwork] = networkCollection.folders;

	assert.equal(fetchCount, 1);
	assert.equal(companyPayload.runtimeLoadFailed, false);
	assert.equal(networkPayload.runtimeLoadFailed, false);
	assert.equal(readyCompany.title, "Alpha Curated Studio");
	assert.match(readyCompany.coverImageUrl, /companies\/10\.webp\?v=a{12}$/);
	assert.equal(readyCompany.hideTitle, true);
	assert.equal(readyCompany.coverEmoji, "");
	assert.equal(readyCompany.coverImageUrl.includes("must-not-win"), false);
	assert.equal(fallbackCompany.title, "Bravo Published Fallback Studio");
	assert.match(fallbackCompany.coverImageUrl, /companies\/11\.webp\?v=a{12}$/);
	assert.equal(fallbackCompany.hideTitle, true);
	assert.equal(tmdbCompany.coverImageUrl, "https://image.tmdb.org/t/p/w500/cached-company.png");
	assert.equal(tmdbCompany.hideTitle, false);
	assert.equal(tmdbCompany.coverEmoji, "");
	assert.equal(emojiCompany.coverImageUrl, "");
	assert.equal(emojiCompany.hideTitle, false);
	assert.equal(emojiCompany.coverEmoji, "🎬");
	assert.equal(emojiCompany.focusGifUrl, "");
	assert.equal(emojiCompany.focusGifEnabled, false);
	assert.equal(emojiCompany.sources[0].provider, "tmdb");
	assert.equal(emojiCompany.sources[0].tmdbSourceType, "COMPANY");
	assert.equal(emojiCompany.sources[0].mediaType, "MOVIE");
	assert.equal(readyNetwork.title, "Alpha Curated Network");
	assert.match(readyNetwork.coverImageUrl, /networks\/20\.webp\?v=b{12}$/);
	assert.match(fallbackNetwork.coverImageUrl, /networks\/21\.webp\?v=b{12}$/);
	assert.equal(tmdbNetwork.coverImageUrl, "https://image.tmdb.org/t/p/w500/cached-network.png");
	assert.equal(tmdbNetwork.hideTitle, false);
	assert.equal(tmdbNetwork.coverEmoji, "");
	assert.equal(emojiNetwork.coverImageUrl, "");
	assert.equal(emojiNetwork.hideTitle, false);
	assert.equal(emojiNetwork.coverEmoji, "📺");
	assert.equal(emojiNetwork.focusGifUrl, "");
	assert.equal(emojiNetwork.focusGifEnabled, false);
	assert.equal(emojiNetwork.sources[0].tmdbSourceType, "NETWORK");
	assert.equal(emojiNetwork.sources[0].mediaType, "TV");
	assert.deepEqual(emojiNetwork.catalogSources, []);
	assert.equal(companyCollection.focusGlowEnabled, true);
	assert.equal(networkCollection.focusGlowEnabled, true);
	assert.equal(companyCollection.backdropImageUrl, "https://example.test/company-backdrop.jpg");
	assert.equal(networkCollection.backdropImageUrl, "https://example.test/network-backdrop.jpg");
	assert.equal(emojiCompany.sources[0].sortBy, "popularity.desc");
	assert.equal(emojiNetwork.sources[0].sortBy, "popularity.desc");
	assert.equal(harness.loggedWarnings.length, 0);
});

test("runtime load failure still prepares valid cached-TMDB and title/emoji exports", async () => {
	let fetchCount = 0;
	const bridge = createBridge(async () => {
		fetchCount += 1;
		throw new Error("synthetic complete runtime failure");
	});
	const harness = createExporterHarness({
		bridge,
		companies: [
			{ id: 12, name: "Alpha Fallback Logo Studio", logo_path: "/failure-company.png" },
			{ id: 13, name: "Bravo Fallback Emoji Studio" },
		],
	});

	const companyPayload = await harness.context.prepareCompanyNuvioExport();
	const [tmdbFolder, emojiFolder] = JSON.parse(companyPayload.json)[0].folders;

	assert.equal(fetchCount, 1);
	assert.equal(companyPayload.runtimeLoadFailed, true);
	assert.equal(tmdbFolder.coverImageUrl, "https://image.tmdb.org/t/p/w500/failure-company.png");
	assert.equal(tmdbFolder.hideTitle, false);
	assert.equal(tmdbFolder.coverEmoji, "");
	assert.equal(emojiFolder.coverImageUrl, "");
	assert.equal(emojiFolder.hideTitle, false);
	assert.equal(emojiFolder.coverEmoji, "🎬");
	assert.equal(harness.loggedWarnings.length, 1);
	assert.match(harness.loggedWarnings[0][0], /using cached TMDB or title fallbacks/i);
	assert.equal(harness.loggedErrors.length, 0);
	assert.equal(harness.elements.get("copy-company-nuvio-json").disabled, false);
	assert.equal(harness.elements.get("download-company-nuvio-json").disabled, false);
	assert.equal(harness.elements.get("copy-company-nuvio-json").textContent, "Copy JSON");
	assert.equal(harness.elements.get("download-company-nuvio-json").textContent, "Download JSON");

	await harness.context.copyCompanyNuvioJson(harness.elements.get("copy-company-nuvio-json"));
	await harness.context.downloadCompanyNuvioJson();
	assert.equal(harness.copied[0], companyPayload.json);
	assert.equal(harness.downloads[0].value, companyPayload.json);

	harness.context.closeCompanyNuvioExportModal();
	const laterPayload = await harness.context.prepareCompanyNuvioExport();
	assert.ok(laterPayload);
	assert.equal(fetchCount, 2);
	assert.equal(harness.loggedWarnings.length, 2);
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

	assert.equal(fetchCount, 0);
	const firstPending = harness.context.prepareCompanyNuvioExport();
	const secondPending = harness.context.getCompanyNuvioExportPayload();
	assert.equal(harness.elements.get("copy-company-nuvio-json").disabled, true);
	assert.equal(harness.elements.get("download-company-nuvio-json").disabled, true);
	assert.equal(harness.elements.get("copy-company-nuvio-json").textContent, "Preparing…");
	assert.equal(harness.elements.get("download-company-nuvio-json").textContent, "Preparing…");

	releaseFetch();
	const [firstPayload, secondPayload] = await Promise.all([firstPending, secondPending]);

	assert.equal(fetchCount, 1);
	assert.equal(firstPayload, secondPayload);
	assert.equal(harness.createdIdCount, 2);
	assert.equal(await harness.context.getCompanyNuvioExportPayload(), firstPayload);
	assert.equal(harness.createdIdCount, 2);
	assert.equal(harness.elements.get("copy-company-nuvio-json").disabled, false);
	assert.equal(harness.elements.get("download-company-nuvio-json").disabled, false);
	assert.equal(harness.elements.get("copy-company-nuvio-json").textContent, "Copy JSON");
	assert.equal(harness.elements.get("download-company-nuvio-json").textContent, "Download JSON");

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

	harness.elements.get("company-nuvio-cover-url").value = "https://example.test/changed-backdrop.jpg";
	harness.context.invalidateCompanyNuvioExport();
	const changedCoverPayload = await harness.context.getCompanyNuvioExportPayload();

	assert.notEqual(changedCoverPayload, changedOptionsPayload);
	assert.equal(JSON.parse(changedCoverPayload.json)[0].backdropImageUrl, "https://example.test/changed-backdrop.jpg");
	assert.equal(harness.createdIdCount, 11);
});

test("cached export button feedback survives action refreshes and resets deterministically", async () => {
	let releaseCopy;
	const copyGate = new Promise((resolve) => {
		releaseCopy = resolve;
	});
	const bridge = createBridge(async () => responseFor(createLookup()));
	const harness = createExporterHarness({
		bridge,
		companies: [{ id: 10, name: "Alpha Studio" }],
		networks: [{ id: 20, name: "Alpha Network" }],
		copyGate,
	});
	const companyCopyButton = harness.elements.get("copy-company-nuvio-json");
	const companyDownloadButton = harness.elements.get("download-company-nuvio-json");
	const networkCopyButton = harness.elements.get("copy-network-nuvio-json");
	const networkDownloadButton = harness.elements.get("download-network-nuvio-json");

	const companyPreparing = harness.context.prepareCompanyNuvioExport();
	assert.equal(companyCopyButton.textContent, "Preparing…");
	assert.equal(companyDownloadButton.textContent, "Preparing…");
	assert.equal(companyCopyButton.disabled, true);
	assert.equal(companyDownloadButton.disabled, true);
	assert.equal(companyCopyButton.attributes["aria-busy"], "true");
	assert.equal(companyDownloadButton.attributes["aria-busy"], "true");
	const companyPayload = await companyPreparing;

	const networkPreparing = harness.context.prepareNetworkNuvioExport();
	assert.equal(networkCopyButton.textContent, "Preparing…");
	assert.equal(networkDownloadButton.textContent, "Preparing…");
	const networkPayload = await networkPreparing;

	for (const [copyButton, downloadButton] of [
		[companyCopyButton, companyDownloadButton],
		[networkCopyButton, networkDownloadButton],
	]) {
		assert.equal(copyButton.textContent, "Copy JSON");
		assert.equal(downloadButton.textContent, "Download JSON");
		assert.equal(copyButton.disabled, false);
		assert.equal(downloadButton.disabled, false);
		assert.equal(copyButton.attributes["aria-busy"], "false");
		assert.equal(downloadButton.attributes["aria-busy"], "false");
	}

	const companyCopyPending = harness.context.copyCompanyNuvioJson(companyCopyButton);
	while (harness.copied.length === 0) {
		await Promise.resolve();
	}

	assert.equal(companyCopyButton.disabled, true);
	assert.equal(companyDownloadButton.disabled, true);
	assert.equal(companyCopyButton.attributes["aria-busy"], "true");
	assert.equal(companyDownloadButton.attributes["aria-busy"], "true");
	releaseCopy();
	await companyCopyPending;

	assert.equal(companyCopyButton.textContent, "Copied!");
	assert.equal(companyCopyButton.disabled, false);
	assert.equal(companyCopyButton.attributes["aria-busy"], "false");
	assert.deepEqual(harness.runAllTimers(), [1800]);
	assert.equal(companyCopyButton.textContent, "Copy JSON");

	harness.setCopySucceeds(false);
	await harness.context.copyCompanyNuvioJson(companyCopyButton);
	assert.equal(companyCopyButton.textContent, "Copy failed");
	assert.equal(companyCopyButton.attributes["aria-busy"], "false");
	assert.deepEqual(harness.runAllTimers(), [1800]);
	assert.equal(companyCopyButton.textContent, "Copy JSON");

	harness.setCopySucceeds(true);
	await harness.context.copyNetworkNuvioJson(networkCopyButton);
	assert.equal(networkCopyButton.textContent, "Copied!");
	assert.equal(networkCopyButton.attributes["aria-busy"], "false");
	assert.deepEqual(harness.runAllTimers(), [1800]);
	assert.equal(networkCopyButton.textContent, "Copy JSON");

	await harness.context.copyCompanyNuvioJson(companyCopyButton);
	assert.equal(companyCopyButton.textContent, "Copied!");
	assert.equal(harness.pendingTimerCount, 1);
	const companyRepreparing = harness.context.prepareCompanyNuvioExport();
	assert.equal(companyCopyButton.textContent, "Preparing…");
	assert.equal(harness.pendingTimerCount, 0);
	await companyRepreparing;
	assert.equal(companyCopyButton.textContent, "Copy JSON");

	await harness.context.downloadCompanyNuvioJson();
	await harness.context.downloadNetworkNuvioJson();
	assert.equal(harness.downloads[0].value, companyPayload.json);
	assert.equal(harness.downloads[1].value, networkPayload.json);
	assert.equal(harness.copied[0], companyPayload.json);
	assert.equal(harness.copied[2], networkPayload.json);
	assert.equal(harness.createdIdCount, 4);
	assert.equal(
		harness.actionSnapshots
			.filter((snapshot) => snapshot.type === "download")
			.every(
				(snapshot) =>
					snapshot.copyDisabled &&
					snapshot.downloadDisabled &&
					snapshot.copyBusy === "true" &&
					snapshot.downloadBusy === "true",
			),
		true,
	);
});

test("production markup keeps simplified automatic artwork UI and no borrowed focus mappings", () => {
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
		"company-nuvio-use-logos",
		"network-nuvio-use-logos",
		"company-nuvio-artwork-status",
		"network-nuvio-artwork-status",
		"retry-company-nuvio-artwork",
		"retry-network-nuvio-artwork",
	]) {
		assert.equal(productionText.includes(obsolete), false, obsolete);
	}

	assert.equal(html.includes("Use curated artwork"), false);
	assert.equal(html.includes("Published artwork is ready"), false);
	assert.match(html, /type="module" src="\.\/js\/artwork-runtime-v1\.mjs\?v=__APP_ASSET_VERSION__"/);
	assert.match(adapter, /from "\.\/artwork-runtime\.mjs"/);
	assert.match(exporterSource, /getCompanyLogoUrl\(entity\)/);
	assert.match(exporterSource, /getNetworkLogoUrl\(entity\)/);
	assert.match(exporterSource, /Preparing…/);
	assert.match(exporterSource, /focusGifUrl: ""/);
	assert.match(exporterSource, /focusGifEnabled: false/);
	assert.match(exporterSource, /focusGlowEnabled: true/);
	assert.match(readme, /tomato's transparent covers pack/);
	assert.match(readme, /provenance of older self-hosted genre artwork/i);
});
