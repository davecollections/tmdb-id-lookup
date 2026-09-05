import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useBuilderControllerState } from "./use-builder-controller.js";
import { handleDialogKeyDown } from "./modal-focus.js";
import { lockAddSourceDocumentBody, observeAddSourceViewport, resolveAddSourceViewportStyle } from "./add-source-modal-lifecycle.js";
import { focusElementWithoutScroll } from "./hierarchy-menu-placement.js";
import { nodeTitle } from "./view-model.js";
import {
	collectionExportCounts, collectionExportFilename, copyCollectionsJson, createCollectionExportPayload,
	downloadCollectionsJson, exportDiagnosticMessage, exportDiagnosticNodes, exportDiagnosticTarget, groupExportWarnings, EXPORT_SUCCESS_TIMEOUT_MS,
} from "./export-collections.js";
import "./export-collections.css";

const useBeforePaint = typeof window === "undefined" ? useEffect : useLayoutEffect;
const diagnosticLocation = (nodes) => nodes.map((node) => nodeTitle(node.editable.title, node.nodeType).text).join(" → ");

function ExportWarningGroup({ group }) {
	const [expanded, setExpanded] = useState(false);
	const id = useId();
	return <section className="export-warning-group">
		<h4>{group.reason}</h4><p className="export-muted">{group.countLabel}</p><p>{group.consequence}</p>
		<button type="button" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(!expanded)}>{group.sourceCount === null ? "Show affected locations" : "Show affected Sources"}</button>
		<div id={id} hidden={!expanded}>{expanded ? <>
			{group.locations.map((location) => <div className="export-warning-location" key={location.key}>
				<p>{diagnosticLocation(location.nodes)}</p>
				{location.items.length ? <ul>{location.items.map((item) => <li key={item.key}>{item.source ? nodeTitle(item.source.editable.title, "source").text : item.text}</li>)}</ul> : null}
			</div>)}
			{group.unresolved ? <p>{group.unresolved} {group.unresolved === 1 ? "warning has" : "warnings have"} no available location.</p> : null}
		</> : null}</div>
	</section>;
}

export function ExportCollectionsDialog({ controller, onClose, onEdit, locked = false }) {
	const { project } = useBuilderControllerState(controller);
	const getPayload = useMemo(() => createCollectionExportPayload(controller), [controller]);
	const [payload, setPayload] = useState(null);
	const current = payload?.project === project ? payload : null;
	const counts = current?.counts ?? collectionExportCounts(project.collections);
	const [filename] = useState(collectionExportFilename);
	const [feedback, setFeedback] = useState(null);
	const [importExpanded, setImportExpanded] = useState(false);
	const importInstructionsId = useId();
	const [warningsExpanded, setWarningsExpanded] = useState(false);
	const warningGroups = useMemo(() => current ? groupExportWarnings(project, current.warnings) : [], [current, project]);
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
				{affected && !["COLLECTION_TITLE_REQUIRED", "FOLDER_TITLE_REQUIRED"].includes(diagnostic.code) ? <p className="export-muted">{target ? "If this problem cannot be corrected in the editor, close" : "This item cannot be repaired here. Close"} Export collections and delete this {affected.nodeType === "source" ? "Source" : affected.nodeType === "folder" ? "Folder" : "Collection"} in the Builder. Keep your original imported file.</p> : null}
			</li>;
		})}</ul>;
	}
	const errorCount = current?.errors.length ?? 0;
	const content = <div className="export-collections-portal" hidden={locked}>
		<div className="settings-modal-backdrop export-collections-backdrop" style={viewportStyle ?? undefined} data-backdrop-dismiss="false" onMouseDown={(event) => {
			if (event.target === event.currentTarget) { event.preventDefault(); focusElementWithoutScroll(dialogRef.current); }
		}}>
			<section className="export-collections-dialog" data-export-collections ref={dialogRef} role={locked ? undefined : "dialog"} aria-modal={locked ? undefined : "true"} aria-labelledby="export-collections-title" tabIndex={-1} onKeyDown={(event) => {
				if (!locked) handleDialogKeyDown(event, dialogRef.current, onClose, { includeControl: (element) => element.getClientRects().length > 0 });
			}}>
				<header className="export-collections-header"><h2 id="export-collections-title">Export collections</h2><button type="button" ref={closeRef} aria-label="Close Export collections" onClick={onClose}>Close</button></header>
				<div className="export-collections-summary">
					<h3 ref={statusRef} tabIndex={-1} className={errorCount ? "export-problem-status" : ""} role="status">{!current ? "Checking your collections…" : errorCount ? `${errorCount} ${errorCount === 1 ? "problem" : "problems"} to fix before exporting` : current.warnings.length ? "Ready to export with warnings" : "Ready to export"}</h3>
					<dl className="export-collections-totals">{Object.entries(counts).map(([name, count]) => <div key={name}><dt>{name[0].toUpperCase() + name.slice(1)}</dt><dd data-export-count={name}>{count}</dd></div>)}</dl>
					<p className="export-filename">{filename}</p>
				</div>
				<div className="export-collections-content dingo-scrollbar" ref={scrollRef} role="region" aria-label="Export details" tabIndex={0}>
					{current && errorCount > 0 ? <section className="export-diagnostics errors" aria-label="Export errors"><h4>Resolve before exporting</h4>{diagnostics(current.errors)}<p>No partial file will be exported.</p></section> : null}
					{current && current.warnings.length > 0 ? <details className="export-diagnostics warnings" onToggle={(event) => setWarningsExpanded(event.currentTarget.open)}><summary tabIndex={0}>{current.warnings.length} preservation {current.warnings.length === 1 ? "warning" : "warnings"}</summary>{warningsExpanded ? <><p>These warnings do not prevent export.</p>{warningGroups.map((group) => <ExportWarningGroup key={group.code} group={group} />)}</> : null}</details> : null}
					<div className="export-import-instructions">
						<button type="button" aria-expanded={importExpanded} aria-controls={importInstructionsId} onClick={() => setImportExpanded(!importExpanded)}>How to import into Nuvio</button>
						<div id={importInstructionsId} className="export-import-guide" hidden={!importExpanded}>
							<h4>Import into Nuvio</h4>
							<p className="export-muted">Nuvio is currently in beta, so these import steps may change.</p>
							<section className="export-import-section" aria-label="Web login">
								<h5>Web login</h5>
								<ol>
									<li>Go to <a href="https://nuvio.tv/" target="_blank" rel="noopener noreferrer" aria-label="Nuvio.tv (opens in a new tab)">Nuvio.tv</a> and log in.</li>
									<li>Select the profile you want to update.</li>
									<li>Open Account.</li>
									<li>Open Collections.</li>
									<li>Choose Import.</li>
									<li>Select the downloaded JSON file.</li>
									<li>Choose Add as new, Merge, or Overwrite.</li>
									<li>Choose Add collections.</li>
								</ol>
							</section>
							<section className="export-import-section" aria-label="TV app">
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
							</section>
							<p className="export-import-enrichment">To help Nuvio add artwork and title details, go to Settings → Integrations → TMDB and turn on Enable TMDB Enrichment. A TMDB API key may be required. Follow the <a href="https://developer.themoviedb.org/docs/getting-started" target="_blank" rel="noopener noreferrer" aria-label="official TMDB API guide (opens in a new tab)">official TMDB API guide</a> to request one.</p>
						</div>
					</div>
				</div>
				<footer className="export-collections-footer">
					<div className="export-collections-actions"><button type="button" className="editor-apply" data-action="download-collections-json" disabled={!current?.ok} onClick={download}>Download JSON</button><button type="button" data-action="copy-collections-json" disabled={!current?.ok || copying} onClick={copy}>{copying ? "Copying…" : "Copy JSON"}</button></div>
					<p className="export-feedback" role={feedback?.error ? "alert" : "status"} aria-live={feedback?.error ? "assertive" : "polite"}>{feedback?.text ?? ""}</p>
				</footer>
			</section>
		</div>
	</div>;
	return typeof document === "undefined" ? content : createPortal(content, document.body);
}
