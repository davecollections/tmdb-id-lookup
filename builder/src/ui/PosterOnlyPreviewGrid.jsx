import { useState } from "react";
import { buildTmdbPosterUrl } from "../source-add/index.js";

function posterCandidates(items, size) {
	if (!Array.isArray(items)) return [];
	return items.map((item, index) => Object.freeze({
		item,
		index,
		source: buildTmdbPosterUrl(item?.posterPath, size),
	})).filter((candidate) => candidate.source !== null);
}

export function PosterOnlyPreviewGrid({
	items,
	limit = 10,
	size = "w342",
	className = "",
	ariaLabel = "Title poster preview",
	altPrefix = "Title",
	emptyMessage = "No posters available.",
}) {
	const [failedSources, setFailedSources] = useState(() => new Set());
	const visible = posterCandidates(items, size)
		.filter((candidate) => !failedSources.has(candidate.source))
		.slice(0, limit);
	if (visible.length === 0) {
		return <p className="add-source-empty-results preview-posters-empty" data-preview-empty-state="true">{emptyMessage}</p>;
	}
	return (
		<div className={`poster-only-preview-grid${className ? ` ${className}` : ""}`} data-preview-poster-only="true" data-preview-poster-count={visible.length} aria-label={ariaLabel}>
			{visible.map((candidate, index) => <img
				key={`${candidate.source}|${candidate.index}`}
				src={candidate.source}
				alt={`${altPrefix} preview poster ${index + 1}`}
				loading="lazy"
				onError={() => setFailedSources((current) => {
					const next = new Set(current);
					next.add(candidate.source);
					return next;
				})}
			/>) }
		</div>
	);
}
