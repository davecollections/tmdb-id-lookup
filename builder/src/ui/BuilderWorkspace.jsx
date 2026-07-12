import { useEffect, useRef, useState } from "react";
import builderMark from "../assets/builder-mark.svg";
import { createDraftCollection, createDraftFolder } from "./draft-actions.js";
import { NodeEditor } from "./NodeEditor.jsx";
import {
	createNodeEditorDraft,
	updateNodeEditorField,
} from "./node-editor.js";
import { applyNodeEditorDraft } from "./node-editor-actions.js";
import { buildBuilderViewModel } from "./view-model.js";
import {
	resetBuilderWorkspace,
	workspaceNeedsDiscardConfirmation,
} from "./workspace-return-actions.js";

function PanelHeader({ id, title, count, action }) {
	const countLabel = count === 1 && title.endsWith("s")
		? `${count} ${title.slice(0, -1).toLowerCase()}`
		: `${count} ${title.toLowerCase()}`;

	return (
		<div className="panel-header">
			<div>
				<p className="panel-kicker">Project hierarchy</p>
				<h2 id={id}>{title}</h2>
			</div>
			<div className="panel-header-actions">
				<span className="panel-count" aria-label={countLabel}>{count}</span>
				{action}
			</div>
		</div>
	);
}

function EmptyState({ title, children, action = null }) {
	return (
		<div className="empty-state">
			{action}
			<p className="empty-state-title">{title}</p>
			<p>{children}</p>
		</div>
	);
}

function NodeButton({ node, type, children, onSelect, disabled }) {
	return (
		<button
			className={`node-button${node.selected ? " is-selected" : ""}`}
			type="button"
			data-node-type={type}
			aria-pressed={node.selected}
			disabled={disabled}
			onClick={() => onSelect(node.internalId)}
		>
			<span className="node-button-content">{children}</span>
			<span className="node-chevron" aria-hidden="true">›</span>
			{node.selected ? <span className="visually-hidden">Selected</span> : null}
		</button>
	);
}

function CollectionList({ collections, onSelect, disabled }) {
	return (
		<ul className="node-list" aria-label="Collections">
			{collections.map((collection) => (
				<li key={collection.internalId}>
					<NodeButton node={collection} type="collection" onSelect={onSelect} disabled={disabled}>
						<span className="node-title">{collection.title}</span>
						<span className="node-meta">
							<span>{collection.folderCountLabel}</span>
							<span>{collection.sourceCountLabel}</span>
						</span>
					</NodeButton>
				</li>
			))}
		</ul>
	);
}

function FolderList({ folders, onSelect, disabled }) {
	return (
		<ul className="node-list" aria-label="Folders">
			{folders.map((folder) => (
				<li key={folder.internalId}>
					<NodeButton node={folder} type="folder" onSelect={onSelect} disabled={disabled}>
						<span className="node-title">{folder.title}</span>
						<span className="node-meta">
							<span>{folder.sourceCountLabel}</span>
							{folder.tileShape !== null ? <span>{folder.tileShape}</span> : null}
						</span>
					</NodeButton>
				</li>
			))}
		</ul>
	);
}

function SourceList({ sources, onSelect, disabled }) {
	return (
		<ul className="source-list" aria-label="Sources">
			{sources.map((source, index) => (
				<li key={source.internalId}>
					<button
						className={`source-button${source.selected ? " is-selected" : ""}`}
						type="button"
						data-node-type="source"
						data-source-category={source.category}
						aria-pressed={source.selected}
						disabled={disabled}
						onClick={() => onSelect(source.internalId)}
					>
						<span className="source-order" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
						<span className="source-content">
							<span className="source-heading">
								<span className="node-title">{source.title}</span>
								<span className="source-category">{source.categoryLabel}</span>
							</span>
							{source.metadata.length > 0 ? (
								<span className="node-meta">
									{source.metadata.map((entry) => <span key={entry.key}>{entry.value}</span>)}
								</span>
							) : null}
						</span>
						{source.selected ? <span className="visually-hidden">Selected</span> : null}
					</button>
				</li>
			))}
		</ul>
	);
}

function SelectionSummary({
	node,
	headingId = "selection-summary-title",
	selectedSource,
	selectedFolder,
	onShowFolderDetails,
	navigationLocked = false,
}) {
	if (!node) {
		return (
			<div className="selection-summary selection-summary-empty">
				<p className="summary-label">Selection details</p>
				<p>Select a collection, folder, or source to see its known details.</p>
			</div>
		);
	}

	return (
		<section className="selection-summary" aria-labelledby={headingId}>
			<div className="summary-heading">
				<div>
					<p className="summary-label">Selection details</p>
					<h3 id={headingId}>{node.title}</h3>
				</div>
				{selectedSource && selectedFolder ? (
					<button className="quiet-button" type="button" disabled={navigationLocked} onClick={onShowFolderDetails}>
						Show folder details
					</button>
				) : null}
			</div>
			{node.note ? <p className="preserved-note">{node.note}</p> : null}
			{node.details.length > 0 ? (
				<dl className="detail-grid">
					{node.details.map((entry) => (
						<div key={entry.label}>
							<dt>{entry.label}</dt>
							<dd>{entry.value}</dd>
						</div>
					))}
				</dl>
			) : <p className="summary-empty-copy">No known editable details are available.</p>}
		</section>
	);
}

function ImportWarningSummary({ warnings }) {
	if (warnings.length === 0) {
		return null;
	}

	return (
		<details className="import-warning-summary">
			<summary>Imported with {warnings.length} warning{warnings.length === 1 ? "" : "s"}</summary>
			<ul>
				{warnings.map((warning, index) => (
					<li key={`${warning.code}-${warning.path}-${index}`}>
						<strong>{warning.message}</strong>
						<span>{warning.code}</span>
					</li>
				))}
			</ul>
		</details>
	);
}

function InlineNotices({ diagnostic, migrationNotice, importWarnings }) {
	if (!diagnostic && !migrationNotice && importWarnings.length === 0) {
		return null;
	}

	return (
		<div className="notice-stack">
			{diagnostic ? (
				<div className="inline-alert" role="alert">
					<strong>{diagnostic.message}</strong>
					<span>{diagnostic.code}</span>
				</div>
			) : null}
			<ImportWarningSummary warnings={importWarnings} />
			{migrationNotice ? <p className="migration-notice">{migrationNotice}</p> : null}
		</div>
	);
}

function ReturnConfirmation({ stayButtonRef, onStay, onDiscard }) {
	return (
		<section className="return-confirmation" data-return-confirmation="true" aria-labelledby="return-confirmation-title">
			<div>
				<p className="panel-kicker">Return to builder home</p>
				<h2 id="return-confirmation-title">Discard this workspace?</h2>
				<p>Returning to builder home will discard changes made in this browser.</p>
			</div>
			<div className="return-confirmation-actions">
				<button ref={stayButtonRef} type="button" data-action="stay-in-workspace" onClick={onStay}>Stay here</button>
				<button className="danger-action" type="button" data-action="discard-and-return" onClick={onDiscard}>Discard and return</button>
			</div>
		</section>
	);
}

function findEditableNode(project, internalId) {
	for (const collection of project.collections) {
		if (collection.internalId === internalId) return collection;
		for (const folder of collection.folders) {
			if (folder.internalId === internalId) return folder;
		}
	}
	return null;
}

export function BuilderWorkspace({ controller, state, onReturnHome = () => {}, initialEditorDraft = null, initialEditorDiagnostics = [] }) {
	const view = buildBuilderViewModel(state);
	const [editorDraft, setEditorDraft] = useState(initialEditorDraft);
	const [editorDiagnostics, setEditorDiagnostics] = useState(initialEditorDiagnostics);
	const collectionEditButtonRef = useRef(null);
	const folderEditButtonRef = useRef(null);
	const titleInputRef = useRef(null);
	const restoreFocusRef = useRef(null);
	const returnHomeButtonRef = useRef(null);
	const stayButtonRef = useRef(null);
	const returnActionActiveRef = useRef(false);
	const [returnConfirmationOpen, setReturnConfirmationOpen] = useState(false);
	const [restoreReturnFocus, setRestoreReturnFocus] = useState(false);
	const selectedCollectionNode = view.selectedCollection
		? state.project.collections.find((entry) => entry.internalId === view.selectedCollection.internalId) ?? null
		: null;
	const selectedFolderNode = selectedCollectionNode && view.selectedFolder
		? selectedCollectionNode.folders.find((entry) => entry.internalId === view.selectedFolder.internalId) ?? null
		: null;
	const editorTarget = editorDraft ? findEditableNode(state.project, editorDraft.internalId) : null;
	const visibleEditorDraft = editorTarget?.nodeType === editorDraft?.nodeType ? editorDraft : null;
	const editorLocked = visibleEditorDraft !== null;
	const navigationLocked = editorLocked || returnConfirmationOpen;

	useEffect(() => {
		if (editorDraft && !visibleEditorDraft) {
			setEditorDraft(null);
			setEditorDiagnostics([]);
			restoreFocusRef.current = null;
		}
	}, [editorDraft, visibleEditorDraft]);

	useEffect(() => {
		if (editorDraft !== null || restoreFocusRef.current === null) return;
		const target = restoreFocusRef.current === "folder"
			? folderEditButtonRef.current
			: collectionEditButtonRef.current;
		restoreFocusRef.current = null;
		target?.focus();
	}, [editorDraft]);

	useEffect(() => {
		if (returnConfirmationOpen) stayButtonRef.current?.focus();
	}, [returnConfirmationOpen]);

	useEffect(() => {
		if (!restoreReturnFocus) return;
		setRestoreReturnFocus(false);
		returnHomeButtonRef.current?.focus();
	}, [restoreReturnFocus]);

	function selectNode(internalId) {
		if (!navigationLocked) controller.selectNode(internalId);
	}

	function openEditor(node) {
		if (navigationLocked) return;
		const draft = createNodeEditorDraft(node);
		if (!draft) return;
		setEditorDiagnostics([]);
		setEditorDraft(draft);
	}

	function closeEditor() {
		if (!visibleEditorDraft) return;
		restoreFocusRef.current = visibleEditorDraft.nodeType;
		setEditorDiagnostics([]);
		setEditorDraft(null);
	}

	function handleEditorSubmit(event) {
		event.preventDefault();
		if (!visibleEditorDraft) return;

		const result = applyNodeEditorDraft(controller, visibleEditorDraft);
		if (result.diagnostics.length > 0) {
			setEditorDiagnostics(result.diagnostics);
			queueMicrotask(() => titleInputRef.current?.focus());
			return;
		}
		if (result.ok) closeEditor();
	}

	function resetAndReturnHome() {
		if (returnActionActiveRef.current) return;
		returnActionActiveRef.current = true;
		try {
			const result = resetBuilderWorkspace(controller);
			if (!result.ok) return;
			setEditorDraft(null);
			setEditorDiagnostics([]);
			setReturnConfirmationOpen(false);
			onReturnHome();
		} finally {
			returnActionActiveRef.current = false;
		}
	}

	function handleReturnHome() {
		if (navigationLocked || returnActionActiveRef.current) return;
		if (workspaceNeedsDiscardConfirmation(state)) {
			setReturnConfirmationOpen(true);
			return;
		}
		resetAndReturnHome();
	}

	function stayInWorkspace() {
		if (!returnConfirmationOpen) return;
		setReturnConfirmationOpen(false);
		setRestoreReturnFocus(true);
	}

	function createCollection() {
		if (!navigationLocked) createDraftCollection(controller);
	}

	function createFolder() {
		if (!navigationLocked && view.selectedCollection) {
			createDraftFolder(controller, view.selectedCollection.internalId);
		}
	}

	return (
		<main
			className="builder-shell"
			data-builder-shell="true"
			data-editor-lock={editorLocked ? "true" : undefined}
		>
			<header className="app-header">
				<div className="brand-lockup">
					<img className="builder-mark" src={builderMark} alt="" width="56" height="56" />
					<div>
						<p className="preview-label">Development preview</p>
						<h1>TMDB Collection Builder</h1>
						<p className="workspace-subtitle">Built for Nuvio collections</p>
					</div>
				</div>
				<div className="workspace-header-actions">
					<button
						ref={returnHomeButtonRef}
						className="builder-home-action"
						type="button"
						data-action="return-builder-home"
						disabled={navigationLocked}
						onClick={handleReturnHome}
					>
						Back to builder home
					</button>
					<a className="root-link" data-root-link="true" href="../">
						<span aria-hidden="true">←</span>
						Back to TMDB ID Lookup
					</a>
				</div>
			</header>

			{returnConfirmationOpen ? (
				<ReturnConfirmation
					stayButtonRef={stayButtonRef}
					onStay={stayInWorkspace}
					onDiscard={resetAndReturnHome}
				/>
			) : null}

			<InlineNotices
				diagnostic={view.operationDiagnostic}
				migrationNotice={view.migrationNotice}
				importWarnings={state.diagnostics.import.warnings}
			/>

			{visibleEditorDraft ? (
				<NodeEditor
					draft={visibleEditorDraft}
					diagnostics={editorDiagnostics}
					titleInputRef={titleInputRef}
					onChange={(field, value) => {
						setEditorDraft((current) => updateNodeEditorField(current, field, value));
						setEditorDiagnostics((current) => current.filter((entry) => entry.path !== `$ui.editor.${field}`));
					}}
					onSubmit={handleEditorSubmit}
					onCancel={closeEditor}
				/>
			) : null}

			<div className="workspace" data-mobile-level={view.activeMobileLevel}>
				<section className="workspace-panel collections-panel" data-panel="collections" aria-labelledby="collections-title">
					<PanelHeader
						id="collections-title"
						title="Collections"
						count={view.collections.length}
						action={(
							<button
								className="primary-action"
								type="button"
								data-action="create-collection"
								disabled={navigationLocked}
								onClick={createCollection}
							>
								<span aria-hidden="true">+</span>
								New collection
							</button>
						)}
					/>
					<div className="panel-body">
						{view.collections.length > 0 ? (
							<CollectionList collections={view.collections} onSelect={selectNode} disabled={navigationLocked} />
						) : (
							<EmptyState
								title="Start your first collection"
								action={(
									<button className="empty-state-action" type="button" data-action="create-collection-empty" disabled={navigationLocked} onClick={createCollection} aria-label="Create first collection">
										<span aria-hidden="true">+</span>
									</button>
								)}
							>
								Create a draft collection to begin organising folders and sources.
							</EmptyState>
						)}
					</div>
				</section>

				<section className="workspace-panel folders-panel" data-panel="folders" aria-labelledby="folders-title">
					<button
						className="back-control mobile-only"
						type="button"
						disabled={navigationLocked}
						onClick={() => { if (!navigationLocked) controller.clearSelection(); }}
					>
						<span aria-hidden="true">←</span>
						All collections
					</button>
					{view.selectedCollection ? <p className="mobile-context mobile-only">{view.selectedCollection.title}</p> : null}
					<PanelHeader
						id="folders-title"
						title="Folders"
						count={view.folders.length}
						action={view.selectedCollection ? (
							<>
								<button
									ref={collectionEditButtonRef}
									className="secondary-action"
									type="button"
									data-action="edit-collection"
									disabled={navigationLocked}
									onClick={() => openEditor(selectedCollectionNode)}
								>
									Edit collection
								</button>
								<button
									className="primary-action"
									type="button"
									data-action="create-folder"
									disabled={navigationLocked}
									onClick={createFolder}
								>
									<span aria-hidden="true">+</span>
									New folder
								</button>
							</>
						) : null}
					/>
					<div className="panel-body">
						{!view.selectedCollection ? (
							<p className="neutral-state">Select a collection to view its folders.</p>
						) : view.folders.length > 0 ? (
							<FolderList folders={view.folders} onSelect={selectNode} disabled={navigationLocked} />
						) : (
							<EmptyState
								title="No folders yet"
								action={(
									<button className="empty-state-action" type="button" data-action="create-folder-empty" disabled={navigationLocked} onClick={createFolder} aria-label="Create first folder">
										<span aria-hidden="true">+</span>
									</button>
								)}
							>
								Add a draft folder inside {view.selectedCollection.title}.
							</EmptyState>
						)}
						{view.selectedCollection && !view.selectedFolder ? (
							<div className="mobile-summary mobile-only">
								<SelectionSummary
									node={view.selectedCollection}
									headingId="mobile-selection-summary-title"
									navigationLocked={navigationLocked}
								/>
							</div>
						) : null}
					</div>
				</section>

				<section className="workspace-panel sources-panel" data-panel="sources" aria-labelledby="sources-title">
					{view.selectedCollection ? (
						<button
							className="back-control mobile-only"
							type="button"
							disabled={navigationLocked}
							onClick={() => selectNode(view.selectedCollection.internalId)}
						>
							<span aria-hidden="true">←</span>
							{view.selectedCollection.title}
						</button>
					) : null}
					{view.selectedFolder ? <p className="mobile-context mobile-only">{view.selectedFolder.title}</p> : null}
					<PanelHeader
						id="sources-title"
						title="Sources"
						count={view.sources.length}
						action={view.selectedFolder ? (
							<button
								ref={folderEditButtonRef}
								className="secondary-action"
								type="button"
								data-action="edit-folder"
								disabled={navigationLocked}
								onClick={() => openEditor(selectedFolderNode)}
							>
								Edit folder
							</button>
						) : null}
					/>
					<div className="panel-body sources-body">
						{!view.selectedFolder ? (
							<p className="neutral-state">Select a folder to view its sources.</p>
						) : view.sources.length > 0 ? (
							<SourceList sources={view.sources} onSelect={selectNode} disabled={navigationLocked} />
						) : (
							<EmptyState title="No sources in this folder yet.">Source creation will arrive in a later builder step.</EmptyState>
						)}
						<SelectionSummary
							node={view.selectedNode}
							headingId="selection-summary-title"
							selectedSource={view.selectedSource}
							selectedFolder={view.selectedFolder}
							navigationLocked={navigationLocked}
							onShowFolderDetails={() => selectNode(view.selectedFolder.internalId)}
						/>
					</div>
				</section>
			</div>
		</main>
	);
}
