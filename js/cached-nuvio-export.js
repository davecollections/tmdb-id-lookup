const companySelectionPresets = {
	major: [2, 127928, 127929, 43, 174, 12, 33, 10146, 5, 559, 58, 4],
	miniMajor: [1632, 491, 21, 60, 41],
	animation: [
		6125, 3475, 3, 2785, 7899, 6760, 6704, 521, 42141, 2251, 3464, 24955, 4859, 10342,
	],
};
const networkSelectionPresets = {
	popularServices: [213, 1024, 3186, 2739, 2552, 4330, 453, 3353, 318, 1112, 2949, 1255, 4, 9, 6, 2, 16, 26, 247],
};
const networkPresetCollectionNames = {
	popularServices: "Popular Services",
};
const companyPresetCollectionNames = {
	major: "Major Studios",
	miniMajor: "Mini-Major Studios",
	animation: "Animation Studios",
};
const companyDefaultCollectionNames = new Set(["Studios", ...Object.values(companyPresetCollectionNames)]);
const networkDefaultCollectionNames = new Set(["Networks", ...Object.values(networkPresetCollectionNames)]);

let companyNuvioExportCache = null;
let companyNuvioExportPending = null;
let companyNuvioExportRevision = 0;
let companyNuvioExportPreparing = false;
let companyNuvioExportReady = false;
let companyNuvioExportActionPending = false;
let companyNuvioPreparationVersion = 0;
let networkNuvioExportCache = null;
let networkNuvioExportPending = null;
let networkNuvioExportRevision = 0;
let networkNuvioExportPreparing = false;
let networkNuvioExportReady = false;
let networkNuvioExportActionPending = false;
let networkNuvioPreparationVersion = 0;

function getCompanyNuvioOptions() {
	return {
		collectionName: document.getElementById("company-nuvio-collection-name").value.trim() || "Studios",
		collectionCoverUrl: document.getElementById("company-nuvio-cover-url").value.trim(),
	};
}

function getSelectedCompanyPresetName() {
	const selectedIds = [...selectedCompanyIds].map(Number);

	for (const [presetName, presetIds] of Object.entries(companySelectionPresets)) {
		if (selectedIds.length !== presetIds.length) {
			continue;
		}

		if (presetIds.every((id) => selectedCompanyIds.has(Number(id)))) {
			return presetName;
		}
	}

	return null;
}

function getCompanyDefaultCollectionName() {
	const presetName = getSelectedCompanyPresetName();

	return presetName ? companyPresetCollectionNames[presetName] : "Studios";
}

function getSelectedNetworks() {
	return networks
		.filter((network) => selectedNetworkIds.has(Number(network.id)))
		.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
}

function getNetworkNuvioOptions() {
	return {
		collectionName: document.getElementById("network-nuvio-collection-name").value.trim() || "Networks",
		collectionCoverUrl: document.getElementById("network-nuvio-cover-url").value.trim(),
	};
}

function getSelectedNetworkPresetName() {
	const selectedIds = [...selectedNetworkIds].map(Number);

	for (const [presetName, presetIds] of Object.entries(networkSelectionPresets)) {
		if (selectedIds.length !== presetIds.length) {
			continue;
		}

		if (presetIds.every((id) => selectedNetworkIds.has(Number(id)))) {
			return presetName;
		}
	}

	return null;
}

function getNetworkDefaultCollectionName() {
	const presetName = getSelectedNetworkPresetName();

	return presetName ? networkPresetCollectionNames[presetName] : "Networks";
}

function invalidateCompanyNuvioExport() {
	companyNuvioExportRevision += 1;
	companyNuvioExportCache = null;
}

function invalidateNetworkNuvioExport() {
	networkNuvioExportRevision += 1;
	networkNuvioExportCache = null;
}

function getV1ArtworkRuntimeBridge() {
	const bridge = window.nuvioArtworkRuntime;

	if (!bridge || typeof bridge.resolveLandscapeBatch !== "function") {
		throw new Error("The curated artwork runtime adapter is unavailable.");
	}

	return bridge;
}

async function resolveEntityArtwork(entityType, entities) {
	try {
		const results = await getV1ArtworkRuntimeBridge().resolveLandscapeBatch({
			entityType,
			tmdbIds: entities.map((entity) => Number(entity.id)),
		});

		return {
			results: results.map((result) => (result?.status === "ready" ? result : null)),
			runtimeLoadFailed: false,
		};
	} catch (error) {
		console.warn("Curated artwork unavailable; using cached TMDB or title fallbacks.", error);
		return {
			results: entities.map(() => null),
			runtimeLoadFailed: true,
		};
	}
}

function createEntityFolder({ entity, entityType, idFactory, artworkResult }) {
	const isCompany = entityType === "company";
	const curatedArtworkUrl = artworkResult?.status === "ready" ? artworkResult.assetUrl : "";
	const cachedTmdbLogoUrl = curatedArtworkUrl
		? ""
		: isCompany
			? getCompanyLogoUrl(entity)
			: getNetworkLogoUrl(entity);
	const coverImageUrl = curatedArtworkUrl || cachedTmdbLogoUrl;

	return {
		id: idFactory.create("folder"),
		title: entity.name,
		sources: [
			{
				title: entity.name,
				sortBy: "popularity.desc",
				tmdbId: Number(entity.id),
				filters: {},
				provider: "tmdb",
				mediaType: isCompany ? "MOVIE" : "TV",
				tmdbSourceType: isCompany ? "COMPANY" : "NETWORK",
			},
		],
		hideTitle: Boolean(curatedArtworkUrl),
		tileShape: "LANDSCAPE",
		coverEmoji: coverImageUrl ? "" : isCompany ? "🎬" : "📺",
		focusGifUrl: "",
		heroVideoUrl: "",
		titleLogoUrl: "",
		coverImageUrl,
		catalogSources: [],
		focusGifEnabled: false,
		heroBackdropUrl: "",
	};
}

function createEntityNuvioJson({ entities, entityType, options, artworkResults }) {
	const idFactory = createNuvioIdFactory();
	const folders = entities.map((entity, index) =>
		createEntityFolder({
			entity,
			entityType,
			idFactory,
			artworkResult: artworkResults[index],
		}),
	);
	const collection = {
		id: idFactory.create("collection"),
		title: options.collectionName,
		folders,
		pinToTop: false,
		viewMode: "TABBED_GRID",
		showAllTab: false,
		backdropImageUrl: options.collectionCoverUrl,
		focusGlowEnabled: true,
	};

	return [collection];
}

function getCompanyNuvioExportCacheKey(options, selectedCompanies) {
	return JSON.stringify({
		revision: companyNuvioExportRevision,
		options,
		ids: selectedCompanies.map((company) => Number(company.id)),
	});
}

async function getCompanyNuvioExportPayload() {
	if (!selectedCompanyIds.size) {
		return null;
	}

	const options = getCompanyNuvioOptions();
	const selectedCompanies = getSelectedCompanies();
	const cacheKey = getCompanyNuvioExportCacheKey(options, selectedCompanies);

	if (companyNuvioExportCache?.cacheKey === cacheKey) {
		return companyNuvioExportCache;
	}

	if (companyNuvioExportPending?.cacheKey === cacheKey) {
		return companyNuvioExportPending.promise;
	}

	const pendingRecord = {
		cacheKey,
		promise: null,
	};
	const promise = (async () => {
		const artwork = await resolveEntityArtwork("company", selectedCompanies);
		const value = createEntityNuvioJson({
			entities: selectedCompanies,
			entityType: "company",
			options,
			artworkResults: artwork.results,
		});

		return {
			cacheKey,
			filename: `${slugifyFilename(options.collectionName)}.nuvio.json`,
			json: `${JSON.stringify(value, null, "\t")}\n`,
			runtimeLoadFailed: artwork.runtimeLoadFailed,
		};
	})();

	pendingRecord.promise = promise;
	companyNuvioExportPending = pendingRecord;

	try {
		const payload = await promise;

		if (companyNuvioExportPending === pendingRecord) {
			companyNuvioExportCache = payload;
			companyNuvioExportPending = null;
		}

		return payload;
	} catch (error) {
		if (companyNuvioExportPending === pendingRecord) {
			companyNuvioExportPending = null;
		}

		throw error;
	}
}

function getNetworkNuvioExportCacheKey(options, selectedNetworks) {
	return JSON.stringify({
		revision: networkNuvioExportRevision,
		options,
		ids: selectedNetworks.map((network) => Number(network.id)),
	});
}

async function getNetworkNuvioExportPayload() {
	if (!selectedNetworkIds.size) {
		return null;
	}

	const options = getNetworkNuvioOptions();
	const selectedNetworks = getSelectedNetworks();
	const cacheKey = getNetworkNuvioExportCacheKey(options, selectedNetworks);

	if (networkNuvioExportCache?.cacheKey === cacheKey) {
		return networkNuvioExportCache;
	}

	if (networkNuvioExportPending?.cacheKey === cacheKey) {
		return networkNuvioExportPending.promise;
	}

	const pendingRecord = {
		cacheKey,
		promise: null,
	};
	const promise = (async () => {
		const artwork = await resolveEntityArtwork("network", selectedNetworks);
		const value = createEntityNuvioJson({
			entities: selectedNetworks,
			entityType: "network",
			options,
			artworkResults: artwork.results,
		});

		return {
			cacheKey,
			filename: `${slugifyFilename(options.collectionName)}.nuvio.json`,
			json: `${JSON.stringify(value, null, "\t")}\n`,
			runtimeLoadFailed: artwork.runtimeLoadFailed,
		};
	})();

	pendingRecord.promise = promise;
	networkNuvioExportPending = pendingRecord;

	try {
		const payload = await promise;

		if (networkNuvioExportPending === pendingRecord) {
			networkNuvioExportCache = payload;
			networkNuvioExportPending = null;
		}

		return payload;
	} catch (error) {
		if (networkNuvioExportPending === pendingRecord) {
			networkNuvioExportPending = null;
		}

		throw error;
	}
}

function refreshCachedExportSummary(prefix, collectionName, selectedCount) {
	document.getElementById(`${prefix}-nuvio-export-summary`).textContent =
		`This will create one ${collectionName} collection with ${selectedCount.toLocaleString()} folder${selectedCount === 1 ? "" : "s"}.`;
}

function setCachedExportButtons(prefix, { preparing, ready, actionPending }) {
	const copyButton = document.getElementById(`copy-${prefix}-nuvio-json`);
	const downloadButton = document.getElementById(`download-${prefix}-nuvio-json`);
	const busy = preparing || actionPending;

	copyButton.disabled = !ready || busy;
	downloadButton.disabled = !ready || busy;
	copyButton.textContent = preparing ? "Preparing…" : "Copy JSON";
	downloadButton.textContent = preparing ? "Preparing…" : "Download JSON";
	copyButton.setAttribute("aria-busy", String(busy));
	downloadButton.setAttribute("aria-busy", String(busy));
}

function refreshCompanyNuvioExportButtons() {
	setCachedExportButtons("company", {
		preparing: companyNuvioExportPreparing,
		ready: companyNuvioExportReady,
		actionPending: companyNuvioExportActionPending,
	});
}

function refreshNetworkNuvioExportButtons() {
	setCachedExportButtons("network", {
		preparing: networkNuvioExportPreparing,
		ready: networkNuvioExportReady,
		actionPending: networkNuvioExportActionPending,
	});
}

async function prepareCompanyNuvioExport() {
	const version = ++companyNuvioPreparationVersion;
	const options = getCompanyNuvioOptions();
	const selectedCount = selectedCompanyIds.size;

	refreshCachedExportSummary("company", options.collectionName, selectedCount);
	companyNuvioExportReady = false;
	companyNuvioExportPreparing = true;
	refreshCompanyNuvioExportButtons();

	try {
		const payload = await getCompanyNuvioExportPayload();

		if (version !== companyNuvioPreparationVersion || !payload) {
			if (payload?.runtimeLoadFailed && companyNuvioExportCache === payload) {
				companyNuvioExportCache = null;
			}

			return null;
		}

		companyNuvioExportPreparing = false;
		companyNuvioExportReady = true;
		refreshCompanyNuvioExportButtons();
		return payload;
	} catch (error) {
		if (version !== companyNuvioPreparationVersion) {
			return null;
		}

		console.error("Company Nuvio export preparation failed", error);
		companyNuvioExportPreparing = false;
		companyNuvioExportReady = false;
		refreshCompanyNuvioExportButtons();
		return null;
	}
}

async function prepareNetworkNuvioExport() {
	const version = ++networkNuvioPreparationVersion;
	const options = getNetworkNuvioOptions();
	const selectedCount = selectedNetworkIds.size;

	refreshCachedExportSummary("network", options.collectionName, selectedCount);
	networkNuvioExportReady = false;
	networkNuvioExportPreparing = true;
	refreshNetworkNuvioExportButtons();

	try {
		const payload = await getNetworkNuvioExportPayload();

		if (version !== networkNuvioPreparationVersion || !payload) {
			if (payload?.runtimeLoadFailed && networkNuvioExportCache === payload) {
				networkNuvioExportCache = null;
			}

			return null;
		}

		networkNuvioExportPreparing = false;
		networkNuvioExportReady = true;
		refreshNetworkNuvioExportButtons();
		return payload;
	} catch (error) {
		if (version !== networkNuvioPreparationVersion) {
			return null;
		}

		console.error("Network Nuvio export preparation failed", error);
		networkNuvioExportPreparing = false;
		networkNuvioExportReady = false;
		refreshNetworkNuvioExportButtons();
		return null;
	}
}

function openCompanyNuvioExportModal() {
	const selectedCount = selectedCompanyIds.size;

	if (!selectedCount) {
		return;
	}

	const nameInput = document.getElementById("company-nuvio-collection-name");
	const defaultCollectionName = getCompanyDefaultCollectionName();

	if (!nameInput.value.trim() || companyDefaultCollectionNames.has(nameInput.value.trim())) {
		nameInput.value = defaultCollectionName;
	}

	refreshCachedExportSummary("company", nameInput.value.trim(), selectedCount);
	openAppModal("company-nuvio-export-modal", nameInput);
	void prepareCompanyNuvioExport();
}

function closeCompanyNuvioExportModal() {
	companyNuvioPreparationVersion += 1;
	companyNuvioExportPreparing = false;
	companyNuvioExportReady = false;

	if (companyNuvioExportCache?.runtimeLoadFailed) {
		invalidateCompanyNuvioExport();
	}

	refreshCompanyNuvioExportButtons();
	closeNuvioImportHelpModal();
	closeAppModal("company-nuvio-export-modal");
}

function openNetworkNuvioExportModal() {
	const selectedCount = selectedNetworkIds.size;

	if (!selectedCount) {
		return;
	}

	const nameInput = document.getElementById("network-nuvio-collection-name");
	const defaultCollectionName = getNetworkDefaultCollectionName();

	if (!nameInput.value.trim() || networkDefaultCollectionNames.has(nameInput.value.trim())) {
		nameInput.value = defaultCollectionName;
	}

	refreshCachedExportSummary("network", nameInput.value.trim(), selectedCount);
	openAppModal("network-nuvio-export-modal", nameInput);
	void prepareNetworkNuvioExport();
}

function closeNetworkNuvioExportModal() {
	networkNuvioPreparationVersion += 1;
	networkNuvioExportPreparing = false;
	networkNuvioExportReady = false;

	if (networkNuvioExportCache?.runtimeLoadFailed) {
		invalidateNetworkNuvioExport();
	}

	refreshNetworkNuvioExportButtons();
	closeNuvioImportHelpModal();
	closeAppModal("network-nuvio-export-modal");
}

async function runCompanyNuvioExportAction(action) {
	if (companyNuvioExportActionPending || companyNuvioExportPreparing || !companyNuvioExportReady) {
		return;
	}

	companyNuvioExportActionPending = true;
	refreshCompanyNuvioExportButtons();

	try {
		const payload = await getCompanyNuvioExportPayload();

		if (payload) {
			await action(payload);
		}
	} catch (error) {
		console.error("Company Nuvio export action failed", error);
	} finally {
		companyNuvioExportActionPending = false;
		refreshCompanyNuvioExportButtons();
	}
}

async function runNetworkNuvioExportAction(action) {
	if (networkNuvioExportActionPending || networkNuvioExportPreparing || !networkNuvioExportReady) {
		return;
	}

	networkNuvioExportActionPending = true;
	refreshNetworkNuvioExportButtons();

	try {
		const payload = await getNetworkNuvioExportPayload();

		if (payload) {
			await action(payload);
		}
	} catch (error) {
		console.error("Network Nuvio export action failed", error);
	} finally {
		networkNuvioExportActionPending = false;
		refreshNetworkNuvioExportButtons();
	}
}

function downloadCompanyNuvioJson() {
	return runCompanyNuvioExportAction(async (payload) => {
		downloadTextFile(payload.filename, payload.json, "application/json");
		await Promise.resolve();
	});
}

function copyCompanyNuvioJson(button) {
	return runCompanyNuvioExportAction((payload) => copyTextWithButtonFeedback(payload.json, button));
}

function downloadNetworkNuvioJson() {
	return runNetworkNuvioExportAction(async (payload) => {
		downloadTextFile(payload.filename, payload.json, "application/json");
		await Promise.resolve();
	});
}

function copyNetworkNuvioJson(button) {
	return runNetworkNuvioExportAction((payload) => copyTextWithButtonFeedback(payload.json, button));
}

function clearCompanySelection() {
	selectedCompanyIds.clear();
	invalidateCompanyNuvioExport();
	render(getPageItems());
	updateCompanySelectionStatus();
	closeCompanyNuvioExportModal();
}

function selectCompanyPreset(presetName) {
	const presetIds = companySelectionPresets[presetName] || [];
	const availableIds = new Set(companies.map((company) => Number(company.id)));
	const selectableIds = presetIds.filter((id) => availableIds.has(Number(id))).map(Number);
	const shouldRemovePreset = selectableIds.length && selectableIds.every((id) => selectedCompanyIds.has(id));

	for (const id of selectableIds) {
		if (shouldRemovePreset) {
			selectedCompanyIds.delete(id);
		} else {
			selectedCompanyIds.add(id);
		}
	}

	invalidateCompanyNuvioExport();
	render(getPageItems());
	updateCompanySelectionStatus();
}

function clearNetworkSelection() {
	selectedNetworkIds.clear();
	invalidateNetworkNuvioExport();
	renderNetworks(getNetworkPageItems());
	updateNetworkSelectionStatus();
	closeNetworkNuvioExportModal();
}

function selectNetworkPreset(presetName) {
	const presetIds = networkSelectionPresets[presetName] || [];
	const availableIds = new Set(networks.map((network) => Number(network.id)));
	const selectableIds = presetIds.filter((id) => availableIds.has(Number(id))).map(Number);
	const shouldRemovePreset = selectableIds.length && selectableIds.every((id) => selectedNetworkIds.has(id));

	for (const id of selectableIds) {
		if (shouldRemovePreset) {
			selectedNetworkIds.delete(id);
		} else {
			selectedNetworkIds.add(id);
		}
	}

	invalidateNetworkNuvioExport();
	renderNetworks(getNetworkPageItems());
	updateNetworkSelectionStatus();
}

function updateCompanyPresetButtons() {
	document.querySelectorAll(".company-preset-button").forEach((button) => {
		const presetIds = companySelectionPresets[button.dataset.companyPreset] || [];
		const isActive = presetIds.length && presetIds.every((id) => selectedCompanyIds.has(Number(id)));

		button.classList.toggle("active", Boolean(isActive));
		button.setAttribute("aria-pressed", String(Boolean(isActive)));
	});
}

function updateNetworkPresetButtons() {
	document.querySelectorAll(".network-preset-button").forEach((button) => {
		const presetIds = networkSelectionPresets[button.dataset.networkPreset] || [];
		const isActive = presetIds.length && presetIds.every((id) => selectedNetworkIds.has(Number(id)));

		button.classList.toggle("active", Boolean(isActive));
		button.setAttribute("aria-pressed", String(Boolean(isActive)));
	});
}

function initCachedNuvioExportControls() {
	for (const id of ["company-nuvio-collection-name", "company-nuvio-cover-url"]) {
		document.getElementById(id).addEventListener("change", () => {
			invalidateCompanyNuvioExport();

			if (!document.getElementById("company-nuvio-export-modal").hidden) {
				void prepareCompanyNuvioExport();
			}
		});
	}

	for (const id of ["network-nuvio-collection-name", "network-nuvio-cover-url"]) {
		document.getElementById(id).addEventListener("change", () => {
			invalidateNetworkNuvioExport();

			if (!document.getElementById("network-nuvio-export-modal").hidden) {
				void prepareNetworkNuvioExport();
			}
		});
	}

	refreshCompanyNuvioExportButtons();
	refreshNetworkNuvioExportButtons();
}
