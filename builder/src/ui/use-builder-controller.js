import { useSyncExternalStore } from "react";

export function useBuilderControllerState(controller) {
	return useSyncExternalStore(
		controller.subscribe,
		controller.getState,
		controller.getState,
	);
}
