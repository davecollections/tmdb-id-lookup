import { canEditSource } from "../source-edit/source-editors.js";

// These describe preservation/editability, not damage or a repair. New/unknown
// codes stay notable until their semantics have been reviewed explicitly.
const compatibilityCodes = new Set(["UNSUPPORTED_TMDB_SOURCE_PRESERVED", "AMBIGUOUS_SOURCE_PRESERVED_OPAQUE"]);

export function countLimitedImportedSources(collections) {
	return collections.reduce((total, collection) => total + collection.folders.reduce((sum, folder) => sum + folder.sources.filter((source) => source.rawImported && !canEditSource(source)).length, 0), 0);
}

// Count actual diagnostics by outcome, never repeat raw paths/messages in UI.
// Compatibility uses actual Source eligibility to avoid double-counting Sources.
export function groupedImportNotes(warnings, limitedSourceCount = 0, idsRepaired = 0) {
	const count = (...codes) => warnings.filter((warning) => codes.includes(warning.code)).length;
	const notes = [];
	if (limitedSourceCount) notes.push(`${limitedSourceCount} ${limitedSourceCount === 1 ? "Source" : "Sources"} kept with limited editing`);
	if (idsRepaired) notes.push(`${idsRepaired} ${idsRepaired === 1 ? "ID" : "IDs"} will be repaired during import`);
	const settings = count("INVALID_FILTERS_PRESERVED", "CATALOG_SOURCES_NOT_ARRAY_PRESERVED");
	if (settings) notes.push(`${settings} imported ${settings === 1 ? "setting" : "settings"} preserved but not editable`);
	const legacy = count("LEGACY_CATALOG_SOURCES_ONLY");
	if (legacy) notes.push(`${legacy} ${legacy === 1 ? "Folder keeps" : "Folders keep"} legacy catalog data without adding active Sources`);
	const empty = count("MISSING_FOLDERS", "MISSING_SOURCES");
	if (empty) notes.push(`${empty} missing child ${empty === 1 ? "list" : "lists"} imported as empty`);
	const incomplete = count("INCOMPLETE_ADDON_SOURCE");
	if (incomplete) notes.push(`${incomplete} incomplete addon ${incomplete === 1 ? "Source needs" : "Sources need"} attention before export`);
	const known = new Set([...compatibilityCodes, "INVALID_FILTERS_PRESERVED", "CATALOG_SOURCES_NOT_ARRAY_PRESERVED", "LEGACY_CATALOG_SOURCES_ONLY", "MISSING_FOLDERS", "MISSING_SOURCES", "INCOMPLETE_ADDON_SOURCE"]);
	const other = warnings.filter((warning) => !known.has(warning.code)).length;
	if (other) notes.push(`${other} additional import ${other === 1 ? "notice" : "notices"} recorded`);
	return notes;
}
