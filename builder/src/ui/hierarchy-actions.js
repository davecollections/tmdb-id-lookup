import { createNodeEditorDraft } from "./node-editor.js";
import { createQuickRenameDraft } from "./quick-rename.js";

function createTargetedDraft(controller, node, createDraft) {
	const draft = createDraft(node);
	if (!draft) {
		return null;
	}

	const selection = controller.selectNode(node.internalId);
	return selection.ok === true ? draft : null;
}

export function createTargetedNodeEditorDraft(controller, node) {
	return createTargetedDraft(controller, node, createNodeEditorDraft);
}

export function createTargetedQuickRenameDraft(controller, node) {
	return createTargetedDraft(controller, node, createQuickRenameDraft);
}
