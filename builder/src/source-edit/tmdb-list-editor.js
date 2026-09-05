import { canonicalPositiveId, diagnostic, isPlainObject, validateTouchedSourceTitle } from "./source-edit-utils.js";
import { resolveEffectiveDiscoverSource } from "../nuvio/discover.js";

export const TMDB_LIST_SOURCE_EDITOR_ID = "tmdb-list";

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
		&& editable.sortBy === "original"
		&& isPlainObject(filters)
		&& Object.values(filters).every((value) => value === null)
		&& id !== null
		&& id <= 2_147_483_647
		? `tmdb|LIST|${id}|MOVIE`
		: null;
}

function readInitialState(source) {
	return Object.freeze({ title: typeof source.editable.title === "string" ? source.editable.title : "", titleTouched: false, tmdbId: canonicalPositiveId(source.editable.tmdbId) });
}
function validateDraft({ draft }) {
	const errors = [...validateTouchedSourceTitle(draft)];
	if (canonicalPositiveId(draft?.tmdbId) === null || draft.tmdbId > 2_147_483_647) errors.push(diagnostic("SOURCE_EDIT_TMDB_LIST_ID_INVALID", "$sourceEdit.tmdbId", "This TMDB List ID is not valid."));
	return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors) });
}
function buildPatch({ source, draft }) {
	return draft.titleTouched && draft.title !== source.editable.title ? Object.freeze({ title: draft.title }) : Object.freeze({});
}

export const tmdbListSourceEditor = Object.freeze({
	id: TMDB_LIST_SOURCE_EDITOR_ID,
	label: "TMDB List",
	ownedFields: Object.freeze(["title"]),
	duplicateMessage: "This folder already contains that TMDB List source.",
	canEdit(source) {
		// Inspect the preserved filter overlay too: unknown non-null filters are not an empty List configuration.
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
