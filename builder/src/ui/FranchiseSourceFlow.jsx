import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
	createAsyncRequestCoordinator,
	createFranchiseHierarchyPlan,
	createFranchiseSelectionState,
	franchiseSelectionNotice,
	FRANCHISE_PLACEMENT_STATUSES,
	INITIAL_ASYNC_REQUEST_STATE,
	parseTmdbCollectionInput,
	removeSelectedFranchise,
	selectedFranchises,
	toggleSelectedFranchise,
	buildTmdbPosterUrl,
} from "../source-add/index.js";
import { HierarchyCollectionPresentationControls } from "./CollectionPresentationChoices.jsx";
import { CreationHeader } from "./CreationHeader.jsx";
import { focusElementWithoutScroll } from "./hierarchy-menu-placement.js";
import { handleDialogKeyDown } from "./modal-focus.js";
import { PresentationSwitch, TitleOptions } from "./PresentationControls.jsx";
import { SourceElsewhereNotice } from "./SourceElsewhereNotice.jsx";

const SEARCH_DEBOUNCE_MS = 250;
const usePrePaintLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function scopeLabel(scope) {
	return scope === "new-folder" ? "New Folder" : "New Collection";
}

function safeOverview(value) {
	if (typeof value !== "string") return "";
	const trimmed = value.trim();
	return trimmed.length > 180 ? `${trimmed.slice(0, 177).trimEnd()}…` : trimmed;
}

function Poster({ item, className = "franchise-result-poster", size = "w185", alt = "" }) {
	const source = buildTmdbPosterUrl(item?.posterPath, size);
	return (
		<span className={`${className}-frame`}>
			{source ? <img className={className} src={source} alt={alt} loading="lazy" /> : <span className={`${className}-placeholder`}>No poster</span>}
		</span>
	);
}

function FranchiseResult({ result, checked, loading, onActivate }) {
	return (
		<label className={`add-source-result franchise-result-selectable${checked ? " is-selected" : ""}${loading ? " is-loading" : ""}`} data-tmdb-franchise-result={result.id} aria-busy={loading || undefined}>
			<input className="visually-hidden selectable-card-checkbox" type="checkbox" checked={checked} onChange={() => onActivate(result)} />
			<span className="selectable-card-indicator" data-selection-indicator="true" data-selection-state={checked ? "selected" : "unselected"} aria-hidden="true">{checked ? "✓" : ""}</span>
			<Poster item={result} />
			<span className="add-source-result-content">
				<span className="add-source-result-heading"><strong>{result.name}</strong><span>TMDB {result.id}</span></span>
				{loading ? <span className="add-source-result-loading">Loading collection details…</span> : <span className={`add-source-result-overview${safeOverview(result.overview) ? "" : " is-muted"}`}>{safeOverview(result.overview) || "Overview unavailable"}</span>}
			</span>
		</label>
	);
}

function SelectedFranchises({ franchises, onRemove, onPreview }) {
	return (
		<details className="genre-selected-disclosure removable-selection-disclosure franchise-selected-disclosure">
			<summary>View selected franchises</summary>
			<ul>
				{franchises.map((franchise) => <li key={franchise.id}>
					<div><strong>{franchise.name}</strong><span>TMDB {franchise.id} · {franchise.movieCount ?? "?"} titles</span></div>
					<span className="franchise-selected-actions"><button className="franchise-selected-preview" type="button" aria-haspopup="dialog" aria-label={`Preview titles for ${franchise.name}`} onClick={(event) => onPreview(franchise, event.currentTarget)}>Preview</button><button className="franchise-selected-remove" type="button" aria-label={`Remove ${franchise.name}`} onClick={() => onRemove(franchise.id)}>×</button></span>
				</li>)}
			</ul>
		</details>
	);
}

function TitlesPreview({ franchise, onClose }) {
	const dialogRef = useRef(null);
	const closeRef = useRef(null);
	useEffect(() => {
		focusElementWithoutScroll(closeRef.current ?? dialogRef.current);
	}, []);
	const titles = (franchise.containedTitles ?? []).slice(0, 10);
	const content = (
		<div className="settings-modal-backdrop nested-modal-backdrop franchise-preview-backdrop" data-nested-modal-backdrop="true" data-franchise-preview-backdrop="true" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
			<section ref={dialogRef} className="franchise-preview-modal" role="dialog" aria-modal="true" aria-labelledby="franchise-preview-title" tabIndex={-1} onKeyDown={(event) => {
				event.stopPropagation();
				handleDialogKeyDown(event, dialogRef.current, onClose);
			}}>
				<header><div><p className="panel-kicker">Poster preview</p><h3 id="franchise-preview-title">{franchise.name}</h3></div><button ref={closeRef} type="button" onClick={onClose}>Close</button></header>
				<p>Up to 10 TMDB titles from this collection. This preview does not change the generated source.</p>
				{titles.length ? <ul className="franchise-preview-grid">{titles.map((movie, index) => <li key={`${movie.id ?? movie.title}-${index}`}><Poster item={movie} className="franchise-preview-poster" size="w342" alt="" /><strong>{movie.title}</strong><span>{movie.releaseYear ?? "Year unavailable"}</span></li>)}</ul> : <p className="add-source-empty-results">TMDB reports no titles to preview for this collection.</p>}
			</section>
		</div>
	);
	return typeof document === "undefined" ? content : createPortal(content, document.body);
}

function statusLabel(status) {
	if (status === FRANCHISE_PLACEMENT_STATUSES.ALREADY_IN_COLLECTION) return "Already in this collection · omitted";
	if (status === FRANCHISE_PLACEMENT_STATUSES.EXISTS_ELSEWHERE) return "Exists elsewhere · ready to create";
	return "Ready to create";
}

function ReviewStep({ planResult, options, onOptionsChange, onPreview, diagnostic }) {
	if (!planResult.ok) return <div className="editor-diagnostics" role="alert"><p>{planResult.errors[0]?.message ?? "The Franchise plan could not be prepared."}</p></div>;
	const plan = planResult.plan;
	return (
		<section className="franchise-review" aria-labelledby="franchise-review-title">
			<div className="add-source-section-heading"><div><p className="panel-kicker">Review &amp; Appearance</p><h3 id="franchise-review-title">{plan.counts.folderCount} folder{plan.counts.folderCount === 1 ? "" : "s"} · {plan.counts.sourceCount} source{plan.counts.sourceCount === 1 ? "" : "s"}</h3></div></div>
			{plan.configuration.scope === "new-collection" ? <>
				<div className="editor-field"><label htmlFor="franchise-collection-name">Collection name</label><input id="franchise-collection-name" type="text" value={options.collectionTitle} onChange={(event) => onOptionsChange({ collectionTitle: event.target.value })} /></div>
				<TitleOptions idPrefix="franchise" collectionTitleVisibility={{ checked: options.hideCollectionTitle, onChange: (hideCollectionTitle) => onOptionsChange({ hideCollectionTitle }), descriptionId: "franchise-hide-title-help", controlName: "franchiseHideNuvioTitle" }} folderTitleVisibility={{ selectedId: options.folderTitleVisibility, name: "franchise-folder-title-visibility", onChange: (folderTitleVisibility) => onOptionsChange({ folderTitleVisibility }) }} />
				<fieldset className="editor-field editor-choice-field"><legend>Collection layout</legend><HierarchyCollectionPresentationControls selectedId={options.viewMode} name="franchise-collection-layout" showAllTab={options.showAllTab} onPresentationChange={onOptionsChange} showAllDescription="Combines every franchise folder in one All tab." showAllDescriptionId="franchise-all-tab-help" showAllControlName="franchiseShowAllTab" /></fieldset>
				<PresentationSwitch label="Pin collection to top" description="Keeps this collection near the top of Nuvio." descriptionId="franchise-pin-help" controlName="franchisePinToTop" checked={options.pinToTop} onChange={(pinToTop) => onOptionsChange({ pinToTop })} />
			</> : <>
				<div className="franchise-inherited-summary"><strong>Parent presentation is inherited</strong><span>{plan.destination.collectionTitle || "Hidden collection"} · {plan.destination.viewMode === "ROWS" ? "Rows" : "Tabs"}</span></div>
				<TitleOptions idPrefix="franchise" folderTitleVisibility={{ selectedId: options.folderTitleVisibility, name: "franchise-folder-title-visibility", onChange: (folderTitleVisibility) => onOptionsChange({ folderTitleVisibility }) }} />
			</>}
			<p className="decades-defaults-note" data-franchise-artwork-rule="poster-only">Franchise folders use the TMDB collection poster by default. You can change the artwork later in Edit Folder.</p>
			{diagnostic ? <div className="editor-diagnostics" role="alert"><p>{diagnostic.message}</p></div> : null}
			<div className="franchise-review-list">{plan.configuration.franchises.map((franchise, index) => {
				const outcome = plan.outcomes[index];
				return <details key={franchise.id}><summary><span className="franchise-review-row-primary"><strong>{franchise.name}</strong></span><span className="franchise-review-row-actions"><em>{statusLabel(outcome.status)}</em><button className="franchise-selected-preview" type="button" aria-haspopup="dialog" aria-label={`Preview titles for ${franchise.name}`} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onPreview(franchise, event.currentTarget); }}>Preview titles</button></span></summary><div className="franchise-review-details"><small>TMDB {franchise.id} · Movie · Collection · TMDB order</small>{outcome.elsewhere.length ? <SourceElsewhereNotice occurrences={outcome.elsewhere} heading="This franchise source exists elsewhere" action="It can still be created here." /> : null}</div></details>;
			})}</div>
		</section>
	);
}

export function FranchiseSourceFlow({
	scope,
	project,
	projectRevision,
	destinationCollectionInternalId = null,
	destinationCollectionTitle = null,
	provider,
	onBack,
	onCancel,
	onApply,
}) {
	const [step, setStep] = useState("select");
	const [input, setInput] = useState("");
	const [page, setPage] = useState(1);
	const [retry, setRetry] = useState(0);
	const [lookupState, setLookupState] = useState(INITIAL_ASYNC_REQUEST_STATE);
	const [selectionState, setSelectionState] = useState(INITIAL_ASYNC_REQUEST_STATE);
	const [selection, setSelection] = useState(createFranchiseSelectionState);
	const [loadingId, setLoadingId] = useState(null);
	const [selectionError, setSelectionError] = useState(null);
	const [preview, setPreview] = useState(null);
	const [diagnostic, setDiagnostic] = useState(null);
	const [isApplying, setIsApplying] = useState(false);
	const [options, setOptions] = useState(() => Object.freeze({ collectionTitle: "Franchises", hideCollectionTitle: false, viewMode: "TABBED_GRID", showAllTab: true, pinToTop: false, folderTitleVisibility: "HIDE_HOME_SCREEN" }));
	const lookupCoordinatorRef = useRef(null);
	const selectionCoordinatorRef = useRef(null);
	const reviewHeadingRef = useRef(null);
	const selectHeadingRef = useRef(null);
	const previewTriggerRef = useRef(null);
	const scrollRef = useRef(null);
	const selectScrollTopRef = useRef(0);
	if (lookupCoordinatorRef.current === null) lookupCoordinatorRef.current = createAsyncRequestCoordinator({ onStateChange: setLookupState });
	if (selectionCoordinatorRef.current === null) selectionCoordinatorRef.current = createAsyncRequestCoordinator({ onStateChange: setSelectionState });
	const parsedInput = useMemo(() => parseTmdbCollectionInput(input), [input]);
	const chosen = selectedFranchises(selection);
	const notice = franchiseSelectionNotice(selection);
	const searchData = parsedInput.kind === "search" && lookupState.status === "success" && lookupState.context?.query === parsedInput.query && lookupState.context.page === page
		? lookupState.data
		: parsedInput.kind === "exact" && lookupState.status === "success" && lookupState.context?.id === parsedInput.id
			? { results: [lookupState.data], page: 1, totalPages: 1, totalResults: 1 }
			: null;
	const planResult = useMemo(() => createFranchiseHierarchyPlan(project, {
		scope,
		projectRevision,
		...(scope === "new-folder" ? { destinationCollectionInternalId } : options),
		...(scope === "new-folder" ? { folderTitleVisibility: options.folderTitleVisibility } : {}),
		franchises: chosen,
	}), [chosen, destinationCollectionInternalId, options, project, projectRevision, scope]);

	useEffect(() => {
		const coordinator = lookupCoordinatorRef.current;
		coordinator.cancel({ notify: false });
		setLookupState(INITIAL_ASYNC_REQUEST_STATE);
		if (parsedInput.kind === "empty" || parsedInput.kind === "invalid" || (parsedInput.kind === "search" && !parsedInput.eligible)) return undefined;
		const timer = window.setTimeout(() => coordinator.run(
			({ signal }) => parsedInput.kind === "exact" ? provider.getCollection(parsedInput.id, { signal }) : provider.searchCollections(parsedInput.query, { page, signal }),
			parsedInput.kind === "exact" ? { id: parsedInput.id } : { query: parsedInput.query, page },
		), SEARCH_DEBOUNCE_MS);
		return () => { window.clearTimeout(timer); coordinator.cancel({ reset: false, notify: false }); };
	}, [page, parsedInput, provider, retry]);

	useEffect(() => () => { lookupCoordinatorRef.current.cancel({ notify: false }); selectionCoordinatorRef.current.cancel({ notify: false }); }, []);
	usePrePaintLayoutEffect(() => {
		if (scrollRef.current) scrollRef.current.scrollTop = step === "review" ? 0 : selectScrollTopRef.current;
		focusElementWithoutScroll(step === "review" ? reviewHeadingRef.current : selectHeadingRef.current);
	}, [step]);

	async function activate(result) {
		if (selectionState.status === "loading" && selectionState.context?.id === result.id) return;
		if (selection.byId[result.id]) {
			setSelection((current) => removeSelectedFranchise(current, result.id));
			return;
		}
		setLoadingId(result.id);
		setSelectionError(null);
		const outcome = await selectionCoordinatorRef.current.run(({ signal }) => provider.getCollection(result.id, { signal }), { id: result.id });
		setLoadingId(null);
		if (!outcome.accepted) return;
		if (outcome.result?.ok !== true) {
			setSelectionError(outcome.result?.error ?? { message: "That collection’s details could not be loaded." });
			return;
		}
		setSelection((current) => toggleSelectedFranchise(current, outcome.result.data).state);
	}

	function updateOptions(patch) {
		setOptions((current) => Object.freeze({ ...current, ...patch }));
		setDiagnostic(null);
	}

	function openPreview(franchise, trigger) {
		previewTriggerRef.current = trigger;
		setPreview(franchise);
	}

	function closePreview() {
		const trigger = previewTriggerRef.current;
		previewTriggerRef.current = null;
		setPreview(null);
		queueMicrotask(() => focusElementWithoutScroll(trigger));
	}

	async function submit(event) {
		event.preventDefault();
		if (step === "select") {
			if (chosen.length) {
				selectScrollTopRef.current = scrollRef.current?.scrollTop ?? 0;
				setStep("review");
			}
			return;
		}
		if (!planResult.ok || planResult.plan.counts.folderCount === 0 || isApplying) return;
		setIsApplying(true);
		let result;
		try { result = await onApply(planResult.plan); } catch { result = { ok: false, errors: [{ message: "Franchises could not be created. Try again." }] }; }
		if (result?.ok) return;
		setIsApplying(false);
		setDiagnostic(result?.errors?.[0] ?? { message: "Franchises could not be created. Try again." });
	}

	const back = () => {
		if (isApplying) return;
		if (step === "review") { setStep("select"); setDiagnostic(null); }
		else onBack();
	};
	return <>
		<CreationHeader title="Create with Franchises" context={`${scopeLabel(scope)}${scope === "new-folder" && destinationCollectionTitle ? ` · ${destinationCollectionTitle}` : ""}`} description={step === "select" ? "Select TMDB movie collections in folder order, then review appearance and placement." : "Review names, appearance and exact Collection-ID placement before creating everything atomically."} onBack={back} backAction={step === "select" ? "back-to-creation-launcher" : "back-to-franchise-selection"} backDisabled={isApplying} inactive={Boolean(preview)} onClose={onCancel} />
		<form className="add-source-form franchise-creation-form" data-franchise-stage={step} onSubmit={submit} noValidate>
			<div ref={scrollRef} className="add-source-scroll" inert={preview || undefined} aria-hidden={preview ? "true" : undefined}>
				{step === "select" ? <>
					<section className="add-source-mode"><div><h3 ref={selectHeadingRef} tabIndex={-1}>Movie franchises · TMDB</h3><p>Choose exact TMDB collections. One folder and one native movie source will be created for each selection.</p></div></section>
					<div className="editor-field add-source-query-field"><label htmlFor="franchise-source-query">Search or enter an exact collection</label><input id="franchise-source-query" type="search" value={input} autoComplete="off" spellCheck="false" onChange={(event) => { setInput(event.target.value); setPage(1); setSelectionError(null); }} aria-invalid={parsedInput.kind === "invalid" ? "true" : undefined} aria-describedby="franchise-query-help franchise-query-status" /><p className="editor-field-help" id="franchise-query-help">Search by franchise name, TMDB Collection ID or paste a TMDB collection link.</p><p id="franchise-query-status" className={parsedInput.kind === "invalid" ? "editor-field-error" : "editor-field-status"} role={parsedInput.kind === "invalid" ? "alert" : "status"}>{parsedInput.kind === "invalid" ? parsedInput.message : parsedInput.kind === "search" && !parsedInput.eligible ? parsedInput.message : lookupState.status === "loading" ? "Searching TMDB collections…" : null}</p></div>
					{chosen.length ? <section className="people-selected-tray franchise-selected-tray"><div className="people-selected-summary"><strong>{chosen.length} franchise{chosen.length === 1 ? "" : "s"} selected</strong><SelectedFranchises franchises={chosen} onRemove={(id) => setSelection((current) => removeSelectedFranchise(current, id))} onPreview={openPreview} /></div>{notice.visible ? <p className="people-selection-limit" data-large-selection-notice="true" role="status">You’ve selected {notice.count} franchises. Review may take a little longer, but there is no selection cap.</p> : null}</section> : null}
					{lookupState.status === "error" ? <div className="add-source-request-state" role="alert"><p>{lookupState.error?.message ?? "TMDB could not complete this search."}</p>{lookupState.error?.retryable ? <button type="button" onClick={() => setRetry((value) => value + 1)}>Retry</button> : null}</div> : null}
					{selectionError ? <div className="add-source-request-state" role="alert"><p>{selectionError.message}</p></div> : null}
					{searchData ? <section className="add-source-results"><div className="add-source-section-heading"><div><p className="panel-kicker">TMDB results</p><h3>Select franchises</h3></div>{searchData.totalPages > 1 ? <span>Page {searchData.page} of {searchData.totalPages}</span> : null}</div>{searchData.results.length ? <div className="add-source-result-list">{searchData.results.map((result) => <FranchiseResult key={result.id} result={result} checked={Boolean(selection.byId[result.id])} loading={loadingId === result.id || (selectionState.status === "loading" && selectionState.context?.id === result.id)} onActivate={activate} />)}</div> : <p className="add-source-empty-results">No TMDB collections matched this search.</p>}{searchData.totalPages > 1 ? <nav className="add-source-pagination"><button type="button" disabled={searchData.page <= 1} onClick={() => setPage(searchData.page - 1)}>Previous page</button><button type="button" disabled={searchData.page >= searchData.totalPages} onClick={() => setPage(searchData.page + 1)}>Next page</button></nav> : null}</section> : null}
				</> : <div ref={reviewHeadingRef} tabIndex={-1}><ReviewStep planResult={planResult} options={options} onOptionsChange={updateOptions} onPreview={openPreview} diagnostic={diagnostic} /></div>}
			</div>
			<footer className="add-source-actions"><button className="editor-apply" type="submit" disabled={step === "select" ? chosen.length === 0 : !planResult.ok || planResult.plan.counts.folderCount === 0 || isApplying}>{step === "select" ? `Review ${chosen.length} franchise${chosen.length === 1 ? "" : "s"}` : isApplying ? "Creating…" : `Create ${planResult.ok ? planResult.plan.counts.folderCount : 0} folder${planResult.ok && planResult.plan.counts.folderCount === 1 ? "" : "s"}`}</button></footer>
		</form>
		{preview ? <TitlesPreview franchise={preview} onClose={closePreview} /> : null}
	</>;
}
