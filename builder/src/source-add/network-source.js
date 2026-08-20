import { NETWORK_SOURCE_MODE } from "./source-modes.js";

export const NETWORK_SORT_OPTIONS = Object.freeze([
	Object.freeze({ id: "popular", label: "Popular", description: "Popular series first.", value: "popularity.desc" }),
	Object.freeze({ id: "recent", label: "Recent", description: "Recently first-aired series first.", value: "first_air_date.desc" }),
	Object.freeze({ id: "top-rated", label: "Top rated", description: "Highest-rated series first.", value: "vote_average.desc" }),
	Object.freeze({ id: "most-votes", label: "Most voted", description: "Series with the most TMDB votes first.", value: "vote_count.desc" }),
]);
export const DEFAULT_NETWORK_SORT_OPTION_ID = NETWORK_SORT_OPTIONS[0].id;
export const DEFAULT_NETWORK_SORT = NETWORK_SORT_OPTIONS[0].value;
export const NETWORK_HIERARCHY_SOURCE_TITLE = "Series";

const editableKeys = Object.freeze(["filters", "mediaType", "provider", "sortBy", "title", "tmdbId", "tmdbSourceType"]);

function plainObject(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function canonicalText(value) {
	return typeof value === "string" ? value.trim() : "";
}

function canonicalTmdbId(value) {
	if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return value;
	if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
	const number = Number(value);
	return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function sameKeys(value, expected) {
	return plainObject(value) && Object.keys(value).sort().join("\u0000") === [...expected].sort().join("\u0000");
}

function diagnostic(code, path, message) {
	return { code, path, message };
}

export function networkSortValue(sortOptionId) {
	return NETWORK_SORT_OPTIONS.find((option) => option.id === sortOptionId)?.value ?? null;
}

export function networkSortOptionId(sortBy) {
	return NETWORK_SORT_OPTIONS.find((option) => option.value === sortBy)?.id ?? null;
}

export function isSupportedNetworkSort(value) {
	return typeof value === "string" && networkSortOptionId(value) !== null;
}

export function buildNetworkSourceDraft(network, { sortOptionId = DEFAULT_NETWORK_SORT_OPTION_ID } = {}) {
	const name = canonicalText(network?.name);
	const errors = [];
	if (!Number.isSafeInteger(network?.id) || network.id <= 0 || !name || network.name !== name) {
		errors.push(diagnostic("INVALID_NETWORK", "$network.network", "A canonical cached Network identity is required."));
	}
	const sortBy = networkSortValue(sortOptionId);
	if (sortBy === null) errors.push(diagnostic("UNSUPPORTED_NETWORK_SORT", "$network.sortBy", "Choose a supported Network Series sort order."));
	if (errors.length > 0) return { ok: false, draft: null, errors };
	const draft = {
		category: NETWORK_SOURCE_MODE.category,
		editable: {
			title: name,
			sortBy,
			tmdbId: network.id,
			filters: {},
			provider: "tmdb",
			mediaType: "TV",
			tmdbSourceType: "NETWORK",
		},
	};
	const validation = validateNetworkSourceDraft(draft, { network });
	return { ...validation, draft: validation.ok ? draft : null };
}

export function buildNetworkHierarchySourceDraft(network, { sortOptionId = DEFAULT_NETWORK_SORT_OPTION_ID } = {}) {
	const name = canonicalText(network?.name);
	const errors = [];
	if (!Number.isSafeInteger(network?.id) || network.id <= 0 || !name || network.name !== name) {
		errors.push(diagnostic("INVALID_NETWORK_HIERARCHY_NETWORK", "$networkHierarchy.network", "A canonical cached Network identity is required."));
	}
	const sortBy = networkSortValue(sortOptionId);
	if (sortBy === null) errors.push(diagnostic("UNSUPPORTED_NETWORK_HIERARCHY_SORT", "$networkHierarchy.sortBy", "Choose a supported Network Series sort order."));
	if (errors.length > 0) return { ok: false, draft: null, errors };
	const draft = {
		category: NETWORK_SOURCE_MODE.category,
		editable: {
			title: NETWORK_HIERARCHY_SOURCE_TITLE,
			sortBy,
			tmdbId: network.id,
			filters: {},
			provider: "tmdb",
			mediaType: "TV",
			tmdbSourceType: "NETWORK",
		},
	};
	const validation = validateNetworkHierarchySourceDraft(draft, { network });
	return { ...validation, draft: validation.ok ? draft : null };
}

export function validateNetworkSourceDraft(draft, { network = null, path = "$network.source" } = {}) {
	const errors = [];
	if (!plainObject(draft) || !sameKeys(draft, ["category", "editable"])) {
		return { ok: false, errors: [diagnostic("INVALID_NETWORK_SOURCE_DRAFT", path, "The Network source draft contains an unsupported field.")] };
	}
	if (draft.category !== "native-tmdb") errors.push(diagnostic("INVALID_NETWORK_SOURCE_CATEGORY", `${path}.category`, "Network sources must use the native-tmdb category."));
	if (!sameKeys(draft.editable, editableKeys)) {
		errors.push(diagnostic("INVALID_NETWORK_SOURCE_FIELDS", `${path}.editable`, "A Network source must contain exactly the supported native fields."));
		return { ok: false, errors };
	}
	const editable = draft.editable;
	const id = canonicalTmdbId(editable.tmdbId);
	const title = canonicalText(editable.title);
	if (editable.provider !== "tmdb") errors.push(diagnostic("INVALID_NETWORK_PROVIDER", `${path}.editable.provider`, "The Network provider must be tmdb."));
	if (editable.tmdbSourceType !== "NETWORK") errors.push(diagnostic("INVALID_NETWORK_SOURCE_TYPE", `${path}.editable.tmdbSourceType`, "The Network source type must be NETWORK."));
	if (editable.mediaType !== "TV") errors.push(diagnostic("UNSUPPORTED_NETWORK_MEDIA_TYPE", `${path}.editable.mediaType`, "Network sources must use the proven TV contract."));
	if (id === null) errors.push(diagnostic("INVALID_NETWORK_TMDB_ID", `${path}.editable.tmdbId`, "The Network TMDB ID must be a positive safe integer."));
	if (!title || editable.title !== title) errors.push(diagnostic("INVALID_NETWORK_TITLE", `${path}.editable.title`, "The Network source title must be non-empty and trimmed."));
	if (network !== null && (id !== network.id || editable.title !== canonicalText(network.name))) {
		errors.push(diagnostic("MISMATCHED_NETWORK_SOURCE", path, "The Network source must match the selected cached Network."));
	}
	if (!isSupportedNetworkSort(editable.sortBy)) errors.push(diagnostic("INVALID_NETWORK_SORT", `${path}.editable.sortBy`, "Choose a supported Network Series sort order."));
	if (!plainObject(editable.filters) || Object.keys(editable.filters).length !== 0) errors.push(diagnostic("INVALID_NETWORK_FILTERS", `${path}.editable.filters`, "Network source filters must be an explicit empty object."));
	return { ok: errors.length === 0, errors };
}

export function validateNetworkHierarchySourceDraft(draft, { network = null, path = "$networkHierarchy.source" } = {}) {
	const validation = validateNetworkSourceDraft(draft, { path });
	const errors = [...validation.errors];
	if (!plainObject(draft?.editable)) return { ok: false, errors };
	const id = canonicalTmdbId(draft.editable.tmdbId);
	if (draft.editable.title !== NETWORK_HIERARCHY_SOURCE_TITLE) {
		errors.push(diagnostic("INVALID_NETWORK_HIERARCHY_TITLE", `${path}.editable.title`, `Network hierarchy sources must use the ${NETWORK_HIERARCHY_SOURCE_TITLE} title.`));
	}
	if (network !== null && id !== network?.id) {
		errors.push(diagnostic("MISMATCHED_NETWORK_HIERARCHY_SOURCE", path, "The Network hierarchy source must match the selected cached Network."));
	}
	return { ok: errors.length === 0, errors };
}

export function networkSourceIdentity(editable) {
	if (!plainObject(editable)) return null;
	const provider = canonicalText(editable.provider).toLowerCase();
	const sourceType = canonicalText(editable.tmdbSourceType).toUpperCase();
	const mediaType = canonicalText(editable.mediaType).toUpperCase();
	const id = canonicalTmdbId(editable.tmdbId);
	if (provider !== "tmdb" || sourceType !== "NETWORK" || mediaType !== "TV" || id === null) return null;
	return `tmdb|NETWORK|${id}|TV`;
}

export function inspectNetworkSourceDuplicates(project, destinationFolderInternalId, networkId) {
	const identity = `tmdb|NETWORK|${networkId}|TV`;
	const destination = [];
	const elsewhere = [];
	for (const collection of project?.collections ?? []) {
		for (const folder of collection.folders ?? []) {
			for (const source of folder.sources ?? []) {
				if (networkSourceIdentity(source?.editable) !== identity) continue;
				const occurrence = Object.freeze({
					identity,
					collectionInternalId: collection.internalId,
					collectionTitle: canonicalText(collection.editable?.title),
					folderInternalId: folder.internalId,
					folderTitle: canonicalText(folder.editable?.title),
					sourceInternalId: source.internalId,
					sourceTitle: canonicalText(source.editable?.title),
				});
				if (folder.internalId === destinationFolderInternalId) destination.push(occurrence);
				else elsewhere.push(occurrence);
			}
		}
	}
	return Object.freeze({ destination: Object.freeze(destination), elsewhere: Object.freeze(elsewhere) });
}

export function networkDuplicateOverrideIdentity(folderInternalId, draft) {
	if (typeof folderInternalId !== "string" || !folderInternalId || !validateNetworkSourceDraft(draft).ok) return null;
	return `${folderInternalId}\n${networkSourceIdentity(draft.editable)}`;
}

function findCollectionAndFolder(project, folderInternalId) {
	for (const collection of project?.collections ?? []) {
		const folder = collection.folders.find((entry) => entry.internalId === folderInternalId);
		if (folder) return { collection, folder };
	}
	return null;
}

export function createNetworkSource(controller, {
	folderInternalId,
	network,
	draft,
	duplicateOverrideIdentity = null,
	interactionLocked = false,
} = {}) {
	const validation = validateNetworkSourceDraft(draft, { network });
	if (!validation.ok) return { ok: false, errors: validation.errors, warnings: [] };
	if (interactionLocked) return { ok: false, errors: [diagnostic("NETWORK_CREATION_INTERACTION_LOCKED", "$network.creation", "Finish the current hierarchy interaction before adding a Network source.")], warnings: [] };
	const state = controller.getState();
	const location = findCollectionAndFolder(state.project, folderInternalId);
	if (!location || state.selection.folderInternalId !== folderInternalId) {
		return { ok: false, errors: [diagnostic("NETWORK_FOLDER_UNAVAILABLE", "$network.destination", "The selected destination folder is no longer available.")], warnings: [] };
	}
	const duplicateReview = inspectNetworkSourceDuplicates(state.project, folderInternalId, network.id);
	const duplicateExists = duplicateReview.destination.length > 0;
	const override = networkDuplicateOverrideIdentity(folderInternalId, draft);
	const addAnyway = duplicateExists && duplicateOverrideIdentity === override;
	if (duplicateExists && !addAnyway) {
		return { ok: false, requiresDuplicateOverride: true, errors: [diagnostic("NETWORK_SOURCE_ALREADY_EXISTS", "$network.source", "Series already exists in this folder.")], warnings: [], duplicateReview };
	}
	const result = controller.addSourcesToFolder(folderInternalId, { sources: [{ category: draft.category, editable: draft.editable }] });
	return result.ok ? { ...result, addedSourceCount: 1, duplicateReview, duplicateOverrideUsed: addAnyway } : result;
}
