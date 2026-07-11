import { useState } from "react";
import builderMark from "../assets/builder-mark.svg";
import {
	importJsonFile,
	importPastedJson,
	startNewBuilderProject,
} from "./import-actions.js";

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

export function BuilderWelcome({ controller, state, onEnterWorkspace }) {
	const [selectedFile, setSelectedFile] = useState(null);
	const [pastedText, setPastedText] = useState("");
	const [localDiagnostics, setLocalDiagnostics] = useState([]);
	const [busyAction, setBusyAction] = useState(null);

	const controllerErrors = [
		...state.diagnostics.operation.errors,
		...state.diagnostics.import.errors,
	];
	const visibleErrors = localDiagnostics.length > 0 ? localDiagnostics : controllerErrors;
	const visibleWarnings = localDiagnostics.length > 0 ? [] : state.diagnostics.import.warnings;

	function completeAction(result, clearLocal = true) {
		if (result.ok) {
			if (clearLocal) setLocalDiagnostics([]);
			onEnterWorkspace();
			return true;
		}
		setLocalDiagnostics(result.errors[0]?.path === "$ui.import" ? result.errors : []);
		return false;
	}

	function handleStartNewProject() {
		completeAction(startNewBuilderProject(controller));
	}

	async function handleFileImport(event) {
		event.preventDefault();
		setBusyAction("file");
		const result = await importJsonFile(controller, selectedFile);
		if (completeAction(result)) {
			setSelectedFile(null);
		}
		setBusyAction(null);
	}

	async function handlePastedImport(event) {
		event.preventDefault();
		setBusyAction("pasted");
		const result = await Promise.resolve(importPastedJson(controller, pastedText));
		if (completeAction(result)) {
			setPastedText("");
		}
		setBusyAction(null);
	}

	return (
		<main className="builder-welcome" data-builder-welcome="true">
			<header className="welcome-brand">
				<img className="welcome-mark" src={builderMark} alt="" width="68" height="68" />
				<div>
					<p className="preview-label">Development preview</p>
					<h1>TMDB Collection Builder</h1>
					<p className="brand-subtitle">Built for Nuvio collections</p>
				</div>
				<p className="welcome-description">
					Create, import and organise collection files using TMDB-powered sources and Nuvio-compatible structures.
				</p>
			</header>

			<section className="welcome-start" aria-labelledby="start-project-title">
				<div>
					<p className="panel-kicker">Create</p>
					<h2 id="start-project-title">Begin with a clean project</h2>
					<p>Open the hierarchy workspace with an empty, clean draft.</p>
				</div>
				<button
					className="welcome-primary-action"
					type="button"
					data-action="start-new-project"
					onClick={handleStartNewProject}
				>
					Start a new project
				</button>
			</section>

			<div className="welcome-diagnostic-stack">
				<DiagnosticList diagnostics={visibleErrors} kind="error" />
				<DiagnosticList diagnostics={visibleWarnings} kind="warning" />
			</div>

			<section className="welcome-import" aria-labelledby="import-title">
				<div className="welcome-section-heading">
					<p className="panel-kicker">Import</p>
					<h2 id="import-title">Open an existing collection JSON</h2>
					<p>Choose a local file or paste its JSON text. Import begins only when you confirm an action.</p>
				</div>

				<div className="import-grid">
					<form className="import-card" aria-busy={busyAction === "file"} onSubmit={handleFileImport}>
						<div>
							<h3>Choose a JSON file</h3>
							<p id="file-import-guidance">JSON files up to 10 MiB are supported.</p>
						</div>
						<label className="file-input-label" htmlFor="builder-import-file">Collection JSON file</label>
						<input
							id="builder-import-file"
							className="file-input"
							type="file"
							accept=".json,application/json"
							data-import-control="file"
							aria-describedby="file-import-guidance selected-file-name"
							onChange={(event) => {
								setSelectedFile(event.target.files?.[0] ?? null);
								setLocalDiagnostics([]);
							}}
						/>
						<p id="selected-file-name" className="selected-file" aria-live="polite">
							<span>Selected file</span>
							<strong>{selectedFile?.name ?? "No file selected"}</strong>
						</p>
						<button
							className="import-action"
							type="submit"
							data-action="import-file"
							disabled={busyAction === "file"}
						>
							{busyAction === "file" ? "Importing…" : "Import selected file"}
						</button>
					</form>

					<form className="import-card" aria-busy={busyAction === "pasted"} onSubmit={handlePastedImport}>
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
							onChange={(event) => {
								setPastedText(event.target.value);
								setLocalDiagnostics([]);
							}}
						/>
						<button
							className="import-action"
							type="submit"
							data-action="import-pasted-json"
							disabled={busyAction === "pasted"}
						>
							{busyAction === "pasted" ? "Importing…" : "Import pasted JSON"}
						</button>
					</form>
				</div>
			</section>

			<footer className="welcome-footer">
				<p className="privacy-note">Your collection JSON is processed locally in this browser and is not uploaded.</p>
				<a className="root-link" data-root-link="true" href="../">
					<span aria-hidden="true">←</span>
					Back to TMDB ID Lookup
				</a>
			</footer>
		</main>
	);
}
