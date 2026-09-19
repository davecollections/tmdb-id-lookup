import { useEffect, useState } from "react";
import { focusElementWithoutScroll } from "./hierarchy-menu-placement.js";
import { builderCardScrollBehavior } from "./responsive-viewport.js";

export function WorkspaceBackToTop({ headingRef, disabled = false }) {
	const [visible, setVisible] = useState(false);

	useEffect(() => {
		const updateVisibility = () => setVisible(window.scrollY >= window.innerHeight);
		updateVisibility();
		window.addEventListener("scroll", updateVisibility, { passive: true });
		window.addEventListener("resize", updateVisibility);
		return () => {
			window.removeEventListener("scroll", updateVisibility);
			window.removeEventListener("resize", updateVisibility);
		};
	}, []);

	if (!visible) return null;

	return (
		<button
			className="workspace-back-to-top"
			type="button"
			aria-label="Back to top"
			disabled={disabled}
			onClick={() => {
				// Move focus before the scrolling button disappears, without jumping.
				focusElementWithoutScroll(headingRef.current);
				window.scrollTo({ top: 0, behavior: builderCardScrollBehavior() });
			}}
		>
			<span aria-hidden="true">↑</span> Top
		</button>
	);
}
