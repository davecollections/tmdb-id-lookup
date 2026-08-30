import { isPositiveSafeTmdbId } from "./tmdb-collection-input.js";

const TMDB_WEB_ORIGIN = "https://www.themoviedb.org";
const REVIEW_ENTITY_ROUTES = Object.freeze({
	company: "company",
	collection: "collection",
	list: "list",
	network: "network",
	person: "person",
});

export function buildTmdbEntityPageUrl(entityType, tmdbId) {
	const route = REVIEW_ENTITY_ROUTES[entityType];
	if (route === undefined || !isPositiveSafeTmdbId(tmdbId)) return null;
	return `${TMDB_WEB_ORIGIN}/${route}/${tmdbId}`;
}
