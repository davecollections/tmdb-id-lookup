import {
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import {
	buildStudioSourceDrafts,
	createAsyncRequestCoordinator,
	createSourceSubmissionGate,
	DEFAULT_STUDIO_SEARCH_SORT,
	DEFAULT_STUDIO_SORT_OPTION_ID,
	formatStudioLocation,
	inspectStudioSourceDuplicates,
	requestSourceTitlePreview,
	sourceTitlePreviewProviderAvailable,
	sourceTitlePreviewRequest,
	studioDuplicateOverrideIdentity,
	STUDIO_SOURCE_MODE,
	STUDIO_SOURCE_OPTIONS,
	STUDIO_SEARCH_SORTS,
	STUDIO_MOVIE_COUNT_FILTER_OPTIONS,
} from "../source-add/index.js";
import {
	lockAddSourceDocumentBody,
	observeAddSourceViewport,
	resolveAddSourceViewportStyle,
} from "./add-source-modal-lifecycle.js";
import { restoreAddSourceSearchView } from "./add-source-navigation-state.js";
import { focusElementWithoutScroll } from "./hierarchy-menu-placement.js";
import { handleDialogKeyDown } from "./modal-focus.js";
import { StudioSortChoices } from "./StudioSortChoices.jsx";
import { SourceElsewhereNotice } from "./SourceElsewhereNotice.jsx";
import { TmdbEntityLink } from "./TmdbEntityLink.jsx";
import { TmdbEntityLogo } from "./TmdbEntityLogo.jsx";
import { TmdbKnownZeroNotice } from "./TmdbKnownZeroNotice.jsx";
import { SourceTitlePreviewDialog } from "./SourceTitlePreviewDialog.jsx";
import {
	completeStudioSearchRestore,
	createStudioSourceNavigationState,
	enterStudioConfigure,
	returnStudioToSearch,
	STUDIO_SOURCE_STEPS,
} from "./studio-source-navigation-state.js";
import { STUDIO_SEARCH_DEBOUNCE_MS, useStudioCatalogueSearch } from "./use-studio-catalogue-search.js";

export { STUDIO_SEARCH_DEBOUNCE_MS };
export { STUDIO_SOURCE_STEPS };

const usePrePaintLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
const INITIAL_COUNTS = Object.freeze({
	movie: Object.freeze({ status: "not-checked", count: null, error: null }),
	series: Object.freeze({ status: "not-checked", count: null, error: null }),
});

export function StudioLogo({ studio, size = "w92", context = "result", loading = "lazy" }) {
	return <TmdbEntityLogo entity={studio} entityType="studio" size={size} context={context} loading={loading} />;
}

export function StudioResultContent({ studio }) {
	const metadata = studio.location || formatStudioLocation(studio);
	const movieCount = Number.isSafeInteger(studio.movieCount) && studio.movieCount >= 0
		? studio.movieCount.toLocaleString("en")
		: "Unknown";
	return <>
		<StudioLogo studio={studio} context="result" />
		<span className="add-source-result-content">
			<span className="add-source-result-heading"><strong>{studio.name}</strong><span>TMDB {studio.id}</span></span>
			{metadata ? <span className="studio-result-metadata">{metadata}</span> : null}
			{studio.parentCompany ? <span className="studio-result-parent">Parent: {studio.parentCompany}</span> : null}
			<span className="studio-result-count">Movie Count: {movieCount}</span>
		</span>
	</>;
}

function StudioResult({ studio, selected = false, onSelect }) {
	return (
		<button
			className={`add-source-result studio-result${selected ? " is-selected" : ""}`}
			type="button"
			aria-pressed={selected}
			data-tmdb-studio-result={studio.id}
			onClick={() => onSelect(studio)}
		>
			<StudioResultContent studio={studio} />
		</button>
	);
}

export function StudioSearchStep({
	input,
	inputRef,
	parsedInput,
	lookupState,
	searchData,
	effectiveSearchSort = DEFAULT_STUDIO_SEARCH_SORT,
	browsing = false,
	movieCountFilter = null,
	selectedStudioId = null,
	onInputChange,
	onSortChange = () => {},
	onMovieCountFilterChange = () => {},
	onRetry,
	onSelect,
	onChangePage,
	renderResult = null,
	resultsHeading = "Choose a studio",
}) {
	return (
		<>
			<section className="add-source-mode" aria-labelledby="studio-mode-title">
				<div>
					<h3 id="studio-mode-title">Studios · TMDB</h3>
					<p>Search by studio name, location or TMDB ID.</p>
				</div>
			</section>
			<div className="editor-field add-source-query-field">
				<label htmlFor="studio-source-query">Search studios</label>
				<input
					ref={inputRef}
					id="studio-source-query"
					type="search"
					value={input}
					autoComplete="off"
					spellCheck="false"
					aria-invalid={parsedInput.kind === "invalid" ? "true" : undefined}
					aria-describedby="studio-source-query-help studio-source-query-status"
					onChange={onInputChange}
				/>
				<p className="editor-field-help" id="studio-source-query-help">Names, parent studios, countries and headquarters are searchable.</p>
				<p id="studio-source-query-status" className={parsedInput.kind === "invalid" ? "editor-field-error" : "editor-field-status"} role={parsedInput.kind === "invalid" ? "alert" : "status"}>
					{parsedInput.kind === "invalid"
						? parsedInput.message
						: parsedInput.kind === "search" && !parsedInput.eligible
							? parsedInput.message
							: lookupState.status === "loading"
								? "Searching Studios…"
								: null}
				</p>
			</div>
			<div className="studio-search-controls studio-search-controls--hierarchy" aria-label="Studio result controls">
				<div className="studio-search-control-group studio-search-count-controls" role="group" aria-label="Movie Count filter"><span className="studio-search-control-label">Movie count</span><span className="studio-search-control-buttons">{STUDIO_MOVIE_COUNT_FILTER_OPTIONS.map((option) => <button key={option.id} type="button" aria-pressed={movieCountFilter === option.id} aria-label={`Movie Count ${option.label}`} onClick={() => onMovieCountFilterChange(option.id)}>{option.label}</button>)}</span></div>
				<div className="studio-search-control-group studio-search-order-controls" role="group" aria-label="Studio result order"><span className="studio-search-control-label">Sort</span><span className="studio-search-control-buttons">
					<button type="button" aria-pressed={effectiveSearchSort === STUDIO_SEARCH_SORTS.NAME_ASC} aria-label="Order Studios A–Z" onClick={() => onSortChange(STUDIO_SEARCH_SORTS.NAME_ASC)}>A–Z</button>
					<button type="button" aria-pressed={effectiveSearchSort === STUDIO_SEARCH_SORTS.MOVIE_COUNT_DESC} aria-label="Order Studios by most movies" onClick={() => onSortChange(STUDIO_SEARCH_SORTS.MOVIE_COUNT_DESC)}>Most movies</button>
				</span></div>
			</div>
			{lookupState.status === "error" ? (
				<div className="add-source-request-state" role="alert">
					<p>{lookupState.error?.message ?? "Studios could not be searched. Try again."}</p>
					{lookupState.error?.retryable ? <button type="button" onClick={onRetry}>Retry</button> : null}
				</div>
			) : null}
			{searchData ? (
				<section className="add-source-results" aria-labelledby="studio-results-title">
					<div className="add-source-section-heading">
						<div><p className="panel-kicker">Studio results</p><h3 id="studio-results-title">{resultsHeading}</h3></div>
						{searchData.totalPages > 1 ? <span>Page {searchData.page} of {searchData.totalPages}</span> : null}
					</div>
					{searchData.results.length ? (
						<div className="add-source-result-list">
							{searchData.results.map((studio) => renderResult ? renderResult(studio) : <StudioResult key={studio.id} studio={studio} selected={studio.id === selectedStudioId} onSelect={onSelect} />)}
						</div>
					) : <p className="add-source-empty-results">{browsing ? "No Studios are available for these filters." : "No Studios matched this search."}</p>}
					{searchData.totalPages > 1 ? (
						<nav className="add-source-pagination" aria-label="Studio search result pages">
							<button type="button" disabled={searchData.page <= 1 || lookupState.status === "loading"} onClick={() => onChangePage(searchData.page - 1)}>Previous page</button>
							<button type="button" disabled={searchData.page >= searchData.totalPages || lookupState.status === "loading"} onClick={() => onChangePage(searchData.page + 1)}>Next page</button>
						</nav>
					) : null}
				</section>
			) : null}
		</>
	);
}

function currentCountText(option, count) {
	if (count?.status === "ready") {
		const noun = option.mediaType === "MOVIE" ? "movie" : "series";
		return {
			text: `${count.count.toLocaleString("en")} ${noun}${option.mediaType === "MOVIE" && count.count !== 1 ? "s" : ""}`,
			state: count.count === 0 ? "zero" : "ready",
		};
	}
	if (count?.status === "unavailable") return { text: "Count unavailable", state: "unavailable" };
	return { text: "Checking…", state: "checking" };
}

function joinedLabels(options) {
	const labels = options.map((option) => option.label);
	if (labels.length <= 1) return labels[0] ?? "";
	return `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
}

export function StudioDuplicateNotice({ duplicateReview }) {
	const duplicateMedia = new Set(duplicateReview.destination.map((entry) => entry.mediaType));
	const duplicates = STUDIO_SOURCE_OPTIONS.filter((option) => duplicateMedia.has(option.mediaType));
	if (duplicates.length === 0) return null;
	const available = STUDIO_SOURCE_OPTIONS.filter((option) => option.supported && !duplicateMedia.has(option.mediaType));
	const duplicateVerb = duplicates.length > 1 || duplicates[0].mediaType === "MOVIE" ? "exist" : "exists";
	const message = available.length
		? `${joinedLabels(duplicates)} already ${duplicateVerb}. Add will only include ${joinedLabels(available)}.`
		: `${joinedLabels(duplicates)} already ${duplicateVerb} in this folder.`;
	return (
		<p className="studio-duplicate-note" role="status" data-studio-duplicate-warning="true">{message}</p>
	);
}

export function StudioElsewhereNotice({ occurrences, visibleLimit = 3 }) {
	return <SourceElsewhereNotice occurrences={occurrences} visibleLimit={visibleLimit} />;
}

export function StudioConfigureStep({
	studio,
	counts,
	choices,
	duplicateReview,
	applyDiagnostic,
	sortOptionId = DEFAULT_STUDIO_SORT_OPTION_ID,
	onToggle,
	onSortChange = () => {},
}) {
	const duplicateMedia = new Set(duplicateReview.destination.map((entry) => entry.mediaType));
	return (
		<section className="studio-configure" aria-labelledby="studio-configure-title">
			{applyDiagnostic ? <div className="editor-diagnostics" role="alert"><p>{applyDiagnostic.message}</p></div> : null}
			<div className="studio-configure-identity tmdb-review-identity">
				<StudioLogo studio={studio} size="w185" context="configure" loading="eager" />
				<div className="tmdb-review-identity-copy">
					<p className="panel-kicker">Selected studio</p>
					<h3 id="studio-configure-title">{studio.name}</h3>
					{formatStudioLocation(studio) ? <p>{formatStudioLocation(studio)}</p> : null}
				</div>
				<TmdbEntityLink entityType="company" tmdbId={studio.id} entityName={studio.name} />
			</div>
			<fieldset className="studio-source-choices">
				<legend>Sources to add</legend>
				<div>
					{STUDIO_SOURCE_OPTIONS.map((option) => {
						const duplicate = duplicateMedia.has(option.mediaType);
						const count = currentCountText(option, counts[option.countKey]);
						return (
							<label className="studio-source-choice" key={option.id} data-count-state={count.state} data-source-supported={option.supported ? "true" : "false"} data-source-duplicate={duplicate ? "true" : undefined}>
								<input className="visually-hidden choice-card-input" type="checkbox" checked={choices.includes(option.id)} disabled={!option.supported || duplicate} onChange={() => onToggle(option.id)} />
								<span>
									<strong>{option.label}</strong>
									<small>
										{option.mediaType === "MOVIE" ? "Movies" : "Series"}
										{duplicate ? <> · <span className="studio-already-added">Already added</span></> : null}
									</small>
								</span>
								<em>{count.text}</em>
								<TmdbKnownZeroNotice
									count={counts[option.countKey]}
									entity="studio"
									media={option.mediaType === "MOVIE" ? "movies" : "series"}
									canStillAdd
								/>
							</label>
						);
					})}
				</div>
			</fieldset>
			<StudioDuplicateNotice duplicateReview={duplicateReview} />
			<StudioSortChoices selectedId={sortOptionId} name="studio-configure-sort" onChange={onSortChange} />
			<StudioElsewhereNotice occurrences={duplicateReview.elsewhere} />
		</section>
	);
}

export function StudioConfigureActions({
	hasDestinationDuplicates,
	primaryCount,
	configuredCount,
	isApplying = false,
	onAddAll,
}) {
	const primaryLabel = `Add ${primaryCount} source${primaryCount === 1 ? "" : "s"}`;
	return (
		<footer className="add-source-actions studio-configure-actions">
			{hasDestinationDuplicates && primaryCount === 0
				? <span className="studio-no-missing-sources">No new sources to add</span>
				: <button className="editor-apply" type="submit" disabled={primaryCount === 0 || isApplying}>{isApplying ? "Adding…" : primaryLabel}</button>}
			{hasDestinationDuplicates && configuredCount > 0 ? <button className="editor-cancel studio-add-all" type="button" disabled={isApplying} data-action="add-all-studio-anyway" onClick={onAddAll}>Add all anyway</button> : null}
		</footer>
	);
}

export function StudioSourceFlow({
	catalogueProvider,
	countProvider,
	previewProvider,
	project,
	folder,
	onBack,
	onCancel,
	onApply,
}) {
	const [navigation, setNavigation] = useState(createStudioSourceNavigationState);
	const search = useStudioCatalogueSearch(catalogueProvider);
	const [selectedStudio, setSelectedStudio] = useState(null);
	const [counts, setCounts] = useState(INITIAL_COUNTS);
	const [choices, setChoices] = useState([]);
	const [titleSortOptionId, setTitleSortOptionId] = useState(DEFAULT_STUDIO_SORT_OPTION_ID);
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

	const duplicateReview = selectedStudio
		? inspectStudioSourceDuplicates(project, folder?.internalId ?? null, selectedStudio.id)
		: { destination: [], elsewhere: [] };
	const draftResult = selectedStudio ? buildStudioSourceDrafts(selectedStudio, { choices, sortOptionId: titleSortOptionId }) : { ok: false, drafts: [], errors: [] };
	const duplicateMedia = new Set(duplicateReview.destination.map((entry) => entry.mediaType));
	const configuredChoices = STUDIO_SOURCE_OPTIONS
		.filter((option) => duplicateMedia.has(option.mediaType) || choices.includes(option.id))
		.map((option) => option.id);
	const allDraftResult = selectedStudio ? buildStudioSourceDrafts(selectedStudio, { choices: configuredChoices, sortOptionId: titleSortOptionId }) : { ok: false, drafts: [], errors: [] };
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
		if (navigation.step !== STUDIO_SOURCE_STEPS.SEARCH || navigation.restoreSearchFocusId === null) return;
		const result = dialogRef.current?.querySelector?.(`[data-tmdb-studio-result="${navigation.restoreSearchFocusId}"]`);
		restoreAddSourceSearchView({
			scrollElement: scrollRef.current,
			resultElement: result,
			fallbackElement: inputRef.current,
			searchScrollTop: navigation.searchScrollTop,
			focusWithoutScroll: focusElementWithoutScroll,
		});
		setNavigation(completeStudioSearchRestore);
	}, [navigation]);

	async function loadCounts(studio) {
		setCounts(Object.freeze({
			movie: Object.freeze({ status: "checking", count: null, error: null }),
			series: Object.freeze({ status: "checking", count: null, error: null }),
		}));
		const outcome = await countCoordinatorRef.current.run(
			({ signal }) => countProvider.getStudioCounts(studio.id, { signal }),
			{ studioId: studio.id },
		);
		if (!outcome.accepted) return;
		if (outcome.result?.ok === true) {
			setCounts(outcome.result.data);
		} else if (outcome.result?.error?.kind !== "aborted") {
			setCounts(Object.freeze({
				movie: Object.freeze({ status: "unavailable", count: null, error: { message: "Count unavailable" } }),
				series: Object.freeze({ status: "unavailable", count: null, error: { message: "Count unavailable" } }),
			}));
		}
	}

	function selectStudio(studio) {
		countCoordinatorRef.current.cancel({ notify: false });
		const review = inspectStudioSourceDuplicates(project, folder?.internalId ?? null, studio.id);
		const movieDuplicate = review.destination.some((entry) => entry.mediaType === "MOVIE");
		const seriesDuplicate = review.destination.some((entry) => entry.mediaType === "TV");
		setSelectedStudio(studio);
		setChoices(!movieDuplicate ? ["studio-movies"] : !seriesDuplicate ? ["studio-series"] : []);
		setTitleSortOptionId(DEFAULT_STUDIO_SORT_OPTION_ID);
		setApplyDiagnostic(null);
		setNavigation((current) => enterStudioConfigure(current, studio.id, scrollRef.current?.scrollTop ?? 0));
		loadCounts(studio);
		queueMicrotask(() => focusElementWithoutScroll(configureRef.current));
	}

	function returnToSearch() {
		if (isApplying) return;
		countCoordinatorRef.current.cancel({ notify: false });
		setApplyDiagnostic(null);
		setNavigation(returnStudioToSearch);
	}

	function toggleChoice(choiceId) {
		const option = STUDIO_SOURCE_OPTIONS.find((entry) => entry.id === choiceId);
		if (!option?.supported) return;
		const identity = `tmdb|COMPANY|${selectedStudio.id}|${option.mediaType}`;
		if (duplicateReview.destination.some((entry) => entry.identity === identity)) return;
		setChoices((current) => current.includes(choiceId) ? current.filter((entry) => entry !== choiceId) : [...current, choiceId]);
		setApplyDiagnostic(null);
	}

	function handleSearchInputChange(event) {
		search.handleInputChange(event);
		setApplyDiagnostic(null);
	}

	function toggleSearchSort(sort) {
		search.toggleSearchSort(sort);
	}

	async function applyStudioSources(addAllAnyway = false) {
		const submission = addAllAnyway ? allDraftResult : draftResult;
		if (step !== STUDIO_SOURCE_STEPS.CONFIGURE || !submission.ok || isApplying || !submissionGateRef.current.begin()) return;
		setIsApplying(true);
		let result;
		try {
			result = await onApply({
				studio: selectedStudio,
				drafts: submission.drafts,
				duplicateOverrideIdentity: addAllAnyway
					? studioDuplicateOverrideIdentity(folder.internalId, submission.drafts)
					: null,
			});
		} catch {
			result = { ok: false, errors: [{ message: "The Studio source could not be added. Try again." }] };
		}
		if (result?.ok) return;
		submissionGateRef.current.reset();
		setIsApplying(false);
		setApplyDiagnostic(result?.errors?.[0] ?? { message: "The Studio source could not be added. Try again." });
	}

	function submit(event) {
		event.preventDefault();
		applyStudioSources(false);
	}

	function studioPreviewCandidate(draft) {
		return Object.freeze({ sourceDraft: draft, request: sourceTitlePreviewRequest("studio", draft) });
	}

	async function loadPreview(candidate) {
		setPreview({ status: "loading", candidate, data: null, error: null });
		const outcome = await previewCoordinatorRef.current.run(
			({ signal }) => requestSourceTitlePreview(candidate.request, { studio: previewProvider }, signal),
			candidate.request.mediaType,
		);
		if (!outcome.accepted) return;
		if (outcome.result?.ok) setPreview({ status: "ready", candidate, data: outcome.result.data, error: null });
		else if (outcome.result?.error?.kind !== "aborted") setPreview({ status: "error", candidate, data: null, error: outcome.result?.error });
	}

	function openPreview(event) {
		const firstDraft = allDraftResult.ok ? allDraftResult.drafts[0] : null;
		if (!firstDraft || isApplying) return;
		previewTriggerRef.current = event.currentTarget;
		loadPreview(studioPreviewCandidate(firstDraft));
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
	const primaryCount = draftResult.ok ? draftResult.drafts.length : 0;
	const configuredCount = allDraftResult.ok ? allDraftResult.drafts.length : 0;
	const hasDestinationDuplicates = duplicateReview.destination.length > 0;
	const previewAvailable = allDraftResult.ok && allDraftResult.drafts.length > 0 && sourceTitlePreviewProviderAvailable(sourceTitlePreviewRequest("studio", allDraftResult.drafts[0]), { studio: previewProvider });
	const previewSelectorGroups = preview && allDraftResult.drafts.length > 1 ? [{
		id: "media",
		label: "Media",
		ariaLabel: "Preview media",
		options: allDraftResult.drafts.map((draft) => ({
			id: draft.editable.mediaType,
			label: draft.editable.mediaType === "TV" ? "Series" : "Movies",
			selected: preview.candidate.request.mediaType === draft.editable.mediaType,
			onSelect: () => loadPreview(studioPreviewCandidate(draft)),
		})),
	}] : [];
	const content = (
		<div className="add-source-portal" data-add-source-portal="true" data-mobile-surface="opaque">
			<div className="settings-modal-backdrop add-source-backdrop" data-add-source-modal-backdrop="true" data-backdrop-dismiss="false" style={viewportStyle ?? undefined}>
				<section ref={dialogRef} className="add-source-dialog studio-source-dialog" data-dialog-compact={step === STUDIO_SOURCE_STEPS.SEARCH ? "true" : undefined} data-add-source-modal="true" data-add-source-step={step} data-source-mode={STUDIO_SOURCE_MODE.id} data-preview-open={preview ? "true" : undefined} role="dialog" aria-modal="true" aria-labelledby="studio-source-title" aria-describedby="studio-source-description" tabIndex={-1} onKeyDown={(event) => handleDialogKeyDown(event, dialogRef.current, cancel)}>
					<header className="add-source-heading" inert={preview || undefined} aria-hidden={preview ? "true" : undefined}>
						<div className="add-source-heading-row">
							<button className="add-source-header-action" type="button" disabled={isApplying} onClick={step === STUDIO_SOURCE_STEPS.SEARCH ? onBack : returnToSearch}><span aria-hidden="true">←</span>Back</button>
							<div><h2 id="studio-source-title">Add studio</h2><p>{folder?.editable?.title || "Selected folder"}</p></div>
							<button className="add-source-header-action add-source-close-action" type="button" aria-label="Close Add studio" disabled={isApplying} onClick={cancel}>Close</button>
						</div>
						<p id="studio-source-description" className="add-source-heading-description">{step === STUDIO_SOURCE_STEPS.SEARCH ? "Find a studio to add to this folder." : "Select the Studio sources you want to add."}</p>
					</header>
					<form className="add-source-form" data-studio-source-form-step={step} onSubmit={submit} noValidate inert={preview || undefined} aria-hidden={preview ? "true" : undefined}>
						<div ref={scrollRef} className="add-source-scroll">
							{step === STUDIO_SOURCE_STEPS.SEARCH ? (
								<StudioSearchStep input={search.input} inputRef={inputRef} parsedInput={search.parsedInput} lookupState={search.lookupState} searchData={search.searchData} effectiveSearchSort={search.effectiveSearchSort} browsing={search.browsing} movieCountFilter={search.movieCountFilter} selectedStudioId={selectedStudio?.id ?? null} onInputChange={handleSearchInputChange} onSortChange={toggleSearchSort} onMovieCountFilterChange={search.changeMovieCountFilter} onRetry={search.retrySearch} onSelect={selectStudio} onChangePage={search.setPage} />
							) : (
								<div ref={configureRef} className="studio-configure-focus-target" tabIndex={-1}>
									<StudioConfigureStep studio={selectedStudio} counts={counts} choices={choices} duplicateReview={duplicateReview} applyDiagnostic={applyDiagnostic} sortOptionId={titleSortOptionId} onToggle={toggleChoice} onSortChange={(optionId) => { setTitleSortOptionId(optionId); setApplyDiagnostic(null); }} />
									<div className="source-edit-preview-action genre-hierarchy-configure-row-actions"><button type="button" aria-haspopup="dialog" data-action="preview-add-studio" disabled={!previewAvailable || isApplying} onClick={openPreview}>Preview titles</button>{!previewAvailable ? <p className="editor-field-help">Choose a valid source configuration to preview.</p> : null}</div>
								</div>
							)}
						</div>
						{step === STUDIO_SOURCE_STEPS.CONFIGURE ? <StudioConfigureActions hasDestinationDuplicates={hasDestinationDuplicates} primaryCount={primaryCount} configuredCount={configuredCount} isApplying={isApplying} onAddAll={() => applyStudioSources(true)} /> : null}
					</form>
				</section>
			</div>
			{preview ? <SourceTitlePreviewDialog preview={preview} titleId="studio-add-preview-title" backdropProps={{ "data-studio-add-preview-backdrop": "true" }} dialogProps={{ "data-studio-add-preview": "true" }} selectorGroups={previewSelectorGroups} onClose={closePreview} onRetry={() => loadPreview(preview.candidate)} /> : null}
		</div>
	);
	return typeof document === "undefined" ? content : createPortal(content, document.body);
}
