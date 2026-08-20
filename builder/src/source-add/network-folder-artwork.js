import {
	ARTWORK_ENTITY_TYPES,
	ARTWORK_ORIENTATIONS,
	ARTWORK_RESULT_STATUSES,
} from "../../../js/artwork-runtime.mjs";
import { buildTmdbNetworkLogoUrl } from "./network-catalogue.js";

export const NETWORK_ARTWORK_ORIENTATIONS = Object.freeze({
	POSTER: "POSTER",
	LANDSCAPE: "LANDSCAPE",
});
export const DEFAULT_NETWORK_ARTWORK_ORIENTATION = NETWORK_ARTWORK_ORIENTATIONS.POSTER;
export const DEFAULT_NETWORK_FOLDER_TILE_SHAPE = DEFAULT_NETWORK_ARTWORK_ORIENTATION;

function validNetwork(network) {
	return Number.isSafeInteger(network?.id)
		&& network.id > 0
		&& typeof network.name === "string"
		&& network.name.trim() === network.name
		&& network.name.length > 0;
}

function normalizedHttpsUrl(value) {
	if (typeof value !== "string" || value.trim() !== value || value.length === 0) return null;
	try {
		const url = new URL(value);
		return url.protocol === "https:" && url.username === "" && url.password === "" ? url.toString() : null;
	} catch {
		return null;
	}
}

function runtimeOrientation(orientation) {
	if (orientation === NETWORK_ARTWORK_ORIENTATIONS.POSTER) return ARTWORK_ORIENTATIONS.POSTER;
	if (orientation === NETWORK_ARTWORK_ORIENTATIONS.LANDSCAPE) return ARTWORK_ORIENTATIONS.LANDSCAPE;
	return null;
}

function fallbackArtwork(network, orientation) {
	const logoUrl = buildTmdbNetworkLogoUrl(network.logoPath, "w500");
	return Object.freeze({
		networkId: network.id,
		orientation,
		tileShape: orientation,
		source: logoUrl ? "tmdb-logo" : "emoji",
		previewUrl: logoUrl,
		folderEditable: Object.freeze(logoUrl
			? { coverImageUrl: logoUrl }
			: { coverImageUrl: "", coverEmoji: "📺" }),
	});
}

export async function resolveNetworkFolderArtworkBatch(networks, client, {
	orientation = DEFAULT_NETWORK_ARTWORK_ORIENTATION,
} = {}) {
	const requestedOrientation = runtimeOrientation(orientation);
	if (
		!Array.isArray(networks)
		|| networks.some((network) => !validNetwork(network))
		|| requestedOrientation === null
	) {
		throw new TypeError("Network artwork requires canonical cached Networks and a supported Poster or Landscape orientation.");
	}
	let runtimeAvailable = client && typeof client.load === "function" && typeof client.resolve === "function";
	if (runtimeAvailable) {
		try { await client.load(); } catch { runtimeAvailable = false; }
	}
	const resolved = [];
	for (const network of networks) {
		if (runtimeAvailable) {
			try {
				const artwork = await client.resolve({
					entityType: ARTWORK_ENTITY_TYPES.NETWORK,
					tmdbId: network.id,
					orientation: requestedOrientation,
				});
				const assetUrl = normalizedHttpsUrl(artwork?.assetUrl);
				if (
					artwork?.status === ARTWORK_RESULT_STATUSES.READY
					&& artwork.entityType === ARTWORK_ENTITY_TYPES.NETWORK
					&& artwork.tmdbId === network.id
					&& artwork.orientation === requestedOrientation
					&& assetUrl !== null
				) {
					resolved.push(Object.freeze({
						networkId: network.id,
						orientation,
						tileShape: orientation,
						source: "runtime",
						previewUrl: assetUrl,
						folderEditable: Object.freeze({ coverImageUrl: assetUrl }),
					}));
					continue;
				}
			} catch {
				// A single invalid or missing runtime record falls back to checked-in catalogue data.
			}
		}
		resolved.push(fallbackArtwork(network, orientation));
	}
	return Object.freeze(resolved);
}
