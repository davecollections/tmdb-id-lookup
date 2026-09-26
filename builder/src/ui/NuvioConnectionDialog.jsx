import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { lockAddSourceDocumentBody, observeAddSourceViewport, resolveAddSourceViewportStyle } from "./add-source-modal-lifecycle.js";
import { focusElementWithoutScroll } from "./hierarchy-menu-placement.js";
import { handleDialogKeyDown } from "./modal-focus.js";
import { useCollectionImportReview } from "./use-collection-import-review.js";
import { importNuvioSnapshot } from "./nuvio-import-actions.js";
import { CollectionImportReview, ImportCounts } from "./CollectionImportReview.jsx";
import { requireSameProfile } from "../nuvio-connection/profiles.js";
import { NuvioImportProgress, NuvioLoginForm, NuvioProfiles } from "./NuvioConnectionParts.jsx";
export { ProfilePin, NuvioImportProgress } from "./NuvioConnectionParts.jsx";
import { NuvioProfileAvatar } from "./NuvioProfileAvatar.jsx";
import "./nuvio-connection.css";

const useBeforePaint = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function NuvioConnectionDialog({ connection, controller, builderState, initialProfile, onClose, onImported }) {
	const state = useSyncExternalStore(connection.subscribe, connection.getState, connection.getState);
	const snapshot = state.snapshot;
	const [selected, setSelected] = useState(() => {
		try { return initialProfile ? requireSameProfile(state.profiles, initialProfile, { protection: false }).id : ""; } catch { return ""; }
	});
	const [viewport, setViewport] = useState(() => typeof window === "undefined" ? null : resolveAddSourceViewportStyle(window));
	const dialog = useRef(null);
	const heading = useRef(null);
	const scroll = useRef(null);
	const errorRef = useRef(null);
	const id = useId();
	const review = useCollectionImportReview({ controller, builderState, snapshot,
		applySnapshot: (options) => importNuvioSnapshot({ connection, ...options }),
		onImported: () => onImported(`${snapshot.counts.collections} ${snapshot.counts.collections === 1 ? "Collection" : "Collections"} imported from ${snapshot.profile.name}.`),
	});
	const { confirmation, setConfirmation, error, setError, importDisabled, perform } = review;
	const expired = state.status === "expired";
	const login = !snapshot && ["disconnected", "connecting", "expired"].includes(state.status);
	const step = snapshot ? 3 : login ? 1 : 2;
	const selectedProfile = state.profiles.find((profile) => profile.id === selected);
	const canLoad = selectedProfile && connection.getProfileAccess(selected).unlocked;

	useBeforePaint(() => {
		const unlock = lockAddSourceDocumentBody();
		const stop = observeAddSourceViewport(setViewport);
		focusElementWithoutScroll(heading.current);
		return () => { stop(); unlock(); };
	}, []);
	useBeforePaint(() => {
		if (scroll.current) scroll.current.scrollTop = 0;
		focusElementWithoutScroll(heading.current);
	}, [step, confirmation]);
	useEffect(() => { setSelected((current) => state.profiles.some((profile) => profile.id === current) ? current : ""); }, [state.profiles]);
	useEffect(() => { if (error || state.error) focusElementWithoutScroll(errorRef.current); }, [error, state.error]);

	function backToProfiles() { setConfirmation(false); setError(null); connection.cancelReview(); }

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
						<ImportCounts counts={snapshot.counts} />
						<p className="nuvio-muted">{snapshot.updatedAt ? <>Last updated in Nuvio: <time dateTime={snapshot.updatedAt}>{new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(snapshot.updatedAt)).replace(/\s+/g, " ").replace(/AM|PM/g, (period) => period.toLowerCase())}</time></> : "Nuvio update time unavailable."}</p>
						{snapshot.kind === "empty" ? <p className="nuvio-notice">This profile has an empty Collections array. Nothing can be imported; your current work will stay as it is.</p> : null}
					</>}
					{snapshot.kind === "ready" ? <>
						<p className="nuvio-muted">This is a local snapshot. Importing will not change Nuvio.</p>
						<CollectionImportReview id={id} snapshot={snapshot} review={review} currentCollectionCount={builderState.project.collections.length} />
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
