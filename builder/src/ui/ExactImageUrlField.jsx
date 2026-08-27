import { hasPreviewUrl, useExactUrlPreviewFailure } from "./exact-url-preview.js";

function fieldDescriptionIds(prefix, field, preserved, failed, descriptionId) {
	return [
		`${prefix}-${field}-help`,
		preserved ? `${prefix}-${field}-preserved` : null,
		failed ? `${prefix}-${field}-preview-status` : null,
		descriptionId,
	].filter(Boolean).join(" ");
}

function PreservedFieldStatus({ id, preserved }) {
	if (!preserved) return null;
	return <p className="editor-field-status" id={id}>The current imported value is preserved until this field is edited.</p>;
}

export function ExactImageUrlField({
	descriptor,
	value,
	prefix,
	preserved,
	previewShape,
	previewHidden = false,
	previewOverlayLabel = null,
	descriptionId = null,
	onChange,
}) {
	const { field, label, description, preview } = descriptor;
	const previewFailure = useExactUrlPreviewFailure(value);
	const hasUrl = hasPreviewUrl(value);
	const helpId = `${prefix}-${field}-help`;
	const preservedId = `${prefix}-${field}-preserved`;
	const statusId = `${prefix}-${field}-preview-status`;
	const describedBy = fieldDescriptionIds(prefix, field, preserved, previewFailure.failed, descriptionId);

	return (
		<div className={`editor-field folder-artwork-url-field${hasUrl ? " has-preview" : ""}`} data-editor-field={field}>
			<div className="folder-artwork-field-layout">
				<div className="folder-artwork-field-copy">
					<label htmlFor={`${prefix}-${field}`}>{label}</label>
					<input
						id={`${prefix}-${field}`}
						type="url"
						inputMode="url"
						value={value}
						autoComplete="off"
						spellCheck="false"
						placeholder="https://"
						aria-describedby={describedBy}
						onChange={(event) => onChange(field, event.target.value)}
					/>
					<p className="editor-field-help" id={helpId}>{description}</p>
					<PreservedFieldStatus id={preservedId} preserved={preserved} />
					{previewFailure.failed ? <p className="folder-artwork-preview-status" id={statusId} role="status">Preview unavailable</p> : null}
				</div>
				{hasUrl && !previewFailure.failed ? (
					<div
						className={`folder-artwork-preview-frame${previewHidden ? " is-preview-hidden" : ""}`}
						data-artwork-preview={field}
						data-artwork-preview-kind={preview}
						data-artwork-preview-shape={previewShape}
						data-artwork-preview-visible={previewHidden ? "false" : "true"}
						aria-hidden="true"
					>
						<img
							key={value}
							className="folder-artwork-preview-image"
							src={value}
							alt=""
							loading="lazy"
							decoding="async"
							referrerPolicy="no-referrer"
							draggable="false"
							onError={previewFailure.markFailed}
						/>
						{previewHidden && previewOverlayLabel ? <span className="folder-artwork-preview-overlay">{previewOverlayLabel}</span> : null}
					</div>
				) : null}
			</div>
		</div>
	);
}
