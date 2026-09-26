import { isValidVisibleNuvioTitle } from "../nuvio/titles.js";
import { nodeTitle, sourceTitle } from "./node-titles.js";
import { buildSiblingMovements } from "./hierarchy-reordering.js";

export const PROJECT_FIND_LIMIT = 100;

// Pre-order follows the cards: pinned Collections first, then saved child order.
// Only display titles enter searchable text; paths are context, never query input.
export function buildProjectFindIndex(project) {
	const entries = [];
	const groups = new Map();
	let projectOrder = 0;
	function add(node, title, displayPath, collectionInternalId = null, folderInternalId = null) {
		const order = projectOrder++;
		if (title.hidden || !isValidVisibleNuvioTitle(title.text)) return;
		if (node.nodeType !== "source" && !isValidVisibleNuvioTitle(node.editable.title)) return;
		const entry = {
			internalId: node.internalId, nodeType: node.nodeType,
			collectionInternalId, folderInternalId, displayTitle: title.text, displayPath,
			projectOrder: order, comparisonTitle: title.text.toLowerCase(),
			position: 1, positions: 1,
		};
		entries.push(entry);
		const key = JSON.stringify([entry.displayTitle, entry.nodeType, displayPath]);
		const group = groups.get(key) ?? [];
		group.push(entry);
		groups.set(key, group);
	}
	for (const { node: collection } of buildSiblingMovements(project.collections, { groupPinnedCollections: true })) {
		const collectionTitle = nodeTitle(collection.editable.title, "collection");
		add(collection, collectionTitle, "");
		for (const folder of collection.folders) {
			const folderTitle = nodeTitle(folder.editable.title, "folder");
			add(folder, folderTitle, collectionTitle.text, collection.internalId);
			for (const source of folder.sources) {
				add(source, sourceTitle(source), collectionTitle.text + " / " + folderTitle.text, collection.internalId, folder.internalId);
			}
		}
	}
	for (const group of groups.values()) group.forEach((entry, index) => {
		entry.position = index + 1;
		entry.positions = group.length;
	});
	return entries;
}

export function searchProjectFindIndex(index, query) {
	const trimmed = query.trim();
	if ([...trimmed].length < 2) return { results: [], total: 0, ready: false };
	const comparison = trimmed.toLowerCase();
	const tiers = [[], [], []];
	let total = 0;
	for (const entry of index) {
		if (!entry.comparisonTitle.includes(comparison)) continue;
		total += 1;
		const tier = entry.comparisonTitle === comparison ? 0 : entry.comparisonTitle.startsWith(comparison) ? 1 : 2;
		if (tiers[tier].length < PROJECT_FIND_LIMIT) tiers[tier].push(entry);
	}
	return { results: tiers.flat().slice(0, PROJECT_FIND_LIMIT), total, ready: true };
}
