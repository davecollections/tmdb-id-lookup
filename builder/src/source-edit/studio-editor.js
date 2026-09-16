import { inspectStudioMinimumVotes, STUDIO_ADVANCED_FIELDS } from "../source-add/studio-advanced.js";
import { validateMinimumVotesFilters } from "../source-add/minimum-votes.js";
import { inspectRatingBounds, ownedRatingMirrorSource, RATING_BOUNDS_FIELDS, validateRatingBoundsEdit } from "../source-add/rating-bounds.js";
import { resolveEffectiveDiscoverSource } from "../nuvio/discover.js";
import { patchTouchedDiscoverFilters } from "../nuvio/discover-imported-filters.js";
import {
	DEFAULT_STUDIO_MOVIE_SORT,
	isSupportedStudioSort,
	studioSortOptionId,
	studioSourceIdentity,
	studioSourceVariantKey,
} from "../source-add/index.js";
import {
	canonicalPositiveId,
	canonicalText,
	diagnostic,
	validateTouchedSourceTitle,
} from "./source-edit-utils.js";

export const STUDIO_SOURCE_EDITOR_ID = "studio";

function readInitialState(source) {
	const minimum = inspectStudioMinimumVotes(source);
	const ratings = inspectRatingBounds(source);
	return Object.freeze({
		filters: { ...minimum.filters, ...ratings.filters },
		touchedFilters: [],
		minimumVotesEditable: minimum.editable,
		ratingBoundsEditable: ratings.editable,
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
	const touched = draft?.touchedFilters ?? [];
	if (!Array.isArray(touched) || touched.some((key) => !STUDIO_ADVANCED_FIELDS.includes(key))) errors.push(diagnostic("SOURCE_EDIT_STUDIO_FILTER_FIXED", "$sourceEdit.filters", "Only Minimum votes and rating bounds can be edited here."));
	else if (touched.length) {
		if (touched.includes("voteCountGte")) {
			if (!inspectStudioMinimumVotes(source).editable) errors.push(diagnostic("SOURCE_EDIT_STUDIO_FILTER_PRESERVED", "$sourceEdit.filters", "This imported Minimum votes setting must be preserved."));
			errors.push(...validateMinimumVotesFilters({ voteCountGte: draft.filters?.voteCountGte }, draft.mediaType).errors);
		}
		if (touched.some((field) => RATING_BOUNDS_FIELDS.includes(field))) errors.push(...validateRatingBoundsEdit(source, draft).errors);
	}
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
	if (!draft.touchedFilters?.length) return patch;
	const original = ownedRatingMirrorSource(resolveEffectiveDiscoverSource(source).value);
	const minimum = validateMinimumVotesFilters({ voteCountGte: draft.filters?.voteCountGte }, draft.mediaType);
	const ratings = draft.touchedFilters.some((field) => RATING_BOUNDS_FIELDS.includes(field)) ? validateRatingBoundsEdit(source, draft).filters : {};
	return { ...patch, ...patchTouchedDiscoverFilters(source, original, { ...minimum.filters, ...ratings }, draft.touchedFilters) };
}

export const studioSourceEditor = Object.freeze({
	id: STUDIO_SOURCE_EDITOR_ID,
	label: "Studio",
	ownedFields: Object.freeze(["title", "sortBy", "filters"]),
	duplicateKey: studioSourceVariantKey,
	duplicateMessage(draft) {
		const media = draft?.mediaType === "TV" ? "Series" : "Movies";
		return `This folder already contains this Studio sorting option and filters for ${media}. Change the sorting option or Advanced settings, or cancel your changes.`;
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
