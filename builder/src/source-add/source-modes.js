export const MOVIE_FRANCHISE_SOURCE_MODE_ID = "tmdb-movie-franchise";

export const MOVIE_FRANCHISE_SOURCE_MODE = Object.freeze({
	id: MOVIE_FRANCHISE_SOURCE_MODE_ID,
	label: "Movie franchise",
	providerLabel: "TMDB",
	description: "Add an official TMDB movie collection as one Nuvio source.",
	category: "native-tmdb",
});

export const PEOPLE_SOURCE_MODE_ID = "tmdb-people";

export const PEOPLE_SOURCE_MODE = Object.freeze({
	id: PEOPLE_SOURCE_MODE_ID,
	label: "People",
	providerLabel: "TMDB",
	description: "Add acting and directing Movie or Series sources for one person.",
	category: "native-tmdb",
});

export const STUDIO_SOURCE_MODE_ID = "tmdb-studios";

export const STUDIO_SOURCE_MODE = Object.freeze({
	id: STUDIO_SOURCE_MODE_ID,
	label: "Studios",
	providerLabel: "TMDB",
	description: "Add Movie or Series sources for one studio.",
	category: "native-tmdb",
});

export const NETWORK_SOURCE_MODE_ID = "tmdb-networks";

export const NETWORK_SOURCE_MODE = Object.freeze({
	id: NETWORK_SOURCE_MODE_ID,
	label: "Networks",
	providerLabel: "TMDB",
	description: "Add one Series source for a TV Network.",
	category: "native-tmdb",
});

export const AVAILABLE_SOURCE_MODES = Object.freeze([
	MOVIE_FRANCHISE_SOURCE_MODE,
	PEOPLE_SOURCE_MODE,
	STUDIO_SOURCE_MODE,
	NETWORK_SOURCE_MODE,
]);
