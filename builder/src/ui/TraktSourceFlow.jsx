import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createAsyncRequestCoordinator } from "../source-add/async-request-state.js";
import { createTraktSelectionSession, effectiveTraktMedia } from "../source-add/trakt-selection.js";
import { createTraktCreationPlan, defaultTraktListTitle, defaultTraktSourceTitle } from "../source-add/trakt-creation-plan.js";
import { buildNativeTraktSourceDraft } from "../source-add/trakt-source.js";
import { nativeTraktPhysicalIdentity } from "../nuvio/trakt.js";
import { isValidVisibleNuvioTitle } from "../nuvio/titles.js";
import { SemanticSortChoices } from "./SemanticSortChoices.jsx";
import { builderCardScrollBehavior } from "./responsive-viewport.js";
import { CreationHeader } from "./CreationHeader.jsx";
import { SourceTitlePreviewDialog } from "./SourceTitlePreviewDialog.jsx";
import { useTraktTitlePreview } from "./use-trakt-title-preview.js";
import { NestedPreviewDialog } from "./NestedPreviewDialog.jsx";
import { CreationStageIntro } from "./CreationStageIntro.jsx";
import { creationContext, sourceDestinationContext } from "./creation-context.js";
import { guidedCreateActionLabel } from "./creation-options.js";
import { GuidedPresentationControls } from "./GuidedPresentationControls.jsx";
import { HiddenTitleFieldHelp } from "./PresentationControls.jsx";
import { HierarchyOutputSummary } from "./HierarchyOutputSummary.jsx";
import { RequiredNameInput, focusRequiredName } from "./RequiredNameInput.jsx";
import { RemovableSelectionSummary } from "./RemovableSelectionSummary.jsx";
import { SourceNamesDisclosure } from "./SourceNamesDisclosure.jsx";
import { SourceElsewhereNotice } from "./SourceElsewhereNotice.jsx";
import { useSourceNames } from "./use-source-names.js";
import { lockAddSourceDocumentBody, observeAddSourceViewport, resolveAddSourceViewportStyle } from "./add-source-modal-lifecycle.js";
import { focusElementWithoutScroll } from "./hierarchy-menu-placement.js";
import { handleDialogKeyDown } from "./modal-focus.js";

const usePrePaintLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
const mediaLabel = type => type === "MOVIE" ? "Movies" : "Series";
const nameKey = draft => nativeTraktPhysicalIdentity(draft);
const validName = value => isValidVisibleNuvioTitle(value) && value === value.trim();
const choices = [{ id: "automatic", label: "Automatic" }, { id: "movies", label: "Movies" }, { id: "series", label: "Series" }, { id: "both", label: "Both" }];

const updatedDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export function TraktResultCard({ list, selected, onSelect, onDescription, onPreview }) {
 const name = defaultTraktListTitle(list);
 return <div className="choice-card trakt-result" data-trakt-result-id={list.id} data-selection-mode="multiple" data-selected={selected}>
  <label className="trakt-result-choice">
   <input type="checkbox" className="visually-hidden" checked={selected} disabled={list.availability === "unavailable"} onChange={event => onSelect(event.target.checked)} aria-label={name} />
   <span className="trakt-result-heading"><strong>{name}</strong>{list.likeCount != null ? <span className="trakt-result-likes" role="img" aria-label={`${list.likeCount} ${list.likeCount === 1 ? "like" : "likes"}`}><span aria-hidden="true">♥</span> {list.likeCount}</span> : null}</span>
   <span className="trakt-result-meta">{list.creator?.username ? <span className="trakt-result-creator">@{list.creator.username}</span> : null}<span className="trakt-result-id">Trakt List {list.id}</span></span>
   {list.itemCount != null || list.updatedAt ? <span className="trakt-result-meta trakt-result-details">{list.itemCount != null ? `${list.itemCount} ${list.itemCount === 1 ? "item" : "items"}` : null}{list.itemCount != null && list.updatedAt ? " · " : null}{list.updatedAt ? <>Last updated <time dateTime={list.updatedAt}>{updatedDate.format(new Date(list.updatedAt))}</time></> : null}</span> : null}
   {list.availability === "unavailable" ? <span className="trakt-result-unavailable">Unavailable</span> : null}
  </label>
  <div className="trakt-result-actions">
  {list.description?.trim() ? <button className="trakt-description-action" type="button" aria-haspopup="dialog" onClick={event => onDescription(list, event.currentTarget)}>Read description</button> : null}
  <button className="source-preview-button trakt-preview-action" type="button" aria-haspopup="dialog" aria-label={`Preview titles: ${name}`} disabled={list.availability === "unavailable"} onClick={event => onPreview(list, event.currentTarget)}>Preview titles</button>
  </div>
 </div>;
}

export function TraktMediaCounts({ itemCount, composition, onCountInfo }) {
 const differs = itemCount != null && composition && itemCount > composition.movieCount + composition.showCount;
 return <>
  {itemCount != null ? <p className="editor-field-help trakt-list-total">{itemCount} {itemCount === 1 ? "item" : "items"} in this Trakt List</p> : null}
  {composition ? <div className="trakt-nuvio-counts"><p>In Nuvio: {composition.movieCount} {composition.movieCount === 1 ? "Movie" : "Movies"} · {composition.showCount} Series</p>{differs ? <button className="trakt-count-info" type="button" aria-label="Why can these numbers be different?" aria-haspopup="dialog" onClick={event => onCountInfo(event.currentTarget)}><span aria-hidden="true">ⓘ</span></button> : null}</div> : null}
 </>;
}

export function TraktCountInfoDialog({ trigger, onClose }) {
 const closeRef = useRef(null);
 return <NestedPreviewDialog ariaLabelledBy="trakt-count-info-title" dialogClassName="franchise-preview-modal trakt-description-modal trakt-count-info-modal" parentTrigger={trigger} initialFocusRef={closeRef} onClose={onClose}>
  <header><h3 id="trakt-count-info-title">Why can the numbers be different?</h3><button ref={closeRef} type="button" onClick={onClose}>Close</button></header>
  <div className="trakt-description-body trakt-count-info-body" role="region" aria-label="About Trakt List counts" tabIndex={0}>
   <p>A Trakt List can contain:</p>
   <ul><li>Movies — whole movies</li><li>Series — whole TV shows</li><li>Seasons — one season from a TV show</li><li>Episodes — one episode from a TV show</li></ul>
   <p>Nuvio builds these collections from the whole Movies and Series in the list.<br />Individual Seasons and Episodes aren't added as separate collection items.</p>
   <p>You can still open a Series in Nuvio and watch its seasons and episodes normally.</p>
  </div>
 </NestedPreviewDialog>;
}

export function TraktDescriptionDialog({ list, trigger, onClose }) {
 const closeRef = useRef(null);
 return <NestedPreviewDialog ariaLabelledBy="trakt-description-title" dialogClassName="franchise-preview-modal trakt-description-modal" parentTrigger={trigger} initialFocusRef={closeRef} onClose={onClose}>
  <header><h3 id="trakt-description-title">{defaultTraktListTitle(list)}</h3><button ref={closeRef} type="button" onClick={onClose}>Close</button></header>
  <div className="trakt-description-body" role="region" aria-label="Full description" tabIndex={0}>{list.description}</div>
 </NestedPreviewDialog>;
}

export function TraktSourceFlow({ scope = "add-source", project, projectRevision = 0, destinationCollectionInternalId = null,
 destinationCollectionTitle = null, folder = null, client, posterProvider, posterUrlForPath, onBack, onCancel, onApply }) {
 const standalone = scope === "add-source";
 const [step, setStep] = useState("select"), [mode, setMode] = useState("keyword"), [query, setQuery] = useState("");
 const [showResultsTop, setShowResultsTop] = useState(false);
 const [description, setDescription] = useState(null);
 const [countInfoTrigger, setCountInfoTrigger] = useState(null);
 const [discovery, setDiscovery] = useState({ lists: [], pagination: null, request: null, busy: false, error: null });
 const [snapshot, setSnapshot] = useState(null), [diagnostic, setDiagnostic] = useState(null), [applying, setApplying] = useState(false);
 const [collectionTitle, setCollectionTitle] = useState(""), [showNameErrors, setShowNameErrors] = useState(false);
 const [presentation, setPresentation] = useState({ hideCollectionTitle: false, viewMode: "TABBED_GRID", showAllTab: true, pinToTop: false, folderTitleVisibility: "HIDE_HOME_SCREEN", folderTileShape: "POSTER" });
 const [viewportStyle, setViewportStyle] = useState(() => typeof window === "undefined" ? null : resolveAddSourceViewportStyle(window));
 const [clock, setClock] = useState(Date.now), [verifying, setVerifying] = useState(null);
 const sessionRef = useRef(null), discoveryRef = useRef(null), mountedRef = useRef(true), reviewRef = useRef(null);
 const dialogRef = useRef(null), headingRef = useRef(null), scrollRef = useRef(null), formRef = useRef(null);
 if (!sessionRef.current) sessionRef.current = createTraktSelectionSession({ client, onChange: state => { if (mountedRef.current) setSnapshot(state); } });
 if (!discoveryRef.current) discoveryRef.current = createAsyncRequestCoordinator();
 const session = sessionRef.current, state = snapshot ?? session.getState();
 const titlePreview = useTraktTitlePreview({ client, posterProvider, onUnavailable: list => session.select({ ...list, availability: "unavailable" }) });
 const rows = state.selection.order.map(id => state.selection.byId[id]);
 const cooldownUntil = Math.max(state.notBefore, discovery.error?.notBefore ?? 0, client.getNotBefore?.() ?? 0);
 const cooling = cooldownUntil > clock;
 const busy = state.checking || state.resolving || discovery.busy || verifying !== null;
 const generated = useMemo(() => rows.flatMap(row => effectiveTraktMedia(row.media).map(mediaType =>
  buildNativeTraktSourceDraft({ title: defaultTraktSourceTitle(row.list, mediaType, scope), traktListId: row.id, mediaType }).draft)), [state.selection, scope]);
 const naming = useSourceNames(generated, nameKey);
 const options = { scope, projectRevision, lists: rows.map(row => ({ id: row.id, list: row.list, media: row.media,
  folderTitle: row.folderTitle ?? defaultTraktListTitle(row.list),
  sourceTitles: Object.fromEntries(naming.drafts.filter(draft => draft.editable.traktListId === row.id).map(draft => [draft.editable.mediaType, draft.editable.title])) })),
  ...(scope === "new-collection" ? { collectionTitle, ...presentation } : scope === "new-folder" ? { destinationCollectionInternalId, folderTitleVisibility: presentation.folderTitleVisibility, folderTileShape: presentation.folderTileShape } : { destinationFolderInternalId: folder?.internalId ?? null }) };
 const planned = createTraktCreationPlan(project, options), review = planned.plan ?? planned.review;
 const ready = review?.outcomes.flatMap(outcome => outcome.ready) ?? [], readyKeys = new Set(ready.map(item => item.identity));
 const activeNameRows = naming.rows.filter(row => readyKeys.has(row.key));
 const activeNaming = { ...naming, rows: activeNameRows, invalid: activeNameRows.some(row => row.error), customisedCount: activeNameRows.filter(row => row.customised).length, resetAll: () => activeNameRows.forEach(row => naming.reset(row.key)) };
 const empty = ["names", "review", "appearance"].includes(step) && review?.counts.sourceCount === 0;
 const activeStep = empty ? "empty" : step;
 const allResolved = rows.length > 0 && rows.every(row => effectiveTraktMedia(row.media).length > 0);
 const pending = rows.filter(row => ["not-checked", "failed"].includes(row.media.status) && !effectiveTraktMedia(row.media).length).length;
 const checked = rows.filter(row => ["known", "failed", "unavailable"].includes(row.media.status)).length;

 useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; discoveryRef.current.cancel({ notify: false }); session.cancel(); }; }, [session]);
 useEffect(() => { if (!cooling) return undefined; const timer = setTimeout(() => setClock(Date.now()), Math.max(1, cooldownUntil - Date.now())); return () => clearTimeout(timer); }, [cooldownUntil, cooling]);
 usePrePaintLayoutEffect(() => {
  if (!standalone) return undefined;
  const unlock = lockAddSourceDocumentBody(), stop = observeAddSourceViewport(setViewportStyle);
  return () => { stop(); unlock(); };
 }, [standalone]);
 usePrePaintLayoutEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 0; setShowResultsTop(false); focusElementWithoutScroll(headingRef.current); }, [activeStep]);

 function cancelWork() { discoveryRef.current.cancel({ notify: false }); setDiscovery(value => ({ ...value, busy: false })); session.cancel(); setVerifying(null); }
 function back() {
  cancelWork(); setDiagnostic(null);
  if (step === "select") onBack();
  else setStep(step === "appearance" ? "names" : ["names", "review"].includes(step) ? "media" : "select");
 }
 function remove(id) { session.remove(id); for (const mediaType of ["MOVIE", "TV"]) naming.reset(`trakt|${id}|${mediaType}`); }
 function clearSelected() { session.clearSelection(); naming.resetAll({ includeUnselected: true }); setCollectionTitle(""); setStep("select"); setDiagnostic(null); }
 function changeMode(next) { discoveryRef.current.cancel({ notify: false }); setDiscovery(value => ({ ...value, busy: false, error: null })); setMode(next); }
 async function discover(kind, page = 1, search = query) {
  if (cooldownUntil > Date.now()) return;
  const request = { kind, query: search, page };
  setDiscovery(value => ({ ...value, busy: true, error: null, ...(page === 1 ? { lists: [], pagination: null, request } : {}) }));
  const outcome = await discoveryRef.current.run(({ signal }) => kind === "keyword" ? client.searchKeyword(search, { page, limit: 30, signal })
   : kind === "user" ? client.searchUser(search, { page, limit: 30, signal }) : client.browse(kind, { page, limit: 30, signal }), `${kind}:${page}:${search}`);
  if (!mountedRef.current || !outcome.accepted) return;
  const result = outcome.result;
  setClock(Date.now());
  setDiscovery(value => result?.ok ? { lists: [...(page === 1 ? [] : value.lists), ...result.data.lists].filter((list, index, all) => all.findIndex(item => item.id === list.id) === index), pagination: result.data.pagination, request, busy: false, error: null }
   : { ...value, busy: false, error: result?.error ?? { message: "Lists could not be loaded. Try again." }, request });
 }
 async function verify(id) { setVerifying(id); await session.verifyPublic(id); if (mountedRef.current) { setVerifying(null); setClock(Date.now()); } }
 function enterMedia() { cancelWork(); setStep("media"); setDiagnostic(null); if (cooldownUntil <= Date.now()) void session.checkMediaBatch(); }
 async function submit(event) {
  event.preventDefault(); if (busy || applying) return;
  if (step === "select") { if (rows.length) enterMedia(); return; }
  if (step === "media") { if (!allResolved) return; reviewRef.current = { revision: projectRevision, projectId: project.internalId }; setStep(standalone ? "review" : "names"); return; }
  setShowNameErrors(true);
  if (!planned.ok || activeNaming.invalid) {
   setDiagnostic(planned.errors?.[0]?.message ?? "Check the source names.");
   if (!standalone) setStep("names");
   requestAnimationFrame(() => focusRequiredName(formRef.current?.querySelector('[aria-invalid="true"]'))); return;
  }
  if (step === "names") { naming.commit(); setDiagnostic(null); setStep("appearance"); return; }
  // The reviewed project and the current options must both survive the final gate.
  if (reviewRef.current?.revision !== projectRevision || reviewRef.current?.projectId !== project.internalId) {
   reviewRef.current = { revision: projectRevision, projectId: project.internalId };
   setStep(standalone ? "review" : "names"); setDiagnostic("The project changed. Review the current output before continuing."); return;
  }
  setApplying(true);
  let result;
  try { result = await onApply(planned.plan, options); } catch { result = { ok: false, errors: [{ message: "The lists could not be added. Review and try again." }] }; }
  if (result?.ok || !mountedRef.current) return;
  setApplying(false); setDiagnostic(result?.errors?.[0]?.message ?? "Review the current output.");
  setStep(standalone ? "review" : "names"); reviewRef.current = { revision: projectRevision, projectId: project.internalId };
 }
 const descriptions = { select: "Choose public Trakt lists. Selection order becomes output order.", media: "Check the selected lists, then choose Movies, Series or Both.", names: scope === "new-collection" ? "These are the Collection and Folder names shown in Nuvio. You can customise them before creating." : "These are the Folder names shown in Nuvio. You can customise them before creating.", review: "Review the sources that will be added to this folder.", appearance: "Choose the shared appearance of the new folders.", empty: "All requested sources already exist in this destination." };
 const reviewRows = review?.outcomes.map(outcome => ({ ...outcome, row: state.selection.byId[outcome.id] })) ?? [];
 const omittedLists = standalone ? [] : reviewRows.filter(outcome => outcome.ready.length === 0);
 const output = <>
  {review?.counts.omittedCount ? <p className="editor-field-help">{review.counts.omittedCount} source{review.counts.omittedCount === 1 ? "" : "s"} already in this {standalone ? "folder" : "collection"} · omitted.</p> : null}
  <div className="tmdb-list-review-items">{reviewRows.filter(outcome => standalone || outcome.ready.length > 0).map(({ row, ready: physical, omitted }) => <article key={row.id} className="tmdb-list-review-item" data-trakt-review-id={row.id}>
   <div className="trakt-list-identity"><strong>{defaultTraktListTitle(row.list)}</strong><small>Trakt List {row.id}{!standalone && physical.some(item => item.elsewhere.length) ? " · Exists elsewhere" : ""}</small></div>
   <div className="trakt-output-statuses">{standalone ? [...physical, ...omitted].map(item => <span key={item.identity}>{mediaLabel(item.mediaType)} · {item.status === "omitted" ? "Already here · omitted" : "Ready"}{item.elsewhere.length ? " · Exists elsewhere" : ""}</span>) : <>
    <span>Ready: {physical.map(item => mediaLabel(item.mediaType)).join(" + ")}</span>
    {omitted.map(item => <span key={item.identity}>{mediaLabel(item.mediaType)} already in this Collection · omitted</span>)}
   </>}</div>
   {!standalone && step === "names" && physical.length > 0 ? <div className="editor-field"><label htmlFor={`trakt-folder-${row.id}`}>Folder name for “{defaultTraktListTitle(row.list)}”</label>
    <RequiredNameInput id={`trakt-folder-${row.id}`} value={row.folderTitle ?? defaultTraktListTitle(row.list)} hidden={presentation.folderTitleVisibility === "HIDE_EVERYWHERE"} error={showNameErrors && !validName(row.folderTitle ?? defaultTraktListTitle(row.list)) ? "Enter a folder name without spaces at either end." : null} onChange={event => session.setNames(row.id, { folderTitle: event.target.value })} />
    <HiddenTitleFieldHelp id={`trakt-folder-${row.id}-hidden`} hidden={presentation.folderTitleVisibility === "HIDE_EVERYWHERE"} kind="folder" />
   </div> : null}
   {[...physical, ...omitted].filter(item => item.elsewhere.length || (item.status === "ready" && item.destination.some(match => ["known-variant", "unknown-comparison"].includes(match.comparison)))).map(item => <div key={item.identity} className="trakt-placement">
    {item.status === "ready" && item.destination.some(match => match.comparison === "known-variant") ? <p className="editor-field-help">A source for this list and media uses different sorting here. This new source can still be added.</p> : null}
    {item.status === "ready" && item.destination.some(match => match.comparison === "unknown-comparison") ? <p className="editor-field-help">Imported settings could not be compared. This source can still be added.</p> : null}
    {item.elsewhere.length ? <details><summary>{mediaLabel(item.mediaType)} · Where else?</summary><SourceElsewhereNotice occurrences={item.elsewhere} heading="Also in these locations" action={standalone ? "It can still be added here." : "It can still be created here."} /></details> : null}
   </div>)}
  </article>)}</div>
 </>;
 const inner = <>
  <CreationHeader title={standalone ? "Add Trakt List sources" : "Create with Trakt Lists"} context={standalone ? sourceDestinationContext(project, folder) : creationContext(scope, destinationCollectionTitle)} description={descriptions[activeStep]} onBack={back} backAction="back-trakt" backDisabled={applying} onClose={() => { cancelWork(); onCancel(); }} />
  <form ref={formRef} className="add-source-form trakt-list-form" data-trakt-stage={activeStep} onSubmit={submit} noValidate>
   <div ref={scrollRef} className="add-source-scroll" onScroll={event => setShowResultsTop(event.currentTarget.scrollTop >= event.currentTarget.clientHeight)}>
    <CreationStageIntro step={activeStep === "select" ? 1 : activeStep === "media" ? 2 : activeStep === "appearance" ? 4 : 3} phase={activeStep === "empty" ? "Review" : activeStep[0].toUpperCase() + activeStep.slice(1)} title={activeStep === "empty" ? "Nothing to add" : activeStep === "select" ? "Trakt lists" : activeStep[0].toUpperCase() + activeStep.slice(1)} headingRef={headingRef} tabIndex={-1} />
    {cooling ? <p className="people-zero-warning" role="status">Trakt requests are paused. Try again after {new Date(cooldownUntil).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.</p> : null}
    {activeStep === "select" ? <>
     <div className="trakt-modes" role="group" aria-label="Search by">{[["keyword", "Keyword"], ["user", "User"], ["url", "URL / ID"]].map(([id, label]) => <button className="editor-cancel trakt-mode-choice" data-selection-mode="single" key={id} type="button" aria-pressed={mode === id} onClick={() => changeMode(id)}>{label}</button>)}</div>
     {mode === "url" ? <div className="editor-field"><label htmlFor="trakt-input">List URLs or IDs</label><textarea id="trakt-input" rows={4} value={state.input} autoComplete="off" spellCheck="false" onChange={event => session.setInput(event.target.value)} aria-describedby="trakt-url-help" />
      <p id="trakt-url-help" className="editor-field-help">One per line. Use a numeric ID or a public trakt.tv or app.trakt.tv/users/username/lists/list-name URL.</p>
      <div className="trakt-inline-actions"><button type="button" className="editor-apply" disabled={busy || cooling || !state.input.trim()} onClick={() => session.resolveInput()}>Resolve lists</button><button className="editor-cancel" type="button" disabled={state.resolving || (!state.input && !state.lines.length)} onClick={() => session.clearInput()}>Clear input</button></div>
      {state.lines.length ? <ul className="trakt-line-results" aria-label="List resolution results">{state.lines.map((line, index) => <li key={index}>Line {line.line ?? "—"} · <span>{line.value}</span> · {line.status === "resolved" ? `Selected Trakt List ${line.id}` : line.status === "duplicate" ? "Already selected or submitted" : line.error?.message ?? "Waiting to resolve"}</li>)}</ul> : null}
      {state.lines.some(line => line.status === "pending" || line.error?.retryable) ? <button className="editor-cancel" type="button" disabled={busy || cooling} onClick={() => session.resumeResolve()}>Resume resolving</button> : null}
     </div> : <div className="editor-field"><label htmlFor="trakt-query">{mode === "user" ? "Public Trakt username" : "Keyword"}</label><div className="trakt-search"><input type="text" id="trakt-query" value={query} autoComplete="off" spellCheck="false" onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); if (!busy && query.trim()) void discover(mode); } }} /><button type="button" className="editor-apply" disabled={busy || cooling || !query.trim()} onClick={() => discover(mode)}>Search</button></div></div>}
     <div className="trakt-inline-actions" role="group" aria-label="Browse public lists">{["popular", "trending"].map(kind => <button className="editor-cancel trakt-browse-action" key={kind} type="button" disabled={busy || cooling} onClick={() => discover(kind)}>{kind === "popular" ? "Popular Lists" : "Trending Lists"}</button>)}</div>
     {rows.length ? <section className="trakt-selected"><div className="add-source-section-heading"><strong>Selected · {rows.length}</strong><button className="editor-cancel" type="button" onClick={clearSelected}>Clear selected lists</button></div><RemovableSelectionSummary items={rows.map(row => ({ id: row.id, label: defaultTraktListTitle(row.list), detail: `Trakt List ${row.id}` }))} onRemove={remove} ariaLabel="Selected Trakt lists" disclosureLabel="View selected" alwaysDisclose /></section> : null}
     {discovery.busy || state.resolving ? <p className="editor-field-status" role="status">{state.resolving ? "Resolving lists…" : "Loading lists…"}</p> : null}
     {discovery.error ? <div className="editor-diagnostics" role="alert"><p>{discovery.error.message}</p>{discovery.error.retryable !== false ? <button className="editor-cancel" type="button" disabled={busy || cooling} onClick={() => discover(discovery.request.kind, discovery.request.page, discovery.request.query)}>Retry</button> : null}</div> : null}
     <div className="trakt-results">{discovery.lists.map(list => <TraktResultCard key={list.id} list={list} selected={Boolean(state.selection.byId[list.id])} onSelect={checked => checked ? session.select(list) : remove(list.id)} onDescription={(list, trigger) => setDescription({ list, trigger })} onPreview={titlePreview.open} />)}</div>
     {!discovery.busy && discovery.request && !discovery.error && discovery.lists.length === 0 ? <p>No lists found.</p> : null}
     <div className="trakt-results-tail">{discovery.pagination && (discovery.pagination.pageCount !== null ? discovery.pagination.page < discovery.pagination.pageCount : discovery.lists.length >= discovery.pagination.page * 30) ? <button className="editor-cancel" type="button" disabled={busy || cooling} onClick={() => discover(discovery.request.kind, discovery.pagination.page + 1, discovery.request.query)}>Load more</button> : null}
      {discovery.lists.length > 0 && showResultsTop ? <button className="editor-cancel" type="button" onClick={() => { focusElementWithoutScroll(headingRef.current); scrollRef.current?.scrollTo({ top: 0, behavior: builderCardScrollBehavior() }); }}><span aria-hidden="true">↑</span> Back to top</button> : null}
     </div>
    </> : activeStep === "media" ? <>
     <p role="status" className="editor-field-status">{state.checking ? `Checking selected lists… ${checked} of ${rows.length} checked` : `Checked ${checked} of ${rows.length} selected lists`}</p>
     <p className="editor-field-help trakt-initial-sort-note">New Trakt sources use List order · Ascending. You can change the sorting later by editing the Source.</p>
     {pending > 0 && !state.checking ? <button className="editor-cancel" type="button" disabled={busy || cooling} onClick={() => session.checkMediaBatch()}>{rows.length > 25 ? `Check remaining ${pending}` : "Retry media checks"}</button> : null}
     <div className="tmdb-list-review-items">{rows.map(row => <article key={row.id} className="tmdb-list-review-item" data-trakt-media-id={row.id}>
      <header className="trakt-media-heading"><div className="trakt-list-identity"><strong>{defaultTraktListTitle(row.list)}</strong><small>Trakt List {row.id} · {row.media.status === "known" ? "Checked" : row.media.status === "checking" ? "Checking…" : row.media.status === "unavailable" ? "Unavailable" : row.media.status === "failed" ? "Check failed" : "Not checked"}</small></div><span className="studio-selected-actions"><button className="studio-selected-remove" type="button" title="Remove" aria-label={`Remove ${defaultTraktListTitle(row.list)}`} onClick={() => remove(row.id)}>×</button></span></header>
      <div className="trakt-media-config">
       <div className="trakt-media-info">
        <TraktMediaCounts itemCount={row.list.itemCount} composition={row.media.status === "known" ? row.media.composition : null} onCountInfo={setCountInfoTrigger} />
        <p className="editor-field-help">{effectiveTraktMedia(row.media).length ? `Will create: ${effectiveTraktMedia(row.media).map(mediaLabel).join(" + ")}` : "Choose media after checking this public list."}</p>
       </div>
       <SemanticSortChoices options={choices} selectedId={row.media.override} name={`trakt-media-${row.id}`} legend={<span className="visually-hidden">Media for {defaultTraktListTitle(row.list)}</span>} disabledIds={choices.filter(({ id }) => row.media.status === "checking" || (id !== "automatic" && (!row.media.publicRead || row.media.status === "unavailable"))).map(({ id }) => id)} onChange={id => session.chooseMedia(row.id, id)} />
       <button className="source-preview-button trakt-media-preview" type="button" aria-haspopup="dialog" aria-label={`Preview titles: ${defaultTraktListTitle(row.list)}`} disabled={row.media.status === "unavailable"} onClick={event => titlePreview.open(row.list, event.currentTarget)}>Preview titles</button>
      </div>
      {row.media.error ? <p className="editor-field-help">{row.media.error.message}</p> : null}
      {!row.media.publicRead && row.media.status !== "checking" ? <button className="editor-cancel" type="button" disabled={busy || cooling} onClick={() => verify(row.id)}>{verifying === row.id ? "Verifying…" : "Verify list"}</button> : null}
      {row.media.composition?.composition === "zero" ? <p className="people-zero-warning">Automatic cannot choose media. Choose deliberately: this source may currently be empty or contain only season/episode entries.</p> : row.media.publicRead && row.media.status === "failed" ? <p className="people-zero-warning">This public list was verified, but its media could not be detected. Retry or choose Movies, Series or Both.</p> : null}
     </article>)}</div>
    </> : activeStep === "appearance" ? <><HierarchyOutputSummary counts={review?.counts} scope={scope} className="trakt-plan-totals" /><GuidedPresentationControls scope={scope} options={presentation} folderCount={review?.counts.folderCount} destinationCollectionTitle={destinationCollectionTitle} onChange={patch => setPresentation(value => ({ ...value, ...patch }))} /></> : <>
     {activeStep === "empty" ? <p>No folders or sources will be created. Go Back to change your selection.</p> : null}
     <HierarchyOutputSummary counts={review?.counts} scope={scope} className="trakt-plan-totals" />
     {scope === "new-collection" && activeStep === "names" ? <div className="editor-field"><label htmlFor="trakt-collection-title">Collection name</label><RequiredNameInput id="trakt-collection-title" value={collectionTitle} hidden={presentation.hideCollectionTitle} error={showNameErrors && !validName(collectionTitle) ? "Enter a collection name without spaces at either end." : null} onChange={event => setCollectionTitle(event.target.value)} /><HiddenTitleFieldHelp id="trakt-collection-hidden" hidden={presentation.hideCollectionTitle} kind="collection" /></div> : null}
     {output}{!empty ? <SourceNamesDisclosure naming={activeNaming} disabled={applying} context={row => `${defaultTraktListTitle(state.selection.byId[row.draft.editable.traktListId].list)} · ${mediaLabel(row.draft.editable.mediaType)}`} /> : null}
     {omittedLists.length ? <details className="tmdb-list-omitted"><summary>Already in this collection · {omittedLists.length} omitted List{omittedLists.length === 1 ? "" : "s"}</summary><ul>{omittedLists.map(({ row, omitted }) => <li key={row.id}><strong>{defaultTraktListTitle(row.list)}</strong><p>Trakt List {row.id} · {omitted.map(item => mediaLabel(item.mediaType)).join(" + ")} already in this Collection · omitted</p></li>)}</ul></details> : null}
    </>}
    {diagnostic ? <div className="editor-diagnostics" role="alert"><p>{diagnostic}</p></div> : null}
   </div>
   <footer className="add-source-actions">{empty ? <button key="empty-back" type="button" className="editor-cancel" onClick={() => { cancelWork(); setStep("select"); }}>Back to selection</button> : <button key="forward" type="submit" className="editor-apply" disabled={busy || applying || (step === "select" ? !rows.length : step === "media" ? !allResolved : activeNaming.invalid)}>{step === "select" ? "Continue to Media" : step === "media" ? `Continue to ${standalone ? "Review" : "Names"}` : step === "names" ? "Continue to Appearance" : applying ? "Applying…" : standalone ? `Add ${review?.counts.sourceCount ?? 0} source${review?.counts.sourceCount === 1 ? "" : "s"}` : guidedCreateActionLabel(scope, review?.counts)}</button>}</footer>
  </form>
  {titlePreview.preview ? <SourceTitlePreviewDialog {...titlePreview.dialogProps} posterUrlForPath={posterUrlForPath} /> : null}
  {description ? <TraktDescriptionDialog {...description} onClose={() => setDescription(null)} /> : null}
  {countInfoTrigger ? <TraktCountInfoDialog trigger={countInfoTrigger} onClose={() => setCountInfoTrigger(null)} /> : null}
 </>;
 if (!standalone) return inner;
 const content = <div className="add-source-portal" data-trakt-portal="true" data-mobile-surface="opaque"><div className="settings-modal-backdrop add-source-backdrop" style={viewportStyle ?? undefined}><section ref={dialogRef} className="add-source-dialog" role="dialog" aria-modal="true" aria-labelledby="creation-title" aria-describedby="creation-description" tabIndex={-1} onKeyDown={event => handleDialogKeyDown(event, dialogRef.current, () => { cancelWork(); onCancel(); })}>{inner}</section></div></div>;
 return typeof document === "undefined" ? content : createPortal(content, document.body);
}
