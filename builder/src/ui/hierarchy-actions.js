import { buildBuilderViewModel } from "./view-model.js";
import { moveSiblingNodeToPosition } from "./hierarchy-reordering.js";
import { createNodeEditorDraft } from "./node-editor.js";

export function createTargetedNodeEditorDraft(controller, node) {
	const draft = createNodeEditorDraft(node);
	if (!draft) {
		return null;
	}

	const selection = controller.selectNode(node.internalId);
	return selection.ok === true ? draft : null;
}

// Resolve current group positions at activation, never reuse a menu-open raw index.
export function moveHierarchyNodeToBoundary(controller, internalId, noun, boundary) {
	if (!["collection", "folder"].includes(noun) || !["top", "bottom"].includes(boundary)) return { ok: true, moved: false };
	const view = buildBuilderViewModel(controller.getState());
	const node = view[noun === "collection" ? "collections" : "folders"].find((item) => item.internalId === internalId);
	if (!node) return { ok: true, moved: false };
	const result = moveSiblingNodeToPosition(controller, node, boundary === "top" ? 0 : node.reorderGroupSize - 1);
	return { ...result, node, message: "Moved " + noun + " “" + node.accessibleName + "” to " + boundary + (noun === "collection" ? " of its group." : ".") };
}
