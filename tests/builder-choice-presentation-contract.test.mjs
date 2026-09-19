import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { CREATION_OPTION_IDS, CREATION_OPTIONS } from "../builder/src/ui/creation-options.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
	return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function inputCount(source, type) {
	return (source.match(new RegExp(`<input[^>]*class(?:Name)?="visually-hidden choice-card-input"[^>]*type="${type}"`, "g")) ?? []).length;
}

// This is deliberately a test-owned presentation contract. Adding a guided family requires choosing
// its interaction category here instead of inheriting a decorative marker from another flow.
const FAMILY_CHOICE_EVIDENCE = Object.freeze({
	[CREATION_OPTION_IDS.DECADES]: Object.freeze({ file: "builder/src/ui/CreationDialog.jsx", token: "data-decade-preset" }),
	[CREATION_OPTION_IDS.PEOPLE]: Object.freeze({ file: "builder/src/ui/PeopleSourceFlow.jsx", token: "people-result-selectable" }),
	[CREATION_OPTION_IDS.FRANCHISES]: Object.freeze({ file: "builder/src/ui/FranchiseSourceFlow.jsx", token: "franchise-result-selectable" }),
	[CREATION_OPTION_IDS.TMDB_LISTS]: Object.freeze({ file: "builder/src/ui/TmdbListSourceFlow.jsx", token: "parseTmdbListBatch" }),
	[CREATION_OPTION_IDS.STUDIOS]: Object.freeze({ file: "builder/src/ui/StudioHierarchyFlow.jsx", token: "studio-result-selectable" }),
	[CREATION_OPTION_IDS.NETWORKS]: Object.freeze({ file: "builder/src/ui/NetworkHierarchyFlow.jsx", token: "network-result-selectable" }),
	[CREATION_OPTION_IDS.GENRES]: Object.freeze({ file: "builder/src/ui/GenreCatalogueSelector.jsx", token: "genre-catalogue-choice" }),
	[CREATION_OPTION_IDS.STREAMING_SERVICES]: Object.freeze({ file: "builder/src/ui/StreamingHierarchyFlow.jsx", token: "streaming-provider-selectable" }),
	[CREATION_OPTION_IDS.ADVANCED_DISCOVER]: Object.freeze({ file: "builder/src/ui/AdvancedDiscoverFlow.jsx", token: "SemanticSortChoices" }),
});

test("every guided family has explicit choice-presentation evidence", () => {
	const guidedIds = CREATION_OPTIONS.filter((option) => option.id !== CREATION_OPTION_IDS.BLANK).map((option) => option.id);
	assert.deepEqual(Object.keys(FAMILY_CHOICE_EVIDENCE), guidedIds);
	for (const [familyId, evidence] of Object.entries(FAMILY_CHOICE_EVIDENCE)) {
		assert.ok(read(evidence.file).includes(evidence.token), `${familyId} lost ${evidence.token}`);
	}
});

test("launchers remain immediate actions rather than selected choices", () => {
	const source = read("builder/src/ui/LauncherOptionCard.jsx");
	assert.match(source, /<button[\s\S]*type="button"[\s\S]*onClick=\{\(\) => onSelect\(optionId\)\}/);
	assert.doesNotMatch(source, /type="(?:radio|checkbox)"|aria-(?:pressed|selected)|choice-card-input/);
});

test("single-choice cards retain hidden native radios and card-level focus", () => {
	const expectedInputs = Object.freeze({
		"builder/src/ui/ChoiceCards.jsx": 1,
		"builder/src/ui/CollectionPresentationChoices.jsx": 2,
		"builder/src/ui/PresentationControls.jsx": 2,
		"builder/src/ui/PeopleSourceFlow.jsx": 1,
		"builder/src/ui/SourceEditorDialog.jsx": 1,
		"builder/src/ui/GenreSourceFlow.jsx": 1,
		"builder/src/ui/StreamingSourceFlow.jsx": 1,
		"builder/src/ui/StreamingHierarchyFlow.jsx": 2,
	});
	for (const [file, minimum] of Object.entries(expectedInputs)) {
		assert.ok(inputCount(read(file), "radio") >= minimum, `${file} needs ${minimum} hidden native radio control(s)`);
	}
	const styles = read("builder/src/styles.css");
	assert.match(styles, /label:has\(> \.choice-card-input:focus-visible\)\s*\{[\s\S]*outline: 3px solid var\(--cyan-bright\)/);
	assert.match(styles, /label:has\(> \.choice-card-input\)\s*\{[\s\S]*position: relative/);
});

test("multi-select entity cards retain hidden native checkboxes without decorative indicators", () => {
	const expectedInputs = Object.freeze({
		"builder/src/ui/FranchiseSourceFlow.jsx": 1,
		"builder/src/ui/NetworkHierarchyFlow.jsx": 1,
		"builder/src/ui/StudioHierarchyFlow.jsx": 1,
		"builder/src/ui/StreamingHierarchyFlow.jsx": 1,
		"builder/src/ui/PeopleSourceFlow.jsx": 3,
		"builder/src/ui/StudioSourceFlow.jsx": 1,
		"builder/src/ui/GenreCatalogueSelector.jsx": 1,
	});
	for (const [file, minimum] of Object.entries(expectedInputs)) {
		assert.ok(inputCount(read(file), "checkbox") >= minimum, `${file} needs ${minimum} hidden native checkbox control(s)`);
	}

	const uiSource = fs.readdirSync(path.join(rootDir, "builder/src/ui"), { withFileTypes: true })
		.filter((entry) => entry.isFile() && /\.(?:js|jsx)$/.test(entry.name))
		.map((entry) => read(path.join("builder/src/ui", entry.name)))
		.join("\n");
	for (const obsoleteToken of [
		"selectable-card-indicator",
		"selectable-card-checkbox",
		"data-selection-indicator",
		"editor-choice-check",
		"people-source-pill-check",
		"streaming-region-selected-mark",
	]) {
		assert.ok(!uiSource.includes(obsoleteToken), `obsolete marker token remains: ${obsoleteToken}`);
	}
});

test("compact retained choices use state styling and complete pressed semantics without marker glyphs", () => {
	const decades = read("builder/src/ui/CreationDialog.jsx");
	const exclusions = read("builder/src/ui/GenreAdvancedOptions.jsx");
	const genres = read("builder/src/ui/GenreCatalogueSelector.jsx");
	const streaming = read("builder/src/ui/StreamingSourceFlow.jsx");
	assert.match(decades, /data-decade-preset=\{preset\.id\}[^>]*aria-pressed=\{selected\}/);
	assert.match(exclusions, /<FamilyGenreRulePills semantics="exclude"/);
	assert.match(read("builder/src/ui/GenreRuleControls.jsx"), /aria-pressed=\{included \|\| excluded\} data-chosen=\{included \|\| excluded \|\| undefined\} data-excluded=\{excluded \|\| undefined\}/);
	assert.match(genres, /data-genre-name=\{concept\.name\}[^>]*aria-pressed=\{selected\}/);
	assert.match(streaming, /data-streaming-region=\{region\.code\}[^>]*aria-pressed=\{selected\}/);
	for (const source of [decades, exclusions, genres, streaming]) assert.doesNotMatch(source, /✓|\{selected \? "✓" : "\+"\}/);
});

test("Decade content uses independent pressed cards with the final-selection guard", () => {
	const source = read("builder/src/ui/CreationDialog.jsx");
	const contentChoices = source.slice(source.indexOf("function ContentChoices"), source.indexOf("function StructurePreview"));
	assert.match(contentChoices, /<button[^>]*type="button"[^>]*aria-pressed=\{selected\}[^>]*disabled=\{selected && selectedCount === 1\}/);
	assert.doesNotMatch(contentChoices, /type="checkbox"|choice-card-input|visually-hidden|selection-indicator|✓/);
	const styles = read("builder/src/styles.css");
	assert.match(contentChoices, /data-selection-mode="multiple"/);
	assert.match(styles, /\.decades-content-grid button\[data-selected="true"\][^{]*\{[^}]*background: var\(--choice-selected-background[^}]*box-shadow: inset/);
});

test("all nine guided families use explicit shared stage intros without imposing one workflow", () => {
	const stages = {
		CreationDialog: [[1, "Select", "Choose decades"], [2, "Configure", "Configure Decades"], [3, "Review", "Review & Appearance"]],
		PeopleSourceFlow: [[1, "Select", "People · TMDB"], [2, "Configure"], [3, "Review", "Review & Appearance"]],
		FranchiseSourceFlow: [[1, "Select", "Movie franchises · TMDB"], [2, "Review", "Review & Appearance"]],
		TmdbListSourceFlow: [[1, "Select", "TMDB lists"], [2, "Review", "Review & Appearance"]],
		StudioHierarchyFlow: [[1, "Select", "Studios · TMDB"], [2, "Configure", "Configure Studios"], [3, "Appearance", "Appearance"]],
		NetworkHierarchyFlow: [[1, "Select", "Networks · TMDB"], [2, "Configure", "Configure Networks"], [3, "Appearance", "Appearance"]],
		GenreHierarchyFlow: [[1, "Select", "Select Genres"], [2, "Configure", "Configure Genres"], [3, "Structure", "Structure"], [4, "Appearance", "Appearance"]],
		StreamingHierarchyFlow: [[1, "Select", "Choose Streaming services"], [2, "Configure", "Configure Streaming services"], [3, "Review"]],
	};
	for (const [file, expected] of Object.entries(stages)) {
		const source = read(`builder/src/ui/${file}.jsx`);
		for (const [step, phase, title] of expected) {
			assert.ok(source.includes(`<CreationStageIntro step={${step}} phase="${phase}"${title ? ` title="${title}"` : ""}`), `${file}: ${step} ${phase} ${title ?? "dynamic title"}`);
		}
	}
	const streaming = read("builder/src/ui/StreamingSourceFlow.jsx");
	assert.match(streaming, /guided \? <CreationStageIntro step=\{1\} phase="Select" title=\{heading\}/);
	const discover = read("builder/src/ui/AdvancedDiscoverFlow.jsx");
	assert.match(discover, /hierarchy \? \["filters", "appearance", "artwork", "review"\] : \["filters", "review"\]/);
	assert.match(discover, /<CreationStageIntro step=\{pages.indexOf\(page\) \+ 1\} phase=\{pageLabels\[page\]\}/);
	const intro = read("builder/src/ui/CreationStageIntro.jsx");
	assert.match(intro, /Step \{step\}\{phase \? ` · \$\{phase\}` : ""\}/);
	assert.match(intro, /<h3 id=\{headingId\} ref=\{headingRef\} tabIndex=\{tabIndex\}/);
	assert.doesNotMatch(intro, /useState|useEffect|controller|onClick|totalSteps|<button|add-source-mode/);
	const styles = read("builder/src/styles.css");
	assert.doesNotMatch(styles.match(/\.creation-stage-intro \{([^}]+)\}/)?.[1] ?? "", /background|border|padding/);
	for (const family of ["Studio", "Network"]) {
		const flow = read(`builder/src/ui/${family}HierarchyFlow.jsx`);
		assert.ok(flow.indexOf('headingRef={selectHeadingRef}') < flow.indexOf('className="people-selected-tray'));
		assert.match(flow, /showIntro=\{false\}/);
	}
	const genres = read("builder/src/ui/GenreHierarchyFlow.jsx");
	const appearance = genres.slice(genres.indexOf('className="genre-hierarchy-appearance"'));
	assert.ok(appearance.indexOf("<CreationStageIntro") < appearance.indexOf("<DiscoverFamilyAdvancedSummary"));
});

test("semantic adapters distinguish retained sets from single choices and independent booleans", () => {
	const sorts = read("builder/src/ui/SemanticSortChoices.jsx");
	assert.match(sorts, /const multiple = Array.isArray\(selectedIds\)/);
	assert.match(sorts, /data-selection-mode=\{multiple \? "multiple" : "single"\}/);
	assert.match(sorts, /type=\{multiple \? "checkbox" : "radio"\}/);
	for (const file of ["PeopleSourceFlow", "FranchiseSourceFlow", "StudioHierarchyFlow", "StudioSourceFlow", "NetworkHierarchyFlow", "StreamingHierarchyFlow", "StreamingSourceFlow", "GenreCatalogueSelector", "CreationDialog", "DecadeSourceFlow", "GenreRuleControls", "AdvancedDiscoverControls"]) {
		assert.match(read(`builder/src/ui/${file}.jsx`), /data-selection-mode="multiple"/, file);
	}
	for (const file of ["ChoiceCards", "CollectionPresentationChoices", "PresentationControls", "SourceEditorDialog", "GenreSourceFlow"]) {
		assert.match(read(`builder/src/ui/${file}.jsx`), /data-selection-mode="single"/, file);
	}
	const presentation = read("builder/src/ui/PresentationControls.jsx");
	const booleans = presentation.slice(0, presentation.indexOf("export function FolderShapeChoices"));
	assert.doesNotMatch(booleans, /data-selection-mode="multiple"/);
	assert.match(booleans, /role="switch"/);
	assert.doesNotMatch(read("builder/src/ui/RemovableSelectionSummary.jsx"), /data-selection-mode|aria-pressed|type="checkbox"/);
	assert.doesNotMatch(read("builder/src/ui/TmdbListSourceFlow.jsx"), /data-selection-mode="multiple"|type="checkbox"/);
});

test("Discover single choices and native shared pickers use the same semantic palette", () => {
	const controls = read("builder/src/ui/AdvancedDiscoverControls.jsx");
	assert.equal((controls.match(/data-selection-mode="single" data-selection-semantics=\{value\} data-mode=\{value\}/g) ?? []).length, 2, "Genre and named pickers expose Include and Exclude semantics");
	assert.match(controls, /role="option" data-selection-mode="multiple"/);
	assert.match(controls, /role="option" data-selection-mode="multiple" data-selection-semantics=\{mode\}/);
	assert.match(read("builder/src/ui/GenreRuleControls.jsx"), /data-selection-mode="multiple" data-selection-semantics=\{excluded \? "exclude" : included \? "include" : undefined\}/);
	const styles = read("builder/src/ui/advanced-discover.css");
	assert.match(controls, /<select data-selection-mode="single" disabled=/);
	assert.match(styles, /select\[data-watch-region\] \{[^}]*--choice-selected-background/);
	assert.doesNotMatch(styles, /input\[name="discover-sort"\]|button\[data-mode="include"\]/);
	assert.doesNotMatch(read("builder/src/ui/native-shared-advanced.css"), /aria-selected="true"/);
});

test("Include and Exclude semantics override cardinality across shared and family consumers", () => {
	const css = read("builder/src/styles.css");
	assert.match(css, /\[data-selection-semantics="include"\]\s*\{[^}]*--choice-selected-background: var\(--selection-include-background\)/);
	assert.match(css, /--selection-include-background: rgb\(69 176 119 \/ 14%\)/);
	assert.ok(css.indexOf('[data-selection-mode="single"] {') < css.indexOf('[data-selection-semantics="include"] {'));
	assert.ok(css.indexOf('[data-selection-semantics="include"] {') < css.indexOf('[data-selection-semantics="exclude"] {'));
	// The semantic selector must beat Advanced's three-part base border shorthand.
	assert.match(css, /\[data-selection-mode\]\[data-selection-semantics="exclude"\]:is\([^\n]+\) \{ border-style: dashed; \}/);
	const controls = read("builder/src/ui/AdvancedDiscoverControls.jsx");
	const operator = controls.slice(controls.indexOf("export function DiscoverOperator"), controls.indexOf("function SelectionChips"));
	assert.match(operator, /data-selection-mode="single"/);
	assert.doesNotMatch(operator, /data-selection-semantics/);
	for (const field of ["withKeywords", "withCompanies", "withNetworks", "withWatchProviders"]) assert.match(controls, new RegExp(`field="${field}"`));
	const rules = read("builder/src/ui/GenreRuleControls.jsx");
	assert.match(rules, /included: semantics === "include"/);
	assert.match(rules, /excluded: semantics === "exclude"/);
	assert.match(read("builder/src/ui/GenreCatalogueSelector.jsx"), /data-selection-semantics=\{semantics\}/);
	for (const file of ["DecadesAdvancedOptions", "GenreAdvancedOptions"]) assert.match(read(`builder/src/ui/${file}.jsx`), /<FamilyGenreRulePills semantics="exclude"/);
	for (const file of ["CreationDialog", "DecadeSourceFlow"]) assert.match(read(`builder/src/ui/${file}.jsx`), /<FamilyGenreRulePills semantics="include"/);
	for (const file of ["GenreHierarchyFlow", "SourceEditorDialog"]) assert.match(read(`builder/src/ui/${file}.jsx`), /GenreAdvancedOptions/);
	assert.match(read("builder/src/ui/NativeExtraAdvancedControls.jsx"), /<DiscoverGenreControls/);
	assert.match(read("builder/src/ui/NativeExtraAdvancedControls.jsx"), /<DiscoverDetailedControls/);
	const chips = read("builder/src/ui/advanced-discover.css");
	assert.match(chips, /\.discover-chips li \{[^}]*--selection-include-background/);
	assert.match(chips, /\.discover-chips li\[data-excluded\] \{[^}]*--selection-exclude-background[^}]*border-style: dashed/);
});

test("selected choices share cardinality palettes and structural treatment without selection rails", () => {
	const styles = read("builder/src/styles.css");
	assert.match(styles, /\[data-selection-mode="multiple"\]\s*\{[^}]*--choice-selected-background: var\(--selection-multiple-background\)/);
	assert.match(styles, /\[data-selection-mode="single"\]\s*\{[^}]*--choice-selected-background: var\(--selection-single-background\)/);
	assert.match(styles, /--selection-multiple-background: rgb\(69 176 119 \/ 14%\)/);
	assert.match(styles, /--selection-single-background: rgb\(1 180 228 \/ 12%\)/);
	assert.match(styles, /\[data-selection-semantics="exclude"\]\s*\{[^}]*--choice-selected-background: var\(--selection-exclude-background\)/);
	assert.match(styles, /--selection-exclude-background: rgb\(221 102 99 \/ 13%\)/);
	assert.match(styles, /\.editor-shape-choice\.is-selected > \.shape-preview/);
	assert.match(styles, /box-shadow: inset 0 0 0 1px rgb\(233 247 255 \/ 12%\)/);
	assert.doesNotMatch(styles, /inset \d+px 0 0/);
	assert.doesNotMatch(styles, /\.hierarchy-card-main(?::before|\.is-selected::before)/);
	assert.doesNotMatch(styles, /--selection-[^;]+var\(--green\)/);
	assert.match(styles, /@media \(forced-colors: active\)[\s\S]*::after\s*\{[^}]*position: absolute; inset: 3px; pointer-events: none;[^}]*border: 1px solid Highlight/);
	assert.match(styles, /outline: 3px solid Highlight; outline-offset: 2px/);

	// Semantic notices share an even full border, with no emphasized edge.
	assert.match(styles, /\.add-source-duplicate-warning,\s*\.native-folder-duplicate-notice,\s*\.studio-duplicate-note,\s*\.genre-attention-note\s*\{[^}]*border: 1px solid rgb\(255 185 107 \/ 32%\)/);
	for (const rule of styles.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
		if (!/notice|note|warning|diagnostic|error|alert/.test(rule[1])) continue;
		assert.doesNotMatch(rule[2], /border-(?:left|inline-start)|inset \d+px 0 0/, rule[1].trim());
	}
	assert.match(styles, /\.studio-elsewhere-note\s*\{[^}]*border: 1px solid rgb\(67 207 238 \/ 24%\)/);
});

test("Discover inherits the Builder creation shell and fields without blanket visual overrides", () => {
 const flow = read("builder/src/ui/AdvancedDiscoverFlow.jsx");
 const controls = read("builder/src/ui/AdvancedDiscoverControls.jsx");
 const styles = read("builder/src/ui/advanced-discover.css");
 assert.match(flow, /<CreationHeader title=\{editing/);
 assert.match(flow, /className="add-source-dialog creation-dialog discover-dialog"/);
 assert.match(flow, /<CreationStageIntro step=\{pages.indexOf\(page\) \+ 1\}/);
 assert.match(flow, /<legend>Collection layout<\/legend>/);
 assert.match(flow, /className="editor-settings-section discover-folder-artwork"/);
 assert.match(controls, /role="group" aria-labelledby=\{uid \+ "-heading"\}/);
 assert.doesNotMatch(styles, /\.discover-dialog\s*(?:h2|h3|button\s*[:,{]|input\s*[:,{]|select\s*[{])/);
 assert.doesNotMatch(styles, /\.discover-step\s*[{]|min-height:\s*44px;\s*width:\s*auto;\s*padding:\s*7px 12px/);
});
