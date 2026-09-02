import { isInvisibleNuvioTitle, isValidVisibleNuvioTitle, NUVIO_INVISIBLE_TITLE } from "../nuvio/titles.js";
import { normalizeHierarchyShowAllTab } from "./hierarchy-presentation.js";
import { buildTmdbListSourceDraft, tmdbListPhysicalIdentity } from "./tmdb-list-source.js";

export const TMDB_LIST_HIERARCHY_PLAN_TYPE = "tmdb-list-hierarchy-plan";
export const TMDB_LIST_CREATION_SCOPES = Object.freeze(["new-collection", "new-folder"]);
export const TMDB_LIST_PLACEMENT_STATUSES = Object.freeze({ READY: "ready-to-create", ALREADY_IN_COLLECTION: "already-in-this-collection", EXISTS_ELSEWHERE: "exists-elsewhere" });
export const DEFAULT_TMDB_LIST_FOLDER_TITLE_VISIBILITY = "HIDE_HOME_SCREEN";
export const DEFAULT_TMDB_LIST_FOLDER_TILE_SHAPE = "POSTER";
const COLLECTION_VIEW_MODES = new Set(["TABBED_GRID", "ROWS"]);
const FOLDER_TITLE_VISIBILITIES = new Set(["SHOW_EVERYWHERE", "HIDE_HOME_SCREEN", "HIDE_EVERYWHERE"]);
const FOLDER_TILE_SHAPES = new Set(["POSTER", "LANDSCAPE"]);
function diagnostic(code, path, message) { return Object.freeze({ code, path, message }); }
function text(value) { return typeof value === "string" ? value.trim() : ""; }
function plainObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }

function occurrences(project, identity) {
	const matches = [];
	for (const collection of project.collections ?? []) for (const folder of collection.folders ?? []) for (const source of folder.sources ?? []) if (tmdbListPhysicalIdentity(source.editable) === identity) matches.push(Object.freeze({ collectionInternalId: collection.internalId, collectionTitle: text(collection.editable?.title), folderInternalId: folder.internalId, folderTitle: text(folder.editable?.title), sourceInternalId: source.internalId, sourceTitle: text(source.editable?.title), identity }));
	return Object.freeze(matches);
}

export function createTmdbListHierarchyPlan(project, options) {
	const errors = [];
	if (!plainObject(project) || project.nodeType !== "project" || !Array.isArray(project.collections)) errors.push(diagnostic("INVALID_TMDB_LIST_PLAN_PROJECT", "$tmdbListPlan.project", "TMDB List planning requires the current Builder project."));
	if (!plainObject(options)) errors.push(diagnostic("INVALID_TMDB_LIST_PLAN_OPTIONS", "$tmdbListPlan", "TMDB List planning requires explicit options."));
	if (errors.length) return Object.freeze({ ok: false, plan: null, errors: Object.freeze(errors) });
	const scope = TMDB_LIST_CREATION_SCOPES.includes(options.scope) ? options.scope : null;
	if (!scope) errors.push(diagnostic("INVALID_TMDB_LIST_PLAN_SCOPE", "$tmdbListPlan.scope", "Choose New Collection or New Folder scope."));
	if (!Number.isSafeInteger(options.projectRevision) || options.projectRevision < 0) errors.push(diagnostic("INVALID_TMDB_LIST_PLAN_REVISION", "$tmdbListPlan.projectRevision", "Capture the current nonnegative Builder revision."));
	const folderTitleVisibility = options.folderTitleVisibility ?? DEFAULT_TMDB_LIST_FOLDER_TITLE_VISIBILITY;
	const folderTileShape = options.folderTileShape ?? DEFAULT_TMDB_LIST_FOLDER_TILE_SHAPE;
	if (!FOLDER_TITLE_VISIBILITIES.has(folderTitleVisibility)) errors.push(diagnostic("INVALID_TMDB_LIST_FOLDER_TITLE_VISIBILITY", "$tmdbListPlan.folderTitleVisibility", "Choose an existing folder-title visibility outcome."));
	if (!FOLDER_TILE_SHAPES.has(folderTileShape)) errors.push(diagnostic("INVALID_TMDB_LIST_FOLDER_TILE_SHAPE", "$tmdbListPlan.folderTileShape", "Choose the existing Poster or Landscape folder tile shape."));
	if (typeof options.folderTitle !== "string" || (folderTitleVisibility !== "HIDE_EVERYWHERE" && (!isValidVisibleNuvioTitle(options.folderTitle) || options.folderTitle !== text(options.folderTitle)))) errors.push(diagnostic("INVALID_TMDB_LIST_FOLDER_TITLE", "$tmdbListPlan.folderTitle", "Enter a visible folder name."));
	let hideCollectionTitle = null;
	let viewMode = null;
	let showAllTab = null;
	let pinToTop = null;
	if (scope === "new-collection") {
		hideCollectionTitle = options.hideCollectionTitle ?? false;
		viewMode = options.viewMode ?? "TABBED_GRID";
		const requestedShowAllTab = options.showAllTab ?? true;
		pinToTop = options.pinToTop ?? false;
		if (typeof options.collectionTitle !== "string" || (hideCollectionTitle !== true && (!isValidVisibleNuvioTitle(options.collectionTitle) || options.collectionTitle !== text(options.collectionTitle)))) errors.push(diagnostic("INVALID_TMDB_LIST_COLLECTION_TITLE", "$tmdbListPlan.collectionTitle", "Enter a visible collection name."));
		if (typeof hideCollectionTitle !== "boolean") errors.push(diagnostic("INVALID_TMDB_LIST_COLLECTION_TITLE_VISIBILITY", "$tmdbListPlan.hideCollectionTitle", "Collection title visibility must be true or false."));
		if (!COLLECTION_VIEW_MODES.has(viewMode)) errors.push(diagnostic("INVALID_TMDB_LIST_COLLECTION_VIEW", "$tmdbListPlan.viewMode", "Choose the existing Tabs or Rows collection layout."));
		if (typeof requestedShowAllTab !== "boolean" || typeof pinToTop !== "boolean") errors.push(diagnostic("INVALID_TMDB_LIST_COLLECTION_OPTIONS", "$tmdbListPlan", "Collection presentation options must be explicit boolean values."));
		showAllTab = normalizeHierarchyShowAllTab(viewMode, requestedShowAllTab);
	} else if (scope === "new-folder") {
		for (const key of ["collectionTitle", "hideCollectionTitle", "viewMode", "showAllTab", "pinToTop"]) if (options[key] !== undefined && options[key] !== null) errors.push(diagnostic("UNEXPECTED_TMDB_LIST_COLLECTION_OPTION", `$tmdbListPlan.${key}`, "New Folder scope inherits the selected parent collection presentation."));
	}
	if (!Array.isArray(options.lists) || options.lists.length < 1) errors.push(diagnostic("TMDB_LIST_PLAN_SELECTION_REQUIRED", "$tmdbListPlan.lists", "Resolve at least one TMDB list."));
	const entries = [];
	for (const [index, list] of (options.lists ?? []).entries()) {
		const built = buildTmdbListSourceDraft(list, list?.sourceTitle);
		if (!built.ok) { errors.push(...built.errors.map((error) => ({ ...error, path: `$tmdbListPlan.lists[${index}]` }))); continue; }
		entries.push(Object.freeze({ list: Object.freeze({ ...list, sourceTitle: built.draft.editable.title }), draft: Object.freeze({ category: built.draft.category, editable: Object.freeze({ ...built.draft.editable, filters: Object.freeze({}) }) }) }));
	}
	if (new Set(entries.map((entry) => entry.list.id)).size !== entries.length) errors.push(diagnostic("DUPLICATE_TMDB_LIST_PLAN_SELECTION", "$tmdbListPlan.lists", "Each TMDB list may appear only once."));
	const destinationCollection = scope === "new-folder" ? project.collections.find((collection) => collection.internalId === options.destinationCollectionInternalId) ?? null : null;
	if (scope === "new-folder" && !destinationCollection) errors.push(diagnostic("TMDB_LIST_DESTINATION_NOT_FOUND", "$tmdbListPlan.destinationCollectionInternalId", "The destination collection no longer exists."));
	if (errors.length) return Object.freeze({ ok: false, plan: null, errors: Object.freeze(errors) });

	const outcomes = entries.map((entry) => {
		const identity = tmdbListPhysicalIdentity(entry.draft.editable);
		const all = occurrences(project, identity);
		const destination = destinationCollection ? all.filter((match) => match.collectionInternalId === destinationCollection.internalId) : [];
		const elsewhere = destinationCollection ? all.filter((match) => match.collectionInternalId !== destinationCollection.internalId) : all;
		const status = destination.length ? TMDB_LIST_PLACEMENT_STATUSES.ALREADY_IN_COLLECTION : elsewhere.length ? TMDB_LIST_PLACEMENT_STATUSES.EXISTS_ELSEWHERE : TMDB_LIST_PLACEMENT_STATUSES.READY;
		return Object.freeze({ identity, status, destination: Object.freeze(destination), elsewhere: Object.freeze(elsewhere) });
	});
	const readyEntries = scope === "new-folder" ? entries.filter((_, index) => outcomes[index].status !== TMDB_LIST_PLACEMENT_STATUSES.ALREADY_IN_COLLECTION) : entries;
	const folder = Object.freeze({ editable: Object.freeze({ title: folderTitleVisibility === "HIDE_EVERYWHERE" ? NUVIO_INVISIBLE_TITLE : options.folderTitle, tileShape: folderTileShape, hideTitle: folderTitleVisibility !== "SHOW_EVERYWHERE" }), sources: Object.freeze(readyEntries.map((entry) => Object.freeze({ draft: entry.draft }))) });
	const collections = scope === "new-collection" ? Object.freeze([Object.freeze({ editable: Object.freeze({ title: hideCollectionTitle ? NUVIO_INVISIBLE_TITLE : options.collectionTitle, pinToTop, focusGlowEnabled: true, viewMode, showAllTab }), folders: Object.freeze([folder]) })]) : Object.freeze([]);
	const folders = scope === "new-folder" && readyEntries.length ? Object.freeze([folder]) : Object.freeze([]);
	const plan = Object.freeze({
		planType: TMDB_LIST_HIERARCHY_PLAN_TYPE,
		captured: Object.freeze({ projectInternalId: project.internalId, projectRevision: options.projectRevision }),
		configuration: Object.freeze({ scope, collectionTitle: scope === "new-collection" ? options.collectionTitle : null, hideCollectionTitle, viewMode, showAllTab, pinToTop, folderTitle: options.folderTitle, folderTitleVisibility, folderTileShape, lists: Object.freeze(entries.map((entry) => entry.list)) }),
		destination: destinationCollection ? Object.freeze({ collectionInternalId: destinationCollection.internalId, collectionTitle: text(destinationCollection.editable?.title), viewMode: destinationCollection.editable?.viewMode ?? null, showAllTab: destinationCollection.editable?.showAllTab ?? null, pinToTop: destinationCollection.editable?.pinToTop ?? null, titleHidden: isInvisibleNuvioTitle(destinationCollection.editable?.title) }) : null,
		collections,
		folders,
		outcomes: Object.freeze(outcomes),
		counts: Object.freeze({ collectionCount: collections.length, folderCount: collections.length ? 1 : folders.length, sourceCount: readyEntries.length }),
	});
	return Object.freeze({ ok: true, plan, errors: Object.freeze([]) });
}

function rebuild(plan, revision) {
	return { scope: plan.configuration.scope, projectRevision: revision, ...(plan.destination ? { destinationCollectionInternalId: plan.destination.collectionInternalId } : {}), ...(plan.configuration.scope === "new-collection" ? { collectionTitle: plan.configuration.collectionTitle, hideCollectionTitle: plan.configuration.hideCollectionTitle, viewMode: plan.configuration.viewMode, showAllTab: plan.configuration.showAllTab, pinToTop: plan.configuration.pinToTop } : {}), folderTitle: plan.configuration.folderTitle, folderTitleVisibility: plan.configuration.folderTitleVisibility, folderTileShape: plan.configuration.folderTileShape, lists: plan.configuration.lists };
}
function comparable(plan) { return JSON.stringify({ configuration: plan.configuration, destination: plan.destination, collections: plan.collections, folders: plan.folders, outcomes: plan.outcomes, counts: plan.counts }); }

export function validateTmdbListHierarchyPlan(plan, { project, projectRevision } = {}) {
	if (!plainObject(plan) || plan.planType !== TMDB_LIST_HIERARCHY_PLAN_TYPE || !plainObject(project) || project.internalId !== plan.captured?.projectInternalId) return Object.freeze({ ok: false, stale: true, errors: Object.freeze([diagnostic("STALE_TMDB_LIST_PLAN", "$tmdbListPlan", "The Builder project changed after this TMDB List plan was prepared.")]) });
	if (projectRevision !== plan.captured.projectRevision) return Object.freeze({ ok: false, stale: true, errors: Object.freeze([diagnostic("STALE_TMDB_LIST_PLAN", "$tmdbListPlan.captured", "The Builder project changed after this TMDB List plan was prepared.")]) });
	const rebuilt = createTmdbListHierarchyPlan(project, rebuild(plan, plan.captured.projectRevision));
	if (!rebuilt.ok || comparable(rebuilt.plan) !== comparable(plan)) return Object.freeze({ ok: false, stale: false, errors: Object.freeze([diagnostic("INVALID_TMDB_LIST_PLAN", "$tmdbListPlan", "The TMDB List plan no longer matches its validated configuration.")]) });
	return Object.freeze({ ok: true, stale: false, errors: Object.freeze([]) });
}

export function applyTmdbListHierarchyPlan(controller, plan) {
	const state = controller?.getState?.();
	const validation = validateTmdbListHierarchyPlan(plan, { project: state?.project, projectRevision: state?.revision });
	if (!validation.ok) return { ok: false, stale: validation.stale, errors: validation.errors, warnings: [] };
	if (plan.counts.sourceCount === 0) return { ok: false, errors: [diagnostic("NO_TMDB_LIST_SOURCES_READY", "$tmdbListPlan.sources", "No new TMDB List sources are ready to create here.")], warnings: [] };
	const bundle = (folder) => ({ folder: { editable: folder.editable }, sources: folder.sources.map((source) => source.draft) });
	const result = plan.configuration.scope === "new-collection"
		? controller.createCollectionsWithFoldersAndSources({ bundles: plan.collections.map((collection) => ({ collection: { editable: collection.editable }, folders: collection.folders.map(bundle) })) })
		: controller.createFoldersWithSources(plan.destination.collectionInternalId, { bundles: plan.folders.map(bundle) });
	return result.ok ? { ...result, counts: plan.counts } : result;
}
