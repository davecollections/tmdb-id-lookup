import {
	isValidVisibleNuvioTitle,
	NUVIO_INVISIBLE_TITLE,
} from "../nuvio/titles.js";

export const BULK_EDIT_NO_CHANGE = "NO_CHANGE";

const draftFields = Object.freeze({
	layout: new Set([BULK_EDIT_NO_CHANGE, "TABBED_GRID", "ROWS"]),
	showAllTab: new Set([BULK_EDIT_NO_CHANGE, "ON", "OFF"]),
	pinToTop: new Set([BULK_EDIT_NO_CHANGE, "ON", "OFF"]),
	collectionTitles: new Set([BULK_EDIT_NO_CHANGE, "HIDE"]),
	folderTitleVisibility: new Set([
		BULK_EDIT_NO_CHANGE,
		"SHOW_EVERYWHERE",
		"HIDE_HOME_SCREEN",
		"HIDE_EVERYWHERE",
	]),
	focusArtwork: new Set([BULK_EDIT_NO_CHANGE, "SHOW", "HIDE"]),
});

export function createBulkEditDraft() {
	return Object.fromEntries(
		Object.keys(draftFields).map((field) => [field, BULK_EDIT_NO_CHANGE]),
	);
}

export function updateBulkEditDraft(draft, field, value) {
	if (!draftFields[field]?.has(value)) return draft;
	return { ...draft, [field]: value };
}

export function hasBulkEditChanges(draft) {
	return Object.keys(draftFields).some((field) => (
		draft?.[field] !== BULK_EDIT_NO_CHANGE
	));
}

function projectCollections(project) {
	return Array.isArray(project?.collections) ? project.collections : [];
}

function projectFolders(project) {
	return projectCollections(project).flatMap((collection) => (
		Array.isArray(collection?.folders) ? collection.folders : []
	));
}

function currentTitle(node) {
	return node?.editable?.title;
}

export function bulkEditAvailability(project) {
	const collections = projectCollections(project);
	const folders = projectFolders(project);
	return {
		hasCollections: collections.length > 0,
		hasFolders: folders.length > 0,
		folderVisibleTitlesAvailable: folders.length > 0 && folders.every((folder) => (
			isValidVisibleNuvioTitle(currentTitle(folder))
		)),
	};
}

function invalidChoice(field) {
	return {
		code: "BULK_EDIT_INVALID_CHOICE",
		path: `$ui.bulkEdit.${field}`,
		message: "Choose a supported display option before applying changes.",
	};
}

function validateDraft(draft) {
	for (const [field, allowed] of Object.entries(draftFields)) {
		if (!allowed.has(draft?.[field])) return invalidChoice(field);
	}
	return null;
}

function booleanChoice(value) {
	return value === "ON" || value === "SHOW";
}

function appendUpdate(updates, nodeType, node, patch) {
	if (Object.keys(patch).length === 0) return;
	updates.push({ nodeType, internalId: node.internalId, patch });
}

export function buildBulkEditPlan(project, draft) {
	const draftError = validateDraft(draft);
	if (draftError) {
		return { ok: false, errors: [draftError], updates: [], requiresTitleConfirmation: false };
	}

	const collections = projectCollections(project);
	const folders = projectFolders(project);
	if (
		["SHOW_EVERYWHERE", "HIDE_HOME_SCREEN"].includes(draft.folderTitleVisibility)
		&& folders.some((folder) => !isValidVisibleNuvioTitle(currentTitle(folder)))
	) {
		return {
			ok: false,
			errors: [{
				code: "BULK_EDIT_FOLDER_VISIBLE_TITLE_REQUIRED",
				path: "$ui.bulkEdit.folderTitleVisibility",
				message: "Every Folder needs a visible title before this visibility option can be applied.",
			}],
			updates: [],
			requiresTitleConfirmation: false,
		};
	}

	const updates = [];
	let requiresTitleConfirmation = false;
	for (const collection of collections) {
		const patch = {};
		if (draft.layout !== BULK_EDIT_NO_CHANGE) patch.viewMode = draft.layout;
		if (draft.showAllTab !== BULK_EDIT_NO_CHANGE) {
			patch.showAllTab = booleanChoice(draft.showAllTab);
		}
		if (draft.pinToTop !== BULK_EDIT_NO_CHANGE) {
			patch.pinToTop = booleanChoice(draft.pinToTop);
		}
		if (draft.collectionTitles === "HIDE") {
			if (isValidVisibleNuvioTitle(currentTitle(collection))) {
				requiresTitleConfirmation = true;
			}
			patch.title = NUVIO_INVISIBLE_TITLE;
		}
		appendUpdate(updates, "collection", collection, patch);
	}

	for (const folder of folders) {
		const patch = {};
		if (draft.folderTitleVisibility === "SHOW_EVERYWHERE") {
			patch.hideTitle = false;
		} else if (draft.folderTitleVisibility === "HIDE_HOME_SCREEN") {
			patch.hideTitle = true;
		} else if (draft.folderTitleVisibility === "HIDE_EVERYWHERE") {
			const title = currentTitle(folder);
			if (isValidVisibleNuvioTitle(title)) {
				patch.title = NUVIO_INVISIBLE_TITLE;
				requiresTitleConfirmation = true;
			}
			// Omitting any non-visible title preserves imported invisible or opaque representations exactly.
			patch.hideTitle = true;
		}
		if (draft.focusArtwork !== BULK_EDIT_NO_CHANGE) {
			patch.focusGifEnabled = booleanChoice(draft.focusArtwork);
		}
		appendUpdate(updates, "folder", folder, patch);
	}

	return { ok: true, errors: [], updates, requiresTitleConfirmation };
}
