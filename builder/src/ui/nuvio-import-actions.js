const failure = (message) => ({ ok: false, message });

// Deliberately synchronous and network-free. Session validity is irrelevant to
// a completed local snapshot; explicit disconnect invalidates its identity.
export function importNuvioSnapshot({ connection, controller, snapshot, project, mode, replaceConfirmed = false }) {
	if (!snapshot || snapshot.kind !== "ready" || connection.getState().snapshot !== snapshot) return failure("Pull Collections again before importing.");
	if (controller.getState().project !== project) return failure("Your Dingo project changed. Review the import choice again.");
	if (!["add", "merge", "replace"].includes(mode)) return failure("Choose how to import these Collections into your current project.");
	const hasWork = project.collections.length > 0 || controller.getState().dirty;
	if (mode === "replace" && hasWork && !replaceConfirmed) return failure("Confirm replacement before importing over your current work.");
	const result = mode === "add" ? controller.appendImportedCollections(snapshot.collections)
		: mode === "merge" ? controller.mergeImportedCollections(snapshot.collections)
			: controller.importValue(snapshot.collections, { projectTitle: snapshot.profile.name, ...(replaceConfirmed ? { discardChanges: true } : {}) });
	return result.ok ? { ok: true }
		: failure(result.errors[0]?.message ?? "These Collections could not be imported. Your current work is unchanged.");
}
