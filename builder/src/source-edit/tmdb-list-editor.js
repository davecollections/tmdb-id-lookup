import { canonicalPositiveId, diagnostic, isPlainObject, validateTouchedSourceTitle } from "./source-edit-utils.js";
import { resolveEffectiveDiscoverSource } from "../nuvio/discover.js";
import { TMDB_LIST_EDIT_SORT_OPTIONS, tmdbListEditSortOptionId } from "../source-add/tmdb-list-source.js";
export { TMDB_LIST_EDIT_SORT_OPTIONS, tmdbListEditSortOptionId } from "../source-add/tmdb-list-source.js";

export const TMDB_LIST_SOURCE_EDITOR_ID = "tmdb-list";

export function updateTmdbListSourceSort(draft, optionId) {
	const option = TMDB_LIST_EDIT_SORT_OPTIONS.find((entry) => entry.id === optionId);
	return Object.freeze({ ...draft, sortBy: option?.value ?? null, sortTouched: true });
}

export function tmdbListEditIdentity(editable) {
	if (!isPlainObject(editable)) return null;
	const provider = typeof editable.provider === "string" ? editable.provider.trim().toLowerCase() : "";
	const sourceType = typeof editable.tmdbSourceType === "string" ? editable.tmdbSourceType.trim().toUpperCase() : "";
	const mediaType = typeof editable.mediaType === "string" ? editable.mediaType.trim().toUpperCase() : "";
	const id = canonicalPositiveId(editable.tmdbId);
	const filters = editable.filters;
	return provider === "tmdb"
		&& sourceType === "LIST"
		&& mediaType === "MOVIE"
		&& typeof editable.sortBy === "string"
		&& isPlainObject(filters)
		&& id !== null
		&& id <= 2_147_483_647
		? `tmdb|LIST|${id}|MOVIE`
		: null;
}

function readInitialState(source) {
	return Object.freeze({
		title: typeof source.editable.title === "string" ? source.editable.title : "",
		titleTouched: false,
		tmdbId: canonicalPositiveId(source.editable.tmdbId),
		sortBy: source.editable.sortBy,
		originalSortBy: source.editable.sortBy,
		sortTouched: false,
	});
}
function validateDraft({ draft, source }) {
	const errors = [...validateTouchedSourceTitle(draft)];
	if (canonicalPositiveId(draft?.tmdbId) === null || draft.tmdbId > 2_147_483_647) errors.push(diagnostic("SOURCE_EDIT_TMDB_LIST_ID_INVALID", "$sourceEdit.tmdbId", "This TMDB List ID is not valid."));
	if (canonicalPositiveId(draft?.tmdbId) !== canonicalPositiveId(source?.editable?.tmdbId)) errors.push(diagnostic("SOURCE_EDIT_TMDB_LIST_ID_FIXED", "$sourceEdit.tmdbId", "The List identity cannot be changed in this editor."));
	if (draft?.sortTouched && tmdbListEditSortOptionId(draft.sortBy) === null) errors.push(diagnostic("SOURCE_EDIT_TMDB_LIST_SORT_UNSUPPORTED", "$sourceEdit.sortBy", "Choose a supported List sort order."));
	return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors) });
}
function buildPatch({ source, draft }) {
	const patch = {};
	if (draft.titleTouched && draft.title !== source.editable.title) patch.title = draft.title;
	if (draft.sortTouched && draft.sortBy !== source.editable.sortBy) patch.sortBy = draft.sortBy;
	return Object.freeze(patch);
}

export const tmdbListSourceEditor = Object.freeze({
	id: TMDB_LIST_SOURCE_EDITOR_ID,
	label: "TMDB List",
	ownedFields: Object.freeze(["title", "sortBy"]),
	duplicateMessage: "This folder already contains that TMDB List source.",
	canEdit(source) {
		// Filters are preserved settings, not editable Discover criteria. Retain object-shape safeguards.
		if (source?.rawImported && Object.hasOwn(source.rawImported, "filters") && !isPlainObject(source.rawImported.filters)) return false;
		const effective = resolveEffectiveDiscoverSource(source);
		return effective.ok && tmdbListEditIdentity(effective.value) !== null;
	},
	identity: tmdbListEditIdentity,
	readInitialState,
	validateDraft,
	draftIdentity({ draft }) { const id = canonicalPositiveId(draft?.tmdbId); return id === null ? null : `tmdb|LIST|${id}|MOVIE`; },
	buildPatch,
	describeIdentity(draft) { return `TMDB · LIST · ${canonicalPositiveId(draft?.tmdbId) ?? "Invalid ID"}`; },
});
