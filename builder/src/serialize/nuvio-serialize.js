import { cloneJsonValue, SOURCE_CATEGORIES } from "../domain/index.js";
import {
	COLLECTION_EDITABLE_FIELDS,
	FOLDER_EDITABLE_FIELDS,
	NATIVE_TMDB_SOURCE_TYPES,
	SOURCE_EDITABLE_FIELDS,
} from "../nuvio/known-fields.js";
import { createCatalogProjections } from "./catalog-projection.js";
import {
	cloneRawObject,
	isPlainObject,
	overlayFilters,
	overlayKnownFields,
	setOwn,
} from "./overlay.js";
import { diagnostic, validateProjectTree } from "./validation.js";

const nativeTmdbSourceTypes = new Set(NATIVE_TMDB_SOURCE_TYPES);
const mediaTypes = new Set(["MOVIE", "TV"]);

/**
 * @typedef {{code: string, path: string, message: string}} Diagnostic
 * @typedef {{ok: boolean, value: import("../domain/model.js").JsonValue | null, errors: Diagnostic[], warnings: Diagnostic[]}} SerializeResult
 * @typedef {SerializeResult & {json: string | null}} StringifyResult
 */

/**
 * Converts a builder project into a detached Nuvio collection array.
 *
 * @param {unknown} project
 * @param {object} [options]
 * @returns {SerializeResult}
 */
export function serializeNuvioProject(project, options = {}) {
	const optionError = validateOptions(options, new Set());
	if (optionError) {
		return serializationFailure([optionError]);
	}

	const errors = validateProjectTree(project);
	if (errors.length > 0) {
		return serializationFailure(errors);
	}

	const warnings = [];
	const value = project.collections.map((collection, collectionIndex) => serializeCollection(
		collection,
		`$[${collectionIndex}]`,
		errors,
		warnings,
	));

	if (errors.length > 0) {
		return serializationFailure(errors, warnings);
	}

	try {
		return { ok: true, value: cloneJsonValue(value, "serialized Nuvio output"), errors: [], warnings };
	} catch {
		return serializationFailure([
			diagnostic("INVALID_SERIALIZED_OUTPUT", "$", "The completed Nuvio output is not dense plain JSON-compatible data."),
		], warnings);
	}
}

/**
 * Serializes a project and returns deterministic JSON text.
 *
 * @param {unknown} project
 * @param {{space?: number}} [options]
 * @returns {StringifyResult}
 */
export function stringifyNuvioProject(project, options = {}) {
	const optionError = validateOptions(options, new Set(["space"]));
	if (optionError) {
		return stringifyFailure([optionError]);
	}
	const space = Object.hasOwn(options, "space") ? options.space : 2;
	if (!Number.isInteger(space) || space < 0 || space > 10) {
		return stringifyFailure([
			diagnostic("INVALID_INDENTATION", "$", "JSON indentation space must be an integer from 0 through 10."),
		]);
	}

	const result = serializeNuvioProject(project);
	if (!result.ok) {
		return { ...result, json: null };
	}

	try {
		return { ...result, json: JSON.stringify(result.value, null, space) };
	} catch {
		return stringifyFailure([
			diagnostic("JSON_STRINGIFY_FAILED", "$", "The validated Nuvio output could not be converted to JSON text."),
		], result.warnings);
	}
}

function serializeCollection(collection, path, errors, warnings) {
	const output = overlayKnownFields(
		cloneRawObject(collection.rawImported),
		collection.editable,
		COLLECTION_EDITABLE_FIELDS,
	);
	validateRequiredText(output.id, "COLLECTION_ID_REQUIRED", `${path}.id`, "Collection id", errors);
	validateRequiredText(output.title, "COLLECTION_TITLE_REQUIRED", `${path}.title`, "Collection title", errors);
	setOwn(output, "folders", collection.folders.map((folder, folderIndex) => serializeFolder(
		folder,
		`${path}.folders[${folderIndex}]`,
		errors,
		warnings,
	)));
	return output;
}

function serializeFolder(folder, path, errors, warnings) {
	const output = overlayKnownFields(
		cloneRawObject(folder.rawImported),
		folder.editable,
		FOLDER_EDITABLE_FIELDS,
	);
	validateRequiredText(output.id, "FOLDER_ID_REQUIRED", `${path}.id`, "Folder id", errors);
	validateRequiredText(output.title, "FOLDER_TITLE_REQUIRED", `${path}.title`, "Folder title", errors);

	const serializedEntries = folder.sources.map((source, sourceIndex) => ({
		node: source,
		value: serializeSource(source, `${path}.sources[${sourceIndex}]`, errors, warnings),
	}));
	setOwn(output, "sources", serializedEntries.map((entry) => entry.value));
	setOwn(output, "catalogSources", createCatalogProjections(
		folder,
		serializedEntries.filter((entry) => entry.node.category === SOURCE_CATEGORIES.ADDON),
		path,
		errors,
		warnings,
	));
	return output;
}

function serializeSource(source, path, errors, warnings) {
	const output = overlayKnownFields(
		cloneRawObject(source.rawImported),
		source.editable,
		SOURCE_EDITABLE_FIELDS,
	);

	if (Object.hasOwn(source.editable, "filters")) {
		if (!isPlainObject(source.editable.filters)) {
			errors.push(diagnostic("INVALID_EDITABLE_FILTERS", `${path}.filters`, "Editable filters must be a plain object when present."));
		} else {
			overlayFilters(output, source.editable, source.rawImported);
		}
	}

	if (source.category === SOURCE_CATEGORIES.NATIVE_TMDB) {
		validateNativeSource(output, path, errors);
	} else if (source.category === SOURCE_CATEGORIES.ADDON) {
		validateAddonSource(output, path, errors);
	} else if (source.category === SOURCE_CATEGORIES.OPAQUE) {
		if (!isPlainObject(source.rawImported)) {
			errors.push(diagnostic("OPAQUE_SOURCE_REQUIRES_RAW", path, "An opaque source requires a plain-object rawImported snapshot."));
		} else {
			warnings.push(diagnostic("OPAQUE_SOURCE_PRESERVED", path, "The imported opaque source was preserved without interpreting its provider shape."));
		}
	}

	return output;
}

function validateNativeSource(source, path, errors) {
	if (typeof source.provider !== "string" || source.provider.toLowerCase() !== "tmdb") {
		errors.push(diagnostic("INVALID_NATIVE_PROVIDER", `${path}.provider`, "A native TMDB source provider must be tmdb."));
	}
	const sourceType = typeof source.tmdbSourceType === "string" ? source.tmdbSourceType.toUpperCase() : "";
	if (!nativeTmdbSourceTypes.has(sourceType)) {
		errors.push(diagnostic("UNSUPPORTED_NATIVE_TMDB_SOURCE_TYPE", `${path}.tmdbSourceType`, "The native TMDB source type is missing or unsupported."));
	}
	const mediaType = typeof source.mediaType === "string" ? source.mediaType.toUpperCase() : "";
	if (!mediaTypes.has(mediaType)) {
		errors.push(diagnostic("INVALID_NATIVE_MEDIA_TYPE", `${path}.mediaType`, "A native TMDB source mediaType must be MOVIE or TV."));
	}
	if (sourceType !== "DISCOVER" && !hasUsableTmdbId(source.tmdbId)) {
		errors.push(diagnostic("NATIVE_TMDB_ID_REQUIRED", `${path}.tmdbId`, "A non-Discover native TMDB source requires a finite number or non-empty string tmdbId."));
	}
	if (Object.hasOwn(source, "filters") && !isPlainObject(source.filters)) {
		errors.push(diagnostic("INVALID_NATIVE_FILTERS", `${path}.filters`, "A supported native TMDB source cannot preserve a non-object filters value."));
	}
}

function validateAddonSource(source, path, errors) {
	if (typeof source.provider !== "string" || source.provider.toLowerCase() !== "addon") {
		errors.push(diagnostic("INVALID_ADDON_PROVIDER", `${path}.provider`, "An addon source provider must be addon."));
	}
	const missing = ["addonId", "type", "catalogId"].filter((field) => !hasNonEmptyString(source[field]));
	if (missing.length > 0) {
		errors.push(diagnostic("INCOMPLETE_ADDON_SOURCE", path, `The addon source requires non-empty strings for: ${missing.join(", ")}.`));
	}
}

function validateRequiredText(value, code, path, label, errors) {
	if (!hasNonEmptyString(value)) {
		errors.push(diagnostic(code, path, `${label} must be a non-empty string.`));
	}
}

function hasNonEmptyString(value) {
	return typeof value === "string" && value.trim().length > 0;
}

function hasUsableTmdbId(value) {
	return (typeof value === "number" && Number.isFinite(value)) || hasNonEmptyString(value);
}

function validateOptions(options, allowedKeys) {
	if (!isPlainObject(options)) {
		return diagnostic("INVALID_SERIALIZER_OPTIONS", "$", "Serializer options must be a plain object.");
	}
	if (Object.keys(options).some((key) => !allowedKeys.has(key))) {
		return diagnostic("INVALID_SERIALIZER_OPTIONS", "$", "Serializer options contain an unsupported property.");
	}
	return null;
}

function serializationFailure(errors, warnings = []) {
	return { ok: false, value: null, errors, warnings };
}

function stringifyFailure(errors, warnings = []) {
	return { ...serializationFailure(errors, warnings), json: null };
}
