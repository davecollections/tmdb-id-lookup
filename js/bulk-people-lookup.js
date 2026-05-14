let lastBulkPeopleResults = [];

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
	const modal = document.getElementById("nuvio-export-modal");
	const defaultCollectionName = document.getElementById("nuvio-collection-name");

	if (!defaultCollectionName.value.trim()) {
		defaultCollectionName.value = "TMDB People Collection";
	}

	updateNuvioImagePreviews();
	modal.hidden = false;
	document.getElementById("nuvio-collection-name").focus();
}

function closeNuvioExportModal() {
	document.getElementById("nuvio-export-modal").hidden = true;
	closeNuvioImportHelpModal();
}

function openNuvioImportHelpModal() {
	document.getElementById("nuvio-import-help-modal").hidden = false;
	document.getElementById("close-nuvio-import-help").focus();
}

function closeNuvioImportHelpModal() {
	document.getElementById("nuvio-import-help-modal").hidden = true;
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

function getBulkPeopleNames() {
	return document
		.getElementById("bulk-people-input")
		.value.split("\n")
		.map((name) => name.trim())
		.filter(Boolean);
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

		tr.appendChild(createElement("td", { text: result.input }));
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
			const response = await tmdbJsonWithStatus(tmdbApiUrl("/3/search/person", { query: input, page: 1 }));

			if (response.rateLimited) {
				lastBulkPeopleResults.push({
					input,
					name: "",
					id: "",
					knownFor: "",
					creditCount: "",
					profilePath: "",
					profileImageUrl: "",
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
					profilePath: "",
					profileImageUrl: "",
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
					knownFor: match.person.known_for_department || "\u2014",
					creditCount: knownCredits,
					profilePath: match.person.profile_path || "",
					profileImageUrl: getTmdbProfileImageUrl(match.person.profile_path),
					status: match.matchType,
				});
			} else {
				lastBulkPeopleResults.push({
					input,
					name: "",
					id: "",
					knownFor: "",
					creditCount: "",
					profilePath: "",
					profileImageUrl: "",
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
				profilePath: "",
				profileImageUrl: "",
				status: "Lookup failed",
			});
		}
	}

	renderBulkPeopleResults(lastBulkPeopleResults);

	const matchedCount = lastBulkPeopleResults.filter((result) => result.id).length;

	status.replaceChildren(document.createTextNode(`Resolved people IDs: matched ${matchedCount} of ${names.length}.`));

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
	document.getElementById("bulk-people-btn").addEventListener("click", () => {
		resolveBulkPeople();
	});

	document.getElementById("clear-bulk-people").addEventListener("click", () => {
		document.getElementById("bulk-people-input").value = "";
		document.getElementById("bulk-people-status").innerText = "";
		document.getElementById("bulk-people-results").replaceChildren();
		closeNuvioExportModal();
		lastBulkPeopleResults = [];
	});

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
