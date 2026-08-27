import {
	discoverSourceNodeIdentity,
	resolveEffectiveDiscoverSource,
} from "../nuvio/discover.js";

const knownSourceFields = new Set([
	"filters",
	"mediaType",
	"provider",
	"sortBy",
	"title",
	"tmdbId",
	"tmdbSourceType",
]);
const streamingFilterFields = new Set(["watchRegion", "withWatchProviders"]);

function plainObject(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function canonicalText(value) {
	return typeof value === "string" ? value.trim() : "";
}

function meaningful(value) {
	return value !== null
		&& value !== undefined
		&& !(typeof value === "string" && value.trim().length === 0);
}

export function inspectSimpleStreamingSourceNode(source) {
	const effective = resolveEffectiveDiscoverSource(source);
	if (!effective.ok || !plainObject(effective.value)) return null;
	const value = effective.value;
	const provider = canonicalText(value.provider).toLowerCase();
	const sourceType = canonicalText(value.tmdbSourceType).toUpperCase();
	const mediaType = canonicalText(value.mediaType).toUpperCase();
	if (provider !== "tmdb" || sourceType !== "DISCOVER" || !["MOVIE", "TV"].includes(mediaType)) return null;
	if (meaningful(value.tmdbId) || !plainObject(value.filters)) return null;
	for (const [field, fieldValue] of Object.entries(value)) {
		if (!knownSourceFields.has(field) && meaningful(fieldValue)) return null;
	}
	for (const [field, fieldValue] of Object.entries(value.filters)) {
		if (!streamingFilterFields.has(field) && meaningful(fieldValue)) return null;
	}
	const regionCode = value.filters.watchRegion;
	const providerValue = value.filters.withWatchProviders;
	if (typeof regionCode !== "string" || !/^[A-Z]{2}$/.test(regionCode)) return null;
	if (typeof providerValue !== "string" || !/^[1-9]\d*$/.test(providerValue)) return null;
	const providerId = Number(providerValue);
	if (!Number.isSafeInteger(providerId)) return null;
	const identity = discoverSourceNodeIdentity(source);
	if (!identity.comparable) return null;
	return Object.freeze({
		value,
		identity: identity.key,
		mediaType,
		providerId,
		regionCode,
	});
}
