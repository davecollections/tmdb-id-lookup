import { inspectMinimumVotes, MINIMUM_VOTES_FIELDS, validateMinimumVotesFilters } from "../source-add/minimum-votes.js";
import { resolveEffectiveDiscoverSource } from "../nuvio/discover.js";
import { inspectDiscoverMirrors, patchTouchedDiscoverFilters } from "../nuvio/discover-imported-filters.js";
import {
	DEFAULT_NETWORK_SORT,
	isSupportedNetworkSort,
	networkSortOptionId,
	networkSourceIdentity,
	networkSourceVariantKey,
} from "../source-add/index.js";
import { canonicalPositiveId, canonicalText, diagnostic, validateTouchedSourceTitle } from "./source-edit-utils.js";

export const NETWORK_SOURCE_EDITOR_ID = "network";

function readInitialState(source) {
	const minimum = inspectMinimumVotes(source);
	return Object.freeze({
		filters: minimum.filters,
		touchedFilters: [],
		minimumVotesEditable: minimum.editable,
		title: typeof source.editable.title === "string" ? source.editable.title : "",
		titleTouched: false,
		networkName: canonicalText(source.editable.title) || "Network",
		tmdbId: canonicalPositiveId(source.editable.tmdbId),
		mediaType: "TV",
		sortBy: source.editable.sortBy,
		originalSortBy: source.editable.sortBy,
		sortOptionId: networkSortOptionId(source.editable.sortBy),
		sortTouched: false,
	});
}

function validateDraft({ draft, source }) {
	const errors = [...validateTouchedSourceTitle(draft)];
	const touched = draft?.touchedFilters ?? [];
	if (!Array.isArray(touched) || touched.some((key) => !MINIMUM_VOTES_FIELDS.includes(key))) errors.push(diagnostic("SOURCE_EDIT_NETWORK_FILTER_FIXED", "$sourceEdit.filters", "Only Minimum votes can be edited here."));
	else if (touched.length) {
		if (!inspectMinimumVotes(source).editable) errors.push(diagnostic("SOURCE_EDIT_NETWORK_FILTER_PRESERVED", "$sourceEdit.filters", "This imported Minimum votes setting must be preserved."));
		errors.push(...validateMinimumVotesFilters(draft.filters, draft.mediaType).errors);
	}

	if (canonicalPositiveId(draft?.tmdbId) === null || canonicalPositiveId(draft?.tmdbId) !== canonicalPositiveId(source?.editable?.tmdbId)) {
		errors.push(diagnostic("SOURCE_EDIT_NETWORK_ID_FIXED", "$sourceEdit.tmdbId", "The Network identity cannot be changed in this editor."));
	}
	if (draft?.mediaType !== "TV" || canonicalText(source?.editable?.mediaType).toUpperCase() !== "TV") {
		errors.push(diagnostic("SOURCE_EDIT_NETWORK_MEDIA_FIXED", "$sourceEdit.mediaType", "The Network media type cannot be changed in this editor."));
	}
	if (draft?.sortTouched && !isSupportedNetworkSort(draft.sortBy)) {
		errors.push(diagnostic("SOURCE_EDIT_NETWORK_SORT_UNSUPPORTED", "$sourceEdit.sortBy", "Choose a supported Network Series sort order."));
	}
	return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors) });
}

function draftIdentity({ draft }) {
	const tmdbId = canonicalPositiveId(draft?.tmdbId);
	return tmdbId === null ? null : `tmdb|NETWORK|${tmdbId}|TV`;
}

function buildPatch({ source, draft }) {
	const patch = {};
	if (draft.titleTouched && draft.title !== source.editable.title) patch.title = draft.title;
	if (draft.sortTouched && draft.sortBy !== source.editable.sortBy) patch.sortBy = draft.sortBy;
	if (!draft.touchedFilters?.length) return patch;
	const original = resolveEffectiveDiscoverSource(source).value;
 const ownedOriginal = { ...original, filters: { ...original.filters } };
 if (!inspectDiscoverMirrors(original).equivalent.includes("vote_count.gte")) delete ownedOriginal.filters["vote_count.gte"];
	const validated = validateMinimumVotesFilters(draft.filters, draft.mediaType);
	return { ...patch, ...patchTouchedDiscoverFilters(source, ownedOriginal, validated.filters, draft.touchedFilters) };
}

export const networkSourceEditor = Object.freeze({
	id: NETWORK_SOURCE_EDITOR_ID,
	label: "Network",
	ownedFields: Object.freeze(["title", "sortBy", "filters"]),
	duplicateKey: networkSourceVariantKey,
	duplicateMessage() {
		return "This folder already contains this Network sorting option and filters for Series. Change the sorting option or Minimum votes, or cancel your changes.";
	},
	canEdit(source) {
		return source?.nodeType === "source" && source.category === "native-tmdb" && networkSourceIdentity(source.editable) !== null;
	},
	identity: networkSourceIdentity,
	readInitialState,
	validateDraft,
	draftIdentity,
	buildPatch,
	describeIdentity(draft) {
		return `TMDB · NETWORK · ${canonicalPositiveId(draft?.tmdbId) ?? "Invalid ID"} · TV`;
	},
});

export function networkEditSortValue(draft) {
	return isSupportedNetworkSort(draft?.sortBy) ? draft.sortBy : DEFAULT_NETWORK_SORT;
}
