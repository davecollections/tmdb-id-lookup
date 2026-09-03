import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
	buildNetworkHierarchySourceDraft,
	createAsyncRequestCoordinator,
	createNetworkHierarchyPlan,
	createNetworkSelectionState,
	DEFAULT_NETWORK_ARTWORK_ORIENTATION,
	DEFAULT_NETWORK_FOLDER_TITLE_VISIBILITY,
	DEFAULT_NETWORK_SORT_OPTION_ID,
	formatNetworkLocation,
	inspectNetworkHierarchyPlacement,
	networkSelectionNotice,
	networkSortValue,
	NETWORK_PLACEMENT_STATUSES,
	removeSelectedNetwork,
	resolveNetworkFolderArtworkBatch,
	selectedNetworks,
	toggleSelectedNetwork,
} from "../source-add/index.js";
import { reversibleTitleFieldProps } from "../nuvio/titles.js";
import { HierarchyCollectionPresentationControls } from "./CollectionPresentationChoices.jsx";
import { CreationHeader } from "./CreationHeader.jsx";
import { focusElementWithoutScroll } from "./hierarchy-menu-placement.js";
import { NestedPreviewDialog } from "./NestedPreviewDialog.jsx";
import { NetworkLogo, NetworkResultContent, NetworkSearchStep } from "./NetworkSourceFlow.jsx";
import { NetworkSortChoices } from "./NetworkSortChoices.jsx";
import { PosterOnlyPreviewGrid } from "./PosterOnlyPreviewGrid.jsx";
import { FolderShapeChoices, HiddenTitleFieldHelp, PresentationSwitch, TitleOptions } from "./PresentationControls.jsx";
import { SourceElsewhereNotice } from "./SourceElsewhereNotice.jsx";
import { useNetworkCatalogueSearch } from "./use-network-catalogue-search.js";

const usePrePaintLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function scopeLabel(scope) {
	return scope === "new-folder" ? "New Folder" : "New Collection";
}

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
		<label className={`add-source-result studio-result network-result studio-result-selectable network-result-selectable${checked ? " is-selected" : ""}`} data-tmdb-network-result={network.id}>
			<input className="visually-hidden choice-card-input" type="checkbox" checked={checked} onChange={() => onToggle(network)} />
			<NetworkResultContent network={network} showSeriesCount />
		</label>
	);
}

function NetworkTitlePreview({ preview, onClose, onRetry }) {
	const dialogRef = useRef(null);
	const closeRef = useRef(null);
	const items = preview.data?.results ?? [];
	return (
		<NestedPreviewDialog ariaLabelledBy="network-preview-title" backdropClassName="franchise-preview-backdrop studio-preview-backdrop network-preview-backdrop" backdropProps={{ "data-network-preview-backdrop": "true" }} dialogClassName="franchise-preview-modal studio-preview-modal network-preview-modal" dialogRef={dialogRef} initialFocusRef={closeRef} onClose={onClose}>
			<header><div><p className="panel-kicker">Preview</p><h3 id="network-preview-title">{preview.network.name}</h3></div><button ref={closeRef} type="button" onClick={onClose}>Close</button></header>
			{preview.status === "loading" ? <p className="studio-preview-state" role="status">Preparing preview…</p> : null}
			{preview.status === "error" ? <div className="studio-preview-state add-source-request-state" role="alert"><p>{preview.error?.message ?? "This Network preview could not be prepared."}</p><button type="button" onClick={onRetry}>Retry</button></div> : null}
			{preview.status === "ready" ? <>
				<p className="studio-preview-single-media network-preview-count">Series Count: {formatCount(preview.data?.totalResults)}</p>
				<PosterOnlyPreviewGrid items={items} limit={10} className="franchise-preview-grid studio-preview-grid network-preview-grid" ariaLabel="Series poster preview" altPrefix="Series" emptyMessage="No posters available." />
			</> : null}
		</NestedPreviewDialog>
	);
}

function placementLabel(status) {
	if (status === NETWORK_PLACEMENT_STATUSES.ALREADY_IN_COLLECTION) return "Already in this collection · omitted";
	if (status === NETWORK_PLACEMENT_STATUSES.EXISTS_ELSEWHERE) return "Exists elsewhere · ready to create";
	return "Ready to create";
}

function NetworkConfigureRow({ network, exactCount, outcome, onPreview, onRemove }) {
	const location = network.location || formatNetworkLocation(network);
	return <article className="studio-configure-row network-configure-row" data-network-id={network.id} data-placement-status={outcome?.status ?? NETWORK_PLACEMENT_STATUSES.READY}>
		<div className="studio-configure-row-main">
			<NetworkLogo network={network} size="w185" context="result" />
			<div className="studio-configure-row-copy">
				<strong>{network.name}</strong>
				<span>{configureCountLabel(network, exactCount)}</span>
				<small>TMDB {network.id}{location ? ` · ${location}` : ""} · Series</small>
			</div>
			<div className="studio-configure-row-actions"><button type="button" aria-haspopup="dialog" aria-label={`Preview ${network.name}`} onClick={(event) => onPreview(network, event.currentTarget)}>Preview</button><button className="studio-configure-remove" type="button" aria-label={`Remove ${network.name}`} onClick={() => onRemove(network.id)}>×</button></div>
		</div>
		<p className="studio-configure-placement">{placementLabel(outcome?.status)}</p>
		{outcome?.elsewhere?.length ? <details className="studio-configure-locations"><summary>View locations</summary><SourceElsewhereNotice occurrences={outcome.elsewhere} heading="This Network exists elsewhere" action="It can still be created here when the destination is clear." /></details> : null}
	</article>;
}

function ConfigureStep({ networks, exactCounts, outcomes, sortOptionId, onSortChange, onPreview, onRemove, headingRef }) {
	return (
		<section className="studio-hierarchy-configure network-hierarchy-configure" aria-labelledby="network-hierarchy-configure-title">
			<div className="add-source-section-heading"><div><p className="panel-kicker">Step 2</p><h3 id="network-hierarchy-configure-title" ref={headingRef} tabIndex={-1}>Configure Networks</h3></div></div>
			<p className="studio-configure-helper">This sort applies to every selected Network.</p>
			<NetworkSortChoices selectedId={sortOptionId} name="network-hierarchy-sort" onChange={onSortChange} />
			<section className="studio-configure-selected network-configure-selected" aria-labelledby="network-configure-selected-title">
				<div className="add-source-section-heading"><div><h4 id="network-configure-selected-title">Selected Networks{networks.length ? ` · ${networks.length}` : ""}</h4></div></div>
				{networks.length ? <div className="studio-configure-list network-configure-list">{networks.map((network, index) => <NetworkConfigureRow key={network.id} network={network} exactCount={exactCounts[network.id]} outcome={outcomes[index]} onPreview={onPreview} onRemove={onRemove} />)}</div> : <p className="studio-configure-empty" role="status">No Networks selected. Go Back to Select to choose at least one Network.</p>}
			</section>
		</section>
	);
}

function ArtworkChoices({ options, onArtworkChange, disabled }) {
	return <fieldset className="editor-field editor-choice-field" disabled={disabled}><legend>Folder artwork</legend><FolderShapeChoices selectedId={options.artworkOrientation} name="network-folder-artwork" idPrefix="network-hierarchy" onChange={onArtworkChange} /></fieldset>;
}

function AppearanceStep({ planResult, options, onOptionsChange, onArtworkChange, diagnostic, headingRef, isPreparing }) {
	const plan = planResult?.ok ? planResult.plan : null;
	return (
		<section className="studio-hierarchy-review studio-hierarchy-appearance network-hierarchy-appearance" aria-labelledby="network-hierarchy-appearance-title">
			<div className="add-source-section-heading"><div><p className="panel-kicker">Step 3</p><h3 id="network-hierarchy-appearance-title" ref={headingRef} tabIndex={-1}>Appearance</h3></div></div>
			{plan ? <div className="decades-plan-totals" data-plan-scope={plan.configuration.scope} aria-label="Plan totals">{plan.configuration.scope === "new-collection" ? <div><strong>{plan.counts.collectionCount}</strong><span>Collection</span></div> : null}<div><strong>{plan.counts.folderCount}</strong><span>Folder{plan.counts.folderCount === 1 ? "" : "s"}</span></div><div><strong>{plan.counts.sourceCount}</strong><span>Source{plan.counts.sourceCount === 1 ? "" : "s"}</span></div></div> : null}
			{options.scope === "new-collection" ? <>
				<div className="editor-field"><label htmlFor="network-collection-name">Collection name</label><input id="network-collection-name" type="text" {...reversibleTitleFieldProps(options.collectionTitle, options.hideCollectionTitle)} aria-describedby={options.hideCollectionTitle ? "network-collection-title-hidden-help" : undefined} onChange={(event) => onOptionsChange({ collectionTitle: event.target.value })} /><HiddenTitleFieldHelp id="network-collection-title-hidden-help" hidden={options.hideCollectionTitle} kind="collection" /></div>
				<TitleOptions idPrefix="network-hierarchy" collectionTitleVisibility={{ checked: options.hideCollectionTitle, onChange: (hideCollectionTitle) => onOptionsChange({ hideCollectionTitle }), descriptionId: "network-hide-title-help", controlName: "networkHideNuvioTitle" }} folderTitleVisibility={{ selectedId: options.folderTitleVisibility, name: "network-folder-title-visibility", onChange: (folderTitleVisibility) => onOptionsChange({ folderTitleVisibility }) }} />
				<ArtworkChoices options={options} onArtworkChange={onArtworkChange} disabled={isPreparing} />
				<fieldset className="editor-field editor-choice-field"><legend>Collection layout</legend><HierarchyCollectionPresentationControls selectedId={options.viewMode} name="network-collection-layout" showAllTab={options.showAllTab} onPresentationChange={onOptionsChange} showAllDescription="Combines every Network folder in one All tab." showAllDescriptionId="network-all-tab-help" showAllControlName="networkShowAllTab" /></fieldset>
				<PresentationSwitch label="Pin collection to top" description="Keeps this collection near the top of Nuvio." descriptionId="network-pin-help" controlName="networkPinToTop" checked={options.pinToTop} onChange={(pinToTop) => onOptionsChange({ pinToTop })} />
			</> : <>
				<div className="franchise-inherited-summary"><strong>Parent presentation is inherited</strong><span>{plan?.destination.titleHidden ? "Hidden collection" : plan?.destination.collectionTitle || options.destinationCollectionTitle || "Hidden collection"}{plan ? ` · ${plan.destination.viewMode === "ROWS" ? "Rows" : "Tabs"}` : ""} · parent unchanged</span></div>
				<TitleOptions idPrefix="network-hierarchy" folderTitleVisibility={{ selectedId: options.folderTitleVisibility, name: "network-folder-title-visibility", onChange: (folderTitleVisibility) => onOptionsChange({ folderTitleVisibility }) }} />
				<ArtworkChoices options={options} onArtworkChange={onArtworkChange} disabled={isPreparing} />
			</>}
			{isPreparing ? <p className="studio-preview-state" role="status">Preparing folder artwork…</p> : null}
			{!isPreparing && !plan && !diagnostic ? <div className="editor-diagnostics" role="alert"><p>{planResult?.errors?.[0]?.message ?? "The Network plan could not be prepared."}</p></div> : null}
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
	const [options, setOptions] = useState(() => Object.freeze({ scope, destinationCollectionTitle, collectionTitle: "Networks", hideCollectionTitle: false, viewMode: "TABBED_GRID", showAllTab: true, pinToTop: false, folderTitleVisibility: DEFAULT_NETWORK_FOLDER_TITLE_VISIBILITY, artworkOrientation: DEFAULT_NETWORK_ARTWORK_ORIENTATION, sortOptionId: DEFAULT_NETWORK_SORT_OPTION_ID }));
	const [artworkBatch, setArtworkBatch] = useState(null);
	const [preview, setPreview] = useState(null);
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
	const previewCoordinatorRef = useRef(null);
	const previewTriggerRef = useRef(null);
	const previewTokenRef = useRef(null);
	const artworkTokenRef = useRef(null);
	const artworkSelectionIdsRef = useRef(chosenIds);
	const artworkOrientationRef = useRef(DEFAULT_NETWORK_ARTWORK_ORIENTATION);
	const isPreparingRef = useRef(false);
	const scrollByStepRef = useRef({ select: 0, configure: 0, appearance: 0 });
	artworkSelectionIdsRef.current = chosenIds;
	if (previewCoordinatorRef.current === null) previewCoordinatorRef.current = createAsyncRequestCoordinator();

	const planResult = useMemo(() => artworkBatch && artworkBatch.orientation === options.artworkOrientation && artworkBatch.items.length === chosen.length ? createNetworkHierarchyPlan(project, {
		scope,
		projectRevision,
		...(scope === "new-folder" ? { destinationCollectionInternalId } : {
			collectionTitle: options.collectionTitle,
			hideCollectionTitle: options.hideCollectionTitle,
			viewMode: options.viewMode,
			showAllTab: options.showAllTab,
			pinToTop: options.pinToTop,
		}),
		folderTitleVisibility: options.folderTitleVisibility,
		artworkOrientation: options.artworkOrientation,
		sortOptionId: options.sortOptionId,
		networks: chosen.map((network, index) => ({ network, artwork: artworkBatch.items[index] })),
	}) : null, [artworkBatch, chosen, destinationCollectionInternalId, options, project, projectRevision, scope]);

	const configureOutcomes = useMemo(() => Object.freeze(chosen.map((network) => {
		const result = buildNetworkHierarchySourceDraft(network, { sortOptionId: options.sortOptionId });
		return result.ok ? inspectNetworkHierarchyPlacement(project, result.draft, { destinationCollectionInternalId: scope === "new-folder" ? destinationCollectionInternalId : null }) : null;
	})), [chosen, destinationCollectionInternalId, options.sortOptionId, project, scope]);

	useEffect(() => () => {
		previewCoordinatorRef.current.cancel({ notify: false });
		previewTokenRef.current = null;
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

	async function requestPreview(network, trigger = null) {
		if (isPreparingRef.current) return;
		if (trigger) previewTriggerRef.current = trigger;
		previewCoordinatorRef.current.cancel({ notify: false });
		const sortOptionId = options.sortOptionId;
		const token = Symbol(`network-preview-${network.id}-${sortOptionId}`);
		previewTokenRef.current = token;
		setPreview({ network, sortOptionId, status: "loading", data: null, error: null });
		const outcome = await previewCoordinatorRef.current.run(
			({ signal }) => previewProvider.getNetworkPreview(network.id, { sortOptionId, signal }),
			{ networkId: network.id, mediaType: "TV", sortBy: networkSortValue(sortOptionId) },
		);
		if (!outcome.accepted || previewTokenRef.current !== token) return;
		if (outcome.result?.ok) {
			setPreview({ network, sortOptionId, status: "ready", data: outcome.result.data, error: null });
			setExactCounts((current) => Object.freeze({ ...current, [network.id]: outcome.result.data.totalResults }));
		} else if (outcome.result?.error?.kind !== "aborted") {
			setPreview({ network, sortOptionId, status: "error", data: null, error: outcome.result?.error ?? { message: "This Network preview could not be prepared." } });
		}
	}

	function closePreview() {
		previewCoordinatorRef.current.cancel({ notify: false });
		previewTokenRef.current = null;
		const trigger = previewTriggerRef.current;
		previewTriggerRef.current = null;
		setPreview(null);
		queueMicrotask(() => focusElementWithoutScroll(trigger));
	}

	function changeSort(sortOptionId) {
		if (isPreparingRef.current || sortOptionId === options.sortOptionId) return;
		previewCoordinatorRef.current.cancel({ notify: false });
		previewTokenRef.current = null;
		setPreview(null);
		updateOptions({ sortOptionId });
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
			if (!chosen.length || isPreparingRef.current) return;
			await prepareArtwork(options.artworkOrientation, { advance: true });
			return;
		}
		if (!artworkBatch && !isPreparing) {
			await prepareArtwork(options.artworkOrientation);
			return;
		}
		if (!planResult?.ok || planResult.plan.counts.folderCount === 0 || isApplying) return;
		setIsApplying(true);
		let result;
		try { result = await onApply(planResult.plan); } catch { result = { ok: false, errors: [{ message: "Networks could not be created. Try again." }] }; }
		if (result?.ok) return;
		setIsApplying(false);
		setDiagnostic(result?.errors?.[0] ?? { message: "Networks could not be created. Try again." });
	}

	const primaryDisabled = step === "select"
		? chosen.length === 0
		: step === "configure"
			? chosen.length === 0 || isPreparing
			: isPreparing || (artworkBatch ? (!planResult?.ok || planResult.plan.counts.folderCount === 0 || isApplying) : chosen.length === 0);
	const primaryLabel = step === "select"
		? `Configure ${chosen.length} Network${chosen.length === 1 ? "" : "s"}`
		: step === "configure"
			? isPreparing ? "Preparing artwork…" : "Continue to Appearance"
			: isPreparing ? "Preparing artwork…" : !artworkBatch ? "Retry artwork" : isApplying ? "Creating…" : `Create ${planResult?.ok ? planResult.plan.counts.folderCount : 0} folder${planResult?.ok && planResult.plan.counts.folderCount === 1 ? "" : "s"}`;

	return <>
		<CreationHeader title="Create with Networks" context={`${scopeLabel(scope)}${scope === "new-folder" && destinationCollectionTitle ? ` · ${destinationCollectionTitle}` : ""}`} description={step === "select" ? "Select Networks in folder order." : step === "configure" ? "Choose one shared Series sort and preview when useful." : "Choose presentation settings."} onBack={goBack} backAction={step === "select" ? "back-to-creation-launcher" : step === "configure" ? "back-to-network-selection" : "back-to-network-configuration"} backDisabled={isApplying || isPreparing} inactive={Boolean(preview)} onClose={onCancel} />
		<form className="add-source-form studio-hierarchy-form network-hierarchy-form" data-network-hierarchy-stage={step} onSubmit={submit} noValidate>
			<div ref={scrollRef} className="add-source-scroll" inert={preview || undefined} aria-hidden={preview ? "true" : undefined}>
				{step === "select" ? <>
					<div ref={selectHeadingRef} tabIndex={-1} className="studio-hierarchy-focus-target network-hierarchy-focus-target" />
					{chosen.length ? <section className="people-selected-tray studio-selected-tray network-selected-tray"><div className="people-selected-summary"><strong>{chosen.length} Network{chosen.length === 1 ? "" : "s"} selected</strong><SelectedNetworks networks={chosen} onRemove={removeNetwork} /></div>{notice.visible ? <p className="people-selection-limit" data-large-selection-notice="true" role="status">You’ve selected {notice.count} Networks. Configure may take a little longer, but there is no selection cap.</p> : null}</section> : null}
					<NetworkSearchStep input={search.input} parsedInput={search.parsedInput} lookupState={search.lookupState} searchData={search.searchData} browsing={search.browsing} seriesCountFilter={search.seriesCountFilter} showSeriesCountFilters onInputChange={search.handleInputChange} onSeriesCountFilterChange={search.changeSeriesCountFilter} onRetry={search.retrySearch} onSelect={() => {}} onChangePage={search.setPage} resultsHeading="Select Networks" renderResult={(network) => <SelectableNetworkResult key={network.id} network={network} checked={Boolean(selection.byId[network.id])} onToggle={toggleNetwork} />} />
				</> : step === "configure" ? <div inert={isPreparing || undefined} aria-busy={isPreparing ? "true" : undefined}><ConfigureStep networks={chosen} exactCounts={exactCounts} outcomes={configureOutcomes} sortOptionId={options.sortOptionId} onSortChange={changeSort} onPreview={requestPreview} onRemove={removeNetwork} headingRef={configureHeadingRef} />{diagnostic ? <div className="editor-diagnostics" role="alert"><p>{diagnostic.message}</p></div> : null}</div> : <AppearanceStep planResult={planResult} options={options} onOptionsChange={updateOptions} onArtworkChange={changeArtworkOrientation} diagnostic={diagnostic} headingRef={appearanceHeadingRef} isPreparing={isPreparing} />}
			</div>
			<footer className="add-source-actions"><button className="editor-apply" type="submit" disabled={primaryDisabled}>{primaryLabel}</button></footer>
		</form>
		{preview ? <NetworkTitlePreview preview={preview} onClose={closePreview} onRetry={() => requestPreview(preview.network)} /> : null}
	</>;
}
