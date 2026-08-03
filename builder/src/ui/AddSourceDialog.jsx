import {
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import {
	buildMovieFranchiseSourceDraft,
	buildTmdbPosterUrl,
	createAsyncRequestCoordinator,
	createSourceSubmissionGate,
	INITIAL_ASYNC_REQUEST_STATE,
	MOVIE_FRANCHISE_SOURCE_MODE,
	parseTmdbCollectionInput,
} from "../source-add/index.js";
import {
	lockAddSourceDocumentBody,
	observeAddSourceViewport,
	resolveAddSourceViewportStyle,
} from "./add-source-modal-lifecycle.js";
import {
	ADD_SOURCE_STEPS,
	captureAddSourceSelectionScroll,
	completeAddSourceSearchRestore,
	createAddSourceNavigationState,
	enterAddSourceReview,
	restoreAddSourceSearchView,
	returnAddSourceToSearch,
} from "./add-source-navigation-state.js";
import { focusElementWithoutScroll } from "./hierarchy-menu-placement.js";
import { handleDialogKeyDown } from "./modal-focus.js";
import { TmdbEntityLink } from "./TmdbEntityLink.jsx";

export const ADD_SOURCE_SEARCH_DEBOUNCE_MS = 300;
export { ADD_SOURCE_STEPS };

const usePrePaintLayoutEffect = typeof window === "undefined"
	? useEffect
	: useLayoutEffect;

function requestStateMessage(state, loadingMessage = "Searching TMDB…") {
	if (state.status === "loading") return loadingMessage;
	if (state.status === "error") return state.error?.message ?? "TMDB could not complete this request.";
	return null;
}

export function requestSelectedCollectionDetails({
	coordinator,
	provider,
	result,
}) {
	const currentState = coordinator.getState();
	if (
		currentState.status === "loading"
		&& currentState.context?.id === result.id
	) {
		return {
			accepted: false,
			repeated: true,
			requestId: currentState.requestId,
			result: null,
			state: currentState,
		};
	}
	return coordinator.run(
		({ signal }) => provider.getCollection(result.id, { signal }),
		{ id: result.id },
	);
}

export function beginSelectedCollectionDetailsRequest({
	coordinator,
	provider,
	result,
	navigationState,
	searchScrollTop,
}) {
	const request = requestSelectedCollectionDetails({
		coordinator,
		provider,
		result,
	});
	if (request.repeated) {
		return Object.freeze({
			navigationState,
			repeated: true,
			request,
		});
	}
	return Object.freeze({
		navigationState: captureAddSourceSelectionScroll(
			navigationState,
			result.id,
			searchScrollTop,
		),
		repeated: false,
		request,
	});
}

export function selectedCollectionDetailsFromOutcome(outcome) {
	return outcome?.accepted === true && outcome.result?.ok === true
		? outcome.result.data
		: null;
}

function safeOverview(value) {
	if (typeof value !== "string") return "";
	const trimmed = value.trim();
	return trimmed.length > 220 ? `${trimmed.slice(0, 217).trimEnd()}…` : trimmed;
}

function Poster({
	collection,
	size,
	className,
	alt,
	loading = "lazy",
}) {
	const source = buildTmdbPosterUrl(collection.posterPath, size);
	return (
		<span className={`${className}-frame`}>
			{source ? (
				<img
					className={className}
					src={source}
					alt={alt}
					loading={loading}
					onError={(event) => {
						event.currentTarget.hidden = true;
						event.currentTarget.nextElementSibling.hidden = false;
					}}
				/>
			) : null}
			<span
				className={`${className}-placeholder`}
				hidden={Boolean(source)}
			>
				No poster available
			</span>
		</span>
	);
}

function ResultButton({
	result,
	selected,
	disabled,
	loading,
	onSelect,
}) {
	return (
		<button
			className={`add-source-result${selected ? " is-selected" : ""}${loading ? " is-loading" : ""}`}
			type="button"
			data-tmdb-collection-result={result.id}
			aria-pressed={selected}
			aria-busy={loading || undefined}
			data-selection-loading={loading ? "true" : undefined}
			disabled={disabled}
			onClick={() => onSelect(result)}
		>
			<Poster
				collection={result}
				size="w185"
				className="add-source-result-poster"
				alt=""
			/>
			<span className="add-source-result-content">
				<span className="add-source-result-heading">
					<strong>{result.name}</strong>
					<span>TMDB {result.id}</span>
				</span>
				{loading ? (
					<span className="add-source-result-loading">Loading details…</span>
				) : safeOverview(result.overview) ? (
					<span className="add-source-result-overview">{safeOverview(result.overview)}</span>
				) : (
					<span className="add-source-result-overview is-muted">Overview unavailable</span>
				)}
			</span>
		</button>
	);
}

function SourceRecipe() {
	return (
		<div className="add-source-recipe" data-source-recipe="tmdb-collection">
			<div>
				<p className="panel-kicker">Fixed source recipe</p>
				<h3>Movie franchise · TMDB</h3>
			</div>
			<dl>
				<div>
					<dt>Provider</dt>
					<dd>TMDB</dd>
				</div>
				<div>
					<dt>Media</dt>
					<dd>Movies</dd>
				</div>
				<div>
					<dt>Source type</dt>
					<dd>Collection</dd>
				</div>
				<div>
					<dt>Sort</dt>
					<dd>TMDB-provided order</dd>
				</div>
			</dl>
		</div>
	);
}

function ContainedTitles({
	titles,
	expanded,
	onToggle,
}) {
	if (!Array.isArray(titles)) return null;
	if (titles.length === 0) {
		return <p className="add-source-title-list-empty">TMDB reports no contained titles for this collection.</p>;
	}

	const label = `${expanded ? "Hide" : "View"} ${titles.length} title${titles.length === 1 ? "" : "s"} in this collection`;
	return (
		<div className="add-source-title-list">
			<button
				type="button"
				className="add-source-title-list-toggle"
				data-action="toggle-contained-titles"
				aria-expanded={expanded}
				aria-controls="add-source-contained-titles"
				onClick={onToggle}
			>
				{label}
				<span aria-hidden="true">{expanded ? "−" : "+"}</span>
			</button>
			{expanded ? (
				<ol id="add-source-contained-titles">
					{titles.map((movie, index) => (
						<li key={`${movie.title}-${movie.releaseYear ?? "unknown"}-${index}`}>
							<span>{movie.title}</span>
							<span>{movie.releaseYear ?? "Year unavailable"}</span>
						</li>
					))}
				</ol>
			) : null}
		</div>
	);
}

export function AddSourceSearchStep({
	input,
	inputRef,
	parsedInput,
	lookupState,
	lookupMessage,
	searchData,
	selectedResult,
	selectionState,
	selectionCandidate,
	selectionMessage,
	selectionErrorRef,
	onInputChange,
	onRetryLookup,
	onSelectResult,
	onRetrySelection,
	onChangePage,
}) {
	const validatedExactResult = (
		parsedInput.kind === "exact"
		&& lookupState.status === "success"
		&& lookupState.context?.kind === "exact"
		&& lookupState.context.id === parsedInput.id
		&& selectedResult
	) ? selectedResult : null;

	return (
		<>
			<section className="add-source-mode" aria-labelledby="add-source-mode-title">
				<div>
					<h3 id="add-source-mode-title">
						{MOVIE_FRANCHISE_SOURCE_MODE.label} · {MOVIE_FRANCHISE_SOURCE_MODE.providerLabel}
					</h3>
					<p>Official TMDB movie collection</p>
				</div>
			</section>

			<div className="editor-field add-source-query-field">
				<label htmlFor="add-source-query">Search or enter an exact collection</label>
				<input
					ref={inputRef}
					id="add-source-query"
					type="search"
					value={input}
					autoComplete="off"
					spellCheck="false"
					data-add-source-field="query"
					aria-invalid={parsedInput.kind === "invalid" ? "true" : undefined}
					aria-describedby="add-source-query-help add-source-query-status"
					onChange={onInputChange}
				/>
				<p className="editor-field-help" id="add-source-query-help">
					Search by title, or paste a positive TMDB collection ID or HTTPS collection URL.
				</p>
				<p
					className={parsedInput.kind === "invalid" ? "editor-field-error" : "editor-field-status"}
					id="add-source-query-status"
					role={parsedInput.kind === "invalid" ? "alert" : "status"}
				>
					{parsedInput.kind === "invalid"
						? parsedInput.message
						: parsedInput.kind === "search" && !parsedInput.eligible
							? parsedInput.message
							: lookupState.status === "loading"
								? lookupMessage
								: null}
				</p>
			</div>

			{lookupState.status === "error" ? (
				<div
					className="add-source-request-state"
					data-request-state={lookupState.error?.kind}
					data-lookup-error="true"
					role="alert"
				>
					<p>{lookupState.error?.message}</p>
					{lookupState.error?.retryable ? (
						<button type="button" onClick={onRetryLookup}>Retry</button>
					) : null}
				</div>
			) : null}

			{validatedExactResult ? (
				<section className="add-source-results" aria-labelledby="add-source-exact-title">
					<div className="add-source-section-heading">
						<div>
							<p className="panel-kicker">Validated collection</p>
							<h3 id="add-source-exact-title">Ready to review</h3>
						</div>
					</div>
					<ResultButton
						result={validatedExactResult}
						selected
						disabled={false}
						loading={false}
						onSelect={onSelectResult}
					/>
				</section>
			) : null}

			{selectionState.status === "loading" && selectionCandidate ? (
				<p className="add-source-selection-status" role="status">
					Loading details for “{selectionCandidate.name}”…
				</p>
			) : null}
			{selectionState.status === "error" ? (
				<div
					ref={selectionErrorRef}
					className="add-source-request-state"
					data-request-state={selectionState.error?.kind}
					data-selection-error="true"
					role="alert"
					tabIndex={-1}
				>
					<p>{selectionMessage}</p>
					{selectionState.error?.retryable && selectionCandidate ? (
						<button type="button" onClick={() => onRetrySelection(selectionCandidate)}>
							Retry selection
						</button>
					) : null}
				</div>
			) : null}

			{searchData ? (
				<section className="add-source-results" aria-labelledby="add-source-results-title">
					<div className="add-source-section-heading">
						<div>
							<p className="panel-kicker">TMDB results</p>
							<h3 id="add-source-results-title">Choose one movie franchise</h3>
						</div>
						{searchData.totalPages > 1 ? (
							<span>Page {searchData.page} of {searchData.totalPages}</span>
						) : null}
					</div>
					{searchData.results.length > 0 ? (
						<div className="add-source-result-list">
							{searchData.results.map((result) => (
								<ResultButton
									key={result.id}
									result={result}
									selected={
										selectedResult?.id === result.id
										|| selectionCandidate?.id === result.id
									}
									loading={
										selectionState.status === "loading"
										&& selectionCandidate?.id === result.id
									}
									disabled={
										selectionState.status === "loading"
										&& selectionCandidate?.id === result.id
									}
									onSelect={onSelectResult}
								/>
							))}
						</div>
					) : (
						<p className="add-source-empty-results">No available TMDB movie franchises matched this title.</p>
					)}
					{searchData.totalPages > 1 ? (
						<nav className="add-source-pagination" aria-label="Search result pages">
							<button
								type="button"
								disabled={searchData.page <= 1 || lookupState.status === "loading"}
								onClick={() => onChangePage(searchData.page - 1)}
							>
								Previous page
							</button>
							<button
								type="button"
								disabled={searchData.page >= searchData.totalPages || lookupState.status === "loading"}
								onClick={() => onChangePage(searchData.page + 1)}
							>
								Next page
							</button>
						</nav>
					) : null}
				</section>
			) : null}

		</>
	);
}

export function AddSourceReviewStep({
	selectedResult,
	title,
	titleInputRef,
	titleError,
	titlesExpanded,
	duplicate,
	applyDiagnostic,
	onTitleChange,
	onToggleTitles,
}) {
	const nameIsAutoManaged = title === selectedResult.name;
	return (
		<section className="add-source-review" aria-labelledby="add-source-review-title">
			{duplicate ? (
				<div className="add-source-duplicate-warning" role="alert" data-duplicate-warning="true">
					<strong>This folder already contains “{duplicate.title}”.</strong>
					<p>It uses the same TMDB movie-franchise identity. Choose Add anyway to keep both sources.</p>
				</div>
			) : null}

			{applyDiagnostic ? (
				<div className="editor-diagnostics" role="alert">
					<p>{applyDiagnostic.message}</p>
				</div>
			) : null}

			<div className="add-source-review-layout">
				<Poster
					collection={selectedResult}
					size="w342"
					className="add-source-review-poster"
					alt="Collection poster artwork"
					loading="eager"
				/>
				<div className="add-source-review-content">
					<div className="add-source-section-heading">
						<div>
							<p className="panel-kicker">Official TMDB collection</p>
							<h3 id="add-source-review-title">{selectedResult.name}</h3>
						</div>
						<TmdbEntityLink
							entityType="collection"
							tmdbId={selectedResult.id}
							entityName={selectedResult.name}
						/>
					</div>
					<p className="add-source-review-count">
						{selectedResult.movieCount} title{selectedResult.movieCount === 1 ? "" : "s"} in this collection
					</p>
					<div className="editor-field">
						<label htmlFor="add-source-title-input">Source name</label>
						<input
							ref={titleInputRef}
							id="add-source-title-input"
							type="text"
							value={title}
							data-add-source-field="title"
							aria-invalid={titleError ? "true" : undefined}
							aria-describedby="add-source-title-help add-source-title-error"
							onChange={onTitleChange}
						/>
						<p className="editor-field-help" id="add-source-title-help">
							{nameIsAutoManaged
								? "This name updates automatically until you customise it."
								: "This is the name shown in Nuvio. You can customise it."}
						</p>
						<p className="editor-field-error" id="add-source-title-error" role={titleError ? "alert" : undefined}>
							{titleError?.message ?? ""}
						</p>
					</div>
					<SourceRecipe />
					<ContainedTitles
						titles={selectedResult.containedTitles}
						expanded={titlesExpanded}
						onToggle={onToggleTitles}
					/>
				</div>
			</div>
		</section>
	);
}

export function AddSourcePrimaryAction({
	duplicate = null,
	disabled = false,
	isApplying = false,
}) {
	return (
		<button
			className="editor-apply"
			type="submit"
			data-action={duplicate ? "add-source-anyway" : "apply-add-source"}
			disabled={disabled}
			aria-disabled={disabled}
		>
			{isApplying
				? "Adding source…"
				: duplicate
					? "Add anyway"
					: "Add source"}
		</button>
	);
}

export function AddSourceDialog({
	provider,
	folderName,
	onCancel,
	onApply,
}) {
	const [navigationState, setNavigationState] = useState(createAddSourceNavigationState);
	const [input, setInput] = useState("");
	const [page, setPage] = useState(1);
	const [retryGeneration, setRetryGeneration] = useState(0);
	const [lookupState, setLookupState] = useState(INITIAL_ASYNC_REQUEST_STATE);
	const [selectionState, setSelectionState] = useState(INITIAL_ASYNC_REQUEST_STATE);
	const [selectionCandidate, setSelectionCandidate] = useState(null);
	const [selectedResult, setSelectedResult] = useState(null);
	const [title, setTitle] = useState("");
	const [duplicate, setDuplicate] = useState(null);
	const [applyDiagnostic, setApplyDiagnostic] = useState(null);
	const [titlesExpanded, setTitlesExpanded] = useState(false);
	const [isApplying, setIsApplying] = useState(false);
	const [viewportStyle, setViewportStyle] = useState(() => (
		typeof window === "undefined" ? null : resolveAddSourceViewportStyle(window)
	));
	const dialogRef = useRef(null);
	const scrollRef = useRef(null);
	const inputRef = useRef(null);
	const titleInputRef = useRef(null);
	const selectionErrorRef = useRef(null);
	const lookupCoordinatorRef = useRef(null);
	const selectionCoordinatorRef = useRef(null);
	const submissionGateRef = useRef(null);
	if (lookupCoordinatorRef.current === null) {
		lookupCoordinatorRef.current = createAsyncRequestCoordinator({
			onStateChange: setLookupState,
		});
	}
	if (selectionCoordinatorRef.current === null) {
		selectionCoordinatorRef.current = createAsyncRequestCoordinator({
			onStateChange: setSelectionState,
		});
	}
	if (submissionGateRef.current === null) {
		submissionGateRef.current = createSourceSubmissionGate();
	}

	const parsedInput = useMemo(
		() => parseTmdbCollectionInput(input),
		[input],
	);
	const draftResult = useMemo(
		() => buildMovieFranchiseSourceDraft(selectedResult, title),
		[selectedResult, title],
	);
	const searchData = (
		parsedInput.kind === "search"
		&& lookupState.status === "success"
		&& lookupState.context?.kind === "search"
		&& lookupState.context.query === parsedInput.query
		&& lookupState.context.page === page
	) ? lookupState.data : null;
	const lookupMessage = requestStateMessage(lookupState);
	const selectionMessage = requestStateMessage(
		selectionState,
		"Validating the selected TMDB collection…",
	);
	const titleError = selectedResult && !draftResult.ok
		? draftResult.errors.find((entry) => entry.path.endsWith(".title")) ?? null
		: null;
	const step = navigationState.step;
	const applyDisabled = (
		step !== ADD_SOURCE_STEPS.REVIEW
		|| !draftResult.ok
		|| lookupState.status === "loading"
		|| selectionState.status === "loading"
		|| isApplying
	);

	usePrePaintLayoutEffect(() => {
		const unlockBody = lockAddSourceDocumentBody();
		const stopObservingViewport = observeAddSourceViewport(setViewportStyle);
		focusElementWithoutScroll(inputRef.current ?? dialogRef.current);
		return () => {
			stopObservingViewport();
			unlockBody();
		};
	}, []);

	useEffect(() => {
		const coordinator = lookupCoordinatorRef.current;
		coordinator.cancel({ notify: false });
		setLookupState(INITIAL_ASYNC_REQUEST_STATE);

		if (
			parsedInput.kind === "empty"
			|| parsedInput.kind === "invalid"
			|| (parsedInput.kind === "search" && !parsedInput.eligible)
		) {
			return undefined;
		}

		const timer = window.setTimeout(async () => {
			const outcome = await coordinator.run(
				({ signal }) => parsedInput.kind === "exact"
					? provider.getCollection(parsedInput.id, { signal })
					: provider.searchCollections(parsedInput.query, { page, signal }),
				parsedInput.kind === "exact"
					? { kind: "exact", id: parsedInput.id }
					: { kind: "search", query: parsedInput.query, page },
			);
			if (
				!outcome.accepted
				|| outcome.result?.ok !== true
				|| parsedInput.kind !== "exact"
			) {
				return;
			}
			setSelectedResult(outcome.result.data);
			setTitle(outcome.result.data.name);
			setDuplicate(null);
			setApplyDiagnostic(null);
			setTitlesExpanded(false);
			setNavigationState((current) => enterAddSourceReview(
				current,
				outcome.result.data.id,
				0,
			));
			queueMicrotask(() => focusElementWithoutScroll(titleInputRef.current));
		}, ADD_SOURCE_SEARCH_DEBOUNCE_MS);

		return () => {
			window.clearTimeout(timer);
			coordinator.cancel({ reset: false, notify: false });
		};
	}, [page, parsedInput, provider, retryGeneration]);

	useEffect(() => () => {
		lookupCoordinatorRef.current.cancel({ notify: false });
		selectionCoordinatorRef.current.cancel({ notify: false });
	}, []);

	useEffect(() => {
		if (
			step !== ADD_SOURCE_STEPS.SEARCH
			|| navigationState.restoreSearchFocusId === null
		) return;
		const resultButton = dialogRef.current?.querySelector?.(
			`[data-tmdb-collection-result="${navigationState.restoreSearchFocusId}"]`,
		);
		restoreAddSourceSearchView({
			scrollElement: scrollRef.current,
			resultElement: resultButton,
			fallbackElement: inputRef.current,
			searchScrollTop: navigationState.searchScrollTop,
			focusWithoutScroll: focusElementWithoutScroll,
		});
		setNavigationState(completeAddSourceSearchRestore);
	}, [navigationState, step]);

	useEffect(() => {
		if (
			step !== ADD_SOURCE_STEPS.SEARCH
			|| selectionState.status !== "error"
		) return undefined;
		let active = true;
		queueMicrotask(() => {
			if (!active) return;
			selectionErrorRef.current?.scrollIntoView?.({
				block: "nearest",
			});
			focusElementWithoutScroll(selectionErrorRef.current);
		});
		return () => {
			active = false;
		};
	}, [selectionState.requestId, selectionState.status, step]);

	function clearApprovalAndDiagnostics() {
		setDuplicate(null);
		setApplyDiagnostic(null);
		submissionGateRef.current.reset();
		setIsApplying(false);
	}

	function handleInputChange(event) {
		setInput(event.target.value);
		setPage(1);
		setNavigationState(createAddSourceNavigationState());
		setSelectedResult(null);
		setSelectionCandidate(null);
		setSelectionState(INITIAL_ASYNC_REQUEST_STATE);
		setTitle("");
		setTitlesExpanded(false);
		clearApprovalAndDiagnostics();
		selectionCoordinatorRef.current.cancel({ notify: false });
	}

	function showReview(result) {
		setSelectedResult(result);
		setTitle(result.name);
		setTitlesExpanded(false);
		clearApprovalAndDiagnostics();
		setNavigationState((current) => enterAddSourceReview(
			current,
			result.id,
			scrollRef.current?.scrollTop ?? current.searchScrollTop,
		));
		queueMicrotask(() => focusElementWithoutScroll(titleInputRef.current));
	}

	async function validateSearchResult(result) {
		if (
			parsedInput.kind === "exact"
			&& selectedResult?.id === result.id
			&& lookupState.status === "success"
		) {
			showReview(selectedResult);
			return;
		}

		const selection = beginSelectedCollectionDetailsRequest({
			coordinator: selectionCoordinatorRef.current,
			provider,
			result,
			navigationState,
			searchScrollTop: scrollRef.current?.scrollTop ?? 0,
		});
		if (selection.repeated) return;

		setNavigationState(selection.navigationState);
		setSelectionCandidate(result);
		setSelectedResult(null);
		setTitle("");
		setTitlesExpanded(false);
		clearApprovalAndDiagnostics();
		const outcome = await selection.request;
		const details = selectedCollectionDetailsFromOutcome(outcome);
		if (details === null) return;
		showReview(details);
	}

	function returnToSearch() {
		if (!selectedResult || isApplying) return;
		setTitlesExpanded(false);
		clearApprovalAndDiagnostics();
		setNavigationState(returnAddSourceToSearch);
	}

	function changePage(nextPage) {
		selectionCoordinatorRef.current.cancel({ notify: false });
		setPage(nextPage);
		setSelectedResult(null);
		setSelectionCandidate(null);
		setSelectionState(INITIAL_ASYNC_REQUEST_STATE);
		setTitle("");
		setTitlesExpanded(false);
		setNavigationState(createAddSourceNavigationState());
		clearApprovalAndDiagnostics();
	}

	async function submit(event) {
		event.preventDefault();
		if (
			!draftResult.ok
			|| applyDisabled
			|| !submissionGateRef.current.begin()
		) return;

		setIsApplying(true);
		let result;
		try {
			result = await onApply(draftResult.draft, {
				duplicateApprovalIdentity: duplicate?.identity ?? null,
			});
		} catch {
			result = {
				ok: false,
				errors: [{
					code: "SOURCE_CREATION_FAILED",
					path: "$sourceCreation",
					message: "The source could not be added. Try again.",
				}],
			};
		}

		if (result?.ok === true) return;
		submissionGateRef.current.reset();
		setIsApplying(false);
		if (result?.requiresDuplicateConfirmation) {
			setDuplicate(result.duplicate);
			setApplyDiagnostic(null);
			return;
		}
		setApplyDiagnostic(
			result?.errors?.[0] ?? {
				code: "SOURCE_CREATION_FAILED",
				path: "$sourceCreation",
				message: "The source could not be added. Try again.",
			},
		);
	}

	const cancel = () => {
		if (!isApplying && !submissionGateRef.current.isActive()) onCancel();
	};

	const content = (
		<div
			className="add-source-portal"
			data-add-source-portal="true"
			data-mobile-surface="opaque"
		>
			<div
				className="settings-modal-backdrop add-source-backdrop"
				data-add-source-modal-backdrop="true"
				data-backdrop-dismiss="false"
				style={viewportStyle ?? undefined}
				onMouseDown={(event) => {
					if (event.target === event.currentTarget) {
						event.preventDefault();
						focusElementWithoutScroll(dialogRef.current);
					}
				}}
			>
				<section
					ref={dialogRef}
					className="add-source-dialog"
					data-add-source-modal="true"
					data-add-source-step={step}
					data-source-mode={MOVIE_FRANCHISE_SOURCE_MODE.id}
					role="dialog"
					aria-modal="true"
					aria-labelledby="add-source-title"
					aria-describedby="add-source-description"
					tabIndex={-1}
					onKeyDown={(event) => handleDialogKeyDown(
						event,
						dialogRef.current,
						cancel,
					)}
				>
					<header className="add-source-heading">
						<div className="add-source-heading-row">
							{step === ADD_SOURCE_STEPS.REVIEW ? (
								<button
									className="add-source-header-action"
									type="button"
									data-action="back-to-source-search"
									disabled={isApplying}
									onClick={returnToSearch}
								>
									<span aria-hidden="true">←</span>
									Back
								</button>
							) : <span className="add-source-header-spacer" aria-hidden="true" />}
							<div>
								<h2 id="add-source-title">Add source</h2>
								<p>Adding to {folderName}</p>
							</div>
							<button
								className="add-source-header-action add-source-close-action"
								type="button"
								data-action="cancel-add-source"
								aria-label="Close Add source"
								disabled={isApplying}
								onClick={cancel}
							>
								Close
							</button>
						</div>
						<p id="add-source-description" className="add-source-heading-description">
							{step === ADD_SOURCE_STEPS.SEARCH
								? "Find an official TMDB movie franchise."
								: "Review the collection and fixed Nuvio source before adding it."}
						</p>
					</header>

					<form
						className="add-source-form"
						data-add-source-form-step={step}
						onSubmit={submit}
						noValidate
					>
						<div ref={scrollRef} className="add-source-scroll">
							{step === ADD_SOURCE_STEPS.SEARCH ? (
								<AddSourceSearchStep
									input={input}
									inputRef={inputRef}
									parsedInput={parsedInput}
									lookupState={lookupState}
									lookupMessage={lookupMessage}
									searchData={searchData}
									selectedResult={selectedResult}
									selectionState={selectionState}
									selectionCandidate={selectionCandidate}
									selectionMessage={selectionMessage}
									selectionErrorRef={selectionErrorRef}
									onInputChange={handleInputChange}
									onRetryLookup={() => setRetryGeneration((value) => value + 1)}
									onSelectResult={validateSearchResult}
									onRetrySelection={validateSearchResult}
									onChangePage={changePage}
								/>
							) : (
								<AddSourceReviewStep
									selectedResult={selectedResult}
									title={title}
									titleInputRef={titleInputRef}
									titleError={titleError}
									titlesExpanded={titlesExpanded}
									duplicate={duplicate}
									applyDiagnostic={applyDiagnostic}
									onTitleChange={(event) => {
										setTitle(event.target.value);
										setApplyDiagnostic(null);
									}}
									onToggleTitles={() => setTitlesExpanded((value) => !value)}
								/>
							)}
						</div>

						{step === ADD_SOURCE_STEPS.REVIEW ? (
							<footer className="add-source-actions">
								<AddSourcePrimaryAction
									duplicate={duplicate}
									disabled={applyDisabled}
									isApplying={isApplying}
								/>
							</footer>
						) : null}
					</form>
				</section>
			</div>
		</div>
	);

	return typeof document === "undefined"
		? content
		: createPortal(content, document.body);
}
