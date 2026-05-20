let companyMeta = null;
let networkMeta = null;
let cacheAuditSummary = null;
let companiesLoaded = false;
let companiesLoading = false;
let networksLoaded = false;
let networksLoading = false;
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
