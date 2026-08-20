import { isInvisibleNuvioTitle, NUVIO_INVISIBLE_TITLE } from "../nuvio/titles.js";
import { normalizeHierarchyShowAllTab } from "./hierarchy-presentation.js";
import {
	DEFAULT_NETWORK_ARTWORK_ORIENTATION,
	NETWORK_ARTWORK_ORIENTATIONS,
} from "./network-folder-artwork.js";
import {
	buildNetworkHierarchySourceDraft,
	DEFAULT_NETWORK_SORT_OPTION_ID,
	networkSourceIdentity,
	NETWORK_SORT_OPTIONS,
	validateNetworkHierarchySourceDraft,
} from "./network-source.js";

export const NETWORK_HIERARCHY_PLAN_TYPE = "network-hierarchy-plan";
export const NETWORK_CREATION_SCOPES = Object.freeze(["new-collection", "new-folder"]);
export const NETWORK_PLACEMENT_STATUSES = Object.freeze({
	READY: "ready-to-create",
	ALREADY_IN_COLLECTION: "already-in-this-collection",
	EXISTS_ELSEWHERE: "exists-elsewhere",
});
export const DEFAULT_NETWORK_COLLECTION_TITLE = "Networks";
export const DEFAULT_NETWORK_FOLDER_TITLE_VISIBILITY = "SHOW_EVERYWHERE";

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
	"artworkOrientation",
	"sortOptionId",
	"networks",
]);
const COLLECTION_VIEW_MODES = new Set(["TABBED_GRID", "ROWS"]);
const FOLDER_TITLE_VISIBILITIES = new Set(["SHOW_EVERYWHERE", "HIDE_HOME_SCREEN", "HIDE_EVERYWHERE"]);
const ARTWORK_SOURCES = new Set(["runtime", "tmdb-logo", "emoji"]);
const ARTWORK_ORIENTATIONS = new Set(Object.values(NETWORK_ARTWORK_ORIENTATIONS));

function plainObject(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function diagnostic(code, path, message) {
	return Object.freeze({ code, path, message });
}

function canonicalText(value) {
	return typeof value === "string" ? value.trim() : "";
}

function validHttpsUrl(value) {
	if (typeof value !== "string" || value.trim() !== value || value.length === 0) return false;
	try {
		const url = new URL(value);
		return url.protocol === "https:" && url.username === "" && url.password === "";
	} catch {
		return false;
	}
}

function validArtwork(artwork, networkId, orientation) {
	if (
		!plainObject(artwork)
		|| artwork.networkId !== networkId
		|| artwork.orientation !== orientation
		|| artwork.tileShape !== orientation
		|| !ARTWORK_SOURCES.has(artwork.source)
		|| !plainObject(artwork.folderEditable)
	) return false;
	const editable = artwork.folderEditable;
	if (artwork.source === "emoji") return editable.coverImageUrl === "" && editable.coverEmoji === "📺";
	return validHttpsUrl(editable.coverImageUrl);
}

function normalizeNetworkEntry(entry, index, { artworkOrientation, sortOptionId }, errors) {
	const network = entry?.network;
	const name = canonicalText(network?.name);
	if (
		!Number.isSafeInteger(network?.id)
		|| network.id < 1
		|| !name
		|| network.name !== name
	) {
		errors.push(diagnostic("INVALID_NETWORK_PLAN_SELECTION", `$networkPlan.networks[${index}].network`, "Each Network needs its canonical checked-in identity."));
		return null;
	}
	if (!validArtwork(entry?.artwork, network.id, artworkOrientation)) {
		errors.push(diagnostic("INVALID_NETWORK_PLAN_ARTWORK", `$networkPlan.networks[${index}].artwork`, "Each Network folder needs resolved artwork in the requested orientation or the approved fallback."));
		return null;
	}
	const sourceResult = buildNetworkHierarchySourceDraft(network, { sortOptionId });
	if (!sourceResult.ok) {
		errors.push(...sourceResult.errors);
		return null;
	}
	const validation = validateNetworkHierarchySourceDraft(sourceResult.draft, { network });
	if (!validation.ok) {
		errors.push(...validation.errors);
		return null;
	}
	return Object.freeze({
		network: Object.freeze({ id: network.id, name }),
		artwork: Object.freeze({ ...entry.artwork, folderEditable: Object.freeze({ ...entry.artwork.folderEditable }) }),
		draft: Object.freeze({
			category: sourceResult.draft.category,
			editable: Object.freeze({ ...sourceResult.draft.editable, filters: Object.freeze({}) }),
		}),
	});
}

function sourceOccurrences(project, identity) {
	const occurrences = [];
	for (const collection of project?.collections ?? []) {
		for (const folder of collection.folders ?? []) {
			for (const source of folder.sources ?? []) {
				if (networkSourceIdentity(source.editable) !== identity) continue;
				occurrences.push(Object.freeze({
					identity,
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

export function inspectNetworkHierarchyPlacement(project, draft, { destinationCollectionInternalId = null } = {}) {
	const identity = networkSourceIdentity(draft?.editable);
	if (identity === null) return null;
	const occurrences = sourceOccurrences(project, identity);
	const destination = destinationCollectionInternalId === null
		? Object.freeze([])
		: Object.freeze(occurrences.filter((entry) => entry.collectionInternalId === destinationCollectionInternalId));
	const elsewhere = destinationCollectionInternalId === null
		? occurrences
		: Object.freeze(occurrences.filter((entry) => entry.collectionInternalId !== destinationCollectionInternalId));
	const status = destination.length > 0
		? NETWORK_PLACEMENT_STATUSES.ALREADY_IN_COLLECTION
		: elsewhere.length > 0
			? NETWORK_PLACEMENT_STATUSES.EXISTS_ELSEWHERE
			: NETWORK_PLACEMENT_STATUSES.READY;
	return Object.freeze({ identity, status, destination, elsewhere });
}

function titleCollisions(project, title) {
	return Object.freeze((project.collections ?? [])
		.filter((collection) => collection.editable?.title === title)
		.map((collection) => Object.freeze({ collectionInternalId: collection.internalId, collectionTitle: title })));
}

function folderEditable(entry, folderTitleVisibility, artworkOrientation) {
	return Object.freeze({
		title: folderTitleVisibility === "HIDE_EVERYWHERE" ? NUVIO_INVISIBLE_TITLE : entry.network.name,
		tileShape: artworkOrientation,
		hideTitle: folderTitleVisibility !== "SHOW_EVERYWHERE",
		...entry.artwork.folderEditable,
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

export function createNetworkHierarchyPlan(project, options) {
	const errors = [];
	if (!plainObject(project) || project.nodeType !== "project" || !Array.isArray(project.collections)) {
		errors.push(diagnostic("INVALID_NETWORK_PLAN_PROJECT", "$networkPlan.project", "Network planning requires the current Builder project."));
	}
	if (!plainObject(options) || Object.keys(options).some((key) => !OPTION_KEYS.has(key))) {
		errors.push(diagnostic("INVALID_NETWORK_PLAN_OPTIONS", "$networkPlan", "Network hierarchy planning received an unsupported option."));
	}
	if (errors.length > 0) return Object.freeze({ ok: false, plan: null, errors: Object.freeze(errors) });
	if (!Number.isSafeInteger(options.projectRevision) || options.projectRevision < 0) {
		errors.push(diagnostic("INVALID_NETWORK_PLAN_REVISION", "$networkPlan.projectRevision", "Capture the current nonnegative Builder revision."));
	}
	const scope = NETWORK_CREATION_SCOPES.includes(options.scope) ? options.scope : null;
	if (scope === null) errors.push(diagnostic("INVALID_NETWORK_PLAN_SCOPE", "$networkPlan.scope", "Choose New Collection or New Folder scope."));
	const artworkOrientation = options.artworkOrientation ?? DEFAULT_NETWORK_ARTWORK_ORIENTATION;
	if (!ARTWORK_ORIENTATIONS.has(artworkOrientation)) errors.push(diagnostic("INVALID_NETWORK_PLAN_ARTWORK_ORIENTATION", "$networkPlan.artworkOrientation", "Choose Poster or Landscape Network artwork."));
	const sortOptionId = options.sortOptionId ?? DEFAULT_NETWORK_SORT_OPTION_ID;
	if (!NETWORK_SORT_OPTIONS.some((entry) => entry.id === sortOptionId)) errors.push(diagnostic("INVALID_NETWORK_PLAN_SORT", "$networkPlan.sortOptionId", "Choose a supported Network sort."));
	if (!Array.isArray(options.networks) || options.networks.length < 1) {
		errors.push(diagnostic("NETWORK_PLAN_SELECTION_REQUIRED", "$networkPlan.networks", "Choose at least one Network."));
	}
	const entries = Array.isArray(options.networks) && ARTWORK_ORIENTATIONS.has(artworkOrientation)
		? options.networks.map((entry, index) => normalizeNetworkEntry(entry, index, { artworkOrientation, sortOptionId }, errors)).filter(Boolean)
		: [];
	if (new Set(entries.map((entry) => entry.network.id)).size !== entries.length) {
		errors.push(diagnostic("DUPLICATE_NETWORK_PLAN_SELECTION", "$networkPlan.networks", "Each Network may appear only once."));
	}
	const folderTitleVisibility = options.folderTitleVisibility ?? DEFAULT_NETWORK_FOLDER_TITLE_VISIBILITY;
	if (!FOLDER_TITLE_VISIBILITIES.has(folderTitleVisibility)) errors.push(diagnostic("INVALID_NETWORK_FOLDER_TITLE_VISIBILITY", "$networkPlan.folderTitleVisibility", "Choose an existing folder-title visibility outcome."));

	let collectionTitle = null;
	let hideCollectionTitle = null;
	let viewMode = null;
	let showAllTab = null;
	let pinToTop = null;
	let destinationCollection = null;
	if (scope === "new-collection") {
		collectionTitle = options.collectionTitle ?? DEFAULT_NETWORK_COLLECTION_TITLE;
		hideCollectionTitle = options.hideCollectionTitle ?? false;
		viewMode = options.viewMode ?? "TABBED_GRID";
		const requestedShowAllTab = options.showAllTab ?? true;
		pinToTop = options.pinToTop ?? false;
		if (typeof collectionTitle !== "string" || !collectionTitle.trim() || collectionTitle !== collectionTitle.trim()) errors.push(diagnostic("INVALID_NETWORK_COLLECTION_TITLE", "$networkPlan.collectionTitle", "The Networks collection name must be a nonblank trimmed string."));
		if (typeof hideCollectionTitle !== "boolean") errors.push(diagnostic("INVALID_NETWORK_COLLECTION_TITLE_VISIBILITY", "$networkPlan.hideCollectionTitle", "Collection title visibility must be true or false."));
		if (!COLLECTION_VIEW_MODES.has(viewMode)) errors.push(diagnostic("INVALID_NETWORK_COLLECTION_VIEW", "$networkPlan.viewMode", "Choose the existing Tabs or Rows collection layout."));
		if (typeof requestedShowAllTab !== "boolean" || typeof pinToTop !== "boolean") errors.push(diagnostic("INVALID_NETWORK_COLLECTION_OPTIONS", "$networkPlan", "Collection options must be explicit boolean values."));
		showAllTab = normalizeHierarchyShowAllTab(viewMode, requestedShowAllTab);
		if (options.destinationCollectionInternalId !== undefined && options.destinationCollectionInternalId !== null) errors.push(diagnostic("UNEXPECTED_NETWORK_DESTINATION", "$networkPlan.destinationCollectionInternalId", "New Collection scope does not target an existing collection."));
	} else if (scope === "new-folder") {
		destinationCollection = project.collections.find((collection) => collection.internalId === options.destinationCollectionInternalId) ?? null;
		if (destinationCollection === null) errors.push(diagnostic("NETWORK_DESTINATION_NOT_FOUND", "$networkPlan.destinationCollectionInternalId", "The captured destination collection no longer exists."));
		for (const key of ["collectionTitle", "hideCollectionTitle", "viewMode", "showAllTab", "pinToTop"]) {
			if (options[key] !== undefined && options[key] !== null) errors.push(diagnostic("UNEXPECTED_NETWORK_COLLECTION_OPTION", `$networkPlan.${key}`, "New Folder scope inherits the selected parent collection presentation."));
		}
	}
	if (errors.length > 0) return Object.freeze({ ok: false, plan: null, errors: Object.freeze(errors) });

	const evaluated = entries.map((entry) => {
		const outcome = inspectNetworkHierarchyPlacement(project, entry.draft, { destinationCollectionInternalId: destinationCollection?.internalId ?? null });
		return Object.freeze({
			networkId: entry.network.id,
			networkName: entry.network.name,
			editable: folderEditable(entry, folderTitleVisibility, artworkOrientation),
			sources: Object.freeze([Object.freeze({ draft: entry.draft })]),
			outcome,
		});
	});
	const readyFolders = scope === "new-folder"
		? evaluated.filter((folder) => folder.outcome.status !== NETWORK_PLACEMENT_STATUSES.ALREADY_IN_COLLECTION)
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
		planType: NETWORK_HIERARCHY_PLAN_TYPE,
		captured: Object.freeze({ projectInternalId: project.internalId, projectRevision: options.projectRevision }),
		configuration: Object.freeze({
			scope,
			collectionTitle,
			hideCollectionTitle,
			viewMode,
			showAllTab,
			pinToTop,
			folderTitleVisibility,
			artworkOrientation,
			sortOptionId,
			networks: Object.freeze(entries.map((entry) => Object.freeze({ network: entry.network, artwork: entry.artwork }))),
		}),
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
		artworkOrientation: plan.configuration.artworkOrientation,
		sortOptionId: plan.configuration.sortOptionId,
		networks: plan.configuration.networks,
	};
}

function comparablePlan(plan) {
	return JSON.stringify({ configuration: plan.configuration, destination: plan.destination, collections: plan.collections, folders: plan.folders, outcomes: plan.outcomes, counts: plan.counts });
}

export function validateNetworkHierarchyPlan(plan, { project, projectRevision } = {}) {
	if (!plainObject(plan) || plan.planType !== NETWORK_HIERARCHY_PLAN_TYPE || !plainObject(plan.captured) || !plainObject(plan.configuration)) {
		return Object.freeze({ ok: false, stale: false, errors: Object.freeze([diagnostic("INVALID_NETWORK_HIERARCHY_PLAN", "$networkPlan", "The Network hierarchy plan is malformed or unsupported.")]) });
	}
	if (!plainObject(project) || project.internalId !== plan.captured.projectInternalId) {
		return Object.freeze({ ok: false, stale: true, errors: Object.freeze([diagnostic("STALE_NETWORK_HIERARCHY_PLAN", "$networkPlan.captured", "The Builder project changed after this Network plan was prepared.")]) });
	}
	const rebuilt = createNetworkHierarchyPlan(project, rebuildOptions(plan));
	if (!rebuilt.ok || comparablePlan(rebuilt.plan) !== comparablePlan(plan)) {
		const stale = projectRevision !== plan.captured.projectRevision;
		return Object.freeze({ ok: false, stale, errors: Object.freeze([diagnostic(stale ? "STALE_NETWORK_HIERARCHY_PLAN" : "INVALID_NETWORK_HIERARCHY_PLAN", "$networkPlan", stale ? "Network placement changed. Review a new plan before creating it." : "The Network plan no longer matches its validated configuration.")]) });
	}
	return Object.freeze({ ok: true, stale: false, errors: Object.freeze([]) });
}

export function applyNetworkHierarchyPlan(controller, plan) {
	if (!controller || typeof controller.getState !== "function") return Object.freeze({ ok: false, errors: Object.freeze([diagnostic("INVALID_NETWORK_CONTROLLER", "$networkPlan.controller", "A Builder controller is required to apply the Network plan.")]), warnings: Object.freeze([]) });
	const state = controller.getState();
	const validation = validateNetworkHierarchyPlan(plan, { project: state.project, projectRevision: state.revision });
	if (!validation.ok) return Object.freeze({ ok: false, stale: validation.stale, errors: validation.errors, warnings: Object.freeze([]) });
	if (plan.counts.folderCount === 0) return Object.freeze({ ok: false, errors: Object.freeze([diagnostic("NO_NETWORK_FOLDERS_READY", "$networkPlan.folders", "No new Network folders are ready to create here.")]), warnings: Object.freeze([]) });
	const bundlesFor = (folders) => folders.map((folder) => ({
		folder: { editable: folder.editable },
		sources: folder.sources.map((source) => source.draft),
	}));
	const result = plan.configuration.scope === "new-collection"
		? controller.createCollectionsWithFoldersAndSources({ bundles: plan.collections.map((collection) => ({ collection: { editable: collection.editable }, folders: bundlesFor(collection.folders) })) })
		: controller.createFoldersWithSources(plan.destination.collectionInternalId, { bundles: bundlesFor(plan.folders) });
	return result.ok ? { ...result, counts: plan.counts } : result;
}
