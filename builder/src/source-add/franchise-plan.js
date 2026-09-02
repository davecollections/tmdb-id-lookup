import { isInvisibleNuvioTitle, NUVIO_INVISIBLE_TITLE } from "../nuvio/titles.js";
import { resolveFranchiseFolderArtwork, DEFAULT_FRANCHISE_FOLDER_TILE_SHAPE } from "./franchise-folder-artwork.js";
import { normalizeHierarchyShowAllTab } from "./hierarchy-presentation.js";
import { buildMovieFranchiseSourceDraft, movieFranchiseDuplicateIdentity } from "./movie-franchise-source.js";
import { isPositiveSafeTmdbId } from "./tmdb-collection-input.js";

export const FRANCHISE_HIERARCHY_PLAN_TYPE = "franchise-hierarchy-plan";
export const FRANCHISE_CREATION_SCOPES = Object.freeze(["new-collection", "new-folder"]);
export const FRANCHISE_PLACEMENT_STATUSES = Object.freeze({
	READY: "ready-to-create",
	ALREADY_IN_COLLECTION: "already-in-this-collection",
	EXISTS_ELSEWHERE: "exists-elsewhere",
});
export const DEFAULT_FRANCHISE_COLLECTION_TITLE = "Franchises";
export const DEFAULT_FRANCHISE_FOLDER_TITLE_VISIBILITY = "HIDE_HOME_SCREEN";

const OPTION_KEYS = new Set([
	"scope",
	"projectRevision",
	"destinationCollectionInternalId",
	"collectionTitle",
	"hideCollectionTitle",
	"viewMode",
	"showAllTab",
	"pinToTop",
	"folderTitleVisibility",
	"franchises",
]);
const COLLECTION_VIEW_MODES = new Set(["TABBED_GRID", "ROWS"]);
const FOLDER_TITLE_VISIBILITIES = new Set(["SHOW_EVERYWHERE", "HIDE_HOME_SCREEN", "HIDE_EVERYWHERE"]);

function plainObject(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function diagnostic(code, path, message) {
	return Object.freeze({ code, path, message });
}

function canonicalText(value) {
	return typeof value === "string" ? value.trim() : "";
}

function normalizeFranchise(franchise, index, errors) {
	const name = canonicalText(franchise?.name);
	if (!isPositiveSafeTmdbId(franchise?.id) || !name || franchise.name !== name) {
		errors.push(diagnostic("INVALID_FRANCHISE_PLAN_SELECTION", `$franchisePlan.franchises[${index}]`, "Each franchise needs its canonical TMDB Collection ID and name."));
		return null;
	}
	const source = buildMovieFranchiseSourceDraft(franchise, name);
	if (!source.ok) {
		errors.push(...source.errors);
		return null;
	}
	return Object.freeze({
		franchise: Object.freeze({ ...franchise }),
		draft: Object.freeze({
			category: source.draft.category,
			editable: Object.freeze({ ...source.draft.editable, filters: Object.freeze({}) }),
		}),
	});
}

function sourceOccurrences(project, identity) {
	const occurrences = [];
	for (const collection of project.collections ?? []) {
		for (const folder of collection.folders ?? []) {
			for (const source of folder.sources ?? []) {
				if (movieFranchiseDuplicateIdentity(source.editable) !== identity) continue;
				occurrences.push(Object.freeze({
					collectionInternalId: collection.internalId,
					collectionTitle: canonicalText(collection.editable?.title),
					folderInternalId: folder.internalId,
					folderTitle: canonicalText(folder.editable?.title),
					sourceInternalId: source.internalId,
					sourceTitle: canonicalText(source.editable?.title),
				}));
			}
		}
	}
	return Object.freeze(occurrences);
}

export function inspectFranchiseHierarchyPlacement(project, draft, { destinationCollectionInternalId = null } = {}) {
	const identity = movieFranchiseDuplicateIdentity(draft?.editable);
	if (identity === null) return null;
	const occurrences = sourceOccurrences(project, identity);
	const destination = destinationCollectionInternalId === null
		? Object.freeze([])
		: Object.freeze(occurrences.filter((entry) => entry.collectionInternalId === destinationCollectionInternalId));
	const elsewhere = destinationCollectionInternalId === null
		? occurrences
		: Object.freeze(occurrences.filter((entry) => entry.collectionInternalId !== destinationCollectionInternalId));
	const status = destination.length > 0
		? FRANCHISE_PLACEMENT_STATUSES.ALREADY_IN_COLLECTION
		: elsewhere.length > 0
			? FRANCHISE_PLACEMENT_STATUSES.EXISTS_ELSEWHERE
			: FRANCHISE_PLACEMENT_STATUSES.READY;
	return Object.freeze({ identity, status, destination, elsewhere });
}

function titleCollisions(project, title) {
	return Object.freeze((project.collections ?? [])
		.filter((collection) => collection.editable?.title === title)
		.map((collection) => Object.freeze({ collectionInternalId: collection.internalId, collectionTitle: title })));
}

function folderEditable(franchise, folderTitleVisibility) {
	const artwork = resolveFranchiseFolderArtwork(franchise);
	return Object.freeze({
		title: folderTitleVisibility === "HIDE_EVERYWHERE" ? NUVIO_INVISIBLE_TITLE : franchise.name,
		tileShape: DEFAULT_FRANCHISE_FOLDER_TILE_SHAPE,
		hideTitle: folderTitleVisibility !== "SHOW_EVERYWHERE",
		...artwork.folderEditable,
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

export function createFranchiseHierarchyPlan(project, options) {
	const errors = [];
	if (!plainObject(project) || project.nodeType !== "project" || !Array.isArray(project.collections)) {
		errors.push(diagnostic("INVALID_FRANCHISE_PLAN_PROJECT", "$franchisePlan.project", "Franchise planning requires the current Builder project."));
	}
	if (!plainObject(options) || Object.keys(options).some((key) => !OPTION_KEYS.has(key))) {
		errors.push(diagnostic("INVALID_FRANCHISE_PLAN_OPTIONS", "$franchisePlan", "Franchise hierarchy planning received an unsupported option."));
	}
	if (errors.length > 0) return Object.freeze({ ok: false, plan: null, errors: Object.freeze(errors) });
	if (!Number.isSafeInteger(options.projectRevision) || options.projectRevision < 0) {
		errors.push(diagnostic("INVALID_FRANCHISE_PLAN_REVISION", "$franchisePlan.projectRevision", "Capture the current nonnegative Builder revision."));
	}
	const scope = FRANCHISE_CREATION_SCOPES.includes(options.scope) ? options.scope : null;
	if (scope === null) errors.push(diagnostic("INVALID_FRANCHISE_PLAN_SCOPE", "$franchisePlan.scope", "Choose New Collection or New Folder scope."));
	if (!Array.isArray(options.franchises) || options.franchises.length < 1) {
		errors.push(diagnostic("FRANCHISE_PLAN_SELECTION_REQUIRED", "$franchisePlan.franchises", "Choose at least one TMDB franchise."));
	}
	const entries = Array.isArray(options.franchises)
		? options.franchises.map((entry, index) => normalizeFranchise(entry, index, errors)).filter(Boolean)
		: [];
	if (new Set(entries.map((entry) => entry.franchise.id)).size !== entries.length) {
		errors.push(diagnostic("DUPLICATE_FRANCHISE_PLAN_SELECTION", "$franchisePlan.franchises", "Each TMDB franchise may appear only once."));
	}
	const folderTitleVisibility = options.folderTitleVisibility ?? DEFAULT_FRANCHISE_FOLDER_TITLE_VISIBILITY;
	if (!FOLDER_TITLE_VISIBILITIES.has(folderTitleVisibility)) errors.push(diagnostic("INVALID_FRANCHISE_FOLDER_TITLE_VISIBILITY", "$franchisePlan.folderTitleVisibility", "Choose an existing folder-title visibility outcome."));

	let collectionTitle = null;
	let hideCollectionTitle = null;
	let viewMode = null;
	let showAllTab = null;
	let pinToTop = null;
	let destinationCollection = null;
	if (scope === "new-collection") {
		collectionTitle = options.collectionTitle ?? DEFAULT_FRANCHISE_COLLECTION_TITLE;
		hideCollectionTitle = options.hideCollectionTitle ?? false;
		viewMode = options.viewMode ?? "TABBED_GRID";
		const requestedShowAllTab = options.showAllTab ?? true;
		pinToTop = options.pinToTop ?? false;
		if (typeof collectionTitle !== "string" || (hideCollectionTitle !== true && (!collectionTitle.trim() || collectionTitle !== collectionTitle.trim()))) errors.push(diagnostic("INVALID_FRANCHISE_COLLECTION_TITLE", "$franchisePlan.collectionTitle", "The Franchises collection name must be a nonblank trimmed string."));
		if (typeof hideCollectionTitle !== "boolean") errors.push(diagnostic("INVALID_FRANCHISE_COLLECTION_TITLE_VISIBILITY", "$franchisePlan.hideCollectionTitle", "Collection title visibility must be true or false."));
		if (!COLLECTION_VIEW_MODES.has(viewMode)) errors.push(diagnostic("INVALID_FRANCHISE_COLLECTION_VIEW", "$franchisePlan.viewMode", "Choose the existing Tabs or Rows collection layout."));
		if (typeof requestedShowAllTab !== "boolean" || typeof pinToTop !== "boolean") errors.push(diagnostic("INVALID_FRANCHISE_COLLECTION_OPTIONS", "$franchisePlan", "Collection options must be explicit boolean values."));
		showAllTab = normalizeHierarchyShowAllTab(viewMode, requestedShowAllTab);
		if (options.destinationCollectionInternalId !== undefined && options.destinationCollectionInternalId !== null) errors.push(diagnostic("UNEXPECTED_FRANCHISE_DESTINATION", "$franchisePlan.destinationCollectionInternalId", "New Collection scope does not target an existing collection."));
	} else if (scope === "new-folder") {
		destinationCollection = project.collections.find((collection) => collection.internalId === options.destinationCollectionInternalId) ?? null;
		if (destinationCollection === null) errors.push(diagnostic("FRANCHISE_DESTINATION_NOT_FOUND", "$franchisePlan.destinationCollectionInternalId", "The captured destination collection no longer exists."));
		for (const key of ["collectionTitle", "hideCollectionTitle", "viewMode", "showAllTab", "pinToTop"]) {
			if (options[key] !== undefined && options[key] !== null) errors.push(diagnostic("UNEXPECTED_FRANCHISE_COLLECTION_OPTION", `$franchisePlan.${key}`, "New Folder scope inherits the selected parent collection presentation."));
		}
	}
	if (errors.length > 0) return Object.freeze({ ok: false, plan: null, errors: Object.freeze(errors) });

	const evaluated = entries.map((entry) => {
		const outcome = inspectFranchiseHierarchyPlacement(project, entry.draft, {
			destinationCollectionInternalId: destinationCollection?.internalId ?? null,
		});
		return Object.freeze({
			franchiseId: entry.franchise.id,
			franchiseName: entry.franchise.name,
			editable: folderEditable(entry.franchise, folderTitleVisibility),
			sources: Object.freeze([Object.freeze({ draft: entry.draft })]),
			outcome,
		});
	});
	const readyFolders = scope === "new-folder"
		? evaluated.filter((folder) => folder.outcome.status !== FRANCHISE_PLACEMENT_STATUSES.ALREADY_IN_COLLECTION)
		: evaluated;
	const collections = scope === "new-collection" ? Object.freeze([Object.freeze({
		editable: Object.freeze({
			title: hideCollectionTitle ? NUVIO_INVISIBLE_TITLE : collectionTitle,
			pinToTop,
			focusGlowEnabled: true,
			viewMode,
			showAllTab,
		}),
		titleCollisions: hideCollectionTitle ? Object.freeze([]) : titleCollisions(project, collectionTitle),
		folders: Object.freeze(evaluated),
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
		planType: FRANCHISE_HIERARCHY_PLAN_TYPE,
		captured: Object.freeze({ projectInternalId: project.internalId, projectRevision: options.projectRevision }),
		configuration: Object.freeze({ scope, collectionTitle, hideCollectionTitle, viewMode, showAllTab, pinToTop, folderTitleVisibility, folderTileShape: DEFAULT_FRANCHISE_FOLDER_TILE_SHAPE, franchises: Object.freeze(entries.map((entry) => entry.franchise)) }),
		destination,
		collections,
		folders,
		outcomes: Object.freeze(evaluated.map((folder) => folder.outcome)),
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
			collectionTitle: plan.configuration.collectionTitle,
			hideCollectionTitle: plan.configuration.hideCollectionTitle,
			viewMode: plan.configuration.viewMode,
			showAllTab: plan.configuration.showAllTab,
			pinToTop: plan.configuration.pinToTop,
		} : {}),
		folderTitleVisibility: plan.configuration.folderTitleVisibility,
		franchises: plan.configuration.franchises,
	};
}

function comparablePlan(plan) {
	return JSON.stringify({ configuration: plan.configuration, destination: plan.destination, collections: plan.collections, folders: plan.folders, outcomes: plan.outcomes, counts: plan.counts });
}

export function validateFranchiseHierarchyPlan(plan, { project, projectRevision } = {}) {
	if (!plainObject(plan) || plan.planType !== FRANCHISE_HIERARCHY_PLAN_TYPE || !plainObject(plan.captured) || !plainObject(plan.configuration)) {
		return Object.freeze({ ok: false, stale: false, errors: Object.freeze([diagnostic("INVALID_FRANCHISE_HIERARCHY_PLAN", "$franchisePlan", "The Franchise hierarchy plan is malformed or unsupported.")]) });
	}
	if (!plainObject(project) || project.internalId !== plan.captured.projectInternalId) {
		return Object.freeze({ ok: false, stale: true, errors: Object.freeze([diagnostic("STALE_FRANCHISE_HIERARCHY_PLAN", "$franchisePlan.captured", "The Builder project changed after this Franchise plan was prepared.")]) });
	}
	const rebuilt = createFranchiseHierarchyPlan(project, rebuildOptions(plan));
	if (!rebuilt.ok || comparablePlan(rebuilt.plan) !== comparablePlan(plan)) {
		const stale = projectRevision !== plan.captured.projectRevision;
		return Object.freeze({ ok: false, stale, errors: Object.freeze([diagnostic(stale ? "STALE_FRANCHISE_HIERARCHY_PLAN" : "INVALID_FRANCHISE_HIERARCHY_PLAN", "$franchisePlan", stale ? "Franchise placement changed. Review a new plan before creating it." : "The Franchise plan no longer matches its validated configuration.")]) });
	}
	return Object.freeze({ ok: true, stale: false, errors: Object.freeze([]) });
}

export function applyFranchiseHierarchyPlan(controller, plan) {
	if (!controller || typeof controller.getState !== "function") return Object.freeze({ ok: false, errors: Object.freeze([diagnostic("INVALID_FRANCHISE_CONTROLLER", "$franchisePlan.controller", "A Builder controller is required to apply the Franchise plan.")]), warnings: Object.freeze([]) });
	const state = controller.getState();
	const validation = validateFranchiseHierarchyPlan(plan, { project: state.project, projectRevision: state.revision });
	if (!validation.ok) return Object.freeze({ ok: false, stale: validation.stale, errors: validation.errors, warnings: Object.freeze([]) });
	if (plan.counts.folderCount === 0) return Object.freeze({ ok: false, errors: Object.freeze([diagnostic("NO_FRANCHISE_FOLDERS_READY", "$franchisePlan.folders", "No new Franchise folders are ready to create here.")]), warnings: Object.freeze([]) });
	const bundlesFor = (folders) => folders.map((folder) => ({
		folder: { editable: folder.editable },
		sources: folder.sources.map((source) => source.draft),
	}));
	const result = plan.configuration.scope === "new-collection"
		? controller.createCollectionsWithFoldersAndSources({ bundles: plan.collections.map((collection) => ({ collection: { editable: collection.editable }, folders: bundlesFor(collection.folders) })) })
		: controller.createFoldersWithSources(plan.destination.collectionInternalId, { bundles: bundlesFor(plan.folders) });
	return result.ok ? { ...result, counts: plan.counts } : result;
}
