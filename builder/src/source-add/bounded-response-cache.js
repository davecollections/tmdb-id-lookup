function plainObject(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function cloneResponseData(value) {
	if (Array.isArray(value)) return value.map((entry) => cloneResponseData(entry));
	if (!plainObject(value)) return value;
	return Object.fromEntries(
		Object.entries(value).map(([key, entry]) => [key, cloneResponseData(entry)]),
	);
}

export function createBoundedResponseCache({ ttlMs, maxEntries, now = Date.now } = {}) {
	if (!Number.isFinite(ttlMs) || ttlMs < 0) throw new TypeError("A nonnegative response-cache lifetime is required.");
	if (!Number.isSafeInteger(maxEntries) || maxEntries < 1) throw new TypeError("A positive response-cache size is required.");
	if (typeof now !== "function") throw new TypeError("A response-cache clock is required.");
	const entries = new Map();

	function get(key) {
		const entry = entries.get(key);
		if (!entry) return null;
		if (now() - entry.createdAt > ttlMs) {
			entries.delete(key);
			return null;
		}
		entries.delete(key);
		entries.set(key, entry);
		return cloneResponseData(entry.data);
	}

	function set(key, data) {
		entries.delete(key);
		entries.set(key, { createdAt: now(), data: cloneResponseData(data) });
		while (entries.size > maxEntries) entries.delete(entries.keys().next().value);
	}

	return Object.freeze({ get, set });
}
