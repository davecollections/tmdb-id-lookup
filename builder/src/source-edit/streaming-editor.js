import {
	discoverSortOptionId,
	discoverSortValue,
	discoverSourceIdentity,
	discoverSourceNodeIdentity,
	effectiveDiscoverSort,
} from "../nuvio/discover.js";
import { inspectSimpleStreamingSourceNode } from "../source-add/streaming-classification.js";
import { defaultStreamingSourceName } from "../source-add/streaming-source.js";
import {
	diagnostic,
	isPlainObject,
	validateTouchedSourceTitle,
} from "./source-edit-utils.js";

export const STREAMING_SOURCE_EDITOR_ID = "streaming";

export function inspectEditableStreamingSource(source) {
	return inspectSimpleStreamingSourceNode(source);
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
