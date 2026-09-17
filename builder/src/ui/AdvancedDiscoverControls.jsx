import { DiscoverFieldError, DiscoverValueField } from "./DiscoverValueField.jsx";
import { GenreRuleCard, GenreRulePills } from "./GenreRuleControls.jsx";
export { DiscoverFieldError } from "./DiscoverValueField.jsx";
import { NestedPreviewDialog } from "./NestedPreviewDialog.jsx";
import { TmdbEntityLogo } from "./TmdbEntityLogo.jsx";
import { searchStudioCatalogue } from "../source-add/studio-catalogue.js";
import { searchNetworkCatalogue } from "../source-add/network-catalogue.js";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { DISCOVER_FIELD_LABELS, deriveAdvancedDiscoverFilters, discoverExpressionIds, discoverGenreAvailability, discoverMediaTypes, discoverSelectionConflict, discoverSelectionOperator, removeUnavailableDiscoverGenres, setDiscoverOperator, setDiscoverSelection } from "../source-add/advanced-discover.js";
import { OFFICIAL_GENRE_REFERENCES } from "../source-add/genre-catalogue.js";
import { GENRE_LANGUAGE_OPTIONS, GENRE_COUNTRY_OPTIONS } from "../source-add/genre-advanced.js";
import { buildTmdbLogoUrl, formatTmdbEntityLocation } from "../source-add/tmdb-entity-catalogue.js";
import { browseStreamingProviders, eligibleStreamingProvidersForMedia, searchStreamingProviders, STREAMING_PROVIDER_BROWSE_MODES } from "../source-add/streaming-catalogue.js";
import { discoverSelectionLabel } from "../source-add/discover-selection-labels.js";

export function DiscoverNotice({ children, error = false }) {
 return <div className="discover-notice" role={error ? "alert" : "status"}>{children}</div>;
}

export function DiscoverOperator({ draft, field, onChange }) {
 return <div className="discover-operator" role="group" aria-label={"Included " + DISCOVER_FIELD_LABELS[field].toLowerCase() + " matching"}>
 <span className="discover-operator-label">Applies to all included {DISCOVER_FIELD_LABELS[field].toLowerCase()}. {field !== "withNetworks" ? "Exclusions are separate." : null}</span>
 {[["|", "Match any (OR)"], [",", "Match all (AND)"]].map(([id, label]) => <button key={id} type="button" aria-pressed={discoverSelectionOperator(draft, field) === id} onClick={() => onChange(setDiscoverOperator(draft, field, id))}>{label}</button>)}
 </div>;
}
function SelectionChips({ draft, field, onChange }) {
 const negative = field.startsWith("without");
 const ids = discoverExpressionIds(draft.filters[field]);
 return ids.length ? <ul className="discover-chips" aria-label={DISCOVER_FIELD_LABELS[field]}>{ids.map((id) => {
  const name = discoverSelectionLabel(draft, field, id);
  return <li key={id} data-excluded={negative || undefined}><span><span className="visually-hidden">{negative ? "Excluded: " : "Included: "}</span>{name}</span><button type="button" aria-label={"Remove " + name + " from " + DISCOVER_FIELD_LABELS[field].toLowerCase()} onClick={() => onChange(setDiscoverSelection(draft, field, { id, name }, { remove: true }))}>×</button></li>;
 })}</ul> : null;
}
// The catalogue adapters share one accessible picker. Entity browsing uses existing providers;
// keyword matching stays in the existing background worker.
export function DiscoverNamedPicker({ field, negativeField = null, label = DISCOVER_FIELD_LABELS[field], draft, onChange, search, available = true, browse = false, errors = [], helper = null, activePanel = null, onOpenPanel, onClosePanel, panelClassName = "", desktopSelectionView = true, exclusionOnly = false }) {
 const mode = exclusionOnly ? "exclude" : draft.pickerModes?.[field] ?? "include";
 const setMode = (value) => onChange({ ...draft, pickerModes: { ...draft.pickerModes, [field]: value } });
 const [open, setOpen] = useState(false), [active, setActive] = useState(-1), [, renderView] = useState(0);
 const [state, setState] = useState({ rows: [], total: 0, loading: false, error: null }), [feedback, setFeedback] = useState(""), [attempt, setAttempt] = useState(0);
 const activeField = mode === "exclude" && negativeField ? negativeField : field;
 const query = draft.searches?.[activeField] ?? "";
 const uid = useId(), listRef = useRef(null), inputRef = useRef(null), summaryRef = useRef(null), moreRef = useRef(null);
 const mobileOpen = activePanel === field;
 const selected = discoverExpressionIds(draft.filters[activeField]);
 const views = useRef(new Map()), searchRef = useRef(search);
 if (searchRef.current !== search) { views.current.clear(); searchRef.current = search; }
 const savedView = views.current.get(activeField);
 const view = savedView?.query === query ? savedView : { query, limit: 24, scrollTop: 0, selectedScrollTop: 0, selectedOnly: false, pending: false, armed: false };
 views.current.set(activeField, view);
 const resultKey = activeField + ":" + query;
 const currentResults = state.key === resultKey && state.search === search;
 const selectedOnly = view.selectedOnly && (mobileOpen || desktopSelectionView);
 const resultRows = currentResults ? state.rows : [];
 const rows = selectedOnly ? selected.map((id) => ({ id, name: discoverSelectionLabel(draft, activeField, id) })) : resultRows;
 const waiting = !selectedOnly && (state.loading || (available && (open || mobileOpen) && (browse || query.trim().length >= 2) && !currentResults));
 const hasMore = browse && !selectedOnly && currentResults && state.total > resultRows.length;
 const entityType = field === "withCompanies" ? "company" : field === "withNetworks" ? "network" : null;
 function closePanel() { setFeedback(""); setOpen(false); onClosePanel(); }
 function updateQuery(value) { onChange({ ...draft, searches: { ...draft.searches, [activeField]: value } }); setFeedback(""); setOpen(true); setActive(-1); }
 function showSelected(value) {
  if (listRef.current) view[selectedOnly ? "selectedScrollTop" : "scrollTop"] = listRef.current.scrollTop;
  view.selectedOnly = value; view.armed = false; setFeedback(""); setActive(-1); setOpen(true); renderView((n) => n + 1);
 }
 function loadNextBatch() {
  if (!hasMore || waiting || view.pending) return;
  view.pending = true; view.armed = false;
  view.limit = Math.min(resultRows.length + 24, state.total); setAttempt((n) => n + 1);
 }
 function nearBottom(list) { return list.scrollHeight - list.clientHeight - list.scrollTop <= 120; }
 function armScroll() { view.armed = true; }
 function navigateResults(e) {
  if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
   // Home/End keep native text editing behavior in Search.
   if (["Home", "End"].includes(e.key) && e.currentTarget === inputRef.current) return;
   e.preventDefault(); setOpen(true); armScroll();
   setActive((n) => rows.length ? e.key === "Home" ? 0 : e.key === "End" ? rows.length - 1 : Math.max(0, Math.min(rows.length - 1, n + (e.key === "ArrowDown" ? 1 : -1))) : -1);
  }
  if (e.key === "Enter" || (e.key === " " && e.currentTarget !== inputRef.current)) { e.preventDefault(); if (rows[active]) choose(rows[active]); }
 }
 useEffect(() => { setActive(-1); }, [activeField, query, search]);
 useEffect(() => {
  let current = true;
  if (!(open || mobileOpen) || selectedOnly) return;
  if (!available || (!browse && query.trim().length < 2)) { setState({ key: resultKey, search, rows: [], total: 0, loading: false, error: null }); return; }
  if (currentResults && state.limit === view.limit && !state.loading && !state.error) return;
  setState((previous) => {
   const sameSearch = previous.key === resultKey && previous.search === search;
   return { key: resultKey, search, rows: sameSearch ? previous.rows : [], total: sameSearch ? previous.total : 0, loading: true, error: null };
  });
  const timer = setTimeout(async () => {
   try {
    const found = await search(query, activeField.startsWith("without"), view.limit);
    if (current) {
     view.pending = false;
     if (browse && found.results.length >= found.totalResults && moreRef.current === document.activeElement) listRef.current?.focus({ preventScroll: true });
     setState({ key: resultKey, search, limit: view.limit, rows: browse ? found.results : found.slice(0, 12), total: browse ? found.totalResults : found.length, loading: false, error: null });
    }
   }
   catch (error) { if (current) { view.pending = false; setState((previous) => ({ ...previous, loading: false, error: error.message })); } }
  }, query ? 180 : 0);
  return () => { current = false; view.pending = false; clearTimeout(timer); };
 }, [open, mobileOpen, query, search, available, browse, activeField, attempt, view.limit, selectedOnly]);
 useLayoutEffect(() => {
  if (listRef.current && (selectedOnly || !state.loading)) listRef.current.scrollTop = view[selectedOnly ? "selectedScrollTop" : "scrollTop"];
 }, [state.rows, state.loading, mobileOpen, open, selectedOnly, activeField, query]);
 useLayoutEffect(() => {
  if (open || mobileOpen) {
   if (selectedOnly) listRef.current?.focus({ preventScroll: true });
   else if (summaryRef.current) summaryRef.current.focus({ preventScroll: true });
  }
 }, [selectedOnly]);
 useEffect(() => { if (active >= rows.length) setActive(rows.length - 1); }, [rows.length, active]);
 useEffect(() => {
  const list = listRef.current, row = list?.children[active];
  if (!row) return;
  if (row.offsetTop < list.scrollTop) list.scrollTop = row.offsetTop;
  else if (row.offsetTop + row.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = row.offsetTop + row.offsetHeight - list.clientHeight;
 }, [active]);
 function choose(row) {
  if (!selectedOnly && !currentResults) return;
  if (discoverSelectionConflict(draft, activeField, row.id)) { setFeedback(exclusionOnly ? row.name + " is a required service and cannot be excluded." : row.name + " is already " + (mode === "exclude" ? "included" : "excluded") + ". Remove that choice first."); return; }
  if (selected.includes(row.id)) {
   if (browse || selectedOnly) onChange(setDiscoverSelection(draft, activeField, row, { remove: true }));
   setFeedback(""); return;
  }
  const sameName = state.rows.filter((r) => r.name === row.name);
  const location = formatTmdbEntityLocation(row);
  const detail = sameName.length > 1 ? (location && !sameName.some((r) => r.id !== row.id && formatTmdbEntityLocation(r) === location) ? location : "ID " + row.id) : "";
  const next = setDiscoverSelection(draft, activeField, { ...row, name: row.name + (detail ? " · " + detail : "") });
  if (field === "withCompanies") next.selectionNames = { ...draft.selectionNames, [activeField + ":" + row.id]: row.name };
  onChange(browse ? next : { ...next, searches: { ...next.searches, [activeField]: "" } });
  setFeedback(""); if (!browse) { setOpen(false); setActive(-1); }
  if (!mobileOpen) inputRef.current?.focus({ preventScroll: true });
 }
 const searchInput = (inPanel) => <label className="editor-field"><span className="visually-hidden">Search {label.toLowerCase()}</span>
  <input ref={inputRef} id={uid + "-search"} name={"discover-" + field + "-query"} type="search" inputMode="search" enterKeyHint="search" autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false}
   role="combobox" aria-autocomplete="list" aria-expanded={(open || inPanel) && available} aria-controls={(open || inPanel) ? uid : undefined}
   aria-activedescendant={(open || inPanel) && active >= 0 && rows[active] ? uid + "-" + active : undefined}
   aria-describedby={feedback ? uid + "-feedback" : undefined} value={query} placeholder={"Search " + label.toLowerCase() + (mode === "exclude" ? " to exclude" : "")} disabled={!available}
   onFocus={() => setOpen(true)} onChange={(e) => updateQuery(e.target.value)} onKeyDown={(e) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOpen(false); if (inPanel) closePanel(); return; }
    navigateResults(e);
   }} />
 </label>;
 const selectionSummary = <div className="discover-panel-selection">
  {feedback ? <p id={uid + "-feedback"} className="discover-field-error" role="alert">{feedback}</p> : null}
  <span role="status">{selected.length} selected</span><span aria-hidden="true"> · </span>
  <button ref={summaryRef} type="button" className="discover-selection-switch" onClick={() => showSelected(!selectedOnly)}>{selectedOnly ? "Back to browsing" : "View selected"}</button>
 </div>;
 const suggestions = <div className="discover-dropdown">
  {!selectedOnly && state.error ? <DiscoverNotice error>{state.error} <button className="secondary-action" type="button" onClick={() => setAttempt((n) => n + 1)}>Retry</button></DiscoverNotice> : null}
  <ul ref={listRef} id={uid} role="listbox" tabIndex={0} aria-label={(selectedOnly ? "Selected " : "") + label + (selectedOnly ? " to " + mode + "; select an item to remove it" : " suggestions")} aria-multiselectable="true" aria-busy={waiting}
   aria-activedescendant={active >= 0 && rows[active] ? uid + "-" + active : undefined} onKeyDown={navigateResults}
   onWheel={armScroll} onTouchMove={armScroll}
   onScroll={(e) => {
    const list = e.currentTarget, key = selectedOnly ? "selectedScrollTop" : "scrollTop", previous = view[key]; view[key] = list.scrollTop;
    if (!selectedOnly && view.armed && list.scrollTop > previous && nearBottom(list)) loadNextBatch();
   }}>{rows.map((row, i) => {
   const location = formatTmdbEntityLocation(row), logo = buildTmdbLogoUrl(row.logoPath);
   const sameName = rows.filter((r) => r.name === row.name);
   const needsId = sameName.some((r) => r.id !== row.id && formatTmdbEntityLocation(r) === location);
   return <li key={row.id} id={uid + "-" + i} role="option" aria-selected={selected.includes(row.id)} aria-label={[row.name, location, needsId ? "ID " + row.id : null, selected.includes(row.id) ? mode === "exclude" ? "excluded" : "included" : null].filter(Boolean).join(", ")}
    data-excluded={selected.includes(row.id) && mode === "exclude" || undefined} data-tmdb-id={row.id} data-active={i === active || undefined}
    onMouseDown={(e) => e.preventDefault()} onClick={() => choose(row)}>
    {!selectedOnly && entityType ? <span className="discover-entity-logo" aria-hidden="true"><TmdbEntityLogo entity={row} entityType={entityType} /></span> : logo ? <img src={logo} alt="" loading="lazy" /> : null}<span><strong>{row.name}</strong>{location || needsId ? <small>{[location, needsId ? "ID " + row.id : null].filter(Boolean).join(" · ")}</small> : null}{row.kind && !["exact", "name"].includes(row.kind) ? <small>{row.kind} · choose to apply</small> : null}</span>{selectedOnly ? <span className="discover-selected-remove" aria-hidden="true">×</span> : null}
   </li>;
  })}</ul>
  {!waiting && !state.error && !rows.length ? <p>{selectedOnly ? "No selections. Return to browsing to choose names." : !browse && query.trim().length < 2 ? "Type at least two letters." : "No matching names. Try another search."}</p> : null}
  {!selectedOnly ? <div className="discover-browse-status" role="status">{waiting ? resultRows.length ? "Loading more…" : "Loading names…" : browse && currentResults ? rows.length + " of " + state.total + " names" : currentResults && state.total > rows.length ? "Type more to narrow these suggestions." : null}</div> : null}
  {hasMore ? <button ref={moreRef} type="button" className="secondary-action discover-load-more" aria-disabled={waiting}
   onClick={loadNextBatch}>More {label.toLowerCase()}</button> : null}
  {!mobileOpen ? desktopSelectionView ? selectionSummary : feedback ? <p id={uid + "-feedback"} className="discover-field-error" role="alert">{feedback}</p> : null : null}
 </div>;
 return <section className="editor-settings-section discover-picker" role="group" aria-labelledby={uid + "-heading"} data-picker={field}
  onBlur={(e) => { if (!mobileOpen && !e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
  <h3 id={uid + "-heading"}>{label}</h3>
  {negativeField && !exclusionOnly ? <div className="discover-mode" role="group" aria-label={label + " action"}>{["include", "exclude"].map((value) => <button type="button" key={value} data-mode={value} aria-pressed={mode === value} onClick={() => { setMode(value); setFeedback(""); setOpen(false); }}>{value === "include" ? "Include" : "Exclude"}</button>)}</div> : null}
  <div className="discover-autocomplete">
   <button type="button" className="secondary-action discover-picker-launch" aria-haspopup="dialog" aria-label={"Search " + label.toLowerCase()} disabled={!available && !selected.length}
    onClick={(e) => { setOpen(false); setFeedback(""); onOpenPanel(field, e.currentTarget); }}>{query || "Search " + label.toLowerCase()}<span aria-hidden="true">›</span></button>
   {!mobileOpen ? <div className="discover-desktop-search">{searchInput(false)}{open && (available || selectedOnly) ? suggestions : feedback ? <p id={uid + "-feedback"} className="discover-field-error" role="alert">{feedback}</p> : null}</div> : null}
  </div>
  {!exclusionOnly ? <DiscoverOperator draft={draft} field={field} onChange={onChange} /> : null}
  {!exclusionOnly ? <SelectionChips draft={draft} field={field} onChange={onChange} /> : null}
  {negativeField ? <SelectionChips draft={draft} field={negativeField} onChange={onChange} /> : null}
  {helper ? <p className="editor-field-help">{helper}</p> : null}
  {!available ? <p className="editor-field-help">Search is waiting for the catalogue or watch region.</p> : null}
  <DiscoverFieldError field={field} errors={errors} />{negativeField ? <DiscoverFieldError field={negativeField} errors={errors} /> : null}
  {mobileOpen ? <NestedPreviewDialog ariaLabelledBy={uid + "-panel-title"} onClose={closePanel}
   backdropClassName="discover-selection-backdrop" backdropProps={{ onMouseDown: (e) => { if (e.target === e.currentTarget) e.preventDefault(); } }}
   dialogClassName={"add-source-dialog discover-dialog discover-selection-dialog" + (panelClassName ? " " + panelClassName : "")}>
   <header className="genre-exclusion-root-header"><h3 id={uid + "-panel-title"}>{negativeField ? mode === "exclude" ? "Exclude " : "Include " : ""}{label}</h3>
    <button type="button" className="editor-apply genre-secondary-done" onClick={closePanel}>Done</button></header>
   <div className="discover-panel-search">{selectedOnly ? <p>Selected {label.toLowerCase()} · {mode === "exclude" ? "Exclude" : "Include"}</p> : searchInput(true)}</div>
   {suggestions}
   {selectionSummary}
  </NestedPreviewDialog> : null}
 </section>;
}

export function DiscoverKeywordControls({ keywordClient, catalogueReady, ...props }) {
 const search = useMemo(() => (query, negative) => keywordClient.autocomplete(query, negative), [keywordClient]);
 return props.draft.extraEditable?.withKeywords === false ? <p className="editor-field-help">Imported keyword settings are preserved.</p> : <DiscoverNamedPicker {...props} desktopSelectionView={false} field="withKeywords" negativeField="withoutKeywords" label="Keywords" search={search} available={catalogueReady} helper="Search keyword names, then select suggestions. Match any needs at least one included keyword; Match all requires every included keyword." />;
}
export function DiscoverGenreControls({ draft, onChange, errors }) {
 const headingRef = useRef(null);
 const both = draft.mediaMode === "both";
 const unavailable = both ? [] : discoverMediaTypes(draft.mediaMode).map((media) => discoverGenreAvailability(draft.filters, media)).filter((entry) => entry.selections.length);
 const information = both ? discoverMediaTypes(draft.mediaMode).flatMap((media) => deriveAdvancedDiscoverFilters(draft, media).information).filter((entry) => /Genres$/.test(entry.field)) : [];
 const otherErrors = both ? errors : errors.filter((entry) => entry.code !== "UNAVAILABLE_DISCOVER_GENRES");
 const mode = draft.pickerModes?.withGenres ?? "include";
 const setMode = (value) => onChange({ ...draft, pickerModes: { ...draft.pickerModes, withGenres: value } });
 const field = mode === "exclude" ? "withoutGenres" : "withGenres";
 const genres = useMemo(() => {
  const medias = discoverMediaTypes(draft.mediaMode);
  return [...new Map(OFFICIAL_GENRE_REFERENCES.filter((g) => medias.includes(g.mediaType)).map((g) => [g.tmdbId, { id: g.tmdbId, name: g.name, only: both && !OFFICIAL_GENRE_REFERENCES.some((other) => other.tmdbId === g.tmdbId && other.mediaType !== g.mediaType) ? g.mediaType === "TV" ? "Series" : "Movies" : null }])).values()];
 }, [draft.mediaMode]);
 if (draft.extraEditable?.withGenres === false) return <p className="editor-field-help">Imported Genre settings are preserved.</p>;
 return <GenreRuleCard headingRef={headingRef}>
  <div className="discover-mode" role="group" aria-label="Genre action">{["include", "exclude"].map((value) => <button key={value} type="button" data-mode={value} aria-pressed={mode === value} onClick={() => setMode(value)}>{value === "include" ? "Include" : "Exclude"}</button>)}</div>
  <DiscoverOperator draft={draft} field="withGenres" onChange={onChange} />
  <GenreRulePills rows={[...genres, ...[...new Set([...discoverExpressionIds(draft.filters.withGenres), ...discoverExpressionIds(draft.filters.withoutGenres)])].filter((id) => !genres.some((g) => g.id === id)).map((id) => ({ id, name: discoverSelectionLabel(draft, "withGenres", id), unavailable: true }))].map((row) => ({ ...row, included: discoverExpressionIds(draft.filters.withGenres).includes(row.id), excluded: discoverExpressionIds(draft.filters.withoutGenres).includes(row.id) }))} onChoose={(row) => {
    const other = mode === "include" ? "withoutGenres" : "withGenres";
    const base = setDiscoverSelection(draft, other, row, { remove: true });
    onChange(setDiscoverSelection(base, field, row, { remove: mode === "include" ? row.included : row.excluded }));
  }} />
  <p className="editor-field-help">Tap a selected genre in the same mode to remove it; switch mode to change its Include/Exclude state.</p>
  {both ? <p className="editor-field-help">Movies / Series labels mark genres that apply only to that media. Matching uses the included genres available to each source.</p> : null}
  {information.length ? <DiscoverNotice>{information.map(({ field, message }) => <p key={field + message}>{message}</p>)}</DiscoverNotice> : null}
  {unavailable.length ? <DiscoverNotice error>{unavailable.map(({ message }) => <p key={message}>{message}</p>)}<div className="discover-topic-actions"><button className="secondary-action" type="button" onClick={() => { onChange(removeUnavailableDiscoverGenres(draft)); headingRef.current?.focus({ preventScroll: true }); }}>Remove unavailable selections</button></div></DiscoverNotice> : null}
  <DiscoverFieldError field="withGenres" errors={otherErrors} /><DiscoverFieldError field="withoutGenres" errors={otherErrors} />
 </GenreRuleCard>;
}
export function DiscoverSelectField({ field, draft, onChange, options, errors, helper = null }) {
 const value = draft.filters[field] ?? "";
 const all = value && !options.some((o) => o.code === value) ? [{ code: value, label: "Saved: " + value }, ...options] : options;
 return <div className="editor-field"><label htmlFor={"discover-field-" + field}>{DISCOVER_FIELD_LABELS[field]}</label><select disabled={draft.extraEditable?.[field] === false} id={"discover-field-" + field} data-watch-region={field === "watchRegion" && value !== "" || undefined} aria-describedby={"discover-error-" + field} value={value} onChange={(e) => onChange({ ...draft, filters: { ...draft.filters, [field]: e.target.value } })}><option value="">Any</option>{all.map((o) => <option key={o.code} value={o.code}>{o.label ?? o.name}</option>)}</select>{helper ? <p className="editor-field-help">{helper}</p> : null}<DiscoverFieldError field={field} errors={errors} /></div>;
}

export function DiscoverDetailedControls({ draft, onChange, studioProvider, networkProvider, streamingProvider, namedCodes = null, errors = [], cataloguesOnly = false, fixedProviderContext = null, children = null, ...panelProps }) {
 const [streaming, setStreaming] = useState(null), [streamingError, setStreamingError] = useState(null), [loading, setLoading] = useState(false);
 const alive = useRef(true);
 useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
 const entitySearch = (provider, key) => async (q, _negative, limit) => {
  const result = await provider.loadCatalogue(); if (!result.ok) throw new Error(result.error.message);
  const parsed = q.trim() ? { kind: "search", eligible: true, query: q } : { kind: "browse" };
  return (key === "studios" ? searchStudioCatalogue : searchNetworkCatalogue)(result.data, parsed, { pageSize: limit });
 };
 const studioSearch = useMemo(() => entitySearch(studioProvider, "studios"), [studioProvider]);
 const networkSearch = useMemo(() => entitySearch(networkProvider, "networks"), [networkProvider]);
 async function loadStreaming() {
  if (loading) return;
  setLoading(true); setStreamingError(null);
  try { const result = await streamingProvider.loadCatalogue(); if (!result.ok) throw new Error(result.error.message); if (alive.current) setStreaming(result.data); }
  catch (error) { if (alive.current) setStreamingError(error.message); }
  finally { if (alive.current) setLoading(false); }
 }
 useEffect(() => { if ((draft.filters.watchRegion || draft.filters.withWatchProviders || draft.filters.withoutWatchProviders || draft.providerContextReview) && !streaming && !streamingError) loadStreaming(); }, [draft.filters.watchRegion, draft.filters.withWatchProviders, draft.filters.withoutWatchProviders, draft.providerContextReview]);
 const invalidProviders = useMemo(() => {
  if (!streaming || !draft.filters.watchRegion) return [];
  const eligible = new Set(eligibleStreamingProvidersForMedia(streaming.providers, [draft.filters.watchRegion], draft.mediaMode).map((r) => r.id));
  return (fixedProviderContext ? ["withoutWatchProviders"] : ["withWatchProviders", "withoutWatchProviders"]).flatMap((field) => discoverExpressionIds(draft.filters[field]).filter((id) => !eligible.has(id)).map((id) => ({ field, id })));
 }, [streaming, draft.filters.watchRegion, draft.filters.withWatchProviders, draft.filters.withoutWatchProviders, draft.mediaMode]);
 useEffect(() => { if (draft.providerContextReview && streaming && draft.filters.watchRegion && !invalidProviders.length) onChange({ ...draft, providerContextReview: false }); }, [streaming, invalidProviders, draft.providerContextReview]);
 const providerSearch = useMemo(() => async (q, _negative, limit) => {
  if (!streaming || !draft.filters.watchRegion) return { results: [], totalResults: 0 };
  const config = { regionCodes: [draft.filters.watchRegion], mediaChoice: draft.mediaMode };
  const results = q.trim() ? searchStreamingProviders(streaming.providers, q, config) : browseStreamingProviders(streaming.providers, { ...config, mode: STREAMING_PROVIDER_BROWSE_MODES.ALL });
  return { results: results.slice(0, limit), totalResults: results.length };
 }, [streaming, draft.filters.watchRegion, draft.mediaMode]);
 const inputs = (fields) => <div className="discover-field-grid">{fields.map((field) => <DiscoverValueField key={field} field={field} draft={draft} onChange={onChange} errors={errors} />)}</div>;
 return <div className="discover-details">
  {!cataloguesOnly ? <>
  <section className="editor-settings-section"><h3>Ratings and votes</h3><div className="native-threshold-fields">{["voteCountGte", "voteAverageGte", "voteAverageLte"].map((field) => <DiscoverValueField key={field} field={field} draft={draft} onChange={onChange} errors={errors} />)}</div></section>
  <section className="editor-settings-section"><h3>Language and country</h3><div className="discover-field-grid"><DiscoverSelectField field="withOriginalLanguage" draft={draft} onChange={onChange} options={namedCodes?.languages ?? GENRE_LANGUAGE_OPTIONS} errors={errors} /><DiscoverSelectField field="withOriginCountry" draft={draft} onChange={onChange} options={namedCodes?.countries ?? GENRE_COUNTRY_OPTIONS} errors={errors} /></div></section>
  {children}
  <section className="editor-settings-section"><h3>Dates</h3><p className="editor-field-help">{draft.mediaMode === "series" ? "Series first-air dates." : draft.mediaMode === "both" ? "Movie release dates and Series first-air dates." : "Movie primary release dates."}</p>{inputs(["releaseDateGte", "releaseDateLte", "year"])}</section>
  </> : null}
  {draft.extraEditable?.withCompanies === false ? <p className="editor-field-help">Imported Studio settings are preserved.</p> : <DiscoverNamedPicker field="withCompanies" negativeField="withoutCompanies" label="Studios" draft={draft} onChange={onChange} search={studioSearch} browse errors={errors} {...panelProps} />}
  {draft.extraEditable?.withNetworks === false ? <p className="editor-field-help">Imported network settings are preserved.</p> : draft.mediaMode !== "movies" || draft.filters.withNetworks ? <DiscoverNamedPicker field="withNetworks" label="TV Networks" draft={draft} onChange={onChange} search={networkSearch} browse errors={errors} {...panelProps} helper={(draft.mediaMode === "both" ? "Networks apply to Series only. Movies have no network restriction. " : "") + "Match any needs at least one included TV network; Match all requires every included network."} /> : null}
  {draft.extraEditable?.withoutWatchProviders === false ? <p className="editor-field-help">Imported provider settings are preserved.</p> : <section className="editor-settings-section discover-providers"><h3>Watch providers and region</h3>
   {streamingError ? <DiscoverNotice error>{streamingError} <button className="secondary-action" type="button" onClick={loadStreaming}>Retry</button></DiscoverNotice> : null}
   {fixedProviderContext ? <p className="editor-field-help">{fixedProviderContext}</p> : <DiscoverSelectField field="watchRegion" draft={draft} onChange={onChange} options={streaming?.regions ?? namedCodes?.countries ?? GENRE_COUNTRY_OPTIONS} errors={errors} helper="Provider availability is checked in this region, not where a title was produced." />}
   {loading ? <p role="status">Loading providers…</p> : null}
   <>
    {draft.filters.watchRegion || draft.filters.withWatchProviders || draft.filters.withoutWatchProviders ? <DiscoverNamedPicker available={Boolean(streaming && draft.filters.watchRegion)} field="withWatchProviders" negativeField="withoutWatchProviders" exclusionOnly={Boolean(fixedProviderContext)} label={fixedProviderContext ? "Excluded providers" : "Streaming providers"} draft={draft} onChange={onChange} search={providerSearch} browse errors={errors} {...panelProps} /> : <p>Choose a watch region to browse providers.</p>}
    {draft.providerContextReview && invalidProviders.length ? <DiscoverNotice>These saved choices are unavailable in this catalogue for the new region or media: {invalidProviders.map(({ field, id }) => discoverSelectionLabel(draft, field, id)).join(", ")}. They have been retained.
     <div className="discover-topic-actions"><button className="secondary-action" type="button" onClick={() => {
      let next = draft; for (const { field, id } of invalidProviders) next = setDiscoverSelection(next, field, { id, name: discoverSelectionLabel(draft, field, id) }, { remove: true });
      if (!fixedProviderContext && !next.filters.withWatchProviders && !next.filters.withoutWatchProviders) { const filters = { ...next.filters }; delete filters.watchRegion; next = { ...next, filters }; }
      onChange({ ...next, providerContextReview: false });
     }}>Remove unavailable choices</button><button className="secondary-action" type="button" onClick={() => onChange({ ...draft, providerContextReview: false })}>Keep these saved choices</button></div>
    </DiscoverNotice> : null}
    <p className="editor-field-help">Includes subscription, free, ads, rent and buy. JustWatch via TMDB.</p>
   </>
  </section>}
 </div>;
}
