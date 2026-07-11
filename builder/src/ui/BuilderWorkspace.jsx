import builderMark from "../assets/builder-mark.svg";
import { createDraftCollection, createDraftFolder } from "./draft-actions.js";
import { buildBuilderViewModel } from "./view-model.js";

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

function EmptyState({ title, children }) {
	return (
		<div className="empty-state">
			<span className="empty-state-mark" aria-hidden="true">+</span>
			<p className="empty-state-title">{title}</p>
			<p>{children}</p>
		</div>
	);
}

function NodeButton({ node, type, children, onSelect }) {
	return (
		<button
			className={`node-button${node.selected ? " is-selected" : ""}`}
			type="button"
			data-node-type={type}
			aria-pressed={node.selected}
			onClick={() => onSelect(node.internalId)}
		>
			<span className="node-button-content">{children}</span>
			<span className="node-chevron" aria-hidden="true">›</span>
			{node.selected ? <span className="visually-hidden">Selected</span> : null}
		</button>
	);
}

function CollectionList({ collections, onSelect }) {
	return (
		<ul className="node-list" aria-label="Collections">
			{collections.map((collection) => (
				<li key={collection.internalId}>
					<NodeButton node={collection} type="collection" onSelect={onSelect}>
						<span className="node-title">{collection.title}</span>
						{collection.id !== null ? <span className="node-id">{collection.id}</span> : null}
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

function FolderList({ folders, onSelect }) {
	return (
		<ul className="node-list" aria-label="Folders">
			{folders.map((folder) => (
				<li key={folder.internalId}>
					<NodeButton node={folder} type="folder" onSelect={onSelect}>
						<span className="node-title">{folder.title}</span>
						{folder.id !== null ? <span className="node-id">{folder.id}</span> : null}
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

function SourceList({ sources, onSelect }) {
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
					<button className="quiet-button" type="button" onClick={onShowFolderDetails}>
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

export function BuilderWorkspace({ controller, state }) {
	const view = buildBuilderViewModel(state);
	const selectNode = (internalId) => controller.selectNode(internalId);

	return (
		<main className="builder-shell" data-builder-shell="true">
			<header className="app-header">
				<div className="brand-lockup">
					<img className="builder-mark" src={builderMark} alt="" width="56" height="56" />
					<div>
						<p className="preview-label">Development preview</p>
						<h1>TMDB Collection Builder</h1>
						<p className="workspace-subtitle">Built for Nuvio collections</p>
					</div>
				</div>
				<div className="project-status">
					<div>
						<span className="project-status-label">Current project</span>
						<strong>{view.projectTitle}</strong>
					</div>
					<span className={`status-badge${view.dirty ? " is-dirty" : ""}`}>
						{view.dirty ? "Unsaved changes" : "Clean draft"}
					</span>
				</div>
				<a className="root-link" data-root-link="true" href="../">
					<span aria-hidden="true">←</span>
					Back to TMDB ID Lookup
				</a>
			</header>

			<InlineNotices
				diagnostic={view.operationDiagnostic}
				migrationNotice={view.migrationNotice}
				importWarnings={state.diagnostics.import.warnings}
			/>

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
								onClick={() => createDraftCollection(controller)}
							>
								<span aria-hidden="true">+</span>
								New collection
							</button>
						)}
					/>
					<div className="panel-body">
						{view.collections.length > 0 ? (
							<CollectionList collections={view.collections} onSelect={selectNode} />
						) : (
							<EmptyState title="Start your first collection">
								Create a draft collection to begin organising folders and sources.
							</EmptyState>
						)}
					</div>
				</section>

				<section className="workspace-panel folders-panel" data-panel="folders" aria-labelledby="folders-title">
					<button className="back-control mobile-only" type="button" onClick={() => controller.clearSelection()}>
						<span aria-hidden="true">←</span>
						All collections
					</button>
					{view.selectedCollection ? <p className="mobile-context mobile-only">{view.selectedCollection.title}</p> : null}
					<PanelHeader
						id="folders-title"
						title="Folders"
						count={view.folders.length}
						action={view.selectedCollection ? (
							<button
								className="primary-action"
								type="button"
								data-action="create-folder"
								onClick={() => createDraftFolder(controller, view.selectedCollection.internalId)}
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
							<FolderList folders={view.folders} onSelect={selectNode} />
						) : (
							<EmptyState title="No folders yet">Add a draft folder inside {view.selectedCollection.title}.</EmptyState>
						)}
						{view.selectedCollection && !view.selectedFolder ? (
							<div className="mobile-summary mobile-only">
								<SelectionSummary node={view.selectedCollection} headingId="mobile-selection-summary-title" />
							</div>
						) : null}
					</div>
				</section>

				<section className="workspace-panel sources-panel" data-panel="sources" aria-labelledby="sources-title">
					{view.selectedCollection ? (
						<button
							className="back-control mobile-only"
							type="button"
							onClick={() => controller.selectNode(view.selectedCollection.internalId)}
						>
							<span aria-hidden="true">←</span>
							{view.selectedCollection.title}
						</button>
					) : null}
					{view.selectedFolder ? <p className="mobile-context mobile-only">{view.selectedFolder.title}</p> : null}
					<PanelHeader id="sources-title" title="Sources" count={view.sources.length} />
					<div className="panel-body sources-body">
						{!view.selectedFolder ? (
							<p className="neutral-state">Select a folder to view its sources.</p>
						) : view.sources.length > 0 ? (
							<SourceList sources={view.sources} onSelect={selectNode} />
						) : (
							<EmptyState title="No sources in this folder yet.">Source creation will arrive in a later builder step.</EmptyState>
						)}
						<SelectionSummary
							node={view.selectedNode}
							headingId="selection-summary-title"
							selectedSource={view.selectedSource}
							selectedFolder={view.selectedFolder}
							onShowFolderDetails={() => controller.selectNode(view.selectedFolder.internalId)}
						/>
					</div>
				</section>
			</div>
		</main>
	);
}
