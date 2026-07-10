import {
	cloneJsonValue,
	defaultInternalIdFactory,
	NODE_TYPES,
	SOURCE_CATEGORIES,
} from "../domain/index.js";
import { normalizeMigratedAddonGenre } from "../nuvio/addon-projection-identity.js";
import {
	diagnostic,
	isPlainObject,
	validateMigrationJsonCompatibility,
	validateMigrationProject,
} from "./validation.js";

/**
 * @typedef {{code: string, path: string, message: string}} Diagnostic
 * @typedef {{foldersMigrated: number, sourcesCreated: number}} MigrationChanges
 * @typedef {{ok: boolean, project: import("../domain/model.js").ProjectNode | null, errors: Diagnostic[], warnings: Diagnostic[], changes: MigrationChanges}} MigrationResult
 */

/**
 * Explicitly promotes confirmed legacy addon catalog projections into compact
 * authoritative addon source nodes. Import remains preservation-first.
 *
 * @param {unknown} project
 * @param {{idFactory?: () => string}} [options]
 * @returns {MigrationResult}
 */
export function migrateLegacyAddonProjections(project, options = {}) {
	const optionError = validateOptions(options);
	if (optionError) {
		return failure([optionError]);
	}

	const structureErrors = validateMigrationProject(project);
	if (structureErrors.length > 0) {
		return failure(structureErrors);
	}

	const { eligibleFolders, errors: projectionErrors } = collectEligibleFolders(project);
	if (projectionErrors.length > 0) {
		return failure(projectionErrors);
	}

	const jsonError = validateMigrationJsonCompatibility(project);
	if (jsonError) {
		return failure([jsonError]);
	}

	const idFactory = options.idFactory ?? defaultInternalIdFactory;
	const reservedIds = new Set(collectInternalIds(project));
	const generatedIds = [];
	for (const eligible of eligibleFolders) {
		for (let projectionIndex = 0; projectionIndex < eligible.projections.length; projectionIndex += 1) {
			const path = `${eligible.path}.catalogSources[${projectionIndex}]`;
			let internalId;
			try {
				internalId = idFactory();
			} catch {
				return failure([diagnostic(
					"INTERNAL_ID_GENERATION_ERROR",
					path,
					"The internal ID factory threw while creating a migrated source identity.",
				)]);
			}
			if (typeof internalId !== "string" || internalId.length === 0) {
				return failure([diagnostic(
					"INTERNAL_ID_GENERATION_ERROR",
					path,
					"The internal ID factory must return a non-empty string for every migrated source.",
				)]);
			}
			if (reservedIds.has(internalId)) {
				return failure([diagnostic(
					"DUPLICATE_INTERNAL_ID",
					path,
					`Builder internal ID ${JSON.stringify(internalId)} collides with an existing or newly generated node identity.`,
				)]);
			}
			reservedIds.add(internalId);
			generatedIds.push(internalId);
		}
	}

	const migratedProject = cloneJsonValue(project, "project");
	const warnings = [];
	let generatedIndex = 0;
	for (const eligible of eligibleFolders) {
		const folder = migratedProject.collections[eligible.collectionIndex].folders[eligible.folderIndex];
		folder.sources = eligible.projections.map((projection) => {
			const editable = {
				provider: "addon",
				addonId: projection.addonId,
				type: projection.type,
				catalogId: projection.catalogId,
			};
			if (Object.hasOwn(projection, "genre")) {
				editable.genre = normalizeMigratedAddonGenre(projection.genre);
			}
			return {
				nodeType: NODE_TYPES.SOURCE,
				internalId: generatedIds[generatedIndex++],
				category: SOURCE_CATEGORIES.ADDON,
				editable,
			};
		});
		warnings.push(diagnostic(
			"LEGACY_ADDON_PROJECTIONS_MIGRATED",
			eligible.path,
			`${eligible.projections.length} legacy addon projection${eligible.projections.length === 1 ? " was" : "s were"} promoted into authoritative sources.`,
		));
	}

	return {
		ok: true,
		project: migratedProject,
		errors: [],
		warnings,
		changes: {
			foldersMigrated: eligibleFolders.length,
			sourcesCreated: generatedIds.length,
		},
	};
}

function collectEligibleFolders(project) {
	const eligibleFolders = [];
	const errors = [];
	project.collections.forEach((collection, collectionIndex) => {
		collection.folders.forEach((folder, folderIndex) => {
			const path = `$[${collectionIndex}].folders[${folderIndex}]`;
			if (folder.sources.length !== 0 || !isPlainObject(folder.rawImported)) {
				return;
			}
			const rawFolder = folder.rawImported;
			if (Object.hasOwn(rawFolder, "sources") && (!Array.isArray(rawFolder.sources) || rawFolder.sources.length !== 0)) {
				return;
			}
			if (!Object.hasOwn(rawFolder, "catalogSources")) {
				return;
			}
			if (!Array.isArray(rawFolder.catalogSources)) {
				errors.push(diagnostic(
					"RAW_CATALOG_SOURCES_NOT_ARRAY",
					`${path}.catalogSources`,
					"Legacy catalogSources must be an array before addon projections can be migrated.",
				));
				return;
			}
			if (rawFolder.catalogSources.length === 0) {
				return;
			}
			for (let projectionIndex = 0; projectionIndex < rawFolder.catalogSources.length; projectionIndex += 1) {
				const projectionPath = `${path}.catalogSources[${projectionIndex}]`;
				if (!Object.hasOwn(rawFolder.catalogSources, projectionIndex)) {
					errors.push(diagnostic(
						"SPARSE_RAW_CATALOG_SOURCES",
						`${path}.catalogSources`,
						"Legacy catalogSources must not contain missing array entries.",
					));
					break;
				}
				const projection = rawFolder.catalogSources[projectionIndex];
				if (!isPlainObject(projection)) {
					errors.push(diagnostic(
						"RAW_CATALOG_SOURCE_NOT_OBJECT",
						projectionPath,
						"Every legacy catalogSources entry must be a plain object.",
					));
					continue;
				}
				const missing = ["addonId", "type", "catalogId"].filter((field) => !hasNonEmptyString(projection[field]));
				if (missing.length > 0) {
					errors.push(diagnostic(
						"INCOMPLETE_LEGACY_ADDON_PROJECTION",
						projectionPath,
						`Legacy addon projections require non-empty strings for: ${missing.join(", ")}.`,
					));
				}
				if (Object.hasOwn(projection, "genre") && projection.genre !== null && typeof projection.genre !== "string") {
					errors.push(diagnostic(
						"INVALID_LEGACY_ADDON_GENRE",
						`${projectionPath}.genre`,
						"A legacy addon projection genre must be a string or null when present.",
					));
				}
			}

			eligibleFolders.push({
				collectionIndex,
				folderIndex,
				path,
				projections: rawFolder.catalogSources,
			});
		});
	});
	return { eligibleFolders, errors };
}

function collectInternalIds(project) {
	const ids = [project.internalId];
	for (const collection of project.collections) {
		ids.push(collection.internalId);
		for (const folder of collection.folders) {
			ids.push(folder.internalId);
			for (const source of folder.sources) {
				ids.push(source.internalId);
			}
		}
	}
	return ids;
}

function validateOptions(options) {
	if (!isPlainObject(options) || Object.keys(options).some((key) => key !== "idFactory")) {
		return diagnostic("INVALID_MIGRATION_OPTIONS", "$", "Migration options must be a plain object containing only idFactory.");
	}
	if (Object.hasOwn(options, "idFactory") && typeof options.idFactory !== "function") {
		return diagnostic("INVALID_ID_FACTORY", "$", "idFactory must be a function when supplied.");
	}
	return null;
}

function hasNonEmptyString(value) {
	return typeof value === "string" && value.trim().length > 0;
}

function failure(errors, warnings = []) {
	return {
		ok: false,
		project: null,
		errors,
		warnings,
		changes: { foldersMigrated: 0, sourcesCreated: 0 },
	};
}
