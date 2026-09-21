import { traverseProject } from "../domain/index.js";
import { importNuvioCollections } from "./index.js";
import { isValidVisibleNuvioTitle } from "../nuvio/titles.js";
import { collectReservedNuvioIds, repairProjectNuvioIds } from "../nuvio/nuvio-ids.js";
import { serializeNuvioSource } from "../serialize/nuvio-serialize.js";
import { validateProjectTree } from "../serialize/validation.js";
import { sourceEditorFor } from "../source-edit/source-editors.js";
import { deepFreeze, jsonValuesEqual } from "../application/state.js";

function uniqueVisibleTitles(nodes) {
	const matches = new Map();
	for (const node of nodes) {
		const title = node.editable.title;
		if (isValidVisibleNuvioTitle(title)) matches.set(title, matches.has(title) ? null : node);
	}
	return matches;
}

function sourceComparison(source) {
	const serialized = serializeNuvioSource(source);
	if (!serialized.ok) return null;
	const editor = sourceEditorFor(source);
	const key = !editor ? null : editor.duplicateKey ? editor.duplicateKey(source)
		: editor.sourceIdentity ? editor.sourceIdentity(source) : editor.identity(serialized.value);
	return { category: source.category, editor: editor?.id ?? null, key, value: serialized.value };
}

function equivalentSource(left, right) {
	if (!left || !right || left.category !== right.category || left.editor !== right.editor) return false;
	// A comparable family must agree on its own duplicate contract. Other Sources
	// can only match through complete, valid preserved output, never guessed fields.
	if (left.editor && (left.key == null || right.key == null || left.key !== right.key)) return false;
	return jsonValuesEqual(left.value, right.value);
}

// Pure, detached and ephemeral: preview and apply use this exact planner. Preview
// factories are local and reserve destination identities; controller factories
// are only consumed by apply. Existing settings/raw data are never overlaid.
export function planCollectionMerge(current, value, options = {}) {
	const currentErrors = validateProjectTree(current);
	if (currentErrors.length) return { ok: false, errors: currentErrors, warnings: [] };
	const reservedInternal = new Set();
	traverseProject(current).forEach((node) => reservedInternal.add(node.internalId));
	let nextInternal = 0;
	const idFactory = options.idFactory ?? (() => {
		let id;
		do { id = `merge-preview-${++nextInternal}`; } while (reservedInternal.has(id));
		return id;
	});
	const imported = importNuvioCollections(value, { idFactory });
	if (!imported.ok) return imported;
	const counts = { collectionsMerged: 0, foldersMerged: 0, duplicateSourcesSkipped: 0, collectionsAdded: 0, foldersAdded: 0, sourcesAdded: 0, idsRepaired: 0 };
	const inserted = new Set();
	function addSource(source) { inserted.add(source.internalId); counts.sourcesAdded += 1; return source; }
	function addFolder(folder) {
		inserted.add(folder.internalId); counts.foldersAdded += 1;
		folder.sources.forEach(addSource);
		return folder;
	}
	function addCollection(collection) {
		inserted.add(collection.internalId); counts.collectionsAdded += 1;
		collection.folders.forEach(addFolder);
		return collection;
	}
	function mergeFolder(existing, incoming) {
		counts.foldersMerged += 1;
		const sources = [...existing.sources];
		const comparisons = sources.map(sourceComparison);
		for (const source of incoming.sources) {
			const comparison = sourceComparison(source);
			if (comparisons.some((other) => equivalentSource(other, comparison))) counts.duplicateSourcesSkipped += 1;
			else { sources.push(addSource(source)); comparisons.push(comparison); }
		}
		return { ...existing, sources };
	}
	function integrate(existing, incoming, merge, add) {
		const currentTitles = uniqueVisibleTitles(existing);
		const incomingTitles = uniqueVisibleTitles(incoming);
		const result = [...existing];
		for (const node of incoming) {
			const target = currentTitles.get(node.editable.title);
			if (target && incomingTitles.get(node.editable.title) === node) result[existing.indexOf(target)] = merge(target, node);
			else result.push(add(node));
		}
		return result;
	}
	function mergeCollection(existing, incoming) {
		counts.collectionsMerged += 1;
		return { ...existing, folders: integrate(existing.folders, incoming.folders, mergeFolder, addFolder) };
	}
	try {
		const candidate = { ...current, collections: integrate(current.collections, imported.project.collections, mergeCollection, addCollection) };
		// Validate before repair as well: colliding Builder IDs must never cause an
		// existing node to be mistaken for an inserted node during ID repair.
		let errors = validateProjectTree(candidate);
		if (errors.length) return { ok: false, errors, warnings: imported.warnings };
		let nextNuvio = 0;
		const project = repairProjectNuvioIds(candidate, options.nuvioIdFactory ?? (() => `merge-preview-nuvio-${++nextNuvio}`), collectReservedNuvioIds(current), inserted);
		const originalIds = new Map();
		traverseProject(candidate).forEach((node) => { if (inserted.has(node.internalId) && node.nodeType !== "source") originalIds.set(node.internalId, node.editable.id); });
		traverseProject(project).forEach((node) => { if (originalIds.has(node.internalId) && originalIds.get(node.internalId) !== node.editable.id) counts.idsRepaired += 1; });
		errors = validateProjectTree(project);
		if (errors.length) return { ok: false, errors, warnings: imported.warnings };
		return deepFreeze({ ok: true, project, counts, errors: [], warnings: imported.warnings });
	} catch {
		return { ok: false, errors: [{ code: "MERGE_PREPARATION_FAILED", path: "$merge", message: "The complete merge could not be prepared with unique IDs. Your project is unchanged." }], warnings: imported.warnings };
	}
}
