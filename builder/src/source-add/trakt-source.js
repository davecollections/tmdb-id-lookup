import { SOURCE_CATEGORIES } from "../domain/model.js";
import { isPlainObject } from "../nuvio/source-overlay.js";
import { validateNativeTraktSource } from "../nuvio/trakt.js";

// Offline constructor for future creation flows; deliberately has no source mode.
export function buildNativeTraktSourceDraft(input) {
	if (!isPlainObject(input) || Object.keys(input).length !== 3 || Object.keys(input).some((key) => !["title", "traktListId", "mediaType"].includes(key))) {
		return Object.freeze({ ok: false, draft: null, errors: Object.freeze([{ code: "INVALID_NATIVE_TRAKT_INPUT", path: "$trakt.source", message: "Provide only a source title, numeric Trakt List ID and media type." }]) });
	}
	const draft = { category: SOURCE_CATEGORIES.NATIVE_TRAKT, editable: { title: input.title, provider: "trakt", mediaType: input.mediaType, traktListId: input.traktListId, sortBy: "rank", sortHow: "asc" } };
	const validation = validateNativeTraktSourceDraft(draft);
	return Object.freeze({ ...validation, draft: validation.ok ? Object.freeze({ ...draft, editable: Object.freeze(draft.editable) }) : null });
}

export function validateNativeTraktSourceDraft(draft) {
	if (!isPlainObject(draft) || Object.keys(draft).length !== 2 || Object.keys(draft).some((key) => !["category", "editable"].includes(key)) || draft.category !== SOURCE_CATEGORIES.NATIVE_TRAKT) {
		return Object.freeze({ ok: false, errors: Object.freeze([{ code: "INVALID_NATIVE_TRAKT_DRAFT", path: "$trakt.source", message: "A native Trakt draft requires its category and canonical editable fields." }]) });
	}
	const validation = validateNativeTraktSource(draft.editable, { authored: true, path: "$trakt.source.editable" });
	const errors = [...validation.errors];
	// Creation defaults are stricter than the canonical source after a later edit.
	for (const [field, expected, code] of [["sortBy", "rank", "UNSUPPORTED_NATIVE_TRAKT_SORT"], ["sortHow", "asc", "UNSUPPORTED_NATIVE_TRAKT_SORT_DIRECTION"]]) {
		if (draft.editable?.[field] !== expected && !errors.some(error => error.code === code)) errors.push(Object.freeze({ code, path: "$trakt.source.editable." + field, message: "New native Trakt sources use rank/asc sorting." }));
	}
	return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors) });
}
