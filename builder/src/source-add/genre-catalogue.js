const reference = (name, tmdbId, mediaType) => Object.freeze({ name, tmdbId, mediaType });

export const OFFICIAL_GENRE_REFERENCES = Object.freeze([
	reference("Action", 28, "MOVIE"),
	reference("Adventure", 12, "MOVIE"),
	reference("Animation", 16, "MOVIE"),
	reference("Comedy", 35, "MOVIE"),
	reference("Crime", 80, "MOVIE"),
	reference("Documentary", 99, "MOVIE"),
	reference("Drama", 18, "MOVIE"),
	reference("Family", 10751, "MOVIE"),
	reference("Fantasy", 14, "MOVIE"),
	reference("History", 36, "MOVIE"),
	reference("Horror", 27, "MOVIE"),
	reference("Music", 10402, "MOVIE"),
	reference("Mystery", 9648, "MOVIE"),
	reference("Romance", 10749, "MOVIE"),
	reference("Science Fiction", 878, "MOVIE"),
	reference("TV Movie", 10770, "MOVIE"),
	reference("Thriller", 53, "MOVIE"),
	reference("War", 10752, "MOVIE"),
	reference("Western", 37, "MOVIE"),
	reference("Action & Adventure", 10759, "TV"),
	reference("Animation", 16, "TV"),
	reference("Comedy", 35, "TV"),
	reference("Crime", 80, "TV"),
	reference("Documentary", 99, "TV"),
	reference("Drama", 18, "TV"),
	reference("Family", 10751, "TV"),
	reference("Kids", 10762, "TV"),
	reference("Mystery", 9648, "TV"),
	reference("News", 10763, "TV"),
	reference("Reality", 10764, "TV"),
	reference("Sci-Fi & Fantasy", 10765, "TV"),
	reference("Soap", 10766, "TV"),
	reference("Talk", 10767, "TV"),
	reference("War & Politics", 10768, "TV"),
	reference("Western", 37, "TV"),
]);

const grouped = new Map();
for (const entry of OFFICIAL_GENRE_REFERENCES) {
	const concept = grouped.get(entry.name) ?? { name: entry.name, movieId: null, tvId: null };
	if (entry.mediaType === "MOVIE") concept.movieId = entry.tmdbId;
	else concept.tvId = entry.tmdbId;
	grouped.set(entry.name, concept);
}

export const GENRE_CONCEPTS = Object.freeze([...grouped.values()]
	.sort((left, right) => left.name.localeCompare(right.name, "en", { sensitivity: "base" }))
	.map((entry) => Object.freeze({
		...entry,
		shared: entry.movieId !== null && entry.tvId !== null,
	})));

export const EXACT_SHARED_GENRE_NAMES = Object.freeze(GENRE_CONCEPTS
	.filter((entry) => entry.shared)
	.map((entry) => entry.name));

const conceptsByName = new Map(GENRE_CONCEPTS.map((entry) => [entry.name, entry]));
const referencesByIdentity = new Map(OFFICIAL_GENRE_REFERENCES.map((entry) => [
	`${entry.mediaType}|${entry.tmdbId}`,
	entry,
]));

export function officialGenreConcept(name) {
	return conceptsByName.get(name) ?? null;
}

export function officialGenreReference(mediaType, tmdbId) {
	return referencesByIdentity.get(`${mediaType}|${tmdbId}`) ?? null;
}

export function searchGenreConcepts(query = "") {
	const normalized = typeof query === "string" ? query.trim().toLocaleLowerCase("en") : "";
	return normalized
		? Object.freeze(GENRE_CONCEPTS.filter((entry) => entry.name.toLocaleLowerCase("en").includes(normalized)))
		: GENRE_CONCEPTS;
}
