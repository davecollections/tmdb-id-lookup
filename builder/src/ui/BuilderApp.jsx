import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { BuilderWelcome } from "./BuilderWelcome.jsx";
import { BuilderWorkspace } from "./BuilderWorkspace.jsx";
import { useBuilderControllerState } from "./use-builder-controller.js";
import { createNuvioConnection } from "../nuvio-connection/session.js";
import { NuvioConnectionDialog } from "./NuvioConnectionDialog.jsx";
import { focusElementWithoutScroll } from "./hierarchy-menu-placement.js";

export function BuilderApp({ controller, initialScreen = "welcome", nuvioConnection }) {
	const state = useBuilderControllerState(controller);
	const [screen, setScreen] = useState(initialScreen === "workspace" ? "workspace" : "welcome");
	const [connection] = useState(() => nuvioConnection ?? createNuvioConnection());
	const [nuvioOpen, setNuvioOpen] = useState(false);
	const [importStatus, setImportStatus] = useState(null);
	useEffect(() => {
		if (importStatus && importStatus.project !== state.project) setImportStatus(null);
	}, [state.project, importStatus]);
	const returnFocus = useRef(null);
	const restoreFocus = useRef(false);
	useEffect(() => {
		const check = () => connection.checkExpiry();
		window.addEventListener("focus", check);
		return () => { window.removeEventListener("focus", check); if (!nuvioConnection) connection.dispose(); };
	}, [connection, nuvioConnection]);
	const useBeforePaint = typeof window === "undefined" ? useEffect : useLayoutEffect;
	useBeforePaint(() => {
		if (nuvioOpen || !restoreFocus.current) return;
		restoreFocus.current = false;
		focusElementWithoutScroll(returnFocus.current?.isConnected ? returnFocus.current : document.querySelector("[data-builder-shell] .builder-product-title"));
	}, [nuvioOpen, screen]);
	function openNuvio(event) { returnFocus.current = event.currentTarget; connection.checkExpiry(); setNuvioOpen(true); }
	function closeNuvio() { connection.cancelReview(); restoreFocus.current = true; setNuvioOpen(false); }
	function imported(message) { returnFocus.current = null; setImportStatus({ message, project: controller.getState().project }); setScreen("workspace"); closeNuvio(); }

	return <>{screen === "workspace"
		? <BuilderWorkspace key={state.project.internalId} controller={controller} state={state} onReturnHome={() => { setImportStatus(null); setScreen("welcome"); }} onOpenNuvio={openNuvio} nuvioOpen={nuvioOpen} nuvioImportStatus={importStatus?.project === state.project ? importStatus.message : ""} />
		: (
			<BuilderWelcome
				controller={controller}
				state={state}
				onOpenNuvio={openNuvio}
				nuvioOpen={nuvioOpen}
				onEnterWorkspace={() => setScreen("workspace")}
			/>
		)}{nuvioOpen ? <NuvioConnectionDialog connection={connection} controller={controller} builderState={state} onClose={closeNuvio} onImported={imported} /> : null}</>;
}
