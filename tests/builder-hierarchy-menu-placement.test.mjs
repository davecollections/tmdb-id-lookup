import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "../builder/node_modules/vite/dist/node/index.js";
import {
	HIERARCHY_MENU_VIEWPORT_MARGIN_PX,
	focusElementWithoutScroll,
	placeAnchoredMenu,
	resolveVisibleViewport,
} from "../builder/src/ui/hierarchy-menu-placement.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vite = await createServer({
	root: path.join(rootDir, "builder"),
	appType: "custom",
	logLevel: "silent",
	server: { middlewareMode: true },
});
const {
	handleHierarchyMenuKeyDown,
} = await vite.ssrLoadModule("/src/ui/HierarchyActionsMenu.jsx");
after(() => vite.close());

function read(relativePath) {
	return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function assertMenuInsideViewport(placement, menuSize, viewport, margin = 10) {
	assert.ok(placement.top >= viewport.top + margin);
	assert.ok(placement.left >= viewport.left + margin);
	assert.ok(placement.top + menuSize.height <= viewport.bottom - margin);
	assert.ok(placement.left + menuSize.width <= viewport.right - margin);
}

function keyboardEvent(key, { shiftKey = false } = {}) {
	const calls = [];
	return {
		key,
		shiftKey,
		calls,
		preventDefault() {
			calls.push("preventDefault");
		},
		stopPropagation() {
			calls.push("stopPropagation");
		},
	};
}

function keyboardMenu(labels) {
	let activeElement = null;
	const focusLog = [];
	const items = labels.map((label) => ({
		label,
		disabled: false,
		focus() {
			activeElement = this;
			focusLog.push(label);
		},
	}));
	return {
		panel: {
			querySelectorAll() {
				return items;
			},
		},
		items,
		focusLog,
		getActiveElement() {
			return activeElement;
		},
		setActiveElement(item) {
			activeElement = item;
		},
	};
}

test("visible viewport honours visualViewport offsets, dimensions, and mobile browser chrome", () => {
	const viewport = resolveVisibleViewport({
		innerWidth: 900,
		innerHeight: 1000,
		visualViewport: {
			offsetTop: 72,
			offsetLeft: 18,
			width: 375,
			height: 610,
		},
	});

	assert.deepEqual(viewport, {
		left: 18,
		top: 72,
		width: 375,
		height: 610,
		right: 393,
		bottom: 682,
		source: "visualViewport",
	});
});

test("visible viewport safely falls back to innerWidth and innerHeight", () => {
	assert.deepEqual(resolveVisibleViewport({
		innerWidth: 1280,
		innerHeight: 720,
	}), {
		left: 0,
		top: 0,
		width: 1280,
		height: 720,
		right: 1280,
		bottom: 720,
		source: "layoutViewport",
	});
	assert.equal(resolveVisibleViewport({
		innerWidth: 412,
		innerHeight: 800,
		visualViewport: { width: 0, height: 0 },
	}).source, "layoutViewport");
});

test("complete two-item menu opens below when its full height fits", () => {
	const viewport = {
		left: 0,
		top: 0,
		width: 390,
		height: 800,
		right: 390,
		bottom: 800,
	};
	const menuSize = { width: 156, height: 104 };
	const placement = placeAnchoredMenu(
		{ left: 334, right: 380, top: 100, bottom: 146 },
		menuSize,
		viewport,
	);

	assert.equal(placement.verticalPlacement, "below");
	assert.equal(placement.top, 150);
	assert.equal(placement.left, 224);
	assertMenuInsideViewport(placement, menuSize, viewport);
});

test("second-last-card menu flips above before Delete can be cut off", () => {
	const viewport = {
		left: 0,
		top: 0,
		width: 393,
		height: 700,
		right: 393,
		bottom: 700,
	};
	const menuSize = { width: 156, height: 104 };
	const placement = placeAnchoredMenu(
		{ left: 337, right: 383, top: 570, bottom: 616 },
		menuSize,
		viewport,
	);

	assert.equal(placement.verticalPlacement, "above");
	assert.equal(placement.top, 462);
	assertMenuInsideViewport(placement, menuSize, viewport);
	assert.ok(placement.top + menuSize.height < 570, "Delete remains above the trigger");
});

test("final-card menu stays fully visible without any scrolling side effect", () => {
	const viewport = {
		left: 0,
		top: 120,
		width: 402,
		height: 520,
		right: 402,
		bottom: 640,
	};
	const menuSize = { width: 156, height: 104 };
	const scrollPosition = { x: 0, y: 912 };
	const placement = placeAnchoredMenu(
		{ left: 346, right: 392, top: 584, bottom: 630 },
		menuSize,
		viewport,
	);

	assert.equal(placement.verticalPlacement, "above");
	assertMenuInsideViewport(placement, menuSize, viewport);
	assert.deepEqual(scrollPosition, { x: 0, y: 912 });
});

test("horizontal placement clamps both edges and preserves the viewport margin", () => {
	const viewport = {
		left: 24,
		top: 40,
		width: 360,
		height: 600,
		right: 384,
		bottom: 640,
	};
	const menuSize = { width: 156, height: 104 };
	const leftPlacement = placeAnchoredMenu(
		{ left: 24, right: 50, top: 100, bottom: 146 },
		menuSize,
		viewport,
	);
	const rightPlacement = placeAnchoredMenu(
		{ left: 372, right: 418, top: 100, bottom: 146 },
		menuSize,
		viewport,
	);

	assert.equal(leftPlacement.left, 34);
	assert.equal(rightPlacement.left, 218);
	assertMenuInsideViewport(leftPlacement, menuSize, viewport);
	assertMenuInsideViewport(rightPlacement, menuSize, viewport);
});

test("visual viewport height flips a menu that the layout viewport would place below", () => {
	const view = {
		innerWidth: 393,
		innerHeight: 900,
		visualViewport: {
			offsetTop: 80,
			offsetLeft: 0,
			width: 393,
			height: 500,
		},
	};
	const triggerRect = { left: 337, right: 383, top: 500, bottom: 546 };
	const menuSize = { width: 156, height: 104 };
	const visiblePlacement = placeAnchoredMenu(
		triggerRect,
		menuSize,
		resolveVisibleViewport(view),
	);
	const layoutPlacement = placeAnchoredMenu(
		triggerRect,
		menuSize,
		resolveVisibleViewport({
			innerWidth: view.innerWidth,
			innerHeight: view.innerHeight,
		}),
	);

	assert.equal(visiblePlacement.verticalPlacement, "above");
	assert.equal(layoutPlacement.verticalPlacement, "below");
	assertMenuInsideViewport(
		visiblePlacement,
		menuSize,
		resolveVisibleViewport(view),
	);
});

test("when neither direction is ideal, the roomier direction is clamped inside the viewport", () => {
	const viewport = {
		left: 0,
		top: 0,
		width: 360,
		height: 140,
		right: 360,
		bottom: 140,
	};
	const menuSize = { width: 156, height: 104 };
	const placement = placeAnchoredMenu(
		{ left: 304, right: 350, top: 60, bottom: 80 },
		menuSize,
		viewport,
	);

	assert.equal(placement.verticalPlacement, "below");
	assert.equal(placement.top, 26);
	assertMenuInsideViewport(placement, menuSize, viewport);
});

test("one-item source menus use the same geometry and stay within visible bounds", () => {
	const viewport = {
		left: 0,
		top: 64,
		width: 412,
		height: 520,
		right: 412,
		bottom: 584,
	};
	const menuSize = { width: 156, height: 54 };
	const placement = placeAnchoredMenu(
		{ left: 356, right: 402, top: 530, bottom: 576 },
		menuSize,
		viewport,
	);

	assert.equal(placement.verticalPlacement, "above");
	assertMenuInsideViewport(placement, menuSize, viewport);
});

test("initial focus explicitly requests preventScroll and has a safe legacy fallback", () => {
	const calls = [];
	assert.equal(focusElementWithoutScroll({
		focus(options) {
			calls.push(options);
		},
	}), true);
	assert.deepEqual(calls, [{ preventScroll: true }]);

	let fallbackCalls = 0;
	assert.equal(focusElementWithoutScroll({
		focus(options) {
			fallbackCalls += 1;
			if (options) throw new TypeError("legacy focus");
		},
	}), true);
	assert.equal(fallbackCalls, 2);
	assert.equal(focusElementWithoutScroll(null), false);
});

test("Tab and Shift+Tab close the active menu and request safe trigger restoration", () => {
	for (const shiftKey of [false, true]) {
		const menu = keyboardMenu(["Edit", "Delete"]);
		menu.setActiveElement(menu.items[shiftKey ? 1 : 0]);
		const event = keyboardEvent("Tab", { shiftKey });
		const closeCalls = [];
		let actionsMenuInternalId = "collection-1";
		const scrollPosition = { x: 0, y: 438 };
		const result = handleHierarchyMenuKeyDown(
			event,
			menu.panel,
			(options) => {
				closeCalls.push(options);
				actionsMenuInternalId = null;
			},
			menu.getActiveElement(),
		);

		assert.equal(result, shiftKey ? "closed-shift-tab" : "closed-tab");
		assert.deepEqual(event.calls, ["preventDefault", "stopPropagation"]);
		assert.deepEqual(closeCalls, [{ restoreFocus: true }]);
		assert.equal(actionsMenuInternalId, null);
		assert.deepEqual(scrollPosition, { x: 0, y: 438 });
	}
});

test("Escape still closes and arrow keys still wrap through enabled menu items", () => {
	const menu = keyboardMenu(["Edit", "Delete"]);
	const closeCalls = [];
	menu.setActiveElement(menu.items[0]);

	const arrowUp = keyboardEvent("ArrowUp");
	assert.equal(handleHierarchyMenuKeyDown(
		arrowUp,
		menu.panel,
		(options) => closeCalls.push(options),
		menu.getActiveElement(),
	), "moved");
	assert.equal(menu.getActiveElement(), menu.items[1]);

	const arrowDown = keyboardEvent("ArrowDown");
	assert.equal(handleHierarchyMenuKeyDown(
		arrowDown,
		menu.panel,
		(options) => closeCalls.push(options),
		menu.getActiveElement(),
	), "moved");
	assert.equal(menu.getActiveElement(), menu.items[0]);
	assert.deepEqual(menu.focusLog, ["Delete", "Edit"]);

	const escape = keyboardEvent("Escape");
	assert.equal(handleHierarchyMenuKeyDown(
		escape,
		menu.panel,
		(options) => closeCalls.push(options),
		menu.getActiveElement(),
	), "closed-escape");
	assert.deepEqual(escape.calls, ["preventDefault", "stopPropagation"]);
	assert.deepEqual(closeCalls, [{ restoreFocus: true }]);
});

test("menu component keeps shared actions programmatic, clickable, and viewport-aware", () => {
	const menu = read("builder/src/ui/HierarchyActionsMenu.jsx");
	const workspace = read("builder/src/ui/BuilderWorkspace.jsx");
	const styles = read("builder/src/styles.css");
	const placementIndex = menu.indexOf("setPlacement(placeAnchoredMenu(");
	const focusIndex = menu.indexOf("focusElementWithoutScroll(menuItems(panelRef.current)[0])");

	assert.ok(placementIndex >= 0);
	assert.ok(focusIndex > placementIndex);
	assert.match(menu, /createPortal\(panel,\s*document\.body\)/);
	assert.match(menu, /resolveVisibleViewport\(\)/);
	assert.match(menu, /window\.visualViewport\?\.addEventListener\(\s*"resize"/);
	assert.match(menu, /window\.visualViewport\?\.addEventListener\(\s*"scroll"/);
	assert.match(menu, /document\.addEventListener\("pointerdown"/);
	assert.match(menu, /event\.key === "Escape"/);
	assert.equal((menu.match(/tabIndex=\{-1\}/g) ?? []).length, 2);
	assert.match(menu, /onClick=\{\(\) => runAction\(onEdit\)\}/);
	assert.match(menu, /onClick=\{\(\) => runAction\(onDelete\)\}/);
	assert.doesNotMatch(menu, /scrollIntoView/);
	assert.match(workspace, /<HierarchyActionsMenu[\s\S]*noun=\{noun\}/);
	assert.match(workspace, /<HierarchyActionsMenu[\s\S]*noun="source"/);
	assert.match(styles, /\.hierarchy-actions-menu\s*\{[\s\S]*position:\s*fixed[\s\S]*z-index:\s*900/);
	assert.equal(HIERARCHY_MENU_VIEWPORT_MARGIN_PX, 10);
});
