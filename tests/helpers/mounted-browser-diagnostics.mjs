import { performance } from "node:perf_hooks";

export const DIAGNOSTIC_HISTORY_LIMIT = 48;
export const DIAGNOSTIC_PENDING_LIMIT = 16;
export const DIAGNOSTIC_BINDING_LIMIT = 16;
const PROGRESS_LIMIT = 64;

// Labels are authored harness identifiers, never page content or command arguments.
function identifier(value) {
	return typeof value === "string" && /^[a-zA-Z0-9_. ,() -]{1,80}$/u.test(value) ? value : "unavailable";
}
function number(value) { return Number.isFinite(value) ? value : null; }
function errorKind(error) {
	const name = error?.name;
	return ["Error", "TypeError", "RangeError", "SyntaxError", "AbortError", "ShutdownDeadlineError", "BrowserShutdownError", "MountedBrowserCleanupError", "MountedLifecycleError"].includes(name) ? name : "Error";
}

// Chrome stderr is untrusted: keep structure and known categories, not free text.
// Even a URL/token split at the 8 KiB tail boundary must not escape redaction.
export function sanitiseChromeStderr(text) {
	return String(text).slice(-8192).split(/\r?\n/u).filter(Boolean).slice(-12).map(line => {
		const severity = line.match(/:(INFO|WARNING|ERROR|FATAL):/u)?.[1] ?? "unknown";
		const candidate = line.match(/:([a-z_]+\.cc)\(\d+\)/u)?.[1];
		const component = ["bus.cc", "object_proxy.cc", "sandbox_linux.cc", "zygote_host_impl_linux.cc", "gpu_process_host.cc", "gpu_init.cc", "crashpad_client_linux.cc", "headless_shell.cc", "devtools_http_handler.cc"].includes(candidate) ? candidate : "unknown";
		const category = line.includes("DevTools listening on") ? "devtools-listening"
			: /[Dd][Bb]us|D-Bus/u.test(line) ? "dbus"
			: /[Ss]andbox/u.test(line) ? "sandbox"
			: /[Cc]rashpad/u.test(line) ? "crashpad" : "message-omitted";
		return { severity, component, category };
	});
}

// No asynchronous probing, new CDP requests, filesystem/process scans or timers.
// Every entry point is best-effort; diagnostics cannot replace a test failure.
export function createMountedBrowserDiagnostics({
	suite, resources = () => ({}), now = () => performance.now(), log = console.log,
} = {}) {
	const history = [];
	const connections = new Map();
	const bindings = new Map();
	let context = { phase: "setup", scenario: null, viewport: null, fontEnvironment: null };
	let started = null, phaseStarted = null, scenarioStarted = null;
	let sequence = 0, bindingSequence = 0, outstandingBindings = 0;
	let omittedEvents = 0, omittedProgress = 0, progressCount = 0, collectionErrors = 0;
	let firstCommandFailure = null, phaseFailed = false;
	const clock = () => { const at = now(); if (!Number.isFinite(at)) throw new Error(); return at; };
	const elapsed = (at) => at === null ? 0 : Math.max(0, Math.round(clock() - at));
	const safe = (operation, fallback = null) => { try { return operation(); } catch { collectionErrors++; return fallback; } };
	const output = (value) => safe(() => {
		// A custom asynchronous sink is observed, but never awaited by the test.
		const result = log("MOUNTED_BROWSER_DIAGNOSTIC " + JSON.stringify(value));
		if (result?.then) Promise.resolve(result).catch(() => { collectionErrors++; });
	});
	const record = (event, fields = {}, progress = false) => {
		if (started === null) started = phaseStarted = clock();
		const entry = { sequence: ++sequence, elapsedMs: elapsed(started), ...context, event, ...fields };
		history.push(entry);
		if (history.length > DIAGNOSTIC_HISTORY_LIMIT) { history.shift(); omittedEvents++; }
		if (progress) {
			if (progressCount++ < PROGRESS_LIMIT) output({ suite: identifier(suite), ...entry });
			else omittedProgress++;
		}
		return entry;
	};
	const pendingSnapshot = () => [...connections.entries()].slice(0, 2).map(([connection, read]) =>
		safe(() => ({ connection, ...read() }), { connection, unavailable: true }));
	const snapshot = () => {
		const browser = safe(() => {
			const r = resources(), child = r.browserProcess;
			return {
				rootPid: number(child?.pid), exitCode: number(child?.exitCode), signalCode: child?.signalCode ? identifier(child.signalCode) : null,
				state: !child ? "not-started-or-released" : child.exitCode === null && child.signalCode === null ? "running" : "exited",
				profileAllocated: Boolean(r.profileDir), stderrBytes: number(r.browserStderrCapture?.byteLength()),
				stderr: sanitiseChromeStderr(r.browserStderrCapture?.text?.() ?? ""),
				stderrCaptureFailed: Boolean(r.browserStderrCapture?.error?.()),
			};
		}, { unavailable: true });
		return {
			suite: identifier(suite), ...context, elapsedMs: elapsed(started), browser,
			runtime: { node: process.version, platform: process.platform, imageOS: identifier(process.env.ImageOS), imageVersion: identifier(process.env.ImageVersion) },
			connections: pendingSnapshot(), outstandingBindingCount: outstandingBindings,
			bindings: [...bindings.values()].map(({ startedAt, ...binding }) => ({ ...binding, ageMs: elapsed(startedAt) })),
			bindingsOmitted: Math.max(0, outstandingBindings - bindings.size), firstCommandFailure,
			recentActivity: [...history], omittedEvents, omittedProgress, collectionErrors,
		};
	};
	const endScenario = (outcome) => {
		if (scenarioStarted !== null) record("scenario-" + outcome, { durationMs: elapsed(scenarioStarted) }, true);
		scenarioStarted = null;
	};
	const api = {
		stage(phase) {
			if (context.phase === phase) return;
			if (["cleanup", "browser-shutdown", "resource-cleanup"].includes(phase)) {
				endScenario("complete");
				context = { ...context, scenario: null, fontEnvironment: null };
			}
			if (!phaseFailed) record("phase-complete", { durationMs: elapsed(phaseStarted) }, true);
			phaseFailed = false;
			context = { ...context, phase: identifier(phase) };
			phaseStarted = clock();
			record("phase-start", {}, true);
		},
		scenario(label, view = {}) {
			if (context.phase !== "scenario-execution") api.stage("scenario-execution");
			endScenario("complete");
			context = { ...context, scenario: identifier(label), fontEnvironment: {
				enlargedText: "enlargedText" in view || "largeText" in view ? Boolean(view.enlargedText || view.largeText) : null,
				configuredFamily: view.fontFamily === "Verdana, sans-serif" ? view.fontFamily : "fixture-controlled",
				computed: "not-sampled",
			} };
			scenarioStarted = clock();
			record("scenario-start", {}, true);
		},
		viewport(params) { context = { ...context, viewport: { width: number(params.width), height: number(params.height), mobile: Boolean(params.mobile), deviceScaleFactor: number(params.deviceScaleFactor) } }; },
		context: () => ({ ...context }),
		registerConnection(type, read) { if (connections.size < 2) connections.set(identifier(type), read); },
		event: record,
		commandFailure(fields) {
			record("command-failed", fields);
			if (!firstCommandFailure) firstCommandFailure = { ...context, ...fields, connections: pendingSnapshot() };
		},
		binding(name) {
			const id = ++bindingSequence;
			const state = { id, name: identifier(name), scenario: context.scenario, startedAt: clock(), state: "invoked", operationRejected: false };
			outstandingBindings++;
			if (bindings.size < DIAGNOSTIC_BINDING_LIMIT) bindings.set(id, state);
			record("binding-invoked", { bindingId: id, binding: state.name });
			let finished = false;
			return Object.freeze({
				id,
				mark: (status) => safe(() => {
					if (status === "acknowledgement-requested" && finished) {
						finished = false; outstandingBindings++;
						if (bindings.size < DIAGNOSTIC_BINDING_LIMIT) bindings.set(id, state);
					}
					if (status === "rejected") state.operationRejected = true;
					state.state = identifier(status);
					record("binding-" + state.state, { bindingId: id, binding: state.name, operationRejected: state.operationRejected, durationMs: elapsed(state.startedAt) });
					if (!finished && ["acknowledged", "rejected"].includes(status)) {
						finished = true; outstandingBindings--; bindings.delete(id);
					}
				}),
			});
		},
		phaseFailure(error) {
			phaseFailed = true;
			record("phase-failed", { errorKind: errorKind(error), durationMs: elapsed(phaseStarted) }, true);
		},
		failure(error) {
			endScenario("failed");
			phaseFailed = true;
			record("phase-failed", { errorKind: errorKind(error), durationMs: elapsed(phaseStarted) }, true);
			output({ event: "failure-snapshot", ...snapshot() });
		},
		cleanup(report, error) {
			const details = report?.browser ?? error?.diagnostics ?? {};
			record(error ? "cleanup-failed" : "cleanup-complete", { durationMs: elapsed(phaseStarted) }, true);
			output({ event: "cleanup-snapshot", ...snapshot(), cleanup: {
				rootPid: number(report?.rootPid ?? details.rootPid),
				outcome: error ? "failed" : "succeeded", errorKind: error ? errorKind(error) : null,
				graceful: identifier(details.graceful), fallback: identifier(details.fallback),
				ownedPidCount: (details.ownedPids ?? []).length, remainingPidCount: (details.remainingPids ?? []).length,
				ownedPids: (details.ownedPids ?? []).slice(0, 16).map(number),
				remainingPids: (details.remainingPids ?? []).slice(0, 16).map(number),
				profileRetries: number(report?.profile?.retries), viteCacheRetries: number(report?.viteCache?.retries),
			} });
		},
		snapshot,
	};
	return Object.freeze(Object.fromEntries(Object.entries(api).map(([name, fn]) => [name, (...args) => safe(() => fn(...args))])));
}

// Also protect lifecycle semantics from injected/broken diagnostic implementations.
export function diagnose(diagnostics, method, ...args) {
	try {
		const result = diagnostics?.[method]?.(...args);
		if (result?.then) { Promise.resolve(result).catch(() => {}); return null; }
		return result;
	} catch { return null; }
}
