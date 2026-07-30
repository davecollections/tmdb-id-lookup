import { useEffect, useRef } from "react";
import {
	isValidNuvioTitle,
	isValidVisibleNuvioTitle,
} from "../nuvio/titles.js";
import {
	focusFirstDialogControl,
	handleDialogKeyDown,
	initializeTitleInput,
} from "./modal-focus.js";

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
				<div className="editor-choice-grid">
					<label className={`editor-choice editor-layout-choice${tabsSelected ? " is-selected" : ""}`}>
						<input
							type="radio"
							name={`${prefix}-layout`}
							value="TABBED_GRID"
							data-editor-choice="tabs"
							checked={tabsSelected}
							onChange={() => onChange("viewMode", "TABBED_GRID")}
						/>
						<span className="editor-layout-choice-content">
							<strong>Tabs (recommended)</strong>
							<small>Switch between sources using tabs. An optional All tab combines them.</small>
							<span
								className="source-layout-preview source-layout-preview-tabs"
								data-layout-preview="tabs"
								aria-hidden="true"
							>
								<span className="source-layout-preview-tab-bar">
									<span className="is-selected">All</span>
									<span>Source 1</span>
									<span>Source 2</span>
								</span>
								<span className="source-layout-preview-poster-grid">
									<span />
									<span />
									<span />
									<span />
									<span />
								</span>
							</span>
						</span>
					</label>
					<label className={`editor-choice editor-layout-choice${rowsSelected ? " is-selected" : ""}`}>
						<input
							type="radio"
							name={`${prefix}-layout`}
							value="ROWS"
							data-editor-choice="rows"
							checked={rowsSelected}
							onChange={() => onChange("viewMode", "ROWS")}
						/>
						<span className="editor-layout-choice-content">
							<strong>Rows</strong>
							<small>Show each source as its own horizontal content row.</small>
							<span
								className="source-layout-preview source-layout-preview-rows"
								data-layout-preview="rows"
								aria-hidden="true"
							>
								<span className="source-layout-preview-row">
									<span className="source-layout-preview-row-label">Source 1</span>
									<span className="source-layout-preview-poster-strip">
										<span />
										<span />
										<span />
										<span />
									</span>
								</span>
								<span className="source-layout-preview-row">
									<span className="source-layout-preview-row-label">Source 2</span>
									<span className="source-layout-preview-poster-strip">
										<span />
										<span />
										<span />
										<span />
									</span>
								</span>
							</span>
						</span>
					</label>
				</div>
				<ChoiceStatus
					original={draft.original.viewMode}
					kind="layout"
					replacementPending={layoutReplacementPending}
					statusId={`${prefix}-layout-status`}
				/>
			</fieldset>

			<div className="editor-switch-field" data-editor-field="showAllTab">
				<label className="editor-switch">
					<span>
						<strong>Include an All tab when using Tabs</strong>
						<small id={`${prefix}-all-tab-help`}>
							{tabsSelected
								? "For each folder with two or more sources, adds an All tab that combines its sources."
								: "Rows do not show tabs. This preference will be used if the collection is later changed to Tabs."}
						</small>
					</span>
					<input
						type="checkbox"
						role="switch"
						data-editor-control="showAllTab"
						checked={draft.values.showAllTab}
						aria-describedby={allTabDescriptionIds}
						onChange={(event) => onChange("showAllTab", event.target.checked)}
					/>
					<span className="editor-switch-control" aria-hidden="true" />
				</label>
				<BooleanStatus
					original={draft.original.showAllTab}
					label="All tab"
					replacementPending={allTabReplacementPending}
					statusId={`${prefix}-all-tab-status`}
				/>
			</div>

			<div className="editor-switch-field" data-editor-field="pinToTop">
				<label className="editor-switch">
					<span>
						<strong>Pin to top</strong>
						<small id={`${prefix}-pin-help`}>
							Pinned collections appear before unpinned collections. In Builder exports, pinned collections keep their relative order from the collection list.
						</small>
					</span>
					<input
						type="checkbox"
						role="switch"
						data-editor-control="pinToTop"
						checked={draft.values.pinToTop}
						aria-describedby={pinDescriptionIds}
						onChange={(event) => onChange("pinToTop", event.target.checked)}
					/>
					<span className="editor-switch-control" aria-hidden="true" />
				</label>
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

function FolderPresentationFields({ draft, prefix, onChange }) {
	const posterSelected = isSelected(draft.values.tileShape, "POSTER");
	const landscapeSelected = isSelected(draft.values.tileShape, "LANDSCAPE");
	const shapeReplacementPending = draft.touched.tileShape && (posterSelected || landscapeSelected);

	return (
		<fieldset
			className="editor-field editor-choice-field"
			data-editor-field="tileShape"
			aria-describedby={`${prefix}-shape-help${
				draft.original.tileShape.supported || shapeReplacementPending
					? ""
					: ` ${prefix}-shape-status`
			}`}
		>
			<legend>Tile shape</legend>
			<p className="editor-field-help" id={`${prefix}-shape-help`}>
				Choose the shape of this folder card in Nuvio.
			</p>
			<div
				className="editor-choice-grid editor-shape-choice-grid"
				data-control-presentation="visual-cards"
			>
				<label
					className={`editor-choice editor-shape-choice${posterSelected ? " is-selected" : ""}`}
					htmlFor={`${prefix}-poster-shape`}
					onClick={(event) => {
						if (event.target.closest("input")) return;
						onChange("tileShape", "POSTER");
					}}
				>
					<input
						className="visually-hidden"
						id={`${prefix}-poster-shape`}
						type="radio"
						name={`${prefix}-shape`}
						value="POSTER"
						data-editor-choice="poster"
						checked={posterSelected}
						onChange={() => onChange("tileShape", "POSTER")}
					/>
					<span className="shape-preview is-poster" aria-hidden="true" />
					<span>
						<strong>Poster</strong>
						<small>Tall artwork for poster-style folders.</small>
					</span>
					<span className="editor-choice-check" aria-hidden="true">{posterSelected ? "✓" : ""}</span>
				</label>
				<label
					className={`editor-choice editor-shape-choice${landscapeSelected ? " is-selected" : ""}`}
					htmlFor={`${prefix}-landscape-shape`}
					onClick={(event) => {
						if (event.target.closest("input")) return;
						onChange("tileShape", "LANDSCAPE");
					}}
				>
					<input
						className="visually-hidden"
						id={`${prefix}-landscape-shape`}
						type="radio"
						name={`${prefix}-shape`}
						value="LANDSCAPE"
						data-editor-choice="landscape"
						checked={landscapeSelected}
						onChange={() => onChange("tileShape", "LANDSCAPE")}
					/>
					<span className="shape-preview is-landscape" aria-hidden="true" />
					<span>
						<strong>Landscape</strong>
						<small>Wide artwork for horizontal folders.</small>
					</span>
					<span className="editor-choice-check" aria-hidden="true">{landscapeSelected ? "✓" : ""}</span>
				</label>
			</div>
			<ChoiceStatus
				original={draft.original.tileShape}
				kind="shape"
				replacementPending={shapeReplacementPending}
				statusId={`${prefix}-shape-status`}
			/>
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
	const showEverywhere = draft.values.folderTitleVisibility === "SHOW_EVERYWHERE";
	const hideHomeScreen = draft.values.folderTitleVisibility === "HIDE_HOME_SCREEN";
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
			<legend>Folder title visibility</legend>
			<div
				className="editor-compact-radio-grid"
				data-control-presentation="compact-radios"
			>
				<label className={`editor-compact-radio${showEverywhere ? " is-selected" : ""}`}>
					<input
						type="radio"
						name={`${prefix}-title-visibility`}
						value="SHOW_EVERYWHERE"
						data-editor-choice="show-everywhere"
						checked={showEverywhere}
						onChange={() => onChange("folderTitleVisibility", "SHOW_EVERYWHERE")}
					/>
					<span>
						<strong>Show everywhere</strong>
						<small>Home screen and open folder</small>
					</span>
				</label>
				<label className={`editor-compact-radio${hideHomeScreen ? " is-selected" : ""}`}>
					<input
						type="radio"
						name={`${prefix}-title-visibility`}
						value="HIDE_HOME_SCREEN"
						data-editor-choice="hide-home-screen"
						checked={hideHomeScreen}
						onChange={() => onChange("folderTitleVisibility", "HIDE_HOME_SCREEN")}
					/>
					<span>
						<strong>Hide on home screen only</strong>
						<small>Still shown inside the folder</small>
					</span>
				</label>
				<label className={`editor-compact-radio${hideEverywhere ? " is-selected" : ""}`}>
					<input
						type="radio"
						name={`${prefix}-title-visibility`}
						value="HIDE_EVERYWHERE"
						data-editor-choice="hide-everywhere"
						checked={hideEverywhere}
						onChange={() => onChange("folderTitleVisibility", "HIDE_EVERYWHERE")}
					/>
					<span>
						<strong>Hide everywhere</strong>
						<small>Uses an invisible title</small>
					</span>
				</label>
			</div>
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
			<label className="editor-switch">
				<span>
					<strong>Hide collection title in Nuvio</strong>
					<small id={`${prefix}-hidden-title-help`}>
						Uses an invisible character to hide the collection title in Nuvio.
					</small>
				</span>
				<input
					type="checkbox"
					role="switch"
					data-editor-control="hideNuvioTitle"
					checked={draft.values.hideNuvioTitle}
					aria-describedby={`${prefix}-hidden-title-help`}
					onChange={(event) => onChange("hideNuvioTitle", event.target.checked)}
				/>
				<span className="editor-switch-control" aria-hidden="true" />
			</label>
		</div>
	);
}

function RenameFolderInvisibleTitleField({ draft, prefix, onChange }) {
	const hiddenEverywhere = draft.values.folderTitleVisibility === "HIDE_EVERYWHERE";

	return (
		<div className="editor-switch-field" data-editor-field="folderTitleVisibility">
			<label className="editor-switch">
				<span>
					<strong>Hide folder title everywhere in Nuvio</strong>
					<small id={`${prefix}-hidden-title-help`}>
						Uses an invisible character to hide the folder title on the home screen and when the folder is opened.
					</small>
				</span>
				<input
					type="checkbox"
					role="switch"
					data-editor-control="hideFolderTitleEverywhere"
					checked={hiddenEverywhere}
					aria-describedby={`${prefix}-hidden-title-help`}
					onChange={(event) => onChange(
						"folderTitleVisibility",
						event.target.checked
							? "HIDE_EVERYWHERE"
							: draft.renameVisibleFolderTitleVisibility,
					)}
				/>
				<span className="editor-switch-control" aria-hidden="true" />
			</label>
		</div>
	);
}

export function NodeEditor({
	draft,
	diagnostics,
	titleInputRef,
	mode = "settings",
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
				value={titleHiddenEverywhere ? "" : draft.values.title}
				data-editor-field="title"
				disabled={titleHiddenEverywhere}
				aria-invalid={titleError ? "true" : undefined}
				aria-describedby={describedBy(titleError)}
				onChange={(event) => onChange("title", event.target.value)}
			/>
			<p className="editor-field-help" id={`${prefix}-title-help`}>
				{draft.nodeType === "folder" && draft.values.folderTitleVisibility === "HIDE_EVERYWHERE"
					? "The folder title is intentionally invisible everywhere in Nuvio. Choose a visible option below to enter a visible title."
					: draft.nodeType === "collection" && draft.values.hideNuvioTitle
					? `The ${noun} title is intentionally invisible in Nuvio. Turn off the setting below to enter a visible title.`
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
							{titleField}
							<InvisibleCollectionTitleField draft={draft} prefix={prefix} onChange={onChange} />
							<CollectionPresentationFields draft={draft} prefix={prefix} onChange={onChange} />
						</>
					) : (
						<>
							<SettingsSection prefix={prefix} slug="basic-details" title="Basic details">
								{titleField}
							</SettingsSection>
							<SettingsSection prefix={prefix} slug="display" title="Display">
								<FolderTitleVisibilityField draft={draft} prefix={prefix} onChange={onChange} />
								<FolderPresentationFields draft={draft} prefix={prefix} onChange={onChange} />
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
