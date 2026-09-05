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

export function initializeTitleInput(input, {
	targetId,
	initializedTargetId = null,
	selectText = false,
} = {}) {
	if (!targetId || targetId === initializedTargetId) {
		return {
			initializedTargetId,
			initialized: false,
			focused: false,
			selected: false,
		};
	}

	let focused = false;
	let selected = false;
	if (input && !input.disabled) {
		if (typeof input.focus === "function") {
			try {
				input.focus();
				focused = true;
			} catch {
				// A missing or unavailable focus API must not prevent the modal opening.
			}
		}
		if (selectText && typeof input.select === "function") {
			try {
				input.select();
				selected = true;
			} catch {
				// Selection is progressive enhancement for supported input implementations.
			}
		}
	}

	return {
		initializedTargetId: targetId,
		initialized: true,
		focused,
		selected,
	};
}

export function handleDialogKeyDown(event, dialog, onCancel, { includeControl = () => true } = {}) {
	if (event.key === "Escape") {
		event.preventDefault();
		onCancel();
		return "cancel";
	}

	if (event.key !== "Tab") {
		return "ignored";
	}

	const controls = [...(dialog?.querySelectorAll?.(focusableSelector) ?? [])].filter(includeControl);
	if (controls.length === 0) {
		event.preventDefault();
		dialog?.focus?.();
		return "contained";
	}

	const first = controls[0];
	const last = controls.at(-1);
	if (event.target === dialog) {
		event.preventDefault();
		const target = event.shiftKey ? last : first;
		target.focus();
		return event.shiftKey
			? "wrapped-from-dialog-backward"
			: "wrapped-from-dialog-forward";
	}
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
