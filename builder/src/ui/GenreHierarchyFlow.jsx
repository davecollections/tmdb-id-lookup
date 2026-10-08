import { collectionViewModeLabel } from "../nuvio/collection-presentation.js";
import { HierarchyOutputSummary } from "./HierarchyOutputSummary.jsx";
import { creationContext } from "./creation-context.js";
import { nodeTitle } from "./node-titles.js";
import { RequiredNameInput, requiredNameMessage, onlyRequiredNameErrors, handleRequiredNameSubmit } from "./RequiredNameInput.jsx";
import { CreationStageIntro } from "./CreationStageIntro.jsx";
import { DiscoverFamilyAdvancedSummary } from "./DiscoverFamilyAdvancedOptions.jsx";
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
	genreCompositePlacementChoices,
	inspectGenreFolderPlan,
	officialGenreConcept,
	pruneGenreExclusionConfiguration,
	searchGenreConcepts,
} from "../source-add/index.js";
import { HierarchyCollectionPresentationControls } from "./CollectionPresentationChoices.jsx";
import { CreationHeader } from "./CreationHeader.jsx";
import { guidedCreateActionLabel, outputNoun } from "./creation-options.js";
import { ChoiceCards } from "./ChoiceCards.jsx";
import { GenreAdvancedOptions, GenreAdvancedSecondarySurface } from "./GenreAdvancedOptions.jsx";
import { GenreCatalogueList, genreMediaLabel, GenreSelectionToolbar } from "./GenreCatalogueSelector.jsx";
import { toggleGenreSelection } from "./GenreSourceFlow.jsx";
import { focusElementWithoutScroll } from "./hierarchy-menu-placement.js";
import { NestedPreviewDialog } from "./NestedPreviewDialog.jsx";
import { TitlePreviewResults } from "./TitlePreviewResults.jsx";
import { FolderShapeChoices, HiddenTitleFieldHelp, PresentationSwitch, TitleOptions } from "./PresentationControls.jsx";
import { RemovableSelectionSummary } from "./RemovableSelectionSummary.jsx";
import { SemanticSortChoices } from "./SemanticSortChoices.jsx";
import { SourcePreviewSelectors, SourcePreviewContent } from "./SourceTitlePreviewDialog.jsx";
import { sourcePreviewVariantGroups, sourcePreviewVariantKey, sourcePreviewContext } from "../source-add/source-title-preview.js";
import { SourceElsewhereNotice } from "./SourceElsewhereNotice.jsx";

const usePrePaintLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function selectionItems(genres) {
	return genres.map((concept) => ({ id: concept.name, label: concept.name, detail: genreMediaLabel(concept) }));
}

function SelectStep({ query, selection, genres, headingRef, onQueryChange, onClearSearch, onChoose, onSelectAll, onClearAll, onRemove }) {
	const concepts = searchGenreConcepts(query);
	return (
		<section className="genre-hierarchy-select genre-browse-step" aria-labelledby="genre-hierarchy-select-title">
			<CreationStageIntro step={1} phase="Select" title="Select Genres" headingId="genre-hierarchy-select-title" headingRef={headingRef} tabIndex={-1} />
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
	return (
		<NestedPreviewDialog ariaLabelledBy="genre-preview-title" backdropClassName="franchise-preview-backdrop studio-preview-backdrop genre-preview-backdrop" backdropProps={{ "data-genre-preview-backdrop": "true" }} dialogClassName="franchise-preview-modal studio-preview-modal genre-preview-modal source-sort-preview-modal" dialogRef={dialogRef} initialFocusRef={closeRef} onClose={onClose}>
			<header><div><p className="panel-kicker">Title preview</p><h3 id="genre-preview-title">{preview.group.concept.name}</h3></div><button ref={closeRef} type="button" onClick={onClose}>Close</button></header>
			<SourcePreviewContent>
				<SourcePreviewSelectors groups={sourcePreviewVariantGroups(preview.group.drafts, preview.draft, onChangeDraft)} />
				<p className="studio-preview-single-media">{sourcePreviewContext(preview.draft)}</p>
				{preview.status === "loading" ? <p className="studio-preview-state" role="status">Preparing {activeLabel.toLowerCase()} preview…</p> : null}
				{preview.status === "error" ? <div className="studio-preview-state add-source-request-state" role="alert"><p>{preview.error?.message ?? "This Genre preview could not be prepared."}</p><button type="button" onClick={onRetry}>Retry</button></div> : null}
				{preview.status === "ready" ? <TitlePreviewResults data={preview.data} className="franchise-preview-grid studio-preview-grid genre-preview-grid" ariaLabel={`${activeLabel} poster preview`} altPrefix={activeLabel} /> : null}
			</SourcePreviewContent>
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
	genres,
	sharedMediaChoice,
	sortOptionIds,
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
	const mediaNotice = fixedMediaNotice(genres, sharedMediaChoice);
	return (
		<section className="genre-hierarchy-configure" aria-labelledby="genre-hierarchy-configure-title">
			<CreationStageIntro step={2} phase="Configure" title="Configure Genres" headingId="genre-hierarchy-configure-title" headingRef={headingRef} tabIndex={-1} />
			<section className="genre-hierarchy-configuration-surface" aria-labelledby="genre-hierarchy-content-settings-title">
				<div><p className="panel-kicker">Shared content settings</p><h4 id="genre-hierarchy-content-settings-title">Configure every selected Genre</h4><p>These settings are applied to the configured Genre sources below.</p></div>
				{hasShared ? <div className="genre-hierarchy-configuration-control"><SemanticSortChoices options={GENRE_MEDIA_CHOICES} selectedId={sharedMediaChoice} name="genre-hierarchy-media" legend="Media" helper="Applies to Genres available in both Movies and Series." onChange={onSharedMediaChange} />{mediaNotice ? <p className="genre-fixed-media-note" role="status">{mediaNotice}</p> : null}</div> : null}
				<div className="genre-hierarchy-configuration-control"><SemanticSortChoices options={GENRE_SORT_OPTIONS} selectedIds={sortOptionIds} helper="Choose one or more options. Movies and Series get separate sources." name="genre-hierarchy-sort" validationMessageId="genre-hierarchy-sort-error" legend="Sources to create" onChange={onSortChange} /></div>
			</section>
			<GenreAdvancedOptions idPrefix="genre-hierarchy-advanced" value={advanced} includedGenres={genres} sharedMediaChoice={sharedMediaChoice} onChange={onAdvancedChange} onOpenSecondary={onOpenSecondary} />
			{built.errors.length ? <ul className="genre-advanced-errors" role="alert">{built.errors.map((error) => <li id={error.code === "INVALID_GENRE_SORT" ? "genre-hierarchy-sort-error" : undefined} key={`${error.code}-${error.path}-${error.message}`}>{error.message}</li>)}</ul> : null}
			<details className="genre-hierarchy-configured-genres">
				<summary><span className="filters-disclosure-label"><strong>Configured Genres · {genres.length}</strong><small>Preview or remove selected Genres.</small></span></summary>
				<div className="genre-advanced-content">
					{folderPlan.groups.length ? <div className="genre-hierarchy-configure-list">{folderPlan.groups.map((group) => <GenreConfigureRow key={group.concept.name} group={group} onPreview={onPreview} onRemove={onRemove} />)}</div> : <p className="studio-configure-empty">No valid Genres are currently configured.</p>}
				</div>
			</details>
			{folderPlan.partialGroups.length ? <p className="genre-attention-note">{folderPlan.partialGroups.length} partially matching Genre folder{folderPlan.partialGroups.length === 1 ? " is" : "s are"} omitted so a configured physical set is never created incompletely.</p> : null}
		</section>
	);
}

// These labelled examples explain choices; the existing plans alone own output and counts.
function genreStructureChoices(effectiveMedia) {
	const media = ["MOVIE", "TV"].filter((type) => effectiveMedia.has(type)).map(mediaLabel);
	const single = media.length === 1 ? media[0] : null;
	return [
		{
			id: "genre-folders", label: "By genre",
			description: single ? `Open a genre folder to browse its ${single}.` : "Open a genre folder, then choose Movies or Series where available.",
		},
		{
			id: "media-folders", label: "By media type",
			description: single ? `Open ${single}, then choose a genre.` : "Open Movies or Series, then choose a genre.",
		},
		{
			id: "separate-media-genre-folders", label: "By genre and media type",
			description: single ? `Include ${single} in each genre folder's name, such as Comedy ${single}.` : "Give Movies and Series separate genre folders, such as Comedy Movies and Comedy Series.",
		},
	];
}

function GenreExampleRail({ title, cards, opened }) {
	return <span className="genre-example-rail">
		<span className="genre-example-title">{title}</span>
		<span className="genre-example-cards">{cards.map((label) => <span className={label === opened ? "is-opened" : undefined} key={label}>{label}</span>)}</span>
	</span>;
}

function StructureExample({ structure, effectiveMedia }) {
	const media = ["MOVIE", "TV"].filter((type) => effectiveMedia.has(type)).map(mediaLabel);
	const byGenre = structure === "genre-folders";
	const byMedia = structure === "media-folders";
	const cards = byGenre ? ["Animation", "Comedy"] : byMedia ? media : media.map((label) => `Animation ${label}`);
	const opened = cards[0];
	const tabs = byGenre ? (media.length > 1 ? media : []) : byMedia ? ["Animation", "Comedy"] : [];
	return <span className="genre-structure-example" data-genre-example={structure} aria-hidden="true">
		{structure === "separate-media-collections" ? <span className="genre-example-home-groups">
			<span className="genre-example-home-context">Nuvio Home</span>
			<GenreExampleRail title="Movie Genres" cards={["Action", "Adventure", "Comedy"]} />
			<GenreExampleRail title="Series Genres" cards={["Action & Adventure", "Animation", "Comedy"]} />
		</span> : <span className="genre-example-scene">
			<GenreExampleRail title="Genres" cards={cards} opened={opened} />
			<span className="genre-example-open-arrow">→</span>
			<span className="source-layout-preview genre-example-page">
				<span className="genre-example-title">{opened}</span>
				{tabs.length ? <span className="source-layout-preview-tab-bar">{tabs.map((tab, index) => <span className={index === 0 ? "is-selected" : undefined} key={tab}>{tab}</span>)}</span> : null}
				<span className="source-layout-preview-poster-grid"><span /><span /><span /><span /><span /><span /></span>
			</span>
		</span>}
	</span>;
}

function StructureCollectionCount({ planResult }) {
	const counts = planResult?.ok ? planResult.plan.counts : null;
	return counts ? <span className="genre-structure-counts">{counts.collectionCount} collection{counts.collectionCount === 1 ? "" : "s"}</span> : null;
}

function CombinedSeriesPlacement({ compositeChoices, placements, storedPlacements, onChange }) {
	const customized = compositeChoices.some((entry) => placements[entry.genreName] !== "standalone");
	return <section className="genre-composite-placement" aria-labelledby="genre-composite-placement-title">
		<h4 id="genre-composite-placement-title">Combined Series genres</h4>
		<p className="genre-composite-helper">Some Series genres combine names that Movies lists separately. Keep each in its own folder, or add it to the selected Movie genre folders below.</p>
		<div className="genre-composite-current">
			<h5>Current placement</h5>
			<div className="genre-composite-current-summary">
				{customized ? <ul className="genre-composite-summary">{compositeChoices.map((entry) => <li key={entry.genreName}>{entry.genreName}: {placements[entry.genreName] === "standalone" ? "keeps its own folder" : `added to ${placements[entry.genreName] === "both" ? entry.availableTargets.join(" and ") : placements[entry.genreName]}`}.</li>)}</ul> : <p>Each keeps its own folder.</p>}
			</div>
		</div>
		{compositeChoices.map((entry) => {
			const stored = storedPlacements[entry.genreName] ?? "standalone";
			const fellBack = stored !== placements[entry.genreName];
			return entry.blockedMessage || fellBack ? <p className="genre-fixed-media-note" key={entry.genreName}>
				{entry.genreName}: {entry.blockedMessage} {fellBack ? "Your previous placement is unavailable. Keeping its own folder." : "Keep its own folder remains available."}
			</p> : null;
		})}
		<details className="genre-composite-details">
			<summary><span className="genre-composite-closed-label">Change placement</span><span className="genre-composite-open-label">Hide placement choices</span></summary>
			<div className="genre-composite-details-body">
				{compositeChoices.map((composite) => <div className="genre-composite-control" key={composite.genreName}>
					<SemanticSortChoices options={composite.choices} selectedId={placements[composite.genreName]} name={`genre-composite-${composite.genreName}`} legend={composite.genreName} onChange={(placement) => onChange(composite.genreName, placement)} />
				</div>)}
			</div>
		</details>
	</section>;
}

function StructureStep({ scope, destinationCollectionTitle, structurePlans, effectiveMedia, lastOneCollectionStructure, planResult, compositeChoices, effectiveCompositePlacements, options, headingRef, onStructureChange, onCollectionGroupingChange, onCompositeChange }) {
	const separate = options.structure === "separate-media-collections";
	const destinationName = nodeTitle(destinationCollectionTitle, "collection").accessibleName;
	const choices = genreStructureChoices(effectiveMedia)
		.filter((option) => structurePlans.has(option.id))
		.map((option) => ({ ...option, preview: <StructureExample structure={option.id} effectiveMedia={effectiveMedia} /> }));
	const togetherPlan = structurePlans.get(separate ? lastOneCollectionStructure : options.structure);
	const collectionChoices = [
		{ id: "together", label: "Together in one collection", description: "Keep Movies and Series together in one Nuvio collection.", preview: <StructureCollectionCount planResult={togetherPlan} /> },
		{ id: "separate-media-collections", label: "Separate collections", description: "Create one collection for Movie Genres and another for Series Genres.", preview: <StructureCollectionCount planResult={structurePlans.get("separate-media-collections")} /> },
	];
	return <section className="genre-hierarchy-structure" aria-labelledby="genre-hierarchy-structure-title">
		<CreationStageIntro step={3} phase="Structure" title="Structure" headingId="genre-hierarchy-structure-title" headingRef={headingRef} tabIndex={-1} />
		<p className="studio-configure-helper">Choose how your Genres appear in Nuvio.</p>
		{scope === "new-folder" ? <p className="genre-structure-destination">New folders will be added to “{destinationName}”.</p> : null}
		{structurePlans.has("separate-media-collections") ? <ChoiceCards legend="Keep Movies and Series together?" name="genre-hierarchy-collection-grouping" options={collectionChoices} selectedId={separate ? "separate-media-collections" : "together"} onChange={onCollectionGroupingChange} gridClassName="genre-collection-choice-grid" /> : null}
		{!separate ? <p className="genre-structure-example-note">Examples show Tabbed Grid. Choose your layout in Appearance.</p> : null}
		{!separate ? <ChoiceCards legend="How should folders be organised?" name="genre-hierarchy-structure" options={choices} selectedId={options.structure} onChange={onStructureChange} gridClassName="genre-structure-choice-grid" /> : null}
		{separate ? <StructureExample structure="separate-media-collections" effectiveMedia={effectiveMedia} /> : null}
		{options.structure === "genre-folders" && compositeChoices.length ? <CombinedSeriesPlacement compositeChoices={compositeChoices} placements={effectiveCompositePlacements} storedPlacements={options.compositePlacements} onChange={onCompositeChange} /> : null}
		{!planResult.ok ? <ul className="genre-advanced-errors">{(planResult.errors ?? []).map((error) => <li key={`${error.code}-${error.path}`}>{error.message}</li>)}</ul> : null}
	</section>;
}

function AppearanceStep({ scope, advancedUi, planResult, options, onOptionsChange, diagnostic, headingRef }) {
	// Draft controls must outlive plan validation so an invalid name remains editable.
	const plan = planResult.ok ? planResult.plan : null;
	const structure = options.structure;
	const mediaFolders = structure === "media-folders";
	const separateCollections = structure === "separate-media-collections";
	const namePaths = separateCollections ? ["$genreHierarchy.collectionTitles.movies", "$genreHierarchy.collectionTitles.series"] : ["$genreHierarchy.collectionTitle"];
	const otherErrors = (planResult.errors ?? []).filter((entry) => !namePaths.includes(entry.path));
	const folderTitleVisibility = mediaFolders ? null : {
		selectedId: plan?.configuration.folderTitleVisibility ?? (structure === "separate-media-genre-folders" && !options.folderTitleVisibilityTouched ? "SHOW_EVERYWHERE" : options.folderTitleVisibility),
		name: "genre-hierarchy-folder-title-visibility",
		onChange: (value) => onOptionsChange({ folderTitleVisibility: value, folderTitleVisibilityTouched: true }),
	};
	const omittedCount = (plan?.outcomes ?? []).filter((outcome) => [GENRE_HIERARCHY_PLACEMENT_STATUSES.ALREADY_IN_COLLECTION, GENRE_HIERARCHY_PLACEMENT_STATUSES.PARTLY_IN_COLLECTION].includes(outcome.status)).length;
	const elsewhereCount = (plan?.outcomes ?? []).filter((outcome) => outcome.status === GENRE_HIERARCHY_PLACEMENT_STATUSES.EXISTS_ELSEWHERE).length;
	return (
		<section className="genre-hierarchy-appearance" aria-labelledby="genre-hierarchy-appearance-title">
			<CreationStageIntro step={4} phase="Appearance" title="Appearance" headingId="genre-hierarchy-appearance-title" headingRef={headingRef} tabIndex={-1} />
   {plan ? <DiscoverFamilyAdvancedSummary legacy ui={advancedUi} value={plan.configuration.advanced} mediaMode={plan.configuration.sharedMediaChoice} /> : null}
			{plan ? <HierarchyOutputSummary counts={plan.counts} scope={plan.configuration.scope} /> : null}
			{omittedCount || elsewhereCount ? <p className="studio-configure-helper">{omittedCount ? `${omittedCount} destination match${omittedCount === 1 ? " is" : "es are"} omitted. ` : ""}{elsewhereCount ? `${elsewhereCount} elsewhere match${elsewhereCount === 1 ? " remains" : "es remain"} addable.` : ""}</p> : null}
			{scope === "new-collection" ? <>
				{separateCollections ? <>
					<div className="genre-collection-name-grid">{[["movies", "Movie collection name"], ["series", "Series collection name"]].map(([role, label]) => <div className="editor-field" key={role}><label htmlFor={`genre-hierarchy-collection-${role}`}>{label}</label><RequiredNameInput id={`genre-hierarchy-collection-${role}`} value={options.collectionTitles[role]} hidden={options.hideCollectionTitle} describedBy={options.hideCollectionTitle ? "genre-hierarchy-collection-titles-hidden-help" : undefined} error={requiredNameMessage(planResult?.errors, `$genreHierarchy.collectionTitles.${role}`, options.collectionTitles[role])} onChange={(event) => onOptionsChange({ collectionTitles: Object.freeze({ ...options.collectionTitles, [role]: event.target.value }) })} /></div>)}</div>
					<HiddenTitleFieldHelp id="genre-hierarchy-collection-titles-hidden-help" hidden={options.hideCollectionTitle} kind="collection" plural />
				</> : <div className="editor-field"><label htmlFor="genre-hierarchy-collection-name">Collection name</label><RequiredNameInput id="genre-hierarchy-collection-name" value={options.collectionTitle} hidden={options.hideCollectionTitle} describedBy={options.hideCollectionTitle ? "genre-hierarchy-collection-title-hidden-help" : undefined} error={requiredNameMessage(planResult?.errors, "$genreHierarchy.collectionTitle", options.collectionTitle)} onChange={(event) => onOptionsChange({ collectionTitle: event.target.value })} /><HiddenTitleFieldHelp id="genre-hierarchy-collection-title-hidden-help" hidden={options.hideCollectionTitle} kind="collection" /></div>}
				<TitleOptions idPrefix="genre-hierarchy" collectionTitleVisibility={{ checked: options.hideCollectionTitle, onChange: (hideCollectionTitle) => onOptionsChange({ hideCollectionTitle }), descriptionId: "genre-hierarchy-hide-collection-title-help", controlName: "genreHierarchyHideNuvioTitle" }} folderTitleVisibility={folderTitleVisibility} />
				{mediaFolders ? <p className="genre-fixed-media-note">Movies and Series folders use the safe folder fallback, so their titles remain visible.</p> : null}
				<fieldset className="editor-field editor-choice-field"><legend>Collection layout</legend><HierarchyCollectionPresentationControls selectedId={options.viewMode} name="genre-hierarchy-collection-layout" showAllTab={options.showAllTab} onPresentationChange={onOptionsChange} showAllDescriptionId="genre-hierarchy-all-tab-help" showAllControlName="genreHierarchyShowAllTab" /></fieldset>
				<PresentationSwitch label="Pin collection to top" description="Keeps this collection near the top of Nuvio." descriptionId="genre-hierarchy-pin-help" controlName="genreHierarchyPinToTop" checked={options.pinToTop} onChange={(pinToTop) => onOptionsChange({ pinToTop })} />
			</> : plan ? <>
				<div className="franchise-inherited-summary"><strong>Parent presentation is inherited</strong><span>{plan.destination.titleHidden ? "Hidden-title collection" : plan.destination.collectionTitle || "Untitled collection"} · {collectionViewModeLabel(plan.destination.viewMode) ?? "Imported layout"} · parent unchanged</span></div>
				<TitleOptions idPrefix="genre-hierarchy" folderTitleVisibility={folderTitleVisibility} />
				{mediaFolders ? <p className="genre-fixed-media-note">Movies and Series folders use the safe folder fallback, so their titles remain visible.</p> : null}
			</> : null}
			<fieldset className="editor-field editor-choice-field genre-hierarchy-artwork-shape" data-editor-field="folderTileShape"><legend>Folder tile shape</legend><FolderShapeChoices selectedId={options.folderTileShape} name="genre-hierarchy-folder-shape" idPrefix="genre-hierarchy-folder" onChange={(folderTileShape) => onOptionsChange({ folderTileShape })} /></fieldset>
			<p className="decades-defaults-note" data-genre-hierarchy-artwork-rule={options.folderTileShape.toLowerCase()}>{mediaFolders ? `The ${options.folderTileShape === "POSTER" ? "Poster" : options.folderTileShape === "SQUARE" ? "Square" : "Landscape"} shape applies to the safe Movies/Series folder fallback. No Genre artwork is assigned to media folders.` : `The selected ${options.folderTileShape.toLowerCase()} published Genre artwork is applied to every generated Genre folder. Missing artwork safely falls back without borrowing the other orientation.`}</p>
			{!plan && (otherErrors.length > 0 || !planResult?.errors?.length) ? <div className="editor-diagnostics" role="alert"><p>{otherErrors[0]?.message ?? "The Genre hierarchy plan could not be prepared."}</p></div> : null}
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
	const [sortOptionIds, setSortOptionIds] = useState([DEFAULT_GENRE_SORT_OPTION_ID]);
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
	const [lastOneCollectionStructure, setLastOneCollectionStructure] = useState(DEFAULT_GENRE_HIERARCHY_STRUCTURE);
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
	const built = useMemo(() => buildGenreSourceDrafts(genres, { sharedMediaChoice, sortOptionIds, advanced, titleMode: GENRE_SOURCE_TITLE_MODES.HIERARCHY }), [advanced, genres, sharedMediaChoice, sortOptionIds]);
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
	const effectiveMedia = useMemo(() => new Set(built.ok ? built.drafts.map((draft) => draft.editable.mediaType) : []), [built]);
	const structurePlans = useMemo(() => {
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
				sortOptionIds,
				advanced,
			}));
		}
		return plans;
	}, [advanced, destinationCollectionInternalId, effectiveCompositePlacements, effectiveMedia, options, project, projectRevision, scope, selection, sharedMediaChoice, sortOptionIds]);
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

	function chooseStructure(structure) {
		if (!structurePlans.has(structure)) return;
		if (structure !== "separate-media-collections") setLastOneCollectionStructure(structure);
		updateOptions({ structure });
	}

	function chooseCollectionGrouping(grouping) {
		chooseStructure(grouping === "separate-media-collections" ? grouping
			: structurePlans.has(lastOneCollectionStructure) ? lastOneCollectionStructure : DEFAULT_GENRE_HIERARCHY_STRUCTURE);
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
			setKnownPreviewCounts((current) => Object.freeze({ ...current, [sourcePreviewVariantKey(draft)]: outcome.result.data.totalResults }));
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
			if ((!planResult.ok && !nameCorrection) || planResult.plan?.counts.folderCount === 0) return;
			scrollByStepRef.current.configure = scrollRef.current?.scrollTop ?? 0;
			setStep("structure");
			return;
		}
		if (step === "structure") {
			if ((!planResult.ok && !nameCorrection) || planResult.plan?.counts.folderCount === 0) return;
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
	const nameCorrection = !isApplying && onlyRequiredNameErrors(planResult, ["$genreHierarchy.collectionTitle", "$genreHierarchy.collectionTitles.movies", "$genreHierarchy.collectionTitles.series"]);
	const primaryLabel = step === "select"
		? "Continue to Configure"
		: step === "configure"
			? (planResult.ok && planResult.plan.counts.folderCount > 0 || nameCorrection) ? "Continue to Structure" : "No Genre folders ready"
			: step === "structure"
				? (planResult.ok && planResult.plan.counts.folderCount > 0 || nameCorrection) ? "Continue to Appearance" : "No Genre folders ready"
				: isApplying ? "Creating…" : guidedCreateActionLabel(scope, planResult?.plan?.counts);
	return <>
		<CreationHeader title="Create with Genres" context={creationContext(scope, destinationCollectionTitle)} description={step === "select" ? "Select official TMDB Genres in folder order." : step === "configure" ? "Choose your media, sources and any filters, then continue." : step === "structure" ? "Arrange your collections and folders." : "Choose how your collections and folders will appear in Nuvio."} onBack={goBack} backAction={step === "select" ? "back-to-creation-launcher" : step === "configure" ? "back-to-genre-hierarchy-selection" : step === "structure" ? "back-to-genre-hierarchy-configuration" : "back-to-genre-hierarchy-structure"} backDisabled={isApplying} inactive={Boolean(secondarySurface || preview)} onClose={onCancel} />
		<form className="add-source-form genre-hierarchy-form" data-genre-hierarchy-stage={step} data-secondary-surface={secondarySurface ?? undefined} onSubmitCapture={handleRequiredNameSubmit} onSubmit={submit} noValidate onKeyDown={(event) => { if (secondarySurface && event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeSecondary(); } }}>
			<div ref={scrollRef} className="add-source-scroll" inert={secondarySurface || preview || undefined} aria-hidden={secondarySurface || preview ? "true" : undefined}>
				{step === "select" ? <SelectStep query={query} selection={selection} genres={genres} headingRef={selectHeadingRef} onQueryChange={(event) => setQuery(event.target.value)} onClearSearch={() => setQuery("")} onChoose={chooseGenre} onSelectAll={() => { const names = GENRE_CONCEPTS.map((concept) => concept.name); setSelection(names); setAdvanced((current) => pruneGenreExclusionConfiguration(current, names)); setKnownPreviewCounts({}); setDiagnostic(null); }} onClearAll={() => { setSelection([]); setAdvanced((current) => pruneGenreExclusionConfiguration(current, [])); setKnownPreviewCounts({}); setDiagnostic(null); }} onRemove={chooseGenre} /> : step === "configure" ? <ConfigureStep genres={genres} sharedMediaChoice={sharedMediaChoice} sortOptionIds={sortOptionIds} advanced={advanced} built={built} folderPlan={folderPlan} headingRef={configureHeadingRef} onRemove={chooseGenre} onPreview={openPreview} onSharedMediaChange={(value) => { setSharedMediaChoice(value); setKnownPreviewCounts({}); setDiagnostic(null); }} onSortChange={(value) => { setSortOptionIds(value); setKnownPreviewCounts({}); setDiagnostic(null); }} onAdvancedChange={(value) => { setAdvanced(value); setKnownPreviewCounts({}); setDiagnostic(null); }} onOpenSecondary={openSecondary} /> : step === "structure" ? <StructureStep scope={scope} destinationCollectionTitle={destinationCollectionTitle} structurePlans={structurePlans} effectiveMedia={effectiveMedia} lastOneCollectionStructure={lastOneCollectionStructure} planResult={planResult} compositeChoices={compositeChoices} effectiveCompositePlacements={effectiveCompositePlacements} options={options} headingRef={structureHeadingRef} onStructureChange={chooseStructure} onCollectionGroupingChange={chooseCollectionGrouping} onCompositeChange={(genreName, placement) => updateOptions({ compositePlacements: Object.freeze({ ...options.compositePlacements, [genreName]: placement }) })} /> : <AppearanceStep scope={scope} advancedUi={advanced.ui} planResult={planResult} options={options} onOptionsChange={updateOptions} diagnostic={diagnostic} headingRef={appearanceHeadingRef} />}
			</div>
			{secondarySurface ? <div className="genre-secondary-surface" data-surface={secondarySurface}><GenreAdvancedSecondarySurface surface={secondarySurface} value={advanced} includedGenres={genres} sharedMediaChoice={sharedMediaChoice} onChange={(value) => { setAdvanced(value); setKnownPreviewCounts({}); setDiagnostic(null); }} onDone={closeSecondary} focusRef={secondaryHeadingRef} /></div> : null}
			{!secondarySurface ? <footer className="add-source-actions"><button className="editor-apply" type="submit" disabled={primaryDisabled && !nameCorrection}>{primaryLabel}</button></footer> : null}
		</form>
		{preview ? <GenreTitlePreview preview={preview} knownPreviewCounts={knownPreviewCounts} onChangeDraft={(draft) => { if (draft !== preview.draft) requestPreview(preview.group, draft); }} onClose={closePreview} onRetry={() => requestPreview(preview.group, preview.draft)} /> : null}
	</>;
}
