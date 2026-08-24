export function CreationHeader({
	title,
	context,
	description,
	onBack = null,
	backAction = null,
	backDisabled = false,
	inactive = false,
	onClose,
}) {
	return (
		<header className="add-source-heading" inert={inactive || undefined} aria-hidden={inactive ? "true" : undefined}>
			<div className="add-source-heading-row">
				{onBack ? (
					<button className="add-source-header-action" type="button" data-action={backAction ?? undefined} disabled={backDisabled} onClick={onBack}><span aria-hidden="true">←</span> Back</button>
				) : <span className="add-source-header-spacer" aria-hidden="true" />}
				<div><h2 id="creation-title">{title}</h2>{context ? <p>{context}</p> : null}</div>
				<button className="add-source-header-action add-source-close-action" type="button" aria-label="Close creation flow" disabled={backDisabled} onClick={onClose}>Close</button>
			</div>
			<p id="creation-description" className="add-source-heading-description">{description}</p>
		</header>
	);
}
