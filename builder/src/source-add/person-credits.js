import { isPositiveSafePersonId } from "./tmdb-person-input.js";
import { normalizeTmdbPosterPath } from "./tmdb-image.js";

const COUNT_KEYS = Object.freeze([
	"actingMovies",
	"actingSeries",
	"directingMovies",
	"directingSeries",
]);

function plainObject(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function mediaCountKey(role, mediaType) {
	if (role === "acting") return mediaType === "movie" ? "actingMovies" : "actingSeries";
	return mediaType === "movie" ? "directingMovies" : "directingSeries";
}

function normalizedMediaType(value) {
	return value === "movie" || value === "tv" ? value : null;
}

function normalizedFiniteNumber(value) {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizedDate(value) {
	return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function normalizeCredit(entry) {
	return {
		id: entry.id,
		mediaType: normalizedMediaType(entry.media_type),
		posterPath: normalizeTmdbPosterPath(entry.poster_path),
		popularity: normalizedFiniteNumber(entry.popularity),
		voteAverage: normalizedFiniteNumber(entry.vote_average),
		voteCount: normalizedFiniteNumber(entry.vote_count),
		releaseDate: normalizedDate(entry.media_type === "movie" ? entry.release_date : entry.first_air_date),
	};
}

function addDistinctCredit(sets, role, entry) {
	if (!plainObject(entry) || !isPositiveSafePersonId(entry.id)) return;
	const mediaType = normalizedMediaType(entry.media_type);
	if (mediaType === null) return;
	sets[mediaCountKey(role, mediaType)].add(`${mediaType}|${entry.id}`);
}

export function normalizePersonCombinedCredits(value) {
	if (!plainObject(value) || !Array.isArray(value.cast) || !Array.isArray(value.crew)) {
		return null;
	}
	return {
		cast: value.cast.filter(plainObject).map((entry) => normalizeCredit(entry)),
		crew: value.crew.filter(plainObject).map((entry) => ({
			...normalizeCredit(entry),
			job: typeof entry.job === "string" ? entry.job.trim() : "",
		})),
	};
}

export function calculatePersonCreditCounts(value) {
	if (!plainObject(value) || !Array.isArray(value.cast) || !Array.isArray(value.crew)) {
		return null;
	}
	const sets = Object.fromEntries(COUNT_KEYS.map((key) => [key, new Set()]));
	for (const entry of value.cast) addDistinctCredit(sets, "acting", entry);
	for (const entry of value.crew) {
		if (typeof entry?.job !== "string" || entry.job.trim().toLowerCase() !== "director") continue;
		addDistinctCredit(sets, "directing", entry);
	}
	return Object.freeze(Object.fromEntries(
		COUNT_KEYS.map((key) => [key, sets[key].size]),
	));
}

export function isPersonCreditCountSet(value) {
	return plainObject(value) && COUNT_KEYS.every((key) => (
		Number.isSafeInteger(value[key]) && value[key] >= 0
	));
}

export { COUNT_KEYS as PERSON_CREDIT_COUNT_KEYS };
