import {
	buildDiscoverSourceDraft,
	DEFAULT_DISCOVER_SORT_OPTION_ID,
	DISCOVER_SORT_OPTIONS,
	discoverSourceIdentity,
} from "../nuvio/discover.js";
import {
	DECADE_CURRENT_YEAR_MODES,
	DECADE_PRESETS,
	DEFAULT_DECADE_CURRENT_YEAR_MODE,
	currentDecadePreset,
	decadeIndividualPeriods,
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

const CONFIGURATION_KEYS = new Set([
	"selectedDecadeIds",
	"mediaMode",
	"content",
	"currentYear",
	"currentYearMode",
	"sortOptionId",
	"genreNames",
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

function normalizeAdvanced(value, genreNames, errors) {
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
	return Object.freeze({
		minimumRating,
		maximumRating,
		minimumVotes,
		originalLanguage,
		originCountry,
		ordinaryExcludedGenres: Object.freeze(ordinaryExcludedGenres),
		exclusionsByGenre: Object.freeze(exclusionsByGenre),
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
		errors.push(diagnostic("EMPTY_DECADES_CONTENT", "$decades.content", "Enable Whole decade, Individual years, or Genre breakdown."));
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
	const genreNames = officialGenreNames(value.genreNames ?? [], "$decades.genreNames", errors, { allowEmpty: !content.genreBreakdown });
	if (!content.genreBreakdown && genreNames.length > 0) {
		errors.push(diagnostic("UNEXPECTED_DECADES_GENRES", "$decades.genreNames", "Genre selections require Genre breakdown to be enabled."));
	}
	if (content.genreBreakdown && media) {
		for (const [index, genreName] of genreNames.entries()) {
			const concept = officialGenreConcept(genreName);
			const available = media.mediaTypes.some((mediaType) => (
				mediaType === "MOVIE" ? concept.movieId !== null : concept.tvId !== null
			));
			if (!available) {
				errors.push(diagnostic(
					"DECADES_GENRE_UNAVAILABLE_FOR_MEDIA",
					`$decades.genreNames[${index}]`,
					`${genreName} is not available for ${media.label}.`,
				));
			}
		}
	}
	const advanced = normalizeAdvanced(value.advanced, genreNames, errors);
	if (!content.genreBreakdown && Object.keys(advanced.exclusionsByGenre).length > 0) {
		errors.push(diagnostic("UNEXPECTED_DECADES_GENRE_EXCLUSIONS", "$decades.advanced.exclusionsByGenre", "Per-Genre exclusions require Genre breakdown to be enabled."));
	}

	return Object.freeze({
		ok: errors.length === 0,
		configuration: errors.length === 0 ? Object.freeze({
			selectedDecadeIds: Object.freeze(orderedSelectedIds),
			mediaMode: media.id,
			content,
			currentYear: value.currentYear,
			currentYearMode,
			sortOptionId,
			genreNames: Object.freeze(genreNames),
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

export function buildDecadesSourceDrafts(value) {
	const normalized = normalizeDecadesSourceConfiguration(value);
	if (!normalized.ok) return Object.freeze({ ok: false, configuration: null, groups: Object.freeze([]), drafts: Object.freeze([]), errors: normalized.errors });
	const configuration = normalized.configuration;
	const mediaTypes = DECADES_MEDIA_MODES.find((entry) => entry.id === configuration.mediaMode).mediaTypes;
	const baseFilters = baseAdvancedFilters(configuration.advanced);
	const groups = [];
	const drafts = [];
	const errors = [];

	for (const decadeId of configuration.selectedDecadeIds) {
		const preset = DECADE_PRESETS.find((entry) => entry.id === decadeId);
		for (const mediaType of mediaTypes) {
			const sources = [];
			const ordinaryExcludedIds = exclusionIds(configuration.advanced.ordinaryExcludedGenres, mediaType);
			const ordinaryAdvanced = {
				...baseFilters,
				...(ordinaryExcludedIds.length > 0 ? { withoutGenres: ordinaryExcludedIds.join(",") } : {}),
			};
			if (configuration.content.wholeDecade) {
				const result = buildEntry({
					title: `${preset.label} ${mediaLabel(mediaType)}`,
					mediaType,
					sortOptionId: configuration.sortOptionId,
					filters: { ...preset.wholePeriod.filters, ...ordinaryAdvanced },
					contentKind: "whole-decade",
					period: preset.wholePeriod,
				});
				if (result.entry) sources.push(result.entry); else errors.push(...result.errors);
			}
			if (configuration.content.individualYears) {
				const periods = decadeIndividualPeriods(decadeId, {
					currentYear: configuration.currentYear,
					currentYearMode: configuration.currentYearMode ?? DEFAULT_DECADE_CURRENT_YEAR_MODE,
				});
				for (const period of periods ?? []) {
					const result = buildEntry({
						title: `${period.label} ${mediaLabel(mediaType)}`,
						mediaType,
						sortOptionId: configuration.sortOptionId,
						filters: { ...period.filters, ...ordinaryAdvanced },
						contentKind: "individual-year",
						period,
					});
					if (result.entry) sources.push(result.entry); else errors.push(...result.errors);
				}
			}
			if (configuration.content.genreBreakdown) {
				for (const genreName of configuration.genreNames) {
					const concept = officialGenreConcept(genreName);
					const genreId = mediaType === "MOVIE" ? concept.movieId : concept.tvId;
					if (genreId === null) continue;
					const excludedIds = exclusionIds(configuration.advanced.exclusionsByGenre[genreName] ?? [], mediaType)
						.filter((tmdbId) => tmdbId !== genreId);
					const result = buildEntry({
						title: `${preset.label} ${genreName} ${mediaLabel(mediaType)}`,
						mediaType,
						sortOptionId: configuration.sortOptionId,
						filters: {
							...preset.wholePeriod.filters,
							withGenres: String(genreId),
							...baseFilters,
							...(excludedIds.length > 0 ? { withoutGenres: excludedIds.join(",") } : {}),
						},
						contentKind: "genre-breakdown",
						period: preset.wholePeriod,
						genreName,
					});
					if (result.entry) sources.push(result.entry); else errors.push(...result.errors);
				}
			}
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
