let lastBulkPeopleResults = [];
const BULK_PEOPLE_LIMIT = 50;
let lastBulkPeopleBatchMessage = "";
let lastBulkPeopleIncompleteInputs = new Set();
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

function looksLikePersonNameListItem(value) {
	const name = String(value || "").trim();

	if (name.length < 2 || name.length > 80) {
		return false;
	}

	if (/https?:\/\/|www\.|@|[<>={}[\]\\|;]/i.test(name)) {
		return false;
	}

	if (/\b(function|const|let|class|import|export|return|doctype|html|body|script|style)\b/i.test(name)) {
		return false;
	}

	if (!/\p{L}/u.test(name)) {
		return false;
	}

	if (!/^[\p{L}\p{M}0-9 .,'’`-]+$/u.test(name)) {
		return false;
	}

	return name.split(/\s+/).filter(Boolean).length <= 6;
}

function looksLikePersonNameList(names) {
	const sample = names.slice(0, BULK_PEOPLE_LIMIT);

	if (!sample.length) {
		return false;
	}

	const likelyCount = sample.filter(looksLikePersonNameListItem).length;
	const requiredCount = sample.length < 5 ? sample.length : Math.ceil(sample.length * 0.65);

	return likelyCount >= requiredCount;
}

function looksLikeMarkupOrCodeFileText(text) {
	const trimmedText = String(text || "").trim();
	const lowerStart = trimmedText.slice(0, 4000).toLowerCase();

	if (!trimmedText) {
		return false;
	}

	if (
		lowerStart.startsWith("<!doctype") ||
		lowerStart.startsWith("<html") ||
		lowerStart.startsWith("<?xml") ||
		lowerStart.includes("<head") ||
		lowerStart.includes("<body") ||
		lowerStart.includes("<script") ||
		lowerStart.includes("<style")
	) {
		return true;
	}

	const htmlTagMatches = lowerStart.match(/<\/?[a-z][^>]{0,120}>/g) || [];

	return htmlTagMatches.length >= 3;
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

		if (looksLikeMarkupOrCodeFileText(fileText)) {
			rejectBulkPeopleFile("That file looks like HTML or code. Choose a CSV or TXT file containing person names.");
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

		if (!looksLikePersonNameList(csvResult.names)) {
			rejectBulkPeopleFile(
				"That file does not look like a person-name list. Use one name per line, a name/person column, or first and last name columns.",
			);
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

	initJsonCombiner();

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
