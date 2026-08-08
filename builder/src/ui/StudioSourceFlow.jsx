import {
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import { isValidVisibleNuvioTitle } from "../nuvio/titles.js";
import {
	buildStudioSourceDrafts,
	buildTmdbStudioLogoUrl,
	createAsyncRequestCoordinator,
	createSourceSubmissionGate,
	DEFAULT_STUDIO_SEARCH_SORT,
	DEFAULT_STUDIO_SORT_OPTION_ID,
	formatStudioLocation,
	INITIAL_ASYNC_REQUEST_STATE,
	inspectStudioSourceDuplicates,
	parseStudioSearchInput,
	studioDuplicateOverrideIdentity,
	STUDIO_SOURCE_MODE,
	STUDIO_SOURCE_OPTIONS,
	STUDIO_SEARCH_SORTS,
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
import { TmdbEntityLink } from "./TmdbEntityLink.jsx";
import {
	completeStudioSearchRestore,
	createStudioSourceNavigationState,
	enterStudioConfigure,
	returnStudioToSearch,
	STUDIO_SOURCE_STEPS,
} from "./studio-source-navigation-state.js";

export const STUDIO_SEARCH_DEBOUNCE_MS = 250;
export { STUDIO_SOURCE_STEPS };

const usePrePaintLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
const INITIAL_COUNTS = Object.freeze({
	movie: Object.freeze({ status: "not-checked", count: null, error: null }),
	series: Object.freeze({ status: "not-checked", count: null, error: null }),
});

export function StudioLogo({ studio, size = "w92", context = "result", loading = "lazy" }) {
	const source = buildTmdbStudioLogoUrl(studio.logoPath, size);
	const [failed, setFailed] = useState(false);
	useEffect(() => setFailed(false), [source]);
	return (
		<span className={`studio-logo-tile studio-logo-tile--${context}`} data-logo-state={source && !failed ? "ready" : failed ? "error" : "missing"}>
			{source && !failed ? (
				<img
					className="studio-logo-image"
					src={source}
					alt={`${studio.name} logo`}
					loading={loading}
					decoding="async"
					onError={() => setFailed(true)}
				/>
			) : (
				<span className="studio-logo-fallback" role="img" aria-label={`${studio.name} logo unavailable`}>
					<span aria-hidden="true">{context === "result" ? "No logo" : "No logo available"}</span>
				</span>
			)}
		</span>
	);
}

function StudioResult({ studio, onSelect }) {
	const metadata = studio.location || formatStudioLocation(studio);
	const movieCount = Number.isSafeInteger(studio.movieCount) && studio.movieCount >= 0
		? studio.movieCount.toLocaleString("en")
		: "Unknown";
	return (
		<button
			className="add-source-result studio-result"
			type="button"
			data-tmdb-studio-result={studio.id}
			onClick={() => onSelect(studio)}
		>
			<StudioLogo studio={studio} context="result" />
			<span className="add-source-result-content">
				<span className="add-source-result-heading"><strong>{studio.name}</strong><span>TMDB {studio.id}</span></span>
				{metadata ? <span className="studio-result-metadata">{metadata}</span> : null}
				{studio.parentCompany ? <span className="studio-result-parent">Parent: {studio.parentCompany}</span> : null}
				<span className="studio-result-count">Movie Count: {movieCount}</span>
			</span>
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
	hideZero = false,
	onInputChange,
	onSortChange = () => {},
	onHideZeroChange = () => {},
	onRetry,
	onSelect,
	onChangePage,
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
			<div className="studio-search-controls" aria-label="Studio result controls">
				<span className="studio-search-control-label">Sort</span>
				<button type="button" aria-pressed={effectiveSearchSort === STUDIO_SEARCH_SORTS.NAME_ASC} onClick={() => onSortChange(STUDIO_SEARCH_SORTS.NAME_ASC)}>A–Z</button>
				<button type="button" aria-pressed={effectiveSearchSort === STUDIO_SEARCH_SORTS.MOVIE_COUNT_DESC} onClick={() => onSortChange(STUDIO_SEARCH_SORTS.MOVIE_COUNT_DESC)}>Most movies</button>
				<button className="studio-zero-filter" type="button" aria-pressed={hideZero} onClick={onHideZeroChange}>Hide studios with no movies</button>
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
						<div><p className="panel-kicker">Studio results</p><h3 id="studio-results-title">Choose a studio</h3></div>
						{searchData.totalPages > 1 ? <span>Page {searchData.page} of {searchData.totalPages}</span> : null}
					</div>
					{searchData.results.length ? (
						<div className="add-source-result-list">
							{searchData.results.map((studio) => <StudioResult key={studio.id} studio={studio} onSelect={onSelect} />)}
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

function safeStudioLocationTitle(title, fallback) {
	return isValidVisibleNuvioTitle(title) ? title.trim() : fallback;
}

function uniqueStudioElsewhereLocations(occurrences) {
	const locations = [];
	const seen = new Set();
	for (const [index, occurrence] of (occurrences ?? []).entries()) {
		const collection = safeStudioLocationTitle(occurrence?.collectionTitle, "Hidden collection");
		const folder = safeStudioLocationTitle(occurrence?.folderTitle, "Hidden folder");
		const locationKey = typeof occurrence?.folderInternalId === "string" && occurrence.folderInternalId
			? `folder:${occurrence.folderInternalId}`
			: typeof occurrence?.collectionInternalId === "string" && occurrence.collectionInternalId
				? `collection:${occurrence.collectionInternalId}\nfolder:${folder}`
				: `display:${collection}\n${folder}\n${index}`;
		if (seen.has(locationKey)) continue;
		seen.add(locationKey);
		locations.push(Object.freeze({ key: locationKey, collection, folder }));
	}
	return locations;
}

export function StudioElsewhereNotice({ occurrences, visibleLimit = 3 }) {
	const locations = uniqueStudioElsewhereLocations(occurrences);
	if (locations.length === 0) return null;
	const boundedLimit = Number.isSafeInteger(visibleLimit) && visibleLimit > 0 ? visibleLimit : 3;
	const visible = locations.slice(0, boundedLimit);
	const remaining = locations.length - visible.length;
	return (
		<div className="studio-elsewhere-note" role="status">
			<strong className="studio-elsewhere-heading">This source exists elsewhere</strong>
			<ul className="studio-elsewhere-locations">
				{visible.map((location) => <li key={location.key}>{location.folder} · in {location.collection}</li>)}
			</ul>
			{remaining > 0 ? <p className="studio-elsewhere-more">+ {remaining} more</p> : null}
			<p className="studio-elsewhere-action">You can still add it to this folder, or close this window to cancel.</p>
		</div>
	);
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
							<label key={option.id} data-count-state={count.state} data-source-supported={option.supported ? "true" : "false"} data-source-duplicate={duplicate ? "true" : undefined}>
								<input type="checkbox" checked={choices.includes(option.id)} disabled={!option.supported || duplicate} onChange={() => onToggle(option.id)} />
								<span>
									<strong>{option.label}</strong>
									<small>
										{option.mediaType === "MOVIE" ? "Movies" : "Series"}
										{duplicate ? <> · <span className="studio-already-added">Already added</span></> : null}
									</small>
								</span>
								<em>{count.text}</em>
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
	project,
	folder,
	onBack,
	onCancel,
	onApply,
}) {
	const [navigation, setNavigation] = useState(createStudioSourceNavigationState);
	const [input, setInput] = useState("");
	const [page, setPage] = useState(1);
	const [searchSortOverride, setSearchSortOverride] = useState(null);
	const [hideZero, setHideZero] = useState(false);
	const [retryGeneration, setRetryGeneration] = useState(0);
	const [lookupState, setLookupState] = useState(INITIAL_ASYNC_REQUEST_STATE);
	const [selectedStudio, setSelectedStudio] = useState(null);
	const [counts, setCounts] = useState(INITIAL_COUNTS);
	const [choices, setChoices] = useState([]);
	const [titleSortOptionId, setTitleSortOptionId] = useState(DEFAULT_STUDIO_SORT_OPTION_ID);
	const [applyDiagnostic, setApplyDiagnostic] = useState(null);
	const [isApplying, setIsApplying] = useState(false);
	const [viewportStyle, setViewportStyle] = useState(() => typeof window === "undefined" ? null : resolveAddSourceViewportStyle(window));
	const dialogRef = useRef(null);
	const scrollRef = useRef(null);
	const inputRef = useRef(null);
	const configureRef = useRef(null);
	const lookupCoordinatorRef = useRef(null);
	const countCoordinatorRef = useRef(null);
	const submissionGateRef = useRef(null);
	if (!lookupCoordinatorRef.current) lookupCoordinatorRef.current = createAsyncRequestCoordinator({ onStateChange: setLookupState });
	if (!countCoordinatorRef.current) countCoordinatorRef.current = createAsyncRequestCoordinator();
	if (!submissionGateRef.current) submissionGateRef.current = createSourceSubmissionGate();

	const parsedInput = useMemo(() => parseStudioSearchInput(input), [input]);
	const browsing = parsedInput.kind === "empty";
	const effectiveSearchSort = searchSortOverride
		?? (browsing ? STUDIO_SEARCH_SORTS.MOVIE_COUNT_DESC : DEFAULT_STUDIO_SEARCH_SORT);
	const searchData = lookupState.status === "success" && (
		(lookupState.context?.kind === "exact" && parsedInput.kind === "exact" && lookupState.context.id === parsedInput.id)
		|| (lookupState.context?.kind === "search" && parsedInput.kind === "search" && lookupState.context.query === parsedInput.query && lookupState.context.page === page)
		|| (lookupState.context?.kind === "browse" && browsing && parsedInput.kind === "empty" && lookupState.context.page === page)
	) && lookupState.context?.sort === effectiveSearchSort && lookupState.context?.hideZero === hideZero
		? lookupState.data
		: null;
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

	useEffect(() => {
		const coordinator = lookupCoordinatorRef.current;
		coordinator.cancel({ notify: false });
		setLookupState(INITIAL_ASYNC_REQUEST_STATE);
		if (parsedInput.kind === "invalid" || (parsedInput.kind === "search" && !parsedInput.eligible)) return undefined;
		const requestInput = browsing && parsedInput.kind === "empty" ? Object.freeze({ kind: "browse" }) : parsedInput;
		const timer = window.setTimeout(() => {
			coordinator.run(
				() => catalogueProvider.searchStudios(requestInput, { page, sort: effectiveSearchSort, hideZero }),
				requestInput.kind === "exact"
					? { kind: "exact", id: requestInput.id, page: 1, sort: effectiveSearchSort, hideZero }
					: requestInput.kind === "browse"
						? { kind: "browse", page, sort: effectiveSearchSort, hideZero }
						: { kind: "search", query: requestInput.query, page, sort: effectiveSearchSort, hideZero },
			);
		}, STUDIO_SEARCH_DEBOUNCE_MS);
		return () => { window.clearTimeout(timer); coordinator.cancel({ reset: false, notify: false }); };
	}, [browsing, catalogueProvider, effectiveSearchSort, hideZero, page, parsedInput, retryGeneration]);

	useEffect(() => () => {
		lookupCoordinatorRef.current.cancel({ notify: false });
		countCoordinatorRef.current.cancel({ notify: false });
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
		setInput(event.target.value);
		setPage(1);
		setApplyDiagnostic(null);
	}

	function toggleSearchSort(sort) {
		setSearchSortOverride((current) => current === sort ? null : sort);
		setPage(1);
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

	const cancel = () => {
		if (!isApplying && !submissionGateRef.current.isActive()) onCancel();
	};
	const primaryCount = draftResult.ok ? draftResult.drafts.length : 0;
	const configuredCount = allDraftResult.ok ? allDraftResult.drafts.length : 0;
	const hasDestinationDuplicates = duplicateReview.destination.length > 0;
	const content = (
		<div className="add-source-portal" data-add-source-portal="true" data-mobile-surface="opaque">
			<div className="settings-modal-backdrop add-source-backdrop" data-add-source-modal-backdrop="true" data-backdrop-dismiss="false" style={viewportStyle ?? undefined}>
				<section ref={dialogRef} className="add-source-dialog studio-source-dialog" data-dialog-compact={step === STUDIO_SOURCE_STEPS.SEARCH ? "true" : undefined} data-add-source-modal="true" data-add-source-step={step} data-source-mode={STUDIO_SOURCE_MODE.id} role="dialog" aria-modal="true" aria-labelledby="studio-source-title" aria-describedby="studio-source-description" tabIndex={-1} onKeyDown={(event) => handleDialogKeyDown(event, dialogRef.current, cancel)}>
					<header className="add-source-heading">
						<div className="add-source-heading-row">
							<button className="add-source-header-action" type="button" disabled={isApplying} onClick={step === STUDIO_SOURCE_STEPS.SEARCH ? onBack : returnToSearch}><span aria-hidden="true">←</span>Back</button>
							<div><h2 id="studio-source-title">Add studio</h2><p>{folder?.editable?.title || "Selected folder"}</p></div>
							<button className="add-source-header-action add-source-close-action" type="button" aria-label="Close Add studio" disabled={isApplying} onClick={cancel}>Close</button>
						</div>
						<p id="studio-source-description" className="add-source-heading-description">{step === STUDIO_SOURCE_STEPS.SEARCH ? "Find a studio to add to this folder." : "Select the Studio sources you want to add."}</p>
					</header>
					<form className="add-source-form" data-studio-source-form-step={step} onSubmit={submit} noValidate>
						<div ref={scrollRef} className="add-source-scroll">
							{step === STUDIO_SOURCE_STEPS.SEARCH ? (
								<StudioSearchStep input={input} inputRef={inputRef} parsedInput={parsedInput} lookupState={lookupState} searchData={searchData} effectiveSearchSort={effectiveSearchSort} browsing={browsing} hideZero={hideZero} onInputChange={handleSearchInputChange} onSortChange={toggleSearchSort} onHideZeroChange={() => { setHideZero((current) => !current); setPage(1); }} onRetry={() => setRetryGeneration((value) => value + 1)} onSelect={selectStudio} onChangePage={setPage} />
							) : (
								<div ref={configureRef} className="studio-configure-focus-target" tabIndex={-1}>
									<StudioConfigureStep studio={selectedStudio} counts={counts} choices={choices} duplicateReview={duplicateReview} applyDiagnostic={applyDiagnostic} sortOptionId={titleSortOptionId} onToggle={toggleChoice} onSortChange={(optionId) => { setTitleSortOptionId(optionId); setApplyDiagnostic(null); }} />
								</div>
							)}
						</div>
						{step === STUDIO_SOURCE_STEPS.CONFIGURE ? <StudioConfigureActions hasDestinationDuplicates={hasDestinationDuplicates} primaryCount={primaryCount} configuredCount={configuredCount} isApplying={isApplying} onAddAll={() => applyStudioSources(true)} /> : null}
					</form>
				</section>
			</div>
		</div>
	);
	return typeof document === "undefined" ? content : createPortal(content, document.body);
}
