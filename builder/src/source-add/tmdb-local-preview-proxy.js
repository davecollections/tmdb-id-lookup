export const TMDB_LOCAL_PREVIEW_PROXY_PREFIX = "/__tmdb_preview__";

function isPrivateIpv4Address(hostname) {
	if (typeof hostname !== "string" || !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) {
		return false;
	}
	const octets = hostname.split(".").map(Number);
	if (octets.some((value) => value < 0 || value > 255)) return false;
	return octets[0] === 10
		|| (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
		|| (octets[0] === 192 && octets[1] === 168);
}

export function shouldUseTmdbLocalPreviewProxy(location = globalThis.location) {
	return location?.protocol === "http:"
		&& isPrivateIpv4Address(location.hostname);
}

export function createTmdbLocalPreviewFetch({
	fetchImpl = globalThis.fetch,
	forceProxy = false,
	location = globalThis.location,
	workerBaseUrl,
} = {}) {
	if (typeof fetchImpl !== "function") {
		throw new TypeError("A fetch implementation is required.");
	}

	let workerOrigin;
	try {
		const workerUrl = new URL(workerBaseUrl);
		if (workerUrl.protocol !== "https:" || workerUrl.origin !== workerBaseUrl) throw new Error();
		workerOrigin = workerUrl.origin;
	} catch {
		throw new TypeError("A canonical HTTPS TMDB Worker origin is required.");
	}

	const proxyOrigin = (forceProxy && location?.protocol === "http:") || shouldUseTmdbLocalPreviewProxy(location)
		? location.origin
		: null;
	return (input, init) => {
		const requestUrl = new URL(input instanceof Request ? input.url : input);
		if (proxyOrigin !== null && requestUrl.origin === workerOrigin) {
			const proxiedUrl = new URL(
				`${TMDB_LOCAL_PREVIEW_PROXY_PREFIX}${requestUrl.pathname}${requestUrl.search}`,
				proxyOrigin,
			);
			return fetchImpl(proxiedUrl.toString(), init);
		}
		return fetchImpl(input, init);
	};
}
