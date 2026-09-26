import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

// Reuse the workspace suite's browser lifecycle and existing import fixture.
export async function runWorkspaceImportChecks(connection, origin, evaluate) {
	await connection.command("Page.navigate", { url: `${origin}/tests/fixtures/builder-nuvio-import-mounted.html` });
	const deadline = Date.now() + 30000;
	while (Date.now() < deadline && !await evaluate(connection, "typeof window.runWorkspaceImportCases === 'function'")) await new Promise(resolve => setTimeout(resolve, 50));
	await connection.command("Emulation.setFocusEmulationEnabled", { enabled: true });
	await connection.command("Emulation.setDeviceMetricsOverride", { width: 393, height: 852, deviceScaleFactor: 1, mobile: true });
	const local = await evaluate(connection, "window.runWorkspaceImportCases()");
	const embedded = await evaluate(connection, "window.runEmbeddedNuvioCases()");
	const layouts = [];
	const embeddedLayouts = [];
	const screenshots = process.env.WORKSPACE_IMPORT_SCREENSHOT_DIR;
	if (screenshots) await fs.mkdir(screenshots, { recursive: true });
	async function capture(name) {
		if (!screenshots) return;
		const screenshot = await connection.command("Page.captureScreenshot", { format: "png" });
		await fs.writeFile(path.join(screenshots, `${name}.png`), Buffer.from(screenshot.data, "base64"));
	}
	async function key(key, code, keyCode, modifiers = 0) {
		await connection.command("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: keyCode, modifiers, ...(key === "Enter" ? { text: "\r" } : {}) });
		await connection.command("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: keyCode });
		await evaluate(connection, 'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
	}
	for (const [width, height] of [[360, 800], [393, 852], [1280, 900], [384, 852], [402, 852], [412, 852], [899, 900], [900, 900], [901, 900], [393, 400]]) {
		await connection.command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 900 });
		const stages = [360, 393, 1280].includes(width) && height > 400 ? ["workspace", "methods", "file", "json", "review", "merge-keep", "merge-fill", "merge-prefer", "replace", "nuvio"] : ["methods", "merge-prefer"];
		for (const stage of stages) {
			layouts.push({ stage, ...await evaluate(connection, `window.prepareWorkspaceImportScreen(${JSON.stringify(stage)})`) });
			if (width === 1280 && ["methods", "file", "json"].includes(stage)) {
				await capture(`${stage}-${width}`);
			}
			if (stage === "workspace") continue;
			if (stage === "methods") {
				await evaluate(connection, 'document.querySelector("[data-action=choose-import-file]").focus()');
				await key("Enter", "Enter", 13);
				assert.equal(await evaluate(connection, 'document.querySelector("[data-action=choose-import-file]").getAttribute("aria-pressed") === "true" && !document.querySelector("#builder-import-file-panel").hidden'), true, "Native keyboard method switching works");
			}
			for (const backward of [false, true]) {
				await evaluate(connection, `(() => { const modal=document.querySelector('[role="dialog"][aria-modal="true"]'); const controls=[...modal.querySelectorAll('button,input,textarea,summary')].filter(n=>!n.disabled&&n.getClientRects().length); controls[${backward ? "0" : "controls.length-1"}].focus({preventScroll:true}); })()`);
				await key("Tab", "Tab", 9, backward ? 8 : 0);
				assert.equal(await evaluate(connection, 'Boolean(document.activeElement.closest(\'[role="dialog"][aria-modal="true"]\'))'), true, "Native Tab stays in active dialog");
			}
			await key("Escape", "Escape", 27);
			await evaluate(connection, 'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
			assert.equal(await evaluate(connection, "window.workspaceImportClosed()"), true, "Escape restores workspace trigger and scroll");
		}
	}
	for (const variant of ["enlarged", "forced-colors", "reduced-motion"]) {
		await connection.command("Emulation.setDeviceMetricsOverride", { width: 393, height: 852, deviceScaleFactor: 1, mobile: true });
		await connection.command("Emulation.setEmulatedMedia", { features: variant === "forced-colors" ? [{ name: "forced-colors", value: "active" }] : variant === "reduced-motion" ? [{ name: "prefers-reduced-motion", value: "reduce" }] : [] });
		for (const stage of ["methods", "json", "merge-prefer", "replace"]) {
			layouts.push({ stage, variant, ...await evaluate(connection, `window.prepareWorkspaceImportScreen(${JSON.stringify(stage)}, ${variant === "enlarged"})`) });
			if (stage === "merge-prefer") {
				await evaluate(connection, 'document.querySelector(\'input[value="keep-existing"]\').focus()');
				await key("ArrowRight", "ArrowRight", 39);
				assert.equal(await evaluate(connection, 'document.querySelector(\'input[value="fill-missing"]\').checked'), true, "Native radio keyboard selection works");
				assert.equal(await evaluate(connection, '(() => { const input=document.querySelector(\'input[value="fill-missing"]\'); return Boolean(document.getElementById(input.getAttribute("aria-describedby"))?.textContent) && getComputedStyle(input.closest("label")).borderTopStyle !== "none"; })()'), true, "Radio description and boundary remain accessible");
			}
		}
	}
	await connection.command("Emulation.setEmulatedMedia", { features: [] });
	for (const [width, height] of [[360, 800], [393, 852], [899, 900], [900, 900], [901, 900], [1280, 900], [393, 400]]) {
		await connection.command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 900 });
		for (const stage of ["login", "profiles", "pin", "review", "merge"]) {
			embeddedLayouts.push({ stage, ...await evaluate(connection, `window.prepareEmbeddedNuvioScreen(${JSON.stringify(stage)})`) });
			if ((width === 1280 && stage !== "pin") || (width === 393 && height > 400 && stage === "login")) {
				if (stage === "merge") await evaluate(connection, 'document.querySelector(".merge-artwork-policies").scrollIntoView({ block: "center", behavior: "instant" }); new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
				await capture(`embedded-${stage}-${width}`);
			}
			for (const backward of [false, true]) {
				await evaluate(connection, `(() => { const modal=document.querySelector('[data-workspace-import]'); const controls=[...modal.querySelectorAll('button,input,textarea,summary')].filter(n=>!n.disabled&&n.getClientRects().length); controls[${backward ? "0" : "controls.length-1"}].focus({preventScroll:true}); })()`);
				await key("Tab", "Tab", 9, backward ? 8 : 0);
				assert.equal(await evaluate(connection, 'Boolean(document.activeElement.closest("[data-workspace-import]"))'), true, "Embedded Tab stays in the single outer dialog");
			}
			await key("Escape", "Escape", 27);
			assert.equal(await evaluate(connection, "window.workspaceImportClosed()"), true, "Embedded Escape restores workspace trigger and scroll");
		}
	}
	for (const variant of ["enlarged", "forced-colors", "reduced-motion"]) {
		await connection.command("Emulation.setDeviceMetricsOverride", { width: 393, height: 852, deviceScaleFactor: 1, mobile: true });
		await connection.command("Emulation.setEmulatedMedia", { features: variant === "forced-colors" ? [{ name: "forced-colors", value: "active" }] : variant === "reduced-motion" ? [{ name: "prefers-reduced-motion", value: "reduce" }] : [] });
		for (const stage of ["login", "profiles", "merge"]) {
			embeddedLayouts.push({ stage, variant, ...await evaluate(connection, `window.prepareEmbeddedNuvioScreen(${JSON.stringify(stage)}, ${variant === "enlarged"})`) });
		}
	}
	await connection.command("Emulation.setEmulatedMedia", { features: [] });
	await evaluate(connection, 'document.documentElement.style.fontSize=""');
	const external = await evaluate(connection, 'performance.getEntriesByType("resource").filter(r=>new URL(r.name).origin!==location.origin).map(r=>r.name)');
	assert.deepEqual(external, [], "Local imports and explicitly mocked Nuvio mechanics make zero external requests; live acceptance remains separate");
	return { local, embedded, layouts, embeddedLayouts, errors: await evaluate(connection, "window.__mountedErrors") };
}
