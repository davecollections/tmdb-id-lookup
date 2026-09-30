import { folderSortOptions, sortedFolderIds } from "./collection-folder-management.js";
import { sortedTitleIds } from "./title-sorting.js";

const titleOptions = Object.freeze([{ id: "az", label: "A–Z" }, { id: "za", label: "Z–A" }]);
const levels = new Set(["collections", "folders", "sources"]);

function sortTarget(project, level, parentInternalId) {
	if (level === "collections") return project;
	if (level === "folders") return project.collections.find((node) => node.internalId === parentInternalId) ?? null;
	if (level === "sources") return project.collections.flatMap((node) => node.folders).find((node) => node.internalId === parentInternalId) ?? null;
	return null;
}

export function hierarchySortAvailable(project, level, parentInternalId = null) {
	const target = sortTarget(project, level, parentInternalId);
	if (!target) return false;
	if (level !== "collections") return target[level].length >= 2;
	const pinned = project.collections.filter((node) => node.editable.pinToTop === true).length;
	return pinned >= 2 || project.collections.length - pinned >= 2;
}

export function sortedCollectionIds(project, mode) {
	const groups = [false, true].map((pinned) => sortedTitleIds(project.collections.filter((node) => (node.editable.pinToTop === true) === pinned), mode));
	const offsets = [0, 0];
	return project.collections.map((node) => {
		const group = node.editable.pinToTop === true ? 1 : 0;
		return groups[group][offsets[group]++];
	});
}

export function sortedSourceIds(folder, mode) { return sortedTitleIds(folder.sources, mode); }

export function createHierarchySortSession(project, level, parentInternalId = null) {
	if (!levels.has(level) || !hierarchySortAvailable(project, level, parentInternalId)) return null;
	const target = sortTarget(project, level, parentInternalId);
	return { project, level, parentInternalId, target, options: level === "folders" ? folderSortOptions(target) : titleOptions };
}

export function applyHierarchySort(controller, session, mode) {
	const current = controller.getState().project;
	if (!session || current !== session.project || sortTarget(current, session.level, session.parentInternalId) !== session.target) {
		return { ok: false, error: "This project changed. Close and reopen Sort before applying." };
	}
	if (!session.options.some((option) => option.id === mode)) return { ok: false, error: "Choose an available sort order." };
	const result = session.level === "collections"
		? controller.reorderCollections(sortedCollectionIds(current, mode))
		: session.level === "folders" ? controller.reorderFolders(session.parentInternalId, sortedFolderIds(session.target, mode))
			: controller.reorderSources(session.parentInternalId, sortedSourceIds(session.target, mode));
	return result.ok ? { ok: true, changed: controller.getState().project !== current }
		: { ok: false, error: "The list could not be sorted. Close and reopen Sort to try again." };
}
