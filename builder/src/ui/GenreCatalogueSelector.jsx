import { useEffect, useRef, useState } from "react";

const GENRE_CONTEXT_HISTORY_KEY = "__tmdbBuilderGenreContext";
let genreContextHistorySequence = 0;

function mobileContextHistoryAvailable() {
	return typeof window !== "undefined"
		&& typeof window.matchMedia === "function"
		&& window.matchMedia("(max-width: 900px)").matches
		&& typeof window.history?.pushState === "function";
}

function contextHistoryLevel(token) {
	const entry = typeof window === "undefined" ? null : window.history.state?.[GENRE_CONTEXT_HISTORY_KEY];
	return entry?.token === token ? entry.level : null;
}

function pushContextHistory(token, level) {
	const current = window.history.state;
	const state = current && typeof current === "object" ? current : {};
	window.history.pushState({ ...state, [GENRE_CONTEXT_HISTORY_KEY]: { token, level } }, "");
}

export function genreMediaLabel(concept) {
	return concept.shared ? "Movies & Series" : concept.movieId !== null ? "Movies" : "Series";
}

export function GenreContextCatalogueSubview({
	activeContextId,
	ariaDescribedBy,
	ariaInvalid = false,
	backLabel,
	children,
	className = "",
	contexts,
	contextTitle,
	detailGuidance,
	detailTitle,
	emptyText,
	emptyTitle,
	focusRef,
	guidance,
	kicker = "Advanced options",
	onContextChange,
	onDone,
	onReturnToContexts,
	statusContent = null,
	title,
	titleId,
}) {
	const multiple = contexts.length > 1;
	const [mobileDetail, setMobileDetail] = useState(false);
	const mobileDetailRef = useRef(mobileDetail);
	const rootHeadingRef = useRef(null);
	const detailHeadingRef = useRef(null);
	const historyTokenRef = useRef(null);
	if (historyTokenRef.current === null) historyTokenRef.current = `genre-context-${++genreContextHistorySequence}`;
	const onDoneRef = useRef(onDone);
	const onReturnToContextsRef = useRef(onReturnToContexts);
	const mobileHistoryRef = useRef(false);
	mobileDetailRef.current = mobileDetail;
	onDoneRef.current = onDone;
	onReturnToContextsRef.current = onReturnToContexts;
	const activeContext = contexts.find((context) => context.id === activeContextId) ?? null;
	const contextTitleId = `${titleId}-contexts`;
	const choiceTitleId = `${titleId}-choices`;

	useEffect(() => {
		mobileHistoryRef.current = mobileContextHistoryAvailable();
		if (!mobileHistoryRef.current) return undefined;
		const token = historyTokenRef.current;
		if (contextHistoryLevel(token) === "detail") window.history.replaceState({ ...window.history.state, [GENRE_CONTEXT_HISTORY_KEY]: { token, level: "root" } }, "");
		else if (contextHistoryLevel(token) !== "root") pushContextHistory(token, "root");
		const onPopState = (event) => {
			const entry = event.state?.[GENRE_CONTEXT_HISTORY_KEY];
			if (multiple && mobileDetailRef.current && entry?.token === token && entry.level === "root") {
				setMobileDetail(false);
				onReturnToContextsRef.current?.();
				return;
			}
			onDoneRef.current();
		};
		window.addEventListener("popstate", onPopState);
		return () => window.removeEventListener("popstate", onPopState);
	}, [multiple]);

	useEffect(() => {
		if (!multiple) return;
		const target = mobileDetail ? detailHeadingRef.current : rootHeadingRef.current;
		target?.focus?.({ preventScroll: true });
	}, [activeContextId, mobileDetail, multiple]);

	function assignRootHeading(node) {
		rootHeadingRef.current = node;
		if (typeof focusRef === "function") focusRef(node);
		else if (focusRef) focusRef.current = node;
	}

	function enterContext(contextId) {
		const token = historyTokenRef.current;
		if (mobileHistoryRef.current && contextHistoryLevel(token) !== "detail") pushContextHistory(token, "detail");
		onContextChange(contextId);
		setMobileDetail(true);
	}

	function returnToContexts() {
		if (mobileHistoryRef.current && contextHistoryLevel(historyTokenRef.current) === "detail") window.history.back();
		else {
			setMobileDetail(false);
			onReturnToContexts?.();
		}
	}

	function finish() {
		if (mobileHistoryRef.current && contextHistoryLevel(historyTokenRef.current) !== null) window.history.back();
		else onDone();
	}

	return (
		<section className={`genre-advanced-subview genre-exclusion-subview genre-context-catalogue-subview${className ? ` ${className}` : ""}`} aria-labelledby={titleId} aria-describedby={ariaDescribedBy} aria-invalid={ariaInvalid || undefined} data-multiple-genres={multiple ? "true" : "false"} data-mobile-detail={multiple && mobileDetail ? "true" : undefined} onKeyDown={(event) => {
			if (event.key !== "Escape" || !mobileHistoryRef.current) return;
			event.preventDefault();
			event.stopPropagation();
			if (multiple && mobileDetail) returnToContexts();
			else finish();
		}}>
			<header className="genre-exclusion-root-header">
				<div><p className="panel-kicker">{kicker}</p><h4 id={titleId} tabIndex={-1} ref={assignRootHeading}>{title}</h4></div>
				<button type="button" className="editor-apply genre-secondary-done" onClick={finish}>Done</button>
			</header>
			<p className="genre-subview-guidance">{guidance}</p>
			{statusContent}
			<div className="genre-exclusion-layout genre-context-catalogue-layout" data-mobile-view={mobileDetail ? "picker" : "genres"}>
				{multiple ? <section className="genre-included-genre-pane genre-context-pane" aria-labelledby={contextTitleId}>
					<h5 id={contextTitleId}>{contextTitle}</h5>
					<ul>{contexts.map((context) => <li key={context.id}><button type="button" aria-pressed={activeContextId === context.id} aria-controls={choiceTitleId} data-selected={activeContextId === context.id ? "true" : undefined} onClick={() => enterContext(context.id)}><span><strong>{context.label}</strong><small>{context.summary}</small></span><span aria-hidden="true">›</span></button></li>)}</ul>
				</section> : null}
				<section id={choiceTitleId} className="genre-exclusion-choice-pane genre-context-choice-pane" aria-labelledby={`${choiceTitleId}-heading`}>
					{activeContext ? <>
						{multiple ? <header className="genre-exclusion-detail-header"><button type="button" className="genre-exclusion-mobile-back" onClick={returnToContexts}><span aria-hidden="true">←</span> {backLabel}</button><h5 id={`${choiceTitleId}-heading`} ref={detailHeadingRef} tabIndex={-1}>{detailTitle(activeContext)}</h5></header> : <span id={`${choiceTitleId}-heading`} className="visually-hidden">{detailTitle(activeContext)}</span>}
						{multiple && detailGuidance ? <p className="genre-subview-guidance genre-exclusion-detail-guidance">{detailGuidance}</p> : null}
						{children}
					</> : <div className="genre-exclusion-empty"><h5 id={`${choiceTitleId}-heading`}>{emptyTitle}</h5><span>{emptyText}</span></div>}
				</section>
			</div>
		</section>
	);
}

export function GenreSelectionToolbar({ selectionCount, totalCount, onSelectAll, onClearAll }) {
	return (
		<div className="genre-selection-toolbar">
			<span role="status">{selectionCount} of {totalCount} selected</span>
			<div className="genre-selection-actions">
				<button type="button" onClick={onSelectAll}>Select all</button>
				<button type="button" disabled={selectionCount === 0} onClick={onClearAll}>Clear all</button>
			</div>
		</div>
	);
}

export function GenreCatalogueList({ concepts, selection, onChoose }) {
	if (concepts.length === 0) {
		return <div className="add-source-empty"><strong>No Genres found</strong><span>Clear the search or try another name.</span></div>;
	}
	return (
		<ul className="genre-catalogue-list">
			{concepts.map((concept) => {
				const selected = selection.includes(concept.name);
				return (
					<li key={concept.name}>
						<button type="button" data-genre-name={concept.name} data-selected={selected ? "true" : undefined} aria-pressed={selected} onClick={() => onChoose(concept.name)}>
							<span><strong>{concept.name}</strong><small>{genreMediaLabel(concept)}</small></span>
							<span aria-hidden="true">{selected ? "✓" : "+"}</span>
						</button>
					</li>
				);
			})}
		</ul>
	);
}
