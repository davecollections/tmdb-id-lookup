import { useEffect, useRef } from "react";
import {
	isValidNuvioTitle,
	isValidVisibleNuvioTitle,
} from "../nuvio/titles.js";
import {
	focusFirstDialogControl,
	handleDialogKeyDown,
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
	const focusGlowReplacementPending = (
		draft.touched.focusGlowEnabled
		&& typeof draft.values.focusGlowEnabled === "boolean"
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
	const focusGlowDescriptionIds = [
		`${prefix}-focus-glow-help`,
		!draft.original.focusGlowEnabled.supported && !focusGlowReplacementPending
			? `${prefix}-focus-glow-status`
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
				<legend>Collection layout</legend>
				<p className="editor-field-help" id={`${prefix}-layout-help`}>
					Choose how each folder displays its sources in Nuvio.
				</p>
				<div className="editor-choice-grid">
					<label className={`editor-choice${tabsSelected ? " is-selected" : ""}`}>
						<input
							type="radio"
							name={`${prefix}-layout`}
							value="TABBED_GRID"
							data-editor-choice="tabs"
							checked={tabsSelected}
							onChange={() => onChange("viewMode", "TABBED_GRID")}
						/>
						<span>
							<strong>Tabs</strong>
							<small>Each source in a folder appears as a tab.</small>
						</span>
					</label>
					<label className={`editor-choice${rowsSelected ? " is-selected" : ""}`}>
						<input
							type="radio"
							name={`${prefix}-layout`}
							value="ROWS"
							data-editor-choice="rows"
							checked={rowsSelected}
							onChange={() => onChange("viewMode", "ROWS")}
						/>
						<span>
							<strong>Rows</strong>
							<small>Each source in a folder appears as a streaming-style row.</small>
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
						<strong>Include an All tab</strong>
						<small id={`${prefix}-all-tab-help`}>
							{tabsSelected
								? "For each folder with two or more sources, adds an All tab that combines its sources."
								: "Available only with Tabs. The preference stays unchanged while Rows is selected."}
						</small>
					</span>
					<input
						type="checkbox"
						role="switch"
						data-editor-control="showAllTab"
						checked={tabsSelected && draft.values.showAllTab}
						disabled={!tabsSelected}
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
						<small id={`${prefix}-pin-help`}>Keeps this collection above ordinary collection ordering in Nuvio.</small>
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

			<div className="editor-switch-field" data-editor-field="focusGlowEnabled">
				<label className="editor-switch">
					<span>
						<strong>Enable focus glow</strong>
						<small id={`${prefix}-focus-glow-help`}>
							Shows Nuvio’s focus-glow effect for this collection.
						</small>
					</span>
					<input
						type="checkbox"
						role="switch"
						data-editor-control="focusGlowEnabled"
						checked={draft.values.focusGlowEnabled}
						aria-describedby={focusGlowDescriptionIds}
						onChange={(event) => onChange("focusGlowEnabled", event.target.checked)}
					/>
					<span className="editor-switch-control" aria-hidden="true" />
				</label>
				<BooleanStatus
					original={draft.original.focusGlowEnabled}
					label="focus glow"
					replacementPending={focusGlowReplacementPending}
					statusId={`${prefix}-focus-glow-status`}
				/>
			</div>
		</>
	);
}

function FolderPresentationFields({ draft, prefix, onChange }) {
	const hiddenEverywhere = draft.values.hideFolderTitleEverywhere;
	const posterSelected = isSelected(draft.values.tileShape, "POSTER");
	const landscapeSelected = isSelected(draft.values.tileShape, "LANDSCAPE");
	const shapeReplacementPending = draft.touched.tileShape && (posterSelected || landscapeSelected);
	const titleVisibilityReplacementPending = (
		draft.touched.showFolderTitle
		&& typeof draft.values.showFolderTitle === "boolean"
	);
	const titleDescriptionIds = [
		`${prefix}-show-title-help`,
		hiddenEverywhere ? `${prefix}-show-title-override` : null,
		!draft.original.hideTitle.supported && !titleVisibilityReplacementPending
			? `${prefix}-show-title-status`
			: null,
	].filter(Boolean).join(" ");

	return (
		<>
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
				<div className="editor-choice-grid">
					<label className={`editor-choice editor-shape-choice${posterSelected ? " is-selected" : ""}`}>
						<input
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
					</label>
					<label className={`editor-choice editor-shape-choice${landscapeSelected ? " is-selected" : ""}`}>
						<input
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
					</label>
				</div>
				<ChoiceStatus
					original={draft.original.tileShape}
					kind="shape"
					replacementPending={shapeReplacementPending}
					statusId={`${prefix}-shape-status`}
				/>
			</fieldset>

			<div className="editor-switch-field" data-editor-field="showFolderTitle">
				<label className="editor-switch">
					<span>
						<strong>Show folder title on home screen</strong>
						<small id={`${prefix}-show-title-help`}>
							Shows the title beneath the folder card on Nuvio’s home screen.
						</small>
						{hiddenEverywhere ? (
							<small className="editor-switch-note" id={`${prefix}-show-title-override`}>
								Hide folder title everywhere overrides this setting. Its prior preference returns if hiding everywhere is turned off.
							</small>
						) : null}
					</span>
					<input
						type="checkbox"
						role="switch"
						data-editor-control="showFolderTitle"
						checked={!hiddenEverywhere && draft.values.showFolderTitle}
						disabled={hiddenEverywhere}
						aria-describedby={titleDescriptionIds}
						onChange={(event) => onChange("showFolderTitle", event.target.checked)}
					/>
					<span className="editor-switch-control" aria-hidden="true" />
				</label>
				<BooleanStatus
					original={draft.original.hideTitle}
					label="folder title"
					replacementPending={titleVisibilityReplacementPending}
					statusId={`${prefix}-show-title-status`}
				/>
			</div>
		</>
	);
}

function InvisibleFolderTitleField({ draft, prefix, onChange }) {
	return (
		<div className="editor-switch-field" data-editor-field="hideFolderTitleEverywhere">
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
					checked={draft.values.hideFolderTitleEverywhere}
					aria-describedby={`${prefix}-hidden-title-help`}
					onChange={(event) => onChange("hideFolderTitleEverywhere", event.target.checked)}
				/>
				<span className="editor-switch-control" aria-hidden="true" />
			</label>
		</div>
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

export function NodeEditor({
	draft,
	diagnostics,
	titleInputRef,
	onChange,
	onSubmit,
	onCancel,
}) {
	const noun = draft.nodeType === "folder" ? "folder" : "collection";
	const context = noun === "folder" ? "Folder settings" : "Collection settings";
	const prefix = `node-editor-${noun}`;
	const titleError = diagnostics.find((entry) => entry.path === "$ui.editor.title") ?? null;
	const dialogRef = useRef(null);
	const titleHiddenEverywhere = draft.nodeType === "collection"
		? draft.values.hideNuvioTitle
		: draft.values.hideFolderTitleEverywhere;
	const titleReplacementPending = draft.touched.title && (
		draft.nodeType === "collection" && draft.values.hideNuvioTitle
			? isValidNuvioTitle(draft.values.title)
			: isValidVisibleNuvioTitle(draft.values.title)
	) || (
		draft.nodeType === "folder"
		&& draft.values.hideFolderTitleEverywhere
		&& (
			draft.original.title.hidden
			|| draft.canonicalizeFolderInvisibleTitle
		)
	);

	useEffect(() => {
		if (titleInputRef.current && !titleInputRef.current.disabled) {
			titleInputRef.current.focus();
		} else {
			focusFirstDialogControl(dialogRef.current);
		}
	}, [draft.internalId, titleInputRef]);

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
				className="node-editor"
				data-node-editor={noun}
				data-settings-modal="true"
				role="dialog"
				aria-modal="true"
				aria-labelledby={`${prefix}-title`}
				tabIndex={-1}
				onKeyDown={(event) => handleDialogKeyDown(event, dialogRef.current, onCancel)}
			>
				<div className="node-editor-heading">
					<div>
						<p className="panel-kicker">Presentation settings</p>
						<h2 id={`${prefix}-title`}>{context}</h2>
					</div>
					<p>Update the title and presentation for this {noun}.</p>
				</div>

				<form className="node-editor-form" onSubmit={onSubmit} noValidate>
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
							{draft.nodeType === "folder" && draft.values.hideFolderTitleEverywhere
								? "The folder title is intentionally invisible everywhere in Nuvio. Turn off the setting below to enter a visible title."
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

					{draft.nodeType === "collection" ? (
						<InvisibleCollectionTitleField draft={draft} prefix={prefix} onChange={onChange} />
					) : (
						<InvisibleFolderTitleField draft={draft} prefix={prefix} onChange={onChange} />
					)}

					{draft.nodeType === "collection" ? (
						<CollectionPresentationFields draft={draft} prefix={prefix} onChange={onChange} />
					) : (
						<FolderPresentationFields draft={draft} prefix={prefix} onChange={onChange} />
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
