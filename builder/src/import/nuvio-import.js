import {
	checkInternalIdUniqueness,
	cloneJsonValue,
	createCollection,
	createEmptyProject,
	createFolder,
	createSource,
	defaultInternalIdFactory,
} from "../domain/index.js";
import {
	extractCollectionEditable,
	extractFolderEditable,
	extractSourceEditable,
} from "./editable-fields.js";
import { classifyNuvioSource } from "./source-classification.js";

/**
 * @typedef {object} Diagnostic
 * @property {string} code Stable machine-readable identifier.
 * @property {string} path JSONPath-like location.
 * @property {string} message Human-readable explanation without engine internals.
 */

/**
 * @typedef {object} ImportOptions
 * @property {() => string} [idFactory] One factory used for every builder node.
 * @property {string} [projectTitle] Explicit builder-only project title.
 */

/**
 * @typedef {object} ImportResult
 * @property {boolean} ok
 * @property {import("../domain/model.js").ProjectNode | null} project
 * @property {Diagnostic[]} errors
 * @property {Diagnostic[]} warnings
 */

/**
 * Parses JSON text and imports its collection array without exposing parser internals.
 *
 * @param {unknown} text
 * @param {ImportOptions} [options]
 * @returns {ImportResult}
 */
export function parseNuvioJsonText(text, options) {
	if (typeof text !== "string") {
		return failure("JSON_TEXT_REQUIRED", "$", "Nuvio JSON text input must be a string.");
	}

	let value;
	try {
		value = JSON.parse(text);
	} catch {
		return failure("JSON_PARSE_ERROR", "$", "The input is not valid JSON.");
	}

	return importNuvioCollections(value, options);
}

/**
 * Imports an already-parsed JSON-compatible array of Nuvio collections.
 * Structural validation completes before any domain node is created.
 *
 * @param {unknown} value
 * @param {ImportOptions} [options]
 * @returns {ImportResult}
 */
export function importNuvioCollections(value, options = {}) {
	const optionError = validateOptions(options);
	if (optionError) {
		return { ok: false, project: null, errors: [optionError], warnings: [] };
	}

	const structuralErrors = validateStructure(value);
	if (structuralErrors.length > 0) {
		return { ok: false, project: null, errors: structuralErrors, warnings: [] };
	}

	let collections;
	try {
		collections = cloneJsonValue(value, "Nuvio import input");
	} catch {
		return failure(
			"INVALID_JSON_VALUE",
			"$",
			"The parsed input must contain only finite JSON values, plain objects, and arrays without circular references.",
		);
	}

	const idFactory = options.idFactory ?? defaultInternalIdFactory;
	const warnings = [];
	let project;

	try {
		project = createEmptyProject({
			idFactory,
			editable: { title: options.projectTitle ?? "" },
		});

		project.collections = collections.map((collection, collectionIndex) => {
			const collectionPath = `$[${collectionIndex}]`;
			const collectionNode = createCollection({
				idFactory,
				editable: extractCollectionEditable(collection),
				rawImported: collection,
			});

			if (!Object.hasOwn(collection, "folders")) {
				warnings.push(diagnostic(
					"MISSING_FOLDERS",
					`${collectionPath}.folders`,
					"The collection has no folders property; an empty folder list was imported.",
				));
			}

			collectionNode.folders = (collection.folders ?? []).map((folder, folderIndex) => {
				const folderPath = `${collectionPath}.folders[${folderIndex}]`;
				const folderNode = createFolder({
					idFactory,
					editable: extractFolderEditable(folder),
					rawImported: folder,
				});

				if (!Object.hasOwn(folder, "sources")) {
					warnings.push(diagnostic(
						"MISSING_SOURCES",
						`${folderPath}.sources`,
						"The folder has no sources property; an empty active source list was imported.",
					));
				}

				if (Object.hasOwn(folder, "catalogSources") && !Array.isArray(folder.catalogSources)) {
					warnings.push(diagnostic(
						"CATALOG_SOURCES_NOT_ARRAY_PRESERVED",
						`${folderPath}.catalogSources`,
						"The non-array catalogSources value was preserved in rawImported and was not treated as active sources.",
					));
				}

				const sources = folder.sources ?? [];
				if (Array.isArray(folder.catalogSources) && folder.catalogSources.length > 0 && sources.length === 0) {
					warnings.push(diagnostic(
						"LEGACY_CATALOG_SOURCES_ONLY",
						`${folderPath}.catalogSources`,
						"Compatibility catalogSources data was preserved but not promoted into the authoritative active sources list.",
					));
				}

				folderNode.sources = sources.map((source, sourceIndex) => {
					const sourcePath = `${folderPath}.sources[${sourceIndex}]`;
					const classification = classifyNuvioSource(source, sourcePath);
					const extracted = extractSourceEditable(source, sourcePath);
					warnings.push(...classification.warnings, ...extracted.warnings);
					return createSource({
						category: classification.category,
						idFactory,
						editable: extracted.editable,
						rawImported: source,
					});
				});

				return folderNode;
			});

			return collectionNode;
		});
	} catch {
		return failure(
			"INTERNAL_ID_GENERATION_ERROR",
			"$",
			"The internal ID factory failed to provide a valid non-empty string for every imported node.",
			warnings,
		);
	}

	const uniqueness = checkInternalIdUniqueness(project);
	if (!uniqueness.unique) {
		return failure(
			"INTERNAL_ID_COLLISION",
			"$",
			"The internal ID factory produced duplicate builder node identities.",
			warnings,
		);
	}

	return { ok: true, project, errors: [], warnings };
}

/**
 * @param {unknown} options
 * @returns {Diagnostic | null}
 */
function validateOptions(options) {
	if (!isPlainObject(options)) {
		return diagnostic("INVALID_IMPORT_OPTIONS", "$", "Importer options must be a plain object.");
	}
	if (Object.hasOwn(options, "idFactory") && typeof options.idFactory !== "function") {
		return diagnostic("INVALID_ID_FACTORY", "$", "idFactory must be a function when supplied.");
	}
	if (Object.hasOwn(options, "projectTitle") && typeof options.projectTitle !== "string") {
		return diagnostic("INVALID_PROJECT_TITLE", "$", "projectTitle must be a string when supplied.");
	}
	return null;
}

/**
 * @param {unknown} value
 * @returns {Diagnostic[]}
 */
function validateStructure(value) {
	if (!Array.isArray(value)) {
		return [diagnostic("ROOT_NOT_ARRAY", "$", "The Nuvio import root must be an array of collections.")];
	}

	const errors = [];
	value.forEach((collection, collectionIndex) => {
		const collectionPath = `$[${collectionIndex}]`;
		if (!isPlainObject(collection)) {
			errors.push(diagnostic("COLLECTION_NOT_OBJECT", collectionPath, "Each collection entry must be an object."));
			return;
		}

		if (Object.hasOwn(collection, "folders") && !Array.isArray(collection.folders)) {
			errors.push(diagnostic("FOLDERS_NOT_ARRAY", `${collectionPath}.folders`, "Collection folders must be an array when present."));
			return;
		}

		(collection.folders ?? []).forEach((folder, folderIndex) => {
			const folderPath = `${collectionPath}.folders[${folderIndex}]`;
			if (!isPlainObject(folder)) {
				errors.push(diagnostic("FOLDER_NOT_OBJECT", folderPath, "Each folder entry must be an object."));
				return;
			}

			if (Object.hasOwn(folder, "sources") && !Array.isArray(folder.sources)) {
				errors.push(diagnostic("SOURCES_NOT_ARRAY", `${folderPath}.sources`, "Folder sources must be an array when present."));
				return;
			}

			(folder.sources ?? []).forEach((source, sourceIndex) => {
				if (!isPlainObject(source)) {
					const sourcePath = `${folderPath}.sources[${sourceIndex}]`;
					errors.push(diagnostic("SOURCE_NOT_OBJECT", sourcePath, "Each active source entry must be an object."));
				}
			});
		});
	});
	return errors;
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

function diagnostic(code, path, message) {
	return { code, path, message };
}

function failure(code, path, message, warnings = []) {
	return {
		ok: false,
		project: null,
		errors: [diagnostic(code, path, message)],
		warnings,
	};
}
