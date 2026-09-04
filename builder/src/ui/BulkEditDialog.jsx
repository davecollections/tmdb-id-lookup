import { useEffect, useRef } from "react";
import { handleDialogKeyDown } from "./modal-focus.js";
import { SemanticSortChoices } from "./SemanticSortChoices.jsx";
import {
	BULK_EDIT_NO_CHANGE,
	hasBulkEditChanges,
} from "./bulk-edit.js";

export const BULK_EDIT_TITLE_CONFIRMATION_MESSAGE = "This will replace the current titles. Make sure you’re happy to lose those names before continuing, as this action cannot be undone.";

const fieldOptions = Object.freeze({
	layout: [
		{ id: BULK_EDIT_NO_CHANGE, label: "No change" },
		{ id: "TABBED_GRID", label: "Tabs" },
		{ id: "ROWS", label: "Rows" },
	],
	showAllTab: [
		{ id: BULK_EDIT_NO_CHANGE, label: "No change" },
		{ id: "ON", label: "On" },
		{ id: "OFF", label: "Off" },
	],
	pinToTop: [
		{ id: BULK_EDIT_NO_CHANGE, label: "No change" },
		{ id: "ON", label: "On" },
		{ id: "OFF", label: "Off" },
	],
	collectionTitles: [
		{ id: BULK_EDIT_NO_CHANGE, label: "No change" },
		{ id: "HIDE", label: "Hide" },
	],
	folderTitleVisibility: [
		{ id: BULK_EDIT_NO_CHANGE, label: "No change" },
		{ id: "SHOW_EVERYWHERE", label: "Show everywhere" },
		{ id: "HIDE_HOME_SCREEN", label: "Hide on home only" },
		{ id: "HIDE_EVERYWHERE", label: "Hide everywhere" },
	],
	focusArtwork: [
		{ id: BULK_EDIT_NO_CHANGE, label: "No change" },
		{ id: "SHOW", label: "Show" },
		{ id: "HIDE", label: "Hide" },
	],
});

function BulkEditField({
	field,
	label,
	value,
	onChange,
	describedBy = null,
	disabledOptions = [],
}) {
	return (
		<SemanticSortChoices
			options={fieldOptions[field]}
			selectedId={value}
			name={field}
			legend={label}
			disabledIds={disabledOptions}
			fieldsetProps={{
				"data-bulk-edit-field": field,
				"aria-describedby": describedBy || undefined,
			}}
			onChange={(nextValue) => onChange(field, nextValue)}
		/>
	);
}

export function BulkEditDialog({
	draft,
	diagnostics,
	availability,
	onChange,
	onSubmit,
	onCancel,
}) {
	const dialogRef = useRef(null);
	const diagnosticsRef = useRef(null);

	useEffect(() => {
		dialogRef.current?.focus();
	}, []);

	useEffect(() => {
		if (diagnostics.length > 0) diagnosticsRef.current?.focus();
	}, [diagnostics]);

	useEffect(() => {
		document.body.classList.add("settings-modal-open");
		return () => document.body.classList.remove("settings-modal-open");
	}, []);

	const visibleFolderTitleOptionsDisabled = availability.folderVisibleTitlesAvailable
		? []
		: ["SHOW_EVERYWHERE", "HIDE_HOME_SCREEN"];

	return (
		<div
			className="settings-modal-backdrop"
			data-bulk-edit-modal-backdrop="true"
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
				className="node-editor bulk-edit-dialog"
				data-bulk-edit-dialog="true"
				data-settings-modal="true"
				role="dialog"
				aria-modal="true"
				aria-labelledby="bulk-edit-title"
				aria-describedby="bulk-edit-description"
				tabIndex={-1}
				onKeyDown={(event) => handleDialogKeyDown(event, dialogRef.current, onCancel)}
			>
				<div className="node-editor-heading">
					<div>
						<p className="panel-kicker">ALL COLLECTIONS &amp; FOLDERS</p>
						<h2 id="bulk-edit-title">Global display settings</h2>
					</div>
					<p id="bulk-edit-description">Changes apply across all Collections and Folders.</p>
				</div>

				<form className="node-editor-form bulk-edit-form" onSubmit={onSubmit} noValidate>
					<fieldset className="editor-settings-section bulk-edit-section" disabled={!availability.hasCollections}>
						<legend>Collections</legend>
						{!availability.hasCollections ? <p className="bulk-edit-availability">No Collections to update.</p> : null}
						<div className="editor-settings-section-content">
							<BulkEditField field="layout" label="Layout" value={draft.layout} onChange={onChange} />
							<BulkEditField field="showAllTab" label="Show All tab" value={draft.showAllTab} onChange={onChange} />
							<BulkEditField field="pinToTop" label="Pin to Top" value={draft.pinToTop} onChange={onChange} />
							<BulkEditField field="collectionTitles" label="Collection titles" value={draft.collectionTitles} onChange={onChange} />
						</div>
					</fieldset>

					<fieldset className="editor-settings-section bulk-edit-section" disabled={!availability.hasFolders}>
						<legend>Folders</legend>
						{!availability.hasFolders ? <p className="bulk-edit-availability">No Folders to update.</p> : null}
						<div className="editor-settings-section-content">
							<BulkEditField
								field="folderTitleVisibility"
								label="Title visibility"
								value={draft.folderTitleVisibility}
								onChange={onChange}
								describedBy={!availability.folderVisibleTitlesAvailable && availability.hasFolders
									? "bulk-edit-folder-title-availability"
									: null}
								disabledOptions={visibleFolderTitleOptionsDisabled}
							/>
							{!availability.folderVisibleTitlesAvailable && availability.hasFolders ? (
								<p className="bulk-edit-availability" id="bulk-edit-folder-title-availability">
									Show options are unavailable because at least one Folder does not have a visible title.
								</p>
							) : null}
							<BulkEditField
								field="focusArtwork"
								label="Focus GIF"
								value={draft.focusArtwork}
								onChange={onChange}
								describedBy="bulk-edit-focus-gif-description"
							/>
							<p className="bulk-edit-field-description" id="bulk-edit-focus-gif-description">
								Controls whether folder Focus GIFs are shown.
							</p>
						</div>
					</fieldset>

					<div
						ref={diagnosticsRef}
						className="editor-diagnostics"
						data-bulk-edit-diagnostics="true"
						role="alert"
						aria-atomic="true"
						tabIndex={-1}
					>
						{diagnostics.length > 0 ? (
							<ul>{diagnostics.map((entry) => <li key={`${entry.code}:${entry.path}`}>{entry.message}</li>)}</ul>
						) : null}
					</div>

					<div className="node-editor-actions bulk-edit-actions">
						<button
							className="editor-apply"
							type="submit"
							data-action="apply-bulk-edit"
							disabled={!hasBulkEditChanges(draft)}
						>
							Apply changes
						</button>
						<button className="editor-cancel" type="button" data-action="cancel-bulk-edit" onClick={onCancel}>Cancel</button>
					</div>
				</form>
			</section>
		</div>
	);
}

export function BulkEditTitleConfirmation({ onCancel, onContinue }) {
	const dialogRef = useRef(null);
	const cancelButtonRef = useRef(null);

	useEffect(() => {
		cancelButtonRef.current?.focus();
	}, []);

	useEffect(() => {
		document.body.classList.add("settings-modal-open");
		return () => document.body.classList.remove("settings-modal-open");
	}, []);

	return (
		<div
			className="settings-modal-backdrop delete-modal-backdrop bulk-title-confirmation-backdrop"
			data-bulk-title-confirmation-backdrop="true"
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
				className="delete-confirmation bulk-title-confirmation"
				data-bulk-title-confirmation="true"
				role="dialog"
				aria-modal="true"
				aria-labelledby="bulk-title-confirmation-title"
				aria-describedby="bulk-title-confirmation-description"
				tabIndex={-1}
				onKeyDown={(event) => handleDialogKeyDown(event, dialogRef.current, onCancel)}
			>
				<div className="delete-confirmation-heading">
					<p className="panel-kicker">Title confirmation</p>
					<h2 id="bulk-title-confirmation-title">Replace current titles?</h2>
					<p id="bulk-title-confirmation-description">{BULK_EDIT_TITLE_CONFIRMATION_MESSAGE}</p>
				</div>
				<div className="delete-confirmation-actions">
					<button ref={cancelButtonRef} className="editor-cancel" type="button" data-action="cancel-bulk-title-confirmation" onClick={onCancel}>Cancel</button>
					<button className="danger-action bulk-title-confirm-action" type="button" data-action="continue-bulk-title-confirmation" onClick={onContinue}>Continue</button>
				</div>
			</section>
		</div>
	);
}
