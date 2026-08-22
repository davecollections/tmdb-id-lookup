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

async function openFolderSettings(title = "Settings preview") {
	if (document.querySelector('[data-node-editor="folder"]')) return;
	await selectCollection();
	const card = folderCard(title);
	card.querySelector('[data-action="open-folder-actions"]').click();
	await afterCommittedEffects();
	document.querySelector('[data-actions-menu="folder"]:not([hidden]) [data-action="edit-folder"]').click();
	await afterCommittedEffects();
}

async function cancelFolderSettings() {
	document.querySelector('[data-action="cancel-node-edit"]')?.click();
	await afterCommittedEffects();
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

const root = createRoot(document.getElementById("root"));
window.__builderFolderArtworkMounted = { status: "running" };
act(() => root.render(createElement(MountedWorkspace)));

afterCommittedEffects().then(async () => {
	await waitForCondition(() => (
		document.querySelectorAll('[data-hierarchy-card="folder"]').length === 117
		&& folderCard("Poster artwork")?.querySelector("img")?.complete === true
		&& folderCard("Landscape artwork")?.querySelector("img")?.complete === true
		&& folderCard("Arbitrary origin artwork")?.querySelector("img")?.naturalWidth > 0
		&& folderCard("Broken artwork")?.querySelector("img") === null
		&& folderCard("Failed artwork replacement")?.querySelector("img") === null
	));
	window.__measureFolderArtworkLayout = measureLayout;
	window.__measureFolderArtworkSettingsLayout = measureSettingsLayout;
	window.__folderArtworkPreservationState = preservationState;
	window.__exerciseFolderArtworkFailureReplacement = exerciseFailureReplacement;
	window.__exerciseFolderArtworkSettingsDraftPreviews = exerciseSettingsDraftPreviews;
	window.__exerciseFolderArtworkSettingsApply = exerciseSettingsApply;
	window.__exerciseFolderArtworkOrdinaryVideoVisibility = exerciseOrdinaryVideoVisibility;
	window.__exerciseFolderArtworkVideoCancel = exerciseVideoCancel;
	window.__exerciseFolderArtworkVideoReplacement = exerciseVideoReplacement;
	window.__builderFolderArtworkMounted = { status: "complete" };
}).catch((error) => {
	window.__builderFolderArtworkMounted = {
		status: "error",
		message: error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error),
	};
});
