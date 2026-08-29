import { useEffect, useRef, useState } from "react";
import builderMark from "../assets/builder-mark.svg";
import {
	applyPeopleHierarchyPlan,
	applyFranchiseHierarchyPlan,
	applyGenreHierarchyPlan,
	applyNetworkHierarchyPlan,
	applyStudioHierarchyPlan,
	applyStreamingHierarchyPlan,
	createPeopleSourceBundle,
	createGenreSourceBundle,
	createDecadeSourceBundle,
	applyDecadesHierarchyPlan,
	createMovieFranchiseSource,
	createNetworkCatalogueProvider,
	createNetworkSource,
	createStudioCatalogueProvider,
	createStudioSourceBundle,
	createStreamingCatalogueProvider,
	createStreamingSourceBundle,
	createTmdbCollectionProvider,
	createTmdbDecadesPreviewProvider,
	createTmdbGenrePreviewProvider,
	createTmdbPersonProvider,
	createPeopleManifestClient,
	createTmdbNetworkCountProvider,
	createTmdbNetworkPreviewProvider,
	createTmdbStudioCountProvider,
	createTmdbStudioPreviewProvider,
	createTmdbStreamingPreviewProvider,
	MOVIE_FRANCHISE_SOURCE_MODE_ID,
	PEOPLE_SOURCE_MODE_ID,
	NETWORK_SOURCE_MODE_ID,
	STUDIO_SOURCE_MODE_ID,
	STREAMING_SOURCE_MODE_ID,
	GENRE_SOURCE_MODE_ID,
	DECADE_SOURCE_MODE_ID,
} from "../source-add/index.js";
import { createArtworkRuntimeClient } from "../../../js/artwork-runtime.mjs";
import {
	createSourceEditSession,
	saveSourceEdit,
} from "../source-edit/index.js";
import { AboutCreditsDialog } from "./AboutCreditsDialog.jsx";
import { AddSourceDialog } from "./AddSourceDialog.jsx";
import {
	BulkEditDialog,
	BulkEditTitleConfirmation,
} from "./BulkEditDialog.jsx";
import {
	buildBulkEditPlan,
	bulkEditAvailability,
	createBulkEditDraft,
	updateBulkEditDraft,
} from "./bulk-edit.js";
import { CreationDialog } from "./CreationDialog.jsx";
import { DeleteConfirmation } from "./DeleteConfirmation.jsx";
import { createDraftCollection, createDraftFolder } from "./draft-actions.js";
import { createTargetedNodeEditorDraft } from "./hierarchy-actions.js";
import {
	buildDeletionImpact,
	createDeletionSubmissionGate,
	executeDeletion,
} from "./hierarchy-deletion.js";
import {
	crossedDragThreshold,
	dragOverlayTop,
	establishPointerCapture,
	insertionIndicatorForDestination,
	moveSiblingNode,
	moveSiblingNodeToPosition,
	movementAnnouncement,
	movementPositionAnnouncement,
	pointerDestinationForY,
	pointerSessionLocksInteraction,
	provisionalDragLayout,
	reorderAutoScrollDelta,
	reorderHandleLabel,
	visiblePositionForGroupDestination,
} from "./hierarchy-reordering.js";
import { HierarchyActionsMenu } from "./HierarchyActionsMenu.jsx";
import { focusElementWithoutScroll } from "./hierarchy-menu-placement.js";
import { NodeEditor } from "./NodeEditor.jsx";
import { NetworkSourceFlow } from "./NetworkSourceFlow.jsx";
import { PeopleSourceFlow } from "./PeopleSourceFlow.jsx";
import { StudioSourceFlow } from "./StudioSourceFlow.jsx";
import { StreamingSourceFlow } from "./StreamingSourceFlow.jsx";
import { GenreSourceFlow } from "./GenreSourceFlow.jsx";
import { DecadeSourceFlow } from "./DecadeSourceFlow.jsx";
import { useExactUrlPreviewFailure } from "./exact-url-preview.js";
import {
	updateNodeEditorField,
	updateNodeEditorTileShape,
} from "./node-editor.js";
import { applyNodeEditorDraft } from "./node-editor-actions.js";
import {
	builderCardScrollBehavior,
	useBuilderDesktopViewport,
} from "./responsive-viewport.js";
import { buildBuilderViewModel } from "./view-model.js";
import { SourceModeDialog } from "./SourceModeDialog.jsx";
import { SourceEditorDialog } from "./SourceEditorDialog.jsx";
import {
	completeWorkspaceReturn,
	createWorkspaceReturnGate,
	requestWorkspaceReturn,
} from "./workspace-return-actions.js";

function PanelHeader({
	id,
	title,
	count,
	action,
	headingAction = null,
	mobileInlineCount = false,
}) {
	const countLabel = count === 1 && title.endsWith("s")
		? `${count} ${title.slice(0, -1).toLowerCase()}`
		: `${count} ${title.toLowerCase()}`;

	return (
		<header className="panel-header" data-panel-header={title.toLowerCase()}>
			<div className="panel-header-title">
				<h2 id={id}>
					{title}
					{mobileInlineCount ? (
						<span className="panel-title-inline-count mobile-only"> · {count}</span>
					) : null}
				</h2>
				{headingAction}
			</div>
			<div className="panel-header-actions">
				<span
					className={`panel-count${mobileInlineCount ? " panel-count-desktop-only" : ""}`}
					aria-label={countLabel}
				>
					{count}
				</span>
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

function GripIcon() {
	return (
		<svg className="reorder-grip-icon" viewBox="0 0 18 18" aria-hidden="true">
			<circle cx="5" cy="4" r="1.5" />
			<circle cx="13" cy="4" r="1.5" />
			<circle cx="5" cy="9" r="1.5" />
			<circle cx="13" cy="9" r="1.5" />
			<circle cx="5" cy="14" r="1.5" />
			<circle cx="13" cy="14" r="1.5" />
		</svg>
	);
}

function PencilIcon() {
	return (
		<svg className="quick-rename-icon" viewBox="0 0 20 20" aria-hidden="true">
			<path d="m13.9 2.8 3.3 3.3-9.4 9.4-4.2.9.9-4.2 9.4-9.4Zm-8 10.1-.3 1.5 1.5-.3 7.9-8-1.2-1.2-7.9 8Z" />
		</svg>
	);
}

function SlidersIcon() {
	return (
		<svg className="presentation-settings-icon" viewBox="0 0 20 20" aria-hidden="true">
			<path d="M2.5 5h3M9.5 5h8M2.5 10h7M13.5 10h4M2.5 15h2M8.5 15h9" />
			<circle cx="7.5" cy="5" r="1.6" />
			<circle cx="11.5" cy="10" r="1.6" />
			<circle cx="6.5" cy="15" r="1.6" />
		</svg>
	);
}

function HierarchyAddAction({
	noun,
	disabled,
	onClick,
	registerAction,
	actionName = `create-${noun}-after-list`,
}) {
	return (
		<button
			ref={registerAction}
			className="hierarchy-add-action"
			type="button"
			data-action={actionName}
			disabled={disabled}
			onClick={onClick}
		>
			<span aria-hidden="true">+</span>
			Add another {noun}
		</button>
	);
}

const DRAG_SETTLE_DURATION_MS = 150;

function setDragOverlayTop(overlay, top) {
	overlay?.style.setProperty("--reorder-overlay-y", `${top}px`);
}

function createHierarchyDragOverlay(card, rect, pointerY, grabOffsetY) {
	const overlay = card.cloneNode(true);
	const left = Math.max(0, Math.min(rect.left, window.innerWidth - rect.width));
	overlay.classList.remove(
		"is-drag-placeholder",
		"is-provisionally-displaced",
	);
	overlay.classList.add("hierarchy-drag-overlay");
	overlay.removeAttribute("data-drag-placeholder");
	overlay.removeAttribute("data-drop-position");
	overlay.setAttribute("data-reorder-drag-overlay", "true");
	overlay.setAttribute("aria-hidden", "true");
	overlay.setAttribute("role", "presentation");
	overlay.inert = true;
	for (const menu of overlay.querySelectorAll(".hierarchy-actions-menu")) {
		menu.remove();
	}
	overlay.style.removeProperty("--reorder-shift-y");
	overlay.style.left = `${left}px`;
	overlay.style.width = `${rect.width}px`;
	overlay.style.height = `${rect.height}px`;
	for (const button of overlay.querySelectorAll("button")) {
		button.tabIndex = -1;
	}
	setDragOverlayTop(overlay, dragOverlayTop(pointerY, grabOffsetY));
	document.body.append(overlay);
	document.body.classList.add("hierarchy-pointer-dragging");
	return overlay;
}

function removeHierarchyDragOverlay(session) {
	if (session?.settleAnimationFrame) {
		window.cancelAnimationFrame(session.settleAnimationFrame);
	}
	if (session?.settleTimer) {
		window.clearTimeout(session.settleTimer);
	}
	session?.overlay?.remove();
	document.body.classList.remove("hierarchy-pointer-dragging");
}

function settleHierarchyDragOverlay(session, targetTop, onComplete) {
	const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
	session.overlay?.classList.add("is-settling");
	if (reducedMotion) {
		setDragOverlayTop(session.overlay, targetTop);
		queueMicrotask(onComplete);
		return;
	}

	session.settleAnimationFrame = window.requestAnimationFrame(() => {
		setDragOverlayTop(session.overlay, targetTop);
		session.settleTimer = window.setTimeout(onComplete, DRAG_SETTLE_DURATION_MS);
	});
}

function ReorderHandle({
	node,
	noun,
	navigationLocked,
	keyboardReorderInternalId,
	onPointerDown,
	onPointerMove,
	onPointerUp,
	onPointerCancel,
	onLostPointerCapture,
	onKeyDown,
	onClick,
	registerReorderHandle,
}) {
	const disabled = navigationLocked || node.reorderGroupSize <= 1;
	const keyboardActive = keyboardReorderInternalId === node.internalId;

	return (
		<button
			ref={(element) => registerReorderHandle(node.internalId, element)}
			className="reorder-handle"
			type="button"
			data-action={`reorder-${noun}`}
			data-keyboard-reordering={keyboardActive ? "true" : undefined}
			aria-label={reorderHandleLabel(noun, node.accessibleName)}
			aria-describedby="reorder-instructions"
			aria-keyshortcuts="Enter Space ArrowUp ArrowDown Escape"
			aria-pressed={keyboardActive}
			disabled={disabled}
			onPointerDown={(event) => onPointerDown(event, node, noun)}
			onPointerMove={onPointerMove}
			onPointerUp={onPointerUp}
			onPointerCancel={onPointerCancel}
			onLostPointerCapture={onLostPointerCapture}
			onKeyDown={(event) => onKeyDown(event, node, noun)}
			onClick={(event) => onClick(event, node, noun)}
		>
			<GripIcon />
		</button>
	);
}

function HierarchyCard({
	node,
	noun,
	siblings,
	children,
	navigationLocked,
	onSelect,
	onOpenEditor,
	enableDoubleClickEdit,
	onRequestDelete,
	dragState,
	keyboardReorderInternalId,
	registerHierarchyCard,
	registerPrimaryControl,
	actionsMenuInternalId,
	actionsDisabled,
	onOpenActionsMenu,
	onCloseActionsMenu,
	registerActionsTrigger,
	...reorderHandlers
}) {
	const actionsOpen = actionsMenuInternalId === node.internalId;
	const dropPosition = dragState?.indicatorInternalId === node.internalId
		? dragState.indicatorEdge
		: undefined;
	const placeholder = dragState?.internalId === node.internalId;
	const shiftY = dragState?.displacements?.[node.internalId] ?? 0;
	const displaced = !placeholder && shiftY !== 0;

	return (
		<div
			ref={(element) => registerHierarchyCard(node.internalId, element)}
			className={`hierarchy-card${node.selected ? " is-selected" : ""}${placeholder ? " is-drag-placeholder" : ""}${displaced ? " is-provisionally-displaced" : ""}${actionsOpen ? " is-menu-open" : ""}`}
			data-hierarchy-card={noun}
			data-drop-position={dropPosition}
			data-drag-placeholder={placeholder ? "true" : undefined}
			style={{ "--reorder-shift-y": `${shiftY}px` }}
		>
			<div className="hierarchy-card-row" data-card-layout={noun}>
				<div
					className={`hierarchy-card-main${node.selected ? " is-selected" : ""}`}
					data-reorder-main-card={noun}
				>
					<ReorderHandle
						node={node}
						noun={noun}
						navigationLocked={navigationLocked}
						keyboardReorderInternalId={keyboardReorderInternalId}
						{...reorderHandlers}
						onPointerDown={(event, handleNode, handleNoun) => (
							reorderHandlers.onPointerDown(event, handleNode, handleNoun, siblings)
						)}
					/>
					<NodeButton
						node={node}
						type={noun}
						onSelect={onSelect}
						disabled={navigationLocked}
						registerPrimaryControl={registerPrimaryControl}
						enableDoubleClickEdit={enableDoubleClickEdit}
						onDoubleClickEdit={onOpenEditor}
					>
						{children}
					</NodeButton>
				<HierarchyActionsMenu
						node={node}
						noun={noun}
						open={actionsOpen}
						disabled={actionsDisabled}
						onOpen={onOpenActionsMenu}
						onClose={onCloseActionsMenu}
						onEdit={onOpenEditor}
						onDelete={onRequestDelete}
						registerTrigger={registerActionsTrigger}
					/>
				</div>
			</div>
		</div>
	);
}

function NodeButton({
	node,
	type,
	children,
	onSelect,
	disabled,
	registerPrimaryControl,
	enableDoubleClickEdit = false,
	onDoubleClickEdit = null,
}) {
	return (
		<button
			ref={(element) => registerPrimaryControl(node.internalId, element)}
			className={`node-button${node.selected ? " is-selected" : ""}`}
			type="button"
			data-node-type={type}
			aria-pressed={node.selected}
			aria-label={node.titleHidden ? node.accessibleName : undefined}
			disabled={disabled}
			onClick={() => onSelect(node.internalId)}
			onDoubleClick={(event) => {
				if (!enableDoubleClickEdit || !shouldOpenHierarchyEditorFromDoubleClick(event)) return;
				event.preventDefault();
				onDoubleClickEdit?.(node.internalId, event.currentTarget);
			}}
		>
			<span className="node-button-content">{children}</span>
			{node.selected ? <span className="visually-hidden">Selected</span> : null}
		</button>
	);
}

const nestedInteractiveSelector = "button, a, input, select, textarea, [role='button'], [role='link'], [contenteditable='true']";

export function shouldOpenHierarchyEditorFromDoubleClick(event) {
	if (!event || event.detail < 2 || !event.currentTarget || !event.target) return false;
	const interactiveTarget = event.target.closest?.(nestedInteractiveSelector) ?? null;
	return interactiveTarget === null || interactiveTarget === event.currentTarget;
}

function CollectionList({ collections, actionProps, createdCardTarget, createdCardRef }) {
	return (
		<ul className="node-list" aria-label="Collections">
			{collections.map((collection) => (
				<li
					key={collection.internalId}
					ref={createdCardTarget?.nodeType === "collection"
						&& createdCardTarget.internalId === collection.internalId
						? createdCardRef
						: undefined}
				>
					<HierarchyCard node={collection} noun="collection" siblings={collections} {...actionProps}>
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

function FolderList({ folders, actionProps, createdCardTarget, createdCardRef }) {
	return (
		<ul className="node-list" aria-label="Folders">
			{folders.map((folder) => (
				<li
					key={folder.internalId}
					ref={createdCardTarget?.nodeType === "folder"
						&& createdCardTarget.internalId === folder.internalId
						? createdCardRef
						: undefined}
				>
					<HierarchyCard node={folder} noun="folder" siblings={folders} {...actionProps}>
						<FolderCardContent folder={folder} />
					</HierarchyCard>
				</li>
			))}
		</ul>
	);
}

const folderThumbnailDimensions = Object.freeze({
	poster: Object.freeze({ width: 34, height: 50 }),
	landscape: Object.freeze({ width: 60, height: 34 }),
	unknown: Object.freeze({ width: 44, height: 44 }),
});

function FolderCardText({ folder }) {
	return (
		<>
			<span className="node-title">{folder.title}</span>
			{folder.titleHidden ? <span className="hidden-title-badge">Invisible in Nuvio</span> : null}
			<span className="node-meta">
				<span>{folder.sourceCountLabel}</span>
				{folder.tileShape !== null ? <span>{folder.tileShape}</span> : null}
			</span>
		</>
	);
}

function FolderCardContent({ folder }) {
	const artworkFailure = useExactUrlPreviewFailure(folder.tileArtworkUrl);
	const artworkVisible = folder.tileArtworkUrl !== null && !artworkFailure.failed;

	if (!artworkVisible) return <FolderCardText folder={folder} />;

	const shape = folder.tileArtworkShape ?? "unknown";
	const dimensions = folderThumbnailDimensions[shape] ?? folderThumbnailDimensions.unknown;
	return (
		<span className="folder-card-content" data-folder-card-artwork={shape}>
			<span className="folder-card-thumbnail-frame" data-folder-artwork-shape={shape} aria-hidden="true">
				<img
					className="folder-card-thumbnail"
					src={folder.tileArtworkUrl}
					alt=""
					width={dimensions.width}
					height={dimensions.height}
					loading="lazy"
					decoding="async"
					referrerPolicy="no-referrer"
					draggable="false"
					onError={(event) => {
						event.currentTarget.hidden = true;
						artworkFailure.markFailed();
					}}
				/>
			</span>
			<span className="folder-card-copy">
				<FolderCardText folder={folder} />
			</span>
		</span>
	);
}

function SourceList({ sources, actionProps }) {
	return (
		<ul className="source-list" aria-label="Sources">
			{sources.map((source, index) => (
				<li key={source.internalId}>
					<div
						ref={(element) => actionProps.registerHierarchyCard(source.internalId, element)}
						className={`hierarchy-card source-card${source.selected ? " is-selected" : ""}${actionProps.dragState?.internalId === source.internalId ? " is-drag-placeholder" : ""}${actionProps.dragState?.internalId !== source.internalId && (actionProps.dragState?.displacements?.[source.internalId] ?? 0) !== 0 ? " is-provisionally-displaced" : ""}${actionProps.actionsMenuInternalId === source.internalId ? " is-menu-open" : ""}`}
						data-hierarchy-card="source"
						data-drop-position={actionProps.dragState?.indicatorInternalId === source.internalId
							? actionProps.dragState.indicatorEdge
							: undefined}
						data-drag-placeholder={actionProps.dragState?.internalId === source.internalId
							? "true"
							: undefined}
						style={{
							"--reorder-shift-y": `${actionProps.dragState?.displacements?.[source.internalId] ?? 0}px`,
						}}
					>
						<div className="hierarchy-card-row" data-card-layout="source">
							<div
								className={`hierarchy-card-main${source.selected ? " is-selected" : ""}`}
								data-reorder-main-card="source"
							>
								<ReorderHandle
									node={source}
									noun="source"
									navigationLocked={actionProps.navigationLocked}
									keyboardReorderInternalId={actionProps.keyboardReorderInternalId}
									onPointerDown={(event, handleNode, handleNoun) => (
										actionProps.onPointerDown(event, handleNode, handleNoun, sources)
									)}
									onPointerMove={actionProps.onPointerMove}
									onPointerUp={actionProps.onPointerUp}
									onPointerCancel={actionProps.onPointerCancel}
									onLostPointerCapture={actionProps.onLostPointerCapture}
									onKeyDown={actionProps.onKeyDown}
									onClick={actionProps.onClick}
									registerReorderHandle={actionProps.registerReorderHandle}
								/>
								<button
									ref={(element) => actionProps.registerPrimaryControl(source.internalId, element)}
									className={`source-button${source.selected ? " is-selected" : ""}`}
									type="button"
									data-node-type="source"
									data-source-category={source.category}
									aria-pressed={source.selected}
									aria-label={source.titleHidden ? source.accessibleName : undefined}
									disabled={actionProps.navigationLocked}
									onClick={() => actionProps.onSelect(source.internalId)}
									onDoubleClick={(event) => {
										if (!actionProps.enableDoubleClickEdit || !source.editSupported || !shouldOpenHierarchyEditorFromDoubleClick(event)) return;
										event.preventDefault();
										actionProps.onOpenSourceEditor(source.internalId, event.currentTarget);
									}}
								>
									<span className="source-order" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
									<span className="source-content">
										<span className="source-heading">
											<span className="node-title">{source.title}</span>
											<span className="source-category">{source.categoryLabel}</span>
										</span>
										{source.titleHidden ? <span className="hidden-title-badge">Invisible in Nuvio</span> : null}
										{source.metadata.length > 0 ? (
											<span className="node-meta">
												{source.metadata.map((entry) => <span key={entry.key}>{entry.value}</span>)}
											</span>
										) : null}
									</span>
									{source.selected ? <span className="visually-hidden">Selected</span> : null}
								</button>
								<HierarchyActionsMenu
									node={source}
									noun="source"
									open={actionProps.actionsMenuInternalId === source.internalId}
									disabled={actionProps.actionsDisabled}
									onOpen={actionProps.onOpenActionsMenu}
									onClose={actionProps.onCloseActionsMenu}
									onEdit={source.editSupported ? actionProps.onOpenSourceEditor : null}
									editLabel="Edit source"
									onDelete={actionProps.onRequestDelete}
									registerTrigger={actionProps.registerActionsTrigger}
								/>
							</div>
						</div>
					</div>
				</li>
			))}
		</ul>
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
	initialEditorMode = "settings",
	initialEditorDiagnostics = [],
	initialReturnConfirmationOpen = false,
	initialDeleteConfirmation = null,
	initialAddSourceOpen = false,
	initialCreationSession = null,
	initialSourceEdit = null,
	initialAboutCreditsOpen = false,
	sourceProvider = null,
	peopleProvider = null,
	networkCatalogueProvider = null,
	networkCountProvider = null,
	networkPreviewProvider = null,
	decadePreviewProvider = null,
	genrePreviewProvider = null,
	studioCatalogueProvider = null,
	studioCountProvider = null,
	studioPreviewProvider = null,
	studioArtworkRuntimeClient = null,
	streamingCatalogueProvider = null,
	streamingPreviewProvider = null,
	peopleManifestClient = null,
}) {
	const view = buildBuilderViewModel(state);
	const desktopViewport = useBuilderDesktopViewport();
	const [editorDraft, setEditorDraft] = useState(initialEditorDraft);
	const [editorMode, setEditorMode] = useState(initialEditorMode);
	const [editorDiagnostics, setEditorDiagnostics] = useState(initialEditorDiagnostics);
	const [returnDiagnostic, setReturnDiagnostic] = useState(null);
	const [mobileLevelOverride, setMobileLevelOverride] = useState(null);
	const [createdCardTarget, setCreatedCardTarget] = useState(null);
	const [moveFocusTarget, setMoveFocusTarget] = useState(null);
	const [dragState, setDragState] = useState(null);
	const [keyboardReorderInternalId, setKeyboardReorderInternalId] = useState(null);
	const [movementStatusText, setMovementStatusText] = useState("");
	const [pendingMovementAnnouncement, setPendingMovementAnnouncement] = useState(null);
	const [deleteConfirmation, setDeleteConfirmation] = useState(initialDeleteConfirmation);
	const [deleteStatusText, setDeleteStatusText] = useState("");
	const [pendingDeleteFocus, setPendingDeleteFocus] = useState(null);
	const [restoreDeleteTriggerFocus, setRestoreDeleteTriggerFocus] = useState(false);
	const [actionsMenuInternalId, setActionsMenuInternalId] = useState(null);
	const [creationSession, setCreationSession] = useState(initialCreationSession);
	const [restoreCreationTriggerFocus, setRestoreCreationTriggerFocus] = useState(false);
	const [creationStatusText, setCreationStatusText] = useState("");
	const [addSourceSession, setAddSourceSession] = useState(() => (
		initialAddSourceOpen && state.selection.folderInternalId
			? {
				context: "folder",
				collectionInternalId: state.selection.collectionInternalId,
				folderInternalId: state.selection.folderInternalId,
				modeId: MOVIE_FRANCHISE_SOURCE_MODE_ID,
			}
			: null
	));
	const [restoreAddSourceTriggerFocus, setRestoreAddSourceTriggerFocus] = useState(false);
	const [pendingCreatedSourceFocus, setPendingCreatedSourceFocus] = useState(null);
	const [pendingCreatedFolderFocus, setPendingCreatedFolderFocus] = useState(null);
	const [sourceCreationStatusText, setSourceCreationStatusText] = useState("");
	const [sourceEdit, setSourceEdit] = useState(initialSourceEdit);
	const [restoreSourceEditTriggerFocus, setRestoreSourceEditTriggerFocus] = useState(false);
	const [pendingEditedSourceFocus, setPendingEditedSourceFocus] = useState(null);
	const [pendingSourceEditFallback, setPendingSourceEditFallback] = useState(null);
	const [sourceEditStatusText, setSourceEditStatusText] = useState("");
	const [aboutCreditsOpen, setAboutCreditsOpen] = useState(initialAboutCreditsOpen);
	const [restoreAboutCreditsFocus, setRestoreAboutCreditsFocus] = useState(false);
	const [bulkEditDraft, setBulkEditDraft] = useState(null);
	const [bulkEditDiagnostics, setBulkEditDiagnostics] = useState([]);
	const [bulkEditConfirmation, setBulkEditConfirmation] = useState(null);
	const [restoreBulkEditFocus, setRestoreBulkEditFocus] = useState(false);
	const titleInputRef = useRef(null);
	const createdCardRef = useRef(null);
	const editRestoreFocusRef = useRef(null);
	const reorderHandleRefs = useRef(new Map());
	const hierarchyCardRefs = useRef(new Map());
	const primaryControlRefs = useRef(new Map());
	const actionsTriggerRefs = useRef(new Map());
	const dragSessionRef = useRef(null);
	const movementSequenceRef = useRef(0);
	const returnHomeButtonRef = useRef(null);
	const stayButtonRef = useRef(null);
	const deleteTriggerRef = useRef(null);
	const collectionBottomAddRef = useRef(null);
	const folderBottomAddRef = useRef(null);
	const collectionEmptyAddRef = useRef(null);
	const folderEmptyAddRef = useRef(null);
	const sourceBackControlRef = useRef(null);
	const deleteGateRef = useRef(null);
	const creationRestoreFocusRef = useRef(null);
	const addSourceRestoreFocusRef = useRef(null);
	const sourceEditRestoreFocusRef = useRef(null);
	const aboutCreditsTriggerRef = useRef(null);
	const bulkEditTriggerRef = useRef(null);
	const sourceProviderRef = useRef(null);
	if (sourceProviderRef.current === null) {
		sourceProviderRef.current = sourceProvider ?? createTmdbCollectionProvider();
	}
	const peopleProviderRef = useRef(null);
	if (peopleProviderRef.current === null) {
		peopleProviderRef.current = peopleProvider ?? createTmdbPersonProvider();
	}
	const networkCatalogueProviderRef = useRef(null);
	if (networkCatalogueProviderRef.current === null) {
		networkCatalogueProviderRef.current = networkCatalogueProvider ?? createNetworkCatalogueProvider();
	}
	const networkCountProviderRef = useRef(null);
	if (networkCountProviderRef.current === null) {
		networkCountProviderRef.current = networkCountProvider ?? createTmdbNetworkCountProvider();
	}
	const networkPreviewProviderRef = useRef(null);
	if (networkPreviewProviderRef.current === null) {
		networkPreviewProviderRef.current = networkPreviewProvider ?? createTmdbNetworkPreviewProvider();
	}
	const decadePreviewProviderRef = useRef(null);
	if (decadePreviewProviderRef.current === null) {
		decadePreviewProviderRef.current = decadePreviewProvider ?? createTmdbDecadesPreviewProvider();
	}
	const genrePreviewProviderRef = useRef(null);
	if (genrePreviewProviderRef.current === null) {
		genrePreviewProviderRef.current = genrePreviewProvider ?? createTmdbGenrePreviewProvider();
	}
	const studioCatalogueProviderRef = useRef(null);
	if (studioCatalogueProviderRef.current === null) {
		studioCatalogueProviderRef.current = studioCatalogueProvider ?? createStudioCatalogueProvider();
	}
	const studioCountProviderRef = useRef(null);
	if (studioCountProviderRef.current === null) {
		studioCountProviderRef.current = studioCountProvider ?? createTmdbStudioCountProvider();
	}
	const studioPreviewProviderRef = useRef(null);
	if (studioPreviewProviderRef.current === null) {
		studioPreviewProviderRef.current = studioPreviewProvider ?? createTmdbStudioPreviewProvider();
	}
	const studioArtworkRuntimeClientRef = useRef(null);
	if (studioArtworkRuntimeClientRef.current === null) {
		studioArtworkRuntimeClientRef.current = studioArtworkRuntimeClient ?? createArtworkRuntimeClient();
	}
	const streamingCatalogueProviderRef = useRef(null);
	if (streamingCatalogueProviderRef.current === null) {
		streamingCatalogueProviderRef.current = streamingCatalogueProvider ?? createStreamingCatalogueProvider();
	}
	const streamingPreviewProviderRef = useRef(null);
	if (streamingPreviewProviderRef.current === null) {
		streamingPreviewProviderRef.current = streamingPreviewProvider ?? createTmdbStreamingPreviewProvider();
	}
	const peopleManifestClientRef = useRef(null);
	if (peopleManifestClientRef.current === null) {
		peopleManifestClientRef.current = peopleManifestClient ?? createPeopleManifestClient();
	}
	if (deleteGateRef.current === null) {
		deleteGateRef.current = createDeletionSubmissionGate();
	}
	const returnGateRef = useRef(null);
	if (returnGateRef.current === null) {
		returnGateRef.current = createWorkspaceReturnGate();
	}
	const [returnConfirmationOpen, setReturnConfirmationOpen] = useState(initialReturnConfirmationOpen);
	const [restoreReturnFocus, setRestoreReturnFocus] = useState(false);
	const editorTarget = editorDraft ? findEditableNode(state.project, editorDraft.internalId) : null;
	const visibleEditorDraft = editorTarget?.nodeType === editorDraft?.nodeType ? editorDraft : null;
	const editorParentCollection = editorTarget?.nodeType === "folder"
		? state.project.collections.find((collection) => (
			collection.folders.some((folder) => folder.internalId === editorTarget.internalId)
		)) ?? null
		: null;
	const addSourceFolder = addSourceSession?.context === "folder"
		? findEditableNode(state.project, addSourceSession.folderInternalId)
		: null;
	const addSourceCollection = addSourceSession
		? state.project.collections.find((collection) => collection.internalId === addSourceSession.collectionInternalId) ?? null
		: null;
	const addSourceFolderAvailable = addSourceSession?.context !== "folder" || (
		addSourceFolder?.nodeType === "folder"
		&& addSourceCollection?.folders.some((folder) => folder.internalId === addSourceFolder.internalId)
	);
	const visibleAddSourceSession = addSourceCollection?.nodeType === "collection"
		&& addSourceFolderAvailable
		? addSourceSession
		: null;
	const editorLocked = visibleEditorDraft !== null;
	const deleteLocked = deleteConfirmation !== null;
	const creationLocked = creationSession !== null;
	const addSourceLocked = visibleAddSourceSession !== null;
	const sourceEditLocked = sourceEdit !== null;
	const bulkEditLocked = bulkEditDraft !== null;
	const modalLocked = editorLocked || deleteLocked || creationLocked || addSourceLocked || sourceEditLocked || aboutCreditsOpen || bulkEditLocked;
	const navigationLocked = modalLocked || returnConfirmationOpen;
	const hierarchyInteractionLocked = navigationLocked || actionsMenuInternalId !== null;
	const activeMobileLevel = mobileLevelOverride ?? view.activeMobileLevel;
	const currentBulkEditAvailability = bulkEditAvailability(state.project);

	useEffect(() => {
		if (editorDraft && !visibleEditorDraft) {
			setEditorDraft(null);
			setEditorMode("settings");
			setEditorDiagnostics([]);
			editRestoreFocusRef.current = null;
		}
	}, [editorDraft, visibleEditorDraft]);

	useEffect(() => {
		if (addSourceSession === null || visibleAddSourceSession !== null) return;
		setAddSourceSession(null);
		setSourceCreationStatusText("The source was not added because the selected folder is no longer available.");
		setRestoreAddSourceTriggerFocus(true);
	}, [addSourceSession, visibleAddSourceSession]);

	useEffect(() => {
		if (
			actionsMenuInternalId !== null
			&& buildDeletionImpact(state, actionsMenuInternalId) === null
		) {
			setActionsMenuInternalId(null);
		}
	}, [actionsMenuInternalId, state]);

	useEffect(() => {
		if (!modalLocked || actionsMenuInternalId === null) return;
		setActionsMenuInternalId(null);
	}, [actionsMenuInternalId, modalLocked]);

	useEffect(() => {
		if (actionsMenuInternalId === null) return;
		setActionsMenuInternalId(null);
	}, [
		state.selection.collectionInternalId,
		state.selection.folderInternalId,
		state.selection.sourceInternalId,
	]);

	useEffect(() => {
		if (editorDraft !== null || editRestoreFocusRef.current === null) return;
		const target = editRestoreFocusRef.current;
		editRestoreFocusRef.current = null;
		target.focus?.();
	}, [editorDraft]);

	useEffect(() => {
		if (returnConfirmationOpen) stayButtonRef.current?.focus();
	}, [returnConfirmationOpen]);

	useEffect(() => {
		if (!restoreReturnFocus) return;
		setRestoreReturnFocus(false);
		returnHomeButtonRef.current?.focus();
	}, [restoreReturnFocus]);

	useEffect(() => {
		if (!restoreDeleteTriggerFocus) return;
		setRestoreDeleteTriggerFocus(false);
		const trigger = deleteTriggerRef.current;
		deleteTriggerRef.current = null;
		trigger?.focus?.();
	}, [restoreDeleteTriggerFocus]);

	useEffect(() => {
		if (!restoreCreationTriggerFocus) return;
		setRestoreCreationTriggerFocus(false);
		const trigger = creationRestoreFocusRef.current;
		creationRestoreFocusRef.current = null;
		focusElementWithoutScroll(trigger);
	}, [restoreCreationTriggerFocus]);

	useEffect(() => {
		if (!restoreAddSourceTriggerFocus) return;
		setRestoreAddSourceTriggerFocus(false);
		const trigger = addSourceRestoreFocusRef.current;
		addSourceRestoreFocusRef.current = null;
		focusElementWithoutScroll(trigger);
	}, [restoreAddSourceTriggerFocus]);

	useEffect(() => {
		if (!restoreSourceEditTriggerFocus) return;
		setRestoreSourceEditTriggerFocus(false);
		const trigger = sourceEditRestoreFocusRef.current;
		sourceEditRestoreFocusRef.current = null;
		focusElementWithoutScroll(trigger);
	}, [restoreSourceEditTriggerFocus]);

	useEffect(() => {
		if (!restoreAboutCreditsFocus) return;
		setRestoreAboutCreditsFocus(false);
		focusElementWithoutScroll(aboutCreditsTriggerRef.current);
	}, [restoreAboutCreditsFocus]);

	useEffect(() => {
		if (!restoreBulkEditFocus) return;
		setRestoreBulkEditFocus(false);
		focusElementWithoutScroll(bulkEditTriggerRef.current);
	}, [restoreBulkEditFocus]);

	useEffect(() => {
		if (createdCardTarget === null || createdCardRef.current === null) return;
		createdCardRef.current.scrollIntoView?.({
			behavior: builderCardScrollBehavior(),
			block: "nearest",
		});
		createdCardRef.current = null;
		setCreatedCardTarget(null);
	}, [createdCardTarget]);

	useEffect(() => {
		if (moveFocusTarget === null) return;
		const target = reorderHandleRefs.current.get(moveFocusTarget.internalId);
		target?.focus();
		setMoveFocusTarget(null);
	}, [moveFocusTarget, state.revision]);

	useEffect(() => {
		if (pendingMovementAnnouncement === null) return;
		setMovementStatusText(pendingMovementAnnouncement.message);
		setPendingMovementAnnouncement(null);
	}, [pendingMovementAnnouncement]);

	useEffect(() => {
		if (pendingDeleteFocus === null) return;
		let target = null;
		if (pendingDeleteFocus.kind === "node") {
			target = primaryControlRefs.current.get(pendingDeleteFocus.internalId) ?? null;
			if (!target && pendingDeleteFocus.nodeType === "collection") {
				target = collectionBottomAddRef.current ?? collectionEmptyAddRef.current;
			} else if (!target && pendingDeleteFocus.nodeType === "folder") {
				target = folderBottomAddRef.current ?? folderEmptyAddRef.current;
			} else if (!target && pendingDeleteFocus.nodeType === "source") {
				target = desktopViewport
					? primaryControlRefs.current.get(pendingDeleteFocus.parentInternalId)
					: sourceBackControlRef.current;
			}
		} else if (pendingDeleteFocus.action === "create-collection-empty") {
			target = collectionEmptyAddRef.current ?? collectionBottomAddRef.current;
		} else if (pendingDeleteFocus.action === "create-folder-empty") {
			target = folderEmptyAddRef.current ?? folderBottomAddRef.current;
		} else if (pendingDeleteFocus.action === "source-parent") {
			target = desktopViewport
				? primaryControlRefs.current.get(pendingDeleteFocus.parentInternalId)
				: sourceBackControlRef.current;
		}
		target?.focus?.();
		setPendingDeleteFocus(null);
	}, [desktopViewport, pendingDeleteFocus, state.revision]);

	useEffect(() => {
		if (pendingCreatedSourceFocus === null) return;
		const target = primaryControlRefs.current.get(pendingCreatedSourceFocus);
		target?.scrollIntoView?.({
			behavior: builderCardScrollBehavior(),
			block: "nearest",
		});
		focusElementWithoutScroll(target);
		setPendingCreatedSourceFocus(null);
	}, [pendingCreatedSourceFocus, state.revision]);

	useEffect(() => {
		if (pendingEditedSourceFocus === null) return;
		const target = primaryControlRefs.current.get(pendingEditedSourceFocus);
		target?.scrollIntoView?.({
			behavior: builderCardScrollBehavior(),
			block: "nearest",
		});
		focusElementWithoutScroll(target);
		setPendingEditedSourceFocus(null);
	}, [pendingEditedSourceFocus, state.revision]);

	useEffect(() => {
		if (pendingSourceEditFallback === null) return;
		const target = primaryControlRefs.current.get(pendingSourceEditFallback.folderInternalId)
			?? primaryControlRefs.current.get(pendingSourceEditFallback.collectionInternalId)
			?? sourceBackControlRef.current
			?? returnHomeButtonRef.current;
		focusElementWithoutScroll(target);
		setPendingSourceEditFallback(null);
	}, [pendingSourceEditFallback, state.revision]);

	useEffect(() => {
		if (pendingCreatedFolderFocus === null) return;
		const target = primaryControlRefs.current.get(pendingCreatedFolderFocus);
		target?.scrollIntoView?.({
			behavior: builderCardScrollBehavior(),
			block: "nearest",
		});
		focusElementWithoutScroll(target);
		setPendingCreatedFolderFocus(null);
	}, [pendingCreatedFolderFocus, state.revision]);

	useEffect(() => () => {
		const session = dragSessionRef.current;
		dragSessionRef.current = null;
		removeHierarchyDragOverlay(session);
	}, []);

	function registerReorderHandle(internalId, element) {
		if (element === null) {
			reorderHandleRefs.current.delete(internalId);
			return;
		}
		reorderHandleRefs.current.set(internalId, element);
	}

	function registerHierarchyCard(internalId, element) {
		if (element === null) {
			hierarchyCardRefs.current.delete(internalId);
			return;
		}
		hierarchyCardRefs.current.set(internalId, element);
	}

	function registerPrimaryControl(internalId, element) {
		if (element === null) {
			primaryControlRefs.current.delete(internalId);
			return;
		}
		primaryControlRefs.current.set(internalId, element);
	}

	function registerActionsTrigger(internalId, element) {
		if (element === null) {
			actionsTriggerRefs.current.delete(internalId);
			return;
		}
		actionsTriggerRefs.current.set(internalId, element);
	}

	function pointerInteractionLocked() {
		return pointerSessionLocksInteraction(dragSessionRef.current);
	}

	function selectNode(internalId) {
		if (hierarchyInteractionLocked || pointerInteractionLocked()) return;
		setKeyboardReorderInternalId(null);
		setCreatedCardTarget(null);
		setMobileLevelOverride(null);
		controller.selectNode(internalId);
	}

	function clearSelection() {
		if (hierarchyInteractionLocked || pointerInteractionLocked()) return;
		setKeyboardReorderInternalId(null);
		setCreatedCardTarget(null);
		setMobileLevelOverride(null);
		controller.clearSelection();
	}

	function closeActionsMenu({ restoreFocus = false } = {}) {
		const internalId = actionsMenuInternalId;
		setActionsMenuInternalId(null);
		if (!restoreFocus || internalId === null) return;
		queueMicrotask(() => {
			focusElementWithoutScroll(actionsTriggerRefs.current.get(internalId));
		});
	}

	function openActionsMenu(internalId) {
		if (navigationLocked || pointerInteractionLocked()) return;
		setKeyboardReorderInternalId(null);
		setActionsMenuInternalId(internalId);
	}

	function openEditor(internalId, trigger, mode = "settings") {
		if (navigationLocked || pointerInteractionLocked()) return;
		const node = findEditableNode(state.project, internalId);
		if (!node) return;
		const draft = createTargetedNodeEditorDraft(controller, node);
		if (!draft) return;
		setKeyboardReorderInternalId(null);
		setActionsMenuInternalId(null);
		setCreatedCardTarget(null);
		if (mode !== "rename") {
			setMobileLevelOverride(node.nodeType === "folder" ? "folders" : "collections");
		}
		editRestoreFocusRef.current = trigger;
		setEditorMode(mode);
		setEditorDiagnostics([]);
		setEditorDraft(draft);
	}

	function openSourceEditor(internalId, trigger) {
		if (navigationLocked || pointerInteractionLocked()) return;
		const result = createSourceEditSession(state.project, internalId);
		if (!result.ok) return;
		setKeyboardReorderInternalId(null);
		setActionsMenuInternalId(null);
		setCreatedCardTarget(null);
		setSourceEditStatusText("");
		sourceEditRestoreFocusRef.current = trigger;
		setSourceEdit({ session: result.session, draft: result.draft });
	}

	function cancelSourceEdit() {
		if (sourceEdit === null) return;
		setSourceEdit(null);
		setRestoreSourceEditTriggerFocus(true);
	}

	function applySourceEdit(draft) {
		if (sourceEdit === null) {
			return {
				ok: false,
				errors: [{
					code: "SOURCE_EDIT_SESSION_UNAVAILABLE",
					path: "$sourceEdit",
					message: "This source editor is no longer available. Changes were not saved.",
				}],
			};
		}
		const result = saveSourceEdit(controller, sourceEdit.session, draft);
		if (!result.ok) {
			setSourceEditStatusText("");
			queueMicrotask(() => setSourceEditStatusText("Source changes were not saved."));
			if (result.closeRequired) {
				const { collectionInternalId, folderInternalId } = sourceEdit.session;
				sourceEditRestoreFocusRef.current = null;
				setSourceEdit(null);
				setPendingSourceEditFallback({ collectionInternalId, folderInternalId });
			}
			return result;
		}

		sourceEditRestoreFocusRef.current = null;
		setSourceEdit(null);
		setPendingEditedSourceFocus(result.updatedInternalId);
		setSourceEditStatusText("");
		queueMicrotask(() => {
			setSourceEditStatusText(result.changed
				? "Source changes saved."
				: "Source unchanged; no update was needed.");
		});
		return result;
	}

	function closeEditor() {
		if (!visibleEditorDraft) return;
		setEditorDiagnostics([]);
		setEditorDraft(null);
		setEditorMode("settings");
	}

	function openAboutCredits() {
		if (navigationLocked || pointerInteractionLocked()) return;
		setAboutCreditsOpen(true);
	}

	function closeAboutCredits() {
		if (!aboutCreditsOpen) return;
		setAboutCreditsOpen(false);
		setRestoreAboutCreditsFocus(true);
	}

	function openBulkEdit() {
		if (
			navigationLocked
			|| pointerInteractionLocked()
			|| !currentBulkEditAvailability.hasCollections
		) return;
		setBulkEditDiagnostics([]);
		setBulkEditConfirmation(null);
		setBulkEditDraft(createBulkEditDraft());
	}

	function closeBulkEdit() {
		if (bulkEditDraft === null) return;
		setBulkEditDraft(null);
		setBulkEditDiagnostics([]);
		setBulkEditConfirmation(null);
		setRestoreBulkEditFocus(true);
	}

	function finishBulkEdit(updates) {
		let result;
		try {
			result = controller.applyPresentationUpdates(updates);
		} catch {
			result = {
				ok: false,
				errors: [{
					code: "BULK_EDIT_FAILED",
					path: "$ui.bulkEdit",
					message: "Bulk changes could not be applied. The project was not changed.",
				}],
			};
		}

		if (!result?.ok) {
			setBulkEditConfirmation(null);
			setBulkEditDiagnostics(result?.errors?.length > 0
				? [result.errors[0]]
				: [{
					code: "BULK_EDIT_FAILED",
					path: "$ui.bulkEdit",
					message: "Bulk changes could not be applied. The project was not changed.",
				}]);
			return result;
		}

		setBulkEditDraft(null);
		setBulkEditDiagnostics([]);
		setBulkEditConfirmation(null);
		setRestoreBulkEditFocus(true);
		return result;
	}

	function handleBulkEditSubmit(event) {
		event.preventDefault();
		if (bulkEditDraft === null) return;
		const plan = buildBulkEditPlan(state.project, bulkEditDraft);
		if (!plan.ok) {
			setBulkEditDiagnostics([plan.errors[0]]);
			return;
		}
		setBulkEditDiagnostics([]);
		if (plan.requiresTitleConfirmation) {
			setBulkEditConfirmation({ updates: plan.updates });
			return;
		}
		finishBulkEdit(plan.updates);
	}

	function cancelBulkEditTitleConfirmation() {
		if (bulkEditConfirmation === null) return;
		setBulkEditConfirmation(null);
	}

	function continueBulkEditTitleConfirmation() {
		if (bulkEditConfirmation === null) return;
		finishBulkEdit(bulkEditConfirmation.updates);
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
		const result = completeWorkspaceReturn({
			controller,
			gate: returnGateRef.current,
			onSuccess: () => {
				setEditorDraft(null);
				setEditorMode("settings");
				setEditorDiagnostics([]);
				setActionsMenuInternalId(null);
				setReturnDiagnostic(null);
				setCreatedCardTarget(null);
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
		if (
			hierarchyInteractionLocked
			|| pointerInteractionLocked()
			|| returnGateRef.current.isActive()
		) return;
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

	function createCollection(event) {
		if (hierarchyInteractionLocked || pointerInteractionLocked()) return;
		creationRestoreFocusRef.current = event?.currentTarget ?? null;
		setCreationStatusText("");
		setCreationSession({
			scope: "new-collection",
			openingProject: state.project,
			projectRevision: state.revision,
			currentYear: new Date().getFullYear(),
			destinationCollectionInternalId: null,
			destinationCollectionTitle: null,
		});
	}

	function createFolder(event) {
		if (
			hierarchyInteractionLocked
			|| pointerInteractionLocked()
			|| !view.selectedCollection
		) return;
		creationRestoreFocusRef.current = event?.currentTarget ?? null;
		setCreationStatusText("");
		setCreationSession({
			scope: "new-folder",
			openingProject: state.project,
			projectRevision: state.revision,
			currentYear: new Date().getFullYear(),
			destinationCollectionInternalId: view.selectedCollection.internalId,
			destinationCollectionTitle: view.selectedCollection.title,
		});
	}

	function createBlankItem() {
		if (!creationSession) return;
		const result = creationSession.scope === "new-collection"
			? createDraftCollection(controller, { selectCreated: desktopViewport })
			: createDraftFolder(
				controller,
				creationSession.destinationCollectionInternalId,
				{ selectCreated: desktopViewport },
			);
		if (!result.ok) return;

		const nodeType = creationSession.scope === "new-collection" ? "collection" : "folder";
		setCreationSession(null);
		creationRestoreFocusRef.current = null;
		setMobileLevelOverride(nodeType === "collection"
			? desktopViewport ? null : "collections"
			: desktopViewport ? null : "folders");
		setCreatedCardTarget(desktopViewport ? null : {
			nodeType,
			internalId: result.createdInternalId,
		});
	}

	function cancelCreation() {
		if (!creationSession) return;
		setCreationSession(null);
		setRestoreCreationTriggerFocus(true);
	}

	function applyDecadesPlan(plan) {
		if (!creationSession) return { ok: false, errors: [{ message: "The creation flow is no longer available." }] };
		const result = applyDecadesHierarchyPlan(controller, plan);
		if (!result.ok) return result;

		const nodeType = creationSession.scope === "new-collection" ? "collection" : "folder";
		const internalId = nodeType === "collection"
			? result.createdCollectionInternalIds?.[0]
			: result.createdFolderInternalIds?.[0];
		setCreationSession(null);
		creationRestoreFocusRef.current = null;
		setMobileLevelOverride(nodeType === "collection" ? "collections" : "folders");
		if (internalId) setCreatedCardTarget({ nodeType, internalId });
		setCreationStatusText("");
		queueMicrotask(() => setCreationStatusText(`Created ${result.counts.folderCount} Decade folder${result.counts.folderCount === 1 ? "" : "s"} with ${result.counts.sourceCount} source${result.counts.sourceCount === 1 ? "" : "s"}.`));
		return result;
	}

	function applyPeoplePlan(plan) {
		if (!creationSession) return { ok: false, errors: [{ message: "The creation flow is no longer available." }] };
		const result = applyPeopleHierarchyPlan(controller, plan);
		if (!result.ok) return result;
		const nodeType = creationSession.scope === "new-collection" ? "collection" : "folder";
		const internalId = nodeType === "collection" ? result.createdCollectionInternalIds?.[0] : result.createdFolderInternalIds?.[0];
		setCreationSession(null);
		creationRestoreFocusRef.current = null;
		setMobileLevelOverride(nodeType === "collection" ? "collections" : "folders");
		if (internalId) setCreatedCardTarget({ nodeType, internalId });
		setCreationStatusText("");
		queueMicrotask(() => setCreationStatusText(`Created ${result.counts.folderCount} People folder${result.counts.folderCount === 1 ? "" : "s"} with ${result.counts.sourceCount} source${result.counts.sourceCount === 1 ? "" : "s"}.`));
		return result;
	}

	function applyFranchisePlan(plan) {
		if (!creationSession) return { ok: false, errors: [{ message: "The creation flow is no longer available." }] };
		const result = applyFranchiseHierarchyPlan(controller, plan);
		if (!result.ok) return result;
		const nodeType = creationSession.scope === "new-collection" ? "collection" : "folder";
		const internalId = nodeType === "collection" ? result.createdCollectionInternalIds?.[0] : result.createdFolderInternalIds?.[0];
		setCreationSession(null);
		creationRestoreFocusRef.current = null;
		setMobileLevelOverride(nodeType === "collection" ? "collections" : "folders");
		if (internalId) setCreatedCardTarget({ nodeType, internalId });
		setCreationStatusText("");
		queueMicrotask(() => setCreationStatusText(`Created ${result.counts.folderCount} Franchise folder${result.counts.folderCount === 1 ? "" : "s"} with ${result.counts.sourceCount} source${result.counts.sourceCount === 1 ? "" : "s"}.`));
		return result;
	}

	function applyStudioPlan(plan) {
		if (!creationSession) return { ok: false, errors: [{ message: "The creation flow is no longer available." }] };
		const result = applyStudioHierarchyPlan(controller, plan);
		if (!result.ok) return result;
		const nodeType = creationSession.scope === "new-collection" ? "collection" : "folder";
		const internalId = nodeType === "collection" ? result.createdCollectionInternalIds?.[0] : result.createdFolderInternalIds?.[0];
		setCreationSession(null);
		creationRestoreFocusRef.current = null;
		setMobileLevelOverride(nodeType === "collection" ? "collections" : "folders");
		if (internalId) setCreatedCardTarget({ nodeType, internalId });
		setCreationStatusText("");
		queueMicrotask(() => setCreationStatusText(`Created ${result.counts.folderCount} Studio folder${result.counts.folderCount === 1 ? "" : "s"} with ${result.counts.sourceCount} source${result.counts.sourceCount === 1 ? "" : "s"}.`));
		return result;
	}

	function applyNetworkPlan(plan) {
		if (!creationSession) return { ok: false, errors: [{ message: "The creation flow is no longer available." }] };
		const result = applyNetworkHierarchyPlan(controller, plan);
		if (!result.ok) return result;
		const nodeType = creationSession.scope === "new-collection" ? "collection" : "folder";
		const internalId = nodeType === "collection" ? result.createdCollectionInternalIds?.[0] : result.createdFolderInternalIds?.[0];
		setCreationSession(null);
		creationRestoreFocusRef.current = null;
		setMobileLevelOverride(nodeType === "collection" ? "collections" : "folders");
		if (internalId) setCreatedCardTarget({ nodeType, internalId });
		setCreationStatusText("");
		queueMicrotask(() => setCreationStatusText(`Created ${result.counts.folderCount} Network folder${result.counts.folderCount === 1 ? "" : "s"} with ${result.counts.sourceCount} source${result.counts.sourceCount === 1 ? "" : "s"}.`));
		return result;
	}

	function applyGenrePlan(plan) {
		if (!creationSession) return { ok: false, errors: [{ message: "The creation flow is no longer available." }] };
		const result = applyGenreHierarchyPlan(controller, plan);
		if (!result.ok) return result;
		const nodeType = creationSession.scope === "new-collection" ? "collection" : "folder";
		const internalId = nodeType === "collection" ? result.createdCollectionInternalIds?.[0] : result.createdFolderInternalIds?.[0];
		setCreationSession(null);
		creationRestoreFocusRef.current = null;
		setMobileLevelOverride(nodeType === "collection" ? "collections" : "folders");
		if (internalId) setCreatedCardTarget({ nodeType, internalId });
		setCreationStatusText("");
		queueMicrotask(() => setCreationStatusText(`Created ${result.counts.folderCount} Genre folder${result.counts.folderCount === 1 ? "" : "s"} with ${result.counts.sourceCount} source${result.counts.sourceCount === 1 ? "" : "s"}.`));
		return result;
	}

	function applyStreamingPlan(plan) {
		if (!creationSession) return { ok: false, errors: [{ message: "The creation flow is no longer available." }] };
		const result = applyStreamingHierarchyPlan(controller, plan);
		if (!result.ok) return result;
		const nodeType = creationSession.scope === "new-collection" ? "collection" : "folder";
		const internalId = nodeType === "collection"
			? result.createdCollectionInternalIds?.[0]
			: result.createdFolderInternalIds?.[0] ?? result.updatedFolderInternalIds?.[0];
		setCreationSession(null);
		creationRestoreFocusRef.current = null;
		setMobileLevelOverride(nodeType === "collection" ? "collections" : "folders");
		if (internalId) setCreatedCardTarget({ nodeType, internalId });
		setCreationStatusText("");
		queueMicrotask(() => setCreationStatusText(`Applied ${result.counts.newSourceCount} Streaming source${result.counts.newSourceCount === 1 ? "" : "s"} across ${result.counts.folderCount} folder${result.counts.folderCount === 1 ? "" : "s"}.`));
		return result;
	}

	function openAddSource(trigger) {
		if (
			navigationLocked
			|| pointerInteractionLocked()
			|| !view.selectedFolder
		) return;
		setKeyboardReorderInternalId(null);
		setActionsMenuInternalId(null);
		setCreatedCardTarget(null);
		setSourceCreationStatusText("");
		addSourceRestoreFocusRef.current = trigger;
		setAddSourceSession({
			context: "folder",
			collectionInternalId: view.selectedCollection.internalId,
			folderInternalId: view.selectedFolder.internalId,
			modeId: null,
			returnFocusModeId: null,
		});
	}

	function chooseSourceMode(modeId) {
		if (
			!visibleAddSourceSession
			|| visibleAddSourceSession.context !== "folder"
			|| ![MOVIE_FRANCHISE_SOURCE_MODE_ID, PEOPLE_SOURCE_MODE_ID, STUDIO_SOURCE_MODE_ID, NETWORK_SOURCE_MODE_ID, STREAMING_SOURCE_MODE_ID, GENRE_SOURCE_MODE_ID, DECADE_SOURCE_MODE_ID].includes(modeId)
		) return;
		setAddSourceSession((current) => current ? { ...current, modeId, returnFocusModeId: null } : current);
	}

	function returnToSourceModePicker() {
		if (!visibleAddSourceSession || visibleAddSourceSession.context !== "folder") return;
		setAddSourceSession((current) => current ? {
			...current,
			returnFocusModeId: current.modeId,
			modeId: null,
		} : current);
	}

	function cancelAddSource() {
		if (!visibleAddSourceSession) return;
		setAddSourceSession(null);
		setRestoreAddSourceTriggerFocus(true);
	}

	function applyAddSource(draft, { duplicateApprovalIdentity = null } = {}) {
		if (!visibleAddSourceSession) {
			return {
				ok: false,
				errors: [{
					code: "SOURCE_CREATION_FOLDER_UNAVAILABLE",
					path: "$sourceCreation.folder",
					message: "The selected folder is no longer available.",
				}],
			};
		}

		const result = createMovieFranchiseSource(controller, {
			folderInternalId: visibleAddSourceSession.folderInternalId,
			draft,
			duplicateApprovalIdentity,
			interactionLocked: (
				editorLocked
				|| deleteLocked
				|| returnConfirmationOpen
				|| actionsMenuInternalId !== null
				|| pointerInteractionLocked()
			),
		});
		if (!result.ok) {
			if (result.errors?.[0]?.code === "SOURCE_CREATION_FOLDER_UNAVAILABLE") {
				setAddSourceSession(null);
				setRestoreAddSourceTriggerFocus(true);
				setSourceCreationStatusText("The source was not added because the selected folder is no longer available.");
			}
			return result;
		}

		addSourceRestoreFocusRef.current = null;
		setAddSourceSession(null);
		setPendingCreatedSourceFocus(result.createdInternalId);
		setSourceCreationStatusText("");
		queueMicrotask(() => {
			setSourceCreationStatusText(`Added source “${draft.editable.title}”.`);
		});
		return result;
	}

	function applyPeopleSources(bundle) {
		if (!visibleAddSourceSession) {
			return {
				ok: false,
				errors: [{
					code: "PEOPLE_FOLDER_UNAVAILABLE",
					path: "$people.destination",
					message: "The selected collection is no longer available.",
				}],
			};
		}
		const interactionLocked = (
				editorLocked
				|| deleteLocked
				|| returnConfirmationOpen
				|| actionsMenuInternalId !== null
				|| pointerInteractionLocked()
			);
		const result = createPeopleSourceBundle(controller, {
				destination: {
					kind: "existing-folder",
					folderInternalId: visibleAddSourceSession.folderInternalId,
				},
				person: bundle.person,
				drafts: bundle.drafts,
				artwork: bundle.artwork,
				duplicateOverrideIdentity: bundle.duplicateOverrideIdentity,
				interactionLocked,
			});
		if (!result.ok) return result;

		const focusFolderInternalId = result.updatedFolderInternalId;
		controller.selectNode(focusFolderInternalId);
		addSourceRestoreFocusRef.current = null;
		setAddSourceSession(null);
		setMobileLevelOverride("folders");
		setPendingCreatedFolderFocus(focusFolderInternalId);
		setSourceCreationStatusText("");
		queueMicrotask(() => {
			setSourceCreationStatusText(result.promotedFolder
					? `Created “${bundle.person.name}” with ${result.addedSourceCount} source${result.addedSourceCount === 1 ? "" : "s"}.`
					: `Added ${result.addedSourceCount} source${result.addedSourceCount === 1 ? "" : "s"} for “${bundle.person.name}”.`);
		});
		return result;
	}

	function applyStudioSources(bundle) {
		if (!visibleAddSourceSession || visibleAddSourceSession.context !== "folder") {
			return {
				ok: false,
				errors: [{
					code: "STUDIO_FOLDER_UNAVAILABLE",
					path: "$studio.destination",
					message: "The selected destination folder is no longer available.",
				}],
			};
		}
		const result = createStudioSourceBundle(controller, {
			folderInternalId: visibleAddSourceSession.folderInternalId,
			studio: bundle.studio,
			drafts: bundle.drafts,
			duplicateOverrideIdentity: bundle.duplicateOverrideIdentity,
			interactionLocked: (
				editorLocked
				|| deleteLocked
				|| returnConfirmationOpen
				|| actionsMenuInternalId !== null
				|| pointerInteractionLocked()
			),
		});
		if (!result.ok) return result;
		addSourceRestoreFocusRef.current = null;
		setAddSourceSession(null);
		setPendingCreatedSourceFocus(result.createdSourceInternalIds[0]);
		setSourceCreationStatusText("");
		queueMicrotask(() => {
			setSourceCreationStatusText(`Added ${result.addedSourceCount} source${result.addedSourceCount === 1 ? "" : "s"} for “${bundle.studio.name}”.`);
		});
		return result;
	}

	function applyNetworkSource(bundle) {
		if (!visibleAddSourceSession || visibleAddSourceSession.context !== "folder") {
			return {
				ok: false,
				errors: [{
					code: "NETWORK_FOLDER_UNAVAILABLE",
					path: "$network.destination",
					message: "The selected destination folder is no longer available.",
				}],
			};
		}
		const result = createNetworkSource(controller, {
			folderInternalId: visibleAddSourceSession.folderInternalId,
			network: bundle.network,
			draft: bundle.draft,
			duplicateOverrideIdentity: bundle.duplicateOverrideIdentity,
			interactionLocked: (
				editorLocked
					|| deleteLocked
					|| returnConfirmationOpen
					|| actionsMenuInternalId !== null
					|| pointerInteractionLocked()
			),
		});
		if (!result.ok) return result;
		addSourceRestoreFocusRef.current = null;
		setAddSourceSession(null);
		setPendingCreatedSourceFocus(result.createdSourceInternalIds[0]);
		setSourceCreationStatusText("");
		queueMicrotask(() => setSourceCreationStatusText(`Added Network Series source for “${bundle.network.name}”.`));
		return result;
	}

	function applyStreamingSources(bundle) {
		if (!visibleAddSourceSession || visibleAddSourceSession.context !== "folder") {
			return {
				ok: false,
				errors: [{
					code: "STREAMING_FOLDER_UNAVAILABLE",
					path: "$streaming.destination",
					message: "The selected destination folder is no longer available.",
				}],
			};
		}
		const result = createStreamingSourceBundle(controller, {
			folderInternalId: visibleAddSourceSession.folderInternalId,
			provider: bundle.provider,
			regions: bundle.regions,
			catalogueRegions: bundle.catalogueRegions,
			mediaChoice: bundle.mediaChoice,
			sortOptionId: bundle.sortOptionId,
			drafts: bundle.drafts,
			duplicateOverrideIdentity: bundle.duplicateOverrideIdentity,
			interactionLocked: (
				editorLocked
					|| deleteLocked
					|| returnConfirmationOpen
					|| actionsMenuInternalId !== null
					|| pointerInteractionLocked()
			),
		});
		if (!result.ok) return result;
		addSourceRestoreFocusRef.current = null;
		setAddSourceSession(null);
		setPendingCreatedSourceFocus(result.createdSourceInternalIds[0]);
		setSourceCreationStatusText("");
		queueMicrotask(() => setSourceCreationStatusText(`Added ${result.addedSourceCount} Streaming source${result.addedSourceCount === 1 ? "" : "s"} for “${bundle.provider.name}”.`));
		return result;
	}

	function applyGenreSources(bundle) {
		if (!visibleAddSourceSession) {
			return {
				ok: false,
				errors: [{ code: "GENRE_DESTINATION_UNAVAILABLE", path: "$genres.destination", message: "The selected Genre destination is no longer available." }],
			};
		}
		const interactionLocked = (
			editorLocked
			|| deleteLocked
			|| returnConfirmationOpen
			|| actionsMenuInternalId !== null
			|| pointerInteractionLocked()
		);
		const result = createGenreSourceBundle(controller, {
			folderInternalId: visibleAddSourceSession.folderInternalId,
			genres: bundle.genres,
			sharedMediaChoice: bundle.sharedMediaChoice,
			sortOptionId: bundle.sortOptionId,
			advanced: bundle.advanced,
			destinationMode: bundle.destinationMode,
			drafts: bundle.drafts,
			duplicateOverrideIdentity: bundle.duplicateOverrideIdentity,
			interactionLocked,
		});
		if (!result.ok) return result;
		addSourceRestoreFocusRef.current = null;
		setAddSourceSession(null);
		setSourceCreationStatusText("");
		if (bundle.destinationMode === "genre-folders") {
			const firstFolderInternalId = result.createdFolderInternalIds[0];
			controller.selectNode(firstFolderInternalId);
			setMobileLevelOverride("folders");
			setPendingCreatedFolderFocus(firstFolderInternalId);
			queueMicrotask(() => setSourceCreationStatusText(`Created ${result.addedFolderCount} Genre folder${result.addedFolderCount === 1 ? "" : "s"} with ${result.addedSourceCount} source${result.addedSourceCount === 1 ? "" : "s"}.`));
		} else {
			setPendingCreatedSourceFocus(result.createdSourceInternalIds[0]);
			queueMicrotask(() => setSourceCreationStatusText(`Added ${result.addedSourceCount} Genre source${result.addedSourceCount === 1 ? "" : "s"}.`));
		}
		return result;
	}

	function applyDecadeSources(bundle) {
		if (!visibleAddSourceSession || visibleAddSourceSession.context !== "folder") {
			return {
				ok: false,
				errors: [{ code: "DECADE_SOURCE_FOLDER_UNAVAILABLE", path: "$decadeSource.destination", message: "The selected Decade destination is no longer available." }],
			};
		}
		const result = createDecadeSourceBundle(controller, {
			folderInternalId: visibleAddSourceSession.folderInternalId,
			periodIds: bundle.periodIds,
			mediaMode: bundle.mediaMode,
			genreNames: bundle.genreNames,
			sortOptionId: bundle.sortOptionId,
			advanced: bundle.advanced,
			drafts: bundle.drafts,
			duplicateOverrideIdentity: bundle.duplicateOverrideIdentity,
			interactionLocked: (
				editorLocked
				|| deleteLocked
				|| returnConfirmationOpen
				|| actionsMenuInternalId !== null
				|| pointerInteractionLocked()
			),
		});
		if (!result.ok) return result;
		addSourceRestoreFocusRef.current = null;
		setAddSourceSession(null);
		setPendingCreatedSourceFocus(result.createdSourceInternalIds[0]);
		setSourceCreationStatusText("");
		queueMicrotask(() => setSourceCreationStatusText(`Added ${result.addedSourceCount} Decade source${result.addedSourceCount === 1 ? "" : "s"}.`));
		return result;
	}

	function completeDeletion(impact) {
		const outcome = executeDeletion(controller, impact, deleteGateRef.current);
		if (!outcome.started) return;
		setDeleteConfirmation(null);

		if (!outcome.ok) {
			setRestoreDeleteTriggerFocus(true);
			return;
		}

		deleteTriggerRef.current = null;
		if (impact.recovery.selectionAffected) {
			setMobileLevelOverride(impact.recovery.mobileLevel);
		}
		setCreatedCardTarget(null);
		setPendingDeleteFocus({
			...impact.recovery.focus,
			parentInternalId: impact.recovery.parentInternalId,
		});
		setDeleteStatusText("");
		queueMicrotask(() => {
			setDeleteStatusText(`Deleted ${impact.nodeType} “${impact.displayName}”.`);
		});
	}

	function requestDeletion(internalId, trigger) {
		if (navigationLocked || pointerInteractionLocked()) return;
		const impact = buildDeletionImpact(state, internalId);
		if (!impact) return;

		setKeyboardReorderInternalId(null);
		setActionsMenuInternalId(null);
		setCreatedCardTarget(null);
		deleteTriggerRef.current = trigger;
		deleteGateRef.current.reset();
		if (impact.confirmationRequired) {
			setDeleteConfirmation(impact);
			return;
		}
		completeDeletion(impact);
	}

	function cancelDeletion() {
		if (!deleteConfirmation) return;
		setDeleteConfirmation(null);
		setRestoreDeleteTriggerFocus(true);
	}

	function announceMovement(message) {
		setMovementStatusText("");
		movementSequenceRef.current += 1;
		setPendingMovementAnnouncement({
			id: movementSequenceRef.current,
			message,
		});
	}

	function completeMovement(node, message) {
		setMoveFocusTarget({ internalId: node.internalId });
		announceMovement(message);
	}

	function moveNodeWithKeyboard(node, noun, direction) {
		if (
			hierarchyInteractionLocked
			|| pointerInteractionLocked()
			|| keyboardReorderInternalId !== node.internalId
		) return;
		const result = moveSiblingNode(controller, node, direction);
		if (!result.moved) return;

		completeMovement(
			node,
			movementAnnouncement(noun, node.accessibleName, direction),
		);
	}

	function toggleKeyboardReorder(node, noun) {
		if (
			hierarchyInteractionLocked
			|| pointerInteractionLocked()
			|| node.reorderGroupSize <= 1
		) return;
		const nextInternalId = keyboardReorderInternalId === node.internalId
			? null
			: node.internalId;
		setKeyboardReorderInternalId(nextInternalId);
		setMovementStatusText(nextInternalId === null
			? `Stopped reordering ${noun} “${node.accessibleName}”`
			: `Reordering ${noun} “${node.accessibleName}”. Use Arrow Up and Arrow Down to move it.`);
	}

	function releasePointerCapture(session) {
		if (!session?.handle?.hasPointerCapture?.(session.pointerId)) return;
		try {
			session.handle.releasePointerCapture(session.pointerId);
		} catch {
			// Teardown is already guarded against capture-loss re-entry.
		}
	}

	function cancelPointerReorder({ restoreFocus = true } = {}) {
		const session = dragSessionRef.current;
		if (!session) return;
		dragSessionRef.current = null;
		session.releasing = true;
		setDragState(null);
		releasePointerCapture(session);
		removeHierarchyDragOverlay(session);
		if (restoreFocus) session?.handle?.focus?.();
	}

	function beginPointerReorder(event, node, noun, siblings) {
		if (
			hierarchyInteractionLocked
			|| pointerInteractionLocked()
			|| node.reorderGroupSize <= 1
			|| event.isPrimary === false
			|| (event.pointerType === "mouse" && event.button !== 0)
		) {
			return;
		}

		event.stopPropagation();
		event.currentTarget.focus();
		const card = hierarchyCardRefs.current.get(node.internalId);
		const rect = card?.getBoundingClientRect?.();
		if (!card || !rect) return;
		if (!establishPointerCapture(event.currentTarget, event.pointerId)) return;

		setKeyboardReorderInternalId(null);
		dragSessionRef.current = {
			pointerId: event.pointerId,
			startY: event.clientY,
			destinationPosition: node.reorderGroupPosition,
			dragging: false,
			node,
			noun,
			groupItems: siblings.filter((item) => (
				item.reorderGroup === node.reorderGroup
			)),
			handle: event.currentTarget,
			card,
			originRect: {
				top: rect.top,
				left: rect.left,
				width: rect.width,
				height: rect.height,
			},
			grabOffsetY: event.clientY - rect.top,
			bounds: null,
			layout: null,
			overlay: null,
			releasing: false,
			settling: false,
		};
	}

	function activatePointerReorder(session, event) {
		const documentScrollY = window.scrollY;
		const bounds = session.groupItems.map((item) => {
			const card = hierarchyCardRefs.current.get(item.internalId);
			const rect = card?.getBoundingClientRect?.();
			return rect ? {
				internalId: item.internalId,
				position: item.reorderGroupPosition,
				top: rect.top + documentScrollY,
				bottom: rect.bottom + documentScrollY,
			} : null;
		}).filter(Boolean);
		const activeBounds = bounds.find((entry) => (
			entry.internalId === session.node.internalId
		));
		if (!activeBounds) return false;

		session.dragging = true;
		session.bounds = bounds;
		session.originDocumentTop = activeBounds.top;
		session.layout = provisionalDragLayout(
			bounds,
			session.node.internalId,
			session.destinationPosition,
		);
		session.overlay = createHierarchyDragOverlay(
			session.card,
			session.originRect,
			event.clientY,
			session.grabOffsetY,
		);
		setDragState({
			internalId: session.node.internalId,
			indicatorInternalId: null,
			indicatorEdge: null,
			displacements: session.layout?.displacements ?? {},
		});
		return true;
	}

	function updatePointerReorder(event) {
		const session = dragSessionRef.current;
		if (
			!session
			|| session.settling
			|| session.pointerId !== event.pointerId
		) return;
		if (!session.dragging) {
			if (!crossedDragThreshold(session.startY, event.clientY)) return;
			if (!activatePointerReorder(session, event)) {
				cancelPointerReorder();
				return;
			}
		}

		event.preventDefault();
		event.stopPropagation();
		setDragOverlayTop(
			session.overlay,
			dragOverlayTop(event.clientY, session.grabOffsetY),
		);

		const scrollDelta = reorderAutoScrollDelta(event.clientY, window.innerHeight);
		if (scrollDelta !== 0) {
			window.scrollBy({ top: scrollDelta, left: 0, behavior: "auto" });
		}

		const destinationPosition = pointerDestinationForY(
			session.bounds,
			event.clientY + window.scrollY,
		);
		if (destinationPosition === null) return;

		session.destinationPosition = destinationPosition;
		session.layout = provisionalDragLayout(
			session.bounds,
			session.node.internalId,
			destinationPosition,
		);
		const indicator = insertionIndicatorForDestination(
			session.groupItems,
			session.node.internalId,
			destinationPosition,
		);
		setDragState({
			internalId: session.node.internalId,
			indicatorInternalId: indicator?.internalId ?? null,
			indicatorEdge: indicator?.edge ?? null,
			displacements: session.layout?.displacements ?? {},
		});
	}

	function completePointerReorder(event) {
		const session = dragSessionRef.current;
		if (
			!session
			|| session.settling
			|| session.pointerId !== event.pointerId
		) return;

		session.releasing = true;
		releasePointerCapture(session);
		if (!session.dragging) {
			dragSessionRef.current = null;
			return;
		}

		event.preventDefault();
		event.stopPropagation();
		session.settling = true;
		const targetTop = (
			session.originDocumentTop
			+ (session.layout?.placeholderShiftY ?? 0)
			- window.scrollY
		);
		settleHierarchyDragOverlay(session, targetTop, () => {
			if (dragSessionRef.current !== session) return;
			dragSessionRef.current = null;
			setDragState(null);
			removeHierarchyDragOverlay(session);

			const visibleDestinationPosition = visiblePositionForGroupDestination(
				session.groupItems,
				session.destinationPosition,
			);
			const result = moveSiblingNodeToPosition(
				controller,
				session.node,
				session.destinationPosition,
			);
			if (!result.moved) {
				session.handle.focus?.();
				return;
			}

			completeMovement(
				session.node,
				movementPositionAnnouncement(
					session.noun,
					session.node.accessibleName,
					(visibleDestinationPosition ?? session.destinationPosition) + 1,
				),
			);
		});
	}

	function cancelPointerEvent(event) {
		const session = dragSessionRef.current;
		if (
			!session
			|| session.releasing
			|| session.pointerId !== event.pointerId
		) return;
		event.stopPropagation();
		cancelPointerReorder();
	}

	function handleLostPointerCapture(event) {
		const session = dragSessionRef.current;
		if (
			!session
			|| session.releasing
			|| session.pointerId !== event.pointerId
		) return;
		cancelPointerReorder();
	}

	function handleReorderKeyDown(event, node, noun) {
		const pointerSession = dragSessionRef.current;
		if (pointerSession !== null) {
			if (
				event.key === "Escape"
				&& pointerSession.node.internalId === node.internalId
				&& !pointerSession.settling
			) {
				event.preventDefault();
				event.stopPropagation();
				cancelPointerReorder();
			}
			return;
		}
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			event.stopPropagation();
			toggleKeyboardReorder(node, noun);
			return;
		}
		if (event.key === "Escape" && keyboardReorderInternalId === node.internalId) {
			event.preventDefault();
			event.stopPropagation();
			toggleKeyboardReorder(node, noun);
			return;
		}
		if (keyboardReorderInternalId !== node.internalId) return;
		if (event.key === "ArrowUp") {
			event.preventDefault();
			event.stopPropagation();
			moveNodeWithKeyboard(node, noun, "up");
		} else if (event.key === "ArrowDown") {
			event.preventDefault();
			event.stopPropagation();
			moveNodeWithKeyboard(node, noun, "down");
		}
	}

	function handleReorderClick(event, node, noun) {
		event.stopPropagation();
		if (pointerInteractionLocked()) return;
		if (event.detail === 0) toggleKeyboardReorder(node, noun);
	}

	const hierarchyActionProps = {
		enableDoubleClickEdit: desktopViewport,
		navigationLocked: hierarchyInteractionLocked,
		actionsDisabled: navigationLocked,
		actionsMenuInternalId,
		onOpenActionsMenu: openActionsMenu,
		onCloseActionsMenu: closeActionsMenu,
		onSelect: selectNode,
		onOpenEditor: openEditor,
		onOpenSourceEditor: openSourceEditor,
		onRequestDelete: requestDeletion,
		dragState,
		keyboardReorderInternalId,
		onPointerDown: beginPointerReorder,
		onPointerMove: updatePointerReorder,
		onPointerUp: completePointerReorder,
		onPointerCancel: cancelPointerEvent,
		onLostPointerCapture: handleLostPointerCapture,
		onKeyDown: handleReorderKeyDown,
		onClick: handleReorderClick,
		registerReorderHandle,
		registerHierarchyCard,
		registerPrimaryControl,
		registerActionsTrigger,
	};

	return (
		<main
			className="builder-shell"
			data-builder-shell="true"
			data-editor-lock={editorLocked ? "true" : undefined}
			data-settings-open={editorLocked ? "true" : undefined}
			data-delete-open={deleteLocked ? "true" : undefined}
			data-creation-open={creationLocked ? "true" : undefined}
			data-add-source-open={addSourceLocked ? "true" : undefined}
			data-source-edit-open={sourceEditLocked ? "true" : undefined}
			data-about-credits-open={aboutCreditsOpen ? "true" : undefined}
			data-bulk-edit-open={bulkEditLocked ? "true" : undefined}
		>
			<div
				className="workspace-underlay"
				data-workspace-underlay="true"
				inert={modalLocked || undefined}
				aria-hidden={modalLocked ? "true" : undefined}
			>
				<header className="app-header">
					<div className="brand-lockup">
						<img className="builder-mark" src={builderMark} alt="" width="56" height="56" />
						<div>
							<p className="preview-label">Development preview</p>
							<h1 className="builder-product-title">
								<span>Dingo's</span>
								<span>Collection Builder</span>
							</h1>
							<p className="workspace-subtitle">Built for Nuvio collections</p>
						</div>
					</div>
					<div className="workspace-header-actions">
						<button
							ref={returnHomeButtonRef}
							className="builder-home-action"
							type="button"
							data-action="return-builder-home"
							disabled={hierarchyInteractionLocked}
							onClick={handleReturnHome}
						>
							Back to builder home
						</button>
						<button
							ref={aboutCreditsTriggerRef}
							className="about-credits-trigger"
							type="button"
							data-action="open-about-credits"
							aria-label="About & Credits"
							aria-haspopup="dialog"
							disabled={hierarchyInteractionLocked}
							onClick={openAboutCredits}
						>
							<span aria-hidden="true">?</span>
						</button>
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
				<p
					id="reorder-instructions"
					className="visually-hidden"
				>
					Press Enter or Space on a reorder handle to start keyboard reordering.
					Use Arrow Up and Arrow Down to move the item, then press Enter, Space, or Escape to finish.
				</p>
				<p
					className="visually-hidden"
					data-movement-status="true"
					role="status"
					aria-live="polite"
					aria-atomic="true"
				>
					{movementStatusText}
				</p>
				<p
					className="visually-hidden"
					data-deletion-status="true"
					role="status"
					aria-live="polite"
					aria-atomic="true"
				>
					{deleteStatusText}
				</p>
				<p
					className="visually-hidden"
					data-creation-status="true"
					role="status"
					aria-live="polite"
					aria-atomic="true"
				>
					{creationStatusText}
				</p>
				<p
					className="visually-hidden"
					data-source-creation-status="true"
					role="status"
					aria-live="polite"
					aria-atomic="true"
				>
					{sourceCreationStatusText}
				</p>
				<p
					className="visually-hidden"
					data-source-edit-status="true"
					role="status"
					aria-live="polite"
					aria-atomic="true"
				>
					{sourceEditStatusText}
				</p>

				<div className="workspace" data-mobile-level={activeMobileLevel}>
					<section className="workspace-panel collections-panel" data-panel="collections" aria-labelledby="collections-title">
						<PanelHeader
							id="collections-title"
							title="Collections"
							count={view.collections.length}
							mobileInlineCount
							headingAction={(
								<button
									ref={bulkEditTriggerRef}
									className="presentation-settings-trigger"
									type="button"
									data-action="open-bulk-edit"
									aria-label="Global display settings"
									title="Global display settings"
									aria-haspopup="dialog"
									disabled={hierarchyInteractionLocked || !currentBulkEditAvailability.hasCollections}
									onClick={openBulkEdit}
								>
									<SlidersIcon />
								</button>
							)}
							action={(
								<button
									className="primary-action"
									type="button"
									data-action="create-collection"
									disabled={hierarchyInteractionLocked}
									onClick={createCollection}
								>
									<span aria-hidden="true">+</span>
									New collection
								</button>
							)}
						/>
						<div className="panel-body">
							{view.collections.length > 0 ? (
								<>
									<CollectionList
										collections={view.collections}
										actionProps={hierarchyActionProps}
										createdCardTarget={createdCardTarget}
										createdCardRef={createdCardRef}
									/>
									<HierarchyAddAction
										noun="collection"
										disabled={hierarchyInteractionLocked}
										onClick={createCollection}
										registerAction={collectionBottomAddRef}
									/>
								</>
							) : (
								<EmptyState
									title="Start your first collection"
									action={(
										<button ref={collectionEmptyAddRef} className="empty-state-action" type="button" data-action="create-collection-empty" disabled={hierarchyInteractionLocked} onClick={createCollection} aria-label="Create first collection">
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
							disabled={hierarchyInteractionLocked}
							onClick={clearSelection}
						>
							<span aria-hidden="true">←</span>
							All collections
						</button>
						{view.selectedCollection ? (
							<div className="mobile-context-row mobile-only">
								<p className="mobile-context" aria-label={view.selectedCollection.accessibleName}>
									{view.selectedCollection.title}
								</p>
								<button
									className="quick-rename-action"
									type="button"
									data-quick-rename="collection"
									aria-label={`Rename collection “${view.selectedCollection.accessibleName}”`}
									aria-haspopup="dialog"
									disabled={hierarchyInteractionLocked}
									onClick={(event) => openEditor(
										view.selectedCollection.internalId,
										event.currentTarget,
										"rename",
									)}
								>
									<PencilIcon />
								</button>
							</div>
						) : null}
						<PanelHeader
							id="folders-title"
							title="Folders"
							count={view.folders.length}
							mobileInlineCount
							action={view.selectedCollection ? (
								<button
									className="primary-action"
									type="button"
									data-action="create-folder"
									disabled={hierarchyInteractionLocked}
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
								<>
									<FolderList
										folders={view.folders}
										actionProps={hierarchyActionProps}
										createdCardTarget={createdCardTarget}
										createdCardRef={createdCardRef}
									/>
									<HierarchyAddAction
										noun="folder"
										disabled={hierarchyInteractionLocked}
										onClick={createFolder}
										registerAction={folderBottomAddRef}
									/>
								</>
							) : (
								<EmptyState
									title="No folders yet"
									action={(
										<button ref={folderEmptyAddRef} className="empty-state-action" type="button" data-action="create-folder-empty" disabled={hierarchyInteractionLocked} onClick={createFolder} aria-label="Create first folder">
											<span aria-hidden="true">+</span>
										</button>
									)}
								>
									Add a draft folder inside {view.selectedCollection.title}.
								</EmptyState>
							)}
						</div>
					</section>

					<section className="workspace-panel sources-panel" data-panel="sources" aria-labelledby="sources-title">
						{view.selectedCollection ? (
							<button
								ref={sourceBackControlRef}
								className="back-control mobile-only"
								type="button"
								disabled={hierarchyInteractionLocked}
								onClick={() => selectNode(view.selectedCollection.internalId)}
							>
								<span aria-hidden="true">←</span>
								{view.selectedCollection.title}
							</button>
						) : null}
						{view.selectedFolder ? (
							<div className="mobile-context-row mobile-only">
								<p className="mobile-context" aria-label={view.selectedFolder.accessibleName}>
									{view.selectedFolder.title}
								</p>
								<button
									className="quick-rename-action"
									type="button"
									data-quick-rename="folder"
									aria-label={`Rename folder “${view.selectedFolder.accessibleName}”`}
									aria-haspopup="dialog"
									disabled={hierarchyInteractionLocked}
									onClick={(event) => openEditor(
										view.selectedFolder.internalId,
										event.currentTarget,
										"rename",
									)}
								>
									<PencilIcon />
								</button>
							</div>
						) : null}
						<PanelHeader
							id="sources-title"
							title="Sources"
							count={view.sources.length}
							mobileInlineCount
							action={view.selectedFolder ? (
								<button
									className="primary-action"
									type="button"
									data-action="add-source"
									disabled={hierarchyInteractionLocked}
									onClick={(event) => openAddSource(event.currentTarget)}
								>
									<span aria-hidden="true">+</span>
									Add source
								</button>
							) : null}
						/>
						<div className="panel-body sources-body">
							{!view.selectedFolder ? (
								<p className="neutral-state">Select a folder to view its sources.</p>
							) : view.sources.length > 0 ? (
								<>
									<SourceList sources={view.sources} actionProps={hierarchyActionProps} />
									<HierarchyAddAction
										noun="source"
										actionName="add-source-after-list"
										disabled={hierarchyInteractionLocked}
										onClick={(event) => openAddSource(event.currentTarget)}
									/>
								</>
							) : (
								<EmptyState
									title="No sources in this folder yet"
									action={(
										<button
											className="empty-state-source-action"
											type="button"
											data-action="add-source-empty"
											disabled={hierarchyInteractionLocked}
											onClick={(event) => openAddSource(event.currentTarget)}
										>
											<span aria-hidden="true">+</span>
											Add first source
										</button>
									)}
								>
									Add a supported TMDB source to begin.
								</EmptyState>
							)}
						</div>
					</section>
				</div>
			</div>

			{aboutCreditsOpen ? <AboutCreditsDialog onClose={closeAboutCredits} /> : null}
			{bulkEditDraft && bulkEditConfirmation === null ? (
				<BulkEditDialog
					draft={bulkEditDraft}
					diagnostics={bulkEditDiagnostics}
					availability={currentBulkEditAvailability}
					onChange={(field, value) => {
						setBulkEditDraft((current) => updateBulkEditDraft(current, field, value));
						setBulkEditDiagnostics([]);
					}}
					onSubmit={handleBulkEditSubmit}
					onCancel={closeBulkEdit}
				/>
			) : null}
			{bulkEditConfirmation ? (
				<BulkEditTitleConfirmation
					onCancel={cancelBulkEditTitleConfirmation}
					onContinue={continueBulkEditTitleConfirmation}
				/>
			) : null}
			{creationSession ? (
				<CreationDialog
					scope={creationSession.scope}
					project={creationSession.openingProject ?? state.project}
					projectRevision={creationSession.projectRevision ?? state.revision}
					currentYear={creationSession.currentYear ?? new Date().getFullYear()}
					destinationCollectionInternalId={creationSession.destinationCollectionInternalId}
					destinationCollectionTitle={creationSession.destinationCollectionTitle}
					initialOptionId={creationSession.optionId ?? null}
					onCancel={cancelCreation}
					onCreateBlank={createBlankItem}
					onApplyDecades={applyDecadesPlan}
					onApplyPeople={applyPeoplePlan}
					onApplyFranchises={applyFranchisePlan}
					onApplyStudios={applyStudioPlan}
					onApplyNetworks={applyNetworkPlan}
					onApplyGenres={applyGenrePlan}
					onApplyStreaming={applyStreamingPlan}
					collectionProvider={sourceProviderRef.current}
					peopleProvider={peopleProviderRef.current}
					peopleManifestClient={peopleManifestClientRef.current}
					studioCatalogueProvider={studioCatalogueProviderRef.current}
					studioPreviewProvider={studioPreviewProviderRef.current}
					studioArtworkRuntimeClient={studioArtworkRuntimeClientRef.current}
					networkCatalogueProvider={networkCatalogueProviderRef.current}
					networkPreviewProvider={networkPreviewProviderRef.current}
					genrePreviewProvider={genrePreviewProviderRef.current}
					decadePreviewProvider={decadePreviewProviderRef.current}
					streamingCatalogueProvider={streamingCatalogueProviderRef.current}
					streamingPreviewProvider={streamingPreviewProviderRef.current}
					networkArtworkRuntimeClient={studioArtworkRuntimeClientRef.current}
				/>
			) : null}
			{visibleEditorDraft ? (
				<NodeEditor
					draft={visibleEditorDraft}
					diagnostics={editorDiagnostics}
					titleInputRef={titleInputRef}
					mode={editorMode}
					folderArtworkSuggestionContext={{
						folder: editorTarget,
						peopleManifestClient: peopleManifestClientRef.current,
						peopleProvider: peopleProviderRef.current,
						artworkRuntimeClient: studioArtworkRuntimeClientRef.current,
						studioCatalogueProvider: studioCatalogueProviderRef.current,
						networkCatalogueProvider: networkCatalogueProviderRef.current,
					}}
					folderSiblings={editorParentCollection?.folders ?? []}
					onChange={(field, value, context = null) => {
						setEditorDraft((current) => {
							return field === "tileShape" && current?.nodeType === "folder"
								? updateNodeEditorTileShape(current, value, context?.suggestionSet ?? null, {
									recheckCurrentShape: context?.recheckCurrentShape === true,
								})
								: updateNodeEditorField(current, field, value);
						});
						setEditorDiagnostics((current) => current.filter((entry) => (
							entry.path !== `$ui.editor.${field}`
							&& !(field === "hideNuvioTitle" && entry.path === "$ui.editor.title")
						)));
					}}
					onSubmit={handleEditorSubmit}
					onCancel={closeEditor}
				/>
			) : null}
			{deleteConfirmation ? (
				<DeleteConfirmation
					impact={deleteConfirmation}
					onCancel={cancelDeletion}
					onConfirm={() => completeDeletion(deleteConfirmation)}
				/>
			) : null}
			{visibleAddSourceSession ? (
				visibleAddSourceSession.modeId === null ? (
					<SourceModeDialog
						folderName={addSourceFolder?.editable?.title ?? "selected folder"}
						initialFocusModeId={visibleAddSourceSession.returnFocusModeId}
						onCancel={cancelAddSource}
						onSelectMode={chooseSourceMode}
					/>
				) : visibleAddSourceSession.modeId === PEOPLE_SOURCE_MODE_ID ? (
					<PeopleSourceFlow
						context={visibleAddSourceSession.context}
						provider={peopleProviderRef.current}
						manifestClient={peopleManifestClientRef.current}
						project={state.project}
						collection={addSourceCollection}
						folder={addSourceFolder}
						onBack={returnToSourceModePicker}
						onCancel={cancelAddSource}
						onApply={applyPeopleSources}
					/>
				) : visibleAddSourceSession.modeId === STUDIO_SOURCE_MODE_ID ? (
					<StudioSourceFlow
						catalogueProvider={studioCatalogueProviderRef.current}
						countProvider={studioCountProviderRef.current}
						previewProvider={studioPreviewProviderRef.current}
						project={state.project}
						folder={addSourceFolder}
						onBack={returnToSourceModePicker}
						onCancel={cancelAddSource}
						onApply={applyStudioSources}
						/>
				) : visibleAddSourceSession.modeId === NETWORK_SOURCE_MODE_ID ? (
					<NetworkSourceFlow
						catalogueProvider={networkCatalogueProviderRef.current}
						countProvider={networkCountProviderRef.current}
						previewProvider={networkPreviewProviderRef.current}
						project={state.project}
						folder={addSourceFolder}
						onBack={returnToSourceModePicker}
						onCancel={cancelAddSource}
						onApply={applyNetworkSource}
					/>
				) : visibleAddSourceSession.modeId === STREAMING_SOURCE_MODE_ID ? (
					<StreamingSourceFlow
						catalogueProvider={streamingCatalogueProviderRef.current}
						previewProvider={streamingPreviewProviderRef.current}
						project={state.project}
						folder={addSourceFolder}
						onBack={returnToSourceModePicker}
						onCancel={cancelAddSource}
						onApply={applyStreamingSources}
					/>
				) : visibleAddSourceSession.modeId === GENRE_SOURCE_MODE_ID ? (
					<GenreSourceFlow
						previewProvider={genrePreviewProviderRef.current}
						project={state.project}
						folder={addSourceFolder}
						onBack={returnToSourceModePicker}
						onCancel={cancelAddSource}
						onApply={applyGenreSources}
					/>
				) : visibleAddSourceSession.modeId === DECADE_SOURCE_MODE_ID ? (
					<DecadeSourceFlow
						project={state.project}
						folder={addSourceFolder}
						previewProvider={decadePreviewProviderRef.current}
						onBack={returnToSourceModePicker}
						onCancel={cancelAddSource}
						onApply={applyDecadeSources}
					/>
				) : (
					<AddSourceDialog
						provider={sourceProviderRef.current}
						folderName={addSourceFolder?.editable?.title ?? "selected folder"}
						onBack={returnToSourceModePicker}
						onCancel={cancelAddSource}
						onApply={applyAddSource}
					/>
				)
			) : null}
			{sourceEdit ? (
				<SourceEditorDialog
					provider={sourceProviderRef.current}
					peopleProvider={peopleProviderRef.current}
					networkPreviewProvider={networkPreviewProviderRef.current}
					networkCatalogueProvider={networkCatalogueProviderRef.current}
					networkCountProvider={networkCountProviderRef.current}
					studioCatalogueProvider={studioCatalogueProviderRef.current}
					studioCountProvider={studioCountProviderRef.current}
					studioPreviewProvider={studioPreviewProviderRef.current}
					streamingCatalogueProvider={streamingCatalogueProviderRef.current}
					streamingPreviewProvider={streamingPreviewProviderRef.current}
					genrePreviewProvider={genrePreviewProviderRef.current}
					decadePreviewProvider={decadePreviewProviderRef.current}
					session={sourceEdit.session}
					initialDraft={sourceEdit.draft}
					onCancel={cancelSourceEdit}
					onSave={applySourceEdit}
				/>
			) : null}
		</main>
	);
}
