export function workspaceNeedsDiscardConfirmation(state) {
	return state?.dirty === true;
}

export function createWorkspaceReturnGate() {
	let active = false;

	return {
		tryAcquire() {
			if (active) return false;
			active = true;
			return true;
		},
		release() {
			active = false;
		},
		isActive() {
			return active;
		},
	};
}

export function requestWorkspaceReturn({ state, onConfirm, onComplete }) {
	if (workspaceNeedsDiscardConfirmation(state)) {
		onConfirm();
		return { action: "confirm" };
	}

	onComplete();
	return { action: "complete" };
}

export function resetBuilderWorkspace(controller) {
	try {
		return controller.startNewProject({ title: "Untitled project", discardChanges: true });
	} catch {
		return {
			ok: false,
			errors: [{
				code: "CONTROLLER_OPERATION_FAILED",
				path: "$controller",
				message: "The workspace could not be reset.",
			}],
			warnings: [],
		};
	}
}

export function completeWorkspaceReturn({ controller, gate, onSuccess }) {
	if (!gate.tryAcquire()) {
		return { ok: false, started: false, ignored: true, errors: [], warnings: [] };
	}

	const result = resetBuilderWorkspace(controller);
	if (!result?.ok) {
		gate.release();
		return { ...result, ok: false, started: true, ignored: false };
	}

	try {
		onSuccess();
	} catch {
		gate.release();
		return {
			ok: false,
			started: true,
			ignored: false,
			errors: [{
				code: "CONTROLLER_OPERATION_FAILED",
				path: "$ui.workspaceReturn",
				message: "The workspace could not return to builder home.",
			}],
			warnings: [],
		};
	}

	return { ...result, ok: true, started: true, ignored: false };
}
