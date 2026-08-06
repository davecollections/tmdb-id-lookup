import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import {
	BrowserShutdownError,
	DEFAULT_REMOVE_RETRY_DELAYS_MS,
	MountedCleanupAfterSuccessError,
	MountedLifecycleError,
	ShutdownDeadlineError,
	TRANSIENT_REMOVE_CODES,
	abortableDelay,
	cleanupMountedBrowser,
	removeDirectoryWithRetry,
	runWithLifecycleCleanup,
	shutdownBrowser,
} from "./helpers/mounted-browser-lifecycle.mjs";

function deferred() {
	let resolve;
	let reject;
	const promise = new Promise((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return { promise, reject, resolve };
}

function fakeChild(pid = 101) {
	const child = new EventEmitter();
	child.pid = pid;
	child.exitCode = null;
	child.signalCode = null;
	child.finish = () => {
		child.exitCode = 0;
		child.emit("exit", 0, null);
	};
	return child;
}

function fakeShutdown({ events = [], ownedPids = [101, 102], autoFinish = true } = {}) {
	const child = fakeChild(ownedPids[0]);
	const socketClosed = deferred();
	const treeExited = deferred();
	let connectionClosed = false;
	const connection = {
		closed: socketClosed.promise,
		isClosed: () => connectionClosed,
		close() {
			connectionClosed = true;
			socketClosed.resolve();
		},
		command(method) {
			events.push(method);
			if (autoFinish) {
				queueMicrotask(() => {
					connectionClosed = true;
					socketClosed.resolve();
					child.finish();
					treeExited.resolve();
				});
			}
			return Promise.resolve({});
		},
	};
	const processTree = {
		capture: async () => [...ownedPids],
		remainingPids: async () => [],
		terminate: async () => { throw new Error("Fallback should not run."); },
		waitForExit: () => treeExited.promise,
	};
	return { child, connection, processTree, socketClosed, treeExited };
}

function trackedTimers() {
	let nextId = 0;
	const active = new Set();
	const delays = [];
	return {
		active,
		delays,
		clearTimeoutFn(id) { active.delete(id); },
		setTimeoutFn(callback, delayMs) {
			const id = ++nextId;
			active.add(id);
			delays.push(delayMs);
			return id;
		},
	};
}

test("Browser.close and whole-tree completion precede Vite, profile, and cache cleanup", async () => {
	const events = [];
	const browser = fakeShutdown({ events });
	const timers = trackedTimers();
	const report = await cleanupMountedBrowser({
		browserExecutable: "test-chrome",
		browserProcess: browser.child,
		browserConnection: browser.connection,
		pageConnection: { close: () => events.push("page-socket-close") },
		processTree: browser.processTree,
		profileDir: "profile-dir",
		vite: { close: async () => { events.push("vite-close"); } },
		viteCacheDir: "vite-cache-dir",
	}, {
		removeDirectoryFn: async (target) => {
			events.push(`remove:${target}`);
			return { attempts: 1, retries: 0, totalDelayMs: 0 };
		},
		shutdownOptions: { deadlineOptions: timers },
	});

	assert.deepEqual(events, [
		"Browser.close",
		"page-socket-close",
		"vite-close",
		"remove:profile-dir",
		"remove:vite-cache-dir",
	]);
	assert.equal(report.browser.graceful, "succeeded");
	assert.equal(report.browser.fallback, "not-used");
	assert.equal(timers.active.size, 0);
	assert.equal(browser.child.listenerCount("exit"), 0);
	assert.equal(browser.child.listenerCount("error"), 0);
});

test("normal shutdown clears its deadline immediately and leaves no two-second timer", async () => {
	const browser = fakeShutdown();
	const timers = trackedTimers();
	await shutdownBrowser({
		browserProcess: browser.child,
		browserConnection: browser.connection,
		processTree: browser.processTree,
		deadlineOptions: timers,
	});
	assert.equal(timers.active.size, 0);
	assert.deepEqual(timers.delays, [5000]);
	assert.equal(timers.delays.includes(2000), false);
});

test("graceful shutdown waits for browser WebSocket closure", async () => {
	const events = [];
	const browser = fakeShutdown({ events, autoFinish: false });
	let settled = false;
	const shuttingDown = shutdownBrowser({
		browserProcess: browser.child,
		browserConnection: browser.connection,
		processTree: {
			...browser.processTree,
			waitForExit: async () => {},
		},
		gracefulTimeoutMs: 1000,
	}).then(() => { settled = true; });
	await new Promise((resolve) => setImmediate(resolve));
	assert.equal(settled, false);
	browser.child.finish();
	browser.socketClosed.resolve();
	await shuttingDown;
	assert.deepEqual(events, ["Browser.close"]);
});

function timeoutThenRun() {
	let invocation = 0;
	return async (task, timeoutMs) => {
		invocation += 1;
		if (invocation === 1) {
			const controller = new AbortController();
			const work = task(controller.signal);
			await Promise.resolve();
			controller.abort();
			await work.catch(() => {});
			throw new ShutdownDeadlineError("Graceful mounted browser shutdown", timeoutMs);
		}
		return task(new AbortController().signal);
	};
}

test("graceful timeout invokes bounded fallback for only captured test-owned PIDs", async () => {
	const child = fakeChild(101);
	const closed = deferred();
	const treeExited = deferred();
	const terminationTargets = [];
	const connection = {
		closed: closed.promise,
		isClosed: () => false,
		command: () => new Promise(() => {}),
	};
	const processTree = {
		capture: async () => [101, 102],
		remainingPids: async () => [],
		terminate: async (pids) => {
			terminationTargets.push(...pids);
			child.finish();
			closed.resolve();
			treeExited.resolve();
		},
		waitForExit: () => treeExited.promise,
	};
	const result = await shutdownBrowser({
		browserProcess: child,
		browserConnection: connection,
		processTree,
		deadline: timeoutThenRun(),
	});
	assert.equal(result.graceful, "failed");
	assert.equal(result.fallback, "succeeded");
	assert.deepEqual(terminationTargets, [101, 102]);
	assert.equal(terminationTargets.includes(999), false);
});

test("failed process-tree fallback remains fatal with both shutdown errors", async () => {
	const child = fakeChild(101);
	const closed = deferred();
	const processTree = {
		capture: async () => [101, 102],
		remainingPids: async () => [101, 102],
		terminate: async () => { throw new Error("task-tree termination failed"); },
		waitForExit: () => new Promise(() => {}),
	};
	await assert.rejects(
		shutdownBrowser({
			browserProcess: child,
			browserConnection: {
				closed: closed.promise,
				isClosed: () => false,
				command: () => new Promise(() => {}),
			},
			processTree,
			deadline: timeoutThenRun(),
		}),
		(error) => {
			assert.equal(error instanceof BrowserShutdownError, true);
			assert.match(error.gracefulError.message, /deadline/u);
			assert.match(error.fallbackError.message, /termination failed/u);
			assert.deepEqual(error.diagnostics.remainingPids, [101, 102]);
			return true;
		},
	);
});

function missingError() {
	const error = new Error("missing");
	error.code = "ENOENT";
	return error;
}

test("filesystem retry accepts each approved transient code after an immediate first attempt", async () => {
	for (const code of TRANSIENT_REMOVE_CODES) {
		const events = [];
		let attempts = 0;
		const fsApi = {
			access: async () => { throw missingError(); },
			rm: async () => {
				events.push("rm");
				attempts += 1;
				if (attempts === 1) {
					const error = new Error(code);
					error.code = code;
					throw error;
				}
			},
		};
		const result = await removeDirectoryWithRetry("target", {
			fsApi,
			delay: async (delayMs) => { events.push(`delay:${delayMs}`); },
		});
		assert.deepEqual(events, ["rm", "delay:25", "rm"]);
		assert.deepEqual(result, { attempts: 2, retries: 1, totalDelayMs: 25 });
	}
});

test("unknown filesystem errors fail immediately without a retry delay", async () => {
	let attempts = 0;
	let delays = 0;
	const error = new Error("disk I/O failure");
	error.code = "EIO";
	await assert.rejects(removeDirectoryWithRetry("target", {
		fsApi: {
			access: async () => { throw missingError(); },
			rm: async () => { attempts += 1; throw error; },
		},
		delay: async () => { delays += 1; },
	}), error);
	assert.equal(attempts, 1);
	assert.equal(delays, 0);
});

test("persistent transient filesystem failures exhaust the fixed 375 ms retry budget", async () => {
	let attempts = 0;
	const delays = [];
	const error = new Error("still busy");
	error.code = "ENOTEMPTY";
	await assert.rejects(removeDirectoryWithRetry("target", {
		fsApi: {
			access: async () => {},
			rm: async () => { attempts += 1; throw error; },
		},
		delay: async (delayMs) => { delays.push(delayMs); },
	}), error);
	assert.equal(attempts, DEFAULT_REMOVE_RETRY_DELAYS_MS.length + 1);
	assert.deepEqual(delays, DEFAULT_REMOVE_RETRY_DELAYS_MS);
	assert.equal(delays.reduce((total, delayMs) => total + delayMs, 0), 375);
});

test("a removal that reports success but leaves the directory present is fatal and bounded", async () => {
	let attempts = 0;
	await assert.rejects(removeDirectoryWithRetry("target", {
		fsApi: {
			access: async () => {},
			rm: async () => { attempts += 1; },
		},
		delay: async () => {},
	}), (error) => error.code === "ENOTEMPTY");
	assert.equal(attempts, DEFAULT_REMOVE_RETRY_DELAYS_MS.length + 1);
});

test("successful lifecycle cleanup confirms both profile and Vite cache absence", async () => {
	const present = new Set(["profile", "cache"]);
	const fsApi = {
		access: async (target) => {
			if (!present.has(target)) throw missingError();
		},
		rm: async (target) => { present.delete(target); },
	};
	const report = await cleanupMountedBrowser({
		profileDir: "profile",
		viteCacheDir: "cache",
	}, { removeOptions: { fsApi } });
	assert.deepEqual([...present], []);
	assert.equal(report.profile.attempts, 1);
	assert.equal(report.viteCache.attempts, 1);
});

test("a primary fixture error remains primary when cleanup also fails", async () => {
	const fixtureError = new Error("fixture assertion failed");
	const cleanupError = new Error("cleanup failed");
	await assert.rejects(
		runWithLifecycleCleanup(
			async () => { throw fixtureError; },
			async () => { throw cleanupError; },
		),
		(error) => {
			assert.equal(error instanceof MountedLifecycleError, true);
			assert.equal(error.message, fixtureError.message);
			assert.equal(error.cause, fixtureError);
			assert.deepEqual(error.errors, [fixtureError, cleanupError]);
			return true;
		},
	);
});

test("cleanup-only failure is fatal while retaining completed browser results", async () => {
	const results = { complete: true };
	const cleanupError = new Error("profile cleanup failed");
	await assert.rejects(
		runWithLifecycleCleanup(
			async () => results,
			async () => { throw cleanupError; },
		),
		(error) => {
			assert.equal(error instanceof MountedCleanupAfterSuccessError, true);
			assert.equal(error.cause, cleanupError);
			assert.equal(error.operationCompleted, true);
			assert.equal(error.operationValue, results);
			return true;
		},
	);
});

test("opening and runtime failures both execute the same awaited cleanup path", async () => {
	for (const message of ["opening failed", "runtime failed"]) {
		let cleanupCalls = 0;
		await assert.rejects(runWithLifecycleCleanup(
			async () => { throw new Error(message); },
			async () => { cleanupCalls += 1; },
		), new RegExp(message, "u"));
		assert.equal(cleanupCalls, 1);
	}
});

test("abortable delays clear their timer and listener when cancelled", async () => {
	const controller = new AbortController();
	const timers = trackedTimers();
	const delayed = abortableDelay(100, controller.signal, timers);
	controller.abort();
	await assert.rejects(delayed, (error) => error.code === "ABORT_ERR");
	assert.equal(timers.active.size, 0);
});
