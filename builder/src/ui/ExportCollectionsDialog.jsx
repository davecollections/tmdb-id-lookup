import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useBuilderControllerState } from "./use-builder-controller.js";
import { handleDialogKeyDown } from "./modal-focus.js";
import { lockAddSourceDocumentBody, observeAddSourceViewport, resolveAddSourceViewportStyle } from "./add-source-modal-lifecycle.js";
import { focusElementWithoutScroll } from "./hierarchy-menu-placement.js";
import { nodeTitle } from "./view-model.js";
import {
	collectionExportCounts, collectionExportFilename, copyCollectionsJson, createCollectionExportPayload,
	downloadCollectionsJson, exportDiagnosticMessage, exportDiagnosticNodes, exportDiagnosticTarget, EXPORT_SUCCESS_TIMEOUT_MS,
} from "./export-collections.js";
import { NuvioSendContent } from "./NuvioSendContent.jsx";
import { useNuvioSendState } from "./use-nuvio-send.js";
import { sendInProgress, sendStatusLabel } from "./nuvio-send-presentation.js";
import "./export-collections.css";

const useBeforePaint = typeof window === "undefined" ? useEffect : useLayoutEffect;
const diagnosticLocation = (nodes) => nodes.map((node) => nodeTitle(node.editable.title, node.nodeType).text).join(" → ");

export function ExportCollectionsDialog({ controller, onClose, onEdit, onMergeInstead, locked = false, connection, sendCoordinator, initialView = "export" }) {
	const attempt = useNuvioSendState(sendCoordinator);
	const [view, setView] = useState(initialView);
	const pendingSend = attempt.dispatch.count > 0 && !["VERIFIED", "REJECTED"].includes(attempt.phase);
	const lastTarget = attempt.baseline?.profile ?? attempt.target;
	function close() {
		if (view === "send" && sendInProgress(sendCoordinator.getState(), connection.getState())) return;
		if (view === "send" && !attempt.dispatch.count) { sendCoordinator.cancel(); connection.cancelReview(); }
		onClose();
	}
	function enterSend() {
		if (!sendCoordinator || !connection) return;
		if (!pendingSend) sendCoordinator.prepare();
		actionVersion.current++; setFeedback(null); setImportExpanded(false);
		setView("send");
	}
	const { project } = useBuilderControllerState(controller);
	const getPayload = useMemo(() => createCollectionExportPayload(controller), [controller]);
	const [payload, setPayload] = useState(null);
	const current = payload?.project === project ? payload : null;
	const counts = current?.counts ?? collectionExportCounts(project.collections);
	const [filename] = useState(collectionExportFilename);
	const [feedback, setFeedback] = useState(null);
	const [importExpanded, setImportExpanded] = useState(false);
	const importInstructionsId = useId();

	const [copying, setCopying] = useState(false);
	const busy = useRef(false);
	const mounted = useRef(true);
	const actionVersion = useRef(0);
	const dialogRef = useRef(null);
	const closeRef = useRef(null);
	const statusRef = useRef(null);
	const scrollRef = useRef(null);
	const editorReturn = useRef(null);
	const [viewportStyle, setViewportStyle] = useState(() => typeof window === "undefined" ? null : resolveAddSourceViewportStyle(window));

	useEffect(() => { setPayload(getPayload()); }, [project, getPayload]);
	useEffect(() => {
		mounted.current = true;
		return () => { mounted.current = false; actionVersion.current++; };
	}, []);
	useEffect(() => {
		if (!feedback || feedback.error) return;
		const timer = setTimeout(() => setFeedback(null), EXPORT_SUCCESS_TIMEOUT_MS);
		return () => clearTimeout(timer);
	}, [feedback]);
	useBeforePaint(() => {
		const unlock = lockAddSourceDocumentBody();
		const stopObserving = observeAddSourceViewport(setViewportStyle);
		focusElementWithoutScroll(closeRef.current);
		return () => { stopObserving(); unlock(); };
	}, []);
	useBeforePaint(() => {
		if (locked || !current || !editorReturn.current) return;
		const previous = editorReturn.current; editorReturn.current = null;
		scrollRef.current.scrollTop = previous.top;
		focusElementWithoutScroll(previous.trigger?.isConnected && previous.trigger.getClientRects().length ? previous.trigger : statusRef.current);
	}, [locked, current]);

	function edit(diagnostic, trigger) {
		// Re-resolve the target at activation; never launch from a retained snapshot.
		const target = exportDiagnosticTarget(controller.getState().project, diagnostic);
		if (!target) return;
		editorReturn.current = { trigger, top: scrollRef.current.scrollTop };
		onEdit(target.internalId, trigger);
	}
	async function copy() {
		if (busy.current) return;
		const output = getPayload();
		if (!output.ok) { setPayload(output); return; }
		const version = ++actionVersion.current;
		busy.current = true; setCopying(true); setFeedback(null);
		const ok = await copyCollectionsJson(output);
		busy.current = false;
		if (!mounted.current) return;
		setCopying(false);
		if (actionVersion.current === version && controller.getState().project === output.project) setFeedback({ error: !ok, text: ok ? "JSON copied." : "Copy failed. Allow clipboard access or use Download JSON." });
	}
	function download() {
		const output = getPayload();
		if (!output.ok) { setPayload(output); return; }
		actionVersion.current++;
		try { downloadCollectionsJson(output, { filename }); setFeedback({ error: false, text: "Download started." }); }
		catch { setFeedback({ error: true, text: "The download could not start. Try again or use Copy JSON." }); }
	}
	function diagnostics(items) {
		return <ul>{items.map((diagnostic, index) => {
			const target = exportDiagnosticTarget(project, diagnostic);
			const nodes = exportDiagnosticNodes(project, diagnostic);
			const affected = nodes.at(-1);
			const context = diagnosticLocation(nodes);
			return <li key={`${diagnostic.code}:${diagnostic.path}:${index}`}>
				{context ? <p className="export-muted">{context}</p> : null}
				<p>{exportDiagnosticMessage(diagnostic)}</p>
				{target ? <button type="button" data-export-edit={target.nodeType} onClick={(event) => edit(diagnostic, event.currentTarget)}>Edit {target.nodeType}: {nodeTitle(target.editable.title, target.nodeType).text}</button> : null}
				{affected && !["COLLECTION_TITLE_REQUIRED", "FOLDER_TITLE_REQUIRED"].includes(diagnostic.code) ? <p className="export-muted">{target ? "If this problem cannot be corrected in the editor, close" : "This item cannot be repaired here. Close"} Export &amp; Send and delete this {affected.nodeType === "source" ? "Source" : affected.nodeType === "folder" ? "Folder" : "Collection"} in the Builder. Keep your original imported file.</p> : null}
			</li>;
		})}</ul>;
	}
	const errorCount = current?.errors.length ?? 0;
	const content = <div className="export-collections-portal" hidden={locked}>
		<div className="settings-modal-backdrop export-collections-backdrop" style={viewportStyle ?? undefined} data-backdrop-dismiss="false" onMouseDown={(event) => {
			if (event.target === event.currentTarget) { event.preventDefault(); focusElementWithoutScroll(dialogRef.current); }
		}}>
			<section className={`export-collections-dialog${view === "send" ? " is-send nuvio-connection-dialog" : ""}`} data-export-collections data-nuvio-send={view === "send" ? true : undefined} data-send-phase={view === "send" ? attempt.phase : undefined} ref={dialogRef} role={locked ? undefined : "dialog"} aria-modal={locked ? undefined : "true"} aria-labelledby="export-collections-title" tabIndex={-1} onKeyDown={(event) => {
				if (!locked) handleDialogKeyDown(event.target.tagName === "H2" ? { key: event.key, shiftKey: event.shiftKey, target: dialogRef.current, preventDefault: () => event.preventDefault() } : event, dialogRef.current, close, { includeControl: (element) => element.getClientRects().length > 0 });
			}}>
				{view === "send" ? <NuvioSendContent connection={connection} coordinator={sendCoordinator} attempt={attempt} onClose={close} onMergeInstead={onMergeInstead} onBack={() => { setView("export"); requestAnimationFrame(() => focusElementWithoutScroll(closeRef.current)); }} /> : <>
				<header className="export-collections-header"><h2 id="export-collections-title">Export &amp; Send</h2><button type="button" ref={closeRef} aria-label="Close Export & Send" onClick={close}>Close</button></header>
				<div className="export-collections-summary">
					<h3 ref={statusRef} tabIndex={-1} className={errorCount ? "export-problem-status" : ""} role="status">{!current ? "Checking your collections…" : errorCount ? `${errorCount} ${errorCount === 1 ? "problem" : "problems"} to fix before exporting` : "Ready to export"}</h3>
					<dl className="export-collections-totals">{Object.entries(counts).map(([name, count]) => <div key={name}><dt>{name[0].toUpperCase() + name.slice(1)}</dt><dd data-export-count={name}>{count}</dd></div>)}</dl>
					<p className="export-filename">{filename}</p>
				</div>
				<div className="export-collections-content dingo-scrollbar" ref={scrollRef} role="region" aria-label="Export details" tabIndex={0}>
					<div className="export-collections-actions">
						<button type="button" className="editor-apply export-send-primary" data-action="send-to-nuvio" disabled={!current?.ok || !sendCoordinator || pendingSend} onClick={enterSend}><strong>Send to Nuvio</strong><small>Replace the Collections on a Nuvio profile.</small></button>
						{attempt.dispatch.count ? <section className="send-last" aria-label="Last Send"><div><h4>Last Send</h4><p>{lastTarget.name} · Profile {lastTarget.index}</p><p className="export-muted">{attempt.phase === "VERIFIED" ? "Verified with Nuvio" : sendStatusLabel(attempt)}</p></div><button type="button" data-action="view-send-status" onClick={() => setView("send")}>View details</button></section> : null}
						<button type="button" className="secondary-action export-manual-action" data-action="download-collections-json" disabled={!current?.ok} onClick={download}><strong>Download JSON</strong><small>Save a Nuvio-compatible JSON file to your device.</small></button>
						<button type="button" className="secondary-action export-manual-action" data-action="copy-collections-json" disabled={!current?.ok || copying} onClick={copy}><strong>{copying ? "Copying…" : "Copy JSON"}</strong><small>Copy the Collection JSON to your clipboard.</small></button>
					</div>
					{current && errorCount > 0 ? <section className="export-diagnostics errors" aria-label="Export errors"><h4>Resolve before exporting</h4>{diagnostics(current.errors)}<p>No partial file will be exported.</p></section> : null}
					<div className="export-import-instructions">
						<button type="button" aria-expanded={importExpanded} aria-controls={importInstructionsId} onClick={() => setImportExpanded(!importExpanded)}>Need to add or merge Collections instead?</button>
						<div id={importInstructionsId} className="export-import-guide" hidden={!importExpanded}>
							<h4>Import into Nuvio</h4>
							<p className="export-muted">Nuvio is currently in beta, so these import steps may change.</p>
							<section className="export-import-section" aria-label="Web login">
								<h5>Add or merge on Nuvio.tv</h5>
								<ol>
									<li>Download JSON from Dingo.</li>
									<li>Sign in to <a href="https://nuvio.tv/" target="_blank" rel="noopener noreferrer" aria-label="Nuvio.tv (opens in a new tab)">Nuvio.tv</a>.</li>
									<li>Select the target profile and open its Collections import tools.</li>
									<li>Choose Import and select the downloaded file.</li>
									<li>Choose Add as new or Merge.</li>
									<li>Review and confirm in Nuvio.</li>
								</ol>
								<p className="export-import-clarification">Nuvio’s Merge uses Nuvio’s own matching rules and may differ from Dingo’s Merge exact matches.</p>
							</section>
							<details className="export-import-section" aria-label="TV app"><summary tabIndex={0}>TV import and TMDB Enrichment</summary>
								<h5>TV app</h5>
								<ol>
									<li>Open Nuvio and choose a profile.</li>
									<li>Go to Settings → Content &amp; Discovery → Addons.</li>
									<li>Open Collections.</li>
									<li>Choose Import.</li>
									<li>Choose From File or From URL.</li>
									<li>For From File, select the downloaded JSON file from Downloads, then confirm the import.</li>
									<li>For From URL, enter the direct URL of a JSON file, fetch it, then confirm the import.</li>
								</ol>
								<p className="export-import-clarification">Dingo provides a downloaded JSON file. It does not currently create a hosted URL.</p>
							<p className="export-import-enrichment">To help Nuvio add artwork and title details, go to Settings → Integrations → TMDB and turn on Enable TMDB Enrichment. A TMDB API key may be required. Follow the <a href="https://developer.themoviedb.org/docs/getting-started" target="_blank" rel="noopener noreferrer" aria-label="official TMDB API guide (opens in a new tab)">official TMDB API guide</a> to request one.</p></details>
						</div>
					</div>
				</div>
				<footer className="export-collections-footer">
					<p className="export-feedback" role={feedback?.error ? "alert" : "status"} aria-live={feedback?.error ? "assertive" : "polite"}>{feedback?.text ?? ""}</p>
				</footer></>}
			</section>
		</div>
	</div>;
	return typeof document === "undefined" ? content : createPortal(content, document.body);
}
