import { useId, useRef, useState } from "react";
import { focusElementWithoutScroll } from "./hierarchy-menu-placement.js";

// Only the optional presentation rows live here; identity/generation stays with
// each family. The parent modal remains the sole scroll owner.
export function SourceNamesDisclosure({ naming, context = (row) => row.generatedTitle, plural = false, baseName = false, disabled = false }) {
	const id = useId();
	const [open, setOpen] = useState(false);
	const fields = useRef(new Map());
	const summary = useRef(null);
	if (!naming.rows.length) return null;
	const label = plural || naming.rows.length > 1 ? "Source names" : "Source name";
	const errors = naming.rows.filter((row) => row.error).length;
	return <details className="source-names-disclosure" open={open} onToggle={(event) => {
		const expanded = event.currentTarget.open;
		setOpen(expanded);
		if (!expanded) naming.commit();
	}}>
		<summary ref={summary}><span><strong>{label}</strong><small>{errors ? `${errors} ${errors === 1 ? "name needs" : "names need"} attention.` : naming.customisedCount ? `${naming.customisedCount} customised.` : "Generated automatically."}</small></span></summary>
		{open ? <div className="source-names-content">
			<p className="editor-field-help">{baseName ? "Used to build the names of the Sources created by this Discover setup." : "Optional names shown in Nuvio. The Sources themselves stay the same."}</p>
			{naming.rows.filter((row) => row.resettable).length > 1 ? <button type="button" className="source-name-reset" disabled={disabled} onClick={() => { naming.resetAll(); focusElementWithoutScroll(summary.current); }}>Reset all</button> : null}
			{naming.rows.map((row, index) => {
				const fieldId = `${id}-${index}`;
				return <div className="editor-field source-name-field" key={row.key}>
					<label htmlFor={fieldId}>{baseName ? "Base name" : context(row)}</label>
					<input id={fieldId} ref={(node) => { if (node) fields.current.set(row.key, node); else fields.current.delete(row.key); }} type="text" data-source-name="true" value={row.value} disabled={disabled}
						aria-invalid={row.error ? "true" : undefined} aria-describedby={row.error ? `${fieldId}-error` : undefined}
						onChange={(event) => naming.change(row.key, event.target.value)} onBlur={() => naming.commit(row.key)} />
					{row.error ? <p id={`${fieldId}-error`} className="editor-field-error" role="alert">{row.error}</p> : null}
					{row.resettable ? <button type="button" className="source-name-reset" disabled={disabled} onClick={() => { naming.reset(row.key); focusElementWithoutScroll(fields.current.get(row.key)); }}>Reset name</button> : null}
				</div>;
			})}
		</div> : null}
	</details>;
}
