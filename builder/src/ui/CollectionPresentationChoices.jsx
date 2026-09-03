import { normalizeHierarchyShowAllTab } from "../source-add/hierarchy-presentation.js";
import { PresentationSwitch } from "./PresentationControls.jsx";

function isSelected(value, canonicalValue) {
	return typeof value === "string" && value.toUpperCase() === canonicalValue;
}

export function CollectionPresentationChoices({ selectedId, name, onChange }) {
	const tabsSelected = isSelected(selectedId, "TABBED_GRID");
	const rowsSelected = isSelected(selectedId, "ROWS");
	return (
		<div className="editor-choice-grid">
			<label className={`editor-choice editor-layout-choice${tabsSelected ? " is-selected" : ""}`}>
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
					<strong>Tabs (recommended)</strong>
					<small>Switch between sources using tabs. An optional All tab combines them.</small>
					<span className="source-layout-preview source-layout-preview-tabs" data-layout-preview="tabs" aria-hidden="true">
						<span className="source-layout-preview-tab-bar">
							<span className="is-selected">All</span>
							<span>Source 1</span>
							<span>Source 2</span>
						</span>
						<span className="source-layout-preview-poster-grid">
							<span /><span /><span /><span /><span />
						</span>
					</span>
				</span>
			</label>
			<label className={`editor-choice editor-layout-choice${rowsSelected ? " is-selected" : ""}`}>
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
					<small>Show each source as its own horizontal content row.</small>
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
		</div>
	);
}

export function HierarchyCollectionPresentationControls({
	selectedId,
	name,
	showAllTab,
	onPresentationChange,
	showAllLabel = "Show All tab",
	showAllDescription,
	showAllDescriptionId,
	showAllControlName,
}) {
	const tabsSelected = isSelected(selectedId, "TABBED_GRID");
	return (
		<div className="hierarchy-collection-presentation-controls" data-hierarchy-collection-presentation="true">
			<CollectionPresentationChoices
				selectedId={selectedId}
				name={name}
				onChange={(viewMode) => onPresentationChange({ viewMode, showAllTab: normalizeHierarchyShowAllTab(viewMode, showAllTab) })}
			/>
			{tabsSelected ? <div className="editor-switch-field hierarchy-show-all-control">
				<PresentationSwitch
					label={showAllLabel}
					description={showAllDescription}
					descriptionId={showAllDescriptionId}
					controlName={showAllControlName}
					checked={showAllTab}
					onChange={(nextShowAllTab) => onPresentationChange({ viewMode: "TABBED_GRID", showAllTab: nextShowAllTab })}
				/>
			</div> : null}
		</div>
	);
}
