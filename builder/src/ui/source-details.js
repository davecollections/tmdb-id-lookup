import { DISCOVER_SORT_OPTIONS, resolveEffectiveDiscoverSource } from "../nuvio/discover.js";
import { normalizeAddonProjectionIdentityGenre } from "../nuvio/addon-projection-identity.js";
import { SOURCE_EDITABLE_FIELDS } from "../nuvio/known-fields.js";
import { inspectCanonicalDecadeSourceNode } from "../source-add/decades-classification.js";
import { inspectEditableGenreSource } from "../source-edit/genre-editor.js";
import { inspectSimpleStreamingSourceNode } from "../source-add/streaming-classification.js";
import { PEOPLE_MEDIA, PEOPLE_SOURCE_SORT_OPTIONS } from "../source-add/person-source.js";
import { STUDIO_SORT_OPTIONS } from "../source-add/studio-source.js";
import { NETWORK_SORT_OPTIONS } from "../source-add/network-source.js";

const text = (value) => typeof value === "string" ? value.trim() : "";
const meaningful = (value) => value !== null && value !== undefined && (typeof value !== "string" || text(value) !== "");
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const nativeTypes = {
	LIST: ["List", "TMDB List source"],
	COLLECTION: ["Movie franchise", "Movie franchise source"],
	COMPANY: ["Studio", "Studio source"],
	NETWORK: ["Network", "Network source"],
	PERSON: ["Person", "Acting source"],
	DIRECTOR: ["Person", "Directing source"],
};

function entityId(value) {
	if (typeof value === "number") return Number.isSafeInteger(value) && value > 0 ? String(value) : "";
	return /^[0-9]+$/.test(text(value)) && Number.isSafeInteger(Number(value)) && Number(value) > 0 ? text(value) : "";
}

function sortLabel(value, type, media) {
	if (!meaningful(value)) return null;
	if (type === "LIST") return value === "original" ? "Original order" : "Other sorting";
	if (type === "COLLECTION") return value === "original" ? "TMDB order" : "Other sorting";
	if (type === "NETWORK") return (media === "TV" ? NETWORK_SORT_OPTIONS.find((option) => option.value === value)?.label : null) ?? "Other sorting";
	const options = type === "COMPANY" ? STUDIO_SORT_OPTIONS
		: ["PERSON", "DIRECTOR"].includes(type) ? PEOPLE_SOURCE_SORT_OPTIONS : DISCOVER_SORT_OPTIONS;
	return options.find((option) => option.values[media] === value)?.label ?? "Other sorting";
}

function sortedPhrase(content, sort) {
	if (!content) return sort;
	if (!sort) return content;
	return sort === "Other sorting" || content.includes("Other media type")
		? content + " (" + sort + ")" : sort + " " + content[0].toLowerCase() + content.slice(1);
}

function addonMedia(value) {
	const normalized = text(value).toLowerCase();
	if (["movie", "movies"].includes(normalized)) return "Movies";
	if (["series", "tv"].includes(normalized)) return "Series";
	return null;
}

// Source-only presentation: never write normalized values back into the node.
export function sourceCardDetails(source, { includeCatalogId = false } = {}) {
	const editable = source.editable;
	const metadata = [];
	const add = (key, value) => { if (value) metadata.push({ key, value }); };
	if (source.category === "addon") {
		const addon = text(editable.addonId);
		const catalog = text(editable.catalogId);
		const type = text(editable.type);
		const genre = text(normalizeAddonProjectionIdentityGenre(editable.genre));
		const media = ["movie", "series"].includes(type.toLowerCase()) ? addonMedia(type) : null;
		const fallback = catalog || addon || "Addon source";
		const title = text(editable.title) || fallback;
		// The owner-approved identifier and AIO's explicit trakt. namespace only.
		const origin = addon === "aio-metadata" && /^trakt\.[a-z0-9][a-z0-9._-]*$/i.test(catalog) ? "Trakt" : null;
		add("addon-id", addon === "aio-metadata" ? "AIO Metadata" : addon === "trakt" ? "Trakt" : addon);
		add("catalog-origin", origin);
		if (catalog && catalog !== title && (!origin || includeCatalogId)) add("catalog-id", "Catalog: " + catalog);
		const usefulGenre = genre && genre.toLowerCase() !== type.toLowerCase() && !(media && addonMedia(genre) === media) ? genre : null;
		const mediaLabel = media ?? (type ? "Type: " + type : meaningful(editable.type) ? "Other media type" : null);
		let content = usefulGenre && media ? usefulGenre + " " + media.toLowerCase()
			: usefulGenre ? usefulGenre + (mediaLabel ? " (" + mediaLabel + ")" : "") : mediaLabel;
		if (["addonId", "catalogId", "genre"].some((key) => meaningful(editable[key]) && typeof editable[key] !== "string")) content = content ? content + " (Additional settings)" : "Additional settings";
		add("addon-type", content);
		return { metadata, fallback };
	}
	if (source.category !== "native-tmdb") {
		const provider = text(editable.provider);
		add("provider", provider.toLowerCase() === "trakt" ? "Trakt" : provider.toLowerCase() === "community" ? "Community" : provider ? "Provider: " + provider : null);
		return { metadata, fallback: "Preserved source" };
	}

	const type = text(editable.tmdbSourceType).toUpperCase();
	const media = text(editable.mediaType).toUpperCase();
	const mediaLabel = PEOPLE_MEDIA.find((option) => option.mediaType === media)?.label ?? (meaningful(editable.mediaType) ? "Other media type" : null);
	const sort = sortLabel(editable.sortBy, type, media);
	const effective = resolveEffectiveDiscoverSource(source);
	const value = effective.ok ? effective.value : editable;
	const consumed = new Set();
	let fallback = nativeTypes[type]?.[1] ?? "TMDB source";
	let identity = nativeTypes[type]?.[0] ?? "Source";
	let content = mediaLabel;
	let combinedIdentity = false;
	let genericDiscover = false;
	if (type === "DISCOVER") {
		const decade = inspectCanonicalDecadeSourceNode(source);
		const genre = decade ? null : inspectEditableGenreSource(source);
		const streaming = decade || genre ? null : inspectSimpleStreamingSourceNode(source);
		fallback = "TMDB Discover source";
		if (decade) {
			identity = [decade.period.label, decade.genre?.name.toLowerCase(), mediaLabel?.toLowerCase()].filter(Boolean).join(" ");
			combinedIdentity = true;
			fallback = decade.period.kind === "year" ? "Year source" : "Decade source";
			for (const key of Object.keys(decade.period.filters)) consumed.add(key);
			if (decade.genre) consumed.add("withGenres");
		} else if (genre) {
			identity = genre.genreName + " " + mediaLabel.toLowerCase();
			combinedIdentity = true;
			fallback = "Genre source";
			consumed.add("withGenres");
		} else if (streaming) {
			identity = "Streaming";
			fallback = "Streaming source";
			content = mediaLabel + " (" + streaming.regionCode + ")";
			consumed.add("watchRegion"); consumed.add("withWatchProviders");
		} else { identity = "Discover"; genericDiscover = true; }
	} else if (["PERSON", "DIRECTOR"].includes(type) && mediaLabel) {
		content = (type === "PERSON" ? "Acting" : "Directed") + " " + mediaLabel.toLowerCase();
	}

	let settings = !effective.ok || (meaningful(value.filters) && !object(value.filters));
	if (Object.entries(object(value.filters) ? value.filters : {}).some(([key, filter]) => meaningful(filter) && !consumed.has(key))) settings = true;
	if (Object.entries(value).some(([key, entry]) => key !== "filters" && !SOURCE_EDITABLE_FIELDS.includes(key) && meaningful(entry))) settings = true;
	if (meaningful(editable.tmdbId) && !entityId(editable.tmdbId)) settings = true;
	add("identity", identity);
	if (combinedIdentity || type === "LIST" || type === "COLLECTION") add("sort", sort);
	else if (genericDiscover || settings) add("content", sortedPhrase(content, sort));
	else { add("content", content); add("sort", sort); }
	add("settings", settings ? "Additional settings" : null);
	return { metadata, fallback };
}
