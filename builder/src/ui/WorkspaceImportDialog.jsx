import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { lockAddSourceDocumentBody, observeAddSourceViewport, resolveAddSourceViewportStyle } from "./add-source-modal-lifecycle.js";
import { focusElementWithoutScroll } from "./hierarchy-menu-placement.js";
import { restoreAddSourceSearchView } from "./add-source-navigation-state.js";
import { handleDialogKeyDown } from "./modal-focus.js";
import { ImportMethods } from "./ImportMethods.jsx";
import { NuvioImportFlow } from "./NuvioImportFlow.jsx";
import { CollectionImportReview, CollectionImportReviewActions, ImportCounts } from "./CollectionImportReview.jsx";
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
		if (!importMethod || importMethod === "nuvio" || snapshot) return;
		restoreAddSourceSearchView({ scrollElement: content.current, resultElement: content.current?.querySelector(`#builder-import-${importMethod}-panel h3`), searchScrollTop: 0, focusWithoutScroll: focusElementWithoutScroll });
	}, [importMethod, snapshot]);
	useEffect(() => {
		if (diagnostics.length || review.error) focusElementWithoutScroll(errorRef.current);
	}, [diagnostics, review.error]);
	function invalidate() { snapshotAuthority.current = null; setSnapshot(null); setDiagnostics([]); review.setError(null); }
	function chooseImportMethod(method) {
		if (gate.current.isActive() || connection.getState().busy || snapshot || (importMethod === "nuvio" && connection.getState().snapshot) || method === importMethod) return;
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
	// Keep the flow and native draft forms mounted while the host changes layout.
	return createPortal(<NuvioImportFlow connection={connection} controller={controller} builderState={builderState} onImported={onImported}
		active={importMethod === "nuvio"} reviewInHost focusRef={heading} scrollRef={content}>
		{(nuvio) => {
			const incoming = importMethod === "nuvio" ? nuvio.snapshot : snapshot;
			const activeReview = importMethod === "nuvio" ? nuvio.review : review;
			const reviewing = Boolean(incoming);
			const confirming = reviewing && activeReview.confirmation && !activeReview.staleProject;
			const sourceContext = importMethod === "nuvio" ? nuvio.sourceContext : <span>{snapshot?.method === "file" ? `File · ${selectedFile.name}` : "Pasted JSON"}</span>;
			function back() {
				if (confirming) activeReview.setConfirmation(false);
				else if (importMethod === "nuvio") nuvio.backToProfiles();
				else invalidate();
			}
			return <div className="nuvio-connection-backdrop" style={viewport ?? undefined}
				onMouseDown={(event) => { if (event.target === event.currentTarget) { event.preventDefault(); focusElementWithoutScroll(heading.current); } }}>
				<section className="nuvio-connection-dialog workspace-import-dialog" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={reviewing ? `${id}-source` : undefined} ref={dialog} data-workspace-import data-import-layout={reviewing ? "review" : "acquire"}
					onKeyDown={(event) => handleDialogKeyDown(event.target === heading.current ? { key: event.key, shiftKey: event.shiftKey, target: dialog.current, preventDefault: () => event.preventDefault() } : event, dialog.current, onClose, { includeControl: (element) => element.getClientRects().length > 0 })}>
					<header className={`nuvio-dialog-header${reviewing ? " add-source-heading-row" : ""}`}>
						{reviewing ? <button className="add-source-header-action" type="button" aria-label="Back" onClick={back}><span aria-hidden="true">←</span> Back</button> : null}
						<div><h2 id={`${id}-title`} ref={heading} tabIndex={-1}>{confirming ? "Replace current project?" : reviewing ? "Review import" : "Import"}</h2>
							{reviewing ? <div className="workspace-import-source" id={`${id}-source`}>{sourceContext}</div> : null}
						</div>
						<button className="add-source-header-action add-source-close-action" type="button" aria-label="Close Import" onClick={onClose}>Close</button>
					</header>
					<div className="nuvio-dialog-content dingo-scrollbar" ref={content}>
						{diagnostics.length || review.error ? <div className="nuvio-notice is-error" role="alert" tabIndex={-1} ref={errorRef}>{review.error ?? diagnostics.map((entry) => <p key={entry.code}>{entry.message}</p>)}</div> : null}
						<div className="welcome-import" hidden={reviewing}>
							<ImportMethods importMethod={importMethod} nuvioMode="embedded" chooseImportMethod={chooseImportMethod} isBusy={busyAction !== null || Boolean(connectionState.busy)} busyAction={busyAction} reviewOnly
								nuvioContent={importMethod === "nuvio" && !reviewing ? <section className="workspace-nuvio-flow" data-nuvio-flow>
									{nuvio.progress}{nuvio.content}{nuvio.actions ? <div className="nuvio-flow-actions">{nuvio.actions}</div> : null}
								</section> : null}
								isActionActive={() => gate.current.isActive() || Boolean(incoming) || Boolean(connection.getState().busy)}
								handleFileImport={(event) => read(event, "file")} handlePastedImport={(event) => read(event, "json")}
								onFileChange={(file) => { invalidate(); setSelectedFile(file); }} pastedText={pastedText} onTextChange={(text) => { invalidate(); setPastedText(text); }} />
						</div>
						{reviewing ? <div className="nuvio-review" data-workspace-import-review>
							{!confirming ? importMethod === "nuvio" ? nuvio.reviewSummary : <ImportCounts counts={incoming.counts} /> : null}
							{incoming.kind === "ready" ? <CollectionImportReview actionsInFooter scrollRef={content} id={id} snapshot={incoming} review={activeReview} currentCollectionCount={builderState.project.collections.length} /> : null}
						</div> : null}
						{importMethod !== "nuvio" && !confirming ? <p className="privacy-note">Your collection JSON is processed locally in this browser and is not uploaded.</p> : null}
					</div>
					<footer className="nuvio-dialog-footer workspace-import-footer">
						{reviewing ? <CollectionImportReviewActions review={activeReview} onCancel={onClose} /> : <div className="nuvio-footer-actions"><button className="secondary-action" type="button" onClick={onClose}>Cancel</button></div>}
					</footer>
				</section>
			</div>;
		}}
	</NuvioImportFlow>, document.body);
}
