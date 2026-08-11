import {
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import {
	formatNetworkLocation,
	formatStudioLocation,
	networkSortOptionId,
	networkSortValue,
	parseNetworkSearchInput,
	parseStudioSearchInput,
	PEOPLE_SOURCE_COMBINATIONS,
	STREAMING_SORT_OPTIONS,
	studioSortOptionId,
	studioSortValue,
} from "../source-add/index.js";
import {
	checkingNetworkEditCount,
	checkingStudioEditCounts,
	createNetworkEditCountSession,
	createStudioEditCountSession,
	INITIAL_STUDIO_EDIT_COUNT_STATE,
	MOVIE_COLLECTION_SOURCE_EDITOR_ID,
	PEOPLE_SOURCE_EDITOR_ID,
	STUDIO_SOURCE_EDITOR_ID,
	STREAMING_SOURCE_EDITOR_ID,
	chooseMovieCollection,
	choosePeopleSourceCombination,
	createPeopleEditCountSession,
	INITIAL_PEOPLE_EDIT_COUNT_STATE,
	INITIAL_NETWORK_EDIT_COUNT_STATE,
	NETWORK_SOURCE_EDITOR_ID,
	peopleEditCountLabel,
	peopleSortOptions,
	sourceEditorById,
	updatePeopleSourceSort,
	updateNetworkSourceSort,
	updateStudioSourceSort,
	updateStreamingSourceSort,
	updateSourceEditTitle,
	usePeopleDefaultTitle,
	useSelectedMovieCollectionName,
	streamingDefaultSourceName,
	streamingEditSortValue,
} from "../source-edit/index.js";
import {
	lockAddSourceDocumentBody,
	observeAddSourceViewport,
	resolveAddSourceViewportStyle,
} from "./add-source-modal-lifecycle.js";
import { focusElementWithoutScroll } from "./hierarchy-menu-placement.js";
import { handleDialogKeyDown } from "./modal-focus.js";
import { MovieCollectionPicker } from "./MovieCollectionPicker.jsx";
import { NetworkLogo } from "./NetworkSourceFlow.jsx";
import { NetworkSortChoices } from "./NetworkSortChoices.jsx";
import { StudioLogo } from "./StudioSourceFlow.jsx";
import { StudioSortChoices } from "./StudioSortChoices.jsx";
import { TmdbEntityLink } from "./TmdbEntityLink.jsx";
import { TmdbKnownZeroNotice } from "./TmdbKnownZeroNotice.jsx";
import { SemanticSortChoices } from "./SemanticSortChoices.jsx";
import { TmdbEntityLogo } from "./TmdbEntityLogo.jsx";
import {
	focusSourceEditAlert,
	sourceEditErrorPresentation,
} from "./source-edit-error-presentation.js";

const usePrePaintLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const editableFieldByDiagnosticPath = Object.freeze({
	"$sourceEdit.sortBy": "sort",
	"$sourceEdit.title": "title",
});

function diagnosticField(path) {
	if (path?.endsWith(".title")) return "title";
	if (path?.endsWith(".combinationId")) return "combination";
	if (path?.endsWith(".tmdbId")) return "collection";
	if (path?.endsWith(".sortBy")) return "sort";
	return "dialog";
}

function firstMountedInvalidField(result, fieldRefs) {
	if (!result?.validationFailed || !Array.isArray(result.errors)) return null;
	for (const entry of result.errors) {
		const field = editableFieldByDiagnosticPath[entry?.path];
		const element = field ? fieldRefs[field]?.current : null;
		if (element) return element;
	}
	return null;
}

function scrollFieldIntoViewIfNeeded(element, scrollElement) {
	if (!element || !scrollElement) return false;
	const fieldBounds = element.getBoundingClientRect?.();
	const scrollBounds = scrollElement.getBoundingClientRect?.();
	if (!fieldBounds || !scrollBounds) return false;
	if (fieldBounds.top >= scrollBounds.top && fieldBounds.bottom <= scrollBounds.bottom) return false;
	element.scrollIntoView?.({ block: "nearest" });
	return true;
}

function SourceIdentity({ adapter, draft }) {
	return (
		<section className="source-edit-identity" aria-labelledby="source-edit-identity-title">
			<div>
				<p className="panel-kicker">Native identity</p>
				<h3 id="source-edit-identity-title">{adapter.label}</h3>
			</div>
			<code>{adapter.describeIdentity(draft)}</code>
		</section>
	);
}

function SourceTitleField({ draft, titleInputRef, error, onChange, helperText = null }) {
	const nameIsAutoManaged = draft.titleMode === "auto"
		|| (draft.selectedCollectionName !== null && draft.title === draft.selectedCollectionName);
	return (
		<div className="editor-field source-edit-title-field">
			<label htmlFor="source-edit-title-input">Source name</label>
			<input
				ref={titleInputRef}
				id="source-edit-title-input"
				type="text"
				value={draft.title}
				data-source-edit-field="title"
				aria-invalid={error ? "true" : undefined}
				aria-describedby="source-edit-title-help source-edit-title-error"
				onChange={(event) => onChange(event.target.value)}
			/>
			<p className="editor-field-help" id="source-edit-title-help">
				{helperText ?? (nameIsAutoManaged
					? "This name updates automatically until you customise it."
					: "This is the name shown in Nuvio. You can customise it.")}
			</p>
			<p className="editor-field-error" id="source-edit-title-error">
				{error?.message ?? ""}
			</p>
		</div>
	);
}

const importedSortOptionValue = "__source_edit_imported_sort__";

export function PeopleEditorFields({
	draft,
	combinationRef,
	countState,
	onChange,
	onDefaultTitle,
	onRetryCounts,
	onSortChange,
}) {
	const combination = PEOPLE_SOURCE_COMBINATIONS.find((entry) => entry.id === draft.combinationId);
	const sortOptions = peopleSortOptions(combination?.mediaType);
	const normalSortSelected = sortOptions.some((option) => option.value === draft.sortBy);
	const sortValue = normalSortSelected ? draft.sortBy : importedSortOptionValue;
	const importedSortLabel = typeof draft.originalSortBy === "string" && draft.originalSortBy.length > 0
		? `Current imported value (preserved): ${draft.originalSortBy}`
		: "Current imported value is not set (preserved)";
	return (
		<section className="source-edit-options" aria-labelledby="source-edit-options-title">
			<div className="add-source-section-heading">
				<div>
					<p className="panel-kicker">Role and media</p>
					<h3 id="source-edit-options-title">Choose this physical source</h3>
				</div>
			</div>
			<div className="source-edit-combinations" role="radiogroup" aria-label="People source combination">
				{PEOPLE_SOURCE_COMBINATIONS.map((combination, index) => (
					<label key={combination.id} className="source-edit-combination">
						<input
							ref={index === 0 ? combinationRef : undefined}
							type="radio"
							name="source-edit-people-combination"
							value={combination.id}
							checked={draft.combinationId === combination.id}
							onChange={() => onChange(combination.id)}
						/>
						<span>
							<strong>{combination.sourceTitle}</strong>
							<small>{combination.tmdbSourceType} · {combination.mediaType}</small>
						</span>
						<em data-count-state={countState.status}>{peopleEditCountLabel(countState, combination.countKey)}</em>
					</label>
				))}
			</div>
			{countState.status === "failed" ? (
				<div className="source-edit-count-failure" role="status">
					<span>Couldn’t check titles</span>
					<span aria-hidden="true">—</span>
					<button type="button" onClick={onRetryCounts}>Retry</button>
				</div>
			) : null}
			<button className="source-edit-title-reset" type="button" onClick={onDefaultTitle}>
				Use default title
			</button>
			<div className="editor-field source-edit-sort-field">
				<label htmlFor="source-edit-sort">Sort order</label>
				<select
					id="source-edit-sort"
					value={sortValue}
					onChange={(event) => {
						const option = sortOptions.find((entry) => entry.value === event.target.value);
						onSortChange(
							event.target.value === importedSortOptionValue
								? draft.originalSortBy
								: event.target.value,
							option?.id ?? null,
						);
					}}
				>
					{!normalSortSelected ? <option value={importedSortOptionValue}>{importedSortLabel}</option> : null}
					{sortOptions.map((option) => <option key={option.id} value={option.value}>{option.label}</option>)}
				</select>
				<p className="editor-field-help">Changing role or media does not rewrite an untouched imported sort value.</p>
			</div>
		</section>
	);
}

function studioCountText(count, mediaType) {
	if (count?.status === "ready") {
		const noun = mediaType === "TV" ? "series" : `movie${count.count === 1 ? "" : "s"}`;
		return {
			text: `${count.count.toLocaleString("en")} ${noun}`,
			state: count.count === 0 ? "zero" : "ready",
		};
	}
	if (count?.status === "unavailable") return { text: "Count unavailable", state: "unavailable" };
	return { text: "Checking…", state: "checking" };
}

export function StudioEditorFields({
	draft,
	studio,
	countState,
	sortRef,
	onSortChange,
}) {
	const mediaType = draft.mediaType;
	const countKey = mediaType === "TV" ? "series" : "movie";
	const countDimension = countState[countKey];
	const count = studioCountText(countDimension, mediaType);
	const selectedSortId = draft.sortOptionId ?? studioSortOptionId(draft.sortBy, mediaType);
	const mediaLabel = mediaType === "TV" ? "Series" : "Movies";
	return (
		<section className="source-edit-options studio-source-edit-options" aria-labelledby="source-edit-options-title">
			<div className="studio-configure-identity tmdb-review-identity">
				<StudioLogo studio={studio} size="w185" context="configure" loading="eager" />
				<div className="tmdb-review-identity-copy">
					<p className="panel-kicker">{mediaLabel} source</p>
					<h3 id="source-edit-options-title">{studio.name}</h3>
					{formatStudioLocation(studio) ? <p>{formatStudioLocation(studio)}</p> : null}
				</div>
				<TmdbEntityLink entityType="company" tmdbId={studio.id} entityName={studio.name} />
			</div>
			<div className="studio-edit-source-card" data-count-state={count.state}>
				<span><strong>{mediaLabel}</strong><small>COMPANY · {mediaType}</small></span>
				<em>{count.text}</em>
				<TmdbKnownZeroNotice count={countDimension} entity="studio" media={mediaType === "TV" ? "series" : "movies"} />
			</div>
			{selectedSortId === null ? <p className="studio-imported-sort-note">Current imported sort is preserved until you choose a supported sort: {draft.originalSortBy || "not set"}</p> : null}
			<StudioSortChoices selectedId={selectedSortId} name="studio-edit-sort" firstInputRef={sortRef} onChange={(optionId) => onSortChange(studioSortValue(optionId, mediaType), optionId)} />
		</section>
	);
}

export function NetworkEditorFields({ draft, network, countState, sortRef, titleField = null, onSortChange }) {
	const selectedSortId = draft.sortOptionId ?? networkSortOptionId(draft.sortBy);
	const count = countState?.status === "ready"
		? { text: `Series Count: ${countState.count.toLocaleString("en")}`, state: countState.count === 0 ? "zero" : "ready" }
		: countState?.status === "unavailable"
			? { text: "Count unavailable", state: "unavailable" }
			: { text: "Checking Series Count…", state: "checking" };
	return (
		<section className="source-edit-options studio-source-edit-options network-source-edit-options" aria-labelledby="source-edit-options-title">
			<div className="studio-configure-identity tmdb-review-identity network-configure-identity">
				<NetworkLogo network={network} size="w185" context="configure" loading="eager" />
				<div className="tmdb-review-identity-copy">
					<p className="panel-kicker">Network Series source</p>
					<h3 id="source-edit-options-title">{network.name}</h3>
					{formatNetworkLocation(network) ? <p>{formatNetworkLocation(network)}</p> : null}
				</div>
				<TmdbEntityLink entityType="network" tmdbId={network.id} entityName={network.name} />
			</div>
			<div className="studio-edit-source-card network-series-card" data-count-state={count.state}>
				<span><strong>Series</strong><small>One Network Series source</small></span>
				<em>{count.text}</em>
				<TmdbKnownZeroNotice count={countState} entity="network" media="series" />
			</div>
			{titleField}
			{selectedSortId === null ? <p className="studio-imported-sort-note">Current imported sort is preserved until you choose a supported sort: {draft.originalSortBy || "not set"}</p> : null}
			<NetworkSortChoices selectedId={selectedSortId} name="network-edit-sort" firstInputRef={sortRef} onChange={(optionId) => onSortChange(networkSortValue(optionId), optionId)} />
		</section>
	);
}

export function StreamingEditorFields({ draft, providerIdentity, sortRef, onDefaultName, onSortChange }) {
	const selectedSortId = draft.sortOptionId;
	const mediaLabel = draft.mediaType === "TV" ? "Series" : "Movies";
	return (
		<section className="source-edit-options studio-source-edit-options streaming-source-edit-options" aria-labelledby="source-edit-options-title">
			<div className="studio-configure-identity tmdb-review-identity streaming-edit-identity">
				<TmdbEntityLogo entity={providerIdentity} entityType="streaming-provider" size="w92" context="streaming-edit" loading="eager" />
				<div className="tmdb-review-identity-copy">
					<p className="panel-kicker">Streaming provider</p>
					<h3 id="source-edit-options-title">{providerIdentity.name}</h3>
					<p>Provider ID {draft.providerId} · {draft.regionCode} · {mediaLabel}</p>
				</div>
			</div>
			<p className="source-edit-fixed-note">Provider, region and media type stay fixed for this physical source.</p>
			{providerIdentity.resolved ? <button className="source-edit-title-reset" type="button" onClick={onDefaultName}>Use default name</button> : null}
			{selectedSortId === null ? <p className="studio-imported-sort-note">Current imported sort is preserved until you choose a supported sort: {draft.originalSortBy || "not set"}</p> : null}
			<SemanticSortChoices options={STREAMING_SORT_OPTIONS} selectedId={selectedSortId} name="streaming-edit-sort" firstInputRef={sortRef} onChange={onSortChange} />
		</section>
	);
}

export function SourceEditErrorPanel({ result, alertRef = null }) {
	const presentation = sourceEditErrorPresentation(result);
	return (
		<div ref={alertRef} className="editor-diagnostics source-edit-diagnostics" role="alert" aria-atomic="true" tabIndex={-1}>
			<h3>{presentation.heading}</h3>
			<ul>{presentation.errors.map((entry) => <li key={`${entry.code}-${entry.path}`}>{entry.message}</li>)}</ul>
		</div>
	);
}

function MovieCollectionEditorFields({ draft, session, chooseButtonRef, onChoose, onUseSelectedName }) {
	const collectionName = draft.selectedCollectionName ?? session.openingTitle;
	return (
		<section className="source-edit-options" aria-labelledby="source-edit-options-title">
			<div className="add-source-section-heading">
				<div>
					<p className="panel-kicker">Movie collection</p>
					<h3 id="source-edit-options-title">{collectionName}</h3>
				</div>
			</div>
			<p className="source-edit-collection-metadata">
				<span>TMDB collection {draft.tmdbId}</span>
				<small>{draft.selectedCollectionName
					? "This is the collection that will be saved."
					: "Current source title; no canonical TMDB name was fetched."}</small>
			</p>
			<div className="source-edit-option-actions">
				<button ref={chooseButtonRef} type="button" onClick={onChoose}>Choose another franchise</button>
				{draft.selectedCollectionName ? (
					<button type="button" onClick={onUseSelectedName}>Use selected collection name</button>
				) : null}
			</div>
		</section>
	);
}

export function SourceEditorDialog({
	provider,
	peopleProvider,
	networkCatalogueProvider,
	networkCountProvider,
	streamingCatalogueProvider,
	studioCatalogueProvider,
	studioCountProvider,
	session,
	initialDraft,
	initialPeopleCountState = null,
	initialNetworkCountState = null,
	initialStudioCountState = null,
	onCancel,
	onSave,
}) {
	const adapter = sourceEditorById(session.adapterId);
	const [draft, setDraft] = useState(initialDraft);
	const [stage, setStage] = useState("edit");
	const [failure, setFailure] = useState(null);
	const [peopleCountState, setPeopleCountState] = useState(() => (
		initialPeopleCountState ?? (session.adapterId === PEOPLE_SOURCE_EDITOR_ID
			? Object.freeze({ ...INITIAL_PEOPLE_EDIT_COUNT_STATE, status: "checking" })
			: INITIAL_PEOPLE_EDIT_COUNT_STATE)
	));
	const [studioCountState, setStudioCountState] = useState(() => (
		initialStudioCountState ?? (session.adapterId === STUDIO_SOURCE_EDITOR_ID
			? checkingStudioEditCounts()
			: INITIAL_STUDIO_EDIT_COUNT_STATE)
	));
	const [networkCountState, setNetworkCountState] = useState(() => (
		initialNetworkCountState ?? (session.adapterId === NETWORK_SOURCE_EDITOR_ID
			? checkingNetworkEditCount()
			: INITIAL_NETWORK_EDIT_COUNT_STATE)
	));
	const [networkIdentity, setNetworkIdentity] = useState(() => Object.freeze({
		id: initialDraft.tmdbId,
		name: initialDraft.networkName ?? session.openingTitle,
		country: "",
		headquarters: "",
		logoPath: null,
	}));
	const [studioIdentity, setStudioIdentity] = useState(() => Object.freeze({
		id: initialDraft.tmdbId,
		name: initialDraft.studioName ?? session.openingTitle,
		parentCompany: "",
		country: "",
		headquarters: "",
		logoPath: null,
		movieCount: null,
	}));
	const [streamingProviderIdentity, setStreamingProviderIdentity] = useState(() => Object.freeze({
		id: initialDraft.providerId,
		name: `Provider ${initialDraft.providerId}`,
		logoPath: null,
		resolved: false,
	}));
	const [submitting, setSubmitting] = useState(false);
	const [viewportStyle, setViewportStyle] = useState(() => (
		typeof window === "undefined" ? null : resolveAddSourceViewportStyle(window)
	));
	const dialogRef = useRef(null);
	const scrollRef = useRef(null);
	const titleInputRef = useRef(null);
	const combinationRef = useRef(null);
	const chooseButtonRef = useRef(null);
	const studioSortRef = useRef(null);
	const networkSortRef = useRef(null);
	const streamingSortRef = useRef(null);
	const pickerInputRef = useRef(null);
	const diagnosticRef = useRef(null);
	const peopleCountSessionRef = useRef(null);
	const studioCountSessionRef = useRef(null);
	const networkCountSessionRef = useRef(null);
	const peopleCountGenerationRef = useRef(0);
	const studioCountGenerationRef = useRef(0);
	const networkCountGenerationRef = useRef(0);
	const pendingFailureFocusRef = useRef(false);
	if (
		session.adapterId === PEOPLE_SOURCE_EDITOR_ID
		&& peopleCountSessionRef.current === null
		&& typeof peopleProvider?.getPerson === "function"
	) {
		peopleCountSessionRef.current = createPeopleEditCountSession({
			provider: peopleProvider,
			personId: initialDraft.tmdbId,
		});
	}
	if (
		session.adapterId === NETWORK_SOURCE_EDITOR_ID
		&& networkCountSessionRef.current === null
		&& typeof networkCountProvider?.getNetworkCount === "function"
	) {
		networkCountSessionRef.current = createNetworkEditCountSession({ provider: networkCountProvider, networkId: initialDraft.tmdbId });
	}
	if (
		session.adapterId === STUDIO_SOURCE_EDITOR_ID
		&& studioCountSessionRef.current === null
		&& typeof studioCountProvider?.getStudioCounts === "function"
	) {
		studioCountSessionRef.current = createStudioEditCountSession({
			provider: studioCountProvider,
			studioId: initialDraft.tmdbId,
		});
	}

	const diagnostics = failure?.errors ?? [];
	const titleError = diagnostics.find((entry) => diagnosticField(entry.path) === "title") ?? null;

	usePrePaintLayoutEffect(() => {
		const unlockBody = lockAddSourceDocumentBody();
		const stopObservingViewport = observeAddSourceViewport(setViewportStyle);
		focusElementWithoutScroll(titleInputRef.current ?? networkSortRef.current ?? studioSortRef.current ?? streamingSortRef.current ?? dialogRef.current);
		return () => {
			stopObservingViewport();
			unlockBody();
		};
	}, []);

	useEffect(() => {
		if (stage === "picker") focusElementWithoutScroll(pickerInputRef.current);
	}, [stage]);

	useEffect(() => {
		const countSession = peopleCountSessionRef.current;
		if (countSession === null) return undefined;
		let active = true;
		const generation = ++peopleCountGenerationRef.current;
		countSession.load().then((state) => {
			if (active && generation === peopleCountGenerationRef.current) setPeopleCountState(state);
		});
		return () => { active = false; };
	}, []);

	useEffect(() => {
		if (session.adapterId !== NETWORK_SOURCE_EDITOR_ID || typeof networkCatalogueProvider?.searchNetworks !== "function") return undefined;
		let active = true;
		networkCatalogueProvider.searchNetworks(parseNetworkSearchInput(String(initialDraft.tmdbId))).then((result) => {
			const network = result?.ok ? result.data?.results?.[0] : null;
			if (active && network?.id === initialDraft.tmdbId) setNetworkIdentity(network);
		});
		return () => { active = false; };
	}, [initialDraft.tmdbId, networkCatalogueProvider, session.adapterId]);

	useEffect(() => {
		if (
			session.adapterId !== STUDIO_SOURCE_EDITOR_ID
			|| typeof studioCatalogueProvider?.searchStudios !== "function"
		) return undefined;
		let active = true;
		studioCatalogueProvider.searchStudios(parseStudioSearchInput(String(initialDraft.tmdbId))).then((result) => {
			const studio = result?.ok ? result.data?.results?.[0] : null;
			if (active && studio?.id === initialDraft.tmdbId) setStudioIdentity(studio);
		});
		return () => { active = false; };
	}, [initialDraft.tmdbId, session.adapterId, studioCatalogueProvider]);

	useEffect(() => {
		if (session.adapterId !== STREAMING_SOURCE_EDITOR_ID || typeof streamingCatalogueProvider?.loadCatalogue !== "function") return undefined;
		let active = true;
		streamingCatalogueProvider.loadCatalogue().then((result) => {
			const providerIdentity = result?.ok
				? result.data?.providers?.find((entry) => entry.id === initialDraft.providerId)
				: null;
			if (active && providerIdentity) setStreamingProviderIdentity(Object.freeze({ ...providerIdentity, resolved: true }));
		}).catch(() => {});
		return () => { active = false; };
	}, [initialDraft.providerId, session.adapterId, streamingCatalogueProvider]);

	useEffect(() => {
		const countSession = networkCountSessionRef.current;
		if (countSession === null || initialNetworkCountState !== null) return undefined;
		let active = true;
		const generation = ++networkCountGenerationRef.current;
		countSession.load().then((state) => {
			if (active && generation === networkCountGenerationRef.current && state !== null) setNetworkCountState(state);
		});
		return () => {
			active = false;
			networkCountGenerationRef.current += 1;
			countSession.cancel();
		};
	}, []);

	useEffect(() => {
		const countSession = studioCountSessionRef.current;
		if (countSession === null || initialStudioCountState !== null) return undefined;
		let active = true;
		const generation = ++studioCountGenerationRef.current;
		countSession.load().then((state) => {
			if (active && generation === studioCountGenerationRef.current && state !== null) setStudioCountState(state);
		});
		return () => {
			active = false;
			studioCountGenerationRef.current += 1;
			countSession.cancel();
		};
	}, []);

	useEffect(() => {
		if (!failure || !pendingFailureFocusRef.current) return;
		pendingFailureFocusRef.current = false;
		const sortRef = networkSortRef.current ? networkSortRef : streamingSortRef.current ? streamingSortRef : studioSortRef;
		const invalidField = firstMountedInvalidField(failure, { sort: sortRef, title: titleInputRef });
		if (invalidField) {
			scrollFieldIntoViewIfNeeded(invalidField, scrollRef.current);
			focusElementWithoutScroll(invalidField);
			return;
		}
		focusSourceEditAlert(diagnosticRef.current ?? dialogRef.current);
	}, [failure]);

	function clearFieldDiagnostic(field) {
		setFailure((current) => {
			if (current === null) return null;
			const errors = current.errors.filter((entry) => diagnosticField(entry.path) !== field);
			return errors.length === 0 ? null : { ...current, errors };
		});
	}

	function retryPeopleCounts() {
		const countSession = peopleCountSessionRef.current;
		if (countSession === null) return;
		const generation = ++peopleCountGenerationRef.current;
		setPeopleCountState(Object.freeze({ ...INITIAL_PEOPLE_EDIT_COUNT_STATE, status: "checking" }));
		countSession.load({ retry: true }).then((state) => {
			if (generation === peopleCountGenerationRef.current) setPeopleCountState(state);
		});
	}

	function submit(event) {
		event.preventDefault();
		if (submitting || stage !== "edit") return;
		setSubmitting(true);
		const result = onSave(draft);
		if (result?.ok || result?.closeRequired) return;
		setSubmitting(false);
		pendingFailureFocusRef.current = true;
		setFailure(result ?? { errors: [] });
	}

	function cancel() {
		if (!submitting) onCancel();
	}

	const content = (
		<div className="add-source-portal source-edit-portal" data-source-edit-portal="true" data-mobile-surface="opaque">
			<div
				className="settings-modal-backdrop add-source-backdrop source-edit-backdrop"
				data-source-edit-backdrop="true"
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
					className="add-source-dialog source-edit-dialog"
					data-source-edit-modal="true"
					data-source-edit-adapter={session.adapterId}
					data-source-edit-stage={stage}
					role="dialog"
					aria-modal="true"
					aria-labelledby="source-edit-title"
					aria-describedby="source-edit-description"
					tabIndex={-1}
					onKeyDown={(event) => handleDialogKeyDown(event, dialogRef.current, cancel)}
				>
					<header className="add-source-heading">
						<div className="add-source-heading-row">
							{stage === "picker" ? (
								<button
									className="add-source-header-action"
									type="button"
									data-action="back-to-source-edit"
									onClick={() => {
										setStage("edit");
										queueMicrotask(() => focusElementWithoutScroll(chooseButtonRef.current));
									}}
								>
									<span aria-hidden="true">←</span> Back
								</button>
							) : <span className="add-source-header-spacer" aria-hidden="true" />}
							<div>
								<h2 id="source-edit-title">Edit source</h2>
								<p>In {session.folderTitle}</p>
							</div>
							<button className="add-source-header-action add-source-close-action" type="button" aria-label="Close Edit source" onClick={cancel}>Close</button>
						</div>
						<p id="source-edit-description" className="add-source-heading-description">
							{stage === "picker"
								? "Choose a replacement TMDB movie franchise."
								: session.adapterId === STUDIO_SOURCE_EDITOR_ID
									? "Update this Studio source name and title order."
								: session.adapterId === NETWORK_SOURCE_EDITOR_ID
										? "Update this Network Series source name and title order."
										: session.adapterId === STREAMING_SOURCE_EDITOR_ID
											? "Update this Streaming source name and title order. Provider, region and media stay fixed."
									: "Change only the supported fields for this physical source."}
						</p>
					</header>

					<form className="add-source-form source-edit-form" onSubmit={submit} noValidate>
						<div ref={scrollRef} className="add-source-scroll source-edit-scroll">
							{stage === "picker" ? (
								<MovieCollectionPicker
									provider={provider}
									inputRef={pickerInputRef}
									onSelect={(collection) => {
										setDraft((current) => chooseMovieCollection(current, collection));
										setFailure(null);
										setStage("edit");
										queueMicrotask(() => focusElementWithoutScroll(chooseButtonRef.current));
									}}
								/>
							) : (
								<>
									{failure ? (
										<SourceEditErrorPanel result={failure} alertRef={diagnosticRef} />
									) : null}
									{![STUDIO_SOURCE_EDITOR_ID, NETWORK_SOURCE_EDITOR_ID, STREAMING_SOURCE_EDITOR_ID].includes(session.adapterId) ? <SourceIdentity adapter={adapter} draft={draft} /> : null}
									{session.adapterId !== NETWORK_SOURCE_EDITOR_ID ? <SourceTitleField
											draft={draft}
											titleInputRef={titleInputRef}
											error={titleError}
											helperText={session.adapterId === STUDIO_SOURCE_EDITOR_ID
												? "Changes how this source appears in Nuvio, not which Studio it represents."
												: session.adapterId === NETWORK_SOURCE_EDITOR_ID
													? "Changes how this source appears in Nuvio, not which Network it represents."
													: null}
												onChange={(title) => {
												setDraft((current) => updateSourceEditTitle(current, title));
												clearFieldDiagnostic("title");
											}}
										/> : null}
									{session.adapterId === PEOPLE_SOURCE_EDITOR_ID ? (
										<PeopleEditorFields
											draft={draft}
											combinationRef={combinationRef}
											countState={peopleCountState}
											onChange={(combinationId) => {
												setDraft((current) => choosePeopleSourceCombination(current, combinationId));
												setFailure(null);
											}}
											onDefaultTitle={() => {
												setDraft(usePeopleDefaultTitle);
												clearFieldDiagnostic("title");
											}}
											onRetryCounts={retryPeopleCounts}
											onSortChange={(sortBy, sortOptionId) => {
												setDraft((current) => updatePeopleSourceSort(current, sortBy, sortOptionId));
												clearFieldDiagnostic("sort");
											}}
										/>
									) : session.adapterId === NETWORK_SOURCE_EDITOR_ID ? (
										<NetworkEditorFields
											draft={draft}
											network={networkIdentity}
											countState={networkCountState}
											sortRef={networkSortRef}
											titleField={<SourceTitleField
												draft={draft}
												titleInputRef={titleInputRef}
												error={titleError}
												helperText="Changes how this source appears in Nuvio, not which Network it represents."
												onChange={(title) => {
													setDraft((current) => updateSourceEditTitle(current, title));
													clearFieldDiagnostic("title");
												}}
											/>}
											onSortChange={(sortBy, optionId) => {
												setDraft((current) => updateNetworkSourceSort(current, sortBy, optionId));
												clearFieldDiagnostic("sort");
											}}
										/>
									) : session.adapterId === STUDIO_SOURCE_EDITOR_ID ? (
										<StudioEditorFields
											draft={draft}
											studio={studioIdentity}
											countState={studioCountState}
											sortRef={studioSortRef}
											onSortChange={(sortBy, sortOptionId) => {
												setDraft((current) => updateStudioSourceSort(current, sortBy, sortOptionId));
												clearFieldDiagnostic("sort");
											}}
										/>
									) : session.adapterId === STREAMING_SOURCE_EDITOR_ID ? (
										<StreamingEditorFields
											draft={draft}
											providerIdentity={streamingProviderIdentity}
											sortRef={streamingSortRef}
											onDefaultName={() => {
												const defaultName = streamingDefaultSourceName(streamingProviderIdentity.name, draft.regionCode, draft.mediaType);
												if (defaultName !== null) setDraft((current) => updateSourceEditTitle(current, defaultName));
												clearFieldDiagnostic("title");
											}}
											onSortChange={(optionId) => {
												setDraft((current) => updateStreamingSourceSort(current, streamingEditSortValue(optionId, current.mediaType), optionId));
												clearFieldDiagnostic("sort");
											}}
										/>
									) : session.adapterId === MOVIE_COLLECTION_SOURCE_EDITOR_ID ? (
										<MovieCollectionEditorFields
											draft={draft}
											session={session}
											chooseButtonRef={chooseButtonRef}
											onChoose={() => setStage("picker")}
											onUseSelectedName={() => {
												setDraft(useSelectedMovieCollectionName);
												clearFieldDiagnostic("title");
											}}
										/>
									) : null}
								</>
							)}
						</div>
						<footer className="add-source-actions source-edit-actions">
							{stage === "edit" ? (
								<button className="editor-apply" type="submit" data-action="save-source-edit" disabled={submitting}>
									{submitting ? "Saving changes…" : "Save changes"}
								</button>
							) : null}
							<button className="editor-cancel" type="button" data-action="cancel-source-edit" disabled={submitting} onClick={cancel}>Cancel</button>
						</footer>
					</form>
				</section>
			</div>
		</div>
	);

	return typeof document === "undefined" ? content : createPortal(content, document.body);
}
