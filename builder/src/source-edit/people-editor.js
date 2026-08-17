import {
	PEOPLE_SOURCE_COMBINATIONS,
	PEOPLE_SOURCE_SORT_OPTIONS,
	isVerifiedPeopleSort,
	peopleSortOptions,
	peopleSourceIdentity,
} from "../source-add/index.js";
import {
	canonicalPositiveId,
	canonicalText,
	diagnostic,
	validateTouchedSourceTitle,
} from "./source-edit-utils.js";

export { PEOPLE_SOURCE_SORT_OPTIONS, isVerifiedPeopleSort, peopleSortOptions };

export const PEOPLE_SOURCE_EDITOR_ID = "people";

const combinationById = new Map(PEOPLE_SOURCE_COMBINATIONS.map((entry) => [entry.id, entry]));
const approvedDefaultTitles = new Set(PEOPLE_SOURCE_COMBINATIONS.map((entry) => entry.sourceTitle));

export function peopleEditCombination(tmdbSourceType, mediaType) {
	const sourceType = canonicalText(tmdbSourceType).toUpperCase();
	const canonicalMediaType = canonicalText(mediaType).toUpperCase();
	return PEOPLE_SOURCE_COMBINATIONS.find((entry) => (
		entry.tmdbSourceType === sourceType && entry.mediaType === canonicalMediaType
	)) ?? null;
}

function readInitialState(source) {
	const combination = peopleEditCombination(
		source.editable.tmdbSourceType,
		source.editable.mediaType,
	);
	return Object.freeze({
		title: typeof source.editable.title === "string" ? source.editable.title : "",
		titleTouched: false,
		titleMode: approvedDefaultTitles.has(source.editable.title) ? "auto" : "custom",
		combinationId: combination?.id ?? null,
		combinationTouched: false,
		tmdbId: canonicalPositiveId(source.editable.tmdbId),
		sortBy: source.editable.sortBy,
		originalSortBy: source.editable.sortBy,
		sortOptionId: null,
		sortTouched: false,
	});
}

function validateDraft({ draft, source }) {
	const errors = [...validateTouchedSourceTitle(draft)];
	if (!combinationById.has(draft?.combinationId)) {
		errors.push(diagnostic(
			"SOURCE_EDIT_PEOPLE_COMBINATION_REQUIRED",
			"$sourceEdit.combinationId",
			"Choose one supported People source combination.",
		));
	}
	if (
		canonicalPositiveId(draft?.tmdbId) === null
		|| canonicalPositiveId(draft?.tmdbId) !== canonicalPositiveId(source?.editable?.tmdbId)
	) {
		errors.push(diagnostic(
			"SOURCE_EDIT_PERSON_ID_FIXED",
			"$sourceEdit.tmdbId",
			"The person identity cannot be changed in this editor.",
		));
	}
	if (draft?.sortTouched && !isVerifiedPeopleSort(
		draft.sortBy,
		combinationById.get(draft?.combinationId)?.mediaType,
	)) {
		errors.push(diagnostic(
			"SOURCE_EDIT_PEOPLE_SORT_UNSUPPORTED",
			"$sourceEdit.sortBy",
			"Choose a supported People sort order for the selected media type.",
		));
	}
	return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors) });
}

function draftIdentity({ draft }) {
	const combination = combinationById.get(draft?.combinationId);
	const tmdbId = canonicalPositiveId(draft?.tmdbId);
	if (!combination || tmdbId === null) return null;
	return `tmdb|${combination.tmdbSourceType}|${tmdbId}|${combination.mediaType}`;
}

function buildPatch({ source, draft, session }) {
	const patch = {};
	if (draft.titleTouched && draft.title !== source.editable.title) {
		patch.title = draft.title;
	}
	if (draftIdentity({ draft }) !== session.originalIdentity) {
		const combination = combinationById.get(draft.combinationId);
		const originalCombination = peopleEditCombination(
			source.editable.tmdbSourceType,
			source.editable.mediaType,
		);
		if (combination.tmdbSourceType !== originalCombination?.tmdbSourceType) {
			patch.tmdbSourceType = combination.tmdbSourceType;
		}
		if (combination.mediaType !== originalCombination?.mediaType) {
			patch.mediaType = combination.mediaType;
		}
	}
	if (draft.sortTouched && draft.sortBy !== source.editable.sortBy) {
		patch.sortBy = draft.sortBy;
	}
	return patch;
}

export const peopleSourceEditor = Object.freeze({
	id: PEOPLE_SOURCE_EDITOR_ID,
	label: "People",
	ownedFields: Object.freeze(["title", "tmdbSourceType", "mediaType", "sortBy"]),
	duplicateMessage(draft) {
		const title = combinationById.get(draft?.combinationId)?.sourceTitle ?? "that role and media source";
		return `This folder already contains ${title} for this person. Choose another source type or cancel your changes.`;
	},
	canEdit(source) {
		return source?.nodeType === "source"
			&& source.category === "native-tmdb"
			&& peopleSourceIdentity(source.editable) !== null
			&& peopleEditCombination(
				source.editable.tmdbSourceType,
				source.editable.mediaType,
			) !== null;
	},
	identity: peopleSourceIdentity,
	readInitialState,
	validateDraft,
	draftIdentity,
	buildPatch,
	describeIdentity(draft) {
		const combination = combinationById.get(draft?.combinationId);
		return combination
			? `TMDB · ${combination.tmdbSourceType} · ${canonicalPositiveId(draft?.tmdbId) ?? "Invalid ID"} · ${combination.mediaType}`
			: "Unsupported People identity";
	},
});
