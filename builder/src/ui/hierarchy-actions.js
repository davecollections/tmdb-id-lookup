import { createNodeEditorDraft } from "./node-editor.js";

export function createTargetedNodeEditorDraft(controller, node) {
	const draft = createNodeEditorDraft(node);
	if (!draft) {
		return null;
	}

	const selection = controller.selectNode(node.internalId);
	return selection.ok === true ? draft : null;
}
