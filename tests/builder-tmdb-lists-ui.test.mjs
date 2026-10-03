import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const sharedPresentation = fs.readFileSync(new URL("../builder/src/ui/GuidedPresentationControls.jsx", import.meta.url), "utf8");
const flow = read("builder/src/ui/TmdbListSourceFlow.jsx");
const workspace = read("builder/src/ui/BuilderWorkspace.jsx");
const creation = read("builder/src/ui/CreationDialog.jsx");
const sourceModes = read("builder/src/source-add/source-modes.js");
const sourceEditors = read("builder/src/source-edit/source-editors.js");
const editorDialog = read("builder/src/ui/SourceEditorDialog.jsx");
const previewDialog = read("builder/src/ui/SourceTitlePreviewDialog.jsx");
const nestedPreviewDialog = read("builder/src/ui/NestedPreviewDialog.jsx");
const posterGrid = read("builder/src/ui/PosterOnlyPreviewGrid.jsx");
const results = read("builder/src/ui/TitlePreviewResults.jsx");
const styles = read("builder/src/styles.css");

test("unknown List totals remain honest on both creation summaries without adding settings", () => {
	assert.equal(flow.split('list.itemCount === null ? "Count unavailable"').length - 1, 2);
	assert.doesNotMatch(flow, /TMDB_LIST_EDIT_SORT_OPTIONS|tmdb-list-edit-sort/);
});

test("TMDB Lists is available from Add Source, New Collection, and New Folder through registered flows", () => {
	assert.match(sourceModes, /label: "TMDB lists"[\s\S]*description: "Add one or more public TMDB lists\."/);
	assert.match(workspace, /visibleAddSourceSession\.modeId === TMDB_LIST_SOURCE_MODE_ID[\s\S]*<TmdbListSourceFlow/);
	assert.match(creation, /CREATION_OPTION_IDS\.TMDB_LISTS[\s\S]*<TmdbListSourceFlow context="hierarchy"/);
	assert.match(flow, /title=\{standalone \? "Add TMDB List sources" : "Create with TMDB Lists"\}/);
	assert.match(flow, /scope === "new-collection"[\s\S]*Collection name/);
	assert.match(flow, /Folder name/);
});

test("the shared selection step is multiline, ordered, removable, unbounded, and preserves input while showing line feedback", () => {
	assert.match(flow, /List URLs or IDs<\/label><textarea className="editor-textarea"/);
	assert.match(flow, /parseTmdbListBatch\(input/);
	assert.match(flow, /for \(const entry of batch\.entries\)/);
	assert.match(flow, /setLists\(\(current\) => Object\.freeze\(\[\.\.\.current, \.\.\.resolved\]\)\)/);
	assert.doesNotMatch(flow, /setInput\(failed\.map/);
	assert.match(flow, />Clear input<\/button>/);
	assert.match(flow, /function clearInput\(\)[\s\S]*setInput\(""\)[\s\S]*setLineErrors\(\[\]\)[\s\S]*setDuplicateNotice\(""\)/);
	assert.match(flow, /submittedDuplicates = batch\.duplicates\.filter\(\(entry\) => entry\.kind === "submitted"\)/);
	assert.match(flow, /setInput\(event\.target\.value\); setLineErrors\(\[\]\); setDuplicateNotice\(""\)/);
	assert.match(flow, /aria-label=\{`Remove/);
	assert.doesNotMatch(flow, /MAX_(?:LIST|SELECTION)|slice\(0,\s*(?:20|50|100)\)/);
});

test("the multiline Lists input reuses the Builder form-control styling contract", () => {
	assert.match(styles, /\.editor-field input\[type="text"\],[\s\S]*\.editor-field textarea\s*\{[\s\S]*color:\s*var\(--text\)[\s\S]*font:\s*inherit[\s\S]*background:\s*rgb\(5 17 25 \/ 90%\)[\s\S]*border:\s*1px solid var\(--border-strong\)[\s\S]*border-radius:\s*10px/);
	assert.match(styles, /\.editor-field textarea::placeholder\s*\{[\s\S]*color:\s*var\(--quiet\)/);
	assert.match(styles, /\.tmdb-list-input-field textarea\s*\{[\s\S]*resize:\s*vertical/);
	assert.match(styles, /\.tmdb-list-input-field textarea\s*\{[\s\S]*font-family:\s*inherit[\s\S]*font-size:\s*0\.875rem[\s\S]*font-weight:\s*400[\s\S]*line-height:\s*1\.5[\s\S]*caret-color:\s*var\(--cyan-bright\)/);
	assert.match(styles, /textarea:focus-visible,[\s\S]*outline:\s*3px solid var\(--cyan-bright\)/);
});

test("list resolution and Preview use only the injected provider and the shared title-preview path", () => {
	assert.match(flow, /provider\.getList\(entry\.id/);
	assert.match(flow, /kind: "list", tmdbId: list\.id, mediaType: "MOVIE", label: list\.sourceTitle/);
	assert.match(flow, /requestSourceTitlePreview\(candidate\.request, \{ list: provider \}/);
	assert.match(flow, /<SourceTitlePreviewDialog/);
	assert.match(previewDialog, /const listPreview = preview\.candidate\.request\.kind === "list"/);
	assert.match(previewDialog, /<TitlePreviewResults data=\{preview.data\} previewLimit=\{previewLimit\} posterUrlForPath=\{posterUrlForPath\} listPreview=\{listPreview\}/);
	assert.match(results, /titlePreviewSummary\(represented, displayedCount, previewLimit\)/);
	assert.match(results, /displayAll embedded/);
	assert.match(posterGrid, /renderSummary\?\.\(visible\.length\)/);
	assert.doesNotMatch(editorDialog, /tmdb-list-sort-help|Nuvio applies Recent/);
	assert.match(posterGrid, /displayAll \? candidates : candidates\.slice\(0, limit\)/);
	assert.doesNotMatch(posterGrid, /onScroll=|onWheel=|onTouchEnd=|revealState|revealMore/);
	assert.doesNotMatch(previewDialog, /page\s*2|Load more|fetch\(/i);
	assert.doesNotMatch(flow, /\bfetch\(|XMLHttpRequest|createTmdbListProvider/);
});

test("TMDB Lists shares the bounded result window, summary and body scroll owner", () => {
	assert.match(previewDialog, /<SourcePreviewContent>/);
	assert.match(posterGrid, /data-preview-complete-sample=\{displayAll \? "true" : undefined\}/);
	assert.match(posterGrid, /displayAll \? candidates : candidates\.slice\(0, limit\)/);
	assert.match(styles, /\.source-title-preview-summary\s*\{[\s\S]*color:\s*var\(--muted\)/);
	assert.match(previewDialog, /tmdb-list-preview-modal/);
	assert.match(styles, /\.franchise-preview-modal\.source-sort-preview-modal\s*\{[\s\S]*grid-template-rows:\s*auto minmax\(0, 1fr\)/);
	assert.doesNotMatch(styles, /\.tmdb-list-preview-grid\[data-preview-progressive=/);
});

test("Preview reuses the Dingo scrollbar, three phone columns, and five larger-screen columns", () => {
	assert.match(posterGrid, /poster-only-preview-grid dingo-scrollbar/);
	assert.match(styles, /\.node-editor,\s*\.dingo-scrollbar\s*\{[\s\S]*scrollbar-color:\s*rgb\(70 118 136\) rgb\(4 16 23\)[\s\S]*scrollbar-width:\s*auto/);
	assert.match(styles, /\.node-editor::\-webkit-scrollbar-thumb,\s*\.dingo-scrollbar::\-webkit-scrollbar-thumb\s*\{[\s\S]*background:\s*rgb\(70 118 136\)[\s\S]*border:\s*2px solid rgb\(4 16 23\)[\s\S]*border-radius:\s*999px/);
	assert.match(styles, /\.franchise-preview-grid\s*\{[\s\S]*width:\s*100%[\s\S]*min-width:\s*0[\s\S]*max-width:\s*100%[\s\S]*grid-template-columns:\s*repeat\(5, minmax\(0, 1fr\)\)/);
	assert.match(styles, /@media \(max-width: 620px\)[\s\S]*\.franchise-preview-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
	assert.match(styles, /\.poster-only-preview-grid img\s*\{[\s\S]*width:\s*100%[\s\S]*min-width:\s*0[\s\S]*max-width:\s*100%/);
});

test("the body-portalled nested Preview stays bound to the live Visual Viewport", () => {
	assert.match(nestedPreviewDialog, /resolveAddSourceViewportStyle\(window\)/);
	assert.match(nestedPreviewDialog, /observeAddSourceViewport\(setViewportStyle\)/);
	assert.match(nestedPreviewDialog, /style=\{\{ \.\.\.viewportStyle, \.\.\.backdropStyle \}\}/);
	assert.match(styles, /\.franchise-preview-backdrop\s*\{[\s\S]*container-type:\s*inline-size/);
	assert.match(styles, /\.franchise-preview-modal\s*\{[\s\S]*min-width:\s*0[\s\S]*max-width:\s*100%/);
});

test("Names retains secondary Source names, clear placement status, Original order and no content Preview control", () => {
	assert.match(flow, /<SourceNamesDisclosure naming=\{activeNaming\}/);
	assert.match(flow, /Already in this collection · omitted/);
	assert.match(flow, /Exists elsewhere · ready to create/);
	assert.match(flow, /<SourceElsewhereNotice/);
	assert.match(flow, /Add all anyway/);
	assert.match(flow, /Nothing to add/);
	assert.match(flow, /· Original order/);
	assert.doesNotMatch(flow, /· List order/);
	assert.match(flow, />Preview titles<\/button>/);
	assert.doesNotMatch(flow, />Preview<\/button>/);
	assert.doesNotMatch(flow, /coverImageUrl|heroBackdropUrl|Sort choices|Media type/);
});

test("guided Lists defaults per-list Folder names, uses concise shared create copy, and links required errors to each field and retains the footer summary", () => {
	assert.match(flow, /useState\(""\)[\s\S]*useState\(""\)/);
	assert.match(flow, /folderTitle: defaultTmdbListFolderTitle\(result\.data\)/);
	assert.doesNotMatch(flow, /useState\("TMDB Lists"\)|useState\("Lists"\)|useState\("My Lists"\)/);
	assert.match(flow, /guidedCreateActionLabel\(scope, hierarchyReview\?\.counts\)/);
	assert.doesNotMatch(flow, /Create collection with 1 folder|Create 1 folder with/);
	assert.match(flow, /Collection and folder names are required\./);
	assert.match(flow, /Collection name is required\./);
	assert.match(flow, /Folder name is required\./);
	assert.match(flow, /error=\{requiredNameErrors\.collection/);
	assert.match(flow, /error=\{requiredNameErrors\.folders\[list\.id\]/);
	assert.match(flow, /focusRequiredName\(key === "collection"/);
	assert.match(flow, /className="tmdb-list-footer-validation" role="alert"/);
	assert.match(flow, /standalone \? <div[^\n]+<CreationStageIntro step=\{2\} phase="Names" title="Names"/);
	assert.match(flow, /Review placement and name the folders and sources that will be created\./);
});

test("guided Lists directly reuses standard Collection and Folder presentation controls while Add Source remains container-free", () => {
	assert.match(sharedPresentation, /import \{ HierarchyCollectionPresentationControls \} from "\.\/CollectionPresentationChoices\.jsx"/);
	assert.match(sharedPresentation, /import \{ FolderShapeChoices, PresentationSwitch, TitleOptions \} from "\.\/PresentationControls\.jsx"/);
	assert.match(sharedPresentation, /<TitleOptions[\s\S]*collectionTitleVisibility=\{scope === "new-collection"[\s\S]*folderTitleVisibility=/);
	assert.match(sharedPresentation, /<HierarchyCollectionPresentationControls[\s\S]*showAllTab=\{options\.showAllTab\}/);
	assert.match(sharedPresentation, /<PresentationSwitch label="Pin collection to top"/);
	assert.match(sharedPresentation, /<FolderShapeChoices selectedId=\{options\.folderTileShape\}/);
	assert.match(flow, /activeStep === "appearance"[\s\S]*<GuidedPresentationControls/);
	assert.match(sharedPresentation, /Collection settings stay unchanged\./);
	assert.doesNotMatch(flow, /focusGlowEnabled/);
});

test("TMDB List Source Edit preserves imports, offers edit-only sorting and uses the injected List preview provider", () => {
	assert.match(sourceEditors, /tmdbListSourceEditor/);
	assert.match(editorDialog, /TMDB_LIST_SOURCE_EDITOR_ID/);
	assert.match(editorDialog, /<TmdbListEditorFields/);
	assert.match(editorDialog, /This imported list uses/);
	assert.doesNotMatch(flow, /TMDB_LIST_EDIT_SORT_OPTIONS|tmdb-list-edit-sort/);
	assert.match(editorDialog, />Preview titles<\/button>/);
	assert.match(editorDialog, /list: listProvider/);
	assert.match(editorDialog, /<TmdbEntityLink entityType="list"[\s\S]*linkText=\{String\(draft\.tmdbId\)\}/);
	assert.match(editorDialog, /TMDB · LIST ·/);
	assert.match(workspace, /listProvider=\{listProviderRef\.current\}/);
});

test("TMDB Lists keeps one scroll owner, a fixed action footer, mobile-safe cards, and the established 620/900 shell boundaries", () => {
	assert.equal((flow.match(/className="add-source-scroll"/g) ?? []).length, 1);
	assert.match(flow, /<footer className="add-source-actions tmdb-list-actions">/);
	assert.match(styles, /\.tmdb-list-input-field textarea[\s\S]*min-height:\s*132px/);
	assert.match(styles, /\.tmdb-list-input-actions\s*\{[\s\S]*flex-wrap:\s*wrap/);
	assert.match(styles, /\.tmdb-list-input-error,[\s\S]*overflow-wrap:\s*anywhere/);
	assert.match(styles, /@media \(min-width: 900px\)[\s\S]*\.tmdb-list-actions\s*\{[\s\S]*minmax\(180px, 320px\) minmax\(0, 1fr\)/);
	assert.match(styles, /@media \(max-width: 620px\)[\s\S]*\.tmdb-list-selected-items li[\s\S]*flex-direction:\s*column/);
	assert.match(styles, /@media \(min-width: 900px\)/);
	assert.doesNotMatch(styles.match(/\.tmdb-list-selected-items li,[\s\S]*?\}/)?.[0] ?? "", /border-left/);
});


test("TMDB hierarchy has Names then appearance-only controls, zero-output safe navigation and compact disclosures", () => {
 assert.match(flow, /Continue to Names/);
 assert.match(flow, /activeStep === "names"[\s\S]*setStep\("appearance"\)/);
 assert.match(flow, /invalidNameFocusRef\.current[\s\S]*setStep\("names"\)/);
 assert.match(flow, /phase="Appearance" title="Appearance"/);
 assert.match(flow, /className="tmdb-list-omitted people-zero-warning"/);
 assert.match(flow, /className="tmdb-list-locations"/);
 assert.match(flow, /activeStep === "empty" \? <button[\s\S]*Back to selection/);
 assert.doesNotMatch(flow, /tmdb-list-source-title-/);
});


test("TMDB Lists keeps Back separate from submit and explains hierarchy-only artwork", () => {
 assert.match(flow, /key="back-to-selection" className="editor-cancel" type="button"/);
 assert.match(flow, /key="forward" className="editor-apply" type="submit"/);
 const presentation = sharedPresentation;
 assert.match(presentation, /Folder artwork/);
 assert.match(presentation, /No artwork is assigned by this flow\. After creating, use Edit on each folder to add or change its artwork\./);
 assert.equal((sharedPresentation.match(/tmdb-list-artwork-note-title">Folder artwork/g) ?? []).length, 1);
 assert.match(styles, /\.tmdb-list-form\[data-tmdb-list-stage="names"\] \.tmdb-list-locations summary \{ padding-block: 8px;/);
});


test("hierarchy selection reset is distinct from Clear input and remains outside Add Source", () => {
 const clearInput = flow.slice(flow.indexOf("function clearInput()"), flow.indexOf("function clearSelectedLists()"));
 const clearSelection = flow.slice(flow.indexOf("function clearSelectedLists()"), flow.indexOf("function openPreview("));
 assert.doesNotMatch(clearInput, /setLists|naming\.resetAll/);
 assert.doesNotMatch(clearSelection, /setInput|provider\.getList|onApply|resolveLists\(/);
 assert.match(clearSelection, /naming\.resetAll\(\{ includeUnselected: true \}\)/);
 assert.match(flow, /onClear=\{standalone \? undefined : clearSelectedLists\}/);
 assert.match(flow, /key="clear-selected-lists" className="editor-cancel tmdb-list-selection-reset" type="button"/);
 assert.match(styles, /\.tmdb-list-selection-reset \{[\s\S]*min-height: 44px/);
 // Existing Source names consumers keep their current-rows-only Reset all behavior.
 assert.match(read("builder/src/ui/use-source-names.js"), /includeUnselected = false/);
});
