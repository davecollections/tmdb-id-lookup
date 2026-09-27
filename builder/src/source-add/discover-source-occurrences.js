import { projectSourceEvidence } from "../domain/source-occurrences.js";
import { discoverSourceNodeIdentity } from "../nuvio/discover.js";

function buildDiscoverEvidence(snapshot) {
	const identities = new Map();
	const byIdentity = new Map();
	for (const occurrence of snapshot.occurrences) {
		const { source } = occurrence;
		// Repeated references still have separate locations, but one identity.
		if (!identities.has(source)) identities.set(source, discoverSourceNodeIdentity(source));
		const identity = identities.get(source);
		if (!identity.comparable) continue;
		if (!byIdentity.has(identity.key)) byIdentity.set(identity.key, []);
		byIdentity.get(identity.key).push(Object.freeze({ ...occurrence, identity: identity.key }));
	}
	for (const [key, occurrences] of byIdentity) byIdentity.set(key, Object.freeze(occurrences));
	// Keep the mutable Map private; callers receive only frozen occurrence lists.
	return Object.freeze({
		find(selectedIdentities) {
			const matches = [];
			for (const identity of new Set(selectedIdentities)) {
				for (const occurrence of byIdentity.get(identity) ?? []) matches.push(occurrence);
			}
			// Batch input order must not replace original hierarchy occurrence order.
			return Object.freeze(matches.sort((left, right) => left.order - right.order));
		},
	});
}

export function discoverSourceOccurrences(project, selectedIdentities) {
	return projectSourceEvidence(project, buildDiscoverEvidence).find(selectedIdentities);
}
