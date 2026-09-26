import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { lockAddSourceDocumentBody, observeAddSourceViewport, resolveAddSourceViewportStyle } from "./add-source-modal-lifecycle.js";
import { focusElementWithoutScroll } from "./hierarchy-menu-placement.js";
import { restoreAddSourceSearchView } from "./add-source-navigation-state.js";
import { handleDialogKeyDown } from "./modal-focus.js";
import { ImportMethods } from "./ImportMethods.jsx";
import { NuvioImportFlow } from "./NuvioImportFlow.jsx";
import { CollectionImportReview, ImportCounts } from "./CollectionImportReview.jsx";
import { useCollectionImportReview } from "./use-collection-import-review.js";
import { importCollectionSnapshot, reviewJsonFile, reviewPastedJson } from "./import-actions.js";
import { createWelcomeActionGate, yieldToBrowser } from "./welcome-action-coordinator.js";
import "./nuvio-connection.css";

const useBeforePaint = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function WorkspaceImportDialog({ controller, builderState, connection, onClose, onImported }) {
	const connectionState = useSyncExternalStore(connection.subscribe, connection.getState, connection.getState);
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
	useEffect(() => () => { attempt.current += 1; snapshotAuthority.current = null; }, []);
	useBeforePaint(() => {
		const unlock = lockAddSourceDocumentBody();
		const stop = observeAddSourceViewport(setViewport);
		focusElementWithoutScroll(heading.current);
		return () => { stop(); unlock(); };
	}, []);
	useBeforePaint(() => {
		if (content.current) content.current.scrollTop = 0;
		focusElementWithoutScroll(heading.current);
	}, [snapshot, review.confirmation]);
	useBeforePaint(() => {
		if (!importMethod || importMethod === "nuvio") return;
		restoreAddSourceSearchView({ scrollElement: content.current, resultElement: content.current?.querySelector(`#builder-import-${importMethod}-panel h3`), searchScrollTop: 0, focusWithoutScroll: focusElementWithoutScroll });
	}, [importMethod]);
	useEffect(() => {
		if (diagnostics.length || review.error) focusElementWithoutScroll(errorRef.current);
	}, [diagnostics, review.error]);
	function invalidate() { snapshotAuthority.current = null; setSnapshot(null); setDiagnostics([]); review.setError(null); }
	function chooseImportMethod(method) {
		if (gate.current.isActive() || connection.getState().busy || method === importMethod) return;
		invalidate();
		// Changing authority discards its review but retains the memory-only session.
		if (importMethod === "nuvio" || method === "nuvio") connection.cancelReview();
		if (method === "nuvio") connection.checkExpiry();
		setImportMethod(method);
	}
	async function read(event, method) {
		event.preventDefault();
		if (snapshot || importMethod !== method || connection.getState().busy || !gate.current.tryAcquire()) return;
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
	return createPortal(<div className="nuvio-connection-backdrop" style={viewport ?? undefined}
		onMouseDown={(event) => { if (event.target === event.currentTarget) { event.preventDefault(); focusElementWithoutScroll(heading.current); } }}>
		<section className="nuvio-connection-dialog workspace-import-dialog" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} ref={dialog} data-workspace-import
			onKeyDown={(event) => handleDialogKeyDown(event.target === heading.current ? { key: event.key, shiftKey: event.shiftKey, target: dialog.current, preventDefault: () => event.preventDefault() } : event, dialog.current, onClose, { includeControl: (element) => element.getClientRects().length > 0 })}>
			<header className="nuvio-dialog-header">
				{snapshot ? <button className="add-source-header-action" type="button" onClick={invalidate}><span aria-hidden="true">←</span> Back</button> : null}
				<div><h2 id={`${id}-title`} ref={heading} tabIndex={-1}>{review.confirmation ? "Replace current project?" : snapshot ? "Review import" : "Import"}</h2></div>
				<button className="add-source-header-action add-source-close-action" type="button" aria-label="Close Import" onClick={onClose}>Close</button>
			</header>
			<div className="nuvio-dialog-content dingo-scrollbar" ref={content}>
				{diagnostics.length || review.error ? <div className="nuvio-notice is-error" role="alert" tabIndex={-1} ref={errorRef}>{review.error ?? diagnostics.map((entry) => <p key={entry.code}>{entry.message}</p>)}</div> : null}
				<div className="welcome-import" hidden={Boolean(snapshot)}>
					<ImportMethods importMethod={importMethod} nuvioMode="embedded" chooseImportMethod={chooseImportMethod} isBusy={busyAction !== null || Boolean(connectionState.busy)} busyAction={busyAction} reviewOnly
						nuvioContent={importMethod === "nuvio" ? <NuvioImportFlow connection={connection} controller={controller} builderState={builderState} onImported={onImported} scrollRef={content}>
							{({ progress, backAction, content: flowContent, actions }) => <section className="workspace-nuvio-flow" data-nuvio-flow>
								{progress}{backAction ? <div className="nuvio-flow-back">{backAction}</div> : null}{flowContent}
								{actions ? <div className="nuvio-flow-actions">{actions}</div> : null}
							</section>}
						</NuvioImportFlow> : null}
						isActionActive={() => gate.current.isActive()}
						handleFileImport={(event) => read(event, "file")} handlePastedImport={(event) => read(event, "json")}
						onFileChange={(file) => { invalidate(); setSelectedFile(file); }} pastedText={pastedText} onTextChange={(text) => { invalidate(); setPastedText(text); }} />
				</div>
				{snapshot ? <div className="nuvio-review"><p className="nuvio-muted">{snapshot.method === "file" ? `File: ${selectedFile.name}` : "Pasted JSON"}</p>
					<ImportCounts counts={snapshot.counts} />
					<CollectionImportReview scrollRef={content} id={id} snapshot={snapshot} review={review} currentCollectionCount={builderState.project.collections.length} />
				</div> : null}
				{importMethod !== "nuvio" ? <p className="privacy-note">Your collection JSON is processed locally in this browser and is not uploaded.</p> : null}
			</div>
			{!review.confirmation ? <footer className="nuvio-dialog-footer"><div className="nuvio-footer-actions">
				{snapshot ? <button className="nuvio-primary" type="button" disabled={review.importDisabled} onClick={() => review.perform()}>Import to Dingo</button> : null}
				<button className="secondary-action" type="button" onClick={onClose}>Cancel</button>
			</div></footer> : null}
		</section>
	</div>, document.body);
}
