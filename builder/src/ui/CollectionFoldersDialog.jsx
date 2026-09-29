import { CollectionFolderSelectionList } from "./CollectionFolderSelectionList.jsx";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { lockAddSourceDocumentBody, observeAddSourceViewport, resolveAddSourceViewportStyle } from "./add-source-modal-lifecycle.js";
import { handleDialogKeyDown } from "./modal-focus.js";
import { focusElementWithoutScroll } from "./hierarchy-menu-placement.js";
import { GenreSelectionToolbar } from "./GenreCatalogueSelector.jsx";
import { nodeTitle } from "./view-model.js";

const usePrePaintLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function CollectionFoldersDialog({ collection, onCancel, onApply, error }) {
	const [selected, setSelected] = useState([]);
	const dialogRef = useRef(null);
	const errorRef = useRef(null);
	const cancelRef = useRef(null);
	const [viewport, setViewport] = useState(() => typeof window === "undefined" ? null : resolveAddSourceViewportStyle(window));
	const rows = collection.folders.map((folder, index) => ({ folder, index, title: nodeTitle(folder.editable.title, "folder") }));

	usePrePaintLayoutEffect(() => {
		const unlock = lockAddSourceDocumentBody();
		const stop = observeAddSourceViewport(setViewport);
		focusElementWithoutScroll(cancelRef.current);
		return () => { stop(); unlock(); };
	}, []);
	useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

	function toggle(id) {
		setSelected((current) => current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]);
	}

	const content = <div className="add-source-portal" data-mobile-surface="opaque">
		<div className="settings-modal-backdrop add-source-backdrop" style={viewport ?? undefined}>
			<section ref={dialogRef} className="add-source-dialog collection-folders-dialog is-remove" data-collection-folders-dialog="remove" role="dialog" aria-modal="true" aria-labelledby="collection-folders-title" tabIndex={-1} onKeyDown={(event) => handleDialogKeyDown(event, dialogRef.current, onCancel)}>
				<header className="add-source-heading">
					<h2 id="collection-folders-title">Delete folders</h2>
					<p>{nodeTitle(collection.editable.title, "collection").text}</p>
				</header>
				<div className="collection-folders-body">
				<div className="collection-folders-controls">
					<p className="genre-attention-note">This can’t be undone. Selected folders and all sources inside them will be permanently deleted.</p>
					<GenreSelectionToolbar selectionCount={selected.length} totalCount={rows.length} onSelectAll={() => setSelected(rows.map(({ folder }) => folder.internalId))} onClearAll={() => setSelected([])} />
				</div>
				<div className="add-source-scroll collection-folders-scroll">
						<CollectionFolderSelectionList folders={collection.folders} selected={selected} onToggle={toggle} label="Folders to delete" />
				</div>
				</div>
				<footer className="add-source-actions collection-folders-actions">
					{error ? <p className="editor-diagnostics" ref={errorRef} tabIndex={-1} role="alert">{error}</p> : null}
					<button ref={cancelRef} className="editor-cancel" type="button" onClick={onCancel}>Cancel</button>
					<button className="editor-apply collection-folders-delete" type="button" disabled={selected.length === 0} onClick={() => onApply(selected)}>Delete {selected.length} {selected.length === 1 ? "folder" : "folders"}</button>
				</footer>
			</section>
		</div>
	</div>;
	return typeof document === "undefined" ? content : createPortal(content, document.body);
}
