const explicitSingleWords = new Set([
	"bondage",
	"porn",
	"pornographic",
	"pornography",
	"pornstar",
	"pornstars",
	"sexploitation",
]);

const explicitPhrases = Object.freeze([
	["adult", "film"],
	["adult", "films"],
	["hardcore", "porn"],
	["hardcore", "sex"],
]);

export function normalizedWords(value) {
	if (typeof value !== "string") return [];
	return value
		.normalize("NFKC")
		.toLocaleLowerCase("en")
		.match(/[\p{L}\p{N}]+/gu) ?? [];
}

export function containsClearlyExplicitSexualText(...values) {
	const words = values.flatMap((value) => normalizedWords(value));
	if (words.some((word) => explicitSingleWords.has(word))) return true;
	return explicitPhrases.some((phrase) => (
		words.some((word, index) => phrase.every(
			(phraseWord, phraseIndex) => words[index + phraseIndex] === phraseWord,
		))
	));
}

export function collectionTextIsSafe(collection) {
	return !containsClearlyExplicitSexualText(
		collection?.name,
		collection?.overview,
	);
}

export function collectionMatchesWholeWordQuery(collection, query) {
	const queryWords = normalizedWords(query);
	if (queryWords.length === 0) return true;
	const titleWords = new Set(normalizedWords(collection?.name));
	return queryWords.every((word) => titleWords.has(word));
}

export function adultFlagIsSafe(value) {
	return (
		value !== null
		&& typeof value === "object"
		&& (!Object.hasOwn(value, "adult") || value.adult === false)
	);
}
