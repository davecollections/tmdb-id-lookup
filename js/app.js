const TMDB_API_KEY = "__TMDB_API_KEY__";
const CACHE_VERSION = "20260512";

const countryDisplayNames =
	typeof Intl !== "undefined" && Intl.DisplayNames ? new Intl.DisplayNames(["en"], { type: "region" }) : null;

const countrySearchAliases = {
	GB: ["united kingdom", "uk", "great britain", "britain", "england"],
	KR: ["south korea", "korea"],
	US: ["united states", "usa", "america"],
};

function getCountrySearchText(countryCode) {
	const code = String(countryCode || "")
		.trim()
		.toUpperCase();

	if (!code) {
		return "";
	}

	const countryName = countryDisplayNames?.of(code) || "";
	const aliases = countrySearchAliases[code] || [];

	return [code, countryName, ...aliases].join(" ").toLowerCase();
}

const collectionAliases = {
	lotr: "lord of the rings",
	hp: "harry potter",
	mcu: "marvel",
	dceu: "dc",
	bttf: "back to the future",
	mi: "mission impossible",
	tdk: "dark knight",
	potc: "pirates of the caribbean",
	sw: "star wars",
	jp: "jurassic park",
	jw: "jurassic world",
};

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
let currentTmdbQuery = "";
let currentTmdbPage = 1;
let currentTmdbTotalPages = 1;
let currentTmdbFilter = "all";
let lastBulkPeopleResults = [];
let companyMeta = null;
let networkMeta = null;
let currentGenreSearch = "";
let currentGenreFilter = "all";
function updateFooterStats() {
	const footer = document.getElementById("scan-stats");

	if (!footer || (!companyMeta && !networkMeta && !companies.length && !networks.length)) {
		return;
	}

	const companyCount = companyMeta?.total_cached || companies.length || 0;
	const networkCount = networkMeta?.total_cached || networks.length || 0;

	const updatedAt = companyMeta?.finished_at || networkMeta?.finished_at;

	const formattedDate = updatedAt ? new Date(updatedAt).toLocaleString() : "Unknown";

	footer.innerText = `TMDB export sync • Companies: ${companyCount.toLocaleString()} • Networks: ${networkCount.toLocaleString()} • Updated ${formattedDate}`;
}

function showCopyToast() {
	const toast = document.getElementById("copy-toast");

	toast.classList.add("show");

	clearTimeout(window.copyToastTimeout);

	window.copyToastTimeout = setTimeout(() => {
		toast.classList.remove("show");
	}, 1800);
}

function copyId(id) {
	navigator.clipboard.writeText(String(id));
	showCopyToast();
}
function csvEscape(value) {
	const text = String(value ?? "");

	if (/[",\n\r]/.test(text)) {
		return `"${text.replaceAll('"', '""')}"`;
	}

	return text;
}

function downloadTextFile(filename, content, mimeType = "text/csv") {
	const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");

	link.href = url;
	link.download = filename;
	link.click();

	URL.revokeObjectURL(url);
}
function setTmdbFilter(filter) {
	currentTmdbFilter = filter;

	document.querySelectorAll(".lookup-filter-button").forEach((button) => {
		button.classList.toggle("active", button.dataset.tmdbFilter === currentTmdbFilter);
	});
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

function setActiveCachedTab(tabName) {
	document.querySelectorAll(".cached-tab-button").forEach((button) => {
		const isActive = button.dataset.cachedTab === tabName;

		button.classList.toggle("active", isActive);
		button.setAttribute("aria-selected", String(isActive));
	});

	document.querySelectorAll(".cached-tab-panel").forEach((panel) => {
		panel.classList.toggle("active", panel.dataset.cachedPanel === tabName);
	});
}

async function tmdbJson(url) {
	const res = await fetch(url);

	if (!res.ok) {
		return null;
	}

	return res.json();
}
async function tmdbJsonWithStatus(url) {
	try {
		const res = await fetch(url);

		if (res.status === 429) {
			return {
				ok: false,
				rateLimited: true,
				status: 429,
				data: null,
			};
		}

		if (!res.ok) {
			return {
				ok: false,
				rateLimited: false,
				status: res.status,
				data: null,
			};
		}

		return {
			ok: true,
			rateLimited: false,
			status: res.status,
			data: await res.json(),
		};
	} catch {
		return {
			ok: false,
			rateLimited: false,
			status: 0,
			data: null,
		};
	}
}
async function getPersonKnownCredits(personId) {
	try {
		const credits = await tmdbJson(
			`https://api.themoviedb.org/3/person/${personId}/combined_credits?api_key=${TMDB_API_KEY}`,
		);

		if (!credits) {
			return "—";
		}

		const castCount = Array.isArray(credits.cast) ? credits.cast.length : 0;

		const crewCount = Array.isArray(credits.crew) ? credits.crew.length : 0;

		return (castCount + crewCount).toLocaleString();
	} catch {
		return "—";
	}
}

async function loadCompanies() {
	const companiesRes = await fetch(`./data/companies.min.json?v=${CACHE_VERSION}`);

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

	try {
		const metaRes = await fetch(`./data/company-rebuild-meta.json?v=${CACHE_VERSION}`);

		if (metaRes.ok) {
			const meta = await metaRes.json();
			const lastRebuild = meta.last_rebuild;
			companyMeta = lastRebuild;
			const updated = new Date(lastRebuild.finished_at);

			document.getElementById("stats").innerText =
				`${companies.length.toLocaleString()} of ${lastRebuild.export_total_ids.toLocaleString()} TMDB company IDs cached`;

			document.getElementById("last-updated").innerText = `Last updated ${updated.toLocaleString()}`;
		}
	} catch (error) {
		console.warn("company-rebuild-meta.json not available yet");
	}

	updateFooterStats();
	applyFiltersAndSort();
}
async function loadNetworks() {
	const networksRes = await fetch(`./data/tv-networks.min.json?v=${CACHE_VERSION}`);

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

	document.getElementById("network-stats").innerText =
		`${networks.length.toLocaleString()} TMDB TV network IDs cached`;
	try {
		const metaRes = await fetch(`./data/tv-network-rebuild-meta.json?v=${CACHE_VERSION}`);

		if (metaRes.ok) {
			const meta = await metaRes.json();
			const lastRebuild = meta.last_rebuild;
			networkMeta = lastRebuild;

			document.getElementById("network-stats").innerText =
				`${networks.length.toLocaleString()} of ${lastRebuild.export_total_ids.toLocaleString()} TMDB TV network IDs cached`;
		}
	} catch (error) {
		console.warn("tv-network-rebuild-meta.json not available yet");
	}

	updateFooterStats();
	applyNetworkFiltersAndSort();
}
function createResultCard({ title, type, id, imageUrl, imageAlt, metaRows, tmdbUrl, imageClass = "" }) {
	return `
              <div class="collection-card">
                ${
						imageUrl
							? `<img
                        src="${imageUrl}"
                        alt="${imageAlt}"
                        class="collection-poster ${imageClass}"
                      >`
							: `<div class="collection-poster ${imageClass}"></div>`
					}

                <div class="collection-info">
                  <h3>${title}</h3>

                  <div class="collection-meta">
                    <div><strong>Type:</strong> ${type}</div>
                    <div><strong>ID:</strong> ${id}</div>
                    ${metaRows.join("")}
                  </div>

                  <div class="collection-actions">
                    <button type="button" onclick="copyId('${id}')">
                      Copy ID
                    </button>

                    <a href="${tmdbUrl}" target="_blank" rel="noopener">
                      Open on TMDB
                    </a>
                  </div>
                </div>
              </div>
            `;
}

function collectionCard(collection, movieCount = "—") {
	const poster = collection.poster_path ? `https://image.tmdb.org/t/p/w185${collection.poster_path}` : "";
	const metaRows = [`<div><strong>Movies:</strong> ${movieCount}</div>`];

	return createResultCard({
		title: collection.name || "Untitled Collection",
		type: "Movie Collection",
		id: collection.id,
		imageUrl: poster,
		imageAlt: collection.name || "Collection poster",
		metaRows,
		tmdbUrl: `https://www.themoviedb.org/collection/${collection.id}`,
	});
}

function personCard(person, knownCredits = "—") {
	const profile = person.profile_path ? `https://image.tmdb.org/t/p/w185${person.profile_path}` : "";

	const knownFor = person.known_for_department || "—";
	const popularity = person.popularity ? Number(person.popularity).toFixed(1) : "—";

	const metaRows = [
		`<div><strong>Known for:</strong> ${knownFor}</div>`,
		`<div><strong>Known credits:</strong> ${knownCredits}</div>`,
		`<div><strong>TMDB popularity:</strong> ${popularity}</div>`,
	];

	if (person.birthday) {
		metaRows.push(`<div><strong>Born:</strong> ${person.birthday}</div>`);
	}

	return createResultCard({
		title: person.name || "Untitled Person",
		type: "Person",
		id: person.id,
		imageUrl: profile,
		imageAlt: person.name || "Person profile",
		metaRows,
		tmdbUrl: `https://www.themoviedb.org/person/${person.id}`,
	});
}

async function getCollectionMovieCount(collectionId) {
	const detailData = await tmdbJson(
		`https://api.themoviedb.org/3/collection/${collectionId}?api_key=${TMDB_API_KEY}`,
	);

	if (!detailData || detailData.success === false) {
		return null;
	}

	return {
		collection: detailData,
		movieCount: detailData.parts ? detailData.parts.length.toLocaleString() : "—",
	};
}
function getLookupResultLimit() {
	return window.matchMedia("(max-width: 720px)").matches ? 5 : 10;
}
async function searchTmdbIds(page = 1) {
	let query = document.getElementById("collection-search").value.trim();

	const resultsContainer = document.getElementById("collection-results");

	if (!query) {
		resultsContainer.innerHTML = "";
		return;
	}

	currentTmdbQuery = query;
	currentTmdbPage = page;

	const normalizedQuery = query.toLowerCase();

	if (collectionAliases[normalizedQuery]) {
		query = collectionAliases[normalizedQuery];
	}

	const isNumeric = /^\d+$/.test(query);

	resultsContainer.innerHTML = `<p class="meta">Searching TMDB...</p>`;

	try {
		const cards = [];

		if (isNumeric) {
			currentTmdbTotalPages = 1;

			if (currentTmdbFilter === "all" || currentTmdbFilter === "collections") {
				const collectionResult = await getCollectionMovieCount(query);

				if (collectionResult) {
					cards.push(collectionCard(collectionResult.collection, collectionResult.movieCount));
				}
			}

			if (currentTmdbFilter === "all" || currentTmdbFilter === "actors" || currentTmdbFilter === "directors") {
				const person = await tmdbJson(`https://api.themoviedb.org/3/person/${query}?api_key=${TMDB_API_KEY}`);

				if (person && person.success !== false) {
					const isActor = person.known_for_department === "Acting";
					const isDirector = person.known_for_department === "Directing";

					const shouldShowPerson =
						currentTmdbFilter === "all" ||
						(currentTmdbFilter === "actors" && isActor) ||
						(currentTmdbFilter === "directors" && isDirector);

					if (shouldShowPerson) {
						const knownCredits = await getPersonKnownCredits(person.id);

						cards.push(personCard(person, knownCredits));
					}
				}
			}
		} else {
			const collectionSearch = await tmdbJson(
				`https://api.themoviedb.org/3/search/collection?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&page=${page}`,
			);

			const personSearch = await tmdbJson(
				`https://api.themoviedb.org/3/search/person?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&page=${page}`,
			);

			const lookupResultLimit = getLookupResultLimit();

			const collectionLimit = currentTmdbFilter === "all" ? Math.ceil(lookupResultLimit / 2) : lookupResultLimit;

			const peopleLimit = currentTmdbFilter === "all" ? Math.floor(lookupResultLimit / 2) : lookupResultLimit;

			const collections =
				currentTmdbFilter === "all" || currentTmdbFilter === "collections"
					? (collectionSearch?.results || []).slice(0, collectionLimit)
					: [];

			let people = personSearch?.results || [];

			if (currentTmdbFilter === "actors") {
				people = people.filter((person) => person.known_for_department === "Acting");
			}

			if (currentTmdbFilter === "directors") {
				people = people.filter((person) => person.known_for_department === "Directing");
			}

			if (currentTmdbFilter === "collections") {
				people = [];
			}

			people = people.slice(0, peopleLimit);

			if (currentTmdbFilter === "collections") {
				currentTmdbTotalPages = collectionSearch?.total_pages || 1;
			} else if (currentTmdbFilter === "actors" || currentTmdbFilter === "directors") {
				currentTmdbTotalPages = personSearch?.total_pages || 1;
			} else {
				currentTmdbTotalPages = Math.max(collectionSearch?.total_pages || 1, personSearch?.total_pages || 1);
			}

			const collectionCards = await Promise.all(
				collections.map(async (collection) => {
					const detail = await getCollectionMovieCount(collection.id);
					const hydratedCollection = detail?.collection || collection;
					return collectionCard(hydratedCollection, detail?.movieCount || "—");
				}),
			);

			const personCards = await Promise.all(
				people.map(async (person) => {
					const knownCredits = await getPersonKnownCredits(person.id);

					return personCard(person, knownCredits);
				}),
			);

			cards.push(...collectionCards);
			cards.push(...personCards);
		}

		if (!cards.length) {
			resultsContainer.innerHTML = `<p class="meta">No matching movie collections or people found.</p>`;
			return;
		}

		let resultsHtml = "";

		if (!isNumeric && currentTmdbTotalPages > 1) {
			resultsHtml += `
        <div class="lookup-pagination">
          <button
            type="button"
            ${currentTmdbPage <= 1 ? "disabled" : ""}
            onclick="searchTmdbIds(${currentTmdbPage - 1})"
          >
            Previous
          </button>

          <span class="lookup-pagination-status">
            ${currentTmdbPage} of ${currentTmdbTotalPages}
          </span>

          <button
            type="button"
            ${currentTmdbPage >= currentTmdbTotalPages ? "disabled" : ""}
            onclick="searchTmdbIds(${currentTmdbPage + 1})"
          >
            Next
          </button>
        </div>
      `;
		}

		if (!isNumeric && currentTmdbTotalPages > 3) {
			resultsHtml += `
        <div class="lookup-pagination-help">
          Lots of results? Try a more specific search for better matches.
        </div>
      `;
		}

		resultsHtml += cards.join("");

		resultsContainer.innerHTML = resultsHtml;
	} catch (error) {
		resultsContainer.innerHTML = `<p class="meta">TMDB lookup failed.</p>`;
		console.error(error);
	}
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
function render(items) {
	const tbody = document.getElementById("results");
	tbody.innerHTML = "";

	for (const company of items) {
		const tr = document.createElement("tr");

		const logoUrl = company.logo_path ? `https://image.tmdb.org/t/p/w92${company.logo_path}` : "";

		tr.innerHTML = `
                <td class="logo-cell">
                  ${
							logoUrl
								? `<div class="logo-box">
                          <img
                            src="${logoUrl}"
                            alt="${company.name}"
                            class="studio-logo"
                          >
                        </div>`
								: `<div class="logo-placeholder"></div>`
						}
                </td>

                <td>
                  <button
                    type="button"
                    class="copy-id-button"
                    title="Copy company ID"
                    onclick="copyId('${company.id}')"
                  >
                    ${company.id}
                  </button>
                </td>

                <td>${company.name || ""}</td>
                <td>${company.parent_company || ""}</td>
                <td>${Number(company.titles_count || 0).toLocaleString()}</td>
                <td>${company.origin_country || ""}</td>
                <td>${company.headquarters || ""}</td>

                <td>
                  <a
                    href="${company.tmdb_url}"
                    target="_blank"
                    rel="noopener"
                  >
                    Open
                  </a>
                </td>
              `;

		tbody.appendChild(tr);
	}
}
function renderNetworks(items) {
	const tbody = document.getElementById("network-results");

	tbody.innerHTML = "";

	for (const network of items) {
		const tr = document.createElement("tr");

		const logoUrl = network.logo_path ? `https://image.tmdb.org/t/p/w92${network.logo_path}` : "";

		tr.innerHTML = `
<td class="logo-cell">
	${
		logoUrl
			? `<div class="logo-box">
					<img
						src="${logoUrl}"
						alt="${network.name}"
						class="studio-logo"
					>
				</div>`
			: `<div class="logo-placeholder"></div>`
	}
</td>

<td>
	<button
		type="button"
		class="copy-id-button"
		title="Copy network ID"
		onclick="copyId('${network.id}')"
	>
		${network.id}
	</button>
</td>

<td>${network.name || ""}</td>

<td>${Number(network.titles_count || 0).toLocaleString()}</td>

<td>${network.origin_country || ""}</td>

<td>${network.headquarters || ""}</td>

<td>
	<a
		href="${network.tmdb_url}"
		target="_blank"
		rel="noopener"
	>
		Open
	</a>
</td>
`;

		tbody.appendChild(tr);
	}
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
function getBulkPeopleNames() {
	return document
		.getElementById("bulk-people-input")
		.value.split("\n")
		.map((name) => name.trim())
		.filter(Boolean);
}

function renderBulkPeopleResults(results) {
	const container = document.getElementById("bulk-people-results");

	if (!results.length) {
		container.innerHTML = "";
		return;
	}

	container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Input</th>
          <th>Match</th>
          <th>TMDB ID</th>
<th>Known For</th>
<th>Credit Count</th>
<th>Match Type</th>
          <th>TMDB</th>
        </tr>
      </thead>
      <tbody>
        ${results
		.map(
			(result) => `
              <tr>
                <td>${result.input}</td>
                <td>${result.name || ""}</td>
                <td>
                  ${
							result.id
								? `<button
                          type="button"
                          class="copy-id-button"
                          onclick="copyId('${result.id}')"
                        >
                          ${result.id}
                        </button>`
								: ""
						}
                </td>
<td>${result.knownFor || "—"}</td>
<td>${result.creditCount || "—"}</td>
<td>${result.status}</td>
                <td>
                  ${
							result.id
								? `<a
                          href="https://www.themoviedb.org/person/${result.id}"
                          target="_blank"
                          rel="noopener"
                        >
                          Open
                        </a>`
								: ""
						}
                </td>
              </tr>
            `,
		)
		.join("")}
      </tbody>
    </table>
  `;
}

function downloadBulkPeopleCsv(mode) {
	if (!lastBulkPeopleResults.length) {
		return;
	}

	const headers = ["input", "matched_name", "tmdb_person_id", "known_for", "credit_count", "match_type"];

	const csv =
		headers.join(",") +
		"\n" +
		lastBulkPeopleResults
			.map((result) =>
				[
					result.input,
					result.name || "",
					result.id || "",
					result.knownFor || "",
					result.creditCount || "",
					result.status,
				]
					.map(csvEscape)
					.join(","),
			)
			.join("\n") +
		"\n";

	downloadTextFile(`tmdb-${mode}-ids.csv`, csv);
}
function normalizePersonName(name) {
	return String(name || "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

function findBestPeopleMatch(results, input) {
	const normalizedInput = normalizePersonName(input);
	const exactMatch = (results || []).find((person) => normalizePersonName(person.name) === normalizedInput);

	if (exactMatch) {
		return {
			person: exactMatch,
			matchType: "Exact match",
		};
	}

	const bestResult = (results || [])[0];

	if (bestResult) {
		return {
			person: bestResult,
			matchType: "TMDB best result",
		};
	}

	return {
		person: null,
		matchType: "No match",
	};
}
async function resolveBulkPeople() {
	const status = document.getElementById("bulk-people-status");
	const names = getBulkPeopleNames();

	if (!names.length) {
		lastBulkPeopleResults = [];
		renderBulkPeopleResults([]);

		status.innerText = "Paste one name per line first.";
		return;
	}

	if (names.length > 50) {
		lastBulkPeopleResults = [];
		renderBulkPeopleResults([]);

		status.innerText = `You entered ${names.length} names. Please limit each bulk lookup to 50 names.`;
		return;
	}

	status.innerText = "Resolving people IDs...";
	lastBulkPeopleResults = [];
	renderBulkPeopleResults([]);

	for (const input of names) {
		try {
			const response = await tmdbJsonWithStatus(
				`https://api.themoviedb.org/3/search/person?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(input)}&page=1`,
			);

			if (response.rateLimited) {
				lastBulkPeopleResults.push({
					input,
					name: "",
					id: "",
					knownFor: "",
					creditCount: "",
					status: "TMDB rate limit reached",
				});

				break;
			}

			if (!response.ok) {
				lastBulkPeopleResults.push({
					input,
					name: "",
					id: "",
					knownFor: "",
					creditCount: "",
					status: response.status ? `TMDB error HTTP ${response.status}` : "Network error",
				});

				continue;
			}

			const match = findBestPeopleMatch(response.data?.results || [], input);

			if (match.person) {
				const knownCredits = await getPersonKnownCredits(match.person.id);

				lastBulkPeopleResults.push({
					input,
					name: match.person.name || "",
					id: match.person.id,
					knownFor: match.person.known_for_department || "—",
					creditCount: knownCredits,
					status: match.matchType,
				});
			} else {
				lastBulkPeopleResults.push({
					input,
					name: "",
					id: "",
					knownFor: "",
					creditCount: "",
					status: match.matchType,
				});
			}
		} catch {
			lastBulkPeopleResults.push({
				input,
				name: "",
				id: "",
				knownFor: "",
				creditCount: "",
				status: "Lookup failed",
			});
		}
	}

	renderBulkPeopleResults(lastBulkPeopleResults);

	const matchedCount = lastBulkPeopleResults.filter((result) => result.id).length;

	status.innerHTML = `
    Resolved people IDs:
    matched ${matchedCount} of ${names.length}.
    ${
matchedCount
	? `<button type="button" onclick="downloadBulkPeopleCsv('people')">
            Download CSV
          </button>`
	: ""
}
  `;
}

document.querySelectorAll(".cached-tab-button").forEach((button) => {
	button.addEventListener("click", () => {
		setActiveCachedTab(button.dataset.cachedTab || "companies");
	});
});

document.getElementById("collection-search-btn").addEventListener("click", () => {
	setTmdbFilter("all");
	searchTmdbIds(1);
});

document.getElementById("collection-search").addEventListener("keydown", (event) => {
	if (event.key === "Enter") {
		setTmdbFilter("all");
		searchTmdbIds(1);
	}
});

document.getElementById("clear-collection-search").addEventListener("click", () => {
	document.getElementById("collection-search").value = "";
	document.getElementById("collection-results").innerHTML = "";

	setTmdbFilter("all");

	document.getElementById("collection-search").focus();
});

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

document.getElementById("back-to-top").addEventListener("click", () => {
	window.scrollTo({
		top: 0,
		behavior: "smooth",
	});
});
document.getElementById("network-first-page").addEventListener("click", () => goToNetworkPage(1));

document
	.getElementById("network-prev-page")
	.addEventListener("click", () => goToNetworkPage(currentNetworkPage - 1));

document
	.getElementById("network-next-page")
	.addEventListener("click", () => goToNetworkPage(currentNetworkPage + 1));

document
	.getElementById("network-last-page")
	.addEventListener("click", () => goToNetworkPage(getNetworkTotalPages()));

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
document.querySelectorAll(".lookup-filter-button").forEach((button) => {
	button.addEventListener("click", () => {
		setTmdbFilter(button.dataset.tmdbFilter || "all");

		if (document.getElementById("collection-search").value.trim()) {
			searchTmdbIds(1);
		}
	});
});
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
document.getElementById("bulk-people-btn").addEventListener("click", () => {
	resolveBulkPeople();
});

document.getElementById("clear-bulk-people").addEventListener("click", () => {
	document.getElementById("bulk-people-input").value = "";
	document.getElementById("bulk-people-status").innerText = "";
	document.getElementById("bulk-people-results").innerHTML = "";
	lastBulkPeopleResults = [];
});
document.getElementById("download-csv-link").href = `./data/companies.csv?v=${CACHE_VERSION}`;
document.getElementById("download-network-csv-link").href = `./data/tv-networks.csv?v=${CACHE_VERSION}`;
setActiveCachedTab("companies");
loadCompanies();
loadNetworks();
