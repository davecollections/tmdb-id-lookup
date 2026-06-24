let currentTmdbQuery = "";
let currentTmdbPage = 1;
let currentTmdbTotalPages = 1;
let currentTmdbFilter = "all";
let currentTmdbRequestId = 0;

function setTmdbFilter(filter) {
	currentTmdbFilter = filter;

	document.querySelectorAll(".lookup-filter-button").forEach((button) => {
		button.classList.toggle("active", button.dataset.tmdbFilter === currentTmdbFilter);
	});
}

function createMetaRow(label, value) {
	const row = document.createElement("div");
	const labelElement = createElement("strong", { text: label + ":" });

	row.appendChild(labelElement);
	row.appendChild(document.createTextNode(" "));

	if (value instanceof Node) {
		row.appendChild(value);
	} else {
		row.appendChild(document.createTextNode(value));
	}

	return row;
}

function getPrimaryTvNetwork(series) {
	return Array.isArray(series.networks) && series.networks.length ? series.networks[0] : null;
}

function getTvNetworkLogoUrl(network, size = "w92") {
	return network?.logo_path ? `https://image.tmdb.org/t/p/${size}${network.logo_path}` : "";
}

function copyNetworkId(network) {
	if (network?.id) {
		copyId(network.id);
	}
}

function createTvNetworkDisplay(network) {
	if (!network) {
		return createElement("span", { text: "\u2014" });
	}

	const container = createElement("span", { className: "tv-network-display" });
	const logoUrl = getTvNetworkLogoUrl(network);
	const networkName = network.name || "TV network";

	if (logoUrl) {
		const logoButton = createElement(
			"button",
			{
				className: "tv-network-logo-box",
				attrs: {
					type: "button",
					title: `Copy ${networkName} network ID`,
					"aria-label": `Copy ${networkName} network ID`,
				},
			},
			[
				createElement("img", {
					className: "tv-network-logo",
					attrs: {
						src: logoUrl,
						alt: `${networkName} logo`,
						loading: "lazy",
						decoding: "async",
					},
				}),
			],
		);

		logoButton.addEventListener("click", () => copyNetworkId(network));
		container.appendChild(logoButton);
	} else {
		const textButton = createElement("button", {
			className: "tv-network-text-button",
			text: networkName,
			attrs: {
				type: "button",
				title: `Copy ${networkName} network ID`,
				"aria-label": `Copy ${networkName} network ID`,
			},
		});

		textButton.addEventListener("click", () => copyNetworkId(network));
		container.appendChild(textButton);
	}

	return container;
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
				rel: "noopener noreferrer",
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

function movieCard(movie) {
	const poster = movie.poster_path ? `https://image.tmdb.org/t/p/w185${movie.poster_path}` : "";
	const language = movie.original_language ? movie.original_language.toUpperCase() : "";
	const directorMeta = getMovieDirectorMeta(movie);
	const metaRows = [];

	if (directorMeta) {
		metaRows.push(createMetaRow(directorMeta.label, directorMeta.text));
	}

	metaRows.push(createMetaRow("Release date", movie.release_date || "\u2014"));

	if (Number.isFinite(movie.runtime) && movie.runtime > 0) {
		metaRows.push(createMetaRow("Runtime", `${movie.runtime} min`));
	}

	if (language) {
		metaRows.push(createMetaRow("Language", language));
	}

	return createResultCard({
		title: movie.title || movie.original_title || "Untitled Movie",
		type: "Movie",
		id: movie.id,
		imageUrl: poster,
		imageAlt: movie.title || movie.original_title || "Movie poster",
		metaRows,
		tmdbUrl: `https://www.themoviedb.org/movie/${movie.id}`,
	});
}

function getMovieDirectors(movie) {
	const crew = movie?.credits?.crew;

	if (!Array.isArray(crew)) {
		return [];
	}

	return crew.filter((member) => member.job === "Director" && member.name).map((member) => member.name);
}

function getMovieDirectorMeta(movie) {
	const directors = [...new Set(getMovieDirectors(movie))];

	if (!directors.length) {
		return null;
	}

	const shownDirectors = directors.slice(0, 2).join(", ");
	const remainingCount = directors.length - 2;

	return {
		label: directors.length > 1 ? "Directors" : "Director",
		text: remainingCount > 0 ? `${shownDirectors} +${remainingCount} more` : shownDirectors,
	};
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

function formatLookupCount(value) {
	const numericValue = Number(value);

	return Number.isFinite(numericValue) ? numericValue.toLocaleString() : "";
}

function getTvSeriesTypeLabel(series) {
	return series.type === "Miniseries" ? "Miniseries" : "TV Series";
}

function getTvSeriesScaleRow(series) {
	const seasonCount = formatLookupCount(series.number_of_seasons);
	const episodeCount = formatLookupCount(series.number_of_episodes);
	const isMiniseries = series.type === "Miniseries";

	if (isMiniseries && series.number_of_seasons <= 1 && episodeCount) {
		return createMetaRow("Episodes", episodeCount);
	}

	if (seasonCount) {
		return createMetaRow("Seasons", seasonCount);
	}

	return null;
}

function tvSeriesCard(series) {
	const poster = series.poster_path ? `https://image.tmdb.org/t/p/w185${series.poster_path}` : "";
	const country = Array.isArray(series.origin_country) ? series.origin_country.join(", ") : "";
	const language = series.original_language ? series.original_language.toUpperCase() : "";
	const metaRows = [createMetaRow("First aired", series.first_air_date || "\u2014")];
	const scaleRow = getTvSeriesScaleRow(series);
	const network = getPrimaryTvNetwork(series);

	if (scaleRow) {
		metaRows.push(scaleRow);
	}

	if (country) {
		metaRows.push(createMetaRow("Country", country));
	}

	if (language) {
		metaRows.push(createMetaRow("Language", language));
	}

	if (network) {
		metaRows.push(createMetaRow("Network", createTvNetworkDisplay(network)));
	}

	return createResultCard({
		title: series.name || series.original_name || "Untitled TV Series",
		type: getTvSeriesTypeLabel(series),
		id: series.id,
		imageUrl: poster,
		imageAlt: series.name || series.original_name || "TV series poster",
		metaRows,
		tmdbUrl: `https://www.themoviedb.org/tv/${series.id}`,
	});
}

async function getCollectionMovieCount(collectionId) {
	const detailData = await tmdbJson(tmdbApiUrl(`/3/collection/${collectionId}`));

	if (!detailData || detailData.success === false) {
		return null;
	}

	return {
		collection: detailData,
		movieCount: detailData.parts ? detailData.parts.length.toLocaleString() : "\u2014",
	};
}

async function getTvSeriesDetails(seriesId) {
	const detailData = await tmdbJson(tmdbApiUrl(`/3/tv/${seriesId}`));

	if (!detailData || detailData.success === false) {
		return null;
	}

	return detailData;
}

async function getMovieDetails(movieId) {
	const detailData = await tmdbJson(tmdbApiUrl(`/3/movie/${movieId}`, { append_to_response: "credits" }));

	if (!detailData || detailData.success === false) {
		return null;
	}

	return detailData;
}

async function hydrateTvSeriesResults(seriesList) {
	return Promise.all(
		seriesList.map(async (series) => {
			const detail = await getTvSeriesDetails(series.id);

			return detail || series;
		}),
	);
}

async function hydrateMovieResults(movieList) {
	return Promise.all(
		movieList.map(async (movie) => {
			const detail = await getMovieDetails(movie.id);

			return detail || movie;
		}),
	);
}

function getLookupResultLimit() {
	return window.matchMedia("(max-width: 720px)").matches ? 5 : 10;
}

function getAllLookupLimits(lookupResultLimit) {
	if (lookupResultLimit <= 5) {
		return {
			collections: 1,
			tvSeries: 1,
			movies: 2,
			people: 1,
		};
	}

	return {
		collections: 2,
		tvSeries: 2,
		movies: 3,
		people: Math.max(lookupResultLimit - 7, 0),
	};
}

function fillLookupSlots(groups, initialLimits, totalLimit) {
	const resultOrder = ["collections", "tvSeries", "movies", "people"];
	const selected = {
		collections: [],
		tvSeries: [],
		movies: [],
		people: [],
	};
	let remaining = totalLimit;

	for (const groupName of resultOrder) {
		const count = Math.min(initialLimits[groupName] || 0, groups[groupName].length, remaining);
		selected[groupName] = groups[groupName].slice(0, count);
		remaining -= count;
	}

	if (remaining <= 0) {
		return selected;
	}

	for (const groupName of resultOrder) {
		const alreadySelected = selected[groupName].length;
		const extraResults = groups[groupName].slice(alreadySelected, alreadySelected + remaining);

		selected[groupName].push(...extraResults);
		remaining -= extraResults.length;

		if (remaining <= 0) {
			break;
		}
	}

	return selected;
}

function setLookupMessage(container, message) {
	container.replaceChildren(createElement("p", { className: "meta", text: message }));
}

function cancelPendingTmdbLookup() {
	currentTmdbRequestId += 1;
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
	const requestId = currentTmdbRequestId + 1;

	currentTmdbRequestId = requestId;

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

			if (currentTmdbFilter === "all" || currentTmdbFilter === "tv") {
				const series = await getTvSeriesDetails(query);

				if (series) {
					cards.push(tvSeriesCard(series));
				}
			}

			if (currentTmdbFilter === "all" || currentTmdbFilter === "movies") {
				const movie = await getMovieDetails(query);

				if (movie) {
					cards.push(movieCard(movie));
				}
			}

			if (currentTmdbFilter === "all" || currentTmdbFilter === "actors" || currentTmdbFilter === "directors") {
				const person = await tmdbJson(tmdbApiUrl(`/3/person/${query}`));

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
			const shouldSearchCollections = currentTmdbFilter === "all" || currentTmdbFilter === "collections";
			const shouldSearchMovies = currentTmdbFilter === "all" || currentTmdbFilter === "movies";
			const shouldSearchPeople =
				currentTmdbFilter === "all" || currentTmdbFilter === "actors" || currentTmdbFilter === "directors";
			const shouldSearchTv = currentTmdbFilter === "all" || currentTmdbFilter === "tv";

			const [collectionSearch, movieSearch, personSearch, tvSearch] = await Promise.all([
				shouldSearchCollections ? tmdbJson(tmdbApiUrl("/3/search/collection", { query, page })) : null,
				shouldSearchMovies ? tmdbJson(tmdbApiUrl("/3/search/movie", { query, page })) : null,
				shouldSearchPeople ? tmdbJson(tmdbApiUrl("/3/search/person", { query, page })) : null,
				shouldSearchTv ? tmdbJson(tmdbApiUrl("/3/search/tv", { query, page })) : null,
			]);

			const lookupResultLimit = getLookupResultLimit();

			let collections = collectionSearch?.results || [];

			let people = personSearch?.results || [];

			let movies = movieSearch?.results || [];

			let tvSeries = tvSearch?.results || [];

			if (currentTmdbFilter === "actors") {
				people = people.filter((person) => person.known_for_department === "Acting");
			}

			if (currentTmdbFilter === "directors") {
				people = people.filter((person) => person.known_for_department === "Directing");
			}

			if (currentTmdbFilter === "collections") {
				people = [];
			}

			if (currentTmdbFilter === "all") {
				const selectedResults = fillLookupSlots(
					{
						collections,
						tvSeries,
						movies,
						people,
					},
					getAllLookupLimits(lookupResultLimit),
					lookupResultLimit,
				);

				collections = selectedResults.collections;
				tvSeries = selectedResults.tvSeries;
				movies = selectedResults.movies;
				people = selectedResults.people;
			} else {
				collections = currentTmdbFilter === "collections" ? collections.slice(0, lookupResultLimit) : [];
				movies = currentTmdbFilter === "movies" ? movies.slice(0, lookupResultLimit) : [];
				tvSeries = currentTmdbFilter === "tv" ? tvSeries.slice(0, lookupResultLimit) : [];
				people =
					currentTmdbFilter === "actors" || currentTmdbFilter === "directors"
						? people.slice(0, lookupResultLimit)
						: [];
			}

			if (currentTmdbFilter === "collections") {
				currentTmdbTotalPages = collectionSearch?.total_pages || 1;
			} else if (currentTmdbFilter === "movies") {
				currentTmdbTotalPages = movieSearch?.total_pages || 1;
			} else if (currentTmdbFilter === "tv") {
				currentTmdbTotalPages = tvSearch?.total_pages || 1;
			} else if (currentTmdbFilter === "actors" || currentTmdbFilter === "directors") {
				currentTmdbTotalPages = personSearch?.total_pages || 1;
			} else {
				currentTmdbTotalPages = Math.max(
					collectionSearch?.total_pages || 1,
					movieSearch?.total_pages || 1,
					personSearch?.total_pages || 1,
					tvSearch?.total_pages || 1,
				);
			}

			const collectionCards = await Promise.all(
				collections.map(async (collection) => {
					const detail = await getCollectionMovieCount(collection.id);
					const hydratedCollection = detail?.collection || collection;
					return collectionCard(hydratedCollection, detail?.movieCount || "\u2014");
				}),
			);

			const personCards = await Promise.all(
				people.map(async (person) => {
					const knownCredits = await getPersonKnownCredits(person.id);

					return personCard(person, knownCredits);
				}),
			);

			const hydratedTvSeries = await hydrateTvSeriesResults(tvSeries);
			const tvSeriesCards = hydratedTvSeries.map((series) => tvSeriesCard(series));

			const hydratedMovies = await hydrateMovieResults(movies);
			const movieCards = hydratedMovies.map((movie) => movieCard(movie));

			cards.push(...collectionCards);
			cards.push(...tvSeriesCards);
			cards.push(...movieCards);
			cards.push(...personCards);
		}

		if (requestId !== currentTmdbRequestId) {
			return;
		}

		if (!cards.length) {
			setLookupMessage(resultsContainer, "No matching movies, movie collections, people, or TV series found.");
			return;
		}

		renderLookupResults(resultsContainer, cards, isNumeric);
	} catch (error) {
		if (requestId !== currentTmdbRequestId) {
			return;
		}

		setLookupMessage(resultsContainer, "TMDB lookup failed.");
		console.error(error);
	}
}

function initTmdbLookup() {
	document.getElementById("collection-search-btn").addEventListener("click", () => {
		searchTmdbIds(1);
	});

	document.getElementById("collection-search").addEventListener("keydown", (event) => {
		if (event.key === "Enter") {
			searchTmdbIds(1);
		}
	});

	document.getElementById("clear-collection-search").addEventListener("click", () => {
		cancelPendingTmdbLookup();

		document.getElementById("collection-search").value = "";
		document.getElementById("collection-results").replaceChildren();

		setTmdbFilter("all");

		document.getElementById("collection-search").focus();
	});

	document.querySelectorAll(".lookup-filter-button").forEach((button) => {
		button.addEventListener("click", () => {
			setTmdbFilter(button.dataset.tmdbFilter || "all");

			if (document.getElementById("collection-search").value.trim()) {
				searchTmdbIds(1);
			}
		});
	});
}
