export function createWelcomeActionGate() {
	let active = false;

	return {
		tryAcquire() {
			if (active) {
				return false;
			}
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

export function yieldToBrowser() {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

export async function runWelcomeAction({
	gate,
	actionName,
	setBusyAction,
	beforeAction,
	action,
	onFailure,
	onSuccess,
	onUnexpectedFailure,
	onEnterWorkspace,
}) {
	if (!gate.tryAcquire()) {
		return { started: false, ok: false };
	}

	setBusyAction(actionName);
	let shouldEnterWorkspace = false;

	try {
		if (beforeAction) {
			await beforeAction();
		}

		const result = await action();
		if (!result?.ok) {
			onFailure?.(result);
			return { started: true, ok: false, result };
		}

		onSuccess?.(result);
		shouldEnterWorkspace = true;
		return { started: true, ok: true, result };
	} catch {
		onUnexpectedFailure?.();
		return { started: true, ok: false };
	} finally {
		gate.release();
		setBusyAction(null);
		if (shouldEnterWorkspace) {
			onEnterWorkspace();
		}
	}
}
