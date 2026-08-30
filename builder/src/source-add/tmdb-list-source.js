import { isValidNuvioTitle } from "../nuvio/titles.js";
import { isCanonicalTmdbListId } from "./tmdb-list-input.js";
import { TMDB_LIST_SOURCE_MODE } from "./source-modes.js";

const EDITABLE_KEYS = Object.freeze(["filters", "mediaType", "provider", "sortBy", "title", "tmdbId", "tmdbSourceType"]);
function plainObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function diagnostic(code, path, message) { return Object.freeze({ code, path, message }); }
function text(value) { return typeof value === "string" ? value.trim() : ""; }
function sameKeys(value, keys) { return plainObject(value) && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0"); }

export function canonicalTmdbListSourceId(value) {
	if (isCanonicalTmdbListId(value)) return value;
	if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
	const id = Number(value);
	return isCanonicalTmdbListId(id) ? id : null;
}

export function tmdbListSelectionIdentity(value) {
	const id = canonicalTmdbListSourceId(plainObject(value) ? value.tmdbId : value);
	return id === null ? null : `tmdb|LIST|${id}`;
}

export function tmdbListPhysicalIdentity(editable) {
	if (!plainObject(editable)) return null;
	const id = canonicalTmdbListSourceId(editable.tmdbId);
	if (text(editable.provider).toLowerCase() !== "tmdb" || text(editable.tmdbSourceType).toUpperCase() !== "LIST" || text(editable.mediaType).toUpperCase() !== "MOVIE" || id === null) return null;
	return `tmdb|LIST|${id}|MOVIE`;
}

export function defaultTmdbListSourceTitle(list) {
	return text(list?.name) || (isCanonicalTmdbListId(list?.id) ? `TMDB list ${list.id}` : "TMDB list");
}

export function buildTmdbListSourceDraft(list, editedTitle = defaultTmdbListSourceTitle(list)) {
	const draft = {
		category: TMDB_LIST_SOURCE_MODE.category,
		editable: {
			title: text(editedTitle),
			sortBy: "original",
			tmdbId: list?.id,
			filters: {},
			provider: "tmdb",
			mediaType: "MOVIE",
			tmdbSourceType: "LIST",
		},
	};
	const validation = validateTmdbListSourceDraft(draft);
	return Object.freeze({ ...validation, draft: validation.ok ? draft : null });
}

export function validateTmdbListSourceDraft(draft) {
	const errors = [];
	if (!sameKeys(draft, ["category", "editable"])) return Object.freeze({ ok: false, errors: Object.freeze([diagnostic("INVALID_TMDB_LIST_DRAFT", "$tmdbList.source", "The TMDB List source contains unsupported fields.")]) });
	if (draft.category !== "native-tmdb") errors.push(diagnostic("INVALID_TMDB_LIST_CATEGORY", "$tmdbList.source.category", "The TMDB List source category must be native-tmdb."));
	if (!sameKeys(draft.editable, EDITABLE_KEYS)) return Object.freeze({ ok: false, errors: Object.freeze([...errors, diagnostic("INVALID_TMDB_LIST_FIELDS", "$tmdbList.source.editable", "The TMDB List source must contain exactly the canonical fields.")]) });
	const editable = draft.editable;
	if (!isValidNuvioTitle(editable.title) || editable.title !== text(editable.title)) errors.push(diagnostic("TMDB_LIST_TITLE_REQUIRED", "$tmdbList.source.editable.title", "Enter a name for this source."));
	if (!isCanonicalTmdbListId(editable.tmdbId)) errors.push(diagnostic("INVALID_TMDB_LIST_ID", "$tmdbList.source.editable.tmdbId", "The TMDB List ID must be a positive 32-bit integer."));
	if (editable.provider !== "tmdb" || editable.tmdbSourceType !== "LIST" || editable.mediaType !== "MOVIE" || editable.sortBy !== "original" || !plainObject(editable.filters) || Object.keys(editable.filters).length !== 0) errors.push(diagnostic("INVALID_TMDB_LIST_CONFIGURATION", "$tmdbList.source.editable", "TMDB Lists use provider tmdb, type LIST, canonical media MOVIE, original order and empty filters."));
	return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors) });
}

function locateFolder(project, folderInternalId) {
	for (const collection of project?.collections ?? []) for (const folder of collection.folders ?? []) if (folder.internalId === folderInternalId) return { collection, folder };
	return null;
}

export function inspectTmdbListSourceDuplicates(project, folderInternalId, drafts) {
	const identities = new Set((drafts ?? []).map((draft) => tmdbListPhysicalIdentity(draft?.editable)).filter(Boolean));
	const destination = [];
	const elsewhere = [];
	for (const collection of project?.collections ?? []) for (const folder of collection.folders ?? []) for (const source of folder.sources ?? []) {
		const identity = tmdbListPhysicalIdentity(source?.editable);
		if (!identities.has(identity)) continue;
		const occurrence = Object.freeze({ identity, collectionInternalId: collection.internalId, collectionTitle: text(collection.editable?.title), folderInternalId: folder.internalId, folderTitle: text(folder.editable?.title), sourceInternalId: source.internalId, sourceTitle: text(source.editable?.title) });
		(folder.internalId === folderInternalId ? destination : elsewhere).push(occurrence);
	}
	return Object.freeze({ destination: Object.freeze(destination), elsewhere: Object.freeze(elsewhere) });
}

export function tmdbListDuplicateOverrideIdentity(folderInternalId, drafts) {
	if (typeof folderInternalId !== "string" || !folderInternalId || !Array.isArray(drafts) || drafts.some((draft) => !validateTmdbListSourceDraft(draft).ok)) return null;
	return `${folderInternalId}\n${drafts.map((draft) => tmdbListPhysicalIdentity(draft.editable)).join("\n")}`;
}

export function createTmdbListSourceBundle(controller, { folderInternalId, drafts, duplicateOverrideIdentity = null, expectedProjectRevision = null, interactionLocked = false } = {}) {
	if (!Array.isArray(drafts) || drafts.length < 1) return { ok: false, errors: [diagnostic("TMDB_LIST_SELECTION_REQUIRED", "$tmdbList.sources", "Resolve at least one TMDB list before adding sources.")], warnings: [] };
	for (const draft of drafts) { const validation = validateTmdbListSourceDraft(draft); if (!validation.ok) return { ok: false, errors: validation.errors, warnings: [] }; }
	if (new Set(drafts.map((draft) => tmdbListPhysicalIdentity(draft.editable))).size !== drafts.length) return { ok: false, errors: [diagnostic("DUPLICATE_TMDB_LIST_SELECTION", "$tmdbList.sources", "Each TMDB list may be selected only once.")], warnings: [] };
	if (interactionLocked) return { ok: false, errors: [diagnostic("TMDB_LIST_INTERACTION_LOCKED", "$tmdbList.creation", "Finish the current hierarchy interaction before adding TMDB Lists.")], warnings: [] };
	const state = controller.getState();
	if (expectedProjectRevision !== null && state.revision !== expectedProjectRevision) return { ok: false, stale: true, errors: [diagnostic("STALE_TMDB_LIST_SOURCE_REVIEW", "$tmdbList.review", "The Builder project changed after this TMDB List review was prepared. Review the current placement before adding sources.")], warnings: [] };
	const location = locateFolder(state.project, folderInternalId);
	if (!location || state.selection.folderInternalId !== folderInternalId) return { ok: false, errors: [diagnostic("TMDB_LIST_FOLDER_UNAVAILABLE", "$tmdbList.destination", "The selected destination folder is no longer available.")], warnings: [] };
	const duplicateReview = inspectTmdbListSourceDuplicates(state.project, folderInternalId, drafts);
	const destinationIdentities = new Set(duplicateReview.destination.map((entry) => entry.identity));
	const override = tmdbListDuplicateOverrideIdentity(folderInternalId, drafts);
	const addAll = destinationIdentities.size > 0 && duplicateOverrideIdentity === override;
	const draftsToAdd = addAll ? drafts : drafts.filter((draft) => !destinationIdentities.has(tmdbListPhysicalIdentity(draft.editable)));
	if (draftsToAdd.length === 0) return { ok: false, requiresDuplicateOverride: true, duplicateReview, errors: [diagnostic("TMDB_LISTS_ALREADY_EXIST", "$tmdbList.sources", "Every selected TMDB List source already exists in this folder.")], warnings: [] };
	const result = controller.addSourcesToFolder(folderInternalId, { sources: draftsToAdd.map((draft) => ({ category: draft.category, editable: draft.editable })) });
	return result.ok ? { ...result, addedSourceCount: draftsToAdd.length, duplicateReview, duplicateOverrideUsed: addAll } : result;
}
