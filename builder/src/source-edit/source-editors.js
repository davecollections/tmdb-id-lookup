import { movieCollectionSourceEditor } from "./movie-collection-editor.js";
import { networkSourceEditor } from "./network-editor.js";
import { peopleSourceEditor } from "./people-editor.js";
import { studioSourceEditor } from "./studio-editor.js";

export const SOURCE_EDITORS = Object.freeze([
	movieCollectionSourceEditor,
	peopleSourceEditor,
	studioSourceEditor,
	networkSourceEditor,
]);

export function sourceEditorFor(source) {
	return SOURCE_EDITORS.find((editor) => editor.canEdit(source)) ?? null;
}

export function sourceEditorById(editorId) {
	return SOURCE_EDITORS.find((editor) => editor.id === editorId) ?? null;
}

export function canEditSource(source) {
	return sourceEditorFor(source) !== null;
}
