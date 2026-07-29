export const INITIAL_ASYNC_REQUEST_STATE = Object.freeze({
	status: "idle",
	requestId: 0,
	context: null,
	data: null,
	error: null,
});

function freezeState(state) {
	return Object.freeze(state);
}

function genericFailure() {
	return {
		kind: "request",
		message: "The request could not be completed. Try again.",
		retryable: true,
	};
}

/**
 * Coordinates one replaceable async request at a time. A later generation is
 * authoritative even when an earlier task ignores its abort signal.
 */
export function createAsyncRequestCoordinator({
	onStateChange = () => {},
} = {}) {
	if (typeof onStateChange !== "function") {
		throw new TypeError("onStateChange must be a function.");
	}

	let generation = 0;
	let activeController = null;
	let state = INITIAL_ASYNC_REQUEST_STATE;

	function publish(nextState) {
		state = freezeState(nextState);
		onStateChange(state);
		return state;
	}

	function getState() {
		return state;
	}

	function cancel({ reset = true, notify = true } = {}) {
		generation += 1;
		activeController?.abort();
		activeController = null;
		if (reset) {
			const nextState = freezeState({
				...INITIAL_ASYNC_REQUEST_STATE,
				requestId: generation,
			});
			state = nextState;
			if (notify) onStateChange(state);
		}
		return state;
	}

	async function run(task, context = null) {
		if (typeof task !== "function") {
			throw new TypeError("Async request tasks must be functions.");
		}

		const requestId = ++generation;
		activeController?.abort();
		const controller = new AbortController();
		activeController = controller;
		publish({
			status: "loading",
			requestId,
			context,
			data: null,
			error: null,
		});

		let result;
		try {
			result = await task({
				signal: controller.signal,
				requestId,
			});
		} catch {
			result = {
				ok: false,
				error: genericFailure(),
			};
		}

		if (requestId !== generation) {
			return {
				accepted: false,
				requestId,
				result,
				state,
			};
		}

		activeController = null;
		if (result?.ok === true) {
			publish({
				status: "success",
				requestId,
				context,
				data: result.data,
				error: null,
			});
		} else if (result?.error?.kind === "aborted") {
			publish({
				...INITIAL_ASYNC_REQUEST_STATE,
				requestId,
			});
		} else {
			publish({
				status: "error",
				requestId,
				context,
				data: null,
				error: result?.error ?? genericFailure(),
			});
		}

		return {
			accepted: true,
			requestId,
			result,
			state,
		};
	}

	return Object.freeze({
		cancel,
		getState,
		run,
	});
}
