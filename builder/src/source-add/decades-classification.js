import {
	discoverSortOptionId,
	discoverSourceIdentity,
	discoverSourceNodeIdentity,
	effectiveDiscoverSort,
	resolveEffectiveDiscoverSource,
} from "../nuvio/discover.js";
import { classifyCanonicalDecadePeriod } from "./decades-catalogue.js";
import { officialGenreReference } from "./genre-catalogue.js";

const knownSourceFields = new Set([
	"filters",
	"mediaType",
	"provider",
	"sortBy",
	"title",
	"tmdbId",
	"tmdbSourceType",
]);

const allowedFilterFields = new Set([
	"releaseDateGte",
	"releaseDateLte",
	"voteAverageGte",
	"voteAverageLte",
	"voteCountGte",
	"withOriginalLanguage",
	"withOriginCountry",
	"withoutGenres",
	"withGenres",
]);

function plainObject(value) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

function meaningful(value) {
	return value !== null
		&& value !== undefined
		&& !(typeof value === "string" && value.trim().length === 0);
}

function canonicalText(value) {
	return typeof value === "string" ? value.trim() : "";
}

function validRating(value) {
	return value === undefined || (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 10);
}

function inspectEffectiveDecadeSource(value, identity) {
	if (!plainObject(value) || !identity?.comparable) return null;
	if (
		canonicalText(value.provider).toLowerCase() !== "tmdb"
		|| canonicalText(value.tmdbSourceType).toUpperCase() !== "DISCOVER"
	) return null;
	const mediaType = canonicalText(value.mediaType).toUpperCase();
	const canonicalTmdbId = !Object.hasOwn(value, "tmdbId") || value.tmdbId === null;
	if (!["MOVIE", "TV"].includes(mediaType) || !canonicalTmdbId || !plainObject(value.filters)) return null;
	for (const [field, fieldValue] of Object.entries(value)) {
		if (!knownSourceFields.has(field) && meaningful(fieldValue)) return null;
	}
	for (const [field, fieldValue] of Object.entries(value.filters)) {
		if (!allowedFilterFields.has(field) && meaningful(fieldValue)) return null;
	}
	const period = classifyCanonicalDecadePeriod(value.filters);
	if (period === null || discoverSortOptionId(effectiveDiscoverSort(value.sortBy), mediaType) === null) return null;
	if (!validRating(value.filters.voteAverageGte) || !validRating(value.filters.voteAverageLte)) return null;
	if (
		typeof value.filters.voteAverageGte === "number"
		&& typeof value.filters.voteAverageLte === "number"
		&& value.filters.voteAverageGte > value.filters.voteAverageLte
	) return null;
	if (value.filters.voteCountGte !== undefined && (!Number.isSafeInteger(value.filters.voteCountGte) || value.filters.voteCountGte < 0)) return null;
	if (value.filters.withOriginalLanguage !== undefined && (typeof value.filters.withOriginalLanguage !== "string" || !/^[a-z]{2}$/.test(value.filters.withOriginalLanguage))) return null;
	if (value.filters.withOriginCountry !== undefined && (typeof value.filters.withOriginCountry !== "string" || !/^[A-Z]{2}$/.test(value.filters.withOriginCountry))) return null;

	let genre = null;
	if (value.filters.withGenres !== undefined) {
		if (typeof value.filters.withGenres !== "string" || !/^[1-9]\d*$/.test(value.filters.withGenres)) return null;
		const genreId = Number(value.filters.withGenres);
		if (!Number.isSafeInteger(genreId)) return null;
		const reference = officialGenreReference(mediaType, genreId);
		if (reference === null) return null;
		genre = Object.freeze({ name: reference.name, tmdbId: reference.tmdbId });
	}

	const excludedGenres = [];
	if (value.filters.withoutGenres !== undefined) {
		if (typeof value.filters.withoutGenres !== "string" || !/^[1-9]\d*(,[1-9]\d*)*$/.test(value.filters.withoutGenres)) return null;
		for (const token of value.filters.withoutGenres.split(",")) {
			const reference = officialGenreReference(mediaType, Number(token));
			if (reference === null || excludedGenres.some((entry) => entry.tmdbId === reference.tmdbId) || genre?.tmdbId === reference.tmdbId) return null;
			excludedGenres.push(Object.freeze({ name: reference.name, tmdbId: reference.tmdbId }));
		}
	}

	return Object.freeze({
		identity: identity.key,
		period,
		mediaType,
		sortOptionId: discoverSortOptionId(effectiveDiscoverSort(value.sortBy), mediaType),
		genre,
		excludedGenres: Object.freeze(excludedGenres),
		value,
	});
}

export function inspectCanonicalDecadeSource(value) {
	return inspectEffectiveDecadeSource(value, discoverSourceIdentity(value));
}

export function inspectCanonicalDecadeSourceNode(sourceNode) {
	const effective = resolveEffectiveDiscoverSource(sourceNode);
	if (!effective.ok) return null;
	return inspectEffectiveDecadeSource(effective.value, discoverSourceNodeIdentity(sourceNode));
}
