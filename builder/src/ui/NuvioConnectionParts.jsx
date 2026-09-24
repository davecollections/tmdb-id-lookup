import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useBuilderDesktopViewport } from "./responsive-viewport.js";
import { NuvioProfileAvatar } from "./NuvioProfileAvatar.jsx";
import { focusElementWithoutScroll } from "./hierarchy-menu-placement.js";

const useBeforePaint = typeof window === "undefined" ? useEffect : useLayoutEffect;

function ProfileLock({ unlocked }) {
	return <svg className="nuvio-lock" data-unlocked={unlocked} aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="7" width="10" height="7" rx="2" /><path d={unlocked ? "M5 7V4a3 3 0 016 0" : "M5 7V5a3 3 0 016 0v2"} /></svg>;
}

export function ProfilePin({ connection, profile, busy, feedback, id, compact = false, onVerified }) {
	const [, tick] = useState(0);
	const [checking, setChecking] = useState(false);
	const input = useRef(null);
	const draft = useRef("");
	const attempt = useRef(null);
	const restoreEntryFocus = useRef(false);
	const { unlocked, retryAfterSeconds } = connection.getProfileAccess(profile.id);
	useBeforePaint(() => {
		setChecking(false);
		return () => {
			const pending = attempt.current; attempt.current = null;
			pending?.abort(); draft.current = ""; restoreEntryFocus.current = false;
			if (input.current) input.current.value = "";
		};
	}, [connection, profile.accountId, profile.id, profile.index]);
	useBeforePaint(() => {
		// The connection adjudicates metadata changed by its own active RPC.
		if (!attempt.current) { draft.current = ""; if (input.current) input.current.value = ""; }
	}, [profile.protection, profile.version, profile.lockedUntil]);
	useBeforePaint(() => {
		if (!checking && !busy && !retryAfterSeconds && restoreEntryFocus.current) {
			restoreEntryFocus.current = false; focusElementWithoutScroll(input.current);
		}
	}, [checking, busy, retryAfterSeconds]);
	useEffect(() => {
		if (!retryAfterSeconds) return;
		const timer = setInterval(() => tick((value) => value + 1), 1000);
		return () => clearInterval(timer);
	}, [retryAfterSeconds > 0]);
	function enter(value) {
		const field = input.current;
		if (!field) return;
		if (attempt.current || busy || connection.getState().busy || connection.getProfileAccess(profile.id).retryAfterSeconds > 0) { field.value = ""; draft.current = ""; return; }
		// Keep the established ASCII numeric contract. Reject mixed/overlong
		// input rather than silently submitting a truncated or transformed PIN.
		if (!/^[0-9]{0,4}$/.test(value)) { field.value = draft.current; return; }
		draft.current = value; field.value = value;
		if (value.length !== 4) return;
		const operation = new AbortController(); attempt.current = operation;
		field.value = ""; draft.current = ""; setChecking(true);
		const verification = connection.verifyProfilePin(profile.id, value, { signal: operation.signal });
		value = null;
		void verification.then((completed) => {
			if (attempt.current !== operation || operation.signal.aborted) return;
			attempt.current = null; setChecking(false);
			const access = connection.getProfileAccess(profile.id);
			if (completed && access.unlocked) onVerified?.(profile.id);
			else if (!access.retryAfterSeconds) restoreEntryFocus.current = true;
		});
	}
	const hasFeedback = checking || retryAfterSeconds > 0 || feedback?.kind === "incorrect";
	return <div className={`nuvio-pin${compact ? " is-inline" : ""}`}>
		{unlocked ? <p className="nuvio-pin-success" role="status">PIN verified</p> : <form onSubmit={(event) => event.preventDefault()} aria-busy={checking}>
			<label className={compact ? "visually-hidden" : undefined} htmlFor={`${id}-pin`}>Nuvio PIN for {profile.name}</label>
			<p className={compact ? "visually-hidden" : "nuvio-muted"} id={`${id}-pin-help`}>Enter the 4-digit PIN for this profile.</p>
			<div className="nuvio-pin-entry"><input ref={input} id={`${id}-pin`} name="pin" type="password" placeholder={compact ? "Enter PIN" : undefined} inputMode="numeric" pattern="[0-9]{4}" minLength={4} maxLength={4} autoComplete="off" required disabled={busy || checking || retryAfterSeconds > 0} aria-describedby={`${id}-pin-help ${id}-pin-status`}
				onChange={(event) => enter(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }}
				onPaste={(event) => { event.preventDefault(); const field = event.currentTarget; enter(field.value.slice(0, field.selectionStart) + event.clipboardData.getData("text") + field.value.slice(field.selectionEnd)); }} /></div>
			<p className={compact && !hasFeedback ? "visually-hidden" : "nuvio-muted"} id={`${id}-pin-status`} role="status">{checking ? "Checking PIN…" : retryAfterSeconds > 0 ? `Nuvio has temporarily locked PIN attempts. Try again in ${retryAfterSeconds} seconds.` : feedback?.kind === "incorrect" ? "Incorrect PIN. Try again." : "Your PIN goes directly to Nuvio and is not saved."}</p>
		</form>}
	</div>;
}

export function NuvioJourney({ step, labels, label }) {
	return <ol className="nuvio-steps" aria-label={label}>
		{labels.map((label, index) => <li key={label} aria-current={step === index + 1 ? "step" : undefined} data-completed={step > index + 1 ? "true" : undefined}>
			{index > 0 ? <span className="nuvio-step-separator" aria-hidden="true">›</span> : null}{label}
		</li>)}
	</ol>;
}


export function NuvioImportProgress({ step }) {
	return <NuvioJourney step={step} labels={["Connect", "Select profile", "Review"]} label="Import progress" />;
}

export function NuvioLoginForm({ connection, id, busy, description, notice, heading = true, onConnecting = () => {} }) {
	return <form id={`${id}-login`} onSubmit={(event) => {
		event.preventDefault();
		if (connection.getState().busy) return;
		const form = event.currentTarget;
		const password = form.elements.password.value;
		form.elements.password.value = "";
		onConnecting();
		void connection.connect(form.elements.email.value, password);
	}} className="nuvio-login" aria-busy={busy}>
		{heading ? <h3>Connect your Nuvio account</h3> : null}{description ? <p>{description}</p> : null}
		<label htmlFor={`${id}-email`}>Nuvio email</label><input id={`${id}-email`} name="email" type="email" autoComplete="username" required disabled={busy} />
		<label htmlFor={`${id}-password`}>Nuvio password</label><input id={`${id}-password`} name="password" type="password" autoComplete="off" required disabled={busy} />
		<p className="nuvio-muted nuvio-notice">{notice}</p>
	</form>;
}

export function NuvioProfiles({ connection, profiles, selected, onSelect, onVerified, busy, feedback, id }) {
	const desktopViewport = useBuilderDesktopViewport();
	const selectedProfile = profiles.find((profile) => profile.id === selected);
	const pinProps = { connection, busy, feedback: feedback?.profileId === selected ? feedback : null, id, onVerified };
	return <>
		<fieldset className="nuvio-choices"><legend className="visually-hidden">Nuvio profiles</legend>{profiles.map((profile) => <div className="nuvio-choice nuvio-profile-choice" key={profile.id} data-selection-mode="single" data-selected={selected === profile.id} data-disabled={profile.protection === "unknown"}>
			<input id={`${id}-profile-${profile.id}`} className="visually-hidden choice-card-input" type="radio" name={`${id}-profile`} value={profile.id} checked={selected === profile.id} disabled={busy || profile.protection === "unknown"} onChange={() => onSelect(profile.id)} />
			<label className="nuvio-profile-label" htmlFor={`${id}-profile-${profile.id}`}><NuvioProfileAvatar profile={profile} /><span><strong>{profile.name}</strong><small>Profile {profile.index}{profile.protection === "pin" ? <> · <ProfileLock unlocked={connection.getProfileAccess(profile.id).unlocked} /> PIN protected</> : profile.protection === "unknown" ? " · Protection unavailable" : ""}</small></span></label>
			{desktopViewport && selected === profile.id && profile.protection === "pin" ? <ProfilePin key={`${profile.accountId}:${profile.id}:${profile.index}`} {...pinProps} profile={profile} compact /> : null}
		</div>)}</fieldset>
		{!desktopViewport && selectedProfile?.protection === "pin" ? <ProfilePin key={`${selectedProfile.accountId}:${selectedProfile.id}:${selectedProfile.index}`} {...pinProps} profile={selectedProfile} /> : null}
	</>;
}
