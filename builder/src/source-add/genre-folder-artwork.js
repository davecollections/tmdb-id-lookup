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

const GENRE_ARTWORK_ROOT = "https://raw.githubusercontent.com/davecollections/nuvio-assets/main/assets/collection_covers/genre/wide";

export function genreWideArtworkUrl(genreName) {
	const artworkName = GENRE_WIDE_ARTWORK_NAMES[genreName];
	return artworkName ? `${GENRE_ARTWORK_ROOT}/${encodeURIComponent(artworkName)}.jpg` : null;
}

export function buildGenreFolderEditable(genreName) {
	const title = typeof genreName === "string" ? genreName.trim() : "";
	if (!title || title !== genreName) return null;
	const coverImageUrl = genreWideArtworkUrl(title);
	return Object.freeze({
		title,
		tileShape: "LANDSCAPE",
		coverImageUrl: coverImageUrl ?? "",
		hideTitle: coverImageUrl !== null,
		coverEmoji: coverImageUrl === null ? "🎬" : "",
	});
}
