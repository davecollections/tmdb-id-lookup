const DEFAULT_NUVIO_IMAGES = {
	ACTOR: {
		coverImageUrl:
			"https://github.com/davecollections/nuvio-assets/blob/main/assets/collection%20covers/people/actors.jpg?raw=true",
		folderHeroImageUrl:
			"https://github.com/davecollections/nuvio-assets/blob/main/assets/collection%20covers/people/actor%20hero.jpg?raw=true",
	},
	DIRECTOR: {
		coverImageUrl:
			"https://github.com/davecollections/nuvio-assets/blob/main/assets/collection%20covers/people/directors.jpg?raw=true",
		folderHeroImageUrl:
			"https://github.com/davecollections/nuvio-assets/blob/main/assets/collection%20covers/people/director%20hero.jpg?raw=true",
	},
	PERSON: {
		coverImageUrl:
			"https://github.com/davecollections/nuvio-assets/blob/main/assets/collection%20covers/people/people.jpg?raw=true",
		folderHeroImageUrl:
			"https://github.com/davecollections/nuvio-assets/blob/main/assets/collection%20covers/people/people%20hero%20backdrop.jpg?raw=true",
	},
};

function getMatchedBulkPeopleResults() {
	return lastBulkPeopleResults.filter((result) => result.id);
}

function getNuvioTmdbSourceType(sourceType) {
	return sourceType === "DIRECTOR" ? "DIRECTOR" : "PERSON";
}

function getNuvioExportOptions() {
	const collectionName =
		document.getElementById("nuvio-collection-name").value.trim() || "TMDB People Collection";
	const customCoverImageUrl = document.getElementById("nuvio-cover-image-url").value.trim();
	const customFolderHeroUrl = document.getElementById("nuvio-folder-hero-url").value.trim();
	const sourceType = document.getElementById("nuvio-source-type").value || "ACTOR";
	const defaultImages = DEFAULT_NUVIO_IMAGES[sourceType] || DEFAULT_NUVIO_IMAGES.ACTOR;

	return {
		collectionName,
		coverImageUrl: customCoverImageUrl || defaultImages.coverImageUrl,
		folderHeroImageUrl: customFolderHeroUrl || defaultImages.folderHeroImageUrl,
		hideFolderTitle: document.getElementById("nuvio-hide-folder-title").checked,
		mediaType: document.getElementById("nuvio-media-type").value || "MOVIE",
		sourceType,
		tmdbSourceType: getNuvioTmdbSourceType(sourceType),
	};
}

function updateNuvioImagePreviews() {
	const options = getNuvioExportOptions();
	const coverPreview = document.getElementById("nuvio-cover-preview");
	const folderHeroPreview = document.getElementById("nuvio-folder-hero-preview");

	coverPreview.src = options.coverImageUrl;
	folderHeroPreview.src = options.folderHeroImageUrl;
}

function openNuvioExportModal() {
	const defaultCollectionName = document.getElementById("nuvio-collection-name");

	if (!defaultCollectionName.value.trim()) {
		defaultCollectionName.value = "TMDB People Collection";
	}

	updateNuvioImagePreviews();
	openAppModal("nuvio-export-modal", "nuvio-collection-name");
}

function closeNuvioExportModal() {
	closeNuvioImportHelpModal();
	closeAppModal("nuvio-export-modal");
}

function openNuvioImportHelpModal() {
	openAppModal("nuvio-import-help-modal", "close-nuvio-import-help");
}

function closeNuvioImportHelpModal() {
	closeAppModal("nuvio-import-help-modal");
}

function createNuvioSource(result, options) {
	return {
		title: result.name,
		sortBy: "popularity.desc",
		tmdbId: Number(result.id),
		filters: {},
		provider: "tmdb",
		mediaType: options.mediaType,
		tmdbSourceType: options.tmdbSourceType,
	};
}

function createNuvioFolder(result, options) {
	const folder = {
		id: createNuvioId("folder"),
		title: result.name,
		sources: [createNuvioSource(result, options)],
		hideTitle: options.hideFolderTitle,
		tileShape: "POSTER",
		coverEmoji: "",
		focusGifUrl: "",
		heroVideoUrl: "",
		titleLogoUrl: "",
	};

	if (result.profileImageUrl) {
		folder.coverImageUrl = result.profileImageUrl;
	}

	if (options.folderHeroImageUrl) {
		folder.heroBackdropUrl = options.folderHeroImageUrl;
	}

	folder.catalogSources = [];
	folder.focusGifEnabled = false;

	return folder;
}

function createNuvioCollectionJson() {
	const options = getNuvioExportOptions();
	const matchedPeople = getMatchedBulkPeopleResults();

	const collection = {
		id: createNuvioId("collection"),
		title: options.collectionName,
		folders: matchedPeople.map((result) => createNuvioFolder(result, options)),
		pinToTop: false,
		viewMode: "TABBED_GRID",
		showAllTab: false,
		backdropImageUrl: options.coverImageUrl,
		focusGlowEnabled: true,
	};

	return [collection];
}

function downloadNuvioJson() {
	const matchedPeople = getMatchedBulkPeopleResults();

	if (!matchedPeople.length) {
		return;
	}

	const options = getNuvioExportOptions();
	const json = JSON.stringify(createNuvioCollectionJson(), null, "\t");
	const filename = `${slugifyFilename(options.collectionName)}.nuvio.json`;

	downloadTextFile(filename, `${json}\n`, "application/json");
}

function initBulkPeopleNuvioExport() {
	document.getElementById("close-nuvio-export-modal").addEventListener("click", closeNuvioExportModal);
	document.getElementById("cancel-nuvio-export").addEventListener("click", closeNuvioExportModal);
	document.getElementById("open-nuvio-import-help").addEventListener("click", openNuvioImportHelpModal);
	document.getElementById("close-nuvio-import-help").addEventListener("click", closeNuvioImportHelpModal);
	document.getElementById("download-nuvio-json").addEventListener("click", downloadNuvioJson);
	document.getElementById("nuvio-source-type").addEventListener("change", updateNuvioImagePreviews);
	document.getElementById("nuvio-cover-image-url").addEventListener("input", updateNuvioImagePreviews);
	document.getElementById("nuvio-folder-hero-url").addEventListener("input", updateNuvioImagePreviews);
	document.getElementById("nuvio-export-modal").addEventListener("click", (event) => {
		if (event.target.id === "nuvio-export-modal") {
			closeNuvioExportModal();
		}
	});
	document.getElementById("nuvio-import-help-modal").addEventListener("click", (event) => {
		if (event.target.id === "nuvio-import-help-modal") {
			closeNuvioImportHelpModal();
		}
	});
}
