let lastBulkPeopleResults = [];
const BULK_PEOPLE_LIMIT = 50;
let lastBulkPeopleBatchMessage = "";
let lastBulkPeopleIncompleteInputs = new Set();
let lastCombinedNuvioJson = null;
let lastCombinedNuvioStats = null;
let lastJsonCombineSourceCollections = [];
let lastJsonCombineFiles = [];
let lastJsonCombineBatchCollections = [];
let lastJsonCombineExistingCollections = [];
let lastJsonCombineExistingFileName = "";
let lastJsonCombineFileCount = 0;
let lastJsonCombineDuplicateFileCount = 0;

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

function getTmdbProfileImageUrl(profilePath) {
	return profilePath ? `https://image.tmdb.org/t/p/w500${profilePath}` : "";
}

function slugifyFilename(value) {
	return (
		String(value || "nuvio-people-collection")
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "") || "nuvio-people-collection"
	);
}

function getMatchedBulkPeopleResults() {
	return lastBulkPeopleResults.filter((result) => result.id);
}

function createNuvioId(prefix) {
	if (window.crypto?.randomUUID) {
		return window.crypto.randomUUID();
	}

	return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
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

function readTextFile(file) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();

		reader.addEventListener("load", () => resolve(String(reader.result || "")));
		reader.addEventListener("error", () => reject(new Error(`Could not read ${file.name}.`)));
		reader.readAsText(file);
	});
}

function cloneJson(value) {
	return JSON.parse(JSON.stringify(value));
}

function getSourceSignature(source) {
	return JSON.stringify({
		addonId: source.addonId || "",
		catalogId: source.catalogId || "",
		filters: source.filters || {},
		genre: source.genre || "",
		mediaType: source.mediaType || "",
		provider: source.provider || "",
		sortBy: source.sortBy || "",
		title: source.title || "",
		tmdbId: source.tmdbId || "",
		tmdbSourceType: source.tmdbSourceType || "",
		type: source.type || "",
	});
}

function getFolderSignature(folder) {
	const sourceSignature = (folder.sources || [])
		.map(getSourceSignature)
		.join(";");

	return sourceSignature || folder.id || folder.title || "";
}

function getFileSignature(file) {
	return `${file.name}:${file.size}:${file.lastModified}`;
}

function isPeopleBatchCollection(collection) {
	const folders = collection?.folders || [];
	const peopleSourceTypes = new Set(["DIRECTOR", "PERSON"]);

	return (
		folders.length > 0 &&
		folders.every((folder) => {
			const sources = folder.sources || [];

			return (
				sources.length > 0 &&
				sources.every(
					(source) =>
						source.provider === "tmdb" &&
						peopleSourceTypes.has(source.tmdbSourceType) &&
						Number.isFinite(Number(source.tmdbId)),
				)
			);
		})
	);
}

function getExistingJsonMode() {
	return document.querySelector('input[name="json-combine-existing-mode"]:checked')?.value || "new";
}

function setJsonCombineStatus(message, statusType = "") {
	const status = document.getElementById("json-combine-status");

	status.className = statusType ? `json-combine-status ${statusType}` : "json-combine-status";
	status.textContent = message;
}

function updateJsonCombineFileLabel(files) {
	const label = document.getElementById("json-combine-file-name");
	const fileCount = lastJsonCombineFiles.length || files.length;
	const manageButton = document.getElementById("manage-json-combine-files");

	if (!fileCount) {
		label.textContent = "No files selected";
		manageButton.disabled = true;
		manageButton.textContent = "Manage files";
		return;
	}

	label.textContent = fileCount === 1 ? lastJsonCombineFiles[0]?.name || files[0].name : `${fileCount} files added`;
	manageButton.disabled = false;
	manageButton.textContent = `Manage files (${fileCount})`;
}

function rebuildJsonCombineFileState() {
	const existingFiles = lastJsonCombineFiles.filter((file) => file.isExistingJson);
	const batchFiles = lastJsonCombineFiles.filter((file) => !file.isExistingJson);

	lastJsonCombineExistingCollections = existingFiles.flatMap((file) => file.collections);
	lastJsonCombineExistingFileName =
		existingFiles.length === 1 ? existingFiles[0].name : `${existingFiles.length} existing JSON files`;
	lastJsonCombineBatchCollections = batchFiles.flatMap((file) => file.collections);
	lastJsonCombineSourceCollections = [...lastJsonCombineExistingCollections, ...lastJsonCombineBatchCollections];
	lastJsonCombineFileCount = lastJsonCombineFiles.length;
}

function renderJsonCombineFileList() {
	const fileList = document.getElementById("json-combine-file-list");

	fileList.replaceChildren();

	if (!lastJsonCombineFiles.length) {
		const emptyMessage = document.createElement("p");
		emptyMessage.className = "json-combine-file-empty";
		emptyMessage.textContent = "No JSON files added.";
		fileList.appendChild(emptyMessage);
		return;
	}

	for (const file of lastJsonCombineFiles) {
		const item = document.createElement("div");
		item.className = "json-combine-file-item";

		const info = document.createElement("div");
		info.className = "json-combine-file-info";

		const name = document.createElement("span");
		name.className = "json-combine-file-name";
		name.textContent = file.name;

		const type = document.createElement("span");
		type.className = "json-combine-file-type";
		type.textContent = file.isExistingJson ? "Existing Nuvio JSON" : "People batch";

		const removeButton = document.createElement("button");
		removeButton.className = "json-combine-remove-file";
		removeButton.type = "button";
		removeButton.textContent = "Remove";
		removeButton.setAttribute("aria-label", `Remove ${file.name}`);
		removeButton.addEventListener("click", () => removeJsonCombineFile(file.signature));

		info.appendChild(name);
		info.appendChild(type);
		item.appendChild(info);
		item.appendChild(removeButton);
		fileList.appendChild(item);
	}
}

function openJsonCombineFileManager() {
	renderJsonCombineFileList();
	openAppModal("json-combine-file-manager-modal", "close-json-combine-file-manager");
}

function closeJsonCombineFileManager() {
	closeAppModal("json-combine-file-manager-modal");
}

function removeJsonCombineFile(signature) {
	lastJsonCombineFiles = lastJsonCombineFiles.filter((file) => file.signature !== signature);
	lastJsonCombineDuplicateFileCount = 0;
	lastCombinedNuvioJson = null;
	lastCombinedNuvioStats = null;
	rebuildJsonCombineFileState();
	updateJsonCombineExistingSummary();
	updateJsonCombineModeUi();
	updateJsonCombineFileLabel([]);
	renderJsonCombineFileList();

	if (!lastJsonCombineFiles.length) {
		document.getElementById("download-combined-json").disabled = true;
		setJsonCombineStatus("Select one or more Nuvio JSON files to combine.");
		return;
	}

	buildCombinedNuvioJson();
}

function getJsonCombineMode() {
	return document.querySelector('input[name="json-combine-mode"]:checked')?.value || "single";
}

function getJsonCombineSortMode() {
	return document.querySelector('input[name="json-combine-sort-mode"]:checked')?.value || "original";
}

function getJsonCombineOptions() {
	const sortMode = getJsonCombineSortMode();

	return {
		collectionImageUrl: document.getElementById("json-combine-image-url").value.trim(),
		collectionName: document.getElementById("json-combine-collection-name").value.trim(),
		mode: getJsonCombineMode(),
		sortFolders: sortMode !== "original",
		sortMethod: sortMode === "last" ? "last" : "first",
	};
}

function updateJsonCombineModeUi() {
	const isSingleCollection = getJsonCombineMode() === "single";
	const hasExistingJson = lastJsonCombineExistingCollections.length > 0;
	const existingMode = getExistingJsonMode();

	document.getElementById("json-combine-single-options").hidden = !isSingleCollection;
	document.getElementById("json-combine-existing-options").hidden = !hasExistingJson;
	document.getElementById("json-combine-target-label").hidden = !hasExistingJson || existingMode !== "append";

	for (const sortInput of document.querySelectorAll('input[name="json-combine-sort-mode"]')) {
		sortInput.disabled = !isSingleCollection && existingMode !== "append";
	}
}

function updateJsonCombineExistingSummary() {
	const summary = document.getElementById("json-combine-existing-summary");
	const targetSelect = document.getElementById("json-combine-target-collection");
	const previousValue = targetSelect.value;

	targetSelect.replaceChildren();

	if (!lastJsonCombineExistingCollections.length) {
		summary.textContent = "";
		return;
	}

	const folderCount = lastJsonCombineExistingCollections.reduce(
		(count, collection) => count + (collection.folders?.length || 0),
		0,
	);

	summary.textContent = `${lastJsonCombineExistingFileName || "Existing JSON"} includes ${lastJsonCombineExistingCollections.length} existing collection${lastJsonCombineExistingCollections.length === 1 ? "" : "s"} and ${folderCount} folder${folderCount === 1 ? "" : "s"}. Choose how to handle it.`;

	lastJsonCombineExistingCollections.forEach((collection, index) => {
		const option = document.createElement("option");
		option.value = String(index);
		option.textContent = `${collection.title || "Untitled collection"} (${collection.folders?.length || 0} folders)`;
		targetSelect.appendChild(option);
	});

	if ([...targetSelect.children].some((option) => option.value === previousValue)) {
		targetSelect.value = previousValue;
	}
}

function resetJsonCombineState() {
	lastCombinedNuvioJson = null;
	lastCombinedNuvioStats = null;
	lastJsonCombineSourceCollections = [];
	lastJsonCombineFiles = [];
	lastJsonCombineBatchCollections = [];
	lastJsonCombineExistingCollections = [];
	lastJsonCombineExistingFileName = "";
	lastJsonCombineFileCount = 0;
	lastJsonCombineDuplicateFileCount = 0;
	document.getElementById("json-combine-files").value = "";
	document.getElementById("json-combine-collection-name").value = "";
	document.getElementById("json-combine-image-url").value = "";
	document.querySelector('input[name="json-combine-sort-mode"][value="original"]').checked = true;
	document.querySelector('input[name="json-combine-mode"][value="single"]').checked = true;
	document.querySelector('input[name="json-combine-existing-mode"][value="new"]').checked = true;
	document.getElementById("download-combined-json").disabled = true;
	updateJsonCombineExistingSummary();
	updateJsonCombineModeUi();
	updateJsonCombineFileLabel([]);
	renderJsonCombineFileList();
	setJsonCombineStatus("Select one or more Nuvio JSON files to combine.");
}

function openJsonCombineModal() {
	resetJsonCombineState();
	openAppModal("json-combine-modal", "json-combine-collection-name");
}

function closeJsonCombineModal() {
	closeJsonCombineFileManager();
	closeNuvioImportHelpModal();
	closeAppModal("json-combine-modal");
}

function getJsonCombineCollectionName(defaultName) {
	return document.getElementById("json-combine-collection-name").value.trim() || defaultName || "Combined Nuvio Collection";
}

function getFolderSortText(title, sortMethod) {
	const words = String(title || "")
		.replace(/[^\p{L}\p{N}\s'-]/gu, " ")
		.trim()
		.split(/\s+/)
		.filter(Boolean);

	if (!words.length) {
		return "";
	}

	if (sortMethod === "last" && words.length > 1) {
		return `${words.at(-1)} ${words.slice(0, -1).join(" ")}`;
	}

	return words.join(" ");
}

function sortFoldersByName(folders, sortMethod) {
	return [...folders].sort((firstFolder, secondFolder) =>
		getFolderSortText(firstFolder.title, sortMethod).localeCompare(
			getFolderSortText(secondFolder.title, sortMethod),
			undefined,
			{ sensitivity: "base" },
		),
	);
}

function getCombinedFolders(collections, options) {
	const seenFolders = new Set();
	let combinedFolders = [];
	let duplicateCount = 0;

	for (const collection of collections) {
		for (const folder of collection.folders || []) {
			const signature = getFolderSignature(folder);

			if (signature && seenFolders.has(signature)) {
				duplicateCount += 1;
				continue;
			}

			if (signature) {
				seenFolders.add(signature);
			}

			combinedFolders.push(cloneJson(folder));
		}
	}

	if (options.sortFolders) {
		combinedFolders = sortFoldersByName(combinedFolders, options.sortMethod);
	}

	return { duplicateCount, folders: combinedFolders };
}

function createCombinedCollection(collections, options) {
	const { duplicateCount, folders } = getCombinedFolders(collections, options);

	if (!folders.length) {
		return { collection: null, duplicateCount, folderCount: 0 };
	}

	const combinedCollection = cloneJson(collections[0]);
	combinedCollection.id = createNuvioId("collection");
	combinedCollection.folders = folders;
	combinedCollection.title = getJsonCombineCollectionName(combinedCollection.title || "Combined Nuvio Collection");

	if (options.collectionImageUrl) {
		combinedCollection.backdropImageUrl = options.collectionImageUrl;
	}

	return { collection: combinedCollection, duplicateCount, folderCount: folders.length };
}

function getTargetExistingCollection(collections) {
	const targetIndex = Number(document.getElementById("json-combine-target-collection").value);

	return collections[targetIndex] || collections[0];
}

function buildCombinedNuvioJson() {
	const options = getJsonCombineOptions();
	const existingMode = getExistingJsonMode();
	const hasExistingJson = lastJsonCombineExistingCollections.length > 0;
	const activeExistingCollections =
		hasExistingJson && existingMode !== "ignore" ? lastJsonCombineExistingCollections.map((collection) => cloneJson(collection)) : [];
	const batchCollections = lastJsonCombineBatchCollections;
	const duplicateFileText = lastJsonCombineDuplicateFileCount
		? ` ${lastJsonCombineDuplicateFileCount} duplicate file${lastJsonCombineDuplicateFileCount === 1 ? "" : "s"} skipped.`
		: "";

	updateJsonCombineExistingSummary();
	updateJsonCombineModeUi();

	if (!batchCollections.length && !activeExistingCollections.length) {
		lastCombinedNuvioJson = null;
		lastCombinedNuvioStats = null;
		document.getElementById("download-combined-json").disabled = true;
		setJsonCombineStatus("Choose one or more people-batch Nuvio JSON files to combine.", "warning");
		return;
	}

	if (!batchCollections.length && activeExistingCollections.length) {
		const folderCount = activeExistingCollections.reduce((count, collection) => count + (collection.folders?.length || 0), 0);

		lastCombinedNuvioJson = activeExistingCollections;
		lastCombinedNuvioStats = {
			collectionCount: activeExistingCollections.length,
			duplicateCount: 0,
			fileCount: lastJsonCombineFileCount,
			folderCount,
			mode: "existing-only",
		};
		setJsonCombineStatus(
			`Ready: ${activeExistingCollections.length} existing collection${activeExistingCollections.length === 1 ? "" : "s"} kept unchanged.${duplicateFileText} Add people batch files if you want to merge new folders into this JSON.`,
			"ready",
		);
		document.getElementById("download-combined-json").disabled = false;
		return;
	}

	if (hasExistingJson && existingMode === "append") {
		const outputCollections = activeExistingCollections;
		const targetCollection = getTargetExistingCollection(outputCollections);
		const { duplicateCount, folders } = getCombinedFolders([targetCollection, ...batchCollections], options);
		const appendedCount = Math.max(folders.length - (targetCollection.folders?.length || 0), 0);

		targetCollection.folders = folders;

		if (options.collectionImageUrl) {
			targetCollection.backdropImageUrl = options.collectionImageUrl;
		}

		lastCombinedNuvioJson = outputCollections;
		lastCombinedNuvioStats = {
			collectionCount: outputCollections.length,
			duplicateCount,
			fileCount: lastJsonCombineFileCount,
			folderCount: outputCollections.reduce((count, collection) => count + (collection.folders?.length || 0), 0),
			mode: "append",
		};

		const sortText = options.sortFolders ? ` Sorted by ${options.sortMethod === "last" ? "last name" : "first name"}.` : "";
		const duplicateText = duplicateCount ? ` ${duplicateCount} duplicate folder${duplicateCount === 1 ? "" : "s"} skipped.` : "";

		setJsonCombineStatus(
			`Ready: ${appendedCount} folder${appendedCount === 1 ? "" : "s"} added to ${targetCollection.title || "the selected collection"}.${duplicateText}${duplicateFileText}${sortText}`,
			"ready",
		);
		document.getElementById("download-combined-json").disabled = false;
		return;
	}

	if (options.mode === "separate") {
		const batchOutput = batchCollections.map((collection) => cloneJson(collection));
		const collections = [...activeExistingCollections, ...batchOutput];
		const folderCount = collections.reduce((count, collection) => count + (collection.folders?.length || 0), 0);

		lastCombinedNuvioJson = collections;
		lastCombinedNuvioStats = {
			collectionCount: collections.length,
			duplicateCount: 0,
			fileCount: lastJsonCombineFileCount,
			folderCount,
			mode: "separate",
		};
		setJsonCombineStatus(
			`Ready: ${lastJsonCombineFileCount} file${lastJsonCombineFileCount === 1 ? "" : "s"}, ${collections.length} collection${collections.length === 1 ? "" : "s"}, ${folderCount} folder${folderCount === 1 ? "" : "s"} kept separate.${duplicateFileText}`,
			"ready",
		);
		document.getElementById("download-combined-json").disabled = false;
		return;
	}

	const { collection: combinedCollection, duplicateCount, folderCount } = createCombinedCollection(batchCollections, options);

	if (!combinedCollection) {
		lastCombinedNuvioJson = null;
		lastCombinedNuvioStats = null;
		document.getElementById("download-combined-json").disabled = true;
		setJsonCombineStatus("No people batch folders were found in those files.", "warning");
		return;
	}

	const outputCollections = [...activeExistingCollections, combinedCollection];

	lastCombinedNuvioStats = {
		collectionCount: outputCollections.length,
		defaultCollectionName: combinedCollection.title || "Combined Nuvio Collection",
		duplicateCount,
		fileCount: lastJsonCombineFileCount,
		folderCount,
		mode: "single",
	};
	lastCombinedNuvioJson = outputCollections;

	const duplicateText = duplicateCount ? ` ${duplicateCount} duplicate folder${duplicateCount === 1 ? "" : "s"} skipped.` : "";
	const sortText = options.sortFolders ? ` Sorted by ${options.sortMethod === "last" ? "last name" : "first name"}.` : "";
	const flattenText =
		batchCollections.length > 1
			? " Flattened into one collection using the first collection's settings."
			: "";
	const existingText =
		hasExistingJson && existingMode === "new"
			? ` Added as a new collection beside ${activeExistingCollections.length} existing collection${activeExistingCollections.length === 1 ? "" : "s"}.`
			: "";

	setJsonCombineStatus(
		`Ready: ${lastJsonCombineFileCount} file${lastJsonCombineFileCount === 1 ? "" : "s"}, ${batchCollections.length} people batch collection${batchCollections.length === 1 ? "" : "s"}, ${folderCount} folder${folderCount === 1 ? "" : "s"} combined.${duplicateText}${duplicateFileText}${sortText}${flattenText}${existingText}`,
		"ready",
	);
	document.getElementById("download-combined-json").disabled = false;
}

function refreshJsonCombineOutput() {
	updateJsonCombineModeUi();
	buildCombinedNuvioJson();
}

async function addNuvioJsonFiles(files) {
	lastCombinedNuvioJson = null;
	lastCombinedNuvioStats = null;
	document.getElementById("download-combined-json").disabled = true;

	if (!files.length) {
		buildCombinedNuvioJson();
		return;
	}

	const errors = [];
	const duplicateFiles = [];
	const acceptedFiles = [];

	for (const file of files) {
		const fileSignature = getFileSignature(file);

		if (
			lastJsonCombineFiles.some((selectedFile) => selectedFile.signature === fileSignature) ||
			acceptedFiles.some((selectedFile) => selectedFile.signature === fileSignature)
		) {
			duplicateFiles.push(file.name);
			continue;
		}

		try {
			const json = JSON.parse(await readTextFile(file));

			if (!Array.isArray(json)) {
				errors.push(`${file.name} is not a Nuvio collection array.`);
				continue;
			}

			const validCollections = json.filter((collection) => collection && Array.isArray(collection.folders));

			if (!validCollections.length) {
				errors.push(`${file.name} does not contain any collections with folders.`);
				continue;
			}

			const isExistingJson = validCollections.some((collection) => !isPeopleBatchCollection(collection));

			acceptedFiles.push({
				collections: validCollections,
				isExistingJson,
				name: file.name,
				signature: fileSignature,
			});
		} catch {
			errors.push(`${file.name} could not be read as JSON.`);
		}
	}

	lastJsonCombineDuplicateFileCount += duplicateFiles.length;

	if (errors.length) {
		setJsonCombineStatus(errors.join(" "), "warning");
		updateJsonCombineFileLabel([]);
		renderJsonCombineFileList();
		document.getElementById("json-combine-files").value = "";
		return;
	}

	lastJsonCombineFiles.push(...acceptedFiles);

	if (!lastJsonCombineFiles.length) {
		setJsonCombineStatus("No Nuvio collections were found in those files.", "warning");
		updateJsonCombineFileLabel([]);
		renderJsonCombineFileList();
		document.getElementById("json-combine-files").value = "";
		return;
	}

	rebuildJsonCombineFileState();

	const existingFiles = lastJsonCombineFiles.filter((file) => file.isExistingJson);
	if (existingFiles.length > 1) {
		setJsonCombineStatus(
			"More than one full Nuvio JSON file was added. Keep this only if you mean to combine existing profiles.",
			"warning",
		);
	}

	updateJsonCombineExistingSummary();
	updateJsonCombineFileLabel([]);
	renderJsonCombineFileList();
	buildCombinedNuvioJson();

	document.getElementById("json-combine-files").value = "";
}

function downloadCombinedNuvioJson() {
	if (!lastCombinedNuvioJson?.length || !lastCombinedNuvioStats) {
		return;
	}

	buildCombinedNuvioJson();

	if (!lastCombinedNuvioJson?.length || !lastCombinedNuvioStats) {
		return;
	}

	const collectionName =
		lastCombinedNuvioStats.mode === "separate"
			? "combined-nuvio-collections"
			: lastCombinedNuvioJson[0].title || "Combined Nuvio Collection";
	const json = JSON.stringify(lastCombinedNuvioJson, null, "\t");
	const filename = `${slugifyFilename(collectionName)}.combined.nuvio.json`;

	downloadTextFile(filename, `${json}\n`, "application/json");
}

function parseCsvRows(csvText) {
	const rows = [];
	let row = [];
	let value = "";
	let inQuotes = false;

	for (let index = 0; index < csvText.length; index += 1) {
		const character = csvText[index];
		const nextCharacter = csvText[index + 1];

		if (character === '"' && inQuotes && nextCharacter === '"') {
			value += '"';
			index += 1;
			continue;
		}

		if (character === '"') {
			inQuotes = !inQuotes;
			continue;
		}

		if (character === "," && !inQuotes) {
			row.push(value);
			value = "";
			continue;
		}

		if ((character === "\n" || character === "\r") && !inQuotes) {
			if (character === "\r" && nextCharacter === "\n") {
				index += 1;
			}

			row.push(value);
			rows.push(row);
			row = [];
			value = "";
			continue;
		}

		value += character;
	}

	row.push(value);
	rows.push(row);

	return rows
		.map((cells) => cells.map((cell) => String(cell || "").replace(/^\uFEFF/, "").trim()))
		.filter((cells) => cells.some(Boolean));
}

function getCsvNameColumnIndex(headerRow) {
	const preferredHeaders = [
		"name",
		"person",
		"people",
		"actor",
		"actors",
		"director",
		"directors",
		"personname",
		"peoplename",
		"actorname",
		"directorname",
		"fullname",
	];

	return headerRow.findIndex((header) =>
		preferredHeaders.includes(
			String(header || "")
				.trim()
				.toLowerCase()
				.replace(/[^a-z]+/g, ""),
		),
	);
}

function getCsvColumnIndex(headerRow, columnNames) {
	return headerRow.findIndex((header) =>
		columnNames.includes(
			String(header || "")
				.trim()
				.toLowerCase()
				.replace(/[^a-z]+/g, ""),
		),
	);
}

function setIncompleteNameWarning(isVisible) {
	document.getElementById("bulk-people-name-warning").hidden = !isVisible;
}

function isLikelyIncompleteName(name) {
	return !String(name || "").trim().includes(" ");
}

function looksLikePersonName(value) {
	return String(value || "").trim().includes(" ");
}

function hasLikelyIncompleteName(names) {
	return names.some(isLikelyIncompleteName);
}

function getIncompleteNameSet(names) {
	return new Set(names.filter(isLikelyIncompleteName));
}

function limitIncompleteNamesToBatch(names) {
	lastBulkPeopleIncompleteInputs = new Set(
		[...lastBulkPeopleIncompleteInputs].filter((name) => names.includes(name)),
	);
	setIncompleteNameWarning(lastBulkPeopleIncompleteInputs.size > 0);
}

function updateIncompleteInputsFromNames(names) {
	lastBulkPeopleIncompleteInputs = getIncompleteNameSet(names);
	setIncompleteNameWarning(lastBulkPeopleIncompleteInputs.size > 0);
}

function getBulkPeopleMatchStatus(matchType, hasIncompleteInput) {
	return hasIncompleteInput ? "Incomplete name - check match" : matchType;
}

function getNamesFromCsvText(csvText) {
	const rows = parseCsvRows(csvText);

	if (!rows.length) {
		return {
			hasIncompleteNames: false,
			names: [],
		};
	}

	if (rows.length === 1) {
		const names = rows[0].map((name) => String(name || "").trim()).filter(Boolean);

		return {
			hasIncompleteNames: hasLikelyIncompleteName(names),
			incompleteNames: getIncompleteNameSet(names),
			names,
		};
	}

	const nameColumnIndex = getCsvNameColumnIndex(rows[0]);
	const shouldUseNameColumn = nameColumnIndex >= 0 && !(nameColumnIndex > 0 && looksLikePersonName(rows[0][0]));

	if (shouldUseNameColumn) {
		const names = rows
			.slice(1)
			.map((row) => row[nameColumnIndex])
			.map((name) => String(name || "").trim())
			.filter(Boolean);

		return {
			hasIncompleteNames: hasLikelyIncompleteName(names),
			incompleteNames: getIncompleteNameSet(names),
			names,
		};
	}

	const firstNameColumnIndex = getCsvColumnIndex(rows[0], [
		"first",
		"firstname",
		"forename",
		"given",
		"givenname",
	]);
	const lastNameColumnIndex = getCsvColumnIndex(rows[0], [
		"family",
		"familyname",
		"last",
		"lastname",
		"surname",
	]);

	if (firstNameColumnIndex >= 0 || lastNameColumnIndex >= 0) {
		let hasIncompleteNames = false;
		const incompleteNames = new Set();
		const names = rows
			.slice(1)
			.map((row) => {
				const firstName = String(row[firstNameColumnIndex] || "").trim();
				const lastName = String(row[lastNameColumnIndex] || "").trim();

				if ((firstName && !lastName) || (!firstName && lastName)) {
					hasIncompleteNames = true;
				}

				const name = [firstName, lastName].filter(Boolean).join(" ");

				if ((firstName && !lastName) || (!firstName && lastName) || isLikelyIncompleteName(name)) {
					incompleteNames.add(name);
				}

				return name;
			})
			.filter(Boolean);

		return {
			hasIncompleteNames: hasIncompleteNames || hasLikelyIncompleteName(names),
			incompleteNames,
			names,
		};
	}

	const names = rows
		.map((row) => row[0])
		.map((name) => String(name || "").trim())
		.filter(Boolean);

	return {
		hasIncompleteNames: hasLikelyIncompleteName(names),
		incompleteNames: getIncompleteNameSet(names),
		names,
	};
}

function getBulkPeopleNames() {
	const inputText = document.getElementById("bulk-people-input").value;

	if (inputText.includes(",") || inputText.includes('"')) {
		const csvResult = getNamesFromCsvText(inputText);

		setIncompleteNameWarning(csvResult.hasIncompleteNames);
		lastBulkPeopleIncompleteInputs = csvResult.incompleteNames || new Set();

		if (csvResult.names.length) {
			return csvResult.names;
		}
	}

	setIncompleteNameWarning(false);
	lastBulkPeopleIncompleteInputs = new Set();

	const names = inputText
		.split("\n")
		.map((name) => name.trim())
		.filter(Boolean);

	updateIncompleteInputsFromNames(names);

	return names;
}

function isSupportedBulkPeopleFile(file) {
	const filename = String(file.name || "").toLowerCase();
	const mimeType = String(file.type || "").toLowerCase();
	const hasSupportedExtension = filename.endsWith(".csv") || filename.endsWith(".txt");
	const hasSupportedMimeType = ["text/csv", "text/plain", "application/vnd.ms-excel"].includes(mimeType);

	return hasSupportedExtension || hasSupportedMimeType;
}

function looksLikeJsonFileText(text) {
	const trimmedText = String(text || "").trim();

	if (!trimmedText || !["[", "{"].includes(trimmedText[0])) {
		return false;
	}

	try {
		JSON.parse(trimmedText);
		return true;
	} catch {
		return false;
	}
}

function rejectBulkPeopleFile(message) {
	document.getElementById("bulk-people-csv-file").value = "";
	document.getElementById("bulk-people-csv-name").textContent = "No file selected";
	setIncompleteNameWarning(false);
	lastBulkPeopleIncompleteInputs = new Set();
	document.getElementById("bulk-people-status").innerText = message;
}

function loadBulkPeopleCsvFile(file) {
	const status = document.getElementById("bulk-people-status");

	if (!file) {
		return;
	}

	if (!isSupportedBulkPeopleFile(file)) {
		rejectBulkPeopleFile("Unsupported file type. Choose a CSV or TXT file with person names.");
		return;
	}

	const reader = new FileReader();

	reader.addEventListener("load", () => {
		const fileText = String(reader.result || "");
		const fileName = document.getElementById("bulk-people-csv-name");

		if (looksLikeJsonFileText(fileText)) {
			rejectBulkPeopleFile("That file looks like JSON. Choose a CSV or TXT file with person names, or paste CSV text instead.");
			return;
		}

		const csvResult = getNamesFromCsvText(fileText);

		fileName.textContent = file.name;
		setIncompleteNameWarning(csvResult.hasIncompleteNames);
		lastBulkPeopleIncompleteInputs = csvResult.incompleteNames || new Set();

		if (!csvResult.names.length) {
			status.innerText =
				"No people names were found. Use a name, person, actor, director, or first/last name column, or put names in the first column.";
			return;
		}

		const namesToUse = csvResult.names.slice(0, BULK_PEOPLE_LIMIT);
		const extraCount = csvResult.names.length - namesToUse.length;

		limitIncompleteNamesToBatch(namesToUse);
		document.getElementById("bulk-people-input").value = namesToUse.join("\n");

		if (extraCount > 0) {
			lastBulkPeopleBatchMessage = `More than ${BULK_PEOPLE_LIMIT} names were provided, matching the first ${BULK_PEOPLE_LIMIT} of ${csvResult.names.length} names. Last included: ${
				namesToUse[namesToUse.length - 1]
			}. Start the next batch after that name.`;
			status.innerText = lastBulkPeopleBatchMessage;
			return;
		}

		lastBulkPeopleBatchMessage = "";
		status.innerText = `Loaded ${csvResult.names.length} names from ${file.name}.`;
	});

	reader.addEventListener("error", () => {
		status.innerText = "Could not read that CSV or TXT file.";
	});

	reader.readAsText(file);
}

function renderBulkPeopleResults(results) {
	const container = document.getElementById("bulk-people-results");
	container.replaceChildren();

	if (!results.length) {
		return;
	}

	const table = document.createElement("table");
	const thead = document.createElement("thead");
	const headerRow = document.createElement("tr");

	for (const heading of ["Input", "Match", "TMDB ID", "Known For", "Credit Count", "Match Type", "TMDB"]) {
		headerRow.appendChild(createElement("th", { text: heading }));
	}

	thead.appendChild(headerRow);
	table.appendChild(thead);

	const tbody = document.createElement("tbody");

	for (const result of results) {
		const tr = document.createElement("tr");

		tr.appendChild(
			createElement("td", {
				className: result.hasIncompleteInput ? "bulk-warning-cell" : "",
				text: result.input,
			}),
		);
		tr.appendChild(createElement("td", { text: result.name || "" }));

		const idCell = document.createElement("td");

		if (result.id) {
			const copyButton = createElement("button", {
				className: "copy-id-button",
				text: result.id,
				attrs: {
					type: "button",
				},
			});

			copyButton.addEventListener("click", () => copyId(result.id));
			idCell.appendChild(copyButton);
		}

		tr.appendChild(idCell);
		tr.appendChild(createElement("td", { text: result.knownFor || "\u2014" }));
		tr.appendChild(createElement("td", { text: result.creditCount || "\u2014" }));
		tr.appendChild(createElement("td", { text: result.status }));

		const tmdbCell = document.createElement("td");

		if (result.id) {
			tmdbCell.appendChild(
				createElement("a", {
					text: "Open",
					attrs: {
						href: `https://www.themoviedb.org/person/${result.id}`,
						target: "_blank",
						rel: "noopener",
					},
				}),
			);
		}

		tr.appendChild(tmdbCell);
		tbody.appendChild(tr);
	}

	table.appendChild(tbody);
	container.appendChild(table);
}

function downloadBulkPeopleCsv(mode) {
	if (!lastBulkPeopleResults.length) {
		return;
	}

	const headers = [
		"input",
		"matched_name",
		"tmdb_person_id",
		"known_for",
		"credit_count",
		"profile_path",
		"profile_image_url",
		"match_type",
	];

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
					result.profilePath || "",
					result.profileImageUrl || "",
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
	let names = getBulkPeopleNames();

	if (!names.length) {
		lastBulkPeopleResults = [];
		renderBulkPeopleResults([]);

		status.innerText = "Paste one name per line first.";
		return;
	}

	if (names.length > BULK_PEOPLE_LIMIT) {
		const originalCount = names.length;

		names = names.slice(0, BULK_PEOPLE_LIMIT);
		document.getElementById("bulk-people-input").value = names.join("\n");
		limitIncompleteNamesToBatch(names);
		lastBulkPeopleBatchMessage = `More than ${BULK_PEOPLE_LIMIT} names were provided, matching the first ${BULK_PEOPLE_LIMIT} of ${originalCount} names. Last included: ${
			names[names.length - 1]
		}. Start the next batch after that name.`;
		status.innerText = lastBulkPeopleBatchMessage;
	} else if (!lastBulkPeopleBatchMessage.startsWith("More than")) {
		lastBulkPeopleBatchMessage = "";
	}

	status.innerText = status.innerText
		? `${status.innerText} Resolving people IDs...`
		: "Resolving people IDs...";
	lastBulkPeopleResults = [];
	renderBulkPeopleResults([]);

	for (const input of names) {
		const hasIncompleteInput = lastBulkPeopleIncompleteInputs.has(input);

		try {
			const response = await tmdbJsonWithStatus(tmdbApiUrl("/3/search/person", { query: input, page: 1 }));

			if (response.rateLimited) {
				lastBulkPeopleResults.push({
					hasIncompleteInput,
					input,
					name: "",
					id: "",
					knownFor: "",
					creditCount: "",
					profilePath: "",
					profileImageUrl: "",
					status: getBulkPeopleMatchStatus("TMDB rate limit reached", hasIncompleteInput),
				});

				break;
			}

			if (!response.ok) {
				lastBulkPeopleResults.push({
					hasIncompleteInput,
					input,
					name: "",
					id: "",
					knownFor: "",
					creditCount: "",
					profilePath: "",
					profileImageUrl: "",
					status: getBulkPeopleMatchStatus(
						response.status ? `TMDB error HTTP ${response.status}` : "Network error",
						hasIncompleteInput,
					),
				});

				continue;
			}

			const match = findBestPeopleMatch(response.data?.results || [], input);

			if (match.person) {
				const knownCredits = await getPersonKnownCredits(match.person.id);

				lastBulkPeopleResults.push({
					hasIncompleteInput,
					input,
					name: match.person.name || "",
					id: match.person.id,
					knownFor: match.person.known_for_department || "\u2014",
					creditCount: knownCredits,
					profilePath: match.person.profile_path || "",
					profileImageUrl: getTmdbProfileImageUrl(match.person.profile_path),
					status: getBulkPeopleMatchStatus(match.matchType, hasIncompleteInput),
				});
			} else {
				lastBulkPeopleResults.push({
					hasIncompleteInput,
					input,
					name: "",
					id: "",
					knownFor: "",
					creditCount: "",
					profilePath: "",
					profileImageUrl: "",
					status: getBulkPeopleMatchStatus(match.matchType, hasIncompleteInput),
				});
			}
		} catch {
			lastBulkPeopleResults.push({
				hasIncompleteInput,
				input,
				name: "",
				id: "",
				knownFor: "",
				creditCount: "",
				profilePath: "",
				profileImageUrl: "",
				status: getBulkPeopleMatchStatus("Lookup failed", hasIncompleteInput),
			});
		}
	}

	renderBulkPeopleResults(lastBulkPeopleResults);

	const matchedCount = lastBulkPeopleResults.filter((result) => result.id).length;

	status.replaceChildren(document.createTextNode(`Resolved people IDs: matched ${matchedCount} of ${names.length}.`));

	if (lastBulkPeopleBatchMessage) {
		status.appendChild(
			createElement("span", {
				className: "bulk-batch-notice",
				text: lastBulkPeopleBatchMessage,
			}),
		);
	}

	if (matchedCount) {
		const downloadButton = createElement("button", {
			text: "Download CSV",
			attrs: {
				type: "button",
			},
		});

		downloadButton.addEventListener("click", () => downloadBulkPeopleCsv("people"));
		status.appendChild(document.createTextNode(" "));
		status.appendChild(downloadButton);

		const nuvioJsonButton = createElement("button", {
			text: "Create Nuvio JSON from matches",
			attrs: {
				type: "button",
			},
		});

		nuvioJsonButton.addEventListener("click", openNuvioExportModal);
		status.appendChild(document.createTextNode(" "));
		status.appendChild(nuvioJsonButton);
	}
}

function initBulkPeopleLookup() {
	document.getElementById("bulk-people-input").addEventListener("input", () => {
		lastBulkPeopleBatchMessage = "";
		lastBulkPeopleIncompleteInputs = new Set();
		setIncompleteNameWarning(false);
	});

	document.getElementById("bulk-people-btn").addEventListener("click", () => {
		resolveBulkPeople();
	});

	document.getElementById("clear-bulk-people").addEventListener("click", () => {
		document.getElementById("bulk-people-input").value = "";
		document.getElementById("bulk-people-csv-file").value = "";
		document.getElementById("bulk-people-csv-name").textContent = "No file selected";
		setIncompleteNameWarning(false);
		lastBulkPeopleBatchMessage = "";
		lastBulkPeopleIncompleteInputs = new Set();
		document.getElementById("bulk-people-status").innerText = "";
		document.getElementById("bulk-people-results").replaceChildren();
		closeNuvioExportModal();
		lastBulkPeopleResults = [];
	});

	document.getElementById("bulk-people-csv-file").addEventListener("change", (event) => {
		loadBulkPeopleCsvFile(event.target.files[0]);
	});

	document.getElementById("open-json-combine-modal").addEventListener("click", openJsonCombineModal);
	document.getElementById("close-json-combine-modal").addEventListener("click", closeJsonCombineModal);
	document.getElementById("cancel-json-combine").addEventListener("click", closeJsonCombineModal);
	document.getElementById("manage-json-combine-files").addEventListener("click", openJsonCombineFileManager);
	document.getElementById("close-json-combine-file-manager").addEventListener("click", closeJsonCombineFileManager);
	document.getElementById("open-json-combine-import-help").addEventListener("click", openNuvioImportHelpModal);
	document.getElementById("json-combine-files").addEventListener("change", (event) => {
		addNuvioJsonFiles([...event.target.files]);
	});
	document.getElementById("json-combine-collection-name").addEventListener("input", refreshJsonCombineOutput);
	document.getElementById("json-combine-image-url").addEventListener("input", refreshJsonCombineOutput);
	for (const modeInput of document.querySelectorAll('input[name="json-combine-mode"]')) {
		modeInput.addEventListener("change", refreshJsonCombineOutput);
	}
	for (const sortInput of document.querySelectorAll('input[name="json-combine-sort-mode"]')) {
		sortInput.addEventListener("change", refreshJsonCombineOutput);
	}
	for (const existingModeInput of document.querySelectorAll('input[name="json-combine-existing-mode"]')) {
		existingModeInput.addEventListener("change", refreshJsonCombineOutput);
	}
	document.getElementById("json-combine-target-collection").addEventListener("change", refreshJsonCombineOutput);
	document.getElementById("download-combined-json").addEventListener("click", downloadCombinedNuvioJson);

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
	document.getElementById("json-combine-modal").addEventListener("click", (event) => {
		if (event.target.id === "json-combine-modal") {
			closeJsonCombineModal();
		}
	});
	document.getElementById("json-combine-file-manager-modal").addEventListener("click", (event) => {
		if (event.target.id === "json-combine-file-manager-modal") {
			closeJsonCombineFileManager();
		}
	});
	document.getElementById("nuvio-import-help-modal").addEventListener("click", (event) => {
		if (event.target.id === "nuvio-import-help-modal") {
			closeNuvioImportHelpModal();
		}
	});
}
