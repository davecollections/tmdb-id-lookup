import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
	buildTmdbListSourceDraft,
	createAsyncRequestCoordinator,
	createTmdbListHierarchyPlan,
	DEFAULT_TMDB_LIST_FOLDER_TILE_SHAPE,
	DEFAULT_TMDB_LIST_FOLDER_TITLE_VISIBILITY,
	inspectTmdbListSourceDuplicates,
	parseTmdbListBatch,
	requestSourceTitlePreview,
	tmdbListDuplicateOverrideIdentity,
	TMDB_LIST_PLACEMENT_STATUSES,
} from "../source-add/index.js";
import { lockAddSourceDocumentBody, observeAddSourceViewport, resolveAddSourceViewportStyle } from "./add-source-modal-lifecycle.js";
import { HierarchyCollectionPresentationControls } from "./CollectionPresentationChoices.jsx";
import { CreationHeader } from "./CreationHeader.jsx";
import { focusElementWithoutScroll } from "./hierarchy-menu-placement.js";
import { handleDialogKeyDown } from "./modal-focus.js";
import { FolderShapeChoices, PresentationSwitch, TitleOptions } from "./PresentationControls.jsx";
import { SourceElsewhereNotice } from "./SourceElsewhereNotice.jsx";
import { SourceTitlePreviewDialog } from "./SourceTitlePreviewDialog.jsx";

const usePrePaintLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
const SOURCE_NAME_HELPER = "This is the name shown in Nuvio. You can customise it.";
function scopeLabel(scope) { return scope === "new-folder" ? "New Folder" : "New Collection"; }
function sourceDrafts(lists) { return lists.map((list) => buildTmdbListSourceDraft(list, list.sourceTitle).draft).filter(Boolean); }
function statusLabel(status) {
	if (status === TMDB_LIST_PLACEMENT_STATUSES.ALREADY_IN_COLLECTION) return "Already in this collection · omitted";
	if (status === TMDB_LIST_PLACEMENT_STATUSES.EXISTS_ELSEWHERE) return "Exists elsewhere · ready to create";
	return "Ready to create";
}

function guidedCreateActionLabel(scope) {
	return scope === "new-collection" ? "Create collection" : "Create folder";
}

function requiredNamesMessage({ collection, folder }) {
	if (collection && folder) return "Collection and folder names are required.";
	if (collection) return "Collection name is required.";
	if (folder) return "Folder name is required.";
	return null;
}

function safeSubmittedValue(value) {
	try {
		const url = new URL(value);
		if (url.username || url.password) {
			url.username = "";
			url.password = "";
			return `${url.toString()} (credentials removed)`;
		}
	} catch {
		// The strict parser already supplies the relevant syntax error.
	}
	return value;
}

function GuidedPresentationControls({ scope, options, destinationCollectionTitle, onChange }) {
	return <>
		{scope === "new-folder" ? <div className="franchise-inherited-summary"><strong>Parent presentation is inherited</strong><span>{destinationCollectionTitle || "Hidden collection"} · parent unchanged</span></div> : null}
		<TitleOptions
			idPrefix="tmdb-list-hierarchy"
			collectionTitleVisibility={scope === "new-collection" ? { checked: options.hideCollectionTitle, onChange: (hideCollectionTitle) => onChange({ hideCollectionTitle }), descriptionId: "tmdb-list-hide-title-help", controlName: "tmdbListHideNuvioTitle" } : null}
			folderTitleVisibility={{ selectedId: options.folderTitleVisibility, name: "tmdb-list-folder-title-visibility", onChange: (folderTitleVisibility) => onChange({ folderTitleVisibility }) }}
		/>
		{scope === "new-collection" ? <>
			<fieldset className="editor-field editor-choice-field"><legend>Collection layout</legend><HierarchyCollectionPresentationControls selectedId={options.viewMode} name="tmdb-list-collection-layout" showAllTab={options.showAllTab} onPresentationChange={onChange} showAllDescription="Combines every TMDB List source in the folder into one All tab." showAllDescriptionId="tmdb-list-all-tab-help" showAllControlName="tmdbListShowAllTab" /></fieldset>
			<PresentationSwitch label="Pin collection to top" description="Keeps this collection near the top of Nuvio." descriptionId="tmdb-list-pin-help" controlName="tmdbListPinToTop" checked={options.pinToTop} onChange={(pinToTop) => onChange({ pinToTop })} />
		</> : null}
		<fieldset className="editor-field editor-choice-field" data-editor-field="folderTileShape"><legend>Tile shape</legend><p className="editor-field-help">Applies to the new folder. No list-derived artwork is assigned.</p><FolderShapeChoices selectedId={options.folderTileShape} name="tmdb-list-folder-shape" idPrefix="tmdb-list-folder" onChange={(folderTileShape) => onChange({ folderTileShape })} /></fieldset>
	</>;
}

function SelectedLists({ lists, onPreview, onRemove }) {
	return <section className="tmdb-list-selected" aria-labelledby="tmdb-list-selected-title">
		<div className="add-source-section-heading"><div><p className="panel-kicker">Selected</p><h3 id="tmdb-list-selected-title">{lists.length} TMDB list{lists.length === 1 ? "" : "s"}</h3></div></div>
		<ul className="tmdb-list-selected-items">{lists.map((list) => <li key={list.id}><div><strong>{list.name || `TMDB list ${list.id}`}</strong><span>TMDB {list.id} · {list.itemCount} title{list.itemCount === 1 ? "" : "s"}{list.creator ? ` · ${list.creator}` : ""}</span></div><span><button type="button" aria-haspopup="dialog" onClick={(event) => onPreview(list, event.currentTarget)}>Preview</button><button type="button" aria-label={`Remove ${list.name || `TMDB list ${list.id}`}`} onClick={() => onRemove(list.id)}>×</button></span></li>)}</ul>
	</section>;
}

export function TmdbListSourceFlow({
	context = "add-source",
	scope = null,
	project,
	projectRevision = 0,
	destinationCollectionInternalId = null,
	destinationCollectionTitle = null,
	folder = null,
	provider,
	onBack,
	onCancel,
	onApply,
}) {
	const standalone = context === "add-source";
	const [step, setStep] = useState("select");
	const [input, setInput] = useState("");
	const [lists, setLists] = useState([]);
	const [resolving, setResolving] = useState(false);
	const [lineErrors, setLineErrors] = useState([]);
	const [duplicateNotice, setDuplicateNotice] = useState("");
	const [diagnostic, setDiagnostic] = useState(null);
	const [duplicateOverride, setDuplicateOverride] = useState(false);
	const [collectionTitle, setCollectionTitle] = useState("");
	const [folderTitle, setFolderTitle] = useState("");
	const [requiredNameErrors, setRequiredNameErrors] = useState(() => Object.freeze({ collection: false, folder: false }));
	const [presentation, setPresentation] = useState(() => Object.freeze({ hideCollectionTitle: false, viewMode: "TABBED_GRID", showAllTab: true, pinToTop: false, folderTitleVisibility: DEFAULT_TMDB_LIST_FOLDER_TITLE_VISIBILITY, folderTileShape: DEFAULT_TMDB_LIST_FOLDER_TILE_SHAPE }));
	const [preview, setPreview] = useState(null);
	const [viewportStyle, setViewportStyle] = useState(() => typeof window === "undefined" ? null : resolveAddSourceViewportStyle(window));
	const [applying, setApplying] = useState(false);
	const dialogRef = useRef(null);
	const headingRef = useRef(null);
	const inputRef = useRef(null);
	const collectionTitleRef = useRef(null);
	const folderTitleRef = useRef(null);
	const scrollRef = useRef(null);
	const previewTriggerRef = useRef(null);
	const resolveControllerRef = useRef(null);
	const previewCoordinatorRef = useRef(null);
	const reviewRevisionRef = useRef(null);
	if (previewCoordinatorRef.current === null) previewCoordinatorRef.current = createAsyncRequestCoordinator();

	const drafts = useMemo(() => sourceDrafts(lists), [lists]);
	const duplicateReview = useMemo(() => standalone && folder ? inspectTmdbListSourceDuplicates(project, folder.internalId, drafts) : null, [drafts, folder, project, standalone]);
	const planResult = useMemo(() => standalone ? null : createTmdbListHierarchyPlan(project, {
		scope,
		projectRevision,
		...(scope === "new-folder" ? { destinationCollectionInternalId } : { collectionTitle, hideCollectionTitle: presentation.hideCollectionTitle, viewMode: presentation.viewMode, showAllTab: presentation.showAllTab, pinToTop: presentation.pinToTop }),
		folderTitle,
		folderTitleVisibility: presentation.folderTitleVisibility,
		folderTileShape: presentation.folderTileShape,
		lists,
	}), [collectionTitle, destinationCollectionInternalId, folderTitle, lists, presentation, project, projectRevision, scope, standalone]);
	const destinationDuplicates = duplicateReview?.destination ?? [];
	const normalAddCount = standalone ? drafts.filter((draft) => !destinationDuplicates.some((entry) => entry.identity.endsWith(`|${draft.editable.tmdbId}|MOVIE`))).length : planResult?.ok ? planResult.plan.counts.sourceCount : 0;

	usePrePaintLayoutEffect(() => {
		if (!standalone) return undefined;
		const unlock = lockAddSourceDocumentBody();
		const stop = observeAddSourceViewport(setViewportStyle);
		focusElementWithoutScroll(inputRef.current ?? dialogRef.current);
		return () => { stop(); unlock(); };
	}, [standalone]);
	usePrePaintLayoutEffect(() => {
		if (scrollRef.current) scrollRef.current.scrollTop = 0;
		focusElementWithoutScroll(step === "select" ? inputRef.current : headingRef.current);
	}, [step]);
	useEffect(() => () => { resolveControllerRef.current?.abort(); previewCoordinatorRef.current?.cancel({ notify: false }); }, []);

	async function resolveLists() {
		if (resolving) return;
		const batch = parseTmdbListBatch(input, { selectedIds: lists.map((list) => list.id) });
		const submittedDuplicates = batch.duplicates.filter((entry) => entry.kind === "submitted");
		setLineErrors(batch.errors);
		setDuplicateNotice(submittedDuplicates.length ? `${submittedDuplicates.length} repeated entr${submittedDuplicates.length === 1 ? "y in this batch was" : "ies in this batch were"} ignored.` : "");
		if (!batch.entries.length) return;
		resolveControllerRef.current?.abort();
		const controller = new AbortController();
		resolveControllerRef.current = controller;
		setResolving(true);
		const resolved = [];
		const failed = [...batch.errors];
		for (const entry of batch.entries) {
			const result = await provider.getList(entry.id, { signal: controller.signal });
			if (controller.signal.aborted) return;
			if (result?.ok) resolved.push(Object.freeze({ ...result.data, sourceTitle: result.data.name || `TMDB list ${result.data.id}` }));
			else failed.push(Object.freeze({ line: entry.line, value: entry.value, code: result?.error?.kind ?? "provider", message: result?.error?.message ?? "This TMDB list could not be resolved." }));
		}
		setLists((current) => Object.freeze([...current, ...resolved]));
		setLineErrors(Object.freeze(failed));
		setResolving(false);
	}

	function clearInput() {
		resolveControllerRef.current?.abort();
		setResolving(false);
		setInput("");
		setLineErrors([]);
		setDuplicateNotice("");
		queueMicrotask(() => focusElementWithoutScroll(inputRef.current));
	}

	function openPreview(list, trigger) {
		previewTriggerRef.current = trigger;
		const candidate = Object.freeze({ request: Object.freeze({ kind: "list", tmdbId: list.id, mediaType: "MOVIE", label: list.name || `TMDB list ${list.id}` }) });
		setPreview({ status: "loading", candidate, data: null, error: null });
		previewCoordinatorRef.current.run(({ signal }) => requestSourceTitlePreview(candidate.request, { list: provider }, signal), `list:${list.id}`).then((outcome) => {
			if (!outcome.accepted) return;
			setPreview(outcome.result?.ok ? { status: "ready", candidate, data: outcome.result.data, error: null } : { status: "error", candidate, data: null, error: outcome.result?.error });
		});
	}
	function closePreview() {
		previewCoordinatorRef.current.cancel({ notify: false });
		setPreview(null);
		const trigger = previewTriggerRef.current;
		previewTriggerRef.current = null;
		queueMicrotask(() => focusElementWithoutScroll(trigger));
	}
	function retryPreview() {
		const id = preview?.candidate?.request?.tmdbId;
		const list = lists.find((entry) => entry.id === id);
		if (list) openPreview(list, previewTriggerRef.current);
	}
	function updateTitle(id, sourceTitle) {
		setLists((current) => Object.freeze(current.map((list) => list.id === id ? Object.freeze({ ...list, sourceTitle }) : list)));
		setDiagnostic(null);
	}
	function updatePresentation(patch) {
		setPresentation((current) => Object.freeze({ ...current, ...patch }));
		setDiagnostic(null);
	}
	function updateRequiredName(field, value) {
		if (field === "collection") setCollectionTitle(value);
		else setFolderTitle(value);
		if (value.trim()) setRequiredNameErrors((current) => current[field] ? Object.freeze({ ...current, [field]: false }) : current);
		setDiagnostic(null);
	}

	async function submit(event) {
		event.preventDefault();
		if (step === "select") { if (lists.length) { reviewRevisionRef.current = projectRevision; setStep("review"); } return; }
		if (applying) return;
		if (!standalone) {
			const missing = Object.freeze({
				collection: scope === "new-collection" && !collectionTitle.trim(),
				folder: !folderTitle.trim(),
			});
			if (missing.collection || missing.folder) {
				setRequiredNameErrors(missing);
				setDiagnostic(null);
				queueMicrotask(() => {
					const target = missing.collection ? collectionTitleRef.current : folderTitleRef.current;
					target?.scrollIntoView?.({ block: "nearest" });
					focusElementWithoutScroll(target);
				});
				return;
			}
		}
		if (standalone && reviewRevisionRef.current !== projectRevision) { setDiagnostic({ message: "The Builder project changed. Return to selection and review the current placement before adding sources." }); return; }
		if (drafts.length !== lists.length) { setDiagnostic({ message: "Enter a valid name for every TMDB List source." }); return; }
		if (!standalone && (!planResult?.ok || planResult.plan.counts.sourceCount === 0)) { setDiagnostic({ message: planResult?.errors?.[0]?.message ?? "Nothing to add here." }); return; }
		setApplying(true);
		const payload = standalone ? {
			drafts,
			expectedProjectRevision: reviewRevisionRef.current,
			duplicateOverrideIdentity: duplicateOverride ? tmdbListDuplicateOverrideIdentity(folder.internalId, drafts) : null,
		} : planResult.plan;
		let result;
		try { result = await onApply(payload); } catch { result = { ok: false, errors: [{ message: "TMDB Lists could not be added. Try again." }] }; }
		if (result?.ok) return;
		setApplying(false);
		setDiagnostic(result?.errors?.[0] ?? { message: "TMDB Lists could not be added. Try again." });
	}

	const reviewOutcomes = standalone ? lists.map((list) => {
		const identity = `tmdb|LIST|${list.id}|MOVIE`;
		const destination = duplicateReview?.destination.filter((entry) => entry.identity === identity) ?? [];
		const elsewhere = duplicateReview?.elsewhere.filter((entry) => entry.identity === identity) ?? [];
		return { status: destination.length ? TMDB_LIST_PLACEMENT_STATUSES.ALREADY_IN_COLLECTION : elsewhere.length ? TMDB_LIST_PLACEMENT_STATUSES.EXISTS_ELSEWHERE : TMDB_LIST_PLACEMENT_STATUSES.READY, destination, elsewhere };
	}) : planResult?.ok ? planResult.plan.outcomes : [];
	const count = standalone ? (duplicateOverride ? lists.length : normalAddCount) : planResult?.ok ? planResult.plan.counts.sourceCount : lists.length;
	const requiredNameMessage = requiredNamesMessage(requiredNameErrors);
	const back = () => { if (applying) return; if (step === "review") { setStep("select"); setDiagnostic(null); setRequiredNameErrors(Object.freeze({ collection: false, folder: false })); } else onBack(); };

	const inner = <>
		<CreationHeader title={standalone ? "Add TMDB lists" : "Create with TMDB Lists"} context={standalone ? `In ${folder?.editable?.title ?? "selected folder"}` : `${scopeLabel(scope)}${scope === "new-folder" && destinationCollectionTitle ? ` · ${destinationCollectionTitle}` : ""}`} description={step === "select" ? "Resolve public TMDB list URLs or IDs, then review source names and placement." : "Review exact List-ID placement before applying everything atomically."} onBack={back} backAction={step === "select" ? "back-to-source-modes" : "back-to-tmdb-list-selection"} backDisabled={applying} inactive={Boolean(preview)} onClose={onCancel} />
		<form className="add-source-form tmdb-list-form" data-tmdb-list-stage={step} onSubmit={submit} noValidate>
			<div ref={scrollRef} className="add-source-scroll" inert={preview || undefined} aria-hidden={preview ? "true" : undefined}>
				{step === "select" ? <>
					<section className="add-source-mode"><div><h3 ref={headingRef} tabIndex={-1}>TMDB lists</h3><p>Add one or more public TMDB lists. List order becomes source order.</p></div></section>
					<div className="editor-field tmdb-list-input-field"><label htmlFor={`tmdb-list-input-${context}`}>List URLs or IDs</label><textarea className="editor-textarea" ref={inputRef} id={`tmdb-list-input-${context}`} rows="6" value={input} autoComplete="off" spellCheck="false" placeholder={"1234\n5678"} onChange={(event) => { setInput(event.target.value); setLineErrors([]); setDuplicateNotice(""); }} aria-describedby="tmdb-list-input-help" /><p id="tmdb-list-input-help" className="editor-field-help">One per line. Use a numeric TMDB List ID or a public themoviedb.org/list URL.</p><div className="tmdb-list-input-actions"><button className="editor-apply tmdb-list-resolve" type="button" disabled={resolving || !input.trim()} onClick={resolveLists}>{resolving ? "Resolving…" : "Resolve lists"}</button><button className="editor-cancel tmdb-list-clear" type="button" disabled={!input && lineErrors.length === 0 && !duplicateNotice} onClick={clearInput}>Clear input</button></div></div>
					{duplicateNotice ? <p className="editor-field-status" role="status">{duplicateNotice}</p> : null}
					{lineErrors.length ? <div className="add-source-request-state tmdb-list-input-errors" role="alert"><p>{lineErrors.length} entr{lineErrors.length === 1 ? "y needs" : "ies need"} attention.</p><ul>{lineErrors.map((error) => { const submittedValue = safeSubmittedValue(error.value); return <li className="tmdb-list-input-error" key={`${error.line}:${error.value}`}>Line {error.line} · <span className="tmdb-list-error-value" title={submittedValue}>{submittedValue}</span> — {error.message}</li>; })}</ul></div> : null}
					{lists.length ? <SelectedLists lists={lists} onPreview={openPreview} onRemove={(id) => setLists((current) => Object.freeze(current.filter((list) => list.id !== id)))} /> : null}
				</> : <section className="tmdb-list-review" aria-labelledby="tmdb-list-review-title">
					<div className="add-source-section-heading"><div><p className="panel-kicker">Review</p><h3 ref={headingRef} id="tmdb-list-review-title" tabIndex={-1}>{count ? `${count} source${count === 1 ? "" : "s"} will be added` : "Nothing to add"}</h3></div></div>
					{!standalone && scope === "new-collection" ? <div className="editor-field"><label htmlFor="tmdb-list-collection-title">Collection name</label><input ref={collectionTitleRef} id="tmdb-list-collection-title" type="text" value={collectionTitle} aria-invalid={requiredNameErrors.collection ? "true" : undefined} aria-describedby={requiredNameErrors.collection ? "tmdb-list-required-names" : undefined} onChange={(event) => updateRequiredName("collection", event.target.value)} /></div> : null}
					{!standalone ? <div className="editor-field"><label htmlFor="tmdb-list-folder-title">Folder name</label><input ref={folderTitleRef} id="tmdb-list-folder-title" type="text" value={folderTitle} aria-invalid={requiredNameErrors.folder ? "true" : undefined} aria-describedby={`tmdb-list-folder-help${requiredNameErrors.folder ? " tmdb-list-required-names" : ""}`} onChange={(event) => updateRequiredName("folder", event.target.value)} /><p id="tmdb-list-folder-help" className="editor-field-help">One folder will contain the selected List sources in this order.</p></div> : null}
					{!standalone ? <GuidedPresentationControls scope={scope} options={presentation} destinationCollectionTitle={destinationCollectionTitle} onChange={updatePresentation} /> : null}
					<div className="tmdb-list-review-items">{lists.map((list, index) => { const outcome = reviewOutcomes[index] ?? { status: TMDB_LIST_PLACEMENT_STATUSES.READY, elsewhere: [] }; const sourceHelpId = `tmdb-list-source-title-${list.id}-help`; return <article key={list.id} className="tmdb-list-review-item"><div><strong>{list.name || `TMDB list ${list.id}`}</strong><em>{statusLabel(outcome.status)}</em></div><small>TMDB {list.id} · {list.itemCount} title{list.itemCount === 1 ? "" : "s"} · Original order</small><div className="editor-field"><label htmlFor={`tmdb-list-source-title-${list.id}`}>Source name</label><input id={`tmdb-list-source-title-${list.id}`} type="text" value={list.sourceTitle} aria-describedby={sourceHelpId} onChange={(event) => updateTitle(list.id, event.target.value)} /><p id={sourceHelpId} className="editor-field-help">{SOURCE_NAME_HELPER}</p></div>{outcome.elsewhere?.length ? <SourceElsewhereNotice occurrences={outcome.elsewhere} heading="This TMDB List source exists elsewhere" action="It can still be added here." /> : null}</article>; })}</div>
					{standalone && destinationDuplicates.length ? <div className="editor-diagnostics"><p>{destinationDuplicates.length} selected source{destinationDuplicates.length === 1 ? " is" : "s are"} already in this folder and will be omitted.</p><button type="button" onClick={() => setDuplicateOverride((value) => !value)}>{duplicateOverride ? "Omit existing sources" : "Add all anyway"}</button></div> : null}
					{diagnostic ? <div className="editor-diagnostics" role="alert"><p>{diagnostic.message}</p></div> : null}
				</section>}
			</div>
			<footer className="add-source-actions tmdb-list-actions"><button className="editor-apply" type="submit" disabled={applying || (step === "select" ? lists.length === 0 : count === 0)}>{step === "select" ? `Review ${lists.length} list${lists.length === 1 ? "" : "s"}` : applying ? (standalone ? "Adding…" : "Creating…") : standalone ? `Add ${count} source${count === 1 ? "" : "s"}` : guidedCreateActionLabel(scope)}</button>{step === "review" && !standalone && requiredNameMessage ? <p id="tmdb-list-required-names" className="tmdb-list-footer-validation" role="alert">{requiredNameMessage}</p> : null}</footer>
		</form>
		{preview ? <SourceTitlePreviewDialog preview={preview} titleId="tmdb-list-preview-title" backdropProps={{ "data-tmdb-list-preview": "true" }} dialogProps={{ "data-tmdb-list-preview-dialog": "true" }} onClose={closePreview} onRetry={retryPreview} /> : null}
	</>;

	if (!standalone) return inner;
	const content = <div className="add-source-portal tmdb-list-portal" data-tmdb-list-portal="true" data-mobile-surface="opaque"><div className="settings-modal-backdrop add-source-backdrop" style={viewportStyle ?? undefined} onMouseDown={(event) => { if (event.target === event.currentTarget) { event.preventDefault(); focusElementWithoutScroll(dialogRef.current); } }}><section ref={dialogRef} className="add-source-dialog tmdb-list-dialog" role="dialog" aria-modal="true" aria-labelledby="creation-title" tabIndex={-1} onKeyDown={(event) => handleDialogKeyDown(event, dialogRef.current, onCancel)}>{inner}</section></div></div>;
	return typeof document === "undefined" ? content : createPortal(content, document.body);
}
