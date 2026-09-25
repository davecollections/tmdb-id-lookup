import { reversibleTitleFieldProps } from "../nuvio/titles.js";

// Translate only an existing name diagnostic; the family still owns validation timing.
export function requiredNameMessage(errors, path, value, kind = "collection") {
	if (!errors?.some((entry) => entry.path === path)) return null;
	if (typeof value === "string" && value.trim() && value !== value.trim()) {
		return "Remove spaces at the start or end of the name.";
	}
	return `Enter a ${kind} name.`;
}

export function RequiredNameInput({ id, value, hidden = false, error, describedBy, onChange }) {
	const message = hidden ? null : error;
	const errorId = `${id}-error`;
	return <>
		<input id={id} type="text" {...reversibleTitleFieldProps(value, hidden)}
			aria-invalid={message ? "true" : undefined}
			aria-describedby={[describedBy, errorId].filter(Boolean).join(" ")}
			onChange={onChange} />
		<p className="editor-field-error" id={errorId} role="alert" aria-atomic="true">{message ?? ""}</p>
	</>;
}
