import { useState } from "react";
import { FOLDER_ARTWORK_FIELD_GROUPS } from "../nuvio/folder-artwork-fields.js";
import { PresentationSwitch } from "./PresentationControls.jsx";
import { hasPreviewUrl, useExactUrlPreviewFailure } from "./exact-url-preview.js";

function previewShape(preview, tileShape) {
	if (preview === "backdrop") return "wide";
	if (preview === "logo") return "logo";
	if (tileShape === "POSTER") return "poster";
	if (tileShape === "LANDSCAPE") return "landscape";
	return "unknown";
}

function fieldDescriptionIds(prefix, field, preserved, failed) {
	return [
		`${prefix}-${field}-help`,
		preserved ? `${prefix}-${field}-preserved` : null,
		failed ? `${prefix}-${field}-preview-status` : null,
	].filter(Boolean).join(" ");
}

function PreservedFieldStatus({ id, preserved }) {
	if (!preserved) return null;
	return <p className="editor-field-status" id={id}>The current imported value is preserved until this field is edited.</p>;
}

function ExactImagePreviewField({ descriptor, value, prefix, preserved, tileShape, onChange }) {
	const { field, label, description, preview } = descriptor;
	const previewFailure = useExactUrlPreviewFailure(value);
	const hasUrl = hasPreviewUrl(value);
	const shape = previewShape(preview, tileShape);
	const helpId = `${prefix}-${field}-help`;
	const preservedId = `${prefix}-${field}-preserved`;
	const statusId = `${prefix}-${field}-preview-status`;
	const describedBy = fieldDescriptionIds(prefix, field, preserved, previewFailure.failed);

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
						className="folder-artwork-preview-frame"
						data-artwork-preview={field}
						data-artwork-preview-kind={preview}
						data-artwork-preview-shape={shape}
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
					</div>
				) : null}
			</div>
		</div>
	);
}

function TextArtworkField({ descriptor, value, prefix, preserved, onChange }) {
	const { field, label, description } = descriptor;
	const helpId = `${prefix}-${field}-help`;
	const preservedId = `${prefix}-${field}-preserved`;
	return (
		<div className="editor-field folder-artwork-text-field" data-editor-field={field}>
			<label htmlFor={`${prefix}-${field}`}>{label}</label>
			<input
				id={`${prefix}-${field}`}
				type="text"
				value={value}
				autoComplete="off"
				spellCheck="false"
				aria-describedby={[helpId, preserved ? preservedId : null].filter(Boolean).join(" ")}
				onChange={(event) => onChange(field, event.target.value)}
			/>
			<p className="editor-field-help" id={helpId}>{description}</p>
			<PreservedFieldStatus id={preservedId} preserved={preserved} />
		</div>
	);
}

function ExactVideoPreviewField({ descriptor, value, prefix, preserved, onChange }) {
	const { field, label, description } = descriptor;
	const [activeUrl, setActiveUrl] = useState(null);
	const previewFailure = useExactUrlPreviewFailure(value);
	const hasUrl = hasPreviewUrl(value);
	const previewActive = hasUrl && activeUrl === value;
	const helpId = `${prefix}-${field}-help`;
	const preservedId = `${prefix}-${field}-preserved`;
	const statusId = `${prefix}-${field}-preview-status`;
	const previewId = `${prefix}-${field}-preview`;
	const describedBy = fieldDescriptionIds(prefix, field, preserved, previewFailure.failed);

	function handleVideoError() {
		setActiveUrl(null);
		previewFailure.markFailed();
	}

	return (
		<div className={`editor-field folder-artwork-url-field folder-artwork-video-field${hasUrl ? " has-preview" : ""}`} data-editor-field={field}>
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
				onChange={(event) => {
					setActiveUrl(null);
					onChange(field, event.target.value);
				}}
			/>
			<p className="editor-field-help" id={helpId}>{description}</p>
			<PreservedFieldStatus id={preservedId} preserved={preserved} />
			{previewFailure.failed ? <p className="folder-artwork-preview-status" id={statusId} role="status">Preview unavailable</p> : null}
			{hasUrl ? (
				<div className="folder-artwork-video-preview" data-artwork-preview={field} data-artwork-preview-kind="video">
					<button
						type="button"
						className="secondary-action folder-artwork-preview-button"
						aria-controls={previewId}
						aria-expanded={previewActive}
						onClick={() => {
							previewFailure.resetFailure();
							setActiveUrl(previewActive ? null : value);
						}}
					>
						{previewActive ? "Close video preview" : "Preview video"}
					</button>
					{previewActive ? (
						<div className="folder-artwork-video-frame" id={previewId}>
							<video
								key={value}
								src={value}
								controls
								playsInline
								preload="metadata"
								onError={handleVideoError}
							/>
						</div>
					) : null}
				</div>
			) : null}
		</div>
	);
}

function artworkField({ descriptor, values, original, touched, prefix, onChange }) {
	const { field, inputType, preview } = descriptor;
	const preserved = original?.[field]?.hasField === true && !original[field].supported && touched?.[field] !== true;
	const common = {
		descriptor,
		value: values?.[field] ?? "",
		prefix,
		preserved,
		onChange,
	};
	if (preview === "video") return <ExactVideoPreviewField {...common} />;
	if (inputType === "url") return <ExactImagePreviewField {...common} tileShape={values?.tileShape} />;
	return <TextArtworkField {...common} />;
}

function isVisibleArtworkField(descriptor, original) {
	if (descriptor.visibleInSettings === false) return false;
	if (descriptor.field !== "heroVideoUrl") return true;
	const openingValue = original?.heroVideoUrl;
	return openingValue?.supported === true
		&& typeof openingValue.value === "string"
		&& openingValue.value.trim().length > 0;
}

export function FolderArtworkFields({ values, prefix, original = null, touched = null, onChange }) {
	return (
		<div className="folder-artwork-fields" data-folder-artwork-fields="true">
			{FOLDER_ARTWORK_FIELD_GROUPS.map(({ slug, title, fields }) => {
				const headingId = `${prefix}-${slug}-heading`;
				const visibleFields = fields.filter((descriptor) => isVisibleArtworkField(descriptor, original));
				return (
					<section className="folder-artwork-group" data-artwork-group={slug} aria-labelledby={headingId} key={slug}>
						<h4 id={headingId}>{title}</h4>
						<div className="folder-artwork-group-fields">
							{visibleFields.map((descriptor) => <div key={descriptor.field}>{artworkField({ descriptor, values, original, touched, prefix, onChange })}</div>)}
							{slug === "focus" ? (
								<div className="editor-switch-field folder-focus-enabled-field is-content-sized" data-editor-field="focusGifEnabled">
									<PresentationSwitch
										label="Enable focus artwork"
										description="Use this artwork for the focused state."
										descriptionId={`${prefix}-focus-enabled-help`}
										controlName="focusGifEnabled"
										checked={values?.focusGifEnabled === true}
										onChange={(checked) => onChange("focusGifEnabled", checked)}
									/>
								</div>
							) : null}
						</div>
					</section>
				);
			})}
		</div>
	);
}
