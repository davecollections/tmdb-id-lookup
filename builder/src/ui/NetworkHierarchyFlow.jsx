import { RequiredNameInput, requiredNameMessage, onlyRequiredNameErrors, handleRequiredNameSubmit } from "./RequiredNameInput.jsx";
import { creationContext } from "./creation-context.js";
import { CreationStageIntro } from "./CreationStageIntro.jsx";
import { MinimumVotesAdvancedOptions, MinimumVotesSummary } from "./MinimumVotesAdvancedOptions.jsx";
import { validateNetworkAdvancedFilters } from "../source-add/network-advanced.js";
import { useNativeFolderPlacement, NativeFolderPlacementNotice, NativeFolderPlacementSummary } from "./NativeFolderPlacement.jsx";
import { useSourceTitlePreview } from "./use-source-title-preview.js";
import { SourceTitlePreviewDialog } from "./SourceTitlePreviewDialog.jsx";
import { SourceVariantCounts } from "./SourceVariantReview.jsx";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
	buildNetworkSourceDrafts,
	createNetworkHierarchyPlan,
	createNetworkSelectionState,
	DEFAULT_NETWORK_ARTWORK_ORIENTATION,
	DEFAULT_NETWORK_FOLDER_TITLE_VISIBILITY,
	DEFAULT_NETWORK_SORT_OPTION_ID,
	formatNetworkLocation,
	inspectNetworkHierarchyPlacement,
	networkSelectionNotice,
	NETWORK_PLACEMENT_STATUSES,
	removeSelectedNetwork,
	resolveNetworkFolderArtworkBatch,
	selectedNetworks,
	toggleSelectedNetwork,
} from "../source-add/index.js";
import { HierarchyCollectionPresentationControls } from "./CollectionPresentationChoices.jsx";
import { CreationHeader } from "./CreationHeader.jsx";
import { guidedCreateActionLabel } from "./creation-options.js";
import { focusElementWithoutScroll } from "./hierarchy-menu-placement.js";
import { NetworkLogo, NetworkResultContent, NetworkSearchStep } from "./NetworkSourceFlow.jsx";
import { NetworkSortChoices } from "./NetworkSortChoices.jsx";
import { FolderShapeChoices, HiddenTitleFieldHelp, PresentationSwitch, TitleOptions } from "./PresentationControls.jsx";
import { SourceElsewhereNotice } from "./SourceElsewhereNotice.jsx";
import { useNetworkCatalogueSearch } from "./use-network-catalogue-search.js";

const usePrePaintLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function formatCount(value) {
	return Number.isSafeInteger(value) && value >= 0 ? value.toLocaleString("en") : "Unknown";
}

function catalogueCountLabel(network) {
	return `Series Count: ${formatCount(network?.seriesCount)}`;
}

function configureCountLabel(network, exactCount) {
	return `Series Count: ${formatCount(exactCount === undefined ? network?.seriesCount : exactCount)}`;
}

function SelectedNetworks({ networks, onRemove }) {
	return (
		<details className="genre-selected-disclosure removable-selection-disclosure studio-selected-disclosure network-selected-disclosure">
			<summary>View selected Networks</summary>
			<ul>
				{networks.map((network) => <li key={network.id}>
					<div><strong>{network.name}</strong><span>TMDB {network.id} · {catalogueCountLabel(network)}</span></div>
					<span className="studio-selected-actions"><button className="studio-selected-remove" type="button" aria-label={`Remove ${network.name}`} onClick={() => onRemove(network.id)}>×</button></span>
				</li>)}
			</ul>
		</details>
	);
}

function SelectableNetworkResult({ network, checked, onToggle }) {
	return (
		<label className={`add-source-result studio-result network-result studio-result-selectable network-result-selectable${checked ? " is-selected" : ""}`} data-tmdb-network-result={network.id} data-selection-mode="multiple">
			<input className="visually-hidden choice-card-input" type="checkbox" checked={checked} onChange={() => onToggle(network)} />
			<NetworkResultContent network={network} showSeriesCount />
		</label>
	);
}

function NetworkConfigureRow({ network, exactCount, outcome, onPreview, onRemove, placement, previewDisabled }) {
	const location = network.location || formatNetworkLocation(network);
	return <article className="studio-configure-row network-configure-row" data-network-id={network.id} data-placement-status={outcome?.status ?? NETWORK_PLACEMENT_STATUSES.READY}>
		<div className="studio-configure-row-main">
			<NetworkLogo network={network} size="w185" context="result" />
			<div className="studio-configure-row-copy">
				<strong>{network.name}</strong>
				<span>{configureCountLabel(network, exactCount)}</span>
				<small>TMDB {network.id}{location ? ` · ${location}` : ""} · Series</small>
			</div>
			<div className="studio-configure-row-actions"><button type="button" aria-haspopup="dialog" aria-label={`Preview titles for ${network.name}`} disabled={previewDisabled} onClick={(event) => onPreview(network, event.currentTarget)}>Preview titles</button><button className="studio-configure-remove" type="button" aria-label={`Remove ${network.name}`} onClick={() => onRemove(network.id)}>×</button></div>
		</div>
		<NativeFolderPlacementNotice name={network.name} outcome={outcome} onChoose={placement} />
		{outcome?.elsewhere?.length ? <details className="studio-configure-locations"><summary>View locations</summary><SourceElsewhereNotice occurrences={outcome.elsewhere} heading="This Network exists elsewhere" action="It can still be created here when the destination is clear." /></details> : null}
	</article>;
}

function ConfigureStep({ networks, exactCounts, outcomes, sortOptionIds, onSortChange, onPreview, onRemove, headingRef, placement, options, onAdvancedChange }) {
	const advanced = validateNetworkAdvancedFilters(options.filters);
	return (
		<section className="studio-hierarchy-configure network-hierarchy-configure" aria-labelledby="network-hierarchy-configure-title">
			<CreationStageIntro step={2} phase="Configure" title="Configure Networks" headingId="network-hierarchy-configure-title" headingRef={headingRef} tabIndex={-1} />
			<p className="studio-configure-helper">These choices apply to every selected Network.</p>
			<NetworkSortChoices selectedIds={sortOptionIds} name="network-hierarchy-sort" onChange={onSortChange} />
			<MinimumVotesAdvancedOptions family="network" draft={{ ...options, mediaType: "TV" }} onChange={onAdvancedChange} entities={networks} />
			{placement ? <NativeFolderPlacementSummary counts={placement.counts} /> : null}
			<section className="studio-configure-selected network-configure-selected" aria-labelledby="network-configure-selected-title">
				<div className="add-source-section-heading"><div><h4 id="network-configure-selected-title">Selected Networks{networks.length ? ` · ${networks.length}` : ""}</h4></div></div>
				{networks.length ? <div className="studio-configure-list network-configure-list">{networks.map((network, index) => <NetworkConfigureRow previewDisabled={!advanced.ok || !sortOptionIds.length} key={network.id} network={network} exactCount={exactCounts[network.id]} outcome={outcomes[index]} onPreview={onPreview} onRemove={onRemove} placement={(folderId) => placement.choose(index, folderId)} />)}</div> : <p className="studio-configure-empty" role="status">No Networks selected. Go Back to Select to choose at least one Network.</p>}
			</section>
		</section>
	);
}

function ArtworkChoices({ options, onArtworkChange, disabled }) {
	return <fieldset className="editor-field editor-choice-field" disabled={disabled}><legend>Folder tile shape</legend><FolderShapeChoices supportedShapes={["POSTER", "LANDSCAPE"]} selectedId={options.artworkOrientation} name="network-folder-artwork" idPrefix="network-hierarchy" onChange={onArtworkChange} /></fieldset>;
}

function AppearanceStep({ planResult, options, onOptionsChange, onArtworkChange, diagnostic, headingRef, isPreparing }) {
	const plan = planResult?.ok ? planResult.plan : null;
	const otherErrors = (planResult?.errors ?? []).filter((entry) => entry.path !== "$networkPlan.collectionTitle");
	return (
		<section className="studio-hierarchy-review studio-hierarchy-appearance network-hierarchy-appearance" aria-labelledby="network-hierarchy-appearance-title">
			<CreationStageIntro step={3} phase="Appearance" title="Appearance" headingId="network-hierarchy-appearance-title" headingRef={headingRef} tabIndex={-1} />
			{plan ? <><SourceVariantCounts counts={plan.counts} /><MinimumVotesSummary family="network" filters={plan.configuration.filters} mediaMode={"series"} genreOverrides={plan.configuration.genreOverrides} labels={options.labels} entities={plan.configuration.networks.map((entry) => entry.network)} /></> : null}
			{plan?.configuration.scope === "new-folder" ? <p className="editor-field-help">Appearance applies only to new folders.</p> : null}
			{options.scope === "new-collection" ? <>
				<div className="editor-field"><label htmlFor="network-collection-name">Collection name</label><RequiredNameInput id="network-collection-name" value={options.collectionTitle} hidden={options.hideCollectionTitle} error={requiredNameMessage(planResult?.errors, "$networkPlan.collectionTitle", options.collectionTitle)} describedBy={options.hideCollectionTitle ? "network-collection-title-hidden-help" : undefined} onChange={(event) => onOptionsChange({ collectionTitle: event.target.value })} /><HiddenTitleFieldHelp id="network-collection-title-hidden-help" hidden={options.hideCollectionTitle} kind="collection" /></div>
				<TitleOptions idPrefix="network-hierarchy" collectionTitleVisibility={{ checked: options.hideCollectionTitle, onChange: (hideCollectionTitle) => onOptionsChange({ hideCollectionTitle }), descriptionId: "network-hide-title-help", controlName: "networkHideNuvioTitle" }} folderTitleVisibility={{ selectedId: options.folderTitleVisibility, name: "network-folder-title-visibility", onChange: (folderTitleVisibility) => onOptionsChange({ folderTitleVisibility }) }} />
				<fieldset className="editor-field editor-choice-field"><legend>Collection layout</legend><HierarchyCollectionPresentationControls selectedId={options.viewMode} name="network-collection-layout" showAllTab={options.showAllTab} onPresentationChange={onOptionsChange} showAllDescriptionId="network-all-tab-help" showAllControlName="networkShowAllTab" /></fieldset>
				<PresentationSwitch label="Pin collection to top" description="Keeps this collection near the top of Nuvio." descriptionId="network-pin-help" controlName="networkPinToTop" checked={options.pinToTop} onChange={(pinToTop) => onOptionsChange({ pinToTop })} />
				<ArtworkChoices options={options} onArtworkChange={onArtworkChange} disabled={isPreparing} />
			</> : <>
				<div className="franchise-inherited-summary"><strong>Collection settings stay unchanged.</strong><span>{plan?.destination.titleHidden ? "Hidden collection" : plan?.destination.collectionTitle || options.destinationCollectionTitle || "Hidden collection"}{plan ? ` · ${plan.destination.viewMode === "ROWS" ? "Rows" : "Tabs"}` : ""}</span></div>
				<TitleOptions idPrefix="network-hierarchy" folderTitleVisibility={{ selectedId: options.folderTitleVisibility, name: "network-folder-title-visibility", onChange: (folderTitleVisibility) => onOptionsChange({ folderTitleVisibility }) }} />
				<ArtworkChoices options={options} onArtworkChange={onArtworkChange} disabled={isPreparing} />
			</>}
			{isPreparing ? <p className="studio-preview-state" role="status">Preparing folder artwork…</p> : null}
			{!isPreparing && !plan && otherErrors.length > 0 && !diagnostic ? <div className="editor-diagnostics" role="alert"><p>{otherErrors[0]?.message ?? "The Network plan could not be prepared."}</p></div> : null}
			{diagnostic ? <div className="editor-diagnostics" role="alert"><p>{diagnostic.message}</p></div> : null}
		</section>
	);
}

export function NetworkHierarchyFlow({
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
	const [selection, setSelection] = useState(createNetworkSelectionState);
	const [exactCounts, setExactCounts] = useState({});
	const [options, setOptions] = useState(() => Object.freeze({ scope, destinationCollectionTitle, collectionTitle: "Networks", hideCollectionTitle: false, viewMode: "TABBED_GRID", showAllTab: true, pinToTop: false, filters: {}, folderTitleVisibility: DEFAULT_NETWORK_FOLDER_TITLE_VISIBILITY, artworkOrientation: DEFAULT_NETWORK_ARTWORK_ORIENTATION, sortOptionIds: [DEFAULT_NETWORK_SORT_OPTION_ID] }));
	const [artworkBatch, setArtworkBatch] = useState(null);
	const titlePreview = useSourceTitlePreview("network", { network: previewProvider });
	const preview = titlePreview.preview;
	const [diagnostic, setDiagnostic] = useState(null);
	const [isPreparing, setIsPreparing] = useState(false);
	const [isApplying, setIsApplying] = useState(false);
	const search = useNetworkCatalogueSearch(catalogueProvider, { seriesCountFilters: true });
	const chosen = selectedNetworks(selection);
	const chosenIds = chosen.map((network) => network.id);
	const notice = networkSelectionNotice(selection);
	const scrollRef = useRef(null);
	const selectHeadingRef = useRef(null);
	const configureHeadingRef = useRef(null);
	const appearanceHeadingRef = useRef(null);
	const artworkTokenRef = useRef(null);
	const artworkSelectionIdsRef = useRef(chosenIds);
	const artworkOrientationRef = useRef(DEFAULT_NETWORK_ARTWORK_ORIENTATION);
	const isPreparingRef = useRef(false);
	const scrollByStepRef = useRef({ select: 0, configure: 0, appearance: 0 });
	artworkSelectionIdsRef.current = chosenIds;

	const configureEntries = useMemo(() => chosen.map((network) => {
		const result = buildNetworkSourceDrafts(network, { sortOptionIds: options.sortOptionIds, filters: options.filters, genreOverrides: options.genreOverrides, hierarchy: true });
		return { network, result, outcome: result.ok ? inspectNetworkHierarchyPlacement(project, result.drafts, { destinationCollectionInternalId: scope === "new-folder" ? destinationCollectionInternalId : null }) : null };
	}), [chosen, destinationCollectionInternalId, options.sortOptionIds, options.filters, options.genreOverrides, project, scope]);
	const placement = useNativeFolderPlacement(scope === "new-folder" ? destinationCollectionInternalId : null, configureEntries.map((entry) => ({ id: entry.network.id, drafts: entry.result.drafts, outcome: entry.outcome })));
	const configureOutcomes = placement.outcomes;
	const configurationValid = configureEntries.length > 0 && configureEntries.every((entry) => entry.result.ok) && (scope !== "new-folder" || (placement.counts?.sourceCount > 0 && placement.counts.unresolvedEntityCount === 0));
	const preparePlan = (resolvedArtworks) => createNetworkHierarchyPlan(project, {
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
		artworkOrientation: options.artworkOrientation,
		sortOptionIds: options.sortOptionIds,
		filters: options.filters, genreOverrides: options.genreOverrides,
		networks: chosen.map((network, index) => ({ network, artwork: resolvedArtworks[index] })),
	});
	const appendOnly = scope === "new-folder" && placement.counts?.folderCount === 0;
	const planResult = useMemo(() => artworkBatch && artworkBatch.orientation === options.artworkOrientation && artworkBatch.items.length === chosen.length ? preparePlan(artworkBatch.items) : null, [artworkBatch, chosen, destinationCollectionInternalId, options, project, projectRevision, scope, placement.folderDestinations]);


	useEffect(() => {
		if (preview?.status === "ready") setExactCounts((current) => ({ ...current, [preview.candidate.request.tmdbId]: preview.data.totalResults }));
	}, [preview]);

	useEffect(() => () => {
		artworkTokenRef.current = null;
	}, []);

	usePrePaintLayoutEffect(() => {
		if (scrollRef.current) scrollRef.current.scrollTop = scrollByStepRef.current[step] ?? 0;
		focusElementWithoutScroll(step === "select" ? selectHeadingRef.current : step === "configure" ? configureHeadingRef.current : appearanceHeadingRef.current);
	}, [step]);

	function updateOptions(patch) {
		setOptions((current) => Object.freeze({ ...current, ...patch }));
		setDiagnostic(null);
	}

	function removeNetwork(networkId) {
		if (isPreparingRef.current) return;
		artworkTokenRef.current = null;
		setSelection((current) => removeSelectedNetwork(current, networkId));
		setArtworkBatch(null);
		setDiagnostic(null);
	}

	function toggleNetwork(network) {
		if (isPreparingRef.current) return;
		artworkTokenRef.current = null;
		setSelection((current) => toggleSelectedNetwork(current, network).state);
		setArtworkBatch(null);
		setDiagnostic(null);
	}

	function requestPreview(network, trigger = null) {
		if (isPreparingRef.current) return;
		const entry = configureEntries.find((candidate) => candidate.network.id === network.id);
		if (entry?.result.ok) titlePreview.open(entry.result.drafts, { trigger, label: network.name });
	}

	function changeSort(sortOptionIds) {
		if (isPreparingRef.current || sortOptionIds === options.sortOptionIds) return;
		updateOptions({ sortOptionIds });
	}

	async function prepareArtwork(orientation, { advance = false } = {}) {
		if (isPreparingRef.current) return false;
		const token = Symbol(`network-artwork-${orientation}`);
		const selectionIds = [...artworkSelectionIdsRef.current];
		artworkTokenRef.current = token;
		isPreparingRef.current = true;
		setArtworkBatch(null);
		setIsPreparing(true);
		setDiagnostic(null);
		try {
			const items = await resolveNetworkFolderArtworkBatch(chosen, artworkRuntimeClient, { orientation });
			if (
				artworkTokenRef.current !== token
				|| artworkOrientationRef.current !== orientation
				|| artworkSelectionIdsRef.current.length !== selectionIds.length
				|| artworkSelectionIdsRef.current.some((networkId, index) => networkId !== selectionIds[index])
			) return false;
			setArtworkBatch(Object.freeze({ orientation, items }));
			if (advance) {
				scrollByStepRef.current.configure = scrollRef.current?.scrollTop ?? 0;
				setStep("appearance");
			}
			return true;
		} catch {
			if (artworkTokenRef.current === token) setDiagnostic({ message: "Network folder artwork could not be prepared. Try again." });
			return false;
		} finally {
			if (artworkTokenRef.current === token) {
				isPreparingRef.current = false;
				setIsPreparing(false);
			}
		}
	}

	function changeArtworkOrientation(artworkOrientation) {
		if (artworkOrientation === artworkOrientationRef.current || isPreparingRef.current) return;
		artworkOrientationRef.current = artworkOrientation;
		updateOptions({ artworkOrientation });
		prepareArtwork(artworkOrientation);
	}

	function goBack() {
		if (isApplying || isPreparingRef.current) return;
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
			if (!configurationValid || isPreparingRef.current) return;
			if (appendOnly) {
				const placeholders = await resolveNetworkFolderArtworkBatch(chosen, null, { orientation: options.artworkOrientation });
				await applyPreparedPlan(preparePlan(placeholders));
				return;
			}
			await prepareArtwork(options.artworkOrientation, { advance: true });
			return;
		}
		if (!artworkBatch && !isPreparing) {
			await prepareArtwork(options.artworkOrientation);
			return;
		}
		await applyPreparedPlan(planResult);
	}

	async function applyPreparedPlan(resultPlan) {
		if (!resultPlan?.ok || resultPlan.plan.counts.sourceCount === 0 || resultPlan.plan.counts.unresolvedEntityCount > 0 || isApplying) return;
		setIsApplying(true);
		let result;
		try { result = await onApply(resultPlan.plan); } catch { result = { ok: false, errors: [{ message: "Networks could not be created. Try again." }] }; }
		if (result?.ok) return;
		setIsApplying(false);
		setDiagnostic(result?.errors?.[0] ?? { message: "Networks could not be created. Try again." });
	}

	const primaryDisabled = step === "select"
		? chosen.length === 0
		: step === "configure"
			? !configurationValid || isPreparing || isApplying
			: isPreparing || (artworkBatch ? (!planResult?.ok || planResult.plan.counts.sourceCount === 0 || planResult.plan.counts.unresolvedEntityCount > 0 || isApplying) : chosen.length === 0);
	const nameCorrection = step === "appearance" && !isApplying && !isPreparing && onlyRequiredNameErrors(planResult, ["$networkPlan.collectionTitle"]);
	const primaryLabel = step === "select"
		? "Continue to Configure"
		: step === "configure"
			? isApplying ? "Adding…" : isPreparing ? "Preparing artwork…" : appendOnly ? "Add sources" : "Continue to Appearance"
			: isPreparing ? "Preparing artwork…" : !artworkBatch ? "Retry artwork" : isApplying ? "Applying…" : planResult?.plan?.counts.existingFolderAdditionCount > 0 ? "Apply changes" : guidedCreateActionLabel(scope, planResult?.plan?.counts);

	return <>
		<CreationHeader title="Create with Networks" context={creationContext(scope, destinationCollectionTitle)} description={step === "select" ? "Select Networks in folder order." : step === "configure" ? "Choose shared Series source options and preview when useful." : "Choose presentation settings."} onBack={goBack} backAction={step === "select" ? "back-to-creation-launcher" : step === "configure" ? "back-to-network-selection" : "back-to-network-configuration"} backDisabled={isApplying || isPreparing} inactive={Boolean(preview)} onClose={onCancel} />
		<form className="add-source-form studio-hierarchy-form network-hierarchy-form" data-network-hierarchy-stage={step} onSubmitCapture={handleRequiredNameSubmit} onSubmit={submit} noValidate>
			<div ref={scrollRef} className="add-source-scroll" inert={preview || undefined} aria-hidden={preview ? "true" : undefined}>
				{step === "select" ? <>
					<CreationStageIntro step={1} phase="Select" title="Networks · TMDB" description="Search by Network name, country, location or TMDB ID." headingId="network-mode-title" headingRef={selectHeadingRef} tabIndex={-1} />
					{chosen.length ? <section className="people-selected-tray studio-selected-tray network-selected-tray"><div className="people-selected-summary"><strong>{chosen.length} Network{chosen.length === 1 ? "" : "s"} selected</strong><SelectedNetworks networks={chosen} onRemove={removeNetwork} /></div>{notice.visible ? <p className="people-selection-limit" data-large-selection-notice="true" role="status">You’ve selected {notice.count} Networks. Configure may take a little longer, but there is no selection cap.</p> : null}</section> : null}
					<NetworkSearchStep input={search.input} parsedInput={search.parsedInput} lookupState={search.lookupState} searchData={search.searchData} effectiveSearchSort={search.effectiveSearchSort} browsing={search.browsing} seriesCountFilter={search.seriesCountFilter} showSeriesCountFilters onInputChange={search.handleInputChange} onSortChange={search.toggleSearchSort} onSeriesCountFilterChange={search.changeSeriesCountFilter} onRetry={search.retrySearch} onSelect={() => {}} onChangePage={search.setPage} resultsHeading="Select Networks" showIntro={false} renderResult={(network) => <SelectableNetworkResult key={network.id} network={network} checked={Boolean(selection.byId[network.id])} onToggle={toggleNetwork} />} />
				</> : step === "configure" ? <div inert={isPreparing || undefined} aria-busy={isPreparing ? "true" : undefined}><ConfigureStep options={options} onAdvancedChange={updateOptions} networks={chosen} exactCounts={exactCounts} outcomes={configureOutcomes} placement={scope === "new-folder" ? placement : null} sortOptionIds={options.sortOptionIds} onSortChange={changeSort} onPreview={requestPreview} onRemove={removeNetwork} headingRef={configureHeadingRef} />{diagnostic ? <div className="editor-diagnostics" role="alert"><p>{diagnostic.message}</p></div> : null}</div> : <AppearanceStep planResult={planResult} options={options} onOptionsChange={updateOptions} onArtworkChange={changeArtworkOrientation} diagnostic={diagnostic} headingRef={appearanceHeadingRef} isPreparing={isPreparing} />}
			</div>
			<footer className="add-source-actions"><button className="editor-apply" type="submit" disabled={primaryDisabled && !nameCorrection} aria-describedby={scope === "new-folder" && step === "configure" ? "native-folder-placement-summary" : undefined}>{primaryLabel}</button></footer>
		</form>
		{preview ? <SourceTitlePreviewDialog {...titlePreview.dialogProps} titleId="network-preview-title" backdropProps={{ "data-network-preview-backdrop": "true" }} dialogProps={{ "data-network-preview": "true" }} /> : null}
	</>;
}
