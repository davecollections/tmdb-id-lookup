import { traktApiBase } from "../config/trakt-api.js";
import { isCanonicalTraktListId } from "../nuvio/trakt.js";
import { createBoundedResponseCache } from "./bounded-response-cache.js";

const messages = Object.freeze({
	INVALID_REQUEST: "Check the list request and try again.",
	LIST_NOT_FOUND: "This public list is unavailable.",
	INVALID_UPSTREAM_RESPONSE: "Trakt returned data we could not use.",
	UPSTREAM_FAILURE: "The list could not be checked. Try again.",
	UPSTREAM_RATE_LIMIT: "Trakt is busy. Wait before retrying.",
	UPSTREAM_BUDGET: "The shared list service is busy. Wait before retrying.",
	ABUSE_LIMIT: "Too many requests. Wait before retrying.",
	SERVICE_NOT_CONFIGURED: "The list service is unavailable.",
	BUDGET_UNAVAILABLE: "The list service is unavailable.",
	SERVICE_BUSY: "The list service is busy. Try again later.",
	RESERVATION_EXPIRED: "The list request could not finish. Try again.",
	NETWORK: "Could not reach the list service. Try again.",
	TIMEOUT: "The list service took too long. Try again.",
	ABORTED: "The request was canceled.",
	INVALID_RESPONSE: "The list service returned data we could not use.",
});
export const TRAKT_QUEUE_STOP_CODES = Object.freeze(["UPSTREAM_RATE_LIMIT", "UPSTREAM_BUDGET", "ABUSE_LIMIT", "SERVICE_NOT_CONFIGURED", "BUDGET_UNAVAILABLE", "SERVICE_BUSY"]);
export function traktFailure(code, notBefore = 0) {
	const safeCode = Object.hasOwn(messages, code) ? code : "INVALID_RESPONSE";
	return Object.freeze({ ok: false, error: Object.freeze({ code: safeCode,
		kind: safeCode === "ABORTED" ? "aborted" : safeCode.toLowerCase(), message: messages[safeCode],
		retryable: !["INVALID_REQUEST", "LIST_NOT_FOUND", "ABORTED"].includes(safeCode),
		stopQueue: TRAKT_QUEUE_STOP_CODES.includes(safeCode), notBefore }) });
}

export function traktRetryNotBefore(value, now = Date.now()) {
	if (typeof value !== "string" || !value.trim()) return 0;
	const text = value.trim();
	const time = /^\d+$/.test(text) ? now + Number(text) * 1000
		: /^[A-Za-z]{3}, \d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(text) ? Date.parse(text) : NaN;
	return Number.isSafeInteger(time) && time > now ? time : 0;
}

const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const count = value => Number.isSafeInteger(value) && value >= 0;
const nullableText = value => value === null || typeof value === "string";
const nullableCount = value => value === null || count(value);
const invalid = () => { throw new TypeError("Invalid Trakt service response."); };

export function normalizeTraktList(value) {
	if (!object(value) || !object(value.ids) || !isCanonicalTraktListId(value.ids.trakt)
		|| !nullableText(value.ids.slug) || !object(value.creator)
		|| ![value.name, value.description, value.creator.username, value.creator.name, value.creator.slug, value.url, value.updated_at].every(nullableText)
		|| !nullableCount(value.item_count) || !nullableCount(value.like_count)
		|| !["unverified", "available", "unavailable"].includes(value.availability)) invalid();
	if (value.updated_at !== null && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value.updated_at) || !Number.isFinite(Date.parse(value.updated_at)))) invalid();
	// Validate returned link origin, not the service's input URL grammar.
	if (value.url !== null) {
		const url = new URL(value.url);
		if (url.protocol !== "https:" || !["trakt.tv", "www.trakt.tv", "app.trakt.tv"].includes(url.hostname) || url.username || url.password || url.port) invalid();
	}
	return Object.freeze({ id: value.ids.trakt, name: value.name, description: value.description,
		slug: value.ids.slug, creator: Object.freeze({ username: value.creator.username, name: value.creator.name, slug: value.creator.slug }),
		url: value.url, itemCount: value.item_count, likeCount: value.like_count, updatedAt: value.updated_at, availability: value.availability });
}

export function normalizeTraktResponse(payload, operation, { id, page = 1, limit = 30 } = {}) {
	if (!object(payload) || payload.apiVersion !== 1) invalid();
	if (operation === "resolve") {
		const list = normalizeTraktList(payload.list);
		if (list.availability !== "available" || (id !== undefined && list.id !== id)) invalid();
		return list;
	}
	if (operation === "media") {
		const media = payload.media;
		if (payload.id !== id || !isCanonicalTraktListId(id) || !object(media) || media.status !== "known"
			|| !count(media.movie_count) || !count(media.show_count)) invalid();
		const composition = media.movie_count > 0 ? media.show_count > 0 ? "mixed" : "movie-only" : media.show_count > 0 ? "show-only" : "zero";
		if (media.composition !== composition) invalid();
		return Object.freeze({ id, composition, movieCount: media.movie_count, showCount: media.show_count });
	}
	if (!["keyword", "user", "popular", "trending"].includes(operation) || !Array.isArray(payload.lists) || payload.lists.length > limit || !object(payload.pagination)) invalid();
	const p = payload.pagination;
	if (![p.page, p.limit, p.page_count, p.item_count].every(nullableCount)
		|| (p.page !== null && p.page !== page) || (p.limit !== null && p.limit !== limit)) invalid();
	return Object.freeze({ lists: Object.freeze(payload.lists.map(normalizeTraktList)),
		pagination: Object.freeze({ page: p.page, limit: p.limit, pageCount: p.page_count, itemCount: p.item_count }) });
}

// URL forms remain opaque input to the authoritative service resolver.
export function canonicalTraktInputId(value) {
	return typeof value === "string" && /^[1-9]\d*$/.test(value) && isCanonicalTraktListId(Number(value)) ? Number(value) : null;
}
export function traktDiscoveryRequest(mode, input = "", { page = 1, limit = 30 } = {}) {
	if (!Number.isSafeInteger(page) || page < 1 || page > 25 || !Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw new TypeError("Invalid list page.");
	const params = new URLSearchParams();
	if (["keyword", "user"].includes(mode)) {
		if (typeof input !== "string" || input.length > 220 || /[\u0000-\u001f\u007f]/.test(input) || !input.trim()) throw new TypeError("Enter a search.");
		const query = mode === "user" ? input.trim().replace(/^@/, "") : input.trim();
		if (mode === "user" && (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,120}$/.test(query) || query.toLowerCase() === "me")) throw new TypeError("Enter a public username.");
		params.set("mode", mode); params.set("q", query);
	} else if (["popular", "trending"].includes(mode)) params.set("kind", mode);
	else throw new TypeError("Choose a list discovery mode.");
	params.set("page", String(page)); params.set("limit", String(limit));
	return { path: `/v1/trakt/${["keyword", "user"].includes(mode) ? "search" : "browse"}?${params}`, operation: mode, page, limit };
}

export function createTraktClient({ fetchImpl = globalThis.fetch, now = Date.now, timeoutMs = 25000,
	cacheMaxEntries = 40, localPreview = false, hostname } = {}) {
	if (typeof fetchImpl !== "function" || typeof now !== "function" || !Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new TypeError("Invalid Trakt client options.");
	const base = traktApiBase({ localPreview, hostname });
	const newCache = () => createBoundedResponseCache({ ttlMs: 300000, maxEntries: cacheMaxEntries, now });
	let cache = newCache();
	let cooldown = null;
	async function request(spec, { signal, refresh = false } = {}) {
		if (signal?.aborted) return traktFailure("ABORTED");
		const cached = refresh ? null : cache.get(spec.path);
		if (cached !== null) return { ok: true, data: cached };
		if (cooldown?.notBefore > now()) return traktFailure(cooldown.code, cooldown.notBefore);
		const requestCache = cache;
		const controller = new AbortController();
		let timer, onAbort;
		const canceled = new Promise(resolve => {
			onAbort = () => { controller.abort(); resolve(traktFailure("ABORTED")); };
			signal?.addEventListener("abort", onAbort, { once: true });
			timer = setTimeout(() => { controller.abort(); resolve(traktFailure("TIMEOUT")); }, timeoutMs);
		});
		const load = async () => {
			let response;
			try { response = await fetchImpl(base + spec.path, { method: "GET", headers: { Accept: "application/json" }, credentials: "omit", redirect: "error", signal: controller.signal }); }
			catch { return traktFailure("NETWORK"); }
			try {
				if (!/^application\/json(?:\s*;|\s*$)/i.test(response.headers.get("Content-Type") ?? "")) return traktFailure("INVALID_RESPONSE");
				const body = await response.json();
				if (!object(body) || body.apiVersion !== 1) return traktFailure("INVALID_RESPONSE");
				if (!response.ok) return traktFailure(body.error?.code, traktRetryNotBefore(response.headers.get("Retry-After"), now()));
				return { ok: true, data: normalizeTraktResponse(body, spec.operation, spec) };
			} catch { return traktFailure("INVALID_RESPONSE"); }
		};
		try {
			const result = await Promise.race([load(), canceled]);
			if (signal?.aborted) return traktFailure("ABORTED");
			// A new authoritative 404 invalidates prior public metadata, including URL aliases.
			// Reuse the bounded cache; replacing it avoids a second identity-indexed cache.
			if (result.ok && requestCache === cache) cache.set(spec.path, result.data);
			else if (!result.ok) {
				if (result.error.code === "LIST_NOT_FOUND") cache = newCache();
				if (result.error.notBefore > (cooldown?.notBefore ?? 0)) cooldown = result.error;
			}
			return result;
		} finally { clearTimeout(timer); signal?.removeEventListener("abort", onAbort); }
	}
	const discover = (mode, input, options = {}) => {
		try { return request(traktDiscoveryRequest(mode, input, options), options); }
		catch { return Promise.resolve(traktFailure("INVALID_REQUEST")); }
	};
	return Object.freeze({
		searchKeyword: (query, options) => discover("keyword", query, options),
		searchUser: (username, options) => discover("user", username, options),
		browse: (kind, options) => discover(kind, "", options),
		resolve: (input, options) => {
			if (typeof input !== "string" || !input.trim()) return Promise.resolve(traktFailure("INVALID_REQUEST"));
			const value = input.trim(), id = canonicalTraktInputId(value);
			return request({ path: `/v1/trakt/resolve?${new URLSearchParams({ value })}`, operation: "resolve", ...(id === null ? {} : { id }) }, options);
		},
		getMedia: (id, options) => isCanonicalTraktListId(id)
			? request({ path: `/v1/trakt/lists/${id}/media`, operation: "media", id }, options)
			: Promise.resolve(traktFailure("INVALID_REQUEST")),
		getNotBefore: () => cooldown?.notBefore ?? 0,
	});
}
