import { useRef } from "react";
import { DISCOVER_FIELD_LABELS } from "../source-add/advanced-discover.js";

export function DiscoverFieldError({ field, errors = [] }) {
 const messages = [...new Set(errors.filter((e) => e.path?.endsWith("." + field)).map((e) => e.message))];
 return messages.length ? <p id={"discover-error-" + field} className="discover-field-error" role="alert">{messages.join(" ")}</p> : null;
}

export function DiscoverValueField({ field, draft, onChange, errors = [] }) {
 const labelRef = useRef(null);
 const date = field.startsWith("release"), value = draft.filters[field] ?? "";
 const clearable = date || field === "year";
 const invalid = errors.some((e) => e.path?.endsWith("." + field));
 const describedBy = [field === "voteCountGte" && "discover-help-voteCountGte", invalid && "discover-error-" + field].filter(Boolean).join(" ") || undefined;
 const update = (value) => onChange({ ...draft, filters: { ...draft.filters, [field]: value } });
 return <div className="editor-field">
  <label ref={labelRef} tabIndex={-1} htmlFor={"discover-field-" + field}>{DISCOVER_FIELD_LABELS[field]}</label>
  <div className={clearable ? "discover-clearable-value" : undefined}>
  <input id={"discover-field-" + field} type={date ? "date" : "text"} inputMode={date ? undefined : field.startsWith("voteAverage") ? "decimal" : "numeric"} value={value}
   disabled={draft.extraEditable?.[field] === false} aria-invalid={invalid || undefined} aria-describedby={describedBy} onChange={(e) => update(e.target.value)} />
   {clearable ? <button type="button" className="discover-clear-value" aria-label={"Clear " + DISCOVER_FIELD_LABELS[field].toLowerCase()} disabled={value === "" || draft.extraEditable?.[field] === false} data-empty={value === "" || undefined}
    onClick={() => { update(""); labelRef.current?.focus({ preventScroll: true }); }}>×</button> : null}
  </div>
  {field === "voteCountGte" ? <p id="discover-help-voteCountGte" className="editor-field-help">Set the minimum number of TMDB votes a title must have. Higher values exclude titles with fewer votes.</p> : null}
  <DiscoverFieldError field={field} errors={errors} />
 </div>;
}
