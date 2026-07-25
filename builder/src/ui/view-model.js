import {
	isInvisibleNuvioTitle,
	isValidVisibleNuvioTitle,
} from "../nuvio/titles.js";

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

function metadata(key, value) {
	return value === null || value === undefined ? null : { key, value: displayValue(value) };
}

function compactDetails(details) {
	return details.filter(Boolean);
}

function friendlyChoice(value, labels) {
	if (typeof value !== "string") return null;
	return labels[value.toUpperCase()] ?? null;
}

function nodeTitle(value, noun) {
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
			layout === "Tabs" ? detail("All source tab enabled", showAllTab) : null,
			detail("Focus glow enabled", focusGlowEnabled),
		]),
	};
}

function buildFolder(folder, selectedInternalId) {
	const sourceCount = folder.sources.length;
	const artworkCount = folderArtworkFields.filter((field) => presentValue(folder.editable[field]) !== null).length;
	const title = nodeTitle(folder.editable.title, "folder");
	const tileShape = friendlyChoice(folder.editable.tileShape, {
		POSTER: "Poster",
		LANDSCAPE: "Landscape",
	});
	const hideTitle = supportedBoolean(folder.editable.hideTitle);
	return {
		internalId: folder.internalId,
		title: title.text,
		titleHidden: title.hidden,
		accessibleName: title.accessibleName,
		sourceCount,
		sourceCountLabel: countLabel(sourceCount, "source"),
		tileShape,
		selected: folder.internalId === selectedInternalId,
		details: compactDetails([
			detail("Title", title.text),
			title.hidden ? detail("Nuvio title", "Invisible") : null,
			detail("Sources", sourceCount),
			detail("Tile shape", tileShape),
			hideTitle === null ? null : detail("Home-screen title shown", !hideTitle),
			detail("Artwork", artworkCount === 0 ? "None added" : countLabel(artworkCount, "artwork field")),
		]),
	};
}

function sourceTitle(source) {
	const title = nonBlankText(source.editable.title);
	if (title) {
		return title;
	}
	if (source.category === "native-tmdb") {
		return nonBlankText(source.editable.tmdbSourceType) ?? "TMDB source";
	}
	if (source.category === "addon") {
		return nonBlankText(source.editable.catalogId)
			?? nonBlankText(source.editable.addonId)
			?? "Addon source";
	}
	return "Preserved source";
}

function sourceCategoryLabel(category) {
	return {
		"native-tmdb": "Native TMDB",
		addon: "Addon",
		opaque: "Preserved source",
	}[category] ?? "Preserved source";
}

function sourceMetadata(source) {
	const editable = source.editable;
	if (source.category === "native-tmdb") {
		return compactDetails([
			metadata("tmdb-id", presentValue(editable.tmdbId)),
			metadata("media-type", presentValue(editable.mediaType)),
			metadata("sort", presentValue(editable.sortBy)),
		]);
	}
	if (source.category === "addon") {
		return compactDetails([
			metadata("addon-id", presentValue(editable.addonId)),
			metadata("addon-type", presentValue(editable.type)),
			metadata("genre", presentValue(editable.genre)),
		]);
	}
	return compactDetails([
		metadata("provider", presentValue(editable.provider)),
	]);
}

function buildSource(source, selectedInternalId) {
	const editable = source.editable;
	return {
		internalId: source.internalId,
		title: sourceTitle(source),
		category: source.category,
		categoryLabel: sourceCategoryLabel(source.category),
		metadata: sourceMetadata(source),
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
	const collections = state.project.collections.map((collection) => (
		buildCollection(collection, state.selection.collectionInternalId)
	));
	const selectedCollection = collections.find((collection) => collection.selected) ?? null;
	const selectedCollectionNode = selectedCollection
		? state.project.collections.find((collection) => collection.internalId === selectedCollection.internalId)
		: null;
	const folders = selectedCollectionNode
		? selectedCollectionNode.folders.map((folder) => buildFolder(folder, state.selection.folderInternalId))
		: [];
	const selectedFolder = folders.find((folder) => folder.selected) ?? null;
	const selectedFolderNode = selectedCollectionNode && selectedFolder
		? selectedCollectionNode.folders.find((folder) => folder.internalId === selectedFolder.internalId)
		: null;
	const sources = selectedFolderNode
		? selectedFolderNode.sources.map((source) => buildSource(source, state.selection.sourceInternalId))
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
