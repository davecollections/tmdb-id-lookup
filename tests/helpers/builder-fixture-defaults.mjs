import { NEW_COLLECTION_DEFAULTS, NEW_FOLDER_DEFAULTS } from "../../builder/src/domain/node-defaults.js";

// Historical owner-review inputs must remain unchanged. Compare current creation
// against those inputs with only the newly explicit creation defaults supplied.
// Existing values, source arrays, ordering and unknown fields remain authoritative.
export function withCurrentCreationDefaults(collections) {
	return collections.map((collection) => ({
		...NEW_COLLECTION_DEFAULTS,
		...collection,
		folders: collection.folders.map((folder) => ({
			...NEW_FOLDER_DEFAULTS,
			...folder,
		})),
	}));
}
