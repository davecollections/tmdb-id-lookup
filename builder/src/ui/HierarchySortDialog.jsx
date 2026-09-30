import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { lockAddSourceDocumentBody, observeAddSourceViewport, resolveAddSourceViewportStyle } from "./add-source-modal-lifecycle.js";
import { handleDialogKeyDown } from "./modal-focus.js";
import { focusElementWithoutScroll } from "./hierarchy-menu-placement.js";
import { SemanticSortChoices } from "./SemanticSortChoices.jsx";
import { nodeTitle } from "./view-model.js";

const usePrePaintLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function HierarchySortDialog({ session, onCancel, onApply, error }) {
	const [sort, setSort] = useState("az");
	const dialogRef = useRef(null), errorRef = useRef(null);
	const [viewport, setViewport] = useState(() => typeof window === "undefined" ? null : resolveAddSourceViewportStyle(window));
	usePrePaintLayoutEffect(() => {
		const unlock = lockAddSourceDocumentBody();
		const stop = observeAddSourceViewport(setViewport);
		focusElementWithoutScroll(dialogRef.current);
		return () => { stop(); unlock(); };
	}, []);
	useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
	const content = <div className="add-source-portal hierarchy-sort-portal" data-mobile-surface="opaque">
		<div className="settings-modal-backdrop add-source-backdrop hierarchy-sort-backdrop" style={viewport ?? undefined}>
			<section ref={dialogRef} className="add-source-dialog collection-folders-dialog hierarchy-sort-dialog" data-hierarchy-sort-dialog={session.level} role="dialog" aria-modal="true" aria-labelledby="hierarchy-sort-title" tabIndex={-1} onKeyDown={(event) => handleDialogKeyDown(event, dialogRef.current, onCancel)}>
				<header className="add-source-heading">
					<h2 id="hierarchy-sort-title">Sort {session.level}</h2>
					<p>{session.level === "collections" ? "Pinned and ordinary collections stay in their groups." : nodeTitle(session.target.editable.title, session.level === "folders" ? "collection" : "folder").text}</p>
				</header>
				<div className="collection-folders-body">
					<div className="add-source-scroll collection-folders-scroll">
						<SemanticSortChoices options={session.options} selectedId={sort} onChange={setSort} name="hierarchy-sort" legend={"Order " + session.level + " by"} helper="Sort once. You can still drag items afterward." />
					</div>
				</div>
				<footer className="add-source-actions collection-folders-actions">
					{error ? <p className="editor-diagnostics" ref={errorRef} tabIndex={-1} role="alert">{error}</p> : null}
					<button className="editor-apply" type="button" onClick={() => onApply(sort)}>Sort {session.level}</button>
					<button className="editor-cancel" type="button" onClick={onCancel}>Cancel</button>
				</footer>
			</section>
		</div>
	</div>;
	return typeof document === "undefined" ? content : createPortal(content, document.body);
}
