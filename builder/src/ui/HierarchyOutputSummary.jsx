import { outputNoun } from "./creation-options.js";

// Counts come from the family plan. Never derive hierarchy from selected cards.
export function HierarchyOutputSummary({ counts, scope, className = "" }) {
	if (!counts) return null;
	const folders = counts.newFolderCount ?? counts.folderCount;
	const sources = counts.newSourceCount ?? counts.sourceCount;
	const existing = counts.existingFolderAdditionCount ?? 0;
	const collection = scope === "new-collection";
	if (!collection && folders === 0) return <p className="editor-field-help" data-source-output-summary="true">{sources} {outputNoun(sources, "Source")} to add{existing > 0 ? ` to ${existing} existing ${outputNoun(existing, "Folder")}` : ""}.</p>;
	const rows = [
		...(collection ? [{ count: counts.collectionCount, label: "Collection" }] : []),
		{ count: folders, label: "Folder" }, { count: sources, label: "Source" },
	];
	return <>
		<div className={`decades-plan-totals ${className}`.trim()} data-plan-scope={scope} role="group" aria-label="Plan totals">
			{rows.filter(({ count }) => Number.isSafeInteger(count)).map(({ count, label }) => <div key={label}><strong>{count}</strong><span>{outputNoun(count, label)}</span></div>)}
		</div>
		{existing > 0 ? <p className="editor-field-help">Sources will also be added to {existing} existing {outputNoun(existing, "Folder")}.</p> : null}
	</>;
}
