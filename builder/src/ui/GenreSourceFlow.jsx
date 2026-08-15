import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
	buildGenreSourceDrafts,
	createSourceSubmissionGate,
	DEFAULT_GENRE_DESTINATION_MODE,
	DEFAULT_GENRE_SORT_OPTION_ID,
	DEFAULT_SHARED_GENRE_MEDIA_CHOICE,
	emptyGenreAdvancedState,
	GENRE_CONCEPTS,
	GENRE_DESTINATION_MODES,
	GENRE_MEDIA_CHOICES,
	GENRE_SORT_OPTIONS,
	GENRE_SOURCE_MODE,
	genreDuplicateOverrideIdentity,
	inspectGenreFolderPlan,
	inspectGenreSourceDuplicates,
	officialGenreConcept,
	pruneGenreExclusionConfiguration,
	searchGenreConcepts,
} from "../source-add/index.js";
import { lockAddSourceDocumentBody, observeAddSourceViewport, resolveAddSourceViewportStyle } from "./add-source-modal-lifecycle.js";
import { GenreAdvancedOptions, GenreAdvancedSecondarySurface } from "./GenreAdvancedOptions.jsx";
import { focusElementWithoutScroll } from "./hierarchy-menu-placement.js";
import { handleDialogKeyDown } from "./modal-focus.js";
import { SemanticSortChoices } from "./SemanticSortChoices.jsx";
import { SourceElsewhereNotice } from "./SourceElsewhereNotice.jsx";

const usePrePaintLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
const COMPACT_REVIEW_THRESHOLD = 6;
const COMPACT_SELECTION_THRESHOLD = 6;

export const GENRE_SOURCE_STEPS = Object.freeze({ BROWSE: "browse", CONFIGURE_REVIEW: "configure-review" });

function genreMediaLabel(concept) {
	return concept.shared ? "Movies & Series" : concept.movieId !== null ? "Movies" : "Series";
}

function currentCollection(project, folderInternalId) {
	return project?.collections?.find((collection) => collection.folders.some((folder) => folder.internalId === folderInternalId)) ?? null;
}

export function toggleGenreSelection(selection, genreName) {
	if (!Array.isArray(selection) || typeof genreName !== "string" || officialGenreConcept(genreName) === null) return Object.freeze([]);
	return Object.freeze(selection.includes(genreName) ? selection.filter((entry) => entry !== genreName) : [...selection, genreName]);
}

export function reconcileGenreConfigureState({ selection, genreName, advanced, destinationMode }) {
	const nextSelection = toggleGenreSelection(selection, genreName);
	return Object.freeze({
		selection: nextSelection,
		advanced: pruneGenreExclusionConfiguration(advanced, nextSelection),
		destinationMode: nextSelection.length <= 1 ? DEFAULT_GENRE_DESTINATION_MODE : destinationMode,
	});
}

export function GenreBrowseStep({ query, headingRef, inputRef, selection, onQueryChange, onClearSearch, onChoose, onSelectAll, onClearAll }) {
	const concepts = searchGenreConcepts(query);
	return (
		<section className="genre-browse-step" aria-labelledby="genre-browse-title">
			<div className="add-source-section-heading genre-browse-heading">
				<div><p className="panel-kicker">Browse</p><h3 id="genre-browse-title" ref={headingRef} tabIndex={-1}>Official TMDB Genres</h3></div>
			</div>
			<div className="genre-selection-toolbar">
				<span role="status">{selection.length} of {GENRE_CONCEPTS.length} selected</span>
				<div className="genre-selection-actions"><button type="button" onClick={onSelectAll}>Select all</button><button type="button" disabled={selection.length === 0} onClick={onClearAll}>Clear all</button></div>
			</div>
			<div className="editor-field add-source-query-field genre-search-field">
				<label htmlFor="genre-source-query">Search Genres</label>
				<div className="genre-search-control"><input ref={inputRef} id="genre-source-query" type="search" value={query} placeholder="Search the local catalogue" autoComplete="off" onChange={onQueryChange} />{query ? <button type="button" onClick={onClearSearch}>Clear search</button> : null}</div>
			</div>
			{concepts.length > 0 ? <ul className="genre-catalogue-list">{concepts.map((concept) => {
				const selected = selection.includes(concept.name);
				return <li key={concept.name}><button type="button" data-genre-name={concept.name} data-selected={selected ? "true" : undefined} aria-pressed={selected} onClick={() => onChoose(concept.name)}><span><strong>{concept.name}</strong><small>{genreMediaLabel(concept)}</small></span><span aria-hidden="true">{selected ? "✓" : "+"}</span></button></li>;
			})}</ul> : <div className="add-source-empty"><strong>No Genres found</strong><span>Clear the search or try another name.</span></div>}
		</section>
	);
}

export function SelectedGenreSummary({ genres, onRemove }) {
	if (genres.length === 1) return <div className="genre-configure-selection genre-single-selection"><strong>{genres[0].name}</strong><span>{genreMediaLabel(genres[0])}</span></div>;
	if (genres.length <= COMPACT_SELECTION_THRESHOLD) return <ul className="genre-selection-pills">{genres.map((concept) => <li key={concept.name}><button type="button" onClick={() => onRemove(concept.name)}><span>{concept.name}</span><span aria-hidden="true">×</span><span className="visually-hidden">Remove {concept.name}</span></button></li>)}</ul>;
	return <details className="genre-selected-disclosure"><summary>View selected genres</summary><ul>{genres.map((concept) => <li key={concept.name}><div><strong>{concept.name}</strong><span>{genreMediaLabel(concept)}</span></div><button type="button" aria-label={`Remove ${concept.name}`} onClick={() => onRemove(concept.name)}>×</button></li>)}</ul></details>;
}

function DestinationChoices({ selectedId, onChange }) {
	return <fieldset className="genre-destination-choices studio-source-choices"><legend>How would you like these added?</legend><div>{GENRE_DESTINATION_MODES.map((option) => <label key={option.id} data-selected={selectedId === option.id ? "true" : undefined}><input type="radio" name="genre-destination" value={option.id} checked={selectedId === option.id} onChange={() => onChange(option.id)} /><span><strong>{option.label}</strong></span></label>)}</div></fieldset>;
}

function CurrentFolderReview({ drafts, duplicates, sortOptionId, expanded, onToggle }) {
	const duplicateDrafts = new Set(duplicates.duplicateDrafts);
	const elsewhereDrafts = new Set(duplicates.elsewhereDrafts ?? []);
	const readyDrafts = drafts.filter((draft) => !duplicateDrafts.has(draft));
	const compact = drafts.length > COMPACT_REVIEW_THRESHOLD;
	const visibleReady = compact && !expanded ? [] : readyDrafts;
	const visible = [...duplicates.duplicateDrafts, ...visibleReady];
	const showSummary = compact || duplicates.duplicateDrafts.length > 0 || duplicates.elsewhere.length > 0;
	return <>
		{showSummary ? <div className="genre-review-summary"><strong>Sources to add · {duplicates.missingDrafts.length}</strong><span>{duplicates.duplicateDrafts.length > 0 ? `${duplicates.duplicateDrafts.length} already in this folder` : `${readyDrafts.length} ready source${readyDrafts.length === 1 ? "" : "s"}`}</span></div> : null}
		{visible.length > 0 ? <ul className="genre-review-list">{visible.map((draft) => {
			const status = duplicateDrafts.has(draft) ? "destination-duplicate" : elsewhereDrafts.has(draft) ? "elsewhere" : "ready";
			const label = status === "destination-duplicate" ? "Already in this folder" : status === "elsewhere" ? "Exists elsewhere" : "Ready to add";
			return <li key={`${draft.editable.mediaType}-${draft.editable.filters.withGenres}`}><div><strong>{draft.editable.title}</strong><span>{draft.editable.mediaType === "TV" ? "Series" : "Movie"} · {GENRE_SORT_OPTIONS.find((entry) => entry.id === sortOptionId)?.label}</span></div><span data-status={status}>{label}</span></li>;
		})}</ul> : null}
		{compact && readyDrafts.length > 0 ? <button className="genre-review-toggle" type="button" onClick={onToggle}>{expanded ? "Hide source details" : `View all ${drafts.length} sources`}</button> : null}
		<SourceElsewhereNotice
			occurrences={duplicates.elsewhere}
			heading={duplicates.elsewhere.length === 1 ? "A matching source exists elsewhere in this project" : "Matching sources exist elsewhere in this project"}
			action={duplicates.elsewhere.length === 1 ? "You can still add it here." : "You can still add them here."}
		/>
	</>;
}

function FolderReview({ plan, expanded, onToggle }) {
	const ready = plan.readyGroups;
	const attention = plan.groups.filter((group) => group.status !== "ready");
	const compact = plan.groups.length > COMPACT_REVIEW_THRESHOLD;
	const visible = [...attention, ...(compact && !expanded ? [] : ready)];
	return <>
		<div className="genre-review-summary"><strong>Folders to create · {ready.length}</strong><span>{ready.reduce((count, group) => count + group.drafts.length, 0)} sources across new Genre folders</span></div>
		{visible.length > 0 ? <ul className="genre-review-list">{visible.map((group) => {
			const status = group.status === "already-exists" || group.status === "partly-exists" ? "destination-duplicate" : group.elsewhere.length > 0 ? "elsewhere" : "ready";
			const label = group.status === "already-exists" ? "Already in this collection" : group.status === "partly-exists" ? "Partly in this collection" : group.elsewhere.length > 0 ? "Exists elsewhere" : "Ready to create";
			return <li key={group.concept.name}><div><strong>{group.concept.name}</strong><span>{group.drafts.length} source{group.drafts.length === 1 ? "" : "s"} · Landscape folder</span></div><span data-status={status}>{label}</span></li>;
		})}</ul> : null}
		{compact && ready.length > 0 ? <button className="genre-review-toggle" type="button" onClick={onToggle}>{expanded ? "Hide folder details" : `View all ${plan.groups.length} genres`}</button> : null}
		{plan.partialGroups.length > 0 ? <p className="genre-attention-note">Some sources for {plan.partialGroups.length} selected Genre{plan.partialGroups.length === 1 ? " already exist" : "s already exist"} in this collection, so those Genre folders will not be created.</p> : null}
		<SourceElsewhereNotice occurrences={plan.elsewhere} heading="Matching sources exist elsewhere in this project" action="You can still create these folders here." />
	</>;
}

export function GenreConfigureReviewStep({ genres, folderName, destinationMode, sharedMediaChoice, sortOptionId, advanced, drafts, duplicates, folderPlan, buildErrors, applyDiagnostic, configureRef, reviewExpanded, onRemoveGenre, onDestinationChange, onSharedMediaChange, onSortChange, onAdvancedChange, onOpenSecondary, onToggleReview }) {
	const hasShared = genres.some((concept) => concept.shared);
	const sourceCount = duplicates.missingDrafts.length;
	const folderCount = folderPlan.readyGroups.length;
	const folderSourceCount = folderPlan.readyGroups.reduce((count, group) => count + group.drafts.length, 0);
	const destinationSummary = destinationMode === "current-folder"
		? sourceCount > 0 ? `${sourceCount} source${sourceCount === 1 ? "" : "s"} will be added to “${folderName}”` : `All configured sources already exist in “${folderName}”`
		: folderCount > 0 ? `${folderCount} folder${folderCount === 1 ? "" : "s"} will be created with ${folderSourceCount} source${folderSourceCount === 1 ? "" : "s"}` : "No new Genre folders will be created";
	return (
		<section ref={configureRef} className="genre-configure-step" aria-labelledby="genre-configure-title" tabIndex={-1}>
			<div className="add-source-section-heading"><div>{genres.length === 1 ? <h3 id="genre-configure-title">Configure &amp; review</h3> : <><p className="panel-kicker">Configure &amp; review</p><h3 id="genre-configure-title">{genres.length} genres selected</h3></>}</div></div>
			<SelectedGenreSummary genres={genres} onRemove={onRemoveGenre} />
			{genres.length > 1 ? <DestinationChoices selectedId={destinationMode} onChange={onDestinationChange} /> : null}
			{hasShared ? <div className="genre-shared-media"><SemanticSortChoices options={GENRE_MEDIA_CHOICES} selectedId={sharedMediaChoice} name="genre-shared-media" legend="For genres available in both Movies and Series" onChange={onSharedMediaChange} /></div> : null}
			<SemanticSortChoices options={GENRE_SORT_OPTIONS} selectedId={sortOptionId} name="genre-sort" legend="Sort titles by" onChange={onSortChange} />
			<GenreAdvancedOptions value={advanced} includedGenres={genres} sharedMediaChoice={sharedMediaChoice} onChange={onAdvancedChange} onOpenSecondary={onOpenSecondary} />
			<section className="genre-generated-review" aria-labelledby="genre-generated-title">
				<div className="add-source-section-heading genre-generated-heading"><div><p className="panel-kicker">Review</p><h3 id="genre-generated-title">{destinationSummary}</h3></div></div>
				{buildErrors.length > 0 ? <ul className="genre-advanced-errors" role="alert">{buildErrors.map((entry) => <li key={`${entry.code}-${entry.path}-${entry.message}`}>{entry.message}</li>)}</ul> : null}
				{applyDiagnostic ? <div className="editor-diagnostics" role="alert"><p>{applyDiagnostic.message}</p></div> : null}
				{destinationMode === "current-folder" ? <CurrentFolderReview drafts={drafts} duplicates={duplicates} sortOptionId={sortOptionId} expanded={reviewExpanded} onToggle={onToggleReview} /> : <FolderReview plan={folderPlan} expanded={reviewExpanded} onToggle={onToggleReview} />}
			</section>
		</section>
	);
}

export function GenreSourceFlow({ project, folder, onBack, onCancel, onApply }) {
	const [step, setStep] = useState(GENRE_SOURCE_STEPS.BROWSE);
	const [query, setQuery] = useState("");
	const [selection, setSelection] = useState([]);
	const [destinationMode, setDestinationMode] = useState(DEFAULT_GENRE_DESTINATION_MODE);
	const [sharedMediaChoice, setSharedMediaChoice] = useState(DEFAULT_SHARED_GENRE_MEDIA_CHOICE);
	const [sortOptionId, setSortOptionId] = useState(DEFAULT_GENRE_SORT_OPTION_ID);
	const [advanced, setAdvanced] = useState(emptyGenreAdvancedState);
	const [reviewExpanded, setReviewExpanded] = useState(false);
	const [secondarySurface, setSecondarySurface] = useState(null);
	const [applyDiagnostic, setApplyDiagnostic] = useState(null);
	const [isApplying, setIsApplying] = useState(false);
	const [viewportStyle, setViewportStyle] = useState(() => typeof window === "undefined" ? null : resolveAddSourceViewportStyle(window));
	const dialogRef = useRef(null);
	const scrollRef = useRef(null);
	const browseHeadingRef = useRef(null);
	const browseScrollTopRef = useRef(0);
	const inputRef = useRef(null);
	const configureRef = useRef(null);
	const secondaryHeadingRef = useRef(null);
	const secondaryReturnFocusRef = useRef(null);
	const submissionGateRef = useRef(createSourceSubmissionGate());
	const genres = useMemo(() => selection.map((name) => officialGenreConcept(name)).filter(Boolean), [selection]);
	const collection = currentCollection(project, folder?.internalId);
	const effectiveDestinationMode = genres.length === 1 ? DEFAULT_GENRE_DESTINATION_MODE : destinationMode;
	const built = buildGenreSourceDrafts(genres, { sharedMediaChoice, sortOptionId, advanced });
	const drafts = built.ok ? built.drafts : [];
	const duplicates = built.ok && folder ? inspectGenreSourceDuplicates(project, folder.internalId, drafts) : { destination: [], elsewhere: [], missingDrafts: [], duplicateDrafts: [], elsewhereDrafts: [] };
	const folderPlan = built.ok && collection ? inspectGenreFolderPlan(project, collection.internalId, genres, drafts, sharedMediaChoice) : { groups: [], readyGroups: [], alreadyExistingGroups: [], partialGroups: [], elsewhere: [] };
	const normalCount = effectiveDestinationMode === "current-folder" ? duplicates.missingDrafts.length : folderPlan.readyGroups.length;

	usePrePaintLayoutEffect(() => {
		const unlockBody = lockAddSourceDocumentBody();
		const stop = observeAddSourceViewport(setViewportStyle);
		focusElementWithoutScroll(browseHeadingRef.current ?? dialogRef.current);
		return () => { stop(); unlockBody(); };
	}, []);
	useEffect(() => {
		if (step === GENRE_SOURCE_STEPS.BROWSE) {
			if (scrollRef.current) scrollRef.current.scrollTop = browseScrollTopRef.current;
			focusElementWithoutScroll(browseHeadingRef.current ?? dialogRef.current);
		} else {
			if (scrollRef.current) scrollRef.current.scrollTop = 0;
			focusElementWithoutScroll(configureRef.current);
		}
	}, [step]);
	useEffect(() => {
		if (secondarySurface) {
			focusElementWithoutScroll(secondaryHeadingRef.current);
			return;
		}
		if (secondaryReturnFocusRef.current) {
			const trigger = secondaryReturnFocusRef.current;
			secondaryReturnFocusRef.current = null;
			focusElementWithoutScroll(trigger);
		}
	}, [secondarySurface]);

	function chooseGenre(name) {
		const nextState = reconcileGenreConfigureState({ selection, genreName: name, advanced, destinationMode });
		setSelection(nextState.selection);
		setAdvanced(nextState.advanced);
		if (nextState.destinationMode !== destinationMode) setDestinationMode(nextState.destinationMode);
		setReviewExpanded(false);
		setApplyDiagnostic(null);
	}

	function openSecondary(surface, trigger) {
		secondaryReturnFocusRef.current = trigger;
		setSecondarySurface(surface);
	}

	function closeSecondary() {
		setSecondarySurface(null);
	}

	function goBack() {
		if (isApplying || secondarySurface) return;
		if (step === GENRE_SOURCE_STEPS.CONFIGURE_REVIEW) setStep(GENRE_SOURCE_STEPS.BROWSE);
		else onBack();
	}

	async function applyGenres(addAllAnyway = false) {
		if (secondarySurface || !built.ok || drafts.length === 0 || isApplying || !submissionGateRef.current.begin()) return;
		setIsApplying(true);
		let result;
		try {
			result = await onApply({ genres, destinationMode: effectiveDestinationMode, sharedMediaChoice, sortOptionId, advanced, drafts, duplicateOverrideIdentity: addAllAnyway ? genreDuplicateOverrideIdentity(folder.internalId, drafts) : null });
		} catch {
			result = { ok: false, errors: [{ message: "Genre sources could not be added. Try again." }] };
		}
		if (result?.ok) return;
		submissionGateRef.current.reset();
		setIsApplying(false);
		setApplyDiagnostic(result?.errors?.[0] ?? { message: "Genre sources could not be added." });
	}

	function submit(event) {
		event.preventDefault();
		if (secondarySurface) return;
		if (step === GENRE_SOURCE_STEPS.BROWSE) {
			if (selection.length > 0) {
				browseScrollTopRef.current = scrollRef.current?.scrollTop ?? 0;
				setStep(GENRE_SOURCE_STEPS.CONFIGURE_REVIEW);
			}
			return;
		}
		if (normalCount > 0) applyGenres(false);
	}

	const primaryLabel = isApplying
		? effectiveDestinationMode === "current-folder" ? "Adding…" : "Creating…"
		: effectiveDestinationMode === "current-folder"
			? normalCount > 0 ? `Add ${normalCount} source${normalCount === 1 ? "" : "s"}` : "No new sources to add"
			: normalCount > 0 ? `Create ${normalCount} folder${normalCount === 1 ? "" : "s"}` : "No new folders to create";

	const content = (
		<div className="add-source-portal genre-source-portal" data-add-source-portal="true">
			<div className="settings-modal-backdrop add-source-backdrop" style={viewportStyle ?? undefined}>
				<section ref={dialogRef} className="add-source-dialog genre-source-dialog" data-add-source-step={step} data-source-mode={GENRE_SOURCE_MODE.id} data-secondary-surface={secondarySurface ?? undefined} role="dialog" aria-modal="true" aria-labelledby="genre-source-title" aria-describedby="genre-source-description" tabIndex={-1} onKeyDown={(event) => {
					if (secondarySurface && event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeSecondary(); return; }
					handleDialogKeyDown(event, dialogRef.current, onCancel);
				}}>
					<header className="add-source-heading" inert={secondarySurface || undefined} aria-hidden={secondarySurface ? "true" : undefined}>
						<div className="add-source-heading-row"><button className="add-source-header-action" type="button" disabled={isApplying} data-action={step === GENRE_SOURCE_STEPS.BROWSE ? "back-to-source-types" : "back-to-genre-browse"} onClick={goBack}><span aria-hidden="true">←</span> Back</button><div><h2 id="genre-source-title">Add Genre sources</h2><p>{folder?.editable?.title || "Selected folder"}</p></div><button className="add-source-header-action add-source-close-action" type="button" aria-label="Close Add Genre sources" disabled={isApplying} onClick={onCancel}>Close</button></div>
						<p id="genre-source-description" className="add-source-heading-description">{step === GENRE_SOURCE_STEPS.BROWSE ? "Choose one or more Genres from the local official TMDB catalogue." : "Configure and review the generated Genre sources."}</p>
					</header>
					<form className="add-source-form genre-source-form" onSubmit={submit} noValidate>
						<div ref={scrollRef} className="add-source-scroll" inert={secondarySurface || undefined} aria-hidden={secondarySurface ? "true" : undefined}>
							{step === GENRE_SOURCE_STEPS.BROWSE ? <GenreBrowseStep query={query} headingRef={browseHeadingRef} inputRef={inputRef} selection={selection} onQueryChange={(event) => setQuery(event.target.value)} onClearSearch={() => setQuery("")} onChoose={chooseGenre} onSelectAll={() => { const names = GENRE_CONCEPTS.map((concept) => concept.name); setSelection(names); setDestinationMode(DEFAULT_GENRE_DESTINATION_MODE); setAdvanced((current) => pruneGenreExclusionConfiguration(current, names)); setApplyDiagnostic(null); }} onClearAll={() => { setSelection([]); setDestinationMode(DEFAULT_GENRE_DESTINATION_MODE); setAdvanced((current) => pruneGenreExclusionConfiguration(current, [])); setApplyDiagnostic(null); }} /> : null}
							{step === GENRE_SOURCE_STEPS.CONFIGURE_REVIEW ? <GenreConfigureReviewStep genres={genres} folderName={folder?.editable?.title || "this folder"} destinationMode={effectiveDestinationMode} sharedMediaChoice={sharedMediaChoice} sortOptionId={sortOptionId} advanced={advanced} drafts={drafts} duplicates={duplicates} folderPlan={folderPlan} buildErrors={built.errors ?? []} applyDiagnostic={applyDiagnostic} configureRef={configureRef} reviewExpanded={reviewExpanded} onRemoveGenre={chooseGenre} onDestinationChange={(value) => { setDestinationMode(value); setReviewExpanded(false); setApplyDiagnostic(null); }} onSharedMediaChange={(value) => { setSharedMediaChoice(value); setReviewExpanded(false); setApplyDiagnostic(null); }} onSortChange={(value) => { setSortOptionId(value); setReviewExpanded(false); setApplyDiagnostic(null); }} onAdvancedChange={(value) => { setAdvanced(value); setReviewExpanded(false); setApplyDiagnostic(null); }} onOpenSecondary={openSecondary} onToggleReview={() => setReviewExpanded((value) => !value)} /> : null}
						</div>
						{secondarySurface ? <div className="genre-secondary-surface" data-surface={secondarySurface}><GenreAdvancedSecondarySurface surface={secondarySurface} value={advanced} includedGenres={genres} sharedMediaChoice={sharedMediaChoice} onChange={(value) => { setAdvanced(value); setReviewExpanded(false); setApplyDiagnostic(null); }} onDone={closeSecondary} focusRef={secondaryHeadingRef} /></div> : null}
						{step === GENRE_SOURCE_STEPS.BROWSE ? <footer className="add-source-actions"><span className="genre-selection-count" role="status">{selection.length} genre{selection.length === 1 ? "" : "s"} selected</span><button className="editor-apply" type="submit" disabled={selection.length === 0}>Continue</button></footer> : null}
						{step === GENRE_SOURCE_STEPS.CONFIGURE_REVIEW && !secondarySurface ? <footer className="add-source-actions genre-review-actions"><button className="editor-apply" type="submit" disabled={isApplying || !built.ok || normalCount === 0}>{primaryLabel}</button>{effectiveDestinationMode === "current-folder" && duplicates.duplicateDrafts.length > 0 ? <button className="editor-cancel people-add-all" type="button" disabled={isApplying || !built.ok} data-action="add-all-genres-anyway" onClick={() => applyGenres(true)}>{drafts.length === 1 ? "Add anyway" : "Add all anyway"}</button> : null}</footer> : null}
					</form>
				</section>
			</div>
		</div>
	);
	return typeof document === "undefined" ? content : createPortal(content, document.body);
}
