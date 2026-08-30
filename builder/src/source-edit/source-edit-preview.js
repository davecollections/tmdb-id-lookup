import {
	discoverSortOptionId,
	resolveEffectiveDiscoverSource,
} from "../nuvio/discover.js";
import {
	networkSortOptionId,
	peopleSortOptionId,
	studioSortOptionId,
} from "../source-add/index.js";
import { DECADE_SOURCE_EDITOR_ID } from "./decade-editor.js";
import { GENRE_SOURCE_EDITOR_ID } from "./genre-editor.js";
import { MOVIE_COLLECTION_SOURCE_EDITOR_ID } from "./movie-collection-editor.js";
import { NETWORK_SOURCE_EDITOR_ID } from "./network-editor.js";
import { PEOPLE_SOURCE_EDITOR_ID, peopleEditCombination } from "./people-editor.js";
import { sourceEditorById } from "./source-editors.js";
import { STUDIO_SOURCE_EDITOR_ID } from "./studio-editor.js";
import { STREAMING_SOURCE_EDITOR_ID } from "./streaming-editor.js";
import { TMDB_LIST_SOURCE_EDITOR_ID } from "./tmdb-list-editor.js";
import { resolveExactSource } from "./source-edit-actions.js";

const FIX_CURRENT_FIELDS_GUIDANCE = "Fix the current source fields before previewing.";
const SUPPORTED_SORT_GUIDANCE = "Choose a supported sort to preview.";

function freezeFailure(guidance, errors = []) {
	return Object.freeze({
		previewable: false,
		guidance,
		errors: Object.freeze([...errors]),
		candidateSource: null,
		request: null,
	});
}

function cloneDetached(value) {
	if (Array.isArray(value)) return value.map(cloneDetached);
	if (value !== null && typeof value === "object") {
		return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneDetached(entry)]));
	}
	return value;
}

function detachedCandidate(source, patch) {
	const editable = cloneDetached(source.editable);
	const detachedPatch = cloneDetached(patch);
	const currentFilters = editable?.filters;
	const patchFilters = detachedPatch?.filters;
	return Object.freeze({
		...source,
		...(Object.hasOwn(source, "rawImported") ? { rawImported: cloneDetached(source.rawImported) } : {}),
		editable: Object.freeze({
			...editable,
			...detachedPatch,
			...((patchFilters || currentFilters) ? {
				filters: Object.freeze({ ...(patchFilters ?? currentFilters) }),
			} : {}),
		}),
	});
}

function discoverDraft(candidateSource) {
	const effective = resolveEffectiveDiscoverSource(candidateSource);
	return effective.ok
		? Object.freeze({ category: candidateSource.category, editable: effective.value })
		: null;
}

function ready(candidateSource, request) {
	return Object.freeze({
		previewable: true,
		guidance: null,
		errors: Object.freeze([]),
		candidateSource,
		request: Object.freeze(request),
	});
}

/**
 * Materializes a detached preview candidate from the editor's opening project.
 * This is intentionally separate from save, duplicate and controller mutation paths.
 */
export function prepareSourceEditPreview(session, draft) {
	const exact = resolveExactSource(session?.openingProject, session ?? {});
	const adapter = sourceEditorById(session?.adapterId);
	if (exact.source === null || adapter === null) {
		return freezeFailure("This source is no longer available to preview.");
	}
	const validation = adapter.validateDraft({ draft, source: exact.source, session });
	if (!validation.ok) return freezeFailure(FIX_CURRENT_FIELDS_GUIDANCE, validation.errors);
	const patch = adapter.buildPatch({ source: exact.source, draft, session });
	const candidateSource = detachedCandidate(exact.source, patch);

	switch (session.adapterId) {
		case TMDB_LIST_SOURCE_EDITOR_ID:
			return ready(candidateSource, {
				kind: "list",
				tmdbId: candidateSource.editable.tmdbId,
				mediaType: "MOVIE",
				label: draft.title,
			});
		case MOVIE_COLLECTION_SOURCE_EDITOR_ID:
			return ready(candidateSource, {
				kind: "collection",
				tmdbId: draft.tmdbId,
				mediaType: "MOVIE",
				label: draft.title,
			});
		case PEOPLE_SOURCE_EDITOR_ID: {
			const combination = peopleEditCombination(
				candidateSource.editable.tmdbSourceType,
				candidateSource.editable.mediaType,
			);
			const sortOptionId = peopleSortOptionId(
				candidateSource.editable.sortBy,
				candidateSource.editable.mediaType,
			);
			if (combination === null || sortOptionId === null) return freezeFailure(SUPPORTED_SORT_GUIDANCE);
			return ready(candidateSource, {
				kind: "people",
				tmdbId: candidateSource.editable.tmdbId,
				mediaType: candidateSource.editable.mediaType,
				combinationId: combination.id,
				sortOptionId,
				label: draft.title,
			});
		}
		case STUDIO_SOURCE_EDITOR_ID: {
			const sortOptionId = studioSortOptionId(
				candidateSource.editable.sortBy,
				candidateSource.editable.mediaType,
			);
			if (sortOptionId === null) return freezeFailure(SUPPORTED_SORT_GUIDANCE);
			return ready(candidateSource, {
				kind: "studio",
				tmdbId: candidateSource.editable.tmdbId,
				mediaType: candidateSource.editable.mediaType,
				sortBy: candidateSource.editable.sortBy,
				label: draft.title,
			});
		}
		case NETWORK_SOURCE_EDITOR_ID:
			if (networkSortOptionId(candidateSource.editable.sortBy) === null) return freezeFailure(SUPPORTED_SORT_GUIDANCE);
			return ready(candidateSource, {
				kind: "network",
				tmdbId: candidateSource.editable.tmdbId,
				mediaType: "TV",
				sortBy: candidateSource.editable.sortBy,
				label: draft.title,
			});
		case STREAMING_SOURCE_EDITOR_ID:
			if (discoverSortOptionId(candidateSource.editable.sortBy, draft.mediaType) === null) return freezeFailure(SUPPORTED_SORT_GUIDANCE);
			return ready(candidateSource, {
				kind: "streaming",
				sourceNode: candidateSource,
				mediaType: draft.mediaType,
				label: draft.title,
			});
		case GENRE_SOURCE_EDITOR_ID:
		case DECADE_SOURCE_EDITOR_ID: {
			const sourceDraft = discoverDraft(candidateSource);
			if (sourceDraft === null) return freezeFailure(FIX_CURRENT_FIELDS_GUIDANCE);
			return ready(candidateSource, {
				kind: session.adapterId,
				sourceDraft,
				mediaType: sourceDraft.editable.mediaType,
				label: draft.title,
			});
		}
		default:
			return freezeFailure("This source type cannot be previewed.");
	}
}
