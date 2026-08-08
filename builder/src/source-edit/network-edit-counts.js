import { canonicalPositiveId } from "./source-edit-utils.js";

export const INITIAL_NETWORK_EDIT_COUNT_STATE = Object.freeze({ status: "not-checked", count: null, error: null });

export function checkingNetworkEditCount() {
	return Object.freeze({ status: "checking", count: null, error: null });
}

export function unavailableNetworkEditCount() {
	return Object.freeze({ status: "unavailable", count: null, error: Object.freeze({ message: "Count unavailable", retryable: true }) });
}

export function createNetworkEditCountSession({ provider, networkId }) {
	const canonicalNetworkId = canonicalPositiveId(networkId);
	if (canonicalNetworkId === null || typeof provider?.getNetworkCount !== "function") {
		throw new TypeError("Network edit counts require a positive Network ID and count provider.");
	}
	let controller = null;

	async function load() {
		controller?.abort();
		controller = new AbortController();
		const activeController = controller;
		const result = await provider.getNetworkCount(canonicalNetworkId, { signal: activeController.signal });
		if (activeController.signal.aborted) return null;
		return result?.ok ? result.data : unavailableNetworkEditCount();
	}

	function cancel() {
		controller?.abort();
		controller = null;
	}

	return Object.freeze({ networkId: canonicalNetworkId, load, cancel });
}
