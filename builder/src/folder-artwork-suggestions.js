import {
	ARTWORK_ENTITY_TYPES,
	ARTWORK_ORIENTATIONS,
	ARTWORK_RESULT_STATUSES,
	expectedArtworkPath,
} from "../../js/artwork-runtime.mjs";
import { genreArtworkUrl } from "./source-add/genre-folder-artwork.js";
import { GENRE_COMPOSITE_PLACEMENT_RULES } from "./source-add/genre-hierarchy-structures.js";
import { networkSourceIdentity } from "./source-add/network-source.js";
import { resolvePersonFolderArtwork } from "./source-add/person-folder-artwork.js";
import { peopleSourceIdentity } from "./source-add/person-source.js";
import { buildTmdbNetworkLogoUrl } from "./source-add/network-catalogue.js";
import { buildTmdbStudioLogoUrl } from "./source-add/studio-catalogue.js";
import { studioSourceIdentity } from "./source-add/studio-source.js";
import { inspectEditableGenreSource } from "./source-edit/genre-editor.js";

export const FOLDER_ARTWORK_AUTHORITIES = Object.freeze({
	PEOPLE: "people",
	STUDIO: "studio",
	NETWORK: "network",
	GENRE: "genre",
});

export const FOLDER_ARTWORK_CLASSIFICATIONS = Object.freeze({
	NONE: "none",
	CURATED: "curated",
	TMDB_FALLBACK: "tmdb-fallback",
	CUSTOM_UNKNOWN: "custom-unknown",
});

const SUGGESTED_FIELDS = Object.freeze([
	"coverImageUrl",
	"heroBackdropUrl",
	"titleLogoUrl",
	"focusGifUrl",
]);

const REQUEST_REPOSITORIES = Object.freeze({
	[FOLDER_ARTWORK_AUTHORITIES.PEOPLE]: "davecollections/nuvio-people-assets",
	[FOLDER_ARTWORK_AUTHORITIES.STUDIO]: "davecollections/nuvio-assets",
	[FOLDER_ARTWORK_AUTHORITIES.NETWORK]: "davecollections/nuvio-assets",
	[FOLDER_ARTWORK_AUTHORITIES.GENRE]: "davecollections/nuvio-assets",
});

const AUTHORITY_LABELS = Object.freeze({
	[FOLDER_ARTWORK_AUTHORITIES.PEOPLE]: "People",
	[FOLDER_ARTWORK_AUTHORITIES.STUDIO]: "Studio",
	[FOLDER_ARTWORK_AUTHORITIES.NETWORK]: "Network",
	[FOLDER_ARTWORK_AUTHORITIES.GENRE]: "Genre",
});

const PEOPLE_REQUEST_SLOTS = Object.freeze([
	Object.freeze({ field: "coverImageUrl", tileShape: "POSTER", artworkField: "Tile", titleLabel: "Poster Tile", orientation: "Poster", filename: "poster.webp" }),
	Object.freeze({ field: "coverImageUrl", tileShape: "LANDSCAPE", artworkField: "Tile", titleLabel: "Landscape Tile", orientation: "Landscape", filename: "landscape.webp" }),
	Object.freeze({ field: "heroBackdropUrl", tileShape: null, artworkField: "Hero / Background", titleLabel: "Hero / Background", orientation: null, filename: "hero.webp" }),
	Object.freeze({ field: "titleLogoUrl", tileShape: null, artworkField: "Title Logo", titleLabel: "Title Logo", orientation: null, filename: "title-logo.png" }),
	Object.freeze({ field: "focusGifUrl", tileShape: "POSTER", artworkField: "Focus", titleLabel: "Focus (Poster)", orientation: "Poster", filename: "focus-poster.webp" }),
	Object.freeze({ field: "focusGifUrl", tileShape: "LANDSCAPE", artworkField: "Focus", titleLabel: "Focus (Landscape)", orientation: "Landscape", filename: "focus-landscape.webp" }),
]);

function requestSlotKey(field, tileShape) {
	return `${field}\u0000${field === "coverImageUrl" || field === "focusGifUrl" ? tileShape : ""}`;
}

function freezeRequestSlot(slot, expectedPath) {
	return Object.freeze({
		field: slot.field,
		tileShape: slot.tileShape,
		artworkField: slot.artworkField,
		titleLabel: slot.titleLabel,
		orientation: slot.orientation,
		expectedPath,
	});
}

function exactNativeSources(folder) {
	if (folder?.nodeType !== "folder" || !Array.isArray(folder.sources) || folder.sources.length === 0) return null;
	if (folder.sources.some((source) => source?.nodeType !== "source" || source.category !== "native-tmdb")) return null;
	return folder.sources;
}

function exactSharedTmdbId(sources, identityForSource) {
	const ids = [];
	for (const source of sources) {
		if (identityForSource(source.editable) === null) return null;
		const rawId = source.editable?.tmdbId;
		const id = typeof rawId === "string" && /^\d+$/.test(rawId) ? Number(rawId) : rawId;
		if (!Number.isSafeInteger(id) || id <= 0) return null;
		ids.push(id);
	}
	return new Set(ids).size === 1 ? ids[0] : null;
}

function exactGenreConcept(sources) {
	const inspected = sources.map((source) => inspectEditableGenreSource(source));
	if (inspected.some((entry) => entry === null)) return null;

	const pairs = inspected.map((entry) => `${entry.genreName}\u0000${entry.mediaType}`);
	if (new Set(pairs).size !== pairs.length) return null;

	const genreNames = new Set(inspected.map((entry) => entry.genreName));
	if (genreNames.size === 1 && inspected.length <= 2) return inspected[0].genreName;
	if (inspected.length !== 2) return null;

	const movie = inspected.find((entry) => entry.mediaType === "MOVIE");
	const series = inspected.find((entry) => entry.mediaType === "TV");
	if (!movie || !series) return null;
	const rule = GENRE_COMPOSITE_PLACEMENT_RULES.find((entry) => (
		entry.genreName === series.genreName && entry.targetNames.includes(movie.genreName)
	));
	return rule ? movie.genreName : null;
}

export function resolveFolderArtworkIdentity(folder) {
	const sources = exactNativeSources(folder);
	if (sources === null) return null;

	const personId = exactSharedTmdbId(sources, peopleSourceIdentity);
	if (personId !== null) {
		return Object.freeze({ authority: FOLDER_ARTWORK_AUTHORITIES.PEOPLE, tmdbId: personId, key: `people:${personId}` });
	}

	const studioId = exactSharedTmdbId(sources, studioSourceIdentity);
	if (studioId !== null) {
		return Object.freeze({ authority: FOLDER_ARTWORK_AUTHORITIES.STUDIO, tmdbId: studioId, key: `studio:${studioId}` });
	}

	const networkId = exactSharedTmdbId(sources, networkSourceIdentity);
	if (networkId !== null) {
		return Object.freeze({ authority: FOLDER_ARTWORK_AUTHORITIES.NETWORK, tmdbId: networkId, key: `network:${networkId}` });
	}

	const genreName = exactGenreConcept(sources);
	return genreName === null
		? null
		: Object.freeze({ authority: FOLDER_ARTWORK_AUTHORITIES.GENRE, genreName, key: `genre:${genreName}` });
}

function normalizedHttpsUrl(value) {
	if (typeof value !== "string" || value.length === 0 || value.trim() !== value) return null;
	try {
		const url = new URL(value);
		return url.protocol === "https:" && url.username === "" && url.password === "" ? value : null;
	} catch {
		return null;
	}
}

function emptyCuratedFields() {
	return {
		coverImageUrl: {},
		heroBackdropUrl: null,
		titleLogoUrl: null,
		focusGifUrl: {},
	};
}

function freezeSuggestionSet(identity, curated, {
	canonicalName,
	repository,
	requestSlots = [],
	tmdbFallbackUrls = {},
} = {}) {
	const frozenCurated = Object.freeze({
		coverImageUrl: Object.freeze({ ...curated.coverImageUrl }),
		heroBackdropUrl: curated.heroBackdropUrl ?? null,
		titleLogoUrl: curated.titleLogoUrl ?? null,
		focusGifUrl: Object.freeze({ ...curated.focusGifUrl }),
	});
	const frozenFallbacks = Object.freeze(Object.fromEntries(SUGGESTED_FIELDS.map((field) => [
		field,
		Object.freeze([...(tmdbFallbackUrls[field] ?? [])]),
	])));
	return Object.freeze({
		identity,
		canonicalName,
		repository,
		curated: frozenCurated,
		requestSlots: Object.freeze(Object.fromEntries(requestSlots.map((slot) => [
			requestSlotKey(slot.field, slot.tileShape),
			slot,
		]))),
		tmdbFallbackUrls: frozenFallbacks,
	});
}

async function loadCanonicalPerson(peopleProvider, tmdbId) {
	if (!peopleProvider || typeof peopleProvider.getPerson !== "function") return null;
	try {
		const result = await peopleProvider.getPerson(tmdbId);
		const person = result?.ok ? result.data : null;
		return person?.id === tmdbId && typeof person.name === "string" && person.name.trim() === person.name
			? person
			: null;
	} catch {
		return null;
	}
}

async function loadPeopleSuggestions(identity, peopleManifestClient, peopleProvider) {
	if (!peopleManifestClient || typeof peopleManifestClient.load !== "function") return null;
	let manifestResult;
	try {
		manifestResult = await peopleManifestClient.load();
	} catch {
		return null;
	}
	if (!manifestResult?.ok || !manifestResult.data?.byId) return null;
	const manifestRecord = manifestResult.data.byId[identity.tmdbId] ?? null;
	const canonicalPerson = manifestRecord === null ? await loadCanonicalPerson(peopleProvider, identity.tmdbId) : null;
	const canonicalName = manifestRecord?.canonicalName ?? canonicalPerson?.name ?? null;
	if (canonicalName === null) return null;

	const curated = emptyCuratedFields();
	if (manifestRecord !== null) {
		const person = Object.freeze({ id: identity.tmdbId, peopleManifestRecord: manifestRecord });
		const poster = resolvePersonFolderArtwork({ person, tileShape: "POSTER", manifestRecord });
		const landscape = resolvePersonFolderArtwork({ person, tileShape: "LANDSCAPE", manifestRecord });
		if (poster.source === "manifest") {
			curated.coverImageUrl.POSTER = poster.folderEditable.coverImageUrl;
			if (poster.folderEditable.focusGifUrl) curated.focusGifUrl.POSTER = poster.folderEditable.focusGifUrl;
			curated.heroBackdropUrl = poster.folderEditable.heroBackdropUrl ?? null;
			curated.titleLogoUrl = poster.folderEditable.titleLogoUrl ?? null;
		}
		if (landscape.source === "manifest") {
			curated.coverImageUrl.LANDSCAPE = landscape.folderEditable.coverImageUrl;
			if (landscape.folderEditable.focusGifUrl) curated.focusGifUrl.LANDSCAPE = landscape.folderEditable.focusGifUrl;
			curated.heroBackdropUrl ??= landscape.folderEditable.heroBackdropUrl ?? null;
			curated.titleLogoUrl ??= landscape.folderEditable.titleLogoUrl ?? null;
		}
	}
	const requestSlots = PEOPLE_REQUEST_SLOTS
		.filter((slot) => {
			const value = slot.field === "coverImageUrl" || slot.field === "focusGifUrl"
				? curated[slot.field][slot.tileShape]
				: curated[slot.field];
			return normalizedHttpsUrl(value) === null;
		})
		.map((slot) => freezeRequestSlot(slot, `assets/people/${identity.tmdbId}/${slot.filename}`));
	return freezeSuggestionSet(identity, curated, {
		canonicalName,
		repository: REQUEST_REPOSITORIES[identity.authority],
		requestSlots,
	});
}

async function catalogueEntity(provider, tmdbId) {
	if (!provider || typeof provider.loadCatalogue !== "function") return Object.freeze({ available: false, entity: null });
	try {
		const result = await provider.loadCatalogue();
		return result?.ok && result.data?.byId instanceof Map
			? Object.freeze({ available: true, entity: result.data.byId.get(tmdbId) ?? null })
			: Object.freeze({ available: false, entity: null });
	} catch {
		return Object.freeze({ available: false, entity: null });
	}
}

async function runtimeAsset(client, entityType, tmdbId, orientation) {
	if (!client || typeof client.resolve !== "function") return Object.freeze({ status: "unavailable" });
	try {
		const result = await client.resolve({ entityType, tmdbId, orientation });
		if (result?.entityType !== entityType || result.tmdbId !== tmdbId || result.orientation !== orientation) {
			return Object.freeze({ status: "unavailable" });
		}
		if (result.status === ARTWORK_RESULT_STATUSES.READY) {
			const assetUrl = normalizedHttpsUrl(result.assetUrl);
			return assetUrl === null
				? Object.freeze({ status: "unavailable" })
				: Object.freeze({ status: "ready", assetUrl, name: typeof result.name === "string" ? result.name : null });
		}
		if (result.status === ARTWORK_RESULT_STATUSES.MISSING) return Object.freeze({ status: "missing" });
		if (result.status === ARTWORK_RESULT_STATUSES.UNSUPPORTED_ORIENTATION) return Object.freeze({ status: "unsupported" });
		return Object.freeze({ status: "unavailable" });
	} catch {
		return Object.freeze({ status: "unavailable" });
	}
}

async function loadStudioSuggestions(identity, artworkRuntimeClient, studioCatalogueProvider) {
	const [landscape, catalogue] = await Promise.all([
		runtimeAsset(artworkRuntimeClient, ARTWORK_ENTITY_TYPES.COMPANY, identity.tmdbId, ARTWORK_ORIENTATIONS.LANDSCAPE),
		catalogueEntity(studioCatalogueProvider, identity.tmdbId),
	]);
	if (landscape.status === "unavailable") return null;
	const studio = catalogue.entity;
	const curated = emptyCuratedFields();
	if (landscape.status === "ready") curated.coverImageUrl.LANDSCAPE = landscape.assetUrl;
	const fallbackUrl = buildTmdbStudioLogoUrl(studio?.logoPath, "w500");
	const requestSlots = landscape.status === "missing" && catalogue.available && studio
		? [freezeRequestSlot({
			field: "coverImageUrl",
			tileShape: "LANDSCAPE",
			artworkField: "Tile",
			titleLabel: "Landscape Tile",
			orientation: "Landscape",
		}, expectedArtworkPath(2, ARTWORK_ENTITY_TYPES.COMPANY, identity.tmdbId, ARTWORK_ORIENTATIONS.LANDSCAPE))]
		: [];
	return freezeSuggestionSet(identity, curated, {
		canonicalName: studio?.name ?? landscape.name,
		repository: REQUEST_REPOSITORIES[identity.authority],
		requestSlots,
		tmdbFallbackUrls: { coverImageUrl: fallbackUrl ? [fallbackUrl] : [] },
	});
}

async function loadNetworkSuggestions(identity, artworkRuntimeClient, networkCatalogueProvider) {
	const [poster, landscape, catalogue] = await Promise.all([
		runtimeAsset(artworkRuntimeClient, ARTWORK_ENTITY_TYPES.NETWORK, identity.tmdbId, ARTWORK_ORIENTATIONS.POSTER),
		runtimeAsset(artworkRuntimeClient, ARTWORK_ENTITY_TYPES.NETWORK, identity.tmdbId, ARTWORK_ORIENTATIONS.LANDSCAPE),
		catalogueEntity(networkCatalogueProvider, identity.tmdbId),
	]);
	if (poster.status === "unavailable" && landscape.status === "unavailable") return null;
	const network = catalogue.entity;
	const curated = emptyCuratedFields();
	if (poster.status === "ready") curated.coverImageUrl.POSTER = poster.assetUrl;
	if (landscape.status === "ready") curated.coverImageUrl.LANDSCAPE = landscape.assetUrl;
	const fallbackUrl = buildTmdbNetworkLogoUrl(network?.logoPath, "w500");
	const canonicalName = network?.name ?? poster.name ?? landscape.name;
	const requestSlots = catalogue.available && network ? [
		...(poster.status === "missing" ? [freezeRequestSlot({
			field: "coverImageUrl",
			tileShape: "POSTER",
			artworkField: "Tile",
			titleLabel: "Poster Tile",
			orientation: "Poster",
		}, expectedArtworkPath(2, ARTWORK_ENTITY_TYPES.NETWORK, identity.tmdbId, ARTWORK_ORIENTATIONS.POSTER))] : []),
		...(landscape.status === "missing" ? [freezeRequestSlot({
			field: "coverImageUrl",
			tileShape: "LANDSCAPE",
			artworkField: "Tile",
			titleLabel: "Landscape Tile",
			orientation: "Landscape",
		}, expectedArtworkPath(2, ARTWORK_ENTITY_TYPES.NETWORK, identity.tmdbId, ARTWORK_ORIENTATIONS.LANDSCAPE))] : []),
	] : [];
	return freezeSuggestionSet(identity, curated, {
		canonicalName,
		repository: REQUEST_REPOSITORIES[identity.authority],
		requestSlots,
		tmdbFallbackUrls: { coverImageUrl: fallbackUrl ? [fallbackUrl] : [] },
	});
}

function loadGenreSuggestions(identity) {
	const curated = emptyCuratedFields();
	for (const tileShape of ["POSTER", "LANDSCAPE"]) {
		const url = genreArtworkUrl(identity.genreName, tileShape);
		if (url !== null) curated.coverImageUrl[tileShape] = url;
	}
	return freezeSuggestionSet(identity, curated, {
		canonicalName: identity.genreName,
		repository: REQUEST_REPOSITORIES[identity.authority],
	});
}

export async function loadFolderArtworkSuggestions({
	folder,
	peopleManifestClient = null,
	peopleProvider = null,
	artworkRuntimeClient = null,
	studioCatalogueProvider = null,
	networkCatalogueProvider = null,
} = {}) {
	const identity = resolveFolderArtworkIdentity(folder);
	if (identity === null) return null;
	if (identity.authority === FOLDER_ARTWORK_AUTHORITIES.PEOPLE) {
		return loadPeopleSuggestions(identity, peopleManifestClient, peopleProvider);
	}
	if (identity.authority === FOLDER_ARTWORK_AUTHORITIES.STUDIO) {
		return loadStudioSuggestions(identity, artworkRuntimeClient, studioCatalogueProvider);
	}
	if (identity.authority === FOLDER_ARTWORK_AUTHORITIES.NETWORK) {
		return loadNetworkSuggestions(identity, artworkRuntimeClient, networkCatalogueProvider);
	}
	return loadGenreSuggestions(identity);
}

export function folderArtworkSuggestionForField(suggestionSet, field, tileShape) {
	if (!suggestionSet?.curated || !SUGGESTED_FIELDS.includes(field)) return null;
	const value = field === "coverImageUrl" || field === "focusGifUrl"
		? suggestionSet.curated[field]?.[tileShape]
		: suggestionSet.curated[field];
	return normalizedHttpsUrl(value);
}

export function folderArtworkRequestForField(suggestionSet, field, tileShape) {
	if (
		folderArtworkSuggestionForField(suggestionSet, field, tileShape) !== null
		|| !SUGGESTED_FIELDS.includes(field)
		|| typeof suggestionSet?.canonicalName !== "string"
		|| typeof suggestionSet?.repository !== "string"
	) return null;
	const slot = suggestionSet.requestSlots?.[requestSlotKey(field, tileShape)] ?? null;
	if (slot === null) return null;
	const family = AUTHORITY_LABELS[suggestionSet.identity.authority];
	if (!family) return null;
	const identityLines = suggestionSet.identity.authority === FOLDER_ARTWORK_AUTHORITIES.GENRE
		? [`Genre identity: ${suggestionSet.identity.genreName}`]
		: [`TMDB ID: ${suggestionSet.identity.tmdbId}`];
	const body = [
		"Request: Curated Folder artwork",
		`Family: ${family}`,
		`Canonical entity: ${suggestionSet.canonicalName}`,
		...identityLines,
		`Artwork field: ${slot.artworkField}`,
		...(slot.orientation ? [`Orientation: ${slot.orientation}`] : []),
		`Expected repository path: ${slot.expectedPath}`,
		"Source: TMDB Collection Builder",
	].join("\n");
	const title = `Artwork request: ${suggestionSet.canonicalName} — ${slot.titleLabel}`;
	const url = new URL(`https://github.com/${suggestionSet.repository}/issues/new`);
	url.searchParams.set("title", title);
	url.searchParams.set("body", body);
	return Object.freeze({
		href: url.toString(),
		repository: suggestionSet.repository,
		title,
		body,
		expectedPath: slot.expectedPath,
		field: slot.field,
		tileShape: slot.tileShape,
	});
}

export function curatedFolderArtworkUrls(suggestionSet, field) {
	if (!suggestionSet?.curated || !SUGGESTED_FIELDS.includes(field)) return Object.freeze([]);
	const value = suggestionSet.curated[field];
	const candidates = value && typeof value === "object" ? Object.values(value) : [value];
	return Object.freeze([...new Set(candidates.map(normalizedHttpsUrl).filter(Boolean))]);
}

export function classifyFolderArtworkValue(value, {
	curatedUrls = [],
	tmdbFallbackUrls = [],
	preserved = false,
} = {}) {
	if (preserved) return FOLDER_ARTWORK_CLASSIFICATIONS.CUSTOM_UNKNOWN;
	if (typeof value !== "string" || value.trim().length === 0) return FOLDER_ARTWORK_CLASSIFICATIONS.NONE;
	if (curatedUrls.includes(value)) return FOLDER_ARTWORK_CLASSIFICATIONS.CURATED;
	if (tmdbFallbackUrls.includes(value)) return FOLDER_ARTWORK_CLASSIFICATIONS.TMDB_FALLBACK;
	return FOLDER_ARTWORK_CLASSIFICATIONS.CUSTOM_UNKNOWN;
}
