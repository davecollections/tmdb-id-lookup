function nextAvailableNumber(ids, prefix) {
	const existingIds = new Set(ids.filter((id) => typeof id === "string"));
	let number = 1;
	while (existingIds.has(`${prefix}-${number}`)) {
		number += 1;
	}
	return number;
}

function selectCreatedNode(controller, creationResult) {
	if (!creationResult.ok) {
		return creationResult;
	}

	const selectionResult = controller.selectNode(creationResult.createdInternalId);
	return {
		...selectionResult,
		createdInternalId: creationResult.createdInternalId,
	};
}

export function createDraftCollection(controller) {
	const state = controller.getState();
	const number = nextAvailableNumber(
		state.project.collections.map((collection) => collection.editable.id),
		"collection",
	);
	const result = controller.createCollection({
		editable: {
			id: `collection-${number}`,
			title: number === 1 ? "Untitled Collection" : `Untitled Collection ${number}`,
		},
	});

	return selectCreatedNode(controller, result);
}

export function createDraftFolder(controller, collectionInternalId) {
	const state = controller.getState();
	const number = nextAvailableNumber(
		state.project.collections.flatMap((collection) => (
			collection.folders.map((folder) => folder.editable.id)
		)),
		"folder",
	);
	const result = controller.createFolder(collectionInternalId, {
		editable: {
			id: `folder-${number}`,
			title: number === 1 ? "Untitled Folder" : `Untitled Folder ${number}`,
		},
	});

	return selectCreatedNode(controller, result);
}
