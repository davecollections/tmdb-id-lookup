const GENRE_WIDE_ARTWORK_NAMES = Object.freeze({
	Action: "action wide",
	"Action & Adventure": "action_and_adventure wide",
	Adventure: "adventure wide",
	Animation: "animation wide",
	Comedy: "comedy wide",
	Crime: "crime wide",
	Documentary: "documentary wide",
	Drama: "drama wide",
	Family: "family wide",
	Fantasy: "fantasy wide",
	History: "history wide",
	Horror: "horror wide",
	Kids: "kids wide",
	Music: "music wide",
	Mystery: "mystery wide",
	News: "news wide",
	Reality: "reality wide",
	Romance: "romance wide",
	"Sci-Fi & Fantasy": "sci-fi_and_fantasy wide",
	"Science Fiction": "science fiction wide",
	Soap: "soap wide",
	Talk: "talk wide",
	Thriller: "thriller wide",
	"TV Movie": "tv movie wide",
	War: "war wide",
	"War & Politics": "war_and_politics wide",
	Western: "western wide",
});

const GENRE_VERTICAL_ARTWORK_NAMES = Object.freeze({
	Action: "Action",
	"Action & Adventure": "action_and_adventure",
	Adventure: "Adventure",
	Animation: "Animation",
	Comedy: "Comedy",
	Crime: "crime",
	Documentary: "Documentary",
	Drama: "Drama",
	Family: "family",
	Fantasy: "Fantasy",
	History: "history",
	Horror: "Horror",
	Kids: "kids",
	Music: "Music",
	Mystery: "Mystery",
	News: "news",
	Reality: "reality",
	Romance: "Romance",
	"Sci-Fi & Fantasy": "sci-fi_and_fantasy",
	"Science Fiction": "Sci-Fi",
	Soap: "soap",
	Talk: "talk",
	Thriller: "Thriller",
	"TV Movie": "tv movie",
	War: "War",
	"War & Politics": "war_and_politics",
	Western: "Western",
});

export const GENRE_ARTWORK_SHAPES = Object.freeze(["LANDSCAPE", "POSTER"]);
export const DEFAULT_GENRE_ARTWORK_SHAPE = "LANDSCAPE";

const GENRE_ARTWORK_ROOTS = Object.freeze({
	LANDSCAPE: "https://raw.githubusercontent.com/davecollections/nuvio-assets/main/assets/collection_covers/genre/wide",
	POSTER: "https://raw.githubusercontent.com/davecollections/nuvio-assets/main/assets/collection_covers/genre/vertical",
});

const GENRE_ARTWORK_NAMES = Object.freeze({
	LANDSCAPE: GENRE_WIDE_ARTWORK_NAMES,
	POSTER: GENRE_VERTICAL_ARTWORK_NAMES,
});

export function genreArtworkUrl(genreName, tileShape = DEFAULT_GENRE_ARTWORK_SHAPE) {
	const artworkName = GENRE_ARTWORK_NAMES[tileShape]?.[genreName];
	const artworkRoot = GENRE_ARTWORK_ROOTS[tileShape];
	return artworkName && artworkRoot ? `${artworkRoot}/${encodeURIComponent(artworkName)}.jpg` : null;
}

export function genreWideArtworkUrl(genreName) {
	return genreArtworkUrl(genreName, "LANDSCAPE");
}

export function buildGenreFolderEditable(genreName, { tileShape = DEFAULT_GENRE_ARTWORK_SHAPE } = {}) {
	const title = typeof genreName === "string" ? genreName.trim() : "";
	if (!title || title !== genreName || !GENRE_ARTWORK_SHAPES.includes(tileShape)) return null;
	const coverImageUrl = genreArtworkUrl(title, tileShape);
	return Object.freeze({
		title,
		tileShape,
		coverImageUrl: coverImageUrl ?? "",
		hideTitle: coverImageUrl !== null,
		coverEmoji: coverImageUrl === null ? "🎬" : "",
	});
}
