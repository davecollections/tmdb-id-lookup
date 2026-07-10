import { cloneJsonValue, NODE_TYPES, SOURCE_CATEGORIES } from "../domain/index.js";
import { isPlainObject } from "./overlay.js";

const sourceCategories = new Set(Object.values(SOURCE_CATEGORIES));

/**
 * @typedef {{code: string, path: string, message: string}} Diagnostic
 */

/**
 * Validates builder structure before any Nuvio output is returned.
 *
 * @param {unknown} project
 * @returns {Diagnostic[]}
 */
export function validateProjectTree(project) {
	const errors = [];
	if (!isPlainObject(project) || project.nodeType !== NODE_TYPES.PROJECT) {
		return [diagnostic("INVALID_PROJECT_NODE", "$", "The serializer input must be a builder project node.")];
	}

	const internalIds = new Map();
	validateNodeCommon(project, NODE_TYPES.PROJECT, "$", errors, internalIds);
	if (!validateChildArray(project.collections, "$", "collections", errors)) {
		return finishValidation(project, errors, internalIds);
	}

	project.collections.forEach((collection, collectionIndex) => {
		const collectionPath = `$[${collectionIndex}]`;
		if (!isPlainObject(collection) || collection.nodeType !== NODE_TYPES.COLLECTION) {
			errors.push(diagnostic("INVALID_COLLECTION_NODE", collectionPath, "Each project collection must be a builder collection node."));
			return;
		}
		validateNodeCommon(collection, NODE_TYPES.COLLECTION, collectionPath, errors, internalIds);
		validateRawImported(collection, collectionPath, errors);
		if (!validateChildArray(collection.folders, `${collectionPath}.folders`, "folders", errors)) {
			return;
		}

		collection.folders.forEach((folder, folderIndex) => {
			const folderPath = `${collectionPath}.folders[${folderIndex}]`;
			if (!isPlainObject(folder) || folder.nodeType !== NODE_TYPES.FOLDER) {
				errors.push(diagnostic("INVALID_FOLDER_NODE", folderPath, "Each collection folder must be a builder folder node."));
				return;
			}
			validateNodeCommon(folder, NODE_TYPES.FOLDER, folderPath, errors, internalIds);
			validateRawImported(folder, folderPath, errors);
			if (!validateChildArray(folder.sources, `${folderPath}.sources`, "sources", errors)) {
				return;
			}

			folder.sources.forEach((source, sourceIndex) => {
				const sourcePath = `${folderPath}.sources[${sourceIndex}]`;
				if (!isPlainObject(source) || source.nodeType !== NODE_TYPES.SOURCE) {
					errors.push(diagnostic("INVALID_SOURCE_NODE", sourcePath, "Each folder source must be a builder source node."));
					return;
				}
				validateNodeCommon(source, NODE_TYPES.SOURCE, sourcePath, errors, internalIds);
				validateRawImported(source, sourcePath, errors);
				if (!sourceCategories.has(source.category)) {
					errors.push(diagnostic("INVALID_SOURCE_CATEGORY", sourcePath, "The source category must be native-tmdb, addon, or opaque."));
				}
			});
		});
	});

	return finishValidation(project, errors, internalIds);
}

function finishValidation(project, errors, internalIds) {
	for (const [internalId, paths] of internalIds) {
		if (paths.length > 1) {
			errors.push(diagnostic(
				"DUPLICATE_INTERNAL_ID",
				paths[1],
				`Builder internal ID ${JSON.stringify(internalId)} is used by more than one node.`,
			));
		}
	}

	try {
		cloneJsonValue(project, "project");
	} catch {
		errors.push(diagnostic(
			"INVALID_JSON_VALUE",
			"$",
			"The project must contain only finite JSON values, dense arrays, and plain objects without circular references.",
		));
	}

	return errors;
}

function validateNodeCommon(node, expectedType, path, errors, internalIds) {
	if (typeof node.internalId !== "string" || node.internalId.length === 0) {
		errors.push(diagnostic("INVALID_INTERNAL_ID", path, `The ${expectedType} node must have a non-empty builder internal ID.`));
	} else {
		const paths = internalIds.get(node.internalId) ?? [];
		paths.push(path);
		internalIds.set(node.internalId, paths);
	}

	if (!isPlainObject(node.editable)) {
		errors.push(diagnostic("INVALID_EDITABLE", path, `The ${expectedType} node editable value must be a plain object.`));
	}
}

function validateRawImported(node, path, errors) {
	if (Object.hasOwn(node, "rawImported") && !isPlainObject(node.rawImported)) {
		errors.push(diagnostic("INVALID_RAW_IMPORTED", path, "rawImported must be a plain object when present."));
	}
}

function validateChildArray(value, path, label, errors) {
	if (!Array.isArray(value)) {
		errors.push(diagnostic("CHILD_ARRAY_NOT_ARRAY", path, `Builder ${label} must be an array.`));
		return false;
	}
	for (let index = 0; index < value.length; index += 1) {
		if (!Object.hasOwn(value, index)) {
			errors.push(diagnostic("SPARSE_CHILD_ARRAY", path, `Builder ${label} must not contain missing array entries.`));
			return false;
		}
	}
	return true;
}

export function diagnostic(code, path, message) {
	return { code, path, message };
}
