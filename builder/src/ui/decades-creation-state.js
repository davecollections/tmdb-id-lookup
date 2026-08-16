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
		label: "Newest throughout",
		decadeOrder: "newest-first",
		yearOrder: "newest-first",
	}),
	Object.freeze({
		id: "oldest-throughout",
		label: "Oldest throughout",
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

function contextDecadeIds(state, contextId) {
	return contextId === "all"
		? state.selectedDecadeIds
		: state.selectedDecadeIds.includes(contextId) ? [contextId] : [];
}

function sharedOrderedNames(nameLists) {
	if (nameLists.length === 0) return Object.freeze([]);
	return Object.freeze(orderedGenreNames(nameLists[0].filter((name) => nameLists.slice(1).every((names) => names.includes(name)))));
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
	const decadeIds = contextDecadeIds(state, contextId);
	return contextId === "all"
		? sharedOrderedNames(decadeIds.map((decadeId) => ordinaryExclusionsForDecade(state, decadeId)))
		: Object.freeze([...(decadeIds[0] ? ordinaryExclusionsForDecade(state, decadeIds[0]) : [])]);
}

export function decadesGenreExclusionsForContext(state, contextId = state.genreContextId) {
	const decadeIds = contextDecadeIds(state, contextId);
	const includedGenreNames = contextId === "all"
		? sharedDecadesGenreNames(state)
		: state.genreNamesByDecade[decadeIds[0]] ?? Object.freeze([]);
	const result = {};
	for (const genreName of includedGenreNames) {
		const names = contextId === "all"
			? sharedOrderedNames(decadeIds.map((decadeId) => genreExclusionsForDecade(state, decadeId)[genreName] ?? []))
			: genreExclusionsForDecade(state, decadeIds[0])[genreName] ?? [];
		if (names.length > 0) result[genreName] = Object.freeze([...names]);
	}
	return Object.freeze(result);
}

function reconcileAdvancedExclusions(state, selectedDecadeIds) {
	const sharedOrdinary = decadesOrdinaryExclusionsForContext(state, "all");
	const sharedByGenre = decadesGenreExclusionsForContext(state, "all");
	const ordinaryExcludedGenresByDecade = {};
	const exclusionsByGenreByDecade = {};
	for (const decadeId of selectedDecadeIds) {
		ordinaryExcludedGenresByDecade[decadeId] = Object.freeze([...(state.advanced.ordinaryExcludedGenresByDecade?.[decadeId] ?? sharedOrdinary)]);
		exclusionsByGenreByDecade[decadeId] = Object.freeze({ ...(state.advanced.exclusionsByGenreByDecade?.[decadeId] ?? sharedByGenre) });
	}
	return Object.freeze({
		...state.advanced,
		ordinaryExcludedGenresByDecade: Object.freeze(ordinaryExcludedGenresByDecade),
		exclusionsByGenreByDecade: Object.freeze(exclusionsByGenreByDecade),
	});
}

function prunePerDecadeGenreExclusions(advanced, genreNamesByDecade, mediaMode) {
	const exclusionsByGenreByDecade = {};
	for (const [decadeId, includedGenreNames] of Object.entries(genreNamesByDecade)) {
		exclusionsByGenreByDecade[decadeId] = pruneGenreExclusionMap(
			advanced.exclusionsByGenreByDecade?.[decadeId] ?? advanced.exclusionsByGenre ?? {},
			includedGenreNames,
			mediaMode,
		);
	}
	return Object.freeze(exclusionsByGenreByDecade);
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
		sortOptionId: DEFAULT_DECADES_SORT_OPTION_ID,
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
		ordinaryExcludedGenresByDecade[decadeId] = Object.freeze(pruneNames(ordinaryExclusionsForDecade(state, decadeId), allowed));
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
	const allowed = compatibleGenreNames(state.mediaMode);
	const names = Object.freeze(orderedGenreNames(pruneNames(genreNames, allowed)));
	const ordinaryExcludedGenresByDecade = { ...(state.advanced.ordinaryExcludedGenresByDecade ?? {}) };
	for (const decadeId of contextDecadeIds(state, contextId)) ordinaryExcludedGenresByDecade[decadeId] = names;
	return Object.freeze({
		...state,
		advanced: Object.freeze({
			...state.advanced,
			ordinaryExcludedGenresByDecade: Object.freeze(ordinaryExcludedGenresByDecade),
		}),
	});
}

export function setDecadesGenreExclusionsForContext(state, exclusionsByGenre, contextId = state.genreContextId) {
	const exclusionsByGenreByDecade = { ...(state.advanced.exclusionsByGenreByDecade ?? {}) };
	const targetIds = contextDecadeIds(state, contextId);
	const sharedOwners = contextId === "all" ? sharedDecadesGenreNames(state) : null;
	for (const decadeId of targetIds) {
		const owners = sharedOwners ?? state.genreNamesByDecade[decadeId] ?? [];
		const current = { ...genreExclusionsForDecade(state, decadeId) };
		for (const owner of owners) {
			const pruned = pruneGenreExclusionMap({ [owner]: exclusionsByGenre?.[owner] ?? [] }, [owner], state.mediaMode)[owner] ?? [];
			if (pruned.length > 0) current[owner] = pruned;
			else delete current[owner];
		}
		exclusionsByGenreByDecade[decadeId] = Object.freeze(current);
	}
	return Object.freeze({
		...state,
		advanced: Object.freeze({
			...state.advanced,
			exclusionsByGenreByDecade: Object.freeze(exclusionsByGenreByDecade),
		}),
	});
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
		sortOptionId: state.sortOptionId,
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
