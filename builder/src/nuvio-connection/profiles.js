import { isUuid, NuvioConnectionError } from "./transport.js";

export function parseNuvioAccount(value) {
	if (!isUuid(value?.id) || typeof value.email !== "string" || !value.email.trim()) throw new NuvioConnectionError("PAYLOAD");
	return Object.freeze({ id: value.id.toLowerCase(), email: value.email });
}

export function parseNuvioProfiles(value, accountId) {
	if (!Array.isArray(value)) throw new NuvioConnectionError("PAYLOAD");
	const ids = new Set();
	const slots = new Set();
	return value.map((row) => {
		if (!isUuid(row?.id) || !isUuid(row.user_id) || !Number.isInteger(row.profile_index)
			|| row.profile_index < 1 || row.profile_index > 6 || typeof row.name !== "string") throw new NuvioConnectionError("PAYLOAD");
		const id = row.id.toLowerCase();
		if (row.user_id.toLowerCase() !== accountId || ids.has(id) || slots.has(row.profile_index)) throw new NuvioConnectionError("IDENTITY");
		ids.add(id); slots.add(row.profile_index);
		const lockedUntil = row.pin_locked_until === null ? null : typeof row.pin_locked_until === "string" ? Date.parse(row.pin_locked_until) : NaN;
		const protection = typeof row.pin_enabled !== "boolean" || (lockedUntil !== null && !Number.isFinite(lockedUntil))
			|| (!row.pin_enabled && lockedUntil !== null) ? "unknown" : row.pin_enabled ? "pin" : "none";
		return Object.freeze({
			id, accountId, index: row.profile_index, name: row.name.trim() ? row.name : `Profile ${row.profile_index}`,
			// Unknown protection metadata is never treated as permission to import.
			protection, lockedUntil: Number.isFinite(lockedUntil) ? lockedUntil : null,
			version: typeof row.updated_at === "string" ? row.updated_at : null,
			avatarUrl: usableAvatarUrl(row.avatar_url),
			avatarColor: typeof row.avatar_color_hex === "string" && /^#[\da-f]{6}$/i.test(row.avatar_color_hex) ? row.avatar_color_hex : null,
		});
	});
}

export function requireSameProfile(profiles, expected, { protection = true } = {}) {
	const current = profiles.find((profile) => profile.id === expected.id);
	if (!current || current.accountId !== expected.accountId || current.index !== expected.index) throw new NuvioConnectionError("IDENTITY");
	if (protection && !sameProtection(current, expected)) throw new NuvioConnectionError("PROTECTED");
	return current;
}

export function sameProtection(left, right) {
	return left.protection === right.protection && left.lockedUntil === right.lockedUntil
		&& (left.protection !== "pin" || left.version === right.version);
}

function usableAvatarUrl(value) {
	if (typeof value !== "string" || value.length > 2048 || /\s/.test(value)) return null;
	try {
		const url = new URL(value);
		return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
	} catch { return null; }
}
