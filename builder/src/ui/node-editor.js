const editableNodeTypes = new Set(["collection", "folder"]);

function isPlainObject(value) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		return false;
	}
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

function originalField(node, field) {
	const editable = isPlainObject(node.editable) ? node.editable : {};
	const currentValue = editable[field];
	const hasRawSnapshot = Object.hasOwn(node, "rawImported");
	const rawSnapshot = isPlainObject(node.rawImported) ? node.rawImported : null;
	const importedFieldExists = rawSnapshot !== null && Object.hasOwn(rawSnapshot, field);
	const hasField = hasRawSnapshot
		? importedFieldExists || (typeof currentValue === "string" && currentValue.length > 0)
		: Object.hasOwn(editable, field);
	const supported = hasField && typeof currentValue === "string";

	return {
		value: supported ? currentValue : null,
		hasField,
		supported,
	};
}

export function createNodeEditorDraft(node) {
	if (
		!isPlainObject(node) ||
		!editableNodeTypes.has(node.nodeType) ||
		typeof node.internalId !== "string" ||
		node.internalId.length === 0
	) {
		return null;
	}

	const title = originalField(node, "title");

	return {
		internalId: node.internalId,
		nodeType: node.nodeType,
		values: {
			title: title.supported ? title.value : "",
		},
		original: {
			title: title.value,
			hasTitle: title.hasField,
			titleSupported: title.supported,
		},
		touched: {
			title: false,
		},
	};
}

export function updateNodeEditorField(draft, field, value) {
	if (field !== "title" || typeof value !== "string") {
		return draft;
	}

	return {
		...draft,
		values: {
			...draft.values,
			[field]: value,
		},
		touched: {
			...draft.touched,
			[field]: true,
		},
	};
}

export function validateNodeEditorDraft(draft) {
	const noun = draft.nodeType === "folder" ? "folder" : "collection";
	const diagnostics = [];

	if (typeof draft.values.title !== "string" || draft.values.title.trim().length === 0) {
		diagnostics.push({
			code: "EDITOR_TITLE_REQUIRED",
			path: "$ui.editor.title",
			message: `Enter a ${noun} title before applying changes.`,
		});
	}

	return diagnostics;
}

export function buildNodeEditorPatch(draft) {
	if (!draft.touched.title) return {};
	if (draft.original.titleSupported && draft.values.title === draft.original.title) return {};
	return { title: draft.values.title };
}

export function hasNodeEditorChanges(draft) {
	return Object.keys(buildNodeEditorPatch(draft)).length > 0;
}
