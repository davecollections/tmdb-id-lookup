/**
 * Ephemeral evidence for controller-owned, deeply immutable Project objects.
 * Mutable domain/test drafts are deliberately uncached. Family builders own
 * their comparison rules and must return read-only evidence or throw on failure.
 */
export function createProjectSourceEvidenceCache() {
	const projects = new WeakMap();

	function entryFor(project) {
		const cacheable = project !== null && typeof project === "object" && Object.isFrozen(project);
		if (cacheable && projects.has(project)) return projects.get(project);
		const occurrences = [];
		let collectionIndex = 0;
		for (const collection of project?.collections ?? []) {
			let folderIndex = 0;
			for (const folder of collection.folders ?? []) {
				let sourceIndex = 0;
				for (const source of folder.sources ?? []) {
					occurrences.push(Object.freeze({
						collection, folder, source, collectionIndex, folderIndex,
						sourceIndex: sourceIndex++, order: occurrences.length,
					}));
				}
				folderIndex++;
			}
			collectionIndex++;
		}
		const snapshot = Object.freeze({ project, occurrences: Object.freeze(occurrences) });
		const entry = { snapshot, families: new Map() };
		// Publish only a complete snapshot. A throwing traversal leaves no entry.
		if (cacheable) projects.set(project, entry);
		return entry;
	}

	return Object.freeze({
		snapshotFor(project) { return entryFor(project).snapshot; },
		evidenceFor(project, buildEvidence) {
			const entry = entryFor(project);
			if (entry.families.has(buildEvidence)) return entry.families.get(buildEvidence);
			const evidence = buildEvidence(entry.snapshot);
			// Builders publish synchronously and atomically; exceptions never cache.
			entry.families.set(buildEvidence, evidence);
			return evidence;
		},
	});
}

const projectEvidence = createProjectSourceEvidenceCache();
export const projectSourceSnapshot = projectEvidence.snapshotFor;
export const projectSourceEvidence = projectEvidence.evidenceFor;
