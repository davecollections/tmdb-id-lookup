import { PEOPLE_SOURCE_COMBINATIONS } from "../source-add/index.js";
import { isInvisibleNuvioTitle, isValidVisibleNuvioTitle } from "../nuvio/titles.js";
import { sourceEditorById, sourceEditorFor } from "./source-editors.js";
import { PEOPLE_SOURCE_SORT_OPTIONS } from "./people-editor.js";
import {
	canonicalPositiveId,
	diagnostic,
	safeSourceEditTitle,
} from "./source-edit-utils.js";

function resolveExactSource(project, binding) {
	const collection = project?.collections?.find((entry) => (
		entry.internalId === binding.collectionInternalId
	)) ?? null;
	const folder = collection?.folders?.find((entry) => (
		entry.internalId === binding.folderInternalId
	)) ?? null;
	const sourceIndex = folder?.sources?.findIndex((entry) => (
		entry.internalId === binding.sourceInternalId
	)) ?? -1;
	const source = sourceIndex >= 0 ? folder.sources[sourceIndex] : null;
	return { collection, folder, source, sourceIndex };
}

function findSourceAnywhere(project, sourceInternalId) {
	for (const collection of project?.collections ?? []) {
		for (const folder of collection.folders ?? []) {
			const sourceIndex = folder.sources?.findIndex((source) => source.internalId === sourceInternalId) ?? -1;
			if (sourceIndex >= 0) return { collection, folder, source: folder.sources[sourceIndex], sourceIndex };
		}
	}
	return null;
}

function safeFolderTitle(folder) {
	const title = folder?.editable?.title;
	if (isInvisibleNuvioTitle(title)) return "Hidden-title folder";
	return isValidVisibleNuvioTitle(title) ? title.trim() : "Untitled folder";
}

function failure(code, path, message, extras = {}) {
	return {
		ok: false,
		errors: [diagnostic(code, path, message)],
		warnings: [],
		...extras,
	};
}

function sourceIdentity(adapter, source) {
	return typeof adapter.sourceIdentity === "function"
		? adapter.sourceIdentity(source)
		: adapter.identity(source?.editable);
}

export function createSourceEditSession(project, sourceInternalId) {
	const anywhere = findSourceAnywhere(project, sourceInternalId);
	if (anywhere === null) {
		return failure(
			"SOURCE_EDIT_TARGET_UNAVAILABLE",
			"$sourceEdit.source",
			"This source is no longer available.",
		);
	}
	const adapter = sourceEditorFor(anywhere.source);
	if (adapter === null) {
		return failure(
			"SOURCE_EDIT_UNSUPPORTED",
			"$sourceEdit.source",
			"This source does not have a supported editor.",
		);
	}
	const originalIdentity = sourceIdentity(adapter, anywhere.source);
	const session = Object.freeze({
		openingProject: project,
		collectionInternalId: anywhere.collection.internalId,
		folderInternalId: anywhere.folder.internalId,
		sourceInternalId: anywhere.source.internalId,
		sourceIndex: anywhere.sourceIndex,
		sourceCategory: anywhere.source.category,
		adapterId: adapter.id,
		originalIdentity,
		folderTitle: safeFolderTitle(anywhere.folder),
		openingTitle: safeSourceEditTitle(
			anywhere.source.editable.title,
			adapter.label,
		),
	});
	return {
		ok: true,
		session,
		draft: adapter.readInitialState(anywhere.source),
		errors: [],
		warnings: [],
	};
}

export function updateSourceEditTitle(draft, title) {
	return Object.freeze({
		...draft,
		title,
		titleTouched: true,
		...(Object.hasOwn(draft ?? {}, "titleMode") ? { titleMode: "custom" } : {}),
	});
}

export function choosePeopleSourceCombination(draft, combinationId) {
	const combination = PEOPLE_SOURCE_COMBINATIONS.find((entry) => entry.id === combinationId);
	const autoManaged = draft?.titleMode === "auto" && combination;
	const selectedSort = draft?.sortTouched
		? PEOPLE_SOURCE_SORT_OPTIONS.find((entry) => entry.id === draft.sortOptionId)
		: null;
	return Object.freeze({
		...draft,
		combinationId,
		combinationTouched: true,
		...(autoManaged ? {
			title: combination.sourceTitle,
			titleTouched: true,
		} : {}),
		...(selectedSort && combination ? { sortBy: selectedSort.values[combination.mediaType] } : {}),
	});
}

export function usePeopleDefaultTitle(draft) {
	const combination = PEOPLE_SOURCE_COMBINATIONS.find((entry) => entry.id === draft?.combinationId);
	return combination ? Object.freeze({
		...draft,
		title: combination.sourceTitle,
		titleTouched: true,
		titleMode: "auto",
	}) : draft;
}

export function updatePeopleSourceSort(draft, sortBy, sortOptionId = null) {
	return Object.freeze({ ...draft, sortBy, sortOptionId, sortTouched: true });
}

export function updateNetworkSourceSort(draft, sortBy, sortOptionId = null) {
	return Object.freeze({ ...draft, sortBy, sortOptionId, sortTouched: true });
}

export function updateStudioSourceSort(draft, sortBy, sortOptionId = null) {
	return Object.freeze({ ...draft, sortBy, sortOptionId, sortTouched: true });
}

export function updateStreamingSourceSort(draft, sortBy, sortOptionId = null) {
	return Object.freeze({ ...draft, sortBy, sortOptionId, sortTouched: true });
}

export function updateDecadeSourceSort(draft, sortBy, sortOptionId = null) {
	return Object.freeze({ ...draft, sortBy, sortOptionId, sortTouched: true });
}

export function updateDecadeSourceAdvanced(draft, advanced) {
	return Object.freeze({ ...draft, advanced, advancedTouched: true });
}

export function updateGenreSourceSort(draft, sortBy, sortOptionId = null) {
	return Object.freeze({ ...draft, sortBy, sortOptionId, sortTouched: true });
}

export function updateGenreSourceAdvanced(draft, advanced) {
	return Object.freeze({ ...draft, advanced, advancedTouched: true });
}

export function chooseMovieCollection(draft, collection) {
	const tmdbId = canonicalPositiveId(collection?.id);
	if (tmdbId === null || typeof collection?.name !== "string" || collection.name.trim().length === 0) {
		return draft;
	}
	return Object.freeze({
		...draft,
		tmdbId,
		identityTouched: true,
		selectedCollectionName: collection.name.trim(),
		title: collection.name.trim(),
		titleTouched: true,
	});
}

export function useSelectedMovieCollectionName(draft) {
	return typeof draft?.selectedCollectionName === "string"
		? updateSourceEditTitle(draft, draft.selectedCollectionName)
		: draft;
}

function duplicateFor(folder, adapter, draft, session) {
	const proposedIdentity = adapter.draftIdentity({ draft, session });
	if (
		proposedIdentity === null
		|| (proposedIdentity === session.originalIdentity && adapter.checkCurrentIdentityDuplicates !== true)
	) return null;
	for (const source of folder.sources) {
		if (source.internalId === session.sourceInternalId) continue;
		if (sourceIdentity(adapter, source) !== proposedIdentity) continue;
		return Object.freeze({
			internalId: source.internalId,
			identity: proposedIdentity,
			title: safeSourceEditTitle(source.editable.title, adapter.label),
		});
	}
	return null;
}

export function saveSourceEdit(controller, session, draft) {
	const state = controller.getState();
	const project = state.project;
	const exact = resolveExactSource(project, session);
	const anywhere = findSourceAnywhere(project, session.sourceInternalId);

	if (anywhere === null) {
		return failure(
			"SOURCE_EDIT_TARGET_DELETED",
			"$sourceEdit.source",
			"The source or its folder was deleted. Changes were not saved.",
			{ conflict: true, closeRequired: true },
		);
	}
	if (exact.collection === null || exact.folder === null || exact.source === null) {
		return failure(
			"SOURCE_EDIT_TARGET_MOVED",
			"$sourceEdit.source",
			"The source moved after this editor opened. Close and reopen it before editing. Changes were not saved.",
			{ conflict: true, closeRequired: false },
		);
	}
	if (project !== session.openingProject) {
		return failure(
			"SOURCE_EDIT_PROJECT_STALE",
			"$sourceEdit.project",
			"The collection changed after this editor opened. Close and reopen it before editing. Changes were not saved.",
			{ conflict: true, closeRequired: false },
		);
	}
	if (exact.sourceIndex !== session.sourceIndex) {
		return failure(
			"SOURCE_EDIT_SOURCE_REORDERED",
			"$sourceEdit.source",
			"The source order changed after this editor opened. Close and reopen it before editing. Changes were not saved.",
			{ conflict: true, closeRequired: false },
		);
	}
	const adapter = sourceEditorById(session.adapterId);
	const currentAdapter = sourceEditorFor(exact.source);
	if (
		adapter === null
		|| currentAdapter?.id !== session.adapterId
		|| exact.source.category !== session.sourceCategory
	) {
		return failure(
			"SOURCE_EDIT_ADAPTER_STALE",
			"$sourceEdit.source",
			"The source type changed after this editor opened. Close and reopen it before editing. Changes were not saved.",
			{ conflict: true, closeRequired: false },
		);
	}
	if (sourceIdentity(adapter, exact.source) !== session.originalIdentity) {
		return failure(
			"SOURCE_EDIT_IDENTITY_STALE",
			"$sourceEdit.source",
			"The source identity changed after this editor opened. Close and reopen it before editing. Changes were not saved.",
			{ conflict: true, closeRequired: false },
		);
	}

	const validation = adapter.validateDraft({
		draft,
		source: exact.source,
		session,
	});
	if (!validation.ok) {
		return { ok: false, errors: validation.errors, warnings: [], validationFailed: true };
	}
	const duplicate = duplicateFor(exact.folder, adapter, draft, session);
	if (duplicate !== null) {
		return failure(
			"SOURCE_EDIT_DUPLICATE_IDENTITY",
			"$sourceEdit.identity",
			typeof adapter.duplicateMessage === "function"
				? adapter.duplicateMessage(draft)
				: adapter.duplicateMessage,
			{
				duplicate,
				duplicateRejected: true,
				errorHeading: "Source already exists",
			},
		);
	}
	const patch = adapter.buildPatch({
		draft,
		source: exact.source,
		session,
	});
	if (Object.keys(patch).length === 0) {
		return {
			ok: true,
			changed: false,
			patch: Object.freeze({}),
			updatedInternalId: session.sourceInternalId,
			errors: [],
			warnings: [],
		};
	}

	const update = controller.updateNode(session.sourceInternalId, patch);
	if (!update.ok) {
		return {
			ok: false,
			errors: update.errors ?? [diagnostic(
				"SOURCE_EDIT_UPDATE_FAILED",
				"$sourceEdit",
				"The source could not be updated. Changes were not saved.",
			)],
			warnings: update.warnings ?? [],
		};
	}
	return {
		ok: true,
		changed: true,
		patch: Object.freeze({ ...patch }),
		updatedInternalId: session.sourceInternalId,
		errors: [],
		warnings: [],
	};
}
