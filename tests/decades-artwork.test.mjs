import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import test from "node:test";
import { createBuilderController } from "../builder/src/application/index.js";
import { DECADE_PRESET_IDS } from "../builder/src/source-add/decades-catalogue.js";
import { buildDecadesSourceDrafts } from "../builder/src/source-add/decades-source.js";
import { createDecadesHierarchyPlan, applyDecadesHierarchyPlan } from "../builder/src/source-add/decades-plan.js";
import { DECADES_ARTWORK_KEYS, resolveDecadesArtwork, resolveDecadesArtworkIdentity } from "../builder/src/source-add/decades-folder-artwork.js";
import { loadFolderArtworkSuggestions, folderArtworkSuggestionForField } from "../builder/src/folder-artwork-suggestions.js";
import { createNodeEditorDraft, updateNodeEditorTileShape, updateNodeEditorField, buildNodeEditorPatch } from "../builder/src/ui/node-editor.js";
import { applyNodeEditorDraft } from "../builder/src/ui/node-editor-actions.js";

const data = JSON.parse(fs.readFileSync(new URL("../builder/src/source-add/decades-artwork-data.json", import.meta.url), "utf8"));
const variants = { movies: "movies", series: "series", mixed: "both" };
const roles = { POSTER: ["poster", "posterFocus"], SQUARE: ["square", "squareFocus"], LANDSCAPE: ["landscape", "focus"] };
const fields = ["coverImageUrl", "focusGifUrl", "heroBackdropUrl", "titleLogoUrl"];
const json = (value) => JSON.parse(JSON.stringify(value));
const richAdvanced = {
	minimumVotes: "0", minimumRating: "0", maximumRating: "8.25", originalLanguage: "en", originCountry: "AU",
	filters: { withKeywords: "15097|9715", withoutKeywords: "210024", withCompanies: "3|174", withoutCompanies: "2", watchRegion: "AU", withWatchProviders: "8", withoutWatchProviders: "9" },
};
function configuration(decadeId, mediaMode, overrides = {}) {
	return {
		selectedDecadeIds: [decadeId], mediaMode, currentYear: 2026,
		...(decadeId === "2020s" ? { currentYearMode: "full-decade" } : {}),
		content: { wholeDecade: true, individualYears: true, genreBreakdown: true },
		genreNames: ["Comedy"], sortOptionIds: ["popular", "recent", "top-rated", "most-votes"],
		advanced: { ...richAdvanced, filters: { ...richAdvanced.filters, ...(mediaMode === "movies" ? {} : { withNetworks: "213" }) } },
		...overrides,
	};
}
function builtSources(decadeId = "1980s", variant = "mixed") {
	const built = buildDecadesSourceDrafts(configuration(decadeId, variants[variant]));
	assert.equal(built.ok, true, JSON.stringify(built.errors));
	return built.drafts.map((draft) => ({ ...draft, nodeType: "source" }));
}

test("static Decades projection is the exact 192-URL approved release projection, without parent covers", () => {
	// SHA-256 of JSON.stringify(projection), independently extracted from the
	// published 26e65a4 release manifest (also compared with live main).
	assert.equal(createHash("sha256").update(JSON.stringify(data)).digest("hex"), "7da80cd23c111b9b8f300c47f2c1b89973ee896cfb51d7d33a6c711f09be99f1");
	assert.deepEqual(Object.keys(DECADES_ARTWORK_KEYS), DECADE_PRESET_IDS);
	assert.deepEqual(Object.keys(data), ["1950s-earlier", "1960s", "1970s", "1980s", "1990s", "2000s", "2010s", "2020s"]);
	const urls = [];
	for (const [key, group] of Object.entries(data)) {
		assert.deepEqual(Object.keys(group), ["movies", "series", "mixed"]);
		for (const [variant, assets] of Object.entries(group)) {
			assert.deepEqual(Object.keys(assets), ["landscape", "focus", "poster", "posterFocus", "square", "squareFocus", "hero", "titleLogo"]);
			for (const url of Object.values(assets)) {
				assert.ok(url.startsWith(`https://raw.githubusercontent.com/davecollections/nuvio-assets/main/assets/collection_covers/decades/${key}/${variant}/`));
				assert.ok(url.endsWith(".webp")); urls.push(url);
			}
		}
	}
	assert.equal(new Set(urls).size, 192);
	assert.equal(DECADES_ARTWORK_KEYS["1950s-and-earlier"], "1950s-earlier");
});

for (const decadeId of DECADE_PRESET_IDS) for (const variant of Object.keys(variants)) {
	const sources = builtSources(decadeId, variant);
	test(`Decades identity: ${decadeId}/${variant} from rich overview, years, Genre and all sorts`, () => {
		assert.deepEqual(resolveDecadesArtworkIdentity(sources), { decadeId, variant });
		assert.deepEqual(resolveDecadesArtworkIdentity([...sources].reverse()), { decadeId, variant });
	});
	for (const [shape, [cover, focus]] of Object.entries(roles)) test(`Decades artwork: ${decadeId}/${variant}/${shape}`, async () => {
		const assets = data[DECADES_ARTWORK_KEYS[decadeId]][variant];
		const expected = { coverImageUrl: assets[cover], focusGifUrl: assets[focus], heroBackdropUrl: assets.hero, titleLogoUrl: assets.titleLogo };
		assert.deepEqual(resolveDecadesArtwork(decadeId, variant, shape), expected);
		const suggestions = await loadFolderArtworkSuggestions({ folder: { nodeType: "folder", sources, editable: { title: "Renamed" } } });
		for (const field of fields) assert.equal(folderArtworkSuggestionForField(suggestions, field, shape), expected[field]);
	});
}

test("resolver fails closed for unsupported identities, media labels and shapes", () => {
	for (const id of ["1950s", "1950s-earlier", "2030s", "Movies", "toString", null]) assert.equal(resolveDecadesArtwork(id, "movies", "POSTER"), null);
	for (const variant of ["tv", "both", "MOVIE", "toString", null]) assert.equal(resolveDecadesArtwork("1980s", variant, "POSTER"), null);
	for (const shape of ["FOLLOW_LAYOUT", "wide", "poster", "FUTURE", null]) assert.equal(resolveDecadesArtwork("1980s", "movies", shape), null);
});

test("creation uses actual media for single-media Genre-only and empty counterpart folders", () => {
	for (const [genreName, mediaType, variant] of [["Kids", "TV", "series"], ["TV Movie", "MOVIE", "movies"]]) {
		for (const layout of ["separate-media-collections", "mixed-collection"]) {
			const app = createBuilderController();
			const result = createDecadesHierarchyPlan(app.getState().project, { scope: "new-collection", projectRevision: 0, layout,
				source: { selectedDecadeIds: ["1980s"], currentYear: 2026, mediaMode: "both", genreNames: [genreName], content: { wholeDecade: false, individualYears: false, genreBreakdown: true } } });
			assert.equal(result.ok, true, JSON.stringify(result.errors));
			for (const collection of result.plan.collections) {
				assert.equal(collection.editable.backdropImageUrl, undefined);
				const folder = collection.folders[0];
				if (folder.sources.length === 0) { for (const field of fields) assert.equal(folder.editable[field], undefined); continue; }
				assert.equal(folder.sources[0].draft.editable.mediaType, mediaType);
				assert.deepEqual(resolveDecadesArtworkIdentity(folder.sources.map((s) => ({ nodeType: "source", ...s.draft }))), { decadeId: "1980s", variant });
				for (const field of fields) assert.equal(folder.editable[field], data["1980s"][variant][{ coverImageUrl: "poster", focusGifUrl: "posterFocus", heroBackdropUrl: "hero", titleLogoUrl: "titleLogo" }[field]]);
			}
			const applied = applyDecadesHierarchyPlan(app, result.plan);
			if (layout === "separate-media-collections") {
				// Existing controller contract rejects empty source bundles atomically.
				// Artwork integration must neither fill nor remove that empty counterpart.
				assert.equal(applied.ok, false);
				assert.equal(applied.errors[0].code, "INVALID_CONTROLLER_ARGUMENT");
				assert.equal(app.getState().revision, 0);
				assert.deepEqual(app.getState().project.collections, []);
			} else assert.equal(applied.ok, true);
		}
	}
});

test("New Collection/New Folder shapes preserve hierarchy, rich sources, defaults and exact export/reopen", async () => {
	for (const scope of ["new-collection", "new-folder"]) for (const mediaMode of ["movies", "series", "both"]) for (const layout of (scope === "new-collection" && mediaMode === "both" ? ["separate-media-collections", "mixed-collection"] : [null])) {
		let sourceBaseline;
		for (const shape of Object.keys(roles)) {
			const app = createBuilderController();
			const parent = app.createCollection({ editable: { title: "Existing", viewMode: "ROWS", backdropImageUrl: "https://custom.example/parent.webp" } }).createdInternalId;
			const parentBefore = json(app.getState().project.collections[0].editable);
			const state = app.getState();
			const result = createDecadesHierarchyPlan(state.project, { scope, projectRevision: state.revision, folderTileShape: shape,
				...(scope === "new-folder" ? { destinationCollectionInternalId: parent } : {}), ...(layout ? { layout } : {}),
				source: configuration("2020s", mediaMode, { selectedDecadeIds: DECADE_PRESET_IDS }) });
			assert.equal(result.ok, true, JSON.stringify(result.errors));
			assert.equal(applyDecadesHierarchyPlan(app, result.plan).ok, true);
			assert.equal(app.getState().revision, state.revision + 1);
			assert.deepEqual(app.getState().project.collections[0].editable, parentBefore);
			const sourceValues = app.serializeProject().value.flatMap((c) => c.folders.map((f) => f.sources));
			sourceBaseline ??= sourceValues; assert.deepEqual(sourceValues, sourceBaseline);
			for (const folder of app.getState().project.collections.flatMap((c) => c.folders)) {
				const identity = resolveDecadesArtworkIdentity(folder.sources);
				assert.ok(identity); assert.equal(folder.editable.focusGifEnabled, false); assert.equal(folder.editable.hideTitle, false);
				for (const field of fields) assert.equal(folder.editable[field], resolveDecadesArtwork(identity.decadeId, identity.variant, shape)[field]);
				app.updateNode(folder.internalId, { title: "A renamed folder" });
			}
			const output = json(app.serializeProject().value), reopened = createBuilderController();
			assert.equal(reopened.importValue(output).ok, true);
			assert.deepEqual(reopened.serializeProject().value, output);
			for (const folder of reopened.getState().project.collections.flatMap((c) => c.folders)) {
				assert.ok(await loadFolderArtworkSuggestions({ folder }));
				assert.equal(folder.decadeId, undefined); assert.deepEqual(buildNodeEditorPatch(createNodeEditorDraft(folder)), {});
			}
		}
	}
});

test("curated cover/focus transition independently; custom/imported fields and focus state survive Apply/reopen", async () => {
	const artwork = resolveDecadesArtwork("1980s", "mixed", "LANDSCAPE");
	const sources = builtSources().map((s) => s.editable);
	for (const focusState of [false, true, null, "preserved"]) for (const custom of [
		{}, { coverImageUrl: "https://custom.example/tile.webp" }, { focusGifUrl: "https://custom.example/focus.webp" },
		{ heroBackdropUrl: "https://custom.example/hero.webp", titleLogoUrl: "https://custom.example/logo.webp" },
		{ coverImageUrl: resolveDecadesArtwork("1990s", "mixed").coverImageUrl, focusGifUrl: resolveDecadesArtwork("1980s", "movies").focusGifUrl },
		{ coverImageUrl: { retained: true }, focusGifUrl: null }, { coverImageUrl: "", focusGifUrl: "" },
	]) {
		const app = createBuilderController();
		const value = [{ id: "c", title: "Parent", folders: [{ id: "f", title: "Renamed", tileShape: "LANDSCAPE", ...artwork, ...custom, focusGifEnabled: focusState, sentinel: { keep: [1, 2] }, sources }] }];
		assert.equal(app.importValue(value).ok, true);
		const folder = app.getState().project.collections[0].folders[0];
		const before = json(app.serializeProject().value), suggestions = await loadFolderArtworkSuggestions({ folder });
		let draft = createNodeEditorDraft(folder);
		for (const shape of ["SQUARE", "POSTER"]) {
			draft = updateNodeEditorTileShape(draft, shape, suggestions);
			for (const field of ["coverImageUrl", "focusGifUrl"]) if (!Object.hasOwn(custom, field)) assert.equal(draft.values[field], resolveDecadesArtwork("1980s", "mixed", shape)[field]);
		}
		assert.deepEqual(app.serializeProject().value, before, "draft and Cancel are mutation-free");
		assert.equal(applyNodeEditorDraft(app, draft).ok, true);
		const output = app.serializeProject().value, saved = output[0].folders[0];
		for (const [field, v] of Object.entries(custom)) assert.deepEqual(saved[field], v);
		assert.equal(saved.focusGifEnabled, focusState); assert.deepEqual(saved.sources, sources); assert.deepEqual(saved.sentinel, { keep: [1, 2] });
		assert.equal(saved.heroBackdropUrl, custom.heroBackdropUrl ?? artwork.heroBackdropUrl); assert.equal(saved.titleLogoUrl, custom.titleLogoUrl ?? artwork.titleLogoUrl);
		const reopened = createBuilderController(); assert.equal(reopened.importValue(output).ok, true); assert.deepEqual(reopened.serializeProject().value, output);
	}
});

test("unknown shapes stay exact until explicit selection; blank Focus assistance never enables Focus", async () => {
	for (const tileShape of ["FOLLOW_LAYOUT", "FUTURE", { retained: true }]) {
		const folder = { nodeType: "folder", internalId: "f", editable: { title: "Renamed", tileShape, focusGifEnabled: false }, sources: builtSources() };
		const suggestions = await loadFolderArtworkSuggestions({ folder });
		const draft = createNodeEditorDraft(folder);
		assert.deepEqual(buildNodeEditorPatch(draft), {});
		assert.deepEqual(buildNodeEditorPatch(updateNodeEditorTileShape(draft, "SQUARE", suggestions)), { tileShape: "SQUARE" });
		const focusGifUrl = folderArtworkSuggestionForField(suggestions, "focusGifUrl", "SQUARE");
		assert.deepEqual(buildNodeEditorPatch(updateNodeEditorField(draft, "focusGifUrl", focusGifUrl)), { focusGifUrl });
	}
});
