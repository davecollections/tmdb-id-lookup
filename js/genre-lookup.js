let currentGenreSearch = "";
let currentGenreFilter = "all";
let genreCounts = {};

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

function initGenreLookup() {
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

	applyGenreFilters();
	loadGenreCounts();
}
