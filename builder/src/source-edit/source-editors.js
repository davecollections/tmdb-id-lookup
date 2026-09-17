import { decadeSourceEditor } from "./decade-editor.js";
import { genreSourceEditor } from "./genre-editor.js";
import { movieCollectionSourceEditor } from "./movie-collection-editor.js";
import { networkSourceEditor } from "./network-editor.js";
import { peopleSourceEditor } from "./people-editor.js";
import { studioSourceEditor } from "./studio-editor.js";
import { streamingSourceEditor } from "./streaming-editor.js";
import { tmdbListSourceEditor } from "./tmdb-list-editor.js";

import { advancedDiscoverSourceEditor } from "./advanced-discover-editor.js";
import { resolveEffectiveDiscoverSource } from "../nuvio/discover.js";
import { classifyCanonicalDecadePeriod } from "../source-add/decades-catalogue.js";
import { officialGenreReference } from "../source-add/genre-catalogue.js";

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
	const effective = resolveEffectiveDiscoverSource(source);
	if (effective.ok && effective.value.tmdbSourceType === "DISCOVER") {
		const { mediaType } = effective.value;
        const filters = effective.value.filters;
        if (!filters || typeof filters !== "object" || Array.isArray(filters)) return null;
		const genre = typeof filters.withGenres === "string" && /^[1-9]\d*$/.test(filters.withGenres) && officialGenreReference(mediaType, Number(filters.withGenres));
		const period = classifyCanonicalDecadePeriod(filters);
		const providers = typeof filters.withWatchProviders === "string" && /^[1-9]\d*$/.test(filters.withWatchProviders) && typeof filters.watchRegion === "string" && /^[A-Z]{2}$/.test(filters.watchRegion);
		if (providers && (genre || period)) return advancedDiscoverSourceEditor.canEdit(source) ? advancedDiscoverSourceEditor : null;
	}
	return SOURCE_EDITORS.find((editor) => editor.canEdit(source)) ?? null;
}

export function sourceEditorById(editorId) {
	return SOURCE_EDITORS.find((editor) => editor.id === editorId) ?? null;
}

export function canEditSource(source) {
	return sourceEditorFor(source) !== null;
}
