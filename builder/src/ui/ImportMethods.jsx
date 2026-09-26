// Shared method presentation; each host owns drafts and its apply/review boundary.
export function ImportMethods({ importMethod, onOpenNuvio, nuvioMode = "dialog", nuvioContent, isBusy, isActionActive = () => isBusy, busyAction, chooseImportMethod, handleFileImport, handlePastedImport, onFileChange, pastedText, onTextChange, reviewOnly = false }) {
	const embeddedNuvio = nuvioMode === "embedded";
	return (<div className="welcome-import-layout">
		<div className="welcome-import-methods" role="group" aria-label="Import method">
			{onOpenNuvio || embeddedNuvio ? (
				<button
					type="button"
					className="import-action welcome-import-method"
					data-action="open-nuvio-import"
					aria-haspopup={embeddedNuvio ? undefined : "dialog"}
					disabled={isBusy}
					data-selection-mode={embeddedNuvio ? "single" : undefined}
					aria-pressed={embeddedNuvio ? importMethod === "nuvio" : undefined}
					aria-controls={embeddedNuvio ? "builder-import-nuvio-panel" : undefined}
					aria-labelledby="builder-import-nuvio-title"
					aria-describedby="builder-import-nuvio-help"
					onClick={(event) => chooseImportMethod("nuvio", event)}
				>
					<span className="creation-option-copy"><strong id="builder-import-nuvio-title">Import from Nuvio</strong><small id="builder-import-nuvio-help">Connect to a Nuvio profile</small></span>
					{!embeddedNuvio ? <span className="welcome-import-forward" aria-hidden="true" /> : null}
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
			{embeddedNuvio ? <div id="builder-import-nuvio-panel" hidden={importMethod !== "nuvio"}>{nuvioContent}</div> : null}
			{importMethod === null ? <div className="welcome-import-prompt">
				<h3>Choose an import method</h3>
				<p>Select an option to continue.</p>
			</div> : null}
			<form id="builder-import-file-panel" className="import-card" hidden={importMethod !== "file"} aria-busy={busyAction === "file"} onSubmit={handleFileImport}>
				<div>
					<h3 tabIndex={reviewOnly ? -1 : undefined}>Choose a JSON file</h3>
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
						if (isActionActive()) return;
						onFileChange(event.target.files?.[0] ?? null);
					}}
				/>
				<button
					className="secondary-action"
					type="submit"
					data-action="import-file"
					disabled={isBusy}
				>
					{busyAction === "file" ? (reviewOnly ? "Reading…" : "Importing…") : reviewOnly ? "Review selected file" : "Import selected file"}
				</button>
			</form>

			<form id="builder-import-json-panel" className="import-card" hidden={importMethod !== "json"} aria-busy={busyAction === "pasted"} onSubmit={handlePastedImport}>
				<div>
					<h3 tabIndex={reviewOnly ? -1 : undefined}>Paste JSON text</h3>
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
						if (isActionActive()) return;
						onTextChange(event.target.value);
					}}
				/>
				<button
					className="secondary-action"
					type="submit"
					data-action="import-pasted-json"
					disabled={isBusy}
				>
					{busyAction === "pasted" ? (reviewOnly ? "Reading…" : "Importing…") : reviewOnly ? "Review pasted JSON" : "Import pasted JSON"}
				</button>
			</form>
		</div>
	</div>);
}
