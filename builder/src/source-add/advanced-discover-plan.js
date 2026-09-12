import { compileAdvancedDiscover } from "./advanced-discover.js";
import { NEW_FOLDER_DEFAULTS } from "../domain/node-defaults.js";
// The Genre duplicate inspector already compares full effective Discover identity.
import { inspectGenreSourceDuplicates, genreDuplicateOverrideIdentity } from "./genre-source.js";
import { normalizeHierarchyShowAllTab } from "./hierarchy-presentation.js";
import { isValidVisibleNuvioTitle, NUVIO_INVISIBLE_TITLE } from "../nuvio/titles.js";
export { inspectGenreSourceDuplicates as inspectDiscoverDuplicates, genreDuplicateOverrideIdentity as discoverDuplicateOverrideIdentity };
const fail = (message) => ({ ok: false, errors: [{ code: "DISCOVER_PLAN_INVALID", path: "$discoverPlan", message }] });
const artworkFields = ["coverImageUrl", "heroBackdropUrl", "titleLogoUrl", "focusGifUrl"];

// Stable logical keys retain dormant name/artwork drafts without creating empty folders.
export function advancedDiscoverFolders(options, drafts) {
 const split = options.folderArrangement === "split-media";
 const groups = split
  ? [["movies", "MOVIE"], ["series", "TV"]].map(([key, mediaType]) => ({ key, mediaType, drafts: drafts.filter((source) => source.editable.mediaType === mediaType) }))
  : [{ key: "combined", mediaType: null, drafts }];
 return groups.filter((group) => group.drafts.length).map((group) => {
  const saved = options.folderSettings?.[group.key] ?? {};
  const defaultTitle = group.key === "combined" ? options.folderTitle ?? "Discover" : group.key === "movies" ? "Movies" : "Series";
  return { ...group, title: saved.title ?? defaultTitle, artwork: { tileShape: NEW_FOLDER_DEFAULTS.tileShape, ...saved.artwork, focusGifEnabled: saved.artwork?.focusGifEnabled === undefined ? NEW_FOLDER_DEFAULTS.focusGifEnabled : saved.artwork.focusGifEnabled } };
 });
}
export function createAdvancedDiscoverPlan(project, options) {
 if (!project?.internalId || !Number.isSafeInteger(options?.projectRevision) || !["add-source", "new-folder", "new-collection"].includes(options.scope)) return fail("The Discover destination is unavailable.");
 const compiled = compileAdvancedDiscover(options.draft);
 if (!compiled.ok) return compiled;
 const config = structuredClone(options);
 const collection = project.collections.find((c) => c.internalId === config.collectionInternalId);
 const folder = collection?.folders.find((f) => f.internalId === config.folderInternalId);
 if (config.scope !== "new-collection" && !collection || config.scope === "add-source" && !folder) return fail("The destination no longer exists.");
 const duplicates = inspectGenreSourceDuplicates(project, folder?.internalId ?? null, compiled.drafts);
 const override = config.duplicateOverrideIdentity === genreDuplicateOverrideIdentity(folder?.internalId, compiled.drafts) && Boolean(folder);
 const drafts = config.scope === "add-source" && !override ? duplicates.missingDrafts : compiled.drafts;
 const appearance = config.appearance ?? {};
 let folders = [];
 if (config.scope !== "add-source") {
  if (!["one-folder", "split-media"].includes(config.folderArrangement ?? "one-folder")) return fail("Choose a supported folder arrangement.");
  if (!["SHOW_EVERYWHERE", "HIDE_HOME_SCREEN", "HIDE_EVERYWHERE"].includes(appearance.folderTitleVisibility ?? "HIDE_HOME_SCREEN")) return fail("Choose supported folder presentation.");
  folders = advancedDiscoverFolders(config, drafts);
  for (const entry of folders) {
   if (!isValidVisibleNuvioTitle(entry.title) || entry.title !== entry.title.trim()) return fail("Enter a name for each folder.");
   if (!["POSTER", "LANDSCAPE"].includes(entry.artwork.tileShape) || artworkFields.some((field) => entry.artwork[field] !== undefined && typeof entry.artwork[field] !== "string") || entry.artwork.focusGifEnabled !== undefined && typeof entry.artwork.focusGifEnabled !== "boolean") return fail("Choose supported folder artwork.");
   entry.editable = {
    title: appearance.folderTitleVisibility === "HIDE_EVERYWHERE" ? NUVIO_INVISIBLE_TITLE : entry.title,
    tileShape: entry.artwork.tileShape,
    hideTitle: (appearance.folderTitleVisibility ?? "HIDE_HOME_SCREEN") !== "SHOW_EVERYWHERE",
    ...Object.fromEntries(artworkFields.filter((field) => entry.artwork[field]?.trim()).map((field) => [field, entry.artwork[field]])),
    focusGifEnabled: entry.artwork.focusGifEnabled,
   };
  }
  if (config.scope === "new-collection") {
   if (!isValidVisibleNuvioTitle(config.collectionTitle) || config.collectionTitle !== config.collectionTitle.trim()) return fail("Enter a collection name.");
   if (!["TABBED_GRID", "ROWS"].includes(appearance.viewMode ?? "TABBED_GRID") || ["showAllTab", "pinToTop", "hideCollectionTitle"].some((k) => appearance[k] !== undefined && typeof appearance[k] !== "boolean")) return fail("Choose supported collection presentation.");
  }
 }
 const collectionEditable = config.scope !== "new-collection" ? null : {
  title: appearance.hideCollectionTitle ? NUVIO_INVISIBLE_TITLE : config.collectionTitle, viewMode: appearance.viewMode ?? "TABBED_GRID",
  showAllTab: normalizeHierarchyShowAllTab(appearance.viewMode ?? "TABBED_GRID", appearance.showAllTab ?? true), pinToTop: appearance.pinToTop ?? false, focusGlowEnabled: true,
 };
 return { ok: true, errors: [], plan: { planType: "advanced-discover", projectInternalId: project.internalId, revision: options.projectRevision, configuration: config, drafts, duplicates, folders, collectionEditable } };
}
export function applyAdvancedDiscoverPlan(controller, plan) {
 const state = controller?.getState?.();
 if (!state?.project || plan?.planType !== "advanced-discover" || plan.projectInternalId !== state.project.internalId || plan.revision !== state.revision) return fail("The project changed. Reopen Discover before adding Sources.");
 const rebuilt = createAdvancedDiscoverPlan(state.project, plan.configuration);
 if (!rebuilt.ok || JSON.stringify(rebuilt.plan) !== JSON.stringify(plan)) return fail("The Discover plan changed. Review the configuration again.");
 if (!plan.drafts.length) return fail("These exact Sources already exist in the folder.");
 const { scope, folderInternalId, collectionInternalId } = plan.configuration;
 if (scope === "add-source") return controller.addSourcesToFolder(folderInternalId, { sources: plan.drafts });
 const bundles = plan.folders.map((entry) => ({ folder: { editable: entry.editable }, sources: entry.drafts }));
 return scope === "new-folder" ? controller.createFoldersWithSources(collectionInternalId, { bundles }) : controller.createCollectionsWithFoldersAndSources({ bundles: [{ collection: { editable: plan.collectionEditable }, folders: bundles }] });
}
