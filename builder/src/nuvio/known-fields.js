export const COLLECTION_EDITABLE_FIELDS = Object.freeze([
	"id",
	"title",
	"pinToTop",
	"focusGlowEnabled",
	"viewMode",
	"showAllTab",
]);

export const FOLDER_EDITABLE_FIELDS = Object.freeze([
	"id",
	"title",
	"hideTitle",
	"tileShape",
	"coverEmoji",
	"focusGifUrl",
	"heroVideoUrl",
	"titleLogoUrl",
	"coverImageUrl",
	"focusGifEnabled",
	"heroBackdropUrl",
]);

export const SOURCE_EDITABLE_FIELDS = Object.freeze([
	"provider",
	"title",
	"tmdbSourceType",
	"tmdbId",
	"mediaType",
	"sortBy",
	"addonId",
	"type",
	"catalogId",
	"genre",
]);

export const NATIVE_TMDB_SOURCE_TYPES = Object.freeze([
	"LIST",
	"COLLECTION",
	"COMPANY",
	"NETWORK",
	"DISCOVER",
	"PERSON",
	"DIRECTOR",
]);

export const DISCOVER_FILTER_FIELDS = Object.freeze([
	"withGenres",
	"withoutGenres",
	"releaseDateGte",
	"releaseDateLte",
	"voteAverageGte",
	"voteAverageLte",
	"voteCountGte",
	"withOriginalLanguage",
	"withOriginCountry",
	"withKeywords",
	"withoutKeywords",
	"withCompanies",
	"withoutCompanies",
	"withNetworks",
	"year",
	"watchRegion",
	"withWatchProviders",
	"withoutWatchProviders",
]);
