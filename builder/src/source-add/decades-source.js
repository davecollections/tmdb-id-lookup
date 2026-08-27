import {
	buildDiscoverSourceDraft,
	DEFAULT_DISCOVER_SORT_OPTION_ID,
	DISCOVER_SORT_OPTIONS,
	discoverSourceIdentity,
	discoverSourceNodeIdentity,
} from "../nuvio/discover.js";
import {
	DECADE_CURRENT_YEAR_MODES,
	DECADE_PRESETS,
	DECADE_SOURCE_PERIODS,
	DEFAULT_DECADE_CURRENT_YEAR_MODE,
	currentDecadePreset,
	decadeIndividualPeriods,
	decadeSourcePeriodById,
	decadeSourcePeriodChoices,
} from "./decades-catalogue.js";
import { equalDecadesStructures } from "./decades-structural.js";
import { GENRE_CONCEPTS, officialGenreConcept } from "./genre-catalogue.js";

export const DECADES_MEDIA_MODES = Object.freeze([
	Object.freeze({ id: "movies", label: "Movies", mediaTypes: Object.freeze(["MOVIE"]) }),
	Object.freeze({ id: "series", label: "Series", mediaTypes: Object.freeze(["TV"]) }),
	Object.freeze({ id: "both", label: "Both", mediaTypes: Object.freeze(["MOVIE", "TV"]) }),
]);

export const DECADES_SORT_OPTIONS = Object.freeze(DISCOVER_SORT_OPTIONS.map((option) => Object.freeze({
	id: option.id,
	label: option.label === "Top rated" ? "Top Rated" : option.label === "Most voted" ? "Most Votes" : option.label,
})));

export const DEFAULT_DECADES_SORT_OPTION_ID = DEFAULT_DISCOVER_SORT_OPTION_ID;

export const DECADES_CHRONOLOGICAL_ORDERS = Object.freeze([
	Object.freeze({ id: "oldest-first", label: "Oldest to newest" }),
	Object.freeze({ id: "newest-first", label: "Newest to oldest" }),
]);

export const DEFAULT_DECADES_CHRONOLOGICAL_ORDER = DECADES_CHRONOLOGICAL_ORDERS[0].id;

export const DECADES_SOURCE_GROUPINGS = Object.freeze([
	Object.freeze({ id: "movies-first", label: "Movies first" }),
	Object.freeze({ id: "paired", label: "Pair Movies & Series" }),
]);

export const DEFAULT_DECADES_SOURCE_GROUPING = DECADES_SOURCE_GROUPINGS[0].id;

export const DEFAULT_DECADES_CONTENT = Object.freeze({
	wholeDecade: true,
	individualYears: false,
	genreBreakdown: false,
});

export const DECADES_ADVANCED_FILTER_FIELDS = Object.freeze([
	"voteAverageGte",
	"voteAverageLte",
	"voteCountGte",
	"withOriginalLanguage",
	"withOriginCountry",
	"withoutGenres",
]);

export const DEFAULT_DECADE_SOURCE_ADVANCED = Object.freeze({
	minimumRating: "",
	maximumRating: "",
	minimumVotes: "",
	originalLanguage: "",
	originCountry: "",
	ordinaryExcludedGenres: Object.freeze([]),
	exclusionsByGenre: Object.freeze({}),
});

const CONFIGURATION_KEYS = new Set([
	"selectedDecadeIds",
	"mediaMode",
	"content",
	"currentYear",
	"currentYearMode",
	"sortOptionId",
	"genreNames",
	"genreNamesByDecade",
	"decadeOrder",
	"yearOrder",
	"sourceGrouping",
	"advanced",
]);
const CONTENT_KEYS = new Set(Object.keys(DEFAULT_DECADES_CONTENT));
const ADVANCED_KEYS = new Set([
	"minimumRating",
	"maximumRating",
	"minimumVotes",
	"originalLanguage",
	"originCountry",
	"ordinaryExcludedGenres",
	"exclusionsByGenre",
	"ordinaryExcludedGenresByDecade",
	"exclusionsByGenreByDecade",
]);

function diagnostic(code, path, message) {
	return Object.freeze({ code, path, message });
}

function plainObject(value) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

function hasOnlyKeys(value, keys) {
	return plainObject(value) && Object.keys(value).every((key) => keys.has(key));
}

function optionalNumber(value, { path, label, minimum, maximum, integer = false }, errors) {
	if (value === undefined || value === null || value === "") return null;
	const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
	if (!Number.isFinite(parsed) || (integer && !Number.isSafeInteger(parsed)) || parsed < minimum || parsed > maximum) {
		errors.push(diagnostic(
			integer ? "INVALID_DECADES_ADVANCED_INTEGER" : "INVALID_DECADES_ADVANCED_NUMBER",
			path,
			`${label} must be ${integer ? "a whole number" : "a number"} from ${minimum} to ${maximum}.`,
		));
		return null;
	}
	return parsed;
}

function officialGenreNames(values, path, errors, { allowEmpty = true } = {}) {
	if (!Array.isArray(values) || (!allowEmpty && values.length === 0) || values.some((_, index) => !Object.hasOwn(values, index))) {
		errors.push(diagnostic("INVALID_DECADES_GENRES", path, allowEmpty
			? "Genre selections must be a dense array of official Genre names."
			: "Choose at least one official Genre for Genre breakdown."));
		return [];
	}
	const names = values.map((entry) => typeof entry === "string" ? entry : "");
	if (new Set(names).size !== names.length || names.some((name) => officialGenreConcept(name) === null)) {
		errors.push(diagnostic("INVALID_DECADES_GENRES", path, "Choose each official Genre at most once."));
		return [];
	}
	return names;
}

function normalizedGenreConfiguration(value, orderedSelectedIds, content, media, errors) {
	const hasShared = Object.hasOwn(value, "genreNames") && value.genreNames !== undefined;
	const hasByDecade = Object.hasOwn(value, "genreNamesByDecade") && value.genreNamesByDecade !== undefined;
	if (hasShared && hasByDecade) {
		errors.push(diagnostic(
			"AMBIGUOUS_DECADES_GENRES",
			"$decades.genreNamesByDecade",
			"Use either the shared Genre selection or per-Decade Genre selections, not both.",
		));
	}

	const byDecade = {};
	if (!content.genreBreakdown) {
		const shared = hasShared
			? officialGenreNames(value.genreNames, "$decades.genreNames", errors)
			: [];
		if (shared.length > 0) {
			errors.push(diagnostic("UNEXPECTED_DECADES_GENRES", "$decades.genreNames", "Genre selections require Genre breakdown to be enabled."));
		}
		if (hasByDecade) {
			if (!plainObject(value.genreNamesByDecade)) {
				errors.push(diagnostic("INVALID_DECADES_GENRES_BY_DECADE", "$decades.genreNamesByDecade", "Per-Decade Genre selections must be keyed by selected Decade."));
			} else if (Object.keys(value.genreNamesByDecade).length > 0) {
				errors.push(diagnostic("UNEXPECTED_DECADES_GENRES", "$decades.genreNamesByDecade", "Genre selections require Genre breakdown to be enabled."));
			}
		}
		return Object.freeze({ byDecade: Object.freeze({}), union: Object.freeze([]) });
	}

	if (hasByDecade) {
		const supplied = value.genreNamesByDecade;
		if (!plainObject(supplied)) {
			errors.push(diagnostic("INVALID_DECADES_GENRES_BY_DECADE", "$decades.genreNamesByDecade", "Per-Decade Genre selections must be keyed by selected Decade."));
		} else {
			const suppliedIds = Object.keys(supplied);
			if (
				suppliedIds.some((id) => !orderedSelectedIds.includes(id))
				|| orderedSelectedIds.some((id) => !Object.hasOwn(supplied, id))
			) {
				errors.push(diagnostic("INVALID_DECADES_GENRES_BY_DECADE", "$decades.genreNamesByDecade", "Provide one Genre selection for every selected Decade and no others."));
			}
			for (const decadeId of orderedSelectedIds) {
				byDecade[decadeId] = Object.freeze(officialGenreNames(
					supplied[decadeId] ?? [],
					`$decades.genreNamesByDecade.${decadeId}`,
					errors,
					{ allowEmpty: false },
				));
			}
		}
	} else {
		const shared = officialGenreNames(value.genreNames ?? [], "$decades.genreNames", errors, { allowEmpty: false });
		for (const decadeId of orderedSelectedIds) byDecade[decadeId] = Object.freeze([...shared]);
	}

	if (media) {
		for (const decadeId of orderedSelectedIds) {
			for (const [index, genreName] of (byDecade[decadeId] ?? []).entries()) {
				const concept = officialGenreConcept(genreName);
				const available = concept !== null && media.mediaTypes.some((mediaType) => (
					mediaType === "MOVIE" ? concept.movieId !== null : concept.tvId !== null
				));
				if (!available) {
					errors.push(diagnostic(
						"DECADES_GENRE_UNAVAILABLE_FOR_MEDIA",
						hasByDecade
							? `$decades.genreNamesByDecade.${decadeId}[${index}]`
							: `$decades.genreNames[${index}]`,
						`${genreName} is not available for ${media.label}.`,
					));
				}
			}
		}
	}

	const selected = new Set(Object.values(byDecade).flat());
	const union = GENRE_CONCEPTS.filter((concept) => selected.has(concept.name)).map((concept) => concept.name);
	return Object.freeze({ byDecade: Object.freeze(byDecade), union: Object.freeze(union) });
}

function normalizeChoice(value, choices, fallback, path, message, errors) {
	const selected = value ?? fallback;
	if (!choices.some((choice) => choice.id === selected)) {
		errors.push(diagnostic("INVALID_DECADES_ORDERING", path, message));
	}
	return selected;
}

function normalizeAdvanced(value, genreNames, genreNamesByDecade, selectedDecadeIds, errors) {
	const supplied = value ?? {};
	if (!hasOnlyKeys(supplied, ADVANCED_KEYS)) {
		errors.push(diagnostic("UNSUPPORTED_DECADES_ADVANCED_FIELD", "$decades.advanced", "Decades Advanced settings contain an unsupported field."));
	}
	const minimumRating = optionalNumber(supplied.minimumRating, {
		path: "$decades.advanced.minimumRating", label: "Minimum rating", minimum: 0, maximum: 10,
	}, errors);
	const maximumRating = optionalNumber(supplied.maximumRating, {
		path: "$decades.advanced.maximumRating", label: "Maximum rating", minimum: 0, maximum: 10,
	}, errors);
	const minimumVotes = optionalNumber(supplied.minimumVotes, {
		path: "$decades.advanced.minimumVotes", label: "Minimum votes", minimum: 0, maximum: Number.MAX_SAFE_INTEGER, integer: true,
	}, errors);
	if (minimumRating !== null && maximumRating !== null && minimumRating > maximumRating) {
		errors.push(diagnostic("INVALID_DECADES_ADVANCED_RATING_RANGE", "$decades.advanced.maximumRating", "Maximum rating must be the same as or higher than Minimum rating."));
	}
	const originalLanguage = supplied.originalLanguage === undefined || supplied.originalLanguage === null
		? ""
		: typeof supplied.originalLanguage === "string" ? supplied.originalLanguage.trim().toLowerCase() : "invalid";
	const originCountry = supplied.originCountry === undefined || supplied.originCountry === null
		? ""
		: typeof supplied.originCountry === "string" ? supplied.originCountry.trim().toUpperCase() : "invalid";
	if (originalLanguage && !/^[a-z]{2}$/.test(originalLanguage)) {
		errors.push(diagnostic("INVALID_DECADES_ADVANCED_LANGUAGE", "$decades.advanced.originalLanguage", "Original language must be a two-letter code."));
	}
	if (originCountry && !/^[A-Z]{2}$/.test(originCountry)) {
		errors.push(diagnostic("INVALID_DECADES_ADVANCED_COUNTRY", "$decades.advanced.originCountry", "Origin country must be a two-letter code."));
	}
	const ordinaryExcludedGenres = officialGenreNames(
		supplied.ordinaryExcludedGenres ?? [],
		"$decades.advanced.ordinaryExcludedGenres",
		errors,
	);
	const exclusionsByGenre = {};
	const suppliedByGenre = supplied.exclusionsByGenre ?? {};
	if (!plainObject(suppliedByGenre)) {
		errors.push(diagnostic("INVALID_DECADES_GENRE_EXCLUSIONS", "$decades.advanced.exclusionsByGenre", "Per-Genre exclusions must be keyed by selected official Genre."));
	} else {
		for (const [includedGenre, excludedValues] of Object.entries(suppliedByGenre)) {
			const path = `$decades.advanced.exclusionsByGenre.${includedGenre || "unknown"}`;
			if (!genreNames.includes(includedGenre)) {
				errors.push(diagnostic("INVALID_DECADES_GENRE_EXCLUSION_OWNER", path, "Per-Genre exclusions require a selected breakdown Genre."));
				continue;
			}
			const exclusions = officialGenreNames(excludedValues, path, errors);
			if (exclusions.includes(includedGenre)) {
				errors.push(diagnostic("DECADES_GENRE_SELF_EXCLUSION", path, "A Genre source cannot include and exclude the same Genre."));
			}
			exclusionsByGenre[includedGenre] = Object.freeze(exclusions);
		}
	}
	const hasOrdinaryByDecade = Object.hasOwn(supplied, "ordinaryExcludedGenresByDecade");
	const ordinaryExcludedGenresByDecade = {};
	const suppliedOrdinaryByDecade = supplied.ordinaryExcludedGenresByDecade ?? {};
	if (hasOrdinaryByDecade && !plainObject(suppliedOrdinaryByDecade)) {
		errors.push(diagnostic("INVALID_DECADES_EXCLUSIONS_BY_DECADE", "$decades.advanced.ordinaryExcludedGenresByDecade", "Per-Decade exclusions must be keyed by selected Decade."));
	} else if (plainObject(suppliedOrdinaryByDecade)) {
		for (const [decadeId, excludedValues] of Object.entries(suppliedOrdinaryByDecade)) {
			const path = `$decades.advanced.ordinaryExcludedGenresByDecade.${decadeId || "unknown"}`;
			if (!selectedDecadeIds.includes(decadeId)) {
				errors.push(diagnostic("INVALID_DECADES_EXCLUSION_DECADE", path, "Per-Decade exclusions require a selected Decade."));
				continue;
			}
			ordinaryExcludedGenresByDecade[decadeId] = Object.freeze(officialGenreNames(excludedValues, path, errors));
		}
	}
	const hasGenreByDecade = Object.hasOwn(supplied, "exclusionsByGenreByDecade");
	const exclusionsByGenreByDecade = {};
	const suppliedGenreByDecade = supplied.exclusionsByGenreByDecade ?? {};
	if (hasGenreByDecade && !plainObject(suppliedGenreByDecade)) {
		errors.push(diagnostic("INVALID_DECADES_GENRE_EXCLUSIONS_BY_DECADE", "$decades.advanced.exclusionsByGenreByDecade", "Per-Genre exclusions by Decade must be keyed by selected Decade."));
	} else if (plainObject(suppliedGenreByDecade)) {
		for (const [decadeId, suppliedForDecade] of Object.entries(suppliedGenreByDecade)) {
			const decadePath = `$decades.advanced.exclusionsByGenreByDecade.${decadeId || "unknown"}`;
			if (!selectedDecadeIds.includes(decadeId)) {
				errors.push(diagnostic("INVALID_DECADES_EXCLUSION_DECADE", decadePath, "Per-Decade exclusions require a selected Decade."));
				continue;
			}
			if (!plainObject(suppliedForDecade)) {
				errors.push(diagnostic("INVALID_DECADES_GENRE_EXCLUSIONS_BY_DECADE", decadePath, "Per-Genre exclusions for a Decade must be keyed by selected official Genre."));
				continue;
			}
			const normalizedForDecade = {};
			for (const [includedGenre, excludedValues] of Object.entries(suppliedForDecade)) {
				const path = `${decadePath}.${includedGenre || "unknown"}`;
				if (!(genreNamesByDecade[decadeId] ?? []).includes(includedGenre)) {
					errors.push(diagnostic("INVALID_DECADES_GENRE_EXCLUSION_OWNER", path, "Per-Genre exclusions require a selected breakdown Genre in that Decade."));
					continue;
				}
				const exclusions = officialGenreNames(excludedValues, path, errors);
				if (exclusions.includes(includedGenre)) errors.push(diagnostic("DECADES_GENRE_SELF_EXCLUSION", path, "A Genre source cannot include and exclude the same Genre."));
				normalizedForDecade[includedGenre] = Object.freeze(exclusions);
			}
			exclusionsByGenreByDecade[decadeId] = Object.freeze(normalizedForDecade);
		}
	}
	return Object.freeze({
		minimumRating,
		maximumRating,
		minimumVotes,
		originalLanguage,
		originCountry,
		ordinaryExcludedGenres: Object.freeze(ordinaryExcludedGenres),
		exclusionsByGenre: Object.freeze(exclusionsByGenre),
		...(hasOrdinaryByDecade ? { ordinaryExcludedGenresByDecade: Object.freeze(ordinaryExcludedGenresByDecade) } : {}),
		...(hasGenreByDecade ? { exclusionsByGenreByDecade: Object.freeze(exclusionsByGenreByDecade) } : {}),
	});
}

export function normalizeDecadesSourceConfiguration(value) {
	const errors = [];
	if (!hasOnlyKeys(value, CONFIGURATION_KEYS)) {
		return Object.freeze({
			ok: false,
			configuration: null,
			errors: Object.freeze([diagnostic("INVALID_DECADES_CONFIGURATION", "$decades", "Decades planning requires only the supported configuration fields.")]),
		});
	}

	const selectedValues = value.selectedDecadeIds;
	if (!Array.isArray(selectedValues) || selectedValues.length < 1 || selectedValues.some((_, index) => !Object.hasOwn(selectedValues, index))) {
		errors.push(diagnostic("INVALID_DECADES_SELECTION", "$decades.selectedDecadeIds", "Choose at least one Decade preset."));
	}
	const selectedIds = Array.isArray(selectedValues) ? selectedValues.map((entry) => typeof entry === "string" ? entry : "") : [];
	if (new Set(selectedIds).size !== selectedIds.length || selectedIds.some((id) => !DECADE_PRESETS.some((preset) => preset.id === id))) {
		errors.push(diagnostic("INVALID_DECADES_SELECTION", "$decades.selectedDecadeIds", "Choose each supported Decade preset at most once."));
	}
	const orderedSelectedIds = DECADE_PRESETS.filter((preset) => selectedIds.includes(preset.id)).map((preset) => preset.id);

	const media = DECADES_MEDIA_MODES.find((entry) => entry.id === value.mediaMode);
	if (!media) errors.push(diagnostic("INVALID_DECADES_MEDIA", "$decades.mediaMode", "Choose Movies, Series, or Both."));

	const suppliedContent = value.content ?? DEFAULT_DECADES_CONTENT;
	if (!hasOnlyKeys(suppliedContent, CONTENT_KEYS) || [...CONTENT_KEYS].some((key) => typeof suppliedContent[key] !== "boolean")) {
		errors.push(diagnostic("INVALID_DECADES_CONTENT", "$decades.content", "Decades content choices must be explicit boolean values."));
	}
	const content = Object.freeze({
		wholeDecade: suppliedContent.wholeDecade === true,
		individualYears: suppliedContent.individualYears === true,
		genreBreakdown: suppliedContent.genreBreakdown === true,
	});
	if (!content.wholeDecade && !content.individualYears && !content.genreBreakdown) {
		errors.push(diagnostic("EMPTY_DECADES_CONTENT", "$decades.content", "Enable Decade overview, Individual years, or Genre breakdown."));
	}

	if (!Number.isInteger(value.currentYear) || value.currentYear < 1000 || value.currentYear > 9999) {
		errors.push(diagnostic("INVALID_DECADES_CURRENT_YEAR", "$decades.currentYear", "Supply the current year as a deterministic four-digit integer."));
	}
	const selectedCurrentPreset = currentDecadePreset(value.currentYear);
	const currentYearModeMeaningful = content.individualYears
		&& selectedCurrentPreset !== null
		&& orderedSelectedIds.includes(selectedCurrentPreset.id);
	let currentYearMode = value.currentYearMode ?? (currentYearModeMeaningful ? DEFAULT_DECADE_CURRENT_YEAR_MODE : null);
	if (currentYearModeMeaningful && !DECADE_CURRENT_YEAR_MODES.some((entry) => entry.id === currentYearMode)) {
		errors.push(diagnostic("INVALID_DECADES_CURRENT_YEAR_MODE", "$decades.currentYearMode", "Choose a supported current-decade year mode."));
	}
	if (!currentYearModeMeaningful && currentYearMode !== null) {
		errors.push(diagnostic("UNEXPECTED_DECADES_CURRENT_YEAR_MODE", "$decades.currentYearMode", "Current-year mode is only valid when Individual years includes the current Decade."));
		currentYearMode = null;
	}

	const sortOptionId = value.sortOptionId ?? DEFAULT_DECADES_SORT_OPTION_ID;
	if (!DECADES_SORT_OPTIONS.some((option) => option.id === sortOptionId)) {
		errors.push(diagnostic("INVALID_DECADES_SORT", "$decades.sortOptionId", "Choose a supported Decades sort order."));
	}
	const genres = normalizedGenreConfiguration(value, orderedSelectedIds, content, media, errors);
	const advanced = normalizeAdvanced(value.advanced, genres.union, genres.byDecade, orderedSelectedIds, errors);
	if (!content.genreBreakdown && Object.keys(advanced.exclusionsByGenre).length > 0) {
		errors.push(diagnostic("UNEXPECTED_DECADES_GENRE_EXCLUSIONS", "$decades.advanced.exclusionsByGenre", "Per-Genre exclusions require Genre breakdown to be enabled."));
	}
	if (!content.genreBreakdown && Object.values(advanced.exclusionsByGenreByDecade ?? {}).some((entry) => Object.keys(entry).length > 0)) {
		errors.push(diagnostic("UNEXPECTED_DECADES_GENRE_EXCLUSIONS", "$decades.advanced.exclusionsByGenreByDecade", "Per-Genre exclusions require Genre breakdown to be enabled."));
	}
	const decadeOrder = normalizeChoice(
		value.decadeOrder,
		DECADES_CHRONOLOGICAL_ORDERS,
		DEFAULT_DECADES_CHRONOLOGICAL_ORDER,
		"$decades.decadeOrder",
		"Choose oldest-to-newest or newest-to-oldest Decade order.",
		errors,
	);
	const yearOrder = normalizeChoice(
		value.yearOrder,
		DECADES_CHRONOLOGICAL_ORDERS,
		DEFAULT_DECADES_CHRONOLOGICAL_ORDER,
		"$decades.yearOrder",
		"Choose oldest-to-newest or newest-to-oldest year order.",
		errors,
	);
	const sourceGrouping = normalizeChoice(
		value.sourceGrouping,
		DECADES_SOURCE_GROUPINGS,
		DEFAULT_DECADES_SOURCE_GROUPING,
		"$decades.sourceGrouping",
		"Choose Movies first or paired Movies and Series source grouping.",
		errors,
	);

	return Object.freeze({
		ok: errors.length === 0,
		configuration: errors.length === 0 ? Object.freeze({
			selectedDecadeIds: Object.freeze(orderedSelectedIds),
			mediaMode: media.id,
			content,
			currentYear: value.currentYear,
			currentYearMode,
			sortOptionId,
			genreNamesByDecade: genres.byDecade,
			decadeOrder,
			yearOrder,
			sourceGrouping,
			advanced,
		}) : null,
		errors: Object.freeze(errors),
	});
}

function baseAdvancedFilters(advanced) {
	const filters = {};
	if (advanced.minimumRating !== null) filters.voteAverageGte = advanced.minimumRating;
	if (advanced.maximumRating !== null) filters.voteAverageLte = advanced.maximumRating;
	if (advanced.minimumVotes !== null) filters.voteCountGte = advanced.minimumVotes;
	if (advanced.originalLanguage) filters.withOriginalLanguage = advanced.originalLanguage;
	if (advanced.originCountry) filters.withOriginCountry = advanced.originCountry;
	return filters;
}

function exclusionIds(names, mediaType) {
	return names
		.map((name) => officialGenreConcept(name))
		.map((concept) => mediaType === "MOVIE" ? concept.movieId : concept.tvId)
		.filter((tmdbId) => tmdbId !== null);
}

function mediaLabel(mediaType) {
	return mediaType === "MOVIE" ? "Movies" : "Series";
}

function buildEntry({ title, mediaType, sortOptionId, filters, contentKind, period, genreName = null }) {
	const built = buildDiscoverSourceDraft({ title, mediaType, sortOptionId, filters });
	if (!built.ok) return { entry: null, errors: built.errors };
	return {
		entry: Object.freeze({
			contentKind,
			period,
			genreName,
			draft: Object.freeze(built.draft),
		}),
		errors: [],
	};
}

export const DEFAULT_DECADE_SOURCE_PERIOD_ID = "2020s";

function decadeSourceContentKind(period, genreName) {
	if (genreName !== null) return "genre-breakdown";
	return period.kind === "year" || period.kind === "before-1950" ? "individual-year" : "whole-decade";
}

export function decadeSourceGenreOptions(mediaMode) {
	const media = DECADES_MEDIA_MODES.find((entry) => entry.id === mediaMode);
	if (!media) return Object.freeze([]);
	return Object.freeze(GENRE_CONCEPTS.filter((concept) => media.mediaTypes.every((mediaType) => (
		mediaType === "MOVIE" ? concept.movieId !== null : concept.tvId !== null
	))));
}

export function defaultDecadeSourceTitle(period, mediaType, genreName = null) {
	if (!DECADE_SOURCE_PERIODS.includes(period) || !["MOVIE", "TV"].includes(mediaType)) return null;
	const suffix = mediaLabel(mediaType);
	if (genreName !== null) return `${period.label} ${genreName} ${suffix}`;
	if (period.kind === "decade" || period.kind === "1950s-and-earlier") return `All ${period.label} ${suffix}`;
	return `${period.label} ${suffix}`;
}

function singlePeriodAdvanced(value, selectedGenreNames, periodId, errors) {
	const supplied = value ?? DEFAULT_DECADE_SOURCE_ADVANCED;
	if (
		plainObject(supplied)
		&& (Object.hasOwn(supplied, "ordinaryExcludedGenresByDecade") || Object.hasOwn(supplied, "exclusionsByGenreByDecade"))
	) {
		errors.push(diagnostic(
			"UNSUPPORTED_DECADE_SOURCE_ADVANCED_SCOPE",
			"$decadeSource.advanced",
			"One Decade source configuration cannot contain per-Decade Advanced overrides.",
		));
	}
	const genreNames = Array.isArray(selectedGenreNames)
		? selectedGenreNames
		: selectedGenreNames === null ? [] : [selectedGenreNames];
	return normalizeAdvanced(supplied, genreNames, { [periodId]: genreNames }, [periodId], errors);
}

export function buildCanonicalDecadePeriodDrafts({
	periodId = DEFAULT_DECADE_SOURCE_PERIOD_ID,
	mediaMode = "both",
	genreName = null,
	sortOptionId = DEFAULT_DECADES_SORT_OPTION_ID,
	advanced = DEFAULT_DECADE_SOURCE_ADVANCED,
	requireGenreForEveryMedia = true,
} = {}) {
	const errors = [];
	const period = decadeSourcePeriodById(periodId);
	if (period === null) errors.push(diagnostic("INVALID_DECADE_SOURCE_PERIOD", "$decadeSource.periodId", "Choose a supported canonical Decade period or exact year."));
	const media = DECADES_MEDIA_MODES.find((entry) => entry.id === mediaMode) ?? null;
	if (media === null) errors.push(diagnostic("INVALID_DECADE_SOURCE_MEDIA", "$decadeSource.mediaMode", "Choose Movies, Series, or Both."));
	if (!DECADES_SORT_OPTIONS.some((option) => option.id === sortOptionId)) {
		errors.push(diagnostic("INVALID_DECADE_SOURCE_SORT", "$decadeSource.sortOptionId", "Choose a supported Decade sort order."));
	}

	const canonicalGenreName = genreName === "" || genreName === undefined ? null : genreName;
	const genre = canonicalGenreName === null ? null : officialGenreConcept(canonicalGenreName);
	if (canonicalGenreName !== null && genre === null) {
		errors.push(diagnostic("INVALID_DECADE_SOURCE_GENRE", "$decadeSource.genreName", "Choose one official TMDB Genre or no included Genre."));
	} else if (genre !== null && media !== null && !(requireGenreForEveryMedia ? media.mediaTypes.every((mediaType) => (
		mediaType === "MOVIE" ? genre.movieId !== null : genre.tvId !== null
	)) : media.mediaTypes.some((mediaType) => (
		mediaType === "MOVIE" ? genre.movieId !== null : genre.tvId !== null
	)))) {
		errors.push(diagnostic(
			"DECADE_SOURCE_GENRE_UNAVAILABLE_FOR_MEDIA",
			"$decadeSource.genreName",
			`${genre.name} is not available for every configured media source.`,
		));
	}

	const normalizedAdvanced = singlePeriodAdvanced(advanced, genre?.name ?? null, periodId, errors);
	if (errors.length > 0 || period === null || media === null) {
		return Object.freeze({ ok: false, configuration: null, entries: Object.freeze([]), drafts: Object.freeze([]), errors: Object.freeze(errors) });
	}

	const baseFilters = baseAdvancedFilters(normalizedAdvanced);
	const excludedNames = genre === null
		? normalizedAdvanced.ordinaryExcludedGenres
		: normalizedAdvanced.exclusionsByGenre[genre.name] ?? Object.freeze([]);
	const entries = [];
	for (const mediaType of media.mediaTypes) {
		const includedGenreId = genre === null ? null : mediaType === "MOVIE" ? genre.movieId : genre.tvId;
		if (genre !== null && includedGenreId === null) continue;
		const excludedIds = exclusionIds(excludedNames, mediaType).filter((tmdbId) => tmdbId !== includedGenreId);
		const title = defaultDecadeSourceTitle(period, mediaType, genre?.name ?? null);
		const result = buildEntry({
			title,
			mediaType,
			sortOptionId,
			filters: {
				...period.filters,
				...(includedGenreId !== null ? { withGenres: String(includedGenreId) } : {}),
				...baseFilters,
				...(excludedIds.length > 0 ? { withoutGenres: excludedIds.join(",") } : {}),
			},
			contentKind: decadeSourceContentKind(period, genre?.name ?? null),
			period,
			genreName: genre?.name ?? null,
		});
		if (result.entry) entries.push(result.entry);
		else errors.push(...result.errors);
	}

	return Object.freeze({
		ok: errors.length === 0,
		configuration: errors.length === 0 ? Object.freeze({
			periodId: period.id,
			mediaMode: media.id,
			genreName: genre?.name ?? null,
			sortOptionId,
			advanced: normalizedAdvanced,
		}) : null,
		entries: Object.freeze(errors.length === 0 ? entries : []),
		drafts: Object.freeze(errors.length === 0 ? entries.map((entry) => entry.draft) : []),
		errors: Object.freeze(errors),
	});
}

function logicalSourceAdvanced(advanced, genreName) {
	return Object.freeze({
		minimumRating: advanced.minimumRating,
		maximumRating: advanced.maximumRating,
		minimumVotes: advanced.minimumVotes,
		originalLanguage: advanced.originalLanguage,
		originCountry: advanced.originCountry,
		ordinaryExcludedGenres: genreName === null ? advanced.ordinaryExcludedGenres : Object.freeze([]),
		exclusionsByGenre: genreName === null
			? Object.freeze({})
			: Object.freeze({ [genreName]: advanced.exclusionsByGenre[genreName] ?? Object.freeze([]) }),
	});
}

function normalizeDecadeSourceBundleGenreNames(genreNames, mediaMode, errors) {
	if (!Array.isArray(genreNames)) {
		errors.push(diagnostic("INVALID_DECADE_SOURCE_GENRES", "$decadeSource.genreNames", "Genre sources must be an official Genre selection."));
		return Object.freeze([]);
	}
	const supplied = new Set();
	for (const [index, name] of genreNames.entries()) {
		if (typeof name !== "string" || officialGenreConcept(name) === null) {
			errors.push(diagnostic("INVALID_DECADE_SOURCE_GENRE", `$decadeSource.genreNames[${index}]`, "Choose only official TMDB Genres."));
			continue;
		}
		if (supplied.has(name)) {
			errors.push(diagnostic("DUPLICATE_DECADE_SOURCE_GENRE", `$decadeSource.genreNames[${index}]`, "Choose each Genre source once."));
			continue;
		}
		supplied.add(name);
	}
	const eligible = new Set(decadeSourceGenreOptions(mediaMode).map((concept) => concept.name));
	for (const name of supplied) {
		if (!eligible.has(name)) {
			errors.push(diagnostic("DECADE_SOURCE_GENRE_UNAVAILABLE_FOR_MEDIA", "$decadeSource.genreNames", `${name} is not available for every configured media source.`));
		}
	}
	return Object.freeze(GENRE_CONCEPTS.filter((concept) => supplied.has(concept.name) && eligible.has(concept.name)).map((concept) => concept.name));
}

function normalizeDecadeSourceBundlePeriods(periodIds, legacyPeriodId, errors) {
	const suppliedValues = periodIds === undefined
		? [legacyPeriodId ?? DEFAULT_DECADE_SOURCE_PERIOD_ID]
		: periodIds;
	if (!Array.isArray(suppliedValues) || suppliedValues.length === 0 || suppliedValues.some((_, index) => !Object.hasOwn(suppliedValues, index))) {
		errors.push(diagnostic("INVALID_DECADE_SOURCE_PERIODS", "$decadeSource.periodIds", "Choose the whole Decade period or one or more individual years."));
		return Object.freeze({ decadeId: null, periodIds: Object.freeze([]), periods: Object.freeze([]) });
	}
	const suppliedIds = suppliedValues.map((value) => typeof value === "string" ? value : "");
	if (new Set(suppliedIds).size !== suppliedIds.length) {
		errors.push(diagnostic("DUPLICATE_DECADE_SOURCE_PERIOD", "$decadeSource.periodIds", "Choose each Decade period or year once."));
	}
	const matchingPresets = DECADE_PRESETS.filter((preset) => {
		const choiceIds = new Set(decadeSourcePeriodChoices(preset.id).map((period) => period.id));
		return suppliedIds.some((periodId) => choiceIds.has(periodId));
	});
	for (const [index, periodId] of suppliedIds.entries()) {
		if (decadeSourcePeriodById(periodId) === null) {
			errors.push(diagnostic("INVALID_DECADE_SOURCE_PERIOD", `$decadeSource.periodIds[${index}]`, "Choose only supported canonical Decade periods or exact years."));
		}
	}
	if (matchingPresets.length !== 1) {
		errors.push(diagnostic("MIXED_DECADE_SOURCE_PERIODS", "$decadeSource.periodIds", "Choose periods and years from one Decade family."));
		return Object.freeze({ decadeId: null, periodIds: Object.freeze([]), periods: Object.freeze([]) });
	}
	const preset = matchingPresets[0];
	const choices = decadeSourcePeriodChoices(preset.id);
	const choiceIds = new Set(choices.map((period) => period.id));
	if (suppliedIds.some((periodId) => !choiceIds.has(periodId))) {
		errors.push(diagnostic("MIXED_DECADE_SOURCE_PERIODS", "$decadeSource.periodIds", "Choose periods and years from one Decade family."));
	}
	if (suppliedIds.includes(preset.wholePeriod.id) && suppliedIds.length > 1) {
		errors.push(diagnostic("MIXED_WHOLE_AND_INDIVIDUAL_DECADE_PERIODS", "$decadeSource.periodIds", `Choose All ${preset.label} or individual choices, not both.`));
	}
	const selected = new Set(suppliedIds);
	const orderedPeriods = choices.filter((period) => selected.has(period.id));
	return Object.freeze({
		decadeId: preset.id,
		periodIds: Object.freeze(orderedPeriods.map((period) => period.id)),
		periods: Object.freeze(orderedPeriods),
	});
}

function ordinaryBundleAdvanced(value, selectedGenreNames, periodIds, errors) {
	const supplied = value ?? DEFAULT_DECADE_SOURCE_ADVANCED;
	if (
		plainObject(supplied)
		&& (Object.hasOwn(supplied, "ordinaryExcludedGenresByDecade") || Object.hasOwn(supplied, "exclusionsByGenreByDecade"))
	) {
		errors.push(diagnostic(
			"UNSUPPORTED_DECADE_SOURCE_ADVANCED_SCOPE",
			"$decadeSource.advanced",
			"One Add Source bundle cannot contain per-Decade Advanced overrides.",
		));
	}
	const genreNamesByPeriod = Object.fromEntries(periodIds.map((periodId) => [periodId, selectedGenreNames]));
	return normalizeAdvanced(supplied, selectedGenreNames, genreNamesByPeriod, periodIds, errors);
}

export function buildDecadeSourceBundleDrafts({
	periodIds = undefined,
	periodId = undefined,
	mediaMode = "both",
	genreNames = Object.freeze([]),
	sortOptionId = DEFAULT_DECADES_SORT_OPTION_ID,
	advanced = DEFAULT_DECADE_SOURCE_ADVANCED,
} = {}) {
	const errors = [];
	const normalizedPeriods = normalizeDecadeSourceBundlePeriods(periodIds, periodId, errors);
	if (!DECADES_MEDIA_MODES.some((entry) => entry.id === mediaMode)) errors.push(diagnostic("INVALID_DECADE_SOURCE_MEDIA", "$decadeSource.mediaMode", "Choose Movies, Series, or Both."));
	if (!DECADES_SORT_OPTIONS.some((option) => option.id === sortOptionId)) errors.push(diagnostic("INVALID_DECADE_SOURCE_SORT", "$decadeSource.sortOptionId", "Choose a supported Decade sort order."));
	const orderedGenreNames = normalizeDecadeSourceBundleGenreNames(genreNames, mediaMode, errors);
	const normalizedAdvanced = ordinaryBundleAdvanced(advanced, orderedGenreNames, normalizedPeriods.periodIds, errors);
	if (errors.length > 0 || normalizedPeriods.periods.length === 0) {
		return Object.freeze({ ok: false, configuration: null, periodGroups: Object.freeze([]), logicalSources: Object.freeze([]), entries: Object.freeze([]), drafts: Object.freeze([]), errors: Object.freeze(errors) });
	}

	const periodGroups = [];
	const logicalSources = [];
	const logicalGenreNames = [null, ...orderedGenreNames];
	for (const period of normalizedPeriods.periods) {
		const periodLogicalSources = [];
		for (const genreName of logicalGenreNames) {
			const built = buildCanonicalDecadePeriodDrafts({
				periodId: period.id,
				mediaMode,
				genreName,
				sortOptionId,
				advanced: logicalSourceAdvanced(normalizedAdvanced, genreName),
			});
			if (!built.ok) {
				errors.push(...built.errors);
				continue;
			}
			const logicalSource = Object.freeze({
				key: `${period.id}|${genreName === null ? "general" : `genre:${genreName}`}`,
				variantKey: genreName === null ? "general" : `genre:${genreName}`,
				periodId: period.id,
				period,
				genreName,
				selectorLabel: genreName ?? "General",
				entries: built.entries,
				drafts: built.drafts,
			});
			periodLogicalSources.push(logicalSource);
			logicalSources.push(logicalSource);
		}
		periodGroups.push(Object.freeze({
			key: period.id,
			period,
			selectorLabel: period.kind === "decade" || period.kind === "1950s-and-earlier" ? `All ${period.label}` : period.label,
			logicalSources: Object.freeze(periodLogicalSources),
		}));
	}
	const entries = logicalSources.flatMap((source) => source.entries);
	const drafts = logicalSources.flatMap((source) => source.drafts);
	return Object.freeze({
		ok: errors.length === 0,
		configuration: errors.length === 0 ? Object.freeze({ decadeId: normalizedPeriods.decadeId, periodIds: normalizedPeriods.periodIds, mediaMode, genreNames: orderedGenreNames, sortOptionId, advanced: normalizedAdvanced }) : null,
		periodGroups: Object.freeze(errors.length === 0 ? periodGroups : []),
		logicalSources: Object.freeze(errors.length === 0 ? logicalSources : []),
		entries: Object.freeze(errors.length === 0 ? entries : []),
		drafts: Object.freeze(errors.length === 0 ? drafts : []),
		errors: Object.freeze(errors),
	});
}

export function validateDecadeSourceBundleDrafts(drafts, configuration) {
	const expected = buildDecadeSourceBundleDrafts(configuration);
	if (!expected.ok) return Object.freeze({ ok: false, errors: expected.errors });
	if (!equalDecadesStructures(drafts, expected.drafts)) {
		return Object.freeze({ ok: false, errors: Object.freeze([
			diagnostic("INVALID_DECADE_SOURCE_DRAFTS", "$decadeSource.sources", "The Decade source bundle must exactly match the reviewed canonical configuration."),
		]) });
	}
	return Object.freeze({ ok: true, errors: Object.freeze([]) });
}

export function validateCanonicalDecadePeriodDrafts(drafts, configuration) {
	const expected = buildCanonicalDecadePeriodDrafts(configuration);
	if (!expected.ok) return Object.freeze({ ok: false, errors: expected.errors });
	if (!equalDecadesStructures(drafts, expected.drafts)) {
		return Object.freeze({ ok: false, errors: Object.freeze([
			diagnostic("INVALID_DECADE_SOURCE_DRAFTS", "$decadeSource.sources", "The Decade source batch must exactly match the reviewed canonical configuration."),
		]) });
	}
	return Object.freeze({ ok: true, errors: Object.freeze([]) });
}

function decadeDraftIdentities(drafts) {
	return (drafts ?? []).map((draft) => discoverSourceIdentity(draft?.editable)).filter((identity) => identity.comparable);
}

function decadeSourceOccurrences(project, identities) {
	const selected = new Set(identities);
	const occurrences = [];
	for (const collection of project?.collections ?? []) {
		for (const folder of collection.folders ?? []) {
			for (const source of folder.sources ?? []) {
				const identity = discoverSourceNodeIdentity(source);
				if (!identity.comparable || !selected.has(identity.key)) continue;
				occurrences.push(Object.freeze({
					identity: identity.key,
					collectionInternalId: collection.internalId,
					collectionTitle: typeof collection.editable?.title === "string" ? collection.editable.title.trim() : "",
					folderInternalId: folder.internalId,
					folderTitle: typeof folder.editable?.title === "string" ? folder.editable.title.trim() : "",
					sourceInternalId: source.internalId,
					sourceTitle: typeof source.editable?.title === "string" ? source.editable.title.trim() : "",
				}));
			}
		}
	}
	return Object.freeze(occurrences);
}

export function inspectDecadeSourceDuplicates(project, destinationFolderInternalId, drafts) {
	const identities = decadeDraftIdentities(drafts);
	const occurrences = decadeSourceOccurrences(project, identities.map((identity) => identity.key));
	const destination = occurrences.filter((entry) => entry.folderInternalId === destinationFolderInternalId);
	const elsewhere = occurrences.filter((entry) => entry.folderInternalId !== destinationFolderInternalId);
	const destinationIdentities = new Set(destination.map((entry) => entry.identity));
	const elsewhereIdentities = new Set(elsewhere.map((entry) => entry.identity));
	return Object.freeze({
		destination: Object.freeze(destination),
		elsewhere: Object.freeze(elsewhere),
		missingDrafts: Object.freeze((drafts ?? []).filter((draft) => !destinationIdentities.has(discoverSourceIdentity(draft.editable).key))),
		duplicateDrafts: Object.freeze((drafts ?? []).filter((draft) => destinationIdentities.has(discoverSourceIdentity(draft.editable).key))),
		elsewhereDrafts: Object.freeze((drafts ?? []).filter((draft) => {
			const identity = discoverSourceIdentity(draft.editable).key;
			return !destinationIdentities.has(identity) && elsewhereIdentities.has(identity);
		})),
	});
}

export function decadeDuplicateOverrideIdentity(folderInternalId, drafts) {
	if (typeof folderInternalId !== "string" || !folderInternalId) return null;
	const identities = decadeDraftIdentities(drafts);
	if (identities.length !== drafts?.length) return null;
	return `${folderInternalId}\n${identities.map((identity) => identity.key).join("\n")}`;
}

function findDecadeDestination(project, folderInternalId) {
	for (const collection of project?.collections ?? []) {
		const folder = collection.folders.find((entry) => entry.internalId === folderInternalId);
		if (folder) return Object.freeze({ collection, folder });
	}
	return null;
}

export function createDecadeSourceBundle(controller, {
	folderInternalId,
	periodIds = undefined,
	periodId = undefined,
	mediaMode = "both",
	genreNames = Object.freeze([]),
	sortOptionId = DEFAULT_DECADES_SORT_OPTION_ID,
	advanced = DEFAULT_DECADE_SOURCE_ADVANCED,
	drafts,
	duplicateOverrideIdentity = null,
	interactionLocked = false,
} = {}) {
	const configuration = { periodIds, periodId, mediaMode, genreNames, sortOptionId, advanced };
	const validation = validateDecadeSourceBundleDrafts(drafts, configuration);
	if (!validation.ok) return { ok: false, errors: validation.errors, warnings: [] };
	if (interactionLocked) {
		return { ok: false, errors: [diagnostic("DECADE_SOURCE_CREATION_LOCKED", "$decadeSource.creation", "Finish the current hierarchy interaction before adding Decade sources.")], warnings: [] };
	}
	const state = controller.getState();
	const destination = findDecadeDestination(state.project, folderInternalId);
	if (destination === null || state.selection.folderInternalId !== folderInternalId) {
		return { ok: false, errors: [diagnostic("DECADE_SOURCE_FOLDER_UNAVAILABLE", "$decadeSource.destination", "The selected destination folder is no longer available.")], warnings: [] };
	}

	const duplicateReview = inspectDecadeSourceDuplicates(state.project, folderInternalId, drafts);
	const override = decadeDuplicateOverrideIdentity(folderInternalId, drafts);
	const addAll = duplicateReview.duplicateDrafts.length > 0 && duplicateOverrideIdentity === override;
	const draftsToAdd = addAll ? drafts : duplicateReview.missingDrafts;
	if (draftsToAdd.length === 0) {
		return {
			ok: false,
			requiresDuplicateOverride: true,
			duplicateReview,
			errors: [diagnostic("DECADE_SOURCES_ALREADY_EXIST", "$decadeSource.sources", "Every configured Decade source already exists in this folder.")],
			warnings: [],
		};
	}

	const result = controller.addSourcesToFolder(folderInternalId, {
		sources: draftsToAdd.map((draft) => ({ category: draft.category, editable: draft.editable })),
	});
	return result.ok ? {
		...result,
		addedSourceCount: draftsToAdd.length,
		duplicateReview,
		duplicateOverrideUsed: addAll,
	} : result;
}

export function buildDecadesSourceDrafts(value) {
	const normalized = normalizeDecadesSourceConfiguration(value);
	if (!normalized.ok) return Object.freeze({ ok: false, configuration: null, groups: Object.freeze([]), drafts: Object.freeze([]), errors: normalized.errors });
	const configuration = normalized.configuration;
	const mediaTypes = DECADES_MEDIA_MODES.find((entry) => entry.id === configuration.mediaMode).mediaTypes;
	const groups = [];
	const drafts = [];
	const errors = [];

	const orderedDecadeIds = configuration.decadeOrder === "newest-first"
		? [...configuration.selectedDecadeIds].reverse()
		: configuration.selectedDecadeIds;
	for (const decadeId of orderedDecadeIds) {
		const preset = DECADE_PRESETS.find((entry) => entry.id === decadeId);
		const ordinaryExcludedGenres = configuration.advanced.ordinaryExcludedGenresByDecade?.[decadeId] ?? configuration.advanced.ordinaryExcludedGenres;
		const exclusionsByGenre = configuration.advanced.exclusionsByGenreByDecade?.[decadeId] ?? configuration.advanced.exclusionsByGenre;
		const ordinaryAdvanced = {
			minimumRating: configuration.advanced.minimumRating,
			maximumRating: configuration.advanced.maximumRating,
			minimumVotes: configuration.advanced.minimumVotes,
			originalLanguage: configuration.advanced.originalLanguage,
			originCountry: configuration.advanced.originCountry,
			ordinaryExcludedGenres,
			exclusionsByGenre: Object.freeze({}),
		};
		const logicalEntries = [];
		const appendLogicalPeriod = (periodId, genreName = null) => {
			const result = buildCanonicalDecadePeriodDrafts({
				periodId,
				mediaMode: configuration.mediaMode,
				genreName,
				sortOptionId: configuration.sortOptionId,
				requireGenreForEveryMedia: false,
				advanced: genreName === null ? ordinaryAdvanced : {
					...ordinaryAdvanced,
					ordinaryExcludedGenres: Object.freeze([]),
					exclusionsByGenre: Object.freeze({ [genreName]: Object.freeze([...(exclusionsByGenre[genreName] ?? [])]) }),
				},
			});
			if (result.ok) logicalEntries.push(...result.entries);
			else errors.push(...result.errors);
		};
		if (configuration.content.wholeDecade) appendLogicalPeriod(preset.wholePeriod.id);
		if (configuration.content.individualYears) {
			const periods = decadeIndividualPeriods(decadeId, {
				currentYear: configuration.currentYear,
				currentYearMode: configuration.currentYearMode ?? DEFAULT_DECADE_CURRENT_YEAR_MODE,
			});
			const orderedPeriods = configuration.yearOrder === "newest-first" ? [...(periods ?? [])].reverse() : periods ?? [];
			for (const period of orderedPeriods) appendLogicalPeriod(period.id);
		}
		if (configuration.content.genreBreakdown) {
			for (const genreName of configuration.genreNamesByDecade[decadeId]) appendLogicalPeriod(preset.wholePeriod.id, genreName);
		}
		for (const mediaType of mediaTypes) {
			const sources = logicalEntries.filter((entry) => entry.draft.editable.mediaType === mediaType);
			groups.push(Object.freeze({
				decadeId,
				decadeLabel: preset.label,
				mediaType,
				sources: Object.freeze(sources),
			}));
			drafts.push(...sources.map((entry) => entry.draft));
		}
	}

	return Object.freeze({
		ok: errors.length === 0,
		configuration,
		groups: Object.freeze(errors.length === 0 ? groups : []),
		drafts: Object.freeze(errors.length === 0 ? drafts : []),
		errors: Object.freeze(errors),
	});
}

export function validateDecadesSourceDrafts(entries, configuration) {
	const expected = buildDecadesSourceDrafts(configuration);
	if (!expected.ok) return Object.freeze({ ok: false, errors: expected.errors });
	if (!equalDecadesStructures(entries, expected.drafts)) {
		return Object.freeze({ ok: false, errors: Object.freeze([
			diagnostic("INVALID_DECADES_SOURCE_DRAFTS", "$decades.sources", "Decades source drafts must exactly match the validated deterministic configuration."),
		]) });
	}
	for (const [index, draft] of entries.entries()) {
		const identity = discoverSourceIdentity(draft?.editable);
		if (draft?.category !== "native-tmdb" || !identity.comparable) {
			return Object.freeze({ ok: false, errors: Object.freeze([
				diagnostic("INVALID_DECADES_SOURCE_DRAFT", `$decades.sources[${index}]`, "Every Decades source must be one comparable native TMDB DISCOVER draft."),
			]) });
		}
	}
	return Object.freeze({ ok: true, errors: Object.freeze([]) });
}

export function completeOfficialGenreNames() {
	return Object.freeze(GENRE_CONCEPTS.map((concept) => concept.name));
}
