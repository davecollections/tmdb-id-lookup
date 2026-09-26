import { useEffect, useRef, useState } from "react";
import builderMark from "../assets/builder-mark.svg";
import { AboutCreditsDialog } from "./AboutCreditsDialog.jsx";
import { focusElementWithoutScroll } from "./hierarchy-menu-placement.js";
import { sendAttentionLabel } from "./nuvio-send-presentation.js";
import {
	importJsonFile,
	importPastedJson,
	startNewBuilderProject,
} from "./import-actions.js";
import {
	createWelcomeActionGate,
	runWelcomeAction,
	yieldToBrowser,
} from "./welcome-action-coordinator.js";

function DiagnosticList({ diagnostics, kind }) {
	if (diagnostics.length === 0) {
		return null;
	}

	const content = (
		<ul className="welcome-diagnostic-list">
			{diagnostics.map((entry, index) => (
				<li key={`${entry.code}-${entry.path}-${index}`}>
					<strong>{entry.message}</strong>
					<span>{entry.code}{entry.path !== "$ui.import" ? ` · ${entry.path}` : ""}</span>
				</li>
			))}
		</ul>
	);

	return kind === "error" ? (
		<div className="welcome-diagnostics is-error" role="alert">{content}</div>
	) : (
		<div className="welcome-diagnostics is-warning" aria-label="Import warnings">{content}</div>
	);
}

export function BuilderWelcome({ controller, state, onEnterWorkspace, onOpenNuvio, nuvioOpen = false, sendState, onOpenSendStatus }) {
	const [importMethod, setImportMethod] = useState(null);
	const [selectedFile, setSelectedFile] = useState(null);
	const [pastedText, setPastedText] = useState("");
	const [localDiagnostics, setLocalDiagnostics] = useState([]);
	const [busyAction, setBusyAction] = useState(null);
	const [aboutCreditsOpen, setAboutCreditsOpen] = useState(false);
	const actionGateRef = useRef(null);
	const aboutCreditsTriggerRef = useRef(null);
	const restoreAboutCreditsFocusRef = useRef(false);
	if (actionGateRef.current === null) {
		actionGateRef.current = createWelcomeActionGate();
	}
	const isBusy = busyAction !== null;

	const controllerErrors = [
		...state.diagnostics.operation.errors,
		...state.diagnostics.import.errors,
	];
	const visibleErrors = localDiagnostics.length > 0 ? localDiagnostics : controllerErrors;
	const visibleWarnings = localDiagnostics.length > 0 ? [] : state.diagnostics.import.warnings;

	useEffect(() => {
		if (aboutCreditsOpen || !restoreAboutCreditsFocusRef.current) return;
		restoreAboutCreditsFocusRef.current = false;
		focusElementWithoutScroll(aboutCreditsTriggerRef.current);
	}, [aboutCreditsOpen]);

	function showFailure(result) {
		setLocalDiagnostics(result.errors[0]?.path === "$ui.import" ? result.errors : []);
	}

	function handleStartNewProject() {
		void runWelcomeAction({
			gate: actionGateRef.current,
			actionName: "start",
			setBusyAction,
			action: () => startNewBuilderProject(controller),
			onFailure: showFailure,
			onSuccess: () => setLocalDiagnostics([]),
			onEnterWorkspace: () => onEnterWorkspace({ startCreation: true }),
		});
	}

	async function handleFileImport(event) {
		event.preventDefault();
		if (importMethod !== "file") return;
		const file = selectedFile;
		await runWelcomeAction({
			gate: actionGateRef.current,
			actionName: "file",
			setBusyAction,
			action: () => importJsonFile(controller, file),
			onFailure: showFailure,
			onSuccess: () => {
				setLocalDiagnostics([]);
				setSelectedFile(null);
			},
			onEnterWorkspace,
		});
	}

	async function handlePastedImport(event) {
		event.preventDefault();
		if (importMethod !== "json") return;
		const text = pastedText;
		await runWelcomeAction({
			gate: actionGateRef.current,
			actionName: "pasted",
			setBusyAction,
			beforeAction: yieldToBrowser,
			action: () => importPastedJson(controller, text),
			onFailure: showFailure,
			onSuccess: () => {
				setLocalDiagnostics([]);
				setPastedText("");
			},
			onEnterWorkspace,
		});
	}

	function chooseImportMethod(method, event) {
		if (actionGateRef.current.isActive()) return;
		if (method === "nuvio") onOpenNuvio(event);
		else setImportMethod(method);
	}

	function closeAboutCredits() {
		if (!aboutCreditsOpen) return;
		restoreAboutCreditsFocusRef.current = true;
		setAboutCreditsOpen(false);
	}

	return (
		<>
		<main
			className="builder-welcome"
			data-builder-welcome="true"
			data-about-credits-open={aboutCreditsOpen ? "true" : undefined}
			aria-busy={isBusy}
			inert={aboutCreditsOpen || nuvioOpen || undefined}
			aria-hidden={aboutCreditsOpen || nuvioOpen ? "true" : undefined}
		>
			<header className="welcome-brand">
				<img className="welcome-mark" src={builderMark} alt="" width="68" height="68" />
				<div>
					<p className="preview-label">Development preview</p>
					<h1 className="builder-product-title">
						<span>Dingo's</span>
						<span>Collection Builder</span>
					</h1>
					<p className="brand-subtitle">Built for Nuvio collections</p>
				</div>
				<p className="welcome-description">
					Create, import and organise Nuvio collections.
				</p>
			</header>
			{sendState?.dispatch.count ? <div className="welcome-send-status"><button className={sendAttentionLabel(sendState) ? "send-attention" : "send-history-entry"} type="button" data-action="open-nuvio-send-status" aria-haspopup="dialog" onClick={(event) => onOpenSendStatus(event, sendAttentionLabel(sendState) ? "send" : "export")} disabled={isBusy}>{sendAttentionLabel(sendState) ?? "Export & Send"}</button></div> : null}

			<section className="welcome-start" aria-labelledby="start-project-title">
				<div>
					<p className="panel-kicker">Create</p>
					<h2 id="start-project-title">Start a new collection</h2>
					<p>Open a clean workspace and build your Nuvio collection.</p>
				</div>
				<button
					className="welcome-primary-action"
					type="button"
					data-action="start-new-project"
					onClick={handleStartNewProject}
					disabled={isBusy}
				>
					Create new collection
				</button>
			</section>

			<div className="welcome-diagnostic-stack">
				<DiagnosticList diagnostics={visibleErrors} kind="error" />
				<DiagnosticList diagnostics={visibleWarnings} kind="warning" />
			</div>

			<section className="welcome-import" aria-labelledby="import-title">
				<div className="welcome-section-heading">
					<p className="panel-kicker">Import</p>
					<h2 id="import-title">Open an existing collection</h2>
				</div>

				<div className="welcome-import-layout">
					<div className="welcome-import-methods" role="group" aria-label="Import method">
						{onOpenNuvio ? (
							<button
								type="button"
								className="import-action welcome-import-method"
								data-action="open-nuvio-import"
								aria-haspopup="dialog"
								disabled={isBusy}
								aria-labelledby="builder-import-nuvio-title"
								aria-describedby="builder-import-nuvio-help"
								onClick={(event) => chooseImportMethod("nuvio", event)}
							>
								<span className="creation-option-copy"><strong id="builder-import-nuvio-title">Import from Nuvio</strong><small id="builder-import-nuvio-help">Connect to a Nuvio profile</small></span>
								<span className="welcome-import-forward" aria-hidden="true" />
							</button>
						) : null}
						{[["file", "Import from file", "Choose a Collection JSON file"], ["json", "Import from JSON", "Paste Collection JSON"]].map(([method, label, help]) => (
							<button
								key={method}
								type="button"
								className="import-action welcome-import-method"
								data-action={`choose-import-${method}`}
								data-selection-mode="single"
								aria-pressed={importMethod === method}
								aria-controls={`builder-import-${method}-panel`}
								disabled={isBusy}
								aria-label={label}
								aria-describedby={`builder-import-${method}-help`}
								onClick={() => chooseImportMethod(method)}
							>
								<span className="creation-option-copy"><strong>{label}</strong><small id={`builder-import-${method}-help`}>{help}</small></span>
							</button>
						))}
					</div>
					<div className="welcome-import-content">
						{importMethod === null ? <div className="welcome-import-prompt">
							<h3>Choose an import method</h3>
							<p>Select an option to continue.</p>
						</div> : null}
						<form id="builder-import-file-panel" className="import-card" hidden={importMethod !== "file"} aria-busy={busyAction === "file"} onSubmit={handleFileImport}>
							<div>
								<h3>Choose a JSON file</h3>
								<p id="file-import-guidance">JSON files up to 10 MB are supported.</p>
							</div>
							<label className="file-input-label" htmlFor="builder-import-file">Collection JSON file</label>
							<input
								id="builder-import-file"
								className="file-input"
								type="file"
								accept=".json,application/json"
								data-import-control="file"
								aria-describedby="file-import-guidance"
								disabled={isBusy}
								onChange={(event) => {
									if (actionGateRef.current.isActive()) return;
									setSelectedFile(event.target.files?.[0] ?? null);
									setLocalDiagnostics([]);
								}}
							/>
							<button
								className="secondary-action"
								type="submit"
								data-action="import-file"
								disabled={isBusy}
							>
								{busyAction === "file" ? "Importing…" : "Import selected file"}
							</button>
						</form>

						<form id="builder-import-json-panel" className="import-card" hidden={importMethod !== "json"} aria-busy={busyAction === "pasted"} onSubmit={handlePastedImport}>
							<div>
								<h3>Paste JSON text</h3>
								<p id="pasted-import-guidance">Paste one Nuvio collection JSON document.</p>
							</div>
							<label htmlFor="builder-import-text">Collection JSON</label>
							<textarea
								id="builder-import-text"
								value={pastedText}
								data-import-control="pasted-json"
								aria-describedby="pasted-import-guidance"
								disabled={isBusy}
								onChange={(event) => {
									if (actionGateRef.current.isActive()) return;
									setPastedText(event.target.value);
									setLocalDiagnostics([]);
								}}
							/>
							<button
								className="secondary-action"
								type="submit"
								data-action="import-pasted-json"
								disabled={isBusy}
							>
								{busyAction === "pasted" ? "Importing…" : "Import pasted JSON"}
							</button>
						</form>
					</div>
				</div>
			</section>


			<footer className="welcome-footer">
				<p className="privacy-note">Your collection JSON is processed locally in this browser and is not uploaded.</p>
				<button
					ref={aboutCreditsTriggerRef}
					className="root-link welcome-about-trigger"
					type="button"
					data-action="open-about-credits"
					aria-label="About & Credits"
					aria-haspopup="dialog"
					disabled={isBusy}
					onClick={() => setAboutCreditsOpen(true)}
				>
					About
				</button>
			</footer>
		</main>
		{aboutCreditsOpen ? <AboutCreditsDialog onClose={closeAboutCredits} /> : null}
		</>
	);
}
