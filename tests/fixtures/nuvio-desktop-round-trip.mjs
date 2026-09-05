// Small synthetic import envelopes, not external-service responses or personal collections.
const desktopFilterFields = [
	"withGenres", "withoutGenres", "releaseDateGte", "releaseDateLte",
	"voteAverageGte", "voteAverageLte", "voteCountGte", "withOriginalLanguage",
	"withOriginCountry", "withKeywords", "withoutKeywords", "withCompanies",
	"withoutCompanies", "withNetworks", "year", "watchRegion",
	"withWatchProviders", "withoutWatchProviders",
];

export function desktopExpandedSource(source) {
	return {
		...source,
		addonId: null, catalogId: null, type: null, genre: null, sortHow: null, traktListId: null,
		filters: { ...Object.fromEntries(desktopFilterFields.map((field) => [field, null])), ...source.filters },
	};
}

export const roundTripSourceCases = [];
for (const mediaType of ["MOVIE", "TV"]) {
	const base = { provider: "tmdb", tmdbSourceType: "DISCOVER", tmdbId: null, mediaType, sortBy: "popularity.desc" };
	roundTripSourceCases.push({ name: `Genre ${mediaType}`, editorId: "genre", source: { ...base, title: `Example Genre ${mediaType}`, filters: { withGenres: "35" } } });
	for (const [name, filters] of [
		["Decade", { releaseDateGte: "1980-01-01", releaseDateLte: "1989-12-31" }],
		["Year", { releaseDateGte: "1984-01-01", releaseDateLte: "1984-12-31" }],
		["Before 1950", { releaseDateLte: "1949-12-31" }],
		["1950s and earlier", { releaseDateLte: "1959-12-31" }],
		["Decade with Genre", { releaseDateGte: "1980-01-01", releaseDateLte: "1989-12-31", withGenres: "35" }],
		["Year with Genre", { releaseDateGte: "1984-01-01", releaseDateLte: "1984-12-31", withGenres: "35" }],
	]) roundTripSourceCases.push({ name: `${name} ${mediaType}`, editorId: "decade", source: { ...base, title: `Example ${name} ${mediaType}`, filters } });
}
roundTripSourceCases.push({ name: "TMDB List", editorId: "tmdb-list", source: { provider: "tmdb", title: "Example List", tmdbSourceType: "LIST", tmdbId: 123, mediaType: "MOVIE", sortBy: "original", filters: {} } });
