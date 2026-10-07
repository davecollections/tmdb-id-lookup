import { normalizeHierarchyShowAllTab } from "../source-add/hierarchy-presentation.js";
import { PresentationSwitch } from "./PresentationControls.jsx";

export const ALL_TAB_DESCRIPTION = "Adds an All tab to folders with two or more sources.";
export const FOLLOW_LAYOUT_ALL_TAB_DESCRIPTION = "Used when your Nuvio Home layout is Grid View. Adds an All tab to folders with two or more sources.";

function isSelected(value, canonicalValue) {
	return typeof value === "string" && value.toUpperCase() === canonicalValue;
}

export function collectionShowAllDescription(viewMode, tabbedDescription = ALL_TAB_DESCRIPTION) {
	if (isSelected(viewMode, "FOLLOW_LAYOUT")) return FOLLOW_LAYOUT_ALL_TAB_DESCRIPTION;
	if (isSelected(viewMode, "TABBED_GRID")) return tabbedDescription;
	if (isSelected(viewMode, "ROWS")) return "Rows do not show an All tab. This preference is saved for layouts that use tabs.";
	return "Used when this collection is shown with tabs. Adds an All tab to folders with two or more sources.";
}

export function CollectionPresentationChoices({ selectedId, name, onChange }) {
	const tabsSelected = isSelected(selectedId, "TABBED_GRID");
	const rowsSelected = isSelected(selectedId, "ROWS");
	const followSelected = isSelected(selectedId, "FOLLOW_LAYOUT");
	return (
		<div className="editor-choice-grid editor-layout-choice-grid">
			<label className={`editor-choice editor-layout-choice${tabsSelected ? " is-selected" : ""}`} data-selection-mode="single">
				<input
					className="visually-hidden choice-card-input"
					type="radio"
					name={name}
					value="TABBED_GRID"
					data-editor-choice="tabs"
					checked={tabsSelected}
					onChange={() => onChange("TABBED_GRID")}
				/>
				<span className="editor-layout-choice-content">
					<strong>Tabbed Grid</strong>
					<small>Switch between sources with tabs and browse titles in a grid.</small>
					<span className="source-layout-preview source-layout-preview-tabs" data-layout-preview="tabs" aria-hidden="true">
						<span className="source-layout-preview-tab-bar">
							<span className="is-selected">All</span>
							<span>Source 1</span>
							<span>Source 2</span>
						</span>
						<span className="source-layout-preview-poster-grid">
							<span /><span /><span /><span /><span />
							<span /><span /><span /><span /><span />
						</span>
					</span>
				</span>
			</label>
			<label className={`editor-choice editor-layout-choice${rowsSelected ? " is-selected" : ""}`} data-selection-mode="single">
				<input
					className="visually-hidden choice-card-input"
					type="radio"
					name={name}
					value="ROWS"
					data-editor-choice="rows"
					checked={rowsSelected}
					onChange={() => onChange("ROWS")}
				/>
				<span className="editor-layout-choice-content">
					<strong>Rows</strong>
					<small>Show each source as its own horizontal row.</small>
					<span className="source-layout-preview source-layout-preview-rows" data-layout-preview="rows" aria-hidden="true">
						<span className="source-layout-preview-row">
							<span className="source-layout-preview-row-label">Source 1</span>
							<span className="source-layout-preview-poster-strip"><span /><span /><span /><span /></span>
						</span>
						<span className="source-layout-preview-row">
							<span className="source-layout-preview-row-label">Source 2</span>
							<span className="source-layout-preview-poster-strip"><span /><span /><span /><span /></span>
						</span>
					</span>
				</span>
			</label>
			<label className={`editor-choice editor-layout-choice${followSelected ? " is-selected" : ""}`} data-selection-mode="single">
				<input
					className="visually-hidden choice-card-input"
					type="radio"
					name={name}
					value="FOLLOW_LAYOUT"
					data-editor-choice="follow-home-layout"
					checked={followSelected}
					onChange={() => onChange("FOLLOW_LAYOUT")}
				/>
				<span className="editor-layout-choice-content">
					<strong>Follow Home Layout</strong>
					<small>Matches the layout used on your Nuvio Home screen.</small>
					<span className="source-layout-preview source-layout-preview-follow" data-layout-preview="follow-home-layout" aria-hidden="true">
						<span className="source-layout-preview-home">Home</span>
						<span className="source-layout-preview-variants">
							<span className="source-layout-mini source-layout-mini-modern"><span /><span /><span /><span /></span>
							<span className="source-layout-mini source-layout-mini-grid"><span /><span /><span /><span /><span /><span /></span>
							<span className="source-layout-mini source-layout-mini-classic"><span /><span /><span /><span /><span /><span /><span /><span /><span /></span>
						</span>
					</span>
				</span>
			</label>
		</div>
	);
}

export function HierarchyCollectionPresentationControls({
	selectedId,
	name,
	showAllTab,
	onPresentationChange,
	showAllLabel = "Show All tab",
	showAllDescription = ALL_TAB_DESCRIPTION,
	showAllDescriptionId,
	showAllControlName,
}) {
	const tabsSelected = isSelected(selectedId, "TABBED_GRID");
	const followSelected = isSelected(selectedId, "FOLLOW_LAYOUT");
	return (
		<div className="hierarchy-collection-presentation-controls" data-hierarchy-collection-presentation="true">
			<CollectionPresentationChoices
				selectedId={selectedId}
				name={name}
				onChange={(viewMode) => onPresentationChange({ viewMode, showAllTab: normalizeHierarchyShowAllTab(viewMode, showAllTab) })}
			/>
			{tabsSelected || followSelected ? <div className="editor-switch-field hierarchy-show-all-control">
				<PresentationSwitch
					label={showAllLabel}
					description={collectionShowAllDescription(selectedId, showAllDescription)}
					descriptionId={showAllDescriptionId}
					controlName={showAllControlName}
					checked={showAllTab}
					onChange={(nextShowAllTab) => onPresentationChange({ viewMode: followSelected ? "FOLLOW_LAYOUT" : "TABBED_GRID", showAllTab: nextShowAllTab })}
				/>
			</div> : null}
		</div>
	);
}
