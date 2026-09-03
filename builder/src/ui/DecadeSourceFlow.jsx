import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
	buildDecadeSourceBundleDrafts,
	createAsyncRequestCoordinator,
	createSourceSubmissionGate,
	DECADES_MEDIA_MODES,
	DECADES_SORT_OPTIONS,
	DECADE_PRESETS,
	DECADE_SOURCE_MODE,
	decadeDuplicateOverrideIdentity,
	decadeSourceGenreOptions,
	decadeSourcePeriodChoices,
	DEFAULT_DECADES_SORT_OPTION_ID,
	DEFAULT_DECADE_SOURCE_ADVANCED,
	DEFAULT_DECADE_SOURCE_PERIOD_ID,
	GENRE_CONCEPTS,
	inspectDecadeSourceDuplicates,
	toggleDecadeSourcePeriodSelection,
} from "../source-add/index.js";
import {
	DecadeBundleExclusionSubview,
	DecadesAdvancedHelpSubview,
	DecadesAdvancedOptions,
} from "./DecadesAdvancedOptions.jsx";
import { lockAddSourceDocumentBody, observeAddSourceViewport, resolveAddSourceViewportStyle } from "./add-source-modal-lifecycle.js";
import { GenreCatalogueList, GenreSelectionToolbar } from "./GenreCatalogueSelector.jsx";
import { focusElementWithoutScroll } from "./hierarchy-menu-placement.js";
import { handleDialogKeyDown } from "./modal-focus.js";
import { NestedPreviewDialog } from "./NestedPreviewDialog.jsx";
import { PosterOnlyPreviewGrid } from "./PosterOnlyPreviewGrid.jsx";
import { SemanticSortChoices } from "./SemanticSortChoices.jsx";
import { SourceElsewhereNotice } from "./SourceElsewhereNotice.jsx";

const usePrePaintLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
const EMPTY_DUPLICATES = Object.freeze({ destination: Object.freeze([]), elsewhere: Object.freeze([]), missingDrafts: Object.freeze([]), duplicateDrafts: Object.freeze([]), elsewhereDrafts: Object.freeze([]) });

function mediaLabel(mediaType) {
	return mediaType === "TV" ? "Series" : "Movies";
}

function includedGenreForContext(contextId) {
	return contextId.startsWith("genre:") ? contextId.slice("genre:".length) : null;
}

function exclusionsForContext(advanced, contextId) {
	const genreName = includedGenreForContext(contextId);
	return genreName === null ? advanced.ordinaryExcludedGenres ?? [] : advanced.exclusionsByGenre?.[genreName] ?? [];
}

function updateExclusionsForContext(advanced, contextId, names) {
	const genreName = includedGenreForContext(contextId);
	if (genreName === null) return Object.freeze({ ...advanced, ordinaryExcludedGenres: Object.freeze([...names]) });
	return Object.freeze({
		...advanced,
		exclusionsByGenre: Object.freeze({
			...(advanced.exclusionsByGenre ?? {}),
			[genreName]: Object.freeze([...names]),
		}),
	});
}

function exclusionOptions(mediaMode, includedGenre = null) {
	return GENRE_CONCEPTS.filter((concept) => {
		if (concept.name === includedGenre) return false;
		if (mediaMode === "movies") return concept.movieId !== null;
		if (mediaMode === "series") return concept.tvId !== null;
		return concept.movieId !== null || concept.tvId !== null;
	});
}

function reconcileAdvanced(advanced, mediaMode, selectedGenreNames) {
	const prune = (names, includedGenre = null) => {
		const available = new Set(exclusionOptions(mediaMode, includedGenre).map((concept) => concept.name));
		return Object.freeze((names ?? []).filter((name) => available.has(name)));
	};
	return Object.freeze({
		...advanced,
		ordinaryExcludedGenres: prune(advanced.ordinaryExcludedGenres),
		exclusionsByGenre: Object.freeze(Object.fromEntries(selectedGenreNames.map((genreName) => [
			genreName,
			prune(advanced.exclusionsByGenre?.[genreName], genreName),
		]))),
	});
}

function DecadePeriodChoices({ options, selectedIds, helper, onToggle }) {
	return (
		<fieldset className="studio-sort-choices semantic-sort-choices decade-source-year-choices" data-decade-source-control="year">
			<legend>Year</legend>
			<p className="semantic-sort-helper">{helper}</p>
			<div className="studio-sort-choice-row semantic-sort-choice-row">
				{options.map((option) => <label key={option.id} data-selected={selectedIds.includes(option.id) ? "true" : undefined}>
					<input type="checkbox" name="decade-source-year" value={option.id} checked={selectedIds.includes(option.id)} onChange={() => onToggle(option.id)} />
					<span>{option.label}</span>
				</label>)}
			</div>
		</fieldset>
	);
}

function PreviewDimension({ label, ariaLabel, className, choices, selectedKey, onChange }) {
	return <div className={`decade-add-preview-dimension ${className}`}><span>{label}</span><div className="studio-preview-tabs decades-preview-source-selector" role="tablist" aria-label={ariaLabel}>{choices.map((choice) => <button key={choice.key} type="button" role="tab" aria-selected={choice.key === selectedKey} onClick={() => onChange(choice)}>{choice.selectorLabel}</button>)}</div></div>;
}

function DecadeSourcePreview({ preview, onChangePeriod, onChangeLogicalSource, onChangeDraft, onClose, onRetry }) {
	const dialogRef = useRef(null);
	const closeRef = useRef(null);
	const activeMedia = mediaLabel(preview.draft.editable.mediaType);
	const hasYearSelector = preview.periodGroups.length > 1;
	const hasSourceSelector = preview.periodGroup.logicalSources.length > 1;
	const hasMediaSelector = preview.logicalSource.drafts.length > 1;
	const hasDimensions = hasYearSelector || hasSourceSelector || hasMediaSelector;
	return (
		<NestedPreviewDialog
			ariaLabelledBy="decade-add-preview-title"
			backdropClassName="franchise-preview-backdrop studio-preview-backdrop decades-preview-backdrop decade-add-preview-backdrop"
			backdropProps={{ "data-decade-add-preview-backdrop": "true" }}
			dialogClassName="franchise-preview-modal studio-preview-modal decades-preview-modal decade-add-preview-modal"
			dialogProps={{ "data-has-dimensions": hasDimensions ? "true" : "false" }}
			dialogRef={dialogRef}
			initialFocusRef={closeRef}
			onClose={onClose}
		>
			<header><div><p className="panel-kicker">Title preview</p><h3 id="decade-add-preview-title">{preview.periodGroup.selectorLabel}</h3></div><button ref={closeRef} type="button" onClick={onClose}>Close</button></header>
			{hasDimensions ? <div className="decade-add-preview-dimensions">
				{hasYearSelector ? <PreviewDimension label="Year" ariaLabel="Preview year" className="decade-add-preview-year-selector" choices={preview.periodGroups} selectedKey={preview.periodGroup.key} onChange={onChangePeriod} /> : null}
				{hasSourceSelector ? <PreviewDimension label="Source" ariaLabel="Preview source" className="decade-add-preview-source-selector" choices={preview.periodGroup.logicalSources} selectedKey={preview.logicalSource.key} onChange={onChangeLogicalSource} /> : null}
				{hasMediaSelector ? <PreviewDimension label="Media" ariaLabel="Preview media" className="decade-add-preview-media-selector" choices={preview.logicalSource.drafts.map((draft) => ({ key: draft.editable.mediaType, selectorLabel: mediaLabel(draft.editable.mediaType), draft }))} selectedKey={preview.draft.editable.mediaType} onChange={(choice) => onChangeDraft(choice.draft)} /> : null}
			</div> : null}
			<div className="decades-preview-content decade-add-preview-content">
				{preview.status === "loading" ? <p className="studio-preview-state" role="status">Preparing {activeMedia.toLowerCase()} preview…</p> : null}
				{preview.status === "error" ? <div className="studio-preview-state add-source-request-state" role="alert"><p>{preview.error?.message ?? "This Decade preview could not be prepared."}</p><button type="button" onClick={onRetry}>Retry</button></div> : null}
				{preview.status === "ready" ? <PosterOnlyPreviewGrid items={preview.data?.results ?? []} limit={10} className="franchise-preview-grid studio-preview-grid decades-preview-grid decade-add-preview-grid" ariaLabel={`${activeMedia} poster preview`} altPrefix={activeMedia} emptyMessage="No posters available." /> : null}
			</div>
		</NestedPreviewDialog>
	);
}

function DecadeSourceReview({ drafts, duplicates, sortOptionId }) {
	const duplicateDrafts = new Set(duplicates.duplicateDrafts);
	const elsewhereDrafts = new Set(duplicates.elsewhereDrafts);
	const sortLabel = DECADES_SORT_OPTIONS.find((option) => option.id === sortOptionId)?.label ?? sortOptionId;
	const duplicateCount = duplicates.duplicateDrafts.length;
	const missingCount = duplicates.missingDrafts.length;
	return (
		<section className="decade-source-generated" aria-labelledby="decade-source-generated-title">
			<div className="add-source-section-heading"><div><p className="panel-kicker">Generated sources</p><h3 id="decade-source-generated-title">{drafts.length} source{drafts.length === 1 ? "" : "s"} configured</h3></div></div>
			<ul className="genre-review-list decade-source-review-list">{drafts.map((draft, index) => {
				const status = duplicateDrafts.has(draft) ? "destination-duplicate" : elsewhereDrafts.has(draft) ? "elsewhere" : "ready";
				const label = status === "destination-duplicate" ? "Already in this folder" : status === "elsewhere" ? "Exists elsewhere" : "Ready to add";
				return <li key={`${draft.editable.title}-${draft.editable.mediaType}-${index}`}><div><strong>{draft.editable.title}</strong><span>{mediaLabel(draft.editable.mediaType)} · {sortLabel}</span></div><span data-status={status}>{label}</span></li>;
			})}</ul>
			{duplicateCount > 0 ? <p className="genre-attention-note" role="status">{duplicateCount === drafts.length ? `All ${drafts.length} configured sources already exist in this folder. Use Save all anyway only if you intentionally want duplicate sources.` : `${drafts.length} configured: ${duplicateCount} already ${duplicateCount === 1 ? "exists" : "exist"} here. Normal Save will add ${missingCount} new source${missingCount === 1 ? "" : "s"}.`}</p> : null}
			<SourceElsewhereNotice occurrences={duplicates.elsewhere} heading={duplicates.elsewhere.length === 1 ? "A matching Decade source exists elsewhere" : "Matching Decade sources exist elsewhere"} action={duplicates.elsewhere.length === 1 ? "You can still add it here." : "You can still add them here."} />
		</section>
	);
}

export function DecadeSourceFlow({ project, folder, previewProvider, onBack, onCancel, onApply }) {
	const [decadeId, setDecadeId] = useState(DEFAULT_DECADE_SOURCE_PERIOD_ID);
	const [periodIds, setPeriodIds] = useState(() => [DEFAULT_DECADE_SOURCE_PERIOD_ID]);
	const [mediaMode, setMediaMode] = useState("both");
	const [genreNames, setGenreNames] = useState([]);
	const [sortOptionId, setSortOptionId] = useState(DEFAULT_DECADES_SORT_OPTION_ID);
	const [advanced, setAdvanced] = useState(DEFAULT_DECADE_SOURCE_ADVANCED);
	const [reconciliationNotice, setReconciliationNotice] = useState("");
	const [exclusionContextId, setExclusionContextId] = useState("general");
	const [secondarySurface, setSecondarySurface] = useState(null);
	const [preview, setPreview] = useState(null);
	const [diagnostic, setDiagnostic] = useState(null);
	const [isApplying, setIsApplying] = useState(false);
	const [viewportStyle, setViewportStyle] = useState(() => typeof window === "undefined" ? null : resolveAddSourceViewportStyle(window));
	const dialogRef = useRef(null);
	const headingRef = useRef(null);
	const scrollRef = useRef(null);
	const secondaryHeadingRef = useRef(null);
	const secondaryReturnFocusRef = useRef(null);
	const previewCoordinatorRef = useRef(null);
	const previewTriggerRef = useRef(null);
	const previewTokenRef = useRef(null);
	const submissionGateRef = useRef(createSourceSubmissionGate());
	if (previewCoordinatorRef.current === null) previewCoordinatorRef.current = createAsyncRequestCoordinator();

	const configuration = useMemo(() => ({ periodIds, mediaMode, genreNames, sortOptionId, advanced }), [advanced, genreNames, mediaMode, periodIds, sortOptionId]);
	const built = useMemo(() => buildDecadeSourceBundleDrafts(configuration), [configuration]);
	const drafts = built.ok ? built.drafts : Object.freeze([]);
	const logicalSources = built.ok ? built.logicalSources : Object.freeze([]);
	const duplicates = built.ok && folder ? inspectDecadeSourceDuplicates(project, folder.internalId, drafts) : EMPTY_DUPLICATES;
	const genreOptions = decadeSourceGenreOptions(mediaMode);
	const selectedPreset = DECADE_PRESETS.find((preset) => preset.id === decadeId) ?? DECADE_PRESETS.at(-1);
	const periodChoices = decadeSourcePeriodChoices(selectedPreset.id);
	const decadeOptions = DECADE_PRESETS.map((preset) => ({ id: preset.id, label: preset.label }));
	const yearOptions = periodChoices.map((entry) => ({ id: entry.id, label: entry.id === selectedPreset.wholePeriod.id ? `All ${selectedPreset.label}` : entry.label }));
	const exclusionSelectionByContext = Object.freeze(Object.fromEntries([
		["general", advanced.ordinaryExcludedGenres ?? []],
		...genreNames.map((genreName) => [`genre:${genreName}`, advanced.exclusionsByGenre?.[genreName] ?? []]),
	]));
	const activeExclusionSelection = exclusionSelectionByContext[exclusionContextId] ?? [];
	const activeIncludedGenre = includedGenreForContext(exclusionContextId);
	const exclusionCount = Object.values(exclusionSelectionByContext).reduce((sum, names) => sum + names.length, 0);
	const previewAvailable = built.ok && typeof previewProvider?.getDecadePreview === "function";

	usePrePaintLayoutEffect(() => {
		const unlockBody = lockAddSourceDocumentBody();
		const stop = observeAddSourceViewport(setViewportStyle);
		focusElementWithoutScroll(headingRef.current ?? dialogRef.current);
		return () => { stop(); unlockBody(); };
	}, []);
	useEffect(() => () => previewCoordinatorRef.current.cancel({ notify: false }), []);
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

	function changeMedia(nextMediaMode) {
		const availableNames = new Set(decadeSourceGenreOptions(nextMediaMode).map((concept) => concept.name));
		const nextGenreNames = genreNames.filter((name) => availableNames.has(name));
		const removedNames = genreNames.filter((name) => !availableNames.has(name));
		setMediaMode(nextMediaMode);
		setGenreNames(nextGenreNames);
		setAdvanced((current) => reconcileAdvanced(current, nextMediaMode, nextGenreNames));
		if (includedGenreForContext(exclusionContextId) && !nextGenreNames.includes(includedGenreForContext(exclusionContextId))) setExclusionContextId("general");
		setReconciliationNotice(removedNames.length > 0 ? `${removedNames.join(", ")} ${removedNames.length === 1 ? "was" : "were"} removed because ${removedNames.length === 1 ? "it is" : "they are"} not available for ${nextMediaMode === "both" ? "both Movies and Series" : nextMediaMode === "movies" ? "Movies" : "Series"}.` : "");
		setDiagnostic(null);
	}

	function changeDecade(nextDecadeId) {
		const nextPreset = DECADE_PRESETS.find((preset) => preset.id === nextDecadeId);
		if (!nextPreset) return;
		setDecadeId(nextDecadeId);
		setPeriodIds([nextPreset.wholePeriod.id]);
		setDiagnostic(null);
	}

	function togglePeriod(periodId) {
		const nextPeriodIds = toggleDecadeSourcePeriodSelection(decadeId, periodIds, periodId);
		if (nextPeriodIds.length === 0) return;
		setPeriodIds(nextPeriodIds);
		setDiagnostic(null);
	}

	function setSelectedGenres(nextGenreNames) {
		setGenreNames(nextGenreNames);
		setAdvanced((current) => reconcileAdvanced(current, mediaMode, nextGenreNames));
		if (includedGenreForContext(exclusionContextId) && !nextGenreNames.includes(includedGenreForContext(exclusionContextId))) setExclusionContextId("general");
		setReconciliationNotice("");
		setDiagnostic(null);
	}

	function toggleGenre(genreName) {
		setSelectedGenres(genreNames.includes(genreName) ? genreNames.filter((name) => name !== genreName) : [...genreNames, genreName]);
	}

	function openSecondary(surface, trigger) {
		secondaryReturnFocusRef.current = trigger;
		if (surface === "ordinary-exclusions" && includedGenreForContext(exclusionContextId) && !genreNames.includes(includedGenreForContext(exclusionContextId))) setExclusionContextId("general");
		setSecondarySurface(surface);
	}

	function closeSecondary() {
		setSecondarySurface(null);
	}

	async function requestPreview(periodGroup, logicalSource = periodGroup?.logicalSources?.[0], draft = logicalSource?.drafts?.[0], trigger = null) {
		if (!previewAvailable || !periodGroup || !logicalSource || !draft) return;
		if (trigger) previewTriggerRef.current = trigger;
		previewCoordinatorRef.current.cancel({ notify: false });
		const token = Symbol(`decade-add-preview-${logicalSource.key}-${draft.editable.mediaType}`);
		previewTokenRef.current = token;
		setPreview({ periodGroups: built.periodGroups, periodGroup, logicalSource, draft, status: "loading", data: null, error: null });
		const outcome = await previewCoordinatorRef.current.run(({ signal }) => previewProvider.getDecadePreview(draft, { signal }), { periodId: periodGroup.period.id, logicalSourceKey: logicalSource.key, mediaType: draft.editable.mediaType, sortBy: draft.editable.sortBy, filters: draft.editable.filters });
		if (!outcome.accepted || previewTokenRef.current !== token) return;
		if (outcome.result?.ok) setPreview({ periodGroups: built.periodGroups, periodGroup, logicalSource, draft, status: "ready", data: outcome.result.data, error: null });
		else if (outcome.result?.error?.kind !== "aborted") setPreview({ periodGroups: built.periodGroups, periodGroup, logicalSource, draft, status: "error", data: null, error: outcome.result?.error ?? { message: "This Decade preview could not be prepared." } });
	}

	function closePreview() {
		previewCoordinatorRef.current.cancel({ notify: false });
		previewTokenRef.current = null;
		const trigger = previewTriggerRef.current;
		previewTriggerRef.current = null;
		setPreview(null);
		queueMicrotask(() => focusElementWithoutScroll(trigger));
	}

	async function save(addAllAnyway = false) {
		if (!built.ok || drafts.length === 0 || isApplying || secondarySurface || preview || !submissionGateRef.current.begin()) return;
		setIsApplying(true);
		let result;
		try {
			result = await onApply({ ...configuration, drafts, duplicateOverrideIdentity: addAllAnyway ? decadeDuplicateOverrideIdentity(folder.internalId, drafts) : null });
		} catch {
			result = { ok: false, errors: [{ message: "Decade sources could not be added. Try again." }] };
		}
		if (result?.ok) return;
		submissionGateRef.current.reset();
		setIsApplying(false);
		setDiagnostic(result?.errors?.[0] ?? { message: "Decade sources could not be added. Try again." });
	}

	function submit(event) {
		event.preventDefault();
		if (duplicates.missingDrafts.length > 0) save(false);
	}

	const saveCount = duplicates.missingDrafts.length;
	const saveLabel = isApplying ? "Saving…" : saveCount === 1 ? "Save 1 source" : `Save ${saveCount} sources`;
	const content = (
		<div className="add-source-portal decade-source-portal" data-add-source-portal="true">
			<div className="settings-modal-backdrop add-source-backdrop" style={viewportStyle ?? undefined}>
				<section ref={dialogRef} className="add-source-dialog decade-source-dialog" data-source-mode={DECADE_SOURCE_MODE.id} data-secondary-surface={secondarySurface ?? undefined} role="dialog" aria-modal="true" aria-labelledby="decade-source-title" aria-describedby="decade-source-description" tabIndex={-1} onKeyDown={(event) => {
					if (secondarySurface && event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeSecondary(); return; }
					handleDialogKeyDown(event, dialogRef.current, onCancel);
				}}>
					<header className="add-source-heading" inert={secondarySurface || preview || undefined} aria-hidden={secondarySurface || preview ? "true" : undefined}>
						<div className="add-source-heading-row"><button className="add-source-header-action" type="button" disabled={isApplying} data-action="back-to-source-types" onClick={onBack}><span aria-hidden="true">←</span> Back</button><div><h2 ref={headingRef} id="decade-source-title" tabIndex={-1}>Add Decade source</h2><p>{folder?.editable?.title || "Selected folder"}</p></div><button className="add-source-header-action add-source-close-action" type="button" aria-label="Close Add Decade source" disabled={isApplying} onClick={onCancel}>Close</button></div>
						<p id="decade-source-description" className="add-source-heading-description">Choose a decade, then the whole decade or any individual years. Optional Genre sources are added to each selection.</p>
					</header>
					<form className="add-source-form decade-source-form" onSubmit={submit} noValidate>
						<div ref={scrollRef} className="add-source-scroll" inert={secondarySurface || preview || undefined} aria-hidden={secondarySurface || preview ? "true" : undefined}>
							<section className="decade-source-editor">
								<SemanticSortChoices options={DECADES_MEDIA_MODES} selectedId={mediaMode} name="decade-source-media" legend="Media" onChange={changeMedia} fieldsetProps={{ "data-decade-source-control": "media" }} />
								<SemanticSortChoices options={DECADES_SORT_OPTIONS} selectedId={sortOptionId} name="decade-source-sort" legend="Sort titles by" onChange={(value) => { setSortOptionId(value); setDiagnostic(null); }} fieldsetProps={{ "data-decade-source-control": "sort" }} />
								<SemanticSortChoices options={decadeOptions} selectedId={decadeId} name="decade-source-decade" legend="Decade" onChange={changeDecade} fieldsetProps={{ "data-decade-source-control": "decade" }} />
								<DecadePeriodChoices options={yearOptions} selectedIds={periodIds} helper={selectedPreset.id === "1950s-and-earlier" ? "Choose the whole period or any individual years." : "Choose the whole decade or any individual years."} onToggle={togglePeriod} />
								<fieldset className="decade-source-genre-sources" data-decade-source-control="genres">
									<legend>Genre sources <span>· optional</span></legend>
									<p className="editor-field-help">Select Genres to add separate genre sources alongside the main decade or year source.</p>
									{mediaMode === "both" ? <p className="editor-field-help decade-source-genre-eligibility">With Both selected, only Genres available for Movies and Series are shown.</p> : null}
									<GenreSelectionToolbar selectionCount={genreNames.length} totalCount={genreOptions.length} onSelectAll={() => setSelectedGenres(genreOptions.map((concept) => concept.name))} onClearAll={() => setSelectedGenres([])} clearLabel="Clear" disableSelectAllWhenComplete />
									<GenreCatalogueList concepts={genreOptions} selection={genreNames} onChoose={toggleGenre} selectionControl="checkbox" className="decade-source-genre-pill-list" showMedia={false} />
									{reconciliationNotice ? <p className="genre-fixed-media-note" role="status">{reconciliationNotice}</p> : null}
								</fieldset>
								<DecadesAdvancedOptions value={advanced} exclusionSummary={exclusionCount === 0 ? "No Genre exclusions configured" : `${exclusionCount} Genre exclusion${exclusionCount === 1 ? "" : "s"} configured across generated source choices`} onChange={(value) => { setAdvanced(reconcileAdvanced(value, mediaMode, genreNames)); setDiagnostic(null); }} onOpenSecondary={openSecondary} idPrefix="decade-source-advanced" />
								{built.errors.length > 0 ? <ul className="genre-advanced-errors" role="alert">{built.errors.map((error) => <li key={`${error.code}-${error.path}-${error.message}`}>{error.message}</li>)}</ul> : null}
								{diagnostic ? <div className="editor-diagnostics" role="alert"><p>{diagnostic.message}</p></div> : null}
								<DecadeSourceReview drafts={drafts} duplicates={duplicates} sortOptionId={sortOptionId} />
								<div className="source-edit-preview-action genre-hierarchy-configure-row-actions decade-source-preview-action"><button type="button" aria-haspopup="dialog" disabled={!previewAvailable || isApplying} onClick={(event) => requestPreview(built.periodGroups[0], built.periodGroups[0]?.logicalSources[0], built.periodGroups[0]?.logicalSources[0]?.drafts[0], event.currentTarget)}>Preview titles</button>{!previewAvailable ? <p className="editor-field-help" role="status">Preview is unavailable until the current configuration is valid.</p> : null}</div>
							</section>
						</div>
						{secondarySurface ? <div className="genre-secondary-surface" data-surface={secondarySurface}>{secondarySurface === "ordinary-exclusions" ? <DecadeBundleExclusionSubview selectedGenreNames={built.ok ? built.configuration.genreNames : genreNames} selectionByContext={exclusionSelectionByContext} contextId={exclusionContextId} selection={activeExclusionSelection} mediaMode={mediaMode} onContextChange={setExclusionContextId} onToggle={(name) => setAdvanced((current) => updateExclusionsForContext(current, exclusionContextId, activeExclusionSelection.includes(name) ? activeExclusionSelection.filter((entry) => entry !== name) : [...activeExclusionSelection, name]))} onSelectAll={() => setAdvanced((current) => updateExclusionsForContext(current, exclusionContextId, exclusionOptions(mediaMode, activeIncludedGenre).map((concept) => concept.name)))} onClearAll={() => setAdvanced((current) => updateExclusionsForContext(current, exclusionContextId, []))} onDone={closeSecondary} focusRef={secondaryHeadingRef} /> : <DecadesAdvancedHelpSubview onDone={closeSecondary} focusRef={secondaryHeadingRef} />}</div> : null}
						{!secondarySurface ? <footer className="add-source-actions decade-source-actions" inert={preview || undefined} aria-hidden={preview ? "true" : undefined}><button className="editor-cancel" type="button" disabled={isApplying} onClick={onCancel}>Cancel</button><button className="editor-apply" type="submit" disabled={isApplying || !built.ok || saveCount === 0}>{saveLabel}</button>{duplicates.duplicateDrafts.length > 0 ? <button className="editor-cancel people-add-all" type="button" disabled={isApplying || !built.ok} onClick={() => save(true)}>{drafts.length === 1 ? "Save anyway" : "Save all anyway"}</button> : null}</footer> : null}
					</form>
				</section>
			</div>
			{preview ? <DecadeSourcePreview preview={preview} onChangePeriod={(periodGroup) => {
				if (periodGroup.key === preview.periodGroup.key) return;
				const logicalSource = periodGroup.logicalSources.find((source) => source.variantKey === preview.logicalSource.variantKey) ?? periodGroup.logicalSources[0];
				const draft = logicalSource.drafts.find((entry) => entry.editable.mediaType === preview.draft.editable.mediaType) ?? logicalSource.drafts[0];
				requestPreview(periodGroup, logicalSource, draft);
			}} onChangeLogicalSource={(logicalSource) => {
				if (logicalSource.key === preview.logicalSource.key) return;
				const draft = logicalSource.drafts.find((entry) => entry.editable.mediaType === preview.draft.editable.mediaType) ?? logicalSource.drafts[0];
				requestPreview(preview.periodGroup, logicalSource, draft);
			}} onChangeDraft={(draft) => { if (draft !== preview.draft) requestPreview(preview.periodGroup, preview.logicalSource, draft); }} onClose={closePreview} onRetry={() => requestPreview(preview.periodGroup, preview.logicalSource, preview.draft)} /> : null}
		</div>
	);
	return typeof document === "undefined" ? content : createPortal(content, document.body);
}
