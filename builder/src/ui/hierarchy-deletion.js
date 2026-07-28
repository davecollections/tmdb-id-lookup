import { buildSiblingMovements } from "./hierarchy-reordering.js";
import { buildBuilderViewModel } from "./view-model.js";

function isPlainObject(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function importedSourceEvidence(folder) {
	const raw = isPlainObject(folder.rawImported) ? folder.rawImported : null;
	const rawSources = raw && Object.hasOwn(raw, "sources") ? raw.sources : undefined;
	const rawProjections = raw && Object.hasOwn(raw, "catalogSources")
		? raw.catalogSources
		: undefined;
	const sourceEntries = Array.isArray(rawSources) ? rawSources.length : 0;
	const projectionEntries = Array.isArray(rawProjections) ? rawProjections.length : 0;
	const hasUncountedData = (
		(rawSources !== undefined && !Array.isArray(rawSources))
		|| (rawProjections !== undefined && !Array.isArray(rawProjections))
	);

	return {
		sourceEntries,
		projectionEntries,
		entryCount: sourceEntries + projectionEntries,
		hasContent: sourceEntries + projectionEntries > 0 || hasUncountedData,
		hasUncountedData,
	};
}

function describeCount(count, singular, plural = `${singular}s`) {
	return `${count} ${count === 1 ? singular : plural}`;
}

function consequenceParts({
	descendantFolderCount,
	activeSourceCount,
	importedEntryCount,
	hasUncountedImportedData,
}) {
	const parts = [];
	if (descendantFolderCount > 0) {
		parts.push(describeCount(descendantFolderCount, "folder"));
	}
	if (activeSourceCount > 0) {
		parts.push(describeCount(activeSourceCount, "source"));
	} else if (importedEntryCount > 0) {
		parts.push(describeCount(
			importedEntryCount,
			"imported source entry",
			"imported source entries",
		));
	} else if (hasUncountedImportedData) {
		parts.push("imported source data");
	}

	if (parts.length <= 1) return parts[0] ?? "";
	return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

function selectionIsInside(selection, nodeType, internalId) {
	if (nodeType === "collection") {
		return selection.collectionInternalId === internalId;
	}
	if (nodeType === "folder") {
		return selection.folderInternalId === internalId;
	}
	return selection.sourceInternalId === internalId;
}

function nearestSibling(items, index) {
	return items[index + 1] ?? items[index - 1] ?? null;
}

function locateProjectNode(project, internalId) {
	for (const collection of project.collections) {
		if (collection.internalId === internalId) {
			return {
				node: collection,
				nodeType: "collection",
				parent: project,
				collection,
				folder: null,
				siblings: project.collections,
				index: project.collections.indexOf(collection),
			};
		}
		for (const folder of collection.folders) {
			if (folder.internalId === internalId) {
				return {
					node: folder,
					nodeType: "folder",
					parent: collection,
					collection,
					folder,
					siblings: collection.folders,
					index: collection.folders.indexOf(folder),
				};
			}
			for (const source of folder.sources) {
				if (source.internalId === internalId) {
					return {
						node: source,
						nodeType: "source",
						parent: folder,
						collection,
						folder,
						siblings: folder.sources,
						index: folder.sources.indexOf(source),
					};
				}
			}
		}
	}
	return null;
}

function safeViewNode(view, location) {
	if (location.nodeType === "collection") {
		return view.collections.find((entry) => entry.internalId === location.node.internalId) ?? null;
	}
	if (location.nodeType === "folder") {
		return view.folders.find((entry) => entry.internalId === location.node.internalId) ?? null;
	}
	return view.sources.find((entry) => entry.internalId === location.node.internalId) ?? null;
}

function viewForLocation(state, location) {
	const currentView = buildBuilderViewModel(state);
	if (safeViewNode(currentView, location)) return currentView;

	const selection = location.nodeType === "collection"
		? {
			collectionInternalId: location.node.internalId,
			folderInternalId: null,
			sourceInternalId: null,
		}
		: location.nodeType === "folder"
			? {
				collectionInternalId: location.collection.internalId,
				folderInternalId: location.node.internalId,
				sourceInternalId: null,
			}
			: {
				collectionInternalId: location.collection.internalId,
				folderInternalId: location.folder.internalId,
				sourceInternalId: location.node.internalId,
			};
	return buildBuilderViewModel({ ...state, selection });
}

function recoveryFor(location, state) {
	let visibleSiblings;
	if (location.nodeType === "collection") {
		visibleSiblings = buildSiblingMovements(
			state.project.collections,
			{ groupPinnedCollections: true },
		).map((entry) => entry.node);
	} else {
		visibleSiblings = location.siblings;
	}
	const visibleIndex = visibleSiblings.findIndex((entry) => (
		entry.internalId === location.node.internalId
	));
	const sibling = nearestSibling(visibleSiblings, visibleIndex);
	let selectionInternalId = null;
	let mobileLevel;
	let fallbackAction;
	let parentInternalId = null;

	if (location.nodeType === "collection") {
		selectionInternalId = sibling?.internalId ?? null;
		mobileLevel = "collections";
		fallbackAction = "create-collection-empty";
	} else if (location.nodeType === "folder") {
		selectionInternalId = sibling?.internalId ?? location.collection.internalId;
		mobileLevel = "folders";
		parentInternalId = location.collection.internalId;
		fallbackAction = "create-folder-empty";
	} else {
		selectionInternalId = sibling?.internalId ?? location.folder.internalId;
		mobileLevel = "sources";
		parentInternalId = location.folder.internalId;
		fallbackAction = "source-parent";
	}

	return {
		selectionAffected: selectionIsInside(
			state.selection,
			location.nodeType,
			location.node.internalId,
		),
		selectionInternalId,
		mobileLevel,
		parentInternalId,
		visibleSiblingInternalIds: visibleSiblings.map((entry) => entry.internalId),
		visibleIndex,
		focus: sibling
			? {
				kind: "node",
				nodeType: location.nodeType,
				internalId: sibling.internalId,
			}
			: {
				kind: "fallback",
				nodeType: location.nodeType,
				action: fallbackAction,
				parentInternalId,
			},
	};
}

/**
 * Resolves destructive impact and deterministic UI recovery without mutating
 * project or controller state.
 */
export function buildDeletionImpact(state, internalId) {
	const location = locateProjectNode(state.project, internalId);
	if (!location) return null;

	const view = viewForLocation(state, location);
	const viewNode = safeViewNode(view, location);
	if (!viewNode) return null;

	const folders = location.nodeType === "collection"
		? location.node.folders
		: location.nodeType === "folder"
			? [location.node]
			: [];
	const descendantFolderCount = location.nodeType === "collection"
		? location.node.folders.length
		: 0;
	const activeSourceCount = folders.reduce(
		(total, folder) => total + folder.sources.length,
		0,
	);
	const imported = folders.reduce((summary, folder) => {
		const evidence = importedSourceEvidence(folder);
		return {
			sourceEntries: summary.sourceEntries + evidence.sourceEntries,
			projectionEntries: summary.projectionEntries + evidence.projectionEntries,
			entryCount: summary.entryCount + evidence.entryCount,
			hasContent: summary.hasContent || evidence.hasContent,
			hasUncountedData: summary.hasUncountedData || evidence.hasUncountedData,
		};
	}, {
		sourceEntries: 0,
		projectionEntries: 0,
		entryCount: 0,
		hasContent: false,
		hasUncountedData: false,
	});
	const confirmationRequired = location.nodeType === "collection"
		? descendantFolderCount > 0
		: location.nodeType === "folder"
			? activeSourceCount > 0 || imported.hasContent
			: true;
	const consequence = consequenceParts({
		descendantFolderCount,
		activeSourceCount,
		importedEntryCount: imported.entryCount,
		hasUncountedImportedData: imported.hasUncountedData,
	});

	return {
		internalId,
		nodeType: location.nodeType,
		displayName: viewNode.accessibleName,
		parentInternalId: location.parent.internalId,
		directChildCount: location.nodeType === "collection"
			? location.node.folders.length
			: location.nodeType === "folder"
				? location.node.sources.length
				: 0,
		descendantFolderCount,
		activeSourceCount,
		importedSourceEntryCount: imported.sourceEntries,
		importedProjectionEntryCount: imported.projectionEntries,
		importedEntryCount: imported.entryCount,
		hasImportedSourceContent: imported.hasContent,
		hasUncountedImportedSourceData: imported.hasUncountedData,
		confirmationRequired,
		confirmationTitle: `Delete “${viewNode.accessibleName}”?`,
		confirmationBody: location.nodeType === "source"
			? "This source will be permanently removed from this folder."
			: confirmationRequired
				? `This will permanently remove ${consequence}.`
				: null,
		submitLabel: `Delete ${location.nodeType}`,
		recovery: recoveryFor(location, state),
	};
}

export function createDeletionSubmissionGate() {
	let consumed = false;
	return {
		reset() {
			consumed = false;
		},
		start() {
			if (consumed) return false;
			consumed = true;
			return true;
		},
		isConsumed() {
			return consumed;
		},
	};
}

/**
 * Runs the sole project mutation, then applies optional selection-only
 * recovery through the public controller.
 */
export function executeDeletion(controller, impact, gate) {
	if (!impact || !gate?.start?.()) {
		return { ok: false, started: false, result: null };
	}

	const result = controller.removeNode(impact.internalId);
	if (!result.ok) {
		return { ok: false, started: true, result };
	}

	let selectionResult = null;
	if (impact.recovery.selectionAffected) {
		selectionResult = impact.recovery.selectionInternalId === null
			? controller.clearSelection()
			: controller.selectNode(impact.recovery.selectionInternalId);
	}

	return {
		ok: true,
		started: true,
		result,
		selectionResult,
	};
}
