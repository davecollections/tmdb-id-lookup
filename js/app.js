let currentTmdbQuery = "";
let currentTmdbPage = 1;
let currentTmdbTotalPages = 1;
let currentTmdbFilter = "all";
let lastBulkPeopleResults = [];
let currentGenreSearch = "";
let currentGenreFilter = "all";
let genreCounts = {};
function setTmdbFilter(filter) {
	currentTmdbFilter = filter;

	document.querySelectorAll(".lookup-filter-button").forEach((button) => {
		button.classList.toggle("active", button.dataset.tmdbFilter === currentTmdbFilter);
	});
}

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

async function tmdbJson(url) {
	const res = await fetch(url);

	if (!res.ok) {
		return null;
	}

	return res.json();
}
async function tmdbJsonWithStatus(url) {
	try {
		const res = await fetch(url);

		if (res.status === 429) {
			return {
				ok: false,
				rateLimited: true,
				status: 429,
				data: null,
			};
		}

		if (!res.ok) {
			return {
				ok: false,
				rateLimited: false,
				status: res.status,
				data: null,
			};
		}

		return {
			ok: true,
			rateLimited: false,
			status: res.status,
			data: await res.json(),
		};
	} catch {
		return {
			ok: false,
			rateLimited: false,
			status: 0,
			data: null,
		};
	}
}
async function getPersonKnownCredits(personId) {
	try {
		const credits = await tmdbJson(
			`https://api.themoviedb.org/3/person/${personId}/combined_credits?api_key=${TMDB_API_KEY}`,
		);

		if (!credits) {
			return "—";
		}

		const castCount = Array.isArray(credits.cast) ? credits.cast.length : 0;

		const crewCount = Array.isArray(credits.crew) ? credits.crew.length : 0;

		return (castCount + crewCount).toLocaleString();
	} catch {
		return "—";
	}
}

function createMetaRow(label, value) {
	const row = document.createElement("div");
	const labelElement = createElement("strong", { text: label + ":" });

	row.appendChild(labelElement);
	row.appendChild(document.createTextNode(" " + value));

	return row;
}

function createResultCard({ title, type, id, imageUrl, imageAlt, metaRows, tmdbUrl, imageClass = "" }) {
	const card = createElement("div", { className: "collection-card" });
	const imageClasses = ["collection-poster", imageClass].filter(Boolean).join(" ");

	if (imageUrl) {
		card.appendChild(
			createElement("img", {
				className: imageClasses,
				attrs: {
					src: imageUrl,
					alt: imageAlt,
					loading: "lazy",
					decoding: "async",
				},
			}),
		);
	} else {
		card.appendChild(createElement("div", { className: imageClasses }));
	}

	const info = createElement("div", { className: "collection-info" });

	info.appendChild(createElement("h3", { text: title }));

	const meta = createElement("div", { className: "collection-meta" });
	meta.appendChild(createMetaRow("Type", type));
	meta.appendChild(createMetaRow("TMDB ID", id));

	for (const row of metaRows) {
		meta.appendChild(row);
	}

	info.appendChild(meta);

	const actions = createElement("div", { className: "collection-actions" });
	const copyButton = createElement("button", {
		text: "Copy ID",
		attrs: {
			type: "button",
		},
	});

	copyButton.addEventListener("click", () => copyId(id));
	actions.appendChild(copyButton);
	actions.appendChild(
		createElement("a", {
			text: "Open on TMDB",
			attrs: {
				href: tmdbUrl,
				target: "_blank",
				rel: "noopener",
			},
		}),
	);

	info.appendChild(actions);
	card.appendChild(info);

	return card;
}

function collectionCard(collection, movieCount = "\u2014") {
	const poster = collection.poster_path ? `https://image.tmdb.org/t/p/w185${collection.poster_path}` : "";
	const metaRows = [createMetaRow("Movies", movieCount)];

	return createResultCard({
		title: collection.name || "Untitled Collection",
		type: "Movie Collection",
		id: collection.id,
		imageUrl: poster,
		imageAlt: collection.name || "Collection poster",
		metaRows,
		tmdbUrl: `https://www.themoviedb.org/collection/${collection.id}`,
	});
}

function personCard(person, knownCredits = "\u2014") {
	const profile = person.profile_path ? `https://image.tmdb.org/t/p/w185${person.profile_path}` : "";

	const knownFor = person.known_for_department || "\u2014";

	const metaRows = [createMetaRow("Known for", knownFor), createMetaRow("Known credits", knownCredits)];

	if (person.birthday) {
		metaRows.push(createMetaRow("Born", person.birthday));
	}

	return createResultCard({
		title: person.name || "Untitled Person",
		type: "Person",
		id: person.id,
		imageUrl: profile,
		imageAlt: person.name || "Person profile",
		metaRows,
		tmdbUrl: `https://www.themoviedb.org/person/${person.id}`,
	});
}

async function getCollectionMovieCount(collectionId) {
	const detailData = await tmdbJson(`https://api.themoviedb.org/3/collection/${collectionId}?api_key=${TMDB_API_KEY}`);

	if (!detailData || detailData.success === false) {
		return null;
	}

	return {
		collection: detailData,
		movieCount: detailData.parts ? detailData.parts.length.toLocaleString() : "—",
	};
}
function getLookupResultLimit() {
	return window.matchMedia("(max-width: 720px)").matches ? 5 : 10;
}

function setLookupMessage(container, message) {
	container.replaceChildren(createElement("p", { className: "meta", text: message }));
}

function createLookupPagination() {
	const pagination = createElement("div", { className: "lookup-pagination" });
	const previousButton = createElement("button", {
		text: "Previous",
		attrs: {
			type: "button",
		},
	});
	const nextButton = createElement("button", {
		text: "Next",
		attrs: {
			type: "button",
		},
	});

	previousButton.disabled = currentTmdbPage <= 1;
	previousButton.addEventListener("click", () => searchTmdbIds(currentTmdbPage - 1));
	nextButton.disabled = currentTmdbPage >= currentTmdbTotalPages;
	nextButton.addEventListener("click", () => searchTmdbIds(currentTmdbPage + 1));

	pagination.appendChild(previousButton);
	pagination.appendChild(
		createElement("span", {
			className: "lookup-pagination-status",
			text: `${currentTmdbPage} of ${currentTmdbTotalPages}`,
		}),
	);
	pagination.appendChild(nextButton);

	return pagination;
}

function renderLookupResults(container, cards, isNumeric) {
	container.replaceChildren();

	if (!isNumeric && currentTmdbTotalPages > 1) {
		container.appendChild(createLookupPagination());
	}

	if (!isNumeric && currentTmdbTotalPages > 3) {
		container.appendChild(
			createElement("div", {
				className: "lookup-pagination-help",
				text: "Lots of results? Try a more specific search for better matches.",
			}),
		);
	}

	for (const card of cards) {
		container.appendChild(card);
	}
}

async function searchTmdbIds(page = 1) {
	let query = document.getElementById("collection-search").value.trim();

	const resultsContainer = document.getElementById("collection-results");

	if (!query) {
		resultsContainer.replaceChildren();
		return;
	}

	currentTmdbQuery = query;
	currentTmdbPage = page;

	const normalizedQuery = query.toLowerCase();

	if (collectionAliases[normalizedQuery]) {
		query = collectionAliases[normalizedQuery];
	}

	const isNumeric = /^\d+$/.test(query);

	setLookupMessage(resultsContainer, "Searching TMDB...");

	try {
		const cards = [];

		if (isNumeric) {
			currentTmdbTotalPages = 1;

			if (currentTmdbFilter === "all" || currentTmdbFilter === "collections") {
				const collectionResult = await getCollectionMovieCount(query);

				if (collectionResult) {
					cards.push(collectionCard(collectionResult.collection, collectionResult.movieCount));
				}
			}

			if (currentTmdbFilter === "all" || currentTmdbFilter === "actors" || currentTmdbFilter === "directors") {
				const person = await tmdbJson(`https://api.themoviedb.org/3/person/${query}?api_key=${TMDB_API_KEY}`);

				if (person && person.success !== false) {
					const isActor = person.known_for_department === "Acting";
					const isDirector = person.known_for_department === "Directing";

					const shouldShowPerson =
						currentTmdbFilter === "all" ||
						(currentTmdbFilter === "actors" && isActor) ||
						(currentTmdbFilter === "directors" && isDirector);

					if (shouldShowPerson) {
						const knownCredits = await getPersonKnownCredits(person.id);

						cards.push(personCard(person, knownCredits));
					}
				}
			}
		} else {
			const collectionSearch = await tmdbJson(
				`https://api.themoviedb.org/3/search/collection?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&page=${page}`,
			);

			const personSearch = await tmdbJson(
				`https://api.themoviedb.org/3/search/person?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&page=${page}`,
			);

			const lookupResultLimit = getLookupResultLimit();

			const collectionLimit = currentTmdbFilter === "all" ? Math.ceil(lookupResultLimit / 2) : lookupResultLimit;

			const peopleLimit = currentTmdbFilter === "all" ? Math.floor(lookupResultLimit / 2) : lookupResultLimit;

			const collections =
				currentTmdbFilter === "all" || currentTmdbFilter === "collections"
					? (collectionSearch?.results || []).slice(0, collectionLimit)
					: [];

			let people = personSearch?.results || [];

			if (currentTmdbFilter === "actors") {
				people = people.filter((person) => person.known_for_department === "Acting");
			}

			if (currentTmdbFilter === "directors") {
				people = people.filter((person) => person.known_for_department === "Directing");
			}

			if (currentTmdbFilter === "collections") {
				people = [];
			}

			people = people.slice(0, peopleLimit);

			if (currentTmdbFilter === "collections") {
				currentTmdbTotalPages = collectionSearch?.total_pages || 1;
			} else if (currentTmdbFilter === "actors" || currentTmdbFilter === "directors") {
				currentTmdbTotalPages = personSearch?.total_pages || 1;
			} else {
				currentTmdbTotalPages = Math.max(collectionSearch?.total_pages || 1, personSearch?.total_pages || 1);
			}

			const collectionCards = await Promise.all(
				collections.map(async (collection) => {
					const detail = await getCollectionMovieCount(collection.id);
					const hydratedCollection = detail?.collection || collection;
					return collectionCard(hydratedCollection, detail?.movieCount || "—");
				}),
			);

			const personCards = await Promise.all(
				people.map(async (person) => {
					const knownCredits = await getPersonKnownCredits(person.id);

					return personCard(person, knownCredits);
				}),
			);

			cards.push(...collectionCards);
			cards.push(...personCards);
		}

		if (!cards.length) {
			setLookupMessage(resultsContainer, "No matching movie collections or people found.");
			return;
		}

		renderLookupResults(resultsContainer, cards, isNumeric);
	} catch (error) {
		setLookupMessage(resultsContainer, "TMDB lookup failed.");
		console.error(error);
	}
}

function getGenreReferenceItems() {
	return Array.isArray(window.tmdbGenreReference) ? window.tmdbGenreReference : [];
}

function getGenreSearchText(genre) {
	const count = genreCounts[getGenreCountKey(genre)] ?? genre.titleCount ?? "";

	return [genre.name, genre.type, genre.media, genre.id, count, ...(genre.searchTerms || [])].join(" ").toLowerCase();
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
		applyGenreFilters();
	} catch (error) {
		console.warn("genre-counts.json not available yet");
	}
}
function applyGenreFilters() {
	const query = currentGenreSearch.toLowerCase().trim();

	const filteredGenres = getGenreReferenceItems().filter((genre) => {
		const matchesSearch = !query || getGenreSearchText(genre).includes(query);

		return matchesSearch && genreMatchesFilter(genre);
	});

	renderGenres(filteredGenres);
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
						colspan: "6",
					},
				}),
			]),
		);
		return;
	}

	resultCount.innerText = `Showing ${items.length.toLocaleString()} genre reference${items.length === 1 ? "" : "s"}`;

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

		tr.appendChild(createElement("td", { text: genre.name || "" }));
		tr.appendChild(idCell);
		tr.appendChild(createElement("td", { text: genre.type || "" }));
		tr.appendChild(createElement("td", { text: genre.media || "" }));
		tr.appendChild(createElement("td", { text: displayCount }));
		tr.appendChild(createOpenLinkCell(genre.url));
		tbody.appendChild(tr);
	}
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

document.getElementById("collection-search-btn").addEventListener("click", () => {
	setTmdbFilter("all");
	searchTmdbIds(1);
});

document.getElementById("collection-search").addEventListener("keydown", (event) => {
	if (event.key === "Enter") {
		setTmdbFilter("all");
		searchTmdbIds(1);
	}
});

document.getElementById("clear-collection-search").addEventListener("click", () => {
	document.getElementById("collection-search").value = "";
	document.getElementById("collection-results").replaceChildren();

	setTmdbFilter("all");

	document.getElementById("collection-search").focus();
});

document.getElementById("back-to-top").addEventListener("click", () => {
	window.scrollTo({
		top: 0,
		behavior: "smooth",
	});
});
document.querySelectorAll(".lookup-filter-button").forEach((button) => {
	button.addEventListener("click", () => {
		setTmdbFilter(button.dataset.tmdbFilter || "all");

		if (document.getElementById("collection-search").value.trim()) {
			searchTmdbIds(1);
		}
	});
});
document.getElementById("genre-search")?.addEventListener("input", (event) => {
	currentGenreSearch = event.target.value;
	applyGenreFilters();
});

document.getElementById("clear-genre-search")?.addEventListener("click", () => {
	currentGenreSearch = "";
	document.getElementById("genre-search").value = "";
	setGenreFilter("all");
	applyGenreFilters();
});

document.querySelectorAll(".genre-filter-button").forEach((button) => {
	button.addEventListener("click", () => {
		setGenreFilter(button.dataset.genreFilter || "all");
		applyGenreFilters();
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
applyGenreFilters();
loadGenreCounts();
