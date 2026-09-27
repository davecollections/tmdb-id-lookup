import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { lockAddSourceDocumentBody, observeAddSourceViewport, resolveAddSourceViewportStyle } from "./add-source-modal-lifecycle.js";
import { handleDialogKeyDown } from "./modal-focus.js";
import { focusElementWithoutScroll } from "./hierarchy-menu-placement.js";
import { GenreSelectionToolbar } from "./GenreCatalogueSelector.jsx";
import { CollectionFolderSelectionList } from "./CollectionFolderSelectionList.jsx";
import { CollectionSettingsFields } from "./NodeEditor.jsx";
import { CreationStageIntro } from "./CreationStageIntro.jsx";
import { updateNodeEditorField } from "./node-editor.js";
import { collectionViewModels, nodeTitle } from "./view-model.js";
import { createMoveCollectionDraft, reviewFolderMove } from "./move-folders.js";

const useBeforePaint = typeof window === "undefined" ? useEffect : useLayoutEffect;

function Choice({ name, value, selected, onChange, children, disabled = false }) {
	return <label className="genre-catalogue-choice" data-selection-mode="single" data-selected={selected === value ? "true" : undefined} data-disabled={disabled ? "true" : undefined}>
		<input className="visually-hidden choice-card-input" type="radio" name={name} value={value} checked={selected === value} disabled={disabled} onChange={() => onChange(value)} />
		<span>{children}</span>
	</label>;
}

export function MoveFoldersDialog({ session, onCancel, onApply }) {
	const [stage, setStage] = useState("select");
	const [selected, setSelected] = useState(session.folderInternalId ? [session.folderInternalId] : []);
	const [kind, setKind] = useState(null);
	const [destinationId, setDestinationId] = useState(null);
	const [draft, setDraft] = useState(createMoveCollectionDraft);
	const [review, setReview] = useState(null);
	const [deleteEmptySource, setDeleteEmptySource] = useState(false);
	const [diagnostics, setDiagnostics] = useState([]);
	const [error, setError] = useState("");
	const dialogRef = useRef(null), headingRef = useRef(null), bodyRef = useRef(null), titleRef = useRef(null), errorRef = useRef(null);
	const [viewport, setViewport] = useState(() => typeof window === "undefined" ? null : resolveAddSourceViewportStyle(window));
	const source = session.collection;
	const sourceTitle = nodeTitle(source.editable.title, "collection").text;
	const selectedFolders = source.folders.filter((folder) => selected.includes(folder.internalId));
	const willEmpty = selectedFolders.length === source.folders.length;
	const destinations = collectionViewModels(session.project)
		.map((collection, index) => ({ ...collection, position: index + 1 }))
		.filter((collection) => collection.internalId !== source.internalId);
	const destination = destinations.find((collection) => collection.internalId === destinationId);
	const destinationTitle = kind === "new" ? nodeTitle(draft.values.title, "collection").text : destination?.title;
	const folderLabel = `${selected.length} ${selected.length === 1 ? "folder" : "folders"}`;
	const phase = { select: "Select Folders", destination: "Choose destination", configure: "Configure new Collection", review: `Move ${folderLabel}` }[stage];
	const step = { select: 1, destination: 2, configure: 3, review: kind === "new" ? 4 : 3 }[stage];

	useBeforePaint(() => {
		const unlock = lockAddSourceDocumentBody();
		const stop = observeAddSourceViewport(setViewport);
		return () => { stop(); unlock(); };
	}, []);
	useBeforePaint(() => {
		if (bodyRef.current) bodyRef.current.scrollTop = 0;
		focusElementWithoutScroll(stage === "configure" && !draft.values.hideNuvioTitle ? titleRef.current : headingRef.current);
	}, [stage]);
	useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

	function select(ids) {
		setSelected(ids);
		if (ids.length !== source.folders.length) setDeleteEmptySource(false);
	}
	function changeStage(next) { setStage(next); setError(""); setDiagnostics([]); }
	function back() { changeStage(stage === "review" ? kind === "new" ? "configure" : "destination" : stage === "configure" ? "destination" : "select"); }
	function continueFlow() {
		if (stage === "select") return changeStage("destination");
		if (stage === "destination" && kind === "new") return changeStage("configure");
		const nextReview = reviewFolderMove(session, selected, { kind, internalId: destinationId }, draft);
		if (!nextReview.ok) {
			setDiagnostics(nextReview.diagnostics); setError(nextReview.diagnostics[0].message); return;
		}
		setReview(nextReview); changeStage("review");
	}
	function apply() {
		const result = onApply(review, draft, deleteEmptySource);
		if (!result.ok) setError(result.errors?.[0]?.message ?? "Nothing was moved. Close and reopen this dialog to try again.");
	}
	const content = <div className="add-source-portal move-folders-portal" data-mobile-surface="opaque">
		<div className="settings-modal-backdrop add-source-backdrop move-folders-backdrop" style={viewport ?? undefined}>
			<section ref={dialogRef} className="add-source-dialog move-folders-dialog" data-move-folders-dialog={stage} role="dialog" aria-modal="true" aria-labelledby="move-folders-title" tabIndex={-1} onKeyDown={(event) => handleDialogKeyDown(event, dialogRef.current, onCancel)}>
				<header className="move-folders-heading">
					{stage !== "select" ? <button type="button" className="editor-cancel" onClick={back} aria-label="Back to previous step">Back</button> : null}
					<h2 id="move-folders-title">Move folders</h2>
					<button type="button" className="editor-cancel" onClick={onCancel} aria-label="Close Move folders">Close</button>
				</header>
				<div ref={bodyRef} className="move-folders-body">
					<CreationStageIntro step={step} title={phase} headingRef={headingRef} tabIndex={-1} description={stage === "select" ? `Select the Folders to move from “${sourceTitle}”.` : stage === "destination" ? "Where should these Folders go?" : null} />
					{stage === "select" ? <>
						<GenreSelectionToolbar selectionCount={selected.length} totalCount={source.folders.length} onSelectAll={() => select(source.folders.map((folder) => folder.internalId))} onClearAll={() => select([])} />
						<CollectionFolderSelectionList folders={source.folders} selected={selected} onToggle={(id) => select(selected.includes(id) ? selected.filter((entry) => entry !== id) : [...selected, id])} label="Folders to move" />
					</> : null}
					{stage === "destination" ? <>
						<fieldset className="move-folders-choices"><legend>Destination</legend>
							<Choice name="move-destination-kind" value="existing" selected={kind} onChange={setKind} disabled={!destinations.length}><strong>Existing Collection</strong><small>{destinations.length ? "Append the selected Folders after its current Folders." : "There are no other Collections in this project."}</small></Choice>
							<Choice name="move-destination-kind" value="new" selected={kind} onChange={setKind}><strong>New Collection</strong><small>Create a Collection to split these Folders out.</small></Choice>
						</fieldset>
						{kind === "existing" ? <fieldset className="move-folders-choices"><legend>Choose a Collection</legend>{destinations.map((collection) => <Choice key={collection.internalId} name="move-destination" value={collection.internalId} selected={destinationId} onChange={setDestinationId}><strong>{collection.title}</strong><small>Collection {collection.position} · {collection.folderCountLabel}{collection.pinToTop ? " · Pinned" : ""}</small></Choice>)}</fieldset> : null}
					</> : null}
					{stage === "configure" ? <div className="move-collection-settings"><CollectionSettingsFields draft={draft} prefix="move-collection" diagnostics={diagnostics} titleInputRef={titleRef} onChange={(field, value) => { setDraft((current) => updateNodeEditorField(current, field, value)); setError(""); setDiagnostics([]); }} /></div> : null}
					{stage === "review" ? <>
						<dl className="move-folders-summary"><div><dt>From</dt><dd>{sourceTitle}</dd></div><div><dt>To{kind === "new" ? " · New Collection" : ""}</dt><dd>{destinationTitle}{kind === "existing" ? <small>Collection {destination.position}</small> : null}</dd></div></dl>
						<p>{folderLabel} · {selectedFolders.reduce((count, folder) => count + folder.sources.length, 0)} sources</p>
						<p className="editor-field-help">The selected Folders and everything inside them will move together, in their current order, after any existing Folders.</p>
						{kind === "new" ? <p className="editor-field-help" data-move-new-summary="true">{draft.values.viewMode === "ROWS" ? "Rows" : "Tabs"}{draft.values.viewMode !== "ROWS" ? draft.values.showAllTab ? " · All tab on" : " · All tab off" : ""} · {draft.values.pinToTop ? "Pinned" : "Not pinned"} · {draft.values.hideNuvioTitle ? "Title hidden" : "Title visible"} · {draft.values.backdropImageUrl ? "Collection artwork set" : "No Collection artwork"}</p> : null}
						<details className="move-folders-selected"><summary>View {selected.length} selected {selected.length === 1 ? "folder" : "folders"}</summary><ol>{selectedFolders.map((folder) => <li key={folder.internalId}>{nodeTitle(folder.editable.title, "folder").text}</li>)}</ol></details>
						{willEmpty ? <fieldset className="move-folders-choices" data-empty-source-choice="true"><legend>What should happen to the empty “{sourceTitle}” Collection?</legend>
							<Choice name="move-empty-source" value={false} selected={deleteEmptySource} onChange={setDeleteEmptySource}><strong>Keep the empty Collection</strong><small>Keep it so you can add or move Folders into it later.</small></Choice>
							<Choice name="move-empty-source" value={true} selected={deleteEmptySource} onChange={setDeleteEmptySource}><strong>Delete the empty Collection after moving</strong><small>Remove it after these Folders are moved. This can’t be undone.</small></Choice>
						</fieldset> : <p className="editor-field-help">“{sourceTitle}” will keep {source.folders.length - selected.length} {source.folders.length - selected.length === 1 ? "Folder" : "Folders"}.</p>}
					</> : null}
				</div>
				<footer className="add-source-actions collection-folders-actions move-folders-actions">
					{error ? <p ref={errorRef} id="move-collection-title-error" tabIndex={-1} className="editor-diagnostics" role="alert">{error}</p> : null}
					{stage === "review" ? <button className={`editor-apply${deleteEmptySource ? " collection-folders-delete" : ""}`} type="button" onClick={apply}>Move {folderLabel}{deleteEmptySource ? " and delete Collection" : ""}</button> : <button className="editor-apply" type="button" disabled={stage === "select" ? !selected.length : stage === "destination" ? !kind || kind === "existing" && !destinationId : false} onClick={continueFlow}>{stage === "configure" ? "Review move" : "Continue"}</button>}
				</footer>
			</section>
		</div>
	</div>;
	return typeof document === "undefined" ? content : createPortal(content, document.body);
}
