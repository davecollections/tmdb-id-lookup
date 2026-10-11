import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { lockAddSourceDocumentBody, observeAddSourceViewport, resolveAddSourceViewportStyle } from "./add-source-modal-lifecycle.js";
import { focusElementWithoutScroll } from "./hierarchy-menu-placement.js";
import { ScopedGenreExclusionDialog } from "./ScopedGenreExclusionDialog.jsx";
import { bindGlobalSettingsHistory } from "./scoped-genre-exclusion-ui.js";
import { handleDialogKeyDown } from "./modal-focus.js";
import { SemanticSortChoices } from "./SemanticSortChoices.jsx";
import { collectionShowAllDescription } from "./CollectionPresentationChoices.jsx";
import {
	BULK_EDIT_NO_CHANGE,
	hasBulkEditChanges,
} from "./bulk-edit.js";

const useBeforePaint = typeof window === "undefined" ? useEffect : useLayoutEffect;

export const BULK_EDIT_TITLE_CONFIRMATION_MESSAGE = "This will replace the current titles. Make sure you’re happy to lose those names before continuing, as this action cannot be undone.";

const fieldOptions = Object.freeze({
	layout: [
		{ id: BULK_EDIT_NO_CHANGE, label: "No change" },
		{ id: "TABBED_GRID", label: "Tabbed Grid" },
		{ id: "ROWS", label: "Rows" },
		{ id: "FOLLOW_LAYOUT", label: "Follow Home Layout" },
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
	draft, diagnostics, availability, onChange, onSubmit, onCancel,
	controller, project, onDiscardDisplay, confirmation = null, onCancelConfirmation, onContinueConfirmation,
}) {
	const [tab, setTab] = useState("display"), [guard, setGuard] = useState(false), [operation, setOperation] = useState(false);
	const [viewport, setViewport] = useState(() => typeof window === "undefined" ? null : resolveAddSourceViewportStyle(window));
	const dialogRef = useRef(null), diagnosticsRef = useRef(null), bodyRef = useRef(null);
	const displayTabRef = useRef(null), sourceTabRef = useRef(null), launcherRef = useRef(null), keepRef = useRef(null);
	const returnFocus = useRef(null), sourceBackRef = useRef(null), historyBackRef = useRef(null);
	historyBackRef.current = () => {
		if (confirmation) { onCancelConfirmation(); return true; }
		if (guard) { keepEditing(); return true; }
		if (operation) { sourceBackRef.current?.(); return true; }
		onCancel(); return false;
	};
	useBeforePaint(() => {
		const unlock = lockAddSourceDocumentBody(), stop = observeAddSourceViewport(setViewport);
		return () => { stop(); unlock(); };
	}, []);
	useEffect(() => bindGlobalSettingsHistory(window, () => historyBackRef.current()), []);
	useBeforePaint(() => {
		if (operation || confirmation) return;
		if (bodyRef.current) bodyRef.current.scrollTop = 0;
		focusElementWithoutScroll(guard ? keepRef.current : ({ display: displayTabRef.current, source: sourceTabRef.current, launcher: launcherRef.current }[returnFocus.current] ?? dialogRef.current));
		returnFocus.current = null;
	}, [operation, confirmation, guard, tab]);
	useEffect(() => { if (diagnostics.length > 0) focusElementWithoutScroll(diagnosticsRef.current); }, [diagnostics]);
	function switchTab(next) {
		if (next === tab) return;
		if (next === "source" && hasBulkEditChanges(draft)) { setGuard(true); return; }
		returnFocus.current = next; setTab(next);
	}
	function keepEditing() { returnFocus.current = "display"; setGuard(false); }
	function discardAndContinue() { onDiscardDisplay(); returnFocus.current = "source"; setGuard(false); setTab("source"); }
	function returnToSource() { returnFocus.current = "launcher"; setOperation(false); }
	function tabKey(event) {
		const next = { ArrowLeft: tab === "display" ? "source" : "display", ArrowRight: tab === "display" ? "source" : "display", Home: "display", End: "source" }[event.key];
		if (next) { event.preventDefault(); switchTab(next); }
	}
	const visibleFolderTitleOptionsDisabled = availability.folderVisibleTitlesAvailable ? [] : ["SHOW_EVERYWHERE", "HIDE_HOME_SCREEN"];
	const content = <div className="add-source-portal global-settings-portal" data-mobile-surface="opaque">
		<div className="settings-modal-backdrop add-source-backdrop global-settings-backdrop" style={viewport ?? undefined} data-bulk-edit-modal-backdrop="true" data-backdrop-dismiss="false" onMouseDown={(event) => {
			if (event.target === event.currentTarget) { event.preventDefault(); focusElementWithoutScroll(event.currentTarget.querySelector('[role="dialog"]')); }
		}}>
			{confirmation ? <BulkEditTitleConfirmation embedded onCancel={onCancelConfirmation} onContinue={onContinueConfirmation} /> : operation ?
				<ScopedGenreExclusionDialog controller={controller} project={project} onClose={returnToSource} backRef={sourceBackRef} /> :
				<section ref={dialogRef} className="node-editor bulk-edit-dialog global-settings-dialog" data-bulk-edit-dialog={guard ? undefined : "true"} data-global-settings-guard={guard || undefined} data-settings-modal="true" role="dialog" aria-modal="true" aria-labelledby={guard ? "global-settings-guard-title" : "bulk-edit-title"} aria-describedby={guard ? "global-settings-guard-description" : "bulk-edit-description"} tabIndex={-1} onKeyDown={(event) => handleDialogKeyDown(event, dialogRef.current, guard ? keepEditing : onCancel, { includeControl: (control) => control.getClientRects().length > 0 && !control.matches(":disabled") && control.tabIndex !== -1 })}>
					{guard ? <>
						<header className="global-settings-heading"><h2 id="global-settings-guard-title">Unsaved Display changes</h2></header>
						<div className="global-settings-body" ref={bodyRef}><p id="global-settings-guard-description">Keep editing your Display settings, or discard this draft to continue to Source management. Nothing has been applied.</p></div>
						<footer className="node-editor-actions global-settings-actions"><button ref={keepRef} type="button" className="editor-cancel" data-action="keep-editing-display" onClick={keepEditing}>Keep editing</button><button type="button" className="editor-apply" data-action="discard-display" onClick={discardAndContinue}>Discard &amp; continue</button></footer>
					</> : <>
						<header className="global-settings-heading"><h2 id="bulk-edit-title">Global settings</h2><p id="bulk-edit-description">Manage display settings and existing Sources in this project.</p></header>
						<div className="global-settings-tabs" role="tablist" aria-label="Global settings" onKeyDown={tabKey}>
							<button ref={displayTabRef} className="editor-cancel" type="button" role="tab" id="global-settings-display-tab" aria-selected={tab === "display"} aria-controls="global-settings-display-panel" tabIndex={tab === "display" ? 0 : -1} onClick={() => switchTab("display")}>Display settings</button>
							<button ref={sourceTabRef} className="editor-cancel" type="button" role="tab" id="global-settings-source-tab" aria-selected={tab === "source"} aria-controls="global-settings-source-panel" tabIndex={tab === "source" ? 0 : -1} onClick={() => switchTab("source")}>Source management</button>
						</div>
						<div hidden role="tabpanel" id={`global-settings-${tab === "display" ? "source" : "display"}-panel`} aria-labelledby={`global-settings-${tab === "display" ? "source" : "display"}-tab`} />
						{tab === "display" ? <>
							<form id="global-settings-display-panel" role="tabpanel" aria-labelledby="global-settings-display-tab" ref={bodyRef} className="node-editor-form bulk-edit-form global-settings-body" onSubmit={onSubmit} noValidate>
								<p className="editor-field-help">Changes apply across all Collections and Folders.</p>
					<fieldset className="editor-settings-section bulk-edit-section" disabled={!availability.hasCollections}>
						<legend>Collections</legend>
						{!availability.hasCollections ? <p className="bulk-edit-availability">No Collections to update.</p> : null}
						<div className="editor-settings-section-content">
							<BulkEditField field="layout" label="Layout" value={draft.layout} onChange={onChange} />
							<BulkEditField field="showAllTab" label="Show All tab" value={draft.showAllTab} onChange={onChange} describedBy="bulk-all-tab-help" />
							<p className="editor-field-help" id="bulk-all-tab-help">{collectionShowAllDescription(draft.layout)}</p>
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

							</form>
							<footer className="node-editor-actions bulk-edit-actions global-settings-actions"><button className="editor-apply" type="submit" form="global-settings-display-panel" data-action="apply-bulk-edit" disabled={!hasBulkEditChanges(draft)}>Apply changes</button><button className="editor-cancel" type="button" data-action="cancel-bulk-edit" onClick={onCancel}>Cancel</button></footer>
						</> : <>
							<div id="global-settings-source-panel" role="tabpanel" aria-labelledby="global-settings-source-tab" ref={bodyRef} className="global-settings-body">
								<section className="editor-settings-section"><h3>Genre exclusions</h3><p className="editor-field-help">Choose existing Sources across Collections and Folders, then review the changes before applying them together.</p><button ref={launcherRef} className="editor-apply" type="button" data-action="exclude-genres" onClick={() => setOperation(true)}>Exclude genres…</button><p className="editor-field-help">Existing exclusions are preserved. Future Sources are not affected, and Export &amp; Send remains separate.</p></section>
							</div>
							<footer className="node-editor-actions global-settings-actions"><button className="editor-cancel" type="button" data-action="cancel-bulk-edit" onClick={onCancel}>Close</button></footer>
						</>}
					</>}
				</section>}
		</div>
	</div>;
	return typeof document === "undefined" ? content : createPortal(content, document.body);
}

export function BulkEditTitleConfirmation({ onCancel, onContinue, embedded = false }) {
	const dialogRef = useRef(null);
	const cancelButtonRef = useRef(null);

	useEffect(() => {
		cancelButtonRef.current?.focus();
	}, []);

	useEffect(() => {
		if (embedded) return undefined;
		document.body.classList.add("settings-modal-open");
		return () => document.body.classList.remove("settings-modal-open");
	}, [embedded]);
	const content = (
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
	);
	return embedded ? content : <div className="settings-modal-backdrop delete-modal-backdrop bulk-title-confirmation-backdrop" data-bulk-title-confirmation-backdrop="true">{content}</div>;
}
