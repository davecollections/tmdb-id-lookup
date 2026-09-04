import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
	buildNetworkSourceDraft,
	createAsyncRequestCoordinator,
	createSourceSubmissionGate,
	DEFAULT_NETWORK_SEARCH_SORT,
	DEFAULT_NETWORK_SORT_OPTION_ID,
	formatNetworkLocation,
	inspectNetworkSourceDuplicates,
	networkDuplicateOverrideIdentity,
	NETWORK_SERIES_COUNT_FILTER_OPTIONS,
	NETWORK_SEARCH_SORTS,
	NETWORK_SOURCE_MODE,
	requestSourceTitlePreview,
	sourceTitlePreviewProviderAvailable,
	sourceTitlePreviewRequest,
} from "../source-add/index.js";
import {
	lockAddSourceDocumentBody,
	observeAddSourceViewport,
	resolveAddSourceViewportStyle,
} from "./add-source-modal-lifecycle.js";
import { restoreAddSourceSearchView } from "./add-source-navigation-state.js";
import { focusElementWithoutScroll } from "./hierarchy-menu-placement.js";
import { handleDialogKeyDown } from "./modal-focus.js";
import { NetworkSortChoices } from "./NetworkSortChoices.jsx";
import {
	completeNetworkSearchRestore,
	createNetworkSourceNavigationState,
	enterNetworkConfigure,
	NETWORK_SOURCE_STEPS,
	returnNetworkToSearch,
} from "./network-source-navigation-state.js";
import { SourceElsewhereNotice } from "./SourceElsewhereNotice.jsx";
import { TmdbEntityLink } from "./TmdbEntityLink.jsx";
import { TmdbEntityLogo } from "./TmdbEntityLogo.jsx";
import { TmdbKnownZeroNotice } from "./TmdbKnownZeroNotice.jsx";
import { SourceTitlePreviewDialog } from "./SourceTitlePreviewDialog.jsx";
import { NETWORK_SEARCH_DEBOUNCE_MS, useNetworkCatalogueSearch } from "./use-network-catalogue-search.js";

export { NETWORK_SEARCH_DEBOUNCE_MS };
export { NETWORK_SOURCE_STEPS };

const usePrePaintLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
const INITIAL_NETWORK_COUNT = Object.freeze({ status: "not-checked", count: null, error: null });

export function NetworkLogo({ network, size = "w92", context = "result", loading = "lazy" }) {
	return <TmdbEntityLogo entity={network} entityType="network" size={size} context={context} loading={loading} />;
}

function networkSeriesCountLabel(network) {
	return Number.isSafeInteger(network?.seriesCount) && network.seriesCount >= 0
		? network.seriesCount.toLocaleString("en")
		: "Unknown";
}

export function NetworkResultContent({ network, showSeriesCount = false }) {
	const metadata = network.location || formatNetworkLocation(network);
	return <>
		<NetworkLogo network={network} context="result" />
		<span className="add-source-result-content">
			<span className="add-source-result-heading"><strong>{network.name}</strong><span>TMDB {network.id}</span></span>
			{metadata ? <span className="studio-result-metadata network-result-metadata">{metadata}</span> : null}
			{showSeriesCount ? <span className="studio-result-count network-result-count">Series Count: {networkSeriesCountLabel(network)}</span> : null}
		</span>
	</>;
}

function NetworkResult({ network, selected = false, showSeriesCount = false, onSelect }) {
	return (
		<button
			className={`add-source-result studio-result network-result${selected ? " is-selected" : ""}`}
			type="button"
			aria-pressed={selected}
			data-tmdb-network-result={network.id}
			onClick={() => onSelect(network)}
		>
			<NetworkResultContent network={network} showSeriesCount={showSeriesCount} />
		</button>
	);
}

export function NetworkSearchStep({
	input,
	inputRef,
	parsedInput,
	lookupState,
	searchData,
	effectiveSearchSort = DEFAULT_NETWORK_SEARCH_SORT,
	browsing = false,
	seriesCountFilter = null,
	showSeriesCountFilters = false,
	selectedNetworkId = null,
	onInputChange,
	onSortChange = () => {},
	onSeriesCountFilterChange = () => {},
	onRetry,
	onSelect,
	onChangePage,
	resultsHeading = "Choose a Network",
	renderResult = null,
}) {
	return (
		<>
			<section className="add-source-mode" aria-labelledby="network-mode-title">
				<div><h3 id="network-mode-title">Networks · TMDB</h3><p>Search by Network name, country, location or TMDB ID.</p></div>
			</section>
			<div className="editor-field add-source-query-field">
				<label htmlFor="network-source-query">Search Networks</label>
				<input
					ref={inputRef}
					id="network-source-query"
					type="search"
					value={input}
					autoComplete="off"
					spellCheck="false"
					aria-invalid={parsedInput.kind === "invalid" ? "true" : undefined}
					aria-describedby="network-source-query-help network-source-query-status"
					onChange={onInputChange}
				/>
				<p className="editor-field-help" id="network-source-query-help">Empty search browses Networks by Most series. Names, countries and headquarters are searchable.</p>
				<p id="network-source-query-status" className={parsedInput.kind === "invalid" ? "editor-field-error" : "editor-field-status"} role={parsedInput.kind === "invalid" ? "alert" : "status"}>
					{parsedInput.kind === "invalid"
						? parsedInput.message
						: parsedInput.kind === "search" && !parsedInput.eligible
							? parsedInput.message
							: lookupState.status === "loading" ? "Searching Networks…" : null}
				</p>
			</div>
			{showSeriesCountFilters ? (
				<div className="studio-search-controls studio-search-controls--hierarchy network-search-controls" aria-label="Network result controls">
					<div className="studio-search-control-group studio-search-count-controls" role="group" aria-label="Series Count filter">
						<span className="studio-search-control-label">Series count</span>
						<span className="studio-search-control-buttons">{NETWORK_SERIES_COUNT_FILTER_OPTIONS.map((option) => <button key={option.id} type="button" aria-pressed={seriesCountFilter === option.id} aria-label={`Series Count ${option.label}`} onClick={() => onSeriesCountFilterChange(option.id)}>{option.label}</button>)}</span>
					</div>
					<div className="studio-search-control-group studio-search-order-controls" role="group" aria-label="Network result order">
						<span className="studio-search-control-label">Sort</span>
						<span className="studio-search-control-buttons">
							<button type="button" aria-pressed={effectiveSearchSort === NETWORK_SEARCH_SORTS.NAME_ASC} aria-label="Order Networks A–Z" onClick={() => onSortChange(NETWORK_SEARCH_SORTS.NAME_ASC)}>A–Z</button>
							<button type="button" aria-pressed={effectiveSearchSort === NETWORK_SEARCH_SORTS.SERIES_COUNT_DESC} aria-label="Order Networks by most series" onClick={() => onSortChange(NETWORK_SEARCH_SORTS.SERIES_COUNT_DESC)}>Most series</button>
						</span>
					</div>
				</div>
			) : null}
			{lookupState.status === "error" ? (
				<div className="add-source-request-state" role="alert">
					<p>{lookupState.error?.message ?? "Networks could not be searched. Try again."}</p>
					{lookupState.error?.retryable ? <button type="button" onClick={onRetry}>Retry</button> : null}
				</div>
			) : null}
			{searchData ? (
				<section className="add-source-results" aria-labelledby="network-results-title">
					<div className="add-source-section-heading">
						<div><p className="panel-kicker">Network results</p><h3 id="network-results-title">{resultsHeading}</h3></div>
						{searchData.totalPages > 1 ? <span>Page {searchData.page} of {searchData.totalPages}</span> : null}
					</div>
					{searchData.results.length ? (
						<div className="add-source-result-list">
							{searchData.results.map((network) => renderResult ? renderResult(network) : <NetworkResult key={network.id} network={network} selected={network.id === selectedNetworkId} showSeriesCount={showSeriesCountFilters} onSelect={onSelect} />)}
						</div>
					) : <p className="add-source-empty-results">{browsing ? "No Networks are available." : "No Networks matched this search."}</p>}
					{searchData.totalPages > 1 ? (
						<nav className="add-source-pagination" aria-label="Network search result pages">
							<button type="button" disabled={searchData.page <= 1 || lookupState.status === "loading"} onClick={() => onChangePage(searchData.page - 1)}>Previous page</button>
							<button type="button" disabled={searchData.page >= searchData.totalPages || lookupState.status === "loading"} onClick={() => onChangePage(searchData.page + 1)}>Next page</button>
						</nav>
					) : null}
				</section>
			) : null}
		</>
	);
}

function networkCountText(count) {
	if (count?.status === "ready") return { text: `Series Count: ${count.count.toLocaleString("en")}`, state: count.count === 0 ? "zero" : "ready" };
	if (count?.status === "unavailable") return { text: "Count unavailable", state: "unavailable" };
	return { text: "Checking Series Count…", state: "checking" };
}

export function NetworkConfigureStep({ network, count, duplicateReview, applyDiagnostic, sortOptionId, onSortChange }) {
	const countDisplay = networkCountText(count);
	const duplicate = duplicateReview.destination.length > 0;
	return (
		<section className="studio-configure network-configure" aria-labelledby="network-configure-title">
			{applyDiagnostic ? <div className="editor-diagnostics" role="alert"><p>{applyDiagnostic.message}</p></div> : null}
			<div className="studio-configure-identity tmdb-review-identity network-configure-identity">
				<NetworkLogo network={network} size="w185" context="configure" loading="eager" />
				<div className="tmdb-review-identity-copy">
					<p className="panel-kicker">Selected Network</p>
					<h3 id="network-configure-title">{network.name}</h3>
					{formatNetworkLocation(network) ? <p>{formatNetworkLocation(network)}</p> : null}
				</div>
				<TmdbEntityLink entityType="network" tmdbId={network.id} entityName={network.name} />
			</div>
			<div className="studio-edit-source-card network-series-card" data-count-state={countDisplay.state}>
				<span><strong>Series</strong><small>One Network Series source</small></span>
				<em>{countDisplay.text}</em>
				<TmdbKnownZeroNotice count={count} entity="network" media="series" canStillAdd />
			</div>
			{duplicate ? <p className="studio-duplicate-note network-duplicate-note" role="status" data-network-duplicate-warning="true">Series already exists in this folder.</p> : null}
			<NetworkSortChoices selectedId={sortOptionId} name="network-configure-sort" onChange={onSortChange} />
			<SourceElsewhereNotice occurrences={duplicateReview.elsewhere} />
		</section>
	);
}

export function NetworkConfigureActions({ duplicate, isApplying = false, onAddAnyway }) {
	return (
		<footer className="add-source-actions studio-configure-actions network-configure-actions">
			{duplicate
				? <span className="studio-no-missing-sources">No new sources to add</span>
				: <button className="editor-apply" type="submit" disabled={isApplying}>{isApplying ? "Adding…" : "Add 1 source"}</button>}
			{duplicate ? <button className="editor-cancel studio-add-all" type="button" disabled={isApplying} data-action="add-network-anyway" onClick={onAddAnyway}>Add anyway</button> : null}
		</footer>
	);
}

export function NetworkSourceFlow({ catalogueProvider, countProvider, previewProvider, project, folder, onBack, onCancel, onApply }) {
	const [navigation, setNavigation] = useState(createNetworkSourceNavigationState);
	const [selectedNetwork, setSelectedNetwork] = useState(null);
	const [count, setCount] = useState(INITIAL_NETWORK_COUNT);
	const [sortOptionId, setSortOptionId] = useState(DEFAULT_NETWORK_SORT_OPTION_ID);
	const [applyDiagnostic, setApplyDiagnostic] = useState(null);
	const [isApplying, setIsApplying] = useState(false);
	const [preview, setPreview] = useState(null);
	const [viewportStyle, setViewportStyle] = useState(() => typeof window === "undefined" ? null : resolveAddSourceViewportStyle(window));
	const dialogRef = useRef(null);
	const scrollRef = useRef(null);
	const inputRef = useRef(null);
	const configureRef = useRef(null);
	const countCoordinatorRef = useRef(null);
	const submissionGateRef = useRef(null);
	const previewTriggerRef = useRef(null);
	const previewCoordinatorRef = useRef(null);
	if (!countCoordinatorRef.current) countCoordinatorRef.current = createAsyncRequestCoordinator();
	if (!submissionGateRef.current) submissionGateRef.current = createSourceSubmissionGate();
	if (!previewCoordinatorRef.current) previewCoordinatorRef.current = createAsyncRequestCoordinator();

	const search = useNetworkCatalogueSearch(catalogueProvider, { seriesCountFilters: true });
	const duplicateReview = selectedNetwork
		? inspectNetworkSourceDuplicates(project, folder?.internalId ?? null, selectedNetwork.id)
		: { destination: [], elsewhere: [] };
	const draftResult = selectedNetwork ? buildNetworkSourceDraft(selectedNetwork, { sortOptionId }) : { ok: false, draft: null, errors: [] };
	const duplicate = duplicateReview.destination.length > 0;
	const step = navigation.step;

	usePrePaintLayoutEffect(() => {
		const unlockBody = lockAddSourceDocumentBody();
		const stopViewport = observeAddSourceViewport(setViewportStyle);
		focusElementWithoutScroll(inputRef.current ?? dialogRef.current);
		return () => { stopViewport(); unlockBody(); };
	}, []);

	useEffect(() => () => {
		countCoordinatorRef.current.cancel({ notify: false });
		previewCoordinatorRef.current.cancel({ notify: false });
	}, []);

	useEffect(() => {
		if (navigation.step !== NETWORK_SOURCE_STEPS.SEARCH || navigation.restoreSearchFocusId === null) return;
		const result = dialogRef.current?.querySelector?.(`[data-tmdb-network-result="${navigation.restoreSearchFocusId}"]`);
		restoreAddSourceSearchView({
			scrollElement: scrollRef.current,
			resultElement: result,
			fallbackElement: inputRef.current,
			searchScrollTop: navigation.searchScrollTop,
			focusWithoutScroll: focusElementWithoutScroll,
		});
		setNavigation(completeNetworkSearchRestore);
	}, [navigation]);

	async function loadCount(network) {
		setCount(Object.freeze({ status: "checking", count: null, error: null }));
		const outcome = await countCoordinatorRef.current.run(
			({ signal }) => countProvider.getNetworkCount(network.id, { signal }),
			{ networkId: network.id },
		);
		if (!outcome.accepted) return;
		if (outcome.result?.ok === true) setCount(outcome.result.data);
		else if (outcome.result?.error?.kind !== "aborted") setCount(Object.freeze({ status: "unavailable", count: null, error: { message: "Count unavailable" } }));
	}

	function selectNetwork(network) {
		countCoordinatorRef.current.cancel({ notify: false });
		setSelectedNetwork(network);
		setSortOptionId(DEFAULT_NETWORK_SORT_OPTION_ID);
		setApplyDiagnostic(null);
		setNavigation((current) => enterNetworkConfigure(current, network.id, scrollRef.current?.scrollTop ?? 0));
		loadCount(network);
		queueMicrotask(() => focusElementWithoutScroll(configureRef.current));
	}

	function returnToSearch() {
		if (isApplying) return;
		countCoordinatorRef.current.cancel({ notify: false });
		setApplyDiagnostic(null);
		setNavigation(returnNetworkToSearch);
	}

	function handleSearchInputChange(event) {
		search.handleInputChange(event);
		setApplyDiagnostic(null);
	}

	async function applyNetworkSource(addAnyway = false) {
		if (step !== NETWORK_SOURCE_STEPS.CONFIGURE || !draftResult.ok || isApplying || !submissionGateRef.current.begin()) return;
		setIsApplying(true);
		let result;
		try {
			result = await onApply({
				network: selectedNetwork,
				draft: draftResult.draft,
				duplicateOverrideIdentity: addAnyway ? networkDuplicateOverrideIdentity(folder.internalId, draftResult.draft) : null,
			});
		} catch {
			result = { ok: false, errors: [{ message: "The Network source could not be added. Try again." }] };
		}
		if (result?.ok) return;
		submissionGateRef.current.reset();
		setIsApplying(false);
		setApplyDiagnostic(result?.errors?.[0] ?? { message: "The Network source could not be added. Try again." });
	}

	function submit(event) {
		event.preventDefault();
		applyNetworkSource(false);
	}

	function networkPreviewCandidate() {
		return draftResult.ok ? Object.freeze({ sourceDraft: draftResult.draft, request: sourceTitlePreviewRequest("network", draftResult.draft) }) : null;
	}

	async function loadPreview(candidate) {
		setPreview({ status: "loading", candidate, data: null, error: null });
		const outcome = await previewCoordinatorRef.current.run(
			({ signal }) => requestSourceTitlePreview(candidate.request, { network: previewProvider }, signal),
			"network",
		);
		if (!outcome.accepted) return;
		if (outcome.result?.ok) setPreview({ status: "ready", candidate, data: outcome.result.data, error: null });
		else if (outcome.result?.error?.kind !== "aborted") setPreview({ status: "error", candidate, data: null, error: outcome.result?.error });
	}

	function openPreview(event) {
		const candidate = networkPreviewCandidate();
		if (!candidate || isApplying) return;
		previewTriggerRef.current = event.currentTarget;
		loadPreview(candidate);
	}

	function closePreview() {
		previewCoordinatorRef.current.cancel({ notify: false });
		setPreview(null);
		const trigger = previewTriggerRef.current;
		previewTriggerRef.current = null;
		window.requestAnimationFrame(() => focusElementWithoutScroll(trigger));
	}

	const cancel = () => {
		if (!isApplying && !submissionGateRef.current.isActive()) onCancel();
	};
	const previewRequest = draftResult.ok ? sourceTitlePreviewRequest("network", draftResult.draft) : null;
	const previewAvailable = sourceTitlePreviewProviderAvailable(previewRequest, { network: previewProvider });
	const content = (
		<div className="add-source-portal" data-add-source-portal="true" data-mobile-surface="opaque">
			<div className="settings-modal-backdrop add-source-backdrop" data-add-source-modal-backdrop="true" data-backdrop-dismiss="false" style={viewportStyle ?? undefined}>
				<section ref={dialogRef} className="add-source-dialog studio-source-dialog network-source-dialog" data-dialog-compact="true" data-add-source-modal="true" data-add-source-step={step} data-source-mode={NETWORK_SOURCE_MODE.id} data-preview-open={preview ? "true" : undefined} role="dialog" aria-modal="true" aria-labelledby="network-source-title" aria-describedby="network-source-description" tabIndex={-1} onKeyDown={(event) => handleDialogKeyDown(event, dialogRef.current, cancel)}>
					<header className="add-source-heading" inert={preview || undefined} aria-hidden={preview ? "true" : undefined}>
						<div className="add-source-heading-row">
							<button className="add-source-header-action" type="button" disabled={isApplying} onClick={step === NETWORK_SOURCE_STEPS.SEARCH ? onBack : returnToSearch}><span aria-hidden="true">←</span>Back</button>
							<div><h2 id="network-source-title">Add Network</h2><p>{folder?.editable?.title || "Selected folder"}</p></div>
							<button className="add-source-header-action add-source-close-action" type="button" aria-label="Close Add Network" disabled={isApplying} onClick={cancel}>Close</button>
						</div>
						<p id="network-source-description" className="add-source-heading-description">{step === NETWORK_SOURCE_STEPS.SEARCH ? "Find a Network to add to this folder." : "Review this Network Series source."}</p>
					</header>
					<form className="add-source-form" data-network-source-form-step={step} onSubmit={submit} noValidate inert={preview || undefined} aria-hidden={preview ? "true" : undefined}>
						<div ref={scrollRef} className="add-source-scroll">
							{step === NETWORK_SOURCE_STEPS.SEARCH ? (
								<NetworkSearchStep input={search.input} inputRef={inputRef} parsedInput={search.parsedInput} lookupState={search.lookupState} searchData={search.searchData} effectiveSearchSort={search.effectiveSearchSort} browsing={search.browsing} seriesCountFilter={search.seriesCountFilter} showSeriesCountFilters selectedNetworkId={selectedNetwork?.id ?? null} onInputChange={handleSearchInputChange} onSortChange={search.toggleSearchSort} onSeriesCountFilterChange={search.changeSeriesCountFilter} onRetry={search.retrySearch} onSelect={selectNetwork} onChangePage={search.setPage} />
							) : (
								<div ref={configureRef} className="studio-configure-focus-target" tabIndex={-1}>
									<NetworkConfigureStep network={selectedNetwork} count={count} duplicateReview={duplicateReview} applyDiagnostic={applyDiagnostic} sortOptionId={sortOptionId} onSortChange={(optionId) => { setSortOptionId(optionId); setApplyDiagnostic(null); }} />
									<div className="source-edit-preview-action genre-hierarchy-configure-row-actions"><button type="button" aria-haspopup="dialog" data-action="preview-add-network" disabled={!previewAvailable || isApplying} onClick={openPreview}>Preview titles</button>{!previewAvailable ? <p className="editor-field-help">Preview is unavailable right now.</p> : null}</div>
								</div>
							)}
						</div>
						{step === NETWORK_SOURCE_STEPS.CONFIGURE ? <NetworkConfigureActions duplicate={duplicate} isApplying={isApplying} onAddAnyway={() => applyNetworkSource(true)} /> : null}
					</form>
				</section>
			</div>
			{preview ? <SourceTitlePreviewDialog preview={preview} titleId="network-add-preview-title" backdropProps={{ "data-network-add-preview-backdrop": "true" }} dialogProps={{ "data-network-add-preview": "true" }} onClose={closePreview} onRetry={() => loadPreview(preview.candidate)} /> : null}
		</div>
	);
	return typeof document === "undefined" ? content : createPortal(content, document.body);
}
