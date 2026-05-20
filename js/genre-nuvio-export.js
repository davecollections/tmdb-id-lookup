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
	Mystery: "mystery wide",
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
	openAppModal("genre-nuvio-export-modal", nameInput);
}

function closeGenreNuvioExportModal() {
	closeNuvioImportHelpModal();
	closeAppModal("genre-nuvio-export-modal");
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
