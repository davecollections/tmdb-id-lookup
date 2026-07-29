import { resolveVisibleViewport } from "./hierarchy-menu-placement.js";

function finiteNumber(value) {
	return Number.isFinite(value) ? value : 0;
}

export function resolveAddSourceViewportStyle(view = globalThis.window) {
	const viewport = resolveVisibleViewport(view);
	return {
		top: `${viewport.top}px`,
		left: `${viewport.left}px`,
		width: `${viewport.width}px`,
		height: `${viewport.height}px`,
	};
}

export function observeAddSourceViewport(
	onChange,
	view = globalThis.window,
) {
	if (typeof onChange !== "function") {
		throw new TypeError("A viewport change callback is required.");
	}

	const update = () => onChange(resolveAddSourceViewportStyle(view));
	update();
	view?.addEventListener?.("resize", update, { passive: true });
	view?.visualViewport?.addEventListener?.("resize", update, { passive: true });
	view?.visualViewport?.addEventListener?.("scroll", update, { passive: true });

	return () => {
		view?.removeEventListener?.("resize", update);
		view?.visualViewport?.removeEventListener?.("resize", update);
		view?.visualViewport?.removeEventListener?.("scroll", update);
	};
}

export function lockAddSourceDocumentBody(
	documentValue = globalThis.document,
	view = globalThis.window,
) {
	const body = documentValue?.body;
	if (!body) return () => {};

	const originalStyle = body.getAttribute("style");
	const originalClass = body.getAttribute("class");
	const scrollX = finiteNumber(view?.scrollX);
	const scrollY = finiteNumber(view?.scrollY);

	body.classList.add("settings-modal-open");
	body.style.position = "fixed";
	body.style.top = `${-scrollY}px`;
	body.style.left = `${-scrollX}px`;
	body.style.right = "0";
	body.style.width = "100%";
	body.style.overflow = "hidden";
	body.style.overscrollBehavior = "none";

	let restored = false;
	return () => {
		if (restored) return;
		restored = true;
		if (originalStyle === null) body.removeAttribute("style");
		else body.setAttribute("style", originalStyle);
		if (originalClass === null) body.removeAttribute("class");
		else body.setAttribute("class", originalClass);
		view?.scrollTo?.(scrollX, scrollY);
	};
}
