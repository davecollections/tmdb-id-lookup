export const DEFAULT_ARTWORK_BASE_URL = "https://raw.githubusercontent.com/davecollections/nuvio-assets/main/";
export const DEFAULT_ARTWORK_RUNTIME_PATH = "assets/collection_covers/runtime-lookup.json";

export const ARTWORK_ENTITY_TYPES = Object.freeze({
	COMPANY: "company",
	NETWORK: "network",
	PERSON: "person",
});

export const ARTWORK_ORIENTATIONS = Object.freeze({
	LANDSCAPE: "landscape",
	POSTER: "poster",
});

export const ARTWORK_RESULT_STATUSES = Object.freeze({
	READY: "ready",
	MISSING: "missing",
	UNSUPPORTED_ORIENTATION: "unsupported-orientation",
});

const ENTITY_MAP_NAMES = Object.freeze({
	[ARTWORK_ENTITY_TYPES.COMPANY]: "companies",
	[ARTWORK_ENTITY_TYPES.NETWORK]: "networks",
	[ARTWORK_ENTITY_TYPES.PERSON]: "people",
});

const REQUIRED_ORIENTATIONS = Object.freeze({
	[ARTWORK_ENTITY_TYPES.COMPANY]: Object.freeze([ARTWORK_ORIENTATIONS.LANDSCAPE]),
	[ARTWORK_ENTITY_TYPES.NETWORK]: Object.freeze([ARTWORK_ORIENTATIONS.LANDSCAPE]),
	[ARTWORK_ENTITY_TYPES.PERSON]: Object.freeze([
		ARTWORK_ORIENTATIONS.LANDSCAPE,
		ARTWORK_ORIENTATIONS.POSTER,
	]),
});

const VALID_PERSON_CATEGORIES = new Set(["actor", "director"]);
const ID_KEY_PATTERN = /^[1-9][0-9]*$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export class ArtworkRuntimeError extends Error {
	constructor(code, message, options = {}) {
		super(message);
		this.name = "ArtworkRuntimeError";
		this.code = code;

		if (Object.hasOwn(options, "cause")) {
			this.cause = options.cause;
		}
	}
}

function invalid(code, message, options) {
	throw new ArtworkRuntimeError(code, message, options);
}

function isObjectRecord(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertEntityType(entityType) {
	if (!Object.hasOwn(ENTITY_MAP_NAMES, entityType)) {
		invalid("INVALID_ENTITY_TYPE", `Unsupported artwork entity type: ${String(entityType)}`);
	}
}

function assertOrientation(orientation) {
	if (!Object.values(ARTWORK_ORIENTATIONS).includes(orientation)) {
		invalid("INVALID_ORIENTATION", `Unsupported artwork orientation: ${String(orientation)}`);
	}
}

function assertPositiveTmdbId(tmdbId) {
	if (!Number.isSafeInteger(tmdbId) || tmdbId <= 0) {
		invalid("INVALID_TMDB_ID", "TMDB ID must be a positive safe integer.");
	}
}

function assertSha256(value, context) {
	if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
		invalid("INVALID_SHA256", `${context} must be a lowercase 64-character SHA-256.`);
	}
}

function assertRepositoryRelativePath(value, context) {
	if (
		typeof value !== "string" ||
		value.length === 0 ||
		value !== value.trim() ||
		value.includes("\\") ||
		value.includes("?") ||
		value.includes("#") ||
		value.startsWith("/") ||
		/^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)
	) {
		invalid("INVALID_PATH", `${context} must be a repository-relative path.`);
	}

	const segments = value.split("/");

	for (const segment of segments) {
		let decodedSegment;

		try {
			decodedSegment = decodeURIComponent(segment);
		} catch (cause) {
			invalid("INVALID_PATH", `${context} contains invalid URL encoding.`, { cause });
		}

		if (
			segment.length === 0 ||
			decodedSegment === "." ||
			decodedSegment === ".." ||
			decodedSegment.includes("/") ||
			decodedSegment.includes("\\")
		) {
			invalid("INVALID_PATH", `${context} must not contain empty or traversal path segments.`);
		}
	}
}

function assertCategories(categories, context, required) {
	if (categories === undefined && !required) {
		return;
	}

	if (!Array.isArray(categories) || categories.length < 1 || categories.length > 2) {
		invalid("INVALID_CATEGORIES", `${context} must contain one or two person categories.`);
	}

	const uniqueCategories = new Set(categories);

	if (
		uniqueCategories.size !== categories.length ||
		categories.some((category) => !VALID_PERSON_CATEGORIES.has(category))
	) {
		invalid("INVALID_CATEGORIES", `${context} may contain unique actor and/or director values only.`);
	}
}

function validateOrientationArtwork(artwork, context) {
	if (!isObjectRecord(artwork)) {
		invalid("INVALID_ORIENTATION_DATA", `${context} must be an object.`);
	}

	assertRepositoryRelativePath(artwork.path, `${context}.path`);
	assertSha256(artwork.sha256, `${context}.sha256`);
}

function validateEntry(entry, entityType, key) {
	const context = `${ENTITY_MAP_NAMES[entityType]}.${key}`;

	if (!isObjectRecord(entry)) {
		invalid("INVALID_ENTRY", `${context} must be an object.`);
	}

	if (!Number.isSafeInteger(entry.id) || entry.id <= 0 || String(entry.id) !== key) {
		invalid("ENTRY_ID_MISMATCH", `${context}.id must match its positive numeric object key.`);
	}

	if (typeof entry.name !== "string" || entry.name.trim().length === 0) {
		invalid("INVALID_ENTRY_NAME", `${context}.name must be a non-empty string.`);
	}

	if (entry.status !== "published") {
		invalid("INVALID_ENTRY_STATUS", `${context}.status must be published.`);
	}

	if (entry.reviewRequired !== false) {
		invalid("UNSAFE_ENTRY", `${context}.reviewRequired must be false for automatic use.`);
	}

	if (typeof entry.fallbackUsed !== "boolean") {
		invalid("INVALID_FALLBACK_FLAG", `${context}.fallbackUsed must be a boolean.`);
	}

	assertCategories(entry.categories, `${context}.categories`, entityType === ARTWORK_ENTITY_TYPES.PERSON);

	for (const orientation of REQUIRED_ORIENTATIONS[entityType]) {
		validateOrientationArtwork(entry[orientation], `${context}.${orientation}`);
	}
}

function normalizedBaseUrl(baseUrl) {
	if (typeof baseUrl !== "string" || baseUrl.length === 0) {
		invalid("INVALID_BASE_URL", "Artwork base URL must be a non-empty absolute HTTP(S) URL.");
	}

	let url;

	try {
		url = new URL(baseUrl);
	} catch (cause) {
		invalid("INVALID_BASE_URL", "Artwork base URL must be a valid absolute URL.", { cause });
	}

	if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
		invalid("INVALID_BASE_URL", "Artwork base URL must be an HTTP(S) URL without credentials, query, or hash.");
	}

	url.pathname = `${url.pathname.replace(/\/+$/, "")}/`;
	return url;
}

function resolveRepositoryUrl(baseUrl, relativePath) {
	assertRepositoryRelativePath(relativePath, "Artwork repository path");
	return new URL(relativePath, normalizedBaseUrl(baseUrl));
}

function buildVersionedAssetUrl(baseUrl, relativePath, sha256) {
	assertSha256(sha256, "Artwork SHA-256");
	const url = resolveRepositoryUrl(baseUrl, relativePath);
	url.searchParams.set("v", sha256.slice(0, 12));
	return url.toString();
}

function resolveValidatedArtwork({ lookup, entityType, tmdbId, orientation, baseUrl }) {
	assertEntityType(entityType);
	assertPositiveTmdbId(tmdbId);
	assertOrientation(orientation);

	const baseResult = {
		status: null,
		entityType,
		tmdbId,
		orientation,
	};

	if (!REQUIRED_ORIENTATIONS[entityType].includes(orientation)) {
		return {
			...baseResult,
			status: ARTWORK_RESULT_STATUSES.UNSUPPORTED_ORIENTATION,
		};
	}

	const entityMap = lookup[ENTITY_MAP_NAMES[entityType]];
	const key = String(tmdbId);
	const entry = Object.hasOwn(entityMap, key) ? entityMap[key] : undefined;

	if (entry === undefined) {
		return {
			...baseResult,
			status: ARTWORK_RESULT_STATUSES.MISSING,
		};
	}

	validateEntry(entry, entityType, key);
	const artwork = entry[orientation];
	const result = {
		...baseResult,
		status: ARTWORK_RESULT_STATUSES.READY,
		name: entry.name,
		relativePath: artwork.path,
		assetUrl: buildVersionedAssetUrl(baseUrl, artwork.path, artwork.sha256),
		sha256: artwork.sha256,
		fallbackUsed: entry.fallbackUsed,
	};

	if (entityType === ARTWORK_ENTITY_TYPES.PERSON) {
		result.categories = [...entry.categories];
	}

	return result;
}

export function validateArtworkRuntimeLookup(lookup) {
	if (!isObjectRecord(lookup)) {
		invalid("INVALID_LOOKUP", "Artwork runtime lookup root must be an object.");
	}

	if (lookup.schemaVersion !== 1) {
		invalid("INVALID_SCHEMA_VERSION", "Artwork runtime lookup schemaVersion must be 1.");
	}

	if (lookup.status !== "published") {
		invalid("INVALID_LOOKUP_STATUS", "Artwork runtime lookup status must be published.");
	}

	for (const [entityType, mapName] of Object.entries(ENTITY_MAP_NAMES)) {
		const entityMap = Object.hasOwn(lookup, mapName) ? lookup[mapName] : undefined;

		if (!isObjectRecord(entityMap)) {
			invalid("INVALID_ENTITY_MAP", `Artwork runtime lookup ${mapName} must be an object.`);
		}

		for (const key of Object.keys(entityMap)) {
			if (!ID_KEY_PATTERN.test(key)) {
				invalid("INVALID_MAP_KEY", `Artwork runtime lookup ${mapName} key must be a positive numeric ID: ${key}`);
			}

			validateEntry(entityMap[key], entityType, key);
		}
	}

	return lookup;
}

export function resolveArtworkRuntime({
	lookup,
	entityType,
	tmdbId,
	orientation,
	baseUrl = DEFAULT_ARTWORK_BASE_URL,
} = {}) {
	validateArtworkRuntimeLookup(lookup);
	return resolveValidatedArtwork({ lookup, entityType, tmdbId, orientation, baseUrl });
}

export function createArtworkRuntimeClient({
	baseUrl = DEFAULT_ARTWORK_BASE_URL,
	runtimeLookupPath = DEFAULT_ARTWORK_RUNTIME_PATH,
	fetchImpl = typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : undefined,
} = {}) {
	const normalizedBase = normalizedBaseUrl(baseUrl).toString();
	const runtimeLookupUrl = resolveRepositoryUrl(normalizedBase, runtimeLookupPath).toString();

	if (typeof fetchImpl !== "function") {
		invalid("FETCH_UNAVAILABLE", "Artwork runtime loading requires a fetch implementation.");
	}

	let cachedLookup;
	let pendingLoad;

	function fetchLookup() {
		return Promise.resolve()
			.then(() => fetchImpl(runtimeLookupUrl))
			.catch((cause) => {
				throw new ArtworkRuntimeError("FETCH_FAILED", `Artwork runtime request failed: ${runtimeLookupUrl}`, { cause });
			})
			.then((response) => {
				if (!isObjectRecord(response) || typeof response.json !== "function") {
					invalid("INVALID_FETCH_RESPONSE", "Artwork runtime fetch returned an invalid response object.");
				}

				if (response.ok !== true) {
					const status = Number.isInteger(response.status) ? ` (${response.status})` : "";
					invalid("HTTP_ERROR", `Artwork runtime request was not successful${status}: ${runtimeLookupUrl}`);
				}

				return Promise.resolve()
					.then(() => response.json())
					.catch((cause) => {
						throw new ArtworkRuntimeError("INVALID_JSON", "Artwork runtime response did not contain valid JSON.", {
							cause,
						});
					});
			})
			.then((lookup) => validateArtworkRuntimeLookup(lookup));
	}

	function load() {
		if (cachedLookup !== undefined) {
			return Promise.resolve(cachedLookup);
		}

		if (pendingLoad !== undefined) {
			return pendingLoad;
		}

		pendingLoad = fetchLookup().then(
			(lookup) => {
				cachedLookup = lookup;
				pendingLoad = undefined;
				return lookup;
			},
			(error) => {
				pendingLoad = undefined;
				throw error;
			},
		);

		return pendingLoad;
	}

	async function resolve({ entityType, tmdbId, orientation } = {}) {
		const lookup = await load();
		return resolveValidatedArtwork({
			lookup,
			entityType,
			tmdbId,
			orientation,
			baseUrl: normalizedBase,
		});
	}

	return Object.freeze({
		baseUrl: normalizedBase,
		runtimeLookupPath,
		runtimeLookupUrl,
		load,
		resolve,
	});
}
