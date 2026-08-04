import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import react from "../builder/node_modules/@vitejs/plugin-react/dist/index.js";
import { createServer } from "../builder/node_modules/vite/dist/node/index.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const builderModules = path.join(rootDir, "builder", "node_modules");
const viteCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "builder-source-edit-vite-"));
const vite = await createServer({
	root: rootDir,
	cacheDir: viteCacheDir,
	configFile: false,
	appType: "spa",
	logLevel: "silent",
	plugins: [react()],
	resolve: {
		alias: [
			{ find: /^react$/, replacement: path.join(builderModules, "react", "index.js") },
			{ find: /^react\/jsx-runtime$/, replacement: path.join(builderModules, "react", "jsx-runtime.js") },
			{ find: /^react-dom$/, replacement: path.join(builderModules, "react-dom", "index.js") },
			{ find: /^react-dom\/client$/, replacement: path.join(builderModules, "react-dom", "client.js") },
		],
	},
	server: { host: "127.0.0.1", port: 0 },
});
await vite.listen();
after(async () => {
	await vite.close();
	fs.rmSync(viteCacheDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

function chromeExecutable() {
	const candidates = [
		process.env.CHROME_PATH,
		"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
		"C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
		"/usr/bin/google-chrome",
		"/usr/bin/chromium",
		"/usr/bin/chromium-browser",
		"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
	].filter(Boolean);
	const executable = candidates.find((candidate) => fs.existsSync(candidate));
	if (!executable) throw new Error("Chrome or Chromium is required for mounted Builder UI regressions.");
	return executable;
}

async function availablePort() {
	const server = net.createServer();
	await new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", resolve);
	});
	const { port } = server.address();
	await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
	return port;
}

async function waitForJson(url, timeoutMs = 10000) {
	const deadline = Date.now() + timeoutMs;
	let lastError = null;
	while (Date.now() < deadline) {
		try {
			const response = await fetch(url);
			if (response.ok) return response.json();
		} catch (error) {
			lastError = error;
		}
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
	throw new Error(`Chrome DevTools did not become available: ${lastError?.message ?? "timeout"}`);
}

async function connectCdp(url) {
	const socket = new WebSocket(url);
	await new Promise((resolve, reject) => {
		socket.addEventListener("open", resolve, { once: true });
		socket.addEventListener("error", () => reject(new Error("Chrome DevTools WebSocket failed.")), { once: true });
	});
	let nextId = 0;
	const pending = new Map();
	socket.addEventListener("message", (event) => {
		const message = JSON.parse(event.data);
		if (!message.id || !pending.has(message.id)) return;
		const { resolve, reject } = pending.get(message.id);
		pending.delete(message.id);
		if (message.error) reject(new Error(message.error.message));
		else resolve(message.result);
	});
	return {
		close: () => socket.close(),
		command(method, params = {}) {
			const id = ++nextId;
			return new Promise((resolve, reject) => {
				pending.set(id, { resolve, reject });
				socket.send(JSON.stringify({ id, method, params }));
			});
		},
	};
}

async function runMountedPage() {
	const debugPort = await availablePort();
	const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "builder-source-edit-mounted-"));
	const chrome = spawn(chromeExecutable(), [
		"--headless=new",
		"--disable-background-networking",
		"--disable-component-update",
		"--disable-gpu",
		"--no-first-run",
		"--no-sandbox",
		`--remote-debugging-port=${debugPort}`,
		`--user-data-dir=${profileDir}`,
		"about:blank",
	], { stdio: "ignore" });
	let cdp = null;
	try {
		const targets = await waitForJson(`http://127.0.0.1:${debugPort}/json/list`);
		const target = targets.find((entry) => entry.type === "page");
		if (!target?.webSocketDebuggerUrl) throw new Error("Chrome page target is unavailable.");
		cdp = await connectCdp(target.webSocketDebuggerUrl);
		await cdp.command("Page.enable");
		await cdp.command("Runtime.enable");
		const address = vite.httpServer.address();
		await cdp.command("Page.navigate", {
			url: `http://127.0.0.1:${address.port}/tests/fixtures/builder-source-edit-mounted.html`,
		});
		const deadline = Date.now() + 15000;
		while (Date.now() < deadline) {
			const evaluated = await cdp.command("Runtime.evaluate", {
				expression: "window.__builderSourceEditMounted ?? null",
				returnByValue: true,
			});
			const result = evaluated.result?.value;
			if (result?.status === "complete") return result.results;
			if (result?.status === "error") throw new Error(result.message);
			await new Promise((resolve) => setTimeout(resolve, 50));
		}
		throw new Error("Mounted source-edit regressions timed out.");
	} finally {
		cdp?.close();
		const chromeExited = chrome.exitCode !== null
			? Promise.resolve()
			: new Promise((resolve) => chrome.once("exit", resolve));
		chrome.kill();
		await Promise.race([
			chromeExited,
			new Promise((resolve) => setTimeout(resolve, 2000)),
		]);
		fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
	}
}

const mountedResults = await runMountedPage();

function assertRequiredNameFailure(result) {
	assert.equal(result.activeElementIsInput, true);
	assert.equal(result.ariaInvalid, "true");
	assert.equal(result.alertRendered, true);
	assert.equal(result.alertRole, "alert");
	assert.match(result.alertText, /Check your changes/);
	assert.match(result.alertText, /Enter a name for this source before saving\./);
	assert.equal(result.dialogOpen, true);
	assert.equal(result.blankValuePreserved, true);
	assert.equal(result.updateCalls, 0);
	assert.equal(result.revisionAfter, result.revisionBefore);
	assert.equal(result.serializedUnchanged, true);
	assert.equal(result.label, "Source name");
}

test("mounted People validation focuses Source name after rendering and performs zero mutation", () => {
	assertRequiredNameFailure(mountedResults.peopleRequiredName);
	assert.equal(
		mountedResults.peopleRequiredName.helper,
		"This is the name shown in Nuvio. You can customise it.",
	);
});

test("mounted Collection validation shares the Source name focus path and performs zero mutation", () => {
	assertRequiredNameFailure(mountedResults.collectionRequiredName);
	assert.equal(
		mountedResults.collectionRequiredName.helper,
		"This is the name shown in Nuvio. You can customise it.",
	);
});

test("mounted duplicate failure focuses the diagnostic alert and preserves the draft without mutation", () => {
	const result = mountedResults.duplicate;
	assert.equal(result.activeElementIsAlert, true);
	assert.equal(result.activeElementIsInput, false);
	assert.equal(result.alertRendered, true);
	assert.equal(result.alertRole, "alert");
	assert.match(result.alertText, /Source already exists/);
	assert.equal(result.dialogOpen, true);
	assert.equal(result.draftPreserved, true);
	assert.equal(result.updateCalls, 0);
	assert.equal(result.revisionAfter, result.revisionBefore);
	assert.equal(result.serializedUnchanged, true);
});
