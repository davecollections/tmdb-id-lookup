import { TRAKT_SORT_VALUES, TRAKT_SORT_DIRECTIONS, inspectNativeTraktSource, nativeTraktPhysicalIdentity, nativeTraktSortLabel } from "../nuvio/trakt.js";
import { diagnostic, validateTouchedSourceTitle } from "./source-edit-utils.js";

export const TRAKT_LIST_SOURCE_EDITOR_ID = "trakt-list";
const fixedFields = Object.freeze(["provider", "traktListId", "mediaType"]);

export const traktListSourceEditor = Object.freeze({
	id: TRAKT_LIST_SOURCE_EDITOR_ID,
	label: "Trakt List",
	ownedFields: Object.freeze(["title", "sortBy", "sortHow"]),
	canEdit: (source) => source?.nodeType === "source" && inspectNativeTraktSource(source) !== null,
	sourceIdentity: nativeTraktPhysicalIdentity,
	readInitialState(source) {
		const { value } = inspectNativeTraktSource(source);
		return Object.freeze({ title: typeof value.title === "string" ? value.title : "", titleTouched: false, sortBy: value.sortBy, sortHow: value.sortHow, ...Object.fromEntries(fixedFields.map((field) => [field, value[field]])) });
	},
	validateDraft({ draft, source }) {
		const errors = [...validateTouchedSourceTitle(draft)];
		const current = inspectNativeTraktSource(source);
		if (!current || fixedFields.some((field) => draft?.[field] !== current.value[field])) errors.push(diagnostic("SOURCE_EDIT_TRAKT_CONFIGURATION_FIXED", "$sourceEdit.identity", "The Trakt List identity and media cannot be changed in this editor."));
		if (!TRAKT_SORT_VALUES.includes(draft?.sortBy)) errors.push(diagnostic("UNSUPPORTED_NATIVE_TRAKT_SORT", "$sourceEdit.sortBy", "Choose a supported Trakt sort."));
		if (!TRAKT_SORT_DIRECTIONS.includes(draft?.sortHow)) errors.push(diagnostic("UNSUPPORTED_NATIVE_TRAKT_SORT_DIRECTION", "$sourceEdit.sortHow", "Choose a supported Trakt direction."));
		return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors) });
	},
	draftIdentity({ session }) { return session.originalIdentity; },
	buildPatch({ source, draft }) {
		const patch = draft.titleTouched && draft.title !== source.editable.title ? { title: draft.title } : {};
		for (const field of ["sortBy", "sortHow"]) if (draft[field] !== source.editable[field]) patch[field] = draft[field];
		return Object.freeze(patch);
	},
	describeIdentity(draft) { return `Trakt · List ${draft.traktListId} · ${draft.mediaType.toUpperCase() === "MOVIE" ? "Movies" : "Series"}`; },
	describeConfiguration(draft) { return nativeTraktSortLabel({ category: "native-trakt", editable: draft }); },
});
