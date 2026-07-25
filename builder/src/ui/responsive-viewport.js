import { useEffect, useState } from "react";

export const BUILDER_DESKTOP_BREAKPOINT_PX = 900;
export const BUILDER_DESKTOP_MEDIA_QUERY = `(min-width: ${BUILDER_DESKTOP_BREAKPOINT_PX}px)`;
export const BUILDER_REDUCED_MOTION_MEDIA_QUERY = "(prefers-reduced-motion: reduce)";

function browserMatchMedia() {
	return typeof window !== "undefined" && typeof window.matchMedia === "function"
		? window.matchMedia.bind(window)
		: null;
}

export function matchesBuilderDesktopViewport(matchMedia = browserMatchMedia()) {
	return typeof matchMedia !== "function"
		? true
		: Boolean(matchMedia(BUILDER_DESKTOP_MEDIA_QUERY).matches);
}

export function builderCardScrollBehavior(matchMedia = browserMatchMedia()) {
	return typeof matchMedia === "function"
		&& matchMedia(BUILDER_REDUCED_MOTION_MEDIA_QUERY).matches
		? "auto"
		: "smooth";
}

export function useBuilderDesktopViewport() {
	const [desktopViewport, setDesktopViewport] = useState(() => matchesBuilderDesktopViewport());

	useEffect(() => {
		const matchMedia = browserMatchMedia();
		if (matchMedia === null) return undefined;

		const mediaQuery = matchMedia(BUILDER_DESKTOP_MEDIA_QUERY);
		const updateViewport = () => setDesktopViewport(Boolean(mediaQuery.matches));
		updateViewport();

		if (typeof mediaQuery.addEventListener === "function") {
			mediaQuery.addEventListener("change", updateViewport);
			return () => mediaQuery.removeEventListener("change", updateViewport);
		}

		mediaQuery.addListener?.(updateViewport);
		return () => mediaQuery.removeListener?.(updateViewport);
	}, []);

	return desktopViewport;
}
