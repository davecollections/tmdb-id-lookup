import {
	isInvisibleNuvioTitle,
	isValidNuvioTitle,
	isValidVisibleNuvioTitle,
	NUVIO_INVISIBLE_TITLE,
} from "../nuvio/titles.js";

const editableNodeTypes = new Set(["collection", "folder"]);
const collectionLayoutValues = new Set(["TABBED_GRID", "ROWS"]);
const folderShapeValues = new Set(["POSTER", "LANDSCAPE"]);
const collectionEditorFields = new Set([
	"title",
	"hideNuvioTitle",
	"viewMode",
	"showAllTab",
	"pinToTop",
	"focusGlowEnabled",
]);
const folderEditorFields = new Set([
	"title",
	"hideFolderTitleEverywhere",
	"tileShape",
	"showFolderTitle",
]);

function isPlainObject(value) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		return false;
	}
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

function fieldPresence(node, field) {
	const editable = isPlainObject(node.editable) ? node.editable : {};
	const currentValue = editable[field];
	const hasRawSnapshot = Object.hasOwn(node, "rawImported");
	const rawSnapshot = isPlainObject(node.rawImported) ? node.rawImported : null;
	const importedFieldExists = rawSnapshot !== null && Object.hasOwn(rawSnapshot, field);
	const hasField = hasRawSnapshot
		? importedFieldExists || (typeof currentValue === "string" && currentValue.length > 0)
		: Object.hasOwn(editable, field);

	return { currentValue, hasField };
}

function originalTextField(node, field) {
	const { currentValue, hasField } = fieldPresence(node, field);
	const supported = hasField && typeof currentValue === "string";

	return {
		value: supported ? currentValue : null,
		hasField,
		supported,
		hidden: supported && isInvisibleNuvioTitle(currentValue),
		status: supported ? "supported" : hasField ? "unsupported" : "absent",
	};
}

function originalChoiceField(node, field, supportedValues, preservedValue) {
	const { currentValue, hasField } = fieldPresence(node, field);
	const normalized = typeof currentValue === "string" ? currentValue.toUpperCase() : null;
	const supported = hasField && supportedValues.has(normalized);
	let status = supported ? "supported" : hasField ? "unsupported" : "absent";

	if (!supported && normalized === preservedValue) {
		status = "preserved";
	}

	return {
		value: supported ? currentValue : null,
		hasField,
		supported,
		status,
	};
}

function originalBooleanField(node, field) {
	const { currentValue, hasField } = fieldPresence(node, field);
	const supported = hasField && typeof currentValue === "boolean";

	return {
		value: supported ? currentValue : null,
		hasField,
		supported,
		status: supported ? "supported" : hasField ? "unsupported" : "absent",
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

	const title = originalTextField(node, "title");
	const baseDraft = {
		internalId: node.internalId,
		nodeType: node.nodeType,
		values: {
			title: title.supported && !title.hidden ? title.value : "",
		},
		original: {
			title: node.nodeType === "folder" && title.hidden
				? { ...title, value: null }
				: title,
		},
		touched: {
			title: false,
		},
	};

	if (node.nodeType === "collection") {
		const viewMode = originalChoiceField(
			node,
			"viewMode",
			collectionLayoutValues,
			"FOLLOW_LAYOUT",
		);
		const showAllTab = originalBooleanField(node, "showAllTab");
		const pinToTop = originalBooleanField(node, "pinToTop");
		const focusGlowEnabled = originalBooleanField(node, "focusGlowEnabled");

		return {
			...baseDraft,
			values: {
				...baseDraft.values,
				title: title.supported ? title.value : "",
				hideNuvioTitle: title.hidden,
				viewMode: viewMode.supported ? viewMode.value : "",
				showAllTab: showAllTab.supported ? showAllTab.value : true,
				pinToTop: pinToTop.supported ? pinToTop.value : false,
				focusGlowEnabled: focusGlowEnabled.supported ? focusGlowEnabled.value : true,
			},
			original: {
				...baseDraft.original,
				viewMode,
				showAllTab,
				pinToTop,
				focusGlowEnabled,
			},
			touched: {
				...baseDraft.touched,
				hideNuvioTitle: false,
				viewMode: false,
				showAllTab: false,
				pinToTop: false,
				focusGlowEnabled: false,
			},
			visibleTitleDraft: title.supported && !title.hidden ? title.value : null,
		};
	}

	const tileShape = originalChoiceField(
		node,
		"tileShape",
		folderShapeValues,
		"SQUARE",
	);
	const hideTitle = originalBooleanField(node, "hideTitle");

	return {
		...baseDraft,
		values: {
			...baseDraft.values,
			hideFolderTitleEverywhere: title.hidden,
			tileShape: tileShape.supported ? tileShape.value : "",
			showFolderTitle: hideTitle.supported ? !hideTitle.value : true,
		},
		original: {
			...baseDraft.original,
			tileShape,
			hideTitle,
		},
		touched: {
			...baseDraft.touched,
			hideFolderTitleEverywhere: false,
			tileShape: false,
			showFolderTitle: false,
		},
		visibleTitleDraft: title.supported && !title.hidden ? title.value : null,
		canonicalizeFolderInvisibleTitle: false,
	};
}

export function updateNodeEditorField(draft, field, value) {
	const allowedFields = draft.nodeType === "collection"
		? collectionEditorFields
		: folderEditorFields;
	const validStringField = field === "title" && typeof value === "string";
	const validChoiceField = (
		(field === "viewMode" && collectionLayoutValues.has(value))
		|| (field === "tileShape" && folderShapeValues.has(value))
	);
	const validBooleanField = (
		[
			"hideNuvioTitle",
			"hideFolderTitleEverywhere",
			"showAllTab",
			"pinToTop",
			"focusGlowEnabled",
			"showFolderTitle",
		].includes(field)
		&& typeof value === "boolean"
	);

	if (!allowedFields.has(field) || (!validStringField && !validChoiceField && !validBooleanField)) {
		return draft;
	}

	if (field === "hideNuvioTitle") {
		const visibleTitleDraft = value
			? (
				isValidVisibleNuvioTitle(draft.values.title)
					? draft.values.title
					: draft.visibleTitleDraft
			)
			: draft.visibleTitleDraft;

		return {
			...draft,
			values: {
				...draft.values,
				title: value ? NUVIO_INVISIBLE_TITLE : visibleTitleDraft ?? "",
				hideNuvioTitle: value,
			},
			touched: {
				...draft.touched,
				title: true,
				hideNuvioTitle: true,
			},
			visibleTitleDraft,
		};
	}

	if (field === "hideFolderTitleEverywhere") {
		const visibleTitleDraft = value
			? (
				isValidVisibleNuvioTitle(draft.values.title)
					? draft.values.title
					: draft.visibleTitleDraft
			)
			: draft.visibleTitleDraft;
		const canonicalizeFolderInvisibleTitle = value && (
			!draft.original.title.hidden
			|| (draft.touched.title && isValidVisibleNuvioTitle(draft.values.title))
		);

		return {
			...draft,
			values: {
				...draft.values,
				title: value ? "" : visibleTitleDraft ?? "",
				hideFolderTitleEverywhere: value,
			},
			touched: {
				...draft.touched,
				hideFolderTitleEverywhere: true,
			},
			visibleTitleDraft,
			canonicalizeFolderInvisibleTitle,
		};
	}

	if (field === "showFolderTitle" && draft.values.hideFolderTitleEverywhere) {
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
		...(field === "title" && isValidVisibleNuvioTitle(value)
			? { visibleTitleDraft: value }
			: {}),
	};
}

export function validateNodeEditorDraft(draft) {
	const noun = draft.nodeType === "folder" ? "folder" : "collection";
	const diagnostics = [];

	const titleIsValid = draft.nodeType === "collection" && draft.values.hideNuvioTitle
		? isValidNuvioTitle(draft.values.title)
		: draft.nodeType === "folder" && draft.values.hideFolderTitleEverywhere
			? true
			: isValidVisibleNuvioTitle(draft.values.title);
	if (!titleIsValid) {
		diagnostics.push({
			code: "EDITOR_TITLE_REQUIRED",
			path: "$ui.editor.title",
			message: `Enter a ${noun} title before applying changes.`,
		});
	}

	return diagnostics;
}

function supportedChoiceIsUnchanged(original, currentValue) {
	return original.supported
		&& typeof original.value === "string"
		&& original.value.toUpperCase() === currentValue;
}

function includeBooleanPatch(patch, draft, field, outputField = field, transform = (value) => value) {
	if (!draft.touched[field]) return;
	const nextValue = transform(draft.values[field]);
	const original = draft.original[outputField];
	if (original.supported && original.value === nextValue) return;
	patch[outputField] = nextValue;
}

export function buildNodeEditorPatch(draft) {
	const patch = {};

	if (draft.nodeType === "collection") {
		if (
			draft.touched.title
			&& (!draft.original.title.supported || draft.values.title !== draft.original.title.value)
		) {
			patch.title = draft.values.title;
		}
		if (
			draft.touched.viewMode
			&& !supportedChoiceIsUnchanged(draft.original.viewMode, draft.values.viewMode)
		) {
			patch.viewMode = draft.values.viewMode;
		}
		includeBooleanPatch(patch, draft, "showAllTab");
		includeBooleanPatch(patch, draft, "pinToTop");
		includeBooleanPatch(patch, draft, "focusGlowEnabled");
		return patch;
	}

	if (
		draft.values.hideFolderTitleEverywhere
		&& draft.canonicalizeFolderInvisibleTitle
	) {
		patch.title = NUVIO_INVISIBLE_TITLE;
	} else if (
		!draft.values.hideFolderTitleEverywhere
		&& draft.touched.title
		&& isValidVisibleNuvioTitle(draft.values.title)
		&& (!draft.original.title.supported || draft.values.title !== draft.original.title.value)
	) {
		patch.title = draft.values.title;
	}

	if (
		draft.touched.tileShape
		&& !supportedChoiceIsUnchanged(draft.original.tileShape, draft.values.tileShape)
	) {
		patch.tileShape = draft.values.tileShape;
	}
	if (draft.values.hideFolderTitleEverywhere && draft.canonicalizeFolderInvisibleTitle) {
		const original = draft.original.hideTitle;
		if (!original.supported || original.value !== true) {
			patch.hideTitle = true;
		}
	} else {
		includeBooleanPatch(
			patch,
			draft,
			"showFolderTitle",
			"hideTitle",
			(value) => !value,
		);
	}
	return patch;
}

export function hasNodeEditorChanges(draft) {
	return Object.keys(buildNodeEditorPatch(draft)).length > 0;
}
