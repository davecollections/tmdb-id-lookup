import { canonicalJsonValue, resolveEffectiveDiscoverSource } from "../nuvio/discover.js";
import { DISCOVER_FILTER_FIELDS } from "../nuvio/known-fields.js";

const knownFilters = new Set(DISCOVER_FILTER_FIELDS);
const identityFields = new Set(["id", "title", "provider", "tmdbSourceType", "tmdbId", "mediaType", "sortBy", "filters"]);
const inactiveCompatibilityFields = new Set(["addonId", "catalogId", "type", "genre", "sortHow", "traktListId"]);

// Structural identity remains family-owned. This comparison view never changes
// persisted data; supported filter equivalence is a bounded family-owned adapter.
export function nativeSourceVariantKey(source, structuralIdentity, sortOptions, compareFilters = (filters) => filters) {
	const effective = resolveEffectiveDiscoverSource({ ...source, nodeType: "source" });
	if (!effective.ok) return null;
	const value = effective.value;
	const entity = structuralIdentity(value);
	if (entity === null) return null;
	const mediaType = value.mediaType.trim().toUpperCase();
	let sortBy = value.sortBy ?? "popularity.desc";
	if (sortBy === "") sortBy = "popularity.desc";
	if (typeof sortBy !== "string") return null;
	if (["COMPANY", "NETWORK"].includes(value.tmdbSourceType.trim().toUpperCase())) {
		if (sortBy === "primary_release_date.desc" || sortBy === "first_air_date.desc") {
			sortBy = mediaType === "TV" ? "first_air_date.desc" : "primary_release_date.desc";
		}
	}
	const supportedSort = sortOptions.find((option) => (option.values?.[mediaType] ?? option.value) === sortBy);
	// Retain unusual imported strings as their own value, never as Popular.
	const sort = supportedSort ? supportedSort.id : { importedSort: sortBy };
	const filters = Object.hasOwn(value, "filters") ? value.filters : {};
	if (filters === null || typeof filters !== "object" || Array.isArray(filters)) return null;
	const comparisonFilters = Object.fromEntries(Object.entries(compareFilters(filters, value))
		.filter(([field, entry]) => !(knownFilters.has(field) && entry === null)));
	const extras = Object.fromEntries(Object.entries(value)
		.filter(([field, entry]) => !identityFields.has(field) && !(inactiveCompatibilityFields.has(field) && entry === null)));
	const stable = canonicalJsonValue({ entity, sort, filters: comparisonFilters, extras });
	return stable.ok ? JSON.stringify(stable.value) : null;
}

export function sourceVariantTitle(base, sortOptionId, options, multiple = false) {
	const label = options.find((option) => option.id === sortOptionId)?.label;
	return multiple && label ? `${base} - ${label}` : base;
}

export function isSourceVariantTitle(title, base, sortBy, mediaType, options) {
	const option = options.find((entry) => (entry.values?.[mediaType] ?? entry.value) === sortBy);
	return title === base || (option && title === sourceVariantTitle(base, option.id, options, true));
}

export function inspectNativeSourceDuplicates(project, destinationFolderInternalId, drafts, variantKey) {
	const identities = drafts.map(variantKey);
	const selected = new Set(identities.filter(Boolean));
	const destination = [];
	const elsewhere = [];
	for (const collection of project?.collections ?? []) {
		for (const folder of collection.folders ?? []) {
			for (const source of folder.sources ?? []) {
				const identity = variantKey(source);
				if (identity === null || !selected.has(identity)) continue;
				const occurrence = Object.freeze({
					identity,
					mediaType: source.editable.mediaType.trim().toUpperCase(),
					collectionInternalId: collection.internalId,
					collectionTitle: collection.editable?.title ?? "",
					folderInternalId: folder.internalId,
					folderTitle: folder.editable?.title ?? "",
					sourceInternalId: source.internalId,
					sourceTitle: source.editable?.title ?? "",
				});
				(folder.internalId === destinationFolderInternalId ? destination : elsewhere).push(occurrence);
			}
		}
	}
	const represented = new Set(destination.map((entry) => entry.identity));
	const missingDrafts = drafts.filter((draft) => !represented.has(variantKey(draft)));
	const duplicateDrafts = drafts.filter((draft) => represented.has(variantKey(draft)));
	return Object.freeze({
		identities: Object.freeze(identities),
		destination: Object.freeze(destination),
		elsewhere: Object.freeze(elsewhere),
		missingDrafts: Object.freeze(missingDrafts),
		duplicateDrafts: Object.freeze(duplicateDrafts),
		counts: Object.freeze({ configured: drafts.length, existing: duplicateDrafts.length, omitted: 0, toAdd: missingDrafts.length }),
	});
}

export function inspectNativeHierarchyPlacement(project, drafts, { destinationCollectionInternalId = null, structuralIdentity, variantKey } = {}) {
	const identities = drafts.map(variantKey);
	const entityId = structuralIdentity(drafts[0]?.editable)?.split("|")[2];
	if (!identities.length || !entityId || identities.some((identity) => identity === null)) return null;
	const occurrences = [];
	for (const collection of project?.collections ?? []) {
		for (const folder of collection.folders ?? []) {
			for (const source of folder.sources ?? []) {
				if (source.category !== "native-tmdb" || variantKey(source) === null || structuralIdentity(source.editable)?.split("|")[2] !== entityId) continue;
				occurrences.push(Object.freeze({
					identity: variantKey(source),
					mediaType: source.editable.mediaType.trim().toUpperCase(),
					collectionInternalId: collection.internalId,
					collectionTitle: collection.editable?.title ?? "",
					folderInternalId: folder.internalId,
					folderTitle: folder.editable?.title ?? "",
					sourceInternalId: source.internalId,
					sourceTitle: source.editable?.title ?? "",
				}));
			}
		}
	}
	const destination = Object.freeze(occurrences.filter((entry) => entry.collectionInternalId === destinationCollectionInternalId));
	const elsewhere = Object.freeze(occurrences.filter((entry) => entry.collectionInternalId !== destinationCollectionInternalId));
	const sourceOutcomes = Object.freeze(identities.map((identity) => Object.freeze({
		identity,
		destination: Object.freeze(destination.filter((entry) => entry.identity === identity)),
		elsewhere: Object.freeze(elsewhere.filter((entry) => entry.identity === identity)),
	})));
	const existing = sourceOutcomes.filter((entry) => entry.destination.length > 0).length;
	const status = existing === drafts.length ? "already-in-this-collection"
		: destination.length > 0 ? "partly-in-this-collection"
			: elsewhere.length > 0 ? "exists-elsewhere" : "ready-to-create";
	const collection = project?.collections?.find((entry) => entry.internalId === destinationCollectionInternalId);
	const matchingFolders = Object.freeze((collection?.folders ?? []).flatMap((folder, index) => destination.some((entry) => entry.folderInternalId === folder.internalId) ? [Object.freeze({
		folderInternalId: folder.internalId, folderTitle: folder.editable?.title ?? "", folderPosition: index + 1,
		collectionTitle: collection.editable?.title ?? "", sourceCount: folder.sources.length,
	})] : []));
	return Object.freeze({ status, entityId, matchingFolders, identities: Object.freeze(identities), sourceOutcomes, occurrences: Object.freeze(occurrences), destination, elsewhere });
}

// Choices are physical folder IDs keyed by the selected native entity. Keep valid
// choices across sort/media changes; never infer a target from a title or artwork.
export function reconcileNativeFolderDestinations(entries, choices = {}) {
	return Object.fromEntries(entries.flatMap((entry) => {
		const id = String(entry.id);
		const target = choices[id];
		return target && (!entry.outcome || entry.outcome.matchingFolders.some((folder) => folder.folderInternalId === target)) ? [[id, target]] : [];
	}));
}

export function resolveNativeHierarchyPlacements(evaluated, destinationCollectionInternalId, folderDestinations = {}) {
	if (!folderDestinations || typeof folderDestinations !== "object" || Array.isArray(folderDestinations)) return null;
	if (Object.entries(folderDestinations).some(([id, target]) => typeof target !== "string" || !evaluated.some(({ outcome }) => outcome.entityId === id && outcome.matchingFolders.some((folder) => folder.folderInternalId === target)))) return null;
	const placed = evaluated.map((entry) => {
		const outcome = entry.outcome;
		const missing = entry.sources.filter((_, index) => outcome.sourceOutcomes[index].destination.length === 0);
		const matching = outcome.matchingFolders;
		const targetFolderInternalId = matching.length === 1 ? matching[0].folderInternalId : folderDestinations[outcome.entityId] ?? null;
		const kind = !destinationCollectionInternalId || matching.length === 0 ? "new-folder"
			: missing.length === 0 ? "complete" : targetFolderInternalId ? "append" : "unresolved";
		return Object.freeze({ ...entry, sources: Object.freeze(missing), outcome: Object.freeze({
			...outcome, kind, targetFolderInternalId, missingSourceCount: missing.length,
			existingSourceCount: entry.sources.length - missing.length,
		}) });
	});
	const folders = Object.freeze(placed.filter((entry) => entry.outcome.kind === "new-folder"));
	const additions = new Map();
	for (const entry of placed.filter((entry) => entry.outcome.kind === "append")) {
		const target = entry.outcome.targetFolderInternalId;
		const group = additions.get(target) ?? { folderInternalId: target, sources: [] };
		group.sources.push(...entry.sources);
		additions.set(target, group);
	}
	return Object.freeze({ placed: Object.freeze(placed), folders, existingFolderAdditions: Object.freeze([...additions.values()].map((entry) => Object.freeze({ ...entry, sources: Object.freeze(entry.sources) }))) });
}

export function nativeHierarchyCounts(collections, folders, evaluated, existingFolderAdditions = []) {
	const createdFolders = [...collections.flatMap((collection) => collection.folders), ...folders];
	const configured = evaluated.reduce((total, entry) => total + entry.outcome.identities.length, 0);
	const existing = evaluated.reduce((total, entry) => total + entry.outcome.sourceOutcomes.filter((source) => source.destination.length > 0).length, 0);
	const newFolderSourceCount = createdFolders.reduce((total, folder) => total + folder.sources.length, 0);
	const appendedSourceCount = existingFolderAdditions.reduce((total, folder) => total + folder.sources.length, 0);
	const unresolved = evaluated.filter((entry) => entry.outcome.kind === "unresolved");
	return Object.freeze({
		collectionCount: collections.length, folderCount: createdFolders.length,
		sourceCount: newFolderSourceCount + appendedSourceCount, configured, existing,
		toAdd: newFolderSourceCount + appendedSourceCount, newFolderSourceCount, appendedSourceCount,
		existingFolderAdditionCount: existingFolderAdditions.length,
		unresolvedEntityCount: unresolved.length, unresolvedSourceCount: unresolved.reduce((total, entry) => total + entry.sources.length, 0),
		unchangedEntityCount: evaluated.filter((entry) => entry.outcome.kind === "complete").length,
	});
}
