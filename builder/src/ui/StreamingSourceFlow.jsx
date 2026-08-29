import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
	browseStreamingRegions,
	browseStreamingProviders,
	buildStreamingSourceDrafts,
	createAsyncRequestCoordinator,
	createSourceSubmissionGate,
	defaultStreamingMediaChoice,
	DEFAULT_STREAMING_SORT_OPTION_ID,
	INITIAL_ASYNC_REQUEST_STATE,
	inspectStreamingSourceDuplicates,
	reconcileStreamingSourceTitles,
	searchStreamingProviders,
	streamingDuplicateOverrideIdentity,
	streamingMediaChoiceSupport,
	streamingSourceCandidateKey,
	STREAMING_MEDIA_CHOICES,
	STREAMING_PROVIDER_BROWSE_MODES,
	STREAMING_REGION_BROWSE_MODES,
	STREAMING_SORT_OPTIONS,
	STREAMING_SOURCE_MODE,
	streamingProviderCommonAvailability,
	summarizeStreamingSourceDrafts,
} from "../source-add/index.js";
import {
	lockAddSourceDocumentBody,
	observeAddSourceViewport,
	resolveAddSourceViewportStyle,
} from "./add-source-modal-lifecycle.js";
import { restoreAddSourceSearchView } from "./add-source-navigation-state.js";
import { focusElementWithoutScroll } from "./hierarchy-menu-placement.js";
import { handleDialogKeyDown } from "./modal-focus.js";
import { SemanticSortChoices } from "./SemanticSortChoices.jsx";
import { SourceElsewhereNotice } from "./SourceElsewhereNotice.jsx";
import { TmdbEntityLogo } from "./TmdbEntityLogo.jsx";

export const STREAMING_SOURCE_STEPS = Object.freeze({
	PROVIDER: "provider",
	REGION: "region",
	CONFIGURE: "configure",
});

const usePrePaintLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function normalizedScrollTop(value) {
	return Math.max(0, Number.isFinite(value) ? value : 0);
}

function normalizedRegionCodes(value) {
	if (!Array.isArray(value) || value.length === 0) throw new TypeError("One or more Streaming region codes are required.");
	const seen = new Set();
	for (const code of value) {
		if (typeof code !== "string" || !/^[A-Z]{2}$/.test(code) || seen.has(code)) {
			throw new TypeError("Distinct normalized Streaming region codes are required.");
		}
		seen.add(code);
	}
	return Object.freeze([...value]);
}

export function toggleStreamingRegionSelection(selectedRegions, region) {
	if (!Array.isArray(selectedRegions)) throw new TypeError("A Streaming region selection is required.");
	const code = region?.code;
	if (typeof code !== "string" || !/^[A-Z]{2}$/.test(code) || typeof region?.name !== "string" || !region.name.trim()) {
		throw new TypeError("A known normalized Streaming region is required.");
	}
	return Object.freeze(selectedRegions.some((entry) => entry.code === code)
		? selectedRegions.filter((entry) => entry.code !== code)
		: [...selectedRegions, region]);
}

export function createStreamingSourceNavigationState() {
	return Object.freeze({
		step: STREAMING_SOURCE_STEPS.REGION,
		providerId: null,
		regionCodes: Object.freeze([]),
		providerScrollTop: 0,
		regionScrollTop: 0,
		restoreProviderId: null,
		restoreRegionCode: null,
	});
}

export function enterStreamingProviderStep(state, regionCodes, regionScrollTop = 0) {
	const normalizedCodes = normalizedRegionCodes(regionCodes);
	return Object.freeze({
		...state,
		step: STREAMING_SOURCE_STEPS.PROVIDER,
		providerId: null,
		regionCodes: normalizedCodes,
		regionScrollTop: normalizedScrollTop(regionScrollTop),
		restoreProviderId: null,
		restoreRegionCode: null,
	});
}

export function enterStreamingConfigureStep(state, providerId, providerScrollTop = 0) {
	if (!Number.isSafeInteger(providerId) || providerId <= 0) {
		throw new TypeError("A positive safe Streaming provider ID is required.");
	}
	return Object.freeze({
		...state,
		step: STREAMING_SOURCE_STEPS.CONFIGURE,
		providerId,
		providerScrollTop: normalizedScrollTop(providerScrollTop),
		restoreProviderId: null,
	});
}

export function returnStreamingNavigation(state) {
	if (state?.step === STREAMING_SOURCE_STEPS.CONFIGURE) {
		return Object.freeze({
			...state,
			step: STREAMING_SOURCE_STEPS.PROVIDER,
			restoreProviderId: state.providerId,
		});
	}
	if (state?.step === STREAMING_SOURCE_STEPS.PROVIDER) {
		return Object.freeze({ ...state, step: STREAMING_SOURCE_STEPS.REGION, restoreRegionCode: state.regionCodes.at(-1) ?? null });
	}
	return state;
}

export function completeStreamingNavigationRestore(state) {
	if (state?.restoreProviderId === null && state?.restoreRegionCode === null) return state;
	return Object.freeze({ ...state, restoreProviderId: null, restoreRegionCode: null });
}

function ProviderResult({ provider, regionCodes, onSelect }) {
	const availability = streamingProviderCommonAvailability(provider, regionCodes);
	const media = [availability.movies ? "Movies" : null, availability.series ? "Series" : null].filter(Boolean).join(" · ");
	return (
		<button
			className="add-source-result studio-result streaming-provider-result"
			type="button"
			data-streaming-provider={provider.id}
			onClick={() => onSelect(provider)}
		>
			<TmdbEntityLogo entity={provider} entityType="streaming-provider" context="result" />
			<span className="add-source-result-content">
				<span className="add-source-result-heading"><strong>{provider.name}</strong><span>TMDB {provider.id}</span></span>
				<span className="studio-result-metadata">{media}</span>
			</span>
		</button>
	);
}

export function StreamingProviderStep({
	browseMode,
	query,
	queryRef,
	providers,
	selectedRegions,
	onBrowseModeChange,
	onQueryChange,
	onSelect,
}) {
	const searching = Boolean(query.trim());
	const regionCodes = selectedRegions.map((region) => region.code);
	const singleRegion = selectedRegions.length === 1;
	const regionDescription = singleRegion
		? `${selectedRegions[0].name} · ${selectedRegions[0].code}`
		: `${selectedRegions.length} regions selected · ${regionCodes.join(" · ")}`;
	return (
		<>
			<section className="add-source-mode" aria-labelledby="streaming-provider-mode-title">
				<div><h3 id="streaming-provider-mode-title">Streaming service · Provider</h3><p>{regionDescription}</p></div>
			</section>
			<div className="editor-field add-source-query-field">
				<label htmlFor="streaming-provider-query">Search providers</label>
				<input ref={queryRef} id="streaming-provider-query" type="search" value={query} autoComplete="off" spellCheck="false" onChange={onQueryChange} />
				<p className="editor-field-help">Search providers available for every selected region by name or exact numeric TMDB provider ID.</p>
			</div>
			{singleRegion ? (
				<div className="studio-search-controls streaming-provider-browse" aria-label="Provider browse mode">
					<button type="button" aria-pressed={browseMode === STREAMING_PROVIDER_BROWSE_MODES.TOP} onClick={() => onBrowseModeChange(STREAMING_PROVIDER_BROWSE_MODES.TOP)}>Top providers</button>
					<button type="button" aria-pressed={browseMode === STREAMING_PROVIDER_BROWSE_MODES.ALL} onClick={() => onBrowseModeChange(STREAMING_PROVIDER_BROWSE_MODES.ALL)}>A–Z</button>
				</div>
			) : null}
			<section className="add-source-results" aria-labelledby="streaming-provider-results-title">
				<div className="add-source-section-heading">
					<div><p className="panel-kicker">{searching ? "Search results" : singleRegion && browseMode === STREAMING_PROVIDER_BROWSE_MODES.TOP ? "TMDB region order" : "Eligible providers A–Z"}</p><h3 id="streaming-provider-results-title">Choose a provider</h3></div>
					<span>{providers.length}</span>
				</div>
				{providers.length ? (
					<div className="add-source-result-list">
						{providers.map((provider) => <ProviderResult key={provider.id} provider={provider} regionCodes={regionCodes} onSelect={onSelect} />)}
					</div>
				) : <p className="add-source-empty-results">{searching ? "No eligible providers matched this search." : "No provider supports a common media type across every selected region."}</p>}
			</section>
		</>
	);
}

function RegionIdentity({ region }) {
	return (
		<span className="streaming-region-copy">
			<span><strong>{region.name}</strong><small>{region.code}</small></span>
		</span>
	);
}

function RegionResult({ region, selected, onSelect }) {
	return (
		<button className="streaming-region-result" type="button" data-streaming-region={region.code} data-selected={selected ? "true" : "false"} aria-pressed={selected} onClick={() => onSelect(region)}>
			<RegionIdentity region={region} />
			<span className="streaming-region-selected-mark" aria-hidden="true">{selected ? "✓" : ""}</span>
		</button>
	);
}

export function StreamingRegionStep({
	heading = "Choose regions",
	description = "Select one or more regions, then choose a provider available across them.",
	browseMode,
	query,
	queryRef,
	regions,
	selectedRegions,
	onQueryChange,
	onBrowseModeChange,
	onSelect,
}) {
	const searching = Boolean(query.trim());
	const selectedCodes = new Set(selectedRegions.map((region) => region.code));
	return (
		<>
			<section className="add-source-mode" aria-labelledby="streaming-region-mode-title">
				<div><h3 id="streaming-region-mode-title">{heading}</h3><p>{description}</p></div>
			</section>
			<div className="editor-field add-source-query-field">
				<label htmlFor="streaming-region-query">Search regions</label>
				<input ref={queryRef} id="streaming-region-query" type="search" value={query} autoComplete="off" spellCheck="false" onChange={onQueryChange} />
				<p className="editor-field-help">Search by region name or two-letter code. Selections remain active while filtering.</p>
			</div>
			<div className="studio-search-controls streaming-region-browse" aria-label="Region browse mode">
				<button type="button" aria-pressed={browseMode === STREAMING_REGION_BROWSE_MODES.COMMON} onClick={() => onBrowseModeChange(STREAMING_REGION_BROWSE_MODES.COMMON)}>Common</button>
				<button type="button" aria-pressed={browseMode === STREAMING_REGION_BROWSE_MODES.ALL} onClick={() => onBrowseModeChange(STREAMING_REGION_BROWSE_MODES.ALL)}>A–Z</button>
			</div>
			<section className="add-source-results" aria-labelledby="streaming-region-results-title">
				<div className="add-source-section-heading">
					<div><p className="panel-kicker">{searching ? "Search results" : browseMode === STREAMING_REGION_BROWSE_MODES.COMMON ? "Common regions" : "Regions A–Z"}</p><h3 id="streaming-region-results-title">Choose regions</h3></div>
					<span>{regions.length}</span>
				</div>
				{regions.length ? (
					<div className="add-source-result-list streaming-region-list">
						{regions.map((region) => <RegionResult key={region.code} region={region} selected={selectedCodes.has(region.code)} onSelect={onSelect} />)}
					</div>
				) : <p className="add-source-empty-results">No regions matched this search.</p>}
			</section>
		</>
	);
}

export function StreamingRegionActions({ selectedCount, onNext }) {
	return (
		<footer className="add-source-actions streaming-region-actions">
			<span role="status">{selectedCount} region{selectedCount === 1 ? "" : "s"} selected</span>
			<button className="editor-apply" type="button" disabled={selectedCount === 0} onClick={onNext}>Next</button>
		</footer>
	);
}

function generatedMediaLabel(mediaType) {
	return mediaType === "MOVIE" ? "Movies" : "Series";
}

export function StreamingConfigureStep({
	provider,
	regions,
	mediaChoice,
	sortOptionId,
	drafts,
	duplicateReview,
	applyDiagnostic,
	expandedCandidateKey = null,
	sourceTitles = {},
	titleErrors = new Map(),
	onMediaChange,
	onSortChange,
	onEditName,
	onTitleChange,
	onTitleInputMount,
	onUseDefaultName,
}) {
	const regionCodes = regions.map((region) => region.code);
	const support = streamingMediaChoiceSupport(provider, regionCodes);
	const summary = summarizeStreamingSourceDrafts(drafts, duplicateReview);
	const missingCount = summary.filter((entry) => !entry.existsInDestination).length;
	const noCommonMedia = !support.movies && !support.series;
	const regionDescription = regions.length === 1
		? `${regions[0].name ?? regions[0].code} · ${regions[0].code}`
		: `${regions.length} regions · ${regionCodes.join(" · ")}`;
	return (
		<section className="studio-configure streaming-configure" aria-labelledby="streaming-configure-title">
			{applyDiagnostic ? <div className="editor-diagnostics" role="alert"><p>{applyDiagnostic.message}</p></div> : null}
			<div className="studio-configure-identity streaming-configure-identity">
				<TmdbEntityLogo entity={provider} entityType="streaming-provider" size="w185" context="configure" loading="eager" />
				<div className="tmdb-review-identity-copy">
					<p className="panel-kicker">Selected provider</p>
					<h3 id="streaming-configure-title">{provider.name}</h3>
					<p>{regionDescription}</p>
				</div>
			</div>
			{noCommonMedia ? <div className="editor-diagnostics streaming-common-media-warning" role="alert"><p>Availability differs across these regions. Go Back and change your region selection.</p></div> : null}
			<fieldset className="studio-source-choices streaming-media-choices">
				<legend>Titles to add</legend>
				<div>
					{STREAMING_MEDIA_CHOICES.map((choice) => {
						const supported = support[choice.id];
						const availabilityCopy = supported
							? regions.length === 1 ? `Available in ${regions[0].code}` : `Available in all ${regions.length} regions`
							: regions.length === 1 ? `Not available in ${regions[0].code}` : "Not available in every selected region";
						return (
							<label key={choice.id} data-source-supported={supported ? "true" : "false"}>
								<input type="radio" name="streaming-media-choice" value={choice.id} checked={mediaChoice === choice.id} disabled={!supported} onChange={() => onMediaChange(choice.id)} />
								<span><strong>{choice.label}</strong><small>{availabilityCopy}</small></span>
							</label>
						);
					})}
				</div>
			</fieldset>
			<SemanticSortChoices options={STREAMING_SORT_OPTIONS} selectedId={sortOptionId} name="streaming-configure-sort" onChange={onSortChange} />
			{summary.length ? (
				<section className="streaming-generated-summary" aria-labelledby="streaming-generated-summary-title">
					<div><div><p className="panel-kicker">Generated sources</p><h4 id="streaming-generated-summary-title">{summary.length} source{summary.length === 1 ? "" : "s"} configured</h4></div><span>{missingCount} to add</span></div>
					<ul>
						{summary.map((entry) => {
							const candidateKey = streamingSourceCandidateKey(entry.regionCode, entry.mediaType);
							const customTitle = Object.hasOwn(sourceTitles, candidateKey) ? sourceTitles[candidateKey] : entry.title;
							const editing = expandedCandidateKey === candidateKey;
							const error = titleErrors.get(candidateKey) ?? null;
							const inputId = `streaming-source-name-${entry.regionCode}-${entry.mediaType.toLowerCase()}`;
							return (
								<li key={entry.identity ?? candidateKey} data-streaming-candidate-existing={entry.existsInDestination ? "true" : "false"} data-streaming-candidate-editing={editing ? "true" : "false"}>
									<div className="streaming-generated-source-row">
										<span><strong>{entry.regionCode} · {generatedMediaLabel(entry.mediaType)}</strong><small>{customTitle}</small></span>
										<div className="streaming-generated-source-actions">
											<em>{entry.existsInDestination ? "Already exists" : "To add"}</em>
											<button type="button" onClick={() => onEditName(candidateKey)}>{editing ? "Done" : "Edit name"}</button>
										</div>
									</div>
									{editing ? (
										<div className="editor-field streaming-generated-name-field">
											<label htmlFor={inputId}>Source name</label>
											<input ref={(element) => onTitleInputMount(candidateKey, element)} id={inputId} type="text" value={customTitle} aria-invalid={error ? "true" : undefined} aria-describedby={`${inputId}-help ${inputId}-error`} onChange={(event) => onTitleChange(candidateKey, event.target.value)} />
											<div><p className="editor-field-help" id={`${inputId}-help`}>Shown for this physical source in Nuvio.</p><button type="button" onClick={() => onUseDefaultName(candidateKey)}>Use default name</button></div>
											<p className="editor-field-error" id={`${inputId}-error`}>{error?.message ?? ""}</p>
										</div>
									) : null}
								</li>
							);
						})}
					</ul>
				</section>
			) : null}
			<SourceElsewhereNotice occurrences={duplicateReview.elsewhere} />
		</section>
	);
}

export function StreamingConfigureActions({
	hasDestinationDuplicates,
	primaryCount,
	configuredCount,
	hasInvalidNames = false,
	isApplying = false,
	onAddAll,
}) {
	return (
		<footer className="add-source-actions studio-configure-actions streaming-configure-actions">
			{hasDestinationDuplicates && primaryCount === 0
				? <span className="studio-no-missing-sources">No new sources to add</span>
				: <button className="editor-apply" type="submit" disabled={primaryCount === 0 || isApplying} aria-describedby={hasInvalidNames ? "streaming-generated-summary-title" : undefined}>{isApplying ? "Adding…" : `Add ${primaryCount} source${primaryCount === 1 ? "" : "s"}`}</button>}
			{hasDestinationDuplicates && configuredCount > 0 ? <button className="editor-cancel studio-add-all" type="button" disabled={isApplying} data-action="add-all-streaming-anyway" onClick={onAddAll}>Add all anyway</button> : null}
		</footer>
	);
}

export function StreamingSourceFlow({ catalogueProvider, project, folder, onBack, onCancel, onApply }) {
	const [navigation, setNavigation] = useState(createStreamingSourceNavigationState);
	const [catalogueState, setCatalogueState] = useState(INITIAL_ASYNC_REQUEST_STATE);
	const [retryGeneration, setRetryGeneration] = useState(0);
	const [providerQuery, setProviderQuery] = useState("");
	const [providerBrowseMode, setProviderBrowseMode] = useState(STREAMING_PROVIDER_BROWSE_MODES.TOP);
	const [regionQuery, setRegionQuery] = useState("");
	const [regionBrowseMode, setRegionBrowseMode] = useState(STREAMING_REGION_BROWSE_MODES.COMMON);
	const [selectedProvider, setSelectedProvider] = useState(null);
	const [selectedRegions, setSelectedRegions] = useState([]);
	const [mediaChoice, setMediaChoice] = useState(null);
	const [sortOptionId, setSortOptionId] = useState(DEFAULT_STREAMING_SORT_OPTION_ID);
	const [sourceTitles, setSourceTitles] = useState({});
	const [expandedCandidateKey, setExpandedCandidateKey] = useState(null);
	const [applyDiagnostic, setApplyDiagnostic] = useState(null);
	const [isApplying, setIsApplying] = useState(false);
	const [viewportStyle, setViewportStyle] = useState(() => typeof window === "undefined" ? null : resolveAddSourceViewportStyle(window));
	const dialogRef = useRef(null);
	const scrollRef = useRef(null);
	const providerQueryRef = useRef(null);
	const regionQueryRef = useRef(null);
	const configureRef = useRef(null);
	const catalogueCoordinatorRef = useRef(null);
	const submissionGateRef = useRef(null);
	const titleInputRefs = useRef(new Map());
	if (!catalogueCoordinatorRef.current) catalogueCoordinatorRef.current = createAsyncRequestCoordinator({ onStateChange: setCatalogueState });
	if (!submissionGateRef.current) submissionGateRef.current = createSourceSubmissionGate();

	const catalogue = catalogueState.status === "success" ? catalogueState.data : null;
	const regionCodes = selectedRegions.map((region) => region.code);
	const effectiveProviderBrowseMode = regionCodes.length === 1
		? providerBrowseMode
		: STREAMING_PROVIDER_BROWSE_MODES.ALL;
	const providers = useMemo(() => {
		const selectedCodes = selectedRegions.map((region) => region.code);
		if (selectedCodes.length === 0) return [];
		return providerQuery.trim()
			? searchStreamingProviders(catalogue?.providers ?? [], providerQuery, { regionCodes: selectedCodes })
			: browseStreamingProviders(catalogue?.providers ?? [], { mode: effectiveProviderBrowseMode, regionCodes: selectedCodes });
	}, [catalogue, effectiveProviderBrowseMode, providerQuery, selectedRegions]);
	const regions = useMemo(() => browseStreamingRegions(catalogue?.regions ?? [], { mode: regionBrowseMode, query: regionQuery }), [catalogue, regionBrowseMode, regionQuery]);
	const baseDraftResult = selectedProvider && regionCodes.length && mediaChoice
		? buildStreamingSourceDrafts(selectedProvider, { regionCodes, mediaChoice, sortOptionId })
		: { ok: false, drafts: [], errors: [] };
	const draftResult = selectedProvider && regionCodes.length && mediaChoice
		? buildStreamingSourceDrafts(selectedProvider, { regionCodes, mediaChoice, sortOptionId, sourceTitles })
		: { ok: false, drafts: [], errors: [] };
	const duplicateReview = baseDraftResult.ok
		? inspectStreamingSourceDuplicates(project, folder?.internalId ?? null, baseDraftResult.drafts)
		: { destination: [], elsewhere: [] };
	const candidateSummary = baseDraftResult.ok ? summarizeStreamingSourceDrafts(baseDraftResult.drafts, duplicateReview) : [];
	const titleErrors = new Map((draftResult.errors ?? [])
		.filter((entry) => entry.code === "INVALID_STREAMING_SOURCE_TITLE")
		.map((entry) => [entry.path.split(".").at(-1), entry]));
	const primaryCount = candidateSummary.filter((entry) => !entry.existsInDestination).length;
	const hasDestinationDuplicates = candidateSummary.some((entry) => entry.existsInDestination);
	const step = navigation.step;

	usePrePaintLayoutEffect(() => {
		const unlockBody = lockAddSourceDocumentBody();
		const stopViewport = observeAddSourceViewport(setViewportStyle);
		focusElementWithoutScroll(dialogRef.current);
		return () => { stopViewport(); unlockBody(); };
	}, []);

	useEffect(() => {
		const coordinator = catalogueCoordinatorRef.current;
		coordinator.cancel({ notify: false });
		setCatalogueState(INITIAL_ASYNC_REQUEST_STATE);
		coordinator.run(({ signal }) => catalogueProvider.loadCatalogue({ signal }), { kind: "streaming-catalogue" });
		return () => coordinator.cancel({ reset: false, notify: false });
	}, [catalogueProvider, retryGeneration]);

	useEffect(() => () => catalogueCoordinatorRef.current.cancel({ notify: false }), []);

	useEffect(() => {
		if (catalogueState.status !== "success") return;
		if (step === STREAMING_SOURCE_STEPS.REGION && navigation.restoreRegionCode === null) focusElementWithoutScroll(regionQueryRef.current);
		if (step === STREAMING_SOURCE_STEPS.PROVIDER && navigation.restoreProviderId === null) focusElementWithoutScroll(providerQueryRef.current);
	}, [catalogueState.status, navigation.restoreProviderId, navigation.restoreRegionCode, step]);

	useEffect(() => {
		if (navigation.restoreProviderId !== null) {
			const result = dialogRef.current?.querySelector?.(`[data-streaming-provider="${navigation.restoreProviderId}"]`);
			restoreAddSourceSearchView({ scrollElement: scrollRef.current, resultElement: result, fallbackElement: providerQueryRef.current, searchScrollTop: navigation.providerScrollTop, focusWithoutScroll: focusElementWithoutScroll });
			setNavigation(completeStreamingNavigationRestore);
		} else if (navigation.restoreRegionCode !== null) {
			const result = dialogRef.current?.querySelector?.(`[data-streaming-region="${navigation.restoreRegionCode}"]`);
			restoreAddSourceSearchView({ scrollElement: scrollRef.current, resultElement: result, fallbackElement: regionQueryRef.current, searchScrollTop: navigation.regionScrollTop, focusWithoutScroll: focusElementWithoutScroll });
			setNavigation(completeStreamingNavigationRestore);
		}
	}, [navigation]);

	function proceedToProviders() {
		if (selectedRegions.length === 0) return;
		setSelectedProvider(null);
		setProviderQuery("");
		setProviderBrowseMode(selectedRegions.length === 1 ? STREAMING_PROVIDER_BROWSE_MODES.TOP : STREAMING_PROVIDER_BROWSE_MODES.ALL);
		setMediaChoice(null);
		setSortOptionId(DEFAULT_STREAMING_SORT_OPTION_ID);
		setSourceTitles({});
		setExpandedCandidateKey(null);
		setApplyDiagnostic(null);
		setNavigation((current) => enterStreamingProviderStep(current, selectedRegions.map((region) => region.code), scrollRef.current?.scrollTop ?? 0));
	}

	function selectProvider(provider) {
		const defaultChoice = defaultStreamingMediaChoice(provider, regionCodes);
		if (defaultChoice === null) return;
		if (selectedProvider?.id !== provider.id) {
			setSourceTitles({});
			setExpandedCandidateKey(null);
		}
		setSelectedProvider(provider);
		setMediaChoice(defaultChoice);
		setSortOptionId(DEFAULT_STREAMING_SORT_OPTION_ID);
		setApplyDiagnostic(null);
		setNavigation((current) => enterStreamingConfigureStep(current, provider.id, scrollRef.current?.scrollTop ?? 0));
		queueMicrotask(() => focusElementWithoutScroll(configureRef.current));
	}

	function selectRegion(region) {
		setSelectedRegions((current) => toggleStreamingRegionSelection(current, region));
		setSelectedProvider(null);
		setSourceTitles({});
		setExpandedCandidateKey(null);
		setApplyDiagnostic(null);
	}

	function returnOneStep() {
		if (isApplying) return;
		setApplyDiagnostic(null);
		if (step === STREAMING_SOURCE_STEPS.REGION) onBack();
		else {
			if (step === STREAMING_SOURCE_STEPS.PROVIDER) {
				setSelectedProvider(null);
				setProviderQuery("");
			}
			setNavigation(returnStreamingNavigation);
		}
	}

	async function applyStreamingSources(addAll = false) {
		if (step !== STREAMING_SOURCE_STEPS.CONFIGURE || isApplying) return;
		if (!draftResult.ok) {
			const error = draftResult.errors?.[0] ?? { message: "Review the Streaming source configuration." };
			setApplyDiagnostic(error);
			if (error.code === "INVALID_STREAMING_SOURCE_TITLE") {
				const candidateKey = error.path.split(".").at(-1);
				setExpandedCandidateKey(candidateKey);
				queueMicrotask(() => focusElementWithoutScroll(titleInputRefs.current.get(candidateKey)));
			}
			return;
		}
		if (!submissionGateRef.current.begin()) return;
		setIsApplying(true);
		let result;
		try {
			result = await onApply({
				provider: selectedProvider,
				regions: selectedRegions,
				catalogueRegions: catalogue.regions,
				mediaChoice,
				sortOptionId,
				drafts: draftResult.drafts,
				duplicateOverrideIdentity: addAll ? streamingDuplicateOverrideIdentity(folder.internalId, draftResult.drafts) : null,
			});
		} catch {
			result = { ok: false, errors: [{ message: "The Streaming sources could not be added. Try again." }] };
		}
		if (result?.ok) return;
		submissionGateRef.current.reset();
		setIsApplying(false);
		setApplyDiagnostic(result?.errors?.[0] ?? { message: "The Streaming sources could not be added. Try again." });
	}

	function submit(event) {
		event.preventDefault();
		applyStreamingSources(false);
	}

	const cancel = () => {
		if (!isApplying && !submissionGateRef.current.isActive()) onCancel();
	};
	const descriptions = {
		[STREAMING_SOURCE_STEPS.REGION]: "Choose one or more regions, then continue to providers.",
		[STREAMING_SOURCE_STEPS.PROVIDER]: "Choose one provider with common availability across your selected regions.",
		[STREAMING_SOURCE_STEPS.CONFIGURE]: "Choose common media and sort options, review generated sources, then add.",
	};
	const content = (
		<div className="add-source-portal" data-add-source-portal="true" data-mobile-surface="opaque">
			<div className="settings-modal-backdrop add-source-backdrop" data-add-source-modal-backdrop="true" data-backdrop-dismiss="false" style={viewportStyle ?? undefined}>
				<section ref={dialogRef} className="add-source-dialog studio-source-dialog streaming-source-dialog" data-dialog-compact="true" data-add-source-modal="true" data-add-source-step={step} data-source-mode={STREAMING_SOURCE_MODE.id} role="dialog" aria-modal="true" aria-labelledby="streaming-source-title" aria-describedby="streaming-source-description" tabIndex={-1} onKeyDown={(event) => handleDialogKeyDown(event, dialogRef.current, cancel)}>
					<header className="add-source-heading">
						<div className="add-source-heading-row">
							<button className="add-source-header-action" type="button" disabled={isApplying} onClick={returnOneStep}><span aria-hidden="true">←</span>Back</button>
							<div><h2 id="streaming-source-title">Add a streaming service</h2><p>{folder?.editable?.title || "Selected folder"}</p></div>
							<button className="add-source-header-action add-source-close-action" type="button" aria-label="Close Add a streaming service" disabled={isApplying} onClick={cancel}>Close</button>
						</div>
						<p id="streaming-source-description" className="add-source-heading-description">{descriptions[step]}</p>
					</header>
					<form className="add-source-form" data-streaming-source-form-step={step} onSubmit={submit} noValidate>
						<div ref={scrollRef} className="add-source-scroll">
							{catalogueState.status === "loading" || catalogueState.status === "idle" ? (
								<p className="add-source-selection-status" role="status">Loading Streaming regions and providers…</p>
							) : catalogueState.status === "error" ? (
								<div className="add-source-request-state" role="alert"><p>{catalogueState.error?.message ?? "Streaming services could not be loaded. Try again."}</p><button type="button" onClick={() => setRetryGeneration((value) => value + 1)}>Retry</button></div>
							) : catalogue.regions.length === 0 ? (
								<p className="add-source-empty-results">No Streaming regions are available.</p>
							) : step === STREAMING_SOURCE_STEPS.REGION ? (
								<StreamingRegionStep browseMode={regionBrowseMode} query={regionQuery} queryRef={regionQueryRef} regions={regions} selectedRegions={selectedRegions} onBrowseModeChange={setRegionBrowseMode} onQueryChange={(event) => setRegionQuery(event.target.value)} onSelect={selectRegion} />
							) : step === STREAMING_SOURCE_STEPS.PROVIDER ? (
								<StreamingProviderStep browseMode={effectiveProviderBrowseMode} query={providerQuery} queryRef={providerQueryRef} providers={providers} selectedRegions={selectedRegions} onBrowseModeChange={setProviderBrowseMode} onQueryChange={(event) => setProviderQuery(event.target.value)} onSelect={selectProvider} />
							) : (
								<div ref={configureRef} className="studio-configure-focus-target" tabIndex={-1}>
									<StreamingConfigureStep provider={selectedProvider} regions={selectedRegions} mediaChoice={mediaChoice} sortOptionId={sortOptionId} drafts={baseDraftResult.drafts} duplicateReview={duplicateReview} applyDiagnostic={applyDiagnostic} expandedCandidateKey={expandedCandidateKey} sourceTitles={sourceTitles} titleErrors={titleErrors} onMediaChange={(choiceId) => {
										const next = buildStreamingSourceDrafts(selectedProvider, { regionCodes, mediaChoice: choiceId, sortOptionId });
										setMediaChoice(choiceId);
										setSourceTitles((current) => reconcileStreamingSourceTitles(current, next.drafts));
										if (expandedCandidateKey && !next.drafts.some((draft) => streamingSourceCandidateKey(draft.editable.filters.watchRegion, draft.editable.mediaType) === expandedCandidateKey)) setExpandedCandidateKey(null);
										setApplyDiagnostic(null);
									}} onSortChange={(optionId) => { setSortOptionId(optionId); setApplyDiagnostic(null); }} onEditName={(candidateKey) => {
										setExpandedCandidateKey((current) => current === candidateKey ? null : candidateKey);
										queueMicrotask(() => focusElementWithoutScroll(titleInputRefs.current.get(candidateKey)));
									}} onTitleChange={(candidateKey, title) => {
										setSourceTitles((current) => ({ ...current, [candidateKey]: title }));
										setApplyDiagnostic(null);
									}} onTitleInputMount={(candidateKey, element) => {
										if (element) titleInputRefs.current.set(candidateKey, element);
										else titleInputRefs.current.delete(candidateKey);
									}} onUseDefaultName={(candidateKey) => {
										setSourceTitles((current) => {
											const next = { ...current };
											delete next[candidateKey];
											return next;
										});
										setApplyDiagnostic(null);
									}} />
								</div>
							)}
						</div>
						{catalogueState.status === "success" && step === STREAMING_SOURCE_STEPS.REGION ? <StreamingRegionActions selectedCount={selectedRegions.length} onNext={proceedToProviders} /> : null}
						{step === STREAMING_SOURCE_STEPS.CONFIGURE && baseDraftResult.ok ? <StreamingConfigureActions hasDestinationDuplicates={hasDestinationDuplicates} primaryCount={primaryCount} configuredCount={baseDraftResult.drafts.length} hasInvalidNames={!draftResult.ok} isApplying={isApplying} onAddAll={() => applyStreamingSources(true)} /> : null}
					</form>
				</section>
			</div>
		</div>
	);
	return typeof document === "undefined" ? content : createPortal(content, document.body);
}
