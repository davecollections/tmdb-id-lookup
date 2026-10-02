export const TRAKT_API_ORIGIN = "https://api.dingo.build";
export const TRAKT_LOCAL_PROXY_PREFIX = "/__trakt_preview__";

export function isLocalTraktPreviewHost(hostname) {
	if (["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname)) return true;
	const parts = String(hostname ?? "").split(".");
	if (parts.length !== 4 || parts.some(part => !/^\d{1,3}$/.test(part) || Number(part) > 255)) return false;
	const [a, b] = parts.map(Number);
	return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

export function traktApiBase({ localPreview = false, hostname = globalThis.location?.hostname } = {}) {
	if (localPreview && !isLocalTraktPreviewHost(hostname)) throw new TypeError("Trakt live preview requires a local host.");
	return localPreview ? TRAKT_LOCAL_PROXY_PREFIX : TRAKT_API_ORIGIN;
}
