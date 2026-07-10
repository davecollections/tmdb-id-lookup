import { cloneJsonValue } from "../domain/index.js";
import { diagnostic } from "./validation.js";
import { isPlainObject, setOwn } from "./overlay.js";

const projectionIdentityFields = Object.freeze(["addonId", "type", "catalogId", "genre"]);
const movedSourceMetadataFields = Object.freeze(["id", "addonName", "manifestUrl", "showInHome"]);

/**
 * @typedef {{node: import("../domain/model.js").SourceNode, value: {[key: string]: import("../domain/model.js").JsonValue}}} AddonEntry
 */

/**
 * @param {import("../domain/model.js").FolderNode} folder
 * @param {AddonEntry[]} addonEntries
 * @param {string} folderPath
 * @param {import("./validation.js").Diagnostic[]} errors
 * @param {import("./validation.js").Diagnostic[]} warnings
 */
export function createCatalogProjections(folder, addonEntries, folderPath, errors, warnings) {
	const rawFolder = isPlainObject(folder.rawImported) ? folder.rawImported : null;
	let rawProjections = [];

	if (rawFolder && Object.hasOwn(rawFolder, "catalogSources")) {
		if (!Array.isArray(rawFolder.catalogSources)) {
			errors.push(diagnostic(
				"RAW_CATALOG_SOURCES_NOT_ARRAY",
				`${folderPath}.catalogSources`,
				"Imported catalogSources must be an array before compatibility projections can be rebuilt.",
			));
			return [];
		}

		rawProjections = rawFolder.catalogSources;
		for (let index = 0; index < rawProjections.length; index += 1) {
			if (!isPlainObject(rawProjections[index])) {
				errors.push(diagnostic(
					"RAW_CATALOG_SOURCE_NOT_OBJECT",
					`${folderPath}.catalogSources[${index}]`,
					"Every imported catalogSources entry must be a plain object.",
				));
			}
		}
		if (errors.length > 0) {
			return [];
		}
	}

	const queues = buildQueues(rawProjections);
	const usedIndexes = new Set();
	const projections = addonEntries.map((entry) => {
		const originalKey = isPlainObject(entry.node.rawImported) ? projectionKey(entry.node.rawImported) : null;
		const currentKey = projectionKey(entry.value);
		const match = consumeQueue(queues, originalKey, usedIndexes)
			?? consumeQueue(queues, currentKey, usedIndexes);
		const projection = match
			? cloneJsonValue(match.value, "raw catalog source")
			: compatibilityMetadataFromSource(entry.node.rawImported);

		for (const field of [...projectionIdentityFields, "provider"]) {
			delete projection[field];
		}
		for (const field of projectionIdentityFields) {
			if (Object.hasOwn(entry.value, field)) {
				setOwn(projection, field, cloneJsonValue(entry.value[field], `source.${field}`));
			}
		}
		return projection;
	});

	const unmatched = rawProjections
		.map((value, index) => ({ value, index }))
		.filter((entry) => !usedIndexes.has(entry.index));
	const rawSourcesWereMissingOrEmpty = rawFolder
		&& (!Object.hasOwn(rawFolder, "sources") || (Array.isArray(rawFolder.sources) && rawFolder.sources.length === 0));

	if (rawSourcesWereMissingOrEmpty && rawProjections.length > 0 && unmatched.length > 0) {
		errors.push(diagnostic(
			"LEGACY_CATALOG_SOURCES_ONLY_UNRESOLVED",
			`${folderPath}.catalogSources`,
			"Legacy catalogSources-only data has no matching authoritative addon source and cannot be serialized safely.",
		));
		return [];
	}

	for (const entry of unmatched) {
		warnings.push(diagnostic(
			"UNMATCHED_CATALOG_SOURCE_REMOVED",
			`${folderPath}.catalogSources[${entry.index}]`,
			"An imported compatibility projection was omitted because no current addon source references it.",
		));
	}

	return projections;
}

function buildQueues(rawProjections) {
	const queues = new Map();
	rawProjections.forEach((value, index) => {
		const key = projectionKey(value);
		const queue = queues.get(key) ?? [];
		queue.push({ value, index });
		queues.set(key, queue);
	});
	return queues;
}

function consumeQueue(queues, key, usedIndexes) {
	if (key === null) {
		return null;
	}
	const queue = queues.get(key);
	while (queue?.length) {
		const entry = queue.shift();
		if (!usedIndexes.has(entry.index)) {
			usedIndexes.add(entry.index);
			return entry;
		}
	}
	return null;
}

function projectionKey(value) {
	if (!isPlainObject(value)) {
		return null;
	}
	return JSON.stringify([
		value.addonId,
		value.type,
		value.catalogId,
		value.genre ?? "",
	]);
}

function compatibilityMetadataFromSource(rawImported) {
	const metadata = {};
	if (!isPlainObject(rawImported)) {
		return metadata;
	}
	for (const field of movedSourceMetadataFields) {
		if (Object.hasOwn(rawImported, field)) {
			setOwn(metadata, field, cloneJsonValue(rawImported[field], `rawImported.${field}`));
		}
	}
	return metadata;
}
