const UUID_BYTE_LENGTH = 16;

/**
 * Creates a cryptographically secure UUID for the browser application entry.
 *
 * `crypto.randomUUID()` is restricted to secure contexts in some browsers,
 * while `crypto.getRandomValues()` remains available to LAN-hosted HTTP
 * previews. Framework-independent domain defaults stay strict; the browser
 * entry injects this secure environment-specific factory.
 *
 * @param {Crypto} [cryptoApi]
 * @returns {string}
 */
export function createSecureBrowserId(cryptoApi = globalThis.crypto) {
	if (typeof cryptoApi?.randomUUID === "function") {
		return cryptoApi.randomUUID();
	}
	if (typeof cryptoApi?.getRandomValues !== "function") {
		throw new Error("A secure browser ID API is unavailable.");
	}

	const bytes = new Uint8Array(UUID_BYTE_LENGTH);
	cryptoApi.getRandomValues(bytes);
	bytes[6] = (bytes[6] & 0x0f) | 0x40;
	bytes[8] = (bytes[8] & 0x3f) | 0x80;

	const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0"));
	return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}
