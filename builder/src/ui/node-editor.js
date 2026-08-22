import {
	isInvisibleNuvioTitle,
	isValidNuvioTitle,
	isValidVisibleNuvioTitle,
	NUVIO_INVISIBLE_TITLE,
} from "../nuvio/titles.js";
import { FOLDER_ARTWORK_TEXT_FIELD_NAMES } from "../nuvio/folder-artwork-fields.js";
import {
	planCuratedFolderFocusShapeTransition,
	planCuratedFolderTileShapeTransition,
} from "../folder-artwork-suggestions.js";

const editableNodeTypes = new Set(["collection", "folder"]);
const collectionLayoutValues = new Set(["TABBED_GRID", "ROWS"]);
const folderShapeValues = new Set(["POSTER", "LANDSCAPE"]);
const folderTitleVisibilityValues = new Set([
	"SHOW_EVERYWHERE",
	"HIDE_HOME_SCREEN",
	"HIDE_EVERYWHERE",
]);
const collectionEditorFields = new Set([
	"title",
	"hideNuvioTitle",
	"backdropImageUrl",
	"viewMode",
	"showAllTab",
	"pinToTop",
	"focusGlowEnabled",
]);
const folderEditorFields = new Set([
	"title",
	"folderTitleVisibility",
	"tileShape",
	...FOLDER_ARTWORK_TEXT_FIELD_NAMES,
	"focusGifEnabled",
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
		const backdropImageUrl = originalTextField(node, "backdropImageUrl");

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
				backdropImageUrl: backdropImageUrl.supported ? backdropImageUrl.value : "",
			},
			original: {
				...baseDraft.original,
				viewMode,
				showAllTab,
				pinToTop,
				focusGlowEnabled,
				backdropImageUrl,
			},
			touched: {
				...baseDraft.touched,
				hideNuvioTitle: false,
				viewMode: false,
				showAllTab: false,
				pinToTop: false,
				focusGlowEnabled: false,
				backdropImageUrl: false,
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
	const artwork = Object.fromEntries(FOLDER_ARTWORK_TEXT_FIELD_NAMES.map((field) => [field, originalTextField(node, field)]));
	const focusGifEnabled = originalBooleanField(node, "focusGifEnabled");
	const renameVisibleFolderTitleVisibility = hideTitle.supported && hideTitle.value
		? "HIDE_HOME_SCREEN"
		: "SHOW_EVERYWHERE";

	return {
		...baseDraft,
		values: {
			...baseDraft.values,
			folderTitleVisibility: title.hidden
				? "HIDE_EVERYWHERE"
				: hideTitle.supported
					? hideTitle.value
						? "HIDE_HOME_SCREEN"
						: "SHOW_EVERYWHERE"
					: "",
			tileShape: tileShape.supported ? tileShape.value : "",
			...Object.fromEntries(FOLDER_ARTWORK_TEXT_FIELD_NAMES.map((field) => [field, artwork[field].supported ? artwork[field].value : ""])),
			focusGifEnabled: focusGifEnabled.supported ? focusGifEnabled.value : false,
		},
		original: {
			...baseDraft.original,
			tileShape,
			hideTitle,
			...artwork,
			focusGifEnabled,
		},
		touched: {
			...baseDraft.touched,
			folderTitleVisibility: false,
			tileShape: false,
			...Object.fromEntries(FOLDER_ARTWORK_TEXT_FIELD_NAMES.map((field) => [field, false])),
			focusGifEnabled: false,
		},
		visibleTitleDraft: title.supported && !title.hidden ? title.value : null,
		canonicalizeFolderInvisibleTitle: false,
		renameVisibleFolderTitleVisibility,
	};
}

export function updateNodeEditorField(draft, field, value) {
	const allowedFields = draft.nodeType === "collection"
		? collectionEditorFields
		: folderEditorFields;
	const validStringField = (
		field === "title"
		|| field === "backdropImageUrl"
		|| FOLDER_ARTWORK_TEXT_FIELD_NAMES.includes(field)
	) && typeof value === "string";
	const validChoiceField = (
		(field === "viewMode" && collectionLayoutValues.has(value))
		|| (field === "tileShape" && folderShapeValues.has(value))
		|| (field === "folderTitleVisibility" && folderTitleVisibilityValues.has(value))
	);
	const validBooleanField = (
		[
			"hideNuvioTitle",
			"showAllTab",
			"pinToTop",
			"focusGlowEnabled",
			"focusGifEnabled",
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

	if (field === "folderTitleVisibility") {
		const hidingEverywhere = value === "HIDE_EVERYWHERE";
		const visibleTitleDraft = hidingEverywhere
			? (
				isValidVisibleNuvioTitle(draft.values.title)
					? draft.values.title
					: draft.visibleTitleDraft
			)
			: draft.visibleTitleDraft;
		const canonicalizeFolderInvisibleTitle = hidingEverywhere && (
			!draft.original.title.hidden
			|| (draft.touched.title && isValidVisibleNuvioTitle(draft.values.title))
		);

		return {
			...draft,
			values: {
				...draft.values,
				title: hidingEverywhere ? "" : visibleTitleDraft ?? "",
				folderTitleVisibility: value,
			},
			touched: {
				...draft.touched,
				folderTitleVisibility: true,
			},
			visibleTitleDraft,
			canonicalizeFolderInvisibleTitle,
		};
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
		: draft.nodeType === "folder" && draft.values.folderTitleVisibility === "HIDE_EVERYWHERE"
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
		if (
			draft.touched.backdropImageUrl
			&& (!draft.original.backdropImageUrl.supported || draft.values.backdropImageUrl !== draft.original.backdropImageUrl.value)
		) {
			patch.backdropImageUrl = draft.values.backdropImageUrl;
		}
		return patch;
	}

	if (
		draft.values.folderTitleVisibility === "HIDE_EVERYWHERE"
		&& draft.canonicalizeFolderInvisibleTitle
	) {
		patch.title = NUVIO_INVISIBLE_TITLE;
	} else if (
		draft.values.folderTitleVisibility !== "HIDE_EVERYWHERE"
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
	for (const field of FOLDER_ARTWORK_TEXT_FIELD_NAMES) {
		if (
			draft.touched[field]
			&& (!draft.original[field].supported || draft.values[field] !== draft.original[field].value)
		) {
			patch[field] = draft.values[field];
		}
	}
	includeBooleanPatch(patch, draft, "focusGifEnabled");
	if (
		draft.values.folderTitleVisibility === "HIDE_EVERYWHERE"
		&& draft.canonicalizeFolderInvisibleTitle
	) {
		const original = draft.original.hideTitle;
		if (!original.supported || original.value !== true) {
			patch.hideTitle = true;
		}
	} else if (
		draft.values.folderTitleVisibility !== "HIDE_EVERYWHERE"
		&& draft.touched.folderTitleVisibility
	) {
		const nextHideTitle = draft.values.folderTitleVisibility === "HIDE_HOME_SCREEN";
		const original = draft.original.hideTitle;
		if (!original.supported || original.value !== nextHideTitle) {
			patch.hideTitle = nextHideTitle;
		}
	}
	return patch;
}

export function hasNodeEditorChanges(draft) {
	return Object.keys(buildNodeEditorPatch(draft)).length > 0;
}

export function updateNodeEditorTileShape(draft, requestedShape, suggestionSet, {
	recheckCurrentShape = false,
} = {}) {
	const shapeAlreadySelected = typeof draft?.values?.tileShape === "string"
		&& draft.values.tileShape.toUpperCase() === requestedShape;
	if (
		draft?.nodeType !== "folder"
		|| !folderShapeValues.has(requestedShape)
		|| (shapeAlreadySelected && !recheckCurrentShape)
	) return draft;

	const tileTransition = planCuratedFolderTileShapeTransition({
		suggestionSet,
		currentTileUrl: draft.values.coverImageUrl,
		requestedShape,
	});
	const focusTransition = planCuratedFolderFocusShapeTransition({
		suggestionSet,
		currentFocusUrl: draft.values.focusGifUrl,
		requestedShape,
	});
	let next = shapeAlreadySelected
		? draft
		: updateNodeEditorField(draft, "tileShape", requestedShape);
	if (
		tileTransition.replacementTileUrl !== null
		&& tileTransition.replacementTileUrl !== draft.values.coverImageUrl
	) {
		next = updateNodeEditorField(next, "coverImageUrl", tileTransition.replacementTileUrl);
	}
	if (
		focusTransition.replacementFocusUrl !== null
		&& focusTransition.replacementFocusUrl !== draft.values.focusGifUrl
	) {
		next = updateNodeEditorField(next, "focusGifUrl", focusTransition.replacementFocusUrl);
	}
	return next;
}

export function folderSiblingTileShapeNotice({
	currentFolderInternalId,
	currentDraftShape,
	shapeTouched = false,
	siblingFolders = [],
} = {}) {
	if (
		!shapeTouched
		|| typeof currentFolderInternalId !== "string"
		|| !folderShapeValues.has(currentDraftShape)
		|| !Array.isArray(siblingFolders)
	) return null;

	const otherShapes = [];
	for (const folder of siblingFolders) {
		if (folder?.internalId === currentFolderInternalId) continue;
		const rawShape = folder?.editable?.tileShape;
		const shape = typeof rawShape === "string" ? rawShape.toUpperCase() : null;
		if (!folderShapeValues.has(shape)) return null;
		otherShapes.push(shape);
	}
	if (otherShapes.length === 0 || new Set(otherShapes).size !== 1) return null;

	const consensusShape = otherShapes[0];
	if (consensusShape === currentDraftShape) return null;
	const label = consensusShape === "POSTER" ? "Poster" : "Landscape";
	return `Other folders in this collection use ${label} tiles.`;
}
