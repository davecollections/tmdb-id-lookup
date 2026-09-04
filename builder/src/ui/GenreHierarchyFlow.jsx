import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
	buildGenreSourceDrafts,
	createAsyncRequestCoordinator,
	createGenreHierarchyPlan,
	DEFAULT_GENRE_ARTWORK_SHAPE,
	DEFAULT_GENRE_HIERARCHY_COLLECTION_TITLE,
	DEFAULT_GENRE_HIERARCHY_COLLECTION_TITLES,
	DEFAULT_GENRE_HIERARCHY_FOLDER_TITLE_VISIBILITY,
	DEFAULT_GENRE_HIERARCHY_STRUCTURE,
	DEFAULT_GENRE_SORT_OPTION_ID,
	DEFAULT_SHARED_GENRE_MEDIA_CHOICE,
	emptyGenreAdvancedState,
	GENRE_CONCEPTS,
	GENRE_HIERARCHY_PLACEMENT_STATUSES,
	GENRE_HIERARCHY_STRUCTURES,
	GENRE_MEDIA_CHOICES,
	GENRE_SORT_OPTIONS,
	GENRE_SOURCE_TITLE_MODES,
	genreAdvancedOptionIsEmpty,
	genreCompositePlacementChoices,
	inspectGenreFolderPlan,
	officialGenreConcept,
	pruneGenreExclusionConfiguration,
	searchGenreConcepts,
} from "../source-add/index.js";
import { reversibleTitleFieldProps } from "../nuvio/titles.js";
import { HierarchyCollectionPresentationControls } from "./CollectionPresentationChoices.jsx";
import { CreationHeader } from "./CreationHeader.jsx";
import { ChoiceCards } from "./ChoiceCards.jsx";
import { GenreAdvancedOptions, GenreAdvancedSecondarySurface } from "./GenreAdvancedOptions.jsx";
import { GenreCatalogueList, genreMediaLabel, GenreSelectionToolbar } from "./GenreCatalogueSelector.jsx";
import { toggleGenreSelection } from "./GenreSourceFlow.jsx";
import { focusElementWithoutScroll } from "./hierarchy-menu-placement.js";
import { NestedPreviewDialog } from "./NestedPreviewDialog.jsx";
import { PosterOnlyPreviewGrid } from "./PosterOnlyPreviewGrid.jsx";
import { FolderShapeChoices, HiddenTitleFieldHelp, PresentationSwitch, TitleOptions } from "./PresentationControls.jsx";
import { RemovableSelectionSummary } from "./RemovableSelectionSummary.jsx";
import { SemanticSortChoices } from "./SemanticSortChoices.jsx";
import { SourceElsewhereNotice } from "./SourceElsewhereNotice.jsx";

const usePrePaintLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function scopeLabel(scope) {
	return scope === "new-folder" ? "New Folder" : "New Collection";
}

function selectionItems(genres) {
	return genres.map((concept) => ({ id: concept.name, label: concept.name, detail: genreMediaLabel(concept) }));
}

function SelectStep({ query, selection, genres, headingRef, onQueryChange, onClearSearch, onChoose, onSelectAll, onClearAll, onRemove }) {
	const concepts = searchGenreConcepts(query);
	return (
		<section className="genre-hierarchy-select genre-browse-step" aria-labelledby="genre-hierarchy-select-title">
			<div className="add-source-section-heading genre-browse-heading"><div><p className="panel-kicker">Step 1</p><h3 id="genre-hierarchy-select-title" ref={headingRef} tabIndex={-1}>Select Genres</h3></div></div>
			<p className="studio-configure-helper">Choose official TMDB Genres in the folder order you want.</p>
			{genres.length ? <section className="people-selected-tray genre-hierarchy-selected-tray"><div className="people-selected-summary"><strong>{genres.length} Genre{genres.length === 1 ? "" : "s"} selected</strong><RemovableSelectionSummary items={selectionItems(genres)} onRemove={onRemove} ariaLabel="Selected Genres" disclosureLabel="View selected Genres" alwaysDisclose showDisclosureCount={false} /></div></section> : null}
			<GenreSelectionToolbar selectionCount={selection.length} totalCount={GENRE_CONCEPTS.length} onSelectAll={onSelectAll} onClearAll={onClearAll} />
			<div className="editor-field add-source-query-field genre-search-field">
				<label htmlFor="genre-hierarchy-query">Search Genres</label>
				<div className="genre-search-control"><input id="genre-hierarchy-query" type="search" value={query} placeholder="Search the local catalogue" autoComplete="off" onChange={onQueryChange} />{query ? <button type="button" onClick={onClearSearch}>Clear search</button> : null}</div>
			</div>
			<GenreCatalogueList concepts={concepts} selection={selection} onChoose={onChoose} selectionControl="checkbox" />
		</section>
	);
}

function placementLabel(group) {
	if (group.status === "already-exists") return "Already in this collection · omitted";
	if (group.status === "partly-exists") return "Partly in this collection · omitted";
	if (group.elsewhere.length > 0) return "Exists elsewhere · ready to create";
	return "Ready to create";
}

function placementStatus(group) {
	if (group.status === "already-exists" || group.status === "partly-exists") return "destination-duplicate";
	return group.elsewhere.length > 0 ? "elsewhere" : "ready";
}

function mediaLabel(mediaType) {
	return mediaType === "TV" ? "Series" : "Movies";
}

function formatCount(value) {
	return Number.isSafeInteger(value) && value >= 0 ? value.toLocaleString("en") : null;
}

function previewCountLabel(draft, conceptName, knownPreviewCounts) {
	const label = mediaLabel(draft.editable.mediaType);
	const count = formatCount(knownPreviewCounts[`${conceptName}|${draft.editable.mediaType}`]);
	return count === null ? label : `${label} · ${count}`;
}

function fixedMediaNotice(genres, sharedMediaChoice) {
	const affected = sharedMediaChoice === "movies"
		? genres.filter((concept) => concept.movieId === null)
		: sharedMediaChoice === "series"
			? genres.filter((concept) => concept.tvId === null)
			: [];
	if (!affected.length) return null;
	const fixedLabel = sharedMediaChoice === "movies" ? "Series-only" : "Movie-only";
	const sourceLabel = sharedMediaChoice === "movies" ? "Series" : "Movie";
	return affected.length === 1
		? `${affected[0].name} is ${fixedLabel} and will still create a ${sourceLabel} source.`
		: `${affected.length} selected Genres are ${fixedLabel} and will still create ${sourceLabel} sources.`;
}

function GenreTitlePreview({ preview, knownPreviewCounts, onChangeDraft, onClose, onRetry }) {
	const dialogRef = useRef(null);
	const closeRef = useRef(null);
	const activeLabel = mediaLabel(preview.draft.editable.mediaType);
	const items = preview.data?.results ?? [];
	return (
		<NestedPreviewDialog ariaLabelledBy="genre-preview-title" backdropClassName="franchise-preview-backdrop studio-preview-backdrop genre-preview-backdrop" backdropProps={{ "data-genre-preview-backdrop": "true" }} dialogClassName="franchise-preview-modal studio-preview-modal genre-preview-modal" dialogRef={dialogRef} initialFocusRef={closeRef} onClose={onClose}>
			<header><div><p className="panel-kicker">Title preview</p><h3 id="genre-preview-title">{preview.group.concept.name}</h3></div><button ref={closeRef} type="button" onClick={onClose}>Close</button></header>
			{preview.group.drafts.length > 1 ? <div className="studio-preview-tabs genre-preview-tabs" role="tablist" aria-label="Preview media">{preview.group.drafts.map((draft) => <button key={draft.editable.mediaType} type="button" role="tab" aria-selected={preview.draft.editable.mediaType === draft.editable.mediaType} onClick={() => onChangeDraft(draft)}>{previewCountLabel(draft, preview.group.concept.name, knownPreviewCounts)}</button>)}</div> : <p className="studio-preview-single-media">{previewCountLabel(preview.draft, preview.group.concept.name, knownPreviewCounts)}</p>}
			{preview.status === "loading" ? <p className="studio-preview-state" role="status">Preparing {activeLabel.toLowerCase()} preview…</p> : null}
			{preview.status === "error" ? <div className="studio-preview-state add-source-request-state" role="alert"><p>{preview.error?.message ?? "This Genre preview could not be prepared."}</p><button type="button" onClick={onRetry}>Retry</button></div> : null}
			{preview.status === "ready" ? <PosterOnlyPreviewGrid items={items} limit={10} className="franchise-preview-grid studio-preview-grid genre-preview-grid" ariaLabel={`${activeLabel} poster preview`} altPrefix={activeLabel} emptyMessage="No posters available." /> : null}
		</NestedPreviewDialog>
	);
}

function GenreConfigureRow({ group, onPreview, onRemove }) {
	const media = group.drafts.map((draft) => draft.editable.title).join(" + ");
	return (
		<article className="genre-hierarchy-configure-row" data-genre-name={group.concept.name} data-placement-status={group.status}>
			<div className="genre-hierarchy-configure-row-main"><div className="genre-hierarchy-configure-row-copy"><strong>{group.concept.name}</strong><span>{media} · {group.drafts.length} source{group.drafts.length === 1 ? "" : "s"}</span></div><div className="genre-hierarchy-configure-row-actions"><button type="button" aria-haspopup="dialog" aria-label={`Preview titles for ${group.concept.name}`} onClick={(event) => onPreview(group, event.currentTarget)}>Preview titles</button><button className="genre-hierarchy-configure-remove" type="button" aria-label={`Remove ${group.concept.name}`} onClick={() => onRemove(group.concept.name)}>×</button></div></div>
			<p className="genre-hierarchy-configure-placement" data-status={placementStatus(group)}>{placementLabel(group)}</p>
			{group.elsewhere.length ? <details className="studio-configure-locations"><summary>View locations</summary><SourceElsewhereNotice occurrences={group.elsewhere} heading="Matching Genre sources exist elsewhere" action="This configured Genre folder can still be created here." /></details> : null}
		</article>
	);
}

function ConfigureStep({
	scope,
	genres,
	sharedMediaChoice,
	sortOptionId,
	advanced,
	built,
	folderPlan,
	headingRef,
	onRemove,
	onPreview,
	onSharedMediaChange,
	onSortChange,
	onAdvancedChange,
	onOpenSecondary,
}) {
	const hasShared = genres.some((concept) => concept.shared);
	const creatable = scope === "new-folder" ? folderPlan.readyGroups : folderPlan.groups;
	const sourceCount = creatable.reduce((count, group) => count + group.drafts.length, 0);
	const omittedCount = folderPlan.groups.length - creatable.length;
	const sortLabel = GENRE_SORT_OPTIONS.find((option) => option.id === sortOptionId)?.label ?? sortOptionId;
	const mediaNotice = fixedMediaNotice(genres, sharedMediaChoice);
	return (
		<section className="genre-hierarchy-configure" aria-labelledby="genre-hierarchy-configure-title">
			<div className="add-source-section-heading"><div><p className="panel-kicker">Step 2</p><h3 id="genre-hierarchy-configure-title" ref={headingRef} tabIndex={-1}>Configure Genres</h3></div></div>
			<section className="genre-hierarchy-configuration-surface" aria-labelledby="genre-hierarchy-content-settings-title">
				<div><p className="panel-kicker">Shared content settings</p><h4 id="genre-hierarchy-content-settings-title">Configure every selected Genre</h4><p>These settings are applied to the configured Genre sources below.</p></div>
				{hasShared ? <div className="genre-hierarchy-configuration-control"><SemanticSortChoices options={GENRE_MEDIA_CHOICES} selectedId={sharedMediaChoice} name="genre-hierarchy-media" legend="Media" helper="Applies to Genres available in both Movies and Series." onChange={onSharedMediaChange} />{mediaNotice ? <p className="genre-fixed-media-note" role="status">{mediaNotice}</p> : null}</div> : null}
				<div className="genre-hierarchy-configuration-control"><SemanticSortChoices options={GENRE_SORT_OPTIONS} selectedId={sortOptionId} name="genre-hierarchy-sort" legend="Sort titles by" onChange={onSortChange} /></div>
			</section>
			<GenreAdvancedOptions idPrefix="genre-hierarchy-advanced" value={advanced} includedGenres={genres} sharedMediaChoice={sharedMediaChoice} onChange={onAdvancedChange} onOpenSecondary={onOpenSecondary} />
			<div className="genre-hierarchy-configuration-summary"><strong>{creatable.length} configured Genre{creatable.length === 1 ? "" : "s"} · {sourceCount} source{sourceCount === 1 ? "" : "s"}</strong><span>Sort: {sortLabel} · Advanced: {genreAdvancedOptionIsEmpty(advanced) ? "Not configured" : "Configured"}{omittedCount ? ` · ${omittedCount} destination match${omittedCount === 1 ? "" : "es"}` : ""}</span></div>
			{built.errors.length ? <ul className="genre-advanced-errors" role="alert">{built.errors.map((error) => <li key={`${error.code}-${error.path}-${error.message}`}>{error.message}</li>)}</ul> : null}
			<section className="genre-hierarchy-configured-genres" aria-labelledby="genre-hierarchy-configured-title">
				<div className="add-source-section-heading"><div><h4 id="genre-hierarchy-configured-title">Configured Genres · {genres.length}</h4></div></div>
				{folderPlan.groups.length ? <div className="genre-hierarchy-configure-list">{folderPlan.groups.map((group) => <GenreConfigureRow key={group.concept.name} group={group} onPreview={onPreview} onRemove={onRemove} />)}</div> : <p className="studio-configure-empty">No valid Genres are currently configured.</p>}
				{folderPlan.partialGroups.length ? <p className="genre-attention-note">{folderPlan.partialGroups.length} partially matching Genre folder{folderPlan.partialGroups.length === 1 ? " is" : "s are"} omitted so a configured physical set is never created incompletely.</p> : null}
			</section>
		</section>
	);
}

const GENRE_STRUCTURE_PREVIEWS = Object.freeze({
	"genre-folders": Object.freeze([
		Object.freeze({ label: "Genres", folders: Object.freeze([
			Object.freeze({ label: "Action", sources: Object.freeze(["Movies"]) }),
			Object.freeze({ label: "Animation", sources: Object.freeze(["Movies", "Series"]) }),
		]) }),
	]),
	"media-folders": Object.freeze([
		Object.freeze({ label: "Genres", folders: Object.freeze([
			Object.freeze({ label: "Movies", sources: Object.freeze(["Action", "Comedy"]) }),
			Object.freeze({ label: "Series", sources: Object.freeze(["Drama", "Mystery"]) }),
		]) }),
	]),
	"separate-media-genre-folders": Object.freeze([
		Object.freeze({ label: "Genres", folders: Object.freeze([
			Object.freeze({ label: "Action Movies", sources: Object.freeze(["Movies"]) }),
			Object.freeze({ label: "Comedy Movies", sources: Object.freeze(["Movies"]) }),
			Object.freeze({ label: "Drama Series", sources: Object.freeze(["Series"]) }),
		]) }),
	]),
	"separate-media-collections": Object.freeze([
		Object.freeze({ label: "Movie Genres", folders: Object.freeze([
			Object.freeze({ label: "Action", sources: Object.freeze(["Movies"]) }),
			Object.freeze({ label: "Comedy", sources: Object.freeze(["Movies"]) }),
		]) }),
		Object.freeze({ label: "Series Genres", folders: Object.freeze([
			Object.freeze({ label: "Drama", sources: Object.freeze(["Series"]) }),
			Object.freeze({ label: "Mystery", sources: Object.freeze(["Series"]) }),
		]) }),
	]),
});

function StructureChoicePreview({ structure, planResult }) {
	const counts = planResult?.ok ? planResult.plan.counts : { collectionCount: 0, folderCount: 0 };
	const collections = GENRE_STRUCTURE_PREVIEWS[structure] ?? GENRE_STRUCTURE_PREVIEWS["genre-folders"];
	return <span className="genre-structure-preview" data-genre-structure-preview={structure}>
		<span className="genre-structure-wireframe" data-collection-count={collections.length} aria-hidden="true">
			<span className="genre-structure-wireframe-collections">
				{collections.map((collection) => <span className="genre-structure-wireframe-collection" key={`${structure}-${collection.label}`}>
					<span className="genre-structure-wireframe-collection-title">{collection.label}</span>
					<span className="genre-structure-wireframe-folders">
						{collection.folders.map((folder) => <span className="genre-structure-wireframe-folder" key={`${collection.label}-${folder.label}`}>
							<span className="genre-structure-wireframe-folder-title">{folder.label}</span>
							<span className="genre-structure-wireframe-sources">{folder.sources.map((source) => <i key={`${folder.label}-${source}`}>{source}</i>)}</span>
						</span>)}
					</span>
				</span>)}
			</span>
		</span>
		<span className="genre-structure-counts">{counts.collectionCount ? `${counts.collectionCount} collection${counts.collectionCount === 1 ? "" : "s"} · ` : ""}{counts.folderCount} folder{counts.folderCount === 1 ? "" : "s"}</span>
	</span>;
}

function StructureStep({ structurePlans, compositeChoices, options, headingRef, onStructureChange, onCompositeChange }) {
	const choices = GENRE_HIERARCHY_STRUCTURES
		.filter((option) => structurePlans.has(option.id))
		.map((option) => ({ ...option, preview: <StructureChoicePreview structure={option.id} planResult={structurePlans.get(option.id)} /> }));
	return <section className="genre-hierarchy-structure" aria-labelledby="genre-hierarchy-structure-title">
		<div className="add-source-section-heading"><div><p className="panel-kicker">Step 3</p><h3 id="genre-hierarchy-structure-title" ref={headingRef} tabIndex={-1}>Structure</h3></div></div>
		<p className="studio-configure-helper">Choose how Genre folders are arranged within collections on your Nuvio Home screen.</p>
		<ChoiceCards legend="Structure options" hideLegend name="genre-hierarchy-structure" options={choices} selectedId={options.structure} onChange={onStructureChange} gridClassName="genre-structure-choice-grid" />
		{options.structure === "genre-folders" && compositeChoices.length ? <section className="genre-composite-placement" aria-labelledby="genre-composite-placement-title">
			<div><h4 id="genre-composite-placement-title">Where should combined Series genres go?</h4><p>TMDB groups some Series genres separately from Movies. Choose whether those Series sources get their own folders or are added to the matching Movie Genre folder(s).</p></div>
			{compositeChoices.map((composite) => <div className="genre-composite-control" key={composite.genreName}>
				<SemanticSortChoices options={composite.choices} selectedId={composite.choices.some((choice) => choice.id === options.compositePlacements[composite.genreName]) ? options.compositePlacements[composite.genreName] : "standalone"} name={`genre-composite-${composite.genreName}`} legend={composite.genreName} onChange={(placement) => onCompositeChange(composite.genreName, placement)} />
				{composite.blockedMessage ? <p className="genre-fixed-media-note">{composite.blockedMessage} Keep its own folder remains available.</p> : null}
			</div>)}
		</section> : null}
	</section>;
}

function AppearanceStep({ planResult, options, onOptionsChange, diagnostic, headingRef }) {
	if (!planResult.ok) return <div className="editor-diagnostics" role="alert"><p>{planResult.errors[0]?.message ?? "The Genre hierarchy plan could not be prepared."}</p></div>;
	const plan = planResult.plan;
	const structure = plan.configuration.structure;
	const mediaFolders = structure === "media-folders";
	const separateCollections = structure === "separate-media-collections";
	const folderTitleVisibility = mediaFolders ? null : {
		selectedId: plan.configuration.folderTitleVisibility,
		name: "genre-hierarchy-folder-title-visibility",
		onChange: (value) => onOptionsChange({ folderTitleVisibility: value, folderTitleVisibilityTouched: true }),
	};
	const omittedCount = plan.outcomes.filter((outcome) => [GENRE_HIERARCHY_PLACEMENT_STATUSES.ALREADY_IN_COLLECTION, GENRE_HIERARCHY_PLACEMENT_STATUSES.PARTLY_IN_COLLECTION].includes(outcome.status)).length;
	const elsewhereCount = plan.outcomes.filter((outcome) => outcome.status === GENRE_HIERARCHY_PLACEMENT_STATUSES.EXISTS_ELSEWHERE).length;
	return (
		<section className="genre-hierarchy-appearance" aria-labelledby="genre-hierarchy-appearance-title">
			<div className="add-source-section-heading"><div><p className="panel-kicker">Step 4</p><h3 id="genre-hierarchy-appearance-title" ref={headingRef} tabIndex={-1}>Appearance</h3></div></div>
			<div className="decades-plan-totals" data-plan-scope={plan.configuration.scope} aria-label="Plan totals">{plan.configuration.scope === "new-collection" ? <div><strong>{plan.counts.collectionCount}</strong><span>Collection</span></div> : null}<div><strong>{plan.counts.folderCount}</strong><span>Folder{plan.counts.folderCount === 1 ? "" : "s"}</span></div><div><strong>{plan.counts.sourceCount}</strong><span>Source{plan.counts.sourceCount === 1 ? "" : "s"}</span></div></div>
			{omittedCount || elsewhereCount ? <p className="studio-configure-helper">{omittedCount ? `${omittedCount} destination match${omittedCount === 1 ? " is" : "es are"} omitted. ` : ""}{elsewhereCount ? `${elsewhereCount} elsewhere match${elsewhereCount === 1 ? " remains" : "es remain"} addable.` : ""}</p> : null}
			{plan.configuration.scope === "new-collection" ? <>
				{separateCollections ? <>
					<div className="genre-collection-name-grid">{[["movies", "Movie collection name"], ["series", "Series collection name"]].map(([role, label]) => <div className="editor-field" key={role}><label htmlFor={`genre-hierarchy-collection-${role}`}>{label}</label><input id={`genre-hierarchy-collection-${role}`} type="text" {...reversibleTitleFieldProps(options.collectionTitles[role], options.hideCollectionTitle)} aria-describedby={options.hideCollectionTitle ? "genre-hierarchy-collection-titles-hidden-help" : undefined} onChange={(event) => onOptionsChange({ collectionTitles: Object.freeze({ ...options.collectionTitles, [role]: event.target.value }) })} /></div>)}</div>
					<HiddenTitleFieldHelp id="genre-hierarchy-collection-titles-hidden-help" hidden={options.hideCollectionTitle} kind="collection" plural />
				</> : <div className="editor-field"><label htmlFor="genre-hierarchy-collection-name">Collection name</label><input id="genre-hierarchy-collection-name" type="text" {...reversibleTitleFieldProps(options.collectionTitle, options.hideCollectionTitle)} aria-describedby={options.hideCollectionTitle ? "genre-hierarchy-collection-title-hidden-help" : undefined} onChange={(event) => onOptionsChange({ collectionTitle: event.target.value })} /><HiddenTitleFieldHelp id="genre-hierarchy-collection-title-hidden-help" hidden={options.hideCollectionTitle} kind="collection" /></div>}
				<TitleOptions idPrefix="genre-hierarchy" collectionTitleVisibility={{ checked: options.hideCollectionTitle, onChange: (hideCollectionTitle) => onOptionsChange({ hideCollectionTitle }), descriptionId: "genre-hierarchy-hide-collection-title-help", controlName: "genreHierarchyHideNuvioTitle" }} folderTitleVisibility={folderTitleVisibility} />
				{mediaFolders ? <p className="genre-fixed-media-note">Movies and Series folders use the safe folder fallback, so their titles remain visible.</p> : null}
				<fieldset className="editor-field editor-choice-field"><legend>Collection layout</legend><HierarchyCollectionPresentationControls selectedId={options.viewMode} name="genre-hierarchy-collection-layout" showAllTab={options.showAllTab} onPresentationChange={onOptionsChange} showAllDescription="Combines every Genre folder in one All tab." showAllDescriptionId="genre-hierarchy-all-tab-help" showAllControlName="genreHierarchyShowAllTab" /></fieldset>
				<PresentationSwitch label="Pin collection to top" description="Keeps this collection near the top of Nuvio." descriptionId="genre-hierarchy-pin-help" controlName="genreHierarchyPinToTop" checked={options.pinToTop} onChange={(pinToTop) => onOptionsChange({ pinToTop })} />
			</> : <>
				<div className="franchise-inherited-summary"><strong>Parent presentation is inherited</strong><span>{plan.destination.titleHidden ? "Hidden-title collection" : plan.destination.collectionTitle || "Untitled collection"} · {plan.destination.viewMode === "ROWS" ? "Rows" : "Tabs"} · parent unchanged</span></div>
				<TitleOptions idPrefix="genre-hierarchy" folderTitleVisibility={folderTitleVisibility} />
				{mediaFolders ? <p className="genre-fixed-media-note">Movies and Series folders use the safe folder fallback, so their titles remain visible.</p> : null}
			</>}
			<fieldset className="editor-field editor-choice-field genre-hierarchy-artwork-shape" data-editor-field="folderTileShape"><legend>Artwork shape</legend><FolderShapeChoices selectedId={options.folderTileShape} name="genre-hierarchy-folder-shape" idPrefix="genre-hierarchy-folder" onChange={(folderTileShape) => onOptionsChange({ folderTileShape })} /></fieldset>
			<p className="decades-defaults-note" data-genre-hierarchy-artwork-rule={options.folderTileShape.toLowerCase()}>{mediaFolders ? `The ${options.folderTileShape === "POSTER" ? "Poster" : "Landscape"} shape applies to the safe Movies/Series folder fallback. No Genre artwork is assigned to media folders.` : `The selected ${options.folderTileShape === "POSTER" ? "vertical" : "wide"} published Genre artwork is applied to every generated Genre folder. Missing artwork safely falls back without borrowing the other orientation.`}</p>
			{diagnostic ? <div className="editor-diagnostics" role="alert"><p>{diagnostic.message}</p></div> : null}
		</section>
	);
}

export function GenreHierarchyFlow({
	scope,
	project,
	projectRevision,
	destinationCollectionInternalId = null,
	destinationCollectionTitle = null,
	previewProvider,
	onBack,
	onCancel,
	onApply,
}) {
	const [step, setStep] = useState("select");
	const [query, setQuery] = useState("");
	const [selection, setSelection] = useState([]);
	const [sharedMediaChoice, setSharedMediaChoice] = useState(DEFAULT_SHARED_GENRE_MEDIA_CHOICE);
	const [sortOptionId, setSortOptionId] = useState(DEFAULT_GENRE_SORT_OPTION_ID);
	const [advanced, setAdvanced] = useState(emptyGenreAdvancedState);
	const [options, setOptions] = useState(() => Object.freeze({
		structure: DEFAULT_GENRE_HIERARCHY_STRUCTURE,
		compositePlacements: Object.freeze({}),
		collectionTitle: DEFAULT_GENRE_HIERARCHY_COLLECTION_TITLE,
		collectionTitles: DEFAULT_GENRE_HIERARCHY_COLLECTION_TITLES,
		hideCollectionTitle: false,
		viewMode: "TABBED_GRID",
		showAllTab: true,
		pinToTop: false,
		folderTitleVisibility: DEFAULT_GENRE_HIERARCHY_FOLDER_TITLE_VISIBILITY,
		folderTitleVisibilityTouched: false,
		folderTileShape: DEFAULT_GENRE_ARTWORK_SHAPE,
	}));
	const [secondarySurface, setSecondarySurface] = useState(null);
	const [preview, setPreview] = useState(null);
	const [knownPreviewCounts, setKnownPreviewCounts] = useState({});
	const [diagnostic, setDiagnostic] = useState(null);
	const [isApplying, setIsApplying] = useState(false);
	const scrollRef = useRef(null);
	const selectHeadingRef = useRef(null);
	const configureHeadingRef = useRef(null);
	const structureHeadingRef = useRef(null);
	const appearanceHeadingRef = useRef(null);
	const secondaryHeadingRef = useRef(null);
	const secondaryReturnFocusRef = useRef(null);
	const previewCoordinatorRef = useRef(null);
	const previewTriggerRef = useRef(null);
	const previewTokenRef = useRef(null);
	const scrollByStepRef = useRef({ select: 0, configure: 0, structure: 0, appearance: 0 });
	if (previewCoordinatorRef.current === null) previewCoordinatorRef.current = createAsyncRequestCoordinator();
	const genres = useMemo(() => selection.map((name) => officialGenreConcept(name)).filter(Boolean), [selection]);
	const built = useMemo(() => buildGenreSourceDrafts(genres, { sharedMediaChoice, sortOptionId, advanced, titleMode: GENRE_SOURCE_TITLE_MODES.HIERARCHY }), [advanced, genres, sharedMediaChoice, sortOptionId]);
	const folderPlan = useMemo(() => built.ok ? inspectGenreFolderPlan(project, scope === "new-folder" ? destinationCollectionInternalId : null, genres, built.drafts, sharedMediaChoice) : Object.freeze({ groups: Object.freeze([]), readyGroups: Object.freeze([]), alreadyExistingGroups: Object.freeze([]), partialGroups: Object.freeze([]), elsewhere: Object.freeze([]) }), [built, destinationCollectionInternalId, genres, project, scope, sharedMediaChoice]);
	const compositeChoices = useMemo(() => built.ok ? genreCompositePlacementChoices(project, {
		scope,
		destinationCollectionInternalId,
		genres: selection,
		drafts: built.drafts,
		sharedMediaChoice,
	}) : Object.freeze([]), [built, destinationCollectionInternalId, project, scope, selection, sharedMediaChoice]);
	const effectiveCompositePlacements = useMemo(() => Object.freeze(Object.fromEntries(compositeChoices.map((entry) => {
		const current = options.compositePlacements[entry.genreName] ?? "standalone";
		return [entry.genreName, entry.choices.some((choice) => choice.id === current) ? current : "standalone"];
	}))), [compositeChoices, options.compositePlacements]);
	const structurePlans = useMemo(() => {
		const effectiveMedia = new Set(built.ok ? built.drafts.map((draft) => draft.editable.mediaType) : []);
		const plans = new Map();
		for (const structureOption of GENRE_HIERARCHY_STRUCTURES) {
			if (structureOption.id === "separate-media-collections" && (scope !== "new-collection" || effectiveMedia.size !== 2)) continue;
			const structure = structureOption.id;
			const folderTitleVisibility = structure === "media-folders"
				? "SHOW_EVERYWHERE"
				: !options.folderTitleVisibilityTouched && structure === "separate-media-genre-folders"
					? "SHOW_EVERYWHERE"
					: options.folderTitleVisibility;
			plans.set(structure, createGenreHierarchyPlan(project, {
				scope,
				projectRevision,
				...(scope === "new-folder" ? { destinationCollectionInternalId } : {
					...(structure === "separate-media-collections" ? { collectionTitles: options.collectionTitles } : { collectionTitle: options.collectionTitle }),
					hideCollectionTitle: options.hideCollectionTitle,
					viewMode: options.viewMode,
					showAllTab: options.showAllTab,
					pinToTop: options.pinToTop,
				}),
				folderTitleVisibility,
				folderTileShape: options.folderTileShape,
				structure,
				...(structure === "genre-folders" ? { compositePlacements: effectiveCompositePlacements } : {}),
				genres: selection,
				sharedMediaChoice,
				sortOptionId,
				advanced,
			}));
		}
		return plans;
	}, [advanced, built, destinationCollectionInternalId, effectiveCompositePlacements, options, project, projectRevision, scope, selection, sharedMediaChoice, sortOptionId]);
	const planResult = structurePlans.get(options.structure) ?? structurePlans.get(DEFAULT_GENRE_HIERARCHY_STRUCTURE) ?? Object.freeze({ ok: false, plan: null, errors: Object.freeze([]) });

	useEffect(() => () => previewCoordinatorRef.current.cancel({ notify: false }), []);
	useEffect(() => {
		if (!structurePlans.has(options.structure) && structurePlans.has(DEFAULT_GENRE_HIERARCHY_STRUCTURE)) {
			setOptions((current) => Object.freeze({ ...current, structure: DEFAULT_GENRE_HIERARCHY_STRUCTURE }));
		}
	}, [options.structure, structurePlans]);
	usePrePaintLayoutEffect(() => {
		if (scrollRef.current) scrollRef.current.scrollTop = scrollByStepRef.current[step] ?? 0;
		focusElementWithoutScroll(step === "select" ? selectHeadingRef.current : step === "configure" ? configureHeadingRef.current : step === "structure" ? structureHeadingRef.current : appearanceHeadingRef.current);
	}, [step]);
	useEffect(() => {
		if (secondarySurface) {
			focusElementWithoutScroll(secondaryHeadingRef.current);
			return;
		}
		if (secondaryReturnFocusRef.current) {
			const trigger = secondaryReturnFocusRef.current;
			secondaryReturnFocusRef.current = null;
			focusElementWithoutScroll(trigger);
		}
	}, [secondarySurface]);

	function updateOptions(patch) {
		setOptions((current) => Object.freeze({ ...current, ...patch }));
		setDiagnostic(null);
	}

	function chooseGenre(genreName) {
		const next = toggleGenreSelection(selection, genreName);
		setSelection(next);
		setAdvanced((current) => pruneGenreExclusionConfiguration(current, next));
		setKnownPreviewCounts({});
		setDiagnostic(null);
	}

	async function requestPreview(group, draft, trigger = null) {
		if (trigger) previewTriggerRef.current = trigger;
		previewCoordinatorRef.current.cancel({ notify: false });
		const token = Symbol(`genre-preview-${group.concept.name}-${draft.editable.mediaType}`);
		previewTokenRef.current = token;
		setPreview({ group, draft, status: "loading", data: null, error: null });
		const outcome = await previewCoordinatorRef.current.run(
			({ signal }) => previewProvider.getGenrePreview(draft, { signal }),
			{ genreName: group.concept.name, mediaType: draft.editable.mediaType, sortBy: draft.editable.sortBy, filters: draft.editable.filters },
		);
		if (!outcome.accepted || previewTokenRef.current !== token) return;
		if (outcome.result?.ok) {
			setPreview({ group, draft, status: "ready", data: outcome.result.data, error: null });
			setKnownPreviewCounts((current) => Object.freeze({ ...current, [`${group.concept.name}|${draft.editable.mediaType}`]: outcome.result.data.totalResults }));
		} else if (outcome.result?.error?.kind !== "aborted") {
			setPreview({ group, draft, status: "error", data: null, error: outcome.result?.error ?? { message: "This Genre preview could not be prepared." } });
		}
	}

	function openPreview(group, trigger) {
		requestPreview(group, group.drafts[0], trigger);
	}

	function closePreview() {
		previewCoordinatorRef.current.cancel({ notify: false });
		previewTokenRef.current = null;
		const trigger = previewTriggerRef.current;
		previewTriggerRef.current = null;
		setPreview(null);
		queueMicrotask(() => focusElementWithoutScroll(trigger));
	}

	function openSecondary(surface, trigger) {
		secondaryReturnFocusRef.current = trigger;
		setSecondarySurface(surface);
	}

	function closeSecondary() {
		setSecondarySurface(null);
	}

	function goBack() {
		if (isApplying || secondarySurface || preview) return;
		setDiagnostic(null);
		if (step === "select") onBack();
		else {
			scrollByStepRef.current[step] = scrollRef.current?.scrollTop ?? 0;
			setStep(step === "appearance" ? "structure" : step === "structure" ? "configure" : "select");
		}
	}

	async function submit(event) {
		event.preventDefault();
		if (secondarySurface || preview) return;
		if (step === "select") {
			if (!selection.length) return;
			scrollByStepRef.current.select = scrollRef.current?.scrollTop ?? 0;
			setStep("configure");
			return;
		}
		if (step === "configure") {
			if (!planResult.ok || planResult.plan.counts.folderCount === 0) return;
			scrollByStepRef.current.configure = scrollRef.current?.scrollTop ?? 0;
			setStep("structure");
			return;
		}
		if (step === "structure") {
			if (!planResult.ok || planResult.plan.counts.folderCount === 0) return;
			scrollByStepRef.current.structure = scrollRef.current?.scrollTop ?? 0;
			setStep("appearance");
			return;
		}
		if (!planResult.ok || planResult.plan.counts.folderCount === 0 || isApplying) return;
		setIsApplying(true);
		let result;
		try { result = await onApply(planResult.plan); } catch { result = { ok: false, errors: [{ message: "Genre folders could not be created. Try again." }] }; }
		if (result?.ok) return;
		setIsApplying(false);
		setDiagnostic(result?.errors?.[0] ?? { message: "Genre folders could not be created. Try again." });
	}

	const primaryDisabled = step === "select"
		? selection.length === 0
		: !planResult.ok || planResult.plan.counts.folderCount === 0 || (step === "appearance" && isApplying);
	const primaryLabel = step === "select"
		? `Configure ${selection.length} Genre${selection.length === 1 ? "" : "s"}`
		: step === "configure"
			? planResult.ok && planResult.plan.counts.folderCount > 0 ? "Continue to Structure" : "No Genre folders ready"
			: step === "structure"
				? planResult.ok && planResult.plan.counts.folderCount > 0 ? "Continue to Appearance" : "No Genre folders ready"
				: isApplying ? "Creating…" : `Create ${planResult.ok ? planResult.plan.counts.folderCount : 0} folder${planResult.ok && planResult.plan.counts.folderCount === 1 ? "" : "s"}`;
	return <>
		<CreationHeader title="Create with Genres" context={`${scopeLabel(scope)}${scope === "new-folder" && destinationCollectionTitle ? ` · ${destinationCollectionTitle}` : ""}`} description={step === "select" ? "Select official TMDB Genres in folder order." : step === "configure" ? "Choose media, sort and Advanced settings, then review exact sources." : step === "structure" ? "Choose how Genre sources are grouped in Nuvio." : "Choose presentation settings and create the hierarchy atomically."} onBack={goBack} backAction={step === "select" ? "back-to-creation-launcher" : step === "configure" ? "back-to-genre-hierarchy-selection" : step === "structure" ? "back-to-genre-hierarchy-configuration" : "back-to-genre-hierarchy-structure"} backDisabled={isApplying} inactive={Boolean(secondarySurface || preview)} onClose={onCancel} />
		<form className="add-source-form genre-hierarchy-form" data-genre-hierarchy-stage={step} data-secondary-surface={secondarySurface ?? undefined} onSubmit={submit} noValidate onKeyDown={(event) => { if (secondarySurface && event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeSecondary(); } }}>
			<div ref={scrollRef} className="add-source-scroll" inert={secondarySurface || preview || undefined} aria-hidden={secondarySurface || preview ? "true" : undefined}>
				{step === "select" ? <SelectStep query={query} selection={selection} genres={genres} headingRef={selectHeadingRef} onQueryChange={(event) => setQuery(event.target.value)} onClearSearch={() => setQuery("")} onChoose={chooseGenre} onSelectAll={() => { const names = GENRE_CONCEPTS.map((concept) => concept.name); setSelection(names); setAdvanced((current) => pruneGenreExclusionConfiguration(current, names)); setKnownPreviewCounts({}); setDiagnostic(null); }} onClearAll={() => { setSelection([]); setAdvanced((current) => pruneGenreExclusionConfiguration(current, [])); setKnownPreviewCounts({}); setDiagnostic(null); }} onRemove={chooseGenre} /> : step === "configure" ? <ConfigureStep scope={scope} genres={genres} sharedMediaChoice={sharedMediaChoice} sortOptionId={sortOptionId} advanced={advanced} built={built} folderPlan={folderPlan} headingRef={configureHeadingRef} onRemove={chooseGenre} onPreview={openPreview} onSharedMediaChange={(value) => { setSharedMediaChoice(value); setKnownPreviewCounts({}); setDiagnostic(null); }} onSortChange={(value) => { setSortOptionId(value); setKnownPreviewCounts({}); setDiagnostic(null); }} onAdvancedChange={(value) => { setAdvanced(value); setKnownPreviewCounts({}); setDiagnostic(null); }} onOpenSecondary={openSecondary} /> : step === "structure" ? <StructureStep structurePlans={structurePlans} compositeChoices={compositeChoices} options={options} headingRef={structureHeadingRef} onStructureChange={(structure) => updateOptions({ structure })} onCompositeChange={(genreName, placement) => updateOptions({ compositePlacements: Object.freeze({ ...options.compositePlacements, [genreName]: placement }) })} /> : <AppearanceStep planResult={planResult} options={options} onOptionsChange={updateOptions} diagnostic={diagnostic} headingRef={appearanceHeadingRef} />}
			</div>
			{secondarySurface ? <div className="genre-secondary-surface" data-surface={secondarySurface}><GenreAdvancedSecondarySurface surface={secondarySurface} value={advanced} includedGenres={genres} sharedMediaChoice={sharedMediaChoice} onChange={(value) => { setAdvanced(value); setKnownPreviewCounts({}); setDiagnostic(null); }} onDone={closeSecondary} focusRef={secondaryHeadingRef} /></div> : null}
			{!secondarySurface ? <footer className="add-source-actions"><button className="editor-apply" type="submit" disabled={primaryDisabled}>{primaryLabel}</button></footer> : null}
		</form>
		{preview ? <GenreTitlePreview preview={preview} knownPreviewCounts={knownPreviewCounts} onChangeDraft={(draft) => { if (draft !== preview.draft) requestPreview(preview.group, draft); }} onClose={closePreview} onRetry={() => requestPreview(preview.group, preview.draft)} /> : null}
	</>;
}
