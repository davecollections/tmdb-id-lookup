export const MOVIE_FRANCHISE_SOURCE_MODE_ID = "tmdb-movie-franchise";

export const MOVIE_FRANCHISE_SOURCE_MODE = Object.freeze({
	id: MOVIE_FRANCHISE_SOURCE_MODE_ID,
	label: "Movie franchise",
	icon: "franchises",
	providerLabel: "TMDB",
	description: "Add a TMDB movie collection.",
	category: "native-tmdb",
});

export const PEOPLE_SOURCE_MODE_ID = "tmdb-people";

export const PEOPLE_SOURCE_MODE = Object.freeze({
	id: PEOPLE_SOURCE_MODE_ID,
	label: "People",
	icon: "people",
	providerLabel: "TMDB",
	description: "Add movies or series for an actor or director.",
	category: "native-tmdb",
});

export const STUDIO_SOURCE_MODE_ID = "tmdb-studios";

export const STUDIO_SOURCE_MODE = Object.freeze({
	id: STUDIO_SOURCE_MODE_ID,
	label: "Studios",
	icon: "studios",
	providerLabel: "TMDB",
	description: "Add movies or series from a studio.",
	category: "native-tmdb",
});

export const NETWORK_SOURCE_MODE_ID = "tmdb-networks";

export const NETWORK_SOURCE_MODE = Object.freeze({
	id: NETWORK_SOURCE_MODE_ID,
	label: "Networks",
	icon: "networks",
	providerLabel: "TMDB",
	description: "Add series from a TV network.",
	category: "native-tmdb",
});

export const STREAMING_SOURCE_MODE_ID = "tmdb-streaming-services";

export const STREAMING_SOURCE_MODE = Object.freeze({
	id: STREAMING_SOURCE_MODE_ID,
	label: "Streaming",
	icon: "streaming-services",
	providerLabel: "TMDB",
	description: "Add a streaming service.",
	category: "native-tmdb",
});

export const GENRE_SOURCE_MODE_ID = "tmdb-genres";

export const GENRE_SOURCE_MODE = Object.freeze({
	id: GENRE_SOURCE_MODE_ID,
	label: "Genres",
	icon: "genres",
	providerLabel: "TMDB",
	description: "Add movies or series by genre.",
	category: "native-tmdb",
});

export const DECADE_SOURCE_MODE_ID = "tmdb-decade";

export const DECADE_SOURCE_MODE = Object.freeze({
	id: DECADE_SOURCE_MODE_ID,
	label: "Decade",
	icon: "decades",
	providerLabel: "TMDB",
	description: "Add movies or series by decade or year.",
	category: "native-tmdb",
});

export const TMDB_LIST_SOURCE_MODE_ID = "tmdb-lists";

export const TMDB_LIST_SOURCE_MODE = Object.freeze({
	id: TMDB_LIST_SOURCE_MODE_ID,
	label: "TMDB lists",
	icon: "lists",
	providerLabel: "TMDB",
	description: "Add one or more public TMDB lists.",
	category: "native-tmdb",
});

export const AVAILABLE_SOURCE_MODES = Object.freeze([
	MOVIE_FRANCHISE_SOURCE_MODE,
	TMDB_LIST_SOURCE_MODE,
	PEOPLE_SOURCE_MODE,
	STUDIO_SOURCE_MODE,
	NETWORK_SOURCE_MODE,
	STREAMING_SOURCE_MODE,
	GENRE_SOURCE_MODE,
	DECADE_SOURCE_MODE,
]);
