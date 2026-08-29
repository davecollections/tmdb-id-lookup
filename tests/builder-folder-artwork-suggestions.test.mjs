import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createBuilderController } from "../builder/src/application/index.js";
import {
	classifyFolderArtworkValue,
	curatedFolderArtworkUrls,
	FOLDER_ARTWORK_AUTHORITIES,
	FOLDER_ARTWORK_CLASSIFICATIONS,
	folderArtworkRequestForField,
	folderArtworkSuggestionForField,
	loadFolderArtworkSuggestions,
	missingCuratedFolderFocusOrientationNotice,
	missingCuratedFolderTileOrientationNotice,
	planCuratedFolderFocusShapeTransition,
	planCuratedFolderTileShapeTransition,
	resolveFolderArtworkIdentity,
} from "../builder/src/folder-artwork-suggestions.js";
import {
	buildGenreSourceDrafts,
	buildMovieFranchiseSourceDraft,
	buildNetworkSourceDraft,
	buildPeopleSourceDrafts,
	buildStudioSourceDrafts,
	genreArtworkUrl,
	normalizePeopleManifest,
} from "../builder/src/source-add/index.js";
import { applyNodeEditorDraft } from "../builder/src/ui/node-editor-actions.js";
import {
	buildNodeEditorPatch,
	createNodeEditorDraft,
	folderSiblingTileShapeNotice,
	updateNodeEditorField,
	updateNodeEditorTileShape,
} from "../builder/src/ui/node-editor.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const peopleManifest = normalizePeopleManifest(JSON.parse(fs.readFileSync(
	path.join(rootDir, "tests/fixtures/people-manifest-v2.json"),
	"utf8",
)));

function sourcesFromDrafts(drafts) {
	return drafts.map((draft, index) => ({
		...draft,
		nodeType: "source",
		internalId: `source-${index + 1}`,
	}));
}

function folder(sources, overrides = {}) {
	return {
		nodeType: "folder",
		internalId: "folder-1",
		editable: { title: "Presentation title only", tileShape: "POSTER", ...overrides },
		sources,
	};
}

function peopleDrafts(id = 31, combinations = ["acting-movies", "acting-series"]) {
	const result = buildPeopleSourceDrafts({ id, name: `Person ${id}` }, { combinations });
	assert.equal(result.ok, true);
	return result.drafts;
}

function studioDrafts(id = 3) {
	const result = buildStudioSourceDrafts({ id, name: "Pixar" }, { choices: ["studio-movies", "studio-series"] });
	assert.equal(result.ok, true);
	return result.drafts;
}

function networkDraft(id = 2) {
	const result = buildNetworkSourceDraft({ id, name: "ABC" });
	assert.equal(result.ok, true);
	return result.draft;
}

function manifestClient() {
	return Object.freeze({
		load: async () => Object.freeze({ ok: true, data: peopleManifest }),
	});
}

function runtimeClient() {
	return Object.freeze({
		resolve: async ({ entityType, tmdbId, orientation }) => ({
			status: "ready",
			entityType,
			tmdbId,
			orientation,
			assetUrl: `https://assets.example.test/${entityType}/${tmdbId}/${orientation}.webp`,
		}),
	});
}

function missingRuntimeClient() {
	return Object.freeze({
		resolve: async ({ entityType, tmdbId, orientation }) => ({
			status: "missing",
			entityType,
			tmdbId,
			orientation,
		}),
	});
}

function catalogueProvider(entity) {
	return Object.freeze({
		loadCatalogue: async () => ({ ok: true, data: { byId: new Map([[entity.id, entity]]) } }),
	});
}

function countingIdFactory(prefix) {
	let count = 0;
	return () => `${prefix}-${++count}`;
}

test("People identity is exact, title-independent, and fails closed for missing or mixed IDs", () => {
	const renamed = folder(sourcesFromDrafts(peopleDrafts()), { title: "Completely renamed" });
	assert.deepEqual(resolveFolderArtworkIdentity(renamed), {
		authority: FOLDER_ARTWORK_AUTHORITIES.PEOPLE,
		tmdbId: 31,
		key: "people:31",
	});
	assert.equal(resolveFolderArtworkIdentity(folder([] , { title: "Tom Hanks" })), null);
	assert.equal(resolveFolderArtworkIdentity(folder(sourcesFromDrafts([
		peopleDrafts(31, ["acting-movies"])[0],
		peopleDrafts(40, ["acting-movies"])[0],
	]))), null);
});

test("Studio and Network identities reuse their canonical source semantics and reject mixed sources", () => {
	assert.deepEqual(resolveFolderArtworkIdentity(folder(sourcesFromDrafts(studioDrafts()))), {
		authority: FOLDER_ARTWORK_AUTHORITIES.STUDIO,
		tmdbId: 3,
		key: "studio:3",
	});
	assert.equal(resolveFolderArtworkIdentity(folder([], { title: "Pixar" })), null);
	assert.equal(resolveFolderArtworkIdentity(folder([
		...sourcesFromDrafts(studioDrafts()),
		{ nodeType: "source", internalId: "opaque", category: "opaque", editable: { title: "Raw" } },
	])), null);
	assert.deepEqual(resolveFolderArtworkIdentity(folder(sourcesFromDrafts([networkDraft()]))), {
		authority: FOLDER_ARTWORK_AUTHORITIES.NETWORK,
		tmdbId: 2,
		key: "network:2",
	});
	assert.equal(resolveFolderArtworkIdentity(folder(sourcesFromDrafts([
		networkDraft(),
		{ category: "native-tmdb", editable: { ...networkDraft().editable, tmdbId: 4 } },
	]))), null);
});

test("Genre identity reuses official concepts and the existing composite placement mapping", () => {
	const comedy = buildGenreSourceDrafts(["Comedy"]).drafts;
	assert.deepEqual(resolveFolderArtworkIdentity(folder(sourcesFromDrafts(comedy))), {
		authority: FOLDER_ARTWORK_AUTHORITIES.GENRE,
		genreName: "Comedy",
		key: "genre:Comedy",
	});

	const actionMovie = buildGenreSourceDrafts(["Action"], { sharedMediaChoice: "movies" }).drafts[0];
	const actionAdventureSeries = buildGenreSourceDrafts(["Action & Adventure"]).drafts[0];
	assert.deepEqual(resolveFolderArtworkIdentity(folder(sourcesFromDrafts([actionMovie, actionAdventureSeries]))), {
		authority: FOLDER_ARTWORK_AUTHORITIES.GENRE,
		genreName: "Action",
		key: "genre:Action",
	});

	assert.equal(resolveFolderArtworkIdentity(folder([{
		nodeType: "source",
		internalId: "fuzzy",
		category: "native-tmdb",
		editable: { title: "Horror", provider: "tmdb", tmdbSourceType: "DISCOVER", tmdbId: null, mediaType: "MOVIE", sortBy: "popularity.desc", filters: { withGenres: "Horror" } },
	}])), null);
});

test("unsupported Franchise, Decade, and Streaming source families produce no identity or suggestion", async () => {
	const franchise = buildMovieFranchiseSourceDraft({ id: 123, name: "Official Collection" }).draft;
	const decade = {
		category: "native-tmdb",
		editable: { title: "1980s", provider: "tmdb", tmdbSourceType: "DISCOVER", tmdbId: null, mediaType: "MOVIE", sortBy: "popularity.desc", filters: { releaseDateGte: "1980-01-01", releaseDateLte: "1989-12-31" } },
	};
	const streaming = {
		category: "native-tmdb",
		editable: { title: "Netflix", provider: "tmdb", tmdbSourceType: "DISCOVER", tmdbId: null, mediaType: "TV", sortBy: "popularity.desc", filters: { watchRegion: "AU", withWatchProviders: "8" } },
	};
	for (const draft of [franchise, decade, streaming]) {
		const candidateFolder = folder(sourcesFromDrafts([draft]));
		assert.equal(resolveFolderArtworkIdentity(candidateFolder), null);
		assert.equal(await loadFolderArtworkSuggestions({ folder: candidateFolder }), null);
	}
});

test("People suggestions are field-specific, orientation-specific, and do not couple Focus enablement", async () => {
	const suggestionSet = await loadFolderArtworkSuggestions({
		folder: folder(sourcesFromDrafts(peopleDrafts())),
		peopleManifestClient: manifestClient(),
	});
	assert.equal(folderArtworkSuggestionForField(suggestionSet, "coverImageUrl", "POSTER"), peopleManifest.byId[31].assets.poster.url);
	assert.equal(folderArtworkSuggestionForField(suggestionSet, "coverImageUrl", "LANDSCAPE"), peopleManifest.byId[31].assets.landscape.url);
	assert.equal(folderArtworkSuggestionForField(suggestionSet, "heroBackdropUrl", "POSTER"), peopleManifest.byId[31].assets.hero.url);
	assert.equal(folderArtworkSuggestionForField(suggestionSet, "titleLogoUrl", "POSTER"), peopleManifest.byId[31].assets.titleLogo.url);
	assert.equal(folderArtworkSuggestionForField(suggestionSet, "focusGifUrl", "POSTER"), peopleManifest.byId[31].assets.focusPoster.url);

	const draft = createNodeEditorDraft(folder(sourcesFromDrafts(peopleDrafts()), { focusGifEnabled: false }));
	const accepted = updateNodeEditorField(draft, "focusGifUrl", folderArtworkSuggestionForField(suggestionSet, "focusGifUrl", "POSTER"));
	assert.deepEqual(buildNodeEditorPatch(accepted), { focusGifUrl: peopleManifest.byId[31].assets.focusPoster.url });
	assert.equal(accepted.values.focusGifEnabled, false);
});

test("People missing supported Focus artwork produces an exact safe request and never uses the Folder title as identity", async () => {
	const suggestionSet = await loadFolderArtworkSuggestions({
		folder: folder(sourcesFromDrafts(peopleDrafts(8559)), { title: "Misleading Folder title" }),
		peopleManifestClient: manifestClient(),
	});
	assert.equal(suggestionSet.canonicalName, "Kátia Lund");
	assert.equal(folderArtworkSuggestionForField(suggestionSet, "focusGifUrl", "POSTER"), null);
	const request = folderArtworkRequestForField(suggestionSet, "focusGifUrl", "POSTER");
	assert.equal(request.repository, "davecollections/nuvio-people-assets");
	assert.equal(request.expectedPath, "assets/people/8559/focus-poster.webp");
	assert.equal(request.title, "Artwork request: Kátia Lund — Focus (Poster)");
	assert.equal(request.body, [
		"Request: Curated Folder artwork",
		"Family: People",
		"Canonical entity: Kátia Lund",
		"TMDB ID: 8559",
		"Artwork field: Focus",
		"Orientation: Poster",
		"Expected repository path: assets/people/8559/focus-poster.webp",
		"Source: Dingo's Collection Builder",
	].join("\n"));
	const url = new URL(request.href);
	assert.equal(url.origin, "https://github.com");
	assert.equal(url.pathname, "/davecollections/nuvio-people-assets/issues/new");
	assert.equal(url.searchParams.get("title"), request.title);
	assert.equal(url.searchParams.get("body"), request.body);
	assert.equal(request.title.includes("Misleading Folder title"), false);
	assert.equal(folderArtworkRequestForField(suggestionSet, "coverImageUrl", "POSTER"), null);
});

test("People requests an unregistered exact person only when canonical TMDB details are available", async () => {
	const emptyManifestClient = Object.freeze({
		load: async () => Object.freeze({ ok: true, data: Object.freeze({ byId: Object.freeze({}) }) }),
	});
	const peopleProvider = Object.freeze({
		getPerson: async (id) => Object.freeze({ ok: true, data: Object.freeze({ id, name: "Exact Person" }) }),
	});
	const candidateFolder = folder(sourcesFromDrafts(peopleDrafts(999_999)), { title: "Not Exact Person" });
	const suggestionSet = await loadFolderArtworkSuggestions({
		folder: candidateFolder,
		peopleManifestClient: emptyManifestClient,
		peopleProvider,
	});
	assert.equal(folderArtworkSuggestionForField(suggestionSet, "coverImageUrl", "LANDSCAPE"), null);
	const request = folderArtworkRequestForField(suggestionSet, "coverImageUrl", "LANDSCAPE");
	assert.equal(request.title, "Artwork request: Exact Person — Landscape Tile");
	assert.equal(request.expectedPath, "assets/people/999999/landscape.webp");

	assert.equal(await loadFolderArtworkSuggestions({
		folder: candidateFolder,
		peopleManifestClient: emptyManifestClient,
		peopleProvider: Object.freeze({ getPerson: async () => Object.freeze({ ok: false }) }),
	}), null);
});

test("People request metadata builds every supported deterministic slot path", async () => {
	const tmdbId = 999_999;
	const suggestionSet = await loadFolderArtworkSuggestions({
		folder: folder(sourcesFromDrafts(peopleDrafts(tmdbId))),
		peopleManifestClient: Object.freeze({
			load: async () => Object.freeze({ ok: true, data: Object.freeze({ byId: Object.freeze({}) }) }),
		}),
		peopleProvider: Object.freeze({
			getPerson: async (id) => Object.freeze({ ok: true, data: Object.freeze({ id, name: "Exact Person" }) }),
		}),
	});
	const cases = [
		["coverImageUrl", "POSTER", "poster.webp"],
		["coverImageUrl", "LANDSCAPE", "landscape.webp"],
		["heroBackdropUrl", "POSTER", "hero.webp"],
		["titleLogoUrl", "POSTER", "title-logo.png"],
		["focusGifUrl", "POSTER", "focus-poster.webp"],
		["focusGifUrl", "LANDSCAPE", "focus-landscape.webp"],
	];

	for (const [field, tileShape, filename] of cases) {
		const request = folderArtworkRequestForField(suggestionSet, field, tileShape);
		const expectedPath = `assets/people/${tmdbId}/${filename}`;
		assert.equal(request.expectedPath, expectedPath);
		assert.match(request.body, new RegExp(`Expected repository path: ${expectedPath.replaceAll(".", "\\.")}`));
		assert.equal(new URL(request.href).searchParams.get("body"), request.body);
	}
});

test("Studio exposes only curated Landscape while Network exposes available Poster and Landscape", async () => {
	const studioSet = await loadFolderArtworkSuggestions({
		folder: folder(sourcesFromDrafts(studioDrafts())),
		artworkRuntimeClient: runtimeClient(),
		studioCatalogueProvider: catalogueProvider({ id: 3, logoPath: "/pixar.png" }),
	});
	assert.equal(folderArtworkSuggestionForField(studioSet, "coverImageUrl", "POSTER"), null);
	assert.equal(folderArtworkSuggestionForField(studioSet, "coverImageUrl", "LANDSCAPE"), "https://assets.example.test/company/3/landscape.webp");

	const networkSet = await loadFolderArtworkSuggestions({
		folder: folder(sourcesFromDrafts([networkDraft()])),
		artworkRuntimeClient: runtimeClient(),
		networkCatalogueProvider: catalogueProvider({ id: 2, logoPath: "/abc.png" }),
	});
	assert.equal(folderArtworkSuggestionForField(networkSet, "coverImageUrl", "POSTER"), "https://assets.example.test/network/2/poster.webp");
	assert.equal(folderArtworkSuggestionForField(networkSet, "coverImageUrl", "LANDSCAPE"), "https://assets.example.test/network/2/landscape.webp");
	assert.deepEqual(networkSet.tmdbFallbackUrls.coverImageUrl, ["https://image.tmdb.org/t/p/w500/abc.png"]);
});

test("missing published Studio and Network assets request only supported orientations in the correct repository", async () => {
	const studioSet = await loadFolderArtworkSuggestions({
		folder: folder(sourcesFromDrafts(studioDrafts())),
		artworkRuntimeClient: missingRuntimeClient(),
		studioCatalogueProvider: catalogueProvider({ id: 3, name: "Pixar", logoPath: "/pixar.png" }),
	});
	assert.equal(folderArtworkRequestForField(studioSet, "coverImageUrl", "POSTER"), null);
	const studioRequest = folderArtworkRequestForField(studioSet, "coverImageUrl", "LANDSCAPE");
	assert.equal(studioRequest.repository, "davecollections/nuvio-assets");
	assert.equal(studioRequest.expectedPath, "assets/collection_covers/companies/3.webp");
	assert.match(studioRequest.body, /Family: Studio\nCanonical entity: Pixar\nTMDB ID: 3/);

	const networkSet = await loadFolderArtworkSuggestions({
		folder: folder(sourcesFromDrafts([networkDraft()])),
		artworkRuntimeClient: missingRuntimeClient(),
		networkCatalogueProvider: catalogueProvider({ id: 2, name: "ABC", logoPath: "/abc.png" }),
	});
	assert.equal(folderArtworkRequestForField(networkSet, "coverImageUrl", "POSTER").expectedPath, "assets/collection_covers/networks/poster/2.webp");
	assert.equal(folderArtworkRequestForField(networkSet, "coverImageUrl", "LANDSCAPE").expectedPath, "assets/collection_covers/networks/2.webp");
});

test("authority failures and unsupported slots never become artwork requests", async () => {
	const unavailableRuntime = Object.freeze({ resolve: async () => { throw new Error("authority unavailable"); } });
	assert.equal(await loadFolderArtworkSuggestions({
		folder: folder(sourcesFromDrafts(studioDrafts())),
		artworkRuntimeClient: unavailableRuntime,
		studioCatalogueProvider: catalogueProvider({ id: 3, name: "Pixar" }),
	}), null);
	assert.equal(await loadFolderArtworkSuggestions({
		folder: folder(sourcesFromDrafts(peopleDrafts())),
		peopleManifestClient: Object.freeze({ load: async () => Object.freeze({ ok: false }) }),
	}), null);
});

test("Genre suggestions use the existing exact static artwork authority", async () => {
	const suggestionSet = await loadFolderArtworkSuggestions({
		folder: folder(sourcesFromDrafts(buildGenreSourceDrafts(["Comedy"]).drafts)),
	});
	assert.equal(folderArtworkSuggestionForField(suggestionSet, "coverImageUrl", "POSTER"), genreArtworkUrl("Comedy", "POSTER"));
	assert.equal(folderArtworkSuggestionForField(suggestionSet, "coverImageUrl", "LANDSCAPE"), genreArtworkUrl("Comedy", "LANDSCAPE"));
	assert.equal(folderArtworkSuggestionForField(suggestionSet, "heroBackdropUrl", "LANDSCAPE"), null);
});

test("classification is exact per resolved authority and treats arbitrary TMDB URLs conservatively", async () => {
	const suggestionSet = await loadFolderArtworkSuggestions({
		folder: folder(sourcesFromDrafts([networkDraft()])),
		artworkRuntimeClient: runtimeClient(),
		networkCatalogueProvider: catalogueProvider({ id: 2, logoPath: "/abc.png" }),
	});
	const curatedUrls = curatedFolderArtworkUrls(suggestionSet, "coverImageUrl");
	const options = { curatedUrls, tmdbFallbackUrls: suggestionSet.tmdbFallbackUrls.coverImageUrl };
	assert.equal(classifyFolderArtworkValue("", options), FOLDER_ARTWORK_CLASSIFICATIONS.NONE);
	assert.equal(classifyFolderArtworkValue(curatedUrls[0], options), FOLDER_ARTWORK_CLASSIFICATIONS.CURATED);
	assert.equal(classifyFolderArtworkValue("https://image.tmdb.org/t/p/w500/abc.png", options), FOLDER_ARTWORK_CLASSIFICATIONS.TMDB_FALLBACK);
	assert.equal(classifyFolderArtworkValue("https://image.tmdb.org/t/p/w500/arbitrary.png", options), FOLDER_ARTWORK_CLASSIFICATIONS.CUSTOM_UNKNOWN);
	assert.equal(classifyFolderArtworkValue("https://custom.example/art.webp", options), FOLDER_ARTWORK_CLASSIFICATIONS.CUSTOM_UNKNOWN);
	assert.equal(classifyFolderArtworkValue("", { ...options, preserved: true }), FOLDER_ARTWORK_CLASSIFICATIONS.CUSTOM_UNKNOWN);
});

test("exact curated Tile artwork switches predictably between published Poster and Landscape counterparts", async () => {
	const suggestionSet = await loadFolderArtworkSuggestions({
		folder: folder(sourcesFromDrafts(peopleDrafts())),
		peopleManifestClient: manifestClient(),
	});
	const posterUrl = peopleManifest.byId[31].assets.poster.url;
	const landscapeUrl = peopleManifest.byId[31].assets.landscape.url;
	const opening = createNodeEditorDraft(folder(sourcesFromDrafts(peopleDrafts()), {
		coverImageUrl: posterUrl,
		heroBackdropUrl: "https://custom.example/hero.webp",
		titleLogoUrl: "https://custom.example/logo.png",
		focusGifUrl: "https://custom.example/focus.webp",
		focusGifEnabled: true,
	}));

	const landscape = updateNodeEditorTileShape(opening, "LANDSCAPE", suggestionSet);
	assert.equal(landscape.values.tileShape, "LANDSCAPE");
	assert.equal(landscape.values.coverImageUrl, landscapeUrl);
	assert.deepEqual(buildNodeEditorPatch(landscape), {
		tileShape: "LANDSCAPE",
		coverImageUrl: landscapeUrl,
	});
	assert.equal(landscape.values.heroBackdropUrl, opening.values.heroBackdropUrl);
	assert.equal(landscape.values.titleLogoUrl, opening.values.titleLogoUrl);
	assert.equal(landscape.values.focusGifUrl, opening.values.focusGifUrl);
	assert.equal(landscape.values.focusGifEnabled, true);

	const poster = updateNodeEditorTileShape(landscape, "POSTER", suggestionSet);
	assert.equal(poster.values.coverImageUrl, posterUrl);
	assert.deepEqual(buildNodeEditorPatch(poster), {});

	const landscapeOpening = createNodeEditorDraft(folder(sourcesFromDrafts(peopleDrafts()), {
		tileShape: "LANDSCAPE",
		coverImageUrl: landscapeUrl,
	}));
	assert.equal(updateNodeEditorTileShape(landscapeOpening, "POSTER", suggestionSet).values.coverImageUrl, posterUrl);
});

test("exact curated Focus artwork switches both directions independently while its enabled state stays unchanged", async () => {
	const suggestionSet = await loadFolderArtworkSuggestions({
		folder: folder(sourcesFromDrafts(peopleDrafts())),
		peopleManifestClient: manifestClient(),
	});
	const posterFocusUrl = peopleManifest.byId[31].assets.focusPoster.url;
	const landscapeFocusUrl = peopleManifest.byId[31].assets.focusLandscape.url;
	const opening = createNodeEditorDraft(folder(sourcesFromDrafts(peopleDrafts()), {
		coverImageUrl: "https://custom.example/tile.webp",
		focusGifUrl: posterFocusUrl,
		focusGifEnabled: false,
	}));

	const landscape = updateNodeEditorTileShape(opening, "LANDSCAPE", suggestionSet);
	assert.equal(landscape.values.coverImageUrl, opening.values.coverImageUrl);
	assert.equal(landscape.values.focusGifUrl, landscapeFocusUrl);
	assert.equal(landscape.values.focusGifEnabled, false);
	assert.deepEqual(buildNodeEditorPatch(landscape), {
		tileShape: "LANDSCAPE",
		focusGifUrl: landscapeFocusUrl,
	});

	const poster = updateNodeEditorTileShape(landscape, "POSTER", suggestionSet);
	assert.equal(poster.values.focusGifUrl, posterFocusUrl);
	assert.equal(poster.values.focusGifEnabled, false);
	assert.deepEqual(buildNodeEditorPatch(poster), {});

	const landscapeOpening = createNodeEditorDraft(folder(sourcesFromDrafts(peopleDrafts()), {
		tileShape: "LANDSCAPE",
		focusGifUrl: landscapeFocusUrl,
		focusGifEnabled: true,
	}));
	const returnedPoster = updateNodeEditorTileShape(landscapeOpening, "POSTER", suggestionSet);
	assert.equal(returnedPoster.values.focusGifUrl, posterFocusUrl);
	assert.equal(returnedPoster.values.focusGifEnabled, true);

	const manualExact = updateNodeEditorField(
		createNodeEditorDraft(folder(sourcesFromDrafts(peopleDrafts()), {
			focusGifUrl: "https://custom.example/opening-focus.webp",
		})),
		"focusGifUrl",
		posterFocusUrl,
	);
	assert.equal(
		updateNodeEditorTileShape(manualExact, "LANDSCAPE", suggestionSet).values.focusGifUrl,
		landscapeFocusUrl,
	);
});

test("blank and unproven Focus values stay exact while blank assistance follows the selected shape", async () => {
	const suggestionSet = await loadFolderArtworkSuggestions({
		folder: folder(sourcesFromDrafts(peopleDrafts())),
		peopleManifestClient: manifestClient(),
	});
	const cases = [
		"",
		"https://custom.example/focus.webp",
		"https://image.tmdb.org/t/p/w500/focus.png",
		peopleManifest.byId[40].assets.focusPoster.url,
		peopleManifest.byId[31].assets.poster.url,
		peopleManifest.byId[31].assets.hero.url,
		peopleManifest.byId[31].assets.titleLogo.url,
	];
	for (const focusGifUrl of cases) {
		const opening = createNodeEditorDraft(folder(sourcesFromDrafts(peopleDrafts()), { focusGifUrl }));
		const changed = updateNodeEditorTileShape(opening, "LANDSCAPE", suggestionSet);
		assert.equal(changed.values.focusGifUrl, focusGifUrl);
		assert.equal(changed.touched.focusGifUrl, false);
		assert.equal(missingCuratedFolderFocusOrientationNotice({
			suggestionSet,
			currentFocusUrl: changed.values.focusGifUrl,
			requestedShape: changed.values.tileShape,
			shapeTouched: true,
		}), null);
	}

	const blank = createNodeEditorDraft(folder(sourcesFromDrafts(peopleDrafts()), { focusGifUrl: "" }));
	const landscapeBlank = updateNodeEditorTileShape(blank, "LANDSCAPE", suggestionSet);
	assert.equal(landscapeBlank.values.focusGifUrl, "");
	assert.equal(
		folderArtworkSuggestionForField(suggestionSet, "focusGifUrl", landscapeBlank.values.tileShape),
		peopleManifest.byId[31].assets.focusLandscape.url,
	);
});

test("a missing curated Focus counterpart keeps the current URL and produces the Focus-specific notice", async () => {
	const suggestionSet = await loadFolderArtworkSuggestions({
		folder: folder(sourcesFromDrafts(peopleDrafts())),
		peopleManifestClient: manifestClient(),
	});
	const posterFocusUrl = peopleManifest.byId[31].assets.focusPoster.url;
	const posterOnlyFocusSet = Object.freeze({
		...suggestionSet,
		curated: Object.freeze({
			...suggestionSet.curated,
			focusGifUrl: Object.freeze({ POSTER: posterFocusUrl }),
		}),
	});
	const opening = createNodeEditorDraft(folder(sourcesFromDrafts(peopleDrafts()), {
		focusGifUrl: posterFocusUrl,
		focusGifEnabled: true,
	}));
	const changed = updateNodeEditorTileShape(opening, "LANDSCAPE", posterOnlyFocusSet);
	assert.equal(changed.values.focusGifUrl, posterFocusUrl);
	assert.equal(changed.touched.focusGifUrl, false);
	assert.equal(changed.values.focusGifEnabled, true);
	assert.equal(missingCuratedFolderFocusOrientationNotice({
		suggestionSet: posterOnlyFocusSet,
		currentFocusUrl: changed.values.focusGifUrl,
		requestedShape: changed.values.tileShape,
		shapeTouched: changed.touched.tileShape,
	}), "Curated Landscape focus artwork isn't available for this folder, so the current focus artwork will be kept.");
	assert.deepEqual(buildNodeEditorPatch(changed), { tileShape: "LANDSCAPE" });
	const calls = [];
	const applied = applyNodeEditorDraft({
		updateNode(...args) {
			calls.push(args);
			return { ok: true };
		},
	}, changed);
	assert.equal(applied.ok, true);
	assert.equal(applied.controllerCalled, true);
	assert.equal(calls.length, 1);
});

test("an exact curated URL already matching the requested orientation is retained without a needless URL touch", async () => {
	const suggestionSet = await loadFolderArtworkSuggestions({
		folder: folder(sourcesFromDrafts(peopleDrafts())),
		peopleManifestClient: manifestClient(),
	});
	const landscapeUrl = peopleManifest.byId[31].assets.landscape.url;
	const opening = createNodeEditorDraft(folder(sourcesFromDrafts(peopleDrafts()), {
		tileShape: "POSTER",
		coverImageUrl: landscapeUrl,
	}));
	const changed = updateNodeEditorTileShape(opening, "LANDSCAPE", suggestionSet);
	assert.equal(changed.values.coverImageUrl, landscapeUrl);
	assert.equal(changed.touched.coverImageUrl, false);
	assert.deepEqual(buildNodeEditorPatch(changed), { tileShape: "LANDSCAPE" });
});

test("missing curated orientation keeps the current exact curated URL and produces only the capability notice", async () => {
	const suggestionSet = await loadFolderArtworkSuggestions({
		folder: folder(sourcesFromDrafts(studioDrafts())),
		artworkRuntimeClient: runtimeClient(),
		studioCatalogueProvider: catalogueProvider({ id: 3, name: "Pixar", logoPath: "/pixar.png" }),
	});
	const landscapeUrl = folderArtworkSuggestionForField(suggestionSet, "coverImageUrl", "LANDSCAPE");
	const opening = createNodeEditorDraft(folder(sourcesFromDrafts(studioDrafts()), {
		tileShape: "LANDSCAPE",
		coverImageUrl: landscapeUrl,
	}));
	const changed = updateNodeEditorTileShape(opening, "POSTER", suggestionSet);
	assert.equal(changed.values.tileShape, "POSTER");
	assert.equal(changed.values.coverImageUrl, landscapeUrl);
	assert.equal(changed.touched.coverImageUrl, false);
	assert.equal(missingCuratedFolderTileOrientationNotice({
		suggestionSet,
		currentTileUrl: changed.values.coverImageUrl,
		requestedShape: changed.values.tileShape,
		shapeTouched: changed.touched.tileShape,
	}), "Curated Poster artwork isn't available for this folder, so the current tile artwork will be kept.");
	assert.equal(folderArtworkRequestForField(suggestionSet, "coverImageUrl", "POSTER"), null);
});

test("blank, custom, TMDB fallback, wrong-identity, and ambiguous Tile URLs are exact-preserved across shape changes", async () => {
	const suggestionSet = await loadFolderArtworkSuggestions({
		folder: folder(sourcesFromDrafts(peopleDrafts())),
		peopleManifestClient: manifestClient(),
	});
	const cases = [
		"",
		"https://custom.example/tile.webp",
		"https://image.tmdb.org/t/p/w500/fallback.png",
		peopleManifest.byId[40].assets.poster.url,
		peopleManifest.byId[31].assets.hero.url,
	];
	for (const coverImageUrl of cases) {
		const opening = createNodeEditorDraft(folder(sourcesFromDrafts(peopleDrafts()), { coverImageUrl }));
		const changed = updateNodeEditorTileShape(opening, "LANDSCAPE", suggestionSet);
		assert.equal(changed.values.coverImageUrl, coverImageUrl);
		assert.deepEqual(buildNodeEditorPatch(changed), { tileShape: "LANDSCAPE" });
		assert.equal(missingCuratedFolderTileOrientationNotice({
			suggestionSet,
			currentTileUrl: changed.values.coverImageUrl,
			requestedShape: changed.values.tileShape,
			shapeTouched: true,
		}), null);
	}

	const ambiguous = createNodeEditorDraft(folder([], {
		coverImageUrl: peopleManifest.byId[31].assets.poster.url,
	}));
	assert.equal(
		updateNodeEditorTileShape(ambiguous, "LANDSCAPE", null).values.coverImageUrl,
		peopleManifest.byId[31].assets.poster.url,
	);
});

test("current draft recognition stops after manual custom replacement following an automatic switch", async () => {
	const suggestionSet = await loadFolderArtworkSuggestions({
		folder: folder(sourcesFromDrafts(peopleDrafts())),
		peopleManifestClient: manifestClient(),
	});
	const opening = createNodeEditorDraft(folder(sourcesFromDrafts(peopleDrafts()), {
		coverImageUrl: peopleManifest.byId[31].assets.poster.url,
		focusGifUrl: peopleManifest.byId[31].assets.focusPoster.url,
	}));
	const automatic = updateNodeEditorTileShape(opening, "LANDSCAPE", suggestionSet);
	assert.equal(automatic.values.coverImageUrl, peopleManifest.byId[31].assets.landscape.url);
	assert.equal(automatic.values.focusGifUrl, peopleManifest.byId[31].assets.focusLandscape.url);
	const custom = updateNodeEditorField(automatic, "coverImageUrl", "https://custom.example/final.webp");
	const customFocus = updateNodeEditorField(custom, "focusGifUrl", "https://custom.example/final-focus.webp");
	const returned = updateNodeEditorTileShape(customFocus, "POSTER", suggestionSet);
	assert.equal(returned.values.coverImageUrl, "https://custom.example/final.webp");
	assert.equal(returned.values.focusGifUrl, "https://custom.example/final-focus.webp");
	assert.deepEqual(buildNodeEditorPatch(returned), {
		coverImageUrl: "https://custom.example/final.webp",
		focusGifUrl: "https://custom.example/final-focus.webp",
	});
});

test("shape transition planning is exact-authority-only and draft-state driven", async () => {
	const suggestionSet = await loadFolderArtworkSuggestions({
		folder: folder(sourcesFromDrafts(peopleDrafts())),
		peopleManifestClient: manifestClient(),
	});
	const recognized = planCuratedFolderTileShapeTransition({
		suggestionSet,
		currentTileUrl: peopleManifest.byId[31].assets.poster.url,
		requestedShape: "LANDSCAPE",
	});
	assert.equal(recognized.recognizedCurated, true);
	assert.equal(recognized.replacementTileUrl, peopleManifest.byId[31].assets.landscape.url);
	assert.equal(recognized.missingRequestedOrientation, false);

	const custom = planCuratedFolderTileShapeTransition({
		suggestionSet,
		currentTileUrl: "https://custom.example/tile.webp",
		requestedShape: "LANDSCAPE",
	});
	assert.equal(custom.recognizedCurated, false);
	assert.equal(custom.replacementTileUrl, null);
	assert.equal(custom.missingRequestedOrientation, false);

	const recognizedFocus = planCuratedFolderFocusShapeTransition({
		suggestionSet,
		currentFocusUrl: peopleManifest.byId[31].assets.focusPoster.url,
		requestedShape: "LANDSCAPE",
	});
	assert.equal(recognizedFocus.recognizedCurated, true);
	assert.equal(recognizedFocus.replacementFocusUrl, peopleManifest.byId[31].assets.focusLandscape.url);
	assert.equal(recognizedFocus.missingRequestedOrientation, false);
});

test("a shape choice made while authority is loading rechecks that explicit draft transition once authority is ready", async () => {
	const suggestionSet = await loadFolderArtworkSuggestions({
		folder: folder(sourcesFromDrafts(peopleDrafts())),
		peopleManifestClient: manifestClient(),
	});
	const opening = createNodeEditorDraft(folder(sourcesFromDrafts(peopleDrafts()), {
		coverImageUrl: peopleManifest.byId[31].assets.poster.url,
		focusGifUrl: peopleManifest.byId[31].assets.focusPoster.url,
	}));
	const changedBeforeAuthority = updateNodeEditorTileShape(opening, "LANDSCAPE", null);
	assert.equal(changedBeforeAuthority.values.coverImageUrl, peopleManifest.byId[31].assets.poster.url);
	assert.equal(changedBeforeAuthority.values.focusGifUrl, peopleManifest.byId[31].assets.focusPoster.url);
	const unchangedWithoutRecheck = updateNodeEditorTileShape(changedBeforeAuthority, "LANDSCAPE", suggestionSet);
	assert.equal(unchangedWithoutRecheck, changedBeforeAuthority);
	const resolved = updateNodeEditorTileShape(changedBeforeAuthority, "LANDSCAPE", suggestionSet, {
		recheckCurrentShape: true,
	});
	assert.equal(resolved.values.coverImageUrl, peopleManifest.byId[31].assets.landscape.url);
	assert.equal(resolved.values.focusGifUrl, peopleManifest.byId[31].assets.focusLandscape.url);
	assert.deepEqual(buildNodeEditorPatch(resolved), {
		tileShape: "LANDSCAPE",
		coverImageUrl: peopleManifest.byId[31].assets.landscape.url,
		focusGifUrl: peopleManifest.byId[31].assets.focusLandscape.url,
	});
});

test("sibling shape notice requires explicit touch and one exact saved sibling consensus", () => {
	const currentFolderInternalId = "folder-current";
	const sibling = (internalId, tileShape) => ({ internalId, editable: { tileShape } });
	const base = { currentFolderInternalId, currentDraftShape: "LANDSCAPE", shapeTouched: true };
	assert.equal(folderSiblingTileShapeNotice({
		...base,
		siblingFolders: [sibling(currentFolderInternalId, "POSTER"), sibling("a", "POSTER"), sibling("b", "poster")],
	}), "Other folders in this collection use Poster tiles.");
	assert.equal(folderSiblingTileShapeNotice({
		currentFolderInternalId,
		currentDraftShape: "POSTER",
		shapeTouched: true,
		siblingFolders: [sibling(currentFolderInternalId, "LANDSCAPE"), sibling("a", "LANDSCAPE")],
	}), "Other folders in this collection use Landscape tiles.");
	assert.equal(folderSiblingTileShapeNotice({ ...base, shapeTouched: false, siblingFolders: [sibling("a", "POSTER")] }), null);
	assert.equal(folderSiblingTileShapeNotice({ ...base, currentDraftShape: "POSTER", siblingFolders: [sibling("a", "POSTER")] }), null);
	assert.equal(folderSiblingTileShapeNotice({ ...base, siblingFolders: [sibling("a", "POSTER"), sibling("b", "LANDSCAPE")] }), null);
	assert.equal(folderSiblingTileShapeNotice({ ...base, siblingFolders: [sibling(currentFolderInternalId, "POSTER")] }), null);
	assert.equal(folderSiblingTileShapeNotice({ ...base, siblingFolders: [sibling("a", "SQUARE")] }), null);
});

test("automatic Tile and Focus counterpart switching stays draft-only, Cancel restores saved data, and Apply saves all fields once", async () => {
	const controller = createBuilderController({
		idFactory: countingIdFactory("shape-internal"),
		nuvioIdFactory: countingIdFactory("shape-nuvio"),
		initialProjectTitle: "Shape transition",
	});
	assert.equal(controller.importValue([{
		id: "collection",
		title: "Collection",
		folders: [{
			id: "person",
			title: "Person",
			tileShape: "POSTER",
			coverImageUrl: peopleManifest.byId[31].assets.poster.url,
			focusGifUrl: peopleManifest.byId[31].assets.focusPoster.url,
			focusGifEnabled: false,
			heroBackdropUrl: "https://custom.example/hero.webp",
			reviewSentinel: { keep: true },
			sources: peopleDrafts().map((draft) => draft.editable),
		}],
	}]).ok, true);
	const savedFolder = controller.getState().project.collections[0].folders[0];
	const suggestionSet = await loadFolderArtworkSuggestions({ folder: savedFolder, peopleManifestClient: manifestClient() });
	const beforeProject = JSON.stringify(controller.getState().project);
	const beforeSerialized = JSON.stringify(controller.serializeProject().value);
	const beforeRevision = controller.getState().revision;

	const changed = updateNodeEditorTileShape(createNodeEditorDraft(savedFolder), "LANDSCAPE", suggestionSet);
	assert.equal(changed.values.coverImageUrl, peopleManifest.byId[31].assets.landscape.url);
	assert.equal(changed.values.focusGifUrl, peopleManifest.byId[31].assets.focusLandscape.url);
	assert.equal(changed.values.focusGifEnabled, false);
	assert.equal(JSON.stringify(controller.getState().project), beforeProject);
	assert.equal(JSON.stringify(controller.serializeProject().value), beforeSerialized);
	assert.equal(controller.getState().revision, beforeRevision);

	const cancelledReopen = createNodeEditorDraft(savedFolder);
	assert.equal(cancelledReopen.values.tileShape, "POSTER");
	assert.equal(cancelledReopen.values.coverImageUrl, peopleManifest.byId[31].assets.poster.url);
	assert.equal(cancelledReopen.values.focusGifUrl, peopleManifest.byId[31].assets.focusPoster.url);
	assert.equal(cancelledReopen.values.focusGifEnabled, false);
	const applied = applyNodeEditorDraft(controller, changed);
	assert.equal(applied.ok, true);
	assert.equal(applied.controllerCalled, true);
	assert.equal(controller.getState().revision, beforeRevision + 1);
	const serializedFolder = controller.serializeProject().value[0].folders[0];
	assert.equal(serializedFolder.tileShape, "LANDSCAPE");
	assert.equal(serializedFolder.coverImageUrl, peopleManifest.byId[31].assets.landscape.url);
	assert.equal(serializedFolder.focusGifUrl, peopleManifest.byId[31].assets.focusLandscape.url);
	assert.equal(serializedFolder.focusGifEnabled, false);
	assert.equal(serializedFolder.heroBackdropUrl, "https://custom.example/hero.webp");
	assert.deepEqual(serializedFolder.reviewSentinel, { keep: true });
});

test("switching away and back to the exact original curated state preserves no-op Apply semantics", async () => {
	const suggestionSet = await loadFolderArtworkSuggestions({
		folder: folder(sourcesFromDrafts(peopleDrafts())),
		peopleManifestClient: manifestClient(),
	});
	const opening = createNodeEditorDraft(folder(sourcesFromDrafts(peopleDrafts()), {
		coverImageUrl: peopleManifest.byId[31].assets.poster.url,
		focusGifUrl: peopleManifest.byId[31].assets.focusPoster.url,
	}));
	const landscape = updateNodeEditorTileShape(opening, "LANDSCAPE", suggestionSet);
	const restored = updateNodeEditorTileShape(landscape, "POSTER", suggestionSet);
	assert.deepEqual(buildNodeEditorPatch(restored), {});
	const calls = [];
	const result = applyNodeEditorDraft({ updateNode(...args) { calls.push(args); return { ok: true }; } }, restored);
	assert.equal(result.ok, true);
	assert.equal(result.controllerCalled, false);
	assert.deepEqual(calls, []);
});

test("blank-field acceptance changes only the draft; Cancel is zero mutation and Apply touches one field in one revision", async () => {
	const controller = createBuilderController({
		idFactory: countingIdFactory("internal"),
		nuvioIdFactory: countingIdFactory("nuvio"),
		initialProjectTitle: "Suggestions",
	});
	const imported = controller.importValue([{
		id: "collection",
		title: "Collection",
		folders: [{
			id: "person",
			title: "Imported person",
			tileShape: "POSTER",
			unknownFolder: { keep: "exact" },
			sources: peopleDrafts().map((draft) => draft.editable),
		}],
	}]);
	assert.equal(imported.ok, true);
	const savedFolder = controller.getState().project.collections[0].folders[0];
	const suggestionSet = await loadFolderArtworkSuggestions({ folder: savedFolder, peopleManifestClient: manifestClient() });
	const suggestedUrl = folderArtworkSuggestionForField(suggestionSet, "coverImageUrl", "POSTER");
	const beforeProject = JSON.stringify(controller.getState().project);
	const beforeSerialized = JSON.stringify(controller.serializeProject().value);
	const beforeRevision = controller.getState().revision;

	const openingDraft = createNodeEditorDraft(savedFolder);
	const acceptedDraft = updateNodeEditorField(openingDraft, "coverImageUrl", suggestedUrl);
	assert.equal(acceptedDraft.values.coverImageUrl, suggestedUrl);
	assert.equal(JSON.stringify(controller.getState().project), beforeProject);
	assert.equal(JSON.stringify(controller.serializeProject().value), beforeSerialized);
	assert.equal(controller.getState().revision, beforeRevision);

	const reopened = createNodeEditorDraft(savedFolder);
	assert.equal(reopened.values.coverImageUrl, "");
	const applied = applyNodeEditorDraft(controller, acceptedDraft);
	assert.equal(applied.ok, true);
	assert.equal(controller.getState().revision, beforeRevision + 1);
	const serializedFolder = controller.serializeProject().value[0].folders[0];
	assert.equal(serializedFolder.coverImageUrl, suggestedUrl);
	assert.deepEqual(serializedFolder.unknownFolder, { keep: "exact" });
	assert.equal(serializedFolder.title, "Imported person");
});

test("shape changes update the available Tile candidate without rewriting the draft URL", async () => {
	const suggestionSet = await loadFolderArtworkSuggestions({
		folder: folder(sourcesFromDrafts(peopleDrafts()), { coverImageUrl: "https://custom.example/original.webp" }),
		peopleManifestClient: manifestClient(),
	});
	const opening = createNodeEditorDraft(folder(sourcesFromDrafts(peopleDrafts()), { coverImageUrl: "https://custom.example/original.webp" }));
	const changedShape = updateNodeEditorField(opening, "tileShape", "LANDSCAPE");
	assert.equal(changedShape.values.coverImageUrl, "https://custom.example/original.webp");
	assert.equal(folderArtworkSuggestionForField(suggestionSet, "coverImageUrl", opening.values.tileShape), peopleManifest.byId[31].assets.poster.url);
	assert.equal(folderArtworkSuggestionForField(suggestionSet, "coverImageUrl", changedShape.values.tileShape), peopleManifest.byId[31].assets.landscape.url);
	assert.deepEqual(buildNodeEditorPatch(changedShape), { tileShape: "LANDSCAPE" });
	assert.deepEqual(buildNodeEditorPatch(updateNodeEditorField(opening, "title", "Unrelated rename")), { title: "Unrelated rename" });
});

test("owner-review project imports and round-trips with source-derived identities and sentinels intact", () => {
	const reviewValue = JSON.parse(fs.readFileSync(path.join(
		rootDir,
		"manual-tests/nuvio-clients/issue-140-curated-folder-artwork/owner-review.json",
	), "utf8"));
	const controller = createBuilderController({
		idFactory: countingIdFactory("review-internal"),
		nuvioIdFactory: countingIdFactory("review-nuvio"),
		initialProjectTitle: "Review fixture",
	});
	const imported = controller.importValue(reviewValue);
	assert.equal(imported.ok, true);
	const folders = controller.getState().project.collections[0].folders;
	assert.deepEqual(folders.map((entry) => entry.editable.title), [
		"People — blank with curated artwork",
		"People — existing custom artwork",
		"Network — existing TMDB fallback",
		"Genre — curated already assigned",
		"Missing curated asset — requestable",
		"Studio — supported orientation",
		"Ambiguous — no action",
	]);
	assert.deepEqual(folders.map((entry) => resolveFolderArtworkIdentity(entry)?.authority ?? null), [
		FOLDER_ARTWORK_AUTHORITIES.PEOPLE,
		FOLDER_ARTWORK_AUTHORITIES.PEOPLE,
		FOLDER_ARTWORK_AUTHORITIES.NETWORK,
		FOLDER_ARTWORK_AUTHORITIES.GENRE,
		FOLDER_ARTWORK_AUTHORITIES.PEOPLE,
		FOLDER_ARTWORK_AUTHORITIES.STUDIO,
		null,
	]);
	const serialized = controller.serializeProject();
	assert.equal(serialized.ok, true);
	assert.equal(serialized.value[0].folders.every((entry) => Array.isArray(entry.catalogSources) && entry.catalogSources.length === 0), true);
	assert.deepEqual(serialized.value.map((collection) => ({
		...collection,
		folders: collection.folders.map(({ catalogSources, ...entry }) => entry),
	})), reviewValue);
});

test("issue #142 owner-review project round-trips exact artwork, identities, sibling shapes, and sentinels", () => {
	const reviewValue = JSON.parse(fs.readFileSync(path.join(
		rootDir,
		"manual-tests/nuvio-clients/issue-142-shape-aware-folder-artwork/owner-review.json",
	), "utf8"));
	const controller = createBuilderController({
		idFactory: countingIdFactory("shape-review-internal"),
		nuvioIdFactory: countingIdFactory("shape-review-nuvio"),
		initialProjectTitle: "Shape review fixture",
	});
	assert.equal(controller.importValue(reviewValue).ok, true);
	const collections = controller.getState().project.collections;
	assert.deepEqual(collections.map((entry) => entry.editable.title), [
		"Shape-aware artwork — Poster siblings",
		"Shape-aware artwork — Landscape siblings",
		"Shape-aware artwork — mixed siblings",
		"Shape-aware artwork — ambiguous",
	]);
	assert.deepEqual(collections[0].folders.map((entry) => entry.editable.tileShape), Array(6).fill("POSTER"));
	assert.deepEqual(collections[1].folders.map((entry) => entry.editable.tileShape), Array(4).fill("LANDSCAPE"));
	assert.deepEqual(collections[2].folders.map((entry) => entry.editable.tileShape), ["POSTER", "POSTER", "LANDSCAPE", "POSTER"]);
	assert.deepEqual([
		resolveFolderArtworkIdentity(collections[0].folders[0])?.authority,
		resolveFolderArtworkIdentity(collections[0].folders[1])?.authority,
		resolveFolderArtworkIdentity(collections[1].folders[0])?.authority,
		resolveFolderArtworkIdentity(collections[3].folders[0]),
	], [
		FOLDER_ARTWORK_AUTHORITIES.PEOPLE,
		FOLDER_ARTWORK_AUTHORITIES.NETWORK,
		FOLDER_ARTWORK_AUTHORITIES.STUDIO,
		null,
	]);
	assert.deepEqual({
		posterTile: collections[0].folders[0].editable.coverImageUrl,
		posterFocus: collections[0].folders[0].editable.focusGifUrl,
		posterFocusEnabled: collections[0].folders[0].editable.focusGifEnabled,
		landscapeTile: collections[1].folders[1].editable.coverImageUrl,
		landscapeFocus: collections[1].folders[1].editable.focusGifUrl,
		landscapeFocusEnabled: collections[1].folders[1].editable.focusGifEnabled,
	}, {
		posterTile: peopleManifest.byId[31].assets.poster.url,
		posterFocus: peopleManifest.byId[31].assets.focusPoster.url,
		posterFocusEnabled: false,
		landscapeTile: peopleManifest.byId[31].assets.landscape.url,
		landscapeFocus: peopleManifest.byId[31].assets.focusLandscape.url,
		landscapeFocusEnabled: true,
	});
	const serialized = controller.serializeProject();
	assert.equal(serialized.ok, true);
	assert.deepEqual(serialized.value.map((collection) => ({
		...collection,
		folders: collection.folders.map(({ catalogSources, ...entry }) => entry),
	})), reviewValue);
});
