import assert from "node:assert/strict";
import { runExportRegressions } from "./export-mounted.mjs";
import fs from "node:fs/promises";
import path from "node:path";

// Runs inside the existing Bulk Edit/Export browser lifecycle. No new launcher.
export async function runNuvioSendChecks(connection, origin, evaluate, { includeExportRegressions = true } = {}) {
	await connection.command("Page.navigate", { url: `${origin}/tests/fixtures/builder-nuvio-send-mounted.html` });
	const deadline = Date.now() + 30000;
	while (Date.now() < deadline && !await evaluate(connection, "window.nuvioSendFixtureReady === true")) await new Promise((resolve) => setTimeout(resolve, 50));
	assert.equal(await evaluate(connection, "window.nuvioSendFixtureReady === true"), true, "Send fixture loaded");
	await connection.command("Emulation.setFocusEmulationEnabled", { enabled: true });
	await connection.command("Emulation.setDeviceMetricsOverride", { width: 393, height: 852, deviceScaleFactor: 1, mobile: true });
	const local = await evaluate(connection, "window.runSendLocalCases()");
	for (const flow of ["send", "import"]) {
		await evaluate(connection, `window.preparePinKeyboard("${flow}")`);
		for (const [index, key] of [..."4826"].entries()) {
			await connection.command("Input.dispatchKeyEvent", { type: "keyDown", key, code: `Digit${key}`, text: key, windowsVirtualKeyCode: key.charCodeAt(0) });
			await connection.command("Input.dispatchKeyEvent", { type: "keyUp", key, code: `Digit${key}`, windowsVirtualKeyCode: key.charCodeAt(0) });
			assert.equal(await evaluate(connection, `window.checkPinKeyboard(${index + 1})`), true, `${flow}: native phone-width entry waits for the fourth digit then clears and sends once`);
		}
		await connection.command("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
		await connection.command("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
		assert.equal(await evaluate(connection, `window.finishPinKeyboard("${flow}")`), true, "Native Enter cannot repeat the PIN; success advances the exact profile");
	}
	if (process.env.NUVIO_SEND_LOCAL_ONLY === "1") return { local };
	const screenshots = process.env.NUVIO_SEND_SCREENSHOT_DIR;
	if (screenshots) await fs.mkdir(screenshots, { recursive: true });
	const shots = new Set(["export-1280", "export-393", "review-loading-393", "checking-1280", "checking-393", "sending-1280", "sending-393", "verifying-1280", "verifying-393", "details-393"]);
	const layouts = [];
	for (const [width, height] of [...[360,384,393,402,412,768,899,900,901,1024,1280].map((width) => [width, 900]), [393,400], [1280,400]]) {
		await connection.command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 900 });
		for (const screen of ["export", "connect", "connecting", "profiles", "profiles-loading", "pin", "pin-checking", "pin-incorrect", "pin-locked", "review-loading", "review", "long-review", "details", "backup", "no-removals", "removal-fallback", "merge-review", "checking", "sending", "verifying", "missing", "identical", "remote-changed", "ack-unverified", "unknown", "rejected", "verified", "workspace-verified", "workspace-attention", "history"]) {
			layouts.push(await evaluate(connection, `window.prepareSendScreen(${JSON.stringify(screen)})`));
			if (screenshots && height > 400 && shots.has(`${screen}-${width}`)) {
				const shot = await connection.command("Page.captureScreenshot", { format: "png" });
				await fs.writeFile(path.join(screenshots, `send-${screen}-${width}.png`), Buffer.from(shot.data, "base64"));
			}
			if (screen.startsWith("workspace-")) continue;
			for (const backward of [true, false]) {
				await evaluate(connection, `(() => { const dialog = document.querySelector('[data-export-collections], [data-nuvio-dialog]'); const controls = [...dialog.querySelectorAll('button, input, a[href], [tabindex]')].filter(node => !node.disabled && node.tabIndex >= 0 && node.getClientRects().length); (controls[${backward ? "0" : "controls.length - 1"}] ?? dialog).focus(); })()`);
				await connection.command("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, modifiers: backward ? 8 : 0 });
				await connection.command("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
				assert.equal(await evaluate(connection, 'Boolean(document.activeElement.closest("[data-export-collections], [data-nuvio-dialog]"))'), true, "Native focus stays within the single shell");
			}
			await connection.command("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
			await connection.command("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
			await evaluate(connection, "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
			if (["connecting", "profiles-loading", "pin-checking", "review-loading", "checking", "sending", "verifying"].includes(screen)) {
				assert.equal(await evaluate(connection, 'Boolean(document.querySelector("[data-nuvio-send] .send-activity")) && !document.querySelector("[data-nuvio-send] .add-source-header-action") && document.body.style.position === "fixed"'), true, "Native Escape cannot dismiss active progress with no dismissal controls");
				await evaluate(connection, `window.finishSendProgress("${screen}")`);
			}
			assert.equal(await evaluate(connection, "window.checkSendClosed()"), true, "Stable dismissal restores originating workspace action and body");
		}
	}
	await connection.command("Emulation.setEmulatedMedia", { features: [{ name: "forced-colors", value: "active" }, { name: "prefers-reduced-motion", value: "reduce" }] });
	await evaluate(connection, 'window.prepareSendScreen("profiles")');
	await evaluate(connection, '(() => { document.querySelector(".nuvio-choice input:checked").focus(); })()');
	await connection.command("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowDown", code: "ArrowDown", windowsVirtualKeyCode: 40 });
	await connection.command("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowDown", code: "ArrowDown", windowsVirtualKeyCode: 40 });
	assert.equal(await evaluate(connection, '(() => { const selected = document.querySelector(".nuvio-choice[data-selected=true]"); return selected.querySelector("input").checked && selected.textContent.includes("Kids") && getComputedStyle(selected,"::after").borderStyle === "solid" && matchMedia("(prefers-reduced-motion: reduce)").matches; })()'), true, "Native radio navigation and structural selection survive forced colours/reduced motion");
	for (const screen of ["export", "review", "pin-incorrect", "pin-locked", "merge-review", "connecting", "profiles-loading", "pin-checking", "review-loading", "checking", "sending", "verifying", "verified", "identical"]) await evaluate(connection, `window.prepareSendScreen("${screen}")`);
	if (screenshots) {
		await evaluate(connection, 'window.prepareSendScreen("sending")');
		const shot = await connection.command("Page.captureScreenshot", { format: "png" });
		await fs.writeFile(path.join(screenshots, "send-sending-forced-colours-reduced-motion.png"), Buffer.from(shot.data, "base64"));
	}
	await connection.command("Emulation.setDeviceMetricsOverride", { width: 360, height: 900, deviceScaleFactor: 1, mobile: true });
	await evaluate(connection, 'document.documentElement.style.fontSize = "200%"');
	for (const screen of ["export", "long-review", "backup", "pin", "pin-checking", "pin-incorrect", "pin-locked", "merge-review", "no-removals", "removal-fallback", "connecting", "profiles-loading", "review-loading", "sending", "verified", "identical"]) await evaluate(connection, `window.prepareSendScreen("${screen}")`);
	await evaluate(connection, 'window.prepareSendScreen("review")');
	assert.equal(await evaluate(connection, 'document.querySelector("[data-action=download-nuvio-backup]").tagName === "BUTTON" && !document.querySelector("[data-action=replace-nuvio-collections]").disabled'), true, "Optional backup and independent Replace remain usable at doubled text size");
	await evaluate(connection, 'document.documentElement.style.fontSize = ""');
	await evaluate(connection, 'window.prepareSendKeyboardConfirmation()');
	for (const autoRepeat of [false, true, true]) await connection.command("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", text: "\r", unmodifiedText: "\r", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, autoRepeat });
	await connection.command("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
	assert.equal(await evaluate(connection, 'window.checkSendKeyboardConfirmation()'), true, "Native Enter and repeat events permit only one confirmed dispatch");
	const errors = await evaluate(connection, "window.__mountedErrors");
	await connection.command("Emulation.setEmulatedMedia", { features: [] });

	const exportResults = includeExportRegressions ? await runExportRegressions(connection, origin, evaluate) : null;
	return { local, layouts, errors, ...exportResults };
}
