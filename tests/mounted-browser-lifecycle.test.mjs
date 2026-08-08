import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { EventEmitter } from "node:events";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
	BrowserShutdownError,
	DEFAULT_REMOVE_RETRY_DELAYS_MS,
	MountedCleanupAfterSuccessError,
	MountedLifecycleError,
	ShutdownDeadlineError,
	TRANSIENT_REMOVE_CODES,
	abortableDelay,
	cleanupMountedBrowser,
	connectDevTools,
	createBrowserProcessTree,
	removeDirectoryWithRetry,
	runWithLifecycleCleanup,
	shutdownBrowser,
	waitForChildExit,
	waitForDevToolsEndpoint,
	withDeadline,
} from "./helpers/mounted-browser-lifecycle.mjs";

const execFile = promisify(execFileCallback);

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
		remainingPids: async () => child.exitCode === null ? [...ownedPids] : [],
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

test("DevToolsActivePort readiness tolerates absent and partial writes before returning Chrome's endpoint", async () => {
	const child = fakeChild(321);
	const reads = [
		missingError(),
		"45123\n",
		"45123\n/devtools/browser/test-browser\n",
	];
	let elapsedMs = 0;
	const endpoint = await waitForDevToolsEndpoint({
		profileDir: "test-profile",
		browserProcess: child,
		timeoutMs: 100,
		pollIntervalMs: 10,
		fsApi: {
			readFile: async () => {
				const value = reads.shift();
				if (value instanceof Error) throw value;
				return value;
			},
		},
		delay: async (delayMs) => { elapsedMs += delayMs; },
		now: () => elapsedMs,
	});

	assert.deepEqual(endpoint, {
		port: 45123,
		browserPath: "/devtools/browser/test-browser",
		browserWebSocketUrl: "ws://127.0.0.1:45123/devtools/browser/test-browser",
	});
	assert.equal(elapsedMs, 20);
});

test("DevTools readiness reports Chrome exit state instead of an opaque fetch error", async () => {
	const child = fakeChild(654);
	child.exitCode = 23;
	await assert.rejects(waitForDevToolsEndpoint({
		profileDir: "test-profile",
		browserProcess: child,
	}), /Chrome exited before publishing.*rootPid=654, exitCode=23, signalCode=none/u);
});

test("DevTools readiness timeout retains its lifecycle diagnostic", async () => {
	const child = fakeChild(987);
	let elapsedMs = 0;
	await assert.rejects(waitForDevToolsEndpoint({
		profileDir: "test-profile",
		browserProcess: child,
		timeoutMs: 40,
		pollIntervalMs: 10,
		fsApi: { readFile: async () => { throw missingError(); } },
		delay: async (delayMs) => { elapsedMs += delayMs; },
		now: () => elapsedMs,
	}), /within 40 ms.*rootPid=987.*DevToolsActivePort has not been created/u);
	assert.equal(elapsedMs, 40);
});

test("a DevTools WebSocket that never opens is closed at its bounded connection timeout", async () => {
	let socket;
	class NeverOpeningSocket extends EventTarget {
		constructor() {
			super();
			this.readyState = 0;
			this.wasClosed = false;
			socket = this;
		}
		close() {
			this.readyState = 3;
			this.wasClosed = true;
		}
	}

	await assert.rejects(connectDevTools("ws://127.0.0.1:1/devtools/browser/test", {
		WebSocketImpl: NeverOpeningSocket,
		timeoutMs: 25,
		setTimeoutFn: (callback) => {
			queueMicrotask(callback);
			return 1;
		},
		clearTimeoutFn: () => {},
	}), /did not open within 25 ms/u);
	assert.equal(socket.wasClosed, true);
});

test("a DevTools command that never answers rejects within its own bound", async () => {
	class SilentSocket extends EventTarget {
		constructor() {
			super();
			this.readyState = 0;
			queueMicrotask(() => {
				this.readyState = 1;
				this.dispatchEvent(new Event("open"));
			});
		}
		send() {}
		close() {
			this.readyState = 3;
			this.dispatchEvent(new Event("close"));
		}
	}

	const connection = await connectDevTools("ws://127.0.0.1:1/devtools/browser/test", {
		WebSocketImpl: SilentSocket,
		timeoutMs: 100,
		commandTimeoutMs: 5,
	});
	await assert.rejects(
		connection.command("Runtime.evaluate"),
		/command Runtime\.evaluate exceeded 5 ms/u,
	);
	connection.close();
});

test("deadline cancellation reports ShutdownDeadlineError rather than a late AbortError", async () => {
	const child = fakeChild(741);
	await assert.rejects(
		withDeadline((signal) => waitForChildExit(child, signal), 5, { label: "Boundary probe" }),
		(error) => {
			assert.equal(error instanceof ShutdownDeadlineError, true);
			assert.equal(error.code, "MOUNTED_BROWSER_SHUTDOWN_TIMEOUT");
			assert.match(error.message, /Boundary probe exceeded/u);
			return true;
		},
	);
	assert.equal(child.listenerCount("exit"), 0);
	assert.equal(child.listenerCount("error"), 0);
});

test("missing browser connection cleanup emits no unhandled rejection under strict Node handling", async () => {
	const fixture = fileURLToPath(new URL(
		"./fixtures/mounted-browser-missing-connection.mjs",
		import.meta.url,
	));
	const { stdout, stderr } = await execFile(process.execPath, [
		"--unhandled-rejections=strict",
		fixture,
	], { windowsHide: true });
	assert.match(stdout, /MISSING_CONNECTION_CLEANUP_OK/u);
	assert.doesNotMatch(stderr, /AbortError|ABORT_ERR/u);
});

test("POSIX cleanup captures and signals owned descendants when the detached group is unavailable", async () => {
	const processRecords = new Map([
		[101, { parentPid: 1, groupId: 202 }],
		[102, { parentPid: 101, groupId: 202 }],
		[999, { parentPid: 1, groupId: 999 }],
	]);
	const alive = new Set(processRecords.keys());
	const signals = [];
	const missingProcess = () => {
		const error = new Error("Process not found");
		error.code = "ESRCH";
		return error;
	};
	const processKill = (pid, signalName) => {
		if (signalName === 0) {
			if (alive.has(pid)) return;
			throw missingProcess();
		}
		signals.push([pid, signalName]);
		if (pid < 0) throw missingProcess();
		if (!alive.delete(pid)) throw missingProcess();
	};
	const fsApi = {
		async readdir() {
			return [...alive].map((pid) => ({
				isDirectory: () => true,
				name: String(pid),
			}));
		},
		async readFile(target) {
			const pid = Number(target.split("/").at(-2));
			const record = processRecords.get(pid);
			return `${pid} (test-browser) S ${record.parentPid} ${record.groupId} ${record.groupId}`;
		},
	};
	const processTree = createBrowserProcessTree({
		rootPid: 101,
		platform: "linux",
		processKill,
		fsApi,
		delay: async () => {},
	});

	const ownedPids = await processTree.capture();
	assert.deepEqual(ownedPids, [101, 102]);
	await processTree.terminate(ownedPids, new AbortController().signal);

	assert.deepEqual(signals, [
		[-101, "SIGTERM"],
		[101, "SIGTERM"],
		[102, "SIGTERM"],
	]);
	assert.equal(signals.some(([pid]) => Math.abs(pid) === 999), false);
	assert.deepEqual(await processTree.remainingPids(ownedPids), []);
});

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

test("graceful shutdown waits for both root and descendant completion in either exit order", async (t) => {
	for (const order of ["root-first", "descendant-first"]) {
		await t.test(order, async () => {
			const child = fakeChild(101);
			const socketClosed = deferred();
			const treeExited = deferred();
			let treeComplete = false;
			let settled = false;
			const connection = {
				closed: socketClosed.promise,
				isClosed: () => false,
				command: async () => {},
			};
			const processTree = {
				capture: async () => [101, 102],
				remainingPids: async () => [
					...(child.exitCode === null ? [101] : []),
					...(!treeComplete ? [102] : []),
				],
				terminate: async () => { throw new Error("Fallback should not run."); },
				waitForExit: () => treeExited.promise,
			};

			const shuttingDown = shutdownBrowser({
				browserProcess: child,
				browserConnection: connection,
				processTree,
			}).then(() => { settled = true; });
			socketClosed.resolve();
			await new Promise((resolve) => setImmediate(resolve));

			if (order === "root-first") {
				child.finish();
			} else {
				treeComplete = true;
				treeExited.resolve();
			}
			await new Promise((resolve) => setImmediate(resolve));
			assert.equal(settled, false);

			if (order === "root-first") {
				treeComplete = true;
				treeExited.resolve();
			} else {
				child.finish();
			}
			await shuttingDown;
			assert.equal(settled, true);
		});
	}
});

test("an already-exited browser with no remaining owned process needs no DevTools connection", async () => {
	const child = fakeChild(101);
	child.exitCode = 0;
	const result = await shutdownBrowser({
		browserProcess: child,
		browserConnection: null,
		processTree: {
			capture: async () => [],
			remainingPids: async () => [],
			terminate: async () => { throw new Error("Fallback should not run."); },
			waitForExit: async () => {},
		},
	});
	assert.equal(result.graceful, "succeeded");
	assert.equal(result.fallback, "not-used");
});

test("an already-closed DevTools connection allows natural browser and descendant exit", async () => {
	const child = fakeChild(101);
	const treeExited = deferred();
	let commandCalls = 0;
	let treeComplete = false;
	const shuttingDown = shutdownBrowser({
		browserProcess: child,
		browserConnection: {
			closed: Promise.resolve(),
			isClosed: () => true,
			command: () => { commandCalls += 1; },
		},
		processTree: {
			capture: async () => [101, 102],
			remainingPids: async () => [
				...(child.exitCode === null ? [101] : []),
				...(!treeComplete ? [102] : []),
			],
			terminate: async () => { throw new Error("Fallback should not run."); },
			waitForExit: () => treeExited.promise,
		},
	});
	queueMicrotask(() => {
		child.finish();
		treeComplete = true;
		treeExited.resolve();
	});
	const result = await shuttingDown;
	assert.equal(result.graceful, "succeeded");
	assert.equal(result.fallback, "not-used");
	assert.equal(commandCalls, 0);
});

test("a synchronous Browser.close failure is observed before bounded fallback", async () => {
	const child = fakeChild(101);
	const closed = deferred();
	const treeExited = deferred();
	const result = await shutdownBrowser({
		browserProcess: child,
		browserConnection: {
			closed: closed.promise,
			isClosed: () => false,
			command: () => { throw new Error("Browser.close failed synchronously"); },
		},
		processTree: {
			capture: async () => [101],
			remainingPids: async () => child.exitCode === null ? [101] : [],
			terminate: async () => {
				child.finish();
				treeExited.resolve();
			},
			waitForExit: () => treeExited.promise,
		},
	});
	assert.equal(result.graceful, "failed");
	assert.match(result.gracefulError.message, /failed synchronously/u);
	assert.equal(result.fallback, "succeeded");
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
		remainingPids: async () => child.exitCode === null ? [101, 102] : [],
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

test("concurrent and repeated cleanup calls share one idempotent ownership transition", async () => {
	const events = [];
	const resources = {
		pageConnection: { close: () => events.push("page-close") },
		profileDir: "profile",
		vite: { close: async () => { events.push("vite-close"); } },
		viteCacheDir: "cache",
	};
	const options = {
		removeDirectoryFn: async (target) => {
			events.push(`remove:${target}`);
			return { attempts: 1, retries: 0, totalDelayMs: 0 };
		},
	};

	const first = cleanupMountedBrowser(resources, options);
	const concurrent = cleanupMountedBrowser(resources, options);
	assert.equal(concurrent, first);
	const report = await first;
	const repeated = cleanupMountedBrowser(resources, options);
	assert.equal(repeated, first);
	assert.equal(await repeated, report);
	assert.deepEqual(events, [
		"page-close",
		"vite-close",
		"remove:profile",
		"remove:cache",
	]);
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
