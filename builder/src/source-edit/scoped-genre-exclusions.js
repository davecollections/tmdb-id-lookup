import { cloneJsonValue } from "../domain/model.js";
import { projectSourceSnapshot } from "../domain/source-occurrences.js";
import { DISCOVER_FILTER_DESCRIPTORS, resolveEffectiveDiscoverSource } from "../nuvio/discover.js";
import { inspectDiscoverMirrors, patchTouchedDiscoverFilters } from "../nuvio/discover-imported-filters.js";
import { discoverExpressionIds, editableDiscoverExclusion, validateAdvancedFilters } from "../source-add/advanced-discover.js";
import { GENRE_CONCEPTS, officialGenreConcept } from "../source-add/genre-catalogue.js";
import { inspectNativeExtraFilters, NATIVE_GENRE_FIELDS, ownedNativeExtraMirrorSource, validateNativeExtraEdit } from "../source-add/native-shared-advanced.js";
import { sourceEditorById, sourceEditorFor } from "./source-editors.js";
import { isPlainObject } from "./source-edit-utils.js";

const supportedAdapters = new Set(["studio", "network", "genre", "decade", "streaming", "advanced-discover"]);
const filterDescriptors = new Map(DISCOVER_FILTER_DESCRIPTORS.map((entry) => [entry.field, entry]));
const meaningful = (value) => value !== undefined && value !== null && value !== "";
const text = (value) => typeof value === "string" ? value : "";
const reason = (code, message) => ({ code, message });
const failure = (code, message) => ({ ok: false, errors: [{ code, path: "$scopedGenreExclusions", message }] });

function exactKeys(value, keys) {
	return isPlainObject(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function denseStringArray(value) {
	if (!Array.isArray(value)) return false;
	for (let index = 0; index < value.length; index += 1) {
		if (!Object.hasOwn(value, index) || typeof value[index] !== "string" || !value[index]) return false;
	}
	return true;
}

// Comparison stays family-owned, including excluded-token order and preserved extras.
// All DISCOVER editors share the same comparison authority, including skipped siblings.
function duplicateKey(source) {
	const type = text(source?.editable?.tmdbSourceType).trim().toUpperCase();
	const adapterId = { COMPANY: "studio", NETWORK: "network", DISCOVER: "advanced-discover" }[type];
	return source?.category === "native-tmdb" && adapterId
		? sourceEditorById(adapterId).duplicateKey(source) : null;
}

function inspectSource(source, identity) {
	if (source.nodeType !== "source" || source.category !== "native-tmdb") {
		return { problem: reason("UNSUPPORTED_SOURCE", "This Source does not support native TMDB Genre exclusions.") };
	}
	for (const container of [source.rawImported, source.editable]) {
		if (container && Object.hasOwn(container, "filters") && !isPlainObject(container.filters)) {
			return { problem: reason("MALFORMED_FILTERS", "The imported filters container must be preserved.") };
		}
	}
	const effective = resolveEffectiveDiscoverSource(source);
	if (!effective.ok) return { problem: reason("UNSAFE_SOURCE", "The effective Source cannot be interpreted safely.") };
	const value = effective.value;
	const type = text(value.tmdbSourceType).trim().toUpperCase();
	const mediaType = text(value.mediaType).trim().toUpperCase();
	if (text(value.provider).trim().toLowerCase() !== "tmdb" || !["COMPANY", "NETWORK", "DISCOVER"].includes(type)) {
		return { problem: reason("UNSUPPORTED_SOURCE", "This Source family does not consume native Genre exclusions.") };
	}
	if (!["MOVIE", "TV"].includes(mediaType) || (type === "NETWORK" && mediaType !== "TV")) {
		return { problem: reason("INVALID_MEDIA", "This Source has an unsupported media configuration.") };
	}
	const filters = value.filters ?? {};
	const mirrors = inspectDiscoverMirrors({ ...value, mediaType, filters });
	if (mirrors.unresolved.length) {
		return { problem: reason("UNRESOLVED_MIRRORS", "Imported filter or sort mirrors have an unresolved meaning.") };
	}
	const canonical = Object.fromEntries(Object.entries(filters).filter(([field]) => !mirrors.equivalent.includes(field)));
	for (const [field, entry] of Object.entries(canonical)) {
		if (!meaningful(entry)) continue;
		const descriptor = filterDescriptors.get(field);
		if (!descriptor) return { problem: reason("UNKNOWN_FILTER", `The imported ${field} filter has unknown semantics.`) };
		if (descriptor.valueType === "string" ? typeof entry !== "string" : !["string", "number"].includes(typeof entry)) {
			return { problem: reason("UNSAFE_FILTER", `The imported ${field} filter has an unsupported value type.`) };
		}
		if (field.startsWith("without") && !editableDiscoverExclusion(field, entry)) {
			return { problem: reason("UNSAFE_EXCLUSION", `The imported ${field} expression must be preserved.`) };
		}
	}
	const validation = validateAdvancedFilters(canonical, mediaType);
	if (!validation.ok) return { problem: reason("INVALID_FILTERS", validation.errors[0].message) };
	const genres = inspectNativeExtraFilters(source, [NATIVE_GENRE_FIELDS]);
	if (!NATIVE_GENRE_FIELDS.every((field) => genres.editable[field])) {
		return { problem: reason("UNSAFE_GENRES", "The imported Genre settings must be preserved.") };
	}
	const adapter = sourceEditorFor(source);
	if (!adapter || !supportedAdapters.has(adapter.id)) {
		return { problem: reason("UNSUPPORTED_CONFIGURATION", "No supported Source editor can validate this configuration.") };
	}
	const draft = adapter.readInitialState(source);
	if (!adapter.validateDraft({ source, draft }).ok) return { problem: reason("INVALID_CONFIGURATION", "The Source editor cannot validate the current configuration.") };
	if (type !== "DISCOVER") {
		// Native entity resolvers replace their inclusion with the fixed entity ID.
		// Validate that effective anchor too, without rewriting stored filters/sort.
		const anchored = validateAdvancedFilters({ ...canonical,
			[type === "COMPANY" ? "withCompanies" : "withNetworks"]: String(draft.tmdbId),
		}, mediaType);
		if (!anchored.ok) return { problem: reason("INVALID_FILTERS", anchored.errors[0].message) };
	}
	if (identity === null) return { problem: reason("UNSAFE_IDENTITY", "The Source identity cannot be compared safely.") };
	return { value, mediaType, adapter, identity };
}

function planSource(occurrence, concepts) {
	const { collection, folder, source, collectionIndex, folderIndex, sourceIndex } = occurrence;
	const row = {
		collectionInternalId: collection.internalId, folderInternalId: folder.internalId,
		sourceInternalId: source.internalId, collectionIndex, folderIndex, sourceIndex,
		collectionTitle: text(collection.editable.title), folderTitle: text(folder.editable.title),
		sourceTitle: text(source.editable.title), category: source.category,
		adapterId: null, mediaType: null, status: "skipped", reason: null,
		applicableGenres: [], inapplicableGenres: [], conflictingGenres: [],
		beforeExclusions: null, afterExclusions: null, patch: null,
		originalIdentity: duplicateKey(source), proposedIdentity: null,
		duplicateGroupId: null,
	};
	const inspected = inspectSource(source, row.originalIdentity);
	if (inspected.problem) return { ...row, reason: inspected.problem };
	const { value, mediaType, adapter, identity } = inspected;
	Object.assign(row, { adapterId: adapter.id, mediaType, originalIdentity: identity,
		beforeExclusions: value.filters?.withoutGenres ?? null, afterExclusions: value.filters?.withoutGenres ?? null });
	const applicable = concepts.filter((concept) => (mediaType === "TV" ? concept.tvId : concept.movieId) !== null);
	row.applicableGenres = applicable.map((concept) => concept.name);
	row.inapplicableGenres = concepts.filter((concept) => !applicable.includes(concept)).map((concept) => concept.name);
	if (!applicable.length) return { ...row, status: "unchanged", reason: reason("MEDIA_INAPPLICABLE", "None of the selected Genres applies to this media.") };
	const included = new Set(discoverExpressionIds(value.filters?.withGenres));
	const idFor = (concept) => mediaType === "TV" ? concept.tvId : concept.movieId;
	row.conflictingGenres = applicable.filter((concept) => included.has(idFor(concept))).map((concept) => concept.name);
	if (row.conflictingGenres.length) return { ...row, reason: reason("INCLUDED_GENRE_CONFLICT", "A requested Genre is included by this Source; the whole Source is skipped.") };
	const previous = discoverExpressionIds(value.filters?.withoutGenres);
	const added = applicable.map(idFor).filter((id) => !previous.includes(id));
	if (!added.length) return { ...row, status: "unchanged", reason: reason("ALREADY_EXCLUDED", "All applicable selected Genres are already excluded.") };
	const withoutGenres = [...previous, ...added].join(",");
	const extra = validateNativeExtraEdit(source, { mediaType, touchedFilters: ["withoutGenres"], filters: { withoutGenres } }, [NATIVE_GENRE_FIELDS]);
	if (!extra.ok) return { ...row, reason: reason("INVALID_CANDIDATE", extra.errors[0].message) };
	// The helper retains the entire editable filters map. A filters-only delta here
	// would erase other recognized filters through the domain's shallow merge.
	const patch = patchTouchedDiscoverFilters(source, ownedNativeExtraMirrorSource(value, ["withoutGenres"]), { withoutGenres }, ["withoutGenres"]);
	const candidate = { ...source, editable: { ...source.editable, ...patch } };
	if (!adapter.canEdit(candidate) || !adapter.validateDraft({ source: candidate, draft: adapter.readInitialState(candidate) }).ok) {
		return { ...row, reason: reason("INVALID_CANDIDATE", "The Source editor cannot validate the proposed exclusions.") };
	}
	const proposedIdentity = duplicateKey(candidate);
	if (proposedIdentity === null) return { ...row, reason: reason("INVALID_CANDIDATE", "The proposed Source identity cannot be compared safely.") };
	return { ...row, status: "changed", reason: reason("ADDED_EXCLUSIONS", "Missing applicable Genre exclusions will be appended."),
		afterExclusions: withoutGenres, patch: cloneJsonValue(patch), proposedIdentity };
}

// Revoking a candidate can restore an original identity that blocks another
// candidate. Each changed row is revoked at most once; only affected groups recur.
function resolveFolderCollisions(rows, duplicateGroups) {
	const groups = new Map();
	const identityFor = (row) => row.status === "changed" ? row.proposedIdentity : row.originalIdentity;
	function groupFor(key) {
		if (!groups.has(key)) groups.set(key, new Set());
		return groups.get(key);
	}
	for (const row of rows) if (identityFor(row) !== null) groupFor(identityFor(row)).add(row);
	const pending = [...groups.keys()];
	for (let index = 0; index < pending.length; index += 1) {
		const key = pending[index], group = groups.get(key);
		if (group.size < 2) continue;
		const changed = [...group].filter((row) => row.status === "changed");
		if (!changed.length) continue;
		const duplicateGroup = { id: "duplicate-" + (duplicateGroups.length + 1), folderInternalId: changed[0].folderInternalId, sourceInternalIds: [...group].map((row) => row.sourceInternalId) };
		duplicateGroups.push(duplicateGroup);
		for (const row of changed) row.duplicateGroupId = duplicateGroup.id;
		for (const row of changed) {
			group.delete(row);
			row.status = "skipped";
			row.reason = reason("DUPLICATE_CONVERGENCE", "These exclusions would create an exact duplicate in this Folder.");
			row.patch = null;
			row.afterExclusions = row.beforeExclusions;
			row.proposedIdentity = null;
			groupFor(row.originalIdentity).add(row);
			pending.push(row.originalIdentity);
		}
	}
}

/**
 * Pure, detached planning only. Does not authorize mutation.
 * request = { scope: { nodeType: "collection" | "folder", internalId }, genreNames: string[] }
 *        or { sourceInternalIds: string[], genreNames: string[] }
 * Source order and exact membership are recorded even for skipped/no-op rows.
 */
export function planScopedGenreExclusions(project, request) {
	try {
		const legacy = exactKeys(request, ["scope", "genreNames"]);
		const multiple = exactKeys(request, ["sourceInternalIds", "genreNames"]);
		if ((!legacy && !multiple)
			|| (legacy && (!exactKeys(request.scope, ["nodeType", "internalId"])
				|| !["collection", "folder"].includes(request.scope.nodeType)
				|| typeof request.scope.internalId !== "string" || !request.scope.internalId))
			|| (multiple && !denseStringArray(request.sourceInternalIds))
			|| !denseStringArray(request.genreNames) || !request.genreNames.length
			|| new Set(request.genreNames).size !== request.genreNames.length
			|| [...request.genreNames].some((name) => typeof name !== "string" || !officialGenreConcept(name))) {
			return failure("INVALID_SCOPED_GENRE_REQUEST", multiple
				? "Choose physical Source IDs and unique official Genre names."
				: "Choose one Collection or Folder and unique official Genre names.");
		}
		if (project?.nodeType !== "project" || !Array.isArray(project.collections)) return failure("INVALID_SCOPED_GENRE_PROJECT", "The project is unavailable.");
		const ids = new Set();
		function unique(node, nodeType) {
			if (node.nodeType !== nodeType || typeof node.internalId !== "string" || !node.internalId || ids.has(node.internalId)) throw new Error("Ambiguous internal identity");
			ids.add(node.internalId);
		}
		unique(project, "project");
		let scope = null;
		for (const collection of project.collections) {
			unique(collection, "collection");
			if (!Array.isArray(collection.folders)) throw new Error("Invalid Collection membership");
			if (legacy && request.scope.nodeType === "collection" && collection.internalId === request.scope.internalId) scope = collection;
			for (const folder of collection.folders) {
				unique(folder, "folder");
				if (!Array.isArray(folder.sources)) throw new Error("Invalid Folder membership");
				if (legacy && request.scope.nodeType === "folder" && folder.internalId === request.scope.internalId) scope = folder;
			}
		}
		const snapshot = projectSourceSnapshot(project);
		for (const { source } of snapshot.occurrences) unique(source, "source");
		if (legacy && !scope) return failure("SCOPED_GENRE_SCOPE_MISSING", "The selected Collection or Folder is no longer available.");
		const requestedIds = multiple ? new Set(request.sourceInternalIds) : null;
		const occurrences = snapshot.occurrences.filter((entry) => multiple ? requestedIds.has(entry.source.internalId)
			: request.scope.nodeType === "collection" ? entry.collection.internalId === scope.internalId : entry.folder.internalId === scope.internalId);
		if (multiple && occurrences.length !== requestedIds.size) {
			return failure("SCOPED_GENRE_SOURCE_MISSING", "Every selected ID must identify an existing physical Source. Nothing was reviewed.");
		}
		const selected = new Set(request.genreNames);
		const concepts = GENRE_CONCEPTS.filter((concept) => selected.has(concept.name));
		const outcomes = occurrences.map((entry) => planSource(entry, concepts));
		const selectedRows = new Map(outcomes.map((row) => [row.sourceInternalId, row]));
		const folders = new Map();
		for (const row of outcomes) {
			if (!folders.has(row.folderInternalId)) folders.set(row.folderInternalId, []);
		}
		// Include every physical sibling in each affected Folder. Identity-only
		// blockers cannot become changed candidates and never enter public outcomes.
		for (const { folder, source } of snapshot.occurrences) {
			if (!folders.has(folder.internalId)) continue;
			folders.get(folder.internalId).push(selectedRows.get(source.internalId) ?? Object.freeze({
				sourceInternalId: source.internalId, originalIdentity: duplicateKey(source),
			}));
		}
		const duplicateGroups = [];
		for (const rows of folders.values()) resolveFolderCollisions(rows, duplicateGroups);
		const totals = { inspected: outcomes.length, changed: 0, unchanged: 0, skipped: 0 };
		for (const row of outcomes) totals[row.status] += 1;
		const target = legacy ? { scope: { ...request.scope } } : { sourceInternalIds: outcomes.map((row) => row.sourceInternalId) };
		return { ok: true, errors: [], ...target, genreNames: concepts.map((concept) => concept.name), totals, outcomes, duplicateGroups };
	} catch {
		return failure("INVALID_SCOPED_GENRE_PROJECT", "The complete scope could not be reviewed safely. Nothing was changed.");
	}
}
