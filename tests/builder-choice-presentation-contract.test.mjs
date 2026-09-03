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
		"builder/src/ui/PresentationControls.jsx": 3,
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
	assert.match(exclusions, /data-selected=\{selected \? "true" : undefined\} aria-pressed=\{selected\}/);
	assert.match(genres, /data-genre-name=\{concept\.name\}[^>]*aria-pressed=\{selected\}/);
	assert.match(streaming, /data-streaming-region=\{region\.code\}[^>]*aria-pressed=\{selected\}/);
	for (const source of [decades, exclusions, genres, streaming]) assert.doesNotMatch(source, /✓|\{selected \? "✓" : "\+"\}/);
});

test("independent Decade booleans remain conventional visible checkboxes", () => {
	const source = read("builder/src/ui/CreationDialog.jsx");
	const contentChoices = source.slice(source.indexOf("function ContentChoices"), source.indexOf("function StructurePreview"));
	assert.equal((contentChoices.match(/type="checkbox"/g) ?? []).length, 1);
	assert.doesNotMatch(contentChoices, /choice-card-input|visually-hidden|data-selected/);
	const styles = read("builder/src/styles.css");
	assert.match(styles, /\.decades-content-grid input\s*\{[\s\S]*accent-color: var\(--cyan-bright\)/);
	assert.doesNotMatch(styles, /\.decades-content-grid label\[data-selected="true"\]/);
});

test("selected choices use structural card treatment without selection rails or green alternatives", () => {
	const styles = read("builder/src/styles.css");
	assert.match(styles, /\.people-result-selectable\.is-selected\s*\{[\s\S]*?background: rgb\(1 180 228 \/ 12%\);[\s\S]*?border-color: rgb\(98 225 255 \/ 56%\);[\s\S]*?box-shadow: inset 0 0 0 1px rgb\(233 247 255 \/ 12%\)/);
	assert.match(styles, /\.editor-shape-choice\.is-selected > \.shape-preview/);
	assert.match(styles, /box-shadow: inset 0 0 0 1px rgb\(233 247 255 \/ 12%\)/);
	assert.doesNotMatch(styles, /inset \d+px 0 0/);
	assert.doesNotMatch(styles, /\.hierarchy-card-main(?::before|\.is-selected::before)/);
	assert.doesNotMatch(styles, /(?:data-selected|aria-selected|aria-pressed|is-selected|:has\([^)]*checked\))[^}]{0,260}(?:var\(--green\)|99 230 190|144 206 125)/s);
	assert.match(styles, /@media \(forced-colors: active\)[\s\S]*border-color: Highlight[\s\S]*outline-color: Highlight/);

	// Leading rails remain valid for semantic notices, not selectable state.
	assert.match(styles, /\.studio-duplicate-note\s*\{[\s\S]*border-left: 2px solid/);
	assert.match(styles, /\.studio-elsewhere-note\s*\{[\s\S]*border-left: 2px solid/);
});
