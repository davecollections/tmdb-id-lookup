import { isValidVisibleNuvioTitle } from "../nuvio/titles.js";

function safeLocationTitle(title, fallback) {
	return isValidVisibleNuvioTitle(title) ? title.trim() : fallback;
}

function uniqueElsewhereLocations(occurrences) {
	const locations = [];
	const seen = new Set();
	for (const [index, occurrence] of (occurrences ?? []).entries()) {
		const collection = safeLocationTitle(occurrence?.collectionTitle, "Hidden collection");
		const folder = safeLocationTitle(occurrence?.folderTitle, "Hidden folder");
		const locationKey = typeof occurrence?.folderInternalId === "string" && occurrence.folderInternalId
			? `folder:${occurrence.folderInternalId}`
			: typeof occurrence?.collectionInternalId === "string" && occurrence.collectionInternalId
				? `collection:${occurrence.collectionInternalId}\nfolder:${folder}`
				: `display:${collection}\n${folder}\n${index}`;
		if (seen.has(locationKey)) continue;
		seen.add(locationKey);
		locations.push(Object.freeze({ key: locationKey, collection, folder }));
	}
	return locations;
}

export function SourceElsewhereNotice({ occurrences, visibleLimit = 3 }) {
	const locations = uniqueElsewhereLocations(occurrences);
	if (locations.length === 0) return null;
	const boundedLimit = Number.isSafeInteger(visibleLimit) && visibleLimit > 0 ? visibleLimit : 3;
	const visible = locations.slice(0, boundedLimit);
	const remaining = locations.length - visible.length;
	return (
		<div className="studio-elsewhere-note source-elsewhere-note" role="status">
			<strong className="studio-elsewhere-heading">This source exists elsewhere</strong>
			<ul className="studio-elsewhere-locations">
				{visible.map((location) => <li key={location.key}>{location.folder} · in {location.collection}</li>)}
			</ul>
			{remaining > 0 ? <p className="studio-elsewhere-more">+ {remaining} more</p> : null}
			<p className="studio-elsewhere-action">You can still add it to this folder, or close this window to cancel.</p>
		</div>
	);
}
