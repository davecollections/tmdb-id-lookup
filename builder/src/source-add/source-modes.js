export const MOVIE_FRANCHISE_SOURCE_MODE_ID = "tmdb-movie-franchise";

export const MOVIE_FRANCHISE_SOURCE_MODE = Object.freeze({
	id: MOVIE_FRANCHISE_SOURCE_MODE_ID,
	label: "Movie franchise",
	providerLabel: "TMDB",
	description: "Add an official TMDB movie collection as one Nuvio source.",
	category: "native-tmdb",
});

export const AVAILABLE_SOURCE_MODES = Object.freeze([
	MOVIE_FRANCHISE_SOURCE_MODE,
]);
