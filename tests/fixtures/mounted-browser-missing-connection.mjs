import { EventEmitter } from "node:events";

import {
	cleanupMountedBrowser,
	runWithLifecycleCleanup,
	waitForDevToolsEndpoint,
} from "../helpers/mounted-browser-lifecycle.mjs";

const child = new EventEmitter();
child.pid = 4242;
child.exitCode = null;
child.signalCode = null;
child.finish = () => {
	if (child.exitCode !== null) return;
	child.exitCode = 0;
	child.emit("exit", 0, null);
};

const processTree = {
	capture: async () => [child.pid],
	remainingPids: async () => child.exitCode === null ? [child.pid] : [],
	terminate: async () => {
		terminationCalls += 1;
		child.finish();
	},
	waitForExit: async () => {
		if (child.exitCode !== null) return;
		await new Promise((resolve) => child.once("exit", resolve));
	},
};

let terminationCalls = 0;
let readinessError = null;
let elapsedMs = 0;
let observedError = null;
try {
	await runWithLifecycleCleanup(
		async () => {
			try {
				await waitForDevToolsEndpoint({
					profileDir: "missing-profile",
					browserProcess: child,
					timeoutMs: 10,
					pollIntervalMs: 5,
					fsApi: {
						readFile: async () => {
							const error = new Error("missing");
							error.code = "ENOENT";
							throw error;
						},
					},
					delay: async (delayMs) => { elapsedMs += delayMs; },
					now: () => elapsedMs,
				});
			} catch (error) {
				readinessError = error;
				throw error;
			}
		},
		() => cleanupMountedBrowser({
			browserExecutable: "test-chrome",
			browserProcess: child,
			browserConnection: null,
			pageConnection: null,
			processTree,
			profileDir: null,
			vite: null,
			viteCacheDir: null,
		}),
	);
} catch (error) {
	observedError = error;
}

if (observedError !== readinessError || !/did not publish a valid DevTools endpoint/u.test(observedError.message)) {
	throw new Error(`Cleanup masked the readiness error with: ${observedError?.stack ?? observedError}`);
}
if (terminationCalls !== 1 || child.exitCode !== 0) {
	throw new Error(`Fallback ownership failed: terminations=${terminationCalls}, exitCode=${child.exitCode}`);
}

await new Promise((resolve) => setImmediate(resolve));
console.log("MISSING_CONNECTION_CLEANUP_OK");
