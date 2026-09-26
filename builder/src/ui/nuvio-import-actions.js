import { importCollectionSnapshot } from "./import-actions.js";

// Deliberately synchronous and network-free. Session validity is irrelevant to
// a completed local snapshot; explicit disconnect invalidates its identity.
export function importNuvioSnapshot({ connection, snapshot, ...options }) {
	if (!snapshot || snapshot.kind !== "ready" || connection.getState().snapshot !== snapshot) return { ok: false, message: "Pull Collections again before importing." };
	return importCollectionSnapshot({ ...options, snapshot });
}
