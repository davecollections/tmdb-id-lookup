import {
	discoverSourceIdentity,
} from "../nuvio/discover.js";
import { isInvisibleNuvioTitle, isValidVisibleNuvioTitle, NUVIO_INVISIBLE_TITLE } from "../nuvio/titles.js";
import { normalizeHierarchyShowAllTab } from "./hierarchy-presentation.js";
import {
	hasStreamingCollectionAffinity,
	hasStreamingSourceEvidence,
	inspectSimpleStreamingSourceNode,
} from "./streaming-classification.js";
import {
	buildStreamingSourceDrafts,
	defaultStreamingFolderName,
	DEFAULT_STREAMING_SORT_OPTION_ID,
	inspectStreamingSourceDuplicates,
	STREAMING_MEDIA_CHOICES,
	STREAMING_SORT_OPTIONS,
	STREAMING_SOURCE_NAME_CONTEXTS,
	streamingMediaChoiceSupport,
} from "./streaming-source.js";

export const STREAMING_HIERARCHY_PLAN_TYPE = "streaming-services-hierarchy";
export const STREAMING_HIERARCHY_CREATION_SCOPES = Object.freeze(["new-collection", "new-folder"]);
export const STREAMING_HIERARCHY_GROUPING_MODES = Object.freeze([
	Object.freeze({ id: "group-by-service", label: "Group regions by service", description: "Create one folder per service with regional Movie and Series sources inside." }),
	Object.freeze({ id: "separate-by-region", label: "Separate folders by region", description: "Create one folder per service and region." }),
]);
export const DEFAULT_STREAMING_HIERARCHY_GROUPING_MODE = STREAMING_HIERARCHY_GROUPING_MODES[0].id;
export const DEFAULT_STREAMING_HIERARCHY_FOLDER_TITLE_VISIBILITY = "SHOW_EVERYWHERE";
export const STREAMING_HIERARCHY_PLACEMENT_STATUSES = Object.freeze({
	NEW_FOLDER: "new-folder",
	EXTEND_FOLDER: "extend-folder",
	COMPLETE: "complete",
	AMBIGUOUS: "ambiguous",
	SORT_CONFLICT: "sort-conflict",
});

const optionKeys = new Set([
	"scope",
	"projectRevision",
	"destinationCollectionInternalId",
	"collectionTitle",
	"hideCollectionTitle",
	"viewMode",
	"showAllTab",
	"pinToTop",
	"folderTitleVisibility",
	"folderTitleOverrides",
	"groupingMode",
	"regions",
	"mediaChoice",
	"sortOptionId",
	"providers",
]);
const folderTitleVisibilities = new Set(["SHOW_EVERYWHERE", "HIDE_HOME_SCREEN", "HIDE_EVERYWHERE"]);
const collectionViewModes = new Set(["TABBED_GRID", "ROWS"]);

function plainObject(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function canonicalText(value) {
	return typeof value === "string" ? value.trim() : "";
}

function diagnostic(code, path, message) {
	return Object.freeze({ code, path, message });
}

function normalizeRegions(regions, errors) {
	if (!Array.isArray(regions) || regions.length < 1) {
		errors.push(diagnostic("STREAMING_HIERARCHY_REGIONS_REQUIRED", "$streamingHierarchy.regions", "Choose at least one Streaming region."));
		return Object.freeze([]);
	}
	const seen = new Set();
	const normalized = [];
	for (const [index, region] of regions.entries()) {
		const code = canonicalText(region?.code).toUpperCase();
		const name = canonicalText(region?.name);
		if (!plainObject(region) || !/^[A-Z]{2}$/.test(code) || region.code !== code || !name || region.name !== name || seen.has(code)) {
			errors.push(diagnostic("INVALID_STREAMING_HIERARCHY_REGION", `$streamingHierarchy.regions[${index}]`, "Streaming regions must be distinct normalized catalogue entries."));
			continue;
		}
		seen.add(code);
		normalized.push(Object.freeze({ code, name }));
	}
	return Object.freeze(normalized);
}

function normalizePriorityMap(value) {
	if (!plainObject(value)) return null;
	const output = {};
	for (const [code, priority] of Object.entries(value)) {
		if (!/^[A-Z]{2}$/.test(code) || (priority !== null && (!Number.isSafeInteger(priority) || priority < 0))) return null;
		output[code] = priority;
	}
	return Object.freeze(output);
}

function normalizeProviders(providers, regionCodes, mediaChoice, errors) {
	if (!Array.isArray(providers) || providers.length < 1) {
		errors.push(diagnostic("STREAMING_HIERARCHY_PROVIDERS_REQUIRED", "$streamingHierarchy.providers", "Choose at least one Streaming service."));
		return Object.freeze([]);
	}
	const seen = new Set();
	const normalized = [];
	for (const [index, provider] of providers.entries()) {
		const name = canonicalText(provider?.name);
		const moviePriorities = normalizePriorityMap(provider?.moviePriorities);
		const tvPriorities = normalizePriorityMap(provider?.tvPriorities);
		if (!Number.isSafeInteger(provider?.id) || provider.id <= 0 || !name || provider.name !== name || moviePriorities === null || tvPriorities === null || seen.has(provider.id)) {
			errors.push(diagnostic("INVALID_STREAMING_HIERARCHY_PROVIDER", `$streamingHierarchy.providers[${index}]`, "Streaming services must be distinct normalized catalogue entries."));
			continue;
		}
		if (regionCodes.length > 0 && STREAMING_MEDIA_CHOICES.some((choice) => choice.id === mediaChoice) && !streamingMediaChoiceSupport(provider, regionCodes)[mediaChoice]) {
			errors.push(diagnostic("INELIGIBLE_STREAMING_HIERARCHY_PROVIDER", `$streamingHierarchy.providers[${index}]`, `${name} is not available for the selected media in every selected region.`));
			continue;
		}
		seen.add(provider.id);
		normalized.push(Object.freeze({
			id: provider.id,
			name,
			searchName: typeof provider.searchName === "string" ? provider.searchName : name.toLowerCase(),
			logoPath: typeof provider.logoPath === "string" ? provider.logoPath : null,
			moviePriorities,
			tvPriorities,
		}));
	}
	return Object.freeze(normalized);
}

function normalizeFolderTitleOverrides(value, errors) {
	if (value === undefined || value === null) return Object.freeze({});
	if (!plainObject(value)) {
		errors.push(diagnostic("INVALID_STREAMING_HIERARCHY_FOLDER_TITLES", "$streamingHierarchy.folderTitleOverrides", "Custom Streaming folder names must use stable planned-folder keys."));
		return Object.freeze({});
	}
	const normalized = {};
	for (const [key, title] of Object.entries(value)) {
		if (!key || !isValidVisibleNuvioTitle(title)) {
			errors.push(diagnostic("INVALID_STREAMING_HIERARCHY_FOLDER_TITLE", `$streamingHierarchy.folderTitleOverrides.${key}`, "Enter a folder title before applying changes."));
			continue;
		}
		normalized[key] = title;
	}
	return Object.freeze(normalized);
}

function occurrencesForDraft(duplicateReview, draft, bucket = "elsewhere") {
	const identity = discoverSourceIdentity(draft.editable);
	if (!identity.comparable) return Object.freeze([]);
	return Object.freeze((duplicateReview?.[bucket] ?? []).filter((entry) => entry.identity === identity.key));
}

function inspectFolderIdentity(folder, groupingMode) {
	const sources = [];
	let suspicious = false;
	for (const source of folder.sources ?? []) {
		const inspected = inspectSimpleStreamingSourceNode(source);
		if (inspected === null) {
			if (hasStreamingSourceEvidence(source)) suspicious = true;
			continue;
		}
		sources.push(Object.freeze({ source, inspected }));
	}
	if (sources.length === 0) return Object.freeze({ kind: suspicious ? "ambiguous" : "unrelated", providerIds: Object.freeze([]), regionCodes: Object.freeze([]), sources: Object.freeze([]) });
	const providerIds = Object.freeze([...new Set(sources.map((entry) => entry.inspected.providerId))]);
	const regionCodes = Object.freeze([...new Set(sources.map((entry) => entry.inspected.regionCode))]);
	const ambiguous = suspicious || providerIds.length !== 1 || (groupingMode === "separate-by-region" && regionCodes.length !== 1);
	return Object.freeze({
		kind: ambiguous ? "ambiguous" : "trusted",
		providerIds,
		regionCodes,
		providerId: providerIds.length === 1 ? providerIds[0] : null,
		regionCode: groupingMode === "separate-by-region" && regionCodes.length === 1 ? regionCodes[0] : null,
		sources: Object.freeze(sources),
	});
}

function logicalFolderKey(providerId, regionCode, groupingMode) {
	return groupingMode === "separate-by-region" ? `${providerId}|${regionCode}` : String(providerId);
}

function folderEditable(title, folderTitleVisibility) {
	return Object.freeze({
		title: folderTitleVisibility === "HIDE_EVERYWHERE" ? NUVIO_INVISIBLE_TITLE : title,
		tileShape: "POSTER",
		hideTitle: folderTitleVisibility !== "SHOW_EVERYWHERE",
	});
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

function titleCollisions(project, title) {
	return Object.freeze((project.collections ?? [])
		.filter((collection) => collection.editable?.title === title)
		.map((collection) => Object.freeze({ collectionInternalId: collection.internalId, collectionTitle: title })));
}

function desiredFolders(providers, regions, configuration, errors) {
	const folders = [];
	const regionCodes = regions.map((region) => region.code);
	const nameContext = configuration.groupingMode === "separate-by-region"
		? STREAMING_SOURCE_NAME_CONTEXTS.SEPARATE_BY_REGION
		: STREAMING_SOURCE_NAME_CONTEXTS.GROUPED_BY_SERVICE;
	for (const provider of providers) {
		const built = buildStreamingSourceDrafts(provider, {
			regionCodes,
			mediaChoice: configuration.mediaChoice,
			sortOptionId: configuration.sortOptionId,
			nameContext,
		});
		if (!built.ok) {
			errors.push(...built.errors);
			continue;
		}
		const regionGroups = configuration.groupingMode === "separate-by-region" ? regions : [null];
		for (const region of regionGroups) {
			const drafts = region === null ? built.drafts : built.drafts.filter((draft) => draft.editable.filters.watchRegion === region.code);
			const key = logicalFolderKey(provider.id, region?.code ?? null, configuration.groupingMode);
			const generatedTitle = defaultStreamingFolderName(provider.name, region?.code ?? null, { context: nameContext });
			const title = Object.hasOwn(configuration.folderTitleOverrides, key) ? configuration.folderTitleOverrides[key] : generatedTitle;
			folders.push(Object.freeze({
				key,
				provider: Object.freeze({ id: provider.id, name: provider.name, logoPath: provider.logoPath }),
				region: region === null ? null : region,
				generatedTitle,
				editable: folderEditable(title, configuration.folderTitleVisibility),
				drafts,
			}));
		}
	}
	return Object.freeze(folders);
}

function ambiguousAffectsDesired(inspection, desired, groupingMode) {
	if (!inspection.providerIds.includes(desired.provider.id)) return false;
	return groupingMode !== "separate-by-region"
		|| desired.region === null
		|| inspection.regionCodes.includes(desired.region.code);
}

function evaluateExistingPlacement(project, destinationCollection, desired, groupingMode) {
	const inspectedFolders = destinationCollection.folders.map((folder) => Object.freeze({ folder, inspection: inspectFolderIdentity(folder, groupingMode) }));
	const relevantAmbiguous = inspectedFolders.filter((entry) => entry.inspection.kind === "ambiguous" && ambiguousAffectsDesired(entry.inspection, desired, groupingMode));
	const trusted = inspectedFolders.filter((entry) => entry.inspection.kind === "trusted" && logicalFolderKey(entry.inspection.providerId, entry.inspection.regionCode, groupingMode) === desired.key);
	if (relevantAmbiguous.length > 0 || trusted.length > 1) {
		return Object.freeze({
			status: STREAMING_HIERARCHY_PLACEMENT_STATUSES.AMBIGUOUS,
			folderInternalId: null,
			sources: Object.freeze([]),
			missingDrafts: Object.freeze([]),
			conflicts: Object.freeze([diagnostic("AMBIGUOUS_STREAMING_HIERARCHY_PLACEMENT", "$streamingHierarchy.placement", `${desired.provider.name}${desired.region ? ` (${desired.region.code})` : ""} has mixed or ambiguous Streaming folder evidence and cannot be changed automatically.`)]),
		});
	}
	if (trusted.length === 0) {
		const duplicateReview = inspectStreamingSourceDuplicates(project, null, desired.drafts);
		const sources = desired.drafts.map((draft) => {
			return Object.freeze({ draft, status: "missing", destination: Object.freeze([]), elsewhere: occurrencesForDraft(duplicateReview, draft) });
		});
		return Object.freeze({ status: STREAMING_HIERARCHY_PLACEMENT_STATUSES.NEW_FOLDER, folderInternalId: null, sources: Object.freeze(sources), missingDrafts: desired.drafts, conflicts: Object.freeze([]) });
	}

	const target = trusted[0];
	const sourceOutcomes = [];
	const missingDrafts = [];
	const conflicts = [];
	const duplicateReview = inspectStreamingSourceDuplicates(project, target.folder.internalId, desired.drafts);
	for (const draft of desired.drafts) {
		const providerId = desired.provider.id;
		const regionCode = draft.editable.filters.watchRegion;
		const mediaType = draft.editable.mediaType;
		const slotEntries = target.inspection.sources.filter((entry) => (
			entry.inspected.providerId === providerId
			&& entry.inspected.regionCode === regionCode
			&& entry.inspected.mediaType === mediaType
		));
		const conflictingEntries = slotEntries.filter((entry) => entry.inspected.value.sortBy !== draft.editable.sortBy);
		const destination = occurrencesForDraft(duplicateReview, draft, "destination");
		const elsewhere = occurrencesForDraft(duplicateReview, draft);
		if (conflictingEntries.length > 0) {
			conflicts.push(diagnostic("STREAMING_HIERARCHY_SORT_CONFLICT", "$streamingHierarchy.placement", `${desired.provider.name} ${mediaType === "TV" ? "Series" : "Movies"} (${regionCode}) already uses a different Sort in this folder.`));
			sourceOutcomes.push(Object.freeze({ draft, status: "sort-conflict", destination, elsewhere }));
		} else if (destination.length > 0) {
			sourceOutcomes.push(Object.freeze({ draft, status: "complete", destination, elsewhere }));
		} else {
			missingDrafts.push(draft);
			sourceOutcomes.push(Object.freeze({ draft, status: "missing", destination, elsewhere }));
		}
	}
	return Object.freeze({
		status: conflicts.length > 0
			? STREAMING_HIERARCHY_PLACEMENT_STATUSES.SORT_CONFLICT
			: missingDrafts.length > 0
				? STREAMING_HIERARCHY_PLACEMENT_STATUSES.EXTEND_FOLDER
				: STREAMING_HIERARCHY_PLACEMENT_STATUSES.COMPLETE,
		folderInternalId: target.folder.internalId,
		folderTitle: canonicalText(target.folder.editable?.title),
		sources: Object.freeze(sourceOutcomes),
		missingDrafts: Object.freeze(missingDrafts),
		conflicts: Object.freeze(conflicts),
	});
}

function deriveNewCollectionElsewhereEvidence(plannedFolders) {
	const proposedSources = plannedFolders.flatMap((folder) => folder.sources.map((source) => ({ folder, source })));
	const matches = proposedSources.filter((entry) => entry.source.elsewhere.length > 0);
	const providerMatches = [];
	for (const folder of plannedFolders) {
		let providerMatch = providerMatches.find((entry) => entry.provider.id === folder.provider.id);
		if (!providerMatch) {
			providerMatch = { provider: folder.provider, sources: [], occurrences: [] };
			providerMatches.push(providerMatch);
		}
		for (const source of folder.sources) {
			if (source.elsewhere.length === 0) continue;
			providerMatch.sources.push(Object.freeze({
				title: source.draft.editable.title,
				mediaType: source.draft.editable.mediaType,
				regionCode: source.draft.editable.filters.watchRegion,
			}));
			providerMatch.occurrences.push(...source.elsewhere);
		}
	}
	const matchedProviders = providerMatches
		.filter((entry) => entry.sources.length > 0)
		.map((entry) => Object.freeze({
			provider: entry.provider,
			matchedSourceCount: entry.sources.length,
			sources: Object.freeze(entry.sources),
			occurrences: Object.freeze(entry.occurrences),
		}));
	return Object.freeze({
		overlap: matches.length === 0 ? "none" : matches.length === proposedSources.length ? "complete" : "partial",
		proposedSourceCount: proposedSources.length,
		matchedSourceCount: matches.length,
		providerMatches: Object.freeze(matchedProviders),
	});
}

function deriveCounts(scope, desired, newFolders, existingFolderAdditions, outcomes, conflicts) {
	const sourceCount = desired.reduce((total, folder) => total + folder.drafts.length, 0);
	const newFolderSourceCount = newFolders.reduce((total, folder) => total + folder.sources.length, 0);
	const appendedSourceCount = existingFolderAdditions.reduce((total, addition) => total + addition.sources.length, 0);
	const exactSourceCount = outcomes.reduce((total, outcome) => total + (outcome.sources ?? []).filter((source) => source.status === "complete").length, 0);
	return Object.freeze({
		collectionCount: scope === "new-collection" ? 1 : 0,
		folderCount: desired.length,
		sourceCount,
		newFolderCount: newFolders.length,
		existingFolderAdditionCount: existingFolderAdditions.length,
		newSourceCount: newFolderSourceCount + appendedSourceCount,
		exactSourceCount,
		conflictCount: conflicts.length,
	});
}

export function createStreamingHierarchyPlan(project, options) {
	const errors = [];
	if (!plainObject(project) || project.nodeType !== "project" || !Array.isArray(project.collections)) errors.push(diagnostic("INVALID_STREAMING_HIERARCHY_PROJECT", "$streamingHierarchy.project", "Streaming hierarchy planning requires the current Builder project."));
	if (!plainObject(options) || Object.keys(options).some((key) => !optionKeys.has(key))) errors.push(diagnostic("INVALID_STREAMING_HIERARCHY_OPTIONS", "$streamingHierarchy", "Streaming hierarchy planning received an unsupported option."));
	if (errors.length > 0) return Object.freeze({ ok: false, plan: null, errors: Object.freeze(errors) });
	if (!Number.isSafeInteger(options.projectRevision) || options.projectRevision < 0) errors.push(diagnostic("INVALID_STREAMING_HIERARCHY_REVISION", "$streamingHierarchy.projectRevision", "Capture the current nonnegative Builder revision."));
	const scope = STREAMING_HIERARCHY_CREATION_SCOPES.includes(options.scope) ? options.scope : null;
	if (scope === null) errors.push(diagnostic("INVALID_STREAMING_HIERARCHY_SCOPE", "$streamingHierarchy.scope", "Choose New Collection or New Folder scope."));
	const regions = normalizeRegions(options.regions, errors);
	const regionCodes = regions.map((region) => region.code);
	const mediaChoice = STREAMING_MEDIA_CHOICES.some((choice) => choice.id === options.mediaChoice) ? options.mediaChoice : null;
	if (mediaChoice === null) errors.push(diagnostic("INVALID_STREAMING_HIERARCHY_MEDIA", "$streamingHierarchy.mediaChoice", "Choose Movies, Series or Both."));
	const sortOptionId = options.sortOptionId ?? DEFAULT_STREAMING_SORT_OPTION_ID;
	if (!STREAMING_SORT_OPTIONS.some((option) => option.id === sortOptionId)) errors.push(diagnostic("INVALID_STREAMING_HIERARCHY_SORT", "$streamingHierarchy.sortOptionId", "Choose a supported Streaming sort."));
	const groupingMode = options.groupingMode ?? DEFAULT_STREAMING_HIERARCHY_GROUPING_MODE;
	if (!STREAMING_HIERARCHY_GROUPING_MODES.some((option) => option.id === groupingMode)) errors.push(diagnostic("INVALID_STREAMING_HIERARCHY_GROUPING", "$streamingHierarchy.groupingMode", "Choose a supported Streaming folder grouping."));
	if (groupingMode === "separate-by-region" && regions.length < 2) errors.push(diagnostic("UNAVAILABLE_STREAMING_HIERARCHY_GROUPING", "$streamingHierarchy.groupingMode", "Separate regional folders are available only when multiple regions are selected."));
	const providers = normalizeProviders(options.providers, regionCodes, mediaChoice, errors);
	const folderTitleVisibility = options.folderTitleVisibility ?? DEFAULT_STREAMING_HIERARCHY_FOLDER_TITLE_VISIBILITY;
	if (!folderTitleVisibilities.has(folderTitleVisibility)) errors.push(diagnostic("INVALID_STREAMING_HIERARCHY_FOLDER_TITLE_VISIBILITY", "$streamingHierarchy.folderTitleVisibility", "Choose an existing folder-title visibility outcome."));
	const requestedFolderTitleOverrides = normalizeFolderTitleOverrides(options.folderTitleOverrides, errors);

	let collectionTitle = null;
	let hideCollectionTitle = null;
	let viewMode = null;
	let showAllTab = null;
	let pinToTop = null;
	let destinationCollection = null;
	if (scope === "new-collection") {
		collectionTitle = options.collectionTitle ?? "Streaming Services";
		hideCollectionTitle = options.hideCollectionTitle ?? false;
		viewMode = options.viewMode ?? "TABBED_GRID";
		showAllTab = normalizeHierarchyShowAllTab(viewMode, options.showAllTab ?? true);
		pinToTop = options.pinToTop ?? false;
		if (!canonicalText(collectionTitle) || collectionTitle !== canonicalText(collectionTitle)) errors.push(diagnostic("INVALID_STREAMING_HIERARCHY_COLLECTION_TITLE", "$streamingHierarchy.collectionTitle", "The Streaming Services collection name must be a nonblank trimmed string."));
		if (typeof hideCollectionTitle !== "boolean" || typeof showAllTab !== "boolean" || typeof pinToTop !== "boolean" || !collectionViewModes.has(viewMode)) errors.push(diagnostic("INVALID_STREAMING_HIERARCHY_COLLECTION_PRESENTATION", "$streamingHierarchy", "Choose supported collection presentation values."));
		if (options.destinationCollectionInternalId !== undefined && options.destinationCollectionInternalId !== null) errors.push(diagnostic("UNEXPECTED_STREAMING_HIERARCHY_DESTINATION", "$streamingHierarchy.destinationCollectionInternalId", "New Collection scope does not target an existing collection."));
	} else if (scope === "new-folder") {
		destinationCollection = project.collections.find((collection) => collection.internalId === options.destinationCollectionInternalId) ?? null;
		if (destinationCollection === null) errors.push(diagnostic("STREAMING_HIERARCHY_DESTINATION_NOT_FOUND", "$streamingHierarchy.destinationCollectionInternalId", "The captured destination collection no longer exists."));
		for (const key of ["collectionTitle", "hideCollectionTitle", "viewMode", "showAllTab", "pinToTop"]) if (options[key] !== undefined && options[key] !== null) errors.push(diagnostic("UNEXPECTED_STREAMING_HIERARCHY_COLLECTION_OPTION", `$streamingHierarchy.${key}`, "New Folder scope inherits the selected parent collection presentation."));
	}
	if (errors.length > 0) return Object.freeze({ ok: false, plan: null, errors: Object.freeze(errors) });

	const planningConfiguration = Object.freeze({
		scope,
		collectionTitle,
		hideCollectionTitle,
		viewMode,
		showAllTab,
		pinToTop,
		folderTitleVisibility,
		folderTitleOverrides: requestedFolderTitleOverrides,
		groupingMode,
		regions,
		mediaChoice,
		sortOptionId,
		providers,
	});
	const desired = desiredFolders(providers, regions, planningConfiguration, errors);
	if (errors.length > 0) return Object.freeze({ ok: false, plan: null, errors: Object.freeze(errors) });
	const desiredKeys = new Set(desired.map((folder) => folder.key));
	const folderTitleOverrides = Object.freeze(Object.fromEntries(Object.entries(requestedFolderTitleOverrides).filter(([key]) => desiredKeys.has(key))));
	let configuration = Object.freeze({ ...planningConfiguration, folderTitleOverrides });

	let collections = Object.freeze([]);
	let newFolders = Object.freeze([]);
	let existingFolderAdditions = Object.freeze([]);
	let outcomes = Object.freeze([]);
	let conflicts = Object.freeze([]);
	let elsewhereEvidence = null;
	if (scope === "new-collection") {
		const duplicateReview = inspectStreamingSourceDuplicates(project, null, desired.flatMap((folder) => folder.drafts));
		const plannedFolders = desired.map((folder) => Object.freeze({
			...folder,
			sources: Object.freeze(folder.drafts.map((draft) => Object.freeze({ draft, status: "missing", destination: Object.freeze([]), elsewhere: occurrencesForDraft(duplicateReview, draft) }))),
			placement: Object.freeze({ status: STREAMING_HIERARCHY_PLACEMENT_STATUSES.NEW_FOLDER, folderInternalId: null }),
		}));
		collections = Object.freeze([Object.freeze({
			editable: collectionEditable(collectionTitle, configuration),
			titleCollisions: hideCollectionTitle ? Object.freeze([]) : titleCollisions(project, collectionTitle),
			folders: Object.freeze(plannedFolders),
		})]);
		newFolders = Object.freeze(plannedFolders);
		outcomes = Object.freeze(plannedFolders.map((folder) => folder.placement));
		elsewhereEvidence = deriveNewCollectionElsewhereEvidence(plannedFolders);
	} else {
		const evaluated = desired.map((folder) => Object.freeze({ folder, placement: evaluateExistingPlacement(project, destinationCollection, folder, groupingMode) }));
		conflicts = Object.freeze(evaluated.flatMap((entry) => entry.placement.conflicts));
		outcomes = Object.freeze(evaluated.map((entry) => Object.freeze({
			key: entry.folder.key,
			provider: entry.folder.provider,
			region: entry.folder.region,
			generatedTitle: entry.folder.generatedTitle,
			plannedFolderTitle: entry.placement.status === STREAMING_HIERARCHY_PLACEMENT_STATUSES.NEW_FOLDER ? entry.folder.editable.title : null,
			status: entry.placement.status,
			folderInternalId: entry.placement.folderInternalId,
			folderTitle: entry.placement.folderTitle ?? null,
			sources: entry.placement.sources,
		})));
		newFolders = Object.freeze(evaluated
			.filter((entry) => entry.placement.status === STREAMING_HIERARCHY_PLACEMENT_STATUSES.NEW_FOLDER)
			.map((entry) => Object.freeze({ ...entry.folder, sources: entry.placement.sources })));
		existingFolderAdditions = Object.freeze(evaluated
			.filter((entry) => entry.placement.status === STREAMING_HIERARCHY_PLACEMENT_STATUSES.EXTEND_FOLDER)
			.map((entry) => Object.freeze({
				folderInternalId: entry.placement.folderInternalId,
				provider: entry.folder.provider,
				region: entry.folder.region,
				sources: Object.freeze(entry.placement.missingDrafts.map((draft) => Object.freeze({ draft }))),
			})));
	}
	const newFolderKeys = new Set(newFolders.map((folder) => folder.key));
	configuration = Object.freeze({
		...configuration,
		folderTitleOverrides: Object.freeze(Object.fromEntries(Object.entries(configuration.folderTitleOverrides).filter(([key]) => newFolderKeys.has(key)))),
	});
	const destination = destinationCollection === null ? null : Object.freeze({
		collectionInternalId: destinationCollection.internalId,
		collectionTitle: canonicalText(destinationCollection.editable?.title),
		viewMode: destinationCollection.editable?.viewMode ?? null,
		showAllTab: destinationCollection.editable?.showAllTab ?? null,
		pinToTop: destinationCollection.editable?.pinToTop ?? null,
		titleHidden: isInvisibleNuvioTitle(destinationCollection.editable?.title),
	});
	const counts = deriveCounts(scope, desired, newFolders, existingFolderAdditions, outcomes, conflicts);
	return Object.freeze({ ok: true, plan: Object.freeze({
		planType: STREAMING_HIERARCHY_PLAN_TYPE,
		captured: Object.freeze({ projectInternalId: project.internalId, projectRevision: options.projectRevision }),
		configuration,
		destination,
		collections,
		newFolders,
		existingFolderAdditions,
		outcomes,
		conflicts,
		elsewhereEvidence,
		counts,
	}), errors: Object.freeze([]) });
}

function existingDestinationOptions(configuration, projectRevision, collectionInternalId) {
	return {
		scope: "new-folder",
		projectRevision,
		destinationCollectionInternalId: collectionInternalId,
		folderTitleVisibility: configuration.folderTitleVisibility,
		folderTitleOverrides: configuration.folderTitleOverrides,
		groupingMode: configuration.groupingMode,
		regions: configuration.regions,
		mediaChoice: configuration.mediaChoice,
		sortOptionId: configuration.sortOptionId,
		providers: configuration.providers,
	};
}

export function inspectStreamingHierarchyDestinationCandidates(project, options) {
	if (!plainObject(options)) return Object.freeze({ ok: false, candidates: Object.freeze([]), errors: Object.freeze([diagnostic("INVALID_STREAMING_HIERARCHY_DESTINATION_OPTIONS", "$streamingHierarchy.destinations", "Streaming destination discovery requires the current hierarchy configuration.")]) });
	const probe = createStreamingHierarchyPlan(project, {
		scope: "new-collection",
		projectRevision: options.projectRevision,
		collectionTitle: "Streaming Services",
		hideCollectionTitle: false,
		viewMode: "TABBED_GRID",
		showAllTab: true,
		pinToTop: false,
		folderTitleVisibility: options.folderTitleVisibility ?? DEFAULT_STREAMING_HIERARCHY_FOLDER_TITLE_VISIBILITY,
		folderTitleOverrides: options.folderTitleOverrides ?? Object.freeze({}),
		groupingMode: options.groupingMode,
		regions: options.regions,
		mediaChoice: options.mediaChoice,
		sortOptionId: options.sortOptionId,
		providers: options.providers,
	});
	if (!probe.ok) return Object.freeze({ ok: false, candidates: Object.freeze([]), errors: probe.errors });

	const proposedDrafts = probe.plan.collections[0].folders.flatMap((folder) => folder.sources.map((source) => source.draft));
	const duplicateReview = inspectStreamingSourceDuplicates(project, null, proposedDrafts);
	const matchingIdentitiesByCollection = new Map();
	for (const occurrence of duplicateReview.elsewhere) {
		if (!matchingIdentitiesByCollection.has(occurrence.collectionInternalId)) matchingIdentitiesByCollection.set(occurrence.collectionInternalId, new Set());
		matchingIdentitiesByCollection.get(occurrence.collectionInternalId).add(occurrence.identity);
	}

	const candidates = [];
	for (const [projectIndex, collection] of project.collections.entries()) {
		const planned = createStreamingHierarchyPlan(project, existingDestinationOptions(probe.plan.configuration, options.projectRevision, collection.internalId));
		if (!planned.ok) continue;
		const hasAmbiguousPlacement = planned.plan.outcomes.some((outcome) => outcome.status === STREAMING_HIERARCHY_PLACEMENT_STATUSES.AMBIGUOUS);
		const hasRelevantPlacement = planned.plan.outcomes.some((outcome) => outcome.status !== STREAMING_HIERARCHY_PLACEMENT_STATUSES.NEW_FOLDER);
		const streamingAffinity = hasStreamingCollectionAffinity(collection);
		if (hasAmbiguousPlacement || (!hasRelevantPlacement && !streamingAffinity)) continue;
		candidates.push(Object.freeze({
			collectionInternalId: collection.internalId,
			collectionTitle: planned.plan.destination.collectionTitle,
			titleHidden: planned.plan.destination.titleHidden,
			projectIndex,
			matchingSourceCount: matchingIdentitiesByCollection.get(collection.internalId)?.size ?? 0,
			streamingAffinity,
			proposedSourceCount: probe.plan.counts.sourceCount,
			complete: planned.plan.conflicts.length === 0 && planned.plan.counts.newSourceCount === 0,
			conflictCount: planned.plan.conflicts.length,
			plan: planned.plan,
		}));
	}
	candidates.sort((left, right) => right.matchingSourceCount - left.matchingSourceCount || left.projectIndex - right.projectIndex);
	return Object.freeze({
		ok: true,
		configuration: probe.plan.configuration,
		elsewhereEvidence: probe.plan.elsewhereEvidence,
		logicalFolderKeys: Object.freeze(probe.plan.newFolders.map((folder) => folder.key)),
		proposedSourceCount: probe.plan.counts.sourceCount,
		candidates: Object.freeze(candidates),
		errors: Object.freeze([]),
	});
}

function rebuildOptions(plan) {
	return {
		scope: plan.configuration.scope,
		projectRevision: plan.captured.projectRevision,
		...(plan.destination ? { destinationCollectionInternalId: plan.destination.collectionInternalId } : {
			collectionTitle: plan.configuration.collectionTitle,
			hideCollectionTitle: plan.configuration.hideCollectionTitle,
			viewMode: plan.configuration.viewMode,
			showAllTab: plan.configuration.showAllTab,
			pinToTop: plan.configuration.pinToTop,
		}),
		folderTitleVisibility: plan.configuration.folderTitleVisibility,
		folderTitleOverrides: plan.configuration.folderTitleOverrides,
		groupingMode: plan.configuration.groupingMode,
		regions: plan.configuration.regions,
		mediaChoice: plan.configuration.mediaChoice,
		sortOptionId: plan.configuration.sortOptionId,
		providers: plan.configuration.providers,
	};
}

function comparablePlan(plan) {
	return JSON.stringify({
		configuration: plan.configuration,
		destination: plan.destination,
		collections: plan.collections,
		newFolders: plan.newFolders,
		existingFolderAdditions: plan.existingFolderAdditions,
		outcomes: plan.outcomes,
		conflicts: plan.conflicts,
		elsewhereEvidence: plan.elsewhereEvidence,
		counts: plan.counts,
	});
}

export function validateStreamingHierarchyPlan(plan, { project, projectRevision } = {}) {
	if (!plainObject(plan) || plan.planType !== STREAMING_HIERARCHY_PLAN_TYPE || !plainObject(plan.captured) || !plainObject(plan.configuration)) return Object.freeze({ ok: false, stale: false, errors: Object.freeze([diagnostic("INVALID_STREAMING_HIERARCHY_PLAN", "$streamingHierarchy", "The Streaming hierarchy plan is malformed or unsupported.")]) });
	if (!plainObject(project) || project.internalId !== plan.captured.projectInternalId) return Object.freeze({ ok: false, stale: true, errors: Object.freeze([diagnostic("STALE_STREAMING_HIERARCHY_PLAN", "$streamingHierarchy.captured", "The Builder project changed after this Streaming plan was prepared.")]) });
	const rebuilt = createStreamingHierarchyPlan(project, rebuildOptions(plan));
	if (!rebuilt.ok || comparablePlan(rebuilt.plan) !== comparablePlan(plan)) {
		const stale = projectRevision !== plan.captured.projectRevision;
		return Object.freeze({ ok: false, stale, errors: Object.freeze([diagnostic(stale ? "STALE_STREAMING_HIERARCHY_PLAN" : "INVALID_STREAMING_HIERARCHY_PLAN", "$streamingHierarchy", stale ? "Streaming placement changed. Review a new plan before creating it." : "The Streaming hierarchy plan no longer matches its validated configuration.")]) });
	}
	return Object.freeze({ ok: true, stale: false, errors: Object.freeze([]) });
}

export function applyStreamingHierarchyPlan(controller, plan) {
	if (!controller || typeof controller.getState !== "function") return Object.freeze({ ok: false, errors: Object.freeze([diagnostic("INVALID_STREAMING_HIERARCHY_CONTROLLER", "$streamingHierarchy.controller", "A Builder controller is required to apply the Streaming plan.")]), warnings: Object.freeze([]) });
	const state = controller.getState();
	const validation = validateStreamingHierarchyPlan(plan, { project: state.project, projectRevision: state.revision });
	if (!validation.ok) return Object.freeze({ ok: false, stale: validation.stale, errors: validation.errors, warnings: Object.freeze([]) });
	if (plan.conflicts.length > 0) return Object.freeze({ ok: false, errors: plan.conflicts, warnings: Object.freeze([]), configurationConflict: true });
	if (plan.configuration.scope === "new-collection") {
		const result = controller.createCollectionsWithFoldersAndSources({
			bundles: plan.collections.map((collection) => ({
				collection: { editable: collection.editable },
				folders: collection.folders.map((folder) => ({ folder: { editable: folder.editable }, sources: folder.sources.map((source) => source.draft) })),
			})),
		});
		return result.ok ? { ...result, counts: plan.counts } : result;
	}
	if (plan.counts.newSourceCount === 0) return Object.freeze({ ok: false, errors: Object.freeze([diagnostic("NO_STREAMING_HIERARCHY_CHANGES_READY", "$streamingHierarchy", "Every configured Streaming source already exists in its trusted destination folder.")]), warnings: Object.freeze([]) });
	const result = controller.extendCollectionWithFoldersAndSources(plan.destination.collectionInternalId, {
		newFolders: plan.newFolders.map((folder) => ({ folder: { editable: folder.editable }, sources: folder.sources.map((source) => source.draft) })),
		existingFolderAdditions: plan.existingFolderAdditions.map((addition) => ({ folderInternalId: addition.folderInternalId, sources: addition.sources.map((source) => source.draft) })),
	});
	return result.ok ? { ...result, counts: plan.counts } : result;
}
