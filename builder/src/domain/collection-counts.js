// Domain and prepared Nuvio Collections both have these authoritative child arrays.
// Compatibility catalogSources projections are not additional Sources.
export function collectionCounts(collections) {
	return collections.reduce((counts, collection) => ({
		collections: counts.collections + 1,
		folders: counts.folders + collection.folders.length,
		sources: counts.sources + collection.folders.reduce((total, folder) => total + folder.sources.length, 0),
	}), { collections: 0, folders: 0, sources: 0 });
}
