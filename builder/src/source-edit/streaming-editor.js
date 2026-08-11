import {
	discoverSortOptionId,
	discoverSortValue,
	discoverSourceIdentity,
	discoverSourceNodeIdentity,
	effectiveDiscoverSort,
	resolveEffectiveDiscoverSource,
} from "../nuvio/discover.js";
import { defaultStreamingSourceName } from "../source-add/streaming-source.js";
import {
	canonicalText,
	diagnostic,
	isPlainObject,
	validateTouchedSourceTitle,
} from "./source-edit-utils.js";

export const STREAMING_SOURCE_EDITOR_ID = "streaming";

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

function meaningful(value) {
	return value !== null
		&& value !== undefined
		&& !(typeof value === "string" && value.trim().length === 0);
}

export function inspectEditableStreamingSource(source) {
	const effective = resolveEffectiveDiscoverSource(source);
	if (!effective.ok || !isPlainObject(effective.value)) return null;
	const value = effective.value;
	const provider = canonicalText(value.provider).toLowerCase();
	const sourceType = canonicalText(value.tmdbSourceType).toUpperCase();
	const mediaType = canonicalText(value.mediaType).toUpperCase();
	if (provider !== "tmdb" || sourceType !== "DISCOVER" || !["MOVIE", "TV"].includes(mediaType)) return null;
	if (meaningful(value.tmdbId) || !isPlainObject(value.filters)) return null;
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

function readInitialState(source) {
	const inspected = inspectEditableStreamingSource(source);
	return Object.freeze({
		title: typeof inspected?.value?.title === "string" ? inspected.value.title : "",
		titleTouched: false,
		providerId: inspected?.providerId ?? null,
		regionCode: inspected?.regionCode ?? null,
		mediaType: inspected?.mediaType ?? null,
		identityFilters: Object.freeze({ ...(inspected?.value?.filters ?? {}) }),
		sortBy: inspected?.value?.sortBy,
		originalSortBy: inspected?.value?.sortBy,
		sortOptionId: discoverSortOptionId(effectiveDiscoverSort(inspected?.value?.sortBy), inspected?.mediaType),
		sortTouched: false,
	});
}

function validateDraft({ draft, source }) {
	const errors = [...validateTouchedSourceTitle(draft)];
	const inspected = inspectEditableStreamingSource(source);
	if (
		inspected === null
		|| draft?.providerId !== inspected.providerId
		|| draft?.regionCode !== inspected.regionCode
		|| draft?.mediaType !== inspected.mediaType
	) {
		errors.push(diagnostic(
			"SOURCE_EDIT_STREAMING_IDENTITY_FIXED",
			"$sourceEdit.identity",
			"The Streaming provider, region and media type cannot be changed in this editor.",
		));
	}
	const selectedSort = discoverSortValue(draft?.sortOptionId, draft?.mediaType);
	if (draft?.sortTouched && (selectedSort === null || selectedSort !== draft.sortBy)) {
		errors.push(diagnostic(
			"SOURCE_EDIT_STREAMING_SORT_UNSUPPORTED",
			"$sourceEdit.sortBy",
			"Choose a supported Streaming sort order.",
		));
	}
	return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors) });
}

function draftIdentity({ draft }) {
	const identity = discoverSourceIdentity({
		provider: "tmdb",
		tmdbSourceType: "DISCOVER",
		tmdbId: null,
		mediaType: draft?.mediaType,
		sortBy: draft?.sortBy,
		filters: {
			...(isPlainObject(draft?.identityFilters) ? draft.identityFilters : {}),
			watchRegion: draft?.regionCode,
			withWatchProviders: String(draft?.providerId ?? ""),
		},
	});
	return identity.comparable ? identity.key : null;
}

function buildPatch({ source, draft }) {
	const patch = {};
	const current = inspectEditableStreamingSource(source)?.value ?? source.editable;
	if (draft.titleTouched && draft.title !== current.title) patch.title = draft.title;
	if (draft.sortTouched && draft.sortBy !== current.sortBy) patch.sortBy = draft.sortBy;
	return patch;
}

export const streamingSourceEditor = Object.freeze({
	id: STREAMING_SOURCE_EDITOR_ID,
	label: "Streaming service",
	ownedFields: Object.freeze(["title", "sortBy"]),
	duplicateMessage() {
		return "This folder already contains this Streaming provider, region, media and sort combination. Choose another sort or cancel your changes.";
	},
	canEdit(source) {
		return inspectEditableStreamingSource(source) !== null;
	},
	identity(editable) {
		const identity = discoverSourceIdentity(editable);
		return identity.comparable ? identity.key : null;
	},
	sourceIdentity(source) {
		const identity = discoverSourceNodeIdentity(source);
		return identity.comparable ? identity.key : null;
	},
	readInitialState,
	validateDraft,
	draftIdentity,
	buildPatch,
	describeIdentity(draft) {
		return `TMDB · DISCOVER · Provider ${draft?.providerId ?? "Invalid ID"} · ${draft?.regionCode ?? "Invalid region"} · ${draft?.mediaType ?? "Invalid media"}`;
	},
});

export function streamingEditSortValue(optionId, mediaType) {
	return discoverSortValue(optionId, mediaType);
}

export function streamingDefaultSourceName(providerName, regionCode, mediaType) {
	return defaultStreamingSourceName(providerName, regionCode, mediaType);
}
