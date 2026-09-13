import { StudioAdvancedOptions, StudioMinimumVotesSummary } from "./StudioAdvancedOptions.jsx";
import { validateStudioAdvancedFilters } from "../source-add/studio-advanced.js";
import { useNativeFolderPlacement, NativeFolderPlacementNotice, NativeFolderPlacementSummary } from "./NativeFolderPlacement.jsx";
import { useSourceTitlePreview } from "./use-source-title-preview.js";
import { SourceTitlePreviewDialog } from "./SourceTitlePreviewDialog.jsx";
import { SourceVariantCounts } from "./SourceVariantReview.jsx";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
	buildStudioSourceDrafts,
	createStudioHierarchyPlan,
	createStudioSelectionState,
	DEFAULT_STUDIO_FOLDER_TITLE_VISIBILITY,
	DEFAULT_STUDIO_HIERARCHY_MEDIA_MODE,
	DEFAULT_STUDIO_SORT_OPTION_ID,
	inspectStudioHierarchyPlacement,
	removeSelectedStudio,
	resolveStudioFolderArtworkBatch,
	selectedStudios,
	STUDIO_HIERARCHY_MEDIA_MODES,
	STUDIO_PLACEMENT_STATUSES,
	STUDIO_SOURCE_TITLE_MODES,
	studioSelectionNotice,
	toggleSelectedStudio,
} from "../source-add/index.js";
import { reversibleTitleFieldProps } from "../nuvio/titles.js";
import { HierarchyCollectionPresentationControls } from "./CollectionPresentationChoices.jsx";
import { CreationHeader } from "./CreationHeader.jsx";
import { guidedCreateActionLabel } from "./creation-options.js";
import { focusElementWithoutScroll } from "./hierarchy-menu-placement.js";
import { HiddenTitleFieldHelp, PresentationSwitch, TitleOptions } from "./PresentationControls.jsx";
import { SemanticSortChoices } from "./SemanticSortChoices.jsx";
import { SourceElsewhereNotice } from "./SourceElsewhereNotice.jsx";
import { StudioLogo, StudioResultContent, StudioSearchStep } from "./StudioSourceFlow.jsx";
import { StudioSortChoices } from "./StudioSortChoices.jsx";
import { useStudioCatalogueSearch } from "./use-studio-catalogue-search.js";

const usePrePaintLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function scopeLabel(scope) {
	return scope === "new-folder" ? "New Folder" : "New Collection";
}

function formatCount(value) {
	return Number.isSafeInteger(value) && value >= 0 ? value.toLocaleString("en") : null;
}

function selectedDetail(studio, knownSeriesCounts) {
	const details = [];
	const movieCount = formatCount(studio.movieCount);
	if (movieCount !== null) details.push(`Movies · ${movieCount}`);
	const seriesCount = formatCount(knownSeriesCounts[`${studio.id}|TV`]);
	if (seriesCount !== null) details.push(`Series · ${seriesCount}`);
	return details.join(" · ");
}

function SelectedStudios({ studios, knownSeriesCounts, onRemove }) {
	return (
		<details className="genre-selected-disclosure removable-selection-disclosure studio-selected-disclosure">
			<summary>View selected Studios</summary>
			<ul>
				{studios.map((studio) => <li key={studio.id}>
					<div><strong>{studio.name}</strong><span>TMDB {studio.id}{selectedDetail(studio, knownSeriesCounts) ? ` · ${selectedDetail(studio, knownSeriesCounts)}` : ""}</span></div>
					<span className="studio-selected-actions"><button className="studio-selected-remove" type="button" aria-label={`Remove ${studio.name}`} onClick={() => onRemove(studio.id)}>×</button></span>
				</li>)}
			</ul>
		</details>
	);
}

function SelectableStudioResult({ studio, checked, onToggle }) {
	return (
		<label key={studio.id} className={`add-source-result studio-result studio-result-selectable${checked ? " is-selected" : ""}`} data-tmdb-studio-result={studio.id}>
			<input className="visually-hidden choice-card-input" type="checkbox" checked={checked} onChange={() => onToggle(studio)} />
			<StudioResultContent studio={studio} />
		</label>
	);
}

function StudioConfigureRow({ studio, knownSeriesCounts, outcome, mediaMode, onPreview, onRemove, placement, previewDisabled }) {
	return <article className="studio-configure-row" data-studio-id={studio.id} data-placement-status={outcome?.status ?? STUDIO_PLACEMENT_STATUSES.READY}>
		<div className="studio-configure-row-main">
			<StudioLogo studio={studio} size="w185" context="result" />
			<div className="studio-configure-row-copy"><strong>{studio.name}</strong><span>{selectedDetail(studio, knownSeriesCounts) || `TMDB ${studio.id}`}</span><small>TMDB {studio.id} · Company · {mediaMode === "both" ? "Movies + Series" : mediaMode === "series" ? "Series" : "Movies"}</small></div>
			<div className="studio-configure-row-actions"><button type="button" aria-haspopup="dialog" disabled={previewDisabled} aria-label={`Preview titles for ${studio.name}`} onClick={(event) => onPreview(studio, event.currentTarget)}>Preview titles</button><button className="studio-configure-remove" type="button" aria-label={`Remove ${studio.name}`} onClick={() => onRemove(studio.id)}>×</button></div>
		</div>
		<NativeFolderPlacementNotice name={studio.name} outcome={outcome} onChoose={placement} />
		{outcome?.elsewhere?.length ? <details className="studio-configure-locations"><summary>View locations</summary><SourceElsewhereNotice occurrences={outcome.elsewhere} heading="This Studio exists elsewhere" action="It can still be created here when the destination is clear." /></details> : null}
	</article>;
}

function ConfigureStep({ studios, knownSeriesCounts, outcomes, mediaMode, sortOptionIds, onMediaChange, onSortChange, onPreview, onRemove, placement, options, onAdvancedChange }) {
	const advanced = validateStudioAdvancedFilters(options.filters);
	return (
		<section className="studio-hierarchy-configure" aria-labelledby="studio-hierarchy-configure-title">
			<div className="add-source-section-heading"><div><p className="panel-kicker">Step 2</p><h3 id="studio-hierarchy-configure-title" tabIndex={-1}>Configure Studios</h3></div></div>
			<p className="studio-configure-helper">These choices apply to every selected Studio.</p>
			<SemanticSortChoices options={STUDIO_HIERARCHY_MEDIA_MODES} selectedId={mediaMode} name="studio-hierarchy-media" legend="Media" onChange={onMediaChange} />
			<StudioSortChoices selectedIds={sortOptionIds} name="studio-hierarchy-sort" onChange={onSortChange} />
			<StudioAdvancedOptions draft={options} onChange={onAdvancedChange} />
			{placement ? <NativeFolderPlacementSummary counts={placement.counts} /> : null}
			<section className="studio-configure-selected" aria-labelledby="studio-configure-selected-title"><div className="add-source-section-heading"><div><h4 id="studio-configure-selected-title">Selected Studios{studios.length ? ` · ${studios.length}` : ""}</h4></div></div>{studios.length ? <div className="studio-configure-list">{studios.map((studio, index) => <StudioConfigureRow key={studio.id} studio={studio} knownSeriesCounts={knownSeriesCounts} outcome={outcomes[index]} mediaMode={mediaMode} onPreview={onPreview} onRemove={onRemove} previewDisabled={!advanced.ok || !sortOptionIds.length} placement={(folderId) => placement.choose(index, folderId)} />)}</div> : <p className="studio-configure-empty" role="status">No Studios selected. Go Back to Select to choose at least one Studio.</p>}</section>
		</section>
	);
}

function AppearanceStep({ planResult, options, onOptionsChange, diagnostic, headingRef }) {
	if (!planResult?.ok) return <div className="editor-diagnostics" role="alert"><p>{planResult?.errors?.[0]?.message ?? "The Studio plan could not be prepared."}</p></div>;
	const plan = planResult.plan;
	return (
		<section className="studio-hierarchy-review studio-hierarchy-appearance" aria-labelledby="studio-hierarchy-appearance-title">
			<div className="add-source-section-heading"><div><p className="panel-kicker">Step 3</p><h3 id="studio-hierarchy-appearance-title" ref={headingRef} tabIndex={-1}>Appearance</h3></div></div>
			<SourceVariantCounts counts={plan.counts} />
			<StudioMinimumVotesSummary filters={plan.configuration.filters} />
			{plan.configuration.scope === "new-folder" ? <p className="editor-field-help">Appearance applies only to new folders.</p> : null}
			{plan.configuration.scope === "new-collection" ? <div className="decades-plan-totals" data-plan-scope={plan.configuration.scope} aria-label="Plan totals">{plan.configuration.scope === "new-collection" ? <div><strong>{plan.counts.collectionCount}</strong><span>Collection</span></div> : null}<div><strong>{plan.counts.folderCount}</strong><span>Folder{plan.counts.folderCount === 1 ? "" : "s"}</span></div><div><strong>{plan.counts.sourceCount}</strong><span>Source{plan.counts.sourceCount === 1 ? "" : "s"}</span></div></div> : null}
			{plan.configuration.scope === "new-collection" ? <>
				<div className="editor-field"><label htmlFor="studio-collection-name">Collection name</label><input id="studio-collection-name" type="text" {...reversibleTitleFieldProps(options.collectionTitle, options.hideCollectionTitle)} aria-describedby={options.hideCollectionTitle ? "studio-collection-title-hidden-help" : undefined} onChange={(event) => onOptionsChange({ collectionTitle: event.target.value })} /><HiddenTitleFieldHelp id="studio-collection-title-hidden-help" hidden={options.hideCollectionTitle} kind="collection" /></div>
				<TitleOptions idPrefix="studio-hierarchy" collectionTitleVisibility={{ checked: options.hideCollectionTitle, onChange: (hideCollectionTitle) => onOptionsChange({ hideCollectionTitle }), descriptionId: "studio-hide-title-help", controlName: "studioHideNuvioTitle" }} folderTitleVisibility={{ selectedId: options.folderTitleVisibility, name: "studio-folder-title-visibility", onChange: (folderTitleVisibility) => onOptionsChange({ folderTitleVisibility }) }} />
				<fieldset className="editor-field editor-choice-field"><legend>Collection layout</legend><HierarchyCollectionPresentationControls selectedId={options.viewMode} name="studio-collection-layout" showAllTab={options.showAllTab} onPresentationChange={onOptionsChange} showAllDescription="Combines every Studio folder in one All tab." showAllDescriptionId="studio-all-tab-help" showAllControlName="studioShowAllTab" /></fieldset>
				<PresentationSwitch label="Pin collection to top" description="Keeps this collection near the top of Nuvio." descriptionId="studio-pin-help" controlName="studioPinToTop" checked={options.pinToTop} onChange={(pinToTop) => onOptionsChange({ pinToTop })} />
			</> : <>
				<div className="franchise-inherited-summary"><strong>Collection settings stay unchanged.</strong><span>{plan.destination.collectionTitle || "Hidden collection"} · {plan.destination.viewMode === "ROWS" ? "Rows" : "Tabs"}</span></div>
				<TitleOptions idPrefix="studio-hierarchy" folderTitleVisibility={{ selectedId: options.folderTitleVisibility, name: "studio-folder-title-visibility", onChange: (folderTitleVisibility) => onOptionsChange({ folderTitleVisibility }) }} />
			</>}
			{diagnostic ? <div className="editor-diagnostics" role="alert"><p>{diagnostic.message}</p></div> : null}
		</section>
	);
}

export function StudioHierarchyFlow({
	scope,
	project,
	projectRevision,
	destinationCollectionInternalId = null,
	destinationCollectionTitle = null,
	catalogueProvider,
	previewProvider,
	artworkRuntimeClient,
	onBack,
	onCancel,
	onApply,
}) {
	const [step, setStep] = useState("select");
	const [selection, setSelection] = useState(createStudioSelectionState);
	const [knownSeriesCounts, setKnownSeriesCounts] = useState({});
	const [options, setOptions] = useState(() => Object.freeze({ collectionTitle: "Studios", hideCollectionTitle: false, viewMode: "TABBED_GRID", showAllTab: true, pinToTop: false, filters: {}, folderTitleVisibility: DEFAULT_STUDIO_FOLDER_TITLE_VISIBILITY, mediaMode: DEFAULT_STUDIO_HIERARCHY_MEDIA_MODE, sortOptionIds: [DEFAULT_STUDIO_SORT_OPTION_ID] }));
	const [artworks, setArtworks] = useState(null);
	const titlePreview = useSourceTitlePreview("studio", { studio: previewProvider });
	const preview = titlePreview.preview;
	const [diagnostic, setDiagnostic] = useState(null);
	const [isPreparing, setIsPreparing] = useState(false);
	const [isApplying, setIsApplying] = useState(false);
	const search = useStudioCatalogueSearch(catalogueProvider);
	const chosen = selectedStudios(selection);
	const notice = studioSelectionNotice(selection);
	const scrollRef = useRef(null);
	const selectHeadingRef = useRef(null);
	const configureHeadingRef = useRef(null);
	const appearanceHeadingRef = useRef(null);
	const scrollByStepRef = useRef({ select: 0, configure: 0, appearance: 0 });
	const configureEntries = useMemo(() => {
		const mode = STUDIO_HIERARCHY_MEDIA_MODES.find((entry) => entry.id === options.mediaMode);
		return chosen.map((studio) => {
			const result = buildStudioSourceDrafts(studio, { choices: mode?.choices ?? [], sortOptionIds: options.sortOptionIds, filters: options.filters, titleMode: STUDIO_SOURCE_TITLE_MODES.HIERARCHY });
			return { studio, result, outcome: result.ok ? inspectStudioHierarchyPlacement(project, result.drafts, { destinationCollectionInternalId: scope === "new-folder" ? destinationCollectionInternalId : null }) : null };
		});
	}, [chosen, destinationCollectionInternalId, options.mediaMode, options.sortOptionIds, options.filters, project, scope]);
	const placement = useNativeFolderPlacement(scope === "new-folder" ? destinationCollectionInternalId : null, configureEntries.map((entry) => ({ id: entry.studio.id, drafts: entry.result.drafts, outcome: entry.outcome })));
	const configureOutcomes = placement.outcomes;
	const configurationValid = configureEntries.length > 0 && configureEntries.every((entry) => entry.result.ok) && (scope !== "new-folder" || (placement.counts?.sourceCount > 0 && placement.counts.unresolvedEntityCount === 0));
	const preparePlan = (resolvedArtworks) => createStudioHierarchyPlan(project, {
		scope,
		projectRevision,
		folderDestinations: placement.folderDestinations,
		...(scope === "new-folder" ? { destinationCollectionInternalId } : {
			collectionTitle: options.collectionTitle,
			hideCollectionTitle: options.hideCollectionTitle,
			viewMode: options.viewMode,
			showAllTab: options.showAllTab,
			pinToTop: options.pinToTop,
		}),
		folderTitleVisibility: options.folderTitleVisibility,
		mediaMode: options.mediaMode,
		sortOptionIds: options.sortOptionIds,
		filters: options.filters,
		studios: chosen.map((studio, index) => ({ studio, artwork: resolvedArtworks[index] })),
	});
	const appendOnly = scope === "new-folder" && placement.counts?.folderCount === 0;
	const planResult = useMemo(() => artworks && artworks.length === chosen.length ? preparePlan(artworks) : null, [artworks, chosen, destinationCollectionInternalId, options, project, projectRevision, scope, placement.folderDestinations]);

	useEffect(() => {
		if (preview?.status === "ready" && preview.candidate.request.mediaType === "TV") setKnownSeriesCounts((current) => ({ ...current, [`${preview.candidate.request.tmdbId}|TV`]: preview.data.totalResults }));
	}, [preview]);

	usePrePaintLayoutEffect(() => {
		if (scrollRef.current) scrollRef.current.scrollTop = scrollByStepRef.current[step] ?? 0;
		focusElementWithoutScroll(step === "select" ? selectHeadingRef.current : step === "configure" ? configureHeadingRef.current : appearanceHeadingRef.current);
	}, [step]);

	function updateOptions(patch) {
		setOptions((current) => Object.freeze({ ...current, ...patch }));
		setDiagnostic(null);
	}

	function removeStudio(studioId) {
		setSelection((current) => removeSelectedStudio(current, studioId));
		setArtworks(null);
		setDiagnostic(null);
	}

	function toggleStudio(studio) {
		setSelection((current) => toggleSelectedStudio(current, studio).state);
		setArtworks(null);
		setDiagnostic(null);
	}

	function openPreview(studio, trigger) {
		const entry = configureEntries.find((candidate) => candidate.studio.id === studio.id);
		if (entry?.result.ok) titlePreview.open(entry.result.drafts, { trigger, label: studio.name });
	}

	function goBack() {
		if (isApplying || isPreparing) return;
		setDiagnostic(null);
		if (step === "select") onBack();
		else {
			scrollByStepRef.current[step] = scrollRef.current?.scrollTop ?? 0;
			setStep(step === "appearance" ? "configure" : "select");
		}
	}

	async function submit(event) {
		event.preventDefault();
		if (preview) return;
		if (step === "select") {
			if (!chosen.length) return;
			scrollByStepRef.current.select = scrollRef.current?.scrollTop ?? 0;
			setStep("configure");
			return;
		}
		if (step === "configure") {
			if (!configurationValid || isPreparing) return;
			if (appendOnly) {
				const placeholders = await resolveStudioFolderArtworkBatch(chosen, null);
				await applyPreparedPlan(preparePlan(placeholders));
				return;
			}
			setIsPreparing(true);
			setDiagnostic(null);
			try {
				const resolved = await resolveStudioFolderArtworkBatch(chosen, artworkRuntimeClient);
				setArtworks(resolved);
				scrollByStepRef.current.configure = scrollRef.current?.scrollTop ?? 0;
				setStep("appearance");
			} catch {
				setDiagnostic({ message: "Studio folder artwork could not be prepared. Try again." });
			} finally { setIsPreparing(false); }
			return;
		}
		await applyPreparedPlan(planResult);
	}

	async function applyPreparedPlan(resultPlan) {
		if (!resultPlan?.ok || resultPlan.plan.counts.sourceCount === 0 || resultPlan.plan.counts.unresolvedEntityCount > 0 || isApplying) return;
		setIsApplying(true);
		let result;
		try { result = await onApply(resultPlan.plan); } catch { result = { ok: false, errors: [{ message: "Studios could not be created. Try again." }] }; }
		if (result?.ok) return;
		setIsApplying(false);
		setDiagnostic(result?.errors?.[0] ?? { message: "Studios could not be created. Try again." });
	}

	const primaryDisabled = step === "select" ? chosen.length === 0 : step === "configure" ? !configurationValid || isPreparing || isApplying : !planResult?.ok || planResult.plan.counts.sourceCount === 0 || planResult.plan.counts.unresolvedEntityCount > 0 || isApplying;
	const primaryLabel = step === "select" ? `Configure ${chosen.length} Studio${chosen.length === 1 ? "" : "s"}` : step === "configure" ? isApplying ? "Adding…" : isPreparing ? "Preparing artwork…" : appendOnly ? "Add sources" : "Continue to Appearance" : isApplying ? "Applying…" : planResult?.plan?.counts.existingFolderAdditionCount > 0 ? "Apply changes" : guidedCreateActionLabel(scope);
	return <>
		<CreationHeader title="Create with Studios" context={`${scopeLabel(scope)}${scope === "new-folder" && destinationCollectionTitle ? ` · ${destinationCollectionTitle}` : ""}`} description={step === "select" ? "Select Studios in folder order." : step === "configure" ? "Choose Studios, media and source options." : "Choose presentation settings."} onBack={goBack} backAction={step === "select" ? "back-to-creation-launcher" : step === "configure" ? "back-to-studio-selection" : "back-to-studio-configuration"} backDisabled={isApplying || isPreparing} inactive={Boolean(preview)} onClose={onCancel} />
		<form className="add-source-form studio-hierarchy-form" data-studio-hierarchy-stage={step} onSubmit={submit} noValidate>
			<div ref={scrollRef} className="add-source-scroll" inert={preview || undefined} aria-hidden={preview ? "true" : undefined}>
				{step === "select" ? <>
					<div ref={selectHeadingRef} tabIndex={-1} className="studio-hierarchy-focus-target" />
					{chosen.length ? <section className="people-selected-tray studio-selected-tray"><div className="people-selected-summary"><strong>{chosen.length} Studio{chosen.length === 1 ? "" : "s"} selected</strong><SelectedStudios studios={chosen} knownSeriesCounts={knownSeriesCounts} onRemove={removeStudio} /></div>{notice.visible ? <p className="people-selection-limit" data-large-selection-notice="true" role="status">You’ve selected {notice.count} Studios. Configure may take a little longer, but there is no selection cap.</p> : null}</section> : null}
					<StudioSearchStep input={search.input} parsedInput={search.parsedInput} lookupState={search.lookupState} searchData={search.searchData} effectiveSearchSort={search.effectiveSearchSort} browsing={search.browsing} movieCountFilter={search.movieCountFilter} onInputChange={search.handleInputChange} onSortChange={search.toggleSearchSort} onMovieCountFilterChange={search.changeMovieCountFilter} onRetry={search.retrySearch} onSelect={() => {}} onChangePage={search.setPage} resultsHeading="Select Studios" stageKicker="Step 1 · Select" renderResult={(studio) => <SelectableStudioResult key={studio.id} studio={studio} checked={Boolean(selection.byId[studio.id])} onToggle={toggleStudio} />} />
				</> : step === "configure" ? <div ref={configureHeadingRef} tabIndex={-1}><ConfigureStep studios={chosen} knownSeriesCounts={knownSeriesCounts} outcomes={configureOutcomes} placement={scope === "new-folder" ? placement : null} mediaMode={options.mediaMode} sortOptionIds={options.sortOptionIds} onMediaChange={(mediaMode) => updateOptions({ mediaMode })} onSortChange={(sortOptionIds) => updateOptions({ sortOptionIds })} onPreview={openPreview} onRemove={removeStudio} options={options} onAdvancedChange={(next) => updateOptions({ filters: next.filters })} />{diagnostic ? <div className="editor-diagnostics" role="alert"><p>{diagnostic.message}</p></div> : null}</div> : <AppearanceStep planResult={planResult} options={options} onOptionsChange={updateOptions} diagnostic={diagnostic} headingRef={appearanceHeadingRef} />}
			</div>
			<footer className="add-source-actions"><button className="editor-apply" type="submit" disabled={primaryDisabled} aria-describedby={scope === "new-folder" && step === "configure" ? "native-folder-placement-summary" : undefined}>{primaryLabel}</button></footer>
		</form>
		{preview ? <SourceTitlePreviewDialog {...titlePreview.dialogProps} titleId="studio-preview-title" backdropProps={{ "data-studio-preview-backdrop": "true" }} dialogProps={{ "data-studio-preview": "true" }} /> : null}
	</>;
}
