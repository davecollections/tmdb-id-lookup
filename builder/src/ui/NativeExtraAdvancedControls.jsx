import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { DiscoverDetailedControls, DiscoverGenreControls, DiscoverKeywordControls, DiscoverNotice, DiscoverSelectField } from "./AdvancedDiscoverControls.jsx";
import { DiscoverValueField } from "./DiscoverValueField.jsx";
import { GenreContextCatalogueSubview } from "./GenreCatalogueSelector.jsx";
import { NestedPreviewDialog } from "./NestedPreviewDialog.jsx";
import { focusElementWithoutScroll } from "./hierarchy-menu-placement.js";
import { discoverExpressionIds, deriveAdvancedDiscoverFilters } from "../source-add/advanced-discover.js";
import { GENRE_LANGUAGE_OPTIONS, GENRE_COUNTRY_OPTIONS } from "../source-add/genre-advanced.js";
import { loadDiscoverNamedCodes } from "../source-add/discover-codes.js";
import { keywordCatalogueClient } from "../source-add/keyword-catalogue-client.js";
import { discoverFilterRows } from "../source-add/discover-selection-labels.js";
import { NATIVE_EXTRA_FIELDS, NATIVE_GENRE_FIELDS, customizeNativeGenres, resolveNativeGenreFilters, useDefaultNativeGenres, validateNativeAdvancedDraft } from "../source-add/native-shared-advanced.js";
import "./native-shared-advanced.css";
import { createStudioCatalogueProvider } from "../source-add/studio-catalogue.js";
import { createNetworkCatalogueProvider } from "../source-add/network-catalogue.js";
import { createStreamingCatalogueProvider } from "../source-add/streaming-catalogue.js";

const genresOnly = (filters) => Object.fromEntries(NATIVE_GENRE_FIELDS.filter((field) => Object.hasOwn(filters, field) && filters[field] !== "" && filters[field] != null).map((field) => [field, filters[field]]));
function genreSummary(draft, filters = draft.filters) {
 return discoverFilterRows({ ...draft, filters: genresOnly(filters) }).map((row) => row.value).join("; ") || "No genre restriction";
}
function compactGenreSummary(filters) {
 const included = discoverExpressionIds(filters.withGenres).length, excluded = discoverExpressionIds(filters.withoutGenres).length;
 return included || excluded ? included + " included · " + excluded + " excluded" : "No genre restriction";
}
export function NativeExtraSummary({ filters, mediaMode = "movies", labels = {}, genreOverrides = {}, entities = [] }) {
 const draft = { filters, mediaMode, labels };
 const extra = Object.fromEntries(Object.entries(filters).filter(([field]) => NATIVE_EXTRA_FIELDS.includes(field)));
 const custom = entities.filter((entity) => Object.hasOwn(genreOverrides, entity.id));
 const notices = (values) => mediaMode === "both" ? [...new Set(["MOVIE", "TV"].flatMap((media) => deriveAdvancedDiscoverFilters({ ...draft, filters: genresOnly(values) }, media).information.map((entry) => entry.message)))] : [];
 return <div className="native-advanced-summary">
  {discoverFilterRows({ ...draft, filters: extra }).map((row) => <p className="editor-field-help" key={row.label}>{row.label === "Genres" && entities.length > 1 ? "Shared genres" : row.label}: {row.value}</p>)}
  {entities.length > 1 && !Object.keys(genresOnly(filters)).length ? <p className="editor-field-help">Shared genres: No genre restriction</p> : null}
  {custom.length > 0 ? entities.filter((entity) => !Object.hasOwn(genreOverrides, entity.id)).map((entity) => <p className="editor-field-help" key={entity.id}>{entity.name} · Using default</p>) : null}
  {notices(filters).map((message) => <p className="editor-field-help" key={message}>{message}</p>)}
  {custom.map((entity) => <div key={entity.id}><p className="editor-field-help">{entity.name} · Custom: {genreSummary(draft, genreOverrides[entity.id])}</p>{notices(genreOverrides[entity.id]).map((message) => <p className="editor-field-help" key={message}>{message}</p>)}</div>)}
 </div>;
}

// Native composition: the catalogues, controls and context navigation remain shared
// with Discover and Decades; only the ephemeral default/override adapter is new.
export function NativeExtraAdvancedControls({ draft, onChange, entities = [], expanded, thresholds = false, dateControls = true, genreControls, catalogueControls = false, fixedProviderContext = null }) {
 const root = useRef(null), returnTarget = useRef(null), latest = useRef({ draft, onChange });
 latest.current = { draft, onChange };
 const client = useMemo(() => keywordCatalogueClient(), []);
 const studioProvider = useMemo(() => createStudioCatalogueProvider(), []);
 const networkProvider = useMemo(() => createNetworkCatalogueProvider(), []);
 const streamingProvider = useMemo(() => createStreamingCatalogueProvider(), []);
 const [codes, setCodes] = useState(null), [catalogue, setCatalogue] = useState({ status: "idle" });
 const [panel, setPanel] = useState(null), [context, setContext] = useState("default"), [genreUi, setGenreUi] = useState({});
 const [attempt, setAttempt] = useState(0);
 const titleId = useId();
 const mediaMode = draft.mediaMode ?? (draft.mediaType === "TV" ? "series" : "movies");
 const value = { ...draft, mediaMode, labels: draft.labels ?? {} };
 const errors = catalogueControls ? (mediaMode === "both" ? ["MOVIE", "TV"] : [mediaMode === "series" ? "TV" : "MOVIE"]).flatMap((media) => deriveAdvancedDiscoverFilters(value, media).errors) : validateNativeAdvancedDraft(value.filters, mediaMode).errors;
 const allowed = (field) => draft.extraEditable?.[field] !== false;
 const preserved = (label) => <p className="editor-field-help">These imported {label} settings cannot be edited here. Their original values will be preserved.</p>;
 useEffect(() => {
  if (!expanded) return;
  let alive = true;
  loadDiscoverNamedCodes().then((result) => { if (alive) setCodes(result); }).catch(() => {});
  setCatalogue({ status: "loading" });
  client.load(attempt > 0).then(async (data) => {
   if (!alive) return;
   setCatalogue({ status: "ready", ...data });
   const fields = ["withKeywords", "withoutKeywords"];
   const ids = fields.flatMap((field) => discoverExpressionIds(latest.current.draft.filters[field]));
   if (!ids.length) return;
   const rows = await client.resolve(ids);
   if (!alive) return;
   const current = latest.current.draft, labels = { ...current.labels };
   for (const field of fields) for (const row of rows) if (discoverExpressionIds(current.filters[field]).includes(row.id)) labels[field + ":" + row.id] = row.name ?? "Unavailable saved keyword " + row.id;
   latest.current.onChange({ ...current, labels });
  }).catch((error) => { if (alive) setCatalogue({ status: "error", error: error.message }); });
  return () => { alive = false; };
 }, [expanded, attempt, client]);
 useLayoutEffect(() => {
  if (!panel) return;
  const parent = root.current?.closest('[role="dialog"]');
  const wasInert = parent?.inert, wasHidden = parent?.getAttribute("aria-hidden");
  if (parent) { parent.inert = true; parent.setAttribute("aria-hidden", "true"); }
  return () => {
   if (parent) { parent.inert = wasInert; if (wasHidden === null) parent.removeAttribute("aria-hidden"); else parent.setAttribute("aria-hidden", wasHidden); }
   focusElementWithoutScroll(returnTarget.current);
  };
 }, [panel]);
 function openPanel(name, trigger) { returnTarget.current = trigger; setPanel(name); }
 const contexts = [{ id: "default", label: "Shared genres", summary: compactGenreSummary(value.filters) }, ...entities.map((entity) => ({ id: String(entity.id), label: entity.name, summary: Object.hasOwn(draft.genreOverrides ?? {}, entity.id) ? "Custom" : "Using default" }))];
 const customCount = entities.filter((entity) => Object.hasOwn(draft.genreOverrides ?? {}, entity.id)).length;
 const activeContext = contexts.some((entry) => entry.id === context) ? context : "default";
 const singleId = entities.length === 1 ? String(entities[0].id) : null;
 const activeId = entities.length > 1 ? activeContext : singleId ?? "default";
 const custom = Object.hasOwn(draft.genreOverrides ?? {}, activeId);
 const effective = resolveNativeGenreFilters(value.filters, draft.genreOverrides, activeId).filters;
 const expression = effective.withGenres ?? "";
 const operator = expression.includes(",") ? "," : expression.includes("|") ? "|" : genreUi[activeId]?.operators?.withGenres ?? (custom ? "|" : value.operators?.withGenres);
 const genreDraft = { ...value, filters: effective, operators: { ...value.operators, withGenres: operator }, pickerModes: { ...value.pickerModes, withGenres: genreUi[activeId]?.pickerModes?.withGenres ?? (custom ? "include" : value.pickerModes?.withGenres) } };
 function resetGenreContext(useDefault = false) {
  setGenreUi((current) => { const next = { ...current }; delete next[activeContext]; return next; });
  onChange({ ...value, genreOverrides: useDefault ? useDefaultNativeGenres(draft.genreOverrides, activeContext) : customizeNativeGenres(draft.genreOverrides, activeContext) });
 }
 function changeGenres(next) {
  setGenreUi((current) => ({ ...current, [activeId]: { operators: next.operators, pickerModes: next.pickerModes } }));
  if (activeId !== "default" && (custom || entities.length > 1)) onChange({ ...value, genreOverrides: { ...draft.genreOverrides, [activeId]: genresOnly(next.filters) } });
  else onChange({ ...next, filters: { ...value.filters, ...genresOnly(next.filters), ...Object.fromEntries(NATIVE_GENRE_FIELDS.filter((field) => !Object.hasOwn(next.filters, field)).map((field) => [field, ""])) } });
 }
 const controls = <DiscoverGenreControls draft={genreDraft} onChange={changeGenres} errors={validateNativeAdvancedDraft(effective, mediaMode).errors} />;
 return <div ref={root} className="native-extra-advanced discover-dialog">
  {thresholds ? <div className="native-threshold-fields">{["voteCountGte", "voteAverageGte", "voteAverageLte"].map((field) => allowed(field) ? <DiscoverValueField key={field} field={field} draft={value} onChange={onChange} errors={errors} /> : <div key={field}>{preserved("rating/vote")}</div>)}</div> : null}
  <div className="discover-field-grid">{[["withOriginalLanguage", codes?.languages ?? GENRE_LANGUAGE_OPTIONS], ["withOriginCountry", codes?.countries ?? GENRE_COUNTRY_OPTIONS]].map(([field, options]) => allowed(field) ? <DiscoverSelectField key={field} field={field} options={options} draft={value} onChange={onChange} errors={errors} /> : <div key={field}>{preserved(field === "withOriginalLanguage" ? "language" : "country")}</div>)}</div>
  {genreControls !== undefined ? genreControls : allowed("withGenres") ? entities.length > 1 ? <section className="editor-settings-section"><h3>Genres</h3><p className="editor-field-help">Shared genres: {compactGenreSummary(value.filters)}</p><p className="editor-field-help">{customCount} custom · {entities.length - customCount} using default</p><button type="button" className="secondary-action" aria-haspopup="dialog" onClick={(e) => openPanel("genres", e.currentTarget)}>Configure genres</button></section> : controls : preserved("genre")}
  {allowed("withKeywords") ? <><DiscoverKeywordControls panelClassName="native-shared-picker" draft={value} onChange={onChange} errors={errors} keywordClient={client} catalogueReady={catalogue.status === "ready"} activePanel={panel} onOpenPanel={openPanel} onClosePanel={() => setPanel(null)} />
   {catalogue.status === "error" ? <DiscoverNotice error>{catalogue.error} <button className="secondary-action" type="button" onClick={() => setAttempt((value) => value + 1)}>Retry keyword names</button></DiscoverNotice> : null}
  </> : preserved("keyword")}
  {dateControls ? allowed("year") ? <section className="editor-settings-section"><h3>Dates</h3><p className="editor-field-help">{mediaMode === "both" ? "Movie release dates/year and Series first-air dates/year." : mediaMode === "series" ? "Series first-air dates and year." : "Movie release dates and year."} Year must overlap the date range.</p><div className="discover-field-grid">{["releaseDateGte", "releaseDateLte", "year"].map((field) => <DiscoverValueField key={field} field={field} draft={value} onChange={onChange} errors={errors} />)}</div></section> : preserved("date/year") : null}
  {catalogueControls ? <DiscoverDetailedControls draft={value} onChange={onChange} studioProvider={studioProvider} networkProvider={networkProvider} streamingProvider={streamingProvider} namedCodes={codes} errors={errors} cataloguesOnly fixedProviderContext={fixedProviderContext} activePanel={panel} onOpenPanel={openPanel} onClosePanel={() => setPanel(null)} panelClassName="native-shared-picker" /> : null}
  {panel === "genres" ? <NestedPreviewDialog ariaLabelledBy={titleId} onClose={() => setPanel(null)} dialogClassName="add-source-dialog discover-dialog native-genre-dialog">
   <GenreContextCatalogueSubview contexts={contexts} activeContextId={activeContext} onContextChange={setContext} title="Genre rules" titleId={titleId} contextTitle="Shared genres and selected entities" detailTitle={(entry) => entry.label} backLabel="Contexts" guidance="Choose shared genres, then customise individual entities when needed." emptyTitle="Choose a context" emptyText="Select Shared genres or an entity." onDone={() => setPanel(null)}>
    {activeContext !== "default" ? <div className="native-genre-inheritance"><div><p className="editor-field-help">{custom ? "Custom" : "Using default"}</p>{!custom ? <p className="editor-field-help">Click customise to make changes specific to {contexts.find((entry) => entry.id === activeContext).label}.</p> : null}</div><div className="native-genre-context-actions"><button type="button" className="secondary-action" onClick={() => resetGenreContext(custom)}>{custom ? "Use default" : "Customise genres"}</button>{custom ? <button type="button" className="secondary-action" onClick={() => resetGenreContext()}>Clear selections</button> : null}</div></div> : null}
    {custom && !Object.keys(genresOnly(effective)).length ? <p className="editor-field-help">No genre restriction</p> : null}
    {activeContext === "default" || custom ? controls : null}
   </GenreContextCatalogueSubview>
  </NestedPreviewDialog> : null}
 </div>;
}
