import { TRAKT_API_ORIGIN, TRAKT_LOCAL_PROXY_PREFIX, isLocalTraktPreviewHost } from "./src/config/trakt-api.js";

// Local Vite middleware only. No forwarded client headers, configurable target or /items route.
export function createTraktPreviewMiddleware({ fetchImpl = globalThis.fetch, timeoutMs = 25000 } = {}) {
	return async (request, response, next) => {
		if (!request.url?.startsWith(TRAKT_LOCAL_PROXY_PREFIX)) return next();
		const fail = (status, code) => { response.statusCode = status; response.setHeader("Content-Type", "application/json"); response.setHeader("Cache-Control", "no-store"); response.end(JSON.stringify({ apiVersion: 1, error: { code } })); };
		let target;
		try {
			const host = new URL(`http://${request.headers.host}`);
			if (!isLocalTraktPreviewHost(host.hostname) || host.host !== request.headers.host) return fail(403, "ORIGIN_DENIED");
			if (request.headers.origin && new URL(request.headers.origin).origin !== host.origin) return fail(403, "ORIGIN_DENIED");
			if (request.method !== "GET") return fail(405, "METHOD_NOT_ALLOWED");
			const rawPath = request.url.slice(TRAKT_LOCAL_PROXY_PREFIX.length).split("?")[0];
			const allowed = rawPath === "/v1/trakt/search" ? ["mode", "q", "page", "limit"]
				: rawPath === "/v1/trakt/browse" ? ["kind", "page", "limit"]
					: rawPath === "/v1/trakt/resolve" ? ["value"]
						: /^\/v1\/trakt\/lists\/[1-9]\d*\/media$/.test(rawPath) ? [] : null;
			if (!allowed) return fail(404, "NOT_FOUND");
			target = new URL(request.url.slice(TRAKT_LOCAL_PROXY_PREFIX.length), TRAKT_API_ORIGIN);
			if (target.origin !== TRAKT_API_ORIGIN || target.pathname !== rawPath || target.hash) return fail(400, "INVALID_REQUEST");
			for (const key of target.searchParams.keys()) if (!allowed.includes(key) || target.searchParams.getAll(key).length !== 1) return fail(400, "INVALID_REQUEST");
		} catch { return fail(400, "INVALID_REQUEST"); }
		const controller = new AbortController(), abort = () => controller.abort();
		const timer = setTimeout(abort, timeoutMs);
		request.on?.("aborted", abort); response.on?.("close", abort);
		try {
			const upstream = await fetchImpl(target.href, { method: "GET", headers: { Accept: "application/json" }, credentials: "omit", redirect: "error", signal: controller.signal });
			const body = await upstream.text();
			if (response.destroyed) return;
			if (controller.signal.aborted) return fail(502, "UPSTREAM_FAILURE");
			response.statusCode = upstream.status;
			response.setHeader("Content-Type", upstream.headers.get("Content-Type") ?? "application/json");
			response.setHeader("Cache-Control", "no-store");
			if (upstream.headers.has("Retry-After")) response.setHeader("Retry-After", upstream.headers.get("Retry-After"));
			response.end(body);
		} catch { if (!response.destroyed) fail(502, "UPSTREAM_FAILURE"); }
		finally { clearTimeout(timer); request.off?.("aborted", abort); response.off?.("close", abort); }
	};
}

export function localTraktPreviewPlugin(enabled = false) {
	const install = server => { if (enabled) server.middlewares.use(createTraktPreviewMiddleware()); };
	return { name: "local-trakt-live-review", configureServer: install, configurePreviewServer: install };
}
