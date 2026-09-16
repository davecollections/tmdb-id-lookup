import { freezeNativeGenreOverrides, validateNativeAdvancedDraft } from "./native-shared-advanced.js";
import { orderedSourceSortIds } from "./source-sort-variants.js";
import { inspectNativeHierarchyPlacement, nativeHierarchyCounts, resolveNativeHierarchyPlacements } from "./native-source-variants.js";
import { isInvisibleNuvioTitle, NUVIO_INVISIBLE_TITLE } from "../nuvio/titles.js";
import { normalizeHierarchyShowAllTab } from "./hierarchy-presentation.js";
import { DEFAULT_STUDIO_FOLDER_TILE_SHAPE } from "./studio-folder-artwork.js";
import {
	buildStudioSourceDrafts,
	DEFAULT_STUDIO_SORT_OPTION_ID,
	studioSourceIdentity,
	studioSourceVariantKey,
	STUDIO_SORT_OPTIONS,
	STUDIO_SOURCE_TITLE_MODES,
} from "./studio-source.js";

export const STUDIO_HIERARCHY_PLAN_TYPE = "studio-hierarchy-plan";
export const STUDIO_CREATION_SCOPES = Object.freeze(["new-collection", "new-folder"]);
export const STUDIO_PLACEMENT_STATUSES = Object.freeze({
	READY: "ready-to-create",
	ALREADY_IN_COLLECTION: "already-in-this-collection",
	PARTLY_IN_COLLECTION: "partly-in-this-collection",
	EXISTS_ELSEWHERE: "exists-elsewhere",
});
export const STUDIO_HIERARCHY_MEDIA_MODES = Object.freeze([
	Object.freeze({ id: "movies", label: "Movies", description: "Create Movie sources in every Studio folder.", choices: Object.freeze(["studio-movies"]) }),
	Object.freeze({ id: "series", label: "Series", description: "Create Series sources in every Studio folder.", choices: Object.freeze(["studio-series"]) }),
	Object.freeze({ id: "both", label: "Both", description: "Create Movie and Series sources in every Studio folder.", choices: Object.freeze(["studio-movies", "studio-series"]) }),
]);
export const DEFAULT_STUDIO_HIERARCHY_MEDIA_MODE = "movies";
export const DEFAULT_STUDIO_COLLECTION_TITLE = "Studios";
export const DEFAULT_STUDIO_FOLDER_TITLE_VISIBILITY = "SHOW_EVERYWHERE";

const OPTION_KEYS = new Set([
 "genreOverrides",
	"folderDestinations",
	"scope", "projectRevision", "destinationCollectionInternalId", "collectionTitle",
	"hideCollectionTitle", "viewMode", "showAllTab", "pinToTop", "folderTitleVisibility",
	"mediaMode", "sortOptionId", "sortOptionIds", "studios", "filters",
]);
const COLLECTION_VIEW_MODES = new Set(["TABBED_GRID", "ROWS"]);
const FOLDER_TITLE_VISIBILITIES = new Set(["SHOW_EVERYWHERE", "HIDE_HOME_SCREEN", "HIDE_EVERYWHERE"]);
const ARTWORK_SOURCES = new Set(["runtime", "tmdb-logo", "emoji"]);

function plainObject(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function diagnostic(code, path, message) {
	return Object.freeze({ code, path, message });
}

function canonicalText(value) {
	return typeof value === "string" ? value.trim() : "";
}

function mediaModeById(mediaMode) {
	return STUDIO_HIERARCHY_MEDIA_MODES.find((entry) => entry.id === mediaMode) ?? null;
}

function validArtwork(artwork, studioId) {
	if (
		!plainObject(artwork)
		|| artwork.studioId !== studioId
		|| artwork.tileShape !== DEFAULT_STUDIO_FOLDER_TILE_SHAPE
		|| !ARTWORK_SOURCES.has(artwork.source)
		|| !plainObject(artwork.folderEditable)
	) return false;
	const editable = artwork.folderEditable;
	if (artwork.source === "emoji") return editable.coverImageUrl === "" && editable.coverEmoji === "🎬";
	return typeof editable.coverImageUrl === "string" && /^https:\/\//.test(editable.coverImageUrl);
}

function normalizeStudioEntry(entry, index, { choices, sortOptionIds, filters, genreOverrides }, errors) {
	const studio = entry?.studio;
	const name = canonicalText(studio?.name);
	if (!Number.isSafeInteger(studio?.id) || studio.id < 1 || !name || studio.name !== name) {
		errors.push(diagnostic("INVALID_STUDIO_PLAN_SELECTION", `$studioPlan.studios[${index}].studio`, "Each Studio needs its canonical checked-in Company ID and name."));
		return null;
	}
	if (!validArtwork(entry?.artwork, studio.id)) {
		errors.push(diagnostic("INVALID_STUDIO_PLAN_ARTWORK", `$studioPlan.studios[${index}].artwork`, "Each Studio folder needs resolved Landscape artwork or the approved fallback."));
		return null;
	}
	const sourceResult = buildStudioSourceDrafts(studio, {
		choices,
		sortOptionIds,
		filters, genreOverrides,
		titleMode: STUDIO_SOURCE_TITLE_MODES.HIERARCHY,
	});
	if (!sourceResult.ok) {
		errors.push(...sourceResult.errors);
		return null;
	}
	return Object.freeze({
		studio: Object.freeze({ ...studio }),
		artwork: Object.freeze({ ...entry.artwork, folderEditable: Object.freeze({ ...entry.artwork.folderEditable }) }),
		drafts: Object.freeze(sourceResult.drafts.map((draft) => Object.freeze({ category: draft.category, editable: Object.freeze({ ...draft.editable, filters: Object.freeze({ ...draft.editable.filters }) }) }))),
	});
}

export function inspectStudioHierarchyPlacement(project, drafts, { destinationCollectionInternalId = null } = {}) {
	const placement = inspectNativeHierarchyPlacement(project, drafts, {
		destinationCollectionInternalId, structuralIdentity: studioSourceIdentity, variantKey: studioSourceVariantKey,
	});
	return placement;
}

function titleCollisions(project, title) {
	return Object.freeze((project.collections ?? [])
		.filter((collection) => collection.editable?.title === title)
		.map((collection) => Object.freeze({ collectionInternalId: collection.internalId, collectionTitle: title })));
}

function folderEditable(entry, folderTitleVisibility) {
	return Object.freeze({
		title: folderTitleVisibility === "HIDE_EVERYWHERE" ? NUVIO_INVISIBLE_TITLE : entry.studio.name,
		tileShape: DEFAULT_STUDIO_FOLDER_TILE_SHAPE,
		hideTitle: folderTitleVisibility !== "SHOW_EVERYWHERE",
		...entry.artwork.folderEditable,
	});
}

export function createStudioHierarchyPlan(project, options) {
	const errors = [];
	if (!plainObject(project) || project.nodeType !== "project" || !Array.isArray(project.collections)) errors.push(diagnostic("INVALID_STUDIO_PLAN_PROJECT", "$studioPlan.project", "Studio planning requires the current Builder project."));
	if (!plainObject(options) || Object.keys(options).some((key) => !OPTION_KEYS.has(key))) errors.push(diagnostic("INVALID_STUDIO_PLAN_OPTIONS", "$studioPlan", "Studio hierarchy planning received an unsupported option."));
	if (errors.length > 0) return Object.freeze({ ok: false, plan: null, errors: Object.freeze(errors) });
	if (!Number.isSafeInteger(options.projectRevision) || options.projectRevision < 0) errors.push(diagnostic("INVALID_STUDIO_PLAN_REVISION", "$studioPlan.projectRevision", "Capture the current nonnegative Builder revision."));
	const scope = STUDIO_CREATION_SCOPES.includes(options.scope) ? options.scope : null;
	if (scope === null) errors.push(diagnostic("INVALID_STUDIO_PLAN_SCOPE", "$studioPlan.scope", "Choose New Collection or New Folder scope."));
	const mediaMode = mediaModeById(options.mediaMode ?? DEFAULT_STUDIO_HIERARCHY_MEDIA_MODE);
	if (mediaMode) errors.push(...validateNativeAdvancedDraft(options.filters, mediaMode.id).errors);
	if (mediaMode === null) errors.push(diagnostic("INVALID_STUDIO_PLAN_MEDIA", "$studioPlan.mediaMode", "Choose Movies, Series, or Both."));
	const sortOptionIds = orderedSourceSortIds(options.sortOptionIds, options.sortOptionId ?? DEFAULT_STUDIO_SORT_OPTION_ID, STUDIO_SORT_OPTIONS);
	if (sortOptionIds === null) errors.push(diagnostic("INVALID_STUDIO_PLAN_SORT", "$studioPlan.sortOptionId", "Choose at least one option."));
	if (!Array.isArray(options.studios) || options.studios.length < 1) errors.push(diagnostic("STUDIO_PLAN_SELECTION_REQUIRED", "$studioPlan.studios", "Choose at least one Studio."));
	const entries = Array.isArray(options.studios) && mediaMode !== null
		? options.studios.map((entry, index) => normalizeStudioEntry(entry, index, { choices: mediaMode.choices, sortOptionIds, filters: options.filters, genreOverrides: options.genreOverrides }, errors)).filter(Boolean)
		: [];
	if (new Set(entries.map((entry) => entry.studio.id)).size !== entries.length) errors.push(diagnostic("DUPLICATE_STUDIO_PLAN_SELECTION", "$studioPlan.studios", "Each Studio may appear only once."));
	const folderTitleVisibility = options.folderTitleVisibility ?? DEFAULT_STUDIO_FOLDER_TITLE_VISIBILITY;
	if (!FOLDER_TITLE_VISIBILITIES.has(folderTitleVisibility)) errors.push(diagnostic("INVALID_STUDIO_FOLDER_TITLE_VISIBILITY", "$studioPlan.folderTitleVisibility", "Choose an existing folder-title visibility outcome."));

	let collectionTitle = null;
	let hideCollectionTitle = null;
	let viewMode = null;
	let showAllTab = null;
	let pinToTop = null;
	let destinationCollection = null;
	if (scope === "new-collection") {
		collectionTitle = options.collectionTitle ?? DEFAULT_STUDIO_COLLECTION_TITLE;
		hideCollectionTitle = options.hideCollectionTitle ?? false;
		viewMode = options.viewMode ?? "TABBED_GRID";
		const requestedShowAllTab = options.showAllTab ?? true;
		pinToTop = options.pinToTop ?? false;
		if (typeof collectionTitle !== "string" || (hideCollectionTitle !== true && (!collectionTitle.trim() || collectionTitle !== collectionTitle.trim()))) errors.push(diagnostic("INVALID_STUDIO_COLLECTION_TITLE", "$studioPlan.collectionTitle", "The Studios collection name must be a nonblank trimmed string."));
		if (typeof hideCollectionTitle !== "boolean") errors.push(diagnostic("INVALID_STUDIO_COLLECTION_TITLE_VISIBILITY", "$studioPlan.hideCollectionTitle", "Collection title visibility must be true or false."));
		if (!COLLECTION_VIEW_MODES.has(viewMode)) errors.push(diagnostic("INVALID_STUDIO_COLLECTION_VIEW", "$studioPlan.viewMode", "Choose the existing Tabs or Rows collection layout."));
		if (typeof requestedShowAllTab !== "boolean" || typeof pinToTop !== "boolean") errors.push(diagnostic("INVALID_STUDIO_COLLECTION_OPTIONS", "$studioPlan", "Collection options must be explicit boolean values."));
		showAllTab = normalizeHierarchyShowAllTab(viewMode, requestedShowAllTab);
		if (options.destinationCollectionInternalId !== undefined && options.destinationCollectionInternalId !== null) errors.push(diagnostic("UNEXPECTED_STUDIO_DESTINATION", "$studioPlan.destinationCollectionInternalId", "New Collection scope does not target an existing collection."));
	} else if (scope === "new-folder") {
		destinationCollection = project.collections.find((collection) => collection.internalId === options.destinationCollectionInternalId) ?? null;
		if (destinationCollection === null) errors.push(diagnostic("STUDIO_DESTINATION_NOT_FOUND", "$studioPlan.destinationCollectionInternalId", "The captured destination collection no longer exists."));
		for (const key of ["collectionTitle", "hideCollectionTitle", "viewMode", "showAllTab", "pinToTop"]) if (options[key] !== undefined && options[key] !== null) errors.push(diagnostic("UNEXPECTED_STUDIO_COLLECTION_OPTION", `$studioPlan.${key}`, "New Folder scope inherits the selected parent collection presentation."));
	}
	if (errors.length > 0) return Object.freeze({ ok: false, plan: null, errors: Object.freeze(errors) });

	const evaluated = entries.map((entry) => {
		const outcome = inspectStudioHierarchyPlacement(project, entry.drafts, { destinationCollectionInternalId: destinationCollection?.internalId ?? null });
		return Object.freeze({
			studioId: entry.studio.id,
			studioName: entry.studio.name,
			editable: folderEditable(entry, folderTitleVisibility),
			sources: Object.freeze(entry.drafts.map((draft) => Object.freeze({ draft }))),
			outcome,
		});
	});
	const placement = resolveNativeHierarchyPlacements(evaluated, destinationCollection?.internalId ?? null, options.folderDestinations);
	if (!placement) return Object.freeze({ ok: false, plan: null, errors: Object.freeze([diagnostic("INVALID_NATIVE_FOLDER_DESTINATION", "$plan.folderDestinations", "Choose a current matching folder for the new sources.")]) });
	const { placed, existingFolderAdditions } = placement;
	const readyFolders = placement.folders;
	const collections = scope === "new-collection" ? Object.freeze([Object.freeze({
		editable: Object.freeze({ title: hideCollectionTitle ? NUVIO_INVISIBLE_TITLE : collectionTitle, pinToTop, focusGlowEnabled: true, viewMode, showAllTab }),
		titleCollisions: hideCollectionTitle ? Object.freeze([]) : titleCollisions(project, collectionTitle),
		folders: Object.freeze(placed),
	})]) : Object.freeze([]);
	const folders = scope === "new-folder" ? Object.freeze(readyFolders) : Object.freeze([]);
	const destination = destinationCollection === null ? null : Object.freeze({
		collectionInternalId: destinationCollection.internalId,
		collectionTitle: canonicalText(destinationCollection.editable?.title),
		viewMode: destinationCollection.editable?.viewMode ?? null,
		showAllTab: destinationCollection.editable?.showAllTab ?? null,
		pinToTop: destinationCollection.editable?.pinToTop ?? null,
		titleHidden: isInvisibleNuvioTitle(destinationCollection.editable?.title),
	});
	const plan = Object.freeze({
		planType: STUDIO_HIERARCHY_PLAN_TYPE,
		captured: Object.freeze({ projectInternalId: project.internalId, projectRevision: options.projectRevision }),
		configuration: Object.freeze({ filters: Object.freeze(validateNativeAdvancedDraft(options.filters, mediaMode.id).filters), genreOverrides: freezeNativeGenreOverrides(options.genreOverrides), folderDestinations: Object.freeze({ ...(options.folderDestinations ?? {}) }), scope, collectionTitle, hideCollectionTitle, viewMode, showAllTab, pinToTop, folderTitleVisibility, folderTileShape: DEFAULT_STUDIO_FOLDER_TILE_SHAPE, mediaMode: mediaMode.id, sortOptionIds, studios: Object.freeze(entries.map((entry) => Object.freeze({ studio: entry.studio, artwork: entry.artwork }))) }),
		destination,
		collections,
		folders,
		existingFolderAdditions,
		outcomes: Object.freeze(placed.map((folder) => folder.outcome)),
		counts: nativeHierarchyCounts(collections, folders, placed, existingFolderAdditions),
	});
	return Object.freeze({ ok: true, plan, errors: Object.freeze([]) });
}

function rebuildOptions(plan) {
	return {
		scope: plan.configuration.scope,
		folderDestinations: plan.configuration.folderDestinations,
		projectRevision: plan.captured.projectRevision,
		...(plan.destination ? { destinationCollectionInternalId: plan.destination.collectionInternalId } : {}),
		...(plan.configuration.scope === "new-collection" ? {
			collectionTitle: plan.configuration.collectionTitle,
			hideCollectionTitle: plan.configuration.hideCollectionTitle,
			viewMode: plan.configuration.viewMode,
			showAllTab: plan.configuration.showAllTab,
			pinToTop: plan.configuration.pinToTop,
		} : {}),
		folderTitleVisibility: plan.configuration.folderTitleVisibility,
		mediaMode: plan.configuration.mediaMode,
		sortOptionIds: plan.configuration.sortOptionIds,
		filters: plan.configuration.filters,
		genreOverrides: plan.configuration.genreOverrides,
		studios: plan.configuration.studios,
	};
}

function comparablePlan(plan) {
	return JSON.stringify({ configuration: plan.configuration, destination: plan.destination, collections: plan.collections, folders: plan.folders, existingFolderAdditions: plan.existingFolderAdditions, outcomes: plan.outcomes, counts: plan.counts });
}

export function validateStudioHierarchyPlan(plan, { project, projectRevision } = {}) {
	if (!plainObject(plan) || plan.planType !== STUDIO_HIERARCHY_PLAN_TYPE || !plainObject(plan.captured) || !plainObject(plan.configuration)) return Object.freeze({ ok: false, stale: false, errors: Object.freeze([diagnostic("INVALID_STUDIO_HIERARCHY_PLAN", "$studioPlan", "The Studio hierarchy plan is malformed or unsupported.")]) });
	if (!plainObject(project) || project.internalId !== plan.captured.projectInternalId) return Object.freeze({ ok: false, stale: true, errors: Object.freeze([diagnostic("STALE_STUDIO_HIERARCHY_PLAN", "$studioPlan.captured", "The Builder project changed after this Studio plan was prepared.")]) });
	const rebuilt = createStudioHierarchyPlan(project, rebuildOptions(plan));
	if (!rebuilt.ok || comparablePlan(rebuilt.plan) !== comparablePlan(plan)) {
		const stale = projectRevision !== plan.captured.projectRevision;
		return Object.freeze({ ok: false, stale, errors: Object.freeze([diagnostic(stale ? "STALE_STUDIO_HIERARCHY_PLAN" : "INVALID_STUDIO_HIERARCHY_PLAN", "$studioPlan", stale ? "Studio placement changed. Review a new plan before creating it." : "The Studio plan no longer matches its validated configuration.")]) });
	}
	return Object.freeze({ ok: true, stale: false, errors: Object.freeze([]) });
}

export function applyStudioHierarchyPlan(controller, plan) {
	if (!controller || typeof controller.getState !== "function") return Object.freeze({ ok: false, errors: Object.freeze([diagnostic("INVALID_STUDIO_CONTROLLER", "$studioPlan.controller", "A Builder controller is required to apply the Studio plan.")]), warnings: Object.freeze([]) });
	const state = controller.getState();
	const validation = validateStudioHierarchyPlan(plan, { project: state.project, projectRevision: state.revision });
	if (!validation.ok) return Object.freeze({ ok: false, stale: validation.stale, errors: validation.errors, warnings: Object.freeze([]) });
	if (plan.counts.sourceCount === 0 || plan.counts.unresolvedEntityCount > 0) return Object.freeze({ ok: false, errors: Object.freeze([diagnostic("NO_STUDIO_SOURCES_READY", "$studioPlan.folders", "Choose missing sources and resolve their destination folders.")]), warnings: Object.freeze([]) });
	const bundlesFor = (folders) => folders.map((folder) => ({ folder: { editable: folder.editable }, sources: folder.sources.map((source) => source.draft) }));
	const result = plan.configuration.scope === "new-collection"
		? controller.createCollectionsWithFoldersAndSources({ bundles: plan.collections.map((collection) => ({ collection: { editable: collection.editable }, folders: bundlesFor(collection.folders) })) })
		: controller.extendCollectionWithFoldersAndSources(plan.destination.collectionInternalId, { newFolders: bundlesFor(plan.folders), existingFolderAdditions: plan.existingFolderAdditions.map((addition) => ({ folderInternalId: addition.folderInternalId, sources: addition.sources.map((source) => source.draft) })) });
	return result.ok ? { ...result, counts: plan.counts } : result;
}
