import {
	ARTWORK_ENTITY_TYPES,
	ARTWORK_ORIENTATIONS,
	ARTWORK_RESULT_STATUSES,
} from "../../../js/artwork-runtime.mjs";
import { buildTmdbStudioLogoUrl } from "./studio-catalogue.js";

export const DEFAULT_STUDIO_FOLDER_TILE_SHAPE = "LANDSCAPE";

function validStudio(studio) {
	return Number.isSafeInteger(studio?.id)
		&& studio.id > 0
		&& typeof studio.name === "string"
		&& studio.name.trim() === studio.name
		&& studio.name.length > 0;
}

function fallbackArtwork(studio) {
	const logoUrl = buildTmdbStudioLogoUrl(studio.logoPath, "w500");
	return Object.freeze({
		studioId: studio.id,
		tileShape: DEFAULT_STUDIO_FOLDER_TILE_SHAPE,
		source: logoUrl ? "tmdb-logo" : "emoji",
		previewUrl: logoUrl,
		folderEditable: Object.freeze(logoUrl
			? { coverImageUrl: logoUrl }
			: { coverImageUrl: "", coverEmoji: "🎬" }),
	});
}

export async function resolveStudioFolderArtworkBatch(studios, client) {
	if (!Array.isArray(studios) || studios.some((studio) => !validStudio(studio))) {
		throw new TypeError("Studio artwork requires canonical cached Studio selections.");
	}
	let runtimeAvailable = client && typeof client.load === "function" && typeof client.resolve === "function";
	if (runtimeAvailable) {
		try { await client.load(); } catch { runtimeAvailable = false; }
	}
	const resolved = [];
	for (const studio of studios) {
		if (runtimeAvailable) {
			try {
				const artwork = await client.resolve({
					entityType: ARTWORK_ENTITY_TYPES.COMPANY,
					tmdbId: studio.id,
					orientation: ARTWORK_ORIENTATIONS.LANDSCAPE,
				});
				if (artwork?.status === ARTWORK_RESULT_STATUSES.READY && typeof artwork.assetUrl === "string") {
					resolved.push(Object.freeze({
						studioId: studio.id,
						tileShape: DEFAULT_STUDIO_FOLDER_TILE_SHAPE,
						source: "runtime",
						previewUrl: artwork.assetUrl,
						folderEditable: Object.freeze({ coverImageUrl: artwork.assetUrl }),
					}));
					continue;
				}
			} catch {
				// A single invalid/missing runtime record falls back to checked-in catalogue data.
			}
		}
		resolved.push(fallbackArtwork(studio));
	}
	return Object.freeze(resolved);
}
