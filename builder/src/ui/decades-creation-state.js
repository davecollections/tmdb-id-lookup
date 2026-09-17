import {
	createDecadesHierarchyPlan,
	currentDecadePreset,
	DECADE_PRESETS,
	DEFAULT_DECADES_SOURCE_GROUPING,
	DEFAULT_DECADES_SORT_OPTION_ID,
	GENRE_CONCEPTS,
	genreExclusionCompatibility,
	officialGenreConcept,
} from "../source-add/index.js";

export const DECADES_CREATION_STEPS = Object.freeze({
	PRESETS: "presets",
	OPTIONS: "options",
	REVIEW: "review",
});

export const DECADES_DISPLAY_ORDERS = Object.freeze([
	Object.freeze({
		id: "newest-decades-oldest-years",
		label: "Newest Decades, Oldest Years",
		decadeOrder: "newest-first",
		yearOrder: "oldest-first",
	}),
	Object.freeze({
		id: "newest-throughout",
		label: "Newest First",
		decadeOrder: "newest-first",
		yearOrder: "newest-first",
	}),
	Object.freeze({
		id: "oldest-throughout",
		label: "Oldest First",
		decadeOrder: "oldest-first",
		yearOrder: "oldest-first",
	}),
]);

export const DEFAULT_DECADES_DISPLAY_ORDER_ID = DECADES_DISPLAY_ORDERS[0].id;

export const DEFAULT_DECADES_ADVANCED = Object.freeze({
	minimumRating: "",
	maximumRating: "",
	minimumVotes: "",
	originalLanguage: "",
	originCountry: "",
	ordinaryExcludedGenres: Object.freeze([]),
	exclusionsByGenre: Object.freeze({}),
	ordinaryExcludedGenresByDecade: Object.freeze({}),
	exclusionsByGenreByDecade: Object.freeze({}),
});

function compatibleGenreNames(mediaMode) {
	return new Set(GENRE_CONCEPTS.filter((concept) => (
		mediaMode === "movies"
			? concept.movieId !== null
			: mediaMode === "series"
				? concept.tvId !== null
				: concept.movieId !== null || concept.tvId !== null
	)).map((concept) => concept.name));
}

function pruneNames(names, allowed) {
	return (Array.isArray(names) ? names : []).filter((name) => allowed.has(name));
}

function orderedGenreNames(names) {
	const selected = new Set(names);
	return GENRE_CONCEPTS.filter((concept) => selected.has(concept.name)).map((concept) => concept.name);
}

function genreUnion(byDecade) {
	const selected = new Set(Object.values(byDecade).flat());
	return orderedGenreNames(selected);
}

function pruneGenreExclusionMap(sourceExclusions, includedGenreNames, mediaMode) {
	const exclusionsByGenre = {};
	for (const genreName of includedGenreNames) {
		if (Object.hasOwn(sourceExclusions ?? {}, genreName)) {
			exclusionsByGenre[genreName] = Object.freeze(sourceExclusions[genreName]
				.filter((excludedName) => genreExclusionCompatibility(
					excludedName,
					genreName,
					mediaMode === "both" ? "both" : mediaMode,
				).compatible));
		}
	}
	return Object.freeze(exclusionsByGenre);
}

function ordinaryExclusionsForDecade(state, decadeId) {
	return state.advanced.ordinaryExcludedGenresByDecade?.[decadeId]
		?? state.advanced.ordinaryExcludedGenres
		?? Object.freeze([]);
}

function genreExclusionsForDecade(state, decadeId) {
	return state.advanced.exclusionsByGenreByDecade?.[decadeId]
		?? state.advanced.exclusionsByGenre
		?? Object.freeze({});
}

export function decadesOrdinaryExclusionsForContext(state, contextId = state.genreContextId) {
 return Object.freeze([...(contextId === "all" ? state.advanced.ordinaryExcludedGenres ?? [] : ordinaryExclusionsForDecade(state, contextId))]);
}

export function decadesGenreExclusionsForContext(state, contextId = state.genreContextId) {
 return contextId === "all" ? state.advanced.exclusionsByGenre ?? {} : genreExclusionsForDecade(state, contextId);
}

export function setDecadesExclusionInheritance(state, contextId, kind, useDefault = false) {
 if (contextId === "all" || !state.selectedDecadeIds.includes(contextId)) return state;
 const field = kind === "ordinary" ? "ordinaryExcludedGenresByDecade" : "exclusionsByGenreByDecade";
 const overrides = { ...state.advanced[field] };
 if (useDefault) delete overrides[contextId]; else overrides[contextId] = Object.freeze(kind === "ordinary" ? [] : {});
 return Object.freeze({ ...state, advanced: Object.freeze({ ...state.advanced, [field]: Object.freeze(overrides) }) });
}

function reconcileAdvancedExclusions(state, selectedDecadeIds) {
 const retain = (map) => Object.freeze(Object.fromEntries(Object.entries(map ?? {}).filter(([id]) => selectedDecadeIds.includes(id))));
 return Object.freeze({ ...state.advanced,
  ordinaryExcludedGenresByDecade: retain(state.advanced.ordinaryExcludedGenresByDecade),
  exclusionsByGenreByDecade: retain(state.advanced.exclusionsByGenreByDecade),
 });
}

function prunePerDecadeGenreExclusions(advanced, genreNamesByDecade, mediaMode) {
 return Object.freeze(Object.fromEntries(Object.entries(genreNamesByDecade).filter(([id]) => Object.hasOwn(advanced.exclusionsByGenreByDecade ?? {}, id)).map(([id, names]) => [id, pruneGenreExclusionMap(advanced.exclusionsByGenreByDecade[id], names, mediaMode)])));
}

function reconcileGenreSelections(state, selectedDecadeIds) {
	const shared = sharedDecadesGenreNames(state);
	const byDecade = {};
	for (const decadeId of selectedDecadeIds) {
		byDecade[decadeId] = state.genreNamesByDecade[decadeId] ?? Object.freeze([...shared]);
	}
	return Object.freeze(byDecade);
}

export function createDecadesCreationState({
	scope,
	currentYear,
	destinationCollectionInternalId = null,
} = {}) {
	return Object.freeze({
		step: DECADES_CREATION_STEPS.PRESETS,
		scope,
		currentYear,
		destinationCollectionInternalId,
		selectedDecadeIds: Object.freeze([]),
		mediaMode: "both",
		layout: "separate-media-collections",
		content: Object.freeze({
			wholeDecade: false,
			individualYears: true,
			genreBreakdown: false,
		}),
		currentYearMode: "full-decade",
		genreNamesByDecade: Object.freeze({}),
		genreContextId: "all",
		sortOptionIds: Object.freeze([DEFAULT_DECADES_SORT_OPTION_ID]),
		decadeOrder: "newest-first",
		yearOrder: "oldest-first",
		sourceGrouping: DEFAULT_DECADES_SOURCE_GROUPING,
		advanced: DEFAULT_DECADES_ADVANCED,
		viewMode: "TABBED_GRID",
		showAllTab: true,
		pinToTop: false,
		hideCollectionTitle: false,
		folderTileShape: "POSTER",
		folderTitleVisibility: "SHOW_EVERYWHERE",
		collectionTitles: Object.freeze({}),
	});
}

export function selectedDecadesDisplayOrderId(state) {
	return DECADES_DISPLAY_ORDERS.find((option) => (
		option.decadeOrder === state.decadeOrder && option.yearOrder === state.yearOrder
	))?.id ?? null;
}

export function updateDecadesDisplayOrder(state, displayOrderId) {
	const option = DECADES_DISPLAY_ORDERS.find((entry) => entry.id === displayOrderId);
	if (!option) return state;
	return Object.freeze({
		...state,
		decadeOrder: option.decadeOrder,
		yearOrder: option.yearOrder,
	});
}

export function toggleDecadePreset(state, decadeId) {
	if (!DECADE_PRESETS.some((preset) => preset.id === decadeId)) return state;
	const selected = new Set(state.selectedDecadeIds);
	if (selected.has(decadeId)) selected.delete(decadeId);
	else selected.add(decadeId);
	const selectedDecadeIds = DECADE_PRESETS
		.filter((preset) => selected.has(preset.id))
		.map((preset) => preset.id);
	return Object.freeze({
		...state,
		selectedDecadeIds: Object.freeze(selectedDecadeIds),
		genreNamesByDecade: reconcileGenreSelections(state, selectedDecadeIds),
		advanced: reconcileAdvancedExclusions(state, selectedDecadeIds),
		genreContextId: state.genreContextId !== "all" && !selected.has(state.genreContextId)
			? "all"
			: state.genreContextId,
	});
}

export function selectAllDecadePresets(state) {
	const selectedDecadeIds = DECADE_PRESETS.map((preset) => preset.id);
	return Object.freeze({
		...state,
		selectedDecadeIds: Object.freeze(selectedDecadeIds),
		genreNamesByDecade: reconcileGenreSelections(state, selectedDecadeIds),
		advanced: reconcileAdvancedExclusions(state, selectedDecadeIds),
	});
}

export function clearAllDecadePresets(state) {
	return Object.freeze({
		...state,
		selectedDecadeIds: Object.freeze([]),
		genreNamesByDecade: Object.freeze({}),
		advanced: Object.freeze({
			...state.advanced,
			ordinaryExcludedGenresByDecade: Object.freeze({}),
			exclusionsByGenreByDecade: Object.freeze({}),
		}),
		genreContextId: "all",
	});
}

export function sharedDecadesGenreNames(state) {
	if (state.selectedDecadeIds.length === 0) return Object.freeze([]);
	const [firstId, ...otherIds] = state.selectedDecadeIds;
	return Object.freeze((state.genreNamesByDecade[firstId] ?? []).filter((genreName) => (
		otherIds.every((decadeId) => (state.genreNamesByDecade[decadeId] ?? []).includes(genreName))
	)));
}

export function includedDecadesGenreNames(state) {
	return Object.freeze(genreUnion(state.genreNamesByDecade));
}

export function decadesGenreSelectionForContext(state, contextId = state.genreContextId) {
	return contextId === "all"
		? sharedDecadesGenreNames(state)
		: Object.freeze([...(state.genreNamesByDecade[contextId] ?? [])]);
}

export function decadesGenreConfigurationValid(state) {
	return !state.content.genreBreakdown || state.selectedDecadeIds.every((decadeId) => (
		(state.genreNamesByDecade[decadeId] ?? []).length > 0
	));
}

export function updateDecadesCreationMedia(state, mediaMode) {
	const allowed = compatibleGenreNames(mediaMode);
	const genreNamesByDecade = {};
	for (const decadeId of state.selectedDecadeIds) {
		genreNamesByDecade[decadeId] = Object.freeze(pruneNames(state.genreNamesByDecade[decadeId], allowed));
	}
	const genreNames = genreUnion(genreNamesByDecade);
	const ordinaryExcludedGenresByDecade = {};
	for (const decadeId of state.selectedDecadeIds) {
		if (Object.hasOwn(state.advanced.ordinaryExcludedGenresByDecade ?? {}, decadeId)) ordinaryExcludedGenresByDecade[decadeId] = Object.freeze(pruneNames(ordinaryExclusionsForDecade(state, decadeId), allowed));
	}
	return Object.freeze({
		...state,
		mediaMode,
		collectionTitles: mediaMode === state.mediaMode ? state.collectionTitles : Object.freeze({}),
		genreNamesByDecade: Object.freeze(genreNamesByDecade),
		advanced: Object.freeze({
			...state.advanced,
			ordinaryExcludedGenres: Object.freeze(pruneNames(state.advanced.ordinaryExcludedGenres, allowed)),
			exclusionsByGenre: pruneGenreExclusionMap(state.advanced.exclusionsByGenre, genreNames, mediaMode),
			ordinaryExcludedGenresByDecade: Object.freeze(ordinaryExcludedGenresByDecade),
			exclusionsByGenreByDecade: prunePerDecadeGenreExclusions(state.advanced, genreNamesByDecade, mediaMode),
		}),
	});
}

export function toggleDecadesGenre(state, genreName, contextId = state.genreContextId) {
	const concept = officialGenreConcept(genreName);
	if (concept === null || !compatibleGenreNames(state.mediaMode).has(genreName)) return state;
	if (contextId !== "all" && !state.selectedDecadeIds.includes(contextId)) return state;
	const byDecade = {};
	const selectedEverywhere = state.selectedDecadeIds.length > 0 && state.selectedDecadeIds.every((decadeId) => (
		(state.genreNamesByDecade[decadeId] ?? []).includes(genreName)
	));
	for (const decadeId of state.selectedDecadeIds) {
		const selected = new Set(state.genreNamesByDecade[decadeId] ?? []);
		if (contextId === "all") {
			if (selectedEverywhere) selected.delete(genreName);
			else selected.add(genreName);
		} else if (decadeId === contextId) {
			if (selected.has(genreName)) selected.delete(genreName);
			else selected.add(genreName);
		}
		byDecade[decadeId] = Object.freeze(orderedGenreNames(selected));
	}
	const includedGenreNames = genreUnion(byDecade);
	return Object.freeze({
		...state,
		genreNamesByDecade: Object.freeze(byDecade),
		advanced: Object.freeze({
			...state.advanced,
			exclusionsByGenre: pruneGenreExclusionMap(state.advanced.exclusionsByGenre, includedGenreNames, state.mediaMode),
			exclusionsByGenreByDecade: prunePerDecadeGenreExclusions(state.advanced, byDecade, state.mediaMode),
		}),
	});
}

export function setDecadesGenresForContext(state, genreNames, contextId = state.genreContextId) {
	const allowed = compatibleGenreNames(state.mediaMode);
	const nextNames = orderedGenreNames(pruneNames(genreNames, allowed));
	const byDecade = {};
	for (const decadeId of state.selectedDecadeIds) {
		byDecade[decadeId] = contextId === "all" || contextId === decadeId
			? Object.freeze([...nextNames])
			: state.genreNamesByDecade[decadeId] ?? Object.freeze([]);
	}
	const includedGenreNames = genreUnion(byDecade);
	return Object.freeze({
		...state,
		genreNamesByDecade: Object.freeze(byDecade),
		advanced: Object.freeze({
			...state.advanced,
			exclusionsByGenre: pruneGenreExclusionMap(state.advanced.exclusionsByGenre, includedGenreNames, state.mediaMode),
			exclusionsByGenreByDecade: prunePerDecadeGenreExclusions(state.advanced, byDecade, state.mediaMode),
		}),
	});
}

export function setDecadesOrdinaryExclusionsForContext(state, genreNames, contextId = state.genreContextId) {
 const names = Object.freeze(orderedGenreNames(pruneNames(genreNames, compatibleGenreNames(state.mediaMode))));
 const patch = contextId === "all" ? { ordinaryExcludedGenres: names } : { ordinaryExcludedGenresByDecade: Object.freeze({ ...state.advanced.ordinaryExcludedGenresByDecade, [contextId]: names }) };
 return Object.freeze({ ...state, advanced: Object.freeze({ ...state.advanced, ...patch }) });
}

export function setDecadesGenreExclusionsForContext(state, exclusionsByGenre, contextId = state.genreContextId) {
 const owners = contextId === "all" ? includedDecadesGenreNames(state) : state.genreNamesByDecade[contextId] ?? [];
 const value = pruneGenreExclusionMap(exclusionsByGenre, owners, state.mediaMode);
 const patch = contextId === "all" ? { exclusionsByGenre: value } : { exclusionsByGenreByDecade: Object.freeze({ ...state.advanced.exclusionsByGenreByDecade, [contextId]: value }) };
 return Object.freeze({ ...state, advanced: Object.freeze({ ...state.advanced, ...patch }) });
}

export function selectedCurrentDecade(state) {
	const preset = currentDecadePreset(state.currentYear);
	return preset && state.selectedDecadeIds.includes(preset.id) ? preset : null;
}

export function buildDecadesCreationPlan(project, projectRevision, state) {
	const currentPresetSelected = selectedCurrentDecade(state) !== null;
	const source = {
		selectedDecadeIds: state.selectedDecadeIds,
		mediaMode: state.mediaMode,
		content: state.content,
		currentYear: state.currentYear,
		currentYearMode: state.content.individualYears && currentPresetSelected
			? "full-decade"
			: null,
		sortOptionIds: state.sortOptionIds,
		genreNamesByDecade: state.content.genreBreakdown ? state.genreNamesByDecade : {},
		decadeOrder: state.decadeOrder,
		yearOrder: state.yearOrder,
		sourceGrouping: state.sourceGrouping,
		advanced: {
			...state.advanced,
			exclusionsByGenre: state.content.genreBreakdown ? state.advanced.exclusionsByGenre : {},
			exclusionsByGenreByDecade: state.content.genreBreakdown ? state.advanced.exclusionsByGenreByDecade : {},
		},
	};
	return createDecadesHierarchyPlan(project, {
		scope: state.scope,
		projectRevision,
		...(state.scope === "new-folder" ? {
			destinationCollectionInternalId: state.destinationCollectionInternalId,
		} : {}),
		layout: state.scope === "new-collection" && state.mediaMode === "both" ? state.layout : null,
		viewMode: state.scope === "new-collection" ? state.viewMode : null,
		showAllTab: state.scope === "new-collection" ? state.showAllTab : null,
		pinToTop: state.scope === "new-collection" ? state.pinToTop : null,
		hideCollectionTitle: state.scope === "new-collection" ? state.hideCollectionTitle : null,
		folderTileShape: state.folderTileShape,
		folderTitleVisibility: state.folderTitleVisibility,
		collectionTitles: state.scope === "new-collection" ? state.collectionTitles : {},
		source,
	});
}

export function defaultCollectionTitlesFor(state) {
	if (state.mediaMode === "movies") return Object.freeze({ movies: "Movie Decades" });
	if (state.mediaMode === "series") return Object.freeze({ series: "TV Decades" });
	if (state.layout === "mixed-collection") return Object.freeze({ mixed: "Decades" });
	return Object.freeze({ movies: "Movie Decades", series: "TV Decades" });
}

export function prepareDecadesReview(state) {
	return Object.freeze({
		...state,
		step: DECADES_CREATION_STEPS.REVIEW,
		collectionTitles: state.scope === "new-collection"
			? Object.freeze({ ...defaultCollectionTitlesFor(state), ...state.collectionTitles })
			: Object.freeze({}),
	});
}
