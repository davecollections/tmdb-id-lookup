import { deepFreeze } from "../application/state.js";
import { captureNuvioCollections } from "./collections.js";
import { parseNuvioAccount, parseNuvioProfiles, requireSameProfile, sameProtection } from "./profiles.js";
import { createNuvioTransport, NuvioConnectionError, publicConnectionError } from "./transport.js";

export function parseNuvioSession(value, now) {
	if (typeof value?.access_token !== "string" || !value.access_token || /\s/.test(value.access_token)
		|| typeof value.token_type !== "string" || value.token_type.toLowerCase() !== "bearer" || !Number.isFinite(value.expires_in) || value.expires_in <= 0) {
		throw new NuvioConnectionError("PAYLOAD");
	}
	const expiresAt = Math.min(now + value.expires_in * 1000, Number.isFinite(value.expires_at) ? value.expires_at * 1000 : Infinity);
	if (!Number.isFinite(expiresAt) || expiresAt <= now) throw new NuvioConnectionError("AUTH");
	// Deliberately omit refresh_token, user metadata and the raw auth response.
	return { token: value.access_token, expiresAt, account: parseNuvioAccount(value.user) };
}

const initialState = () => ({ status: "disconnected", busy: null, account: null, profiles: [], snapshot: null, error: null, pinFeedback: null });

export function createNuvioConnection({ fetchImpl, now = Date.now, timeoutMs } = {}) {
	const request = createNuvioTransport({ fetchImpl, timeoutMs, now });
	let session = null;
	let state = deepFreeze(initialState());
	let generation = 0;
	let pending = null;
	let expiryTimer = null;
	const verifiedProfiles = new Map();
	const retryTimes = new Map();
	const profileKey = (profile) => `${profile.accountId}:${profile.id}:${profile.index}`;
	const listeners = new Set();
	function publish(patch) {
		state = deepFreeze({ ...state, ...patch });
		for (const listener of [...listeners]) { try { listener(); } catch { /* Observers do not own connection state. */ } }
	}
	function cancelPending() { generation++; pending?.abort(); pending = null; }
	function expire() {
		cancelPending(); clearTimeout(expiryTimer); session = null;
		verifiedProfiles.clear(); retryTimes.clear();
		// A completed snapshot is local data. Expiry never invalidates it.
		publish({ status: "expired", busy: null, error: null, pinFeedback: null });
	}
	function checkExpiry() {
		if (session && now() >= session.expiresAt) expire();
		return state.status === "expired";
	}
	function scheduleExpiry() {
		clearTimeout(expiryTimer);
		if (!session) return;
		expiryTimer = setTimeout(() => { if (!checkExpiry()) scheduleExpiry(); }, Math.min(2147483647, Math.max(1, session.expiresAt - now())));
		expiryTimer?.unref?.();
	}
	function disconnect() {
		cancelPending(); clearTimeout(expiryTimer); session = null;
		verifiedProfiles.clear(); retryTimes.clear();
		publish(initialState());
	}
	function cancelReview() {
		cancelPending();
		publish({ busy: null, snapshot: null, error: null, status: session ? "connected" : state.status === "expired" ? "expired" : "disconnected" });
	}
	async function run(kind, action, { login = false } = {}) {
		checkExpiry();
		if (!login && !session) { publish({ error: publicConnectionError(new NuvioConnectionError("AUTH")) }); return false; }
		cancelPending();
		pending = new AbortController();
		const signal = pending.signal;
		const version = generation;
		const active = () => {
			if (version !== generation || signal.aborted) throw new NuvioConnectionError("CANCELLED");
			if (session && now() >= session.expiresAt) throw new NuvioConnectionError("AUTH");
		};
		publish({ busy: kind, error: null, snapshot: null, pinFeedback: null });
		try {
			const patch = await action(signal, active);
			active(); pending = null;
			publish({ ...patch, busy: null });
			return true;
		} catch (error) {
			if (version !== generation) return false;
			pending?.abort();
			pending = null;
			const safe = publicConnectionError(error);
			if (safe.code === "AUTH") expire();
			else if (safe.code === "IDENTITY") { disconnect(); publish({ error: safe }); }
			else publish({ busy: null, error: safe, ...(login ? { status: session ? "connected" : "disconnected", account: session?.account ?? null } : {}) });
			return false;
		}
	}
	async function identities(signal, active) {
		const token = session.token;
		const [user, rows] = await Promise.all([
			request("account", { token, signal }), request("profiles", { token, signal }),
		]);
		active();
		const account = parseNuvioAccount(user);
		if (account.id !== session.account.id) throw new NuvioConnectionError("IDENTITY");
		const profiles = parseNuvioProfiles(rows, account.id);
		for (const [key, verified] of verifiedProfiles) {
			const current = profiles.find((profile) => profileKey(profile) === key);
			if (!current || !sameProtection(current, verified)) verifiedProfiles.delete(key);
		}
		for (const key of retryTimes.keys()) if (!profiles.some((profile) => profileKey(profile) === key)) retryTimes.delete(key);
		return { account, profiles };
	}
	function getProfileAccess(profileId) {
		const profile = state.profiles.find((entry) => entry.id === profileId);
		if (!profile) return { unlocked: false, retryAfterSeconds: 0 };
		const key = profileKey(profile);
		const verified = verifiedProfiles.get(key);
		const retryAfterSeconds = Math.max(0, Math.ceil((Math.max(retryTimes.get(key) ?? 0, profile.lockedUntil ?? 0) - now()) / 1000));
		return { unlocked: Boolean(session && now() < session.expiresAt && retryAfterSeconds === 0
			&& (profile.protection === "none" || (verified && sameProtection(profile, verified)))), retryAfterSeconds };
	}
	function requireAccess(profile) {
		if (!getProfileAccess(profile.id).unlocked) throw new NuvioConnectionError("PROTECTED");
	}
	function verifyProfilePin(profileId, pin) {
		const expected = state.profiles.find((profile) => profile.id === profileId);
		return run("pin", async (signal, active) => {
			if (!expected) throw new NuvioConnectionError("IDENTITY");
			if (typeof pin !== "string" || !/^[0-9]{4}$/.test(pin)) { pin = null; throw new NuvioConnectionError("PIN"); }
			const before = await identities(signal, active);
			publish(before);
			const profile = requireSameProfile(before.profiles, expected);
			if (profile.protection !== "pin") { pin = null; throw new NuvioConnectionError("PROTECTED"); }
			if (getProfileAccess(profile.id).retryAfterSeconds > 0) { pin = null; return { pinFeedback: { profileId, kind: "locked" } }; }
			const responsePromise = request("pin", { token: session.token, body: { p_profile_id: profile.index, p_pin: pin }, signal });
			pin = null;
			const response = await responsePromise;
			active();
			// PostgREST RETURNS TABLE is a single-row array; accept only that contract.
			const result = Array.isArray(response) && response.length === 1 ? response[0] : null;
			if (typeof result?.unlocked !== "boolean" || !Number.isSafeInteger(result.retry_after_seconds) || result.retry_after_seconds < 0
				|| result.retry_after_seconds > 2147483647 || (result.unlocked && result.retry_after_seconds !== 0)) throw new NuvioConnectionError("PAYLOAD");
			const key = profileKey(profile);
			verifiedProfiles.delete(key);
			if (result.retry_after_seconds > 0) retryTimes.set(key, now() + result.retry_after_seconds * 1000);
			const after = await identities(signal, active);
			publish(after);
			// Verification itself resets lockout metadata and updates the profile timestamp.
			const verified = requireSameProfile(after.profiles, profile, { protection: false });
			if (verified.protection !== "pin") throw new NuvioConnectionError("PROTECTED");
			if (result.unlocked) {
				if (verified.lockedUntil !== null) throw new NuvioConnectionError("PROTECTED");
				retryTimes.delete(key); verifiedProfiles.set(key, verified);
			}
			return { ...after, pinFeedback: { profileId, kind: result.unlocked ? "verified" : getProfileAccess(profileId).retryAfterSeconds > 0 ? "locked" : "incorrect" } };
		}).finally(() => { pin = null; });
	}
	async function connect(email, password) {
		disconnect();
		publish({ status: "connecting" });
		return run("login", async (signal, active) => {
			if (typeof email !== "string" || !email.trim() || typeof password !== "string" || !password) throw new NuvioConnectionError("LOGIN");
			const authPromise = request("login", { body: { email: email.trim(), password }, signal });
			password = null;
			const response = await authPromise;
			active(); session = parseNuvioSession(response, now()); scheduleExpiry();
			const identity = await identities(signal, active);
			return { ...identity, status: "connected" };
		}, { login: true });
	}
	function refreshProfiles() {
		return run("profiles", async (signal, active) => ({ ...await identities(signal, active), status: "connected" }));
	}
	function pullProfile(profileId) {
		const expected = state.profiles.find((profile) => profile.id === profileId);
		return run("pull", async (signal, active) => {
			if (!expected) throw new NuvioConnectionError("IDENTITY");
			const before = await identities(signal, active);
			publish(before);
			const profile = requireSameProfile(before.profiles, expected);
			requireAccess(profile);
			const response = await request("collections", { token: session.token, body: { p_profile_id: profile.index }, signal });
			active();
			// Detect removal, slot replacement or newly enabled protection during the pull.
			const after = await identities(signal, active);
			publish(after);
			const verified = requireSameProfile(after.profiles, profile);
			requireAccess(verified);
			const snapshot = captureNuvioCollections(response, verified, new Date(now()).toISOString());
			return { ...after, snapshot, status: "connected" };
		});
	}
	return Object.freeze({
		getState: () => state,
		subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
		connect, refreshProfiles, verifyProfilePin, getProfileAccess, pullProfile, checkExpiry, cancelReview, disconnect,
		dispose() { listeners.clear(); disconnect(); },
	});
}
