import { createCollection } from "../domain/index.js";
import { buildNodeEditorPatch, createNodeEditorDraft, validateNodeEditorDraft } from "./node-editor.js";

export function createMoveCollectionDraft() {
	// UI-only identity; real factories run only at final controller Apply.
	return createNodeEditorDraft(createCollection({ idFactory: () => "move-new-collection-draft" }));
}

export function reviewFolderMove(session, folderInternalIds, destination, draft) {
	if (destination.kind === "new") {
		const diagnostics = validateNodeEditorDraft(draft);
		if (diagnostics.length) return { ok: false, diagnostics };
	}
	const request = Object.freeze({
		openingProject: session.project,
		sourceCollectionInternalId: session.collection.internalId,
		folderInternalIds: Object.freeze([...folderInternalIds]),
		destination: Object.freeze(destination.kind === "new"
			? { kind: "new", editable: Object.freeze({ title: draft.values.title, ...buildNodeEditorPatch(draft) }) }
			: { kind: "existing", internalId: destination.internalId }),
	});
	return { ok: true, request, draftAuthority: draft };
}

export function applyReviewedFolderMove(controller, review, currentDraft, deleteEmptySource) {
	if (!review?.ok || (review.request.destination.kind === "new" && review.draftAuthority !== currentDraft)) {
		return { ok: false, errors: [{ message: "Collection settings changed. Review them again before moving." }] };
	}
	return controller.moveFolders({ ...review.request, deleteEmptySource });
}
