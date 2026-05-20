let lastBulkPeopleResults = [];
const BULK_PEOPLE_LIMIT = 50;
let lastBulkPeopleBatchMessage = "";
let lastBulkPeopleIncompleteInputs = new Set();
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

function createNuvioId(prefix) {
	if (window.crypto?.randomUUID) {
		return window.crypto.randomUUID();
	}

	return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
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

	initBulkPeopleNuvioExport();
	initJsonCombiner();
}
