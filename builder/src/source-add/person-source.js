import { isPersonCreditCountSet } from "./person-credits.js";
import {
	buildPromotedPeopleFolderEditable,
	isPromotablePeopleFolder,
} from "./person-folder-artwork.js";
import { PEOPLE_SOURCE_MODE } from "./source-modes.js";
import { isPositiveSafePersonId } from "./tmdb-person-input.js";

export const PEOPLE_ROLES = Object.freeze([
	Object.freeze({ id: "acting", label: "Acting", tmdbSourceType: "PERSON" }),
	Object.freeze({ id: "directing", label: "Directing", tmdbSourceType: "DIRECTOR" }),
]);
export const PEOPLE_MEDIA = Object.freeze([
	Object.freeze({ id: "movies", label: "Movies", mediaType: "MOVIE" }),
	Object.freeze({ id: "series", label: "Series", mediaType: "TV" }),
]);
export const PEOPLE_SOURCE_COMBINATIONS = Object.freeze([
	Object.freeze({ id: "acting-movies", label: "Acting Movies", sourceTitle: "Movie Credits", role: "acting", media: "movies", countKey: "actingMovies", tmdbSourceType: "PERSON", mediaType: "MOVIE" }),
	Object.freeze({ id: "acting-series", label: "Acting Series", sourceTitle: "Series Credits", role: "acting", media: "series", countKey: "actingSeries", tmdbSourceType: "PERSON", mediaType: "TV" }),
	Object.freeze({ id: "directing-movies", label: "Directed Movies", sourceTitle: "Directed Movies", role: "directing", media: "movies", countKey: "directingMovies", tmdbSourceType: "DIRECTOR", mediaType: "MOVIE" }),
	Object.freeze({ id: "directing-series", label: "Directed Series", sourceTitle: "Directed Series", role: "directing", media: "series", countKey: "directingSeries", tmdbSourceType: "DIRECTOR", mediaType: "TV" }),
]);
export const PEOPLE_CONFIGURATION_MODES = Object.freeze({
	AUTOMATIC: "automatic",
	SHARED: "shared",
	CUSTOM: "custom",
});
export const PEOPLE_SOURCE_SORT_OPTIONS = Object.freeze([
	Object.freeze({
		id: "popular",
		label: "Popular",
		values: Object.freeze({ MOVIE: "popularity.desc", TV: "popularity.desc" }),
	}),
	Object.freeze({
		id: "recent",
		label: "Recent",
		values: Object.freeze({ MOVIE: "primary_release_date.desc", TV: "first_air_date.desc" }),
	}),
	Object.freeze({
		id: "top-rated",
		label: "Top rated",
		values: Object.freeze({ MOVIE: "vote_average.desc", TV: "vote_average.desc" }),
	}),
]);
export const DEFAULT_PEOPLE_SOURCE_SORT_OPTION_ID = "popular";

const combinationById = new Map(PEOPLE_SOURCE_COMBINATIONS.map((entry) => [entry.id, entry]));
const sortOptionById = new Map(PEOPLE_SOURCE_SORT_OPTIONS.map((entry) => [entry.id, entry]));
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

function sameKeys(value, expected) {
	return plainObject(value)
		&& Object.keys(value).sort().join("\u0000") === [...expected].sort().join("\u0000");
}

function diagnostic(code, path, message) {
	return { code, path, message };
}

function canonicalText(value) {
	return typeof value === "string" ? value.trim() : "";
}

function canonicalTmdbId(value) {
	if (isPositiveSafePersonId(value)) return value;
	if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
	const number = Number(value);
	return isPositiveSafePersonId(number) ? number : null;
}

export function peopleSourceTitle(tmdbSourceType, mediaType) {
	const sourceType = canonicalText(tmdbSourceType).toUpperCase();
	const canonicalMediaType = canonicalText(mediaType).toUpperCase();
	return PEOPLE_SOURCE_COMBINATIONS.find((entry) => (
		entry.tmdbSourceType === sourceType && entry.mediaType === canonicalMediaType
	))?.sourceTitle ?? null;
}

function selectedPositiveCombinations(counts, role) {
	if (!isPersonCreditCountSet(counts)) return [];
	return PEOPLE_SOURCE_COMBINATIONS
		.filter((entry) => entry.role === role && counts[entry.countKey] > 0)
		.map((entry) => entry.id);
}

export function defaultPeopleSourceCombinations(person) {
	const counts = person?.counts;
	if (!isPersonCreditCountSet(counts)) return Object.freeze([]);
	if (Array.isArray(person?.categoryMembership) && person.categoryMembership.length > 0) {
		const roles = person.categoryMembership.flatMap((membership) => (
			membership === "actor" ? ["acting"] : membership === "director" ? ["directing"] : []
		));
		if (roles.length > 0) {
			return Object.freeze(roles.flatMap((role) => selectedPositiveCombinations(counts, role)));
		}
	}
	const department = canonicalText(person?.knownForDepartment).toLocaleLowerCase("en");
	if (department === "acting") return Object.freeze(selectedPositiveCombinations(counts, "acting"));
	if (department === "directing") return Object.freeze(selectedPositiveCombinations(counts, "directing"));

	const actingTotal = counts.actingMovies + counts.actingSeries;
	const directingTotal = counts.directingMovies + counts.directingSeries;
	if (actingTotal > directingTotal && actingTotal > 0) {
		return Object.freeze(selectedPositiveCombinations(counts, "acting"));
	}
	if (directingTotal > actingTotal && directingTotal > 0) {
		return Object.freeze(selectedPositiveCombinations(counts, "directing"));
	}
	return Object.freeze([]);
}

export function createPeopleConfiguration(person, previous = null) {
	if (!isPositiveSafePersonId(person?.id)) throw new TypeError("People configuration requires a positive person ID.");
	if (previous?.personId === person.id && Array.isArray(previous.combinations)) {
		return Object.freeze({
			personId: person.id,
			combinations: Object.freeze([...previous.combinations]),
			defaultsApplied: true,
		});
	}
	return Object.freeze({
		personId: person.id,
		combinations: defaultPeopleSourceCombinations(person),
		defaultsApplied: true,
	});
}

export function peopleSortValue(sortOptionId, mediaType) {
	const canonicalMediaType = canonicalText(mediaType).toUpperCase();
	return sortOptionById.get(sortOptionId)?.values?.[canonicalMediaType] ?? null;
}

export function peopleSortOptionId(sortBy, mediaType) {
	const canonicalMediaType = canonicalText(mediaType).toUpperCase();
	return PEOPLE_SOURCE_SORT_OPTIONS.find((option) => option.values[canonicalMediaType] === sortBy)?.id ?? null;
}

export function peopleSortOptions(mediaType) {
	const canonicalMediaType = canonicalText(mediaType).toUpperCase();
	if (!["MOVIE", "TV"].includes(canonicalMediaType)) return Object.freeze([]);
	return Object.freeze(PEOPLE_SOURCE_SORT_OPTIONS.map((option) => Object.freeze({
		id: option.id,
		label: option.label,
		value: option.values[canonicalMediaType],
	})));
}

export function isVerifiedPeopleSort(value, mediaType) {
	return typeof value === "string" && peopleSortOptionId(value, mediaType) !== null;
}

export function peopleTitlePreviewLimit(viewportWidth) {
	return Number.isFinite(viewportWidth) && viewportWidth <= 520 ? 5 : 10;
}

export function peoplePreviewMediaTypes(combinations) {
	const validation = validatePeopleCombinationSelection(combinations, { allowEmpty: true });
	if (!validation.ok) return Object.freeze([]);
	const selected = new Set(combinations);
	return Object.freeze(["MOVIE", "TV"].filter((mediaType) => (
		PEOPLE_SOURCE_COMBINATIONS.some((combination) => selected.has(combination.id) && combination.mediaType === mediaType)
	)));
}

export function resolvePeopleConfigurationForMode(person, {
	mode = PEOPLE_CONFIGURATION_MODES.AUTOMATIC,
	sharedCombinations = [],
	customConfiguration = null,
} = {}) {
	const automatic = createPeopleConfiguration(person);
	const override = customConfiguration?.personId === person.id
		? createPeopleConfiguration(person, customConfiguration)
		: null;
	if (mode === PEOPLE_CONFIGURATION_MODES.AUTOMATIC) return override ?? automatic;
	if (mode === PEOPLE_CONFIGURATION_MODES.SHARED) {
		return override ?? updatePeopleConfiguration(automatic, sharedCombinations);
	}
	if (mode === PEOPLE_CONFIGURATION_MODES.CUSTOM) {
		return override ?? automatic;
	}
	throw new TypeError("Choose a supported People configuration mode.");
}

export function updatePeopleConfiguration(configuration, combinations) {
	if (!isPositiveSafePersonId(configuration?.personId)) throw new TypeError("A People configuration is required.");
	const validation = validatePeopleCombinationSelection(combinations, { allowEmpty: true });
	if (!validation.ok) throw new TypeError(validation.errors[0].message);
	return Object.freeze({
		personId: configuration.personId,
		combinations: Object.freeze([...combinations]),
		defaultsApplied: true,
	});
}

export function validatePeopleCombinationSelection(combinations, { allowEmpty = false } = {}) {
	if (!Array.isArray(combinations) || (!allowEmpty && combinations.length === 0)) {
		return { ok: false, errors: [diagnostic("PEOPLE_SOURCE_REQUIRED", "$people.combinations", "Choose at least one source to add.")] };
	}
	if (
		combinations.length > PEOPLE_SOURCE_COMBINATIONS.length
		|| new Set(combinations).size !== combinations.length
		|| combinations.some((value) => !combinationById.has(value))
	) {
		return { ok: false, errors: [diagnostic("INVALID_PEOPLE_COMBINATION", "$people.combinations", "Choose only supported People source combinations.")] };
	}
	return { ok: true, errors: [] };
}

export function createPeopleCustomConfigurationMap(configurations, {
	overridePersonId = null,
	combinationId = null,
} = {}) {
	if (!Array.isArray(configurations) || configurations.length === 0) {
		throw new TypeError("One or more People configurations are required.");
	}
	const byId = {};
	for (const configuration of configurations) {
		if (!isPositiveSafePersonId(configuration?.personId) || byId[configuration.personId]) {
			throw new TypeError("People custom configurations must use distinct positive person IDs.");
		}
		byId[configuration.personId] = updatePeopleConfiguration(configuration, configuration.combinations);
	}
	if (overridePersonId !== null || combinationId !== null) {
		const target = byId[overridePersonId];
		if (!target || !combinationById.has(combinationId)) throw new TypeError("Choose a valid person and source combination to customise.");
		const combinations = target.combinations.includes(combinationId)
			? target.combinations.filter((id) => id !== combinationId)
			: [...target.combinations, combinationId];
		byId[overridePersonId] = updatePeopleConfiguration(target, combinations);
	}
	return Object.freeze(byId);
}

function comparePreviewCredits(left, right, sortOptionId) {
	if (sortOptionId === "recent") {
		return right.releaseDate.localeCompare(left.releaseDate)
			|| right.popularity - left.popularity
			|| right.voteCount - left.voteCount
			|| left.identity.localeCompare(right.identity);
	}
	if (sortOptionId === "top-rated") {
		return right.voteAverage - left.voteAverage
			|| right.voteCount - left.voteCount
			|| right.popularity - left.popularity
			|| left.identity.localeCompare(right.identity);
	}
	return right.popularity - left.popularity
		|| right.voteCount - left.voteCount
		|| right.voteAverage - left.voteAverage
		|| left.identity.localeCompare(right.identity);
}

export function buildPeopleTitlePreview(person, {
	combinations,
	sortOptionId = DEFAULT_PEOPLE_SOURCE_SORT_OPTION_ID,
	limit = 10,
	mediaType = null,
} = {}) {
	const selectionValidation = validatePeopleCombinationSelection(combinations, { allowEmpty: true });
	if (!selectionValidation.ok) return Object.freeze({ ok: false, mediaType: null, totalResults: 0, items: Object.freeze([]), errors: Object.freeze(selectionValidation.errors) });
	if (!sortOptionById.has(sortOptionId)) {
		return Object.freeze({ ok: false, mediaType: null, totalResults: 0, items: Object.freeze([]), errors: Object.freeze([diagnostic("INVALID_PEOPLE_PREVIEW_SORT", "$people.preview.sortOptionId", "Choose a supported People sort order.")]) });
	}
	if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10) {
		return Object.freeze({ ok: false, mediaType: null, totalResults: 0, items: Object.freeze([]), errors: Object.freeze([diagnostic("INVALID_PEOPLE_PREVIEW_LIMIT", "$people.preview.limit", "People title previews must contain one to ten posters.")]) });
	}
	if (!plainObject(person?.combinedCredits) || !Array.isArray(person.combinedCredits.cast) || !Array.isArray(person.combinedCredits.crew)) {
		return Object.freeze({ ok: false, mediaType: null, totalResults: 0, items: Object.freeze([]), errors: Object.freeze([diagnostic("PEOPLE_PREVIEW_UNAVAILABLE", "$people.preview.credits", "Title preview data is unavailable for this person.")]) });
	}

	const selected = new Set(combinations);
	const availableMediaTypes = peoplePreviewMediaTypes(combinations);
	const resolvedMediaType = mediaType === null ? availableMediaTypes[0] ?? null : canonicalText(mediaType).toUpperCase();
	if (resolvedMediaType === null) {
		return Object.freeze({ ok: true, mediaType: null, totalResults: 0, items: Object.freeze([]), errors: Object.freeze([]) });
	}
	if (!["MOVIE", "TV"].includes(resolvedMediaType) || !availableMediaTypes.includes(resolvedMediaType)) {
		return Object.freeze({ ok: false, mediaType: resolvedMediaType, totalResults: 0, items: Object.freeze([]), errors: Object.freeze([diagnostic("INVALID_PEOPLE_PREVIEW_MEDIA", "$people.preview.mediaType", "Choose a media type included in this person’s selected sources.")]) });
	}
	const byIdentity = new Map();
	for (const combination of PEOPLE_SOURCE_COMBINATIONS) {
		if (!selected.has(combination.id) || combination.mediaType !== resolvedMediaType) continue;
		const credits = combination.role === "acting" ? person.combinedCredits.cast : person.combinedCredits.crew;
		for (const credit of credits) {
			if (!plainObject(credit) || !isPositiveSafePersonId(credit.id) || typeof credit.posterPath !== "string") continue;
			if (credit.mediaType !== (combination.mediaType === "MOVIE" ? "movie" : "tv")) continue;
			if (combination.role === "directing" && canonicalText(credit.job).toLowerCase() !== "director") continue;
			const identity = `${credit.mediaType}|${credit.id}`;
			if (byIdentity.has(identity)) continue;
			byIdentity.set(identity, Object.freeze({
				identity,
				id: credit.id,
				mediaType: credit.mediaType === "movie" ? "MOVIE" : "TV",
				posterPath: credit.posterPath,
				popularity: Number.isFinite(credit.popularity) ? credit.popularity : 0,
				voteAverage: Number.isFinite(credit.voteAverage) ? credit.voteAverage : 0,
				voteCount: Number.isFinite(credit.voteCount) ? credit.voteCount : 0,
				releaseDate: typeof credit.releaseDate === "string" ? credit.releaseDate : "",
			}));
		}
	}
	const sortedItems = [...byIdentity.values()].sort((left, right) => comparePreviewCredits(left, right, sortOptionId));
	return Object.freeze({
		ok: true,
		mediaType: resolvedMediaType,
		totalResults: sortedItems.length,
		items: Object.freeze(sortedItems.slice(0, limit)),
		errors: Object.freeze([]),
	});
}

export function validatePeopleRoleMediaSelection({ roles, media } = {}) {
	if (!Array.isArray(roles) || !Array.isArray(media)) {
		return { ok: false, errors: [diagnostic("INVALID_PEOPLE_SELECTION", "$people", "Choose supported roles and media values.")] };
	}
	if (
		new Set(roles).size !== roles.length
		|| new Set(media).size !== media.length
		|| roles.some((value) => !PEOPLE_ROLES.some((entry) => entry.id === value))
		|| media.some((value) => !PEOPLE_MEDIA.some((entry) => entry.id === value))
	) {
		return { ok: false, errors: [diagnostic("INVALID_PEOPLE_SELECTION", "$people", "Choose supported roles and media values.")] };
	}
	const combinations = PEOPLE_SOURCE_COMBINATIONS
		.filter((entry) => roles.includes(entry.role) && media.includes(entry.media))
		.map((entry) => entry.id);
	return validatePeopleCombinationSelection(combinations);
}

export function buildPeopleSourceDrafts(person, { combinations, sortOptionId = DEFAULT_PEOPLE_SOURCE_SORT_OPTION_ID } = {}) {
	const errors = [];
	const personName = canonicalText(person?.name);
	if (!isPositiveSafePersonId(person?.id) || !personName || person?.name !== personName) {
		errors.push(diagnostic("INVALID_PEOPLE_PERSON", "$people.person", "A canonical TMDB person identity is required."));
	}
	const selectionValidation = validatePeopleCombinationSelection(combinations);
	errors.push(...selectionValidation.errors);
	if (!sortOptionById.has(sortOptionId)) {
		errors.push(diagnostic("INVALID_PEOPLE_SORT_OPTION", "$people.sortOptionId", "Choose a supported People sort order."));
	}
	if (errors.length > 0) return { ok: false, drafts: [], errors };

	const selected = new Set(combinations);
	const drafts = PEOPLE_SOURCE_COMBINATIONS
		.filter((entry) => selected.has(entry.id))
		.map((entry) => ({
			category: PEOPLE_SOURCE_MODE.category,
			editable: {
				title: entry.sourceTitle,
				sortBy: peopleSortValue(sortOptionId, entry.mediaType),
				tmdbId: person.id,
				filters: {},
				provider: "tmdb",
				mediaType: entry.mediaType,
				tmdbSourceType: entry.tmdbSourceType,
			},
		}));
	const validation = validatePeopleSourceDrafts(drafts, { person });
	return { ...validation, drafts: validation.ok ? drafts : [] };
}

export function validatePeopleSourceDraft(draft, path = "$people.sources[0]") {
	const errors = [];
	if (!plainObject(draft) || !sameKeys(draft, ["category", "editable"])) {
		return { ok: false, errors: [diagnostic("INVALID_PEOPLE_SOURCE_DRAFT", path, "The People source draft contains an unsupported field.")] };
	}
	if (draft.category !== "native-tmdb") {
		errors.push(diagnostic("INVALID_PEOPLE_SOURCE_CATEGORY", `${path}.category`, "The People source category must be native-tmdb."));
	}
	if (!sameKeys(draft.editable, editableKeys)) {
		errors.push(diagnostic("INVALID_PEOPLE_SOURCE_FIELDS", `${path}.editable`, "A People source must contain exactly the supported native fields."));
		return { ok: false, errors };
	}
	const editable = draft.editable;
	const title = canonicalText(editable.title);
	const sourceType = canonicalText(editable.tmdbSourceType).toUpperCase();
	const mediaType = canonicalText(editable.mediaType).toUpperCase();
	const expectedTitle = peopleSourceTitle(sourceType, mediaType);
	if (!title || editable.title !== title || expectedTitle === null || title !== expectedTitle) {
		errors.push(diagnostic("INVALID_PEOPLE_SOURCE_TITLE", `${path}.editable.title`, "The People source title must use the established role-and-media wording."));
	}
	if (!isPositiveSafePersonId(editable.tmdbId)) {
		errors.push(diagnostic("INVALID_PEOPLE_TMDB_ID", `${path}.editable.tmdbId`, "The People source TMDB ID must be a positive safe integer."));
	}
	if (editable.provider !== "tmdb") errors.push(diagnostic("INVALID_PEOPLE_PROVIDER", `${path}.editable.provider`, "The People source provider must be tmdb."));
	if (!["PERSON", "DIRECTOR"].includes(sourceType) || editable.tmdbSourceType !== sourceType) {
		errors.push(diagnostic("INVALID_PEOPLE_SOURCE_TYPE", `${path}.editable.tmdbSourceType`, "The People source type must be PERSON or DIRECTOR."));
	}
	if (!["MOVIE", "TV"].includes(mediaType) || editable.mediaType !== mediaType) {
		errors.push(diagnostic("INVALID_PEOPLE_MEDIA_TYPE", `${path}.editable.mediaType`, "The People source media type must be MOVIE or TV."));
	}
	if (!isVerifiedPeopleSort(editable.sortBy, mediaType)) errors.push(diagnostic("INVALID_PEOPLE_SORT", `${path}.editable.sortBy`, "Choose a supported People source sort."));
	if (!plainObject(editable.filters) || Object.keys(editable.filters).length !== 0) {
		errors.push(diagnostic("INVALID_PEOPLE_FILTERS", `${path}.editable.filters`, "People source filters must be an explicit empty object."));
	}
	return { ok: errors.length === 0, errors };
}

export function validatePeopleSourceDrafts(drafts, { person = null } = {}) {
	if (!Array.isArray(drafts) || drafts.length < 1 || drafts.length > 4) {
		return { ok: false, errors: [diagnostic("INVALID_PEOPLE_SOURCE_BUNDLE", "$people.sources", "People source bundles must contain one to four sources.")] };
	}
	const errors = drafts.flatMap((draft, index) => validatePeopleSourceDraft(draft, `$people.sources[${index}]`).errors);
	const identities = drafts.map((draft) => peopleSourceIdentity(draft?.editable));
	if (identities.some((identity) => identity === null) || new Set(identities).size !== identities.length) {
		errors.push(diagnostic("DUPLICATE_PEOPLE_SOURCE_IDENTITY", "$people.sources", "A People source bundle must contain distinct supported identities."));
	}
	const personIds = new Set(drafts.map((draft) => canonicalTmdbId(draft?.editable?.tmdbId)));
	if (personIds.size !== 1) {
		errors.push(diagnostic("MIXED_PEOPLE_SOURCE_BUNDLE", "$people.sources", "Every source in a People bundle must use one person identity."));
	}
	if (person !== null && (
		!isPositiveSafePersonId(person.id)
		|| canonicalText(person.name) !== person.name
		|| [...personIds][0] !== person.id
	)) {
		errors.push(diagnostic("MISMATCHED_PEOPLE_PERSON", "$people.person", "The source bundle must match the selected canonical person."));
	}
	return { ok: errors.length === 0, errors };
}

export function peopleSourceIdentity(editable) {
	if (!plainObject(editable)) return null;
	const provider = canonicalText(editable.provider).toLowerCase();
	const sourceType = canonicalText(editable.tmdbSourceType).toUpperCase();
	const mediaType = canonicalText(editable.mediaType).toUpperCase();
	const tmdbId = canonicalTmdbId(editable.tmdbId);
	if (
		provider !== "tmdb"
		|| !["PERSON", "DIRECTOR"].includes(sourceType)
		|| !["MOVIE", "TV"].includes(mediaType)
		|| tmdbId === null
	) return null;
	return `tmdb|${sourceType}|${tmdbId}|${mediaType}`;
}

function projectFolders(project) {
	const folders = [];
	for (const collection of project?.collections ?? []) {
		for (const folder of collection.folders ?? []) folders.push({ collection, folder });
	}
	return folders;
}

export function inspectPeopleSourceDuplicates(project, destinationFolderInternalId, drafts) {
	const identities = drafts.map((draft) => peopleSourceIdentity(draft?.editable)).filter(Boolean);
	const selected = new Set(identities);
	const destination = [];
	const elsewhere = [];
	for (const { collection, folder } of projectFolders(project)) {
		for (const source of folder.sources ?? []) {
			const identity = peopleSourceIdentity(source?.editable);
			if (!selected.has(identity)) continue;
			const occurrence = {
				identity,
				collectionInternalId: collection.internalId,
				collectionTitle: canonicalText(collection.editable?.title),
				folderInternalId: folder.internalId,
				folderTitle: canonicalText(folder.editable?.title),
				sourceInternalId: source.internalId,
				sourceTitle: canonicalText(source.editable?.title),
			};
			if (folder.internalId === destinationFolderInternalId) destination.push(occurrence);
			else elsewhere.push(occurrence);
		}
	}
	const destinationIdentities = new Set(destination.map((entry) => entry.identity));
	return Object.freeze({
		identities: Object.freeze([...identities]),
		destination: Object.freeze(destination),
		elsewhere: Object.freeze(elsewhere),
		missingDrafts: Object.freeze(drafts.filter((draft) => !destinationIdentities.has(peopleSourceIdentity(draft.editable)))),
		duplicateDrafts: Object.freeze(drafts.filter((draft) => destinationIdentities.has(peopleSourceIdentity(draft.editable)))),
	});
}

export function peopleDuplicateOverrideIdentity(folderInternalId, drafts) {
	if (typeof folderInternalId !== "string" || !folderInternalId) return null;
	const validation = validatePeopleSourceDrafts(drafts);
	if (!validation.ok) return null;
	return `${folderInternalId}\n${drafts.map((draft) => peopleSourceIdentity(draft.editable)).join("\n")}`;
}

function findCollectionAndFolder(project, folderInternalId) {
	for (const collection of project.collections) {
		const folder = collection.folders.find((entry) => entry.internalId === folderInternalId);
		if (folder) return { collection, folder };
	}
	return null;
}

export function createPeopleSourceBundle(controller, {
	destination,
	person,
	drafts,
	artwork = null,
	duplicateOverrideIdentity = null,
	interactionLocked = false,
} = {}) {
	const validation = validatePeopleSourceDrafts(drafts, { person });
	if (!validation.ok) return { ok: false, errors: validation.errors, warnings: [] };
	if (interactionLocked) {
		return { ok: false, errors: [diagnostic("PEOPLE_CREATION_INTERACTION_LOCKED", "$people.creation", "Finish the current hierarchy interaction before adding People sources.")], warnings: [] };
	}
	if (!plainObject(destination) || destination.kind !== "existing-folder") {
		return { ok: false, errors: [diagnostic("INVALID_PEOPLE_DESTINATION", "$people.destination", "Folder quick add requires the selected existing folder.")], warnings: [] };
	}

	const state = controller.getState();
	const location = findCollectionAndFolder(state.project, destination.folderInternalId);
	if (!location || state.selection.folderInternalId !== location.folder.internalId) {
		return { ok: false, errors: [diagnostic("PEOPLE_FOLDER_UNAVAILABLE", "$people.destination.folder", "The selected destination folder is no longer available.")], warnings: [] };
	}
	const promotableFolder = isPromotablePeopleFolder(location.folder);
	const promotedFolderEditable = promotableFolder
		? buildPromotedPeopleFolderEditable(location.folder, person, artwork)
		: null;
	if (promotableFolder && promotedFolderEditable === null) {
		return { ok: false, errors: [diagnostic("PEOPLE_PROMOTION_ARTWORK_REQUIRED", "$people.destination.folder", "The new People folder artwork must be prepared before adding sources.")], warnings: [] };
	}
	const duplicateReview = inspectPeopleSourceDuplicates(state.project, location.folder.internalId, drafts);
	const override = peopleDuplicateOverrideIdentity(location.folder.internalId, drafts);
	const addAll = duplicateReview.duplicateDrafts.length > 0 && duplicateOverrideIdentity === override;
	const draftsToAdd = addAll ? drafts : duplicateReview.missingDrafts;
	if (draftsToAdd.length === 0) {
		return {
			ok: false,
			requiresDuplicateOverride: true,
			duplicateReview,
			errors: [diagnostic("NO_MISSING_PEOPLE_SOURCES", "$people.sources", "Every selected source already exists in this folder.")],
			warnings: [],
		};
	}
	const result = controller.addSourcesToFolder(location.folder.internalId, {
		...(promotedFolderEditable === null ? {} : { folder: { editable: promotedFolderEditable } }),
		sources: draftsToAdd.map((draft) => ({ category: draft.category, editable: draft.editable })),
	});
	return result.ok ? {
		...result,
		addedSourceCount: draftsToAdd.length,
		promotedFolder: promotedFolderEditable !== null,
		duplicateReview,
		usedDuplicateOverride: addAll,
	} : result;
}

export function createPeopleFolderBatch(controller, {
	collectionInternalId,
	people,
	interactionLocked = false,
} = {}) {
	if (interactionLocked) {
		return { ok: false, errors: [diagnostic("PEOPLE_CREATION_INTERACTION_LOCKED", "$people.creation", "Finish the current hierarchy interaction before adding people.")], warnings: [] };
	}
	if (!Array.isArray(people) || people.length < 1) {
		return { ok: false, errors: [diagnostic("INVALID_PEOPLE_BATCH", "$people.batch", "Choose at least one person.")], warnings: [] };
	}
	const personIds = people.map((entry) => entry?.person?.id);
	if (personIds.some((id) => !isPositiveSafePersonId(id)) || new Set(personIds).size !== personIds.length) {
		return { ok: false, errors: [diagnostic("DUPLICATE_PEOPLE_BATCH_PERSON", "$people.batch", "Each selected person must appear once in the batch.")], warnings: [] };
	}
	for (let index = 0; index < people.length; index += 1) {
		const entry = people[index];
		const validation = validatePeopleSourceDrafts(entry?.drafts, { person: entry?.person });
		if (!validation.ok) return { ok: false, errors: validation.errors, warnings: [] };
		if (
			!plainObject(entry.folderEditable)
			|| entry.folderEditable.title !== entry.person.name
			|| entry.folderEditable.tileShape !== "POSTER"
		) {
			return { ok: false, errors: [diagnostic("INVALID_PEOPLE_BATCH_FOLDER", `$people.batch[${index}].folder`, "Each People folder must use the canonical person name and Poster shape.")], warnings: [] };
		}
	}

	const state = controller.getState();
	const collection = state.project.collections.find((entry) => entry.internalId === collectionInternalId);
	if (!collection || state.selection.collectionInternalId !== collectionInternalId) {
		return { ok: false, errors: [diagnostic("PEOPLE_COLLECTION_UNAVAILABLE", "$people.collection", "The selected collection is no longer available.")], warnings: [] };
	}
	const result = controller.createFoldersWithSources(collectionInternalId, {
		bundles: people.map((entry) => ({
			folder: { editable: entry.folderEditable },
			sources: entry.drafts.map((draft) => ({ category: draft.category, editable: draft.editable })),
		})),
	});
	return result.ok ? {
		...result,
		addedFolderCount: people.length,
		addedSourceCount: people.reduce((total, entry) => total + entry.drafts.length, 0),
	} : result;
}
