import { useSyncExternalStore } from "react";

const empty = Object.freeze({ phase: "IDLE", busy: false, dispatch: { count: 0 }, unresolved: false });
const getEmpty = () => empty;
const subscribeEmpty = () => () => {};

export function useNuvioSendState(coordinator) {
	return useSyncExternalStore(coordinator?.subscribe ?? subscribeEmpty, coordinator?.getState ?? getEmpty, coordinator?.getState ?? getEmpty);
}
