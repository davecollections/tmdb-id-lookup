import { validateNetworkAdvancedFilters, networkComparisonFilters } from "./network-advanced.js";
import { NETWORK_SOURCE_MODE } from "./source-modes.js";
import { orderedSourceSortIds } from "./source-sort-variants.js";
import { inspectNativeSourceDuplicates, isSourceVariantTitle, nativeSourceVariantKey, sourceVariantTitle } from "./native-source-variants.js";

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

export function buildNetworkSourceDraft(network, { sortOptionId = DEFAULT_NETWORK_SORT_OPTION_ID, filters = {} } = {}) {
	const name = canonicalText(network?.name);
	const advanced = validateNetworkAdvancedFilters(filters);
	const errors = [...advanced.errors];
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
			filters: { ...advanced.filters },
			provider: "tmdb",
			mediaType: "TV",
			tmdbSourceType: "NETWORK",
		},
	};
	const validation = validateNetworkSourceDraft(draft, { network });
	return { ...validation, draft: validation.ok ? draft : null };
}

export function buildNetworkHierarchySourceDraft(network, { sortOptionId = DEFAULT_NETWORK_SORT_OPTION_ID, filters = {} } = {}) {
	const name = canonicalText(network?.name);
	const advanced = validateNetworkAdvancedFilters(filters);
	const errors = [...advanced.errors];
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
			filters: { ...advanced.filters },
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
	if (network !== null && (id !== network.id || !isSourceVariantTitle(editable.title, canonicalText(network.name), editable.sortBy, "TV", NETWORK_SORT_OPTIONS))) {
		errors.push(diagnostic("MISMATCHED_NETWORK_SOURCE", path, "The Network source must match the selected cached Network."));
	}
	if (!isSupportedNetworkSort(editable.sortBy)) errors.push(diagnostic("INVALID_NETWORK_SORT", `${path}.editable.sortBy`, "Choose a supported Network Series sort order."));
	const advanced = validateNetworkAdvancedFilters(editable.filters);
	if (!plainObject(editable.filters) || !advanced.ok || JSON.stringify(advanced.filters) !== JSON.stringify(editable.filters)) errors.push(diagnostic("INVALID_NETWORK_FILTERS", `${path}.editable.filters`, "Network sources require supported canonical Advanced settings."));
	return { ok: errors.length === 0, errors };
}

export function validateNetworkHierarchySourceDraft(draft, { network = null, path = "$networkHierarchy.source" } = {}) {
	const validation = validateNetworkSourceDraft(draft, { path });
	const errors = [...validation.errors];
	if (!plainObject(draft?.editable)) return { ok: false, errors };
	const id = canonicalTmdbId(draft.editable.tmdbId);
	if (!isSourceVariantTitle(draft.editable.title, NETWORK_HIERARCHY_SOURCE_TITLE, draft.editable.sortBy, "TV", NETWORK_SORT_OPTIONS)) {
		errors.push(diagnostic("INVALID_NETWORK_HIERARCHY_TITLE", `${path}.editable.title`, `Network hierarchy sources must use the ${NETWORK_HIERARCHY_SOURCE_TITLE} title.`));
	}
	if (network !== null && id !== network?.id) {
		errors.push(diagnostic("MISMATCHED_NETWORK_HIERARCHY_SOURCE", path, "The Network hierarchy source must match the selected cached Network."));
	}
	return { ok: errors.length === 0, errors };
}

export function buildNetworkSourceDrafts(network, { sortOptionId = DEFAULT_NETWORK_SORT_OPTION_ID, sortOptionIds, filters = {}, hierarchy = false } = {}) {
	const sorts = orderedSourceSortIds(sortOptionIds, sortOptionId, NETWORK_SORT_OPTIONS);
	if (sorts === null || sorts.length === 0) return { ok: false, drafts: [], errors: [diagnostic("UNSUPPORTED_NETWORK_SORT", "$network.sortOptionIds", "Choose at least one option.")] };
	const results = sorts.map((sort) => (hierarchy ? buildNetworkHierarchySourceDraft : buildNetworkSourceDraft)(network, { sortOptionId: sort, filters }));
	const errors = results.flatMap((result) => result.errors);
	if (errors.length) return { ok: false, drafts: [], errors };
	const drafts = results.map(({ draft }, index) => ({
		...draft,
		editable: { ...draft.editable, title: sourceVariantTitle(draft.editable.title, sorts[index], NETWORK_SORT_OPTIONS, sorts.length > 1) },
	}));
	return { ...validateNetworkSourceDrafts(drafts, { network, hierarchy }), drafts };
}

export function validateNetworkSourceDrafts(drafts, { network = null, hierarchy = false } = {}) {
	if (!Array.isArray(drafts) || drafts.length < 1 || drafts.length > NETWORK_SORT_OPTIONS.length) {
		return { ok: false, errors: [diagnostic("INVALID_NETWORK_SOURCE_BUNDLE", "$network.sources", "Choose supported Network source variants.")] };
	}
	const errors = drafts.flatMap((draft) => (hierarchy ? validateNetworkHierarchySourceDraft : validateNetworkSourceDraft)(draft, { network }).errors);
	const keys = drafts.map(networkSourceVariantKey);
	if (keys.some((key) => key === null) || new Set(keys).size !== keys.length || new Set(drafts.map((draft) => canonicalTmdbId(draft?.editable?.tmdbId))).size !== 1) {
		errors.push(diagnostic("INVALID_NETWORK_SOURCE_VARIANTS", "$network.sources", "Choose distinct source variants for one Network."));
	}
	return { ok: errors.length === 0, errors };
}

export function networkSourceVariantKey(source) {
	return nativeSourceVariantKey(source, networkSourceIdentity, NETWORK_SORT_OPTIONS, networkComparisonFilters);
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

export function inspectNetworkSourceDuplicates(project, destinationFolderInternalId, drafts) {
	return inspectNativeSourceDuplicates(project, destinationFolderInternalId, drafts, networkSourceVariantKey);
}

export function networkDuplicateOverrideIdentity(folderInternalId, candidate) {
	const drafts = Array.isArray(candidate) ? candidate : [candidate];
	if (typeof folderInternalId !== "string" || !folderInternalId || !validateNetworkSourceDrafts(drafts).ok) return null;
	return `${folderInternalId}\n${drafts.map(networkSourceVariantKey).join("\n")}`;
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
	drafts = draft ? [draft] : [],
	duplicateOverrideIdentity = null,
	interactionLocked = false,
} = {}) {
	const validation = validateNetworkSourceDrafts(drafts, { network });
	if (!validation.ok) return { ok: false, errors: validation.errors, warnings: [] };
	if (interactionLocked) return { ok: false, errors: [diagnostic("NETWORK_CREATION_INTERACTION_LOCKED", "$network.creation", "Finish the current hierarchy interaction before adding a Network source.")], warnings: [] };
	const state = controller.getState();
	const location = findCollectionAndFolder(state.project, folderInternalId);
	if (!location || state.selection.folderInternalId !== folderInternalId) {
		return { ok: false, errors: [diagnostic("NETWORK_FOLDER_UNAVAILABLE", "$network.destination", "The selected destination folder is no longer available.")], warnings: [] };
	}
	const duplicateReview = inspectNetworkSourceDuplicates(state.project, folderInternalId, drafts);
	const duplicateExists = duplicateReview.destination.length > 0;
	const override = networkDuplicateOverrideIdentity(folderInternalId, drafts);
	const addAnyway = duplicateExists && duplicateOverrideIdentity === override;
	const draftsToAdd = addAnyway ? drafts : duplicateReview.missingDrafts;
	if (draftsToAdd.length === 0) {
		return { ok: false, requiresDuplicateOverride: true, errors: [diagnostic("NETWORK_SOURCE_ALREADY_EXISTS", "$network.source", "Every selected Series source already exists in this folder.")], warnings: [], duplicateReview };
	}
	const result = controller.addSourcesToFolder(folderInternalId, { sources: draftsToAdd.map((entry) => ({ category: entry.category, editable: entry.editable })) });
	return result.ok ? { ...result, addedSourceCount: draftsToAdd.length, duplicateReview, duplicateOverrideUsed: addAnyway } : result;
}
