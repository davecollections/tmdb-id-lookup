import { cloneJsonValue, NODE_TYPES } from "./model.js";

const childRules = Object.freeze({
	[NODE_TYPES.PROJECT]: { key: "collections", childType: NODE_TYPES.COLLECTION },
	[NODE_TYPES.COLLECTION]: { key: "folders", childType: NODE_TYPES.FOLDER },
	[NODE_TYPES.FOLDER]: { key: "sources", childType: NODE_TYPES.SOURCE },
});

/**
 * Returns project nodes in stable pre-order without changing the project.
 *
 * @param {import("./model.js").ProjectNode} project
 * @returns {Array<import("./model.js").ProjectNode | import("./model.js").CollectionNode | import("./model.js").FolderNode | import("./model.js").SourceNode>}
 */
export function traverseProject(project) {
	const nodes = [];
	visit(project, (node) => nodes.push(node));
	return nodes;
}

/**
 * Returns the first matching node. Internal IDs are expected to be unique;
 * use checkInternalIdUniqueness to diagnose invalid project state.
 *
 * @param {import("./model.js").ProjectNode} project
 * @param {string} internalId
 * @returns {ReturnType<typeof traverseProject>[number] | undefined}
 */
export function findNodeByInternalId(project, internalId) {
	return traverseProject(project).find((node) => node.internalId === internalId);
}

/**
 * @param {import("./model.js").ProjectNode} project
 * @returns {{unique: boolean, duplicates: Array<{internalId: string, count: number, nodeTypes: string[]}>}}
 */
export function checkInternalIdUniqueness(project) {
	const occurrences = new Map();

	for (const node of traverseProject(project)) {
		const entry = occurrences.get(node.internalId) ?? { count: 0, nodeTypes: [] };
		entry.count += 1;
		entry.nodeTypes.push(node.nodeType);
		occurrences.set(node.internalId, entry);
	}

	const duplicates = [...occurrences.entries()]
		.filter(([, entry]) => entry.count > 1)
		.map(([internalId, entry]) => ({ internalId, ...entry }));

	return { unique: duplicates.length === 0, duplicates };
}

/**
 * Merges a JSON-compatible patch into current editable values.
 * Builder metadata, rawImported, internal identity and children are retained.
 *
 * @param {import("./model.js").ProjectNode} project
 * @param {string} internalId
 * @param {{[key: string]: import("./model.js").JsonValue}} editablePatch
 * @returns {import("./model.js").ProjectNode}
 */
export function updateEditableValues(project, internalId, editablePatch) {
	const patch = cloneJsonValue(editablePatch, "editablePatch");
	if (patch === null || Array.isArray(patch) || typeof patch !== "object") {
		throw new TypeError("editablePatch must be a plain object");
	}

	return replaceUniqueNode(project, internalId, (node) => ({
		...node,
		editable: {
			...node.editable,
			...patch,
		},
	}));
}

/**
 * Merges several known editable patches in one immutable project traversal.
 * Targets must be unique and resolve exactly once in the current project.
 *
 * @param {import("./model.js").ProjectNode} project
 * @param {Array<{internalId: string, editablePatch: {[key: string]: import("./model.js").JsonValue}}>} updates
 * @returns {import("./model.js").ProjectNode}
 */
export function updateEditableValuesMany(project, updates) {
	if (!Array.isArray(updates)) {
		throw new TypeError("updates must be an array");
	}

	const patches = new Map();
	for (const update of updates) {
		if (update === null || Array.isArray(update) || typeof update !== "object") {
			throw new TypeError("Each update must be an object");
		}
		if (typeof update.internalId !== "string" || update.internalId.length === 0) {
			throw new TypeError("Each update must identify a target internalId");
		}
		if (patches.has(update.internalId)) {
			throw new TypeError(`Duplicate update target: ${update.internalId}`);
		}

		const patch = cloneJsonValue(update.editablePatch, "editablePatch");
		if (patch === null || Array.isArray(patch) || typeof patch !== "object") {
			throw new TypeError("editablePatch must be a plain object");
		}
		patches.set(update.internalId, patch);
	}

	if (patches.size === 0) {
		return project;
	}

	const matchCounts = new Map([...patches.keys()].map((internalId) => [internalId, 0]));
	function replace(node) {
		const patch = patches.get(node.internalId);
		if (patch !== undefined) {
			matchCounts.set(node.internalId, matchCounts.get(node.internalId) + 1);
		}
		let nextNode = patch === undefined ? node : {
			...node,
			editable: {
				...node.editable,
				...patch,
			},
		};
		const rule = childRules[node.nodeType];
		if (!rule) {
			return nextNode;
		}

		let childrenChanged = false;
		const nextChildren = node[rule.key].map((child) => {
			const nextChild = replace(child);
			childrenChanged ||= nextChild !== child;
			return nextChild;
		});
		if (childrenChanged) {
			nextNode = { ...nextNode, [rule.key]: nextChildren };
		}
		return nextNode;
	}

	const nextProject = replace(project);
	for (const [internalId, count] of matchCounts) {
		if (count !== 1) {
			throw new RangeError(`Expected exactly one node for internalId: ${internalId}`);
		}
	}
	return nextProject;
}

/**
 * Inserts a detached copy of a child into the parent's ordered child array.
 *
 * @param {import("./model.js").ProjectNode} project
 * @param {string} parentInternalId
 * @param {object} child
 * @param {number} [index]
 * @returns {import("./model.js").ProjectNode}
 */
export function insertChild(project, parentInternalId, child, index) {
	return replaceUniqueNode(project, parentInternalId, (parent) => {
		const rule = childRules[parent.nodeType];
		if (!rule) {
			throw new TypeError(`${parent.nodeType} nodes cannot contain children`);
		}
		if (child?.nodeType !== rule.childType) {
			throw new TypeError(`${parent.nodeType} nodes require ${rule.childType} children`);
		}

		const children = parent[rule.key];
		const insertionIndex = index === undefined ? children.length : index;
		assertInsertionIndex(insertionIndex, children.length);

		const nextChildren = [...children];
		nextChildren.splice(insertionIndex, 0, cloneJsonValue(child, "child"));
		return { ...parent, [rule.key]: nextChildren };
	});
}

/**
 * Moves a node within its existing ordered sibling array.
 *
 * @param {import("./model.js").ProjectNode} project
 * @param {string} internalId
 * @param {number} targetIndex
 * @returns {import("./model.js").ProjectNode}
 */
export function moveNode(project, internalId, targetIndex) {
	const location = requireUniqueLocation(project, internalId);
	if (location.parent === null) {
		throw new TypeError("The project root cannot be moved");
	}

	const siblings = location.parent[location.childrenKey];
	assertExistingIndex(targetIndex, siblings.length);
	if (location.index === targetIndex) {
		return project;
	}

	return replaceUniqueNode(project, location.parent.internalId, (parent) => {
		const nextSiblings = [...parent[location.childrenKey]];
		const [moved] = nextSiblings.splice(location.index, 1);
		nextSiblings.splice(targetIndex, 0, moved);
		return { ...parent, [location.childrenKey]: nextSiblings };
	});
}

/**
 * Removes a node from its parent by builder-only identity.
 *
 * @param {import("./model.js").ProjectNode} project
 * @param {string} internalId
 * @returns {import("./model.js").ProjectNode}
 */
export function removeNode(project, internalId) {
	const location = requireUniqueLocation(project, internalId);
	if (location.parent === null) {
		throw new TypeError("The project root cannot be removed");
	}

	return replaceUniqueNode(project, location.parent.internalId, (parent) => ({
		...parent,
		[location.childrenKey]: parent[location.childrenKey].filter((child) => child.internalId !== internalId),
	}));
}

// Resolve the whole request before constructing a replacement. Surviving folders,
// including their raw imported subtrees, remain the exact same objects.
function requireCollectionFolders(project, collectionInternalId, folderInternalIds) {
	const location = requireUniqueLocation(project, collectionInternalId);
	if (location.node.nodeType !== NODE_TYPES.COLLECTION) throw new TypeError("Expected a collection");
	if (!Array.isArray(folderInternalIds)) throw new TypeError("Folder IDs must be an array");
	const requested = new Set();
	const occurrences = new Map();
	for (const node of traverseProject(project)) {
		occurrences.set(node.internalId, (occurrences.get(node.internalId) ?? 0) + 1);
	}
	const children = new Map(location.node.folders.map((folder) => [folder.internalId, folder]));
	for (let index = 0; index < folderInternalIds.length; index += 1) {
		const id = folderInternalIds[index];
		if (!Object.hasOwn(folderInternalIds, index) || typeof id !== "string" || id.length === 0 || requested.has(id)) {
			throw new TypeError("Folder IDs must be dense and unique");
		}
		if (occurrences.get(id) !== 1 || children.get(id)?.nodeType !== NODE_TYPES.FOLDER) {
			throw new RangeError("Every target must be one unambiguous direct child folder of this collection");
		}
		requested.add(id);
	}
	return { collection: location.node, requested, children };
}

export function removeFolders(project, collectionInternalId, folderInternalIds) {
	const { requested } = requireCollectionFolders(project, collectionInternalId, folderInternalIds);
	if (requested.size === 0) return project;
	return replaceUniqueNode(project, collectionInternalId, (collection) => ({
		...collection,
		folders: collection.folders.filter((folder) => !requested.has(folder.internalId)),
	}));
}

export function reorderFolders(project, collectionInternalId, orderedFolderInternalIds) {
	const { collection, children } = requireCollectionFolders(project, collectionInternalId, orderedFolderInternalIds);
	if (orderedFolderInternalIds.length !== collection.folders.length) {
		throw new RangeError("Folder order must include every direct child exactly once");
	}
	if (collection.folders.every((folder, index) => folder.internalId === orderedFolderInternalIds[index])) return project;
	return replaceUniqueNode(project, collectionInternalId, (current) => ({
		...current,
		folders: orderedFolderInternalIds.map((id) => children.get(id)),
	}));
}

/**
 * @param {object} node
 * @param {(node: object) => void} visitor
 */
function visit(node, visitor) {
	visitor(node);
	const rule = childRules[node.nodeType];
	if (!rule) {
		return;
	}

	for (const child of node[rule.key]) {
		visit(child, visitor);
	}
}

/**
 * @param {import("./model.js").ProjectNode} project
 * @param {string} internalId
 * @returns {Array<{node: object, parent: object | null, index: number, childrenKey: string | null}>}
 */
function findLocations(project, internalId) {
	const matches = [];

	function inspect(node, parent = null, index = -1, childrenKey = null) {
		if (node.internalId === internalId) {
			matches.push({ node, parent, index, childrenKey });
		}

		const rule = childRules[node.nodeType];
		if (!rule) {
			return;
		}

		node[rule.key].forEach((child, childIndex) => inspect(child, node, childIndex, rule.key));
	}

	inspect(project);
	return matches;
}

/**
 * @param {import("./model.js").ProjectNode} project
 * @param {string} internalId
 */
function requireUniqueLocation(project, internalId) {
	const locations = findLocations(project, internalId);
	if (locations.length === 0) {
		throw new RangeError(`No node found for internalId: ${internalId}`);
	}
	if (locations.length > 1) {
		throw new RangeError(`Multiple nodes found for internalId: ${internalId}`);
	}
	return locations[0];
}

/**
 * @param {import("./model.js").ProjectNode} project
 * @param {string} internalId
 * @param {(node: object) => object} replacer
 * @returns {import("./model.js").ProjectNode}
 */
function replaceUniqueNode(project, internalId, replacer) {
	requireUniqueLocation(project, internalId);

	function replace(node) {
		if (node.internalId === internalId) {
			return replacer(node);
		}

		const rule = childRules[node.nodeType];
		if (!rule) {
			return node;
		}

		let changed = false;
		const nextChildren = node[rule.key].map((child) => {
			const nextChild = replace(child);
			changed ||= nextChild !== child;
			return nextChild;
		});

		return changed ? { ...node, [rule.key]: nextChildren } : node;
	}

	return replace(project);
}

function assertInsertionIndex(index, length) {
	if (!Number.isInteger(index) || index < 0 || index > length) {
		throw new RangeError(`Insertion index must be between 0 and ${length}`);
	}
}

function assertExistingIndex(index, length) {
	if (!Number.isInteger(index) || index < 0 || index >= length) {
		throw new RangeError(`Target index must be between 0 and ${length - 1}`);
	}
}
