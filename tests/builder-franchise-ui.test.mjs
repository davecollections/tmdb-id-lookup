import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(rootDir, relativePath), "utf8");
const flow = read("builder/src/ui/FranchiseSourceFlow.jsx");
const dialog = read("builder/src/ui/CreationDialog.jsx");
const workspace = read("builder/src/ui/BuilderWorkspace.jsx");
const presentationControls = read("builder/src/ui/CollectionPresentationChoices.jsx");
const sharedPresentationControls = read("builder/src/ui/PresentationControls.jsx");
const styles = read("builder/src/styles.css");
const nestedDialog = read("builder/src/ui/NestedPreviewDialog.jsx");
const posterGrid = read("builder/src/ui/PosterOnlyPreviewGrid.jsx");

test("Franchises is a guided New Collection and New Folder option with a two-stage flow", () => {
	assert.match(dialog, /CREATION_OPTION_IDS\.FRANCHISES/);
	assert.match(dialog, /<FranchiseSourceFlow/);
	assert.match(flow, /useState\("select"\)/);
	assert.match(flow, /setStep\("review"\)/);
	assert.match(flow, /Review &amp; Appearance/);
	assert.doesNotMatch(flow, /setStep\("configure"\)|data-franchise-stage="configure"/i);
});

test("franchise search intentionally avoids auto-focus and reuses the collection provider", () => {
	assert.match(flow, /id="franchise-source-query"/);
	assert.doesNotMatch(flow, /autoFocus|\.focus\(\)/);
	assert.match(flow, /provider\.searchCollections/);
	assert.match(flow, /provider\.getCollection/);
	assert.doesNotMatch(flow, /fetch\(|XMLHttpRequest|createTmdbCollectionProvider/);
	assert.match(workspace, /collectionProvider=\{sourceProviderRef\.current\}/);
});

test("selectable franchise results use hidden native checkboxes and full-card selected styling", () => {
	assert.match(flow, /<label className=\{`add-source-result franchise-result-selectable/);
	assert.match(flow, /className="visually-hidden choice-card-input" type="checkbox"/);
	assert.doesNotMatch(flow, /selectable-card-indicator|✓/);
	assert.match(styles, /label:has\(> \.choice-card-input:focus-visible\)/);
	assert.match(styles, /\.franchise-result-selectable\.is-selected\s*\{[\s\S]*box-shadow:\s*inset 0 0 0 1px/);
	assert.doesNotMatch(styles.match(/\.franchise-result-selectable[\s\S]*?\}/)?.[0] ?? "", /border-left/);
});

test("bulk selection is compact, removable, ordered by state, and has no artificial cap", () => {
	assert.match(flow, /franchiseSelectionNotice/);
	assert.match(flow, /View selected franchises/);
	assert.match(flow, /removeSelectedFranchise/);
	assert.match(flow, /there is no selection cap/);
	assert.doesNotMatch(flow, /MAX_(?:FRANCHISE|SELECTION)|slice\(0,\s*(?:50|100)\).*selected/i);
	assert.match(flow, /className="franchise-selected-preview"/);
	assert.match(flow, /aria-label=\{`Preview titles for \$\{franchise\.name\}`\}/);
	assert.match(flow, /className="franchise-selected-remove"/);
	assert.match(styles, /\.franchise-selected-disclosure li strong\s*\{[\s\S]*overflow-wrap:\s*anywhere/);
});

test("review exposes shared title and layout controls with fixed Poster artwork and read-only parent inheritance", () => {
	const artworkGuidance = flow.match(/data-franchise-artwork-rule="poster-only">([^<]+)<\/p>/)?.[1] ?? "";
	assert.match(flow, /<TitleOptions/);
	assert.match(sharedPresentationControls, /FOLDER_TITLE_VISIBILITY_LABEL = "Folder title visibility"/);
	assert.match(sharedPresentationControls, /folderTitleVisibility\.legend \?\? FOLDER_TITLE_VISIBILITY_LABEL/);
	assert.doesNotMatch(flow, /\blegend\s*:/);
	assert.doesNotMatch(flow, /Franchise folder titles/);
	assert.match(flow, /<HierarchyCollectionPresentationControls/);
	assert.doesNotMatch(flow, /<FolderShapeChoices|Folder artwork shape|franchise-folder-shape/);
	assert.match(flow, /<PresentationSwitch/);
	assert.match(flow, /Parent presentation is inherited/);
	assert.match(flow, /data-franchise-artwork-rule="poster-only"/);
	assert.equal(artworkGuidance, "Franchise folders use the TMDB collection poster by default. You can change the artwork later in Edit Folder.");
	assert.doesNotMatch(artworkGuidance, /\bPOSTER\b/);
	assert.doesNotMatch(artworkGuidance, /tileShape|coverImageUrl|emoji|w\d+|fallback|mechanic/i);
	assert.doesNotMatch(flow, /other orientation|landscape\/backdrop|backdrop.*alternate/i);
});

test("shared hierarchy Layout keeps Show All separate with deliberate spacing", () => {
	const sharedControls = presentationControls.slice(presentationControls.indexOf("export function HierarchyCollectionPresentationControls"));
	const choicesIndex = sharedControls.indexOf("<CollectionPresentationChoices");
	const showAllIndex = sharedControls.indexOf('className="editor-switch-field hierarchy-show-all-control"');
	assert.ok(choicesIndex >= 0 && showAllIndex > choicesIndex);
	assert.match(sharedControls, /<div className="hierarchy-collection-presentation-controls"/);
	assert.doesNotMatch(sharedControls.slice(choicesIndex, showAllIndex), /<label[\s\S]*hierarchy-show-all-control/);
	assert.match(styles, /\.hierarchy-collection-presentation-controls\s*\{[\s\S]*display:\s*grid;[\s\S]*gap:\s*14px;/);
	assert.match(flow, /<HierarchyCollectionPresentationControls/);
	assert.match(dialog, /<HierarchyCollectionPresentationControls/);
});

test("every collapsed Review row keeps Preview titles visible while placement details expand independently", () => {
	const reviewRows = flow.slice(flow.indexOf('<div className="franchise-review-list"'), flow.indexOf("</section>", flow.indexOf('<div className="franchise-review-list"')));
	const summaryEnd = reviewRows.indexOf("</summary>");
	const previewIndex = reviewRows.indexOf(">Preview titles</button>");
	const detailIndex = reviewRows.indexOf('className="franchise-review-details"');
	assert.ok(previewIndex > 0 && previewIndex < summaryEnd, "Preview titles should be inside the always-visible summary row.");
	assert.ok(detailIndex > summaryEnd, "Contextual details should remain outside the collapsed summary.");
	assert.match(reviewRows, /className="franchise-review-row-primary"/);
	assert.match(reviewRows, /className="franchise-review-row-actions"/);
	assert.match(reviewRows, /className="franchise-selected-preview"/);
	assert.match(reviewRows, /event\.preventDefault\(\); event\.stopPropagation\(\); onPreview/);
	assert.match(reviewRows, /franchise-review-details[\s\S]*<SourceElsewhereNotice/);
	assert.match(styles, /\.franchise-review-row-primary strong\s*\{[\s\S]*overflow-wrap:\s*anywhere/);
	assert.match(styles, /@media \(max-width: 620px\)[\s\S]*\.franchise-review-row-actions\s*\{[\s\S]*width:\s*100%[\s\S]*justify-content:\s*space-between/);
});

test("candidate rows stay neutral and communicate exact destination and elsewhere placement with text", () => {
	assert.match(flow, /Already in this collection · omitted/);
	assert.match(flow, /Exists elsewhere · ready to create/);
	assert.match(flow, /<SourceElsewhereNotice/);
	assert.doesNotMatch(flow, /add-source-duplicate-warning|semantic-notice.*candidate/i);
});

test("title preview is a bounded poster-only body portal with explicit Close and no source mutation controls", () => {
	const preview = flow.slice(flow.indexOf("function TitlesPreview"), flow.indexOf("function statusLabel"));
	assert.match(flow, /<NestedPreviewDialog/);
	assert.match(nestedDialog, /createPortal\(content, document\.body\)/);
	assert.match(flow, /data-franchise-preview-backdrop/);
	assert.match(nestedDialog, /role="dialog"/);
	assert.match(nestedDialog, /aria-modal="true"/);
	assert.match(nestedDialog, /nested-modal-backdrop/);
	assert.match(nestedDialog, /handleDialogKeyDown/);
	assert.match(preview, /<PosterOnlyPreviewGrid items=\{titles\} limit=\{10\}/);
	assert.doesNotMatch(preview, /movie\.title|movie\.releaseYear|No poster|preview does not change/i);
	assert.match(posterGrid, /slice\(0, limit\)/);
	assert.match(posterGrid, /No posters available\./);
	assert.match(flow, />Close<\/button>/);
	assert.match(styles, /\.franchise-preview-modal[\s\S]*max-height:/);
	assert.doesNotMatch(styles, /\.franchise-preview-grid img:nth-child\(n \+ 6\)/);
	assert.match(styles, /\.franchise-preview-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(5[\s\S]*overflow-x:\s*hidden/);
	assert.match(styles, /--layer-add-source:\s*3000/);
	assert.match(styles, /--layer-nested-modal:\s*4000/);
	assert.match(styles, /\.nested-modal-backdrop\s*\{[\s\S]*z-index:\s*var\(--layer-nested-modal\)/);
	assert.doesNotMatch(styles, /\.franchise-preview-backdrop\s*\{[\s\S]*?z-index:/);
	assert.doesNotMatch(flow, /onApply.*TitlesPreview|createSource.*TitlesPreview/);
});

test("franchise creation keeps one intentional scroll owner and sticky action footer", () => {
	assert.equal((flow.match(/className="add-source-scroll"/g) ?? []).length, 1);
	assert.match(flow, /<footer className="add-source-actions">/);
	assert.match(flow, /Review \$\{chosen\.length\} franchise/);
	assert.match(flow, /Create \$\{planResult\.ok \? planResult\.plan\.counts\.folderCount/);
});

test("responsive styling covers narrow result cards and the shared contained tablet shell boundary", () => {
	assert.match(styles, /@media \(max-width: 620px\)[\s\S]*\.franchise-result-selectable/);
	assert.match(styles, /@media \(max-width: 620px\)[\s\S]*\.franchise-preview-grid/);
	assert.match(styles, /@media \(min-width: 900px\), \(min-width: 621px\) and \(min-height: 601px\)[\s\S]*\.add-source-dialog/);
});

test("Add Source movie franchise remains a separate route and shares the same workspace provider", () => {
	assert.match(workspace, /<AddSourceDialog[\s\S]*provider=\{sourceProviderRef\.current\}/);
	assert.match(workspace, /MOVIE_FRANCHISE_SOURCE_MODE_ID/);
	assert.match(dialog, /collectionProvider=\{collectionProvider\}|provider=\{collectionProvider\}/);
});
