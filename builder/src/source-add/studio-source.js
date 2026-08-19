import { STUDIO_SOURCE_MODE } from "./source-modes.js";

export const STUDIO_SOURCE_OPTIONS = Object.freeze([
	Object.freeze({
		id: "studio-movies",
		label: "Movies",
		mediaType: "MOVIE",
		countKey: "movie",
		supported: true,
	}),
	Object.freeze({
		id: "studio-series",
		label: "Series",
		mediaType: "TV",
		countKey: "series",
		supported: true,
	}),
]);

export const STUDIO_SORT_OPTIONS = Object.freeze([
	Object.freeze({
		id: "popular",
		label: "Popular",
		description: "Popular titles first.",
		values: Object.freeze({ MOVIE: "popularity.desc", TV: "popularity.desc" }),
	}),
	Object.freeze({
		id: "recent",
		label: "Recent",
		description: "Recently released titles first.",
		values: Object.freeze({ MOVIE: "primary_release_date.desc", TV: "first_air_date.desc" }),
	}),
	Object.freeze({
		id: "top-rated",
		label: "Top rated",
		description: "Highest-rated titles first.",
		values: Object.freeze({ MOVIE: "vote_average.desc", TV: "vote_average.desc" }),
	}),
	Object.freeze({
		id: "most-votes",
		label: "Most voted",
		description: "Titles with the most votes first.",
		values: Object.freeze({ MOVIE: "vote_count.desc", TV: "vote_count.desc" }),
	}),
]);
export const DEFAULT_STUDIO_SORT_OPTION_ID = STUDIO_SORT_OPTIONS[0].id;
export const STUDIO_MOVIE_SORT_OPTIONS = Object.freeze(STUDIO_SORT_OPTIONS.map((option) => Object.freeze({
	id: option.id,
	label: option.label,
	value: option.values.MOVIE,
})));
export const DEFAULT_STUDIO_MOVIE_SORT = STUDIO_MOVIE_SORT_OPTIONS[0].value;
export const STUDIO_SOURCE_TITLE_MODES = Object.freeze({
	ENTITY: "entity",
	HIERARCHY: "hierarchy",
});

const optionById = new Map(STUDIO_SOURCE_OPTIONS.map((option) => [option.id, option]));
const editableKeys = Object.freeze([
	"filters",
	"mediaType",
	"provider",
	"sortBy",
	"title",
	"tmdbId",
	"tmdbSourceType",
]);

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
	return plainObject(value)
		&& Object.keys(value).sort().join("\u0000") === [...expected].sort().join("\u0000");
}

function diagnostic(code, path, message) {
	return { code, path, message };
}

export function studioSourceTitle(studioName, mediaType, titleMode = STUDIO_SOURCE_TITLE_MODES.ENTITY) {
	const name = canonicalText(studioName);
	if (!name) return null;
	if (titleMode === STUDIO_SOURCE_TITLE_MODES.HIERARCHY) {
		if (mediaType === "MOVIE") return "Movies";
		if (mediaType === "TV") return "Series";
		return null;
	}
	if (titleMode !== STUDIO_SOURCE_TITLE_MODES.ENTITY) return null;
	if (mediaType === "MOVIE") return name;
	if (mediaType === "TV") return `${name} Series`;
	return null;
}

export function validateStudioSourceSelection(choices, { allowEmpty = false } = {}) {
	if (!Array.isArray(choices) || (!allowEmpty && choices.length === 0)) {
		return { ok: false, errors: [diagnostic("STUDIO_SOURCE_REQUIRED", "$studio.choices", "Choose at least one available Studio source.")] };
	}
	if (
		new Set(choices).size !== choices.length
		|| choices.some((choice) => !optionById.get(choice)?.supported)
	) {
		return { ok: false, errors: [diagnostic("UNSUPPORTED_STUDIO_SOURCE", "$studio.choices", "Choose only Studio source contracts proven by current repository evidence.")] };
	}
	return { ok: true, errors: [] };
}

export function isSupportedStudioMovieSort(value) {
	return isSupportedStudioSort(value, "MOVIE");
}

export function studioSortValue(sortOptionId, mediaType) {
	const option = STUDIO_SORT_OPTIONS.find((entry) => entry.id === sortOptionId);
	return option?.values?.[canonicalText(mediaType).toUpperCase()] ?? null;
}

export function studioSortOptionId(sortBy, mediaType) {
	const canonicalMediaType = canonicalText(mediaType).toUpperCase();
	return STUDIO_SORT_OPTIONS.find((option) => option.values[canonicalMediaType] === sortBy)?.id ?? null;
}

export function isSupportedStudioSort(value, mediaType) {
	return typeof value === "string" && studioSortOptionId(value, mediaType) !== null;
}

export function buildStudioSourceDrafts(studio, {
	choices,
	sortOptionId = null,
	sortBy = null,
	titleMode = STUDIO_SOURCE_TITLE_MODES.ENTITY,
} = {}) {
	const name = canonicalText(studio?.name);
	const errors = [];
	if (
		!Number.isSafeInteger(studio?.id)
		|| studio.id <= 0
		|| !name
		|| studio.name !== name
	) errors.push(diagnostic("INVALID_STUDIO", "$studio.studio", "A canonical cached Studio identity is required."));
	const selection = validateStudioSourceSelection(choices);
	errors.push(...selection.errors);
	const selectedMediaTypes = (Array.isArray(choices) ? choices : [])
		.map((choice) => optionById.get(choice)?.mediaType)
		.filter(Boolean);
	const resolvedSortOptionId = sortOptionId
		?? (sortBy === null
			? DEFAULT_STUDIO_SORT_OPTION_ID
			: selectedMediaTypes.map((mediaType) => studioSortOptionId(sortBy, mediaType)).find(Boolean) ?? null);
	if (!STUDIO_SORT_OPTIONS.some((option) => option.id === resolvedSortOptionId)) {
		errors.push(diagnostic("UNSUPPORTED_STUDIO_SORT", "$studio.sortBy", "Choose a supported Studio sort order."));
	}
	if (!Object.values(STUDIO_SOURCE_TITLE_MODES).includes(titleMode)) {
		errors.push(diagnostic("UNSUPPORTED_STUDIO_TITLE_MODE", "$studio.titleMode", "Choose a supported Studio source naming mode."));
	}
	if (errors.length > 0) return { ok: false, drafts: [], errors };

	const selected = new Set(choices);
	const drafts = STUDIO_SOURCE_OPTIONS
		.filter((option) => option.supported && selected.has(option.id))
		.map((option) => ({
			category: STUDIO_SOURCE_MODE.category,
			editable: {
				title: studioSourceTitle(name, option.mediaType, titleMode),
				sortBy: studioSortValue(resolvedSortOptionId, option.mediaType),
				tmdbId: studio.id,
				filters: {},
				provider: "tmdb",
				mediaType: option.mediaType,
				tmdbSourceType: "COMPANY",
			},
		}));
	const validation = validateStudioSourceDrafts(drafts, { studio, titleMode });
	return { ...validation, drafts: validation.ok ? drafts : [] };
}

export function validateStudioSourceDraft(draft, { studio = null, titleMode = STUDIO_SOURCE_TITLE_MODES.ENTITY, path = "$studio.sources[0]" } = {}) {
	const errors = [];
	if (!plainObject(draft) || !sameKeys(draft, ["category", "editable"])) {
		return { ok: false, errors: [diagnostic("INVALID_STUDIO_SOURCE_DRAFT", path, "The Studio source draft contains an unsupported field.")] };
	}
	if (draft.category !== "native-tmdb") errors.push(diagnostic("INVALID_STUDIO_SOURCE_CATEGORY", `${path}.category`, "Studio sources must use the native-tmdb category."));
	if (!sameKeys(draft.editable, editableKeys)) {
		errors.push(diagnostic("INVALID_STUDIO_SOURCE_FIELDS", `${path}.editable`, "A Studio source must contain exactly the supported native fields."));
		return { ok: false, errors };
	}
	const editable = draft.editable;
	const id = canonicalTmdbId(editable.tmdbId);
	const title = canonicalText(editable.title);
	const name = canonicalText(studio?.name);
	if (editable.provider !== "tmdb") errors.push(diagnostic("INVALID_STUDIO_PROVIDER", `${path}.editable.provider`, "The Studio provider must be tmdb."));
	if (editable.tmdbSourceType !== "COMPANY") errors.push(diagnostic("INVALID_STUDIO_SOURCE_TYPE", `${path}.editable.tmdbSourceType`, "The Studio source type must be COMPANY."));
	if (!["MOVIE", "TV"].includes(editable.mediaType)) errors.push(diagnostic("UNSUPPORTED_STUDIO_MEDIA_TYPE", `${path}.editable.mediaType`, "Studio sources must use the proven COMPANY Movie or TV contract."));
	if (id === null) errors.push(diagnostic("INVALID_STUDIO_TMDB_ID", `${path}.editable.tmdbId`, "The Studio TMDB ID must be a positive safe integer."));
	if (!title || editable.title !== title) errors.push(diagnostic("INVALID_STUDIO_TITLE", `${path}.editable.title`, "The Studio source title must be non-empty and trimmed."));
	if (studio !== null && (id !== studio.id || editable.title !== studioSourceTitle(name, editable.mediaType, titleMode))) {
		errors.push(diagnostic("MISMATCHED_STUDIO_SOURCE", path, "The Studio source must match the selected cached Studio."));
	}
	if (!isSupportedStudioSort(editable.sortBy, editable.mediaType)) errors.push(diagnostic("INVALID_STUDIO_SORT", `${path}.editable.sortBy`, "Choose a supported Studio sort order for this media type."));
	if (!plainObject(editable.filters) || Object.keys(editable.filters).length !== 0) errors.push(diagnostic("INVALID_STUDIO_FILTERS", `${path}.editable.filters`, "Studio source filters must be an explicit empty object."));
	return { ok: errors.length === 0, errors };
}

export function validateStudioSourceDrafts(drafts, { studio = null, titleMode = STUDIO_SOURCE_TITLE_MODES.ENTITY } = {}) {
	if (!Array.isArray(drafts) || drafts.length < 1 || drafts.length > 2) {
		return { ok: false, errors: [diagnostic("INVALID_STUDIO_SOURCE_BUNDLE", "$studio.sources", "Studio source bundles must contain one or two sources.")] };
	}
	const errors = drafts.flatMap((draft, index) => validateStudioSourceDraft(draft, { studio, titleMode, path: `$studio.sources[${index}]` }).errors);
	const identities = drafts.map((draft) => studioSourceIdentity(draft?.editable));
	if (identities.some((identity) => identity === null) || new Set(identities).size !== identities.length) {
		errors.push(diagnostic("DUPLICATE_STUDIO_SOURCE_IDENTITY", "$studio.sources", "Studio source bundles must contain distinct supported identities."));
	}
	return { ok: errors.length === 0, errors };
}

export function studioSourceIdentity(editable) {
	if (!plainObject(editable)) return null;
	const provider = canonicalText(editable.provider).toLowerCase();
	const sourceType = canonicalText(editable.tmdbSourceType).toUpperCase();
	const mediaType = canonicalText(editable.mediaType).toUpperCase();
	const id = canonicalTmdbId(editable.tmdbId);
	if (provider !== "tmdb" || sourceType !== "COMPANY" || !["MOVIE", "TV"].includes(mediaType) || id === null) return null;
	return `tmdb|COMPANY|${id}|${mediaType}`;
}

function findCollectionAndFolder(project, folderInternalId) {
	for (const collection of project?.collections ?? []) {
		const folder = collection.folders.find((entry) => entry.internalId === folderInternalId);
		if (folder) return { collection, folder };
	}
	return null;
}

export function inspectStudioSourceDuplicates(project, destinationFolderInternalId, studioId) {
	const identities = new Set(["MOVIE", "TV"].map((mediaType) => `tmdb|COMPANY|${studioId}|${mediaType}`));
	const destination = [];
	const elsewhere = [];
	for (const collection of project?.collections ?? []) {
		for (const folder of collection.folders ?? []) {
			for (const source of folder.sources ?? []) {
				const identity = studioSourceIdentity(source?.editable);
				if (!identities.has(identity)) continue;
				const occurrence = Object.freeze({
					identity,
					mediaType: identity.endsWith("|TV") ? "TV" : "MOVIE",
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

export function studioDuplicateOverrideIdentity(folderInternalId, drafts) {
	if (typeof folderInternalId !== "string" || !folderInternalId) return null;
	const validation = validateStudioSourceDrafts(drafts);
	if (!validation.ok) return null;
	return `${folderInternalId}\n${drafts.map((draft) => studioSourceIdentity(draft.editable)).join("\n")}`;
}

export function createStudioSourceBundle(controller, {
	folderInternalId,
	studio,
	drafts,
	duplicateOverrideIdentity = null,
	interactionLocked = false,
} = {}) {
	const validation = validateStudioSourceDrafts(drafts, { studio });
	if (!validation.ok) return { ok: false, errors: validation.errors, warnings: [] };
	if (interactionLocked) {
		return { ok: false, errors: [diagnostic("STUDIO_CREATION_INTERACTION_LOCKED", "$studio.creation", "Finish the current hierarchy interaction before adding Studio sources.")], warnings: [] };
	}
	const state = controller.getState();
	const location = findCollectionAndFolder(state.project, folderInternalId);
	if (!location || state.selection.folderInternalId !== folderInternalId) {
		return { ok: false, errors: [diagnostic("STUDIO_FOLDER_UNAVAILABLE", "$studio.destination", "The selected destination folder is no longer available.")], warnings: [] };
	}
	const duplicateReview = inspectStudioSourceDuplicates(state.project, folderInternalId, studio.id);
	const destinationIdentities = new Set(duplicateReview.destination.map((entry) => entry.identity));
	const override = studioDuplicateOverrideIdentity(folderInternalId, drafts);
	const addAll = drafts.some((draft) => destinationIdentities.has(studioSourceIdentity(draft.editable)))
		&& duplicateOverrideIdentity === override;
	const draftsToAdd = addAll
		? drafts
		: drafts.filter((draft) => !destinationIdentities.has(studioSourceIdentity(draft.editable)));
	if (draftsToAdd.length === 0) {
		return { ok: false, requiresDuplicateOverride: true, errors: [diagnostic("STUDIO_SOURCES_ALREADY_EXIST", "$studio.sources", "Every selected Studio source already exists in this folder.")], warnings: [], duplicateReview };
	}
	const result = controller.addSourcesToFolder(folderInternalId, {
		sources: draftsToAdd.map((draft) => ({ category: draft.category, editable: draft.editable })),
	});
	return result.ok ? { ...result, addedSourceCount: draftsToAdd.length, duplicateReview, duplicateOverrideUsed: addAll } : result;
}
