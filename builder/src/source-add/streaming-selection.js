import {
	addOrderedEntity,
	createOrderedSelectionState,
	orderedSelectionNotice,
	removeOrderedEntity,
	selectedOrderedEntities,
	toggleOrderedEntity,
} from "./ordered-selection-state.js";
import { eligibleStreamingProvidersForMedia } from "./streaming-catalogue.js";

export const STREAMING_SELECTION_NOTICE_THRESHOLD = 20;

function normalizeProvider(provider) {
	if (!Number.isSafeInteger(provider?.id) || provider.id <= 0 || typeof provider?.name !== "string" || !provider.name.trim() || provider.name !== provider.name.trim()) {
		throw new TypeError("A normalized Streaming provider is required.");
	}
	return Object.freeze({
		id: provider.id,
		name: provider.name,
		searchName: typeof provider.searchName === "string" ? provider.searchName : provider.name.toLowerCase(),
		logoPath: typeof provider.logoPath === "string" ? provider.logoPath : null,
		moviePriorities: Object.freeze({ ...(provider.moviePriorities ?? {}) }),
		tvPriorities: Object.freeze({ ...(provider.tvPriorities ?? {}) }),
	});
}

const validProviderId = (providerId) => Number.isSafeInteger(providerId) && providerId > 0;

export function createStreamingSelectionState() {
	return createOrderedSelectionState();
}

export function selectedStreamingProviders(state) {
	return selectedOrderedEntities(state);
}

export function addSelectedStreamingProvider(state, provider) {
	return addOrderedEntity(state, provider, normalizeProvider);
}

export function toggleSelectedStreamingProvider(state, provider) {
	return toggleOrderedEntity(state, provider, normalizeProvider, validProviderId);
}

export function removeSelectedStreamingProvider(state, providerId) {
	return removeOrderedEntity(state, providerId, validProviderId);
}

export function reconcileStreamingSelection(state, providers, regionCodes, mediaChoice) {
	const selected = selectedStreamingProviders(state);
	if (selected.length === 0) {
		return Object.freeze({ state, retainedProviders: Object.freeze([]), removedProviders: Object.freeze([]) });
	}
	const eligibleIds = new Set((regionCodes.length === 0
		? []
		: eligibleStreamingProvidersForMedia(providers, regionCodes, mediaChoice))
		.map((provider) => provider.id));
	const retainedProviders = selected.filter((provider) => eligibleIds.has(provider.id));
	const removedProviders = selected.filter((provider) => !eligibleIds.has(provider.id));
	if (removedProviders.length === 0) {
		return Object.freeze({ state, retainedProviders: Object.freeze(selected), removedProviders: Object.freeze([]) });
	}
	let nextState = createStreamingSelectionState();
	for (const provider of retainedProviders) nextState = addSelectedStreamingProvider(nextState, provider).state;
	return Object.freeze({
		state: nextState,
		retainedProviders: Object.freeze(retainedProviders),
		removedProviders: Object.freeze(removedProviders),
	});
}

export function streamingSelectionNotice(state) {
	return orderedSelectionNotice(state, STREAMING_SELECTION_NOTICE_THRESHOLD, "Streaming provider selection");
}
