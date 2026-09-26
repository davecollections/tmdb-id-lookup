import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createCollectionCreationSession, isUntouchedWelcomeCreation } from "./creation-session.js";
import { BuilderWelcome } from "./BuilderWelcome.jsx";
import { BuilderWorkspace } from "./BuilderWorkspace.jsx";
import { useBuilderControllerState } from "./use-builder-controller.js";
import { createNuvioConnection } from "../nuvio-connection/session.js";
import { requireSameProfile } from "../nuvio-connection/profiles.js";
import { NuvioConnectionDialog } from "./NuvioConnectionDialog.jsx";
import { focusElementWithoutScroll } from "./hierarchy-menu-placement.js";
import { createNuvioSendCoordinator } from "../nuvio-send/coordinator.js";
import { useNuvioSendState } from "./use-nuvio-send.js";
import { ExportCollectionsDialog } from "./ExportCollectionsDialog.jsx";
import { WorkspaceImportDialog } from "./WorkspaceImportDialog.jsx";

export function BuilderApp({ controller, initialScreen = "welcome", nuvioConnection }) {
	const state = useBuilderControllerState(controller);
	const [screen, setScreen] = useState(initialScreen === "workspace" ? "workspace" : "welcome");
	const [initialCreationSession, setInitialCreationSession] = useState(null);
	const restoreStartFocus = useRef(false);
	useEffect(() => {
		if (initialCreationSession && !isUntouchedWelcomeCreation(initialCreationSession, state)) {
			setInitialCreationSession(null);
		}
	}, [initialCreationSession, state]);
	const [connection] = useState(() => nuvioConnection ?? createNuvioConnection());
	const [nuvioOpen, setNuvioOpen] = useState(false);
	const [workspaceImportOpen, setWorkspaceImportOpen] = useState(false);
	const workspaceImportTrigger = useRef(null);
	const [nuvioImportTarget, setNuvioImportTarget] = useState(null);
	const [sendCoordinator, setSendCoordinator] = useState(null);
	const sendState = useNuvioSendState(sendCoordinator);
	const [sendStatusOpen, setSendStatusOpen] = useState(false);
	useEffect(() => {
		// Construct after commit: StrictMode replay disposes its first store and
		// creates a fresh live store, without leaking subscriptions during render.
		const coordinator = createNuvioSendCoordinator({ controller, connection });
		setSendCoordinator(coordinator);
		return () => coordinator.dispose();
	}, [controller, connection]);
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
		if (nuvioOpen || sendStatusOpen || !restoreFocus.current) return;
		restoreFocus.current = false;
		focusElementWithoutScroll(returnFocus.current?.isConnected ? returnFocus.current
			: returnFocus.current && returnFocus.current === workspaceImportTrigger.current
				? document.querySelector('[data-action="open-workspace-import"]')
				: document.querySelector("[data-builder-shell] .builder-product-title"));
	}, [nuvioOpen, sendStatusOpen, workspaceImportOpen, screen]);
	useBeforePaint(() => {
		if (screen !== "welcome" || !restoreStartFocus.current) return;
		restoreStartFocus.current = false;
		focusElementWithoutScroll(document.querySelector('[data-action="start-new-project"]'));
	}, [screen]);
	function enterWorkspace({ startCreation = false } = {}) {
		setInitialCreationSession(startCreation
			? createCollectionCreationSession(controller.getState(), { returnToWelcomeOnCancel: true })
			: null);
		setScreen("workspace");
	}
	function returnHome({ focusStart = false } = {}) {
		restoreStartFocus.current = focusStart;
		setInitialCreationSession(null);
		setImportStatus(null);
		setScreen("welcome");
	}
	function openNuvio(event) { returnFocus.current = event.currentTarget; setNuvioImportTarget(null); connection.checkExpiry(); setNuvioOpen(true); }
	function openWorkspaceImport(event) { workspaceImportTrigger.current = event.currentTarget; setWorkspaceImportOpen(true); }
	function closeWorkspaceImport() { returnFocus.current = workspaceImportTrigger.current; restoreFocus.current = true; setWorkspaceImportOpen(false); }
	function openMergeFromNuvio(profile, origin = returnFocus.current) {
		returnFocus.current = origin; restoreFocus.current = false;
		setSendStatusOpen(false); setNuvioImportTarget(profile); setNuvioOpen(true);
		connection.checkExpiry();
		// Enter the existing Import read/review path. No project application or
		// Send operation occurs here; changed authority returns to normal selection.
		try {
			const current = requireSameProfile(connection.getState().profiles, profile, { protection: false });
			if (connection.getProfileAccess(current.id).unlocked) void connection.pullProfile(current.id);
		} catch { /* The Import profile selector handles unavailable identities. */ }
	}
	function closeNuvio() { connection.cancelReview(); restoreFocus.current = true; setNuvioOpen(false); }
	function openSendStatus(event, view = "send") { returnFocus.current = event.currentTarget; setSendStatusOpen(view); }
	function closeSendStatus() { restoreFocus.current = true; setSendStatusOpen(false); }
	function imported(message) { returnFocus.current = workspaceImportOpen ? workspaceImportTrigger.current : null; setWorkspaceImportOpen(false); setImportStatus({ message, project: controller.getState().project }); enterWorkspace(); closeNuvio(); }

	return <>{screen === "workspace"
		? <BuilderWorkspace key={state.project.internalId} controller={controller} state={state} connection={connection} sendCoordinator={sendCoordinator} sendState={sendState} onOpenSendStatus={openSendStatus} onMergeFromNuvio={openMergeFromNuvio} initialCreationSession={isUntouchedWelcomeCreation(initialCreationSession, state) ? initialCreationSession : null} onReturnHome={returnHome} onOpenImport={openWorkspaceImport} nuvioOpen={nuvioOpen || sendStatusOpen || workspaceImportOpen} nuvioImportStatus={importStatus?.project === state.project ? importStatus.message : ""} />
		: (
			<BuilderWelcome
				controller={controller}
				state={state}
				onOpenNuvio={openNuvio}
				nuvioOpen={nuvioOpen || sendStatusOpen}
				sendState={sendState}
				onOpenSendStatus={openSendStatus}
				onEnterWorkspace={enterWorkspace}
			/>
		)}{workspaceImportOpen ? <WorkspaceImportDialog controller={controller} builderState={state} suspended={nuvioOpen} onOpenNuvio={openNuvio} onClose={closeWorkspaceImport} onImported={imported} /> : null}
		{nuvioOpen ? <NuvioConnectionDialog connection={connection} controller={controller} builderState={state} initialProfile={nuvioImportTarget} onClose={closeNuvio} onImported={imported} /> : null}
		{sendStatusOpen ? <ExportCollectionsDialog controller={controller} connection={connection} sendCoordinator={sendCoordinator} initialView={sendStatusOpen} onClose={closeSendStatus} onMergeInstead={openMergeFromNuvio} /> : null}</>;
}
