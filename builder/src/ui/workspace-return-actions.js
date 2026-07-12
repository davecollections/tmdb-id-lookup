export function workspaceNeedsDiscardConfirmation(state) {
	return state?.dirty === true;
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
