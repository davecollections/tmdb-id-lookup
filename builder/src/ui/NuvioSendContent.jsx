import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { sameSendTarget } from "../nuvio-send/comparison.js";
import { prepareCurrentNuvioBackup } from "../nuvio-send/backup.js";
import { NuvioLoginForm, NuvioProfiles } from "./NuvioConnectionParts.jsx";
import { downloadCollectionsJson } from "./export-collections.js";
import { focusElementWithoutScroll } from "./hierarchy-menu-placement.js";
import { nodeTitle } from "./view-model.js";
import { sendInProgress, sendReviewGroups, sendRemovalCount, sendRemovalWarning, sendMergeHelp, reviewedSendIsIdentical, sendProblem, sendProgress, sendResult } from "./nuvio-send-presentation.js";
import "./nuvio-connection.css";
import "./nuvio-send.css";

const useBeforePaint = typeof window === "undefined" ? useEffect : useLayoutEffect;

function SendActivity() {
	return <span className="send-activity" aria-hidden="true"><span /><span /><span /></span>;
}

/** Contents only: Export owns the sole dialog, focus trap and body lock. */
export function NuvioSendContent({ connection, coordinator, attempt, onBack, onClose, onMergeInstead }) {
	const connectionState = useSyncExternalStore(connection.subscribe, connection.getState, connection.getState);
	const dispatched = attempt.dispatch.count > 0;
	const connected = connectionState.status === "connected";
	const [stage, setStage] = useState(dispatched ? "result" : connected ? "profiles" : "connect");
	const [recovering, setRecovering] = useState(false);
	const [backupFeedback, setBackupFeedback] = useState(null);
	const backup = useRef(null);
	const initialized = useRef(false);
	const heading = useRef(null);
	const scroll = useRef(null);
	const problem = useRef(null);
	const id = useId();
	const busy = Boolean(attempt.busy || connectionState.busy);
	const originalTarget = attempt.baseline?.profile ?? attempt.target;
	const matchingTarget = dispatched ? connectionState.profiles.find((profile) => sameSendTarget(profile, originalTarget)) : null;
	const selected = dispatched ? matchingTarget?.id ?? "" : attempt.target?.id ?? "";
	const canAccess = selected && connection.getProfileAccess(selected).unlocked;
	const view = dispatched && !recovering ? "result" : !connected ? "connect" : recovering ? "profiles" : stage;
	const progress = sendInProgress(attempt);
	const reviewed = !dispatched && view === "review" && ["REVIEWED", "NO_CHANGE"].includes(attempt.phase);
	const identical = reviewed && reviewedSendIsIdentical(attempt);
	const done = !busy && (identical || (view === "result" && (attempt.phase === "VERIFIED" || attempt.dispatch.kind === "rejected")));
	const removals = reviewed ? sendRemovalCount(attempt) : null;
	const failed = !dispatched && !attempt.busy && ["NOT_SENT", "STALE_LOCAL", "REMOTE_CHANGED"].includes(attempt.phase);
	const result = dispatched && !progress ? sendResult(attempt) : null;
	const title = progress ? sendProgress(attempt) : failed ? attempt.phase === "REMOTE_CHANGED" ? "Nuvio changed" : "Nothing was sent"
		: view === "connect" ? "Connect to Nuvio" : view === "profiles" ? recovering ? "Verify profile access" : "Select profile"
			: view === "review" ? identical ? "Already up to date" : "Replace Collections" : result?.title ?? "Send to Nuvio";

	useEffect(() => {
		if (initialized.current) return;
		initialized.current = true;
		if (!dispatched && connection.getState().status === "connected") void connection.refreshProfiles();
	}, [connection, dispatched]);
	useEffect(() => {
		if (!connected && !dispatched && stage !== "connect") setStage("connect");
		if (connected && stage === "connect") setStage("profiles");
		if (!dispatched && attempt.phase === "REVIEWED") setStage("review");
	}, [connected, stage, dispatched, attempt.phase]);
	useEffect(() => { backup.current = null; setBackupFeedback(null); }, [attempt.review]);
	useBeforePaint(() => {
		if (scroll.current) scroll.current.scrollTop = 0;
		focusElementWithoutScroll(heading.current);
	}, [view, progress, failed, attempt.phase === "VERIFIED"]);
	useEffect(() => { if (failed || (connectionState.error && view !== "result")) focusElementWithoutScroll(problem.current); }, [failed, attempt.error, connectionState.error, view]);

	function back() {
		if (sendInProgress(coordinator.getState(), connection.getState())) return;
		if (dispatched) { setRecovering(false); setStage("result"); return; }
		if (stage === "review" && !attempt.busy && attempt.target) {
			coordinator.selectProfile(attempt.target.id); setStage("profiles"); return;
		}
		coordinator.cancel(); connection.cancelReview(); onBack();
	}
	function checkAgain() {
		if (!connected || !canAccess) { setRecovering(true); setStage(connected ? "profiles" : "connect"); return; }
		setRecovering(false); setStage("result"); void coordinator.checkNuvioAgain();
	}
	function disconnect() {
		connection.disconnect();
		if (!dispatched) { setStage("connect"); coordinator.cancel(); }
	}
	function downloadBackup() {
		if (busy || !reviewed || coordinator.getState().review !== attempt.review) return;
		try {
			if (backup.current?.review !== attempt.review) backup.current = { review: attempt.review, descriptor: prepareCurrentNuvioBackup(attempt.review) };
			const { json, filename } = backup.current.descriptor;
			downloadCollectionsJson({ ok: true, json }, { filename });
			setBackupFeedback({ started: true, text: "Backup download started." });
		} catch { setBackupFeedback({ started: false, text: "Backup download could not start. Try again." }); }
	}
	function mergeInstead() {
		const current = coordinator.getState();
		if (current.busy || connection.getState().busy || current.phase !== "REVIEWED" || current.review !== attempt.review || !(sendRemovalCount(current) > 0)) return;
		const profile = current.review.profile;
		coordinator.cancel(); connection.cancelReview();
		onMergeInstead(profile);
	}

	return <>
		<header className={`nuvio-dialog-header${progress ? " send-progress-heading" : ""}`}>
			{!busy && !done && (!dispatched || recovering) ? <button type="button" className="add-source-header-action" onClick={back}><span aria-hidden="true">←</span> Back</button> : null}
			<div>{view === "review" && !progress && !failed ? <p className="panel-kicker">Send to Nuvio</p> : null}<h2 id="export-collections-title" ref={heading} tabIndex={-1}>{title}</h2></div>
			{!busy && !done ? <button type="button" className="add-source-header-action add-source-close-action" aria-label="Close Send to Nuvio" onClick={onClose}>Close</button> : null}
		</header>
		<div className="nuvio-dialog-content dingo-scrollbar" ref={scroll}>
			{connectionState.busy && !progress ? <div className="send-connection-activity">{connectionState.busy !== "pin" ? <span role="status">{sendProgress(attempt, connectionState)}</span> : null}<SendActivity /></div> : null}
			{failed ? <div className="nuvio-notice is-error" role="alert" ref={problem} tabIndex={-1}><p>{sendProblem(attempt)}</p>{attempt.errors?.length ? <ul>{attempt.errors.map((error, index) => <li key={index}>{error.message}</li>)}</ul> : null}</div>
				: connectionState.error && view !== "result" ? <p className="nuvio-notice is-error" role="alert" ref={problem} tabIndex={-1}>{connectionState.error.message}</p> : null}
			{view === "connect" && !progress ? <>
				{dispatched ? <p className="nuvio-muted">Reconnect to check the original profile. Nothing will be sent again.</p> : null}
				<NuvioLoginForm connection={connection} id={id} busy={busy} heading={false} notice="Your login goes directly to Nuvio and isn’t saved by Dingo." />
			</> : null}
			{view === "profiles" && !progress ? <div className="nuvio-profile-stage" aria-busy={busy}>
				<div className="send-profile-tools"><p className="nuvio-muted">{connectionState.account?.email}</p>{!busy ? <button type="button" className="secondary-action" onClick={disconnect}>Disconnect</button> : null}</div>
				<div className="nuvio-profile-heading"><p className="nuvio-muted">{recovering ? "Original Send profile" : "Choose the profile to replace."}</p><button type="button" className="secondary-action" disabled={busy} onClick={() => void connection.refreshProfiles()}>{connectionState.busy === "profiles" ? "Refreshing…" : "Refresh profiles"}</button></div>
				<NuvioProfiles connection={connection} profiles={recovering ? matchingTarget ? [matchingTarget] : [] : connectionState.profiles}
					selected={selected} onSelect={(profileId) => { if (!dispatched) coordinator.selectProfile(profileId); }} onVerified={(profileId) => { if (profileId === selected) recovering ? checkAgain() : void coordinator.review(); }} busy={busy} feedback={connectionState.pinFeedback} id={id} />
				{recovering && !matchingTarget ? <p className="nuvio-notice">This account doesn’t have the original profile. Connect to its account.</p> : !connectionState.profiles.length && !busy ? <p className="nuvio-notice">No profiles found. Create one in Nuvio, then refresh.</p> : null}
			</div> : null}
			{progress ? <div className="send-progress" role="status" aria-live="polite" aria-busy="true"><span className="visually-hidden">{sendProgress(attempt)}</span><p>{originalTarget ? `${attempt.phase === "DISPATCHING" ? "Replacing the Collections on" : attempt.phase === "VERIFYING" ? "Confirming the Collections on" : "Checking the Collections on"} ‘${originalTarget.name}’.` : "Preparing your Collections for Nuvio."}</p><SendActivity /></div> : null}
			{reviewed && !progress ? <>
				<p className="send-target"><strong>{attempt.review.profile.name}</strong> · Profile {attempt.review.profile.index}{attempt.review.profile.protection === "pin" ? " · PIN verified" : ""}</p>
				{identical ? <p role="status">This profile already matches your Dingo project. Nothing needs replacing.</p> : <>
					<div className="send-comparison">{sendReviewGroups(attempt).map(({ label, counts }, index) => <section key={label} aria-label={label} data-send-comparison={index ? "proposed" : "current"}><h3>{label}</h3><div className="decades-plan-totals send-comparison-totals">{["collections", "folders", "sources"].map((category) => <div key={category}><strong data-send-count={category}>{counts[category].toLocaleString("en-AU")}</strong><span>{category[0].toUpperCase() + category.slice(1)}</span></div>)}</div></section>)}</div>
					<details className="send-review-details"><summary tabIndex={0}>Collection details</summary>
						<div className="send-detail-columns">{sendReviewGroups(attempt).map(({ label, collections }) => <section key={label}><h3>{label}</h3>{collections?.length ? <ul>{collections.map((collection, index) => <li key={index}>{nodeTitle(collection.title, "collection").text}</li>)}</ul> : <p>No Collections</p>}</section>)}</div>
					</details>
					{removals !== 0 ? <div className="send-removal"><p className="send-consequence">{sendRemovalWarning(removals, attempt.review.profile.name)}</p>
						{removals > 0 && onMergeInstead ? <div className="send-merge-alternative"><p className="nuvio-muted">{sendMergeHelp(attempt.review.profile.name)}</p><button type="button" className="secondary-action" data-action="merge-instead" onClick={mergeInstead}>Merge instead</button></div> : null}</div> : null}
					<div className="send-backup"><button type="button" className="secondary-action" data-action="download-nuvio-backup" disabled={busy} onClick={downloadBackup}>{backupFeedback?.started ? "Download backup again" : "Download current Nuvio backup"}</button><p className="nuvio-muted">Recommended if you may want to restore this profile later.</p>{backupFeedback ? <p className="nuvio-muted" role="status">{backupFeedback.text}</p> : null}</div>
				</>}
			</> : null}
			{view === "result" && result ? <div className={result.success ? "send-result send-verified" : "send-result"} role="status" aria-live="polite"><p>{result.text}</p>{result.detail ? <p className="nuvio-muted">{result.detail}</p> : null}{result.observation ? <p>{result.observation}</p> : null}</div> : null}
		</div>
		{!busy ? <footer className="nuvio-dialog-footer"><div className="nuvio-footer-actions">
			{view === "connect" ? <button type="submit" form={id + "-login"} className="nuvio-primary" disabled={busy}>{busy ? "Connecting…" : "Connect to Nuvio"}</button> : null}
			{view === "profiles" ? <button type="button" className="nuvio-primary" disabled={!canAccess || busy || attempt.phase === "STALE_LOCAL"} onClick={() => recovering ? checkAgain() : void coordinator.review()}>{attempt.busy ? "Loading Collections…" : recovering ? "Check Nuvio again" : "Review Collections"}</button> : null}
			{reviewed && !identical ? <button type="button" className="nuvio-danger" data-action="replace-nuvio-collections" disabled={busy} onClick={() => void coordinator.replaceCollections(attempt.review)}>Replace Collections</button> : null}
			{!dispatched && view === "review" && failed ? attempt.phase === "REMOTE_CHANGED" ? <button type="button" className="nuvio-primary" disabled={busy} onClick={() => void coordinator.review()}>Review latest Collections</button> : <button type="button" onClick={back}>Choose profile again</button> : null}
			{view === "result" && attempt.phase !== "VERIFIED" && attempt.dispatch.kind !== "rejected" ? <button type="button" className="nuvio-primary" disabled={busy} onClick={checkAgain}>Check Nuvio again</button> : null}
			{done ? <button type="button" className="nuvio-primary" onClick={onClose}>Done</button> : null}
		</div></footer> : null}
	</>;
}
