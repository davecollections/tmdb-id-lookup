import {
	COLLECTION_EDITABLE_FIELDS,
	DISCOVER_FILTER_FIELDS,
	FOLDER_EDITABLE_FIELDS,
	SOURCE_EDITABLE_FIELDS,
} from "../nuvio/known-fields.js";

/**
 * @param {{[key: string]: import("../domain/model.js").JsonValue}} collection
 * @returns {{[key: string]: import("../domain/model.js").JsonValue}}
 */
export function extractCollectionEditable(collection) {
	return pickOwnFields(collection, COLLECTION_EDITABLE_FIELDS);
}

/**
 * @param {{[key: string]: import("../domain/model.js").JsonValue}} folder
 * @returns {{[key: string]: import("../domain/model.js").JsonValue}}
 */
export function extractFolderEditable(folder) {
	return pickOwnFields(folder, FOLDER_EDITABLE_FIELDS);
}

/**
 * @param {{[key: string]: import("../domain/model.js").JsonValue}} source
 * @param {string} path
 * @returns {{editable: {[key: string]: import("../domain/model.js").JsonValue}, warnings: import("./nuvio-import.js").Diagnostic[]}}
 */
export function extractSourceEditable(source, path) {
	const editable = pickOwnFields(source, SOURCE_EDITABLE_FIELDS);
	const warnings = [];

	if (!Object.hasOwn(source, "filters")) {
		return { editable, warnings };
	}

	if (!isPlainObject(source.filters)) {
		warnings.push({
			code: "INVALID_FILTERS_PRESERVED",
			path: `${path}.filters`,
			message: "The filters value was preserved in rawImported but omitted from editable because it is not an object.",
		});
		return { editable, warnings };
	}

	editable.filters = pickOwnFields(source.filters, DISCOVER_FILTER_FIELDS);
	return { editable, warnings };
}

/**
 * @param {{[key: string]: import("../domain/model.js").JsonValue}} object
 * @param {readonly string[]} fields
 */
function pickOwnFields(object, fields) {
	const picked = {};
	for (const field of fields) {
		if (Object.hasOwn(object, field)) {
			picked[field] = object[field];
		}
	}
	return picked;
}

/**
 * @param {unknown} value
 */
function isPlainObject(value) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		return false;
	}
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}
