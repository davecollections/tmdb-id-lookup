import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { lockAddSourceDocumentBody, observeAddSourceViewport, resolveAddSourceViewportStyle } from "./add-source-modal-lifecycle.js";
import { focusElementWithoutScroll } from "./hierarchy-menu-placement.js";
import { handleDialogKeyDown } from "./modal-focus.js";
import { createWelcomeActionGate } from "./welcome-action-coordinator.js";
import { importNuvioSnapshot } from "./nuvio-import-actions.js";
import { planCollectionMerge } from "../import/merge-collections.js";
import { requireSameProfile } from "../nuvio-connection/profiles.js";
import { NuvioImportProgress, NuvioLoginForm, NuvioProfiles } from "./NuvioConnectionParts.jsx";
export { ProfilePin, NuvioImportProgress } from "./NuvioConnectionParts.jsx";
import { NuvioProfileAvatar } from "./NuvioProfileAvatar.jsx";
import { ImportWarningSummary } from "./ImportWarningSummary.jsx";
import "./nuvio-connection.css";

const useBeforePaint = typeof window === "undefined" ? useEffect : useLayoutEffect;
const quantity = (count, label) => `${count} ${label}${count === 1 ? "" : "s"}`;

export function NuvioConnectionDialog({ connection, controller, builderState, initialProfile, onClose, onImported }) {
	const state = useSyncExternalStore(connection.subscribe, connection.getState, connection.getState);
	const snapshot = state.snapshot;
	const [selected, setSelected] = useState(() => {
		try { return initialProfile ? requireSameProfile(state.profiles, initialProfile, { protection: false }).id : ""; } catch { return ""; }
	});
	const [mode, setMode] = useState("");
	const [reviewProject, setReviewProject] = useState(null);
	const [confirmation, setConfirmation] = useState(null);
	const [error, setError] = useState(null);
	const [viewport, setViewport] = useState(() => typeof window === "undefined" ? null : resolveAddSourceViewportStyle(window));
	const dialog = useRef(null);
	const heading = useRef(null);
	const scroll = useRef(null);
	const errorRef = useRef(null);
	const gate = useRef(createWelcomeActionGate());
	const id = useId();
	const hasWork = builderState.project.collections.length > 0 || builderState.dirty;
	const currentCollectionCount = builderState.project.collections.length;
	const staleProject = snapshot && reviewProject !== builderState.project;
	const expired = state.status === "expired";
	const login = !snapshot && ["disconnected", "connecting", "expired"].includes(state.status);
	const step = snapshot ? 3 : login ? 1 : 2;
	const selectedProfile = state.profiles.find((profile) => profile.id === selected);
	const canLoad = selectedProfile && connection.getProfileAccess(selected).unlocked;
	const mergePreview = useMemo(() => mode === "merge" && snapshot?.kind === "ready" && reviewProject
		? planCollectionMerge(reviewProject, snapshot.collections) : null, [mode, snapshot, reviewProject]);
	const importDisabled = snapshot?.kind !== "ready" || staleProject || (hasWork && !mode) || (mergePreview && !mergePreview.ok);

	useBeforePaint(() => {
		const unlock = lockAddSourceDocumentBody();
		const stop = observeAddSourceViewport(setViewport);
		focusElementWithoutScroll(heading.current);
		return () => { stop(); unlock(); };
	}, []);
	useBeforePaint(() => {
		if (scroll.current) scroll.current.scrollTop = 0;
		focusElementWithoutScroll(heading.current);
	}, [step, confirmation !== null]);
	useEffect(() => {
		setReviewProject(controller.getState().project);
		setMode(""); setConfirmation(null); setError(null);
	}, [snapshot, controller]);
	useEffect(() => { setSelected((current) => state.profiles.some((profile) => profile.id === current) ? current : ""); }, [state.profiles]);
	useEffect(() => { if (error || state.error) focusElementWithoutScroll(errorRef.current); }, [error, state.error]);

	function perform(replaceConfirmed = false) {
		if (!gate.current.tryAcquire()) return;
		try {
			setError(null);
			if (hasWork && mode === "replace" && !replaceConfirmed) { setConfirmation(true); return; }
			const result = importNuvioSnapshot({ connection, controller, snapshot, project: reviewProject,
				mode: hasWork ? mode : "replace", replaceConfirmed });
			if (!result.ok) { setConfirmation(null); setError(result.message); return; }
			onImported(`${snapshot.counts.collections} ${snapshot.counts.collections === 1 ? "Collection" : "Collections"} imported from ${snapshot.profile.name}.`);
		} finally { gate.current.release(); }
	}
	function backToProfiles() { setConfirmation(null); setError(null); connection.cancelReview(); }

	return createPortal(<div className="nuvio-connection-backdrop" style={viewport ?? undefined} onMouseDown={(event) => {
		if (event.target === event.currentTarget) { event.preventDefault(); focusElementWithoutScroll(heading.current); }
	}}>
		<section className="nuvio-connection-dialog" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} data-nuvio-dialog ref={dialog}
			onKeyDown={(event) => handleDialogKeyDown(event.target === heading.current ? {
				key: event.key, shiftKey: event.shiftKey, target: dialog.current, preventDefault: () => event.preventDefault(),
			} : event, dialog.current, onClose, { includeControl: (element) => element.getClientRects().length > 0 })}>
			<header className="nuvio-dialog-header">{snapshot ? <button className="add-source-header-action" type="button" onClick={backToProfiles}><span aria-hidden="true">←</span> Back</button> : null}<div><p className="panel-kicker">Nuvio → Dingo</p><h2 id={`${id}-title`} ref={heading} tabIndex={-1}>{confirmation ? "Replace current project?" : "Import from Nuvio"}</h2></div><button className="add-source-header-action add-source-close-action" type="button" onClick={onClose} aria-label="Close Nuvio import">Close</button></header>
			<NuvioImportProgress step={step} />
			<div className="nuvio-dialog-content dingo-scrollbar" ref={scroll}>
				{state.account ? <div className="nuvio-account"><span>{state.account.email}</span></div> : null}
				{(error || state.error) ? <div className="nuvio-notice is-error" role="alert" tabIndex={-1} ref={errorRef}>{error ?? state.error.message}</div> : null}
				{expired ? <p className="nuvio-notice" role="status">Connection expired. {snapshot ? "Your reviewed Collections are still available to import. Log in again to load more data." : "Log in again to load your profiles and Collections."}</p> : null}
				{login ? <NuvioLoginForm connection={connection} id={id} busy={Boolean(state.busy)} onConnecting={() => setError(null)}
						description="Bring your saved Collections into Dingo to edit and organise them."
						notice="Your login details go directly to Nuvio and aren't saved by Dingo. Dingo keeps the connection only while this page is open, and your Nuvio Collections won't be changed." /> : null}
				{!login && !snapshot ? <div className="nuvio-profile-stage" aria-busy={Boolean(state.busy)}>
					<div className="nuvio-profile-heading"><h3>Choose a profile</h3><button className="secondary-action" type="button" disabled={Boolean(state.busy)} onClick={() => void connection.refreshProfiles()}>{state.busy === "profiles" ? "Refreshing…" : "Refresh profiles"}</button></div><p className="nuvio-muted">Load the Collections from a Nuvio profile.</p>
					<NuvioProfiles connection={connection} profiles={state.profiles} selected={selected} onSelect={(profileId) => { setSelected(profileId); setError(null); }} onVerified={(profileId) => { if (profileId === selected) void connection.pullProfile(profileId); }} busy={Boolean(state.busy)} feedback={state.pinFeedback} id={id} />
					{state.profiles.length === 0 && !state.error && !state.busy ? <p className="nuvio-notice">No profiles were returned. Create a profile in Nuvio, then refresh this list.</p> : null}

				</div> : null}
				{snapshot ? <div className="nuvio-review">
					<div className="nuvio-review-profile"><div className="nuvio-profile-identity"><NuvioProfileAvatar profile={snapshot.profile} /><div><h3>{snapshot.profile.name}</h3><span className="nuvio-muted">Profile {snapshot.profile.index}</span></div></div></div>
					{snapshot.kind === "missing" ? <p className="nuvio-notice">This profile has no stored Collections yet. Nothing can be imported.</p> : <>
						<dl className="nuvio-counts">{Object.entries(snapshot.counts).map(([label, count]) => <div key={label}><dt>{label[0].toUpperCase() + label.slice(1)}</dt><dd>{count}</dd></div>)}</dl>
						<p className="nuvio-muted">{snapshot.updatedAt ? <>Last updated in Nuvio: <time dateTime={snapshot.updatedAt}>{new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(snapshot.updatedAt)).replace(/\s+/g, " ").replace(/AM|PM/g, (period) => period.toLowerCase())}</time></> : "Nuvio update time unavailable."}</p>
						{snapshot.kind === "empty" ? <p className="nuvio-notice">This profile has an empty Collections array. Nothing can be imported; your current work will stay as it is.</p> : null}
					</>}
					{snapshot.kind === "ready" ? <>
						<p className="nuvio-muted">This is a local snapshot. Importing will not change Nuvio.</p>
						<ImportWarningSummary warnings={snapshot.warnings} limitedSourceCount={snapshot.limitedSourceCount} idsRepaired={mergePreview?.counts?.idsRepaired} />
						{staleProject ? <div className="nuvio-notice">Your Dingo project changed. <button type="button" onClick={() => { setReviewProject(builderState.project); setMode(""); setConfirmation(null); setError(null); }}>Review current project</button></div> : confirmation ? <div className="nuvio-notice nuvio-replace-confirmation">
							<h4>Replace all current work in Dingo</h4><p>Your {currentCollectionCount} {currentCollectionCount === 1 ? "Collection" : "Collections"} and any unfinished edits will be removed. Dingo will import {snapshot.counts.collections} {snapshot.counts.collections === 1 ? "Collection" : "Collections"} from {snapshot.profile.name}. This cannot be undone.</p>
							<div className="nuvio-actions"><button type="button" onClick={() => setConfirmation(null)}>Keep current work</button><button type="button" className="nuvio-danger" onClick={() => perform(true)}>Replace current project</button></div>
						</div> : hasWork ? <fieldset className="nuvio-choices nuvio-import-modes"><legend>How should this import affect your current work?</legend>
							{[["add", "Add as separate Collections", "Keep current work and append every Collection separately."], ["merge", "Merge exact matches", "Keep current settings and combine exact matches."], ["replace", "Replace current project", "Remove current work and import this snapshot."]].map(([value, title, description]) => <label className="nuvio-choice" data-selection-mode="single" data-selected={mode === value} key={value}><input className="visually-hidden choice-card-input" type="radio" name={`${id}-mode`} checked={mode === value} onChange={() => setMode(value)} /><span><strong>{title}</strong><small>{description}</small></span></label>)}
						</fieldset> : null}
						{mergePreview && !confirmation && !staleProject ? mergePreview.ok ? <section className="nuvio-merge-preview" aria-label="Merge preview" aria-live="polite"><h4>Merge preview</h4><p>Merge: {quantity(mergePreview.counts.collectionsMerged, "Collection")} · {quantity(mergePreview.counts.foldersMerged, "Folder")}</p><p>Skip: {quantity(mergePreview.counts.duplicateSourcesSkipped, "duplicate Source")}</p><p>Add: {quantity(mergePreview.counts.collectionsAdded, "Collection")} · {quantity(mergePreview.counts.foldersAdded, "Folder")} · {quantity(mergePreview.counts.sourcesAdded, "Source")}</p><p className="nuvio-muted">Only exact visible names are matched. Similar or hidden names stay separate.</p></section> : <p className="nuvio-notice is-error" role="alert">{mergePreview.errors[0]?.message}</p> : null}
					</> : null}
				</div> : null}
			</div>
			{!confirmation ? <footer className="nuvio-dialog-footer">
				{login ? <div className="nuvio-footer-actions"><button type="submit" form={`${id}-login`} className="nuvio-primary" disabled={Boolean(state.busy)}>{state.busy ? "Connecting…" : "Connect to Nuvio"}</button>{state.account ? <button className="secondary-action" type="button" onClick={() => { setError(null); connection.disconnect(); }}>Disconnect</button> : null}</div> : <div className="nuvio-footer-actions">
					{!snapshot ? <button type="button" className="nuvio-primary" disabled={!canLoad || Boolean(state.busy)} onClick={() => void connection.pullProfile(selected)}>{state.busy === "pull" ? "Loading Collections…" : "Load Collections"}</button> : <button type="button" className="nuvio-primary" disabled={importDisabled} onClick={() => perform()}>Import to Dingo</button>}
					<button className="secondary-action" type="button" onClick={() => { setError(null); connection.disconnect(); }}>Disconnect</button>
				</div>}
			</footer> : null}
		</section>
	</div>, document.body);
}
