let lastBulkCollectionResults = [];
let lastBulkTvResults = [];
let bulkCollectionNuvioExportCache = null;

const BULK_MEDIA_LIMIT = 50;
const MAX_BULK_MEDIA_FILE_BYTES = 1024 * 1024;
const BULK_MOVIE_COLLECTION_HERO_URL =
	"https://github.com/davecollections/nuvio-assets/blob/main/assets/backdrops/generic%20movie%20hero/generic_move_collection_hero.jpg?raw=true";

const bulkMediaConfigs = {
	collections: {
		buttonId: "bulk-collections-btn",
		clearButtonId: "clear-bulk-collections",
		downloadName: "collections",
		emptyMessage: "Paste one movie collection name or ID per line first.",
		fileInputId: "bulk-collections-file",
		fileLabelId: "bulk-collections-file-name",
		inputId: "bulk-collections-input",
		itemLabel: "movie collections",
		preferredHeaders: ["name", "title", "collection", "collections", "moviecollection", "moviecollections"],
		resultsId: "bulk-collections-results",
		statusId: "bulk-collections-status",
	},
	tv: {
		buttonId: "bulk-tv-btn",
		clearButtonId: "clear-bulk-tv",
		downloadName: "tv-series",
		emptyMessage: "Paste one TV series name or ID per line first.",
		fileInputId: "bulk-tv-file",
		fileLabelId: "bulk-tv-file-name",
		inputId: "bulk-tv-input",
		itemLabel: "TV series",
		preferredHeaders: ["name", "title", "series", "show", "tv", "tvseries", "television"],
		resultsId: "bulk-tv-results",
		statusId: "bulk-tv-status",
	},
};

function getBulkMediaResults(type) {
	return type === "tv" ? lastBulkTvResults : lastBulkCollectionResults;
}

function setBulkMediaResults(type, results) {
	if (type === "tv") {
		lastBulkTvResults = results;
		return;
	}

	lastBulkCollectionResults = results;
}

function normalizeBulkMediaName(value) {
	return String(value || "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

function getBulkCsvColumnIndex(headerRow, preferredHeaders) {
	return headerRow.findIndex((header) =>
		preferredHeaders.includes(
			String(header || "")
				.trim()
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, ""),
		),
	);
}

function getBulkItemsFromCsvText(csvText, preferredHeaders) {
	const rows = parseCsvRows(csvText);

	if (!rows.length) {
		return [];
	}

	if (rows.length === 1) {
		return rows[0].map((item) => String(item || "").trim()).filter(Boolean);
	}

	const preferredColumnIndex = getBulkCsvColumnIndex(rows[0], preferredHeaders);
	const columnIndex = preferredColumnIndex >= 0 ? preferredColumnIndex : 0;
	const startRow = preferredColumnIndex >= 0 ? 1 : 0;

	return rows
		.slice(startRow)
		.map((row) => row[columnIndex])
		.map((item) => String(item || "").trim())
		.filter(Boolean);
}

function getBulkMediaItems(type) {
	const config = bulkMediaConfigs[type];
	const inputText = document.getElementById(config.inputId).value;

	if (inputText.includes(",") || inputText.includes('"')) {
		const csvItems = getBulkItemsFromCsvText(inputText, config.preferredHeaders);

		if (csvItems.length) {
			return csvItems;
		}
	}

	return inputText
		.split("\n")
		.map((item) => item.trim())
		.filter(Boolean);
}

function looksLikeBulkMediaItem(value) {
	const item = String(value || "").trim();

	if (item.length < 1 || item.length > 140) {
		return false;
	}

	if (/https?:\/\/|www\.|@|[<>{}=\[\]\\|;]/i.test(item)) {
		return false;
	}

	if (/\b(function|const|let|class|import|export|return|doctype|html|body|script|style)\b/i.test(item)) {
		return false;
	}

	return /[A-Za-z0-9\u00c0-\uffff]/.test(item);
}

function looksLikeBulkMediaList(items) {
	const sample = items.slice(0, BULK_MEDIA_LIMIT);

	if (!sample.length) {
		return false;
	}

	const likelyCount = sample.filter(looksLikeBulkMediaItem).length;
	const requiredCount = sample.length < 5 ? sample.length : Math.ceil(sample.length * 0.65);

	return likelyCount >= requiredCount;
}

function isSupportedBulkMediaFile(file) {
	const filename = String(file.name || "").toLowerCase();
	const mimeType = String(file.type || "").toLowerCase();
	const hasSupportedExtension = filename.endsWith(".csv") || filename.endsWith(".txt");
	const hasSupportedMimeType = ["text/csv", "text/plain", "application/vnd.ms-excel"].includes(mimeType);

	return hasSupportedExtension || hasSupportedMimeType;
}

function rejectBulkMediaFile(type, message) {
	const config = bulkMediaConfigs[type];

	document.getElementById(config.fileInputId).value = "";
	document.getElementById(config.fileLabelId).textContent = "No file selected";
	document.getElementById(config.statusId).innerText = message;
}

function getBulkMediaBatchMessage(type, items, originalCount) {
	const config = bulkMediaConfigs[type];

	return `More than ${BULK_MEDIA_LIMIT} ${config.itemLabel} were provided, matching the first ${BULK_MEDIA_LIMIT} of ${originalCount}. Last included: ${
		items[items.length - 1]
	}. Start the next batch after that item.`;
}

function loadBulkMediaFile(type, file) {
	const config = bulkMediaConfigs[type];
	const status = document.getElementById(config.statusId);

	if (!file) {
		return;
	}

	if (!isSupportedBulkMediaFile(file)) {
		rejectBulkMediaFile(type, "Unsupported file type. Choose a CSV or TXT file.");
		return;
	}

	if (file.size > MAX_BULK_MEDIA_FILE_BYTES) {
		rejectBulkMediaFile(type, "That file is too large. Choose a CSV or TXT file smaller than 1 MB.");
		return;
	}

	const reader = new FileReader();

	reader.addEventListener("load", () => {
		const fileText = String(reader.result || "");

		if (looksLikeJsonFileText(fileText)) {
			rejectBulkMediaFile(type, "That file looks like JSON. Choose a CSV or TXT file with names or IDs.");
			return;
		}

		if (looksLikeMarkupOrCodeFileText(fileText)) {
			rejectBulkMediaFile(type, "That file looks like HTML or code. Choose a CSV or TXT file with names or IDs.");
			return;
		}

		const items = getBulkItemsFromCsvText(fileText, config.preferredHeaders);

		document.getElementById(config.fileLabelId).textContent = file.name;

		if (!items.length) {
			status.innerText = `No ${config.itemLabel} were found. Use a name/title column or put names in the first column.`;
			return;
		}

		if (!looksLikeBulkMediaList(items)) {
			rejectBulkMediaFile(type, `That file does not look like a ${config.itemLabel} list.`);
			return;
		}

		const itemsToUse = items.slice(0, BULK_MEDIA_LIMIT);
		const extraCount = items.length - itemsToUse.length;

		document.getElementById(config.inputId).value = itemsToUse.join("\n");

		if (extraCount > 0) {
			status.innerText = getBulkMediaBatchMessage(type, itemsToUse, items.length);
			return;
		}

		status.innerText = `Loaded ${items.length} ${config.itemLabel} from ${file.name}.`;
	});

	reader.addEventListener("error", () => {
		status.innerText = "Could not read that CSV or TXT file.";
	});

	reader.readAsText(file);
}

function findBestBulkMediaMatch(results, input, nameKey) {
	const normalizedInput = normalizeBulkMediaName(input);
	const exactMatch = (results || []).find((item) => normalizeBulkMediaName(item[nameKey]) === normalizedInput);

	if (exactMatch) {
		return {
			item: exactMatch,
			matchType: "Exact match",
		};
	}

	const bestResult = (results || [])[0];

	if (bestResult) {
		return {
			item: bestResult,
			matchType: "TMDB best result",
		};
	}

	return {
		item: null,
		matchType: "No match",
	};
}

function normalizeBulkCollectionTitle(value) {
	return normalizeBulkMediaName(value).replace(/\s+collection$/, "").replace(/^the\s+/, "");
}

function findBestBulkCollectionMatch(results, input) {
	const normalizedInput = normalizeBulkCollectionTitle(input);
	const directTitleMatch = (results || []).find((item) => normalizeBulkCollectionTitle(item.name) === normalizedInput);

	if (directTitleMatch) {
		return {
			item: directTitleMatch,
			matchType: "Title match",
		};
	}

	return findBestBulkMediaMatch(results, input, "name");
}

function getBulkLookupFailureStatus(response) {
	if (response.rateLimited) {
		return "TMDB rate limit reached";
	}

	if (response.invalidResponse) {
		return "TMDB invalid response";
	}

	if (response.status) {
		return `TMDB error HTTP ${response.status}`;
	}

	return "Network error";
}

function getTmdbImageUrl(path) {
	return path ? `https://image.tmdb.org/t/p/w500${path}` : "";
}

function getBulkNumericLookupFailureStatus(response) {
	if (response.status === 404) {
		return "No match";
	}

	return getBulkLookupFailureStatus(response);
}

async function getBulkCollectionDetailWithStatus(collectionId) {
	const response = await tmdbJsonWithStatus(tmdbApiUrl(`/3/collection/${collectionId}`));

	if (!response.ok) {
		return {
			ok: false,
			status: getBulkNumericLookupFailureStatus(response),
		};
	}

	if (!response.data || response.data.success === false) {
		return {
			ok: false,
			status: "No match",
		};
	}

	return {
		ok: true,
		detail: {
			collection: response.data,
			movieCount: response.data.parts ? response.data.parts.length.toLocaleString() : "\u2014",
		},
	};
}

async function getBulkTvSeriesDetailWithStatus(seriesId) {
	const response = await tmdbJsonWithStatus(tmdbApiUrl(`/3/tv/${seriesId}`));

	if (!response.ok) {
		return {
			ok: false,
			status: getBulkNumericLookupFailureStatus(response),
		};
	}

	if (!response.data || response.data.success === false) {
		return {
			ok: false,
			status: "No match",
		};
	}

	return {
		ok: true,
		detail: response.data,
	};
}

async function resolveBulkCollectionInput(input) {
	if (/^\d+$/.test(input)) {
		const response = await getBulkCollectionDetailWithStatus(input);

		if (!response.ok) {
			return {
				input,
				status: response.status,
			};
		}

		const detail = response.detail;

		return {
			input,
			name: detail.collection.name || "",
			id: detail.collection.id,
			movieCount: detail.movieCount || "\u2014",
			backdropPath: detail.collection.backdrop_path || "",
			backdropImageUrl: getTmdbImageUrl(detail.collection.backdrop_path),
			posterPath: detail.collection.poster_path || "",
			posterImageUrl: getTmdbImageUrl(detail.collection.poster_path),
			status: "TMDB ID match",
		};
	}

	const response = await tmdbJsonWithStatus(tmdbApiUrl("/3/search/collection", { query: input, page: 1 }));

	if (!response.ok) {
		return {
			input,
			status: getBulkLookupFailureStatus(response),
		};
	}

	const match = findBestBulkCollectionMatch(response.data?.results || [], input);

	if (!match.item) {
		return {
			input,
			status: match.matchType,
		};
	}

	const detail = await getCollectionMovieCount(match.item.id);
	const collection = detail?.collection || match.item;

	return {
		input,
		name: collection.name || match.item.name || "",
		id: collection.id || match.item.id,
		movieCount: detail?.movieCount || "\u2014",
		backdropPath: collection.backdrop_path || match.item.backdrop_path || "",
		backdropImageUrl: getTmdbImageUrl(collection.backdrop_path || match.item.backdrop_path),
		posterPath: collection.poster_path || match.item.poster_path || "",
		posterImageUrl: getTmdbImageUrl(collection.poster_path || match.item.poster_path),
		status: match.matchType,
	};
}

function getBulkTvScale(result) {
	const seasonCount = formatLookupCount(result.number_of_seasons);
	const episodeCount = formatLookupCount(result.number_of_episodes);

	if (result.type === "Miniseries" && result.number_of_seasons <= 1 && episodeCount) {
		return {
			label: "Episodes",
			value: episodeCount,
		};
	}

	return {
		label: "Seasons",
		value: seasonCount || "\u2014",
	};
}

function mapBulkTvResult(input, series, status) {
	const scale = getBulkTvScale(series);
	const seasons = Array.isArray(series.seasons) ? series.seasons : [];
	const network = getPrimaryTvNetwork(series);

	return {
		input,
		name: series.name || series.original_name || "",
		id: series.id,
		firstAirDate: series.first_air_date || "",
		country: Array.isArray(series.origin_country) ? series.origin_country.join(", ") : "",
		language: series.original_language ? series.original_language.toUpperCase() : "",
		episodeCount: series.number_of_episodes || "",
		posterPath: series.poster_path || "",
		posterImageUrl: series.poster_path ? `https://image.tmdb.org/t/p/w500${series.poster_path}` : "",
		scaleLabel: scale.label,
		scaleValue: scale.value,
		seasonCount: series.number_of_seasons || "",
		seasons,
		networkId: network?.id || "",
		networkLogoPath: network?.logo_path || "",
		networkLogoUrl: getTvNetworkLogoUrl(network),
		networkName: network?.name || "",
		status,
		type: getTvSeriesTypeLabel(series),
	};
}

async function resolveBulkTvInput(input) {
	if (/^\d+$/.test(input)) {
		const response = await getBulkTvSeriesDetailWithStatus(input);

		if (!response.ok) {
			return {
				input,
				status: response.status,
			};
		}

		return mapBulkTvResult(input, response.detail, "TMDB ID match");
	}

	const response = await tmdbJsonWithStatus(tmdbApiUrl("/3/search/tv", { query: input, page: 1 }));

	if (!response.ok) {
		return {
			input,
			status: getBulkLookupFailureStatus(response),
		};
	}

	const match = findBestBulkMediaMatch(response.data?.results || [], input, "name");

	if (!match.item) {
		return {
			input,
			status: match.matchType,
		};
	}

	const detail = await getTvSeriesDetails(match.item.id);

	return mapBulkTvResult(input, detail || match.item, match.matchType);
}

function renderBulkMediaResults(type, results) {
	const config = bulkMediaConfigs[type];
	const container = document.getElementById(config.resultsId);

	container.replaceChildren();

	if (!results.length) {
		return;
	}

	const table = document.createElement("table");
	const thead = document.createElement("thead");
	const headerRow = document.createElement("tr");
	const headings =
		type === "tv"
			? ["Input", "Match", "TMDB ID", "First Aired", "Type", "Scale", "Network", "Country", "Language", "Match Type", "TMDB"]
			: ["Input", "Match", "TMDB ID", "Movie Count", "Match Type", "TMDB"];

	for (const heading of headings) {
		headerRow.appendChild(createElement("th", { text: heading }));
	}

	thead.appendChild(headerRow);
	table.appendChild(thead);

	const tbody = document.createElement("tbody");

	for (const result of results) {
		const tr = document.createElement("tr");
		const idCell = document.createElement("td");
		const tmdbCell = document.createElement("td");

		tr.appendChild(createElement("td", { text: result.input }));
		tr.appendChild(createElement("td", { text: result.name || "" }));

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

			tmdbCell.appendChild(
				createElement("a", {
					text: "Open",
					attrs: {
						href: type === "tv" ? `https://www.themoviedb.org/tv/${result.id}` : `https://www.themoviedb.org/collection/${result.id}`,
						target: "_blank",
						rel: "noopener noreferrer",
					},
				}),
			);
		}

		tr.appendChild(idCell);

		if (type === "tv") {
			tr.appendChild(createElement("td", { text: result.firstAirDate || "\u2014" }));
			tr.appendChild(createElement("td", { text: result.type || "\u2014" }));
			tr.appendChild(createElement("td", { text: `${result.scaleLabel || "Seasons"}: ${result.scaleValue || "\u2014"}` }));
			tr.appendChild(createBulkTvNetworkCell(result));
			tr.appendChild(createElement("td", { text: result.country || "\u2014" }));
			tr.appendChild(createElement("td", { text: result.language || "\u2014" }));
		} else {
			tr.appendChild(createElement("td", { text: result.movieCount || "\u2014" }));
		}

		tr.appendChild(createElement("td", { text: result.status }));
		tr.appendChild(tmdbCell);
		tbody.appendChild(tr);
	}

	table.appendChild(tbody);
	container.appendChild(table);
}

function createBulkTvNetworkCell(result) {
	const cell = document.createElement("td");

	if (result.networkName) {
		cell.appendChild(
			createTvNetworkDisplay({
				logo_path: result.networkLogoPath,
				name: result.networkName,
			}),
		);
	} else {
		cell.textContent = "\u2014";
	}

	return cell;
}

function hasSeasonNumber(season) {
	return season && season.season_number !== undefined && season.season_number !== null;
}

function getBulkTvSeasonUrl(seriesId, season) {
	if (!seriesId || !hasSeasonNumber(season)) {
		return "";
	}

	return `https://www.themoviedb.org/tv/${seriesId}/season/${season.season_number}`;
}

function getBulkTvCsvRows(result) {
	const seasons = Array.isArray(result.seasons) && result.seasons.length ? result.seasons : [null];
	const seriesUrl = result.id ? `https://www.themoviedb.org/tv/${result.id}` : "";

	return seasons.map((season) => {
		const values = [
			result.input,
			result.name || "",
			result.id || "",
			seriesUrl,
			result.firstAirDate || "",
			result.type || "",
			result.seasonCount || "",
			result.episodeCount || "",
			result.networkName || "",
			result.country || "",
			result.language || "",
			hasSeasonNumber(season) ? season.season_number : "",
			season?.name || "",
			season?.id || "",
			season?.air_date || "",
			season?.episode_count || "",
			getBulkTvSeasonUrl(result.id, season),
			result.posterPath || "",
			result.posterImageUrl || "",
			result.status,
		];

		return values.map(csvEscape).join(",");
	});
}

function downloadBulkMediaCsv(type) {
	const results = getBulkMediaResults(type);

	if (!results.length) {
		return;
	}

	const headers =
		type === "tv"
			? [
					"input",
					"matched_name",
					"tmdb_tv_id",
					"tmdb_series_url",
					"first_air_date",
					"type",
					"series_season_count",
					"series_episode_count",
					"network_name",
					"country",
					"language",
					"season_number",
					"season_name",
					"tmdb_season_id",
					"season_air_date",
					"season_episode_count",
					"tmdb_season_url",
					"poster_path",
					"poster_image_url",
					"match_type",
				]
			: [
					"input",
					"matched_name",
					"tmdb_collection_id",
					"movie_count",
						"poster_path",
						"poster_image_url",
						"backdrop_path",
						"backdrop_image_url",
						"match_type",
				];

	const rows =
		type === "tv"
			? results.flatMap((result) => getBulkTvCsvRows(result))
			: results.map((result) => {
					const values = [
						result.input,
						result.name || "",
						result.id || "",
						result.movieCount || "",
						result.posterPath || "",
						result.posterImageUrl || "",
						result.backdropPath || "",
						result.backdropImageUrl || "",
						result.status,
					];

					return values.map(csvEscape).join(",");
				});

	downloadTextFile(`tmdb-${bulkMediaConfigs[type].downloadName}-ids.csv`, `${headers.join(",")}\n${rows.join("\n")}\n`);
}

async function resolveBulkMedia(type) {
	const config = bulkMediaConfigs[type];
	const status = document.getElementById(config.statusId);
	let batchMessage = "";
	let items = getBulkMediaItems(type);

	if (!items.length) {
		setBulkMediaResults(type, []);
		renderBulkMediaResults(type, []);
		status.innerText = config.emptyMessage;
		return;
	}

	if (items.length > BULK_MEDIA_LIMIT) {
		const originalCount = items.length;

		items = items.slice(0, BULK_MEDIA_LIMIT);
		document.getElementById(config.inputId).value = items.join("\n");
		batchMessage = getBulkMediaBatchMessage(type, items, originalCount);
		status.innerText = batchMessage;
	} else {
		status.innerText = "";
	}

	status.innerText = status.innerText
		? `${status.innerText} Resolving ${config.itemLabel} IDs...`
		: `Resolving ${config.itemLabel} IDs...`;
	setBulkMediaResults(type, []);
	renderBulkMediaResults(type, []);

	const results = [];

	for (const input of items) {
		try {
			results.push(type === "tv" ? await resolveBulkTvInput(input) : await resolveBulkCollectionInput(input));
		} catch {
			results.push({
				input,
				status: "Lookup failed",
			});
		}
	}

	setBulkMediaResults(type, results);
	renderBulkMediaResults(type, results);

	const matchedCount = results.filter((result) => result.id).length;

	status.replaceChildren(document.createTextNode(`Resolved ${config.itemLabel} IDs: matched ${matchedCount} of ${items.length}.`));

	if (batchMessage) {
		status.appendChild(
			createElement("span", {
				className: "bulk-batch-notice",
				text: batchMessage,
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

		downloadButton.addEventListener("click", () => downloadBulkMediaCsv(type));
		status.appendChild(document.createTextNode(" "));
		status.appendChild(downloadButton);

		if (type === "collections") {
			const jsonButton = createElement("button", {
				text: "Create Nuvio JSON from matches",
				attrs: {
					type: "button",
				},
			});

			jsonButton.addEventListener("click", openBulkCollectionNuvioExportModal);
			status.appendChild(document.createTextNode(" "));
			status.appendChild(jsonButton);
		}
	}
}

function clearBulkMedia(type) {
	const config = bulkMediaConfigs[type];

	document.getElementById(config.inputId).value = "";
	document.getElementById(config.fileInputId).value = "";
	document.getElementById(config.fileLabelId).textContent = "No file selected";
	document.getElementById(config.statusId).innerText = "";
	document.getElementById(config.resultsId).replaceChildren();
	setBulkMediaResults(type, []);
}

function getMatchedBulkCollectionResults() {
	return lastBulkCollectionResults.filter((result) => result.id);
}

function getBulkCollectionNuvioOptions() {
	return {
		artworkShape: document.getElementById("bulk-collection-nuvio-artwork-shape").value || "LANDSCAPE",
		collectionName:
			document.getElementById("bulk-collection-nuvio-collection-name").value.trim() || "Movie Collections",
		hideFolderTitle: document.getElementById("bulk-collection-nuvio-hide-title").checked,
	};
}

function getBulkCollectionFolderTitle(result) {
	const title = String(result.name || result.input || "Movie Collection")
		.replace(/\s+Collection$/i, "")
		.replace(/^The\s+/i, "")
		.trim();

	return title || result.name || "Movie Collection";
}

function getBulkCollectionArtworkUrl(result, options) {
	if (options.artworkShape === "POSTER") {
		return result.posterImageUrl || result.backdropImageUrl || "";
	}

	return result.backdropImageUrl || result.posterImageUrl || "";
}

function createBulkCollectionNuvioSource(result) {
	return {
		title: result.name,
		sortBy: "original",
		tmdbId: Number(result.id),
		filters: {},
		provider: "tmdb",
		mediaType: "MOVIE",
		tmdbSourceType: "COLLECTION",
	};
}

function createBulkCollectionNuvioFolder(result, options, idFactory) {
	return {
		id: idFactory.create("folder"),
		title: getBulkCollectionFolderTitle(result),
		sources: [createBulkCollectionNuvioSource(result)],
		hideTitle: options.hideFolderTitle,
		tileShape: options.artworkShape,
		coverEmoji: "",
		focusGifUrl: "",
		heroVideoUrl: "",
		titleLogoUrl: "",
		coverImageUrl: getBulkCollectionArtworkUrl(result, options),
		catalogSources: [],
		focusGifEnabled: false,
		heroBackdropUrl: "",
	};
}

function createBulkCollectionNuvioJson(options = getBulkCollectionNuvioOptions()) {
	const idFactory = createNuvioIdFactory();

	return [
		{
			id: idFactory.create("collection"),
			title: options.collectionName,
			folders: getMatchedBulkCollectionResults().map((result) => createBulkCollectionNuvioFolder(result, options, idFactory)),
			pinToTop: false,
			viewMode: "TABBED_GRID",
			showAllTab: false,
			backdropImageUrl: BULK_MOVIE_COLLECTION_HERO_URL,
			focusGlowEnabled: true,
		},
	];
}

function getBulkCollectionNuvioCacheKey(options) {
	return JSON.stringify({
		options,
		results: getMatchedBulkCollectionResults().map((result) => ({
			id: String(result.id || ""),
			input: result.input || "",
			name: result.name || "",
			posterImageUrl: result.posterImageUrl || "",
			backdropImageUrl: result.backdropImageUrl || "",
		})),
	});
}

function getBulkCollectionNuvioExportPayload() {
	if (!getMatchedBulkCollectionResults().length) {
		return null;
	}

	const options = getBulkCollectionNuvioOptions();
	const cacheKey = getBulkCollectionNuvioCacheKey(options);

	if (!bulkCollectionNuvioExportCache || bulkCollectionNuvioExportCache.cacheKey !== cacheKey) {
		bulkCollectionNuvioExportCache = {
			cacheKey,
			filename: `${slugifyFilename(options.collectionName)}.nuvio.json`,
			json: `${JSON.stringify(createBulkCollectionNuvioJson(options), null, "\t")}\n`,
		};
	}

	return bulkCollectionNuvioExportCache;
}

function updateBulkCollectionNuvioSummary() {
	const selectedCount = getMatchedBulkCollectionResults().length;
	const options = getBulkCollectionNuvioOptions();
	const shapeLabel = options.artworkShape === "POSTER" ? "poster" : "landscape";

	document.getElementById("bulk-collection-nuvio-export-summary").innerText =
		`This will create one ${options.collectionName} collection with ${selectedCount.toLocaleString()} ` +
		`folder${selectedCount === 1 ? "" : "s"} using ${shapeLabel} artwork.`;

	updateBulkCollectionArtworkPreviews(options);
}

function setBulkCollectionPreviewImage(imageId, imageUrl) {
	const image = document.getElementById(imageId);

	if (!image) {
		return;
	}

	if (imageUrl) {
		image.src = imageUrl;
	} else {
		image.removeAttribute("src");
	}
}

function updateBulkCollectionArtworkPreviews(options = getBulkCollectionNuvioOptions()) {
	const sample = getMatchedBulkCollectionResults()[0];
	const posterChoice = document.getElementById("bulk-collection-poster-preview-choice");
	const landscapeChoice = document.getElementById("bulk-collection-landscape-preview-choice");

	if (!sample) {
		setBulkCollectionPreviewImage("bulk-collection-poster-preview", "");
		setBulkCollectionPreviewImage("bulk-collection-landscape-preview", "");
		return;
	}

	setBulkCollectionPreviewImage("bulk-collection-poster-preview", sample.posterImageUrl || sample.backdropImageUrl || "");
	setBulkCollectionPreviewImage(
		"bulk-collection-landscape-preview",
		sample.backdropImageUrl || sample.posterImageUrl || "",
	);

	posterChoice?.classList.toggle("active", options.artworkShape === "POSTER");
	landscapeChoice?.classList.toggle("active", options.artworkShape !== "POSTER");
}

function setBulkCollectionArtworkShape(shape) {
	const select = document.getElementById("bulk-collection-nuvio-artwork-shape");

	select.value = shape;
	updateBulkCollectionNuvioSummary();
}

function openBulkCollectionNuvioExportModal() {
	if (!getMatchedBulkCollectionResults().length) {
		return;
	}

	const nameInput = document.getElementById("bulk-collection-nuvio-collection-name");

	if (!nameInput.value.trim()) {
		nameInput.value = "Movie Collections";
	}

	updateBulkCollectionNuvioSummary();
	openAppModal("bulk-collection-nuvio-export-modal", nameInput);
}

function closeBulkCollectionNuvioExportModal() {
	closeNuvioImportHelpModal();
	closeAppModal("bulk-collection-nuvio-export-modal");
}

function downloadBulkCollectionNuvioJson() {
	const payload = getBulkCollectionNuvioExportPayload();

	if (!payload) {
		return;
	}

	downloadTextFile(payload.filename, payload.json, "application/json");
}

function copyBulkCollectionNuvioJson(button) {
	const payload = getBulkCollectionNuvioExportPayload();

	if (!payload) {
		return;
	}

	copyTextWithButtonFeedback(payload.json, button);
}

function initBulkCollectionNuvioExport() {
	document.getElementById("close-bulk-collection-nuvio-export").addEventListener("click", closeBulkCollectionNuvioExportModal);
	document.getElementById("cancel-bulk-collection-nuvio-export").addEventListener("click", closeBulkCollectionNuvioExportModal);
	document
		.getElementById("copy-bulk-collection-nuvio-json")
		.addEventListener("click", (event) => copyBulkCollectionNuvioJson(event.currentTarget));
	document.getElementById("download-bulk-collection-nuvio-json").addEventListener("click", downloadBulkCollectionNuvioJson);
	document.getElementById("open-bulk-collection-nuvio-import-help").addEventListener("click", openNuvioImportHelpModal);
	document.getElementById("bulk-collection-nuvio-collection-name").addEventListener("input", updateBulkCollectionNuvioSummary);
	document.getElementById("bulk-collection-nuvio-artwork-shape").addEventListener("change", updateBulkCollectionNuvioSummary);
	document
		.getElementById("bulk-collection-poster-preview-choice")
		.addEventListener("click", () => setBulkCollectionArtworkShape("POSTER"));
	document
		.getElementById("bulk-collection-landscape-preview-choice")
		.addEventListener("click", () => setBulkCollectionArtworkShape("LANDSCAPE"));
	document.getElementById("bulk-collection-nuvio-export-modal").addEventListener("click", (event) => {
		if (event.target.id === "bulk-collection-nuvio-export-modal") {
			closeBulkCollectionNuvioExportModal();
		}
	});
}

function initBulkMediaLookup() {
	for (const type of Object.keys(bulkMediaConfigs)) {
		const config = bulkMediaConfigs[type];

		document.getElementById(config.inputId).addEventListener("input", () => {
			document.getElementById(config.statusId).innerText = "";
		});

		document.getElementById(config.buttonId).addEventListener("click", () => {
			resolveBulkMedia(type);
		});

		document.getElementById(config.clearButtonId).addEventListener("click", () => {
			clearBulkMedia(type);
		});

		document.getElementById(config.fileInputId).addEventListener("change", (event) => {
			loadBulkMediaFile(type, event.target.files[0]);
		});
	}

	initBulkCollectionNuvioExport();
}

window.initBulkMediaLookup = initBulkMediaLookup;
