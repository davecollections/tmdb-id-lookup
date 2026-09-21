// Public Nuvio API v1.3, reviewed 2026-09-19. This is a publishable key, not a secret.
export const NUVIO_API_ORIGIN = "https://api.nuvio.tv";
const PUBLISHABLE_KEY = "sb_publishable_1Clq8rlTVACkdcZuqr6_AD__xUUC_EN";
const endpoints = Object.freeze({
	login: ["POST", "/auth/v1/token?grant_type=password"],
	account: ["GET", "/auth/v1/user"],
	profiles: ["POST", "/rest/v1/rpc/sync_pull_profiles"],
	pin: ["POST", "/rest/v1/rpc/verify_profile_pin"],
	collections: ["POST", "/rest/v1/rpc/sync_pull_collections"],
});
const messages = Object.freeze({
	AUTH: "Your Nuvio connection has expired. Log in again before loading more data.",
	FORBIDDEN: "Nuvio refused this request. Your connection is still available; check access in Nuvio.",
	UNAVAILABLE: "Nuvio is temporarily unavailable. Try again later.",
	LOGIN: "Nuvio could not sign you in. Check your email and password and try again.",
	NETWORK: "Could not reach Nuvio. Check your connection and try again.",
	TIMEOUT: "Nuvio took too long to respond. Try again.",
	RATE_LIMIT: "Nuvio is receiving too many requests. Wait a little and try again.",
	SERVICE: "Nuvio could not complete the request. Try again later.",
	PAYLOAD: "Nuvio returned data that Dingo could not safely read.",
	IDENTITY: "The Nuvio account or profile changed. Connect again and choose your profile.",
	PROTECTED: "This profile needs PIN verification, or its protection changed. Review the profile and try again.",
	PIN: "Enter the four-digit Nuvio profile PIN.",
	CANCELLED: "The Nuvio request was cancelled.",
});

export class NuvioConnectionError extends Error {
	constructor(code) {
		super(messages[code] ?? messages.SERVICE);
		this.name = "NuvioConnectionError";
		this.code = Object.hasOwn(messages, code) ? code : "SERVICE";
	}
}

export function publicConnectionError(error) {
	const safe = error instanceof NuvioConnectionError ? error : new NuvioConnectionError("SERVICE");
	return { code: safe.code, message: safe.message };
}

export function isUuid(value) {
	return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

// The official Nuvio safe-read policy backs off before retrying 429/503.
// Only these reads may repeat; login and PIN verification can change server state.
const retryableReads = new Set(["account", "profiles", "collections"]);
const RETRY_FALLBACK_MS = 2000;
const MAX_RETRY_WAIT_MS = 30000;

function httpDateMs(value) {
	const timestamp = Date.parse(value.endsWith(" GMT") ? value : `${value} GMT`);
	if (!Number.isFinite(timestamp)) return NaN;
	const date = new Date(timestamp);
	const canonical = date.toUTCString();
	const [weekday, day, month, year, time] = canonical.split(" ");
	const fullWeekday = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][date.getUTCDay()];
	// Round-trip the three HTTP-date forms; Date.parse alone accepts invalid dates.
	const formats = [
		canonical,
		`${fullWeekday}, ${day}-${month}-${year.slice(-2)} ${time} GMT`,
		`${weekday.slice(0, 3)} ${month} ${String(Number(day)).padStart(2, " ")} ${time} ${year}`,
	];
	return formats.includes(value) ? timestamp : NaN;
}

function retryDelayMs(header, now) {
	const value = header?.trim() ?? "";
	let delay = RETRY_FALLBACK_MS;
	if (/^[0-9]+$/.test(value) && Number(value) > 0) {
		delay = Number(value) * 1000;
	} else {
		const remaining = httpDateMs(value) - now;
		if (Number.isFinite(remaining) && remaining > 0) delay = remaining;
	}
	// Leave long server cooldowns to manual retry rather than retrying too early.
	return delay <= MAX_RETRY_WAIT_MS ? delay : null;
}

function waitForRetry(delayMs, signal) {
	if (signal?.aborted) return Promise.reject(new NuvioConnectionError("CANCELLED"));
	return new Promise((resolve, reject) => {
		const cleanup = () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); };
		const abort = () => { cleanup(); reject(new NuvioConnectionError("CANCELLED")); };
		const timer = setTimeout(() => { cleanup(); resolve(); }, delayMs);
		signal?.addEventListener("abort", abort, { once: true });
	});
}

export function createNuvioTransport({ fetchImpl = globalThis.fetch, timeoutMs = 20000, now = Date.now } = {}) {
	async function attempt(operation, { token, body, signal }, allowRetry) {
		if (signal?.aborted) throw new NuvioConnectionError("CANCELLED");
		const [method, path] = endpoints[operation];
		const timeout = new AbortController();
		const abort = () => timeout.abort();
		signal?.addEventListener("abort", abort, { once: true });
		let timedOut = false;
		const timer = setTimeout(() => { timedOut = true; timeout.abort(); }, timeoutMs);
		const active = () => {
			if (signal?.aborted) throw new NuvioConnectionError("CANCELLED");
			if (timedOut) throw new NuvioConnectionError("TIMEOUT");
		};
		try {
			const headers = { apikey: PUBLISHABLE_KEY };
			if (token) headers.Authorization = `Bearer ${token}`;
			if (body !== undefined) headers["Content-Type"] = "application/json";
			const response = await fetchImpl(`${NUVIO_API_ORIGIN}${path}`, {
				method, headers, signal: timeout.signal, credentials: "omit", cache: "no-store", redirect: "error",
				...(body === undefined ? {} : { body: JSON.stringify(body) }),
			});
			active();
			if (!response.ok) {
				// We never consume private error bodies. Release this attempt before waiting.
				timeout.abort();
				if (allowRetry && [429, 503].includes(response.status)) {
					const delay = retryDelayMs(response.headers.get("Retry-After"), now());
					if (delay !== null) return { retryDelayMs: delay };
				}
				if (response.status === 429) throw new NuvioConnectionError("RATE_LIMIT");
				if (response.status === 503) throw new NuvioConnectionError("UNAVAILABLE");
				if (operation === "login" && [400, 401, 403, 422].includes(response.status)) throw new NuvioConnectionError("LOGIN");
				if (response.status === 401) throw new NuvioConnectionError("AUTH");
				if (response.status === 403) throw new NuvioConnectionError("FORBIDDEN");
				throw new NuvioConnectionError("SERVICE");
			}
			let value;
			try { value = await response.json(); }
			catch (error) {
				// JSON syntax errors are payload failures; body-stream failures are transport errors.
				if (error?.name === "SyntaxError") throw new NuvioConnectionError("PAYLOAD");
				throw error;
			}
			active();
			return { value };
		} catch (error) {
			active();
			throw error instanceof NuvioConnectionError ? error : new NuvioConnectionError("NETWORK");
		} finally {
			clearTimeout(timer);
			signal?.removeEventListener("abort", abort);
		}
	}
	return async function request(operation, options = {}) {
		if (!Object.hasOwn(endpoints, operation)) throw new NuvioConnectionError("SERVICE");
		const result = await attempt(operation, options, retryableReads.has(operation));
		if (result.retryDelayMs === undefined) return result.value;
		await waitForRetry(result.retryDelayMs, options.signal);
		return (await attempt(operation, options, false)).value;
	};
}
