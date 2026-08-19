import { buildTmdbPosterUrl, normalizeTmdbPosterPath } from "./tmdb-image.js";
import { isPositiveSafeTmdbId } from "./tmdb-collection-input.js";

export const DEFAULT_FRANCHISE_FOLDER_TILE_SHAPE = "POSTER";

export function resolveFranchiseFolderArtwork(franchise) {
	if (!isPositiveSafeTmdbId(franchise?.id)) {
		throw new TypeError("Franchise artwork requires a canonical TMDB collection.");
	}
	const posterPath = normalizeTmdbPosterPath(franchise.posterPath);
	const previewUrl = posterPath === null ? null : buildTmdbPosterUrl(posterPath, "w500");
	return Object.freeze({
		franchiseId: franchise.id,
		tileShape: DEFAULT_FRANCHISE_FOLDER_TILE_SHAPE,
		source: posterPath === null ? "emoji" : "poster",
		previewUrl,
		folderEditable: Object.freeze(previewUrl === null
			? { coverImageUrl: "", coverEmoji: "🎬" }
			: { coverImageUrl: previewUrl }),
	});
}
