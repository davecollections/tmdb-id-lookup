import {
	DEFAULT_STUDIO_MOVIE_SORT,
	isSupportedStudioSort,
	studioSortOptionId,
	studioSourceIdentity,
} from "../source-add/index.js";
import {
	canonicalPositiveId,
	canonicalText,
	diagnostic,
	validateTouchedSourceTitle,
} from "./source-edit-utils.js";

export const STUDIO_SOURCE_EDITOR_ID = "studio";

function readInitialState(source) {
	return Object.freeze({
		title: typeof source.editable.title === "string" ? source.editable.title : "",
		titleTouched: false,
		studioName: canonicalText(source.editable.title) || "Studio",
		tmdbId: canonicalPositiveId(source.editable.tmdbId),
		mediaType: canonicalText(source.editable.mediaType).toUpperCase(),
		sortBy: source.editable.sortBy,
		originalSortBy: source.editable.sortBy,
		sortOptionId: studioSortOptionId(source.editable.sortBy, source.editable.mediaType),
		sortTouched: false,
	});
}

function validateDraft({ draft, source }) {
	const errors = [...validateTouchedSourceTitle(draft)];
	if (
		canonicalPositiveId(draft?.tmdbId) === null
		|| canonicalPositiveId(draft?.tmdbId) !== canonicalPositiveId(source?.editable?.tmdbId)
	) {
		errors.push(diagnostic(
			"SOURCE_EDIT_STUDIO_ID_FIXED",
			"$sourceEdit.tmdbId",
			"The Studio identity cannot be changed in this editor.",
		));
	}
	if (
		!["MOVIE", "TV"].includes(draft?.mediaType)
		|| draft.mediaType !== canonicalText(source?.editable?.mediaType).toUpperCase()
	) {
		errors.push(diagnostic(
			"SOURCE_EDIT_STUDIO_MEDIA_FIXED",
			"$sourceEdit.mediaType",
			"The Studio media type cannot be changed in this editor.",
		));
	}
	if (draft?.sortTouched && !isSupportedStudioSort(draft.sortBy, draft.mediaType)) {
		errors.push(diagnostic(
			"SOURCE_EDIT_STUDIO_SORT_UNSUPPORTED",
			"$sourceEdit.sortBy",
			"Choose a supported Studio sort order for this media type.",
		));
	}
	return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors) });
}

function draftIdentity({ draft }) {
	const tmdbId = canonicalPositiveId(draft?.tmdbId);
	const mediaType = canonicalText(draft?.mediaType).toUpperCase();
	return tmdbId === null || !["MOVIE", "TV"].includes(mediaType)
		? null
		: `tmdb|COMPANY|${tmdbId}|${mediaType}`;
}

function buildPatch({ source, draft }) {
	const patch = {};
	if (draft.titleTouched && draft.title !== source.editable.title) {
		patch.title = draft.title;
	}
	if (draft.sortTouched && draft.sortBy !== source.editable.sortBy) {
		patch.sortBy = draft.sortBy;
	}
	return patch;
}

export const studioSourceEditor = Object.freeze({
	id: STUDIO_SOURCE_EDITOR_ID,
	label: "Studio",
	ownedFields: Object.freeze(["title", "sortBy"]),
	checkCurrentIdentityDuplicates: true,
	duplicateMessage(draft) {
		const media = draft?.mediaType === "TV" ? "Series" : "Movies";
		return `This folder already contains another Studio source for ${media}. Remove the duplicate or cancel your changes.`;
	},
	canEdit(source) {
		return source?.nodeType === "source"
			&& source.category === "native-tmdb"
			&& studioSourceIdentity(source.editable) !== null;
	},
	identity: studioSourceIdentity,
	readInitialState,
	validateDraft,
	draftIdentity,
	buildPatch,
	describeIdentity(draft) {
		return `TMDB · COMPANY · ${canonicalPositiveId(draft?.tmdbId) ?? "Invalid ID"} · ${draft?.mediaType ?? "Invalid media"}`;
	},
});

export function studioEditSortValue(draft) {
	return isSupportedStudioSort(draft?.sortBy, draft?.mediaType)
		? draft.sortBy
		: DEFAULT_STUDIO_MOVIE_SORT;
}
