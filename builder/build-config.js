import { parseCanonicalHttpsOrigin } from "./worker-origin.js";

const workerDeclarationPattern = /^\s*const\s+TMDB_PROXY_BASE_URL\s*=\s*"([^"\r\n]+)"\s*;\s*$/gm;

export function extractTmdbProxyBaseUrl(source) {
	if (typeof source !== "string") {
		throw new TypeError("The root v1 TMDB Worker configuration must be text.");
	}

	const matches = [...source.matchAll(workerDeclarationPattern)];
	if (matches.length !== 1) {
		throw new Error(
			`Expected exactly one root v1 TMDB_PROXY_BASE_URL declaration; found ${matches.length}.`,
		);
	}

	let parsed;
	try {
		parsed = parseCanonicalHttpsOrigin(matches[0][1]);
	} catch {
		throw new Error("The root v1 TMDB_PROXY_BASE_URL must be an absolute HTTPS URL.");
	}

	if (parsed === null) {
		throw new Error(
			"The root v1 TMDB_PROXY_BASE_URL must be an HTTPS origin without credentials, port, path, query, or fragment.",
		);
	}

	return parsed.origin;
}
