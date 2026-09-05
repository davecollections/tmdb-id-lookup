import { canEditSource } from "../source-edit/index.js";

export const EXPORT_SUCCESS_TIMEOUT_MS = 4000;

export function hasExportableStructure(project) {
	return project.collections.some((collection) => collection.folders.some((folder) => folder.sources.length > 0));
}

// Both domain Collections and prepared Nuvio Collections have these child arrays.
// Addon compatibility projections are not additional Sources.
export function collectionExportCounts(collections) {
	return collections.reduce((counts, collection) => ({
		collections: counts.collections + 1,
		folders: counts.folders + collection.folders.length,
		sources: counts.sources + collection.folders.reduce((total, folder) => total + folder.sources.length, 0),
	}), { collections: 0, folders: 0, sources: 0 });
}

export function collectionExportFilename(date = new Date()) {
	if (!(date instanceof Date) || !Number.isFinite(date.getTime())) throw new TypeError("A valid local date is required.");
	const year = String(date.getFullYear()).padStart(4, "0");
	if (!/^\d{4}$/.test(year)) throw new RangeError("The export year must have four digits.");
	return `dingo-nuvio-collections-${year}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}.json`;
}

export function exportDiagnosticNodes(project, diagnostic) {
	const match = /^\$\[(\d+)\](?:\.folders\[(\d+)\])?(?:\.sources\[(\d+)\])?(?=\.|$)/.exec(diagnostic.path ?? "");
	if (!match) return [];
	const collection = project.collections[Number(match[1])];
	const folder = match[2] === undefined ? null : collection?.folders[Number(match[2])];
	const source = match[3] === undefined ? null : folder?.sources[Number(match[3])];
	if ((match[2] !== undefined && !folder) || (match[3] !== undefined && !source)) return [];
	return [collection, folder, source].filter(Boolean);
}

export function exportDiagnosticTarget(project, diagnostic) {
	const node = exportDiagnosticNodes(project, diagnostic).at(-1);
	return node && (node.nodeType !== "source" || canEditSource(node)) ? node : null;
}

export function exportDiagnosticMessage(diagnostic) {
	return ({
		COLLECTION_TITLE_REQUIRED: "Give this Collection a title before exporting.",
		FOLDER_TITLE_REQUIRED: "Give this Folder a title before exporting.",
		INVALID_NATIVE_FILTERS: "This imported Source has filters in a format that cannot be exported safely.",
		INVALID_EDITABLE_FILTERS: "This Source has filters in a format that cannot be exported safely.",
		INCOMPLETE_ADDON_SOURCE: "This addon Source is missing information needed to export it safely.",
		RAW_CATALOG_SOURCES_NOT_ARRAY: "This Folder has imported addon entries in a format that cannot be exported safely.",
		RAW_CATALOG_SOURCE_NOT_OBJECT: "This Folder contains an imported addon entry that cannot be exported safely.",
		LEGACY_CATALOG_SOURCES_ONLY_UNRESOLVED: "This import has older addon entries that cannot yet be exported safely. Keep your original file; these entries have not been migrated or discarded.",
	})[diagnostic.code] ?? diagnostic.message;
}

// Export currently emits two warning codes. Import-only classification warnings
// are deliberately not merged here: export describes the current prepared result.
export function groupExportWarnings(project, warnings) {
	const groups = new Map();
	for (const warning of warnings) {
		const code = warning.code ?? "unknown";
		if (!groups.has(code)) groups.set(code, { code, warnings: [], sources: new Set(), locations: new Map(), unresolved: 0 });
		const group = groups.get(code);
		group.warnings.push(warning);
		const nodes = exportDiagnosticNodes(project, warning);
		const source = nodes.at(-1)?.nodeType === "source" ? nodes.at(-1) : null;
		if (source) group.sources.add(source.internalId);
		if (!nodes.length) { group.unresolved++; continue; }
		const parents = source ? nodes.slice(0, -1) : nodes;
		const key = parents.map((node) => node.internalId).join("/");
		if (!group.locations.has(key)) group.locations.set(key, { key, nodes: parents, items: new Map() });
		const location = group.locations.get(key);
		if (source) location.items.set(source.internalId, { key: source.internalId, source });
		else {
			const entry = /\.catalogSources\[(\d+)\](?=\.|$)/.exec(warning.path ?? "");
			if (entry) location.items.set(warning.path, { key: warning.path, text: `Saved addon details ${Number(entry[1]) + 1}` });
		}
	}
	return [...groups.values()].map((group) => {
		const allSources = group.warnings.every((warning) => exportDiagnosticNodes(project, warning).at(-1)?.nodeType === "source");
		// A compatibility entry is never presented as an affected physical Source.
		const sourceCount = allSources && group.code !== "UNMATCHED_CATALOG_SOURCE_REMOVED" ? group.sources.size : null;
		const singular = sourceCount === 1 || (sourceCount === null && group.warnings.length === 1);
		let reason; let consequence;
		switch (group.code) {
			case "OPAQUE_SOURCE_PRESERVED":
				reason = singular ? "This Source can’t be edited in the Builder" : "Some Sources can’t be edited in the Builder";
				consequence = singular
					? "It will still be included unchanged in the exported file."
					: "They will still be included unchanged in the exported file.";
				break;
			case "UNMATCHED_CATALOG_SOURCE_REMOVED":
				reason = "Some saved addon details are no longer used";
				consequence = "These unused details won’t be exported. Your current Sources are unaffected.";
				break;
			default:
				reason = "Some information will be preserved unchanged";
				consequence = "Dingo does not fully recognise this information, so it will be kept unchanged in the exported file.";
		}
		return {
			code: group.code, warnings: group.warnings, sourceCount, reason, consequence,
			countLabel: sourceCount === null ? `${group.warnings.length} ${group.warnings.length === 1 ? "warning" : "warnings"}` : `${sourceCount} affected ${singular ? "Source" : "Sources"}`,
			locations: [...group.locations.values()].map((location) => ({ ...location, items: [...location.items.values()] })),
			unresolved: group.unresolved,
		};
	});
}

// Keep one prepared result per authoritative project, independent of diagnostic
// revisions. Preparation is local and happens outside React rendering.
export function createCollectionExportPayload(controller) {
	let project = null;
	let payload = null;
	return () => {
		const current = controller.getState().project;
		if (project !== current) {
			const result = controller.stringifyProject({ space: 2 });
			project = current;
			// Retain the serializer's prepared Collections alongside its exact bytes.
			// Future delivery can reuse these data without assuming an account API envelope.
			payload = {
				ok: result.ok, collections: result.value, json: result.json,
				errors: result.errors, warnings: result.warnings, project,
				counts: collectionExportCounts(result.ok ? result.value : project.collections),
			};
		}
		return payload;
	};
}

export async function copyCollectionsJson(payload, clipboard = globalThis.navigator?.clipboard) {
	if (!payload?.ok || typeof payload.json !== "string") return false;
	try {
		if (typeof clipboard?.writeText !== "function") return false;
		await clipboard.writeText(payload.json);
		return true;
	} catch { return false; }
}

export function downloadCollectionsJson(payload, { filename = collectionExportFilename(), document = globalThis.document, url = globalThis.URL } = {}) {
	if (!payload?.ok || typeof payload.json !== "string") return false;
	const objectUrl = url.createObjectURL(new Blob([payload.json], { type: "application/json;charset=utf-8" }));
	const link = document.createElement("a");
	link.href = objectUrl;
	link.download = filename;
	link.hidden = true;
	try { document.body.append(link); link.click(); } finally { link.remove(); setTimeout(() => url.revokeObjectURL(objectUrl), 0); }
	return true;
}
