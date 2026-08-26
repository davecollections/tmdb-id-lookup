import { useEffect, useState } from "react";
import {
	folderArtworkRequestForField,
	folderArtworkSuggestionForField,
	loadFolderArtworkSuggestions,
} from "../folder-artwork-suggestions.js";
import { FOLDER_ARTWORK_FIELD_GROUPS } from "../nuvio/folder-artwork-fields.js";
import { PresentationSwitch } from "./PresentationControls.jsx";
import { hasPreviewUrl, useExactUrlPreviewFailure } from "./exact-url-preview.js";
import { ExactImageUrlField } from "./ExactImageUrlField.jsx";

function previewShape(preview, tileShape) {
	if (preview === "backdrop") return "wide";
	if (preview === "logo") return "logo";
	if (tileShape === "POSTER") return "poster";
	if (tileShape === "LANDSCAPE") return "landscape";
	return "unknown";
}

function videoFieldDescriptionIds(prefix, field, preserved, failed) {
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

function SuggestedArtwork({
	descriptor,
	value,
	tileShape,
	preserved,
	prefix,
	suggestionSet,
	onChange,
}) {
	const { field, label, preview } = descriptor;
	const suggestionUrl = folderArtworkSuggestionForField(suggestionSet, field, tileShape);
	const previewFailure = useExactUrlPreviewFailure(suggestionUrl);
	const request = suggestionUrl === null ? folderArtworkRequestForField(suggestionSet, field, tileShape) : null;
	if (preserved || typeof value !== "string" || value.trim().length > 0 || (suggestionUrl === null && request === null)) return null;
	if (request !== null) {
		return (
			<a
				className="secondary-action folder-artwork-request-action"
				data-artwork-request={field}
				href={request.href}
				target="_blank"
				rel="noopener noreferrer"
				aria-label={`Request artwork for ${label} (opens in a new tab)`}
			>
				Request artwork <span aria-hidden="true">↗</span>
			</a>
		);
	}
	const statusId = `${prefix}-${field}-suggestion-status`;

	return (
		<div className="folder-artwork-suggestion" data-artwork-suggestion={field}>
			{!previewFailure.failed ? (
				<div
					className="folder-artwork-preview-frame folder-artwork-suggestion-frame"
					data-artwork-suggestion-preview={field}
					data-artwork-preview-shape={previewShape(preview, tileShape)}
					aria-hidden="true"
				>
					<img
						key={suggestionUrl}
						className="folder-artwork-preview-image"
						src={suggestionUrl}
						alt=""
						loading="lazy"
						decoding="async"
						referrerPolicy="no-referrer"
						draggable="false"
						onError={previewFailure.markFailed}
					/>
				</div>
			) : null}
			<div className="folder-artwork-suggestion-copy">
				<p>Curated artwork</p>
				{previewFailure.failed ? <p className="folder-artwork-preview-status" id={statusId} role="status">Curated preview unavailable</p> : null}
				<button
					type="button"
					className="secondary-action folder-artwork-suggestion-action"
					aria-label={`Use curated artwork for ${label}`}
					onClick={() => onChange(field, suggestionUrl)}
				>
					Use curated artwork
				</button>
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
	const describedBy = videoFieldDescriptionIds(prefix, field, preserved, previewFailure.failed);

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

function artworkField({ descriptor, values, original, touched, prefix, suggestionSet, descriptionId, onChange }) {
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
	if (inputType === "url") {
		return (
			<>
				<ExactImageUrlField
					{...common}
					previewShape={previewShape(preview, values?.tileShape)}
					previewHidden={field === "focusGifUrl" && values?.focusGifEnabled !== true}
					previewOverlayLabel={field === "focusGifUrl" ? "Hidden in Nuvio" : null}
					descriptionId={descriptionId}
				/>
				<SuggestedArtwork
					descriptor={descriptor}
					value={common.value}
					tileShape={values?.tileShape}
					preserved={preserved}
					prefix={prefix}
					suggestionSet={suggestionSet}
					onChange={onChange}
				/>
			</>
		);
	}
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

export function useFolderArtworkSuggestions(suggestionContext = null) {
	const [suggestionSet, setSuggestionSet] = useState(null);
	const [suggestionState, setSuggestionState] = useState("loading");
	const folder = suggestionContext?.folder ?? null;
	const peopleManifestClient = suggestionContext?.peopleManifestClient ?? null;
	const peopleProvider = suggestionContext?.peopleProvider ?? null;
	const artworkRuntimeClient = suggestionContext?.artworkRuntimeClient ?? null;
	const studioCatalogueProvider = suggestionContext?.studioCatalogueProvider ?? null;
	const networkCatalogueProvider = suggestionContext?.networkCatalogueProvider ?? null;

	useEffect(() => {
		let active = true;
		setSuggestionSet(null);
		setSuggestionState("loading");
		loadFolderArtworkSuggestions({
			folder,
			peopleManifestClient,
			peopleProvider,
			artworkRuntimeClient,
			studioCatalogueProvider,
			networkCatalogueProvider,
		}).then((result) => {
			if (active) {
				setSuggestionSet(result);
				setSuggestionState(result === null ? "none" : "ready");
			}
		}).catch(() => {
			if (active) {
				setSuggestionSet(null);
				setSuggestionState("none");
			}
		});
		return () => { active = false; };
	}, [folder, peopleManifestClient, peopleProvider, artworkRuntimeClient, studioCatalogueProvider, networkCatalogueProvider]);

	return Object.freeze({ suggestionSet, suggestionState });
}

export function FolderArtworkFields({
	values,
	prefix,
	original = null,
	touched = null,
	suggestionSet = null,
	suggestionState = "loading",
	missingFocusOrientationNotice = null,
	onChange,
}) {
	const missingFocusOrientationNoticeId = `${prefix}-focusGifUrl-orientation-notice`;

	return (
		<div
			className="folder-artwork-fields"
			data-folder-artwork-fields="true"
			data-folder-artwork-suggestions={suggestionState}
		>
			{FOLDER_ARTWORK_FIELD_GROUPS.map(({ slug, title, fields }) => {
				const headingId = `${prefix}-${slug}-heading`;
				const visibleFields = fields.filter((descriptor) => isVisibleArtworkField(descriptor, original));
				return (
					<section className="folder-artwork-group" data-artwork-group={slug} aria-labelledby={headingId} key={slug}>
						<h4 id={headingId}>{title}</h4>
						<div className="folder-artwork-group-fields">
							{visibleFields.map((descriptor) => <div key={descriptor.field}>{artworkField({
								descriptor,
								values,
								original,
								touched,
								prefix,
								suggestionSet,
								descriptionId: descriptor.field === "focusGifUrl" && missingFocusOrientationNotice
									? missingFocusOrientationNoticeId
									: null,
								onChange,
							})}</div>)}
							{slug === "focus" && missingFocusOrientationNotice ? (
								<p
									className="folder-settings-notice is-capability"
									id={missingFocusOrientationNoticeId}
									data-missing-curated-focus-orientation="true"
									role="status"
									aria-live="polite"
								>
									{missingFocusOrientationNotice}
								</p>
							) : null}
							{slug === "focus" ? (
								<div className="editor-switch-field folder-focus-enabled-field is-content-sized" data-editor-field="focusGifEnabled">
									<PresentationSwitch
										label="Show Focus GIF"
										description={values?.focusGifEnabled === true
											? "Shown when focused."
											: "Hidden in Nuvio; the URL is kept."}
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
