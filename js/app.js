let lastBulkPeopleResults = [];
function setActiveCachedTab(tabName) {
	document.querySelectorAll(".cached-tab-button").forEach((button) => {
		const isActive = button.dataset.cachedTab === tabName;

		button.classList.toggle("active", isActive);
		button.setAttribute("aria-selected", String(isActive));
	});

	document.querySelectorAll(".cached-tab-panel").forEach((panel) => {
		panel.classList.toggle("active", panel.dataset.cachedPanel === tabName);
	});
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

	const headers = ["input", "matched_name", "tmdb_person_id", "known_for", "credit_count", "match_type"];

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
			const response = await tmdbJsonWithStatus(
				`https://api.themoviedb.org/3/search/person?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(input)}&page=1`,
			);

			if (response.rateLimited) {
				lastBulkPeopleResults.push({
					input,
					name: "",
					id: "",
					knownFor: "",
					creditCount: "",
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
					knownFor: match.person.known_for_department || "—",
					creditCount: knownCredits,
					status: match.matchType,
				});
			} else {
				lastBulkPeopleResults.push({
					input,
					name: "",
					id: "",
					knownFor: "",
					creditCount: "",
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
	}
}

document.querySelectorAll(".cached-tab-button").forEach((button) => {
	button.addEventListener("click", () => {
		setActiveCachedTab(button.dataset.cachedTab || "companies");
	});
});

document.getElementById("back-to-top").addEventListener("click", () => {
	window.scrollTo({
		top: 0,
		behavior: "smooth",
	});
});
document.getElementById("bulk-people-btn").addEventListener("click", () => {
	resolveBulkPeople();
});

document.getElementById("clear-bulk-people").addEventListener("click", () => {
	document.getElementById("bulk-people-input").value = "";
	document.getElementById("bulk-people-status").innerText = "";
	document.getElementById("bulk-people-results").replaceChildren();
	lastBulkPeopleResults = [];
});
setActiveCachedTab("companies");
initCachedLookups();
initTmdbLookup();
initGenreLookup();
