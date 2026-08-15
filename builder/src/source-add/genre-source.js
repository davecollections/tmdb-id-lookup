import {
	buildDiscoverSourceDraft,
	DEFAULT_DISCOVER_SORT_OPTION_ID,
	DISCOVER_SORT_OPTIONS,
	discoverSourceIdentity,
	discoverSourceNodeIdentity,
} from "../nuvio/discover.js";
import { compileGenreAdvancedFilters, emptyGenreAdvancedState } from "./genre-advanced.js";
import { GENRE_CONCEPTS, OFFICIAL_GENRE_REFERENCES, officialGenreConcept } from "./genre-catalogue.js";
import { buildGenreFolderEditable } from "./genre-folder-artwork.js";

export const GENRE_MEDIA_CHOICES = Object.freeze([
	Object.freeze({ id: "movies", label: "Movies", mediaTypes: Object.freeze(["MOVIE"]) }),
	Object.freeze({ id: "series", label: "Series", mediaTypes: Object.freeze(["TV"]) }),
	Object.freeze({ id: "both", label: "Both", mediaTypes: Object.freeze(["MOVIE", "TV"]) }),
]);

export const GENRE_DESTINATION_MODES = Object.freeze([
	Object.freeze({ id: "current-folder", label: "Add all to this folder" }),
	Object.freeze({ id: "genre-folders", label: "One folder per genre" }),
]);

export const GENRE_SORT_OPTIONS = Object.freeze(DISCOVER_SORT_OPTIONS.map((option) => Object.freeze({
	id: option.id,
	label: option.label === "Top rated" ? "Top Rated" : option.label === "Most voted" ? "Most Votes" : option.label,
	description: option.id === "popular"
		? "Popular titles first."
		: option.id === "recent"
			? "Recently released titles first."
			: option.id === "top-rated"
				? "Highest-rated titles first."
				: "Titles with the most votes first.",
})));

export const DEFAULT_GENRE_SORT_OPTION_ID = DEFAULT_DISCOVER_SORT_OPTION_ID;
export const DEFAULT_SHARED_GENRE_MEDIA_CHOICE = "both";
export const DEFAULT_GENRE_DESTINATION_MODE = "current-folder";
export const GENRE_CATALOGUE_SIZE = GENRE_CONCEPTS.length;
export const GENRE_PHYSICAL_SOURCE_LIMIT = OFFICIAL_GENRE_REFERENCES.length;

const PRISTINE_UNTITLED_FOLDER_EDITABLE_KEYS = Object.freeze(["hideTitle", "id", "tileShape", "title"]);

function plainObject(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function diagnostic(code, path, message) {
	return Object.freeze({ code, path, message });
}

function sameKeys(value, expected) {
	return plainObject(value)
		&& Object.keys(value).sort().join("\u0000") === [...expected].sort().join("\u0000");
}

export function isPristineGeneratedUntitledFolder(folder) {
	const editable = folder?.editable;
	return folder?.nodeType === "folder"
		&& typeof folder.internalId === "string"
		&& folder.internalId.length > 0
		&& !Object.hasOwn(folder, "rawImported")
		&& Array.isArray(folder.sources)
		&& folder.sources.length === 0
		&& sameKeys(editable, PRISTINE_UNTITLED_FOLDER_EDITABLE_KEYS)
		&& typeof editable.id === "string"
		&& editable.id.trim() === editable.id
		&& editable.id.length > 0
		&& editable.title === "Untitled Folder"
		&& editable.tileShape === "POSTER"
		&& editable.hideTitle === true;
}

function canonicalConcepts(values) {
	if (!Array.isArray(values) || values.length < 1) return null;
	const names = values.map((entry) => typeof entry === "string" ? entry : entry?.name);
	if (new Set(names).size !== names.length) return null;
	const concepts = names.map((name) => officialGenreConcept(name));
	return concepts.some((concept) => concept === null) ? null : concepts;
}

export function genreMediaSupport(genre) {
	const concept = officialGenreConcept(typeof genre === "string" ? genre : genre?.name);
	return Object.freeze({
		movies: concept?.movieId !== null && concept?.movieId !== undefined,
		series: concept?.tvId !== null && concept?.tvId !== undefined,
		both: concept?.shared === true,
	});
}

export function defaultGenreMediaChoice(genre) {
	const support = genreMediaSupport(genre);
	return support.both ? "both" : support.movies ? "movies" : support.series ? "series" : null;
}

export function genreSourceTitle(genreName, mediaType) {
	const concept = officialGenreConcept(genreName);
	if (concept === null) return null;
	return mediaType === "MOVIE"
		? `${concept.name} Movies`
		: mediaType === "TV"
			? `${concept.name} Series`
			: null;
}

function mediaTypesFor(concept, sharedMediaChoice) {
	if (!concept.shared) return Object.freeze([concept.movieId !== null ? "MOVIE" : "TV"]);
	return GENRE_MEDIA_CHOICES.find((entry) => entry.id === sharedMediaChoice)?.mediaTypes ?? null;
}

export function buildGenreSourceDrafts(genres, {
	sharedMediaChoice = DEFAULT_SHARED_GENRE_MEDIA_CHOICE,
	sortOptionId = DEFAULT_GENRE_SORT_OPTION_ID,
	advanced = emptyGenreAdvancedState(),
} = {}) {
	const concepts = canonicalConcepts(genres);
	const errors = [];
	if (concepts === null) errors.push(diagnostic("INVALID_GENRE_SELECTION", "$genres.selection", "Choose at least one official Genre without repeats."));
	if (!GENRE_MEDIA_CHOICES.some((entry) => entry.id === sharedMediaChoice)) errors.push(diagnostic("INVALID_GENRE_MEDIA", "$genres.sharedMediaChoice", "Choose an available media option for Genres available as both Movies and Series."));
	if (!GENRE_SORT_OPTIONS.some((option) => option.id === sortOptionId)) errors.push(diagnostic("INVALID_GENRE_SORT", "$genres.sortOptionId", "Choose a supported Genre sort order."));
	if (errors.length > 0) return Object.freeze({ ok: false, drafts: Object.freeze([]), errors: Object.freeze(errors) });

	const drafts = [];
	for (const concept of concepts) {
		const mediaTypes = mediaTypesFor(concept, sharedMediaChoice);
		for (const mediaType of mediaTypes ?? []) {
			const tmdbId = mediaType === "MOVIE" ? concept.movieId : concept.tvId;
			const compiled = compileGenreAdvancedFilters(advanced, {
				mediaType,
				includedGenre: concept.name,
				includedGenres: concepts,
				sharedMediaChoice,
			});
			if (!compiled.ok) {
				errors.push(...compiled.errors);
				continue;
			}
			const built = buildDiscoverSourceDraft({
				title: genreSourceTitle(concept.name, mediaType),
				mediaType,
				sortOptionId,
				filters: { withGenres: String(tmdbId), ...compiled.filters },
			});
			if (!built.ok) errors.push(...built.errors);
			else drafts.push(Object.freeze(built.draft));
		}
	}
	return Object.freeze({
		ok: errors.length === 0,
		drafts: Object.freeze(errors.length === 0 ? drafts : []),
		errors: Object.freeze(errors),
	});
}

export function validateGenreSourceDrafts(drafts, options = {}) {
	const expected = buildGenreSourceDrafts(options.genres, options);
	if (!expected.ok) return Object.freeze({ ok: false, errors: expected.errors });
	if (!Array.isArray(drafts) || drafts.length !== expected.drafts.length) {
		return Object.freeze({ ok: false, errors: Object.freeze([
			diagnostic("INVALID_GENRE_SOURCE_BUNDLE", "$genres.sources", "The Genre source bundle must contain every configured media candidate."),
		]) });
	}
	const errors = [];
	for (const [index, draft] of drafts.entries()) {
		const editable = draft?.editable;
		const expectedEditable = expected.drafts[index].editable;
		const identity = discoverSourceIdentity(editable);
		if (
			!plainObject(draft)
			|| !sameKeys(draft, ["category", "editable"])
			|| draft.category !== "native-tmdb"
			|| !plainObject(editable)
			|| !sameKeys(editable, ["title", "sortBy", "tmdbId", "filters", "provider", "mediaType", "tmdbSourceType"])
			|| !identity.comparable
			|| JSON.stringify(editable) !== JSON.stringify(expectedEditable)
		) errors.push(diagnostic("INVALID_GENRE_SOURCE_DRAFT", `$genres.sources[${index}]`, "The Genre source must match the reviewed official identity and DISCOVER contract."));
	}
	return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors) });
}

export function groupGenreSourceDrafts(genres, drafts, sharedMediaChoice = DEFAULT_SHARED_GENRE_MEDIA_CHOICE) {
	const concepts = canonicalConcepts(genres);
	if (concepts === null || !Array.isArray(drafts)) return Object.freeze([]);
	let offset = 0;
	const groups = concepts.map((concept) => {
		const count = mediaTypesFor(concept, sharedMediaChoice)?.length ?? 0;
		const groupDrafts = drafts.slice(offset, offset + count);
		offset += count;
		return Object.freeze({ concept, drafts: Object.freeze(groupDrafts) });
	});
	return offset === drafts.length ? Object.freeze(groups) : Object.freeze([]);
}

function sourceOccurrences(project, selectedIdentities) {
	const identities = new Set(selectedIdentities);
	const occurrences = [];
	for (const collection of project?.collections ?? []) {
		for (const folder of collection.folders ?? []) {
			for (const source of folder.sources ?? []) {
				const identity = discoverSourceNodeIdentity(source);
				if (!identity.comparable || !identities.has(identity.key)) continue;
				occurrences.push(Object.freeze({
					identity: identity.key,
					collectionInternalId: collection.internalId,
					collectionTitle: typeof collection.editable?.title === "string" ? collection.editable.title.trim() : "",
					folderInternalId: folder.internalId,
					folderTitle: typeof folder.editable?.title === "string" ? folder.editable.title.trim() : "",
					sourceInternalId: source.internalId,
					sourceTitle: typeof source.editable?.title === "string" ? source.editable.title.trim() : "",
				}));
			}
		}
	}
	return occurrences;
}

function draftIdentities(drafts) {
	return (drafts ?? []).map((draft) => discoverSourceIdentity(draft?.editable)).filter((identity) => identity.comparable);
}

export function inspectGenreSourceDuplicates(project, destinationFolderInternalId, drafts) {
	const identities = draftIdentities(drafts);
	const occurrences = sourceOccurrences(project, identities.map((entry) => entry.key));
	const destination = occurrences.filter((entry) => entry.folderInternalId === destinationFolderInternalId);
	const elsewhere = occurrences.filter((entry) => entry.folderInternalId !== destinationFolderInternalId);
	const destinationIdentities = new Set(destination.map((entry) => entry.identity));
	const elsewhereIdentities = new Set(elsewhere.map((entry) => entry.identity));
	return Object.freeze({
		destination: Object.freeze(destination),
		elsewhere: Object.freeze(elsewhere),
		missingDrafts: Object.freeze((drafts ?? []).filter((draft) => !destinationIdentities.has(discoverSourceIdentity(draft.editable).key))),
		duplicateDrafts: Object.freeze((drafts ?? []).filter((draft) => destinationIdentities.has(discoverSourceIdentity(draft.editable).key))),
		elsewhereDrafts: Object.freeze((drafts ?? []).filter((draft) => {
			const identity = discoverSourceIdentity(draft.editable).key;
			return !destinationIdentities.has(identity) && elsewhereIdentities.has(identity);
		})),
	});
}

export function inspectGenreFolderPlan(project, collectionInternalId, genres, drafts, sharedMediaChoice = DEFAULT_SHARED_GENRE_MEDIA_CHOICE) {
	const groups = groupGenreSourceDrafts(genres, drafts, sharedMediaChoice);
	const allIdentities = draftIdentities(drafts).map((entry) => entry.key);
	const occurrences = sourceOccurrences(project, allIdentities);
	const plannedGroups = groups.map((group) => {
		const identities = draftIdentities(group.drafts).map((entry) => entry.key);
		const identitySet = new Set(identities);
		const inCollection = occurrences.filter((entry) => entry.collectionInternalId === collectionInternalId && identitySet.has(entry.identity));
		const elsewhere = occurrences.filter((entry) => entry.collectionInternalId !== collectionInternalId && identitySet.has(entry.identity));
		const found = new Set(inCollection.map((entry) => entry.identity));
		const status = found.size === 0 ? "ready" : found.size === identities.length ? "already-exists" : "partly-exists";
		return Object.freeze({
			...group,
			identities: Object.freeze(identities),
			folderEditable: buildGenreFolderEditable(group.concept.name),
			status,
			inCollection: Object.freeze(inCollection),
			elsewhere: Object.freeze(elsewhere),
		});
	});
	return Object.freeze({
		groups: Object.freeze(plannedGroups),
		readyGroups: Object.freeze(plannedGroups.filter((group) => group.status === "ready")),
		alreadyExistingGroups: Object.freeze(plannedGroups.filter((group) => group.status === "already-exists")),
		partialGroups: Object.freeze(plannedGroups.filter((group) => group.status === "partly-exists")),
		elsewhere: Object.freeze(plannedGroups.flatMap((group) => group.elsewhere)),
	});
}

export function genreDuplicateOverrideIdentity(folderInternalId, drafts) {
	if (typeof folderInternalId !== "string" || !folderInternalId) return null;
	const identities = draftIdentities(drafts);
	if (identities.length !== drafts?.length) return null;
	return `${folderInternalId}\n${identities.map((entry) => entry.key).join("\n")}`;
}

function findCollectionAndFolder(project, folderInternalId) {
	for (const collection of project?.collections ?? []) {
		const folder = collection.folders.find((entry) => entry.internalId === folderInternalId);
		if (folder) return { collection, folder };
	}
	return null;
}

export function createGenreSourceBundle(controller, {
	folderInternalId,
	genres,
	sharedMediaChoice = DEFAULT_SHARED_GENRE_MEDIA_CHOICE,
	sortOptionId = DEFAULT_GENRE_SORT_OPTION_ID,
	advanced = emptyGenreAdvancedState(),
	destinationMode = DEFAULT_GENRE_DESTINATION_MODE,
	drafts,
	duplicateOverrideIdentity = null,
	interactionLocked = false,
} = {}) {
	const options = { genres, sharedMediaChoice, sortOptionId, advanced };
	const validation = validateGenreSourceDrafts(drafts, options);
	if (!validation.ok) return { ok: false, errors: validation.errors, warnings: [] };
	if (!GENRE_DESTINATION_MODES.some((entry) => entry.id === destinationMode)) return { ok: false, errors: [diagnostic("INVALID_GENRE_DESTINATION", "$genres.destination", "Choose where the Genre sources should be added.")], warnings: [] };
	if (canonicalConcepts(genres)?.length === 1 && destinationMode !== DEFAULT_GENRE_DESTINATION_MODE) {
		return { ok: false, errors: [diagnostic("SINGLE_GENRE_DESTINATION", "$genres.destination", "One selected Genre must be added to the current folder.")], warnings: [] };
	}
	if (interactionLocked) return { ok: false, errors: [diagnostic("GENRE_CREATION_INTERACTION_LOCKED", "$genres.creation", "Finish the current hierarchy interaction before adding Genre sources.")], warnings: [] };
	const state = controller.getState();
	const location = findCollectionAndFolder(state.project, folderInternalId);
	if (!location || state.selection.folderInternalId !== folderInternalId) {
		return { ok: false, errors: [diagnostic("GENRE_FOLDER_UNAVAILABLE", "$genres.destination", "The selected destination folder is no longer available.")], warnings: [] };
	}

	if (destinationMode === "genre-folders") {
		const folderPlan = inspectGenreFolderPlan(state.project, location.collection.internalId, genres, drafts, sharedMediaChoice);
		if (folderPlan.readyGroups.length === 0) {
			return { ok: false, folderPlan, errors: [diagnostic("NO_NEW_GENRE_FOLDERS", "$genres.folders", "No new Genre folders are ready to create in this collection.")], warnings: [] };
		}
		const result = controller.createFoldersWithSources(location.collection.internalId, {
			bundles: folderPlan.readyGroups.map((group) => ({
				folder: { editable: group.folderEditable },
				sources: group.drafts.map((draft) => ({ category: draft.category, editable: draft.editable })),
			})),
			...(isPristineGeneratedUntitledFolder(location.folder)
				? { replaceEmptyFolderInternalId: location.folder.internalId }
				: {}),
		});
		return result.ok ? {
			...result,
			addedFolderCount: folderPlan.readyGroups.length,
			addedSourceCount: folderPlan.readyGroups.reduce((count, group) => count + group.drafts.length, 0),
			folderPlan,
		} : result;
	}

	const duplicateReview = inspectGenreSourceDuplicates(state.project, folderInternalId, drafts);
	const override = genreDuplicateOverrideIdentity(folderInternalId, drafts);
	const addAll = duplicateReview.duplicateDrafts.length > 0 && duplicateOverrideIdentity === override;
	const draftsToAdd = addAll ? drafts : duplicateReview.missingDrafts;
	if (draftsToAdd.length === 0) {
		return {
			ok: false,
			requiresDuplicateOverride: true,
			duplicateReview,
			errors: [diagnostic("GENRE_SOURCES_ALREADY_EXIST", "$genres.sources", "Every configured Genre source already exists in this folder.")],
			warnings: [],
		};
	}
	const result = controller.addSourcesToFolder(folderInternalId, {
		sources: draftsToAdd.map((draft) => ({ category: draft.category, editable: draft.editable })),
	});
	return result.ok ? {
		...result,
		addedSourceCount: draftsToAdd.length,
		duplicateReview,
		duplicateOverrideUsed: addAll,
	} : result;
}
