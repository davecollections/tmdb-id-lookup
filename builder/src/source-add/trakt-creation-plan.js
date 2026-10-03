import { cloneJsonValue } from "../domain/model.js";
import { nativeTraktSourceOccurrences } from "../domain/trakt-source-occurrences.js";
import { isCanonicalTraktListId, nativeTraktConfigurationKey, nativeTraktPhysicalIdentity } from "../nuvio/trakt.js";
import { isValidVisibleNuvioTitle, NUVIO_INVISIBLE_TITLE } from "../nuvio/titles.js";
import { buildNativeTraktSourceDraft } from "./trakt-source.js";
import { effectiveTraktMedia } from "./trakt-selection.js";
import { normalizeHierarchyShowAllTab } from "./hierarchy-presentation.js";

const scopes = ["new-collection", "new-folder", "add-source"];
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
function freeze(value) {
	if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); }
	return value;
}
const error = (code, message) => Object.freeze({ code, path: "$traktPlan", message });
const failure = (code, message, stale = false) => ({ ok: false, plan: null, stale, errors: [error(code, message)] });
const validName = title => typeof title === "string" && title === title.trim() && isValidVisibleNuvioTitle(title);

export function defaultTraktListTitle(list) {
	const name = typeof list?.name === "string" ? list.name.trim() : "";
	return isValidVisibleNuvioTitle(name) ? name : `Trakt List ${list?.id}`;
}
export function defaultTraktSourceTitle(list, mediaType, scope) {
	const media = mediaType === "MOVIE" ? "Movies" : "Series";
	return scope === "add-source" ? `${defaultTraktListTitle(list)} · ${media}` : media;
}

export function createTraktCreationPlan(project, options) {
	if (!object(project) || project.nodeType !== "project" || !Array.isArray(project.collections) || !object(options)
		|| !scopes.includes(options.scope) || !Number.isSafeInteger(options.projectRevision) || options.projectRevision < 0
		|| !Array.isArray(options.lists) || !options.lists.length) return failure("INVALID_TRAKT_PLAN", "Choose lists and a current destination.");
	let configuration;
	try { configuration = cloneJsonValue(options, "$traktPlan"); } catch { return failure("INVALID_TRAKT_PLAN", "List configuration must be plain data."); }
	const { scope } = configuration;
	const collection = scope === "new-folder" ? project.collections.find(node => node.internalId === configuration.destinationCollectionInternalId) : null;
	const folder = scope === "add-source" ? project.collections.flatMap(node => node.folders).find(node => node.internalId === configuration.destinationFolderInternalId) : null;
	if ((scope === "new-folder" && !collection) || (scope === "add-source" && !folder)) return failure("TRAKT_DESTINATION_MISSING", "The destination no longer exists.");
	const collectionKeys = ["collectionTitle", "hideCollectionTitle", "viewMode", "showAllTab", "pinToTop"];
	if (scope !== "new-collection" && collectionKeys.some(key => configuration[key] !== undefined)) return failure("INVALID_TRAKT_PRESENTATION", "Existing Collection settings cannot be changed by this operation.");
	if (scope === "add-source" && ["folderTitleVisibility", "folderTileShape"].some(key => configuration[key] !== undefined)) return failure("INVALID_TRAKT_PRESENTATION", "Add Source does not change Folder presentation.");
	const folderTitleVisibility = configuration.folderTitleVisibility ?? "HIDE_HOME_SCREEN";
	const folderTileShape = configuration.folderTileShape ?? "POSTER";
	const hideCollectionTitle = configuration.hideCollectionTitle ?? false, viewMode = configuration.viewMode ?? "TABBED_GRID";
	const showAllTab = configuration.showAllTab ?? true, pinToTop = configuration.pinToTop ?? false;
	if (!["HIDE_HOME_SCREEN", "HIDE_EVERYWHERE", "SHOW_EVERYWHERE"].includes(folderTitleVisibility)
		|| !["POSTER", "SQUARE", "LANDSCAPE"].includes(folderTileShape)
		|| !["TABBED_GRID", "ROWS"].includes(viewMode) || ![hideCollectionTitle, showAllTab, pinToTop].every(value => typeof value === "boolean")) return failure("INVALID_TRAKT_PRESENTATION", "Choose supported presentation settings.");
	const nameErrors = [], outcomes = [], bundles = [], readySources = [], ids = new Set();
	if (scope === "new-collection" && (typeof configuration.collectionTitle !== "string" || (!hideCollectionTitle && !validName(configuration.collectionTitle)))) nameErrors.push(error("TRAKT_COLLECTION_NAME_REQUIRED", "Enter a Collection name."));
	for (const row of configuration.lists) {
		if (!object(row) || !isCanonicalTraktListId(row.id) || row.list?.id !== row.id || ids.has(row.id)) return failure("INVALID_TRAKT_SELECTION", "Each canonical Trakt list may appear once.");
		ids.add(row.id);
		if (row.media?.composition && row.media.composition.id !== row.id) return failure("INVALID_TRAKT_MEDIA", "Media results must belong to the selected list.");
		const mediaTypes = effectiveTraktMedia(row.media);
		if (!mediaTypes.length) return failure("TRAKT_MEDIA_UNRESOLVED", "Check public access and choose media for every list.");
		const ready = [], omitted = [];
		for (const mediaType of mediaTypes) {
			// Build a valid comparison candidate before validating ready-only name drafts.
			const generated = defaultTraktSourceTitle(row.list, mediaType, scope);
			const built = buildNativeTraktSourceDraft({ title: generated, traktListId: row.id, mediaType });
			if (!built.ok) return failure("INVALID_TRAKT_SOURCE", "A Trakt source could not be created.");
			const identity = nativeTraktPhysicalIdentity(built.draft), key = nativeTraktConfigurationKey(built.draft);
			const all = nativeTraktSourceOccurrences(project, built.draft);
			const inDestination = match => scope === "new-folder" ? match.collectionInternalId === collection.internalId
				: scope === "add-source" ? match.folderInternalId === folder.internalId : false;
			const destination = all.filter(inDestination).map(match => ({ ...match, comparison: match.configurationKey === null ? "unknown-comparison" : key !== null && match.configurationKey === key ? "equivalent" : "known-variant" }));
			const elsewhere = all.filter(match => !inDestination(match));
			const omit = scope === "new-folder" ? destination.length > 0 : scope === "add-source" && destination.some(match => match.comparison === "equivalent");
			const candidate = { identity, mediaType, destination, elsewhere, status: omit ? "omitted" : "ready" };
			if (omit) { omitted.push(candidate); continue; }
			const title = row.sourceTitles?.[mediaType] ?? generated;
			const named = buildNativeTraktSourceDraft({ title, traktListId: row.id, mediaType });
			if (!named.ok) nameErrors.push(...named.errors);
			const draft = named.ok ? named.draft : built.draft;
			ready.push({ ...candidate, draft }); readySources.push(draft);
		}
		outcomes.push({ id: row.id, ready, omitted });
		if (scope !== "add-source" && ready.length) {
			const title = row.folderTitle ?? defaultTraktListTitle(row.list);
			if (typeof title !== "string" || (folderTitleVisibility !== "HIDE_EVERYWHERE" && !validName(title))) nameErrors.push(error("TRAKT_FOLDER_NAME_REQUIRED", "Enter a name for every new Folder."));
			bundles.push({ folder: { editable: { title: folderTitleVisibility === "HIDE_EVERYWHERE" ? NUVIO_INVISIBLE_TITLE : title,
				tileShape: folderTileShape, hideTitle: folderTitleVisibility !== "SHOW_EVERYWHERE" } }, sources: ready.map(entry => entry.draft) });
		}
	}
	const counts = { collectionCount: scope === "new-collection" && readySources.length ? 1 : 0, folderCount: bundles.length,
		sourceCount: readySources.length, omittedCount: outcomes.reduce((n, outcome) => n + outcome.omitted.length, 0) };
	if (nameErrors.length) return freeze({ ok: false, plan: null, review: { outcomes, counts }, errors: nameErrors });
	return freeze({ ok: true, errors: [], plan: { planType: "trakt-creation", captured: { projectInternalId: project.internalId, projectRevision: options.projectRevision },
		configuration, outcomes, counts, folders: bundles, sources: scope === "add-source" ? readySources : [],
		collections: scope === "new-collection" && readySources.length ? [{ collection: { editable: {
			 title: hideCollectionTitle ? NUVIO_INVISIBLE_TITLE : configuration.collectionTitle, viewMode,
			 showAllTab: normalizeHierarchyShowAllTab(viewMode, showAllTab), pinToTop, focusGlowEnabled: true } }, folders: bundles }] : [] } });
}

export function validateTraktCreationPlan(plan, { project, projectRevision, options = plan?.configuration } = {}) {
	if (plan?.planType !== "trakt-creation" || project?.internalId !== plan.captured?.projectInternalId || projectRevision !== plan.captured?.projectRevision) return failure("STALE_TRAKT_PLAN", "The project changed. Review the current output.", true);
	const rebuilt = createTraktCreationPlan(project, options);
	if (!rebuilt.ok || JSON.stringify(rebuilt.plan) !== JSON.stringify(plan)) return failure("STALE_TRAKT_PLAN", "The list selection, settings or destination changed. Review the current output.", true);
	return { ok: true, stale: false, errors: [] };
}

// Inert until explicitly called; Phase A has no UI wiring. Rebuild before one atomic operation.
export function applyTraktCreationPlan(controller, plan, options = plan?.configuration) {
	const state = controller?.getState?.();
	const validation = validateTraktCreationPlan(plan, { project: state?.project, projectRevision: state?.revision, options });
	if (!validation.ok) return validation;
	if (!plan.counts.sourceCount) return failure("NO_TRAKT_OUTPUT", "Nothing to add.");
	const { scope, destinationCollectionInternalId, destinationFolderInternalId } = plan.configuration;
	const result = scope === "new-collection" ? controller.createCollectionsWithFoldersAndSources({ bundles: plan.collections })
		: scope === "new-folder" ? controller.createFoldersWithSources(destinationCollectionInternalId, { bundles: plan.folders })
			: controller.addSourcesToFolder(destinationFolderInternalId, { sources: plan.sources });
	return result.ok ? { ...result, counts: plan.counts } : result;
}
