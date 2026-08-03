import { buildTmdbEntityPageUrl } from "../source-add/index.js";

const entityLabels = Object.freeze({
	collection: "collection",
	person: "person",
});

export function TmdbEntityLink({ entityType, tmdbId, entityName = null }) {
	const href = buildTmdbEntityPageUrl(entityType, tmdbId);
	if (href === null) return null;
	const entityLabel = entityLabels[entityType];
	const subject = typeof entityName === "string" && entityName.trim().length > 0
		? entityName.trim()
		: `TMDB ${entityLabel}`;
	return (
		<a
			className="tmdb-entity-link"
			href={href}
			target="_blank"
			rel="noopener noreferrer"
			aria-label={`Open ${subject} on TMDB (${entityLabel} ${tmdbId})`}
		>
			<span>TMDB {tmdbId}</span>
			<span className="tmdb-entity-link-indicator" aria-hidden="true">↗</span>
		</a>
	);
}
