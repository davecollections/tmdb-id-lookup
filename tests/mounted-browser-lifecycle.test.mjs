import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { EventEmitter } from "node:events";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
	BrowserShutdownError,
	DEFAULT_CHROME_STDERR_MAX_BYTES,
	DEFAULT_DEVTOOLS_STARTUP_MS,
	DEFAULT_REMOVE_RETRY_DELAYS_MS,
	MountedCleanupAfterSuccessError,
	MountedLifecycleError,
	ShutdownDeadlineError,
	TRANSIENT_REMOVE_CODES,
	abortableDelay,
	cleanupMountedBrowser,
	connectDevTools,
	createBoundedStderrCapture,
	createMountedBrowserDiagnostics,
	createBrowserProcessTree,
	removeDirectoryWithRetry,
	resolveDevToolsStartupTimeout,
	runWithLifecycleCleanup,
	shutdownBrowser,
	waitForChildExit,
	waitForDevToolsEndpoint,
	withDeadline,
} from "./helpers/mounted-browser-lifecycle.mjs";

import { sanitiseChromeStderr } from "./helpers/mounted-browser-diagnostics.mjs";

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

test("DevTools startup timeout defaults for unset or blank configuration", () => {
	assert.equal(resolveDevToolsStartupTimeout(undefined), DEFAULT_DEVTOOLS_STARTUP_MS);
	assert.equal(resolveDevToolsStartupTimeout(null), DEFAULT_DEVTOOLS_STARTUP_MS);
	assert.equal(resolveDevToolsStartupTimeout(""), DEFAULT_DEVTOOLS_STARTUP_MS);
	assert.equal(resolveDevToolsStartupTimeout(" \t "), DEFAULT_DEVTOOLS_STARTUP_MS);
});

test("DevTools startup timeout accepts validated positive integer overrides", () => {
	assert.equal(resolveDevToolsStartupTimeout("30000"), 30000);
	assert.equal(resolveDevToolsStartupTimeout("2500"), 2500);
	assert.equal(resolveDevToolsStartupTimeout("030000"), 30000);
	assert.equal(resolveDevToolsStartupTimeout(" 30000 "), 30000);
});

test("DevTools startup timeout rejects ambiguous or invalid configuration", () => {
	for (const value of ["0", "-1", "1.5", "NaN", "30000oops", "1e3", "9007199254740992"]) {
		assert.throws(
			() => resolveDevToolsStartupTimeout(value),
			/DEVTOOLS_STARTUP_MS must be a .*positive integer in milliseconds/u,
		);
	}
	assert.throws(
		() => resolveDevToolsStartupTimeout(30000),
		/DEVTOOLS_STARTUP_MS must be a positive integer in milliseconds/u,
	);
});

test("bounded Chrome stderr capture is quiet when no stderr is available", () => {
	const capture = createBoundedStderrCapture(null);
	assert.equal(capture.byteLength(), 0);
	assert.equal(capture.text(), "");
	capture.stop();
});

test("bounded Chrome stderr capture retains small string and Buffer chunks", () => {
	const stream = new EventEmitter();
	const capture = createBoundedStderrCapture(stream);
	stream.emit("data", "first line\n");
	stream.emit("data", Buffer.from("second line\n"));
	assert.equal(capture.text(), "first line\nsecond line\n");
	assert.equal(capture.byteLength(), Buffer.byteLength(capture.text()));
	capture.stop();
});

test("bounded Chrome stderr capture retains only the configured tail across many chunks", () => {
	const stream = new EventEmitter();
	const capture = createBoundedStderrCapture(stream, { maxBytes: 8 });
	for (const chunk of ["abc", Buffer.from("defg"), "hijklmnop", "qrst"]) stream.emit("data", chunk);
	assert.equal(capture.text(), "mnopqrst");
	assert.equal(capture.byteLength(), 8);
	assert.ok(capture.byteLength() <= DEFAULT_CHROME_STDERR_MAX_BYTES);
	capture.stop();
});

test("bounded Chrome stderr capture releases listeners when the stream ends", () => {
	const stream = new EventEmitter();
	let unrefCalls = 0;
	stream.unref = () => { unrefCalls += 1; };
	const capture = createBoundedStderrCapture(stream);
	assert.equal(unrefCalls, 1);
	stream.emit("end");
	for (const event of ["data", "error", "end", "close"]) assert.equal(stream.listenerCount(event), 0);
	capture.stop();
});

test("successful DevTools readiness does not inspect or emit captured stderr", async () => {
	let stderrReads = 0;
	const endpoint = await waitForDevToolsEndpoint({
		profileDir: "test-profile",
		browserProcess: fakeChild(320),
		fsApi: { readFile: async () => "45123\n/devtools/browser/test-browser\n" },
		stderrCapture: {
			error: () => null,
			text: () => {
				stderrReads += 1;
				return "successful startup warning";
			},
		},
	});
	assert.equal(endpoint.port, 45123);
	assert.equal(stderrReads, 0);
});

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

test("DevTools readiness reports Chrome exit state and bounded stderr instead of a timeout", async () => {
	const child = fakeChild(654);
	child.exitCode = 23;
	const stream = new EventEmitter();
	const stderrCapture = createBoundedStderrCapture(stream, { maxBytes: 64 });
	stream.emit("data", "zygote initialization failed");
	await assert.rejects(waitForDevToolsEndpoint({
		profileDir: "test-profile",
		browserProcess: child,
		browserExecutable: "/usr/bin/google-chrome",
		stderrCapture,
	}), (error) => {
		assert.match(error.message, /Chrome exited before publishing.*rootPid=654, exitCode=23, signalCode=none/u);
		assert.match(error.message, /executable="\/usr\/bin\/google-chrome"/u);
		assert.match(error.message, /chromeStderr=.*message-omitted/u);
		assert.doesNotMatch(error.message, /within \d+ ms/u);
		return true;
	});
	stderrCapture.stop();
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

test("DevTools timeout includes a deterministic bounded Chrome profile inventory", async () => {
	const child = fakeChild(988);
	let elapsedMs = 0;
	const entries = Array.from({ length: 55 }, (_, index) => `entry-${String(54 - index).padStart(2, "0")}`);
	await assert.rejects(waitForDevToolsEndpoint({
		profileDir: "test-profile",
		browserProcess: child,
		browserExecutable: "/usr/bin/google-chrome",
		timeoutMs: 20,
		pollIntervalMs: 10,
		fsApi: {
			readFile: async () => { throw missingError(); },
			readdir: async () => entries,
		},
		delay: async (delayMs) => { elapsedMs += delayMs; },
		now: () => elapsedMs,
	}), (error) => {
		assert.match(error.message, /within 20 ms.*rootPid=988.*lastState=DevToolsActivePort has not been created/u);
		assert.match(error.message, /executable="\/usr\/bin\/google-chrome"/u);
		assert.match(error.message, /chromeStderr=\[\]/u);
		assert.match(error.message, /profileEntries=\["entry-00","entry-01"/u);
		assert.match(error.message, /"entry-49"\]; profileEntriesOmitted=5/u);
		assert.doesNotMatch(error.message, /entry-50/u);
		return true;
	});
});

test("DevTools timeout distinguishes an incomplete ActivePort file", async () => {
	const child = fakeChild(989);
	let elapsedMs = 0;
	await assert.rejects(waitForDevToolsEndpoint({
		profileDir: "test-profile",
		browserProcess: child,
		timeoutMs: 10,
		pollIntervalMs: 5,
		fsApi: {
			readFile: async () => "45123\n",
			readdir: async () => ["DevToolsActivePort", "Local State"],
		},
		delay: async (delayMs) => { elapsedMs += delayMs; },
		now: () => elapsedMs,
	}), /lastState=DevToolsActivePort was incomplete or invalid.*profileEntries=\["DevToolsActivePort","Local State"\]/u);
});

test("DevTools timeout distinguishes an unreadable ActivePort file", async () => {
	const child = fakeChild(990);
	let elapsedMs = 0;
	const unreadable = new Error("permission denied");
	unreadable.code = "EACCES";
	await assert.rejects(waitForDevToolsEndpoint({
		profileDir: "test-profile",
		browserProcess: child,
		timeoutMs: 10,
		pollIntervalMs: 5,
		fsApi: {
			readFile: async () => { throw unreadable; },
			readdir: async () => ["DevToolsActivePort"],
		},
		delay: async (delayMs) => { elapsedMs += delayMs; },
		now: () => elapsedMs,
	}), /lastState=DevToolsActivePort could not be read: permission denied/u);
});

test("profile-directory diagnostic failure never masks the Chrome startup timeout", async () => {
	const child = fakeChild(991);
	let elapsedMs = 0;
	const denied = new Error("profile access denied");
	denied.code = "EACCES";
	await assert.rejects(waitForDevToolsEndpoint({
		profileDir: "test-profile",
		browserProcess: child,
		timeoutMs: 10,
		pollIntervalMs: 5,
		fsApi: {
			readFile: async () => { throw missingError(); },
			readdir: async () => { throw denied; },
		},
		delay: async (delayMs) => { elapsedMs += delayMs; },
		now: () => elapsedMs,
	}), (error) => {
		assert.match(error.message, /^Chrome did not publish a valid DevTools endpoint within 10 ms/u);
		assert.match(error.message, /lastState=DevToolsActivePort has not been created/u);
		assert.match(error.message, /profileEntries=<unavailable: EACCES: profile access denied>/u);
		return true;
	});
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

function diagnosticFixture(options = {}) {
	const records = [];
	let time = 0;
	const resources = { browserProcess: fakeChild(123), profileDir: "private-profile", ...options.resources };
	const diagnostics = createMountedBrowserDiagnostics({ suite: "unit-suite", resources: () => resources,
		now: () => time, log: line => records.push(JSON.parse(line.slice("MOUNTED_BROWSER_DIAGNOSTIC ".length))), ...Object.fromEntries(Object.entries(options).filter(([key]) => key !== "resources")) });
	return { diagnostics, records, resources, advance(ms) { time += ms; }, now: () => time };
}

async function diagnosticSocket(fixture, { connectionType = "page", opens = true } = {}) {
	const timers = new Map();
	let nextTimer = 0, socket;
	class ControlledSocket extends EventTarget {
		constructor() {
			super(); socket = this; this.readyState = 0; this.sent = [];
			if (opens) queueMicrotask(() => { this.readyState = 1; this.dispatchEvent(new Event("open")); });
		}
		send(text) { this.sent.push(JSON.parse(text)); }
		reply(id, result = {}) { this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ id, result }) })); }
		close() { this.readyState = 3; this.dispatchEvent(new Event("close")); }
	}
	const opening = connectDevTools("ws://private.invalid/secret?token=DO_NOT_LOG", {
		WebSocketImpl: ControlledSocket, diagnostics: fixture.diagnostics, connectionType, now: fixture.now,
		timeoutMs: 5000, commandTimeoutMs: 120000,
		setTimeoutFn(callback, delay) { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; },
		clearTimeoutFn(id) { timers.delete(id); },
	});
	if (!opens) { [...timers.values()][0].callback(); return opening; }
	return { connection: await opening, socket, timers };
}

const successfulCleanup = () => ({ rootPid: 123, browser: { graceful: "succeeded", fallback: "not-used", ownedPids: [123], remainingPids: [] }, profile: { retries: 0 }, viteCache: { retries: 0 } });

test("diagnostics distinguish endpoint failure and report cleanup without masking startup", async () => {
	const f = diagnosticFixture();
	let time = 0, original;
	await assert.rejects(runWithLifecycleCleanup(async () => {
		try {
			await waitForDevToolsEndpoint({ profileDir: "unit-profile", browserProcess: f.resources.browserProcess, diagnostics: f.diagnostics,
				timeoutMs: 10, pollIntervalMs: 5, now: () => time, delay: async ms => { time += ms; f.advance(ms); },
				fsApi: { readFile: async () => { throw missingError(); }, readdir: async () => [] } });
		} catch (error) { original = error; throw error; }
	}, successfulCleanup, f.diagnostics), error => error === original && /within 10 ms/.test(error.message));
	const failure = f.records.find(r => r.event === "failure-snapshot");
	assert.equal(failure.phase, "endpoint-publication");
	assert.equal(failure.browser.state, "running");
	assert.equal(failure.browser.rootPid, 123);
	assert.equal(failure.elapsedMs, 10);
	assert.equal(f.records.at(-1).cleanup.outcome, "succeeded");
	assert.equal(f.records.at(-1).cleanup.rootPid, 123);
});

for (const connectionType of ["browser", "page"]) {
	test(`diagnostics distinguish ${connectionType} WebSocket timeout without exposing its URL`, async () => {
		const f = diagnosticFixture();
		await assert.rejects(runWithLifecycleCleanup(() => diagnosticSocket(f, { connectionType, opens: false }), successfulCleanup, f.diagnostics), /within 5000 ms/);
		assert.equal(f.records.find(r => r.event === "failure-snapshot").phase, `${connectionType}-websocket`);
		assert.doesNotMatch(JSON.stringify(f.records), /private.invalid|DO_NOT_LOG|token=/);
	});
}

test("pending command failure retains IDs, ages, original scenario and all outstanding counts", async () => {
	const f = diagnosticFixture();
	const { connection, socket, timers } = await diagnosticSocket(f);
	connection.scenario("imported-discover", { enlargedText: true });
	const viewport = connection.command("Emulation.setDeviceMetricsOverride", { width: 393, height: 852, mobile: true, deviceScaleFactor: 1 });
	socket.reply(1); await viewport;
	const commands = [];
	for (let i = 0; i < 20; i++) commands.push(connection.command("Runtime.evaluate", { expression: "DO_NOT_LOG_APPLICATION_DATA", requestBody: "PRIVATE_REQUEST", url: "https://private.invalid/secret" }));
	const outcomes = Promise.allSettled(commands);
	connection.scenario("later-scenario");
	f.advance(120000);
	assert.equal([...timers.values()][0].delay, 120000);
	[...timers.values()][0].callback();
	const snapshot = f.diagnostics.snapshot();
	assert.equal(snapshot.firstCommandFailure.id, 2);
	assert.equal(snapshot.firstCommandFailure.method, "Runtime.evaluate");
	assert.equal(snapshot.firstCommandFailure.scenario, "imported-discover");
	const failurePending = snapshot.firstCommandFailure.connections[0];
	assert.equal(failurePending.pendingCount, 20);
	assert.equal(failurePending.pending.length, 16);
	assert.equal(failurePending.pendingOmitted, 4);
	assert.equal(failurePending.pending[0].ageMs, 120000);
	assert.equal(failurePending.pending[0].viewport.width, 393);
	assert.equal(snapshot.connections[0].pendingCount, 19);
	assert.doesNotMatch(JSON.stringify(snapshot), /DO_NOT_LOG|PRIVATE_REQUEST|private.invalid|expression|requestBody/);
	connection.close();
	assert.ok((await outcomes).every(result => result.status === "rejected"));
	assert.equal(timers.size, 0);
});

test("binding diagnostics track outstanding work, acknowledgement and rejection without consuming errors", async () => {
	const f = diagnosticFixture();
	const { connection, socket, timers } = await diagnosticSocket(f);
	connection.scenario("trakt-preview");
	const binding = connection.binding("pressGuidedPresentationKey");
	const input = connection.command("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter" }, { binding });
	assert.deepEqual(socket.sent[0].params, { type: "keyDown", key: "Enter" });
	socket.reply(1); await input;
	assert.equal(f.diagnostics.snapshot().bindings[0].state, "operation-complete");
	const acknowledgement = connection.command("Runtime.evaluate", { expression: "PRIVATE_ACK()" }, { binding, acknowledgement: true });
	assert.equal(f.diagnostics.snapshot().bindings[0].state, "acknowledgement-requested");
	socket.reply(2); await acknowledgement;
	assert.equal(f.diagnostics.snapshot().outstandingBindingCount, 0);
	const rejected = connection.binding("clickTmdbListHierarchyControl");
	const failed = connection.command("Input.dispatchMouseEvent", {}, { binding: rejected });
	const asserted = assert.rejects(failed, /exceeded 120000 ms/);
	[...timers.values()][0].callback(); await asserted;
	assert.equal(f.diagnostics.snapshot().outstandingBindingCount, 0);
	assert.ok(f.diagnostics.snapshot().recentActivity.some(r => r.event === "binding-rejected" && r.bindingId === rejected.id));
	// A finally-based acknowledgement still runs after a rejected operation.
	const ack = connection.command("Runtime.evaluate", { expression: "PRIVATE_FINALLY_ACK()" }, { binding: rejected, acknowledgement: true });
	assert.equal(f.diagnostics.snapshot().outstandingBindingCount, 1);
	assert.equal(f.diagnostics.snapshot().bindings[0].operationRejected, true);
	socket.reply(4); await ack;
	assert.ok(f.diagnostics.snapshot().recentActivity.some(r => r.event === "binding-acknowledged" && r.bindingId === rejected.id));
	const stalled = connection.binding("sourceNamesSpace");
	f.advance(80);
	assert.equal(f.diagnostics.snapshot().bindings[0].ageMs, 80);
	assert.equal(f.diagnostics.snapshot().bindings[0].id, stalled.id);
	assert.doesNotMatch(JSON.stringify(f.diagnostics.snapshot()), /PRIVATE_ACK|PRIVATE_FINALLY_ACK/);
	connection.close();
});

test("Chrome stderr recognises allowlisted basenames in Linux and legacy component formats", () => {
	const components = [
		"dbus/bus.cc", "dbus/object_proxy.cc", "sandbox/policy/linux/sandbox_linux.cc",
		"content/browser/zygote_host/zygote_host_impl_linux.cc", "content/browser/gpu/gpu_process_host.cc",
		"gpu/ipc/service/gpu_init.cc", "components/crash/core/app/crashpad_client_linux.cc",
		"headless/app/headless_shell.cc", "content/browser/devtools/devtools_http_handler.cc",
	];
	for (const path of components) {
		const basename = path.split("/").at(-1);
		for (const location of [`${path}:405`, `${basename}(405)`]) {
			const [entry] = sanitiseChromeStderr(`[123:456:1016/123456.789012:ERROR:${location}]`);
			assert.equal(entry.component, basename, location);
			assert.equal(entry.severity, "ERROR");
		}
	}
});

test("Chrome stderr keeps unknown and malformed components unknown", () => {
	for (const location of [
		"private/secret.cc:405", "secret.cc(405)", "dbus/not_bus.cc:405",
		"dbus/bus.cc", "dbus/bus.cc:", "dbus/bus.cc:-1", "dbus/bus.cc:4.05",
		"dbus/bus.cc:405extra", "dbus/bus.cc.extra:405", "bus.cc()", "bus.cc(nope)",
	]) {
		const [entry] = sanitiseChromeStderr(`[123:456:1016/123456.789012:ERROR:${location}]`);
		assert.equal(entry.component, "unknown", location);
		assert.equal(entry.severity, "ERROR");
	}
});

test("Chrome stderr preserves classification and bounded sanitisation for real Linux headers", () => {
	const sensitive = "PRIVATE_MESSAGE /home/private/profile https://private.invalid/path?token=SECRET Authorization: Bearer PRIVATE_TOKEN";
	const inputs = [
		["INFO", "headless/app/headless_shell.cc", "DevTools listening on ws://private.invalid/secret", "devtools-listening"],
		["WARNING", "sandbox/policy/linux/sandbox_linux.cc", "Sandbox", "sandbox"],
		["ERROR", "dbus/bus.cc", "D-Bus", "dbus"],
		["FATAL", "components/crash/core/app/crashpad_client_linux.cc", "Crashpad", "crashpad"],
		["ERROR", "private/secret.cc", "", "message-omitted"],
	];
	const entries = sanitiseChromeStderr(inputs.map(([severity, path, message]) =>
		`[123:456:1016/123456.789012:${severity}:${path}:405] ${message} ${sensitive}`).join("\n"));
	assert.deepEqual(entries, inputs.map(([severity, path, , category]) => ({
		severity, component: path === "private/secret.cc" ? "unknown" : path.split("/").at(-1), category,
	})));
	const repeated = sanitiseChromeStderr(Array(20).fill(`[123:456:ERROR:dbus/bus.cc:405] ${sensitive}`).join("\n"));
	assert.equal(repeated.length, 12);
	assert.ok(repeated.every(entry => entry.component === "bus.cc"));
	assert.ok(Buffer.byteLength(JSON.stringify(repeated)) < 2048);
	const truncated = sanitiseChromeStderr(`[123:456:ERROR:dbus/bus.cc:405] ${sensitive}\n` + "x".repeat(8192));
	assert.deepEqual(truncated, [{ severity: "unknown", component: "unknown", category: "message-omitted" }]);
	const output = JSON.stringify({ entries, repeated, truncated });
	assert.doesNotMatch(output, /PRIVATE|SECRET|Authorization|Bearer|private|secret|https?:|wss?:|\//u);
});

test("history, outstanding bindings, progress output and untrusted stderr are bounded and sanitised", () => {
	const stream = new EventEmitter();
	const capture = createBoundedStderrCapture(stream);
	const f = diagnosticFixture({ resources: { browserStderrCapture: capture } });
	stream.emit("data", "x".repeat(9000) + "\n[123:123:1015/000000:ERROR:bus.cc(408)] D-Bus https://private.invalid/body?token=SECRET\nDevTools listening on ws://private.invalid/secret\nAuthorization: Bearer SECRET\n[1:1:ERROR:private_secret.cc(1)] confidential\n{\"body\":\"PRIVATE_DATA\"}");
	for (let i = 0; i < 100; i++) f.diagnostics.scenario(`scenario-${i}`);
	for (let i = 0; i < 40; i++) f.diagnostics.binding("unit-binding");
	const snapshot = f.diagnostics.snapshot();
	assert.equal(snapshot.recentActivity.length, 48);
	assert.equal(snapshot.outstandingBindingCount, 40);
	assert.equal(snapshot.bindings.length, 16);
	assert.equal(snapshot.bindingsOmitted, 24);
	assert.ok(snapshot.omittedEvents > 0);
	assert.ok(snapshot.omittedProgress > 0);
	assert.equal(f.records.length, 64);
	assert.equal(snapshot.browser.stderrBytes, 8192);
	assert.ok(snapshot.browser.stderr.some(r => r.category === "dbus" && r.component === "bus.cc"));
	const output = JSON.stringify(snapshot);
	assert.ok(Buffer.byteLength(output) < 30000);
	assert.doesNotMatch(output, /SECRET|PRIVATE_DATA|Authorization|private.invalid|private_secret|confidential|Bearer/);
	capture.stop();
});

test("throwing or rejecting diagnostic sinks and broken collectors never mask primary or cleanup errors", async () => {
	const primary = new Error("actual failure"), cleanup = new Error("actual cleanup failure");
	const bad = new Proxy({}, { get() { throw new Error("observer failure"); } });
	const sinks = [bad, createMountedBrowserDiagnostics({ log() { throw new Error("sink failure"); } }),
		createMountedBrowserDiagnostics({ log: () => Promise.reject(new Error("async sink failure")), resources() { throw new Error("collector failure"); } })];
	for (const diagnostics of sinks) {
		await assert.rejects(runWithLifecycleCleanup(() => { throw primary; }, () => { throw cleanup; }, diagnostics), error => {
			assert.equal(error.primaryError, primary); assert.equal(error.cleanupError, cleanup); assert.equal(error.cause, primary); return true;
		});
		await assert.rejects(runWithLifecycleCleanup(() => { throw primary; }, successfulCleanup, diagnostics), error => error === primary);
		await assert.rejects(runWithLifecycleCleanup(() => 42, () => { throw cleanup; }, diagnostics), error => error.cleanupError === cleanup && error.operationValue === 42);
		assert.equal((await runWithLifecycleCleanup(() => 42, successfulCleanup, diagnostics)).value, 42);
	}
	await new Promise(resolve => setImmediate(resolve));
});

test("cleanup snapshots retain cooperative/fallback outcomes on success and failure", async () => {
	for (const fails of [false, true]) {
		const f = diagnosticFixture();
		const primary = new Error("original failure with SECRET");
		const cleanup = new BrowserShutdownError(new Error("graceful"), new Error("fallback"), { rootPid: 123, ownedPids: [123], remainingPids: [123], graceful: "failed", fallback: "failed" });
		await assert.rejects(runWithLifecycleCleanup(() => { throw primary; }, () => {
			if (fails) throw cleanup;
			return { ...successfulCleanup(), browser: { graceful: "failed", fallback: "succeeded", ownedPids: [123], remainingPids: [] } };
		}, f.diagnostics), error => fails ? error.primaryError === primary && error.cleanupError === cleanup : error === primary);
		assert.equal(f.records.at(-1).cleanup.outcome, fails ? "failed" : "succeeded");
		assert.equal(f.records.at(-1).cleanup.fallback, fails ? "failed" : "succeeded");
		assert.doesNotMatch(JSON.stringify(f.records), /SECRET/);
	}
});

test("retained stderr stops exactly once after successful cleanup and after failed cleanup", async () => {
	for (const fails of [false, true]) {
		let stops = 0;
		const f = diagnosticFixture();
		const resources = { browserProcess: fakeChild(123), processTree: { remainingPids: async () => [123] }, browserStderrCapture: { stop() { stops++; } } };
		const options = { diagnostics: f.diagnostics, shutdownBrowserFn: async () => {
			if (fails) throw new Error("shutdown failed");
			return successfulCleanup().browser;
		}, removeDirectoryFn: async () => ({ retries: 0 }), directoryEntriesFn: async () => [] };
		const cleanup = cleanupMountedBrowser(resources, options);
		if (fails) await assert.rejects(cleanup, /cleanup failed/);
		else { await cleanup; await cleanupMountedBrowser(resources, options); }
		assert.equal(stops, 1);
		assert.ok(f.diagnostics.snapshot().recentActivity.some(r => r.event === "phase-start" && r.phase === "browser-shutdown"));
		assert.ok(f.diagnostics.snapshot().recentActivity.some(r => r.event === "phase-start" && r.phase === "resource-cleanup"));
	}
});

test("scenario identity survives fixture navigation and existing readiness markers without extra commands", async () => {
	const f = diagnosticFixture();
	const { connection, socket } = await diagnosticSocket(f);
	connection.scenario("workspace-import", { enlargedText: true });
	const navigation = connection.command("Page.navigate", { url: "http://private.invalid/SECRET" });
	assert.equal(f.diagnostics.snapshot().scenario, "workspace-import");
	socket.reply(1); await navigation;
	assert.equal(f.diagnostics.snapshot().phase, "fixture-readiness");
	assert.equal(f.diagnostics.snapshot().scenario, "workspace-import");
	const waiting = connection.command("Runtime.evaluate", { expression: "SECRET_READINESS" });
	socket.reply(2, { result: { value: false } }); await waiting;
	assert.equal(f.diagnostics.snapshot().phase, "fixture-readiness");
	const ready = connection.command("Runtime.evaluate", { expression: "SECRET_READINESS" });
	socket.reply(3, { result: { value: true } }); await ready;
	assert.equal(f.diagnostics.snapshot().phase, "scenario-execution");
	assert.equal(f.diagnostics.snapshot().scenario, "workspace-import");
	assert.equal(f.diagnostics.snapshot().fontEnvironment.enlargedText, true);
	assert.equal(socket.sent.length, 3);
	assert.equal(f.records.filter(r => r.event === "scenario-complete").length, 0);
	f.diagnostics.stage("cleanup");
	assert.equal(f.records.filter(r => r.event === "scenario-complete").length, 1);
	assert.doesNotMatch(JSON.stringify(f.records), /SECRET|private.invalid/);
	connection.close();
});
