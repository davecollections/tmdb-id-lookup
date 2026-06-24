const NUVIO_PEOPLE_BACKDROP_URL =
	"https://github.com/davecollections/nuvio-assets/blob/main/assets/collection%20covers/people/people%20hero%20backdrop.jpg?raw=true";

const NUVIO_PERSON_SORTS = {
	POPULAR: {
		MOVIE: "popularity.desc",
		TV: "popularity.desc",
	},
	RECENT: {
		MOVIE: "primary_release_date.desc",
		TV: "first_air_date.desc",
	},
	TOP_RATED: {
		MOVIE: "vote_average.desc",
		TV: "vote_average.desc",
	},
};

const NUVIO_LINE_MODE_LABELS = {
	NONE: "None",
	MOVIE: "Movies",
	TV: "Series",
	BOTH: "Movies + Series",
};

const NUVIO_SOURCE_PAIR_ORDER = {
	"PERSON/MOVIE": 1,
	"DIRECTOR/MOVIE": 2,
	"PERSON/TV": 3,
	"DIRECTOR/TV": 4,
};

const NUVIO_SOURCE_PAIR_TITLES = {
	"PERSON/MOVIE": "Movie Credits",
	"DIRECTOR/MOVIE": "Directed Movies",
	"PERSON/TV": "Series Credits",
	"DIRECTOR/TV": "Directed Series",
};

let nuvioCreditSelectionMode = "auto";
let nuvioMediaSelectionMode = "auto";

function getMatchedBulkPeopleResults() {
	return lastBulkPeopleResults.filter((result) => result.id);
}

function getBulkPeopleSurnameSortText(result) {
	const nameParts = String(result.name || result.input || "")
		.trim()
		.split(/\s+/)
		.filter(Boolean);

	return (nameParts[nameParts.length - 1] || "").toLocaleLowerCase();
}

function getMatchedBulkPeopleResultsForExport() {
	return getMatchedBulkPeopleResults()
		.map((result, index) => ({ result, index }))
		.sort((first, second) => {
			const firstSort = getBulkPeopleSurnameSortText(first.result);
			const secondSort = getBulkPeopleSurnameSortText(second.result);
			const comparison = firstSort.localeCompare(secondSort);

			return comparison || first.index - second.index;
		})
		.map((entry) => entry.result);
}

function normalizeNuvioCreditMode(creditMode) {
	return ["PERSON", "DIRECTOR", "BOTH"].includes(creditMode) ? creditMode : "PERSON";
}

function normalizeNuvioMediaMode(mediaMode) {
	return ["MOVIE", "TV", "BOTH"].includes(mediaMode) ? mediaMode : "MOVIE";
}

function normalizeNuvioLineMode(lineMode) {
	return ["NONE", "MOVIE", "TV", "BOTH"].includes(lineMode) ? lineMode : "";
}

function normalizeNuvioMinimumCreditCount(value) {
	const count = Number(value);

	return [1, 2, 5, 10].includes(count) ? count : 1;
}

function getSelectedNuvioMode(name) {
	return document.querySelector?.(`input[name="${name}"]:checked`)?.value || "auto";
}

function getSelectedNuvioCreditSelectionMode() {
	const mode = getSelectedNuvioMode("nuvio-credit-mode");

	return ["auto", "same", "custom"].includes(mode) ? mode : "auto";
}

function getSelectedNuvioMediaSelectionMode() {
	const mode = getSelectedNuvioMode("nuvio-media-mode");

	return ["auto", "same", "custom"].includes(mode) ? mode : "auto";
}

function getSelectedNuvioSameCreditMode() {
	return normalizeNuvioCreditMode(document.querySelector?.('input[name="nuvio-same-credit-source"]:checked')?.value);
}

function getSelectedNuvioSameMediaMode() {
	return normalizeNuvioMediaMode(document.querySelector?.('input[name="nuvio-same-media-source"]:checked')?.value);
}

function getNuvioCreditTypes(creditMode) {
	return creditMode === "BOTH" ? ["PERSON", "DIRECTOR"] : [creditMode];
}

function getNuvioMediaTypes(mediaMode) {
	return mediaMode === "BOTH" ? ["MOVIE", "TV"] : [mediaMode];
}

function getNuvioSourcePairKey(pair) {
	return `${pair.creditType}/${pair.mediaType}`;
}

function sortNuvioSourcePairs(pairs) {
	return [...pairs].sort(
		(firstPair, secondPair) =>
			(NUVIO_SOURCE_PAIR_ORDER[getNuvioSourcePairKey(firstPair)] || 99) -
			(NUVIO_SOURCE_PAIR_ORDER[getNuvioSourcePairKey(secondPair)] || 99),
	);
}

function resetNuvioCustomCreditOverrides() {
	for (const result of getMatchedBulkPeopleResults()) {
		resetNuvioSourceLineOverrides(result);
	}
}

function resetNuvioCustomMediaOverrides() {
	for (const result of getMatchedBulkPeopleResults()) {
		resetNuvioSourceLineOverrides(result);
	}
}

function getNuvioExportOptions() {
	const collectionName =
		document.getElementById("nuvio-collection-name").value.trim() || "TMDB People Collection";

	return {
		collectionName,
		creditSelectionMode: getSelectedNuvioCreditSelectionMode(),
		hideFolderTitle: document.getElementById("nuvio-hide-folder-title").checked,
		mediaSelectionMode: getSelectedNuvioMediaSelectionMode(),
		minimumCreditCount: getSelectedNuvioMinimumCreditCount(),
		sameCreditMode: getSelectedNuvioSameCreditMode(),
		sameMediaMode: getSelectedNuvioSameMediaMode(),
		sortKey: getSelectedNuvioSortKey(),
	};
}

function getNuvioSortValue(sortKey, mediaType) {
	return (
		NUVIO_PERSON_SORTS[sortKey]?.[mediaType] ||
		NUVIO_PERSON_SORTS.POPULAR[mediaType] ||
		NUVIO_PERSON_SORTS.POPULAR.MOVIE
	);
}

function getSelectedNuvioSortKey() {
	return document.querySelector?.('input[name="nuvio-sort-by"]:checked')?.value || "POPULAR";
}

function getSelectedNuvioMinimumCreditCount() {
	return normalizeNuvioMinimumCreditCount(document.querySelector?.('input[name="nuvio-minimum-credits"]:checked')?.value);
}

function getNuvioCreditCounts(result, creditType) {
	const summary = result.creditSummary;

	if (!summary?.hasCreditData) {
		return {
			movieCount: 0,
			tvCount: 0,
		};
	}

	if (creditType === "DIRECTOR") {
		return {
			movieCount: summary.directorMovieCount || 0,
			tvCount: summary.directorTvCount || 0,
		};
	}

	return {
		movieCount: summary.movieCount || 0,
		tvCount: summary.tvCount || 0,
	};
}

function getNuvioSourcePairCount(result, creditType, mediaType) {
	const counts = getNuvioCreditCounts(result, creditType);

	return mediaType === "TV" ? counts.tvCount : counts.movieCount;
}

function isNuvioSourcePairAvailable(result, creditType, mediaType, options = {}) {
	if (!hasNuvioCreditData(result)) {
		return true;
	}

	return getNuvioSourcePairCount(result, creditType, mediaType) >= normalizeNuvioMinimumCreditCount(options.minimumCreditCount);
}

function getNuvioLineModeFromMediaTypes(mediaTypes) {
	const hasMovies = mediaTypes.includes("MOVIE");
	const hasSeries = mediaTypes.includes("TV");

	if (hasMovies && hasSeries) {
		return "BOTH";
	}

	if (hasMovies) {
		return "MOVIE";
	}

	if (hasSeries) {
		return "TV";
	}

	return "NONE";
}

function hasNuvioCreditData(result) {
	return Boolean(result.creditSummary?.hasCreditData);
}

function getNuvioSourceLineOverrides(result) {
	if (!result.sourceLineOverrides || typeof result.sourceLineOverrides !== "object") {
		result.sourceLineOverrides = {
			PERSON: "",
			DIRECTOR: "",
		};
	}

	return result.sourceLineOverrides;
}

function resetNuvioSourceLineOverrides(result) {
	result.sourceLineOverrides = {
		PERSON: "",
		DIRECTOR: "",
	};
}

function getNuvioLineModeFromCounts(result, creditType, options = {}) {
	if (!hasNuvioCreditData(result)) {
		return options.fallback ? "MOVIE" : "NONE";
	}

	const counts = getNuvioCreditCounts(result, creditType);
	const minimumCreditCount = normalizeNuvioMinimumCreditCount(options.minimumCreditCount);

	if (counts.movieCount >= minimumCreditCount && counts.tvCount >= minimumCreditCount) {
		return "BOTH";
	}

	if (counts.movieCount >= minimumCreditCount) {
		return "MOVIE";
	}

	if (counts.tvCount >= minimumCreditCount) {
		return "TV";
	}

	return options.fallback ? "MOVIE" : "NONE";
}

function pruneNuvioLineModeByAvailability(result, creditType, lineMode, options) {
	if (lineMode === "NONE") {
		return "NONE";
	}

	return getNuvioLineModeFromMediaTypes(
		getNuvioMediaTypes(lineMode).filter((mediaType) =>
			isNuvioSourcePairAvailable(result, creditType, mediaType, options),
		),
	);
}

function getNuvioAutoCreditTypes(result, options = {}) {
	if (!hasNuvioCreditData(result)) {
		return ["PERSON"];
	}

	const creditTypes = ["PERSON", "DIRECTOR"].filter(
		(creditType) => getNuvioLineModeFromCounts(result, creditType, options) !== "NONE",
	);

	return creditTypes.length ? creditTypes : ["PERSON"];
}

function getNuvioBaseCreditTypes(result, options) {
	if (options.creditSelectionMode === "same") {
		return getNuvioCreditTypes(options.sameCreditMode);
	}

	return getNuvioAutoCreditTypes(result, options);
}

function getNuvioBaseLineMediaMode(result, creditType, options, activeCreditTypes) {
	if (!activeCreditTypes.includes(creditType)) {
		return "NONE";
	}

	if (options.mediaSelectionMode === "same") {
		return pruneNuvioLineModeByAvailability(
			result,
			creditType,
			normalizeNuvioMediaMode(options.sameMediaMode),
			options,
		);
	}

	if (options.mediaSelectionMode === "custom") {
		return getNuvioLineModeFromCounts(result, creditType, {
			fallback: !hasNuvioCreditData(result) && creditType === "PERSON",
			minimumCreditCount: 1,
		});
	}

	return getNuvioLineModeFromCounts(result, creditType, {
		fallback: !hasNuvioCreditData(result) && creditType === "PERSON",
		minimumCreditCount: options.minimumCreditCount,
	});
}

function getNuvioBaseSourceLineModes(result, options) {
	const activeCreditTypes = getNuvioBaseCreditTypes(result, options);

	return {
		PERSON: getNuvioBaseLineMediaMode(result, "PERSON", options, activeCreditTypes),
		DIRECTOR: getNuvioBaseLineMediaMode(result, "DIRECTOR", options, activeCreditTypes),
	};
}

function getNuvioUnprunedAutoCreditTypes(result) {
	if (!hasNuvioCreditData(result)) {
		return ["PERSON"];
	}

	const creditTypes = ["PERSON", "DIRECTOR"].filter(
		(creditType) => getNuvioLineModeFromCounts(result, creditType, { minimumCreditCount: 1 }) !== "NONE",
	);

	return creditTypes.length ? creditTypes : ["PERSON"];
}

function getNuvioUnprunedBaseCreditTypes(result, options) {
	if (options.creditSelectionMode === "same") {
		return getNuvioCreditTypes(options.sameCreditMode);
	}

	return getNuvioUnprunedAutoCreditTypes(result);
}

function getNuvioUnprunedBaseLineMediaMode(result, creditType, options, activeCreditTypes) {
	if (!activeCreditTypes.includes(creditType)) {
		return "NONE";
	}

	if (options.mediaSelectionMode === "same") {
		return normalizeNuvioMediaMode(options.sameMediaMode);
	}

	return getNuvioLineModeFromCounts(result, creditType, {
		fallback: !hasNuvioCreditData(result) && creditType === "PERSON",
		minimumCreditCount: 1,
	});
}

function getNuvioUnprunedBaseSourceLineModes(result, options) {
	const activeCreditTypes = getNuvioUnprunedBaseCreditTypes(result, options);

	return {
		PERSON: getNuvioUnprunedBaseLineMediaMode(result, "PERSON", options, activeCreditTypes),
		DIRECTOR: getNuvioUnprunedBaseLineMediaMode(result, "DIRECTOR", options, activeCreditTypes),
	};
}

function getNuvioSourceLineModes(result, options) {
	const lineModes = getNuvioBaseSourceLineModes(result, options);
	const overrides = getNuvioSourceLineOverrides(result);
	const allowLineOverrides = options.creditSelectionMode === "custom" || options.mediaSelectionMode === "custom";

	if (!allowLineOverrides) {
		return lineModes;
	}

	for (const creditType of ["PERSON", "DIRECTOR"]) {
		const override = normalizeNuvioLineMode(overrides[creditType]);

		if (!override) {
			continue;
		}

		if (options.mediaSelectionMode === "custom" && options.creditSelectionMode !== "custom" && lineModes[creditType] === "NONE") {
			continue;
		}

		if (options.mediaSelectionMode === "custom" && options.creditSelectionMode !== "custom" && override === "NONE") {
			continue;
		}

		lineModes[creditType] = override;
	}

	return lineModes;
}

function createNuvioDetectedCreditSummary(result) {
	if (!hasNuvioCreditData(result)) {
		return createElement("div", {
			className: "nuvio-person-detected-summary",
			text: "Detected credits unavailable",
		});
	}

	const personCounts = getNuvioCreditCounts(result, "PERSON");
	const directorCounts = getNuvioCreditCounts(result, "DIRECTOR");

	return createElement("div", {
		className: "nuvio-person-detected-summary",
	}, [
		createElement("span", {
			className: "nuvio-person-detected-heading",
			text: "Detected",
		}),
		createElement("span", {
			text: `People: ${personCounts.movieCount.toLocaleString()} movies / ${personCounts.tvCount.toLocaleString()} series`,
		}),
		createElement("span", {
			text: `Director: ${directorCounts.movieCount.toLocaleString()} movies / ${directorCounts.tvCount.toLocaleString()} series`,
		}),
	]);
}

function updateNuvioModeControls() {
	const options = getNuvioExportOptions();
	const autoCreditNote = document.getElementById("nuvio-auto-credit-note");
	const sameCreditOptions = document.getElementById("nuvio-same-credit-options");
	const autoMediaNote = document.getElementById("nuvio-auto-media-note");
	const sameMediaOptions = document.getElementById("nuvio-same-media-options");
	const personOptions = document.getElementById("nuvio-person-options");

	nuvioCreditSelectionMode = options.creditSelectionMode;
	nuvioMediaSelectionMode = options.mediaSelectionMode;

	if (autoCreditNote) {
		autoCreditNote.hidden = nuvioCreditSelectionMode !== "auto";
	}

	if (sameCreditOptions) {
		sameCreditOptions.hidden = nuvioCreditSelectionMode !== "same";
	}

	if (autoMediaNote) {
		autoMediaNote.hidden = nuvioMediaSelectionMode !== "auto";
	}

	if (sameMediaOptions) {
		sameMediaOptions.hidden = nuvioMediaSelectionMode !== "same";
	}

	if (personOptions) {
		if (nuvioCreditSelectionMode === "custom" || nuvioMediaSelectionMode === "custom") {
			personOptions.open = true;
		}
	}

	updateNuvioSourceWarning();
}

function renderNuvioPersonOptionsIfNeeded() {
	renderNuvioPersonOptions();
}

function setNuvioCreditSelectionMode(mode, options = {}) {
	const nextMode = ["auto", "same", "custom"].includes(mode) ? mode : "auto";
	const input = document.querySelector?.(`input[name="nuvio-credit-mode"][value="${nextMode}"]`);

	if (input) {
		input.checked = true;
	}

	if (nextMode === "auto" && options.resetCustom) {
		resetNuvioCustomCreditOverrides();
	}

	updateNuvioModeControls();
	renderNuvioPersonOptionsIfNeeded();
}

function setNuvioMediaSelectionMode(mode, options = {}) {
	const nextMode = ["auto", "same", "custom"].includes(mode) ? mode : "auto";
	const input = document.querySelector?.(`input[name="nuvio-media-mode"][value="${nextMode}"]`);

	if (input) {
		input.checked = true;
	}

	if (nextMode === "auto" && options.resetCustom) {
		resetNuvioCustomMediaOverrides();
	}

	updateNuvioModeControls();
	renderNuvioPersonOptionsIfNeeded();
}

function updateBulkPersonSourceLineOverride(result, creditType, lineMode) {
	const overrides = getNuvioSourceLineOverrides(result);

	overrides[creditType] = normalizeNuvioLineMode(lineMode) || "NONE";
	updateNuvioSourceWarning();
	renderNuvioPersonOptions();
}

function createNuvioOptionControl(label, value, selectOptions, onChange, ariaLabel = label) {
	const wrapper = createElement("label", {
		className: "nuvio-person-option-control",
	});
	const labelText = createElement("span", {
		className: "nuvio-person-option-label",
		text: label,
	});
	const select = document.createElement("select");

	select.setAttribute("aria-label", ariaLabel);

	for (const option of selectOptions) {
		select.appendChild(
			createElement("option", {
				text: option.label,
				attrs: {
					value: option.value,
				},
			}),
		);
	}

	select.value = value;
	select.addEventListener("change", () => onChange(select.value));
	wrapper.appendChild(labelText);
	wrapper.appendChild(select);

	return wrapper;
}

function createNuvioStaticOption(label, value) {
	return createElement("div", {
		className: "nuvio-person-option-control",
	}, [
		createElement("span", {
			className: "nuvio-person-option-label",
			text: label,
		}),
		createElement("span", {
			className: "nuvio-person-option-static",
			text: value,
		}),
	]);
}

function getNuvioCreditToggleLineMode(result, creditType, options) {
	if (options.mediaSelectionMode === "same") {
		return normalizeNuvioMediaMode(options.sameMediaMode);
	}

	const lineMode = getNuvioLineModeFromCounts(result, creditType, {
		fallback: !hasNuvioCreditData(result) && creditType === "PERSON",
		minimumCreditCount: 1,
	});

	return lineMode === "NONE" ? "MOVIE" : lineMode;
}

function getNuvioLineControlOptions(result, options, creditType, lineMode) {
	const canEditCredits = options.creditSelectionMode === "custom";
	const canEditMedia = options.mediaSelectionMode === "custom";

	if (canEditCredits && canEditMedia) {
		return [
			{ value: "NONE", label: "None" },
			{ value: "MOVIE", label: "Movies" },
			{ value: "TV", label: "Series" },
			{ value: "BOTH", label: "Movies + Series" },
		];
	}

	if (canEditCredits) {
		const resolvedEnabledMode = lineMode !== "NONE" ? lineMode : getNuvioCreditToggleLineMode(result, creditType, options);
		const enabledMode = resolvedEnabledMode === "NONE" ? "MOVIE" : resolvedEnabledMode;

		return [
			{ value: "NONE", label: "None" },
			{ value: enabledMode, label: NUVIO_LINE_MODE_LABELS[enabledMode] || "Movies" },
		];
	}

	if (canEditMedia && lineMode !== "NONE") {
		return [
			{ value: "MOVIE", label: "Movies" },
			{ value: "TV", label: "Series" },
			{ value: "BOTH", label: "Movies + Series" },
		];
	}

	return [];
}

function createNuvioSourceLineControl(result, options, creditType, lineMode) {
	const label = creditType === "DIRECTOR" ? "Directed credits" : "People credits";
	const controlOptions = getNuvioLineControlOptions(result, options, creditType, lineMode);

	if (!controlOptions.length) {
		return createNuvioStaticOption(label, NUVIO_LINE_MODE_LABELS[lineMode] || "None");
	}

	return createNuvioOptionControl(
		label,
		lineMode === "NONE" || controlOptions.some((option) => option.value === lineMode)
			? lineMode
			: controlOptions[0].value,
		controlOptions,
		(value) => updateBulkPersonSourceLineOverride(result, creditType, value),
		`${label} for ${result.name}`,
	);
}

function getNuvioPairWarningTexts(result, pairs, options) {
	if (!hasNuvioCreditData(result)) {
		return [];
	}

	return pairs
		.filter((pair) => !isNuvioSourcePairAvailable(result, pair.creditType, pair.mediaType, options))
		.map((pair) => {
			const creditLabel = pair.creditType === "DIRECTOR" ? "director" : "people";
			const mediaLabel = pair.mediaType === "TV" ? "series" : "movie";
			const count = getNuvioSourcePairCount(result, pair.creditType, pair.mediaType);

			return count
				? `Only ${count.toLocaleString()} ${creditLabel} ${mediaLabel} credits detected`
				: `No ${creditLabel} ${mediaLabel} credits detected`;
		});
}

function renderNuvioPersonOptions() {
	const list = document.getElementById("nuvio-person-options-list");
	const options = getNuvioExportOptions();
	const matchedPeople = getMatchedBulkPeopleResults();

	list.replaceChildren();

	if (!matchedPeople.length) {
		list.appendChild(
			createElement("p", {
				className: "meta",
				text: "Resolve people first, then optional per-person choices will appear here.",
			}),
		);
		return;
	}

	for (const result of matchedPeople) {
		const lineModes = getNuvioSourceLineModes(result, options);
		const sourcePairs = getNuvioSourcePairs(result, options);
		const warningPairs =
			options.creditSelectionMode === "custom" || options.mediaSelectionMode === "custom"
				? sourcePairs
				: [];
		const warningTexts = getNuvioPairWarningTexts(result, warningPairs, options);

		if (!sourcePairs.length) {
			warningTexts.push(getNuvioSkippedPersonWarningText(options));
		}

		const row = createElement("div", {
			className: "nuvio-person-option-row",
		});
		const copy = createElement("div", {
			className: "nuvio-person-media-copy",
		});

		copy.appendChild(createElement("strong", { text: result.name }));
		copy.appendChild(createNuvioDetectedCreditSummary(result));

		row.appendChild(copy);
		row.appendChild(
			createElement("div", {
				className: "nuvio-person-source-lines",
			}, [
				createNuvioSourceLineControl(result, options, "PERSON", lineModes.PERSON),
				createNuvioSourceLineControl(result, options, "DIRECTOR", lineModes.DIRECTOR),
			]),
		);

		if (warningTexts.length) {
			row.appendChild(
				createElement("span", {
					className: "nuvio-person-option-warning",
					text: warningTexts.join(". "),
				}),
			);
		}

		list.appendChild(row);
	}

	updateNuvioModeControls();
}

function autoSelectNuvioPeopleOptions() {
	setNuvioCreditSelectionMode("auto", {
		resetCustom: true,
	});
	setNuvioMediaSelectionMode("auto", {
		resetCustom: true,
	});
}

function openNuvioExportModal() {
	const defaultCollectionName = document.getElementById("nuvio-collection-name");

	if (!defaultCollectionName.value.trim()) {
		defaultCollectionName.value = "TMDB People Collection";
	}

	autoSelectNuvioPeopleOptions();
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

function getNuvioSourcePairsFromLineModes(lineModes) {
	const pairs = [];

	for (const creditType of ["PERSON", "DIRECTOR"]) {
		if (lineModes[creditType] === "NONE") {
			continue;
		}

		for (const mediaType of getNuvioMediaTypes(lineModes[creditType])) {
			pairs.push({
				creditType,
				mediaType,
			});
		}
	}

	return pairs;
}

function getNuvioBaseSourcePairs(result, options) {
	return getNuvioSourcePairsFromLineModes(getNuvioSourceLineModes(result, options));
}

function getNuvioUnprunedBaseSourcePairs(result, options) {
	return getNuvioSourcePairsFromLineModes(getNuvioUnprunedBaseSourceLineModes(result, options));
}

function getNuvioSourcePairs(result, options) {
	return sortNuvioSourcePairs(getNuvioBaseSourcePairs(result, options));
}

function getNuvioPeopleExportRows(options) {
	return getMatchedBulkPeopleResultsForExport().map((result) => ({
		result,
		pairs: getNuvioSourcePairs(result, options),
	}));
}

function getNuvioExportState(options) {
	const rows = getNuvioPeopleExportRows(options);

	return {
		rows,
		exportableRows: rows.filter((row) => row.pairs.length),
		skippedRows: rows.filter((row) => !row.pairs.length),
	};
}

function getNuvioSourceTitle(pair) {
	return NUVIO_SOURCE_PAIR_TITLES[getNuvioSourcePairKey(pair)] || "TMDB Credits";
}

function createNuvioSource(result, options, pair) {
	return {
		title: getNuvioSourceTitle(pair),
		sortBy: getNuvioSortValue(options.sortKey, pair.mediaType),
		tmdbId: Number(result.id),
		filters: {},
		provider: "tmdb",
		mediaType: pair.mediaType,
		tmdbSourceType: pair.creditType,
	};
}

function createNuvioFolder(result, options, pairs = getNuvioSourcePairs(result, options)) {
	const folder = {
		id: createNuvioId("folder"),
		title: result.name,
		sources: pairs.map((pair) => createNuvioSource(result, options, pair)),
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

	folder.catalogSources = [];
	folder.focusGifEnabled = false;

	return folder;
}

function createNuvioCollectionJson(options = getNuvioExportOptions(), exportState = getNuvioExportState(options)) {
	const folders = exportState.exportableRows.map((row) => createNuvioFolder(row.result, options, row.pairs));
	const hasMultipleSources = folders.some((folder) => folder.sources.length > 1);
	const collection = {
		id: createNuvioId("collection"),
		title: options.collectionName,
		folders,
		pinToTop: false,
		viewMode: hasMultipleSources ? "ROWS" : "TABBED_GRID",
		showAllTab: hasMultipleSources,
		backdropImageUrl: NUVIO_PEOPLE_BACKDROP_URL,
		focusGlowEnabled: true,
	};

	return [collection];
}

function countNuvioMissingExplicitSourcePairs(options) {
	if (options.creditSelectionMode !== "custom" && options.mediaSelectionMode !== "custom") {
		return 0;
	}

	return getMatchedBulkPeopleResults().reduce((total, result) => {
		if (!hasNuvioCreditData(result)) {
			return total;
		}

		return (
			total +
			getNuvioSourcePairs(result, options).filter(
				(pair) => !isNuvioSourcePairAvailable(result, pair.creditType, pair.mediaType, options),
			).length
		);
	}, 0);
}

function countNuvioAutomaticallyPrunedSourcePairs(options) {
	if (options.creditSelectionMode === "custom" || options.mediaSelectionMode === "custom") {
		return 0;
	}

	return getMatchedBulkPeopleResults().reduce((total, result) => {
		if (!hasNuvioCreditData(result)) {
			return total;
		}

		const selectedPairKeys = new Set(getNuvioSourcePairs(result, options).map(getNuvioSourcePairKey));

		return (
			total +
			getNuvioUnprunedBaseSourcePairs(result, options).filter(
				(pair) => !selectedPairKeys.has(getNuvioSourcePairKey(pair)),
			).length
		);
	}, 0);
}

function getNuvioSkippedPersonWarningText(options) {
	if (options.creditSelectionMode === "custom" || options.mediaSelectionMode === "custom") {
		return "No source lines selected; this person will be skipped.";
	}

	return "No sources meet the minimum detected credits; this person will be skipped.";
}

function updateNuvioSourceWarning() {
	const warning = document.getElementById("nuvio-source-warning-note");

	if (!warning) {
		return;
	}

	const options = getNuvioExportOptions();
	const missingCount = countNuvioMissingExplicitSourcePairs(options);
	const prunedCount = countNuvioAutomaticallyPrunedSourcePairs(options);
	const exportState = getNuvioExportState(options);
	const skippedCount = exportState.skippedRows.length;
	const allSkipped = Boolean(exportState.rows.length && !exportState.exportableRows.length);
	const customMode = options.creditSelectionMode === "custom" || options.mediaSelectionMode === "custom";
	const messages = [];

	if (allSkipped) {
		messages.push(
			"No exportable people sources were found. Lower the minimum detected credits or choose sources manually before copying or downloading JSON.",
		);
	} else if (skippedCount) {
		messages.push(
			skippedCount === 1
				? "1 person will be skipped because no sources are selected or meet the minimum detected credits."
				: `${skippedCount.toLocaleString()} people will be skipped because no sources are selected or meet the minimum detected credits.`,
		);
	}

	if (prunedCount && !allSkipped) {
		messages.push("Some unavailable source choices were set to None automatically.");
	}

	if (missingCount) {
		messages.push(
			missingCount === 1
				? "1 custom source choice is below the minimum detected credits and may show no results in Nuvio. Export is still allowed."
				: "Some custom source choices are below the minimum detected credits and may show no results in Nuvio. Export is still allowed.",
		);
	}

	if (!messages.length) {
		warning.hidden = true;
		warning.textContent = "";
		warning.classList.remove("nuvio-source-info-note");
		warning.classList.remove("nuvio-source-warning-note");
		return;
	}

	warning.hidden = false;
	warning.textContent = messages.join(" ");

	if (allSkipped || missingCount || (skippedCount && customMode)) {
		warning.classList.add("nuvio-source-warning-note");
		warning.classList.remove("nuvio-source-info-note");
		return;
	}

	warning.classList.add("nuvio-source-info-note");
	warning.classList.remove("nuvio-source-warning-note");
}

function downloadNuvioJson() {
	const matchedPeople = getMatchedBulkPeopleResults();

	if (!matchedPeople.length) {
		return;
	}

	const options = getNuvioExportOptions();
	const exportState = getNuvioExportState(options);

	if (!exportState.exportableRows.length) {
		updateNuvioSourceWarning();
		return;
	}

	const json = JSON.stringify(createNuvioCollectionJson(options, exportState), null, "\t");
	const filename = `${slugifyFilename(options.collectionName)}.nuvio.json`;

	downloadTextFile(filename, `${json}\n`, "application/json");
}

function copyNuvioJson() {
	if (!getMatchedBulkPeopleResults().length) {
		return;
	}

	const options = getNuvioExportOptions();
	const exportState = getNuvioExportState(options);

	if (!exportState.exportableRows.length) {
		updateNuvioSourceWarning();
		return;
	}

	copyText(`${JSON.stringify(createNuvioCollectionJson(options, exportState), null, "\t")}\n`);
}

function initBulkPeopleNuvioExport() {
	document.getElementById("close-nuvio-export-modal").addEventListener("click", closeNuvioExportModal);
	document.getElementById("cancel-nuvio-export").addEventListener("click", closeNuvioExportModal);
	document.getElementById("open-nuvio-import-help").addEventListener("click", openNuvioImportHelpModal);
	document.getElementById("close-nuvio-import-help").addEventListener("click", closeNuvioImportHelpModal);
	document.getElementById("copy-nuvio-json").addEventListener("click", copyNuvioJson);
	document.getElementById("download-nuvio-json").addEventListener("click", downloadNuvioJson);
	document.querySelectorAll('input[name="nuvio-credit-mode"]').forEach((input) => {
		input.addEventListener("change", () => {
			setNuvioCreditSelectionMode(input.value, {
				resetCustom: input.value === "auto",
			});
		});
	});
	document.querySelectorAll('input[name="nuvio-same-credit-source"]').forEach((input) => {
		input.addEventListener("change", () => {
			updateNuvioModeControls();
			renderNuvioPersonOptionsIfNeeded();
		});
	});
	document.querySelectorAll('input[name="nuvio-media-mode"]').forEach((input) => {
		input.addEventListener("change", () => {
			setNuvioMediaSelectionMode(input.value, {
				resetCustom: input.value === "auto",
			});
		});
	});
	document.querySelectorAll('input[name="nuvio-same-media-source"]').forEach((input) => {
		input.addEventListener("change", () => {
			updateNuvioModeControls();
			renderNuvioPersonOptionsIfNeeded();
		});
	});
	document.querySelectorAll('input[name="nuvio-minimum-credits"]').forEach((input) => {
		input.addEventListener("change", () => {
			updateNuvioModeControls();
			renderNuvioPersonOptionsIfNeeded();
		});
	});
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
