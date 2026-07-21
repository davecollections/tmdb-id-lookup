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
const curatedArtworkFailureMessage =
	"Curated artwork could not be loaded. Try again, or turn off curated artwork to export using folder titles and emoji.";

let companyNuvioExportCache = null;
let companyNuvioExportPending = null;
let companyNuvioExportRevision = 0;
let companyNuvioExportState = "idle";
let companyNuvioExportActionPending = false;
let companyNuvioPreparationVersion = 0;
let networkNuvioExportCache = null;
let networkNuvioExportPending = null;
let networkNuvioExportRevision = 0;
let networkNuvioExportState = "idle";
let networkNuvioExportActionPending = false;
let networkNuvioPreparationVersion = 0;

function getCompanyNuvioOptions() {
	return {
		collectionName: document.getElementById("company-nuvio-collection-name").value.trim() || "Studios",
		collectionCoverUrl: document.getElementById("company-nuvio-cover-url").value.trim(),
		useCuratedArtwork: document.getElementById("company-nuvio-use-logos").checked,
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
		useCuratedArtwork: document.getElementById("network-nuvio-use-logos").checked,
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

async function resolveEntityArtwork(entityType, entities, enabled) {
	if (!enabled) {
		return {
			results: entities.map(() => null),
			summary: {
				enabled: false,
				readyCount: 0,
				fallbackCount: 0,
				missingCount: entities.length,
			},
		};
	}

	const results = await getV1ArtworkRuntimeBridge().resolveLandscapeBatch({
		entityType,
		tmdbIds: entities.map((entity) => Number(entity.id)),
	});
	let readyCount = 0;
	let fallbackCount = 0;
	let missingCount = 0;

	for (const result of results) {
		if (result.status === "ready") {
			readyCount += 1;
			fallbackCount += result.fallbackUsed ? 1 : 0;
			continue;
		}

		if (result.status === "missing") {
			missingCount += 1;
			continue;
		}

		throw new Error(`Unexpected curated artwork result: ${String(result.status)}`);
	}

	return {
		results,
		summary: {
			enabled: true,
			readyCount,
			fallbackCount,
			missingCount,
		},
	};
}

function createEntityFolder({ entity, entityType, idFactory, artworkResult }) {
	const isCompany = entityType === "company";
	const hasArtwork = artworkResult?.status === "ready";

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
		hideTitle: hasArtwork,
		tileShape: "LANDSCAPE",
		coverEmoji: hasArtwork ? "" : isCompany ? "🎬" : "📺",
		focusGifUrl: "",
		heroVideoUrl: "",
		titleLogoUrl: "",
		coverImageUrl: hasArtwork ? artworkResult.assetUrl : "",
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
		const artwork = await resolveEntityArtwork("company", selectedCompanies, options.useCuratedArtwork);
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
			summary: artwork.summary,
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
		const artwork = await resolveEntityArtwork("network", selectedNetworks, options.useCuratedArtwork);
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
			summary: artwork.summary,
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

function formatArtworkSummary(summary, total, emoji) {
	if (!summary.enabled) {
		return `Curated artwork is off. ${total.toLocaleString()} folder${total === 1 ? "" : "s"} will use visible titles and ${emoji}.`;
	}

	const ready = `${summary.readyCount.toLocaleString()} folder${summary.readyCount === 1 ? "" : "s"}`;
	const fallback = `${summary.fallbackCount.toLocaleString()} approved text fallback${summary.fallbackCount === 1 ? "" : "s"}`;
	const missing = `${summary.missingCount.toLocaleString()} folder${summary.missingCount === 1 ? "" : "s"}`;

	return `Published artwork is ready for ${ready}, including ${fallback}. ${missing} will use visible titles and ${emoji} because no published artwork is available.`;
}

function setCachedExportState(prefix, state, message, actionPending) {
	const status = document.getElementById(`${prefix}-nuvio-artwork-status`);
	const retry = document.getElementById(`retry-${prefix}-nuvio-artwork`);
	const copyButton = document.getElementById(`copy-${prefix}-nuvio-json`);
	const downloadButton = document.getElementById(`download-${prefix}-nuvio-json`);

	status.className = `cached-nuvio-artwork-status ${state}`;
	status.textContent = message;
	status.setAttribute("role", state === "error" ? "alert" : "status");
	status.setAttribute("aria-busy", String(state === "loading"));
	retry.hidden = state !== "error";
	copyButton.disabled = state !== "ready" || actionPending;
	downloadButton.disabled = state !== "ready" || actionPending;
}

function setCompanyNuvioExportState(state, message) {
	companyNuvioExportState = state;
	setCachedExportState("company", state, message, companyNuvioExportActionPending);
}

function setNetworkNuvioExportState(state, message) {
	networkNuvioExportState = state;
	setCachedExportState("network", state, message, networkNuvioExportActionPending);
}

async function prepareCompanyNuvioExport() {
	const version = ++companyNuvioPreparationVersion;
	const options = getCompanyNuvioOptions();
	const selectedCount = selectedCompanyIds.size;

	refreshCachedExportSummary("company", options.collectionName, selectedCount);
	setCompanyNuvioExportState(
		"loading",
		options.useCuratedArtwork ? "Preparing curated artwork…" : "Preparing export without curated artwork…",
	);

	try {
		const payload = await getCompanyNuvioExportPayload();

		if (version !== companyNuvioPreparationVersion || !payload) {
			return null;
		}

		setCompanyNuvioExportState("ready", formatArtworkSummary(payload.summary, selectedCount, "🎬"));
		return payload;
	} catch (error) {
		if (version !== companyNuvioPreparationVersion) {
			return null;
		}

		console.error("Company Nuvio export preparation failed", error);
		setCompanyNuvioExportState("error", curatedArtworkFailureMessage);
		return null;
	}
}

async function prepareNetworkNuvioExport() {
	const version = ++networkNuvioPreparationVersion;
	const options = getNetworkNuvioOptions();
	const selectedCount = selectedNetworkIds.size;

	refreshCachedExportSummary("network", options.collectionName, selectedCount);
	setNetworkNuvioExportState(
		"loading",
		options.useCuratedArtwork ? "Preparing curated artwork…" : "Preparing export without curated artwork…",
	);

	try {
		const payload = await getNetworkNuvioExportPayload();

		if (version !== networkNuvioPreparationVersion || !payload) {
			return null;
		}

		setNetworkNuvioExportState("ready", formatArtworkSummary(payload.summary, selectedCount, "📺"));
		return payload;
	} catch (error) {
		if (version !== networkNuvioPreparationVersion) {
			return null;
		}

		console.error("Network Nuvio export preparation failed", error);
		setNetworkNuvioExportState("error", curatedArtworkFailureMessage);
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
	closeNuvioImportHelpModal();
	closeAppModal("network-nuvio-export-modal");
}

async function runCompanyNuvioExportAction(action) {
	if (companyNuvioExportActionPending) {
		return;
	}

	companyNuvioExportActionPending = true;
	setCompanyNuvioExportState(companyNuvioExportState, document.getElementById("company-nuvio-artwork-status").textContent);

	try {
		const payload = await getCompanyNuvioExportPayload();

		if (payload) {
			await action(payload);
		}
	} catch (error) {
		console.error("Company Nuvio export action failed", error);
		setCompanyNuvioExportState("error", curatedArtworkFailureMessage);
	} finally {
		companyNuvioExportActionPending = false;
		setCompanyNuvioExportState(companyNuvioExportState, document.getElementById("company-nuvio-artwork-status").textContent);
	}
}

async function runNetworkNuvioExportAction(action) {
	if (networkNuvioExportActionPending) {
		return;
	}

	networkNuvioExportActionPending = true;
	setNetworkNuvioExportState(networkNuvioExportState, document.getElementById("network-nuvio-artwork-status").textContent);

	try {
		const payload = await getNetworkNuvioExportPayload();

		if (payload) {
			await action(payload);
		}
	} catch (error) {
		console.error("Network Nuvio export action failed", error);
		setNetworkNuvioExportState("error", curatedArtworkFailureMessage);
	} finally {
		networkNuvioExportActionPending = false;
		setNetworkNuvioExportState(networkNuvioExportState, document.getElementById("network-nuvio-artwork-status").textContent);
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
	for (const id of ["company-nuvio-collection-name", "company-nuvio-cover-url", "company-nuvio-use-logos"]) {
		document.getElementById(id).addEventListener("change", () => {
			invalidateCompanyNuvioExport();

			if (!document.getElementById("company-nuvio-export-modal").hidden) {
				void prepareCompanyNuvioExport();
			}
		});
	}

	for (const id of ["network-nuvio-collection-name", "network-nuvio-cover-url", "network-nuvio-use-logos"]) {
		document.getElementById(id).addEventListener("change", () => {
			invalidateNetworkNuvioExport();

			if (!document.getElementById("network-nuvio-export-modal").hidden) {
				void prepareNetworkNuvioExport();
			}
		});
	}

	document.getElementById("retry-company-nuvio-artwork").addEventListener("click", () => {
		void prepareCompanyNuvioExport();
	});
	document.getElementById("retry-network-nuvio-artwork").addEventListener("click", () => {
		void prepareNetworkNuvioExport();
	});
}
