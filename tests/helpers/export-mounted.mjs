import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
// Shared by full Workspace validation and focused Send validation.
export async function runExportRegressions(connection, origin, evaluate) {
	// Keep the existing byte/filename/warning/editor/feedback regressions intact.
	await connection.command("Page.navigate", { url: `${origin}/tests/fixtures/builder-export-collections-mounted.html` });
	const exportDeadline = Date.now() + 30000;
	while (Date.now() < exportDeadline && !await evaluate(connection, "window.exportFixtureReady === true")) await new Promise((resolve) => setTimeout(resolve, 50));
	const exports = [];
	for (const width of [393,900,1280]) {
		await connection.command("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width < 900 });
		exports.push(await evaluate(connection, "window.runExportScenario()"));
	}
	const regressions = {};
	for (const name of ["EditorCases", "FeedbackCases", "WarningCases", "LargeCase"]) regressions[name] = await evaluate(connection, `window.runExport${name}()`);
	await runExportKeyboardChecks(connection, evaluate);
	return { exports, regressions, exportErrors: await evaluate(connection, "window.__mountedErrors") };
}

export async function runImportGuideChecks(connection, origin, evaluate) {
	await connection.command("Page.navigate", { url: origin + "/tests/fixtures/builder-export-collections-mounted.html" });
	const deadline = Date.now() + 30000;
	while (Date.now() < deadline && !await evaluate(connection, "window.exportFixtureReady === true")) await new Promise(resolve => setTimeout(resolve, 50));
	assert.equal(await evaluate(connection, "window.exportFixtureReady === true"), true, "Export fixture loaded");
	await connection.command("Emulation.setFocusEmulationEnabled", { enabled: true });
	const screenshots = process.env.NUVIO_GUIDE_SCREENSHOT_DIR;
	if (screenshots) await fs.mkdir(screenshots, { recursive: true });
	async function shot(name) {
		if (!screenshots) return;
		const result = await connection.command("Page.captureScreenshot", { format: "png" });
		await fs.writeFile(path.join(screenshots, name + ".png"), Buffer.from(result.data, "base64"));
	}
	const layouts = [];
	for (const [width, height] of [...[360,384,393,402,412,899,900,901,1280].map(width => [width,900]), [393,400], [1280,400]]) {
		await connection.command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 900 });
		for (const host of ["export","about","welcome"]) layouts.push(await evaluate(connection, "window.runImportGuideScenario(" + JSON.stringify(host) + ")"));
		if (screenshots && [393,1280].includes(width)) {
			for (const host of ["export","about"]) for (const screen of ["root","chooser","web","tv","mobile","desktop"]) {
				await evaluate(connection, "window.prepareGuideScreen(" + JSON.stringify(host) + "," + JSON.stringify(screen) + ")");
				await shot(host + "-" + screen + "-" + width + "x" + height);
				if (screen === "chooser") {
					await evaluate(connection, "window.guideScrollEnd()");
					await shot(host + "-chooser-artwork-expanded-" + width + "x" + height);
				}
				if (["web","tv"].includes(screen)) {
					await evaluate(connection, "window.guideScrollEnd()");
					await shot(host + "-" + screen + "-end-" + width + "x" + height);
				}
			}
		}
	}
	const accessibility = [];
	for (const mode of ["keyboard","text200","forced-colours"]) {
		await connection.command("Emulation.setDeviceMetricsOverride", { width: 360, height: 900, deviceScaleFactor: 1, mobile: true });
		await connection.command("Emulation.setEmulatedMedia", { features: mode === "forced-colours" ? [{ name: "forced-colors", value: "active" }, { name: "prefers-reduced-motion", value: "reduce" }] : [] });
		await evaluate(connection, 'document.documentElement.style.fontSize = ' + JSON.stringify(mode === "text200" ? "200%" : ""));
		for (const host of ["export","about","welcome"]) {
			accessibility.push({ mode, ...await evaluate(connection, "window.runImportGuideScenario(" + JSON.stringify(host) + ")") });
			for (const screen of ["chooser","web","tv","mobile","desktop"]) {
				await evaluate(connection, "window.prepareGuideScreen(" + JSON.stringify(host) + "," + JSON.stringify(screen) + ")");
				if (host === "export" && ["chooser","tv","mobile"].includes(screen)) await shot(mode + "-" + screen + "-start");
				if (screen === "chooser") {
					// Reach the native summary in normal Tab order, then exercise Enter and Space.
					for (let step = 0; step < 8; step++) {
						await connection.command("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
						await connection.command("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
					}
					assert.equal(await evaluate(connection, 'document.activeElement.matches(".nuvio-guide-section summary")'), true, "Native Tab reaches shared artwork help after the four platform rows");
					for (const [key, code, keyCode, open] of [["Enter", "Enter", 13, true], [" ", "Space", 32, false]]) {
						await connection.command("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode, text: key === "Enter" ? "\r" : key, unmodifiedText: key === "Enter" ? "\r" : key });
						await connection.command("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: keyCode });
						await evaluate(connection, "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
						await evaluate(connection, "window.checkGuideArtwork(" + open + ")");
						if (open) {
							await evaluate(connection, "window.guideScrollEnd()");
							await shot(mode + "-" + host + "-chooser-artwork-expanded");
						}
					}
				}
				// Include the newly focused heading, both wrap boundaries and a full native Tab cycle.
				for (const backward of [true,false]) {
					await evaluate(connection, 'document.querySelector(".nuvio-guide-header h2").focus({preventScroll:true})');
					for (let step = 0; step < 10; step++) {
						await connection.command("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, modifiers: backward ? 8 : 0 });
						await connection.command("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
						assert.equal(await evaluate(connection, 'Boolean(document.activeElement.closest("[role=dialog]")) && document.activeElement.getClientRects().length > 0'), true, "Native Tab stays in visible host controls");
					}
				}
				if (host === "export" && ["chooser","tv","mobile"].includes(screen)) await shot(mode + "-" + screen);
				await connection.command("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
				await connection.command("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
				await evaluate(connection, "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
				assert.equal(await evaluate(connection, "window.checkGuideClosed()"), true);
			}
		}
	}
	await evaluate(connection, 'document.documentElement.style.fontSize = ""');
	await connection.command("Emulation.setEmulatedMedia", { features: [] });
	// Simulates only browser viewport geometry, never an external service response.
	await evaluate(connection, 'window.savedVisualViewport = Object.getOwnPropertyDescriptor(window,"visualViewport"); Object.defineProperty(window,"visualViewport",{configurable:true,value:Object.assign(new EventTarget(),{width:360,height:330,offsetTop:90,offsetLeft:0})}); true');
	for (const host of ["export","about","welcome"]) {
		await evaluate(connection, "window.prepareGuideScreen(" + JSON.stringify(host) + ',"chooser")');
		await evaluate(connection, 'Object.assign(window.visualViewport,{height:390,offsetTop:40}); window.visualViewport.dispatchEvent(new Event("resize")); window.visualViewport.dispatchEvent(new Event("scroll")); new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
		await evaluate(connection, "window.guideScrollEnd()");
		accessibility.push({ mode: "visual-viewport", host, ...await evaluate(connection, "window.checkGuideArtwork(true)") });
		await shot("visual-viewport-" + host);
	}
	await evaluate(connection, 'Object.defineProperty(window,"visualViewport",window.savedVisualViewport); delete window.savedVisualViewport; window.dispatchEvent(new Event("resize"))');
	const errors = await evaluate(connection, "window.__mountedErrors");
	assert.deepEqual(errors, []);
	const results = { layouts, accessibility, errors };
	if (screenshots) await fs.writeFile(path.join(screenshots,"guide-measurements.json"), JSON.stringify(results,null,2) + "\n");
	return results;
}

async function runExportKeyboardChecks(connection, evaluate) {
	await evaluate(connection, "window.prepareExportCase()");
	await connection.command("Emulation.setEmulatedMedia", { features: [{ name: "forced-colors", value: "active" }] });
	await evaluate(connection, 'document.querySelector("[data-action=open-import-guide]").focus()');
	await connection.command("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", text: "\r", unmodifiedText: "\r", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
	await connection.command("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
	await evaluate(connection, 'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
	assert.deepEqual(await evaluate(connection, '(() => { const row = document.querySelector("[data-guide-platform=web]"); const heading = document.querySelector(".nuvio-guide-header h2"); return { forcedColours: matchMedia("(forced-colors: active)").matches, platform: document.querySelector("[data-import-platform]").dataset.importPlatform, focused: document.activeElement === heading, border: getComputedStyle(row).borderStyle, outline: getComputedStyle(heading).outlineStyle, contained: document.querySelector("[data-export-collections]").scrollWidth <= document.querySelector("[data-export-collections]").clientWidth + 1 }; })()'), { forcedColours: true, platform: "chooser", focused: true, border: "solid", outline: "solid", contained: true }, "Guide opens with heading focus and forced-colour structure");
	for (const expected of ["import-guide-back", "import-guide-close", "Choose your Nuvio platform", "web", "tv", "mobile", "desktop", "Missing artwork or title details?", "import-guide-back"]) {
		await connection.command("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
		await connection.command("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
		assert.equal(await evaluate(connection, 'document.activeElement.dataset.action || document.activeElement.dataset.guidePlatform || document.activeElement.getAttribute("aria-label") || document.activeElement.textContent'), expected, "Guide keeps natural navigation order and wraps to Back");
	}
	for (const backward of [false, true]) {
		await evaluate(connection, `(() => { const controls = [...document.querySelector('[data-export-collections]').querySelectorAll('button, a[href], [tabindex]')].filter(element => !element.disabled && element.tabIndex >= 0 && element.getClientRects().length); controls[${backward ? "0" : "controls.length - 1"}].focus(); })()`);
		await connection.command("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, modifiers: backward ? 8 : 0 });
		await connection.command("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
		assert.equal(await evaluate(connection, 'Boolean(document.activeElement.closest("[data-export-collections]"))'), true, "Export traps native Tab at both boundaries");
	}
	await connection.command("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
	await connection.command("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
	await new Promise((resolve) => setTimeout(resolve, 50));
	assert.equal(await evaluate(connection, 'document.activeElement === document.querySelector("[data-action=open-export-collections]") && !document.querySelector("[data-export-collections]") && document.body.style.position !== "fixed"'), true, "Escape releases modal and restores entry focus");
	await connection.command("Emulation.setEmulatedMedia", { features: [] });
}
