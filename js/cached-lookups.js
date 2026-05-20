let companies = [];
let filteredCompanies = [];
let currentSearch = "";
let sortKey = "id";
let sortDirection = "asc";
let currentPage = 1;
let rowsPerPage = 25;
let minCompanyMovieCount = 0;
let networks = [];
let filteredNetworks = [];
let currentNetworkSearch = "";
let networkSortKey = "id";
let networkSortDirection = "asc";
let currentNetworkPage = 1;
let networkRowsPerPage = 25;
let minNetworkTitleCount = 0;
let companyMeta = null;
let networkMeta = null;
let cacheAuditSummary = null;
let companiesLoaded = false;
let companiesLoading = false;
let networksLoaded = false;
let networksLoading = false;
const selectedCompanyIds = new Set();
const selectedNetworkIds = new Set();
async function fetchJsonIfAvailable(path) {
	try {
		const response = await fetch(`${path}?v=${CACHE_VERSION}`);

		if (!response.ok) {
			return null;
		}

		return response.json();
	} catch {
		return null;
	}
}

async function loadCacheAuditSummary() {
	if (cacheAuditSummary !== null) {
		return cacheAuditSummary;
	}

	cacheAuditSummary = await fetchJsonIfAvailable("./data/id-audit-summary.json");

	return cacheAuditSummary;
}

function getAuditDataset(summary, datasetName) {
	return (summary?.datasets || []).find((dataset) => dataset.dataset === datasetName) || null;
}

function latestTimestamp(...timestamps) {
	let latest = "";

	for (const timestamp of timestamps) {
		if (!timestamp) {
			continue;
		}

		if (!latest || new Date(timestamp) > new Date(latest)) {
			latest = timestamp;
		}
	}

	return latest;
}

function normaliseCacheMeta({ auditSummary, datasetName, itemCount, rebuildMeta, repairMeta }) {
	const audit = getAuditDataset(auditSummary, datasetName);
	const rebuild = rebuildMeta?.last_rebuild || rebuildMeta?.last_scan || null;
	const repair = repairMeta?.last_repair || null;

	return {
		total_cached: itemCount,
		export_total_ids: audit?.export_total_ids ?? rebuild?.export_total_ids ?? itemCount,
		coverage_percent: audit?.coverage_percent ?? null,
		finished_at: latestTimestamp(auditSummary?.audited_at, rebuild?.finished_at, repair?.finished_at),
	};
}

function formatUpdatedDate(timestamp) {
	return timestamp ? new Date(timestamp).toLocaleString() : "Unknown";
}

function updateFooterStats() {
	const footer = document.getElementById("scan-stats");

	if (!footer || (!companyMeta && !networkMeta && !companies.length && !networks.length)) {
		return;
	}

	const companyCount = companyMeta?.total_cached || companies.length || 0;
	const networkCount = networkMeta?.total_cached || networks.length || 0;

	const updatedAt = latestTimestamp(companyMeta?.finished_at, networkMeta?.finished_at);

	const formattedDate = formatUpdatedDate(updatedAt);

	footer.innerText = `TMDB export sync • Companies: ${companyCount.toLocaleString()} • Networks: ${networkCount.toLocaleString()} • Updated ${formattedDate}`;
}

function setCompanyMovieCountFilter(minCount) {
	minCompanyMovieCount = Number(minCount || 0);

	document.querySelectorAll(".company-filter-button").forEach((button) => {
		button.classList.toggle("active", button.dataset.companyMinCount === String(minCompanyMovieCount));
	});
}

function setNetworkTitleCountFilter(minCount) {
	minNetworkTitleCount = Number(minCount || 0);

	document.querySelectorAll(".network-filter-button").forEach((button) => {
		button.classList.toggle("active", button.dataset.networkMinCount === String(minNetworkTitleCount));
	});
}

async function loadCompanies() {
	if (companiesLoaded || companiesLoading) {
		return;
	}

	companiesLoading = true;
	showTableLoading("results", 9, "Loading company IDs...");
	document.getElementById("stats").innerText = "Loading TMDB company IDs...";
	document.getElementById("result-count").innerText = "Loading companies...";

	try {
		const companiesRes = await fetch(`./data/companies.min.json?v=${CACHE_VERSION}`);

		if (!companiesRes.ok) {
			throw new Error(`Company cache HTTP ${companiesRes.status}`);
		}

		const compactCompanies = await companiesRes.json();

		companies = compactCompanies.map((company) => ({
			id: company.i,
			name: company.n || "",
			parent_company: company.p || "",
			origin_country: company.c || "",
			headquarters: company.h || "",
			logo_path: company.l || "",
			titles_count: company.t || 0,
			tmdb_url: `https://www.themoviedb.org/company/${company.i}`,
		}));

		document.getElementById("stats").innerText = `${companies.length.toLocaleString()} companies cached`;

		const [auditSummary, rebuildMeta, repairMeta] = await Promise.all([
			loadCacheAuditSummary(),
			fetchJsonIfAvailable("./data/company-rebuild-meta.json"),
			fetchJsonIfAvailable("./data/company-cache-repair-meta.json"),
		]);

		companyMeta = normaliseCacheMeta({
			auditSummary,
			datasetName: "companies",
			itemCount: companies.length,
			rebuildMeta,
			repairMeta,
		});

		document.getElementById("stats").innerText =
			`${companyMeta.total_cached.toLocaleString()} of ${companyMeta.export_total_ids.toLocaleString()} TMDB company IDs cached`;

		document.getElementById("last-updated").innerText = `Last updated ${formatUpdatedDate(companyMeta.finished_at)}`;

		updateFooterStats();
		companiesLoaded = true;
		applyFiltersAndSort();
	} catch {
		document.getElementById("stats").innerText = "Company cache could not be loaded.";
		document.getElementById("result-count").innerText = "Could not load companies";
		showTableLoading("results", 9, "Company cache could not be loaded.");
	} finally {
		companiesLoading = false;
	}
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

function showTableLoading(tbodyId, columnCount, message) {
	const tbody = document.getElementById(tbodyId);

	if (!tbody) {
		return;
	}

	tbody.replaceChildren(
		createElement("tr", {}, [
			createElement("td", {
				text: message,
				attrs: {
					colspan: String(columnCount),
				},
			}),
		]),
	);
}

function ensureCachedLookupDataForTab(tabName) {
	if (tabName === "companies") {
		loadCompanies();
		return;
	}

	if (tabName === "networks") {
		loadNetworks();
	}
}

function initCachedLookupLazyLoad() {
	const cachedSection = document.querySelector(".cached-tools-section");

	document.getElementById("stats").innerText = "Company IDs will load when this section opens.";
	document.getElementById("last-updated").innerText = "Last updated after cache loads";
	document.getElementById("network-stats").innerText = "TV network IDs will load when this tab opens.";
	document.getElementById("network-last-updated").innerText = "Last updated after cache loads";
	showTableLoading("results", 9, "Company IDs loading...");

	if (!cachedSection || !("IntersectionObserver" in window)) {
		window.requestIdleCallback?.(() => loadCompanies(), { timeout: 1500 }) || setTimeout(loadCompanies, 0);
		return;
	}

	const observer = new IntersectionObserver(
		(entries) => {
			if (entries.some((entry) => entry.isIntersecting)) {
				loadCompanies();
				observer.disconnect();
			}
		},
		{
			rootMargin: "600px 0px",
		},
	);

	observer.observe(cachedSection);
}

function getSortValue(company, key) {
	const value = company[key];

	if (key === "id" || key === "titles_count") {
		return Number(value || 0);
	}

	return String(value || "").toLowerCase();
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

function getTotalPages() {
	if (rowsPerPage === "all") {
		return 1;
	}

	return Math.max(1, Math.ceil(filteredCompanies.length / rowsPerPage));
}

function getPageItems() {
	if (rowsPerPage === "all") {
		return filteredCompanies;
	}

	const start = (currentPage - 1) * rowsPerPage;
	const end = start + rowsPerPage;

	return filteredCompanies.slice(start, end);
}

function applyFiltersAndSort() {
	const query = currentSearch.toLowerCase().trim();

	filteredCompanies = companies.filter((company) => {
		const matchesMovieCount = Number(company.titles_count || 0) >= minCompanyMovieCount;

		const matchesSearch =
			String(company.id).includes(query) ||
			String(company.name || "")
				.toLowerCase()
				.includes(query) ||
			String(company.parent_company || "")
				.toLowerCase()
				.includes(query) ||
			getCountrySearchText(company.origin_country).includes(query) ||
			String(company.origin_country || "")
				.toLowerCase()
				.includes(query) ||
			String(company.headquarters || "")
				.toLowerCase()
				.includes(query);

		return matchesMovieCount && matchesSearch;
	});

	filteredCompanies.sort((a, b) => {
		const aValue = getSortValue(a, sortKey);
		const bValue = getSortValue(b, sortKey);

		if (aValue < bValue) {
			return sortDirection === "asc" ? -1 : 1;
		}

		if (aValue > bValue) {
			return sortDirection === "asc" ? 1 : -1;
		}

		return Number(a.id || 0) - Number(b.id || 0);
	});

	render(getPageItems());
	updatePagination();
	updateSortIndicators();
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

function updateSortIndicators() {
	document.querySelectorAll("th.sortable").forEach((th) => {
		const indicator = th.querySelector(".sort-indicator");

		if (th.dataset.sort === sortKey) {
			indicator.textContent = sortDirection === "asc" ? "▲" : "▼";
		} else {
			indicator.textContent = "";
		}
	});
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

function updatePagination() {
	const totalPages = getTotalPages();

	document.getElementById("page-status").innerText =
		`${currentPage.toLocaleString()} of ${totalPages.toLocaleString()}`;

	document.getElementById("page-status-bottom").innerText =
		`${currentPage.toLocaleString()} of ${totalPages.toLocaleString()}`;

	if (!filteredCompanies.length) {
		document.getElementById("result-count").innerText = `Showing 0 of 0 companies`;
		return;
	}

	let startItem = 1;
	let endItem = filteredCompanies.length;

	if (rowsPerPage !== "all") {
		startItem = (currentPage - 1) * rowsPerPage + 1;
		endItem = Math.min(currentPage * rowsPerPage, filteredCompanies.length);
	}

	document.getElementById("result-count").innerText =
		`Showing ${startItem.toLocaleString()}–${endItem.toLocaleString()} of ${filteredCompanies.length.toLocaleString()} companies`;
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

function createLogoCell(logoUrl, altText) {
	const cell = createElement("td", { className: "logo-cell" });

	if (logoUrl) {
		cell.appendChild(
			createElement("div", { className: "logo-box" }, [
				createElement("img", {
					className: "studio-logo",
					attrs: {
						src: logoUrl,
						alt: altText,
						loading: "lazy",
						decoding: "async",
					},
				}),
			]),
		);
	} else {
		cell.appendChild(createElement("div", { className: "logo-placeholder" }));
	}

	return cell;
}

function createCopyIdCell(id, title) {
	const cell = document.createElement("td");
	const button = createElement("button", {
		className: "copy-id-button",
		text: id,
		attrs: {
			type: "button",
			title,
		},
	});

	button.addEventListener("click", () => copyId(id));
	cell.appendChild(button);

	return cell;
}

function getSelectedCompanies() {
	return companies
		.filter((company) => selectedCompanyIds.has(Number(company.id)))
		.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
}

function updateCompanySelectionStatus() {
	const selectedCount = selectedCompanyIds.size;
	const status = document.getElementById("company-selection-status");
	const createButton = document.getElementById("create-company-nuvio-json");
	const clearButton = document.getElementById("clear-company-selection");

	status.textContent = selectedCount
		? `${selectedCount.toLocaleString()} selected`
		: "0 selected";

	createButton.disabled = selectedCount === 0;
	clearButton.disabled = selectedCount === 0;
	updateCompanyPresetButtons();
}

function createCompanySelectionCell(company) {
	const cell = createElement("td", { className: "selection-cell" });
	const checkbox = createElement("input", {
		className: "selection-checkbox",
		attrs: {
			type: "checkbox",
			"aria-label": `Add ${company.name || "company"} to collection`,
		},
	});

	checkbox.checked = selectedCompanyIds.has(Number(company.id));
	checkbox.addEventListener("change", () => {
		if (checkbox.checked) {
			selectedCompanyIds.add(Number(company.id));
		} else {
			selectedCompanyIds.delete(Number(company.id));
		}

		updateCompanySelectionStatus();
	});

	cell.appendChild(checkbox);

	return cell;
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

function render(items) {
	const tbody = document.getElementById("results");
	tbody.replaceChildren();

	for (const company of items) {
		const tr = document.createElement("tr");
		const logoUrl = getCompanyLogoUrl(company, "w92");

		tr.appendChild(createCompanySelectionCell(company));
		tr.appendChild(createLogoCell(logoUrl, company.name || "Company logo"));
		tr.appendChild(createCopyIdCell(company.id, "Copy company ID"));
		tr.appendChild(createElement("td", { text: company.name || "" }));
		tr.appendChild(createElement("td", { text: company.parent_company || "" }));
		tr.appendChild(createElement("td", { text: Number(company.titles_count || 0).toLocaleString() }));
		tr.appendChild(createElement("td", { text: company.origin_country || "" }));
		tr.appendChild(createElement("td", { text: company.headquarters || "" }));
		tr.appendChild(createOpenLinkCell(company.tmdb_url));

		tbody.appendChild(tr);
	}

	updateCompanySelectionStatus();
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

function goToPage(page) {
	currentPage = Math.min(Math.max(1, page), getTotalPages());

	render(getPageItems());
	updatePagination();
}

function goToNetworkPage(page) {
	currentNetworkPage = Math.min(Math.max(1, page), getNetworkTotalPages());

	renderNetworks(getNetworkPageItems());
	updateNetworkPagination();
}

function initCachedLookups() {
	document.getElementById("search").addEventListener("input", (event) => {
		currentSearch = event.target.value;
		currentPage = 1;
		applyFiltersAndSort();
	});
	document.getElementById("network-search").addEventListener("input", (event) => {
		currentNetworkSearch = event.target.value;

		currentNetworkPage = 1;

		applyNetworkFiltersAndSort();
	});
	document.getElementById("clear-search").addEventListener("click", () => {
		currentSearch = "";
		currentPage = 1;

		document.getElementById("search").value = "";

		setCompanyMovieCountFilter(0);

		applyFiltersAndSort();
	});
	document.getElementById("clear-network-search").addEventListener("click", () => {
		currentNetworkSearch = "";

		currentNetworkPage = 1;

		document.getElementById("network-search").value = "";

		setNetworkTitleCountFilter(0);

		applyNetworkFiltersAndSort();
	});
	document.getElementById("rows-per-page").addEventListener("change", (event) => {
		rowsPerPage = Number(event.target.value);

		currentPage = 1;

		applyFiltersAndSort();
	});

	document.getElementById("network-rows-per-page").addEventListener("change", (event) => {
		networkRowsPerPage = Number(event.target.value);

		currentNetworkPage = 1;

		applyNetworkFiltersAndSort();
	});
	document.querySelectorAll("th.sortable").forEach((th) => {
		th.addEventListener("click", () => {
			const selectedSortKey = th.dataset.sort;

			if (sortKey === selectedSortKey) {
				sortDirection = sortDirection === "asc" ? "desc" : "asc";
			} else {
				sortKey = selectedSortKey;

				sortDirection = selectedSortKey === "titles_count" ? "desc" : "asc";
			}

			currentPage = 1;

			applyFiltersAndSort();
		});
	});

	document.querySelectorAll(".network-sortable").forEach((th) => {
		th.addEventListener("click", () => {
			const selectedSortKey = th.dataset.networkSort;

			if (networkSortKey === selectedSortKey) {
				networkSortDirection = networkSortDirection === "asc" ? "desc" : "asc";
			} else {
				networkSortKey = selectedSortKey;

				networkSortDirection = selectedSortKey === "titles_count" ? "desc" : "asc";
			}

			currentNetworkPage = 1;

			applyNetworkFiltersAndSort();
		});
	});

	document.getElementById("first-page").addEventListener("click", () => goToPage(1));

	document.getElementById("prev-page").addEventListener("click", () => goToPage(currentPage - 1));

	document.getElementById("next-page").addEventListener("click", () => goToPage(currentPage + 1));

	document.getElementById("last-page").addEventListener("click", () => goToPage(getTotalPages()));

	document.getElementById("first-page-bottom").addEventListener("click", () => goToPage(1));

	document.getElementById("prev-page-bottom").addEventListener("click", () => goToPage(currentPage - 1));

	document.getElementById("next-page-bottom").addEventListener("click", () => goToPage(currentPage + 1));

	document.getElementById("last-page-bottom").addEventListener("click", () => goToPage(getTotalPages()));

	document.getElementById("network-first-page").addEventListener("click", () => goToNetworkPage(1));

	document.getElementById("network-prev-page").addEventListener("click", () => goToNetworkPage(currentNetworkPage - 1));

	document.getElementById("network-next-page").addEventListener("click", () => goToNetworkPage(currentNetworkPage + 1));

	document.getElementById("network-last-page").addEventListener("click", () => goToNetworkPage(getNetworkTotalPages()));

	document.getElementById("network-first-page-bottom").addEventListener("click", () => goToNetworkPage(1));

	document
		.getElementById("network-prev-page-bottom")
		.addEventListener("click", () => goToNetworkPage(currentNetworkPage - 1));

	document
		.getElementById("network-next-page-bottom")
		.addEventListener("click", () => goToNetworkPage(currentNetworkPage + 1));

	document
		.getElementById("network-last-page-bottom")
		.addEventListener("click", () => goToNetworkPage(getNetworkTotalPages()));

	document.querySelectorAll(".company-filter-button").forEach((button) => {
		button.addEventListener("click", () => {
			setCompanyMovieCountFilter(button.dataset.companyMinCount || 0);

			currentPage = 1;
			applyFiltersAndSort();
		});
	});
	document.querySelectorAll(".network-filter-button").forEach((button) => {
		button.addEventListener("click", () => {
			setNetworkTitleCountFilter(button.dataset.networkMinCount || 0);

			currentNetworkPage = 1;

			applyNetworkFiltersAndSort();
		});
	});

	document.getElementById("download-csv-link").href = `./data/companies.csv?v=${CACHE_VERSION}`;
	document.getElementById("download-network-csv-link").href = `./data/tv-networks.csv?v=${CACHE_VERSION}`;
	document.querySelectorAll(".company-preset-button").forEach((button) => {
		button.addEventListener("click", () => selectCompanyPreset(button.dataset.companyPreset));
	});
	document.querySelectorAll(".network-preset-button").forEach((button) => {
		button.addEventListener("click", () => selectNetworkPreset(button.dataset.networkPreset));
	});
	document.getElementById("create-company-nuvio-json").addEventListener("click", openCompanyNuvioExportModal);
	document.getElementById("clear-company-selection").addEventListener("click", clearCompanySelection);
	document.getElementById("close-company-nuvio-export").addEventListener("click", closeCompanyNuvioExportModal);
	document.getElementById("cancel-company-nuvio-export").addEventListener("click", closeCompanyNuvioExportModal);
	document.getElementById("download-company-nuvio-json").addEventListener("click", downloadCompanyNuvioJson);
	document.getElementById("open-company-nuvio-import-help").addEventListener("click", openNuvioImportHelpModal);
	document.getElementById("create-network-nuvio-json").addEventListener("click", openNetworkNuvioExportModal);
	document.getElementById("clear-network-selection").addEventListener("click", clearNetworkSelection);
	document.getElementById("close-network-nuvio-export").addEventListener("click", closeNetworkNuvioExportModal);
	document.getElementById("cancel-network-nuvio-export").addEventListener("click", closeNetworkNuvioExportModal);
	document.getElementById("download-network-nuvio-json").addEventListener("click", downloadNetworkNuvioJson);
	document.getElementById("open-network-nuvio-import-help").addEventListener("click", openNuvioImportHelpModal);
	document.getElementById("company-nuvio-export-modal").addEventListener("click", (event) => {
		if (event.target.id === "company-nuvio-export-modal") {
			closeCompanyNuvioExportModal();
		}
	});
	document.getElementById("network-nuvio-export-modal").addEventListener("click", (event) => {
		if (event.target.id === "network-nuvio-export-modal") {
			closeNetworkNuvioExportModal();
		}
	});

	initCachedLookupLazyLoad();
}
