import { cloneJsonValue } from "../domain/index.js";
import { DISCOVER_FILTER_FIELDS } from "../nuvio/known-fields.js";

const discoverFilterFields = new Set(DISCOVER_FILTER_FIELDS);

/**
 * @param {unknown} value
 * @returns {value is {[key: string]: import("../domain/model.js").JsonValue}}
 */
export function isPlainObject(value) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		return false;
	}
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

/**
 * Defines an enumerable own property without invoking the special __proto__ setter.
 *
 * @param {object} target
 * @param {string} key
 * @param {unknown} value
 */
export function setOwn(target, key, value) {
	Object.defineProperty(target, key, {
		configurable: true,
		enumerable: true,
		value,
		writable: true,
	});
}

/**
 * @param {unknown} rawImported
 * @returns {{[key: string]: import("../domain/model.js").JsonValue}}
 */
export function cloneRawObject(rawImported) {
	return isPlainObject(rawImported) ? cloneJsonValue(rawImported, "rawImported") : {};
}

/**
 * Overlays only recognised own editable fields onto a detached base object.
 *
 * @param {{[key: string]: import("../domain/model.js").JsonValue}} base
 * @param {{[key: string]: import("../domain/model.js").JsonValue}} editable
 * @param {readonly string[]} fields
 */
export function overlayKnownFields(base, editable, fields) {
	for (const field of fields) {
		if (Object.hasOwn(editable, field)) {
			setOwn(base, field, cloneJsonValue(editable[field], `editable.${field}`));
		}
	}
	return base;
}

/**
 * Applies the recognised-filter overlay while retaining unknown imported keys.
 * The caller validates that an explicit editable filters value is a plain object.
 *
 * @param {{[key: string]: import("../domain/model.js").JsonValue}} output
 * @param {{[key: string]: import("../domain/model.js").JsonValue}} editable
 * @param {unknown} rawImported
 */
export function overlayFilters(output, editable, rawImported) {
	if (!Object.hasOwn(editable, "filters")) {
		return output;
	}

	const rawFilters = isPlainObject(rawImported) && isPlainObject(rawImported.filters)
		? cloneJsonValue(rawImported.filters, "rawImported.filters")
		: {};

	for (const field of DISCOVER_FILTER_FIELDS) {
		delete rawFilters[field];
	}

	for (const [field, value] of Object.entries(editable.filters)) {
		if (discoverFilterFields.has(field)) {
			setOwn(rawFilters, field, cloneJsonValue(value, `editable.filters.${field}`));
		}
	}

	setOwn(output, "filters", rawFilters);
	return output;
}
