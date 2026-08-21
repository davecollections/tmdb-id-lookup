import {
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import {
	DECADE_PRESETS,
	DECADES_COLLECTION_LAYOUTS,
	DECADES_MEDIA_MODES,
	DECADES_PLACEMENT_STATUSES,
	DECADES_SOURCE_GROUPINGS,
	DECADES_SORT_OPTIONS,
	GENRE_CONCEPTS,
} from "../source-add/index.js";
import { isInvisibleNuvioTitle } from "../nuvio/titles.js";
import {
	lockAddSourceDocumentBody,
	observeAddSourceViewport,
	resolveAddSourceViewportStyle,
} from "./add-source-modal-lifecycle.js";
import { creationOptionById, creationOptionSupportsScope, creationOptionsForScope, CREATION_OPTION_IDS } from "./creation-options.js";
import { HierarchyCollectionPresentationControls } from "./CollectionPresentationChoices.jsx";
import {
	DecadesAdvancedHelpSubview,
	DecadesAdvancedOptions,
	DecadesOrdinaryExclusionSubview,
} from "./DecadesAdvancedOptions.jsx";
import {
	buildDecadesCreationPlan,
	clearAllDecadePresets,
	createDecadesCreationState,
	DECADES_DISPLAY_ORDERS,
	decadesGenreConfigurationValid,
	decadesGenreExclusionsForContext,
	decadesGenreSelectionForContext,
	decadesOrdinaryExclusionsForContext,
	DECADES_CREATION_STEPS,
	prepareDecadesReview,
	selectedDecadesDisplayOrderId,
	selectAllDecadePresets,
	setDecadesGenresForContext,
	setDecadesGenreExclusionsForContext,
	setDecadesOrdinaryExclusionsForContext,
	toggleDecadePreset,
	toggleDecadesGenre,
	updateDecadesDisplayOrder,
	updateDecadesCreationMedia,
} from "./decades-creation-state.js";
import { GenreExclusionSubview } from "./GenreAdvancedOptions.jsx";
import { GenreCatalogueList, GenreContextCatalogueSubview, GenreSelectionToolbar } from "./GenreCatalogueSelector.jsx";
import { focusElementWithoutScroll } from "./hierarchy-menu-placement.js";
import { handleDialogKeyDown } from "./modal-focus.js";
import {
	FolderShapeChoices,
	PresentationSwitch,
	TitleOptions,
} from "./PresentationControls.jsx";
import { SemanticSortChoices } from "./SemanticSortChoices.jsx";
import { SourceElsewhereNotice } from "./SourceElsewhereNotice.jsx";
import { RemovableSelectionSummary } from "./RemovableSelectionSummary.jsx";
import { PeopleSourceFlow } from "./PeopleSourceFlow.jsx";
import { CreationHeader } from "./CreationHeader.jsx";
import { ChoiceCards } from "./ChoiceCards.jsx";
import { FranchiseSourceFlow } from "./FranchiseSourceFlow.jsx";
import { GenreHierarchyFlow } from "./GenreHierarchyFlow.jsx";
import { NetworkHierarchyFlow } from "./NetworkHierarchyFlow.jsx";
import { StudioHierarchyFlow } from "./StudioHierarchyFlow.jsx";

const DECADES_HIDDEN_COLLECTION_TITLES_HELP_ID = "decades-hidden-collection-titles-help";
const usePrePaintLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const statusLabels = Object.freeze({
	[DECADES_PLACEMENT_STATUSES.READY]: "Ready to create",
	[DECADES_PLACEMENT_STATUSES.ALREADY_IN_FOLDER]: "Already in this folder",
	[DECADES_PLACEMENT_STATUSES.ALREADY_IN_COLLECTION]: "Already in this collection",
	[DECADES_PLACEMENT_STATUSES.PARTLY_IN_COLLECTION]: "Partly in this collection",
	[DECADES_PLACEMENT_STATUSES.EXISTS_ELSEWHERE]: "Exists elsewhere",
});

function scopeLabel(scope) {
	return scope === "new-folder" ? "New Folder" : "New Collection";
}

function CreationLauncher({ firstOptionRef, onSelect, scope }) {
	const options = creationOptionsForScope(scope);
	return (
		<ul className="add-source-scroll creation-option-list">
			{options.map((option, index) => (
				<li key={option.id}>
					<button
						ref={index === 0 ? firstOptionRef : null}
						className="creation-option-card"
						type="button"
						data-creation-option={option.id}
						onClick={() => onSelect(option.id)}
					>
						<span><strong>{option.label}</strong><small>{option.description}</small></span>
						<span className="creation-option-arrow" aria-hidden="true">→</span>
					</button>
				</li>
			))}
		</ul>
	);
}

function selectedDecadeLabels(selectedDecadeIds) {
	return DECADE_PRESETS
		.filter((preset) => selectedDecadeIds.includes(preset.id))
		.map((preset) => preset.label);
}

function SelectedDecadesSummary({ selectedDecadeIds, onRemove = null }) {
	const presets = DECADE_PRESETS.filter((preset) => selectedDecadeIds.includes(preset.id));
	const labels = presets.map((preset) => preset.label);
	if (onRemove) {
		return (
			<section className="decades-selected-editor" aria-labelledby="decades-selected-title">
				<div className="decades-selected-heading"><strong id="decades-selected-title">Selected Decades</strong><small>Use Back to add another Decade.</small></div>
				{presets.length > 0 ? <RemovableSelectionSummary items={presets.map((preset) => ({ id: preset.id, label: preset.label, detail: preset.startYear === null ? "Everything through 1959" : `${preset.startYear}–${preset.endYear}` }))} onRemove={onRemove} ariaLabel="Selected Decades" disclosureLabel="View selected Decades" /> : <p className="decades-genre-validation" role="alert">Choose at least one Decade. Use Back to add a Decade.</p>}
			</section>
		);
	}
	if (labels.length === 0) return null;
	return (
		<div className="decades-selected-summary" aria-label="Selected Decades">
			<strong>Selected Decades</strong>
			{labels.length <= 4
				? <span>{labels.join(" · ")}</span>
				: <span>{labels.length} selected · {labels[0]} to {labels.at(-1)}</span>}
		</div>
	);
}

function DecadesSettingsDisclosure({ id, title, summary, children }) {
	return (
		<details className="decades-settings-disclosure" data-decades-settings={id}>
			<summary><span><strong>{title}</strong><small>{summary}</small></span></summary>
			<div className="decades-settings-content">{children}</div>
		</details>
	);
}

function collectionAppearanceSummary({ viewMode, showAllTab, pinToTop }) {
	const layout = typeof viewMode === "string" && viewMode.toUpperCase() === "ROWS" ? "Rows" : "Tabs";
	return `${layout}${layout === "Tabs" ? ` · All tab ${showAllTab ? "on" : "off"}` : ""} · ${pinToTop ? "pinned" : "not pinned"}`;
}

function folderAppearanceSummary({ folderTileShape }) {
	return folderTileShape === "LANDSCAPE" ? "Landscape" : "Poster";
}

function inheritedCollectionAppearanceSummary(presentation) {
	if (!presentation) return "Inherited from the selected collection";
	const normalizedLayout = typeof presentation.viewMode === "string" ? presentation.viewMode.toUpperCase() : "";
	const layout = normalizedLayout === "ROWS" ? "Rows" : normalizedLayout === "TABBED_GRID" ? "Tabs" : "Imported layout";
	const allTab = typeof presentation.showAllTab === "boolean" ? `All tab ${presentation.showAllTab ? "on" : "off"}` : "All tab inherited";
	const pin = typeof presentation.pinToTop === "boolean" ? (presentation.pinToTop ? "pinned" : "not pinned") : "pin inherited";
	return `${layout} · ${allTab} · title ${isInvisibleNuvioTitle(presentation.title) ? "hidden" : "visible"} · ${pin}`;
}

export function DecadePresetStep({ state, headingRef, onToggle, onSelectAll, onClearAll }) {
	return (
		<section className="decades-step" aria-labelledby="decades-preset-title">
			<div className="add-source-section-heading">
				<div><p className="panel-kicker">Step 1</p><h3 id="decades-preset-title" ref={headingRef} tabIndex={-1}>Choose decades</h3></div>
			</div>
			<p className="decades-step-guidance">Choose one or more presets.</p>
			<GenreSelectionToolbar selectionCount={state.selectedDecadeIds.length} totalCount={DECADE_PRESETS.length} onSelectAll={onSelectAll} onClearAll={onClearAll} />
			<div className="decades-preset-grid">
				{DECADE_PRESETS.map((preset) => {
					const selected = state.selectedDecadeIds.includes(preset.id);
					return (
						<button key={preset.id} type="button" data-decade-preset={preset.id} data-selected={selected ? "true" : undefined} onClick={() => onToggle(preset.id)}>
							<span><strong>{preset.label}</strong><small>{preset.startYear === null ? "Everything through 1959" : `${preset.startYear}–${preset.endYear}`}</small></span>
							<span aria-hidden="true">{selected ? "✓" : "+"}</span>
						</button>
					);
				})}
			</div>
		</section>
	);
}

function ContentChoices({ state, onChange }) {
	const selectedCount = Object.values(state.content).filter(Boolean).length;
	const options = [
		{ id: "wholeDecade", label: "Decade overview", description: "Add one source covering the complete Decade, such as All 2000s." },
		{ id: "individualYears", label: "Individual years", description: "Add one source for every included year." },
		{ id: "genreBreakdown", label: "Genre breakdown", description: "Add Genre sources to all selected Decades, or customise each Decade." },
	];
	return (
		<fieldset className="decades-choice-group">
			<legend>What should each decade include?</legend>
			<p>Select one or more ways to organise each Decade.</p>
			<div className="decades-content-grid">
				{options.map((option) => (
					<label key={option.id} data-selected={state.content[option.id] ? "true" : undefined}>
						<input
							type="checkbox"
							checked={state.content[option.id]}
							disabled={state.content[option.id] && selectedCount === 1}
							onChange={(event) => onChange(Object.freeze({ ...state.content, [option.id]: event.target.checked }))}
						/>
						<span><strong>{option.label}</strong><small>{option.description}</small></span>
					</label>
				))}
			</div>
		</fieldset>
	);
}

function StructurePreview({ mode, contextual = false }) {
	const mixed = mode === "mixed-collection";
	return (
		<span className="decades-structure-preview" data-structure-preview={mixed ? "mixed" : "separate"} aria-hidden="true">
			{contextual ? <span className="decades-preview-caption">Existing collection</span> : null}
			{mixed ? (
				<span className="decades-preview-collection"><span>Decades</span><span><i>M</i><i>S</i><i>M</i><i>S</i></span></span>
			) : (
				<><span className="decades-preview-collection"><span>Movie Decades</span><span><i>M</i><i>M</i><i>M</i><i>M</i></span></span><span className="decades-preview-collection"><span>TV Decades</span><span><i>S</i><i>S</i><i>S</i><i>S</i></span></span></>
			)}
		</span>
	);
}

function OrderingPreview({ kind, selectedId, selectedDecadeIds }) {
	if (kind === "decades") {
		const labels = selectedDecadeLabels(selectedDecadeIds);
		const ordered = selectedId === "newest-first" ? [...labels].reverse() : labels;
		return <span className="decades-order-preview" aria-hidden="true">{ordered.slice(0, 3).map((label) => <i key={label}>{label}</i>)}</span>;
	}
	if (kind === "years") {
		const years = selectedId === "newest-first" ? ["2009", "2008", "2007"] : ["2000", "2001", "2002"];
		return <span className="decades-order-preview" aria-hidden="true"><i>All 2000s</i>{years.map((year) => <i key={year}>{year}</i>)}</span>;
	}
	const entries = selectedId === "paired" ? ["M", "S", "M", "S"] : ["M", "M", "S", "S"];
	return <span className="decades-order-preview" aria-hidden="true">{entries.map((entry, index) => <i key={`${entry}-${index}`}>{entry}</i>)}</span>;
}

function DisplayOrderPreview({ decadeOrder, yearOrder, selectedDecadeIds, showDecadeOrder, showYearOrder }) {
	return (
		<span className="decades-display-order-preview" aria-hidden="true">
			{showDecadeOrder ? <span><small>Folders</small><OrderingPreview kind="decades" selectedId={decadeOrder} selectedDecadeIds={selectedDecadeIds} /></span> : null}
			{showYearOrder ? <span><small>Inside</small><OrderingPreview kind="years" selectedId={yearOrder} /></span> : null}
		</span>
	);
}

function hasMixedPhysicalFolder(state) {
	if (state.mediaMode !== "both") return false;
	if (state.scope === "new-collection" && state.layout !== "mixed-collection") return false;
	if (state.content.wholeDecade || state.content.individualYears) return true;
	return state.selectedDecadeIds.some((decadeId) => {
		const concepts = (state.genreNamesByDecade[decadeId] ?? []).map((name) => GENRE_CONCEPTS.find((entry) => entry.name === name)).filter(Boolean);
		return concepts.some((concept) => concept.movieId !== null) && concepts.some((concept) => concept.tvId !== null);
	});
}

function DecadesGenreChoices({ state, onStateChange, onOpenExclusions }) {
	const available = GENRE_CONCEPTS.filter((concept) => (
		state.mediaMode === "movies" ? concept.movieId !== null
			: state.mediaMode === "series" ? concept.tvId !== null
				: concept.movieId !== null || concept.tvId !== null
	));
	const contextId = state.genreContextId;
	const selection = decadesGenreSelectionForContext(state, contextId);
	return (
		<>
			<GenreSelectionToolbar
				selectionCount={selection.length}
				totalCount={available.length}
				onSelectAll={() => onStateChange(setDecadesGenresForContext(state, available.map((concept) => concept.name), contextId))}
				onClearAll={() => onStateChange(setDecadesGenresForContext(state, [], contextId))}
			/>
			<GenreCatalogueList concepts={available} selection={selection} onChoose={(genreName) => onStateChange(toggleDecadesGenre(state, genreName, contextId))} />
			<div className="genre-advanced-compact-actions">
				<div><strong>Genre source exclusions</strong><span>Optionally exclude Genres from the Genre sources selected above.</span></div>
				<button type="button" className="secondary-action" disabled={selection.length === 0} onClick={(event) => onOpenExclusions(event.currentTarget)}>Configure</button>
			</div>
		</>
	);
}

function DecadesGenreSummary({ state, onConfigure }) {
	const valid = decadesGenreConfigurationValid(state);
	const sharedCount = decadesGenreSelectionForContext(state, "all").length;
	const configuredCount = state.selectedDecadeIds.filter((decadeId) => (state.genreNamesByDecade[decadeId] ?? []).length > 0).length;
	const summary = valid
		? sharedCount > 0 ? `${sharedCount} selected on all Decades` : `Configured for ${configuredCount} Decades`
		: `Configured for ${configuredCount} of ${state.selectedDecadeIds.length} Decades`;
	return (
		<section className="decades-genre-summary" aria-labelledby="decades-genre-summary-title">
			<div className="genre-advanced-compact-actions">
				<div><strong id="decades-genre-summary-title">Genres</strong><span>{summary}</span></div>
				<button type="button" className="secondary-action" onClick={(event) => onConfigure(event.currentTarget)}>Configure</button>
			</div>
			{!valid ? <p className="decades-genre-validation" role="alert">Choose at least one Genre for every selected Decade before continuing.</p> : null}
		</section>
	);
}

export function DecadesGenreConfigurationSubview({ state, onStateChange, onOpenExclusions, onDone, focusRef }) {
	const valid = decadesGenreConfigurationValid(state);
	const missingLabels = state.selectedDecadeIds
		.filter((decadeId) => (state.genreNamesByDecade[decadeId] ?? []).length === 0)
		.map((decadeId) => DECADE_PRESETS.find((preset) => preset.id === decadeId)?.label ?? decadeId);
	const sharedCount = decadesGenreSelectionForContext(state, "all").length;
	const contexts = [
		{
			id: "all",
			label: "All selected Decades",
			summary: `${sharedCount} shared`,
		},
		...state.selectedDecadeIds.map((decadeId) => {
			const preset = DECADE_PRESETS.find((entry) => entry.id === decadeId);
			const count = state.genreNamesByDecade[decadeId]?.length ?? 0;
			return {
				id: decadeId,
				label: preset?.label ?? decadeId,
				summary: `${count} selected`,
			};
		}),
	];
	return (
		<GenreContextCatalogueSubview
			activeContextId={state.genreContextId}
			ariaDescribedBy={!valid ? "decades-genres-error" : undefined}
			ariaInvalid={!valid}
			backLabel="Back to Decades"
			className="decades-genre-subview"
			contexts={contexts}
			contextTitle="Genre contexts"
			detailGuidance="Choose Genres to include in the generated sources for this context."
			detailTitle={(context) => `Genres for ${context.label}`}
			emptyText="Then choose Genres to include in its generated sources."
			emptyTitle="Choose a context on the left"
			focusRef={focusRef}
			guidance="Use one shared Genre selection or customise individual Decades."
			kicker="Configure Decades"
			onContextChange={(genreContextId) => onStateChange(Object.freeze({ ...state, genreContextId }))}
			onDone={onDone}
			statusContent={!valid ? <p id="decades-genres-error" className="decades-genre-validation" role="alert">Choose at least one Genre for every selected Decade. Still needed: {missingLabels.join(", ")}.</p> : null}
			title="Configure Genres"
			titleId="decades-genre-configuration-title"
		>
			<DecadesGenreChoices state={state} onStateChange={onStateChange} onOpenExclusions={onOpenExclusions} />
		</GenreContextCatalogueSubview>
	);
}

function DecadesOrdering({ state, onStateChange }) {
	const showDecadeOrder = state.selectedDecadeIds.length > 1;
	const showYearOrder = state.content.individualYears;
	const showSourceGrouping = hasMixedPhysicalFolder(state);
	if (!showDecadeOrder && !showYearOrder && !showSourceGrouping) return null;
	const selectedDisplayOrderId = selectedDecadesDisplayOrderId(state);
	return (
		<section className="decades-ordering" aria-labelledby="decades-ordering-title">
			<h4 id="decades-ordering-title">Ordering</h4>
			{showDecadeOrder || showYearOrder ? <div className="decades-ordering-control"><ChoiceCards legend="Display order" name="decades-display-order" gridClassName="decades-display-order-choices" options={DECADES_DISPLAY_ORDERS.map((option) => ({ ...option, preview: <DisplayOrderPreview decadeOrder={option.decadeOrder} yearOrder={option.yearOrder} selectedDecadeIds={state.selectedDecadeIds} showDecadeOrder={showDecadeOrder} showYearOrder={showYearOrder} /> }))} selectedId={selectedDisplayOrderId} onChange={(displayOrderId) => onStateChange(updateDecadesDisplayOrder(state, displayOrderId))} /></div> : null}
			{showSourceGrouping ? <div className="decades-ordering-control"><ChoiceCards legend="Source grouping" helper="Controls how Movie and Series sources are arranged inside mixed-media Decade folders." name="decades-source-grouping" options={DECADES_SOURCE_GROUPINGS.map((option) => ({ ...option, preview: <OrderingPreview kind="sources" selectedId={option.id} /> }))} selectedId={state.sourceGrouping} onChange={(sourceGrouping) => onStateChange(Object.freeze({ ...state, sourceGrouping }))} /></div> : null}
		</section>
	);
}

function CollectionAppearance({ state, onStateChange }) {
	const showOverviewAllTabNote = state.content.wholeDecade && state.viewMode === "TABBED_GRID" && state.showAllTab;
	return (
		<section className="review-layout-options" data-review-layout="true" data-decades-settings="layout" aria-labelledby="decades-layout-title">
			<div className="review-presentation-heading"><h4 id="decades-layout-title">Layout</h4><span>{collectionAppearanceSummary(state)}</span></div>
			<fieldset className="editor-field editor-choice-field decades-presentation">
				<legend>How sources appear in each collection</legend>
				<p className="editor-field-help">Choose how each Decade folder displays its sources in Nuvio.</p>
				<HierarchyCollectionPresentationControls selectedId={state.viewMode} name="decades-view" showAllTab={state.showAllTab} onPresentationChange={(patch) => onStateChange(Object.freeze({ ...state, ...patch }))} showAllLabel="Include an All tab when using Tabs" showAllDescription="For folders with two or more sources, adds an All tab that combines them." showAllDescriptionId="decades-all-tab-help" showAllControlName="showAllTab" />
			</fieldset>
			<div className="decades-presentation-switches">
				<div className="editor-switch-field">
					<PresentationSwitch label="Pin generated collection(s) to top" description="Pinned collections appear before unpinned collections." descriptionId="decades-pin-help" controlName="pinToTop" checked={state.pinToTop} onChange={(pinToTop) => onStateChange(Object.freeze({ ...state, pinToTop }))} />
				</div>
			</div>
			{showOverviewAllTabNote ? <p className="decades-information-note" data-decades-overview-all-tab-note="true">Decade overview is also enabled. The All tab combines this folder’s sources, while Decade overview is one source covering the full Decade, so their results and ordering may differ.</p> : null}
		</section>
	);
}

function FolderAppearance({ state, onStateChange }) {
	return (
		<DecadesSettingsDisclosure id="folder-options" title="Folder options" summary={folderAppearanceSummary(state)}>
			<fieldset className="editor-field editor-choice-field" data-editor-field="tileShape">
				<legend>Tile shape</legend>
				<p className="editor-field-help">One choice applies to every generated Decade folder.</p>
				<FolderShapeChoices selectedId={state.folderTileShape} name="decades-folder-shape" idPrefix="decades-folder" onChange={(folderTileShape) => onStateChange(Object.freeze({ ...state, folderTileShape }))} />
			</fieldset>
		</DecadesSettingsDisclosure>
	);
}

function TitlesAndVisibility({ state, onStateChange }) {
	return (
		<TitleOptions
			idPrefix="decades"
			collectionTitleVisibility={state.scope === "new-collection" ? {
				checked: state.hideCollectionTitle,
				descriptionId: "decades-hidden-title-help",
				onChange: (hideCollectionTitle) => onStateChange(Object.freeze({ ...state, hideCollectionTitle })),
			} : null}
			collectionStatus={state.scope === "new-collection" && state.hideCollectionTitle ? <p id={DECADES_HIDDEN_COLLECTION_TITLES_HELP_ID} className="editor-field-help" role="status">Collection titles are intentionally hidden in Nuvio. Turn this off to edit visible titles.</p> : null}
			folderTitleVisibility={{
				selectedId: state.folderTitleVisibility,
				name: "decades-folder-title-visibility",
				onChange: (folderTitleVisibility) => onStateChange(Object.freeze({ ...state, folderTitleVisibility })),
			}}
		/>
	);
}

function ordinaryExclusionSummary(state) {
	const selections = state.selectedDecadeIds.map((decadeId) => state.advanced.ordinaryExcludedGenresByDecade?.[decadeId] ?? state.advanced.ordinaryExcludedGenres ?? []);
	const configuredCount = selections.filter((names) => names.length > 0).length;
	if (configuredCount === 0) return "No Genre exclusions configured";
	const shared = decadesOrdinaryExclusionsForContext(state, "all");
	const sameEverywhere = selections.every((names) => JSON.stringify(names) === JSON.stringify(selections[0]));
	if (sameEverywhere) return `${shared.length} excluded on all selected Decades`;
	return `Configured for ${configuredCount} Decade${configuredCount === 1 ? "" : "s"}`;
}

export function DecadesOptionsStep({ state, headingRef, onStateChange, onRemoveDecade = () => {}, onOpenSecondary = () => {} }) {
	return (
		<section className="decades-step decades-options-step" aria-labelledby="decades-options-title">
			<div className="add-source-section-heading"><div><p className="panel-kicker">Step 2</p><h3 id="decades-options-title" ref={headingRef} tabIndex={-1}>Configure Decades</h3></div></div>
			<SelectedDecadesSummary selectedDecadeIds={state.selectedDecadeIds} onRemove={onRemoveDecade} />
			<p className="decades-defaults-note">Recommended content defaults are selected. Continue as-is or adjust them below.</p>
			<SemanticSortChoices options={DECADES_MEDIA_MODES} selectedId={state.mediaMode} name="decades-media" legend="Media" onChange={(mediaMode) => onStateChange(updateDecadesCreationMedia(state, mediaMode))} />
			<SemanticSortChoices options={DECADES_SORT_OPTIONS} selectedId={state.sortOptionId} name="decades-sort" legend="Sort titles by" onChange={(sortOptionId) => onStateChange(Object.freeze({ ...state, sortOptionId }))} />
			{state.scope === "new-collection" && state.mediaMode === "both" ? (
				<ChoiceCards legend="Collection structure" name="decades-layout" options={DECADES_COLLECTION_LAYOUTS.map((option) => ({ ...option, description: option.id === "separate-media-collections" ? "Create Movie Decades and TV Decades separately." : "Put Movie and Series folders in one Decades collection.", preview: <StructurePreview mode={option.id} /> }))} selectedId={state.layout} onChange={(layout) => onStateChange(Object.freeze({ ...state, layout, collectionTitles: Object.freeze({}) }))} />
			) : null}
			{state.scope === "new-folder" && state.mediaMode === "both" ? <div className="decades-structure-context"><strong>Folder structure</strong><span>Movie and Series sources will share each new Decade folder in the selected collection.</span><StructurePreview mode="mixed-collection" contextual /></div> : null}
			<ContentChoices state={state} onChange={(content) => onStateChange(Object.freeze({ ...state, content }))} />
			{state.content.genreBreakdown ? <DecadesGenreSummary state={state} onConfigure={(trigger) => onOpenSecondary("genres", trigger)} /> : null}
			<DecadesOrdering state={state} onStateChange={onStateChange} />
			<DecadesAdvancedOptions value={state.advanced} exclusionSummary={ordinaryExclusionSummary(state)} onChange={(advanced) => onStateChange(Object.freeze({ ...state, advanced }))} onOpenSecondary={onOpenSecondary} />
		</section>
	);
}

function reviewRows(plan, state) {
	if (state.scope === "new-collection") {
		return plan.collections.flatMap((collection) => collection.folders.map((folder) => ({
			key: `${collection.role}-${folder.decadeId}`,
			title: DECADE_PRESETS.find((preset) => preset.id === folder.decadeId)?.label ?? folder.decadeId,
			context: `${state.collectionTitles[collection.role] ?? "Decades"}${state.hideCollectionTitle ? " · collection title hidden" : ""} · ${folder.sources.length} source${folder.sources.length === 1 ? "" : "s"}`,
			status: folder.outcome.status,
		})));
	}
	const orderedIds = state.decadeOrder === "newest-first"
		? [...state.selectedDecadeIds].reverse()
		: state.selectedDecadeIds;
	return orderedIds.map((decadeId, index) => {
		const preset = DECADE_PRESETS.find((entry) => entry.id === decadeId);
		const readyFolder = plan.folders.find((folder) => folder.decadeId === decadeId);
		const outcome = plan.outcomes[index];
		return {
			key: decadeId,
			title: preset?.label ?? decadeId,
			context: readyFolder ? `${readyFolder.sources.length} source${readyFolder.sources.length === 1 ? "" : "s"}` : "No folder will be created",
			status: outcome?.status ?? DECADES_PLACEMENT_STATUSES.READY,
		};
	});
}

export function DecadesReviewStep({ state, planResult, headingRef, applyDiagnostic, onCollectionTitleChange, onStateChange }) {
	if (!planResult.ok) {
		return (
			<section className="decades-step" aria-labelledby="decades-review-error-title">
				<h3 id="decades-review-error-title" ref={headingRef} tabIndex={-1}>Review needs attention</h3>
				<SelectedDecadesSummary selectedDecadeIds={state.selectedDecadeIds} />
				{state.scope === "new-collection" ? <div className="decades-collection-names">
					{Object.entries(state.collectionTitles).map(([role, title]) => <div className="editor-field" key={role}><label htmlFor={`decades-collection-${role}`}>{role === "mixed" ? "Collection name" : `${role === "movies" ? "Movie" : "TV"} collection name`}</label><input id={`decades-collection-${role}`} type="text" value={state.hideCollectionTitle ? "" : title} disabled={state.hideCollectionTitle} aria-describedby={state.hideCollectionTitle ? DECADES_HIDDEN_COLLECTION_TITLES_HELP_ID : undefined} onChange={(event) => onCollectionTitleChange(role, event.target.value)} /></div>)}
				</div> : null}
				<TitlesAndVisibility state={state} onStateChange={onStateChange} />
				<ul className="genre-advanced-errors" role="alert">{planResult.errors.map((entry) => <li key={`${entry.code}-${entry.path}`}>{entry.message}</li>)}</ul>
			</section>
		);
	}
	const { plan } = planResult;
	const rows = reviewRows(plan, state);
	const occurrences = plan.outcomes.flatMap((outcome) => outcome.occurrences ?? []);
	return (
		<section className="decades-step decades-review-step" aria-labelledby="decades-review-title">
			<div className="add-source-section-heading"><div><p className="panel-kicker">Step 3</p><h3 id="decades-review-title" ref={headingRef} tabIndex={-1}>Review &amp; Appearance</h3></div></div>
			<div className="decades-plan-totals" data-plan-scope={state.scope} aria-label="Plan totals">
				{state.scope === "new-collection" ? <div><strong>{plan.counts.collectionCount}</strong><span>Collection{plan.counts.collectionCount === 1 ? "" : "s"}</span></div> : null}
				<div><strong>{plan.counts.folderCount}</strong><span>Folder{plan.counts.folderCount === 1 ? "" : "s"}</span></div>
				<div><strong>{plan.counts.sourceCount}</strong><span>Source{plan.counts.sourceCount === 1 ? "" : "s"}</span></div>
			</div>
			{state.scope === "new-folder" ? <div className="decades-destination-summary"><strong>Destination</strong><span>{plan.destination.titleHidden ? "Hidden-title collection" : plan.destination.collectionTitle}</span><small>{inheritedCollectionAppearanceSummary({ title: plan.destination.collectionTitle, viewMode: plan.destination.viewMode, showAllTab: plan.destination.showAllTab, pinToTop: plan.destination.pinToTop })} · parent unchanged</small></div> : (
				<div className="decades-collection-names">
					{plan.collections.map((collection) => (
						<div className="editor-field" key={collection.role}>
							<label htmlFor={`decades-collection-${collection.role}`}>{collection.role === "mixed" ? "Collection name" : `${collection.role === "movies" ? "Movie" : "TV"} collection name`}</label>
							<input id={`decades-collection-${collection.role}`} type="text" value={state.hideCollectionTitle ? "" : state.collectionTitles[collection.role] ?? ""} disabled={state.hideCollectionTitle} aria-describedby={[state.hideCollectionTitle ? DECADES_HIDDEN_COLLECTION_TITLES_HELP_ID : null, collection.titleCollisions.length > 0 ? `decades-title-collision-${collection.role}` : null].filter(Boolean).join(" ") || undefined} onChange={(event) => onCollectionTitleChange(collection.role, event.target.value)} />
							{collection.titleCollisions.length > 0 ? <p id={`decades-title-collision-${collection.role}`} className="editor-field-help">A collection with this name already exists. The new collection will still be created.</p> : null}
						</div>
					))}
				</div>
			)}
			<TitlesAndVisibility state={state} onStateChange={onStateChange} />
			{state.scope === "new-collection" ? <CollectionAppearance state={state} onStateChange={onStateChange} /> : <div className="decades-inherited-presentation" data-decades-inherited-presentation="true"><strong>Inherited Collection options</strong><span>{inheritedCollectionAppearanceSummary({ title: plan.destination.collectionTitle, viewMode: plan.destination.viewMode, showAllTab: plan.destination.showAllTab, pinToTop: plan.destination.pinToTop })}</span><small>The parent collection is not changed.</small></div>}
			<FolderAppearance state={state} onStateChange={onStateChange} />
			{applyDiagnostic ? <div className="editor-diagnostics" role="alert"><p>{applyDiagnostic.message}</p></div> : null}
			<details className="decades-review-details">
				<summary>View folder details · {rows.length}</summary>
				<ul className="genre-review-list">
					{rows.map((row) => <li key={row.key}><div><strong>{row.title}</strong><span>{row.context}</span></div><span data-status={row.status === DECADES_PLACEMENT_STATUSES.READY ? "ready" : row.status === DECADES_PLACEMENT_STATUSES.EXISTS_ELSEWHERE ? "elsewhere" : "destination-duplicate"}>{statusLabels[row.status]}</span></li>)}
				</ul>
			</details>
			<SourceElsewhereNotice occurrences={occurrences} heading="Matching sources exist elsewhere in this project" action="You can still create the ready folders here." />
		</section>
	);
}

function DecadesFlow({ project, projectRevision, scope, currentYear, destinationCollectionInternalId, destinationCollectionTitle, onBackToLauncher, onCancel, onApply }) {
	const [state, setState] = useState(() => createDecadesCreationState({ scope, currentYear, destinationCollectionInternalId }));
	const [isApplying, setIsApplying] = useState(false);
	const [applyDiagnostic, setApplyDiagnostic] = useState(null);
	const [secondarySurface, setSecondarySurface] = useState(null);
	const headingRef = useRef(null);
	const secondaryHeadingRef = useRef(null);
	const secondaryReturnFocusRef = useRef(null);
	const applyingRef = useRef(false);
	const planResult = useMemo(() => buildDecadesCreationPlan(project, projectRevision, state), [project, projectRevision, state]);
	const optionErrors = planResult.ok ? [] : planResult.errors.filter((entry) => !(
		entry.code === "INVALID_DECADES_GENRES"
		&& (entry.path === "$decades.genreNames" || entry.path.startsWith("$decades.genreNamesByDecade"))
	));

	useEffect(() => {
		focusElementWithoutScroll(headingRef.current);
	}, [state.step]);
	useEffect(() => {
		if (secondarySurface) {
			focusElementWithoutScroll(secondaryHeadingRef.current);
			return;
		}
		if (secondaryReturnFocusRef.current) {
			const target = secondaryReturnFocusRef.current;
			secondaryReturnFocusRef.current = null;
			focusElementWithoutScroll(target);
		}
	}, [secondarySurface]);

	function openSecondary(surface, trigger) {
		if (surface !== "genre-exclusions") secondaryReturnFocusRef.current = trigger;
		setSecondarySurface(surface);
	}

	function closeSecondary() {
		setSecondarySurface(null);
	}

	function returnToGenreSurface() {
		setSecondarySurface("genres");
	}

	function goBack() {
		if (isApplying) return;
		setApplyDiagnostic(null);
		if (state.step === DECADES_CREATION_STEPS.PRESETS) onBackToLauncher();
		else setState((current) => Object.freeze({ ...current, step: current.step === DECADES_CREATION_STEPS.REVIEW ? DECADES_CREATION_STEPS.OPTIONS : DECADES_CREATION_STEPS.PRESETS }));
	}

	async function submit(event) {
		event.preventDefault();
		if (secondarySurface) return;
		if (state.step === DECADES_CREATION_STEPS.PRESETS) {
			if (state.selectedDecadeIds.length > 0) setState((current) => Object.freeze({ ...current, step: DECADES_CREATION_STEPS.OPTIONS }));
			return;
		}
		if (state.step === DECADES_CREATION_STEPS.OPTIONS) {
			if (planResult.ok) setState(prepareDecadesReview);
			return;
		}
		if (!planResult.ok || applyingRef.current || planResult.plan.counts.folderCount === 0) return;
		applyingRef.current = true;
		setIsApplying(true);
		const result = await Promise.resolve(onApply(planResult.plan));
		if (result?.ok) return;
		applyingRef.current = false;
		setIsApplying(false);
		setApplyDiagnostic(result?.errors?.[0] ?? { message: "The Decades plan could not be created." });
	}

	const primaryDisabled = state.step === DECADES_CREATION_STEPS.PRESETS
		? state.selectedDecadeIds.length === 0
		: state.step === DECADES_CREATION_STEPS.OPTIONS
			? !planResult.ok
			: !planResult.ok || planResult.plan.counts.folderCount === 0 || isApplying;
	const primaryLabel = state.step === DECADES_CREATION_STEPS.REVIEW
		? isApplying ? "Creating…" : planResult.ok ? `Create ${planResult.plan.counts.folderCount} folder${planResult.plan.counts.folderCount === 1 ? "" : "s"}` : "Create"
		: "Continue";
	const backAction = state.step === DECADES_CREATION_STEPS.PRESETS
		? "back-to-creation-launcher"
		: state.step === DECADES_CREATION_STEPS.OPTIONS
			? "back-to-decades-presets"
			: "back-to-decades-options";

	return (
		<>
			<CreationHeader
				title="Create with Decades"
				context={`${scopeLabel(scope)}${scope === "new-folder" && destinationCollectionTitle ? ` · ${destinationCollectionTitle}` : ""}`}
				description="Choose Decades, configure content, then review names and appearance."
				onBack={goBack}
				backAction={backAction}
				backDisabled={isApplying}
				inactive={Boolean(secondarySurface)}
				onClose={onCancel}
			/>
			<form className="add-source-form decades-creation-form" data-decades-stage={state.step} data-secondary-surface={secondarySurface ?? undefined} onSubmit={submit} noValidate>
				<div className="add-source-scroll" inert={secondarySurface || undefined} aria-hidden={secondarySurface ? "true" : undefined}>
					{state.step === DECADES_CREATION_STEPS.PRESETS ? <DecadePresetStep state={state} headingRef={headingRef} onToggle={(id) => { setState((current) => toggleDecadePreset(current, id)); setApplyDiagnostic(null); }} onSelectAll={() => { setState(selectAllDecadePresets); setApplyDiagnostic(null); }} onClearAll={() => { setState(clearAllDecadePresets); setApplyDiagnostic(null); }} /> : null}
					{state.step === DECADES_CREATION_STEPS.OPTIONS ? <DecadesOptionsStep state={state} headingRef={headingRef} onRemoveDecade={(id) => { setState((current) => toggleDecadePreset(current, id)); setApplyDiagnostic(null); }} onOpenSecondary={openSecondary} onStateChange={(next) => { setState(next); setApplyDiagnostic(null); }} /> : null}
					{state.step === DECADES_CREATION_STEPS.REVIEW ? <DecadesReviewStep state={state} planResult={planResult} headingRef={headingRef} applyDiagnostic={applyDiagnostic} onStateChange={(next) => { setState(next); setApplyDiagnostic(null); }} onCollectionTitleChange={(role, title) => { setState((current) => Object.freeze({ ...current, collectionTitles: Object.freeze({ ...current.collectionTitles, [role]: title }) })); setApplyDiagnostic(null); }} /> : null}
					{state.step === DECADES_CREATION_STEPS.OPTIONS && optionErrors.length > 0 ? <ul className="genre-advanced-errors" role="alert">{optionErrors.map((entry) => <li key={`${entry.code}-${entry.path}`}>{entry.message}</li>)}</ul> : null}
				</div>
				{secondarySurface ? <div className="genre-secondary-surface" data-surface={secondarySurface} onKeyDown={(event) => {
					if (event.key !== "Escape") return;
					event.preventDefault();
					event.stopPropagation();
					if (secondarySurface === "genre-exclusions") returnToGenreSurface();
					else closeSecondary();
				}}>
					{secondarySurface === "genres" ? <DecadesGenreConfigurationSubview state={state} onStateChange={(next) => { setState(next); setApplyDiagnostic(null); }} onOpenExclusions={(trigger) => openSecondary("genre-exclusions", trigger)} onDone={closeSecondary} focusRef={secondaryHeadingRef} /> : null}
					{secondarySurface === "genre-exclusions" ? <GenreExclusionSubview advanced={{ exclusionsByGenre: decadesGenreExclusionsForContext(state) }} includedGenres={decadesGenreSelectionForContext(state)} sharedMediaChoice={state.mediaMode} onChange={(advanced) => setState((current) => setDecadesGenreExclusionsForContext(current, advanced.exclusionsByGenre, current.genreContextId))} onDone={returnToGenreSurface} focusRef={secondaryHeadingRef} /> : null}
					{secondarySurface === "ordinary-exclusions" ? <DecadesOrdinaryExclusionSubview selectedDecadeIds={state.selectedDecadeIds} selectionByDecade={Object.fromEntries(state.selectedDecadeIds.map((decadeId) => [decadeId, state.advanced.ordinaryExcludedGenresByDecade?.[decadeId] ?? []]))} sharedSelection={decadesOrdinaryExclusionsForContext(state, "all")} contextId={state.genreContextId} selection={decadesOrdinaryExclusionsForContext(state)} mediaMode={state.mediaMode} onContextChange={(genreContextId) => setState((current) => Object.freeze({ ...current, genreContextId }))} onToggle={(genreName) => setState((current) => { const names = decadesOrdinaryExclusionsForContext(current); return setDecadesOrdinaryExclusionsForContext(current, names.includes(genreName) ? names.filter((name) => name !== genreName) : [...names, genreName]); })} onSelectAll={() => setState((current) => setDecadesOrdinaryExclusionsForContext(current, GENRE_CONCEPTS.filter((concept) => current.mediaMode === "movies" ? concept.movieId !== null : current.mediaMode === "series" ? concept.tvId !== null : concept.movieId !== null || concept.tvId !== null).map((concept) => concept.name)))} onClearAll={() => setState((current) => setDecadesOrdinaryExclusionsForContext(current, []))} onDone={closeSecondary} focusRef={secondaryHeadingRef} /> : null}
					{secondarySurface === "advanced-help" ? <DecadesAdvancedHelpSubview onDone={closeSecondary} focusRef={secondaryHeadingRef} /> : null}
				</div> : null}
				{!secondarySurface ? <footer className="add-source-actions decades-creation-actions">
					<button className="editor-apply" type="submit" disabled={primaryDisabled}>{primaryLabel}</button>
				</footer> : null}
			</form>
		</>
	);
}

export function CreationDialog({
	scope,
	project,
	projectRevision,
	currentYear,
	destinationCollectionInternalId = null,
	destinationCollectionTitle = null,
	initialOptionId = null,
	onCancel,
	onCreateBlank,
	onApplyDecades,
	onApplyPeople,
	onApplyFranchises,
	onApplyStudios,
	onApplyNetworks,
	onApplyGenres,
	collectionProvider,
	peopleProvider,
	peopleManifestClient,
	studioCatalogueProvider,
	studioPreviewProvider,
	studioArtworkRuntimeClient,
	networkCatalogueProvider,
	networkPreviewProvider,
	networkArtworkRuntimeClient,
	genrePreviewProvider,
}) {
	const [optionId, setOptionId] = useState(() => creationOptionSupportsScope(initialOptionId, scope) ? initialOptionId : null);
	const [viewportStyle, setViewportStyle] = useState(() => typeof window === "undefined" ? null : resolveAddSourceViewportStyle(window));
	const dialogRef = useRef(null);
	const firstOptionRef = useRef(null);

	usePrePaintLayoutEffect(() => {
		const unlockBody = lockAddSourceDocumentBody();
		const stopObserving = observeAddSourceViewport(setViewportStyle);
		const initialTarget = optionId === CREATION_OPTION_IDS.PEOPLE
			? dialogRef.current?.querySelector?.("#people-source-query")
			: optionId === CREATION_OPTION_IDS.GENRES
				? dialogRef.current?.querySelector?.("#genre-hierarchy-select-title")
			: optionId === null ? firstOptionRef.current : dialogRef.current;
		focusElementWithoutScroll(initialTarget ?? dialogRef.current);
		return () => { stopObserving(); unlockBody(); };
	}, []);

	useEffect(() => {
		if (optionId === null) focusElementWithoutScroll(firstOptionRef.current ?? dialogRef.current);
	}, [optionId]);

	function selectOption(nextOptionId) {
		const option = creationOptionById(nextOptionId);
		if (option === null || !creationOptionSupportsScope(option.id, scope)) return;
		if (nextOptionId === CREATION_OPTION_IDS.BLANK) {
			onCreateBlank();
			return;
		}
		if ([CREATION_OPTION_IDS.DECADES, CREATION_OPTION_IDS.PEOPLE, CREATION_OPTION_IDS.FRANCHISES, CREATION_OPTION_IDS.STUDIOS, CREATION_OPTION_IDS.NETWORKS, CREATION_OPTION_IDS.GENRES].includes(nextOptionId)) setOptionId(nextOptionId);
	}

	const launcher = optionId === null;
	const content = (
		<div className="add-source-portal creation-portal" data-creation-portal="true" data-mobile-surface="opaque">
			<div className="settings-modal-backdrop add-source-backdrop" style={viewportStyle ?? undefined} onMouseDown={(event) => { if (event.target === event.currentTarget) { event.preventDefault(); focusElementWithoutScroll(dialogRef.current); } }}>
				<section ref={dialogRef} className="add-source-dialog creation-dialog" data-creation-dialog="true" data-creation-scope={scope} data-creation-option={optionId ?? undefined} role="dialog" aria-modal="true" aria-labelledby="creation-title" aria-describedby="creation-description" tabIndex={-1} onKeyDown={(event) => handleDialogKeyDown(event, dialogRef.current, onCancel)}>
					{launcher ? <>
						<CreationHeader title="What would you like to create?" context={`${scopeLabel(scope)}${scope === "new-folder" && destinationCollectionTitle ? ` · ${destinationCollectionTitle}` : ""}`} description="Choose Blank or a guided starting point." onClose={onCancel} />
						<CreationLauncher firstOptionRef={firstOptionRef} onSelect={selectOption} scope={scope} />
					</> : optionId === CREATION_OPTION_IDS.DECADES ? (
						<DecadesFlow project={project} projectRevision={projectRevision} scope={scope} currentYear={currentYear} destinationCollectionInternalId={destinationCollectionInternalId} destinationCollectionTitle={destinationCollectionTitle} onBackToLauncher={() => { setOptionId(null); queueMicrotask(() => focusElementWithoutScroll(firstOptionRef.current ?? dialogRef.current)); }} onCancel={onCancel} onApply={onApplyDecades} />
					) : optionId === CREATION_OPTION_IDS.PEOPLE ? (
						<PeopleSourceFlow embedded context="hierarchy" hierarchyScope={scope} provider={peopleProvider} manifestClient={peopleManifestClient} project={project} projectRevision={projectRevision} collection={scope === "new-folder" ? project.collections.find((entry) => entry.internalId === destinationCollectionInternalId) ?? null : null} onBack={() => { setOptionId(null); queueMicrotask(() => focusElementWithoutScroll(firstOptionRef.current ?? dialogRef.current)); }} onCancel={onCancel} onApply={onApplyPeople} />
					) : optionId === CREATION_OPTION_IDS.FRANCHISES ? (
						<FranchiseSourceFlow scope={scope} project={project} projectRevision={projectRevision} destinationCollectionInternalId={destinationCollectionInternalId} destinationCollectionTitle={destinationCollectionTitle} provider={collectionProvider} onBack={() => { setOptionId(null); queueMicrotask(() => focusElementWithoutScroll(firstOptionRef.current ?? dialogRef.current)); }} onCancel={onCancel} onApply={onApplyFranchises} />
					) : optionId === CREATION_OPTION_IDS.STUDIOS ? (
						<StudioHierarchyFlow scope={scope} project={project} projectRevision={projectRevision} destinationCollectionInternalId={destinationCollectionInternalId} destinationCollectionTitle={destinationCollectionTitle} catalogueProvider={studioCatalogueProvider} previewProvider={studioPreviewProvider} artworkRuntimeClient={studioArtworkRuntimeClient} onBack={() => { setOptionId(null); queueMicrotask(() => focusElementWithoutScroll(firstOptionRef.current ?? dialogRef.current)); }} onCancel={onCancel} onApply={onApplyStudios} />
					) : optionId === CREATION_OPTION_IDS.NETWORKS ? (
						<NetworkHierarchyFlow scope={scope} project={project} projectRevision={projectRevision} destinationCollectionInternalId={destinationCollectionInternalId} destinationCollectionTitle={destinationCollectionTitle} catalogueProvider={networkCatalogueProvider} previewProvider={networkPreviewProvider} artworkRuntimeClient={networkArtworkRuntimeClient} onBack={() => { setOptionId(null); queueMicrotask(() => focusElementWithoutScroll(firstOptionRef.current ?? dialogRef.current)); }} onCancel={onCancel} onApply={onApplyNetworks} />
					) : optionId === CREATION_OPTION_IDS.GENRES ? (
						<GenreHierarchyFlow scope={scope} project={project} projectRevision={projectRevision} destinationCollectionInternalId={destinationCollectionInternalId} destinationCollectionTitle={destinationCollectionTitle} previewProvider={genrePreviewProvider} onBack={() => { setOptionId(null); queueMicrotask(() => focusElementWithoutScroll(firstOptionRef.current ?? dialogRef.current)); }} onCancel={onCancel} onApply={onApplyGenres} />
					) : null}
				</section>
			</div>
		</div>
	);
	return typeof document === "undefined" ? content : createPortal(content, document.body);
}
