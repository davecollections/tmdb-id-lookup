function nextAvailableTitle(titles, baseTitle) {
	const existingTitles = new Set(titles.filter((title) => typeof title === "string"));
	let number = 1;
	while (existingTitles.has(number === 1 ? baseTitle : `${baseTitle} ${number}`)) {
		number += 1;
	}
	return number === 1 ? baseTitle : `${baseTitle} ${number}`;
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
	const title = nextAvailableTitle(
		state.project.collections.map((collection) => collection.editable.title),
		"Untitled Collection",
	);
	const result = controller.createCollection({
		editable: {
			title,
			pinToTop: false,
			focusGlowEnabled: true,
			viewMode: "TABBED_GRID",
			showAllTab: true,
		},
	});

	return selectCreatedNode(controller, result);
}

export function createDraftFolder(controller, collectionInternalId) {
	const state = controller.getState();
	const title = nextAvailableTitle(
		state.project.collections.flatMap((collection) => (
			collection.folders.map((folder) => folder.editable.title)
		)),
		"Untitled Folder",
	);
	const result = controller.createFolder(collectionInternalId, {
		editable: {
			title,
			tileShape: "POSTER",
			hideTitle: true,
		},
	});

	return selectCreatedNode(controller, result);
}
