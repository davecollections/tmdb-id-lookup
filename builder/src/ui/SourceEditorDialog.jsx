import {
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import { PEOPLE_SOURCE_COMBINATIONS } from "../source-add/index.js";
import {
	MOVIE_COLLECTION_SOURCE_EDITOR_ID,
	PEOPLE_SOURCE_EDITOR_ID,
	chooseMovieCollection,
	choosePeopleSourceCombination,
	createPeopleEditCountSession,
	INITIAL_PEOPLE_EDIT_COUNT_STATE,
	peopleEditCountLabel,
	peopleSortOptions,
	sourceEditorById,
	updatePeopleSourceSort,
	updateSourceEditTitle,
	usePeopleDefaultTitle,
	useSelectedMovieCollectionName,
} from "../source-edit/index.js";
import {
	lockAddSourceDocumentBody,
	observeAddSourceViewport,
	resolveAddSourceViewportStyle,
} from "./add-source-modal-lifecycle.js";
import { focusElementWithoutScroll } from "./hierarchy-menu-placement.js";
import { handleDialogKeyDown } from "./modal-focus.js";
import { MovieCollectionPicker } from "./MovieCollectionPicker.jsx";
import {
	focusSourceEditAlert,
	sourceEditErrorPresentation,
} from "./source-edit-error-presentation.js";

const usePrePaintLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const editableFieldByDiagnosticPath = Object.freeze({
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

function SourceTitleField({ draft, titleInputRef, error, onChange }) {
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
				{nameIsAutoManaged
					? "This name updates automatically until you customise it."
					: "This is the name shown in Nuvio. You can customise it."}
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
	session,
	initialDraft,
	initialPeopleCountState = null,
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
	const [submitting, setSubmitting] = useState(false);
	const [viewportStyle, setViewportStyle] = useState(() => (
		typeof window === "undefined" ? null : resolveAddSourceViewportStyle(window)
	));
	const dialogRef = useRef(null);
	const scrollRef = useRef(null);
	const titleInputRef = useRef(null);
	const combinationRef = useRef(null);
	const chooseButtonRef = useRef(null);
	const pickerInputRef = useRef(null);
	const diagnosticRef = useRef(null);
	const peopleCountSessionRef = useRef(null);
	const peopleCountGenerationRef = useRef(0);
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

	const diagnostics = failure?.errors ?? [];
	const titleError = diagnostics.find((entry) => diagnosticField(entry.path) === "title") ?? null;

	usePrePaintLayoutEffect(() => {
		const unlockBody = lockAddSourceDocumentBody();
		const stopObservingViewport = observeAddSourceViewport(setViewportStyle);
		focusElementWithoutScroll(titleInputRef.current ?? dialogRef.current);
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
		if (!failure || !pendingFailureFocusRef.current) return;
		pendingFailureFocusRef.current = false;
		const invalidField = firstMountedInvalidField(failure, { title: titleInputRef });
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
							{stage === "picker" ? "Choose a replacement TMDB movie franchise." : "Change only the supported fields for this physical source."}
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
									<SourceIdentity adapter={adapter} draft={draft} />
									<SourceTitleField
										draft={draft}
										titleInputRef={titleInputRef}
										error={titleError}
										onChange={(title) => {
											setDraft((current) => updateSourceEditTitle(current, title));
											clearFieldDiagnostic("title");
										}}
									/>
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
