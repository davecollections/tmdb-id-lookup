import { useRef } from "react";
import { NestedPreviewDialog } from "./NestedPreviewDialog.jsx";
import { TitlePreviewResults } from "./TitlePreviewResults.jsx";
import { SourcePreviewContent } from "./SourcePreviewContent.jsx";
export { SourcePreviewContent } from "./SourcePreviewContent.jsx";

function mediaLabel(mediaType) {
	return mediaType === "TV" ? "Series" : "Movies";
}

export function SourcePreviewSelectors({ groups }) {
	const visibleGroups = groups.filter((group) => group.options.length > 1);
	if (!visibleGroups.length) return null;
	return <div className="decade-add-preview-dimensions source-title-preview-dimensions">
		{visibleGroups.map((group) => <div key={group.id} className="decade-add-preview-dimension">
			<strong>{group.label}</strong>
			<div className="studio-preview-tabs" role="tablist" aria-label={group.ariaLabel ?? group.label}>
				{group.options.map((option) => <button key={option.id} type="button" role="tab" aria-selected={option.selected} onClick={option.onSelect}>{option.label}</button>)}
			</div>
		</div>)}
	</div>;
}

export function SourceTitlePreviewDialog({
	preview,
	titleId = "source-title-preview-title",
	backdropProps = {},
	dialogProps = {},
	selectorGroups = [],
	context = null,
	onClose,
	onRetry,
}) {
	const dialogRef = useRef(null);
	const closeRef = useRef(null);
	const listPreview = preview.candidate.request.kind === "list";
	const label = listPreview ? "Titles" : mediaLabel(preview.candidate.request.mediaType);
	return (
		<NestedPreviewDialog
			ariaLabelledBy={titleId}
			backdropClassName="franchise-preview-backdrop studio-preview-backdrop source-edit-preview-backdrop"
			backdropProps={backdropProps}
			dialogClassName={`franchise-preview-modal studio-preview-modal source-edit-preview-modal source-sort-preview-modal${listPreview ? " tmdb-list-preview-modal" : ""}`}
			dialogProps={dialogProps}
			dialogRef={dialogRef}
			initialFocusRef={closeRef}
			onClose={onClose}
		>
			<header><div><p className="panel-kicker">Title preview</p><h3 id={titleId}>{preview.candidate.request.label || "Current source"}</h3></div><button ref={closeRef} type="button" onClick={onClose}>Close</button></header>
			<SourcePreviewContent>
				{context ? <p className="studio-preview-single-media">{context}</p> : null}
				{selectorGroups.length > 0 ? (
					<SourcePreviewSelectors groups={selectorGroups} />
				) : !listPreview ? <p className="studio-preview-single-media">{label}</p> : null}
				{preview.status === "loading" ? <p className="studio-preview-state" role="status">Preparing preview…</p> : null}
				{preview.status === "error" ? <div className="studio-preview-state add-source-request-state" role="alert"><p>{preview.error?.message ?? "This title preview could not be prepared."}</p><button type="button" onClick={onRetry}>Retry</button></div> : null}
				{preview.status === "ready" ? <TitlePreviewResults data={preview.data} listPreview={listPreview} hasImportedFilters={preview.candidate.request.hasImportedFilters} className={`franchise-preview-grid studio-preview-grid source-edit-preview-grid${listPreview ? " tmdb-list-preview-grid" : ""}`} ariaLabel={`${label} poster preview`} altPrefix={label} /> : null}
			</SourcePreviewContent>
		</NestedPreviewDialog>
	);
}
