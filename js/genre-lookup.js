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
const genreBackdropImageUrl = "https://raw.githubusercontent.com/davecollections/nuvio-assets/main/assets/backdrops/genre/genre%20hero%20backdrop.jpg";
const genrePosterArtworkFiles = {
	Action: "Action",
	"Action & Adventure": "action_and_adventure",
	Adventure: "Adventure",
	Animation: "Animation",
	Comedy: "Comedy",
	Crime: "crime",
	Documentary: "Documentary",
	Drama: "Drama",
	Family: "family",
	Fantasy: "Fantasy",
	History: "history",
	Horror: "Horror",
	Kids: "kids",
	Music: "Music",
	Musicals: "Musical",
	Mystery: "Mystery",
	News: "news",
	Reality: "reality",
	Romance: "Romance",
	"Science Fiction": "Sci-Fi",
	"Sci-Fi & Fantasy": "sci-fi_and_fantasy",
	Soap: "soap",
	Talk: "talk",
	Thriller: "Thriller",
	"TV Movie": "tv movie",
	War: "War",
	"War & Politics": "war_and_politics",
	Western: "Western",
};
const genreWideArtworkNames = {
	Action: "action wide",
	"Action & Adventure": "action_and_adventure wide",
	Adventure: "adventure wide",
	Animation: "animation wide",
	Comedy: "comedy wide",
	Crime: "crime wide",
	Documentary: "documentary wide",
	Drama: "drama wide",
	Family: "family wide",
	Fantasy: "fantasy wide",
	History: "history wide",
	Horror: "horror wide",
	Kids: "kids wide",
	Music: "music wide",
	Musicals: "musicals wide",
	News: "news wide",
	Reality: "reality wide",
	Romance: "romance wide",
	"Science Fiction": "science fiction wide",
	"Sci-Fi & Fantasy": "sci-fi_and_fantasy wide",
	Soap: "soap wide",
	Talk: "talk wide",
	Thriller: "thriller wide",
	"TV Movie": "tv movie wide",
	War: "war wide",
	"War & Politics": "war_and_politics wide",
	Western: "western wide",
};
const genreSpecialMergeRules = {
	"Action & Adventure": ["Action", "Adventure"],
	"Sci-Fi & Fantasy": ["Science Fiction", "Fantasy"],
	"War & Politics": ["War"],
};
const genreTmdbDiscoverSort = "popularity.desc";
const genreCuratedListSort = "vote_average.desc";
const genreDefaultCollectionNames = new Set(["Genres", "Movie Genre", "TV Series Genre"]);

function createGenreNuvioExportId(prefix) {
	if (window.crypto?.randomUUID) {
		return window.crypto.randomUUID();
	}

	return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
}

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

function getGenreArtworkName(genreName, tileShape) {
	const map = tileShape === "LANDSCAPE" ? genreWideArtworkNames : genrePosterArtworkFiles;

	return map[genreName] || "";
}

function getGenreArtworkUrl(genreName, tileShape) {
	const artworkName = getGenreArtworkName(genreName, tileShape);

	if (!artworkName) {
		return "";
	}

	const encodedName = encodeURIComponent(artworkName).replace(/%20/g, "%20");
	const artworkFolder = tileShape === "LANDSCAPE" ? "wide" : "vertical";

	return `https://raw.githubusercontent.com/davecollections/nuvio-assets/main/assets/collection%20covers/genre/${artworkFolder}/${encodedName}.jpg`;
}

function getGenreNuvioOptions() {
	return {
		collectionName: document.getElementById("genre-nuvio-collection-name").value.trim() || "Genres",
		viewMode: document.getElementById("genre-nuvio-view-mode").value || "TABBED_GRID",
		tileShape: document.getElementById("genre-nuvio-tile-shape").value || "POSTER",
		dateFrom: document.getElementById("genre-nuvio-date-from").value.trim(),
		dateTo: document.getElementById("genre-nuvio-date-to").value.trim(),
		minRating: document.getElementById("genre-nuvio-min-rating").value.trim(),
		language: document.getElementById("genre-nuvio-language").value.trim(),
		country: document.getElementById("genre-nuvio-country").value.trim(),
		actionAdventureMerge: document.getElementById("genre-action-adventure-merge").value || "standalone",
		scifiFantasyMerge: document.getElementById("genre-scifi-fantasy-merge").value || "standalone",
		warPoliticsMerge: document.getElementById("genre-war-politics-merge").value || "standalone",
	};
}

function getGenreDefaultCollectionName() {
	const selectedGenres = getSelectedGenres().filter(isExportableGenreReference);
	const hasMovies = selectedGenres.some((genre) => genre.media === "Movie");
	const hasTv = selectedGenres.some((genre) => genre.media === "TV");

	if (hasMovies && !hasTv) {
		return "Movie Genre";
	}

	if (hasTv && !hasMovies) {
		return "TV Series Genre";
	}

	return "Genres";
}

function createGenreFilters(genre, options) {
	const filters = {
		withGenres: String(genre.id),
	};

	if (options.dateFrom) {
		filters.releaseDateGte = options.dateFrom;
	}

	if (options.dateTo) {
		filters.releaseDateLte = options.dateTo;
	}

	if (options.minRating) {
		filters.voteAverageGte = options.minRating;
	}

	if (options.language) {
		filters.withOriginalLanguage = options.language;
	}

	if (options.country) {
		filters.withOriginCountry = options.country;
	}

	return filters;
}

function createGenreSource(genre, options) {
	if (genre.type === "Curated TMDB List") {
		return {
			title: genre.name,
			sortBy: genreCuratedListSort,
			tmdbId: Number(genre.id),
			filters: {},
			provider: "tmdb",
			mediaType: genre.media === "TV" ? "TV" : "MOVIE",
			tmdbSourceType: "LIST",
		};
	}

	return {
		title: `${genre.name} ${genre.media === "TV" ? "Series" : "Movies"}`,
		sortBy: genreTmdbDiscoverSort,
		tmdbId: null,
		filters: createGenreFilters(genre, options),
		provider: "tmdb",
		mediaType: genre.media === "TV" ? "TV" : "MOVIE",
		tmdbSourceType: "DISCOVER",
	};
}

function getSelectedMovieGenreNames() {
	return new Set(
		getSelectedOfficialGenres()
			.filter((genre) => genre.media === "Movie")
			.map((genre) => genre.name),
	);
}

function setSelectOptions(select, options) {
	select.replaceChildren();

	for (const option of options) {
		select.appendChild(
			createElement("option", {
				text: option.label,
				attrs: {
					value: option.value,
				},
			}),
		);
	}
}

function updateGenreMergeOptions() {
	const selectedGenres = getSelectedOfficialGenres();
	const selectedNames = new Set(selectedGenres.map((genre) => genre.name));
	const movieGenreNames = getSelectedMovieGenreNames();
	const container = document.getElementById("genre-nuvio-merge-options");
	const controlIds = {
		"Action & Adventure": {
			wrap: "genre-action-adventure-merge-wrap",
			select: "genre-action-adventure-merge",
		},
		"Sci-Fi & Fantasy": {
			wrap: "genre-scifi-fantasy-merge-wrap",
			select: "genre-scifi-fantasy-merge",
		},
		"War & Politics": {
			wrap: "genre-war-politics-merge-wrap",
			select: "genre-war-politics-merge",
		},
	};
	let hasVisibleOption = false;

	for (const [specialName, targetNames] of Object.entries(genreSpecialMergeRules)) {
		const wrap = document.getElementById(controlIds[specialName].wrap);
		const select = document.getElementById(controlIds[specialName].select);
		const availableTargets = targetNames.filter((name) => movieGenreNames.has(name));

		if (!isGenreSelectedByNameAndMedia(specialName, "TV") || !availableTargets.length) {
			wrap.hidden = true;
			select.replaceChildren();
			continue;
		}

		const options = [{ value: "standalone", label: "Create its own folder" }];

		for (const targetName of availableTargets) {
			options.push({ value: targetName, label: `Add to ${targetName}` });
		}

		if (availableTargets.length > 1) {
			options.push({ value: "both", label: "Add to both" });
		}

		setSelectOptions(select, options);
		wrap.hidden = false;
		hasVisibleOption = true;
	}

	container.hidden = !hasVisibleOption;
}

function addSpecialMergedGenreSources(folderMap, genre, options, mergeTarget, targetNames) {
	if (mergeTarget === "both") {
		for (const targetName of targetNames) {
			addGenreFolderSource(folderMap, targetName, genre, options);
		}

		return true;
	}

	if (targetNames.includes(mergeTarget)) {
		addGenreFolderSource(folderMap, mergeTarget, genre, options);
		return true;
	}

	return false;
}

function addGenreFolderSource(folderMap, folderName, genre, options) {
	if (!folderMap.has(folderName)) {
		folderMap.set(folderName, []);
	}

	folderMap.get(folderName).push(createGenreSource(genre, options));
}

function buildGenreFolderSourceMap(options) {
	const folderMap = new Map();
	const movieGenreNames = getSelectedMovieGenreNames();

	for (const genre of getSelectedGenres().filter(isExportableGenreReference)) {
		if (genre.type === "Curated TMDB List") {
			addGenreFolderSource(folderMap, genre.name, genre, options);
			continue;
		}

		if (genre.name === "Action & Adventure" && genreSpecialMergeRules["Action & Adventure"].some((name) => movieGenreNames.has(name))) {
			if (!addSpecialMergedGenreSources(folderMap, genre, options, options.actionAdventureMerge, genreSpecialMergeRules["Action & Adventure"])) {
				addGenreFolderSource(folderMap, genre.name, genre, options);
			}

			continue;
		}

		if (genre.name === "Sci-Fi & Fantasy" && genreSpecialMergeRules["Sci-Fi & Fantasy"].some((name) => movieGenreNames.has(name))) {
			if (!addSpecialMergedGenreSources(folderMap, genre, options, options.scifiFantasyMerge, genreSpecialMergeRules["Sci-Fi & Fantasy"])) {
				addGenreFolderSource(folderMap, genre.name, genre, options);
			}

			continue;
		}

		if (genre.name === "War & Politics" && genreSpecialMergeRules["War & Politics"].some((name) => movieGenreNames.has(name))) {
			if (!addSpecialMergedGenreSources(folderMap, genre, options, options.warPoliticsMerge, genreSpecialMergeRules["War & Politics"])) {
				addGenreFolderSource(folderMap, genre.name, genre, options);
			}

			continue;
		}

		addGenreFolderSource(folderMap, genre.name, genre, options);
	}

	return folderMap;
}

function createGenreNuvioJson() {
	const options = getGenreNuvioOptions();
	const folderMap = buildGenreFolderSourceMap(options);
	const folders = [...folderMap.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([folderName, sources]) => {
			const coverImageUrl = getGenreArtworkUrl(folderName, options.tileShape);

			return {
				id: createGenreNuvioExportId("folder"),
				title: folderName,
				sources,
				hideTitle: Boolean(coverImageUrl),
				tileShape: options.tileShape,
				coverEmoji: coverImageUrl ? "" : "\uD83C\uDFAC",
				focusGifUrl: "",
				heroVideoUrl: "",
				titleLogoUrl: "",
				coverImageUrl,
				catalogSources: [],
				focusGifEnabled: false,
				heroBackdropUrl: "",
			};
		});

	return [
		{
			id: createGenreNuvioExportId("collection"),
			title: options.collectionName,
			folders,
			pinToTop: false,
			viewMode: options.viewMode,
			showAllTab: false,
			backdropImageUrl: genreBackdropImageUrl,
			focusGlowEnabled: true,
		},
	];
}

function updateGenreArtworkPreview() {
	const options = getGenreNuvioOptions();
	const modal = document.querySelector("#genre-nuvio-export-modal .modal-panel-genre");
	const preview = document.getElementById("genre-nuvio-artwork-preview");
	const folderMap = buildGenreFolderSourceMap(options);
	const firstFolderName = [...folderMap.keys()].find((folderName) => getGenreArtworkUrl(folderName, options.tileShape));
	const artworkUrl = firstFolderName ? getGenreArtworkUrl(firstFolderName, options.tileShape) : "";

	modal.classList.toggle("genre-modal-poster", options.tileShape !== "LANDSCAPE");
	modal.classList.toggle("genre-modal-wide", options.tileShape === "LANDSCAPE");
	preview.classList.toggle("genre-preview-landscape", options.tileShape === "LANDSCAPE");
	preview.classList.toggle("genre-preview-poster", options.tileShape !== "LANDSCAPE");
	preview.hidden = !artworkUrl;
	preview.src = artworkUrl;
}

function openGenreNuvioExportModal() {
	if (!selectedGenreKeys.size) {
		return;
	}

	const nameInput = document.getElementById("genre-nuvio-collection-name");
	const defaultCollectionName = getGenreDefaultCollectionName();

	if (!nameInput.value.trim() || genreDefaultCollectionNames.has(nameInput.value.trim())) {
		nameInput.value = defaultCollectionName;
	}

	updateGenreMergeOptions();
	updateGenreArtworkPreview();
	document.getElementById("genre-nuvio-export-summary").textContent =
		`This will create one ${nameInput.value.trim()} collection with ${selectedGenreKeys.size.toLocaleString()} selected genre reference${selectedGenreKeys.size === 1 ? "" : "s"}.`;
	document.getElementById("genre-nuvio-export-modal").hidden = false;
	nameInput.focus();
}

function closeGenreNuvioExportModal() {
	document.getElementById("genre-nuvio-export-modal").hidden = true;
	closeNuvioImportHelpModal();
}

function downloadGenreNuvioJson() {
	if (!selectedGenreKeys.size) {
		return;
	}

	const options = getGenreNuvioOptions();
	const json = JSON.stringify(createGenreNuvioJson(), null, "\t");
	const filename = `${String(options.collectionName || "genres")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "") || "genres"}.nuvio.json`;

	downloadTextFile(filename, `${json}\n`, "application/json");
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
