const editableNodeTypes = new Set(["collection", "folder"]);
const editableFields = Object.freeze(["id", "title"]);

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

	const id = originalField(node, "id");
	const title = originalField(node, "title");

	return {
		internalId: node.internalId,
		nodeType: node.nodeType,
		values: {
			id: id.supported ? id.value : "",
			title: title.supported ? title.value : "",
		},
		original: {
			id: id.value,
			title: title.value,
			hasId: id.hasField,
			hasTitle: title.hasField,
			idSupported: id.supported,
			titleSupported: title.supported,
		},
		touched: {
			id: false,
			title: false,
		},
	};
}

export function updateNodeEditorField(draft, field, value) {
	if (!editableFields.includes(field) || typeof value !== "string") {
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

	if (typeof draft.values.id !== "string" || draft.values.id.trim().length === 0) {
		diagnostics.push({
			code: "EDITOR_ID_REQUIRED",
			path: "$ui.editor.id",
			message: `Enter a ${noun} ID before applying changes.`,
		});
	}
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
	const patch = {};

	for (const field of editableFields) {
		if (!draft.touched[field]) {
			continue;
		}
		const supportedKey = `${field}Supported`;
		if (draft.original[supportedKey] && draft.values[field] === draft.original[field]) {
			continue;
		}
		patch[field] = draft.values[field];
	}

	return patch;
}

export function hasNodeEditorChanges(draft) {
	return Object.keys(buildNodeEditorPatch(draft)).length > 0;
}
