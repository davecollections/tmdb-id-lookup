import { act, createElement, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { createBuilderController } from "../../builder/src/application/index.js";
import {
	createNetworkCatalogueProvider,
	createPeopleManifestClient,
	createStudioCatalogueProvider,
	genreArtworkUrl,
} from "../../builder/src/source-add/index.js";
import { BuilderWorkspace } from "../../builder/src/ui/BuilderWorkspace.jsx";
import {
	ARTWORK_ENTITY_TYPES,
	ARTWORK_ORIENTATIONS,
	ARTWORK_RESULT_STATUSES,
	createArtworkRuntimeClient,
} from "../../js/artwork-runtime.mjs";
import "../../builder/src/styles.css";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const DATA_ARTWORK = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
const BROKEN_ARTWORK = "/tests/fixtures/missing-folder-card-artwork.webp";
const ARTWORK_BASE_URL = new URL(window.location.href).searchParams.get("artworkBaseUrl");
if (!ARTWORK_BASE_URL) throw new Error("Mounted Folder artwork fixture requires artworkBaseUrl.");
const fetchCalls = [];
const originalFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = (...args) => {
	fetchCalls.push(String(args[0]));
	return originalFetch(...args);
};
const livePeopleManifestClient = createPeopleManifestClient();
const liveArtworkRuntimeClient = createArtworkRuntimeClient();
const liveStudioCatalogueProvider = createStudioCatalogueProvider({ catalogueUrl: "/data/companies.min.json" });
const liveNetworkCatalogueProvider = createNetworkCatalogueProvider({ catalogueUrl: "/data/tv-networks.min.json" });
const livePeopleManifest = await livePeopleManifestClient.load();
if (!livePeopleManifest?.ok || !livePeopleManifest.data?.byId?.[31]) {
	throw new Error("Mounted Folder artwork fixture could not load exact People artwork authority.");
}
const exactPeoplePosterUrl = livePeopleManifest.data.byId[31].assets.poster.url;
const exactPeopleLandscapeUrl = livePeopleManifest.data.byId[31].assets.landscape.url;
const exactPeopleFocusPosterUrl = livePeopleManifest.data.byId[31].assets.focusPoster?.url;
const exactPeopleFocusLandscapeUrl = livePeopleManifest.data.byId[31].assets.focusLandscape?.url;
if (!exactPeopleFocusPosterUrl || !exactPeopleFocusLandscapeUrl) {
	throw new Error("Mounted Folder artwork fixture requires the published People Focus pair.");
}
const liveStudioLandscape = await liveArtworkRuntimeClient.resolve({
	entityType: ARTWORK_ENTITY_TYPES.COMPANY,
	tmdbId: 3,
	orientation: ARTWORK_ORIENTATIONS.LANDSCAPE,
});
if (liveStudioLandscape?.status !== ARTWORK_RESULT_STATUSES.READY) {
	throw new Error("Mounted Folder artwork fixture could not load exact Studio Landscape artwork authority.");
}
const exactStudioLandscapeUrl = liveStudioLandscape.assetUrl;
fetchCalls.length = 0;

function personSource(overrides = {}) {
	return {
		provider: "tmdb",
		title: "Movie Credits",
		tmdbSourceType: "PERSON",
		tmdbId: 31,
		mediaType: "MOVIE",
		sortBy: "popularity.desc",
		filters: {},
		...overrides,
	};
}

function networkSource() {
	return {
		provider: "tmdb",
		title: "Series",
		tmdbSourceType: "NETWORK",
		tmdbId: 2,
		mediaType: "TV",
		sortBy: "popularity.desc",
		filters: {},
	};
}

function studioSource() {
	return {
		provider: "tmdb",
		title: "Movies",
		tmdbSourceType: "COMPANY",
		tmdbId: 3,
		mediaType: "MOVIE",
		sortBy: "popularity.desc",
		filters: {},
	};
}

function comedySource(mediaType, tmdbId) {
	return {
		provider: "tmdb",
		title: mediaType === "MOVIE" ? "Comedy Movies" : "Comedy Series",
		tmdbSourceType: "DISCOVER",
		tmdbId: null,
		mediaType,
		sortBy: "popularity.desc",
		filters: { withGenres: String(tmdbId) },
	};
}

function countingIdFactory(prefix = "mounted") {
	let count = 0;
	return () => `${prefix}-${++count}`;
}

const controller = createBuilderController({
	idFactory: countingIdFactory(),
	nuvioIdFactory: countingIdFactory("nuvio"),
	initialProjectTitle: "Mounted Folder artwork",
});

const scaleFolders = Array.from({ length: 100 }, (_, index) => ({
	id: `scale-${index + 1}`,
	title: `Scale folder ${String(index + 1).padStart(3, "0")}`,
	tileShape: index % 2 === 0 ? "POSTER" : "LANDSCAPE",
	coverImageUrl: DATA_ARTWORK,
	sources: [],
}));

const imported = controller.importValue([{
	id: "collection",
	title: "Artwork collection",
	backdropImageUrl: `${ARTWORK_BASE_URL}/collection-saved.gif`,
	viewMode: "TABBED_GRID",
	showAllTab: true,
	pinToTop: false,
	focusGlowEnabled: true,
	unknownCollection: { keep: "mounted-sentinel" },
	folders: [
		{ id: "poster", title: "Poster artwork", tileShape: "POSTER", coverImageUrl: DATA_ARTWORK, sources: [] },
		{ id: "landscape", title: "Landscape artwork", tileShape: "LANDSCAPE", coverImageUrl: DATA_ARTWORK, sources: [] },
		{ id: "none", title: "No artwork", tileShape: "POSTER", sources: [] },
		{ id: "blank", title: "Blank artwork", tileShape: "POSTER", coverImageUrl: "   ", sources: [] },
		{ id: "broken", title: "Broken artwork", tileShape: "POSTER", coverImageUrl: BROKEN_ARTWORK, sources: [] },
		{ id: "unknown", title: "Unsupported shape", tileShape: "SQUARE", coverImageUrl: DATA_ARTWORK, sources: [] },
		{ id: "hidden", title: "\u200E", tileShape: "POSTER", coverImageUrl: DATA_ARTWORK, sources: [] },
		{ id: "long", title: "A deliberately long Folder title that must remain readable beside assigned Landscape artwork", tileShape: "LANDSCAPE", coverImageUrl: DATA_ARTWORK, sources: [] },
		{ id: "arbitrary-origin", title: "Arbitrary origin artwork", tileShape: "LANDSCAPE", coverImageUrl: `${ARTWORK_BASE_URL}/hotlink-sensitive.gif`, sources: [] },
		{ id: "failure-replacement", title: "Failed artwork replacement", tileShape: "POSTER", coverImageUrl: `${ARTWORK_BASE_URL}/recovering.gif`, sources: [] },
		{
			id: "settings-preview",
			title: "Settings preview",
			tileShape: "POSTER",
			coverImageUrl: `${ARTWORK_BASE_URL}/settings-tile.gif`,
			coverEmoji: "🛰️",
			heroBackdropUrl: `${ARTWORK_BASE_URL}/settings-backdrop.gif`,
			heroVideoUrl: `${ARTWORK_BASE_URL}/video-a.mp4`,
			titleLogoUrl: `${ARTWORK_BASE_URL}/settings-logo.gif`,
			focusGifUrl: `${ARTWORK_BASE_URL}/settings-focus.gif`,
			focusGifEnabled: true,
			sources: [],
		},
		{
			id: "settings-no-video",
			title: "Settings without video",
			tileShape: "POSTER",
			coverImageUrl: `${ARTWORK_BASE_URL}/settings-tile.gif`,
			coverEmoji: "🌌",
			heroBackdropUrl: `${ARTWORK_BASE_URL}/settings-backdrop.gif`,
			titleLogoUrl: `${ARTWORK_BASE_URL}/settings-logo.gif`,
			focusGifUrl: `${ARTWORK_BASE_URL}/settings-focus.gif`,
			focusGifEnabled: true,
			sources: [],
		},
		{ id: "settings-blank-video", title: "Settings with blank video", heroBackdropUrl: `${ARTWORK_BASE_URL}/settings-backdrop.gif`, heroVideoUrl: "   ", sources: [] },
		{ id: "settings-unsupported-video", title: "Settings with unsupported video", heroBackdropUrl: `${ARTWORK_BASE_URL}/settings-backdrop.gif`, heroVideoUrl: ["RAW_VIDEO"], sources: [] },
		{ id: "video-clear", title: "Existing video to clear", heroVideoUrl: `${ARTWORK_BASE_URL}/video-a.mp4`, sources: [] },
		{ id: "video-cancel", title: "Existing video to cancel", heroVideoUrl: `${ARTWORK_BASE_URL}/video-a.mp4`, sources: [] },
		{ id: "video-replace", title: "Existing video to replace", heroVideoUrl: `${ARTWORK_BASE_URL}/video-a.mp4`, sources: [] },
		{
			id: "suggestion-people-blank",
			title: "People — blank with curated artwork",
			tileShape: "POSTER",
			unknownFolder: { keep: "people-blank" },
			sources: [personSource(), personSource({ title: "Series Credits", mediaType: "TV" })],
		},
		{
			id: "suggestion-people-custom",
			title: "People — existing custom artwork",
			tileShape: "POSTER",
			coverImageUrl: `${ARTWORK_BASE_URL}/settings-tile.gif`,
			heroBackdropUrl: ["RAW_HERO"],
			unknownFolder: { keep: "people-custom" },
			sources: [personSource()],
		},
		{
			id: "suggestion-network-fallback",
			title: "Network — existing TMDB fallback",
			tileShape: "POSTER",
			coverImageUrl: "https://image.tmdb.org/t/p/w500/2uy2ZWcplrSObIyt4x0Y9rkG6qO.png",
			unknownFolder: { keep: "network" },
			sources: [networkSource()],
		},
		{
			id: "suggestion-genre-curated",
			title: "Genre — curated already assigned",
			tileShape: "POSTER",
			coverImageUrl: genreArtworkUrl("Comedy", "POSTER"),
			unknownFolder: { keep: "genre" },
			sources: [comedySource("MOVIE", 35), comedySource("TV", 35)],
		},
		{
			id: "suggestion-people-request",
			title: "Missing curated asset — requestable",
			tileShape: "POSTER",
			unknownFolder: { keep: "people-request" },
			sources: [personSource({ tmdbId: 8559 })],
		},
		{
			id: "suggestion-studio-landscape",
			title: "Studio — supported orientation",
			tileShape: "LANDSCAPE",
			unknownFolder: { keep: "studio" },
			sources: [studioSource()],
		},
		{
			id: "suggestion-ambiguous",
			title: "Ambiguous — no action",
			tileShape: "POSTER",
			unknownFolder: { keep: "ambiguous" },
			sources: [],
		},
		...scaleFolders,
	],
}, {
	id: "poster-consensus",
	title: "Poster-consistent siblings",
	viewMode: "TABBED_GRID",
	showAllTab: true,
	pinToTop: false,
	folders: [
		{
			id: "shape-people-both",
			title: "People — curated both orientations",
			tileShape: "POSTER",
			coverImageUrl: exactPeoplePosterUrl,
			focusGifUrl: exactPeopleFocusPosterUrl,
			focusGifEnabled: false,
			reviewSentinel: { keep: "people-both" },
			sources: [personSource(), personSource({ title: "Series Credits", mediaType: "TV" })],
		},
		{ id: "shape-poster-sibling-a", title: "Poster sibling A", tileShape: "POSTER", sources: [] },
		{ id: "shape-poster-sibling-b", title: "Poster sibling B", tileShape: "POSTER", sources: [] },
	],
}, {
	id: "landscape-consensus",
	title: "Landscape-consistent siblings",
	viewMode: "TABBED_GRID",
	showAllTab: true,
	pinToTop: false,
	folders: [
		{
			id: "shape-studio-landscape-only",
			title: "Studio — Landscape only",
			tileShape: "LANDSCAPE",
			coverImageUrl: exactStudioLandscapeUrl,
			reviewSentinel: { keep: "studio-landscape-only" },
			sources: [studioSource()],
		},
		{ id: "shape-landscape-sibling-a", title: "Landscape sibling A", tileShape: "LANDSCAPE", sources: [] },
		{ id: "shape-landscape-sibling-b", title: "Landscape sibling B", tileShape: "LANDSCAPE", sources: [] },
	],
}, {
	id: "mixed-shapes",
	title: "Already-mixed siblings",
	viewMode: "TABBED_GRID",
	showAllTab: true,
	pinToTop: false,
	folders: [
		{
			id: "shape-mixed-target",
			title: "People — already mixed siblings",
			tileShape: "POSTER",
			coverImageUrl: exactPeoplePosterUrl,
			sources: [personSource()],
		},
		{ id: "shape-mixed-poster", title: "Mixed Poster", tileShape: "POSTER", sources: [] },
		{ id: "shape-mixed-landscape", title: "Mixed Landscape", tileShape: "LANDSCAPE", sources: [] },
	],
}]);
if (!imported.ok) throw new Error("Mounted Folder artwork fixture import failed.");

const collection = controller.getState().project.collections[0];
const collectionsByTitle = Object.fromEntries(controller.getState().project.collections.map((entry) => [entry.editable.title, entry]));
const foldersById = Object.fromEntries(collection.folders.map((folder) => [folder.editable.id, folder]));
controller.selectNode(collection.internalId);
const projectBefore = JSON.stringify(controller.getState().project);
const serializedBefore = JSON.stringify(controller.serializeProject().value);
const revisionBefore = controller.getState().revision;

function MountedWorkspace() {
	const state = useSyncExternalStore(
		controller.subscribe,
		controller.getState,
		controller.getState,
	);
	return createElement(BuilderWorkspace, {
		controller,
		state,
		peopleManifestClient: livePeopleManifestClient,
		studioArtworkRuntimeClient: liveArtworkRuntimeClient,
		studioCatalogueProvider: liveStudioCatalogueProvider,
		networkCatalogueProvider: liveNetworkCatalogueProvider,
	});
}

function afterCommittedEffects() {
	return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

async function waitForCondition(resolveCondition, timeoutMs = 3000) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (resolveCondition()) return;
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
	throw new Error("Mounted Folder artwork condition timed out.");
}

function folderCard(title) {
	return [...document.querySelectorAll('[data-hierarchy-card="folder"]')].find((card) => (
		card.querySelector(".node-title")?.textContent.trim() === title
	)) ?? null;
}

function roundedRect(element) {
	const rect = element.getBoundingClientRect();
	return {
		width: Math.round(rect.width * 100) / 100,
		height: Math.round(rect.height * 100) / 100,
		left: Math.round(rect.left * 100) / 100,
		right: Math.round(rect.right * 100) / 100,
	};
}

async function selectCollection(title = "Artwork collection") {
	const target = collectionsByTitle[title];
	if (!target) throw new Error(`Unknown mounted collection: ${title}`);
	controller.selectNode(target.internalId);
	await afterCommittedEffects();
}

async function openFolderSettings(title = "Settings preview", collectionTitle = "Artwork collection") {
	if (document.querySelector('[data-node-editor="folder"]')) return;
	await selectCollection(collectionTitle);
	const card = folderCard(title);
	if (!card) throw new Error(`Mounted Folder card not found: ${collectionTitle} / ${title}`);
	card.querySelector('[data-action="open-folder-actions"]').click();
	await afterCommittedEffects();
	document.querySelector('[data-actions-menu="folder"]:not([hidden]) [data-action="edit-folder"]').click();
	await afterCommittedEffects();
}

async function cancelFolderSettings() {
	document.querySelector('[data-action="cancel-node-edit"]')?.click();
	await afterCommittedEffects();
}

async function openCollectionSettings() {
	if (document.querySelector('[data-node-editor="collection"]')) return;
	controller.clearSelection();
	await afterCommittedEffects();
	const card = [...document.querySelectorAll('[data-hierarchy-card="collection"]')].find((entry) => (
		entry.querySelector(".node-title")?.textContent.trim() === "Artwork collection"
	));
	card.querySelector('[data-action="open-collection-actions"]').click();
	await afterCommittedEffects();
	document.querySelector('[data-actions-menu="collection"]:not([hidden]) [data-action="edit-collection"]').click();
	await afterCommittedEffects();
}

async function cancelCollectionSettings() {
	document.querySelector('[data-action="cancel-node-edit"]')?.click();
	await afterCommittedEffects();
	await selectCollection();
}

async function setEditorField(field, value) {
	const input = document.querySelector(`[data-editor-field="${field}"] input`);
	const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
	valueSetter.call(input, value);
	input.dispatchEvent(new Event("input", { bubbles: true }));
	input.dispatchEvent(new Event("change", { bubbles: true }));
	await afterCommittedEffects();
}

async function waitForPreview(field, expectedUrl) {
	const currentImage = document.querySelector(`[data-artwork-preview="${field}"] img`);
	currentImage?.scrollIntoView({ block: "center" });
	await afterCommittedEffects();
	await waitForCondition(() => {
		const image = document.querySelector(`[data-artwork-preview="${field}"] img`);
		return image?.getAttribute("src") === expectedUrl && image.complete && image.naturalWidth > 0;
	});
}

async function measureCollectionSettingsLayout() {
	const beforeProject = JSON.stringify(controller.getState().project);
	const beforeSerialized = JSON.stringify(controller.serializeProject().value);
	const beforeRevision = controller.getState().revision;
	await openCollectionSettings();
	const alternateDisplay = [384, 402, 412, 900, 1280].includes(window.innerWidth);
	if (alternateDisplay) {
		document.querySelector('[data-editor-control="hideNuvioTitle"]').click();
		document.querySelector('[data-editor-choice="rows"]').click();
		await afterCommittedEffects();
	}
	const value = document.querySelector('[data-editor-field="backdropImageUrl"] input').value;
	await waitForPreview("backdropImageUrl", value);
	const editor = document.querySelector('[data-node-editor="collection"]');
	const field = editor.querySelector('[data-editor-field="backdropImageUrl"]');
	const input = field.querySelector("input");
	const frame = field.querySelector('[data-artwork-preview="backdropImageUrl"]');
	const image = frame.querySelector("img");
	const copyRect = field.querySelector(".folder-artwork-field-copy").getBoundingClientRect();
	const frameRect = frame.getBoundingClientRect();
	const actionRow = editor.querySelector(".node-editor-actions");
	editor.scrollTop = editor.scrollHeight;
	await afterCommittedEffects();
	const actionsRect = actionRow.getBoundingClientRect();
	const result = {
		width: window.innerWidth,
		sectionNames: [...editor.querySelectorAll(".editor-settings-section > h3")].map((heading) => heading.textContent.trim()),
		label: field.querySelector("label").textContent.trim(),
		helper: field.querySelector(".editor-field-help").textContent.trim(),
		inputValue: input.value,
		inputWidth: Math.round(input.getBoundingClientRect().width),
		previewWidth: Math.round(frameRect.width),
		previewRatio: Math.round((frameRect.width / frameRect.height) * 100) / 100,
		previewInsideViewport: frameRect.left >= -1 && frameRect.right <= window.innerWidth + 1,
		copyAndPreviewDoNotOverlap: copyRect.right <= frameRect.left + 1 || frameRect.right <= copyRect.left + 1 || copyRect.bottom <= frameRect.top + 1 || frameRect.bottom <= copyRect.top + 1,
		imageAttributes: {
			src: image.getAttribute("src"),
			alt: image.getAttribute("alt"),
			loading: image.getAttribute("loading"),
			decoding: image.getAttribute("decoding"),
			referrerPolicy: image.getAttribute("referrerpolicy"),
			draggable: image.getAttribute("draggable"),
			tabIndex: image.tabIndex,
		},
		titleHidden: document.querySelector('[data-editor-control="hideNuvioTitle"]').checked,
		rowsSelected: document.querySelector('[data-editor-choice="rows"]').checked,
		tabsSelected: document.querySelector('[data-editor-choice="tabs"]').checked,
		focusGlowAbsent: editor.querySelector('[data-editor-field="focusGlowEnabled"], [data-editor-control="focusGlowEnabled"]') === null,
		collectionCardThumbnailAbsent: document.querySelector('[data-hierarchy-card="collection"] img') === null,
		onlyEditorScrolls: [...document.querySelectorAll('[data-settings-modal="true"], [data-settings-modal="true"] *')].filter((element) => {
			const style = getComputedStyle(element);
			return ["auto", "scroll"].includes(style.overflowY) && element.scrollHeight > element.clientHeight + 1;
		}).every((element) => element === editor),
		bodyLocked: getComputedStyle(document.body).overflow === "hidden",
		noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
		actionsInsideViewport: actionsRect.left >= -1 && actionsRect.right <= window.innerWidth + 1 && actionsRect.bottom <= window.innerHeight + 1,
	};
	await cancelCollectionSettings();
	return {
		...result,
		projectUnchanged: JSON.stringify(controller.getState().project) === beforeProject,
		serializedUnchanged: JSON.stringify(controller.serializeProject().value) === beforeSerialized,
		revisionUnchanged: controller.getState().revision === beforeRevision,
	};
}

async function exerciseCollectionBackdropDraftPreviews() {
	const beforeProject = JSON.stringify(controller.getState().project);
	const beforeSerialized = JSON.stringify(controller.serializeProject().value);
	const beforeRevision = controller.getState().revision;
	const savedUrl = collection.editable.backdropImageUrl;
	const staticUrl = `${ARTWORK_BASE_URL}/collection-static.jpg`;
	const gifUrl = `${ARTWORK_BASE_URL}/collection-draft.gif`;
	const brokenUrl = `${ARTWORK_BASE_URL}/collection-broken.gif`;
	const recoveringUrl = `${ARTWORK_BASE_URL}/collection-recovering.gif`;
	const replacementUrl = `${ARTWORK_BASE_URL}/collection-replacement.gif`;
	const longUrl = `${ARTWORK_BASE_URL}/collection-long.gif?value=${"x".repeat(500)}`;
	await openCollectionSettings();

	await setEditorField("backdropImageUrl", "");
	const blank = {
		input: document.querySelector('[data-editor-field="backdropImageUrl"] input').value,
		previewAbsent: document.querySelector('[data-artwork-preview="backdropImageUrl"]') === null,
		statusAbsent: document.querySelector('[data-editor-field="backdropImageUrl"] .folder-artwork-preview-status') === null,
		fetchCallCount: fetchCalls.length,
	};
	await setEditorField("backdropImageUrl", staticUrl);
	await waitForPreview("backdropImageUrl", staticUrl);
	const staticImage = document.querySelector('[data-artwork-preview="backdropImageUrl"] img').getAttribute("src");
	await setEditorField("backdropImageUrl", gifUrl);
	await waitForPreview("backdropImageUrl", gifUrl);
	const gifImage = document.querySelector('[data-artwork-preview="backdropImageUrl"] img').getAttribute("src");
	await setEditorField("backdropImageUrl", brokenUrl);
	await waitForCondition(() => document.querySelector('[data-editor-field="backdropImageUrl"] .folder-artwork-preview-status')?.textContent.trim() === "Preview unavailable");
	const broken = {
		input: document.querySelector('[data-editor-field="backdropImageUrl"] input').value,
		status: document.querySelector('[data-editor-field="backdropImageUrl"] .folder-artwork-preview-status').textContent.trim(),
		previewAbsent: document.querySelector('[data-artwork-preview="backdropImageUrl"]') === null,
	};
	await setEditorField("backdropImageUrl", recoveringUrl);
	await waitForCondition(() => document.querySelector('[data-editor-field="backdropImageUrl"] .folder-artwork-preview-status')?.textContent.trim() === "Preview unavailable");
	const firstFailure = {
		input: document.querySelector('[data-editor-field="backdropImageUrl"] input').value,
		status: document.querySelector('[data-editor-field="backdropImageUrl"] .folder-artwork-preview-status').textContent.trim(),
	};
	await setEditorField("backdropImageUrl", replacementUrl);
	await waitForPreview("backdropImageUrl", replacementUrl);
	const replacement = {
		src: document.querySelector('[data-artwork-preview="backdropImageUrl"] img').getAttribute("src"),
		statusAbsent: document.querySelector('[data-editor-field="backdropImageUrl"] .folder-artwork-preview-status') === null,
	};
	await setEditorField("backdropImageUrl", recoveringUrl);
	await waitForPreview("backdropImageUrl", recoveringUrl);
	const recovered = {
		src: document.querySelector('[data-artwork-preview="backdropImageUrl"] img').getAttribute("src"),
		statusAbsent: document.querySelector('[data-editor-field="backdropImageUrl"] .folder-artwork-preview-status') === null,
	};
	await setEditorField("backdropImageUrl", longUrl);
	await waitForPreview("backdropImageUrl", longUrl);
	const long = {
		exact: document.querySelector('[data-artwork-preview="backdropImageUrl"] img').getAttribute("src") === longUrl,
		noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
	};
	await cancelCollectionSettings();
	await openCollectionSettings();
	const cancelRestoredSavedInput = document.querySelector('[data-editor-field="backdropImageUrl"] input').value === savedUrl;
	await cancelCollectionSettings();

	return {
		savedUrl,
		blank,
		staticImage,
		gifImage,
		broken,
		firstFailure,
		replacement,
		recovered,
		long,
		cancelRestoredSavedInput,
		projectUnchanged: JSON.stringify(controller.getState().project) === beforeProject,
		serializedUnchanged: JSON.stringify(controller.serializeProject().value) === beforeSerialized,
		revisionUnchanged: controller.getState().revision === beforeRevision,
	};
}

async function exerciseCollectionBackdropApply() {
	await openCollectionSettings();
	const beforeRevision = controller.getState().revision;
	const appliedUrl = `${ARTWORK_BASE_URL}/collection-applied.gif`;
	await setEditorField("backdropImageUrl", appliedUrl);
	document.querySelector('[data-action="apply-node-edit"]').click();
	await afterCommittedEffects();
	await waitForCondition(() => document.querySelector('[data-node-editor="collection"]') === null);
	const current = controller.getState().project.collections[0];
	const serialized = controller.serializeProject().value[0];
	return {
		appliedUrl,
		oneRevision: controller.getState().revision === beforeRevision + 1,
		editableValue: current.editable.backdropImageUrl,
		serializedValue: serialized.backdropImageUrl,
		rawValueUnchanged: current.rawImported.backdropImageUrl === `${ARTWORK_BASE_URL}/collection-saved.gif`,
		unknownPreserved: JSON.stringify(serialized.unknownCollection) === JSON.stringify({ keep: "mounted-sentinel" }),
	};
}

async function exerciseCollectionBackdropUnrelatedApply() {
	const savedUrl = controller.getState().project.collections[0].editable.backdropImageUrl;
	await openCollectionSettings();
	const beforeRevision = controller.getState().revision;
	document.querySelector('[data-editor-control="pinToTop"]').click();
	await afterCommittedEffects();
	document.querySelector('[data-action="apply-node-edit"]').click();
	await afterCommittedEffects();
	await waitForCondition(() => document.querySelector('[data-node-editor="collection"]') === null);
	const current = controller.getState().project.collections[0];
	const serialized = controller.serializeProject().value[0];
	return {
		oneRevision: controller.getState().revision === beforeRevision + 1,
		backdropEditableUnchanged: current.editable.backdropImageUrl === savedUrl,
		backdropSerializedUnchanged: serialized.backdropImageUrl === savedUrl,
		unknownPreserved: JSON.stringify(serialized.unknownCollection) === JSON.stringify({ keep: "mounted-sentinel" }),
	};
}

async function measureSettingsLayout(title = "Settings preview") {
	const beforeProject = JSON.stringify(controller.getState().project);
	const beforeSerialized = JSON.stringify(controller.serializeProject().value);
	const beforeRevision = controller.getState().revision;
	await openFolderSettings(title);
	for (const field of ["coverImageUrl", "heroBackdropUrl", "titleLogoUrl", "focusGifUrl"]) {
		const value = document.querySelector(`[data-editor-field="${field}"] input`)?.value;
		if (value?.trim()) await waitForPreview(field, value);
	}
	const editor = document.querySelector('[data-node-editor="folder"]');
	const images = [...editor.querySelectorAll(".folder-artwork-preview-image")];
	const frames = [...editor.querySelectorAll(".folder-artwork-preview-frame")];
	const imageFields = [...editor.querySelectorAll(".folder-artwork-url-field.has-preview:not(.folder-artwork-video-field)")];
	const artworkSection = editor.querySelector('[data-settings-section="artwork"]');
	const helpers = [...artworkSection.querySelectorAll(".folder-artwork-url-field .editor-field-help")];
	const focusSwitch = artworkSection.querySelector(".folder-focus-enabled-field .editor-switch");
	const focusSwitchInput = focusSwitch.querySelector('input[role="switch"]');
	const focusSwitchControl = focusSwitch.querySelector(".editor-switch-control");
	const focusSwitchCopy = focusSwitch.querySelector(":scope > span:first-child");
	const focusSwitchDescription = focusSwitchCopy.querySelector("small");
	const focusSwitchWrapper = focusSwitch.closest(".editor-switch-field");
	const actionRow = editor.querySelector(".node-editor-actions");
	editor.scrollTop = editor.scrollHeight;
	await afterCommittedEffects();
	const actionsRect = actionRow.getBoundingClientRect();
	const focusSwitchRect = focusSwitch.getBoundingClientRect();
	const focusSwitchCopyRect = focusSwitchCopy.getBoundingClientRect();
	const focusSwitchControlRect = focusSwitchControl.getBoundingClientRect();
	const focusSwitchWrapperRect = focusSwitchWrapper.getBoundingClientRect();
	const result = {
		width: window.innerWidth,
		groupCount: editor.querySelectorAll(".folder-artwork-group").length,
		groupNames: [...editor.querySelectorAll(".folder-artwork-group h4")].map((heading) => heading.textContent.trim()),
		imageCount: images.length,
		noVideoOnOpen: editor.querySelector("video") === null,
		videoFieldPresent: editor.querySelector('[data-editor-field="heroVideoUrl"]') !== null,
		videoButtonText: editor.querySelector(".folder-artwork-preview-button")?.textContent.trim() ?? null,
		videoButtonStyled: editor.querySelector(".folder-artwork-preview-button")?.classList.contains("secondary-action") === true,
		coverEmojiEditorAbsent: editor.querySelector('[data-editor-field="coverEmoji"]') === null,
		inputValues: Object.fromEntries(["coverImageUrl", "heroBackdropUrl", "heroVideoUrl", "titleLogoUrl", "focusGifUrl"].map((field) => [
			field,
			editor.querySelector(`[data-editor-field="${field}"] input`)?.value ?? null,
		])),
		helperTexts: helpers.map((helper) => helper.textContent.trim()),
		helperLineCounts: helpers.map((helper) => Math.round(helper.getBoundingClientRect().height / Number.parseFloat(getComputedStyle(helper).lineHeight))),
		artworkSectionHeight: Math.round(artworkSection.getBoundingClientRect().height),
		heroGroupHeight: Math.round(editor.querySelector('[data-artwork-group="hero-background"]').getBoundingClientRect().height),
		heroFieldCount: editor.querySelectorAll('[data-artwork-group="hero-background"] [data-editor-field]').length,
		widePreviewWidths: {
			backdrop: Math.round(editor.querySelector('[data-artwork-preview="heroBackdropUrl"]').getBoundingClientRect().width),
			logo: Math.round(editor.querySelector('[data-artwork-preview="titleLogoUrl"]').getBoundingClientRect().width),
		},
		focusSwitch: {
			width: Math.round(focusSwitchRect.width),
			height: Math.round(focusSwitchRect.height),
			backgroundColor: getComputedStyle(focusSwitch).backgroundColor,
			borderTopWidth: getComputedStyle(focusSwitch).borderTopWidth,
			controlWidth: Math.round(focusSwitchControlRect.width),
			controlHeight: Math.round(focusSwitchControlRect.height),
			copyControlGap: Math.round(focusSwitchControlRect.left - focusSwitchCopyRect.right),
			fillsAvailableWidth: Math.abs(focusSwitchRect.width - focusSwitchWrapperRect.width) <= 1,
			copyDoesNotOverlapControl: focusSwitchCopyRect.right <= focusSwitchControlRect.left,
			controlInsideSwitch: focusSwitchControlRect.left >= focusSwitchRect.left && focusSwitchControlRect.right <= focusSwitchRect.right,
			descriptionLines: Math.round(focusSwitchDescription.getBoundingClientRect().height / Number.parseFloat(getComputedStyle(focusSwitchDescription).lineHeight)),
			checked: focusSwitchInput.checked,
		},
		imageAttributesSafe: images.every((image) => (
			image.getAttribute("alt") === ""
			&& image.getAttribute("loading") === "lazy"
			&& image.getAttribute("decoding") === "async"
			&& image.getAttribute("referrerpolicy") === "no-referrer"
			&& image.tabIndex === -1
		)),
		previewUrlsExact: images.every((image) => image.getAttribute("src") === editor.querySelector(`[data-editor-field="${image.closest("[data-artwork-preview]").dataset.artworkPreview}"] input`).value),
		framesInsideViewport: frames.every((frame) => {
			const rect = frame.getBoundingClientRect();
			return rect.left >= -1 && rect.right <= window.innerWidth + 1 && rect.width <= window.innerWidth;
		}),
		fieldsDoNotOverlap: imageFields.every((field) => {
			const copy = field.querySelector(".folder-artwork-field-copy").getBoundingClientRect();
			const frame = field.querySelector(".folder-artwork-preview-frame").getBoundingClientRect();
			return copy.right <= frame.left + 1 || frame.right <= copy.left + 1 || copy.bottom <= frame.top + 1 || frame.bottom <= copy.top + 1;
		}),
		inputsRemainUsable: imageFields.every((field) => field.querySelector("input").getBoundingClientRect().width >= 180),
		tileRatio: (() => {
			const rect = editor.querySelector('[data-artwork-preview="coverImageUrl"]').getBoundingClientRect();
			return Math.round((rect.width / rect.height) * 100) / 100;
		})(),
		focusRatio: (() => {
			const rect = editor.querySelector('[data-artwork-preview="focusGifUrl"]').getBoundingClientRect();
			return Math.round((rect.width / rect.height) * 100) / 100;
		})(),
		backdropRatio: (() => {
			const rect = editor.querySelector('[data-artwork-preview="heroBackdropUrl"]').getBoundingClientRect();
			return Math.round((rect.width / rect.height) * 100) / 100;
		})(),
		logoObjectFit: getComputedStyle(editor.querySelector('[data-artwork-preview="titleLogoUrl"] img')).objectFit,
		onlyEditorScrolls: [...document.querySelectorAll('[data-settings-modal="true"], [data-settings-modal="true"] *')].filter((element) => {
			const style = getComputedStyle(element);
			return ["auto", "scroll"].includes(style.overflowY) && element.scrollHeight > element.clientHeight + 1;
		}).every((element) => element === editor),
		bodyLocked: getComputedStyle(document.body).overflow === "hidden",
		noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
		actionsInsideViewport: actionsRect.left >= -1 && actionsRect.right <= window.innerWidth + 1 && actionsRect.bottom <= window.innerHeight + 1,
	};
	await cancelFolderSettings();
	return {
		...result,
		projectUnchanged: JSON.stringify(controller.getState().project) === beforeProject,
		serializedUnchanged: JSON.stringify(controller.serializeProject().value) === beforeSerialized,
		revisionUnchanged: controller.getState().revision === beforeRevision,
	};
}

async function exerciseSettingsDraftPreviews() {
	const folder = foldersById["settings-preview"];
	const beforeProject = JSON.stringify(controller.getState().project);
	const beforeSerialized = JSON.stringify(controller.serializeProject().value);
	const beforeRevision = controller.getState().revision;
	const savedTileUrl = folder.editable.coverImageUrl;
	const recoveringUrl = `${ARTWORK_BASE_URL}/preview-recovering.gif`;
	const replacementUrl = `${ARTWORK_BASE_URL}/preview-replacement.gif`;
	await openFolderSettings();

	await setEditorField("coverImageUrl", recoveringUrl);
	await waitForCondition(() => document.querySelector('[data-editor-field="coverImageUrl"] .folder-artwork-preview-status')?.textContent.trim() === "Preview unavailable");
	const firstFailure = {
		status: document.querySelector('[data-editor-field="coverImageUrl"] .folder-artwork-preview-status')?.textContent.trim(),
		input: document.querySelector('[data-editor-field="coverImageUrl"] input').value,
		imageAbsent: document.querySelector('[data-artwork-preview="coverImageUrl"] img') === null,
	};
	await setEditorField("coverImageUrl", replacementUrl);
	await waitForPreview("coverImageUrl", replacementUrl);
	const replacement = {
		statusAbsent: document.querySelector('[data-editor-field="coverImageUrl"] .folder-artwork-preview-status') === null,
		src: document.querySelector('[data-artwork-preview="coverImageUrl"] img').getAttribute("src"),
	};
	await setEditorField("coverImageUrl", recoveringUrl);
	await waitForPreview("coverImageUrl", recoveringUrl);
	const recovered = {
		statusAbsent: document.querySelector('[data-editor-field="coverImageUrl"] .folder-artwork-preview-status') === null,
		src: document.querySelector('[data-artwork-preview="coverImageUrl"] img').getAttribute("src"),
	};

	const videoUrl = document.querySelector('[data-editor-field="heroVideoUrl"] input').value;
	const noVideoBeforeClick = document.querySelector("video") === null;
	document.querySelector(".folder-artwork-preview-button").click();
	await afterCommittedEffects();
	const video = document.querySelector("video");
	const videoAttributes = {
		src: video?.getAttribute("src"),
		controls: video?.controls,
		playsInline: video?.playsInline,
		preload: video?.preload,
		referrerPolicy: video?.getAttribute("referrerpolicy"),
		autoplay: video?.autoplay,
		paused: video?.paused,
	};
	await waitForCondition(() => document.querySelector('[data-editor-field="heroVideoUrl"] .folder-artwork-preview-status')?.textContent.trim() === "Preview unavailable");
	const videoFailure = {
		status: document.querySelector('[data-editor-field="heroVideoUrl"] .folder-artwork-preview-status')?.textContent.trim(),
		input: document.querySelector('[data-editor-field="heroVideoUrl"] input').value,
		videoAbsent: document.querySelector("video") === null,
		retryAvailable: document.querySelector(".folder-artwork-preview-button")?.textContent.trim() === "Preview video",
	};
	document.querySelector(".folder-artwork-preview-button").click();
	await afterCommittedEffects();
	await setEditorField("heroVideoUrl", `${ARTWORK_BASE_URL}/video-b.mp4`);
	const videoResetOnUrlChange = {
		statusAbsent: document.querySelector('[data-editor-field="heroVideoUrl"] .folder-artwork-preview-status') === null,
		videoAbsent: document.querySelector("video") === null,
	};
	const draftCardStillSaved = folderCard("Settings preview").querySelector("img.folder-card-thumbnail")?.getAttribute("src") === savedTileUrl;
	await cancelFolderSettings();
	await openFolderSettings();
	const cancelRestoredSavedInputs = (
		document.querySelector('[data-editor-field="coverImageUrl"] input').value === savedTileUrl
		&& document.querySelector('[data-editor-field="heroVideoUrl"] input').value === videoUrl
	);
	await cancelFolderSettings();

	return {
		firstFailure,
		replacement,
		recovered,
		noVideoBeforeClick,
		videoAttributes,
		videoFailure,
		videoResetOnUrlChange,
		draftCardStillSaved,
		cancelRestoredSavedInputs,
		projectUnchanged: JSON.stringify(controller.getState().project) === beforeProject,
		serializedUnchanged: JSON.stringify(controller.serializeProject().value) === beforeSerialized,
		revisionUnchanged: controller.getState().revision === beforeRevision,
	};
}

async function exerciseSettingsApply() {
	const folder = foldersById["settings-preview"];
	await openFolderSettings();
	const beforeRevision = controller.getState().revision;
	const appliedTileUrl = `${ARTWORK_BASE_URL}/settings-tile-applied.gif`;
	const untouchedBackdrop = folder.editable.heroBackdropUrl;
	const untouchedFocus = folder.editable.focusGifUrl;
	await setEditorField("coverImageUrl", appliedTileUrl);
	await setEditorField("heroVideoUrl", "");
	const videoControlRemainsAfterClear = document.querySelector('[data-editor-field="heroVideoUrl"]') !== null;
	const videoPreviewActionAbsentAfterClear = document.querySelector(".folder-artwork-preview-button") === null;
	await setEditorField("titleLogoUrl", "");
	document.querySelector('[data-action="apply-node-edit"]').click();
	await afterCommittedEffects();
	await waitForCondition(() => document.querySelector('[data-node-editor="folder"]') === null);
	await waitForCondition(() => folderCard("Settings preview")?.querySelector("img.folder-card-thumbnail")?.getAttribute("src") === appliedTileUrl);
	const current = controller.getState().project.collections[0].folders.find((entry) => entry.internalId === folder.internalId);
	const serialized = controller.serializeProject().value[0].folders.find((entry) => entry.id === "settings-preview");
	await openFolderSettings("Settings preview");
	const videoControlHiddenAfterReopen = document.querySelector('[data-editor-field="heroVideoUrl"]') === null;
	await cancelFolderSettings();
	return {
		oneRevision: controller.getState().revision === beforeRevision + 1,
		videoControlRemainsAfterClear,
		videoPreviewActionAbsentAfterClear,
		videoControlHiddenAfterReopen,
		values: {
			coverImageUrl: current.editable.coverImageUrl,
			coverEmoji: current.editable.coverEmoji,
			heroVideoUrl: current.editable.heroVideoUrl,
			titleLogoUrl: current.editable.titleLogoUrl,
			heroBackdropUrl: current.editable.heroBackdropUrl,
			focusGifUrl: current.editable.focusGifUrl,
		},
		serializedValues: {
			coverImageUrl: serialized.coverImageUrl,
			coverEmoji: serialized.coverEmoji,
			heroVideoUrl: serialized.heroVideoUrl,
			titleLogoUrl: serialized.titleLogoUrl,
			heroBackdropUrl: serialized.heroBackdropUrl,
			focusGifUrl: serialized.focusGifUrl,
		},
		untouchedBackdrop,
		untouchedFocus,
		cardUsesAppliedUrl: folderCard("Settings preview").querySelector("img.folder-card-thumbnail")?.getAttribute("src") === appliedTileUrl,
	};
}

async function exerciseOrdinaryVideoVisibility() {
	const cases = [
		{ id: "settings-no-video", title: "Settings without video", expected: "absent" },
		{ id: "settings-blank-video", title: "Settings with blank video", expected: "   " },
		{ id: "settings-unsupported-video", title: "Settings with unsupported video", expected: ["RAW_VIDEO"] },
	];
	const results = [];
	for (const fixture of cases) {
		const beforeRevision = controller.getState().revision;
		await openFolderSettings(fixture.title);
		const hiddenOnOpen = document.querySelector('[data-editor-field="heroVideoUrl"]') === null
			&& document.querySelector(".folder-artwork-preview-button") === null
			&& document.querySelector("video") === null;
		const focusSwitch = document.querySelector('[data-editor-field="focusGifEnabled"] input');
		focusSwitch.click();
		await afterCommittedEffects();
		document.querySelector('[data-action="apply-node-edit"]').click();
		await afterCommittedEffects();
		await waitForCondition(() => document.querySelector('[data-node-editor="folder"]') === null);
		const current = controller.getState().project.collections[0].folders.find((entry) => entry.editable.id === fixture.id);
		const serialized = controller.serializeProject().value[0].folders.find((entry) => entry.id === fixture.id);
		results.push({
			id: fixture.id,
			hiddenOnOpen,
			oneRevision: controller.getState().revision === beforeRevision + 1,
			editableHasVideo: Object.hasOwn(current.editable, "heroVideoUrl"),
			editableVideo: current.editable.heroVideoUrl ?? null,
			serializedHasVideo: Object.hasOwn(serialized, "heroVideoUrl"),
			serializedVideo: serialized.heroVideoUrl ?? null,
		});
	}
	return results;
}

async function exerciseVideoCancel() {
	const folder = foldersById["video-cancel"];
	const savedUrl = folder.editable.heroVideoUrl;
	const beforeProject = JSON.stringify(controller.getState().project);
	const beforeSerialized = JSON.stringify(controller.serializeProject().value);
	const beforeRevision = controller.getState().revision;
	await openFolderSettings("Existing video to cancel");
	await setEditorField("heroVideoUrl", "");
	const visibleAfterClear = document.querySelector('[data-editor-field="heroVideoUrl"]') !== null;
	await cancelFolderSettings();
	await openFolderSettings("Existing video to cancel");
	const reopened = {
		visible: document.querySelector('[data-editor-field="heroVideoUrl"]') !== null,
		value: document.querySelector('[data-editor-field="heroVideoUrl"] input')?.value,
		previewAction: document.querySelector(".folder-artwork-preview-button")?.textContent.trim(),
	};
	await cancelFolderSettings();
	return {
		visibleAfterClear,
		reopened,
		projectUnchanged: JSON.stringify(controller.getState().project) === beforeProject,
		serializedUnchanged: JSON.stringify(controller.serializeProject().value) === beforeSerialized,
		revisionUnchanged: controller.getState().revision === beforeRevision,
		savedUrl,
	};
}

async function exerciseVideoReplacement() {
	const replacementUrl = `${ARTWORK_BASE_URL}/video-b.mp4`;
	await openFolderSettings("Existing video to replace");
	document.querySelector(".folder-artwork-preview-button").click();
	await afterCommittedEffects();
	const originalPreviewUrl = document.querySelector("video")?.getAttribute("src");
	await setEditorField("heroVideoUrl", replacementUrl);
	const resetOnReplacement = {
		fieldVisible: document.querySelector('[data-editor-field="heroVideoUrl"]') !== null,
		videoAbsent: document.querySelector("video") === null,
		statusAbsent: document.querySelector('[data-editor-field="heroVideoUrl"] .folder-artwork-preview-status') === null,
	};
	document.querySelector(".folder-artwork-preview-button").click();
	await afterCommittedEffects();
	const replacementPreview = document.querySelector("video");
	const replacementPreviewState = {
		src: replacementPreview?.getAttribute("src"),
		controls: replacementPreview?.controls,
		playsInline: replacementPreview?.playsInline,
		preload: replacementPreview?.preload,
		autoplay: replacementPreview?.autoplay,
	};
	const beforeRevision = controller.getState().revision;
	document.querySelector('[data-action="apply-node-edit"]').click();
	await afterCommittedEffects();
	await waitForCondition(() => document.querySelector('[data-node-editor="folder"]') === null);
	const serialized = controller.serializeProject().value[0].folders.find((entry) => entry.id === "video-replace");
	await openFolderSettings("Existing video to replace");
	const reopened = {
		visible: document.querySelector('[data-editor-field="heroVideoUrl"]') !== null,
		value: document.querySelector('[data-editor-field="heroVideoUrl"] input')?.value,
	};
	await cancelFolderSettings();
	return {
		originalPreviewUrl,
		replacementUrl,
		resetOnReplacement,
		replacementPreviewState,
		oneRevision: controller.getState().revision === beforeRevision + 1,
		serializedVideo: serialized.heroVideoUrl,
		reopened,
	};
}

async function measureLayout() {
	await selectCollection();
	const poster = folderCard("Poster artwork");
	const landscape = folderCard("Landscape artwork");
	const noArtwork = folderCard("No artwork");
	const blank = folderCard("Blank artwork");
	const broken = folderCard("Broken artwork");
	const unknown = folderCard("Unsupported shape");
	const hidden = folderCard("Hidden title");
	const longTitle = folderCard("A deliberately long Folder title that must remain readable beside assigned Landscape artwork");
	const posterImage = poster.querySelector("img");
	const landscapeImage = landscape.querySelector("img");
	const unknownImage = unknown.querySelector("img");
	const allImages = [...document.querySelectorAll('[data-hierarchy-card="folder"] img.folder-card-thumbnail')];

	controller.selectNode(foldersById.poster.internalId);
	await afterCommittedEffects();
	const selectedState = {
		cardSelected: folderCard("Poster artwork").classList.contains("is-selected"),
		buttonPressed: folderCard("Poster artwork").querySelector(".node-button")?.getAttribute("aria-pressed"),
	};
	await selectCollection();

	const panelWidths = Object.fromEntries(["collections", "folders", "sources"].map((panel) => [
		panel,
		roundedRect(document.querySelector(`[data-panel="${panel}"]`)).width,
	]));
	const noArtworkHeight = roundedRect(noArtwork).height;
	const artworkHeights = [poster, landscape, unknown].map((card) => roundedRect(card).height);
	const folderPanel = document.querySelector('[data-panel="folders"]');

	return {
		width: window.innerWidth,
		folderPanelVisible: getComputedStyle(folderPanel).display !== "none",
		panelWidths,
		poster: {
			frame: roundedRect(poster.querySelector(".folder-card-thumbnail-frame")),
			attributes: {
				alt: posterImage.getAttribute("alt"),
				loading: posterImage.getAttribute("loading"),
				decoding: posterImage.getAttribute("decoding"),
				referrerPolicy: posterImage.getAttribute("referrerpolicy"),
				draggable: posterImage.getAttribute("draggable"),
			},
		},
		landscape: { frame: roundedRect(landscape.querySelector(".folder-card-thumbnail-frame")) },
		unknown: {
			frame: roundedRect(unknown.querySelector(".folder-card-thumbnail-frame")),
			objectFit: getComputedStyle(unknownImage).objectFit,
		},
		textFallbacks: {
			noArtworkHasFrame: noArtwork.querySelector(".folder-card-thumbnail-frame") !== null,
			blankHasFrame: blank.querySelector(".folder-card-thumbnail-frame") !== null,
			brokenHasFrame: broken.querySelector(".folder-card-thumbnail-frame") !== null,
			brokenTextDirect: broken.querySelector(":scope .node-button-content > .node-title")?.textContent.trim() === "Broken artwork",
		},
		selectedState,
		hiddenAccessibleName: hidden.querySelector(".node-button")?.getAttribute("aria-label"),
		imageCount: allImages.length,
		allImagesLazy: allImages.every((image) => image.getAttribute("loading") === "lazy"),
		allImagesAsync: allImages.every((image) => image.getAttribute("decoding") === "async"),
		allImagesDecorative: allImages.every((image) => image.getAttribute("alt") === ""),
		allImagesNonDraggable: allImages.every((image) => image.getAttribute("draggable") === "false"),
		cardHeights: {
			noArtwork: noArtworkHeight,
			poster: roundedRect(poster).height,
			landscape: roundedRect(landscape).height,
			unknown: roundedRect(unknown).height,
		},
		cardHeightGrowth: Math.max(...artworkHeights) - noArtworkHeight,
		longTitleHeight: roundedRect(longTitle).height,
		longTitleWidth: roundedRect(longTitle.querySelector(".folder-card-copy")).width,
		noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
		projectUnchanged: JSON.stringify(controller.getState().project) === projectBefore,
		serializedUnchanged: JSON.stringify(controller.serializeProject().value) === serializedBefore,
		revisionUnchanged: controller.getState().revision === revisionBefore,
		fetchCallCount: fetchCalls.length,
	};
}

function preservationState() {
	return {
		brokenUrl: foldersById.broken.editable.coverImageUrl,
		blankUrl: foldersById.blank.editable.coverImageUrl,
		absentHasField: Object.hasOwn(foldersById.none.editable, "coverImageUrl"),
		unsupportedShape: foldersById.unknown.editable.tileShape,
		projectUnchanged: JSON.stringify(controller.getState().project) === projectBefore,
		serializedUnchanged: JSON.stringify(controller.serializeProject().value) === serializedBefore,
		revisionUnchanged: controller.getState().revision === revisionBefore,
	};
}

async function exerciseFailureReplacement() {
	await selectCollection();
	const folder = foldersById["failure-replacement"];
	const cardBefore = folderCard("Failed artwork replacement");
	const initialProject = JSON.stringify(controller.getState().project);
	const initialSerialized = JSON.stringify(controller.serializeProject().value);
	const initialRevision = controller.getState().revision;
	const initialUrl = folder.editable.coverImageUrl;
	const initialFailureUsedTextFallback = cardBefore.querySelector(".folder-card-thumbnail-frame") === null;
	const updateResult = controller.updateNode(folder.internalId, {
		coverImageUrl: `${ARTWORK_BASE_URL}/replacement.gif`,
	});
	await afterCommittedEffects();
	await waitForCondition(() => {
		const image = folderCard("Failed artwork replacement")?.querySelector("img.folder-card-thumbnail");
		return image?.complete === true && image.naturalWidth > 0;
	});
	const cardAfter = folderCard("Failed artwork replacement");
	const replacementImage = cardAfter.querySelector("img.folder-card-thumbnail");
	const replacementUrl = replacementImage.getAttribute("src");
	const replacementAttempted = replacementImage.complete;
	const replacementRendered = replacementImage.naturalWidth > 0;
	const replacementReferrerPolicy = replacementImage.getAttribute("referrerpolicy");
	const restoreResult = controller.updateNode(folder.internalId, { coverImageUrl: initialUrl });
	await afterCommittedEffects();
	await waitForCondition(() => {
		const image = folderCard("Failed artwork replacement")?.querySelector("img.folder-card-thumbnail");
		return image?.complete === true && image.naturalWidth > 0;
	});
	const restoredCard = folderCard("Failed artwork replacement");
	const restoredImage = restoredCard.querySelector("img.folder-card-thumbnail");

	return {
		initialUrl,
		initialFailureUsedTextFallback,
		failureDidNotMutateProject: initialProject === projectBefore,
		failureDidNotMutateSerialization: initialSerialized === serializedBefore,
		failureDidNotChangeRevision: initialRevision === revisionBefore,
		updateAccepted: updateResult.ok === true,
		replacementUrl,
		replacementAttempted,
		replacementRendered,
		replacementReferrerPolicy,
		reassignedOriginalUrl: restoredImage.getAttribute("src"),
		reassignedOriginalAttempted: restoreResult.ok === true && restoredImage.complete,
		reassignedOriginalRendered: restoredImage.naturalWidth > 0,
		reassignedOriginalReferrerPolicy: restoredImage.getAttribute("referrerpolicy"),
		folderCardRemainedMounted: cardAfter === cardBefore && restoredCard === cardBefore,
	};
}

async function waitForSuggestionState(expected, timeoutMs = 20_000) {
	await waitForCondition(() => (
		document.querySelector("[data-folder-artwork-suggestions]")?.dataset.folderArtworkSuggestions === expected
	), timeoutMs);
}

async function settleSuggestedImages(expectedCount) {
	const editor = document.querySelector('[data-node-editor="folder"]');
	const images = [...editor.querySelectorAll("[data-artwork-suggestion-preview] img")];
	if (images.length !== expectedCount) throw new Error(`Expected ${expectedCount} suggested images, found ${images.length}.`);
	for (const image of images) {
		image.scrollIntoView({ block: "center" });
		await afterCommittedEffects();
	}
	await waitForCondition(() => images.every((image) => image.complete && image.naturalWidth > 0), 20_000);
	return images;
}

async function inspectSuggestionFolder(title, expectedState, expectedImageCount) {
	const beforeProject = JSON.stringify(controller.getState().project);
	const beforeSerialized = JSON.stringify(controller.serializeProject().value);
	const beforeRevision = controller.getState().revision;
	await openFolderSettings(title);
	await waitForSuggestionState(expectedState);
	const editor = document.querySelector('[data-node-editor="folder"]');
	const images = expectedImageCount > 0 ? await settleSuggestedImages(expectedImageCount) : [];
	const suggestions = [...editor.querySelectorAll("[data-artwork-suggestion]")];
	const requests = [...editor.querySelectorAll("[data-artwork-request]")];
	const value = {
		title,
		state: editor.querySelector("[data-folder-artwork-suggestions]").dataset.folderArtworkSuggestions,
		fields: suggestions.map((entry) => entry.dataset.artworkSuggestion),
		actions: suggestions.map((entry) => ({
			field: entry.dataset.artworkSuggestion,
			text: entry.querySelector("button")?.textContent.trim(),
			ariaLabel: entry.querySelector("button")?.getAttribute("aria-label"),
			buttonType: entry.querySelector("button")?.type,
		})),
		requests: requests.map((entry) => ({
			field: entry.dataset.artworkRequest,
			text: entry.textContent.trim(),
			ariaLabel: entry.getAttribute("aria-label"),
			href: entry.getAttribute("href"),
			target: entry.getAttribute("target"),
			rel: entry.getAttribute("rel"),
		})),
		previewAttributes: images.map((image) => ({
			src: image.getAttribute("src"),
			alt: image.getAttribute("alt"),
			loading: image.getAttribute("loading"),
			decoding: image.getAttribute("decoding"),
			referrerPolicy: image.getAttribute("referrerpolicy"),
			draggable: image.getAttribute("draggable"),
		})),
		coverValue: editor.querySelector('[data-editor-field="coverImageUrl"] input').value,
		heroPreservedStatus: editor.querySelector('[data-editor-field="heroBackdropUrl"] .editor-field-status')?.textContent.trim() ?? null,
		focusEnabled: editor.querySelector('[data-editor-control="focusGifEnabled"]')?.checked,
		suggestionFailureAbsent: editor.querySelector(".folder-artwork-suggestion .folder-artwork-preview-status") === null,
	};
	await cancelFolderSettings();
	return {
		...value,
		projectUnchanged: JSON.stringify(controller.getState().project) === beforeProject,
		serializedUnchanged: JSON.stringify(controller.serializeProject().value) === beforeSerialized,
		revisionUnchanged: controller.getState().revision === beforeRevision,
	};
}

async function inspectSuggestionStates() {
	const cases = [
		["People — blank with curated artwork", "ready", 4],
		["People — existing custom artwork", "ready", 2],
		["Network — existing TMDB fallback", "ready", 0],
		["Genre — curated already assigned", "ready", 0],
		["Missing curated asset — requestable", "ready", 3],
		["Studio — supported orientation", "ready", 1],
		["Ambiguous — no action", "none", 0],
	];
	const result = [];
	for (const entry of cases) result.push(await inspectSuggestionFolder(...entry));
	return result;
}

async function measureSuggestionLayout(title = "People — blank with curated artwork") {
	const beforeProject = JSON.stringify(controller.getState().project);
	const beforeSerialized = JSON.stringify(controller.serializeProject().value);
	const beforeRevision = controller.getState().revision;
	await openFolderSettings(title);
	await waitForSuggestionState("ready");
	const images = await settleSuggestedImages(4);
	const editor = document.querySelector('[data-node-editor="folder"]');
	const suggestions = [...editor.querySelectorAll("[data-artwork-suggestion]")];
	const suggestionRects = suggestions.map((element) => element.getBoundingClientRect());
	const actionButtons = suggestions.map((element) => element.querySelector("button"));
	const focusSuggestion = editor.querySelector('[data-artwork-suggestion="focusGifUrl"]');
	const focusSwitch = editor.querySelector('[data-editor-field="focusGifEnabled"]');
	editor.scrollTop = editor.scrollHeight;
	await afterCommittedEffects();
	const actionRowRect = editor.querySelector(".node-editor-actions").getBoundingClientRect();
	const result = {
		width: window.innerWidth,
		suggestionCount: suggestions.length,
		compactPreviewWidths: images.map((image) => Math.round(image.closest(".folder-artwork-suggestion-frame").getBoundingClientRect().width)),
		insideViewport: suggestionRects.every((rect) => rect.left >= -1 && rect.right <= window.innerWidth + 1),
		actionTapTargets: actionButtons.every((button) => button.getBoundingClientRect().height >= 44),
		shortCopyOnly: suggestions.every((element) => !element.textContent.includes("https://")),
		focusSuggestionBeforeSwitch: Boolean(focusSuggestion && focusSwitch && (focusSuggestion.compareDocumentPosition(focusSwitch) & Node.DOCUMENT_POSITION_FOLLOWING)),
		onlyEditorScrolls: [...document.querySelectorAll('[data-settings-modal="true"], [data-settings-modal="true"] *')].filter((element) => {
			const style = getComputedStyle(element);
			return ["auto", "scroll"].includes(style.overflowY) && element.scrollHeight > element.clientHeight + 1;
		}).every((element) => element === editor),
		bodyLocked: getComputedStyle(document.body).overflow === "hidden",
		noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1 && editor.scrollWidth <= editor.clientWidth + 1,
		actionsInsideViewport: actionRowRect.left >= -1 && actionRowRect.right <= window.innerWidth + 1 && actionRowRect.bottom <= window.innerHeight + 1,
	};
	await cancelFolderSettings();
	return {
		...result,
		projectUnchanged: JSON.stringify(controller.getState().project) === beforeProject,
		serializedUnchanged: JSON.stringify(controller.serializeProject().value) === beforeSerialized,
		revisionUnchanged: controller.getState().revision === beforeRevision,
	};
}

async function exerciseSuggestionDraftContract() {
	const target = foldersById["suggestion-people-blank"];
	const beforeProject = JSON.stringify(controller.getState().project);
	const beforeSerialized = JSON.stringify(controller.serializeProject().value);
	const beforeRevision = controller.getState().revision;
	await openFolderSettings("People — blank with curated artwork");
	await waitForSuggestionState("ready");
	await settleSuggestedImages(4);
	const coverAction = document.querySelector('[data-artwork-suggestion="coverImageUrl"] button');
	const posterUrl = document.querySelector('[data-artwork-suggestion-preview="coverImageUrl"] img').getAttribute("src");
	coverAction.focus();
	coverAction.click();
	await afterCommittedEffects();
	const accepted = {
		input: document.querySelector('[data-editor-field="coverImageUrl"] input').value,
		assistanceAbsent: document.querySelector('[data-artwork-suggestion="coverImageUrl"], [data-artwork-request="coverImageUrl"]') === null,
		normalPreview: document.querySelector('[data-artwork-preview="coverImageUrl"] img')?.getAttribute("src"),
		projectUnchanged: JSON.stringify(controller.getState().project) === beforeProject,
		serializedUnchanged: JSON.stringify(controller.serializeProject().value) === beforeSerialized,
		revisionUnchanged: controller.getState().revision === beforeRevision,
	};
	await setEditorField("coverImageUrl", "");
	await waitForCondition(() => document.querySelector('[data-artwork-suggestion="coverImageUrl"] button'));
	const cleared = {
		inputBlank: document.querySelector('[data-editor-field="coverImageUrl"] input').value === "",
		actionText: document.querySelector('[data-artwork-suggestion="coverImageUrl"] button').textContent.trim(),
		candidateReturned: document.querySelector('[data-artwork-suggestion-preview="coverImageUrl"] img')?.getAttribute("src") === posterUrl,
	};
	document.querySelector('[data-editor-choice="landscape"]').click();
	await afterCommittedEffects();
	await waitForCondition(() => {
		const image = document.querySelector('[data-artwork-suggestion-preview="coverImageUrl"] img');
		return image && image.getAttribute("src") !== posterUrl;
	}, 20_000);
	const landscapeUrl = document.querySelector('[data-artwork-suggestion-preview="coverImageUrl"] img').getAttribute("src");
	const shapeChange = {
		landscapeSelected: document.querySelector('[data-editor-choice="landscape"]').checked,
		inputStillBlank: document.querySelector('[data-editor-field="coverImageUrl"] input').value === "",
		candidateChanged: landscapeUrl !== posterUrl,
		actionText: document.querySelector('[data-artwork-suggestion="coverImageUrl"] button').textContent.trim(),
	};
	await cancelFolderSettings();
	await openFolderSettings("People — blank with curated artwork");
	await waitForSuggestionState("ready");
	const cancel = {
		coverBlank: document.querySelector('[data-editor-field="coverImageUrl"] input').value === "",
		posterSelected: document.querySelector('[data-editor-choice="poster"]').checked,
		projectUnchanged: JSON.stringify(controller.getState().project) === beforeProject,
		serializedUnchanged: JSON.stringify(controller.serializeProject().value) === beforeSerialized,
		revisionUnchanged: controller.getState().revision === beforeRevision,
	};
	await settleSuggestedImages(4);
	const applyUrl = document.querySelector('[data-artwork-suggestion-preview="coverImageUrl"] img').getAttribute("src");
	document.querySelector('[data-artwork-suggestion="coverImageUrl"] button').click();
	await afterCommittedEffects();
	document.querySelector('[data-action="apply-node-edit"]').click();
	await afterCommittedEffects();
	const serializedFolder = controller.serializeProject().value[0].folders.find((entry) => entry.id === "suggestion-people-blank");
	const apply = {
		cover: serializedFolder.coverImageUrl,
		coverMatchesAccepted: serializedFolder.coverImageUrl === applyUrl,
		unknownPreserved: JSON.stringify(serializedFolder.unknownFolder) === JSON.stringify({ keep: "people-blank" }),
		titlePreserved: serializedFolder.title === "People — blank with curated artwork",
		revisionDelta: controller.getState().revision - beforeRevision,
		cardUpdated: folderCard("People — blank with curated artwork")?.querySelector("img.folder-card-thumbnail")?.getAttribute("src") === applyUrl,
		targetInternalIdPreserved: controller.getState().project.collections[0].folders.some((entry) => entry.internalId === target.internalId),
	};
	return { posterUrl, accepted, cleared, landscapeUrl, shapeChange, cancel, apply };
}

async function exerciseBlankOnlyTransitions() {
	const beforeProject = JSON.stringify(controller.getState().project);
	const beforeSerialized = JSON.stringify(controller.serializeProject().value);
	const beforeRevision = controller.getState().revision;
	await openFolderSettings("People — existing custom artwork");
	await waitForSuggestionState("ready");
	const editor = document.querySelector('[data-node-editor="folder"]');
	const originalUrl = editor.querySelector('[data-editor-field="coverImageUrl"] input').value;
	const opening = {
		coverAssistanceAbsent: editor.querySelector('[data-artwork-suggestion="coverImageUrl"], [data-artwork-request="coverImageUrl"]') === null,
		exactValue: originalUrl,
	};
	await setEditorField("coverImageUrl", "");
	await waitForCondition(() => editor.querySelector('[data-artwork-suggestion="coverImageUrl"] button'));
	const cleared = {
		actionText: editor.querySelector('[data-artwork-suggestion="coverImageUrl"] button').textContent.trim(),
		inputBlank: editor.querySelector('[data-editor-field="coverImageUrl"] input').value === "",
	};
	editor.querySelector('[data-artwork-suggestion="coverImageUrl"] button').click();
	await afterCommittedEffects();
	const acceptedUrl = editor.querySelector('[data-editor-field="coverImageUrl"] input').value;
	const accepted = {
		inputNonblank: acceptedUrl.length > 0,
		assistanceAbsent: editor.querySelector('[data-artwork-suggestion="coverImageUrl"], [data-artwork-request="coverImageUrl"]') === null,
	};
	await setEditorField("coverImageUrl", "");
	await waitForCondition(() => editor.querySelector('[data-artwork-suggestion="coverImageUrl"] button'));
	const clearedAgain = editor.querySelector('[data-artwork-suggestion="coverImageUrl"] button').textContent.trim();
	await cancelFolderSettings();
	return {
		opening,
		cleared,
		accepted,
		clearedAgain,
		projectUnchanged: JSON.stringify(controller.getState().project) === beforeProject,
		serializedUnchanged: JSON.stringify(controller.serializeProject().value) === beforeSerialized,
		revisionUnchanged: controller.getState().revision === beforeRevision,
	};
}

async function exerciseRequestContract() {
	const beforeProject = JSON.stringify(controller.getState().project);
	const beforeSerialized = JSON.stringify(controller.serializeProject().value);
	const beforeRevision = controller.getState().revision;
	await openFolderSettings("Missing curated asset — requestable");
	await waitForSuggestionState("ready");
	const editor = document.querySelector('[data-node-editor="folder"]');
	const request = editor.querySelector('[data-artwork-request="focusGifUrl"]');
	let clickObserved = false;
	const preventNavigation = (event) => {
		if (event.target.closest('[data-artwork-request="focusGifUrl"]')) {
			clickObserved = true;
			event.preventDefault();
		}
	};
	document.addEventListener("click", preventNavigation, { capture: true, once: true });
	request.click();
	await afterCommittedEffects();
	const result = {
		text: request.textContent.trim(),
		ariaLabel: request.getAttribute("aria-label"),
		href: request.getAttribute("href"),
		target: request.getAttribute("target"),
		rel: request.getAttribute("rel"),
		clickObserved,
		focusBlank: editor.querySelector('[data-editor-field="focusGifUrl"] input').value === "",
		projectUnchanged: JSON.stringify(controller.getState().project) === beforeProject,
		serializedUnchanged: JSON.stringify(controller.serializeProject().value) === beforeSerialized,
		revisionUnchanged: controller.getState().revision === beforeRevision,
	};
	await cancelFolderSettings();
	return result;
}

async function exerciseStudioOrientationContract() {
	await openFolderSettings("Studio — supported orientation");
	await waitForSuggestionState("ready");
	const editor = document.querySelector('[data-node-editor="folder"]');
	const landscapeAction = editor.querySelector('[data-artwork-suggestion="coverImageUrl"] button')?.textContent.trim();
	editor.querySelector('[data-editor-choice="poster"]').click();
	await afterCommittedEffects();
	const poster = {
		inputBlank: editor.querySelector('[data-editor-field="coverImageUrl"] input').value === "",
		assistanceAbsent: editor.querySelector('[data-artwork-suggestion="coverImageUrl"], [data-artwork-request="coverImageUrl"]') === null,
	};
	editor.querySelector('[data-editor-choice="landscape"]').click();
	await afterCommittedEffects();
	const landscapeReturned = editor.querySelector('[data-artwork-suggestion="coverImageUrl"] button')?.textContent.trim();
	await cancelFolderSettings();
	return { landscapeAction, poster, landscapeReturned };
}

async function chooseTileShape(shape) {
	const choice = document.querySelector(`[data-editor-choice="${shape.toLowerCase()}"]`);
	choice.click();
	await afterCommittedEffects();
}

async function exerciseShapeAwareCuratedTransitions() {
	const beforeProject = JSON.stringify(controller.getState().project);
	const beforeSerialized = JSON.stringify(controller.serializeProject().value);
	const beforeRevision = controller.getState().revision;
	await openFolderSettings("People — curated both orientations", "Poster-consistent siblings");
	await waitForSuggestionState("ready");
	const initial = {
		posterSelected: document.querySelector('[data-editor-choice="poster"]').checked,
		cover: document.querySelector('[data-editor-field="coverImageUrl"] input').value,
		focus: document.querySelector('[data-editor-field="focusGifUrl"] input').value,
		focusEnabled: document.querySelector('[data-editor-field="focusGifEnabled"] input').checked,
		siblingNoticeAbsent: document.querySelector('[data-sibling-shape-notice="true"]') === null,
		missingNoticeAbsent: document.querySelector('[data-missing-curated-orientation="true"]') === null,
	};
	await chooseTileShape("landscape");
	await waitForCondition(() => (
		document.querySelector('[data-editor-field="coverImageUrl"] input').value === exactPeopleLandscapeUrl
		&& document.querySelector('[data-editor-field="focusGifUrl"] input').value === exactPeopleFocusLandscapeUrl
	));
	const landscape = {
		selected: document.querySelector('[data-editor-choice="landscape"]').checked,
		cover: document.querySelector('[data-editor-field="coverImageUrl"] input').value,
		focus: document.querySelector('[data-editor-field="focusGifUrl"] input').value,
		focusEnabled: document.querySelector('[data-editor-field="focusGifEnabled"] input').checked,
		preview: document.querySelector('[data-artwork-preview="coverImageUrl"] img')?.getAttribute("src"),
		focusPreview: document.querySelector('[data-artwork-preview="focusGifUrl"] img')?.getAttribute("src"),
		siblingNotice: document.querySelector('[data-sibling-shape-notice="true"]')?.textContent.trim(),
		missingNoticeAbsent: document.querySelector('[data-missing-curated-orientation="true"]') === null,
		projectUnchanged: JSON.stringify(controller.getState().project) === beforeProject,
		serializedUnchanged: JSON.stringify(controller.serializeProject().value) === beforeSerialized,
		revisionUnchanged: controller.getState().revision === beforeRevision,
	};
	await chooseTileShape("poster");
	await waitForCondition(() => (
		document.querySelector('[data-editor-field="coverImageUrl"] input').value === exactPeoplePosterUrl
		&& document.querySelector('[data-editor-field="focusGifUrl"] input').value === exactPeopleFocusPosterUrl
	));
	const returned = {
		selected: document.querySelector('[data-editor-choice="poster"]').checked,
		cover: document.querySelector('[data-editor-field="coverImageUrl"] input').value,
		focus: document.querySelector('[data-editor-field="focusGifUrl"] input').value,
		focusEnabled: document.querySelector('[data-editor-field="focusGifEnabled"] input').checked,
		siblingNoticeAbsent: document.querySelector('[data-sibling-shape-notice="true"]') === null,
	};
	await cancelFolderSettings();
	await openFolderSettings("People — curated both orientations", "Poster-consistent siblings");
	await waitForSuggestionState("ready");
	const cancel = {
		posterSelected: document.querySelector('[data-editor-choice="poster"]').checked,
		cover: document.querySelector('[data-editor-field="coverImageUrl"] input').value,
		focus: document.querySelector('[data-editor-field="focusGifUrl"] input').value,
		focusEnabled: document.querySelector('[data-editor-field="focusGifEnabled"] input').checked,
		projectUnchanged: JSON.stringify(controller.getState().project) === beforeProject,
		serializedUnchanged: JSON.stringify(controller.serializeProject().value) === beforeSerialized,
		revisionUnchanged: controller.getState().revision === beforeRevision,
	};
	await chooseTileShape("landscape");
	await waitForCondition(() => (
		document.querySelector('[data-editor-field="coverImageUrl"] input').value === exactPeopleLandscapeUrl
		&& document.querySelector('[data-editor-field="focusGifUrl"] input').value === exactPeopleFocusLandscapeUrl
	));
	document.querySelector('[data-action="apply-node-edit"]').click();
	await afterCommittedEffects();
	const saved = controller.serializeProject().value
		.find((entry) => entry.id === "poster-consensus")
		.folders.find((entry) => entry.id === "shape-people-both");
	const apply = {
		tileShape: saved.tileShape,
		cover: saved.coverImageUrl,
		focus: saved.focusGifUrl,
		focusEnabled: saved.focusGifEnabled,
		sentinel: saved.reviewSentinel,
		revisionDelta: controller.getState().revision - beforeRevision,
	};
	return { initial, landscape, returned, cancel, apply };
}

async function exerciseMissingOrientationAndSiblingNotices() {
	const beforeRevision = controller.getState().revision;
	await openFolderSettings("Studio — Landscape only", "Landscape-consistent siblings");
	await waitForSuggestionState("ready");
	const initial = {
		landscapeSelected: document.querySelector('[data-editor-choice="landscape"]').checked,
		cover: document.querySelector('[data-editor-field="coverImageUrl"] input').value,
		missingNoticeAbsent: document.querySelector('[data-missing-curated-orientation="true"]') === null,
		siblingNoticeAbsent: document.querySelector('[data-sibling-shape-notice="true"]') === null,
	};
	await chooseTileShape("poster");
	await waitForCondition(() => document.querySelector('[data-missing-curated-orientation="true"]'));
	const changed = {
		posterSelected: document.querySelector('[data-editor-choice="poster"]').checked,
		cover: document.querySelector('[data-editor-field="coverImageUrl"] input').value,
		missingNotice: document.querySelector('[data-missing-curated-orientation="true"]').textContent.trim(),
		siblingNotice: document.querySelector('[data-sibling-shape-notice="true"]')?.textContent.trim(),
		requestAbsent: document.querySelector('[data-artwork-request="coverImageUrl"]') === null,
		missingNoticeInDisplay: document.querySelector('[data-missing-curated-orientation="true"]')
			.closest('[data-settings-section="display"]') !== null,
		missingNoticeOutsideArtwork: document.querySelector('[data-missing-curated-orientation="true"]')
			.closest('[data-settings-section="artwork"]') === null,
		tileInputDoesNotDescribeNotice: !document.querySelector('[data-editor-field="coverImageUrl"] input')
			.getAttribute("aria-describedby")
			.split(/\s+/)
			.includes(document.querySelector('[data-missing-curated-orientation="true"]').id),
		shapeFieldDescribesMissingNotice: document.querySelector('[data-editor-field="tileShape"]')
			.getAttribute("aria-describedby")
			.split(/\s+/)
			.includes(document.querySelector('[data-missing-curated-orientation="true"]').id),
		shapeFieldDescribesSiblingNotice: document.querySelector('[data-editor-field="tileShape"]')
			.getAttribute("aria-describedby")
			.split(/\s+/)
			.includes(document.querySelector('[data-sibling-shape-notice="true"]').id),
		noticeOrder: [...document.querySelector('[data-editor-field="tileShape"]').querySelectorAll(".folder-settings-notice")]
			.map((notice) => notice.dataset.missingCuratedOrientation === "true" ? "missing" : "sibling"),
	};
	await setEditorField("coverImageUrl", "");
	const cleared = {
		inputBlank: document.querySelector('[data-editor-field="coverImageUrl"] input').value === "",
		missingNoticeAbsent: document.querySelector('[data-missing-curated-orientation="true"]') === null,
		requestAbsent: document.querySelector('[data-artwork-request="coverImageUrl"]') === null,
		siblingNoticeStillPresent: document.querySelector('[data-sibling-shape-notice="true"]') !== null,
	};
	await setEditorField("coverImageUrl", exactStudioLandscapeUrl);
	await waitForCondition(() => document.querySelector('[data-missing-curated-orientation="true"]'));
	document.querySelector('[data-action="apply-node-edit"]').click();
	await afterCommittedEffects();
	const saved = controller.serializeProject().value
		.find((entry) => entry.id === "landscape-consensus")
		.folders.find((entry) => entry.id === "shape-studio-landscape-only");
	const apply = {
		tileShape: saved.tileShape,
		cover: saved.coverImageUrl,
		sentinel: saved.reviewSentinel,
		revisionDelta: controller.getState().revision - beforeRevision,
	};
	await openFolderSettings("Studio — Landscape only", "Landscape-consistent siblings");
	await waitForSuggestionState("ready");
	const reopen = {
		posterSelected: document.querySelector('[data-editor-choice="poster"]').checked,
		cover: document.querySelector('[data-editor-field="coverImageUrl"] input').value,
		missingNoticeAbsent: document.querySelector('[data-missing-curated-orientation="true"]') === null,
		siblingNoticeAbsent: document.querySelector('[data-sibling-shape-notice="true"]') === null,
	};
	await cancelFolderSettings();
	return { initial, changed, cleared, apply, reopen };
}

async function exerciseMixedSiblingNotice() {
	await openFolderSettings("People — already mixed siblings", "Already-mixed siblings");
	await waitForSuggestionState("ready");
	await chooseTileShape("landscape");
	await waitForCondition(() => document.querySelector('[data-editor-field="coverImageUrl"] input').value === exactPeopleLandscapeUrl);
	const result = {
		cover: document.querySelector('[data-editor-field="coverImageUrl"] input').value,
		siblingNoticeAbsent: document.querySelector('[data-sibling-shape-notice="true"]') === null,
		missingNoticeAbsent: document.querySelector('[data-missing-curated-orientation="true"]') === null,
	};
	await cancelFolderSettings();
	return result;
}

async function measureShapeAwareLayout(kind) {
	const cases = {
		success: ["People — curated both orientations", "Poster-consistent siblings", "landscape"],
		missing: ["Studio — Landscape only", "Landscape-consistent siblings", "poster"],
		custom: ["People — existing custom artwork", "Artwork collection", "landscape"],
		blank: ["People — blank with curated artwork", "Artwork collection", "landscape"],
		mixed: ["People — already mixed siblings", "Already-mixed siblings", "landscape"],
	};
	const [folderTitle, collectionTitle, requestedShape] = cases[kind];
	await openFolderSettings(folderTitle, collectionTitle);
	await waitForSuggestionState("ready");
	await chooseTileShape(requestedShape);
	await afterCommittedEffects();
	const editor = document.querySelector('[data-node-editor="folder"]');
	const notices = [...editor.querySelectorAll(".folder-settings-notice")];
	editor.scrollTop = editor.scrollHeight;
	await afterCommittedEffects();
	const actionRect = editor.querySelector(".node-editor-actions").getBoundingClientRect();
	const result = {
		kind,
		width: window.innerWidth,
		noticeCount: notices.length,
		displayNoticeCount: editor.querySelectorAll('[data-settings-section="display"] .folder-settings-notice').length,
		artworkNoticeCount: editor.querySelectorAll('[data-settings-section="artwork"] .folder-settings-notice').length,
		noticesInsideViewport: notices.every((notice) => {
			const rect = notice.getBoundingClientRect();
			return rect.left >= -1 && rect.right <= window.innerWidth + 1;
		}),
		compactNotices: notices.every((notice) => notice.getBoundingClientRect().height < 80),
		oneScrollOwner: [...editor.querySelectorAll("*")].filter((element) => {
			const style = getComputedStyle(element);
			return ["auto", "scroll"].includes(style.overflowY) && element.scrollHeight > element.clientHeight + 1;
		}).length === 0,
		bodyLocked: getComputedStyle(document.body).overflow === "hidden",
		noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1 && editor.scrollWidth <= editor.clientWidth + 1,
		actionsInsideViewport: actionRect.left >= -1 && actionRect.right <= window.innerWidth + 1 && actionRect.bottom <= window.innerHeight + 1,
	};
	await cancelFolderSettings();
	return result;
}

const root = createRoot(document.getElementById("root"));
window.__builderFolderArtworkMounted = { status: "running" };
act(() => root.render(createElement(MountedWorkspace)));

afterCommittedEffects().then(async () => {
	await waitForCondition(() => (
		document.querySelectorAll('[data-hierarchy-card="folder"]').length === 124
		&& folderCard("Poster artwork")?.querySelector("img")?.complete === true
		&& folderCard("Landscape artwork")?.querySelector("img")?.complete === true
		&& folderCard("Arbitrary origin artwork")?.querySelector("img")?.naturalWidth > 0
		&& folderCard("Broken artwork")?.querySelector("img") === null
		&& folderCard("Failed artwork replacement")?.querySelector("img") === null
	));
	window.__measureFolderArtworkLayout = measureLayout;
	window.__measureFolderArtworkSettingsLayout = measureSettingsLayout;
	window.__measureCollectionBackdropSettingsLayout = measureCollectionSettingsLayout;
	window.__folderArtworkPreservationState = preservationState;
	window.__exerciseFolderArtworkFailureReplacement = exerciseFailureReplacement;
	window.__exerciseFolderArtworkSettingsDraftPreviews = exerciseSettingsDraftPreviews;
	window.__exerciseFolderArtworkSettingsApply = exerciseSettingsApply;
	window.__exerciseFolderArtworkOrdinaryVideoVisibility = exerciseOrdinaryVideoVisibility;
	window.__exerciseFolderArtworkVideoCancel = exerciseVideoCancel;
	window.__exerciseFolderArtworkVideoReplacement = exerciseVideoReplacement;
	window.__exerciseCollectionBackdropDraftPreviews = exerciseCollectionBackdropDraftPreviews;
	window.__exerciseCollectionBackdropUnrelatedApply = exerciseCollectionBackdropUnrelatedApply;
	window.__exerciseCollectionBackdropApply = exerciseCollectionBackdropApply;
	window.__inspectFolderArtworkSuggestionStates = inspectSuggestionStates;
	window.__measureFolderArtworkSuggestionLayout = measureSuggestionLayout;
	window.__exerciseFolderArtworkSuggestionDraftContract = exerciseSuggestionDraftContract;
	window.__exerciseFolderArtworkBlankOnlyTransitions = exerciseBlankOnlyTransitions;
	window.__exerciseFolderArtworkRequestContract = exerciseRequestContract;
	window.__exerciseFolderArtworkStudioOrientationContract = exerciseStudioOrientationContract;
	window.__measureFolderArtworkShapeAwareLayout = measureShapeAwareLayout;
	window.__exerciseFolderArtworkShapeAwareTransitions = exerciseShapeAwareCuratedTransitions;
	window.__exerciseFolderArtworkMissingOrientationAndSiblingNotices = exerciseMissingOrientationAndSiblingNotices;
	window.__exerciseFolderArtworkMixedSiblingNotice = exerciseMixedSiblingNotice;
	window.__builderFolderArtworkMounted = { status: "complete" };
}).catch((error) => {
	window.__builderFolderArtworkMounted = {
		status: "error",
		message: error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error),
	};
});
