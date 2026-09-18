import { createContext, useLayoutEffect, useRef } from "react";

export const PreviewScrollContext = createContext(null);

export function SourcePreviewContent({ children, resetKey }) {
	const body = useRef(null);
	const paging = useRef(null);
	const gesture = useRef({ armed: false, top: 0 });
	const context = useRef({ body, paging, gesture }).current;
	useLayoutEffect(() => {
		body.current.scrollTop = 0;
		gesture.current = { armed: false, top: 0 };
	}, [resetKey]);
	const arm = () => { gesture.current.armed = true; };
	return <PreviewScrollContext.Provider value={context}>
		<div ref={body} className="source-sort-preview-content dingo-scrollbar" tabIndex={0} aria-label="Preview titles and controls"
			onWheel={arm} onTouchMove={arm} onPointerDown={(event) => { if (event.target === event.currentTarget) arm(); }}
			onKeyDown={(event) => { if (event.target === event.currentTarget && ["ArrowDown", "PageDown", "End", " "].includes(event.key)) arm(); }}
			onScroll={(event) => {
				const element = event.currentTarget;
				const previous = gesture.current.top;
				gesture.current.top = element.scrollTop;
				const row = element.querySelector(".poster-only-preview-grid img")?.getBoundingClientRect().height ?? 120;
				if (gesture.current.armed && element.scrollTop > previous
					&& element.scrollHeight - element.clientHeight - element.scrollTop <= row) {
					gesture.current.armed = false;
					paging.current?.();
				}
			}}>{children}</div>
	</PreviewScrollContext.Provider>;
}
