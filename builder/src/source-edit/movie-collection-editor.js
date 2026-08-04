import {
	canonicalPositiveId,
	canonicalText,
	diagnostic,
	isPlainObject,
	validateTouchedSourceTitle,
} from "./source-edit-utils.js";

export const MOVIE_COLLECTION_SOURCE_EDITOR_ID = "movie-collection";

export function movieCollectionEditIdentity(editable) {
	if (!isPlainObject(editable)) return null;
	const provider = canonicalText(editable.provider).toLowerCase();
	const sourceType = canonicalText(editable.tmdbSourceType).toUpperCase();
	const mediaType = canonicalText(editable.mediaType).toUpperCase();
	const tmdbId = canonicalPositiveId(editable.tmdbId);
	if (
		provider !== "tmdb"
		|| sourceType !== "COLLECTION"
		|| mediaType !== "MOVIE"
		|| tmdbId === null
	) return null;
	return `tmdb|COLLECTION|${tmdbId}|MOVIE`;
}

function readInitialState(source) {
	return Object.freeze({
		title: typeof source.editable.title === "string" ? source.editable.title : "",
		titleTouched: false,
		tmdbId: canonicalPositiveId(source.editable.tmdbId),
		identityTouched: false,
		selectedCollectionName: null,
	});
}

function validateDraft({ draft }) {
	const errors = [...validateTouchedSourceTitle(draft)];
	if (canonicalPositiveId(draft?.tmdbId) === null) {
		errors.push(diagnostic(
			"SOURCE_EDIT_COLLECTION_REQUIRED",
			"$sourceEdit.tmdbId",
			"Choose a valid TMDB movie collection.",
		));
	}
	return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors) });
}

function draftIdentity({ draft }) {
	const tmdbId = canonicalPositiveId(draft?.tmdbId);
	return tmdbId === null ? null : `tmdb|COLLECTION|${tmdbId}|MOVIE`;
}

function buildPatch({ source, draft, session }) {
	const patch = {};
	if (draft.titleTouched && draft.title !== source.editable.title) {
		patch.title = draft.title;
	}
	if (draftIdentity({ draft }) !== session.originalIdentity) {
		patch.tmdbId = canonicalPositiveId(draft.tmdbId);
	}
	return patch;
}

export const movieCollectionSourceEditor = Object.freeze({
	id: MOVIE_COLLECTION_SOURCE_EDITOR_ID,
	label: "Movie Collection",
	ownedFields: Object.freeze(["title", "tmdbId"]),
	duplicateMessage: "This folder already contains that Movie Collection. Choose another franchise or cancel your changes.",
	canEdit(source) {
		return source?.nodeType === "source"
			&& source.category === "native-tmdb"
			&& movieCollectionEditIdentity(source.editable) !== null;
	},
	identity: movieCollectionEditIdentity,
	readInitialState,
	validateDraft,
	draftIdentity,
	buildPatch,
	describeIdentity(draft) {
		return `TMDB · COLLECTION · ${canonicalPositiveId(draft?.tmdbId) ?? "Invalid ID"} · MOVIE`;
	},
});
