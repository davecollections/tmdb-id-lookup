import { isPositiveSafeTmdbId } from "./tmdb-collection-input.js";
import { MOVIE_FRANCHISE_SOURCE_MODE } from "./source-modes.js";

const editableKeys = Object.freeze([
	"filters",
	"mediaType",
	"provider",
	"sortBy",
	"title",
	"tmdbId",
	"tmdbSourceType",
]);

function diagnostic(code, path, message) {
	return { code, path, message };
}

function plainObject(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sameKeys(value, expected) {
	return (
		plainObject(value)
		&& Object.keys(value).sort().join("\u0000") === [...expected].sort().join("\u0000")
	);
}

function canonicalText(value) {
	return typeof value === "string" ? value.trim() : "";
}

function canonicalTmdbId(value) {
	if (isPositiveSafeTmdbId(value)) return value;
	if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
	const number = Number(value);
	return isPositiveSafeTmdbId(number) ? number : null;
}

function movieFranchiseIdentityKey(value) {
	const tmdbId = canonicalTmdbId(value);
	return tmdbId === null ? null : `tmdb|COLLECTION|${tmdbId}|MOVIE`;
}

export function movieFranchiseTitleDraftKey(collection) {
	return movieFranchiseIdentityKey(collection?.id);
}

export function resolveMovieFranchiseTitleDraft(collection, titleDrafts = {}) {
	const key = movieFranchiseTitleDraftKey(collection);
	const rememberedTitle = key !== null && plainObject(titleDrafts) && Object.hasOwn(titleDrafts, key)
		? titleDrafts[key]
		: null;
	return rememberedTitle !== null && buildMovieFranchiseSourceDraft(collection, rememberedTitle).ok
		? rememberedTitle
		: collection?.name ?? "";
}

export function buildMovieFranchiseSourceDraft(collection, editedTitle = collection?.name) {
	const tmdbId = collection?.id;
	const title = canonicalText(editedTitle);
	const draft = {
		category: MOVIE_FRANCHISE_SOURCE_MODE.category,
		editable: {
			title,
			sortBy: "original",
			tmdbId,
			filters: {},
			provider: "tmdb",
			mediaType: "MOVIE",
			tmdbSourceType: "COLLECTION",
		},
	};
	const validation = validateMovieFranchiseSourceDraft(draft);
	return {
		...validation,
		draft: validation.ok ? draft : null,
	};
}

export function validateMovieFranchiseSourceDraft(draft) {
	const errors = [];
	if (!plainObject(draft) || !sameKeys(draft, ["category", "editable"])) {
		errors.push(diagnostic(
			"INVALID_SOURCE_DRAFT",
			"$sourceDraft",
			"The source draft contains an unsupported field.",
		));
		return { ok: false, errors };
	}
	if (draft.category !== "native-tmdb") {
		errors.push(diagnostic(
			"INVALID_SOURCE_DRAFT_CATEGORY",
			"$sourceDraft.category",
			"The movie franchise source category must be native-tmdb.",
		));
	}
	if (!sameKeys(draft.editable, editableKeys)) {
		errors.push(diagnostic(
			"INVALID_SOURCE_DRAFT_FIELDS",
			"$sourceDraft.editable",
			"The movie franchise source must contain exactly the supported canonical fields.",
		));
		return { ok: false, errors };
	}

	const editable = draft.editable;
	if (canonicalText(editable.title).length === 0 || editable.title !== canonicalText(editable.title)) {
		errors.push(diagnostic(
			"SOURCE_TITLE_REQUIRED",
			"$sourceDraft.editable.title",
			"Enter a name for this source before saving.",
		));
	}
	if (!isPositiveSafeTmdbId(editable.tmdbId)) {
		errors.push(diagnostic(
			"INVALID_SOURCE_TMDB_ID",
			"$sourceDraft.editable.tmdbId",
			"The source TMDB ID must be a positive safe integer.",
		));
	}
	if (editable.provider !== "tmdb") {
		errors.push(diagnostic(
			"INVALID_SOURCE_PROVIDER",
			"$sourceDraft.editable.provider",
			"The source provider must be tmdb.",
		));
	}
	if (editable.tmdbSourceType !== "COLLECTION") {
		errors.push(diagnostic(
			"INVALID_SOURCE_TYPE",
			"$sourceDraft.editable.tmdbSourceType",
			"The source type must be COLLECTION.",
		));
	}
	if (editable.mediaType !== "MOVIE") {
		errors.push(diagnostic(
			"INVALID_SOURCE_MEDIA_TYPE",
			"$sourceDraft.editable.mediaType",
			"The source media type must be MOVIE.",
		));
	}
	if (editable.sortBy !== "original") {
		errors.push(diagnostic(
			"INVALID_SOURCE_SORT",
			"$sourceDraft.editable.sortBy",
			"The source sort must be original.",
		));
	}
	if (!plainObject(editable.filters) || Object.keys(editable.filters).length !== 0) {
		errors.push(diagnostic(
			"INVALID_SOURCE_FILTERS",
			"$sourceDraft.editable.filters",
			"The movie franchise source filters must be an explicit empty object.",
		));
	}
	return {
		ok: errors.length === 0,
		errors,
	};
}

export function movieFranchiseDuplicateIdentity(editable) {
	if (!plainObject(editable)) return null;
	const provider = canonicalText(editable.provider).toLowerCase();
	const sourceType = canonicalText(editable.tmdbSourceType).toUpperCase();
	const mediaType = canonicalText(editable.mediaType).toUpperCase();
	const identity = movieFranchiseIdentityKey(editable.tmdbId);
	if (
		provider !== "tmdb"
		|| sourceType !== "COLLECTION"
		|| mediaType !== "MOVIE"
		|| identity === null
	) {
		return null;
	}
	return identity;
}

export function findMovieFranchiseDuplicate(folder, draft) {
	const identity = movieFranchiseDuplicateIdentity(draft?.editable);
	if (!identity || !Array.isArray(folder?.sources)) return null;
	for (const source of folder.sources) {
		if (movieFranchiseDuplicateIdentity(source?.editable) !== identity) continue;
		const title = canonicalText(source.editable.title);
		return {
			internalId: source.internalId,
			identity,
			title: title || `TMDB collection ${canonicalTmdbId(source.editable.tmdbId)}`,
		};
	}
	return null;
}

export function createSourceSubmissionGate() {
	let active = false;
	return Object.freeze({
		begin() {
			if (active) return false;
			active = true;
			return true;
		},
		isActive() {
			return active;
		},
		reset() {
			active = false;
		},
	});
}

function findFolder(project, internalId) {
	for (const collection of project.collections) {
		for (const folder of collection.folders) {
			if (folder.internalId === internalId) return folder;
		}
	}
	return null;
}

export function createMovieFranchiseSource(controller, {
	folderInternalId,
	draft,
	duplicateApprovalIdentity = null,
	interactionLocked = false,
} = {}) {
	const validation = validateMovieFranchiseSourceDraft(draft);
	if (!validation.ok) {
		return {
			ok: false,
			errors: validation.errors,
			warnings: [],
		};
	}
	if (interactionLocked) {
		return {
			ok: false,
			errors: [diagnostic(
				"SOURCE_CREATION_INTERACTION_LOCKED",
				"$sourceCreation",
				"Finish the current hierarchy interaction before adding a source.",
			)],
			warnings: [],
		};
	}

	const state = controller.getState();
	const folder = findFolder(state.project, folderInternalId);
	if (
		folder === null
		|| state.selection.folderInternalId !== folderInternalId
	) {
		return {
			ok: false,
			errors: [diagnostic(
				"SOURCE_CREATION_FOLDER_UNAVAILABLE",
				"$sourceCreation.folder",
				"The selected folder is no longer available.",
			)],
			warnings: [],
		};
	}

	const duplicate = findMovieFranchiseDuplicate(folder, draft);
	if (
		duplicate !== null
		&& duplicateApprovalIdentity !== duplicate.identity
	) {
		return {
			ok: false,
			requiresDuplicateConfirmation: true,
			duplicate,
			errors: [],
			warnings: [],
		};
	}

	const creation = controller.createSource(folderInternalId, {
		category: draft.category,
		editable: draft.editable,
	});
	if (!creation.ok) return creation;

	const selection = controller.selectNode(creation.createdInternalId);
	return {
		ok: true,
		createdInternalId: creation.createdInternalId,
		selectionOk: selection.ok,
		errors: [],
		warnings: [],
	};
}
