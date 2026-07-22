import {
	ARTWORK_ENTITY_TYPES,
	ARTWORK_ORIENTATIONS,
	createArtworkRuntimeClient,
} from "./artwork-runtime.mjs";

const SUPPORTED_V1_ENTITY_TYPES = new Set([
	ARTWORK_ENTITY_TYPES.COMPANY,
	ARTWORK_ENTITY_TYPES.NETWORK,
]);

export function createV1ArtworkRuntimeBridge(options = {}) {
	const client = options.client || createArtworkRuntimeClient(options);

	return Object.freeze({
		async resolveLandscapeBatch({ entityType, tmdbIds } = {}) {
			if (!SUPPORTED_V1_ENTITY_TYPES.has(entityType)) {
				throw new TypeError(`Unsupported v1 artwork entity type: ${String(entityType)}`);
			}

			if (!Array.isArray(tmdbIds)) {
				throw new TypeError("V1 artwork TMDB IDs must be supplied as an array.");
			}

			return Promise.all(
				tmdbIds.map((tmdbId) =>
					client.resolve({
						entityType,
						tmdbId,
						orientation: ARTWORK_ORIENTATIONS.LANDSCAPE,
					}),
				),
			);
		},
	});
}

export function installV1ArtworkRuntimeBridge(target = globalThis, bridge = createV1ArtworkRuntimeBridge()) {
	if (target.nuvioArtworkRuntime) {
		return target.nuvioArtworkRuntime;
	}

	Object.defineProperty(target, "nuvioArtworkRuntime", {
		configurable: false,
		enumerable: false,
		writable: false,
		value: bridge,
	});

	return bridge;
}

if (typeof window !== "undefined" && window.document) {
	installV1ArtworkRuntimeBridge(window);
}
