import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { lockAddSourceDocumentBody, observeAddSourceViewport, resolveAddSourceViewportStyle } from "./add-source-modal-lifecycle.js";
import { handleDialogKeyDown } from "./modal-focus.js";
import { focusElementWithoutScroll } from "./hierarchy-menu-placement.js";
import { GenreSelectionToolbar } from "./GenreCatalogueSelector.jsx";
import { SemanticSortChoices } from "./SemanticSortChoices.jsx";
import { nodeTitle } from "./view-model.js";
import { folderSortOptions } from "./collection-folder-management.js";

const usePrePaintLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function CollectionFoldersDialog({ collection, mode, onCancel, onApply, error }) {
	const [selected, setSelected] = useState([]);
	const [sort, setSort] = useState("az");
	const dialogRef = useRef(null);
	const errorRef = useRef(null);
	const [viewport, setViewport] = useState(() => typeof window === "undefined" ? null : resolveAddSourceViewportStyle(window));
	const removing = mode === "remove";
	const title = removing ? "Remove folders" : "Sort folders";
	const rows = collection.folders.map((folder, index) => ({ folder, index, title: nodeTitle(folder.editable.title, "folder") }));

	usePrePaintLayoutEffect(() => {
		const unlock = lockAddSourceDocumentBody();
		const stop = observeAddSourceViewport(setViewport);
		focusElementWithoutScroll(dialogRef.current);
		return () => { stop(); unlock(); };
	}, []);
	useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

	function toggle(id) {
		setSelected((current) => current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]);
	}

	const content = <div className={`add-source-portal${removing ? "" : " collection-folders-sort-portal"}`} data-mobile-surface="opaque">
		<div className={`settings-modal-backdrop add-source-backdrop${removing ? "" : " collection-folders-sort-backdrop"}`} style={viewport ?? undefined}>
			<section ref={dialogRef} className={`add-source-dialog collection-folders-dialog is-${mode}`} data-collection-folders-dialog={mode} role="dialog" aria-modal="true" aria-labelledby="collection-folders-title" tabIndex={-1} onKeyDown={(event) => handleDialogKeyDown(event, dialogRef.current, onCancel)}>
				<header className="add-source-heading">
					<h2 id="collection-folders-title">{title}</h2>
					<p>{nodeTitle(collection.editable.title, "collection").text}</p>
				</header>
				<div className="collection-folders-body">
				{removing ? <div className="collection-folders-controls">
					<p className="genre-attention-note">This can’t be undone. Selected folders and all sources inside them will be permanently deleted.</p>
					<GenreSelectionToolbar selectionCount={selected.length} totalCount={rows.length} onSelectAll={() => setSelected(rows.map(({ folder }) => folder.internalId))} onClearAll={() => setSelected([])} />
				</div> : null}
				<div className="add-source-scroll collection-folders-scroll">
					{removing ? <>
						<ul className="genre-catalogue-list collection-folder-list" aria-label="Folders to remove">
							{rows.map(({ folder, index, title: folderTitle }) => <li key={folder.internalId}>
								<label className="genre-catalogue-choice" data-selection-mode="multiple" data-selected={selected.includes(folder.internalId) ? "true" : undefined}>
									<input className="visually-hidden choice-card-input" type="checkbox" checked={selected.includes(folder.internalId)} onChange={() => toggle(folder.internalId)} />
									<span><strong>{folderTitle.text}</strong><small>Folder {index + 1} · {folder.sources.length} {folder.sources.length === 1 ? "source" : "sources"}{folderTitle.hidden ? " · Invisible in Nuvio" : ""}</small></span>
								</label>
							</li>)}
						</ul>
					</> : <SemanticSortChoices options={folderSortOptions(collection)} selectedId={sort} onChange={setSort} name="collection-folder-sort" legend="Order folders by" helper="Sort once. You can still drag folders afterward." />}
				</div>
				</div>
				<footer className="add-source-actions collection-folders-actions">
					{error ? <p className="editor-diagnostics" ref={errorRef} tabIndex={-1} role="alert">{error}</p> : null}
					<button className={removing ? "editor-apply collection-folders-delete" : "editor-apply"} type="button" disabled={removing && selected.length === 0} onClick={() => onApply(removing ? selected : sort)}>{removing ? `Delete ${selected.length} ${selected.length === 1 ? "folder" : "folders"}` : "Sort folders"}</button>
					<button className="editor-cancel" type="button" onClick={onCancel}>Cancel</button>
				</footer>
			</section>
		</div>
	</div>;
	return typeof document === "undefined" ? content : createPortal(content, document.body);
}
