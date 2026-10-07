import { COLLECTION_VIEW_MODES } from "../nuvio/collection-presentation.js";
import { inspectNativeHierarchyPlacement, nativeHierarchyCounts, resolveNativeHierarchyPlacements } from "./native-source-variants.js";
import { isInvisibleNuvioTitle, NUVIO_INVISIBLE_TITLE } from "../nuvio/titles.js";
import { normalizeHierarchyShowAllTab } from "./hierarchy-presentation.js";
import { peopleSourceVariantKey, peopleSourceIdentity, validatePeopleSourceDrafts } from "./person-source.js";
import { isPositiveSafePersonId } from "./tmdb-person-input.js";

export const PEOPLE_HIERARCHY_PLAN_TYPE = "people-hierarchy-plan";
export const PEOPLE_CREATION_SCOPES = Object.freeze([
	Object.freeze({ id: "new-collection", label: "New Collection" }),
	Object.freeze({ id: "new-folder", label: "New Folder" }),
]);
export const PEOPLE_PLACEMENT_STATUSES = Object.freeze({
	READY: "ready-to-create",
	ALREADY_IN_COLLECTION: "already-in-this-collection",
	PARTLY_IN_COLLECTION: "partly-in-this-collection",
	EXISTS_ELSEWHERE: "exists-elsewhere",
});

const OPTION_KEYS = new Set([
	"folderDestinations",
	"scope",
	"projectRevision",
	"destinationCollectionInternalId",
	"collectionTitle",
	"hideCollectionTitle",
	"viewMode",
	"showAllTab",
	"pinToTop",
	"folderTitleVisibility",
	"people",
]);
const collectionViewModes = new Set(COLLECTION_VIEW_MODES);
const FOLDER_TITLE_VISIBILITIES = new Set(["SHOW_EVERYWHERE", "HIDE_HOME_SCREEN", "HIDE_EVERYWHERE"]);
export const DEFAULT_PEOPLE_FOLDER_TITLE_VISIBILITY = "HIDE_HOME_SCREEN";

function plainObject(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function diagnostic(code, path, message) {
	return Object.freeze({ code, path, message });
}

function canonicalText(value) {
	return typeof value === "string" ? value.trim() : "";
}

export function inspectPeopleHierarchyPlacement(project, drafts, { destinationCollectionInternalId = null } = {}) {
	const placement = inspectNativeHierarchyPlacement(project, drafts, {
		destinationCollectionInternalId, structuralIdentity: peopleSourceIdentity, variantKey: peopleSourceVariantKey,
	});
	return placement ? Object.freeze({ ...placement, destinationPersonOccurrences: placement.destination }) : null;
}

function normalizePersonEntry(entry, index, errors) {
	const person = entry?.person;
	const name = canonicalText(person?.name);
	if (!isPositiveSafePersonId(person?.id) || !name || person.name !== name) {
		errors.push(diagnostic("INVALID_PEOPLE_PLAN_PERSON", `$peoplePlan.people[${index}].person`, "Each planned person needs a canonical TMDB identity and name."));
		return null;
	}
	const sourceValidation = validatePeopleSourceDrafts(entry.drafts, { person });
	if (!sourceValidation.ok) {
		errors.push(...sourceValidation.errors);
		return null;
	}
	if (!plainObject(entry.folderEditable) || entry.folderEditable.title !== name || !["POSTER", "LANDSCAPE"].includes(entry.folderEditable.tileShape)) {
		errors.push(diagnostic("INVALID_PEOPLE_PLAN_FOLDER", `$peoplePlan.people[${index}].folderEditable`, "Each person folder must use the canonical name and a supported Poster or Landscape shape."));
		return null;
	}
	return Object.freeze({
		person: Object.freeze({ ...person }),
		drafts: Object.freeze(entry.drafts.map((draft) => Object.freeze({ category: draft.category, editable: Object.freeze({ ...draft.editable, filters: Object.freeze({ ...draft.editable.filters }) }) }))),
		folderEditable: Object.freeze({ ...entry.folderEditable }),
	});
}

function titleCollisions(project, title) {
	return Object.freeze((project.collections ?? [])
		.filter((collection) => collection.editable?.title === title)
		.map((collection) => Object.freeze({ collectionInternalId: collection.internalId, collectionTitle: title })));
}

function applyFolderTitleVisibility(folderEditable, personName, folderTitleVisibility) {
	return Object.freeze({
		...folderEditable,
		title: folderTitleVisibility === "HIDE_EVERYWHERE" ? NUVIO_INVISIBLE_TITLE : personName,
		hideTitle: folderTitleVisibility !== "SHOW_EVERYWHERE",
	});
}

export function createPeopleHierarchyPlan(project, options) {
	const errors = [];
	if (!plainObject(project) || project.nodeType !== "project" || !Array.isArray(project.collections)) {
		errors.push(diagnostic("INVALID_PEOPLE_PLAN_PROJECT", "$peoplePlan.project", "People planning requires the current Builder project."));
	}
	if (!plainObject(options) || Object.keys(options).some((key) => !OPTION_KEYS.has(key))) {
		errors.push(diagnostic("INVALID_PEOPLE_PLAN_OPTIONS", "$peoplePlan", "People hierarchy planning received an unsupported option."));
	}
	if (errors.length > 0) return Object.freeze({ ok: false, plan: null, errors: Object.freeze(errors) });
	if (!Number.isSafeInteger(options.projectRevision) || options.projectRevision < 0) {
		errors.push(diagnostic("INVALID_PEOPLE_PLAN_REVISION", "$peoplePlan.projectRevision", "Capture the current nonnegative Builder revision."));
	}
	const scope = PEOPLE_CREATION_SCOPES.find((entry) => entry.id === options.scope)?.id ?? null;
	if (scope === null) errors.push(diagnostic("INVALID_PEOPLE_PLAN_SCOPE", "$peoplePlan.scope", "Choose New Collection or New Folder scope."));
	if (!Array.isArray(options.people) || options.people.length < 1) {
		errors.push(diagnostic("PEOPLE_PLAN_SELECTION_REQUIRED", "$peoplePlan.people", "Choose at least one person."));
	}
	const entries = Array.isArray(options.people)
		? options.people.map((entry, index) => normalizePersonEntry(entry, index, errors)).filter(Boolean)
		: [];
	const ids = entries.map((entry) => entry.person.id);
	if (new Set(ids).size !== ids.length) errors.push(diagnostic("DUPLICATE_PEOPLE_PLAN_PERSON", "$peoplePlan.people", "Each selected person may appear only once."));
	const folderTitleVisibility = options.folderTitleVisibility ?? DEFAULT_PEOPLE_FOLDER_TITLE_VISIBILITY;
	if (!FOLDER_TITLE_VISIBILITIES.has(folderTitleVisibility)) {
		errors.push(diagnostic("INVALID_PEOPLE_FOLDER_TITLE_VISIBILITY", "$peoplePlan.folderTitleVisibility", "Choose an existing folder-title visibility outcome."));
	}

	let collectionTitle = null;
	let hideCollectionTitle = null;
	let viewMode = null;
	let showAllTab = null;
	let pinToTop = null;
	let destinationCollection = null;
	if (scope === "new-collection") {
		collectionTitle = options.collectionTitle ?? "People";
		hideCollectionTitle = options.hideCollectionTitle ?? false;
		viewMode = options.viewMode ?? "TABBED_GRID";
		const requestedShowAllTab = options.showAllTab ?? true;
		pinToTop = options.pinToTop ?? false;
		if (typeof collectionTitle !== "string" || (hideCollectionTitle !== true && (!collectionTitle.trim() || collectionTitle !== collectionTitle.trim()))) errors.push(diagnostic("INVALID_PEOPLE_COLLECTION_TITLE", "$peoplePlan.collectionTitle", "The People collection name must be a nonblank trimmed string."));
		if (typeof hideCollectionTitle !== "boolean") errors.push(diagnostic("INVALID_PEOPLE_COLLECTION_TITLE_VISIBILITY", "$peoplePlan.hideCollectionTitle", "Collection title visibility must be true or false."));
		if (!collectionViewModes.has(viewMode)) errors.push(diagnostic("INVALID_PEOPLE_COLLECTION_VIEW", "$peoplePlan.viewMode", "Choose the Tabbed Grid, Rows or Follow Home Layout collection layout."));
		if (typeof requestedShowAllTab !== "boolean" || typeof pinToTop !== "boolean") errors.push(diagnostic("INVALID_PEOPLE_COLLECTION_OPTIONS", "$peoplePlan", "Collection options must be explicit boolean values."));
		showAllTab = normalizeHierarchyShowAllTab(viewMode, requestedShowAllTab);
		if (options.destinationCollectionInternalId !== undefined && options.destinationCollectionInternalId !== null) errors.push(diagnostic("UNEXPECTED_PEOPLE_DESTINATION", "$peoplePlan.destinationCollectionInternalId", "New Collection scope does not target an existing collection."));
	} else if (scope === "new-folder") {
		destinationCollection = project.collections.find((collection) => collection.internalId === options.destinationCollectionInternalId) ?? null;
		if (destinationCollection === null) errors.push(diagnostic("PEOPLE_DESTINATION_NOT_FOUND", "$peoplePlan.destinationCollectionInternalId", "The captured destination collection no longer exists."));
		for (const key of ["collectionTitle", "hideCollectionTitle", "viewMode", "showAllTab", "pinToTop"]) {
			if (options[key] !== undefined && options[key] !== null) errors.push(diagnostic("UNEXPECTED_PEOPLE_COLLECTION_OPTION", `$peoplePlan.${key}`, "New Folder scope inherits the selected parent collection presentation."));
		}
	}
	if (errors.length > 0) return Object.freeze({ ok: false, plan: null, errors: Object.freeze(errors) });

	const evaluated = entries.map((entry) => {
		const placement = inspectPeopleHierarchyPlacement(project, entry.drafts, {
			destinationCollectionInternalId: scope === "new-folder" ? destinationCollection.internalId : null,
		});
		return Object.freeze({
			personId: entry.person.id,
			personName: entry.person.name,
			editable: applyFolderTitleVisibility(entry.folderEditable, entry.person.name, folderTitleVisibility),
			sources: Object.freeze(entry.drafts.map((draft) => Object.freeze({ draft }))),
			outcome: placement,
		});
	});
	const placement = resolveNativeHierarchyPlacements(evaluated, destinationCollection?.internalId ?? null, options.folderDestinations);
	if (!placement) return Object.freeze({ ok: false, plan: null, errors: Object.freeze([diagnostic("INVALID_NATIVE_FOLDER_DESTINATION", "$plan.folderDestinations", "Choose a current matching folder for the new sources.")]) });
	const { placed, existingFolderAdditions } = placement;
	const readyFolders = placement.folders;
	const collections = scope === "new-collection" ? Object.freeze([Object.freeze({
		editable: Object.freeze({
			title: hideCollectionTitle ? NUVIO_INVISIBLE_TITLE : collectionTitle,
			pinToTop,
			focusGlowEnabled: true,
			viewMode,
			showAllTab,
		}),
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
		planType: PEOPLE_HIERARCHY_PLAN_TYPE,
		captured: Object.freeze({ projectInternalId: project.internalId, projectRevision: options.projectRevision }),
		configuration: Object.freeze({ folderDestinations: Object.freeze({ ...(options.folderDestinations ?? {}) }), scope, collectionTitle, hideCollectionTitle, viewMode, showAllTab, pinToTop, folderTitleVisibility, people: Object.freeze(entries) }),
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
		people: plan.configuration.people,
	};
}

function comparablePlan(plan) {
	return JSON.stringify({
		configuration: plan.configuration,
		destination: plan.destination,
		collections: plan.collections,
		folders: plan.folders, existingFolderAdditions: plan.existingFolderAdditions,
		outcomes: plan.outcomes,
		counts: plan.counts,
	});
}

export function validatePeopleHierarchyPlan(plan, { project, projectRevision } = {}) {
	if (!plainObject(plan) || plan.planType !== PEOPLE_HIERARCHY_PLAN_TYPE || !plainObject(plan.captured) || !plainObject(plan.configuration)) {
		return Object.freeze({ ok: false, stale: false, errors: Object.freeze([diagnostic("INVALID_PEOPLE_HIERARCHY_PLAN", "$peoplePlan", "The People hierarchy plan is malformed or unsupported.")]) });
	}
	if (!plainObject(project) || project.internalId !== plan.captured.projectInternalId) {
		return Object.freeze({ ok: false, stale: true, errors: Object.freeze([diagnostic("STALE_PEOPLE_HIERARCHY_PLAN", "$peoplePlan.captured", "The Builder project changed after this People plan was prepared.")]) });
	}
	const rebuilt = createPeopleHierarchyPlan(project, rebuildOptions(plan));
	if (!rebuilt.ok || comparablePlan(rebuilt.plan) !== comparablePlan(plan)) {
		const stale = projectRevision !== plan.captured.projectRevision;
		return Object.freeze({ ok: false, stale, errors: Object.freeze([diagnostic(stale ? "STALE_PEOPLE_HIERARCHY_PLAN" : "INVALID_PEOPLE_HIERARCHY_PLAN", "$peoplePlan", stale ? "People placement changed. Review a new plan before creating it." : "The People plan no longer matches its validated configuration.")]) });
	}
	return Object.freeze({ ok: true, stale: false, errors: Object.freeze([]) });
}

export function applyPeopleHierarchyPlan(controller, plan) {
	if (!controller || typeof controller.getState !== "function") return Object.freeze({ ok: false, errors: Object.freeze([diagnostic("INVALID_PEOPLE_CONTROLLER", "$peoplePlan.controller", "A Builder controller is required to apply the People plan.")]), warnings: Object.freeze([]) });
	const state = controller.getState();
	const validation = validatePeopleHierarchyPlan(plan, { project: state.project, projectRevision: state.revision });
	if (!validation.ok) return Object.freeze({ ok: false, stale: validation.stale, errors: validation.errors, warnings: Object.freeze([]) });
	if (plan.counts.sourceCount === 0 || plan.counts.unresolvedEntityCount > 0) return Object.freeze({ ok: false, errors: Object.freeze([diagnostic("NO_PEOPLE_SOURCES_READY", "$peoplePlan.folders", "Choose missing sources and resolve their destination folders.")]), warnings: Object.freeze([]) });
	const bundlesFor = (folders) => folders.map((folder) => ({
		folder: { editable: folder.editable },
		sources: folder.sources.map((source) => source.draft),
	}));
	const result = plan.configuration.scope === "new-collection"
		? controller.createCollectionsWithFoldersAndSources({ bundles: plan.collections.map((collection) => ({ collection: { editable: collection.editable }, folders: bundlesFor(collection.folders) })) })
		: controller.extendCollectionWithFoldersAndSources(plan.destination.collectionInternalId, { newFolders: bundlesFor(plan.folders), existingFolderAdditions: plan.existingFolderAdditions.map((addition) => ({ folderInternalId: addition.folderInternalId, sources: addition.sources.map((source) => source.draft) })) });
	return result.ok ? { ...result, counts: plan.counts } : result;
}
