import {
	DEFAULT_NETWORK_SORT,
	isSupportedNetworkSort,
	networkSortOptionId,
	networkSourceIdentity,
} from "../source-add/index.js";
import { canonicalPositiveId, canonicalText, diagnostic, validateTouchedSourceTitle } from "./source-edit-utils.js";

export const NETWORK_SOURCE_EDITOR_ID = "network";

function readInitialState(source) {
	return Object.freeze({
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
	return patch;
}

export const networkSourceEditor = Object.freeze({
	id: NETWORK_SOURCE_EDITOR_ID,
	label: "Network",
	ownedFields: Object.freeze(["title", "sortBy"]),
	checkCurrentIdentityDuplicates: true,
	duplicateMessage() {
		return "This folder already contains another Series source for this Network. Remove the duplicate or cancel your changes.";
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
