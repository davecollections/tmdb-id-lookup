import {
	loadFolderArtworkSuggestions,
	planCuratedFolderShapePatch,
	resolveFolderArtworkIdentity,
} from "../folder-artwork-suggestions.js";
import { isValidVisibleNuvioTitle } from "../nuvio/titles.js";
import { buildNodeEditorPatch, validateNodeEditorDraft } from "./node-editor.js";

const shapes = new Set(["POSTER", "SQUARE", "LANDSCAPE"]);

export function collectionFolderShape(collection) {
	if (!collection?.folders?.length) return null;
	const values = collection.folders.map((folder) => {
		const value = folder.editable.tileShape;
		return typeof value === "string" && shapes.has(value.toUpperCase()) ? value.toUpperCase() : null;
	});
	return values[0] !== null && values.every((value) => value === values[0]) ? values[0] : null;
}

export function isPeopleFolderCollection(collection) {
	return collection?.nodeType === "collection" && collection.folders.length > 0
		&& collection.folders.every((folder) => resolveFolderArtworkIdentity(folder)?.authority === "people");
}

export function folderSortOptions(collection) {
	return [
		{ id: "az", label: "A–Z" },
		{ id: "za", label: "Z–A" },
		...(isPeopleFolderCollection(collection) ? [
			{ id: "first", label: "First name" },
			{ id: "last", label: "Last name" },
		] : []),
	];
}

// Deliberately mirrors V1 json-combiner's getFolderSortWords/getFolderSortText.
// That classic script also owns DOM startup; importing it would change V1's
// loading boundary. First name retains the V1 name/title comparator explicitly.
export function folderSortText(title, mode) {
	if (!isValidVisibleNuvioTitle(title)) return "";
	const text = mode === "last" ? title : title.trim().replace(/^(the|an|a)\s+/i, "");
	const words = text.replace(/[^\p{L}\p{N}\s'-]/gu, " ").trim().split(/\s+/).filter(Boolean);
	return mode === "last" && words.length > 1
		? `${words.at(-1)} ${words.slice(0, -1).join(" ")}`
		: words.join(" ");
}

export function sortedFolderIds(collection, mode) {
	if (!folderSortOptions(collection).some((option) => option.id === mode)) throw new TypeError("Unsupported folder sort");
	return collection.folders.map((folder, index) => ({ id: folder.internalId, index, key: folderSortText(folder.editable.title, mode) }))
		.sort((a, b) => {
			if (!a.key || !b.key) return (a.key ? -1 : b.key ? 1 : a.index - b.index);
			return a.key.localeCompare(b.key, undefined, { sensitivity: "base" }) * (mode === "za" ? -1 : 1) || a.index - b.index;
		}).map(({ id }) => id);
}

function staleShapeResult() {
	return { ok: false, diagnostics: [{ code: "COLLECTION_FOLDERS_CHANGED", path: "$ui.editor.folderShape", message: "This collection or project changed while settings were open. Close and reopen settings before applying." }] };
}

// The session holds immutable opening references outside the JSON editor draft.
// Selection-only notifications do not invalidate it; content changes do.
export async function applyCollectionFolderShape(controller, draft, session, requestedShape, {
	peopleManifestClient = null,
	artworkRuntimeClient = null,
	isActive = () => true,
} = {}) {
	const diagnostics = validateNodeEditorDraft(draft);
	if (diagnostics.length) return { ok: false, diagnostics };
	const currentCollection = () => controller.getState().project.collections.find((node) => node.internalId === draft.internalId);
	const current = () => isActive() && controller.getState().project === session.project && currentCollection() === session.collection;
	if (!current()) return staleShapeResult();
	if (!shapes.has(requestedShape) || session.collection.folders.length === 0) return staleShapeResult();
	const byIdentity = new Map();
	const suggestions = await Promise.all(session.collection.folders.map((folder) => {
		const identity = resolveFolderArtworkIdentity(folder);
		if (identity === null) return null;
		if (!byIdentity.has(identity.key)) {
			// Authority only: no TMDB details/catalogue enrichment or artwork requests.
			byIdentity.set(identity.key, loadFolderArtworkSuggestions({ folder, peopleManifestClient, artworkRuntimeClient }).catch(() => null));
		}
		return byIdentity.get(identity.key);
	}));
	if (!current()) return staleShapeResult();
	const collection = currentCollection();
	const updates = [{ nodeType: "collection", internalId: collection.internalId, patch: buildNodeEditorPatch(draft) }];
	collection.folders.forEach((folder, index) => {
		updates.push({ nodeType: "folder", internalId: folder.internalId, patch: planCuratedFolderShapePatch(folder.editable, requestedShape, suggestions[index]) });
	});
	const result = controller.applyPresentationUpdates(updates);
	return { ok: result.ok, diagnostics: result.ok ? [] : [{ code: "COLLECTION_SHAPE_FAILED", path: "$ui.editor.folderShape", message: "The changes could not be saved. Close and reopen settings to try again." }] };
}
