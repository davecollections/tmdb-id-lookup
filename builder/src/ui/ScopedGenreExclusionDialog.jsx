import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { GENRE_CONCEPTS } from "../source-add/genre-catalogue.js";
import { FamilyGenreRulePills, GenreRuleCard } from "./GenreRuleControls.jsx";
import "./advanced-discover.css";
import { CreationStageIntro } from "./CreationStageIntro.jsx";
import { handleDialogKeyDown } from "./modal-focus.js";
import { focusElementWithoutScroll } from "./hierarchy-menu-placement.js";
import { scopedGenreTargetIndex, scopedGenreSelection, selectScopedGenreTarget, searchScopedGenreTargets, scopedGenreReviewGroups, scopedGenreExclusionLabel, scopedSourceCount, scopedGenreSourceSummary, scopedGenreInapplicableLabel } from "./scoped-genre-exclusion-ui.js";

const useBeforePaint = typeof window === "undefined" ? useEffect : useLayoutEffect;
const emptySelection = () => ({ sources: new Set(), empty: new Set() });
const coverage = (selected, total) => selected === total ? `All ${scopedSourceCount(total)} selected` : `${selected} of ${scopedSourceCount(total)} selected`;
function Results({ totals, completed = false }) {
	const statuses = { changed: completed ? "Changed" : "Will change", unchanged: "Unchanged", skipped: "Skipped" };
	return <section className="scoped-genre-exclusion-results" aria-label={completed ? "Applied results" : "Review totals"}>
		<p>{scopedSourceCount(totals.inspected)} selected{!completed && totals.inspected > 0 && totals.skipped === totals.inspected ? " · All skipped" : ""}</p>
		<dl className="decades-plan-totals">{["changed", "unchanged", "skipped"].map((status) =>
			<div key={status}><dt>{statuses[status]}</dt><dd data-scoped-total={status}>{totals[status]}</dd></div>)}</dl>
	</section>;
}

function Chevron({ open }) {
	return <svg viewBox="0 0 20 20" aria-hidden="true"><path d={open ? "m5 12 5-5 5 5" : "m5 7 5 5 5-5"} /></svg>;
}

function SourceDetails({ row }) {
	const { outcome, label, unselectedBlocker } = row;
	return <li data-scoped-source={outcome.sourceInternalId} data-outcome={outcome.status}>
		<h6>{label.title}</h6><small>{label.context}</small>
		{outcome.status !== "changed" ? <p>{outcome.status === "skipped" ? outcome.reason.message : scopedGenreSourceSummary(outcome)}</p> : null}
		{outcome.conflictingGenres.length ? <p>Included Genre conflict: {outcome.conflictingGenres.join(", ")}.</p> : null}
		{unselectedBlocker ? <p>Matches an unselected Source in this Folder.</p> : null}
		{outcome.inapplicableGenres.length ? <p className="editor-field-help">{scopedGenreInapplicableLabel(outcome)}</p> : null}
		{outcome.status === "changed" ? <dl className="scoped-genre-before-after">
			<div><dt>Existing:</dt><dd>{scopedGenreExclusionLabel(outcome.beforeExclusions, outcome.mediaType)}</dd></div>
			<div><dt>After:</dt><dd>{scopedGenreExclusionLabel(outcome.afterExclusions, outcome.mediaType)}</dd></div>
		</dl> : null}
	</li>;
}

function GroupSummary({ count, totals }) {
	return <small>{count} selected · {totals.changed} will change · {totals.unchanged} unchanged · {totals.skipped} skipped</small>;
}

function ReportRows({ rows, status }) {
	const [visible, setVisible] = useState(50);
	const suffix = status === "changed" ? "" : " " + status + " Sources";
	return <div className="scoped-genre-exclusion-details"><ol>{rows.slice(0, visible).map((row) => <SourceDetails key={row.outcome.sourceInternalId} row={row} />)}</ol>
		{rows.length > 50 ? <button type="button" className="editor-cancel" aria-disabled={visible >= rows.length} onClick={() => { if (visible < rows.length) setVisible((count) => count + 50); }}>
			{visible >= rows.length ? "All " + rows.length + suffix + " shown" : "Show next " + Math.min(50, rows.length - visible) + suffix + " (" + visible + " of " + rows.length + " shown)"}
		</button> : null}
	</div>;
}

function FolderDetails({ folder }) {
	const [showChanges, setShowChanges] = useState(false);
	const buttonRef = useRef(null), listRef = useRef(null);
	const changesId = "scoped-genre-changing-" + folder.order;
	function toggleChanges() {
		if (showChanges && listRef.current?.contains(document.activeElement)) focusElementWithoutScroll(buttonRef.current);
		setShowChanges((current) => !current);
	}
	return <section className="scoped-genre-exclusion-folder" data-scoped-folder={folder.internalId}>
		<header><h4>{folder.title}</h4><small>{folder.context}</small><GroupSummary count={folder.rows.length} totals={folder.totals} /></header>
		{["skipped", "unchanged"].map((status) => folder[status + "Rows"].length ? <section key={status} className="scoped-genre-report-group" data-scoped-report={status}>
			<h5>{status === "skipped" ? "Skipped" : "Unchanged"} ({folder.totals[status]})</h5>
			<ReportRows rows={folder[status + "Rows"]} status={status} />
		</section> : null)}
		{folder.changedRows.length ? <section className="scoped-genre-report-group" data-scoped-report="changed">
			<h5>Will change</h5><p>{scopedSourceCount(folder.totals.changed)}</p>
			<button ref={buttonRef} type="button" className="editor-cancel scoped-genre-audit-toggle" aria-expanded={showChanges} aria-controls={changesId} onClick={toggleChanges}>
				{showChanges ? "Hide changing Sources" : "Show " + folder.totals.changed + " changing " + (folder.totals.changed === 1 ? "Source" : "Sources")}
			</button>
			<div id={changesId} ref={listRef} hidden={!showChanges}>{showChanges ? <ReportRows rows={folder.changedRows} status="changed" /> : null}</div>
		</section> : null}
	</section>;
}

function CollectionDetails({ group }) {
	const [open, setOpen] = useState(false);
	return <details className="scoped-genre-review-collection" onToggle={(event) => { if (event.target === event.currentTarget) setOpen(event.currentTarget.open); }}>
		<summary><span><strong>{group.title}</strong><small>{group.context}</small><GroupSummary count={group.selectedCount} totals={group.totals} /></span><Chevron open={open} /></summary>
		{open ? <div className="scoped-genre-review-folders">{group.folders.map((folder) => <FolderDetails key={folder.internalId} folder={folder} />)}</div> : null}
	</details>;
}

function TargetRow({ entry, picker }) {
	const inputRef = useRef(null), childrenRef = useRef(null), disclosureRef = useRef(null);
	const state = picker.summary.states.get(entry.internalId);
	useBeforePaint(() => { if (inputRef.current) inputRef.current.indeterminate = state.mixed; }, [state.mixed]);
	const children = picker.visibility.children?.get(entry.internalId) ?? entry.children;
	const open = picker.visibility.searching ? !picker.searchCollapsed.has(entry.internalId) : picker.expanded.has(entry.internalId);
	const listId = `scoped-genre-children-${entry.order}`;
	function disclose() {
		if (open && childrenRef.current?.contains(document.activeElement)) focusElementWithoutScroll(disclosureRef.current);
		picker.toggleExpansion(entry.internalId);
	}
	const unselectedEmpty = entry.emptyCount - state.empty;
	return <li data-target-kind={entry.kind}>
		<div className="scoped-genre-exclusion-target-row" data-selection-mode="multiple" data-selected={state.checked || state.mixed ? "true" : undefined} data-mixed={state.mixed ? "true" : undefined}>
			<label className="genre-catalogue-choice">
				<input ref={inputRef} className="visually-hidden choice-card-input" type="checkbox" name="scoped-genre-target" value={entry.internalId}
					checked={state.checked} aria-checked={state.mixed ? "mixed" : state.checked} onChange={() => picker.choose(entry, !state.checked)} />
				<span><strong>{entry.title}</strong><small>{entry.context}</small>
					{entry.kind !== "source" ? <small>{entry.sourceCount ? coverage(state.sources, entry.sourceCount) : "No Sources"}{unselectedEmpty > 0 && entry.sourceCount > 0 ? ` · ${unselectedEmpty} empty ${unselectedEmpty === 1 ? "branch" : "branches"} not selected` : ""}</small> : null}
					{state.mixed ? <small className="scoped-genre-mixed">Some selected</small> : null}
				</span>
			</label>
			{entry.children.length ? <button ref={disclosureRef} className="editor-cancel scoped-genre-chevron" type="button" aria-expanded={open} aria-controls={listId}
				aria-label={`${open ? "Collapse" : "Expand"} ${entry.kind === "collection" ? "Folders" : "Sources"} in ${entry.title} · ${entry.context}`} onClick={disclose}>
				<Chevron open={open} />
			</button> : null}
		</div>
		{entry.children.length ? <div id={listId} ref={childrenRef} hidden={!open} className="scoped-genre-exclusion-children">
			{open ? <TargetList entries={children} picker={picker} listKey={entry.internalId} /> : null}
		</div> : null}
	</li>;
}

function TargetList({ entries, picker, listKey = "roots" }) {
	const visible = picker.batches.get(listKey) ?? 50;
	return <ul className="scoped-genre-target-list">{entries.slice(0, visible).map((entry) => <TargetRow key={entry.internalId} entry={entry} picker={picker} />)}
		{entries.length > 50 ? <li><button type="button" className="editor-cancel scoped-genre-show-next" aria-disabled={visible >= entries.length} onClick={() => { if (visible < entries.length) picker.showNext(listKey, visible); }}>
			{visible >= entries.length ? "All " + entries.length + " shown" : "Show next " + Math.min(50, entries.length - visible) + " (" + visible + " of " + entries.length + " shown)"}
		</button></li> : null}
	</ul>;
}

// Mounted only inside Global settings' viewport/body-lock owner.
export function ScopedGenreExclusionDialog({ controller, project, onClose, backRef }) {
	const [stage, setStage] = useState("scope"), [selection, setSelection] = useState(emptySelection);
	const [scopeQuery, setScopeQuery] = useState("");
	const [expanded, setExpanded] = useState(new Set()), [searchCollapsed, setSearchCollapsed] = useState(new Set()), [batches, setBatches] = useState(new Map());
	const [genreNames, setGenreNames] = useState([]), [review, setReview] = useState(null), [reviewIndex, setReviewIndex] = useState(null);
	const [totals, setTotals] = useState(null), [error, setError] = useState("");
	const reviewRef = useRef(null), dialogRef = useRef(null), headingRef = useRef(null), bodyRef = useRef(null), errorRef = useRef(null);
	const index = useMemo(() => scopedGenreTargetIndex(project), [project]);
	const summary = useMemo(() => scopedGenreSelection(index, selection), [index, selection]);
	const visibility = useMemo(() => searchScopedGenreTargets(index, scopeQuery), [index, scopeQuery]);
	// Review labels and coverage belong to the reviewed snapshot, even if current nodes are removed.
	const groups = useMemo(() => review ? scopedGenreReviewGroups(review, reviewIndex) : [], [review, reviewIndex]);
	const titles = { scope: "Where should exclusions apply?", genres: "Choose genres", review: "Review changes" };
	function invalidate() { reviewRef.current = null; setReview(null); setError(""); }
	function back() {
		invalidate();
		if (stage === "scope" || stage === "success") onClose();
		else setStage(stage === "review" ? "genres" : "scope");
	}
	useBeforePaint(() => { if (backRef) backRef.current = back; return () => { if (backRef) backRef.current = null; }; });
	useBeforePaint(() => {
		if (bodyRef.current) bodyRef.current.scrollTop = 0;
		focusElementWithoutScroll(headingRef.current);
	}, [stage]);
	useEffect(() => { if (error) focusElementWithoutScroll(errorRef.current); }, [error]);
	function reviewChanges() {
		invalidate();
		try {
			const result = controller.reviewScopedGenreExclusions({ sourceInternalIds: [...selection.sources], genreNames });
			if (!result.ok) { setError(result.errors?.[0]?.message ?? "The selection could not be reviewed. Check the current targets and try again."); return; }
			// Keep the exact authenticated object. Never spread, clone, or reconstruct it.
			reviewRef.current = result.review; setReviewIndex(index); setReview(result.review); setStage("review");
		} catch { setError("The changes could not be reviewed. Nothing was changed. Try reviewing again."); }
	}
	function apply() {
		const approved = reviewRef.current;
		if (!approved) return;
		reviewRef.current = null;
		try {
			const result = controller.applyScopedGenreExclusions(approved);
			if (!result.ok) {
				setReview(null); setError(result.errors?.[0]?.message ?? "The changes could not be applied."); return;
			}
			setTotals(result.totals); setStage("success");
		} catch { setReview(null); setError("Apply could not be completed."); }
	}
	function toggleGenre(name) { invalidate(); setGenreNames((current) => current.includes(name) ? current.filter((entry) => entry !== name) : [...current, name]); }
	const picker = { summary, visibility, expanded, searchCollapsed, batches,
		choose(entry, checked) { invalidate(); setSelection((current) => selectScopedGenreTarget(index, current, entry, checked)); },
		toggleExpansion(id) {
			const update = visibility.searching ? setSearchCollapsed : setExpanded;
			update((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
		},
		showNext(key, visible) { setBatches((current) => new Map(current).set(key, visible + 50)); },
	};
	const nextDisabled = !selection.sources.size || (stage !== "scope" && !genreNames.length);
	return <section ref={dialogRef} className="add-source-dialog scoped-genre-exclusion-dialog" role="dialog" aria-modal="true" aria-labelledby="scoped-genre-exclusion-title" data-scoped-genre-stage={stage} tabIndex={-1}
		onKeyDown={(event) => handleDialogKeyDown(event, dialogRef.current, onClose, { includeControl: (control) => control.getClientRects().length > 0 && !control.matches(":disabled") })}>
		<header className="scoped-genre-exclusion-heading"><div className="add-source-heading-row">
			{stage !== "success" ? <button className="add-source-header-action" type="button" aria-label="Back" data-action="scoped-genres-back" onClick={back}><span aria-hidden="true">←</span> Back</button> : <span className="add-source-header-spacer" aria-hidden="true" />}
			<div><h2 id="scoped-genre-exclusion-title">Exclude genres</h2></div>
			<button className="add-source-header-action add-source-close-action" type="button" aria-label="Close Exclude genres" data-action="scoped-genres-close" onClick={onClose}>Close</button>
		</div></header>
		<div className="scoped-genre-exclusion-body" ref={bodyRef}>
			{stage === "success" ? <h3 className="scoped-genre-success-heading" ref={headingRef} tabIndex={-1}>Genre exclusions applied</h3> : <CreationStageIntro step={{ scope: 1, genres: 2, review: 3 }[stage]} title={titles[stage]} headingRef={headingRef} tabIndex={-1} />}
			{stage === "scope" ? <>
				<p className="editor-field-help">Select Collections, Folders or individual Sources. Expand a branch to refine your selection.</p>
				<div className="scoped-genre-exclusion-selection">
					<span role="status">{scopedSourceCount(selection.sources.size)} selected</span>
					<div className="scoped-genre-target-actions">
						<button className="editor-cancel" type="button" disabled={!index.leaves.length || summary.selected === index.leaves.length} onClick={() => picker.choose(null, true)}>Select all</button>
						<button className="editor-cancel" type="button" disabled={!selection.sources.size && !selection.empty.size} onClick={() => { invalidate(); setSelection(emptySelection()); }}>Clear selections</button>
					</div>
				</div>
				{!selection.sources.size && selection.empty.size ? <p className="editor-field-help">The selected items contain no Sources.</p> : null}
				{summary.missingSources ? <p className="editor-field-help">{scopedSourceCount(summary.missingSources)} in your selection can no longer be found. Clear selections and choose current targets before reviewing.</p> : null}
				<label className="editor-field scoped-genre-exclusion-search">Search Collections, Folders and Sources<input type="text" value={scopeQuery} onChange={(event) => { setScopeQuery(event.target.value); setSearchCollapsed(new Set()); }} autoComplete="off" /></label>
				<fieldset className="scoped-genre-exclusion-choices"><legend>Targets</legend><TargetList entries={visibility.roots} picker={picker} /></fieldset>
				{!visibility.roots.length ? <p>No matching targets. Your selections are retained; try another name or clear the search.</p> : null}
			</> : null}
			{stage === "genres" ? <div className="discover-dialog scoped-genre-exclusion-genres">
				<p>{scopedSourceCount(selection.sources.size)} selected</p>
				<p className="editor-field-help">Choose Genres to exclude. Labels identify Movie-only or Series-only Genres; all others apply to both.</p>
				<div className="scoped-genre-exclusion-selection"><span role="status">{genreNames.length} selected</span><button className="editor-cancel" type="button" disabled={!genreNames.length} onClick={() => { invalidate(); setGenreNames([]); }}>Clear selection</button></div>
				<GenreRuleCard title="Excluded genres"><FamilyGenreRulePills concepts={GENRE_CONCEPTS} selection={genreNames} onChoose={toggleGenre} semantics="exclude" /></GenreRuleCard>
			</div> : null}
			{stage === "review" && review ? <>
				<p className="editor-field-help">Selected Genres: {review.genreNames.join(", ")}.</p>
				<Results totals={review.totals} />
				{review.totals.changed === 0 ? <p role="status">No selected Sources need changing. Inspect the unchanged and skipped results below, or go Back to adjust your selection.</p> : null}
				<p className="editor-field-help">Only eligible existing selected Sources change. Existing exclusions are preserved. Future Sources are not affected: this is not a persistent Collection or Folder Genre rule. Export &amp; Send remains separate.</p>
				<section className="scoped-genre-exclusion-folders" aria-label="Source results by Collection and Folder">{groups.map((group) => <CollectionDetails key={group.internalId} group={group} />)}</section>
			</> : null}
			{stage === "success" ? <><Results totals={totals} completed /><p role="status">{scopedSourceCount(totals.changed)} changed. {totals.unchanged} unchanged. {totals.skipped} skipped.</p><p className="editor-field-help">The project has been updated locally. Future Sources are not affected. Export &amp; Send remains separate; nothing was sent to Nuvio.</p></> : null}
			{error ? <div ref={errorRef} className="editor-diagnostics" role="alert" tabIndex={-1}><p>{error}</p><p>Review the current targets again before applying. Your target selection has been retained.</p></div> : null}
		</div>
		<footer className="node-editor-actions scoped-genre-exclusion-actions">
			{stage === "success" ? <button type="button" className="editor-apply" onClick={onClose}>Done</button> : <>
				{stage === "review" && review ? review.totals.changed > 0 ? <button type="button" className="editor-apply" data-action="apply-scoped-genres" onClick={apply}>Apply to {scopedSourceCount(review.totals.changed)}</button> : <button type="button" className="editor-apply" onClick={onClose}>Done</button> :
					<button type="button" className="editor-apply" disabled={nextDisabled} onClick={() => stage === "scope" ? setStage("genres") : reviewChanges()}>{stage === "scope" ? "Continue" : stage === "review" ? "Review again" : "Review changes"}</button>}
			</>}
		</footer>
	</section>;
}
