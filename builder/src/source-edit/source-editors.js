import { decadeSourceEditor } from "./decade-editor.js";
import { genreSourceEditor } from "./genre-editor.js";
import { movieCollectionSourceEditor } from "./movie-collection-editor.js";
import { networkSourceEditor } from "./network-editor.js";
import { peopleSourceEditor } from "./people-editor.js";
import { studioSourceEditor } from "./studio-editor.js";
import { streamingSourceEditor } from "./streaming-editor.js";
import { tmdbListSourceEditor } from "./tmdb-list-editor.js";

import { advancedDiscoverSourceEditor } from "./advanced-discover-editor.js";

export const SOURCE_EDITORS = Object.freeze([
	movieCollectionSourceEditor,
	tmdbListSourceEditor,
	peopleSourceEditor,
	studioSourceEditor,
	networkSourceEditor,
	decadeSourceEditor,
	genreSourceEditor,
	streamingSourceEditor,
	advancedDiscoverSourceEditor,
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
