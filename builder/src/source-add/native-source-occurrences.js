import { projectSourceEvidence } from "../domain/source-occurrences.js";

// Stable identity functions distinguish the family contract. Per-call options
// never own evidence; both configuration and final planning use the same pair.
const builders = new WeakMap();

function evidenceBuilder(structuralIdentity, variantKey) {
	let variants = builders.get(structuralIdentity);
	if (!variants) {
		variants = new WeakMap();
		builders.set(structuralIdentity, variants);
	}
	if (variants.has(variantKey)) return variants.get(variantKey);

	const build = (snapshot) => {
		const sources = new Map();
		const byEntity = new Map();
		for (const { collection, folder, source } of snapshot.occurrences) {
			if (!sources.has(source)) {
				let evidence = null;
				if (source.category === "native-tmdb") {
					const identity = variantKey(source);
					// Preserve the original two views: effective variant identity, followed
					// by the separate editable-only structural entity rejection.
					const entityId = identity === null ? null : structuralIdentity(source.editable)?.split("|")[2];
					if (entityId) evidence = Object.freeze({ identity, entityId, mediaType: source.editable.mediaType.trim().toUpperCase() });
				}
				sources.set(source, evidence);
			}
			const evidence = sources.get(source);
			if (!evidence) continue;
			const { identity, entityId, mediaType } = evidence;
			if (!byEntity.has(entityId)) byEntity.set(entityId, []);
			byEntity.get(entityId).push(Object.freeze({
				identity, mediaType,
				collectionInternalId: collection.internalId,
				collectionTitle: collection.editable?.title ?? "",
				folderInternalId: folder.internalId,
				folderTitle: folder.editable?.title ?? "",
				sourceInternalId: source.internalId,
				sourceTitle: source.editable?.title ?? "",
			}));
		}
		for (const [id, occurrences] of byEntity) byEntity.set(id, Object.freeze(occurrences));
		const empty = Object.freeze([]);
		// Only completed immutable buckets escape; the Map remains private.
		return Object.freeze({ find: (entityId) => byEntity.get(entityId) ?? empty });
	};
	variants.set(variantKey, build);
	return build;
}

export function nativeHierarchySourceOccurrences(project, entityId, structuralIdentity, variantKey) {
	return projectSourceEvidence(project, evidenceBuilder(structuralIdentity, variantKey)).find(entityId);
}
