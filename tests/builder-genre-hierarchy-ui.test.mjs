import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createElement } from "../builder/node_modules/react/index.js";
import { renderToStaticMarkup } from "../builder/node_modules/react-dom/server.js";
import { createServer } from "../builder/node_modules/vite/dist/node/index.js";
import { createBuilderController } from "../builder/src/application/index.js";
import { creationOptionsForScope } from "../builder/src/ui/creation-options.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(rootDir, relativePath), "utf8");
const flowSource = read("builder/src/ui/GenreHierarchyFlow.jsx");
const addSourceFlow = read("builder/src/ui/GenreSourceFlow.jsx");
const selectorSource = read("builder/src/ui/GenreCatalogueSelector.jsx");
const dialogSource = read("builder/src/ui/CreationDialog.jsx");
const workspaceSource = read("builder/src/ui/BuilderWorkspace.jsx");
const previewProvider = read("builder/src/source-add/tmdb-genre-preview-provider.js");
const previewRequester = read("builder/src/source-add/tmdb-discover-preview-requester.js");
const structureSource = read("builder/src/source-add/genre-hierarchy-structures.js");
const choiceCardsSource = read("builder/src/ui/ChoiceCards.jsx");
const styles = read("builder/src/styles.css");

const vite = await createServer({
	root: path.join(rootDir, "builder"),
	appType: "custom",
	logLevel: "silent",
	server: { middlewareMode: true },
});
const { GenreHierarchyFlow } = await vite.ssrLoadModule("/src/ui/GenreHierarchyFlow.jsx");
const { GenreCatalogueList } = await vite.ssrLoadModule("/src/ui/GenreCatalogueSelector.jsx");
const { GENRE_CONCEPTS } = await vite.ssrLoadModule("/src/source-add/index.js");
after(() => vite.close());

test("Genres follows the completed hierarchy families in both creation scopes", () => {
	const expected = ["blank", "decades", "people", "franchises", "tmdb-lists", "studios", "networks", "genres", "streaming-services"];
	for (const scope of ["new-collection", "new-folder"]) assert.deepEqual(creationOptionsForScope(scope).map((option) => option.id), expected);
	assert.match(dialogSource, /CREATION_OPTION_IDS\.GENRES/);
	assert.match(dialogSource, /<GenreHierarchyFlow/);
	assert.match(dialogSource, /onApply=\{onApplyGenres\}/);
	assert.match(workspaceSource, /applyGenreHierarchyPlan/);
	assert.match(workspaceSource, /onApplyGenres=\{applyGenrePlan\}/);
	assert.match(workspaceSource, /genrePreviewProviderRef/);
	assert.match(dialogSource, /previewProvider=\{genrePreviewProvider\}/);
	assert.doesNotMatch(workspaceSource, /Add genres/);
});

test("Genre hierarchy opens on an accessible local Select stage without Search autofocus", () => {
	const app = createBuilderController({ initialProjectTitle: "Genre hierarchy UI" });
	const state = app.getState();
	const markup = renderToStaticMarkup(createElement(GenreHierarchyFlow, {
		scope: "new-collection",
		project: state.project,
		projectRevision: state.revision,
		onBack() {},
		onCancel() {},
		onApply() {},
	}));
	assert.match(markup, /Create with Genres/);
	assert.match(markup, /data-genre-hierarchy-stage="select"/);
	assert.match(markup, /Select Genres/);
	assert.equal((markup.match(/data-genre-name=/g) ?? []).length, 27);
	assert.equal((markup.match(/type="checkbox"/g) ?? []).length, 27);
	assert.equal((markup.match(/class="visually-hidden choice-card-input"/g) ?? []).length, 27);
	assert.doesNotMatch(markup, /selectable-card-indicator|✓/);
	assert.match(markup, /0 of 27 selected/);
	assert.match(markup, /Select all/);
	assert.match(markup, /Clear all/);
	assert.doesNotMatch(markup, /autofocus|large-selection-notice|there is no selection cap/i);
});

test("Genre hierarchy configures the shared selected-items component as an always-compact disclosure", () => {
	const selectStep = flowSource.slice(flowSource.indexOf("function SelectStep"), flowSource.indexOf("function placementLabel"));
	assert.match(selectStep, /<RemovableSelectionSummary[^>]*alwaysDisclose[^>]*showDisclosureCount=\{false\}/);
	assert.doesNotMatch(selectStep, /compactThreshold/);
	assert.doesNotMatch(flowSource, /COMPACT_GENRE_THRESHOLD/);
	assert.match(selectStep, /disclosureLabel="View selected Genres"/);
});

test("checkbox catalogue mode preserves the existing Add Source button mode", () => {
	const concepts = GENRE_CONCEPTS.slice(0, 2);
	const checkbox = renderToStaticMarkup(createElement(GenreCatalogueList, { concepts, selection: [concepts[0].name], selectionControl: "checkbox", onChoose() {} }));
	const button = renderToStaticMarkup(createElement(GenreCatalogueList, { concepts, selection: [concepts[0].name], onChoose() {} }));
	assert.match(checkbox, /class="visually-hidden choice-card-input" type="checkbox" checked=""/);
	assert.doesNotMatch(checkbox, /selection-state|selection-indicator|✓/);
	assert.doesNotMatch(checkbox, /aria-pressed/);
	assert.match(button, /aria-pressed="true"/);
	assert.doesNotMatch(button, /type="checkbox"/);
	assert.match(selectorSource, /selectionControl = "button"/);
	assert.match(addSourceFlow, /<GenreCatalogueList concepts=\{concepts\} selection=\{selection\} onChoose=\{onChoose\} \/>/);
});

test("Genre hierarchy uses Select to Configure to Structure to Appearance with shared Advanced surfaces", () => {
	assert.match(flowSource, /setStep\("configure"\)/);
	assert.match(flowSource, /setStep\("structure"\)/);
	assert.match(flowSource, /setStep\("appearance"\)/);
	assert.match(flowSource, /Continue to Structure/);
	assert.match(flowSource, /Continue to Appearance/);
	assert.match(flowSource, /function ConfigureStep/);
	assert.match(flowSource, /function StructureStep/);
	assert.match(flowSource, /function AppearanceStep/);
	assert.match(flowSource, /<GenreAdvancedOptions/);
	assert.match(flowSource, /<GenreAdvancedSecondarySurface/);
	assert.match(flowSource, /inert=\{secondarySurface \|\| preview \|\| undefined\}/);
	assert.match(flowSource, /!secondarySurface \? <footer/);
	assert.match(flowSource, /pruneGenreExclusionConfiguration/);
	assert.doesNotMatch(flowSource, /Review &amp; Appearance|Continue to Review/);
	assert.doesNotMatch(flowSource, /DestinationChoices|Add all to this folder|One folder per genre|Add all anyway|Add anyway/);
});

test("Configure always renders compact logical placement rows with Preview and Remove actions", () => {
	const configure = flowSource.slice(flowSource.indexOf("function ConfigureStep"), flowSource.indexOf("function AppearanceStep"));
	assert.match(configure, /Configured Genres/);
	assert.match(configure, /folderPlan\.groups\.map/);
	assert.doesNotMatch(configure, /RemovableSelectionSummary|View selected Genres|View all|onToggleExpanded|visibleGroups/);
	assert.match(flowSource, /Already in this collection · omitted/);
	assert.match(flowSource, /Partly in this collection · omitted/);
	assert.match(flowSource, /Exists elsewhere · ready to create/);
	assert.match(flowSource, /group\.drafts\.map\(\(draft\) => draft\.editable\.title\)/);
	assert.match(flowSource, /Preview titles<\/button>/);
	assert.match(flowSource, /genre-hierarchy-configure-remove/);
	assert.match(flowSource, /Sort: \{sortLabel\} · Advanced:/);
	assert.doesNotMatch(configure, /35 verbose|physical-source rows/);
});

test("Configure reuses semantic pills and explains fixed-media Genres while Appearance adapts by Structure", () => {
	const configure = flowSource.slice(flowSource.indexOf("function ConfigureStep"), flowSource.indexOf("function StructureStep"));
	const appearance = flowSource.slice(flowSource.indexOf("function AppearanceStep"), flowSource.indexOf("export function GenreHierarchyFlow"));
	assert.match(configure, /genre-hierarchy-configuration-surface/);
	assert.match(configure, /legend="Media"/);
	assert.match(configure, /Applies to Genres available in both Movies and Series\./);
	assert.match(configure, /Sort titles by/);
	assert.match(flowSource, /\$\{affected\[0\]\.name\} is \$\{fixedLabel\} and will still create a \$\{sourceLabel\} source/);
	assert.match(flowSource, /\$\{affected\.length\} selected Genres are \$\{fixedLabel\}/);
	assert.match(styles, /\.genre-hierarchy-configuration-surface[\s\S]*linear-gradient/);
	assert.match(styles, /\.studio-sort-choice-row\s*\{[\s\S]*flex-wrap:\s*wrap/);
	assert.doesNotMatch(styles, /\.genre-hierarchy-configuration-surface \.studio-sort-choice-row/);
	assert.match(appearance, /Plan totals/);
	assert.match(appearance, /Movie collection name/);
	assert.match(appearance, /Series collection name/);
	assert.match(appearance, /<TitleOptions/);
	assert.match(appearance, /<HierarchyCollectionPresentationControls/);
	assert.match(appearance, /<PresentationSwitch/);
	assert.match(appearance, /Parent presentation is inherited/);
	assert.match(appearance, /Artwork shape/);
	assert.match(appearance, /<FolderShapeChoices/);
	assert.match(appearance, /safe Movies\/Series folder fallback/);
	assert.match(appearance, /vertical/);
	assert.match(appearance, /wide/);
	assert.doesNotMatch(appearance, /fixed Landscape tiles|artwork URL|focus/);
	assert.doesNotMatch(appearance, /GenreConfigureRow|onRemove|GenreAdvancedOptions/);
});

test("Structure presents plain-language plan-derived choices without changing composite boundaries", () => {
	const structure = flowSource.slice(flowSource.indexOf("function StructureChoicePreview"), flowSource.indexOf("function AppearanceStep"));
	assert.match(structure, /Step 3/);
	assert.match(structure, /Choose how the configured Genres are organised in Nuvio\./);
	assert.doesNotMatch(structure, />Genre hierarchy</);
	assert.match(structure, /legend="Structure options" hideLegend/);
	assert.match(choiceCardsSource, /hideLegend \? "visually-hidden"/);
	assert.match(structure, /GENRE_HIERARCHY_STRUCTURES/);
	assert.match(structureSource, /label: "Genre folders", description: "One folder for each Genre, with Movies and Series together\."/);
	assert.match(structureSource, /label: "Media folders", description: "One Movies folder and one Series folder, with Genres inside each\."/);
	assert.match(structureSource, /label: "Separate Movie & Series Genre folders", description: "Create a separate folder for every Movie and Series Genre\."/);
	assert.match(structureSource, /label: "Separate Movie & Series collections", description: "Create one collection for Movie Genres and another for Series Genres\."/);
	assert.match(structure, /GENRE_STRUCTURE_PREVIEWS/);
	assert.match(structure, /StructureChoicePreview/);
	assert.match(structure, /genre-structure-wireframe/);
	assert.match(structure, /genre-structure-wireframe-collection-title/);
	assert.match(structure, /genre-structure-wireframe-folder-title/);
	assert.match(structure, /genre-structure-wireframe-sources/);
	assert.match(structure, /data-collection-count/);
	assert.match(structure, /aria-hidden="true"/);
	assert.match(structure, /counts\.collectionCount/);
	assert.match(structure, /counts\.folderCount/);
	assert.doesNotMatch(structure, /counts\.sourceCount/);
	assert.doesNotMatch(structure, /Movies → Action|Action → Movies|Movie Genres → Action/);
	assert.match(structure, /Where should combined Series genres go\?/);
	assert.match(structure, /Some Series genres combine categories that Movies keep separate\. You can keep them in their own folder or place them with the matching Movie genres\./);
	assert.doesNotMatch(structure, /Optional placement|Composite Series Genres|self-describing Series source/);
	assert.match(structureSource, /label: "Keep its own folder"/);
	assert.doesNotMatch(structureSource, /label: "Create its own folder"/);
	assert.match(structure, /options\.structure === "genre-folders"/);
	assert.match(flowSource, /scope !== "new-collection" \|\| effectiveMedia\.size !== 2/);
	assert.match(flowSource, /folderTitleVisibilityTouched/);
	assert.match(flowSource, /back-to-genre-hierarchy-structure/);
	assert.match(styles, /\.genre-structure-choice-grid/);
	assert.match(styles, /\.genre-structure-choice-grid > label\[data-selected="true"\]/);
	assert.match(styles, /\.genre-structure-choice-grid > label:has\(input:focus-visible\)/);
	assert.match(styles, /\.genre-structure-preview\s*\{[\s\S]*grid-template-rows:\s*auto auto;[\s\S]*align-content:\s*space-between;[\s\S]*align-self:\s*stretch;/);
	assert.match(styles, /\.genre-structure-wireframe\[data-collection-count="2"\]/);
	assert.match(styles, /@media \(max-width: 520px\)[\s\S]*\.genre-structure-wireframe-folder:nth-child\(n \+ 3\)/);
	assert.match(styles, /\.genre-composite-placement/);
});

test("Genre Preview uses exact drafts, lazy media tabs, shared nested shell, and full-query cache identity", () => {
	assert.match(flowSource, /previewProvider\.getGenrePreview\(draft/);
	assert.match(flowSource, /requestPreview\(group, group\.drafts\[0\], trigger\)/);
	assert.match(flowSource, /preview\.group\.drafts\.length > 1/);
	assert.match(flowSource, /<NestedPreviewDialog/);
	assert.match(flowSource, /<PosterOnlyPreviewGrid items=\{items\} limit=\{10\}/);
	assert.match(flowSource, /No posters available\./);
	assert.match(flowSource, /createAsyncRequestCoordinator/);
	assert.match(flowSource, /focusElementWithoutScroll\(trigger\)/);
	assert.doesNotMatch(flowSource, /prefetch|Promise\.all\([^)]*getGenrePreview/);
	assert.match(previewProvider, /discoverFilterDescriptor/);
	assert.match(previewProvider, /source\.filters/);
	assert.match(previewProvider, /include_adult:\s*"false"/);
	assert.match(previewProvider, /withoutGenres/);
	assert.match(previewRequester, /getQueryPreview/);
	assert.match(previewRequester, /queryIdentity\(entries\)/);
	assert.doesNotMatch(styles, /\.studio-preview-grid img:nth-child\(n \+ 6\)/);
});

test("Genre hierarchy has one scroll owner and the established focus/selection styling", () => {
	assert.equal((flowSource.match(/className="add-source-scroll"/g) ?? []).length, 1);
	assert.match(flowSource, /scrollByStepRef/);
	assert.match(flowSource, /focusElementWithoutScroll/);
	assert.match(styles, /\.genre-catalogue-choice\s*\{[\s\S]*position:\s*relative[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/);
	assert.match(styles, /\.genre-catalogue-choice\.is-selected/);
	assert.match(styles, /label:has\(> \.choice-card-input:focus-visible\)\s*\{[\s\S]*outline:\s*3px solid var\(--cyan-bright\)/);
	assert.doesNotMatch(styles, /selectable-card-indicator|selectable-card-checkbox/);
	assert.doesNotMatch(styles.match(/\.genre-catalogue-choice\.is-selected\s*\{[\s\S]*?\}/)?.[0] ?? "", /border-left/);
	assert.match(flowSource, /back-to-genre-hierarchy-selection/);
	assert.match(flowSource, /back-to-genre-hierarchy-configuration/);
	assert.doesNotMatch(flowSource, /fetch\(/);
});
