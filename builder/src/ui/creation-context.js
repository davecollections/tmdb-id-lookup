import { nodeTitle } from "./view-model.js";

function contextName(title, kind) {
	return title === undefined ? `Selected ${kind}` : nodeTitle(title, kind).accessibleName;
}

export function destinationContext(collectionTitle, folderTitle) {
	const collection = contextName(collectionTitle, "collection");
	return `To ${collection}${folderTitle === undefined ? "" : ` / ${contextName(folderTitle, "folder")}`}`;
}

export function sourceDestinationContext(project, folder) {
	const collection = project?.collections.find((entry) => entry.folders.some((candidate) => candidate.internalId === folder?.internalId));
	return destinationContext(collection?.editable?.title, folder?.editable?.title ?? "");
}

export function creationContext(scope, collectionTitle) {
	return scope === "new-folder" ? `New Folder · ${destinationContext(collectionTitle)}` : "New Collection";
}
