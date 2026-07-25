import { useEffect, useRef, useState } from "react";
import builderMark from "../assets/builder-mark.svg";
import { createDraftCollection, createDraftFolder } from "./draft-actions.js";
import {
	createTargetedNodeEditorDraft,
	createTargetedQuickRenameDraft,
} from "./hierarchy-actions.js";
import { NodeEditor } from "./NodeEditor.jsx";
import { updateNodeEditorField } from "./node-editor.js";
import { applyNodeEditorDraft } from "./node-editor-actions.js";
import {
	applyQuickRenameDraft,
	updateQuickRenameTitle,
} from "./quick-rename.js";
import { buildBuilderViewModel } from "./view-model.js";
import {
	completeWorkspaceReturn,
	createWorkspaceReturnGate,
	requestWorkspaceReturn,
} from "./workspace-return-actions.js";

function PanelHeader({ id, title, count, action }) {
	const countLabel = count === 1 && title.endsWith("s")
		? `${count} ${title.slice(0, -1).toLowerCase()}`
		: `${count} ${title.toLowerCase()}`;

	return (
		<header className="panel-header" data-panel-header={title.toLowerCase()}>
			<div>
				<p className="panel-kicker">Project hierarchy</p>
				<h2 id={id}>{title}</h2>
			</div>
			<div className="panel-header-actions">
				<span className="panel-count" aria-label={countLabel}>{count}</span>
				{action}
			</div>
		</header>
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

function QuickRenameForm({
	draft,
	diagnostics,
	node,
	inputRef,
	onChange,
	onSubmit,
	onCancel,
}) {
	const noun = draft.nodeType === "folder" ? "folder" : "collection";
	const prefix = `card-${noun}-quick-rename`;
	const titleError = diagnostics.find((entry) => entry.path === "$ui.rename.title") ?? null;
	const formLabel = node.titleHidden
		? `Rename ${noun} with hidden Nuvio title`
		: `Rename ${noun} ${node.title}`;

	useEffect(() => {
		inputRef.current?.focus();
	}, [draft.internalId, inputRef]);

	return (
		<form
			className="quick-rename-form"
			data-quick-rename={noun}
			data-action-context="card"
			aria-label={formLabel}
			onSubmit={onSubmit}
			onKeyDown={(event) => {
				if (event.key === "Escape") {
					event.preventDefault();
					onCancel();
				} else if (event.key === "Enter" && event.target === inputRef.current) {
					event.preventDefault();
					onSubmit(event);
				}
			}}
			noValidate
		>
			<label htmlFor={`${prefix}-input`}>{noun === "folder" ? "Folder title" : "Collection title"}</label>
			<div className="quick-rename-row">
				<input
					ref={inputRef}
					id={`${prefix}-input`}
					type="text"
					value={draft.value}
					aria-invalid={titleError ? "true" : undefined}
					aria-describedby={`${prefix}-help${titleError ? ` ${prefix}-error` : ""}`}
					onChange={(event) => onChange(event.target.value)}
				/>
				<button className="quick-rename-apply" type="submit" data-action={`apply-${noun}-rename`}>Apply</button>
				<button className="quick-rename-cancel" type="button" data-action={`cancel-${noun}-rename`} onClick={onCancel}>Cancel</button>
			</div>
			<p className="quick-rename-help" id={`${prefix}-help`}>
				{draft.original.hidden
					? "Enter a visible title to replace the hidden Nuvio title."
					: !draft.original.supported
						? "The imported title is not text. Enter a visible replacement."
						: "Press Enter or Apply to save. Escape or Cancel keeps the current title."}
			</p>
			{titleError ? <p className="quick-rename-error" id={`${prefix}-error`} role="alert">{titleError.message}</p> : null}
		</form>
	);
}

function RenameIcon() {
	return (
		<svg viewBox="0 0 24 24" aria-hidden="true">
			<path d="M4 16.5V20h3.5L18 9.5 14.5 6 4 16.5Z" />
			<path d="m13.5 7 3.5 3.5" />
		</svg>
	);
}

function SettingsIcon() {
	return (
		<svg viewBox="0 0 24 24" aria-hidden="true">
			<path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6" />
		</svg>
	);
}

function HierarchyCard({
	node,
	noun,
	children,
	renameDraft,
	renameDiagnostics,
	renameInputRef,
	navigationLocked,
	onSelect,
	onOpenRename,
	onRenameChange,
	onRenameSubmit,
	onCancelRename,
	onOpenSettings,
}) {
	const renameActive = (
		renameDraft?.internalId === node.internalId
		&& renameDraft?.nodeType === noun
	);
	const renameLabel = node.titleHidden
		? `Rename ${noun} with hidden Nuvio title`
		: `Rename ${noun} ${node.title}`;
	const settingsLabel = node.titleHidden
		? `Open settings for ${noun} with hidden Nuvio title`
		: `Open settings for ${noun} ${node.title}`;

	return (
		<div
			className={`hierarchy-card${node.selected ? " is-selected" : ""}`}
			data-hierarchy-card={noun}
		>
			<div className="hierarchy-card-row">
				<NodeButton
					node={node}
					type={noun}
					onSelect={onSelect}
					disabled={navigationLocked}
				>
					{children}
				</NodeButton>
				<div className="hierarchy-card-actions" data-card-actions={noun}>
					<button
						className="card-action"
						type="button"
						data-action={`rename-${noun}`}
						aria-label={renameLabel}
						title="Rename"
						disabled={navigationLocked}
						onClick={(event) => onOpenRename(node.internalId, event.currentTarget)}
					>
						<RenameIcon />
					</button>
					<button
						className="card-action"
						type="button"
						data-action={`settings-${noun}`}
						aria-label={settingsLabel}
						aria-haspopup="dialog"
						title="Settings"
						disabled={navigationLocked}
						onClick={(event) => onOpenSettings(node.internalId, event.currentTarget)}
					>
						<SettingsIcon />
					</button>
				</div>
			</div>
			{renameActive ? (
				<QuickRenameForm
					draft={renameDraft}
					diagnostics={renameDiagnostics}
					node={node}
					inputRef={renameInputRef}
					onChange={onRenameChange}
					onSubmit={onRenameSubmit}
					onCancel={onCancelRename}
				/>
			) : null}
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
			aria-label={node.titleHidden ? node.accessibleName : undefined}
			disabled={disabled}
			onClick={() => onSelect(node.internalId)}
		>
			<span className="node-button-content">{children}</span>
			<span className="node-chevron" aria-hidden="true">›</span>
			{node.selected ? <span className="visually-hidden">Selected</span> : null}
		</button>
	);
}

function CollectionList({ collections, actionProps }) {
	return (
		<ul className="node-list" aria-label="Collections">
			{collections.map((collection) => (
				<li key={collection.internalId}>
					<HierarchyCard node={collection} noun="collection" {...actionProps}>
						<span className="node-title">{collection.title}</span>
						{collection.titleHidden ? <span className="hidden-title-badge">Invisible in Nuvio</span> : null}
						<span className="node-meta">
							<span>{collection.folderCountLabel}</span>
							<span>{collection.sourceCountLabel}</span>
						</span>
					</HierarchyCard>
				</li>
			))}
		</ul>
	);
}

function FolderList({ folders, actionProps }) {
	return (
		<ul className="node-list" aria-label="Folders">
			{folders.map((folder) => (
				<li key={folder.internalId}>
					<HierarchyCard node={folder} noun="folder" {...actionProps}>
						<span className="node-title">{folder.title}</span>
						{folder.titleHidden ? <span className="hidden-title-badge">Invisible in Nuvio</span> : null}
						<span className="node-meta">
							<span>{folder.sourceCountLabel}</span>
							{folder.tileShape !== null ? <span>{folder.tileShape}</span> : null}
						</span>
					</HierarchyCard>
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
					<h3 id={headingId} aria-label={node.accessibleName}>{node.title}</h3>
					{node.titleHidden ? <span className="hidden-title-badge">Invisible in Nuvio</span> : null}
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
		<section
			className="return-confirmation"
			data-return-confirmation="true"
			aria-labelledby="return-confirmation-title"
			aria-describedby="return-confirmation-description"
		>
			<div>
				<p className="panel-kicker">Return to builder home</p>
				<h2 id="return-confirmation-title">Discard this workspace?</h2>
				<p id="return-confirmation-description">Returning to builder home will discard changes made in this browser.</p>
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

export function BuilderWorkspace({
	controller,
	state,
	onReturnHome = () => {},
	initialEditorDraft = null,
	initialEditorDiagnostics = [],
	initialRenameDraft = null,
	initialRenameDiagnostics = [],
	initialReturnConfirmationOpen = false,
}) {
	const view = buildBuilderViewModel(state);
	const [editorDraft, setEditorDraft] = useState(initialEditorDraft);
	const [editorDiagnostics, setEditorDiagnostics] = useState(initialEditorDiagnostics);
	const [renameDraft, setRenameDraft] = useState(initialRenameDraft);
	const [renameDiagnostics, setRenameDiagnostics] = useState(initialRenameDiagnostics);
	const [returnDiagnostic, setReturnDiagnostic] = useState(null);
	const [mobileLevelOverride, setMobileLevelOverride] = useState(null);
	const titleInputRef = useRef(null);
	const renameInputRef = useRef(null);
	const settingsRestoreFocusRef = useRef(null);
	const renameRestoreFocusRef = useRef(null);
	const returnHomeButtonRef = useRef(null);
	const stayButtonRef = useRef(null);
	const returnGateRef = useRef(null);
	if (returnGateRef.current === null) {
		returnGateRef.current = createWorkspaceReturnGate();
	}
	const [returnConfirmationOpen, setReturnConfirmationOpen] = useState(initialReturnConfirmationOpen);
	const [restoreReturnFocus, setRestoreReturnFocus] = useState(false);
	const editorTarget = editorDraft ? findEditableNode(state.project, editorDraft.internalId) : null;
	const visibleEditorDraft = editorTarget?.nodeType === editorDraft?.nodeType ? editorDraft : null;
	const renameTarget = renameDraft ? findEditableNode(state.project, renameDraft.internalId) : null;
	const visibleRenameDraft = renameTarget?.nodeType === renameDraft?.nodeType ? renameDraft : null;
	const editorLocked = visibleEditorDraft !== null;
	const renameLocked = visibleRenameDraft !== null;
	const navigationLocked = editorLocked || renameLocked || returnConfirmationOpen;
	const activeMobileLevel = mobileLevelOverride ?? view.activeMobileLevel;

	useEffect(() => {
		if (editorDraft && !visibleEditorDraft) {
			setEditorDraft(null);
			setEditorDiagnostics([]);
			settingsRestoreFocusRef.current = null;
		}
	}, [editorDraft, visibleEditorDraft]);

	useEffect(() => {
		if (editorDraft !== null || settingsRestoreFocusRef.current === null) return;
		const target = settingsRestoreFocusRef.current;
		settingsRestoreFocusRef.current = null;
		target.focus?.();
	}, [editorDraft]);

	useEffect(() => {
		if (renameDraft && !visibleRenameDraft) {
			setRenameDraft(null);
			setRenameDiagnostics([]);
			renameRestoreFocusRef.current = null;
		}
	}, [renameDraft, visibleRenameDraft]);

	useEffect(() => {
		if (renameDraft !== null || renameRestoreFocusRef.current === null) return;
		const target = renameRestoreFocusRef.current;
		renameRestoreFocusRef.current = null;
		target.focus?.();
	}, [renameDraft]);

	useEffect(() => {
		if (returnConfirmationOpen) stayButtonRef.current?.focus();
	}, [returnConfirmationOpen]);

	useEffect(() => {
		if (!restoreReturnFocus) return;
		setRestoreReturnFocus(false);
		returnHomeButtonRef.current?.focus();
	}, [restoreReturnFocus]);

	function selectNode(internalId) {
		if (navigationLocked) return;
		setMobileLevelOverride(null);
		controller.selectNode(internalId);
	}

	function clearSelection() {
		if (navigationLocked) return;
		setMobileLevelOverride(null);
		controller.clearSelection();
	}

	function openEditor(internalId, trigger) {
		if (navigationLocked) return;
		const node = findEditableNode(state.project, internalId);
		if (!node) return;
		const draft = createTargetedNodeEditorDraft(controller, node);
		if (!draft) return;
		setMobileLevelOverride(node.nodeType === "folder" ? "folders" : "collections");
		settingsRestoreFocusRef.current = trigger;
		setEditorDiagnostics([]);
		setEditorDraft(draft);
	}

	function closeEditor() {
		if (!visibleEditorDraft) return;
		setEditorDiagnostics([]);
		setEditorDraft(null);
	}

	function openRename(internalId, trigger) {
		if (navigationLocked) return;
		const node = findEditableNode(state.project, internalId);
		if (!node) return;
		const draft = createTargetedQuickRenameDraft(controller, node);
		if (!draft) return;
		setMobileLevelOverride(node.nodeType === "folder" ? "folders" : "collections");
		renameRestoreFocusRef.current = trigger;
		setRenameDiagnostics([]);
		setRenameDraft(draft);
	}

	function closeRename() {
		if (!visibleRenameDraft) return;
		setRenameDiagnostics([]);
		setRenameDraft(null);
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

	function handleRenameSubmit(event) {
		event.preventDefault();
		if (!visibleRenameDraft) return;

		const result = applyQuickRenameDraft(controller, visibleRenameDraft);
		if (result.diagnostics.length > 0) {
			setRenameDiagnostics(result.diagnostics);
			queueMicrotask(() => renameInputRef.current?.focus());
			return;
		}
		if (result.ok) closeRename();
	}

	function resetAndReturnHome() {
		const result = completeWorkspaceReturn({
			controller,
			gate: returnGateRef.current,
			onSuccess: () => {
				setEditorDraft(null);
				setEditorDiagnostics([]);
				setRenameDraft(null);
				setRenameDiagnostics([]);
				setReturnDiagnostic(null);
				setMobileLevelOverride(null);
				setReturnConfirmationOpen(false);
				onReturnHome();
			},
		});

		if (!result.ok && result.started) {
			setReturnDiagnostic(result.errors?.[0] ?? null);
		}
	}

	function handleReturnHome() {
		if (navigationLocked || returnGateRef.current.isActive()) return;
		requestWorkspaceReturn({
			state,
			onConfirm: () => setReturnConfirmationOpen(true),
			onComplete: resetAndReturnHome,
		});
	}

	function stayInWorkspace() {
		if (!returnConfirmationOpen) return;
		setReturnConfirmationOpen(false);
		setRestoreReturnFocus(true);
	}

	function createCollection() {
		if (!navigationLocked) {
			setMobileLevelOverride(null);
			createDraftCollection(controller);
		}
	}

	function createFolder() {
		if (!navigationLocked && view.selectedCollection) {
			setMobileLevelOverride(null);
			createDraftFolder(controller, view.selectedCollection.internalId);
		}
	}

	const hierarchyActionProps = {
		renameDraft: visibleRenameDraft,
		renameDiagnostics,
		renameInputRef,
		navigationLocked,
		onSelect: selectNode,
		onOpenRename: openRename,
		onRenameChange: (value) => {
			setRenameDraft((current) => updateQuickRenameTitle(current, value));
			setRenameDiagnostics([]);
		},
		onRenameSubmit: handleRenameSubmit,
		onCancelRename: closeRename,
		onOpenSettings: openEditor,
	};

	return (
		<main
			className="builder-shell"
			data-builder-shell="true"
			data-editor-lock={editorLocked ? "true" : undefined}
			data-rename-lock={renameLocked ? "true" : undefined}
			data-settings-open={editorLocked ? "true" : undefined}
		>
			<div
				className="workspace-underlay"
				data-workspace-underlay="true"
				inert={editorLocked || undefined}
				aria-hidden={editorLocked ? "true" : undefined}
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
					diagnostic={view.operationDiagnostic ?? returnDiagnostic}
					migrationNotice={view.migrationNotice}
					importWarnings={state.diagnostics.import.warnings}
				/>

				<div className="workspace" data-mobile-level={activeMobileLevel}>
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
								<CollectionList
									collections={view.collections}
									actionProps={hierarchyActionProps}
								/>
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
							onClick={clearSelection}
						>
							<span aria-hidden="true">←</span>
							All collections
						</button>
						{view.selectedCollection ? <p className="mobile-context mobile-only" aria-label={view.selectedCollection.accessibleName}>{view.selectedCollection.title}</p> : null}
						<PanelHeader
							id="folders-title"
							title="Folders"
							count={view.folders.length}
							action={view.selectedCollection ? (
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
							) : null}
						/>
						<div className="panel-body">
							{!view.selectedCollection ? (
								<p className="neutral-state">Select a collection to view its folders.</p>
							) : view.folders.length > 0 ? (
								<FolderList
									folders={view.folders}
									actionProps={hierarchyActionProps}
								/>
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
						{view.selectedFolder ? <p className="mobile-context mobile-only" aria-label={view.selectedFolder.accessibleName}>{view.selectedFolder.title}</p> : null}
						<PanelHeader
							id="sources-title"
							title="Sources"
							count={view.sources.length}
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
			</div>

			{visibleEditorDraft ? (
				<NodeEditor
					draft={visibleEditorDraft}
					diagnostics={editorDiagnostics}
					titleInputRef={titleInputRef}
					onChange={(field, value) => {
						setEditorDraft((current) => updateNodeEditorField(current, field, value));
						setEditorDiagnostics((current) => current.filter((entry) => (
							entry.path !== `$ui.editor.${field}`
							&& !(field === "hideNuvioTitle" && entry.path === "$ui.editor.title")
						)));
					}}
					onSubmit={handleEditorSubmit}
					onCancel={closeEditor}
				/>
			) : null}
		</main>
	);
}
