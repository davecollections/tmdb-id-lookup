import {
	createOrderedSelectionState,
	orderedSelectionNotice,
	removeOrderedEntity,
	selectedOrderedEntities,
	toggleOrderedEntity,
} from "./ordered-selection-state.js";

export const STUDIO_LARGE_SELECTION_NOTICE_THRESHOLD = 50;

function isStudioId(value) {
	return Number.isSafeInteger(value) && value > 0;
}

function normalizedText(value) {
	return typeof value === "string" ? value.trim() : "";
}

function normalizeStudio(studio) {
	const name = normalizedText(studio?.name);
	if (!isStudioId(studio?.id) || !name || studio.name !== name) {
		throw new TypeError("Studio selection requires a canonical cached Studio identity.");
	}
	return Object.freeze({ ...studio, name });
}

export function createStudioSelectionState() {
	return createOrderedSelectionState();
}

export function selectedStudios(state) {
	return selectedOrderedEntities(state);
}

export function studioSelectionNotice(state) {
	return orderedSelectionNotice(state, STUDIO_LARGE_SELECTION_NOTICE_THRESHOLD, "Studio selection");
}

export function removeSelectedStudio(state, studioId) {
	return removeOrderedEntity(state, studioId, isStudioId);
}

export function toggleSelectedStudio(state, studio) {
	return toggleOrderedEntity(state, studio, normalizeStudio, isStudioId);
}
