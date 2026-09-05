import {
	isInvisibleNuvioTitle,
	isValidVisibleNuvioTitle,
} from "../nuvio/titles.js";
import { sourceCardDetails } from "./source-details.js";
import { canEditSource } from "../source-edit/index.js";
import { buildSiblingMovements } from "./hierarchy-reordering.js";

const folderArtworkFields = Object.freeze([
	"coverEmoji",
	"focusGifUrl",
	"heroVideoUrl",
	"titleLogoUrl",
	"coverImageUrl",
	"heroBackdropUrl",
]);

function nonBlankText(value) {
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function presentValue(value) {
	if (value === null || value === undefined || value === "") {
		return null;
	}
	return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
		? value
		: null;
}

function countLabel(count, singular, plural = `${singular}s`) {
	return `${count} ${count === 1 ? singular : plural}`;
}

function displayValue(value) {
	if (typeof value === "boolean") {
		return value ? "Yes" : "No";
	}
	return String(value);
}

function detail(label, value) {
	return value === null || value === undefined ? null : { label, value: displayValue(value) };
}

function compactDetails(details) {
	return details.filter(Boolean);
}

function friendlyChoice(value, labels) {
	if (typeof value !== "string") return null;
	return labels[value.toUpperCase()] ?? null;
}

export function nodeTitle(value, noun) {
	if (isInvisibleNuvioTitle(value)) {
		const capitalizedNoun = noun[0].toUpperCase() + noun.slice(1);
		return {
			text: "Hidden title",
			hidden: true,
			accessibleName: `${capitalizedNoun} with hidden Nuvio title`,
		};
	}

	const text = isValidVisibleNuvioTitle(value) ? value.trim() : `Untitled ${noun}`;
	return {
		text,
		hidden: false,
		accessibleName: text,
	};
}

function supportedBoolean(value) {
	return typeof value === "boolean" ? value : null;
}

function assignedTileArtworkUrl(value) {
	return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function tileArtworkShape(value) {
	if (typeof value !== "string") return "unknown";
	const normalized = value.toUpperCase();
	if (normalized === "POSTER") return "poster";
	if (normalized === "LANDSCAPE") return "landscape";
	return "unknown";
}

function buildCollection(collection, selectedInternalId) {
	const folderCount = collection.folders.length;
	const sourceCount = collection.folders.reduce((total, folder) => total + folder.sources.length, 0);
	const title = nodeTitle(collection.editable.title, "collection");
	const layout = friendlyChoice(collection.editable.viewMode, {
		TABBED_GRID: "Tabs",
		ROWS: "Rows",
	});
	const pinToTop = supportedBoolean(collection.editable.pinToTop);
	const showAllTab = supportedBoolean(collection.editable.showAllTab);
	const focusGlowEnabled = supportedBoolean(collection.editable.focusGlowEnabled);
	return {
		internalId: collection.internalId,
		title: title.text,
		titleHidden: title.hidden,
		accessibleName: title.accessibleName,
		folderCount,
		sourceCount,
		folderCountLabel: countLabel(folderCount, "folder"),
		sourceCountLabel: countLabel(sourceCount, "source"),
		selected: collection.internalId === selectedInternalId,
		details: compactDetails([
			detail("Title", title.text),
			title.hidden ? detail("Nuvio title", "Invisible") : null,
			detail("Folders", folderCount),
			detail("Sources", sourceCount),
			detail("Layout", layout),
			detail("Pinned to top", pinToTop),
			detail("All tab when using Tabs", showAllTab),
			detail("Focus glow enabled", focusGlowEnabled),
		]),
	};
}

function buildFolder(folder, selectedInternalId) {
	const sourceCount = folder.sources.length;
	const artworkCount = folderArtworkFields.filter((field) => presentValue(folder.editable[field]) !== null).length;
	const title = nodeTitle(folder.editable.title, "folder");
	const tileArtworkUrl = assignedTileArtworkUrl(folder.editable.coverImageUrl);
	const tileShape = friendlyChoice(folder.editable.tileShape, {
		POSTER: "Poster",
		LANDSCAPE: "Landscape",
	});
	const hideTitle = supportedBoolean(folder.editable.hideTitle);
	const hasVisibleTitle = isValidVisibleNuvioTitle(folder.editable.title);
	const titleVisibility = title.hidden
		? "Hide everywhere"
		: hasVisibleTitle && hideTitle === true
			? "Hide on home screen only"
			: hasVisibleTitle && hideTitle === false
				? "Show everywhere"
				: null;
	return {
		internalId: folder.internalId,
		title: title.text,
		titleHidden: title.hidden,
		accessibleName: title.accessibleName,
		sourceCount,
		sourceCountLabel: countLabel(sourceCount, "source"),
		tileShape,
		tileArtworkUrl,
		tileArtworkShape: tileArtworkUrl === null ? null : tileArtworkShape(folder.editable.tileShape),
		selected: folder.internalId === selectedInternalId,
		details: compactDetails([
			detail("Title", title.text),
			detail("Folder title visibility", titleVisibility),
			detail("Sources", sourceCount),
			detail("Tile shape", tileShape),
			detail("Artwork", artworkCount === 0 ? "None added" : countLabel(artworkCount, "artwork field")),
		]),
	};
}

function sourceTitle(source, fallback) {
	if (isInvisibleNuvioTitle(source.editable.title)) {
		return nodeTitle(source.editable.title, "source");
	}

	const title = nonBlankText(source.editable.title);
	if (title) {
		return {
			text: title,
			hidden: false,
			accessibleName: title,
		};
	}
	const text = fallback;
	return {
		text,
		hidden: false,
		accessibleName: text,
	};
}

function sourceCategoryLabel(category) {
	return {
		"native-tmdb": "Native TMDB",
		addon: "Addon",
		opaque: "Preserved source",
	}[category] ?? "Preserved source";
}

function buildSource(source, selectedInternalId, sourceDetails = sourceCardDetails(source)) {
	const editable = source.editable;
	const title = sourceTitle(source, sourceDetails.fallback);
	return {
		internalId: source.internalId,
		title: title.text,
		titleHidden: title.hidden,
		accessibleName: title.accessibleName,
		category: source.category,
		categoryLabel: sourceCategoryLabel(source.category),
		editSupported: canEditSource(source),
		metadata: sourceDetails.metadata,
		metadataDescription: sourceDetails.metadata.map((entry) => entry.value).join(", "),
		selected: source.internalId === selectedInternalId,
		details: compactDetails([
			detail("Category", sourceCategoryLabel(source.category)),
			detail("Title", nonBlankText(editable.title)),
			detail("Provider", presentValue(editable.provider)),
			source.category === "native-tmdb" ? detail("TMDB source type", presentValue(editable.tmdbSourceType)) : null,
			source.category === "native-tmdb" ? detail("TMDB ID", presentValue(editable.tmdbId)) : null,
			detail("Media type", presentValue(editable.mediaType)),
			source.category === "addon" ? detail("Addon ID", presentValue(editable.addonId)) : null,
			source.category === "addon" ? detail("Addon type", presentValue(editable.type)) : null,
			source.category === "addon" ? detail("Catalog ID", presentValue(editable.catalogId)) : null,
			source.category === "addon" ? detail("Genre", presentValue(editable.genre)) : null,
		]),
		note: source.category === "opaque" ? "Preserved imported source" : null,
	};
}

// Only reveal a catalog hidden behind a friendly origin when sibling cards collide.
function sourceDetailsForFolder(sources) {
	const details = new Map();
	const groups = new Map();
	for (const source of sources) {
		const summary = sourceCardDetails(source);
		details.set(source.internalId, summary);
		if (source.category !== "addon") continue;
		const key = JSON.stringify([sourceTitle(source, summary.fallback).text, summary.metadata.map((entry) => entry.value)]);
		const group = groups.get(key) ?? [];
		group.push(source);
		groups.set(key, group);
	}
	for (const group of groups.values()) {
		if (new Set(group.map((source) => nonBlankText(source.editable.catalogId)).filter(Boolean)).size < 2) continue;
		for (const source of group) details.set(source.internalId, sourceCardDetails(source, { includeCatalogId: true }));
	}
	return details;
}

function withMovement(entry, viewNode) {
	return {
		...viewNode,
		reorderGroup: entry.reorderGroup,
		reorderGroupPosition: entry.reorderGroupPosition,
		reorderGroupSize: entry.reorderGroupSize,
		reorderVisiblePosition: entry.reorderVisiblePosition,
		reorderVisibleSize: entry.reorderVisibleSize,
		reorderTargetIndexes: entry.reorderTargetIndexes,
		moveUpTargetIndex: entry.moveUpTargetIndex,
		moveDownTargetIndex: entry.moveDownTargetIndex,
	};
}

function migrationNotice(preview) {
	if (preview.status === "available") {
		return "This imported project has legacy addon sources that can be migrated in a later step.";
	}
	if (preview.status === "blocked") {
		return "Some imported legacy source data needs attention before it can be migrated.";
	}
	return null;
}

export function buildBuilderViewModel(state) {
	const collections = buildSiblingMovements(
		state.project.collections,
		{ groupPinnedCollections: true },
	).map((entry) => withMovement(
		entry,
		buildCollection(entry.node, state.selection.collectionInternalId),
	));
	const selectedCollection = collections.find((collection) => collection.selected) ?? null;
	const selectedCollectionNode = selectedCollection
		? state.project.collections.find((collection) => collection.internalId === selectedCollection.internalId)
		: null;
	const folders = selectedCollectionNode
		? buildSiblingMovements(selectedCollectionNode.folders).map((entry) => withMovement(
			entry,
			buildFolder(entry.node, state.selection.folderInternalId),
		))
		: [];
	const selectedFolder = folders.find((folder) => folder.selected) ?? null;
	const selectedFolderNode = selectedCollectionNode && selectedFolder
		? selectedCollectionNode.folders.find((folder) => folder.internalId === selectedFolder.internalId)
		: null;
	const sourceDetails = sourceDetailsForFolder(selectedFolderNode?.sources ?? []);
	const sources = selectedFolderNode
		? buildSiblingMovements(selectedFolderNode.sources).map((entry) => withMovement(
			entry,
			buildSource(entry.node, state.selection.sourceInternalId, sourceDetails.get(entry.node.internalId)),
		))
		: [];
	const selectedSource = sources.find((source) => source.selected) ?? null;
	const selectedNode = selectedSource ?? selectedFolder ?? selectedCollection;

	return {
		collections,
		selectedCollection,
		folders,
		selectedFolder,
		sources,
		selectedSource,
		selectedNode,
		activeMobileLevel: selectedFolder ? "sources" : selectedCollection ? "folders" : "collections",
		operationDiagnostic: state.diagnostics.operation.errors[0] ?? null,
		migrationNotice: migrationNotice(state.migrationPreview),
	};
}
