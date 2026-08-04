import { isValidNuvioTitle } from "../nuvio/titles.js";

export function diagnostic(code, path, message) {
	return Object.freeze({ code, path, message });
}

export function isPlainObject(value) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

export function canonicalText(value) {
	return typeof value === "string" ? value.trim() : "";
}

export function canonicalPositiveId(value) {
	if (typeof value === "number") {
		return Number.isSafeInteger(value) && value > 0 ? value : null;
	}
	if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
	const number = Number(value);
	return Number.isSafeInteger(number) && number > 0 ? number : null;
}

export function validateTouchedSourceTitle(draft, path = "$sourceEdit.title") {
	if (!draft?.titleTouched) return [];
	const title = draft.title;
	if (!isValidNuvioTitle(title)) {
		return [diagnostic(
			"SOURCE_EDIT_TITLE_REQUIRED",
			path,
			"Enter a name for this source before saving.",
		)];
	}
	return [];
}

export function safeSourceEditTitle(value, fallback) {
	const title = canonicalText(value);
	return title || fallback;
}
