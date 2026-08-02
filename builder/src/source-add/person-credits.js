import { isPositiveSafePersonId } from "./tmdb-person-input.js";

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
		cast: value.cast.filter(plainObject).map((entry) => ({
			id: entry.id,
			mediaType: normalizedMediaType(entry.media_type),
		})),
		crew: value.crew.filter(plainObject).map((entry) => ({
			id: entry.id,
			mediaType: normalizedMediaType(entry.media_type),
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
