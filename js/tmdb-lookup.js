let currentTmdbQuery = "";
let currentTmdbPage = 1;
let currentTmdbTotalPages = 1;
let currentTmdbFilter = "all";

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
	const detailData = await tmdbJson(tmdbApiUrl(`/3/collection/${collectionId}`));

	if (!detailData || detailData.success === false) {
		return null;
	}

	return {
		collection: detailData,
		movieCount: detailData.parts ? detailData.parts.length.toLocaleString() : "\u2014",
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
			const collectionSearch = await tmdbJson(tmdbApiUrl("/3/search/collection", { query, page }));

			const personSearch = await tmdbJson(tmdbApiUrl("/3/search/person", { query, page }));

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
					return collectionCard(hydratedCollection, detail?.movieCount || "\u2014");
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

function initTmdbLookup() {
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

	document.querySelectorAll(".lookup-filter-button").forEach((button) => {
		button.addEventListener("click", () => {
			setTmdbFilter(button.dataset.tmdbFilter || "all");

			if (document.getElementById("collection-search").value.trim()) {
				searchTmdbIds(1);
			}
		});
	});
}
