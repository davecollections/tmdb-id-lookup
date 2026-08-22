import { act, createElement, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { createBuilderController } from "../../builder/src/application/index.js";
import { BuilderWorkspace } from "../../builder/src/ui/BuilderWorkspace.jsx";
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
		...scaleFolders,
	],
}]);
if (!imported.ok) throw new Error("Mounted Folder artwork fixture import failed.");

const collection = controller.getState().project.collections[0];
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
	return createElement(BuilderWorkspace, { controller, state });
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

async function selectCollection() {
	controller.selectNode(collection.internalId);
	await afterCommittedEffects();
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

const root = createRoot(document.getElementById("root"));
window.__builderFolderArtworkMounted = { status: "running" };
act(() => root.render(createElement(MountedWorkspace)));

afterCommittedEffects().then(async () => {
	await waitForCondition(() => (
		document.querySelectorAll('[data-hierarchy-card="folder"]').length === 110
		&& folderCard("Poster artwork")?.querySelector("img")?.complete === true
		&& folderCard("Landscape artwork")?.querySelector("img")?.complete === true
		&& folderCard("Arbitrary origin artwork")?.querySelector("img")?.naturalWidth > 0
		&& folderCard("Broken artwork")?.querySelector("img") === null
		&& folderCard("Failed artwork replacement")?.querySelector("img") === null
	));
	window.__measureFolderArtworkLayout = measureLayout;
	window.__folderArtworkPreservationState = preservationState;
	window.__exerciseFolderArtworkFailureReplacement = exerciseFailureReplacement;
	window.__builderFolderArtworkMounted = { status: "complete" };
}).catch((error) => {
	window.__builderFolderArtworkMounted = {
		status: "error",
		message: error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error),
	};
});
