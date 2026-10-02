export const COLLECTION_EDITABLE_FIELDS = Object.freeze([
	"id",
	"title",
	"backdropImageUrl",
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

// Trakt ownership is intentionally separate from the legacy TMDB/addon/opaque set.
export const NATIVE_TRAKT_EDITABLE_FIELDS = Object.freeze([
	"provider", "title", "traktListId", "mediaType", "sortBy", "sortHow",
]);

export function sourceEditableFields(category) {
	return category === "native-trakt" ? NATIVE_TRAKT_EDITABLE_FIELDS : SOURCE_EDITABLE_FIELDS;
}

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
