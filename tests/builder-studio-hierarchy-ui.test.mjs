import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(rootDir, relativePath), "utf8");
const flow = read("builder/src/ui/StudioHierarchyFlow.jsx");
const studioFlow = read("builder/src/ui/StudioSourceFlow.jsx");
const studioCatalogue = read("builder/src/source-add/studio-catalogue.js");
const searchHook = read("builder/src/ui/use-studio-catalogue-search.js");
const previewProvider = read("builder/src/source-add/tmdb-studio-preview-provider.js");
const nestedDialog = read("builder/src/ui/NestedPreviewDialog.jsx");
const franchiseFlow = read("builder/src/ui/FranchiseSourceFlow.jsx");
const posterGrid = read("builder/src/ui/PosterOnlyPreviewGrid.jsx");
const dialog = read("builder/src/ui/CreationDialog.jsx");
const workspace = read("builder/src/ui/BuilderWorkspace.jsx");
const styles = read("builder/src/styles.css");

test("Studios is routed through the scope-aware hierarchy launcher and workspace-scoped providers", () => {
	assert.match(dialog, /CREATION_OPTION_IDS\.STUDIOS/);
	assert.match(dialog, /<StudioHierarchyFlow/);
	assert.match(dialog, /catalogueProvider=\{studioCatalogueProvider\}/);
	assert.match(dialog, /previewProvider=\{studioPreviewProvider\}/);
	assert.match(workspace, /studioPreviewProviderRef/);
	assert.match(workspace, /studioArtworkRuntimeClientRef/);
	assert.match(workspace, /applyStudioHierarchyPlan/);
});

test("Studio hierarchy reuses the physical catalogue search state and preserves exact Search count wording", () => {
	assert.match(flow, /useStudioCatalogueSearch\(catalogueProvider, \{ movieCountFilters: true \}\)/);
	assert.match(studioFlow, /export function StudioResultContent/);
	assert.match(studioFlow, /Movie Count: \{movieCount\}/);
	assert.doesNotMatch(studioFlow.slice(studioFlow.indexOf("function StudioResultContent"), studioFlow.indexOf("function StudioResult", studioFlow.indexOf("function StudioResultContent") + 1)), /Movie Count ·/);
	assert.match(searchHook, /catalogueProvider\.searchStudios/);
	assert.doesNotMatch(searchHook, /getStudioPreview|countProvider|getStudioCounts|discover/);
});

test("selectable Studio cards use native full-card checkboxes and contain no nested Preview action", () => {
	const result = flow.slice(flow.indexOf("function SelectableStudioResult"), flow.indexOf("function previewMediaTypes"));
	assert.match(result, /<label[^>]+studio-result-selectable/);
	assert.match(result, /type="checkbox"/);
	assert.match(result, /selectable-card-indicator/);
	assert.match(result, /<StudioResultContent/);
	assert.doesNotMatch(result, /Preview|aria-haspopup="dialog"/);
	assert.doesNotMatch(styles.match(/\.studio-result-selectable\s*\{[\s\S]*?\}/)?.[0] ?? "", /border-left/);
});

test("Select keeps its disclosure while Configure owns direct selected Studio rows", () => {
	const selectedDisclosure = flow.slice(flow.indexOf("function SelectedStudios"), flow.indexOf("function SelectableStudioResult"));
	assert.match(flow, /function SelectedStudios/);
	assert.match(flow, /View selected Studios/);
	assert.match(selectedDisclosure, /className="studio-selected-remove"/);
	assert.doesNotMatch(selectedDisclosure, /Preview|aria-haspopup="dialog"/);
	assert.equal((flow.match(/<SelectedStudios/g) ?? []).length, 1);
	assert.match(flow, /function StudioConfigureRow/);
	assert.match(flow, /className="studio-configure-row"/);
	assert.match(flow, /className="studio-configure-remove"/);
	assert.match(flow, /No Studios selected\. Go Back to Select/);
	assert.match(flow, /there is no selection cap/);
	assert.doesNotMatch(flow.slice(flow.indexOf("function ConfigureStep"), flow.indexOf("function AppearanceStep")), /View selected Studios/);
});

test("Configure has one shared Movies default, three compositions, and the four evidenced Studio sorts", () => {
	assert.match(flow, /DEFAULT_STUDIO_HIERARCHY_MEDIA_MODE/);
	assert.match(flow, /<SemanticSortChoices options=\{STUDIO_HIERARCHY_MEDIA_MODES\}/);
	assert.match(flow, /<StudioSortChoices/);
	assert.match(flow, /className="studio-configure-helper">These choices apply to every selected Studio\./);
	assert.doesNotMatch(flow, /Movies and Popular are selected by default/);
	assert.doesNotMatch(styles.match(/\.studio-configure-helper\s*\{[\s\S]*?\}/)?.[0] ?? "", /background|border/);
	assert.doesNotMatch(flow, /per-Studio|Automatic/);
});

test("Preview is explicit only in direct Configure rows with lazy Both tabs", () => {
	assert.match(flow, /function openPreview\(studio, trigger\)/);
	assert.match(flow, /Preview titles<\/button>/);
	assert.match(flow, /role="tablist"/);
	assert.match(flow, /mediaTypes\.map\(\(mediaType\)/);
	assert.match(flow, /previewMediaTypes\(options\.mediaMode\)\[0\]/);
	assert.doesNotMatch(flow, /step === "select" \? "movies"/);
	assert.equal((flow.match(/previewProvider\.getStudioPreview/g) ?? []).length, 1);
	assert.doesNotMatch(flow, /prefetch|Promise\.all\([^)]*getStudioPreview/);
});

test("hierarchy Search exposes checked-in Movie count filters while Add Source keeps hide-zero", () => {
	const hierarchyControls = studioFlow.slice(studioFlow.indexOf("{showMovieCountFilters ? <>"), studioFlow.indexOf("</> : <>", studioFlow.indexOf("{showMovieCountFilters ? <>")));
	assert.match(studioFlow, /Movie count/);
	for (const label of ["All", "Exclude 0", "10+", "50+", "100+", "500+"]) assert.match(studioCatalogue, new RegExp(`label: "${label.replace("+", "\\+")}"`));
	assert.match(flow, /showMovieCountFilters/);
	assert.match(flow, /onMovieCountFilterChange=\{search\.changeMovieCountFilter\}/);
	assert.match(searchHook, /setPage\(1\)/);
	assert.match(hierarchyControls, /Order Studios A–Z/);
	assert.doesNotMatch(hierarchyControls, /Most movies|>Sort</);
	assert.match(studioFlow, /Hide studios with no movies/);
	assert.match(studioFlow, />Most movies<\/button>/);
});

test("Preview response cache is sort-aware while transient Series knowledge is Company/media keyed", () => {
	assert.match(previewProvider, /company:\$\{studioId\}:\$\{mediaType\}:\$\{concreteSort\}/);
	assert.match(previewProvider, /cacheTtlMs = TMDB_STUDIO_PREVIEW_CACHE_TTL_MS/);
	assert.match(previewProvider, /cacheMaxEntries = TMDB_STUDIO_PREVIEW_CACHE_MAX_ENTRIES/);
	assert.match(flow, /\[`\$\{studio\.id\}\|TV`\]: outcome\.result\.data\.totalResults/);
	assert.doesNotMatch(flow, /not loaded|Series · —|Series · -/i);
	assert.doesNotMatch(previewProvider, /limit.*cacheKey|cacheKey.*limit/);
});

test("Studio and Franchise share the structural nested Preview shell without sharing provider data", () => {
	assert.match(flow, /<NestedPreviewDialog/);
	assert.match(franchiseFlow, /<NestedPreviewDialog/);
	assert.match(nestedDialog, /createPortal\(content, document\.body\)/);
	assert.match(nestedDialog, /handleDialogKeyDown/);
	assert.match(nestedDialog, /focusElementWithoutScroll/);
	assert.match(nestedDialog, /data-nested-modal-backdrop="true"/);
	assert.doesNotMatch(nestedDialog, /Studio|Franchise|People|provider|poster/);
});

test("Appearance exposes presentation decisions without artwork controls or Studio review rows", () => {
	assert.match(flow, /<TitleOptions/);
	assert.match(flow, /<HierarchyCollectionPresentationControls/);
	assert.match(flow, /<PresentationSwitch/);
	const appearance = flow.slice(flow.indexOf("function AppearanceStep"), flow.indexOf("export function StudioHierarchyFlow"));
	assert.match(appearance, />Appearance</);
	assert.match(appearance, /Plan totals/);
	assert.match(appearance, /Collection name/);
	assert.match(appearance, /Collection layout/);
	assert.match(appearance, /Pin collection to top/);
	assert.doesNotMatch(appearance, /Artwork|Landscape|representativeArtwork|studio-appearance-artwork|FolderShapeChoices|studio-folder-shape/);
	assert.doesNotMatch(appearance, /Preview titles|onPreview|onRemove|studio-review-list|StudioLogo|movieCount|knownSeriesCounts/);
	assert.match(flow, /: "Choose presentation settings\."/);
	assert.doesNotMatch(flow, /Choose presentation and fixed Landscape artwork settings/);
	assert.match(flow, /resolveStudioFolderArtworkBatch\(chosen, artworkRuntimeClient\)/);
	assert.match(flow, /Continue to Appearance/);
	assert.doesNotMatch(flow, /Review &amp; Appearance|Continue to Review/);
});

test("Studio hierarchy has one scroll owner, sticky actions, and 10 desktop / 5 mobile Preview presentation", () => {
	assert.equal((flow.match(/className="add-source-scroll"/g) ?? []).length, 1);
	assert.match(flow, /<footer className="add-source-actions">/);
	assert.match(flow, /<PosterOnlyPreviewGrid items=\{items\} limit=\{10\}/);
	assert.match(styles, /@media \(max-width: 520px\)[\s\S]*\.studio-preview-grid img:nth-child\(n \+ 6\)/);
	assert.match(styles, /@media \(min-width: 521px\) and \(max-width: 620px\)[\s\S]*\.studio-preview-grid img:nth-child\(n \+ 6\)[\s\S]*display:\s*block/);
	assert.match(styles, /\.nested-modal-backdrop\s*\{[\s\S]*z-index:\s*var\(--layer-nested-modal\)/);
	assert.match(posterGrid, /filter\(\(candidate\) => candidate\.source !== null\)/);
	assert.match(posterGrid, /slice\(0, limit\)/);
	assert.match(posterGrid, /data-preview-empty-state="true">\{emptyMessage\}/);
	assert.match(posterGrid, /onError=/);
	assert.doesNotMatch(flow.slice(flow.indexOf("function StudioTitlePreview"), flow.indexOf("function placementLabel")), /item\.title|item\.year|No poster|first-page|Preview does not change/);
});

test("selected-folder Studio Add Source remains the separate physical flow with its live count provider", () => {
	assert.match(workspace, /<StudioSourceFlow/);
	assert.match(workspace, /countProvider=\{studioCountProviderRef\.current\}/);
	assert.match(studioFlow, /loadCounts\(studio\)/);
	assert.match(studioFlow, /Add all anyway/);
	assert.doesNotMatch(studioFlow, /StudioHierarchyFlow|createStudioHierarchyPlan/);
});
