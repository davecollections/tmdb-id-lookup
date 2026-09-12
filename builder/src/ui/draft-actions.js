import { NEW_COLLECTION_DEFAULTS, NEW_FOLDER_DEFAULTS } from "../domain/node-defaults.js";

function nextAvailableTitle(titles, baseTitle) {
	const existingTitles = new Set(titles.filter((title) => typeof title === "string"));
	let number = 1;
	while (existingTitles.has(number === 1 ? baseTitle : `${baseTitle} ${number}`)) {
		number += 1;
	}
	return number === 1 ? baseTitle : `${baseTitle} ${number}`;
}

function completeDraftCreation(controller, creationResult, selectCreated) {
	if (!creationResult.ok || !selectCreated) {
		return creationResult;
	}

	const selectionResult = controller.selectNode(creationResult.createdInternalId);
	return {
		...selectionResult,
		createdInternalId: creationResult.createdInternalId,
	};
}

export function createDraftCollection(controller, { selectCreated = true } = {}) {
	const state = controller.getState();
	const title = nextAvailableTitle(
		state.project.collections.map((collection) => collection.editable.title),
		"Untitled Collection",
	);
	const result = controller.createCollection({
		editable: {
			...NEW_COLLECTION_DEFAULTS,
			title,
		},
	});

	return completeDraftCreation(controller, result, selectCreated);
}

export function createDraftFolder(controller, collectionInternalId, { selectCreated = true } = {}) {
	const state = controller.getState();
	const title = nextAvailableTitle(
		state.project.collections.flatMap((collection) => (
			collection.folders.map((folder) => folder.editable.title)
		)),
		"Untitled Folder",
	);
	const result = controller.createFolder(collectionInternalId, {
		editable: {
			...NEW_FOLDER_DEFAULTS,
			title,
		},
	});

	return completeDraftCreation(controller, result, selectCreated);
}
