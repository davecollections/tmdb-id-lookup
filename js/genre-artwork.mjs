// Static projection of the approved Genre manifest, release 0f911db07e47d610d05cd3fdb7c3889e6423a3ad.
// Names are artwork identities, not source catalogue additions. No runtime manifest request.
export const GENRE_ARTWORK_SLUGS = Object.freeze({
	"Action": "action",
	"Action & Adventure": "action-and-adventure",
	"Adventure": "adventure",
	"Animation": "animation",
	"Comedy": "comedy",
	"Crime": "crime",
	"Disaster": "disaster",
	"Documentary": "documentary",
	"Drama": "drama",
	"Family": "family",
	"Fantasy": "fantasy",
	"History": "history",
	"Horror": "horror",
	"Kids": "kids",
	"Music": "music",
	"Musicals": "musicals",
	"Mystery": "mystery",
	"News": "news",
	"Queer": "queer",
	"Reality": "reality",
	"Rom Com": "rom-com",
	"Romance": "romance",
	"Sci-Fi & Fantasy": "sci-fi-and-fantasy",
	"Science Fiction": "science-fiction",
	"Soap": "soap",
	"Talk": "talk",
	"Thriller": "thriller",
	"TV Movie": "tv-movie",
	"War": "war",
	"War & Politics": "war-and-politics",
	"Western": "western"
});

export const GENRE_ARTWORK_SHAPES = Object.freeze(["POSTER", "SQUARE", "LANDSCAPE"]);
export const GENRE_ARTWORK_ROLE_FILES = Object.freeze({
	landscape: "landscape.webp", focus: "landscape-focus.webp",
	square: "square.webp", squareFocus: "square-focus.webp",
	poster: "poster.webp", posterFocus: "poster-focus.webp",
	hero: "hero.webp", titleLogo: "title-logo.webp",
});
const ROOT = "https://raw.githubusercontent.com/davecollections/nuvio-assets/main/assets/collection_covers/genre";

export function genreArtworkRoleUrl(name, role) {
	if (!Object.hasOwn(GENRE_ARTWORK_SLUGS, name) || !Object.hasOwn(GENRE_ARTWORK_ROLE_FILES, role)) return null;
	return `${ROOT}/${GENRE_ARTWORK_SLUGS[name]}/${GENRE_ARTWORK_ROLE_FILES[role]}`;
}

export function resolveGenreArtwork(name, tileShape = "LANDSCAPE") {
	if (!GENRE_ARTWORK_SHAPES.includes(tileShape) || !Object.hasOwn(GENRE_ARTWORK_SLUGS, name)) return null;
	const role = tileShape.toLowerCase();
	return Object.freeze({
		coverImageUrl: genreArtworkRoleUrl(name, role),
		focusGifUrl: genreArtworkRoleUrl(name, tileShape === "LANDSCAPE" ? "focus" : `${role}Focus`),
		heroBackdropUrl: genreArtworkRoleUrl(name, "hero"),
		titleLogoUrl: genreArtworkRoleUrl(name, "titleLogo"),
	});
}
