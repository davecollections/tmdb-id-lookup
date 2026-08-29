import {
	discoverSourceNodeIdentity,
	isCanonicalDiscoverFilterValue,
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

function aliasedFilterValue(filters, fields, validate) {
	const values = fields
		.filter((field) => Object.hasOwn(filters, field) && meaningful(filters[field]))
		.map((field) => filters[field]);
	if (values.length === 0 || values.some((value) => !validate(value))) return null;
	return new Set(values).size === 1 ? values[0] : null;
}

export function inspectStreamingAffinitySourceNode(source) {
	const effective = resolveEffectiveDiscoverSource(source);
	if (!effective.ok || !plainObject(effective.value)) return null;
	const value = effective.value;
	const provider = canonicalText(value.provider).toLowerCase();
	const sourceType = canonicalText(value.tmdbSourceType).toUpperCase();
	const mediaType = canonicalText(value.mediaType).toUpperCase();
	if (provider !== "tmdb" || sourceType !== "DISCOVER" || !["MOVIE", "TV"].includes(mediaType) || !plainObject(value.filters)) return null;
	const providerExpression = aliasedFilterValue(
		value.filters,
		["withWatchProviders", "with_watch_providers"],
		(entry) => isCanonicalDiscoverFilterValue("withWatchProviders", entry),
	);
	const regionCode = aliasedFilterValue(
		value.filters,
		["watchRegion", "watch_region"],
		(entry) => typeof entry === "string" && /^[A-Z]{2}$/.test(entry),
	);
	if (providerExpression === null || regionCode === null) return null;
	return Object.freeze({ mediaType, providerExpression, regionCode });
}

export function hasStreamingCollectionAffinity(collection) {
	return (collection?.folders ?? []).some((folder) => (
		(folder?.sources ?? []).some((source) => inspectStreamingAffinitySourceNode(source) !== null)
	));
}

export function hasStreamingSourceEvidence(source) {
	const effective = resolveEffectiveDiscoverSource(source);
	const candidates = [effective.ok ? effective.value : null, source?.editable, source?.rawImported].filter(plainObject);
	return candidates.some((value) => (
		canonicalText(value.provider).toLowerCase() === "tmdb"
		&& canonicalText(value.tmdbSourceType).toUpperCase() === "DISCOVER"
		&& plainObject(value.filters)
		&& (meaningful(value.filters.watchRegion) || meaningful(value.filters.withWatchProviders))
	));
}
