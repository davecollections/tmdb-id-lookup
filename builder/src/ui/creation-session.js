// UI-only opening context; project data and revision remain controller-owned.
export function createCollectionCreationSession(state, { returnToWelcomeOnCancel = false } = {}) {
	return {
		scope: "new-collection",
		openingProject: state.project,
		projectRevision: state.revision,
		currentYear: new Date().getFullYear(),
		destinationCollectionInternalId: null,
		destinationCollectionTitle: null,
		returnToWelcomeOnCancel,
	};
}

export function isUntouchedWelcomeCreation(session, state) {
	return session?.returnToWelcomeOnCancel === true
		&& session.openingProject === state.project
		&& session.projectRevision === state.revision
		&& state.dirty === false;
}
