import { useEffect, useRef } from "react";
import {
	isValidNuvioTitle,
	isValidVisibleNuvioTitle,
	reversibleTitleFieldProps,
} from "../nuvio/titles.js";
import {
	missingCuratedFolderFocusOrientationNotice,
	missingCuratedFolderTileOrientationNotice,
} from "../folder-artwork-suggestions.js";
import {
	focusFirstDialogControl,
	handleDialogKeyDown,
	initializeTitleInput,
} from "./modal-focus.js";
import { CollectionPresentationChoices } from "./CollectionPresentationChoices.jsx";
import { CollectionArtworkField } from "./CollectionArtworkField.jsx";
import {
	FolderArtworkFields,
	useFolderArtworkSuggestions,
} from "./FolderArtworkFields.jsx";
import { folderSiblingTileShapeNotice } from "./node-editor.js";
import {
	COLLECTION_INVISIBLE_TITLE_HELP,
	CollectionTitleVisibilitySwitch,
	FOLDER_INVISIBLE_TITLE_HELP,
	FOLDER_TITLE_VISIBILITY_LABEL,
	FolderShapeChoices,
	FolderTitleVisibilityChoices,
	PresentationSwitch,
} from "./PresentationControls.jsx";

function TitleStatus({ original, replacementPending, statusId }) {
	if (original.supported || replacementPending) {
		return null;
	}

	return (
		<p className="editor-field-status" id={statusId}>
			{original.hasField
				? "The imported value is not text. Enter a valid text replacement before applying."
				: "The imported value is absent. Enter a valid text replacement before applying."}
		</p>
	);
}

function ChoiceStatus({ original, kind, replacementPending, statusId }) {
	if (original.supported || replacementPending) {
		return null;
	}

	const isLayout = kind === "layout";
	let message;
	if (original.status === "preserved") {
		message = isLayout
			? "This imported Follow Layout setting is being preserved. Choose Tabs or Rows only if you want to replace it."
			: "This imported Square shape is being preserved. Choose Poster or Landscape only if you want to replace it.";
	} else if (original.status === "absent") {
		message = isLayout
			? "No imported layout choice is set. Choose Tabs or Rows only if you want to add one."
			: "No imported tile shape is set. Choose Poster or Landscape only if you want to add one.";
	} else {
		message = isLayout
			? "The imported layout is not offered here and will be preserved until you choose Tabs or Rows."
			: "The imported tile shape is not offered here and will be preserved until you choose Poster or Landscape.";
	}

	return (
		<p className="editor-field-status" id={statusId}>
			{message}
		</p>
	);
}

function BooleanStatus({ original, label, replacementPending, statusId }) {
	if (original.supported || replacementPending) {
		return null;
	}

	return (
		<p className="editor-field-status" id={statusId}>
			{original.status === "absent"
				? `No imported ${label} preference is set. It will stay absent unless you use this switch.`
				: `The imported ${label} preference cannot be shown safely and will be preserved unless you use this switch.`}
		</p>
	);
}

function isSelected(value, canonicalValue) {
	return typeof value === "string" && value.toUpperCase() === canonicalValue;
}

function CollectionPresentationFields({ draft, prefix, onChange }) {
	const tabsSelected = isSelected(draft.values.viewMode, "TABBED_GRID");
	const rowsSelected = isSelected(draft.values.viewMode, "ROWS");
	const layoutReplacementPending = draft.touched.viewMode && (tabsSelected || rowsSelected);
	const allTabReplacementPending = (
		draft.touched.showAllTab
		&& typeof draft.values.showAllTab === "boolean"
	);
	const pinReplacementPending = (
		draft.touched.pinToTop
		&& typeof draft.values.pinToTop === "boolean"
	);
	const allTabDescriptionIds = [
		`${prefix}-all-tab-help`,
		!draft.original.showAllTab.supported && !allTabReplacementPending
			? `${prefix}-all-tab-status`
			: null,
	].filter(Boolean).join(" ");
	const pinDescriptionIds = [
		`${prefix}-pin-help`,
		!draft.original.pinToTop.supported && !pinReplacementPending
			? `${prefix}-pin-status`
			: null,
	].filter(Boolean).join(" ");

	return (
		<>
			<fieldset
				className="editor-field editor-choice-field"
				data-editor-field="viewMode"
				aria-describedby={`${prefix}-layout-help${
					draft.original.viewMode.supported || layoutReplacementPending
						? ""
						: ` ${prefix}-layout-status`
				}`}
			>
				<legend>How sources appear in this collection</legend>
				<p className="editor-field-help" id={`${prefix}-layout-help`}>
					Choose how each folder in this collection displays its sources in Nuvio.
				</p>
				<CollectionPresentationChoices
					selectedId={draft.values.viewMode}
					name={`${prefix}-layout`}
					onChange={(viewMode) => onChange("viewMode", viewMode)}
				/>
				<ChoiceStatus
					original={draft.original.viewMode}
					kind="layout"
					replacementPending={layoutReplacementPending}
					statusId={`${prefix}-layout-status`}
				/>
			</fieldset>

			<div className="editor-switch-field" data-editor-field="showAllTab">
				<PresentationSwitch
					label="Include an All tab when using Tabs"
					description={tabsSelected
						? "For each folder with two or more sources, adds an All tab that combines its sources."
						: "Rows do not show tabs. This preference will be used if the collection is later changed to Tabs."}
					descriptionId={`${prefix}-all-tab-help`}
					describedBy={allTabDescriptionIds}
					controlName="showAllTab"
					checked={draft.values.showAllTab}
					onChange={(checked) => onChange("showAllTab", checked)}
				/>
				<BooleanStatus
					original={draft.original.showAllTab}
					label="All tab"
					replacementPending={allTabReplacementPending}
					statusId={`${prefix}-all-tab-status`}
				/>
			</div>

			<div className="editor-switch-field" data-editor-field="pinToTop">
				<PresentationSwitch
					label="Pin to top"
					description="Pinned collections appear before unpinned collections. In Builder exports, pinned collections keep their relative order from the collection list."
					descriptionId={`${prefix}-pin-help`}
					describedBy={pinDescriptionIds}
					controlName="pinToTop"
					checked={draft.values.pinToTop}
					onChange={(checked) => onChange("pinToTop", checked)}
				/>
				<BooleanStatus
					original={draft.original.pinToTop}
					label="pin to top"
					replacementPending={pinReplacementPending}
					statusId={`${prefix}-pin-status`}
				/>
			</div>
		</>
	);
}

function FolderPresentationFields({ draft, prefix, missingTileOrientationNotice, siblingNotice, suggestionSet, onChange }) {
	const posterSelected = isSelected(draft.values.tileShape, "POSTER");
	const landscapeSelected = isSelected(draft.values.tileShape, "LANDSCAPE");
	const shapeReplacementPending = draft.touched.tileShape && (posterSelected || landscapeSelected);
	const missingTileOrientationNoticeId = `${prefix}-shape-curated-orientation-notice`;
	const siblingNoticeId = `${prefix}-shape-sibling-notice`;
	const describedBy = [
		`${prefix}-shape-help`,
		draft.original.tileShape.supported || shapeReplacementPending
			? null
			: `${prefix}-shape-status`,
		missingTileOrientationNotice ? missingTileOrientationNoticeId : null,
		siblingNotice ? siblingNoticeId : null,
	].filter(Boolean).join(" ");

	return (
		<fieldset
			className="editor-field editor-choice-field"
			data-editor-field="tileShape"
			aria-describedby={describedBy}
		>
			<legend>Tile shape</legend>
			<p className="editor-field-help" id={`${prefix}-shape-help`}>
				Choose the shape of this folder card in Nuvio.
			</p>
			<FolderShapeChoices
				selectedId={draft.values.tileShape}
				name={`${prefix}-shape`}
				idPrefix={prefix}
				onChange={(tileShape) => {
					if (isSelected(draft.values.tileShape, tileShape)) return;
					onChange("tileShape", tileShape, { suggestionSet });
				}}
			/>
			<ChoiceStatus
				original={draft.original.tileShape}
				kind="shape"
				replacementPending={shapeReplacementPending}
				statusId={`${prefix}-shape-status`}
			/>
			{missingTileOrientationNotice ? (
				<p
					className="folder-settings-notice is-capability"
					id={missingTileOrientationNoticeId}
					data-missing-curated-orientation="true"
					role="status"
					aria-live="polite"
				>
					{missingTileOrientationNotice}
				</p>
			) : null}
			{siblingNotice ? (
				<p
					className="folder-settings-notice is-sibling"
					id={siblingNoticeId}
					data-sibling-shape-notice="true"
					role="status"
					aria-live="polite"
				>
					{siblingNotice}
				</p>
			) : null}
		</fieldset>
	);
}

function FolderVisibilityStatus({ original, replacementPending, statusId }) {
	if (original.supported || replacementPending) {
		return null;
	}

	return (
		<p className="editor-field-status" id={statusId}>
			{original.status === "absent"
				? "No imported home-screen title preference is set. It will stay absent until you choose a visibility option."
				: "The imported home-screen title preference cannot be shown safely and will be preserved until you choose a visibility option."}
		</p>
	);
}

function FolderTitleVisibilityField({ draft, prefix, onChange }) {
	const hideEverywhere = draft.values.folderTitleVisibility === "HIDE_EVERYWHERE";
	const replacementPending = draft.touched.folderTitleVisibility && (
		!hideEverywhere || draft.canonicalizeFolderInvisibleTitle
	);
	const statusId = `${prefix}-title-visibility-status`;

	return (
		<fieldset
			className="editor-field editor-choice-field editor-compact-radio-field"
			data-editor-field="folderTitleVisibility"
			aria-describedby={
				draft.original.hideTitle.supported || replacementPending
					? undefined
					: statusId
			}
		>
			<legend>{FOLDER_TITLE_VISIBILITY_LABEL}</legend>
			<FolderTitleVisibilityChoices
				selectedId={draft.values.folderTitleVisibility}
				name={`${prefix}-title-visibility`}
				onChange={(folderTitleVisibility) => onChange("folderTitleVisibility", folderTitleVisibility)}
			/>
			<FolderVisibilityStatus
				original={draft.original.hideTitle}
				replacementPending={replacementPending}
				statusId={statusId}
			/>
		</fieldset>
	);
}

function SettingsSection({ prefix, slug, title, children }) {
	const headingId = `${prefix}-${slug}-heading`;

	return (
		<section
			className="editor-settings-section"
			data-settings-section={slug}
			aria-labelledby={headingId}
		>
			<h3 id={headingId}>{title}</h3>
			<div className="editor-settings-section-content">
				{children}
			</div>
		</section>
	);
}

function InvisibleCollectionTitleField({ draft, prefix, onChange }) {
	return (
		<div className="editor-switch-field" data-editor-field="hideNuvioTitle">
			<CollectionTitleVisibilitySwitch
				descriptionId={`${prefix}-hidden-title-help`}
				checked={draft.values.hideNuvioTitle}
				onChange={(checked) => onChange("hideNuvioTitle", checked)}
			/>
		</div>
	);
}

function RenameFolderInvisibleTitleField({ draft, prefix, onChange }) {
	const hiddenEverywhere = draft.values.folderTitleVisibility === "HIDE_EVERYWHERE";

	return (
		<div className="editor-switch-field" data-editor-field="folderTitleVisibility">
			<PresentationSwitch
				label="Hide folder title everywhere in Nuvio"
				description="Uses an invisible character to hide the folder title on the home screen and when the folder is opened."
				descriptionId={`${prefix}-hidden-title-help`}
				controlName="hideFolderTitleEverywhere"
				checked={hiddenEverywhere}
				onChange={(checked) => onChange(
					"folderTitleVisibility",
					checked ? "HIDE_EVERYWHERE" : draft.renameVisibleFolderTitleVisibility,
				)}
			/>
		</div>
	);
}

export function NodeEditor({
	draft,
	diagnostics,
	titleInputRef,
	mode = "settings",
	folderArtworkSuggestionContext = null,
	folderSiblings = [],
	onChange,
	onSubmit,
	onCancel,
}) {
	const noun = draft.nodeType === "folder" ? "folder" : "collection";
	const renameOnly = mode === "rename";
	const context = renameOnly
		? `Rename ${noun}`
		: noun === "folder"
			? "Folder settings"
			: "Collection settings";
	const prefix = `node-editor-${noun}`;
	const { suggestionSet, suggestionState } = useFolderArtworkSuggestions(
		draft.nodeType === "folder" && !renameOnly ? folderArtworkSuggestionContext : null,
	);
	const missingTileOrientationNotice = draft.nodeType === "folder" && !renameOnly
		? missingCuratedFolderTileOrientationNotice({
			suggestionSet,
			currentTileUrl: draft.values.coverImageUrl,
			requestedShape: draft.values.tileShape,
			shapeTouched: draft.touched.tileShape,
		})
		: null;
	const missingFocusOrientationNotice = draft.nodeType === "folder" && !renameOnly
		? missingCuratedFolderFocusOrientationNotice({
			suggestionSet,
			currentFocusUrl: draft.values.focusGifUrl,
			requestedShape: draft.values.tileShape,
			shapeTouched: draft.touched.tileShape,
		})
		: null;
	const siblingShapeNotice = draft.nodeType === "folder" && !renameOnly
		? folderSiblingTileShapeNotice({
			currentFolderInternalId: draft.internalId,
			currentDraftShape: draft.values.tileShape,
			shapeTouched: draft.touched.tileShape,
			siblingFolders: folderSiblings,
		})
		: null;
	const titleError = diagnostics.find((entry) => entry.path === "$ui.editor.title") ?? null;
	const dialogRef = useRef(null);
	const initializedTitleTargetRef = useRef(null);
	const titleHiddenEverywhere = draft.nodeType === "collection"
		? draft.values.hideNuvioTitle
		: draft.values.folderTitleVisibility === "HIDE_EVERYWHERE";
	const titleReplacementPending = draft.touched.title && (
		draft.nodeType === "collection" && draft.values.hideNuvioTitle
			? isValidNuvioTitle(draft.values.title)
			: isValidVisibleNuvioTitle(draft.values.title)
	) || (
		draft.nodeType === "folder"
		&& draft.values.folderTitleVisibility === "HIDE_EVERYWHERE"
		&& (
			draft.original.title.hidden
			|| draft.canonicalizeFolderInvisibleTitle
		)
	);

	useEffect(() => {
		if (
			draft.nodeType === "folder"
			&& !renameOnly
			&& draft.touched.tileShape
			&& suggestionSet !== null
		) {
			onChange("tileShape", draft.values.tileShape, {
				suggestionSet,
				recheckCurrentShape: true,
			});
		}
	}, [suggestionSet]);

	useEffect(() => {
		const outcome = initializeTitleInput(titleInputRef.current, {
			targetId: draft.internalId,
			initializedTargetId: initializedTitleTargetRef.current,
			selectText: draft.original.title.supported
				&& isValidVisibleNuvioTitle(draft.values.title)
				&& !titleHiddenEverywhere,
		});
		initializedTitleTargetRef.current = outcome.initializedTargetId;
		if (outcome.initialized && !outcome.focused) {
			focusFirstDialogControl(dialogRef.current);
		}
	}, [draft.internalId, titleHiddenEverywhere, titleInputRef, draft.original.title.supported, draft.values.title]);

	useEffect(() => {
		document.body.classList.add("settings-modal-open");
		return () => document.body.classList.remove("settings-modal-open");
	}, []);

	function describedBy(diagnostic) {
		const ids = [`${prefix}-title-help`];
		if (!draft.original.title.supported && !titleReplacementPending) {
			ids.push(`${prefix}-title-status`);
		}
		if (diagnostic) ids.push(`${prefix}-title-error`);
		return ids.join(" ");
	}

	const titleField = (
		<div className="editor-field">
			<label htmlFor={`${prefix}-title-input`}>Title</label>
			<input
				ref={titleInputRef}
				id={`${prefix}-title-input`}
				name="title"
				type="text"
				{...reversibleTitleFieldProps(draft.values.title, titleHiddenEverywhere)}
				data-editor-field="title"
				aria-invalid={titleError ? "true" : undefined}
				aria-describedby={describedBy(titleError)}
				onChange={(event) => onChange("title", event.target.value)}
			/>
			<p className="editor-field-help" id={`${prefix}-title-help`}>
				{draft.nodeType === "folder" && draft.values.folderTitleVisibility === "HIDE_EVERYWHERE"
					? FOLDER_INVISIBLE_TITLE_HELP
					: draft.nodeType === "collection" && draft.values.hideNuvioTitle
					? COLLECTION_INVISIBLE_TITLE_HELP
					: `Displayed as the ${noun} title in Nuvio.`}
			</p>
			<TitleStatus
				original={draft.original.title}
				replacementPending={titleReplacementPending}
				statusId={`${prefix}-title-status`}
			/>
		</div>
	);

	return (
		<div
			className="settings-modal-backdrop"
			data-settings-modal-backdrop="true"
			data-backdrop-dismiss="false"
			onMouseDown={(event) => {
				if (event.target === event.currentTarget) {
					event.preventDefault();
					dialogRef.current?.focus();
				}
			}}
		>
			<section
				ref={dialogRef}
				className={`node-editor${renameOnly ? " is-rename-editor" : ""}`}
				data-node-editor={noun}
				data-editor-mode={renameOnly ? "rename" : "settings"}
				data-settings-modal="true"
				role="dialog"
				aria-modal="true"
				aria-labelledby={`${prefix}-title`}
				tabIndex={-1}
				onKeyDown={(event) => handleDialogKeyDown(event, dialogRef.current, onCancel)}
			>
				<div className="node-editor-heading">
					<div>
						<p className="panel-kicker">{renameOnly ? "Quick rename" : "Presentation settings"}</p>
						<h2 id={`${prefix}-title`}>{context}</h2>
					</div>
					<p>{renameOnly
						? `Update the title visibility for this ${noun}.`
						: `Update the title and presentation for this ${noun}.`}</p>
				</div>

				<form className="node-editor-form" onSubmit={onSubmit} noValidate>
					{renameOnly ? (
						<>
							{titleField}
							{draft.nodeType === "collection" ? (
								<InvisibleCollectionTitleField draft={draft} prefix={prefix} onChange={onChange} />
							) : (
								<RenameFolderInvisibleTitleField draft={draft} prefix={prefix} onChange={onChange} />
							)}
						</>
					) : draft.nodeType === "collection" ? (
						<>
							<SettingsSection prefix={prefix} slug="basic-details" title="Basic details">
								{titleField}
							</SettingsSection>
							<SettingsSection prefix={prefix} slug="display" title="Display">
								<InvisibleCollectionTitleField draft={draft} prefix={prefix} onChange={onChange} />
								<CollectionPresentationFields draft={draft} prefix={prefix} onChange={onChange} />
							</SettingsSection>
							<SettingsSection prefix={prefix} slug="artwork" title="Artwork">
								<CollectionArtworkField
									values={draft.values}
									original={draft.original}
									touched={draft.touched}
									prefix={`${prefix}-artwork`}
									onChange={onChange}
								/>
							</SettingsSection>
						</>
					) : (
						<>
							<SettingsSection prefix={prefix} slug="basic-details" title="Basic details">
								{titleField}
							</SettingsSection>
							<SettingsSection prefix={prefix} slug="display" title="Display">
								<FolderTitleVisibilityField draft={draft} prefix={prefix} onChange={onChange} />
								<FolderPresentationFields
									draft={draft}
									prefix={prefix}
									missingTileOrientationNotice={missingTileOrientationNotice}
									siblingNotice={siblingShapeNotice}
									suggestionSet={suggestionSet}
									onChange={onChange}
								/>
							</SettingsSection>
							<SettingsSection prefix={prefix} slug="artwork" title="Artwork">
								<FolderArtworkFields
									values={draft.values}
									original={draft.original}
									touched={draft.touched}
									prefix={`${prefix}-artwork`}
									suggestionSet={suggestionSet}
									suggestionState={suggestionState}
									missingFocusOrientationNotice={missingFocusOrientationNotice}
									onChange={onChange}
								/>
							</SettingsSection>
						</>
					)}

					<div className="editor-diagnostics" role="alert" aria-atomic="true">
						{diagnostics.length > 0 ? (
							<ul>
								{diagnostics.map((entry) => (
									<li
										key={entry.code}
										id={`${prefix}-title-error`}
									>
										{entry.message}
									</li>
								))}
							</ul>
						) : null}
					</div>

					<div className="node-editor-actions">
						<button className="editor-apply" type="submit" data-action="apply-node-edit">Apply</button>
						<button className="editor-cancel" type="button" data-action="cancel-node-edit" onClick={onCancel}>Cancel</button>
					</div>
				</form>
			</section>
		</div>
	);
}
