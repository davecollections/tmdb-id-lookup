let currentGenreSearch = "";
let currentGenreFilter = "all";
let genreCounts = {};
let filteredGenres = [];
let genreSortKey = "name";
let genreSortDirection = "asc";
let currentGenrePage = 1;
let genreRowsPerPage = 25;
let genreCountsUpdatedAt = "";
const selectedGenreKeys = new Set();
function getGenreReferenceItems() {
	return Array.isArray(window.tmdbGenreReference) ? window.tmdbGenreReference : [];
}

function isOfficialGenre(genre) {
	return genre.type === "Official TMDB Genre";
}

function isExportableGenreReference(genre) {
	return isOfficialGenre(genre) || genre.type === "Curated TMDB List";
}

function getGenreSelectionKey(genre) {
	return `${genre.media}:${genre.id}:${genre.name}`;
}

function isGenreSelectedByNameAndMedia(name, media) {
	return getSelectedGenres().some((genre) => genre.name === name && genre.media === media);
}

function getSelectedGenres() {
	return getGenreReferenceItems().filter((genre) => selectedGenreKeys.has(getGenreSelectionKey(genre)));
}

function getSelectedOfficialGenres() {
	return getSelectedGenres().filter(isOfficialGenre);
}

function getGenreSearchText(genre) {
	const count = genreCounts[getGenreCountKey(genre)] ?? genre.titleCount ?? "";

	return [genre.name, genre.type, genre.media, genre.id, count, ...(genre.searchTerms || [])].join(" ").toLowerCase();
}

function getGenreTitleCount(genre) {
	const count = genreCounts[getGenreCountKey(genre)] ?? genre.titleCount ?? 0;

	return Number(count || 0);
}

function updateGenreMetaSummary() {
	const totalReferences = getGenreReferenceItems().length;
	const totalCountedReferences = Object.keys(genreCounts).length || totalReferences;

	document.getElementById("genre-stats").innerText =
		`${totalCountedReferences.toLocaleString()} of ${totalReferences.toLocaleString()} TMDB genre references cached`;
	document.getElementById("genre-last-updated").innerText =
		`Last updated ${genreCountsUpdatedAt ? formatUpdatedDate(genreCountsUpdatedAt) : "Unknown"}`;
}

function getGenreSortValue(genre, key) {
	if (key === "id") {
		return Number(genre.id || 0);
	}

	if (key === "title_count") {
		return getGenreTitleCount(genre);
	}

	return String(genre[key] || "").toLowerCase();
}

function getGenreTotalPages() {
	return Math.max(1, Math.ceil(filteredGenres.length / genreRowsPerPage));
}

function getGenrePageItems() {
	const start = (currentGenrePage - 1) * genreRowsPerPage;
	const end = start + genreRowsPerPage;

	return filteredGenres.slice(start, end);
}

function genreMatchesFilter(genre) {
	if (currentGenreFilter === "movie") {
		return genre.type === "Official TMDB Genre" && genre.media === "Movie";
	}

	if (currentGenreFilter === "tv") {
		return genre.type === "Official TMDB Genre" && genre.media === "TV";
	}

	if (currentGenreFilter === "curated") {
		return genre.type === "Curated TMDB List";
	}

	return true;
}

function setGenreFilter(filter) {
	currentGenreFilter = filter;

	document.querySelectorAll(".genre-filter-button").forEach((button) => {
		button.classList.toggle("active", button.dataset.genreFilter === currentGenreFilter);
	});
}

function getGenreCountKey(genre) {
	if (genre.type === "Official TMDB Genre" && genre.media === "Movie") {
		return `movie:${genre.id}`;
	}

	if (genre.type === "Official TMDB Genre" && genre.media === "TV") {
		return `tv:${genre.id}`;
	}

	if (genre.type === "Curated TMDB List") {
		return `list:${genre.id}`;
	}

	return "";
}

async function loadGenreCounts() {
	try {
		const res = await fetch(`./data/genre-counts.json?v=${CACHE_VERSION}`);

		if (!res.ok) {
			return;
		}

		const data = await res.json();

		genreCounts = data.counts || {};
		genreCountsUpdatedAt = data.updated_at || "";
		updateGenreMetaSummary();
		applyGenreFilters();
	} catch (error) {
		console.warn("genre-counts.json not available yet");
		updateGenreMetaSummary();
	}
}

function applyGenreFilters() {
	const query = currentGenreSearch.toLowerCase().trim();

	filteredGenres = getGenreReferenceItems().filter((genre) => {
		const matchesSearch = !query || getGenreSearchText(genre).includes(query);

		return matchesSearch && genreMatchesFilter(genre);
	});

	filteredGenres.sort((a, b) => {
		const aValue = getGenreSortValue(a, genreSortKey);
		const bValue = getGenreSortValue(b, genreSortKey);

		if (aValue < bValue) {
			return genreSortDirection === "asc" ? -1 : 1;
		}

		if (aValue > bValue) {
			return genreSortDirection === "asc" ? 1 : -1;
		}

		return Number(a.id || 0) - Number(b.id || 0);
	});

	currentGenrePage = Math.min(currentGenrePage, getGenreTotalPages());
	renderGenres(getGenrePageItems());
	updateGenrePagination();
	updateGenreSortIndicators();
}

function updateGenreSortIndicators() {
	document.querySelectorAll(".genre-sortable").forEach((th) => {
		const indicator = th.querySelector(".sort-indicator");

		if (th.dataset.genreSort === genreSortKey) {
			indicator.textContent = genreSortDirection === "asc" ? "\u25B2" : "\u25BC";
		} else {
			indicator.textContent = "";
		}
	});
}

function updateGenrePagination() {
	const totalPages = getGenreTotalPages();
	const pageText = `${currentGenrePage.toLocaleString()} of ${totalPages.toLocaleString()}`;

	document.getElementById("genre-page-status").innerText = pageText;
	document.getElementById("genre-page-status-bottom").innerText = pageText;

	if (!filteredGenres.length) {
		document.getElementById("genre-result-count").innerText = "Showing 0 of 0 genre references";
		return;
	}

	const startItem = (currentGenrePage - 1) * genreRowsPerPage + 1;
	const endItem = Math.min(currentGenrePage * genreRowsPerPage, filteredGenres.length);

	document.getElementById("genre-result-count").innerText =
		`Showing ${startItem.toLocaleString()}\u2013${endItem.toLocaleString()} of ${filteredGenres.length.toLocaleString()} genre reference${filteredGenres.length === 1 ? "" : "s"}`;
}

function updateGenreSelectionStatus() {
	const selectedCount = selectedGenreKeys.size;
	const status = document.getElementById("genre-selection-status");
	const createButton = document.getElementById("create-genre-nuvio-json");
	const clearButton = document.getElementById("clear-genre-selection");

	if (!status || !createButton || !clearButton) {
		return;
	}

	status.textContent = selectedCount
		? `${selectedCount.toLocaleString()} selected`
		: "0 selected";
	createButton.disabled = selectedCount === 0;
	clearButton.disabled = selectedCount === 0;
	updateGenrePresetButtons();
}

function createGenreSelectionCell(genre) {
	const cell = createElement("td", { className: "selection-cell" });

	if (!isExportableGenreReference(genre)) {
		cell.appendChild(
			createElement("span", {
				className: "muted-cell",
				text: "\u2014",
				attrs: {
					title: "This reference cannot be exported yet.",
				},
			}),
		);
		return cell;
	}

	const checkbox = createElement("input", {
		className: "selection-checkbox",
		attrs: {
			type: "checkbox",
			"aria-label": `Add ${genre.name} ${genre.media} genre to collection`,
		},
	});
	const key = getGenreSelectionKey(genre);

	checkbox.checked = selectedGenreKeys.has(key);
	checkbox.addEventListener("change", () => {
		if (checkbox.checked) {
			selectedGenreKeys.add(key);
		} else {
			selectedGenreKeys.delete(key);
		}

		updateGenreSelectionStatus();
	});

	cell.appendChild(checkbox);

	return cell;
}

function renderGenres(items) {
	const tbody = document.getElementById("genre-results");
	const resultCount = document.getElementById("genre-result-count");

	if (!tbody || !resultCount) {
		return;
	}

	tbody.replaceChildren();

	if (!items.length) {
		resultCount.innerText = "Showing 0 genre references";
		tbody.appendChild(
			createElement("tr", {}, [
				createElement("td", {
					text: "No matching genre references found.",
					attrs: {
						colspan: "7",
					},
				}),
			]),
		);
		return;
	}

	for (const genre of items) {
		const tr = document.createElement("tr");
		const count = genreCounts[getGenreCountKey(genre)] ?? genre.titleCount ?? "\u2014";
		const displayCount = typeof count === "number" ? count.toLocaleString() : count;
		const idCell = document.createElement("td");
		const copyButton = createElement("button", {
			className: "copy-id-button",
			text: genre.id,
			attrs: {
				type: "button",
				title: "Copy genre or list ID",
			},
		});

		copyButton.addEventListener("click", () => copyId(genre.id));
		idCell.appendChild(copyButton);

		tr.appendChild(createGenreSelectionCell(genre));
		tr.appendChild(createElement("td", { text: genre.name || "" }));
		tr.appendChild(idCell);
		tr.appendChild(createElement("td", { text: genre.type || "" }));
		tr.appendChild(createElement("td", { text: genre.media || "" }));
		tr.appendChild(createElement("td", { text: displayCount }));
		tr.appendChild(createOpenLinkCell(genre.url));
		tbody.appendChild(tr);
	}

	updateGenreSelectionStatus();
}

function clearGenreSelection() {
	selectedGenreKeys.clear();
	applyGenreFilters();
	updateGenreSelectionStatus();
	closeGenreNuvioExportModal();
}

function getGenrePresetKeys(presetName) {
	if (presetName !== "movies" && presetName !== "tv") {
		return [];
	}

	return getGenreReferenceItems()
		.filter((genre) => {
			if (!isExportableGenreReference(genre)) {
				return false;
			}

			if (presetName === "movies") {
				return genre.media === "Movie";
			}

			if (presetName === "tv") {
				return genre.media === "TV";
			}

			return false;
		})
		.map(getGenreSelectionKey);
}

function selectGenrePreset(presetName) {
	const presetKeys = getGenrePresetKeys(presetName);
	const shouldRemovePreset = presetKeys.length && presetKeys.every((key) => selectedGenreKeys.has(key));

	for (const key of presetKeys) {
		if (shouldRemovePreset) {
			selectedGenreKeys.delete(key);
		} else {
			selectedGenreKeys.add(key);
		}
	}

	applyGenreFilters();
	updateGenreSelectionStatus();
}

function updateGenrePresetButtons() {
	document.querySelectorAll(".genre-preset-button").forEach((button) => {
		const presetKeys = getGenrePresetKeys(button.dataset.genrePreset);
		const isActive = presetKeys.length && presetKeys.every((key) => selectedGenreKeys.has(key));

		button.classList.toggle("active", Boolean(isActive));
		button.setAttribute("aria-pressed", String(Boolean(isActive)));
	});
}

function goToGenrePage(page) {
	currentGenrePage = Math.min(Math.max(1, page), getGenreTotalPages());

	renderGenres(getGenrePageItems());
	updateGenrePagination();
}

function initGenreLookup() {
	document.getElementById("genre-search")?.addEventListener("input", (event) => {
		currentGenreSearch = event.target.value;
		currentGenrePage = 1;
		applyGenreFilters();
	});

	document.getElementById("clear-genre-search")?.addEventListener("click", () => {
		currentGenreSearch = "";
		document.getElementById("genre-search").value = "";
		setGenreFilter("all");
		currentGenrePage = 1;
		applyGenreFilters();
	});

	document.querySelectorAll(".genre-filter-button").forEach((button) => {
		button.addEventListener("click", () => {
			setGenreFilter(button.dataset.genreFilter || "all");
			currentGenrePage = 1;
			applyGenreFilters();
		});
	});
	document.querySelectorAll(".genre-preset-button").forEach((button) => {
		button.addEventListener("click", () => selectGenrePreset(button.dataset.genrePreset));
	});

	document.getElementById("genre-rows-per-page").addEventListener("change", (event) => {
		genreRowsPerPage = Number(event.target.value);
		currentGenrePage = 1;
		applyGenreFilters();
	});
	document.querySelectorAll(".genre-sortable").forEach((th) => {
		th.addEventListener("click", () => {
			const selectedSortKey = th.dataset.genreSort;

			if (genreSortKey === selectedSortKey) {
				genreSortDirection = genreSortDirection === "asc" ? "desc" : "asc";
			} else {
				genreSortKey = selectedSortKey;
				genreSortDirection = selectedSortKey === "title_count" ? "desc" : "asc";
			}

			currentGenrePage = 1;
			applyGenreFilters();
		});
	});
	document.getElementById("genre-first-page").addEventListener("click", () => goToGenrePage(1));
	document.getElementById("genre-prev-page").addEventListener("click", () => goToGenrePage(currentGenrePage - 1));
	document.getElementById("genre-next-page").addEventListener("click", () => goToGenrePage(currentGenrePage + 1));
	document.getElementById("genre-last-page").addEventListener("click", () => goToGenrePage(getGenreTotalPages()));
	document.getElementById("genre-first-page-bottom").addEventListener("click", () => goToGenrePage(1));
	document.getElementById("genre-prev-page-bottom").addEventListener("click", () => goToGenrePage(currentGenrePage - 1));
	document.getElementById("genre-next-page-bottom").addEventListener("click", () => goToGenrePage(currentGenrePage + 1));
	document.getElementById("genre-last-page-bottom").addEventListener("click", () => goToGenrePage(getGenreTotalPages()));
	document.getElementById("download-genre-csv-link").href = `./data/genres.csv?v=${CACHE_VERSION}`;

	document.getElementById("create-genre-nuvio-json").addEventListener("click", openGenreNuvioExportModal);
	document.getElementById("clear-genre-selection").addEventListener("click", clearGenreSelection);
	document.getElementById("close-genre-nuvio-export").addEventListener("click", closeGenreNuvioExportModal);
	document.getElementById("cancel-genre-nuvio-export").addEventListener("click", closeGenreNuvioExportModal);
	document.getElementById("download-genre-nuvio-json").addEventListener("click", downloadGenreNuvioJson);
	document.getElementById("open-genre-nuvio-import-help").addEventListener("click", openNuvioImportHelpModal);
	document.getElementById("genre-nuvio-tile-shape").addEventListener("change", updateGenreArtworkPreview);
	document.getElementById("genre-action-adventure-merge").addEventListener("change", updateGenreArtworkPreview);
	document.getElementById("genre-scifi-fantasy-merge").addEventListener("change", updateGenreArtworkPreview);
	document.getElementById("genre-war-politics-merge").addEventListener("change", updateGenreArtworkPreview);
	document.getElementById("genre-nuvio-export-modal").addEventListener("click", (event) => {
		if (event.target.id === "genre-nuvio-export-modal") {
			closeGenreNuvioExportModal();
		}
	});

	updateGenreMetaSummary();
	applyGenreFilters();
	loadGenreCounts();
}
