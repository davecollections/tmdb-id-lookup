import { projectSourceEvidence } from "./source-occurrences.js";
import { nativeTraktConfigurationKey, nativeTraktPhysicalIdentity } from "../nuvio/trakt.js";

function buildTraktEvidence(snapshot) {
	return Object.freeze(snapshot.occurrences.flatMap(({ collection, folder, source }) => {
		const identity = nativeTraktPhysicalIdentity(source);
		return identity === null ? [] : [Object.freeze({
			identity, configurationKey: nativeTraktConfigurationKey(source),
			collectionInternalId: collection.internalId, collectionTitle: collection.editable.title,
			folderInternalId: folder.internalId, folderTitle: folder.editable.title,
			sourceInternalId: source.internalId, sourceTitle: source.editable.title,
		})];
	}));
}

// Locations only: no placement plan, duplicate policy, override or mutation.
export function nativeTraktSourceOccurrences(project, source, { folderInternalId = null } = {}) {
	const identity = nativeTraktPhysicalIdentity(source);
	return Object.freeze(identity === null ? [] : projectSourceEvidence(project, buildTraktEvidence)
		.filter((entry) => entry.identity === identity && (folderInternalId === null || entry.folderInternalId === folderInternalId)));
}
