import { useEffect, useState } from "react";
import { buildTmdbLogoUrl } from "../source-add/tmdb-entity-catalogue.js";

export function TmdbEntityLogo({ entity, entityType, size = "w92", context = "result", loading = "lazy" }) {
	const source = buildTmdbLogoUrl(entity.logoPath, size);
	const [failed, setFailed] = useState(false);
	useEffect(() => setFailed(false), [source]);
	return (
		<span
			className={`studio-logo-tile studio-logo-tile--${context} tmdb-entity-logo-tile tmdb-entity-logo-tile--${context}`}
			data-logo-state={source && !failed ? "ready" : failed ? "error" : "missing"}
			data-entity-logo={entityType}
		>
			{source && !failed ? (
				<img
					className="studio-logo-image tmdb-entity-logo-image"
					src={source}
					alt={`${entity.name} logo`}
					loading={loading}
					decoding="async"
					onError={() => setFailed(true)}
				/>
			) : (
				<span className="studio-logo-fallback tmdb-entity-logo-fallback" role="img" aria-label={`${entity.name} logo unavailable`}>
					<span aria-hidden="true">{context === "result" ? "No logo" : "No logo available"}</span>
				</span>
			)}
		</span>
	);
}
