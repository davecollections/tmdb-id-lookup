const focusableSelector = [
	"button:not([disabled])",
	"input:not([disabled])",
	"select:not([disabled])",
	"textarea:not([disabled])",
	"a[href]",
	"[tabindex]:not([tabindex='-1'])",
].join(",");

export function focusFirstDialogControl(dialog) {
	const firstControl = dialog?.querySelector?.(focusableSelector) ?? null;
	(firstControl ?? dialog)?.focus?.();
	return firstControl;
}

export function handleDialogKeyDown(event, dialog, onCancel) {
	if (event.key === "Escape") {
		event.preventDefault();
		onCancel();
		return "cancel";
	}

	if (event.key !== "Tab") {
		return "ignored";
	}

	const controls = [...(dialog?.querySelectorAll?.(focusableSelector) ?? [])];
	if (controls.length === 0) {
		event.preventDefault();
		dialog?.focus?.();
		return "contained";
	}

	const first = controls[0];
	const last = controls.at(-1);
	if (event.shiftKey && event.target === first) {
		event.preventDefault();
		last.focus();
		return "wrapped-backward";
	}
	if (!event.shiftKey && event.target === last) {
		event.preventDefault();
		first.focus();
		return "wrapped-forward";
	}
	return "contained";
}
