import { useRef } from "react";
import { NestedPreviewDialog } from "./NestedPreviewDialog.jsx";
import { PosterOnlyPreviewGrid } from "./PosterOnlyPreviewGrid.jsx";

function mediaLabel(mediaType) {
	return mediaType === "TV" ? "Series" : "Movies";
}

export function SourceTitlePreviewDialog({
	preview,
	titleId = "source-title-preview-title",
	backdropProps = {},
	dialogProps = {},
	selectorGroups = [],
	onClose,
	onRetry,
}) {
	const dialogRef = useRef(null);
	const closeRef = useRef(null);
	const label = mediaLabel(preview.candidate.request.mediaType);
	return (
		<NestedPreviewDialog
			ariaLabelledBy={titleId}
			backdropClassName="franchise-preview-backdrop studio-preview-backdrop source-edit-preview-backdrop"
			backdropProps={backdropProps}
			dialogClassName="franchise-preview-modal studio-preview-modal source-edit-preview-modal"
			dialogProps={dialogProps}
			dialogRef={dialogRef}
			initialFocusRef={closeRef}
			onClose={onClose}
		>
			<header><div><p className="panel-kicker">Title preview</p><h3 id={titleId}>{preview.candidate.request.label || "Current source"}</h3></div><button ref={closeRef} type="button" onClick={onClose}>Close</button></header>
			{selectorGroups.length > 0 ? (
				<div className="decade-add-preview-dimensions source-title-preview-dimensions">
					{selectorGroups.map((group) => (
						<div key={group.id} className="decade-add-preview-dimension">
							<strong>{group.label}</strong>
							<div className="studio-preview-tabs" role="tablist" aria-label={group.ariaLabel ?? group.label}>
								{group.options.map((option) => <button key={option.id} type="button" role="tab" aria-selected={option.selected} onClick={option.onSelect}>{option.label}</button>)}
							</div>
						</div>
					))}
				</div>
			) : <p className="studio-preview-single-media">{label}</p>}
			{preview.status === "loading" ? <p className="studio-preview-state" role="status">Preparing preview…</p> : null}
			{preview.status === "error" ? <div className="studio-preview-state add-source-request-state" role="alert"><p>{preview.error?.message ?? "This title preview could not be prepared."}</p><button type="button" onClick={onRetry}>Retry</button></div> : null}
			{preview.status === "ready" ? <PosterOnlyPreviewGrid items={preview.data?.results ?? []} limit={10} className="franchise-preview-grid studio-preview-grid source-edit-preview-grid" ariaLabel={`${label} poster preview`} altPrefix={label} emptyMessage="No posters available." /> : null}
		</NestedPreviewDialog>
	);
}
