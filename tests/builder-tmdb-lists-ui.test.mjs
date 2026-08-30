import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const flow = read("builder/src/ui/TmdbListSourceFlow.jsx");
const workspace = read("builder/src/ui/BuilderWorkspace.jsx");
const creation = read("builder/src/ui/CreationDialog.jsx");
const sourceModes = read("builder/src/source-add/source-modes.js");
const sourceEditors = read("builder/src/source-edit/source-editors.js");
const editorDialog = read("builder/src/ui/SourceEditorDialog.jsx");
const previewDialog = read("builder/src/ui/SourceTitlePreviewDialog.jsx");
const nestedPreviewDialog = read("builder/src/ui/NestedPreviewDialog.jsx");
const posterGrid = read("builder/src/ui/PosterOnlyPreviewGrid.jsx");
const styles = read("builder/src/styles.css");

test("TMDB Lists is available from Add Source, New Collection, and New Folder through registered flows", () => {
	assert.match(sourceModes, /label: "TMDB lists"[\s\S]*description: "Add one or more public TMDB lists\."/);
	assert.match(workspace, /visibleAddSourceSession\.modeId === TMDB_LIST_SOURCE_MODE_ID[\s\S]*<TmdbListSourceFlow/);
	assert.match(creation, /CREATION_OPTION_IDS\.TMDB_LISTS[\s\S]*<TmdbListSourceFlow context="hierarchy"/);
	assert.match(flow, /title=\{standalone \? "Add TMDB lists" : "Create with TMDB Lists"\}/);
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
	assert.match(flow, /requestSourceTitlePreview\(candidate\.request, \{ list: provider \}/);
	assert.match(flow, /<SourceTitlePreviewDialog/);
	assert.match(previewDialog, /const listPreview = preview\.candidate\.request\.kind === "list"/);
	assert.match(previewDialog, /listSourceTitlePreviewSummary\(preview\.data\)/);
	assert.match(previewDialog, /displayAll=\{listPreview\}/);
	assert.match(previewDialog, /This list is currently empty\./);
	assert.match(posterGrid, /displayAll \? candidates : candidates\.slice\(0, limit\)/);
	assert.doesNotMatch(posterGrid, /onScroll=|onWheel=|onTouchEnd=|revealState|revealMore/);
	assert.doesNotMatch(previewDialog, /page\s*2|Load more|fetch\(/i);
	assert.doesNotMatch(flow, /\bfetch\(|XMLHttpRequest|createTmdbListProvider/);
});

test("only TMDB Lists displays the complete loaded page-one sample while shared families retain the ten-poster cap", () => {
	assert.match(previewDialog, /displayAll=\{listPreview\}/);
	assert.match(posterGrid, /data-preview-complete-sample=\{displayAll \? "true" : undefined\}/);
	assert.match(posterGrid, /displayAll \? candidates : candidates\.slice\(0, limit\)/);
	assert.match(styles, /\.source-title-preview-summary\s*\{[\s\S]*color:\s*var\(--muted\)/);
	assert.match(previewDialog, /tmdb-list-preview-modal/);
	assert.match(styles, /\.tmdb-list-preview-modal\s*\{[\s\S]*height:\s*min\(calc\(60cqi \+ 100px\), 556px, calc\(100dvh - 32px\), 100%\)[\s\S]*grid-template-rows:\s*auto auto minmax\(0, 1fr\)/);
	assert.match(styles, /\.tmdb-list-preview-grid\s*\{[\s\S]*height:\s*100%/);
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

test("Review exposes independent source names, neutral duplicate status, Original order, and no content Preview control", () => {
	assert.match(flow, /Source name/);
	assert.match(flow, /This is the name shown in Nuvio\. You can customise it\./);
	assert.match(flow, /Already in this collection · omitted/);
	assert.match(flow, /Exists elsewhere · ready to create/);
	assert.match(flow, /<SourceElsewhereNotice/);
	assert.match(flow, /Add all anyway/);
	assert.match(flow, /Nothing to add/);
	assert.match(flow, /· Original order/);
	assert.doesNotMatch(flow, /· List order/);
	assert.match(flow, />Preview<\/button>/);
	assert.doesNotMatch(flow, />Preview titles<\/button>/);
	assert.doesNotMatch(flow, /coverImageUrl|heroBackdropUrl|Sort choices|Media type/);
});

test("guided Lists starts with empty names, uses concise shared create copy, and validates required containers in the footer", () => {
	assert.match(flow, /useState\(""\)[\s\S]*useState\(""\)/);
	assert.doesNotMatch(flow, /useState\("TMDB Lists"\)|useState\("Lists"\)|useState\("My Lists"\)/);
	assert.match(flow, /scope === "new-collection" \? "Create collection" : "Create folder"/);
	assert.doesNotMatch(flow, /Create collection with 1 folder|Create 1 folder with/);
	assert.match(flow, /Collection and folder names are required\./);
	assert.match(flow, /Collection name is required\./);
	assert.match(flow, /Folder name is required\./);
	assert.match(flow, /aria-invalid=\{requiredNameErrors\.collection/);
	assert.match(flow, /aria-invalid=\{requiredNameErrors\.folder/);
	assert.match(flow, /target\?\.scrollIntoView\?\.\(\{ block: "nearest" \}\)[\s\S]*focusElementWithoutScroll\(target\)/);
	assert.match(flow, /className="tmdb-list-footer-validation" role="alert"/);
});

test("guided Lists directly reuses standard Collection and Folder presentation controls while Add Source remains container-free", () => {
	assert.match(flow, /import \{ HierarchyCollectionPresentationControls \} from "\.\/CollectionPresentationChoices\.jsx"/);
	assert.match(flow, /import \{ FolderShapeChoices, PresentationSwitch, TitleOptions \} from "\.\/PresentationControls\.jsx"/);
	assert.match(flow, /<TitleOptions[\s\S]*collectionTitleVisibility=\{scope === "new-collection"[\s\S]*folderTitleVisibility=/);
	assert.match(flow, /<HierarchyCollectionPresentationControls[\s\S]*showAllTab=\{options\.showAllTab\}/);
	assert.match(flow, /<PresentationSwitch label="Pin collection to top"/);
	assert.match(flow, /<FolderShapeChoices selectedId=\{options\.folderTileShape\}/);
	assert.match(flow, /\{!standalone \? <GuidedPresentationControls/);
	assert.doesNotMatch(flow, /focusGlowEnabled/);
});

test("TMDB List Source Edit is fail-closed, title-only, and uses the injected List preview provider", () => {
	assert.match(sourceEditors, /tmdbListSourceEditor/);
	assert.match(editorDialog, /TMDB_LIST_SOURCE_EDITOR_ID/);
	assert.match(editorDialog, /titles use Original order/);
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
