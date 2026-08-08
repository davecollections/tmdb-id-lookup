import {
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import {
	buildPeopleSourceDrafts,
	buildTmdbProfileUrl,
	createAsyncRequestCoordinator,
	createPeopleConfiguration,
	createPeopleSelectionState,
	createSourceSubmissionGate,
	INITIAL_ASYNC_REQUEST_STATE,
	inspectPeopleSourceDuplicates,
	isPromotablePeopleFolder,
	parseTmdbPersonInput,
	PEOPLE_SELECTION_LIMIT,
	PEOPLE_SOURCE_COMBINATIONS,
	PEOPLE_SOURCE_MODE,
	peopleDuplicateOverrideIdentity,
	peoplePromotionTileShape,
	removeSelectedPerson,
	requestPersonRuntimeArtwork,
	resolvePersonFolderArtwork,
	selectedPeople,
	toggleSelectedPerson,
	updatePeopleConfiguration,
	validatePeopleCombinationSelection,
} from "../source-add/index.js";
import {
	lockAddSourceDocumentBody,
	observeAddSourceViewport,
	resolveAddSourceViewportStyle,
} from "./add-source-modal-lifecycle.js";
import { restoreAddSourceSearchView } from "./add-source-navigation-state.js";
import { focusElementWithoutScroll } from "./hierarchy-menu-placement.js";
import { handleDialogKeyDown } from "./modal-focus.js";
import { TmdbEntityLink } from "./TmdbEntityLink.jsx";
import {
	completePeopleSearchRestore,
	createPeopleSourceNavigationState,
	enterPeopleConfigure,
	PEOPLE_SOURCE_STEPS,
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
	if (loading) return { text: "Checking…", state: "loading" };
	const count = person?.counts?.[countKey];
	if (Number.isSafeInteger(count) && count > 0) return { text: `${count} title${count === 1 ? "" : "s"}`, state: "ready" };
	if (count === 0) return { text: "No titles found", state: "zero" };
	return { text: "Count unavailable", state: "unavailable" };
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
			<input type="checkbox" checked={checked} disabled={disabled && !checked} onChange={() => onActivate(result)} />
			{body}
		</label>
	);
}

export function PeopleSearchStep({
	context,
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
	const atLimit = people.length >= PEOPLE_SELECTION_LIMIT;
	return (
		<>
			<section className="add-source-mode" aria-labelledby="people-mode-title">
				<div>
					<h3 id="people-mode-title">People · TMDB</h3>
					<p>{context === "folder" ? "Choose a person, then add their sources to this folder." : `Choose up to ${PEOPLE_SELECTION_LIMIT} people. Each person becomes a new folder.`}</p>
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
			{context === "collection" && people.length ? (
				<section className="people-selected-tray" aria-label={`${people.length} people selected`}>
					<div><strong>{people.length} selected</strong><span>{PEOPLE_SELECTION_LIMIT - people.length} remaining</span></div>
					<ul>{people.map((person) => <li key={person.id}><span>{person.name}</span><button type="button" aria-label={`Remove ${person.name}`} onClick={() => onRemoveSelected(person.id)}>×</button></li>)}</ul>
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
							return <PersonResult key={result.id} result={result} context={context} checked={checked} disabled={context === "folder" ? loadingPersonId !== null : atLimit} loading={loadingPersonId === result.id} onActivate={onActivateResult} />;
						})}</div>
					) : <p className="add-source-empty-results">No TMDB people matched this search.</p>}
					{atLimit ? <p className="people-selection-limit" role="status">You’ve selected the maximum of {PEOPLE_SELECTION_LIMIT} people. Remove one to choose another.</p> : null}
					{searchData.totalPages > 1 ? <nav className="add-source-pagination" aria-label="People search result pages"><button type="button" disabled={searchData.page <= 1} onClick={() => onChangePage(searchData.page - 1)}>Previous page</button><button type="button" disabled={searchData.page >= searchData.totalPages} onClick={() => onChangePage(searchData.page + 1)}>Next page</button></nav> : null}
				</section>
			) : null}
		</>
	);
}

function CombinationControls({ person, configuration, loading, onToggle }) {
	const validation = validatePeopleCombinationSelection(configuration?.combinations);
	return (
		<fieldset className="people-combination-group">
			<legend>Sources to add</legend>
			<div>
				{PEOPLE_SOURCE_COMBINATIONS.map((combination) => {
					const count = sourceCount(person, combination.countKey, loading);
					return (
						<label key={combination.id} data-count-state={count.state}>
							<input type="checkbox" checked={configuration?.combinations.includes(combination.id) ?? false} disabled={loading} onChange={() => onToggle(combination.id)} />
							<span><strong>{combination.label}</strong><small>{combination.tmdbSourceType} · {combination.mediaType}</small></span>
							<em>{count.text}</em>
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
	const label = artwork.source === "runtime"
		? "Curated artwork"
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

export function PeopleSourceFlow({
	context = "folder",
	provider,
	artworkClient,
	project,
	collection,
	folder = null,
	onBack,
	onCancel,
	onApply,
}) {
	const [navigation, setNavigation] = useState(createPeopleSourceNavigationState);
	const [input, setInput] = useState("");
	const [page, setPage] = useState(1);
	const [retryGeneration, setRetryGeneration] = useState(0);
	const [lookupState, setLookupState] = useState(INITIAL_ASYNC_REQUEST_STATE);
	const [selection, setSelection] = useState(createPeopleSelectionState);
	const [details, setDetails] = useState({});
	const [configurations, setConfigurations] = useState({});
	const [artworkById, setArtworkById] = useState({});
	const [loadingPersonId, setLoadingPersonId] = useState(null);
	const [selectionError, setSelectionError] = useState(null);
	const [applyDiagnostic, setApplyDiagnostic] = useState(null);
	const [isApplying, setIsApplying] = useState(false);
	const [viewportStyle, setViewportStyle] = useState(() => typeof window === "undefined" ? null : resolveAddSourceViewportStyle(window));
	const dialogRef = useRef(null);
	const scrollRef = useRef(null);
	const inputRef = useRef(null);
	const configureRef = useRef(null);
	const lookupCoordinatorRef = useRef(null);
	const detailCoordinatorsRef = useRef(new Map());
	const detailTokensRef = useRef(new Map());
	const artworkTokensRef = useRef(new Map());
	const quickSelectionTokenRef = useRef(null);
	const submissionGateRef = useRef(null);
	if (!lookupCoordinatorRef.current) lookupCoordinatorRef.current = createAsyncRequestCoordinator({ onStateChange: setLookupState });
	if (!submissionGateRef.current) submissionGateRef.current = createSourceSubmissionGate();

	const parsedInput = useMemo(() => parseTmdbPersonInput(input), [input]);
	const promoteSelectedFolder = context === "folder" && isPromotablePeopleFolder(folder);
	const resolvesFolderArtwork = context === "collection" || promoteSelectedFolder;
	const resolvedTileShape = context === "collection" ? "POSTER" : peoplePromotionTileShape(folder);
	const artworkContextKey = context === "collection"
		? "new-folder"
		: `promoted-folder:${folder?.internalId ?? "missing"}`;
	const chosenPeople = selectedPeople(selection);
	const searchData = lookupState.status === "success"
		? lookupState.context?.kind === "exact"
			? { results: [lookupState.data], page: 1, totalPages: 1 }
			: lookupState.context?.query === parsedInput.query && lookupState.context?.page === page ? lookupState.data : null
		: null;
	const configuredEntries = chosenPeople.map((result) => {
		const detail = details[result.id];
		const person = detail?.person;
		const configuration = configurations[result.id];
		const drafts = person && configuration ? buildPeopleSourceDrafts(person, { combinations: configuration.combinations }) : { ok: false, drafts: [], errors: [] };
		return { result, detail, person, configuration, drafts, artworkState: artworkById[result.id] };
	});
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
		))
	));

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
			const runtimeResult = await requestPersonRuntimeArtwork(artworkClient, { tmdbId: person.id, tileShape: resolvedTileShape });
			if (artworkTokensRef.current.get(requestKey) !== token) return;
			const artwork = resolvePersonFolderArtwork({ person, tileShape: resolvedTileShape, runtimeResult });
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
		const person = response.data;
		setDetails((current) => ({ ...current, [result.id]: detailEntry("ready", person, null, response.checkedAt ?? Date.now()) }));
		setConfigurations((current) => ({ ...current, [person.id]: createPeopleConfiguration(person, current[person.id]) }));
		if (resolvesFolderArtwork) loadArtwork(person);
		return { ok: true, person };
	}

	async function activateResult(result) {
		setApplyDiagnostic(null);
		setSelectionError(null);
		if (context === "collection") {
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

	function toggleCombination(personId, combinationId) {
		setConfigurations((current) => {
			const configuration = current[personId];
			if (!configuration) return current;
			const combinations = configuration.combinations.includes(combinationId) ? configuration.combinations.filter((id) => id !== combinationId) : [...configuration.combinations, combinationId];
			return { ...current, [personId]: updatePeopleConfiguration(configuration, combinations) };
		});
		setApplyDiagnostic(null);
	}

	function removePerson(personId) {
		setSelection((current) => removeSelectedPerson(current, personId));
		setApplyDiagnostic(null);
		if (navigation.step === PEOPLE_SOURCE_STEPS.CONFIGURE && selection.order.length === 1) setNavigation(returnPeopleToSearch);
	}

	function handleInputChange(event) {
		setInput(event.target.value);
		setPage(1);
		setSelectionError(null);
		setApplyDiagnostic(null);
	}

	async function applyPeople(addAllAnyway = false) {
		if (!configureReady || isApplying || !submissionGateRef.current.begin()) return;
		setIsApplying(true);
		let payload;
		if (context === "folder") {
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
					folderEditable: { title: entry.person.name, tileShape: "POSTER", ...entry.artworkState.artwork.folderEditable },
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
	const primaryLabel = context === "folder"
		? quickEntry ? `${promoteSelectedFolder ? "Create" : "Add"} ${quickEntry.person?.name ?? quickEntry.result.name} · ${primaryCount} source${primaryCount === 1 ? "" : "s"}` : "Add person"
		: `Add ${configuredEntries.length} folder${configuredEntries.length === 1 ? "" : "s"} · ${bulkSourceCount} source${bulkSourceCount === 1 ? "" : "s"}`;
	const content = (
		<div className="add-source-portal" data-add-source-portal="true" data-mobile-surface="opaque">
			<div className="settings-modal-backdrop add-source-backdrop" data-add-source-modal-backdrop="true" style={viewportStyle ?? undefined}>
				<section ref={dialogRef} className="add-source-dialog people-source-dialog" data-dialog-compact={step === PEOPLE_SOURCE_STEPS.SEARCH ? "true" : undefined} data-add-source-modal="true" data-add-source-step={step} data-people-context={context} data-source-mode={PEOPLE_SOURCE_MODE.id} role="dialog" aria-modal="true" aria-labelledby="people-source-title" aria-describedby="people-source-description" tabIndex={-1} onKeyDown={(event) => handleDialogKeyDown(event, dialogRef.current, () => !isApplying && onCancel())}>
					<header className="add-source-heading">
						<div className="add-source-heading-row">
							{step === PEOPLE_SOURCE_STEPS.CONFIGURE
								? <button className="add-source-header-action" type="button" disabled={isApplying} onClick={() => setNavigation(returnPeopleToSearch)}><span aria-hidden="true">←</span>Back</button>
								: context === "folder"
									? <button className="add-source-header-action" type="button" data-action="back-to-source-types" onClick={onBack}><span aria-hidden="true">←</span>Back</button>
									: <span className="add-source-header-spacer" aria-hidden="true" />}
							<div><h2 id="people-source-title">{context === "folder" ? "Add person" : "Add people"}</h2><p>{context === "folder" ? folder?.editable?.title || "Selected folder" : collection?.editable?.title || "Selected collection"}</p></div>
							<button className="add-source-header-action add-source-close-action" type="button" aria-label={context === "folder" ? "Close Add person" : "Close Add people"} disabled={isApplying} onClick={onCancel}>Close</button>
						</div>
						<p id="people-source-description" className="add-source-heading-description">{step === PEOPLE_SOURCE_STEPS.SEARCH ? context === "folder" ? "Search for one person to add to the current folder." : "Select people to create one new folder per person." : "Choose the exact Acting and Directing sources to add."}</p>
					</header>
					<form className="add-source-form" data-people-source-form-step={step} onSubmit={(event) => { event.preventDefault(); step === PEOPLE_SOURCE_STEPS.SEARCH ? beginBulkConfigure() : applyPeople(false); }} noValidate>
						<div ref={scrollRef} className="add-source-scroll">
							{step === PEOPLE_SOURCE_STEPS.SEARCH ? (
								<PeopleSearchStep context={context} input={input} inputRef={inputRef} parsedInput={parsedInput} lookupState={lookupState} searchData={searchData} selection={selection} loadingPersonId={loadingPersonId} selectionError={selectionError} onInputChange={handleInputChange} onRetryLookup={() => setRetryGeneration((value) => value + 1)} onActivateResult={activateResult} onChangePage={setPage} onRemoveSelected={removePerson} />
							) : (
								<section ref={configureRef} className="people-configure" aria-labelledby="people-configure-title" tabIndex={-1}>
									<div className="add-source-section-heading"><div><p className="panel-kicker">Configure</p><h3 id="people-configure-title">{context === "folder" ? "Choose sources" : `${configuredEntries.length} People folders`}</h3></div></div>
									{applyDiagnostic ? <div className="editor-diagnostics" role="alert"><p>{applyDiagnostic.message}</p></div> : null}
									<div className="people-configuration-list">{configuredEntries.map((entry) => <PeopleConfigurationCard key={entry.result.id} personResult={entry.result} detail={entry.detail} configuration={entry.configuration} artworkState={entry.artworkState} showArtwork={resolvesFolderArtwork} onToggle={(id) => toggleCombination(entry.result.id, id)} onRefresh={() => loadDetails(entry.result, { bypassCache: true })} onRetry={() => loadDetails(entry.result, { bypassCache: true })} onRetryArtwork={() => entry.person && loadArtwork(entry.person, true)} onRemove={context === "collection" ? () => removePerson(entry.result.id) : null} />)}</div>
									{context === "folder" && quickDuplicates.destination.length ? <div className="add-source-duplicate-warning" role="alert" data-people-duplicate-warning="true"><strong>{quickDuplicates.duplicateDrafts.length} selected source{quickDuplicates.duplicateDrafts.length === 1 ? " is" : "s are"} already in this folder.</strong><p>The main action adds only missing sources. Add all anyway is an explicit override for this person and selection.</p></div> : null}
									{context === "folder" && quickDuplicates.elsewhere.length ? <p className="people-elsewhere-note" role="status">Matching sources also exist elsewhere in this Builder document. This does not block adding them here.</p> : null}
								</section>
							)}
						</div>
						{step === PEOPLE_SOURCE_STEPS.SEARCH && context === "collection" ? <footer className="add-source-actions"><button className="editor-apply" type="submit" disabled={chosenPeople.length === 0}>Configure {chosenPeople.length} {chosenPeople.length === 1 ? "person" : "people"}</button></footer> : null}
						{step === PEOPLE_SOURCE_STEPS.CONFIGURE ? <footer className="add-source-actions people-configure-actions"><button className="editor-apply" type="submit" disabled={!configureReady || isApplying || (context === "folder" && primaryCount === 0)}>{isApplying ? "Adding…" : primaryLabel}</button>{context === "folder" && quickDuplicates.destination.length ? <button className="editor-cancel people-add-all" type="button" disabled={!configureReady || isApplying} data-action="add-all-people-anyway" onClick={() => applyPeople(true)}>Add all {quickEntry?.drafts.drafts.length ?? 0} anyway</button> : null}</footer> : null}
					</form>
				</section>
			</div>
		</div>
	);
	return typeof document === "undefined" ? content : createPortal(content, document.body);
}
