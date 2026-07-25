import {
	isInvisibleNuvioTitle,
	isValidVisibleNuvioTitle,
} from "../nuvio/titles.js";

const renameableNodeTypes = new Set(["collection", "folder"]);

function isPlainObject(value) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		return false;
	}
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

export function createQuickRenameDraft(node) {
	if (
		!isPlainObject(node)
		|| !renameableNodeTypes.has(node.nodeType)
		|| typeof node.internalId !== "string"
		|| node.internalId.length === 0
	) {
		return null;
	}

	const editable = isPlainObject(node.editable) ? node.editable : {};
	const title = editable.title;
	const supported = typeof title === "string";
	const hidden = supported && isInvisibleNuvioTitle(title);

	return {
		internalId: node.internalId,
		nodeType: node.nodeType,
		value: supported && !hidden ? title : "",
		original: {
			value: supported && !hidden ? title : null,
			supported,
			hidden,
		},
		touched: false,
	};
}

export function updateQuickRenameTitle(draft, value) {
	if (typeof value !== "string") {
		return draft;
	}

	return {
		...draft,
		value,
		touched: true,
	};
}

export function validateQuickRenameDraft(draft) {
	if (isValidVisibleNuvioTitle(draft.value)) {
		return [];
	}

	const noun = draft.nodeType === "folder" ? "folder" : "collection";
	return [{
		code: "RENAME_VISIBLE_TITLE_REQUIRED",
		path: "$ui.rename.title",
		message: `Enter a visible ${noun} title before applying the rename.`,
	}];
}

export function buildQuickRenamePatch(draft) {
	if (
		!draft.touched
		|| (
			draft.original.supported
			&& !draft.original.hidden
			&& draft.value === draft.original.value
		)
	) {
		return {};
	}

	return { title: draft.value };
}

export function applyQuickRenameDraft(controller, draft) {
	const diagnostics = validateQuickRenameDraft(draft);
	if (diagnostics.length > 0) {
		return { ok: false, controllerCalled: false, diagnostics };
	}

	const patch = buildQuickRenamePatch(draft);
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
