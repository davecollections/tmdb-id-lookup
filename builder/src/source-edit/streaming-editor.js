import { discoverSortIsPreservationOnly } from "./source-edit-utils.js";
import { familyAdvancedTouchedFields } from "./source-edit-utils.js";
import {
	discoverSortOptionId,
	discoverSortValue,
	discoverSourceIdentity,
	discoverSourceNodeIdentity,
	effectiveDiscoverSort,
	resolveEffectiveDiscoverSource,
} from "../nuvio/discover.js";
import { inspectSimpleStreamingSourceNode } from "../source-add/streaming-classification.js";
import { defaultStreamingSourceName } from "../source-add/streaming-source.js";
import { STREAMING_ADVANCED_FILTER_FIELDS } from "../source-add/streaming-source.js";
import { compileAnchoredDiscoverFilters } from "../source-add/advanced-discover.js";
import { DISCOVER_ADVANCED_GROUPS, inspectNativeExtraFilters, validateNativeExtraEdit, ownedNativeExtraMirrorSource } from "../source-add/native-shared-advanced.js";
import { patchTouchedDiscoverFilters, inspectDiscoverMirrors } from "../nuvio/discover-imported-filters.js";
import {
	diagnostic,
	isPlainObject,
	validateTouchedSourceTitle,
} from "./source-edit-utils.js";

export const STREAMING_SOURCE_EDITOR_ID = "streaming";

export function inspectEditableStreamingSource(source) {
	const effective = resolveEffectiveDiscoverSource(source);
	if (!effective.ok) return null;
	const value = effective.value;
	if (inspectDiscoverMirrors(value).unresolved.some((entry) => ["watchRegion", "withWatchProviders"].includes(entry.field))) return null;
	const anchor = inspectSimpleStreamingSourceNode({ category: "native-tmdb", nodeType: "source", editable: { provider: value.provider, tmdbSourceType: value.tmdbSourceType, tmdbId: value.tmdbId, mediaType: value.mediaType, sortBy: value.sortBy, filters: { watchRegion: value.filters?.watchRegion, withWatchProviders: value.filters?.withWatchProviders } } });
	if (!anchor) return null;
	const safe = inspectNativeExtraFilters(source, DISCOVER_ADVANCED_GROUPS);
	return { ...anchor, value, safeFilters: safe.filters, extraEditable: safe.editable };
}

function compileFilters(draft) {
	return compileAnchoredDiscoverFilters(draft.advanced?.filters ?? {}, { watchRegion: draft.regionCode, withWatchProviders: String(draft.providerId) }, draft.mediaType === "TV" ? "series" : "movies", draft.mediaType, STREAMING_ADVANCED_FILTER_FIELDS);
}

function readInitialState(source) {
	const inspected = inspectEditableStreamingSource(source);
	return Object.freeze({
		title: typeof inspected?.value?.title === "string" ? inspected.value.title : "",
		titleTouched: false,
		advanced: Object.freeze({ filters: Object.freeze(Object.fromEntries(Object.entries(inspected?.safeFilters ?? {}).filter(([field]) => STREAMING_ADVANCED_FILTER_FIELDS.includes(field)))) }),
		touchedFilters: Object.freeze([]),
		extraEditable: inspected?.extraEditable,
		providerId: inspected?.providerId ?? null,
		regionCode: inspected?.regionCode ?? null,
		mediaType: inspected?.mediaType ?? null,
		identityFilters: Object.freeze({ ...(inspected?.value?.filters ?? {}) }),
		sortBy: inspected?.value?.sortBy,
		originalSortBy: inspected?.value?.sortBy,
		sortOptionId: discoverSortOptionId(effectiveDiscoverSort(inspected?.value?.sortBy), inspected?.mediaType),
		sortTouched: false,
		sortEditable: !discoverSortIsPreservationOnly(inspected?.value),
	});
}

function validateDraft({ draft, source }) {
 if (!draft?.advanced || typeof draft.advanced !== "object" || Array.isArray(draft.advanced) || (draft.touchedFilters !== undefined && (!Array.isArray(draft.touchedFilters) || draft.touchedFilters.some((field) => !STREAMING_ADVANCED_FILTER_FIELDS.includes(field))))) return { ok: false, errors: [diagnostic("SOURCE_EDIT_ADVANCED_FIXED", "$sourceEdit.filters", "Only supported optional filters can be changed here.")] };
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
	if (draft.sortTouched && discoverSortIsPreservationOnly(inspected?.value)) errors.push(diagnostic("SOURCE_EDIT_SORT_PRESERVED", "$sourceEdit.sortBy", "The conflicting imported order must be preserved."));
	const selectedSort = discoverSortValue(draft?.sortOptionId, draft?.mediaType);
	if (draft?.sortTouched && (selectedSort === null || selectedSort !== draft.sortBy)) {
		errors.push(diagnostic(
			"SOURCE_EDIT_STREAMING_SORT_UNSUPPORTED",
			"$sourceEdit.sortBy",
			"Choose a supported Streaming sort order.",
		));
	}
	const compiled = compileFilters(draft);
	errors.push(...compiled.errors);
	if (compiled.ok) errors.push(...validateNativeExtraEdit(source, { ...draft, filters: compiled.filters, touchedFilters: familyAdvancedTouchedFields(draft, readInitialState(source).advanced) }, DISCOVER_ADVANCED_GROUPS).errors);
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
	const compiled = compileFilters(draft);
	if (compiled.ok) Object.assign(patch, patchTouchedDiscoverFilters(source, ownedNativeExtraMirrorSource(current, DISCOVER_ADVANCED_GROUPS.flat()), compiled.filters, familyAdvancedTouchedFields(draft, readInitialState(source).advanced), patch));
	return patch;
}

export const streamingSourceEditor = Object.freeze({
	id: STREAMING_SOURCE_EDITOR_ID,
	label: "Streaming service",
	ownedFields: Object.freeze(["title", "sortBy", "filters"]),
	duplicateMessage() {
		return "This folder already contains this Streaming provider, region, media, sort and filter combination. Change the options or cancel your changes.";
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
	duplicateKey(source) { const identity = discoverSourceNodeIdentity(source); return identity.comparable ? identity.key : null; },
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
