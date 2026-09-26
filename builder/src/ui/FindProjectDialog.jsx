import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { lockAddSourceDocumentBody, observeAddSourceViewport, resolveAddSourceViewportStyle } from "./add-source-modal-lifecycle.js";
import { handleDialogKeyDown } from "./modal-focus.js";
import { focusElementWithoutScroll } from "./hierarchy-menu-placement.js";
import { buildProjectFindIndex, searchProjectFindIndex, PROJECT_FIND_LIMIT } from "./project-find.js";

const usePrePaintLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
const types = { collection: "Collection", folder: "Folder", source: "Source" };

export function FindProjectDialog({ project, onCancel, onJump }) {
	const [query, setQuery] = useState("");
	const [error, setError] = useState("");
	const dialogRef = useRef(null);
	const searchRef = useRef(null);
	const scrollRef = useRef(null);
	const [viewport, setViewport] = useState(() => typeof window === "undefined" ? null : resolveAddSourceViewportStyle(window));
	const index = useMemo(() => buildProjectFindIndex(project), [project]);
	const { results, total, ready } = useMemo(() => searchProjectFindIndex(index, query), [index, query]);
	const status = !ready ? "Type at least 2 characters to search."
		: total === 0 ? "No matches in this project."
		: total > PROJECT_FIND_LIMIT ? `${total.toLocaleString("en")} matches · showing first ${PROJECT_FIND_LIMIT}. Refine your search.`
		: `${total} ${total === 1 ? "match" : "matches"} in this project.`;
	const [announcement, setAnnouncement] = useState(status);

	usePrePaintLayoutEffect(() => {
		const unlock = lockAddSourceDocumentBody();
		const stop = observeAddSourceViewport(setViewport);
		focusElementWithoutScroll(searchRef.current);
		return () => { stop(); unlock(); };
	}, []);
	useEffect(() => {
		// Announce settled counts rather than every keystroke during continuous typing.
		const timer = setTimeout(() => setAnnouncement(status), 300);
		return () => clearTimeout(timer);
	}, [status]);
	useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 0; }, [query]);

	function jump(result) {
		if (!onJump(result)) setError("That item is no longer available.");
	}
	const content = <div className="add-source-portal find-project-portal" data-mobile-surface="opaque">
		<div className="settings-modal-backdrop add-source-backdrop find-project-backdrop" style={viewport ?? undefined}>
			<section ref={dialogRef} className="add-source-dialog find-project-dialog" data-find-project-dialog="true" role="dialog" aria-modal="true" aria-labelledby="find-project-title" tabIndex={-1} onKeyDown={(event) => handleDialogKeyDown(event, dialogRef.current, onCancel)}>
				<header className="find-project-heading">
					<h2 id="find-project-title">Find in project</h2>
					<button type="button" className="editor-cancel" onClick={onCancel}>Close</button>
				</header>
				<div className="find-project-search">
					<div className="editor-field">
						<label htmlFor="find-project-query">Search Collections, Folders and Sources</label>
						<input ref={searchRef} id="find-project-query" type="search" value={query} autoComplete="off" onChange={(event) => { setQuery(event.target.value); setError(""); }} />
					</div>
					<p className="find-project-status">{status}</p>
					<p className="visually-hidden" role="status" aria-atomic="true">{announcement}</p>
					{error ? <p className="editor-diagnostics" role="alert">{error}</p> : null}
				</div>
				<div ref={scrollRef} className="find-project-results">
					{results.length ? <ul aria-label="Project matches">
						{results.map((result) => <li key={result.internalId}>
							<button className="find-project-result" type="button" onClick={() => jump(result)}>
								<strong>{result.displayTitle}</strong>
								<span>{types[result.nodeType]}{result.displayPath ? " · " + result.displayPath : ""}</span>
								{result.positions > 1 ? <small>Position {result.position} of {result.positions}</small> : null}
							</button>
						</li>)}
					</ul> : null}
				</div>
			</section>
		</div>
	</div>;
	return typeof document === "undefined" ? content : createPortal(content, document.body);
}
