import {
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import {
	formatNetworkLocation,
	formatStudioLocation,
	createAsyncRequestCoordinator,
	DECADES_SORT_OPTIONS,
	GENRE_SORT_OPTIONS,
	networkSortOptionId,
	networkSortValue,
	parseNetworkSearchInput,
	parseStudioSearchInput,
	PEOPLE_SOURCE_COMBINATIONS,
	requestSourceTitlePreview,
	sourceTitlePreviewProviderAvailable,
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
	DECADE_SOURCE_EDITOR_ID,
	decadeEditSortValue,
	GENRE_SOURCE_EDITOR_ID,
	genreDefaultSourceName,
	genreEditSortValue,
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
	prepareSourceEditPreview,
	sourceEditorById,
	updatePeopleSourceSort,
	updateNetworkSourceSort,
	updateStudioSourceSort,
	updateStreamingSourceSort,
	updateDecadeSourceAdvanced,
	updateDecadeSourceSort,
	updateGenreSourceAdvanced,
	updateGenreSourceSort,
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
import { NetworkSortChoices } from "./NetworkSortChoices.jsx";
import { StudioSortChoices } from "./StudioSortChoices.jsx";
import { TmdbEntityLink } from "./TmdbEntityLink.jsx";
import { TmdbKnownZeroNotice } from "./TmdbKnownZeroNotice.jsx";
import { SemanticSortChoices } from "./SemanticSortChoices.jsx";
import { GenreAdvancedOptions, GenreAdvancedSecondarySurface } from "./GenreAdvancedOptions.jsx";
import { DecadesAdvancedOptions } from "./DecadesAdvancedOptions.jsx";
import { SourceTitlePreviewDialog } from "./SourceTitlePreviewDialog.jsx";
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

function PeopleSourceIdentity({ draft }) {
	return (
		<p className="source-edit-people-identity" aria-label={`TMDB person ${draft.tmdbId}`}>
			TMDB person <strong>{draft.tmdbId}</strong>
		</p>
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

export function PeopleEditorFields({
	draft,
	combinationRef,
	countState,
	sortRef,
	onChange,
	onDefaultTitle,
	onRetryCounts,
	onSortChange,
}) {
	const combination = PEOPLE_SOURCE_COMBINATIONS.find((entry) => entry.id === draft.combinationId);
	const sortOptions = peopleSortOptions(combination?.mediaType);
	const selectedSortId = sortOptions.find((option) => option.value === draft.sortBy)?.id ?? null;
	return (
		<section className="source-edit-options" aria-labelledby="source-edit-options-title">
			<div className="add-source-section-heading">
				<div>
					<p className="panel-kicker">Role and media</p>
					<h3 id="source-edit-options-title">Choose role and media</h3>
				</div>
			</div>
			<div className="source-edit-combinations" role="radiogroup" aria-label="People source combination">
				{PEOPLE_SOURCE_COMBINATIONS.map((combination, index) => {
					const selected = draft.combinationId === combination.id;
					return (
						<label key={combination.id} className="source-edit-combination" data-selected={selected ? "true" : undefined}>
							<input
								ref={index === 0 ? combinationRef : undefined}
								className="visually-hidden selectable-card-checkbox"
								type="radio"
								name="source-edit-people-combination"
								value={combination.id}
								checked={selected}
								onChange={() => onChange(combination.id)}
							/>
							<span className="selectable-card-indicator" data-selection-indicator="true" data-selection-state={selected ? "selected" : "unselected"} aria-hidden="true">{selected ? "✓" : ""}</span>
							<span>
								<strong>{combination.role === "directing" ? "Directing" : "Acting"} · {combination.media === "series" ? "Series" : "Movies"}</strong>
							</span>
							<em data-count-state={countState.status}>{peopleEditCountLabel(countState, combination.countKey)}</em>
						</label>
					);
				})}
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
			{selectedSortId === null ? <p className="studio-imported-sort-note">Current imported sort is preserved until you choose a supported sort: {draft.originalSortBy || "not set"}</p> : null}
			<SemanticSortChoices
				options={sortOptions}
				selectedId={selectedSortId}
				name="people-edit-sort"
				firstInputRef={sortRef}
				onChange={(optionId) => {
					const option = sortOptions.find((entry) => entry.id === optionId);
					onSortChange(option.value, option.id);
				}}
				helper="Changing role or media does not rewrite an untouched imported sort value."
			/>
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
			<div className="add-source-section-heading tmdb-review-identity">
				<div className="tmdb-review-identity-copy">
					<p className="panel-kicker">{mediaLabel} source</p>
					<h3 id="source-edit-options-title">{studio.name}</h3>
					{formatStudioLocation(studio) ? <p className="editor-field-help">{formatStudioLocation(studio)}</p> : null}
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
			<div className="add-source-section-heading tmdb-review-identity">
				<div className="tmdb-review-identity-copy">
					<p className="panel-kicker">Network Series source</p>
					<h3 id="source-edit-options-title">{network.name}</h3>
					{formatNetworkLocation(network) ? <p className="editor-field-help">{formatNetworkLocation(network)}</p> : null}
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
			<div className="add-source-section-heading">
				<div className="tmdb-review-identity-copy">
					<p className="panel-kicker">Streaming provider</p>
					<h3 id="source-edit-options-title">{providerIdentity.name}</h3>
					<p className="editor-field-help">Provider ID {draft.providerId} · {draft.regionCode} · {mediaLabel}</p>
				</div>
			</div>
			<p className="source-edit-fixed-note">Provider, region and media type stay fixed for this physical source.</p>
			{providerIdentity.resolved ? <button className="source-edit-title-reset" type="button" onClick={onDefaultName}>Use default name</button> : null}
			{selectedSortId === null ? <p className="studio-imported-sort-note">Current imported sort is preserved until you choose a supported sort: {draft.originalSortBy || "not set"}</p> : null}
			<SemanticSortChoices options={STREAMING_SORT_OPTIONS} selectedId={selectedSortId} name="streaming-edit-sort" firstInputRef={sortRef} onChange={onSortChange} />
		</section>
	);
}

export function GenreEditorFields({ draft, sortRef, onDefaultName, onSortChange, onAdvancedChange, onOpenSecondary }) {
	const mediaLabel = draft.mediaType === "TV" ? "Series" : "Movies";
	return (
		<section className="source-edit-options studio-source-edit-options genre-source-edit-options" aria-labelledby="source-edit-options-title">
			<div className="add-source-section-heading">
				<div className="tmdb-review-identity-copy">
					<p className="panel-kicker">Official TMDB Genre</p>
					<h3 id="source-edit-options-title">{draft.genreName}</h3>
					<p className="editor-field-help">Genre ID {draft.genreId} · {mediaLabel}</p>
				</div>
			</div>
			<p className="source-edit-fixed-note">Genre ID and media type stay fixed for this source.</p>
			<button className="source-edit-title-reset" type="button" onClick={onDefaultName}>Use default name</button>
			{draft.sortOptionId === null ? <p className="studio-imported-sort-note">Current imported sort is preserved until you choose a supported sort: {draft.originalSortBy || "not set"}</p> : null}
			<SemanticSortChoices options={GENRE_SORT_OPTIONS} selectedId={draft.sortOptionId} name="genre-edit-sort" firstInputRef={sortRef} onChange={onSortChange} />
			<GenreAdvancedOptions
				value={draft.advanced}
				includedGenres={[draft.genreName]}
				sharedMediaChoice={draft.mediaType === "TV" ? "series" : "movies"}
				onChange={onAdvancedChange}
				onOpenSecondary={onOpenSecondary}
				idPrefix="genre-edit-advanced"
			/>
		</section>
	);
}

export function DecadeEditorFields({ draft, sortRef, onSortChange, onAdvancedChange }) {
	const mediaMode = draft.mediaType === "TV" ? "series" : "movies";
	return (
		<>
			<section className="source-edit-options decade-source-fixed" aria-labelledby="decade-source-fixed-title">
				<div><p className="panel-kicker">Fixed structure</p><h3 id="decade-source-fixed-title">Decade source</h3></div>
				<dl>
					<div><dt>Period</dt><dd>{draft.periodLabel}</dd></div>
					<div><dt>Media</dt><dd>{draft.mediaType === "TV" ? "Series" : "Movies"}</dd></div>
					{draft.genreName ? <div><dt>Included Genre</dt><dd>{draft.genreName}</dd></div> : null}
				</dl>
				<p className="source-edit-fixed-note">Period dates, media and the included Genre stay fixed. Use the Decades creation flow to build a different structure.</p>
			</section>
			<div ref={sortRef} tabIndex={-1}>
				<SemanticSortChoices options={DECADES_SORT_OPTIONS} selectedId={draft.sortOptionId} name="decade-edit-sort" legend="Sort titles by" onChange={onSortChange} />
			</div>
			<DecadesAdvancedOptions value={draft.advanced} mediaMode={mediaMode} includedGenres={draft.genreName ? [draft.genreName] : []} onChange={onAdvancedChange} idPrefix="decade-edit-advanced" />
		</>
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

function SourceEditTitlePreview({ preview, onClose, onRetry }) {
	return (
		<SourceTitlePreviewDialog
			preview={preview}
			titleId="source-edit-preview-title"
			backdropProps={{ "data-source-edit-preview-backdrop": "true" }}
			onClose={onClose}
			onRetry={onRetry}
		/>
	);
}

export function SourceEditorDialog({
	provider,
	peopleProvider,
	networkPreviewProvider,
	networkCatalogueProvider,
	networkCountProvider,
	genrePreviewProvider,
	streamingCatalogueProvider,
	streamingPreviewProvider,
	studioCatalogueProvider,
	studioCountProvider,
	studioPreviewProvider,
	decadePreviewProvider,
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
	const [genreSecondarySurface, setGenreSecondarySurface] = useState(null);
	const [failure, setFailure] = useState(null);
	const [preview, setPreview] = useState(null);
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
	const peopleSortRef = useRef(null);
	const chooseButtonRef = useRef(null);
	const studioSortRef = useRef(null);
	const networkSortRef = useRef(null);
	const streamingSortRef = useRef(null);
	const decadeSortRef = useRef(null);
	const genreSortRef = useRef(null);
	const genreSecondaryHeadingRef = useRef(null);
	const genreSecondaryReturnFocusRef = useRef(null);
	const pickerInputRef = useRef(null);
	const diagnosticRef = useRef(null);
	const peopleCountSessionRef = useRef(null);
	const studioCountSessionRef = useRef(null);
	const networkCountSessionRef = useRef(null);
	const peopleCountGenerationRef = useRef(0);
	const studioCountGenerationRef = useRef(0);
	const networkCountGenerationRef = useRef(0);
	const pendingFailureFocusRef = useRef(false);
	const previewTriggerRef = useRef(null);
	const previewCoordinatorRef = useRef(null);
	if (previewCoordinatorRef.current === null) previewCoordinatorRef.current = createAsyncRequestCoordinator();
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
	const previewCandidate = useMemo(() => prepareSourceEditPreview(session, draft), [draft, session]);
	const previewProviders = useMemo(() => Object.freeze({
		collection: provider,
		people: peopleProvider,
		studio: studioPreviewProvider,
		network: networkPreviewProvider,
		streaming: streamingPreviewProvider,
		genre: genrePreviewProvider,
		decade: decadePreviewProvider,
	}), [decadePreviewProvider, genrePreviewProvider, networkPreviewProvider, peopleProvider, provider, streamingPreviewProvider, studioPreviewProvider]);
	const previewAvailable = previewCandidate.previewable && sourceTitlePreviewProviderAvailable(previewCandidate.request, previewProviders);
	const previewGuidance = previewCandidate.guidance ?? (!previewAvailable ? "Preview is unavailable right now." : null);

	usePrePaintLayoutEffect(() => {
		const unlockBody = lockAddSourceDocumentBody();
		const stopObservingViewport = observeAddSourceViewport(setViewportStyle);
		focusElementWithoutScroll(titleInputRef.current ?? peopleSortRef.current ?? networkSortRef.current ?? studioSortRef.current ?? streamingSortRef.current ?? decadeSortRef.current ?? genreSortRef.current ?? dialogRef.current);
		return () => {
			stopObservingViewport();
			unlockBody();
		};
	}, []);

	useEffect(() => {
		if (stage === "picker") focusElementWithoutScroll(pickerInputRef.current);
	}, [stage]);

	useEffect(() => {
		if (genreSecondarySurface) {
			focusElementWithoutScroll(genreSecondaryHeadingRef.current);
			return;
		}
		if (genreSecondaryReturnFocusRef.current) {
			const trigger = genreSecondaryReturnFocusRef.current;
			genreSecondaryReturnFocusRef.current = null;
			focusElementWithoutScroll(trigger);
		}
	}, [genreSecondarySurface]);

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
		const sortRef = peopleSortRef.current ? peopleSortRef : networkSortRef.current ? networkSortRef : streamingSortRef.current ? streamingSortRef : decadeSortRef.current ? decadeSortRef : genreSortRef.current ? genreSortRef : studioSortRef;
		const invalidField = firstMountedInvalidField(failure, { sort: sortRef, title: titleInputRef });
		if (invalidField) {
			scrollFieldIntoViewIfNeeded(invalidField, scrollRef.current);
			focusElementWithoutScroll(invalidField);
			return;
		}
		focusSourceEditAlert(diagnosticRef.current ?? dialogRef.current);
	}, [failure]);

	useEffect(() => () => previewCoordinatorRef.current?.cancel({ notify: false }), []);

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
		if (genreSecondarySurface || submitting || stage !== "edit") return;
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

	function openGenreSecondarySurface(surface, trigger) {
		genreSecondaryReturnFocusRef.current = trigger;
		setGenreSecondarySurface(surface);
	}

	function closeGenreSecondarySurface() {
		setGenreSecondarySurface(null);
	}

	async function loadPreview(candidate) {
		setPreview({ status: "loading", candidate, data: null, error: null });
		const outcome = await previewCoordinatorRef.current.run(
			({ signal }) => requestSourceTitlePreview(candidate.request, previewProviders, signal),
			candidate.request.kind,
		);
		if (!outcome.accepted) return;
		if (outcome.result?.ok) setPreview({ status: "ready", candidate, data: outcome.result.data, error: null });
		else if (outcome.result?.error?.kind !== "aborted") setPreview({ status: "error", candidate, data: null, error: outcome.result?.error });
	}

	function openPreview(event) {
		if (!previewAvailable || stage !== "edit" || genreSecondarySurface) return;
		previewTriggerRef.current = event.currentTarget;
		loadPreview(previewCandidate);
	}

	function closePreview() {
		previewCoordinatorRef.current.cancel({ notify: false });
		setPreview(null);
		const trigger = previewTriggerRef.current;
		previewTriggerRef.current = null;
		window.requestAnimationFrame(() => focusElementWithoutScroll(trigger));
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
					data-secondary-surface={genreSecondarySurface ?? undefined}
					data-preview-open={preview ? "true" : undefined}
					role="dialog"
					aria-modal="true"
					aria-labelledby="source-edit-title"
					aria-describedby="source-edit-description"
					tabIndex={-1}
					onKeyDown={(event) => {
						if (genreSecondarySurface && event.key === "Escape") {
							event.preventDefault();
							event.stopPropagation();
							closeGenreSecondarySurface();
							return;
						}
						handleDialogKeyDown(event, dialogRef.current, cancel);
					}}
				>
					<header className="add-source-heading" inert={genreSecondarySurface || preview || undefined} aria-hidden={genreSecondarySurface || preview ? "true" : undefined}>
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
										: session.adapterId === GENRE_SOURCE_EDITOR_ID
											? "Update this Genre source name, title order and supported filters. Genre ID and media stay fixed."
										: session.adapterId === DECADE_SOURCE_EDITOR_ID
											? "Update this Decade source name, title order and supported filters. Period, media and included Genre stay fixed."
										: session.adapterId === PEOPLE_SOURCE_EDITOR_ID
											? "Update this People source role, media, name and title order."
									: "Change only the supported fields for this physical source."}
						</p>
					</header>

					<form className="add-source-form source-edit-form" onSubmit={submit} noValidate>
						<div ref={scrollRef} className="add-source-scroll source-edit-scroll" inert={genreSecondarySurface || preview || undefined} aria-hidden={genreSecondarySurface || preview ? "true" : undefined}>
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
									{session.adapterId === PEOPLE_SOURCE_EDITOR_ID
										? <PeopleSourceIdentity draft={draft} />
										: ![STUDIO_SOURCE_EDITOR_ID, NETWORK_SOURCE_EDITOR_ID, STREAMING_SOURCE_EDITOR_ID, DECADE_SOURCE_EDITOR_ID, GENRE_SOURCE_EDITOR_ID].includes(session.adapterId)
											? <SourceIdentity adapter={adapter} draft={draft} />
											: null}
									{session.adapterId !== NETWORK_SOURCE_EDITOR_ID ? <SourceTitleField
											draft={draft}
											titleInputRef={titleInputRef}
											error={titleError}
											helperText={session.adapterId === STUDIO_SOURCE_EDITOR_ID
												? "Changes how this source appears in Nuvio, not which Studio it represents."
											: session.adapterId === NETWORK_SOURCE_EDITOR_ID
												? "Changes how this source appears in Nuvio, not which Network it represents."
											: session.adapterId === GENRE_SOURCE_EDITOR_ID
												? "Changes how this source appears in Nuvio, not which Genre it represents."
											: session.adapterId === DECADE_SOURCE_EDITOR_ID
												? "Changes how this source appears in Nuvio, not its fixed Decade structure."
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
											sortRef={peopleSortRef}
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
									) : session.adapterId === DECADE_SOURCE_EDITOR_ID ? (
										<DecadeEditorFields
											draft={draft}
											sortRef={decadeSortRef}
											onSortChange={(optionId) => {
												setDraft((current) => updateDecadeSourceSort(current, decadeEditSortValue(optionId, current.mediaType), optionId));
												clearFieldDiagnostic("sort");
											}}
											onAdvancedChange={(advanced) => {
												setDraft((current) => updateDecadeSourceAdvanced(current, advanced));
												setFailure(null);
											}}
										/>
									) : session.adapterId === GENRE_SOURCE_EDITOR_ID ? (
										<GenreEditorFields
											draft={draft}
											sortRef={genreSortRef}
											onDefaultName={() => {
												const defaultName = genreDefaultSourceName(draft.genreName, draft.mediaType);
												if (defaultName !== null) setDraft((current) => updateSourceEditTitle(current, defaultName));
												clearFieldDiagnostic("title");
											}}
											onSortChange={(optionId) => {
												setDraft((current) => updateGenreSourceSort(current, genreEditSortValue(optionId, current.mediaType), optionId));
												clearFieldDiagnostic("sort");
											}}
											onAdvancedChange={(advanced) => {
												setDraft((current) => updateGenreSourceAdvanced(current, advanced));
												setFailure(null);
											}}
											onOpenSecondary={openGenreSecondarySurface}
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
									<div className="source-edit-preview-action genre-hierarchy-configure-row-actions">
										<button type="button" aria-haspopup="dialog" data-action="preview-source-edit" disabled={!previewAvailable || submitting} onClick={openPreview}>Preview titles</button>
										{previewGuidance ? <p className="editor-field-help" role="status">{previewGuidance}</p> : null}
									</div>
								</>
							)}
						</div>
						{genreSecondarySurface ? <div className="genre-secondary-surface" data-surface={genreSecondarySurface}><GenreAdvancedSecondarySurface surface={genreSecondarySurface} value={draft.advanced} includedGenres={[draft.genreName]} sharedMediaChoice={draft.mediaType === "TV" ? "series" : "movies"} onChange={(advanced) => { setDraft((current) => updateGenreSourceAdvanced(current, advanced)); setFailure(null); }} onDone={closeGenreSecondarySurface} focusRef={genreSecondaryHeadingRef} /></div> : null}
						{!genreSecondarySurface ? <footer className="add-source-actions source-edit-actions" inert={preview || undefined} aria-hidden={preview ? "true" : undefined}>
							{stage === "edit" ? (
								<button className="editor-apply" type="submit" data-action="save-source-edit" disabled={submitting}>
									{submitting ? "Saving changes…" : "Save changes"}
								</button>
							) : null}
							<button className="editor-cancel" type="button" data-action="cancel-source-edit" disabled={submitting} onClick={cancel}>Cancel</button>
						</footer> : null}
					</form>
				</section>
			</div>
			{preview ? <SourceEditTitlePreview preview={preview} onClose={closePreview} onRetry={() => loadPreview(preview.candidate)} /> : null}
		</div>
	);

	return typeof document === "undefined" ? content : createPortal(content, document.body);
}
