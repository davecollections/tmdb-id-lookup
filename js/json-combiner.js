let jsonCombinerInitialized = false;
let lastCombinedNuvioJson = null;
let lastCombinedNuvioStats = null;
let lastJsonCombineSourceCollections = [];
let lastJsonCombineFiles = [];
let lastJsonCombineBatchCollections = [];
let lastJsonCombineBatchEntries = [];
let lastJsonCombineExistingCollections = [];
let lastJsonCombineExistingEntries = [];
let lastJsonCombineExistingFileName = "";
let lastJsonCombineFileCount = 0;
let lastJsonCombineDuplicateFileCount = 0;
let lastJsonCombineCollectionEdits = new Map();

const MAX_JSON_COMBINE_FILE_BYTES = 2 * 1024 * 1024;
const MAX_JSON_COMBINE_TOTAL_BYTES = 10 * 1024 * 1024;

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

function getFileSignature(file) {
	return `${file.name}:${file.size}:${file.lastModified}`;
}

function getCollectionFolders(collection) {
	return Array.isArray(collection?.folders) ? collection.folders : [];
}

function getFolderSources(folder) {
	return Array.isArray(folder?.sources) ? folder.sources : [];
}

function hasValue(value) {
	return value !== null && value !== undefined && String(value).trim() !== "";
}

function hasNumericValue(value) {
	return hasValue(value) && Number.isFinite(Number(value));
}

function getTrimmedId(value) {
	return hasValue(value) ? String(value).trim() : "";
}

function getMergeableBatchType(collection) {
	const folders = getCollectionFolders(collection);
	const peopleSourceTypes = new Set(["DIRECTOR", "PERSON"]);

	if (!folders.length) {
		return "";
	}

	const isPeopleBatch = folders.every((folder) => {
		const sources = getFolderSources(folder);

		return (
			sources.length > 0 &&
			sources.every(
				(source) =>
					source.provider === "tmdb" &&
					peopleSourceTypes.has(source.tmdbSourceType) &&
					hasNumericValue(source.tmdbId),
			)
		);
	});

	if (isPeopleBatch) {
		return "people";
	}

	const isMovieCollectionBatch = folders.every((folder) => {
		const sources = getFolderSources(folder);

		return (
			sources.length > 0 &&
			sources.every(
				(source) =>
					source.provider === "tmdb" &&
					source.tmdbSourceType === "COLLECTION" &&
					source.mediaType === "MOVIE" &&
					hasNumericValue(source.tmdbId),
			)
		);
	});

	return isMovieCollectionBatch ? "movieCollection" : "";
}

function isMergeableBatchCollection(collection) {
	return Boolean(getMergeableBatchType(collection));
}

function getJsonCombineFileTypeLabel(file) {
	if (file.isExistingJson) {
		return "Full Nuvio export";
	}

	if (file.batchType === "people") {
		return "People JSON";
	}

	if (file.batchType === "movieCollection") {
		return "Movie collection JSON";
	}

	return "Nuvio collection JSON";
}

function getSortModeLabel(sortMethod) {
	return sortMethod === "last" ? "last name" : "name/title";
}

function addJsonCombineWarning(warnings, message) {
	warnings.set(message, (warnings.get(message) || 0) + 1);
}

function formatJsonCombineWarning([message, count]) {
	return count === 1 ? message : `${message} (${count})`;
}

function validateJsonCombineSource(source, warnings) {
	if (!source || typeof source !== "object") {
		addJsonCombineWarning(warnings, "Source is not an object.");
		return;
	}

	if (!source.provider) {
		addJsonCombineWarning(warnings, "Source missing provider.");
		return;
	}

	if (source.provider === "tmdb") {
		if (!source.tmdbSourceType) {
			addJsonCombineWarning(warnings, "TMDB source missing source type.");
		}

		if (!source.mediaType) {
			addJsonCombineWarning(warnings, "TMDB source missing media type.");
		}

		if (source.tmdbSourceType === "DISCOVER") {
			if (!source.filters || typeof source.filters !== "object") {
				addJsonCombineWarning(warnings, "TMDB Discover source missing filters.");
			}
			return;
		}

		if (source.tmdbSourceType === "COLLECTION") {
			if (!hasNumericValue(source.tmdbId)) {
				addJsonCombineWarning(warnings, "TMDB collection source missing numeric TMDB ID.");
			}
			return;
		}

		if (!hasValue(source.tmdbId)) {
			addJsonCombineWarning(warnings, "TMDB direct source missing TMDB ID.");
		}

		return;
	}

	if (source.provider === "trakt") {
		if (!hasValue(source.traktListId)) {
			addJsonCombineWarning(warnings, "Trakt source missing list ID.");
		}

		if (!source.mediaType) {
			addJsonCombineWarning(warnings, "Trakt source missing media type.");
		}

		return;
	}

	if (source.provider === "addon") {
		if (!source.addonId) {
			addJsonCombineWarning(warnings, "Add-on source missing add-on ID.");
		}

		if (!source.catalogId) {
			addJsonCombineWarning(warnings, "Add-on source missing catalog ID.");
		}

		if (!source.type) {
			addJsonCombineWarning(warnings, "Add-on source missing type.");
		}
	}
}

function getJsonCombineWarnings(collections) {
	const warnings = new Map();

	collections.forEach((collection) => {
		if (!collection || typeof collection !== "object") {
			addJsonCombineWarning(warnings, "Collection is not an object.");
			return;
		}

		if (!hasValue(collection.title)) {
			addJsonCombineWarning(warnings, "Collection missing title.");
		}

		if (!Array.isArray(collection.folders)) {
			addJsonCombineWarning(warnings, "Collection missing folders.");
			return;
		}

		for (const folder of collection.folders) {
			if (!folder || typeof folder !== "object") {
				addJsonCombineWarning(warnings, "Folder is not an object.");
				continue;
			}

			if (!hasValue(folder.title)) {
				addJsonCombineWarning(warnings, "Folder missing title.");
			}

			if (!Array.isArray(folder.sources)) {
				addJsonCombineWarning(warnings, "Folder missing sources.");
				continue;
			}

			if (!folder.sources.length) {
				addJsonCombineWarning(warnings, "Folder has no sources.");
			}

			for (const source of folder.sources) {
				validateJsonCombineSource(source, warnings);
			}
		}
	});

	return [...warnings.entries()].map(formatJsonCombineWarning);
}

function stripLeadingSortArticle(title) {
	return String(title || "").trim().replace(/^(the|an|a)\s+/i, "");
}

function getFolderSortWords(title, sortMethod) {
	const sortTitle = sortMethod === "last" ? title : stripLeadingSortArticle(title);

	return String(sortTitle || "")
		.replace(/[^\p{L}\p{N}\s'-]/gu, " ")
		.trim()
		.split(/\s+/)
		.filter(Boolean);
}

function getExistingJsonMode() {
	return document.querySelector('input[name="json-combine-existing-mode"]:checked')?.value || "new";
}

function setJsonCombineStatus(message, statusType = "") {
	const status = document.getElementById("json-combine-status");

	status.className = statusType ? `json-combine-status ${statusType}` : "json-combine-status";
	status.textContent = message;
}

function setJsonCombineExportDisabled(disabled) {
	document.getElementById("download-combined-json").disabled = disabled;
	document.getElementById("copy-combined-json").disabled = disabled;
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

function getJsonCombineFileEntries(files) {
	return files.flatMap((file) =>
		file.collections.map((collection, index) => ({
			collection,
			fileName: file.name,
			key: `${file.signature}:${index}`,
		})),
	);
}

function rebuildJsonCombineFileState() {
	const existingFiles = lastJsonCombineFiles.filter((file) => file.isExistingJson);
	const batchFiles = lastJsonCombineFiles.filter((file) => !file.isExistingJson);

	lastJsonCombineExistingEntries = getJsonCombineFileEntries(existingFiles);
	lastJsonCombineBatchEntries = getJsonCombineFileEntries(batchFiles);
	lastJsonCombineExistingCollections = lastJsonCombineExistingEntries.map((entry) => entry.collection);
	lastJsonCombineExistingFileName =
		existingFiles.length === 1 ? existingFiles[0].name : `${existingFiles.length} existing JSON files`;
	lastJsonCombineBatchCollections = lastJsonCombineBatchEntries.map((entry) => entry.collection);
	lastJsonCombineSourceCollections = [...lastJsonCombineExistingCollections, ...lastJsonCombineBatchCollections];
	lastJsonCombineFileCount = lastJsonCombineFiles.length;
}

function getJsonCombineOutputCounts(collections) {
	const folders = collections.flatMap(getCollectionFolders);
	const sources = folders.flatMap(getFolderSources);

	return {
		collectionCount: collections.length,
		folderCount: folders.length,
		sourceCount: sources.length,
	};
}

function renderJsonCombineSummary(stats) {
	const summary = document.getElementById("json-combine-summary");

	summary.replaceChildren();

	if (!stats) {
		summary.hidden = true;
		return;
	}

	summary.hidden = false;

	const grid = document.createElement("div");
	grid.className = "json-combine-summary-grid";

	const items = [
		["Files", stats.fileCount],
		["Collections", stats.collectionCount],
		["Folders", stats.folderCount],
		["Sources", stats.sourceCount],
		["ID fixes", stats.idFixCount],
		["Warnings", stats.warningCount],
	];

	for (const [label, value] of items) {
		const item = document.createElement("div");
		item.className = "json-combine-summary-item";

		const number = document.createElement("strong");
		number.textContent = String(value || 0);

		const text = document.createElement("span");
		text.textContent = label;

		item.appendChild(number);
		item.appendChild(text);
		grid.appendChild(item);
	}

	summary.appendChild(grid);

	const detailMessages = [];

	if (stats.idFixCount) {
		const fixes = [];

		if (stats.missingCollectionIdsFixed) {
			fixes.push(`${stats.missingCollectionIdsFixed} missing collection ID${stats.missingCollectionIdsFixed === 1 ? "" : "s"}`);
		}

		if (stats.duplicateCollectionIdsFixed) {
			fixes.push(`${stats.duplicateCollectionIdsFixed} duplicate collection ID${stats.duplicateCollectionIdsFixed === 1 ? "" : "s"}`);
		}

		if (stats.missingFolderIdsFixed) {
			fixes.push(`${stats.missingFolderIdsFixed} missing folder ID${stats.missingFolderIdsFixed === 1 ? "" : "s"}`);
		}

		if (stats.duplicateFolderIdsFixed) {
			fixes.push(`${stats.duplicateFolderIdsFixed} duplicate folder ID${stats.duplicateFolderIdsFixed === 1 ? "" : "s"}`);
		}

		detailMessages.push(`Fixes: regenerated ${fixes.join(", ")}.`);
	}

	if (stats.warnings?.length) {
		const shownWarnings = stats.warnings.slice(0, 4).join(" ");
		const remainingWarnings = stats.warnings.length > 4 ? ` +${stats.warnings.length - 4} more.` : "";

		detailMessages.push(`Warnings: ${shownWarnings}${remainingWarnings}`);
	}

	for (const message of detailMessages) {
		const detail = document.createElement("p");
		detail.className = "json-combine-summary-detail";
		detail.textContent = message;
		summary.appendChild(detail);
	}
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
		type.textContent = getJsonCombineFileTypeLabel(file);

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

function getSeparateJsonCombineEntries() {
	const existingMode = getExistingJsonMode();
	const hasExistingJson = lastJsonCombineExistingEntries.length > 0;
	const activeExistingEntries = hasExistingJson && existingMode !== "ignore" ? lastJsonCombineExistingEntries : [];

	return [...activeExistingEntries, ...lastJsonCombineBatchEntries];
}

function setJsonCombineCollectionEdit(key, fieldName, value) {
	const currentEdit = lastJsonCombineCollectionEdits.get(key) || {};
	const nextEdit = {
		...currentEdit,
		[fieldName]: value,
	};

	if (!nextEdit.title && !nextEdit.imageUrl) {
		lastJsonCombineCollectionEdits.delete(key);
	} else {
		lastJsonCombineCollectionEdits.set(key, nextEdit);
	}

	buildCombinedNuvioJson(true);
}

function renderJsonCombineCollectionEdits() {
	const editList = document.getElementById("json-combine-collection-edit-list");
	const editToggle = document.getElementById("json-combine-edit-collections");
	const entries = getSeparateJsonCombineEntries();

	editList.replaceChildren();

	if (!entries.length) {
		editToggle.checked = false;
		editToggle.disabled = true;
		editList.hidden = true;
		return;
	}

	editToggle.disabled = false;
	editList.hidden = !editToggle.checked;

	if (!editToggle.checked) {
		return;
	}

	entries.forEach((entry, index) => {
		const edit = lastJsonCombineCollectionEdits.get(entry.key) || {};
		const row = document.createElement("div");
		row.className = "json-combine-collection-edit-row";

		const source = document.createElement("div");
		source.className = "json-combine-collection-edit-source";

		const title = document.createElement("strong");
		title.textContent = entry.collection.title || `Collection ${index + 1}`;

		const fileName = document.createElement("span");
		fileName.textContent = entry.fileName;

		source.appendChild(title);
		source.appendChild(fileName);

		const fields = document.createElement("div");
		fields.className = "json-combine-collection-edit-fields";

		const nameLabel = document.createElement("label");
		nameLabel.textContent = "New name";
		const nameInput = document.createElement("input");
		nameInput.value = edit.title || "";
		nameInput.placeholder = "Leave blank to keep original";
		nameInput.addEventListener("input", (event) => {
			setJsonCombineCollectionEdit(entry.key, "title", event.target.value.trim());
		});
		nameLabel.appendChild(nameInput);

		const imageLabel = document.createElement("label");
		imageLabel.textContent = "Image URL";
		const imageInput = document.createElement("input");
		imageInput.value = edit.imageUrl || "";
		imageInput.placeholder = "Leave blank to keep original";
		imageInput.addEventListener("input", (event) => {
			setJsonCombineCollectionEdit(entry.key, "imageUrl", event.target.value.trim());
		});
		imageLabel.appendChild(imageInput);

		fields.appendChild(nameLabel);
		fields.appendChild(imageLabel);
		row.appendChild(source);
		row.appendChild(fields);
		editList.appendChild(row);
	});
}

function removeJsonCombineFile(signature) {
	lastJsonCombineFiles = lastJsonCombineFiles.filter((file) => file.signature !== signature);
	lastJsonCombineDuplicateFileCount = 0;
	lastCombinedNuvioJson = null;
	lastCombinedNuvioStats = null;

	for (const key of lastJsonCombineCollectionEdits.keys()) {
		if (key.startsWith(`${signature}:`)) {
			lastJsonCombineCollectionEdits.delete(key);
		}
	}

	rebuildJsonCombineFileState();
	updateJsonCombineExistingSummary();
	updateJsonCombineModeUi();
	updateJsonCombineFileLabel([]);
	renderJsonCombineFileList();

	if (!lastJsonCombineFiles.length) {
		setJsonCombineExportDisabled(true);
		renderJsonCombineSummary(null);
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

function updateJsonCombineModeUi(skipEditRender = false) {
	const isSingleCollection = getJsonCombineMode() === "single";
	const hasExistingJson = lastJsonCombineExistingCollections.length > 0;
	const hasBatchCollections = lastJsonCombineBatchCollections.length > 0;
	const showExistingOptions = hasExistingJson && hasBatchCollections && isSingleCollection;
	let existingMode = getExistingJsonMode();

	if (!showExistingOptions && existingMode !== "new") {
		const newModeInput = document.querySelector('input[name="json-combine-existing-mode"][value="new"]');

		if (newModeInput) {
			newModeInput.checked = true;
			existingMode = "new";
		}
	}

	document.getElementById("json-combine-single-options").hidden = !isSingleCollection;
	document.getElementById("json-combine-separate-options").hidden = isSingleCollection || !lastJsonCombineSourceCollections.length;
	document.getElementById("json-combine-existing-options").hidden = !showExistingOptions;
	document.getElementById("json-combine-target-label").hidden = !showExistingOptions || existingMode !== "append";

	for (const sortInput of document.querySelectorAll('input[name="json-combine-sort-mode"]')) {
		sortInput.disabled = !isSingleCollection && existingMode !== "append";
	}

	if (!skipEditRender) {
		renderJsonCombineCollectionEdits();
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

	summary.textContent = `${lastJsonCombineExistingFileName || "Full Nuvio JSON"} includes ${lastJsonCombineExistingCollections.length} existing collection${lastJsonCombineExistingCollections.length === 1 ? "" : "s"} and ${folderCount} folder${folderCount === 1 ? "" : "s"}. Because other JSON files were also added, choose where those folders should go.`;

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
	lastJsonCombineBatchEntries = [];
	lastJsonCombineExistingCollections = [];
	lastJsonCombineExistingEntries = [];
	lastJsonCombineExistingFileName = "";
	lastJsonCombineFileCount = 0;
	lastJsonCombineDuplicateFileCount = 0;
	lastJsonCombineCollectionEdits = new Map();
	document.getElementById("json-combine-files").value = "";
	document.getElementById("json-combine-collection-name").value = "";
	document.getElementById("json-combine-image-url").value = "";
	document.getElementById("json-combine-edit-collections").checked = false;
	document.querySelector('input[name="json-combine-sort-mode"][value="original"]').checked = true;
	document.querySelector('input[name="json-combine-mode"][value="single"]').checked = true;
	document.querySelector('input[name="json-combine-existing-mode"][value="new"]').checked = true;
	setJsonCombineExportDisabled(true);
	updateJsonCombineExistingSummary();
	updateJsonCombineModeUi();
	updateJsonCombineFileLabel([]);
	renderJsonCombineFileList();
	renderJsonCombineSummary(null);
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
	const words = getFolderSortWords(title, sortMethod);

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
	let combinedFolders = [];

	for (const collection of collections) {
		for (const folder of getCollectionFolders(collection)) {
			combinedFolders.push(cloneJson(folder));
		}
	}

	if (options.sortFolders) {
		combinedFolders = sortFoldersByName(combinedFolders, options.sortMethod);
	}

	return combinedFolders;
}

function createUniqueNuvioId(prefix, seenIds) {
	let id = createNuvioId(prefix);

	while (seenIds.has(id)) {
		id = createNuvioId(prefix);
	}

	seenIds.add(id);
	return id;
}

function normalizeNuvioOutputIds(collections) {
	const seenCollectionIds = new Set();
	const seenFolderIds = new Set();
	const fixes = {
		duplicateCollectionIdsFixed: 0,
		duplicateFolderIdsFixed: 0,
		missingCollectionIdsFixed: 0,
		missingFolderIdsFixed: 0,
	};

	for (const collection of collections) {
		const collectionId = getTrimmedId(collection.id);

		if (!collectionId) {
			collection.id = createUniqueNuvioId("collection", seenCollectionIds);
			fixes.missingCollectionIdsFixed += 1;
		} else if (seenCollectionIds.has(collectionId)) {
			collection.id = createUniqueNuvioId("collection", seenCollectionIds);
			fixes.duplicateCollectionIdsFixed += 1;
		} else {
			collection.id = collectionId;
			seenCollectionIds.add(collectionId);
		}

		for (const folder of getCollectionFolders(collection)) {
			const folderId = getTrimmedId(folder.id);

			if (!folderId) {
				folder.id = createUniqueNuvioId("folder", seenFolderIds);
				fixes.missingFolderIdsFixed += 1;
			} else if (seenFolderIds.has(folderId)) {
				folder.id = createUniqueNuvioId("folder", seenFolderIds);
				fixes.duplicateFolderIdsFixed += 1;
			} else {
				folder.id = folderId;
				seenFolderIds.add(folderId);
			}
		}
	}

	return fixes;
}

function getJsonCombineIdFixCount(idFixes) {
	return (
		idFixes.duplicateCollectionIdsFixed +
		idFixes.duplicateFolderIdsFixed +
		idFixes.missingCollectionIdsFixed +
		idFixes.missingFolderIdsFixed
	);
}

function hasCommunityMetadata(collection) {
	return Boolean(collection && Object.prototype.hasOwnProperty.call(collection, "community"));
}

function stripCommunityMetadata(collection) {
	if (collection && Object.prototype.hasOwnProperty.call(collection, "community")) {
		delete collection.community;
		return true;
	}

	return false;
}

function createCombinedCollection(collections, options) {
	const folders = getCombinedFolders(collections, options);

	if (!folders.length) {
		return { collection: null, folderCount: 0 };
	}

	const combinedCollection = cloneJson(collections[0]);
	const communityLinksRemoved = collections.some(hasCommunityMetadata);
	combinedCollection.id = createNuvioId("collection");
	combinedCollection.folders = folders;
	combinedCollection.title = getJsonCombineCollectionName(combinedCollection.title || "Combined Nuvio Collection");
	stripCommunityMetadata(combinedCollection);

	if (options.collectionImageUrl) {
		combinedCollection.backdropImageUrl = options.collectionImageUrl;
	}

	return { collection: combinedCollection, communityLinksRemoved, folderCount: folders.length };
}

function getTargetExistingCollection(collections) {
	const targetIndex = Number(document.getElementById("json-combine-target-collection").value);

	return collections[targetIndex] || collections[0];
}

function applyJsonCombineCollectionEdits(collection, key, index) {
	const edit = lastJsonCombineCollectionEdits.get(key) || {};

	if (edit.title) {
		collection.title = edit.title;
	} else if (!hasValue(collection.title)) {
		collection.title = `Collection ${index + 1}`;
	}

	if (edit.imageUrl) {
		collection.backdropImageUrl = edit.imageUrl;
	}
}

function buildSeparateJsonCombineCollections() {
	return getSeparateJsonCombineEntries().map((entry, index) => {
		const collection = cloneJson(entry.collection);

		applyJsonCombineCollectionEdits(collection, entry.key, index);
		return collection;
	});
}

function finalizeCombinedNuvioJson(collections, stats) {
	const idFixes = normalizeNuvioOutputIds(collections);
	const outputCounts = getJsonCombineOutputCounts(collections);
	const warnings = getJsonCombineWarnings(collections);
	const normalizedStats = {
		...stats,
		...outputCounts,
		...idFixes,
		idFixCount: getJsonCombineIdFixCount(idFixes),
		warningCount: warnings.length,
		warnings,
	};

	lastCombinedNuvioJson = collections;
	lastCombinedNuvioStats = normalizedStats;
	renderJsonCombineSummary(normalizedStats);
	setJsonCombineExportDisabled(false);

	return normalizedStats;
}

function getJsonCombineFixStatusText(stats) {
	const messages = [];

	if (stats.missingCollectionIdsFixed) {
		messages.push(`${stats.missingCollectionIdsFixed} missing collection ID${stats.missingCollectionIdsFixed === 1 ? "" : "s"} fixed`);
	}

	if (stats.duplicateCollectionIdsFixed) {
		messages.push(`${stats.duplicateCollectionIdsFixed} duplicate collection ID${stats.duplicateCollectionIdsFixed === 1 ? "" : "s"} fixed`);
	}

	if (stats.missingFolderIdsFixed) {
		messages.push(`${stats.missingFolderIdsFixed} missing folder ID${stats.missingFolderIdsFixed === 1 ? "" : "s"} fixed`);
	}

	if (stats.duplicateFolderIdsFixed) {
		messages.push(`${stats.duplicateFolderIdsFixed} duplicate folder ID${stats.duplicateFolderIdsFixed === 1 ? "" : "s"} fixed`);
	}

	return messages.length ? ` ${messages.join("; ")}.` : "";
}

function getJsonCombineWarningStatusText(stats) {
	return stats.warningCount ? ` ${stats.warningCount} validation warning${stats.warningCount === 1 ? "" : "s"}.` : "";
}

function getJsonCombineCommunityStatusText(communityLinksRemoved) {
	return communityLinksRemoved ? " Community update links were removed." : "";
}

function buildCombinedNuvioJson(skipEditRender = false) {
	const options = getJsonCombineOptions();
	let existingMode = getExistingJsonMode();
	const hasExistingJson = lastJsonCombineExistingCollections.length > 0;
	const batchCollections = lastJsonCombineBatchCollections;
	const duplicateFileText = lastJsonCombineDuplicateFileCount
		? ` ${lastJsonCombineDuplicateFileCount} duplicate file${lastJsonCombineDuplicateFileCount === 1 ? "" : "s"} skipped.`
		: "";

	updateJsonCombineExistingSummary();
	updateJsonCombineModeUi(skipEditRender);
	existingMode = getExistingJsonMode();

	const activeExistingCollections =
		hasExistingJson && existingMode !== "ignore" ? lastJsonCombineExistingCollections.map((collection) => cloneJson(collection)) : [];

	if (!batchCollections.length && !activeExistingCollections.length) {
		lastCombinedNuvioJson = null;
		lastCombinedNuvioStats = null;
		setJsonCombineExportDisabled(true);
		renderJsonCombineSummary(null);
		setJsonCombineStatus("Choose one or more Nuvio JSON files to combine.", "warning");
		return;
	}

	if (!batchCollections.length && activeExistingCollections.length) {
		if (options.mode === "single") {
			const { collection: combinedCollection, communityLinksRemoved } = createCombinedCollection(activeExistingCollections, options);

			if (!combinedCollection) {
				lastCombinedNuvioJson = null;
				lastCombinedNuvioStats = null;
				setJsonCombineExportDisabled(true);
				renderJsonCombineSummary(null);
				setJsonCombineStatus("No folders were found in those files.", "warning");
				return;
			}

			const stats = finalizeCombinedNuvioJson([combinedCollection], {
				defaultCollectionName: combinedCollection.title || "Combined Nuvio Collection",
				fileCount: lastJsonCombineFileCount,
				mode: "single",
			});
			const sortText = options.sortFolders ? ` Sorted by ${getSortModeLabel(options.sortMethod)}.` : "";

			setJsonCombineStatus(
				`Ready: ${lastJsonCombineFileCount} file${lastJsonCombineFileCount === 1 ? "" : "s"} combined into 1 collection with ${stats.folderCount} folder${stats.folderCount === 1 ? "" : "s"}.${duplicateFileText}${sortText}${getJsonCombineFixStatusText(stats)}${getJsonCombineWarningStatusText(stats)}${getJsonCombineCommunityStatusText(communityLinksRemoved)}`,
				"ready",
			);
			return;
		}

		const outputCollections = buildSeparateJsonCombineCollections();
		const stats = finalizeCombinedNuvioJson(outputCollections, {
			fileCount: lastJsonCombineFileCount,
			mode: "existing-only",
		});

		setJsonCombineStatus(
				`Ready: ${stats.collectionCount} existing collection${stats.collectionCount === 1 ? "" : "s"} kept ${options.mode === "separate" ? "separate" : "unchanged"}.${duplicateFileText}${getJsonCombineFixStatusText(stats)}${getJsonCombineWarningStatusText(stats)} Add more Nuvio JSON files if you want to merge folders into this JSON.`,
			"ready",
		);
		return;
	}

	if (hasExistingJson && existingMode === "append") {
		const outputCollections = activeExistingCollections;
		const targetCollection = getTargetExistingCollection(outputCollections);
		const folders = getCombinedFolders([targetCollection, ...batchCollections], options);
		const appendedCount = Math.max(folders.length - (targetCollection.folders?.length || 0), 0);

		targetCollection.folders = folders;
		const communityLinksRemoved = stripCommunityMetadata(targetCollection);

		if (options.collectionImageUrl) {
			targetCollection.backdropImageUrl = options.collectionImageUrl;
		}

		const stats = finalizeCombinedNuvioJson(outputCollections, {
			fileCount: lastJsonCombineFileCount,
			mode: "append",
		});

		const sortText = options.sortFolders ? ` Sorted by ${getSortModeLabel(options.sortMethod)}.` : "";

		setJsonCombineStatus(
			`Ready: ${appendedCount} folder${appendedCount === 1 ? "" : "s"} merged into ${targetCollection.title || "the selected collection"}.${duplicateFileText}${sortText}${getJsonCombineFixStatusText(stats)}${getJsonCombineWarningStatusText(stats)}${getJsonCombineCommunityStatusText(communityLinksRemoved)}`,
			"ready",
		);
		return;
	}

	if (options.mode === "separate") {
		const collections = buildSeparateJsonCombineCollections();
		const stats = finalizeCombinedNuvioJson(collections, {
			fileCount: lastJsonCombineFileCount,
			mode: "separate",
		});

		setJsonCombineStatus(
			`Ready: ${lastJsonCombineFileCount} file${lastJsonCombineFileCount === 1 ? "" : "s"} combined into one download, with ${stats.collectionCount} collection${stats.collectionCount === 1 ? "" : "s"} and ${stats.folderCount} folder${stats.folderCount === 1 ? "" : "s"} kept separate.${duplicateFileText}${getJsonCombineFixStatusText(stats)}${getJsonCombineWarningStatusText(stats)}`,
			"ready",
		);
		return;
	}

	const { collection: combinedCollection, communityLinksRemoved } = createCombinedCollection(batchCollections, options);

	if (!combinedCollection) {
		lastCombinedNuvioJson = null;
		lastCombinedNuvioStats = null;
		setJsonCombineExportDisabled(true);
		renderJsonCombineSummary(null);
		setJsonCombineStatus("No mergeable folders were found in those files.", "warning");
		return;
	}

	const outputCollections = [...activeExistingCollections, combinedCollection];
	const stats = finalizeCombinedNuvioJson(outputCollections, {
		defaultCollectionName: combinedCollection.title || "Combined Nuvio Collection",
		fileCount: lastJsonCombineFileCount,
		mode: "single",
	});

	const sortText = options.sortFolders ? ` Sorted by ${getSortModeLabel(options.sortMethod)}.` : "";
	const existingText =
		hasExistingJson && existingMode === "new"
			? ` Added as a new collection beside ${activeExistingCollections.length} existing collection${activeExistingCollections.length === 1 ? "" : "s"}.`
			: "";

	setJsonCombineStatus(
		`Ready: ${lastJsonCombineFileCount} file${lastJsonCombineFileCount === 1 ? "" : "s"} combined into 1 collection with ${stats.folderCount} folder${stats.folderCount === 1 ? "" : "s"}.${duplicateFileText}${sortText}${existingText}${getJsonCombineFixStatusText(stats)}${getJsonCombineWarningStatusText(stats)}${getJsonCombineCommunityStatusText(communityLinksRemoved)}`,
		"ready",
	);
}

function refreshJsonCombineOutput() {
	updateJsonCombineModeUi();
	buildCombinedNuvioJson();
}

async function addNuvioJsonFiles(files) {
	lastCombinedNuvioJson = null;
	lastCombinedNuvioStats = null;
	setJsonCombineExportDisabled(true);

	if (!files.length) {
		buildCombinedNuvioJson();
		return;
	}

	const existingTotalBytes = lastJsonCombineFiles.reduce((total, file) => total + (file.size || 0), 0);
	const incomingTotalBytes = files.reduce((total, file) => total + (file.size || 0), 0);

	const errors = [];
	const duplicateFiles = [];
	const acceptedFiles = [];

	if (existingTotalBytes + incomingTotalBytes > MAX_JSON_COMBINE_TOTAL_BYTES) {
		setJsonCombineStatus("Those files are too large together. Keep the total JSON upload size under 10 MB.", "warning");
		document.getElementById("json-combine-files").value = "";
		return;
	}

	for (const file of files) {
		const fileSignature = getFileSignature(file);

		if (
			lastJsonCombineFiles.some((selectedFile) => selectedFile.signature === fileSignature) ||
			acceptedFiles.some((selectedFile) => selectedFile.signature === fileSignature)
		) {
			duplicateFiles.push(file.name);
			continue;
		}

		if (file.size > MAX_JSON_COMBINE_FILE_BYTES) {
			errors.push(`${file.name} is too large. Keep each JSON file under 2 MB.`);
			continue;
		}

		try {
			const json = JSON.parse(await readTextFile(file));

			if (!Array.isArray(json)) {
				errors.push(`${file.name} is not a Nuvio collection array.`);
				continue;
			}

			const validCollections = json.filter(
				(collection) => collection && typeof collection === "object" && !Array.isArray(collection),
			);

			if (!validCollections.length) {
				errors.push(`${file.name} does not contain any usable Nuvio collections.`);
				continue;
			}

			const batchTypes = new Set(validCollections.map(getMergeableBatchType).filter(Boolean));
			const isExistingJson = validCollections.some((collection) => !isMergeableBatchCollection(collection));

			acceptedFiles.push({
				batchType: isExistingJson || batchTypes.size !== 1 ? "" : [...batchTypes][0],
				collections: validCollections,
				isExistingJson,
				name: file.name,
				signature: fileSignature,
				size: file.size || 0,
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

	const json = JSON.stringify(lastCombinedNuvioJson, null, 2);

	downloadTextFile("nuvio-combined-collections.json", `${json}\n`, "application/json");
}

function copyCombinedNuvioJson() {
	if (!lastCombinedNuvioJson?.length || !lastCombinedNuvioStats) {
		return;
	}

	buildCombinedNuvioJson(true);

	if (!lastCombinedNuvioJson?.length || !lastCombinedNuvioStats) {
		return;
	}

	copyText(`${JSON.stringify(lastCombinedNuvioJson, null, 2)}\n`);
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
	document.getElementById("json-combine-edit-collections").addEventListener("change", () => {
		renderJsonCombineCollectionEdits();
		buildCombinedNuvioJson(true);
	});
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
	document.getElementById("copy-combined-json").addEventListener("click", copyCombinedNuvioJson);
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
