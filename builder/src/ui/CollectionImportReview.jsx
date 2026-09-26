import { useEffect, useRef } from "react";
import { focusElementWithoutScroll } from "./hierarchy-menu-placement.js";
import { ImportWarningSummary } from "./ImportWarningSummary.jsx";

const quantity = (count, label) => `${count} ${label}${count === 1 ? "" : "s"}`;
const modes = [
	["add", "Add as separate Collections", "Keep current work and append every Collection separately."],
	["merge", "Merge exact matches", "Keep current settings and combine exact matches."],
	["replace", "Replace current project", "Remove current work and import this snapshot."],
];
const artworkPolicies = [
	["keep-existing", "Keep existing artwork", "Matched Collections and Folders keep their current artwork."],
	["fill-missing", "Fill missing artwork", "Keep existing artwork and use incoming artwork only where artwork is missing."],
	["prefer-incoming", "Prefer incoming artwork", "Use incoming artwork where available and keep existing artwork where the import has none."],
];

function Choices({ id, className, legend, choices, selected, onChange }) {
	return <fieldset className={`nuvio-choices ${className}`}><legend>{legend}</legend>
		{choices.map(([value, title, description]) => <label className="nuvio-choice" data-selection-mode="single" data-selected={selected === value} key={value}>
			<input className="visually-hidden choice-card-input" type="radio" name={id} value={value} checked={selected === value} aria-labelledby={`${id}-${value}-label`} aria-describedby={`${id}-${value}-help`} onChange={() => onChange(value)} />
			<span><strong id={`${id}-${value}-label`}>{title}</strong><small id={`${id}-${value}-help`}>{description}</small></span>
		</label>)}
	</fieldset>;
}

export function ImportCounts({ counts }) {
	return <dl className="nuvio-counts">{Object.entries(counts).map(([label, count]) => <div key={label}><dt>{label[0].toUpperCase() + label.slice(1)}</dt><dd>{count}</dd></div>)}</dl>;
}

export function CollectionImportReview({ id, snapshot, review, currentCollectionCount }) {
	const safeAction = useRef(null);
	const { mode, setMode, artworkPolicy, setArtworkPolicy, confirmation, setConfirmation, staleProject, hasWork, mergePreview, refresh, perform } = review;
	useEffect(() => { if (confirmation && !staleProject) focusElementWithoutScroll(safeAction.current); }, [confirmation, staleProject]);
	return <>
		<ImportWarningSummary warnings={snapshot.warnings} limitedSourceCount={snapshot.limitedSourceCount} idsRepaired={mergePreview?.counts?.idsRepaired} />
		{staleProject ? <div className="nuvio-notice">Your Dingo project changed. <button type="button" onClick={refresh}>Review current project</button></div>
			: confirmation ? <div className="nuvio-notice nuvio-replace-confirmation">
				<h3>Replace all current work in Dingo</h3><p>Your {quantity(currentCollectionCount, "Collection")} and any unfinished edits will be removed. Dingo will import {quantity(snapshot.counts.collections, "Collection")} from this snapshot. This cannot be undone.</p>
				<div className="nuvio-actions"><button ref={safeAction} type="button" onClick={() => setConfirmation(false)}>Keep current work</button><button type="button" className="nuvio-danger" onClick={() => perform(true)}>Replace current project</button></div>
			</div> : hasWork ? <Choices id={`${id}-mode`} className="nuvio-import-modes" legend="How should this import affect your current work?" choices={modes} selected={mode} onChange={setMode} /> : null}
		{mergePreview && !confirmation && !staleProject ? <>
			<Choices id={`${id}-artwork`} className="merge-artwork-policies" legend="Artwork in exact matches" choices={artworkPolicies} selected={artworkPolicy} onChange={setArtworkPolicy} />
			{mergePreview.ok ? <section className="nuvio-merge-preview" aria-label="Merge preview" aria-live="polite">
				<h3>Merge preview</h3><p>Merge: {quantity(mergePreview.counts.collectionsMerged, "Collection")} · {quantity(mergePreview.counts.foldersMerged, "Folder")}</p>
				<p>Skip: {quantity(mergePreview.counts.duplicateSourcesSkipped, "duplicate Source")}</p>
				<p>Add: {quantity(mergePreview.counts.collectionsAdded, "Collection")} · {quantity(mergePreview.counts.foldersAdded, "Folder")} · {quantity(mergePreview.counts.sourcesAdded, "Source")}</p>
				<p className="nuvio-muted">Only exact visible names are matched. Similar or hidden names stay separate.</p>
				<h4>Artwork</h4><p data-artwork-counts>{quantity(mergePreview.artworkCounts.kept, "existing field")} kept · {quantity(mergePreview.artworkCounts.filled, "missing field")} filled · {quantity(mergePreview.artworkCounts.replaced, "existing field")} replaced</p>
				{artworkPolicy === "keep-existing" ? <p className="nuvio-muted">Existing artwork will stay unchanged.</p> : null}
			</section> : <p className="nuvio-notice is-error" role="alert">{mergePreview.errors[0]?.message}</p>}
		</> : null}
	</>;
}
