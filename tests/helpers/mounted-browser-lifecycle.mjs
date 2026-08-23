import { execFile as execFileCallback } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

export const TRANSIENT_REMOVE_CODES = Object.freeze([
	"EBUSY",
	"EMFILE",
	"ENFILE",
	"ENOTEMPTY",
	"EPERM",
]);

export const DEFAULT_REMOVE_RETRY_DELAYS_MS = Object.freeze([25, 50, 100, 200]);
export const DEFAULT_DEVTOOLS_STARTUP_MS = 10000;
export const DEFAULT_CHROME_STDERR_MAX_BYTES = 8 * 1024;
export const DEFAULT_PROFILE_DIAGNOSTIC_ENTRY_LIMIT = 50;
export const DEFAULT_DEVTOOLS_CONNECTION_MS = 5000;
export const DEFAULT_DEVTOOLS_COMMAND_MS = 5000;
export const DEFAULT_GRACEFUL_SHUTDOWN_MS = 5000;
export const DEFAULT_FALLBACK_SHUTDOWN_MS = 3000;

function asError(value) {
	return value instanceof Error ? value : new Error(String(value));
}

function boundedDiagnosticText(value, maxLength = 300) {
	const text = String(value);
	return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`;
}

export function resolveDevToolsStartupTimeout(value) {
	if (value === undefined || value === null) return DEFAULT_DEVTOOLS_STARTUP_MS;
	if (typeof value !== "string") {
		throw new TypeError("DEVTOOLS_STARTUP_MS must be a positive integer in milliseconds.");
	}
	const normalized = value.trim();
	if (normalized === "") return DEFAULT_DEVTOOLS_STARTUP_MS;
	if (!/^\d+$/u.test(normalized)) {
		throw new TypeError(
			`DEVTOOLS_STARTUP_MS must be a positive integer in milliseconds; received ${JSON.stringify(value)}.`,
		);
	}
	const timeoutMs = Number(normalized);
	if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
		throw new TypeError(
			`DEVTOOLS_STARTUP_MS must be a positive integer in milliseconds; received ${JSON.stringify(value)}.`,
		);
	}
	return timeoutMs;
}

export function createBoundedStderrCapture(
	stream,
	{ maxBytes = DEFAULT_CHROME_STDERR_MAX_BYTES } = {},
) {
	if (!Number.isInteger(maxBytes) || maxBytes <= 0) {
		throw new TypeError("A positive integer Chrome stderr byte limit is required.");
	}

	let tail = Buffer.alloc(0);
	let captureError = null;
	let attached = false;
	let capturing = false;
	const onData = (chunk) => {
		try {
			const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
			const boundedChunk = buffer.length > maxBytes
				? buffer.subarray(buffer.length - maxBytes)
				: buffer;
			const keepFromTail = Math.max(0, maxBytes - boundedChunk.length);
			const retainedTail = tail.length > keepFromTail
				? tail.subarray(tail.length - keepFromTail)
				: tail;
			tail = Buffer.concat([retainedTail, boundedChunk]);
		} catch (error) {
			captureError = asError(error);
			stop();
		}
	};
	const onError = (error) => {
		captureError = asError(error);
	};

	function stop() {
		if (!capturing) return;
		capturing = false;
		stream.removeListener("data", onData);
	}

	function detach() {
		stop();
		if (!attached) return;
		attached = false;
		stream.removeListener("error", onError);
		stream.removeListener("end", detach);
		stream.removeListener("close", detach);
	}

	if (
		stream &&
		typeof stream.on === "function" &&
		typeof stream.once === "function" &&
		typeof stream.removeListener === "function"
	) {
		attached = true;
		capturing = true;
		stream.on("data", onData);
		stream.on("error", onError);
		stream.once("end", detach);
		stream.once("close", detach);
		try {
			stream.unref?.();
		} catch {
			// Capturing remains bounded even when the stream cannot be unreferenced.
		}
	}

	return Object.freeze({
		byteLength: () => tail.length,
		error: () => captureError,
		text: () => tail.toString("utf8"),
		stop,
	});
}

function abortError() {
	const error = new Error("Operation aborted.");
	error.name = "AbortError";
	error.code = "ABORT_ERR";
	return error;
}

function throwIfAborted(signal) {
	if (signal?.aborted) throw abortError();
}

function browserProcessStatus(browserProcess) {
	return [
		`rootPid=${browserProcess?.pid ?? "unknown"}`,
		`exitCode=${browserProcess?.exitCode ?? "running"}`,
		`signalCode=${browserProcess?.signalCode ?? "none"}`,
	].join(", ");
}

function browserProcessExited(browserProcess) {
	return Boolean(browserProcess) &&
		(browserProcess.exitCode !== null || browserProcess.signalCode !== null);
}

function chromeStderrDiagnostic(stderrCapture) {
	try {
		const captureError = stderrCapture?.error?.();
		if (captureError) {
			return `chromeStderr=<capture unavailable: ${boundedDiagnosticText(asError(captureError).message)}>`;
		}
		const stderrText = stderrCapture?.text?.() ?? "";
		return `chromeStderr=${JSON.stringify(stderrText || "<none captured>")}`;
	} catch (error) {
		return `chromeStderr=<capture unavailable: ${boundedDiagnosticText(asError(error).message)}>`;
	}
}

function chromeLaunchDiagnostic(browserExecutable, stderrCapture) {
	return [
		`executable=${JSON.stringify(browserExecutable ?? "unknown")}`,
		chromeStderrDiagnostic(stderrCapture),
	].join("; ");
}

function profileEntryName(entry) {
	const name = typeof entry === "string" ? entry : entry?.name;
	if (typeof name !== "string") return "<unnamed entry>";
	const suffix = typeof entry?.isDirectory === "function" && entry.isDirectory() ? "/" : "";
	return boundedDiagnosticText(`${name}${suffix}`, 120);
}

async function chromeProfileDiagnostic(profileDir, fsApi) {
	try {
		const entries = (await fsApi.readdir(profileDir, { withFileTypes: true }))
			.map(profileEntryName)
			.sort();
		const visibleEntries = entries.slice(0, DEFAULT_PROFILE_DIAGNOSTIC_ENTRY_LIMIT);
		const omittedCount = entries.length - visibleEntries.length;
		return [
			`profileEntries=${JSON.stringify(visibleEntries)}`,
			omittedCount > 0 ? `profileEntriesOmitted=${omittedCount}` : null,
		].filter(Boolean).join("; ");
	} catch (error) {
		if (error?.code === "ENOENT") return "profileEntries=<profile directory absent>";
		const code = typeof error?.code === "string" ? `${error.code}: ` : "";
		return `profileEntries=<unavailable: ${code}${boundedDiagnosticText(asError(error).message)}>`;
	}
}

export function abortableDelay(
	delayMs,
	signal,
	{ setTimeoutFn = setTimeout, clearTimeoutFn = clearTimeout } = {},
) {
	throwIfAborted(signal);
	return new Promise((resolve, reject) => {
		let timer = null;
		const cleanup = () => {
			if (timer !== null) clearTimeoutFn(timer);
			signal?.removeEventListener("abort", onAbort);
		};
		const onAbort = () => {
			cleanup();
			reject(abortError());
		};
		timer = setTimeoutFn(() => {
			timer = null;
			cleanup();
			resolve();
		}, delayMs);
		signal?.addEventListener("abort", onAbort, { once: true });
	});
}

function abortablePromise(promise, signal) {
	throwIfAborted(signal);
	return new Promise((resolve, reject) => {
		const onAbort = () => reject(abortError());
		signal?.addEventListener("abort", onAbort, { once: true });
		Promise.resolve(promise).then(
			(value) => {
				signal?.removeEventListener("abort", onAbort);
				resolve(value);
			},
			(error) => {
				signal?.removeEventListener("abort", onAbort);
				reject(error);
			},
		);
	});
}

export class ShutdownDeadlineError extends Error {
	constructor(label, timeoutMs) {
		super(`${label} exceeded its ${timeoutMs} ms deadline.`);
		this.name = "ShutdownDeadlineError";
		this.code = "MOUNTED_BROWSER_SHUTDOWN_TIMEOUT";
		this.timeoutMs = timeoutMs;
	}
}

export async function withDeadline(
	task,
	timeoutMs,
	{
		label = "Mounted browser shutdown",
		setTimeoutFn = setTimeout,
		clearTimeoutFn = clearTimeout,
	} = {},
) {
	const controller = new AbortController();
	let timer = null;
	const deadline = new Promise((resolve, reject) => {
		timer = setTimeoutFn(() => {
			timer = null;
			controller.abort();
			reject(new ShutdownDeadlineError(label, timeoutMs));
		}, timeoutMs);
	});

	try {
		return await Promise.race([
			Promise.resolve().then(() => task(controller.signal)),
			deadline,
		]);
	} finally {
		if (timer !== null) clearTimeoutFn(timer);
		controller.abort();
	}
}

export async function waitForDevToolsEndpoint({
	profileDir,
	browserProcess,
	browserExecutable,
	stderrCapture,
	timeoutMs = DEFAULT_DEVTOOLS_STARTUP_MS,
	pollIntervalMs = 50,
	fsApi = fs,
	delay = abortableDelay,
	now = Date.now,
} = {}) {
	if (!profileDir) throw new TypeError("A Chrome profile directory is required.");
	if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
		throw new TypeError("A positive Chrome DevTools startup timeout is required.");
	}
	if (!Number.isFinite(pollIntervalMs) || pollIntervalMs <= 0) {
		throw new TypeError("A positive Chrome DevTools polling interval is required.");
	}

	const activePortPath = path.join(profileDir, "DevToolsActivePort");
	const deadlineAt = now() + timeoutMs;
	let lastProblem = "DevToolsActivePort has not been created";

	while (now() < deadlineAt) {
		if (browserProcessExited(browserProcess)) {
			throw new Error(
				`Chrome exited before publishing its DevTools endpoint ` +
				`(${browserProcessStatus(browserProcess)}; ${chromeLaunchDiagnostic(browserExecutable, stderrCapture)}).`,
			);
		}

		try {
			const contents = await fsApi.readFile(activePortPath, "utf8");
			const [portText = "", browserPath = ""] = contents.split(/\r?\n/u).map((line) => line.trim());
			const port = Number(portText);
			if (
				Number.isInteger(port) &&
				port >= 1 &&
				port <= 65535 &&
				browserPath.startsWith("/devtools/browser/")
			) {
				return {
					port,
					browserPath,
					browserWebSocketUrl: `ws://127.0.0.1:${port}${browserPath}`,
				};
			}
			lastProblem = "DevToolsActivePort was incomplete or invalid";
		} catch (error) {
			lastProblem = error?.code === "ENOENT"
				? "DevToolsActivePort has not been created"
				: `DevToolsActivePort could not be read: ${asError(error).message}`;
		}

		const remainingMs = deadlineAt - now();
		if (remainingMs > 0) await delay(Math.min(pollIntervalMs, remainingMs));
	}

	if (browserProcessExited(browserProcess)) {
		throw new Error(
			`Chrome exited before publishing its DevTools endpoint ` +
			`(${browserProcessStatus(browserProcess)}; ${chromeLaunchDiagnostic(browserExecutable, stderrCapture)}).`,
		);
	}
	const profileDiagnostic = await chromeProfileDiagnostic(profileDir, fsApi);
	throw new Error(
		`Chrome did not publish a valid DevTools endpoint within ${timeoutMs} ms ` +
		`(${browserProcessStatus(browserProcess)}; lastState=${lastProblem}; ` +
		`${chromeLaunchDiagnostic(browserExecutable, stderrCapture)}; ${profileDiagnostic}).`,
	);
}

export async function connectDevTools(
	url,
	{
		WebSocketImpl = globalThis.WebSocket,
		timeoutMs = DEFAULT_DEVTOOLS_CONNECTION_MS,
		commandTimeoutMs = DEFAULT_DEVTOOLS_COMMAND_MS,
		signal,
		setTimeoutFn = setTimeout,
		clearTimeoutFn = clearTimeout,
	} = {},
) {
	if (typeof WebSocketImpl !== "function") {
		throw new Error("A WebSocket implementation is required for Chrome DevTools.");
	}
	if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
		throw new TypeError("A positive Chrome DevTools connection timeout is required.");
	}
	if (!Number.isFinite(commandTimeoutMs) || commandTimeoutMs <= 0) {
		throw new TypeError("A positive Chrome DevTools command timeout is required.");
	}
	throwIfAborted(signal);

	const socket = new WebSocketImpl(url);
	await new Promise((resolve, reject) => {
		let timer = null;
		const cleanup = () => {
			if (timer !== null) clearTimeoutFn(timer);
			socket.removeEventListener("open", onOpen);
			socket.removeEventListener("error", onError);
			signal?.removeEventListener("abort", onAbort);
		};
		const closeOpeningSocket = () => {
			try {
				if (typeof socket.close === "function" && socket.readyState < 2) socket.close();
			} catch {
				// The opening error remains the useful failure.
			}
		};
		const onOpen = () => {
			cleanup();
			resolve();
		};
		const onError = () => {
			cleanup();
			closeOpeningSocket();
			reject(new Error("Chrome DevTools WebSocket failed to open."));
		};
		const onAbort = () => {
			cleanup();
			closeOpeningSocket();
			reject(abortError());
		};
		socket.addEventListener("open", onOpen, { once: true });
		socket.addEventListener("error", onError, { once: true });
		signal?.addEventListener("abort", onAbort, { once: true });
		timer = setTimeoutFn(() => {
			timer = null;
			cleanup();
			closeOpeningSocket();
			reject(new Error(`Chrome DevTools WebSocket did not open within ${timeoutMs} ms.`));
		}, timeoutMs);
	});

	let nextId = 0;
	let closed = false;
	const pending = new Map();
	let resolveClosed;
	const closedPromise = new Promise((resolve) => { resolveClosed = resolve; });

	const settlePending = (id, outcome, value) => {
		const operation = pending.get(id);
		if (!operation) return;
		pending.delete(id);
		clearTimeoutFn(operation.timer);
		operation[outcome](value);
	};
	const rejectPending = (message) => {
		for (const id of [...pending.keys()]) {
			settlePending(id, "reject", new Error(message));
		}
	};

	socket.addEventListener("message", (event) => {
		let message;
		try {
			message = JSON.parse(event.data);
		} catch (error) {
			rejectPending(`Chrome DevTools returned invalid JSON: ${asError(error).message}`);
			return;
		}
		if (!message.id || !pending.has(message.id)) return;
		if (message.error) settlePending(message.id, "reject", new Error(message.error.message));
		else settlePending(message.id, "resolve", message.result);
	});

	socket.addEventListener("close", (event) => {
		closed = true;
		rejectPending("Chrome DevTools WebSocket closed before the command completed.");
		resolveClosed({ code: event.code, reason: event.reason });
	}, { once: true });

	return {
		closed: closedPromise,
		isClosed: () => closed,
		close() {
			if (!closed && socket.readyState < 2) socket.close();
		},
		command(method, params = {}) {
			if (closed || socket.readyState !== 1) {
				return Promise.reject(new Error("Chrome DevTools WebSocket is not open."));
			}
			const id = ++nextId;
			return new Promise((resolve, reject) => {
				const operation = { resolve, reject, timer: null };
				pending.set(id, operation);
				operation.timer = setTimeoutFn(() => {
					settlePending(
						id,
						"reject",
						new Error(`Chrome DevTools command ${method} exceeded ${commandTimeoutMs} ms.`),
					);
				}, commandTimeoutMs);
				try {
					socket.send(JSON.stringify({ id, method, params }));
				} catch (error) {
					settlePending(id, "reject", error);
				}
			});
		},
	};
}

function isAlive(pid, processKill) {
	try {
		processKill(pid, 0);
		return true;
	} catch (error) {
		if (error?.code === "ESRCH") return false;
		if (error?.code === "EPERM") return true;
		throw error;
	}
}

async function windowsProcessRecords(execFileFn) {
	const script = [
		"$ErrorActionPreference = 'Stop'",
		"Get-CimInstance Win32_Process | ForEach-Object { '{0}|{1}' -f $_.ProcessId, $_.ParentProcessId }",
	].join("; ");
	const { stdout } = await execFileFn(
		"powershell.exe",
		["-NoProfile", "-NonInteractive", "-Command", script],
		{ windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
	);
	return stdout.split(/\r?\n/u).flatMap((line) => {
		const [pidText, parentText] = line.trim().split("|");
		const pid = Number(pidText);
		const parentPid = Number(parentText);
		return Number.isInteger(pid) && Number.isInteger(parentPid)
			? [{ pid, parentPid, groupId: null }]
			: [];
	});
}

async function linuxProcessRecords(fsApi) {
	const entries = await fsApi.readdir("/proc", { withFileTypes: true });
	const records = [];
	await Promise.all(entries.map(async (entry) => {
		if (!entry.isDirectory() || !/^\d+$/u.test(entry.name)) return;
		try {
			const stat = await fsApi.readFile(`/proc/${entry.name}/stat`, "utf8");
			const commandEnd = stat.lastIndexOf(")");
			if (commandEnd < 0) return;
			const fields = stat.slice(commandEnd + 2).trim().split(/\s+/u);
			const pid = Number(entry.name);
			const parentPid = Number(fields[1]);
			const groupId = Number(fields[2]);
			if (Number.isInteger(pid) && Number.isInteger(parentPid) && Number.isInteger(groupId)) {
				records.push({ pid, parentPid, groupId });
			}
		} catch (error) {
			if (!["EACCES", "ENOENT", "ESRCH"].includes(error?.code)) throw error;
		}
	}));
	return records;
}

async function posixProcessRecords(execFileFn) {
	const { stdout } = await execFileFn("ps", ["-axo", "pid=,ppid=,pgid="], {
		maxBuffer: 4 * 1024 * 1024,
	});
	return stdout.split(/\r?\n/u).flatMap((line) => {
		const [pidText, parentText, groupText] = line.trim().split(/\s+/u);
		const pid = Number(pidText);
		const parentPid = Number(parentText);
		const groupId = Number(groupText);
		return Number.isInteger(pid) && Number.isInteger(parentPid) && Number.isInteger(groupId)
			? [{ pid, parentPid, groupId }]
			: [];
	});
}

function descendantPids(rootPid, records) {
	const owned = new Set([rootPid]);
	let changed = true;
	while (changed) {
		changed = false;
		for (const record of records) {
			if (!owned.has(record.pid) && owned.has(record.parentPid)) {
				owned.add(record.pid);
				changed = true;
			}
		}
	}
	const live = new Set(records.map(({ pid }) => pid));
	return [...owned].filter((pid) => live.has(pid)).sort((left, right) => left - right);
}

function uniqueSortedPids(pids) {
	return [...new Set(pids)].sort((left, right) => left - right);
}

export function createBrowserProcessTree({
	rootPid,
	platform = process.platform,
	processKill = process.kill.bind(process),
	execFileFn = execFile,
	fsApi = fs,
	delay = abortableDelay,
	pollIntervalMs = 25,
} = {}) {
	if (!Number.isInteger(rootPid) || rootPid <= 0) {
		throw new TypeError("A positive browser root PID is required.");
	}

	let capturedPids = [rootPid];
	const isWindows = platform === "win32";
	const isLinux = platform === "linux";

	async function records() {
		if (isWindows) return windowsProcessRecords(execFileFn);
		if (isLinux) return linuxProcessRecords(fsApi);
		return posixProcessRecords(execFileFn);
	}

	async function capture() {
		const current = await records();
		capturedPids = isWindows
			? descendantPids(rootPid, current)
			: uniqueSortedPids([
				...descendantPids(rootPid, current),
				...current.filter(({ groupId }) => groupId === rootPid).map(({ pid }) => pid),
			]);
		if (!capturedPids.includes(rootPid) && isAlive(rootPid, processKill)) capturedPids.unshift(rootPid);
		capturedPids = uniqueSortedPids(capturedPids);
		return [...capturedPids];
	}

	async function remainingPids(ownedPids = capturedPids) {
		if (isWindows) return ownedPids.filter((pid) => isAlive(pid, processKill));
		try {
			const current = await records();
			return uniqueSortedPids([
				...ownedPids.filter((pid) => isAlive(pid, processKill)),
				...current.filter(({ groupId }) => groupId === rootPid).map(({ pid }) => pid),
			]);
		} catch (error) {
			return isAlive(-rootPid, processKill) ? [...ownedPids] : [];
		}
	}

	async function waitForExit(ownedPids, signal) {
		while (true) {
			throwIfAborted(signal);
			if ((await remainingPids(ownedPids)).length === 0) return;
			await delay(pollIntervalMs, signal);
		}
	}

	async function terminate(ownedPids, signal) {
		throwIfAborted(signal);
		if (isWindows) {
			const targets = [rootPid, ...ownedPids.filter((pid) => pid !== rootPid)];
			for (const pid of targets) {
				if (!isAlive(pid, processKill)) continue;
				try {
					await execFileFn("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
						windowsHide: true,
					});
				} catch (error) {
					if (isAlive(pid, processKill)) throw error;
				}
			}
			return;
		}

		const signalOwned = (signalName) => {
			try {
				processKill(-rootPid, signalName);
			} catch (error) {
				if (error?.code !== "ESRCH") throw error;
			}
			for (const pid of ownedPids) {
				if (!isAlive(pid, processKill)) continue;
				try {
					processKill(pid, signalName);
				} catch (error) {
					if (error?.code !== "ESRCH") throw error;
				}
			}
		};

		signalOwned("SIGTERM");
		await delay(100, signal);
		if ((await remainingPids(ownedPids)).length === 0) return;
		signalOwned("SIGKILL");
	}

	return { capture, remainingPids, terminate, waitForExit };
}

export function waitForChildExit(child, signal) {
	throwIfAborted(signal);
	if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
	return new Promise((resolve, reject) => {
		const cleanup = () => {
			child.removeListener("exit", onExit);
			child.removeListener("error", onError);
			signal?.removeEventListener("abort", onAbort);
		};
		const onExit = () => {
			cleanup();
			resolve();
		};
		const onError = (error) => {
			cleanup();
			reject(error);
		};
		const onAbort = () => {
			cleanup();
			reject(abortError());
		};
		child.once("exit", onExit);
		child.once("error", onError);
		signal?.addEventListener("abort", onAbort, { once: true });
	});
}

export class BrowserShutdownError extends AggregateError {
	constructor(gracefulError, fallbackError, diagnostics) {
		super(
			[gracefulError, fallbackError],
			`Mounted browser shutdown failed after graceful close and fallback: ${fallbackError.message}`,
			{ cause: gracefulError },
		);
		this.name = "BrowserShutdownError";
		this.gracefulError = gracefulError;
		this.fallbackError = fallbackError;
		this.diagnostics = diagnostics;
	}
}

async function safeRemainingPids(processTree, ownedPids) {
	try {
		return await processTree.remainingPids(ownedPids);
	} catch {
		return ownedPids;
	}
}

export async function shutdownBrowser({
	browserProcess,
	browserConnection,
	processTree,
	gracefulTimeoutMs = DEFAULT_GRACEFUL_SHUTDOWN_MS,
	fallbackTimeoutMs = DEFAULT_FALLBACK_SHUTDOWN_MS,
	deadline = withDeadline,
	deadlineOptions,
} = {}) {
	if (!browserProcess?.pid || !processTree) {
		return {
			graceful: "not-needed",
			fallback: "not-used",
			ownedPids: [],
			remainingPids: [],
		};
	}

	let ownedPids = [browserProcess.pid];
	let gracefulError = null;
	try {
		await deadline(async (signal) => {
			ownedPids = await processTree.capture(signal);
			if ((await processTree.remainingPids(ownedPids)).length === 0) return;
			if (!browserConnection) {
				throw new Error("Browser-level Chrome DevTools connection is unavailable.");
			}
			const connectionAlreadyClosed = browserConnection.isClosed?.() === true;
			const rootExited = Promise.resolve()
				.then(() => waitForChildExit(browserProcess, signal));
			const treeExited = Promise.resolve()
				.then(() => processTree.waitForExit(ownedPids, signal));
			const socketClosed = Promise.resolve()
				.then(() => abortablePromise(browserConnection.closed, signal));
			const closeRequested = connectionAlreadyClosed
				? Promise.resolve()
				: Promise.resolve()
					.then(() => browserConnection.command("Browser.close"))
					.catch((error) => {
						if (!browserConnection.isClosed?.()) throw error;
					});
			await Promise.all([closeRequested, socketClosed, rootExited, treeExited]);
		}, gracefulTimeoutMs, {
			label: "Graceful mounted browser shutdown",
			...deadlineOptions,
		});
		return {
			graceful: "succeeded",
			fallback: "not-used",
			ownedPids,
			remainingPids: [],
		};
	} catch (error) {
		gracefulError = asError(error);
	}

	try {
		await deadline(async (signal) => {
			await processTree.terminate(ownedPids, signal);
			await Promise.all([
				Promise.resolve().then(() => waitForChildExit(browserProcess, signal)),
				Promise.resolve().then(() => processTree.waitForExit(ownedPids, signal)),
			]);
		}, fallbackTimeoutMs, {
			label: "Mounted browser process-tree fallback",
			...deadlineOptions,
		});
		const remainingPids = await safeRemainingPids(processTree, ownedPids);
		if (remainingPids.length > 0) {
			throw new Error(`Fallback left test-owned browser PIDs running: ${remainingPids.join(", ")}.`);
		}
		return {
			graceful: "failed",
			gracefulError,
			fallback: "succeeded",
			ownedPids,
			remainingPids,
		};
	} catch (error) {
		const fallbackError = asError(error);
		const remainingPids = await safeRemainingPids(processTree, ownedPids);
		throw new BrowserShutdownError(gracefulError, fallbackError, {
			rootPid: browserProcess.pid,
			ownedPids,
			remainingPids,
		});
	}
}

async function pathExists(target, fsApi) {
	try {
		await fsApi.access(target);
		return true;
	} catch (error) {
		if (error?.code === "ENOENT") return false;
		throw error;
	}
}

export async function removeDirectoryWithRetry(target, {
	fsApi = fs,
	retryDelaysMs = DEFAULT_REMOVE_RETRY_DELAYS_MS,
	transientCodes = TRANSIENT_REMOVE_CODES,
	delay = abortableDelay,
} = {}) {
	if (!target) return { attempts: 0, retries: 0, totalDelayMs: 0 };
	const acceptedCodes = new Set(transientCodes);
	let attempts = 0;
	let totalDelayMs = 0;

	while (true) {
		attempts += 1;
		try {
			await fsApi.rm(target, { recursive: true, force: true, maxRetries: 0 });
			if (await pathExists(target, fsApi)) {
				const error = new Error(`Directory still exists after removal: ${target}`);
				error.code = "ENOTEMPTY";
				throw error;
			}
			return { attempts, retries: attempts - 1, totalDelayMs };
		} catch (error) {
			if (!acceptedCodes.has(error?.code)) throw error;
			const retryDelay = retryDelaysMs[attempts - 1];
			if (retryDelay === undefined) throw error;
			totalDelayMs += retryDelay;
			await delay(retryDelay);
		}
	}
}

async function directoryEntries(target, fsApi = fs) {
	try {
		if (!target || !(await pathExists(target, fsApi))) return [];
		return (await fsApi.readdir(target)).slice(0, 25).sort();
	} catch (error) {
		return [`<unavailable: ${error.message}>`];
	}
}

function closeConnection(connection) {
	try {
		connection?.close();
		return null;
	} catch (error) {
		return asError(error);
	}
}

export class MountedBrowserCleanupError extends AggregateError {
	constructor(errors, diagnostics) {
		const message = [
			"Mounted browser cleanup failed",
			`executable=${diagnostics.browserExecutable ?? "unknown"}`,
			`rootPid=${diagnostics.rootPid ?? "unknown"}`,
			`graceful=${diagnostics.graceful}`,
			`fallback=${diagnostics.fallback}`,
			`remainingPids=[${diagnostics.remainingPids.join(", ")}]`,
			`profileEntries=[${diagnostics.profileEntries.join(", ")}]`,
		].join("; ");
		super(errors, message, { cause: errors[0] });
		this.name = "MountedBrowserCleanupError";
		this.diagnostics = diagnostics;
	}
}

const cleanupOperations = new WeakMap();

async function cleanupMountedBrowserOnce(resources, {
	shutdownBrowserFn = shutdownBrowser,
	removeDirectoryFn = removeDirectoryWithRetry,
	directoryEntriesFn = directoryEntries,
	shutdownOptions,
	removeOptions,
} = {}) {
	const report = {
		browserExecutable: resources.browserExecutable ?? null,
		rootPid: resources.browserProcess?.pid ?? null,
		browser: {
			graceful: "not-needed",
			fallback: "not-used",
			ownedPids: [],
			remainingPids: [],
		},
		profile: { attempts: 0, retries: 0, totalDelayMs: 0 },
		viteCache: { attempts: 0, retries: 0, totalDelayMs: 0 },
	};
	const errors = [];
	let browserOwnershipEnded = !resources.browserProcess?.pid;
	let viteOwnershipEnded = !resources.vite;

	if (!browserOwnershipEnded) {
		try {
			report.browser = await shutdownBrowserFn({
				browserProcess: resources.browserProcess,
				browserConnection: resources.browserConnection,
				processTree: resources.processTree,
				...shutdownOptions,
			});
			browserOwnershipEnded = true;
			resources.browserProcess = null;
			resources.processTree = null;
		} catch (error) {
			errors.push(asError(error));
			report.browser.graceful = "failed";
			report.browser.fallback = "failed";
			report.browser.ownedPids = error?.diagnostics?.ownedPids ?? [resources.browserProcess.pid];
			report.browser.remainingPids = error?.diagnostics?.remainingPids ?? report.browser.ownedPids;
		}
	}

	for (const key of ["pageConnection", "browserConnection"]) {
		const closeError = closeConnection(resources[key]);
		if (closeError) errors.push(closeError);
		else resources[key] = null;
	}

	if (!viteOwnershipEnded) {
		try {
			await resources.vite.close();
			viteOwnershipEnded = true;
			resources.vite = null;
		} catch (error) {
			errors.push(asError(error));
		}
	}

	if (browserOwnershipEnded && viteOwnershipEnded) {
		try {
			report.profile = await removeDirectoryFn(resources.profileDir, removeOptions);
			resources.profileDir = null;
		} catch (error) {
			errors.push(asError(error));
		}
		try {
			report.viteCache = await removeDirectoryFn(resources.viteCacheDir, removeOptions);
			resources.viteCacheDir = null;
		} catch (error) {
			errors.push(asError(error));
		}
	} else {
		errors.push(new Error("Temporary directory removal was skipped because browser or Vite ownership did not end."));
	}

	if (errors.length > 0) {
		const remainingPids = resources.processTree
			? await safeRemainingPids(resources.processTree, report.browser.ownedPids)
			: report.browser.remainingPids;
		const profileEntries = await directoryEntriesFn(resources.profileDir);
		throw new MountedBrowserCleanupError(errors, {
			browserExecutable: report.browserExecutable,
			rootPid: report.rootPid,
			graceful: report.browser.graceful,
			fallback: report.browser.fallback,
			remainingPids,
			profileEntries,
		});
	}

	return report;
}

export function cleanupMountedBrowser(resources, options = {}) {
	if (!resources || typeof resources !== "object") {
		return Promise.reject(new TypeError("Mounted browser resources are required."));
	}
	const activeCleanup = cleanupOperations.get(resources);
	if (activeCleanup) return activeCleanup;

	const cleanup = cleanupMountedBrowserOnce(resources, options).catch((error) => {
		cleanupOperations.delete(resources);
		throw error;
	});
	cleanupOperations.set(resources, cleanup);
	return cleanup;
}

export class MountedLifecycleError extends AggregateError {
	constructor(primaryError, cleanupError) {
		super([primaryError, cleanupError], primaryError.message, { cause: primaryError });
		this.name = "MountedLifecycleError";
		this.primaryError = primaryError;
		this.cleanupError = cleanupError;
	}
}

export class MountedCleanupAfterSuccessError extends Error {
	constructor(cleanupError, operationValue) {
		super(cleanupError.message, { cause: cleanupError });
		this.name = "MountedCleanupAfterSuccessError";
		this.cleanupError = cleanupError;
		this.operationCompleted = true;
		this.operationValue = operationValue;
	}
}

export async function runWithLifecycleCleanup(operation, cleanup) {
	let operationValue;
	let primaryError = null;
	try {
		operationValue = await operation();
	} catch (error) {
		primaryError = asError(error);
	}

	let cleanupReport;
	let cleanupError = null;
	try {
		cleanupReport = await cleanup();
	} catch (error) {
		cleanupError = asError(error);
	}

	if (primaryError && cleanupError) throw new MountedLifecycleError(primaryError, cleanupError);
	if (primaryError) throw primaryError;
	if (cleanupError) throw new MountedCleanupAfterSuccessError(cleanupError, operationValue);
	return { value: operationValue, cleanupReport };
}
