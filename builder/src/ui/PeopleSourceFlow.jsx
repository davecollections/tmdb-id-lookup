import {
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import {
	buildPeopleHierarchyFolderEditable,
	buildPeopleSourceDrafts,
	buildPeopleTitlePreview,
	buildTmdbProfileUrl,
	applyPeopleManifestAuthority,
	createAsyncRequestCoordinator,
	createPeopleConfiguration,
	createPeopleHierarchyPlan,
	createPeopleSelectionState,
	createSourceSubmissionGate,
	DEFAULT_PEOPLE_FOLDER_TITLE_VISIBILITY,
	DEFAULT_PEOPLE_SOURCE_SORT_OPTION_ID,
	INITIAL_ASYNC_REQUEST_STATE,
	inspectPeopleSourceDuplicates,
	isPromotablePeopleFolder,
	parseTmdbPersonInput,
	PEOPLE_CONFIGURATION_MODES,
	PEOPLE_PLACEMENT_STATUSES,
	PEOPLE_SOURCE_COMBINATIONS,
	PEOPLE_SOURCE_SORT_OPTIONS,
	PEOPLE_SOURCE_MODE,
	peopleDuplicateOverrideIdentity,
	peoplePreviewMediaTypes,
	peoplePromotionTileShape,
	peopleSelectionNotice,
	peopleTitlePreviewLimit,
	removeSelectedPerson,
	resolvePeopleConfigurationForMode,
	resolvePersonFolderArtwork,
	selectedPeople,
	toggleSelectedPerson,
	updatePeopleConfiguration,
	validatePeopleCombinationSelection,
} from "../source-add/index.js";
import { HierarchyCollectionPresentationControls } from "./CollectionPresentationChoices.jsx";
import {
	lockAddSourceDocumentBody,
	observeAddSourceViewport,
	resolveAddSourceViewportStyle,
} from "./add-source-modal-lifecycle.js";
import { restoreAddSourceSearchView } from "./add-source-navigation-state.js";
import { focusElementWithoutScroll } from "./hierarchy-menu-placement.js";
import { PosterOnlyPreviewGrid } from "./PosterOnlyPreviewGrid.jsx";
import { handleDialogKeyDown } from "./modal-focus.js";
import { TmdbEntityLink } from "./TmdbEntityLink.jsx";
import { FolderShapeChoices, PresentationSwitch, TitleOptions } from "./PresentationControls.jsx";
import { RemovableSelectionSummary } from "./RemovableSelectionSummary.jsx";
import { SemanticSortChoices } from "./SemanticSortChoices.jsx";
import { SourceElsewhereNotice } from "./SourceElsewhereNotice.jsx";
import {
	completePeopleSearchRestore,
	createPeopleSourceNavigationState,
	enterPeopleConfigure,
	enterPeopleReview,
	PEOPLE_SOURCE_STEPS,
	returnPeopleToConfigure,
	returnPeopleToSearch,
} from "./people-source-navigation-state.js";

export const PEOPLE_SEARCH_DEBOUNCE_MS = 300;
export { PEOPLE_SOURCE_STEPS };

const usePrePaintLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function errorMessage(error, fallback) {
	return error?.message || fallback;
}

function detailEntry(status, person = null, error = null, checkedAt = null) {
	return Object.freeze({ status, person, error, checkedAt });
}

function sourceCount(person, countKey, loading) {
	if (loading) return { text: "Checking…", compactText: "…", state: "loading" };
	const count = person?.counts?.[countKey];
	if (Number.isSafeInteger(count) && count > 0) return { text: `${count} title${count === 1 ? "" : "s"}`, compactText: String(count), state: "ready" };
	if (count === 0) return { text: "No titles found", compactText: "0", state: "zero" };
	return { text: "Count unavailable", compactText: "—", state: "unavailable" };
}

export function requestSelectedPersonDetails({ coordinator, provider, result, bypassCache = false }) {
	const current = coordinator.getState();
	if (current.status === "loading" && current.context?.id === result.id) {
		return { accepted: false, repeated: true, requestId: current.requestId, result: null, state: current };
	}
	return coordinator.run(
		({ signal }) => provider.getPerson(result.id, { signal, bypassCache }),
		{ id: result.id },
	);
}

export async function activateFolderPersonResult({
	result,
	beginDetailsRequest,
	loadDetails,
	getScrollTop,
	onStart,
	isCurrent,
	onSettled,
	onFailure,
	onSuccess,
}) {
	const detailsRequest = beginDetailsRequest(result);
	if (detailsRequest?.repeated) return { ok: false, repeated: true };
	const scrollTop = getScrollTop();
	const activationToken = Symbol(`quick-${result.id}`);
	onStart(result, activationToken);
	const detailResult = await loadDetails(result, { detailsRequest });
	if (!isCurrent(activationToken)) return { ok: false, stale: true };
	onSettled(result);
	if (!detailResult.ok) {
		if (!detailResult.stale && !detailResult.repeated) onFailure(result, detailResult.error);
		return detailResult;
	}
	onSuccess(detailResult.person, scrollTop);
	return detailResult;
}

function PersonProfile({ person, className, loading = "lazy" }) {
	const source = buildTmdbProfileUrl(person.profilePath, "w185");
	const [failed, setFailed] = useState(false);
	useEffect(() => setFailed(false), [source]);
	const message = failed ? "Image unavailable" : "No profile image";
	const accessible = failed
		? `Profile image unavailable for ${person.name}`
		: `No profile image available for ${person.name}`;
	return (
		<span className={`${className}-frame`} data-profile-state={failed ? "error" : source ? "ready" : "missing"}>
			{source && !failed ? (
				<img
					className={className}
					src={source}
					alt={`${person.name} profile photo`}
					loading={loading}
					onError={() => setFailed(true)}
				/>
			) : (
				<span className={`${className}-placeholder`}>
					<span aria-hidden="true">👤</span>
					<small aria-hidden="true">{message}</small>
					<span className="visually-hidden">{accessible}</span>
				</span>
			)}
		</span>
	);
}

function KnownForRows({ rows }) {
	if (!Array.isArray(rows) || rows.length === 0) {
		return null;
	}
	return (
		<span className="people-known-for">
			{rows.slice(0, 3).map((row, index) => (
				<span className="people-known-for-row" key={`${row.mediaType}-${row.title}-${index}`}>
					<span className="people-known-for-title">{row.title}</span>
					<small>{row.mediaType === "MOVIE" ? "Movie" : "Series"}{row.year ? ` · ${row.year}` : ""}</small>
				</span>
			))}
		</span>
	);
}

function PersonResult({ result, context, checked, disabled, loading, onActivate }) {
	const body = (
		<>
			<PersonProfile person={result} className="people-result-profile" />
			<span className="add-source-result-content">
				<span className="add-source-result-heading"><strong>{result.name}</strong><span>TMDB {result.id}</span></span>
				<span className="people-result-department">Known for {result.knownForDepartment || "an unavailable department"}</span>
				{loading ? <span className="add-source-result-loading">Loading details and title counts…</span> : <KnownForRows rows={result.knownFor} />}
			</span>
		</>
	);
	if (context === "folder") {
		return (
			<button className={`add-source-result people-result${loading ? " is-loading" : ""}`} type="button" data-tmdb-person-result={result.id} disabled={disabled || loading} aria-busy={loading || undefined} onClick={() => onActivate(result)}>
				{body}
			</button>
		);
	}
	return (
		<label className={`add-source-result people-result people-result-selectable${checked ? " is-selected" : ""}`} data-tmdb-person-result={result.id}>
			<input className="visually-hidden selectable-card-checkbox" type="checkbox" checked={checked} disabled={disabled && !checked} onChange={() => onActivate(result)} />
			<span className="selectable-card-indicator" data-selection-indicator="true" data-selection-state={checked ? "selected" : "unselected"} aria-hidden="true">{checked ? "✓" : ""}</span>
			{body}
		</label>
	);
}

export function PeopleSearchStep({
	context,
	headingRef = null,
	input,
	inputRef,
	parsedInput,
	lookupState,
	searchData,
	selection,
	loadingPersonId,
	selectionError,
	onInputChange,
	onRetryLookup,
	onActivateResult,
	onChangePage,
	onRemoveSelected,
}) {
	const people = selectedPeople(selection);
	const notice = peopleSelectionNotice(selection);
	return (
		<>
			<section className="add-source-mode" aria-labelledby="people-mode-title">
				<div>
					<h3 ref={headingRef} id="people-mode-title" tabIndex={-1}>People · TMDB</h3>
					<p>{context === "folder" ? "Choose a person, then add their sources to this folder." : "Choose people in the order their folders should be created."}</p>
				</div>
			</section>
			<div className="editor-field add-source-query-field">
				<label htmlFor="people-source-query">Search or enter an exact person</label>
				<input ref={inputRef} id="people-source-query" type="search" value={input} autoComplete="off" spellCheck="false" aria-invalid={parsedInput.kind === "invalid" ? "true" : undefined} aria-describedby="people-source-query-help people-source-query-status" onChange={onInputChange} />
				<p className="editor-field-help" id="people-source-query-help">Search by name, TMDB ID or paste a TMDB person link.</p>
				<p id="people-source-query-status" className={parsedInput.kind === "invalid" ? "editor-field-error" : "editor-field-status"} role={parsedInput.kind === "invalid" ? "alert" : "status"}>
					{parsedInput.kind === "invalid" ? parsedInput.message : parsedInput.kind === "search" && !parsedInput.eligible ? parsedInput.message : lookupState.status === "loading" ? "Searching TMDB people…" : null}
				</p>
			</div>
			{context !== "folder" && people.length ? (
				<section className="people-selected-tray" aria-label={`${people.length} people selected`}>
					<div className="people-selected-summary"><strong>{people.length} {people.length === 1 ? "person" : "people"} selected</strong><RemovableSelectionSummary items={people.map((person) => ({ id: person.id, label: person.name, detail: `TMDB ${person.id}` }))} onRemove={onRemoveSelected} ariaLabel="Selected people" disclosureLabel="View selected people" alwaysDisclose showDisclosureCount={false} /></div>
					{notice.visible ? <p className="people-selection-limit" data-large-selection-notice="true" role="status">You’ve selected {notice.count} people. The next steps contain more people to configure and review, so they may take a little longer.</p> : null}
				</section>
			) : null}
			{lookupState.status === "error" ? <div className="add-source-request-state" role="alert"><p>{errorMessage(lookupState.error, "TMDB could not complete this request.")}</p>{lookupState.error?.retryable ? <button type="button" onClick={onRetryLookup}>Retry</button> : null}</div> : null}
			{selectionError ? <div className="add-source-request-state" role="alert" tabIndex={-1}><p>{errorMessage(selectionError, "That person’s details could not be loaded.")}</p><p>Try selecting the person again.</p></div> : null}
			{searchData ? (
				<section className="add-source-results" aria-labelledby="people-results-title">
					<div className="add-source-section-heading"><div><p className="panel-kicker">TMDB results</p><h3 id="people-results-title">{context === "folder" ? "Choose a person" : "Select people"}</h3></div>{searchData.totalPages > 1 ? <span>Page {searchData.page} of {searchData.totalPages}</span> : null}</div>
					{searchData.results.length ? (
						<div className="add-source-result-list">{searchData.results.map((result) => {
							const checked = Boolean(selection.byId[result.id]);
							return <PersonResult key={result.id} result={result} context={context} checked={checked} disabled={context === "folder" ? loadingPersonId !== null : false} loading={loadingPersonId === result.id} onActivate={onActivateResult} />;
						})}</div>
					) : <p className="add-source-empty-results">No TMDB people matched this search.</p>}
					{searchData.totalPages > 1 ? <nav className="add-source-pagination" aria-label="People search result pages"><button type="button" disabled={searchData.page <= 1} onClick={() => onChangePage(searchData.page - 1)}>Previous page</button><button type="button" disabled={searchData.page >= searchData.totalPages} onClick={() => onChangePage(searchData.page + 1)}>Next page</button></nav> : null}
				</section>
			) : null}
		</>
	);
}

function CombinationControls({ person, configuration, loading, onToggle, compact = false, pills = false, showCounts = true, legend = "Sources to add", hideLegend = false }) {
	const validation = validatePeopleCombinationSelection(configuration?.combinations);
	return (
		<fieldset className={`people-combination-group${compact ? " is-compact" : ""}${pills ? " is-pills" : ""}`}>
			<legend className={hideLegend ? "visually-hidden" : undefined}>{legend}</legend>
			<div>
				{PEOPLE_SOURCE_COMBINATIONS.map((combination) => {
					const count = sourceCount(person, combination.countKey, loading);
					const selected = configuration?.combinations.includes(combination.id) ?? false;
					if (pills) return (
						<label className="people-source-pill" data-people-role={combination.role} data-count-state={count.state} key={combination.id}>
							<input type="checkbox" checked={selected} disabled={loading} aria-label={`${combination.label}, ${count.text}`} onChange={() => onToggle(combination.id)} />
							<span className="people-source-pill-check" aria-hidden="true">✓</span>
							<strong>{combination.label}</strong>
							{showCounts ? <em aria-hidden="true">{count.compactText}</em> : null}
						</label>
					);
					return (
						<label key={combination.id} data-count-state={count.state}>
							<input className="visually-hidden selectable-card-checkbox" type="checkbox" checked={selected} disabled={loading} onChange={() => onToggle(combination.id)} />
							<span className="selectable-card-indicator" data-selection-indicator="true" data-selection-state={selected ? "selected" : "unselected"} aria-hidden="true">{selected ? "✓" : ""}</span>
							<span><strong>{combination.label}</strong>{compact ? null : <small>{combination.role === "directing" ? "Directing" : "Acting"} · {combination.media === "series" ? "Series" : "Movies"}</small>}</span>
							{showCounts ? <em>{count.text}</em> : null}
						</label>
					);
				})}
			</div>
			{!validation.ok && !loading ? <p className="editor-field-error" role="alert">Choose at least one source to add.</p> : null}
		</fieldset>
	);
}

function AppliedArtworkPreview({ person, artworkState, onRetry }) {
	const tileShape = artworkState?.artwork?.tileShape ?? artworkState?.tileShape ?? "POSTER";
	if (artworkState?.status === "loading" || !artworkState) {
		return <div className="people-applied-artwork is-loading" data-artwork-tile-shape={tileShape} role="status"><span className="people-artwork-skeleton" aria-hidden="true" /><small>Preparing artwork…</small></div>;
	}
	if (artworkState.status === "error") {
		return <div className="people-applied-artwork is-error" data-artwork-tile-shape={tileShape} role="alert"><span className="people-artwork-emoji" aria-hidden="true">👤</span><small>Artwork unavailable</small><button type="button" onClick={onRetry}>Retry</button></div>;
	}
	const artwork = artworkState.artwork;
	const label = artwork.source === "manifest"
		? "Canonical People artwork"
		: artwork.source === "tmdb"
			? "TMDB image"
			: "No folder artwork available";
	return (
		<div className="people-applied-artwork" data-artwork-person-id={person.id} data-artwork-source={artwork.source} data-artwork-tile-shape={tileShape}>
			{artwork.previewUrl ? <img src={artwork.previewUrl} alt={`${label} for ${person.name}`} /> : <span className="people-artwork-emoji" aria-hidden="true">👤</span>}
			<small>{label}</small>
		</div>
	);
}

export function PeopleConfigurationCard({
	personResult,
	detail,
	configuration,
	artworkState,
	showArtwork,
	onToggle,
	onRefresh,
	onRetry,
	onRetryArtwork,
	onRemove,
}) {
	const person = detail?.person ?? personResult;
	const loading = detail?.status === "loading";
	return (
		<article className="people-configuration-card" data-person-id={person.id}>
			<header className="tmdb-review-identity">
				{showArtwork
					? <AppliedArtworkPreview person={person} artworkState={artworkState} onRetry={onRetryArtwork} />
					: <PersonProfile person={person} className="people-selected-profile" loading="eager" />}
				<div className="people-configuration-heading tmdb-review-identity-copy">
					<h3>{person.name}</h3>
					<div className="people-configuration-meta">
						<span>Known for {person.knownForDepartment || "an unavailable department"}</span>
					</div>
				</div>
				<div className="tmdb-review-identity-actions">
					<TmdbEntityLink entityType="person" tmdbId={person.id} entityName={person.name} />
					{onRemove ? <button type="button" className="people-remove-person" aria-label={`Remove ${person.name}`} onClick={onRemove}>Remove</button> : null}
				</div>
			</header>
			{detail?.status === "error" ? (
				<div className="add-source-request-state" role="alert"><p>{errorMessage(detail.error, `Could not load ${person.name}.`)}</p><div><button type="button" onClick={onRetry}>Retry</button>{onRemove ? <button type="button" onClick={onRemove}>Remove</button> : null}</div></div>
			) : (
				<>
					<CombinationControls person={detail?.person} configuration={configuration} loading={loading} onToggle={onToggle} />
					{detail?.status === "ready" ? <button type="button" className="people-refresh-counts" onClick={onRefresh}>Refresh title counts</button> : null}
				</>
			)}
		</article>
	);
}

const peopleConfigurationModeOptions = Object.freeze([
	Object.freeze({ id: PEOPLE_CONFIGURATION_MODES.AUTOMATIC, label: "Automatic", description: "Use each person’s available Acting and Directing evidence." }),
	Object.freeze({ id: PEOPLE_CONFIGURATION_MODES.SHARED, label: "Same for all", description: "Apply one source combination to every selected person." }),
]);

function peopleDepartmentLabel(person) {
	if (Array.isArray(person?.categoryMembership) && person.categoryMembership.length > 0) {
		return person.categoryMembership.map((entry) => entry === "actor" ? "Acting" : entry === "director" ? "Directing" : entry).join(" · ");
	}
	return `Known for ${person?.knownForDepartment || "an unavailable department"}`;
}

function CompactPersonArtwork({ person, artworkState }) {
	const source = artworkState?.status === "ready" ? artworkState.artwork?.previewUrl : buildTmdbProfileUrl(person.profilePath, "w185");
	const [failed, setFailed] = useState(false);
	useEffect(() => setFailed(false), [source]);
	return (
		<span className="people-bulk-profile-frame" data-profile-state={failed ? "error" : source ? "ready" : "missing"}>
			{source && !failed
				? <img className="people-bulk-profile" src={source} alt={`${person.name} poster`} loading="lazy" onError={() => setFailed(true)} />
				: <span className="people-bulk-profile-placeholder" aria-hidden="true">👤</span>}
		</span>
	);
}

export function PeopleConfigurationModeControls({ mode, sharedCombinations, onModeChange, onToggleShared }) {
	return (
		<section className="people-bulk-controls" aria-labelledby="people-configuration-approach-title">
			<fieldset className="people-configuration-mode">
				<legend id="people-configuration-approach-title">Configuration approach</legend>
				<div>
					{peopleConfigurationModeOptions.map((option) => (
						<label key={option.id}>
							<input type="radio" name="people-configuration-mode" value={option.id} checked={mode === option.id} onChange={() => onModeChange(option.id)} />
							<span><strong>{option.label}</strong><small>{option.description}</small></span>
						</label>
					))}
				</div>
			</fieldset>
			{mode === PEOPLE_CONFIGURATION_MODES.SHARED ? <CombinationControls configuration={{ combinations: sharedCombinations }} loading={false} onToggle={onToggleShared} compact pills showCounts={false} legend="Sources for every selected person" /> : null}
		</section>
	);
}

function peoplePreviewMediaLabel(mediaType) {
	return mediaType === "TV" ? "Series" : "Movies";
}

export function PeopleTitlePreviewSurface({ person, state, items, limit, mediaTypes = ["MOVIE"], totalResults = items.length, onChangeMedia = () => {}, onClose, onRetry }) {
	const headingRef = useRef(null);
	const dialogRef = useRef(null);
	const activeMediaType = state.mediaType ?? mediaTypes[0] ?? "MOVIE";
	const activeLabel = peoplePreviewMediaLabel(activeMediaType);
	useEffect(() => {
		focusElementWithoutScroll(headingRef.current);
	}, [person.id]);
	const content = (
		<div className="people-title-preview-backdrop nested-modal-backdrop" data-nested-modal-backdrop="true" data-people-title-preview-backdrop="true" onMouseDown={(event) => {
			if (event.target === event.currentTarget) {
				event.preventDefault();
				focusElementWithoutScroll(dialogRef.current);
			}
		}}>
		<section ref={dialogRef} className="people-title-preview" data-preview-surface="modal" data-preview-status={state.status} data-preview-limit={limit} role="dialog" aria-modal="true" aria-labelledby={`people-title-preview-${person.id}`} tabIndex={-1} onKeyDown={(event) => {
			event.stopPropagation();
			handleDialogKeyDown(event, dialogRef.current, onClose);
		}}>
			<header><div><strong id={`people-title-preview-${person.id}`} ref={headingRef} tabIndex={-1}>Title preview</strong><span>{person.name} · {activeLabel.toLowerCase()} poster sample</span></div><button type="button" onClick={onClose}>Close</button></header>
			{mediaTypes.length > 1 ? <div className="studio-preview-tabs people-preview-tabs" role="tablist" aria-label="Preview media">{mediaTypes.map((mediaType) => <button key={mediaType} type="button" role="tab" aria-selected={activeMediaType === mediaType} onClick={() => onChangeMedia(mediaType)}>{peoplePreviewMediaLabel(mediaType)}</button>)}</div> : null}
			<p className="people-title-preview-summary">{activeLabel}{state.status === "ready" ? ` · ${totalResults.toLocaleString("en")}` : ""} · selected Acting and Directing credits are combined and deduplicated for this media.</p>
			{state.status === "loading" ? <p className="people-title-preview-state" role="status">Preparing {activeLabel.toLowerCase()} poster preview…</p> : null}
			{state.status === "error" ? <div className="people-title-preview-state" role="alert"><p>{errorMessage(state.error, "This title preview could not be prepared.")}</p><button type="button" onClick={onRetry}>Retry</button></div> : null}
			{state.status === "ready" ? <PosterOnlyPreviewGrid items={items} limit={limit} size="w185" className="people-title-preview-grid" ariaLabel={`${activeLabel} poster preview`} altPrefix={activeLabel} /> : null}
		</section>
		</div>
	);
	return typeof document === "undefined" ? content : createPortal(content, document.body);
}

export function PeopleBulkConfigurationList({
	entries,
	mode,
	onToggleCombination,
	onRetry,
	onRemove,
	onPreview,
	previewState,
	previewItems,
	previewLimit,
	previewMediaTypes,
	previewTotalResults,
	onChangePreviewMedia,
	onClosePreview,
	onRetryPreview,
}) {
	const previewEntry = previewState ? entries.find((entry) => (entry.person ?? entry.result).id === previewState.personId) ?? null : null;
	return (
		<>
		<div className="people-bulk-list" data-people-bulk-count={entries.length} data-people-configuration-mode={mode}>
			{entries.map((entry, index) => {
				const person = entry.person ?? entry.result;
				const previewOpen = previewState?.personId === person.id;
				return (
					<article className="people-bulk-row" data-person-id={person.id} key={person.id}>
						<header>
							<span className="people-bulk-order" aria-label={`Selection position ${index + 1}`}>{index + 1}</span>
							<CompactPersonArtwork person={person} artworkState={entry.artworkState} />
							<div className="people-bulk-copy"><h4>{person.name}</h4><span>{peopleDepartmentLabel(person)}</span></div>
							<div className="people-bulk-actions">
								<button type="button" aria-haspopup="dialog" aria-expanded={previewOpen} disabled={entry.detail?.status !== "ready" || (entry.configuration?.combinations.length ?? 0) === 0} onClick={(event) => onPreview(entry, event.currentTarget)}>Preview titles</button>
								<button type="button" aria-label={`Remove ${person.name}`} onClick={() => onRemove(person.id)}>Remove</button>
							</div>
						</header>
						<CombinationControls person={entry.person} configuration={entry.configuration} loading={entry.detail?.status !== "ready"} onToggle={(combinationId) => onToggleCombination(person.id, combinationId)} compact pills legend={`${person.name} sources`} hideLegend />
						{entry.detail?.status === "error" ? <div className="add-source-request-state" role="alert"><p>{errorMessage(entry.detail.error, `Could not load ${person.name}.`)}</p><button type="button" onClick={() => onRetry(entry)}>Retry</button></div> : null}
					</article>
				);
			})}
		</div>
		{previewEntry ? <PeopleTitlePreviewSurface person={previewEntry.person ?? previewEntry.result} state={previewState} items={previewItems} limit={previewLimit} mediaTypes={previewMediaTypes} totalResults={previewTotalResults} onChangeMedia={onChangePreviewMedia} onClose={onClosePreview} onRetry={() => onRetryPreview(previewEntry)} /> : null}
		</>
	);
}

const peoplePlacementLabels = Object.freeze({
	[PEOPLE_PLACEMENT_STATUSES.READY]: "Ready to create",
	[PEOPLE_PLACEMENT_STATUSES.ALREADY_IN_COLLECTION]: "Already in this collection",
	[PEOPLE_PLACEMENT_STATUSES.PARTLY_IN_COLLECTION]: "Partly in this collection",
	[PEOPLE_PLACEMENT_STATUSES.EXISTS_ELSEWHERE]: "Exists elsewhere",
});

function inheritedPeopleCollectionSummary(destination) {
	if (!destination) return "Inherited from the selected collection";
	const layout = typeof destination.viewMode === "string" && destination.viewMode.toUpperCase() === "ROWS" ? "Rows" : "Tabs";
	const allTab = typeof destination.showAllTab === "boolean" ? `All tab ${destination.showAllTab ? "on" : "off"}` : "All tab inherited";
	const pin = typeof destination.pinToTop === "boolean" ? (destination.pinToTop ? "pinned" : "not pinned") : "pin inherited";
	return `${layout} · ${allTab} · ${pin}`;
}

export function PeopleFolderAppearance({
	tileShape,
	onTileShapeChange,
}) {
	return (
		<section className="people-folder-appearance" data-people-folder-appearance="true" aria-labelledby="people-folder-appearance-title">
			<div className="people-folder-appearance-heading"><strong id="people-folder-appearance-title">Person folder appearance</strong><span>Applies to every generated folder</span></div>
			<fieldset className="editor-field editor-choice-field people-folder-shape-field">
				<legend>Folder tile shape</legend>
				<p className="editor-field-help">One shape applies to every generated People folder.</p>
				<FolderShapeChoices selectedId={tileShape} name="people-folder-shape" idPrefix="people-folder" posterLabel="Poster (recommended)" onChange={onTileShapeChange} />
			</fieldset>
			<p className="editor-field-help people-folder-artwork-note">Each person’s Hero, Title Logo and Focus artwork will use the canonical People defaults. To customise artwork links later, edit that person’s folder.</p>
		</section>
	);
}

export function PeopleReviewStep({
	planResult,
	entries,
	collectionOptions,
	onCollectionOptionsChange,
	folderTileShape,
	onFolderTileShapeChange,
	folderTitleVisibility,
	onFolderTitleVisibilityChange,
	applyDiagnostic,
	headingRef,
}) {
	if (!planResult?.ok) {
		return (
		<section className="decades-step" aria-labelledby="people-review-error-title">
			<h3 id="people-review-error-title" ref={headingRef} tabIndex={-1}>Review needs attention</h3>
			{planResult?.errors?.length ? <ul className="genre-advanced-errors" role="alert">{planResult.errors.map((entry) => <li key={`${entry.code}-${entry.path}`}>{entry.message}</li>)}</ul> : null}
		</section>
		);
	}
	const { plan } = planResult;
	const elsewhereOccurrences = plan.outcomes.flatMap((outcome) => outcome.occurrences ?? []).filter((occurrence) => (
		plan.destination === null || occurrence.collectionInternalId !== plan.destination.collectionInternalId
	));
	const titleOptions = (
		<TitleOptions
			idPrefix="people"
			collectionTitleVisibility={plan.configuration.scope === "new-collection" ? {
				checked: collectionOptions.hideTitle,
				descriptionId: "people-hide-collection-title-help",
				onChange: (hideTitle) => onCollectionOptionsChange({ ...collectionOptions, hideTitle, title: hideTitle && !collectionOptions.title.trim() ? "People" : collectionOptions.title }),
			} : null}
			folderTitleVisibility={{
				selectedId: folderTitleVisibility,
				name: "people-folder-title-visibility",
				onChange: onFolderTitleVisibilityChange,
			}}
		/>
	);
	return (
		<section className="decades-step decades-review-step people-review-step" aria-labelledby="people-review-title">
			<div className="add-source-section-heading"><div><p className="panel-kicker">Step 3</p><h3 id="people-review-title" ref={headingRef} tabIndex={-1}>Review &amp; Appearance</h3></div></div>
			<div className="decades-plan-totals" data-plan-scope={plan.configuration.scope} aria-label="Plan totals">
				{plan.configuration.scope === "new-collection" ? <div><strong>{plan.counts.collectionCount}</strong><span>Collection</span></div> : null}
				<div><strong>{plan.counts.folderCount}</strong><span>Folder{plan.counts.folderCount === 1 ? "" : "s"}</span></div>
				<div><strong>{plan.counts.sourceCount}</strong><span>Source{plan.counts.sourceCount === 1 ? "" : "s"}</span></div>
			</div>
			{plan.configuration.scope === "new-collection" ? (
				<>
					<div className="decades-collection-names"><div className="editor-field">
						<label htmlFor="people-collection-title">Collection name</label>
						<input id="people-collection-title" type="text" value={collectionOptions.hideTitle ? "" : collectionOptions.title} disabled={collectionOptions.hideTitle} onChange={(event) => onCollectionOptionsChange({ ...collectionOptions, title: event.target.value })} />
						{plan.collections[0].titleCollisions.length > 0 ? <p className="editor-field-help">A collection with this name already exists. The new collection will still be created.</p> : null}
					</div></div>
					{titleOptions}
					<section className="review-layout-options people-review-layout" data-review-layout="true" aria-labelledby="people-review-layout-title">
						<div className="review-presentation-heading"><h4 id="people-review-layout-title">Layout</h4><span>{collectionOptions.viewMode === "ROWS" ? "Rows" : `Tabs · All tab ${collectionOptions.showAllTab ? "on" : "off"}`} · {collectionOptions.pinToTop ? "pinned" : "not pinned"}</span></div>
						<HierarchyCollectionPresentationControls selectedId={collectionOptions.viewMode} name="people-collection-view" showAllTab={collectionOptions.showAllTab} onPresentationChange={(patch) => onCollectionOptionsChange({ ...collectionOptions, ...patch })} showAllDescription="Combine all person folders in an All tab." showAllDescriptionId="people-show-all-help" showAllControlName="peopleShowAllTab" />
						<PresentationSwitch label="Pin collection to top" description="Keep this collection near the top in Nuvio." descriptionId="people-pin-help" controlName="peoplePinToTop" checked={collectionOptions.pinToTop} onChange={(pinToTop) => onCollectionOptionsChange({ ...collectionOptions, pinToTop })} />
					</section>
				</>
			) : (
				<>
					<div className="decades-destination-summary"><strong>Destination</strong><span>{plan.destination.titleHidden ? "Hidden-title collection" : plan.destination.collectionTitle}</span><small>{inheritedPeopleCollectionSummary(plan.destination)} · parent unchanged</small></div>
					{titleOptions}
					<div className="decades-inherited-presentation" data-people-inherited-presentation="true"><strong>Inherited Collection options</strong><span>{inheritedPeopleCollectionSummary(plan.destination)}</span><small>The parent collection is not changed.</small></div>
				</>
			)}
			<PeopleFolderAppearance tileShape={folderTileShape} onTileShapeChange={onFolderTileShapeChange} />
			{applyDiagnostic ? <div className="editor-diagnostics" role="alert"><p>{applyDiagnostic.message}</p></div> : null}
			<details className="decades-review-details">
				<summary>View person details · {entries.length}</summary>
				<ul className="genre-review-list">
					{entries.map((entry, index) => {
						const outcome = plan.outcomes[index];
						return <li key={entry.person.id}><div><strong>{entry.person.name}</strong><span>{entry.drafts.drafts.length} source{entry.drafts.drafts.length === 1 ? "" : "s"} · {entry.artworkState?.artwork?.source === "manifest" ? "canonical artwork" : `${entry.artworkState?.artwork?.source ?? "safe"} fallback`}</span></div><span data-status={outcome.status === PEOPLE_PLACEMENT_STATUSES.READY ? "ready" : outcome.status === PEOPLE_PLACEMENT_STATUSES.EXISTS_ELSEWHERE ? "elsewhere" : "destination-duplicate"}>{peoplePlacementLabels[outcome.status]}</span></li>;
					})}
				</ul>
			</details>
			<SourceElsewhereNotice occurrences={elsewhereOccurrences} heading="Matching People sources exist elsewhere in this project" action="You can still create the ready person folders here." />
		</section>
	);
}

export function PeopleSourceFlow({
	context = "folder",
	provider,
	manifestClient = null,
	project,
	projectRevision = 0,
	collection,
	folder = null,
	hierarchyScope = null,
	embedded = false,
	onBack,
	onCancel,
	onApply,
}) {
	const [navigation, setNavigation] = useState(createPeopleSourceNavigationState);
	const [input, setInput] = useState("");
	const [page, setPage] = useState(1);
	const [retryGeneration, setRetryGeneration] = useState(0);
	const [lookupState, setLookupState] = useState(INITIAL_ASYNC_REQUEST_STATE);
	const [manifest, setManifest] = useState(() => manifestClient?.peek?.() ?? null);
	const [selection, setSelection] = useState(createPeopleSelectionState);
	const [details, setDetails] = useState({});
	const [configurations, setConfigurations] = useState({});
	const [configurationOverrides, setConfigurationOverrides] = useState({});
	const [artworkById, setArtworkById] = useState({});
	const [loadingPersonId, setLoadingPersonId] = useState(null);
	const [selectionError, setSelectionError] = useState(null);
	const [applyDiagnostic, setApplyDiagnostic] = useState(null);
	const [isApplying, setIsApplying] = useState(false);
	const [configurationMode, setConfigurationMode] = useState(PEOPLE_CONFIGURATION_MODES.AUTOMATIC);
	const [sharedCombinations, setSharedCombinations] = useState(["acting-movies", "acting-series"]);
	const [sharedConfigurationInitialized, setSharedConfigurationInitialized] = useState(false);
	const [sortOptionId, setSortOptionId] = useState(DEFAULT_PEOPLE_SOURCE_SORT_OPTION_ID);
	const [previewState, setPreviewState] = useState(null);
	const [folderTileShape, setFolderTileShape] = useState("POSTER");
	const [folderTitleVisibility, setFolderTitleVisibility] = useState(DEFAULT_PEOPLE_FOLDER_TITLE_VISIBILITY);
	const [collectionOptions, setCollectionOptions] = useState(() => Object.freeze({
		title: "People",
		hideTitle: false,
		viewMode: "TABBED_GRID",
		showAllTab: true,
		pinToTop: false,
	}));
	const [viewportStyle, setViewportStyle] = useState(() => typeof window === "undefined" ? null : resolveAddSourceViewportStyle(window));
	const dialogRef = useRef(null);
	const scrollRef = useRef(null);
	const searchHeadingRef = useRef(null);
	const inputRef = useRef(null);
	const configureRef = useRef(null);
	const lookupCoordinatorRef = useRef(null);
	const detailCoordinatorsRef = useRef(new Map());
	const detailTokensRef = useRef(new Map());
	const artworkTokensRef = useRef(new Map());
	const manifestRequestRef = useRef(null);
	const manifestResultRef = useRef(manifest ? { ok: true, data: manifest } : null);
	const quickSelectionTokenRef = useRef(null);
	const submissionGateRef = useRef(null);
	const previewTokenRef = useRef(null);
	const previewRestoreFocusRef = useRef(null);
	if (!lookupCoordinatorRef.current) lookupCoordinatorRef.current = createAsyncRequestCoordinator({ onStateChange: setLookupState });
	if (!submissionGateRef.current) submissionGateRef.current = createSourceSubmissionGate();

	const parsedInput = useMemo(() => parseTmdbPersonInput(input), [input]);
	const hierarchy = hierarchyScope === "new-collection" || hierarchyScope === "new-folder";
	const multiContext = context !== "folder";
	const promoteSelectedFolder = context === "folder" && isPromotablePeopleFolder(folder);
	const resolvesFolderArtwork = multiContext || promoteSelectedFolder;
	const resolvedTileShape = multiContext ? folderTileShape : peoplePromotionTileShape(folder);
	const artworkContextKey = multiContext
		? `${hierarchyScope ?? "new-folder"}:${resolvedTileShape}`
		: `promoted-folder:${folder?.internalId ?? "missing"}`;
	const chosenPeople = selectedPeople(selection);
	const searchData = lookupState.status === "success"
		? lookupState.context?.kind === "exact"
			? { results: [applyPeopleManifestAuthority(lookupState.data, manifest)], page: 1, totalPages: 1 }
			: lookupState.context?.query === parsedInput.query && lookupState.context?.page === page
				? { ...lookupState.data, results: lookupState.data.results.map((person) => applyPeopleManifestAuthority(person, manifest)) }
				: null
		: null;
	const configuredEntries = chosenPeople.map((result) => {
		const detail = details[result.id];
		const person = detail?.person;
		const configuration = person
			? multiContext
				? resolvePeopleConfigurationForMode(person, { mode: configurationMode, sharedCombinations, customConfiguration: configurationOverrides[result.id] })
				: configurations[result.id]
			: null;
		const drafts = person && configuration ? buildPeopleSourceDrafts(person, { combinations: configuration.combinations, sortOptionId }) : { ok: false, drafts: [], errors: [] };
		const currentArtworkState = artworkById[result.id];
		const artworkState = person && currentArtworkState?.status === "ready" && currentArtworkState.artwork?.tileShape !== resolvedTileShape
			? {
				...currentArtworkState,
				contextKey: artworkContextKey,
				tileShape: resolvedTileShape,
				artwork: resolvePersonFolderArtwork({ person, tileShape: resolvedTileShape }),
			}
			: currentArtworkState;
		const folderEditable = person && artworkState?.status === "ready"
			? buildPeopleHierarchyFolderEditable(person, artworkState.artwork, { tileShape: resolvedTileShape })
			: null;
		return {
			result,
			detail,
			person,
			configuration,
			drafts,
			artworkState,
			folderEditable,
		};
	});
	const previewEntry = previewState ? configuredEntries.find((entry) => entry.result.id === previewState.personId) ?? null : null;
	const previewLimit = previewState?.limit ?? peopleTitlePreviewLimit(typeof window === "undefined" ? 1024 : window.innerWidth);
	const previewMediaTypes = peoplePreviewMediaTypes(previewEntry?.configuration?.combinations ?? []);
	const previewResult = previewState?.status === "ready" && previewEntry?.person
		? buildPeopleTitlePreview(previewEntry.person, { combinations: previewEntry.configuration?.combinations ?? [], sortOptionId, limit: previewLimit, mediaType: previewState.mediaType })
		: null;
	const quickEntry = configuredEntries[0] ?? null;
	const quickDuplicates = context === "folder" && quickEntry?.drafts.ok
		? inspectPeopleSourceDuplicates(project, folder?.internalId ?? null, quickEntry.drafts.drafts)
		: { destination: [], elsewhere: [], missingDrafts: [], duplicateDrafts: [] };
	const bulkSourceCount = configuredEntries.reduce((total, entry) => total + (entry.drafts.ok ? entry.drafts.drafts.length : 0), 0);
	const configureReady = configuredEntries.length > 0 && configuredEntries.every((entry) => (
		entry.detail?.status === "ready"
		&& entry.drafts.ok
		&& (!resolvesFolderArtwork || (
			entry.artworkState?.status === "ready"
			&& entry.artworkState.contextKey === artworkContextKey
			&& entry.folderEditable !== null
		))
	));
	const hierarchyPlanResult = useMemo(() => {
		if (!hierarchy || !configureReady) return null;
		return createPeopleHierarchyPlan(project, {
			scope: hierarchyScope,
			projectRevision,
			...(hierarchyScope === "new-folder" ? { destinationCollectionInternalId: collection?.internalId } : {
				collectionTitle: collectionOptions.title,
				hideCollectionTitle: collectionOptions.hideTitle,
				viewMode: collectionOptions.viewMode,
				showAllTab: collectionOptions.showAllTab,
				pinToTop: collectionOptions.pinToTop,
			}),
			folderTitleVisibility,
			people: configuredEntries.map((entry) => ({
				person: entry.person,
				drafts: entry.drafts.drafts,
				folderEditable: entry.folderEditable,
			})),
		});
	}, [collection, collectionOptions, configureReady, configuredEntries, folderTitleVisibility, hierarchy, hierarchyScope, project, projectRevision]);

	async function loadManifestOnce({ retry = false } = {}) {
		if (manifestResultRef.current?.ok) return manifestResultRef.current;
		if (!manifestClient?.load) return { ok: false, data: null };
		if (retry && manifestResultRef.current?.ok === false) {
			manifestRequestRef.current = null;
			manifestResultRef.current = null;
		}
		if (manifestRequestRef.current === null) {
			manifestRequestRef.current = Promise.resolve(manifestClient.load()).then((result) => {
				manifestResultRef.current = result?.ok ? result : { ok: false, data: null, error: result?.error };
				if (result?.ok) setManifest(result.data);
				return manifestResultRef.current;
			});
		}
		return manifestRequestRef.current;
	}

	usePrePaintLayoutEffect(() => {
		const initialFocusTarget = hierarchy ? searchHeadingRef.current : inputRef.current;
		if (embedded) {
			focusElementWithoutScroll(initialFocusTarget ?? dialogRef.current);
			return undefined;
		}
		const unlockBody = lockAddSourceDocumentBody();
		const stopViewport = observeAddSourceViewport(setViewportStyle);
		focusElementWithoutScroll(initialFocusTarget ?? dialogRef.current);
		return () => { stopViewport(); unlockBody(); };
	}, [embedded, hierarchy]);

	useEffect(() => {
		loadManifestOnce();
	}, [manifestClient]);

	useEffect(() => {
		if (manifest === null) return;
		setSelection((current) => Object.freeze({
				order: current.order,
				byId: Object.freeze(Object.fromEntries(current.order.map((id) => [id, applyPeopleManifestAuthority(current.byId[id], manifest)]))),
			}));
		setDetails((current) => Object.freeze(Object.fromEntries(Object.entries(current).map(([id, detail]) => [id, detail?.person ? { ...detail, person: applyPeopleManifestAuthority(detail.person, manifest) } : detail]))));
	}, [manifest]);

	useEffect(() => {
		if (previewState === null) return;
		if (!chosenPeople.some((person) => person.id === previewState.personId) || previewMediaTypes.length === 0) {
			setPreviewState(null);
			return;
		}
		if (!previewMediaTypes.includes(previewState.mediaType)) {
			setPreviewState((current) => current ? { ...current, mediaType: previewMediaTypes[0] } : current);
		}
	}, [chosenPeople, previewMediaTypes, previewState]);

	useEffect(() => {
		if (!multiContext || configurationMode !== PEOPLE_CONFIGURATION_MODES.SHARED || sharedConfigurationInitialized) return;
		const firstConfigured = configuredEntries.find((entry) => entry.person);
		if (!firstConfigured) return;
		setSharedCombinations([...createPeopleConfiguration(firstConfigured.person).combinations]);
		setSharedConfigurationInitialized(true);
	}, [configurationMode, configuredEntries, multiContext, sharedConfigurationInitialized]);

	useEffect(() => {
		const coordinator = lookupCoordinatorRef.current;
		coordinator.cancel({ notify: false });
		setLookupState(INITIAL_ASYNC_REQUEST_STATE);
		if (parsedInput.kind === "empty" || parsedInput.kind === "invalid" || (parsedInput.kind === "search" && !parsedInput.eligible)) return undefined;
		const timer = window.setTimeout(() => {
			coordinator.run(
				({ signal }) => parsedInput.kind === "exact" ? provider.getPerson(parsedInput.id, { signal }) : provider.searchPeople(parsedInput.query, { page, signal }),
				parsedInput.kind === "exact" ? { kind: "exact", id: parsedInput.id } : { kind: "search", query: parsedInput.query, page },
			);
		}, PEOPLE_SEARCH_DEBOUNCE_MS);
		return () => { window.clearTimeout(timer); coordinator.cancel({ reset: false, notify: false }); };
	}, [page, parsedInput, provider, retryGeneration]);

	useEffect(() => () => {
		lookupCoordinatorRef.current.cancel({ notify: false });
		for (const coordinator of detailCoordinatorsRef.current.values()) coordinator.cancel({ notify: false });
		detailCoordinatorsRef.current.clear();
		detailTokensRef.current.clear();
		artworkTokensRef.current.clear();
		quickSelectionTokenRef.current = null;
		previewTokenRef.current = null;
	}, []);

	useEffect(() => {
		if (navigation.step !== PEOPLE_SOURCE_STEPS.SEARCH || navigation.restoreSearchFocusId === null) return;
		const result = dialogRef.current?.querySelector?.(`[data-tmdb-person-result="${navigation.restoreSearchFocusId}"]`);
		restoreAddSourceSearchView({ scrollElement: scrollRef.current, resultElement: result, fallbackElement: inputRef.current, searchScrollTop: navigation.searchScrollTop, focusWithoutScroll: focusElementWithoutScroll });
		setNavigation(completePeopleSearchRestore);
	}, [navigation]);

	async function loadArtwork(person, force = false) {
		if (!resolvesFolderArtwork) return;
		if (!force && artworkById[person.id]?.status === "ready" && artworkById[person.id].contextKey === artworkContextKey) return;
		const requestKey = `${artworkContextKey}:${person.id}`;
		const token = Symbol(`artwork-${requestKey}`);
		artworkTokensRef.current.set(requestKey, token);
		setArtworkById((current) => ({ ...current, [person.id]: { status: "loading", personId: person.id, contextKey: artworkContextKey, tileShape: resolvedTileShape } }));
		try {
			const manifestResult = await loadManifestOnce({ retry: force });
			const manifestRecord = manifestResult?.ok ? manifestResult.data?.byId?.[person.id] ?? null : null;
			if (artworkTokensRef.current.get(requestKey) !== token) return;
			const artwork = resolvePersonFolderArtwork({ person, tileShape: resolvedTileShape, manifestRecord });
			setArtworkById((current) => ({ ...current, [person.id]: { status: "ready", personId: person.id, contextKey: artworkContextKey, tileShape: resolvedTileShape, artwork } }));
		} catch (error) {
			if (artworkTokensRef.current.get(requestKey) !== token) return;
			setArtworkById((current) => ({ ...current, [person.id]: { status: "error", personId: person.id, contextKey: artworkContextKey, tileShape: resolvedTileShape, error } }));
		}
	}

	function detailCoordinator(personId) {
		let coordinator = detailCoordinatorsRef.current.get(personId);
		if (!coordinator) {
			coordinator = createAsyncRequestCoordinator();
			detailCoordinatorsRef.current.set(personId, coordinator);
		}
		return coordinator;
	}

	function beginDetailsRequest(result, { bypassCache = false } = {}) {
		const existing = details[result.id];
		if (!bypassCache && existing?.status === "ready") return { cached: true, person: existing.person };
		const request = requestSelectedPersonDetails({
			coordinator: detailCoordinator(result.id),
			provider,
			result,
			bypassCache,
		});
		return request?.repeated ? request : { request };
	}

	async function loadDetails(result, { bypassCache = false, detailsRequest = null } = {}) {
		const operation = detailsRequest ?? beginDetailsRequest(result, { bypassCache });
		if (operation.cached) return { ok: true, person: operation.person };
		if (operation.repeated) return { ok: false, repeated: true };
		const token = Symbol(`person-${result.id}`);
		detailTokensRef.current.set(result.id, token);
		setDetails((current) => ({ ...current, [result.id]: detailEntry("loading", current[result.id]?.person ?? result) }));
		const completion = await operation.request;
		if (detailTokensRef.current.get(result.id) !== token) return { ok: false, stale: true };
		if (completion?.accepted !== true) return { ok: false, stale: true };
		const response = completion.result;
		if (response?.ok !== true) {
			setDetails((current) => ({ ...current, [result.id]: detailEntry("error", current[result.id]?.person ?? result, response?.error) }));
			return { ok: false, error: response?.error };
		}
		let manifestForPerson = manifest;
		if (manifestForPerson === null) {
			const manifestResult = await loadManifestOnce();
			if (manifestResult?.ok) manifestForPerson = manifestResult.data;
		}
		const person = applyPeopleManifestAuthority(response.data, manifestForPerson);
		setDetails((current) => ({ ...current, [result.id]: detailEntry("ready", person, null, response.checkedAt ?? Date.now()) }));
		setConfigurations((current) => ({ ...current, [person.id]: createPeopleConfiguration(person, current[person.id]) }));
		if (resolvesFolderArtwork) loadArtwork(person);
		return { ok: true, person };
	}

	async function activateResult(result) {
		setApplyDiagnostic(null);
		setSelectionError(null);
		if (multiContext) {
			const outcome = toggleSelectedPerson(selection, result);
			setSelection(outcome.state);
			return;
		}
		return activateFolderPersonResult({
			result,
			beginDetailsRequest,
			loadDetails,
			getScrollTop: () => scrollRef.current?.scrollTop ?? 0,
			onStart: (candidate, token) => {
				quickSelectionTokenRef.current = token;
				setLoadingPersonId(candidate.id);
			},
			isCurrent: (token) => quickSelectionTokenRef.current === token,
			onSettled: () => setLoadingPersonId(null),
			onFailure: (candidate, error) => setSelectionError(error ?? { message: `Could not load ${candidate.name}.` }),
			onSuccess: (person, scrollTop) => {
				const outcome = toggleSelectedPerson(createPeopleSelectionState(), person);
				setSelection(outcome.state);
				setNavigation((current) => enterPeopleConfigure(current, person.id, scrollTop));
				queueMicrotask(() => focusElementWithoutScroll(configureRef.current));
			},
		});
	}

	function beginBulkConfigure() {
		if (chosenPeople.length === 0) return;
		const scrollTop = scrollRef.current?.scrollTop ?? 0;
		setNavigation((current) => enterPeopleConfigure(current, chosenPeople[0].id, scrollTop));
		for (const person of chosenPeople) loadDetails(person);
		queueMicrotask(() => focusElementWithoutScroll(configureRef.current));
	}

	function closeTitlePreview({ restoreFocus = true } = {}) {
		previewTokenRef.current = null;
		setPreviewState(null);
		if (restoreFocus) {
			const trigger = previewRestoreFocusRef.current;
			window.requestAnimationFrame(() => focusElementWithoutScroll(trigger));
		}
	}

	async function openTitlePreview(entry, trigger = null, { retry = false } = {}) {
		if ((!retry && entry.detail?.status !== "ready") || !entry.configuration?.combinations.length) return;
		if (trigger) previewRestoreFocusRef.current = trigger;
		const limit = peopleTitlePreviewLimit(typeof window === "undefined" ? 1024 : window.innerWidth);
		const mediaTypes = peoplePreviewMediaTypes(entry.configuration.combinations);
		const mediaType = retry && previewState?.personId === entry.result.id && mediaTypes.includes(previewState.mediaType) ? previewState.mediaType : mediaTypes[0];
		if (!mediaType) return;
		const token = Symbol(`people-preview-${entry.result.id}`);
		previewTokenRef.current = token;
		setPreviewState({ status: "loading", personId: entry.result.id, mediaType, limit, error: null });
		const detailResult = await loadDetails(entry.result, { bypassCache: retry });
		if (previewTokenRef.current !== token) return;
		if (!detailResult.ok) {
			setPreviewState({ status: "error", personId: entry.result.id, mediaType, limit, error: detailResult.error ?? { message: "This title preview could not be prepared." } });
			return;
		}
		const preview = buildPeopleTitlePreview(detailResult.person, { combinations: entry.configuration.combinations, sortOptionId, limit, mediaType });
		setPreviewState(preview.ok
			? { status: "ready", personId: entry.result.id, mediaType, limit, error: null }
			: { status: "error", personId: entry.result.id, mediaType, limit, error: preview.errors[0] });
	}

	function changePeoplePreviewMedia(mediaType) {
		if (!previewMediaTypes.includes(mediaType)) return;
		setPreviewState((current) => current ? { ...current, mediaType } : current);
	}

	function toggleCombination(personId, combinationId) {
		if (multiContext && configurationMode === PEOPLE_CONFIGURATION_MODES.SHARED && personId === null) {
			setSharedCombinations((current) => current.includes(combinationId) ? current.filter((id) => id !== combinationId) : [...current, combinationId]);
			setApplyDiagnostic(null);
			return;
		}
		if (multiContext) {
			const target = configuredEntries.find((entry) => entry.configuration?.personId === personId)?.configuration;
			if (!target) return;
			const combinations = target.combinations.includes(combinationId)
				? target.combinations.filter((id) => id !== combinationId)
				: [...target.combinations, combinationId];
			setConfigurationOverrides((current) => ({ ...current, [personId]: updatePeopleConfiguration(target, combinations) }));
			setApplyDiagnostic(null);
			return;
		}
		setConfigurations((current) => {
			const configuration = current[personId];
			if (!configuration) return current;
			const combinations = configuration.combinations.includes(combinationId) ? configuration.combinations.filter((id) => id !== combinationId) : [...configuration.combinations, combinationId];
			return { ...current, [personId]: updatePeopleConfiguration(configuration, combinations) };
		});
		setApplyDiagnostic(null);
	}

	function changeConfigurationMode(nextMode) {
		if (![PEOPLE_CONFIGURATION_MODES.AUTOMATIC, PEOPLE_CONFIGURATION_MODES.SHARED].includes(nextMode) || nextMode === configurationMode) return;
		if (nextMode === PEOPLE_CONFIGURATION_MODES.SHARED && !sharedConfigurationInitialized) {
			const firstConfigured = configuredEntries.find((entry) => entry.person);
			if (firstConfigured) {
				setSharedCombinations([...createPeopleConfiguration(firstConfigured.person).combinations]);
				setSharedConfigurationInitialized(true);
			}
		}
		setConfigurationMode(nextMode);
		setApplyDiagnostic(null);
	}

	function removePerson(personId) {
		setSelection((current) => removeSelectedPerson(current, personId));
		setConfigurationOverrides((current) => {
			const next = { ...current };
			delete next[personId];
			return next;
		});
		if (previewState?.personId === personId) closeTitlePreview({ restoreFocus: false });
		setApplyDiagnostic(null);
		if (navigation.step === PEOPLE_SOURCE_STEPS.CONFIGURE && selection.order.length === 1) setNavigation(returnPeopleToSearch);
	}

	function handleInputChange(event) {
		setInput(event.target.value);
		setPage(1);
		setSelectionError(null);
		setApplyDiagnostic(null);
	}

	function goBack() {
		if (isApplying) return;
		setApplyDiagnostic(null);
		if (navigation.step === PEOPLE_SOURCE_STEPS.REVIEW) {
			setNavigation(returnPeopleToConfigure);
			return;
		}
		if (navigation.step === PEOPLE_SOURCE_STEPS.CONFIGURE) {
			setNavigation(returnPeopleToSearch);
			return;
		}
		onBack?.();
	}

	async function applyPeople(addAllAnyway = false) {
		if (!configureReady || isApplying || !submissionGateRef.current.begin()) return;
		setIsApplying(true);
		let payload;
		if (hierarchy) {
			if (!hierarchyPlanResult?.ok) {
				submissionGateRef.current.reset();
				setIsApplying(false);
				setApplyDiagnostic(hierarchyPlanResult?.errors?.[0] ?? { message: "The People plan needs to be reviewed again." });
				return;
			}
			payload = hierarchyPlanResult.plan;
		} else if (context === "folder") {
			const drafts = quickEntry.drafts.drafts;
			payload = {
				context,
				person: quickEntry.person,
				drafts,
				artwork: promoteSelectedFolder ? quickEntry.artworkState.artwork : null,
				duplicateOverrideIdentity: addAllAnyway ? peopleDuplicateOverrideIdentity(folder.internalId, drafts) : null,
			};
		} else {
			payload = {
				context,
				people: configuredEntries.map((entry) => ({
					person: entry.person,
					drafts: entry.drafts.drafts,
					folderEditable: entry.folderEditable,
				})),
			};
		}
		let result;
		try {
			result = await onApply(payload);
		} catch {
			result = { ok: false, errors: [{ message: "People could not be added. Try again." }] };
		}
		if (result?.ok) return;
		submissionGateRef.current.reset();
		setIsApplying(false);
		setApplyDiagnostic(result?.errors?.[0] ?? { message: "People could not be added. Try again." });
	}

	const step = navigation.step;
	const primaryCount = context === "folder" ? quickDuplicates.missingDrafts.length : bulkSourceCount;
	const primaryLabel = hierarchy
		? step === PEOPLE_SOURCE_STEPS.REVIEW
			? isApplying ? "Creating…" : `Create ${hierarchyPlanResult?.plan?.counts.folderCount ?? 0} folder${hierarchyPlanResult?.plan?.counts.folderCount === 1 ? "" : "s"}`
			: "Continue"
		: context === "folder"
		? quickEntry ? `${promoteSelectedFolder ? "Create" : "Add"} ${quickEntry.person?.name ?? quickEntry.result.name} · ${primaryCount} source${primaryCount === 1 ? "" : "s"}` : "Add person"
		: `Add ${configuredEntries.length} folder${configuredEntries.length === 1 ? "" : "s"} · ${bulkSourceCount} source${bulkSourceCount === 1 ? "" : "s"}`;
	const titleId = embedded ? "creation-title" : "people-source-title";
	const descriptionId = embedded ? "creation-description" : "people-source-description";
	const headingTitle = hierarchy ? "Create with People" : context === "folder" ? "Add person" : "Add people";
	const headingContext = hierarchy
		? `${hierarchyScope === "new-folder" ? "New Folder" : "New Collection"}${hierarchyScope === "new-folder" && collection?.editable?.title ? ` · ${collection.editable.title}` : ""}`
		: context === "folder" ? folder?.editable?.title || "Selected folder" : collection?.editable?.title || "Selected collection";
	const headingDescription = step === PEOPLE_SOURCE_STEPS.SEARCH
		? context === "folder" ? "Search for one person to add to the current folder." : "Select people in folder order, then configure their existing Acting and Directing sources."
		: step === PEOPLE_SOURCE_STEPS.CONFIGURE ? multiContext ? null : "Choose the exact Acting and Directing sources to add."
			: "Review names, appearance and destination placement before creating everything atomically.";
	const dialogContent = (
		<section ref={dialogRef} className={`add-source-dialog people-source-dialog${embedded ? " people-source-embedded" : ""}`} data-dialog-compact={step === PEOPLE_SOURCE_STEPS.SEARCH ? "true" : undefined} data-add-source-modal={embedded ? undefined : "true"} data-add-source-step={step} data-people-context={context} data-people-hierarchy-scope={hierarchyScope ?? undefined} data-source-mode={PEOPLE_SOURCE_MODE.id} role={embedded ? undefined : "dialog"} aria-modal={embedded ? undefined : "true"} aria-labelledby={titleId} aria-describedby={headingDescription ? descriptionId : undefined} tabIndex={-1} onKeyDown={(event) => handleDialogKeyDown(event, dialogRef.current, () => !isApplying && onCancel())}>
					<header className="add-source-heading">
						<div className="add-source-heading-row">
							{step !== PEOPLE_SOURCE_STEPS.SEARCH || hierarchy || context === "folder"
								? <button className="add-source-header-action" type="button" data-action={step === PEOPLE_SOURCE_STEPS.SEARCH ? hierarchy ? "back-to-creation-launcher" : "back-to-source-types" : undefined} disabled={isApplying} onClick={goBack}><span aria-hidden="true">←</span>Back</button>
									: <span className="add-source-header-spacer" aria-hidden="true" />}
							<div><h2 id={titleId}>{headingTitle}</h2><p>{headingContext}</p></div>
							<button className="add-source-header-action add-source-close-action" type="button" aria-label={context === "folder" ? "Close Add person" : "Close Add people"} disabled={isApplying} onClick={onCancel}>Close</button>
						</div>
						{headingDescription ? <p id={descriptionId} className="add-source-heading-description">{headingDescription}</p> : null}
					</header>
					<form className="add-source-form" data-people-source-form-step={step} onSubmit={(event) => {
						event.preventDefault();
						if (step === PEOPLE_SOURCE_STEPS.SEARCH) beginBulkConfigure();
						else if (step === PEOPLE_SOURCE_STEPS.CONFIGURE && hierarchy) {
							if (hierarchyPlanResult?.ok) setNavigation(enterPeopleReview);
						} else applyPeople(false);
					}} noValidate>
						<div ref={scrollRef} className="add-source-scroll">
							{step === PEOPLE_SOURCE_STEPS.SEARCH ? (
								<PeopleSearchStep context={context} headingRef={searchHeadingRef} input={input} inputRef={inputRef} parsedInput={parsedInput} lookupState={lookupState} searchData={searchData} selection={selection} loadingPersonId={loadingPersonId} selectionError={selectionError} onInputChange={handleInputChange} onRetryLookup={() => setRetryGeneration((value) => value + 1)} onActivateResult={activateResult} onChangePage={setPage} onRemoveSelected={removePerson} />
							) : step === PEOPLE_SOURCE_STEPS.CONFIGURE ? (
								<section ref={configureRef} className="people-configure" aria-labelledby="people-configure-title" tabIndex={-1}>
									<div className="add-source-section-heading"><div><p className="panel-kicker">Configure</p><h3 id="people-configure-title">{context === "folder" ? "Choose sources" : `${configuredEntries.length} People folder${configuredEntries.length === 1 ? "" : "s"}`}</h3></div></div>
									{multiContext ? <PeopleConfigurationModeControls mode={configurationMode} sharedCombinations={sharedCombinations} onModeChange={changeConfigurationMode} onToggleShared={(combinationId) => toggleCombination(null, combinationId)} /> : null}
									{hierarchy ? <SemanticSortChoices options={PEOPLE_SOURCE_SORT_OPTIONS} selectedId={sortOptionId} name="people-hierarchy-sort" legend="Sort titles by" onChange={(nextSortOptionId) => { setSortOptionId(nextSortOptionId); setApplyDiagnostic(null); }} /> : null}
									{applyDiagnostic ? <div className="editor-diagnostics" role="alert"><p>{applyDiagnostic.message}</p></div> : null}
									{multiContext ? <PeopleBulkConfigurationList entries={configuredEntries} mode={configurationMode} onToggleCombination={toggleCombination} onRetry={(entry) => loadDetails(entry.result, { bypassCache: true })} onRemove={removePerson} onPreview={openTitlePreview} previewState={previewState} previewItems={previewResult?.ok ? previewResult.items : []} previewLimit={previewLimit} previewMediaTypes={previewMediaTypes} previewTotalResults={previewResult?.ok ? previewResult.totalResults : 0} onChangePreviewMedia={changePeoplePreviewMedia} onClosePreview={() => closeTitlePreview()} onRetryPreview={(entry) => openTitlePreview(entry, null, { retry: true })} /> : <div className="people-configuration-list">{configuredEntries.map((entry) => <PeopleConfigurationCard key={entry.result.id} personResult={entry.result} detail={entry.detail} configuration={entry.configuration} artworkState={entry.artworkState} showArtwork={resolvesFolderArtwork} onToggle={(id) => toggleCombination(entry.result.id, id)} onRefresh={() => loadDetails(entry.result, { bypassCache: true })} onRetry={() => loadDetails(entry.result, { bypassCache: true })} onRetryArtwork={() => entry.person && loadArtwork(entry.person, true)} onRemove={null} />)}</div>}
									{context === "folder" && quickDuplicates.destination.length ? <div className="add-source-duplicate-warning" role="alert" data-people-duplicate-warning="true"><strong>{quickDuplicates.duplicateDrafts.length} selected source{quickDuplicates.duplicateDrafts.length === 1 ? " is" : "s are"} already in this folder.</strong><p>The main action adds only missing sources. Add all anyway is an explicit override for this person and selection.</p></div> : null}
									{context === "folder" && quickDuplicates.elsewhere.length ? <p className="people-elsewhere-note" role="status">Matching sources also exist elsewhere in this Builder document. This does not block adding them here.</p> : null}
								</section>
							) : <PeopleReviewStep planResult={hierarchyPlanResult} entries={configuredEntries} collectionOptions={collectionOptions} onCollectionOptionsChange={(next) => { setCollectionOptions(Object.freeze(next)); setApplyDiagnostic(null); }} folderTileShape={folderTileShape} onFolderTileShapeChange={(tileShape) => { setFolderTileShape(tileShape); setApplyDiagnostic(null); }} folderTitleVisibility={folderTitleVisibility} onFolderTitleVisibilityChange={(next) => { setFolderTitleVisibility(next); setApplyDiagnostic(null); }} applyDiagnostic={applyDiagnostic} headingRef={configureRef} />}
						</div>
						{step === PEOPLE_SOURCE_STEPS.SEARCH && multiContext ? <footer className="add-source-actions"><button className="editor-apply" type="submit" disabled={chosenPeople.length === 0}>Configure {chosenPeople.length} {chosenPeople.length === 1 ? "person" : "people"}</button></footer> : null}
						{step !== PEOPLE_SOURCE_STEPS.SEARCH ? <footer className="add-source-actions people-configure-actions"><button className="editor-apply" type="submit" disabled={!configureReady || isApplying || (context === "folder" && primaryCount === 0) || (hierarchy && (!hierarchyPlanResult?.ok || (step === PEOPLE_SOURCE_STEPS.REVIEW && hierarchyPlanResult.plan.counts.folderCount === 0)))}>{isApplying ? hierarchy ? "Creating…" : "Adding…" : primaryLabel}</button>{context === "folder" && quickDuplicates.destination.length ? <button className="editor-cancel people-add-all" type="button" disabled={!configureReady || isApplying} data-action="add-all-people-anyway" onClick={() => applyPeople(true)}>Add all {quickEntry?.drafts.drafts.length ?? 0} anyway</button> : null}</footer> : null}
					</form>
				</section>
	);
	if (embedded) return dialogContent;
	const content = <div className="add-source-portal" data-add-source-portal="true" data-mobile-surface="opaque"><div className="settings-modal-backdrop add-source-backdrop" data-add-source-modal-backdrop="true" style={viewportStyle ?? undefined}>{dialogContent}</div></div>;
	return typeof document === "undefined" ? content : createPortal(content, document.body);
}
