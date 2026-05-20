let networks = [];
let filteredNetworks = [];
let currentNetworkSearch = "";
let networkSortKey = "id";
let networkSortDirection = "asc";
let currentNetworkPage = 1;
let networkRowsPerPage = 25;
let minNetworkTitleCount = 0;

const selectedNetworkIds = new Set();

function setNetworkTitleCountFilter(minCount) {
	minNetworkTitleCount = Number(minCount || 0);

	document.querySelectorAll(".network-filter-button").forEach((button) => {
		button.classList.toggle("active", button.dataset.networkMinCount === String(minNetworkTitleCount));
	});
}

async function loadNetworks() {
	if (networksLoaded || networksLoading) {
		return;
	}

	networksLoading = true;
	showTableLoading("network-results", 8, "Loading TV network IDs...");
	document.getElementById("network-stats").innerText = "Loading TMDB TV network IDs...";
	document.getElementById("network-result-count").innerText = "Loading TV networks...";

	try {
		const networksRes = await fetch(`./data/tv-networks.min.json?v=${CACHE_VERSION}`);

		if (!networksRes.ok) {
			throw new Error(`TV network cache HTTP ${networksRes.status}`);
		}

		const compactNetworks = await networksRes.json();

		networks = compactNetworks.map((network) => ({
			id: network.i,
			name: network.n || "",
			origin_country: network.c || "",
			headquarters: network.h || "",
			logo_path: network.l || "",
			titles_count: network.t || 0,
			tmdb_url: `https://www.themoviedb.org/network/${network.i}`,
		}));

		document.getElementById("network-stats").innerText = `${networks.length.toLocaleString()} TMDB TV network IDs cached`;
		const [auditSummary, rebuildMeta, repairMeta] = await Promise.all([
			loadCacheAuditSummary(),
			fetchJsonIfAvailable("./data/tv-network-rebuild-meta.json"),
			fetchJsonIfAvailable("./data/tv-network-cache-repair-meta.json"),
		]);

		networkMeta = normaliseCacheMeta({
			auditSummary,
			datasetName: "networks",
			itemCount: networks.length,
			rebuildMeta,
			repairMeta,
		});

		document.getElementById("network-stats").innerText =
			`${networkMeta.total_cached.toLocaleString()} of ${networkMeta.export_total_ids.toLocaleString()} TMDB TV network IDs cached`;
		document.getElementById("network-last-updated").innerText = `Last updated ${formatUpdatedDate(networkMeta.finished_at)}`;

		updateFooterStats();
		networksLoaded = true;
		applyNetworkFiltersAndSort();
	} catch {
		document.getElementById("network-stats").innerText = "TV network cache could not be loaded.";
		document.getElementById("network-result-count").innerText = "Could not load TV networks";
		showTableLoading("network-results", 8, "TV network cache could not be loaded.");
	} finally {
		networksLoading = false;
	}
}

function getNetworkSortValue(network, key) {
	const value = network[key];

	if (key === "id" || key === "titles_count") {
		return Number(value || 0);
	}

	return String(value || "").toLowerCase();
}

function getNetworkTotalPages() {
	return Math.max(1, Math.ceil(filteredNetworks.length / networkRowsPerPage));
}

function getNetworkPageItems() {
	const start = (currentNetworkPage - 1) * networkRowsPerPage;
	const end = start + networkRowsPerPage;

	return filteredNetworks.slice(start, end);
}

function applyNetworkFiltersAndSort() {
	const query = currentNetworkSearch.toLowerCase().trim();

	filteredNetworks = networks.filter((network) => {
		const matchesTitleCount = Number(network.titles_count || 0) >= minNetworkTitleCount;

		const matchesSearch =
			String(network.id).includes(query) ||
			String(network.name || "")
				.toLowerCase()
				.includes(query) ||
			getCountrySearchText(network.origin_country).includes(query) ||
			String(network.origin_country || "")
				.toLowerCase()
				.includes(query) ||
			String(network.headquarters || "")
				.toLowerCase()
				.includes(query);

		return matchesTitleCount && matchesSearch;
	});

	filteredNetworks.sort((a, b) => {
		const aValue = getNetworkSortValue(a, networkSortKey);
		const bValue = getNetworkSortValue(b, networkSortKey);

		if (aValue < bValue) {
			return networkSortDirection === "asc" ? -1 : 1;
		}

		if (aValue > bValue) {
			return networkSortDirection === "asc" ? 1 : -1;
		}

		return Number(a.id || 0) - Number(b.id || 0);
	});

	renderNetworks(getNetworkPageItems());
	updateNetworkPagination();
	updateNetworkSortIndicators();
	updateNetworkSelectionStatus();
}

function updateNetworkSortIndicators() {
	document.querySelectorAll(".network-sortable").forEach((th) => {
		const indicator = th.querySelector(".sort-indicator");

		if (th.dataset.networkSort === networkSortKey) {
			indicator.textContent = networkSortDirection === "asc" ? "▲" : "▼";
		} else {
			indicator.textContent = "";
		}
	});
}

function updateNetworkPagination() {
	const totalPages = getNetworkTotalPages();

	document.getElementById("network-page-status").innerText =
		`${currentNetworkPage.toLocaleString()} of ${totalPages.toLocaleString()}`;

	document.getElementById("network-page-status-bottom").innerText =
		`${currentNetworkPage.toLocaleString()} of ${totalPages.toLocaleString()}`;

	if (!filteredNetworks.length) {
		document.getElementById("network-result-count").innerText = `Showing 0 of 0 TV networks`;

		return;
	}

	const startItem = (currentNetworkPage - 1) * networkRowsPerPage + 1;

	const endItem = Math.min(currentNetworkPage * networkRowsPerPage, filteredNetworks.length);

	document.getElementById("network-result-count").innerText =
		`Showing ${startItem.toLocaleString()}–${endItem.toLocaleString()} of ${filteredNetworks.length.toLocaleString()} TV networks`;
}

function updateNetworkSelectionStatus() {
	const selectedCount = selectedNetworkIds.size;
	const status = document.getElementById("network-selection-status");
	const createButton = document.getElementById("create-network-nuvio-json");
	const clearButton = document.getElementById("clear-network-selection");

	status.textContent = selectedCount
		? `${selectedCount.toLocaleString()} selected`
		: "0 selected";

	createButton.disabled = selectedCount === 0;
	clearButton.disabled = selectedCount === 0;
	updateNetworkPresetButtons();
}

function createNetworkSelectionCell(network) {
	const cell = createElement("td", { className: "selection-cell" });
	const checkbox = createElement("input", {
		className: "selection-checkbox",
		attrs: {
			type: "checkbox",
			"aria-label": `Add ${network.name || "network"} to collection`,
		},
	});

	checkbox.checked = selectedNetworkIds.has(Number(network.id));
	checkbox.addEventListener("change", () => {
		if (checkbox.checked) {
			selectedNetworkIds.add(Number(network.id));
		} else {
			selectedNetworkIds.delete(Number(network.id));
		}

		updateNetworkSelectionStatus();
	});

	cell.appendChild(checkbox);

	return cell;
}

function renderNetworks(items) {
	const tbody = document.getElementById("network-results");
	tbody.replaceChildren();

	for (const network of items) {
		const tr = document.createElement("tr");
		const logoUrl = getNetworkLogoUrl(network, "w92");

		tr.appendChild(createNetworkSelectionCell(network));
		tr.appendChild(createLogoCell(logoUrl, network.name || "Network logo"));
		tr.appendChild(createCopyIdCell(network.id, "Copy network ID"));
		tr.appendChild(createElement("td", { text: network.name || "" }));
		tr.appendChild(createElement("td", { text: Number(network.titles_count || 0).toLocaleString() }));
		tr.appendChild(createElement("td", { text: network.origin_country || "" }));
		tr.appendChild(createElement("td", { text: network.headquarters || "" }));
		tr.appendChild(createOpenLinkCell(network.tmdb_url));

		tbody.appendChild(tr);
	}

	updateNetworkSelectionStatus();
}

function goToNetworkPage(page) {
	currentNetworkPage = Math.min(Math.max(1, page), getNetworkTotalPages());

	renderNetworks(getNetworkPageItems());
	updateNetworkPagination();
}
