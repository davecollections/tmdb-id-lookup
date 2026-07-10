export const NATIVE_TMDB_SOURCE_TYPES = new Set([
	"LIST",
	"COLLECTION",
	"COMPANY",
	"NETWORK",
	"DISCOVER",
	"PERSON",
	"DIRECTOR",
]);

function isObject(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasText(value) {
	return typeof value === "string" && value.trim().length > 0;
}

function addonKey(source) {
	return `${source.addonId}|${source.type}|${source.catalogId}|${source.genre ?? ""}`;
}

export function validateNuvioContract(collections, { mode }) {
	const errors = [];
	const addError = (code, path) => errors.push({ code, path });

	if (!Array.isArray(collections)) {
		addError("ROOT_NOT_ARRAY", "$");
		return { valid: false, errors };
	}

	collections.forEach((collection, collectionIndex) => {
		const collectionPath = `$[${collectionIndex}]`;
		if (!isObject(collection) || !hasText(collection.id) || !hasText(collection.title)) {
			addError("COLLECTION_INVALID", collectionPath);
			return;
		}

		if (!Array.isArray(collection.folders)) {
			addError("FOLDERS_NOT_ARRAY", `${collectionPath}.folders`);
			return;
		}

		collection.folders.forEach((folder, folderIndex) => {
			const folderPath = `${collectionPath}.folders[${folderIndex}]`;
			if (!isObject(folder) || !hasText(folder.id) || !hasText(folder.title)) {
				addError("FOLDER_INVALID", folderPath);
				return;
			}

			if (!Array.isArray(folder.sources)) {
				addError("SOURCES_NOT_ARRAY", `${folderPath}.sources`);
				return;
			}

			if (!Array.isArray(folder.catalogSources)) {
				addError("CATALOG_SOURCES_NOT_ARRAY", `${folderPath}.catalogSources`);
				return;
			}

			if (mode === "import-preservation") {
				return;
			}

			const addonSources = new Set();
			folder.sources.forEach((source, sourceIndex) => {
				const sourcePath = `${folderPath}.sources[${sourceIndex}]`;
				if (!isObject(source)) {
					addError("SOURCE_INVALID", sourcePath);
					return;
				}

				if (String(source.provider).toLowerCase() === "tmdb") {
					if (!NATIVE_TMDB_SOURCE_TYPES.has(source.tmdbSourceType)) {
						addError("UNSUPPORTED_TMDB_SOURCE_TYPE", sourcePath);
					}
					return;
				}

				if (!hasText(source.addonId) || !hasText(source.type) || !hasText(source.catalogId)) {
					addError("ADDON_SOURCE_INVALID", sourcePath);
					return;
				}

				addonSources.add(addonKey(source));
			});

			folder.catalogSources.forEach((source, sourceIndex) => {
				const sourcePath = `${folderPath}.catalogSources[${sourceIndex}]`;
				if (!isObject(source)) {
					addError("CATALOG_SOURCE_INVALID", sourcePath);
					return;
				}

				if (String(source.provider).toLowerCase() === "tmdb" || hasText(source.tmdbSourceType)) {
					addError("NATIVE_SOURCE_IN_CATALOG_SOURCES", sourcePath);
					return;
				}

				if (!hasText(source.addonId) || !hasText(source.type) || !hasText(source.catalogId)) {
					addError("CATALOG_SOURCE_INVALID", sourcePath);
					return;
				}

				if (!addonSources.has(addonKey(source))) {
					addError(
						folder.sources.length === 0
							? "ADDON_SOURCE_MISSING_FROM_SOURCES"
							: "CATALOG_SOURCE_WITHOUT_ADDON_SOURCE",
						sourcePath,
					);
				}
			});
		});
	});

	return { valid: errors.length === 0, errors };
}
