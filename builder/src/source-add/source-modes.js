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

export const STREAMING_SOURCE_MODE_ID = "tmdb-streaming-services";

export const STREAMING_SOURCE_MODE = Object.freeze({
	id: STREAMING_SOURCE_MODE_ID,
	label: "Streaming service",
	providerLabel: "TMDB",
	description: "Add Movie or Series sources for one streaming provider across one or more regions.",
	category: "native-tmdb",
});

export const GENRE_SOURCE_MODE_ID = "tmdb-genres";

export const GENRE_SOURCE_MODE = Object.freeze({
	id: GENRE_SOURCE_MODE_ID,
	label: "Genres",
	providerLabel: "TMDB",
	description: "Add official TMDB Movie or Series Genre sources.",
	category: "native-tmdb",
});

export const DECADE_SOURCE_MODE_ID = "tmdb-decade";

export const DECADE_SOURCE_MODE = Object.freeze({
	id: DECADE_SOURCE_MODE_ID,
	label: "Decade",
	providerLabel: "TMDB",
	description: "Add one canonical Decade or exact-year Movie, Series, or Both configuration.",
	category: "native-tmdb",
});

export const AVAILABLE_SOURCE_MODES = Object.freeze([
	MOVIE_FRANCHISE_SOURCE_MODE,
	PEOPLE_SOURCE_MODE,
	STUDIO_SOURCE_MODE,
	NETWORK_SOURCE_MODE,
	STREAMING_SOURCE_MODE,
	GENRE_SOURCE_MODE,
	DECADE_SOURCE_MODE,
]);
