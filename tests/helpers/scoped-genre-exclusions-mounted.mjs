import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

export async function runScopedGenreExclusionChecks(connection, origin, evaluate) {
	await connection.command("Page.navigate", { url: origin + "/tests/fixtures/builder-scoped-genre-exclusions-mounted.html" });
	const deadline = Date.now() + 30000;
	while (!await evaluate(connection, "window.scopedFixtureReady === true")) {
		if (Date.now() > deadline) throw new Error("Scoped Genre fixture failed to load");
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
	await connection.command("Emulation.setFocusEmulationEnabled", { enabled: true });
	const directory = process.env.SCOPED_GENRE_SCREENSHOT_DIR;
	if (directory) await fs.mkdir(directory, { recursive: true });
	async function capture(name) {
		if (!directory) return;
		const shot = await connection.command("Page.captureScreenshot", { format: "png" });
		await fs.writeFile(path.join(directory, name + ".png"), Buffer.from(shot.data, "base64"));
	}
	async function viewport(width, height) {
		await connection.command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 900 });
		await connection.command("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
	}
	async function key(key, code, value, modifiers = 0) {
		await connection.command("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: value, modifiers, ...(key === "Enter" ? { text: "\r" } : {}) });
		await connection.command("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: value });
		await evaluate(connection, "new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))");
	}
	await viewport(1280, 900);
	const local = await evaluate(connection, "window.scopedLocalCases()");
	const layouts = [];
	const surfaces = ["display", "source", "guard", "scope", "scope-expanded", "scope-search", "genres", "review", "expanded", "inline", "success", "error"];
	const dimensions = [[360, 800], [384, 852], [393, 852], [402, 852], [412, 852], [899, 900], [900, 900], [901, 900], [1280, 900], [393, 320], [1280, 320]];
	const variants = dimensions.map(([width, height]) => ({ width, height, name: "ordinary" }));
	for (const name of ["enlarged", "forced-colors", "reduced-motion"]) for (const width of [393, 1280]) variants.push({ width, height: 900, name });
	for (const { width, height, name } of variants) {
		await viewport(width, height);
		await connection.command("Emulation.setEmulatedMedia", { features: name === "forced-colors" ? [{ name: "forced-colors", value: "active" }] : name === "reduced-motion" ? [{ name: "prefers-reduced-motion", value: "reduce" }] : [] });
		for (const screen of surfaces) {
			const label = `${width}x${height}-${name}-${screen}`;
			try {
				layouts.push({ variant: name, ...await evaluate(connection, `window.prepareScopedScreen(${JSON.stringify(screen)}, ${name === "enlarged"})`) });
				await capture(label);
				for (const reverse of [false, true]) {
					await evaluate(connection, `(() => { const controls = [...document.querySelector('[role="dialog"]').querySelectorAll("button,input,summary")].filter(el => !el.matches(":disabled") && el.tabIndex !== -1 && el.getClientRects().length); controls[${reverse ? "0" : "controls.length - 1"}].focus({ preventScroll: true }); })()`);
					await key("Tab", "Tab", 9, reverse ? 8 : 0);
					assert.equal(await evaluate(connection, "Boolean(document.activeElement.closest('[role=dialog]'))"), true, "Focus remains in active dialog");
				}
				if (screen === "scope-expanded") {
					assert.equal(await evaluate(connection, "document.querySelector('input[name=scoped-genre-target]').indeterminate"), true, "Mixed state survives responsive variants");
					if (name === "forced-colors") assert.equal(await evaluate(connection, "parseFloat(getComputedStyle(document.querySelector('.scoped-genre-exclusion-target-row[data-selected=true]'), '::after').borderWidth) >= 1"), true, "Target mixed selection has forced-colours structural inset");
				}
				if (screen === "genres") {
					assert.equal(await evaluate(connection, `(() => { const card = document.querySelector('[data-genre-name="Horror"]'); return card.getAttribute("aria-pressed") === "true" && getComputedStyle(card).borderTopStyle === "dashed"; })()`), true, "Shared pill uses pressed state and dashed border");
					if (name === "forced-colors") assert.equal(await evaluate(connection, `parseFloat(getComputedStyle(document.querySelector('[data-genre-name="Horror"]'), "::after").borderWidth) >= 1`), true, "Selection has a non-colour inset");
				}
			} catch (error) { await capture("FAILED-" + label); throw error; }
		}
	}
	await connection.command("Emulation.setEmulatedMedia", { features: [] });
	const exactKeyboard = [], extraReviews = [];
	for (const width of [393, 1280]) {
		await viewport(width, 900);
		for (const screen of ["all-skipped-folder", "all-skipped-collection", "multiple-skipped", "zero-mixed", "large-review", "all-changing", "large-exceptions"].flatMap(name => [name, name + "-expanded"])) {
			extraReviews.push(await evaluate(connection, "window.prepareScopedScreen(" + JSON.stringify(screen) + ")"));
			await capture(width + "x900-review-" + screen);
		}
		await viewport(width, 900);
		await evaluate(connection, 'window.prepareScopedScreen("display")');
		await evaluate(connection, "document.querySelector('[data-action=cancel-bulk-edit]').focus()");
		await key("Tab", "Tab", 9);
		const displayForward = await evaluate(connection, "document.activeElement.id");
		assert.equal(displayForward, "global-settings-display-tab", "Forward Tab reaches exact Display tab");
		await key("Tab", "Tab", 9, 8);
		const displayBackward = await evaluate(connection, "document.activeElement.dataset.action");
		assert.equal(displayBackward, "cancel-bulk-edit", "Shift-Tab reaches exact final Cancel");
		await evaluate(connection, "document.querySelector('#global-settings-display-tab').focus()");
		await key("ArrowRight", "ArrowRight", 39);
		assert.equal(await evaluate(connection, "document.activeElement.id"), "global-settings-source-tab");
		await key("Home", "Home", 36);
		assert.equal(await evaluate(connection, "document.activeElement.id"), "global-settings-display-tab");
		await key("Escape", "Escape", 27);
		assert.equal(await evaluate(connection, 'document.activeElement.dataset.action'), "open-bulk-edit");
		await evaluate(connection, "window.scopedPrepareConfirmation()");
		await evaluate(connection, "document.querySelector('[data-action=continue-bulk-title-confirmation]').focus()");
		await key("Tab", "Tab", 9);
		const confirmationForward = await evaluate(connection, "document.activeElement.dataset.action");
		assert.equal(confirmationForward, "cancel-bulk-title-confirmation");
		await key("Tab", "Tab", 9, 8);
		const confirmationBackward = await evaluate(connection, "document.activeElement.dataset.action");
		assert.equal(confirmationBackward, "continue-bulk-title-confirmation");
		await key("Escape", "Escape", 27);
		assert.equal(await evaluate(connection, "Boolean(document.querySelector('[data-bulk-edit-dialog]'))"), true);
		await key("Escape", "Escape", 27);
		assert.equal(await evaluate(connection, "document.activeElement.dataset.action"), "open-bulk-edit");
		exactKeyboard.push({ width, displayForward, displayBackward, confirmationForward, confirmationBackward });
		for (const screen of ["scope-expanded", "genres", "review"]) {
			await evaluate(connection, "window.prepareScopedScreen(" + JSON.stringify(screen) + ")");
			await evaluate(connection, "document.querySelector('[data-action=scoped-genres-back]').focus()");
			await key("Tab", "Tab", 9);
			assert.equal(await evaluate(connection, "document.activeElement.dataset.action"), "scoped-genres-close", "Back Tab reaches header Close");
			await key("Tab", "Tab", 9, 8);
			assert.equal(await evaluate(connection, "document.activeElement.dataset.action"), "scoped-genres-back", "Close Shift-Tab reaches Back");
			await key("Tab", "Tab", 9, 8);
			assert.equal(await evaluate(connection, "Boolean(document.activeElement.closest('footer'))"), true, "Back Shift-Tab wraps to the sole primary action");
			await key("Tab", "Tab", 9);
			assert.equal(await evaluate(connection, "document.activeElement.dataset.action"), "scoped-genres-back", "Primary action Tab wraps to header Back");
			await key("Escape", "Escape", 27); await evaluate(connection, "window.scopedReturn()");
		}
		await evaluate(connection, 'window.prepareScopedScreen("success")');
		assert.equal(await evaluate(connection, "Boolean(document.querySelector('[data-action=scoped-genres-back]'))"), false, "Success removes Back only");
		assert.equal(await evaluate(connection, "document.activeElement.textContent"), "Genre exclusions applied", "Success heading retains focus");
		await evaluate(connection, "document.querySelector('[data-action=scoped-genres-close]').focus()");
		await key("Tab", "Tab", 9);
		assert.equal(await evaluate(connection, "document.activeElement.textContent"), "Done", "Success Close Tab reaches Done");
		await key("Tab", "Tab", 9);
		assert.equal(await evaluate(connection, "document.activeElement.dataset.action"), "scoped-genres-close", "Done Tab wraps to Close");
		await key("Tab", "Tab", 9, 8);
		assert.equal(await evaluate(connection, "document.activeElement.textContent"), "Done", "Close Shift-Tab reaches Done");
		await evaluate(connection, "document.querySelector('[data-action=scoped-genres-close]').focus()");
		await key("Enter", "Enter", 13); await evaluate(connection, "window.scopedReturn()");
		await evaluate(connection, 'window.prepareScopedScreen("review")');
		await evaluate(connection, "document.querySelector('.scoped-genre-review-collection > summary').focus()");
		assert.equal(await evaluate(connection, "document.querySelector('.scoped-genre-review-collection > summary path').getAttribute('d')"), "m5 7 5 5 5-5", "Review collapsed chevron points down");
		await key("Enter", "Enter", 13);
		assert.equal(await evaluate(connection, "document.querySelector('.scoped-genre-review-collection').open && !!document.querySelector('.scoped-genre-exclusion-folder > header h4')"), true, "Enter expands Collection into plain Folder groups");
		assert.equal(await evaluate(connection, "document.querySelector('.scoped-genre-review-collection > summary path').getAttribute('d')"), "m5 12 5-5 5 5", "Review expanded chevron points up");
		await key(" ", "Space", 32);
		assert.equal(await evaluate(connection, "Boolean(document.querySelector('[data-scoped-source]'))"), false, "Space collapses and unmounts outcomes");
		await evaluate(connection, 'window.prepareScopedScreen("expanded")');
		await evaluate(connection, "document.querySelector('.scoped-genre-audit-toggle').focus()");
		await key("Enter", "Enter", 13);
		assert.equal(await evaluate(connection, "document.activeElement.getAttribute('aria-expanded') === 'true' && !!document.querySelector('[data-outcome=changed] .scoped-genre-before-after')"), true, "Enter reveals routine audit with before/after");
		await key(" ", "Space", 32);
		assert.equal(await evaluate(connection, "!document.querySelector('[data-outcome=changed]') && document.activeElement.classList.contains('scoped-genre-audit-toggle')"), true, "Space hides audit while retaining focus");
		await evaluate(connection, 'window.prepareScopedScreen("scope")');
		assert.equal(await evaluate(connection, "document.querySelector('.scoped-genre-chevron path').getAttribute('d')"), "m5 7 5 5 5-5", "Target collapsed chevron points down");
		await evaluate(connection, "document.querySelector('.scoped-genre-chevron').focus()");
		await key("Enter", "Enter", 13);
		assert.equal(await evaluate(connection, "document.activeElement.getAttribute('aria-expanded')"), "true", "Enter expands only");
		assert.equal(await evaluate(connection, "document.activeElement.querySelector('path').getAttribute('d')"), "m5 12 5-5 5 5", "Target expanded chevron points up");
		assert.equal(await evaluate(connection, "Boolean(document.querySelector('input[name=scoped-genre-target]:checked'))"), false);
		await key(" ", "Space", 32);
		assert.equal(await evaluate(connection, "document.activeElement.getAttribute('aria-expanded')"), "false", "Space collapses only");
		await key(" ", "Space", 32);
		assert.equal(await evaluate(connection, "(() => { const button = document.activeElement, r = button.getBoundingClientRect(); return r.width >= 44 && r.height >= 44 && button.getAttribute('aria-label').startsWith('Collapse Folders in Discover') && !!document.getElementById(button.getAttribute('aria-controls')); })()"), true, "Real 44px named disclosure controls existing region");
		await evaluate(connection, "document.querySelector('input[name=scoped-genre-target]').focus()");
		await key(" ", "Space", 32);
		assert.equal(await evaluate(connection, "document.activeElement.checked && !document.activeElement.indeterminate"), true, "Native checkbox Space selects");
		await key("Tab", "Tab", 9);
		assert.equal(await evaluate(connection, "document.activeElement.classList.contains('scoped-genre-chevron')"), true, "Tab from checkbox reaches sibling chevron");
		await key("Tab", "Tab", 9, 8);
		assert.equal(await evaluate(connection, "document.activeElement.name"), "scoped-genre-target", "Shift-Tab returns to checkbox");
		await evaluate(connection, "document.querySelector('[data-target-kind=folder] .scoped-genre-chevron').click()");
		const hierarchy = await evaluate(connection, "(() => { const row = kind => document.querySelector('[data-target-kind=' + kind + '] > .scoped-genre-exclusion-target-row'); const c = row('collection'), f = row('folder'), s = row('source'), label = c.querySelector('label'), button = c.querySelector('button'); return { collection: c.getBoundingClientRect().height, folder: f.getBoundingClientRect().height, source: s.getBoundingClientRect().height, sourceTarget: s.querySelector('label').getBoundingClientRect().height, sourceFont: getComputedStyle(s.querySelector('strong')).fontSize, bodyFont: getComputedStyle(document.querySelector('.scoped-genre-exclusion-body')).fontSize, sibling: label.nextElementSibling === button && !label.contains(button), joined: Math.abs(label.getBoundingClientRect().right - button.getBoundingClientRect().left) < 1, sharedSelected: c.dataset.selected === 'true' && c.dataset.selectionMode === 'multiple', noLeafDisclosure: !s.querySelector('button') }; })()");
		assert.ok(hierarchy.sibling && hierarchy.joined && hierarchy.sharedSelected && hierarchy.noLeafDisclosure, "One selected card with separate sibling controls and no leaf disclosure");
		assert.ok(hierarchy.sourceTarget >= 44 && hierarchy.source < hierarchy.collection * .8 && hierarchy.folder < hierarchy.collection, "Source and Folder rows are materially more compact than Collections");
		assert.equal(hierarchy.sourceFont, hierarchy.bodyFont, "Source compactness does not shrink text");
		exactKeyboard.at(-1).hierarchy = hierarchy;
		await evaluate(connection, "document.querySelector('[data-target-kind=source] input').focus()");
		await key(" ", "Space", 32);
		assert.equal(await evaluate(connection, "(() => { const c = document.querySelector('input[name=scoped-genre-target]'); return c.indeterminate && !c.checked && c.getAttribute('aria-checked') === 'mixed'; })()"), true, "Native mixed property is set after child subtraction");
		const ax = await connection.command("Accessibility.getFullAXTree");
		assert.ok(ax.nodes.some(node => node.role?.value === "checkbox" && node.name?.value.startsWith("Discover") && node.properties?.some(p => p.name === "checked" && p.value.value === "mixed")), "Browser accessibility tree exposes mixed checkbox");
		await evaluate(connection, "document.querySelector('input[name=scoped-genre-target]').focus()");
		assert.equal(await evaluate(connection, "getComputedStyle(document.activeElement.closest('label')).outlineStyle !== 'none'"), true, "Visible card focus");
		await key(" ", "Space", 32);
		assert.equal(await evaluate(connection, "document.activeElement.checked && !document.activeElement.indeterminate"), true, "Mixed Space selects full current branch");
		await key(" ", "Space", 32);
		assert.equal(await evaluate(connection, "document.activeElement.checked || document.activeElement.indeterminate"), false, "Checked Space clears branch");
		await key("Escape", "Escape", 27);
		await evaluate(connection, "window.scopedReturn()");
		await evaluate(connection, "window.scopedClose()");
		assert.equal(await evaluate(connection, "window.scopedHistoryCase()"), true);
	}
	const longNames = [];
	for (const width of [360, 384, 393, 402, 412, 1280]) {
		await viewport(width, 900);
		for (const screen of ["scope-expanded", "review", "inline"]) {
			longNames.push(await evaluate(connection, `window.prepareScopedScreen("${screen}", true, true)`));
			await capture(`${width}-enlarged-long-${screen}`);
		}
		await evaluate(connection, "window.scopedClippedFocus()"); await key("Tab", "Tab", 9);
		assert.equal(await evaluate(connection, "window.scopedCheckClippedFocus()"), true);
	}
	const keyboard = [];
	await viewport(393, 852);
	for (const screen of ["scope", "genres", "review"]) {
		await evaluate(connection, `window.prepareScopedScreen("${screen}")`);
		if (screen === "scope") await evaluate(connection, "document.querySelector('.scoped-genre-exclusion-search input').focus()");
		for (const [height, top] of [[460, 0], [320, 42], [500, 18]]) keyboard.push(await evaluate(connection, `window.scopedViewport(${height}, ${top})`));
		await evaluate(connection, "window.scopedRestoreViewport()");
	}
	await evaluate(connection, 'window.prepareScopedScreen("genres")');
	for (const width of [899, 900, 901, 393]) {
		await viewport(width, 852); await evaluate(connection, 'window.scopedMeasure("breakpoint")');
	}
	await key("Escape", "Escape", 27); await evaluate(connection, "window.scopedReturn()");
	await evaluate(connection, "window.scopedClose()");
	const errors = await evaluate(connection, "window.__mountedErrors");
	assert.deepEqual(errors, [], "No mounted errors");
	await connection.command("Emulation.setFocusEmulationEnabled", { enabled: false });
	if (directory) await fs.writeFile(path.join(directory, "measurements.json"), JSON.stringify({ local, layouts, longNames, keyboard, exactKeyboard, extraReviews, errors }, null, 2) + "\n");
	return { local, layouts, longNames, keyboard, exactKeyboard, extraReviews, errors };
}
