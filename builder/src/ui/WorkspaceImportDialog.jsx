import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { lockAddSourceDocumentBody, observeAddSourceViewport, resolveAddSourceViewportStyle } from "./add-source-modal-lifecycle.js";
import { focusElementWithoutScroll } from "./hierarchy-menu-placement.js";
import { handleDialogKeyDown } from "./modal-focus.js";
import { ImportMethods } from "./ImportMethods.jsx";
import { CollectionImportReview, ImportCounts } from "./CollectionImportReview.jsx";
import { useCollectionImportReview } from "./use-collection-import-review.js";
import { importCollectionSnapshot, reviewJsonFile, reviewPastedJson } from "./import-actions.js";
import { createWelcomeActionGate, yieldToBrowser } from "./welcome-action-coordinator.js";
import "./nuvio-connection.css";

const useBeforePaint = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function WorkspaceImportDialog({ controller, builderState, suspended, onOpenNuvio, onClose, onImported }) {
	const [importMethod, setImportMethod] = useState(null);
	const [selectedFile, setSelectedFile] = useState(null);
	const [pastedText, setPastedText] = useState("");
	const [snapshot, setSnapshot] = useState(null);
	const [diagnostics, setDiagnostics] = useState([]);
	const [busyAction, setBusyAction] = useState(null);
	const [viewport, setViewport] = useState(() => typeof window === "undefined" ? null : resolveAddSourceViewportStyle(window));
	const heading = useRef(null);
	const dialog = useRef(null);
	const content = useRef(null);
	const errorRef = useRef(null);
	const gate = useRef(createWelcomeActionGate());
	const attempt = useRef(0);
	const snapshotAuthority = useRef(null);
	const id = useId();
	const review = useCollectionImportReview({ controller, builderState, snapshot,
		applySnapshot: (options) => options.snapshot === snapshotAuthority.current ? importCollectionSnapshot(options) : { ok: false, message: "Review the incoming Collections again before importing." },
		onImported: () => onImported(`${snapshot.counts.collections} ${snapshot.counts.collections === 1 ? "Collection" : "Collections"} imported from ${snapshot.method === "file" ? "file" : "JSON"}.`),
	});
	useEffect(() => () => { attempt.current += 1; }, []);
	// Suspend the local surface and release its trap/body lock during Nuvio.
	// Keep the native file input mounted so the browser can retain its selection.
	useBeforePaint(() => {
		if (suspended) return;
		const unlock = lockAddSourceDocumentBody();
		const stop = observeAddSourceViewport(setViewport);
		focusElementWithoutScroll(heading.current);
		return () => { stop(); unlock(); };
	}, [suspended]);
	useBeforePaint(() => {
		if (suspended) return;
		if (content.current) content.current.scrollTop = 0;
		focusElementWithoutScroll(heading.current);
	}, [snapshot, review.confirmation]);
	useEffect(() => {
		if (!suspended && (diagnostics.length || review.error)) focusElementWithoutScroll(errorRef.current);
	}, [diagnostics, review.error, suspended]);
	function invalidate() { snapshotAuthority.current = null; setSnapshot(null); setDiagnostics([]); review.setError(null); }
	function chooseImportMethod(method, event) {
		if (gate.current.isActive()) return;
		if (method === "nuvio") onOpenNuvio(event);
		else { invalidate(); setImportMethod(method); }
	}
	async function read(event, method) {
		event.preventDefault();
		if (suspended || snapshot || importMethod !== method || !gate.current.tryAcquire()) return;
		const token = ++attempt.current;
		setBusyAction(method === "file" ? "file" : "pasted"); invalidate();
		try {
			await yieldToBrowser();
			const result = method === "file" ? await reviewJsonFile(selectedFile) : reviewPastedJson(pastedText);
			if (attempt.current !== token) return;
			if (result.ok) { snapshotAuthority.current = result.snapshot; setSnapshot(result.snapshot); }
			else setDiagnostics(result.errors);
		} catch {
			if (attempt.current === token) setDiagnostics([{ code: "IMPORT_REVIEW_FAILED", message: "The incoming Collections could not be reviewed. Your project is unchanged." }]);
		} finally {
			gate.current.release();
			if (attempt.current === token) setBusyAction(null);
		}
	}
	return createPortal(<div className="nuvio-connection-backdrop" style={{ ...viewport, ...(suspended ? { display: "none" } : {}) }} inert={suspended || undefined} aria-hidden={suspended || undefined}
		onMouseDown={(event) => { if (event.target === event.currentTarget) { event.preventDefault(); focusElementWithoutScroll(heading.current); } }}>
		<section className="nuvio-connection-dialog workspace-import-dialog" role={suspended ? undefined : "dialog"} aria-modal={suspended ? undefined : "true"} aria-labelledby={`${id}-title`} ref={dialog} data-workspace-import
			onKeyDown={(event) => handleDialogKeyDown(event.target === heading.current ? { key: event.key, shiftKey: event.shiftKey, target: dialog.current, preventDefault: () => event.preventDefault() } : event, dialog.current, onClose, { includeControl: (element) => element.getClientRects().length > 0 })}>
			<header className="nuvio-dialog-header">
				{snapshot ? <button className="add-source-header-action" type="button" onClick={invalidate}><span aria-hidden="true">←</span> Back</button> : null}
				<div><h2 id={`${id}-title`} ref={heading} tabIndex={-1}>{review.confirmation ? "Replace current project?" : snapshot ? "Review import" : "Import"}</h2></div>
				<button className="add-source-header-action add-source-close-action" type="button" aria-label="Close Import" onClick={onClose}>Close</button>
			</header>
			<div className="nuvio-dialog-content dingo-scrollbar" ref={content}>
				{diagnostics.length || review.error ? <div className="nuvio-notice is-error" role="alert" tabIndex={-1} ref={errorRef}>{review.error ?? diagnostics.map((entry) => <p key={entry.code}>{entry.message}</p>)}</div> : null}
				<div className="welcome-import" hidden={Boolean(snapshot)}>
					<ImportMethods importMethod={importMethod} onOpenNuvio={onOpenNuvio} chooseImportMethod={chooseImportMethod} isBusy={busyAction !== null} busyAction={busyAction} reviewOnly
						isActionActive={() => gate.current.isActive()}
						handleFileImport={(event) => read(event, "file")} handlePastedImport={(event) => read(event, "json")}
						onFileChange={(file) => { invalidate(); setSelectedFile(file); }} pastedText={pastedText} onTextChange={(text) => { invalidate(); setPastedText(text); }} />
				</div>
				{snapshot ? <div className="nuvio-review"><p className="nuvio-muted">{snapshot.method === "file" ? `File: ${selectedFile.name}` : "Pasted JSON"}</p>
					<ImportCounts counts={snapshot.counts} />
					<CollectionImportReview id={id} snapshot={snapshot} review={review} currentCollectionCount={builderState.project.collections.length} />
				</div> : null}
				<p className="privacy-note">Your collection JSON is processed locally in this browser and is not uploaded.</p>
			</div>
			{!review.confirmation ? <footer className="nuvio-dialog-footer"><div className="nuvio-footer-actions">
				{snapshot ? <button className="nuvio-primary" type="button" disabled={review.importDisabled} onClick={() => review.perform()}>Import to Dingo</button> : null}
				<button className="secondary-action" type="button" onClick={onClose}>Cancel</button>
			</div></footer> : null}
		</section>
	</div>, document.body);
}
