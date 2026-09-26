import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { lockAddSourceDocumentBody, observeAddSourceViewport, resolveAddSourceViewportStyle } from "./add-source-modal-lifecycle.js";
import { focusElementWithoutScroll } from "./hierarchy-menu-placement.js";
import { handleDialogKeyDown } from "./modal-focus.js";
import { NuvioImportFlow } from "./NuvioImportFlow.jsx";
export { ProfilePin, NuvioImportProgress } from "./NuvioConnectionParts.jsx";
import "./nuvio-connection.css";

const useBeforePaint = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function NuvioConnectionDialog({ connection, controller, builderState, initialProfile, onClose, onImported }) {
	const [viewport, setViewport] = useState(() => typeof window === "undefined" ? null : resolveAddSourceViewportStyle(window));
	const dialog = useRef(null);
	const heading = useRef(null);
	const scroll = useRef(null);
	useBeforePaint(() => {
		const unlock = lockAddSourceDocumentBody();
		const stop = observeAddSourceViewport(setViewport);
		focusElementWithoutScroll(heading.current);
		return () => { stop(); unlock(); };
	}, []);
	return createPortal(<NuvioImportFlow connection={connection} controller={controller} builderState={builderState} initialProfile={initialProfile} onImported={onImported} focusRef={heading} scrollRef={scroll}>
		{({ id, confirmation, backAction, progress, content, actions }) => <div className="nuvio-connection-backdrop" style={viewport ?? undefined} onMouseDown={(event) => {
			if (event.target === event.currentTarget) { event.preventDefault(); focusElementWithoutScroll(heading.current); }
		}}>
			<section className="nuvio-connection-dialog" role="dialog" aria-modal="true" aria-labelledby={id + "-title"} data-nuvio-dialog ref={dialog}
				onKeyDown={(event) => handleDialogKeyDown(event.target === heading.current ? {
					key: event.key, shiftKey: event.shiftKey, target: dialog.current, preventDefault: () => event.preventDefault(),
				} : event, dialog.current, onClose, { includeControl: (element) => element.getClientRects().length > 0 })}>
				<header className="nuvio-dialog-header">{backAction}<div><p className="panel-kicker">Nuvio → Dingo</p><h2 id={id + "-title"} ref={heading} tabIndex={-1}>{confirmation ? "Replace current project?" : "Import from Nuvio"}</h2></div><button className="add-source-header-action add-source-close-action" type="button" onClick={onClose} aria-label="Close Nuvio import">Close</button></header>
				{progress}
				<div className="nuvio-dialog-content dingo-scrollbar" ref={scroll}>{content}</div>
				{actions ? <footer className="nuvio-dialog-footer">{actions}</footer> : null}
			</section>
		</div>}
	</NuvioImportFlow>, document.body);
}
