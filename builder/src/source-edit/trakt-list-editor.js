import { inspectNativeTraktSource, nativeTraktPhysicalIdentity, nativeTraktSortLabel } from "../nuvio/trakt.js";
import { diagnostic, validateTouchedSourceTitle } from "./source-edit-utils.js";

export const TRAKT_LIST_SOURCE_EDITOR_ID = "trakt-list";
const fixedFields = Object.freeze(["provider", "traktListId", "mediaType", "sortBy", "sortHow"]);

export const traktListSourceEditor = Object.freeze({
	id: TRAKT_LIST_SOURCE_EDITOR_ID,
	label: "Trakt List",
	ownedFields: Object.freeze(["title"]),
	canEdit: (source) => source?.nodeType === "source" && inspectNativeTraktSource(source) !== null,
	sourceIdentity: nativeTraktPhysicalIdentity,
	readInitialState(source) {
		const { value } = inspectNativeTraktSource(source);
		return Object.freeze({ title: typeof value.title === "string" ? value.title : "", titleTouched: false, ...Object.fromEntries(fixedFields.map((field) => [field, value[field]])) });
	},
	validateDraft({ draft, source }) {
		const errors = [...validateTouchedSourceTitle(draft)];
		const current = inspectNativeTraktSource(source);
		if (!current || fixedFields.some((field) => draft?.[field] !== current.value[field])) errors.push(diagnostic("SOURCE_EDIT_TRAKT_CONFIGURATION_FIXED", "$sourceEdit.identity", "The Trakt List identity, media and sorting cannot be changed in this editor."));
		return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors) });
	},
	draftIdentity({ session }) { return session.originalIdentity; },
	buildPatch({ source, draft }) {
		return Object.freeze(draft.titleTouched && draft.title !== source.editable.title ? { title: draft.title } : {});
	},
	describeIdentity(draft) { return `Trakt · List ${draft.traktListId} · ${draft.mediaType.toUpperCase() === "MOVIE" ? "Movies" : "Series"}`; },
	describeConfiguration(draft) { return nativeTraktSortLabel({ category: "native-trakt", editable: draft }); },
});
