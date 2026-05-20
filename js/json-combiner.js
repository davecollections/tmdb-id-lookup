let jsonCombinerInitialized = false;
let lastCombinedNuvioJson = null;
let lastCombinedNuvioStats = null;
let lastJsonCombineSourceCollections = [];
let lastJsonCombineFiles = [];
let lastJsonCombineBatchCollections = [];
let lastJsonCombineExistingCollections = [];
let lastJsonCombineExistingFileName = "";
let lastJsonCombineFileCount = 0;
let lastJsonCombineDuplicateFileCount = 0;

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
			`Ready: ${activeExistingCollections.length} existing collection${activeExistingCollections.length === 1 ? "" : "s"} kept unchanged.${duplicateFileText} Add people batch files if you want to merge folders into this JSON.`,
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
			`Ready: ${appendedCount} folder${appendedCount === 1 ? "" : "s"} merged into ${targetCollection.title || "the selected collection"}.${duplicateText}${duplicateFileText}${sortText}`,
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
			`Ready: ${lastJsonCombineFileCount} file${lastJsonCombineFileCount === 1 ? "" : "s"} combined into one download, with ${collections.length} collection${collections.length === 1 ? "" : "s"} and ${folderCount} folder${folderCount === 1 ? "" : "s"} kept separate.${duplicateFileText}`,
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
		`Ready: ${lastJsonCombineFileCount} file${lastJsonCombineFileCount === 1 ? "" : "s"} combined, with ${folderCount} folder${folderCount === 1 ? "" : "s"} merged into one collection.${duplicateText}${duplicateFileText}${sortText}${flattenText}${existingText}`,
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

function initJsonCombiner() {
	if (jsonCombinerInitialized) {
		return;
	}

	const openButton = document.getElementById("open-json-combine-modal");

	if (!openButton) {
		return;
	}

	jsonCombinerInitialized = true;

	openButton.addEventListener("click", openJsonCombineModal);
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
}
