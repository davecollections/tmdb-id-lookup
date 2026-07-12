import {
	buildNodeEditorPatch,
	validateNodeEditorDraft,
} from "./node-editor.js";

export function applyNodeEditorDraft(controller, draft) {
	const diagnostics = validateNodeEditorDraft(draft);
	if (diagnostics.length > 0) {
		return { ok: false, controllerCalled: false, diagnostics };
	}

	const patch = buildNodeEditorPatch(draft);
	if (Object.keys(patch).length === 0) {
		return { ok: true, controllerCalled: false, diagnostics: [] };
	}

	const result = controller.updateNode(draft.internalId, patch);
	return {
		ok: result.ok === true,
		controllerCalled: true,
		diagnostics: [],
	};
}
