import {
	GENRE_CONCEPTS,
	officialGenreConcept,
	officialGenreReference,
} from "./genre-catalogue.js";

export const GENRE_ADVANCED_FILTER_FIELDS = Object.freeze([
	"releaseDateGte",
	"releaseDateLte",
	"voteAverageGte",
	"voteAverageLte",
	"voteCountGte",
	"withOriginalLanguage",
	"withOriginCountry",
	"withoutGenres",
]);

export const GENRE_ADVANCED_HELP = Object.freeze([
	Object.freeze({ field: "year", label: "From year / To year", description: "Choose the years you want titles to come from. Use both for a range, such as 1980 to 1999. Use only From year for titles from that year onwards, or only To year for titles from that year and earlier." }),
	Object.freeze({ field: "minimumRating", label: "Minimum rating", description: "Only include titles with at least this TMDB user rating. For example, 7 keeps titles rated 7 out of 10 or higher." }),
	Object.freeze({ field: "maximumRating", label: "Maximum rating", description: "Only include titles rated up to this TMDB user rating. Most people can leave this blank, but it can help when looking for things like lower-rated cult movies." }),
	Object.freeze({ field: "votes", label: "Minimum votes", description: "Helps avoid ratings based on only a few people. A higher number means more TMDB users have rated the title." }),
	Object.freeze({ field: "language", label: "Original language", description: "Only include titles originally made in the chosen language. A dubbed version does not change the original language." }),
	Object.freeze({ field: "country", label: "Origin country", description: "Only include titles that originate from the chosen country." }),
	Object.freeze({ field: "excludedGenres", label: "Exclude genres", description: "Leave out titles that also belong to genres you don't want. For example, choose Horror and exclude Comedy if you want something more frightening and less like a horror-comedy." }),
]);

const option = (code, label) => Object.freeze({ code, label });

export const GENRE_LANGUAGE_OPTIONS = Object.freeze([
	option("en", "English"), option("ar", "Arabic"), option("zh", "Chinese"), option("da", "Danish"),
	option("nl", "Dutch"), option("fi", "Finnish"), option("fr", "French"), option("de", "German"),
	option("hi", "Hindi"), option("id", "Indonesian"), option("it", "Italian"), option("ja", "Japanese"),
	option("ko", "Korean"), option("no", "Norwegian"), option("pl", "Polish"), option("pt", "Portuguese"),
	option("ru", "Russian"), option("es", "Spanish"), option("sv", "Swedish"), option("th", "Thai"),
	option("tr", "Turkish"), option("vi", "Vietnamese"),
]);

export const GENRE_COUNTRY_OPTIONS = Object.freeze([
	option("AR", "Argentina"), option("AU", "Australia"), option("BE", "Belgium"), option("BR", "Brazil"),
	option("CA", "Canada"), option("CN", "China"), option("DK", "Denmark"), option("FI", "Finland"),
	option("FR", "France"), option("DE", "Germany"), option("IN", "India"), option("ID", "Indonesia"),
	option("IE", "Ireland"), option("IT", "Italy"), option("JP", "Japan"), option("KR", "South Korea"),
	option("MX", "Mexico"), option("NL", "Netherlands"), option("NZ", "New Zealand"), option("NO", "Norway"),
	option("PH", "Philippines"), option("PL", "Poland"), option("PT", "Portugal"), option("ZA", "South Africa"),
	option("ES", "Spain"), option("SE", "Sweden"), option("TH", "Thailand"), option("TR", "Türkiye"),
	option("GB", "United Kingdom"), option("US", "United States"),
]);

const EMPTY_ADVANCED = Object.freeze({
	yearFrom: "",
	yearTo: "",
	minimumRating: "",
	maximumRating: "",
	minimumVotes: "",
	originalLanguage: "",
	originCountry: "",
	exclusionsByGenre: Object.freeze({}),
});

function diagnostic(code, path, message) {
	return Object.freeze({ code, path, message });
}

function inputText(value) {
	return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function plainObject(value) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

function parseOptionalInteger(value, { field, label, minimum, maximum = Number.MAX_SAFE_INTEGER }) {
	const text = inputText(value);
	if (!text) return { value: null, error: null };
	if (!/^\d+$/.test(text)) return { value: null, error: diagnostic("INVALID_GENRE_ADVANCED_INTEGER", `$genres.advanced.${field}`, `${label} must be a whole number.`) };
	const parsed = Number(text);
	if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
		return { value: null, error: diagnostic("INVALID_GENRE_ADVANCED_INTEGER_RANGE", `$genres.advanced.${field}`, `${label} must be between ${minimum} and ${maximum}.`) };
	}
	return { value: parsed, error: null };
}

function parseOptionalRating(value, field, label) {
	const text = inputText(value);
	if (!text) return { value: null, error: null };
	const parsed = Number(text);
	if (!Number.isFinite(parsed) || parsed < 0 || parsed > 10) {
		return { value: null, error: diagnostic("INVALID_GENRE_ADVANCED_RATING", `$genres.advanced.${field}`, `${label} must be a number from 0 to 10.`) };
	}
	return { value: parsed, error: null };
}

function canonicalGenreNames(values) {
	if (!Array.isArray(values)) return null;
	const names = values.map((entry) => typeof entry === "string" ? entry : entry?.name);
	if (new Set(names).size !== names.length || names.some((name) => officialGenreConcept(name) === null)) return null;
	return names;
}

function normalizeExclusionsByGenre(value) {
	if (value === undefined) return Object.freeze({});
	if (!plainObject(value)) return Object.freeze({ "": Object.freeze([""]) });
	const normalized = {};
	for (const [includedGenre, suppliedExclusions] of Object.entries(value)) {
		normalized[includedGenre] = Object.freeze(Array.isArray(suppliedExclusions)
			? suppliedExclusions.map((entry) => typeof entry === "string" ? entry : entry?.name ?? "")
			: [""]);
	}
	return Object.freeze(normalized);
}

export function createGenreAdvancedState(value = {}) {
	return Object.freeze({
		yearFrom: inputText(value?.yearFrom),
		yearTo: inputText(value?.yearTo),
		minimumRating: inputText(value?.minimumRating),
		maximumRating: inputText(value?.maximumRating),
		minimumVotes: inputText(value?.minimumVotes),
		originalLanguage: inputText(value?.originalLanguage).toLowerCase(),
		originCountry: inputText(value?.originCountry).toUpperCase(),
		exclusionsByGenre: normalizeExclusionsByGenre(value?.exclusionsByGenre),
	});
}

export function emptyGenreAdvancedState() {
	return createGenreAdvancedState(EMPTY_ADVANCED);
}

export function genreAdvancedOptionIsEmpty(value) {
	const advanced = createGenreAdvancedState(value);
	return !advanced.yearFrom && !advanced.yearTo && !advanced.minimumRating && !advanced.maximumRating
		&& !advanced.minimumVotes && !advanced.originalLanguage && !advanced.originCountry
		&& Object.values(advanced.exclusionsByGenre).every((names) => names.length === 0);
}

function selectedConcepts(values) {
	return (canonicalGenreNames(values) ?? []).map((name) => officialGenreConcept(name));
}

function generatedIdentities(concepts, sharedMediaChoice) {
	const identities = new Set();
	for (const concept of concepts) {
		if (concept.movieId !== null && (!concept.shared || sharedMediaChoice !== "series")) identities.add(`MOVIE|${concept.movieId}`);
		if (concept.tvId !== null && (!concept.shared || sharedMediaChoice !== "movies")) identities.add(`TV|${concept.tvId}`);
	}
	return identities;
}

export function genreExclusionCompatibility(excludedGenre, includedGenre, sharedMediaChoice = "both") {
	const excluded = typeof excludedGenre === "string" ? officialGenreConcept(excludedGenre) : officialGenreConcept(excludedGenre?.name);
	const included = selectedConcepts([typeof includedGenre === "string" ? includedGenre : includedGenre?.name]);
	if (excluded === null || included.length !== 1) return Object.freeze({ compatible: false, reason: "Choose the Genre to configure first." });
	const identities = generatedIdentities(included, sharedMediaChoice);
	const conflicts = (excluded.movieId !== null && identities.has(`MOVIE|${excluded.movieId}`))
		|| (excluded.tvId !== null && identities.has(`TV|${excluded.tvId}`));
	const applicable = (excluded.movieId !== null && [...identities].some((identity) => identity.startsWith("MOVIE|")))
		|| (excluded.tvId !== null && [...identities].some((identity) => identity.startsWith("TV|")));
	return Object.freeze({
		compatible: applicable && !conflicts,
		reason: conflicts
			? "A source cannot include and exclude the same Genre."
			: !applicable ? "This Genre is not available for the source media." : null,
	});
}

export function genreExclusionsFor(value, includedGenre) {
	const advanced = createGenreAdvancedState(value);
	return advanced.exclusionsByGenre[includedGenre] ?? Object.freeze([]);
}

export function updateGenreExclusions(value, includedGenre, excludedGenreNames) {
	const advanced = createGenreAdvancedState(value);
	return createGenreAdvancedState({
		...advanced,
		exclusionsByGenre: {
			...advanced.exclusionsByGenre,
			[includedGenre]: excludedGenreNames,
		},
	});
}

export function pruneGenreExclusionConfiguration(value, includedGenres) {
	const advanced = createGenreAdvancedState(value);
	const retained = {};
	for (const name of canonicalGenreNames(includedGenres) ?? []) {
		if (Object.hasOwn(advanced.exclusionsByGenre, name)) retained[name] = advanced.exclusionsByGenre[name];
	}
	return createGenreAdvancedState({ ...advanced, exclusionsByGenre: retained });
}

export function validateGenreAdvancedOptions(value, { includedGenres = [], sharedMediaChoice = "both" } = {}) {
	const advanced = createGenreAdvancedState(value);
	const errors = [];
	const selectedNames = canonicalGenreNames(includedGenres);
	const yearFrom = parseOptionalInteger(advanced.yearFrom, { field: "yearFrom", label: "From year", minimum: 1000, maximum: 9999 });
	const yearTo = parseOptionalInteger(advanced.yearTo, { field: "yearTo", label: "To year", minimum: 1000, maximum: 9999 });
	const minimumRating = parseOptionalRating(advanced.minimumRating, "minimumRating", "Minimum rating");
	const maximumRating = parseOptionalRating(advanced.maximumRating, "maximumRating", "Maximum rating");
	const minimumVotes = parseOptionalInteger(advanced.minimumVotes, { field: "minimumVotes", label: "Minimum votes", minimum: 0 });
	for (const parsed of [yearFrom, yearTo, minimumRating, maximumRating, minimumVotes]) if (parsed.error) errors.push(parsed.error);
	if (!yearFrom.error && !yearTo.error && yearFrom.value !== null && yearTo.value !== null && yearFrom.value > yearTo.value) {
		errors.push(diagnostic("INVALID_GENRE_ADVANCED_YEAR_RANGE", "$genres.advanced.yearTo", "To year must be the same as or later than From year."));
	}
	if (!minimumRating.error && !maximumRating.error && minimumRating.value !== null && maximumRating.value !== null && minimumRating.value > maximumRating.value) {
		errors.push(diagnostic("INVALID_GENRE_ADVANCED_RATING_RANGE", "$genres.advanced.maximumRating", "Maximum rating must be the same as or higher than Minimum rating."));
	}
	if (advanced.originalLanguage && !/^[a-z]{2}$/.test(advanced.originalLanguage)) {
		errors.push(diagnostic("INVALID_GENRE_ADVANCED_LANGUAGE", "$genres.advanced.originalLanguage", "Choose a two-letter original-language code."));
	}
	if (advanced.originCountry && !/^[A-Z]{2}$/.test(advanced.originCountry)) {
		errors.push(diagnostic("INVALID_GENRE_ADVANCED_COUNTRY", "$genres.advanced.originCountry", "Choose a two-letter origin-country code."));
	}
	if (selectedNames === null) {
		errors.push(diagnostic("INVALID_GENRE_ADVANCED_INCLUDED_GENRES", "$genres.advanced.exclusionsByGenre", "Genre exclusions require the selected official Genres."));
	}
	for (const [includedGenre, excludedGenreNames] of Object.entries(advanced.exclusionsByGenre)) {
		const path = `$genres.advanced.exclusionsByGenre.${includedGenre || "unknown"}`;
		if (selectedNames === null || !selectedNames.includes(includedGenre) || canonicalGenreNames(excludedGenreNames) === null) {
			errors.push(diagnostic("INVALID_GENRE_ADVANCED_EXCLUSIONS", path, "Choose each official excluded Genre once for a selected Genre."));
			continue;
		}
		for (const name of excludedGenreNames) {
			if (name === includedGenre) errors.push(diagnostic("GENRE_ADVANCED_SELF_EXCLUSION", path, "A source cannot include and exclude the same Genre."));
		}
	}
	return Object.freeze({
		ok: errors.length === 0,
		advanced,
		values: Object.freeze({
			yearFrom: yearFrom.value,
			yearTo: yearTo.value,
			minimumRating: minimumRating.value,
			maximumRating: maximumRating.value,
			minimumVotes: minimumVotes.value,
		}),
		errors: Object.freeze(errors),
	});
}

export function compileGenreAdvancedFilters(value, {
	mediaType,
	includedGenre,
	includedGenres = [includedGenre],
	sharedMediaChoice = "both",
} = {}) {
	const validation = validateGenreAdvancedOptions(value, { includedGenres, sharedMediaChoice });
	if (!validation.ok || !["MOVIE", "TV"].includes(mediaType)) {
		const errors = [...validation.errors];
		if (!["MOVIE", "TV"].includes(mediaType)) errors.push(diagnostic("INVALID_GENRE_ADVANCED_MEDIA", "$genres.advanced.mediaType", "Genre advanced filters require Movie or Series media."));
		return Object.freeze({ ok: false, filters: null, errors: Object.freeze(errors) });
	}
	const { advanced, values } = validation;
	const filters = {};
	if (values.yearFrom !== null) filters.releaseDateGte = `${String(values.yearFrom).padStart(4, "0")}-01-01`;
	if (values.yearTo !== null) filters.releaseDateLte = `${String(values.yearTo).padStart(4, "0")}-12-31`;
	if (values.minimumRating !== null) filters.voteAverageGte = values.minimumRating;
	if (values.maximumRating !== null) filters.voteAverageLte = values.maximumRating;
	if (values.minimumVotes !== null) filters.voteCountGte = values.minimumVotes;
	if (advanced.originalLanguage) filters.withOriginalLanguage = advanced.originalLanguage;
	if (advanced.originCountry) filters.withOriginCountry = advanced.originCountry;
	const excludedIds = genreExclusionsFor(advanced, includedGenre)
		.map((name) => officialGenreConcept(name))
		.map((concept) => mediaType === "MOVIE" ? concept.movieId : concept.tvId)
		.filter((tmdbId) => tmdbId !== null);
	if (excludedIds.length > 0) filters.withoutGenres = excludedIds.join(",");
	return Object.freeze({ ok: true, filters: Object.freeze(filters), errors: Object.freeze([]) });
}

function exactYear(value, suffix) {
	if (value === undefined || value === null) return "";
	if (typeof value !== "string") return null;
	const match = new RegExp(`^(\\d{4})-${suffix}$`).exec(value);
	if (!match) return null;
	const year = Number(match[1]);
	return year >= 1000 && year <= 9999 ? match[1] : null;
}

export function readGenreAdvancedFilters(filters, { mediaType, includedGenre } = {}) {
	if (filters === null || typeof filters !== "object" || Array.isArray(filters)) return null;
	const allowed = new Set(["withGenres", ...GENRE_ADVANCED_FILTER_FIELDS]);
	if (Object.entries(filters).some(([field, value]) => !allowed.has(field) && value !== null && value !== undefined && value !== "")) return null;
	const yearFrom = exactYear(filters.releaseDateGte, "01-01");
	const yearTo = exactYear(filters.releaseDateLte, "12-31");
	if (yearFrom === null || yearTo === null) return null;
	const rating = (value) => value === undefined || value === null ? "" : typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 10 ? String(value) : null;
	const minimumRating = rating(filters.voteAverageGte);
	const maximumRating = rating(filters.voteAverageLte);
	if (minimumRating === null || maximumRating === null) return null;
	const minimumVotes = filters.voteCountGte === undefined || filters.voteCountGte === null
		? ""
		: Number.isSafeInteger(filters.voteCountGte) && filters.voteCountGte >= 0 ? String(filters.voteCountGte) : null;
	if (minimumVotes === null) return null;
	const originalLanguage = filters.withOriginalLanguage ?? "";
	const originCountry = filters.withOriginCountry ?? "";
	if ((originalLanguage !== "" && (typeof originalLanguage !== "string" || !/^[a-z]{2}$/.test(originalLanguage)))
		|| (originCountry !== "" && (typeof originCountry !== "string" || !/^[A-Z]{2}$/.test(originCountry)))) return null;
	const excludedGenreNames = [];
	if (filters.withoutGenres !== undefined && filters.withoutGenres !== null) {
		if (typeof filters.withoutGenres !== "string" || !/^[1-9]\d*(,[1-9]\d*)*$/.test(filters.withoutGenres)) return null;
		for (const token of filters.withoutGenres.split(",")) {
			const reference = officialGenreReference(mediaType, Number(token));
			if (reference === null || reference.name === includedGenre || excludedGenreNames.includes(reference.name)) return null;
			excludedGenreNames.push(reference.name);
		}
	}
	const advanced = createGenreAdvancedState({
		yearFrom,
		yearTo,
		minimumRating,
		maximumRating,
		minimumVotes,
		originalLanguage,
		originCountry,
		exclusionsByGenre: excludedGenreNames.length > 0 ? { [includedGenre]: excludedGenreNames } : {},
	});
	const validation = validateGenreAdvancedOptions(advanced, { includedGenres: [includedGenre], sharedMediaChoice: mediaType === "MOVIE" ? "movies" : "series" });
	return validation.ok ? advanced : null;
}

export function genreAdvancedExclusionOptions() {
	return GENRE_CONCEPTS;
}
