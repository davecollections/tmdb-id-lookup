import { createInternalId, defaultInternalIdFactory } from "./internal-ids.js";

export const NODE_TYPES = Object.freeze({
	PROJECT: "project",
	COLLECTION: "collection",
	FOLDER: "folder",
	SOURCE: "source",
});

export const SOURCE_CATEGORIES = Object.freeze({
	NATIVE_TMDB: "native-tmdb",
	ADDON: "addon",
	OPAQUE: "opaque",
});

const sourceCategories = new Set(Object.values(SOURCE_CATEGORIES));

/**
 * @typedef {null | boolean | number | string | JsonValue[] | {[key: string]: JsonValue}} JsonValue
 */

/**
 * @typedef {object} ProjectNode
 * @property {"project"} nodeType
 * @property {string} internalId Builder-only identity; never a Nuvio ID.
 * @property {{title: string, [key: string]: JsonValue}} editable Current builder-editable values.
 * @property {CollectionNode[]} collections Ordered child collections.
 */

/**
 * @typedef {object} CollectionNode
 * @property {"collection"} nodeType
 * @property {string} internalId Builder-only identity; never exported automatically.
 * @property {{id: string, title: string, [key: string]: JsonValue}} editable
 * @property {JsonValue} [rawImported] Detached imported JSON snapshot.
 * @property {FolderNode[]} folders Ordered child folders.
 */

/**
 * @typedef {object} FolderNode
 * @property {"folder"} nodeType
 * @property {string} internalId Builder-only identity; never exported automatically.
 * @property {{id: string, title: string, [key: string]: JsonValue}} editable
 * @property {JsonValue} [rawImported] Detached imported JSON snapshot.
 * @property {SourceNode[]} sources The sole active editable source list.
 */

/**
 * @typedef {object} SourceNode
 * @property {"source"} nodeType
 * @property {string} internalId Builder-only identity; never exported automatically.
 * @property {"native-tmdb" | "addon" | "opaque"} category Explicit caller-selected category.
 * @property {{[key: string]: JsonValue}} editable Current builder-editable values.
 * @property {JsonValue} [rawImported] Detached imported JSON snapshot.
 */

/**
 * Deeply clones JSON-compatible data into plain objects and arrays.
 *
 * @param {unknown} value
 * @param {string} [label]
 * @returns {JsonValue}
 */
export function cloneJsonValue(value, label = "value") {
	return cloneJsonValueInternal(value, label, new WeakSet());
}

/**
 * @param {unknown} value
 * @param {string} label
 * @param {WeakSet<object>} ancestors
 * @returns {JsonValue}
 */
function cloneJsonValueInternal(value, label, ancestors) {
	if (value === null || typeof value === "string" || typeof value === "boolean") {
		return value;
	}

	if (typeof value === "number") {
		if (!Number.isFinite(value)) {
			throw new TypeError(`${label} must contain only finite numbers`);
		}
		return value;
	}

	if (typeof value !== "object") {
		throw new TypeError(`${label} must be JSON-compatible`);
	}

	if (ancestors.has(value)) {
		throw new TypeError(`${label} must not contain circular references`);
	}

	ancestors.add(value);
	let clone;

	if (Array.isArray(value)) {
		for (let index = 0; index < value.length; index += 1) {
			if (!Object.hasOwn(value, index)) {
				throw new TypeError(`${label} must not contain sparse arrays`);
			}
		}
		clone = value.map((entry) => cloneJsonValueInternal(entry, label, ancestors));
	} else {
		const prototype = Object.getPrototypeOf(value);
		if (prototype !== Object.prototype && prototype !== null) {
			throw new TypeError(`${label} must contain only plain objects and arrays`);
		}

		clone = {};
		for (const [key, entry] of Object.entries(value)) {
			Object.defineProperty(clone, key, {
				configurable: true,
				enumerable: true,
				value: cloneJsonValueInternal(entry, label, ancestors),
				writable: true,
			});
		}
	}

	ancestors.delete(value);
	return clone;
}

/**
 * @param {object} [options]
 * @param {() => string} [options.idFactory]
 * @param {{title?: string, [key: string]: JsonValue}} [options.editable]
 * @returns {ProjectNode}
 */
export function createEmptyProject({ idFactory = defaultInternalIdFactory, editable = {} } = {}) {
	return {
		nodeType: NODE_TYPES.PROJECT,
		internalId: createInternalId(idFactory),
		editable: {
			title: "",
			...cloneEditable(editable),
		},
		collections: [],
	};
}

/**
 * @param {object} [options]
 * @param {() => string} [options.idFactory]
 * @param {{id?: string, title?: string, [key: string]: JsonValue}} [options.editable]
 * @param {JsonValue} [options.rawImported]
 * @returns {CollectionNode}
 */
export function createCollection({ idFactory = defaultInternalIdFactory, editable = {}, rawImported } = {}) {
	return withRawSnapshot({
		nodeType: NODE_TYPES.COLLECTION,
		internalId: createInternalId(idFactory),
		editable: {
			id: "",
			title: "",
			...cloneEditable(editable),
		},
		folders: [],
	}, rawImported);
}

/**
 * @param {object} [options]
 * @param {() => string} [options.idFactory]
 * @param {{id?: string, title?: string, [key: string]: JsonValue}} [options.editable]
 * @param {JsonValue} [options.rawImported]
 * @returns {FolderNode}
 */
export function createFolder({ idFactory = defaultInternalIdFactory, editable = {}, rawImported } = {}) {
	return withRawSnapshot({
		nodeType: NODE_TYPES.FOLDER,
		internalId: createInternalId(idFactory),
		editable: {
			id: "",
			title: "",
			...cloneEditable(editable),
		},
		sources: [],
	}, rawImported);
}

/**
 * @param {object} options
 * @param {"native-tmdb" | "addon" | "opaque"} options.category
 * @param {() => string} [options.idFactory]
 * @param {{[key: string]: JsonValue}} [options.editable]
 * @param {JsonValue} [options.rawImported]
 * @returns {SourceNode}
 */
export function createSource({ category, idFactory = defaultInternalIdFactory, editable = {}, rawImported } = {}) {
	if (!sourceCategories.has(category)) {
		throw new TypeError(`Unknown source category: ${String(category)}`);
	}

	return withRawSnapshot({
		nodeType: NODE_TYPES.SOURCE,
		internalId: createInternalId(idFactory),
		category,
		editable: cloneEditable(editable),
	}, rawImported);
}

/**
 * @param {unknown} editable
 * @returns {{[key: string]: JsonValue}}
 */
function cloneEditable(editable) {
	const clone = cloneJsonValue(editable, "editable");
	if (Array.isArray(clone) || clone === null || typeof clone !== "object") {
		throw new TypeError("editable must be a plain object");
	}
	return clone;
}

/**
 * @template {object} T
 * @param {T} node
 * @param {JsonValue | undefined} rawImported
 * @returns {T & {rawImported?: JsonValue}}
 */
function withRawSnapshot(node, rawImported) {
	if (rawImported === undefined) {
		return node;
	}

	return {
		...node,
		rawImported: cloneJsonValue(rawImported, "rawImported"),
	};
}
