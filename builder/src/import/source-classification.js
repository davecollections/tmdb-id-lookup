import { SOURCE_CATEGORIES } from "../domain/index.js";

export const NATIVE_TMDB_SOURCE_TYPES = Object.freeze([
	"LIST",
	"COLLECTION",
	"COMPANY",
	"NETWORK",
	"DISCOVER",
	"PERSON",
	"DIRECTOR",
]);

const nativeTmdbSourceTypes = new Set(NATIVE_TMDB_SOURCE_TYPES);
const addonIdentityFields = Object.freeze([
	"addonId",
	"type",
	"catalogId",
	"genre",
	"manifestUrl",
	"addonName",
	"showInHome",
]);

/**
 * Conservatively classifies a source from its explicit provider.
 * Original values are inspected but never normalised or changed.
 *
 * @param {{[key: string]: import("../domain/model.js").JsonValue}} source
 * @param {string} [path]
 * @returns {{category: "native-tmdb" | "addon" | "opaque", warnings: import("./nuvio-import.js").Diagnostic[]}}
 */
export function classifyNuvioSource(source, path = "$") {
	const provider = normalisedExplicitValue(source.provider);

	if (provider === "tmdb") {
		const sourceType = normalisedExplicitValue(source.tmdbSourceType)?.toUpperCase();
		if (sourceType && nativeTmdbSourceTypes.has(sourceType)) {
			return { category: SOURCE_CATEGORIES.NATIVE_TMDB, warnings: [] };
		}

		return {
			category: SOURCE_CATEGORIES.OPAQUE,
			warnings: [{
				code: "UNSUPPORTED_TMDB_SOURCE_PRESERVED",
				path,
				message: "The TMDB source type is missing or unsupported, so the complete source was preserved as opaque.",
			}],
		};
	}

	if (provider === "addon") {
		const missingFields = ["addonId", "type", "catalogId"].filter((field) => !hasNonEmptyString(source[field]));
		return {
			category: SOURCE_CATEGORIES.ADDON,
			warnings: missingFields.length === 0 ? [] : [{
				code: "INCOMPLETE_ADDON_SOURCE",
				path,
				message: `The addon source remains an editable draft; missing non-empty fields: ${missingFields.join(", ")}.`,
			}],
		};
	}

	const hasAddonLookingFields = addonIdentityFields.some((field) => Object.hasOwn(source, field));
	return {
		category: SOURCE_CATEGORIES.OPAQUE,
		warnings: hasAddonLookingFields ? [{
			code: "AMBIGUOUS_SOURCE_PRESERVED_OPAQUE",
			path,
			message: "Addon-looking fields do not establish an addon category without an explicit addon provider; the source was preserved as opaque.",
		}] : [],
	};
}

/**
 * @param {unknown} value
 */
function normalisedExplicitValue(value) {
	return typeof value === "string" ? value.toLowerCase() : undefined;
}

/**
 * @param {unknown} value
 */
function hasNonEmptyString(value) {
	return typeof value === "string" && value.trim().length > 0;
}
