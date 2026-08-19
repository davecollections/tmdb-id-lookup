export const TMDB_IMAGE_ORIGIN = "https://image.tmdb.org";

const supportedPosterSizes = new Set(["w185", "w342", "w500"]);
const safePosterPathPattern = /^\/[A-Za-z0-9._-]+$/;

export function normalizeTmdbPosterPath(value) {
	return typeof value === "string" && safePosterPathPattern.test(value)
		? value
		: null;
}

export function buildTmdbPosterUrl(posterPath, size = "w185") {
	const normalizedPath = normalizeTmdbPosterPath(posterPath);
	if (normalizedPath === null || !supportedPosterSizes.has(size)) return null;
	return new URL(`/t/p/${size}${normalizedPath}`, TMDB_IMAGE_ORIGIN).toString();
}
