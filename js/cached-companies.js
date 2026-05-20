let companies = [];
let filteredCompanies = [];
let currentSearch = "";
let sortKey = "id";
let sortDirection = "asc";
let currentPage = 1;
let rowsPerPage = 25;
let minCompanyMovieCount = 0;

const selectedCompanyIds = new Set();

function setCompanyMovieCountFilter(minCount) {
	minCompanyMovieCount = Number(minCount || 0);

	document.querySelectorAll(".company-filter-button").forEach((button) => {
		button.classList.toggle("active", button.dataset.companyMinCount === String(minCompanyMovieCount));
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

function getSortValue(company, key) {
	const value = company[key];

	if (key === "id" || key === "titles_count") {
		return Number(value || 0);
	}

	return String(value || "").toLowerCase();
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

function goToPage(page) {
	currentPage = Math.min(Math.max(1, page), getTotalPages());

	render(getPageItems());
	updatePagination();
}
