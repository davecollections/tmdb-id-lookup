import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { isValidVisibleNuvioTitle, reversibleTitleFieldProps } from "../nuvio/titles.js";
import {
	browseStreamingProviders,
	browseStreamingRegions,
	buildStreamingSourceDrafts,
	createAsyncRequestCoordinator,
	createStreamingHierarchyPlan,
	createStreamingSelectionState,
	DEFAULT_STREAMING_HIERARCHY_FOLDER_TITLE_VISIBILITY,
	DEFAULT_STREAMING_HIERARCHY_GROUPING_MODE,
	DEFAULT_STREAMING_SORT_OPTION_ID,
	INITIAL_ASYNC_REQUEST_STATE,
	inspectStreamingHierarchyDestinationCandidates,
	reconcileStreamingSelection,
	removeSelectedStreamingProvider,
	searchStreamingProviders,
	selectedStreamingProviders,
	STREAMING_HIERARCHY_GROUPING_MODES,
	STREAMING_HIERARCHY_PLACEMENT_STATUSES,
	STREAMING_MEDIA_CHOICES,
	STREAMING_PROVIDER_BROWSE_MODES,
	STREAMING_REGION_BROWSE_MODES,
	STREAMING_SORT_OPTIONS,
	STREAMING_SOURCE_NAME_CONTEXTS,
	streamingProviderCommonAvailability,
	streamingSelectionNotice,
	toggleSelectedStreamingProvider,
} from "../source-add/index.js";
import { HierarchyCollectionPresentationControls } from "./CollectionPresentationChoices.jsx";
import { CreationHeader } from "./CreationHeader.jsx";
import { focusElementWithoutScroll } from "./hierarchy-menu-placement.js";
import { NestedPreviewDialog } from "./NestedPreviewDialog.jsx";
import { PosterOnlyPreviewGrid } from "./PosterOnlyPreviewGrid.jsx";
import { HiddenTitleFieldHelp, PresentationSwitch, TitleOptions } from "./PresentationControls.jsx";
import { SemanticSortChoices } from "./SemanticSortChoices.jsx";
import { SourceElsewhereNotice } from "./SourceElsewhereNotice.jsx";
import { StreamingRegionStep, toggleStreamingRegionSelection } from "./StreamingSourceFlow.jsx";
import { TmdbEntityLogo } from "./TmdbEntityLogo.jsx";

const usePrePaintLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function scopeLabel(scope) {
	return scope === "new-folder" ? "New Folder" : "New Collection";
}

function mediaTypesForChoice(mediaChoice) {
	if (mediaChoice === "series") return ["TV"];
	if (mediaChoice === "both") return ["MOVIE", "TV"];
	return ["MOVIE"];
}

function mediaChoiceForType(mediaType) {
	return mediaType === "TV" ? "series" : "movies";
}

function mediaLabel(mediaType) {
	return mediaType === "TV" ? "Series" : "Movies";
}

function SelectedProviders({ providers, onRemove = null, disclosureLabel = "View selected Streaming services" }) {
	const removable = typeof onRemove === "function";
	return (
		<details className="genre-selected-disclosure removable-selection-disclosure studio-selected-disclosure streaming-selected-disclosure">
			<summary>{disclosureLabel}</summary>
			<ul>{providers.map((provider) => <li key={provider.id}><div><strong>{provider.name}</strong><span>TMDB {provider.id}</span></div>{removable ? <span className="studio-selected-actions"><button className="studio-selected-remove" type="button" aria-label={`Remove ${provider.name}`} onClick={() => onRemove(provider.id)}>×</button></span> : null}</li>)}</ul>
		</details>
	);
}

function mediaChoiceLabel(mediaChoice) {
	if (mediaChoice === "series") return "Series";
	if (mediaChoice === "both") return "Movies + Series";
	return "Movies";
}

function regionLabel(region) {
	return `${region.name} (${region.code})`;
}

function RegionRunValue({ regions }) {
	if (regions.length <= 3) return <span>{regions.map(regionLabel).join(", ")}</span>;
	return <details className="streaming-run-disclosure"><summary>{regions.length} regions selected</summary><ul>{regions.map((region) => <li key={region.code}>{regionLabel(region)}</li>)}</ul></details>;
}

export function StreamingRunSummary({ regions, mediaChoice, providers = null, sortOptionId = null, groupingMode = null, review = false }) {
	const sort = STREAMING_SORT_OPTIONS.find((option) => option.id === sortOptionId);
	const grouping = STREAMING_HIERARCHY_GROUPING_MODES.find((option) => option.id === groupingMode);
	return (
		<section className="decades-review-configuration streaming-run-summary" aria-label={review ? "Streaming configuration summary" : "Streaming run context"}>
			<div><strong>Regions</strong><RegionRunValue regions={regions} /></div>
			<div><strong>Media</strong><span>{mediaChoiceLabel(mediaChoice)}</span></div>
			{providers ? <div><strong>Services</strong>{providers.length <= 5 ? <span>{providers.map((provider) => provider.name).join(", ")}</span> : <><span>{providers.length} services selected</span><SelectedProviders providers={providers} disclosureLabel="View selected services" /></>}</div> : null}
			{sort ? <div><strong>Sort</strong><span>{sort.label}</span></div> : null}
			{grouping ? <div><strong>Grouping</strong><span>{grouping.label}</span></div> : null}
		</section>
	);
}

function SelectableProviderResult({ provider, regionCodes, checked, onToggle }) {
	const availability = streamingProviderCommonAvailability(provider, regionCodes);
	const media = [availability.movies ? "Movies" : null, availability.series ? "Series" : null].filter(Boolean).join(" · ");
	return (
		<label className={`add-source-result studio-result studio-result-selectable streaming-provider-result streaming-provider-selectable${checked ? " is-selected" : ""}`} data-streaming-provider={provider.id}>
			<input className="visually-hidden selectable-card-checkbox" type="checkbox" checked={checked} onChange={() => onToggle(provider)} />
			<span className="selectable-card-indicator" data-selection-indicator="true" data-selection-state={checked ? "selected" : "unselected"} aria-hidden="true">{checked ? "✓" : ""}</span>
			<TmdbEntityLogo entity={provider} entityType="streaming-provider" context="result" />
			<span className="add-source-result-content"><span className="add-source-result-heading"><strong>{provider.name}</strong><span>TMDB {provider.id}</span></span><span className="studio-result-metadata">{media}</span></span>
		</label>
	);
}

function ProviderSelectionStep({
	regions,
	mediaChoice,
	providers,
	selection,
	query,
	browseMode,
	onMediaChange,
	onQueryChange,
	onBrowseModeChange,
	onToggle,
	onRemove,
	headingRef,
}) {
	const chosen = selectedStreamingProviders(selection);
	const notice = streamingSelectionNotice(selection);
	const singleRegion = regions.length === 1;
	const searching = Boolean(query.trim());
	return (
		<section className="streaming-hierarchy-select" aria-labelledby="streaming-hierarchy-services-title">
			<div className="add-source-section-heading"><div><p className="panel-kicker">Step 1 · Choose</p><h3 id="streaming-hierarchy-services-title" ref={headingRef} tabIndex={-1}>Choose Streaming services</h3></div></div>
			<p className="studio-configure-helper">Providers must support the selected media in every selected region.</p>
			<SemanticSortChoices options={STREAMING_MEDIA_CHOICES.map((choice) => ({ ...choice, description: choice.id === "both" ? "Create Movies and Series sources for every region." : `Create ${choice.label} sources for every region.` }))} selectedId={mediaChoice} name="streaming-hierarchy-media" legend="Media" onChange={onMediaChange} />
			{chosen.length ? <section className="people-selected-tray studio-selected-tray streaming-selected-tray"><div className="people-selected-summary"><strong>{chosen.length} service{chosen.length === 1 ? "" : "s"} selected</strong><SelectedProviders providers={chosen} onRemove={onRemove} /></div>{notice.visible ? <p className="people-selection-limit" data-large-selection-notice="true" role="status">You’ve selected {notice.count} services. Review may take a little longer, but there is no selection cap.</p> : null}</section> : null}
			<div className="editor-field add-source-query-field"><label htmlFor="streaming-hierarchy-provider-query">Search providers</label><input id="streaming-hierarchy-provider-query" type="search" value={query} autoComplete="off" spellCheck="false" onChange={onQueryChange} /><p className="editor-field-help">Search eligible providers by name or exact numeric TMDB provider ID.</p></div>
			{singleRegion ? <div className="studio-search-controls streaming-provider-browse" aria-label="Provider browse mode"><button type="button" aria-pressed={browseMode === STREAMING_PROVIDER_BROWSE_MODES.TOP} onClick={() => onBrowseModeChange(STREAMING_PROVIDER_BROWSE_MODES.TOP)}>Top providers</button><button type="button" aria-pressed={browseMode === STREAMING_PROVIDER_BROWSE_MODES.ALL} onClick={() => onBrowseModeChange(STREAMING_PROVIDER_BROWSE_MODES.ALL)}>A–Z</button></div> : null}
			<section className="add-source-results" aria-labelledby="streaming-hierarchy-provider-results-title"><div className="add-source-section-heading"><div><p className="panel-kicker">{searching ? "Search results" : singleRegion && browseMode === STREAMING_PROVIDER_BROWSE_MODES.TOP ? "TMDB region order" : "Eligible providers A–Z"}</p><h4 id="streaming-hierarchy-provider-results-title">Select providers</h4></div><span>{providers.length}</span></div>{providers.length ? <div className="add-source-result-list">{providers.map((provider) => <SelectableProviderResult key={provider.id} provider={provider} regionCodes={regions.map((region) => region.code)} checked={Boolean(selection.byId[provider.id])} onToggle={onToggle} />)}</div> : <p className="add-source-empty-results">No provider matches this search and availability intersection.</p>}</section>
		</section>
	);
}

function StreamingTitlePreview({ preview, regions, mediaTypes, onChangeRegion, onChangeMedia, onClose, onRetry }) {
	const dialogRef = useRef(null);
	const closeRef = useRef(null);
	const activeRegion = regions.find((region) => region.code === preview.regionCode) ?? regions[0];
	const activeMedia = mediaLabel(preview.mediaType);
	return (
		<NestedPreviewDialog ariaLabelledBy="streaming-hierarchy-preview-title" backdropClassName="franchise-preview-backdrop studio-preview-backdrop streaming-hierarchy-preview-backdrop" backdropProps={{ "data-streaming-hierarchy-preview-backdrop": "true" }} dialogClassName="franchise-preview-modal studio-preview-modal streaming-hierarchy-preview-modal" dialogRef={dialogRef} initialFocusRef={closeRef} onClose={onClose}>
			<header><div><p className="panel-kicker">Title preview</p><h3 id="streaming-hierarchy-preview-title">{preview.provider.name}</h3></div><button ref={closeRef} type="button" onClick={onClose}>Close</button></header>
			{regions.length > 1 ? <div className="studio-preview-tabs streaming-preview-region-tabs" role="tablist" aria-label="Preview region">{regions.map((region) => <button key={region.code} type="button" role="tab" aria-selected={region.code === preview.regionCode} onClick={() => onChangeRegion(region.code)}>{region.code}</button>)}</div> : <p className="studio-preview-single-media">{activeRegion.name} · {activeRegion.code}</p>}
			{mediaTypes.length > 1 ? <div className="studio-preview-tabs streaming-preview-media-tabs" role="tablist" aria-label="Preview media">{mediaTypes.map((mediaType) => <button key={mediaType} type="button" role="tab" aria-selected={mediaType === preview.mediaType} onClick={() => onChangeMedia(mediaType)}>{mediaLabel(mediaType)}</button>)}</div> : <p className="studio-preview-single-media">{activeMedia}</p>}
			{preview.status === "loading" ? <p className="studio-preview-state" role="status">Preparing {activeMedia.toLowerCase()} preview for {activeRegion.code}…</p> : null}
			{preview.status === "error" ? <div className="studio-preview-state add-source-request-state" role="alert"><p>{preview.error?.message ?? "This Streaming preview could not be prepared."}</p><button type="button" onClick={onRetry}>Retry</button></div> : null}
			{preview.status === "ready" ? <PosterOnlyPreviewGrid items={preview.data?.results ?? []} limit={10} className="franchise-preview-grid studio-preview-grid streaming-hierarchy-preview-grid" ariaLabel={`${preview.provider.name} ${activeMedia} ${activeRegion.code} poster preview`} altPrefix={activeMedia} /> : null}
		</NestedPreviewDialog>
	);
}

function ConfigureStep({ providers, regions, mediaChoice, sortOptionId, groupingMode, onSortChange, onGroupingChange, onPreview, onRemove, headingRef }) {
	return (
		<section className="studio-hierarchy-configure streaming-hierarchy-configure" aria-labelledby="streaming-hierarchy-configure-title">
			<div className="add-source-section-heading"><div><p className="panel-kicker">Step 2</p><h3 id="streaming-hierarchy-configure-title" ref={headingRef} tabIndex={-1}>Configure Streaming services</h3></div></div>
			<p className="studio-configure-helper">These choices apply to every selected service and region.</p>
			<StreamingRunSummary regions={regions} mediaChoice={mediaChoice} />
			<SemanticSortChoices options={STREAMING_SORT_OPTIONS} selectedId={sortOptionId} name="streaming-hierarchy-sort" legend="Sort" onChange={onSortChange} />
			{regions.length > 1 ? <SemanticSortChoices options={STREAMING_HIERARCHY_GROUPING_MODES} selectedId={groupingMode} name="streaming-hierarchy-grouping" legend="Folder grouping" onChange={onGroupingChange} /> : null}
			<section className="studio-configure-selected streaming-configure-selected" aria-labelledby="streaming-configure-selected-title"><div className="add-source-section-heading"><div><h4 id="streaming-configure-selected-title">Selected services · {providers.length}</h4></div></div><div className="studio-configure-list streaming-configure-list">{providers.map((provider) => <article key={provider.id} className="studio-configure-row streaming-configure-row" data-streaming-provider={provider.id}><div className="studio-configure-row-main"><TmdbEntityLogo entity={provider} entityType="streaming-provider" context="result" /><div className="studio-configure-row-copy"><strong>{provider.name}</strong><span>{regions.map((region) => region.code).join(" · ")} · {mediaChoiceLabel(mediaChoice)}</span><small>TMDB {provider.id}</small></div><div className="studio-configure-row-actions"><button type="button" aria-haspopup="dialog" aria-label={`Preview titles for ${provider.name}`} onClick={(event) => onPreview(provider, event.currentTarget)}>Preview titles</button><button className="studio-configure-remove" type="button" aria-label={`Remove ${provider.name}`} onClick={() => onRemove(provider.id)}>×</button></div></div></article>)}</div></section>
		</section>
	);
}

function sourceCountLabel(count, verb) {
	return `${count} source${count === 1 ? "" : "s"} ${verb}`;
}

function collectionBaseDisplayLabel(collection) {
	const title = collection?.editable?.title;
	return isValidVisibleNuvioTitle(title) ? title.trim() : "Hidden collection";
}

export function buildStreamingCollectionDisplayContext(project) {
	const collections = Array.isArray(project?.collections) ? project.collections : [];
	const baseLabels = collections.map(collectionBaseDisplayLabel);
	const titleCounts = new Map();
	for (const label of baseLabels) titleCounts.set(label, (titleCounts.get(label) ?? 0) + 1);
	const titleOrdinals = new Map();
	const context = Object.create(null);
	for (const [projectIndex, collection] of collections.entries()) {
		const baseLabel = baseLabels[projectIndex];
		const duplicateTitle = titleCounts.get(baseLabel) > 1;
		const ordinal = (titleOrdinals.get(baseLabel) ?? 0) + 1;
		titleOrdinals.set(baseLabel, ordinal);
		const folders = Array.isArray(collection?.folders) ? collection.folders : [];
		context[collection.internalId] = Object.freeze({
			label: duplicateTitle ? `${baseLabel} · Collection ${ordinal}` : baseLabel,
			baseLabel,
			duplicateTitle,
			folderCount: folders.length,
			sourceCount: folders.reduce((count, folder) => count + (Array.isArray(folder?.sources) ? folder.sources.length : 0), 0),
			projectIndex,
		});
	}
	return Object.freeze(context);
}

function collectionDisplayForCandidate(candidate, collectionDisplayContext) {
	return collectionDisplayContext?.[candidate.collectionInternalId] ?? Object.freeze({
		label: candidate.titleHidden || !isValidVisibleNuvioTitle(candidate.collectionTitle) ? "Hidden collection" : candidate.collectionTitle.trim(),
		baseLabel: candidate.collectionTitle,
		duplicateTitle: false,
		folderCount: null,
		sourceCount: null,
	});
}

function occurrencesWithCollectionDisplayLabels(occurrences, collectionDisplayContext) {
	return (occurrences ?? []).map((occurrence) => {
		const label = collectionDisplayContext?.[occurrence.collectionInternalId]?.label;
		return label && label !== occurrence.collectionTitle ? Object.freeze({ ...occurrence, collectionTitle: label }) : occurrence;
	});
}

function collectionContentsSummary(display, always = false) {
	if ((!display?.duplicateTitle && !always) || !Number.isSafeInteger(display.folderCount) || !Number.isSafeInteger(display.sourceCount)) return null;
	return `Currently: ${display.folderCount} folder${display.folderCount === 1 ? "" : "s"} · ${display.sourceCount} source${display.sourceCount === 1 ? "" : "s"}`;
}

function PlacementReviewRow({ outcome, collectionDisplayContext }) {
	const completeCount = outcome.sources?.filter((source) => source.status === "complete").length ?? 0;
	const missingCount = outcome.sources?.filter((source) => source.status === "missing").length ?? 0;
	const existing = outcome.status !== STREAMING_HIERARCHY_PLACEMENT_STATUSES.NEW_FOLDER;
	const title = existing ? outcome.folderTitle || outcome.provider.name : outcome.plannedFolderTitle || outcome.generatedTitle;
	let helper;
	if (outcome.status === STREAMING_HIERARCHY_PLACEMENT_STATUSES.NEW_FOLDER) helper = sourceCountLabel(missingCount, "will be created");
	else if (outcome.status === STREAMING_HIERARCHY_PLACEMENT_STATUSES.EXTEND_FOLDER) helper = `${sourceCountLabel(completeCount, "already exist")} · ${sourceCountLabel(missingCount, "will be added")}`;
	else if (outcome.status === STREAMING_HIERARCHY_PLACEMENT_STATUSES.COMPLETE) helper = `${sourceCountLabel(completeCount, "already exist")} · No changes`;
	else if (outcome.status === STREAMING_HIERARCHY_PLACEMENT_STATUSES.SORT_CONFLICT) helper = "A different Sort is already configured here. No changes can be applied.";
	else helper = "Mixed or ambiguous Streaming evidence prevents automatic changes.";
	return (
		<article className="studio-configure-row streaming-review-row" data-placement-status={outcome.status}>
			<div className="studio-configure-row-main streaming-review-row-main">
				<div className="studio-configure-row-copy"><strong>{title}</strong>{title !== outcome.provider.name ? <small>{outcome.provider.name}{outcome.region ? ` · ${outcome.region.code}` : ""}</small> : null}<span className="streaming-placement-kind">{existing ? "Existing folder" : "New folder"}</span><small className="streaming-placement-helper">{helper}</small></div>
			</div>
			{outcome.sources?.some((source) => source.elsewhere.length) ? <details className="studio-configure-locations"><summary>View matches elsewhere</summary><SourceElsewhereNotice occurrences={occurrencesWithCollectionDisplayLabels(outcome.sources.flatMap((source) => source.elsewhere), collectionDisplayContext)} heading="These exact sources exist elsewhere" action="They stay there; choosing this destination does not move them." /></details> : null}
		</article>
	);
}

export function NewCollectionElsewhereEvidence({ evidence, choicePending = false, collectionDisplayContext = null }) {
	if (!evidence || evidence.overlap === "none") return null;
	const complete = evidence.overlap === "complete";
	return (
		<section className={`streaming-new-collection-overlap${complete ? " is-complete" : ""}`} data-streaming-overlap={evidence.overlap} role={complete ? "alert" : "status"}>
			<strong>{complete ? "All selected sources already exist elsewhere" : "Some selected sources already exist elsewhere"}</strong>
			<p>{evidence.matchedSourceCount} of {evidence.proposedSourceCount} selected sources already exist in another folder or collection.</p>
			<details className="streaming-overlap-details"><summary>View matching services and locations</summary><div>{evidence.providerMatches.map((match) => <section key={match.provider.id}><p><strong>{match.provider.name}</strong> · {match.sources.map((source) => source.title).join(", ")}</p><SourceElsewhereNotice occurrences={occurrencesWithCollectionDisplayLabels(match.occurrences, collectionDisplayContext)} heading={`${match.matchedSourceCount} matching source${match.matchedSourceCount === 1 ? "" : "s"}`} action={choicePending ? "Choose an existing collection or create a new one instead." : "You can still create a separate collection."} /></section>)}</div></details>
			{choicePending ? <p>Choose where these Streaming sources should go.</p> : complete ? <p>Creating a separate collection still requires confirmation because all selected sources are duplicates.</p> : <p>Creating a new collection will add all {evidence.proposedSourceCount} selected sources.</p>}
		</section>
	);
}

export function StreamingDestinationChooser({ candidates, selectedDestination, elsewhereEvidence, collectionDisplayContext = null, onChange }) {
	if (!candidates.length) return null;
	return (
		<section className="streaming-destination-choice" aria-labelledby="streaming-destination-choice-title">
			<div><h4 id="streaming-destination-choice-title">Where should this go?</h4><p>Choose an existing collection to add only what is missing, or create a new collection instead.</p></div>
			<fieldset><legend className="visually-hidden">Streaming hierarchy destination</legend><div className="streaming-destination-list">
				{candidates.map((candidate) => {
					const selected = selectedDestination === candidate.collectionInternalId;
					const display = collectionDisplayForCandidate(candidate, collectionDisplayContext);
					const affinityOnly = candidate.streamingAffinity && candidate.matchingSourceCount === 0;
					const contents = collectionContentsSummary(display, affinityOnly);
					const sourceCountToAdd = candidate.plan?.counts?.newSourceCount ?? Math.max(0, candidate.proposedSourceCount - candidate.matchingSourceCount);
					const helper = candidate.complete
						? `All ${candidate.proposedSourceCount} selected sources already exist here · nothing to add`
						: candidate.conflictCount > 0
							? `${candidate.matchingSourceCount} of ${candidate.proposedSourceCount} sources already here · changes are blocked by a Streaming Sort conflict`
							: affinityOnly
								? `None of the selected sources are here yet · all ${sourceCountToAdd} source${sourceCountToAdd === 1 ? "" : "s"} will be added`
								: `${candidate.matchingSourceCount} of ${candidate.proposedSourceCount} sources already here · ${sourceCountToAdd} will be added`;
					return <label key={candidate.collectionInternalId} data-selected={selected ? "true" : undefined} data-streaming-destination-candidate={candidate.collectionInternalId}><input type="radio" name="streaming-hierarchy-destination" value={`existing:${candidate.collectionInternalId}`} checked={selected} onChange={() => onChange(candidate.collectionInternalId)} /><span><strong>{display.label}</strong>{affinityOnly ? <span className="streaming-destination-affinity">Existing Streaming collection</span> : null}<small>{helper}</small>{contents ? <span className="streaming-destination-contents">{contents}</span> : null}</span></label>;
				})}
				<label data-selected={selectedDestination === "new" ? "true" : undefined} data-streaming-destination-new="true"><input type="radio" name="streaming-hierarchy-destination" value="new" checked={selectedDestination === "new"} onChange={() => onChange("new")} /><span><strong>Create new collection instead</strong><small>{elsewhereEvidence?.proposedSourceCount ?? candidates[0].proposedSourceCount} selected sources</small><span>Create all {elsewhereEvidence?.proposedSourceCount ?? candidates[0].proposedSourceCount} sources in a separate collection.</span></span></label>
			</div></fieldset>
		</section>
	);
}

function FolderNameEditor({ folders, drafts, errors, hiddenEverywhere, onChange, onUseDefault }) {
	if (!folders.length) return null;
	return (
		<details className="streaming-folder-names" data-streaming-folder-name-count={folders.length}>
			<summary>Folder names · {folders.length}</summary>
			<p className="studio-configure-helper">Keep the generated names or customise new folders.</p>
			<div className="streaming-folder-name-list">{folders.map((folder) => {
				const inputId = `streaming-folder-name-${folder.key.replaceAll("|", "-")}`;
				const custom = Object.hasOwn(drafts, folder.key);
				const value = custom ? drafts[folder.key] : folder.generatedTitle;
				const error = errors.get(folder.key);
				return <div className="editor-field streaming-folder-name-field" key={folder.key}><label htmlFor={inputId}>{folder.generatedTitle}</label><input id={inputId} type="text" {...reversibleTitleFieldProps(value, hiddenEverywhere)} aria-invalid={error ? "true" : undefined} aria-describedby={[`${inputId}-error`, hiddenEverywhere ? "streaming-folder-titles-hidden-help" : null].filter(Boolean).join(" ")} onChange={(event) => onChange(folder.key, event.target.value)} />{custom ? <div><button type="button" onClick={() => onUseDefault(folder.key)}>Use default name</button></div> : null}<p className="editor-field-error" id={`${inputId}-error`}>{error?.message ?? ""}</p></div>;
			})}</div>
			<HiddenTitleFieldHelp id="streaming-folder-titles-hidden-help" hidden={hiddenEverywhere} kind="folder" plural={folders.length > 1} />
		</details>
	);
}

function StreamingDuplicateCollectionConfirmation({ isApplying, onCancel, onContinue }) {
	const cancelRef = useRef(null);
	return (
		<NestedPreviewDialog ariaLabelledBy="streaming-duplicate-confirmation-title" backdropClassName="delete-modal-backdrop streaming-duplicate-confirmation-backdrop" backdropProps={{ "data-streaming-duplicate-confirmation-backdrop": "true", "data-backdrop-dismiss": "false", onMouseDown(event) { if (event.target === event.currentTarget) event.preventDefault(); } }} dialogClassName="delete-confirmation streaming-duplicate-confirmation" dialogProps={{ "aria-describedby": "streaming-duplicate-confirmation-description" }} initialFocusRef={cancelRef} onClose={onCancel}>
			<div className="delete-confirmation-heading"><p className="panel-kicker">Duplicate sources</p><h2 id="streaming-duplicate-confirmation-title">Create another collection?</h2><p id="streaming-duplicate-confirmation-description">All selected Streaming sources already exist elsewhere. Create another collection anyway?</p></div>
			<div className="delete-confirmation-actions"><button ref={cancelRef} className="editor-cancel" type="button" disabled={isApplying} onClick={onCancel}>Cancel</button><button className="editor-apply" type="button" disabled={isApplying} data-action="create-duplicate-streaming-collection" onClick={onContinue}>{isApplying ? "Creating…" : "Create duplicate collection"}</button></div>
		</NestedPreviewDialog>
	);
}

function ReviewStep({ planResult, intentConfiguration, newCollectionElsewhereEvidence, destinationCandidates, selectedDestination, onDestinationChange, options, originalScope, activeScope, destinationCollectionTitle, collectionDisplayContext, folderTitleDrafts, folderTitleErrors, onOptionsChange, onFolderTitleChange, onUseDefaultFolderTitle, diagnostic, headingRef }) {
	const choiceRequired = originalScope === "new-collection" && destinationCandidates.length > 0 && selectedDestination === null;
	const plan = planResult?.ok ? planResult.plan : null;
	const existingScope = activeScope === "new-folder";
	const routedExisting = originalScope === "new-collection" && existingScope;
	const summaryConfiguration = intentConfiguration ?? plan?.configuration ?? null;
	const activeDestinationLabel = plan?.destination
		? collectionDisplayContext?.[plan.destination.collectionInternalId]?.label ?? (plan.destination.titleHidden ? "Hidden collection" : plan.destination.collectionTitle || destinationCollectionTitle || "Selected collection")
		: null;
	return (
		<section className="studio-hierarchy-review studio-hierarchy-appearance streaming-hierarchy-review" aria-labelledby="streaming-hierarchy-review-title">
			<div className="add-source-section-heading"><div><p className="panel-kicker">Step 3</p><h3 id="streaming-hierarchy-review-title" ref={headingRef} tabIndex={-1}>Review &amp; Appearance</h3></div></div>
			{summaryConfiguration ? <StreamingRunSummary regions={summaryConfiguration.regions} mediaChoice={summaryConfiguration.mediaChoice} providers={summaryConfiguration.providers} sortOptionId={summaryConfiguration.sortOptionId} groupingMode={summaryConfiguration.regions.length > 1 ? summaryConfiguration.groupingMode : null} review /> : null}
			{originalScope === "new-collection" ? <StreamingDestinationChooser candidates={destinationCandidates} selectedDestination={selectedDestination} elsewhereEvidence={newCollectionElsewhereEvidence} collectionDisplayContext={collectionDisplayContext} onChange={onDestinationChange} /> : null}
			{choiceRequired ? <><NewCollectionElsewhereEvidence evidence={newCollectionElsewhereEvidence} choicePending collectionDisplayContext={collectionDisplayContext} />{diagnostic ? <div className="editor-diagnostics" role="alert"><p>{diagnostic.message}</p></div> : null}</> : !plan ? <div className="editor-diagnostics" role="alert"><p>{planResult?.errors?.[0]?.message ?? "The Streaming plan could not be prepared."}</p></div> : <>
				<section className="streaming-change-summary" aria-labelledby="streaming-change-summary-title"><h4 id="streaming-change-summary-title">{existingScope ? "What will change" : "What will be created"}</h4><div className="decades-plan-totals streaming-plan-totals" data-plan-scope={activeScope} aria-label="Plan totals">{existingScope ? <><div><strong>{plan.counts.existingFolderAdditionCount}</strong><span>Existing folder{plan.counts.existingFolderAdditionCount === 1 ? "" : "s"} updated</span></div><div><strong>{plan.counts.newFolderCount}</strong><span>New folder{plan.counts.newFolderCount === 1 ? "" : "s"}</span></div><div><strong>{plan.counts.newSourceCount}</strong><span>Source{plan.counts.newSourceCount === 1 ? "" : "s"} to add</span></div></> : <><div><strong>1</strong><span>Collection</span></div><div><strong>{plan.counts.folderCount}</strong><span>Folder{plan.counts.folderCount === 1 ? "" : "s"}</span></div><div><strong>{plan.counts.sourceCount}</strong><span>Source{plan.counts.sourceCount === 1 ? "" : "s"}</span></div></>}</div></section>
				{existingScope ? <section className="streaming-placement-review" aria-label="Streaming placement changes"><div className="studio-configure-list">{plan.outcomes.map((outcome) => <PlacementReviewRow key={outcome.key} outcome={outcome} collectionDisplayContext={collectionDisplayContext} />)}</div></section> : <NewCollectionElsewhereEvidence evidence={plan.elsewhereEvidence} collectionDisplayContext={collectionDisplayContext} />}
				{plan.conflicts.length ? <div className="editor-diagnostics" role="alert">{plan.conflicts.map((conflict, index) => <p key={`${conflict.code}-${index}`}>{conflict.message}</p>)}</div> : null}
				{routedExisting && plan.conflicts.length === 0 && plan.counts.newSourceCount === 0 ? <section className="streaming-nothing-to-add" role="status"><strong>Nothing to add</strong><p>All selected Streaming sources already exist in {activeDestinationLabel}. No project changes are needed.</p></section> : null}
				{activeScope === "new-collection" ? <><div className="editor-field"><label htmlFor="streaming-collection-name">Collection name</label><input id="streaming-collection-name" type="text" {...reversibleTitleFieldProps(options.collectionTitle, options.hideCollectionTitle)} aria-describedby={options.hideCollectionTitle ? "streaming-collection-title-hidden-help" : undefined} onChange={(event) => onOptionsChange({ collectionTitle: event.target.value })} /><HiddenTitleFieldHelp id="streaming-collection-title-hidden-help" hidden={options.hideCollectionTitle} kind="collection" /></div><FolderNameEditor folders={plan.newFolders} drafts={folderTitleDrafts} errors={folderTitleErrors} hiddenEverywhere={options.folderTitleVisibility === "HIDE_EVERYWHERE"} onChange={onFolderTitleChange} onUseDefault={onUseDefaultFolderTitle} /><TitleOptions idPrefix="streaming-hierarchy" collectionTitleVisibility={{ checked: options.hideCollectionTitle, onChange: (hideCollectionTitle) => onOptionsChange({ hideCollectionTitle }), descriptionId: "streaming-hide-title-help", controlName: "streamingHideNuvioTitle" }} folderTitleVisibility={{ selectedId: options.folderTitleVisibility, name: "streaming-folder-title-visibility", onChange: (folderTitleVisibility) => onOptionsChange({ folderTitleVisibility }) }} /><fieldset className="editor-field editor-choice-field"><legend>Collection layout</legend><HierarchyCollectionPresentationControls selectedId={options.viewMode} name="streaming-collection-layout" showAllTab={options.showAllTab} onPresentationChange={onOptionsChange} showAllDescription="Combines every Streaming folder in one All tab." showAllDescriptionId="streaming-all-tab-help" showAllControlName="streamingShowAllTab" /></fieldset><PresentationSwitch label="Pin collection to top" description="Keeps this collection near the top of Nuvio." descriptionId="streaming-pin-help" controlName="streamingPinToTop" checked={options.pinToTop} onChange={(pinToTop) => onOptionsChange({ pinToTop })} /></> : <><div className="franchise-inherited-summary"><strong>Collection settings stay unchanged</strong><span>{activeDestinationLabel} · {plan.destination.viewMode === "ROWS" ? "Rows" : "Tabs"}. This operation does not rename or reconfigure the existing collection; appearance choices below apply only to new folders.</span></div><FolderNameEditor folders={plan.newFolders} drafts={folderTitleDrafts} errors={folderTitleErrors} hiddenEverywhere={options.folderTitleVisibility === "HIDE_EVERYWHERE"} onChange={onFolderTitleChange} onUseDefault={onUseDefaultFolderTitle} />{plan.newFolders.length ? <TitleOptions idPrefix="streaming-hierarchy" folderTitleVisibility={{ selectedId: options.folderTitleVisibility, name: "streaming-folder-title-visibility", onChange: (folderTitleVisibility) => onOptionsChange({ folderTitleVisibility }) }} /> : null}</>}
				{diagnostic ? <div className="editor-diagnostics" role="alert"><p>{diagnostic.message}</p></div> : null}
			</>}
		</section>
	);
}

export function StreamingHierarchyFlow({
	scope,
	project,
	projectRevision,
	destinationCollectionInternalId = null,
	destinationCollectionTitle = null,
	catalogueProvider,
	previewProvider,
	onBack,
	onCancel,
	onApply,
}) {
	const [step, setStep] = useState("choose");
	const [selectionStage, setSelectionStage] = useState("regions");
	const [catalogueState, setCatalogueState] = useState(INITIAL_ASYNC_REQUEST_STATE);
	const [retryGeneration, setRetryGeneration] = useState(0);
	const [selectedRegions, setSelectedRegions] = useState([]);
	const [selection, setSelection] = useState(createStreamingSelectionState);
	const [regionQuery, setRegionQuery] = useState("");
	const [regionBrowseMode, setRegionBrowseMode] = useState(STREAMING_REGION_BROWSE_MODES.COMMON);
	const [providerQuery, setProviderQuery] = useState("");
	const [providerBrowseMode, setProviderBrowseMode] = useState(STREAMING_PROVIDER_BROWSE_MODES.TOP);
	const [options, setOptions] = useState(() => Object.freeze({ collectionTitle: "Streaming Services", hideCollectionTitle: false, viewMode: "TABBED_GRID", showAllTab: true, pinToTop: false, folderTitleVisibility: DEFAULT_STREAMING_HIERARCHY_FOLDER_TITLE_VISIBILITY, groupingMode: DEFAULT_STREAMING_HIERARCHY_GROUPING_MODE, mediaChoice: "both", sortOptionId: DEFAULT_STREAMING_SORT_OPTION_ID }));
	const [folderTitleDrafts, setFolderTitleDrafts] = useState({});
	const [selectionReconciliationNotice, setSelectionReconciliationNotice] = useState(null);
	const [selectedDestination, setSelectedDestination] = useState(null);
	const [preview, setPreview] = useState(null);
	const [duplicateConfirmation, setDuplicateConfirmation] = useState(null);
	const [diagnostic, setDiagnostic] = useState(null);
	const [isApplying, setIsApplying] = useState(false);
	const catalogueCoordinatorRef = useRef(null);
	const previewCoordinatorRef = useRef(null);
	const previewTriggerRef = useRef(null);
	const previewTokenRef = useRef(null);
	const scrollRef = useRef(null);
	const regionHeadingRef = useRef(null);
	const providerHeadingRef = useRef(null);
	const configureHeadingRef = useRef(null);
	const reviewHeadingRef = useRef(null);
	const primaryActionRef = useRef(null);
	const scrollByStageRef = useRef({ regions: 0, providers: 0, configure: 0, review: 0 });
	if (catalogueCoordinatorRef.current === null) catalogueCoordinatorRef.current = createAsyncRequestCoordinator({ onStateChange: setCatalogueState });
	if (previewCoordinatorRef.current === null) previewCoordinatorRef.current = createAsyncRequestCoordinator();
	const catalogue = catalogueState.status === "success" ? catalogueState.data : null;
	const chosen = selectedStreamingProviders(selection);
	const regionCodes = selectedRegions.map((region) => region.code);
	const effectiveProviderBrowseMode = regionCodes.length === 1 ? providerBrowseMode : STREAMING_PROVIDER_BROWSE_MODES.ALL;
	const regions = useMemo(() => browseStreamingRegions(catalogue?.regions ?? [], { mode: regionBrowseMode, query: regionQuery }), [catalogue, regionBrowseMode, regionQuery]);
	const providers = useMemo(() => {
		if (!catalogue || regionCodes.length === 0) return [];
		return providerQuery.trim()
			? searchStreamingProviders(catalogue.providers, providerQuery, { regionCodes, mediaChoice: options.mediaChoice })
			: browseStreamingProviders(catalogue.providers, { mode: effectiveProviderBrowseMode, regionCodes, mediaChoice: options.mediaChoice });
	}, [catalogue, effectiveProviderBrowseMode, options.mediaChoice, providerQuery, regionCodes.join("|")]);
	const validFolderTitleOverrides = useMemo(() => Object.freeze(Object.fromEntries(Object.entries(folderTitleDrafts)
		.filter(([, title]) => isValidVisibleNuvioTitle(title)))), [folderTitleDrafts]);
	const hierarchyIntentOptions = useMemo(() => Object.freeze({
		projectRevision,
		folderTitleVisibility: options.folderTitleVisibility,
		folderTitleOverrides: validFolderTitleOverrides,
		groupingMode: selectedRegions.length > 1 ? options.groupingMode : DEFAULT_STREAMING_HIERARCHY_GROUPING_MODE,
		regions: selectedRegions,
		mediaChoice: options.mediaChoice,
		sortOptionId: options.sortOptionId,
		providers: chosen,
	}), [chosen, options.folderTitleVisibility, options.groupingMode, options.mediaChoice, options.sortOptionId, projectRevision, selectedRegions, validFolderTitleOverrides]);
	const newCollectionPlanResult = useMemo(() => scope === "new-collection" && chosen.length && selectedRegions.length ? createStreamingHierarchyPlan(project, {
		...hierarchyIntentOptions,
		scope: "new-collection",
		collectionTitle: options.collectionTitle,
		hideCollectionTitle: options.hideCollectionTitle,
		viewMode: options.viewMode,
		showAllTab: options.showAllTab,
		pinToTop: options.pinToTop,
	}) : null, [hierarchyIntentOptions, options.collectionTitle, options.hideCollectionTitle, options.pinToTop, options.showAllTab, options.viewMode, project, scope]);
	const fixedExistingPlanResult = useMemo(() => scope === "new-folder" && chosen.length && selectedRegions.length ? createStreamingHierarchyPlan(project, {
		...hierarchyIntentOptions,
		scope: "new-folder",
		destinationCollectionInternalId,
	}) : null, [destinationCollectionInternalId, hierarchyIntentOptions, project, scope]);
	const destinationResult = useMemo(() => scope === "new-collection" && chosen.length && selectedRegions.length
		? inspectStreamingHierarchyDestinationCandidates(project, hierarchyIntentOptions)
		: null, [hierarchyIntentOptions, project, scope]);
	const collectionDisplayContext = useMemo(() => buildStreamingCollectionDisplayContext(project), [project]);
	const destinationCandidates = destinationResult?.ok ? destinationResult.candidates : [];
	const destinationCandidateSignature = destinationCandidates.map((candidate) => candidate.collectionInternalId).join("\n");
	const selectedCandidate = selectedDestination && selectedDestination !== "new"
		? destinationCandidates.find((candidate) => candidate.collectionInternalId === selectedDestination) ?? null
		: null;
	const activeScope = scope === "new-folder" || selectedCandidate ? "new-folder" : "new-collection";
	const planResult = scope === "new-folder"
		? fixedExistingPlanResult
		: destinationCandidates.length === 0 || selectedDestination === "new"
			? newCollectionPlanResult
			: selectedCandidate
				? Object.freeze({ ok: true, plan: selectedCandidate.plan, errors: Object.freeze([]) })
				: null;
	const intentConfiguration = destinationResult?.ok ? destinationResult.configuration : planResult?.ok ? planResult.plan.configuration : null;
	const newCollectionElsewhereEvidence = destinationResult?.ok ? destinationResult.elsewhereEvidence : newCollectionPlanResult?.ok ? newCollectionPlanResult.plan.elsewhereEvidence : null;
	const logicalFolderKeys = scope === "new-collection"
		? destinationResult?.ok ? destinationResult.logicalFolderKeys : null
		: fixedExistingPlanResult?.ok ? fixedExistingPlanResult.plan.newFolders.map((folder) => folder.key) : null;
	const logicalFolderKeySignature = logicalFolderKeys?.join("\n") ?? "";
	const activeNewFolderKeys = new Set(planResult?.ok ? planResult.plan.newFolders.map((folder) => folder.key) : []);
	const activeNewFolderKeySignature = [...activeNewFolderKeys].join("\n");
	const folderTitleErrors = useMemo(() => options.folderTitleVisibility === "HIDE_EVERYWHERE" ? new Map() : new Map(Object.entries(folderTitleDrafts)
		.filter(([key, title]) => activeNewFolderKeys.has(key) && !isValidVisibleNuvioTitle(title))
		.map(([key]) => [key, { message: "Enter a folder title before applying changes." }])), [activeNewFolderKeySignature, folderTitleDrafts, options.folderTitleVisibility]);
	const currentElsewhereEvidenceSignature = JSON.stringify(newCollectionElsewhereEvidence ?? null);

	useEffect(() => {
		const coordinator = catalogueCoordinatorRef.current;
		coordinator.cancel({ notify: false });
		setCatalogueState(INITIAL_ASYNC_REQUEST_STATE);
		coordinator.run(({ signal }) => catalogueProvider.loadCatalogue({ signal }), { kind: "streaming-hierarchy-catalogue" });
		return () => coordinator.cancel({ reset: false, notify: false });
	}, [catalogueProvider, retryGeneration]);

	useEffect(() => () => {
		catalogueCoordinatorRef.current.cancel({ notify: false });
		previewCoordinatorRef.current.cancel({ notify: false });
		previewTokenRef.current = null;
	}, []);

	useEffect(() => {
		if (logicalFolderKeys === null) return;
		const currentKeys = new Set(logicalFolderKeys);
		setFolderTitleDrafts((current) => {
			const next = Object.fromEntries(Object.entries(current).filter(([key]) => currentKeys.has(key)));
			return Object.keys(next).length === Object.keys(current).length ? current : next;
		});
	}, [logicalFolderKeySignature]);

	useEffect(() => {
		if (scope !== "new-collection" || selectedDestination === null || selectedDestination === "new" || destinationCandidates.some((candidate) => candidate.collectionInternalId === selectedDestination)) return;
		setSelectedDestination(null);
		setDiagnostic({ message: "The previously selected collection is no longer a safe destination. Choose a destination again." });
		if (step === "review") queueMicrotask(() => focusElementWithoutScroll(reviewHeadingRef.current));
	}, [destinationCandidateSignature, scope, selectedDestination, step]);

	useEffect(() => {
		if (!duplicateConfirmation || duplicateConfirmation.elsewhereEvidenceSignature === currentElsewhereEvidenceSignature) return;
		setDuplicateConfirmation(null);
		setDiagnostic({ message: "Streaming matches changed. Review the refreshed duplicate evidence before creating this collection." });
		queueMicrotask(() => focusElementWithoutScroll(reviewHeadingRef.current));
	}, [currentElsewhereEvidenceSignature, duplicateConfirmation]);

	const activeStage = step === "choose" ? selectionStage : step;
	usePrePaintLayoutEffect(() => {
		if (scrollRef.current) scrollRef.current.scrollTop = scrollByStageRef.current[activeStage] ?? 0;
		focusElementWithoutScroll(activeStage === "regions" ? regionHeadingRef.current : activeStage === "providers" ? providerHeadingRef.current : activeStage === "configure" ? configureHeadingRef.current : reviewHeadingRef.current);
	}, [activeStage]);

	function updateOptions(patch) {
		setOptions((current) => Object.freeze({ ...current, ...patch }));
		setDiagnostic(null);
	}

	function changeDestination(destination) {
		setSelectedDestination(destination);
		setDuplicateConfirmation(null);
		setDiagnostic(null);
	}

	function updateFolderTitle(key, title) {
		setFolderTitleDrafts((current) => ({ ...current, [key]: title }));
		setDiagnostic(null);
	}

	function useDefaultFolderTitle(key) {
		setFolderTitleDrafts((current) => {
			const next = { ...current };
			delete next[key];
			return next;
		});
		setDiagnostic(null);
	}

	function toggleRegion(region) {
		const nextRegions = toggleStreamingRegionSelection(selectedRegions, region);
		const reconciliation = reconcileStreamingSelection(selection, catalogue?.providers ?? [], nextRegions.map((entry) => entry.code), options.mediaChoice);
		setSelectedRegions(nextRegions);
		setSelection(reconciliation.state);
		const removedCount = reconciliation.removedProviders.length;
		setSelectionReconciliationNotice(removedCount > 0 ? `${removedCount} selected service${removedCount === 1 ? "" : "s"} ${removedCount === 1 ? "was" : "were"} removed because ${removedCount === 1 ? "it is" : "they are"} not available for the selected media in every region.` : null);
		setDiagnostic(null);
	}

	function changeMedia(mediaChoice) {
		if (mediaChoice === options.mediaChoice) return;
		const reconciliation = reconcileStreamingSelection(selection, catalogue?.providers ?? [], regionCodes, mediaChoice);
		setSelection(reconciliation.state);
		const removedCount = reconciliation.removedProviders.length;
		setSelectionReconciliationNotice(removedCount > 0 ? `${removedCount} selected service${removedCount === 1 ? "" : "s"} ${removedCount === 1 ? "was" : "were"} removed because ${removedCount === 1 ? "it does" : "they do"} not support ${mediaChoiceLabel(mediaChoice)} in every selected region.` : null);
		updateOptions({ mediaChoice });
	}

	function removeProvider(providerId) {
		setSelection((current) => removeSelectedStreamingProvider(current, providerId));
		setSelectionReconciliationNotice(null);
		setDiagnostic(null);
	}

	function toggleProvider(provider) {
		setSelection((current) => toggleSelectedStreamingProvider(current, provider).state);
		setSelectionReconciliationNotice(null);
		setDiagnostic(null);
	}

	async function requestPreview(provider, regionCode, mediaType, trigger = null) {
		if (trigger) previewTriggerRef.current = trigger;
		previewCoordinatorRef.current.cancel({ notify: false });
		const built = buildStreamingSourceDrafts(provider, { regionCodes: [regionCode], mediaChoice: mediaChoiceForType(mediaType), sortOptionId: options.sortOptionId, nameContext: STREAMING_SOURCE_NAME_CONTEXTS.GROUPED_BY_SERVICE });
		if (!built.ok || typeof previewProvider?.getStreamingPreview !== "function") {
			setPreview({ provider, regionCode, mediaType, status: "error", data: null, error: { message: built.errors?.[0]?.message ?? "Streaming Preview is unavailable." } });
			return;
		}
		const token = Symbol(`streaming-preview-${provider.id}-${regionCode}-${mediaType}-${options.sortOptionId}`);
		previewTokenRef.current = token;
		setPreview({ provider, regionCode, mediaType, status: "loading", data: null, error: null });
		const sourceNode = Object.freeze({ ...built.drafts[0], nodeType: "source", internalId: "streaming-hierarchy-preview" });
		const outcome = await previewCoordinatorRef.current.run(({ signal }) => previewProvider.getStreamingPreview(sourceNode, { signal }), { providerId: provider.id, regionCode, mediaType, sortOptionId: options.sortOptionId });
		if (!outcome.accepted || previewTokenRef.current !== token) return;
		if (outcome.result?.ok) setPreview({ provider, regionCode, mediaType, status: "ready", data: outcome.result.data, error: null });
		else if (outcome.result?.error?.kind !== "aborted") setPreview({ provider, regionCode, mediaType, status: "error", data: null, error: outcome.result?.error ?? { message: "This Streaming preview could not be prepared." } });
	}

	function openPreview(provider, trigger) {
		requestPreview(provider, selectedRegions[0].code, mediaTypesForChoice(options.mediaChoice)[0], trigger);
	}

	function closePreview() {
		previewCoordinatorRef.current.cancel({ notify: false });
		previewTokenRef.current = null;
		const trigger = previewTriggerRef.current;
		previewTriggerRef.current = null;
		setPreview(null);
		queueMicrotask(() => focusElementWithoutScroll(trigger));
	}

	function closeDuplicateConfirmation() {
		if (isApplying) return;
		setDuplicateConfirmation(null);
		queueMicrotask(() => focusElementWithoutScroll(primaryActionRef.current));
	}

	function goBack() {
		if (isApplying) return;
		setDiagnostic(null);
		if (step === "choose" && selectionStage === "regions") onBack();
		else {
			scrollByStageRef.current[activeStage] = scrollRef.current?.scrollTop ?? 0;
			if (step === "review") setStep("configure");
			else if (step === "configure") { setStep("choose"); setSelectionStage("providers"); }
			else setSelectionStage("regions");
		}
	}

	async function applyReviewedPlan(plan) {
		setIsApplying(true);
		let result;
		try { result = await onApply(plan); } catch { result = { ok: false, errors: [{ message: "Streaming services could not be created. Try again." }] }; }
		if (result?.ok) return;
		setIsApplying(false);
		setDuplicateConfirmation(null);
		setDiagnostic(result?.stale ? { message: "Streaming placement or duplicate evidence changed. Review the refreshed plan before applying." } : result?.errors?.[0] ?? { message: "Streaming services could not be created. Try again." });
	}

	async function submit(event) {
		event.preventDefault();
		if (preview || duplicateConfirmation || isApplying) return;
		if (step === "choose" && selectionStage === "regions") {
			if (!selectedRegions.length) return;
			scrollByStageRef.current.regions = scrollRef.current?.scrollTop ?? 0;
			setProviderBrowseMode(selectedRegions.length === 1 ? STREAMING_PROVIDER_BROWSE_MODES.TOP : STREAMING_PROVIDER_BROWSE_MODES.ALL);
			setSelectionStage("providers");
			return;
		}
		if (step === "choose") {
			if (!chosen.length) return;
			scrollByStageRef.current.providers = scrollRef.current?.scrollTop ?? 0;
			setStep("configure");
			return;
		}
		if (step === "configure") {
			if (!chosen.length) return;
			scrollByStageRef.current.configure = scrollRef.current?.scrollTop ?? 0;
			setStep("review");
			return;
		}
		if (scope === "new-collection" && destinationCandidates.length > 0 && selectedDestination === null) return;
		if (!planResult?.ok || folderTitleErrors.size > 0 || planResult.plan.conflicts.length) return;
		if (scope === "new-collection" && activeScope === "new-folder" && planResult.plan.counts.newSourceCount === 0) {
			onCancel();
			return;
		}
		if (activeScope === "new-folder" && planResult.plan.counts.newSourceCount === 0) return;
		if (activeScope === "new-collection" && planResult.plan.elsewhereEvidence?.overlap === "complete") {
			setDuplicateConfirmation({ plan: planResult.plan, elsewhereEvidenceSignature: currentElsewhereEvidenceSignature });
			return;
		}
		await applyReviewedPlan(planResult.plan);
	}

	const destinationChoiceRequired = scope === "new-collection" && destinationCandidates.length > 0 && selectedDestination === null;
	const routedExistingNoChanges = scope === "new-collection" && activeScope === "new-folder" && planResult?.ok && planResult.plan.conflicts.length === 0 && planResult.plan.counts.newSourceCount === 0;
	const primaryDisabled = catalogueState.status !== "success" || (activeStage === "regions" ? selectedRegions.length === 0 : activeStage === "providers" ? chosen.length === 0 : activeStage === "configure" ? chosen.length === 0 : destinationChoiceRequired || !planResult?.ok || folderTitleErrors.size > 0 || planResult.plan.conflicts.length > 0 || (activeScope === "new-folder" && planResult.plan.counts.newSourceCount === 0 && !routedExistingNoChanges) || isApplying);
	const primaryLabel = activeStage === "regions" ? `Choose services for ${selectedRegions.length} region${selectedRegions.length === 1 ? "" : "s"}` : activeStage === "providers" ? `Configure ${chosen.length} service${chosen.length === 1 ? "" : "s"}` : activeStage === "configure" ? "Continue to Review" : destinationChoiceRequired ? "Choose a destination" : routedExistingNoChanges ? "Close" : isApplying ? activeScope === "new-folder" ? "Applying…" : "Creating…" : activeScope === "new-collection" ? planResult?.plan.elsewhereEvidence?.overlap === "complete" ? "Create duplicate collection" : `Create ${planResult?.plan.counts.folderCount ?? 0} folder${planResult?.plan.counts.folderCount === 1 ? "" : "s"}` : `Apply ${planResult?.plan.counts.newSourceCount ?? 0} source${planResult?.plan.counts.newSourceCount === 1 ? "" : "s"}`;
	const descriptions = { regions: "Choose one or more regions. Search stays inactive until you use it.", providers: "Choose eligible services in folder order.", configure: "Choose one shared Sort and folder grouping, then preview exact sources when useful.", review: "Review the exact creation or change summary before one atomic Apply." };
	const interactionOverlayOpen = Boolean(preview || duplicateConfirmation);

	return <>
		<CreationHeader title="Create with Streaming" context={`${scopeLabel(scope)}${scope === "new-folder" && destinationCollectionTitle ? ` · ${destinationCollectionTitle}` : ""}`} description={descriptions[activeStage]} onBack={goBack} backAction={activeStage === "regions" ? "back-to-creation-launcher" : `back-to-streaming-${activeStage}`} backDisabled={isApplying} inactive={interactionOverlayOpen} onClose={onCancel} />
		<form className="add-source-form studio-hierarchy-form streaming-hierarchy-form" data-streaming-hierarchy-stage={activeStage} onSubmit={submit} noValidate>
			<div ref={scrollRef} className="add-source-scroll" inert={interactionOverlayOpen || undefined} aria-hidden={interactionOverlayOpen ? "true" : undefined}>
				{selectionReconciliationNotice && (activeStage === "regions" || activeStage === "providers") ? <p className="people-selection-limit streaming-selection-reconciliation" data-streaming-selection-reconciliation="true" role="status">{selectionReconciliationNotice}</p> : null}
				{catalogueState.status === "loading" || catalogueState.status === "idle" ? <p className="add-source-selection-status" role="status">Loading Streaming regions and providers…</p> : catalogueState.status === "error" ? <div className="add-source-request-state" role="alert"><p>{catalogueState.error?.message ?? "Streaming services could not be loaded. Try again."}</p><button type="button" onClick={() => setRetryGeneration((value) => value + 1)}>Retry</button></div> : activeStage === "regions" ? <div ref={regionHeadingRef} tabIndex={-1}><StreamingRegionStep heading="Choose regions" description="Select one or more regions. Services shown next must support the media you choose in every region." browseMode={regionBrowseMode} query={regionQuery} queryRef={null} regions={regions} selectedRegions={selectedRegions} onBrowseModeChange={setRegionBrowseMode} onQueryChange={(event) => setRegionQuery(event.target.value)} onSelect={toggleRegion} /></div> : activeStage === "providers" ? <ProviderSelectionStep regions={selectedRegions} mediaChoice={options.mediaChoice} providers={providers} selection={selection} query={providerQuery} browseMode={effectiveProviderBrowseMode} onMediaChange={changeMedia} onQueryChange={(event) => setProviderQuery(event.target.value)} onBrowseModeChange={setProviderBrowseMode} onToggle={toggleProvider} onRemove={removeProvider} headingRef={providerHeadingRef} /> : activeStage === "configure" ? <ConfigureStep providers={chosen} regions={selectedRegions} mediaChoice={options.mediaChoice} sortOptionId={options.sortOptionId} groupingMode={selectedRegions.length > 1 ? options.groupingMode : DEFAULT_STREAMING_HIERARCHY_GROUPING_MODE} onSortChange={(sortOptionId) => updateOptions({ sortOptionId })} onGroupingChange={(groupingMode) => updateOptions({ groupingMode })} onPreview={openPreview} onRemove={removeProvider} headingRef={configureHeadingRef} /> : <ReviewStep planResult={planResult} intentConfiguration={intentConfiguration} newCollectionElsewhereEvidence={newCollectionElsewhereEvidence} destinationCandidates={destinationCandidates} selectedDestination={selectedDestination} onDestinationChange={changeDestination} options={options} originalScope={scope} activeScope={activeScope} destinationCollectionTitle={destinationCollectionTitle} collectionDisplayContext={collectionDisplayContext} folderTitleDrafts={folderTitleDrafts} folderTitleErrors={folderTitleErrors} onOptionsChange={updateOptions} onFolderTitleChange={updateFolderTitle} onUseDefaultFolderTitle={useDefaultFolderTitle} diagnostic={diagnostic} headingRef={reviewHeadingRef} />}
			</div>
			<footer className="add-source-actions" inert={interactionOverlayOpen || undefined} aria-hidden={interactionOverlayOpen ? "true" : undefined}><button ref={primaryActionRef} className="editor-apply" type="submit" disabled={primaryDisabled}>{primaryLabel}</button></footer>
		</form>
		{preview ? <StreamingTitlePreview preview={preview} regions={selectedRegions} mediaTypes={mediaTypesForChoice(options.mediaChoice)} onChangeRegion={(regionCode) => { if (regionCode !== preview.regionCode) requestPreview(preview.provider, regionCode, preview.mediaType); }} onChangeMedia={(mediaType) => { if (mediaType !== preview.mediaType) requestPreview(preview.provider, preview.regionCode, mediaType); }} onClose={closePreview} onRetry={() => requestPreview(preview.provider, preview.regionCode, preview.mediaType)} /> : null}
		{duplicateConfirmation ? <StreamingDuplicateCollectionConfirmation isApplying={isApplying} onCancel={closeDuplicateConfirmation} onContinue={() => applyReviewedPlan(duplicateConfirmation.plan)} /> : null}
	</>;
}
