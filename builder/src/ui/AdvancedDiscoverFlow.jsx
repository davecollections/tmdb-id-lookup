import { DiscoverHelpDialog } from "./DiscoverHelpDialog.jsx";
import { discoverEditorPreviewBlocked } from "../source-edit/advanced-discover-editor.js";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DISCOVER_SORT_OPTIONS } from "../nuvio/discover.js";
import { isValidVisibleNuvioTitle, reversibleTitleFieldProps } from "../nuvio/titles.js";
import { advancedDiscoverArtworkSuggestions, changeAdvancedDiscoverArtworkShape } from "../source-add/advanced-discover-artwork.js";
import { changeDiscoverContext, compileAdvancedDiscover, createAdvancedDiscoverDraft, deriveAdvancedDiscoverFilters, DISCOVER_MEDIA_OPTIONS, discoverExpressionIds, discoverMediaTypes, suggestDiscoverName } from "../source-add/advanced-discover.js";
import { advancedDiscoverFolders, createAdvancedDiscoverPlan, discoverDuplicateOverrideIdentity, inspectDiscoverDuplicates } from "../source-add/advanced-discover-plan.js";
import { loadDiscoverNamedCodes } from "../source-add/discover-codes.js";
import { discoverFilterRows, mergeDiscoverSelectionLabels, resolveDiscoverEntityLabels } from "../source-add/discover-selection-labels.js";
import { keywordCatalogueClient } from "../source-add/keyword-catalogue-client.js";
import { sharedAdvancedDiscoverPreviewProvider } from "../source-add/tmdb-advanced-discover-preview-provider.js";
import { lockAddSourceDocumentBody, observeAddSourceViewport, resolveAddSourceViewportStyle } from "./add-source-modal-lifecycle.js";
import { focusElementWithoutScroll } from "./hierarchy-menu-placement.js";
import { handleDialogKeyDown } from "./modal-focus.js";
import { SemanticSortChoices } from "./SemanticSortChoices.jsx";
import { useSourceTitlePreview } from "./use-source-title-preview.js";
import { SourceTitlePreviewDialog } from "./SourceTitlePreviewDialog.jsx";
import { DiscoverDetailedControls, DiscoverGenreControls, DiscoverKeywordControls, DiscoverNotice } from "./AdvancedDiscoverControls.jsx";
import { HierarchyCollectionPresentationControls } from "./CollectionPresentationChoices.jsx";
import { FolderShapeChoices, HiddenTitleFieldHelp, PresentationSwitch, TitleOptions } from "./PresentationControls.jsx";
import { CreationHeader } from "./CreationHeader.jsx";
import { FolderArtworkFields } from "./FolderArtworkFields.jsx";
import { SourceElsewhereNotice } from "./SourceElsewhereNotice.jsx";
import "./advanced-discover.css";

const layoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
const pageLabels = { filters: "Filters", appearance: "Appearance", artwork: "Artwork", review: "Review" };
const folderVisibilityLabels = { SHOW_EVERYWHERE: "Shown everywhere", HIDE_HOME_SCREEN: "Hidden on home screen only", HIDE_EVERYWHERE: "Hidden everywhere" };
function previewDrafts(draft) {
 const medias = draft.mediaMode === "series" ? ["series", "movies"] : ["movies", "series"];
 const all = draft.mediaMode === "both" ? compileAdvancedDiscover(draft, { preview: true }).drafts : medias.flatMap((mediaMode) => compileAdvancedDiscover({ ...draft, mediaMode }, { preview: true }).drafts);
 const primarySort = draft.sortOptionIds?.[0] ?? "popular";
 return all.sort((a, b) => Number(b.editable.mediaType === (draft.mediaMode === "series" ? "TV" : "MOVIE") && b.editable.sortBy === DISCOVER_SORT_OPTIONS.find((s) => s.id === primarySort)?.values[b.editable.mediaType]) - Number(a.editable.mediaType === (draft.mediaMode === "series" ? "TV" : "MOVIE") && a.editable.sortBy === DISCOVER_SORT_OPTIONS.find((s) => s.id === primarySort)?.values[a.editable.mediaType]));
}
function DiscoverFilterReview({ draft }) {
 const groups = draft.mediaMode === "both" ? discoverMediaTypes(draft.mediaMode).map((mediaType) => {
  const effective = deriveAdvancedDiscoverFilters(draft, mediaType);
  return { mediaType, rows: discoverFilterRows({ ...draft, filters: effective.filters }), information: effective.information.filter((entry) => entry.kind === "unrestricted" || entry.field === "withNetworks") };
 }) : [{ rows: discoverFilterRows(draft), information: [] }];
 return groups.map(({ mediaType, rows, information }) => <div key={mediaType ?? "single"} className="discover-review-media" data-review-media={mediaType}>
  {mediaType ? <h5>{mediaType === "TV" ? "Series" : "Movies"}</h5> : null}
  {rows.length ? <dl className="discover-filter-rows">{rows.map(({ label, value }) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl> : <p className="editor-field-help">All titles</p>}
  {information.map(({ message }) => <p className="editor-field-help" key={message}>{message}</p>)}
 </div>);
}
function ArtworkSummary({ artwork }) {
 const fields = [["coverImageUrl", "Tile"], ["heroBackdropUrl", "Backdrop"], ["titleLogoUrl", "Title logo"], ["focusGifUrl", artwork.focusGifEnabled ? "Focus GIF (shown)" : "Focus GIF (hidden)"]];
 const chosen = fields.filter(([field]) => artwork[field]?.trim());
 return <div className="discover-review-artwork">
  <p className="editor-field-help">{artwork.tileShape === "LANDSCAPE" ? "Landscape" : "Poster"} · Focus GIF: {artwork.focusGifEnabled ? "On" : "Off"}{artwork.focusGifEnabled && !artwork.focusGifUrl?.trim() ? " (no URL)" : ""}</p>
  {chosen.map(([field, label]) => <figure key={field}><img src={artwork[field]} alt={label + " artwork"} referrerPolicy="no-referrer" loading="lazy" /><figcaption>{label}</figcaption></figure>)}
 </div>;
}
export default function AdvancedDiscoverFlow({ scope = "add-source", project, projectRevision, collectionInternalId = null, folderInternalId = null, studioProvider, networkProvider, streamingProvider, onBack, onCancel, onApply, initialDraft = null, onSave = null, bodyLockManaged = false }) {
 const editing = Boolean(onSave), hierarchy = !editing && scope !== "add-source";
 const pages = hierarchy ? ["filters", "appearance", "artwork", "review"] : ["filters", "review"];
 const opening = useRef({ project, projectRevision });
 const [stateDraft, setDraft] = useState(() => initialDraft ?? createAdvancedDiscoverDraft());
 const draft = { ...stateDraft, name: suggestDiscoverName(stateDraft), previewBlocked: discoverEditorPreviewBlocked(stateDraft) };
 const [page, setPage] = useState("filters"), [busy, setBusy] = useState(false), [errors, setErrors] = useState([]);
 const [catalogue, setCatalogue] = useState({ status: "loading" }), [namedCodes, setNamedCodes] = useState(null), [nameWarning, setNameWarning] = useState(null);
 const [collectionTitle, setCollectionTitle] = useState("Discover"), [folderArrangement, setFolderArrangement] = useState("one-folder"), [folderSettings, setFolderSettings] = useState(() => ({ combined: { title: "Discover" }, movies: { title: "Movies" }, series: { title: "Series" } })), [artworkKey, setArtworkKey] = useState("combined");
 const [appearance, setAppearance] = useState({ folderTitleVisibility: "HIDE_HOME_SCREEN", viewMode: "TABBED_GRID", showAllTab: true, pinToTop: false, hideCollectionTitle: false });
 const [duplicateConsent, setDuplicateConsent] = useState(null);
 const [secondarySurface, setSecondarySurface] = useState(null);
 const secondaryReturn = useRef(null), secondaryScroll = useRef(0);
 const [viewport, setViewport] = useState(() => typeof window === "undefined" ? null : resolveAddSourceViewportStyle(window));
 const dialogRef = useRef(null), headingRef = useRef(null), scrollRef = useRef(null), savedScroll = useRef({}), gate = useRef(false), mounted = useRef(true);
 const client = useMemo(() => keywordCatalogueClient(), []);
 const previewProvider = useMemo(() => sharedAdvancedDiscoverPreviewProvider(), []);
 const preview = useSourceTitlePreview("advanced-discover", { "advanced-discover": previewProvider });
 const secondaryActive = Boolean(secondarySurface || preview.preview);
 const built = compileAdvancedDiscover(draft);
 const filterErrors = discoverMediaTypes(draft.mediaMode).flatMap((media) => deriveAdvancedDiscoverFilters(draft, media).errors);
 if (draft.providerContextReview) filterErrors.push({ path: "$discover.withWatchProviders", message: "Review retained providers for the new media or region." });
 const editValid = !filterErrors.length && (!draft.titleTouched || Boolean(draft.title?.trim()));
 const candidates = !draft.previewBlocked && (!editing || draft.sortOptionIds.length) && !filterErrors.length ? previewDrafts(draft) : [];
 const duplicates = inspectDiscoverDuplicates(project, folderInternalId, built.drafts);
 const overrideIdentity = discoverDuplicateOverrideIdentity(folderInternalId, built.drafts);
 const override = !editing && scope === "add-source" && duplicateConsent === overrideIdentity;
 const sourceCount = editing ? 1 : scope === "add-source" && !override ? duplicates.missingDrafts.length : built.drafts.length;
 const options = { scope, projectRevision: opening.current.projectRevision, collectionInternalId, folderInternalId, draft, collectionTitle: collectionTitle.trim(), folderArrangement, folderSettings: Object.fromEntries(Object.entries(folderSettings).map(([key, value]) => [key, { ...value, ...(value.title !== undefined ? { title: value.title.trim() } : {}) }])), appearance, ...(override ? { duplicateOverrideIdentity: overrideIdentity } : {}) };
 const folders = hierarchy ? advancedDiscoverFolders(options, built.drafts) : [];
 const planResult = !editing ? createAdvancedDiscoverPlan(opening.current.project, options) : null;
 const activeArtworkFolder = folders.find((folder) => folder.key === artworkKey) ?? folders[0];
 const artworkSuggestions = useMemo(() => advancedDiscoverArtworkSuggestions({ ...draft, mediaMode: activeArtworkFolder?.mediaType === "TV" ? "series" : draft.mediaMode }), [draft.filters.withGenres, draft.filters.withKeywords, draft.mediaMode, activeArtworkFolder?.mediaType]);
 const namesValid = (!hierarchy || folders.every((folder) => isValidVisibleNuvioTitle(folder.title))) && (scope !== "new-collection" || isValidVisibleNuvioTitle(options.collectionTitle));
 const destinationCollection = project.collections.find((c) => c.internalId === collectionInternalId);
 const destinationFolder = destinationCollection?.folders.find((f) => f.internalId === folderInternalId);
 layoutEffect(() => {
  const unlock = bodyLockManaged ? () => {} : lockAddSourceDocumentBody(), stop = observeAddSourceViewport(setViewport);
  focusElementWithoutScroll(headingRef.current);
  return () => { stop(); unlock(); };
 }, []);
 useEffect(() => {
  mounted.current = true; loadCatalogue();
  if (initialDraft) resolveDiscoverEntityLabels(initialDraft, { studioProvider, networkProvider, streamingProvider }).then(({ labels, warnings }) => { if (mounted.current) { setDraft((current) => mergeDiscoverSelectionLabels(current, labels)); setNameWarning(warnings[0] ?? null); } });
  loadDiscoverNamedCodes().then((value) => { if (mounted.current && value?.schemaVersion === 1 && Array.isArray(value.languages) && Array.isArray(value.countries)) setNamedCodes(value); }).catch(() => { if (mounted.current) setNameWarning("The full language and country list is unavailable. Common choices and saved values remain available."); });
  return () => { mounted.current = false; };
 }, []);
 useEffect(() => {
  if (scrollRef.current) scrollRef.current.scrollTop = savedScroll.current[page] ?? 0;
  focusElementWithoutScroll(headingRef.current);
 }, [page]);

 layoutEffect(() => {
  if (secondarySurface || !secondaryReturn.current) return;
  scrollRef.current.scrollTop = secondaryScroll.current;
  focusElementWithoutScroll(secondaryReturn.current.getClientRects().length ? secondaryReturn.current : headingRef.current);
  secondaryReturn.current = null;
 }, [secondarySurface]);
 function openSecondary(surface, trigger) {
  if (secondaryActive) return;
  secondaryReturn.current = trigger; secondaryScroll.current = scrollRef.current?.scrollTop ?? 0; setSecondarySurface(surface);
 }
 const panelProps = { activePanel: secondarySurface, onOpenPanel: openSecondary, onClosePanel: () => setSecondarySurface(null) };
 function go(next) { savedScroll.current[page] = scrollRef.current?.scrollTop ?? 0; setErrors([]); setPage(next); }
 function back() { const index = pages.indexOf(page); index ? go(pages[index - 1]) : (onBack ?? onCancel)(); }
 async function loadCatalogue(force = false) {
  setCatalogue({ status: "loading" });
  try {
   const data = await client.load(force);
   if (!mounted.current) return;
   setCatalogue({ status: "ready", ...data });
   const fields = ["withKeywords", "withoutKeywords"];
   const ids = fields.flatMap((f) => discoverExpressionIds(initialDraft?.filters?.[f]));
   if (ids.length) {
    const rows = await client.resolve(ids);
    if (mounted.current) setDraft((current) => {
     const labels = { ...current.labels };
     for (const field of fields) for (const row of rows) if (discoverExpressionIds(current.filters[field]).includes(row.id) && !labels[field + ":" + row.id]) labels[field + ":" + row.id] = row.name ?? "Unavailable saved keyword " + row.id;
     return { ...current, labels };
    });
   }
  } catch (error) { if (mounted.current) setCatalogue({ status: "error", error: error.message }); }
 }
 function change(next) {
  if (editing) {
   if (next.mediaMode !== draft.mediaMode) return;
   const changed = [...new Set([...Object.keys(draft.filters), ...Object.keys(next.filters)])].filter((key) => JSON.stringify(draft.filters[key]) !== JSON.stringify(next.filters[key]));
   next = { ...next, touchedFilters: [...new Set([...draft.touchedFilters, ...changed])], sortTouched: draft.sortTouched || JSON.stringify(next.sortOptionIds) !== JSON.stringify(draft.sortOptionIds) };
  }
  if (next.mediaMode !== draft.mediaMode || next.filters.watchRegion !== draft.filters.watchRegion) next = changeDiscoverContext(draft, next);
  setDraft(next); setErrors([]);
 }
 function changeFolder(key, patch) { setFolderSettings((current) => ({ ...current, [key]: { ...current[key], ...patch } })); setErrors([]); }
 async function apply() {
  if (gate.current || page !== "review") return;
  if (!editing && !planResult.ok) { setErrors(planResult.errors); return; }
  gate.current = true; setBusy(true);
  try {
   const saved = editing ? await onSave(draft) : await onApply(planResult.plan);
   if (!saved?.ok) { setErrors(saved?.errors ?? [{ message: "Changes could not be applied." }]); gate.current = false; setBusy(false); }
  } catch (error) { setErrors([{ message: error.message }]); gate.current = false; setBusy(false); }
 }
 function submit(event) {
  event.preventDefault();
  if (busy) return;
  if ((!editing && !built.ok) || (editing && !editValid)) { setErrors(editing ? filterErrors : built.errors); return; }
  if (page === "appearance" && !namesValid) { setErrors([{ message: "Enter a name for the collection and each planned folder." }]); return; }
  if (page !== "review") { go(pages[pages.indexOf(page) + 1]); return; }
  apply();
 }
 const primaryLabel = page !== "review" ? "Continue to " + pageLabels[pages[pages.indexOf(page) + 1]] : editing ? "Save source" : scope === "new-folder" ? folders.length === 1 ? "Create folder" : "Create folders" : scope === "new-collection" ? "Create collection" : "Add sources";
 const disabled = busy || (editing ? !editValid : !built.ok) || page === "appearance" && !namesValid || page === "review" && !editing && (!planResult.ok || sourceCount === 0);
 const contextLabel = editing ? "Edit Source" : scope === "new-collection" ? "New Collection" : scope === "new-folder" ? "New Folder" : "Add Source";
 const destinationLabel = [destinationCollection?.editable.title, !hierarchy && destinationFolder?.editable.title].filter(Boolean).join(" / ");
 const instructions = { filters: "Choose the content and Source orders you want.", appearance: "Name your folders and choose how they appear in Nuvio.", artwork: "Choose artwork for each folder, or leave the fields empty.", review: editing ? "Check your changes before saving this Source." : "Check what will be created before you finish." };
 const hasExclusions = ["withoutGenres", "withoutKeywords", "withoutCompanies", "withoutWatchProviders"].some((f) => draft.filters[f]);
 const contents = <div className="add-source-portal discover-portal" data-add-source-portal="true"><div className="settings-modal-backdrop add-source-backdrop" style={viewport ?? undefined}>
 <section ref={dialogRef} className="add-source-dialog creation-dialog discover-dialog" data-creation-option="advanced-discover" role="dialog" aria-modal="true" aria-labelledby="creation-title" aria-describedby="creation-description" tabIndex={-1} data-discover-page={page} inert={secondaryActive ? true : undefined} aria-hidden={secondaryActive || undefined} onKeyDown={(event) => {
  if (secondaryActive) return;
  if (event.key === "Escape" && page !== "filters" && !preview.preview) { event.preventDefault(); event.stopPropagation(); back(); return; }
  handleDialogKeyDown(event, dialogRef.current, onCancel);
 }}>
 <CreationHeader title={editing ? "Edit Discover" : "Create with Discover"} context={contextLabel + (destinationLabel ? " - " + destinationLabel : "")} description={instructions[page]} onBack={back} backDisabled={busy} inactive={secondaryActive} onClose={onCancel}
  actions={<button type="button" className="add-source-header-action discover-help-action" aria-label="How to use Discover" aria-haspopup="dialog" disabled={busy} onClick={(e) => openSecondary("help", e.currentTarget)}>How to use</button>} />
 <form className="add-source-form" onSubmit={submit} noValidate inert={preview.preview ? true : undefined}>
 <div ref={scrollRef} className="add-source-scroll discover-scroll">
 <section className="discover-stage" aria-labelledby="discover-step-title">
 <div className="add-source-section-heading"><div><p className="panel-kicker">Step {pages.indexOf(page) + 1}</p><h3 ref={headingRef} id="discover-step-title" tabIndex={-1}>{pageLabels[page]}</h3></div></div>
 {page === "filters" ? <>
  <section className="editor-settings-section discover-source-settings" aria-label="Media and Source orders">
  {editing ? <section className="discover-fixed-media"><h3>Media</h3><p>{draft.mediaType === "TV" ? "Series" : "Movies"}</p></section> : <SemanticSortChoices options={DISCOVER_MEDIA_OPTIONS} selectedId={draft.mediaMode} name="discover-media" legend="Media" onChange={(mediaMode) => change({ ...draft, mediaMode })} />}
  <SemanticSortChoices options={DISCOVER_SORT_OPTIONS} {...(editing ? { selectedId: draft.sortOptionIds[0], onChange: (id) => change({ ...draft, sortOptionIds: [id] }) } : { selectedIds: draft.sortOptionIds, onChange: (sortOptionIds) => change({ ...draft, sortOptionIds }) })} helper={editing ? null : "Choose one or more options. Each option creates a separate source."} legend={editing ? "Sort titles by" : "Sources to create"} name="discover-sort" />
  {!editing && draft.mediaMode === "both" ? <p className="editor-field-help">Movies and Series use separate sources.</p> : null}
  {!editing && !draft.sortOptionIds.length ? <p className="discover-field-error" role="alert">Choose at least one Source order.</p> : null}
  {editing && !draft.sortOptionIds.length ? <DiscoverNotice>The imported order is preserved until you choose another. Preview needs a supported order.</DiscoverNotice> : null}
  </section>
  <DiscoverKeywordControls draft={draft} onChange={change} keywordClient={client} catalogueReady={catalogue.status === "ready"} errors={filterErrors} {...panelProps} />
  {catalogue.status === "loading" ? <p role="status">Loading keyword names… Other filters are available.</p> : catalogue.status === "error" ? <DiscoverNotice error>{catalogue.error} <button className="secondary-action" type="button" onClick={() => loadCatalogue(true)}>Retry</button></DiscoverNotice> : catalogue.stale ? <DiscoverNotice>Using saved keyword names from {catalogue.sourceDate} while refresh is unavailable.</DiscoverNotice> : null}
  {nameWarning ? <DiscoverNotice>{nameWarning}</DiscoverNotice> : null}
  <DiscoverGenreControls draft={draft} onChange={change} errors={filterErrors} />
  <DiscoverDetailedControls draft={draft} onChange={change} studioProvider={studioProvider} networkProvider={networkProvider} streamingProvider={streamingProvider} namedCodes={namedCodes} errors={filterErrors} {...panelProps} />
  {editing ? <div className="editor-field"><label htmlFor="discover-source-name">Source name</label><input id="discover-source-name" type="text" value={draft.title} onChange={(e) => change({ ...draft, title: e.target.value, titleTouched: true })} />{draft.titleTouched && !draft.title?.trim() ? <span className="discover-field-error" role="alert">Enter a Source name.</span> : null}</div> : scope === "add-source" ? <div className="editor-field"><label htmlFor="discover-source-name">Source name</label><input id="discover-source-name" type="text" value={draft.name} onChange={(e) => change({ ...draft, name: e.target.value, nameMode: "custom" })} /></div> : null}
  {draft.previewBlocked ? <DiscoverNotice>Some imported settings disagree or are not supported here. They are preserved, but an exact Preview is unavailable.</DiscoverNotice> : null}
 </> : page === "appearance" ? <>
  <div className="genre-hierarchy-configuration-summary discover-plan-summary" role="status" aria-label="Planned output"><strong>{sourceCount} {sourceCount === 1 ? "Source" : "Sources"} in {folders.length} {folders.length === 1 ? "folder" : "folders"}</strong></div>
  {scope === "new-collection" ? <div className="editor-field"><label htmlFor="discover-collection-name">Collection name</label><input id="discover-collection-name" type="text" {...reversibleTitleFieldProps(collectionTitle, appearance.hideCollectionTitle)} aria-invalid={!isValidVisibleNuvioTitle(collectionTitle)} aria-describedby="discover-collection-hidden discover-collection-error" onChange={(e) => setCollectionTitle(e.target.value)} /><HiddenTitleFieldHelp id="discover-collection-hidden" hidden={appearance.hideCollectionTitle} kind="collection" /><span id="discover-collection-error" className="discover-field-error">{!isValidVisibleNuvioTitle(collectionTitle) ? "Enter a collection name." : null}</span></div> : <p className="editor-field-help">These folders use the existing collection layout.</p>}
  {draft.mediaMode === "both" ? <SemanticSortChoices legend="Folder arrangement" name="discover-arrangement" options={[{ id: "one-folder", label: "One folder" }, { id: "split-media", label: "Separate Movies and Series" }]} selectedId={folderArrangement} onChange={setFolderArrangement} /> : null}
  {folders.map((folder) => <div className="editor-field" key={folder.key}><label htmlFor={"discover-folder-name-" + folder.key}>{folders.length === 1 ? "Folder name" : folder.mediaType === "MOVIE" ? "Movies folder name" : "Series folder name"}</label><input id={"discover-folder-name-" + folder.key} type="text" {...reversibleTitleFieldProps(folderSettings[folder.key]?.title ?? folder.title, appearance.folderTitleVisibility === "HIDE_EVERYWHERE")} aria-invalid={!isValidVisibleNuvioTitle(folder.title)} aria-describedby={"discover-folder-hidden discover-folder-error-" + folder.key} onChange={(e) => changeFolder(folder.key, { title: e.target.value })} /><span id={"discover-folder-error-" + folder.key} className="discover-field-error">{!isValidVisibleNuvioTitle(folder.title) ? "Enter a folder name." : null}</span></div>)}
  <HiddenTitleFieldHelp id="discover-folder-hidden" hidden={appearance.folderTitleVisibility === "HIDE_EVERYWHERE"} kind="folder" plural={folders.length > 1} />
  <section className="discover-appearance"><TitleOptions idPrefix="discover" collectionTitleVisibility={scope === "new-collection" ? { checked: appearance.hideCollectionTitle, onChange: (hideCollectionTitle) => setAppearance({ ...appearance, hideCollectionTitle }), descriptionId: "discover-hide-title", controlName: "discover-hide-title" } : null} folderTitleVisibility={{ selectedId: appearance.folderTitleVisibility, name: "discover-folder-visibility", onChange: (folderTitleVisibility) => setAppearance({ ...appearance, folderTitleVisibility }) }} />
  {scope === "new-collection" ? <><fieldset className="editor-field editor-choice-field"><legend>Collection layout</legend><HierarchyCollectionPresentationControls selectedId={appearance.viewMode} name="discover-layout" showAllTab={appearance.showAllTab} onPresentationChange={(patch) => setAppearance({ ...appearance, ...patch })} showAllDescription="Combines each folder's Sources into its All tab." showAllDescriptionId="discover-all-help" showAllControlName="discover-all" /></fieldset><PresentationSwitch label="Pin collection to top" description="Keeps this collection near the top of Nuvio." checked={appearance.pinToTop} onChange={(pinToTop) => setAppearance({ ...appearance, pinToTop })} descriptionId="discover-pin-help" controlName="discover-pin" /></> : null}</section>
 </> : page === "artwork" ? <>
  {folders.length > 1 ? <SemanticSortChoices legend="Artwork for" name="discover-artwork-folder" options={folders.map((folder) => ({ id: folder.key, label: folder.title }))} selectedId={activeArtworkFolder?.key} onChange={setArtworkKey} /> : null}
  {activeArtworkFolder ? <section className="editor-settings-section discover-folder-artwork" key={activeArtworkFolder.key} aria-label={"Artwork for " + activeArtworkFolder.title}>
   {folders.length === 1 ? <p className="editor-field-help">Artwork for <strong>{activeArtworkFolder.title}</strong></p> : null}
   <fieldset className="editor-field editor-choice-field"><legend>Tile shape</legend><FolderShapeChoices selectedId={activeArtworkFolder.artwork.tileShape} name="discover-shape" idPrefix="discover-shape" onChange={(tileShape) => changeFolder(activeArtworkFolder.key, { artwork: changeAdvancedDiscoverArtworkShape(activeArtworkFolder.artwork, tileShape, artworkSuggestions) })} /></fieldset>
   <FolderArtworkFields values={activeArtworkFolder.artwork} prefix={"discover-art-" + activeArtworkFolder.key} suggestionSet={artworkSuggestions} suggestionState={artworkSuggestions ? "ready" : "none"} onChange={(field, value) => changeFolder(activeArtworkFolder.key, { artwork: { ...activeArtworkFolder.artwork, [field]: value } })} />
   {["coverImageUrl", "heroBackdropUrl", "titleLogoUrl", "focusGifUrl"].some((field) => activeArtworkFolder.artwork[field]) ? <button className="secondary-action" type="button" onClick={() => changeFolder(activeArtworkFolder.key, { artwork: { tileShape: activeArtworkFolder.artwork.tileShape, focusGifEnabled: activeArtworkFolder.artwork.focusGifEnabled } })}>Leave artwork unset</button> : null}
  </section> : null}
 </> : <>
  <section className="discover-review" aria-label="Final review">
   {hierarchy ? <div className="decades-plan-totals" data-plan-scope={scope} aria-label="Plan totals">{scope === "new-collection" ? <div><strong>1</strong><span>Collection</span></div> : null}<div><strong>{folders.length}</strong><span>{folders.length === 1 ? "Folder" : "Folders"}</span></div><div><strong>{sourceCount}</strong><span>{sourceCount === 1 ? "Source" : "Sources"}</span></div></div> : <p className="discover-output-total">{editing ? "One Source to save" : sourceCount + (sourceCount === 1 ? " Source" : " Sources") + " to add"}</p>}
   {scope === "new-collection" ? <p className="editor-field-help">Collection: <strong>{options.collectionTitle}</strong>{appearance.hideCollectionTitle ? " - Title hidden" : ""}</p> : null}
   <section className="add-source-review"><div className="discover-review-heading"><h4>Filters</h4><button className="secondary-action" type="button" onClick={() => go("filters")}>Edit filters</button></div><DiscoverFilterReview draft={draft} />
    {draft.previewBlocked ? <DiscoverNotice>Some imported settings disagree or are not supported here. They are preserved, but an exact Preview is unavailable.</DiscoverNotice> : null}
   </section>
   {hierarchy ? <>
    <section className="add-source-review">
     <div className="discover-review-heading"><h4>Folders and appearance</h4><button className="secondary-action" type="button" onClick={() => go("appearance")}>Edit appearance</button></div>
     <p className="editor-field-help">Folder titles: {folderVisibilityLabels[appearance.folderTitleVisibility]}.</p>
     {scope === "new-collection" ? <p className="editor-field-help">{appearance.viewMode === "ROWS" ? "Rows" : "Tabs" + (appearance.showAllTab ? " - All tab enabled" : " - All tab disabled")}{appearance.pinToTop ? " - Pinned to top" : ""}</p> : <p className="editor-field-help">Uses the existing collection layout.</p>}
    </section>
    {folders.map((folder) => <section className="add-source-review discover-review-folder" key={folder.key} data-review-folder={folder.key}><div className="discover-review-heading"><div><h4>{folder.title}</h4><span className="editor-field-help">{folder.drafts.length} {folder.drafts.length === 1 ? "Source" : "Sources"}</span></div><button className="secondary-action" type="button" onClick={() => { setArtworkKey(folder.key); go("artwork"); }}>Edit artwork</button></div><ul>{folder.drafts.map((source) => <li key={source.editable.mediaType + source.editable.sortBy}>{source.editable.title}</li>)}</ul><ArtworkSummary artwork={folder.artwork} /></section>)}
   </> : editing ? <section className="add-source-review"><h4>{draft.title || "Discover"}</h4><p className="editor-field-help">{draft.mediaType === "TV" ? "Series" : "Movies"} - {DISCOVER_SORT_OPTIONS.find((s) => s.id === draft.sortOptionIds[0])?.label ?? "Imported order (preserved)"}</p></section> : <section className="add-source-review"><h4>Sources</h4><ul>{built.drafts.map((source) => <li key={source.editable.mediaType + source.editable.sortBy}>{source.editable.title}{duplicates.duplicateDrafts.includes(source) ? override ? " - Add another copy" : " - Already in this folder; skipped" : ""}</li>)}</ul>{duplicates.duplicateDrafts.length ? <PresentationSwitch label="Include exact duplicates" checked={override} onChange={(checked) => setDuplicateConsent(checked ? overrideIdentity : null)} description="Add another copy of the Sources already in this folder." descriptionId="discover-duplicates-help" controlName="discover-duplicates" /> : null}</section>}
   {!editing ? <SourceElsewhereNotice occurrences={duplicates.elsewhere} heading="Matching Sources exist elsewhere" action="You can still create these Sources here." /> : null}
   {scope === "new-collection" ? <p className="editor-field-help">After creating this collection, choose New Folder → Discover to add another folder.</p> : null}
  </section>
 </>}
 {hasExclusions ? <DiscoverNotice>Saving through Nuvio’s Manage from phone can remove exclusions.</DiscoverNotice> : null}
 {errors.length ? <DiscoverNotice error><ul>{errors.map((entry, index) => <li key={index}>{entry.message}</li>)}</ul></DiscoverNotice> : null}
 </section>
 </div>
 <footer className="add-source-actions discover-actions"><button className="editor-apply" type="submit" disabled={disabled}>{busy ? "Working…" : primaryLabel}</button><button className="secondary-action discover-preview-action" type="button" aria-haspopup="dialog" disabled={busy || !preview.available(candidates)} onClick={(e) => preview.open(candidates, { trigger: e.currentTarget, label: editing ? draft.title || "Discover" : draft.name || "Discover" })}>Preview titles</button></footer>
 </form></section>
 {secondarySurface === "help" ? <DiscoverHelpDialog editing={editing} scope={scope} onClose={() => setSecondarySurface(null)} /> : null}
 </div>{preview.preview ? <SourceTitlePreviewDialog {...preview.dialogProps} titleId="discover-preview-title" /> : null}</div>;
 return typeof document === "undefined" ? contents : createPortal(contents, document.body);
}
