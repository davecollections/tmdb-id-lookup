/**
 * Creates a builder-only internal ID with the supplied factory.
 *
 * The default deliberately has no weak fallback: an environment without
 * crypto.randomUUID must inject an ID factory instead.
 *
 * @param {() => string} [idFactory]
 * @returns {string}
 */
export function createInternalId(idFactory = defaultInternalIdFactory) {
	if (typeof idFactory !== "function") {
		throw new TypeError("idFactory must be a function");
	}

	const internalId = idFactory();
	if (typeof internalId !== "string" || internalId.length === 0) {
		throw new TypeError("idFactory must return a non-empty string");
	}

	return internalId;
}

/**
 * @returns {string}
 */
export function defaultInternalIdFactory() {
	if (typeof globalThis.crypto?.randomUUID !== "function") {
		throw new Error("crypto.randomUUID is unavailable; inject an idFactory");
	}

	return globalThis.crypto.randomUUID();
}
