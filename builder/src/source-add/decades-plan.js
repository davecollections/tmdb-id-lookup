import { discoverSourceIdentity, discoverSourceNodeIdentity } from "../nuvio/discover.js";
import { isInvisibleNuvioTitle, NUVIO_INVISIBLE_TITLE } from "../nuvio/titles.js";
import { buildDecadesSourceDrafts } from "./decades-source.js";
import { equalDecadesStructures, isDecadesStructure } from "./decades-structural.js";
import { normalizeHierarchyShowAllTab } from "./hierarchy-presentation.js";

export const DECADES_CREATION_SCOPES = Object.freeze([
	Object.freeze({ id: "new-collection", label: "New Collection" }),
	Object.freeze({ id: "new-folder", label: "New Folder" }),
]);

export const DECADES_COLLECTION_LAYOUTS = Object.freeze([
	Object.freeze({ id: "separate-media-collections", label: "Separate media collections" }),
	Object.freeze({ id: "mixed-collection", label: "One mixed collection" }),
]);

export const DECADES_PLACEMENT_STATUSES = Object.freeze({
	READY: "ready-to-create",
	ALREADY_IN_FOLDER: "already-in-this-folder",
	ALREADY_IN_COLLECTION: "already-in-this-collection",
	PARTLY_IN_COLLECTION: "partly-in-this-collection",
	EXISTS_ELSEWHERE: "exists-elsewhere",
});

export const DECADES_HIERARCHY_PLAN_TYPE = "decades-hierarchy-plan";

const PLAN_OPTION_KEYS = new Set([
	"scope",
	"projectRevision",
	"destinationCollectionInternalId",
	"layout",
	"viewMode",
	"showAllTab",
	"pinToTop",
	"hideCollectionTitle",
	"folderTileShape",
	"folderTitleVisibility",
	"collectionTitles",
	"source",
]);
const COLLECTION_VIEW_MODES = new Set(["TABBED_GRID", "ROWS"]);
const FOLDER_TILE_SHAPES = new Set(["POSTER", "LANDSCAPE"]);
const FOLDER_TITLE_VISIBILITIES = new Set(["SHOW_EVERYWHERE", "HIDE_HOME_SCREEN", "HIDE_EVERYWHERE"]);

function diagnostic(code, path, message) {
	return Object.freeze({ code, path, message });
}

function plainObject(value) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

function occurrencesFor(project, identities) {
	const selected = new Set(identities);
	const occurrences = [];
	for (const collection of project?.collections ?? []) {
		for (const folder of collection.folders ?? []) {
			for (const source of folder.sources ?? []) {
				const identity = discoverSourceNodeIdentity(source);
				if (!identity.comparable || !selected.has(identity.key)) continue;
				occurrences.push(Object.freeze({
					identity: identity.key,
					collectionInternalId: collection.internalId,
					collectionTitle: typeof collection.editable?.title === "string" ? collection.editable.title : "",
					folderInternalId: folder.internalId,
					folderTitle: typeof folder.editable?.title === "string" ? folder.editable.title : "",
					sourceInternalId: source.internalId,
					sourceTitle: typeof source.editable?.title === "string" ? source.editable.title : "",
				}));
			}
		}
	}
	return occurrences;
}

export function inspectDecadesSourcePlacement(project, drafts, {
	destinationCollectionInternalId = null,
	destinationFolderInternalId = null,
} = {}) {
	if (!Array.isArray(drafts)) return Object.freeze({ status: DECADES_PLACEMENT_STATUSES.READY, sourceOutcomes: Object.freeze([]), occurrences: Object.freeze([]) });
	const identities = drafts.map((draft) => discoverSourceIdentity(draft?.editable));
	if (identities.some((identity) => !identity.comparable)) return null;
	const occurrences = occurrencesFor(project, identities.map((identity) => identity.key));
	const sourceOutcomes = drafts.map((draft, index) => {
		const identity = identities[index].key;
		const matches = occurrences.filter((entry) => entry.identity === identity);
		const inFolder = destinationFolderInternalId === null ? [] : matches.filter((entry) => entry.folderInternalId === destinationFolderInternalId);
		const inCollection = destinationCollectionInternalId === null ? [] : matches.filter((entry) => entry.collectionInternalId === destinationCollectionInternalId);
		const elsewhere = matches.filter((entry) => (
			destinationCollectionInternalId === null || entry.collectionInternalId !== destinationCollectionInternalId
		));
		const status = inFolder.length > 0
			? DECADES_PLACEMENT_STATUSES.ALREADY_IN_FOLDER
			: inCollection.length > 0
				? DECADES_PLACEMENT_STATUSES.ALREADY_IN_COLLECTION
				: elsewhere.length > 0
					? DECADES_PLACEMENT_STATUSES.EXISTS_ELSEWHERE
					: DECADES_PLACEMENT_STATUSES.READY;
		return Object.freeze({
			identity,
			status,
			draft,
			occurrences: Object.freeze(matches),
		});
	});
	const destinationMatches = sourceOutcomes.filter((entry) => (
		entry.status === DECADES_PLACEMENT_STATUSES.ALREADY_IN_FOLDER
		|| entry.status === DECADES_PLACEMENT_STATUSES.ALREADY_IN_COLLECTION
	));
	let status = DECADES_PLACEMENT_STATUSES.READY;
	if (sourceOutcomes.length > 0 && sourceOutcomes.every((entry) => entry.status === DECADES_PLACEMENT_STATUSES.ALREADY_IN_FOLDER)) {
		status = DECADES_PLACEMENT_STATUSES.ALREADY_IN_FOLDER;
	} else if (sourceOutcomes.length > 0 && destinationMatches.length === sourceOutcomes.length) {
		status = DECADES_PLACEMENT_STATUSES.ALREADY_IN_COLLECTION;
	} else if (destinationMatches.length > 0) {
		status = DECADES_PLACEMENT_STATUSES.PARTLY_IN_COLLECTION;
	} else if (sourceOutcomes.some((entry) => entry.status === DECADES_PLACEMENT_STATUSES.EXISTS_ELSEWHERE)) {
		status = DECADES_PLACEMENT_STATUSES.EXISTS_ELSEWHERE;
	}
	return Object.freeze({
		status,
		sourceOutcomes: Object.freeze(sourceOutcomes),
		occurrences: Object.freeze(occurrences),
	});
}

function findCollection(project, internalId) {
	return project?.collections?.find((collection) => collection.internalId === internalId) ?? null;
}

function sourceEntryKey(entry) {
	if (entry.contentKind === "whole-decade") return "whole";
	if (entry.contentKind === "individual-year") return `year:${entry.period.id}`;
	return `genre:${entry.genreName}`;
}

function titleForPhysicalFolder(entry, mixedMedia) {
	const base = entry.contentKind === "whole-decade"
		? `All ${entry.period.label}`
		: entry.contentKind === "individual-year"
			? entry.period.label
			: entry.genreName;
	if (!mixedMedia) return base;
	return `${base} ${entry.draft.editable.mediaType === "MOVIE" ? "Movies" : "Series"}`;
}

function withPhysicalFolderTitle(entry, mixedMedia) {
	return Object.freeze({
		...entry,
		draft: Object.freeze({
			...entry.draft,
			editable: Object.freeze({
				...entry.draft.editable,
				title: titleForPhysicalFolder(entry, mixedMedia),
			}),
		}),
	});
}

function pairableSourceOrder(entries, sourcePlan, decadeId) {
	const contentRank = { "whole-decade": 0, "individual-year": 1, "genre-breakdown": 2 };
	const yearKeys = [];
	for (const entry of entries) {
		if (entry.contentKind !== "individual-year") continue;
		const key = sourceEntryKey(entry);
		if (!yearKeys.includes(key)) yearKeys.push(key);
	}
	const genreNames = sourcePlan.configuration.genreNamesByDecade[decadeId] ?? [];
	return [...entries].sort((left, right) => {
		const kindDifference = contentRank[left.contentKind] - contentRank[right.contentKind];
		if (kindDifference !== 0) return kindDifference;
		if (left.contentKind === "individual-year") {
			const periodDifference = yearKeys.indexOf(sourceEntryKey(left)) - yearKeys.indexOf(sourceEntryKey(right));
			if (periodDifference !== 0) return periodDifference;
		}
		if (left.contentKind === "genre-breakdown") {
			const genreDifference = genreNames.indexOf(left.genreName) - genreNames.indexOf(right.genreName);
			if (genreDifference !== 0) return genreDifference;
		}
		return (left.draft.editable.mediaType === "MOVIE" ? 0 : 1)
			- (right.draft.editable.mediaType === "MOVIE" ? 0 : 1);
	});
}

function sourceGroupsFor(sourcePlan, decadeId, mediaTypes) {
	let entries = mediaTypes.flatMap((mediaType) => sourcePlan.groups
		.filter((group) => group.decadeId === decadeId && group.mediaType === mediaType)
		.flatMap((group) => group.sources));
	const physicalMedia = new Set(entries.map((entry) => entry.draft.editable.mediaType));
	const mixedMedia = physicalMedia.size > 1;
	if (mixedMedia && sourcePlan.configuration.sourceGrouping === "paired") {
		entries = pairableSourceOrder(entries, sourcePlan, decadeId);
	}
	return entries.map((entry) => withPhysicalFolderTitle(entry, mixedMedia));
}

function orderedDecadeIds(sourcePlan) {
	const ids = [];
	for (const group of sourcePlan.groups) {
		if (!ids.includes(group.decadeId)) ids.push(group.decadeId);
	}
	return ids;
}

function collectionEditable(title, { viewMode, showAllTab, pinToTop, hideCollectionTitle }) {
	return Object.freeze({
		title: hideCollectionTitle ? NUVIO_INVISIBLE_TITLE : title,
		pinToTop,
		focusGlowEnabled: true,
		viewMode,
		showAllTab,
	});
}

function folderEditable(title, { folderTileShape, folderTitleVisibility }) {
	return Object.freeze({
		title: folderTitleVisibility === "HIDE_EVERYWHERE" ? NUVIO_INVISIBLE_TITLE : title,
		tileShape: folderTileShape,
		hideTitle: folderTitleVisibility !== "SHOW_EVERYWHERE",
	});
}

function normalizeCollectionTitles(value, roles, errors) {
	const defaults = { movies: "Movie Decades", series: "TV Decades", mixed: "Decades" };
	const supplied = value ?? {};
	if (!plainObject(supplied) || Object.keys(supplied).some((key) => !roles.includes(key))) {
		errors.push(diagnostic("INVALID_DECADES_COLLECTION_TITLES", "$decadesPlan.collectionTitles", "Collection title proposals must match the planned collection roles."));
	}
	const titles = {};
	for (const role of roles) {
		const title = plainObject(supplied) && Object.hasOwn(supplied, role) ? supplied[role] : defaults[role];
		if (typeof title !== "string" || title.trim().length === 0) {
			errors.push(diagnostic("INVALID_DECADES_COLLECTION_TITLE", `$decadesPlan.collectionTitles.${role}`, "Collection title proposals must be nonblank strings."));
		} else titles[role] = title;
	}
	return Object.freeze(titles);
}

function titleCollisions(project, title) {
	return Object.freeze((project?.collections ?? [])
		.filter((collection) => collection.editable?.title === title)
		.map((collection) => Object.freeze({
			collectionInternalId: collection.internalId,
			collectionTitle: collection.editable.title,
		})));
}

function outcomeForFolder(project, sourceEntries, options = {}) {
	const placement = inspectDecadesSourcePlacement(project, sourceEntries.map((entry) => entry.draft), options);
	return Object.freeze({
		status: placement.status,
		sourceOutcomes: placement.sourceOutcomes,
		occurrences: placement.occurrences,
	});
}

function buildNewCollectionPlan(project, sourcePlan, {
	layout,
	viewMode,
	showAllTab,
	pinToTop,
	hideCollectionTitle,
	folderTileShape,
	folderTitleVisibility,
	collectionTitles,
}) {
	const mediaMode = sourcePlan.configuration.mediaMode;
	const roles = mediaMode === "movies"
		? [{ role: "movies", mediaTypes: ["MOVIE"] }]
		: mediaMode === "series"
			? [{ role: "series", mediaTypes: ["TV"] }]
			: layout === "mixed-collection"
				? [{ role: "mixed", mediaTypes: ["MOVIE", "TV"] }]
				: [{ role: "movies", mediaTypes: ["MOVIE"] }, { role: "series", mediaTypes: ["TV"] }];
	const collections = roles.map(({ role, mediaTypes }) => {
		const folders = orderedDecadeIds(sourcePlan).map((decadeId) => {
			const group = sourcePlan.groups.find((entry) => entry.decadeId === decadeId);
			const sources = sourceGroupsFor(sourcePlan, decadeId, mediaTypes);
			return Object.freeze({
				decadeId,
				editable: folderEditable(group.decadeLabel, { folderTileShape, folderTitleVisibility }),
				sources: Object.freeze(sources),
				outcome: outcomeForFolder(project, sources),
			});
		});
		return Object.freeze({
			role,
			editable: collectionEditable(collectionTitles[role], { viewMode, showAllTab, pinToTop, hideCollectionTitle }),
			titleCollisions: hideCollectionTitle ? Object.freeze([]) : titleCollisions(project, collectionTitles[role]),
			folders: Object.freeze(folders),
		});
	});
	return Object.freeze({ collections: Object.freeze(collections), folders: Object.freeze([]), outcomes: Object.freeze(collections.flatMap((collection) => collection.folders.map((folder) => folder.outcome))) });
}

function buildNewFolderPlan(project, sourcePlan, destinationCollection, { folderTileShape, folderTitleVisibility }) {
	const mediaTypes = sourcePlan.configuration.mediaMode === "movies"
		? ["MOVIE"]
		: sourcePlan.configuration.mediaMode === "series" ? ["TV"] : ["MOVIE", "TV"];
	const evaluated = orderedDecadeIds(sourcePlan).map((decadeId) => {
		const group = sourcePlan.groups.find((entry) => entry.decadeId === decadeId);
		const sources = sourceGroupsFor(sourcePlan, decadeId, mediaTypes);
		const outcome = outcomeForFolder(project, sources, { destinationCollectionInternalId: destinationCollection.internalId });
		const titleMatches = destinationCollection.folders
			.filter((folder) => folder.editable?.title === group.decadeLabel)
			.map((folder) => Object.freeze({ folderInternalId: folder.internalId, folderTitle: folder.editable.title }));
		return Object.freeze({
			decadeId,
			editable: folderEditable(group.decadeLabel, { folderTileShape, folderTitleVisibility }),
			sources: Object.freeze(sources),
			outcome,
			titleCollisions: Object.freeze(titleMatches),
		});
	});
	const blocked = new Set([
		DECADES_PLACEMENT_STATUSES.ALREADY_IN_FOLDER,
		DECADES_PLACEMENT_STATUSES.ALREADY_IN_COLLECTION,
		DECADES_PLACEMENT_STATUSES.PARTLY_IN_COLLECTION,
	]);
	return Object.freeze({
		collections: Object.freeze([]),
		folders: Object.freeze(evaluated.filter((folder) => !blocked.has(folder.outcome.status))),
		outcomes: Object.freeze(evaluated.map((folder) => folder.outcome)),
	});
}

function deriveCounts(hierarchy) {
	const collectionFolders = hierarchy.collections.flatMap((collection) => collection.folders);
	const folders = [...collectionFolders, ...hierarchy.folders];
	return Object.freeze({
		collectionCount: hierarchy.collections.length,
		folderCount: folders.length,
		sourceCount: folders.reduce((count, folder) => count + folder.sources.length, 0),
	});
}

export function createDecadesHierarchyPlan(project, options) {
	const errors = [];
	if (!plainObject(project) || project.nodeType !== "project" || !Array.isArray(project.collections)) {
		errors.push(diagnostic("INVALID_DECADES_PROJECT", "$decadesPlan.project", "Decades planning requires the current Builder project."));
	}
	if (!plainObject(options) || Object.keys(options).some((key) => !PLAN_OPTION_KEYS.has(key))) {
		errors.push(diagnostic("INVALID_DECADES_PLAN_OPTIONS", "$decadesPlan", "Decades hierarchy planning received an unsupported option."));
	}
	if (errors.length > 0) return Object.freeze({ ok: false, plan: null, errors: Object.freeze(errors) });
	if (!Number.isSafeInteger(options.projectRevision) || options.projectRevision < 0) {
		errors.push(diagnostic("INVALID_DECADES_PROJECT_REVISION", "$decadesPlan.projectRevision", "Capture the current nonnegative Builder revision."));
	}
	const scope = DECADES_CREATION_SCOPES.find((entry) => entry.id === options.scope)?.id ?? null;
	if (scope === null) errors.push(diagnostic("INVALID_DECADES_SCOPE", "$decadesPlan.scope", "Choose New Collection or New Folder scope."));
	const sourcePlan = buildDecadesSourceDrafts(options.source);
	if (!sourcePlan.ok) errors.push(...sourcePlan.errors);

	let layout = null;
	let viewMode = null;
	let showAllTab = null;
	let pinToTop = null;
	let hideCollectionTitle = null;
	const folderTileShape = options.folderTileShape ?? "POSTER";
	const folderTitleVisibility = options.folderTitleVisibility ?? "SHOW_EVERYWHERE";
	let collectionTitles = Object.freeze({});
	let destinationCollection = null;
	if (!FOLDER_TILE_SHAPES.has(folderTileShape)) errors.push(diagnostic("INVALID_DECADES_FOLDER_TILE_SHAPE", "$decadesPlan.folderTileShape", "Decade folders must use the existing Poster or Landscape value."));
	if (!FOLDER_TITLE_VISIBILITIES.has(folderTitleVisibility)) errors.push(diagnostic("INVALID_DECADES_FOLDER_TITLE_VISIBILITY", "$decadesPlan.folderTitleVisibility", "Choose an existing folder-title visibility outcome."));
	if (scope === "new-collection" && sourcePlan.ok) {
		if (sourcePlan.configuration.mediaMode === "both") {
			layout = options.layout ?? "separate-media-collections";
			if (!DECADES_COLLECTION_LAYOUTS.some((entry) => entry.id === layout)) {
				errors.push(diagnostic("INVALID_DECADES_LAYOUT", "$decadesPlan.layout", "Both media requires Separate media collections or One mixed collection."));
			}
		} else if (options.layout !== undefined && options.layout !== null) {
			errors.push(diagnostic("UNEXPECTED_DECADES_LAYOUT", "$decadesPlan.layout", "A media layout is only applicable when Both is selected."));
		}
		viewMode = options.viewMode ?? "TABBED_GRID";
		if (!COLLECTION_VIEW_MODES.has(viewMode)) errors.push(diagnostic("INVALID_DECADES_VIEW_MODE", "$decadesPlan.viewMode", "New Decades collections must use the existing Tabs or Rows value."));
		const requestedShowAllTab = options.showAllTab ?? true;
		pinToTop = options.pinToTop ?? false;
		hideCollectionTitle = options.hideCollectionTitle ?? false;
		if (typeof requestedShowAllTab !== "boolean") errors.push(diagnostic("INVALID_DECADES_ALL_TAB", "$decadesPlan.showAllTab", "The All-tab preference must be true or false."));
		showAllTab = normalizeHierarchyShowAllTab(viewMode, requestedShowAllTab);
		if (typeof pinToTop !== "boolean") errors.push(diagnostic("INVALID_DECADES_PIN_TO_TOP", "$decadesPlan.pinToTop", "The pin-to-top preference must be true or false."));
		if (typeof hideCollectionTitle !== "boolean") errors.push(diagnostic("INVALID_DECADES_COLLECTION_TITLE_VISIBILITY", "$decadesPlan.hideCollectionTitle", "The collection-title visibility preference must be true or false."));
		const roles = sourcePlan.configuration.mediaMode === "movies"
			? ["movies"]
			: sourcePlan.configuration.mediaMode === "series"
				? ["series"]
				: layout === "mixed-collection" ? ["mixed"] : ["movies", "series"];
		collectionTitles = normalizeCollectionTitles(options.collectionTitles, roles, errors);
		if (options.destinationCollectionInternalId !== undefined) errors.push(diagnostic("UNEXPECTED_DECADES_DESTINATION", "$decadesPlan.destinationCollectionInternalId", "New Collection scope does not target an existing collection."));
	} else if (scope === "new-folder") {
		if (typeof options.destinationCollectionInternalId !== "string" || options.destinationCollectionInternalId.length === 0) {
			errors.push(diagnostic("INVALID_DECADES_DESTINATION", "$decadesPlan.destinationCollectionInternalId", "New Folder scope requires one captured destination collection."));
		} else {
			destinationCollection = findCollection(project, options.destinationCollectionInternalId);
			if (destinationCollection === null) errors.push(diagnostic("DECADES_DESTINATION_NOT_FOUND", "$decadesPlan.destinationCollectionInternalId", "The captured destination collection no longer exists."));
		}
		if (options.layout !== undefined && options.layout !== null) errors.push(diagnostic("UNEXPECTED_DECADES_LAYOUT", "$decadesPlan.layout", "New Folder scope does not create a parent collection layout."));
		if (options.viewMode !== undefined && options.viewMode !== null) errors.push(diagnostic("UNEXPECTED_DECADES_VIEW_MODE", "$decadesPlan.viewMode", "New Folder scope inherits the parent collection presentation."));
		if (options.showAllTab !== undefined && options.showAllTab !== null) errors.push(diagnostic("UNEXPECTED_DECADES_ALL_TAB", "$decadesPlan.showAllTab", "New Folder scope inherits the parent collection presentation."));
		if (options.pinToTop !== undefined && options.pinToTop !== null) errors.push(diagnostic("UNEXPECTED_DECADES_PIN_TO_TOP", "$decadesPlan.pinToTop", "New Folder scope cannot pin or unpin the parent collection."));
		if (options.hideCollectionTitle !== undefined && options.hideCollectionTitle !== null) errors.push(diagnostic("UNEXPECTED_DECADES_COLLECTION_TITLE_VISIBILITY", "$decadesPlan.hideCollectionTitle", "New Folder scope cannot change the parent collection title."));
		if (options.collectionTitles !== undefined && Object.keys(options.collectionTitles ?? {}).length > 0) errors.push(diagnostic("UNEXPECTED_DECADES_COLLECTION_TITLES", "$decadesPlan.collectionTitles", "New Folder scope does not propose a parent collection title."));
	}
	if (errors.length > 0) return Object.freeze({ ok: false, plan: null, errors: Object.freeze(errors) });

	const configuration = Object.freeze({
		scope,
		layout,
		viewMode,
		showAllTab,
		pinToTop,
		hideCollectionTitle,
		folderTileShape,
		folderTitleVisibility,
		collectionTitles,
		source: sourcePlan.configuration,
	});
	const hierarchy = scope === "new-collection"
		? buildNewCollectionPlan(project, sourcePlan, { layout, viewMode, showAllTab, pinToTop, hideCollectionTitle, folderTileShape, folderTitleVisibility, collectionTitles })
		: buildNewFolderPlan(project, sourcePlan, destinationCollection, { folderTileShape, folderTitleVisibility });
	const destination = scope === "new-folder" ? Object.freeze({
		collectionInternalId: destinationCollection.internalId,
		collectionTitle: typeof destinationCollection.editable?.title === "string" ? destinationCollection.editable.title : "",
		viewMode: Object.hasOwn(destinationCollection.editable ?? {}, "viewMode") ? destinationCollection.editable.viewMode : null,
		showAllTab: Object.hasOwn(destinationCollection.editable ?? {}, "showAllTab") ? destinationCollection.editable.showAllTab : null,
		pinToTop: Object.hasOwn(destinationCollection.editable ?? {}, "pinToTop") ? destinationCollection.editable.pinToTop : null,
		titleHidden: isInvisibleNuvioTitle(destinationCollection.editable?.title),
	}) : null;
	const plan = Object.freeze({
		planType: DECADES_HIERARCHY_PLAN_TYPE,
		captured: Object.freeze({
			projectInternalId: project.internalId,
			projectRevision: options.projectRevision,
		}),
		configuration,
		destination,
		collections: hierarchy.collections,
		folders: hierarchy.folders,
		outcomes: hierarchy.outcomes,
		counts: deriveCounts(hierarchy),
	});
	return Object.freeze({ ok: true, plan, errors: Object.freeze([]) });
}

function planOptions(plan) {
	return {
		scope: plan.configuration.scope,
		projectRevision: plan.captured.projectRevision,
		...(plan.destination ? { destinationCollectionInternalId: plan.destination.collectionInternalId } : {}),
		layout: plan.configuration.layout,
		viewMode: plan.configuration.viewMode,
		showAllTab: plan.configuration.showAllTab,
		pinToTop: plan.configuration.pinToTop,
		hideCollectionTitle: plan.configuration.hideCollectionTitle,
		folderTileShape: plan.configuration.folderTileShape,
		folderTitleVisibility: plan.configuration.folderTitleVisibility,
		collectionTitles: plan.configuration.collectionTitles,
		source: plan.configuration.source,
	};
}

export function validateDecadesHierarchyPlan(plan, { project, projectRevision } = {}) {
	const errors = [];
	if (
		!isDecadesStructure(plan)
		|| !plainObject(plan)
		|| plan.planType !== DECADES_HIERARCHY_PLAN_TYPE
		|| !plainObject(plan.captured)
		|| !plainObject(plan.configuration)
	) {
		return Object.freeze({ ok: false, stale: false, errors: Object.freeze([
			diagnostic("INVALID_DECADES_HIERARCHY_PLAN", "$decadesPlan", "The Decades hierarchy plan is malformed or unsupported."),
		]) });
	}
	if (
		!plainObject(project)
		|| project.internalId !== plan.captured.projectInternalId
	) {
		return Object.freeze({ ok: false, stale: true, errors: Object.freeze([
			diagnostic("STALE_DECADES_HIERARCHY_PLAN", "$decadesPlan.captured", "The Builder changed after this Decades plan was prepared. Review a new plan before creating it."),
		]) });
	}
	const rebuilt = createDecadesHierarchyPlan(project, planOptions(plan));
	if (!rebuilt.ok || !equalDecadesStructures(rebuilt.plan, plan)) {
		const stale = projectRevision !== plan.captured.projectRevision;
		return Object.freeze({ ok: false, stale, errors: Object.freeze([
			diagnostic(
				stale ? "STALE_DECADES_HIERARCHY_PLAN" : "INVALID_DECADES_HIERARCHY_PLAN",
				"$decadesPlan",
				stale
					? "The Builder conditions relevant to this Decades plan changed. Review a new plan before creating it."
					: "The Decades hierarchy plan no longer matches its validated configuration and project evidence.",
			),
		]) });
	}
	return Object.freeze({ ok: errors.length === 0, stale: false, errors: Object.freeze(errors) });
}

export function applyDecadesHierarchyPlan(controller, plan) {
	if (!controller || typeof controller.getState !== "function") {
		return Object.freeze({ ok: false, errors: Object.freeze([diagnostic("INVALID_DECADES_CONTROLLER", "$decadesPlan.controller", "A Builder controller is required to apply the Decades plan.")]), warnings: Object.freeze([]) });
	}
	const state = controller.getState();
	const validation = validateDecadesHierarchyPlan(plan, { project: state.project, projectRevision: state.revision });
	if (!validation.ok) return Object.freeze({ ok: false, errors: validation.errors, warnings: Object.freeze([]), stale: validation.stale });

	if (plan.configuration.scope === "new-collection") {
		const result = controller.createCollectionsWithFoldersAndSources({
			bundles: plan.collections.map((collection) => ({
				collection: { editable: collection.editable },
				folders: collection.folders.map((folder) => ({
					folder: { editable: folder.editable },
					sources: folder.sources.map((entry) => entry.draft),
				})),
			})),
		});
		return result.ok ? { ...result, counts: plan.counts } : result;
	}
	if (plan.folders.length === 0) {
		return Object.freeze({ ok: false, errors: Object.freeze([diagnostic("NO_DECADES_FOLDERS_READY", "$decadesPlan.folders", "No new Decade folders are ready to create in this collection.")]), warnings: Object.freeze([]) });
	}
	const result = controller.createFoldersWithSources(plan.destination.collectionInternalId, {
		bundles: plan.folders.map((folder) => ({
			folder: { editable: folder.editable },
			sources: folder.sources.map((entry) => entry.draft),
		})),
	});
	return result.ok ? { ...result, counts: plan.counts } : result;
}
