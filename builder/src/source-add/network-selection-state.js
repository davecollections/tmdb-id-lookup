import {
	addOrderedEntity,
	createOrderedSelectionState,
	orderedSelectionNotice,
	removeOrderedEntity,
	selectedOrderedEntities,
	toggleOrderedEntity,
} from "./ordered-selection-state.js";

export const NETWORK_LARGE_SELECTION_NOTICE_THRESHOLD = 50;

function isNetworkId(value) {
	return Number.isSafeInteger(value) && value > 0;
}

function normalizedNetwork(network) {
	const name = typeof network?.name === "string" ? network.name.trim() : "";
	const seriesCount = network?.seriesCount;
	if (
		!isNetworkId(network?.id)
		|| !name
		|| network.name !== name
		|| !(seriesCount === null || (Number.isSafeInteger(seriesCount) && seriesCount >= 0))
	) {
		throw new TypeError("Network selection requires a canonical cached Network identity and nullable Series Count.");
	}
	return Object.freeze({ ...network, name, seriesCount });
}

export function createNetworkSelectionState() {
	return createOrderedSelectionState();
}

export function selectedNetworks(state) {
	return selectedOrderedEntities(state);
}

export function networkSelectionNotice(state) {
	return orderedSelectionNotice(state, NETWORK_LARGE_SELECTION_NOTICE_THRESHOLD, "Network selection");
}

export function addSelectedNetwork(state, network) {
	return addOrderedEntity(state, network, normalizedNetwork);
}

export function removeSelectedNetwork(state, networkId) {
	return removeOrderedEntity(state, networkId, isNetworkId);
}

export function toggleSelectedNetwork(state, network) {
	return toggleOrderedEntity(state, network, normalizedNetwork, isNetworkId);
}
