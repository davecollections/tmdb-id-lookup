import { isInvisibleNuvioTitle, NUVIO_INVISIBLE_TITLE } from "../nuvio/titles.js";
import { createGenreAdvancedState, emptyGenreAdvancedState } from "./genre-advanced.js";
import { officialGenreConcept } from "./genre-catalogue.js";
import { DEFAULT_GENRE_ARTWORK_SHAPE, GENRE_ARTWORK_SHAPES } from "./genre-folder-artwork.js";
import { normalizeHierarchyShowAllTab } from "./hierarchy-presentation.js";
import {
	buildGenreHierarchyStructure,
	DEFAULT_GENRE_HIERARCHY_COLLECTION_TITLES,
	DEFAULT_GENRE_HIERARCHY_STRUCTURE,
	GENRE_HIERARCHY_STRUCTURES,
	normalizeGenreCompositePlacements,
} from "./genre-hierarchy-structures.js";
import {
	buildGenreSourceDrafts,
	DEFAULT_GENRE_SORT_OPTION_ID,
	DEFAULT_SHARED_GENRE_MEDIA_CHOICE,
	GENRE_SOURCE_TITLE_MODES,
	validateGenreSourceDrafts,
} from "./genre-source.js";

export const GENRE_HIERARCHY_PLAN_TYPE = "genre-hierarchy-plan";
export const GENRE_HIERARCHY_CREATION_SCOPES = Object.freeze(["new-collection", "new-folder"]);
export const GENRE_HIERARCHY_PLACEMENT_STATUSES = Object.freeze({
	READY: "ready-to-create",
	ALREADY_IN_COLLECTION: "already-in-this-collection",
	PARTLY_IN_COLLECTION: "partly-in-this-collection",
	EXISTS_ELSEWHERE: "exists-elsewhere",
});
export const DEFAULT_GENRE_HIERARCHY_COLLECTION_TITLE = "Genres";
export const DEFAULT_GENRE_HIERARCHY_FOLDER_TITLE_VISIBILITY = "HIDE_HOME_SCREEN";

const OPTION_KEYS = new Set([
	"scope",
	"projectRevision",
	"destinationCollectionInternalId",
	"collectionTitle",
	"collectionTitles",
	"hideCollectionTitle",
	"viewMode",
	"showAllTab",
	"pinToTop",
	"folderTitleVisibility",
	"folderTileShape",
	"structure",
	"compositePlacements",
	"genres",
	"sharedMediaChoice",
	"sortOptionId",
	"advanced",
]);
const COLLECTION_VIEW_MODES = new Set(["TABBED_GRID", "ROWS"]);
const FOLDER_TITLE_VISIBILITIES = new Set(["SHOW_EVERYWHERE", "HIDE_HOME_SCREEN", "HIDE_EVERYWHERE"]);
const FOLDER_TILE_SHAPES = new Set(GENRE_ARTWORK_SHAPES);
const STRUCTURE_IDS = new Set(GENRE_HIERARCHY_STRUCTURES.map((entry) => entry.id));

function plainObject(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function diagnostic(code, path, message) {
	return Object.freeze({ code, path, message });
}

function canonicalText(value) {
	return typeof value === "string" ? value.trim() : "";
}

function canonicalGenreNames(values, errors) {
	if (!Array.isArray(values) || values.length < 1) {
		errors.push(diagnostic("GENRE_HIERARCHY_SELECTION_REQUIRED", "$genreHierarchy.genres", "Choose at least one official Genre."));
		return Object.freeze([]);
	}
	const names = values.map((value) => typeof value === "string" ? value : value?.name);
	if (new Set(names).size !== names.length || names.some((name) => officialGenreConcept(name) === null)) {
		errors.push(diagnostic("INVALID_GENRE_HIERARCHY_SELECTION", "$genreHierarchy.genres", "Choose each official Genre at most once."));
		return Object.freeze([]);
	}
	return Object.freeze(names);
}

function titleCollisions(project, title) {
	return Object.freeze((project.collections ?? [])
		.filter((collection) => collection.editable?.title === title)
		.map((collection) => Object.freeze({ collectionInternalId: collection.internalId, collectionTitle: title })));
}

function normalizeCollectionTitles(value, errors, visibleTitlesRequired = true) {
	const supplied = value ?? DEFAULT_GENRE_HIERARCHY_COLLECTION_TITLES;
	if (!plainObject(supplied) || Object.keys(supplied).some((key) => !["movies", "series"].includes(key))) {
		errors.push(diagnostic("INVALID_GENRE_HIERARCHY_COLLECTION_TITLES", "$genreHierarchy.collectionTitles", "Separate collections require Movie and Series collection names."));
		return Object.freeze({});
	}
	const titles = {};
	for (const role of ["movies", "series"]) {
		const title = Object.hasOwn(supplied, role) ? supplied[role] : DEFAULT_GENRE_HIERARCHY_COLLECTION_TITLES[role];
		if (typeof title !== "string" || (visibleTitlesRequired && (!title.trim() || title !== title.trim()))) {
			errors.push(diagnostic("INVALID_GENRE_HIERARCHY_COLLECTION_TITLE", `$genreHierarchy.collectionTitles.${role}`, "Collection names must be nonblank trimmed strings."));
		} else titles[role] = title;
	}
	return Object.freeze(titles);
}

function collectionEditable(title, { hideCollectionTitle, pinToTop, viewMode, showAllTab }) {
	return Object.freeze({
		title: hideCollectionTitle ? NUVIO_INVISIBLE_TITLE : title,
		pinToTop,
		focusGlowEnabled: true,
		viewMode,
		showAllTab,
	});
}

function deriveCounts(collections, folders) {
	const createdFolders = [...collections.flatMap((collection) => collection.folders), ...folders];
	return Object.freeze({
		collectionCount: collections.length,
		folderCount: createdFolders.length,
		sourceCount: createdFolders.reduce((total, folder) => total + folder.sources.length, 0),
	});
}

export function createGenreHierarchyPlan(project, options) {
	const errors = [];
	if (!plainObject(project) || project.nodeType !== "project" || !Array.isArray(project.collections)) {
		errors.push(diagnostic("INVALID_GENRE_HIERARCHY_PROJECT", "$genreHierarchy.project", "Genre hierarchy planning requires the current Builder project."));
	}
	if (!plainObject(options) || Object.keys(options).some((key) => !OPTION_KEYS.has(key))) {
		errors.push(diagnostic("INVALID_GENRE_HIERARCHY_OPTIONS", "$genreHierarchy", "Genre hierarchy planning received an unsupported option."));
	}
	if (errors.length > 0) return Object.freeze({ ok: false, plan: null, errors: Object.freeze(errors) });
	if (!Number.isSafeInteger(options.projectRevision) || options.projectRevision < 0) {
		errors.push(diagnostic("INVALID_GENRE_HIERARCHY_REVISION", "$genreHierarchy.projectRevision", "Capture the current nonnegative Builder revision."));
	}
	const scope = GENRE_HIERARCHY_CREATION_SCOPES.includes(options.scope) ? options.scope : null;
	if (scope === null) errors.push(diagnostic("INVALID_GENRE_HIERARCHY_SCOPE", "$genreHierarchy.scope", "Choose New Collection or New Folder scope."));
	const genres = canonicalGenreNames(options.genres, errors);
	const sharedMediaChoice = options.sharedMediaChoice ?? DEFAULT_SHARED_GENRE_MEDIA_CHOICE;
	const sortOptionId = options.sortOptionId ?? DEFAULT_GENRE_SORT_OPTION_ID;
	const advanced = createGenreAdvancedState(options.advanced ?? emptyGenreAdvancedState());
	const structure = options.structure ?? DEFAULT_GENRE_HIERARCHY_STRUCTURE;
	let folderTitleVisibility = options.folderTitleVisibility
		?? (structure === "media-folders" || structure === "separate-media-genre-folders" ? "SHOW_EVERYWHERE" : DEFAULT_GENRE_HIERARCHY_FOLDER_TITLE_VISIBILITY);
	const folderTileShape = options.folderTileShape ?? DEFAULT_GENRE_ARTWORK_SHAPE;
	if (!STRUCTURE_IDS.has(structure)) {
		errors.push(diagnostic("INVALID_GENRE_HIERARCHY_STRUCTURE", "$genreHierarchy.structure", "Choose an available Genre hierarchy structure."));
	}
	if (!FOLDER_TITLE_VISIBILITIES.has(folderTitleVisibility)) {
		errors.push(diagnostic("INVALID_GENRE_HIERARCHY_FOLDER_TITLE_VISIBILITY", "$genreHierarchy.folderTitleVisibility", "Choose an existing folder-title visibility outcome."));
	}
	if (!FOLDER_TILE_SHAPES.has(folderTileShape)) {
		errors.push(diagnostic("INVALID_GENRE_HIERARCHY_FOLDER_TILE_SHAPE", "$genreHierarchy.folderTileShape", "Choose Poster or Landscape Genre artwork."));
	}
	if (structure === "media-folders") folderTitleVisibility = "SHOW_EVERYWHERE";

	let collectionTitle = null;
	let collectionTitles = Object.freeze({});
	let hideCollectionTitle = null;
	let viewMode = null;
	let showAllTab = null;
	let pinToTop = null;
	let destinationCollection = null;
	if (scope === "new-collection") {
		hideCollectionTitle = options.hideCollectionTitle ?? false;
		viewMode = options.viewMode ?? "TABBED_GRID";
		const requestedShowAllTab = options.showAllTab ?? true;
		pinToTop = options.pinToTop ?? false;
		if (structure === "separate-media-collections") {
			collectionTitles = normalizeCollectionTitles(options.collectionTitles, errors, hideCollectionTitle !== true);
			if (options.collectionTitle !== undefined && options.collectionTitle !== null) errors.push(diagnostic("UNEXPECTED_GENRE_HIERARCHY_COLLECTION_TITLE", "$genreHierarchy.collectionTitle", "Separate collections use Movie and Series collection names."));
		} else {
			collectionTitle = options.collectionTitle ?? DEFAULT_GENRE_HIERARCHY_COLLECTION_TITLE;
			if (typeof collectionTitle !== "string" || (hideCollectionTitle !== true && (!collectionTitle.trim() || collectionTitle !== collectionTitle.trim()))) errors.push(diagnostic("INVALID_GENRE_HIERARCHY_COLLECTION_TITLE", "$genreHierarchy.collectionTitle", "The Genres collection name must be a nonblank trimmed string."));
			if (options.collectionTitles !== undefined && Object.keys(options.collectionTitles ?? {}).length > 0) errors.push(diagnostic("UNEXPECTED_GENRE_HIERARCHY_COLLECTION_TITLES", "$genreHierarchy.collectionTitles", "This structure creates one collection."));
		}
		if (typeof hideCollectionTitle !== "boolean") errors.push(diagnostic("INVALID_GENRE_HIERARCHY_COLLECTION_TITLE_VISIBILITY", "$genreHierarchy.hideCollectionTitle", "Collection title visibility must be true or false."));
		if (!COLLECTION_VIEW_MODES.has(viewMode)) errors.push(diagnostic("INVALID_GENRE_HIERARCHY_COLLECTION_VIEW", "$genreHierarchy.viewMode", "Choose the existing Tabs or Rows layout."));
		if (typeof requestedShowAllTab !== "boolean" || typeof pinToTop !== "boolean") errors.push(diagnostic("INVALID_GENRE_HIERARCHY_COLLECTION_OPTIONS", "$genreHierarchy", "Collection options must use explicit boolean values."));
		showAllTab = normalizeHierarchyShowAllTab(viewMode, requestedShowAllTab);
		if (options.destinationCollectionInternalId !== undefined && options.destinationCollectionInternalId !== null) errors.push(diagnostic("UNEXPECTED_GENRE_HIERARCHY_DESTINATION", "$genreHierarchy.destinationCollectionInternalId", "New Collection scope does not target an existing collection."));
	} else if (scope === "new-folder") {
		destinationCollection = project.collections.find((collection) => collection.internalId === options.destinationCollectionInternalId) ?? null;
		if (destinationCollection === null) errors.push(diagnostic("GENRE_HIERARCHY_DESTINATION_NOT_FOUND", "$genreHierarchy.destinationCollectionInternalId", "The captured destination collection no longer exists."));
		for (const key of ["collectionTitle", "collectionTitles", "hideCollectionTitle", "viewMode", "showAllTab", "pinToTop"]) {
			if (options[key] !== undefined && options[key] !== null && (key !== "collectionTitles" || Object.keys(options[key] ?? {}).length > 0)) errors.push(diagnostic("UNEXPECTED_GENRE_HIERARCHY_COLLECTION_OPTION", `$genreHierarchy.${key}`, "New Folder scope inherits the selected parent collection presentation."));
		}
	}

	const sourceOptions = {
		genres,
		sharedMediaChoice,
		sortOptionId,
		advanced,
		titleMode: GENRE_SOURCE_TITLE_MODES.HIERARCHY,
	};
	const built = buildGenreSourceDrafts(genres, sourceOptions);
	if (!built.ok) errors.push(...built.errors);
	else {
		const validation = validateGenreSourceDrafts(built.drafts, sourceOptions);
		if (!validation.ok) errors.push(...validation.errors);
	}
	const effectiveMedia = built.ok ? Object.freeze([...new Set(built.drafts.map((draft) => draft.editable.mediaType))]) : Object.freeze([]);
	if (structure === "separate-media-collections" && (scope !== "new-collection" || effectiveMedia.length !== 2)) {
		errors.push(diagnostic("UNAVAILABLE_GENRE_HIERARCHY_STRUCTURE", "$genreHierarchy.structure", "Separate Movie & Series collections require New Collection and effective sources for both media."));
	}
	if (errors.length > 0) return Object.freeze({ ok: false, plan: null, errors: Object.freeze(errors) });

	const compositePlacements = normalizeGenreCompositePlacements(project, {
		scope,
		destinationCollectionInternalId: destinationCollection?.internalId ?? null,
		structure,
		compositePlacements: options.compositePlacements,
		genres,
		drafts: built.drafts,
		sharedMediaChoice,
	}, errors);
	if (errors.length > 0) return Object.freeze({ ok: false, plan: null, errors: Object.freeze(errors) });
	const configuration = Object.freeze({
		scope,
		structure,
		collectionTitle,
		collectionTitles,
		hideCollectionTitle,
		viewMode,
		showAllTab,
		pinToTop,
		folderTitleVisibility,
		folderTileShape,
		genres,
		sharedMediaChoice,
		sortOptionId,
		advanced,
		compositePlacements,
		effectiveMedia,
		destinationCollectionInternalId: destinationCollection?.internalId ?? null,
	});
	const hierarchy = buildGenreHierarchyStructure(project, configuration, built.drafts, GENRE_HIERARCHY_PLACEMENT_STATUSES);
	let collections = Object.freeze([]);
	let folders = Object.freeze([]);
	if (scope === "new-collection") {
		if (structure === "separate-media-collections") {
			collections = Object.freeze(["movies", "series"].map((role) => Object.freeze({
				role,
				editable: collectionEditable(collectionTitles[role], configuration),
				titleCollisions: hideCollectionTitle ? Object.freeze([]) : titleCollisions(project, collectionTitles[role]),
				folders: hierarchy.byRole[role].folders,
			})));
		} else {
			collections = Object.freeze([Object.freeze({
				role: "mixed",
				editable: collectionEditable(collectionTitle, configuration),
				titleCollisions: hideCollectionTitle ? Object.freeze([]) : titleCollisions(project, collectionTitle),
				folders: hierarchy.folders,
			})]);
		}
	} else folders = hierarchy.folders;
	const destination = destinationCollection === null ? null : Object.freeze({
		collectionInternalId: destinationCollection.internalId,
		collectionTitle: canonicalText(destinationCollection.editable?.title),
		viewMode: destinationCollection.editable?.viewMode ?? null,
		showAllTab: destinationCollection.editable?.showAllTab ?? null,
		pinToTop: destinationCollection.editable?.pinToTop ?? null,
		titleHidden: isInvisibleNuvioTitle(destinationCollection.editable?.title),
	});
	const plan = Object.freeze({
		planType: GENRE_HIERARCHY_PLAN_TYPE,
		captured: Object.freeze({ projectInternalId: project.internalId, projectRevision: options.projectRevision }),
		configuration,
		destination,
		collections,
		folders,
		outcomes: hierarchy.outcomes,
		counts: deriveCounts(collections, folders),
	});
	return Object.freeze({ ok: true, plan, errors: Object.freeze([]) });
}

function rebuildOptions(plan) {
	return {
		scope: plan.configuration.scope,
		projectRevision: plan.captured.projectRevision,
		...(plan.destination ? { destinationCollectionInternalId: plan.destination.collectionInternalId } : {}),
		...(plan.configuration.scope === "new-collection" ? {
			...(plan.configuration.structure === "separate-media-collections"
				? { collectionTitles: plan.configuration.collectionTitles }
				: { collectionTitle: plan.configuration.collectionTitle }),
			hideCollectionTitle: plan.configuration.hideCollectionTitle,
			viewMode: plan.configuration.viewMode,
			showAllTab: plan.configuration.showAllTab,
			pinToTop: plan.configuration.pinToTop,
		} : {}),
		folderTitleVisibility: plan.configuration.folderTitleVisibility,
		folderTileShape: plan.configuration.folderTileShape,
		structure: plan.configuration.structure,
		compositePlacements: plan.configuration.compositePlacements,
		genres: plan.configuration.genres,
		sharedMediaChoice: plan.configuration.sharedMediaChoice,
		sortOptionId: plan.configuration.sortOptionId,
		advanced: plan.configuration.advanced,
	};
}

function comparablePlan(plan) {
	return JSON.stringify({
		configuration: plan.configuration,
		destination: plan.destination,
		collections: plan.collections,
		folders: plan.folders,
		outcomes: plan.outcomes,
		counts: plan.counts,
	});
}

export function validateGenreHierarchyPlan(plan, { project, projectRevision } = {}) {
	if (!plainObject(plan) || plan.planType !== GENRE_HIERARCHY_PLAN_TYPE || !plainObject(plan.captured) || !plainObject(plan.configuration)) {
		return Object.freeze({ ok: false, stale: false, errors: Object.freeze([diagnostic("INVALID_GENRE_HIERARCHY_PLAN", "$genreHierarchy", "The Genre hierarchy plan is malformed or unsupported.")]) });
	}
	if (!plainObject(project) || project.internalId !== plan.captured.projectInternalId) {
		return Object.freeze({ ok: false, stale: true, errors: Object.freeze([diagnostic("STALE_GENRE_HIERARCHY_PLAN", "$genreHierarchy.captured", "The Builder project changed after this Genre plan was prepared.")]) });
	}
	const rebuilt = createGenreHierarchyPlan(project, rebuildOptions(plan));
	if (!rebuilt.ok || comparablePlan(rebuilt.plan) !== comparablePlan(plan)) {
		const stale = projectRevision !== plan.captured.projectRevision;
		return Object.freeze({ ok: false, stale, errors: Object.freeze([diagnostic(
			stale ? "STALE_GENRE_HIERARCHY_PLAN" : "INVALID_GENRE_HIERARCHY_PLAN",
			"$genreHierarchy",
			stale ? "Genre placement changed. Review a new plan before creating it." : "The Genre hierarchy plan no longer matches its validated configuration.",
		)]) });
	}
	return Object.freeze({ ok: true, stale: false, errors: Object.freeze([]) });
}

export function applyGenreHierarchyPlan(controller, plan) {
	if (!controller || typeof controller.getState !== "function") {
		return Object.freeze({ ok: false, errors: Object.freeze([diagnostic("INVALID_GENRE_HIERARCHY_CONTROLLER", "$genreHierarchy.controller", "A Builder controller is required to apply the Genre hierarchy plan.")]), warnings: Object.freeze([]) });
	}
	const state = controller.getState();
	const validation = validateGenreHierarchyPlan(plan, { project: state.project, projectRevision: state.revision });
	if (!validation.ok) return Object.freeze({ ok: false, stale: validation.stale, errors: validation.errors, warnings: Object.freeze([]) });
	if (plan.counts.folderCount === 0) {
		return Object.freeze({ ok: false, errors: Object.freeze([diagnostic("NO_GENRE_HIERARCHY_FOLDERS_READY", "$genreHierarchy.folders", "No new Genre folders are ready to create here.")]), warnings: Object.freeze([]) });
	}
	const bundlesFor = (folders) => folders.map((folder) => ({
		folder: { editable: folder.editable },
		sources: folder.sources.map((source) => source.draft),
	}));
	const result = plan.configuration.scope === "new-collection"
		? controller.createCollectionsWithFoldersAndSources({ bundles: plan.collections.map((collection) => ({ collection: { editable: collection.editable }, folders: bundlesFor(collection.folders) })) })
		: controller.createFoldersWithSources(plan.destination.collectionInternalId, { bundles: bundlesFor(plan.folders) });
	return result.ok ? { ...result, counts: plan.counts } : result;
}
