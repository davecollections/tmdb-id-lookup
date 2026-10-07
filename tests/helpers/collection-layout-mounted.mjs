import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

// Uses the existing browser lifecycle and real Workspace fixture; no service substitutes.
export async function runCollectionLayoutChecks(connection, baseUrl, evaluate) {
	await connection.command("Page.navigate", { url: baseUrl + "/tests/fixtures/builder-collection-folders-mounted.html" });
	const deadline = Date.now() + 30000;
	while (!await evaluate(connection, "window.collectionFoldersFixtureReady === true")) {
		if (Date.now() > deadline) throw new Error("Collection layout fixture did not load");
		await new Promise(resolve => setTimeout(resolve, 50));
	}
	await connection.command("Emulation.setFocusEmulationEnabled", { enabled: true });
	const screenshots = process.env.BUILDER_LAYOUT_SCREENSHOT_DIR;
	if (screenshots) await fs.mkdir(screenshots, { recursive: true });
	async function capture(name) {
		if (!screenshots) return;
		const result = await connection.command("Page.captureScreenshot", { format: "png" });
		await fs.writeFile(path.join(screenshots, name + ".png"), Buffer.from(result.data, "base64"));
	}
	async function key(key, code, value, modifiers = 0) {
		await connection.command("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: value, modifiers });
		await connection.command("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: value });
		await evaluate(connection, "new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))");
	}
	async function viewport(width, height) {
		await connection.command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 900 });
		await connection.command("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
	}
	await viewport(1280, 900);
	const local = await evaluate(connection, "window.exerciseCollectionLayout()");
	await key("Escape", "Escape", 27);
	assert.equal(await evaluate(connection, "window.checkCollectionLayoutClosed()"), true);
	const layouts = [];
	const showAllComparisons = [];
	for (const variant of ["normal", "enlarged", "forced-colors", "reduced-motion"]) {
		const sizes = variant === "normal" ? [[360,800],[384,852],[393,852],[402,852],[412,852],[620,900],[768,900],[899,900],[900,900],[901,900],[1024,900],[1280,900],[1280,360]] : [[393,852],[1280,900]];
		await connection.command("Emulation.setEmulatedMedia", { features: variant === "forced-colors" ? [{ name: "forced-colors", value: "active" }] : variant === "reduced-motion" ? [{ name: "prefers-reduced-motion", value: "reduce" }] : [] });
		for (const [width, height] of sizes) {
			await viewport(width, height);
			for (const surface of ["edit", "bulk", "creation"]) {
				try {
					layouts.push({ variant, ...await evaluate(connection, `window.prepareCollectionLayout('${surface}', ${variant === "enlarged"})`) });
					const outerScrollExpression = `(() => { const dialog = document.querySelector('[role=dialog]'); const ownsScroll = /(auto|scroll)/.test(getComputedStyle(dialog).overflowY) && dialog.scrollHeight > dialog.clientHeight + 1; return [scrollX, scrollY, dialog.getBoundingClientRect().top, ownsScroll ? null : dialog.scrollTop]; })()`;
					const outerScroll = await evaluate(connection, outerScrollExpression);
					await evaluate(connection, "document.querySelector('input[value=FOLLOW_LAYOUT]').focus()");
					await key("ArrowLeft", "ArrowLeft", 37);
					await key("ArrowRight", "ArrowRight", 39);
					assert.deepEqual(await evaluate(connection, outerScrollExpression), outerScroll, "Radio focus scrolls only the intended content owner, with stable outer modal and document");
					assert.equal(await evaluate(connection, "document.activeElement.value === 'FOLLOW_LAYOUT' && document.activeElement.checked"), true, "Native radio arrow navigation selects Follow");
					await evaluate(connection, `window.measureCollectionShowAll('${surface}', 'FOLLOW_LAYOUT')`);
					assert.equal(await evaluate(connection, "parseFloat(getComputedStyle(document.activeElement.closest('label')).outlineWidth) >= 2"), true, "Complete card keyboard focus");
					if (variant === "forced-colors") assert.equal(await evaluate(connection, "parseFloat(getComputedStyle(document.activeElement.closest('label'), '::after').borderWidth) >= 1"), true, "Structural selected inset survives forced colours");
					if ([393,1280].includes(width) && height > 400 && variant !== "reduced-motion") await capture(`${width}-${variant}-${surface}`);
					if (surface === "edit" && variant === "normal" && [360,620,768,900,1024].includes(width)) await capture(`${width}-${variant}-${surface}`);
					if (surface === "creation" && [360,393,1280].includes(width) && height > 400 && variant !== "reduced-motion") {
						await evaluate(connection, "document.querySelector('[data-review-layout]').scrollIntoView({ block: 'start' })");
						await capture(`${width}-${variant}-creation-section`);
					}
					if (surface === "edit" && (width === 393 || (width === 1280 && variant === "enlarged")) && variant !== "reduced-motion") {
						for (const mode of ["TABBED_GRID", "ROWS", "FOLLOW_LAYOUT"]) {
							await evaluate(connection, `document.querySelector('input[value="${mode}"]').closest('label').scrollIntoView({ block: 'center' })`);
							await capture(`${width}-${variant}-${surface}-${mode.toLowerCase()}`);
						}
					}
					if (variant === "normal" && width === 393) {
						const ax = await connection.command("Accessibility.getFullAXTree");
						assert.ok(ax.nodes.some(node => node.role?.value === "radio" && node.name?.value.startsWith("Follow Home Layout") && node.properties?.some(p => p.name === "checked" && p.value.value === "true")), "Named checked radio in accessibility tree");
					}
					if (variant === "normal" && [393,1280].includes(width) && height > 400) {
						for (const mode of ["TABBED_GRID", "ROWS", "FOLLOW_LAYOUT"]) {
							showAllComparisons.push(await evaluate(connection, `window.reviewCollectionShowAll('${surface}', '${mode}')`));
							await capture(`${width}-show-all-${surface}-${mode.toLowerCase()}`);
						}
					}
					for (const reverse of [false, true]) {
						await evaluate(connection, `(() => { const controls = [...document.querySelector('[role=dialog]').querySelectorAll('button,input,select')].filter(el => !el.disabled && el.getClientRects().length); controls[${reverse ? "0" : "controls.length - 1"}].focus(); })()`);
						await key("Tab", "Tab", 9, reverse ? 8 : 0);
						assert.equal(await evaluate(connection, "Boolean(document.activeElement.closest('[role=dialog]'))"), true, "Focus stays in dialog");
					}
					await key("Escape", "Escape", 27);
					assert.equal(await evaluate(connection, "window.checkCollectionLayoutClosed()"), true);
				} catch (error) { await capture(`failed-${width}-${variant}-${surface}`); throw error; }
			}
		}
	}
	const localPeople = [];
	for (const variant of ["normal", "enlarged", "forced-colors"]) {
		await connection.command("Emulation.setEmulatedMedia", { features: variant === "forced-colors" ? [{ name: "forced-colors", value: "active" }] : [] });
		for (const width of variant === "normal" ? [360,393,1280] : [393,1280]) {
			await viewport(width, width === 1280 ? 900 : 852);
			localPeople.push({ variant, ...await evaluate(connection, `window.prepareLocalPeopleLayout(${variant === "enlarged"})`) });
			await key("ArrowLeft", "ArrowLeft", 37);
			await key("ArrowRight", "ArrowRight", 39);
			assert.equal(await evaluate(connection, "document.activeElement.value === 'FOLLOW_LAYOUT' && document.activeElement.checked"), true, "People native radio selection");
			await capture(`${width}-${variant}-people`);
			await evaluate(connection, "document.querySelector('.people-review-layout').scrollIntoView({ block: 'start' })");
			await capture(`${width}-${variant}-people-section`);
		}
	}
	await connection.command("Emulation.setEmulatedMedia", { features: [] });
	await evaluate(connection, "document.documentElement.style.fontSize = ''");
	const errors = await evaluate(connection, "window.__mountedErrors");
	assert.deepEqual(errors, []);
	const result = { local, layouts, localPeople, showAllComparisons, errors };
	if (screenshots) await fs.writeFile(path.join(screenshots, "measurements.json"), JSON.stringify(result, null, 2));
	return result;
}
