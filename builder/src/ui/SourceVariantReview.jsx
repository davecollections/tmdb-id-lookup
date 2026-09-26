import { HierarchyOutputSummary } from "./HierarchyOutputSummary.jsx";
export function SourceVariantCounts({ counts }) {
	if (!counts) return null;
	if (Object.hasOwn(counts, "existingFolderAdditionCount")) {
		return <div data-source-variant-counts="true"><HierarchyOutputSummary counts={counts} scope={counts.collectionCount > 0 ? "new-collection" : "new-folder"} />{counts.unresolvedEntityCount > 0 ? <p className="editor-field-help">New sources need a destination.</p> : null}</div>;
	}
	return <div className="editor-field-help" role="status" data-source-variant-counts="true">
		<p>{counts.toAdd} {counts.toAdd === 1 ? "Source" : "Sources"} to add</p>
		<p>{counts.configured} configured · {counts.existing} already present · {counts.omitted} omitted · {counts.toAdd} to add</p>
	</div>;
}

export function SourceVariantReview({ drafts, review, variantKey }) {
	const existing = new Set(review.destination.map((entry) => entry.identity));
	const elsewhere = new Set(review.elsewhere.map((entry) => entry.identity));
	return <>
		<SourceVariantCounts counts={review.counts} />
		<ul className="genre-review-list" aria-label="Configured sources">
			{drafts.map((draft) => {
				const key = variantKey(draft);
				return <li key={key}><strong>{draft.editable.title}</strong><span>{existing.has(key) ? "Already in this folder" : elsewhere.has(key) ? "Exists elsewhere · ready to add" : "Ready to add"}</span></li>;
			})}
		</ul>
	</>;
}
