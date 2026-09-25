import { focusElementWithoutScroll } from "./hierarchy-menu-placement.js";
import { reversibleTitleFieldProps } from "../nuvio/titles.js";

// Translate domain diagnostics without changing family-specific title rules.
export function requiredNameMessage(errors, path, value, kind = "collection") {
	if (!errors?.some((entry) => entry.path === path)) return null;
	if (typeof value === "string" && value.trim() && value !== value.trim()) {
		return "Remove spaces at the start or end of the name.";
	}
	return `Enter a ${kind} name.`;
}

export function RequiredNameInput({ id, value, hidden = false, error, describedBy, inputRef, onChange }) {
	const message = hidden ? null : error;
	const errorId = `${id}-error`;
	return <>
		<input ref={inputRef} id={id} type="text" data-required-name="true" {...reversibleTitleFieldProps(value, hidden)}
			aria-invalid={message ? "true" : undefined}
			aria-describedby={[describedBy, errorId].filter(Boolean).join(" ")}
			onChange={onChange} />
		<p className="editor-field-error" id={errorId} role="alert" aria-atomic="true">{message ?? ""}</p>
	</>;
}

// Only ordinary name errors leave the action available for a correction attempt.
// Structural, busy and zero-output gates remain the responsibility of each flow.
export function onlyRequiredNameErrors(result, paths) {
	return result?.ok === false && result.errors?.length > 0
		&& result.errors.every((entry) => paths.includes(entry.path));
}

export function focusRequiredName(field) {
	if (!field) return false;
	for (let ancestor = field.parentElement; ancestor; ancestor = ancestor.parentElement) {
		if (ancestor.tagName === "DETAILS") ancestor.open = true;
	}
	focusElementWithoutScroll(field);
	field.scrollIntoView?.({ block: "nearest", inline: "nearest", behavior: "instant" });
	return true;
}

export function handleRequiredNameSubmit(event) {
	const field = event.currentTarget.querySelector('[data-required-name][aria-invalid="true"]:not([disabled])');
	if (!field) return;
	event.preventDefault();
	event.stopPropagation();
	focusRequiredName(field);
}
