import { isPositiveSafeTmdbId } from "./tmdb-collection-input.js";
import {
	addOrderedEntity,
	createOrderedSelectionState,
	orderedSelectionNotice,
	removeOrderedEntity,
	selectedOrderedEntities,
	toggleOrderedEntity,
} from "./ordered-selection-state.js";

export const FRANCHISE_LARGE_SELECTION_NOTICE_THRESHOLD = 50;

function normalizedFranchise(franchise) {
	if (!isPositiveSafeTmdbId(franchise?.id) || typeof franchise.name !== "string" || !franchise.name.trim()) {
		throw new TypeError("A canonical TMDB collection result is required.");
	}
	return Object.freeze({ ...franchise, name: franchise.name.trim() });
}

export const createFranchiseSelectionState = createOrderedSelectionState;
export const selectedFranchises = selectedOrderedEntities;

export function franchiseSelectionNotice(state, threshold = FRANCHISE_LARGE_SELECTION_NOTICE_THRESHOLD) {
	return orderedSelectionNotice(state, threshold, "Franchise");
}

export function addSelectedFranchise(state, franchise) {
	return addOrderedEntity(state, franchise, normalizedFranchise);
}

export function removeSelectedFranchise(state, franchiseId) {
	return removeOrderedEntity(state, franchiseId, isPositiveSafeTmdbId);
}

export function toggleSelectedFranchise(state, franchise) {
	return toggleOrderedEntity(state, franchise, normalizedFranchise, isPositiveSafeTmdbId);
}
