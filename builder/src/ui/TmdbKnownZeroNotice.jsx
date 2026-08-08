export function TmdbKnownZeroNotice({ count, entity, media, canStillAdd = false }) {
	if (count?.status !== "ready" || count.count !== 0) return null;
	return (
		<span
			className="tmdb-known-zero-notice"
			role="status"
			data-tmdb-known-zero={`${entity}-${media}`}
		>
			TMDB currently returns no {media} for this {entity}.{canStillAdd ? " You can still add it." : ""}
		</span>
	);
}
