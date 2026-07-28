export const HIERARCHY_MENU_VIEWPORT_MARGIN_PX = 10;
export const HIERARCHY_MENU_TRIGGER_GAP_PX = 4;

function finiteNumber(value, fallback = 0) {
	return Number.isFinite(value) ? value : fallback;
}

function positiveNumber(value, fallback = 0) {
	return Number.isFinite(value) && value > 0 ? value : fallback;
}

function clamp(value, minimum, maximum) {
	if (maximum < minimum) return minimum;
	return Math.min(Math.max(value, minimum), maximum);
}

/**
 * Resolves the browser area that is actually visible to the user. On mobile,
 * this excludes browser chrome that reduces the Visual Viewport without
 * changing the larger layout viewport.
 */
export function resolveVisibleViewport(view = globalThis.window) {
	const visualViewport = view?.visualViewport;
	const fallbackWidth = positiveNumber(view?.innerWidth);
	const fallbackHeight = positiveNumber(view?.innerHeight);
	const useVisualViewport = (
		positiveNumber(visualViewport?.width) > 0
		&& positiveNumber(visualViewport?.height) > 0
	);
	const left = useVisualViewport
		? finiteNumber(visualViewport.offsetLeft)
		: 0;
	const top = useVisualViewport
		? finiteNumber(visualViewport.offsetTop)
		: 0;
	const width = useVisualViewport
		? positiveNumber(visualViewport.width, fallbackWidth)
		: fallbackWidth;
	const height = useVisualViewport
		? positiveNumber(visualViewport.height, fallbackHeight)
		: fallbackHeight;

	return {
		left,
		top,
		width,
		height,
		right: left + width,
		bottom: top + height,
		source: useVisualViewport ? "visualViewport" : "layoutViewport",
	};
}

/**
 * Places a fixed menu beside its trigger while keeping the complete menu
 * inside the currently visible viewport wherever its dimensions allow.
 */
export function placeAnchoredMenu(
	triggerRect,
	menuSize,
	viewport,
	margin = HIERARCHY_MENU_VIEWPORT_MARGIN_PX,
	gap = HIERARCHY_MENU_TRIGGER_GAP_PX,
) {
	const safeMargin = Math.max(0, finiteNumber(margin));
	const safeGap = Math.max(0, finiteNumber(gap));
	const menuWidth = Math.max(0, finiteNumber(menuSize?.width));
	const menuHeight = Math.max(0, finiteNumber(menuSize?.height));
	const viewportLeft = finiteNumber(viewport?.left);
	const viewportTop = finiteNumber(viewport?.top);
	const viewportWidth = Math.max(0, finiteNumber(viewport?.width));
	const viewportHeight = Math.max(0, finiteNumber(viewport?.height));
	const viewportRight = finiteNumber(
		viewport?.right,
		viewportLeft + viewportWidth,
	);
	const viewportBottom = finiteNumber(
		viewport?.bottom,
		viewportTop + viewportHeight,
	);
	const triggerLeft = finiteNumber(triggerRect?.left);
	const triggerRight = finiteNumber(triggerRect?.right, triggerLeft);
	const triggerTop = finiteNumber(triggerRect?.top);
	const triggerBottom = finiteNumber(triggerRect?.bottom, triggerTop);
	const minimumTop = viewportTop + safeMargin;
	const maximumTop = viewportBottom - safeMargin - menuHeight;
	const minimumLeft = viewportLeft + safeMargin;
	const maximumLeft = viewportRight - safeMargin - menuWidth;
	const roomBelow = viewportBottom - safeMargin - triggerBottom - safeGap;
	const roomAbove = triggerTop - safeGap - minimumTop;
	const fitsBelow = menuHeight <= roomBelow;
	const fitsAbove = menuHeight <= roomAbove;
	const verticalPlacement = fitsBelow || (!fitsAbove && roomBelow >= roomAbove)
		? "below"
		: "above";
	const desiredTop = verticalPlacement === "below"
		? triggerBottom + safeGap
		: triggerTop - safeGap - menuHeight;
	const desiredLeft = triggerRight - menuWidth;

	return {
		top: clamp(desiredTop, minimumTop, maximumTop),
		left: clamp(desiredLeft, minimumLeft, maximumLeft),
		verticalPlacement,
		roomAbove,
		roomBelow,
	};
}

export function focusElementWithoutScroll(element) {
	if (!element?.focus) return false;
	try {
		element.focus({ preventScroll: true });
	} catch {
		element.focus();
	}
	return true;
}
