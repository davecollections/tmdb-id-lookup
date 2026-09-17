import { GENRE_ARTWORK_SHAPES, resolveGenreArtwork } from "../../../js/genre-artwork.mjs";
export { GENRE_ARTWORK_SHAPES, resolveGenreArtwork };
export const DEFAULT_GENRE_ARTWORK_SHAPE = "LANDSCAPE";

export function genreArtworkUrl(genreName, tileShape = DEFAULT_GENRE_ARTWORK_SHAPE) {
	return resolveGenreArtwork(genreName, tileShape)?.coverImageUrl ?? null;
}

export function genreWideArtworkUrl(genreName) {
	return genreArtworkUrl(genreName, "LANDSCAPE");
}

export function buildGenreFolderEditable(genreName, { tileShape = DEFAULT_GENRE_ARTWORK_SHAPE } = {}) {
	const title = typeof genreName === "string" ? genreName.trim() : "";
	if (!title || title !== genreName || !GENRE_ARTWORK_SHAPES.includes(tileShape)) return null;
	const artwork = resolveGenreArtwork(title, tileShape);
	return Object.freeze({
		title, tileShape,
		...(artwork ?? { coverImageUrl: "" }),
		hideTitle: artwork !== null,
		coverEmoji: artwork === null ? "🎬" : "",
	});
}
